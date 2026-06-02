# go-redis - Redis 官方 Go 客户端 v9

**GitHub**: redis/go-redis
**Star**: 21k+
**语言**: Go
**主题**: redis-client / resp-protocol / connection-pool
**适用场景**: Go 后端 / 缓存 / 会话存储 / 消息队列 / 分布式锁

---

## 第一段：基础范式

### 模式 1 - 顶层 API 三种 Client

**问题场景**：Redis 部署模式多样（单实例 / Sentinel 高可用 / Cluster 集群 / Ring 分片），客户端要一套代码兼容。

**解决方案**：go-redis 顶层暴露 4 个 client：
- `redis.NewClient` 单实例
- `redis.NewFailoverClient` Sentinel 自动 failover
- `redis.NewClusterClient` Cluster（16384 槽位）
- `redis.NewUniversalClient` 统一入口（按 `Options.MasterName / ClusterAddrs` 自动选模式）

**关键参数**：
- `redis.Options{ Addr, Password, DB, PoolSize, MinIdleConns, DialTimeout }`
- `redis.UniversalOptions{ MasterName, SentinelAddrs, Addrs }`
- `redis.NewUniversalClient(universalOptions)` 自动分发
- `client.Close()` 用 defer 关

**最佳实践**：新项目用 `NewUniversalClient`（配置驱动，避免硬编码部署模式）；不要混合 NewClient 和 NewClusterClient（行为不一致）；Close 必 defer。

### 模式 2 - 连接池（internal/pool）

**问题场景**：每请求新建 TCP 连接 100ms+ 握手，10K QPS 必爆；连接复用需 idle pool + 健康检查。

**解决方案**：`internal/pool/pool.go` ConnPool — LIFO 栈式 idle 池 + 活跃队列 + 容量上限（默认 10 * runtime.NumCPU()）。`getConn` 走 `pool.Get(ctx)`，release 走 `pool.Put(ctx, conn)`。

**关键参数**：
- `PoolSize: 10 * runtime.NumCPU()` 上限
- `MinIdleConns: 10` 预热
- `ConnMaxIdleTime: 30 * time.Minute` idle 过期
- `PoolTimeout: ReadTimeout + 1s` 取连接超时

**最佳实践**：高 QPS 服务调大 PoolSize；`MinIdleConns` 预热避免冷启动尖刺；监控 `Stats().TotalConns / IdleConns / StaleConns`；连接泄漏用 `ConnMaxLifetime` 强制回收。

### 模式 3 - Pipeline 与事务

**问题场景**：1000 个 key 顺序写各 1ms RTT = 1s 延迟；事务（MULTI/EXEC）原子性但同样多次 RTT。

**解决方案**：
- `Pipeline` 一次性发送 N 命令到 Redis 服务端，1 次 RTT 收 N 响应
- `TxPipeline` = Pipeline + MULTI/EXEC 包裹
- `Watch` 乐观锁（key 变化则 EXEC 失败）

**关键参数**：
- `pipe := client.Pipeline()` / `client.Pipelined(ctx, func(pipe Pipeliner) error {...})`
- `pipe.Set(ctx, "k", "v", 0)` `pipe.Get(ctx, "k")` `pipe.Exec(ctx)`
- `tx := client.TxPipeline()` 同上 + MULTI/EXEC
- `err := client.Watch(ctx, func(tx *Tx) error {...}, "key1")`

**最佳实践**：批量写用 Pipeline（性能提升 5-10x）；强一致事务用 TxPipeline + Watch；Pipeline 不是 atomic（中途失败部分命令生效），需要 atomic 用 TxPipeline。

### 模式 4 - 集群路由与槽位重定向

**问题场景**：Redis Cluster 16384 槽位分布 N 节点；key 落到不同节点需要正确路由；节点扩容/缩容时槽位迁移要处理 MOVED/ASK。

**解决方案**：`internal/routing/` 实现：
- `CRC16(key) % 16384` 算槽位
- `MOVED` 永久重定向（更新路由表）
- `ASK` 临时重定向（不更新，下次重试）
- `crossSlot` 错误（Pipeline 多 key 跨槽位）

**关键参数**：
- `ClusterClient.Process(ctx, cmd)` 先算 slot
- 路由表 `slots[slot] -> nodeAddr`
- `cmd.SetReadOnly()` 走从节点（读写分离）
- `{user1000}.profile` hashtag 把同一 user 多 key 锁到一节点

**最佳实践**：Cluster 用 hashtag `{}` 把多 key 锁到同 slot；Pipeline 多 key 必须同 slot 否则 `CROSSSLOT`；读写分离 `cmd.SetReadOnly()` 配从节点（最终一致）；监控 MOVED 频率判断是否扩缩容抖动。

### 模式 5 - 协议层（internal/proto）

**问题场景**：RESP2 / RESP3 协议演进（2020 Redis 6 引入 RESP3），客户端要兼容新老协议。

**解决方案**：`internal/proto/reader.go` / `writer.go` 统一编解码。`reader: *proto.Reader` 用 `bufio.Reader` + 自定义 `ReadReply` 解析 RESP 类型 tag（`*` / `$` / `:` / `%` / `>` / `~`）。

**关键参数**：
- RESP2: `*N\r\n$N\r\n...\r\n` array / bulk string
- RESP3: `%N\r\n+N\r\nkey\r\n+N\r\nvalue\r\n` map / set / push
- `proto.NewReader(bufio.NewReader(conn))`
- `writer.WriteArg(v interface{})` 序列化参数

**最佳实践**：RESP3 默认开启（Redis 6+）但 RESP2 兼容；大 value 用流式 `proto.NewReader` + 循环 `Read`；监控协议解析错误（malformed response）多为 Redis 端异常。

---

## 第二段：扩展范式

### 模式 6 - Pub/Sub 长连接

**问题场景**：实时消息推送（聊天 / 通知 / 行情）需要 Pub/Sub 订阅；连接断开要重订阅。

**解决方案**：`client.Subscribe(ctx, "channel1", "channel2")` 返回 `*PubSub`，内部持长连接。`ps.Receive(ctx)` / `ps.Channel()` 返回 Go channel 流式消息。

**关键参数**：
- `sub := client.Subscribe(ctx, "news")`
- `ch := sub.Channel()` buffer 100 消息
- `sub.Close()` 关闭订阅
- `PSubscribe(ctx, "news.*")` 模式匹配

**最佳实践**：高吞吐消息用 `ps.Channel()` 而非 `ps.Receive`（内部已 buffer）；断线重连 go-redis v9 自动处理；用 `WithChannelHealthCheckInterval` 配置健康检查；Pub/Sub 消息不持久化（用 Streams 持久化）。

### 模式 7 - Streams（持久化消息队列）

**问题场景**：消息队列要持久化（Pub/Sub 不持久）、消费者组（多消费者分摊）、ACK 机制（保证消费成功）。

**解决方案**：Redis Streams（5.0+）— `XADD` / `XREAD` / `XREADGROUP` / `XACK` / `XLEN`。go-redis 提供 `client.XAdd / XRead / XReadGroup / XAck / XPending`。

**关键参数**：
- `XAdd(ctx, &XAddArgs{ Stream: "mystream", Values: map[string]interface{}{"k":"v"} })` 返回 ID
- `XReadGroup(ctx, &XReadGroupArgs{ Group, Consumer, Streams: []string{"mystream", ">"} })`
- `XAck(ctx, "mystream", "group", id)` 确认消费
- 消费者组 `XGroupCreateMkStream`

**最佳实践**：Stream 替代 Kafka（轻量场景 < 10K msg/s）；消费者组实现负载均衡（多 Consumer 分担）；`XPENDING` 看未 ACK 消息；`XAUTOCLAIM` 接管卡死消息。

### 模式 8 - Lua 脚本原子操作

**问题场景**：多个 Redis 命令需原子（如"GET key + INCR"），MULTI/EXEC 慢且不能基于中间值决策。

**解决方案**：`EVAL` / `EVALSHA` 跑服务端 Lua；`client.ScriptLoad + EvalSha` 缓存 SHA 减少传输；`client.Eval` 简单调用。

**关键参数**：
- `client.Eval(ctx, "return redis.call('SET', KEYS[1], ARGV[1])", []string{"key"}, "value")`
- `client.ScriptLoad(ctx, luaScript)` 返回 SHA
- `client.EvalSha(ctx, sha, []string{"key"}, "value")`
- `client.ScriptExists(ctx, sha)` 验证缓存

**最佳实践**：分布式锁用 SET NX EX + Lua 释放（原子 check+del）；Lua 内禁用 `redis.call` 长时间操作（阻塞 server）；`EVALSHA` 比 `EVAL` 节省 70% 带宽。

### 模式 9 - 连接池 Hooks

**问题场景**：需要 trace Redis 调用（OpenTelemetry）、埋点 metrics、记录慢查询。

**解决方案**：`internal/pool/hooks.go` — `type Hook interface { DialHook(next DialHook) DialHook; ProcessHook(next ProcessHook) ProcessHook }`。`AddHook(hook)` 注册。

**关键参数**：
- `client.AddHook(&myHook{})`
- `ProcessHook` 包裹命令执行，注入 span
- `DialHook` 包裹新建连接
- `redisotel` 官方 OpenTelemetry 集成

**最佳实践**：所有 Go 服务统一用 OpenTelemetry 追踪；`redisotel.InstrumentTracing(client)` 一行启用；慢查询日志 > 10ms 告警；`Prometheus` exporter 暴露 QPS / 延迟 / 错误率。

### 模式 10 - 拓展生态（extra/）

**问题场景**：go-redis 本身只做客户端，metrics / tracing / census / 命令分析等需求需额外包。

**解决方案**：
- `redisotel` OpenTelemetry 集成
- `redisprometheus` Prometheus 集成
- `rediscensus` Redis Labs Census 集成
- `rediscmd` 命令分析（debug 看慢命令）
- `maintnotifications` Cluster 维护通知

**关键参数**：
- `redisprometheus.NewMonitor(client, "redis", 30*time.Second)` 自动注册
- `redisotel.InstrumentTracing(client)` OTel
- `maintnotifications.New(client, logger)` 监听 MaintNotify

**最佳实践**：Prometheus / OTel 集成是 observability 三件套标配；`maintnotifications` 在 Redis 7+ 启用（主动推送维护窗口）；`rediscmd` 在 dev 环境看慢命令分布。

---

## 第三段：进阶范式

### 模式 11 - 分布式锁

**问题场景**：多实例并发写共享资源（秒杀库存 / 分布式任务调度）需要互斥。

**解决方案**：`SET key value NX EX 30` + Lua 释放（`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end`）。v9 提供 `redislock` 库封装 `Obtain / Refresh / Release`。

**关键参数**：
- `obtainer, _ := redislock.New(redislock.Options{ Client: rdb, Tries: 3, RetryDelay: 100*time.Millisecond, Expiry: 10*time.Second })`
- `lock, _ := obtainer.Obtain(ctx, "my-key")` 返回 lock handle
- `lock.Refresh(ctx, 10*time.Second, nil)` 续期（看门狗）
- `lock.Release(ctx)` 释放

**最佳实践**：锁必须有 TTL（防死锁）；释放用 Lua 原子 check+del（防误删）；续期间隔 < TTL/3（避免看门狗失效）；非关键业务用乐观锁 / 数据库行锁替代。

### 模式 12 - 连接池 Sticky 模式

**问题场景**：Pub/Sub / Watch / 多命令严格顺序执行时，连接必须"专用"（不能被其他 goroutine 抢走）。

**解决方案**：`pool_sticky.go` — `StickyPool` 把连接绑到 goroutine 直至显式释放。`watchCmd := client.Watch(ctx, func(tx *Tx) error { ... }, "key")` 内部自动 sticky。

**关键参数**：
- `client.Watch(ctx, fn, "key")` 自动 sticky
- `client.Do(ctx, "MULTI")` 起事务
- `client.Subscribe(ctx, "ch")` 内部 sticky
- 手动 `pool.Conn()` / `conn.Close()`

**最佳实践**：Watch / Tx / Pub/Sub 内部已 sticky，业务不用关心；自定义长连接用 `client.Conn()` + `defer conn.Close()`。

### 模式 13 - 单连接模式（pool_single.go）

**问题场景**：脚本调试、单元测试、嵌入式场景只需要 1 个连接。

**解决方案**：`SinglePool` — 全局 1 个连接，串行执行。`client := redis.NewClient(&redis.Options{ PoolSize: 1 })`。

**关键参数**：
- `PoolSize: 1`
- `MinIdleConns: 1` 预热
- 串行执行所有命令
- 性能差（无并发）但简单

**最佳实践**：仅在 test / debug 用；生产用 `PoolSize: 10 * NumCPU()`；`PoolSize = 1` 易排查连接泄漏（所有命令串行）。

### 模式 14 - ACL 认证（Redis 6+）

**问题场景**：Redis 6+ 引入 ACL（用户粒度权限），客户端要支持用户名 + 密码。

**解决方案**：`Options{ Username: "alice", Password: "secret" }` go-redis v9 自动加 `AUTH username password`。

**关键参数**：
- `Username` 默认 "default"
- `Password` 必填（即使 ACL 允许空）
- 多用户可创建不同 client
- `redis.NewClient` 与 `NewClusterClient` 都支持

**最佳实践**：生产用 ACL（弃用单密码）；每个服务一个 Redis 用户（最小权限）；密码走 Vault / KMS；监控 ACL 失败次数（暴力破解）。

### 模式 15 - Cluster 拓扑自动发现

**问题场景**：Cluster 节点增删，客户端路由表要更新（CLUSTER NODES / CLUSTER SLOTS）。

**解决方案**：`osscluster.go` 内部用 `clusterSlots` 命令拉取槽位映射，缓存到 `state *clusterState`。节点变化触发 `reloadSlots` 重拉。

**关键参数**：
- `ClusterSlotsRefreshTimeout: 1*time.Second`
- `ClusterReadFromReplica` 路由从节点
- `RouteByLatency` 选最低延迟
- `RouteRandomly` 随机负载均衡

**最佳实践**：默认 `ReadFrom: ReadFromClosest`（按延迟）；新版本用 `RouteByLatency` 智能路由；监控 `MOVED` 重定向频率（频繁说明拓扑变更抖动）；`ReadTimeout` 不要小于 ping 间隔（防误杀）。

---

## 第四段：实战范式

### 模式 16 - 缓存设计模式

**问题场景**：DB 高负载（查询 50ms 慢）需要缓存层；缓存更新 / 失效策略要明确。

**解决方案**：四种经典模式：
- **Cache-Aside**：应用先读 cache，miss 读 DB 再回填
- **Read-Through**：cache 内部读 DB，应用不感知
- **Write-Through**：写 cache 同时写 DB
- **Write-Behind**：写 cache 异步批量写 DB

**关键参数**：
- `rdb.Get(ctx, "user:1")` → hit 返回，miss 查 DB
- `rdb.Set(ctx, "user:1", userJSON, 1*time.Hour)` 写 cache
- 失效：`rdb.Del(ctx, "user:1")`
- 防击穿：NX SET lock → 查 DB → SET cache → DEL lock

**最佳实践**：90% 场景用 Cache-Aside；缓存 TTL 不宜过长（最终一致窗口）；防击穿用 singleflight（`golang.org/x/sync/singleflight`）合并并发请求；防雪崩用随机 TTL（base + rand）。

### 模式 17 - 限流与计数

**问题场景**：API 限流（每用户 100/s）、计数器（点赞数）、滑动窗口（最近 1h 活跃用户）。

**解决方案**：
- 固定窗口：`INCR rate:user:1min` + `EXPIRE 60`
- 滑动窗口：sorted set ZADD + ZREMRANGEBYSCORE
- 令牌桶：Lua 脚本（time-based refill）

**关键参数**：
- `rdb.Incr(ctx, "rate:user:1")` + `rdb.Expire(ctx, "rate:user:1", time.Minute)`
- 滑动窗口：`ZADD key score=now member=now` `ZREMRANGEBYSCORE key 0 (now-window)` `ZCARD key`
- 令牌桶 Lua：原子更新 token 数

**最佳实践**：固定窗口实现简单但边界突发（每分钟 0-1s 集中打）；滑动窗口精准但 sorted set 占内存；分布式限流用 Redis（多实例共享计数）。

### 模式 18 - 排行榜（Sorted Set）

**问题场景**：游戏积分榜、热搜榜、销量榜需要实时排序（按 score 降序）。

**解决方案**：ZSET（Sorted Set）— `ZADD` 加成员 + score，`ZREVRANGE` 排序，`ZREVRANK` 排名，`ZINCRBY` 增 score。

**关键参数**：
- `rdb.ZAdd(ctx, "leaderboard", redis.Z{ Score: 100, Member: "alice" })`
- `rdb.ZRevRangeWithScores(ctx, "leaderboard", 0, 9)` Top 10
- `rdb.ZRevRank(ctx, "leaderboard", "alice")` 排名
- `rdb.ZIncrBy(ctx, "leaderboard", 10, "alice")` 加分

**最佳实践**：ZSET 用于实时排行（< 100W 成员）；海量（亿级）用 ClickHouse / StarRocks；同 score 按 member 字典序（业务可加 timestamp 作次排序）；定期 `ZREMRANGEBYRANK` 清理尾部。

### 模式 19 - 分布式 Session

**问题场景**：Web 应用多实例，Session 存内存不共享；存 DB 太慢。

**解决方案**：Redis 存 Session — 用户登录 `SET session:<token> userJSON EX 3600`，每个请求验证 token。`HSET session:<token> k1 v1 ...` 存多字段。

**关键参数**：
- `rdb.HSet(ctx, "session:"+token, "user_id", uid, "expires", exp)` 写
- `rdb.HGetAll(ctx, "session:"+token)` 读
- `rdb.Expire(ctx, "session:"+token, 30*time.Minute)` 续期
- 滑动过期：每访问重设 TTL

**最佳实践**：Session token 必用加密随机（`crypto/rand`）；存 hash 不存 string（避免大 key）；用 `EXPIREAT` 替代 `EXPIRE`（绝对时间）；登出 `DEL session:<token>` 主动失效。

### 模式 20 - 监控与可观测性

**问题场景**：Redis 客户端层有故障（连接池满、慢查询、错误率上升）需要及时发现。

**解决方案**：
- Prometheus metrics：`client.PoolStats()` 暴露 `redis_pool_hits / misses / timeouts / total_conns / idle_conns / stale_conns`
- OpenTelemetry tracing：`redisotel.InstrumentTracing(client)` 自动 span
- 慢查询日志：`SlowThreshold: 100*time.Millisecond` 自动 log

**关键参数**：
- `PoolStats { Hits, Misses, Timeouts, TotalConns, IdleConns, StaleConns }`
- `redisprometheus` 自动注册 metric
- `redisotel` 注入 trace context
- `SlowLogGet(ctx, 128)` 读 Redis 服务端慢日志

**最佳实践**：必暴露 `redis_pool_hits` / `redis_pool_misses`（misses 高 = 池不够大）；`SlowLog` 服务端 + 客户端双向记；告警 `redis_errors_total` > 阈值；分布式追踪采样率 1%-10%。
