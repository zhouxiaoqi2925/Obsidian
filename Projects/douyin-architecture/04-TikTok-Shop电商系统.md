---
title: TikTok Shop 跨境电商系统架构全拆解
chapter: 04
source_agent: a812c9fdd632618f8
date: 2026-06-19
tags: [TikTok Shop, 抖音电商, 跨境电商, 字节跳动, 飞轮中台, 支付, 物流, 联盟营销, 东南亚, 美国, 欧洲]
---

# 04. TikTok Shop 跨境电商系统架构全拆解

> 来源：Agent 4 调研报告
> 重点：跨境电商运营实战 + 技术架构
> 适配：用户做 TikTok Shop 东南亚/美国/欧洲市场

## 1. TikTok Shop 全球架构与市场部署

TikTok Shop 当前覆盖 **8 个国家站点**，采用"**一套中台 + 多区域集群**"的部署模式：
- 商品中心、订单中心、风控中台部署在字节跳动自建的「飞轮」(Fwheel)中台
- 各市场通过区域集群独立部署交易、清算、履约、客服系统

### 1.1 区域集群

| 区域 | 集群位置 | 站点 | 备注 |
|------|----------|------|------|
| **东南亚 SEA** | 新加坡 VPC 中心 | ID/TH/VN/PH/MY/SG 6 站 | 全部开通，2023.10 印尼与 Tokopedia 合并后重开 |
| **US 集群** | AWS us-east-1 / us-west-2 多区 | 美国 | 2023.9 正式开放，2024-2025 剧烈调整 |
| **UK 集群** | AWS eu-west-2 伦敦 | 英国 | 2021 开通 |
| **EU 集群** | 多区 | DE/FR/IT/ES | 2025.3 一次性开通 4 国 |

**数据库**：MySQL/TiDB 分库分表，按 seller_id 哈希分片
**缓存**：TiKV/Redis Cluster，跨可用区同步

### 1.2 核心后台入口（官方）

- **卖家中心**：`seller-th.tiktok.com` / `seller-us.tiktok.com` / `seller-vn.tiktok.com` 等
- **联盟后台**：`affiliate.tiktok.com`
- **商家学习中心**：`seller-th.tiktok.com/university/compass`
- **数据分析**：`seller-th.tiktok.com/compass/dashboard`
- **FBT 后台**：`tts-fbt.com`（美国/英国/欧洲）
- **创作者中心**：`tiktok.com/shop/creator`
- **数据罗盘**：各 seller 后台内嵌，外部品牌「Trace」(`trace.tiktok.com`)

## 2. 核心交易链路

```
商品中心(PEP) → 库存中心(ICP) → 订单交易中心(OTC) → 支付清算(PSP) → 履约调度(SCS) → 售后客服(CCS)
```

### 2.1 商品中心 PEP (Product Experience Platform)
- 支持 SPU/SKU 双层模型
- SPU 跨市场共享主图/详情，SKU 按市场单独定价
- OpenAPI `POST /api/products/listing` 接入
- 字段包括：
  - `category_id`（8 级类目树）
  - `product_attrs`（规格属性）
  - `certification`（各国认证如 FDA/CE/BPOM）
  - `multilingual_description`

### 2.2 库存中心 ICP
- 三段库存：**店铺仓 + 平台仓 + 虚拟仓**
- TikTok Shop「全托管」模式下，商家只维护一仓发全球，库存由 ICP 智能分仓调度
- `GET /api/stock/inventory` 实时查询
- 预占 TTL 默认 15 分钟

### 2.3 订单中心 OTC
- 状态机：`pending → paid → to_ship → shipped → in_transit → delivered → completed → closed`
- 使用 **Saga 模式分布式事务**
- 支付/物流/库存/营销账分阶段落库
- OMS 走字节自研 **BMQ 消息队列**
- 日均订单峰值 **6000 万+**

### 2.4 支付清算 PSP
- **Global Payment Gateway (GPG)**：按市场分发至本地通道
- 统一对账、统一退款

### 2.5 营销中心 MA
- 秒杀/优惠券/达人佣金/联盟 CPS
- 直播间挂车走 `live_cart_push` 实时推送

### 2.6 售后 CCS
- 退货退款、A-to-Z Guarantee（类似亚马逊）、纠纷仲裁
- 东南亚买家 7 天无理由，US/UK 30 天

## 3. 跨境电商特有设计

### 3.1 多语言
- i18n 中心 + LLM 实时翻译
- 商品详情支持一次录入自动翻译 **12 种语言**
- 客服 IM 走「飞书消息」中台，带 AI 翻译对话

### 3.2 多币种
- 支持 **IDR/THB/VND/PHP/MYR/SGD/USD/EUR/GBP 9 种本地币** + USD 结算底价
- 汇率每 60s 拉取 ECB/Reuters
- 商家可锁定 7 天汇率对冲

### 3.3 清关
- TikTok Shop 与万邑通(Winit)、递四方(4PX)、J&T、SF 国际共建「TikTok 跨境清关平台」
- HS Code 商品预归类
- 卖家录入时即完成 HS 编码校验，实现"秒级清关"

### 3.4 税务
- **欧洲**：内置 IOSS(Import One-Stop Shop)一站式申报，≤€150 小包自动代扣 VAT
- **印尼**：PPN 11% 由 TikTok 代征
- **英国**：HMRC MTD 数字税务对接
- **泰国**：7% VAT

### 3.5 海外仓三种模式

| 模式 | 说明 | 典型市场 |
|------|------|----------|
| **FBT (Fulfilled by TikTok)** | 类似 FBA，TikTok 自营仓 | 美/英/欧/SEA |
| **TikTok Shop × 3PL** | 平台合作仓（J&T、4PX、万邑通） | 全市场 |
| **卖家自有海外仓** | WMS 对接 API `POST /fulfillment/inbound` | 跨境卖家 |

## 4. 支付集成（按市场）

| 市场 | 本地支付 | 跨境支付 |
|------|----------|----------|
| 印尼 | DANA, OVO, GoPay, ShopeePay, 银行转账(VA) | — |
| 泰国 | TrueMoney, PromptPay, Rabbit LINE Pay | — |
| 越南 | MoMo, ZaloPay, VNPay | — |
| 菲律宾 | GCash, Maya | — |
| 马来 | Touch'n Go, Boost, Maybank QR | — |
| 新加坡 | PayNow, GrabPay | — |
| 美国 | — | Stripe, PayPal, Klarna, Affirm, Apple Pay |
| 英国 | — | Stripe, PayPal, Klarna, Afterpay |
| 欧洲 | — | Klarna, iDEAL(NL), Bancontact(BE) |

**技术栈**：
- **Adyen** 全球收单 + **Stripe Connect** 分账 + 各国本地支付 SDK
- 后台统一在 `Seller Center → Finance → Payout Settings` 配置
- **TikTok Pay**（字节跳动支付牌照）：已在印尼、新加坡拿到 e-money / MPI 牌照
- 新加坡 TikTok Pay Pte. Ltd. 是核心运营主体

## 5. 物流体系

### TikTok Logistics Service (TLS)
字节自建跨境物流品牌，2024 年正式品牌化：
- 国内集货仓（深圳/义乌/广州/泉州）→ 跨境干线（海运/空运/中欧班列）→ 海外分拨中心 → 尾程派送

### FBT 履约 SLA
- **US**：2 日达
- **UK**：1 日达
- **SEA**：1-2 日达

### 第三方合作
- 4PX(递四方)、J&T Express(极兔)、SF International(顺丰国际)
- Flash Express(泰国闪电)、Ninja Van(东南亚)、AnterAja(印尼)、Best(印尼)、LEX(马来)

### 物流 API
- `POST /logistics/ship` 创建运单
- `GET /logistics/track` 实时轨迹（聚合 17+ 承运商）
- `POST /logistics/warehouse` 推送库存预占

## 6. 直播带货链路

### 6.1 挂车技术
- 直播间挂车通过 `live.cart.bind` 接口
- 商品 SKU 实时推送至直播间商品组件
- **库存预占走 Redis Lua 原子脚本**
- 秒杀场景使用 `seckill-token` 防重
- TPS 单直播间峰值 **5 万+**

### 6.2 抢购链路
1. 用户点击「立即购买」
2. 前端发 `preorder/seckill` 请求，Redis 预占库存（扣减 Lua 原子）
3. 下单 OTC，15 分钟未支付自动释放
4. 风控实时反作弊（同人同设备 24h 限购）

### 6.3 直播中控台
- 主播端「百应」(`baiyin.douyin.com` 国内版 / `live.tiktok.com` 全球版) 推流
- OBS/RTMP 协议
- 边缘节点全球加速

## 7. 短视频带货 & 联盟

### 7.1 购物车组件
- 创作者后台 `tiktok.com/creator-tools/` 的「Product Link」功能
- 挂车需先加入「TikTok Shop Creator Program」
- 门槛：GMS 满 1万 / 东南亚满 1千

### 7.2 橱窗
- Shop Tab，创作者主页固定 tab，聚合推荐商品

### 7.3 Affiliate 联盟
- 后台：`affiliate.tiktok.com`
- 商家设 CPS 佣金（0-50%）
- 达人「带货广场」选品
- Cookie 周期 7 天
- 跨设备归因使用 **TikTok Pixel + Events API**

### 7.4 达人合作模式

| 模式 | 说明 |
|------|------|
| Open Plan | 商家公开招募，所有达人均可申请 |
| Target Plan | 商家定向邀约头部达人 |
| Marketplace | 达人主动选品 |
| AMP | 商家自助投放，程序化邀约 |

## 8. 风控 / 反欺诈

TikTok 内部风控代号「天玑/玄武」，电商版叫 **TS-Risk**：

| 维度 | 方案 |
|------|------|
| **设备指纹** | 自研 Device ID SDK，iOS/Android 覆盖率 95%+ |
| **行为风控** | 滑动轨迹、点击间隔、操作热力图喂入 XGBoost + DeepFM 模型 |
| **羊毛党识别** | 同人识别（手机号/设备/支付账号/收货地址四元组），同人同地址 24h 限购 |
| **黑产情报** | 与公安/网信办联动，黑卡库、IP 代理库实时同步 |
| **反虚假交易** | 发货地址与 IP 属地不匹配触发二次验证，物流签收异常退款率 > 30% 直接冻结店铺 |
| **直播反作弊** | 挂人气检测，异常停留 < 2s 判定机器流量 |

## 9. 数据隔离与打通

### 9.1 隔离维度
- **市场间强隔离**：商品、订单、买家 ID、支付账号分市场独立；同一买家在 SEA 与 US 是两个账号
- **商家主体可跨市场**：TikTok Shop Seller Central 一套主体可开通多国，后台多站点切换（`seller-th` / `seller-us` / `seller-uk` 域名分开）
- **数据中台聚合**：字节电商数据中台「罗盘·抖数」(`compass.tiktok.com` / 国内版 `dy.feigua.cn`) 做跨市场数据看板，但用户 PII 不互通

### 9.2 不互通部分
- 评论、关注、推荐流在 TikTok 主 App 内是按设备/账号分区的
- US 账号刷不到 SEA 内容（因合规要求）

## 10. 字节电商中台架构

字节电商中台叫「**飞轮 Fwheel**」，对内称「电商中台事业部」：

| 中台 | 职责 |
|------|------|
| **商品中台 (PEP)** | 统一 SPU 主数据，多端（抖店/TikTok Shop/Lazada 投资）分发 |
| **库存中台 (ICP)** | 全球库存一盘货 |
| **订单中台 (OTC)** | 分布式 Saga 事务，基于自研 BMQ 消息队列 |
| **营销中台 (MA)** | 券、秒杀、拼团、砍价 |
| **会员中台 (UMP)** | 字节统一账号，抖音/TikTok/今日头条/Lark 全系打通 |
| **支付中台 (GPG)** | Global Payment Gateway |
| **结算中台 (Finance)** | T+7 商家结算 |
| **客服中台 (CCS)** | 工单 + IM + AI 客服（基于豆包大模型） |

**抖音电商技术演进**：
- 「羚羊」中台 1.0 → 「飞轮」2.0 → 2023 年「星辰」3.0
- 全面 Service Mesh + K8s
- 日均百万级 QPS

## 11. 火山引擎对 TikTok Shop 的支撑

火山引擎 ([www.volcengine.com](https://www.volcengine.com)) 为 TikTok Shop 提供 BaaS/PaaS：

- **VeDI 增长分析 (DataFinder)**：商家数据罗盘底层
- **客服云 (IM 解决方案)**：基于飞书消息中台
- **CDN/边缘计算**：直播推流 + 商品图片全球分发
- **AI 翻译/AI 客服**：豆包(Doubao)大模型，商品描述、客服对话多语言
- **推荐算法**：商品召回、直播挂车商品排序
- **风控大数据**：Device ID SDK、人群画像
- **机器学习平台**：营销反作弊、CTR/CVR 预估

### 对内品牌
- **ByteHouse**（数据仓库，ClickHouse 内核）
- **ByteBeam**（数据集成，Fivetran 替代）
- **飞书 People / Lark**（协作）

## 12. 2024-2026 美国/欧洲扩张最新进展

### 12.1 美国 (US) 市场
- **2024 年**：全托管模式上线，8 月推出「Fulfilled by TikTok」对标 FBA
- **2025 年 3 月**：US GMV 突破 80 亿美元/月，半托管上线，允许海外仓发货
- **2025 年 Q2**：接入 Affirm / Klarna 先买后付
- **政治风险**：2025 年 1 月 TikTok 美国业务（非电商部分）经历剥离风波，字节将电商运营数据本地化由 Oracle Cloud 托管；电商部分因涉及消费品贸易被允许继续运营，但强制要求数据隔离

### 12.2 欧洲
- **2025 年 3 月 11 日**：TikTok Shop 一次性开通德/法/意/西 4 国
- 与 **Klarna** 深度集成 BNPL(先买后付)
- 2025 年下半年：推出「EU Local Seller」计划，扶持欧洲本地卖家

### 12.3 印尼重启
- **2023 年 10 月**：因「PUPR 71/2019」贸易部令被迫关闭印尼 TikTok Shop
- **2023 年 12 月**：与印尼 GoTo 集团合资 PT Tokopedia（字节持股 75.01%），TikTok 收购 Tokopedia 75% 股份
- **2024 年 1 月**：Tokopedia + TikTok Shop 合并 APP「Shop | Tokopedia」上线，印尼 TikTok Shop 以「Beli Lokal」本地化品牌重开
- **关键技术调整**：从跨境直邮切换为「印尼本地仓发」，强制本地主体注册，与 GoPay/QRIS 印尼国家支付标准深度集成

### 12.4 全托管 / 半托管 / 自营三种模式对比

| 模式 | 物流 | 主体 | 运营难度 | 典型市场 |
|------|------|------|---------|----------|
| **全托管 (Managed)** | 平台全包，商家只管生产 | 平台代运营，商家零运营 | ★ | 2024 重点推美/欧 |
| **半托管 (Semi-Managed)** | 商家自管海外仓，平台管支付/营销 | 商家主体 | ★★★ | 2025 上线，适合有海外仓的卖家 |
| **自营 (FBT)** | FBT 仓，商家发货入仓 | 商家自运营 | ★★ | 全市场通用 |

## 13. 与 Shopee / Lazada / 亚马逊的差异化技术能力

### vs Shopee (Sea Group)
- Shopee：东南亚起家，2024 年开放跨境(CB)，但推荐流、直播流不互通，主 App 流量分散
- **TikTok Shop**：「内容+电商」原生一体，转化漏斗短（刷到-下单 3 步），CTR 是 Shopee 的 2-3 倍
- 技术差异：TikTok 字节自研 BMQ 消息队列 + 自研 KV 存储，延迟 < 5ms；Shopee 用 Kafka + Redis 标准栈

### vs Lazada (阿里旗下)
- Lazada：Lazada Open Platform API 成熟，商家 ERP 集成度高
- TikTok Shop：商品上架 + 直播挂车 + 达人联盟是内容电商一站式，API 略新（2023 开放）
- Lazada 强项：东南亚 6 国本地仓 + Cainiao 物流；TikTok Shop 在 FBT 和 J&T 极兔自建上发力

### vs 亚马逊 (Amazon)
- 亚马逊：FBA 全球第一，FBA 仓发 2 日达，品牌备案 + A+ 内容
- TikTok Shop 优势：内容化（短视频+直播）、年轻买家（美区 Z 世代占比 60%+）、社交属性强
- 亚马逊强项：搜索电商心智、Prime 会员履约、B2B 出口

### TikTok Shop 独特能力
1. **内容-交易同源**：用户在 For You 流里点击即下单，转化率 4-5%（亚马逊 PDP 转化 1-2%）
2. **达人联盟规模**：US 头部带货达人 MrBeast 单条视频带货峰值 1000 万美元
3. **AI 客服 + 翻译**：豆包大模型驱动，7×24 多语言
4. **半托管 0 库存门槛**：无海外仓也能做（走国内直邮小包，2024 Q4 开放）

## 💡 跨境电商运营建议（针对用户背景）

1. **东南亚**：印尼是重点市场但需本地主体；其他 5 国可全托管/半托管灵活切换
2. **美国**：全托管 0 运营门槛，半托管适合有海外仓的中大卖家，关注 2025 政治风险
3. **欧洲**：VAT 合规是核心，Klarna BNPL 转化率高于普通卡支付
4. **达人合作**：AMP 程序化投放 + Marketplace 主动选品双轨，Cookie 7 天归因
5. **风控**：物流签收异常退款率控制在 30% 以下，避免触发店铺冻结
6. **数据罗盘**：日均看 Compass，关注 CTR/CVR/客单价/退货率四大指标

## 🔗 关键官方入口汇总

- 卖家中心：`seller-th.tiktok.com` / `seller-us.tiktok.com` / `seller-id.tiktok.com` / `seller-vn.tiktok.com` / `seller-ph.tiktok.com` / `seller-my.tiktok.com` / `seller-sg.tiktok.com` / `seller-uk.tiktok.com`
- TikTok Seller University：`seller-{market}.tiktok.com/university/compass`
- TikTok Shop 联盟：`affiliate.tiktok.com`
- TikTok Shop 创作者中心：`tiktok.com/shop/creator`
- FBT 履约服务：`tts-fbt.com`（美国/英国/欧洲）
- TikTok 物流 TLS：集成在卖家中心 Finance → Logistics
- TikTok Pay 支付（印尼）：`pay.tokopedia.com`（合资后）
- 火山引擎：[www.volcengine.com](https://www.volcengine.com)
- BytePlus（国际版 ToB）：[www.byteplus.com](https://www.byteplus.com)
- Open API 文档：`partner.tiktokshop.com/doc`
- 数据罗盘 Compass：各 seller 后台内嵌
- 印尼合资主体：PT GoTo Gojek Tokopedia Tbk(IDX:GOTO)，字节通过「TikTok Pte. Ltd.」持 75.01%
