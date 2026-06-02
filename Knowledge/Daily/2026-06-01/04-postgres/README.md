---
tags: [open-source, deep-dive, database, c, sql]
type: open-source-analysis
created: 2026-06-01
project_name: "postgres"
project_url: "https://github.com/postgres/postgres"
language: "C"
license: "PostgreSQL"
stars: 17000
parsed_date: 2026-06-01
category: "Database"
status: "completed"
steps_completed: "14/14"
---

# 开源项目深度解析｜PostgreSQL

> 关系数据库天花板：MVCC + 查询优化器 + 扩展机制

## 项目元信息

| 字段 | 值 |
|------|-----|
| 项目名 | PostgreSQL |
| 主语言 | C |
| License | PostgreSQL |
| Stars | 17k+ |
| 复刻难度 | ⭐⭐⭐⭐⭐⭐ |

---

## 0. 准备

```bash
git clone https://github.com/postgres/postgres.git  # 不用 --depth，要看历史
cd postgres && mkdir -p _analysis/{...}
```

**5 问**：
1. 解决什么？→ OLTP 强一致 + 丰富数据类型
2. 为什么 C？→ 历史 + 极致性能
3. 核心数据流？→ Client → Parser → Optimizer → Executor → Heap/WAL
4. 骨架？→ `src/backend/parser`、`optimizer`、`executor`、`storage`
5. 坑？→ 索引失效、autovacuum 配置、WAL 归档

---

## 1. Charter

| 字段 | 内容 |
|------|------|
| 一句话定位 | 最先进的开源关系数据库 |
| 核心问题 | 强一致 + 复杂查询 + 扩展性 |
| 目标用户 | 企业 OLTP、分析、数据平台 |
| 商业模式 | 开源 + 商业支持（多家厂商） |
| 复刻难度 | ⭐⭐⭐⭐⭐⭐ |

---

## 2. 框架

```
postgres/
├── src/
│   ├── backend/                    # 后端核心
│   │   ├── parser/                # SQL 解析
│   │   ├── optimizer/             # 查询优化（RBO + CBO）
│   │   │   ├── path/              # 路径选择
│   │   │   ├── plan/              # 计划生成
│   │   │   └── prep/              # 预处理
│   │   ├── executor/              # 执行器
│   │   ├── commands/              # DDL/工具命令
│   │   ├── storage/               # 存储管理
│   │   │   ├── buffer/            # 缓冲池
│   │   │   ├── file/              # 文件管理
│   │   │   ├── lmgr/              # 锁管理
│   │   │   └── page/              # 页管理
│   │   ├── access/                # 访问方法
│   │   │   ├── heap/              # 堆表
│   │   │   ├── index/             # 索引
│   │   │   │   ├── btree/         # ⭐
│   │   │   │   ├── hash/
│   │   │   │   └── gist/
│   │   │   └── tablesample/
│   │   ├── tcop/                  # 顶层控制
│   │   ├── utils/                 # 工具
│   │   ├── catalog/               # 系统表
│   │   ├── replication/           # 复制
│   │   └── postmaster/            # 主进程
│   ├── bin/                       # 客户端工具
│   ├── include/                   # 头文件
│   ├── interfaces/                # 接口（libpq 等）
│   └── pl/                        # 过程语言
└── contrib/                       # 扩展模块
```

**入口**：`src/backend/postmaster/postmaster.c`

---

## 3. 画像

| 维度 | 数据 |
|------|------|
| 代码行 | ~100 万 C |
| 贡献者 | 500+ |
| 月均提交 | ~100 |
| 主语言 | C 95% |
| 历史 | 30+ 年（1986 起） |

---

## 4. 架构

```
Client (libpq)
    ↓
Postmaster (主进程 fork)
    ↓
Backend Process (每连接 1 个)
    ↓
┌─────────────────────────────────┐
│ Parser → Analyzer → Rewriter    │
│      → Planner → Executor       │
└─────────────────────────────────┘
    ↓
Storage Manager
    ├── Buffer Pool
    ├── WAL Writer
    ├── Checkpointer
    ├── Background Writer
    └── Autovacuum
    ↓
Heap / Index / WAL Files
```

**关键进程**：
- `postmaster`：监听 + fork
- `backend`：每连接 1 个
- `bgwriter`：刷脏页
- `walwriter`：刷 WAL
- `autovacuum`：回收 dead tuple
- `checkpointer`：定期 checkpoint

---

## 5. 代码深度解析 ⭐

### 5.1 MVCC 实现

**文件**：`src/backend/access/heap/heapam.c`

```c
// 每个 tuple 都有 xmin/xmax
typedef struct HeapTupleFields {
    TransactionId t_xmin;    // 插入此版本的 tx
    TransactionId t_xmax;    // 删除此版本的 tx（0 = 未删除）
    CommandId   t_cid;
    TransactionId t_xvac;    // VACUUM 的 tx
} HeapTupleFields;
```

**为什么这样写**：
- 不覆盖写：UPDATE = 插入新版本 + 标记旧版本删除
- 读不阻塞写：每个事务看到的是自己 snapshot
- 代价：需要 VACUUM 回收 dead tuple

**借鉴**：
- 任何需要"读不阻塞写"的系统都该学 MVCC
- 但要配 vacuum/compaction 机制

### 5.2 WAL（Write-Ahead Log）

**文件**：`src/backend/access/transam/xlog.c`

**核心规则**：数据页写入前必须先写 WAL

```c
// XLogInsert 写 WAL 记录
XLogRecPtr XLogInsert(RmgrId rmid, uint8 info, XLogRecData *rdata);

// 由 walwriter 异步刷盘
// LSN 是单调递增的日志位置
```

**为什么这样写**：
- 崩溃恢复：只重放 WAL 就能恢复到一致状态
- 复制：备库订阅 WAL
- 借鉴：所有关键数据系统都该有 WAL

### 5.3 查询优化器

**文件**：`src/backend/optimizer/`

**5 个阶段**：
1. **Parser**：SQL → 语法树
2. **Analyzer**：绑定表/列 → parsed query
3. **Rewriter**：应用 rules/views
4. **Planner**：生成最优 plan
5. **Executor**：执行 plan

**Planner 内部**：
```c
// 核心流程
grouping_planner()
  → query_planner()
    → setup_simple_rel_arrays()
    → add_base_rels_to_query()
    → make_one_rel()
      → standard_join_search()
        → make_rels_by_clause_joins()
        → generate_join_implied_equalities()
        → join_search_one_level()
        → make_rel_from_joinlist()
  → apply_pathtojoin()
  → create_plan()
  → create_modifytable_plan()  // INSERT/UPDATE/DELETE
```

**RBO + CBO 混合**：
- 简单查询走 RBO（规则）
- 复杂查询走 CBO（成本）
- 借鉴：业务系统的查询模块也该分层

### 5.4 B-Tree 索引

**文件**：`src/backend/access/nbtree/`

**核心算法**：
- `btinsert`：插入
- `btbulkdelete`：批量删除
- `_bt_split`：页分裂

**为什么选 B+Tree**：
- 范围查询 O(log n)
- 顺序读友好（叶子节点链表）
- 高扇出 → 树高低 → IO 少

---

## 6. 运行

```bash
./configure --prefix=/usr/local/pgsql
make
make install

# 初始化
initdb -D /var/lib/pgsql/data

# 启动
pg_ctl -D /var/lib/pgsql/data -l logfile start

# 连接
psql -d postgres
```

**Smoke test**：
```sql
CREATE TABLE t(id int, name text);
INSERT INTO t VALUES (1, 'foo');
SELECT * FROM t;
EXPLAIN ANALYZE SELECT * FROM t WHERE id = 1;
```

---

## 7. 演进

| 阶段 | 时间 | 关键 |
|------|------|------|
| 1986 | POSTGRES | Michael Stonebraker |
| 1995 | Postgres95 | SQL 支持 |
| 1996 | PostgreSQL 6.0 | 开源 |
| 2005 | 8.0 | Windows 支持 |
| 2010 | 9.0 | 流复制 |
| 2014 | 9.4 | JSONB |
| 2017 | 10 | 逻辑复制 |
| 2020 | 13 | B-tree dedup |
| 2024 | 17 | 增量备份优化 |

---

## 8. 质量

| 维度 | 数据 |
|------|------|
| 单测 | 回归测试 200+ |
| 集成测试 | make check + isolation tests |
| CI | CircleCI + GitHub Actions |
| 模糊测试 | AFL 长期跑 |
| 性能 | pgbench 标准测试 |

---

## 9. 依赖

无外部运行时依赖。全部自实现。

---

## 10. 生产实践

| 实践 | 怎么做 |
|------|--------|
| 连接池 | PgBouncer |
| 备份 | pg_dump / pg_basebackup |
| PITR | WAL 归档 + 恢复 |
| 主从 | 流复制 |
| 高可用 | Patroni / Stolon |
| 监控 | pg_stat_statements + pgwatch2 |
| 慢查询 | log_min_duration_statement |
| 索引维护 | REINDEX CONCURRENTLY |
| 表膨胀 | pg_repack |

---

## 11. 社区

- PostgreSQL Global Development Group
- 邮件列表驱动
- 每年 PGConf

---

## 12. 教训

### 必偷 3 件
1. **MVCC**：读不阻塞写（+ vacuum 机制）
2. **WAL**：先写日志再写数据
3. **RBO + CBO 混合优化器**：分层查询优化

### 必避 3 坑
1. **长事务**：导致 tuple 膨胀
2. **autovacuum 关闭**：必崩
3. **不分析就 EXPLAIN**：慢查询排查第一步

### 7 天复刻
```
D1: 启动 + 基础 SQL
D2: 读 heapam.c MVCC
D3: 读 xlog.c WAL
D4: 读 optimizer/planner.c
D5: 读 nbtinsert B-Tree
D6: 写个 mini-SQL（只支持 SELECT）
D7: 写博客
```

### 打分（5/5/5/5/5）

---

## 13. 学习卡片

### 《PostgreSQL》学习卡片

#### 一句话价值
> 关系数据库**学术与工程的完美结合**，MVCC/WAL/Optimizer 教科书实现。

#### 3 个洞察
1. **MVCC + Vacuum**：读不阻塞写，但需要定期清理
2. **WAL + Checkpoint**：崩溃恢复的标准范式
3. **RBO + CBO 分层**：简单查询快，复杂查询智能

#### 5 段必读代码
1. `heapam.c:heap_insert` — MVCC 插入
2. `xlog.c:XLogInsert` — WAL 写入
3. `planner.c:grouping_planner` — 优化器入口
4. `nbtinsert.c:btinsert` — B-Tree 插入
5. `postmaster.c:PostmasterMain` — 主进程

#### 反模式
- 早期 hash 索引无 WAL → 崩溃不一致 → 后来加 WAL

#### 可复用模式
- WAL 模式 → 任何需要持久化的系统

#### 马上用 3 件事
1. [ ] 学习 MVCC 模式设计文档系统
2. [ ] 在业务系统引入 WAL 审计日志
3. [ ] 用 EXPLAIN ANALYZE 优化慢查询

---

## 🏷️ 标签

`#开源项目` `#深度解析` `#PostgreSQL` `#MVCC` `#WAL` `#数据库` `#C`

## 🔗 关联笔记

- [[开源项目深度解析体系]]
- [[每日开源项目抓取任务]]
- [[etcd-深度解析]]
- [[MySQL-索引原理]]
