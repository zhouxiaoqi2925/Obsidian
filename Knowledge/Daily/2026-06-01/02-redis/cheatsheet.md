# 《Redis》速查卡

> 入口在 [[README|README.md]]｜分类：Backend/KV｜⭐⭐⭐⭐⭐｜适用：缓存/分布式锁/限流/排行/Pub-Sub/Stream

---

## 🎯 一句话价值

**单线程事件循环 + 极致工程化 = 内存 KV 之王**：10w+ QPS 单核，命令 0.1ms 量级，内存优化到字节级。

---

## 🧠 3 个核心洞察（必背）

1. **IO 是瓶颈不是 CPU**：单线程反而快 (无锁无上下文切换，代码可预测可调试)
2. **渐进式 rehash**：所有需要扩容的运行时数据结构都该学 (dict / 数据库索引 / HashMap)
3. **SDS 模式**：C 字符串处理的天花板 (O(1) 长度 + 二进制安全 + 5 种 header 按需选)

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `src/ae.c:aeMain` | 死循环 + stop 标志，BEFORE/AFTER_SLEEP 钩子给 cluster + AOF |
| 2 | `src/server.c:processCommand` | OOM → auth → ACL → lookupCommand → call 完整命令路由 |
| 3 | `src/sds.c:sdsnewlen` | 5 种 header (hdr5/8/16/32/64) 按长度选，O(1) 取长 |
| 4 | `src/dict.c:dictAddRaw` | 渐进式 rehash + 2 个 ht_table + 强制扩容保护 |
| 5 | `src/networking.c:readQueryFromClient` | EAGAIN 即停 + 拼包 + inline/multi-bulk 双协议解析 |

---

## ⚡ 性能数字（4 核, 1w QPS, 1KB SET）

| 场景 | 组件 | 延迟 | 备注 |
|------|------|------|------|
| 单条 SET 1KB | 完整链路 | ~0.3ms | epoll+parse+dictSet+aof |
| GET 命中 (无持久化) | dictFind | ~0.05ms | hash 命中+memcpy |
| pipeline 100 命令 | 1 RTT | ~10ms | vs 100 RTT 50ms 5x 加速 |
| 1M entry dict 扩容 | 渐进式 | 100ms | 1w 操作完成 rehash |
| BGSAVE fork | RDB | < 1s | 内存 8GB + COW |
| AOF rewrite | AOF | < 1s | 同样 fork 机制 |
| PING (空跑) | aeProcessEvents | ~0.1ms | 包含 epoll_wait + cron |
| ACL 拒绝 | commandCheck | < 0.05ms | O(args) 遍历 user 权限 |
| 集群路由 (slot 计算) | CRC16 | ~50ns | key 字符串 hash 取模 16384 |
| client 连接 accept | 多路复用 | ~0.1ms | 单线程 accept 不阻塞 |

**结论**：单条命令 0.1-0.3ms，10w QPS 离 CPU 极限还远；瓶颈是网络/内存/持久化，不是 Redis 本身。

---

## 🌳 决策树：什么时候用什么数据结构

```
你的数据?
  │
  ├── 简单 KV + 缓存 → string (SET/GET)
  │
  ├── 计数器 (点赞, 浏览)
  │     ├── < 阈值自动 int (无 malloc)
  │     └── 用 INCR/DECR (O(1) 原子)
  │
  ├── 对象多个字段 (用户资料)
  │     ├── 字段数 < 128 + value < 64B → hash (listpack 编码, 省内存)
  │     └── 否则 → hash (dict 编码, 性能稳)
  │
  ├── 队列 (任务, 消息)
  │     ├── 短 (< 128) → list (listpack 压缩)
  │     └── 长 → list (quicklist = listpack 链表)
  │
  ├── 标签 / 共同好友
  │     ├── 全整数 → set (intset 紧凑)
  │     └── 否则 → set (dict)
  │
  └── 排行榜 / 范围查询
        ├── < 128 → zset (listpack 编码)
        └── 否则 → zset (skiplist + dict 双结构, O(logN) 排 + O(1) 排名)
```

---

## 🚀 命令分组速查

### 基础 KV
```bash
SET foo bar                # string
GET foo
SET foo bar EX 60          # 60s 过期
SETNX lock 1               # 分布式锁 (key 不存在才 set)
INCR counter               # 原子 +1
MSET k1 v1 k2 v2 k3 v3     # 批量 set
MGET k1 k2 k3              # 批量 get
EXISTS key                 # 是否存在
DEL key                    # 删除
EXPIRE key 60              # 设过期
TTL key                    # 看剩余
```

### Hash (对象)
```bash
HSET user:1 name "alice" age 30
HGET user:1 name
HMSET user:1 name "bob" age 25       # 批量 (deprecated, 用 HSET 多参数)
HGETALL user:1
HINCRBY user:1 age 1                 # 原子 +
HSCAN user:1 0 MATCH "addr:*"        # 增量遍历
```

### List (队列)
```bash
LPUSH queue "task1"
RPUSH queue "task2"
LPOP queue                            # 阻塞: BLPOP queue 0
LRANGE queue 0 9                      # 取前 10
LLEN queue
LTRIM queue 0 999                     # 保留前 1000
```

### Set (标签)
```bash
SADD tags:user:1 "rust" "redis" "k8s"
SISMEMBER tags:user:1 "redis"          # 是否存在
SINTER tags:1 tags:2                  # 交集 (共同关注)
SUNION tags:1 tags:2                  # 并集
SCARD tags:user:1                      # 数量
SRANDMEMBER tags:1 5                  # 随机 5 个
```

### Zset (排行榜)
```bash
ZADD rank 100 "alice" 200 "bob"
ZREVRANGE rank 0 9 WITHSCORES          # 倒序前 10
ZRANK rank "alice"                    # 名次 (升序)
ZREVRANK rank "alice"                 # 名次 (降序)
ZSCORE rank "alice"                   # 分数
ZINCRBY rank 10 "alice"               # 加分
ZRANGEBYSCORE rank 100 200            # 分数区间
```

### Stream (消息流, 5.0+)
```bash
XADD mystream * sensor 1234
XREAD COUNT 100 STREAMS mystream 0
XLEN mystream
XRANGE mystream - + COUNT 10
XGROUP CREATE mystream mygroup $ MKSTREAM
XREADGROUP GROUP mygroup consumer1 COUNT 10 STREAMS mystream >
```

### 分布式
```bash
SET lock:foo 1 NX EX 10               # 加锁
DEL lock:foo                          # 解锁 (注意: 要带 token 防误删)
WAIT 1 1000                           # 等 1 个 replica 同步, 最多 1s
CLUSTER SLOTS                         # 看集群分布
CLUSTER KEYSLOT foo                    # 看 key 的 slot
ASK 1234 127.0.0.1:7001                # 客户端跟随重定向
```

### 运维
```bash
INFO memory
INFO replication
INFO cluster
INFO commandstats
SLOWLOG GET 10
SLOWLOG LEN
SLOWLOG RESET
MONITOR                                # 实时看所有命令
CLIENT LIST
CONFIG GET maxmemory
CONFIG SET maxmemory 2gb
DEBUG SLEEP 5                          # 模拟主线程卡 5s
```

---

## ⚠️ 必避 3 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **大 key (单 key > 10MB)** | GET 阻塞整个 Redis, P99 飙 | 拆 key (user:1:profile:detail), bigkeys 找, 业务限制 |
| **KEYS 命令** | O(n) 阻塞主线程, 业务全停 | 用 SCAN (增量, 游标) |
| **未设 maxmemory** | OOM 后被 Linux OOM-killer 杀 | 必设, 推荐 `maxmemory-policy allkeys-lru` |

### 4 个隐藏坑

- **UNLINK vs DEL**: DEL 同步阻塞 (删大 key 卡顿), UNLINK 异步 (丢后台线程) — 4.0+ 后者快 100x
- **AOF always**: 每条命令 fsync, 1w QPS = 1w 次 fsync = 磁盘爆, 改 `everysec` (丢 1s 数据)
- **Cluster 多 key**: MSET/SUNION 等多 key 命令, key 不在同 slot 直接报错, 用 `{tag}key1` hash tag 强制同 slot
- **客户端重试**: 主从切换瞬间, 客户端连接断开, 没重试就丢数据, 用 Lettuce/Redisson 自动重连

---

## 🔄 Redis vs 类似方案决策树

```
要内存 KV + 极致性能?
  │
  ├── 是 + 数据 < 内存 → Redis (首选)
  │
  ├── 强一致 + 事务 → etcd (Raft) / Consul
  │
  ├── 大 value (>1MB) + 文档 → MongoDB
  │
  ├── 关系查询 + SQL → PostgreSQL
  │
  ├── 时序数据 → InfluxDB / TimescaleDB
  │
  ├── 图关系 → Neo4j
  │
  └── 搜索 → Elasticsearch (Redis 搜索模块仅简单场景)
```

### 简要对比

| 维度 | Redis | Memcached | etcd |
|------|-------|-----------|------|
| 数据类型 | 5+ (string/hash/list/set/zset/stream) | string only | KV + lease + watch |
| 持久化 | RDB/AOF | 无 | WAL + snapshot |
| 集群 | Cluster (16384 slot) | 客户端分片 | Raft 内置 |
| 一致性 | 异步复制 (可能丢) | 无 | Raft 强一致 |
| 内存优化 | 极致 (embstr/intset/skiplist) | 朴素 | 通用 |
| 适用 | 缓存/锁/排行/Pub-Sub | 纯缓存 | 配置/服务发现 |

---

## 🧩 可复用模式

| 模式 | Redis 怎么实现 | 我能用到哪 |
|------|---------------|----------|
| **单线程 + epoll** | aeMain 死循环 + 5 通道 | 任何高 QPS 内存服务 (游戏服, IM, 网关) |
| **渐进式 rehash** | 每次操作搬 1 桶 + serverCron 兜底 | 任何运行时哈希扩容 (DB 索引, HashMap) |
| **SDS 字符串** | 5 种 header 按长度选 + 预分配 + 惰性释放 | 任何 C/C++ 字符串处理 |
| **embstr/RAW/int 编码** | 短串一次 malloc, 整数无 malloc | 任何"小对象优化" (Java TLAB, Go small object) |
| **lookupCommand + 横切关注点** | 单点入口 + 鉴权/ACL/OOM 全挂 | 任何单线程服务的"中间件模式" |
| **RESP 协议** | 5 种类型 + 简单字符 | 自定义协议: 简单优于复杂 |
| **skiplist 替代 B+树** | 实现简单, 范围查询一样快 | 任何"插入多+范围查多"场景 (排行榜) |

→ 模式 A-G 详细见 `deep-dive.md 专题 9`

---

## 📋 反思：Redis 让我重新思考的 5 件事

1. **单线程不是性能差，是性能稳**。无锁无竞争，命令 0.1ms 就是 0.1ms，无抖动 (vs 多线程 0.1-0.3ms 抖动)
2. **数据结构即性能**。embstr 比 raw 少 1 次 malloc，intset 比 dict 省 10x 内存，skiplist 比 B+树代码少 1/3
3. **内存是最贵的资源**。Redis 把内存优化做到字节级: 5 种 SDS header, listpack 压缩, 共享对象池
4. **持久化和内存模型分离**。RDB/AOF 是日志 + 快照, 内存模型是运行时优化, 互不影响
5. **协议的简洁性**。RESP = 5 种类型 (`+\r\n` / `-\r\n` / `:\r\n` / `$\r\n` / `*\r\n`), 1 节课讲完, 比 HTTP 简单 10x

---

## ✅ 我能马上用的 3 件事

- [ ] 把项目里某个 dict 改成渐进式 rehash 模式 (用 ht_table[2] + rehashidx)
- [ ] 引入 SDS 模式处理 C 字符串 (len + alloc + flags 头)
- [ ] 监控大 key (redis-cli --bigkeys) + 改 maxmemory-policy 为 allkeys-lru

---

## 🔗 跨项目引用

- `[[../01-etcd/README|etcd]]` — Raft 一致性 + WAL, 持久化对比 Redis RDB/AOF
- `[[../04-postgres/README|PostgreSQL]]` — MVCC 概念类似 Redis 的 transaction
- `[[../06-vllm/README|vLLM]]` — PagedAttention 借鉴 Redis listpack 内存分页
- `[[../08-prometheus/README|Prom]]` — 用 redis_exporter 暴露 Redis 指标给 Prom
- `[[../09-ripgrep/README|ripgrep]]` — 二者都是"极致工程"代表: 字节级优化
- `[[../ag/README|ag]]` — mmap 共享 page cache, 类似 Redis RDB 写盘

---

## 📚 进一步阅读

- 源码: https://github.com/redis/redis
- 文档: https://redis.io/docs/
- 实战书: 《Redis 设计与实现》(黄健宏) / 《Redis 深度历险》(钱文品)
- 进阶: https://redis.io/docs/manual/client-side-caching/
- 集群: https://redis.io/docs/reference/cluster-spec/
- `deep-dive.md` — 11 专题深度解析
- `code-snippets/` — 5 段必读代码 (110-175 行/段, 完整函数 + 多 WHY + 性能数据)
