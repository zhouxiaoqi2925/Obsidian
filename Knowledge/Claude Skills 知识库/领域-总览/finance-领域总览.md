---
tags: [claude-skills, finance, 领域总览]
domain: finance
total_skills: 4
source: claude-skills/finance/
---

# Finance 领域总览

## 1. 领域定位

**Finance 领域**提供 **4 个**财务相关 Skill，覆盖财务分析、健康度、FP&A 等。

## 2. Skills

- **financial-analyst** — 财务分析师
- **financial-health** — 财务健康度
- **cs-financial-analyst** — 财务分析师 Agent
- **finance-lead** — 财务负责人

## 3. 关键概念

### 3.1 单位经济（Unit Economics）
```
LTV / CAC 比率：
- LTV（Lifetime Value）：客户终身价值
- CAC（Customer Acquisition Cost）：获客成本
- LTV / CAC > 3 才算健康
```

### 3.2 烧钱率（Burn Rate）
```
Gross Burn = 月总支出
Net Burn = 月总支出 - 月收入
Runway = 现金余额 / Net Burn（月数）
```

## 4. 工作流示例

### 4.1 财务健康度
```
用户：分析我的 SaaS 业务财务健康

Claude（自动调用 financial-health）：
1. 计算 LTV / CAC
2. 计算 MRR / ARR
3. 烧钱率与 runway
4. 毛利率
5. 输出健康度报告
```

## 5. 与其它 Skill 的关系
- **上层**：`c-level-advisor/cfo-advisor`
- **配合**：`marketing/`（CAC 分析）
- **数据**：`observability-designer`

## 6. 下一步
- 💰 查看具体财务 Skill
- 💼 进入 [[c-level-advisor-领域总览]]