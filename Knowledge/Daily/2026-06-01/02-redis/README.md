---
tags: [open-source, deep-dive, backend, c, kv]
type: open-source-analysis
created: 2026-06-01
project_name: "redis"
project_url: "https://github.com/redis/redis"
language: "C"
license: "BSD-3-Clause"
stars: 68000
parsed_date: 2026-06-01
category: "Backend"
status: "completed"
steps_completed: "14/14"
---

# 开源项目深度解析｜Redis

> 单线程事件循环的内存 KV 之王，零拷贝 + 内存池 + AOF/RDB 持久化

## 项目元信息

| 字段 | 值 |
|------|-----|
| 项目名 | Redis |
| 主语言 | C |
| License | BSD-3-Clause |
| Stars | 68k+ |
| 复刻难度 | ⭐⭐⭐⭐⭐ |

---

## 0. 准备

```bash
git clone --depth 1 https://github.com/redis/redis.git
cd redis && mkdir -p _analysis/{plan,framework,profile,arch,code,run,history,quality,deps,prod,community,lesson,extract}
```

**5 问**：
1. 解决什么？→ 内存 KV + 丰富数据结构
2. 为什么单线程？→ 避免锁开销，IO 才是瓶颈
3. 核心数据流？→ Client → epoll → 命令解析 → dict/skiplist → 响应
4. 骨架文件？→ `server.c`、`networking.c`、`dict.c`、`t_string.c`
5. 最容易踩的坑？→ 大 key、慢命令、内存碎片

---

## 1. Charter

| 字段 | 内容 |
|------|------|
| 一句话定位 | 内存数据结构存储，单线程事件循环 |
| 核心问题 | 极低延迟 + 丰富数据结构 |
| 目标用户 | 缓存、session、队列、限流 |
| 商业模式 | Redis Inc. 商业版 + 开源 |
| 复刻难度 | ⭐⭐⭐⭐⭐ |

---

## 2. 框架

```
redis/
├── src/                    # 核心代码
│   ├── server.c           # 主循环 ⭐
│   ├── networking.c       # 网络 IO
│   ├── dict.c             # 哈希表
│   ├── t_string.c         # 字符串
│   ├── t_list.c           # 列表
│   ├── t_hash.c           # 哈希
│   ├── t_set.c            # 集合
│   ├── t_zset.c           # 有序集合
│   ├── aof.c              # AOF 持久化
│   ├── rdb.c              # RDB 快照
│   ├── replication.c      # 主从复制
│   ├── cluster.c          # 集群
│   ├── bio.c              # 后台 IO
│   ├── latency.c          # 延迟监控
│   └── zmalloc.c          # 内存分配
├── tests/                  # Tcl 集成测试
└── utils/                  # 工具
```

**入口**：`src/server.c:redisMain()` → `aeMain()` 事件循环

---

## 3. 画像

| 维度 | 数据 |
|------|------|
| 代码行 | ~25 万 C |
| 贡献者 | 700+ |
| 月均提交 | 100+ |
| 主语言 | C 92% + Tcl 5% |

---

## 4. 架构

```
Client (RESP 协议)
    ↓
aeMain (epoll 事件循环)
    ↓
readQueryFromClient
    ↓
processCommand → 命令分派
    ↓
call() → t_string.c / t_hash.c / ...
    ↓
addReply → 写回 client buffer
    ↓
writeToClient → 写 socket
```

**单线程的核心**：
- IO 多路复用：epoll/kqueue/evport
- 时间事件 + 文件事件，aeProcessEvents 统一调度

**ADR-001：为什么单线程？**
- 背景：KV 存储瓶颈是 IO 不是 CPU
- 决策：单线程命令处理
- 理由：避免锁开销 + L1 缓存友好 + 实现简单
- 代价：无法利用多核
- 替代：多线程 + 分片（Memcached 模式）
- 后续：6.0+ 引入 IO 多线程（但命令执行仍单线程）

---

## 5. 代码深度解析 ⭐

### 5.1 事件循环

**文件**：`src/ae.c`

```c
void aeMain(aeEventLoop *eventLoop) {
    eventLoop->stop = 0;
    while (!eventLoop->stop) {
        aeProcessEvents(eventLoop, AE_ALL_EVENTS|
                                   AE_CALL_BEFORE_SLEEP|
                                   AE_CALL_AFTER_SLEEP);
    }
}
```

**为什么这样写**：
- 单线程循环：所有事件顺序处理
- BEFORE_SLEEP / AFTER_SLEEP 钩子：给 cluster 主从同步等特殊处理
- 永不退出：直到 stop 标志

### 5.2 命令执行

**文件**：`src/server.c:processCommand`

```c
int processCommand(client *c) {
    // 1. 查找命令
    c->cmd = c->lastcmd = lookupCommand(c->argv[0]->ptr);
    if (!c->cmd) { return replyError(c, "unknown command"); }
    
    // 2. 鉴权
    if (server.requirepass && !c->authenticated) { ... }
    
    // 3. 内存检查
    if (server.maxmemory && !c->flags & CLIENT_NO_EVICT) { 
        if (freeMemoryIfNeeded() == C_ERR) return ...; 
    }
    
    // 4. 执行
    call(c, CMD_CALL_FULL);
    
    // 5. 慢日志
    if (duration > server.slowlog_log_slower_than) { ... }
    
    return C_OK;
}
```

**为什么这样写**：
- 5 步流程清晰：查 → 鉴 → 内存 → 调 → 记
- 慢日志内置：线上排查必备
- call() 统一入口：AOF 复制等都靠它

### 5.3 字符串实现 SDS

**文件**：`src/sds.c`

```c
struct sdshdr {
    uint32_t len;       // 已用长度
    uint32_t alloc;     // 总分配
    unsigned char flags;// 类型
    char buf[];
};
```

**为什么这样写**：
- `len` 字段：O(1) 取长度（不用 strlen）
- `alloc` 字段：预分配 + 惰性回收
- `flags` 字段：sdshdr5/8/16/32/64 分级，小字符串省空间

**可借鉴**：
- 任何 C 项目处理字符串都该用 sds 模式
- Java 的 StringBuilder 同理

### 5.4 dict（哈希表）

**渐进式 rehash**：
```c
dictEntry *dictAddRaw(dict *d, void *key, dictEntry **existing) {
    if (dictIsRehashing(d)) _dictRehashStep(d);
    // ... 添加
}
```

**为什么**：
- 一次性 rehash 会阻塞 → 大 dict 卡顿
- 渐进式：每次操作 rehash 一步 → 平摊到多次操作
- 借鉴：所有需要 rehash 的数据结构都用这个套路

### 5.5 跳表（zset）

**文件**：`src/t_zset.c`

```c
typedef struct zskiplistNode {
    sds ele;
    double score;
    struct zskiplistNode *backward;
    struct zskiplistLevel {
        struct zskiplistNode *forward;
        unsigned long span;
    } level[];
} zskiplistNode;
```

**为什么用跳表而不是红黑树**：
- 实现简单：~200 行
- 范围查询 O(log n) 起 + O(k) 连续
- 内存局部性更好
- 借鉴：排行榜、限流滑动窗口都该用跳表

---

## 6. 运行

```bash
make MALLOC=libc   # 编译
./src/redis-server --port 6379
```

**Smoke test**：
```bash
redis-cli SET foo bar
redis-cli GET foo   # bar
redis-cli ZADD rank 100 alice
redis-cli ZRANGE rank 0 -1 WITHSCORES
```

**资源占用**：
- 启动：~30ms
- 内存：~5MB（空）+ 数据
- 线程：1（6.0+ 是 4-8 个 IO 线程）

---

## 7. 演进

| 阶段 | 时间 | 关键 |
|------|------|------|
| 2009 | 初始 | 作者 Salvatore Sanfilippo |
| 2010 | VM 引入 | 内存换页（后废弃） |
| 2012 | 集群雏形 | Twemproxy |
| 2015 | v3.0 集群 | 原生 Cluster |
| 2017 | v4.0 模块 | Module 系统 |
| 2020 | v6.0 | IO 多线程 |
| 2022 | v7.0 | Functions + ACL 完善 |
| 2024 | v7.4 | 性能优化 |

**灵魂人物**：antirez（Salvatore Sanfilippo）

---

## 8. 质量

| 维度 | 数据 |
|------|------|
| 单测 | tcl 集成测试 + C 单元测试 |
| 模糊测试 | AFL 长期跑 |
| CI | GitHub Actions + Cirrus |
| Lint | C 自定义 + Cppcheck |
| 性能 | redis-benchmark 内置 |

---

## 9. 依赖

极简：
- libc
- jemalloc/libc（可选）
- 编译期：gcc/clang

无第三方运行时依赖。

---

## 10. 生产实践

| 实践 | 怎么做 |
|------|--------|
| 内存上限 | maxmemory + 淘汰策略 |
| 持久化 | RDB（快照）+ AOF（日志） |
| 主从 | replicaof 命令 |
| 哨兵 | redis-sentinel |
| 集群 | redis-cli --cluster create |
| 慢查询 | slowlog get |
| 监控 | INFO 命令 + redis_exporter |
| 大 key 扫描 | redis-cli --bigkeys |

---

## 11. 社区

- Redis Inc. 商业化
- 开源核心 + 商业模块（RediSearch/RedisJSON）
- 5 月一次小版本，年度大版本

---

## 12. 教训

### 必偷 3 件
1. **SDS 模式**：长度字段 + 预分配 → 所有 C 字符串
2. **渐进式 rehash**：分摊到 N 次操作
3. **事件循环 + before_sleep 钩子**：给特殊处理留口子

### 必避 3 坑
1. **大 key**：单 key > 10MB 阻塞主线程
2. **KEYS 命令**：O(n) 阻塞
3. **未设 maxmemory**：OOM 后被 kill

### 7 天复刻
```
D1: 跑起来 + redis-cli
D2: 读 ae.c 事件循环
D3: 读 dict.c 哈希表
D4: 读 sds.c 字符串
D5: 写 mini-redis 100 行（只支持 GET/SET）
D6: 读 t_zset.c 跳表
D7: 写博客
```

### 打分（5/5/5/5/5）

---

## 13. 学习卡片

### 《Redis》学习卡片

#### 一句话价值
> 单线程事件循环 + 极致工程化 = 内存 KV 之王。

#### 3 个洞察
1. **IO 是瓶颈不是 CPU**：单线程反而快
2. **渐进式 rehash**：所有需要扩容的数据结构都该学
3. **SDS 模式**：C 字符串处理的天花板

#### 5 段必读代码
1. `ae.c:aeMain` — 事件循环
2. `server.c:processCommand` — 命令分发
3. `sds.c:sdsnewlen` — 字符串创建
4. `dict.c:_dictRehashStep` — 渐进式 rehash
5. `t_zset.c:zslInsert` — 跳表插入

#### 反模式
- VM 机制（早期）：用磁盘换内存 → 实现复杂且慢 → 废弃

#### 可复用模式
- 渐进式 rehash → 任何需要扩容的数据结构

#### 马上用 3 件事
1. [ ] 把项目里某个 dict 改成渐进式 rehash
2. [ ] 引入 SDS 模式处理 C 字符串
3. [ ] 监控大 key（>10MB）

---

## 🏷️ 标签

`#开源项目` `#深度解析` `#Redis` `#单线程` `#事件循环` `#C`

## 🔗 关联笔记

- [[开源项目深度解析体系]]
- [[每日开源项目抓取任务]]
- [[etcd-深度解析]]
- [[Go-runtime-调度原理]]
