# Redis 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：为什么单线程能这么强

### 反直觉的事实
- 2025 年的 Redis 在 6.0+ 默认多线程 IO，但**命令执行仍是单线程**
- 单核 Redis 能扛 10w+ QPS（pipeline 后 100w+）

### 单线程的 3 大收益
1. **零锁开销**：所有数据结构无锁，hash/list/set 全免同步
2. **可预测性**：一条命令 0.1ms 就是 0.1ms，无抖动
3. **代码简单**：新人 1 周能改 Redis，K8s 新人 3 个月改不动

### 什么时候不用单线程
- CPU 密集型命令：`KEYS *`、`SORT`、大 Lua 脚本
- 持久化：`BGSAVE` / `BGREWRITEAOF` fork 子进程
- 4.0+ 后：worker 线程做异步删除（`UNLINK`、`FLUSHDB ASYNC`）

### IO 多路复用：epoll/kqueue/evport
```
Linux  : epoll
BSD/Mac: kqueue
Solaris: evport
Windows: 不支持 (MS 改用 IOCP, Redis for Windows 已停维护)
```
- `aeMain` 死循环 → `aeProcessEvents` → `epoll_wait` 阻塞 → 有事件就 `readQueryFromClient` → `processCommand` → `addReply` → `writeToClient`

---

## 专题 2：内存模型 — 数据结构精打细算

### string 编码（最容易被忽略的优化点）
| 值长度 | 编码 | 内存 |
|--------|------|------|
| ≤44 字节 | embstr | 一次 malloc（连续） |
| >44 字节 | raw | 两次 malloc（redisObject + buf） |
| 整数 | int | 完全不 malloc（直接放 ptr 字段） |
| long 型 double | embstr/RAW | 整数共享对象池 |

**示例**：
```bash
SET counter 1   # 编码: int (0 字节数据 malloc)
SET small "hi"  # 编码: embstr (1 次 malloc)
SET big "x" * 1000  # 编码: raw (2 次 malloc)
```

### list 编码
- 短 list：`listpack`（压缩连续）
- 长 list：`quicklist` = `listpack` 的链表

### hash 编码
- 短 hash：`listpack`（阈值：hash-max-listpack-entries 128 / value 64 字节）
- 长 hash：`dict`

### set 编码
- 全整数 + 少：`intset`
- 否则：`dict`

### zset 编码
- 短：`listpack`（zset-max-listpack-entries 128）
- 长：`skiplist + dict`（O(logN) 查分 + O(1) 查排名）

**skiplist 为什么不用 B+ 树？**
- 实现简单，1/3 代码量
- 范围查询一样快
- 并发友好（局部锁）

---

## 专题 3：5 段必读代码逐段详解

### 3.1 `ae.c:aeMain` — 事件循环的"心脏"
**关键**：`aeMain` 不退，`stop=1` 才退
- 7.0 后仍保留单线程，命令调度都在 main loop
- 6.0+ 的多线程 IO 不影响命令执行

### 3.2 `sds.c:sdshdr` — 简单动态字符串
**关键**：`len` + `alloc` + `flags` + `buf` 四件套
- O(1) 取长度（对比 C 字符串 strlen O(N)）
- 二进制安全（`\0` 当字符处理）
- 预分配 + 惰性释放

### 3.3 `dict.c:dictAddRaw` — 渐进式 rehash
**关键**：rehash 不一次性完成
- `_dictRehashStep`：每次操作 rehash 1 个 bucket
- 渐进式：避免大 dict 扩容阻塞主线程
- 2 倍 ht_table + ht_used，配合 _dictKeyIndex 索引

### 3.4 `networking.c:readQueryFromClient` — 非阻塞读
**关键**：epoll 触发 + 拼包 + 解析
- EAGAIN 就 break，等下次
- `querybuf` 动态扩
- 协议解析 inline / multi-bulk

### 3.5 `server.c:processCommand` — 命令路由
**关键**：单点入口 + 横切关注点
- 鉴权 / 慢查询 / ACL / OOM / 主从复制 都在这一层挂
- `lookupCommand` 是 O(1) 命令表
- `call` 是真正执行

---

## 专题 4：性能调优矩阵

### 内存调优
| 参数 | 默认 | 建议 | 作用 |
|------|------|------|------|
| `hash-max-listpack-entries` | 128 | 业务测 | 决定何时从 listpack 升 dict |
| `hash-max-listpack-value` | 64 | 业务测 | 同上 |
| `zset-max-listpack-entries` | 128 | 业务测 | skiplist 切换阈值 |
| `set-max-intset-entries` | 512 | 业务测 | intset 切换阈值 |
| `maxmemory-policy` | noeviction | allkeys-lru | 内存满时的策略 |
| `maxmemory-samples` | 5 | 10 | LRU 采样精度 |

### 延迟调优
| 场景 | 现象 | 解法 |
|------|------|------|
| 大 key | GET 阻塞 | `redis-cli --bigkeys` 找 + 拆 |
| 慢命令 | KEYS 阻塞 | 用 SCAN |
| 持久化 | RDB fork 卡 | `io-threads` 异步刷盘 |
| 慢查询 | 偶发 P99 高 | `slowlog get` |
| AOF 抖动 | `fsync always` | `everysec` + appendfsync |

### 监控关键指标
```
redis_commands_total           # QPS
redis_memory_used_bytes        # 内存
redis_connected_clients        # 连接数
redis_instantaneous_ops_per_sec  # 实时 OPS
redis_blocked_clients          # 阻塞 client
redis_keyspace_hits_total      # 命中率
redis_evicted_keys_total       # 淘汰数
redis_slowlog_length           # 慢查询数
```

---

## 专题 5：故障模式 + 应急处理

### F1：OOM
**症状**：`OOM command not allowed when used memory > 'maxmemory'`
**应急**：
```bash
# 1. 看内存
INFO memory
# 2. 找大 key
redis-cli --bigkeys
# 3. 紧急淘汰
CONFIG SET maxmemory-policy allkeys-lru
# 4. 删无用 key
redis-cli --scan --pattern "tmp:*" | xargs -L 100 redis-cli DEL
```

### F2：主从切换
**症状**：master 挂了，slave 还在
**应急**：
```bash
# 1. 选数据最新的 slave 升主
SLAVEOF NO ONE
# 2. 改其他 slave 指向新主
SLAVEOF new-master-ip 6379
# 3. 业务层用 Sentinel/Cluster 自动选主
```

### F3：AOF 损坏
**症状**：`Bad file format reading the append only file`
**应急**：
```bash
# 1. 备份
cp appendonly.aof appendonly.aof.bak
# 2. 用 redis-check-aof 修复
redis-check-aof --fix appendonly.aof
# 3. 重启 — Redis 会从修复后的 AOF 恢复
```

### F4：fork 耗时
**症状**：`redis: fork failed: Cannot allocate memory`
**诊断**：
```bash
INFO stats | grep latest_fork_usec
# 正常: < 1000ms (1s)
# 异常: > 5000ms (5s) — 大内存 + COW
```
**解法**：
- 启用 `io-threads-do-reads yes`
- 启用 `io-threads 4`
- 调小 `repl-backlog-size`
- 用 `disable-thp yes` 关透明大页

### F5：热 key 倾斜（Cluster）
**症状**：某分片 CPU 100%
**应急**：
```bash
# 1. 找热 key
redis-cli --hotkeys
# 2. 客户端本地缓存 (e.g. read-through)
# 3. 用 hashtag 强制同 slot: key = {shard}key
# 4. 拆分 key: user:1:profile, user:2:profile
```

---

## 专题 6：复用模式

### 模式 A：单线程 + IO 多路复用
**场景**：游戏服务器、IM 后端、网关
- 业务全在单线程，无锁
- 状态机用 dict/skiplist
- 命令解析复用 RESP 思路

### 模式 B：渐进式 rehash
**场景**：大字典热扩容
- 不一次性 rehash，每次操作 1 个 bucket
- 双表 + 游标（cursor）持续推进

### 模式 C：sds-like 字符串
**场景**：C/C++ 字符串处理
- `len` + `alloc` + `flags` 头部
- 预分配 + 惰性释放
- 二进制安全

### 模式 D：embstr/RAW 编码切换
**场景**：缓存系统内存优化
- 小对象 inline 存
- 大对象分开 malloc

---

## 专题 7：实战部署拓扑

### 单实例
```
┌──────────┐
│ App 1    │
│ App 2    │ ──→ Redis:6379
│ App 3    │
└──────────┘
```
**适用**：开发、缓存、非关键
**风险**：单点

### 主从 + Sentinel
```
┌──────────┐
│ App      │ ──→ Sentinel (3)
└────┬─────┘
     │
   ┌─┴──┐
   │    │
Master Slave1
        Slave2
```
**适用**：读写分离、HA
**限制**：单 master 写瓶颈

### Cluster（生产推荐）
```
┌──────────────────────┐
│ Slot 0-5460  │ N1    │
│ Slot 5461-10922 │ N2 │
│ Slot 10923-16383 │ N3│
└──────────────────────┘
   + replicas
```
**适用**：高 QPS、大数据
**限制**：multi-key 需同 slot（hash tag）

### 多级缓存
```
CDN → App local cache (Caffeine) → Redis → DB
```
**适用**：极致低延迟
**代价**：一致性复杂度

---

## 专题 8：Redis 让我重新思考的 5 件事

1. **单线程不是性能差，是性能稳**。在大多数业务负载下，单线程 Redis 比多线程 nginx 还快。
2. **数据结构是性能**。`intset` 比 dict 省 10x 内存，embstr 比 raw 少一次 malloc。
3. **内存是最贵的资源**。宁可多算 CPU，不可多占内存。
4. **持久化和内存模型是分离的**。RDB/AOF 是"日志 + 快照"，内存模型是"运行时优化"。
5. **协议的简洁性**。RESP = 5 种类型，几乎一节课能讲完，比 HTTP 简单 10x。

---

## 🔗 进一步阅读

- 源码：https://github.com/redis/redis
- 文档：https://redis.io/docs/
- 实战书：《Redis 设计与实现》(黄健宏)
- 进阶：https://redis.io/docs/manual/client-side-caching/

---

## 专题 9：复用模式深度展开

### 模式 A：单线程 + IO 多路复用
**核心范式**：
```
event_loop:
  while not stop:
    ready = epoll_wait(timeout)     # 阻塞到事件
    for fd in ready:
      read_or_write(fd)             # 非阻塞, EAGAIN 即停
    process_time_events()            # cron 任务
```

**适用场景**：
- 内存 KV / 缓存服务
- IM 长连接服务器 (单线程 epoll)
- 游戏房间服务 (状态机单线程)
- API 网关 (轻量转发)
- 任何 IO 密集 + 计算轻 的服务

**关键纪律**：
- 任何耗时操作必须异步 (Redis 4.0+ lazy free / 6.0+ IO threads)
- CPU 密集型任务单独 worker (BGSave, 慢命令)
- 单线程 = 无锁, 不用 CAS, 不用 mutex

### 模式 B：SDS 模式 (5 种 header 选型)
**C 字符串缺陷 → 4 步改造**：
1. 头部加 `len` → O(1) 长度
2. 头部加 `alloc` → 预分配 + 惰性释放
3. 头部加 `flags` → 区分不同长度
4. 选 5 种 header (hdr5/8/16/32/64) → 节省内存

**适用场景**：
- C/C++ 任何字符串处理
- 自定义协议的二进制安全 (含 \0 数据)
- 高频追加 (append) 场景: SDS 预分配避免 realloc

**对比 C++ std::string**：
- std::string 也用 SSO (small string optimization), 短串 inline
- 但 std::string 不暴露 alloc, 内存复用不友好
- SDS 的 `alloc` 字段 = std::string 的 `capacity()`, 但 API 友好

### 模式 C：渐进式 rehash (重点)
**核心代码**:
```c
int dictRehash(dict *d, int n) {
    int empty_visits = n * 10;  // 最多跳 10n 个空桶
    while (n-- && d->ht_used[0] != 0) {
        while (d->ht_table[0][d->rehashidx] == NULL) {
            d->rehashidx++;
            if (--empty_visits == 0) return 1;
        }
        entry = d->ht_table[0][d->rehashidx];
        while (entry) {
            next = entry->next;
            h = dictHashKey(d, entry->key) & d->ht_size[1]-1;
            entry->next = d->ht_table[1][h];
            d->ht_table[1][h] = entry;
            d->ht_used[1]++;
            d->ht_used[0]--;
            entry = next;
        }
        d->ht_table[0][d->rehashidx] = NULL;
        d->rehashidx++;
    }
    if (d->ht_used[0] == 0) {
        zfree(d->ht_table[0]);
        d->ht_table[0] = d->ht_table[1];
        d->ht_size[0] = d->ht_size[1];
        d->ht_used[0] = d->ht_used[1];
        d->ht_table[1] = NULL;
        d->ht_size[1] = 0;
        d->ht_used[1] = 0;
        d->rehashidx = -1;
        return 0;
    }
    return 1;
}
```

**应用场景**:
- Java HashMap: 不用 rehash, 直接 put 到新 table + 链化 (ConcurrentHashMap)
- Go map: 增量扩容, 每次 op 搬 2 个 bucket
- C++ std::unordered_map: rehash 一次性, 大容器卡
- 数据库 B+ 树: 分裂是 O(1), 合并可渐进

**坑**:
- serverCron 1ms 兜底 100 桶, 千万级 dict 会饿
- safe iterator 才能在 rehash 中正确遍历
- BGSAVE 时 dictScan 不走 rehash, 老数据可能全在 ht_table[0]

---

## 专题 10：skiplist 替代 B+ 树 — 排行榜的银弹

### 为什么 zset 用 skiplist
**skiplist 结构**:
```
level 3:  head ─────────────────────→ 100
level 2:  head ────→ 50 ────────────→ 100
level 1:  head ──→ 25 ──→ 50 ──→ 75 ──→ 100
level 0:  head → 10 → 25 → 37 → 50 → 62 → 75 → 100
```
- 概率平衡: 每次插入 50% 概率升 1 层
- 期望层数: O(log N)
- 查询复杂度: O(log N) 平均, O(N) 最坏 (但概率极低)

### skiplist vs B+ 树
| 维度 | skiplist | B+ 树 |
|------|----------|-------|
| 实现代码量 | ~200 行 | ~500 行 |
| 范围查询 | O(log N + K) | O(log N + K) |
| 单点查询 | O(log N) | O(log N) |
| 插入/删除 | O(log N), 简单 | O(log N), 节点分裂合并复杂 |
| 并发友好 | 局部锁 | 范围锁 |
| 顺序遍历 | 链表, 缓存友好 | 叶子节点链, 跨节点 cache miss |

**Redis 选择 skiplist 的 3 个理由**:
1. **实现简单**: 1/3 代码量, 调试容易
2. **并发友好**: 局部锁即可, B+ 树范围锁复杂
3. **zset 要频繁 ZRANGEBYSCORE**: skiplist 范围查缓存友好

### skiplist 性能数据 (1M 元素)
| 操作 | 延迟 |
|------|------|
| ZADD | ~0.1ms |
| ZSCORE | ~0.05ms |
| ZRANK | ~0.05ms (借助 dict 加速) |
| ZRANGE 0 100 | ~0.2ms |
| ZREVRANGEBYSCORE | ~0.3ms |

**zset 双结构**:
- skiplist: 排序 + 范围查询
- dict: O(1) 查 score (key → score)
- 内存: 1M 元素 × (key 8B + score 8B + 指针 8B × 4) ≈ 50MB

---

## 专题 11：持久化双引擎 — RDB + AOF

### RDB (Redis Database) 快照
**机制**:
```
BGSAVE 触发 → fork 子进程 → 子进程遍历所有 db → 写临时 RDB 文件 → rename 替换
```
- 父进程继续服务, 不阻塞
- fork 那一刻内存页表复制 (COW), 后续写才复制物理页
- 写完 fsync + rename, 原子切换

**触发条件**:
- `save 3600 1` — 1h 内 1 次写就 BGSAVE
- `save 300 100` — 5min 内 100 次写
- `save 60 10000` — 1min 内 10000 次写
- `bgsave` 命令 / `BGREWRITEAOF` 后 / 主从 sync / `shutdown` 时

**性能数据 (8GB Redis)**:
- fork: 50-200ms (内存大 = 页表大)
- 子进程遍历: 1-5s (10MB/s 写盘速度)
- 父进程 COW 内存: 写放大, 高峰可能 +50% 内存

**解 COW 痛**:
- `disable-thp yes` — 关透明大页, 防 fork 慢
- `repl-backlog-size` 调小, 减少 COW 范围
- 用 `io-threads-do-reads yes` + `io-threads 4` 异步刷盘

### AOF (Append Only File) 日志
**机制**:
```
写命令 → append 到 aof_buf → 根据策略 fsync 到 aof 文件
```
- `appendfsync always`: 每条命令 fsync, 最安全 (丢 0 条), 最慢
- `appendfsync everysec`: 1s 一次 fsync, 推荐, 丢 1s 数据
- `appendfsync no`: OS 决定, 最快, 丢 OS buffer

**AOF Rewrite**:
- AOF 文件会膨胀 (重复 SET 同 key), 需要周期压缩
- `BGREWRITEAOF`: 遍历内存, 用 1 条命令代替历史多条
- 触发: `auto-aof-rewrite-percentage 100` (文件翻倍) + `auto-aof-rewrite-min-size 64mb`

**RDB vs AOF 对比**:
| 维度 | RDB | AOF |
|------|-----|-----|
| 数据丢失 | 多 (分钟级) | 少 (秒级 or 0) |
| 恢复速度 | 快 (二进制加载) | 慢 (重放命令) |
| 文件大小 | 小 (压缩) | 大 (文本) |
| IO 代价 | BGSAVE 高峰 | 持续低 |
| 适用 | 备份, 全量快照 | 强持久, 审计 |

**混合模式 (4.0+)**:
- RDB snapshot + AOF 增量
- 头: RDB 格式 (快)
- 尾: AOF 格式 (少丢)
- 恢复: 先读 RDB 头, 再 replay AOF 尾

---

## 专题 12：Cluster 集群深度

### 架构
```
┌──────────────┐
│ Application  │ (redis-cli / Lettuce)
└──────┬───────┘
       │ MOVED/ASK redirect
       │
       ├──────┬──────┬──────┐
       │      │      │      │
      N1     N2     N3     N4     (16384 slot 分布)
       │      │      │      │
      R1     R2     R3     R4     (replicas)
```
- 16384 slot 均匀分布
- 1 master 至少 1 replica
- 客户端直连 master, 重定向到正确节点

### 客户端路由 (Smart Client)
```
1. CRC16(key) mod 16384 = slot
2. slot → node 映射 (本地缓存)
3. 命中 → 发送
4. 不命中 → MOVED 重定向, 更新本地缓存
5. 迁移中 → ASK 临时重定向, 不更新缓存
```

**MOVED vs ASK**:
- MOVED: 永久, 槽已迁完, 更新本地表
- ASK: 临时, 槽正在迁, 不更新

### Gossip 协议 + 故障检测
- 每节点每秒发 PING 给随机几个节点
- 收到 PONG 超时 → 标记 PFAIL (可能故障)
- 大多数节点都标记 PFAIL → 升级 FAIL
- 故障转移: 选 1 个 replica 升 master (Raft 类似但简化)

**关键坑**:
- 多 key 命令 (MSET/SUNION): key 必须在同 slot
- Hash tag: `{user:1}.profile` 和 `{user:1}.settings` 强制同 slot
- 集群模式不允许 SELECT 0 之外 (单 db 模式)
- 大 key 迁移慢: MIGRATE 命令慢慢挪

---

## 专题 13：Pub/Sub vs Stream

### Pub/Sub (经典, fire-and-forget)
```
PUBLISH channel msg → 所有 SUBSCRIBE channel 的 client
```
- 无持久化: 订阅者不在 = 消息丢
- 无 ack: 不知道对方收没收到
- 无回放: 没法补发
- 适用: 实时通知 (不重要的)

### Stream (5.0+, 类 Kafka)
```
XADD mystream * field1 value1
XREAD BLOCK 0 STREAMS mystream $
XREADGROUP GROUP g1 c1 COUNT 10 STREAMS mystream >
```
- 持久化: AOF/RDB 都有
- 消费组: 类似 Kafka Consumer Group
- ack 机制: XACK 处理后确认
- 适用: 消息队列, 事件溯源

### 决策树
```
要消息分发?
  ├── 实时通知, 丢点无所谓 → Pub/Sub
  ├── 消息队列, 不许丢 → Stream (或换 Kafka/RabbitMQ)
  └── 大规模 (百万 QPS) → 换 Kafka (Stream 性能有限)
```

---

## 专题 14：Redis 让我重新思考的 5 件事 (再版)

1. **工程化 > 算法**。SDS hdr5/8/16/32/64 选型, listpack 压缩, 共享对象池 — 字节级优化的极致
2. **单线程 = 可预测**。0.1ms 抖动 < 0.1ms ± 0.2ms 抖动, SRE 调监控容易
3. **内存模型 = 性能模型**。intset 8B/元素 vs dict 50B/元素, 业务量 10x 差
4. **持久化 = 可恢复 + 可审计**。RDB/AOF 双引擎覆盖不同需求
5. **协议即 API**。RESP 5 种类型, 1 行命令描述清楚, 远比 HTTP 简单

---

## 专题 15：7 步避坑 + 5 反模式

### 7 步避坑
1. **监控**: `redis_exporter` + Prom + Grafana, 必看 4 指标 (`used_memory`, `ops/sec`, `connected_clients`, `evicted_keys`)
2. **大 key**: 定期 `redis-cli --bigkeys` 扫, 业务限制单 key < 1MB
3. **慢命令**: `slowlog get` + `INFO commandstats`, 禁 `KEYS/FLUSHDB/大 Lua`
4. **OOM 保护**: 必设 `maxmemory`, 推荐 `allkeys-lru`, 留 20% buffer
5. **持久化策略**: `appendfsync everysec` + RDB 1h 1 次, 平衡性能与安全
6. **主从分离**: 写主读从, replica 至少 2 个 (HA)
7. **客户端重试**: Lettuce/Redisson 自动重连, 写要 idempotent

### 5 反模式
- **VM 机制 (废弃)**: 早期 Redis 用磁盘换内存, 复杂 + 慢, 已废弃
- **AOF always**: 每条 fsync 1w 次/秒, 磁盘爆, 改 everysec
- **DEL 删大 key**: 同步阻塞, 用 UNLINK (4.0+)
- **Cluster 单 key > 100MB**: 迁移慢 + 热点, 拆
- **Lua 脚本 O(N)**: 主线程跑, 阻塞全 Redis, 改 pipeline + MULTI

---

## 专题 16：跨项目引用

- `[[../01-etcd/README|etcd]]` — Raft vs Redis 异步复制, 强一致 vs 最终一致
- `[[../03-kubernetes/README|K8s]]` — etcd 是 K8s 数据后端, Redis 不是
- `[[../04-postgres/README|PostgreSQL]]` — MVCC 类似 Redis 的事务 (MULTI/EXEC)
- `[[../05-golang/README|Go]]` — GMP 调度器 vs Redis 单线程, 两种并发哲学
- `[[../06-vllm/README|vLLM]]` — PagedAttention 借鉴 Redis listpack 内存分页
- `[[../07-nextjs/README|Next.js]]` — 客户端缓存 (SWR) 模式类似 Redis 客户端缓存
- `[[../08-prometheus/README|Prom]]` — `redis_exporter` 暴露 Redis 指标
- `[[../09-ripgrep/README|ripgrep]]` — 都是"极致工程"代表, 字节级优化
- `[[../ag/README|ag]]` — mmap 共享 page cache, 类似 Redis RDB 写盘
- 集群：https://redis.io/docs/reference/cluster-spec/
