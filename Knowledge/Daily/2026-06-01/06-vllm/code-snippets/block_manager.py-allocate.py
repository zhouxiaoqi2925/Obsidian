# 来源: vllm vllm/core/block_manager.py:BlockManager + _allocate_blocks
# 作用: PagedAttention block 分配 — 把 OS 虚拟内存思想搬到 GPU KV cache
# 调用链: add_seq → can_append → _allocate_blocks → BlockTable.append
# ================================================================
# 关键点 (WHY):
#
# [WHY-1] 为什么需要分页 (PagedAttention)
#   - 传统 KV cache: 连续显存分配 (e.g. 8 token = 8 × 16KB = 128KB)
#   - 问题 1: 外部碎片 (2 个 128KB 中间剩 64KB, 64KB 请求分配不到)
#   - 问题 2: 显存浪费 (按最大长度预分配, 实际只用了 60%)
#   - 问题 3: 显存预留 (大模型 H100 80GB 装不下 7B 全长)
#   - 解决: 固定大小 block (16 token), 按需分配, 跨请求共享 prefix
#   - 类比: 操作系统虚拟内存 (4KB page) + 页表
#
# [WHY-2] Block 内部结构
#   - block_size = 16 (token 数) — 经验值, 平衡碎片和表项
#   - 每个 block: block_id (物理 block 编号)
#   - LogicalBlock → PhysicalBlock: hash 映射 + refcount
#   - KV cache 存: (block_id, token_offset_in_block) → 物理显存
#   - block 0 装 token 0-15, block 1 装 token 16-31, ...
#
# [WHY-3] Hash 去重 (Prefix Caching) 的实现
#   - 算 prefix 的 SHA256 hash: hash = sha256([token_0, ..., token_15])
#   - 查 hash 表: 已存在 → 复用物理 block (refcount++)
#   - 不存在 → 分配新物理 block, 存到 hash 表
#   - 系统 prompt 1k token = 1k/16 = 63 个 block
#   - 1k 用户共享同一系统 prompt → 节省 63 × 16KB × 1000 = 1GB
#   - 配合 --enable-prefix-caching, 自动启用
#
# [WHY-4] 分配/释放时机
#   - 分配: can_append → 检查需 N blocks, 调 _allocate_blocks
#   - 释放: request 完成 (finish_reason=stop/length) → 遍历 block table, refcount--, 为 0 时归还 allocator
#   - copy-on-write: beam search 复制, refcount 管理
#   - 抢占: 长请求 OOM → 抢占低优先级, 释放 block, 后续 resume
#
# [WHY-5] 性能数字 (LLaMA-3 8B, batch=32, seq=2048)
#   - block_size=16: 显存利用率 ~85% (传统 ~50%)
#   - prefix caching: 重复 prompt 节省 60-90% 首 token 延迟
#   - 分配速度: O(1) (固定 block 池, 只更新 bitmap)
#   - 实际意义: H100 80GB 跑 32 并发 (传统 8-10)
# ================================================================

# === 关键数据结构 ===
class Block:
    """一个物理 block (16 token 的 KV cache)"""
    def __init__(self, block_id: int, block_size: int):
        self.block_id = block_id           # 物理 block 编号
        self.block_size = block_size       # 16 (token 数)
        self.ref_count = 1                 # 引用计数 (beam search 共享)
        # GPU 上的 KV tensor 实际在 allocator 管理
        # logical_blocks[seq_id][block_idx] → Block

class LogicalBlock:
    """逻辑 block — 序列视角的"虚拟地址" """
    def __init__(self):
        self.content_hash: Optional[str] = None  # SHA256(16 token 序列)
        self.block: Optional[Block] = None       # 指向物理 block
        self.is_full: bool = False               # 16 token 装满?

# === BlockManager: 全局 block 管理 ===
class BlockManager:
    def __init__(self, block_size: int, num_gpu_blocks: int):
        self.block_size = block_size
        # 物理 block 池
        self.gpu_allocator = BlockAllocator(num_gpu_blocks)
        # prefix cache: 内容 hash → 物理 block
        self.prefix_cache: Dict[str, Block] = {}
        # seq_id → BlockTable
        self.block_tables: Dict[int, List[Block]] = {}

    def _allocate_blocks(self, seq: Sequence, num_blocks: int):
        """为 sequence 分配 num_blocks 个新 block"""
        for _ in range(num_blocks):
            # 1. 算 logical block 的内容 hash
            content_hash = self._compute_hash(seq, last_block_tokens)

            # [WHY-3] 2. 查 prefix cache
            if content_hash in self.prefix_cache:
                # 命中: 复用物理 block
                block = self.prefix_cache[content_hash]
                block.ref_count += 1  # refcount++ 跨请求共享
            else:
                # 未命中: 分配新物理 block
                block = self.gpu_allocator.allocate()
                block.ref_count = 1
                # 缓存到 prefix cache
                self.prefix_cache[content_hash] = block

            # 3. 加到 sequence 的 block table
            self.block_tables[seq.seq_id].append(block)

    def can_append(self, seq_group: SequenceGroup) -> bool:
        """检查能否 append 新 token (可能需要新 block)"""
        # [WHY-4] 算需要几个新 block
        blocks_needed = self._get_num_blocks_needed(seq_group)
        return blocks_needed <= self.gpu_allocator.get_num_free_blocks()

    def _get_num_blocks_needed(self, seq_group) -> int:
        """需要几个 block = ceil(total_tokens / block_size) - allocated"""
        seq = seq_group.get_seqs()[0]  # 取第一个 seq
        total_tokens = seq.get_len()
        allocated = len(self.block_tables[seq.seq_id])
        needed = (total_tokens + self.block_size - 1) // self.block_size
        return needed - allocated

    def free(self, seq_id: int):
        """请求完成, 释放所有 block"""
        for block in self.block_tables.pop(seq_id):
            block.ref_count -= 1
            if block.ref_count == 0:
                # refcount=0, 物理 block 真正释放
                self.gpu_allocator.free(block)
                # prefix cache 还保留, 后续请求可能复用
                # (LRU 淘汰由 cache_manager 处理)

    def _compute_hash(self, seq: Sequence, tokens: List[int]) -> str:
        """算 block 的内容 hash (用于 prefix 去重)"""
        # 把 16 token 序列 encode 成 SHA256
        # 实际: 加上 parent block hash 形成 hash chain
        # 防止两个不同 block 内容相同但前缀不同误判
        prev_hash = self.block_tables[seq.seq_id][-1].content_hash if ... else ""
        return hashlib.sha256(
            f"{prev_hash}:{tokens}".encode()
        ).hexdigest()

# === BlockAllocator: 物理 block 池 ===
class BlockAllocator:
    def __init__(self, num_blocks: int):
        # 简化: 用 bitmap 跟踪空闲
        self.free_blocks: Set[int] = set(range(num_blocks))
        # 实际 vLLM 用更复杂的机制 (CachingAllocator, 处理碎片)

    def allocate(self) -> Block:
        block_id = self.free_blocks.pop()  # O(1)
        return Block(block_id=block_id, block_size=16)

    def free(self, block: Block):
        self.free_blocks.add(block.block_id)

    def get_num_free_blocks(self) -> int:
        return len(self.free_blocks)

# === 实际 PagedAttention 物理显存布局 ===
#
# GPU 显存 (H100 80GB, 假设 8B 模型 + 32 并发)
# ├─ Model weights: 16GB  (LLaMA-3 8B fp16)
# ├─ Activations:   4GB   (中间计算)
# ├─ KV cache pool: 50GB  (block_size=16, ~12K blocks)
# └─ Buffer:        10GB
#
# KV cache 物理布局:
# block 0:  [K_layer0, V_layer0, K_layer1, V_layer1, ..., K_layer31, V_layer31]
#           (每层 16 token 的 K+V tensor, ~16KB)
# block 1:  [K, V, K, V, ...]
# block 2:  ...
#
# Logical → Physical 映射 (BlockTable):
# seq_42: [block 5, block 12, block 7, block 23]  # 不连续!
# 注意: 逻辑上连续, 物理上分散 → 解决外部碎片

# ================================================================
# 性能数据 (LLaMA-3 8B, A100 80GB, batch=32, avg_seq=2048):
#
# [显存利用率]
#   - 传统连续分配:   ~50% (碎片 + 预分配浪费)
#   - PagedAttention: ~85% (固定 block)
#   - + prefix cache: ~90% (共享)
#
# [吞吐量]
#   - 传统 (HuggingFace transformers): 200 req/s
#   - vLLM (PagedAttention):          1200 req/s  (6x)
#   - vLLM + prefix cache:            2000 req/s  (10x)
#
# [首 token 延迟]
#   - 无 cache: 100ms
#   - 有 cache (系统 prompt 命中): 20ms  (5x 快)
#
# 关键阈值:
#   - block_size=16: 经验最优 (碎片 vs 表项)
#   - block_size=8:  更细粒度, 表项多 2x
#   - block_size=32: 碎片多 2x
#
# 实战:
#   --block-size 16                    # 默认
#   --enable-prefix-caching            # 开启 prefix 共享
#   --max-num-seqs 256                 # 最大并发
#   --gpu-memory-utilization 0.9       # KV cache 占比
#
# 监控:
#   - vllm:gpu_cache_usage_perc         # KV cache 使用率
#   - vllm:num_requests_waiting         # 等待调度数
#   - vllm:num_requests_swapped         # 被抢占数
#   - vllm:kv_cache_usage_perc          # KV cache 占比
# ================================================================


// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: Block 大小选择的 5 大权衡]
//   - block_size=4:   极细粒度, 碎片最少, 但 BlockTable 表项 4x
//   - block_size=8:   细粒度, 适合长 prompt + 短生成
//   - **block_size=16: 经验最优** (LLaMA-3 8B 测得)
//   - block_size=32:  粗粒度, 表项少, 但碎片 +5-10%
//   - block_size=64:  显存利用率下降 ~3-5%, 命中率低
//
// [案例 2: Prefix Cache 命中与未命中的对比]
//   - 未命中: 系统 prompt 1k token = 63 blocks 全新分配 + 计算
//     首 token 延迟: 100ms (A100)
//   - 命中: 63 blocks 复用 (refcount++), 直接进入 prefill
//     首 token 延迟: 20ms (5x 快)
//   - 命中条件: SHA256 hash 全等 (含 parent chain hash)
//
// [案例 3: Copy-on-Write 在 Beam Search 的应用]
//   - beam_width=4 时, 4 个候选共享 prefix blocks
//   - 在分歧 token 才开始各自分配新 block
//   - 节省: 共享 90%+ blocks, 显存 4x → 1.1x
//   - refcount 管理: 分叉时 refcount--, 独立时 refcount=1
//
// [案例 4: 抢占 (Preemption) 处理流程]
//   - 触发: 高优先级请求到达, KV 不足
//   - 步骤 1: 选低优先级 seq_group (FCFS / priority)
//   - 步骤 2: recompute mode → 释放 blocks, 重新计算时重建
//   - 步骤 3: swap mode → 拷到 CPU mem, resume 时换回
//   - 监控: vllm:num_requests_swapped
//
// [案例 5: 显存分配 OOM 的 5 大调优]
//   - 1) --gpu-memory-utilization 0.9 → 0.95
//   - 2) --max-num-seqs 256 → 128 (降并发)
//   - 3) --block-size 16 → 32 (粗粒度)
//   - 4) 开启 prefix caching → 共享节省
//   - 5) 用 LLaMA-3 8B 替代 70B (模型压缩)
//
// [案例 6: 5 大 Block 操作的时间复杂度]
//   - 分配 (allocate):       O(1) (pop free_blocks set)
//   - 释放 (free):           O(1) (add to free_blocks)
//   - 哈希查找 (hash lookup): O(1) (dict 查找)
//   - BlockTable.append:     O(1)
//   - rehash (prefix 淘汰):  O(k) (k = 淘汰 blocks)
//
// [案例 7: Prefix Cache 淘汰策略 (LRU)]
//   - 触发: prefix_cache 大小 > 阈值 (默认 100% GPU KV)
//   - 淘汰: refcount=0 的 blocks, 按 LRU 顺序
//   - 监控: vllm:prefix_cache_hits / vllm:prefix_cache_queries
//   - 命中率 < 50% → 考虑调大 cache 或换策略
//   - 命中率 > 90% → 系统 prompt 场景, 效果显著
//
// [案例 8: 多 GPU 场景的 Block 分布]
//   - tensor_parallel: 每张卡有独立 block 池
//   - pipeline_parallel: 同上, 各阶段独立
//   - 数据并行 (vLLM 不原生支持): 用 router 分发
//   - 监控: 每张卡的 vllm:gpu_cache_usage_perc
//
// [案例 9: 长 prompt (32k token) 实战]
//   - 系统 prompt 32k = 2000 blocks × 16KB = 32MB
//   - 100 用户共享 → 节省 3.2GB 显存
//   - 首 token 延迟: 500ms (无 cache) → 50ms (有 cache)
//   - 注意: 长 prompt 哈希计算本身耗时 ~10ms
//
// [案例 10: 5 大生产环境监控指标]
//   - vllm:gpu_cache_usage_perc   (KV cache 占用, < 90%)
//   - vllm:num_requests_waiting   (排队请求, < 10)
//   - vllm:num_requests_swapped   (被抢占数, 0)
//   - vllm:prefix_cache_hit_rate  (命中率, > 50%)
//   - vllm:cpu_prefix_cache_hit_rate  (CPU 层命中率)
// ============================================================
