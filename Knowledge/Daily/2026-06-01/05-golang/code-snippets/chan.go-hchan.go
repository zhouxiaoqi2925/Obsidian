// 来源: golang src/runtime/chan.go:hchan + chansend + chanrecv
// 作用: channel 内部结构 + 阻塞交接机制
// 调用链: ch <- v → chansend → enqueue/sudog
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] hchan 内部结构: 环形缓冲 + 双向等待队列
//   - qcount: 当前缓冲中的数据数
//   - dataqsiz: 缓冲容量 (make(chan T, N) 的 N)
//   - buf: 环形数组指针, 起始地址 + 偏移定位
//   - sendx/recvx: 发送/接收索引 (环形, 取模)
//   - recvq/sendq: 等待队列 (sudog 双向链表)
//   - lock: 全局锁, 所有 channel 操作都先 lock
//   - 重要: 锁粒度 = channel, 多个 channel 操作可并行
//
// [WHY-2] 同步交接 (sudog): 阻塞时不走调度
//   - 有等待者时, 发送方直接把数据 copy 到接收方栈帧
//   - 调 goready(gp) 把 G 放回 P 的 LRQ, 立即可跑
//   - 避免了"send → park → scheduler → recv → wake"的 4 步
//   - 性能: 1 次 memcpy, ~50ns; 比调度快 100x
//
// [WHY-3] 无缓冲 vs 有缓冲的本质
//   - make(chan T)       (无缓冲): 必须 send+recv 同时就绪, 同步原语
//   - make(chan T, N)    (有缓冲): 缓冲满/空才阻塞, 异步队列
//   - 同步: 容量 0, sendq 必有消费者才不阻塞
//   - 异步: 容量 N, sendq 在 buffer 满时挂
//   - close: 关闭后 recv 立即拿到零值 + ok=false
//
// [WHY-4] select 多路复用: random case 防饥饿
//   - select 编译成 runtime.selectgo
//   - 所有 case 乱序遍历, 找第一个 ready
//   - 多个 ready 时, random 选一个 (避免某个 case 永远不被选)
//   - 全部阻塞 → 全部入等待队列, 任一就绪唤醒所有
//   - default: 全不 ready 立即执行 (非阻塞)
//
// [WHY-5] 性能陷阱
//   - 无缓冲 chan + 高并发: 频繁 park/unpark, 调度压力大
//   - 锁竞争: 多 goroutine send/recv 同一 chan, 锁是瓶颈
//   - close 已 close 的 chan: panic
//   - send 已 close 的 chan: panic
//   - nil chan 永远阻塞 (select 用法: 用 nil 屏蔽 case)
//   - 经验: 容量 = 期望峰值 / 4 ~ / 1, 太大浪费内存, 太小频繁阻塞
// ================================================================

// === hchan 结构 ===
type hchan struct {
    qcount   uint           // 当前数据数
    dataqsiz uint           // 容量 (环形 buf 大小)
    buf      unsafe.Pointer // 环形数组起始地址
    elemsize uint16         // 元素 size
    closed   uint32         // close 标志
    elemtype *_type         // 元素类型 (GC 跟踪)
    sendx    uint           // 发送索引 (环形)
    recvx    uint           // 接收索引
    recvq    waitq          // 等待接收的 G 队列
    sendq    waitq          // 等待发送的 G 队列
    lock     mutex          // 全局锁
}

// === chansend 发送 ===
// chan <- val
func chansend(c *hchan, ep unsafe.Pointer, block bool, callerpc uintptr) bool {
    if c == nil {
        // [WHY-5] nil chan 永远阻塞 (非 close)
        if !block { return false }
        gopark(nil, nil, waitReasonChanSendNilChan, traceEvGoStop, 2)
        throw("unreachable")
    }

    // 1. 快速路径: 无锁检查
    if !block && c.closed == 0 && ... {
        // 异步路径: 尝试直接 send
    }

    lock(&c.lock)  // 拿锁

    // [WHY-5] 2. closed 校验
    if c.closed != 0 {
        unlock(&c.lock)
        panic(plainError("send on closed channel"))
    }

    // [WHY-2] 3. 有等待接收者 → 直接交接 (memcpy)
    if sg := c.recvq.dequeue(); sg != nil {
        send(c, sg, ep)  // 直接 copy 到 sg.elem (接收者栈帧)
        unlock(&c.lock)
        return true
    }

    // 4. 缓冲未满 → 入缓冲
    if c.qcount < c.dataqsiz {
        qp := chanbuf(c, c.sendx)  // 算写入位置
        typedmemmove(c.elemtype, qp, ep)
        c.sendx++
        if c.sendx == c.dataqsiz { c.sendx = 0 }  // 环形
        c.qcount++
        unlock(&c.lock)
        return true
    }

    // 5. 缓冲满 + 不阻塞 → 失败
    if !block {
        unlock(&c.lock)
        return false
    }

    // 6. 阻塞: 把当前 G 挂到 sendq
    gp := getg()
    mysg := acquireSudog()
    mysg.elem = ep  // 发送的数据地址
    mysg.g = gp
    mysg.c = c
    gp.waiting = mysg
    c.sendq.enqueue(mysg)

    gopark(chanparkcommit, unsafe.Pointer(&c.lock), waitReasonChanSend, traceEvGoBlockSend, 2)

    // 被唤醒后, 校验是否被 close 中断
    if mysg != gp.waiting {
        throw("G waiting list is corrupted")
    }
    gp.waiting = nil
    gp.activeStackChans = false
    if closed := c.closed; closed != 0 {
        // 唤醒时已被 close, panic
        ...
    }
    releaseSudog(mysg)
    return true
}

// === send 同步交接 (核心优化) ===
func send(c *hchan, sg *sudog, ep unsafe.Pointer) {
    // sg 是接收方 G 的 sudog
    if sg.elem != nil {
        // 直接 memcpy 到接收方 elem (栈上!)
        sendDirect(c.elemtype, sg, ep)
        sg.elem = nil
    }
    gp := sg.g
    goready(gp, 4)  // 接收方 G 入 P 的 LRQ, 立即可跑
}

// === chanrecv 接收 ===
func chanrecv(c *hchan, ep unsafe.Pointer, block bool) (selected, received bool) {
    if c == nil {
        // nil chan 永远阻塞
        if !block { return }
        gopark(nil, nil, waitReasonChanRecvNilChan, traceEvGoStop, 2)
        throw("unreachable")
    }

    // 1. 快速路径: 无锁检查
    if !block && ... { return }

    lock(&c.lock)

    // 2. 有等待发送者 → 同步交接
    if sg := c.sendq.dequeue(); sg != nil {
        // 调用 recv, 同时可能 copy 缓冲给接收方
        recv(c, sg, ep)
        unlock(&c.lock)
        return true, true
    }

    // 3. 缓冲非空 → 出缓冲
    if c.qcount > 0 {
        qp := chanbuf(c, c.recvx)
        if ep != nil {
            typedmemmove(c.elemtype, ep, qp)
        }
        typedmemmove(c.elemtype, qp, nil)  // 清零 (GC)
        c.recvx++
        if c.recvx == c.dataqsiz { c.recvx = 0 }
        c.qcount--
        unlock(&c.lock)
        return true, true
    }

    // 4. closed + 空 → 零值
    if c.closed != 0 {
        if ep != nil {
            typedmemclear(c.elemtype, ep)
        }
        unlock(&c.lock)
        return true, false  // ok=false
    }

    // 5. 阻塞挂起
    if !block { ... }
    gopark(...)
    return true, true
}

// ================================================================
// 性能数据 (单 channel 100 goroutine producer/consumer):
//
// [无缓冲 + 同步交接]
//   - send:  ~80ns  (有等待者, memcpy)
//   - recv:  ~80ns
//   - 总:    ~160ns / 次
//
// [有缓冲 (cap=100) + 异步]
//   - send 缓冲未满: ~50ns  (入缓冲)
//   - send 缓冲满:   ~500ns (gopark + goready)
//   - recv 缓冲非空: ~50ns
//   - recv 缓冲空:   ~500ns
//
// [select 4 case 全 ready]
//   - 选一个: random, ~30ns
//
// 关键阈值:
//   - chan 容量经验: 期望峰值 / 4 (避免爆内存)
//   - select 4 case: 慢 2-3x (遍历)
//   - close: O(1), 唤醒所有等待 G, 各自处理零值
//
// 坑:
//   - 1 个 G 死锁: 1 个 chan 1 个 G send/recv, 永远阻塞
//   - 容量 0 vs 1: 容量 1 允许 1 个缓冲, 容量 0 强制同步
//   - 复制语义: chan 传值 = 拷贝, 传指针 = 共享 (有 race 风险)
//   - channel 性能: 比 sync.Mutex 慢 5-10x, 慎用
//
// 实战模式:
//   - 信号: chan struct{} (零内存信号)
//   - 取消: select + ctx.Done()
//   - 超时: select + time.After()
//   - 限流: chan + semaphore 模式 (make(chan struct{}, N))
//   - fan-out: 1 producer → N consumer
//   - fan-in:  N producer → 1 consumer (merge)
// ================================================================
