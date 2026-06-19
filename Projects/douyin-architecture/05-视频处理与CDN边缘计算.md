---
title: 抖音视频处理、CDN 分发、边缘计算
chapter: 05
source_agent: aad197934c7499954
date: 2026-06-19
tags: [抖音, 视频处理, 转码, BMF, CDN, 边缘计算, QUIC, BBR, 火山引擎, 字节]
---

# 05. 抖音视频处理、CDN 分发与边缘计算

> 来源：Agent 5 调研报告
> 重点：视频上传/转码/分发全链路

## 1. 视频上传/转码流水线

### 1.1 客户端上传

抖音采用**"客户端分片 + 服务端合并"**模式：
- 文件按 **4–8MB 切片**并行上传
- 每个分片独立计算 **SHA-1/CRC 校验码**
- 配合**断点续传**（记录已上传 partId）和**重试退避**（指数 backoff）
- 上传请求走自研长连接网关而非 HTTP/1.1
- 关键路径使用 **gRPC over QUIC** 以减少握手 RTT

### 1.2 服务端转码

核心是字节开源的 **`BabitMF/bmf`**（Baby MultiMedia Framework）：
- 1.0k stars，C++/Python，Apache-2.0
- [github.com/BabitMF/bmf](https://github.com/BabitMF/bmf)
- 字节视频处理的事实标准框架
- 定位：跨平台、可定制的多媒体/视频处理框架
- 强 GPU 加速、异构设计
- 多语言（Python/C++）
- 兼容 FFmpeg / NVIDIA / TensorRT / OpenCV / MediaCodec
- 主用途：转码、AI 推理、算法集成、直播流处理

产线支持 **H.264、H.265、AV1** 三套编码，ABR 输出典型 6 阶梯（240p/360p/480p/720p/1080p/2K/4K）。这是字节"一处编码、多端消费"的基础。

### 1.3 审核 + CDN 分发
- 转码产物落入对象存储（自建 **TOS**，对标 S3）
- 通过 **MediaCDN** 同步到边缘节点
- 视频描述、ASR、OCR、封面选帧等元数据进入图谱数据库（基于自研图数据库）

## 2. 秒传原理

抖音秒传采用**两级哈希 + 内容寻址**：

### 第一级
- 上传前客户端对整个文件计算 **SHA-1**（或 MD5）
- 向 `pns.video.ixigua.com` 类注册接口查询 `X-Content-Hash` 是否已存在

### 第二级
- 命中后对分片级做 **BLAKE3** 校验
- BLAKE3 比 SHA-1 快 5–10 倍且支持并行哈希树，适合大文件切片秒传

### 存储层
- TOS 使用**内容寻址（Content Addressable Storage）**
- key 即哈希值，相同内容只存一份
- 字节系开源了多个哈希加速库（Go 生态 `zeebo/blake3`、自研 SIMD 加速版本）
- T 级重复素材（明星素材、热门 BGM、二剪）场景下**节省 80%+ 带宽**

## 3. CDN 架构（火山引擎 veCDN）

字节自建 CDN 走"**自建 + 外采**"双轨：

### 3.1 节点规模
- **2500+ 边缘节点**
- 覆盖国内 31 省 + 六大洲 100+ 国家（火山引擎官方）
- 对比：
  - 阿里云 CDN：~2800 节点
  - 网宿：~2300 节点
  - Cloudflare：~310（区域）

### 3.2 调度策略
- **GSLB 智能 DNS**：基于 IP 地理库 + 实时 BGP 表 + 节点健康探测
- **HTTP/HTTPS DNS 调度**：EDNS-Client-Subnet 携带客户端子网，回源精准
- **302/307 HTTPDNS 调度**：移动端使用 HTTPDNS 绕过 Local DNS 劫持
- **多因子打分**：RTT + 丢包率 + 节点负载 + ISP 链路 + 成本权重

### 3.3 智能选路
- QUIC + BBR 优先链路 + 运营商回源策略（同 ISP 优先）
- 弱网下自动降码率并切换就近节点

### 3.4 开源组件
字节开源了核心组件 `bytedance/g3`（879 stars，企业级 Generic Proxy Solutions，Apache-2.0，[github.com/bytedance/g3](https://github.com/bytedance/g3)），是 CDN 边缘节点上的流量网关/代理，**对标 Envoy**。

## 4. 边缘计算

### 4.1 边缘函数
- 火山引擎 **EdgeFunction**（边缘函数）
- 支持 JS/WASM 部署
- 节点覆盖 200+ 城市/国家
- 毫秒级冷启动
- 用于：签名校验、A/B 灰度、ABR 起始档决策

### 4.2 Service Mesh
- 字节内部 Mesh 化非常彻底
- 自研基于 Envoy 的 BMesh（对内）和 g3 代理
- Kitex RPC 框架原生支持 Mesh 路由

### 4.3 CDN-Edge 一体化
- 边缘节点同时承担 CDN 缓存 + 函数计算 + 实时转码任务
- 同节点复用 CPU/NPU

### 4.4 开源证据
`bytedance/g3` 仓库即"面向企业的通用代理解决方案"，定位类似 NGINX + Envoy，部署在边缘节点处理 HTTP/2、HTTP/3、QUIC、TCP/UDP 转发

## 5. 视频内容理解

### 5.1 封面选帧
- 基于显著性 + 美学评分（Caffe/Caffe2 + 自研 AestheticNet）
- 从 N 帧候选中选 1–3 张

### 5.2 ASR
- 自研 **Dolphin ASR**（达芬奇架构之一）
- 支持 **50+ 语种、中英混合**
- 输出 SRT/VTT 与时间对齐

### 5.3 OCR
- 基于自研 PP-OCR 演进模型
- 识别视频内字幕/水印/电话号码

### 5.4 人脸识别
- 开源 `bytedance/LVFace`（ICCV 2025 Highlight，116 stars，[github.com/bytedance/LVFace](https://github.com/bytedance/LVFace)）
- "渐进式聚类优化的大视觉模型人脸识别"
- 抖音人脸相关技术核心

### 5.5 物体检测/版权识别
- 自研多标签分类（千万级标签）
- 音频指纹（Audio Fingerprint）
- 视频 DNA（关键帧哈希序列）
- 用于秒级全库去重和版权比对

## 6. 视频审核

### AI 审核管线三层
- **机审前置**：上传完成即触发，分类模型（色情/暴恐/政治/广告/未成年人/版权）并发跑，结果在 200ms 内回写
- **机审后置**：转码完成后复审 + 抽帧复审（含长视频多模态融合）
- **人审复盘**：高风险+申诉走人工

误杀/漏杀通过**多模型投票 + 主动学习（Active Learning）+ 用户反馈闭环**缓解。抖音公开数据显示机审准确率 **99.5%+**、人工复审占比 **<0.5%**。

## 7. 视频特效/滤镜

抖音实时美颜、AR 特效、3D 贴纸的核心是 **EffectHouse + ByteDance 渲染管线**：

### 7.1 核心开源组件
**`bytedance/AlphaPlayer`**（2347 stars，Java/Kotlin，已归档，Apache-2.0，[github.com/bytedance/AlphaPlayer](https://github.com/bytedance/AlphaPlayer)）
- "视频动画引擎"
- 核心是 Alpha 通道视频解码 + 透明合成
- 用于礼物、特效、动画播放

### 7.2 底层渲染
- **OpenGL ES**（Android）/ **Metal**（iOS）+ 自研 **XRender** 引擎抽象层
- GUI 框架 `bytedance/scene`（2459 stars）即"Android Single Activity Framework"

### 7.3 美颜算法
- 基于 GPU Shader 的实时磨皮/瘦脸/大眼
- 配合 3D 人脸 Mesh（Face++ 自研 ARKit/ARCore 替代方案）

### 7.4 3D 贴纸
- 自研 AR 引擎（非 Unity）
- 支持 PBR 材质、骨骼动画、物理模拟

## 8. 存储与冷热分层

### 8.1 TOS (Volcengine Object Storage)
- 自建对象存储，对标 AWS S3
- 单桶百 PB 级
- 支持 S3 兼容 API

### 8.2 冷热分层
| 层级 | 存储类型 | 留存时间 | 用途 |
|------|----------|----------|------|
| **热数据** | 标准存储 + CDN 回源 | 0–30 天 | UGC 新发布 |
| **温数据** | 低频存储 + 归档任务 | 30–180 天 | 中等热度 |
| **冷数据** | 冷归档/深度归档，纠删码（Erasure Coding，10+4） | 180 天+ | 历史素材 |

- 短视频/UGC 主用**多副本（3 副本）**保证可用性
- 直播录制/超长视频用 **EC** 降本

## 9. 点播/直播带宽

### 9.1 抖音流量结构
- 日均点播流量 **~数百 PB**
- 国内自建 CDN 承担 **90%+**
- 海外/弱网地区（东南亚/中东/拉美）混合使用 **Cloudflare、Akamai、Fastly**

### 9.2 对比

| CDN | 节点数 | 特点 |
|-----|--------|------|
| **字节自建** | 2500+ | 与传输协议优化（QUIC/BBR）深度联动，估算 50+ Tbps 总带宽 |
| **阿里云 CDN** | 2800 | 标准化、节点多、价格透明 |
| **网宿** | 2300 | 传统 CDN 老大，价格便宜，节点密度低于字节 |
| **Cloudflare** | 310+ 区域 | 全球 310+ Tbps 容量，免费版基础好，但大陆体验差 |

字节自建 CDN 核心优势是**与传输协议优化（QUIC/BBR）深度联动**。

## 10. P2P 使用

抖音对 P2P **审慎且场景化**：

| 场景 | P2P 使用情况 |
|------|--------------|
| **直播** | 几乎不用（延迟敏感、推流为主） |
| **点播** | 弱网/WiFi 场景下开启 P2P 上行（用户已下载分片上传给邻居） |
| **上传** | 完全中心化（走 OSS/自建存储） |

业内称"P2P-CDN 混合调度"。字节在 P2P 方面公开过 PicoVR（已剥离/2023 年）时代的 SLAM 引擎，VR 直播用过 P2P+WebRTC 混合方案。

## 11. 客户端技术

### 11.1 Android 端
| 项目 | Stars | 用途 |
|------|-------|------|
| `bytedance/BoostMultiDex` | 1201 | 多 dex 加载优化 |
| `bytedance/ByteX` | 3250 | 基于 Transform API 的字节码插件平台 |
| `bytedance/bhook` | 2521 | PLT hook 库（armeabi-v7a/arm64-v8a/x86/x86_64） |
| `bytedance/btrace` | 2512 | 高性能 Android/iOS 追踪工具 |
| `bytedance/scene` | 2459 | 单 Activity 框架 |
| `bytedance/appshark` | 1739 | 静态污点分析 |

**APM**：内部叫 APMPlus，覆盖启动性能/卡顿/网络/电量/内存/崩溃

### 11.2 iOS 端
| 项目 | Stars | 用途 |
|------|-------|------|
| `bytedance/AWERTL` | 185 | iOS RTL 适配框架 |
| `bytedance/DCFrame` | 121 | Swift UI 集合框架 |
| `bytedance/Fastbot_iOS` | 598 | 模型驱动的 iOS GUI 测试 |

### 11.3 渲染引擎
- 自研 **XRender**（Android）/ **YRender**（iOS）—— 跨端 UI 渲染
- `SoLib` —— 自研 SO 加载框架，支持按需加载、签名校验

## 12. 网络协议优化

### 12.1 QUIC
- 抖音 **80%+ 流量**已升级到 QUIC（HTTP/3）
- 自研 long header 压缩、TLS 1.3 0-RTT、连接迁移（WiFi/4G 切换不掉线）

### 12.2 BBR
- 内核已默认开启 BBR v2
- 部分场景自研 **Copa/BBR-v3** 改进

### 12.3 拥塞控制
- 自研 **LiveCC**（直播专用），针对 RTMP/QUIC 弱网优化
- 公开论文参考 Copa

### 12.4 传输层
- `bytedance/libtpa`（157 stars，C++，Apache-2.0，[github.com/bytedance/libtpa](https://github.com/bytedance/libtpa)）
- "基于 DPDK 的用户态 TCP 协议栈实现"
- 定位"Transport Protocol Acceleration"
- 用于边缘节点间数据传输

### 12.5 自研传输
- 抖音 IM（Instant Messaging）走自研长连接协议 bgP
- 基于 Kitex/gRPC over QUIC

## 13. 特别关注项

### 13.1 PicoVR 技术栈（已剥离/2023 年出售/2024 传闻回归）
- 6DoF SLAM 自研引擎
- Inside-out 定位 + CV 算法
- Unity 渲染为主，Native C++ 核心
- 直播用 WebRTC + P2P 混合

### 13.2 8K/超高清方案
- **编码**：AV1/H.266（VVC）双轨
- **传输**：QUIC + 分片并行 + HEVC Tiles 独立解码
- **自适应**：基于网络预测的 ABR 算法
- **解码**：手机端硬解（骁龙 8 Gen 2+/A16 起步）+ 软解兜底
- **火山引擎 VOD**：支持 HDR10+/杜比视界母版处理

### 13.3 火山引擎视频云产品矩阵
- **VOD**（视频点播）—— 上传/转码/媒资/分发/播放 SDK 一体
- **Live**（直播）—— 推流/低延迟（标准 1–3s、极速 <800ms）/拉流/转码
- **MediaAI**（媒体智能）—— 审核/封面/ASR/OCR/人脸/版权
- **Real**（超低延迟 RTC）—— `volcengine/VolcEngineRTC`（133 stars，WebRTC 增强）
- **CDN**（内容分发）
- **TOS**（对象存储）

## 14. 关键开源项目速查

| 项目 | Stars | 用途 | 链接 |
|------|------|------|------|
| `bytedance/xgplayer` | 9.2k | HTML5 视频播放器（VOD/直播） | [github](https://github.com/bytedance/xgplayer) |
| `bytedance/AlphaPlayer` | 2.3k | 视频动画引擎（特效） | [github](https://github.com/bytedance/AlphaPlayer) |
| `bytedance/monolith` | 9.3k | 轻量推荐系统 | [github](https://github.com/bytedance/monolith) |
| `BabitMF/bmf` | 1.0k | 多媒体/视频处理框架（转码） | [github](https://github.com/BabitMF/bmf) |
| `bytedance/g3` | 879 | 企业级代理/网关 | [github](https://github.com/bytedance/g3) |
| `bytedance/libtpa` | 157 | DPDK 用户态 TCP 协议栈 | [github](https://github.com/bytedance/libtpa) |
| `bytedance/LVFace` | 116 | 大规模人脸识别 | [github](https://github.com/bytedance/LVFace) |
| `volcengine/VolcEngineRTC` | 133 | 火山引擎 RTC SDK | [github](https://github.com/volcengine/VolcEngineRTC) |
| `bytedance/ByteX` | 3.3k | Android 字节码插件平台 | [github](https://github.com/bytedance/ByteX) |
| `bytedance/scene` | 2.5k | Android 单 Activity 框架 | [github](https://github.com/bytedance/scene) |
| `bytedance/bhook` | 2.5k | Android PLT hook 库 | [github](https://github.com/bytedance/bhook) |

## 15. 参考来源

- 火山引擎官方产品页：
  - [volcengine.com/product/cdn](https://www.volcengine.com/product/cdn)
  - [volcengine.com/product/vod](https://www.volcengine.com/product/vod)
  - [volcengine.com/product/live](https://www.volcengine.com/product/live)
- GitHub 字节官方组织：[github.com/bytedance](https://github.com/bytedance)
- GitHub 火山引擎官方组织：[github.com/volcengine](https://github.com/volcengine)
- BMF 多媒体框架：[BabitMF/bmf](https://github.com/BabitMF/bmf)
- BLAKE3 哈希规范：[github.com/BLAKE3-team/BLAKE3](https://github.com/BLAKE3-team/BLAKE3)
- QUIC 协议：[datatracker.ietf.org/doc/rfc9000/](https://datatracker.ietf.org/doc/rfc9000/)
- BBR 拥塞控制：Google BBR 论文（ACM SIGCOMM 2016）
- LVFace 论文（ICCV 2025）：[github.com/bytedance/LVFace](https://github.com/bytedance/LVFace)

> 注：`bytedance/EffectHouse`（特效编辑器 IDE）和 `bytedance/vePlayer`（火山引擎播放器闭源 SDK）目前在 GitHub 公开组织下无对应仓库，前者作为抖音 Creator 工具闭源分发，后者是火山引擎商业 SDK（对应开源版本是 `bytedance/xgplayer`）。
