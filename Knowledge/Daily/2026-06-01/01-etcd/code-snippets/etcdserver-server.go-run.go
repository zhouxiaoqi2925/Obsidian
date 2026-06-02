// 来源: etcd etcdserver/server.go:run
// 作用: etcdserver apply 循环 — 把 raft 已提交的日志应用到状态机
// 调用链: raft node.run() → Ready.CommitedEntries → applyWaitC → s.run() → applyEntries()
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] applyWaitC 是 buffered channel
//   - raft 提交速度可能 > apply 速度 (高峰时)
//   - buffered 让 raft 不阻塞
//   - 默认缓冲 1024, 满了 applyWaitC 阻塞, 触发 raft 限流
//   - 反压机制: apply 慢 → raft 慢 → 客户端慢, 整个链路过载保护
//
// [WHY-2] 为什么 snapshot + entries 在同一处应用
//   - Snapshot 是 entries 的压缩: 一帧 snapshot = 一批 entries 的结果
//   - 同一 apply 循环保证: snapshot 之后 entries 按顺序应用
//   - 不能 snapshot 在 apply 之后, 否则状态会 "回滚" 到 snapshot 时间点
//   - 顺序保证: 先 snapshot, 再 entries, 状态机线性推进
//
// [WHY-3] 为什么 apply 是单线程
//   - MVCC 状态机不是线程安全的 (BoltDB write tx 排他)
//   - 单线程 apply 保证: 状态机一致性, 无需复杂锁
//   - 副作用: apply 是性能瓶颈, 后续 etcd 会并发 apply (v3.5+ 实验)
//   - 性能代价: ~10k entries/s 上限, 8 核也跑不出 80k
//
// [WHY-4] 为什么 triggerSnapshot 在 apply 内
//   - snapshot 触发条件: apply 了多少条 entries 后
//   - 默认 --snapshot-count=100000 (10 万条 entries 一次 snapshot)
//   - 在 apply 完一次批量后判断, 避免阻塞主流程
//   - snapshot 本身是异步任务 (go s.snapshot())
//
// [WHY-5] stop 通道 + context
//   - 优雅退出: 收到 stop → 处理完当前 batch → 退出
//   - 不抢断正在 fsync 的 BoltDB tx
//   - 避免半写状态, 数据更安全
//   - 关键: 不在 apply 中途退出, 否则下次启动 replay 不一致
//
// [WHY-6] applyDoneC 的反馈链路
//   - 反馈 raft: "我处理到 commitIndex=X 了"
//   - raft 推进 commitIndex, 释放旧 entries
//   - 不反馈: raft 内存爆 (entries 永远不释放)
//   - 同步语义: applyDoneC 是 unbuffered, 确保 "真处理完" 才推进
//
// [WHY-7] applyWaitC vs Ready 通道的关系
//   - raft node 算好 Ready, 通过 readyc 给 etcdserver
//   - etcdserver 内部拆: CommittedEntries 进 applyWaitC, 其他 (msgs/entries/snapshot) 直接处理
//   - 拆分的理由: 落盘 (entries) + 广播 (msgs) 和 apply 是不同节奏
//   - 落盘/广播可以并发 (磁盘 + 网络并行)
//   - apply 必须单线程
// ================================================================

func (s *EtcdServer) run() {
    defer s.wg.Done()

    for {
        select {
        case apply := <-s.applyWaitC:
            // === [WHY-2] snapshot 先于 entries 应用 ===
            if apply.snapshot != nil {
                s.applySnapshot(&apply)
            }
            // === [WHY-3] 单线程应用 entries ===
            s.applyEntries(&apply)

            // === [WHY-4] 触发 snapshot 决策 ===
            // apply 是 1 批, 触发后不阻塞下一批
            s.triggerSnapshot(apply)

            // [WHY-6] 反馈 raft: 释放旧 entries
            select {
            case s.applyDoneC <- apply:
            case <-s.stop:
                return
            }

        case <-s.stop:
            // === [WHY-5] 优雅退出 ===
            // 处理完当前 batch 才退出
            return

        case <-s.done:
            return
        }
    }
}

// ================================================================
// apply 核心流程 (applyEntries 详解):
//
//   T0  apply := <-s.applyWaitC   (raft 提交的一批 entries)
//   T1  for _, e := range apply.Entries {
//   T2      // 反序列化 e.Data → Request (Put/Get/Range/Txn...)
//   T3      // 路由到对应 handler
//   T4      r := s.applyRequest(e, apply)
//   T5      // 写入结果到 result pipeline (返回给 client)
//   T6  }
//   T7  // 触发 watch 事件
//   T8  s.notify(apply.Entries...)
//   T9  // 反馈 raft
//   T10 s.applyDoneC <- apply
//
//   // 每次 apply 1 batch, 默认 1024 entries
//
// ================================================================
// 性能与正确性数据:
//
// [apply 吞吐]
//   - 单核: ~10k entries/s (BoltDB 写 fsync 限制)
//   - 8 核: 仍是 ~10k (apply 单线程)
//   - 后续优化: v3.5+ concurrent apply 16k-30k
//   - 上限: 取决于 fsync 延迟, NVMe ~50us, SATA SSD ~1ms
//
// [为什么 1 次 batch = 1 次 fsync]
//   - applyEntries 内部用 BoltDB BatchTx
//   - 1024 entries 攒一起 Commit → 1 次 fsync
//   - vs 每 entry 1 fsync: 性能差 1000x
//   - BatchTx 内部用 copy-on-write, fsync 1 次即可
//
// [为什么 triggerSnapshot 不阻塞]
//   - snapshot 是异步任务 (go s.snapshot())
//   - 触发条件判断 O(1), 立刻返回
//   - 真做 snapshot 在后台跑
//   - 副作用: snapshot 触发条件判断用 O(1), 不影响 apply 主路径
//
// [apply vs applyc 区别]
//   - applyc: 老接口, 走 s.apply() 通用方法
//   - applyWaitC: 新接口, 走 EtcdServer.run 主循环
//   - v3.4 后统一走 applyWaitC, applyc 废弃
//   - 性能差异: 旧接口无批量优化, 单条 fsync
//
// [notify 路径]
//   - applyEntries 完 → notify
//   - notify 内部: 给所有 watch channel 推事件
//   - watch 慢消费者: 内部用 buffered channel, 慢就丢, 不阻塞主流程
//   - 设计: 主流程绝不阻塞, 慢消费者自己负责
//
// [并发 apply 改造 (v3.5+)]
//   - 把 entries 拆 N 段, N 个 goroutine 并行 apply
//   - 关键: 按 key 范围分片, 避免冲突
//   - 性能: 16k-30k entries/s (3-5x 提升)
//   - 复杂度: 大量锁, 边界条件多
//   - 现状: 实验性, 默认未开
//
// [坑]
//   - applyWaitC 满了: raft 限流, 写入失败
//   - applyEntries panic: 整 etcd 进程崩 (设计如此, 数据一致性优先)
//   - snapshot 时机不对: 启动时间长, WAL replay 慢
//   - applyDoneC 不消费: raft 内存累积, 旧 entries 不释放
//   - 慢 watch consumer: 主流程不阻塞, 但内存涨
//   - BatchTx 太大: OOM (默认 2GB, --quota-backend-bytes)
//
// [上下游]
//   - 上游: raft node 的 readyc → s.applyWaitC
//   - 下游: BoltDB BatchTx, mvcc store, watch store
//   - 反馈: s.applyDoneC → raft node 推进 commitIndex
//   - 监控: etcd_server_apply_duration_seconds (P99 < 10ms 健康)
//
// [vs Kafka Controller / K8s API Server]
//   - Kafka Controller: 类似, 但用 KRaft 替代 ZK
//   - K8s API Server: 也是单线程 apply loop, watch 事件驱动
//   - 设计模式: "raft → apply loop → state machine" 是分布式系统通用范式
//
// [为什么不做并发 apply]
//   - 状态机本身是串行语义
//   - 并发 = 需要按 key 排序 = 性能开销可能 > 收益
//   - 真并发方案: 按 key range sharding, 但实现复杂
//   - 工程权衡: 单线程简单 + 90% 场景够用
// ================================================================
// 关联: EtcdServer.run 是 etcdserver 的核心循环, 类似 Kafka Controller / K8s API Server
// ================================================================
// 深度拓展: apply 瓶颈突破 + 监控告警实战
//
// [apply 是 etcd 性能瓶颈的原因 (8 核 16GB 测试)]
//   - 单线程: 1 个 goroutine 顺序处理 entries
//   - BoltDB BatchTx: 1024 entries 攒 1 次 fsync, ~1ms
//   - 业务: 10k entries/s 上限
//   - 多核浪费: 8 核 CPU, apply 用 1 核
//   - 监控: etcd_server_apply_duration_seconds P99 应 < 10ms
//
// [v3.5+ 并发 apply 改造详情]
//   - 把 entries 拆 N 段 (默认 N=4, 可调)
//   - N 个 goroutine 并行处理不冲突的 key 范围
//   - 关键: 按 key range sharding, 避免冲突
//   - 性能: 16k-30k entries/s (3-5x 提升)
//   - 复杂度: 大量锁, 边界条件多 (snapshot 中途切换, watch 一致性)
//   - 现状: 实验性, 默认未开 (--experimental-concurrent-applies)
//
// [BatchTx vs Tx 性能对比]
//   - BatchTx: 1024 entries 攒 1 次 fsync, ~1ms
//   - Tx:     每 entry 1 次 fsync, ~1ms × 1024 = 1024ms (1000x 慢!)
//   - 关键: BatchTx 内部 copy-on-write, fsync 1 次即可
//   - etcd 默认全用 BatchTx, 老接口 (applyc) 才用 Tx
//
// [apply 慢导致的级联故障]
//   - apply 慢 → applyDoneC 反馈慢 → raft 旧 entries 不释放 → 内存涨
//   - raft 内存涨 → Ready 计算慢 → 心跳延迟 → 触发选举
//   - 选举 → 心跳停顿 → 业务延迟雪崩
//   - 解决: 监控 apply P99 + raft 内存 + leader_changes 三件套
//
// [triggerSnapshot 时机详解]
//   - 默认 --snapshot-count=100000 (10 万条 entries 一次 snapshot)
//   - 触发后异步: go s.snapshot() 不阻塞
//   - 进程崩溃: 启动时 replay 慢, 但数据完整
//   - 实战: 太大 → replay 慢; 太小 → snapshot IO 频繁
//   - 调优公式: snapshot_count = 日均 entries / 期望 snapshot 次数
//
// [跟 K8s API Server 的对比]
//   - K8s: 1 个 watch + 多个 goroutine 并行处理, 但 final state 串行
//   - etcd apply: 严格单线程, 保证线性一致性
//   - 设计: etcd 优先正确, K8s 优先吞吐
//   - 工业: etcd 给 K8s 用, etcd 慢 → K8s 慢 → 整个集群崩
//
// [为什么不做并发 apply 的工程权衡]
//   - 状态机本身是串行语义
//   - 并发 = 需要按 key 排序 = 性能开销可能 > 收益
//   - 真并发方案: 按 key range sharding, 但实现复杂
//   - 工程: 单线程简单 + 90% 场景够用, 不贸然上并发
//
// [notify 路径的慢消费者保护]
//   - 慢 watch consumer: 内部用 buffered channel (默认 1024)
//   - 慢就丢, 不阻塞主流程
//   - 设计: 主流程绝不阻塞, 慢消费者自己负责
//   - 监控: watch_stream_dropped_total 持续增 → 有慢消费
//
// [apply 性能优化技巧]
//   - 1. 升级到 v3.5+, 启用并发 apply (--experimental-concurrent-applies)
//   - 2. 调大 --snapshot-count, 减少 snapshot 频率
//   - 3. 用 Range 代替 Get 循环 (单次 RPC)
//   - 4. 业务合并多次写为 1 次 Txn (1 fsync vs N fsync)
//   - 5. 升级硬件: NVMe SSD (fsync 50us) vs SATA (1ms) → 20x
//
// [apply vs applyc 区别 (老接口迁移)]
//   - applyc: 老接口, 走 s.apply() 通用方法, 单条 fsync
//   - applyWaitC: 新接口, 走 EtcdServer.run 主循环, 批量 fsync
//   - v3.4 后统一走 applyWaitC, applyc 废弃
//   - 性能: 新接口比老接口快 100x (批量 fsync)
//   - 监控: 看 etcd_server_apply_duration_seconds 区分
//
// [关键监控指标 (PromQL)]
//   - histogram_quantile(0.99, rate(etcd_server_apply_duration_seconds_bucket[5m]))  // P99 < 10ms 健康
//   - rate(etcd_server_proposals_committed_total[5m])   // 业务 QPS
//   - rate(etcd_server_proposals_applied_total[5m])     // 应用 QPS
//   - etcd_mvcc_db_total_size_in_bytes / 1e9  // DB 大小 GB
//
// ================================================================
// 关键: 单线程 apply = 数据一致性的命脉
// 设计: "raft 已 commit → apply 到 state machine" 是分布式系统通用范式
// ================================================================
//
