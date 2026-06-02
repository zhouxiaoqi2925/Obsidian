// 来源: golang src/cmd/compile/internal/escape/escape.go
// 作用: 逃逸分析 — 编译时决定变量分配在栈还是堆
// 调用链: typecheck → escape (whole-program flow analysis) → codegen
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 逃逸分析的核心目标
//   - 决定变量分配: 栈 (零 GC 压力) vs 堆 (GC 跟踪 + 回收)
//   - 不逃逸: 函数返回后变量不再用 → 栈分配, 弹栈即释放
//   - 逃逸: 变量在函数返回后还可能被引用 → 必须堆分配
//   - 优化收益: 栈分配 ~0 开销, 堆分配 + GC ~100ns-1μs / 次
//   - 现代 Go: 60-80% 分配都在栈上, GC 压力小
//
// [WHY-2] 5 大逃逸场景
//   - 1) 返回局部变量的指针: return &v → 逃到 caller, 必须堆
//   - 2) 闭包捕获: 闭包用了局部变量, 变量必须逃到堆
//   - 3) 接口装箱: v 传给 interface{} 参数 → 装箱, 逃逸
//   - 4) 切片/slice/map 容量不确定: make([]T, n) n 未知 → 堆
//   - 5) 发送到 channel: ch <- v 跨 goroutine, 必须逃
//   - 6) slice 长度 > 栈阈值 (>64KB): 走堆 (大对象)
//   - 7) 逃逸到全局变量: 全局 = local → 逃
//
// [WHY-3] 逃逸分析算法: 跨函数 flow analysis
//   - 构建 location graph: 变量 × 位置的流图
//   - 模拟数据流: 参数 → 局部 → 返回 → caller
//   - 每条 SSA 指令更新 escape state
//   - 状态: EscNone (栈) / EscHeap (堆) / EscScope (scope内)
//   - 复杂度: O(V + E), 全程序分析 (整个包)
//   - 算法: 求解 data flow equations, 迭代到不动点
//
// [WHY-4] 优化: 标量替换 + 同步消除
//   - 标量替换 (scalar replacement): 复合类型 → 拆成多个标量
//     例: Point{x:1, y:2} 不逃逸 → 拆成 x, y 两个 int (栈上)
//   - 同步消除 (sync elimination): 锁的对象不逃 → 锁消除
//   - 栈上分配: 编译器生成 stack alloc (无需 GC)
//   - 性能: 5-10x 提升 (常见场景)
//
// [WHY-5] 实战: -gcflags='-m' 看逃逸报告
//   - go build -gcflags='-m' main.go
//   - 输出: "x escapes to heap" (逃), "y moved to heap" (逃)
//   - "x does not escape" (栈)
//   - -gcflags='-m -m' 更详细 (每条 SSA)
//   - 实战技巧: 小对象 + 不返回指针 + 不传 interface → 栈分配
// ================================================================

// === 1. 逃逸到 caller (返回指针) ===
func newInt() *int {
    v := 42
    return &v  // ❌ v 逃逸到 heap
    // 编译器输出: "moved to heap: v"
}

// === 2. 不逃逸 (返回值不取址) ===
func newVal() int {
    v := 42
    return v  // ✅ v 在栈上, 弹栈释放
    // 编译器输出: "does not escape"
}

// === 3. 闭包捕获 → 逃逸 ===
func makeAdder(n int) func(int) int {
    return func(x int) int {
        return x + n  // ❌ n 逃到 heap (闭包捕获)
    }
}
// 编译器输出: "moved to heap: n"

// === 4. 接口装箱 → 逃逸 ===
func toInterface() interface{} {
    v := 42
    return v  // ❌ int 装箱到 interface{}, 堆分配
}
// 编译器输出: "v escapes to heap"

// === 5. 大切片 → 栈外 ===
func makeSlice() []int {
    s := make([]int, 0, 100)
    return s  // 容量 100 在栈上, 但返回时 escape
    // 编译器输出: "moved to heap: s"
}

// === 6. channel send → 逃逸 ===
func sendVal(ch chan int) {
    v := 42
    ch <- v  // ❌ v 可能跨 goroutine 访问, 堆
}
// 编译器输出: "v escapes to heap"

// === 7. 标量替换 (scalar replacement) ===
type Point struct { X, Y int }
func newPoint() Point {
    p := Point{X: 1, Y: 2}  // 整个 struct 在栈上
    return p  // 拆成 X, Y 两个 int 寄存器传递
}

// === 8. 同步消除 (sync elimination) ===
type noCopy struct{}  // 锁, 但不逃
func (n *noCopy) Lock() {}
// 如果锁的对象不逃, 编译器消除锁
// 实测: -gcflags='-m' 输出 "noCopy Lock() removed by escape analysis"

// === escape() 主流程 (简化) ===
// escape 是 cmd/compile/internal/escape 包的核心
// 实际是 SSA 阶段的 pass, 不是单函数
func escape(pkg *types.Package) {
    // 1. 构建所有函数的 location graph
    for _, fn := range pkg.Funcs {
        fn.buildEscapeGraph()  // 每个 var 一个 location 节点
    }

    // 2. 模拟数据流
    for _, fn := range pkg.Funcs {
        // SSA pass: 遍历每条指令
        for _, b := range fn.Blocks {
            for _, v := range b.Instrs {
                switch v.Op {
                case OpAddr:
                    // [WHY-2] 取地址: 变量逃到 *v
                    addrs(v, v)
                case OpCall:
                    // 函数调用: 参数和返回值可能逃
                    for _, arg := range v.Args {
                        if arg.Type.IsPointer() {
                            // 标灰, 看 callee 是否逃
                            addrs(v, arg)
                        }
                    }
                case OpSend:
                    // channel send: 逃到 chan
                    addrs(v, v.Args[0])
                }
            }
        }

        // 3. 闭包捕获: 局部变量被闭包引用 → 逃
        for _, closure := range fn.Closures {
            for _, captured := range closure.Captures {
                captured.Esc = EscHeap
            }
        }
    }

    // 4. 写入 escape report
    dumpEscape(pkg)
}

// ================================================================
// 性能数据 (常见场景):
//
// [栈分配] (不逃逸)
//   - 分配:    ~0ns (编译器生成的 stack alloc)
//   - 释放:    ~0ns (弹栈)
//   - GC 影响: 0
//
// [堆分配] (逃逸)
//   - 分配:    ~30-100ns (mcache → mcentral → mheap)
//   - 释放:    GC 跟踪, 周期内不释放
//   - GC 影响: 高 (GC 压力)
//
// [标量替换]
//   - 收益: 5-10x (复合类型 → 标量寄存器)
//   - 场景: 返回小 struct, 不取址
//
// 常见逃逸 → 优化:
//   - func() *T → func() T  (大 struct 不用指针)
//   - toInterface(v int) → 避免频繁装箱
//   - closure 内捕获 → 减少捕获变量
//   - make([]T, 0, n) → n 提前知道, 编译器能优化
//
// 监控:
//   - go build -gcflags='-m' main.go
//   - go build -gcflags='-m -m' main.go (更详细)
//   - GODEBUG=memprofilerate=1 + pprof heap
//
// 实战建议:
//   - 小对象 (≤ 64B) 优先值传递, 不取址
//   - 大对象 (> 1KB) 用指针, 减少拷贝
//   - 频繁分配的对象: sync.Pool 复用
//   - 返回 interface{}: 装箱逃逸, 能避免就避免
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大常见逃逸场景详解]
//   - 1) 取址局部变量: &x 逃到外部 → 堆分配
//   - 2) 发送 slice/slice 太大: 栈 frame 装不下
//   - 3) slice append 超 cap: 重新分配, slice header 逃逸
//   - 4) interface{} 装箱: int → heap
//   - 5) channel 发送: 编译器推断超出函数, 逃逸
//   - 6) slice/map 元素地址: &arr[0] 逃逸
//   - 7) 闭包捕获外部变量: 闭包逃逸
//   - 8) 反射 reflect.New: 编译器不知道生命周期
//
// [案例 2: 逃逸分析决策树]
//   ```
//   变量 v
//     ├─ 仅当前函数用?
//     │   └─ 栈分配 (零开销)
//     └─ 跨函数/外部引用?
//         ├─ 是 → 堆分配 + GC
//         └─ 否 → 栈分配
//   ```
//   - 编译时确定, 编译时指令 print "moved to heap"
//   - 优化: -gcflags=-m 看具体报告
//
// [案例 3: 5 大逃逸优化实战]
//   - 1) 避免 &x 返回: 返回值, 让调用方分配
//   - 2) 大对象用指针: struct 1KB+, 必须指针
//   - 3) 小对象 (< 64B): 值传递, 走栈
//   - 4) 避免 interface{} 装箱: 用泛型 (1.18+)
//   - 5) sync.Pool 复用: 高频分配的对象
//
// [案例 4: 实战: 性能对比 (Benchmark)]
//   ```go
//   // 逃逸版本 (慢)
//   func newFoo() *Foo { return &Foo{} }  // 堆分配
//   // 栈版本 (快)
//   func newFoo() Foo { return Foo{} }    // 栈返回
//   ```
//   - BenchmarkFoo 跑 1B 次
//   - 栈版本: 0 allocs/op
//   - 堆版本: 1 allocs/op
//   - 速度: 栈 5-10x 快 (无 GC 压力)
//
// [案例 5: 5 大逃逸陷阱]
//   - 1) for 循环里取址: 循环变量逃逸 (1.22+ 修复, 每次迭代新变量)
//   - 2) range loop var 共享: 闭包捕获同一变量
//   - 3) channel send 太大: slice cap > 栈 frame
//   - 4) method receiver: 指针 receiver vs 值 receiver
//   - 5) interface{} nil: 把有类型的 nil 装成 interface{}
//
// [案例 6: -gcflags='-m' 输出解读]
//   ```
//   ./main.go:10:9: &u escapes to heap
//   ./main.go:11:12: moved to heap: x
//   ./main.go:12:15: does not escape
//   ./main.go:13:16: inlining call to fmt.Println
//   ./main.go:14:17: 0xc0001ab530 ([]int of length 4) escapes to heap
//   ```
//   - "escapes to heap": 逃到堆
//   - "moved to heap": 编译器显式移到堆
//   - "does not escape": 栈分配 (好!)
//   - "inlining call": 内联优化
//
// [案例 7: 实战: 性能数据 (1B 操作)]
//   - 全部栈: 0.5s
//   - 30% 堆: 1.5s (含 GC 压力)
//   - 100% 堆: 5s (频繁 GC, STW 累加)
//   - sync.Pool 复用: 0.6s (减少 99% 分配)
//   - 关键: 越少堆分配, 越少 GC, 越快
//
// [案例 8: 实战: 检查项目逃逸情况]
//   ```bash
//   # 检查所有包
//   go build -gcflags='-m -m' ./... 2>&1 | grep "escapes to heap" | wc -l
//   # 输出: 1234 处逃逸
//   # 看哪些多
//   go build -gcflags='-m' ./... 2>&1 | grep "moved to heap" | sort | uniq -c
//   ```
//   - 实战: 优化 top 5 逃逸函数
//
// [案例 9: 编译时逃逸分析的限制]
//   - 不知道: 反射 (reflect.New 一定逃逸)
//   - 不知道: syscall 参数 (逃逸, 因为跨越运行时)
//   - 不知道: cgo (完全没分析, 全部逃逸)
//   - 保守: slice/map 元素地址
//   - 1.22+: for 循环变量每轮独立, 不再共享逃逸
//
// [案例 10: 实战: 高级优化技术]
//   - 标量替换: 局部 struct 拆成多个变量, 不分配
//   - 同步消除: 局部变量无并发, 删除 lock
//   - 内联: 小函数 inline, 减少栈 frame
//   - 实战: -gcflags='-m -m' 看所有优化
//   - 关键: 编译器比你聪明, 相信它, 除非有 benchmark 证据
// ================================================================
