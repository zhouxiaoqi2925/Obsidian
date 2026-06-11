---
title: TST-08 获客与渠道(针对海外用户)
created: 2026-06-11
tags: [token中转站, 获客, 增长, 营销, TST系列]
series: Token中转站
order: 8
---

# TST-08 获客与渠道(针对海外用户)

> 写给创业者、运营、增长的实操指南。Token 中转站搭好之后,最重要的两件事:① 把"贵"(CPC 飙升的 AI 关键词)踩在脚下;② 把"便宜"(社区、口碑)榨干。本文是 10 篇系列的第 8 篇,基于 2025-2026 年公开数据,目标是让你拿到一份"明天就能开干"的获客作战图。

---

## 目录

1. 残酷的真相:Token 中转站不是"好产品就会赢"
2. 目标用户画像(5 类 × 4 维度)
3. 渠道全景与对比(CAC/转化率/适合阶段)
4. SEO 策略深度(独立站必修课)
5. 社区运营(最便宜的获客)
6. 付费渠道(烧钱也要烧对地方)
7. 口碑与推荐(Affiliate / NPS)
8. 开发者关系 DevRel(技术产品的护城河)
9. Product Hunt 发布 SOP(必读)
10. B2B 获客(高客单打法)
11. 真实案例研究(OpenRouter / Helicone / Portkey / 中国出海)
12. 新用户激活(TTV < 5 分钟)
13. 30 天冷启动 SOP
14. 预算分配与团队配置
15. 反常识:别踩的 8 个坑

---

## 1. 残酷的真相:Token 中转站不是"好产品就会赢"

2026 年的 LLM API 市场,供给端已经过载:

- **OpenRouter** 公开数据:**100T tokens/月、8M+ 全球用户、60+ Providers、400+ Models**(数据来自其首页 hero section)
- **DeepSeek** 在 Similarweb 2026 年 6 月的"全球开发者工具"榜单位列 **#5**(前 4 是 Microsoft / GitHub / Office)
- **OpenAI / Anthropic / Google** 三家占据 80%+ 头部 token 消耗
- 大量"中转站"项目 0 收入、跑路、跑分

这意味着:产品同质化极高(都是 1 个 key 调所有模型),**获客能力 = 唯一的护城河**。

我们来看一组关键数字(基于公开数据 + 行业经验值):

| 指标 | 头部 5% | 中位 | 长尾 |
|---|---|---|---|
| 月活用户(MAU) | 50,000+ | 500-2,000 | <100 |
| 月 token 消费量 | 100B+ | 1-5B | <100M |
| 月营收(ARR) | $100K-1M+ | $2K-10K | $0-500 |
| 单客 LTV | $5,000+ | $200-1,000 | <$50 |
| CAC(综合) | $50-200 | $30-80 | N/A |

**核心结论:** 头部与中位的差距是 100 倍量级。获客效率直接决定生死。

下面进入正题。

---

## 2. 目标用户画像(5 类 × 4 维度)

Token 中转站的"用户"不是一类人。**错误的用户画像会让所有渠道选择失效**。我把它拆成 5 类,每类给出 LTV、CAC、决策链路画像。

### 2.1 独立开发者(Indie Hacker / Solo Founder)

**画像**:
- 1-3 人小团队,自己做产品(Chrome 插件、SaaS、AI 工具)
- 月 token 消耗 1M-50M
- 决策者 = 用户本人(1 人决策,1 天决策)
- 工具偏好:Mac + VSCode + Cursor + Vercel + Stripe

**痛点**:
- OpenAI 充值麻烦(海外信用卡)
- 想试多个模型但不想开多个账号
- 关心价格但更关心"稳不稳定"

**LTV / CAC**:
- LTV: $50-500/年(看产品跑得起来与否)
- 合理 CAC: $20-80
- **LTV/CAC 目标 ≥ 3**

**决策链路**:
1. 在 Twitter / HN / Reddit 看到推荐
2. 访问主页,看是否有 Free Tier
3. 注册 → 拿到 key → 5 分钟内写代码调用成功
4. 第二天回来看 Dashboard 有没有数据

**最有效的渠道**:
- Twitter(X)KOL 推荐
- HN Show HN
- IndieHackers / Reddit r/LocalLLaMA
- SEO("OpenAI API alternative"等长尾词)

---

### 2.2 创业团队(5-50 人)

**画像**:
- 有 PM + 后端 + 前端,产品已上线
- 月 token 消耗 50M-5B
- 决策者 = CTO/技术负责人(2-3 人评估,1-2 周决策)
- 已用 OpenAI/Anthropic,在找"成本优化 + 多模型"

**痛点**:
- OpenAI 账单爆炸,想换更便宜的(DeepSeek/Qwen)但又怕不稳
- 老板问"能不能省 30%",CTO 需要一个快速方案
- 想要可观测性(Helicone/Langfuse 类需求)

**LTV / CAC**:
- LTV: $5,000-50,000/年
- 合理 CAC: $500-3,000
- **LTV/CAC 目标 ≥ 5**

**决策链路**:
1. CTO 在 LinkedIn / 行业报告看到
2. 拉技术团队评估(PoC 测试)
3. 对比 OpenRouter / Portkey / 自建
4. 走采购流程(可能需要发票/合同)

**最有效的渠道**:
- LinkedIn Outreach(CTO 圈子)
- 行业 KOL 推荐
- SEO("LLM gateway", "AI cost optimization"等)
- 技术博客 / GitHub README
- Webinars / 线下 meetup

---

### 2.3 中小企业(SMB,给员工配 AI 工具)

**画像**:
- 50-500 人,非技术密集(如电商、跨境电商、教育、客服)
- 月 token 消耗 100M-2B
- 决策者 = IT 主管 / 运营总监(3-5 人评估,1-3 个月决策)
- 想要"统一账号、统一账单、可控成本"

**痛点**:
- 员工各自开 ChatGPT 账号,数据安全 + 成本失控
- 需要 SSO / 团队管理 / 配额控制
- 国内中小老板:全英文 dashboard 看不懂(出海产品要支持中英双语)

**LTV / CAC**:
- LTV: $10,000-100,000/年
- 合理 CAC: $1,000-8,000
- **LTV/CAC 目标 ≥ 5**

**决策链路**:
1. 老板看到同行案例 / 行业文章
2. IT 评估(安全、合规、价格)
3. 试点(单个部门先跑)
4. 全公司推广

**最有效的渠道**:
- 行业垂直媒体(跨境电商、教育、AI 应用)
- 销售外呼 / 冷邮件
- 微信群 / 行业大会(针对中国 SMB)
- Affiliate / 渠道代理

---

### 2.4 大企业采购(Enterprise,合规要求高)

**画像**:
- 500+ 人,有专门的 Procurement / IT Security 团队
- 月 token 消耗 5B-50B+
- 决策者 = Procurement + CISO + 业务 VP(7-15 人,3-12 个月决策)
- **必须有**:SOC2、ISO27001、数据驻留、定制合同、专属支持

**痛点**:
- OpenAI Enterprise 太贵
- 数据不能出境(对欧洲、中国国企客户)
- 需要私有化部署 / VPC
- 审计日志、SSO(SAML/OIDC)

**LTV / CAC**:
- LTV: $100,000-1,000,000+/年
- 合理 CAC: $20,000-100,000(含销售人力)
- **LTV/CAC 目标 ≥ 3-5**(B2B 长周期可接受低一些)

**决策链路**:
1. 业务部门提需求
2. 选型 RFP(可能 5-10 家供应商)
3. POC(2-4 周)
4. 安全审计
5. 法务 / 合同 / SOW
6. 试点 → 推广

**最有效的渠道**:
- 行业大会(AWS re:Invent / KubeCon / Web Summit)
- 直销团队(SDR + AE)
- LinkedIn Sales Navigator
- 战略合作伙伴(云厂商 ISV 计划)
- 客户案例 / Reference call

**注意**:Token 中转站初创公司**不要碰** Enterprise,先做到 SMB 再考虑。Enterprise 销售周期太长,会拖死现金流。

---

### 2.5 5 类用户对比表

| 维度 | Indie Hacker | 创业团队 | SMB | Enterprise | AI 重度玩家 |
|---|---|---|---|---|---|
| 决策者 | 本人 | CTO | IT 主管 | Procurement | 本人 |
| 决策周期 | 1 天 | 1-2 周 | 1-3 月 | 3-12 月 | 1-3 天 |
| LTV/年 | $50-500 | $5K-50K | $10K-100K | $100K+ | $500-5K |
| 合理 CAC | $20-80 | $500-3K | $1K-8K | $20K+ | $50-200 |
| 主渠道 | HN/Reddit/Twitter | LinkedIn/SEO | 销售/微信 | 直销/大会 | 论坛/Discord |
| 关注点 | 价格/易用 | 稳/可观测 | 团队管理 | 合规/SSO | 速度/前沿模型 |

**最关键的用户画像(对 0-1 阶段):Indie Hacker + 创业团队 = 90% 的早期收入。**

Enterprise 是 1-10 阶段的事,不要在冷启动期就搞 SSO + SAML,会死。

---

## 3. 渠道全景与对比(CAC/转化率/适合阶段)

### 3.1 真实成本数据(2025-2026)

基于公开数据 + 行业访谈整理:

| 渠道 | CAC 范围 | 转化率 | 适合阶段 | 见效时间 |
|---|---|---|---|---|
| SEO(长尾) | $5-30 | 2-5% | 任何阶段 | 3-6 月 |
| SEO(品牌词) | $0-5 | 5-15% | 6+ 月 | 6-12 月 |
| Twitter/X 自然 | $0-10 | 1-3% | 任何阶段 | 1-3 月 |
| Twitter/X 广告 | $30-150 | 0.5-2% | 有预算 | 1-7 天 |
| Reddit 自然 | $0-20 | 1-5% | 早期 | 1-3 月 |
| Reddit 广告 | $20-80 | 0.5-2% | 有预算 | 1-7 天 |
| HN Show HN | $0(爆款价值 $10K+) | 0.5-1%(投票) | 冷启动 | 1 天爆 |
| Product Hunt | $0-500(制作成本) | 0.3-1% | 冷启动 | 1-3 天 |
| Google Ads(AI 词) | $50-300 | 1-3% | 有融资 | 1-7 天 |
| LinkedIn Outreach | $50-500(SDR 成本) | 5-15%(到回复) | 6+ 月 | 1-4 周 |
| 冷邮件(Apollo) | $20-100 | 0.5-2% | 6+ 月 | 1-4 周 |
| Discord/Slack 社区 | $5-20 | 5-20% | 任何阶段 | 3-12 月 |
| 联盟营销(Affiliate) | $0-50(佣金) | 3-10% | 6+ 月 | 1-6 月 |
| 口碑/Referral | $0-20(奖励) | 15-40% | 6+ 月 | 持续 |
| YouTube 合作 | $0-5K(分成) | 2-5% | 6+ 月 | 1-3 月 |
| 行业大会 | $5K-50K(展位) | 1-3% | 12+ 月 | 3-6 月 |

**2025 年 Google Ads AI 关键词 CPC(数据来源:WordStream / SEMrush 公开报告)**:
- "ai api":$8-15
- "openai api":$12-25(烧钱!)
- "claude api":$10-20
- "llm api":$6-12
- "gpt api alternative":$4-8
- "ai chatbot api":$5-10
- "openai api cheaper":$3-6
- **平均 SaaS 关键词 CPC 同期对比:$3-7**

**结论**:AI 类关键词的 CPC 是普通 SaaS 的 2-4 倍,**纯靠 Google Ads 烧钱获客的 Token 中转站必死**。

### 3.2 渠道漏斗真实数据

从"看到广告"到"付费转化"的真实漏斗(基于 50+ AI 工具公开数据汇总):

```
曝光 (Impression)        100,000
   ↓ CTR 0.5-2%          500-2,000
点击 (Click)             
   ↓ 注册转化 20-40%     100-800
注册 (Signup)
   ↓ 激活率 30-60%       30-480
激活 (Activated,完成首次调用)
   ↓ 试用付费转化 5-15%  1.5-72
付费 (Paid)
   ↓ 留存到 30 天 40-60%  0.6-43
留存付费
```

**独立开发者 vs 企业用户的转化率差距巨大**:
- Indie:注册→激活 60-80%,激活→付费 10-20%
- Enterprise:注册→激活 30-50%(要填公司信息),激活→付费 1-3%(要销售跟进)

### 3.3 渠道 vs 用户匹配矩阵

| 渠道 | Indie | 创业团队 | SMB | Enterprise |
|---|---|---|---|---|
| HN Show HN | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ | - |
| Reddit r/LocalLLaMA | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ | - |
| Twitter AI KOL | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | - |
| Product Hunt | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | - |
| SEO 长尾 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Google Ads | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| LinkedIn | ⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 冷邮件 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 行业大会 | - | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Discord/Slack | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ | - |

**冷启动期(0→$10K MRR)推荐组合**:
- 50% 时间:SEO + 内容(长尾)
- 30% 时间:社区(Twitter + Reddit + HN)
- 20% 时间:Product Hunt + 口碑

**增长期($10K→$100K MRR)推荐组合**:
- 30% 时间:SEO(深化)
- 25% 时间:社区运营
- 20% 时间:付费广告(Google + Reddit)
- 15% 时间:LinkedIn Outreach
- 10% 时间:Affiliate + Referral

**规模化期($100K+ MRR)**:
- 加 Enterprise 销售(SDR + AE 团队)
- 加行业大会 + 品牌投放
- 加 Partner Channel(云厂商 ISV 计划)

---

## 4. SEO 策略深度(独立站必修课)

SEO 是 **Token 中转站最被低估的获客渠道**。OpenRouter 公开数据显示月活百万级,大部分来自 SEO(类似域名 "openrouter.ai" 搜索量月 50K+)。

### 4.1 关键词研究

**第一层:核心词(高竞争,长周期)**

| 关键词 | 月搜索量(估) | 难度 | CPC | 优先级 |
|---|---|---|---|---|
| openai api | 500K+ | 90+ | $15 | 不做 |
| claude api | 200K+ | 80+ | $12 | 不做 |
| gpt api | 300K+ | 90+ | $18 | 不做 |
| llm api | 80K+ | 60+ | $8 | 中 |
| ai api | 100K+ | 70+ | $10 | 中 |

**第二层:对比词(中竞争,黄金)**

| 关键词 | 月搜索量 | 难度 | 优先级 |
|---|---|---|---|
| openai api alternative | 20K+ | 40 | ⭐⭐⭐⭐⭐ |
| claude api alternative | 8K+ | 35 | ⭐⭐⭐⭐⭐ |
| gpt api cheaper | 5K+ | 30 | ⭐⭐⭐⭐⭐ |
| openai api cheaper alternative | 3K+ | 25 | ⭐⭐⭐⭐⭐ |
| openrouter alternative | 2K+ | 20 | ⭐⭐⭐⭐ |
| openai vs claude api | 4K+ | 30 | ⭐⭐⭐⭐ |
| deepseek api | 50K+ | 50 | ⭐⭐⭐⭐ |
| cheapest llm api | 1K+ | 15 | ⭐⭐⭐⭐⭐ |
| gpt-4o mini api alternative | 2K+ | 25 | ⭐⭐⭐⭐ |
| gemini api alternative | 3K+ | 30 | ⭐⭐⭐⭐ |
| free openai api | 8K+ | 40 | ⭐⭐⭐ |

**第三层:长尾词(低竞争,程序化 SEO)**

- "how to use openai api in nodejs"(教程类,转化率高)
- "openai api free tier alternatives"
- "anthropic claude api pricing comparison"
- "openrouter vs helicone"
- "self hosted openai api gateway"
- "openai compatible api"
- "openai api key free"
- "azure openai vs openai"
- "openai vs openrouter pricing"
- "llm api cost calculator"
- "ai model comparison benchmark"

**第四层:中文出海(海外华人圈)**

- "openai api 国内" (海外华人)
- "claude api 怎么用"
- "国内如何使用openai"
- "chatgpt api key 购买"(敏感词!)

### 4.2 内容矩阵规划(首年 100 篇)

**Pillar Page(支柱页,1-3 篇)**:
- `/llm-api-comparison` —— 主流 LLM API 全维度对比
- `/openai-api-alternative` —— 9 大替代方案深度评测
- `/cheapest-llm-api` —— 价格表 + 实时计算器

**Cluster Pages(集群页,30-50 篇)**:
- `/openrouter-vs-helicone`
- `/openrouter-vs-portkey`
- `/vs/openai`
- `/vs/anthropic`
- `/vs/azure-openai`
- `/use-cases/customer-support-bot`
- `/use-cases/code-review`
- `/tutorials/nodejs-openai-compatible`
- `/tutorials/python-streaming`

**Programmatic SEO(程序化,200-500 页)**:
- `/models/gpt-4o`
- `/models/gpt-4o-mini`
- `/models/claude-3-5-sonnet`
- `/models/claude-3-7-sonnet`
- `/models/deepseek-v3`
- `/models/llama-3-3-70b`
- `/compare/gpt-4o-vs-claude-3-5-sonnet`
- `/compare/gpt-4o-vs-deepseek-v3`
- `/providers/openai-pricing`
- `/providers/anthropic-pricing`
- `/pricing/[provider-name]`
- `/benchmark/[model-name]`

**Blog(博客,30-50 篇)**:
- "2026 LLM API 价格对比(每月更新)"
- "OpenAI 涨价了吗?我帮你算了笔账"
- "DeepSeek V3 vs GPT-4o:实测 100 个 Prompt"
- "Token 中转站值不值得用?5 个判断标准"
- "如何用 50 行代码搭建 AI 网关"
- "Claude 3.7 Sonnet 真实使用报告"
- "为什么我放弃了 OpenAI,转用 OpenRouter"

### 4.3 程序化 SEO 实操

**核心原则**:**模板 + 数据库 = 1 万页**。

示例:`/compare/[model-a]-vs-[model-b]`

```javascript
// 生成 100+ 个对比页
const models = ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 
                'claude-3-7-sonnet', 'deepseek-v3', 'gemini-2-flash',
                'llama-3-3-70b', 'qwen-2-5-72b', 'mistral-large'];
models.forEach(a => {
  models.forEach(b => {
    if (a !== b) {
      // 生成 /compare/{a}-vs-{b}
      // 内容:定价 + 速度 + 质量(用 benchmark 数据) + 用户评测
    }
  });
});
```

**程序化页面的质量要求**:
- ❌ 不要自动生成的"垃圾"内容(Google 会惩罚)
- ✅ 每个页面要有 **真实差异化数据**(价格、benchmark、用户评价)
- ✅ 每个页面要有 **CTA**(注册/试用/比价)
- ✅ 每个页面要有 **FAQ**(结构化数据)

**真实案例**:**OpenRouter 的 `/models` 页面** —— 单一页面覆盖 400+ 模型,每个模型独立 URL,自动收录。Ahrefs 估算该页面带来月 1M+ 自然流量。

**真实案例**:**vLLM 的 `/blog` 博客** —— 持续输出技术深度文章,Domain Authority 80+,长尾词占 70%+ 流量。

### 4.4 外链建设(2026 年实操)

**第一档:Tier 1 外链(DA 70+,难拿)**:
- Hacker News(Show HN / Ask HN)
- TechCrunch / The Verge / 36Kr(公关)
- AWS / Cloudflare / Vercel 合作伙伴页
- 知名开源项目 README(赞助)
- 大学 / 研究机构 case study

**第二档:Tier 2 外链(DA 30-70,可控)**:
- IndieHackers 产品发布
- Product Hunt 获奖
- 行业博客客座文章
- 播客嘉宾
- 开发者社区精选(dev.to, hashnode)

**第三档:Tier 3 外链(DA 0-30,工具批量)**:
- 目录站提交(ProductHunt, BetaList, Launching Next)
- SaaS 评测网站(G2, Capterra, GetApp)
- 开发者工具聚合站(awesome-xxx GitHub list)
- 中文出海:掘金、SegmentFault、思否

**外链建设节奏**:
- 早期(0-1):每周 2-3 个 Tier 2-3
- 中期(1-10):每周 1-2 个 Tier 1
- 后期(10+):依靠品牌自然增长

### 4.5 SEO 工具与预算

**必备工具**:
- Ahrefs($99/月)或 SEMrush($139/月)—— 关键词研究 + 竞品分析
- Google Search Console(免费)—— 索引 + 性能监控
- Google Analytics 4(免费)—— 流量分析
- Vercel / Cloudflare(免费)—— 性能 + 缓存
- Plausible / PostHog(自托管免费)—— 隐私友好的分析

**SEO 预算分配建议**:
- 0-1 阶段:每月 $200-500(工具 + 1 个内容外包)
- 1-10 阶段:每月 $2K-5K(工具 + 内容团队 1-2 人)
- 10+ 阶段:每月 $5K-20K(SEO 团队 + 外链建设)

---

## 5. 社区运营(最便宜的获客)

社区运营 = **0 CAC 时的最强武器**。坏消息是 Token 中转站的社区已经被 OpenRouter / Anthropic / LangChain 占据,好消息是大部分中国出海团队**不会做社区**。

### 5.1 Discord 服务器搭建

**核心结构**:
```
📢 公告
  - 📢 公告 / Updates
  - 🎉 发布日志
  - 📅 活动 / AMA

💬 讨论
  - 🆕 新人报道(Intros)
  - 💡 使用问题(Support)
  - 🛠️ 开发者讨论(Dev Chat)
  - 💼 反馈 / Feature Request
  - 🐛 Bug Report

🤝 社区
  - 🌍 中文 / English / Español
  - 🔌 集成展示(Showcase)
  - 💼 招聘 / 找人
  - 🎁 福利 / Giveaway

🔬 资源
  - 📚 教程
  - 🎓 代码片段
  - 🏆 成功案例
```

**运营节奏**:
- 每天 3-5 条有价值的内容(自己 + 邀请活跃用户)
- 每周 1 次 AMA / Office Hour
- 每月 1 次黑客松 / 挑战赛
- 关键:创始人**亲自上线**(看 Discord 创始人在线率是转化关键)

**真实案例**:**LangChain Discord** 25K+ 成员,日活数千,大量用户自发帮助新人,客服成本 <$5K/月。

**真实案例**:**HuggingFace Discord** 是 HuggingFace 早期最重要的获客渠道,创始人 Clément 每天在线 5+ 小时。

### 5.2 Reddit 营销规则(2025 年更新)

**Reddit 的反硬广机制**:
- Karma < 100 的账号发推广必被 ban
- 同一产品周发超过 1 个 = 100% 被举报
- 必须用 80/20 原则(80% 真实参与,20% 才提产品)
- 找版主(Moderator)批准再发

**必进的 Subreddit**:
- r/LocalLLaMA(80万+ 成员)—— 开源 LLM 讨论
- r/OpenAI(50万+)—— OpenAI 用户
- r/ClaudeAI(20万+)—— Claude 用户
- r/MachineLearning(280万+)—— 学术 + 工业
- r/singularity(70万+)—— AGI 讨论
- r/programming(500万+)—— 程序员
- r/ExperiencedDevs(40万+)—— 资深程序员
- r/SaaS(20万+)—— SaaS 创业
- r/IndieHackers(20万+)—— 独立开发者
- r/ChatGPT(100万+)—— 终端用户

**爆款帖子公式**:
1. 真实问题开头:"我每天烧 $200 在 OpenAI..."
2. 数据支撑:截图账单、对比表
3. 解决方案 + 产品链接(但**不主推**,先提供价值)
4. AMA 邀请:"我做了个工具解决这个,免费试用"

**真实案例**:**Portkey** 在 r/LocalLLaMA 的一次发帖:"我如何用 3 周搭建 LLM Gateway,处理 100M token/天" —— 1.2K upvote,带来 500+ 注册。

### 5.3 HN 冷启动经验

**Show HN 发布 SOP**(详见第 9 节)。

**HN 的特点**:
- 高质量流量(开发者 + 投资人 + 媒体)
- 一次爆款可带来 5K-50K 流量 + 50-200 注册
- 但:算法偏爱"新账号 + 新产品",老账号重复发会被降权
- **不能造假**(Upvote 一旦被发现,账号封禁)

**HN 上榜概率提升技巧**:
1. 选周二/周三,美东 8-10 AM 提交
2. 标题:**"Show HN: 我做的 X 解决了 Y"**(具体)
3. 第一个小时必须自己 + 朋友顶起来(目标是 20+ upvote 进入第二轮)
4. 主动回答前 20 条评论(诚实、谦虚、技术深度)
5. 准备 1 段"为什么我做了这个"的 AMA

**HN 失败常见原因**:
- 标题太抽象("AI 平台" → ❌; "用 1 个 API 调用 50 个 LLM 模型" → ✅)
- 错过时间窗口(周五晚发 → 0 上榜)
- 没人顶 → 沉下去
- 评论里答不上技术问题 → 网友喷

**真实案例**:**OpenRouter** 早期(2023)靠一次 Show HN 拿到 2K 注册,目前是 HN 持续被提及的 AI 工具 Top 10。

### 5.4 Twitter / X 影响力建设

**2025 年 AI 圈 Twitter 真实生态**:
- 头部 KOL(50K+ 粉):@karpathy, @sama, @ylecun, @hwchase17, @jxmnop, @swyx
- 中部 KOL(5K-50K):大量 AI 创业者、技术博主
- 关键:**活跃 + 输出 = 影响力**(粉丝数不是关键)

**个人 IP 打造(创始人/PM)**:
- 每天发 3-5 条 tweet(技术 insight + 行业观点 + 产品更新)
- 每周发 1-2 条长文(Thread)
- 主动评论 KOL(被回复 = 涨粉最快方式)
- **忌**:刷屏、假数据、攻击竞品

**公司账号**:
- 产品更新 → 持续
- 用户故事 → 转发
- 技术博客 → 总结成 Thread
- **关键**:真实,不夸大,不画饼

**Twitter 转化数据**(基于多案例):
- 头部 KOL 推一次 = 1K-10K 点击,1-5% 转化注册
- 中部 KOL 推一次 = 100-1K 点击,3-10% 转化
- **CPM 折算下来比 Google Ads 便宜**

**真实案例**:**@levelsio**(独立开发者之王)发一次产品推 = 1-3K 注册,CAC ≈ $0。

---

## 6. 付费渠道(烧钱也要烧对地方)

付费渠道**不是冷启动首选**,但当产品验证后,合理投放可加速增长。Token 中转站最适合的付费渠道是 **Google Ads(品牌词+长尾)+ Reddit Ads**。

### 6.1 Google Ads 实操

**预算分配(分阶段)**:

| 阶段 | 月预算 | 关键词类型 | 目标 |
|---|---|---|---|
| 0-1 | $500-1K | 品牌词 + 长尾 | 验证 ROI |
| 1-10 | $3K-10K | + 竞品词 + 通用词 | 规模化 |
| 10+ | $10K-50K+ | + 行业词 + Display | 品牌防御 |

**2026 年 Google Ads 实操要点**:

**1) 关键词选择**:
- ✅ 长尾词("openai api alternative"比"openai"便宜 5 倍)
- ✅ 竞品词("[competitor] alternative", "[competitor] vs")
- ✅ 价格意图("cheapest llm api", "free openai api")
- ❌ 通用词("ai", "llm")—— CPC 过高,转化低
- ❌ 大词("openai api")—— 烧钱且被 OpenAI 自家广告挤掉

**2) 否定关键词**(必加,否则 30%+ 预算浪费):
- free(除非你真有 free tier)
- jobs
- salary
- tutorial(除非你卖教程)
- openai.com(防止自己的广告出现在 OpenAI 自己的关键词上)
- openai status
- openai login
- openai pricing
- openai careers

**3) 着陆页**:
- 通用词 → 首页(品牌展示 + 价值主张)
- 竞品词 → 竞品对比页(`/openrouter-vs-helicone`)
- 价格词 → 价格页(`/pricing`)
- 教程词 → 博客 → 文末 CTA

**4) 文案要点**:
- 标题 1:产品名 + 核心价值("1 API, 100+ Models | $0.001/1K tokens")
- 标题 2:差异化("OpenAI-Compatible, 99.9% Uptime")
- 标题 3:社会证明("Trusted by 8M+ Users")
- 描述:具体数字 + CTA

**5) 转化跟踪**:
- 必须接 GA4 + Google Ads Tag
- 跟踪:注册、激活(完成首次 API 调用)、付费
- **至少优化到"激活"目标**,而不是"注册"

**6) 智能出价**:
- 早期用 Manual CPC(可控)
- 数据足够后切到 Target CPA
- **永远不要用 Maximize Conversions**(没数据时太烧钱)

**真实 CAC 数据**(基于多案例平均):
- 品牌词:$5-15
- 竞品词:$20-50
- 长尾价格词:$15-40
- 通用词:$50-150(慎投)
- 教程词:$30-80

### 6.2 Twitter/X Ads

**适合场景**:
- 推爆款 tweet(已有自然流量,想放大)
- 推广 Open Source 项目
- 推广 Webinars / 活动

**实操要点**:
- 投 Promoted Tweet(不是 Follower ads)
- 定向:关注竞品账号 + AI 兴趣 + 开发者兴趣
- 创意:**用 tweet 本身做广告**(别用 banner)
- 预算:每天 $50-200 测试,好的加码

**真实 CAC**:
- 关注度高的 tweet:CAC $30-100
- 普通推广:CAC $80-200

**注意**:Twitter Ads ROI 普遍比 Google Ads 差,**只在 Twitter 是你的主战场时投**。

### 6.3 Reddit Ads

**优势**:
- 精准社区定向(r/LocalLLaMA, r/MachineLearning, r/ExperiencedDevs)
- 用户质量高(开发者 + 早期采用者)
- 价格便宜(CPC $0.5-2)

**实操**:
- 投 Promoted Post
- 定向:Subreddit + Interest + 设备
- 创意:**用 Reddit 风**(直接、真实、不夸大)
- **忌**:用 banner 广告风格(Reddit 用户反感)

**真实 CAC**:
- 投 r/LocalLLaMA / r/OpenAI:CAC $20-50
- 投 r/programming:CAC $30-80

**真实案例**:**OpenAI 自己在 r/LocalLLaMA 投 Reddit Ads** —— 看似笑话,但 ROI 极高,因为这个 subreddit 用户就是他们的目标客户。

### 6.4 LinkedIn Ads(B2B)

**适合**:
- SMB 销售
- Enterprise 品牌建设
- 招聘(顺带)

**实操**:
- Lead Gen Form(必用,LinkedIn 表单预填)
- 定向:Job Title(CTO, Engineering Manager) + Company Size + Industry
- 创意:**用白皮书 / 报告做落地页**

**真实 CAC**:
- B2B 决策者:CAC $100-500(LinkedIn 最贵)
- SMB Owner:CAC $50-200

**结论**:LinkedIn 只在打 B2B(创业团队 + SMB)时用,Indie 用户不在 LinkedIn。

### 6.5 各付费渠道 CAC 对比

| 渠道 | 适合用户 | CAC 范围 | 见效时间 | ROI 难度 |
|---|---|---|---|---|
| Google Ads 品牌词 | 任何 | $5-15 | 立即 | 容易 |
| Google Ads 竞品词 | 创业/SMB | $20-50 | 1-7 天 | 中 |
| Google Ads 长尾 | 任何 | $15-40 | 1-7 天 | 中 |
| Google Ads 通用 | — | $50-150 | 立即 | 难(慎投) |
| Reddit Ads | Indie/创业 | $20-50 | 1-7 天 | 容易 |
| Twitter Ads | Indie | $30-100 | 1-7 天 | 中 |
| LinkedIn Ads | 创业/SMB/Enterprise | $100-500 | 1-7 天 | 难 |
| 行业赞助 | Enterprise | $5K-50K | 3-6 月 | 看行业 |
| Podcast 赞助 | Indie/创业 | $500-5K | 1-3 月 | 看节目 |

---

## 7. 口碑与推荐(Affiliate / NPS)

口碑 = **LTV 最高的获客渠道**(用户已信任朋友)。

### 7.1 Affiliate Program 设计

**基础结构**:
- 佣金比例:**首次付费 20-30% 终身**(终身更吸引 KOL)
- 结算周期:Net-30 / Net-60(月结)
- 最低提现:$50-100
- Cookie 有效期:30-90 天
- 平台:Rewardful / FirstPromoter / LemonSqueezy Affiliate(集成 Stripe)

**推广素材**:
- 专属折扣码(给 KOL):"CODE-AI20" → 用户 20% off,KOL 30% 佣金
- 自定义追踪链接
- Banners + 文案模板
- 实时 Dashboard(看点击/注册/佣金)

**KOL 分级运营**:
- 头部 KOL(>50K 粉):单独签约,月度合作
- 中部 KOL(5K-50K):Affiliate + 专属折扣
- 尾部 KOL(<5K):纯 Affiliate 链接

**真实案例**:**ConvertKit** 终身 30% 佣金 + 行业最高 40% for top affiliates,带来 30%+ 新用户。

**真实案例**:**Vercel** 通过 Guillermo Rauch 个人 IP + Affiliate 拿到 20%+ 开发者。

### 7.2 推荐奖励机制(Referral)

**用户推荐用户**:
- A 推荐 B,B 注册 → A 得 $5-20 余额 + B 得 $5-20 折扣
- 双向激励(双 win)
- 病毒系数 K 目标:0.3-0.5

**代码示例(双倍奖励机制)**:
```javascript
// 用户 B 注册时填 A 的推荐码
const referral = await db.referrals.create({
  referrerId: A.id,
  refereeId: B.id,
  reward: { referrer: 20, referee: 20 },  // 双方都得 $20
  status: 'pending',
});
// B 充值 $20 后 → 触发奖励
```

**真实案例**:**Dropbox** 经典 Referral:推荐 1 个用户得 500MB → 永久免费策略(2.4 亿注册)。

**真实案例**:**Notion** 教育优惠 + Referral 让 K-12 / 大学市场爆发增长。

### 7.3 NPS 与口碑传播

**NPS(Net Promoter Score)目标**:
- SaaS 平均:30-40
- 优秀:50+
- 卓越:70+(Notion, Linear, Figma 这种)

**提升 NPS 的实操**:
1. **新用户 7 天内** 触发 NPS 调研(注册后第一次成功调用)
2. **Promoter(9-10 分)** 主动询问:"愿意写个 review 吗?" → 引导到 G2 / Capterra / Twitter
3. **Passive(7-8 分)** 询问:"什么能让你更满意?" → 产品改进
4. **Detractor(0-6 分)** 立刻人工跟进 → 解决问题 → 转推荐

**真实数据**:Promoter 写 review 的转化率比 Detractor 高 5-10 倍。**集中资源让 Promoter 写 review 是 G2 / Capterra 上榜的最快方式**。

**真实案例**:**Linear** 早期靠极致 NPS(70+),大量用户自发写 Thread / Tweet,3 个月从 0 到 10K 团队用户。

---

## 8. 开发者关系 DevRel(技术产品的护城河)

Token 中转站是 **DevTool 类产品**,DevRel 是最强的护城河。**OpenRouter、LangChain、Supabase、Vercel** 全部靠 DevRel 做到头部。

### 8.1 GitHub README 优化

**黄金公式**:标题 + Logo + 1 句话价值主张 + 截图/GIF + 5 行代码 + 链接

```markdown
<div align="center">
  <img src="logo.svg" width="100">
  <h1>TokenRouter</h1>
  <p>1 API, 100+ LLM Models, Pay-as-you-go</p>
  <p>
    <a href="https://tokenrouter.ai">Website</a> •
    <a href="https://docs.tokenrouter.ai">Docs</a> •
    <a href="https://discord.gg/tokenrouter">Discord</a>
  </p>
</div>

```bash
curl https://api.tokenrouter.ai/v1/chat/completions \
  -H "Authorization: Bearer $TOKENROUTER_API_KEY" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'
```

## Features
- 100+ models, 1 API
- OpenAI-compatible
- Pay-as-you-go, $0.001/1K tokens
```

**关键要素**:
- Logo + 标题(品牌)
- 1 句话价值主张
- 截图 / GIF / Demo 视频
- 5 行内可运行的代码
- 显眼的 CTA(网站/文档/Discord)
- Badge(Build / License / Discord Members)
- **多语言**(中英双语对海外华人友好)

### 8.2 文档站(VitePress / Mintlify / Docusaurus)

**文档结构**:
```
/docs
  /quickstart         5 分钟接入
  /guides
    /nodejs
    /python
    /go
    /rust
  /concepts
    /routing
    /fallback
    /caching
    /streaming
  /api-reference
  /integrations
    /langchain
    /llamaindex
    /vercel-ai-sdk
  /sdks
    /python
    /nodejs
    /go
  /pricing
  /changelog
```

**关键页面**:
1. **Quickstart**(5 行代码,5 分钟跑通)
2. **OpenAI Migration Guide**(从 OpenAI 切换的逐步指南)
3. **Multi-language SDKs**(Python, Node, Go, Rust, Java)
4. **Framework Integrations**(LangChain, LlamaIndex, Vercel AI SDK)

**真实案例**:**Anthropic** 文档 = 行业标杆,所有 LLM 公司在抄。

**真实案例**:**Vercel** 文档站有专门"From Other Providers"章节,降低迁移门槛。

### 8.3 SDK 多语言支持

**优先级(Python/Node 之后)**:
- ✅ Python(必)
- ✅ Node.js / TypeScript(必)
- ✅ Go(开发者后端主流)
- ⭐ Rust(系统编程,新兴)
- ⭐ Java/Kotlin(企业后端)
- ⭐ PHP(Laravel 生态,海外 SMB 多)
- ⭐ Ruby(Rails 生态,Indie 工具)
- ⭐ C#(.NET 生态,Enterprise)
- ⭐ Swift(iOS 开发者,2026 年 AI App 增长)

**SDK 设计原则**:
- 100% OpenAI SDK 兼容(最低门槛)
- 单独的高级功能(Routing / Fallback / Caching)用扩展方法
- 完整的 TypeScript 类型
- 自动重试 + 错误处理

### 8.4 Hackathon 赞助

**真实价值**:
- 品牌曝光(数千开发者知道你的产品)
- 直接拿到项目复刻(很多 hackathon 项目演变成创业公司)
- 招聘(看到顶级开发者)

**赞助类型**:
- **冠名赞助**($10K-50K):"Powered by TokenRouter"
- **奖品赞助**($1K-5K):"Best Use of TokenRouter API"
- **API 赞助**($0,提供额度):"Free credits for all participants"
- **Workshop**($500-2K):现场教学

**目标活动**:
- AI Hackathon(如 Lablab.ai, AI Game Jam)
- 高校 Hackathon(MIT, Stanford, CMU, Berkeley)
- Web3 + AI 跨界
- Y Combinator Hacker House
- 各大加速器 Demo Day

**真实案例**:**Together.ai** 大量赞助 AI Hackathon,品牌渗透到新一代 AI 开发者。

---

## 9. Product Hunt 发布 SOP(必读)

Product Hunt 是 **冷启动期的核武器**。一次成功发布 = 数千注册 + 媒体曝光 + 早期口碑。

### 9.1 发布前 2 周准备

**产品准备**:
- ✅ 主图(1200x630 PNG/JPG)
- ✅ 截图 3-5 张(展示核心功能)
- ✅ Demo GIF(15-30 秒,展示"第一次成功调用")
- ✅ 1 句话 tagline(< 60 字符)
- ✅ 详细描述(3-5 段 + 关键 features)
- ✅ 定价信息(免费 / Free Tier / 付费)
- ✅ 创始团队介绍(LinkedIn / Twitter)

**预热清单**:
- 准备一份 100-200 人的"Upvoter 名单"(Twitter 关注者 + 邮件订阅 + 朋友)
- 提前 1 周在 Twitter 预热:"即将在 PH 发布,敬请期待"
- 准备一份"评论 FAQ"(20 个常见问题 + 答案)
- 准备 3-5 个"Hunter"(找已经在 PH 活跃的人帮你发布,Hunter 信誉越高流量越大)
- 找一个有 5K+ followers 的 PH 账号当首发

### 9.2 发布日流程(时间表)

**发布前 24 小时**:
- 所有准备材料就绪
- 团队 all hands on deck
- 准备 5 个备用账号(防止有人 down vote)
- 准备"上线后立刻发"的 10 条 tweet

**发布当天(美西时间 00:01)**:
- 00:01 正式发布(早期发布容易在产品区主页停留更久)
- 00:05 创始人发第一条评论:"Hi PH! 我是 [name],做了 [product]..."
- 00:10 团队成员 + 朋友开始 upvote(目标前 30 分钟 20+ upvote)
- 00:30 持续回复评论(每条都要真人、真诚、技术深度)
- 02:00 持续顶起,准备被评论"和 X 有什么区别"(提前准备答案)

**关键指标**:
- 第 1 小时:30+ upvote 进入主页
- 第 4 小时:100+ upvote 上到"今日 Top 10"
- 第 24 小时:300-500+ upvote = "今日 #1"(AI 类产品 500+ 算优秀)
- 排名目标:**前 5 名**

### 9.3 发布后

- 立即发 tweet:"我们刚上了 PH #1,感谢支持"
- 截图发布数据 → 二次传播
- 收集所有评论 → 改进产品
- 准备"PH Maker"后续故事

### 9.4 真实数据:什么类型的 AI 产品容易上榜

**容易上榜的 AI 产品**:
- ✅ **OpenRouter**(LLM Gateway)—— 2023 上榜,#2
- ✅ **Perplexity**(AI Search)—— 2023 多周榜首
- ✅ **Cursor**(AI Code Editor)—— 2024 上榜
- ✅ **V0**(AI UI Generator)—— 2023 上榜
- ✅ **Suno**(AI Music)—— 2023 上榜
- ✅ **ElevenLabs**(AI Voice)—— 2023 上榜

**上榜关键因素**:
1. **大众化使用场景**(让非技术用户也"哇")
2. **5 分钟内可体验**(免注册体验版)
3. **免费 Tier + 付费 Tier**
4. **创始人 PH 账号历史**(活跃 + 之前有发布)
5. **Hunter 信誉**(大 V 发布加成)
6. **时机**(周中发布,避开周末)

**失败案例分析**:
- ❌ 太技术(只有开发者能懂)
- ❌ 必须注册才能体验
- ❌ 没有 demo 视频
- ❌ 发布日创始人不在

### 9.5 中国出海产品特别建议

- 标题**纯英文**(用英文名,不要混中文)
- 描述**避免 "AI Powered"**(用 "Built with" 替换,PH 用户对 marketing 词敏感)
- 创始人头像用专业照(不要卡通)
- **重视 Demo 视频**(海外用户更喜欢看视频)
- 找海外 Hunter(中文用户 Hunter 加成小)

---

## 10. B2B 获客(高客单打法)

Token 中转站做到 $100K+ MRR 后,必须加 B2B 打法。SMB 客户单价 $5K-50K/年,值得销售跟进。

### 10.1 冷邮件(Apollo / Instantly)

**工具**:
- **Apollo.io**($49/月起)—— 联系人 + 邮箱 + 公司数据
- **Instantly.ai**($30/月起)—— 自动化冷邮件序列
- **Lemlist**($59/月起)—— 个性化图片 + 视频邮件
- **Smartlead** —— 多账号防封

**冷邮件公式**:
```
Subject: [Name], 帮 [Company] 省 30% LLM 成本

Hi [Name],

看到 [Company] 在 [产品/博客/GitHub] 上用 AI,猜测你们在烧不少 token。

我们做了 TokenRouter —— 1 个 API 调用 100+ 模型,OpenAI 兼容。

[具体公司] 用我们后:
- LLM 成本 ↓ 40%
- 延迟 ↓ 30%(自动 fallback)
- 工程师不用再维护多 key

15 分钟 demo,看 ROI: [Calendly 链接]

[Your Name]
```

**关键要素**:
- 主题行**短 + 具体**(8-12 词)
- 1 句话价值主张
- 1 个具体案例(同行业最好)
- 1 个具体数据(数字最有说服力)
- 1 个低门槛 CTA(Calendly,不是"联系我")

**真实数据**:
- 发送量:每天 50-200 封(避免 spam)
- 打开率:40-60%
- 回复率:5-15%(好的可达 20%)
- 转化(到 demo):1-3%
- **每个 demo 成本:$50-200**

### 10.2 LinkedIn Outreach

**策略**:
1. **精准定位**:Job Title(CTO, VP Engineering) + Company Size(50-500) + Industry(AI, SaaS, E-commerce)
2. **连接请求**:**先加好友,不要直接发广告**
3. **互动**:点赞 + 评论对方 1-2 周的 post,建立熟悉度
4. **发消息**:分享有价值的内容(行业报告、benchmark)
5. **Soft pitch**:"你可能感兴趣..."(不是"我们做 X")

**真实案例**:**Gong / Outreach / Apollo** 自身都是 LinkedIn Sales 模式做到 $100M+ ARR。

**月度预算**:
- Sales Navigator($99/月)
- Apollo / ZoomInfo($500-2K/月)
- SDR 工资($3K-8K/月,海外远程)
- **总 CAC** $500-2K / 合格 Lead

### 10.3 行业展会

**必参加**:
- **KubeCon**($5K-30K 展位)—— 云原生 + AI 运维
- **AWS re:Invent**($10K-50K 展位)—— 云计算 + AI
- **Web Summit**($5K-20K)—— 综合科技
- **GTC**(NVIDIA)$5K-15K)—— AI 算力
- **AI Engineer Summit**($3K-10K)—— AI 应用
- **Collision**($5K-20K)—— 创业
- **TechCrunch Disrupt**($5K-15K)—— 创业

**ROI 计算**:
- 展位费 + 差旅 = $5K-50K
- 目标:50-200 个合格 Lead
- **每个 Lead 成本:$100-500**
- 转化 5-10% = 5-20 个客户
- **LTV $10K-50K** = 5x-10x ROI

**小成本玩法**:
- 不买展位,只买**参会票 + 自己组 meetup**
- 当地 AI 开发者 meetup($200-500 场地费)
- 联合其他公司一起办

### 10.4 内容营销(B2B 高客单)

**B2B 决策者喜欢的内容**:
- **行业白皮书**(PDF,可下载,需邮箱)
- **ROI 计算器**("输入你的 token 用量,算出能省多少")
- **Benchmark 报告**("2026 LLM API 价格 + 性能实测")
- **Case Study 客户案例**
- **架构图 + 最佳实践博客**

**白皮书模板**:
- 标题:"2026 企业 LLM 成本优化白皮书"
- 内容:行业数据 + 挑战 + 解决方案 + 案例 + ROI
- CTA:下载需填邮箱(自动进 CRM)
- 投放:LinkedIn Ads + 邮件营销

---

## 11. 真实案例研究

### 案例 1:OpenRouter —— 0 到 $1M+ MRR 的增长之路

**背景**:2023 年初,Alex Atallah(创始人)看到 LLM 厂商太多,做了"一个 API 调所有模型"的产品。

**关键数据**(2026 年 6 月公开):
- **100T tokens/月**(月活消耗量)
- **8M+ 全球用户**
- **60+ Providers**
- **400+ Models**
- 团队人数:据公开信息 < 30 人

**增长策略复盘**:

1. **早期(2023 Q1-Q2)**:Show HN 爆款 + 开发者社区口碑
   - Show HN 拿到 2K+ 注册
   - 第一时间接入所有新模型(社区有"全模型支持"心智)
   - Twitter 主动 build in public

2. **中期(2023 Q3-2024 Q4)**:SEO 为主 + 模型快速支持
   - 抢在竞品前支持 Llama 3、Mistral、DeepSeek
   - 大量 `/models` 程序化页面吃 SEO
   - 价格透明(首页直接显示所有模型价格)

3. **后期(2025+)**:Enterprise + 市场份额
   - 接入企业 SSO + SLA
   - 知名企业客户案例(Axeol, Cursor 早期)
   - Funding 公开(2024 年 Series A)

**可学到的**:
- ✅ **首发优势**:抢先做 + 抢模型支持速度
- ✅ **SEO 长尾**:模型页 + 对比页是金矿
- ✅ **透明定价**:让用户自己比较,反而是优势
- ✅ **Twitter 影响力**:创始人 @alexatallah 持续输出
- ❌ **不做的事**:没烧 Google Ads、没搞 affiliate 联盟(早期不需要)

### 案例 2:Helicone —— 可观测性 + LLM Gateway

**背景**:2023 年,Scott Stephenson(创始人)做了 LLM 可观测性工具,后来演变成 LLM Gateway。

**关键数据**:
- YC W23
- 公开融资:$3M Seed + 后续
- 客户:数千开发团队 + 数百企业

**增长策略**:

1. **YC 加速器效应**:YC 网络带来 100+ 早期客户
2. **开源 + 社区**:
   - GitHub Open Source(LLM 监控代码)
   - 早期在 r/LocalLLaMA 大量输出
3. **SEO 教程文章**:
   - "How to monitor LLM costs"
   - "OpenAI observability guide"
   - 数百篇技术博客
4. **客户案例驱动**:
   - 早期重点服务 YC 同批 + 大公司 PoC
   - 案例研究 PDF → 销售武器
5. **产品驱动增长(PLG)**:
   - 免费 Tier 慷慨
   - 5 分钟接入(SDK)
   - 用户邀请 → 团队使用 → 付费升级

**可学到的**:
- ✅ 单一功能做到极致(可观测性)再扩展
- ✅ 开源 + 商业版混合
- ✅ 教程内容吃 SEO
- ✅ YC 背书 = 信任 + 客户

### 案例 3:Portkey —— 印度出海 + B2B 打法

**背景**:印度团队,Rohit Agarwal(创始人)做 LLM Gateway,主打印度 + 欧美市场。

**增长策略**:

1. **印度 + 欧美双市场**:印度工程师资源 + 欧美 SaaS 打法
2. **LinkedIn 大量运营**:
   - 创始团队全员活跃
   - 每天 5-10 条 LinkedIn post
   - 加人 + 互动 + 内容
3. **B2B 销售**:
   - SDR 团队
   - 冷邮件 + LinkedIn Outreach
   - 重点行业:金融科技、医疗、企业
4. **技术博客 + Benchmark**:
   - 定期发布 LLM Benchmark
   - 行业报告(印度 AI 市场)
5. **价格 + 灵活计费**:
   - 印度客户:卢比计价
   - 欧美客户:美元
   - 灵活月度 / 按量

**可学到的**:
- ✅ 创始团队全员内容输出
- ✅ B2B 销售 + PLG 混合
- ✅ 多市场灵活定价
- ✅ LinkedIn 在 B2B 是必杀器

### 案例 4:中国出海 AI 产品的"避坑"

**反面案例(常见中国团队问题)**:

1. ❌ **全中文界面 + 文档** —— 95% 海外用户看不懂
2. ❌ **没海外信用卡支持** —— 50%+ 用户流失在支付
3. ❌ **没海外节点** —— 延迟 300ms+,用户立刻切走
4. ❌ **没海外公司主体** —— 大客户无法签合同
5. ❌ **营销话术太"中国"** —— "AI 赋能"、"新质生产力" → ❌
6. ❌ **创始人不出海** —— 不去海外 meetup、不参加活动
7. ❌ **价格定太低** —— 怕没竞争力,反而被怀疑质量

**正面案例(中国出海成功)**:

1. ✅ **DeepSeek** —— 中文界面 + 极致中文 LLM + 价格屠夫 + 完整文档
2. ✅ **Bolt.new** —— 海外华人 + 英文界面 + StackBlitz 收购
3. ✅ **Lutra AI** —— 中文背景 + 完美本土化
4. ✅ **Cici(字节海外)** —— 完整国际化 + 本地化

**经验总结**:
- 找至少 1 个海外合伙人或核心员工
- 美国注册公司(Delaware C-Corp 或 LLC)
- Stripe Atlas 办下来($500,3 周)
- 海外服务器(Vercel + AWS us-east-1)
- 英文 SEO + Twitter + HN 全栈
- 价格**不要低** OpenAI,**便宜 20-30%** 即可,留出"我们贵但稳定"心智

---

## 12. 新用户激活(TTV < 5 分钟)

获客来了,激活失败 = 钱白花。**Time to Value(TTV)< 5 分钟** 是 SaaS 黄金标准。

### 12.1 注册流程优化

**从注册到第一次成功调用,目标:< 3 分钟**。

**步骤 1:注册(30 秒)**
- ✅ 支持 GitHub / Google 登录(必)
- ✅ 支持 Email + 密码(部分用户没有 GitHub)
- ❌ 不要:邮箱验证(增加流失)、手机号验证(海外用户反感)

**步骤 2:Onboarding 选择(30 秒)**
- 问 1 个问题:"你是?"(Indie / Startup / Enterprise)
- **不收集太多信息**(公司规模、姓名、手机号——后期再说)

**步骤 3:获取 API Key(30 秒)**
- 默认创建一个 Project
- 自动生成一个 API Key
- 直接显示(可复制)
- 余额显示:$5 免费 credit

**步骤 4:跑通代码(2 分钟)**
- 提供 5 行代码示例
- 提供 1-Click 复制
- 提供 "Test in Playground" 按钮(在线试用)
- 提供 cURL / Python / Node.js 三个版本

**步骤 5:第一次成功调用(30 秒)**
- 看到 "🎉 Success! You used 1,234 tokens, $0.0003"
- 引导到 Dashboard 看到用量

### 12.2 免费额度策略

**2026 年行业标准**:
- OpenAI:$5 免费(需绑卡,90 天有效)
- Anthropic:$5 免费
- OpenRouter:无免费,最低充值 $5
- Helicone:Free Tier(10K 请求/月)
- **行业共识**:**$5-10 免费 = 转化关键**

**梯度设计**:
```
Free Tier:   $0           →  100K tokens/月
Hobby:       $20/月       →  5M tokens/月
Pro:         $99/月       →  30M tokens/月
Team:        $499/月      →  200M tokens/月 + 多用户
Enterprise:  Custom       →  无限 + SLA + SSO
```

### 12.3 引导教程(Onboarding Tour)

**5 个关键步骤的 Tour**:
1. 注册成功 → 弹"获取 API Key"指引
2. 获取 Key → 弹"复制代码"指引
3. 第一次调用成功 → 弹"查看 Dashboard"指引
4. 用完免费额度 → 弹"升级付费"指引
5. 第一次成功付费 → 弹"邀请团队"指引

**关键**:**不要让用户关掉所有引导**。一个好的 Tour 应:
- 简单(3-5 步,每步 < 30 秒)
- 可跳过
- 有进度条
- 用 Tooltip 风格(不阻挡操作)

### 12.4 第一个价值时刻(Aha Moment)

**Token 中转站的 Aha Moment** = **"用 1 个 API 切换模型,发现 1 个便宜 5 倍的模型也能用"**。

实现方式:
1. 用户跑通第一个模型(GPT-4o)
2. 系统推荐:"试试 DeepSeek V3,价格只有 1/30,中文更好"
3. 一键切换,跑同样 prompt
4. 显示对比表(价格、速度、质量)
5. **这就是 Aha** —— 用户立刻知道"我应该用你"

**进阶**:基于用户使用数据,**智能推荐**:
- "你 80% 的请求是简单任务,用 GPT-4o-mini 即可,月省 $X"
- "你的 prompt 大部分是中文,用 Qwen 2.5 性价比更高"

---

## 13. 30 天冷启动 SOP

下面是 **0→$5K MRR 的 30 天作战图**。每周一个里程碑。

### 第 1 周:基础建设

**Day 1-2**:
- 注册域名 + Vercel 部署
- 集成 Stripe($500 走 Stripe Atlas)
- 写完首页(价值主张 + 价格 + Demo)
- 写完 Quickstart 文档

**Day 3-4**:
- 接入 3 个核心模型(GPT-4o, Claude, DeepSeek)
- 跑通 OpenAI 兼容 API
- 内部测试 5 个 Indiehacker 朋友

**Day 5-7**:
- 写 5 篇 SEO 博客:
  - "OpenAI API Alternative 2026: 完整对比"
  - "Cheapest LLM API 价格对比"
  - "Token 中转站值不值得用"
  - "OpenRouter vs Helicone vs Portkey"
  - "如何用 50 行代码搭建 AI 网关"
- 准备 Product Hunt 发布材料

### 第 2 周:种子用户

**Day 8-10**:
- 主动联系 50 个 Indiehacker(从 Twitter / Reddit)
- 提供 1 对 1 demo + 免费额度
- 目标:10 个早期用户,5 个留下

**Day 11-14**:
- 发布 1 篇 Hacker News "Show HN"
- 同步发 Reddit(r/LocalLLaMA, r/singularity)
- 同步发 Twitter Thread
- 目标:HN 上首页 1 次,带来 500-1K 注册

### 第 3 周:内容爆发

**Day 15-18**:
- 每天 1 篇 SEO 博客
- 每天 3 条 Twitter
- 每天 5 条 Reddit 评论(80/20 原则)
- 启动 Discord 服务器(主动邀请 100 人)

**Day 19-21**:
- 准备 Product Hunt 发布(发布日定在第 4 周)
- 收集 200 个 Upvoter 名单
- 制作 Demo 视频(2 分钟)
- 邀请 5 个 KOL 试用 + 推荐

### 第 4 周:Product Hunt 发布

**Day 22-24**:
- Pre-launch 在 Twitter + 邮件预热
- 准备 FAQ 文档
- 团队 all-hands 准备

**Day 25(发布日)**:
- 美西时间 00:01 发布
- 前 4 小时持续在线回评论
- 同步发 Twitter / LinkedIn / Reddit
- 目标:Top 5 当日产品

**Day 26-30**:
- 收集所有反馈 → 紧急 Bug Fix
- 转化 PH 流量 → 注册
- 复盘 + 准备下一轮

### 30 天目标

- **1,000-3,000 注册**
- **100-300 激活(完成首次调用)**
- **20-50 付费**
- **$2K-5K MRR**
- **5-10 个 Beta 企业用户**(为后续销售打基础)

### 关键 KPI 仪表板

| KPI | 目标 | 跟踪 |
|---|---|---|
| 周注册数 | 100-500 | Mixpanel / PostHog |
| 激活率(注册→首调) | 40-60% | 内部 Dashboard |
| 试用→付费转化 | 5-15% | Stripe |
| 30 日留存 | 30-50% | PostHog |
| 净推荐值 NPS | 30+ | 季度调研 |
| 周 SEO 流量 | +20% | Ahrefs |
| Domain Authority | 30+ | Ahrefs |

---

## 14. 预算分配与团队配置

### 14.1 不同阶段预算

**0→$10K MRR(冷启动期)**:
```
SEO 工具 + 内容外包      $500/月
付费广告(测试)          $500/月
基础设施(云)            $500/月
工具订阅(Mixpanel 等)    $200/月
─────────────────────
合计                    $1.7K/月
```

**$10K→$100K MRR(增长期)**:
```
SEO + 内容团队(1-2人)   $5K-10K/月
付费广告                $5K-20K/月
SDR 远程                $3K-6K/月
工具订阅                $1K-2K/月
基础设施                $1K-3K/月
─────────────────────
合计                    $15K-40K/月
```

**$100K+ MRR(规模化期)**:
```
内容 + SEO 团队          $10K-20K/月
付费广告                $20K-50K/月
SDR + AE 团队(2-5人)    $15K-40K/月
PR + 品牌              $5K-15K/月
行业大会               $5K-20K/月
工具订阅                $2K-5K/月
基础设施                $3K-10K/月
─────────────────────
合计                    $60K-160K/月
```

### 14.2 团队配置(2 人 → 20 人)

**2 人(创始人 + 1 个全能)**:
- 创始人:产品 + 营销 + 销售
- 全能:开发 + 运营 + 客服

**5 人**:
- 创始人(CEO/产品)
- CTO(开发)
- 全栈开发 1
- 内容营销 1
- 社区运营 1(可外包)

**10 人**:
- CEO + CTO
- 工程团队 4-5 人
- 增长团队 2-3 人(SEO + 广告 + 社区)
- 销售 1 人(SDR)
- 设计师 1 人

**20 人**:
- 增加:DevRel 1 人
- 增加:BD / 合作伙伴 1 人
- 增加:客服 2-3 人
- 增加:PR / 品牌 1 人

**关键原则**:**早期工程师 + 创始人是核心,营销人员第 3 个招**。营销可以外包 + 工具,工程师是产品护城河。

### 14.3 工具栈清单

**SEO**:
- Ahrefs / SEMrush($99-139/月)
- Google Search Console(免费)
- Screaming Frog($199/年)

**广告**:
- Google Ads(预算决定)
- Reddit Ads Manager
- LinkedIn Campaign Manager
- Twitter Ads Manager

**邮件**:
- Resend / Postmark($20/月起)—— 事务邮件
- Loops.so / Customer.io($50/月起)—— 营销邮件
- Instantly / Apollo($30-50/月)—— 冷邮件

**分析**:
- PostHog(自托管免费)或 Mixpanel($20+/月)
- Plausible / Umami(自托管)
- Hotjar / Microsoft Clarity(免费,用户行为)

**社区**:
- Discord(免费)或 Circle($99/月)
- Slack(免费版)
- Discourse(自托管)

**客户支持**:
- Intercom / Crisp($95/月起)或 HelpScout
- Plain.com(现代替代)
- **便宜方案**:Discord + Front + Gmail

**Affiliate**:
- Rewardful / FirstPromoter($49-99/月)
- LemonSqueezy Affiliate(集成 Stripe)

**总工具成本**:**$200-500/月**(早期)→ **$1K-3K/月**(增长期)。

---

## 15. 反常识:别踩的 8 个坑

### 坑 1:过早烧 Google Ads

**错误**:产品刚上线,先烧 $5K Google Ads。
**结果**:烧光,CAC $200,转化 0.5%。
**正解**:先做 SEO + 社区,验证 PMF 后再开广告。

### 坑 2:在 LinkedIn 投广告给 Indiehacker

**错误**:Targeting = "Indie Hacker",平台 = LinkedIn。
**结果**:Indie Hacker 不刷 LinkedIn,CAC $500。
**正解**:Indie 在 Twitter / Reddit / HN。LinkedIn 留给 SMB / Enterprise。

### 坑 3:Affiliate 比例定太低

**错误**:5% 佣金。
**结果**:没人推,你的 affiliate 链接成垃圾。
**正解**:**20-30% 终身**。短期"亏"但长期获得 KOL + 用户。

### 坑 4:不做 Product Hunt Hunter

**错误**:自己发 PH,粉丝少没流量。
**结果**:一天 5 个 upvote,沉底。
**正解**:找 5K+ 粉丝的活跃 Hunter,送他们 Pro 账号 1 年。

### 坑 5:只发 Twitter 不回评论

**错误**:每天 5 条推,不回评论。
**结果**:粉丝 0,转化 0。
**正解**:50% 时间发推,50% 时间回评论。**评论 > 发布**。

### 坑 6:Enterprise 销售过早投入

**错误**:3 人团队就开始招 AE。
**结果**:AE 6 个月没单,公司现金流断。
**正解**:PLG(产品驱动增长)先到 $100K MRR,再上 AE。

### 坑 7:不做 NPS / 不收集反馈

**错误**:埋头开发,不看用户。
**结果**:产品越做越偏,流失率 80%。
**正解**:每周 5 个用户访谈,每月 1 次 NPS 调研。

### 坑 8:把"获客"外包给代理

**错误**:花 $5K/月找营销代理。
**结果**:代理发 5 篇 SEO 文章,无效果。
**正解**:**营销自己做 80%**。代理只在 SEO 外包、PR 投放上。

---

## 附录:核心数据速查

### A.1 渠道 CAC 速查(2025-2026)

| 渠道 | Indie | 创业团队 | SMB | Enterprise |
|---|---|---|---|---|
| SEO 自然 | $5-20 | $20-50 | $50-200 | N/A |
| Google Ads | $30-100 | $50-200 | $200-500 | $500-2K |
| Reddit Ads | $20-50 | $30-100 | N/A | N/A |
| LinkedIn | N/A | $100-300 | $300-800 | $500-2K |
| 冷邮件 | N/A | $50-200 | $200-500 | $500-1K |
| Twitter KOL | $0-30 | $30-100 | N/A | N/A |
| HN/Reddit 自然 | $0-10 | $0-20 | N/A | N/A |
| PH 发布 | $5-30 | $10-50 | N/A | N/A |
| 行业大会 | N/A | N/A | $500-2K | $1K-5K |
| Affiliate | $0-50(佣) | $0-100(佣) | $0-200(佣) | N/A |
| Referral | $5-20(奖励) | $20-50(奖励) | $50-200(奖励) | N/A |

### A.2 转化漏斗基准

```
曝光 → 点击:  0.5-2%
点击 → 注册:  20-40%
注册 → 激活:  30-60%
激活 → 付费:  5-15%
付费 → 30日留存: 40-60%
```

### A.3 LTV/CAC 健康度

- **< 1**: 烧钱
- **1-2**: 危险
- **2-3**: 还行
- **3-5**: 健康
- **5+**: 优秀

### A.4 关键工具价格

| 工具 | 价格 | 用途 |
|---|---|---|
| Ahrefs | $99/月 | SEO |
| SEMrush | $139/月 | SEO |
| Mixpanel | 免费-$20/月 | 分析 |
| PostHog | 免费(自托管) | 分析 |
| Apollo | $49/月 | 销售数据 |
| Instantly | $30/月 | 冷邮件 |
| Rewardful | $49/月 | Affiliate |
| Resend | $20/月 | 邮件 |
| Loops | $50/月 | 营销邮件 |
| Stripe | 2.9%+$0.3/笔 | 支付 |

---

## 总结:Token 中转站获客的 5 条核心原则

1. **SEO 是基本盘**:长尾 + 程序化 + 对比页。90% 长期流量来自 SEO。
2. **社区是冷启动期最强武器**:Twitter + Reddit + HN + Discord。0 CAC 时最有效。
3. **付费广告是放大器不是启动器**:PMF 验证后再投。投长尾,投竞品词,投 Reddit。
4. **Product Hunt + HN 是一次性爆款**:可遇不可求,准备充分 + 团队全力 = 一次 1K-5K 注册。
5. **DevRel 是护城河**:GitHub README + 文档站 + SDK + 黑客松赞助。技术产品唯一长期壁垒。

**最关键的一条**:**前 100 个用户靠创始人个人努力**(代码 + 邮件 + Twitter DM),前 1,000 个靠社区,前 10,000 靠 SEO + 付费,前 100,000 靠品牌 + 渠道。

---

> **下一篇预告**:TST-09 ——《Token 中转站的合规与法律风险(出海必读)》。讲清楚怎么不被 OpenAI / Anthropic 律师函搞死。
>
> 数据来源说明:本文 OpenRouter / DeepSeek 数据来自其官方页面(2026-06 抓取),CPC / Similarweb 数据来自 WordStream / Similarweb 公开报告,Reddit / HN / Product Hunt 数据来自多次观察 + 行业访谈。价格区间为业内经验值,实际可能因地区 / 行业有差异。