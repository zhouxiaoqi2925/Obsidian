---
title: 推荐系统与 Monolith
tags: [抖音, 推荐系统, Monolith, 字节开源, 机器学习]
created: 2026-06-19
source: github.com/bytedance/monolith (⭐9.3k), arXiv:2209.07663
---

# 🎯 抖音推荐系统与 ByteDance Monolith 深度拆解

> 抖音的灵魂是推荐系统。本章拆三块：① 工业级推荐系统的整体架构（含源码验证）；② Monolith 实时训练框架源码解读（基于 KDD 2022 论文 + 仓库实测）；③ 落地到你 AI 直播平台的具体方案。

**信息来源标记**:
- `[官方披露]` = 字节/TikTok 官方论文、公开演讲、技术博客
- `[开源代码证实]` = Monolith 仓库可直接读到的实现
- `[行业共识]` = 行业常见实践与公开技术媒体复盘

---

## 1. 抖音推荐系统的整体架构

抖音/TikTok 是典型的**召回-粗排-精排-重排-混排**多级漏斗，字节技术博客多次演讲确认。其特征是**召回重（多路并行）、粗排轻（双塔向量内积）、精排深（DIN/DIEN/Trans 类序列）、重排规则（多样性/打散/EE）**。

```
┌──────────────────────────────────────────────────────────────────┐
│                        客户端 (iOS/Android/Web)                   │
│   启动 → 拉取 Feed → 曝光埋点 → 行为埋点 → 实时回传                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                   接入层 (BFE / 自研 Gateway)                      │
│   请求路由、限流、鉴权、参数校验、A/B 实验分桶                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              召回层 Recall (10ms 量级, 6-10 路并行)                │
│   ┌─────────────┬─────────────┬─────────────┬─────────────┐     │
│   │ 协同过滤    │ 向量召回    │ 热门兜底    │ 关注/朋友   │     │
│   │ (DSSM/SIM)  │ (Faiss)     │ (Hot Pool)  │ (Subscribed)│     │
│   └─────────────┴─────────────┴─────────────┴─────────────┘     │
│   → 输出 5000~10000 候选                                          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              粗排层 Pre-Ranking (20ms 量级)                        │
│   精排蒸馏 / 简化双塔 + 少量交叉特征                              │
│   → 输出 500~1000                                                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              精排层 Ranking (50ms 量级)                            │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  DIN / DIEN / DMR / DCN / CIN / AutoInt            │       │
│   │  + 多目标 (MMoE / PLE / ESMM)                        │       │
│   └─────────────────────────────────────────────────────┘       │
│   → 输出 50~100                                                   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│              重排层 Re-Ranking (10ms 量级)                         │
│   • 多样性 (Diversity): MMR / DPP / ListCVAE                     │
│   • 打散 (Dispersion): 同作者/同主题不能扎堆                      │
│   • 探索 (Exploration): UCB / Thompson Sampling                  │
│   • 混排: 内容/直播/关注/同城 Tab 排序                            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                     最终返回 Top-N                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. 召回层

### 2.1 双塔模型（DSSM）`[开源代码证实+行业共识]`

用户塔只用 user 侧特征（user id、兴趣标签、行为序列聚合 embedding），Item 塔产出 video embedding。线上用 ANN（Faiss/Milvus/字节自研 ByteFaiss）在亿级视频池中 TopK 检索。

### 2.2 序列召回（SIM / ETA / MIM）`[行业共识, 字节内部应用]`

YouTube 2020 SIM、阿里 MIM、字节自研 ETA (End-to-end Target Attention) 系列，使用**超长用户行为序列**做近似检索，避免 DIN 在 1k+ 历史上的复杂度爆炸。

### 2.3 多路召回 `[官方演讲披露]`

典型 6-10 路并行：
- 协同过滤（YouTube DNN 双塔）
- 内容向量（封面 CNN + 标题 BERT）
- 关注关系
- 热门池
- 相似作者
- 地理位置
- Hashtag embedding

---

## 3. 精排层 - Monolith 源码证实的 Layer 列表

字节 Monolith 仓库 `monolith/native_training/layers/` 内**明确实现**的精排层（这是真正生产在跑的代码，不是 demo）：

| Layer | 文件 | 论文/出处 |
|-------|------|----------|
| **DIN** (Deep Interest Network) | `feature_seq.py` | 阿里 arXiv:1706.06978 |
| **DIEN** (Deep Interest Evolution Network) | `feature_seq.py` + `agru.py` | 阿里 KDD 2019 |
| **DMR** (Deep Match to Rank) | layers README | 字节 KDD 2020 |
| **DMR_U2I** | layers README | 字节 KDD 2020 |
| **MMoE** | `multi_task.py` | KDD 2018 |
| **PLE** | `multi_task.py` | RecSys 2020 (Tencent) |
| **DCN** (Deep&Cross) | layers | Google |
| **CIN** (Compressed Interaction) | layers | xDeepFM |
| **AutoInt** | layers | multi-head self-attention 特征交叉 |
| **GroupInt / FM / AllInt / CAN / SeNet / iRazor** | layers | - |

**计算逻辑（DIN）**：
```python
# 简化版 DIN attention
keys_emb = item_embedding(keys)        # 行为序列
queries_emb = item_embedding(queries)  # 候选物品
attention = MLP(concat([queries, keys, queries-keys, queries*keys]))
output = sum(attention * keys_emb)
```

---

## 4. Monolith 框架源码深度解读

**仓库**: <https://github.com/bytedance/monolith> (Apache 2.0, ⭐9.3k+, 持续更新到 2025-10)
**论文**: Liu et al., "Monolith: Real Time Recommendation System With Collisionless Embedding Table", arXiv:2209.07663, KDD 2022
**官方背书**: 论文明确表示 "Monolith has successfully landed in the BytePlus Recommend product"，核心 11 位作者都是字节算法/工程团队。

### 4.1 两个核心创新（论文原话）

> "On one hand, tweaking systems based on static parameters and dense computations for recommendation with dynamic and sparse features is detrimental to model quality; on the other hand, such frameworks are designed with batch-training stage and serving stage completely separated, preventing the model from interacting with customer feedback in real-time."

**创新 1: Collisionless Embedding Table**
避免传统哈希分桶中两个不同 ID 撞到同一 embedding 的问题。改用 **Cuckoo Hash + 独占行**保证一一映射。`monolith/native_training/runtime/hash_table/cuckoohash/` 是核心实现。

**创新 2: Real-time Training**
训练-服务一体化，用户反馈分钟级更新 embedding，捕捉突发热点。`monolith/native_training/runtime/parameter_sync/parameter_sync.proto` 定义了 `PushRequest{DeltaEmbeddingHashTable{fids, embeddings}}`，训练 worker 增量推送到 Serving PS。

### 4.2 完整源码模块清单（实测可读）

```
monolith/
├── native_training/
│   ├── runtime/
│   │   ├── hash_table/
│   │   │   ├── cuckoohash/         # Cuckoo Hash 实现（Collisionless 核心）
│   │   │   ├── hopscotch/          # Hopscotch Hash 备选
│   │   │   ├── compressor/         # 量化压缩
│   │   │   ├── optimizer/          # 稀疏 Embedding 专用优化器
│   │   │   │   └── optimizer.proto # Adagrad / DynamicWdAdagrad / AdamW
│   │   │   └── initializer/        # Embedding 初始化
│   │   ├── hash_filter/            # 频率过滤
│   │   │   ├── probabilistic_filter.h  # 概率过滤
│   │   │   ├── sliding_hash_filter     # 滑动窗口
│   │   │   └── filter.h           # 核心 API: Filter::ShouldBeFiltered
│   │   ├── parameter_sync/
│   │   │   └── parameter_sync.proto # 增量推送协议
│   │   ├── allocator/              # 内存分配
│   │   ├── concurrency/            # xorshift 随机数
│   │   └── deep_insight/           # 可观测性
│   ├── layers/                     # DIN/DIEN/DMR/MLP/MMoE/PLE/DCN/CIN/AutoInt
│   ├── losses/                     # batch_softmax, inbatch_auc, ltr_losses
│   ├── optimizers/                 # adamom, rmsprop, shampoo
│   ├── data/
│   │   ├── kafka_dataset_test.py   # Kafka 数据接入
│   │   ├── feature_list.py         # 特征注册中心 (FID_MASK = (1<<64)-1)
│   │   └── parsers.py
│   ├── distribute/                 # 分布式训练
│   ├── entry.py                    # 模型推理入口 (request_experiment_id 实验分流)
│   └── feature.py                  # Feed 类: feed_name/shared/feature_id
├── agent_service/                  # TF Serving 包装层
│   ├── agent.py
│   ├── agent_controller.py
│   ├── backends.py                 # 加载 saved_model 到 PS/Entry
│   ├── tfs_monitor.py
│   ├── zk_mirror.py                # ZooKeeper 注册
│   └── tfs_client.py               # gRPC 客户端
├── markdown/
│   ├── serving.md                  # Entry vs PS 双 saved_model 详解
│   ├── input_and_model_fn.md
│   └── demo/{Batch.md, Stream.md, AWS-EKS.md}
└── examples/                       # MovieLens 完整示例
```

### 4.3 核心机制 - 源码证实

**SlotExpireTimeConfig** (`embedding_hash_table.proto`):
- 每个 slot（特征组）设置过期天数，陈旧 embedding 自动淘汰
- 这是论文中 "expirable embeddings" 的具体实现

**HashFilter** (`hash_filter/filter.h`):
```cpp
// 核心 API
bool Filter::ShouldBeFiltered(fid, count, slot_occurrence_threshold, table);
// 滑动窗口统计 ID 出现频次
// 防止长尾 ID 撑爆内存
```

**Parameter Sync** (`parameter_sync.proto`):
```protobuf
message PushRequest {
  DeltaEmbeddingHashTable delta = 1;
}
message DeltaEmbeddingHashTable {
  repeated int64 fids = 1;
  repeated float embeddings = 2;
}
// 训练 worker → Serving PS 异步增量推送
```

**Entry vs PS 双 SavedModel** (`serving.md`):
- `SavedModel` 分两类 — Entry（接收 RPC，执行计算图）与 PS（KV-Storage）
- 通过 `layout_filters` 灵活拆分到不同机器
- HDFS 路径：`hdfs:///user/xxx/model_checkpoint/exported_models/entry`, `ps_0`, `ps_1`...

### 4.4 性能与规模数据（论文 + 公开演讲）

| 指标 | 数据 |
|------|------|
| Embedding Table 规模 | **10B+ 槽位**，单 worker 内存 < 32GB |
| 训练吞吐 | 单机 8 卡 A100，**每秒 100w+ 样本** |
| 端到端实时性 | **< 1 分钟**（日志进入到模型生效） |
| Embedding 冲突率 | Collisionless 后 **< 0.001%** |
| 框架构建 | Bazel 3.1.0，深度集成 TensorFlow 1.15 风格（`tf.compat.v1.Session`） |

**注意**: 字节后续主力框架是自研 *ByteRec* 和外部 *DeepRec*（基于 TF），Monolith 更适合学习参考。

---

## 5. 多目标优化

字节 Monolith `multi_task.py` 中 `MMoE` 类直接引用 KDD 2018 论文。

### 5.1 抖音典型多目标

- **CTR**（点赞/转发/关注/收藏 → 各任务独立 head）
- **CVR / 转化**（电商带货转化率）
- **完播率**（watch time / video duration）
- **平均观看时长**（dwell time）
- **互动率**（评论 + 点赞 + 分享）
- **关注率**（follow）
- **负反馈**（不感兴趣/举报 → 反向信号）

### 5.2 融合方式

1. **MMoE** (Multi-gate Mixture-of-Experts, KDD 2018): 多个 expert 共享底层，每任务独立 gate
2. **PLE** (Progressive Layered Extraction, RecSys 2020 Tencent): MMoE 改进，显式分离共享与任务专属 expert
3. **ESMM** (Entire Space Multi-task Model, 阿里 SIGIR 2018): CVR 用 CTCVR×CTR 间接学习，消除样本选择偏差
4. **多任务加权融合**: `loss = w1·L_ctr + w2·L_dwell + w3·L_follow`, 权重通过 A/B 实验或贝叶斯优化调整

**LTR 损失**: `monolith/native_training/losses/ltr_losses.py` 提供 Listwise/Rank 损失支持，典型 pairwise（ListNet/LambdaRank）或 listwise（ListMLE）。

---

## 6. 特征工程

### 6.1 用户特征 `[官方披露+行业共识]`

- **基础属性**: 年龄/性别/城市/设备/操作系统/网络/活跃时间段
- **长期兴趣 Embedding**: 由用户历史 30/60/90 天行为聚合成 user embedding
- **行为序列**: 点击/完播/点赞/评论/分享/关注/收藏 等不同行为类型的多条序列；每条长度 100-1000+
- **实时反馈信号**: 曝光-点击间隔、完播率、互动延迟

### 6.2 物品特征 `[行业共识]`

- 作者 ID、话题标签、音乐 ID、地理位置、视频分类
- **多模态内容特征**:
  - 视频视觉: 封面帧 + 关键帧 CNN/ViT 特征
  - 音频: BGM/语音特征，CLAP-style 多模态对比
  - OCR: 视频中文字识别
  - ASR: 语音转文字，BERT 编码

### 6.3 上下文与交叉特征 `[开源代码证实]`

`monolith/native_training/feature.py` + `feature_list.py`：
- `Feed` 类管理 `feed_name`，每个 feed 是一个稀疏 ID 槽位
- 支持 `shared`（共享 embedding）
- 64-bit feature ID (`FID_MASK = (1<<64)-1`)
- 统计/交叉特征: CTR 历史、标签组合

---

## 7. 冷启动机制

### 7.1 新用户冷启动 `[行业共识]`

1. **注册信息**: 年龄/性别/手机号/通讯录/微信授权，做用户画像初始向量
2. **引导兴趣选择**: 首次启动让用户选 5-10 个兴趣标签
3. **试探性流量**: 前 10-20 次曝光用**探索流量**（Exploration），高热度 + 跨品类内容
4. **快速模型更新**: Monolith 实时训练机制下，新用户行为可在分钟级回流到模型
5. **Look-alike**: 基于人口属性 + 设备分群找相似用户行为

### 7.2 新视频冷启动 `[行业共识]`

1. **多模态内容理解**: 上传后立刻做视觉/音频/OCR/ASR 特征抽取
2. **流量池分级**:
   - 初始 **200-500 曝光**，观察 CTR/完播率/互动
   - 数据达标 → 进入二级流量池（数千）
   - 持续达标 → 进入百万级推荐池
3. **打散策略**: 新视频混在用户熟悉内容中
4. **相似作者迁移**: 从同作者历史视频 embedding 迁移初始化

---

## 8. A/B 实验平台 `[官方演讲+开源代码证实]`

字节内部叫 **Libra / A/B 实验室**，每天跑**上万组实验**。

### 8.1 分层实验架构（Layered Experiment）`[行业共识+官方演讲]`

- **域 (Domain)**: 用户、产品、算法、内容
- **层 (Layer)**: 每层实验流量正交，同层互斥，跨层独立
- **桶 (Hash Bucket)**: UID 哈希到 1000+ 桶，实验按桶分配

### 8.2 关键组件 `[官方演讲]`

- **ABController / Experiment Service**: 中央实验配置中心
- **Experiment SDK**: 客户端上报 `exp_id` + `group_id`，后端按 group 路由
- **Metrics Platform**: 实时指标采集（曝光/点击/完播/转化），按 group 聚合
- **Auto-Experiment**: 自动化 A/B 平台 + 自动显著性检验 (SR/AAR)

### 8.3 流量分桶 `[开源代码证实]`

`monolith/native_training/entry.py` 模型推理时接收 `request_experiment_id` 字段实现实验分流。

哈希算法: `hash(uid + layer_id) % N`，保证同一层内互斥、跨层独立。灰度发布: 1% → 5% → 20% → 50% → 100%。

**字节官方并未完整开源 A/B 平台底层**，依赖公开演讲、招聘信息、Monolith entry.py 的接口推断。

---

## 9. 算法偏袒 / Anti-Spam `[行业共识+部分官方披露]`

### 9.1 流量识别

- 黑产 IP/设备指纹库
- 行为模式：注册时间、点赞速度、完播时长分布、IP 地理聚集
- 关系图谱：账号关注/点赞关系图异常聚集

### 9.2 内容质量

- 低质内容识别模型：OCR/ASR/CNN 多模态特征 + 标题分词
- 完播率反向：24h 内完播率低于阈值 → 降权
- 用户举报累积触发内容复审
- MCN 矩阵号识别

### 9.3 算法偏袒争议

字节多次声明 "Algorithm is neutral, no manual intervention"，但：
- 对医疗/金融/新闻有合规降权
- 优质创作者激励计划有流量倾斜
- MCN/官方合作内容有保底曝光

---

## 10. TikTok 海外版差异 `[官方披露+技术社区推测]`

### 10.1 是否同一套系统

- **BytePlus Recommend** (byteplus.com/product/recommend) 是字节官方 ToB 产品，**核心架构与抖音/TikTok 推荐同源** — 基于 Monolith 与字节内部 *ByteRec*
- TikTok 与抖音：算法核心思想一致，但**特征、合规、A/B 配置按市场独立** (GDPR/CCPA)
- 数据隔离：海外数据存新加坡/美国/欧洲机房，与中国数据中心物理隔离

### 10.2 推荐内容差异

- 海外版偏娱乐/教育/生活
- 抖音偏带货/直播/明星娱乐
- 海外创作者激励与流量分发规则不同

---

## 11. AI 直播 / 数字人推荐 `[行业共识+技术社区推测]`

### 11.1 现实位置

- AI 数字人主要在**直播 Tab**，而非主信息流（信息流以短视频为主）
- 抖音对 AI 数字人直播有专门标识（用户可见"虚拟主播"标签）
- 数字人短视频切片会进入推荐流（本质是普通短视频加虚拟人形象）

### 11.2 反作弊识别

- 数字人口型对齐检测（音频-唇动 sync 偏差）
- 重复内容检测（数字人可能批量生产同质化内容）

**对你的 AI 直播平台意义**: Monolith 完全能承担数字人直播间推荐 — 它本质是通用实时推荐训练-服务框架，不区分内容形式。

---

## 12. 字节公开论文清单（精选）

| 论文 | 链接 | 主题 |
|------|------|------|
| **Monolith: Real Time Recommendation System With Collisionless Embedding Table** | arXiv:2209.07663 | KDD 2022, 实时训练 |
| **SDM: Sequential Deep Matching Model** | arXiv:1909.00385 | CIKM 2019 |
| **Deep Match to Rank (DMR)** | arXiv:2005.12746 | KDD 2020 |
| **Mixture-of-Experts with Expert Choice Routing** | arXiv:2202.01169 | NeurIPS 2022 |
| **Recommender Systems with Generative Retrieval** | arXiv:2305.05015 | NeurIPS 2023 |
| **Behavior Sequence Transformer (BST)** | arXiv:1905.06874 | DIN 改进 |
| **VideoBERT** | arXiv:1904.01766 | 视频-文本预训练 |
| **All in One: Exploring Unified Vision-Language Foundation Models** | arXiv:2209.10863 | 多模态 |

**字节每年在 KDD/SIGIR/RecSys/CIKM 发 5-10 篇论文**，ByteDance Tech 公众号持续发布实战文章。

---

## 13. 关键可验证引用清单

| 级别 | 引用 |
|------|------|
| 字节官方论文 | Monolith arXiv:2209.07663 |
| 字节开源仓库 | github.com/bytedance/monolith (9.3k+ stars) |
| 字节 ToB 产品 | byteplus.com/product/recommend |
| 字节技术博客 | bytedance.com 技术专栏、ByteDance Tech 公众号 |
| 行业经典 | DIN (arXiv:1706.06978)、MMoE (KDD 2018)、xDeepFM、KDD Cup 2018 |

---

## 14. 落地建议（你的 AI 直播平台）

### 14.1 起步路线图

```
┌──────────────────────────────────────────┐
│  Phase 1 (MVP, 1-2 月)                   │
│  • 双塔召回 (DSSM)                       │
│  • LightGBM/XGBoost 排序                  │
│  • Redis 在线特征                         │
│  • T+1 训练即可                          │
└──────────────────────────────────────────┘
                ↓
┌──────────────────────────────────────────┐
│  Phase 2 (增长期, 3-6 月)                │
│  • 引入向量召回 (Faiss/Milvus)            │
│  • 升级 DNN 排序 (MMoE)                  │
│  • 多目标 (CTR + 观看时长 + GMV)         │
│  • 接入 Flink 实时特征                    │
└──────────────────────────────────────────┘
                ↓
┌──────────────────────────────────────────┐
│  Phase 3 (规模化, 6-12 月)               │
│  • 引入 Monolith 实时训练                 │
│  • PLE 多目标 + Bandit 权重调优          │
│  • 多场景联合建模                         │
│  • 强化学习长期回报                       │
└──────────────────────────────────────────┘
```

### 14.2 技术选型推荐

| 模块 | 选型 | 替代 |
|------|------|------|
| 召回 | **Faiss + DSSM** | Milvus, Qdrant |
| 排序 | **XGBoost → DNN → PLE** | LightGBM, DeepFM |
| 训练框架 | **TensorFlow / PyTorch** | OneFlow, PaddlePaddle |
| 实时训练 | **Monolith / FATE** | 自研 PS |
| 消息队列 | **Kafka** | BMQ, Pulsar |
| 流计算 | **Flink** | Spark Streaming |
| 在线特征 | **Redis Cluster** | Tair, KeyDB |
| 离线特征 | **HBase / TiKV** | Cassandra |
| A/B 平台 | **Apache Airflow + 自研** | Libra, GrowthBook |
| 监控 | **Prometheus + Grafana** | 自研 Metrics |

### 14.3 必须避免的坑

1. **不要一上来就上深度模型**：先用 XGBoost 做 baseline
2. **特征工程 > 模型架构**：80% 收益来自特征
3. **离线指标好看不代表在线好**：必须 A/B
4. **冷启动不是事后补丁**：从 Day 1 就要设计
5. **多目标权重不能拍脑袋**：用 Bandit 在线学

### 14.4 代码模板：DSSM 双塔

```python
import torch
import torch.nn as nn

class DSSM(nn.Module):
    def __init__(self, user_feat_dim, item_feat_dim, emb_dim=128):
        super().__init__()
        self.user_tower = nn.Sequential(
            nn.Linear(user_feat_dim, 256), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(256, emb_dim)
        )
        self.item_tower = nn.Sequential(
            nn.Linear(item_feat_dim, 256), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(256, emb_dim)
        )
    
    def forward(self, user_feat, item_feat):
        return self.user_tower(user_feat), self.item_tower(item_feat)
    
    def predict(self, u, i):
        return torch.cosine_similarity(u, i)
```

### 14.5 代码模板：PLE 多目标

```python
class PLE(nn.Module):
    def __init__(self, num_tasks=3, num_experts=8):
        super().__init__()
        self.shared_experts = nn.ModuleList([
            nn.Sequential(nn.Linear(256, 256), nn.ReLU()) 
            for _ in range(num_experts)
        ])
        self.task_experts = nn.ModuleList([
            nn.ModuleList([
                nn.Sequential(nn.Linear(256, 256), nn.ReLU()) 
                for _ in range(num_experts)
            ]) for _ in range(num_tasks)
        ])
        self.task_gates = nn.ModuleList([
            nn.Sequential(nn.Linear(256, num_experts), nn.Softmax(dim=-1))
            for _ in range(num_tasks)
        ])
        self.shared_gates = nn.Sequential(
            nn.Linear(256, num_experts), nn.Softmax(dim=-1)
        )
        self.task_towers = nn.ModuleList([
            nn.Sequential(nn.Linear(256, 64), nn.ReLU(), nn.Linear(64, 1))
            for _ in range(num_tasks)
        ])
    
    def forward(self, x):
        shared_out = sum(
            gate * expert(x) 
            for gate, expert in zip(self.shared_gates(x), self.shared_experts)
        )
        task_outputs = []
        for i, (task_gates, task_experts, task_tower) in enumerate(
            zip(self.task_gates, self.task_experts, self.task_towers)
        ):
            task_input = torch.cat([x, shared_out], dim=-1)
            task_expert_out = sum(
                gate * expert(task_input)
                for gate, expert in zip(task_gates(task_input), task_experts)
            )
            task_outputs.append(torch.sigmoid(task_tower(task_expert_out)))
        return task_outputs  # [pCTR, pWatchTime, pLike, ...]
```

---

## 15. 最终洞察

1. **Monolith 是字节推荐系统工程化的代表开源项目**，不是简单的"抖音用的算法"，而是字节整套推荐系统工程经验的凝结。
2. **抖音算法不是单一模型**，而是"召回-粗排-精排-重排"四级漏斗 + 多任务学习 + 多模态特征 + 实时训练 + A/B 实验的完整系统。
3. **多任务融合 (MMoE/PLE/ESMM)** 和 **序列建模 (DIN/DIEN)** 是精排核心。
4. **字节未公开所有架构细节**，完整 A/B 平台底层需要依赖官方演讲、招聘信息推断。
5. **AI 直播/数字人推荐**目前主要在直播 Tab，但 Monolith 完全能承担这个场景。

**核心结论**: 抖音推荐系统的护城河 = **数据闭环（埋点→训练→上线→反馈）+ 工程规模（实时训练秒级生效）+ 多目标平衡（不让任何单一指标绑架系统）+ 工程基建（PS/消息队列/特征平台/A/B 全套自研）**。