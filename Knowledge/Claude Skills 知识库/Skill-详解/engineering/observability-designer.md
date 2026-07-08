---
tags: [claude-skill, engineering, observability, slo]
domain: engineering
source: claude-skills/engineering/skills/observability-designer
version: 2.9.0
---

# observability-designer

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/observability-designer
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\observability-designer`
- **版本**：2.9.0
- **分类**：Engineering > Observability
- **触发词**："Use when the user asks to design observability, metrics dashboards, alerting, log aggregation, or distributed tracing"

## 2. 一句话定位
设计完整的可观测性体系：Metrics、Logs、Traces 三大支柱，加上 Dashboard 和告警。

## 3. 三大支柱

| 支柱 | 工具示例 | 回答的问题 |
|------|---------|----------|
| **Metrics** | Prometheus, Datadog | 整体趋势如何？ |
| **Logs** | ELK, Loki | 发生了什么？ |
| **Traces** | Jaeger, Zipkin | 这次请求经过了哪些服务？ |

## 4. 工作流（核心）

### Step 1: alert_optimizer
- 设计告警规则（基于 SLO）
- 避免告警疲劳
- 输出：alerting_rules.yaml

### Step 2: dashboard_generator
- 设计 Grafana / Datadog Dashboard
- RED 指标（Rate / Error / Duration）
- USE 指标（Utilization / Saturation / Errors）
- 业务指标（订单量、收入、活跃用户）
- 输出：dashboard.json

### Step 3: slo_designer
- 定义 SLI（Service Level Indicator）
- 定义 SLO（Service Level Objective）
- 定义 Error Budget Policy
- 输出：slo_framework.yaml

## 5. 源码解析

### 5.1 Python 工具脚本
- **alert_optimizer.py** — 告警优化（去重、降噪）
- **dashboard_generator.py** — Dashboard 生成
- **slo_designer.py** — SLO 设计

### 5.2 参考文档
- **slo_cookbook.md** — SLO 实战手册
- **alert_design_patterns.md** — 告警设计模式
- **dashboard_best_practices.md** — Dashboard 最佳实践

### 5.3 资产与模板
- **sample_service_web.json** — Web 服务示例配置
- **sample_service_api.json** — API 服务示例配置
- **sample_alerts.json** — 告警规则示例
- **sample_dashboard.json** — Dashboard 示例
- **sample_slo_framework.json** — SLO 框架示例

## 6. RED / USE 框架

### RED（对每个服务）
- **Rate** — 每秒请求数
- **Errors** — 错误率
- **Duration** — 延迟分布

### USE（对每个资源）
- **Utilization** — 使用率
- **Saturation** — 饱和度
- **Errors** — 错误数

## 7. 调用示例

### 示例 1：新服务上线
```
用户：我的 FastAPI 服务要上线，需要可观测性

Claude（自动调用 observability-designer）：
1. slo_designer：
   - SLI: 请求成功率、延迟
   - SLO: 99.9% 可用性，P99 < 500ms
   - Error Budget: 每月 43 分钟停机时间
2. alert_optimizer：
   - 5xx 错误率 > 1% → 警告
   - P99 > 1s → 警告
   - Pod CPU > 80% → 警告
3. dashboard_generator：
   - RED 面板（Rate/Error/Duration）
   - SLO 面板（合规率、错误预算消耗）
   - 业务面板（订单数、活跃用户）
```

## 8. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`
- **配合**：`slo-architect`、`chaos-engineering`、`performance-profiler`
- **后置**：`postmortem-facilitator`

## 9. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\observability-designer`
- SKILL.md: `SKILL.md`