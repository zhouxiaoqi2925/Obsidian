---
title: AI 直播平台落地 Checklist (基于 7 平台拆解)
created: 2026-06-21
updated: 2026-06-21
status: 完整
tags: [AI直播/落地/技术选型/可借鉴]
covers: [alipay, wechat, doubao, shipinhao, kuaishou]
applies_to: [ai-live-platform, TikTok Shop]
---

# AI 直播平台落地 Checklist

> **目的**: 把 7 平台拆解中可落地的设计点，按 **MVP → 规模化 → 头部** 三档，整理为可执行的开发/上线 Checklist。
> **适用范围**: 你的 AI 直播平台 (`C:\skill\ai-live-platform\`) + TikTok Shop 跨境业务。
> **核心来源**: 视频号 (低延迟/WebRTC/Mars) + 字节 (Monolith/Kitex/Eino) + 支付宝 (风控/单元化) + 快手 (直播推流) + 小红书 (笔记种草) + 微信 (MMKV/WCDB) + 豆包 (LLM Agent)。

---

## 一、总体分阶段路线图

```
┌──────────────────────────────────────────────────────────────────┐
│  Phase 0   MVP 验证        (1-2 个月) - 1 个直播间 + 1000 用户  │
│  Phase 1   规模化 (1-10 万 DAU) (3-6 个月) - 多房间 + 10 万 DAU │
│  Phase 2   头部 (10 万+ DAU)  (6-12 个月) - 多活 + 100 万 DAU   │
│  Phase 3   商业化 (12+ 月)   - GMV + 多币种 + 跨境              │
└──────────────────────────────────────────────────────────────────┘
```

每阶段对应不同的技术选型深度，下文按模块拆分。

---

## 二、网络层 Checklist

### Phase 0 (MVP)
- [ ] **HTTP/HTTPS API**: Go + Gin/Echo (单实例)
- [ ] **WebSocket**: Gorilla/Go 官方库 (长连基础)
- [ ] **CDN 选型**: Cloudflare/CloudFront/七牛/腾讯云直播
- [ ] **推流**: RTMP + CDN 转码 + HLS 播放
- [ ] **最低延迟**: 5-10s (HLS 即可, 业务: 录播/普通直播)

### Phase 1 (规模化)
- [ ] **长连接**: 微信 Mars 移植/Go 改造 (参考 `github.com/Tencent/Mars`)
  - [ ] 实现 `MComplexConnect` 多 IP 竞速
  - [ ] 实现 `SocketBreaker` pipe 急停
  - [ ] 断线重连: 退避 + WiFi/4G 切换
- [ ] **推流升级**: QUIC 推流 (抗抖动)
- [ ] **播放降级**: 4 档延迟 (WebRTC/QUIC/HTTP-FLV/HLS) — 参考视频号
- [ ] **CDN 多厂商**: 阿里云 + 腾讯云 + 七牛 (主备)
- [ ] **DDoS 防护**: 接入 WAF/CDN 自带防护

### Phase 2 (头部)
- [ ] **WebRTC 互动直播**: SFU + Mesh 混合
  - [ ] SFU: mediasoup / LiveKit / Janus / SRS
  - [ ] 业务: PK / 多人连麦 / 弹幕同步
- [ ] **5G 消息通道**: 走 WebTransport 协议
- [ ] **边缘计算**: Cloudflare Workers / 阿里云边缘 / Vercel
- [ ] **多活**: 简化单元化 (按用户 ID 哈希分单元)
- [ ] **全球加速**: Anycast IP + BGP 调度

### Phase 3 (商业化)
- [ ] **多协议网关**: 统一 WebRTC / QUIC / RTMP / HLS 入口
- [ ] **QUIC 0-RTT**: 重复连接秒开
- [ ] **AI 数字人低延迟**: 数字人推流 < 1s 延迟

### 关键源码参考
```
C:\Users\15389\source\Mars\mars\comm\socket\complexconnect.h       (多 IP 竞速)
C:\Users\15389\source\Mars\mars\comm\unix\socket\socketbreaker.h   (急停开关)
C:\Users\15389\source\Mars\mars\comm\socket\socketpool.h            (连接池)
```

---

## 三、客户端 Checklist

### Phase 0 (MVP)
- [ ] **Android**: Kotlin + Jetpack Compose (现代) 或 Kotlin + View (兼容)
- [ ] **iOS**: Swift + SwiftUI (现代) 或 Swift + UIKit (兼容)
- [ ] **Web 端**: React/Vue + HLS.js (播放)
- [ ] **KV 存储**: SharedPreferences (Android) / UserDefaults (iOS) 即可
- [ ] **本地数据库**: SQLite (Android Room / iOS GRDB)

### Phase 1 (规模化)
- [ ] **KV 替换**: MMKV (微信开源) — 性能提升 10x
  - [ ] 路径: `github.com/Tencent/MMKV`
  - [ ] Android: 直接用 MMKV
  - [ ] iOS: 直接用 MMKV
  - [ ] Flutter/RN: 走 Bridge
- [ ] **数据库升级**: WCDB (微信开源) — 加密 + 高效
  - [ ] 路径: `github.com/Tencent/WCDB`
  - [ ] 支持 ORM + 全文检索
- [ ] **崩溃监控**: Sentry / Bugly
- [ ] **性能监控**: 自研 APM (首屏/卡顿/ANR)

### Phase 2 (头部)
- [ ] **跨端**: 字节 Lynx / 微信 kbone (参考)
- [ ] **动态化**: Tinker (Android) / Hotfix (iOS) 热修复
- [ ] **包大小优化**: ABI 拆分 / App Bundle
- [ ] **启动优化**: 1.5s 内首屏 (参考微信)

### Phase 3 (商业化)
- [ ] **数字人 SDK**: 集成可灵 AI / 即梦 AI
- [ ] **AI 美颜**: 商汤/旷视 SDK
- [ ] **多语言**: i18n + l10n (东南亚 5 国 + 欧美)

---

## 四、后端服务 Checklist

### Phase 0 (MVP)
- [ ] **语言**: Go (后端主力) / Python (AI 部分) / Node (少量 BFF)
- [ ] **Web 框架**: Gin (Go) / FastAPI (Python)
- [ ] **RPC**: gRPC (Go) — 业务量小时够用
- [ ] **数据库**: MySQL 8 + 主从
- [ ] **缓存**: Redis (单实例即可)
- [ ] **消息队列**: Redis Stream (MVP) / NATS
- [ ] **对象存储**: 阿里云 OSS / 腾讯云 COS
- [ ] **搜索**: MySQL FULLTEXT (MVP)

### Phase 1 (规模化)
- [ ] **RPC 升级**: Kitex (字节开源 Go RPC)
  - [ ] 路径: `github.com/cloudwego/kitex`
  - [ ] 配套: Hertz (HTTP) + Netpoll (IO)
  - [ ] 服务发现: Consul / Polaris
- [ ] **数据库分库分表**: ShardingSphere / TiDB
- [ ] **消息队列**: TubeMQ / RocketMQ / Kafka
  - [ ] TubeMQ: `github.com/Tencent/TubeMQ`
- [ ] **缓存**: Redis Cluster (3 主 3 从)
- [ ] **对象存储**: 自建 MinIO / 阿里云 OSS
- [ ] **搜索引擎**: Elasticsearch (笔记/评论/弹幕搜索)
- [ ] **配置中心**: Nacos / Apollo

### Phase 2 (头部)
- [ ] **Service Mesh**: MOSN (蚂蚁) / 自研
  - [ ] MOSN: `github.com/mosn/mosn`
- [ ] **多活**: 简化单元化
  - [ ] UserID 哈希 → CellID
  - [ ] 各 Cell 容量对等
  - [ ] 故障秒级切换
- [ ] **数据库**: OceanBase (支付宝) / TiDB
  - [ ] OceanBase: `github.com/oceanbase/oceanbase`
- [ ] **监控**: 蓝鲸 / 自研 (CMDB + 监控 + 日志 + 告警)
  - [ ] 蓝鲸: `github.com/Tencent/bk-PaaS`
- [ ] **链路追踪**: Jaeger / SkyWalking
- [ ] **限流熔断**: Sentinel (阿里) / Sentinel-Go

### Phase 3 (商业化)
- [ ] **多语言**: Go (主流) + Java (兼容) + Rust (性能模块)
- [ ] **异地多活**: 两地三中心 / 三地五活
- [ ] **单元化**: Cell + RZone + GZone 三层 (参考蚂蚁)
- [ ] **单元化代码**:
```go
// CellRouter 寻址 (蚂蚁 SOFA 风格)
type CellRouter struct {
    rule *HashRule
}

func (r *CellRouter) Route(userID string, cellSet []string) (string, error) {
    bucket := crc32.ChecksumIEEE([]byte(userID)) % uint32(len(cellSet))
    cell := cellSet[bucket]
    if !r.isHealthy(cell) {
        cell = r.fallbackCell(userID)
    }
    return cell, nil
}
```

---

## 五、AI / LLM Agent Checklist

### Phase 0 (MVP)
- [ ] **LLM API**: OpenAI GPT-4o / 豆包 Doubao-1.5 / DeepSeek
- [ ] **Prompt 模板**: Few-shot + CoT
- [ ] **向量化**: OpenAI Embedding / Doubao Embedding
- [ ] **向量库**: Chroma / Milvus (单实例)
- [ ] **数字人**: HeyGen / 商汤 (API 接入即可)
- [ ] **TTS**: OpenAI TTS / 字节火山 TTS
- [ ] **ASR**: OpenAI Whisper / 字节火山 ASR

### Phase 1 (规模化)
- [ ] **Agent 框架**: Eino (字节开源 Go 编排)
  - [ ] 路径: `github.com/cloudwego/eino`
  - [ ] 配套: DeerFlow (Deep Research)
  - [ ] 路径: `github.com/bytedance/deer-flow`
- [ ] **RAG 框架**: 自研 + LangChain (Python)
- [ ] **多模态**: 豆包 1.5 多模态 / GPT-4o Vision
- [ ] **AI 数字人主播**: 即梦 AI / 可灵 AI 接入
- [ ] **AI 实时翻译**: 东南亚 5 国 + 欧美主要语言
- [ ] **AI 内容生成**: 商品文案 / 直播话术 / 弹幕回复

### Phase 2 (头部)
- [ ] **自训练模型**: LoRA 微调 (豆包 1.5 / DeepSeek)
- [ ] **模型推理优化**: vLLM / TensorRT-LLM / LMDeploy
- [ ] **多 Agent 协作**: 主播 Agent + 运营 Agent + 风控 Agent
- [ ] **实时 AI 互动**: AI 实时回答弹幕 / AI 实时控场
- [ ] **AI 数字人定制**: 训练专属数字人 (品牌 IP)
- [ ] **AIGC 视频**: 数字人直播 + AI 生成短视频 + 自动剪辑

### Phase 3 (商业化)
- [ ] **自研模型**: 万卡 GPU 集群 (与火山/腾讯云合作)
- [ ] **多模态 Agent**: 视觉 + 语音 + 文本融合决策
- [ ] **AI 风控**: 实时识别违规弹幕 / 欺诈订单

### 关键源码参考
```
github.com/cloudwego/eino                    (Go AI 编排)
github.com/bytedance/deer-flow               (Deep Research)
github.com/bytedance/dolphin                 (分布式调度)
github.com/bytedance/monolith                (实时学习)
```

---

## 六、推荐系统 Checklist

### Phase 0 (MVP)
- [ ] **召回策略**: 关注流 + 热门流 (简单规则)
- [ ] **排序**: 时间倒序 + 简单加权
- [ ] **特征**: 用户画像 + 视频标签
- [ ] **存储**: MySQL + Redis (画像/特征)
- [ ] **离线**: Python + Pandas + sklearn

### Phase 1 (规模化)
- [ ] **召回**: 双塔模型 (用户塔 + 视频塔)
  - [ ] 负采样: 随机负样本 + 曝光未点击
  - [ ] 向量化: 64 维 → 128 维
  - [ ] 检索: Faiss (单实例)
- [ ] **粗排**: LR / LightGBM
- [ ] **精排**: DNN + 多任务 (CTR / 点赞 / 评论)
- [ ] **重排**: 多样性打散 + 业务规则
- [ ] **冷启动**: 新视频 / 新用户兜底 (热门池 + 兴趣)

### Phase 2 (头部)
- [ ] **召回升级**: 多路召回
  - [ ] 双塔 (兴趣)
  - [ ] Item2Vec (相似视频)
  - [ ] GraphSAGE (协同过滤)
  - [ ] 关注流
  - [ ] 朋友点赞 (社交)
  - [ ] 群聊转发 (微信生态)
- [ ] **精排升级**: DCN + Wide&Deep + MMoE 多任务
  - [ ] DCN: x_{l+1} = x_0 ⊙ (W_l · x_l + b_l) + x_l
  - [ ] Wide&Deep: 记忆 + 泛化
  - [ ] MMoE: 7 任务 (CTR/点赞/评论/分享/关注/观看时长/进直播间)
- [ ] **重排升级**:
  - [ ] 多样性打散 (类目/创作者/价格)
  - [ ] 探索曝光 (E&E 算法)
  - [ ] 流量调控 (业务规则)
  - [ ] 社交注入 (关注/朋友点赞加权)
- [ ] **在线学习**: Monolith (字节开源)
  - [ ] 路径: `github.com/bytedance/monolith`
  - [ ] Kafka 实时特征
  - [ ] 分钟级模型更新
- [ ] **特征平台**: 自研 (万亿级特征存储)
- [ ] **冷启动加热**: 4 阶段 (1% / 10% / 50% / 100%) — 参考视频号

### Phase 3 (商业化)
- [ ] **多目标优化**: GMV / 互动 / 留存综合
- [ ] **跨域推荐**: 短视频 → 直播 → 电商 一体化
- [ ] **联邦学习**: 多方数据融合 (合规)

### 关键源码参考
```
github.com/bytedance/monolith                (实时学习 OSDI 2021)
github.com/bytedance/bagua                   (分布式训练)
github.com/facebookresearch/faiss            (向量检索)
```

### 视频号 6 路社交召回 (核心)
```python
# 视频号 6 路社交召回伪代码
def social_recall(user_id, context):
    candidates = []
    # 1. 关注流 (权重 0.40)
    candidates += follow_feed(user_id, limit=200)
    # 2. 朋友点赞 (权重 0.20)
    candidates += friends_liked(user_id, limit=200)
    # 3. 朋友评论 (权重 0.10)
    candidates += friends_commented(user_id, limit=200)
    # 4. 朋友在看 (权重 0.10)
    candidates += friends_watching(user_id, limit=200)
    # 5. 群聊转发 (权重 0.10)
    candidates += group_shared(user_id, limit=200)
    # 6. 公众号关联 (权重 0.10)
    candidates += official_account_rel(user_id, limit=200)
    return candidates[:1000]
```

---

## 七、直播 / 实时音视频 Checklist

### Phase 0 (MVP)
- [ ] **推流**: RTMP (OBS / 移动端 SDK)
- [ ] **CDN 厂商**: 阿里云 / 腾讯云 / 七牛
- [ ] **播放**: HLS (延迟 5-10s, 兼容好)
- [ ] **弹幕**: WebSocket + Redis
- [ ] **点赞/送礼**: WebSocket 长连
- [ ] **录制**: CDN 录制 + OSS 存储

### Phase 1 (规模化)
- [ ] **推流升级**: QUIC 推流 (抗抖动)
- [ ] **播放分级**:
  - [ ] 互动直播: QUIC (1-3s)
  - [ ] 直播带货: HTTP-FLV (3-8s)
  - [ ] 点播回放: HLS (10-30s)
- [ ] **弹幕优化**: 长连接合并 / 滑动窗口限流
- [ ] **礼物系统**: 防刷 / 排行榜 / Redis 排行榜
- [ ] **多码率**: 自适应码率 (ABR)
- [ ] **AI 美颜**: 商汤 / 旷视 SDK

### Phase 2 (头部)
- [ ] **WebRTC 互动直播**: SFU + Mesh 混合
  - [ ] SFU: mediasoup / LiveKit
  - [ ] 业务: PK / 多人连麦 / 弹幕同步
  - [ ] 延迟: <500ms
- [ ] **弱网优化**: FEC + ARQ + GCC 带宽估计
  - [ ] NetEQ 抗抖动
  - [ ] PLC (Packet Loss Concealment)
- [ ] **AI 数字人主播**: 即梦 AI / 可灵 AI
- [ ] **AI 实时翻译**: 跨境直播必备
- [ ] **多 CDN 调度**: 主备 + 实时切换

### Phase 3 (商业化)
- [ ] **5G + WebTransport**: 探索未来
- [ ] **8K/VR 直播**: 视频号已有试水
- [ ] **AI 数字人低延迟**: <1s

### 关键参数 (视频号 4 档延迟)
```
WebRTC    <500ms    PK / 多人连麦
QUIC      1-3s      互动直播 / 跨境
HTTP-FLV  3-8s      直播带货 / 通用
HLS       10-30s    点播 / 回放
```

### Mars 5 业务命令字 (参考)
```
0x301  进直播间
0x302  点赞
0x303  送礼
0x304  评论
0x305  关注
0x306  弹幕
0x307  进场
```

---

## 八、风控 / 合规 Checklist

### Phase 0 (MVP)
- [ ] **登录风控**: 手机号 / 邮箱验证
- [ ] **支付风控**: 限额 + 实名
- [ ] **内容审核**: 关键词过滤 + 人工抽检
- [ ] **反爬**: IP 限流 + 验证码

### Phase 1 (规模化)
- [ ] **实时风控**: 规则引擎 (Drools / 自研)
- [ ] **反欺诈**: 设备指纹 + 行为分析
- [ ] **内容审核**: AI 审核 (ASR + 图像)
- [ ] **反洗钱 (AML)**: 大额交易监控
- [ ] **实名认证**: 活体检测 + 身份证 OCR

### Phase 2 (头部)
- [ ] **AlphaRisk 风格风控**:
  - [ ] 流式特征 (Flink)
  - [ ] 决策延时 <100ms
  - [ ] 图特征 (知识图谱)
  - [ ] 集成学习 (XGBoost + DNN)
- [ ] **多租户风控**: 跨境 / 国内分流
- [ ] **联邦风控**: 跨平台数据协作 (合规)
- [ ] **数据合规**: GDPR / CCPA / 各国数据本地化

### Phase 3 (商业化)
- [ ] **跨境合规**: 各国支付牌照 / 外汇管制
- [ ] **Alipay+ 接入**: 10+ 国家级电子钱包
- [ ] **多币种清算**: 实时汇率引擎
- [ ] **跨境反洗钱 (CRS)**: 税务合规
- [ ] **数据出境合规**: 个人信息保护法

### AlphaRisk 5 大特征
```
1. 流式特征 (Flink + Kafka)
2. 千万级 QPS
3. 决策延时 <100ms
4. 图特征 (知识图谱)
5. 集成学习 (XGBoost + DNN)
```

---

## 九、电商 / 商业化 Checklist

### Phase 0 (MVP)
- [ ] **商品管理**: CRUD + 分类 + SKU
- [ ] **订单系统**: 下单 / 支付 / 退款
- [ ] **支付**: 微信支付 / 支付宝
- [ ] **购物车**: 简单实现
- [ ] **物流**: 第三方 (顺丰/中通 API)

### Phase 1 (规模化)
- [ ] **商品中心**: 标准化 + 标签化
- [ ] **订单系统**: 分布式事务 (Seata / Saga)
- [ ] **支付**: 多支付渠道 (微信/支付宝/Stripe)
- [ ] **优惠系统**: 优惠券 / 满减 / 秒杀
- [ ] **库存系统**: 实时库存 + 预占
- [ ] **分账系统**: 主播分佣 + 平台抽佣

### Phase 2 (头部)
- [ ] **跨境支付**: Alipay+ / Stripe / 连连
- [ ] **实时汇率**: 自研汇率引擎
- [ ] **多币种**: 美元/欧元/英镑/日元/东南亚多币
- [ ] **跨境物流**: 燕文/4PX/云途
- [ ] **合规**: 各国支付牌照 (新加坡 MAS / 印尼 OJK)
- [ ] **溯源**: 蚂蚁链 BaaS 商品溯源
- [ ] **直播带货**: 视频号 4 档延迟 / TikTok Shop 集成

### Phase 3 (商业化)
- [ ] **BNPL (先买后付)**: 微信支付分 / 蚂蚁花呗
- [ ] **跨境金融**: 跨境收款 (万里汇) / 跨境汇款
- [ ] **电商 + 直播 + 内容**: 一体化 GMV 最大化

### 支付宝跨境核心能力
```
1. Alipay+ 接入 10+ 国家级电子钱包
2. WorldFirst (万里汇) 一级牌照
3. 实时汇率引擎 + 多币种清算
4. 跨境反洗钱 (CRS 合规)
```

---

## 十、数据 / 大数据 Checklist

### Phase 0 (MVP)
- [ ] **数据采集**: 自建埋点 SDK
- [ ] **数据存储**: MySQL + OSS
- [ ] **离线分析**: Python + Pandas
- [ ] **可视化**: 自建 Dashboard (Grafana)

### Phase 1 (规模化)
- [ ] **数据采集**: 标准化埋点 (客户端 + 服务端)
- [ ] **数据仓库**: ClickHouse / Hive / Spark
- [ ] **实时计算**: Flink (流式特征)
- [ ] **离线计算**: Spark / Hive
- [ ] **BI**: 自建 Dashboard + Tableau
- [ ] **A/B 测试**: 自建 A/B 平台

### Phase 2 (头部)
- [ ] **数据中台**: 自建 (参考字节 DataLeap / 阿里 OneData)
- [ ] **特征平台**: 自研 (万亿级特征)
- [ ] **在线学习**: Monolith 实时学习
- [ ] **数据湖**: Iceberg / Hudi
- [ ] **联邦学习**: 跨域数据融合

### Phase 3 (商业化)
- [ ] **数据合规**: 数据本地化 / 联邦学习
- [ ] **数据资产化**: 数据产品 / 行业报告

---

## 十一、DevOps / 监控 Checklist

### Phase 0 (MVP)
- [ ] **代码管理**: Git (GitHub / GitLab)
- [ ] **CI/CD**: GitHub Actions (轻量)
- [ ] **部署**: Docker Compose
- [ ] **监控**: Prometheus + Grafana
- [ ] **日志**: ELK (轻量)
- [ ] **告警**: 企业微信 / Slack

### Phase 1 (规模化)
- [ ] **CI/CD**: Jenkins / GitLab CI
- [ ] **部署**: K8s (阿里云 ACK / 腾讯云 TKE)
- [ ] **监控**: 蓝鲸 (BlueKing) / 自研
  - [ ] 蓝鲸: `github.com/Tencent/bk-PaaS`
- [ ] **日志**: ELK / Loki
- [ ] **链路追踪**: Jaeger / SkyWalking
- [ ] **告警**: 自研 + 企业微信

### Phase 2 (头部)
- [ ] **灰度发布**: 集群级 / 机房级 / 城市级
- [ ] **多活**: 单元化 + 多活数据中心
- [ ] **混沌工程**: ChaosBlade (阿里) / Chaos Monkey
- [ ] **SRE**: 完整的 SRE 团队 + OnCall 轮值
- [ ] **可观测**: Metrics + Logs + Traces 统一

### Phase 3 (商业化)
- [ ] **异地多活**: 两地三中心 / 三地五活
- [ ] **单元化**: Cell + RZone + GZone
- [ ] **故障自愈**: AI Ops 异常检测 + 自愈

---

## 十二、关键路径速查 (本地源码)

```
# 微信 Mars 长连接
C:\Users\15389\source\Mars\mars\comm\socket\complexconnect.h       (多 IP 竞速)
C:\Users\15389\source\Mars\mars\comm\unix\socket\socketbreaker.h   (急停开关)
C:\Users\15389\source\Mars\mars\comm\socket\socketpool.h            (连接池)
C:\Users\15389\source\Mars\mars\comm\socket\socketselect.h          (Select)
C:\Users\15389\source\Mars\mars\comm\socket\socketpoll.h            (Poll/Epoll)
C:\Users\15389\source\Mars\mars\comm\socket\local_ipstack.h         (本地 IP 栈)
C:\Users\15389\source\Mars\mars\comm\buffer\autobuffer.h             (AutoBuffer)
C:\Users\15389\source\Mars\mars\stn\src\longlink\longlink_connect_selector.cc  (长连选择)

# 微信 MMKV
C:\Users\15389\source\MMKV\Core\MMKV.cpp                            (核心实现)
C:\Users\15389\source\MMKV\Core\MMKV.h                              (对外接口)
C:\Users\15389\source\MMKV\Core\MiniPBCoder.cpp                     (Protobuf)
C:\Users\15389\source\MMKV\Core\MemoryFile.h                        (mmap 封装)

# 微信 WCDB
C:\Users\15389\source\WCDB\src\core\config\                        (配置)
C:\Users\15389\source\WCDB\src\core\orm\                            (ORM)

# 字节 Kitex
C:\Users\15389\source\kitex\pkg\loadbalance\p2c.go                 (P2C 负载均衡)
C:\Users\15389\source\kitex\pkg\rpcinfo\                            (RPC 信息)
C:\Users\15389\source\kitex\pkg\circuitbreak\                       (熔断)

# 字节 Monolith
C:\Users\15389\source\monolith\monolith\native_training\             (在线训练)
C:\Users\15389\source\monolith\monolith\serving\                     (在线服务)
C:\Users\15389\source\monolith\monolith\agent\                        (数据采集)

# 字节 Eino
C:\Users\15389\source\eino\compose\                                 (编排)
C:\Users\15389\source\eino\schema\                                  (数据结构)

# 蚂蚁 SOFA
C:\Users\15389\source\sofa-rpc\rpc-core\api\src\main\java\com\alipay\sofa\rpc\core\extension\ExtensionLoader.java  (SPI 加载)
C:\Users\15389\source\sofa-rpc\rpc-core\api\src\main\java\com\alipay\sofa\rpc\client\Cluster.java                (集群)
C:\Users\15389\source\sofa-rpc\rpc-core\api\src\main\java\com\alipay\sofa\rpc\route\RouterChain.java              (路由链)

# 蚂蚁 OceanBase
C:\Users\15389\source\oceanbase\src\share\scn.h                     (SCN 定义)
C:\Users\15389\source\oceanbase\src\share\tx\ob_tx_state.h           (事务状态)
C:\Users\15389\source\oceanbase\src\share\tx\ob_2pc_role.h           (2PC 角色)
C:\Users\15389\source\oceanbase\src\share\tx\ob_tx_undo_node.h       (Undo 节点)
C:\Users\15389\source\oceanbase\src\storage\tx\ob_tx_data_hashmap.h  (事务 HashMap)
C:\Users\15389\source\oceanbase\src\share\ob_freeze_define.h         (冻结定义)
C:\Users\15389\source\oceanbase\src\share\ob_gts.h                   (全局时间戳)
```

---

## 十三、Checklist 优先级矩阵

按 ROI (投入产出比) 排序的 20 个关键动作:

| 优先级 | 动作 | 阶段 | 价值 | 投入 |
|--------|------|------|------|------|
| 🥇 P0 | 接入 LLM API (豆包/DeepSeek) | MVP | 极高 | 极低 |
| 🥇 P0 | RTMP 推流 + HLS 播放 | MVP | 高 | 低 |
| 🥇 P0 | WebSocket 弹幕/长连接 | MVP | 高 | 低 |
| 🥇 P0 | 简单推荐 (关注流 + 热门) | MVP | 高 | 低 |
| 🥇 P0 | 基础风控 (限流 + 关键词) | MVP | 高 | 低 |
| 🥈 P1 | Kitex RPC 替换 gRPC | 规模化 | 高 | 中 |
| 🥈 P1 | MMKV 替换 SharedPreferences | 规模化 | 高 | 低 |
| 🥈 P1 | 双塔召回 + DCN+MMoE 精排 | 规模化 | 极高 | 高 |
| 🥈 P1 | QUIC 推流 + 多档延迟 | 规模化 | 高 | 中 |
| 🥈 P1 | 接入 Alipay+ 跨境支付 | 规模化 | 极高 | 高 |
| 🥈 P1 | AI 数字人主播 | 规模化 | 极高 | 中 |
| 🥉 P2 | Monolith 实时学习 | 头部 | 极高 | 高 |
| 🥉 P2 | Mars 长连接移植 | 头部 | 高 | 高 |
| 🥉 P2 | SFU + WebRTC 互动 | 头部 | 高 | 中 |
| 🥉 P2 | 单元化多活 | 头部 | 高 | 极高 |
| 🥉 P2 | AlphaRisk 风格风控 | 头部 | 极高 | 极高 |
| ⭐ P3 | 自研模型 (万卡 GPU) | 商业化 | 极高 | 极高 |
| ⭐ P3 | 蚂蚁链 BaaS 溯源 | 商业化 | 中 | 中 |
| ⭐ P3 | 5G + WebTransport | 商业化 | 中 | 中 |
| ⭐ P3 | 联邦学习跨域融合 | 商业化 | 中 | 高 |

---

## 十四、对照项目关联

- **AI 直播平台**: `C:\skill\ai-live-platform\` (React + Go + Python + PostgreSQL + Docker/K8s)
- **TikTok Shop**: 当前 7 国运营 (东南亚/美国/欧洲)
- **本 checklist 输出**: 12 个模块 / 3 个阶段 / 20 个 P0-P3 动作

---

## 十五、参考路径

- [[00-总索引]] - 7 平台总索引
- [[00-跨平台基础设施对比矩阵]] - 基础设施对比
- [[alipay/06-可借鉴清单]] - 支付宝可借鉴
- [[wechat/05-可借鉴清单]] - 微信可借鉴
- [[doubao/05-可借鉴清单]] - 豆包可借鉴
- [[shipinhao/05-可借鉴清单]] - 视频号可借鉴
- [[kuaishou/05-可借鉴清单]] - 快手可借鉴
- [[douyin-architecture/00-索引]] - 抖音参考架构
