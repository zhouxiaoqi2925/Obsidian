---
title: 02-LLM推理引擎与加速
created: 2026-06-19
tags: [豆包/Doubao, LLM推理, GPU优化, MoE, 端侧推理]
parent: 00-索引
---

# 02 - LLM 推理引擎与加速

## 1. 字节自研推理引擎总览

字节跳动火山引擎内部署了多套自研推理引擎，用于承载豆包大模型的高并发在线服务。

```
推理引擎体系
├── 在线推理（低延迟）
│   ├── Doubao-Engine（豆包自研主引擎）
│   └── vLLM 兼容层（开源方案）
├── 批量推理（高吞吐）
│   ├── Triton + 自研 Plugin
│   └── TensorRT-LLM（NVIDIA 生态）
└── 端侧推理（本地化）
    ├── llama.cpp 优化版
    └── CoreML / Snapdragon NPU
```

### 1.1 字节推理引擎核心特性（基于公开技术分享）

| 特性 | 说明 | 业界对比 |
|------|------|----------|
| Continuous Batching | 动态 batch，token 级调度 | 同 vLLM |
| PagedAttention | 分页 KV Cache | 同 vLLM |
| Speculative Decoding | 投机解码（小模型 draft） | 比 vLLM 更激进 |
| Expert Parallelism | MoE 专家并行（自研路由） | 独有优化 |
| Flash Attention 2/3 | 算子级优化 | 通用 |
| INT8/INT4 量化 | GPTQ/AWQ/FP8 | 通用 |

## 2. MoE 推理优化

### 2.1 MoE 推理的痛点

豆包 Pro 200B+ 参数但只激活 20B，带来三大挑战：
1. **显存占用高**：所有专家权重都需驻留 GPU（HBM）
2. **通信开销大**：专家分布在不同 GPU 时 All-to-All 通信
3. **负载不均**：热门专家过载，冷门专家空闲

### 2.2 字节的优化策略

```python
# 字节 MoE 推理伪代码（基于公开论文精神）
class ByteDanceMoEInference:
    """
    主要优化点：
    1. Expert Parallelism（EP）
    2. All-to-All 通信优化
    3. 专家预取 + 计算重叠
    """
    
    def __init__(self, num_experts=256, top_k=8, num_gpus=8):
        self.num_experts = num_experts
        self.top_k = top_k
        # 每个 GPU 放置 num_experts / num_gpus 个专家
        self.experts_per_gpu = num_experts // num_gpus
        
    def forward(self, hidden_states):
        # 1. 路由计算（在所有 GPU 上冗余执行）
        router_logits = self.gate(hidden_states)
        topk_weights, topk_idx = torch.topk(
            F.softmax(router_logits, dim=-1), 
            self.top_k, dim=-1
        )
        
        # 2. 计算与通信重叠
        # 先发起 All-to-All，同时本地专家开始计算
        with torch.cuda.stream(self.comm_stream):
            dispatched = all_to_all_dispatch(hidden_states, topk_idx)
        with torch.cuda.stream(self.compute_stream):
            local_output = self.local_experts(dispatched)
        
        # 3. 结果回收 + All-to-All 合并
        torch.cuda.current_stream().wait_stream(self.comm_stream)
        output = all_to_all_combine(local_output, topk_weights)
        return output
```

### 2.3 Expert Parallelism（EP）配置

字节在 200B MoE 模型上的典型部署配置（推测，基于公开分享）：

| GPU 型号 | 数量 | 部署方式 | 单请求延迟 |
|----------|------|----------|------------|
| H800 | 8 | TP=8 + EP=2 | ~80ms (TTFT) |
| H800 | 16 | TP=8 + EP=4 | ~60ms (TTFT) |
| H100 | 8 | TP=8 + EP=2 | ~50ms (TTFT) |

**TTFT** (Time To First Token) 是豆包在线推理的核心 SLO 指标。

## 3. H800/H100 优化

### 3.1 H800 vs H100 区别

H800 是 H100 的中国特供版：
- **FP16 算力**：1979 TFLOPS（H800）vs 1979 TFLOPS（H100）— 基本一致
- **NVLink 带宽**：400 GB/s（H800）vs 900 GB/s（H100）— 砍半
- **主要影响**：多卡通信密集型任务（H800 慢 2x），单卡计算（H800 同等）

### 3.2 字节对 H800 的优化

针对 H800 NVLink 砍半的问题，字节做了：

1. **梯度累积通信**：
   ```python
   # 用梯度累积减少通信频率
   accumulation_steps = 8
   for step in range(accumulation_steps):
       loss = compute_loss()
       loss.backward()  # 梯度累加
   optimizer.step()  # 一次同步
   ```

2. **通信与计算重叠**：
   ```python
   # Bagua 的 fused comm
   from bagua.torch_api.algorithms import bytegrad
   algorithm = bytegrad.ByteGradAlgorithm()
   ```

3. **减少跨机通信**：专家尽量在同一节点内
4. **压缩通信数据**：FP8/INT8 梯度

### 3.3 实际吞吐对比（估算）

基于字节公开分享的数据（具体数字以官方为准）：

| 模型 | GPU | 优化前 | 优化后 | 提升 |
|------|-----|--------|--------|------|
| Doubao-Pro 200B | 8xH800 | 120 req/min | 360 req/min | 3x |
| Doubao-Lite 7B | 1xH100 | 800 tokens/s | 2400 tokens/s | 3x |
| Doubao-Lite 7B | 1xA100 | 400 tokens/s | 1200 tokens/s | 3x |

## 4. Continuous Batching + PagedAttention

### 4.1 Static vs Continuous Batching

```
传统 Static Batching（延迟高）：
┌─────────────────────────────────────┐
│ Req1: ████████░░░░░░░░░░░░░░░░░░░░░ │
│ Req2: ███░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ Req3: █████████░░░░░░░░░░░░░░░░░░░░░ │
│ 总时间 = max(Req1, Req2, Req3)        │
└─────────────────────────────────────┘

Continuous Batching（高吞吐）：
┌─────────────────────────────────────┐
│ Req1: ████████░░░░░░░░░░░░░░░       │
│ Req2: ███░░░░░░░░░░░░░░░░░░░░       │
│ Req3: █████████░░░░░░░░             │
│ Req4: ███████████░░░░               │  ← 新请求及时插入
│ Req5: █████░░░░                     │
│ 吞吐提升 2-4 倍                       │
└─────────────────────────────────────┘
```

### 4.2 PagedAttention 原理

KV Cache 是 LLM 推理的显存大头，PagedAttention 像操作系统分页一样管理：

```python
# PagedAttention 简化实现
class PagedKVCache:
    def __init__(self, num_blocks, block_size=16):
        self.num_blocks = num_blocks
        self.block_size = block_size
        # 物理块池
        self.kv_pool = torch.empty(num_blocks, 2, num_heads, block_size, head_dim)
        # 逻辑→物理映射
        self.block_table = {}  # {request_id: [physical_block_ids]}
        self.free_blocks = list(range(num_blocks))
    
    def allocate(self, request_id, num_tokens):
        num_blocks_needed = (num_tokens + self.block_size - 1) // self.block_size
        physical_blocks = self.free_blocks[:num_blocks_needed]
        del self.free_blocks[:num_blocks_needed]
        self.block_table[request_id] = physical_blocks
        return physical_blocks
```

字节在 PagedAttention 基础上做了额外优化：
- **跨请求 KV 共享**：相同 prefix 的请求共享 KV（如 system prompt）
- **动态合并**：空闲块自动合并减少碎片

## 5. Speculative Decoding（投机解码）

字节在小模型协助大模型推理上有显著优化：

```python
# Speculative Decoding 工作流
class SpeculativeDecoder:
    def __init__(self, draft_model, target_model, k=5):
        """
        draft_model: 小模型（如 Doubao-Lite-7B）
        target_model: 大模型（如 Doubao-Pro-200B）
        k: 投机步长
        """
        self.draft = draft_model
        self.target = target_model
        self.k = k
    
    def generate(self, prompt):
        # 1. 用小模型快速生成 k 个候选 token
        candidates = self.draft.generate(prompt, max_new_tokens=self.k)
        
        # 2. 用大模型并行验证这 k 个 token（一次前向）
        target_logits = self.target.forward(prompt + candidates)
        
        # 3. 接受/拒绝策略
        accepted_tokens = []
        for i, token in enumerate(candidates):
            # 概率比对
            accept_prob = min(1, target_probs[i][token] / draft_probs[i][token])
            if random.random() < accept_prob:
                accepted_tokens.append(token)
            else:
                # 拒绝：用大模型的概率重采样
                corrected = sample_from(target_probs[i])
                accepted_tokens.append(corrected)
                break
        
        return accepted_tokens
```

**收益**：
- 端到端加速 **2-3x**（豆包官方公开数据）
- 缺点：需要训练/维护 draft model

## 6. 量化

### 6.1 量化方案

| 方案 | 模型大小 | 精度损失 | 推理加速 | 适用 |
|------|----------|----------|----------|------|
| FP16 | 100% | 0 | 1x | 默认 |
| INT8 (SmoothQuant) | 50% | <1% | 1.5x | 推荐 |
| INT4 (AWQ/GPTQ) | 25% | 1-3% | 2-3x | 资源受限 |
| FP8 (E4M3) | 50% | <0.5% | 1.7x | H100 专属 |
| INT4 + MoE 量化 | 25% | 2-4% | 2.5x | 字节自研 |

### 6.2 字节 INT4 量化示例

```python
# AWQ 量化（字节推理使用类似方案）
from awq import AutoAWQForCausalLM
from transformers import AutoTokenizer

model_path = "doubao-pro-1.5"
quant_path = "doubao-pro-1.5-awq-int4"

# 加载模型
model = AutoAWQForCausalLM.from_pretrained(model_path)
tokenizer = AutoTokenizer.from_pretrained(model_path)

# 量化配置
quant_config = {
    "zero_point": True,
    "q_group_size": 128,
    "w_bit": 4,
    "version": "GEMM",
}

# 执行量化
model.quantize(tokenizer, quant_config=quant_config)
model.save_quantized(quant_path)
tokenizer.save_pretrained(quant_path)
```

## 7. 端侧模型（On-Device）

### 7.1 字节端侧策略

字节在 2024-2025 年重点投入端侧 LLM：

- **Doubao-Lite-7B** 可在手机本地运行
- 合作芯片：高通骁龙 8 Gen 3 / 联发科天玑 9300+
- 推理框架：基于 llama.cpp + CoreML / QNN

### 7.2 端侧推理架构

```
┌──────────────────────────────────────┐
│         手机 SoC                      │
│  ┌────────────┐    ┌─────────────┐   │
│  │   CPU      │    │   NPU/GPU   │   │
│  │ (4x A720)  │    │ (Hexagon)   │   │
│  └─────┬──────┘    └──────┬──────┘   │
│        │  llama.cpp/      │          │
│        │  CoreML          │          │
│        └────────┬─────────┘          │
│                 ▼                     │
│         量化模型 (INT4)                │
│         7B 参数 ≈ 4GB                  │
└──────────────────────────────────────┘
```

### 7.3 端侧性能数据（公开报告）

| 手机型号 | 模型 | 量化 | 速度 | 续航 |
|----------|------|------|------|------|
| 骁龙 8 Gen 3 | Doubao-Lite-7B | INT4 | 12 tokens/s | 可用 30min+ |
| 天玑 9300 | Doubao-Lite-7B | INT4 | 10 tokens/s | 可用 30min+ |
| 苹果 A17 Pro | Doubao-Lite-7B | INT4 | 15 tokens/s | 可用 45min+ |

### 7.4 端侧应用场景

- **离线语音助手**：飞机上、地铁里
- **隐私敏感场景**：医疗、法律
- **实时响应**：输入法联想、AR 翻译

## 8. 性能基准（Benchmark）

### 8.1 Doubao-Pro-1.5 vs 主流模型（公开数据）

| Benchmark | Doubao-Pro-1.5 | GPT-4o | Claude 3.5 Sonnet | DeepSeek V3 |
|-----------|----------------|--------|-------------------|-------------|
| MMLU | 88.6 | 88.7 | 88.3 | 88.5 |
| C-Eval | 90.1 | 86.0 | 80+ | 89 |
| GSM8K | 96.2 | 96.6 | 96.4 | 89 |
| HumanEval | 78.8 | 90.2 | 93.7 | 82 |
| BBH | 88.4 | 88.6 | - | 88 |
| 推理价格 元/百万 token | 0.8 | ~50 | ~21 | 2 |

> 数据来源：火山引擎官方发布 + 第三方测评（截至 2025 年 Q1）

### 8.2 Doubao-Lite-1.5 基准

| Benchmark | Doubao-Lite-1.5 | Llama-3-8B | Qwen2-7B |
|-----------|-----------------|------------|----------|
| MMLU | 76.0 | 68.4 | 74.8 |
| C-Eval | 78.5 | 60+ | 76 |
| HumanEval | 65+ | 60+ | 70+ |

## 9. 推理调度

### 9.1 字节自研调度系统

```
┌────────────────────────────────────────────────┐
│              流量接入层                          │
│   Nginx / OpenResty → 七层负载均衡              │
└──────────────────┬─────────────────────────────┘
                   │
┌──────────────────▼─────────────────────────────┐
│           推理调度器 (ByteScheduler)              │
│   - 模型路由（Pro / Lite / Character）          │
│   - 优先级队列（VIP > 免费 > 批量）               │
│   - 限流 + 熔断                                 │
└──────────────────┬─────────────────────────────┘
                   │
┌──────────────────▼─────────────────────────────┐
│         GPU 集群 (H800/H100)                     │
│   弹性扩缩容 + 多租户隔离                         │
└────────────────────────────────────────────────┘
```

### 9.2 KV Cache 跨请求共享

字节的优化：**前缀共享**

```python
# 系统提示词可被数千请求共享
SYSTEM_PROMPT = "你是豆包 AI 助手，由字节跳动研发..."

# 第一次请求：正常计算 KV
request1 = {
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": "你好"}
    ]
}

# 第二次请求：复用 SYSTEM_PROMPT 的 KV，仅增量计算 user 部分
request2 = {
    "messages": [
        {"role": "system", "content": SYSTEM_PROMPT},  # KV 复用！
        {"role": "user", "content": "今天天气"}
    ]
}
```

**收益**：
- TTFT 降低 **40-60%**（系统 prompt 越长效果越明显）
- GPU 利用率提升 **30%**

## 10. 关键洞察与启示

1. **MoE 是主流路线**：字节豆包与 GPT-4 同步押注稀疏激活
2. **H800 是国产 LLM 的 "事实标准"**：字节对 H800 优化到位
3. **Speculative Decoding 是关键加速**：豆包用 Lite 模型给 Pro 加速
4. **端侧 + 云端协同**：7B 端侧模型是 2025 年趋势
5. **量化是降本核心**：INT4 让 200B 模型能在单卡跑
6. **可借鉴到 AI 直播平台**：
   - 用小模型（Lite）作为大模型（Pro）的 draft
   - INT4 量化降低推理成本
   - 前缀 KV 共享降低首 token 延迟
   - 端侧模型做实时响应，云端做复杂任务

## 11. 参考资料

- vLLM：<https://github.com/vllm-project/vllm>
- TensorRT-LLM：<https://github.com/NVIDIA/TensorRT-LLM>
- llama.cpp：<https://github.com/ggerganov/llama.cpp>
- AWQ：<https://github.com/mit-han-lab/llm-awq>
- Bagua：<https://github.com/BaguaSys/bagua>
- Flash Attention：<https://github.com/Dao-AILab/flash-attention>
- 字节技术沙龙：<https://blog.bytedance.com/>