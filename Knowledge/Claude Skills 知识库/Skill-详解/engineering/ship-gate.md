---
tags: [claude-skill, engineering, release, ship]
domain: engineering
source: claude-skills/engineering/skills/ship-gate
version: 2.9.0
---

# ship-gate

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/ship-gate
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\ship-gate`
- **版本**：2.9.0
- **分类**：Engineering > Release
- **触发词**："Use when the user asks to check release readiness, pre-deployment validation, or ship gates"

## 2. 一句话定位
发布前的最后一道门禁检查，确保所有必要项都通过才能部署到生产。

## 3. 检查清单（13 项）

| # | 检查项 | 来源 |
|---|--------|------|
| 1 | 所有测试通过（lint, unit, integration, e2e） | CI |
| 2 | 测试覆盖率 ≥ 80% | Coverage report |
| 3 | 依赖漏洞扫描通过 | Snyk / Dependabot |
| 4 | SAST 静态分析通过 | Semgrep / SonarQube |
| 5 | 容器镜像安全扫描通过 | Trivy |
| 6 | SLO 错误预算充足（> 25%） | SLO 跟踪 |
| 7 | 数据库迁移已 dry-run | Migration tools |
| 8 | Feature Flag 已设置（可即时回滚） | Feature Flag 平台 |
| 9 | Runbook 已更新 | Wiki |
| 10 | 值班人员已通知 | On-call |
| 11 | 回滚方案已测试 | Staging |
| 12 | 监控 Dashboard 已配置 | Grafana |
| 13 | Changelog / Release Notes 已写 | Git log |

## 4. 工作流（核心）

### Step 1: ship_gate_scanner
- 自动扫描所有 13 项
- 输出：gate_report.json

### Step 2: 阻断 vs 警告
- 阻断项：测试失败、漏洞严重、SLO 耗尽 → **必须修复**
- 警告项：覆盖率 75%、镜像大 → **可以发布但要跟踪**

### Step 3: 输出
- 通过：✅ Ready to ship
- 阻断：❌ Block reason: ...

## 5. 源码解析

### 5.1 Python 工具脚本
- **ship_gate_scanner.py** — 主扫描器

### 5.2 参考文档
- **checks.md** — 13 项检查详细说明
- **patterns.md** — 常见 ship gate 模式

## 6. 调用示例

### 示例 1：发布前检查
```
用户：我要发布 v1.2.0 到生产

Claude（自动调用 ship-gate）：
1. ship_gate_scanner → 扫描所有项
2. 输出：
   ✅ 测试通过
   ✅ 覆盖率 87%
   ⚠️ 1 个低危依赖漏洞
   ✅ SAST 通过
   ✅ 镜像扫描通过
   ✅ SLO 错误预算 78%
   ✅ DB 迁移 dry-run 通过
   ✅ Feature Flag 已配置
   ✅ Runbook 已更新
   ❌ 未通知值班人员 → 阻断
3. 提示用户：先通知 on-call 后再继续
```

## 7. 与其它 Skill 的关系
- **前置**：所有代码/Skill 工作的最后一步
- **配合**：`observability-designer`、`slo-architect`、`chaos-engineering`、`feature-flags-architect`
- **集成**：CI/CD pipeline 的最后一步

## 8. 注意事项
- 不要跳过任何阻断项
- 警告项可以发布但要复盘
- 紧急修复（hotfix）可以简化流程，但仍需核心检查

## 9. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\ship-gate`
- SKILL.md: `SKILL.md`