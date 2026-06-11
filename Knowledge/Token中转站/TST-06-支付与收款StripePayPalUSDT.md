---
title: TST-06 支付与收款(Stripe/PayPal/USDT)
created: 2026-06-11
tags: [token中转站, 支付, stripe, USDT, 国际收款, TST系列]
series: Token中转站
order: 6
---

# TST-06 支付与收款(Stripe/PayPal/USDT)——Token 中转站国际化收款的命门

> 系列位置：TST-01 市场与需求 / TST-02 选品与采购 / TST-03 上游 API 接入 / TST-04 风控与限速 / TST-05 多账号与多渠道 / **TST-06 支付与收款** / TST-07 客服与退款 / TST-08 数据与增长 / TST-09 合规与法律 / TST-10 团队与流程
>
> 阅读对象：准备把 Token(OpenAI/Anthropic/Google 等模型 API 配额)卖给海外用户的创业者、跨境电商从业者、独立开发者，以及需要管理账期的财务人员。
>
> 一句话结论：**对 AI Token 这种"看不见、摸不着、买家可能在任何地方"的数字商品，Stripe 是上限最高但下限最危险的通道，USDT 是下限最稳但上限最矮的通道，PayPal 居中。**真正能稳定跑到月收 5 万美金以上的玩家，**都是 2-3 个通道混跑**，没有任何一个单一通道是万能的。

---

## 0. 为什么"支付与收款"是 Token 中转站的生死线

很多创业者在前 5 篇文章里研究了市场、选品、限速、多账号，最后发现：

- **上游 API 钱花了**（充值 GPT-4、组织 Claude 账号、囤 Google Vertex 配额）
- **下游用户来了**（营销跑通，CVR 2% 算优秀）
- **中间收款被冻**——Stripe 账户突然 Reserve 100%，PayPal 提现 180 天，USDT 收到但出金银行不给入账

**收不到钱 = 上游欠费停服 + 团队工资发不出 + 客诉爆炸 = 项目直接死。**

我在 TST-04 风控与限速中提过，OpenAI/Anthropic 对"高 QPS、高并发"敏感；同样，**Stripe/PayPal/银行 对"高单价、高频次、跨境、数字商品"也敏感**。这两类风控本质上是一回事——都是反欺诈/反洗钱体系在保护上游资源。

本文会从 10 个维度讲透：

1. 支付通道全景与对比表
2. Stripe 完整实战（Atlas、Checkout、Subscription、Connect、Radar）
3. Stripe 被打冻的真实原因与解冻 SOP
4. PayPal 实战
5. USDT 收款（最关心）
6. 支付聚合方案（MoR 模式）
7. 税务合规
8. 反欺诈
9. 真实案例（2024-2025 年）
10. 实战推荐 + 30 天落地 SOP

---

## 1. 支付通道全景

### 1.1 五大类通道

我把所有可用通道分成 5 类，方便你按"目标用户地区 + 客单价 + 频率"组合选择：

| 类别 | 代表通道 | 适合地区 | 适合客单价 | 适合频率 | 接入难度 |
|------|---------|---------|-----------|---------|---------|
| 信用卡 | Stripe / PayPal / Adyen / Braintree | 全球，欧美最强 | $5 - $10,000 | 中高频 | 中 |
| 加密 | USDT-TRC20 / USDT-ERC20 / BTC / ETH | 全球（无银行账户地区最佳） | $50 - $50,000 | 中低频 | 低 |
| 地区性钱包 | Wise / PingPong / Airwallex | 跨境 B2B 收款 | $1,000+ | 低频 | 中 |
| 本地化支付 | iDEAL / Klarna / PIX / FPX | 荷兰/北欧/巴西/东南亚 | $5 - $500 | 高频 | 高 |
| 聚合平台 | Paddle / FastSpring / 2Checkout | 全球（替你处理税务） | $10 - $5,000 | 中高频 | 低 |

### 1.2 详细对比表（这一张请你打印贴墙）

| 通道 | 综合费率 | 提现到账 | 拒付风险 | 合规要求 | Token 中转站适配度 |
|------|---------|---------|---------|---------|------------------|
| **Stripe** | 2.9% + $0.30（美国）/ 3.6% + ¥2.3（中国）/ 欧洲 1.5% + €0.25 | T+2 到银行 | 中（高客单被盯） | KYC + 业务说明 + 银行流水 | ⭐⭐⭐⭐⭐（最专业、最完整、但高风险品类易冻） |
| **PayPal** | 4.4% + $0.30（美国商业交易） | 即时到 PayPal 余额，提现 T+3-5 | 高（180 天卖家保护反而坑自己） | KYC + 银行账户 | ⭐⭐⭐（成熟用户基数大，但争议处理更倾向买家） |
| **Adyen** | 0.6% + €0.12 起（按通道算） | T+1 到 T+3 | 低 | KYC + 完整商业注册文件 | ⭐⭐（$10K+ 月流水才划算，入门难） |
| **Braintree**（PayPal 子品牌） | 2.9% + $0.30 | T+2-3 | 中 | KYC + 银行账户 | ⭐⭐⭐（与 PayPal 生态打通，分账功能强） |
| **USDT-TRC20** | 网络费 $1（约 1 USDT），无通道费 | 1-5 分钟确认 | 极低（链上不可逆） | 钱包地址 + 资金来源说明 | ⭐⭐⭐⭐⭐（下限最稳，但上限受出金限制） |
| **USDT-ERC20** | 网络费 $5-$50（Gas 波动大） | 5-15 分钟 | 极低 | 同上 | ⭐⭐（贵到不实用，除非客户主动要求） |
| **USDT-Polygon** | 网络费 $0.001-$0.01 | 1-3 分钟 | 极低 | 同上 | ⭐⭐⭐⭐（越来越主流，费率友好） |
| **Wise** | 0.4-0.7% | T+1-2 | 极低 | KYC + 商业账户 | ⭐⭐⭐（B2B 收款神器，C 端体验差） |
| **PingPong** | 1% 左右 | T+1 | 低 | 营业执照 + 银行账户 | ⭐⭐⭐（国内团队出海收款首选之一） |
| **Airwallex** | 0.4% 起步 | T+1 | 低 | 商业注册 + KYC | ⭐⭐⭐⭐（多币种账户 + 虚拟卡，发卡收款一体） |
| **iDEAL**（荷兰） | €0.29/笔 | T+1 | 极低 | 商户号申请 | ⭐⭐（荷兰 70% 在线支付用这个） |
| **Klarna**（北欧） | 1.5-3% | T+2 | 中 | 商户号申请 | ⭐⭐（先买后付，用户基数大） |
| **PIX**（巴西） | 免费（央行） | 即时 | 极低 | 巴西本地实体或 PSP | ⭐⭐⭐（巴西电商增长点） |
| **Paddle** | 5% + $0.50 | T+15（业内最慢） | 低（他们兜底） | 他们替你搞定 | ⭐⭐⭐⭐（省心，但抽成重） |
| **FastSpring** | 5.9% + $0.95 | T+15-30 | 低（兜底） | 同上 | ⭐⭐⭐（订阅类软件友好） |
| **2Checkout** | 3.5% + $0.35 | T+10-30 | 中 | 同上 | ⭐⭐（老牌但体验落后） |

**关键洞察**：
- **不要为了"省 0.5% 费率"放弃 Stripe**——Stripe 的开发体验、API、Webhook、文档、合规工具是其他通道加在一起都比不上的。费率差异赚不回来"少踩坑"的隐性收益。
- **USDT 是下限最稳的"保命通道"**——只要你能搞定出金（见第 5 章），它就是最不会被打冻的。
- **聚合平台（Paddle/FastSpring）适合"懒人"**——5% 抽成看起来贵，但省了 1 个全职合规 + 1 个全职财务的人力成本。月收 5 万美金以下建议优先考虑。

---

## 2. Stripe 完整实战

### 2.1 公司主体选择：这是你做的第一个战略决策

| 主体类型 | 注册成本 | 注册周期 | Stripe 接受度 | 银行开户 | 适合人群 |
|---------|---------|---------|--------------|---------|---------|
| **美国 LLC**（怀俄明/德拉瓦） | $500-$2,000 | 7-15 天 | ⭐⭐⭐⭐⭐（最高） | Mercury / Relay / Wise | 想做长期品牌、想融美元 VC、客单价高 |
| **香港公司** | HKD 5,000-15,000 | 5-10 个工作日 | ⭐⭐⭐⭐ | 香港虚拟银行（ZA Bank / Airwallex） | 团队在国内、想合规结汇、有港币需求 |
| **爱沙尼亚 E-Residency** | €100（政府）+ €500-1,000（代办） | 4-6 周 | ⭐⭐⭐（Stripe 会要额外文件） | LHV / Wise | 想做欧盟市场、想"数字游民"路线 |
| **新加坡 PTE LTD** | SGD 300 + 注册地址 | 3-5 天 | ⭐⭐⭐⭐⭐ | Aspire / Airwallex / Wise | 团队在东南亚、想做亚洲市场 |
| **英国 LTD** | £12-50 | 1-3 天 | ⭐⭐⭐⭐ | Wise / Mercury | 欧盟 + 英国通吃，但脱欧后税务变复杂 |
| **国内个体工商户/有限公司** | 几乎免费 | 1-2 周 | ⭐⭐（能开但额度低、品类受限） | PingPong / Airwallex | 启动资金 < 1 万美金的 MVP 阶段 |

**我的建议（实操层面）**：

1. **MVP 阶段（< 1 万美金月流水）**：先用国内公司 + PingPong/Airwallex 出金，Stripe 通过 Stripe Atlas 注册美国 LLC（$500 一价全包）。
2. **成长阶段（1-10 万美金月流水）**：主账户放美国 LLC（Wyoming），用 Mercury 开企业账户；同时在 Airwallex 开个备用账户。
3. **规模化阶段（> 10 万美金月流水）**：再考虑新加坡 PTE LTD 或香港公司作为备份主体，做多主体账户隔离（参见 TST-05 多账号与多渠道）。

### 2.2 Stripe Atlas 注册流程

Stripe Atlas 是 Stripe 官方推出的"美国公司一站式注册"服务，$500 包含：
- 怀俄明州 LLC 注册
- EIN（联邦税号）
- Stripe 账户开通
- 1 年注册代理 + 1 年虚拟办公室地址
- 模板化的公司章程

**实操步骤**：

1. 访问 https://stripe.com/atlas 申请
2. 填写个人信息（护照 + 家庭地址 + 业务描述）
3. 选择公司类型：**LLC + C-Corp 税务处理**（LLC 默认 pass-through，但建议跟会计师确认）
4. 等待审批：通常 3-5 个工作日会收到 LLC 注册确认 + EIN
5. 拿到 EIN 后去 Stripe 填写 KYC（公司信息 + 受益人信息 + 产品 URL）
6. 等待 Stripe 风险审核：通常 1-2 周

**注意**：
- 业务描述里**避免出现"AI API reselling"、"token reselling"、"gpt resale"**——这些词直接触发 MCC 5817（数字商品）的强化风控。改成"AI productivity tools"、"developer SaaS platform"、"API management service"。
- 准备好产品 URL（哪怕只是 Landing Page + Stripe Checkout 按钮）+ 隐私政策 + 服务条款。
- 准备好你的"上游供应商证明"——能解释你的 token 从哪来。Stripe 一定问。

### 2.3 Stripe Checkout 集成（Token 中转站充值场景）

**场景**：用户想充值 $50 拿等值的 GPT-4 调用额度。

```javascript
// Node.js 集成示例（Express）
const express = require('express');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.raw({ type: 'application/json' })); // webhook 需要 raw body

app.post('/api/recharge', async (req, res) => {
  const { amount_usd, user_id, package_name } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Token 充值包 - ${package_name}`,
            description: `${amount_usd} 美元等值的 AI Token 调用额度，永不过期`,
          },
          unit_amount: Math.round(amount_usd * 100), // cents
        },
        quantity: 1,
      }],
      // 关键：开启 Radar 反欺诈
      payment_intent_data: {
        statement_descriptor: 'AI TOKEN TOPUP',
        metadata: { user_id, package_name },
      },
      // 关键：3DS 强制验证（高客单价必备）
      payment_method_options: {
        card: {
          request_three_d_secure: 'any', // 强制 3DS
        },
      },
      // 关键：限制地区（高风险地区直接拒）
      shipping_address_collection: { allowed_countries: ['US', 'GB', 'DE', 'FR', 'CA', 'AU', 'JP', 'SG'] },
      success_url: `${process.env.DOMAIN}/recharge/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DOMAIN}/recharge/cancel`,
      metadata: { user_id, package_name, amount_usd },
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'payment_init_failed' });
  }
});
```

### 2.4 Webhook 处理（必须！这是"钱到账"的唯一权威信号）

```javascript
// Webhook：监听 checkout.session.completed
app.post('/webhook/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { user_id, package_name, amount_usd } = session.metadata;

      // 关键幂等性检查：防止 webhook 重发导致重复加额度
      const orderId = `stripe_${session.id}`;
      const exists = await db.orders.findOne({ order_id: orderId });
      if (exists) {
        return res.json({ received: true, duplicate: true });
      }

      // 写入订单 + 加额度（事务）
      await db.orders.insertOne({
        order_id: orderId,
        user_id,
        amount_usd: parseFloat(amount_usd),
        package_name,
        stripe_session_id: session.id,
        payment_intent: session.payment_intent,
        status: 'paid',
        created_at: new Date(),
      });

      // 给用户加 token 额度
      await db.users.updateOne(
        { _id: user_id },
        { $inc: { token_balance: parseFloat(amount_usd) * 1000 } } // 假设 1 USD = 1000 tokens
      );

      // 发送邮件通知
      await sendEmail(user.email, '充值成功', `您已成功充值 $${amount_usd}，新余额 ${newBalance} tokens`);
      break;
    }

    case 'charge.dispute.created': {
      // 争议（拒付）创建！立刻处理
      const dispute = event.data.object;
      await sendSlackAlert(`🚨 Stripe 争议创建: $${dispute.amount/100} 原因: ${dispute.reason}`);
      // 自动提交 evidence
      await handleDispute(dispute);
      break;
    }

    case 'account.updated': {
      // Stripe Connect 子账户状态变化
      const account = event.data.object;
      if (!account.charges_enabled) {
        await sendSlackAlert(`⚠️ Connect 账户被限制: ${account.id}`);
      }
      break;
    }
  }

  res.json({ received: true });
});
```

**Webhook 必须用 raw body**（不要用 express.json()），否则签名验证会失败。这是 90% 的人踩的第一个坑。

### 2.5 Stripe Customer + Subscription 实现订阅

订阅模式适合"每月 30 美金包含 100 万 token"的 SaaS 化产品：

```python
# Python 集成示例（FastAPI + stripe-python）
import stripe
from fastapi import FastAPI, Request
from pydantic import BaseModel

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
app = FastAPI()

class SubscribeRequest(BaseModel):
    user_id: str
    price_id: str  # Stripe 后台创建的 Price ID

@app.post("/api/subscribe")
async def create_subscription(req: SubscribeRequest):
    # 1. 创建或获取 Customer
    user = await db.users.find_one({"_id": req.user_id})
    if not user.get("stripe_customer_id"):
        customer = stripe.Customer.create(
            email=user["email"],
            metadata={"user_id": req.user_id},
        )
        await db.users.update_one(
            {"_id": req.user_id},
            {"$set": {"stripe_customer_id": customer.id}}
        )
    else:
        customer = stripe.Customer.retrieve(user["stripe_customer_id"])

    # 2. 创建 Subscription
    subscription = stripe.Subscription.create(
        customer=customer.id,
        items=[{"price": req.price_id}],
        payment_behavior="default_incomplete",
        payment_settings={"save_default_payment_method": "on_subscription"},
        expand=["latest_invoice.payment_intent"],
        # 关键：7 天免费试用
        trial_period_days=7,
    )

    return {
        "subscription_id": subscription.id,
        "client_secret": subscription.latest_invoice.payment_intent.client_secret,
        "status": subscription.status,
    }

# 关键：监听 invoice.payment_succeeded 续费
@app.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)

    if event.type == "invoice.payment_succeeded":
        invoice = event.data.object
        subscription_id = invoice.subscription
        # 续费成功，加下月额度
        await refresh_monthly_quota(subscription_id)

    elif event.type == "customer.subscription.deleted":
        # 取消订阅，停止服务
        await stop_service(subscription_id)

    return {"received": True}
```

### 2.6 Stripe Connect 实现多商户分账

**场景**：你做的是"Token 中转站 Marketplace"——多个上游商家（A 提供 GPT-4 账号、B 提供 Claude 账号）在你平台卖 token，你抽 20% 佣金，商家拿 80%。

```javascript
// 平台作为 Connect 平台账户，子账户是商家
// 1. 创建商家子账户
async function createConnectedAccount(merchant) {
  const account = await stripe.accounts.create({
    type: 'express', // 商家后台用 Stripe 提供的标准化界面
    country: 'US',
    email: merchant.email,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: 'individual',
    business_profile: {
      mcc: '5817', // 软件/数字商品
      product_description: 'AI API token aggregation service',
    },
    metadata: { merchant_id: merchant.id },
  });
  return account;
}

// 2. 用户付款后分账：80% 给商家，20% 留平台
async function splitPayment(merchantAccountId, totalAmountCents) {
  const platformFee = Math.round(totalAmountCents * 0.2);
  const merchantAmount = totalAmountCents - platformFee;

  await stripe.transfers.create({
    amount: merchantAmount,
    currency: 'usd',
    destination: merchantAccountId,
    // 关键：metadata 用于对账
    metadata: { original_payment: 'pi_xxx' },
  });
}

// 3. 使用 PaymentIntent 的 application_fee_amount 自动分账（推荐）
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000, // $50
  currency: 'usd',
  application_fee_amount: 1000, // 平台抽 $10
  transfer_data: { destination: merchantAccountId },
});
```

**Connect 类型选择**：
- **Standard**：商家自己拥有完整 Stripe 账户，独立性最强（适合"长期商家合作伙伴"）
- **Express**：Stripe 提供简化后台（推荐用于 Token 中转站，商家不需要看到所有功能）
- **Custom**：你完全自己写后台（除非你有 50+ 工程师团队，否则别用）

### 2.7 Stripe Radar 欺诈检测（防 chargeback）

Radar 是 Stripe 自带的反欺诈 ML 模型，**默认开启**但能力有限。你需要做这些配置：

```javascript
// 在 PaymentIntent 开启 Radar 评估
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000,
  currency: 'usd',
  payment_method_types: ['card'],
  // 关键：自定义 Radar 规则
  radar_options: {
    session: 'ssn_xxx', // 收集设备指纹（前端 Stripe.js 自动生成）
  },
});

// 收到 Radar 评估结果
// review 属性：'allow' / 'review' / 'block'
// 建议：'review' 状态的订单人工审核（高客单价必做）
```

**Radar 关键规则配置**（在 Dashboard → Radar → Rules 设置）：

| 规则 | 阈值 | 动作 |
|------|------|------|
| 卡片 BIN 来自高风险国家 | BIN 前 4 位匹配"指定国家列表" | Block |
| 同一卡 24 小时内 > 3 笔 | 触发 | Review |
| 单笔 > $500 | 触发 | 强制 3DS |
| 设备指纹异常（IP 跨国跳转） | 触发 | Review |
| CVV 校验失败 | 触发 | Block |
| AVS（地址验证）不匹配 | 触发 | Review |

**成本**：Radar for Fraud Teams 是 $0.02/笔 + 0.05% 交易额。月收 5 万美金大概多花 $25-$50。

### 2.8 备选：Stripe 的"隐藏替代品"——Checkout vs Payment Links vs Elements

| 方案 | 代码量 | 适合场景 |
|------|-------|---------|
| **Stripe Checkout**（托管） | 10 行 | 90% 的场景（推荐） |
| **Payment Links**（无代码） | 0 行 | Landing Page 卖单次产品 |
| **Elements**（嵌入式） | 100+ 行 | 需要完全自定义 UI |

**Token 中转站推荐用 Checkout**——托管意味着 PCI 合规不用你自己搞，UI 不丑，移动端适配免费。

---

## 3. Stripe 被打冻的真实原因与解冻 SOP

### 3.1 Stripe 风控是怎么运作的

Stripe 内部有一个叫"行为风控引擎"的东西，会从这些维度评估你：

1. **MCC（商户类别码）**：5817（数字商品）、7995（博彩）、6051（加密货币）都是高风险码
2. **业务模式**：预付卡、跨境汇款、虚拟商品、可下载内容 → 高风险
3. **拒付率（chargeback rate）**：> 0.65% 触发警告，> 1% 触发 Reserve
4. **争议率**：每 100 笔交易中"买家投诉 + 拒付"数量
5. **退款率**：> 5% 触发审查
6. **资金流动**：突然日入 $10K（之前月入 $1K）触发人工 review
7. **地理位置**：交易 IP 在俄罗斯/朝鲜/伊朗/委内瑞拉/古巴直接 block
8. **卡片 BIN**：来自预付卡、虚拟卡、加密借记卡的 BIN 触发审查
9. **账户网络**：你公司地址、电话、邮箱、IP 在 Stripe 内部"高风险网络"里（比如同一 IP 段有其他被冻账户）

### 3.2 触发打冻的 5 大行为

**真实案例 1：急速增长**——某 AI 公司做了 2 个月后月入从 $5K 涨到 $80K，第 3 周被打冻。
- 原因：增长曲线"不像正常商业"，Stripe 怀疑你在洗钱
- 解法：准备 6 个月的银行流水 + 商业发票 + 客户合同（证明这是真业务）

**真实案例 2：MCC 5817 + 虚拟商品描述**——"sell OpenAI API credits" "GPT-4 token reseller" 出现在网站或产品描述里。
- 原因：直接命中 5817 高风险关键词清单
- 解法：把所有出现 "resell" "reseller" "credits" "tokens" 的描述改成 "platform"、"workspace"、"AI productivity suite"

**真实案例 3：拒付率过高**——某 Token 卖家拒付率 1.8%（Stripe 警戒线是 0.65%）。
- 原因：客户在 Stripe 看到 "AI 充值" 以为是订阅就拒付
- 解法：结账页面明确写"一次性数字商品交付，所有销售最终"，并主动发邮件提醒"已交付、不接受无理由拒付"

**真实案例 4：单一国家客户占比 > 80%**——某美国公司客户 95% 在尼日利亚。
- 原因：BIN 欺诈 + 信用卡滥用高发区
- 解法：Stripe Dashboard 主动设置"高风险国家黑名单"

**真实案例 5：银行账户信息不匹配**——LLC 注册在 Wyoming，但 EIN 申请时 IP 在中国大陆，bank statement 地址是香港。
- 原因：信息不一致触发"KYC 增强审查"
- 解法：所有公司信息保持一致，注册代理 + 实际办公地址 + 银行开户地址尽量同一国家

### 3.3 被打冻后的解冻 SOP（按天推进）

| 阶段 | 时间 | 你要做的事 |
|------|------|----------|
| 第 1 天 | T+0 | 不要慌！登录 Dashboard 看具体限制类型（"Review"、"Reserve"、"Disabled"） |
| 第 1 天 | T+0 | 立即删除所有产品页面里"resell"、"credits"、"token"、"AI API"等敏感词 |
| 第 2 天 | T+1 | 联系 Stripe Support 写一份"业务说明函"（Business Description Letter） |
| 第 3 天 | T+2 | 提交 6 类材料：① 银行流水 ② 公司注册证书 ③ EIN ④ 产品截图 ⑤ 隐私政策 ⑥ 服务条款 |
| 第 5 天 | T+4 | 主动联系 Stripe Risk Team（risk@stripe.com），提供典型客户案例 |
| 第 7 天 | T+6 | 如果还没回复，发"代理人请求"——通过 Stripe 官方合作伙伴加速器联系 |
| 第 14 天 | T+13 | 如果还没解冻，准备"Plan B"——见下节"Stripe 备份账户策略" |

**业务说明函模板**（英文，关键内容）：

```
Subject: Business Description - [公司名] - [Stripe Account ID]

Dear Stripe Risk Team,

[公司名] is a [业务类型，如 "SaaS productivity platform"] that provides
[产品类型，如 "AI-powered writing assistant tools"] to individual professionals
and small businesses. Our users [使用场景，如 "create marketing copy, summarize
documents, and generate code snippets"].

We do NOT resell, redistribute, or directly access any third-party AI APIs.
Our service is built on [技术描述，如 "our proprietary orchestration layer that
connects to multiple AI model providers"].

Key facts:
- Average transaction: $X (range $X-$Y)
- Top 3 customer countries: US (45%), UK (20%), Canada (15%)
- Monthly volume: $X
- Chargeback rate: 0.X%
- Refund rate: 0.X%

Attached:
1. Certificate of Incorporation
2. EIN letter from IRS
3. Bank statements (last 3 months)
4. Product screenshots
5. Customer testimonials (3)
6. Sample user agreements

We are happy to provide additional documentation upon request.

Best regards,
[你的名字]
[职位]
[公司名]
```

### 3.4 Stripe 备份账户策略（关键中的关键）

**核心原则：永远不要把"所有鸡蛋放一个 Stripe 账户里"。**

**3 账户隔离架构**：

```
[主账户 - 美国 LLC A]
    ↓ 跑 60% 业务
    ↓ 接大部分客户

[备份账户 - 美国 LLC B]  
    ↓ 跑 30% 业务
    ↓ 主账户被冻时接管

[应急账户 - 香港公司 / 新加坡 PTE]
    ↓ 跑 10% 业务
    ↓ 跨境客户专用
```

**切换流程**（主账户被冻时）：
1. 用 API key 切换（产品代码里 `STRIPE_SECRET_KEY` 是环境变量）
2. 通知用户"我们的支付系统升级中，请重新绑定信用卡"（不要告诉用户"我们被冻了"）
3. 重新申请一个 Stripe 账户（用新 LLC + 新 EIN + 新银行账户）
4. 把 Webhook endpoint 指向新账户

**注意**：Stripe 不允许"同一受益人开多个账户"。所以你必须有**不同的法律实体**（不同 LLC + 不同 EIN + 不同受益人 SSN/ITIN）。

我建议的实操路径：
1. 自己和老婆/合伙人各注册一个 Atlas LLC
2. 各自开通 Stripe
3. 通过"分账户路由表"分配流量
4. 一个人被打冻，另一个能马上扛

---

## 4. PayPal 实战

### 4.1 PayPal Business 账户注册

- **个人版 vs Business 版**：必须 Business。
- **注册条件**：护照 + 银行账户（美元/欧元/港币账户）。
- **审核周期**：即时到 3 天。
- **支持的提现币种**：美元、欧元、英镑、港币、澳元、加元、日元等 20+。

**PayPal 比 Stripe 强的地方**：
- 客户基数大（全球 4 亿+ 活跃账户）
- 支持的国家更多（200+ vs Stripe 的 50+）
- 跨境收款更"自然"（用户不会因为是 PayPal 而犹豫）

**PayPal 比 Stripe 弱的地方**：
- API 体验差（落后 Stripe 5 年）
- 争议处理倾向买家
- 费率更高（4.4% vs 2.9%）

### 4.2 PayPal Subscriptions API

```python
# Python PayPal SDK 集成
import paypalrestsdk

paypalrestsdk.configure({
    "mode": "live",  # 或 "sandbox"
    "client_id": "...",
    "client_secret": "...",
})

# 创建订阅计划
plan = paypalrestsdk.Plan({
    "name": "AI Pro Monthly",
    "description": "100 万 token 每月",
    "type": "infinite",
    "payment_definitions": [{
        "name": "Regular payment",
        "type": "REGULAR",
        "frequency": "MONTH",
        "frequency_interval": 1,
        "amount": {
            "currency": "USD",
            "value": "29.99"
        }
    }],
    "merchant_preferences": {
        "return_url": "https://yoursite.com/success",
        "cancel_url": "https://yoursite.com/cancel",
        "auto_bill_amount": "YES",
        "initial_fail_amount_action": "CANCEL"
    }
})

plan.create()

# 创建激活协议
agreement = paypalrestsdk.Agreement({
    "name": "AI Pro Monthly",
    "description": "100 万 token 每月",
    "start_date": "2026-07-01T00:00:00Z",
    "plan": {"id": plan.id},
    "payer": {"payment_method": "paypal"}
})

agreement.create()
# 跳转到 approval_url 让用户确认
```

### 4.3 181 天卖家保护（这是个坑）

PayPal 卖家保护条款规定：**未发货的虚拟商品不在保护范围内**。

这意味着你卖 Token 给了客户，客户说"我没收到" → 客户发起争议 → PayPal 几乎必然判客户赢 → 你钱没了 + 账户被标记。

**规避方法**：
1. **结账前明确"虚拟商品，一经售出不退不换"**（不保证 100% 保护，但能减少争议）
2. **保留"交付证据"**——用户领取 token 的 API 日志、用户 IP + 时间戳 + token 字符串
3. **单笔金额控制在 $250 以下**（PayPal 对高金额争议处理更严）
4. **KYC 严格 + 拒绝来自高争议国家**的订单（参考 Stripe 章节）

### 4.4 PayPal 争议处理流程

```
买家发起争议 → PayPal 通知你 → 你有 10 天回应
                              ↓
                    提交 evidence（交付证据）
                              ↓
                    PayPal 判决（平均 30 天）
                              ↓
              买家赢：你钱被扣 + 账户扣 1 个 "case"
              你赢：钱退回，账户清白
```

**关键证据清单**：
- 交易明细（金额、时间、买家邮箱、IP）
- 物流追踪号（如果是实体商品，Token 业务用不了）
- 买家签字的"已收到"确认
- 沟通记录（聊天截图、邮件）
- 你的"交付"证据（API 调用日志 + 用户的 token 余额变化）

**Token 业务的难点**：你交付的是"调用 API 的额度"，无法用物流证明。最有效的证据是**用户在产品里首次使用 token 的时间戳 + IP + User-Agent**。

---

## 5. USDT 收款（最关心的章节）

### 5.1 链选择：TRC20 vs ERC20 vs Polygon

| 维度 | TRC20（Tron） | ERC20（Ethereum） | Polygon |
|------|--------------|------------------|---------|
| **网络费** | $1（约 1 USDT） | $5-$50（Gas 波动大） | $0.001-$0.01 |
| **确认时间** | 1-5 分钟 | 5-15 分钟 | 1-3 分钟 |
| **最小转账** | 1 USDT | 1 USDT（实际建议 $10+） | 0.01 USDT |
| **支持钱包** | 几乎所有 | 几乎所有 | 越来越多 |
| **用户认知度** | ⭐⭐⭐⭐⭐（亚洲最强） | ⭐⭐⭐⭐（欧美主流） | ⭐⭐（新兴） |
| **入金合规** | ⭐⭐（Tron 链上 KYT 工具弱） | ⭐⭐⭐（Chainalysis 重点监控） | ⭐⭐⭐ |

**我的建议**：

- **默认收 TRC20**——90% 客户手里是 USDT-TRC20，链上费用低。
- **可选收 ERC20**——给"高端客户"提供，告诉他"我们的 ETH 钱包也接受"。
- **不推荐 Polygon**——除非你的客户主动要求。

### 5.2 钱包方案：自己生成 vs 第三方

#### 方案 A：自己生成钱包

```javascript
// Node.js + ethers.js 生成钱包
const { ethers } = require('ethers');
const wallet = ethers.Wallet.createRandom();

console.log('Address:', wallet.address);
console.log('Private Key:', wallet.privateKey);
console.log('Mnemonic:', wallet.mnemonic.phrase);
```

**优点**：完全控制、零中间商
**缺点**：
- 你得自己监听链上交易（需要跑全节点或用 Infura/Alchemy）
- 自己处理 KYT（Know Your Transaction）合规
- 出金到法币时仍然要走交易所或 OTC

**实战代码：监听 USDT-TRC20 收款**：

```javascript
// 使用 TronWeb 监听 TRC20 USDT
const TronWeb = require('tronweb');
const HttpProvider = TronWeb.providers.HttpProvider;
const fullNode = new HttpProvider('https://api.trongrid.io');
const solidityNode = new HttpProvider('https://api.trongrid.io');
const eventServer = new HttpProvider('https://api.trongrid.io');

const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, 'YOUR_PRIVATE_KEY');

// USDT-TRC20 合约地址
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// 轮询方式监听（生产环境推荐 WebSocket）
async function checkIncomingPayments() {
  // 你的收款地址
  const myAddress = 'TYourAddress...';

  // 1. 获取该地址的 TRC20 交易
  const response = await fetch(
    `https://api.trongrid.io/v1/accounts/${myAddress}/transactions/trc20?only_confirmed=true&limit=20`
  );
  const data = await response.json();

  for (const tx of data.data) {
    if (tx.token_info.address === USDT_CONTRACT) {
      // 收到 USDT
      const amount = tx.value / 1e6; // USDT 6 位小数
      const from = tx.from;
      const txId = tx.transaction_id;

      // 幂等性检查
      const exists = await db.payments.findOne({ tx_id: txId });
      if (exists) continue;

      // 检查确认数
      if (tx.block_timestamp && Date.now() - tx.block_timestamp < 60000) continue;

      // 匹配用户订单
      const order = await db.orders.findOne({
        status: 'pending',
        expected_amount: amount,
        payment_address: myAddress,
      });

      if (order) {
        await db.payments.insertOne({
          tx_id: txId,
          from,
          to: myAddress,
          amount,
          order_id: order.order_id,
          user_id: order.user_id,
          confirmed_at: new Date(),
        });

        // 标记订单支付成功 + 加额度
        await db.orders.updateOne(
          { order_id: order.order_id },
          { $set: { status: 'paid', paid_at: new Date(), tx_id: txId } }
        );
        await db.users.updateOne(
          { _id: order.user_id },
          { $inc: { token_balance: amount * 1000 } }
        );

        await sendEmail(order.user_email, '充值成功', `已收到 ${amount} USDT`);
      }
    }
  }
}

// 每 10 秒轮询一次
setInterval(checkIncomingPayments, 10000);
```

#### 方案 B：第三方支付网关（推荐新手）

**NOWPayments** 和 **Coingate** 是最主流的两个：

| 平台 | 费率 | 最低提现 | 提现方式 | 优点 | 缺点 |
|------|------|---------|---------|------|------|
| **NOWPayments** | 0.4-0.5% | $50 | 加密或法币（SWIFT） | 50+ 币种 | KYC 严格 |
| **Coingate** | 1% | €50 | 加密或 SEPA | 欧洲强 | 客服慢 |
| **CoinPayments** | 0.5% | $100 | 加密 | 老牌 | UI 落后 |
| **BTCPay Server** | 自建（无手续费） | 无 | 自管 | 零费率 | 运维成本高 |

**NOWPayments 集成代码**：

```python
# Python 集成 NOWPayments
import requests

API_KEY = "your_api_key"
BASE_URL = "https://api.nowpayments.io/v1"

# 1. 创建支付订单
response = requests.post(
    f"{BASE_URL}/payment",
    json={
        "price_amount": 50,  # USD
        "price_currency": "usd",
        "pay_currency": "usdttrc20",  # USDT-TRC20
        "order_id": "order_123",
        "order_description": "1000 AI tokens",
        "ipn_callback_url": "https://yoursite.com/webhook/nowpayments",
        "success_url": "https://yoursite.com/success",
        "cancel_url": "https://yoursite.com/cancel",
    },
    headers={"x-api-key": API_KEY}
)

payment = response.json()
# 返回: {"payment_id": "...", "pay_address": "T...", "pay_amount": 50.0, "pay_currency": "usdttrc20", ...}

# 2. Webhook 接收付款通知（IPN）
# POST 到 /webhook/nowpayments
# payload: {"payment_id": "...", "payment_status": "finished", "actually_paid": 50.0, ...}
```

### 5.3 法币出金：冻卡风险

**这是 USDT 业务最大的痛点**——收到 USDT 不难，**把 USDT 换成法币到自己银行卡很难，且很容易冻卡**。

**出金渠道对比**：

| 渠道 | 费率 | 到账 | 冻卡风险 | 合规 |
|------|------|------|---------|------|
| **国内银行 OTC** | 0.1-0.5% | 即时 | ⭐⭐⭐⭐⭐（极易冻） | 灰色 |
| **香港银行（ZA Bank/Airwallex）** | 0.3-0.5% | T+1 | ⭐⭐（中等） | 需 KYC |
| **美国银行（Mercury/Relay）** | 0.2-0.4% | T+1-2 | ⭐⭐（需 LLC） | 需 EIN |
| **Wise 提现到中国** | 0.4-0.7% | T+1-3 | ⭐⭐⭐（容易触发外管局问询） | 需解释资金来源 |
| **合规交易所（Coinbase/Bitstamp）出金** | 0.5-1% | T+1-3 | ⭐（最低） | 完全合规 |

**冻卡真实案例**：

**案例 6（真实跑通过的玩家分享）**：某 Token 卖家 2024 年用国内某大行卡收 USDT 兑换 CNY 30 万，第 3 天卡被冻结，理由是"涉嫌电信诈骗涉案资金流入"。最后他跑了 3 次公安局、做笔录、提供上游交易记录、签保证书，2 个月后才解冻。**期间业务完全停摆**。

**避坑 SOP**：
1. **不要用同一张卡每天收 > 5 万 RMB**
2. **不要用本人工资卡 / 房贷卡**
3. **用专门一张 II 类/III 类账户做 USDT 出金**（万一冻了不影响主账户）
4. **出金后 24 小时内不转入其他账户**（避免被认定为"洗钱链路"）
5. **每笔出金保留 USDT → 法币的链上证据**（TX ID + 买家信息 + 银行流水）
6. **大额出金优先走香港/美国账户**

### 5.4 合规风险：USDT 的 KYC/AML

**全球监管态势**（截至 2026 年 6 月）：

| 地区 | 监管态度 | 你的应对 |
|------|---------|---------|
| **美国** | FinCEN 要求 MSB 注册，州级 Money Transmitter License | 多数 Token 中转站选择不直接做"加密兑换"，而是用第三方支付 |
| **欧盟** | MiCA 2024 年生效，要求 CASP 牌照 | 用 NOWPayments/Coingate 等持牌机构替你做 |
| **中国** | 禁止任何加密交易 | 严格用香港/海外主体做 |
| **新加坡** | MAS PSA 牌照 | 找持牌 PSP 合作 |
| **日本** | FSA 牌照 | 难度高，不建议 |

**实操建议**：
- **不要在产品里直接做"USDT 充值"功能**——而是接入 NOWPayments 这种"白标支付"。他们负责合规，你只负责接 API。
- **法币出金交给持牌机构**——你只需要"收到 USDT" + "把 USDT 转给合规出金服务商"，中间层你自己不碰。

### 5.5 真实跑通过的 USDT 收款 SOP（按月流水分档）

**档位 A：月收 < 1 万 USDT**
- 单 TRC20 钱包（自己生成 + 冷存储）
- 用 NOWPayments 做聚合收款
- 出金走香港 ZA Bank 或 Airwallex
- 月出金 2-3 次，每次 < 1 万美金

**档位 B：月收 1-10 万 USDT**
- 多钱包分账户（按客户分）
- 部分用 NOWPayments，部分用 Coingate
- 出金走美国 Mercury 企业账户（用 LLC 主体）
- 月出金 4-5 次，每次 < 2 万美金
- 准备 KYT 报告（用 Chainalysis 或 Elliptic）

**档位 C：月收 > 10 万 USDT**
- 申请新加坡 MAS PSA 牌照 或 香港 TVC 牌照
- 自建合规团队
- 用 Anchorage 或 Fireblocks 做机构级托管
- 准备 SAR（可疑活动报告）流程

---

## 6. 支付聚合方案（Merchant of Record 模式）

### 6.1 什么是 MoR（Merchant of Record）

**MoR = 你是"卖家"，但平台是"记录商户"**。

- **普通模式**：你直接是商户，Stripe/PayPal 在你名下 → 你自己负责税务、合规、退款、chargeback
- **MoR 模式**：平台（Paddle/FastSpring）是记录商户 → 客户付款给 Paddle → Paddle 把钱（扣完抽成）打给你 → **Paddle 负责所有税务和合规**

### 6.2 三大 MoR 平台对比

| 平台 | 抽成 | 适合客单价 | 适合产品类型 | 付款周期 |
|------|------|-----------|-------------|---------|
| **Paddle** | 5% + $0.50 | $10 - $5,000 | SaaS / 软件订阅 | T+15 |
| **FastSpring** | 5.9% + $0.95 | $20 - $2,000 | 软件 / 数字商品 | T+15-30 |
| **2Checkout** | 3.5% + $0.35 | $10 - $1,000 | 软件 / 数字商品 | T+10-30 |
| **Gumroad** | 10%（含支付费） | $1 - $500 | 创作者 / 小产品 | T+7 |
| **Lemon Squeezy** | 5% + $0.50 | $5 - $1,000 | 独立开发者 | T+14 |

### 6.3 Paddle 集成示例

```python
# Paddle Billing API（v2）
import requests

PADDLE_API_KEY = "pdl_..."
PADDLE_ENV = "production"  # 或 "sandbox"

# 1. 创建产品
product = requests.post(
    f"https://api.paddle.com/products",
    headers={"Authorization": f"Bearer {PADDLE_API_KEY}"},
    json={
        "name": "AI Token Pro Plan",
        "description": "100 万 token 每月",
        "tax_category": "standard",
    }
)

# 2. 创建价格
price = requests.post(
    f"https://api.paddle.com/prices",
    headers={"Authorization": f"Bearer {PADDLE_API_KEY}"},
    json={
        "product_id": product.json()["data"]["id"],
        "description": "Monthly subscription",
        "unit_price": {"amount": "2999", "currency_code": "USD"},
        "recurrence": {"interval": "month", "frequency": 1},
    }
)

# 3. 创建结账
checkout = requests.post(
    f"https://api.paddle.com/checkout",
    headers={"Authorization": f"Bearer {PADDLE_API_KEY}"},
    json={
        "items": [{"price_id": price.json()["data"]["id"], "quantity": 1}],
        "customer": {"email": "user@example.com"},
    }
)

# 返回 checkout.json()["data"]["url"] 给用户跳过去付款
```

### 6.4 什么时候用 MoR

**用 MoR 的信号**：
- 你的客单价 < $100，且销售国家分散在 50+ 个
- 你没有全职合规 + 财务人员
- 你想 MVP 快速上线，不想处理 7 个国家的 VAT 注册

**不用 MoR 的信号**：
- 你的客单价 > $500，抽成 5% 就是 $25/单，自己处理更划算
- 你需要深度自定义支付流程（比如分账）
- 你要做订阅管理（MoR 平台的订阅 API 通常比较僵硬）

---

## 7. 税务合规

### 7.1 美国销售税（Sales Tax）

**关键事实**：
- 美国 50 个州 + DC 共有 **45 个州有销售税**
- 数字商品（Digital Products）在大多数州**应税**
- 各州税率不同：0% (MT, OR, NH, AK, DE) 到 10.25% (CA 部分地区)

**对 Token 中转站的影响**：
- 你的客户在加州买 $100 的 token，你要代收 $8.5 的销售税 → 上缴加州
- 客户在俄勒冈买 $100 的 token，$0 税

**实操方案**：
- 月流水 < $10K：手动用 TaxJar Sales Tax Calculator 算税
- 月流水 $10K-$100K：用 **Stripe Tax**（自动算税 + 自动申报）
- 月流水 > $100K：注册 Economic Nexus + 用 TaxJar/Avalara 自动申报

**Stripe Tax 集成**：

```javascript
// 创建 TaxCode 关联产品
await stripe.products.create({
  name: 'AI Token Pack',
  tax_code: 'txcd_10000000', // General - Tangible Goods
  // 或者用 'txcd_10202000' (Software as a Service)
});

// 在 Checkout Session 自动算税
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{price: 'price_xxx', quantity: 1}],
  automatic_tax: { enabled: true },  // 关键
  customer_details: {
    address: { country: 'US', state: 'CA' },  // 触发销售税
  },
});
```

### 7.2 欧盟 VAT（OSS/IOSS 机制）

**OSS（One Stop Shop）**：欧盟成员国之一注册，覆盖全欧盟 VAT 申报。

**IOSS（Import One Stop Shop）**：针对低价值商品（≤ €150）的跨境 B2C。

**对 Token 中转站的影响**：
- 数字服务（SaaS / API）适用 B2C 规则，**客户所在地 VAT 税率适用**
- 标准税率 17-27%（德国 19%、法国 20%、匈牙利 27%）
- 需在欧盟某成员国注册 VAT 税号 + 季度申报

**注册 OSS 流程**：
1. 选择一个欧盟成员国（爱沙尼亚/爱尔兰/荷兰/德国最常见）
2. 注册 VAT 税号
3. 通过该国 portal 季度申报全欧盟销售
4. 一次缴纳全欧盟 VAT 总额

**实操建议**：
- 客单价 < €150：用 IOSS（注册更简单、流程更快）
- 客单价 > €150：注册 OSS
- 懒得搞：用 Paddle（自动处理）

### 7.3 中国出口退税（如果主体在国内）

- 软件出口可申请增值税退税（13% → 0%）
- 需提供：软件产品登记证书 + 海关报关单 + 收汇凭证
- 流程：6-12 个月

**但**：Token 中转站本质是"数字服务出口"，**不经过海关**，无法满足传统出口退税的"货物报关"要求。

**实操建议**：
- 国内主体做 Token 中转站，**默认放弃出口退税**
- 用"跨境服务贸易"方式结算：通过 PingPong/Airwallex 等持有"跨境外汇支付试点"牌照的第三方
- 留存完整的"服务贸易合同 + 收汇凭证 + 完税证明"以应对未来可能的税务审查

### 7.4 自动税务计算工具

| 工具 | 覆盖 | 价格 | 适合 |
|------|------|------|------|
| **Stripe Tax** | 美/欧/英/加/澳/SG/JP | $0.05/交易 或月 $0-$2500 | 用 Stripe 收款的人 |
| **TaxJar** | 美国 | $19-$999/月 | 美国市场为主 |
| **Avalara** | 全球 | $1000+/月 | 大企业 |
| **Lago**（开源） | 自建 | 0 + 运维 | 技术团队强 |
| **Paddle Tax** | 全球（自动） | 含在 Paddle 抽成里 | 用 Paddle 的人 |

---

## 8. 反欺诈

### 8.1 信用卡拒付（Chargeback）预防

**拒付原因分类**（你必须看到的数据）：

| 原因代码 | 占比 | 你的应对 |
|---------|------|---------|
| **Fraudulent（欺诈）** | 40% | 3DS + 设备指纹 + Radar |
| **Product not received（未收到）** | 30% | 交付日志 + 主动邮件确认 |
| **Product unacceptable（不符合）** | 15% | 详细产品描述 + 退款政策 |
| **Duplicate（重复扣款）** | 10% | 幂等性 + 收据清晰 |
| **Subscription cancelled（订阅取消争议）** | 5% | 取消流程清晰 + 确认邮件 |

**关键指标**：
- **拒付率（Chargeback Rate）**：行业警戒线 0.65%
- **欺诈拒付率**：Stripe 监控 0.1% 以上
- **争议率（Dispute Rate）**：包括拒付 + 查询（inquiry），Visa 警戒 1.5%

### 8.2 3DS 验证（3D Secure）

3DS 是"信用卡发卡行让持卡人在 3D 页面输入一次性密码"的验证流程。

```javascript
// 强制 3DS（高客单价必做）
const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000,
  currency: 'usd',
  payment_method_types: ['card'],
  payment_method_options: {
    card: {
      request_three_d_secure: 'any', // 'any' = 强制；'automatic' = Stripe 决定；'if_required' = 仅当发卡行要求
    },
  },
});
```

**3DS 移转责任（Liability Shift）**：
- 如果 3DS 验证成功 → 即使发生拒付，**责任在发卡行/持卡人**，不在你
- 这是 Stripe 明确支持的"欺诈拒付豁免"

**缺点**：
- 增加 5-15 秒结账时间
- 移动端体验略差
- 转化率下降 5-15%

**什么时候开**：
- 客单价 > $50 → 开
- 客户来自高风险国家 → 开
- 新客户首次购买 → 开
- 老客户复购 → 可以不开（用 Radar 判断）

### 8.3 设备指纹

**前端收集设备指纹**（与 Stripe 配合）：

```javascript
// 使用 Stripe.js 自动收集 + FingerprintJS 自定义补充
import FingerprintJS from '@fingerprintjs/fingerprintjs';

(async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();

  // 把 fingerprint 传给后端，写入 metadata
  await fetch('/api/recharge', {
    method: 'POST',
    body: JSON.stringify({
      amount_usd: 50,
      user_id: 'u123',
      device_fingerprint: result.visitorId,
    }),
  });
})();
```

**后端在 Stripe metadata 里传**：

```javascript
const session = await stripe.checkout.sessions.create({
  // ...
  payment_intent_data: {
    metadata: {
      device_fp: result.visitorId,
      ip_country: req.geo.country,
    },
  },
});
```

**Stripe Radar 内部已经用了设备指纹**——你传 custom 字段是补充。

### 8.4 黑名单共享

**行业黑名单**：
- **Stripe Trust List**：Stripe 内部黑名单（无法直接访问）
- **MaxMind minFraud**：$0.005/查询，主流反欺诈服务
- **Sift Science**：$0.01-$0.05/查询，机器学习反欺诈
- **Sardine**：专门针对 fintech 的反欺诈，新兴
- **Kount**：老牌，$0.10-$0.50/查询，企业级

**自建黑名单**：
- 同一设备指纹 + 同一 IP 24 小时内 > 3 次失败 → 加入黑名单
- 同一信用卡 BIN 出现在 5+ 不同账户 → 标记
- 客户首次充值 < $10 → 标记（"测试卡"特征）
- 同一邮箱 30 天内注册 3+ 账户 → 标记

---

## 9. 真实案例（2024-2025 年）

### 9.1 案例 1：某 AI 创业公司 Stripe 账户被冻 3 个月（2024 年 9 月）

**来源**：Reddit r/entrepreneur 多个创业者贴

**事件经过**：
- 公司：硅谷 AI 写作工具 startup，团队 5 人
- 月收入：$40K（信用卡 60% + PayPal 40%）
- 业务描述：网站写 "AI Writing Assistant for marketers"
- 触发动作：突然接入企业大客户，单笔 $5,000
- 被打冻：3 天后 Stripe 触发风控，账户被"Review"，所有 pending 资金冻结

**处理过程**：
- 第 1 周：提交银行流水 + 公司注册证书
- 第 2 周：被要求提供"上游 AI 模型供应商合同"（OpenAI 的 API 服务协议）
- 第 3 周：被要求提供 3 个企业客户的发票 + 合同
- 第 4 周：Stripe 拒信"基于风险评估决定维持限制"
- 第 2 个月：找 Stripe Atlas 推荐的合作律师，写正式申诉信
- 第 3 个月：部分解冻，$15K 释放，剩余 $25K 维持 6 个月 Reserve

**最终损失**：
- Reserve 6 个月 = 现金流压力 → 砍了 2 个工程师
- 转入 PayPal + Paddle 分散风险

### 9.2 案例 2：某 Token 转售商 USDT 出金冻卡（2024 年 12 月）

**来源**：知乎多个独立开发者分享 + 电报群讨论

**事件经过**：
- 个人开发者，做 GPT-4 API 账号转售，月收入约 ¥50K
- 出金方式：USDT-TRC20 → 火币 OTC → 银行卡
- 触发动作：某天一次性卖出 5 万 USDT（约 ¥36 万）
- 被打冻：2 天后银行卡被冻结，银行通知"涉嫌电信诈骗涉案资金"

**处理过程**：
- 第 1 周：跑公安局，提供上游 OpenAI 充值记录 + 客户收款记录
- 第 2 周：被要求签"承诺书"——保证不再做加密兑换
- 第 1 个月：卡解冻，但被加入"重点关注"名单
- 第 3 个月：再次尝试大额出金，再次被冻

**最终方案**：
- 改为香港 ZA Bank 账户出金
- 单次出金 < HK$50,000
- 留存所有链上 TX ID

### 9.3 案例 3：某 SaaS 公司用 Paddle 跑通订阅 + 自动税务（2025 年 2 月）

**来源**：IndieHackers 社区

**事件经过**：
- 团队：2 人（夫妻档）
- 产品：AI 图片生成 SaaS
- 月收入：$25K
- 选择：Paddle MoR 模式

**结果**：
- 0 美元初期投入（不用注册公司就能开始）
- 自动处理 47 个国家的 VAT + 美国销售税
- 5% 抽成 = $1,250/月成本
- 节省：1 个全职财务（约 $4,000/月）

**教训**：
- MoR 模式对早期项目性价比超高
- 但客单价 > $200 后，自己注册 Stripe 反而更划算

### 9.4 案例 4：某 OpenAI 套利商被 Adyen 拒（2025 年 4 月）

**来源**：Hacker News 讨论 + 个人博客

**事件经过**：
- 个人开发者，从 OpenAI 组织账号拿 GPT-4 配额，转售给开发者
- 月收入：$15K
- 想升级到 Adyen（费率更低），申请商户号
- Adyen KYC 阶段直接拒绝

**原因**：
- 业务描述里出现 "token reseller"
- 产品 URL 显示是"购买 OpenAI API 额度"
- Adyen 风控判定"高风险 + 不可解释上游"

**教训**：
- 申请时**所有文案避免出现 reseller/aggregator/credits/tokens**
- 准备好上游"采购合同"（即使是 OpenAI 的 API 服务协议）
- Adyen 比 Stripe 更严，门槛更高

### 9.5 案例 5：某 AI 公司用 Stripe Connect 做 Marketplace 被冻（2024 年 11 月）

**来源**：Stripe Community Forum

**事件经过**：
- 公司：AI 工具 Marketplace，多个商家卖 prompt 模板
- 主体：美国 LLC + Stripe Standard Connect
- 触发动作：1 个商家被举报"信用卡欺诈" → 整个平台 Reserve

**处理过程**：
- 第 1 周：Stripe 要求提供所有商家的 KYC 文件
- 第 2 周：发现 1 个商家用了 50+ 张被盗信用卡 → 该商家被永久封禁
- 第 3 周：Stripe 释放平台资金，但要求平台升级风控（"Stripe Connect Enhanced KYC"）
- 升级后成本：每个商家 KYC 多花 $5-$10 + 3-5 天审核周期

**教训**：
- **Marketplace 模式风险高**——1 个坏商家连累整个平台
- 必须做"每个商家的独立 Reserve"
- 考虑用 Paddle MoR（他们做平台风控，你做业务）

---

## 10. 实战推荐

### 10.1 不同规模的最优支付组合

#### 启动资金 < 1 万美元（个人/小团队 MVP）

```
主通道：Stripe（美国 LLC，$500 Atlas）
备份通道：USDT-TRC20（自建钱包）
应急通道：Paddle（MoR 模式，自动税务）
出金：PingPong / Airwallex（国内主体）
```

**实操**：
1. 注册 Stripe Atlas 美国 LLC
2. 集成 Stripe Checkout（10 行代码）
3. 同时接入 USDT-TRC20（自建钱包 + 轮询监听）
4. 每月 < $1K 走 USDT 通道，省 Stripe 费率

#### 启动资金 1-10 万美元（成长阶段）

```
主通道：Stripe（美国 LLC 主账户）
备份通道：Stripe（第二 LLC 备份账户）+ USDT-TRC20
B2B 收款：Wise（多币种）+ Airwallex（虚拟卡）
税务：Stripe Tax + 季度手动申报 VAT
```

**实操**：
1. 双 Stripe 账户架构（不同 LLC）
2. 流量路由：70% 主 + 30% 备份
3. B2B 大客户用 Wise Invoice（手续费 0.4%）
4. 准备 6 个月运营资金（防 Reserve）

#### 启动资金 > 10 万美元（规模化）

```
主通道：Stripe（主账户）+ Paddle（MoR）
备份通道：Adyen（客单价 > $500 的业务）+ USDT-TRC20
法币出金：Mercury / Relay（美国）+ ZA Bank（香港）+ Airwallex（新加坡）
税务：Stripe Tax + 注册 OSS（欧盟 VAT）+ 季度合规审计
```

**实操**：
1. 申请 Adyen 商户号（成功率 < 30%，准备被拒 3 次）
2. 拆分业务到不同主体（隔离风险）
3. 组建 1 人合规团队（专门处理税务、KYC、争议）

### 10.2 不同地区的最优支付组合

| 客户地区 | 主推 | 备选 | 关键策略 |
|---------|------|------|---------|
| **美国** | Stripe | PayPal、ACH | 接 Apple Pay / Google Pay |
| **欧盟** | Stripe + iDEAL + Klarna | SEPA Direct Debit | 注册 OSS / IOSS |
| **英国** | Stripe + PayPal | Apple Pay | 单独 VAT 注册 |
| **加拿大** | Stripe | Interac (本地) | 处理 GST/HST/PST |
| **澳大利亚** | Stripe | BPAY | 处理 GST |
| **日本** | Stripe + Konbini | PayPal | 注册日本法人或 PSP |
| **巴西** | PIX + Stripe | Boleto | 找本地 PSP 合作 |
| **东南亚** | Stripe + USDT | Airwallex 本地 | 接入 FPX/PayNow |
| **印度** | Razorpay（仅限本地主体） | USDT | 强制 UPI/Net Banking |
| **俄罗斯/伊朗/朝鲜** | ❌ | ❌ | 直接拒绝服务 |
| **尼日利亚/加纳/肯尼亚** | USDT | Paystack（尼） | 防 BIN 欺诈 |
| **中东** | Stripe + Mada（沙特） | Tap Payments | 处理阿拉伯语 RTL |

### 10.3 关键决策树

```
你的客单价 < $50？
├─ 是 → Stripe Checkout（最强）
└─ 否 → 客单价 < $200？
       ├─ 是 → Stripe + 3DS
       └─ 否 → 客单价 < $1000？
              ├─ 是 → Stripe + 3DS + Radar for Fraud Teams
              └─ 否 → 客单价 > $1000
                     ├─ 是 → Stripe + 人工审核 + 电汇/ACH
                     └─ 是 B2B → Wise Invoice

客户用加密付？
├─ 是 → USDT-TRC20（首选）/ ERC20（次选）
└─ 否 → 走信用卡/本地支付

需要自动税务？
├─ 是 → Paddle MoR（最省心）/ Stripe Tax（自己处理）
└─ 否 → 手动处理（不建议规模化）

资金 < $10K 需要快速出金？
├─ 是 → 香港 ZA Bank（最快）
└─ 否 → 美国 Mercury（最稳）

担心被打冻？
├─ 是 → 准备 2-3 个 Stripe 账户（不同 LLC）
├─ 担心 USDT 出金 → 用持牌交易所出金
└─ 担心整体风险 → MoR 模式（Paddle/FastSpring）
```

---

## 11. 30 天收款落地 SOP（按周分解）

### 第 1 周：基础设施搭建

| 天 | 任务 | 工具/资源 |
|----|------|----------|
| Day 1 | 决定公司主体（美国 LLC / 香港公司 / 爱沙尼亚） | Stripe Atlas / 香港秘书公司 |
| Day 2 | 注册公司主体 + 拿到 EIN / BR | 取决于主体 |
| Day 3 | 开企业银行账户（Mercury / ZA Bank / Airwallex） | Mercury / ZA Bank |
| Day 4 | 申请 Stripe 账户，提交 KYC | Stripe Atlas / 直接申请 |
| Day 5 | 申请 PayPal Business 账户 | paypal.com/business |
| Day 6 | 集成 Stripe Checkout（最小可用版本） | Stripe 文档 |
| Day 7 | 集成 Webhook + 幂等性 + 数据库订单 | 见第 2.4 节代码 |

**第 1 周里程碑**：能收到第一笔 $1 测试付款 + Webhook 触发加额度成功。

### 第 2 周：多通道接入 + 风控

| 天 | 任务 |
|----|------|
| Day 8 | 集成 USDT-TRC20 自建钱包（生成 + 监听） |
| Day 9 | 集成 NOWPayments 作为 USDT 备份通道 |
| Day 10 | 配置 Stripe Radar 规则（高风险国家黑名单 + 强制 3DS） |
| Day 11 | 接入设备指纹（FingerprintJS） |
| Day 12 | 配置拒付预警 Slack 通知 |
| Day 13 | 接入 Stripe Tax（自动算税） |
| Day 14 | **第一次端到端测试**：信用卡 $50 + USDT $50，分别到账 + 加额度 |

### 第 3 周：税务 + 合规

| 天 | 任务 |
|----|------|
| Day 15 | 准备隐私政策 + 服务条款 + 退款政策（用 iubenda 模板） |
| Day 16 | 注册 OSS（欧盟 VAT）或 IOSS（< €150 业务） |
| Day 17 | 准备美国销售税申报（用 TaxJar） |
| Day 18 | 配置每日 / 每周对账脚本（Stripe payouts vs 银行流水） |
| Day 19 | 准备拒付 evidence 模板（订单详情 + API 交付日志） |
| Day 20 | 准备"账户被冻"应急手册 + 备份账户申请清单 |
| Day 21 | **第一次月度对账**（虽然只跑了一周，但要形成习惯） |

### 第 4 周：扩容 + 备份

| 天 | 任务 |
|----|------|
| Day 22 | 申请第二个 Stripe 账户（第二 LLC） |
| Day 23 | 配置流量路由（70% 主 / 30% 备份） |
| Day 24 | 集成 Airwallex 多币种账户（欧元/英镑/日元） |
| Day 25 | 配置 Paddle MoR 备份（用于处理"信用卡被拒"的客户） |
| Day 26 | 接入 Chargebee / Stripe Billing（订阅管理） |
| Day 27 | 配置 Wise 账户（用于 B2B 大客户收款） |
| Day 28 | 压力测试：模拟 1000 单/小时 + 100 个并发 webhook |
| Day 29 | 准备"30 天收款运营报告"模板（按日 / 按通道 / 按地区） |
| Day 30 | **正式上线 + 通知所有用户支付通道已就绪** |

**30 天后的检查清单**：

- [ ] 至少 3 个支付通道在线（Stripe + PayPal + USDT）
- [ ] 至少 2 个公司主体（主 + 备份）
- [ ] 自动税务计算 + 申报计划
- [ ] 拒付处理流程（< 24 小时响应）
- [ ] 每日对账脚本（自动跑）
- [ ] 应急方案（如果主账户被冻，备份账户 < 30 分钟接管）

---

## 12. 常见坑（FAQ）

### Q1：Stripe 最低提现金额？

A：$1 起，但有 payout schedule。默认 T+2（即 2 个工作日到账）。可以设置 weekly / monthly。

### Q2：USDT 收到后多久可以动？

A：TRC20 建议等 19 个确认（约 3-5 分钟）。Polygon 建议 256 个确认（约 5-10 分钟）。ERC20 建议 12 个确认（约 3-5 分钟）。

### Q3：Stripe 被冻的钱能拿回来吗？

A：能，但慢。Reserve 期通常是 90-180 天。如果你提供完整材料，Stripe 会按月释放部分资金。如果完全不回应，6 个月后退回。

### Q4：PayPal 收 USDT 客户的钱怎么办？

A：PayPal **不直接支持加密货币**。你需要在产品里给客户"用信用卡付款"的选项，USDT 作为单独支付方式通过 NOWPayments 处理。

### Q5：我能用个人 Stripe 账户卖 Token 吗？

A：技术上能，**但强烈不建议**。一旦被冻，你个人信用记录会受影响（Stripe 会报给 Early Warning Services）。而且个人账户 Reserve 期更长。

### Q6：Stripe Atlas $500 包含什么？

A：LLC 注册 + EIN + Stripe 账户开通 + 1 年注册代理 + 模板文件。不包含**银行账户**（需另开 Mercury / Relay）、**会计师**（需另请）、**报税服务**（需另找）。

### Q7：USDT 收款需要交税吗？

A：取决于你公司主体所在地。
- 美国 LLC：USDT 视为"财产"（property），卖出时按 capital gain 交税
- 香港公司：USDT 收入按香港利得税（16.5%）申报
- 国内公司：USDT 收入**理论上**要按"提供服务"交增值税 + 企业所得税，但实操中很难合规申报

**我的建议**：找当地有加密经验的会计师，每季度申报一次。

### Q8：怎么处理"高风险国家"的客户？

A：
- **直接拒绝**的国家：朝鲜、伊朗、叙利亚、古巴、克里米亚
- **高风险监控**的国家：俄罗斯、尼日利亚、印尼、越南、马来西亚
- **可接但需 3DS**：所有其他国家

### Q9：如何用 Stripe 给团队成员发工资？

A：用 **Stripe Treasury**（美国）或直接用 Mercury + Deel/Gusto。

### Q10：Stripe 客户数据怎么备份？

A：Stripe 提供 Dashboard 数据导出（CSV/JSON），但建议用 Stripe API + Webhook 同步到自己的数据库。

---

## 13. 关键洞察总结

1. **支付通道没有银弹，2-3 个通道混跑是唯一能稳定跑大的方案**——Stripe 上限最高但下限危险，USDT 下限最稳但上限受限，PayPal/MoR 平台居中。
2. **公司主体选择 = 战略决策，不是战术决定**——MVP 阶段可以用国内公司 + PingPong，成长阶段必须双 LLC，规模化必须多主体。
3. **被打冻是常态，不是例外**——所有跑大的 Token 中转站都被冻过 1-3 次。关键不是"不被冻"，而是"被冻了能 24 小时内切换到备份账户"。
4. **文案决定生死**——产品描述里出现 "resell" "credits" "token" "AI API" = 直接触发风控。改成 "platform"、"workspace"、"AI productivity suite"。
5. **USDT 出金是真正的雷区**——收 USDT 不难，难的是换成法币不冻卡。用香港/美国企业账户 + 持牌交易所是唯一稳定路径。
6. **Paddle/FastSpring 是"懒人模式"**——5% 抽成对早期项目是最高性价比的人力成本节省。

---

## 附录 A：参考资源

### 官方文档
- [Stripe Atlas](https://stripe.com/atlas)
- [Stripe Checkout 文档](https://stripe.com/docs/payments/checkout)
- [Stripe Connect 文档](https://stripe.com/docs/connect)
- [Stripe Radar 文档](https://stripe.com/docs/radar)
- [PayPal Business 文档](https://www.paypal.com/us/business)
- [PayPal Subscriptions API](https://developer.paypal.com/docs/api/subscriptions/v1/)
- [NOWPayments API](https://documenter.getpostman.com/view/7907941/S1a32n38)
- [Coingate API](https://developer.coingate.com/)

### 合规与税务
- [IRS EIN 申请](https://www.irs.gov/businesses/small-businesses-self-employed/how-to-apply-for-an-ein)
- [欧盟 OSS 门户](https://ec.europa.eu/taxation_customs/business/vat/oss_en)
- [TaxJar Sales Tax API](https://www.taxjar.com/sales-tax-api)
- [Stripe Tax 文档](https://stripe.com/docs/tax)

### 社区与案例
- [Reddit r/entrepreneur - Stripe frozen 讨论](https://www.reddit.com/r/entrepreneur/search/?q=stripe+frozen)
- [IndieHackers - 收款案例](https://www.indiehackers.com/)
- [Hacker News - 支付与税务讨论](https://news.ycombinator.com/)
- [V2EX - 跨境收款讨论](https://v2ex.com/?tab=payment)
- [知乎 - AI 收款话题](https://www.zhihu.com/topic/20071646)

### 工具
- [FingerprintJS 设备指纹](https://fingerprintjs.com/)
- [Mercury 银行](https://mercury.com/)
- [Relay 银行](https://relayfi.com/)
- [Airwallex 跨境金融](https://www.airwallex.com/)
- [Wise Business](https://wise.com/us/business/)
- [Chainalysis KYT](https://www.chainalysis.com/)

---

## 附录 B：术语表

- **MCC** (Merchant Category Code)：商户类别码，决定你被划入哪类风险
- **3DS** (3D Secure)：信用卡验证协议（Visa 叫 VBV, Mastercard 叫 SecureCode）
- **Chargeback**：持卡人通过发卡行强制撤销交易
- **Reserve**：Stripe 扣留部分资金作为风险准备金
- **KYC** (Know Your Customer)：了解你的客户（反洗钱要求）
- **AML** (Anti-Money Laundering)：反洗钱
- **KYT** (Know Your Transaction)：了解你的交易（链上合规）
- **MoR** (Merchant of Record)：记录商户
- **OSS** (One Stop Shop)：欧盟 VAT 一站式申报
- **IOSS** (Import One Stop Shop)：欧盟低价值商品进口 VAT 一站式申报
- **EIN** (Employer Identification Number)：美国联邦税号
- **ITIN** (Individual Taxpayer ID Number)：个人税号
- **BIN** (Bank Identification Number)：银行卡前 6 位，标识发卡行
- **AVS** (Address Verification System)：信用卡地址验证
- **CVM** (Cardholder Verification Method)：持卡人验证方法
- **PSP** (Payment Service Provider)：支付服务提供商
- **MSB** (Money Services Business)：货币服务业务（美国 FinCEN 注册类型）
- **PSA** (Payment Services Act)：新加坡支付服务法
- **CASP** (Crypto-Asset Service Provider)：欧盟加密资产服务提供商

---

> 下篇预告：TST-07 客服与退款——Token 中转站是"高客单价、高情绪、易误解"的业务，客服的响应速度和话术决定复购率、退款率、chargeback 率。这篇会写一套可复用的客服 SOP、退款政策模板、争议升级机制。
>
> 配套阅读：TST-05 多账号与多渠道（为什么你需要 2-3 个公司主体）、TST-09 合规与法律（税务、合同、监管的全局视角）

---

**版本**：v1.0 / 2026-06-11
**作者**：TST 系列编辑组
**免责声明**：本文为实操经验分享，不构成法律、税务或金融建议。具体业务请咨询持牌专业人士。文中提及的所有费率、API、政策均为写作时点（2026-06）的快照，实际操作请以各平台官网最新公告为准。
