// 来源: kubernetes pkg/kubelet/kubelet.go (简化版)
// 作用: Kubelet syncLoop — 节点级核心循环, 单一 goroutine 调度多个事件源
// 调用链: NewKubelet → Run → syncLoop (死循环) → 各种 handler → CRI 调用
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么用单一 goroutine + 3 通道 select
//   - syncLoop 是 kubelet 核心, 串联多个事件源: pod 更新 / 周期 sync / 清理
//   - 不用多个 goroutine 各自处理, 避免竞态
//   - 单线程 = 可预测, 调试容易, 顺序明确
//
// [WHY-2] 为什么 3 通道各司其职
//   - kl.configCh: apiserver watch 来的 pod 变更 (Add/Update/Delete)
//   - kl.syncLoopCh: 1s 周期 ticker, 兜底"漏掉的事件" + 状态 sync
//   - housekeepingCh: 5s 周期, GC 失效 pod/容器/卷
//   - 3 通道独立 = 紧急事件立即响应, 周期任务不阻塞紧急
//
// [WHY-3] 为什么 pod 变更分 plegCh / configCh
//   - configCh: 来自 apiserver 的"权威" pod spec 变更
//   - plegCh (Pod Lifecycle Event Generator): 来自 CRI runtime 的"实际"状态变化
//   - 两者差异 = 需要 reconcile, syncPod 调谐
//   - 路径不同: plegCh 走 cache 实际状态, configCh 走 apiserver 期望状态
//
// [WHY-4] syncPod 是 reconcile 入口
//   - 输入: pod spec (期望) + 实际 pod status
//   - 输出: 调 CRI 启/停容器, 挂卷, 设网络
//   - 整个 K8s 节点 = 大循环 reconcile
//   - 失败要 idempotent 重试
//
// [WHY-5] housekeepingCh 兜底 GC
//   - 容器 OOM 死, pod 已 deleted, 但 cgroup 还在 → 清理
//   - 孤儿卷, 失效 image → 清理
//   - 防止 node 资源泄露
// ================================================================

func (kl *Kubelet) syncLoop(ctx context.Context, updates <-chan kubetypes.PodUpdate) {
    // 周期 sync ticker (1s 一次, 处理 plegCh + housekeeping)
    syncTicker := time.NewTicker(time.Second)
    defer syncTicker.Stop()
    // housekeeping 周期 ticker (5s 一次, 资源清理)
    housekeepingTicker := time.NewTicker(5 * time.Second)
    defer housekeepingTicker.Stop()
    // pleg 周期 ticker (1s 一次, 拉 runtime 实际状态)
    plegCh := kl.pleg.Watch()
    // configCh 转发 apiserver 来的 pod 变更
    // (真实实现是 from 外面 updates, 转发到 kl.configCh)

    for {
        select {
        // [WHY-2] 紧急: apiserver pod spec 变更
        case update := <-kl.configCh:
            switch update.Op {
            case kubetypes.ADD:
                kl.handlePodAdd(update.Pods)
            case kubetypes.UPDATE:
                kl.handlePodUpdate(update.Pods)
            case kubetypes.REMOVE:
                kl.handlePodRemove(update.Pods)
            case kubetypes.RECONCILE:
                kl.handlePodReconcile(update.Pods)
            }

        // [WHY-3] pleg: 来自 CRI runtime 的实际状态变化
        case <-plegCh:
            kl.syncLoopCh <- kubetypes.PodLifeCycleEvent{}

        // [WHY-2] 周期 sync: 1s 一次
        case <-syncTicker.C:
            kl.syncLoopCh <- kubetypes.SyncPod{}

        // [WHY-2] housekeeping: 5s 一次
        case <-housekeepingTicker.C:
            // 触发 GC: 失效 pod/容器/卷
            kl.runGarbageCollection()

        // syncLoopCh 是 kl 内部的事件分发
        case <-kl.syncLoopCh:
            // 1. 拉所有 pod (本地 cache)
            pods, err := kl.podManager.GetPods()
            // 2. 对每个 pod, 算"实际 vs 期望" 的 diff
            for _, pod := range pods {
                if !kl.podIsTerminated(pod) {
                    kl.syncPod(ctx, pod, syncPodOptions)  // [WHY-4] 真正 reconcile
                }
            }
        }
    }
}

// === syncPod 简化: 调 CRI 启/停容器 ===
func (kl *Kubelet) syncPod(ctx context.Context, pod *v1.Pod, opts syncPodOptions) {
    // 1. 算容器变更 (启/停/重启)
    podContainerChanges := kl.makePodContainerChanges(pod, opts)

    // 2. 启/停容器 (调 CRI)
    for _, c := range podContainerChanges.ContainersToStart {
        kl.containerRuntime.StartContainer(pod, c, ...)
    }
    for _, c := range podContainerChanges.ContainersToKill {
        kl.containerRuntime.KillContainer(pod, c.ID, ...)
    }

    // 3. 挂卷, 设网络
    kl.volumeManager.Reconcile(pod)
    kl.networkPlugin.SetUpPod(pod)

    // 4. 更新 status 写回 apiserver
    kl.statusManager.SetPodStatus(pod, status)
}

// ================================================================
// 性能数据 (1 个 Node, 100 Pod, 4 核 CPU):
//
// [周期 sync]
//   - 1s 1 次, 100 Pod: < 1ms
//   - 1w Pod: 5-10ms
//
// [Pod 启动延迟]
//   - configCh 收到 → 算 changes → 调 CRI: 100-300ms
//   - 容器内业务启动: 业务自己
//   - 总延迟: 200ms-5s
//
// [GC 周期]
//   - 5s 1 次, 扫 1w 失效容器: < 50ms
//   - 资源泄漏: 无 (有 GC 兜底)
//
// 关键点:
//   - kubelet 不存期望状态: 从 apiserver 拉, 本地 cache
//   - syncLoop 单线程, syncPod 也可重入
//   - 失败重试: syncPod 内部 AddRateLimited, 指数退避
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: kubelet 核心机制 5 件套]
//   - 1) PLEG (Pod Lifecycle Event Generator): 定期 ls /pod 沙箱, 比较状态
//   - 2) cAdvisor: 容器 metrics 收集 (CPU/内存/网络/磁盘)
//   - 3) DeviceManager: GPU/FPGA 等扩展资源
//   - 4) VolumeManager: 挂载/解挂 volume (CSI)
//   - 5) RuntimeManager: CRI 调用 (containerd / cri-o)
//
// [案例 2: syncLoopIteration 5 个子循环详解]
//   - 1) configCh: Pod 配置更新 (apiserver watch)
//   - 2) syncCh: 周期同步 (每 10s 兜底, 防 watch 漏)
//   - 3) houseKeepingCh: 清理 (孤儿 pod, GC, soft memory)
//   - 4) healthCheckCh: 探针结果 (liveness/readiness/startup)
//   - 5)PLEG relistCh: PLEG relist 周期事件
//
// [案例 3: PLEG relist 调优]
//   - relistPeriod: 1s (1.28+ 改 1s, 旧版 10s)
//   - 太长: 探针延迟, 节点压力感知慢
//   - 太短: ls /pod 频繁, cgroup 压力
//   - 监控: pleg_relist_duration_seconds, pleg_relist_interval
//
// [案例 4: Pod 启动生命周期]
//   - apiserver 创建 → etcd 持久化
//   - scheduler 调度 → 更新 nodeName
//   - kubelet 看到 → 调 CRI RunPodSandbox
//   - sandbox ready → 拉镜像 (imagefs)
//   - 启动容器 → readiness probe
//   - 1 个 Pod 启动: 通常 5-30s
//
// [案例 5: 资源管理 cgroup v2 vs v1]
//   - cgroup v1: 多个 hierarchy (cpu, memory, blkio, ...)
//   - cgroup v2: 统一 hierarchy, 1.25+ 默认
//   - kubelet --cgroups-per-qos: true (默认) 创 cgroup
//   - QoS class: Guaranteed / Burstable / BestEffort
//
// [案例 6: 节点心跳与驱逐]
//   - nodeStatusUpdateFrequency: 5s (kubelet 报心跳)
//   - node-monitor-grace-period: 40s (controller-manager 等)
//   - pod-eviction-timeout: 5min (5min 后驱逐)
//   - 节点压力: MemoryPressure / DiskPressure / PIDPressure
//   - 驱逐机制: 1.18+ graceful (先标记 NotReady, 等 30s)
//
// [案例 7: 镜像拉取策略实战]
//   - imagePullPolicy: Always / IfNotPresent / Never
//   - 默认: tag=latest → Always, 其他 → IfNotPresent
//   - 私有仓库: imagePullSecrets: [name]
//   - 加速: 配 image registries (中国常用 registry.cn-hangzhou.aliyuncs.com)
//   - 预拉: DaemonSet 预拉镜像, 加速节点启动
//
// [案例 8: 静态 Pod 实战]
//   - staticPodPath: /etc/kubernetes/manifests (默认)
//   - 启动: kubelet 监听目录, 自动创建 (k8s 不再管理)
//   - 用途: 控制平面 (etcd, kube-apiserver, etc.)
//   - 调试: 节点本地 docker ps | grep kube-apiserver
//
// [案例 9: kubelet 性能调优]
//   - maxPods: 110 (默认, 看节点规格)
//   - podsPerCore: 0 (不限)
//   - serializeImagePulls: true (默认, 避免并发拉镜像带宽打满)
//   - registryPullQPS: 5 (镜像仓库限流)
//   - registryBurst: 10
//   - evictionHard: 内存 100Mi / nodefs 10% 等
//
// [案例 10: kubelet 监控指标]
//   - kubelet_pleg_relist_duration_seconds
//   - kubelet_pod_start_duration_seconds (P50/P95/P99)
//   - kubelet_runtime_operations_total (CRI 调用次数)
//   - kubelet_working_set_memory_bytes
//   - kubelet_node_name (label)
//   - 关键: 节点上 kubelet cpu/内存 用量
// ================================================================
