---
tags: [claude-skill, engineering, database, schema-design]
domain: engineering
source: claude-skills/engineering/skills/database-designer
version: 2.9.0
---

# database-designer

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/database-designer
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\database-designer`
- **版本**：2.9.0
- **分类**：Engineering > Database
- **触发词**："Use when the user asks to design a database schema, normalize tables, or optimize indexes"

## 2. 一句话定位
自动设计数据库 Schema、生成索引优化方案、生成迁移脚本的综合数据库设计 Skill。

## 3. 解决什么问题
- 手动设计数据库容易遗漏索引、范式违规、性能问题
- 缺乏从 schema 到 migration 的自动化流程
- 无法快速评估现有 schema 的优化空间

## 4. 工作流（核心）

```
Step 1: schema_analyzer
  - 读取现有 schema（如有）
  - 分析表结构、字段类型、约束
  - 识别反模式（如缺少主键、过度范式、字段冗余）

Step 2: 需求收集
  - 询问用户：业务场景、查询模式、规模
  - 识别热点查询和写入路径

Step 3: schema_designer
  - 设计表结构（字段、类型、约束）
  - 设计主键、外键、索引策略
  - 输出 schema.sql

Step 4: index_optimizer
  - 基于查询模式设计索引
  - 评估索引选择性
  - 输出索引创建语句

Step 5: migration_generator
  - 生成数据库迁移脚本
  - 支持 PostgreSQL / MySQL / SQLite
  - 包含回滚脚本

Step 6: 验证
  - 检查范式合规
  - 检查索引覆盖度
  - 输出报告
```

## 5. 输入与输出
- **输入**：
  - 业务需求描述
  - 现有 schema（可选）
  - 查询模式（如已知）
- **输出**：
  - `schema.sql` — 数据库 Schema 定义
  - `migration.sql` — 迁移脚本
  - `indexes.sql` — 索引定义
  - `report.md` — 设计与优化报告

## 6. 源码解析

### 6.1 Python 工具脚本
- **schema_analyzer.py** — 分析现有 schema，识别反模式
- **index_optimizer.py** — 基于查询模式优化索引
- **migration_generator.py** — 生成数据库迁移脚本
- **README.md** — 使用说明

### 6.2 参考文档
- **database-selection-decision-tree.md** — 数据库选型决策树（关系型/NoSQL/时序/图）
- **index-strategy-patterns.md** — 索引策略模式（B-tree/HASH/GIN/BRIN）
- **normalization_guide.md** — 范式化指南（1NF/2NF/3NF/BCNF）
- **database-design-reference.md** — 数据库设计完整参考

### 6.3 资产与模板
- **sample_query_patterns.json** — 示例查询模式
- **sample_schema.sql** — 示例 schema
- **sample_schema.json** — 示例 schema JSON

### 6.4 期望输出
- **index_optimization_sample.txt** — 索引优化样例
- **migration_sample.txt** — 迁移样例
- **schema_analysis_sample.txt** — Schema 分析样例

## 7. 调用示例

### 示例 1：新项目用户表设计
```
用户：帮我设计一个用户表的 schema

Claude（自动调用 database-designer）：
1. schema_analyzer → 无现有 schema，跳过
2. 需求收集 → 询问用户：是否需要登录、社交登录、扩展字段
3. schema_designer → 输出：
   CREATE TABLE users (
     id UUID PRIMARY KEY,
     email VARCHAR(255) UNIQUE NOT NULL,
     password_hash VARCHAR(255),
     name VARCHAR(100),
     ...
   );
4. index_optimizer → 为 email 创建唯一索引、为 created_at 创建 B-tree 索引
5. migration_generator → 生成 001_create_users_table.sql + rollback
```

### 示例 2：现有 schema 优化
```
用户：我的 chat_messages 表查询慢，帮我优化

Claude（自动调用）：
1. schema_analyzer → 分析 chat_messages 表
2. 识别问题：缺少 (user_id, created_at) 复合索引
3. index_optimizer → 设计索引：
   CREATE INDEX idx_chat_messages_user_created ON chat_messages (user_id, created_at DESC);
4. migration_generator → 生成 002_add_chat_index.sql
```

## 8. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`（先写规格）
- **配合**：`api-design-reviewer`（数据库 → API 字段映射）
- **后置**：`migration-architect`（生产环境迁移）
- **依赖**：`sql-database-assistant`（查询优化）

## 9. 注意事项
- 设计前最好先经过 `spec-driven-workflow`
- 大表 schema 变更需要 `migration-architect` 做兼容性检查
- 索引不是越多越好，需要平衡写入性能
- 跨数据库方言时需要调整（如 PostgreSQL 的 UUID vs MySQL 的 CHAR(36)）

## 10. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\database-designer`
- SKILL.md 相对路径：`SKILL.md`