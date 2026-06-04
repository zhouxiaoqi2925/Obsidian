---
title: PostgreSQL
tags: [关系数据库, SQL, OLTP, 开源, 扩展性]
---

# PostgreSQL

## 前言

**定位**：世界上最先进的开源关系数据库，1986 年起源于加州大学伯克利分校至今是 OLTP 场景的"开发者首选"，DB-Engines 排名长期占据 Top 4，被 Apple、Instagram、Spotify、Uber、Netflix 等大厂核心业务采用。

**核心价值**：
- 标准 SQL 兼容性最高：完整 ACID、严格 SQL 规范
- 强大扩展性：自定义类型、函数、索引方法、操作符
- 高级特性：JSONB、全文搜索、地理空间、时序、图查询
- 真正的事务：MVCC + 可串行化隔离级别
- 插件生态：PostGIS、TimescaleDB、pgvector、pg_trgm 等数百扩展

**五大特性**：
1. **MVCC**：多版本并发控制，读不阻塞写、写不阻塞读
2. **JSONB**：二进制 JSON，支持索引和复杂查询
3. **扩展（Extension）**：CREATE EXTENSION 启用各种能力
4. **WAL + 流复制**：物理复制 + 逻辑复制，主备/读写分离
5. **表继承 + 分区表**：原生支持表分区（Range/List/Hash）

**对比表**：

| 维度 | PostgreSQL | MySQL | Oracle | SQL Server | SQLite |
|---|---|---|---|---|---|
| 许可证 | BSD | GPL | 商业 | 商业 | Public |
| SQL 标准 | ✅✅ 最严格 | ⚠️ 部分 | ✅✅ | ✅ | ⚠️ |
| 性能 | 复杂查询优 | 简单读优 | 极优 | 优 | 单机 |
| 扩展 | 极丰富 | 中 | 极强 | 强 | 少 |
| 高级类型 | JSONB/GIS/Vector | JSON/Geo | Spatial | Spatial | JSON |
| 适合 | 复杂业务 | Web OLTP | 企业 | 企业 | 嵌入式 |

## 思维导图

```mermaid
mindmap
  root((PostgreSQL))
    架构
      进程
        postmaster
        backend
      内存
        shared buffers
        WAL buffers
      存储
        heap
        TOAST
        FSM VM
    数据类型
      数值
        int float
        numeric
      字符
        text varchar
        char
      时间
        timestamp
        interval
      JSON
        json jsonb
      几何
        point polygon
      自定义
        CREATE TYPE
    索引
      B-tree
        默认
      Hash
        等值
      GIN
        jsonb array
      GiST
        范围 几何
      BRIN
        大表
    高级
      视图
        普通
        物化
      函数
        plpgsql
        存储过程
      触发器
        trigger
      CTE
        WITH
      窗口
        OVER
    事务
      ACID
      MVCC
      隔离级别
        RC RR
        SSI
    复制
      流复制
        物理
      逻辑复制
        表级
      主备
        HA
    备份
      pg_dump
      pg_basebackup
      PITR
        WAL
    扩展
      PostGIS
        地理
      TimescaleDB
        时序
      pgvector
        向量
      pg_trgm
        模糊
      uuid-ossp
    工具
      psql
      pgAdmin
      DBeaver
      pg_stat_statements
    应用场景
      OLTP
      数据分析
      GIS
      全文搜索
      向量检索
```

## 关键代码

### 一、连接与基础

```bash
# 启动
pg_ctl -D /var/lib/postgresql/data start
pg_ctl -D /var/lib/postgresql/data stop -m fast
service postgresql start

# 创建用户和数据库
sudo -u postgres psql
postgres=# CREATE USER alice WITH PASSWORD 'secret';
postgres=# CREATE DATABASE mydb OWNER alice;
postgres=# GRANT ALL PRIVILEGES ON DATABASE mydb TO alice;
postgres=# \q

# 连接
psql -h 127.0.0.1 -U alice -d mydb
psql postgresql://alice:secret@localhost:5432/mydb
PGPASSWORD=secret psql -U alice -h localhost mydb
```

```sql
-- 元命令
\l              -- 列出数据库
\dt             -- 列出表
\d table_name   -- 表结构
\di             -- 索引
\dv             -- 视图
\df             -- 函数
\du             -- 用户
\dn             -- schema
\timing         -- 计时
\q              -- 退出
\x              -- 扩展显示
\copy ...       -- 导入导出
```

### 二、SQL 基础

```sql
-- 创建表
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  profile JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_profile ON users USING GIN (profile);
CREATE INDEX idx_users_created ON users(created_at DESC);

-- 增删改查
INSERT INTO users (email, username, password_hash) VALUES
  ('alice@example.com', 'alice', 'hash1'),
  ('bob@example.com', 'bob', 'hash2')
RETURNING id, created_at;

SELECT id, email, profile->>'name' AS name
FROM users
WHERE created_at > NOW() - INTERVAL '7 days'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

UPDATE users SET profile = profile || '{"theme": "dark"}'::jsonb
WHERE id = 1
RETURNING updated_at;

DELETE FROM users WHERE deleted_at < NOW() - INTERVAL '30 days';
```

### 三、高级查询

```sql
-- CTE (Common Table Expression)
WITH recent_orders AS (
  SELECT user_id, COUNT(*) AS cnt, SUM(total) AS total
  FROM orders
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY user_id
)
SELECT u.email, ro.cnt, ro.total
FROM users u
JOIN recent_orders ro ON u.id = ro.user_id
WHERE ro.total > 1000;

-- 窗口函数
SELECT
  email,
  created_at,
  ROW_NUMBER() OVER (PARTITION BY DATE_TRUNC('day', created_at) ORDER BY id) AS rn,
  COUNT(*) OVER (PARTITION BY DATE_TRUNC('day', created_at)) AS daily_count,
  LAG(email) OVER (ORDER BY created_at) AS prev_email
FROM users;

-- 递归 CTE（树形结构）
WITH RECURSIVE org_tree AS (
  SELECT id, name, manager_id, 1 AS depth
  FROM employees
  WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, e.manager_id, t.depth + 1
  FROM employees e
  JOIN org_tree t ON e.manager_id = t.id
)
SELECT * FROM org_tree ORDER BY depth, name;

-- 聚合
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS users,
  COUNT(DISTINCT email) AS unique_emails
FROM users
GROUP BY day
HAVING COUNT(*) > 10
ORDER BY day DESC;
```

### 四、JSONB

```sql
-- JSON / JSONB
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(50),
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入
INSERT INTO events (type, data) VALUES
  ('click', '{"button": "login", "page": "/home"}'),
  ('view', '{"page": "/products", "duration": 5}');

-- 查询
SELECT * FROM events WHERE data->>'button' = 'login';
SELECT * FROM events WHERE data @> '{"page": "/home"}';
SELECT * FROM events WHERE data ? 'duration';
SELECT * FROM events WHERE data->'duration' > '3';

-- 索引
CREATE INDEX idx_events_data ON events USING GIN (data);

-- 更新
UPDATE events SET data = data || '{"clicked": true}'::jsonb
WHERE id = 1;

-- 嵌套
SELECT data->'user'->>'name' FROM events;
```

### 五、全文搜索

```sql
-- 创建列
ALTER TABLE articles ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', title), 'A') ||
    setweight(to_tsvector('english', body), 'B')
  ) STORED;

-- GIN 索引
CREATE INDEX idx_articles_search ON articles USING GIN (search_vector);

-- 查询
SELECT id, title FROM articles
WHERE search_vector @@ plainto_tsquery('english', 'postgresql performance')
ORDER BY ts_rank(search_vector, plainto_tsquery('english', 'postgresql performance')) DESC;

-- 高亮
SELECT ts_headline('english', body, plainto_tsquery('postgresql')) FROM articles;
```

### 六、事务

```sql
-- 基本事务
BEGIN;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
  UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;

-- 保存点
BEGIN;
  INSERT INTO logs (...) VALUES (...);
  SAVEPOINT sp1;
  UPDATE users SET ... WHERE ...;
  ROLLBACK TO sp1;
  INSERT INTO audits (...) VALUES (...);
COMMIT;

-- 隔离级别
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;     -- 默认
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;        -- SSI

-- 悲观锁
SELECT * FROM users WHERE id = 1 FOR UPDATE;
SELECT * FROM users WHERE id = 1 FOR NO KEY UPDATE;
SELECT * FROM users WHERE id = 1 FOR SHARE;
```

### 七、视图与函数

```sql
-- 视图
CREATE VIEW active_users AS
SELECT id, email, profile
FROM users
WHERE deleted_at IS NULL;

-- 物化视图
CREATE MATERIALIZED VIEW monthly_stats AS
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) AS user_count
FROM users
GROUP BY 1;

REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_stats;

-- 存储函数
CREATE OR REPLACE FUNCTION add_user(p_email VARCHAR, p_username VARCHAR)
RETURNS BIGINT AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO users (email, username, password_hash)
  VALUES (p_email, p_username, 'temp')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- 调用
SELECT add_user('alice@example.com', 'alice');
```

### 八、扩展安装

```sql
-- 查看可用扩展
SELECT * FROM pg_available_extensions WHERE name LIKE '%vec%';

-- 安装扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- pgvector 向量检索
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT,
  embedding vector(1536)
);

CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops);

-- 相似度搜索
SELECT id, content FROM documents
ORDER BY embedding <=> (SELECT embedding FROM documents WHERE id = 1)
LIMIT 10;
```

### 九、性能调优

```sql
-- 慢查询分析
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 20;

-- EXPLAIN
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'alice@example.com';

-- 配置（postgresql.conf）
shared_buffers = 4GB
work_mem = 64MB
maintenance_work_mem = 512MB
effective_cache_size = 12GB
random_page_cost = 1.1
wal_buffers = 64MB
checkpoint_completion_target = 0.9

-- VACUUM（清理死元组）
VACUUM (VERBOSE, ANALYZE) users;
VACUUM FULL users;                    -- 回收空间（锁表）
AUTOVACUUM = ON

-- 索引维护
REINDEX INDEX idx_users_email;
```

### 十、备份恢复

```bash
# 逻辑备份
pg_dump -h localhost -U alice -d mydb -F c -f mydb.dump
pg_dump -h localhost -U alice -d mydb -F p -f mydb.sql    # SQL 文本
pg_dumpall -U postgres -f all.sql                         # 全部

# 恢复
pg_restore -h localhost -U alice -d newdb mydb.dump
psql -h localhost -U alice -d newdb < mydb.sql

# 物理备份
pg_basebackup -h localhost -U repl -D /backup -Ft -z -P

# PITR（Point-in-Time Recovery）
# 1. 启用 WAL 归档
wal_level = replica
archive_mode = on
archive_command = 'cp %p /wal_archive/%f'
# 2. 恢复时创建 recovery.signal
# 3. 配置恢复目标
restore_target = '2026-06-04 12:00:00'
restore_command = 'cp /wal_archive/%f %p'
```

### 十一、主从复制

```conf
# 主库 postgresql.conf
wal_level = replica
max_wal_senders = 5
wal_keep_size = 1GB
```

```bash
# 创建复制用户
psql -c "CREATE USER repl REPLICATION LOGIN PASSWORD 'secret';"

# 从库：基础备份
pg_basebackup -h primary -U repl -D /var/lib/postgresql/data -P -Xs -R
# -R 自动生成 standby.signal 和连接配置
```

```conf
# 从库 postgresql.conf
primary_conninfo = 'host=primary port=5432 user=repl password=secret'
hot_standby = on
```

```bash
# 提升从库为主
pg_ctl promote -D /var/lib/postgresql/data

# 检查状态
psql -c "SELECT * FROM pg_stat_replication;"
```

## 核心洞察

- **PostgreSQL 是"最像 Oracle"的开源数据库**：企业级特性应有尽有
- **PostgreSQL 的 MVCC 实现了真正的快照隔离**：读不阻塞写，写不阻塞读
- **PostgreSQL 的 JSONB 是 NoSQL 的"投降"**：文档数据库的能力内化进 SQL
- **PostgreSQL 的扩展机制是杀手锏**：PostGIS/Greenplum/TimescaleDB 都基于此
- **PostgreSQL 的标准 SQL 合规度第一**：vs MySQL 早期不标准、SQL Server 偏 T-SQL
- **PostgreSQL 的 WAL 是 PITR 的基础**：恢复到任意时间点
- **PostgreSQL 的并行查询（9.6+）追赶商业库**：大表 ANALYZE/COUNT 显著加速
- **PostgreSQL 的表分区是 12+ 成熟**：之前要靠 pg_partman 扩展
- **PostgreSQL 在云上的崛起**：AWS Aurora PG、Supabase、Neon、Timescale Cloud
- **PostgreSQL 的"逻辑复制"开启多主可能**：vs 物理复制的"主备"模式
- **PostgreSQL 的"水平扩展"原生支持弱**：Citus 扩展补足，分片到集群
- **PostgreSQL 在 AI 时代逆袭**：pgvector 让 PG 直接做向量检索，无须专用向量库

## 跨项目引用

- **[[linux]]**：PostgreSQL 跑在 Linux 上
- **[[docker]]**：PostgreSQL 官方 Docker 镜像
- **[[kubernetes]]**：PostgreSQL Operator（Zalando/CloudNative-PG）部署
- **[[mysql]]**：MySQL 是 PG 的主要竞品
- **[[redis]]**：Redis 是 PG 的缓存层
- **[[mongodb]]**：MongoDB 是 NoSQL 文档数据库
- **[[kafka]]**：用 Kafka + Debezium 做 PG 的 CDC
- **[[prometheus]]** + **[[pg_exporter]]**：PG 监控
- **[[postgis]]**：PostGIS 是 PG 的地理空间扩展
- **[[timescaledb]]**：TimescaleDB 是 PG 的时序扩展
- **[[pgvector]]**：pgvector 是 PG 的向量检索扩展
- **[[supabase]]** / **[[neon]]**：PostgreSQL 云服务
