# PostgreSQL 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：进程模型 vs 线程模型

### Postgres 的"进程 per 连接"
```
Connection 1 ─→ Backend Process 1 (独立内存, 独立变量)
Connection 2 ─→ Backend Process 2
Connection 3 ─→ Backend Process 3
```
**优点**：
- 完全隔离，一个连接崩不影响别人
- 无锁读 / 写（每进程独立 buffer）
- 模型简单

**缺点**：
- 万连接 = 万进程 = 内存爆炸
- 连接切换 context switch 重

### 解决：PgBouncer
- 连接池前置，1w 客户端 → 100 真实连接
- 3 种模式：session / transaction / statement

### MySQL 相反
- 1 进程多线程（thread per connection）
- 上下文快，但共享 buffer 需加锁
- 经典 thread_cache + thread_pool 调优

---

## 专题 2：MVCC 深度 — 不锁的并发控制

### 核心思想
**写不覆盖，读不阻塞写**
- INSERT：追加 tuple，设 xmin = 当前 xid
- DELETE：设 xmax = 当前 xid (tuple 还在 page)
- UPDATE：等价于 DELETE + INSERT (新 tuple)

### tuple 头 23 字节
```
t_xmin      (4B)  插入事务 ID
t_xmax      (4B)  删除事务 ID (0 = 未删)
t_cid       (4B)  命令 ID (嵌套事务用)
t_infomask2 (2B)  属性数 + 标志
t_infomask  (2B)  可见性标志
t_hoff      (1B)  头到数据偏移
...
```

### 可见性判断

---

## 专题 11：MVCC 深度 — xmin/xmax 的 8 字节决定一切

### 头结构详解
```
HeapTupleHeaderData (23 字节)  ← 所有 PG tuple 都带这个
  ├── t_xmin    (4 字节)  谁插入 (TransactionId)
  ├── t_xmax    (4 字节)  谁删除 / 锁定 (0=未删)
  ├── t_cid     (4 字节)  命令 ID (同事务内)
  ├── t_infomask2 (2 字节)  属性数 + HOT flag
  ├── t_infomask  (2 字节)  可见性 hint
  ├── t_hoff     (1 字节)  header 长度
  └── (NULL bitmap + user data)
```

### 可见性判断 5 种状态
```
HeapTupleSatisfiesMVCC:
  ├── t_xmin == current xact && t_cid < cid && t_xmax invalid
  │     → 可见 (本事务插入的)
  ├── t_xmin 已提交 && t_xmax invalid
  │     → 可见 (正常)
  ├── t_xmin 已提交 && t_xmax 是自己 && cmax >= cid
  │     → 可见 (UPDATE 后再 SELECT, 看新版本)
  ├── t_xmin 已回滚 / 未提交
  │     → 不可见
  └── t_xmin 已提交 && t_xmax 已提交
        → 不可见 (被删/被改)
```

### HOT (Heap-Only Tuples) 优化详解
- **触发条件**:
  1. UPDATE 不修改索引列
  2. 新版本能放同 page (page 有空间)
- **优化机制**:
  - 不动索引 (B-Tree entry 不变)
  - 新版本走 t_ctid 链 (t_ctid 指向下一个版本)
  - index_getnext 拿原 TID, heap_hot_search 跟链
- **代价**:
  - UPDATE 链长, 走到底慢
  - VACUUM 要清整条链
- **性能**: 走 HOT 比常规 UPDATE 快 2-3x

### VACUUM 三种模式
| 模式 | 作用 | 代价 | 频率 |
|------|------|------|------|
| **VACUUM** | 标记死 tuple 可复用, 不回收 | 低 (后台运行) | autovacuum 默认 |
| **VACUUM FULL** | 重写表, 实际回收空间 | 高 (排他锁) | 手动, 限夜间 |
| **autovacuum** | 守护进程, 自动 VACUUM + ANALYZE | 低 | 默认每分钟检查 |

### 死 tuple 何时能清
- `t_xmax` 提交后 → 死 tuple, VACUUM 标记 LP_UNUSED
- LP_UNUSED 位置可被新 INSERT 复用
- VACUUM FULL 才会真清掉, 表文件变小

### visibility map 加速
- VM 是 1 bit/page, 0=有死 tuple, 1=全可见
- index-only scan 靠 VM 判断, 不进 heap
- VACUUM 负责更新 VM

---

## 专题 12：WAL + Checkpoint 崩溃恢复深度

### WAL 写什么
- **Heap 表 INSERT/UPDATE/DELETE**: 记 tuple 完整内容
- **索引变更**: B-Tree 分裂 / 页面重组
- **COMMIT/ABORT**: 记事务结束标志
- **CLOG (Commit Log)**: xact 提交状态 (pg_xact/)

### WAL 写流程 (7 步)
```
1. XLogBeginInsert()  → 开始组装 WAL record
2. XLogRegisterBuffer(rdata, buffer)  → 注册 page
3. XLogRegisterData(rdata, data)  → 注册数据
4. XLogInsert(RM, info)  → 生成 record, 复制到 WAL buffer
5. XLogFlush()  → 刷盘 (xlog 顺序写)
6. 拿到 LSN, 写回 page header (PageSetLSN)
7. 释放 lock, 事务 commit
```

### FPI (Full Page Image) 详解
- **背景**: crash 时 page 可能 partial write (16KB 写一半, 8KB 文件系统块不一致)
- **解决**: checkpoint 后第一次改 page, WAL 记整个 8KB
- **代价**: WAL 写 100x 放大 (8KB vs 80 字节)
- **优化**:
  - wal_compression = on (zstd 压缩, 1.5x 减小)
  - initdb 时调 FPI 阈值
  - 加大 checkpoint_interval 减少 FPI 频率

### Checkpoint 三件事
1. **刷脏页**: shared_buffers → OS cache
2. **写 WAL**: `XLOG_CHECKPOINT_SHUTDOWN` 或 `XLOG_CHECKPOINT_ONLINE`
3. **更新 CLOG control file**: 指明 crash 后从哪儿开始 REDO

### recovery 模式
- **archive_mode = on**: WAL 归档到独立磁盘 (PITR)
- **restore_command**: 恢复从基础备份 + WAL
- **recovery_target_time / xid / name**: 恢复到指定点

### WAL 配置决策表
| 场景 | synchronous_commit | wal_compression | checkpoint_timeout |
|------|---------------------|------------------|---------------------|
| 金融 / 不能丢 | on | on | 15min |
| 普通业务 | on | on | 5min |
| 性能优先 (可丢) | off | on | 5min |
| 流复制热备 | on (主) | on | 5min |

---

## 专题 13：优化器深度 — 代价模型 + 统计信息

### 4 层优化器架构
```
1. Parser  → parse tree (SQL 文本)
2. Analyzer → Query tree (语义分析)
3. Rewriter → 规则改写 (view, RLS, 规则)
4. Planner/Optimizer → Plan tree
   ├── Preprocessing (常量折叠, 子查询提升)
   ├── RBO (rule-based, 语法级)
   ├── CBO (cost-based, 统计信息)
   └── Plan choice
```

### CBO 代价公式
```
总代价 = 启动代价 + 行数 × (CPU 代价 + IO 代价)

启动代价: 排序前 / 哈希前的准备
CPU 代价: 0.01 (元组处理)
IO 代价:
  - 顺序页: 1.0
  - 随机页: 4.0
  - CPU 元组: 0.01
  - 索引: 比较代价 0.005
```

### 统计信息 4 类
- **pg_class**: reltuples (行数估计), relpages (页数)
- **pg_statistic**: 列直方图, MCV (Most Common Values), distinct 计数
- **pg_stats**: 视图, 可读
- **扩展**: `CREATE STATISTICS` 跨列统计 (解决单列不准)

### 何时 ANALYZE
- 大量变更后 (10% 行变)
- 调 default_statistics_target (默认 100, 加大到 500 更准)
- 定时任务: `pg_cron` / cron 调 `ANALYZE`

### 计划节点 8 种
| 节点 | 作用 | 代价 |
|------|------|------|
| **Seq Scan** | 全表扫 | O(N) |
| **Index Scan** | 索引 + heap fetch | O(logN + K) |
| **Index Only Scan** | 索引, 不进 heap | O(logN + K) |
| **Bitmap Index Scan** | 索引 + bitmap + heap | O(logN + K) |
| **Hash Join** | 小表建 hash, 大表探 | O(M + N) |
| **Merge Join** | 两表都排序, 归并 | O(M logM + N logN) |
| **Nested Loop** | 嵌套, 适合小驱动 | O(M × N) |
| **Aggregate** (Hash/Sort) | 分组聚合 | O(N) |

### EXPLAIN 阅读 4 步
1. **看 total cost**: 总代价估计
2. **看 actual rows vs estimated**: 偏离大 = 统计不准
3. **看 shared/local hit/read**: 缓存命中 vs 磁盘读
4. **看 loops**: 嵌套循环执行次数

---

## 专题 14：进程模型 + 内存架构

### Postmaster 进程树
```
postmaster (主进程, 监听端口)
  ├── logger (syslog)
  ├── checkpointer (checkpoint)
  ├── bgwriter (刷脏页)
  ├── walwriter (WAL 刷盘)
  ├── autovacuum launcher (启动 N 个 worker)
  ├── autovacuum worker (默认 3 个)
  ├── stats collector (累积统计)
  └── backend (每连接 1 个, 1 进程 1 线程)
       ├── pgx 连接
       └── 独立 memory context
```

### 为何不用线程模型
- **简单**: 1 进程 1 连接, 故障隔离 (1 崩不影响他人)
- **稳定**: PG 古老时代 (1995) 线程支持弱
- **可调试**: gdb 直接 attach, 看 stack 简单
- **代价**: 进程创建慢 (fork 2ms), 内存不共享 (上下文切换慢)

### 内存架构 3 层
1. **shared memory** (shared_buffers): 缓存 page, 全 backend 共享
2. **process local**: backend 私有, 临时排序 / 哈希
3. **temp file**: 内存不够落盘 (pgsql_tmp)

### 关键内存参数
| 参数 | 默认 | 推荐 | 作用 |
|------|------|------|------|
| shared_buffers | 128MB | 25% 内存 | 缓存 page |
| work_mem | 4MB | 64MB+ | sort/hash 内存 |
| maintenance_work_mem | 64MB | 1GB | VACUUM/INDEX |
| effective_cache_size | 4GB | 75% 内存 | 优化器假设 |
| huge_pages | try | try | 大页, 性能 + |

---

## 专题 15：扩展机制 + 高级特性

### 7 大扩展方向
1. **数据类型**: PostGIS (几何), pg_trgm (三字符), hstore (KV)
2. **索引方法**: GiST, GIN, SP-GiST, BRIN
3. **函数语言**: PL/pgSQL, PL/Python, PL/Perl, PL/v8 (JS)
4. **钩子**: pg_stat_statements, auto_explain, pgaudit
5. **FDW**: postgres_fdw, mysql_fdw, mongo_fdw
6. **复制**: 逻辑复制 (pub/sub), 物理流复制
7. **钩子扩展**: pg_cron, pg_partman, pg_prewarm

### 常用扩展列表
| 扩展 | 用途 | 是否 PG 内置 |
|------|------|-------------|
| pg_stat_statements | 慢查询 | 内置 (需 CREATE EXTENSION) |
| auto_explain | 自动 EXPLAIN | 内置 |
| pgcrypto | 加密函数 | 内置 |
| uuid-ossp | UUID 生成 | 内置 |
| hstore | KV 类型 | 内置 |
| PostGIS | 几何 / 地理 | 第三方 |
| pg_trgm | 三字符模糊 | 内置 |
| pg_cron | 定时任务 | 第三方 |
| pg_partman | 分区管理 | 第三方 |
| pgaudit | 审计 | 第三方 |

### 逻辑复制 vs 物理复制
| 维度 | 逻辑 | 物理 |
|------|------|------|
| 粒度 | 表级 | 整个实例 |
| 版本 | 跨大版本可 | 同版本 |
| DDL | 不复制 | 复制 |
| 双向 | 支持 (但冲突) | 不支持 |
| 性能 | 中等 | 接近物理 |

### LISTEN/NOTIFY 异步消息
```sql
-- 订阅方
LISTEN channel_name;

-- 发布方
NOTIFY channel_name, 'payload';

-- 实际: pg_listener 表 + 异步唤醒 backend
-- 适合: 缓存失效, 实时通知
```

---

## 专题 16：PG 跨项目引用 / 反模式

### 上游依赖
- **PG 没有外部依赖**, 除 libc / libssl / libz
- 可以静态链接, 适合嵌入式

### 下游生态
- **pgx (Go)**: 最佳 Go 驱动
- **psycopg2 (Python)**: 事实标准
- **node-postgres**: Node 生态
- **JDBC (Java)**: 标准 JDBC
- **npgsql (C#)**: 最佳 .NET 驱动

### 5 个必避反模式
1. **不调 autovacuum**: 表胀到 GB, 查询变秒级
2. **不 EXPLAIN**: 上线后才发现慢 SQL
3. **业务逻辑全放应用层**: 复杂 JOIN + 事务 都在 DB 外? 反 PG
4. **不调参数**: 默认参数 适合开发, 不适合生产
5. **不用主键 / 用 UUID 主键**: heap 顺序写变成随机写, B-Tree 退化

### 跨项目对照表
| 项目 | PG 怎么用 | 关键点 |
|------|----------|--------|
| **etcd** | PG 不是 etcd, 但用类似 Raft 思想 | WAL + checkpoint |
| **Redis** | PG 持久化 + 复杂查询, Redis 缓存 | PG 是 backing store |
| **K8s** | 云原生 Operator 部署 | StatefulSet + PVC |
| **Go** | pgx 驱动, sqlx / GORM | 原生类型映射 |
| **vLLM** | 存对话历史 + 知识库 | PG 复杂查询 vs 向量库 |
| **Prom** | pg_exporter 抓 metrics | 死元组 / 索引命中 |
| **Vault** | 动态 PG 凭证, 短期密码 | TTL 自动 DROP USER |

### "如果我重来一次, 我会先学 PG"
PG 不只是数据库, 是数据平台:
- JSONB + GIN: 不需要 Mongo
- PostGIS: 不需要专门的 GIS
- pg_trgm: 不需要 ES (小型场景)
- LISTEN/NOTIFY: 简单的 pub/sub
- 逻辑复制: 简单的 CDC

### "PG 解决不了什么问题"
- **极致写入**: 单盘 PG ~10w TPS, 比 Redis 慢 100x
- **超大规模**: 单机 ~5TB, 需分区 / 分库
- **分布式事务**: 跨实例事务需要第三方 (CockroachDB, Yugabyte)
- **OLAP 大宽表**: 列存 ClickHouse 更快

### VACUUM 必要性
- UPDATE/DELETE 留"死元组"在 page
- VACUUM 回收死元组空间
- AUTOVACUUM：默认开启
- 死元组率高 → 表膨胀 → 性能下降

### 隔离级别
- **READ COMMITTED**（默认）：每个 statement 拿新 snapshot
- **REPEATABLE READ**：txn 拿一次 snapshot，全程不重读
- **SERIALIZABLE**：SSI (Serializable Snapshot Isolation)，检测写冲突

---

## 专题 3：查询优化器 — Volcano + 代价

### 优化器架构
```
SQL 文本
   ↓ parser
parse tree
   ↓ analyzer
Query (semantic tree)
   ↓ rewriter
Query (重写规则: 子查询上提, 视图合并, ...)
   ↓ planner
Plan (Scan/Join/Aggregate/...)
   ↓ executor
结果
```

### 关键算法：CBO (Cost-Based Optimizer)
- 算每个 plan 节点的 cost = 启动 cost + 总 cost
- cost = seq_page_cost × 读 page 数 + cpu_tuple_cost × 元组数
- 嵌套搜索：用 dynamic programming / GEQO (遗传算法)
- 统计信息：pg_stats (analyze 收集)

### Volcano 执行器
```
Result
  ├── HashAggregate
  │     └── HashJoin
  │           ├── SeqScan (A)
  │           └── SeqScan (B)
  └── Limit
```
- 每个节点有 3 方法：Init / NextTuple / End
- 拉模式（pull）：上层向下层拉
- 内存常驻：1 个 tuple
- 优化：向量化 (Vectorized Exec) — 一次处理一批

---

## 专题 4：WAL 与 Checkpoint

### WAL（Write-Ahead Log）
```
                  Page → Disk (脏页)
                   ↑
            buffer pool
                   ↑
        WAL → Disk (每次 commit)
```
- 写 tuple 前先写 WAL
- commit 时刷 WAL 到磁盘
- crash 后：从 checkpoint 开始的 WAL replay 恢复

### Checkpoint
- 周期把 buffer pool 的脏页刷到磁盘
- 默认：`checkpoint_timeout = 5min`, `max_wal_size = 1GB`
- crash recovery 时间 = 上次 checkpoint 到 crash 的 WAL replay

### LSN（Log Sequence Number）
- 64 位单调递增
- WAL 文件按 16MB 切分
- pg_lsn 类型显示：`0/16D6090`

### 流复制
- 主库 WAL → 从库
- 从库 replay
- 同步/异步：`synchronous_commit`

---

## 专题 5：5 段必读代码逐段详解

### 5.1 `heapam.c:heap_insert` — MVCC 写路径
**关键**：t_xmin = 当前 xid + WAL
- 写 heap 前先 WAL log
- crash 后从 WAL replay
- 走 FSM 找空 page

### 5.2 `heapam.c:HeapTupleFields` — tuple 头
**关键**：xmin/xmax 是可见性判断的唯一依据
- 23 字节头：5 字段 (xmin/xmax/cid/info/hoff)
- HEAP_HASOID 等标志位
- infomask 标记 (xmin_committed, xmax_invalid 等)

### 5.3 `executor.c:ExecutorRun` — Volcano 主循环
**关键**：拉模式迭代器
- 内存省，但大结果集函数调用多
- 14 版本: 增量排序 + 并行 hash join

### 5.4 `indexam.c:IndexBuildHeap` — 索引构建
**关键**：build 时拿 snapshot, 完成后索引原子生效
- 用 snapshot 防 build 期间漏行
- btree bulk insert 走 BT_WRITE

### 5.5 `parse_agg.c:parse_agg_clause` — 聚合解析
**关键**：静态检查 + 优化器 hint
- 不允许嵌套
- 提前挂 AggRef 节点
- GROUP BY 校验

---

## 专题 6：性能调优

### 内存相关（最重要）
```sql
-- 共享内存
shared_buffers = 4GB  -- 通常 25% 物理内存
huge_pages = try

-- 单连接
work_mem = 64MB        -- 排序/hash 用
maintenance_work_mem = 1GB  -- VACUUM/INDEX 用
```

### 磁盘
```sql
-- WAL
wal_buffers = 16MB
checkpoint_completion_target = 0.9
max_wal_size = 4GB

-- 随机 I/O
effective_io_concurrency = 200  -- SSD 设高
random_page_cost = 1.1          -- SSD vs seq 差不多
```

### 连接
```sql
max_connections = 200     -- 别太大, 用 pgbouncer
```

### 监控
```sql
-- 关键视图
pg_stat_activity        -- 当前查询
pg_stat_user_tables     -- 表级统计
pg_stat_user_indexes    -- 索引使用
pg_locks                -- 锁
pg_stat_statements      -- SQL 统计
```

---

## 专题 7：故障模式 + 应急

### F1：表膨胀
```sql
-- 检测
SELECT relname, n_dead_tup, n_live_tup
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000;

-- 处理
VACUUM (VERBOSE, ANALYZE) table_name;
-- 极端情况
VACUUM FULL table_name;  -- 锁表, 慎用
pg_repack                -- 在线 repack
```

### F2：长事务
```sql
-- 找长事务
SELECT pid, age(now(), xact_start), state, query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start LIMIT 10;

-- 杀掉
SELECT pg_terminate_backend(pid);
```

### F3：锁等待
```sql
-- 找阻塞
SELECT bl.pid AS blocked_pid, bl.usename, bl.query,
       kl.pid AS blocking_pid, kl.usename, kl.query
FROM pg_stat_activity bl
JOIN pg_locks l ON l.pid = bl.pid
JOIN pg_stat_activity kl ON kl.pid = ANY(pg_blocking_pids(bl.pid));
```

### F4：WAL 堆积
```bash
# 症状: pg_xlog 大
ls -la /var/lib/postgresql/data/pg_wal
# 处理:
# 1. 调大 max_wal_size
# 2. 强制 checkpoint
psql -c "CHECKPOINT;"
# 3. 归档回收
pg_archivecleanup /path/to/wal archived_wal_name
```

### F5：连接爆满
```bash
# 症状: FATAL: remaining connection slots are reserved
# 应急:
# 1. 查连接来源
SELECT usename, state, count(*)
FROM pg_stat_activity GROUP BY 1,2;
# 2. 杀空闲
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle' AND query_start < now() - interval '10 min';
# 3. 长期: 上 pgbouncer
```

---

## 专题 8：复用模式

### 模式 A：进程隔离
**场景**：多租户 SaaS、不稳定插件
- 沙箱 / 隔离 / 不共享 buffer

### 模式 B：MVCC 写不覆盖
**场景**：业务需要"时间旅行"
- 订单历史不丢
- 文档版本回滚

### 模式 C：WAL + Checkpoint
**场景**：写多读少的高可靠存储
- 财务流水 / 消息持久化
- 周期 checkpoint 防止 replay 过久

### 模式 D：Volcano 迭代器
**场景**：流式数据处理
- ELT 工具（dbt / datafusion）
- 用户态执行器

---

## 专题 9：实战部署拓扑

### 单实例
```
┌──────────┐
│ App      │ ──→ Postgres:5432
└──────────┘
```
**适用**：开发
**风险**：单点

### 主从
```
     ┌──────────┐
     │ Master   │ ─── 流复制 ───→ ┌──────────┐
     │ RW       │                │ Replica  │
     └──────────┘                │ RO       │
                                 └──────────┘
```
**读扩展**：read 走 replica
**写**：单 master（PG 16+ logical replication 多 master）

### HA + 故障转移
- **Patroni** + etcd：自动选主
- **PgBouncer**：连接池
- **HAProxy**：VIP 切换
- **pgBackRest**：备份恢复

### 分片（Citus）
- 单 master 写瓶颈时
- Citus 扩展做 sharding
- 按主键 hash 分片

---

## 专题 10：Postgres 让我重新思考的 5 件事

1. **MVCC 是数据库的"宪法"**。xmin/xmax 这 8 字节决定一切。
2. **进程模型 = 简单 > 极致性能**。换可调试性。
3. **WAL 是数据库的"日记"**。任何写之前都先记下，crash 不慌。
4. **优化器是"猜"**。统计信息越准, 猜得越对。定期 ANALYZE 救命。
5. **不要过早分库分表**。PG 单机能扛 5w TPS，分库后一致性、JOIN、事务都崩。

---

## 🔗 进一步阅读

- 源码：https://github.com/postgres/postgres
- 文档：https://www.postgresql.org/docs/
- 优化器：https://www.postgresql.org/docs/current/planner-optimizer.html
- MVCC 详解：http://www.interdb.jp/pg/pgsql05.html
- 实战书：《PostgreSQL 修炼之道》、《PostgreSQL 指南：内幕探索》
