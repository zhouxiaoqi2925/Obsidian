# redis - 单线程事件循环 + 渐进式 rehash + Cluster 槽位映射的内存数据平台

**GitHub**: redis/redis
**Star**: 68k+
**语言**: C（主）+ Lua + Tcl
**主题**: in-memory-store / event-loop / data-structure / clustering
**适用场景**: 学习单线程 IO 多路复用、RESP 协议自解析、dict 渐进式 rehash、skiplist、Gossip 集群协议

> Redis 7.4 用 ~10 万行 C 代码实现 in-memory data structure server，支撑 10w+ QPS 单线程。本地镜像位于 `G:\实战案例\GitHub顶尖项目\redis\`，核心是 `dict.c`（哈希表 + 渐进 rehash）+ `server.c`（ae 事件循环）+ `networking.c`（RESP 协议）+ `cluster.c`（Gossip + 16384 槽）——单线程哲学贯穿所有设计。

## 第一段：基础范式

### 模式 1：ae 库单线程事件循环

**问题场景**：传统多线程服务器（Tomcat、Apache）每连接一线程，10k 连接 = 10k 线程，context switch 开销大，内存访问跨核 cache miss 多。

**解决方案**：Redis 用自研 ae 库（epoll/kqueue/evport 抽象）——单线程轮询所有 fd，所有命令在主线程执行。v6.0+ 引入 IO threads 处理网络读写（默认关闭），主线程仍单线程。

**关键参数**：
- 系统调用 = `epoll` (Linux) / `kqueue` (macOS) / `evport` (Solaris) / `select` (兜底)
- 事件 = `AE_READABLE` / `AE_WRITABLE` / `AE_BARRIER`（防竞争）/ `AE_NOMORE`
- 时间事件 = `serverCron` / `expire` 定时器
- 钩子 = `beforesleep` 在 `epoll_wait` 前调（flush AOF + 处理 client 回复）

**最佳实践**：Redis 业务命令禁止 `usleep` / 阻塞调用——主线程卡死 = 整个实例失联；IO 线程数默认 1 = 关闭，按需 `io-threads 4` 开启。

### 模式 2：RESP 协议自解析（5 种前缀）

**问题场景**：客户端用 C/Java/Python/Node.js 各语言实现，需统一通信协议。JSON 太重，protobuf 要 IDL，Redis 用 RESP（REdis Serialization Protocol）——5 种类型前缀，10 行可实现 parser。

**解决方案**：`processInputBuffer` 探测 `*` 走 RESP2 array，探不到走 inline 命令；解析阶段 `processMultibulkBuffer` 按 `*N\r\n` + N 个 `$M\r\n` 分段。

**关键参数**：
- 类型 = `+OK\r\n` (Simple String) / `-ERR\r\n` (Error) / `:1000\r\n` (Integer) / `$5\r\nhello\r\n` (Bulk) / `*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n` (Array)
- RESP3 扩展 = `_\r\n` (Null) / `,1.5\r\n` (Double) / `#t\r\n` (Boolean) / `%1\r\n+key\r\n+value\r\n` (Map)
- Inline = `SET foo bar\r\n` 无前缀，telnet 友好
- Pipeline = 多个 RESP 拼接一次发送，减少 RTT

**最佳实践**：RESP2 + Pipeline 是客户端默认；RESP3 复杂数据用；不要每个命令一个 TCP 包——RTT 主导延迟。

### 模式 3：dict 双表渐进式 rehash

**问题场景**：所有数据结构（String/List/Hash/Set/ZSet）底层都用 dict，负载因子 >1 要 rehash——但全量 rehash 是 O(n) 阻塞单线程。

**解决方案**：`ht[2]` 双哈希表 + `rehashidx` 标记——`dictExpand` 分配新表但暂不搬，每次 dict 操作搬 1 个 bucket（`_dictRehashStep`），业务无感知。

**关键参数**：
- 双表 = `ht[0]` 当前 + `ht[1]` 目标，rehashidx=-1 表示未在 rehash
- 触发 = `used / size > 1.0` 强制 / `> 5` 满时渐进
- size = 始终 2 的幂——位运算 `& sizemask` 代替 `% size`
- `rehash 0 1` = 7.0+ 限制 rehash 步数（不影响主线程）

**最佳实践**：避免大 key（field 数十万）——单次 rehash 步骤多；HGETALL 100w 字段 hash 可能卡数十 ms；dict 是 Redis 性能基座。

### 模式 4：robj 统一对象系统 + SDS 字符串

**问题场景**：Redis 6 种数据类型（String/List/Hash/Set/ZSet/Stream）独立实现，但命令分派、内存管理、序列化需统一抽象。

**解决方案**：`robj` 用 4-bit `type` + 4-bit `encoding` 区分（int/embstr/raw/hashtable/listpack/quicklist/skiplist/quicklist），`createStringObject` 按长度选 enc——≤44 字节走 embstr 一次分配，>44 走 raw 两次分配。SDS（`sdshdr`）用 `len/alloc/flags` 头 + `buf[]` 柔性数组，避免 N 次 strlen。

**关键参数**：
- type = STRING/LIST/HASH/SET/ZSET/STREAM（4-bit）
- encoding = int / embstr（≤44B）/ raw / listpack / hashtable / quicklist / skiplist（4-bit）
- lru = 24-bit LRU 时间戳，支持 LRU/LFU 淘汰
- refcount = 共享对象（短字符串 / 数字），`OBJECT REFCOUNT` 看

**最佳实践**：整数存储高效——能用 `INCR` 不要用 `SET key value` + `GET`；小 hash（<128 field）用 listpack 节省内存；LRU/LFU 由 `maxmemory-policy` 配置。

### 模式 5：skiplist 实现 SortedSet

**问题场景**：SortedSet 需要"按 score 排序 + 按 member 查 score + 范围查询"。B+ 树难实现 + 难并发，红黑树实现复杂；Redis 选跳表——O(log n) 查询，实现简单，范围查询天然友好。

**解决方案**：`zslInsert` 从顶层往下找插入点，每层记录 `update[]` 前驱；`zslRandomLevel` 按几何分布 p=0.25 算层高；`ZRANGE` 用 `span` 字段 O(log n) 算 rank。

**关键参数**：
- ZSKIPLIST_MAXLEVEL = 32
- 随机层高 p = 0.25，平均层高 = 1/(1-p) = 1.33
- 索引空间 = log_0.25(N)，N=100w 时层高 ~10
- 双索引 = 跳表（按 score 排序）+ 字典（member → score）ZSCORE O(1) / ZRANGE O(log n)

**最佳实践**：排行榜 Top N 用 `ZRANGEBYSCORE` + `LIMIT`；10w 个 ZADD 用 pipeline 批量；7.0+ 小 SortedSet 用 listpack 替代 ziplist。

## 第二段：扩展范式

### 模式 6：RDB 快照（dump.rdb 二进制紧凑）

**问题场景**：内存数据易失——进程崩溃 = 数据丢失。需周期性把内存全量 dump 到磁盘。RDB 是默认持久化方式——二进制紧凑格式，冷启动 10s 加载 10GB。

**解决方案**：`rdbSave` 写 `REDIS0009` magic + AUX fields + 遍历所有 db 序列化所有 key + EOF + CRC64 校验——`BGSAVE` fork 子进程异步（不阻塞主线程），写入临时文件后原子 rename。

**关键参数**：
- 触发 = `BGSAVE`（fork 子进程）/ `SAVE`（同步阻塞，禁用）/ `save 3600 1000` 自动（3600s 内 1000 改动）
- 压缩 = `rdbcompression yes`（LZF 字符串）/ `rdbchecksum yes`（CRC64 校验）
- 容器化 = `--save "" --appendonly no` 避免双写
- 监控 = `rdb_last_save_time` / `rdb_last_bgsave_status`

**最佳实践**：RDB 适合定期备份（冷启动快）；不要用 `SAVE` 阻塞主线程；`save ""` 关闭 RDB（只用 AOF）。

### 模式 7：AOF 追加日志（Append Only File）

**问题场景**：RDB 丢失窗口大（最后一次 save 后数据全丢）。需"每次写命令都记录"——AOF 日志式持久化，重启时重放命令恢复数据。

**解决方案**：`feedAppendOnlyFile` 序列化为 RESP 命令追加到 `aof_buf` + 异步刷盘；`rewriteAppendOnlyFile` 遍历当前 key 集，生成等效最小命令集（100 次 INCR → 1 次 SET key 100）。

**关键参数**：
- `appendfsync` = `always`（最安全 < 1 条丢失）/ `everysec`（默认，最多丢 1s）/ `no`（靠 OS，最快）
- 重写触发 = `auto-aof-rewrite-percentage 100` + `auto-aof-rewrite-min-size 64mb`
- 7.0+ Multi Part AOF 支持增量重写，避免 bgrewrite 阻塞

**最佳实践**：`everysec` 是生产默认；`appendfsync always` + 写入密集会让磁盘成为瓶颈；加载 AOF 用 `redis-check-aof --fix` 修复损坏。

### 模式 8：Replication 主从复制 + PSYNC 增量

**问题场景**：单点 Redis 不可用，需数据冗余。主从复制（master-replica）——主节点接受写，从节点同步数据，提供读扩展 + 高可用。

**解决方案**：`replicationCron` 周期 ping + 检查超时；首次连接 → 全量同步（BGSAVE + 发 RDB + 同步期写命令也发过去）；断线重连 → PSYNC 增量同步（repl-backlog 环形缓冲，从节点带 offset 重连）。

**关键参数**：
- `repl-backlog-size` = 默认 1MB，建议 100MB（断线 5min 还能增量同步）
- `repl-timeout` = 60s
- `client-output-buffer-limit replica 256mb 64mb 60`（主从压力限流）
- 监控 = `INFO replication` 看 `master_repl_offset` vs `slave_repl_offset`

**最佳实践**：主从分叉严重（master 10k/s 写跟不上）加 replica；启用 `repl-backlog-size 100mb`；主从 + 哨兵 = 完整高可用。

### 模式 9：Sentinel 哨兵（多节点投票 + 故障转移）

**问题场景**：主节点挂了，需自动选新主 + 通知应用。单 sentinel 不可信——脑裂风险。

**解决方案**：Sentinel 集群（≥3 节点）`sentinelTimer` 周期 PING + SDOWN（主观下线，单 sentinel 判定）+ ODOWN（客观下线，quorum 多数同意）+ 投票选 leader + 故障转移（RECONF_SLAVES）。

**关键参数**：
- `quorum` = sentinel 多数（`sentinel monitor mymaster 127.0.0.1 6379 2`）
- `down-after-milliseconds` = 30s
- `failover-timeout` = 180s
- `parallel-syncs` = 1（避免主节点压力）

**最佳实践**：至少 3 个 sentinel 节点；客户端用 `redis-sentinel://` URL 自动发现新主；监控 `SENTINEL get-master-addr-by-name mymaster` 验证状态。

### 模式 10：Redis Cluster（Gossip + 16384 槽）

**问题场景**：单实例数据量 > 内存上限（>500GB）需水平扩展。Redis Cluster 把数据分片到 16384 槽——多主多从，去中心化协议（无 proxy）。

**解决方案**：`crc16(key) & 16383` 算槽位；`clusterCron` 周期随机 ping 5 节点 + 接收 pong 更新 slots 映射 + pfail/fail 失败判定 + 多数选 leader；MOVED/ASK 重定向客户端。

**关键参数**：
- 槽数 = 16384（CRC16 模数，权衡足够大 + 节省 bitmap 空间）
- 节点最小数 = 6（3 主 + 3 从）
- 故障检测 = 30s 默认
- hash tag = `{user42}:name` 强制同槽（MGET / MSET 才能跨 key 操作）

**最佳实践**：客户端必须支持 MOVED/ASK 重定向（`redis-cli -c`）；单 key > 1MB 会让 migrate 慢；监控 `cluster info` / `cluster slots` 看集群健康。

## 第三段：进阶范式

### 模式 11：quicklist 实现 List（ziplist + linkedlist 混合）

**问题场景**：List 要支持 LPUSH/RPUSH/LPOP/RPOP/LRANGE。linkedlist 节点零碎 + 内存碎片多；纯数组（ziplist）大 List 性能差。

**解决方案**：`quicklist = linkedlist(quicklistNode) + ziplist/listpack`，`quicklistNode.zl` 存一段 ziplist 字节（默认 8KB），`quicklistNode` 双向链表串接。LRANGE 范围查询跨节点 O(n+m)，LPUSH/RPUSH 单节点 O(1)。

**关键参数**：
- `list-max-listpack-size` = 8KB（单个 quicklistNode 最大字节）
- `list-compress-depth` = 0（两端不压缩节点数，默认 0 = 全不压缩）
- 复杂度 = LPUSH/RPUSH O(1) / LRANGE O(n+m) / LINDEX O(n)

**最佳实践**：短 List（<几百元素）性能好；大 List 慎用 LINDEX/LSET（O(n)）；LPUSH + RPOP = 队列，LPUSH + LPOP = 栈；7.0+ listpack 替代 ziplist。

### 模式 12：Stream 类型 + 消费者组（消息持久化）

**问题场景**：Pub/Sub 是 fire-and-forget——消息不持久化，重连丢失。需 Kafka 风格"消息持久化 + 消费者组 + 消费进度"。

**解决方案**：`streamAppendItem` 生成 ID（ms-seq）存到 radix tree；`XREADGROUP` 消费者组读取（一条消息只被一个 consumer 处理） + `PEL`（Pending Entry List）记录未确认 + `XACK` 确认。

**关键参数**：
- 命令 = `XADD` / `XREAD` / `XREADGROUP` / `XACK` / `XPENDING` / `XCLAIM` / `XTRIM`
- ID 格式 = `ms-seq`（如 `1234-0`）/ `*`（服务器生成）
- `XADD MAXLEN ~ 1000` 限制流大小
- `XREAD BLOCK 5000` 阻塞读节省 CPU

**最佳实践**：Stream 适合"消息持久化 + 至少一次投递"；消费者组 = 消息只被一个 consumer 处理；不用消费者组的 XREAD 消息不会"标记已读"。

### 模式 13：Lua 脚本 + EVALSHA（原子性）

**问题场景**：业务需"多个命令原子执行"——事务（MULTI/EXEC）不支持复杂逻辑（无 if/else）。Redis 用 Lua 脚本（5+ 起 EVAL）——脚本在 Redis 单线程内执行，天然原子。

**解决方案**：`EVAL` 上传 Lua 源到 server（编译 + 缓存）→ 注入到 Lua runtime（带 `redis.call` / `pcall` 库）→ 在 `lua_pcall` 里跑 → `redis.call` 翻译为 C 函数 `call()`。`EVALSHA` 只传 SHA1 哈希（节省带宽）。

**关键参数**：
- Lua API = `redis.call(cmd, ...)` / `redis.pcall(cmd, ...)` / `redis.error_reply()` / `KEYS[1..N]` / `ARGV[1..N]`
- 超时 = 默认 5s（`lua-time-limit`），超时被 `SCRIPT KILL`
- 函数库 = 默认禁用 `os` / `io` / `debug`

**最佳实践**：复杂业务用 Lua 避免竞态（库存扣减等）；用 `EVALSHA` 节省带宽；避免 Lua 死循环；不要在 Lua 内 `redis.call('KEYS', '*')`（影响复制）。

### 模式 14：GEO 地理空间 + HyperLogLog 基数估算

**问题场景**：业务需"附近的用户"（地理查询）、"独立访客数 UV"（基数估算）。GEO 6.2+ 支持附近查询（GEOSEARCH）；HLL 2.8+ 估算基数，错误率 ~0.81%，内存恒定 12KB/key。

**解决方案**：GEO 用 SortedSet 存 52-bit geohash 作为 score——`geoAdd` 算 geohash 11 位精度 + ZADD；HLL 用 16384 个 6-bit 寄存器（14 字节/寄存器 × 16384 = 12KB 恒定），按位图算法估算基数。

**关键参数**：
- GEO 命令 = `GEOADD` / `GEODIST` / `GEOHASH` / `GEOPOS` / `GEOSEARCH`（6.2+）/ `GEORADIUS`（已弃用）
- HLL 命令 = `PFADD` / `PFCOUNT` / `PFMERGE`
- HLL 内存 = 每个 key 12KB 恒定（百万级 UV 计数）
- HLL 错误率 = ~0.81%

**最佳实践**：GEO 精度 5-6 位 = 城市级；HLL 用"估算"——精确 UV 用 Set（O(去重) 内存）；HLL 适合 DAU/MAU/搜索 UV 等"近似够用"场景。

### 模式 15：Pub/Sub 消息发布订阅（fire-and-forget）

**问题场景**：业务需"广播消息"——一个发布者 N 个订阅者。Redis Pub/Sub 是 fire-and-forget 模式，订阅者断线 = 消息丢失。

**解决方案**：`pubsubSubscribeChannel` 把 channel 加到 `client.pubsub_channels` 字典 + 反向索引 `server.pubsub_channels` (channel → client 列表)；`pubsubPublishMessage` 遍历所有订阅者 `addReplyPubsubMessage` 写输出缓冲。

**关键参数**：
- 命令 = `SUBSCRIBE` / `UNSUBSCRIBE` / `PUBLISH` / `PSUBSCRIBE pattern*` / `PUBSUB CHANNELS` / `PUBSUB NUMSUB`
- 7.0+ Sharded Pub/Sub = 分片到节点，高吞吐
- 客户端心跳 = `PING` 间隔 < TCP keepalive（保持连接）

**最佳实践**：Pub/Sub 不持久化——断线即失；简单聊天/通知用 Pub/Sub，关键消息用 Stream；百万订阅者扇出爆炸——分片或换 Kafka。

## 第四段：实战范式

### 模式 16：内存淘汰策略（8 种 maxmemory-policy）

**问题场景**：Redis 内存满时怎么办？8 种淘汰策略，从"不淘汰（OOM 报错）"到"近似 LFU 淘汰"。

**解决方案**：`performEvictions` 采样 N 个 key（默认 5，`maxmemory-samples 10` 提高精度）→ 放入 evict pool（最差 N 个 key）→ 删 pool 中最差 key。

**关键参数**：
- 策略 = `noeviction`（写 OOM，默认）/ `allkeys-lru`（缓存场景）/ `volatile-lru`（混合）/ `allkeys-lfu`（4.0+ 抗突发）/ `volatile-lfu` / `allkeys-random` / `volatile-random` / `volatile-ttl`（优先淘汰 TTL 最短）
- 采样 = `maxmemory-samples 10`（越大越准但越慢）
- LFU vs LRU = LFU 抗"突发流量"——热点保留

**最佳实践**：纯缓存 `allkeys-lru`；数据+缓存混合 `volatile-lru`（只淘汰过期）；监控 `used_memory` / `used_memory_peak` / `mem_fragmentation_ratio`（1.0-1.5 正常）。

### 模式 17：BigKey 检测与拆分（10w 阈值）

**问题场景**：单 key 太大（String > 1MB / Hash > 10w fields）会阻塞 Redis（DEL 同步、序列化慢）。需主动发现 + 拆分。

**解决方案**：`redis-cli --bigkeys` 遍历 + 按 type 找最大 key；`MEMORY USAGE mykey` 看字节数；`rdb-tools` 离线 RDB 分析（`rdb -c memory dump.rdb | sort -k4 -nr | head -20`）；拆分 Hash 按 `user_id % N` 分桶。

**关键参数**：
- BigKey 阈值 = String > 1MB / List > 10w / Hash > 10w / Set > 10w / SortedSet > 10w / Stream > 10w
- DEL 大 key = 用 `UNLINK`（异步）避免阻塞

**最佳实践**：定期 `redis-cli --bigkeys`；HGETALL 大 hash 阻塞数百 ms；监控 `slowlog get`——大 key 操作进慢查询。

### 模式 18：慢查询日志 slowlog（10ms 阈值）

**问题场景**：Redis 命令执行超过阈值（默认 10ms）需记录到慢查询日志——类似 MySQL slow log。

**解决方案**：`slowlogPushEntryIfNeeded` 在命令执行后 `commandTimeSnapshot` 算耗时 → 超阈值构造 `slowlogEntry`（id/timestamp/duration/argv）→ 头插 `server.slowlog` 链表 + 限长（默认 128 条）。

**关键参数**：
- `slowlog-log-slower-than` = 10000（10ms），生产建议 5000（5ms 记录更细）
- `slowlog-max-len` = 128 条
- 命令 = `SLOWLOG GET [n]` / `SLOWLOG LEN` / `SLOWLOG RESET`

**最佳实践**：常见慢命令 `KEYS *` (O(n)) / `HGETALL` (大 hash) / `SMEMBERS` (大 set)；`MONITOR` 短时间抓包诊断"突发慢"——长时间开性能跌 10x。

### 模式 19：Pipeline + 事务 + Lua 三件套对比

**问题场景**：客户端发 100 个 GET 命令——100 次 RTT。Pipeline 把多条命令打包发送，服务器批量处理。"原子性"需事务（MULTI/EXEC）或 Lua 脚本。

**解决方案**：客户端 `pipe.set/get/execute` 一次 RTT 发送 N 命令；MULTI/EXEC 事务 server 端串行执行（不支持复杂逻辑）；Lua 脚本 server 端原子执行（支持 if/else）。

**关键参数**：
- Pipeline = 批量发送，无原子性（穿插其他命令）
- MULTI/EXEC = 原子执行，EXEC 不全回滚（部分失败）
- Lua = 原子 + 复杂逻辑 + 单槽限制
- Cluster 限制 = 上述三者都限单槽，跨槽用 hash tag

**最佳实践**：批量写用 Pipeline（5x 性能提升）；原子 + 简单逻辑 MULTI/EXEC；原子 + 复杂逻辑 Lua；Cluster 下用 hash tag 强制同槽。

### 模式 20：7 天复刻 mini-redis 路线

**问题场景**：想理解 Redis 单线程事件循环 + 数据结构 + 持久化 + 集群协议全栈；想 7 天复刻 MVP。

**解决方案**：7 天 MVP（C 语言）——Day 1 事件循环（epoll + aeMain），Day 2 RESP 协议 + 简单命令（GET/SET/DEL），Day 3 dict 哈希表 + 渐进 rehash，Day 4 skiplist + List/Hash/Set，Day 5 RDB + AOF，Day 6 Replication + Sentinel，Day 7 Cluster 槽位 + Gossip。

```
Day1: ae 库（epoll/kqueue 抽象）+ 单线程事件循环
Day2: RESP 2 协议 + GET/SET/DEL/PING/INFO 命令
Day3: dict 哈希表（双表渐进 rehash）+ robj 统一对象
Day4: skiplist（SortedSet）+ List（quicklist）+ Hash + Set
Day5: RDB 二进制快照 + AOF 追加日志 + 混合持久化
Day6: Replication（PSYNC 增量）+ Sentinel（投票 + 故障转移）
Day7: Cluster（crc16 槽位 + Gossip + MOVED/ASK 重定向）
```

**关键参数**：
- 核心 = ae 事件循环 + dict 渐进 rehash + RESP 协议
- 协议 = RESP2（5 种前缀）/ RESP3（扩展）
- 集群 = 16384 槽 + Gossip + 多数选主
- 复刻难度 = 核心 2000 行可讲清，全栈 4-6 周

**最佳实践**：复刻 mini-redis 先做 ae + RESP + dict——核心 2000 行 2 周能出可用品；不要从 Cluster 起手（协议复杂度高）。

## 附录：3 段必读代码

1. `redis/src/ae.c` — 事件循环核心（aeMain / epoll 抽象）
2. `redis/src/dict.c` — 哈希表（渐进 rehash / 双表切换）
3. `redis/src/cluster.c` — 集群协议（crc16 槽位 / Gossip / 选主）

## 一句话总结

redis = 10 万行 C 实现 in-memory data structure server + 单线程事件循环（ae 库）+ RESP 协议（5 种前缀）+ dict 渐进 rehash（ht[2] 双表）+ skiplist（SortedSet）+ RDB（紧凑二进制）/ AOF（追加日志）+ Replication（PSYNC 增量）+ Sentinel（quorum 投票）+ Cluster（16384 槽 + Gossip）+ 8 种淘汰策略 + Stream 消费者组，7.4 走 Multi Part AOF + listpack + Sharded Pub/Sub，单线程哲学贯穿所有设计——是单核 CPU cache 友好的极致工程典范。
