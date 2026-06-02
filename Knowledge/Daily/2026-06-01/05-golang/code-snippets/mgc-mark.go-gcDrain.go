// 来源: golang src/runtime/mgc/mark.go:gcDrain + gcWriteBarrier
// 作用: GC 标记阶段 — 三色标记 + 写屏障 (并发 GC 正确性核心)
// 调用链: GC start → gcDrain (mark worker) → sweep
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 三色不变性 (Tri-color invariant)
//   - 白色: 未扫 (初始所有对象)
//   - 灰色: 已标记, 未扫引用 (在 mark 队列)
//   - 黑色: 已标记, 已扫引用 (完成扫描)
//   - 不变性: 黑色对象不能直接指向白色对象 (强三色)
//   - 标灰从 GC root 开始 (全局变量 + goroutine 栈)
//   - 灰空 = 标记完成, 剩余白色 = 垃圾
//
// [WHY-2] 难题: 用户 goroutine 并发改引用 → 漏标
//   - GC mark 是并发的 (用户 goroutine 同时跑)
//   - 场景: A 黑色 (已扫) → B 白色 (未扫), 用户写 A.x = C
//   - 漏标风险: C 没被扫到, 被错误回收
//   - 解决: 写屏障 (write barrier) — 写引用时检查
//
// [WHY-3] Dijkstra 插入写屏障
//   - writePointer(slot, ptr):
//     shade(ptr)  // 写时, 把 ptr 变灰
//   - 写时检查: 无论 slot 颜色, ptr 一定非白
//   - 配合 STW 重扫 root (解决栈上的边)
//   - Go 1.8 之前用这个, 缺点: 每写都开屏障, 写性能下降 5-10%
//
// [WHY-4] Yuasa 删除写屏障 + 混合写屏障 (1.8+)
//   - writePointer(slot, ptr):
//     if old = *slot, old != nil: shade(old)  // 把旧值标灰
//     *slot = ptr
//   - 1.8+: 混合 — 兼顾插入 + 删除, 消除 STW 重扫栈
//   - 写性能影响更小 (~2-3%)
//   - 代价: GC 算法复杂度高
//
// [WHY-5] gcDrain 并发 mark 循环
//   - mark worker 不断从灰色队列拉对象
//   - 扫引用, 白色变灰色 (write barrier 协助)
//   - balance: 队列空了, 从其他 P 偷一半
//   - scanWork: GC assist 配额 (用户分配时扣 work)
//   - 用户分配时: credit += alloc, GC 慢 1 倍则 assist 翻倍
//   - 灰空 = 标记完成, 转 sweep 阶段
// ================================================================

// === gcDrain 标记循环 (mark worker) ===
func gcDrain(gcw *gcWork, scanWork int64) {
    _g_ := getg()

    // [WHY-5] 1. 准备: 看是 mark 阶段还是 mark termination
    if !_g_.m.gcing {
        throw("BG gcworker not gcing")
    }

    // 1.1 优先扫 root (全局变量 + 栈)
    gcw.prepareMarkRoot()

    // [WHY-5] 2. 主循环: 扫 scanWork 单位的工作
    for scanWork > 0 {
        // 2.1 快速路径: 从本地 wbBuf 拿
        b, _ := gcw.tryGetFast()
        if b == 0 {
            // 2.2 本地空, 全局拿
            b, _ = gcw.tryGet()
            if b == 0 {
                // 2.3 全局也空, balance (从其他 P 偷)
                gcw.balance()
                // 偷完再试, 拿不到就 continue (下次循环)
                continue
            }
        }

        // [WHY-1] 2.4 扫对象 b, 把白色引用变灰
        scanobject(b, gcw)

        // [WHY-5] 2.5 扣 scanWork (GC assist 配额)
        scanWork -= gcController.assistWorkPerByte
    }
}

// === scanobject 扫对象 ===
func scanobject(b uintptr, gcw *gcWork) {
    // b 是对象地址, 扫所有引用
    // 用 type info (从 obj 头) 知道哪些字段是指针
    for i := 0; i < n; i++ {
        if field[i] is pointer {
            obj := field[i]
            if obj != 0 && !markBits.isMarked(obj) {
                // 标灰 (加入 mark 队列)
                if !greyobject(obj, gcw) {
                    // 已在灰队列, 跳过
                }
            }
        }
    }
    // 标黑: b 扫完, 加到黑队列 (用于 sweep 时找 free 起点)
    setMarked(b)  // markBits.set(b)
}

// === 写屏障 (Dijkstra 简化版) ===
// 编译时插入: 每次写指针都生成这行
//   if writeBarrier.enabled {
//       writePointer(slot, ptr)
//   }

// [WHY-3] Dijkstra 插入屏障
func writePointer(slot, ptr unsafe.Pointer) {
    if slot == nil || ptr == nil {
        *slot = ptr  // 写入
        return
    }
    if currentStack != nil && stackShade(ptr) {
        // ptr 在 GC 栈上, 标灰
        shade(ptr)
    }
    *slot = ptr  // 写入
}

// [WHY-4] 混合屏障 (1.8+)
func hybridWritePointer(slot, ptr unsafe.Pointer) {
    // 1. 旧值标灰 (Yuasa 删除)
    if old := *slot; old != nil && !isMarked(old) {
        shade(old)
    }
    // 2. 新值标灰 (Dijkstra 插入)
    if ptr != nil && !isMarked(ptr) {
        shade(ptr)
    }
    *slot = ptr
}

// === GC assist (用户分配时扣 work) ===
func assistWork() {
    // 用户分配 1 byte 扣 assistWorkPerByte (默认 ~1)
    // GC 慢 → assist 多, 触发 GC mark 加速
    // GC 快 → assist 少
    // 效果: 用户 goroutine "帮" GC mark, 总 wall time 平滑
}

// ================================================================
// 性能数据 (8 核, 1GB 堆, 100w 对象):
//
// [STW 时间]
//   - 1.20+ GC STW:   ~100-500μs (mark termination)
//   - 1.14 之前:       ~1-10ms
//   - 1.22+ 进一步:    ~50-200μs
//
// [GC 吞吐 (alloc + GC 总耗时)]
//   - 1.20+:  ~25% (75% CPU 给用户)
//   - 1.14:   ~30%
//   - 1.10:   ~40%
//
// [写屏障开销]
//   - Dijkstra 纯:    5-10% 写性能下降
//   - 混合 (1.8+):    2-3% 写性能下降
//
// [GC assist]
//   - 用户分配 1 byte → 扣 1 unit (assistWorkPerByte)
//   - GC mark worker 算 1 个对象 → 算 1 unit
//   - 总 CPU 占用: 用户 + GC = 100% (平摊)
//
// 关键参数:
//   - GOGC=100:  堆翻倍触发 GC (默认)
//   - GOGC=200:  堆 3 倍触发, 吞吐优先
//   - GOGC=off:  禁用 GC (极少用, debug 用)
//   - GOMEMLIMIT (1.22+): 软内存上限, 超了主动 GC
//
// 调优技巧:
//   - 减少分配: 用 sync.Pool, 切片复用, 避免 []byte 频繁构造
//   - 大切对象 > 32KB: 走 mheap 大对象分配, 慢
//   - GC 调优: GOGC=200 减少 GC 频率, 但内存占用翻倍
//   - 监控: GODEBUG=gctrace=1, runtime/metrics
//
// 监控指标 (1.22+):
//   - /gc/heap/allocs-bytes:    累计分配字节
//   - /gc/heap/frees-bytes:     累计释放字节
//   - /gc/heap/goal:            下次 GC 触发阈值
//   - /gc/heap/live:            当前存活字节
//   - /gc/cycles/total:         GC 周期数
//   - /gc/pauses:               每次 STW 暂停时间
//   - /gc/scan/bytes:           扫描字节
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 三色标记法详解]
//   - 白色: 未扫, 潜在垃圾
//   - 灰色: 已标, 子引用未扫
//   - 黑色: 已标, 子引用已扫
//   - 不变式: 黑色不能指向白色 (否则白色漏标)
//   - 满足不变式 → GC 正确
//
// [案例 2: gcDrain 7 步流程]
//   - 1) 从 mark queue 拿灰色对象
//   - 2) 调 greyobject 标子对象
//   - 3) scanobject 扫子对象, 找指针
//   - 4) 把指针指向的对象变灰
//   - 5) 重复, 直到灰空
//   - 6) 黑色: 标完, 可达
//   - 7) 白色: 灰空, 不可达, 回收
//
// [案例 3: 5 大 GC 阶段 (1.20+)]
//   - 1) Sweep Termination: STW, 关闭 mark 阶段
//   - 2) Mark: 并发 + assist, 灰对象扫
//   - 3) Mark Termination: STW, 收尾
//   - 4) Sweep: 并发, 释放白对象
//   - 5) Off: 等待下次 GC 触发
//   - 1.20+ 在 mark 阶段前可被抢占 (PACE)
//
// [案例 4: 5 大 GC 调优参数]
//   - GOGC=100: 堆增长 100% 触发 GC (默认)
//   - GOGC=200: 增长 200% 才 GC, 吞吐高, 内存大
//   - GOGC=off: 禁 GC (极少用, 写测试)
//   - GOMEMLIMIT=8GiB: 1.22+ 软内存上限
//   - GOGC=20: 频繁 GC, 低延迟
//
// [案例 5: GC Assist 机制详解]
//   - 分配时: 算应扣 work (跟 mark 进度相关)
//   - assist work < 已做 mark: 立刻分配
//   - assist work > 已做 mark: 暂停用户 goroutine, 做 mark
//   - 平摊: 不让 1 个 G 大量分配拖慢 GC
//   - 1.20+: 抢占式 assist, 更平滑
//
// [案例 6: GC Pacer 5 大决策]
//   - 1) 何时启动 mark: heap 增长到 GOGC 触发
//   - 2) 多少 work: 1.20+ PACE 算
//   - 3) 何时 mark done: 灰空 + 触达
//   - 4) 何时 sweep: mark termination 之后
//   - 5) 内存软上限: 1.22+ GOMEMLIMIT 触发强制 GC
//
// [案例 7: 混合写屏障 5 大要点]
//   - Dijkstra 插入屏障: 写时白色→灰色
//   - Yuasa 删除屏障: 写时标旧值
//   - Go 1.8+: 混合, 同时用
//   - STW 仅 mark termination (短)
//   - 不变式: 黑→白边被屏障拦截
//
// [案例 8: 5 大 GC 监控指标]
//   - /gc/heap/alloc-bytes: 堆分配字节
//   - /gc/heap/frees-bytes: 释放字节
//   - /gc/heap/goal: 下次 GC 触发阈值
//   - /gc/heap/live: 存活字节
//   - /gc/pauses: 暂停时间
//   - /gc/cycles: GC 周期
//   - /gc/scan/bytes: 扫描字节
//
// [案例 9: 实战: GC 调优案例]
//   - 业务: 高并发 API, P99 < 10ms
//   - 现象: STW 偶发 5ms, P99 飙到 50ms
//   - 调优: GOMEMLIMIT=6GiB, GOGC=200
//   - 结果: STW < 500µs, P99 = 8ms
//   - 关键: GOMEMLIMIT 强制不超内存, GOGC 控制频率
//
// [案例 10: 实战: 业务优化减少 GC 压力]
//   - 1) sync.Pool 复用: 减少 90% 分配
//   - 2) 值传递 vs 指针: 大对象指针
//   - 3) 预分配: make([]T, 0, n) 而非 make([]T, 0)
//   - 4) bufio 池: HTTP 读写 buffer 复用
//   - 5) 减少 string<->[]byte 转换: 不必要的拷贝
//   - 6) atomic.Value: 无锁替代 RWMutex
//   - 实战: profile heap, 找 top 分配, 优化
// ================================================================
