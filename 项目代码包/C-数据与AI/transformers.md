# Hugging Face Transformers

## 一、前言

**定位**：Hugging Face 2018 年开源的**预训练模型库**，目标是"让 NLP 民主化"。提供 100 万+ 预训练模型、300+ 数据集、5 万+ 模型的统一 API，是 LLM 时代的"GitHub"。

**核心价值**：
- **统一 API**：`pipeline()` 几行代码完成文本生成、分类、问答
- **海量模型**：BERT / GPT / LLaMA / Mistral / Qwen / GLM 一站式访问
- **多框架支持**：PyTorch / TensorFlow / JAX 三大框架统一接口
- **训练 + 推理 + 部署**：Trainer + Generation + Inference Endpoints
- **Hub 平台**：模型上传下载、版本管理、Spaces 演示

**五大特性**：
1. **AutoModel / AutoTokenizer**：根据模型名自动选类
2. **pipeline**：高级 API，3 行代码完成推理
3. **Trainer**：内置训练循环 + 评估 + 分布式
4. **Datasets**：统一数据集访问，配合 Arrow 高速加载
5. **PEFT / Accelerate / TRL**：周边库覆盖 LoRA、分布式、RLHF

**生态布局**：

```
┌─────────────────────────────────────┐
│   Hugging Face Hub (模型/数据集)    │
│   github-like 平台 100万+ 模型      │
└──────────┬──────────────────────────┘
           │
   ┌───────┴────────┬────────────┐
   ▼                ▼            ▼
transformers      datasets     Spaces
(模型 + 训练)     (数据集)    (在线演示)
   │                │
   ├─ PEFT (LoRA)   │
   ├─ Accelerate    │
   ├─ TRL (RLHF)    │
   ├─ Optimum (ONNX)│
   ├─ TextGeneration│
   └─ Evaluate      │
```

## 二、架构思维导图

```mermaid
mindmap
  root((Transformers 架构))
    核心 API
      AutoModel
        AutoModelForCausalLM
        AutoModelForSequenceClassification
        AutoTokenizer
        AutoConfig
        AutoImageProcessor
      pipeline
        高级 API
        text-generation
        sentiment-analysis
        image-classification
      Trainer
        训练循环
        评估
        分布式
    模型
      Encoder
        BERT
        RoBERTa
        DeBERTa
        ALBERT
      Decoder
        GPT
        LLaMA
        Mistral
        Qwen
        GLM
      Encoder-Decoder
        T5
        BART
        Marian
      Vision
        ViT
        Swin
        DETR
      Multimodal
        CLIP
        BLIP
        LLaVA
    Tokenizer
      BPE
        GPT
        LLaMA
      WordPiece
        BERT
      Unigram
        T5
      SentencePiece
        多语言
      特殊 token
        [CLS] [SEP]
        [BOS] [EOS]
        [PAD] [MASK]
    训练
      Trainer
        训练循环
        评估
        早停
        日志
      TrainingArguments
        超参
        优化器
        调度
      数据
        collator
        DataCollator
        padding
    PEFT
      LoRA
        低秩分解
        训练快
      QLoRA
        4bit 量化
        65B 单卡
      Prefix Tuning
      Prompt Tuning
      AdaLoRA
    加速
      Accelerate
        分布式
        FSDP
        DeepSpeed
      Optimum
        ONNX
        TensorRT
        BetterTransformer
      Text Generation
        推理
        批处理
        KV cache
        推测解码
    数据集
      Datasets
        Arrow
        流式
        映射
        切分
      格式
        map style
        iterable
    工具
      Tokenizers
        Rust 实现
        高速
      Safetensors
        安全
        快速
      Hub
        推送
        版本
        Spaces
    应用
      NLP
        文本分类
        命名实体
        问答
        摘要
        翻译
        生成
      CV
        分类
        检测
        分割
      Audio
        ASR
        TTS
      Multimodal
        视觉问答
        图文生成
    训练范式
      预训练
      微调
      RLHF
        PPO
      DPO
        偏好
      ORPO
      KTO
```

## 三、关键代码

### 1. Pipeline 一行推理

```python
from transformers import pipeline

# 1. 文本生成（LLM）
generator = pipeline(
    'text-generation',
    model='Qwen/Qwen2-7B-Instruct',
    device_map='auto',           # 自动分配多 GPU
    torch_dtype='bfloat16',      # 节省显存
)
output = generator(
    '介绍一下北京',
    max_new_tokens=200,
    do_sample=True,
    temperature=0.7,
    top_p=0.9,
)
print(output[0]['generated_text'])

# 2. 情感分析
classifier = pipeline('sentiment-analysis')
classifier('I love Hugging Face!')
# [{'label': 'POSITIVE', 'score': 0.9998}]

# 3. 命名实体识别
ner = pipeline('ner', grouped_entities=True)
ner('Apple is a company based in Cupertino, founded by Steve Jobs.')
# [{'entity_group': 'ORG', 'word': 'Apple', ...}]

# 4. 问答
qa = pipeline('question-answering')
qa(question='What is Hugging Face?', context='Hugging Face is a company providing NLP tools...')
# {'answer': 'a company providing NLP tools', 'score': 0.97}

# 5. 翻译（多语言）
translator = pipeline('translation', model='Helsinki-NLP/opus-mt-zh-en')
translator('你好世界')
# [{'translation_text': 'Hello world'}]

# 6. 图像分类
vision = pipeline('image-classification', model='google/vit-base-patch16-224')
vision('cat.jpg')
# [{'label': 'tabby cat', 'score': 0.93}]

# 7. 视觉问答
vqa = pipeline('visual-question-answering')
vqa(image='cat.jpg', question='What is the cat doing?')
# [{'answer': 'sitting'}]

# 8. 语音识别
asr = pipeline('automatic-speech-recognition', model='openai/whisper-large-v3')
asr('audio.mp3')
# {'text': 'Hello, this is a test.'}
```

**解析**：
- **`pipeline()`** 自动选择模型 + 分词器 + 后处理；**3 行代码完成推理**
- **`device_map='auto'`**：多 GPU 自动分片（LLM 7B+ 必备）
- **`torch_dtype='bfloat16'`**：显存减半，BF16 比 FP16 更稳定（H100/A100 支持）

### 2. AutoModel 自定义前向

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

model_name = 'Qwen/Qwen2-7B-Instruct'
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.bfloat16,
    device_map='auto',
    load_in_4bit=True,          # 4bit 量化（需 bitsandbytes）
)

# Chat Template
messages = [
    {'role': 'system', 'content': 'You are a helpful assistant.'},
    {'role': 'user', 'content': '解释量子力学'},
]
text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
# "<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n解释量子力学<|im_end|>\n<|im_start|>assistant\n"

# 推理
inputs = tokenizer(text, return_tensors='pt').to(model.device)
outputs = model.generate(
    **inputs,
    max_new_tokens=200,
    do_sample=True,
    temperature=0.7,
    top_p=0.9,
    repetition_penalty=1.1,
    pad_token_id=tokenizer.eos_token_id,
)
response = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
print(response)

# KV Cache + 流式生成
from transformers import TextStreamer
streamer = TextStreamer(tokenizer, skip_special_tokens=True)
model.generate(**inputs, streamer=streamer, max_new_tokens=200)
```

**解析**：
- **`apply_chat_template`**：标准化多轮对话格式，适配不同模型的 chat 模板
- **`load_in_4bit=True`**：QLoRA 量化 4bit，7B 模型从 14GB → 4GB
- **`repetition_penalty`**：减少重复生成
- **`TextStreamer`**：流式输出，首 token 延迟从秒级降到 100ms 级

### 3. LoRA 微调（PEFT）

```python
from peft import LoraConfig, get_peft_model, TaskType
from transformers import AutoModelForCausalLM, TrainingArguments, Trainer
from datasets import load_dataset

# 1. 加载模型
model = AutoModelForCausalLM.from_pretrained(
    'Qwen/Qwen2-7B-Instruct',
    torch_dtype=torch.bfloat16,
    device_map='auto',
)

# 2. LoRA 配置
lora_config = LoraConfig(
    r=16,                       # 秩（rank）
    lora_alpha=32,              # 缩放系数
    target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj'],  # 注入的模块
    lora_dropout=0.05,
    bias='none',
    task_type=TaskType.CAUSAL_LM,
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 8,388,608 || all params: 7,625,297,408 || trainable%: 0.11%
# 0.11% 参数可训练！

# 3. 数据
dataset = load_dataset('yahma/alpaca-cleaned', split='train[:1000]')

def format_example(ex):
    text = f"### Instruction:\n{ex['instruction']}\n\n### Response:\n{ex['output']}"
    return tokenizer(text, truncation=True, max_length=512)

dataset = dataset.map(format_example)

# 4. 训练
args = TrainingArguments(
    output_dir='./lora-output',
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    num_train_epochs=3,
    learning_rate=2e-4,
    fp16=True,
    save_strategy='epoch',
    logging_steps=10,
)

trainer = Trainer(model=model, args=args, train_dataset=dataset)
trainer.train()

# 5. 保存 LoRA
model.save_pretrained('./lora-weights')

# 6. 推理
from peft import PeftModel
base_model = AutoModelForCausalLM.from_pretrained('Qwen/Qwen2-7B-Instruct', torch_dtype=torch.bfloat16)
model = PeftModel.from_pretrained(base_model, './lora-weights')
# 合并权重（节省推理开销）
merged_model = model.merge_and_unload()
merged_model.save_pretrained('./merged-model')
```

**解析**：
- **LoRA 注入 q/k/v/o 投影矩阵**：低秩分解 `W + AB`，A: [d,r]、B: [r,d]，r=16 时参数量降到 0.1%
- **可训练参数 0.11%**：原始 7B 模型，LoRA 只需训练 8M 参数，单卡 A100 可微调
- **`gradient_accumulation_steps=4`**：模拟 batch_size=16
- **`merge_and_unload()`**：合并 LoRA 权重回 base，推理无需额外 PEFT 依赖

### 4. RLHF / DPO 对齐

```python
from trl import DPOTrainer, DPOConfig

# 1. 准备数据（偏好对）
# {"prompt": "...", "chosen": "好回答", "rejected": "差回答"}
dataset = load_dataset('Anthropic/hh-rlhf', split='train[:1000]')

# 2. DPO 训练
dpo_config = DPOConfig(
    output_dir='./dpo-output',
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    num_train_epochs=1,
    learning_rate=5e-7,
    beta=0.1,                  # KL 散度权重
    max_prompt_length=512,
    max_length=1024,
)

dpo_trainer = DPOTrainer(
    model=model,
    ref_model=None,           # None 时自动用 model + 禁用 adapter
    args=dpo_config,
    train_dataset=dataset,
    tokenizer=tokenizer,
)
dpo_trainer.train()

# 3. PPO（更复杂，需要 reward model）
# from trl import PPOTrainer, PPOConfig
# 1. 准备 reward model
# 2. PPO trainer
# 3. rollout + train
```

**对齐范式演进**：
- **RLHF**：SFT → 训练 Reward Model → PPO 优化（OpenAI ChatGPT 路径）
- **DPO**：直接用偏好对训练，无需 Reward Model，效果近似 PPO 但简单 10 倍
- **ORPO / KTO**：DPO 的变种，进一步简化

### 5. Datasets 数据处理

```python
from datasets import load_dataset, Dataset
import pandas as pd

# 1. 加载 Hub 数据集
dataset = load_dataset('glue', 'mrpc')
print(dataset)  # DatasetDict({train, validation, test})

train_ds = dataset['train']
print(train_ds[0])  # {'sentence1': '...', 'sentence2': '...', 'label': 1}
print(train_ds.features)  # Features

# 2. 加载本地文件
df = pd.read_csv('data.csv')
dataset = Dataset.from_pandas(df)

# 3. 流式加载（大数据）
dataset = load_dataset('oscar-corpus/OSCAR-2301', split='train', streaming=True)
for example in dataset:
    print(example)
    break

# 4. 转换（map）
def tokenize_function(examples):
    return tokenizer(examples['text'], truncation=True, padding='max_length')

tokenized = dataset.map(tokenize_function, batched=True, num_proc=4)

# 5. 切分
split = tokenized['train'].train_test_split(test_size=0.2)
print(split)

# 6. 过滤
filtered = dataset.filter(lambda x: len(x['text']) > 100)

# 7. Arrow 高效存储
dataset.save_to_disk('processed-dataset')
dataset = load_from_disk('processed-dataset')
```

**解析**：
- **Datasets 基于 Apache Arrow**：内存映射、二进制、零拷贝，比 pandas 加载快 10 倍
- **`streaming=True`** 流式加载：大数据集无需全部下载到内存
- **`batched=True` + `num_proc=4`**：多进程并行处理，加速数据预处理

## 四、核心洞察

1. **pipeline 是最佳入门**：3 行代码完成 LLM 推理；新手也能快速体验 SOTA 模型。
2. **AutoModel 系列是灵活性核心**：所有模型统一接口，切换模型只需改 model name 字符串。
3. **PEFT + QLoRA 让消费级 GPU 微调 70B 模型**：4bit 量化 + LoRA 让 65B 模型在 24GB 显存（4090）上微调。
4. **TRL 库改变了对齐范式**：DPO 直接偏好训练，比 PPO 简单 10 倍，效果接近；是当前 LLM 对齐的事实标准。
5. **Safetensors 取代 pickle**：避免 pickle 反序列化漏洞（远程代码执行），加载快 5-10 倍；新模型默认 safetensors 格式。
6. **Hugging Face Hub 是 LLM 时代 GitHub**：模型上传下载、版本管理、Spaces 在线演示；月活 100 万+ 开发者。
7. **多框架统一是商业策略**：PyTorch（学术）+ TensorFlow（生产）+ JAX（Google）三框架同一 API，最大化用户覆盖。
8. **Text Generation Inference (TGI)** 是 Hugging Face 自家推理服务：Rust 实现的 LLM 服务，比 transformers 库直接推理快 5-10 倍。

## 五、跨项目引用

- [./pytorch.md](./pytorch.md) — Transformers 主要基于 PyTorch
- [./langchain.md](./langchain.md) — LangChain 调用 Hugging Face 模型构建应用
- [./llama.md](./llama.md) — LLaMA 模型权重在 HF Hub 上托管
- [./ollama.md](./ollama.md) — Ollama 简化本地 LLM 部署
- [./vllm.md](./vllm.md) — vLLM 是高性能 LLM 推理引擎，比原生 transformers 快 20+ 倍
- [./tensorflow.md](./tensorflow.md) — Transformers 也支持 TF 框架
- [./datasets.md](./datasets.md) — `datasets` 库与 transformers 深度集成
- [./peft.md](./peft.md) — PEFT 库是 LoRA 等高效微调方法的实现
