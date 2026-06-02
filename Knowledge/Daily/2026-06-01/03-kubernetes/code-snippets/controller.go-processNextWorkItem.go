// 来源: kubernetes pkg/controller/controller.go
// 作用: Controller 队列消费 — workqueue + 失败重试的标准范式
// 调用链: Run → worker → processNextWorkItem → syncHandler (业务 reconcile) → forget/requeue
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么 Get/Done 包夹
//   - queue.Get() 阻塞取 1 个 key
//   - key 还在处理时, 后续同 key 入队会被 dedupe (等处理完才再处理)
//   - defer queue.Done(key) 释放, 允许下一次入队该 key
//   - 防 race: 处理中被删/改, 重新入队也安全
//
// [WHY-2] 为什么失败要 AddRateLimited
//   - 失败 → backoff (指数退避) + requeue
//   - 防 thundering herd: 业务挂时, 不会 1w pod 同时重试
//   - 退避上限: 默认 16 次后, 丢 metrics 但不再 requeue
//   - 业务恢复后, 新事件自然流入
//
// [WHY-3] 为什么成功要 Forget
//   - Forget 清零该 key 的失败计数
//   - 避免 "key 之前失败 5 次, 这次成功, 下次失败要等更久" 的尴尬
//   - 业务上: 成功 = 状态已就绪, 失败计数重置
//
// [WHY-4] 业务侧 reconcile 的纪律
//   - 必须 idempotent: 多次调结果一致
//   - 必须看资源当前状态, 不要"假设"是初始
//   - 失败要明确: error != nil → requeue
//   - 不要无限重试: 用 BackoffManager 限速
//
// [WHY-5] 为什么用 workqueue 而不是 channel
//   - channel: FIFO + 1 个消费者, dedupe 难
//   - workqueue: dedupe + 重试 + 限速 集一身
//   - 多消费者: 启 N 个 worker goroutine 共用 1 个 queue
//   - 标准化: 所有 controller 用同款, 学习成本低
// ================================================================

func (c *Controller) processNextWorkItem() bool {
    // === [WHY-1] Get 阻塞, Done 释放 ===
    key, quit := c.queue.Get()
    if quit {
        return false
    }
    defer c.queue.Done(key)  // 处理完才允许下次入队

    // === [WHY-4] 业务 reconcile (幂等) ===
    err := c.syncHandler(context.Background(), key)
    if err != nil {
        // === [WHY-2] 失败: 指数退避 + requeue ===
        // AddRateLimited 内部:
        //   attempts := queue.numRequeues(key)
        //   backoff := baseDelay * 2^attempts  (上限 maxDelay)
        //   之后 1ms / 2ms / 4ms / ... / 16s
        c.queue.AddRateLimited(key)

        // 可选: 区分 retryable / permanent
        // 不可重试错误 (e.g. 404): 不 requeue, 走 forget
        if !errors.IsRetryable(err) {
            c.queue.Forget(key)
        }
        return true
    }

    // === [WHY-3] 成功: 清零失败计数 ===
    c.queue.Forget(key)
    return true
}

// === 启 N 个 worker 并发处理 ===
func (c *Controller) Run(workers int, stopCh <-chan struct{}) {
    defer c.queue.ShutDown()
    for i := 0; i < workers; i++ {
        // === [WHY-5] 多 worker 共用 1 个 queue ===
        go wait.Until(c.runWorker, time.Second, stopCh)
    }
    <-stopCh
}

func (c *Controller) runWorker() {
    for c.processNextWorkItem() {}  // 死循环消费
}

// === 业务侧 reconcile 模板 (e.g. Deployment Controller) ===
func (c *Controller) syncDeployment(ctx context.Context, key string) error {
    namespace, name, _ := cache.SplitMetaNamespaceKey(key)
    deployment, err := c.deploymentsLister.Deployments(namespace).Get(name)
    if errors.IsNotFound(err) {
        // 已删除, GC 关联资源
        return nil
    }
    if err != nil { return err }

    // 1. 拿当前 RS 列表
    rsList, _ := c.replicaSetsLister.ReplicaSets(deployment.Namespace).List(labels.SelectorFromSet(deployment.Spec.Selector.MatchLabels))
    // 2. 算新 RS / 旧 RS
    newRS, oldRSs, _ := c.getNewReplicaSet(deployment, rsList)
    // 3. scale newRS
    scaled, err := c.scaleReplicaSet(ctx, newRS, deployment.Spec.Replicas)
    if err != nil { return err }  // 失败 requeue
    // 4. 缩 oldRS
    c.cleanupOldReplicaSets(ctx, oldRSs, deployment)
    return nil  // 成功
}

// === 入队: 来自 informer 事件 ===
func (c *Controller) onUpdate(old, new interface{}) {
    key, _ := cache.MetaNamespaceKeyFunc(new)
    c.queue.Add(key)  // 普通入队
}
func (c *Controller) onDelete(obj interface{}) {
    key, _ := cache.DeletionHandlingMetaNamespaceKeyFunc(obj)
    c.queue.Add(key)
}

// ================================================================
// 性能数据 (Deployment Controller, 1000 Deployment):
//
// [单次 reconcile 延迟]
//   - 小 Deployment (1 ReplicaSet, 3 Pod): 5-10ms
//   - 大 Deployment (10 RS, 100 Pod): 50-100ms
//
// [并发度]
//   - 默认 worker = 1
//   - 高负载可调: --concurrent-deployment-syncs=5
//
// [退避策略]
//   - baseDelay = 5ms
//   - maxDelay = 16s
//   - 16 次后: numRequeues > 16, 不再 requeue
//
// 关键点:
//   - reconcile 必须 idempotent: 多次调结果一致
//   - 不要在 reconcile 里"假设" 资源是初始: 必先 Get
//   - 失败要明确, 不要 panic
//   - 用 c.workqueue.AddRateLimited(err) 把错误也入队 (可选)
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 个 workqueue 调优参数]
//   - RateLimiter: NewDefaultControllerRateLimiter()
//     - BaseDelay: 5ms (首次失败重试延迟)
//     - MaxDelay: 1000s (1ms * 2^失败次数 上限)
//     - QPS: -1 (不限制)
//   - 实战: 调小 QPS 给 apiserver 减压, 设 QPS=10
//   - 监控: workqueue_adds_total, workqueue_retries_total
//
// [案例 2: reconcile idempotency 的 5 个实战要点]
//   - 1) Get 拿最新资源 (不要用 informer 缓存直接改)
//   - 2) Patch 而非 Update (避免冲突)
//   - 3) ResourceVersion 校验 (检测并发改)
//   - 4) Finalizer 保证删除完成 (异步清理资源)
//   - 5) OwnerReference 自动 GC (子资源随父资源删)
//
// [案例 3: 失败处理策略对比]
//   - transient error (网络): AddRateLimited(err) + 指数退避
//   - permanent error (参数错): 直接 drop, 不重试
//   - conflict (ResourceVersion): requeue 立即重试
//   - panic: defer recover, log + add back
//   - 实战: 用 errors.Is 检查特定错误类型
//
// [案例 4: leader election 实战]
//   - 多副本 controller 高可用, 1 个 leader 跑, 其他 standby
//   - 机制: lease 对象 (coordination.k8s.io/v1)
//   - leaseDuration: 15s, renewDeadline: 10s, retryPeriod: 2s
//   - leader 挂了, 15s 内 standby 抢
//   - 监控: leader_election_master_status
//
// [案例 5: 业务 controller 实战例子 (Deployment controller)]
//   ```
//   func (dc *DeploymentController) syncDeployment(key string) error {
//       // 1. Get Deployment
//       // 2. Get ReplicaSet (owned)
//       // 3. Get Pods (owned by RS)
//       // 4. 算期望 = spec.replicas
//       // 5. 算实际 = len(pods)
//       // 6. 调谐: create RS / scale RS / delete pod
//       // 7. Update status (Ready replicas 等)
//   }
//   ```
//   - syncPeriod: 10s 兜底
//   - 实际触发: watch event + add back
//
// [案例 6: 业务 controller 实战例子 (Node controller)]
//   - 节点心跳: node-monitor-period 5s, node-monitor-grace-period 40s
//   - NotReady 后 5min 驱逐 Pod
//   - pod-eviction-timeout: 5min
//   - RateLimited queue, 避免 apiserver 抖动放大
//
// [案例 7: controller 性能优化实战]
//   - informer cache: 本地读, 避免每 reconcile 都 Get
//   - 共享 informer: 多 controller 共享 (K8s 内置)
//   - workqueue 并发数: 业务可调, 默认 1
//   - 大集群: 设 worker 16+, 但小心 apiserver 限流
//
// [案例 8: 监控与告警 (kube-prometheus)]
//   - workqueue_depth{queue="<name>"} > 1000 持续 5min
//   - workqueue_queue_duration_seconds P99 > 1s
//   - workqueue_work_duration_seconds P99 > 10s (单次 reconcile 慢)
//   - 关键: 这个队列长 = reconcile 跟不上事件
//
// [案例 9: 实战: 写一个最简单的 custom controller]
//   ```
//   func main() {
//       mgr, _ := ctrl.NewManager(ctrl.GetConfigOrDie(), ctrl.Options{})
//       reconciler := &MyReconciler{Client: mgr.GetClient()}
//       ctrl.NewControllerManagedBy(mgr).
//           For(&myv1.MyCR{}).
//           Owns(&corev1.Pod{}).
//           Complete(reconciler)
//       mgr.Start(ctrl.SetupSignalHandler())
//   }
//   ```
//   - controller-runtime 库封装了所有样板
//
// [案例 10: controller vs operator 区别]
//   - controller: K8s 内置概念, watch K8s 资源, 调谐状态
//   - operator: 业务 controller + 领域知识 (CRD + status + 事件)
//   - 框架: kubebuilder / operator-sdk / controller-runtime
//   - 实战: 用 kubebuilder 生成骨架, 写 reconcile 业务逻辑
// ================================================================
