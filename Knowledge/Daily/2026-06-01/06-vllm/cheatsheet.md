# 《vLLM》速查卡

> 入口在 [[README|README.md]]｜分类：AI/ML (LLM 推理)｜⭐⭐⭐⭐⭐⭐｜适用：高吞吐 LLM 推理服务 / 私有化部署

---

## 🎯 一句话价值

**PagedAttention 把 OS 虚拟内存思想搬到 GPU KV cache**，连续批处理 + prefix 共享 = 业界 LLM 推理标准 (UC Berkeley 出品)。

---

## 🧠 3 个核心洞察（必背）

1. **分页 = 碎片终结者**：固定大小 block (16 token) + block table 寻址，显存利用率从 50% → 85%+
2. **每步重调度 = GPU 利用率最大化**：Continuous Batching 不等最慢请求，吞吐 6-23x 提升
3. **Prefix Cache = 免费午餐**：相同 prefix hash 复用 KV，1k 用户共享 1k token 系统 prompt 节省 1GB

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `core/block_manager.py:_allocate_blocks` | block 分配 + SHA256 hash 去重 + refcount 跨请求共享 |
| 2 | `core/scheduler.py:schedule` | Continuous Batching 5 步 (SWAPPED → prefill → decode) + 抢占策略 |
| 3 | `model_executor/models/llama.py:LlamaModel.forward` | HF 兼容 + PagedAttention 接入 + RMSNorm + RoPE + SwiGLU + GQA |
| 4 | `attention/ops/paged_attention.py:paged_attention_v2` | FlashAttention 在线 softmax + CUDA block table 寻址 + split-kv |
| 5 | `entrypoints/llm.py:LLM.generate` | 3 层架构 (LLM/Engine/Worker) + SamplingParams + 流式 |

---

## ⚡ 性能数字 (LLaMA-3 8B, A100 80GB, batch=32, seq=2048)

| 场景 | 指标 | 数值 | 对比 |
|------|------|------|------|
| PagedAttention 显存利用率 | 利用率 | ~85% | 传统连续分配 ~50% |
| PagedAttention + prefix cache | 利用率 | ~90% | 共享 system prompt |
| Continuous Batching 吞吐 | req/s | ~1200 | HF transformers ~200 (6x) |
| Continuous Batching + cache | req/s | ~2000 | (10x) |
| TTFT (无 cache) | ms | ~100 | 1k token prefill |
| TTFT (有 cache) | ms | ~20 | 命中 prefix 5x 快 |
| ITL (decode 1 token) | ms | ~25-30 | batch 32 |
| P99 ITL | ms | ~50 | 受调度影响 |
| Block size | token | 16 | 经验最优 |
| KV cache 8B 1k token | MB | ~512 | 2 × 32 layer × 8 head × 128 dim × 2B |
| GQA 8B (4:1) | 节省 | 4x | 32 Q head / 8 KV head |

**结论**：PagedAttention + Continuous Batching + Prefix Caching = vLLM 性能黄金三角。

---

## 🌳 调度决策树

```
LLM.generate(prompts)
  ↓
LLMEngine.add_request (→ waiting queue)
  ↓
Scheduler.schedule() (每 step 调 1 次)
  │
  ├── 1. 优先恢复 SWAPPED (LRU)        ← 防饥饿
  │
  ├── 2. WAITING 中 chunked prefill    ← 长 prompt 拆块
  │   └── budget=512, 限制单次 prefill
  │
  ├── 3. RUNNING 中 decode             ← 每 seq 1 token
  │
  └── 4. 显存不够 → preempt
        ├── swap mode:    KV 写 CPU RAM
        └── recompute:    丢弃, 恢复时重算
  ↓
Worker.execute_model (→ model.forward → PagedAttention)
  ↓
SamplingParams.sample (greedy/temp/top_p)
  ↓
finish_reason? (stop / length / eos) → output_queue
```

### Block 分配路径

```
Sequence 需 N 个新 block
  ↓
对每个 block:
  ├── SHA256(prev_hash + tokens) → hash
  ├── hash 命中 prefix_cache?  → refcount++, 复用
  └── 未命中                    → 分配新物理 block, 缓存
  ↓
BlockTable.append(physical_block)
```

---

## 🚀 命令分组速查

### 服务部署
```bash
# 单卡 (开发)
vllm serve meta-llama/Llama-3-8B-Instruct \
  --host 0.0.0.0 --port 8000 \
  --gpu-memory-utilization 0.9

# 多卡张量并行
vllm serve meta-llama/Llama-3-70B-Instruct \
  --tensor-parallel-size 4 \
  --gpu-memory-utilization 0.95

# OpenAI 兼容 API
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "...", "messages": [{"role": "user", "content": "Hi"}]}'
```

### Python API
```python
from vllm import LLM, SamplingParams

llm = LLM(
    model="meta-llama/Llama-3-8B-Instruct",
    tensor_parallel_size=1,
    gpu_memory_utilization=0.9,
    max_model_len=4096,
    enable_prefix_caching=True,  # ★ 开 prefix cache
)

params = SamplingParams(temperature=0.7, top_p=0.9, max_tokens=256)

# 1. 批量
outputs = llm.generate(["Hello", "World"], params)

# 2. 流式
for output in llm.generate(["..."], params, stream=True):
    print(output.outputs[0].text, end="", flush=True)
```

### 性能调优
```bash
# 关键参数
--block-size 16                   # 物理 block 大小
--max-num-batched-tokens 2048     # 单 step token 上限
--max-num-seqs 256                # 并发 seq 上限
--max-model-len 4096              # 上下文长度
--gpu-memory-utilization 0.9      # KV cache 占比

# 调度
--enable-chunked-prefill          # 长 prompt 拆块 (默认开)
--swap-space 4                    # CPU swap 大小 (GB)
--preemption-mode recompute       # 抢占策略

# 量化
--quantization awq_marlin         # 4-bit 量化 (AWQ)
--quantization gptq_marlin        # 4-bit 量化 (GPTQ)
--kv-cache-dtype fp8              # KV cache FP8

# 后端
VLLM_ATTENTION_BACKEND=FLASHINFER # A100 性能最优
VLLM_ATTENTION_BACKEND=FLASH_ATTN_3  # H100 性能最优
```

### 监控指标
```bash
curl localhost:8000/metrics | grep vllm
# 关键指标:
# - vllm:num_requests_waiting
# - vllm:num_requests_swapped
# - vllm:num_preemptions_total
# - vllm:gpu_cache_usage_perc
# - vllm:cpu_cache_usage_perc
# - vllm:prompt_tokens_total
# - vllm:generation_tokens_total
```

---

## 📊 推理性能对比 (LLaMA-3 8B, A100 80GB, 1000 req/10min)

| 框架 | 吞吐 (req/s) | P99 latency | 显存利用率 |
|------|-------------|-------------|-----------|
| HF transformers (static) | ~200 | ~5000ms | ~50% |
| TGI (HuggingFace) | ~600 | ~1500ms | ~70% |
| vLLM 0.5 | ~1000 | ~800ms | ~80% |
| **vLLM 0.6 (PagedAttn)** | **~1200** | **~500ms** | **~85%** |
| vLLM + prefix cache | ~2000 | ~200ms (cached) | ~90% |
| vLLM + FlashInfer | ~2400 | ~400ms | ~85% |
| vLLM + FlashAttn-3 (H100) | ~3600 | ~250ms | ~85% |

---

## ⚠️ 必避 6 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **OOM** | OutOfMemoryError: CUDA | 减 --max-num-seqs / 启用 --quantization |
| **prefix cache 没生效** | 系统 prompt 每次重算 | 检查 --enable-prefix-caching / prompt 模板一致 |
| **吞吐上不去** | GPU util < 50% | 开 chunked prefill / 调大 batched_tokens |
| **slow decode** | 单 token > 100ms | 减 max_num_seqs / 量化生效没 |
| **PagedAttention 报错** | block 数对不上 | 升级 vllm, 检查 prefix sharing 配置 |
| **OOM swap 严重** | num_preemptions 飙升 | 减并发 / 加显存 / 调小 max-model-len |

### 4 个隐藏坑

- **`--gpu-memory-utilization` 太高 (>0.95)**：留 5% 给 activations / CUDA context
- **没用 chunked prefill**：长 prompt 独占 GPU 几秒, 短请求饥饿
- **GQA 模型配错 num_kv_heads**：attention kernel 走慢路径
- **KV cache 不量化**：H100 上 FP8 KV 能省 2x 显存

---

## 🔄 vLLM vs 其他推理框架

| 维度 | vLLM | TGI | HF transformers | TensorRT-LLM |
|------|------|-----|-----------------|---------------|
| 显存管理 | PagedAttention | 连续 | 连续 | Paged |
| 批处理 | Continuous | Continuous | Static | Continuous |
| Prefix cache | ✅ | ✅ | ❌ | ❌ |
| 量化 | AWQ/GPTQ/FP8 | AWQ/GPTQ | ❌ (需 bitsandbytes) | INT4/INT8/FP8 |
| 引擎 | Python | Rust | Python | C++/CUDA |
| 上手 | 简单 | 中等 | 简单 | 难 |
| 峰值吞吐 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 自定义 kernel | flashinfer | xformers | ❌ | triton |
| 多模态 | ✅ | ✅ | ✅ | ✅ |
| 适用 | 通用 LLM 推理 | HF 生态 | 原型 | NVIDIA 极致性能 |

---

## 🧩 可复用模式

| 模式 | vLLM 怎么实现 | 我能用到哪 |
|------|--------------|----------|
| **Paged 内存管理** | block table + hash 去重 | 任何大对象池 (DB connection, file handle) |
| **Continuous Batching** | 每 step 重选 seq | 任何流式批处理 (gRPC server, image inference) |
| **Prefix 缓存** | SHA256 hash 查 block | 任何有重复模板的系统 (RAG, system prompt) |
| **Swap/Recompute** | OOM 时二选一 | 任何资源紧张场景 (cache eviction) |
| **Chunked prefill** | 长 prompt 拆块 | 任何"大任务 + 小任务" 公平调度 |
| **GQA 共享 KV** | 多个 Q head 共享 1 KV head | 任何 attention 优化 (内存换计算) |
| **FlashAttention 在线 softmax** | 增量算 m+l | 任何长序列 attention 场景 |

→ 模式 A-D 详细见 `deep-dive.md 专题 8`

---

## 📋 反思：vLLM 让我重新思考的 5 件事

1. **OS 的思想可以跨域借鉴**。PagedAttention 直接搬虚拟内存，一举解决显存碎片。
2. **等最慢的请求 = 浪费**。每步重调度 = 公平 + 高效。
3. **KV cache 是 LLM 推理的最大成本**。优化它的结构 = 优化推理。
4. **Prefix sharing 是巨大的"免费午餐"**。系统 prompt 不变 = 永不重算。
5. **论文 → 代码 → 生产的速度**。PagedAttention 论文 (2023.06) → vLLM 0.4 → 业界标准，6 个月。

---

## ✅ 我能马上用的 3 件事

- [ ] 部署 vLLM serve, 配 prefix caching, 测 system prompt 加速
- [ ] 用 `--quantization awq_marlin` 跑 4-bit 量化 8B 模型, 看显存减半
- [ ] 用 `VLLM_ATTENTION_BACKEND=FLASHINFER` 替换默认后端, 测 P99 latency

---

## 🔗 跨项目引用

- `[[../01-etcd/README|etcd]]` — 调度器思想 (Lease / Watch 异步) 启发 vLLM step 循环
- `[[../02-redis/README|Redis]]` — KV cache 的 hash 结构 (rehash) 启发 PagedAttention block 寻址
- `[[../03-kubernetes/README|k8s]]` — Deployment + HPA 模式直接套 vLLM (HPA 看 num_requests_waiting)
- `[[../04-postgres/README|postgres]]` — buffer pool 分页思想 (8KB page) = PagedAttention block
- `[[../05-golang/README|golang]]` — goroutine 调度 + channel 思想启发 vLLM Continuous Batching

---

## 📚 进一步阅读

- 源码: https://github.com/vllm-project/vllm
- 论文 PagedAttention: https://arxiv.org/abs/2309.06180
- 论文 vLLM 整体: https://arxiv.org/abs/2310.01889
- 文档: https://docs.vllm.ai/
- 性能 blog: https://blog.vllm.ai/
- 实战: https://github.com/vllm-project/vllm/tree/main/examples
- `deep-dive.md` — 16 专题深度解析
- `code-snippets/` — 5 段必读代码 (170-280 行/段, 完整函数 + 5 WHY + 性能数据)
