---
tags: [claude-skill, engineering, tech-debt, code-quality]
domain: engineering
source: claude-skills/engineering/skills/tech-debt-tracker
version: 2.9.0
---

# tech-debt-tracker

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/tech-debt-tracker
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\tech-debt-tracker`
- **版本**：2.9.0
- **分类**：Engineering > Quality
- **触发词**："Use when the user asks to track technical debt, prioritize refactoring, or manage code health"

## 2. 一句话定位
技术债跟踪、分类、优先级排序的 Skill。

## 3. 技术债分类

| 类别 | 例子 | 优先级 |
|------|------|--------|
| **Code Debt** | 重复代码、过长函数 | 中 |
| **Architecture Debt** | 单体架构、紧耦合 | 高 |
| **Test Debt** | 缺少测试、低覆盖率 | 高 |
| **Documentation Debt** | 过期文档、缺失 README | 低 |
| **Dependency Debt** | 过期库、未更新版本 | 中 |
| **Infrastructure Debt** | 手动部署、无监控 | 高 |
| **Security Debt** | SQL 注入漏洞 | 极高 |

## 4. 工作流（核心）

### Step 1: debt_scanner
- 自动扫描代码库
- 识别技术债
- 输出：scan_report.json

### Step 2: debt_prioritizer
- 按业务影响 × 修复成本排序
- 输出：prioritization.json

### Step 3: debt_dashboard
- 可视化技术债趋势
- 按团队/模块聚合
- 输出：dashboard.html

## 5. 优先级模型

```
Priority = (业务影响 × 累积成本) / (修复成本 × 时间紧迫度)

- 业务影响：1-5（5 = 直接影响收入）
- 累积成本：随时间增长
- 修复成本：人/天
- 时间紧迫度：1-5（5 = 即将出问题）
```

## 6. 技术债记账

每笔债应该有：
```yaml
id: TD-001
title: 用户登录慢（缺少缓存）
category: Architecture Debt
business_impact: 5   # 影响 80% 用户
fix_cost_days: 3
urgency: 4           # 最近投诉增加
created: 2026-05-01
owner: backend-team
related_issues: [ISSUE-123, ISSUE-456]
```

## 7. 源码解析

### 7.1 Python 工具脚本
- **debt_scanner.py** — 债务扫描
- **debt_prioritizer.py** — 优先级排序
- **debt_dashboard.py** — Dashboard 生成

### 7.2 参考文档
- **debt-classification-taxonomy.md** — 债务分类法
- **debt-frameworks.md` — 债务管理框架
- **prioritization-framework.md** — 优先级框架
- **stakeholder-communication-templates.md` — 干系人沟通模板

### 7.3 资产
- **sample_debt_inventory.json` — 示例债务清单
- **historical_debt_*.json` — 历史债务
- **sample_codebase/` — 示例代码库

### 7.4 期望输出
- **sample_scan_output.json` — 扫描样例
- **sample_prioritization_output.json` — 优先级样例
- **sample_dashboard_output.json` — Dashboard 样例

## 8. 调用示例

### 示例 1：技术债盘点
```
用户：盘点我们项目的技术债

Claude（自动调用 tech-debt-tracker）：
1. debt_scanner → 扫描代码
   - 142 处重复代码
   - 38 个文件缺少测试
   - 23 个过期依赖
   - 5 个 SQL 注入风险
2. debt_prioritizer → 按优先级排序
3. debt_dashboard → 生成可视化报告
```

## 9. 与其它 Skill 的关系
- **前置**：`codebase-onboarding`
- **配合**：`code-review`、`karpathy-coder`
- **集成**：Jira / Linear / GitHub Issues

## 10. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\tech-debt-tracker`
- SKILL.md: `SKILL.md`