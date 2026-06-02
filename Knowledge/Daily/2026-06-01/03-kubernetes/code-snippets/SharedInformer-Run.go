// 来源: kubernetes client-go/tools/cache/shared_informer.go
// 作用: Informer 主循环 — List-Watch 模式 + 本地 cache + 事件分发
// 调用链: Informer.Run → Controller.Run → Reflector.ListAndWatch → DeltaFIFO → ProcessLoop → handler
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么用 List-Watch 模式
//   - List: 全量拿一次, 建立初始 cache (可能很大, 用分页)
//   - Watch: 持续订阅增量事件 (Added/Modified/Deleted)
//   - 客户端可靠: 断线重连后, ListAndWatch 重建状态
//   - 服务端省事: 不用"推送所有历史", 1 次 list + N 个 watch
//
// [WHY-2] 为什么本地要 cache
//   - 多个 controller 都 watch 同一资源: apiserver 不堪重负
//   - 本地 cache: 1 个 reflector + N 个 informer 共享
//   - 业务 Get 直接从 cache 拿 (lister), O(1) in-memory
//   - apiserver 只承担 1 路 watch 压力
//
// [WHY-3] DeltaFIFO 队列
//   - 入队: Deltas (多次 Add/Delete 都累积在 1 个 obj 上)
//   - 出队: 1 个 Deltas 整体弹出, 业务按事件类型处理
//   - 防丢: 同一 obj 多次 Add, 出队时都看得到 (idempotent 处理)
//   - 限流: pop 后等 ack (PROCESSED 标记) 才出下一个
//
// [WHY-4] Resync 周期重发
//   - 周期 (默认 10min): 重新把 cache 中所有 obj 加入 DeltaFIFO
//   - 业务 idempotent → 重发也无害
//   - 防 controller 漏事件 (e.g. controller 重启时错过)
//   - 兜底而非主路径, 正常靠 watch 事件
//
// [WHY-5] event handler 三入口
//   - OnAdd(obj): 首次入 cache, 业务注册
//   - OnUpdate(old, new): 变更, 注意是 old+new 不是 diff
//   - OnDelete(obj): 真实删除 (DEL 事件) 或 tombstone (本地被覆盖)
//   - tombstone: watch 中 obj 还在但本地 cache 被覆盖
// ================================================================

func (s *sharedIndexInformer) Run(stopCh <-chan struct{}) {
    defer utilruntime.HandleCrash()

    // === [WHY-2] DeltaFIFO + Indexers ===
    fifo := NewDeltaFIFOWithOptions(DeltaFIFOOptions{
        KnownObjects: s.indexer,  // 共享 indexer (thread-safe)
        EmitDeltaTypeReplaced: true,
    })
    cfg := &Config{
        Queue:            fifo,
        ListerWatcher:    s.listerWatcher,
        ObjectType:       s.objectType,
        FullResyncPeriod: s.resyncCheckPeriod,
        RetryOnError:     false,
        Process:          s.HandleDeltas,  // [WHY-5] 业务 handler
    }
    s.controller = New(cfg)

    // === 启动 controller (内部跑 Reflector + ProcessLoop) ===
    s.controller.Run(stopCh)
}

// === Reflector: ListAndWatch ===
func (r *Reflector) ListAndWatch(stopCh <-chan struct{}) error {
    // === [WHY-1] 1. List 全量 ===
    options := metav1.ListOptions{ResourceVersion: "0"}
    list, err := r.listerWatcher.List(options)
    if err != nil { return err }

    // 同步到 DeltaFIFO (Sync 事件)
    items := listMetaToItems(list)
    for _, item := range items {
        delta := Delta{Type: SyncDelta, Object: item}
        r.config.Queue.ReplaceDeltaOrAppend(delta)
    }
    // 记录最新 resourceVersion
    resourceVersion = list.GetResourceVersion()

    // === [WHY-1] 2. Watch 增量 ===
    for {
        // watch stream
        w, err := r.listerWatcher.Watch(options)
        for {
            select {
            case <-stopCh: return nil
            case event, ok := <-w.ResultChan():
                if !ok { break }  // 断线, 重新 ListAndWatch
                // 事件分类入 DeltaFIFO
                delta := Delta{
                    Type:   eventTypeToDeltaType(event.Type),  // Added/Modified/Deleted
                    Object: event.Object,
                }
                r.config.Queue.ReplaceDeltaOrAppend(delta)
            }
        }
    }
}

// === ProcessLoop: 出队 + 调 handler ===
func (s *sharedIndexInformer) HandleDeltas(obj interface{}) error {
    s.blockDeltas.Lock()
    defer s.blockDeltas.Unlock()

    for _, d := range obj.(Deltas) {  // [WHY-3] 1 个 obj 的所有 delta
        switch d.Type {
        case SyncDelta, AddedDelta:
            // 1. 写本地 cache
            s.indexer.Add(d.Object)
            // 2. 触发 OnAdd handler
            s.processor.distribute(addNotification{newObj: d.Object}, ...)
        case ModifiedDelta:
            s.indexer.Update(d.Object)
            s.processor.distribute(updateNotification{oldObj: d.OldObject, newObj: d.Object}, ...)
        case DeletedDelta:
            s.indexer.Delete(d.Object)
            s.processor.distribute(deleteNotification{oldObj: d.Object}, ...)
        }
    }
    return nil
}

// === eventHandler 业务侧模板 (e.g. Deployment Controller) ===
type DeploymentController struct {
    deploymentsLister appsv1listers.DeploymentLister
    deploymentsSynced cache.InformerSynced  // [WHY-4] resync 标志
    workqueue workqueue.RateLimitingInterface
}

func (c *DeploymentController) Add(obj interface{}) {
    key, _ := cache.MetaNamespaceKeyFunc(obj)
    c.workqueue.Add(key)
}
func (c *DeploymentController) Update(old, new interface{}) {
    key, _ := cache.MetaNamespaceKeyFunc(new)
    c.workqueue.Add(key)
}
func (c *DeploymentController) Delete(obj interface{}) {
    key, _ := cache.DeletionHandlingMetaNamespaceKeyFunc(obj)
    c.workqueue.Add(key)
}

// ================================================================
// 性能数据 (1000 Pod, 1 个 informer):
//
// [List 初次]
//   - 1000 Pod: 50-200ms (HTTP+JSON 解析)
//   - 10w Pod: 5-10s (需分页 + 大响应)
//
// [Watch 增量]
//   - 单次事件下发: < 10ms (HTTP streaming)
//   - 1000 事件/s: 10ms 延迟平均
//
// [Cache 命中率]
//   - Get from Lister: O(1) in-memory
//   - vs 每次 list apiserver: 100-1000x 加速
//
// 关键点:
//   - List 第一次用 ResourceVersion="0" 拿最新, watch 从这里接续
//   - watch 断线: apiserver 返回 410 Gone, Reflector 自动 ListAndWatch
//   - 本地 cache 持久化: apiserver 重启也不丢 (cache 自己 reload)
//   - controller-runtime 库封装了这些: 业务只写 Reconcile
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: Reflector 内部 ListAndWatch 详解]
//   - 1) List: GET /api/<group>/<version>/<resource>?limit=500
//   - 2) Set ResourceVersion = 最新
//   - 3) Watch: GET /api/...?watch=true&resourceVersion=<rv>
//   - 4) 处理事件: Added/Modified/Deleted
//   - 5) 断线: 410 Gone → 重新 ListAndWatch
//   - 6) Bookmarks: 定期 re-list 兜底, 防 watch 事件丢失
//
// [案例 2: 5 类 watch 事件处理]
//   - Added: Add to store, emit add event
//   - Modified: Update store, emit update event
//   - Deleted: Delete from store, emit delete event
//   - Bookmark: ResourceVersion 更新, 不改状态
//   - Error: 410 Gone → re-list
//
// [案例 3: DeltaFIFO 内部 4 步处理]
//   - 1) Replace/Add/Update/Delete/Sync 加入 delta 队列
//   - 2) Pop(): 弹 d.Key, 关联已知对象
//   - 3) processDeltas(): 处理所有 delta
//   - 4) Emit onChange(obj)
//   - 关键: dedup + 排序 (Sync 在最前)
//
// [案例 4: Indexer 实战 (本地索引)]
//   - index: 加速 lookup, 避免全扫
//   - API: index.AddIndexers(map[string]IndexFunc)
//   - 例: 按 namespace 索引 Pod
//   - 使用: indexer.ByIndex("namespace", "default")
//   - 实战: 业务查询多时建索引, 否则全 O(n) 扫
//
// [案例 5: SharedInformer 共享机制]
//   - 多 controller 共享 1 个 Reflector + 1 个 Store
//   - SharedIndexInformer: 公开 cache, controller 注册回调
//   - 1 个资源类型 1 个 informer (省 apiserver 压力)
//   - 实战: 不要每 controller 都起 informer
//
// [案例 6: 5 类 resync 实战]
//   - resyncPeriod: 默认 0 (不 resync)
//   - 设置 10h: 周期重新发 update 事件
//   - 用途: 业务希望"周期性 reconcile", 例如 status 更新
//   - 代价: 事件放大 1-2x
//   - 实战: 业务 reconcile 不需要 resync
//
// [案例 7: 实战: 自己写 informer (不用 client-go)]
//   ```go
//   client := kubernetes.NewForConfigOrDie(config)
//   lw := cache.NewListWatchFromClient(client.CoreV1().RESTClient(), "pods", "default", fields.Everything())
//   store, controller := cache.NewInformer(lw, &corev1.Pod{}, 0, cache.ResourceEventHandlerFuncs{
//       AddFunc:    func(obj interface{}) {...},
//       UpdateFunc: func(old, new interface{}) {...},
//       DeleteFunc: func(obj interface{}) {...},
//   })
//   go controller.Run(stopCh)
//   ```
//
// [案例 8: ListWatch 调优参数]
//   - ListPageSize: 默认 500, 大集群调 1000
//   - labelSelector: 过滤无关资源
//   - fieldSelector: status.phase=Running (只 watch Running Pod)
//   - 实战: 限定 namespace + labelSelector, 减少事件量
//
// [案例 9: 性能数据 (1w Pod 集群)]
//   - Reflector 启动 List 耗时: 1-5s
//   - Watch 事件吞吐: 1000/s (单 informer)
//   - 多个 informer: 1 个 resource 1 个, 不重复
//   - cache 内存: 1w Pod ≈ 50MB
//   - 监控: reflector_list_duration_seconds
//
// [案例 10: 实战: 调试 watch 断线]
//   - apiserver 重启 / 网络抖动 → watch 410 Gone
//   - 自动重新 ListAndWatch
//   - 监控: reflector_watch_duration_seconds
//   - 业务: 业务无感, 期间事件被 queue 缓存
//   - 实战: 监控 reflector_watch_errors_total
// ================================================================
