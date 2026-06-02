# Redis · 架构与工程实践精要

> Redis 是 in-memory data structure store，被数百万开发者用作数据库、缓存、流引擎、消息代理。本笔记从 Amazon Builders' Library 视角剖析其单线程事件循环、RESP 协议、数据结构、持久化与集群协议，聚焦 20 个工程模式与决策。

---

## 一、核心机制与单线程哲学

### 模式 1：单线程事件循环（ae 库）

**问题场景**：传统多线程服务器（Tomcat、Apache）每个连接一个线程，10k 连接 = 10k 线程，context switch 开销大。Redis 选择"单线程事件循环"——一个线程处理所有连接，10w+ QPS。

**解决方案代码**：

```c
// src/server.c: main()
int main(int argc, char **argv) {
  // 初始化
  initServer();
  // 事件循环（核心）
  aeMain(server.el);
}

// src/ae.c: aeMain()
void aeMain(aeEventLoop *eventLoop) {
  eventLoop->stop = 0;
  while (!eventLoop->stop) {
    // 1. 跑 beforeSleep 钩子
    if (eventLoop->beforesleep) eventLoop->beforesleep(eventLoop);
    // 2. 调 epoll_wait / kqueue / select
    numevents = aeApiPoll(eventLoop, tvp);
    // 3. 处理就绪事件
    for (j = 0; j < numevents; j++) {
      fe = &eventLoop->events[eventLoop->fired[j].fd];
      fe->fireProc(eventLoop, fd, fe->clientData, EVENT_MASK);
    }
  }
}

// src/ae.c: aeCreateEventLoop()
aeEventLoop *aeCreateEventLoop(int setsize) {
  aeEventLoop *eventLoop = zmalloc(sizeof(*eventLoop));
  eventLoop->events = zmalloc(sizeof(aeFileEvent) * setsize);
  eventLoop->fired = zmalloc(sizeof(aeFiredEvent) * setsize);
  eventLoop->timeEventHead = NULL;
  return eventLoop;
}
```

**关键参数表**：

| 事件类型 | 描述 | 用途 |
|---|---|---|
| `AE_READABLE` | 可读事件 | 客户端发来命令 |
| `AE_WRITABLE` | 可写事件 | 准备发送响应 |
| `AE_BARRIER` | 屏障（防竞争） | 客户端处理顺序 |
| `AE_NOMORE` | 无更多事件 | 删除事件 |
| 时间事件 | 定时器 | serverCron / expire |

| 系统调用 | 用途 |
|---|---|
| `epoll` | Linux 高性能 IO 多路复用 |
| `kqueue` | macOS / BSD |
| `evport` | Solaris |
| `select` | 跨平台 fallback |

**最佳实践列表**：
- 单线程 = 内存访问无锁 = 充分利用 CPU cache
- "瓶颈"不在 CPU——网络 IO 和内存是瓶颈
- v6.0+ 引入 IO threads 处理网络读写——主线程仍单线程
- 业务命令执行仍是单线程——避免共享状态
- 反模式：业务代码 `usleep()` / `sleep()` 阻塞事件循环——Redis 整体卡死

### 模式 2：RESP 协议（序列化协议）

**问题场景**：客户端用 C / Java / Python / Node.js 各语言，需统一通信协议。Redis 用 RESP（REdis Serialization Protocol）——5 种类型前缀，简单到 10 行可实现 parser。

**解决方案代码**：

```c
// src/networking.c: processInputBuffer()
void processInputBuffer(client *c) {
  while (c->qb_pos < sdslen(c->querybuf)) {
    // 解析 1 条 RESP 命令
    if (!c->reqtype) {
      // 探测协议类型
      if (c->querybuf[c->qb_pos] == '*') c->reqtype = PROTO_REQ_MULTIBULK;  // RESP2 array
      else c->reqtype = PROTO_REQ_INLINE;  // 简单 inline 命令
    }
    if (c->reqtype == PROTO_REQ_MULTIBULK) {
      // 解析 *3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\nbar\r\n
      robj *argv[argc];
      if (processMultibulkBuffer(c, &argc, argv) != C_OK) break;
      // 执行命令
      processCommand(c, argc, argv);
    }
  }
}

// RESP 类型
// +OK\r\n                       简单字符串
// -Error\r\n                    错误
// :1234\r\n                     整数
// $6\r\nfoobar\r\n              批量字符串
// *2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n   数组
// _\r\n (RESP3)                 null
// ,1.23\r\n (RESP3)             双精度
```

**关键参数表**：

| RESP 类型 | 字节前缀 | 例子 |
|---|---|---|
| Simple String | `+` | `+OK\r\n` |
| Error | `-` | `-ERR unknown command\r\n` |
| Integer | `:` | `:1000\r\n` |
| Bulk String | `$` | `$5\r\nhello\r\n` |
| Array | `*` | `*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n` |
| Null (RESP3) | `_` | `_\r\n` |
| Double (RESP3) | `,` | `,1.5\r\n` |
| Boolean (RESP3) | `#` | `#t\r\n` / `#f\r\n` |
| Map (RESP3) | `%` | `%1\r\n+key\r\n+value\r\n` |

**最佳实践列表**：
- 客户端用 RESP2 协议——最广泛兼容
- 复杂数据用 RESP3——支持 Map/Set/Boolean
- Pipeline 模式：多个命令一次发送——减少 RTT
- pub/sub 用 push 模式——服务端主动推送
- 反模式：每个命令一个 TCP 包——RTT 主导延迟

### 模式 3：dict 哈希表（rehash 与渐进式 rehash）

**问题场景**：Redis 所有数据结构（String/List/Hash/Set/SortedSet）底层都用 dict。dict 是"动态哈希表"——负载因子 >1 时 rehash，但 rehash 是 O(n) 操作，阻塞单线程。

**解决方案代码**：

```c
// src/dict.c: dictExpand
int dictExpand(dict *d, unsigned long size) {
  unsigned long realsize = _dictNextPower(size);  // 2 的幂
  dictht n;  // 新哈希表
  n.size = realsize;
  n.sizemask = realsize - 1;
  n.table = zcalloc(realsize * sizeof(dictEntry*));
  n.used = 0;
  if (d->ht[0].table == NULL) {
    d->ht[0] = n;  // 首次初始化
    return DICT_OK;
  }
  d->ht[1] = n;  // 渐进式 rehash：分配新表但暂不搬
  d->rehashidx = 0;  // 标记开始
  return DICT_OK;
}

// 渐进式 rehash：每次 dict 操作搬 1 个 bucket
static void _dictRehashStep(dict *d) {
  if (d->rehashidx == -1) return;
  d->rehashidx++;
  while (d->ht[0].table[d->rehashidx] != NULL) {
    // 搬 1 个 bucket
    dictEntry *de = d->ht[0].table[d->rehashidx];
    while (de) {
      unsigned long h = dictHashKey(d, de->key) & d->ht[1].sizemask;
      de->next = d->ht[1].table[h];
      d->ht[1].table[h] = de;
      d->ht[0].used--;
      d->ht[1].used++;
      de = de->next;
    }
    d->rehashidx++;
  }
  if (d->ht[0].used == 0) {
    zfree(d->ht[0].table);
    d->ht[0] = d->ht[1];  // 新表转正
    d->rehashidx = -1;
  }
}
```

**关键参数表**：

| 字段 | 含义 |
|---|---|
| `ht[2]` | 双哈希表（rehash 用） |
| `rehashidx` | 当前 rehash 到第几个 bucket（-1 = 未在 rehash） |
| `size` | bucket 数（2 的幂） |
| `sizemask` | `size - 1`（用于 hash % size） |
| `used` | 已用 entry 数 |

| 触发 rehash | 负载因子 |
|---|---|
| 强制 | `used / size > 1.0`（dictForceRehash） |
| 渐进 | `used / size > 5`（HT 满时） |

**最佳实践列表**：
- 渐进式 rehash = 每次操作搬 1 bucket——单次操作 < 1us
- 避免大 key（field 数十万）——单次 rehash 步骤多
- 用 `rehash 0 1` 限制 rehash 速度——7.0+ 新增
- dict size 始终 2 的幂——位运算代替模运算
- 反模式：HGETALL 一个 100w 字段的 hash——可能卡数十 ms

### 模式 4：robj 统一对象系统

**问题场景**：Redis 支持 6 种数据类型（String/List/Hash/Set/SortedSet/Stream），每种有独立实现。但命令分派、内存管理、序列化需要统一抽象——`robj` 是 RedisObject。

**解决方案代码**：

```c
// src/server.h: redisObject
typedef struct redisObject {
  unsigned type:4;        // OBJ_STRING / OBJ_LIST / OBJ_HASH / OBJ_SET / OBJ_ZSET / OBJ_STREAM
  unsigned encoding:4;    // 编码（int / embstr / raw / hashtable / ziplist / skiplist / quicklist / listpack）
  unsigned lru:24;        // LRU 时间戳（用于 LRU/LFU 淘汰）
  int refcount;           // 引用计数
  void *ptr;              // 实际数据指针
} robj;

// src/object.c: createStringObject
robj *createStringObject(const char *s, size_t len) {
  if (len <= 44) {
    // 小字符串 → embstr（一次分配 object + data）
    return createEmbeddedStringObject(s, len);
  }
  // 大字符串 → raw（两次分配）
  return createRawStringObject(s, len);
}

// SDS 字符串
struct sdshdr {
  uint32_t len;      // 已用
  uint32_t alloc;    // 已分配
  unsigned char flags;  // 类型标记
  char buf[];        // 字符串内容
};
```

**关键参数表**：

| type | encoding | 说明 |
|---|---|---|
| OBJ_STRING | int | 整数（long 范围内） |
| OBJ_STRING | embstr | ≤ 44 字节字符串 |
| OBJ_STRING | raw | > 44 字节字符串 |
| OBJ_LIST | listpack / quicklist | 7.0 之前是 ziplist/linkedlist |
| OBJ_HASH | listpack / hashtable | 7.0 之前是 ziplist/hashtable |
| OBJ_SET | listpack / intset / hashtable | 整数小集合用 intset |
| OBJ_ZSET | listpack / skiplist | 7.0 之前是 ziplist/skiplist |
| OBJ_STREAM | radix tree | Stream 数据结构 |

**最佳实践列表**：
- 整数存储高效——能用 `INCR` 不要用 `SET key value` + `GET`
- 小字符串用 embstr——单次分配
- 小 hash（field < 128）用 listpack——节省内存
- 反模式：`HSET key field1 ... field10000`——大 hash 性能差
- LRU/LFU 由 lru 字段支持——`maxmemory-policy` 配置

### 模式 5：跳表（skiplist）实现 SortedSet

**问题场景**：SortedSet 需要"按 score 排序 + 按 member 查 score + 范围查询"。传统实现有 B+ 树（难实现 + 难并发）和红黑树（实现复杂）。Redis 用跳表（skiplist）——O(log n) 查询，实现简单，范围查询友好。

**解决方案代码**：

```c
// src/t_zset.c: zslInsert
zskiplistNode *zslInsert(zskiplist *zsl, double score, sds ele) {
  // 从顶层往下找插入点
  zskiplistNode *update[ZSKIPLIST_MAXLEVEL];
  zskiplistNode *x = zsl->header;
  for (int i = zsl->level - 1; i >= 0; i--) {
    while (x->level[i].forward && x->level[i].forward->score < score) {
      x = x->level[i].forward;
    }
    update[i] = x;  // 每层插入点的前驱
  }
  // 随机层高（几何分布，p=0.25）
  int level = zslRandomLevel();
  if (level > zsl->level) {
    for (int i = zsl->level; i < level; i++) update[i] = zsl->header;
    zsl->level = level;
  }
  // 插入新节点
  zskiplistNode *node = zslCreateNode(level, score, ele);
  for (int i = 0; i < level; i++) {
    node->level[i].forward = update[i]->level[i].forward;
    update[i]->level[i].forward = node;
  }
  return node;
}

// zskiplistNode 结构
typedef struct zskiplistNode {
  sds ele;             // member
  double score;        // 排序分
  struct zskiplistNode *backward;  // 上一节点
  struct zskiplistLevel {
    struct zskiplistNode *forward;  // 同层下一节点
    unsigned long span;  // 跨度（节点数）
  } level[];           // 层高数组
} zskiplistNode;
```

**关键参数表**：

| ZSKIPLIST_MAXLEVEL | 32 |
|---|---|
| 随机层高 p | 0.25 |
| 平均层高 | 1 / (1 - p) = 1.33 |
| 索引空间 | log_0.25(N) |

**最佳实践列表**：
- SortedSet 是 O(log n) 插入、O(log n) 范围查询
- `ZRANGEBYSCORE` + `LIMIT` 适合排行榜 Top N
- 跳表 + 字典双索引——ZSCORE O(1)，ZRANGE O(log n)
- 7.0+ 小 SortedSet 用 listpack——内存优化
- 反模式：10w 个 ZADD 一次性执行——可用 pipeline 批量

---

## 二、持久化与复制

### 模式 6：RDB 快照（dump.rdb）

**问题场景**：内存数据易失——进程崩溃 = 数据丢失。需要周期性把内存全量 dump 到磁盘。RDB（Redis Database）是 Redis 默认持久化方式——二进制紧凑格式。

**解决方案代码**：

```c
// src/rdb.c: rdbSave
int rdbSave(char *filename, rdbSaveInfo *rsi) {
  // 1. 打开临时文件
  snprintf(tmpfile, 256, "temp-%d.rdb", (int)getpid());
  fp = fopen(tmpfile, "w");
  // 2. 写入 RDB 头
  if (rdbWriteRaw(fp, "REDIS", 5) == -1) goto werr;
  rdbSaveInfoAuxFields(fp, rsi, 0);
  // 3. 遍历所有 db
  for (j = 0; j < server.dbnum; j++) {
    redisDb *db = server.db + j;
    // 4. 遍历所有 key
    dictIterator *di = dictGetSafeIterator(db->dict);
    while ((de = dictNext(di)) != NULL) {
      sds keystr = dictGetKey(de);
      robj *o = dictGetVal(de);
      rdbSaveKeyValuePair(fp, db, o, keystr, rsi);
    }
    dictReleaseIterator(di);
  }
  // 5. 写 EOF 标记
  if (rdbWriteRaw(fp, "\xff\xff\xff\xff", 4) == -1) goto werr;
  // 6. 原子 rename 临时文件
  if (rename(tmpfile, filename) == -1) goto werr;
  return C_OK;
}

// RDB 文件格式（紧凑二进制）
// REDIS0009  (magic + version)
// ... AUX fields (redis-ver, aof-preamble, repl-stream-db, etc.)
// <db_number> <key_value_pairs>  (db 0)
// <db_number> <key_value_pairs>  (db 1)
// ...
// <ff> <8-byte checksum>          (EOF + CRC64)
```

**关键参数表**：

| 触发方式 | 时机 |
|---|---|
| `SAVE` | 同步（阻塞） |
| `BGSAVE` | fork 子进程异步 |
| 自动 save | `save 3600 1000`（3600s 内 1000 改动） |
| `SHUTDOWN` | 默认自动 |
| `FLUSHALL` 后 + save | 重置 |

| 压缩策略 | 作用 |
|---|---|
| `rdbcompression yes` | LZF 压缩字符串（默认） |
| `rdbchecksum yes` | CRC64 校验（默认） |

**最佳实践列表**：
- RDB 适合"定期备份"——冷启动快（10s 加载 10GB）
- 不要用 SAVE 阻塞主线程——用 BGSAVE
- `save ""` 关闭 RDB——只用 AOF
- 容器化（Docker）：`--save "" --appendonly no` 避免双写
- 监控 `rdb_last_save_time` / `rdb_last_bgsave_status`

### 模式 7：AOF 追加日志（Append Only File）

**问题场景**：RDB 丢失窗口大（最后一次 save 之后的数据全丢）。需要"每次写命令都记录"——AOF（Append Only File）日志式持久化，重启时重放命令恢复数据。

**解决方案代码**：

```c
// src/aof.c: feedAppendOnlyFile
void feedAppendOnlyFile(int dictid, robj **argv, int argc) {
  sds buf = sdsempty();
  // 1. 序列化为 RESP 命令
  for (j = 0; j < argc; j++) {
    if (j > 0) buf = sdscatlen(buf, " ", 1);
    robj *o = argv[j];
    if (o->type == OBJ_STRING) {
      buf = sdscatrepr(buf, (char*)o->ptr, sdslen(o->ptr));
    } else {
      buf = sdscatrepr(buf, "?", 1);
    }
  }
  buf = sdscatlen(buf, "\r\n", 2);
  // 2. 追加到 aof_buf
  server.aof_buf = sdscatlen(server.aof_buf, buf, sdslen(buf));
  // 3. 异步刷盘
  if (server.aof_fsync == AOF_FSYNC_ALWAYS) {
    aof_fsync(server.aof_fd);  // 每次都 fsync（最安全）
  } else if (server.aof_fsync == AOF_FSYNC_EVERYSEC) {
    aof_background_fsync();  // 后台线程每秒 fsync（默认）
  }
  // AOF_FSYNC_NO: 完全靠 OS
}

// AOF 重写（compact）
int rewriteAppendOnlyFile(char *filename) {
  // 遍历当前所有 key，生成等效的最小命令集
  // 例：100 次 INCR → 1 次 SET key 100
  for (j = 0; j < server.dbnum; j++) {
    redisDb *db = server.db + j;
    while ((de = dictNext(di)) != NULL) {
      // ... 用最少命令表示当前状态
    }
  }
}
```

**关键参数表**：

| `appendfsync` 选项 | 行为 | 性能 / 安全性 |
|---|---|---|
| `always` | 每次写都 fsync | 最安全（丢 < 1 条）但慢 |
| `everysec` | 每秒 fsync | 默认（最多丢 1s）|
| `no` | 完全靠 OS | 最快但可能丢分钟级 |

| 重写策略 | 触发 |
|---|---|
| 自动 | `auto-aof-rewrite-percentage 100` + `auto-aof-rewrite-min-size 64mb` |
| 手动 | `BGREWRITEAOF` |

**最佳实践列表**：
- AOF 文件可能很大——用 `BGREWRITEAOF` 定期压缩
- `everysec` 是生产默认——平衡安全 + 性能
- 加载 AOF 时用 `redis-check-aof` 修复损坏
- Multi Part AOF（7.0+）支持增量重写——避免 bgrewrite 阻塞
- 反模式：`appendfsync always` + 写入密集——磁盘成为瓶颈

### 模式 8：Replication 主从复制

**问题场景**：单点 Redis 不可用，需要数据冗余。Redis 主从复制（master-replica）——主节点接受写，从节点同步数据，提供读扩展 + 高可用。

**解决方案代码**：

```c
// src/replication.c: replicationCron
void replicationCron(void) {
  static long long repl_timeout_last = 0;
  // 1. 检查超时
  if (replicationTimeout()) {
    // 重连
    replicationAbortConnTransfer();
  }
  // 2. 周期 ping
  if ((replicate_cron_loops % server.repl_ping_slave_period) == 0) {
    replconf sendPing();
  }
  // 3. 全量同步触发条件
  if (server.repl_backlog_size > 0 && server.repl_backlog == NULL) {
    // 分配 backlog 缓冲区
    server.repl_backlog = zmalloc(server.repl_backlog_size);
  }
}

// 从节点首次连接 → 全量同步（RDB 传输）
// 主节点：BGSAVE + 发 RDB 给从节点 + 同步期间的写命令也发过去
// 从节点：清空旧数据 + load RDB + 应用增量命令

// 从节点断线重连 → 增量同步（PSYNC）
// 主节点：记录 backlog（环形缓冲），从节点带 offset 重连
// 主节点从 backlog 取 offset 之后的数据发送
```

**关键参数表**：

| `repl-backlog-size` | 1MB（默认）——越大越能容忍断线 |
|---|---|
| `repl-timeout` | 60s 超时 |
| `repl-ping-replica-period` | 10s ping 周期 |
| `min-replicas-to-write` | 至少 N 个从节点在线才接受写 |
| `min-replicas-max-lag` | 从节点最大 lag（秒） |

**最佳实践列表**：
- 主从 + 哨兵 = 高可用（自动故障转移）
- 启用 `repl-backlog-size 100mb`——断线 5min 还能增量同步
- 多从节点时主节点压力：`client-output-buffer-limit replica 256mb 64mb 60`
- 反模式：主从分叉严重（master 写 10k/s，replica 跟不上）——加 replica
- 监控：`INFO replication` 关注 `master_repl_offset` vs `slave_repl_offset`

### 模式 9：Redis Sentinel 哨兵

**问题场景**：主节点挂了，需要自动选新主 + 通知应用。Sentinel 是 Redis 官方高可用方案——多 sentinel 进程投票选举，避免脑裂。

**解决方案代码**：

```c
// src/sentinel.c: sentinelTimer
void sentinelTimer(void) {
  // 1. 定期 PING 所有主/从/其他 sentinel
  sentinelPingAllSentinels();
  // 2. 检查主观下线（SDOWN）
  sentinelCheckSubjectivelyDown();
  // 3. 检查客观下线（ODOWN）——需要多数 sentinel 同意
  sentinelCheckObjectivelyDown();
  // 4. 选主投票
  if (sentinelStartFailoverIfNeeded())
    sentinelRunFailover();
  // 5. 故障转移
  if (server.failover_state == FAILOVER_STATE_RECONF_SLAVES) {
    sentinelFailoverReconfNextSlave();
  }
}

// 应用客户端配置
// sentinel monitor mymaster 127.0.0.1 6379 2  (2 = 多数 quorum)
// sentinel down-after-milliseconds mymaster 5000
// sentinel parallel-syncs mymaster 1
// sentinel failover-timeout mymaster 60000
```

**关键参数表**：

| 监控维度 | 默认值 |
|---|---|
| `down-after-milliseconds` | 30s |
| `failover-timeout` | 180s |
| `parallel-syncs` | 1（同时同步的从节点数） |
| `quorum` | sentinel 多数 |

**最佳实践列表**：
- 至少 3 个 sentinel 节点——避免脑裂
- 客户端用 `redis-sentinel://` URL——自动发现新主
- `parallel-syncs` 不宜过大——避免主节点压力
- Sentinel 也可能挂——多机部署
- 监控 `SENTINEL get-master-addr-by-name mymaster` 验证状态

### 模式 10：Redis Cluster 集群

**问题场景**：单实例数据量 > 内存上限（>500GB），需要水平扩展。Redis Cluster 把数据分片到 16384 槽——多主多从，去中心化协议。

**解决方案代码**：

```c
// src/cluster.c: clusterReadSlot
int clusterReadSlot(unsigned int slot) {
  // 根据 CRC16(key) % 16384 计算槽
  unsigned int hash = crc16(key) & 16383;
  // 查找槽在哪个节点
  clusterNode *n = server.cluster->slots[hash];
  return n ? n : NULL;
}

// Gossip 协议：节点间定期交换状态
void clusterCron(void) {
  // 1. 随机选 5 个节点 ping
  for (j = 0; j < 5; j++) {
    clusterNode *node = ...;
    clusterSendPing(node, CLUSTER_TYPE_PING);
  }
  // 2. 接收 ping/pong，更新 slots 映射
  // 3. 检测失败（pfail → fail）
  // 4. 选举（leader + majority）
}

// MOVED 重定向：客户端发到错节点 → 收到 MOVED 15495 127.0.0.1:6380
// ASK 重定向：节点正在迁移槽 → ASK 15495 127.0.0.1:6381
```

**关键参数表**：

| 集群参数 | 默认值 |
|---|---|
| 槽数 | 16384（CRC16 模数） |
| 节点最小数 | 6（3 主 + 3 从） |
| 故障检测 | 30s 默认 |
| 故障转移 | ~30s |
| Gossip 周期 | 1s |
| `cluster-node-timeout` | 15s |

**最佳实践列表**：
- 客户端必须支持 MOVED / ASK 重定向——`redis-cli -c` 模式
- 16k 槽是"足够大 + 节省 bitmap 空间"权衡
- 跨槽操作（MGET / MSET）会失败——用 hash tag `{user42}:name` 把相关 key 强制同槽
- 监控 `cluster info` / `cluster slots`——看集群健康
- 反模式：单 key 太大（>1MB）——migrate 慢

---

## 三、数据结构与命令

### 模式 11：List 类型与 quicklist

**问题场景**：Redis List 要支持 LPUSH / RPUSH / LPOP / RPOP / LRANGE，传统 linkedlist 节点零碎、内存碎片多。Redis 用 quicklist——ziplist + linkedlist 混合结构。

**解决方案代码**：

```c
// src/t_list.c: listTypePush
void listTypePush(robj *subject, robj *value, int where) {
  if (subject->encoding == OBJ_ENCODING_QUICKLIST) {
    quicklistPush(subject->ptr, value->ptr, sdslen(value->ptr), where);
  } else {
    serverPanic("Unknown list encoding");
  }
}

// quicklistNode 结构
typedef struct quicklistNode {
  struct quicklistNode *prev;
  struct quicklistNode *next;
  unsigned char *zl;      // 节点数据（listpack 或 ziplist）
  size_t sz;              // zl 字节数
  unsigned int count:16;  // 元素数
  unsigned int encoding:2;// 编码
  unsigned int recompress:1;  // 是否需要重压缩
} quicklistNode;

// quicklist
typedef struct quicklist {
  quicklistNode *head;
  quicklistNode *tail;
  unsigned long count;  // 总元素数
  unsigned int len;     // 节点数
  int fill:16;          // 单个 node 最大元素数
  int compress:16;      // 深度压缩
} quicklist;
```

**关键参数表**：

| `list-max-listpack-size` | 单个 quicklist 节点最大字节（默认 8KB） |
|---|---|
| `list-compress-depth` | 两端不压缩的节点数（默认 0 = 全不压缩） |

| 操作 | 复杂度 |
|---|---|
| LPUSH / RPUSH | O(1) |
| LPOP / RPOP | O(1) |
| LINDEX | O(n)（需遍历节点） |
| LRANGE | O(n+m)，n = start offset，m = count |
| LINSERT | O(n) |

**最佳实践列表**：
- 短 List（<几百元素）性能好——quicklist 节点数少
- 大 List 慎用 LINDEX / LSET——O(n)
- LPUSH + RPOP = 队列；LPUSH + LPOP = 栈
- 7.0+ listpack 替代 ziplist——更好的压缩
- 反模式：百万级 List 单次 LRANGE 0 -1——网络阻塞

### 模式 12：Stream 类型与消费者组

**问题场景**：Pub/Sub 是"fire-and-forget"——消息不会持久化，重连丢失。Kafka 风格的消息队列需要"消息持久化 + 消费者组 + 消费进度"。Redis 5.0+ 引入 Stream。

**解决方案代码**：

```c
// src/t_stream.c: streamAppendItem
int streamAppendItem(stream *s, robj *key, robj **argv, int64_t numfields, int64_t *field_indexes) {
  // 生成 ID：ms + seq
  streamID id = s->last_id;
  if (s->last_id.ms == currentMs) id.seq++;
  else id.ms = currentMs, id.seq = 0;
  // 存到 radix tree
  streamNode *n = streamCreateNode(s, id);
  streamLastId(s, &s->last_id);
  // ...
}

// 消费者组
int streamCreateCG(stream *s, const char *name, size_t name_len, streamID *id) {
  streamCG *cg = streamCreateCG(s, name, name_len, id);
  // 初始化 PEL (Pending Entry List)
  raxInsert(&(cg->pel), ...);
  return C_OK;
}

// XADD mystream * field1 value1 field2 value2
// XREADGROUP GROUP consumer1 COUNT 10 STREAMS mystream >
// XACK mystream consumer1 1234-0
```

**关键参数表**：

| Stream 命令 | 用途 |
|---|---|
| `XADD` | 添加消息 |
| `XREAD` | 读取（不消费） |
| `XREADGROUP` | 消费者组读取（消费） |
| `XACK` | 确认消费 |
| `XPENDING` | 看未确认 |
| `XCLAIM` | 转移未确认 |
| `XTRIM` | 修剪（按 ID 或长度） |
| `XINFO` | 流信息 |

| 消息 ID | 格式 | 例子 |
|---|---|---|
| 显式 | `ms-seq` | `1234-0` |
| 自动 | `*` | 服务器生成 |
| 部分 | `1234-*` | 服务器选 seq |

**最佳实践列表**：
- Stream 适合"消息持久化 + 至少一次投递"场景
- 消费者组：每条消息只被一个 consumer 处理
- `XADD MAXLEN ~ 1000` 限制流大小——避免内存爆炸
- `XREAD BLOCK 5000` 阻塞读——节省 CPU
- 反模式：不用消费者组的 XREAD——消息不会"标记已读"

### 模式 13：Lua 脚本与原子性

**问题场景**：业务需要"多个命令原子执行"——事务（MULTI/EXEC）有局限（不支持复杂逻辑）。Redis 用 Lua 脚本（5+ 起的 EVAL）——脚本在 Redis 单线程内执行，天然原子。

**解决方案代码**：

```c
// src/eval.c: evalCommand
void evalCommand(client *c) {
  // 1. 编译 Lua 脚本
  // 2. 注入到 Lua runtime（带 redis.call/pcall 等库）
  // 3. 在 lua_pcall 里跑
  // 4. 把 redis.call 翻译为 C 函数 call()
}

// Lua 脚本（库存扣减）
local stock = tonumber(redis.call('GET', KEYS[1]))
if stock == nil then
  return -1
end
if stock < tonumber(ARGV[1]) then
  return 0
end
redis.call('DECRBY', KEYS[1], ARGV[1])
return 1
// SCRIPT LOAD 上传 → EVALSHA 调用
```

**关键参数表**：

| Lua API | 用途 |
|---|---|
| `redis.call(cmd, ...)` | 执行 Redis 命令（抛错） |
| `redis.pcall(cmd, ...)` | 执行（捕获错） |
| `redis.error_reply()` | 抛错 |
| `redis.status_reply()` | 状态回复 |
| `redis.log(level, msg)` | 写日志 |
| `KEYS[1..N]` | 键参数 |
| `ARGV[1..N]` | 值参数 |

| Lua 限制 | 默认值 |
|---|---|
| 脚本超时 | 5s（`lua-time-limit`） |
| 函数库 | 默认禁用 `os` / `io` / `debug` |

**最佳实践列表**：
- 复杂业务用 Lua 脚本——避免竞态条件
- 用 `EVALSHA` 节省带宽——只传 SHA1
- `redis.replicate_commands()` 标记脚本可复制（旧版兼容）
- 避免 Lua 死循环——超时会被 SCRIPT KILL
- 反模式：Lua 内 `redis.call('KEYS', '*')`——影响复制

### 模式 14：GEO 地理空间与 HyperLogLog

**问题场景**：业务需要"附近的用户"（地理查询）、"独立访客数"（基数估算）。Redis 6+ 集成 GEO（基于 SortedSet），2.8+ 有 HyperLogLog。

**解决方案代码**：

```c
// src/geo.c: geoAdd
void geoAddCommand(client *c) {
  // 1. 解析经纬度
  // 2. 算 geohash（11 位精度）
  uint64_t hash = geohashEncodeWGS84(longitude, latitude, 26);
  // 3. 用 52 位 hash 作为 score 存到 SortedSet
  // ZADD city geo:hash member
}

// HyperLogLog（HLL）
struct hllhdr {
  char magic[4];      // "HYLL"
  uint8_t encoding;   // 0 = dense, 1 = sparse
  uint8_t NOTUSED[3];
  uint8_t registers[]; // 16384 个 6-bit 寄存器
};

// PFADD hll key1 key2 key3
// PFCOUNT hll  → 估算基数（错误率 ~0.81%）
// PFMERGE dst hll1 hll2
```

**关键参数表**：

| GEO 命令 | 用途 |
|---|---|
| `GEOADD` | 添加位置 |
| `GEODIST` | 两点距离 |
| `GEOHASH` | geohash 字符串 |
| `GEOPOS` | 经纬度 |
| `GEOSEARCH` | 附近查询（6.2+） |
| `GEORADIUS` | 旧版附近查询（已弃用） |

| HLL 命令 | 用途 |
|---|---|
| `PFADD` | 添加元素 |
| `PFCOUNT` | 估算基数 |
| `PFMERGE` | 合并 HLL |

**最佳实践列表**：
- GEO 精度 5-6 位——城市级可用
- `GEOSEARCH BYBOX WIDTH H HEIGHT H` 范围查询
- HLL 内存恒定（每个 key 12KB）——百万级 UV 计数
- HLL 错误率 ~0.81%——可接受"估算"
- 反模式：精确 UV 用 HLL——需要精确用 Set（O(去重) 内存）

### 模式 15：Pub/Sub 消息发布订阅

**问题场景**：业务需要"广播消息"——一个发布者 N 个订阅者。Redis Pub/Sub 是 fire-and-forget 模式，订阅者断线 = 消息丢失。

**解决方案代码**：

```c
// src/pubsub.c: pubsubSubscribeChannel
int pubsubSubscribeChannel(client *c, robj *channel) {
  // 把 channel 加入 client.pubsub_channels 字典
  dictAdd(c->pubsub_channels, channel, NULL);
  // 反向索引：channel → client 列表
  if (dictAdd(server.pubsub_channels, channel, dict) == DICT_OK) {
    server.pubsub_channels->type = OBJ_MAP;
  }
  return retval;
}

// 发布
int pubsubPublishMessage(robj *channel, robj *message) {
  int receivers = 0;
  dictEntry *de;
  dictIterator *di = dictGetSafeIterator(server.pubsub_channels);
  while ((de = dictNext(di)) != NULL) {
    robj *c = dictGetKey(de);
    // 写消息到 client 输出缓冲
    addReplyPubsubMessage(c, channel, message);
    receivers++;
  }
  return receivers;
}
```

**关键参数表**：

| Pub/Sub 命令 | 用途 |
|---|---|
| `SUBSCRIBE channel` | 订阅 |
| `UNSUBSCRIBE [channel]` | 退订 |
| `PUBLISH channel msg` | 发布 |
| `PSUBSCRIBE pattern*` | 模式订阅 |
| `PUBSUB CHANNELS` | 当前活跃 channel |
| `PUBSUB NUMSUB` | 订阅者数量 |

**最佳实践列表**：
- Pub/Sub 不持久化——断线即失
- 高吞吐用 sharded pub/sub（7.0+）——分片到节点
- 简单聊天 / 通知用 Pub/Sub；关键消息用 Stream
- 客户端心跳保持连接——`PING` 间隔 < TCP keepalive
- 反模式：百万订阅者——消息扇出爆炸

---

## 四、内存管理与生产实践

### 模式 16：内存淘汰策略（maxmemory-policy）

**问题场景**：Redis 内存满时怎么办？8 种淘汰策略，从"不淘汰（OOM 报错）"到"近似 LFU 淘汰"。

**解决方案代码**：

```c
// src/evict.c: performEvictions
int performEvictions(void) {
  // 1. 内存未超限，不淘汰
  if (server.maxmemory_policy == MAXMEMORY_NO_EVICTION || mem_used < server.maxmemory) return 0;
  // 2. 采样一批 key
  for (i = 0; i < server.maxmemory_samples; i++) {
    if (server.maxmemory_policy == MAXMEMORY_ALLKEYS_LRU || ...) {
      // 从 dict 中随机取 key
      de = dictGetRandomKey(db->dict);
      // 计算 idle 时间
      idle = estimateObjectIdleTime(o);
    }
    // 放入 evict pool（最差的 N 个 key）
    if (idle > pool[poolsize - 1].idle) {
      // ... 排序
    }
  }
  // 3. 淘汰 pool 中最差 key
  for (i = 0; i < poolsize; i++) {
    if (pool[i].keyobj) dbDelete(db, pool[i].keyobj);
  }
  return keys_freed;
}
```

**关键参数表**：

| 策略 | 说明 | 适用 |
|---|---|---|
| `noeviction` | 写命令返回 OOM | 默认（不丢数据） |
| `allkeys-lru` | 所有 key 中 LRU 淘汰 | 缓存场景 |
| `volatile-lru` | 过期 key 中 LRU 淘汰 | 混合 |
| `allkeys-lfu` | LFU 淘汰（4.0+） | 热点数据保护 |
| `volatile-lfu` | 过期 key 中 LFU 淘汰 | 混合 |
| `allkeys-random` | 随机淘汰 | 通用 |
| `volatile-random` | 过期 key 随机 | 通用 |
| `volatile-ttl` | 优先淘汰 TTL 最短 | 临时数据 |

**最佳实践列表**：
- 纯缓存：`maxmemory-policy allkeys-lru`
- 数据 + 缓存混合：`volatile-lru`（只淘汰过期）
- LFU 比 LRU 抗"突发流量"——热点保留
- `maxmemory-samples 10` 采样精度——越大越准但越慢
- 监控 `used_memory` / `used_memory_peak` / `mem_fragmentation_ratio`

### 模式 17：BigKey 检测与拆分

**问题场景**：单 key 太大（String > 1MB / Hash > 10w fields）会阻塞 Redis（DEL 同步、序列化慢）。需要主动发现 + 拆分。

**解决方案代码**：

```bash
# 1. 找大 key（redis-cli --bigkeys）
redis-cli -h host -p port --bigkeys
# 输出：-------- summary -------
# Biggest string found '"foo"' has 1000000 bytes
# Biggest list found '"bar"' has 100000 items

# 2. 用 MEMORY USAGE 看 key 字节
redis-cli MEMORY USAGE mykey

# 3. 用 DEBUG OBJECT 看编码
redis-cli DEBUG OBJECT mykey

# 4. 用 RDB 分析（rdb-tools）
rdb -c memory dump.rdb | sort -k4 -nr | head -20
```

**关键参数表**：

| 数据类型 | BigKey 阈值 |
|---|---|
| String | > 1MB |
| List | > 10w 元素 |
| Hash | > 10w fields |
| Set | > 10w members |
| SortedSet | > 10w elements |
| Stream | > 10w entries |

**最佳实践列表**：
- 定期跑 `redis-cli --bigkeys`——发现大 key
- 拆分大 key：Hash 拆成多个，按 user_id % N 分桶
- DEL 大 key 用 `UNLINK`（异步）——避免阻塞
- 反模式：HGETALL 大 hash——可能阻塞数百 ms
- 监控 `slowlog get`——大 key 操作会进入慢查询

### 模式 18：慢查询日志（slowlog）

**问题场景**：Redis 命令执行超过阈值（如 10ms）需要记录到慢查询日志——类似 MySQL slow log。

**解决方案代码**：

```c
// src/debug.c: slowlogPushEntry
void slowlogPushEntryIfNeeded(client *c, robj **argv, int argc, uint64_t duration) {
  if (server.slowlog_log_slower_than == 0) return;  // 关闭
  if (duration < server.slowlog_log_slower_than) return;  // 未超阈值
  // 构造慢查询条目
  slowlogEntry *se = zmalloc(sizeof(*se));
  se->id = server.slowlog_entry_id++;
  se->timestamp = commandTimeSnapshot();
  se->duration = duration;
  se->argv = argv;
  se->argc = argc;
  // 追加到 slowlog
  listAddNodeHead(server.slowlog, se);
  // 限制长度
  while (listLength(server.slowlog) > server.slowlog_max_len)
    listDelNode(server.slowlog, listLast(server.slowlog));
}
```

**关键参数表**：

| 配置 | 默认值 |
|---|---|
| `slowlog-log-slower-than` | 10000（微秒，10ms） |
| `slowlog-max-len` | 128（条数） |

| 命令 | 用途 |
|---|---|
| `SLOWLOG GET [n]` | 取最近 n 条 |
| `SLOWLOG LEN` | 总条数 |
| `SLOWLOG RESET` | 清空 |

**最佳实践列表**：
- 生产设 `slowlog-log-slower-than 5000`（5ms）——记录更细
- `SLOWLOG GET 50` 定期看——发现慢命令
- 常见慢命令：KEYS *（O(n)）、HGETALL（大 hash）、SMEMBERS（大 set）
- 用 `monitor` 短时间抓包——诊断"突发慢"
- 反模式：`MONITOR` 长时间开启——性能暴跌 10x

### 模式 19：Pipeline 与事务

**问题场景**：客户端发 100 个 GET 命令——100 次 RTT。Pipeline 把多条命令打包发送，服务器批量处理。同时"原子性"需要事务（MULTI/EXEC）。

**解决方案代码**：

```c
// src/networking.c: processCommand
// MULTI/EXEC 事务
int processCommand(client *c) {
  // 1. 普通命令入队
  if (c->flags & CLIENT_MULTI) {
    // 事务中，命令入队
    queueMultiCommand(c);
    addReply(c, shared.queued);
  }
  // 2. EXEC 时批量执行
  if (strcasecmp(c->argv[0]->ptr, "exec") == 0) {
    execCommand(c);
    // 遍历 queueMultiCommand 列表，依次执行
  }
}

// 客户端 pipeline
auto pipe = redis.pipelined();
pipe.set("a", 1);
pipe.set("b", 2);
pipe.get("a");
pipe.get("b");
pipe.execute();  // 一次 RTT 发送 4 命令
```

**关键参数表**：

| 特性 | Pipeline | MULTI/EXEC | Lua 脚本 |
|---|---|---|---|
| 原子性 | ❌（穿插其他命令） | ✅（server 端串行） | ✅（server 端原子） |
| RTT 优化 | ✅ | ✅ | ✅ |
| 复杂逻辑 | ❌ | ❌（if/else 难表达） | ✅ |
| 失败回滚 | ❌ | ❌（EXEC 不全回滚） | ✅（手动） |
| Cluster 限制 | 单槽 | 单槽 | 单槽 |

**最佳实践列表**：
- 批量写用 Pipeline——5x 性能提升
- 原子操作 + 简单逻辑：MULTI/EXEC
- 原子操作 + 复杂逻辑：Lua 脚本
- Cluster 下用 hash tag 强制同槽
- 反模式：Pipeline 1000+ 命令——单次响应太大

### 模式 20：监控与客户端库

**问题场景**：线上 Redis 出问题怎么快速定位？需要：(1) 实时指标（QPS / 内存 / 连接数）；(2) 客户端库支持集群 / sentinel / pipeline；(3) 性能基线。

**解决方案代码**：

```c
// src/server.c: serverCron —— 内部统计
void serverCron(void) {
  // 1. 更新 stats
  run_with_period(1000) {
    trackOperationsPerSecond();  // 算 instaneous_ops_per_sec
    trackInstantaneousInputOutputMetrics();
  }
  // 2. 客户端表清理
  // 3. AOF / RDB / 复制 cron
  // 4. Cluster gossip
}

// INFO 命令
void infoCommand(client *c) {
  // 输出 200+ 字段
  // INFO memory / replication / stats / cpu / cluster / keyspace
}
```

**关键参数表**：

| 指标 | 用途 |
|---|---|
| `used_memory` | 内存使用 |
| `used_memory_rss` | 实际 RSS |
| `mem_fragmentation_ratio` | 内存碎片率 |
| `connected_clients` | 当前连接 |
| `instantaneous_ops_per_sec` | 实时 QPS |
| `keyspace_hits` / `keyspace_misses` | 命中率 |
| `total_commands_processed` | 总命令数 |
| `rejected_connections` | 拒绝连接数 |

| 客户端库 | 语言 | 特点 |
|---|---|---|
| `redis-py` | Python | 官方 |
| `ioredis` | Node.js | 集群 + Sentinel |
| `lettuce` | Java | 响应式 |
| `go-redis` | Go | 集群 + Sentinel |
| `redis-rs` | Rust | 异步 tokio |

**最佳实践列表**：
- 监控：`connected_clients` < `maxclients`（默认 10000）
- 监控：`keyspace_hits / (keyspace_hits + keyspace_misses) > 0.9`
- 监控：`mem_fragmentation_ratio` 在 1.0-1.5 正常
- 客户端连接池：避免"短连接风暴"
- 反模式：监控只看不报警——配置 AlertManager / PagerDuty

---

## 附：仓库元信息

- **路径**：`G:\实战案例\GitHub顶尖项目\redis\`
- **大小**：约 50MB
- **总文件**：~200（src 100+, tests 27, utils 10）
- **核心子系统**：`dict.c` / `object.c` / `server.c`（aeMain） / `networking.c`（RESP） / `aof.c` / `rdb.c` / `cluster.c` / `replication.c`
- **锁定 commit**：v7.4.1
- **学习入口**：先读 `dict.c`（哈希表）→ `object.c`（统一对象）→ `server.c` 的 `aeMain`（事件循环）→ `networking.c`（RESP 协议）→ `aof.c` / `rdb.c`（持久化）→ `cluster.c`（集群协议）

## 一句话总结

Redis 用"单线程事件循环 + 内存数据结构 + 8 种淘汰策略"定义了 in-memory data structure server 的工业标准。核心洞察：单线程 = 内存访问无锁 = 充分利用 CPU cache，IO 多路复用让单线程处理 10w+ QPS；dict 是所有数据结构的底层，渐进式 rehash 让单次操作 O(1)；RESP 协议简单到 10 行可实现 parser，配合 Pipeline 减少 RTT；AOF + RDB + Replication + Sentinel + Cluster 形成完整的"持久化 + 高可用 + 水平扩展"方案，让 Redis 从 KV 缓存进化为完整的内存数据平台。
