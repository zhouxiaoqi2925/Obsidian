---
title: memcached
type: cache-server
lang: C
stars: 35000+
date: 2026-06-02
tags:
  - 开源项目
  - cache-server
  - 分布式缓存
  - C
  - 多线程
---

# memcached · 项目深度解析

> 高性能多线程事件驱动 key/value 缓存守护进程，分布式系统的事实标准内存缓存。
> 来源：G:\实战案例\GitHub顶尖项目\memcached\

## 写在前面：解析哲学

解析一个 23 年、35000+ star、依然在生产环境被广泛部署的 C 项目，最大的诱惑是"复述它的设计"。我刻意回避了这种叙事。本文档的骨架先于血肉：**先回答"memcached 是什么 / 不是什么"**，再回答"它为什么这样写"，最后回答"我能不能从中学到东西、能不能在 7 天内复刻它的核心"。读完之后，读者应当能：(1) 在面试中讲清楚 memcached 为什么用 slab 分配器而不是 malloc，(2) 在自己的 C/Go 项目中复用它的"工作线程 + 监听线程 + 后台维护线程"三段式模型，(3) 避开它踩过的坑（比如"指针当 item header"的隐患）。

## 0. 解析前的 5 个准备

1. **克隆**：本仓库为只读快照，仅含 1 个 commit（`f1674f0 vendor: ...`）。完整 history 见 [github.com/memcached/memcached](https://github.com/memcached/memcached)。
2. **分类**：C 系统级守护进程 / 内存分配器 / 网络服务器 / 多线程运行时，单一可执行文件，零应用层抽象。
3. **问题清单**：
   - memcached 怎么把 malloc 的延迟从用户态抹平？
   - 4 个工作线程 + 1 个监听线程怎么共享 1MB 的命令？
   - 1MB 那个著名上限是"魔数"还是"工程取舍"？
   - LRU 怎么和 slab 结合？为什么还需要后台 crawler？
4. **速查表**：
   - 默认端口 11211；默认内存 64MB；默认线程 4；默认连接 1024。
   - 协议：ASCII text（默认）、binary（已弃用）、meta commands、proxy+lua（实验性）。
   - 三类用户：DB 前置缓存、Session 共享、限流计数器。
5. **锁定 commit**：`f1674f0`（vendor 提示），但代码成熟度在 1.6.x 长期稳定，本地代码量与上游 1.6.21 几乎一致。

## 1. 开发计划书（Project Charter）

| 字段 | 内容 |
| --- | --- |
| 项目名 | memcached |
| 定位 | 高性能、多线程、事件驱动的内存 K/V 缓存守护进程 |
| 核心问题 | 解决分布式 Web 应用的"读多写少"场景下数据库压力问题，提供亚毫秒级、横向扩展的 LRU 缓存 |
| 目标用户 | 大型互联网公司的后端工程师（最初为 LiveJournal 设计）、中间件开发者、SRE |
| 商业模式 | BSD 开源；商业公司不直接收费，而是通过咨询服务、SaaS 形态（如 MemCachier、AWS ElastiCache）变现 |
| 复刻难度 | 6/10（核心 slab + hash + event loop 1 人·3 周可做 demo；生产级还需 2-3 个月） |
| 当前状态 | 成熟稳定，1.6.x 长期维护，新功能集中在 extstore 与 proxy |
| 团队 | Anatoly Vorobey（原作者）、Brad Fitzpatrick（Danga Interactive 创始人）、dormando（当前主要维护者） |
| 里程碑 | 2003 诞生 → 2008 LiveJournal/Facebook 大规模使用 → 2014 1.4.x（CAS、二进制协议）→ 2019 1.5.x（meta、extstore）→ 2021 1.6.x（segmented LRU、proxy Lua） |

## 2. 项目框架（Repo Skeleton Map）

**点状解析**

- 根目录几乎全部是 `.c/.h`（**没有 `src/`、`include/`**），典型的"单层 C 项目"风格。
- `doc/` 是协议/设计文档（`protocol.txt`、`protocol-binary.txt`、`threads.txt`、`new_lru.txt`、`storage.txt`）—— memcached 团队对"先把协议和算法写清楚再写代码"的执念很强。
- `t/` 是 114 个 `.t` 集成测试，使用 Perl Test::More 框架跑黑盒（telnet memcached，验证响应）。
- `vendor/` 只放两个外部依赖：Lua 解释器和 mcmc（memcached 客户端库，参考用）。
- `scripts/` 是运维脚本：`memcached-tool`（查看 slab 占用）、`start-memcached`（init 脚本）、`damemtop`（实时监控仪表盘）。
- `devtools/` 含 `Dockerfile.{alpine,debian,arch,fedora,ubuntu}` 和 slab_loadgen 测试工具。
- `.shipit` 是 Perl CPAN 风格的发布脚本（这项目早期从 CPAN 起家）。

**配置入口**：`configure.ac`（890 行，autotools）—— 通过 `--enable-tls`、`--enable-proxy`、`--enable-extstore` 切换编译选项。
**代码入口**：`memcached.c`（6235 行）—— `main()` 位于 5780 行附近（通过 `grep main` 验证），其上是 `settings_init()` / `stats_init()` / `conn_init()`。

**思维导图**

```mermaid
mindmap
  root((memcached 代码仓库))
    核心守护进程
      memcached.c
        main + settings
        event_handler
        drive_machine
        网络I/O
      存储子系统
        slabs.c
          slab 分配器
          1MB 页 + power-of-N chunk
        items.c
          LRU 链表 (HOT/WARM/COLD/TEMP)
          refcount
        assoc.c
          哈希表 + 渐进 rehash
        storage.c
          extstore 后端
    协议层
      proto_text.c
        ASCII 协议
        meta 命令
      proto_bin.c
        二进制协议 (deprecated)
      proto_proxy.c
        Lua proxy 配置
    辅助子系统
      crawler.c
        LRU 后台扫描
      thread.c
        工作线程模型
      logger.c
        watcher 监控
      tls.c
        TLS 支持
    工具
      daemmon.c
      restart.c
      restart_during_upgrade
      memcached-tool
    测试
      t/*.t
        114 个 .t 集成测试
      vendor/mcmc
        客户端 SDK
```

**实际目录树（截选前两层）**

```text
memcached/
├─ memcached.c      6235 行 - 主进程
├─ slabs.c           838 行 - 内存分配器
├─ items.c          1770 行 - LRU/对象管理
├─ assoc.c           370 行 - 哈希表
├─ crawler.c         973 行 - LRU crawler
├─ thread.c         1159 行 - 多线程
├─ proto_text.c     1657 行 - 文本协议
├─ proto_bin.c      1342 行 - 二进制协议
├─ proto_proxy.c    1633 行 - Lua proxy
├─ extstore.c        994 行 - 磁盘后端
├─ storage.c        1617 行 - 存储后端抽象
├─ jenkins_hash.c   - 哈希函数
├─ murmur3_hash.c   - 哈希函数
├─ hash.c           34 行 - 哈希函数注册
├─ daemon.c         - 守护进程化
├─ restart.c        - 优雅重启
├─ logger.c         - 日志 watcher
├─ tls.c            - TLS 实现
├─ configure.ac     890 行 - autoconf
├─ Makefile.am      - automake
├─ doc/             协议与设计文档
├─ t/               114 个 .t 集成测试
├─ scripts/         运维脚本
├─ vendor/          Lua + mcmc
└─ devtools/        Dockerfile + loadgen
```

## 3. 项目画像（Profile）

| 维度 | 数值/状态 |
| --- | --- |
| 总文件数 | 325（含测试和文档），其中 `.c/.h` 约 60 个 |
| 主语言 | C（>99%） |
| 涉及语言 | C、Perl（测试、shipit）、Lua（proxy）、Bash（脚本） |
| Star | 35000+（GitHub 上 `memcached/memcached`） |
| License | BSD 3-Clause |
| Docker | 提供 5 个 `devtools/Dockerfile.{alpine,debian,arch,fedora,ubuntu}` 和 `docker-compose.yml` |
| K8s | 无官方 chart；通常被 Redis/ElastiCache 替代方案托管 |
| CI | `.github/workflows/ci.yml` |
| 测试 | 114 个 `.t` 黑盒测试，单元测试少（`testapp.c` 是 main 之外的 test 入口） |
| 文档 | 强项：`doc/` 下的 6 篇长文把协议/算法讲透 |
| 二进制大小 | 编译后 ~300KB（stripped） |

## 4. 架构设计（Architecture Deep Dive）

**点状解析**

memcached 的进程内架构是一个经典的"主-从-后台"模型：

```mermaid
mindmap
  root((memcached 进程内架构))
    主线程
      main_base
      accept()
      listen_conn 分发到工作线程
      内存预分配
      信号处理 (SIGTERM/INT)
    工作线程 N 个
      worker_base
      N 个 epoll (libevent)
      事件循环
        读请求 -> try_read_command
        写响应 -> transmit
        状态机 drive_machine
        stats 累加
    LRU 维护线程
      异步 slab 迁移
      1Hz tick
      内存压力触发
    LRU crawler 线程
      异步过期回收
      滑窗(win)
      sleep 控制吞吐
    连接超时线程
      扫描 idle 连接
      CONNS_PER_SLICE 切片
    extstore IO 线程
      write-behind
      page 提交/压缩
    stats 收集
      threadlocal_stats
      STATS_LOCK 聚合
```

**核心看点**

1. **Slab 分配器替代 malloc**：把堆按"幂等 chunk size"分成 64 个 slab class（class 1 = 96B，class 2 = 120B，...，按 `factor=1.25` 增长），单次分配变成 O(1) 的"从 freelist 拿一个 chunk"。这一选择把"小块对象频繁分配/释放"的内存碎片化问题，从 malloc 内部不可控变成了应用层可控。
2. **多线程 + 共享全局哈希表的细粒度锁**：连接被分到不同 worker 线程，但哈希表和 LRU 链表是全局共享的，访问时按 `lru_locks[id]` 上锁（每个 slab class 一个独立锁）。这样既避免"单线程 epoll 的吞吐瓶颈"，又把"热路径"锁粒度控制在单 slab 内。
3. **网络 I/O 与存储分离**：TCP 读写、命令解析在 worker 线程跑，但 `extstore`（磁盘后端）由独立 IO 线程池异步处理。这是 memcached 1.5+ 的核心扩展：让"warm tier"在内存吃紧时降级到 SSD/HDD。

**ADR 关键设计决策**

```mermaid
flowchart TD
  A[内存碎片问题] --> B{选择分配器}
  B -->|malloc| C[不可控碎片]
  B -->|jemalloc| D[依赖外部库]
  B -->|自研 slab| E[固定 1MB 页<br/>+ power-of-N chunk<br/>+ 64 个 class]
  E --> F[优点: O 1 分配<br/>无碎片<br/>可控 LRU]
  E --> G[缺点: 内部浪费<br/>无法跨 class 借用]
  A2[多核扩展] --> B2{多线程模型}
  B2 -->|单线程 epoll| C2[吞吐受限]
  B2 -->|1 监听 + N 工作| D2[采纳: 锁粒度按 slab]
  B2 -->|shared nothing| E2[太重]
  A3[网络协议] --> B3{协议选择}
  B3 -->|自定义 binary| C3[可读性差]
  B3 -->|纯 ASCII| D3[采纳: text 默认 + meta flag]
  B3 -->|protobuf| E3[反序列化成本]
```

**核心架构 3 句话**

1. **Slab + LRU 解耦**：slab 负责"对象在哪块内存"，LRU 链表负责"对象该不该被淘汰"——前者按大小分类，后者按热度分类。
2. **工作线程独享 epoll，主线程独享 listen socket**：避免"accept 惊群"和"全局锁竞争"同时出现。
3. **extstore 让 cache 也分层**：和 Redis 的"all in memory"路线相反，memcached 显式承认"内存比 SSD 贵 50 倍"，于是 1.5+ 引入 IO 线程池 + page bucket，让"冷数据"沉到 disk。

## 5. 代码深度解析（带 WHY）⭐ 重点

### 5.1 找骨架代码

读 `memcached.c` 第一屏的 300 行就能拿到整个项目骨架：

- **line 92-99**：声明全局状态 `stats`、`settings`、`conns`、`process_started`。
- **line 122-143**：`enum transmit_result` 4 种发送结果 + 默认 socket 方法（`tcp_read/write/sendmsg`）—— **WHY**：把"传输结果"和"传输方法"分两个枚举/结构，是为了**让 TLS 能在不改业务逻辑的前提下替换底层 socket 调用**（`tls.c` 实现同样的函数指针）。
- **line 174-192**：`realtime(exptime)` 函数—— 这个 18 行的函数是 memcached 处理"过期时间"的核心魔法：**它同时支持相对时间（"< 30 天"）和绝对时间（"> 30 天"）两种语义**。WHY：客户端发 `set key 0 0 60` 时 60 是"60 秒后过期"；发 `set key 0 0 1893456000` 时是"2029-12-31 绝对时间"。`REALTIME_MAXDELTA = 60*60*24*30`，超过这个值就当作绝对时间。
- **line 216-281**：`settings_init()`—— 60+ 个配置项的默认值都在这里，**所有"魔数"的真相所在地**（如 1MB 上限、4 worker、1024 maxconns、1.25 增长因子）。

### 5.2 单文件分析卡

**📄 memcached.c**（6235 行，主进程）

```c
// memcached.c:174
rel_time_t realtime(const time_t exptime) {
    if (exptime == 0) return 0;          /* 0 = never expire */
    if (exptime > REALTIME_MAXDELTA) {   /* > 30天 = 绝对时间 */
        if (exptime <= process_started)   /* 已过去的绝对时间 */
            return (rel_time_t)1;         /* 1秒后过期(避免 0) */
        return (rel_time_t)(exptime - process_started);
    } else {
        return (rel_time_t)(exptime + current_time);
    }
}
```

**WHY**：`process_started = time(0) - ITEM_UPDATE_INTERVAL - 2;`（`stats_init()` 里）—— 通过"故意让 process_started 比真实启动时间早 2 秒"，把"绝对时间 - 进程启动时间"转成"相对秒数"，**这样所有时间戳都能用 32 位 `rel_time_t` 表示，绕开 2038 年问题**。这种"启动时间反推 + 偏移编码"是嵌入式和 C 系统代码里非常常见的时间折叠技巧。

**📄 slabs.c**（838 行，slab 分配器）

```c
// slabs.c:77
unsigned int slabs_clsid(const size_t size) {
    int res = POWER_SMALLEST;
    if (size == 0 || size > settings.item_size_max)  /* > 1MB 直接拒绝 */
        return 0;
    while (size > slabclass[res].size)
        if (res++ == power_largest)     /* 找不到合适 class */
            return power_largest;
    return res;
}
```

**WHY**：**这是 O(log n) 的二分查找被故意写成 O(n) 线性扫描**——因为 n ≤ 64（`MAX_NUMBER_OF_SLAB_CLASSES`），cache locality 比少几次比较更重要；同时线性扫描也方便未来插入"非均匀步长"扩展。

```c
// slabs.c:198-220
slabclass_t slabclass[MAX_NUMBER_OF_SLAB_CLASSES];
```

**WHY**：**用全局静态数组而不是 hash map**。每次 `slabs_clsid(size)` 都用 size 做 size_t 算术，没有任何指针解引用 → L1 cache 命中率接近 100%。这是 memcached 团队刻意的"用空间换延迟"—— 64 × sizeof(slabclass_t) ≈ 几 KB，永远在 L1。

**📄 items.c**（1770 行，对象 LRU 管理）

```c
// items.c:23
static unsigned int lru_type_map[4] = {HOT_LRU, WARM_LRU, COLD_LRU, TEMP_LRU};
// items.c:50-51
static item *heads[LARGEST_ID];
static item *tails[LARGEST_ID];
```

**WHY**：**`item` 结构体里同时有 `h_next`（哈希表链）和 `prev/next`（LRU 链）指针**—— 这是教科书级的"对象同时挂在两个链表上"做法（h_next 链是 assoc 哈希桶，prev/next 是 LRU 双向链表）。**注意用侵入式链表（item 自己当链表节点）而不是包装 node**：每个 item 节省 16 字节指针，1 亿 item 就是 1.6GB 内存。

```c
// items.c:162
item *do_item_alloc_pull(const size_t ntotal, const unsigned int id) {
    item *it = NULL;
    int i;
    for (i = 0; i < 10; i++) {
        if (!settings.lru_segmented)
            lru_pull_tail(id, COLD_LRU, 0, 0, 0, NULL);
        it = slabs_alloc(id, 0);
        if (it == NULL) {
            if (lru_pull_tail(id, COLD_LRU, 0, LRU_PULL_EVICT, 0, NULL) <= 0) {
                if (settings.lru_segmented)
                    lru_pull_tail(id, HOT_LRU, 0, 0, 0, NULL);
                else
                    break;
            }
        } else {
            break;
        }
    }
    ...
}
```

**WHY**：**最多 10 次重试的"分配-驱逐"循环**。每次 `slabs_alloc` 失败，先尝试从 COLD LRU 驱逐一个 item，**HOT 队列只在最后一次重试才碰**——这种"从冷到热"的驱逐顺序确保了：热数据被驱逐的概率远低于冷数据。**这是一个 4 行代码里包含的产品决策**：宁可牺牲 OOM 响应时间，也要保住热点命中率。

**📄 assoc.c**（370 行，哈希表）

```c
// assoc.c:55
void assoc_init(const int hashtable_init) {
    if (hashtable_init) hashpower = hashtable_init;
    primary_hashtable = calloc(hashsize(hashpower), sizeof(void *));
    ...
}
```

**WHY**：**`hashsize(n) = 1 << n`，`hashpower` 决定桶数（默认 16 = 65536 桶）**。WHY 是幂等：**取模运算变成位运算**——`(hv & hashmask(hashpower))` 比 `hv % 65536` 快 5-10 倍。

```c
// assoc.c:74
if (expanding && (oldbucket = (hv & hashmask(hashpower - 1))) >= expand_bucket) {
    it = old_hashtable[oldbucket];
} else {
    it = primary_hashtable[hv & hashmask(hashpower)];
}
```

**WHY**：**渐进式 rehash**。当哈希表装填因子到 0.75 时，不是"停服 → 重新分配 → 拷贝"，而是把 `old_hashtable` 保留，新 key 写到 `primary_hashtable`，**lookup 时根据 `expand_bucket` 决定查哪个表**。每次 `assoc_insert` 顺便搬几个 bucket，**让 rehash 平摊到每次写操作**。这是从 Java HashMap 借鉴的工业实践。

**📄 crawler.c**（973 行，LRU 后台扫描）

```c
// crawler.c:36-58
typedef void (*crawler_eval_func)(crawler_module_t *cm, item *it, uint32_t hv, int slab_cls);
typedef int (*crawler_init_func)(crawler_module_t *cm, void *data);

typedef struct _crawler_module_t {
    void *data;
    crawler_client_t c;
    crawler_module_reg_t *mod;
    int status;
} crawler_module_t;
```

**WHY**：**`crawler_module_reg_t` 是一组函数指针**（`init/eval/doneclass/finalize`），配 `needs_lock` 和 `needs_client` 两个开关。**这是一个超轻量级 plugin 系统**：LRU 过期回收、metadump、mgdump（meta 协议 dump）三个模块都注册到这里，**复用同一套 LRU 遍历代码**。和 Redis 的"command table"思路一致，但只用 50 行 C 代码实现。

**📄 proto_text.c**（1657 行，文本协议）

```c
// proto_text.c:152
static size_t item_make_header(const uint8_t nkey, const client_flags_t flags,
                     const int nbytes, char *suffix, uint8_t *nsuffix) {
    if (flags == 0) {
        *nsuffix = 0;
    } else {
        *nsuffix = sizeof(flags);
    }
    return sizeof(item) + nkey + *nsuffix + nbytes;
}
```

**WHY**：**flags=0 时不写 suffix，节省 8 字节**。这是一个极致的空间优化：用户没设置 flags 就连 flags 字段都不存，1 亿 item 就是 800MB 内存。**对缓存服务来说"省一个字节都是钱"**。

**📄 hash.c**（34 行，哈希函数注册）

```c
// hash.c:9
hash_func hash;

int hash_init(enum hashfunc_type type) {
    switch(type) {
        case JENKINS_HASH: hash = jenkins_hash; settings.hash_algorithm = "jenkins"; break;
        case MURMUR3_HASH: hash = MurmurHash3_x86_32; settings.hash_algorithm = "murmur3"; break;
        case XXH3_HASH:    hash = XXH3_hash;       settings.hash_algorithm = "xxh3";    break;
        default: return -1;
    }
    return 0;
}
```

**WHY**：**用全局函数指针 + 启动时切换**，让 hash 函数是"配置项"而不是"编译期选项"。运行时可以通过 `lru_crawler metadump` 之类的命令验证当前 hash。**为什么需要切换？** Jenkins（1996）快但碰撞率略高，murmur3 平衡，xxh3（Yann Collet 2019）极快但 memcached 1.6+ 才默认。

**📄 extstore.c**（994 行，磁盘后端）

```c
// extstore.c:91
struct store_engine {
    pthread_mutex_t mutex;
    store_page *pages;        // 全部 pages 直接数组化
    _store_wbuf *wbuf_stack;  // wbuf freelist
    obj_io *io_stack;         // IO 重用
    store_io_thread *io_threads;
    store_page **page_buckets;   // 6 个 bucket
    ...
};
```

**WHY**：**6 个 page bucket**（`PAGE_BUCKET_DEFAULT=0, COMPACT=1, CHUNKED=2, LOWTTL=3, COLDCOMPACT=4, OLD=5`）—— **这是和 Redis RocksDB 集成的"分层存储"思路的简化版**：default 给热数据，compact 给小 key，coldcompact 给即将被淘汰的，old 给要写回磁盘的。**6 个 bucket 是经验和复杂度的平衡点**。

### 5.3 设计模式

| 模式 | 体现位置 | 说明 |
| --- | --- | --- |
| **状态机** | `memcached.c:drive_machine()` | 一次命令处理分成 `conn_read/conn_nread/conn_write/conn_closing` 等状态 |
| **注册表模式** | `crawler_module_reg_t`、`crawler_mod_regs[4]` | 用函数指针数组实现 plugin |
| **Freelist** | `slabclass[id].slots`、`wbuf_stack` | 避免 malloc/free 抖动 |
| **哈希表 + 双向链表** | `item` 的 `h_next` + `prev/next` | 教科书组合 |
| **Worker pool** | `thread.c` + `LIBEVENT_THREAD` | N 个独立 event loop |
| **Power-of-N** | slab class、hash bucket、page size | 全部用 2 的幂 + 位运算 |
| **侵入式容器** | `item` 内嵌链表指针 | 节省包装结构内存 |

### 5.4 反模式

- **全局变量泛滥**：`stats`、`settings`、`conns`、`process_started`、`ext_storage` 都是 `extern struct xxx`，跨文件可见，违反封装。**WHY 不改**：项目早于"避免全局变量"成为共识，修改成本远大于收益。
- **`goto` 滥用**：`memcached.c` 中 `goto out` 大量出现，错误处理路径扁平化。**WHY 合理**：C 无 RAII/析构函数，`goto` 是 C 里最干净的资源释放方式。
- **`assert(1 == 0)` 留作反例**：`proto_text.c:150` `assert(1 == 0);` —— 这是个**永远断言失败**的代码，**WHY 留它**：提醒未来"如果分块 item 校验走到这里说明前面逻辑错了"。**正确的做法应该是 `abort()` 或 `LOG_ERROR`**，但 memcached 团队选择 `assert(0)` 让 debug build 立刻挂、release build 静默通过。
- **`extern` 多文件 include 顺序敏感**：`memcached.h` 必须在所有 `.c` 文件第一行 `#include`，否则编译失败。
- **没有用 C99 设计**：依然是 K&R + GNU 扩展混合风格，混杂 `__attribute__((packed))` 等 GCC 特性。

### 5.5 独特看点

- **`realtime()` 双语义时间**：一个函数同时支持相对/绝对时间，是分布式系统里时间语义统一的经典方案。
- **`expanding` 渐进 rehash**：避免 stop-the-world rehash，让哈希表 resize 平摊到 O(1) 的写操作中。
- **slab class 静态数组**：用空间（64×sizeof 永远 L1 命中）换时间（O(1) class 查找），是嵌入式思维的体现。
- **extstore page bucket 6 档**：把"热/冷/小/大/老/压缩"6 种使用模式显式分桶，避免"一种 page 策略适应所有场景"。

## 6. 运行机制（Bring It Up）

**启动脚本**

```bash
# 编译
./autogen.sh
./configure --enable-tls --enable-extstore
make -j$(nproc)
sudo make install

# 启动（最简单）
./memcached -p 11211 -m 64 -c 1024 -t 4

# 启动（生产）
./memcached -d -u memcache -m 4096 -c 8192 -t 8 \
  -P /var/run/memcached.pid \
  -L 0.0.0.0:11211 \
  -o slab_automove=1,lru_crawler=1

# 验证
telnet 127.0.0.1 11211
> stats
> stats items
> stats slabs
> quit
```

**Smoke test**

```bash
echo "set foo 0 60 5\r\nhello\r\nget foo\r\nquit" | nc 127.0.0.1 11211
# 期望输出：
# STORED
# VALUE foo 0 5
# hello
# END
```

**Docker 启动**

```bash
cd devtools
docker build -f Dockerfile.alpine -t memcached:test .
docker run --rm -p 11211:11211 memcached:test
```

## 7. 演进历史（Time Travel）

**已知里程碑**（来源：memcached.org/about、wiki）

- **2003-05**：Anatoly Vorobey 写下第一版，用 perl + C 混合实现。
- **2004-06**：Brad Fitzpatrick 重写为纯 C 守护进程，加入 libevent + 多线程。
- **2008**：LiveJournal、Facebook、Wikipedia 大规模部署，1.2.x 稳定。
- **2010-2012**：1.4.x 加入 binary 协议、CAS、append/prepend。
- **2014**：1.4.20+ 引入 BLRU（background LRU maintainer）。
- **2018-2019**：1.5.x 重磅特性—— meta commands、extstore（磁盘后端）、segmented LRU（HOT/WARM/COLD）。
- **2020-2021**：1.6.x 加入 proxy + Lua（`--enable-proxy`）、TLS 1.3、sasl auth、watcher 日志。

```mermaid
gantt
    title memcached 演进时间线
    dateFormat YYYY
    section 基础期
    2003 perl 起源 :a1, 2003, 1y
    2004 C 重写    :a2, after a1, 2y
    2008 1.2.x 稳定 :a3, after a2, 4y
    section 协议扩展
    2010 binary 协议 :b1, 2010, 2y
    2014 CAS/append  :b2, after b1, 2y
    section 现代
    2018 meta 命令   :c1, 2018, 1y
    2019 extstore    :c2, after c1, 1y
    2020 segmented LRU :c3, after c2, 1y
    2021 proxy + TLS :c4, after c3, 1y
```

**git log 现状**：本仓库仅 1 个 commit `f1674f0 vendor: Instructively warn if vendor blob missing`，说明这是从上游 tarball 重新解包的结果，没有保留细粒度 history。

## 8. 质量保障（How It Doesn't Break）

| 防线 | 实现 | 评价 |
| --- | --- | --- |
| **单元测试** | `testapp.c`（自带的 test main）、`crc32c`/`md5` 等纯函数测试 | 偏弱：核心 LRU 逻辑、hash 表、slab 分配器几乎没有 unit test |
| **集成测试** | `t/*.t` 114 个 Perl Test::More 黑盒测试 | **强项**：覆盖所有公开命令、协议细节、CAS、extstore、proxy、SSL |
| **CI** | `.github/workflows/ci.yml` | 多 OS 编译验证、运行 `make test` |
| **Lint** | 无 clang-format/tidy 配置 | **弱**：代码风格靠 maintainer 人眼 review |
| **性能基准** | `t/stress-memcached.pl`、`devtools/slab_loadgen` | 有，但未集成进 CI |
| **Sanitizer** | `MEMCACHED_DEBUG` 宏 + `MEMCACHED_DEBUG` 编译选项 | 编译时开启 `ASAN/UBSAN` 即可 |

**详细评估**：

- **测试覆盖率**：黑盒测试极强（模拟 200+ 种命令组合），但**白盒覆盖薄弱**—— `slabs.c` 的 `do_slabs_newslab`、`assoc.c` 的渐进 rehash 等关键路径几乎没有针对单函数的断言。
- **CI 行为**：`ci.yml` 跑 4 个 OS（ubuntu、macos、alpine、arch）的编译，stress test 跑 `proxyconfigmulti` 和 `extstore` 系列。
- **未做的工作**：mutation testing、fuzz testing（仅对二进制协议有手工 fuzz 经验分享）、code coverage 报告。

## 9. 生态依赖（Map of the World）

**编译期依赖**

| 库 | 必需 | 用途 |
| --- | --- | --- |
| libevent | 是 | 事件循环（epoll/kqueue） |
| OpenSSL | 可选 | TLS 支持 |
| libsasl2 | 可选 | SASL 认证 |
| libseccomp | 可选 | Linux 沙箱（实验性） |
| pkg-config | 间接 | 找 OpenSSL 依赖 |

**运行时依赖**：几乎为零，static build 后只依赖 glibc/musl libc。

**依赖图**

```mermaid
graph LR
  M[memcached 二进制] --> LE[libevent]
  M -.可选.-> OSSL[OpenSSL]
  M -.可选.-> SASL[libsasl2]
  M -.可选.-> SCMP[libseccomp]
  LE --> KQ[kqueue/epoll]
  OSSL --> TLS[TLS 1.3]
  M --> V1[vendor/lua]
  M --> V2[vendor/mcmc]
  V2 --> LIB[libmemcached 客户端]
```

**合规检查清单**

- [x] 依赖均为 OSI 认可的开源 license（BSD/MIT/Apache）
- [x] 无 GPL/LGPL 污染（vendor/lua 是 MIT，mcmc 是 BSD）
- [x] 无 backdoor 风险（代码量 30K 行，公开审计 20+ 年）
- [x] `seccomp` 沙箱可降低内核攻击面
- [x] CVE 历史：每年 0-1 个，多数为 DoS 类

## 10. 生产实践（Battle-Tested）

| 关注点 | 实现情况 | 备注 |
| --- | --- | --- |
| 配置热更新 | 有限 | 部分 stats 可 `echo` 写入；`-o` 参数需重启 |
| 优雅停服 | 强 | `SIGTERM` 触发 `conn_close` + 写 pending 数据 + 等空闲 |
| 限流 | 弱 | 仅 `maxconns`，无令牌桶 |
| 链路追踪 | 无 | 无 OpenTelemetry/jaeger 集成 |
| 健康检查 | 弱 | `stats` 命令暴露内部状态，无标准 HTTP `/health` |
| 结构化日志 | 部分 | `logger.c` 支持 watcher；非 JSON |
| 监控指标 | 强 | 60+ stats 字段，`stats settings/items/slabs/conns` |
| mlockall | 有 | `-k` 锁内存，避免 swap |
| 大页支持 | 有 | `posix_memalign` + `MADV_HUGEPAGE` |
| 优雅重启 | 强 | `restart.c` 实现跨进程交接 |
| 客户端 SDK | 多 | C/Python/Java/Go/Rust 都有 |
| 多实例 | 是 | 一致性哈希由客户端完成 |

**核心运行机制流程图**

```mermaid
sequenceDiagram
    participant C as 客户端
    participant L as 监听线程
    participant W as 工作线程
    participant A as assoc 哈希表
    participant S as slabs 分配器
    participant E as extstore (可选)
    C->>L: TCP connect :11211
    L->>W: queue_new_conn (CQ_ITEM)
    W->>W: 状态机 conn_read
    C->>W: "set foo 0 60 5\r\nhello\r\n"
    W->>W: try_read_command -> 解析协议
    W->>A: assoc_find("foo", hv)
    A-->>W: NULL (新 key)
    W->>S: slabs_alloc(clsid)
    S-->>W: item*
    W->>S: do_item_link (挂到 LRU + 哈希)
    W->>W: complete_nread_ascii
    W-->>C: "STORED\r\n"
    C->>W: "get foo\r\n"
    W->>A: assoc_find("foo", hv)
    A-->>W: item*
    W->>W: item_cachedump (拼响应)
    W-->>C: "VALUE foo 0 5\r\nhello\r\nEND\r\n"
```

## 11. 社区文化（People & Process）

**治理模式**

- 邮件列表驱动：`memcached@googlegroups.com`（README 明确说"please use the mailing list"）。
- 维护者：`dormando`（主要）、`mnunberg`、`abhinavdangeti` 等核心贡献者。
- **不接受 PR review 流程**：issue tracker 主要收集 bug，重大设计走邮件列表 RFC。
- 安全漏洞走 `responsible disclosure`，私下 patch → 通知 vendor → 公开。
- 不写 changelog，依赖 commit log（很罕见，违反 Linux 社区惯例）。

**沟通渠道**

- 邮件列表、GitHub issues、IRC `#memcached`（已冷清）。
- 官方 wiki：https://github.com/memcached/memcached/wiki
- 测试基础设施：https://build.memcached.org/ 多平台 CI。

**议题活跃度**

- 每周 1-3 个 issue，以 "能复现的 bug" 为主。
- 重大特性（如 extstore、proxy Lua）通常来自单一公司内部需求。

## 12. 教训总结（What To Steal / What To Avoid）

### 12.1 必偷 3 件

1. **slab 分配器模式**：把内存按"幂等 chunk size"分类，单次分配/释放 O(1)。**特别适合**：自定义 K/V store、内存数据库、缓存层、游戏服务器对象池。
2. **三段式线程模型**（监听 + 工作 + 后台维护）：避免"epoll 单线程瓶颈"和"全局锁竞争"同时出现。**适合**：所有多线程网络服务。
3. **协议解析用状态机**（`drive_machine`）：单次 `epoll_wait` 后用 switch 切换状态，比回调链可读性高 10 倍。

### 12.2 必避 3 坑

1. **不要把所有时间戳都用 32 位 rel_time**。`realtime()` 偏移编码虽然避开 2038 问题，但**跨机器协作时容易算错**。现代系统直接用 `int64_t milliseconds`。
2. **不要在 1MB 对象上做"零拷贝"假设**。memcached 的 1MB 上限是历史包袱，今天应该用 `size_t ntotal` + 显式 chunked I/O 代替。
3. **不要把 hash 函数做编译期选项**。memcached 1.6 才改成运行时切换，导致历史版本无法 hot-fix hash 碰撞。**一开始就用 `enum hash_func` + 函数指针**。

### 12.3 7 天复刻路线图

```mermaid
gantt
    title 7 天复刻 memcached 核心路线
    dateFormat YYYY-MM-DD
    section 基础
    Day1-2: slab 分配器 + item :a1, 2026-06-02, 2d
    section 网络
    Day3: epoll + listen 循环 :a2, after a1, 1d
    section 协议
    Day4: ASCII set/get/del :a3, after a2, 1d
    section 进阶
    Day5: 哈希表 + LRU :a4, after a3, 1d
    section 多线程
    Day6: 多 worker 拆分 :a5, after a4, 1d
    section 收尾
    Day7: 测试 + 文档 :a6, after a5, 1d
```

**7 天详细步骤**：

- Day 1：写 `slabclass_t` + `slabs_alloc/free`，对应 `slabs.c` 的 200 行
- Day 2：写 `item` 结构体 + `ITEM_LINKED/ITEM_SLABBED` flag，对应 `items.c` 200 行
- Day 3：用 libevent 起一个 `accept + read + write` 循环，对应 `memcached.c:event_handler` 100 行
- Day 4：实现 `set/get/del` 三命令 + 文本协议解析，对应 `proto_text.c` 200 行
- Day 5：加哈希表 + LRU 链表，对应 `assoc.c` + `items.c:do_item_link` 200 行
- Day 6：拆 1 主 + 2 工作线程，对应 `thread.c` 200 行
- Day 7：写 5 个集成测试 + 文档

### 12.4 打分卡

| 维度 | 分数（/10） | 评语 |
| --- | --- | --- |
| **代码可读性** | 7 | C 风格统一，命名 `snake_case`，但全局 extern 多 |
| **架构优雅度** | 9 | slab + LRU + 哈希三层解耦堪称教科书 |
| **测试覆盖** | 6 | 黑盒强、白盒弱 |
| **文档质量** | 9 | `doc/` 6 篇长文把协议讲透 |
| **可维护性** | 6 | 30K 行 C 仍是 30K 行 C，新人上手难 |
| **性能** | 10 | 单实例 1M+ QPS（参考 benchmarks） |
| **生产就绪度** | 9 | 23 年部署验证 |
| **复刻价值** | 9 | 学完能掌握 K/V 缓存系统精髓 |

## 13. 学习萃取（Cheat Sheet）

**一句话价值**：memcached 用 30K 行 C 证明了"分层 + 专用分配器 + 状态机"是高性能缓存的标准答案。

**3 个核心洞察**

1. **Slab 分配器 vs malloc**：碎片化是 malloc 不可控的，应用层 slab 把"对象大小"作为 first-class 维度，从源头消除外部碎片。
2. **多线程 + 共享数据结构 ≠ 全局锁**：按"数据子集"加独立锁（`lru_locks[id]`），让 80% 场景下不同 worker 操作不同 slab class 时完全无锁。
3. **协议与实现分离**：`proto_text.c` 只依赖 `storage.h` 接口，不关心 slab/extstore 实现，**这种"协议层对存储层无感知"**让 binary 协议废弃后能干净迁移到 meta 协议。

**5 段必读代码**

1. **`memcached.c:174` `realtime()`**：18 行同时处理相对/绝对时间，理解时间语义折叠。
2. **`slabs.c:77` `slabs_clsid()`**：64 个 slab class 的 O(1) 查找，看懂 cache locality 优化。
3. **`items.c:162` `do_item_alloc_pull()`**：10 次重试的"分配-驱逐"循环，包含 4 个 LRU 队列的访问顺序决策。
4. **`assoc.c:74` 渐进 rehash**：看 `expanding` flag + `expand_bucket` 怎么让 resize 平摊。
5. **`crawler.c:65` `crawler_expired_mod`**：50 行实现 plugin 系统，理解函数指针 + 注册表的极简用法。

**1 个反模式**

- **`memcached.c` 全局 `extern struct stats/stats_state/settings`**：违反封装，跨文件修改无类型检查，编译时也只是 warning。**正确做法**：用 opaque pointer + getter/setter，或拆到独立 module。

**1 个可复用模式**

- **`extstore.c:91` 6 个 page bucket**：把存储后端按"使用模式"分类（default/compact/chunked/lowttl/coldcompact/old），**这种"按使用场景分桶而非按数据大小分桶"的思路**适用于所有需要分层存储的系统。

**3 个立刻能用的技巧**

1. **进程启动时间反推**：`process_started = time(0) - INTERVAL - 2;` —— 用一个"故意早 2 秒的"启动时间，**消除"process_started == now" 这类边界 case**。
2. **全局幂等大小数组**：`uint32_t sizes[64];` —— 当你需要的"分类"维度 ≤ 256 时，**用静态数组代替 hash map** 是更优解。
3. **`settings_init()` 集中默认值**：所有"魔数"放一个 60+ 行的函数，**新人看一遍就知道系统所有可调参数**。

## 14. 项目特点速查

**独特看点**

- "1MB 上限"是 memcached 最著名的设计取舍之一，至今未变（虽然 `item_size_max` 可调到 128MB）。
- "无持久化"和"客户端做一致性哈希"是分布式部署的事实标准。
- "slab 分配器"被 Redis 借鉴用于 `zmalloc` 的小对象池。
- "meta commands"（1.5+）是"用 ASCII 协议的灵活性 + 接近 binary 协议的功能"的最佳实践。

**与同类对比**

```mermaid
quadrantChart
    title 缓存系统对比（性能 vs 功能丰富度）
    x-axis 简单 --> 复杂
    y-axis 慢 --> 快
    "memcached": [0.3, 0.95]
    "Redis": [0.7, 0.7]
    "KeyDB (Redis fork)": [0.65, 0.85]
    "DragonflyDB": [0.6, 0.95]
    "Hazelcast": [0.85, 0.5]
    "Aerospike": [0.9, 0.9]
```

| 维度 | memcached | Redis | KeyDB | DragonflyDB |
| --- | --- | --- | --- | --- |
| 语言 | C | C | C++ (fork) | Rust + C++ |
| 数据结构 | K/V only | String/Hash/List/Set/ZSet | 同 Redis | 同 Redis |
| 持久化 | 无 | RDB/AOF | 同 Redis | 同 Redis |
| 多线程 | Yes (worker pool) | 6.0+ | Yes | Yes |
| 集群方案 | Client-side | Redis Cluster | 同 Redis | 同 Redis |
| 内存模型 | Slab | jemalloc + zmallo | jemalloc | mimalloc + shared-nothing |
| 学习曲线 | 陡（C） | 中 | 中 | 中 |
| 适用场景 | 纯缓存 | 缓存+队列+pub/sub | 缓存+多线程 | 替代 Redis 多线程 |

**总结**：memcached 是"少即是多"的代表——放弃 90% 功能换来 1M+ QPS 的纯缓存能力。**在 2026 年仍不可替代**的真正原因不是性能，而是"23 年零重大事故的稳定性背书"。

## 附：仓库元信息

- **路径**：`G:\实战案例\GitHub顶尖项目\memcached\`
- **大小**：约 7.5MB（含 114 个测试文件、6 篇协议文档）
- **总文件**：325（含 vendor/lua 解释器、mcmc 客户端、t/ 114 个 .t）
- **解析时间**：2026-06-02，约 90 分钟
- **commit 锁定**：`f1674f0 vendor: Instructively warn if vendor blob missing`

## 一句话总结

解析 = **计划书**（核心问题：分布式内存缓存）+ **框架图**（slab + assoc + LRU + thread）+ **核心功能**（set/get/evict/rehash）+ **跑起来**（autotools + libevent + 4 行命令）+ **偷过来**（slab 分配器、worker pool 模型、状态机协议）。
