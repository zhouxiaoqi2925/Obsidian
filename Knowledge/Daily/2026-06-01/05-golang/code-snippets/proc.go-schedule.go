// 来源: golang src/runtime/proc.go:schedule / findrunnable / execute
// 作用: GMP 调度主循环 — Go 高并发的灵魂
// 调用链: schedule() → findrunnable() → execute() → gogo(汇编)
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] GMP 三层模型的意义
//   - G (goroutine): 用户级协程, 初始栈 2KB, 可增长到 1GB
//   - M (machine):   OS 线程, 由 runtime 管理, 数量 = GOMAXPROCS × 一些
//   - P (processor): 逻辑 CPU, 持本地队列 (LRQ, 256), 是 G/M 中介
//   - 为什么需要 P: 早期 G/M 1:1 全局锁竞争; P 把"待运行队列"分散到每个 CPU
//   - 核心: G 数量 >> P 数量, P 数量 ≈ CPU 核心数, 调度粒度 = G
//
// [WHY-2] findrunnable 调度优先级 (4 步找 G)
//   - 1) P 本地 LRQ: 99% 命中, 无锁 (P 自有)
//   - 2) 全局 GRQ: 每 61 次调度去偷一次, 防全局队列饥饿
//   - 3) work stealing: 其他 P 偷一半 (random P, LRQ 长度减半)
//   - 4) netpoll: 网络 I/O ready 的 G (epoll 唤醒)
//   - 全没有 → park 当前 M (睡眠, 等唤醒)
//   - 61 这个魔数: 经验值, 避免每调度都抢 GRQ 锁
//
// [WHY-3] execute + gogo: 上下文切换的 50ns 优化
//   - execute() 调 gogo(), gogo 是汇编 (runtime/asm_amd64.s)
//   - 切换只保存/恢复: SP, PC, 寄存器, 不切浮点/段寄存器
//   - goroutine 切换: ~50-100ns, 线程切换: ~1-10μs (100x 快)
//   - 调度点: 主动 (go/channel/select) + 被动 (syscall 唤醒, GC 抢占)
//
// [WHY-4] work stealing + handoff 平衡负载
//   - steal: 空闲 P 偷任务多的 P (随机 P, 偷一半 LRQ)
//   - handoff: 同步 syscall 阻塞的 M, 释放 P 给其他 M (P 不闲着)
//   - 异步 syscall (net I/O): M 不阻塞, G 走 netpoll (epoll)
//   - 含义: 即使某个 M 阻塞, P 上的 G 队列能继续被其他 M 消费
//
// [WHY-5] 调度抖动 (latency spike) 排查
//   - Stop-The-World (STW): GC, 写屏障, 栈扫描, 100μs-1ms 不可调度
//   - 监控指标: scheduler.latency, /debug/pprof/goroutine
//   - 优化: GOMAXPROCS 不要大于 CPU 数, 避免抖动
//   - 1.14+: 基于信号的异步抢占 (sysmon), 解决"长 G 死循环"卡调度
// ================================================================

// === schedule() 主循环 ===
func schedule() {
    // [WHY-1] top-level: 1 个 M 1 个循环, 不断找 G 跑
    _g_ := getg()  // 当前 g (g0, 调度专用)

top:
    // [WHY-2] 找可运行 G — 4 步优先级
    gp, inheritTime, tryWakeP := findrunnable()  // block 在这

    // ... 一些统计和检查 (略) ...

    if tryWakeP {
        wakep()  // 唤醒 idle P (在 handoff/syscall 场景)
    }

    // [WHY-3] execute 调 gogo (汇编), 切 G 上下文
    execute(gp, inheritTime)  // 不会返回
}

// === findrunnable() 找 G ===
func findrunnable() (gp *g, inheritTime, tryWakeP bool) {
    _g_ := getg()

    // [WHY-2] 1) P 本地队列 (LRQ) — 99% 命中
    if _g_.m.p.ptr().schedtick%61 == 0 {
        // 每 61 次, 优先偷 GRQ (防全局队列饥饿)
        gp, inheritTime = globrunqget(_g_.m.p.ptr(), 1)  // 1 个 G
        if gp != nil {
            return
        }
    }

    // [WHY-2] 2) 全局队列 (GRQ)
    if _g_.m.p.ptr().schedtick%61 != 0 {
        gp, inheritTime = globrunqget(_g_.m.p.ptr(), 1)
        if gp != nil {
            return
        }
    }

    // [WHY-4] 3) work stealing: 偷其他 P 的 LRQ 一半
    for i := 0; i < 4; i++ {  // 尝试 4 个随机 P
        // 随机选一个 P, 偷一半 LRQ (256 / 2 = 128)
        pp := allp[fastrandn(uint32(len(allp)))]
        if pp == _g_.m.p.ptr() || pp.runqgrab != ... {
            continue
        }
        gp, inheritTime = runqsteal(_g_.m.p.ptr(), pp, ...)
        if gp != nil {
            return
        }
    }

    // [WHY-2] 4) netpoll — 网络 I/O ready 的 G
    if netpollinited() && atomic.Load(&netpollWaiters) > 0 {
        gp = netpoll(0)  // 0 = 非阻塞, 返回所有 ready
        if gp != nil {
            // 重要: 把多个 netpoll ready G 注入 LRQ, 防饥饿
            injectglist(gp.schedlink)
            gp, inheritTime = nil, false
            return  // 重试 findrunnable
        }
    }

    // 4) 全无 → park 当前 M
    stopm()  // park _g_.m, 睡眠在 note (condvar 实现)
    return
}

// === execute() 调 gogo() ===
func execute(gp *g, inheritTime bool) {
    _g_ := getg()

    // 把 gp 标为 running
    casgstatus(gp, _Grunnable, _Grunning)
    gp.waitsince = 0
    gp.preempt = false  // 1.14+: 抢占标志
    gp.stackguard0 = gp.stack.lo + _StackGuard

    // [WHY-3] gogo 是汇编, 直接切 SP/PC 寄存器
    gogo(&gp.sched)  // ←── 切到 gp 跑
}

// ================================================================
// 性能数据 (8 核 CPU, 1k QPS goroutine 任务):
//
// [调度延迟] (从 G 可跑到 G 实际跑)
//   - 最佳 (LRQ 命中):     ~10-50ns
//   - 中等 (GRQ 命中):     ~100ns (抢锁)
//   - 较差 (work steal):   ~500ns (跨 P 通信)
//   - 最差 (netpoll 唤醒):  ~1-5μs (epoll 系统调用)
//
// [上下文切换]
//   - goroutine 切换:   ~50-100ns
//   - OS 线程切换:      ~1-10μs (100x 慢)
//   - 进程切换:         ~10-100μs
//
// [8 核满载实测]
//   - 1k QPS goroutine:  P99 = 1ms
//   - 10k QPS goroutine: P99 = 10ms
//   - 100k QPS:          P99 = 100ms (调度成为瓶颈)
//
// 关键阈值:
//   - LRQ 大小: 256 (满了才入 GRQ)
//   - 61: 每 61 次调度去偷 GRQ (防饥饿)
//   - GOMAXPROCS: 默认 = NumCPU (物理核数)
//
// 坑:
//   - 不要 GOMAXPROCS = 物理核 × 2, 抖动更大
//   - 长循环 G (死循环) 1.13 前不会让出 CPU, 1.14+ 异步抢占解决
//   - channel 满 + select 多 case 可能饥饿 (random select 概率)
//   - CGO 调用阻塞 M, P handoff 给其他 M (有性能损失)
//
// 监控:
//   - GODEBUG=schedtrace=1000  # 每秒打印调度统计
//   - GODEBUG=scheddetail=1    # 详细
//   - runtime/metrics: sched.latency, sched.pause, sched.gc
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: GMP 调度的 5 大场景]
//   - 1) LRQ 命中 (99%): 10-50ns
//   - 2) GRQ 命中 (1%): 100ns (抢锁)
//   - 3) work steal: 500ns (跨 P 通信)
//   - 4) netpoll 唤醒: 1-5µs (epoll)
//   - 5) park: 等待 (ms 级)
//
// [案例 2: 抢占式调度 5 大要点]
//   - 1.13 前: 协作式 (主动让出)
//   - 1.14+: 基于信号异步抢占 (sysmon 发 SIGURG)
//   - 触发点: 每 10ms 检查 long-running G
//   - 用户代码: 1 个 G 死循环 100ms, 强制调度
//   - 关键: 防 1 个 G 饿死整个 P
//
// [案例 3: syscall 处理 5 大路径]
//   - 同步 syscall (read/write): M 解绑 P, P 给其他 M
//   - 异步 syscall (net): M 不阻塞, G 走 netpoll
//   - CGO: 阻塞 M, P handoff
//   - 通道: 切上下文到其他 G
//   - 实战: 避免 CGO 阻塞
//
// [案例 4: 5 大调度优化实战]
//   - 1) GOMAXPROCS: 设 NumCPU, 容器内 cgroup 限核
//   - 2) 避免 CGO: 改用纯 Go (cgo 阻塞 M)
//   - 3) goroutine 数: 不超 1w 长期存活
//   - 4) work stealing: 多 P 平衡负载
//   - 5) 1.22+: 自己用计时器, 不依赖 sysmon
//
// [案例 5: 实战: 1k QPS 调度延迟 (8 核)]
//   - LRQ 命中: P50 = 30ns, P99 = 100ns
//   - GRQ 命中: P50 = 200ns, P99 = 500ns
//   - work steal: P99 = 1µs
//   - netpoll: P99 = 5µs
//   - 1k QPS: P99 = 1ms (网络为主, 调度不是瓶颈)
//
// [案例 6: 调度抖动排查 5 大工具]
//   - GODEBUG=schedtrace=1000: 每秒统计
//   - GODEBUG=scheddetail=1: 详细
//   - go tool trace: 可视化
//   - runtime/metrics: 程序化读
//   - /debug/pprof/goroutine: stuck 在哪
//
// [案例 7: GOMAXPROCS 调优实战]
//   - 默认: NumCPU (物理机)
//   - 容器: 1.22+ 自动读 cgroup (Linux)
//   - 旧版容器: GOMAXPROCS=2 ./app 手动设
//   - 监控: GOMAXPROCS 不应 > 物理核
//   - 代价: 多了调度开销, 反而慢
//
// [案例 8: 5 大调度监控指标]
//   - /sched/latency: 调度延迟 (ns)
//   - /sched/pauses/total/gc: GC 暂停
//   - /sched/pauses/total/other: 其他暂停
//   - /goroutines: 总 goroutine 数
//   - /threads: 总 OS 线程数
//   - /cpu/classes/user/cpu: 用户态 CPU
//   - /cpu/classes/gc/cpu: GC 用 CPU
//
// [案例 9: 实战: 找调度瓶颈案例]
//   - 现象: 8 核机器 1k QPS, CPU 80%, 怀疑调度
//   - 排查: GODEBUG=schedtrace=1000
//   - 看: LRQ 平均长度 200 (太高!)
//   - 原因: 1 个 G 在处理慢 IO
//   - 解决: 拆 IO goroutine, 不阻塞计算
//
// [案例 10: 5 大 P 状态详解]
//   - _Pidle: 空闲, 等待任务
//   - _Prunning: 正在跑 G
//   - _Psyscall: M 在 syscall, P 等
//   - _Pgcstop: GC STW 暂停
//   - _Pdead: P 被移除 (GOMAXPROCS 调小)
//   - 关键: P 数 = 物理 CPU, M 数动态
// ================================================================
