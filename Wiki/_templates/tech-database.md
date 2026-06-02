---
tags: [template, database, sql]
type: tech-note
created: "{{date}}"
category: "数据库"
db_type: "MySQL/Redis/PostgreSQL"
template_version: "1.0"
---

# 数据库 - {{title}}

> 创建于 {{date}}｜DB 类型：

## 一、功能概述

## 二、底层原理

### MySQL 索引原理

- B+Tree 结构：
- 聚簇索引 vs 二级索引：
- 覆盖索引：

### Redis 缓存机制

- 数据结构：
- 持久化：
- 淘汰策略：

## 三、核心 SQL / 命令

```sql
-- 示例 SQL
SELECT * FROM table WHERE condition;
```

```bash
# Redis 命令
redis-cli ...
```

## 四、使用场景

| 场景 | 推荐方案 | 理由 |
|------|----------|------|
|      |          |      |

## 五、优化方案

### 1. 索引优化

```sql
-- 创建索引
CREATE INDEX idx_name ON table(column);
```

### 2. 查询优化

- 避免 SELECT *
- 避免在 WHERE 子句使用函数
- 覆盖索引

### 3. 缓存优化

- 缓存穿透：
- 缓存击穿：
- 缓存雪崩：

## 六、锁机制 / 事务机制

```sql
-- 事务隔离级别
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

## 七、生产环境注意事项

- ⚠️ 慢查询监控
- ⚠️ 连接池配置
- ⚠️ 主从延迟处理

## 🔗 关联笔记

- [[MySQL-索引原理]]
- [[Redis-数据结构]]
- [[数据库-连接池配置]]

## 🏷️ 标签

`#数据库` `#MySQL` `#Redis` `#{{title}}`
