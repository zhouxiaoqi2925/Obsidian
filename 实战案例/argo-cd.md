# argo-cd · 声明式 GitOps 控制器的多进程架构

**GitHub**: argoproj/argo-cd
**Star**: 19k+
**语言**: Go 96.5%
**主题**: GitOps / K8s Controller / gRPC 微服务 / 声明式调和 / CRD
**适用场景**: 持续交付控制器、GitOps 收敛、Multi-cluster 调度、ApplicationSet 模板分发

## 第一段：控制器与调和循环层

### 模式 1：单二进制 + 多 cobra 子命令路由器

**问题场景**：Argo CD 由 6 个独立服务组成（API Server / Application Controller / Repo Server / Commit Server / Notification / Dex）。每个服务独立打包需要维护 6 个镜像、6 份 K8s manifest、6 套 CI。运行时一个 Pod 只跑一个服务的"单镜像单进程"模式让部署繁琐。

**解决方案**：单二进制 + `os.Args[0]` basename + `ARGOCD_BINARY_NAME` env 双轨路由：
```go
binaryName := filepath.Base(os.Args[0])
if val := os.Getenv(binaryNameEnv); val != "" {
    binaryName = val
}
switch binaryName {
case common.CommandCLI:           command = cli.NewCommand()
case common.CommandServer:        command = apiserver.NewCommand()
case common.CommandRepoServer:    command = reposerver.NewCommand()
case common.CommandApplicationController: command = appcontroller.NewCommand()
// ... 11 个 case 分支
default:                          command = cli.NewCommand()  // "argocd-linux-amd64" 也走 CLI
}
```

**关键参数**：
- `ARGOCD_BINARY_NAME` env 兜底——容器里 `argv[0]` 是 `argocd` 而非子命令名
- 11 个 cobra case——cli/server/application-controller/repo-server/commit-server/dex/notification/cmp-server/applicationset-controller/git-ask-pass/k8s-auth
- default 走 CLI——让 `argocd-linux-amd64` 这种带后缀的二进制仍能跑
- `SilenceErrors`/`SilenceUsage`——CLI 工具不污染 plugin 错误输出
- `cli.NewDefaultPluginHandler().HandleCommandExecutionError`——保留 `*exec.ExitError` 的 ExitCode 透传

**最佳实践**：单一镜像多角色降低部署复杂度；`ARGOCD_BINARY_NAME` env 是容器内身份切换的范式；plugin 错误码透传是 CLI 工具的可观察性基础设施。

---

### 模式 2：6 个 workqueue 拆分 + per-feature rate limiter

**问题场景**：ApplicationController 一个 workqueue 同时承载"周期刷新"、"用户主动 sync"、"AppProject 变更"、"Hydration subtask"——4 类操作的紧急度差异巨大（用户 sync 必须低延迟，周期刷新 3 分钟一次也 OK），统一 rate limit 丢失"紧急度"语义。

**解决方案**：拆 6 个 `workqueue.TypedRateLimitingInterface[string]`，每个独立 rate limiter：
```go
ctrl.appRefreshQueue = workqueue.NewTypedRateLimitingQueueWithConfig(
    workqueue.NewCustomAppControllerRateLimiter("appRefreshQueue"),
    workqueue.RateLimitingQueueConfig{Name: "appRefreshQueue"})
ctrl.appOperationQueue = workqueue.NewTypedRateLimitingQueueWithConfig(
    workqueue.NewCustomAppControllerRateLimiter("appOperationQueue"),
    workqueue.RateLimitingQueueConfig{Name: "appOperationQueue"})
ctrl.projectRefreshQueue = ...
ctrl.appHydrateQueue = ...
ctrl.hydrationQueue = ...
ctrl.appComparisonTypeRefreshQueue = ...
```

**关键参数**：
- `workqueue.RateLimitingQueueConfig{Name: ...}`——k8s.io/apimachinery 0.30+ 要求显式命名
- 命名后 Prometheus metrics 端能区分"哪个 queue backpressure"
- 6 类 queue 对应 6 类 lifecycle：appRefresh 周期触发、appOperation 用户 sync、projectRefresh AppProject 变更、appHydrate v3 新增、hydrationQueue 内部 subtask、appComparisonTypeRefreshQueue 自定义比较
- 各自 rate limiter 独立配置——`appOperationQueue` 给低延迟、`appRefreshQueue` 给高容忍

**最佳实践**：controller 模式按"操作类型"拆 queue——紧急度做进 queue 名；显式命名 queue——metrics 端可观测性；`TypedRateLimitingInterface[string]` 走新泛型 API——类型安全。

---

### 模式 3：Live State Cache 双轨 watch+list 防漏事件

**问题场景**：K8s client-go 单一 watch 长连接会"漏事件"（API server 重启 / etcd 压缩 / 网络抖动）；单一 list 是"瞬时快照"无法感知变化。`Application` 状态需要"实时跟随集群实际状态"。

**解决方案**：`resync 12h` + `watch 10min 重启` 双轨：
```go
const clusterCacheWatchResyncDuration = 10 * time.Minute
// LiveStateCache 构造
cache, err := cache.NewLiveStateCache(...)
// 内部: list 初始全量 + watch 10min 后重启
```

**关键参数**：
- `resync 12h`——全量 list 每 12h 一次防丢事件
- `watch 10min`——单次 watch 10min 重连防连接老化
- 注释："list 初始 + 短 watch 周期 防止长 watch 漏事件又防止 watch connection 老化"
- 双轨 = "周期 list 兜底" + "watch 实时"
- 与 K8s SharedInformer 兼容——`HasSynced()` 信号

**最佳实践**：list+watch 双轨是 K8s client-go 防漏事件的标准范式；10min watch 重连是"经验值"；`HasSynced()` 必须等——否则启动期 race。

---

### 模式 4：syncid.Generate 串行化并发 sync

**问题场景**：同一 Application 的 2 个 sync 并发触发——race condition 撕裂 service；2 个不同 Application 共享 1 个 K8s 资源（共享 Service）——同样撕裂。

**解决方案**：`syncid.Generate()` 全局唯一 ID 串行化 + `FailOnSharedResource` 校验：
```go
syncId, err := syncid.Generate()  // 行 102 关键：防并发
if isBlocked, err := syncWindowPreventsSync(...); isBlocked { return ... }
compareResult, err := m.CompareAppState(...)
// 行 156 FailOnSharedResource=true
if HasOption("FailOnSharedResource=true") { /* 校验 */ }
```

**关键参数**：
- `syncid.Generate()` 全局唯一——controller 内部用 ID 串行化
- `FailOnSharedResource=true`——两个 Application 不能控制同一资源
- `syncWindowPreventsSync`——运维可设"周一至周五 9-18 才允许 deploy"
- 校验失败直接 return——fail-fast 不入 reconcile
- `isMultiSourceSync`——多 source（git+helm 混合）走特殊路径

**最佳实践**：并发控制用 ID 串行化——简单可靠；`FailOnSharedResource` 是"防多控一"的工程答案；`syncWindow` 把"运维策略"做进控制器层。

---

### 模式 5：Hydrator 模式实现双向 GitOps 闭环

**问题场景**：传统 Argo CD 是"单向"——Git → 集群。用户想"集群变更反馈回 Git"（H/A 模式 Hydrate-Apply）需要新机制。v3 新增 Hydrator 把"Git → 内部 repo → K8s"扩展为"Git → 内部 repo → K8s + 内部 repo → Git 反馈"。

**解决方案**：条件构造 + 独立 Commit Server：
```go
if hydratorEnabled {
    ctrl.hydrator = hydrator.NewHydrator(...)
}
```

`argocd-commit-server` 是新拆的二进制，gRPC 推回 Git。

**关键参数**：
- `hydratorEnabled` flag——关闭时跳过构造，节省 informer 启动开销
- `argocd-commit-server` 独立二进制——gRPC 推 Git
- 流程：Git 拉取 → 渲染 → Apply → 集群状态 → Commit Server 反馈回 Git
- HAS（Hydrate-Apply-Sync）三阶段
- v3.0 引入——业界首个真正双向 GitOps

**最佳实践**：实验功能条件构造——关闭时零开销；拆 commit-server 独立二进制——故障隔离；HAS 三阶段是 GitOps 闭环的工程答案。

---

## 第二段：渲染与微服务化层

### 模式 6：Service struct 13 字段重型服务状态拆分

**问题场景**：Repo Server 是 Argo CD 最重型的服务——拉 git、跑 helm、跑 kustomize、缓存 manifest、防 symlink 攻击。单 struct 字段过少无法表达多关注点；过多又成"上帝类"。

**解决方案**：13 字段按"关注点"分组：
```go
type Service struct {
    gitCredsStore                credentials.GitCredsStore
    rootDir                       string
    gitRepoPaths                  *utilio.TempPaths  // 自研 temp dir 抽象
    chartPaths                    *utilio.TempPaths
    ociPaths                      *utilio.TempPaths
    repoLock                      *utilio.KeyLock     // per-repo 互斥
    parallelismLimitSemaphore     chan struct{}       // 全局并发上限
    cache                         *cache.Cache
    symlinksState                 *gocache.Cache      // 12h 防 symlink 攻击
    // ...
}
```

**关键参数**：
- `gitCredsStore` 凭据——单独关注点
- `rootDir` + 3 个 `*utilio.TempPaths`——git/helm/oci 三个 source 各自 temp
- `repoLock` per-repo 互斥——防并发拉同一 repo lock file 冲突
- `parallelismLimitSemaphore`——全局并发上限（行 136）
- `symlinksState` gocache 12h TTL——防 symlink 攻击检测
- `utilio.TempPaths` 是 Argo CD 自研抽象——randomized 防 path 撞车

**最佳实践**：重型服务的 state 按"关注点"分字段；`utilio.TempPaths` 自研 randomized 路径——并发安全；`KeyLock` per-repo 比全局锁细粒度。

---

### 模式 7：utilio.KeyLock + Semaphore 双层并发控制

**问题场景**：Repo Server 全局并发上限 50（`clusterCacheListSemaphore = 50`）——超过会 OOM；但同 1 个 git repo 多个并发请求会触发 git lock file 冲突（`fatal: Unable to create '.git/index.lock': File exists`）。

**解决方案**：`KeyLock` per-repo 互斥 + 全局 Semaphore 双层：
```go
repoLock          = utilio.NewKeyLock()          // per-repo
parallelismLimit  = make(chan struct{}, 50)      // 全局
// 请求处理:
parallelismLimit <- struct{}{}                   // 1) 抢全局
defer func() { <-parallelismLimit }()
repoLock.Lock(repoURL)                           // 2) 抢 per-repo
defer repoLock.Unlock(repoURL)
```

**关键参数**：
- `KeyLock` per-repo 互斥——同 repo 串行、跨 repo 并行
- Semaphore 全局 50——IO bound（git pull + helm template）OOM 保护
- 注释："based on experiments"——50 是经验值
- 双层粒度：repo 内串行 / repo 间并行 / 全局上限
- 替代 worker pool——因为 manifest 生成是 IO bound 不是 CPU bound

**最佳实践**：双层锁 = per-key 细粒度 + 全局 Semaphore 粗粒度；Semaphore 50 是"经验值 + 监控调优"；IO bound 任务用 Semaphore 不用 worker pool。

---

### 模式 8：gRPC + Unary/Stream Interceptor Chain

**问题场景**：gRPC 服务可观测性差——没 Prometheus metrics、没 trace 串联、没 panic 拦截、没错误脱敏。手动在每个 handler 加重复样板。

**解决方案**：grpc.NewServer 时注册 4 个 unary + 4 个 stream interceptor：
```go
grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        logging.UnaryServerInterceptor(),
        recovery.UnaryServerInterceptor(),
        metrics.UnaryServerInterceptor(),
        errorsanitizer.UnaryServerInterceptor(),
    ),
    grpc.ChainStreamInterceptor(
        logging.StreamServerInterceptor(),
        recovery.StreamServerInterceptor(),
        metrics.StreamServerInterceptor(),
        errorsanitizer.StreamServerInterceptor(),
    ),
)
```

**关键参数**：
- `Chain*Interceptor` 顺序：logging → recovery → metrics → error sanitization
- 顺序决定执行流——recovery 必须早于 logging（panic 后 logging 还能记录）
- `otelgrpc.NewServerHandler` 注入 OpenTelemetry trace
- `metrics.AddMetricsTransportWrapper` 装饰 rest.Config——HTTP 层 metrics
- `errorsanitizer` 脱敏——生产不暴露内部 stack trace

**最佳实践**：4 个 interceptor 是 gRPC 微服务的标配；顺序关键：recovery 早于 logging、metrics 早于业务；`otelgrpc` 一行接 trace。

---

### 模式 9：utilio.TempPaths 自研 randomized 路径抽象

**问题场景**：多个 git clone 并发用 `/tmp/foo`——path 撞车；用 `os.MkdirTemp` 还得自己管理 cleanup；单层 TempDir 不区分 git/helm/oci 三种 source。

**解决方案**：自研 `utilio.TempPaths` 类型——`Get/randomized` + `Cleanup` 统一：
```go
type TempPaths struct {
    baseDir string
    paths   sync.Map
}
func (t *TempPaths) Get() string {
    id := uuid.New()
    p := filepath.Join(t.baseDir, id)
    t.paths.Store(id, p)
    return p
}
func (t *TempPaths) Cleanup() {
    t.paths.Range(func(k, v) bool {
        os.RemoveAll(v.(string))
        return true
    })
}
```

**关键参数**：
- UUID 路径——杜绝 path 撞车
- `sync.Map` 并发安全
- 区分 `gitRepoPaths / chartPaths / ociPaths`——三种 source 隔离
- `Cleanup` 一次清理——服务关闭时统一收尾
- 替代 stdlib `os.MkdirTemp`——更可控

**最佳实践**：UUID randomized 路径是"自研 TempDir 抽象"的核心；`sync.Map` 路径池并发安全；3 种 source 分 3 个 TempPaths——关注点隔离。

---

### 模式 10：Symlink 攻击防御 gocache 12h TTL

**问题场景**：Git repo 内含 `sensitive-config → /etc/secrets` symlink——Argo CD 渲染时把 `/etc/secrets` 读进 manifest，泄漏集群节点敏感文件。供应链投毒的真实路径。

**解决方案**：`symlinksState *gocache.Cache` 记录"已验证 symlink 集合"：
```go
symlinksState = gocache.New(12*time.Hour, 1*time.Hour)
// 渲染前：检查每个 symlink 是否"out-of-bounds"
if filepath.Clean(linkTarget) contains ".." || !within(rootDir) {
    return ErrSymlinkOutOfBounds
}
```

**关键参数**：
- 12h TTL 缓存——避免每次渲染都遍历
- 1h janitor 清理过期
- 检查"目标路径是否在 rootDir 内"——超出拒绝
- 注释里"防供应链投毒"——攻击场景明示
- 失败直接 reject 整个 repo——fail-fast

**最佳实践**：供应链安全的工程答案在细节层；gocache TTL + janitor 是"频繁检查的 set 状态"标准范式；fail-fast 不重试。

---

## 第三段：CRD 与声明式 API 层

### 模式 11：Application/AppProject/ApplicationSet 三 CRD 分层

**问题场景**：单一 CRD 承载"应用定义 + 项目权限 + 批量模板"——spec 字段爆炸难维护。`Application` 该管自己的"Git 源 + 目标集群"；`AppProject` 该管"哪些集群 + 谁能改"；`ApplicationSet` 该管"模板批量生成"。

**解决方案**：拆 3 个 CRD 各自独立：
```go
// Application: 单个应用
type ApplicationSpec struct {
    Source      ApplicationSource
    Destination ApplicationDestination
    SyncPolicy  *SyncPolicy
}
// AppProject: 命名空间 + 权限
type AppProjectSpec struct {
    SourceRepos    []string
    Destinations   []ApplicationDestination
    ClusterResourceWhitelist []metav1.GroupKind
}
// ApplicationSet: 模板批量
type ApplicationSetSpec struct {
    Template ApplicationTemplate
    Generators []ApplicationSetGenerator
}
```

**关键参数**：
- `Application` 是实例——指向 Git + 目标集群
- `AppProject` 是命名空间——RBAC、源仓库白名单、目标白名单
- `ApplicationSet` 是模板——`Generators` 模板（list/git/cluster/matrix）
- 三 CRD 各管一面——spec 不爆炸
- `Cluster` CRD 单列——管理多集群连接

**最佳实践**：CRD 拆分按"概念边界"——单实例 / 命名空间 / 模板 三个维度；spec 字段 < 50 是经验阈值；模板用 `Generators` 数组支持多种 source。

---

### 模式 12：ApplicationSet Generators 模板生成

**问题场景**：50 个 microservice 都用相同 Git 源 + 不同 cluster 部署——手写 50 个 Application 维护噩梦；CI 批量 create 又有竞态。

**解决方案**：`ApplicationSet` 配 `Generators` 列表——list / git / cluster / matrix / merge / scaffold 6 种：
```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
spec:
  generators:
    - list:
        elements:
          - cluster: dev
            url: https://dev.k8s.local
          - cluster: prod
            url: https://prod.k8s.local
  template:
    metadata:
      name: 'myapp-{{cluster}}'
    spec:
      source:
        repoURL: https://github.com/me/myapp
      destination:
        server: '{{url}}'
```

**关键参数**：
- 6 种 generator：list（静态）/ git（目录扫描）/ cluster（自动发现）/ matrix（笛卡尔积）/ merge（深合并）/ scaffold（gomplate）
- 模板用 `{{var}}` 渲染——同 Jinja2 语法
- ApplicationSet Controller watch generators——变化自动 reconcile
- `{{cluster}}` 模板变量是 generator 元素字段

**最佳实践**：批量配置用"模板 + generators"——比"循环脚本 + CLI create"可观察 10 倍；matrix generator 是笛卡尔积——适合"多源 × 多集群"；6 种 generator 覆盖 90% 场景。

---

### 模式 13：CRD 优先 + gRPC 旁路渲染双轨

**问题场景**：manifest 字符串是 10MB 级别——入 etcd CRD 字段会让 etcd 性能崩溃；但 Application 必须有"最终 manifest"快照供 sync 校验。

**解决方案**：CRD 只存"声明"（Git URL + 路径），manifest 渲染走 gRPC：
```go
// Controller 调 Repo Server 拿 manifest
manifests, err := repoClient.GenerateManifest(ctx, &repo.ManifestRequest{
    Repo:       app.Spec.Source.RepoURL,
    Revision:   app.Spec.Source.TargetRevision,
    Path:       app.Spec.Source.Path,
    AppName:    app.Name,
})
// 拿到的 manifests 不写回 CRD，只用于 CompareAppState
```

**关键参数**：
- CRD 字段：Git URL / Revision / Path / Cluster / Namespace——KB 级
- gRPC 拿 manifest：MB 级——不入 etcd
- 缓存层（`reposerver/cache`）——同 repo + 同 revision 命中
- 双轨代价：新人认知成本（CRD 看不到 manifest）
- 双轨收益：etcd 不爆 + 调和循环不被渲染阻塞

**最佳实践**：CRD 存"声明" + gRPC 拿"产物"是控制器的标准范式；manifest 缓存是性能关键；etcd 字段大小有 1MB 硬限——CRD 字段不能放 manifest。

---

### 模式 14：Cluster CRD + LiveStateCache 多集群管理

**问题场景**：100+ 目标 K8s 集群要 manage——连接凭据、CA、namespace 各异；每个 Application watch 自己的目标集群会建 100+ informer OOM。

**解决方案**：`Cluster` CRD 存连接 + `LiveStateCache` 集中 watch：
```go
type Cluster struct {
    metav1.TypeMeta
    metav1.ObjectMeta
    Spec ClusterSpec
    Status ClusterStatus
}
type ClusterSpec struct {
    Server          string
    Config          ClusterConfig  // CA / token
    Namespaces      []string
    Shard           *Shard
}
// LiveStateCache 给所有 Application 共享 watch
cache, _ := cache.NewLiveStateCache(cluster.Server, cluster.Config)
```

**关键参数**：
- `Cluster` CRD 是"集群连接资源"——K8s 资源可审计
- `Namespaces []string`——只 watch 白名单 ns 降负载
- `Shard *Shard`——一致性哈希分片
- `LiveStateCache` 复用——避免每个 App 单独建 informer
- 集中 watch + per-Cluster sync 是生产级方案

**最佳实践**：Cluster 抽成 CRD 是"配置即资源"；`Namespaces` 白名单——watch 范围可控；共享 LiveStateCache——避免 N×M informer 爆炸。

---

## 第四段：差异算法与状态收敛层

### 模式 15：DiffConfigBuilder 链式封装 11 参

**问题场景**：`DiffConfig` 11 个可选参数——`DiffSettings / Tracking / NoCache / Cache / Logger / GVKParser / StructuredMergeDiff / Manager / ServerSideDryRunner / ServerSideDiff / IgnoreMutationWebhook`。11 参构造函数爆炸。

**解决方案**：Builder 模式 + 11 个 `With*` 方法 + `Validate()` 强制 invariant：
```go
diffConfigBuilder := diff.NewDiffConfigBuilder().
    WithDiffSettings(...).
    WithTracking(appLabelKey, app.Spec.TrackingMethod).
    WithCache(argoCache, app.Name).
    WithNoCache().
    WithStructuredMergeDiff(serverSideDiff).
    WithServerSideDiff(serverSideDiff)
// ...
diffConfig, err := diffConfigBuilder.Build()  // 内部 Validate()
```

**关键参数**：
- 11 个 `With*` 方法——每个单一职责
- `Build()` 调 `Validate()` 强制 invariants：
  - `ignores/overrides` 不能 nil
  - `noCache=false` 时 `appName` + `stateCache` 必须有
  - `serverSideDiff=true` 时 `serverSideDryRunner` 必须有
- fail-fast——让 8 层调用链的 bug 在构造时炸出
- 链式 API 可读性 > 11 参构造函数

**最佳实践**：>5 个可选参数的 config 强制用 Builder；`Validate()` 在 `Build()` 内——fail-fast 不入业务；链式 + `With*` 命名比 `New(config)` 强。

---

### 模式 16：3-way merge diff + Server-Side Diff 双策略

**问题场景**：`kubectl apply` 局部字段 race 条件——3-way merge 是 K8s 1.16+ 默认；SSA（Server Side Apply）1.22+ 提供 `managedFields` 追踪。Argo CD 必须支持两套——老集群 (1.16) 走 3-way，新集群 (1.22+) 走 SSA。

**解决方案**：`StructuredMergeDiff` + `ServerSideDiff` 标志切换：
```go
diffConfig := diff.NewDiffConfigBuilder().
    WithStructuredMergeDiff(true).   // 3-way merge
    WithServerSideDiff(serverSideDiff) // SSA dry-run
    Build()
```

**关键参数**：
- 3-way merge：本地副本 + last-applied + live = patch
- SSA dry-run：K8s API server 算 diff，返回 `managedFields`
- 老集群 K8s 1.16-1.21 强制 3-way
- 新集群 1.22+ 可走 SSA——`serverSideDryRunner` 必填
- `IgnoreMutationWebhook` 绕过 webhook 误报

**最佳实践**：兼容老集群必须双策略；`serverSideDiff=true` 时 `serverSideDryRunner` 必填——`Validate()` 强制；`IgnoreMutationWebhook` 调试用——生产慎开。

---

### 模式 17：资源追踪 3 模式 + label 63 字符限制兜底

**问题场景**：Argo CD 用 `argocd.argoproj.io/instance` 标签标记"哪个资源被哪个 Application 拥有"——GC 的基础。K8s label 硬限 63 字符——`ApplicationName/Group/Kind/Namespace/Name` 5 元组超长就 truncate。

**解决方案**：`TrackingMethod` 枚举 + annotation 兜底：
```go
type TrackingMethod string
const (
    TrackingMethodLabel            TrackingMethod = ""
    TrackingMethodAnnotation       TrackingMethod = "annotation"
    TrackingMethodAnnotationAndLabel TrackingMethod = "annotation+label"
)
func IsOldTrackingMethod(m TrackingMethod) bool {
    return m == "" || m == TrackingMethodLabel
}
// 4 路 switch
switch app.Spec.TrackingMethod {
case TrackingMethodLabel: ...
case TrackingMethodAnnotationAndLabel: ...
case TrackingMethodAnnotation: ...
default: // fallback 走 annotation——避免不认识已有资源
    return annotation
}
```

**关键参数**：
- `Label` 模式 v1 默认（v1.0~v2.3）
- `Annotation` 模式 v2.4 引入——突破 63 字符
- `AnnotationAndLabel` 双写——同时支持两种读取
- default fallback 走 annotation——防灾难性"重新创建全部资源"
- `IsOldTrackingMethod` 检查 `""`/`"label"`——老用户自动迁移

**最佳实践**：label 63 字符硬限是血泪教训；annotation 兜底 = 灾难性场景的工程答案；default 走最安全路径——fallback 永不静默失败。

---

### 模式 18：SyncAppState 三道闸 syncId/syncWindow/sharedResource

**问题场景**：用户 sync 时 3 类并发问题：
1. 同一 App 多个 sync——race condition 撕裂 service
2. 运维设"周一至周五 9-18"窗口——周末 sync 拒绝
3. 2 个 App 控制同一 K8s 资源——共享资源 race

**解决方案**：`SyncAppState` 顺序三道闸：
```go
func SyncAppState(app, project, state) {
    syncId, err := syncid.Generate()  // 闸 1：串行化
    isBlocked, err := syncWindowPreventsSync(...)  // 闸 2：sync window
    compareResult, err := CompareAppState(...)
    if HasOption("FailOnSharedResource=true") {  // 闸 3：shared resource
        checkSharedResource(...)
    }
    // execute sync
}
```

**关键参数**：
- 闸 1 `syncid.Generate()`——全局唯一 ID 串行化
- 闸 2 `syncWindowPreventsSync`——运维策略注入
- 闸 3 `FailOnSharedResource`——多 App 控一资源拒绝
- 顺序：先 ID → 再窗口 → 再共享校验 → 才 Compare
- 失败直接 return——fail-fast 不入 reconcile

**最佳实践**：多道闸是 controller 的标准范式；顺序：基础校验 → 策略校验 → 业务校验；fail-fast 不重试。

---

### 模式 19：StateDiff() 命名约定 vs raw Diff

**问题场景**：内部命名混乱——`Diff` 函数该是"原始字节对比"还是"归一化后状态对比"？新人 5 分钟看不出区别。

**解决方案**：`State*` = 对比 + 归一化后状态，`Diff*` = raw bytes：
```go
// StateDiff 接受 live（集群）vs config（Git），返回 DiffResult
func (d *diffConfig) StateDiff(live, config *unstructured.Unstructured) (*DiffResult, error)
// 普通 Diff 是 raw bytes
func diffBytes(a, b []byte) []byte
```

**关键参数**：
- `StateDiff()` 走 normalizers（`util/argo/normalizers`）——`Normalize` 字段归一化
- 普通 `Diff` 是纯字节对比
- `DiffResult.Modified / Added / Removed` 三类结果
- 命名约定 `State*` = "状态对比 + 归一化"
- 文档直接说明命名约定——避免新人猜

**最佳实践**：命名约定 `State*` vs `Diff*` = 业务语义明示；`StateDiff` 走 normalizers 层——`Normalize` 字段归一化是关键；普通 `Diff` 走 raw bytes。

---

### 模式 20：ApplicationSet Controller watch generators + Hydrator 闭环

**问题场景**：`ApplicationSet` 模板生成器变化要"自动同步"——手动 reconcile 不可维护；`Hydrator` 模式需要"集群状态回写 Git"。

**解决方案**：ApplicationSet Controller watch generators + Hydrator 独立 commit-server：
```go
// ApplicationSet Controller
controllers.Watch(&sources.Kind{Type: &Cluster{}}, ...)
// Hydrator 走独立 commit-server
ctrl.hydrator = hydrator.NewHydrator(commitClient, repoClient, ...)
// 流程: Git → repo-server 渲染 → application-controller Apply → commit-server 回写 Git
```

**关键参数**：
- ApplicationSet watch generators——自动 reconcile
- `commit-server` 独立二进制——gRPC 推 Git
- 流程闭环：Git → 内部 repo → 集群 → 内部 repo → Git
- HAS（Hydrate-Apply-Sync）三阶段
- 与 v2 ApplicationSet 兼容——老 yaml 直接跑

**最佳实践**：watch generators = controller 模式的标准 reconcile；独立 commit-server 二进制——故障隔离；HAS 三阶段是 GitOps 闭环的工程答案。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | github.com/argoproj/argo-cd |
| 协议 | Apache-2.0 |
| 总文件 | 5 357 |
| 主语言 | Go 96.5% |
| 关键依赖 | client-go / apimachinery / Helm 3 SDK / kustomize v5 / go-git / OpenTelemetry |
| Star | 19k+ |
| 当前版本 | v3 master |
| 团队 | Intuit 起家 + CNCF 社区联合维护 |
| 关键里程碑 | v1.0 (2018) → v2.0 GA (2020) → v2.4 ApplicationSet (2021) → v2.6 Sync Phases (2022) → v3.0 Hydrator (2024) |
| 部署 | 6 大二进制 + CRD + Redis（HA 模式）|
