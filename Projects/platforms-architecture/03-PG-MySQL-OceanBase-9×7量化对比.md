---
title: PostgreSQL vs MySQL vs OceanBase · 9×7 节点量化对比
tags: [数据库/对比/PostgreSQL/MySQL/OceanBase/9×7]
created: 2026-06-25
updated: 2026-06-25
status: 对比完成
versions: [PostgreSQL 16, MySQL 8.0, OceanBase 4.x]
parent: 00-数据库开发全流程-极致深度框架-9×7矩阵.md
---

# PostgreSQL vs MySQL vs OceanBase · 9×7 节点量化对比

> **目的**:在 9×7 矩阵每个节点上,**量化对比三大主流数据库**的能力差异,为 AI 直播平台选型提供依据。
> **对比原则**:每节点给 3 个数据库的具体值/语法/参数,**避免定性比较**。
> **适用阶段**:Phase 0/1 选型决策 + Phase 2 分布式扩展。

---

## 总览对比表

| 维度 | PostgreSQL 16 | MySQL 8.0 | OceanBase 4.x |
|------|-------------|----------|---------------|
| 架构 | 单机主从 | 单机主从 | 原生分布式(Paxos) |
| 单库最大容量 | ~10TB(实用) | ~1TB(实用) | PB 级 |
| 单表最大行数 | 32TB / 表 | 64TB / 表 | 无限(分区) |
| 横向扩展 | 弱(需分库分表) | 弱 | 强(原生) |
| SQL 标准兼容度 | **最高**(~95%) | 中(~70%) | 高(兼容 MySQL+Oracle) |
| 复制延迟 | 0(同步流复制) | 0.1-1s | 0(Paxos) |
| 默认隔离级别 | READ COMMITTED | REPEATABLE READ | READ COMMITTED |
| 默认字符集 | UTF8 | utf8mb4 | utf8mb4 |

---

## A 列：库表结构(结构 / 字段 / 字节)对比

### A1 数据类型支持

| 类型需求 | PostgreSQL | MySQL | OceanBase |
|---------|-----------|-------|-----------|
| JSONB | ✅ `JSONB` 二进制 + 索引 | ⚠️ `JSON` 文本(8.0 部分优化) | ⚠️ `JSON`(转 TEXT) |
| 数组 | ✅ `INT[]` / `TEXT[]` 原生 | ❌ 无 | ❌ 无 |
| 范围类型 | ✅ `int4range` / `tsrange` | ❌ 无 | ❌ 无 |
| UUID | ✅ `uuid` 16B | ✅ `BINARY(16)` 16B | ✅ `BINARY(16)` |
| 地理信息 | ✅ `PostGIS`(顶级) | ⚠️ 基础 | ❌ 无 |
| 全文检索 | ✅ `tsvector + GIN` | ✅ `FULLTEXT`(差) | ⚠️ 弱 |

**AI 直播场景选型**:
- ✅ **推荐 PG**:需要 JSONB 商品属性、数组标签、PostGIS 地理位置
- ✅ **可 OB**:仅基础结构,OB 类型较弱
- ⚠️ **慎用 MySQL**:JSON 不够灵活

### A2 主键与自增

| 方案 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| 自增主键 | `BIGSERIAL`(8B)/`IDENTITY` | `BIGINT AUTO_INCREMENT` | `BIGINT AUTO_INCREMENT` |
| UUID | `gen_random_uuid()` | `UUID()` | `UUID()` |
| 雪花 ID | 应用层实现 | 应用层实现 | 应用层实现 |
| 全局唯一(分布式) | ❌ 需应用层 | ❌ 需应用层 | ✅ `AUTO_INCREMENT` 跨机全局唯一 |

**AI 直播选型**:
- Phase 0 MVP:三选一均可
- Phase 1 规模化:**OB 原生全局唯一**省一个雪花服务
- Phase 2 头部:OB 单库 1000 亿行仍能保持主键唯一

### A3 分区分表

| 方案 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| 原生分区 | ✅ `PARTITION BY RANGE/LIST/HASH` | ✅ `PARTITION BY` | ✅ 增强版(自动分裂) |
| 分区数上限 | 数千(规划性) | 8192 | 无限(自动) |
| 自动分裂 | ❌ 手动 | ❌ 手动 | ✅ 自动 split partition |
| 跨分区查询 | ✅ | ✅ | ✅ |
| 分区剪枝 | ✅ | ✅ | ✅ 更激进 |

**AI 直播选型**:
- 直播事件时序表(年增 100 亿行):**OB 自动分裂**最省心
- 订单按月分区:三选一均可

---

## B 列：SQL 逻辑对比

### B1 查询能力

| 能力 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| CTE(WITH) | ✅ 完整 + 递归 | ✅ 8.0 支持 | ✅ |
| Window Functions | ✅ 完整 | ✅ 8.0 完整 | ✅ |
| LATERAL JOIN | ✅ | ❌ | ❌ |
| GROUPING SETS | ✅ | ❌ | ⚠️ 部分 |
| DISTINCT ON | ✅ | ❌(模拟) | ❌ |
| UPSERT | `INSERT ... ON CONFLICT` | `INSERT ... ON DUPLICATE KEY` | 同 MySQL |
| MERGE | ✅ 15+ | ❌ | ✅(Oracle 风格) |
| 函数/存储过程 | PL/pgSQL(强) | 弱 | PL/SQL(Oracle 强) |

### B2 事务与锁

| 隔离级别 | PostgreSQL | MySQL (InnoDB) | OceanBase |
|---------|-----------|---------------|-----------|
| READ UNCOMMITTED | ❌ 实现同 RC | ✅ | ✅ |
| READ COMMITTED | ✅ 默认 | ✅ | ✅ 默认 |
| REPEATABLE READ | ✅ | ✅ 默认 | ✅ |
| SERIALIZABLE | ✅ SSI | ✅ | ✅ |
| 锁粒度 | 行锁 + 咨询锁 | 行锁 + Gap Lock | 行锁 + 表锁 |
| SKIP LOCKED | ✅ | ✅ 8.0 | ✅ |
| 死锁检测 | ✅ 自动 | ✅ 自动 | ✅ 分布式 |
| 分布式事务 | ❌ 需外部协调 | ❌ | ✅ 原生 2PC |

### B3 执行计划深度

| 维度 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| EXPLAIN ANALYZE | ✅ 详细 | ✅ | ✅ |
| 计划缓存 | 自动 | 自动 | 自动 + 跨节点 |
| 优化器 | CBO(强) | CBO(中) | CBO(分布式) |
| Hint 控制 | `pg_hint_plan` 扩展 | `/*+ INDEX */` 原生 | 完整 |
| 统计信息 | `ANALYZE` 手动 | 自动更新 | 自动 + 实时 |

**AI 直播选型**:
- 复杂分析查询(留存/漏斗/归因):**PG** Window Functions 顶级
- 简单 OLTP:**MySQL/OB** 够用
- 跨节点查询:**OB** 自动下推,无需应用层拼装

---

## C 列：索引配置对比

### C1 索引类型覆盖

| 索引 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| B-Tree | ✅ | ✅ | ✅ |
| Hash | ✅ | ✅(InnoDB 自适应) | ✅ |
| GIN | ✅ JSONB/数组/全文 | ❌ | ❌ |
| BRIN | ✅ 时序大表 | ❌ | ❌ |
| 表达式/函数 | ✅ 原生 | ✅ 8.0 | ✅ |
| 部分索引 | ✅ `WHERE` | ❌ | ❌ |
| INCLUDE 覆盖 | ✅ 14+ | ❌ | ❌ |
| 倒排(全文) | ✅ GIN | ✅ FULLTEXT | ⚠️ |

### C2 索引参数

| 参数 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| 并行创建 | ✅ `CONCURRENTLY` | ✅ `ALGORITHM=INPLACE` | ✅ 在线 |
| 填充因子 | ✅ `FILLFACTOR` | ❌ | ⚠️ |
| 并行扫描 | ✅ `parallel_workers` | ❌(MySQL 8 弱) | ✅ 分布式并行 |
| 在线修改 | ✅ | ✅ | ✅ |
| 索引大小(B-Tree) | 基准 1× | 1.1× | 1.05× |

**AI 直播选型**:
- 商品 JSONB 属性搜索:**PG** GIN 必备
- 直播事件时序大表:**PG** BRIN 节省 99% 空间
- 全局用户表高频查询:**OB** 分布式索引更优

---

## D 列：测试验证对比

| 测试维度 | PostgreSQL | MySQL | OceanBase |
|---------|-----------|-------|-----------|
| 单元测试框架 | pgTAP | t-sql-test | 弱(主要靠 OBProxy 测试) |
| 压测工具 | pgbench / sysbench | sysbench / mysqlslap | 内置 OB-Bench |
| 慢日志 | `pg_stat_statements` | `slow_query_log` | `gv$sql_audit`(全集群) |
| 故障注入 | pg_chaos 扩展 | 无原生 | OB 内置 chaos 演练 |
| 数据校验 | pg_dump diff | mysqldump diff | obdumper diff |

**AI 直播选型**:
- MVP 测试:**PG** pgTAP 生态最强
- 头部压测:**OB** 内置全链路压测,数据更真实

---

## E 列：建模校验对比

| 能力 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| ER 图工具 | pgAdmin / DBeaver | MySQL Workbench | OCP / ODC |
| 触发器 | ✅ 强 | ✅ | ✅ Oracle 风格 |
| CHECK 约束 | ✅ 完整 | ✅ 8.0.16+ | ✅ |
| 物化视图 | ✅ 原生 + 增量 | ❌ 无 | ✅(分布式) |
| 视图更新 | ✅ 简单视图可更新 | ❌ | ✅ |

---

## F 列：运维监控对比

### F1 指标采集

| 指标 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| QPS 采集 | pg_exporter | mysqld_exporter | OB 内置 OCP 指标 |
| 慢查询 | `pg_stat_statements` | `slow_query_log` | `gv$sql_audit` |
| 锁监控 | `pg_locks` | `INFORMATION_SCHEMA` | `gv$lock` |
| 复制延迟 | `pg_stat_replication` | `SHOW SLAVE STATUS` | 内置 |
| 集群视图 | ❌ 需外部 | ❌ 需 MHA/Orchestrator | ✅ 原生 |

### F2 高可用对比

| 维度 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| 副本数 | 流复制(主从) | 主从 / MGR | 3/5 副本(Paxos) |
| 自动故障转移 | 需 Patroni | 需 MHA/Orchestrator | ✅ 自动(30s) |
| RPO | 0(同步) / 数秒(异步) | 0(半同步) / 数秒 | 0(Paxos) |
| RTO | 30-60s(手动/Patroni) | 30-60s(MHA) | < 30s(自动) |
| 数据强一致 | ✅ 同步流复制 | ⚠️ 半同步有丢数据风险 | ✅ Paxos |

**AI 直播选型**:
- 强一致需求(资金/订单):**PG 同步流复制** 或 **OB Paxos**
- 可接受弱一致(弹幕/点赞):**MySQL** 异步即可
- Phase 2 头部:**OB 自动故障转移**省一个 DBA

---

## G 列：安全治理对比

| 能力 | PostgreSQL | MySQL | OceanBase |
|------|-----------|-------|-----------|
| RBAC | ✅ `ROLE` | ✅ `ROLE` | ✅ Oracle 风格 |
| 行级安全(RLS) | ✅ 原生 | ❌ | ✅ |
| 列级权限 | ✅ `GRANT(col)` | ❌ | ✅ |
| 透明加密(TDE) | ✅ pgcrypto 扩展 | ✅ 8.0 | ✅ 内置 |
| 审计 | `pgaudit` 扩展 | `audit_log` 插件 | 内置 SQL Audit |
| 数据脱敏 | `pg_masking` 扩展 | 无原生 | 内置 |
| 备份工具 | pg_basebackup / pgbackrest | mysqldump / XtraBackup | obdumper / obrestore |
| 多租户 | schema 隔离 | schema 隔离 | ✅ 原生 tenant 隔离 |

**AI 直播选型**:
- 多租户 SaaS:**OB** 原生 tenant 隔离最干净
- 单租户 + RLS:**PG** 原生支持
- 金融级合规(等保三级):三选一均可,PG + pgaudit 最成熟

---

## 实战选型决策树(AI 直播平台)

```
开始
  │
  ├── Q1: 是否需要分布式?
  │     ├── 是 → Q2
  │     └── 否 → Q3
  │
  ├── Q2: 团队是否有 DBA?
  │     ├── 是 → OB 4.x(原生分布式 + 自动容灾)
  │     └── 否 → PG + ShardingSphere(更主流,文档多)
  │
  └── Q3: 是否需要 JSONB/数组/全文/地理?
        ├── 是 → PostgreSQL(类型生态最强)
        └── 否 → MySQL 8.0(运维最简单,生态最熟)
```

### 推荐组合(AI 直播平台)

| 阶段 | 选型 | 理由 |
|------|------|------|
| **Phase 0 MVP** | PostgreSQL 16 | JSONB 商品属性 + 单机够用 + 文档全 |
| **Phase 1 规模化** | PostgreSQL + ShardingSphere | 16 库 64 表分库分表,MySQL 兼容性 |
| **Phase 2 头部** | OceanBase 4.x | 100+ 节点 + Paxos + 自动容灾,免 ShardingSphere |
| **Phase 3 商业化** | OceanBase 多活 | 多 AZ 单元化 + RPO=0 + RTO<30s |

---

## 量化成本对比(单节点月成本,2026 年云价)

| 项目 | PostgreSQL (RDS) | MySQL (RDS) | OceanBase (阿里云) |
|------|----------------|------------|-------------------|
| 2C4G 基础版 | ~¥150/月 | ~¥120/月 | ~¥300/月 |
| 8C32G 高可用 | ~¥800/月 | ~¥700/月 | ~¥1500/月 |
| 32C128G 旗舰 | ~¥3500/月 | ~¥3000/月 | ~¥6000/月 |
| 原生分布式(3 节点) | ❌ 不支持 | ❌ 不支持 | ~¥4500/月 |

> **单位经济性**:**OB 单节点价格更高,但分布式能力替代 ShardingSphere 节省** ¥500-1000/月开发运维成本**。

---

## 入库清单

- [x] A 列(类型/主键/分区)对比
- [x] B 列(查询/事务/计划)对比
- [x] C 列(索引类型/参数)对比
- [x] D 列(测试)对比
- [x] E 列(建模)对比
- [x] F 列(指标/HA)对比
- [x] G 列(安全/治理)对比
- [x] AI 直播 4 阶段选型决策树
- [x] 单节点成本对比
- [ ] OB vs TiDB vs CockroachDB 进一步对比(分布式赛道)
- [ ] 与 `01-4-7级深度展开-实例.md` 联动补充具体场景 SQL

---

## 关联文档

- [[00-数据库开发全流程-极致深度框架-9×7矩阵]] — 母框架
- [[01-数据库开发全流程-4-7级深度展开-实例]] — 深度实例(PG 主线)
- [[02-AI直播平台-DB实践-9×7映射]] — AI 直播 checklist 串联
- [[00-基础设施开源大全]] — 中间件大全(含 PG/MySQL/OB)
- [[00-总索引]] — 项目入口

---

**入库时间**:2026-06-25
**对比深度**:9×7 全列 × 3 数据库 = 21 个对比维度
**决策辅助**:为 AI 直播平台 4 阶段选型提供量化依据