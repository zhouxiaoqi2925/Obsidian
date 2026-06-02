# elasticsearch-new - 分布式搜索与分析引擎

**GitHub**: elastic/elasticsearch
**Star**: 72000+
**语言**: Java
**主题**: 搜索引擎 / 分布式系统
**适用场景**: 全文搜索 / 聚合分析 / 向量检索 / 时序数据 / RAG 检索层

---

## 第一段：基础范式（模式 1-5）

### 模式 1：Lucene 内核封装

**问题场景**：需要快速全文检索但不想自己实现倒排索引、分词、评分，Lucene 直接用门槛太高。

**解决方案**：ES 把 Lucene 包装成分布式近实时（NRT）引擎，屏蔽 Segment/Merge/Commit 细节，对外暴露 REST/JSON API。底层 Lucene 的近实时搜索依赖 IndexWriter 的 in-memory buffer + translog 持久化机制。

**关键参数**：
- `refresh_interval` 控制 segment 可见延迟（默认 1s）
- `translog.durability=request|async` 控制写入风险
- `number_of_shards` 决定数据分片规模
- 单分片建议 10-50GB，超大需 routing 或 split

**最佳实践**：高写入场景把 `refresh_interval` 调到 30s 提升吞吐；近实时需求保留 1s 默认。

### 模式 2：REST + JSON 协议

**问题场景**：多语言客户端集成复杂，原生 Java 客户端难以被 Python/JS/Go 团队使用。

**解决方案**：用 HTTP + JSON 做协议层，所有功能等同 curl 调用。多语言官方客户端（go-elasticsearch、elasticsearch-js）都基于 REST 包一层。`Content-Type: application/json` 强制；批量操作用 `_bulk` 端点。

**关键参数**：
- `_bulk` 端点单次 100-1000 文档
- `_cat` API 做运维探针
- `_search` 支持 scroll/search_after 分页
- `_mget` / `_msearch` 减少 RTT

**最佳实践**：永远不要在循环里发单文档请求，攒批用 `_bulk` 能提升 10x 吞吐。

### 模式 3：分片（Shard）与副本（Replica）

**问题场景**：单机装不下索引 + 写吞吐成瓶颈 + 节点故障数据丢失。

**解决方案**：索引分水平分片（primary shard），每个分片有 0-N 个副本。写入走 primary，读取可走 replica 提升并发。Shard 是 ES 最小的"数据移动单位"，跨节点 rebalance 也按 shard 走。

**关键参数**：
- 分片数索引创建时固定，事后只能 split 不能合并
- `index.number_of_replicas` 决定高可用等级
- 单分片 JVM 堆建议 < 32GB（指针压缩边界）
- 副本数 = 节点数 -1 可满配

**最佳实践**：分片数宁少勿多（过度分片爆炸），按 1 分片 = 10-30GB 数据规划。

### 模式 4：Mapping 模式

**问题场景**：动态 mapping 推断错类型，字段被自动识别成 text/keyword 双字段但浪费空间。

**解决方案**：显式 mapping 控制字段类型与分词器。Text 走分词做全文，keyword 走精确匹配/聚合，date/numeric 走范围查询。

**关键参数**：
- `dynamic: strict|true|false` 三档
- `index: false` 关闭索引节省空间
- `doc_values: false` 关闭列存（聚合会失效）
- 嵌套用 `nested` 类型，不用 object 数组

**最佳实践**：生产必显式 mapping；用 `index_template` 批量应用；新字段先在 `dynamic: false` 模式观察。

### 模式 5：查询 DSL

**问题场景**：业务查询既有全文 + 过滤 + 聚合 + 排序 + 分页，全部硬编码成简单 match 性能差。

**解决方案**：用 bool query 把 `must` / `should` / `filter` / `must_not` 组合，`filter` 走 cache 不算分。聚合用 `aggs` 嵌套 bucket + metric。

**关键参数**：
- `filter` context 不算相关性分、自动 cache
- `term` 不分词，`match` 分词
- `range` 查询走 BKD 树
- `function_score` 改写打分

**最佳实践**：filter 上下文能复用 query cache，非 score 查询必走 filter；避免深 wildcard + 前缀。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：分布式协调（Zen2/Coordination）

**问题场景**：集群 master 选举脑裂 + 节点发现 + 集群状态广播。

**解决方案**：基于 Raft 的 Coordination 层（v7+）替代旧 Zen，发现靠 unicast + 种子节点。Voting configuration 控制哪些 master-eligible 节点可投。

**关键参数**：
- `discovery.seed_providers` 配置种子
- `cluster.initial_master_nodes` 首次启动
- `discovery.zen.minimum_master_nodes` 防脑裂
- `cluster.fault_detection.*` 故障检测间隔

**最佳实践**：master 节点数 = 3 或 5 奇数；专用 master 节点（小堆 + 强 CPU）与数据节点分离。

### 模式 7：分片分配策略

**问题场景**：新增节点数据不均衡 / 磁盘快满但分片不迁出 / 冷热分层。

**解决方案**：`cluster.routing.allocation` 配 disk threshold / awareness / require/balance。Hot-Warm 架构用 shard allocation filtering 把冷数据挪到大容量节点。

**关键参数**：
- `cluster.routing.allocation.disk.threshold_enabled=true`
- `index.routing.allocation.require._tier_preference= data_hot`
- 节点属性 `node.attr.rack=r1` 做 rack awareness
- `total_shards_per_node` 限流

**最佳实践**：生产开 watermark 防磁盘写满；快照保留至少 2 副本防勒索。

### 模式 8：聚合分析（Aggregation）

**问题场景**：实时统计 PV/UV/转化漏斗 / 销售排行 / 区间分布。

**解决方案**：Aggregation 走列存（doc_values），metric 算 sum/avg/cardinality，bucket 按 terms/date_histogram/histogram 分组。Cardinality 用 HyperLogLog++ 近似去重。

**关键参数**：
- `size: 0` 关闭 hit 输出提性能
- `cardinality.precision_threshold` 调精度
- `composite` aggregation 做深度分页
- `aggs` 嵌套多层 bucket

**最佳实践**：高基数字段用 `cardinality` 近似，精确去重走 `script` 或 ClickHouse；聚合前 filter 缩范围。

### 模式 9：Pipeline 聚合与时序数据

**问题场景**：监控指标 5 分钟一个点存 30 天，做 derivative/moving_avg 趋势分析。

**解决方案**：Date histogram + sub aggregation + pipeline aggregation（derivative/moving_avg/bucket_script）。新建项目推 ES|QL（v8.14+）做向量化执行。

**关键参数**：
- `fixed_interval: 1m|1h|1d`
- `time_zone` 防时区漂移
- `min_doc_count: 0` 补零
- `extended_bounds` 强制边界

**最佳实践**：监控场景用 ILM + downsampling 把秒级降到小时级；高频聚合用 `_rollup` API。

### 模式 10：Ingest Pipeline

**问题场景**：写入时数据清洗（grok 解析日志、HTML 提取、字段裁剪、geoip 解析）耗时大。

**解决方案**：Ingest Node 在 indexing 之前跑 processor 链（grok/rename/set/append/geoip/circle）。模拟 ETL 在 ES 内完成。

**关键参数**：
- `pipeline` 在 bulk 请求指定
- `on_failure` 定义降级
- 模拟字段用 `if ctx.xxx != null` 守卫
- `enrich` processor 联表

**最佳实践**：高频清洗用 simulate API 调试；processor 失败不能阻塞，写 `on_failure` 兜底。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：跨集群复制（CCR）

**问题场景**：多机房灾备 / 读写分离 / 区域就近访问。

**解决方案**：CCR 把 leader 索引的变更流复制到 follower（基于 translog-based 复制）。Cross-cluster search 走 CCS 跨集群查询。

**关键参数**：
- `remote_cluster` 配种子节点
- leader/follower 索引名映射
- 软删除保留期控制
- `ccr.auto_follow` 自动跟

**最佳实践**：灾备场景 follower 可关 read-only 验数据；CCR 走异步有秒级延迟。

### 模式 12：跨集群搜索（CCS）

**问题场景**：数据按地域分布但查询要全网汇总（跨国电商订单搜）。

**解决方案**：CCS 在查询时 `cluster_one:index,cluster_two:index` 联合，local-coordinator 聚合。给业务一个统一查询入口。

**关键参数**：
- `cluster.remote.connect=true`
- `skip_unavailable=true` 容忍单集群故障
- `pre_filter_shards` 减少拉取量

**最佳实践**：跨集群查询前在 coordinate 节点做预过滤；超时时间分层设置。

### 模式 13：向量检索与 kNN

**问题场景**：AI 时代 RAG 检索 + 语义搜索 + 推荐相似商品，纯文本倒排索引搞不定。

**解决方案**：kNN search 走 HNSW 近似最近邻，向量字段类型 `dense_vector`。hybrid 检索（BM25 + 向量）用 RRF（Reciprocal Rank Fusion，v8.8+）。

**关键参数**：
- `dims` 维度（768/1024/1536/3072）
- `index: true` 启 HNSW
- `ef_construction` / `m` 控制精度
- `num_candidates: 100` 召回候选

**最佳实践**：向量字段要量化（int8/bfloat16）省 4x 空间；hybrid 用 RRF 比线性加权更稳。

### 模式 14：ILM（Index Lifecycle Management）

**问题场景**：时序数据按天/周增长，无限膨胀；冷数据要降本。

**解决方案**：ILM 配 hot-warm-cold-delete 四阶段，按 rollover/snapshot/forcemerge/delete 策略自动迁移。

**关键参数**：
- `data_stream` + `index.lifecycle.name`
- 触发条件 `max_age`/`max_size`/`max_docs`
- 阶段间 rollover alias

**最佳实践**：日志场景直接上 Data Stream + ILM；冷数据 force merge 到 1 segment 提压缩比。

### 模式 15：Stateless 模式（云原生）

**问题场景**：传统 ES 节点强耦合本地磁盘，扩容慢、恢复久、节点故障影响大。

**解决方案**：v8.10+ 引入 Stateless 模式，把 shard 数据存到 S3/GCS/Azure Blob，本地只缓存。本地磁盘变 cache，节点可快速重建。

**关键参数**：
- `xpack.stateless.enabled=true`
- 对象存储 `repository` 配置
- `cache_size` 决定本地热点缓存
- `partial_shard` 失败容忍

**最佳实践**：云上 ES 走 Managed / Serverless 体验最佳；自建需评估 S3 成本与 RTT。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：JVM 调优

**问题场景**：ES 跑在默认 JVM 参数下 GC 抖动、Full GC 频繁、查询延迟 P99 飙升。

**解决方案**：专用 JDK（Elastic 推荐 Azul Zulu / Amazon Corretto），G1GC 配 50% 堆，swapoff 禁用。GC 阈值设 `InitiatingHeapOccupancyPercent=75`。

**关键参数**：
- `-Xms` = `-Xmx` 避免动态扩堆
- 单节点堆 ≤ 32GB（指针压缩边界）
- 关闭 `bootstrap.memory_lock`
- `thread_pool.write` 队列配 monitoring

**最佳实践**：堆超过 32GB 用 G1GB；监控 `jvm.mem.heap_used_percent` 超 75% 立刻扩容。

### 模式 17：监控与告警

**问题场景**：ES 集群出问题难发现，JVM 老年代满了 / 分片 unassigned 默默堆积。

**解决方案**：用 Elastic Stack 自监控（metricbeat → ES + Watcher 告警），关键指标 `cluster.health` / `jvm.mem.heap_used_percent` / `indices.search.query_time` / `pending_tasks`。

**关键参数**：
- `/_cluster/health?wait_for_status=yellow&timeout=50s`
- `_cat/pending_tasks?v` 队列阻塞检测
- Watcher 配 webhook/邮件
- Slow log 阈值 `index.search.slowlog.threshold.query.warn: 10s`

**最佳实践**：所有查询强制 slow log 阈值；cat API 进自监控 dashboard。

### 模式 18：安全（Security / RBAC）

**问题场景**：多团队共用集群，权限混乱；公网暴露被脱裤。

**解决方案**：v8 默认开 Security（X-Pack），RBAC 按角色控制 `indices:read/write/admin`，TLS 加密节点通信 + HTTPS API。

**关键参数**：
- `xpack.security.enabled=true`
- `xpack.security.transport.ssl.enabled=true`
- `xpack.security.http.ssl.enabled=true`
- API key / Bearer token 替代密码

**最佳实践**：生产必须开 TLS；最小权限原则，按 index pattern 分；定期轮换 service account token。

### 模式 19：备份恢复（Snapshot/Restore）

**问题场景**：误删索引 / 集群整体故障 / 跨环境迁移。

**解决方案**：Snapshot 存到 S3/HDFS/NFS 共享存储，Restore 选索引/集群级。跨集群复制靠 snapshot 或 CCR。

**关键参数**：
- `fs`/`s3`/`azure`/`gcs` repository
- `partial` 容忍部分失败
- `wait_for_completion=false` 异步
- `rename_pattern`/`rename_replacement` 重命名恢复

**最佳实践**：每日全量 + 每小时增量；保留 7/30/365 多档；定期做 restore 演练防 silent corruption。

### 模式 20：性能与容量规划

**问题场景**：双 11 大促 / 索引爆量，集群扛不住；CPU/内存/磁盘瓶颈难定位。

**解决方案**：性能走分阶段压测（rally 工具），按"目标 QPS + 索引大小 + 保留期"反推节点数。一般 1 节点 = 1TB 索引 + 1k QPS。

**关键参数**：
- 单分片 ≤ 50GB / 单分片 ≤ 30GB heap
- JVM heap 不超节点 RAM 一半
- shard 数 = 数据节点数 × 2
- 大查询并发限 `_search` 线程池

**最佳实践**：压测用 elastic/rally 模拟真实 query；预留 50% 容量抗突发；混合 hot-warm 架构降本 30%+。
