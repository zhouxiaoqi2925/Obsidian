---
tags: [claude-skill, engineering, migration, architecture]
domain: engineering
source: claude-skills/engineering/skills/migration-architect
version: 2.9.0
---

# migration-architect

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/migration-architect
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\migration-architect`
- **版本**：2.9.0
- **分类**：Engineering > Architecture
- **触发词**："Use when the user asks to plan system migrations, zero-downtime deployments, or schema evolution"

## 2. 一句话定位
设计零停机的系统迁移架构，包括数据迁移、服务迁移、回滚方案。

## 3. 迁移类型

| 类型 | 例子 | 难度 |
|------|------|------|
| Schema 迁移 | 加字段、改类型 | 中 |
| 服务迁移 | 单体 → 微服务 | 高 |
| 数据库迁移 | MySQL → PostgreSQL | 高 |
| 存储迁移 | 本地 → S3 | 低 |
| 平台迁移 | AWS → GCP | 高 |
| 框架升级 | React 17 → 18 | 中 |

## 4. 工作流（核心）

### Step 1: compatibility_checker
- 评估新旧系统兼容性
- 识别依赖关系
- 输出：compatibility_report.json

### Step 2: migration_planner
- 选择迁移策略
- 估算时间和资源
- 设计阶段（Phase 1, 2, 3...）
- 输出：migration_plan.json

### Step 3: rollback_generator
- 每个 Phase 设计回滚点
- 自动回滚脚本
- 数据一致性检查
- 输出：rollback_runbook.json

## 5. 常见迁移模式

### 5.1 Strangler Fig（绞杀者模式）
```
旧系统 ←→ 代理层 → 新系统
逐步把流量从旧切到新
最后下线旧系统
```

### 5.2 Expand-Contract
```
Phase 1: Expand（加新字段/服务）
Phase 2: Migrate（数据/流量迁移）
Phase 3: Contract（移除旧字段/服务）
```

### 5.3 Blue-Green
```
旧环境 (Blue) → 100% 流量
新环境 (Green) → 0% 流量
测试 Green → 切换 100% → 下线 Blue
```

### 5.4 Canary
```
新版本 → 5% 流量 → 监控 → 25% → 50% → 100%
任何阶段异常 → 自动回滚
```

## 6. 源码解析

### 6.1 Python 工具脚本
- **compatibility_checker.py** — 兼容性检查
- **migration_planner.py** — 迁移计划生成
- **rollback_generator.py** — 回滚方案生成

### 6.2 参考文档
- **migration_patterns_catalog.md** — 迁移模式目录
- **zero_downtime_techniques.md** — 零停机技术
- **data_reconciliation_strategies.md** — 数据一致性策略

### 6.3 期望输出
- **sample_database_migration_plan.json**
- **sample_service_migration_plan.json**
- **schema_compatibility_report.json**
- **rollback_runbook.json**

## 7. 调用示例

### 示例 1：数据库迁移
```
用户：我的 MySQL 表要加一个字段，业务不能停

Claude（自动调用 migration-architect）：
1. compatibility_checker → 评估影响
2. migration_planner：
   - Phase 1: 加 nullable 字段（无锁）
   - Phase 2: 应用层开始写新字段
   - Phase 3: 数据回填（双写）
   - Phase 4: 读改用新字段
   - Phase 5: 字段设为 NOT NULL
   - Phase 6: 删除旧字段
3. rollback_generator → 每个阶段都可回滚
```

## 8. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`、`database-designer`
- **配合**：`observability-designer`、`chaos-engineering`
- **后置**：`postmortem-facilitator`

## 9. 注意事项
- **永远先备份**
- **小流量验证**
- **可回滚优先于完美方案**
- **数据一致性 > 速度**

## 10. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\migration-architect`
- SKILL.md: `SKILL.md`