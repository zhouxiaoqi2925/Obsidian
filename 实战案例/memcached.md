# Memcached - 内存分配与 LRU 驱逐

**来源**：GitHub memcached/memcached
**创建时间**：2026-06-02

---

## 一、内存分配：Slab 分配器

### 1. Slab 分配器与 chunk class（Slab Allocator）

**问题场景**：高频小块对象（典型 100-500 字节）的 malloc/free 触发 glibc 内部碎片化，分配延迟抖动 100us-1ms；缓存系统无法接受这种"魔数延迟"。

**解决方案**：
```c
// slabs.c:77 简化版
unsigned int slabs_clsid(const size_t size) {
    int res = POWER_SMALLEST;
    if (size == 0 || size > settings.item_size_max)  /* > 1MB 直接拒绝 */
        return 0;
    while (size > slabclass[res].size)              /* O(n) 线性扫描 */
        if (res++ == power_largest)
            return power_largest;
    return res;
}

// slabs.c:198
slabclass_t slabclass[MAX_NUMBER_OF_SLAB_CLASSES];  /* 64 个 class */
```

**关键参数**：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_NUMBER_OF_SLAB_CLASSES` | 64 | slab class 上限 |
| `POWER_SMALLEST` | 1 | 最小 chunk = 96B |
| `factor` | 1.25 | chunk 增长因子（120 → 150 → 188 → ...） |
| `item_size_max` | 1MB | 单个 item 硬上限 |
| `slab_page_size` | 1MB | 每个 slab 的内存页大小 |

**最佳实践**：
- ✅ 64 个 slab class 用全局静态数组，永远在 L1 cache
- ✅ `factor=1.25` 平衡"类多浪费"与"类少内存碎片"
- ✅ 1MB 上限是为了避免"大对象让小对象分配等待"
- ❌ 切勿把 `factor` 调到 2.0（会浪费 30% 内存）
- ❌ 切勿让单 item 超过 1MB（被拒）

### 2. 分配-驱逐双阶段循环（Alloc-Evict Loop）

**问题场景**：缓存满了之后，每次新 set 要先驱逐一个旧 item，再分配新内存；如果直接遍历 LRU 找最旧，O(n) 操作会卡主线程。

**解决方案**：
```c
// items.c:162 do_item_alloc_pull 简化
item *do_item_alloc_pull(const size_t ntotal, const unsigned int id) {
    item *it = NULL;
    for (i = 0; i < 10; i++) {
        if (!settings.lru_segmented)
            lru_pull_tail(id, COLD_LRU, 0, 0, 0, NULL);  /* 优先冷队列 */
        it = slabs_alloc(id, 0);
        if (it == NULL) {
            if (lru_pull_tail(id, COLD_LRU, 0, LRU_PULL_EVICT, 0, NULL) <= 0) {
                if (settings.lru_segmented)
                    lru_pull_tail(id, HOT_LRU, 0, 0, 0, NULL);  /* 最后才碰热 */
                else
                    break;
            }
        } else break;
    }
    return it;
}
```

**关键参数**：

| 字段 | 推荐 | 说明 |
| --- | --- | --- |
| `MAX_RETRIES` | 10 | 分配-驱逐最大重试 |
| 驱逐顺序 | COLD → WARM → HOT | 保护热点命中率 |
| `LRU_PULL_EVICT` | 标志位 | 真驱逐 vs 仅检查 |

**最佳实践**：
- ✅ 驱逐从冷队列开始，最后才碰热队列——保护命中率
- ✅ 重试上限 10 次防止"分配永远失败"死循环
- ✅ 业务方 `lru_segmented=true` 启用四段 LRU（HOT/WARM/COLD/TEMP）
- ❌ 切勿直接遍历全 LRU 找最旧（O(n) 阻塞）
- ❌ 切勿在热路径上做驱逐决策（应走异步 crawler）

### 3. 幂等桶大小与位运算（Power-of-2 Buckets）

**问题场景**：哈希表桶数取 2 的幂，hash 路由从 `hv % N`（除法，慢）变成 `hv & (N-1)`（位与，快 5-10 倍）。

**解决方案**：
```c
// assoc.c:55
#define hashsize(n) ((ub4)1 << (n))     /* 2^n */
#define hashmask(n) (hashsize(n) - 1)   /* 全 1 位掩码 */

void assoc_init(const int hashtable_init) {
    if (hashtable_init) hashpower = hashtable_init;  /* 默认 16 = 65536 桶 */
    primary_hashtable = calloc(hashsize(hashpower), sizeof(void *));
}

// 路由
it = primary_hashtable[hv & hashmask(hashpower)];  /* 位与代替取模 */
```

**关键参数**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `hashpower` | 16 | 桶数 = 2^16 = 65536 |
| 装填因子 | 0.75 | 触发渐进 rehash |
| `hash_extra` | 随机种子 | 防 HashDoS |

**最佳实践**：
- ✅ 业务方任何"按 N 取模"都改成 `& (N-1)` + N = 2^k
- ✅ 装填因子 0.75 是经验最优（rehash 开销 vs 哈希冲突折中）
- ✅ 加 `hash_extra` 随机数防止攻击者构造哈希碰撞
- ❌ 切勿用 N = 1000 这种非 2 幂桶数（位运算失效）
- ❌ 切勿在循环里反复算 `hashsize(n)`

### 4. 渐进式 rehash（Incremental Resize）

**问题场景**：哈希表满时直接重建（重新分配 + 拷贝全部 key）会卡主线程 100ms+；客户端请求堆积、连接超时。

**解决方案**：
```c
// assoc.c:74
if (expanding && (oldbucket = (hv & hashmask(hashpower - 1))) >= expand_bucket) {
    it = old_hashtable[oldbucket];  /* 已迁移的 bucket 查旧表 */
} else {
    it = primary_hashtable[hv & hashmask(hashpower)];  /* 未迁移的查新表 */
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `expand_bucket` | 当前迁移到第几个 bucket |
| `old_hashtable` | 旧表，迁移完成后释放 |
| `rehash_step` | 每次写操作搬几个 bucket |

**最佳实践**：
- ✅ rehash 平摊到每次 `assoc_insert`（隐式触发）
- ✅ 业务方任何"扩缩容"都走渐进式（数据库表、连接池、缓存池）
- ❌ 切勿在请求路径上做 `realloc + memcpy` 全量迁移
- ❌ 切勿让扩容步长 > 总桶数（否则本质是一次性迁移）

### 5. 侵入式 LRU 链表（Intrusive Linked List）

**问题场景**：每个 item 需要同时挂在哈希表链（解决冲突）和 LRU 链（淘汰顺序）。如果用"包装 node 节点"做法，每个 item 多 16 字节指针，1 亿 item 多 1.6GB。

**解决方案**：
```c
// items.c:23 item 结构
typedef struct _stritem {
    struct _stritem *h_next;  /* 哈希桶 next 链 */
    struct _stritem *prev;    /* LRU 双向链 */
    struct _stritem *next;    /* LRU 双向链 */
    rel_time_t time;          /* 插入时间 */
    rel_time_t exptime;       /* 过期时间 */
    uint32_t nbytes;          /* value 长度 */
    // ...
} item;

// items.c:50
static item *heads[LARGEST_ID];  /* 每 LRU class 一个 head */
static item *tails[LARGEST_ID];  /* 每 LRU class 一个 tail */
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `h_next` | 哈希桶链（同 bucket 内冲突 item） |
| `prev/next` | LRU 双向链 |
| `LARGEST_ID` | 4（HOT/WARM/COLD/TEMP） |

**最佳实践**：
- ✅ item 自己当链表节点，零额外分配
- ✅ 双向链让 O(1) 删除（O(n) 变 O(1)）
- ✅ 四段 LRU（HOT/WARM/COLD/TEMP）保护热点
- ❌ 切勿用 `vector<item>` + index 模拟链表（删除 O(n)）
- ❌ 切勿用包装 node（多 16 字节/item）

---

## 二、协议层：ASCII / Binary / Meta

### 6. ASCII 协议与命令解析（Text Protocol）

**问题场景**：缓存协议要可读（运维能 telnet 调试）+ 高效（解析快）+ 简洁（命令少）。memcached 用 ASCII 协议 + 空格分隔的简单格式。

**解决方案**：
```c
// proto_text.c
// 命令格式：<command> <key> <flags> <exptime> <bytes> [noreply]\r\n
// 示例：set mykey 0 0 5\r\nhello\r\n

static int try_read_command(conn *c) {
    char *el, *cont;  /* 空格/换行 */
    if ((el = memchr(c->rcurr, ' ', c->rbytes)) == NULL) return 0;
    // 解析 command, key, flags, exptime, bytes
    process_command(c, command, key, flags, exptime, bytes);
}
```

**关键参数**：

| 命令 | 含义 |
| --- | --- |
| `set key flags exptime bytes` | 写入 |
| `get key` | 读取 |
| `delete key` | 删除 |
| `incr/decr key value` | 原子增减 |
| `stats` | 服务端统计 |

**最佳实践**：
- ✅ 业务方生产用 binary 协议（解析快 30%）
- ✅ 调试用 telnet + ASCII（`echo 'stats' | nc localhost 11211`）
- ✅ `noreply` 标志避免 set 的写响应阻塞
- ❌ 切勿在 client 端拼字符串发命令（用现成 client 库）
- ❌ 切勿忘记带 `\r\n` 结束符

### 7. 二进制协议（Binary Protocol，已弃用）

**问题场景**：ASCII 协议解析慢（memchr + strtol），跨语言实现差异（字节序、对齐），需要"严格二进制"协议。

**解决方案**：
```c
// proto_bin.c 头部结构
typedef struct {
    uint8_t  magic;      /* 0x80 */
    uint8_t  opcode;     /* 命令码 */
    uint16_t keylen;     /* 2 字节 */
    uint8_t  extlen;     /* extras 长度 */
    uint8_t  datatype;   /* 0 */
    uint16_t vbucket;    /* 状态码 */
    uint32_t bodylen;    /* 4 字节 */
    uint32_t opaque;     /* 请求 ID */
    uint64_t cas;        /* 8 字节 CAS */
} __attribute__((packed)) bin_header;
```

**关键参数**：

| 字段 | 大小 | 说明 |
| --- | --- | --- |
| `magic` | 1B | `0x80` |
| `opcode` | 1B | 0x01=GET, 0x04=SET, ... |
| `keylen` | 2B | key 长度 |
| `bodylen` | 4B | extras + key + value 长度 |
| `opaque` | 4B | 请求/响应配对 ID |
| `cas` | 8B | Check-And-Set 乐观锁 |

**最佳实践**：
- ✅ Binary 协议已 deprecated，**新代码用 meta 协议**
- ✅ 跨语言 SDK 用 binary（避免解析差异）
- ✅ 32 位 opaque 让 client 端关联请求-响应
- ❌ 切勿新项目用 binary（meta 协议才是未来）
- ❌ 切勿忘了 `__attribute__((packed))`（网络字节序对齐）

### 8. Meta 协议（Meta Commands）

**问题场景**：binary 协议二进制不可读；ASCII 协议命令集有限。需要"文本可读 + 扩展字段"的协议。

**解决方案**：
```text
# meta set with TTL + flags
ms key=mykey t=60 F=value-flags v=5\r\nhello\r\n

# meta get with CAS
mg key=mykey v c\r\n

# meta delete
md key=mykey\r\n
```

**关键参数**：

| 标志 | 含义 |
| --- | --- |
| `t` | TTL（秒） |
| `F` | client flags |
| `c` | 返回 CAS 值 |
| `v` | 返回 value 字节数 |
| `O` | overwrite / no-overwrite |
| `token` | opaque token |

**最佳实践**：
- ✅ 新项目用 meta 协议（文本 + 二进制双方优点）
- ✅ Meta 协议是 1.5+ 实验性，1.6 稳定
- ✅ 业务方可扩展自定义 flag（如 `F=tenant=acme`）
- ❌ 切勿把 meta 协议当 binary 用（解析性能不如 binary）
- ❌ 切勿忘记在客户端验证 `O` 标志（避免意外覆盖）

### 9. extstore 磁盘后端（Disk Tier）

**问题场景**：内存成本是 SSD 的 50 倍；当缓存 > 100GB 时，业务方想要"冷数据落盘"分层存储。memcached 1.5+ 引入 extstore 实现 warm tier。

**解决方案**：
```c
// extstore.c 简化
struct extstore_page_pool {
    int free_pages;       /* 空闲 page 数 */
    struct page *pages;   /* 预分配的 page */
};

int extstore_submit(struct extstore_io *eio, item *it, int code) {
    /* 异步写盘 */
    io_submit(eio->io_ctx, 1, &iocb);
    /* 注册回调，page 落盘后回调 */
}

int extstore_page_alloc(struct extstore_page_pool *p, item *it) {
    /* 从 page pool 拿一个 */
    pthread_mutex_lock(&p->mutex);
    page = p->pages[p->free_pages--];
    pthread_mutex_unlock(&p->mutex);
}
```

**关键参数**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `extstore_path` | 无 | 磁盘路径 |
| `extstore_size` | 0 | 磁盘总容量 |
| `extstore_page_count` | 0 | 预分配 page 数 |
| `io_thread` | 1 | 后台 IO 线程数 |

**最佳实践**：
- ✅ 业务方用 extstore 做 warm tier（> 100GB 缓存必开）
- ✅ page 异步写盘，hot 数据仍走内存
- ✅ 配合 segmented LRU 识别 hot vs cold
- ❌ 切勿把 hot 数据写 extstore（读盘慢 1000x）
- ❌ 切勿让 extstore 用机械盘（IOPS 瓶颈）

### 10. proxy + Lua 配置（Lua Proxy）

**问题场景**：多 memcached 节点要客户端 sharding，proxy 把多个 mc 节点聚合成一个逻辑节点；Lua 提供路由逻辑扩展。

**解决方案**：
```lua
-- /etc/memcached/proxy.lua
function route(conn, key)
    -- 简单 hash mod N
    local n = 3  -- 3 个后端
    return crc32(key) % n + 1
end

function select_bucket(key)
    return crc32(key) % 1024
end
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `proxy.config` | 路由规则文件 |
| `--enable-proxy` | 编译选项 |
| `proxy_listen` | 监听端口（如 11212） |
| `mcmc` | memcached client SDK |

**最佳实践**：
- ✅ 业务方多 mc 节点部署用 proxy 聚合
- ✅ Lua 写路由逻辑（一致性 hash、读写分离）
- ✅ proxy 前端可加 L7 LB（Nginx / HAProxy）
- ❌ 切勿让 Lua 路由逻辑超过 1000 行（CPU 瓶颈）
- ❌ 切勿把 Lua 状态当全局（proxy 多线程会竞争）

---

## 三、性能与并发：多线程与 libevent

### 11. 主-工-后台三段线程模型（Thread Topology）

**问题场景**：单线程 epoll 吞吐受 CPU 单核限制（10-20w QPS）；多线程共享 epoll 又触发全局锁争抢。

**解决方案**：
```c
// thread.c 简化
void thread_init(int nthreads, struct event_base *main_base) {
    for (i = 0; i < nthreads; i++) {
        pthread_create(&threads[i].thread_id, NULL, worker_libevent,
                       &threads[i]);
    }
}

void *worker_libevent(void *arg) {
    struct thread_stats *stats = arg;
    event_base_loop(stats->base, 0);  /* 每个工作线程独立 epoll */
    return NULL;
}

// 主线程
void dispatch_conn(int sid, conn *c) {
    int tid = (last_thread + 1) % settings.num_threads;
    CQ_PUSH(threads[tid].new_conn_queue, c);  /* 轮询分发 */
}
```

**关键参数**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `-t` | 4 | 工作线程数（建议 = CPU 核数） |
| `-c` | 1024 | 最大连接数 |
| `-m` | 64MB | 内存上限 |
| `dispatch` | round-robin | 连接分发策略 |

**最佳实践**：
- ✅ 业务方 `-t` = CPU 核数（避免上下文切换）
- ✅ 4-8 线程适合大多数场景（> 16 收益递减）
- ✅ 每个工作线程独立 epoll 避免全局锁
- ❌ 切勿让工作线程数 > CPU 核数（上下文切换毁性能）
- ❌ 切勿让所有线程共享一个 event_base（锁竞争）

### 12. listen thread + worker thread accept 分配（Dispatch Model）

**问题场景**：单线程 accept + 多线程处理，主线程的 accept 抖动会卡所有 worker；纯多线程 accept 又触发 "accept 惊群"。

**解决方案**：
```c
// memcached.c main thread
void main_base(void) {
    event_base_loop(main_base, 0);  /* 主线程只做 accept */
}

void accept_new_conns(int server_socket) {
    struct sockaddr_in addr;
    socklen_t addrlen = sizeof(addr);
    int sfd = accept(server_socket, (struct sockaddr*)&addr, &addrlen);
    
    // 分发到 worker（轮询）
    int tid = (last_thread + 1) % settings.num_threads;
    conn *c = conn_new(sfd, ...);
    CQ_PUSH(threads[tid].new_conn_queue, c);
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `accept mutex` | 多进程模式才需要（避免惊群） |
| `new_conn_queue` | 线程间连接队列（无锁 CAS） |
| `SO_REUSEPORT` | 多进程 listen 同一端口 |

**最佳实践**：
- ✅ 单进程多线程：主线程 accept，worker 处理
- ✅ 多进程用 SO_REUSEPORT（内核负载均衡）
- ✅ 业务方单 memcached 进程跑多线程（轻量、shared hash）
- ❌ 切勿让 worker 线程自己 accept（全局锁）
- ❌ 切勿让主线程参与业务处理（accept 抖动会卡连接）

### 13. libevent 事件循环（Event Loop）

**问题场景**：跨平台事件多路复用（Linux epoll / BSD kqueue / Windows IOCP）需要抽象；每线程独立 epoll 实例让业务隔离。

**解决方案**：
```c
// memcached.c
event_base *main_base = NULL;

void main_base(void) {
    main_base = event_init();
    event_set(&listen_event, server_socket, EV_READ | EV_PERSIST, 
              accept_new_conns, NULL);
    event_base_set(main_base, &listen_event);
    event_add(&listen_event, 0);
    event_base_loop(main_base, 0);  /* 主线程阻塞在 epoll */
}

// worker libevent 同理
```

**关键参数**：

| libevent 标志 | 含义 |
| --- | --- |
| `EV_READ` | 可读事件 |
| `EV_PERSIST` | 持续触发（不一次性） |
| `EV_TIMEOUT` | 定时器 |
| `event_base_loop` | 进入 epoll_wait |

**最佳实践**：
- ✅ 业务方用 libevent 抽象（跨平台）
- ✅ `EV_PERSIST` 让监听 socket 持续触发
- ✅ 多线程用独立 `event_base`（避免锁）
- ❌ 切勿在事件回调里做阻塞 IO（破坏 event loop）
- ❌ 切勿用 `select()`（高并发下 FD_SETSIZE 限制）

### 14. 线程局部统计（Thread-Local Stats）

**问题场景**：全局 stats 计数器是热点（每秒数十万次 incr），多线程共享 stats 触发 cache line bouncing（伪共享），性能下降 50%。

**解决方案**：
```c
// memcached.c stats 结构
struct thread_stats {
    pthread_mutex_t mutex;  /* thread-local */
    uint64_t get_cmds;
    uint64_t set_cmds;
    uint64_t bytes_read;
    // ...
} thread_stats[MAX_THREADS];

// 累加（无锁）
thread_stats[thread_id].get_cmds++;

// 聚合
void stats_accum() {
    for (i = 0; i < nthreads; i++) {
        total.get_cmds += thread_stats[i].get_cmds;
    }
}
```

**关键参数**：

| 字段 | 默认 |
| --- | --- |
| `MAX_THREADS` | 64 |
| 聚合间隔 | 1s（stats 命令） |
| 内存开销 | ~1KB / thread |

**最佳实践**：
- ✅ stats 用 thread-local 累加，无锁
- ✅ 聚合时一次性 sum 各线程
- ✅ padding 防 false sharing（`__attribute__((aligned(64)))`）
- ❌ 切勿让多线程直接 ++ 同一全局计数器
- ❌ 切勿在热路径加 mutex

### 15. CONNS_PER_SLICE 连接分片（Conn Slicing）

**问题场景**：连接表（conn[]）是全局数组，遍历 idle 连接扫全部 1024 个 conn 触发 cache miss + mutex。

**解决方案**：
```c
// memcached.c
#define CONNS_PER_SLICE 16
static conn *conns[1024 / CONNS_PER_SLICE][CONNS_PER_SLICE];  /* 分片 */

// 扫描 idle conn
void conn_shrink() {
    for (s = 0; s < slices; s++) {
        pthread_mutex_lock(&conn_lock[s]);  /* 锁粒度 = 1 slice */
        for (i = 0; i < CONNS_PER_SLICE; i++) {
            if (conns[s][i]->state == CONN_STATE_IDLE) {
                conn_close(conns[s][i]);
            }
        }
        pthread_mutex_unlock(&conn_lock[s]);
    }
}
```

**关键参数**：

| 字段 | 推荐 |
| --- | --- |
| `CONNS_PER_SLICE` | 16 |
| 总 slice 数 | 1024 / 16 = 64 |
| 锁粒度 | 1 slice = 16 conn |

**最佳实践**：
- ✅ 业务方任何"全局表扫描"都按 slice 分片
- ✅ 锁粒度控制在 cache line 大小（典型 16-32 元素）
- ✅ worker 线程锁自己 slice（不抢其他线程 slice）
- ❌ 切勿用单一全局锁保护整个 conn 表
- ❌ 切勿让 slice 数 > CPU 核数（多线程争抢）

---

## 四、可靠性与运维：协议文档、监控、安全

### 16. 协议文档先行（Design First）

**问题场景**：缓存服务有几十种命令 + 各种边界条件；先写代码后写文档容易遗漏行为；先写文档后写代码能让协议设计更严谨。

**解决方案**：
```text
# doc/protocol.txt
COMMAND    ::= "set" | "add" | "replace" | "get" | ...
KEY        ::= <string with no whitespace>
FLAGS      ::= <32-bit unsigned integer>
EXPTIME    ::= <0 or relative time in seconds>
BYTES      ::= <length of value in bytes>
NOREPLY    ::= "noreply" | (empty)

# doc/threads.txt
描述线程模型: 1 listen + N workers, 每个 worker 独立 epoll
# doc/new_lru.txt
描述 segmented LRU: HOT/WARM/COLD/TEMP
# doc/storage.txt
描述 extstore page 模型
```

**关键参数**：

| 文档 | 内容 |
| --- | --- |
| `protocol.txt` | 文本协议规范 |
| `protocol-binary.txt` | 二进制协议 |
| `threads.txt` | 线程模型 |
| `new_lru.txt` | 4 段 LRU |
| `storage.txt` | extstore 存储 |

**最佳实践**：
- ✅ memcached 团队把协议文档当作代码的"前置契约"
- ✅ 业务方在写代码前先写 RFC / ADR
- ✅ 文档变更走 PR review（与代码同等严格）
- ❌ 切勿"代码先，文档后补"——文档会脱节
- ❌ 切勿在文档里只写 happy path（边界条件才是真坑）

### 17. 集成测试 telnet 黑盒（Integration Tests）

**问题场景**：C 系统代码单测难写（mock malloc / epoll），但实际行为测试更重要。memcached 用 Perl Test::More 跑 114 个 .t 集成测试，telnet mc 验证响应。

**解决方案**：
```perl
# t/set.t 简化
use Test::More;
use Memcached::Client;

my $mc = Memcached::Client->new(servers => "127.0.0.1:11211");

ok($mc->set("foo", "bar", 0, 60), "set foo=bar");
is($mc->get("foo"), "bar", "get returns bar");
ok(!$mc->set("foo", "bar2", 0, 0, noreply => 0), "noreply ok");

done_testing();
```

**关键参数**：

| 字段 | 默认 |
| --- | --- |
| 测试文件 | 114 个 .t |
| 测试框架 | Test::More |
| 客户端 | `mcmc` Perl 库 |
| CI | GitHub Actions |

**最佳实践**：
- ✅ 黑盒测试用真实 client SDK（不用裸 TCP）
- ✅ 每次 set/get/delete 验证响应字节
- ✅ 边界条件：noreply、TTL=0、超大 key、空 value
- ❌ 切勿 mock 整个 memcached 协议（集成测试才是真测试）
- ❌ 切勿只测 happy path（要测 set 后立即 delete）

### 18. memcached-tool 运维工具（Ops Tooling）

**问题场景**：缓存出问题时，SRE 需要快速诊断："哪个 slab class 占最多内存？""哪种 key size 浪费最多？""当前有多少 conn？"

**解决方案**：
```bash
# 查看 slab 占用
memcached-tool 127.0.0.1:11211 stats slabs

# 输出
#   Item Size  Max Size  Pages  Count   Full?
#     96 B       1 MB     100   5000  yes
#    120 B       1 MB     100   4000  yes
#    ...

# 实时监控仪表盘
damemtop 127.0.0.1:11211

# 重启
start-memcached restart
```

**关键参数**：

| 工具 | 用途 |
| --- | --- |
| `memcached-tool` | 静态 stats 查询 |
| `damemtop` | 实时监控仪表盘（curses） |
| `start-memcached` | init 脚本 |
| `slab_loadgen` | slab 压力测试 |

**最佳实践**：
- ✅ SRE 必须会 `memcached-tool stats slabs`（看内存碎片）
- ✅ 业务方在 `damemtop` 配 telegraf 抓指标
- ✅ CI 跑 `slab_loadgen` 验证分配器无碎片
- ❌ 切勿在线上直接 restart（重启会丢所有数据）
- ❌ 切勿忽略 slab class 满载警告（说明 LRU 在剧烈淘汰）

### 19. graceful restart 与连接迁移（Graceful Restart）

**问题场景**：缓存服务升级 / 配置变更需要重启；硬重启会丢所有缓存（DB 回源打爆）。需要优雅重启（drain 现有 conn + 接受新 conn 一段时间）。

**解决方案**：
```c
// restart.c
void graceful_restart() {
    // 1. 停止接受新连接
    event_del(&listen_event);
    
    // 2. 等待现有 conn 处理完
    sleep(DRAIN_TIMEOUT);
    
    // 3. fork 子进程启动新实例，共享端口
    if (fork() == 0) {
        exec(new_memcached_binary);
    }
    
    // 4. 老进程继续处理已建立 conn
    while (active_conns > 0) sleep(1);
    
    // 5. 老进程退出
    exit(0);
}
```

**关键参数**：

| 字段 | 推荐 | 说明 |
| --- | --- | --- |
| `DRAIN_TIMEOUT` | 30s | 等待现有 conn 处理完 |
| `SO_REUSEPORT` | 开 | 多进程 listen 同一端口 |
| `pidfile` | 必备 | 进程 PID 记录 |

**最佳实践**：
- ✅ 业务方升级 mc 走 graceful restart（drain + 接力）
- ✅ 用 SO_REUSEPORT 共享端口（避免新连接 race）
- ✅ L7 LB 配合（slow drain 期间 L7 切走新连接）
- ❌ 切勿硬 kill -9（in-flight conn 中断，DB 回源打爆）
- ❌ 切勿在 restart 时调 `-m` 改内存（会让 slab 重新分配）

### 20. SASL 认证与 TLS（Security）

**问题场景**：缓存集群跑在公网 / 共享网络，客户端连接需要认证 + 加密。memcached 支持 SASL 认证 + TLS 加密（1.6+）。

**解决方案**：
```bash
# 启用 SASL
memcached -S  # -S 表示启用 SASL
echo "mech_list: plain" > /etc/memcached/sasl.conf
saslpasswd2 -a memcached -c myuser

# 启用 TLS
memcached --enable-tls \
  -Z /etc/memcached/server.crt \
  --tls-key=/etc/memcached/server.key

# 客户端连接
echo "stats" | openssl s_client -connect mc:11212 -quiet
```

**关键参数**：

| 字段 | 含义 |
| --- | --- |
| `-S` | 启用 SASL |
| `--enable-tls` | 编译时开启 TLS 支持 |
| `-Z cert` | 服务端证书 |
| `--tls-key` | 服务端私钥 |
| `mech_list` | SASL 机制（PLAIN / SCRAM） |

**最佳实践**：
- ✅ 业务方在不可信网络（公网 / 共享 LAN）必须开 SASL + TLS
- ✅ SASL PLAIN 是默认（够安全如果用 TLS 包裹）
- ✅ 客户端用 `mcmc` 或 `libmemcached`（内置 SASL/TLS）
- ❌ 切勿在公网用无认证 mc（任何人都能 `flush_all`）
- ❌ 切勿 SASL 单独用（明文认证，攻击者能嗅探密码）

---

**标签**：#memcached #cache #c #distributed
**状态**：20/20 份详细内容
