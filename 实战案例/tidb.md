# tidb - MySQL 兼容分布式 HTAP 数据库的三层分离与 Raft 共识典范

**GitHub**: pingcap/tidb
**Star**: 37k+
**语言**: Go（TiKV 用 Rust）
**主题**: 分布式数据库 / HTAP / Raft 共识 / CBO 优化器
**适用场景**: MySQL 兼容、HTAP 混合负载、水平扩展 OLTP

> TiDB 把传统数据库的"存储 + 计算 + 调度"拆成 PD/TiKV/TiDB 三层独立进程——SQL 层无状态可 K8s 横扩，KV 层走 Raft Region 副本组保证强一致，PD 做集群调度与 TSO 授时。配套 TiFlash 列存副本做 HTAP、Percolator 模型做分布式事务、Cascade CBO 优化器做复杂 SQL 规划。10+ 年演进的"云原生 NewSQL"工程范本。

## 第一段：基础范式（模式 1-5）

### 模式 1 · PD/TiKV/TiDB 三层分离架构

**问题场景**：传统数据库把存储/计算/调度耦合在单进程——扩展只能 scale-up（升硬件），无法 scale-out（加机器）。云原生时代需要按层独立扩缩容。

**解决方案**：TiDB 拆为三层独立进程——TiDB Server（无状态 SQL 层，解析+优化+执行）、TiKV（分布式 KV 存储，Raft 副本组）、Placement Driver PD（集群元数据+调度器+TSO 授时）。各层独立扩缩容：SQL 慢加 TiDB，容量不够加 TiKV，调度热点加 PD。

**关键参数**：
- TiDB Server 无状态 + 水平扩展
- TiKV 存数据，Region 分片默认 96MB
- PD 持全局元数据（Region 位置 + TSO）
- TSO 单点授时（PD Leader 颁发）
- Raft 副本组默认 3 副本

**最佳实践**：TiDB 层无状态可放 K8s；TiKV 必须 SSD + 独享磁盘；PD 至少 3 节点高可用；跨 AZ 用 5 副本；用 TiDB Dashboard 看 SQL 洞察。

### 模式 2 · Raft 一致性协议与 Region 副本组

**问题场景**：分布式存储需要多副本保证可用性——多副本写入要强一致，Paxos 难实现，Raft 简化了协议设计。

**解决方案**：TiKV 用 Raft 协议做副本同步。每个 Region（数据分片）是一个 Raft Group，3-5 副本通过 Raft log 复制。Leader 处理写入，Follower 复制日志，多数派提交后返回客户端成功。

**关键参数**：
- Region 默认 96MB + 分裂/合并自动调度
- Raft Group 3 副本（默认）/ 5 副本（高可用）
- Leader election 超时 1-2s
- Snapshot 增量传输
- Learner 节点（副本冷数据 + TiFlash 列存）

**最佳实践**：单 Raft Group 副本数不超过 7（性能下降）；Region 96MB 平衡分裂频率与心跳开销；用 `pd-ctl` 手动触发 Region 调度；Learner 用于备份节点和 TiFlash 副本。

### 模式 3 · MVCC 多版本并发控制

**问题场景**：传统 2PL 锁并发度低，读写互斥；快照隔离需要事务读一致视图。

**解决方案**：TiKV 实现 MVCC——每个 Key 保留多版本（`(user_key, start_ts) -> value`），事务读快照版本（start_ts），写新版本（commit_ts）。GC 后台清理旧版本（默认保留 10 分钟）。

**关键参数**：
- TSO 颁发全局单调递增时间戳
- `(user_key, start_ts) -> value` 编码
- `default` / `write` / `lock` 三列族
- GC 周期 10 分钟
- Async Commit 1PC 优化

**最佳实践**：长事务阻塞 GC，监控 `tidb_gc_run_interval`；`SET GLOBAL tidb_gc_life_time = '30m'` 调整保留期；快照读用 `START TRANSACTION READ ONLY AS OF TIMESTAMP`；Async Commit 降低延迟 30-50%。

### 模式 4 · Percolator 分布式事务模型

**问题场景**：分布式 KV 上需要 ACID 事务，但跨 Region 写入没有原生事务支持——需要 2PC 但要解决协调者崩溃问题。

**解决方案**：TiKV 用 Percolator 模型——Primary Key + PreWrite（CF write + CF lock）+ Commit（CF write + 解锁）。协调者（TiDB）记录事务状态，崩溃后通过 TTL + Primary 清理。

**关键参数**：
- PreWrite：写数据 + 加锁
- Commit：原子写 commit ts
- Primary Key 状态决定事务结果
- TTL 默认 60s（lock resolver 用）
- Async Commit 单阶段提交

**最佳实践**：避免大事务（>1 万行），拆小事务；`tidb_disable_txn_auto_retry = OFF` 启用自动重试；监控 `Lock Resolve OPS`；Async Commit 适合短事务。

### 模式 5 · SQL 优化器（CBO + Cascade Framework）

**问题场景**：复杂 SQL（多 JOIN + 子查询 + 聚合）的执行计划对性能影响 100x+——错误 JOIN 顺序让查询从 100ms 变 10s。

**解决方案**：TiDB 实现 Cascade Framework 风格 CBO——解析 SQL → 逻辑计划 → 物理计划（枚举 JOIN 顺序 + 访问路径）→ 选 cost 最低。统计信息（直方图 + TopN + Count-Min Sketch + Sample）驱动 cost 估算。

**关键参数**：
- `ANALYZE TABLE` 收集统计
- 直方图 + TopN + Count-Min Sketch
- Cascade 框架枚举所有 JOIN 顺序
- Cost 模型：CPU + IO + Network
- Plan Replayer 记录执行计划

**最佳实践**：新表/数据大幅变化后跑 `ANALYZE TABLE`；`EXPLAIN ANALYZE` 看实际执行计划；`tidb_enable_cascades_planner = ON` 启用新优化器（实验）；SQL Binding 固定不稳计划。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · Placement Driver 调度系统

**问题场景**：数百个 TiKV 节点 + 数万 Region 需要持续均衡——热点 Region 分散、容量均衡、Leader 均匀、跨 AZ 分散。

**解决方案**：PD 是独立调度服务，持续运行 scheduler（balance-region/leader/space/score）触发 Region 调度。Operator 描述调度步骤（add/learner/remove/transfer-leader），保证调度原子性与安全。

**关键参数**：
- Scheduler 队列：region / leader / space 三大类
- `score` 公式：容量 + leader 数 + region 数
- Operator 步骤：add-peer / learner / remove / transfer
- 限速：`scheduler.limit` 避免影响业务
- `evict-leader-scheduler` 临时下线

**最佳实践**：大促前用 `evict-leader-scheduler` 下线部分 Leader；`replica-scheduler` 调副本数；监控 `PD schedule_operators_count`；调度过激进会拖慢业务，限速 `1-10 ops/sec`。

### 模式 7 · Region 分裂与合并

**问题场景**：数据持续写入，单个 Region 会无限增长（热点 + 数据倾斜），需要自动分裂；反之多小 Region 带来心跳/调度开销。

**解决方案**：TiKV 自动分裂（Region 达 96MB 或 key 数 8 万）+ 合并（相邻小 Region）。分裂策略：key range 中点切分 + Pre-split（建表预分裂 N 段）。

**关键参数**：
- Region 大小默认 96MB
- Key 数阈值 8 万
- Split 触发：size / key 阈值
- Merge 触发：相邻小 Region
- Pre-split：`SPLIT TABLE t BY (RANGE)`

**最佳实践**：批量导入用 `SPLIT TABLE t BY (RANGE)` 避免热点；监控 `region_size` 直方图；分裂风暴说明 key 顺序混乱；调大 `region-split-size` 减少分裂。

### 模式 8 · Coprocessor 算子下推

**问题场景**：大量数据从 TiKV 拉回 TiDB 做过滤/聚合——网络带宽与延迟成本高。

**解决方案**：TiKV 内置 Coprocessor，支持算子下推（`Selection`/`Aggregation`/`TopN`/`Limit`/`Join build`）。TiDB 把算子下推到 TiKV 节点执行，只返回少量结果。

**关键参数**：
- `Selection` 谓词下推
- `Aggregation` 聚合下推
- `TopN` 排序下推
- `Join build` 端下推（小表）
- `IndexLookUp` 索引回表

**最佳实践**：索引列上过滤可触发下推；`EXPLAIN` 看 `task: cop[tikv]` 任务；`HashJoin` 内表小可下推；`STREAM_AGG` 替代 `HASH_AGG` 减少内存。

### 模式 9 · HTAP 混合负载（TiFlash 列存）

**问题场景**：OLTP 与 OLAP 业务共用同一份数据，传统的 ETL 到数据仓库链路长、成本高、数据延迟大。

**解决方案**：TiFlash 是列存副本（独立 Raft 角色 `Learner`），从 TiKV 实时异步复制（通过 Raft log）。TiDB 优化器根据 SQL cost 自动选 TiKV（点查）或 TiFlash（分析）。两副本数据最终一致。

**关键参数**：
- TiFlash 副本数独立配置
- `Learner` Raft 角色
- 列存：按列压缩 + 向量化执行
- 自动选择：cost < 阈值用 TiKV
- `tidb_allow_tiflash_cop` 开启下推

**最佳实践**：OLTP 业务关 TiFlash 节省资源；`SET SESSION tidb_isolation_read_engines = 'tikv'` 强制走 TiKV；监控 TiFlash 同步延迟（`<5s` 正常）；大宽表查询走 TiFlash 10x+ 加速。

### 模式 10 · 索引与统计信息

**问题场景**：缺乏合适索引导致全表扫描（慢）；统计信息过期导致优化器选错计划。

**解决方案**：TiDB 支持主键 + 唯一 + 二级 + 表达式索引 + Hash/Range 分区表。统计信息包括直方图（per-column）+ TopN + Count-Min Sketch + Sample 采样。

**关键参数**：
- `ANALYZE TABLE` 触发
- 直方图桶数默认 256
- CMSketch 估计 NDV
- 采样率 1 万行
- `tidb_analyze_version = 2` 增强

**最佳实践**：新表/数据大幅变化后必跑 `ANALYZE`；`tidb_stats_load_sync_wait = 600` 让 SQL 等待统计加载；`CREATE INDEX` 在线 DDL 不阻塞读写；`EXPLAIN` 确认索引生效。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · TiCDC 实时变更同步

**问题场景**：需要把 TiDB 数据变更实时同步到下游（Kafka + MySQL + StarRocks + Elasticsearch）——传统 binlog 解析复杂且与存储耦合。

**解决方案**：TiCDC 监听 TiKV 的 change log（scan + pull），把 DML/DDL 事件流式输出到下游。支持多种 sink（Kafka/Pulsar/MySQL/对象存储）+ 多种格式（Avro/JSON/Canal）。

**关键参数**：
- `changefeed` 配置
- `sink-uri` 下游地址
- `protocol` 序列化协议
- `filter.rules` 表过滤
- `cyclic-replicated-id` 循环复制

**最佳实践**：CDC 任务用专门 TiKV 节点跑（CPU 密集）；监控 `resolved ts` 延迟；下游用 Kafka + Schema Registry 维护 schema 演进；用 `ts` checkpoint 断点续传。

### 模式 12 · DM（Data Migration）从 MySQL 迁移

**问题场景**：从 MySQL 迁移到 TiDB 需要全量 + 增量同步，且要兼容分库分表（sharding）。

**解决方案**：DM 从 MySQL binlog 拉取，全量 dump + 增量 binlog 解析，自动合并分库分表到单 TiDB 表。支持 `black & white list` 过滤 + `DDL` 合并 + `online DDL` 工具过滤（gh-ost/pt-osc）。

**关键参数**：
- 全量：`loader` dump + load
- 增量：`syncer` binlog 解析
- 分库分表合并：`shard-mode: "pessimistic"` / `"optimistic"`
- `route-rules` 库表重命名
- `block-allow-list` 黑白名单

**最佳实践**：分库分表用悲观模式（默认）；`online-ddl-scheme: "gh-ost"` 过滤 online DDL；监控 `replicate lag`；全量 + 增量切换用 `start-time` 对齐。

### 模式 13 · BR 备份恢复 + PITR

**问题场景**：TiDB 集群（数十 TB）需要定期全量备份 + 增量备份，恢复到任意时间点（PITR）。

**解决方案**：BR 是分布式备份工具，备份到 S3/GCS/Azure Blob。支持全量（`br backup full`）+ 增量（`br backup diff`）+ PITR（log backup + restore to point）。底层用 M3 协议做并发备份。

**关键参数**：
- `--storage` 备份目标 URL
- `--ratelimit` 限速
- `--concurrency` 并发
- `tikv-incremental` 增量
- `log-backup` 日志备份

**最佳实践**：定期测恢复（DR 演练）；`tikv-importer` 加速恢复；监控 BR 进度；S3 用 cross-region replication 做异地容灾；PITR 保留期按业务合规要求。

### 模式 14 · TiProxy 智能代理

**问题场景**：TiDB Server 节点多，客户端要管理连接池；热点查询打到固定节点；版本升级要滚动。

**解决方案**：TiProxy 是 L4/L7 反向代理，客户端连 TiProxy，TiProxy 根据后端负载（CPU/连接数/版本）做负载均衡。支持滚动升级（keep version-aware routing）+ 故障转移。

**关键参数**：
- L4 / L7 模式
- `health-check` 探活
- `load-balance-policy: "connection"` / `"cpu"` / `"memory"`
- `version-aware` 滚动升级
- `pool` 连接池

**最佳实践**：客户端连 TiProxy 入口而非 TiDB；升级 TiDB 时 TiProxy 保留旧版本连接直到事务结束；监控 TiProxy 后端健康；高并发场景用 `cpu` 策略。

### 模式 15 · 资源管控（Resource Control）

**问题场景**：单集群多业务共用，某个慢查询抢占 CPU/IO 资源影响其他业务——需要 quota 隔离。

**解决方案**：TiDB Resource Control 用 `Resource Group` 把用户绑到组，配置 `RU per second` 配额。调度器（TiDB Server）按 RU 限流，RU 估算查询 cost。

**关键参数**：
- `CREATE RESOURCE GROUP rg1 RU_PER_SEC = 1000`
- `ALTER USER u1 RESOURCE GROUP rg1`
- `BURSTABLE` / `BACKGROUND`
- 估算：基于 cost 模型
- `RU` 单位是 read unit

**最佳实践**：核心业务单独 RG；`BACKGROUND` 处理 ETL 不抢占前台；监控 `Resource Manager` 指标；高优先级任务给小 quota 反而慢（限流），按业务峰值设置。

## 第四段：实战范式（模式 16-20）

### 模式 16 · 连接管理与 SQL 调优

**问题场景**：应用连接数暴涨（数千连接），TiDB 节点 CPU 满载；SQL 慢但找不到原因。

**解决方案**：应用侧用 `TiProxy` 代理或驱动端 `tidb-prepared-statement-cache=true` 复用 prepared statement；TiDB 端调 `tidb_max_delta_length` + `tidb_index_lookup_size` 等参数。SQL 调优用 `EXPLAIN ANALYZE` + SQL Binding。

**关键参数**：
- `tidb_prepared_plan_cache_size` 100
- `tidb_mem_quota_query` 单查询内存
- `tidb_distsql_scan_concurrency` scan 并发
- `tidb_index_lookup_concurrency` 回表并发
- `tidb_enable_prepared_plan_cache`

**最佳实践**：连接池用 HikariCP 配 10-30 连接；`EXPLAIN ANALYZE` 看实际算子耗时；`tidb-slow.log` 抓慢查询；SQL Binding 固定不稳计划。

### 模式 17 · 监控告警（Prometheus + Grafana）

**问题场景**：分布式数据库组件多（TiDB/TiKV/PD），出问题难定位——需要统一监控告警。

**解决方案**：TiUP 部署默认集成 Prometheus + Grafana，监控指标覆盖 QPS/latency/QPS-per-instance/Region 分布/慢查询/错误日志。告警规则用 Alertmanager 发 Slack/钉钉/飞书。

**关键参数**：
- Prometheus scrape 间隔 15s
- Grafana dashboard 内置 50+ 张
- 关键告警：`TiKV_write_stall` / `PD_miss_peer` / `QPS_drop`
- 慢查询日志：`slow-threshold: 300ms`
- `tidb_enable_top_sql` 开启 Top SQL

**最佳实践**：核心告警：write stall + coprocessor 慢 + Region 失衡 + QPS 突降；用 `Top SQL` 看 CPU 消耗最大查询；Grafana 加 business metric 做关联分析。

### 模式 18 · 高可用与故障转移

**问题场景**：TiDB 节点宕机、TiKV 节点磁盘故障、PD 主备切换——需要快速恢复且不丢数据。

**解决方案**：TiDB 无状态（K8s 自动重启）+ TiKV 副本组自动选主（< 30s）+ PD 主备切换（< 10s）。Region 自动 rebalance 到其他节点。客户端重试（`tidb_retry_limit = 10`）保证事务最终成功。

**关键参数**：
- `raft-election-timeout` 1s
- `raft-store-pool-size` 4
- `tidb_retry_limit` 10
- `tidb_disable_txn_auto_retry` OFF
- `evict-leader-scheduler` 下线前驱逐

**最佳实践**：部署 3 副本 TiKV + 3 节点 PD；`evict-leader-scheduler` 优雅下线节点；客户端 `tidb_retry_limit` 自动重试；定期 chaos 演练（kill 节点 + 模拟磁盘故障）。

### 模式 19 · TiUP 一键部署

**问题场景**：TiDB 集群组件多（PD/TiKV/TiDB/TiFlash/CDC/DM），手动部署运维复杂；版本升级需要滚动。

**解决方案**：TiUP 是包管理 + 部署工具，YAML 描述拓扑（`topology.yaml`），一条命令 `tiup cluster deploy` 起集群。`tiup cluster upgrade` 滚动升级。

**关键参数**：
- `topology.yaml` 描述节点
- `tiup cluster deploy prod v7.5 ./topo.yaml`
- `tiup cluster start / stop` 启停
- `tiup cluster upgrade prod v7.6` 升级
- `tiup cluster display prod` 状态

**最佳实践**：所有集群用 TiUP 部署（生产/测试统一）；YAML 入 git 版本化；升级前 `tiup cluster check` 检查兼容性；用 `tiup dm deploy` 部署 DM。

### 模式 20 · TiDB 7.x 关键新特性

**问题场景**：TiDB 7.x 在性能/稳定性/成本上做了大量优化，需要了解核心新特性用好这些能力。

**解决方案**：核心新特性——Resource Control（RU 配额隔离）+ TiProxy 1.0（智能代理）+ CDC 8.0+（并行解码 + 多 topic）+ PITR GA（时间点恢复）+ TiFlash 7.x（MPP 性能 3x 提升）+ TiDB 7.5（内核优化）+ TiKV 7.x（Raft Engine 2.0 写吞吐 +50%）。

**关键参数**：
- `tidb_enable_resource_control` 开启资源管控
- `tidb_opt_range_max_size` 大范围扫描优化
- `tidb_distsql_scan_concurrency` 自动调整
- `tidb_mem_quota_analyze` 统计内存
- `tiflash_fastscan` 列存快扫

**最佳实践**：升级到 7.5 LTS 享受 3 年支持；用 Resource Control 做多业务隔离；TiFlash 7.x 适合大宽表分析；用 TiProxy 入口屏蔽后端拓扑；监控 `TiKV-Raft Engine` 写吞吐。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\tidb\`
- 主语言：Go（TiKV 用 Rust）
- License：Apache 2.0
- 核心组件：TiDB SQL 层 + TiKV 存储 + PD 调度 + TiFlash 列存 + TiCDC + DM + BR + TiProxy
- 关键基础设施：Raft + Percolator + MVCC + CBO 优化器 + Cascade Framework

**3 核心洞察**：
1. 三层分离（SQL/KV/调度）= 云原生时代数据库的标准范式
2. Percolator 2PC + TSO = Google 风格的分布式事务最佳答案
3. Raft Group 副本 + Learner 列存 = 一份数据同时服务 OLTP 和 OLAP

**1 反模式**：TiKV Region 副本数 > 7——性能下降 + 选主时间爆炸，3-5 副本是甜蜜点。

**3 立刻能用**：
1. `SPLIT TABLE t BY (RANGE)` 批量导入前预分裂避免热点
2. `SET SESSION tidb_isolation_read_engines = 'tikv'` 强制点查走 TiKV
3. `ANALYZE TABLE` + `EXPLAIN ANALYZE` + `SQL Binding` 三件套调优慢查询
