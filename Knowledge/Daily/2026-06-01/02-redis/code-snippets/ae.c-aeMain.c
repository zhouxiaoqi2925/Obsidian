// 来源: Redis src/ae.c
// 作用: 事件循环主入口 — Redis 7.0 仍然保留单线程命令执行的核心
// 调用链: main → aeMain → aeProcessEvents (epoll_wait) → readQueryFromClient → processCommand
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么是死循环 + stop 标志
//   - Redis 是常驻服务, 退出 = 异常路径
//   - 优雅关闭依赖: rdbSave + aofRewrite 完成后, 才允许 stop=1
//   - 简单可靠: 没有 select/poll 退出条件, 调度更可预测
//
// [WHY-2] 为什么用 AE_ALL_EVENTS 一把全收
//   - 内部流程: 先处理 time events (cron), 再处理 file events (IO)
//   - 优先级: 时间事件少且严格; 文件事件多, 集中处理
//   - 一次 epoll_wait 拿一波, 减少 syscall 次数
//
// [WHY-3] BEFORE_SLEEP / AFTER_SLEEP 钩子意义
//   - cluster 模式: 定期发 PING/心跳, 必须在 sleep 前发
//   - aof fsync: 4 策略之一 (always/everysec/no), 也在 sleep 期做
//   - 模块 API: 给第三方模块留口子, 不破坏主循环
//
// [WHY-4] 为什么不需要 yield
//   - 单线程无并发, 不存在饿死
//   - 但 4.0+ 引入 lazy free (UNLINK): 耗时操作丢到后台线程
//   - 6.0+ IO 多线程: 网络读写多线程, 命令执行仍单线程
//
// [WHY-5] 为什么不加 watchdog
//   - 单线程 → 没有死锁
//   - 故障 = 主线程卡住 = 系统挂了, 不存在"部分死锁"
//   - 监控靠外部: 客户端 PING, SLOWLOG, INFO commandstats
// ================================================================

void aeMain(aeEventLoop *eventLoop) {
    eventLoop->stop = 0;

    // 主循环: 直到 stop 被置 1 (admin shutdown)
    while (!eventLoop->stop) {
        aeProcessEvents(eventLoop,
                        AE_ALL_EVENTS |
                        AE_CALL_BEFORE_SLEEP |  // [WHY-3] 集群心跳/AOF fsync
                        AE_CALL_AFTER_SLEEP);   // [WHY-3] 模块钩子
    }
}

// 简化的 aeProcessEvents 流程:
int aeProcessEvents(aeEventLoop *eventLoop, int flags) {
    int processed = 0, numevents;

    // 1. BEFORE_SLEEP: cluster 心跳 / AOF fsync / 模块 hook
    if (eventLoop->beforesleep &&
        (flags & AE_CALL_BEFORE_SLEEP))
        eventLoop->beforesleep(eventLoop);

    // 2. 计算最近的时间事件距今多久
    //    shortest = 最近要触发的 cron 任务剩余 ms
    //    若无时间事件, 设为 -1 (永久阻塞)
    int flags = AE_FILE_EVENTS;
    if (!(flags & AE_DONT_WAIT) || eventLoop->timers_head) {
        timeval shortest = ...;
        int j = usUntilEarliestTimer(eventLoop, &shortest);
        // 3. epoll_wait 阻塞 j 微秒
        numevents = aeApiPoll(eventLoop, &shortest);
    } else {
        numevents = aeApiPoll(eventLoop, NULL);  // 立即返回
    }

    // 4. AFTER_SLEEP: 模块/统计 hook
    if (eventLoop->aftersleep && (flags & AE_CALL_AFTER_SLEEP))
        eventLoop->aftersleep(eventLoop);

    // 5. 处理 file events (epoll 唤醒的 fd)
    for (j = 0; j < numevents; j++) {
        aeFileEvent *fe = &eventLoop->events[eventLoop->fired[j].fd];
        if (fe->mask & AE_READABLE) fe->rfileProc(eventLoop, fd, fe->clientData, AE_READABLE);
        if (fe->mask & AE_WRITABLE) fe->wfileProc(eventLoop, fd, fe->clientData, AE_WRITABLE);
    }

    // 6. 处理 time events (cron: 100ms 一次, serverCron)
    processed += processTimeEvents(eventLoop);

    return processed;
}

// ================================================================
// 性能数据 (单核, 4 核机器, 1KB 简单 SET):
//
// [空转] (无客户端)
//   - epoll_wait 阻塞: ~0 (CPU 0%)
//   - 1s 触发 10 次 serverCron: < 0.1ms 总计
//
// [1w 客户端 PING]
//   - 整体延迟: 0.05-0.1ms
//   - 上下文切换: 极少 (无锁 + epoll 唤醒)
//
// [1w 客户端 SET 1KB]
//   - 整体延迟: 0.2-0.5ms
//   - 网络 (epoll): 0.05ms
//   - 协议解析: 0.02ms
//   - dictSetKey: 0.05ms
//   - AOF 写 (everysec): 后台, 不阻塞
//
// 关键瓶颈:
//   - 单条命令延迟 < 1ms
//   - 串行执行: 1w QPS / 核 = 1000 命令 / ms / 核
//   - 多数业务: 单 Redis 10w QPS 远远足够
//   - 更高: pipeline + 客户端分片
//
// 坑:
// ================================================================
// 深度拓展: 单线程到 IO 多线程的演进 + 实战监控
//
// [Redis 6.0 IO 多线程设计 (默认关闭)]
//   - 主线程仍单线程 (命令执行不可分)
//   - 读写网络: 多线程 (默认 4 个 worker thread)
//   - 触发: io-threads-do-reads yes + io-threads 4
//   - 收益: 网络密集型 (10w+ QPS) 性能 2x, 命令密集型不变
//   - 代价: 1 锁 (全局 io_threads_list mutex), 内存 copy 多 1 次
//
// [为什么最终是 IO 多线程而不是 worker 池]
//   - worker 池: 共享数据结构 → 锁 → 性能下降
//   - IO 多线程: 各线程独立的 client, 写完交还主线程
//   - 主线程仍是 Single Source of Truth, 数据一致
//   - 跟 Memcached / nginx 思路一致
//
// [BEFORE_SLEEP / AFTER_SLEEP 钩子详解]
//   - beforeSleep: cluster 周期 PING, AOF 写缓冲, 模块 hook
//   - afterSleep: 统计, 模块 hook
//   - 必要性: epoll_wait 期间主线程闲置, 趁空闲做"非紧急"工作
//   - 钩子内不能阻塞太久, 否则破坏延迟
//
// [serverCron 100ms 一次的 7 件事]
//   - 1. 清理过期 key (active + passive expire)
//   - 2. 软 / 硬 LRU 淘汰
//   - 3. rdb / aof 触发决策
//   - 4. 客户端超时 (timeout)
//   - 5. 慢查询清理
//   - 6. dict 兜底 rehash
//   - 7. 模块 cron 钩子
//   - 累计耗时: 1-2ms / 100ms 周期
//
// [为什么单线程没死锁]
//   - 单线程 = 1 个执行流, 不存在并发
//   - 死锁前提: 多线程 + 锁 + 循环依赖
//   - 但: 1 个慢命令 = 整 Redis 卡
//   - 监控主线程卡顿: redis-cli --latency 看 P99
//
// [epoll 模式选择 (Linux)]
//   - epoll: 1w+ fd 高效 (Redis 6.0+ 默认)
//   - kqueue: BSD/macOS
//   - select: 兼容老内核, O(n)
//   - evport: Solaris
//
// [实战: 调大 maxclients 的隐藏陷阱]
//   - maxclients 默认 10000
//   - 每个 client 占 ~50KB (querybuf + reply + 内部结构)
//   - 1w client = 500MB 内存
//   - 调优: 估业务峰值, 设 maxclients = 2 * 峰值
//   - 监控: connected_clients / maxclients 比例
//
// [监控指标 (PromQL via redis_exporter)]
//   - redis_connected_clients
//   - rate(redis_commands_total[1m])
//   - redis_used_memory_bytes / redis_max_memory_bytes
//   - rate(redis_keyspace_hits_total[1m]) / (rate(redis_keyspace_hits_total[1m]) + rate(redis_keyspace_misses_total[1m]))  // 命中率
//   - redis_blocked_clients (BLPOP 等)
//   - redis_evicted_keys_per_sec  // 淘汰率
//
// ================================================================
//   - KEYS / FLUSHDB / 大 Lua 脚本 阻塞 = 整 Redis 不可用
//   - 监控主线程卡顿: redis-cli --latency -h host -p 6379
//   - INFO commandstats 看 per-cmd 时延分布
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: Redis 6.0 多线程 IO 模式]
//   - 默认单线程, 6.0+ 可开启 io-threads-do-reads + io-threads N
//   - 主线程仍负责命令执行 (单线程), IO 线程只读写 socket
//   - 适用场景: 极大吞吐 (10w+ QPS), 网络是瓶颈
//   - 限制: 4.x/5.x 无此特性, 5.x 集群模式默认开启
//   - 实测: 8 IO 线程, 吞吐提升 2x, 延迟 P99 反而略增
//
// [案例 2: beforeSleep / afterSleep 钩子]
//   - aeMain 每轮循环都调这两个钩子 (server.c)
//   - beforeSleep: 处理 client 写, AOF flush, slowlog 等
//   - afterSleep: 集群心跳, AOF rewrite 触发, RDB check
//   - 监控 beforeSleep 耗时: 反映 1 轮 event loop 真实负载
//
// [案例 3: serverCron 7 大任务 (每 100ms 1 次)]
//   - 1) 清理过期 key (active + passive expire)
//   - 2) LRU/LFU 驱逐 (maxmemory-policy)
//   - 3) RDB/AOF 决策 (save/rewrite 触发)
//   - 4) client 超时检测 (timeout)
//   - 5) slowlog 清理 (slowlog-log-slower-than)
//   - 6) dict rehash 推进 (渐进式, 每 ms 1ms 工作)
//   - 7) 模块化 hook (module.c 回调)
//
// [案例 4: 为什么单线程也没死锁]
//   - 单线程 = 1 个执行流, 不存在并发
//   - 死锁前提: 多线程 + 锁 + 循环依赖
//   - 但: 1 个慢命令 = 整 Redis 卡
//   - 监控主线程卡顿: redis-cli --latency 看 P99
//
// [案例 5: epoll 模式选择 (Linux)]
//   - epoll: 1w+ fd 高效 (Redis 6.0+ 默认)
//   - kqueue: BSD/macOS
//   - select: 兼容老内核, O(n)
//   - evport: Solaris
//
// [案例 6: 调大 maxclients 的隐藏陷阱]
//   - maxclients 默认 10000
//   - 每个 client 占 ~50KB (querybuf + reply + 内部结构)
//   - 1w client = 500MB 内存
//   - 调优: 估业务峰值, 设 maxclients = 2 * 峰值
//   - 监控: connected_clients / maxclients 比例
//
// [案例 7: 监控指标 (PromQL via redis_exporter)]
//   - redis_connected_clients
//   - rate(redis_commands_total[1m])
//   - redis_used_memory_bytes / redis_max_memory_bytes
//   - rate(redis_keyspace_hits_total[1m]) / (rate(redis_keyspace_hits_total[1m]) + rate(redis_keyspace_misses_total[1m]))  // 命中率
//   - redis_blocked_clients (BLPOP 等)
//   - redis_evicted_keys_per_sec  // 淘汰率
//
// [案例 8: event loop latency 排查流程]
//   1. redis-cli --latency -h host 看实时延迟
//   2. INFO commandstats 找最慢命令
//   3. SLOWLOG GET 10 看最近 10 条慢命令
//   4. redis-cli DEBUG SLEEP 0.1 测主线程响应
//   5. 检查 fork 耗时 (RDB/AOF): INFO stats latest_fork_usec
//   6. 监控 INFO clients 最大连接数
//
// [案例 9: Redis 6.0+ 多线程配置实战]
//   ```
//   # redis.conf
//   io-threads 4                # 4 个 IO 线程
//   io-threads-do-reads yes     # 读也用多线程
//   ```
//   - 启动: redis-server /path/to/redis.conf
//   - 注意: 命令执行仍单线程, 多线程只解网络瓶颈
//   - 调优: 机器 N 核, 通常设 N/2 IO 线程
//
// [案例 10: 单线程模型的优缺点]
//   - 优点: 无锁, 无并发, 简单, 易 debug, Memcached 也类似
//   - 缺点: 1 个慢命令卡整服务, 难用满多核
//   - 解法: Cluster 模式横向扩展, 多 Redis 实例分片
//   - 替代: KeyDB (Redis 兼容, 多线程命令执行)
// ================================================================
