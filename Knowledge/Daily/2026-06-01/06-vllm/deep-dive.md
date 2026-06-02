# vLLM 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：PagedAttention 思想 — 借鉴 OS 虚拟内存

### 传统 KV cache 的痛点
```
Seq 1: [tok1 tok2 ... tok512      ]  连续 512 token
Seq 2: [tok1 tok2 ... tok1023     ]  连续 1023 token
```
- 显存碎片：512+1023 = 1535 槽，但申请 2 段连续显存 = 失败
- 显存浪费：seq 短了，多余的 100 槽空着
- 不同 seq 不能共享 prefix

### OS 虚拟内存的启示
```
进程视角: 连续虚拟地址
   ↓  页表 (页号 → 物理页)
物理内存: 分散的页帧
```

### PagedAttention = 同样的思路
```
Seq 视角: 连续 logical KV cache
   ↓  block table (逻辑 block → 物理 block)
物理显存: 分散的 block (每 block 16 token)
```

### 三大收益
1. **碎片消失**：block 固定大小，物理上随便放
2. **共享 prefix**：相同 prefix 共享同一组物理 block，hash 查重
3. **显存满时再分配**：不用预留

---

## 专题 2：Continuous Batching（连续批处理）

### Static Batching 的痛
```
请求 A: 100 token prompt, 200 token output, 总 300 step
请求 B: 50 token prompt, 10 token output, 总 60 step
Static: 等 A 跑完再算 B → GPU 100 step 浪费
```

### Continuous Batching
```
Step 1: [A B] 都跑
Step 60: B 完成 → 加入新请求 C
Step 100: A 完成 → 加入新请求 D
每步重新选 seq, 不等最慢
```

### 效果
- 吞吐提升 5-23x（论文数据）
- GPU 利用率从 30-50% → 80%+
- TTFT/ITL 稳定

### Chunked Prefill
- 长 prompt 拆成多块, 和 decode 混跑
- 避免一个长 prompt 独占 GPU 几秒
- 改善多用户公平性

---

## 专题 3：调度器深度

### 三状态机
```
   new       WAITING (等算 prefill)
                ↓ 调度
             RUNNING  ──→  完成
                ↓ 抢占
            SWAPPED (在 CPU RAM, 等回显存)
                ↓ 恢复
             RUNNING
```

### 调度 5 步
1. 优先恢复 SWAPPED (LRU)
2. 新请求进 WAITING
3. WAITING 中可调度的: 预填 (chunked)
4. RUNNING 中可继续的: decode
5. 检查显存, 不够就 SWAP OUT 几个

### 抢占策略
- **swap**: KV cache 写到 CPU RAM
- **recompute**: 直接丢弃, 恢复时重算 prefill
- 选择: 取决于"恢复时哪更便宜"

### Block 分配
- 逻辑 block → 物理 block (block_manager)
- 哈希查 prefix cache: 命中就共享
- RefCounter: 自动释放

---

## 专题 4：KV cache 内存精算

### 模型 KV 估算
```
LLaMA-7B, 32 层, 32 head, head_dim 128
KV 缓存: 2 × num_layers × num_heads × head_dim × dtype_size
        = 2 × 32 × 32 × 128 × 2 (fp16)
        = 524288 字节/token
        = 0.5 MB/token

1000 token 的 seq = 500MB KV 缓存
```
**所以 LLaMA-7B 跑 100 seq × 2k token ≈ 100GB**

### 量化省显存
- fp16 → int8: 省 2x
- int8 → int4: 再省 2x
- 4x 量化 + paged: 同样显存多 4x 吞吐

### Prefix Sharing
- 系统 prompt ("你是助手...")
- Few-shot examples
- Hash(block) = block content hash
- 命中: 0 分配, 直接引用

---

## 专题 5：5 段必读代码逐段详解

### 5.1 `block_manager.py:can_append` — 分配决策
**关键**：检查 free blocks 够不够 + prefix 共享
- 显式算 blocks_needed
- prefix 共享: hash 查 block, 命中就少分配

### 5.2 `scheduler.py:schedule` — 调度主循环
**关键**：每 step 重新选 seq
- 不等最慢
- 抢占策略: swap vs recompute

### 5.3 `llama.py:LlamaModel.forward` — 模型前向
**关键**：HF 兼容 + PagedAttention 优化
- 输入 → embedding → decoder × N → norm → lm_head
- 关键参数: positions, kv_caches, attn_metadata

### 5.4 `paged_attention.py:paged_attention` — CUDA kernel
**关键**：FlashAttention + block table 寻址
- 不存中间 attn 矩阵
- 在线 softmax: 累加 max + sum
- block_tables: 逻辑 → 物理

### 5.5 `llm.py:generate` — 入口 API
**关键**：用户友好 + 内部异步
- SamplingParams 统一参数
- 内部 AsyncLLMEngine
- 流式输出: stream=True

---

## 专题 6：性能调优

### GPU 内存
```bash
--gpu-memory-utilization 0.9   # 默认 0.9
--max-num-seqs 256             # 并发 seq 上限
--max-model-len 4096           # seq 最大长度
--block-size 16                # 物理 block 大小
```

### 调度
```bash
--max-num-batched-tokens 2048  # 每 step 最大 token
--enable-chunked-prefill       # 长 prompt 拆块
--swap-space 4                 # CPU swap 大小 (GB)
```

### 量化
```bash
--quantization awq_marlin     # 4-bit 量化
--kv-cache-dtype fp8          # KV cache 量化
```

### 监控
```bash
# 关键指标
vllm:num_requests_swapped
vllm:num_preemptions_total
vllm:gpu_cache_usage_perc
vllm:cpu_cache_usage_perc
vllm:prompt_tokens_total
vllm:generation_tokens_total
```

---

## 专题 7：故障排查

### F1：OOM
```bash
# 症状: OutOfMemoryError: CUDA
# 应急:
# 1. 减并发
--max-num-seqs 64
# 2. 启用量化
--quantization awq
# 3. 缩 max_model_len
--max-model-len 2048
# 4. 减 gpu-memory-utilization
--gpu-memory-utilization 0.85
```

### F2：Prefix cache 没生效
```bash
# 症状: 系统 prompt 每次都重算
# 检查:
# 1. 是否启用
--enable-prefix-caching
# 2. prompt 模板是否一致
# 3. 命中报告
curl localhost:8000/metrics | grep prefix
```

### F3：吞吐量上不去
```bash
# 排查:
# 1. 是不是有长 prompt 占用 (调 chunked)
# 2. 是不是有 swap (调高 GPU 内存)
# 3. 是不是 batched_tokens 太小
nvidia-smi -l 5  # 看 GPU 利用率
```

### F4：PagedAttention 报错
```python
# 症状: block_manager 算 block 数对不上
# 原因: prefix sharing 配错
# 解法: 升级 vllm 版本, 报告 issue
```

### F5：slow decode
```bash
# 症状: 单 token 延迟 > 100ms
# 排查:
# 1. max_num_seqs 太大
# 2. chunked prefill 开没开
# 3. 量化有没有生效
# 4. 看 GPU util 和显存
```

---

## 专题 8：复用模式

### 模式 A：Paged 内存管理
**场景**：大对象池（连接池、文件句柄）
- 固定大小分块
- 表查找代替连续
- 借用 OS 虚拟内存思想

### 模式 B：Continuous Batching
**场景**：流式任务调度
- 任务池 + 每 step 重选
- 不等最慢的, 公平
- 任何"批处理 + 异构完成时间"

### 模式 C：Prefix 缓存
**场景**：prompt 模板、few-shot
- hash 查重
- 命中就引用
- 减少重复计算

### 模式 D：Swap/Recompute
**场景**：资源紧张时
- swap: 状态写到慢存储
- recompute: 状态丢弃, 重算
- 看哪个便宜选哪个

---

## 专题 9：实战部署

### 单卡 (开发)
```bash
vllm serve meta-llama/Llama-3-8B-Instruct \
  --host 0.0.0.0 --port 8000 \
  --gpu-memory-utilization 0.9
```

### 多卡张量并行
```bash
vllm serve meta-llama/Llama-3-70B-Instruct \
  --tensor-parallel-size 4 \
  --gpu-memory-utilization 0.95
```

### K8s 部署
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vllm
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: vllm
        image: vllm/vllm-openai:latest
        resources:
          nvidia.com/gpu: 1
        args:
        - --model
        - meta-llama/Llama-3-8B-Instruct
        - --gpu-memory-utilization
        - "0.9"
        ports:
        - containerPort: 8000
```

### 监控 + 自动扩缩
- 指标: `vllm:num_requests_waiting` > 阈值 → 加 Pod
- 客户端: OpenAI 兼容 API, 业务零修改

---

## 专题 10：vLLM 让我重新思考的 5 件事

1. **OS 的思想可以借鉴**。PagedAttention 直接搬虚拟内存, 一举解决显存碎片。
2. **等最慢的请求 = 浪费**。每步重调度 = 公平 + 高效。
3. **KV cache 是 LLM 推理的最大成本**。优化它的结构 = 优化推理。
4. **Prefix sharing 是巨大的"免费午餐"**。系统 prompt 不变 = 永不重算。
5. **工程上, 论文 → 代码 → 生产**。PagedAttention 论文 → vLLM 6 个月 → 业界标准。

---

---

## 专题 11: Chunked Prefill 深度 — 长 Prompt 不再独占 GPU

### 痛点: 长 prompt 让短请求饥饿

```
传统 prefill 模式:
Step 1:  [P-4096]         decode: [D1 D2 D3 D4]    ← P-4096 独占, 4096 token prefill
Step 2:  [P-4096 续算]     decode: [D1 D2 D3 D4]    ← 还算 2000 token
Step 3:  [P-4096 续算]     decode: [D1 D2 D3 D4]    ← 继续
...
Step N:  终于完成         decode: [D1 D2 D3 D4]

问题:
- D1-D4 等了 N 个 step (1-2 秒), ITL 飙到秒级
- GPU 利用率: 80% 算 prefill, decode 排队
- 用户感知: 卡顿
```

### Chunked Prefill 解决

```
Chunked 模式 (budget=512):
Step 1:  [P-512 块1]      decode: [D1 D2 D3 D4]
Step 2:  [P-512 块2]      decode: [D1 D2 D3 D4]
Step 3:  [P-512 块3]      decode: [D1 D2 D3 D4]
Step 4:  [P-512 块4]      decode: [D1 D2 D3 D4]
...

收益:
- D1-D4 每个 step 都能 decode, ITL 稳定
- 长 prompt 拆块, 每 step 一视同仁
- 公平性: 30% 改善
```

### 关键参数
- `--max-num-batched-tokens 2048` — 单 step token 上限 (prefill + decode 加起来)
- chunk 大小 = `max_num_batched_tokens - decode_tokens`
- 含义: 留 decode 预算后, 剩的给 prefill 拆块

### 性能数据 (LLaMA-3 8B, batch=64, mix of 4k + 512 seq)
- 无 chunked: P99 ITL = 1500ms (长 prompt 阻塞)
- chunked budget=512: P99 ITL = 200ms (7x 改善)
- 吞吐: 略降 (5-10%), 但延迟改善 7x, 实际更好

### 关键洞察
- 长 prompt 场景 (RAG, 文档摘要) 必须开 chunked
- budget 太小 (128) → 长 prompt 慢, budget 太大 (4096) → 短请求饥饿
- 经验值: 512 (默认), 高并发调到 1024, 低并发调到 256

---

## 专题 12: Speculative Decoding — 小模型猜 + 大模型验

### 核心思想
- 大模型 1 token 算 1 次 (~30ms)
- 小模型 1 token 算 0.1 次 (~3ms) — 但质量差
- Speculative: 小模型猜 N token, 大模型 1 次 forward 验证 N token
- 接受率 50-80% → 实际加速 1.5-3x

### 工作流程
```
Step 1: 小模型 (草稿) 生成 5 token 候选
        [t1, t2, t3, t4, t5]
Step 2: 大模型 1 次 forward 算这 5 token 的概率
        P(t1|t0) * P(t2|t1) * ...
Step 3: 拒绝采样, 接受前 K 个匹配, 重新采样第 K+1 个
        接受 [t1, t2, t3], 拒绝 [t4, t5]
Step 4: 大模型重新采样第 4 个 token (作为下一个 prefix)

效果: 1 次大模型 forward → 实际推进 3-4 token
```

### vLLM 的 Speculative Decoding
- `--speculative-model [小模型路径]` (e.g. Llama-3-8B + Llama-3-70B)
- `--num-speculative-tokens 5` — 每次猜 5 个
- `--speculative-draft-tensor-parallel-size 1`
- 内部: draft model 跑在 GPU 同卡, 复用 KV cache (特殊处理)

### EAGLE-2 / Medusa 等高级方法
- Medusa: 多个解码头 (5-10 个) 同时预测, 不需要单独小模型
- EAGLE-2: 树状 draft, 接受率 80%+
- vLLM 0.5+ 支持 Medusa, 0.6+ 支持 EAGLE-2

### 性能数据 (LLaMA-3 70B + Llama-3 8B draft, 5 token)
- 接受率 60-70%
- 加速 1.5-2x
- 适用: 短输出 (< 200 token) 效果最好
- 长输出: 加速比下降到 1.2-1.3x (大模型 prefill 占主导)

### 关键洞察
- Speculative 是"用算力换延迟" — 短输出最受益
- 草稿模型选择: 同系列小 4-8x 效果最好 (e.g. 70B + 8B)
- 接受率 < 50% 时, 加速不明显, 关掉

---

## 专题 13: 量化 (FP8 / INT4 / AWQ) — 显存省 4x

### 量化级别
| 精度 | 位数 | 显存 (8B) | 速度 (A100) | 质量损失 |
|------|------|----------|------------|---------|
| FP32 | 32 | 32 GB | 1.0x | 0% (baseline) |
| BF16 | 16 | 16 GB | 1.0x | 0% |
| FP8 (E4M3) | 8 | 8 GB | 1.5-2.0x (H100) | < 1% |
| INT8 (W8A8) | 8 | 8 GB | 1.2-1.5x | 1-2% |
| **INT4 (AWQ)** | 4 | **4 GB** | **2-3x** | **2-5%** |
| INT4 (GPTQ) | 4 | 4 GB | 2-3x | 3-7% |
| FP4 (NV) | 4 | 4 GB | 3-4x (H100) | 3-5% |

### AWQ vs GPTQ
- **AWQ (Activation-aware Weight Quantization)**:
  - 保留 1% 重要权重 FP16, 其余 INT4
  - 质量损失小, 速度略快
  - vLLM `--quantization awq_marlin` (Marlin kernel)
- **GPTQ (Gradient-based PTQ)**:
  - 全部 INT4, Hessian 矩阵指导
  - 质量略差, 兼容性更好
  - vLLM `--quantization gptq_marlin`

### FP8 (H100 / Ada)
- E4M3: 4 bit 指数, 3 bit 尾数 (forward)
- E5M2: 5 bit 指数, 2 bit 尾数 (gradient, H100)
- vLLM 0.5+ 支持
- 速度: H100 tensor core 2x 加速
- 适用: H100 + 推理 (不是训练)

### KV cache 量化 (独立)
- `--kv-cache-dtype fp8` — KV 单独 FP8
- 显存: 8B 1k token KV 从 512MB → 256MB (省 2x)
- 质量: 1-2% perplexity 变化, 通常可接受
- LLaMA-3 70B + 8k context: KV 27GB → 13GB

### 实战推荐
- **A100 / 显存紧**: AWQ (4-bit), 配 KV fp8
- **H100 / 性能优先**: FP8 整体, KV 也 FP8
- **V100 / 旧卡**: AWQ (V100 不支持 FP8)
- **质量优先**: BF16 + KV fp8

### 性能数据 (LLaMA-3 8B, A100 80GB)
- BF16: 16GB 权重, 1.0x 速度, 0% 质量损失
- AWQ: 4GB 权重, 2.5x 速度, 3% 质量损失
- AWQ + KV fp8: 4GB + KV 256MB/1k, 2.5x 速度
- 16GB → 4GB: 同样 80GB 卡能跑 4x 更大 batch

### 关键洞察
- 量化是 LLM 推理的"免费午餐" — 显存 + 速度都赚
- 质量损失主要在长尾 (rare tokens), perplexity 涨 1-3 实际影响小
- 推理用 INT4, 训练用 BF16 (不要量化训练)
- 监控: `vllm:gpu_cache_usage_perc`, perplexity 评估

---

## 专题 14: LORA 适配 — 单卡多任务

### LORA 原理
- 原始 W: (d_in, d_out), e.g. (4096, 4096), 16M 参数
- LORA: W' = W + B @ A, A: (d_in, r), B: (r, d_out), r=8 → 32K + 32K = 64K 参数
- 显存: 16M → 64K (256x 少)
- 训练: 冻 W, 只训 A, B
- 推理: W' = W + B@A (B@A rank 8, 几乎无开销)

### vLLM 多 LORA
- `--enable-lora` 启用
- `--lora-modules my-lora=/path/to/lora.json` 加载
- 1 个 base model + N 个 LORA 适配器
- 调度: 不同请求用不同 LORA, GPU 共享 base model
- 显存: 1 份 base + N 份小 LORA (e.g. 100MB total)

### LORA 热加载
- 服务运行中动态加载 LORA (add_lora())
- 适用: A/B 测试, 灰度发布
- 不需要重启服务

### 性能数据 (LLaMA-3 8B base + 10 LORA, batch=32)
- 单 LORA: 速度 -2% (B@A 计算)
- 多 LORA (1 base + 10): 速度 -5% (路由开销)
- 显存: 1× base + 10× LORA = 16GB + 10×100MB = 17GB
- 吞吐量: 单 LORA 1200 req/s, 多 LORA 1100 req/s (损耗小)

### 实战
- 训练: PEFT / LoRAX / HuggingFace PEFT
- 加载: `--lora-modules` 参数
- 推理: OpenAI API `model=base` + LoRA name header
- 监控: per-LoRA 吞吐, LORA 命中率

### 关键洞察
- LORA 让单卡能跑 10-100 个微调任务
- base model 共享 → 显存高效
- 适用: 不同 prompt 模板, 不同语言, 不同行业
- 限制: LORA 不能合并 base model 的能力, 只能微调风格

---

## 专题 15: 多模态 (Vision-Language Model) — 图文混合

### VLM 架构
```
输入: [image, "请描述这张图"]
      ↓
Image Encoder (ViT) → image_features (e.g. 576 × 4096)
      ↓
Projection (MLP) → 投影到 LLM hidden_size
      ↓
text + image_tokens concat → LLM
      ↓
LLM decode 输出
```

### vLLM 多模态支持
- LLaVA, Qwen-VL, InternVL, MiniCPM-V 等
- 关键: image token 占位 (e.g. 576 个 <image> token)
- 显存: image features 临时存, decode 阶段丢弃

### 调度
- prefill: image 一次性 encode (~100-500ms), 后续当 text token
- decode: 同普通 LLM, image features 不再参与
- 多图: 多个 image 拼接 (按模型 max)

### 性能数据 (Qwen-VL, A100, 单 224×224 图 + 1k text)
- image encode: ~200ms (ViT-L/14)
- prefill (576 image + 1000 text): ~800ms
- decode: ~30ms / token (同普通 LLM)
- 显存: image features ~50MB, KV cache 主要占

### 实战
- vLLM `--model Qwen/Qwen-VL-Chat` 直接支持
- 输入: 文本 + base64 image / URL
- 限制: image 数受 max_model_len 限制 (576 token/图)

### 关键洞察
- VLM 推理瓶颈在 image encode (200-500ms), LLM decode 类似
- 多图场景: 拆成多次 prefill (chunked prefill 自然支持)
- 视频: 抽帧 + 多图推理, 注意 KV cache 大

---

## 专题 16: 跨项目引用 + 5 必避反模式 + 7 天复刻路线

### 跨项目引用
- `[[../01-etcd/README|etcd]]` — Raft + WAL + bbolt, 调度器 Lease 异步思想
- `[[../02-redis/README|Redis]]` — KV cache 哈希表 rehash 启发 PagedAttention
- `[[../03-kubernetes/README|k8s]]` — Deployment + HPA 直接套 vLLM (看 num_requests_waiting 扩缩)
- `[[../04-postgres/README|postgres]]` — buffer pool 8KB page = PagedAttention block_size
- `[[../05-golang/README|golang]]` — goroutine 调度 + channel 思想启发 Continuous Batching
- `[[../07-nextjs/README|nextjs]]` — 部署 (vLLM serve 反向代理 + OpenAI 兼容 API)
- `[[../08-prometheus/README|prom]]` — 抓 vLLM metrics 监控 GPU/吞吐
- `[[../09-ripgrep/README|ripgrep]]` — Rust 重写经验 (vLLM 也有 v1 Rust 重构计划)
- `[[../10-vault/README|vault]]` — Secret 管理 (HuggingFace token, API key)

### 5 必避反模式
1. **不开 prefix caching**
   ```bash
   # ❌ 系统 prompt 每次都重算, 浪费 100ms prefill
   vllm serve ...  # 没加 --enable-prefix-caching
   # ✅ 命中 5x 快
   vllm serve ... --enable-prefix-caching
   ```

2. **GPU 显存占用 > 0.95**
   ```bash
   # ❌ OOM 风险高 (留给 activations / CUDA context 太少)
   --gpu-memory-utilization 0.97
   # ✅ 留 5-10% buffer
   --gpu-memory-utilization 0.9
   ```

3. **没启用 chunked prefill**
   ```bash
   # ❌ 长 prompt 阻塞, P99 ITL 飙到秒级
   # 默认开了, 但有人可能禁掉
   # ✅ 默认行为, 不要禁
   ```

4. **没启用量化**
   ```bash
   # ❌ 8B 模型 16GB 权重, 同样 80GB 卡只能跑 32 并发
   # ✅ AWQ 4GB, 跑 64 并发 (2x 吞吐)
   --quantization awq_marlin
   ```

5. **没监控 num_preemptions**
   ```bash
   # ❌ OOM 抢占飙升, ITL 抖动
   # ✅ 监控 + 调小 --max-num-seqs
   curl localhost:8000/metrics | grep preemptions
   ```

### "如果重来一次"
- **早用 prefix caching**: 多用户场景下 5x 加速, 几乎免费
- **早开 AWQ 量化**: 4x 显存省, 速度 +2x, 质量损失 < 5%
- **早开 chunked prefill**: 长 prompt 场景下 P99 改善 7x
- **早装 Prometheus exporter**: 第一天就接监控
- **晚用 speculative decoding**: 短输出场景才受益, 80% 场景不用
- **谨慎 LORA 数量**: 10+ LORA 路由开销显现, 不如多副本

### 7 天复刻路线
```
D1: pip install vllm, 跑通 hello world (单卡 8B)
D2: 读 vllm/core/scheduler.py 调度循环
D3: 读 vllm/attention/ops/paged_attention.py kernel
D4: 写 mini PagedAttention (PyTorch 版, 理解 block table)
D5: 用 vllm serve 部署 + OpenAI 兼容 API
D6: 加 prefix caching + 量化 + chunked prefill, 对比性能
D7: 接 Prometheus + Grafana, 配 HPA
```

### vLLM 0.6 里程碑
- 0.4 (2023.07): PagedAttention + Continuous Batching
- 0.5 (2023.10): 多模态 + chunked prefill + AWQ
- 0.6 (2024.01): V1 engine 重构 + FlashInfer + EAGLE-2
- 0.7 (2024.06): 推测解码 + FP8 + 强化学习推理
- 0.8 (2025): 多 LoRA 热加载 + 视频理解

## 🔗 进一步阅读

- 源码：https://github.com/vllm-project/vllm
- 论文：https://arxiv.org/abs/2309.06180 (PagedAttention)
- 文档：https://docs.vllm.ai/
- 论文 2：https://arxiv.org/abs/2310.01889 (vLLM 整体)
- 性能对比：https://blog.vllm.ai/
