# 《PostgreSQL》速查卡

> 入口在 [[README|README.md]]｜分类：Database｜⭐⭐⭐⭐⭐⭐｜适用：OLTP 严肃场景 / 复杂查询 / GIS / JSONB

---

## 🎯 一句话价值

**关系数据库的学术与工程完美结合**：MVCC / WAL / CBO / 过程语言 / 扩展机制全套开源实现, 是数据库内核学习的最佳教材。

---

## 🧠 3 个核心洞察（必背）

1. **MVCC + Vacuum** — 读不阻塞写, 但死元组要靠 vacuum 清理; xmin/xmax 8 字节决定一切
2. **WAL + Checkpoint** — 崩溃恢复的标准范式, FPI (Full Page Image) 防止 partial write
3. **RBO + CBO 分层** — 简单查询快 (规则), 复杂查询智能 (基于成本), 统计信息是命脉

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `access/heap/heapam.c:heap_insert` | xmin/xmax 标记 + WAL 先写 + FSM 复用 page |
| 2 | `access/heap/heapam.c:heapgettup` | MVCC 可见性 + 跨 page pin/unpin + HOT update 链 |
| 3 | `access/index/indexam.c:index_bulk_delete` | VACUUM 死索引 entry + pinned page 跳过 + lazy 模式 |
| 4 | `executor/executor.c:ExecutorRun` | 三阶段生命周期 + snapshot 决定可见性 + per-tuple 返回 |
| 5 | `parser/parse_agg.c:parseAggregates` | GROUP BY 严格检查 + HAVING 别名 + 嵌套聚合禁止 |

---

## ⚡ 性能数字（PG 15, 单实例 1M 行测试）

| 场景 | 操作 | 延迟 | 加速比 |
|------|------|------|--------|
| 单行 INSERT (含 fsync) | DML | ~0.3ms | 1x |
| 批量 COPY 1M 行 | COPY | ~2s | 500k 行/s |
| 单行 SELECT (B-Tree 命中) | DQL | ~0.05ms | 1x |
| 全表扫 SELECT * (1M 行) | DQL | ~1.5s | 660k 行/s |
| 全表扫 (缓存命中) | DQL | ~0.1s | 15x 快 |
| 范围扫 id BETWEEN 1k-2k | DQL | ~0.5ms | 索引 + 1000 heap fetch |
| count(*) (1M 行) | 聚合 | ~50ms | simple agg |
| GROUP BY 10 类 | 聚合 | ~150ms | hash agg |
| count(DISTINCT) | 聚合 | ~500ms | hash distinct |
| VACUUM 全表 (1M 死) | DDL | ~5s | bulk delete 索引 |
| REINDEX | DDL | ~10s | 重写索引 |
| 单事务 commit (sync=on) | commit | ~5-10ms (HDD) | fsync 主导 |
| 单事务 commit (sync=on) | commit | ~0.5-1ms (SSD) | 10x 快 |
| 单事务 commit (sync=off) | commit | ~0.05ms | 100x 快 (但有丢数据风险) |
| CREATE INDEX (1M 行) | DDL | ~5s | B-Tree 构建 |
| HOT update (索引未变) | DML | ~2x 快 | 节省索引项 |

**结论**: COPY 500k 行/s 是单盘单实例上限; 同步提交是延迟主因; 全表扫缓存命中能 15x 加速。

---

## 🌳 决策树：什么时候用什么索引

```
查询模式?
  │
  ├── 等值 + 范围 (id, age, created_at)
  │     │
  │     ├── 单列 → B-Tree
  │     └── 多列 + 经常用前 N 列 → 组合 B-Tree (列顺序关键)
  │
  ├── 多值包含 (JSONB, array, tsvector)
  │     │
  │     ├── JSONB → GIN (jsonb_path_ops)
  │     ├── array  → GIN
  │     └── 全文   → GIN (tsvector) 或 pg_trgm
  │
  ├── 空间数据 (geometry, geography)
  │     └── GiST (R-Tree) + PostGIS
  │
  └── 范围类型 (int4range, tsrange)
        └── GiST 或 SP-GiST
```

### 索引选择决策表

| 数据类型 | 查询类型 | 推荐索引 | 理由 |
|----------|---------|---------|------|
| 整数 / 文本 / 时间 | 等值/范围 | **B-Tree** | 默认, 通用 |
| JSONB | 路径查询 | **GIN (jsonb_path_ops)** | 倒排索引, 命中快 |
| 数组 | 包含 | **GIN** | 倒排 |
| 全文 | 模糊匹配 | **GIN (tsvector)** | 分词倒排 |
| 几何 | 包含/相交 | **GiST** + PostGIS | R-Tree |
| 时间序列 | 时序范围 | **BRIN** | 极小, 块级摘要 |
| 范围类型 | 包含/相交 | **SP-GiST** | 空间分区 |

---

## 🔧 4 个核心子系统

| 子系统 | 关键文件 | 职责 |
|--------|---------|------|
| **Parser** | `parser/` | SQL 文本 → Query 树 (Bison + Yacc) |
| **Planner/Optimizer** | `optimizer/` | Query 树 → Plan 树 (RBO + CBO) |
| **Executor** | `executor/` | Plan 树 → 结果集 (Volcano 模型) |
| **Storage** | `access/` | 堆表 + 索引 + WAL + buffer pool |

---

## 🚀 命令分组速查

### 连接 & 元信息
```sql
-- 连接
psql -h host -U user -d dbname
psql "postgresql://user:pass@host:5432/dbname"

-- 元信息
\l                  -- 列数据库
\dt                 -- 列当前 schema 表
\d+ table_name      -- 表结构详情
\di                 -- 列索引
\dv                 -- 列视图
\df                 -- 列函数
\du                 -- 列用户/角色
\conninfo           -- 当前连接信息
\dx                 -- 列已装扩展
```

### CRUD
```sql
-- 基础
CREATE TABLE t (id SERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
INSERT INTO t (name) VALUES ('foo') RETURNING id;
SELECT * FROM t WHERE id = 1;
UPDATE t SET name = 'bar' WHERE id = 1;
DELETE FROM t WHERE id = 1;

-- 事务
BEGIN;
UPDATE t SET name = 'x' WHERE id = 1;
SAVEPOINT sp1;
UPDATE t SET name = 'y' WHERE id = 2;
ROLLBACK TO sp1;
COMMIT;

-- CTE (WITH)
WITH recent AS (
    SELECT * FROM orders WHERE created_at > now() - interval '7 days'
)
SELECT user_id, count(*) FROM recent GROUP BY user_id;
```

### JSONB
```sql
-- 创建 JSONB 列
ALTER TABLE users ADD COLUMN attrs JSONB;

-- 查询
SELECT * FROM users WHERE attrs->>'city' = 'SF';
SELECT * FROM users WHERE attrs @> '{"city": "SF"}';  -- 包含
SELECT * FROM users WHERE attrs ? 'premium';          -- 键存在

-- 索引 (GIN)
CREATE INDEX idx_users_attrs ON users USING GIN (attrs jsonb_path_ops);

-- 聚合
SELECT jsonb_agg(row_to_json(t)) FROM t;
```

### 窗口函数
```sql
SELECT
    user_id,
    amount,
    row_number() OVER (PARTITION BY user_id ORDER BY created_at) AS rn,
    sum(amount) OVER (PARTITION BY user_id ORDER BY created_at) AS running_total,
    lag(amount, 1) OVER (PARTITION BY user_id ORDER BY created_at) AS prev_amount
FROM orders;
```

### 索引
```sql
-- B-Tree
CREATE INDEX idx_t_created ON t (created_at);
CREATE UNIQUE INDEX idx_t_email ON users (email);
CREATE INDEX idx_t_multi ON t (status, created_at DESC);  -- 多列, 顺序敏感

-- 部分索引
CREATE INDEX idx_t_active ON t (created_at) WHERE status = 'active';

-- 表达式索引
CREATE INDEX idx_t_lower_name ON t (lower(name));

-- GIN
CREATE INDEX idx_t_tags ON t USING GIN (tags);
CREATE INDEX idx_t_attrs ON t USING GIN (attrs jsonb_path_ops);

-- BRIN (大表极小索引)
CREATE INDEX idx_t_created_brin ON t USING BRIN (created_at);
```

### EXPLAIN
```sql
EXPLAIN SELECT * FROM t WHERE id = 1;
EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT * FROM t WHERE id = 1;
EXPLAIN (FORMAT JSON) SELECT * FROM t;  -- 编程用
```

### 性能监控
```sql
-- 慢查询
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;

-- 锁等待
SELECT * FROM pg_locks WHERE NOT granted;

-- 死元组
SELECT schemaname, relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC;

-- 索引使用
SELECT * FROM pg_stat_user_indexes ORDER BY idx_scan ASC;
```

### 备份
```bash
# 逻辑备份
pg_dump -h host -U user -d dbname > backup.sql
pg_dump -Fc -d dbname > backup.dump  # 自定义格式, 压缩
pg_dumpall > all.sql  # 全实例

# 恢复
psql -d dbname < backup.sql
pg_restore -d dbname backup.dump

# 物理备份 (PITR)
pg_basebackup -h host -D /backup -Fp -Xs -P
```

---

## ⚠️ 必避 7 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **不用索引** | 全表扫, 100 行扫 1000w | EXPLAIN 看 Seq Scan, 建合适索引 |
| **死元组不 vacuum** | 表越来越大, 查询越来越慢 | autovacuum 开启 + 调 scale_factor |
| **长事务** | tuple 死不掉, vacuum 没用 | 监控 idle_in_transaction_session_timeout |
| **过度索引** | 写慢, 内存爆 | pg_stat_user_indexes 找 idx_scan=0 的删 |
| **不用 EXPLAIN** | 慢在哪不知道 | 强制习惯: 任何新 SQL 跑 EXPLAIN ANALYZE |
| **大 OFFSET 分页** | LIMIT 1000000, 10 越扫越慢 | 用 keyset: WHERE id > 上一页最后id LIMIT 10 |
| **不调 autovacuum** | 死元组堆积, 表膨胀 | 调 vacuum_cost_limit + scale_factor |

### 5 个隐藏坑

- **synchronous_commit=on**: 默认安全, 慢; 高性能场景可 off (丢最后 N 事务)
- **shared_buffers 默认 128MB**: 太小, 应设 25% 内存
- **work_mem 默认 4MB**: 复杂 sort/hash 会落盘, 加大到 64MB+
- **checkpoint_segments 太小**: checkpoint 太频繁, 改 checkpoint_completion_target=0.9
- **统计不准**: 大量变更后 ANALYZE, 调 default_statistics_target=500

---

## 🔄 PG vs 类似方案决策树

```
需要 OLTP 关系型?
  │
  ├── 单机 + 极致简单 → SQLite (嵌入式) / DuckDB (OLAP)
  │
  ├── 严肃生产
  │     │
  │     强 SQL 标准 / 复杂查询 / JSONB / 扩展?
  │     ├── 是 → PostgreSQL (✓ 你的选择)
  │     └── 否 → MySQL / MariaDB
  │
  ├── 云托管 → AWS RDS / Aurora / Cloud SQL
  │
  ├── 分布式 / HTAP → TiDB / CockroachDB / YugabyteDB
  │
  └── OLAP 大宽表 → ClickHouse / Doris / Snowflake
```

### 简要对比

| 维度 | PostgreSQL | MySQL | SQLite |
|------|-----------|-------|--------|
| SQL 兼容性 | 高 (标准严格) | 中 (放宽) | 高 |
| JSONB | ✅ 极强 | ⚠️ 弱 | ❌ |
| 全文索引 | ✅ GIN | ⚠️ 弱 | ✅ FTS5 |
| GIS | ✅ PostGIS | ⚠️ 弱 | ✅ R*Tree |
| 扩展机制 | ✅ 强 (Hook) | ⚠️ 中 | ⚠️ 弱 |
| 主从复制 | ✅ 流/逻辑 | ✅ binlog | ❌ |
| 性能 (简单) | 1x | 1.2x | 5x (嵌入式) |
| 性能 (复杂) | 1x | 0.6x | 0.3x |
| License | PostgreSQL | GPL | Public Domain |

---

## 🧩 可复用模式

| 模式 | PG 怎么实现 | 我能用到哪 |
|------|------------|----------|
| **MVCC + 死元组清理** | xmin/xmax + vacuum | 任何需要"读不阻塞写"的存储 (消息队列, 时序) |
| **WAL + Checkpoint** | 顺序写日志, 后台刷脏 | 任何需要持久化的系统 (KV, 配置) |
| **CBO 优化器** | 统计信息 + 代价模型 | 任何查询引擎 (SQL, ES DSL) |
| **GiST 通用搜索树** | 扩展接口 + B-Tree/R-Tree/SDD | 任何"自定义索引结构" 需求 (图查询, 相似度) |
| **PL/pgSQL** | 内嵌过程语言 | 任何"数据库内业务逻辑" 场景 (触发器, 定时任务) |
| **LISTEN/NOTIFY** | 异步消息 | 任何"数据库事件触发" 需求 (缓存失效, 实时通知) |
| **Foreign Data Wrapper** | 跨库查询 | 任何"联邦查询" 需求 (跨 MySQL/ES/Mongo) |
| **逻辑复制** | pub/sub, slot-based | 任何"按表订阅变更" 需求 (CDC, 缓存同步) |

→ 模式 A-H 详细见 `deep-dive.md 专题 9-13`

---

## 📋 反思：PG 让我重新思考的 5 件事

1. **MVCC 是数据库的"宪法"**。xmin/xmax 这 8 字节决定一切, 死元组清理是代价。
2. **进程模型 = 简单 > 极致性能**。换可调试性, 1 进程 1 连接, 故障隔离好。
3. **WAL 是数据库的"日记"**。任何写之前都先记下, crash 不慌。代价是顺序写慢。
4. **优化器是"猜"**。统计信息越准, 猜得越对。定期 ANALYZE 救命。
5. **不要过早分库分表**。PG 单机能扛 5w TPS, 分库后一致性、JOIN、事务都崩。

---

## ✅ 我能马上用的 3 件事

- [ ] 用 `pg_stat_statements` + `auto_explain` 找慢 SQL
- [ ] 把所有 status='active' 的查询加 partial index
- [ ] 用 JSONB + GIN 替代多列, 简化 schema

---

## 🔗 跨项目引用

- `[[../01-etcd/README|etcd]]` — etcd 也用 WAL 思想, 类似 PG 的 redo log
- `[[../02-redis/README|Redis]]` — Redis 单线程 + 内存 vs PG 进程 + 磁盘
- `[[../03-kubernetes/README|K8s]]` — 云原生 PG Operator (Zalando / Crunchy)
- `[[../05-golang/README|Go]]` — pgx 是 Go 生态最佳 PG 驱动
- `[[../08-prometheus/README|Prom]]` — pg_exporter 抓 PG metrics
- `[[../10-vault/README|Vault]]` — Vault 动态 PG 凭证, 短期密码

---

## 📚 进一步阅读

- 源码: https://github.com/postgres/postgres
- 文档: https://www.postgresql.org/docs/
- 优化器: https://www.postgresql.org/docs/current/planner-optimizer.html
- MVCC 详解: http://www.interdb.jp/pg/pgsql05.html
- 实战书: 《PostgreSQL 修炼之道》《PostgreSQL 指南:内幕探索》《High Performance PostgreSQL》
- 类似项目: MySQL, MariaDB, CockroachDB, TiDB, YugabyteDB, SQLite
- `deep-dive.md` — 16 专题深度解析
- `code-snippets/` — 5 段必读代码 (110-160 行/段, 完整函数 + 多 WHY + 性能数据)
