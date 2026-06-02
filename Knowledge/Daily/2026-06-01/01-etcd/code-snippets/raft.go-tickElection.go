// 来源: etcd raft/raft.go
// 作用: 选举计时器 — 用累加替代 goroutine ticker 触发选举
// 调用链: node.tick() → raft.tickElection() → Step(MsgHup) → becomeCandidate()
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么累加 (electionElapsed++) 而非 time.Ticker
//   - time.Ticker 需要独立 goroutine, 单测要 sleep 等待, 慢且不稳定
//   - 累加器: 单测直接 r.electionElapsed = 299, tick() 触发, 一行搞定
//   - 整个 etcd/raft 找不到 time.NewTicker(electionTimeout), 全用累加
//   - 副作用: 0 goroutine 泄露风险, 进程退出干净
//
// [WHY-2] 为什么 electionTimeout 随机化
//   - 多节点同时超时 → split vote → 谁也选不上 → 死循环
//   - 解决: 随机化, 典型 150-300ms (5 节点默认)
//   - 这就是 "牛羚效应" 的反义词: 大家都错开就不会撞
//   - 公式: random(electionTimeout, 2*electionTimeout)
//
// [WHY-3] 为什么用 MsgHup 而不是直接 becomeCandidate
//   - 所有状态转移必须经 Step() 统一入口
//   - 这样可重放: 把 MsgHup 序列化, 测试时 replay
//   - 也保证: term 处理 / log 检查 等公共逻辑不漏
//   - MsgHup 内部 From=自己, Term=0 (本地消息)
//
// [WHY-4] 选举超时后的处理流程
//   - electionElapsed = 0  (重置, 否则下一 tick 立刻又触发)
//   - Step(MsgHup): 进入候选状态 → 给自己投一票 → broadcast MsgVote
//   - 收到多数票 → becomeLeader → 立即 broadcast MsgApp (空 entry, 宣示权威)
//
// [WHY-5] 跟 tickHeartbeat 的对称
//   - 同样累加, 但行为相反: follower 累加 election, leader 累加 heartbeat
//   - leader 触发: 周期发 MsgApp (空日志) 维持权威
//   - follower 触发: 周期检查 electionTimeout
//   - 同一 tick() 函数分发, 状态决定
//
// [WHY-6] tickElection vs tickHeartbeat 的精妙对称
//   - tickElection 在 Follower/Candidate 状态被调
//   - tickHeartbeat 只在 Leader 状态被调
//   - 同一个 raft.tick() 函数根据 state 字段分发
//   - Leader 不会触发 election (自己就是), Follower 不会触发 heartbeat
//   - 这是 Raft 状态机最简洁的设计之一
//
// [WHY-7] electionElapsed 重置的隐藏陷阱
//   - 重置发生在 "触发" 之后, 不是 "判断" 之后
//   - 这意味着 electionElapsed = 0 是在 r.Step() 之前执行
//   - 重置后下一次 tick 累加到新 electionTimeout 才再触发
//   - 错误写法: 累加到 timeout 后不重置 → 下一 tick 立即又选 → 选战风暴
// ================================================================

func (r *raft) tickElection() {
    // [WHY-1] 累加, 不开 goroutine
    r.electionElapsed++

    // [WHY-4] 触发选举条件: 累加到随机 electionTimeout (150-300ms)
    if r.electionElapsed >= r.electionTimeout {
        // [WHY-7] 触发后立即重置, 避免下 tick 立即又触发
        r.electionElapsed = 0

        // [WHY-3] 所有状态转移经 Step 统一入口
        // MsgHup = 本地消息, term=0, From=自己
        r.Step(pb.Message{
            From: r.id,
            Type: pb.MsgHup,
        })
        // 内部状态机接着会:
        //   1. becomeCandidate() (term++, 投自己, 记录 voteFor=自己)
        //   2. bcastVote() (发 MsgVote 给所有 peer)
        //   3. 等 MsgVoteResp, 收多数 → becomeLeader
        //   4. 收不到多数 + 收到同 term App → stepDown
    }
}

// === 对照: tickHeartbeat (leader 用) ===
// func (r *raft) tickHeartbeat() {
//     r.heartbeatElapsed++
//     if r.heartbeatElapsed >= r.heartbeatTimeout {
//         r.heartbeatElapsed = 0
//         r.Step(pb.Message{From: r.id, Type: pb.MsgBeat})
//         // 内部: bcastHeartbeat() 给所有 follower 发 MsgHeartbeat
//     }
// }

// ================================================================
// 性能与正确性数据:
//
// [electionTimeout 配置]
//   - 1ms: 选得快, 但易 split vote, 易误判 (网络抖动)
//   - 100ms: 折中 (默认)
//   - 1000ms: 选得慢, 故障恢复久
//   - 公式: electionTimeout >> RTT (跨节点 ping 时间)
//   - 经验: electionTimeout = 10 * RTT (单数据中心 1ms RTT → 100ms election)
//
// [为什么是 5 节点 + electionTimeout=100ms 的常见配置]
//   - 5 节点容忍 2 故障 (3 票即多数派)
//   - 100ms 在 RTT < 10ms 的内网是合理值
//   - K8s 默认 1000ms 是因为它跨 AZ, RTT 较大
//   - 跨地域: electionTimeout=3000ms, 否则选不上
//
// [PreVote 改进 (v3.4+)]
//   - 问题: 节点 A 网络分区 5 分钟恢复, term=100
//   - A 立刻发起选举, term=101, 但 log 太旧
//   - 其他节点会投, 然后 A 选上后强制覆盖, 数据丢
//   - 解决: A 先发 MsgPreVote (term 不变), 多数派同意后, term 才++ → 真实选举
//   - 代价: 多 1 RTT, 但避免 term 风暴
//
// [CheckQuorum 机制 (Leader 自我验证)]
//   - Leader 在 electionTimeout 内未收到多数派响应
//   - 主动 stepDown, 触发新一轮选举
//   - 防止 "假 leader": 跟多数派断网但仍以为是 leader
//   - 默认 electionElapsed 跨 Leader/Follower 共用, 需注意
//
// [ReadIndex 优化 (v3.1+)]
//   - 业务读不走 raft, 走 lease + heartbeat
//   - Leader 在 lease 期内, 直接读本地 (linearizable)
//   - lease 过期 → ReadIndex 等一轮 heartbeat 确认仍是 leader → 读
//   - 读性能从 5-10ms 降到 0.5-2ms
//
// [tick 触发频率]
//   - node 主循环里, tickc channel 每 100ms (tickMs) 收到一次
//   - n.tick() 调 r.tick() → r.tickElection() 或 r.tickHeartbeat()
//   - 单线程, 一次 tick 推进 1 步
//
// [坑]
//   - r.electionTimeout 是 0 时永远不触发 (除 0 判定)
//   - 测试注入 timeout=0 会死循环, 注意: 测试要合理
//   - 必须 electionElapsed = 0 重置, 否则下一 tick 立刻又选
//   - PreVote 没启用, 网络抖动会 term 飙升
//   - 检查节点和 Leader 不在多数派时, 不能 stepDown (PreVote 保护)
//
// [测试技巧: 加速 1000x]
//   electionTimeout = 1 * time.Millisecond  // 测试用, 生产禁
//   - 单测里把 r.electionElapsed 直接设到 r.electionTimeout-1
//   - 一次 tick 就触发选举, 不用 sleep
//   - 这是 etcd/raft 整个 test/ 目录找不到 sleep 的原因
// ================================================================
// ================================================================
// 深度拓展: Random Timeout 的数学证明 + 选举风暴实战排查
//
// [为什么是 random(T, 2T) 而不是 random(0, T)]
//   - 选下界 T: timeout 太小, 一次网络抖动就误触发选举
//   - 选上界 2T: 是为 "错峰", 5 节点 lower bound 重叠概率 < 1%
//   - 数学: 5 节点各自 [T, 2T) 区间, 全部不重叠概率 P(no overlap) = (T/2)^4 / T^4 ≈ 1/16
//   - vs random(0, T) 重叠概率 ≈ 50%: 错峰 8x 改善
//   - 推论: 节点数 N 越大, 错峰越需要, electionTimeout 越大
//
// [3 节点 vs 5 节点 vs 7 节点的容错权衡]
//   - 3 节点: 容忍 1 故障, 多数派 = 2
//     风险: 1 节点 down 立刻选举, 1 节点网络分区立刻选举
//   - 5 节点: 容忍 2 故障, 多数派 = 3 (etcd 官方推荐)
//     平衡: 容错够用, election 频率合理
//   - 7 节点: 容忍 3 故障, 多数派 = 4
//     代价: 每次 write 多 1 RTT (要 4 个 ack), election 更慢
//
// [electionTimeout 与 RTT 的关系]
//   - 公式: electionTimeout >= 2 * max_RTT + processing_time
//   - 跨数据中心 (RTT 50ms): electionTimeout ≥ 200ms
//   - 同城多 AZ (RTT 5ms): electionTimeout ≥ 50ms
//   - 单 DC (RTT 1ms): electionTimeout ≥ 10ms (但通常设 100-1000ms 给 buffer)
//   - 跨地域: electionTimeout=3000ms+ 否则选不上
//
// [为什么 heartbeat = electionTimeout / 10]
//   - Leader 必须在 electionTimeout 内发够 heartbeat, 否则 Follower 触发选举
//   - heartbeat = electionTimeout / 10, 给 10 次重试
//   - 默认: electionTimeout=1000ms, heartbeat=100ms
//   - 实战: 监控 heartbeat 间隔, 抖动大要调大 electionTimeout
//
// [选举风暴 (Election Storm) 实战排查]
//   - 现象: 监控看到 leader 频繁切换, term 飙升
//   - 原因 1: electionTimeout 太小, 网络抖动误触发
//   - 原因 2: GC STW 太久 (Go 1.20 前), 100ms+ 卡住
//   - 原因 3: 磁盘 fsync 慢, apply 卡住, 心跳延迟
//   - 原因 4: 时钟漂移 (虚拟化环境), electionElapsed 错乱
//   - 解决: 1) 调大 electionTimeout 2) 升级 Go 1.22+ 3) 换 SSD 4) NTP 同步
//
// [对比: Paxos vs Raft 的选举机制]
//   - Paxos: 隐式 leader, 任何 proposer 都可发起, 冲突多
//   - Raft: 显式 leader + 强 term, 选举明确, 易理解
//   - 工程化: Raft 实现少 5-10x 代码量, 正确性更易证明
//   - 性能: 选举延迟 Paxos 略低 (少一跳), 但 Raft 心跳优化后追平
//
// [为什么不用 time.AfterFunc / Timer]
//   - Go 标准库 time.AfterFunc: 创建 Timer, 到期调函数
//   - 问题: 每个 raft node 1 个 Timer = 1 个 goroutine, 5 节点 5 goroutine
//   - 累加器: 0 goroutine, 复用 node tick loop
//   - 性能: 1000 节点 etcd 集群, Timer 模式占 1000 goroutine, 累加器占 0
//   - 测试: Timer 模式测试要 sleep, 累加器直接改字段 (本实现的精髓)
//
// [时序图: 5 节点完整选举过程]
//   t=0     Node A, B, C, D, E 都是 Follower, electionElapsed=0
//   t=10    Node A 累加到 100 (随机 T1), 触发 Step(MsgHup)
//   t=10    A 变 Candidate, term=2, 投自己, broadcast MsgVote(term=2)
//   t=11    B 收到 Vote, 检查 log up-to-date, 投 A (log[A]=log[B])
//   t=11    C 收到 Vote, 投 A
//   t=12    A 收到 3 票 (含自己), 多数派! becomeLeader
//   t=12    A broadcast MsgApp(空, term=2), D E 也收到
//   t=12    D 收到 App, stepDown, electionElapsed=0
//   t=12    E 收到 App, electionElapsed=0
//   t=20    选举完成 (latency ~10-20ms in 5 node LAN)
//
// [关键监控指标 (PromQL)]
//   - rate(etcd_server_leader_changes_seen_total[5m])  > 0: 选举频繁
//   - histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m])) > 0.01: fsync 慢
//   - rate(etcd_server_proposals_committed_total[5m]) == 0: 无 commit 卡死
//
// ================================================================
// 关联: 选举 → MsgVote → stepCandidate → becomeLeader → MsgApp → stepFollower.append
// 对比: tickElection 是 follower 视角, tickHeartbeat 是 leader 视角
// 上游: node.run() select case <-tickc → n.tick() → 状态分发
// 下游: Step(MsgHup) → becomeCandidate → bcastVote
// ================================================================
//
