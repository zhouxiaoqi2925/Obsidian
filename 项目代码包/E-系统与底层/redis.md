---
title: Redis
tags: [内存数据库, 缓存, NoSQL, 数据结构, 高性能]
---

# Redis

## 前言

**定位**：内存数据结构存储，2009 年由 Salvatore Sanfilippo（antirez）发布至今是缓存、会话、消息队列、实时分析的事实标准，全球 Top 1000 网站中 70%+ 使用 Redis。

**核心价值**：
- 极高性能：100万+ QPS（单机）
- 丰富数据结构：String/Hash/List/Set/SortedSet/Stream 等
- 持久化：RDB 快照 + AOF 日志
- 集群：原生 Cluster 支持水平扩展到 1000+ 节点

**五大特性**：
1. **内存存储**：所有数据驻内存，读写微秒级
2. **丰富数据结构**：String/Hash/List/Set/ZSet/Stream/HyperLogLog/Geo/Bitmap
3. **持久化**：RDB 快照 + AOF 追加日志
4. **主从复制**：异步复制 + Sentinel 哨兵高可用
5. **Cluster 集群**：16384 槽位分片，自动故障转移

**对比表**：

| 维度 | Redis | Memcached | KeyDB | DragonflyDB | Hazelcast |
|---|---|---|---|---|---|
| 数据结构 | 极丰富 | 仅 KV | 类似 Redis | 类似 Redis | Java 丰富 |
| 持久化 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 集群 | ✅ Cluster | ⚠️ 客户端 | ✅ | ✅ | ✅ |
| 线程 | 单线程 | 多线程 | 多线程 | 多线程 | 多线程 |
| QPS | 100万+ | 100万+ | 100万+ | 400万+ | 中 |
| 适合 | 通用缓存 | 纯缓存 | 替代 Redis | 极致性能 | Java 栈 |

## 思维导图

```mermaid
mindmap
  root((Redis))
    数据结构
      String
        文本
        计数器
        位运算
      Hash
        对象
        字段
      List
        队列
        栈
        阻塞
      Set
        去重
        交集并
      SortedSet
        排行榜
        范围
      Stream
        消息流
      HyperLogLog
        基数
      Geo
        位置
      Bitmap
        位图
    持久化
      RDB
        快照
      AOF
        日志
      混合
        4.0+
    高可用
      主从
        复制
      Sentinel
        哨兵
      Cluster
        集群
    性能
      单线程
      内存
      epoll
      Pipeline
    事务
      MULTI EXEC
      WATCH
      Lua
        原子
    缓存策略
      Cache-Aside
      Write-Through
      Write-Behind
      旁路缓存
    应用场景
      缓存
      会话
      排行榜
      限流
      分布式锁
      消息队列
      实时统计
      点赞关注
    客户端
      jedis
      lettuce
      redisson
      redis-py
    工具
      redis-cli
      redis-benchmark
      RedisInsight
    监控
      INFO
      SLOWLOG
      MONITOR
```

## 关键代码

### 一、基础命令

```bash
# 启动
redis-server
redis-server /etc/redis/redis.conf
redis-server --daemonize yes      # 后台运行
redis-server --port 6380

# 连接
redis-cli
redis-cli -h 127.0.0.1 -p 6379 -a password
redis-cli -u redis://user:pass@host:6379/0
redis-cli --tls -h host -p 6380  # TLS

# 数据库（默认 16 个）
SELECT 0
DBSIZE
FLUSHDB                            # 清当前库
FLUSHALL                           # 清所有

# 键管理
SET key value                      # 设置
GET key                            # 获取
DEL key                            # 删除
EXISTS key                         # 是否存在
EXPIRE key 60                      # 60s 后过期
TTL key                            # 剩余时间（秒）
PERSIST key                        # 取消过期
TYPE key                           # 类型
KEYS pattern                       # 慎用！SCAN 替代
SCAN 0 MATCH "user:*" COUNT 100
```

### 二、String 字符串

```bash
# 基础
SET name "Alice"
GET name
APPEND name " Smith"               # Alice Smith
STRLEN name
INCR counter                       # 原子 +1
INCRBY counter 10
DECR counter
DECRBY counter 5
INCRBYFLOAT price 0.5

# 分布式锁
SET lock "owner-uuid" NX EX 30    # 不存在才设 + 30s 过期
# 释放锁（用 Lua 保证原子）
# if redis.call("get",KEYS[1]) == ARGV[1] then
#     return redis.call("del",KEYS[1])
# else
#     return 0
# end

# 位图
SETBIT user:1:login 1 1           # 第 2 天登录
BITCOUNT user:1:login             # 登录天数
BITOP AND dest user:1 user:2      # 位运算

# 多值
MSET k1 v1 k2 v2
MGET k1 k2
```

### 三、Hash 哈希

```bash
# 对象存储
HSET user:1 name "Alice" age 30 email "alice@example.com"
HGET user:1 name
HMGET user:1 name age
HGETALL user:1
HDEL user:1 email
HEXISTS user:1 name
HKEYS user:1
HVALS user:1
HLEN user:1
HINCRBY user:1 age 1
HMSET user:2 name "Bob" age 25
```

### 四、List 列表

```bash
# 队列 / 栈
LPUSH tasks "task1" "task2"        # 左推
RPUSH tasks "task3"                # 右推
LPOP tasks                         # 左弹
RPOP tasks                         # 右弹
LRANGE tasks 0 -1                  # 全部
LLEN tasks
LINDEX tasks 0
LSET tasks 0 "new-task"
LTRIM tasks 0 99                   # 修剪

# 阻塞队列（消息队列）
BLPOP tasks 30                     # 阻塞 30s
BRPOP tasks 0                      # 永久阻塞
BRPOPLPUSH src dst 30              # 源消费 → 目标
```

### 五、Set 集合

```bash
# 去重
SADD tags "redis" "cache" "db"
SMEMBERS tags
SISMEMBER tags "redis"
SREM tags "db"
SCARD tags
SPOP tags                          # 随机弹

# 集合运算
SADD set1 "a" "b" "c"
SADD set2 "b" "c" "d"
SINTER set1 set2                   # 交集 {b,c}
SUNION set1 set2                   # 并集 {a,b,c,d}
SDIFF set1 set2                    # 差集 {a}
SINTERSTORE dest set1 set2
```

### 六、SortedSet 有序集合

```bash
# 排行榜
ZADD leaderboard 100 "alice" 200 "bob" 150 "charlie"
ZREVRANGE leaderboard 0 9 WITHSCORES  # 前 10
ZRANGE leaderboard 0 9 WITHSCORES     # 升序
ZSCORE leaderboard "alice"
ZRANK leaderboard "alice"             # 排名
ZINCRBY leaderboard 50 "alice"        # 加分
ZREM leaderboard "alice"

# 范围
ZRANGEBYSCORE leaderboard 100 200     # 分数 100-200
ZCOUNT leaderboard 100 200
```

### 七、Stream 流（消息队列）

```bash
# 生产
XADD mystream * field1 value1 field2 value2
XADD mystream * msg "hello"

# 消费
XLEN mystream
XRANGE mystream - +
XREAD COUNT 10 STREAMS mystream 0
XREAD BLOCK 0 STREAMS mystream $     # 阻塞

# 消费者组
XGROUP CREATE mystream group1 $ MKSTREAM
XREADGROUP GROUP group1 consumer1 COUNT 10 STREAMS mystream >
XACK mystream group1 <id>            # 确认
XPENDING mystream group1             # 未确认
```

### 八、Lua 脚本（原子）

```bash
# 限流脚本
EVAL "
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, 60)
end
if current > limit then
  return 0
end
return 1
" 1 "rate:user:1" 100

# 加载并使用
SCRIPT LOAD "return redis.call('SET', KEYS[1], ARGV[1])"
EVALSHA <sha> 1 key value
```

### 九、Pipeline 与事务

```bash
# Pipeline（批量执行，减少 RTT）
echo -e "SET k1 v1\nSET k2 v2\nGET k1" | redis-cli --pipe

# 事务
MULTI
SET k1 v1
SET k2 v2
GET k1
EXEC

# 乐观锁
WATCH balance
val = GET balance
MULTI
SET balance (val - 100)
EXEC
# 如果其他客户端改了 balance，EXEC 返回 nil
```

### 十、持久化配置

```conf
# /etc/redis/redis.conf

# RDB 快照
save 900 1                          # 900s 内 1 次修改
save 300 10
save 60 10000
dbfilename dump.rdb
dir /var/lib/redis

# AOF 追加
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec               # always/everysec/no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# 4.0+ 混合持久化
aof-use-rdb-preamble yes

# 内存
maxmemory 2gb
maxmemory-policy allkeys-lru       # LRU 淘汰
# volatile-lru / allkeys-lfu / volatile-lfu / noeviction
```

### 十一、Cluster 集群

```bash
# 创建集群（至少 3 主 3 从）
redis-cli --cluster create \
  127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002 \
  127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005 \
  --cluster-replicas 1

# 集群管理
redis-cli --cluster info 127.0.0.1:7000
redis-cli --cluster check 127.0.0.1:7000
redis-cli --cluster reshard 127.0.0.1:7000
redis-cli --cluster add-node new-node 127.0.0.1:7000

# 客户端连接
redis-cli -c -h 127.0.0.1 -p 7000
```

```conf
# redis.conf cluster 配置
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
cluster-require-full-coverage no
```

### 十二、监控与管理

```bash
# INFO 命令
redis-cli INFO
redis-cli INFO memory
redis-cli INFO clients
redis-cli INFO stats
redis-cli INFO replication

# 慢查询
redis-cli SLOWLOG GET 10
redis-cli SLOWLOG RESET
CONFIG SET slowlog-log-slower-than 10000

# 实时监控
redis-cli MONITOR                    # 慎用
redis-cli --stat

# 延迟诊断
redis-cli --latency
redis-cli --latency-history

# 客户端列表
redis-cli CLIENT LIST
redis-cli CLIENT KILL ID <id>

# 内存分析
redis-cli MEMORY USAGE key
redis-cli MEMORY DOCTOR
```

## 核心洞察

- **Redis 的单线程是优势不是劣势**：避免锁开销，I/O 多路复用发挥极致
- **Redis 的数据结构是核心价值**：不只是 KV，是带类型的 KV
- **Redis 6.0 引入多线程 I/O**：网络读写多线程，命令执行仍单线程
- **Redis Cluster 的 16384 槽位是设计取舍**：Gossip 协议元数据量
- **Redis 的 Lua 脚本让缓存可计算**：原子操作 + 复杂逻辑
- **Redis 的 Stream 是消息队列的官方方案**：Kafka 太重的轻量替代
- **Redis 7.0 引入 Function**：替代 EVAL，函数化管理脚本
- **Redis 的持久化双轨制**：RDB 适合备份、AOF 适合数据安全
- **Redis 的 LRU/LFU 淘汰策略**：maxmemory-policy 是运维核心
- **Redis 的"应用场景之王"是缓存**：80% 使用场景都是 Cache-Aside
- **Redis 的"分布式锁"有 Redlock 争议**：Martin Kleppmann 指出红锁有缺陷
- **Redis 与 Memcached 的战争早已分胜负**：Redis 几乎完全替代 Memcached

## 跨项目引用

- **[[linux]]**：Redis 跑在 Linux 上
- **[[docker]]**：Redis 官方 Docker 镜像流行
- **[[kubernetes]]**：Redis Operator / Helm Chart 部署 Redis
- **[[postgresql]]** / **[[mysql]]**：Redis 是关系数据库的缓存层
- **[[kafka]]** / **[[rabbitmq]]**：Redis Stream 是轻量消息队列
- **[[nginx]]**：Nginx 配合 Redis 做限流
- **[[node.js]]** / **[[python]]** / **[[go]]**：所有语言都有 Redis 客户端
- **[[memcached]]**：Memcached 是 Redis 的"前身"
- **[[prometheus]]** + **[[redis_exporter]]**：Redis 监控
- **[[redisson]]**：Java 生态最流行的 Redis 客户端
- **[[celery]]**：Python 任务队列用 Redis 做 broker
- **[[bullmq]]**：Node.js 任务队列用 Redis
