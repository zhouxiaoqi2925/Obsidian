---
tags: [claude-skill, engineering, rag, llm, ai]
domain: engineering
source: claude-skills/engineering/skills/rag-architect
version: 2.9.0
---

# rag-architect

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/rag-architect
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\rag-architect`
- **版本**：2.9.0
- **分类**：Engineering > AI/ML > RAG
- **触发词**："Use when the user asks to design RAG systems, retrieval-augmented generation, vector databases, or LLM applications"

## 2. 一句话定位
设计完整的 RAG（Retrieval-Augmented Generation）系统架构，包括 chunking、embedding、retrieval、reranking、generation 的全链路。

## 3. 解决什么问题
- RAG 系统效果差（chunking 不合理、retrieval 召回低）
- 不知道选什么 embedding 模型、向量数据库
- 缺乏系统的 RAG 评估方法

## 4. RAG 系统架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Document   │ ──→ │  Chunking    │ ──→ │  Embedding  │
│  Sources    │     │  Strategy    │     │  Model      │
└─────────────┘     └──────────────┘     └─────────────┘
                                                  ↓
                                          ┌──────────────┐
                                          │ Vector Store │
                                          │ (Pinecone/   │
                                          │  Milvus/     │
                                          │  pgvector)   │
                                          └──────────────┘
                                                  ↓
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Generated  │ ←── │  Generation  │ ←── │  Reranking  │
│  Answer     │     │  (LLM)       │     │  (optional) │
└─────────────┘     └──────────────┘     └─────────────┘
                                                  ↑
                                          ┌──────────────┐
                                          │  Retrieval   │
                                          │  (Hybrid:    │
                                          │  BM25+Vec)   │
                                          └──────────────┘
```

## 5. 工作流（核心）

### Step 1: chunking_optimizer
- 选择分块策略（fixed-size / semantic / hierarchical）
- 选择 chunk size（典型 256-1024 tokens）
- 选择 overlap（10-20%）
- 输出：chunking_config.json

### Step 2: rag_pipeline_designer
- 选择 embedding 模型（OpenAI text-embedding-3 / BGE / Cohere）
- 选择向量数据库（Pinecone / Milvus / Weaviate / pgvector）
- 设计 retrieval 策略（vector / BM25 / hybrid）
- 设计 reranker（Cross-encoder / Cohere Rerank）
- 输出：pipeline_architecture.md

### Step 3: retrieval_evaluator
- 准备评估集（queries + ground truth）
- 计算：Recall@K, MRR, NDCG
- 输出：evaluation_report.json

### Step 4: 调优迭代
- 基于评估结果优化
- 调整 chunking / embedding / retrieval 参数

## 6. 源码解析

### 6.1 Python 工具脚本
- **chunking_optimizer.py** — 分块策略优化
- **rag_pipeline_designer.py** — Pipeline 设计
- **retrieval_evaluator.py** — 检索质量评估

### 6.2 参考文档
- **chunking_strategies_comparison.md** — 6 种分块策略对比
- **embedding_model_benchmark.md** — Embedding 模型基准
- **rag_evaluation_framework.md** — RAG 评估框架

## 7. 关键决策点

### 7.1 Chunking 策略
| 策略 | 适用 | 优缺点 |
|------|------|--------|
| Fixed-size | 通用 | 简单，但可能切断语义 |
| Semantic | 长文档 | 保持语义，但慢 |
| Hierarchical | 多级摘要 | 支持多粒度，但复杂 |
| Sentence | 短文本 | 保留完整句子 |
| Sliding window | 连续文本 | 有 overlap，减少信息丢失 |

### 7.2 Embedding 模型
| 模型 | 维度 | 适用 |
|------|------|------|
| OpenAI text-embedding-3-small | 1536 | 通用、成本低 |
| OpenAI text-embedding-3-large | 3072 | 高质量 |
| BGE-large-en-v1.5 | 1024 | 开源、英语 |
| BGE-large-zh-v1.5 | 1024 | 开源、中文 |
| Cohere embed-english-v3.0 | 1024 | 多语言 |

### 7.3 向量数据库
| 数据库 | 适用规模 | 特点 |
|--------|---------|------|
| Pinecone | 中大型 | 全托管、按需扩展 |
| Milvus | 大型 | 开源、高性能 |
| Weaviate | 中型 | 开源、GraphQL |
| pgvector | 小型 | 与 Postgres 集成 |
| Chroma | 原型 | 简单易用 |

## 8. 调用示例

### 示例 1：企业知识库 RAG
```
用户：我要做一个企业内部知识库的 RAG 系统

Claude（自动调用 rag-architect）：
1. chunking_optimizer → semantic chunking，512 tokens，10% overlap
2. rag_pipeline_designer：
   - Embedding: BGE-large-zh-v1.5（中文）
   - Vector DB: Milvus（自托管）
   - Retrieval: hybrid (BM25 + vector)
   - Reranker: BGE-reranker-large
3. retrieval_evaluator → 用 50 个真实 query 评估
4. 报告：Recall@10 = 0.87，MRR = 0.78
```

## 9. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`
- **配合**：`llm-cost-optimizer`、`observability-designer`
- **后置**：`prompt-engineer-toolkit`

## 10. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\rag-architect`
- SKILL.md: `SKILL.md`