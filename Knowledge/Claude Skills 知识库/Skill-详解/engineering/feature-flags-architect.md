---
tags: [claude-skill, engineering, feature-flag, release]
domain: engineering
source: claude-skills/engineering/feature-flags-architect
version: 2.9.0
---

# feature-flags-architect

## 1. 元信息
- **仓库源**：claude-skills/engineering/feature-flags-architect
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\feature-flags-architect`
- **版本**：2.9.0
- **分类**：Engineering > Release
- **触发词**："Use when the user asks to design feature flags, gradual rollouts, kill switches, or A/B testing"

## 2. 一句话定位
Feature Flag（特性开关）架构设计：分类、生命周期、发布策略、技术选型。

## 3. Feature Flag 分类

| 类型 | 用途 | 生命周期 |
|------|------|---------|
| **Release Flag** | 控制新功能发布 | 短期（几天到几周） |
| **Experiment Flag** | A/B 测试 | 短期 |
| **Ops Flag** | Kill switch、限流 | 中期（几个月） |
| **Permission Flag** | 按用户/租户开放 | 长期（可能永久） |

## 4. 工作流（核心）

### Step 1: rollout_planner
- 设计渐进式发布
- 阶段：1% → 10% → 50% → 100%
- 每个阶段的监控指标
- 输出：rollout_plan.yaml

### Step 2: flag_debt_scanner
- 扫描代码中的 feature flag
- 识别长期遗留 flag
- 建议清理时机
- 输出：flag_debt_report.json

### Step 3: kill_switch_audit
- 验证每个 flag 是否能即时关闭
- 测试关闭路径
- 输出：kill_switch_audit.json

## 5. Flag 实现模式

### 5.1 简单布尔
```python
if feature_flags.is_enabled("new-checkout"):
    return new_checkout_flow()
else:
    return old_checkout_flow()
```

### 5.2 用户细分
```python
if feature_flags.is_enabled_for_user("new-checkout", user_id):
    # 仅对白名单用户开放
```

### 5.3 渐进式
```python
if feature_flags.percentage_enabled("new-checkout", 25):
    # 25% 流量
```

### 5.4 配置驱动
```python
variant = feature_flags.get_variant("checkout-experiment", user_id)
if variant == "control":
    ...
elif variant == "treatment_a":
    ...
```

## 6. 主流 Flag 平台

| 平台 | 类型 | 特点 |
|------|------|------|
| LaunchDarkly | SaaS | 成熟、贵 |
| Split.io | SaaS | 实验功能强 |
| Flagsmith | 开源/SaaS | 自托管友好 |
| Unleash | 开源 | 免费、自托管 |
| GrowthBook | 开源 | A/B 测试强 |
| ConfigCat | SaaS | 简单便宜 |

## 7. 源码解析

### 7.1 Python 工具脚本
- **flag_debt_scanner.py** — Flag 债务扫描
- **kill_switch_audit.py** — Kill switch 审计
- **rollout_planner.py** — 发布计划生成

### 7.2 参考文档
- **flag_lifecycle.md** — Flag 生命周期管理
- **flag_taxonomy.md** — Flag 分类法
- **provider_comparison.md** — 平台对比
- **rollout_strategies.md** — 发布策略

### 7.3 资产
- **flag_request_template.md** — Flag 申请模板

## 8. 调用示例

### 示例 1：新功能发布
```
用户：我要发布新支付功能

Claude（自动调用 feature-flags-architect）：
1. rollout_planner：
   - Day 1: 1% 内部员工
   - Day 3: 10% 白名单用户
   - Day 7: 50% 流量
   - Day 14: 100% 全量
2. 每个阶段的成功标准（错误率 < 0.5%、转化率 +5%）
3. 回滚条件（任何阶段不达标立即回滚）
4. 清理计划（100% 后 2 周清理代码）
```

## 9. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`
- **配合**：`ship-gate`、`observability-designer`、`chaos-engineering`
- **后置**：`tech-debt-tracker`（flag 债务跟踪）

## 10. 注意事项
- **Flag 必须有 owner**（谁创建谁清理）
- **Flag 必须有清理日期**（避免长期遗留）
- **代码中不能 hard-code 状态**
- **Flag 命名要语义化**（不要 flag_1, flag_2）

## 11. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\feature-flags-architect`
- SKILL.md: `skills/feature-flags-architect/SKILL.md`