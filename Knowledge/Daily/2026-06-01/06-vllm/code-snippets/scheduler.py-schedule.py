// 来源: vllm vllm/core/scheduler.py:Scheduler.schedule + _schedule_chunked_prefill + _schedule_decode
// 作用: 调度主循环 — 决定本 step 哪些 seq 参与 forward
// 调用链: Engine.step → Scheduler.schedule → (prefill + decode) → ModelExecutor.execute_model
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么需要"每步重调度" (Continuous Batching)
//   - Static Batching: 等所有 seq 跑完才返回 → GPU 空等最慢请求
//   - Continuous Batching: 每 step 重新选 seq → 不空等
//   - 论文数据: 23x 吞吐提升 (vs HF generate), P99 latency 改善 5-10x
//   - 关键: 完成一个 token 立即让出 slot 给新请求
//   - 类比: OS 进程调度 (时间片) — 每个 step 是 1 个时间片
//
// [WHY-2] 三状态机 WAITING/RUNNING/SWAPPED
//   - WAITING: 新请求, 等算 prefill (进队列等调度)
//   - RUNNING: 正在 GPU 上 decode
//   - SWAPPED: OOM 时 KV 写到 CPU RAM, 等有空闲再恢复
//   - 三状态循环: 调度器根据显存/优先级选下一个 RUNNING
//   - 抢占 (preemption): 显存不够时把低优先级 SWAP OUT
//   - 恢复: 显存有空闲时 SWAP IN, 重新分配物理 block
//
// [WHY-3] 调度 5 步 (优先级)
//   - 1) 优先恢复 SWAPPED (LRU 顺序, 防饥饿)
//   - 2) 新请求进 WAITING
//   - 3) WAITING 中可调度的: 预填 (chunked prefill, 长 prompt 拆块)
//   - 4) RUNNING 中可继续的: decode (每 seq 1 token)
//   - 5) 检查显存, 不够就 preempt 几个 (swap vs recompute)
//   - 调度 1 个 step 同时返回 prefill seqs + decode seqs
//   - chunked prefill: 限制单次 prefill token 数 (e.g. 512), 不让长 prompt 独占
//
// [WHY-4] 抢占策略: swap vs recompute
//   - swap: KV cache dump 到 CPU RAM (4GB swap space), 恢复时 reload
//     - 优点: 恢复快, 不重算
//     - 缺点: 占用 CPU 内存, 传输带宽 (PCIe 32GB/s)
//   - recompute: 丢弃 KV, 恢复时重算 prefill
//     - 优点: 省 CPU 内存
//     - 缺点: 重算慢 (prefill 是 O(n²))
//   - 启发式: long prefill 选 recompute, short prefill 选 swap
//   - vllm 默认 recompute (实现简单)
//
// [WHY-5] 调度决策对性能的影响
//   - 调度频率: 每 step (10-50ms) 1 次, 调度器本身开销 < 1ms
//   - 公平性: 避免长 prompt 饥饿短请求 (chunked prefill 解决)
//   - 优先级: 可以按 user/slo 排序 (e.g. paid > free)
//   - 实测: 调度策略对了, 吞吐 +20-30%
//   - 监控: vllm:num_preemptions_total, vllm:num_requests_swapped
// ================================================================

// === Scheduler 主类 ===
class Scheduler:
    def __init__(self, scheduler_config, cache_config, lora_config):
        self.scheduler_config = scheduler_config
        self.cache_config = cache_config
        # 等待队列 (新请求)
        self.waiting: List[SequenceGroup] = []
        # 运行队列 (decode)
        self.running: List[SequenceGroup] = []
        # 抢占队列 (CPU RAM)
        self.swapped: List[SequenceGroup] = []
        # 物理 block 管理
        self.block_manager = BlockAllocator(...)
        # 统计
        self.num_preemptions = 0

    def schedule(self) -> Tuple[SchedulerOutputs, SchedulerOutputs]:
        """每 step 调一次: 决定本轮谁 prefill, 谁 decode"""
        # [WHY-3] 步骤 1: 优先恢复 SWAPPED
        seq_groups = self._schedule_swapped()  # LRU 顺序

        # [WHY-3] 步骤 2-3: chunked prefill
        # 新请求 + WAITING 队列, 按 chunk_size 切分
        # 长 prompt (e.g. 4k) 拆成 8 块, 每 step 算 1 块 + decode
        prefill_seq_groups = self._schedule_chunked_prefill(
            budget=chunked_prefill_budget  # e.g. 512 tokens
        )

        # [WHY-3] 步骤 4: decode (RUNNING 中继续的)
        decode_seq_groups = self._schedule_decode()

        # 合并
        scheduled = prefill_seq_groups + decode_seq_groups
        return SchedulerOutputs(
            scheduled_seq_groups=scheduled,
            preempted_seq_groups=preempted,  # 被抢占的
            ignored_seq_groups=ignored,       # 显存不够
        )

    def _schedule_chunked_prefill(self, budget: int) -> List[SequenceGroup]:
        """[WHY-3] chunked prefill — 把长 prompt 拆块"""
        scheduled = []
        remaining_budget = budget
        for seq_group in self.waiting:
            if remaining_budget <= 0:
                break
            # 检查能分配 block 不
            num_new_tokens = seq_group.get_num_uncomputed_tokens()
            if num_new_tokens > remaining_budget:
                # 长 prompt: 只算 1 块, 剩下的下个 step
                num_new_tokens = remaining_budget
                seq_group.set_prefill_chunk(num_new_tokens)
            # 调 block_manager 分配
            if self.block_manager.can_append(seq_group, num_new_tokens):
                self._allocate_and_set_running(seq_group)
                scheduled.append(seq_group)
                remaining_budget -= num_new_tokens
        return scheduled

    def _schedule_decode(self) -> List[SequenceGroup]:
        """[WHY-3] decode — RUNNING 队列每 seq 算 1 token"""
        scheduled = []
        for seq_group in self.running:
            # decode 1 token 最多需要 1 个新 block
            if self.block_manager.can_append(seq_group, 1):
                scheduled.append(seq_group)
            else:
                # [WHY-4] 显存不够 → 抢占
                preempted = self._preempt(seq_group)
                self.swapped.extend(preempted)
        return scheduled

    def _preempt(self, seq_group: SequenceGroup):
        """[WHY-4] 抢占: 把低优先级 seq 移出 RUNNING"""
        self.num_preemptions += 1
        if self.scheduler_config.preemption_mode == "swap":
            # 写 KV 到 CPU RAM
            self.block_manager.swap_out(seq_group)
            self.swapped.append(seq_group)
        else:  # recompute
            # 释放 block, 后续重算
            self.block_manager.free(seq_group)
            self.waiting.append(seq_group)  # 退回 WAITING
        self.running.remove(seq_group)
        return [seq_group]

// ================================================================
// 性能数据 (LLaMA-3 8B, A100 80GB, batch=32, avg_seq=2048):
//
// [调度频率]
//   - 每 step 调 1 次 schedule()
//   - step 间隔: ~10-50ms (decode 1 token)
//   - 调度开销: < 1ms (单纯 list 操作 + block 检查)
//
// [吞吐对比]
//   - HF transformers (static batching):  ~200 req/s
//   - vLLM 0.6 (continuous batching):    ~1200 req/s  (6x)
//   - vLLM 0.6 + prefix cache:           ~2000 req/s  (10x)
//
// [TTFT (Time To First Token)]
//   - 无 cache:        100ms (算 prefill)
//   - 有 cache (1k):   20ms  (5x 快)
//
// [P99 ITL (Inter-Token Latency)]
//   - 调度前:  50-100ms (受最慢请求影响)
//   - 调度后:  10-30ms (独立运行)
//
// [抢占率]
//   - 显存充足: 0%
//   - 高并发:  5-15% (需要调 --max-num-seqs)
//
// 关键参数:
//   - --max-num-batched-tokens 2048  # 单 step token 上限
//   - --max-num-seqs 256            # 并发 seq 上限
//   --enable-chunked-prefill       # 长 prompt 拆块 (默认开)
//   --swap-space 4                 # CPU swap 大小 (GB)
//
// 监控:
//   - vllm:num_requests_waiting     # 等待调度数
//   - vllm:num_requests_swapped     # 抢占数
//   - vllm:num_preemptions_total    # 累计抢占
//   - vllm:gpu_cache_usage_perc     # KV cache 占比
//
// 实战调优:
//   1. 监控 preemptions, 高 → 减 max_num_seqs
//   2. 监控 waiting, 持续高 → 加 Pod (k8s 扩缩)
//   3. chunked prefill budget: 默认 512, 调大提升公平性, 调小提升 P99
// ================================================================



// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: 调度策略 5 大对比]
//   - FCFS (先来先服务):  简单, 但长 prompt 阻塞短请求
//   - Priority:           按 priority 字段, 可能饥饿
//   - SJF (短作业优先):   优化平均延迟, 但长请求饥饿
//   - **Continous Batching**: vLLM 默认, token-level 抢占
//   - Chunked Prefill:    把 prefill 拆 chunk, 混合 decode
//
// [案例 2: 5 大调度阶段详解]
//   - 1) add_request:       加入 waiting queue
//   - 2) schedule:         选 batch (waiting + running)
//   - 3) prefill:          长 prompt 一次性算 KV
//   - 4) decode:           每步生成 1 token
//   - 5) finish:           释放 block, 出 running queue
//
// [案例 3: Chunked Prefill 的 5 大优势]
//   - 1) 降首 token 延迟:  长 prompt 不阻塞短请求
//   - 2) 高吞吐:          混合 batch 利用率 +20%
//   - 3) 公平:            短请求不必等长 prefill
//   - 4) 显存友好:        prefill chunk = decode block size
//   - 5) 监控:            vllm:num_preemptions
//
// [案例 4: 抢占策略的 5 大决策点]
//   - 1) 触发: KV 不足, 新请求需 block
//   - 2) 选 victim:        running 中优先级最低
//   - 3) Recompute mode:   释放 blocks, 后续重算
//   - 4) Swap mode:        拷到 CPU, 后续换回
//   - 5) 监控:            vllm:num_requests_swapped
//
// [案例 5: 调度延迟的 5 大瓶颈]
//   - 1) 长 prefill:        首 token 延迟 +500ms
//   - 2) 抢占频繁:        吞吐 -30%
//   - 3) Batch 不均:       GPU 利用率 < 50%
//   - 4) Python GIL:       调度开销 ~10μs/request
//   - 5) 同步阻塞:        tokenizer / detokenizer
//
// [案例 6: 5 大调度优化实战]
//   - 1) --max-num-seqs 256:   控制 batch 大小
//   - 2) --max-num-batched-tokens 2048: 限制单 batch token
//   - 3) --enable-chunked-prefill:  开启 chunked prefill
//   - 4) --swap-space 4:        CPU swap 空间 (GB)
//   - 5) --num-lookahead-slots:  speculative decoding
//
// [案例 7: Speculative Decoding 与调度协同]
//   - 思路: 1 步预测 k 个 token, 验证
//   - 命中率 50% → 1.5x 加速
//   - 调度: 把 draft + verify 一起调度
//   - 配置: --speculative-model [draft_model]
//   - 监控: vllm:spec_decode_acceptance_rate
//
// [案例 8: 5 大调度监控指标 (PromQL)]
//   - vllm:num_requests_running{round=10}  # 当前 batch
//   - vllm:num_requests_waiting            # 排队
//   - vllm:time_to_first_token_seconds     # 首 token P99
//   - vllm:time_per_output_token_seconds   # 后续 token
//   - vllm:gpu_cache_usage_perc            # KV 占用
//
// [案例 9: 高并发场景 (1k QPS) 调优]
//   - 问题: 1k 请求/s, GPU 80%, 排队 > 100
//   - 排查: vllm:num_requests_waiting 持续高
//   - 调优: --max-num-seqs 512 (翻倍 batch)
//   - 调优: --gpu-memory-utilization 0.95
//   - 调优: 开启 prefix caching
//   - 调优: 多 GPU (tensor_parallel_size=2)
//
// [案例 10: 调度公平性 5 大策略]
//   - 1) 优先级队列:  priority 字段, 1-10
//   - 2) 老化 (aging): 低优先级等待久 → 提升
//   - 3) 令牌桶:       限流防滥用
//   - 4) 公平份额:     多租户按比例分配
//   - 5) SLO 感知:     按截止时间调度
// ============================================================