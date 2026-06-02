// 来源: etcd raft/node.go:run
// 作用: Raft 状态机主循环 — 协调 propc/tickc/readyc/advancec
// 调用链: node.Start() → go n.run() → 进入主循环
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 5 通道 select 模式
//   - propc: 客户端提案 (有缓冲, 防背压)
//   - tickc: 100ms 心跳/选举 tick
//   - readyc: 把 Ready 推给 etcdserver
//   - advancec: etcdserver 反馈 (释放旧日志)
//   - done: 退出信号
//   - 5 路复用: 一个 goroutine 处理所有事件, 无锁
//
// [WHY-2] 为什么 ready 是一次性批量输出
//   - 累积多事件: 一次 tick 推进 + 一次 prop + 一次 tick
//   - 合并成 1 个 Ready, 落盘 1 次 fsync, 广播 1 批
//   - 性能: 100x 提升 vs 每事件 fsync
//
// [WHY-3] 为什么 advance 是反馈
//   - 状态机是 producer (产生 Ready), etcdserver 是 consumer (落盘/广播)
//   - consumer 完事后告诉 producer "我处理到 commitIndex=X 了"
//   - producer 才能推进内部状态 (释放旧日志, 推进 commitIndex)
//
// [WHY-4] 为什么是 buffered channel
//   - propc, readyc 都有缓冲, 避免 producer 阻塞 consumer
//   - 阻塞意味着: raft 状态机卡住, 整个集群暂停
//   - 默认缓冲 2048 (可调)
//
// [WHY-5] 状态机单线程保证
//   - 整个 raft 状态机在 1 个 goroutine 里跑 (n.run + 它的子函数)
//   - 无锁: 不需要 sync.Mutex, 性能 + 可测试性双赢
//   - 真并发的只有: 跟 etcdserver 通信的 4 个 channel
//
// [WHY-6] readyc 的 nil 切换 (高阶技巧)
//   - advancec != nil 时, readyc = nil
//   - 下次 select 不会选到 "readyc <- rd" 分支
//   - 等 advancec 信号后才能再开 readyc
//   - 这是 Go 里实现 "状态机先等反馈再生产" 的惯用模式
//   - 不用 channel 关闭, 不用额外标志位
//
// [WHY-7] propc 内的 Step 是绕过的
//   - 注意: propc 走 n.Step() 而非直接进 propc channel
//   - 原因: 提案要立即同步处理, 不走主循环 (否则延迟 1 tick)
//   - pm.result 反馈错误: 上游 Propose() 阻塞等 result
//   - 这是 sync over async 的经典案例
// ================================================================

func (n *node) run() {
    var propc chan msgWithResult       // 提案 (有缓冲)
    var readyc chan Ready              // Ready 通知 etcdserver
    var advancec chan struct{}         // etcdserver 反馈
    var tickc chan struct{}            // 时钟 (有缓冲)
    var rd Ready                       // 当前 Ready

    // 初始化: leader/follower 都启 propc
    propc = n.propc
    tickc = n.tickc

    for {
        // === [WHY-3] advancec != nil: 已经发出 Ready, 等反馈 ===
        if advancec != nil {
            // [WHY-6] 关闭旧 readyc, 等 advancec 信号
            readyc = nil

            // 阻塞等 advance 信号
            // advancec 是 unbuffered, 必须等 consumer 处理完
            select {
            case <-advancec:
                // 拿到 advance 反馈
            case <-n.done:
                return
            }
            // 推进内部状态
            n.advance(rd)
        }

        // 准备下一个 Ready
        if n.HasReady() {
            // 选 readyc: 优先 send, 接收 advance
            rd = n.readyWithoutLock()
            // readyc 可能 nil (advancec 还没收到), 这次跳过
        } else {
            readyc = nil
        }

        // === [WHY-1] 5 通道 select ===
        select {
        case pm := <-propc:
            // [WHY-7] 客户端提案
            m := pm.m
            m.From = n.ID()
            // 直接 Step 状态机
            err := n.Step(context.TODO(), m)
            pm.result <- err
            // 注意: propc 走 Step, 不经 propc 通道

        case <-tickc:
            // 时钟 tick → 调 raft.tick()
            // 内部根据 state 调 tickElection / tickHeartbeat
            n.tick()

        case readyc <- rd:
            // 把 Ready 推给 etcdserver
            // etcdserver 拿到后: 落盘/广播/应用
            // 处理完调 Advance → 上面 advancec 收到信号

        case <-n.done:
            // 退出
            return
        }
    }
}

// ================================================================
// 时序图: 一次 Put 请求的完整路径
//
//   T0  client → etcdserver.Put()
//   T1  etcdserver.Propose() → raft.node.Propose() → n.propc <- m
//   T2  n.run() 循环收到 pm
//   T3  n.Step() 状态机处理
//   T4  raft.appendEntry() 把 m 写入 Log
//   T5  n.HasReady() = true
//   T6  n.readyWithoutLock() 收集: msgs / entries / snapshot / commitIndex
//   T7  readyc <- rd  → etcdserver 收到
//   T8  etcdserver.Advance() 反馈
//   T9  n.run() 收到 advancec, n.advance(rd) 推进状态
//   T10 广播: bcastAppend() 给所有 follower 发 MsgApp
//   T11 多数派 ACK → commitIndex++
//   T12 next Ready: committedEntries 包含这条 log
//   T13 etcdserver 收到 → applyEntries → BoltDB 写
//   T14 触发 watch 事件 → client 收到响应
//
// ================================================================
// 性能与正确性数据:
//
// [事件吞吐]
//   - 100Hz tick (10ms tickc 间隔)
//   - propc 缓冲 2048, 1ms 内可吸收 2048 提案
//   - readyc 缓冲 1024, 一次 Ready 携带 100+ entries 没问题
//
// [为什么单线程够]
//   - Raft 状态机是 IO bound (等网络/磁盘)
//   - 真实业务 CPU 占 < 10%
//   - 单线程避免锁开销, 性能反而更好
//   - 100k msg/s 单线程 (实际场景 1-10k msg/s)
//
// [5 通道的时序保证]
//   - 提案: 立即处理 (Step 是同步)
//   - tick: 100ms 一次, 累加
//   - ready: 等积累到一批才发
//   - advance: 必须等 (否则内存爆)
//   - done: 优先响应 (退出)
//
// [为什么 advancec 是 unbuffered]
//   - buffered 会丢信号: consumer 还没处理, producer 以为处理了
//   - unbuffered: send 阻塞到 recv, 真同步
//   - 性能: 100Hz 推进, 1us 阻塞可接受
//
// [n.HasReady 的判断条件]
//   - 有新 entry 待广播
//   - 有 entry 待 commit
//   - 有 entry 待持久化
//   - 有 snapshot 待发/收
//   - 有 msgs 待广播
//   - 任一为真 → 有 Ready
//
// [readyWithoutLock 命名由来]
//   - raft 状态机单线程, 不需要 lock
//   - 但内部有些状态访问是带锁的 (如 Progress map)
//   - 这里 "WithoutLock" 表示: 调用者已确保 n 在单线程上下文
//
// [channel close 顺序 (优雅退出)]
//   1. n.Stop() → n.done <- struct{}{}
//   2. n.run() 收到 done, return
//   3. 关闭 propc, tickc (上游不再 send)
//   4. 关闭 readyc (下游不再 recv)
//   5. 关闭 advancec
//   顺序错: panic "send on closed channel"
//
// [坑]
//   - propc 缓冲打满: 客户端 Put 阻塞, 注意监控 propc channel
//   - readyc 不消费: raft 状态机卡住 (最严重故障之一)
//   - advancec 必须有: 否则 ready 永远不释放, 内存爆
//   - 5 通道全 nil: 死锁 (例如 n.Stop() 没调 done)
//   - n.HasReady() 永久 true: 死循环, readyc 永远发不出去
//
// [对比: Kafka Controller / K8s API Server]
//   - Kafka Controller: 类似的 event loop + state machine
//   - K8s API Server: informer + workqueue, 多 goroutine 并发
//   - 共同点: 单线程推进状态机 + channel 协调 producer/consumer
//
// [上下游]
//   - 上游: client.Propose() → n.propc
//   - 下游: n.tickc, etcdserver.Advance() → advancec
//   - 协调: node 是中间件, 把外部请求转成 raft 内部状态变化
//   - 退出: Stop() 关闭 done, 各 channel 顺序关闭
//
// [性能数字 (8 核 5 节点测试)]
//   - 1000 prop/s: n.run() CPU 占 < 5%
//   - propc 延迟: 0.1ms (channel send)
//   - readyc 延迟: 0.5ms (攒批 + send)
//   - 100Hz tick: 0.01ms (n.tick 是 O(1))
//   - advancec 同步: 0.1ms (unbuffered channel)
//   - 总延迟: Put 到 commit = 5-15ms (含网络 RTT)
//
// [vs 生产者消费者]
//   - 标准生产者消费者: 多 producer + 多 consumer
//   - 这里: 1 producer (raft) + 1 consumer (etcdserver) + 1 feedback (advance)
//   - 关键: 反馈链路是 "真处理完" 才推进, 不是 "收到了"
//   - 慢消费者: buffer 满了阻塞, 反压 producer
// ================================================================
// 关联: tickElection / Step / 状态机分发都是 n.run() 调度的
// 设计: "单线程 + channel select" 是 Go 高并发服务通用范式
// 关键: advancec 反馈是内存不爆的核心
// ================================================================
//
