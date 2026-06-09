---
title: "Everything we announced at Sessions 2026"
source: https://stripe.com/blog/everything-we-announced-at-sessions-2026
author: Will Gaybrick
published: 2026-04-29
fetched: 2026-06-09
tags:
  - 文章/行业
  - 主题/支付
  - 主题/AI
  - 主题/Stripe
  - 类型/产品发布
  - 类型/技术
---

# Everything we announced at Sessions 2026

> Stripe 2026 年度发布会，共发布 **288 个新产品/功能**，现场 9000+ 商业领袖和开发者。
> 三大主线：更可编程、保护+推动业务、为 AI 经济构建基础设施。

---

## 1. Payments

### 1.1 Agentic Commerce（代理商务套件）
- 通过 Stripe Dashboard 上传商品目录、管理 Agent 访问 → [Agentic Commerce Suite](https://docs.stripe.com/agentic-commerce)
- 预览：让 Connect 平台用同一套 Stripe 集成让子账户具备 agent-ready（发现/支付/反欺诈）
- **与 Meta 合作**：Facebook 广告内原生结账
- **与 Google 合作**：通过 UCP（Universal Commerce Protocol）在 AI Mode 和 Gemini App 内购物
- Agent 可通过 **MPP（Machine Payments Protocol，与 Tempo 联合）** 进行微支付/订阅
- MPP 支付支持：稳定币 + 法币（卡/Klarna/Affirm via SPT）

### 1.2 Link
- **Agent Wallet**：让 Agent 用 Link 钱包付款（带消费审批 + 全程可见）
- 新支付方式：US 企业可通过 Link 在巴西收 Pix、稳定币；预览在印度收 UPI
- Dashboard 新增 Link 转化率/授权率/成本影响 Tab

### 1.3 Optimized Checkout Suite
- 预览 **Checkout studio**：AI 助手 + 实时交易回放 + A/B 测试 + 个性化推荐
- 预览 Stripe Checkout 嵌入式表单（侧边栏/聊天框/弹窗）
- Pix / UPI 支持订阅、本地币种展示、跨境
- 新支付方式：Sunbit(美) / Bizum(西) / Pay by Bank(芬)
- Bizum / BLIK / Pay by Bank 支持跨境
- TWINT 支持订阅
- **Adaptive Pricing AI 模型**：实时分析会话信号自动展示本地货币
- Adaptive Pricing 支持订阅价格本地化
- 预览：Android 用户在 App 内点击卡片即可保存（Tap-to-Add）

### 1.4 Stripe Terminal
- **Stripe Reader T600**：8 寸屏新款桌面终端，可运行自定义 App（积分/加售）
- 拓展 15 个市场（含香港、墨西哥）
- 支持 Alipay、Klarna、UnionPay International
- 预览 Standalone Mode：无代码即可收款

### 1.5 Stripe Managed Payments
- 所有数字企业可用（80+ 国家间接税合规 + 反欺诈 + 争议管理 + 客服）

### 1.6 Payments Intelligence Suite
- 预览 Authorization Boost A/B 测试
- AI 驱动优化：Data Only 认证流、PINless debit 重试 → **接受率平均+3.8%、处理成本-3.3%**
- 3DS 独立使用（合规 + 反欺诈）
- Stripe Dashboard Assistant（自然语言查询支付分析）

---

## 2. Radar（反欺诈）

- **试用欺诈防护**：识别高风险试用但不误伤合法用户
- 预览 Bot 滥用防护（区分合法 AI Agent 与欺诈）
- Stripe Signals 支持链外（跨支付服务）识别欺诈
- 新 Signals：预测争议、Early Fraud Warnings、PAYG 滥用、多账户/共享账户滥用、新商家欺诈风险、商家拖欠、网站可疑活动分析
- Issuing 授权 Signals（扩展到非 Stripe 银行/金融科技）
- Radar 覆盖所有支付方式（银行扣款/钱包/BNPL/稳定币）
- 自定义 Radar 模型：业务信号 + Stripe 网络智能
- Checkout 反欺诈干预（CAPTCHA 等）+ Smart Disputes 升级

---

## 3. Revenue

### 3.1 Stripe Billing
- **Metronome**（已收购）支持更复杂的使用量计费 + 混合定价
- Metronome App 直接在 Dashboard 管理
- **流式支付**：Metronome + Tempo 组合 → 价值交付即收款
- 信用余额追踪、低余额预警、自动充值
- 预览 3 种新 Billing 自定义（订阅项显示/比例计算/信用应用）
- 预览 Payment Plans（分期付款）
- 预览 Subscription Invoice Revisions（编辑已定稿订阅发票）

### 3.2 Stripe Tax
- 美国自动报税（TaxJar）
- 预览 Shopify / NetSuite 税务连接器
- 预览 Tax 实时验证税号
- Payment Intents API 单参数自动计税
- 新增列支敦士登/墨西哥 + 数字卖家斯里兰卡；即将支持马来西亚 + 法属/西属领地

### 3.3 Data
- 预览 **Stripe MCP**：Agent 实时检索订阅指标
- 预览 **Stripe Database**：一键部署托管只读 Postgres
- 预览下一代 Data Pipeline（Google Sheets 实时同步）
- Data Pipeline 支持 Databricks
- 预览 Reports API v2（跨账户程序化报表）
- Sigma 预览 Reports API v2 程序化 SQL

---

## 4. Money Management

### 4.1 Stripe Atlas
- 创始人通过 Treasury 财务账户接收 SAFE 投资（ACH / 电汇 / 稳定币）

### 4.2 Stripe Treasury
- 年底支持 15 种货币存储（美/英企业）
- Stripe 内 US 企业间免费即时转账
- **Stripe 卡（Mastercard）**：消费返现 2%
- US 余额赚 Stripe Credits（抵处理费）
- 移动端（Stripe App）查看余额/交易/卡/消费
- 年底进入澳大利亚 + 加拿大
- 增加 41 个市场稳定币支持
- **非托管钱包（Privy）背书**：150+ 市场即时跨境转账
- **Agent 财务账户**：Agent 检查余额/付发票/存款/创建卡/转账（关键操作人工确认）

### 4.3 Stripe Global Payouts
- 预览：100+ 国家法币 + 160 国稳定币收款
- 预览：Global Payouts 用户向 Link 用户即时 USD 付款

---

## 5. Embedded Finance

### 5.1 Stripe Connect（服务 16,000+ 平台，含 Shopify/DoorDash/Substack）
- 预览 Platform Growth Studio：Dashboard 内 AI 推荐扩展产品
- **IC++ 网络成本转嫁**：45 个市场（含美/加/英/欧）
- 预览新 Embedded Components：子账户订购 Terminal、扫描支票、查看业绩图表、对账报表
- 预览 Stripe Managed Risk via API
- 预览 Managed Risk for Treasury
- 子账户一站式开启 Smart Disputes
- 子账户用 Radar（0-100 欺诈分 + AI 解释）
- **Networked Onboarding**：子账户一键入驻；预览 Link 钱包用户一键入驻
- 跨境支付：美/英/欧/加市场间
- 预览欧洲多支付商统一通过 Stripe 支付（PSD3 合规）
- 预览子账户钱包（市场内收款/消费）
- 预览预付费借记卡（消费财务账户余额）
- 预览：100 国 Connect 市场通过稳定币即时向卖家转账

### 5.2 Stripe Treasury for Platforms
- 几行代码为用户提供 Treasury + 卡（Embedded Components）
- 新功能：账单支付、自动返现、现金收款、支票收款、实时支付、会计集成

### 5.3 Stripe Capital for Platforms
- 法/德已可用 Capital；澳/加即将
- 预览 Line of Credit（重复支用）
- 预览：Capital 可为无 Stripe 历史的业务做尽调

### 5.4 Stripe Issuing
- 预览 **Issuing for Agents**：Agent 程序化发放单次虚拟卡
- 预览 Live Card Program（人 + Agent，几分钟上线）
- 预览 Consumer Debit Issuing（预付费奖励卡/分发/品牌卡）

---

## 6. Stablecoins and Crypto

- 32 个新市场支持稳定币收款
- 预览 Crypto Onramp：Headless 实现 + 自定义稳定币 + $500 内独立 KYC
- 30 国可启用消费者/商业稳定币卡
- Bridge 新增 COP/GBP onramp/offramp（之前 USD/BRL/EUR/MXN）
- Bridge 支持 USDG + 自有稳定币（CASH/USDSui/USDCBL）
- Bridge 跨链支持 Tempo / Plasma / Celo / Sui
- **Privy 数字资产账户**：全球存/转/增长稳定币余额
- Privy 灵活托管（按钱包配置自管/托管）
- Privy 托管钱包（合作持牌托管商）
- Privy 在 Morpho 上对接 DeFi 金库赚息
- Privy 命令行为 Agent 配置钱包 + Agent 管理 Dashboard
- Privy × Bridge 银行转账 onramp/offramp
- Privy Agent 可编程钱包（自动微支付 + 加密买卖）

---

## 7. Stripe Platform

- 预览 **Stripe Console**：Dashboard 内的 Agent 执行环境（自然语言诊断/任务执行，关键操作需确认）
- **Claimable Sandboxes API**：AI 合作方/平台嵌入 Stripe
- 预览自动化密钥交换（用 Claimable Sandboxes 给用户创建+传递 API Key）
- 预览 **Custom Objects**：在 Stripe 内建模业务数据/逻辑
- **Stripe Workflows GA**：新增循环/第三方自定义动作/Mailchimp·Slack 预置动作/程序化调用/Connect 支持
- 预览 Stripe Dashboard 全页多 Tab App
- **Stripe Projects**：托管/数据库/认证/可观测性/分析/AI 一站式 + 计费
- 预览 Agent Guardrails：分配 Agent 身份、强制范围规则、敏感操作审批流

---

## 8. Roadmap（未来 1 年 + Q1 2027）

Stripe 公开了 [roadmap.stripe.com](https://stripe.com/roadmap)：

### Payments 关键时间线
- **Q2 GA**：Link iOS/Android 原生 App；Apple Pay 走澳洲 eftpos；Satispay / Scalapay 跨境；合法 CBD 商家可用
- **Q3 Preview**：Off-session 支付 API；基于会话的用量计费（token / API 调用粒度）
- **Q4 GA**：Stripe Payments 余额内 13+ 货币即时兑换（35 个市场）；Terminal 动态货币转换 + Multicapture

### Radar
- **Q3 GA**：Radar 自动调整欺诈拦截阈值
- **Q4 Preview**：争议率阈值触发 AI 自动解决争议

### Revenue / Billing
- **Q3 GA**：Metronome GPU 云 Reserved Instance 承诺建模；用量单位发放 Credit（如 1000 次免费 API 调用）

### Money Management / Treasury
- **Q2 Preview**：US 用户 24/7 用稳定币访问余额 + Atlas 创始人即时获得 USD 余额账户 + Dashboard 一站式财务
- **Q3 GA**：所有卡/非借记收益次日到账；Dashboard 全功能
- **Q4 GA**：RTP 实时支付；SAFE 募资全流程；15 种货币收款
- Treasury 稳定币 offramp 新增市场（BRL/AUD/GBP/NGN/ZAR/KES 等）

### Connect / Embedded Finance
- **Q2 GA**：Accounts v2 API（一个客户一个身份 + 跨产品 KYC 复用 + 多币种结算）
- **Q3 Preview**：Onboarding 漏斗分析
- **Q4 GA**：90%+ 国家身份验证覆盖

### Crypto / Stablecoins
- **Q2 Preview**：USDT 支付货币
- **Q3 GA**：33 新国家稳定币收款
- **Q4 Preview**：BTC/SOL/ETH 支付货币；加密交易结算成稳定币余额
- Bridge：Abstract 链；USDCBL/EURC on Stellar；Tempo/World/Linea/Base 非托管卡充值

---

## 关键洞察（与跨境电商 / AI 直播平台相关）

1. **Agentic Commerce = 新渠道**：Meta（Facebook 广告原生结账）+ Google（Gemini App）双巨头打通 → 必须让自己的商品目录对 Agent 友好（结构化数据/支付凭证/退货流程）
2. **稳定币成为跨境标配**：Stripe 直接把稳定币推到 100+ 国即时转账，绕开 SWIFT
3. **Stripe 变"操作系统"**：Custom Objects + Workflows + MCP + Stripe Projects + Stripe Console → 不再是支付网关而是商业基础设施
4. **Agent 经济基础设施**：Agent Wallet / Agent 财务账户 / Agent Guardrails / Issuing for Agents → AI Agent 不再是工具而是"客户"
5. **合规 + 自动化一体**：Tax 自动报税、Smart Disputes、Managed Risk → 大幅降低跨境合规成本
6. **Metronome + Tempo 流式支付**：价值交付即收款，对应 AI API / 内容生成等场景

---

## 参考资料
- 原文：https://stripe.com/blog/everything-we-announced-at-sessions-2026
- 公开路线图：https://stripe.com/roadmap
- 已发布功能：https://stripe.com/shipped
- 大会日程：https://stripe.com/sessions/2026