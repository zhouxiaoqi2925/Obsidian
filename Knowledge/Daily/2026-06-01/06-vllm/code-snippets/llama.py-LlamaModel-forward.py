// 来源: vllm vllm/model_executor/models/llama.py:LlamaModel.forward + LlamaDecoderLayer
// 作用: LLaMA 模型前向 — embedding + decoder × N + norm + lm_head
// 调用链: forward(input_ids, positions, kv_caches, attn_metadata) → logits
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么 vLLM 重写一遍 LLaMA (而不是直接用 HF)
//   - HF transformers: 标准 KV cache (连续显存), 不支持 PagedAttention
//   - vLLM LlamaModel: 把 attn 换成 PagedAttention (block table 寻址)
//   - 其他层 (RMSNorm, RoPE, SwiGLU) 与 HF 兼容, 数值精度一致
//   - 模型权重加载: 复用 HF checkpoint (transformers 格式)
//   - 性能: 与 HF 数值等价, 速度 6-10x
//
// [WHY-2] 整体 forward 流程
//   - input_ids (B, T) → embed_tokens → hidden_states (B, T, H)
//   - for i in range(num_layers): hidden_states = self.layers[i](...)
//   - norm (final RMSNorm) → lm_head (tied with embed) → logits (B, T, vocab)
//   - decode 阶段 T=1 (1 token), prefill 阶段 T=N (prompt 长度)
//   - 关键: positions, kv_caches, attn_metadata 是 vLLM 注入的
//
// [WHY-3] 核心组件 (按层)
//   - RMSNorm: y = x / sqrt(mean(x²) + eps) * weight
//     - 比 LayerNorm 简单 (无均值中心化), 速度快, 数值稳定
//   - RoPE (Rotary Position Embedding): 旋转位置编码
//     - 位置 m, 频率 θ_i = 1 / 10000^(2i/d)
//     - LLaMA 3: θ_base = 500000 (LLaMA 2 是 10000)
//     - 应用: (q, k) 各按位置 m 旋转 (cos/sin)
//   - SwiGLU (FFN): down(act(gate(x)) * up(x))
//     - act = SiLU (sigmoid * x)
//     - 3 个矩阵: gate_proj, up_proj, down_proj
//     - hidden_dim = 2/3 * 4 * dim (LLaMA 特殊)
//   - Grouped Query Attention (GQA): 多个 Q head 共享 1 个 KV head
//     - LLaMA-3 8B: 32 Q head, 8 KV head (4:1 共享)
//     - 显存: KV cache 4x 省
//
// [WHY-4] 关键参数
//   - num_layers: 32 (LLaMA-3 8B), 80 (LLaMA-3 70B)
//   - hidden_size: 4096 (8B), 8192 (70B)
//   - num_heads: 32 (8B), 64 (70B) — query head
//   - num_kv_heads: 8 (8B), 8 (70B) — GQA 共享
//   - head_dim: 128
//   - intermediate_size: 14336 (8B FFN 维度)
//   - vocab_size: 128256 (LLaMA-3)
//   - rope_theta: 500000.0
//   - rms_norm_eps: 1e-5
//   - tied: embed_tokens.weight = lm_head.weight (省 1× vocab × dim)
//
// [WHY-5] 数值精度优化
//   - BF16 (默认): 8 bit 指数, 7 bit 尾数, 比 FP16 范围大
//   - FP8 (H100 新): E4M3 / E5M2, 推理快 2x, 显存省 2x
//   - FP4 / INT4 (AWQ, GPTQ): 4 bit 量化, 显存省 4x, 轻微精度损失
//   - KV cache FP8: 显存省 2x (LLaMA-3 70B + 8k 上下文, KV 27GB → 13GB)
//   - chunked prefill: 长 prompt 拆块, 减少峰值显存
//   - FlashAttention 3 (H100): attn kernel 优化, 速度 +2x
// ================================================================

// === LlamaModel 顶层 ===
class LlamaModel(nn.Module):
    def __init__(self, config: LlamaConfig):
        super().__init__()
        self.config = config
        self.embed_tokens = VocabParallelEmbedding(
            config.vocab_size, config.hidden_size)
        self.layers = nn.ModuleList([
            LlamaDecoderLayer(config) for _ in range(config.num_layers)
        ])
        self.norm = RMSNorm(config.hidden_size, eps=config.rms_norm_eps)

    def forward(self, input_ids, positions, kv_caches, attn_metadata):
        # [WHY-2] 1. token id → embedding
        hidden_states = self.embed_tokens(input_ids)

        # [WHY-2] 2. N 层 decoder
        for i in range(self.config.num_layers):
            hidden_states = self.layers[i](
                positions, hidden_states, kv_caches[i], attn_metadata)

        # [WHY-2] 3. final norm
        hidden_states = self.norm(hidden_states)
        return hidden_states

// === LlamaDecoderLayer 单层 ===
class LlamaDecoderLayer(nn.Module):
    def __init__(self, config: LlamaConfig):
        super().__init__()
        # self_attn 用 PagedAttention
        self.self_attn = LlamaAttention(config)
        # FFN 用 SwiGLU
        self.mlp = LlamaMLP(config)
        # 2 个 RMSNorm (pre-norm)
        self.input_layernorm = RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self.post_attention_layernorm = RMSNorm(config.hidden_size, eps=config.rms_norm_eps)

    def forward(self, positions, hidden_states, kv_cache, attn_metadata):
        # Self-Attention + 残差
        residual = hidden_states
        hidden_states = self.input_layernorm(hidden_states)
        hidden_states = self.self_attn(
            positions, hidden_states, kv_cache, attn_metadata)
        hidden_states = residual + hidden_states

        # FFN + 残差
        residual = hidden_states
        hidden_states = self.post_attention_layernorm(hidden_states)
        hidden_states = self.mlp(hidden_states)
        hidden_states = residual + hidden_states
        return hidden_states

// === LlamaAttention: GQA + RoPE + PagedAttention ===
class LlamaAttention(nn.Module):
    def __init__(self, config: LlamaConfig):
        super().__init__()
        self.num_heads = config.num_heads
        self.num_kv_heads = config.num_kv_heads  # GQA
        self.head_dim = config.head_dim

        # Q: 所有 head
        self.q_proj = ColumnParallelLinear(
            config.hidden_size,
            self.num_heads * self.head_dim,  # 32 × 128
            bias=False)
        # K, V: 只 num_kv_heads 个 (GQA 共享)
        kv_size = self.num_kv_heads * self.head_dim  # 8 × 128
        self.k_proj = ColumnParallelLinear(config.hidden_size, kv_size, bias=False)
        self.v_proj = ColumnParallelLinear(config.hidden_size, kv_size, bias=False)
        self.o_proj = RowParallelLinear(
            self.num_heads * self.head_dim, config.hidden_size, bias=False)

        # RoPE
        self.rotary_emb = RotaryEmbedding(
            self.head_dim, max_position_embeddings, base=config.rope_theta)

    def forward(self, positions, hidden_states, kv_cache, attn_metadata):
        # [WHY-3] 1. Q/K/V projection
        q = self.q_proj(hidden_states)  # (B, T, 32 × 128)
        k = self.k_proj(hidden_states)  # (B, T, 8 × 128)  GQA
        v = self.v_proj(hidden_states)  # (B, T, 8 × 128)

        # reshape (B, T, H, D) → (B, H, T, D)
        q = q.view(-1, self.num_heads, self.head_dim)
        k = k.view(-1, self.num_kv_heads, self.head_dim)
        v = v.view(-1, self.num_kv_heads, self.head_dim)

        # [WHY-3] 2. RoPE 位置编码
        q, k = self.rotary_emb(positions, q, k)

        # [WHY-1] 3. PagedAttention — 关键优化
        # 写入新 KV 到 block table
        # 算 attention: q @ k^T / sqrt(d) → softmax → @ v
        attn_output = PagedAttention.forward(
            q, k, v, kv_cache, attn_metadata,
            self.num_heads, self.head_dim)

        # [WHY-3] 4. O projection (merge heads)
        output = self.o_proj(attn_output)
        return output

// === LlamaMLP: SwiGLU FFN ===
class LlamaMLP(nn.Module):
    def __init__(self, config: LlamaConfig):
        super().__init__()
        # [WHY-3] 3 个 projection
        self.gate_proj = MergedColumnParallelLinear(
            config.hidden_size, [config.intermediate_size, config.intermediate_size], bias=False)
        self.up_proj = ...  # 同上
        self.down_proj = RowParallelLinear(
            config.intermediate_size, config.hidden_size, bias=False)

    def forward(self, x):
        # [WHY-3] SwiGLU: down(SiLU(gate(x)) * up(x))
        gate = self.gate_proj(x)
        up = self.up_proj(x)
        # F.silu(gate) * up → down_proj
        return self.down_proj(F.silu(gate) * up)

// === RMSNorm: 比 LayerNorm 简单 ===
class RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-5):
        self.weight = nn.Parameter(torch.ones(dim))
        self.eps = eps

    def forward(self, x):
        # [WHY-3] y = x / sqrt(mean(x²) + eps) * weight
        norm_x = x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps)
        return norm_x * self.weight

// ================================================================
// 性能数据 (LLaMA-3 8B, A100 80GB, batch=32, seq=2048):
//
// [单次 forward 耗时]
//   - prefill 2048 token:  ~500ms  (Q@K^T 是 O(n²))
//   - decode 1 token:      ~20-30ms (受 batch_size 影响)
//   - decode 32 batch:     ~30ms per token (1 个 kernel)
//
// [显存占用]
//   - 模型权重 (BF16): 16GB (8B × 2 bytes)
//   - KV cache 1k token: ~1GB  (32 layer × 2 × 8 head × 128 dim × 2 bytes × 1024 token)
//   - 32 并发 × 2k token: ~64GB
//
// [GQA 收益]
//   - 32 Q head, 8 KV head (4:1 共享)
//   - KV cache 省 4x
//   - 注意力质量: 几乎无损失
//
// [BF16 vs FP8 vs INT4]
//   - BF16:  16GB 权重, 100% 精度, 1.0x 速度
//   - FP8:   8GB  权重, 99% 精度, 1.5-2.0x 速度 (H100)
//   - INT4:  4GB  权重, 95-98% 精度, 2-3x 速度 (AWQ/Marlin)
//
// 实战参数:
//   --dtype bfloat16             # 数值精度
//   --quantization awq_marlin    # 4-bit 量化
//   --kv-cache-dtype fp8         # KV cache 量化
//   --tensor-parallel-size 4     # 多卡张量并行
//   --max-model-len 8192         # 上下文长度
// ================================================================
