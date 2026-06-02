// 来源: kubernetes pkg/scheduler/scheduler.go
// 作用: 调度主循环 — 给 Pod 选 Node, filter + score 两阶段
// 调用链: NextPod → SchedulingCycle (filter + score) → selectHost → Binding (异步)
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么是 2 阶段 (filter + score)
//   - Filter (硬约束): 排除不满足条件的 Node (e.g. CPU 不够, 不亲和)
//   - Score (软约束): 给满足条件的 Node 打分 (e.g. 资源使用率均衡)
//   - 先 filter 再 score: 减少 score 计算量 (1w Node → 10 Node)
//   - Filter pass 0 个 = unschedulable, 走 Preemption 抢占
//
// [WHY-2] 调度框架 13 个扩展点
//   - PreFilter: 全局准备 (e.g. 解析 Volume)
//   - Filter: 排除不满足 Node
//   - PostFilter: 失败后处理 (Preemption)
//   - PreScore: 准备打分数据
//   - Score: 打分
//   - Reserve / Permit: 资源预留 (e.g. 抢占的"提名"机制)
//   - PreBind / Bind / PostBind: 绑定阶段
//   - Unreserve: 失败回滚
//   - 框架化 = 插件可插拔 (K8s 1.19+)
//
// [WHY-3] 为什么是异步 bind
//   - 同步 bind: scheduler 等 apiserver 写入 → 慢, 阻塞调度循环
//   - 异步 bind: scheduler 调 goroutine → 不阻塞, 1 个 scheduler 可同时调度 N 个 Pod
//   - 默认 16 个 bind worker
//   - 关键调度循环 (filter+score) 必须快, bind 是 IO 重的
//
// [WHY-4] Preemption (抢占)
//   - 高优 Pod 调度不上 → 找低优 Pod 抢占
//   - 步骤: 选 victim Pod → 检查 PDB (PodDisruptionBudget) → mark victim 为 NominatedForDeletion
//   - 高优 Pod 占坑 (Nominated), 等 victim 真的死掉 (grace period)
//   - 复杂: 避免"抢一个又抢一个"的链式反应
//
// [WHY-5] 调度缓存 (SchedulingCache)
//   - nodeInfoList: 每 Node 1 个, 存"已知 Pod + 可调度资源"
//   - podQueue: 待调度 Pod 优先队列
//   - snapshot: 调度当下快照, 防 mid-flight 状态变化
//   - informer 异步更新 cache, 调度读 snapshot
// ================================================================

func (sched *Scheduler) scheduleOne(ctx context.Context) {
    // === [WHY-1] 1. 从队列拿 Pod ===
    podInfo := sched.NextPod()
    if podInfo == nil {
        return
    }
    pod := podInfo.Pod

    // === 2. SchedulingCycle: filter (硬约束) ===
    // 调度框架: PreFilter → Filter → ...
    feasibleNodes, diagnosis, err := sched.findNodesThatFitPod(ctx, sched.handle, fwk, pod, ...)

    if len(feasibleNodes) == 0 {
        // === [WHY-4] 无合适 Node → 抢占 ===
        if sched.enablePreemption {
            _, preemptionStartTime := fwk.RunPostFilterPlugins(ctx, pod, feasibleNodes, ...)
        }
        return
    }

    // === 3. score 排序 (软约束) ===
    priorityList, err := sched.prioritizeNodes(ctx, fwk, pod, feasibleNodes)
    if err != nil { return }

    // === 4. 选 host (最高分) ===
    host, err := sched.selectHost(priorityList)

    // === [WHY-3] 5. 异步 bind (默认 16 worker) ===
    binding := &v1.Binding{
        ObjectMeta: metav1.ObjectMeta{Namespace: pod.Namespace, Name: pod.Name, UID: pod.UID},
        Target: v1.ObjectReference{
            APIVersion: "v1", Kind: "Node", Name: host,
        },
    }
    sched.bindAsync(binding)  // ← 异步, 不阻塞
}

// === findNodesThatFitPod: filter 阶段 (简化) ===
func (sched *Scheduler) findNodesThatFitPod(ctx, fwk, pod, ...) {
    allNodes, err := sched.snapshot.NodeInfos().List()
    if err != nil { return nil, err }

    feasibleNodes := []v1.Node{}
    diagnosis := framework.Diagnosis{}

    for _, nodeInfo := range allNodes {
        // 调度框架: PreFilter 准备 → Filter 排除
        status := fwk.RunFilterPlugins(ctx, pod, nodeInfo)
        if status.IsSuccess() {
            feasibleNodes = append(feasibleNodes, *nodeInfo.Node())
        }
    }
    return feasibleNodes, diagnosis, nil
}

// === prioritizeNodes: score 阶段 ===
func (sched *Scheduler) prioritizeNodes(ctx, fwk, pod, nodes) {
    scores := make(framework.NodeScoreList, len(nodes))

    // 并行打分
    errCh := parallelize.NewErrorChannel()
    fns := make([]func(), len(nodes))
    for i, n := range nodes {
        idx := i
        fns[idx] = func() {
            // PreScore → Score → NormalizeScore
            score, status := fwk.RunScorePlugins(ctx, pod, n.Name)
            scores[idx] = framework.NodeScore{Name: n.Name, Score: score}
        }
    }
    parallelize.Until(ctx, len(nodes), scoreUpdateDegree, fns, errCh)

    // 排序: 分数高优先
    sort.Slice(scores, func(i, j int) bool { return scores[i].Score > scores[j].Score })
    return scores, nil
}

// === bindAsync: 不阻塞, 投递到 binding 队列 ===
func (sched *Scheduler) bindAsync(binding *v1.Binding) {
    // 投到 binding 队列, 由 bindingCycle 异步调 apiserver Binding API
    // 失败: requeue, 调度器会再次选 host
}

// ================================================================
// 性能数据 (5000 Node 集群, 100 Pod/s 调度):
//
// [单 Pod 调度延迟]
//   - Filter (5000 Node × 5 插件): 50-100ms
//   - Score (5000 Node × 5 插件): 100-200ms
//   - SelectHost: < 1ms
//   - Bind (异步, 不计): 50-100ms
//   - 关键路径总: 150-300ms / Pod
//
// [并发度]
//   - 默认 profile_parallelism = 16
//   - 调优: --scheduler-name, --feature-gates
//
// [Preemption]
//   - 触发频率: 1% 调度
//   - 一次抢占: 100-500ms
//   - 复杂: 避免雪崩
//
// 关键点:
//   - scheduler snapshot: 调度当下冻结状态, 不被 mid-flight 改
//   - NominatedPods: 高优 Pod 占坑低优 Pod 资源
//   - 失败 requeue: 失败回 podQueue, 走 scheduler 重新调度
//   - SchedulingQueue: 优先级 + 公平 + 时延多维度
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: scheduler 5 大调度框架扩展点]
//   - PreEnqueue: 调度前, 1.27+
//   - EnqueueExtensions: 过滤入队
//   - PreFilter: filter 前预处理
//   - Filter: 硬约束 (资源/亲和性)
//   - PostFilter: 过滤失败兜底 (抢占)
//   - PreScore: 算分前准备
//   - Score: 软约束 (打分)
//   - Reserve: 预留资源 (类似乐观锁)
//   - Permit: 等待批准 (gang scheduling)
//   - PreBind: 绑定前 (卷挂载)
//   - Bind: 实际绑定
//   - PostBind: 绑定后清理
//
// [案例 2: scheduler 内部 5 阶段]
//   - 1) SchedulingQueue 排队 (优先级/公平)
//   - 2) Preempt 抢占 (高优 Pod 抢低优)
//   - 3) Permit 等待 (gang scheduling)
//   - 4) Reserve 资源预留
//   - 5) Bind 绑定 (apiserver patch)
//
// [案例 3: 默认调度器打分插件 (1.27)]
//   - NodeResourcesFit: 资源 (CPU/内存) LeastAllocated / BalancedAllocation
//   - NodeAffinity: 节点亲和性 (required/ preferred)
//   - PodTopologySpread: 拓扑分布 (zone / node)
//   - InterPodAffinity: Pod 间亲和/反亲和
//   - NodeName: 指定节点
//   - NodeUnschedulable: 跳过 unschedulable 节点
//   - ImageLocality: 镜像本地化
//   - TaintToleration: 容忍污点
//
// [案例 4: SchedulingQueue 内部 3 队列]
//   - activeQ: 活跃可调度 (heap, 优先级)
//   - podBackoffQ: 退避重试 (heap, 重试时间)
//   - unschedulableQ: 不可调度 (等事件唤醒)
//   - 调度器: 每 1s 从 activeQ 拿 1 个 Pod
//   - 公平: 同一 priority class 轮询, 防饿死
//
// [案例 5: 抢占机制实战]
//   - 高优 Pod 调度失败 → 触发抢占
//   - 找 victim: 低优 Pod (NominatedPods 标记)
//   - 步骤: PostFilter → Preempt → RemoveVictim → 重新调度
//   - 代价: 业务抖动 (被抢占的 Pod 重建)
//   - 实战: 慎用 PriorityClass, 高优 Pod 数量控制
//
// [案例 6: scheduling framework 实战例子]
//   ```
//   type MyPlugin struct{}
//   func (p *MyPlugin) Name() string { return "MyPlugin" }
//   func (p *MyPlugin) Score(...) {...}  // 打分
//   func (p *MyPlugin) Filter(...) {...} // 过滤
//   // 注册: scheduler config
//   ```
//   - 业务: 复杂调度 (GPU 共享, 拓扑感知)
//   - 替代: 自定义 scheduler 二进制, 但维护成本高
//
// [案例 7: 性能调优实战]
//   - percentageOfNodesToScore: 1.27+ 默认 100% (旧版 50%)
//     - 大集群: 调到 10-30% 加速调度
//     - 风险: 调度不优
//   - parallelism: 16 并发 Filter (1.27+)
//   - bindTimeoutSeconds: 默认 10s
//   - 监控: scheduler_schedule_attempts_total
//
// [案例 8: 调度延迟数据 (5k node 集群)]
//   - Filter 阶段: 1-10ms (5k 节点遍历)
//   - Score 阶段: 5-50ms (打分)
//   - Bind 阶段: 50-100ms (apiserver patch)
//   - 总调度延迟: 100-500ms
//   - 排队延迟: 0-10s (看堆积)
//
// [案例 9: 监控与告警 (kube-prometheus)]
//   - scheduler_pending_pods{queue="active"} > 100 告警
//   - scheduler_schedule_attempts_total{result="error"} 突增
//   - scheduler_e2e_scheduling_duration_seconds P99
//   - scheduler_binding_duration_seconds P99
//
// [案例 10: 多调度器共存 (coscheduling/gang)]
//   - schedulerName: 指定调度器
//   - coscheduling (volcano): PodGroup 整体调度
//   - 用途: 分布式训练 (1 个 job 多 Pod 必须同时起)
//   - 实战: gang scheduling 用 volcano / scheduler-plugins
// ================================================================
