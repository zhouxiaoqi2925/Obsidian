# Redis - 内存数据结构服务器

**GitHub**: redis/redis
**Star**: 68k+
**语言**: C
**主题**: in-memory、cache、nosql、key-value
**适用场景**: 缓存、Session、排行榜、消息队列、实时统计

---

## 一、基础范式

### 模式 1 · 单线程事件循环（Event Loop）

**问题场景**：传统 DB 多线程复杂锁，内存 KV 想简单又高吞吐。

**解决方案**：Redis 单线程跑 `aeMain` 事件循环，`epoll` 监听多路复用，所有命令串行执行；6.0+ 引入多 IO 线程（仅 IO），命令执行仍单线程。

**关键参数**：
- `ae.c` 事件循环
- `epoll` / `kqueue`
- 单命令线程
- 6.0+ 多 IO
- 100 万 QPS

**最佳实践**：所有 KV 场景用 Redis 单线程模型，避免锁 + 上下文切换。

### 模式 2 · 8 种数据结构（String/List/Hash/Set/ZSet/HyperLogLog/Stream/Geo）

**问题场景**：纯 KV 解决不了复杂场景（队列 / 排行榜 / 计数器）。

**解决方案**：Redis 8 大数据结构：`String`（KV + 计数器）/ `List`（队列 / 栈）/ `Hash`（对象）/ `Set`（标签 / 去重）/ `ZSet`（排行榜）/ `HyperLogLog`（UV）/ `Stream`（消息流）/ `Geo`（位置）。

**关键参数**：
- `String` / `INCR`
- `List` / `LPUSH` / `RPOP`
- `Hash` / `HSET`
- `ZSet` / `ZADD` / `ZRANGE`
- `Stream` / `XADD`

**最佳实践**：选对数据结构是 Redis 高性能的关键，Set/ZSet 复杂度 O(log N)。

### 模式 3 · RESP 协议（Redis Serialization Protocol）

**问题场景**：客户端怎么和 Redis 通信。

**解决方案**：Redis 用 RESP 协议，纯文本 + 二进制混合，5 种类型：`+OK`（简单字符串）/`-ERR`（错误）/`$5\r\nhello\r\n`（bulk string）/`*3\r\n`（数组）/`:`（整数）；TypeScript 解析简单。

**关键参数**：
- RESP2 / RESP3
- 5 种类型
- bulk string
- 数组
- inline 命令

**最佳实践**：所有自定义 Redis 客户端用 RESP 协议直接解析，< 100 行代码。

### 模式 4 · 持久化（RDB 快照 + AOF 日志）

**问题场景**：内存数据易失，重启丢失。

**解决方案**：Redis 两种持久化：① RDB 定时快照（`SAVE` / `BGSAVE`，子进程写 dump.rdb）② AOF 追加日志（`appendfsync everysec`，重写压缩）。可单独或混合使用。

**关键参数**：
- `RDB` 快照
- `AOF` 日志
- `BGSAVE` 子进程
- `AOF` 重写
- 混合模式

**最佳实践**：所有生产 Redis 启用 AOF + 定期 RDB，恢复精度 1 秒。

### 模式 5 · 过期策略（惰性 + 定期）

**问题场景**：过期 key 占内存，手动删除不及时。

**解决方案**：Redis 两种过期策略：① 惰性删除（访问时检查）② 定期抽样删除（`activeExpireCycle` 每 100ms 抽 20 个过期 key）。两者结合避免内存泄漏。

**关键参数**：
- 惰性删除
- `activeExpireCycle`
- 抽样 20 个
- 100ms 周期
- 不阻塞

**最佳实践**：所有 key 必须 `EXPIRE`，不设过期 = 内存炸弹。

---

## 二、扩展范式

### 模式 6 · Pub/Sub 消息订阅

**问题场景**：需要实时消息通知（聊天 / 通知）。

**解决方案**：`SUBSCRIBE channel` 订阅，`PUBLISH channel msg` 发布；Redis 维护订阅列表，实时推送；缺点是无持久化，断开即丢。

**关键参数**：
- `SUBSCRIBE` 订阅
- `PUBLISH` 发布
- 模式订阅 `PSUBSCRIBE`
- 实时
- 0 持久

**最佳实践**：所有实时通知用 Pub/Sub；关键消息用 Stream 持久化。

### 模式 7 · Stream 消息流（5.0+）

**问题场景**：Pub/Sub 不持久，Kafka 太重。

**解决方案**：Redis Stream（5.0+）持久化消息流，`XADD` 入队 / `XREAD` 读取 / 消费者组（`XGROUP` / `XACK`）；每条消息唯一 ID。

**关键参数**：
- `XADD` 入队
- `XREAD` 读取
- 消费者组
- `XACK` 确认
- 历史回放

**最佳实践**：所有消息队列场景用 Stream 替代 Kafka，部署简单 10x。

### 模式 8 · Lua 脚本原子执行

**问题场景**：多个命令需要原子执行（CAS / 限流）。

**解决方案**：`EVAL "return redis.call('GET', KEYS[1])" 1 key` Lua 脚本在 Redis 单线程内原子执行；`EVALSHA` 缓存脚本。

**关键参数**：
- `EVAL` / `EVALSHA`
- `KEYS` / `ARGV`
- 原子执行
- 0 竞态
- 复杂逻辑

**最佳实践**：所有「多步原子操作」用 Lua 脚本，告别竞态条件。

### 模式 9 · 事务（MULTI/EXEC）

**问题场景**：一组命令要么都成功要么都失败。

**解决方案**：`MULTI` 开始事务，命令入队，`EXEC` 全部执行；`DISCARD` 回滚；`WATCH` 乐观锁实现 CAS。

**关键参数**：
- `MULTI` / `EXEC`
- `DISCARD`
- `WATCH` / `UNWATCH`
- 不支持回滚
- 弱事务

**最佳实践**：简单事务用 MULTI/EXEC，复杂逻辑用 Lua 脚本（更强）。

### 模式 10 · 管道（Pipeline）批量发送

**问题场景**：网络 RTT 长，1 个命令 1ms 慢。

**解决方案**：客户端一次发送 N 条命令，Redis 一次返回 N 个结果；性能提升 5-10x。

**关键参数**：
- `pipeline()`
- 批量发送
- 一次返回
- 减少 RTT
- 5-10x 提升

**最佳实践**：所有批量写入用 pipeline，告别单条往返。

---

## 三、进阶范式

### 模式 11 · Cluster 集群（16384 槽位）

**问题场景**：单实例内存有限（~256GB），需要水平扩展。

**解决方案**：Redis Cluster 16384 哈希槽分片，`CRC16(key) % 16384` 路由到节点；节点间 Gossip 协议同步状态；客户端直连（不 Proxy）。

**关键参数**：
- 16384 槽
- `CRC16` 路由
- Gossip 协议
- 客户端直连
- 100+ 节点

**最佳实践**：> 50GB 数据用 Cluster，< 50GB 用 Sentinel。

### 模式 12 · Sentinel 高可用

**问题场景**：单点故障，主从切换人工介入。

**解决方案**：Redis Sentinel 监控主从集群，3+ 哨兵选举新主，`INFO` / `PING` 健康检查；客户端连接 VIP 自动切换。

**关键参数**：
- 3+ Sentinel
- 主从切换
- 自动 failover
- 客户端 VIP
- 1 分钟恢复

**最佳实践**：所有生产 Redis 用 Sentinel 3 节点，RTO < 1 分钟。

### 模式 13 · 主从复制（Master-Replica）

**问题场景**：单点读压力大。

**解决方案**：`replicaof host port` 配置从节点，主节点 `BGSAVE` 同步 RDB + 增量 AOF；读写分离，从节点只读。

**关键参数**：
- `replicaof`
- 全量同步 RDB
- 增量同步 AOF
- 读写分离
- 异步复制

**最佳实践**：所有 Redis 至少 1 主 1 从，O(1) 恢复。

### 模式 14 · 模块系统（Redis Module）

**问题场景**：原生数据结构不够用（全文搜索 / 图 / ML）。

**解决方案**：Redis 4+ 引入 Module API（`RedisModule_CreateCommand`），C 写模块动态加载；RediSearch / RedisJSON / RedisGraph / RedisBloom 是官方模块。

**关键参数**：
- `RedisModule_*` API
- 动态加载
- RediSearch 全文
- RedisJSON JSON
- RedisBloom 布隆

**最佳实践**：所有高级场景用 Module，比纯 KV 强 10x。

### 模式 15 · I/O 多线程（6.0+）

**问题场景**：单线程网络 IO 是瓶颈（大 key / 慢客户端）。

**解决方案**：Redis 6.0+ 引入多 IO 线程（命令执行仍单线程），`io-threads 4` 配置；多线程读 + 单线程写，吞吐提升 2x。

**关键参数**：
- `io-threads`
- 多线程读
- 单线程写
- 6.0+
- 2x 吞吐

**最佳实践**：所有 > 50K QPS 场景开 io-threads，性能提升 2x。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Redis 服务。

**解决方案**：7 件套：① `redis.conf` 配置 ② 持久化（AOF + RDB）③ 主从（1 主 2 从）④ Sentinel 3 节点 ⑤ Cluster（> 50GB 时）⑥ 内存淘汰 `maxmemory-policy allkeys-lru` ⑦ 慢查询监控。

**关键参数**：
- `redis.conf`
- 持久化
- 主从
- Sentinel
- Cluster
- 淘汰策略
- 慢查询

**最佳实践**：所有生产 Redis 7 件套标准配置。

### 模式 17 · 缓存 3 大问题（穿透 / 雪崩 / 击穿）

**问题场景**：缓存使用常见 3 大故障。

**解决方案**：① 穿透（查不存在）→ 布隆过滤器 / 缓存空值 ② 雪崩（大量 key 同时过期）→ 过期时间加随机抖动 ③ 击穿（热点 key 过期）→ 互斥锁 / singleflight。

**关键参数**：
- 布隆过滤器
- 空值缓存
- 随机抖动
- 互斥锁
- singleflight

**最佳实践**：3 大问题用 3 招对症下药，零故障。

### 模式 18 · 性能优化 7 招

**问题场景**：Redis 性能瓶颈。

**解决方案**：7 招优化：① 大 key 拆分（< 1MB）② 热 key 拆分到多 key ③ Pipeline 批量 ④ Lua 脚本原子 ⑤ 长连接池 ⑥ 关闭 RDB / AOF（纯缓存）⑦ 慢查询监控 `slowlog-log-slower-than`。

**关键参数**：
- 大 key 拆分
- 热 key
- Pipeline
- Lua
- 连接池
- 慢查询

**最佳实践**：7 招叠加，Redis 吞吐从 5 万 QPS 提升到 50 万 QPS。

### 模式 19 · 与 Memcached / KeyDB / Dragonfly 对比

**问题场景**：内存 KV 选型。

**解决方案**：Redis 定位「数据结构丰富 + 持久化 + 集群」适合大多数；Memcached 定位「纯 KV + 多线程」适合简单缓存；KeyDB 定位「Redis 兼容多线程」适合高吞吐；Dragonfly 定位「Redis 兼容 + 25x 吞吐」适合超大集群。

**关键参数**：
- 吞吐：Dragonfly > KeyDB > Redis > Memcached
- 数据结构：Redis > KeyDB ≈ Dragonfly > Memcached
- 持久化：Redis > KeyDB > Dragonfly > Memcached
- 兼容性：Redis = KeyDB = Dragonfly > Memcached

**最佳实践**：默认 Redis，特殊需求选 KeyDB / Dragonfly。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Redis 做内部 KV 库。

**解决方案**：7 天分 5 步：① `ae.c` 事件循环 ② 简单 String / Hash 数据结构 ③ RESP 协议解析 ④ 持久化（RDB 快照）⑤ 主从复制。

**关键参数**：
- Day 1: 事件循环
- Day 2: 数据结构
- Day 3: RESP
- Day 4: RDB
- Day 5: 主从
- Day 6-7: 文档

**最佳实践**：7 天复刻「极简 KV」，完整 Redis 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\redis\`
- **大小**: ~10 MB
- **总文件数**: 数百 C 文件
- **关键 commit**: 7.4.x（最新稳定）
- **作者**: antirez + 社区
- **许可**: BSD-3

## 一句话总结

Redis 用「单线程事件循环 + 8 大数据结构 + 持久化 + 集群」把内存 KV 做到极致性能和易用，是缓存 / 队列 / 排行榜 场景的事实标准。
