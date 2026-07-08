---
tags: [claude-skill, engineering, chaos, reliability]
domain: engineering
source: claude-skills/engineering/chaos-engineering
version: 2.9.0
---

# chaos-engineering

## 1. 元信息
- **仓库源**：claude-skills/engineering/chaos-engineering
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\chaos-engineering`
- **版本**：2.9.0
- **分类**：Engineering > Reliability
- **触发词**："Use when the user asks to do chaos engineering, fault injection, resilience testing, or game day exercises"

## 2. 一句话定位
设计并执行混沌工程实验，主动注入故障来验证系统的韧性。

## 3. 核心原则

```
1. 建立稳定状态（Steady State）
2. 假设（Hypothesis）
3. 设计实验（最小爆炸半径）
4. 在生产环境执行（从小流量开始）
5. 学习并改进
```

## 4. 工作流（核心）

### Step 1: blast_radius_calculator
- 计算实验的影响范围
- 评估风险等级（低/中/高）
- 输出：blast_radius_report.json

### Step 2: experiment_designer
- 选择故障类型（kill pod / network latency / CPU stress / disk full）
- 设计渐进式实验（Stage 1 → 5% 流量, Stage 2 → 25%, Stage 3 → 100%）
- 输出：experiment_plan.md

### Step 3: experiment_executor
- 使用 Chaos Mesh / Litmus / Gremlin 执行
- 监控 SLO 指标
- 自动回滚（如果 SLO 违反）

### Step 4: experiment_postmortem
- 收集实验数据
- 验证假设
- 编写改进项
- 输出：postmortem.md

## 5. 故障注入类型

| 故障类型 | 工具 | 影响 |
|---------|------|------|
| Pod Kill | Chaos Mesh | 验证副本恢复能力 |
| Network Delay | Toxiproxy | 验证超时处理 |
| Network Partition | Chaos Mesh | 验证分布式系统行为 |
| CPU Stress | ChaosBlade | 验证资源限制 |
| Memory Stress | ChaosBlade | 验证 OOM 处理 |
| Disk Fill | ChaosBlade | 验证存储监控 |
| DNS Failure | Toxiproxy | 验证服务发现降级 |
| Process Kill | kill -9 | 验证优雅关闭 |

## 6. 源码解析

### 6.1 Python 工具脚本
- **blast_radius_calculator.py** — 影响范围计算
- **experiment_designer.py** — 实验设计
- **experiment_postmortem.py** — 实验后复盘

### 6.2 参考文档
- **chaos_principles.md** — 混沌工程原则
- **attack_taxonomy.md** — 故障分类法
- **experiment_design.md** — 实验设计方法论
- **tooling_landscape.md** — 工具全景

### 6.3 资产与模板
- **experiment_template.md** — 实验计划模板
- **postmortem_template.md** — 复盘模板

## 7. 调用示例

### 示例 1：验证 Pod 副本恢复
```
用户：我要验证我的 K8s 服务副本恢复能力

Claude（自动调用 chaos-engineering）：
1. blast_radius_calculator → 单个 Pod，10% 流量，风险低
2. experiment_designer：
   - 假设：副本数 ≥ 2 时，故障 Pod 在 30 秒内恢复
   - 步骤：kill 1 个 pod → 监控 readiness → 30s 后恢复
3. 执行 → 验证假设
4. 输出 postmortem：副本恢复耗时 18s，假设成立
```

### 示例 2：网络分区测试
```
用户：测试我的微服务在网络分区下的行为

Claude（自动调用）：
1. blast_radius_calculator → 涉及多个服务，风险中
2. experiment_designer：
   - 假设：订单服务在无法访问用户服务时返回降级数据
3. 用 Toxiproxy 切断服务间网络
4. 监控：订单成功率、错误率、用户体验指标
5. 输出：发现实际返回 503，应该返回缓存的默认数据
```

## 8. 与其它 Skill 的关系
- **前置**：`observability-designer`（必须有监控）、`slo-architect`（必须有 SLO）
- **配合**：`performance-profiler`
- **后置**：`postmortem-facilitator`

## 9. 注意事项
- **永远不要在生产高峰期开始**
- 必须有自动停止条件
- 必须有回滚预案
- 必须有清晰的 blast radius 限制
- 先在 staging 验证

## 10. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\chaos-engineering`
- SKILL.md: `skills/chaos-engineering/SKILL.md`