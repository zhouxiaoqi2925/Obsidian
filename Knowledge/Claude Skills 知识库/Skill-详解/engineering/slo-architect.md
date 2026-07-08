---
tags: [claude-skill, engineering, slo, observability]
domain: engineering
source: claude-skills/engineering/slo-architect
version: 2.9.0
---

# slo-architect

## 1. 元信息
- **仓库源**：claude-skills/engineering/slo-architect
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\slo-architect`
- **版本**：2.9.0
- **分类**：Engineering > SRE
- **触发词**："Use when the user asks to design SLOs, error budgets, or service level objectives"

## 2. 一句话定位
设计 SLO（Service Level Objectives）框架：SLI 定义、SLO 目标、错误预算、违反处理。

## 3. 核心概念

### 3.1 SLI（Service Level Indicator）
**实际测量的指标**：
- 请求成功率
- 延迟（P50/P95/P99）
- 吞吐量
- 数据新鲜度

### 3.2 SLO（Service Level Objective）
**目标值**：
- 可用性 SLO：99.9%（3 个 9）
- 延迟 SLO：P99 < 500ms
- 错误率 SLO：< 0.1%

### 3.3 Error Budget（错误预算）
**允许的失败量**：
- 99.9% SLO = 每月 43 分钟停机时间
- 99.99% SLO = 每月 4.3 分钟
- 99.999% SLO = 每月 26 秒

## 4. 工作流（核心）

### Step 1: slo_designer
- 选择 SLI（哪些指标）
- 定义 SLO 目标值
- 设计时间窗口（30 天滚动）
- 输出：slo_definition.yaml

### Step 2: error_budget_calculator
- 计算每月允许的失败量
- 输出：错误预算

### Step 3: slo_review
- 评估 SLO 是否合理
- 检查 SLO 是否太松（没意义）或太紧（永远达不到）
- 输出：slo_review_report.json

## 5. SLO 设计原则

### 5.1 不要追求 100%
> 100% SLO 不可达。99.99% 已经够好了。

### 5.2 用户视角定义 SLO
```
✅ "99% 的请求在 500ms 内返回"（用户视角）
❌ "CPU 使用率 < 80%"（内部视角）
```

### 5.3 SLO 必须可测量
```
✅ Prometheus 指标
❌ "服务感觉很稳定"
```

### 5.4 错误预算耗尽怎么办
- 冻结新功能发布
- 集中精力稳定性
- 修复后再放开

## 6. 源码解析

### 6.1 Python 工具脚本
- **slo_designer.py** — SLO 设计
- **error_budget_calculator.py** — 错误预算计算
- **slo_review.py** — SLO 合理性审查

### 6.2 参考文档
- **sli_design.md** — SLI 设计
- **slo_principles.md** — SLO 原则
- **composition.md** — 多层 SLO 组合
- **error_budget.md** — 错误预算策略

### 6.3 资产
- **slo_template.yaml** — SLO 模板
- **error_budget_policy.md** — 错误预算政策

## 7. 调用示例

### 示例 1：API 服务 SLO
```
用户：给我的 API 设计 SLO

Claude（自动调用 slo-architect）：
1. slo_designer：
   - SLI-1: 请求成功率
   - SLI-2: 延迟
   - SLO-1: 99.9% 可用性
   - SLO-2: P99 < 500ms
2. error_budget_calculator：
   - 可用性预算：43 分钟/月
   - 延迟预算：5% 请求可以 > 500ms
3. slo_review → 通过
```

## 8. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`、`observability-designer`
- **配合**：`chaos-engineering`、`performance-profiler`、`ship-gate`
- **后置**：`postmortem-facilitator`

## 9. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\slo-architect`
- SKILL.md: `skills/slo-architect/SKILL.md`