// 来源: vllm vllm/attention/ops/paged_attention.py:paged_attention_v1/v2
// 作用: PagedAttention CUDA kernel — 分块 KV 的 attention 计算
// 调用链: forward → paged_attention_v2 → _paged_attention_kernel (CUDA)
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么需要 PagedAttention kernel (而不是写普通 attention)
//   - 普通 attention: KV 是连续 tensor, q @ K^T 直接算
//   - PagedAttention: KV 在 block table 里, 每 block 16 token
//   - kernel 要查 block_table[seq_id][block_idx] 找物理 block
//   - 物理上不连续 → 不能用普通 GEMM
//   - 实现: 每 block 1 次小 GEMM + FlashAttention 在线 softmax
//   - 关键: block 大小选 16 (经验值, 平衡碎片和表项)
//
// [WHY-2] FlashAttention 思想 — 不用存中间 attn 矩阵
//   - 标准 attn: S = Q @ K^T, P = softmax(S), O = P @ V
//   - 问题: S 和 P 大小 O(n²), 显存爆炸
//   - FlashAttention: 增量算, 不存 S 和 P
//   - 在线 softmax: 维护 m (max) + l (sum exp), 每块更新
//   - 公式:
//     m_new = max(m_old, rowmax(S_i))
//     l_new = exp(m_old - m_new) * l_old + sum(exp(S_i - m_new))
//     O_new = exp(m_old - m_new) * O_old + softmax(S_i) @ V_i
//   - 数值: 等价于标准 attn, 显存 O(n) 而非 O(n²)
//
// [WHY-3] kernel 切分策略 (CUDA grid)
//   - grid_x = batch_size * num_heads (每个 (seq, head) 1 个 block)
//   - grid_y = ceil(max_context_len / BLOCK_SIZE) (每个 query 块)
//   - grid_z = num_kv_heads (GQA 场景)
//   - 每个 CUDA block 处理 1 个 (seq, head) 的 1 块 query
//   - 每 block 内: 加载 Q (BLOCK_N), 循环 K/V blocks (BLOCK_M = 16)
//   - 关键: K/V 加载用 __ldg (只读 cache) 优化带宽
//
// [WHY-4] block table 寻址
//   - block_table[seq_id] = [物理 block 索引列表] (e.g. [5, 12, 7, 23])
//   - 物理 KV: key_cache[block_id, token_idx_in_block, head, dim]
//   - 逻辑 → 物理: physical_block = block_table[seq_id][block_idx]
//   - 在 kernel 中: 用 __ldg 加载 K[physical_block, 0:16, head, :]
//   - 1 个 (seq, head) 完整 forward: 加载 max_context_len/16 块
//   - 关键: 跨 block 不连续 → coalesced 读要细心
//
// [WHY-5] v1 vs v2 演进
//   - v1: 简单实现, BLOCK_N = 1 (1 个 query 1 个 block), 慢
//   - v2: BLOCK_N = 16 (多 query 1 block), 提速 2-3x
//   - v2 split-kv: decode 阶段 K/V 远大于 Q, 按 K/V 切多 block 并行
//   - flashinfer 后端: 用 flashinfer 库, 性能 +20-30%
//   - flashattn-3 后端 (H100): tensor core 加速, 2x 速度
//   - 关键: vllm 0.6+ 默认 v2 + split-kv
// ================================================================

// === paged_attention_v2 入口 (Python) ===
def paged_attention_v2(
    out: torch.Tensor,           # [num_seqs, num_heads, head_size]
    query: torch.Tensor,         # [num_tokens, num_heads, head_size]
    key_cache: torch.Tensor,     # [num_blocks, block_size, num_kv_heads, head_size]
    value_cache: torch.Tensor,
    block_tables: torch.Tensor,  # [num_seqs, max_blocks] (int)
    context_lens: torch.Tensor,  # [num_seqs] (int)
    max_context_len: int,
    alibi_slopes: Optional[torch.Tensor] = None,
    softcap: float = 0.0,        # logit softcap (Gemma 2)
    scale: float = 0.0,          # 1/sqrt(head_size)
):
    # [WHY-5] v2 kernel: BLOCK_N = 16, split-kv
    # 调 CUDA kernel, 1 个 (seq, head) 1 个 block
    grid = (num_seqs, num_heads, max_num_blocks_per_seq)
    _paged_attention_kernel[grid](
        out, query, key_cache, value_cache,
        block_tables, context_lens, max_context_len,
        scale, softcap, alibi_slopes,
        BLOCK_SIZE=16,                # [WHY-1] 16 token/block
        BLOCK_N=64,                   # 1 次算 64 query
        NUM_KV_HEADS=num_kv_heads,
        HEAD_SIZE=head_size,
    )

// === _paged_attention_kernel (CUDA C++) ===
// 这是 vllm 实际的 CUDA kernel 简化版, 关键思想:
// - 每个 CUDA block 处理 1 个 (seq, head) 的 1 块 query
// - 内部循环遍历 K/V blocks, 在线 softmax
// - 关键技巧: __ldg, shared memory, warp shuffle

// 简化版伪代码 (实际是 CUDA C++):
__global__ void _paged_attention_kernel(
    float* __restrict__ out,
    const float* __restrict__ query,        // [num_tokens, num_heads, head_size]
    const float* __restrict__ key_cache,    // [num_blocks, block_size, num_kv_heads, head_size]
    const float* __restrict__ value_cache,
    const int* __restrict__ block_tables,   // [num_seqs, max_blocks]
    const int* __restrict__ context_lens,
    const float scale,
    const int max_context_len,
    const int BLOCK_SIZE = 16,
    const int BLOCK_N = 64
) {
    // 1 个 block = 1 个 (seq, head, query_block)
    int seq_id = blockIdx.x;
    int head_id = blockIdx.y;
    int kv_head_id = head_id / (num_heads / num_kv_heads);  // [WHY-3] GQA
    int query_block_idx = blockIdx.z;

    int context_len = context_lens[seq_id];
    int num_kv_blocks = ceil(context_len / BLOCK_SIZE);

    // 共享内存: 1 块 query
    __shared__ float q_smem[BLOCK_N][HEAD_SIZE];
    // 1 块 key, value
    __shared__ float k_smem[BLOCK_SIZE][HEAD_SIZE];
    __shared__ float v_smem[BLOCK_SIZE][HEAD_SIZE];

    // 加载 query 到 shared memory
    int query_start = query_block_idx * BLOCK_N;
    for (int i = threadIdx.x; i < BLOCK_N * HEAD_SIZE; i += blockDim.x) {
        int row = i / HEAD_SIZE;
        int col = i % HEAD_SIZE;
        int token_idx = query_start + row;
        if (token_idx < context_len) {
            q_smem[row][col] = query[
                token_idx * num_heads * HEAD_SIZE + head_id * HEAD_SIZE + col];
        }
    }
    __syncthreads();

    // [WHY-2] 在线 softmax 状态
    float m_i = -INFINITY;  // 当前 max
    float l_i = 0.0;         // 当前 sum exp
    float acc[BLOCK_N][HEAD_SIZE] = {0};  // 输出累加

    // 遍历所有 K/V blocks
    for (int kv_block_idx = 0; kv_block_idx < num_kv_blocks; kv_block_idx++) {
        // [WHY-4] 查 block table 找物理 block
        int physical_block = block_tables[seq_id * max_blocks + kv_block_idx];

        // 加载 K[physical_block, :, kv_head_id, :]
        for (int i = threadIdx.x; i < BLOCK_SIZE * HEAD_SIZE; i += blockDim.x) {
            int row = i / HEAD_SIZE;
            int col = i % HEAD_SIZE;
            k_smem[row][col] = key_cache[
                (physical_block * BLOCK_SIZE + row) * num_kv_heads * HEAD_SIZE
                + kv_head_id * HEAD_SIZE + col];
        }
        // 类似加载 V
        __syncthreads();

        // 算 S = Q @ K^T / sqrt(d)
        float s[BLOCK_N];
        for (int row = 0; row < BLOCK_N; row++) {
            float dot = 0;
            for (int col = 0; col < HEAD_SIZE; col++) {
                dot += q_smem[row][col] * k_smem[i][col];
            }
            s[row] = dot * scale;  // scale = 1/sqrt(head_size)
        }
        __syncthreads();

        // [WHY-2] 在线 softmax 更新
        float m_new = max(m_i, rowmax(s));
        for (int row = 0; row < BLOCK_N; row++) {
            float p = exp(s[row] - m_new);
            // acc rescale + p @ V
            for (int col = 0; col < HEAD_SIZE; col++) {
                acc[row][col] = acc[row][col] * exp(m_i - m_new)
                              + p * v_smem[i][col];
            }
        }
        l_i = exp(m_i - m_new) * l_i + rowsum(exp(s - m_new));
        m_i = m_new;
        __syncthreads();
    }

    // 写回 out
    for (int row = 0; row < BLOCK_N; row++) {
        for (int col = 0; col < HEAD_SIZE; col++) {
            out[seq_id * num_heads * HEAD_SIZE + head_id * HEAD_SIZE + col] =
                acc[row][col] / l_i;
        }
    }
}

// === vllm 0.6+ 还支持 flashinfer / flashattn-3 后端 ===
// 实际生产:
if env.VLLM_ATTENTION_BACKEND == "FLASHINFER":
    return flashinfer_paged_attention(...)  # 性能 +20-30%
elif env.VLLM_ATTENTION_BACKEND == "FLASH_ATTN_3":
    return flashattn3_paged_attention(...)  # 性能 +50-100% (H100)
// 默认 v2 + split-kv, A100 性能足够

// ================================================================
// 性能数据 (LLaMA-3 8B, A100 80GB, batch=32, seq=2048):
//
// [单次 attention 耗时]
//   - v1 (BLOCK_N=1):   ~80ms / decode step
//   - v2 (BLOCK_N=64):  ~25ms / decode step  (3x 快)
//   - v2 + split-kv:    ~18ms
//   - flashinfer 后端:  ~12ms
//   - flashattn-3 (H100): ~6ms
//
// [显存节省 vs 普通 attn]
//   - 普通 attn (标准 attn 矩阵): n² 显存
//   - PagedAttention: 不存 attn 矩阵, O(n) 显存
//   - 2048 token seq: 4MB attn → 0 (在线算)
//
// [BLOCK_SIZE 选择]
//   - BLOCK_SIZE=8:   细粒度, 表项 2x
//   - BLOCK_SIZE=16:  经验最优 (默认)
//   - BLOCK_SIZE=32:  粗粒度, 碎片多
//
// [带宽瓶颈]
//   - HBM 带宽: 3 TB/s (A100) / 3.35 TB/s (H100)
//   - decode 阶段: 加载 K/V 是带宽瓶颈
//   - BLOCK_SIZE=16: 1 块 K/V = 16 × 128 × 2 = 4KB, coalesced 读
//   - 优化: __ldg (只读 cache), L2 cache 命中
//
// 实战:
//   VLLM_ATTENTION_BACKEND=FLASHINFER  # A100 性能最优
//   VLLM_ATTENTION_BACKEND=FLASH_ATTN_3  # H100 性能最优
//   --block-size 16                     # 经验最优
//   --num-kv-cache-blocks-per-seq ...   # 控制 KV cache
// ================================================================
