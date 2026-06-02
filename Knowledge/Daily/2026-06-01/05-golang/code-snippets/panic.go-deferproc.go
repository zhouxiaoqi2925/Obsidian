// 来源: golang src/runtime/panic.go:deferproc + runtime/panic.go:deferreturn
// 作用: defer 实现 — 延迟调用 + panic 链路
// 调用链: defer fn() → deferproc (注册) → 函数 return → deferreturn (执行)
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] defer 的 3 种实现 (Go 1.14 优化)
//   - 1.13 之前: 堆分配 _defer (链表), 每次 defer 调 malloc
//     * 性能差, ~50-200ns / defer
//   - 1.13 优化: 栈上分配 _defer (open-coded 失败 fallback)
//     * 性能: ~30-100ns / defer
//   - 1.14+ open-coded defer: 编译器直接生成代码 (inline 倒序执行)
//     * 性能: ~0ns (类似函数调用, 几乎无开销)
//     * 限制: defer 数量必须 <= 8, 不能再 defer 中 defer
//
// [WHY-2] defer 倒序执行: LIFO
//   - defer 在函数 return 前倒序执行 (后注册先执行)
//   - 原因: 资源释放的"反向": open → close 倒过来 close → open
//   - 例: A → defer a, B → defer b, C → defer c → 退出顺序: c → b → a
//   - panic 时: 链式 unwind, 调 defer 直到 recover
//
// [WHY-3] panic 链路: 串行 unwind 调 defer
//   - panic(v) 调 gopanic(v)
//   - gopanic 沿调用栈 unwind, 每层执行 defer
//   - 遇到 recover() 的 defer 停下, 恢复正常执行
//   - 没遇到 recover: 进程崩溃, fatal error: panic
//   - 性能: panic 比 err 返回慢 1000x, 不要当 err 用
//
// [WHY-4] recover() 的限制
//   - 必须在 defer 函数中调 (直接调 recover() 永远返回 nil)
//   - 只能在同一 goroutine recover (跨 goroutine 没用)
//   - recover 后, 函数返回 nil (但 defer 内可继续逻辑)
//   - 实战: recover 后记录 log, 不要"吞掉" 业务错误
//   - 多层 recover: 内层 recover 后, 后续的 panic 不影响
//
// [WHY-5] defer 性能陷阱
//   - 循环内 defer: 累积到函数结束 (1.14+ open-coded 部分优化)
//   - 频繁 defer: 高频调用 (每秒 1w+), 仍可能成为瓶颈
//   - defer + 闭包: 闭包捕获变量, 逃逸 → 性能差
//   - 替代: 用函数返回清理资源, defer 仅用于 panic 安全
//   - 实战: 关键路径不用 defer, 性能敏感用 sync.Pool + 手动清理
// ================================================================

// === deferproc 注册 defer (1.13 之前堆分配版) ===
func deferproc(siz int32, fn *funcval) {
    // [WHY-1] 1. 拿当前 g
    gp := getg()

    // [WHY-1] 2. 分配 _defer (堆 or 栈)
    d := newdefer(siz)
    if d._heap {
        // 堆分配 (1.13 之前常见)
        totalDefers++
    }

    // 3. 参数存到 d.args (用 unsafe 偏移)
    *(*unsafe.Pointer)(unsafe.Pointer(&d.args)) = unsafe.Pointer(fn)
    // 如果 siz > ptrSize, 还有更多参数
    if siz > ptrSize {
        memmove(unsafe.Pointer(&d.args)+ptrSize, unsafe.Pointer(&fn)+ptrSize, uintptr(siz)-ptrSize)
    }

    // [WHY-2] 4. 头插到 g._defer 链表 (LIFO)
    d.link = gp._defer
    gp._defer = d

    // 5. 标 defer 正在跑 (return 时检测)
    gp.throwing = -1  // 临时标, 防止嵌套问题

    return0()
}

// === deferreturn 倒序执行 defer ===
// 编译器在每个 return 前自动生成
func deferreturn() {
    gp := getg()
    d := gp._defer
    if d == nil {
        return  // 没 defer, 直接返回
    }

    // [WHY-2] 1. 头取 _defer (LIFO)
    fn := d.fn
    d.fn = nil
    gp._defer = d.link  // 移动到下一个

    // 2. 释放 _defer
    freedefer(d)

    // 3. 调 defer 函数
    jmpdefer(fn, uintptr(unsafe.Pointer(&d.args)))
}

// === open-coded defer (1.14+ 编译器生成) ===
// 编译器把 defer 改成局部变量 + 倒序调用
// 例:
//   func f() {
//       defer log("a")
//       defer log("b")
//       defer log("c")
//
//       // body
//   }
//
// 编译器生成 (伪):
//   func f() {
//       // defer 状态用 3 个 bool 变量 (栈上)
//       d_a, d_b, d_c := true, true, true
//
//       // body
//
//       if d_c { log("c") }  // 倒序
//       if d_b { log("b") }
//       if d_a { log("a") }
//   }
//   性能: 几乎零开销 (~函数调用)

func f() {
    defer log("a")  // → if d_a { log("a") } (倒序)
    defer log("b")  // → if d_b { log("b") }
    defer log("c")  // → if d_c { log("c") }
    // body
}

// === panic + recover ===
func gopanic(e interface{}) {
    gp := getg()

    // [WHY-3] 1. 把 panic 值存到 g
    gp.panic = e

    // 2. 沿调用栈 unwind, 每层调 defer
    for {
        d := gp._defer
        if d == nil {
            // 没 defer, 进程崩溃
            fatalpanic(gp, e)  // fatal error
        }

        // 3. 调 defer
        d.fn(...)  // 类似 deferreturn

        // 4. 检查 defer 内是否 recover
        if gp.m.recover != nil {
            // 找到 recover, 恢复正常
            gp.m.recover = nil
            // unwind 栈帧, 回到 caller
            ...
            return
        }
    }
}

// recover() 实际实现
func gorecover() interface{} {
    gp := getg()
    p := gp.panic
    gp.panic = nil
    return p  // nil 表示没 panic
}

// === 实战: defer + recover 错误处理 ===
func safeCall() (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("recovered: %v", r)
        }
    }()

    // 业务代码
    doRiskyWork()  // 内部 panic 会被 recover
    return nil
}

// ================================================================
// 性能数据 (1.14+ open-coded defer):
//
// [1.14+ open-coded] (defer 数量 ≤ 8, 不在 defer 中 defer)
//   - 注册:  ~0ns (编译器代码, 几乎零开销)
//   - 执行:  ~函数调用开销, ~5ns
//   - 性能:  比 1.13 之前快 30-50x
//
// [1.13 堆分配]
//   - 注册:  ~50-200ns (malloc _defer)
//   - 执行:  ~50-100ns
//
// [panic + recover]
//   - panic: ~1-10μs (unwind 整个栈 + 调所有 defer)
//   - recover:  ~100ns (恢复执行)
//   - 比 err 返回: 慢 100-1000x, 不要当 err 用
//
// 关键阈值:
//   - open-coded 限制: defer 数量 ≤ 8
//   - 1.14+: 99% 场景走 open-coded
//   - 触发堆分配: 在循环内 defer, 在 defer 中 defer
//
// 坑:
//   - 循环 defer: 累积到函数结束 (1.14+ 部分优化)
//   - recover 在 goroutine 外: 不生效
//   - recover 多次: 内层 recover 后, 外层 panic 不影响
//   - panic 后修改全局状态: 危险, 用 defer 清理
//   - 高频 defer (1w+/s): 仍可能成为瓶颈, 考虑改用 sync.Pool
//
// 监控:
//   - GODEBUG=godebug=asyncpreemptoff=1 看调度
//   - GODEBUG=opencodedefer=1 强制关闭 open-coded
//   - pprof goroutine: 看 stuck 在 panic 恢复的 G
// ================================================================
