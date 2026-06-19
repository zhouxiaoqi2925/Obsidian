---
title: 05-风控与AI能力 AlphaRisk
tags: [平台架构/风控, 平台架构/AI, 蚂蚁/AlphaRisk, 蚂蚁/AntLLM]
created: 2026-06-19
updated: 2026-06-19
status: 完整
---

# 05 风控与 AI 能力 AlphaRisk

> 蚂蚁是**金融反欺诈的全球领导者**。本章拆解**AlphaRisk 智能风控引擎**（<100ms 实时决策）、**蚁盾反欺诈**、**智能投顾**、**AntLLM 蚂蚁大模型**，覆盖蚂蚁 AI 的**业务落地**和**技术架构**。

## 5.1 风控体系总览

```text
                蚂蚁风控体系 (ATEC 披露)
┌──────────────────────────────────────────────────┐
│  顶层: AlphaRisk (CTU 风控大脑)                   │
│         ↓ 决策中心                                │
│  中层: 五大引擎                                   │
│    ├─ 交易风控引擎 (支付反欺诈)                    │
│    ├─ 信贷风控引擎 (花呗/借呗)                     │
│    ├─ 营销风控引擎 (薅羊毛防控)                    │
│    ├─ 账户安全引擎 (登录/改密)                    │
│    └─ 反洗钱引擎 (AML)                            │
│  底层: 五大支撑                                   │
│    ├─ 设备指纹 (蚁盾)                            │
│    ├─ 行为画像 (10亿+ 用户)                       │
│    ├─ 风险图谱 (GraphX)                          │
│    ├─ AI 模型 (GBDT/DNN/LLM)                     │
│    └─ 规则引擎 (Drools/Aviator)                   │
└──────────────────────────────────────────────────┘
```

## 5.2 AlphaRisk 智能风控核心

### 5.2.1 公开披露的性能指标

| 指标 | 数值 | 来源 |
|---|---|---|
| 决策延时 | **<100ms** (P99 < 200ms) | ✅ ATEC 2018 |
| 日决策量 | **>10 亿次** | ✅ ATEC 2018 |
| 模型数 | **>1 万** | ✅ 2019 公开 |
| 规则数 | **>百万** | ✅ 2019 公开 |
| 特征数 | **>10 万** | ✅ 行业估算 |
| 误判率 | **<0.01%** | 🟡 行业估算 |
| 召回覆盖率 | **>99%** | 🟡 行业估算 |

### 5.2.2 AlphaRisk 决策流水线

```text
  AlphaRisk 100ms 决策链
┌──────────────────────────────────────────────────┐
│  T+0ms  请求接入 (RPC SOFABolt)                  │
│  T+5ms  设备指纹 (蚁盾 SDK)                      │
│  T+15ms 特征拉取 (KV, 用户画像)                  │
│  T+30ms 规则匹配 (Drools 内存引擎)                │
│  T+60ms 模型推理 (XGBoost / DNN / 联邦学习)      │
│  T+85ms 决策融合 (多模型 voting)                  │
│  T+95ms 返回 (PASS/REJECT/CHALLENGE)             │
└──────────────────────────────────────────────────┘
   100ms 内完成 5 步: 接入→指纹→特征→规则→模型→融合
```

### 5.2.3 五道防线模型

```text
   交易风控五道防线
┌──────────────────────────────────────────────────┐
│  ① 设备指纹  唯一标识设备 (IMEI/MAC/IDFA)        │
│     → 黑名单拦截 (黑产设备库)                     │
│  ② 行为分析  用户操作序列 (点击/停留/路径)        │
│     → 异常行为识别                                │
│  ③ 关系图谱  资金/通讯/账号关联 (GraphX)          │
│     → 团伙欺诈识别                                │
│  ④ AI 模型   XGBoost/DNN/Transformer             │
│     → 风险评分                                    │
│  ⑤ 规则融合  多模型投票 + 黑白名单                │
│     → 最终决策                                    │
└──────────────────────────────────────────────────┘
```

## 5.3 设备指纹（蚁盾）

### 5.3.1 设备指纹原理

```text
   设备指纹 = 设备硬件 + 软件 + 行为 + 网络
┌──────────────────────────────────────────────────┐
│  硬件层: IMEI / MAC / AndroidID / IDFA           │
│  软件层: 系统版本 / 内核信息 / 字体 / 时区        │
│  行为层: 加速度 / 陀螺仪 / 触摸压力 / 屏幕分辨率  │
│  网络层: IP / WiFi BSSID / 蓝牙 / 基站          │
└──────────────────────────────────────────────────┘
   ↓ 哈希 + 加密 + 编码
   设备指纹 ID (256 bit)
```

### 5.3.2 蚁盾 SDK 调用

```java
// Android 集成 (简化)
public class AntDeviceFingerprint {
    public String getFingerprint() {
        // 1. 多维度采集
        DeviceInfo info = new DeviceInfo();
        info.imei = getIMEI();
        info.mac = getMacAddress();
        info.androidId = getAndroidId();
        info.acceleration = readSensor(Sensor.TYPE_ACCELEROMETER);
        info.gyroscope = readSensor(Sensor.TYPE_GYROSCOPE);
        info.fonts = getInstalledFonts();
        info.battery = getBatteryInfo();
        info.gpu = getGPUInfo();

        // 2. 加密上报
        String token = encryptWithAESGCM(info.toJSON());
        return token;
    }
}
```

```javascript
// Web 端集成
const fingerprint = new AntShield({
    appId: 'your-app-id',
    onComplete: (token) => {
        // 上报到风控
        fetch('/pay', {
            headers: { 'X-Device-Token': token }
        });
    }
});
```

### 5.3.3 反作弊能力

| 攻击类型 | 防护方式 |
|---|---|
| 改机 (改 IMEI/MAC) | 行为特征交叉验证 |
| 模拟器 | GPU/传感器/电池特征 |
| 多开 | 应用签名 + 进程数 |
| Root/越狱 | 内核态检测 |
| 群控 | 设备聚集度 + IP 关联 |

## 5.4 AI 模型栈

### 5.4.1 模型分层

```text
   蚂蚁 AI 模型分层
┌──────────────────────────────────────────────────┐
│  应用层: 风控 / 营销 / 投顾 / 客服 / 信贷         │
├──────────────────────────────────────────────────┤
│  算法层: GBDT / DNN / Transformer / 强化学习     │
│         联邦学习 / 图神经网络 / 知识图谱          │
├──────────────────────────────────────────────────┤
│  框架层: XDL (蚂蚁深度学习) / AIFlow (调度)       │
├──────────────────────────────────────────────────┤
│  算力层: PAI (阿里 PAI 平台) / GPU 集群          │
└──────────────────────────────────────────────────┘
```

### 5.4.2 XDL 深度学习框架

**XDL (X-Deep Learning) = 蚂蚁自研分布式深度学习框架**（开源 2018）。

```python
# XDL 训练示例 (简化)
import xdl

# 1. 数据准备
train_data = xdl.Dataset('risk_train', batch_size=1024)

# 2. 模型定义
def model_fn(features):
    # Embedding 层
    user_emb = xdl.embedding('user_emb', features['user_id'], dim=64)
    item_emb = xdl.embedding('item_emb', features['item_id'], dim=64)
    cross = xdl.layers.cross([user_emb, item_emb], dim=8)
    # DNN
    fc1 = xdl.layers.dense(cross, units=128, activation='relu')
    fc2 = xdl.layers.dense(fc1, units=64, activation='relu')
    # 输出
    logits = xdl.layers.dense(fc2, units=1, activation='sigmoid')
    return logits

# 3. 训练
model = xdl.model(model_fn, train_data, optimizer='adam')
model.train(epochs=10, eval_set='risk_eval')
```

### 5.4.3 联邦学习（数据合规下的 AI）

```text
   联邦学习架构 (跨机构联合建模)
┌─────────────────────────────────────────────────┐
│  参与方 A (银行)  参与方 B (蚂蚁)  参与方 C (运营商)│
│   数据不出域        数据不出域      数据不出域     │
│        ↓                ↓              ↓         │
│   本地训练          本地训练         本地训练      │
│        ↓                ↓              ↓         │
│   加密梯度 → 中央协调器 (仅聚合, 不看数据)        │
│        ↓                                         │
│   全局模型更新                                     │
│   循环迭代                                        │
└─────────────────────────────────────────────────┘
   蚂蚁案例: 微众银行 + 蚂蚁 + 联通 (信贷模型)
```

## 5.5 风险图谱 (GraphX)

### 5.5.1 关联网络

```text
   风险图谱: 10亿+ 节点, 千亿+ 边
┌──────────────────────────────────────────────────┐
│  节点类型:                                          │
│    用户/账号/设备/IP/手机号/银行卡/商户            │
│                                                   │
│  边类型:                                            │
│    转账/支付/登录/绑卡/通讯录/共同设备             │
│                                                   │
│  应用:                                             │
│    团伙欺诈识别 (2-hop 共同邻居)                  │
│    失信关联 (法院/失信/老赖)                      │
│    资金链路追踪 (反洗钱)                          │
│    羊毛党识别 (群控特征)                          │
└──────────────────────────────────────────────────┘
```

### 5.5.2 GraphX 实现 (Scala)

```scala
// 团伙欺诈识别: 共享设备的用户聚集
val deviceEdges: RDD[Edge[String]] = sc.parallelize(Seq(
  Edge(1L, 2L, "device-shared"),  // 用户1-用户2 共享设备
  Edge(1L, 3L, "device-shared"),
  Edge(4L, 5L, "device-shared")
))

val graph = Graph(users, deviceEdges)

// 标签传播算法 (LPA) 检测社区
val communities = graph.labelPropagation(maxSteps = 5)
// 同一社区用户标记为 "团伙风险"
```

## 5.6 信贷风控（花呗/借呗）

### 5.6.1 贷前-贷中-贷后

```text
   信贷风控全流程
┌──────────────────────────────────────────────────┐
│  贷前 (毫秒级)                                   │
│    ├─ 反欺诈 (设备/IP/行为/黑名单)               │
│    ├─ 信用评分 (芝麻信用 + 自有模型)              │
│    ├─ 额度定价 (风险定价模型)                     │
│    └─ 决策 (通过/拒绝/降额)                      │
│                                                   │
│  贷中 (实时)                                     │
│    ├─ 异常交易监控                                │
│    ├─ 还款能力动态评估                            │
│    └─ 提额/降额调整                               │
│                                                   │
│  贷后 (T+0/T+1/T+7/T+30)                         │
│    ├─ 自动扣款 (T+0 主动扣)                      │
│    ├─ 催收分层 (M1/M2/M3+ 不同策略)              │
│    ├─ 不良资产处置 (ABS / 核销)                   │
│    └─ 复贷决策 (好客户二次授信)                   │
└──────────────────────────────────────────────────┘
```

### 5.6.2 风险定价模型

```python
# 风险定价: 利率 = base + α·风险
class RiskPricing:
    def price(self, user_id, amount, term):
        # 1. 基础利率
        base_rate = 0.04  # 月 4%

        # 2. 风险分数
        risk = self.risk_model.predict(user_id)  # 0-1

        # 3. 客户分层
        if risk < 0.1:  # 优质
            rate = base_rate
        elif risk < 0.3:  # 正常
            rate = base_rate + 0.005
        elif risk < 0.6:  # 关注
            rate = base_rate + 0.015
        else:  # 高风险
            rate = base_rate + 0.03

        # 4. 计算等额本息
        installment = self.calc_installment(amount, rate, term)
        return {"rate": rate, "installment": installment}
```

## 5.7 反洗钱 (AML)

### 5.7.1 监管要求

```text
   反洗钱三原则 (FATF)
   ├─ 客户身份识别 (KYC)
   ├─ 大额/可疑交易报告 (CTR/STR)
   └─ 客户风险分级 (CDD/EDD)

   中国监管: 单笔/当日 > 5万/20万 → 自动上报
   跨境: > 1万人民币 → 自动上报
```

### 5.7.2 可疑交易识别

```python
# 蚂蚁反洗钱规则示例
class AMLDetector:
    def detect(self, txn):
        # 规则 1: 分散转入集中转出
        if self.is_split_in(txn) and self.has_aggregated_out(txn):
            return Suspicious('R001', 'split-aggregate')

        # 规则 2: 频繁接近报告阈值
        if self.near_threshold_count(txn) > 5:
            return Suspicious('R002', 'threshold-evasion')

        # 规则 3: 异常跨境
        if txn.cross_border and txn.amount > 50000:
            return Suspicious('R003', 'cross-border-large')

        # 规则 4: 睡眠账户激活
        if self.is_dormant_account(txn) and txn.amount > 10000:
            return Suspicious('R004', 'dormant-activation')

        return None
```

## 5.8 智能投顾（帮你投）

### 5.8.1 投资决策流水线

```text
   帮你投决策链
┌──────────────────────────────────────────────────┐
│  ① 用户画像                                       │
│     年龄/收入/负债/风险偏好/投资经验              │
│  ② 风险测评 (问卷 + 行为推断)                     │
│     保守 C1-C2 / 稳健 C3 / 平衡 C4 / 进取 C5     │
│  ③ 资产配置 (BL 模型 + 风险预算)                  │
│     股 20% / 债 60% / 金 5% / 海外 15%          │
│  ④ 标的筛选 (全球 ETF 池)                        │
│     Vanguard / 贝莱德 / iShares                  │
│  ⑤ 动态再平衡 (季度调仓)                          │
│     偏离目标 > 5% 触发再平衡                      │
└──────────────────────────────────────────────────┘
```

### 5.8.2 Black-Litterman 配置模型

```python
# BL 模型: 融合市场均衡 + 主观观点
import numpy as np

class BLConfig:
    def optimize(self, expected_returns, market_caps, views, confidences):
        # 1. 市场隐含收益
        market_returns = self.implied_returns(market_caps)
        # 2. 主观观点调整
        posterior = self.blend(market_returns, views, confidences)
        # 3. 均值方差优化
        weights = self.mvo(posterior, cov_matrix)
        return weights
```

## 5.9 AntLLM 蚂蚁大模型

### 5.9.1 公开披露

- 蚂蚁集团推出大模型"**AntLLM**"（2023 年公开）
- 同时推出"**支小宝**"、"**蚂小财**"等 ToC 应用
- "**蚁天鉴**" 金融大模型（监管科技）
- "**蚁鉴**" 安全大模型

### 5.9.2 蚂蚁大模型矩阵

```text
   蚂蚁大模型矩阵
┌──────────────────────────────────────────────────┐
│  基础大模型:                                      │
│    ├─ AntLLM (通用大模型)                         │
│    └─ 蚁天鉴 (金融风控大模型)                     │
│  行业大模型:                                      │
│    ├─ 支小宝 (理财助手)                          │
│    ├─ 蚂小财 (投资助手)                          │
│    ├─ 医疗大模型                                  │
│    └─ 政务大模型                                  │
│  安全大模型:                                      │
│    ├─ 蚁鉴 (反诈/反洗钱)                          │
│    └─ 风控大模型 (AlphaRisk 增强)                 │
└──────────────────────────────────────────────────┘
```

### 5.9.3 AntLLM 技术栈

```text
   AntLLM 训练推理栈
┌──────────────────────────────────────────────────┐
│  框架:   自研 (与 Megatron/DeepSpeed 类似)        │
│  硬件:   A100/H800 GPU 集群 (上万卡)              │
│  数据:   通用语料 + 金融/合规/法律垂直语料         │
│  训练:   SFT → RLHF → DPO → RLAIF                │
│  推理:   vLLM/TGI + 自研 (持续批处理)            │
│  部署:   阿里云 PAI / 蚂蚁自建 GPU 池             │
└──────────────────────────────────────────────────┘
```

### 5.9.4 支小宝理财助手

```text
   支小宝对话流
用户: "我有 10 万块, 想稳健一点"
  ↓
意图识别: 资产配置咨询
  ↓
风险评估: 调取用户画像 + 短期问卷
  ↓
配置建议: BL 模型生成组合
  ↓
自然语言解释: AntLLM 转成大白话
  ↓
下单: 跳转帮你投 一键下单
```

### 5.9.5 蚁天鉴金融风控大模型

```text
   蚁天鉴 = 金融领域的 GPT-风控
┌──────────────────────────────────────────────────┐
│  训练数据:                                        │
│    监管政策 50万+ 条款                             │
│    法院判例 100万+ 案例                            │
│    风控报告 1000万+ 内部文档                      │
│                                                   │
│  能力:                                            │
│    合同要素提取 (95%+ 准确率)                     │
│    监管条款问答 (90%+ 准确率)                     │
│    异常交易归因 (辅助 AlphaRisk)                  │
│    反洗钱报告生成 (提升 80% 效率)                  │
└──────────────────────────────────────────────────┘
```

## 5.10 智能客服与运营

### 5.10.1 95188 客服系统

```text
   智能客服分层
┌──────────────────────────────────────────────────┐
│  L1 智能 IVR (语音/文本)                          │
│     ↓ 未解决                                      │
│  L2 智能文本客服 (AntLLM 增强)                    │
│     ↓ 复杂问题                                    │
│  L3 人工客服 (智能辅助)                            │
│                                                   │
│   95% 咨询在 L1+L2 自助解决                       │
└──────────────────────────────────────────────────┘
```

### 5.10.2 智能核保（保险）

```text
   智能核保: 健康告知 → 风险评估 → 自动承保
   ├─ OCR 识别体检报告
   ├─ NLP 解析既往病史
   ├─ 知识图谱匹配核保规则
   └─ 秒级出结论
```

## 5.11 隐私计算

### 5.11.1 蚂蚁隐语 (SecretFlow)

- 开源: <https://github.com/secretflow/secretflow> ⭐ 2.4k+
- 框架: 联邦学习 + 安全多方计算 (MPC) + 可信执行环境 (TEE) + 差分隐私

```python
# 隐语联邦学习示例
import secretflow as sf

# 1. 多方初始化
sf.init(['alice', 'bob', 'carol'], address='cluster')

# 2. 各方加载数据 (不出域)
alice = sf.PYU('alice')
bob = sf.PYU('bob')

alice_data = alice(load_data)('/path/to/alice.csv')
bob_data = bob(load_data)('/path/to/bob.csv')

# 3. 联邦训练
vdf = sf.to_vdf({'alice': alice_data, 'bob': bob_data})
model = sf.ml.fl_models.LogisticRegression()
model.fit(vdf, epochs=10)
```

## 5.12 AI 在我们项目（直播 + 跨境）的借鉴

### 5.12.1 直播场景 AI 借鉴

| 蚂蚁 AI | 直播场景借鉴 |
|---|---|
| AlphaRisk | 直播打赏反作弊 (机器人/羊毛党) |
| 设备指纹 | 直播多账号识别 (黑产) |
| 风险图谱 | 直播电商薅羊毛团伙识别 |
| 智能客服 | 直播 AI 客服 7x24h |
| 智能投顾 | 直播带货选品推荐 |
| AntLLM | 直播 AI 数字人主播 (与我们项目结合)|

### 5.12.2 TikTok Shop 跨境风控借鉴

```text
   TikTok Shop 反欺诈 5 道防线 (借鉴)
┌──────────────────────────────────────────────────┐
│  ① 设备指纹  防止刷单/批量注册                   │
│  ② 行为分析  异常点击/下单/支付                  │
│  ③ 关系图谱  店铺关联/资金链路                   │
│  ④ AI 模型   XGBoost/DNN 风险评分                │
│  ⑤ 规则融合  风控决策引擎                        │
└──────────────────────────────────────────────────┘
```

## 5.13 关键论文与演讲

| 标题 | 会议/期刊 | 年份 | 链接 |
|---|---|---|---|
| OceanBase: A 707M TPC-C | OSDI | 2020 | usenix.org |
| AntShield: 设备指纹 | Black Hat | 2018 | 公开演讲 |
| XDL: Scalable Deep Learning | KDD | 2018 | dl.acm.org |
| Privacy-Preserving Federated | SIGIR | 2021 | 公开演讲 |
| 蚂蚁大规模图计算 | VLDB | 2020 | 公开演讲 |

## 5.14 数据来源与可信度

| 数据 | 来源 | 可信度 |
|---|---|---|
| AlphaRisk <100ms | ATEC 2018 演讲 | ✅ 高 |
| 设备指纹能力 | 公开技术博客 | ✅ 高 |
| 联邦学习框架 | 隐语 GitHub | ✅ 高 |
| AntLLM 推出 | 蚂蚁集团 2023 | ✅ 高 |
| 风险图谱规模 | ATEC 2018 | 🟡 估算 |
| 信用分模型 | 公开论文 | ✅ 高 |

## 5.15 小结

蚂蚁的**AI + 风控**是**业务护城河**最深的护城河：
- **AlphaRisk** 把风控做到 **<100ms** 实时决策
- **设备指纹** 全球黑产对抗
- **风险图谱** 识别团伙欺诈
- **联邦学习** 解决数据合规
- **AntLLM** 让金融大模型落地

> 下一章给出**对 TikTok Shop + AI 直播的具体可借鉴清单**。
