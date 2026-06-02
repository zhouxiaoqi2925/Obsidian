# Moby (dockerd) - 容器引擎的守护进程与运行时编排

**来源**：GitHub moby/moby
**创建时间**：2026-06-02

---

## 一、守护进程与启动：薄入口 + 厚编排

### 1. 39 行的 main 与 reexec 重入（Thin Entry）

**问题场景**：dockerd 是一个长生命周期 daemon，承担 container/image/network/volume/swarm 五大子域的协调；如果 main 写得臃肿（200+ 行），所有业务耦合在一处，启动期和升级期都难调试；而且 dockerd 需要一种"无新二进制即可切换执行模式"的机制（runc execdriver）。

**解决方案**：
```go
// cmd/dockerd/main.go 简化
func main() {
    if reexec.Init() {
        return  // 子进程已执行完 callback
    }
    ctx := context.Background()
    signal.Ignore(syscall.SIGPIPE)  // 防 journald 重启时崩溃
    _, stdout, stderr := term.StdStreams()
    r, err := command.NewDaemonRunner(stdout, stderr)
    if err := r.Run(ctx); err != nil {
        log.Fatal(err)
    }
}

// reexec 模式：os.Args[0] 改名后，Init() 查表调 callback
reexec.Register("docker-reexec", func() {
    // 进入容器 execdriver 路径
})
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `reexec.Init()` | 进程内"重入 main"，避免新二进制 |
| `signal.Ignore(SIGPIPE)` | 解决 systemd-journald 重启导致 dockerd 崩溃 |
| `command.NewDaemonRunner` | 把 IO 装入 CLI struct，main 保持纯净 |
| `context.Background()` | 顶级 ctx，由 `trap.Trap` 在 SIGTERM 时 cancel |

**最佳实践**：
- ✅ 业务方写长生命周期 daemon 都用"薄入口 + 厚编排"：main < 50 行，逻辑放 `command.Run()`
- ✅ `signal.Ignore(SIGPIPE)` 在所有 systemd 托管的 Go daemon 都要写
- ✅ 用 `reexec` 替代"再起一个二进制"——节省磁盘 + 简化升级
- ❌ 切勿在 main 里直接 `daemon.NewDaemon()` + `http.ListenAndServe()`（无法测试）
- ❌ 切勿在 reexec 回调里 `os.Exit(0)`（应 `return` 让 main defer 走完）

### 2. start() 启动剧本：依赖反序关闭（Startup Script）

**问题场景**：daemon 启动涉及 CheckSystem → loadListeners → initContainerd → NewDaemon → initBuildkit → httpServer.Serve，步骤有 20+ 个；任何一步失败都要回滚前面的资源（defer cancel 链）；用 `goto` / flag 控制流程不可读。

**解决方案**：
```go
// daemon/command/daemon.go start() 简化
func (cli *daemonCLI) start(ctx context.Context) (retErr error) {
    if err := daemon.CheckSystem(); err != nil {  // 早失败
        return err
    }
    lss, hosts, err := loadListeners(cli.Config, cli.apiTLSConfig)
    ctx, cancel := context.WithCancel(ctx)
    defer cancel()

    waitForContainerDShutdown, err := cli.initContainerd(ctx)  // 启 containerd
    defer waitForContainerDShutdown()  // 反序关闭

    httpServer := &http.Server{ReadHeaderTimeout: 5 * time.Minute}
    trap.Trap(cli.stop)
    go func() { <-cli.apiShutdown; httpServer.Shutdown(ctx); close(apiShutdownDone) }()

    pluginStore := plugin.NewStore()
    d, err := daemon.NewDaemon(ctx, cli.Config, pluginStore, cli.authzMiddleware)
    if err != nil { return err }
    defer shutdownDaemon(ctx, d)  // 最后关

    b, shutdownBuildKit, err := initBuildkit(ctx, d, cdiCache)
    if err != nil { return err }
    defer shutdownBuildKit()  // 比 daemon 先关

    routers := buildRouters(...)
    gs := newGRPCServer(ctx)
    b.backend.RegisterGRPC(gs)
    httpServer.Handler = newHTTPHandler(ctx, gs, apiServer.CreateMux(ctx, routers...))

    for _, ls := range lss {
        apiWG.Go(func() { httpServer.Serve(ls) })
    }
    apiWG.Wait()  // 阻塞到所有 listener 退出
    c.Cleanup()
    notifyStopping()  // sd_notify
    return nil
}
```

**关键参数**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `ReadHeaderTimeout` | 5min | Slowloris 防御；build context 上传很大 |
| `trap.Trap` | sync.Once | 多次 SIGTERM 不会触发两次关闭 |
| defer 顺序 | 反依赖序 | BuildKit → daemon → containerd → listeners |
| `initContainerd` | gRPC | fork 子进程或 dial 已运行实例 |

**最佳实践**：
- ✅ 业务方 daemon 启动都按"依赖正序创建、defer 反序关闭"写
- ✅ 每一步用 `defer XxxShutdown()` 显式回收
- ✅ 用 `errgroup.WithContext` 把 cancel 串起来
- ✅ `ReadHeaderTimeout` 要大于"最大正常请求"（build context 可能 1GB+）
- ❌ 切勿让启动步骤共享全局变量（测试时污染）
- ❌ 切勿在 defer 里做长阻塞操作（拖慢重启）

### 3. Daemon struct：服务定位器（Service Locator）

**问题场景**：daemon 内部有 50+ 子服务（imageService / containerStore / volumeStore / networkControllers / statsCollector）；如果用 dependency injection 框架（wire / fx），启动慢、调试难；如果每个子服务自己 new，依赖关系无人维护。

**解决方案**：
```go
// daemon/daemon.go 简化
type Daemon struct {
    ID                    string
    repository            string
    containers            container.Store
    execCommands          *exec.Store
    imageService          images.Service    // 业务接口
    imageStore            image.Store       // 底层存储
    distributionService   distribution.Service
    pluginStore           *plugin.Store
    volumeStore           *volume.Store
    networkControllers    map[string]libnetwork.NetworkController
    statsCollector        *stats.Collector
    // ... 50+ 字段
}

func NewDaemon(ctx context.Context, config *config.Config, ...) (*Daemon, error) {
    d := &Daemon{}
    // 装配所有子服务
    d.imageStore, err = image.NewImageStore(...)
    d.imageService = images.NewService(d.imageStore, ...)
    d.containers = container.NewStore(...)
    // ...
    return d, nil
}
```

**关键参数**：

| 字段 | 作用 |
| --- | --- |
| `imageService` / `imageStore` 分离 | Service 是接口，Store 是存储，依赖倒置 |
| 无 `sync.Mutex` | 并发安全靠子服务内部锁 + context 传递 |
| `map[string]NetworkController` | 多种 network driver 并存（bridge / overlay / host） |
| 字段顺序 | 与 NewDaemon 装配顺序对应，便于阅读 |

**最佳实践**：
- ✅ 业务方大型后端用 `XxxService`（接口）+ `XxxStore`（实现）拆分
- ✅ `NewXxx` 函数只负责"装配"，每个子服务自己 new + 注入
- ✅ 关闭时按"依赖反序"调用 `d.Xxx.Close()`（用 defer 链）
- ❌ 切勿让 `Daemon` struct 超过 50 字段（god struct，应按子域拆）
- ❌ 切勿在 Daemon 上加 `sync.Mutex`（掩盖子服务的并发 bug）

### 4. Reexec 机制：进程内多模式（In-Process Reentry）

**问题场景**：docker exec / docker build 需要进入"另一种执行模式"（OCI runtime），传统做法是 fork 新二进制（`docker-runc`）；但升级时多二进制一致性难保证，且新二进制要重新初始化一堆资源。

**解决方案**：
```go
// 父进程：reexec.Register 注册回调
reexec.Register("docker-reexec", func() {
    // 解析环境变量，找到要执行的 callback
    code := os.Getenv("DOCKER_REEXEC_CODE")
    switch code {
    case "containerd-shim-runc-v2":
        shim.Run()
    }
})

// 父进程：fork 时改 os.Args[0]
cmd := exec.Command("/proc/self/exe")
cmd.Args[0] = "docker-reexec"  // 关键 hack
cmd.Env = append(os.Environ(), "DOCKER_REEXEC_CODE=containerd-shim-runc-v2")
cmd.Start()

// 子进程进入 main()：
func main() {
    if reexec.Init() {
        return  // 已执行 callback
    }
    // 父进程路径：启 dockerd
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `os.Args[0]` | 改名后，子进程 `os.Args[0] == "docker-reexec"` |
| `/proc/self/exe` | 重新执行当前二进制（无需新文件） |
| `os.Getenv("DOCKER_REEXEC_CODE")` | 进一步路由到具体 callback |
| `return` 而非 `os.Exit(0)` | 保留 main defer 链 |

**最佳实践**：
- ✅ 业务方"无新二进制多模式"需求用 reexec（节省 100MB+ 磁盘）
- ✅ 命名空间用 `os.Args[0]`，执行模式用 `os.Getenv`
- ✅ 子进程退出走 `return`，让 main defer 清理
- ❌ 切勿让 reexec 路径写状态到全局变量（影响父进程）
- ❌ 切勿忘记 `signal.Ignore(SIGPIPE)`（reexec 子进程不屏蔽）

### 5. 多 listener 共享 HTTP server（Multi-Protocol Server）

**问题场景**：dockerd 同时要 listen unix socket（CLI 本地）+ tcp:2375（远程 SDK）+ fd 继承（systemd socket activation），三种 listener 共享同一组路由（containers / images / networks...）；还要让 gRPC（BuildKit / containerd）和 HTTP 共存于同一端口。

**解决方案**：
```go
// daemon/command/daemon.go
lss, hosts, err := loadListeners(cli.Config, cli.apiTLSConfig)
// lss = []*net.Listener  // unix / tcp / fd

var p http.Protocols
p.SetHTTP1(true)
p.SetHTTP2(true)
p.SetUnencryptedHTTP2(true)  // h2c：让无 TLS 的本地 socket 也能 gRPC

httpServer := &http.Server{
    Protocols: &p,
    ReadHeaderTimeout: 5 * time.Minute,
}
httpServer.Handler = newHTTPHandler(ctx, gs, apiServer.CreateMux(ctx, routers...))

for _, ls := range lss {
    apiWG.Go(func() { httpServer.Serve(ls) })
}
apiWG.Wait()
```

**关键参数**：

| 字段 | 推荐 | 说明 |
| --- | --- | --- |
| `Protocols.SetHTTP1/2/UnencryptedHTTP2` | true | 单端口同时跑 HTTP/1.1、HTTP/2、h2c |
| `apiWG` | errgroup | 任一 listener 失败则全停 |
| `loadListeners` | 顺序：flags > config > defaults | unix > tcp > fd |
| `ReadHeaderTimeout` | 5min | Slowloris 防御 |

**最佳实践**：
- ✅ 业务方 daemon 用 `http.Server.Handler` 统一挂载多个 router
- ✅ h2c 让"无 TLS 也能 gRPC"（local socket 场景）
- ✅ 用 `errgroup` 而非 `sync.WaitGroup`（传播首个 error）
- ❌ 切勿让多个 listener 共享同一个 `http.Server.Handler` 之外的 state（race）
- ❌ 切勿在 unix socket 上启 TLS（性能浪费 + 配置繁琐）

---

## 二、容器运行时：libcontainerd 与 supervisor

### 6. libcontainerd：把 containerd 装成 Backend（Adapter Pattern）

**问题场景**：Docker 需要复用 containerd 的镜像管理、快照、shim 机制，但又不想放弃自己的 CNM 网络模型；如果直接调 containerd gRPC API，调用散落各处、错误难统一。

**解决方案**：
```go
// daemon/internal/libcontainerd/supervisor/supervisor.go 简化
type Supervisor struct {
    client       containerd.Client  // long-lived gRPC client
    containers   sync.Map           // cID → container struct
    q            queue               // 事件队列
    stream       containerd.EventService
}

// 业务方用
func (d *Daemon) ContainerExecCreate(...) (string, error) {
    return d.containerd.Exec(ctx, containerID, spec)
}

// supervisor 内部
func (s *Supervisor) handleEvent(e *containerd.Event) {
    switch e.Topic {
    case containerd.ExitEventTopic:
        s.notifyExit(e)
    case containerd.OOMEventTopic:
        s.notifyOOM(e)
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `sync.Map` | cID → container 映射，高并发读 |
| `q queue` | gRPC stream 事件，单消费者 goroutine |
| long-lived client | 复用 gRPC 连接，避免每次拨号 |
| `initContainerd(ctx)` | daemon 启动时 fork 或 dial |

**最佳实践**：
- ✅ 业务方对接外部子系统（数据库、缓存、消息队列）都用"Adapter 包装成内部接口"
- ✅ gRPC 长连接池化（不要每次 RPC 都 dial）
- ✅ 事件流用单 goroutine 消费（保证顺序）
- ❌ 切勿让多个 goroutine 共享 containerd client 的 stream（race）
- ❌ 切勿在 supervisor 中调 daemon 业务接口（循环依赖）

### 7. containerd fork-or-dial：启动期决定（Startup Negotiation）

**问题场景**：用户可能已运行 containerd（K8s 节点），也可能没运行；daemon 要么 fork 一个新 containerd，要么复用现有的——选择不固定，配置项多。

**解决方案**：
```go
// daemon/command/daemon.go initContainerd 简化
func (cli *daemonCLI) initContainerd(ctx context.Context) (func(), error) {
    if cli.Config.ContainerdAddr != "" {
        // 配置指定了外部 containerd：直接 dial
        return cli.connectContainerd(cli.Config.ContainerdAddr)
    }
    // 没指定：fork 子进程
    return cli.startContainerd(ctx)
}

// connectContainerd
client, err := containerd.New(addr)
// 健康检查
if _, err := client.Version(ctx); err != nil {
    return nil, err
}
return func() { client.Close() }, nil

// startContainerd
cmd := exec.Command(containerdBin, "--config", cfgFile)
if err := cmd.Start(); err != nil { return nil, err }
return func() {
    cmd.Process.Signal(syscall.SIGTERM)
    cmd.Wait()
}, nil
```

**关键参数**：

| 字段 | 推荐 |
| --- | --- |
| `ContainerdAddr` | `/run/containerd/containerd.sock`（默认） |
| 健康检查 | `client.Version(ctx)` |
| 启动超时 | 30s（否则 fail daemon） |
| SIGTERM grace | 10s |

**最佳实践**：
- ✅ 业务方对接外部服务都实现"复用优先，启动 fallback"逻辑
- ✅ 健康检查强制（`Version` / `Ping`）
- ✅ 用 `waitForContainerDShutdown` defer 释放资源
- ❌ 切勿假设外部服务"已运行"（必须先 Ping）
- ❌ 切勿让 fork 子进程用 `os.Exit` 退出（留时间 flush 日志）

### 8. OOM / Exit 事件流：状态机同步（Event Stream）

**问题场景**：容器 OOM / 退出 / 健康检查失败时，daemon 要同步更新 container state，并把事件推给 API client；如果 daemon 自己轮询（`ps` / `cgroup`），CPU 占用高且延迟大。

**解决方案**：
```go
// supervisor 订阅 containerd event stream
stream, err := s.client.EventService().Subscribe(ctx, &events.SubscribeRequest{})

for {
    e, err := stream.Recv()
    if err != nil { return err }
    
    switch e.Topic {
    case "/tasks/oom":
        s.handleOOM(e)
    case "/tasks/exit":
        s.handleExit(e)
    case "/containers/delete":
        s.handleDelete(e)
    }
}

func (s *Supervisor) handleOOM(e *events.Envelope) {
    cID := e.Topic
    s.containers.Range(func(k, v interface{}) bool {
        if v.(*container).taskID == cID {
            s.notifyHealthStatus(v.(*container), types.Unhealthy)
        }
        return true
    })
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `events.SubscribeRequest` | gRPC server-streaming |
| `e.Topic` | 事件分类（`/tasks/oom` 等） |
| `notifyHealthStatus` | 触发 health checker 重新探测 |
| stream 断开 | 自动重连（带 backoff） |

**最佳实践**：
- ✅ 业务方用 gRPC server-streaming 接收事件（避免轮询）
- ✅ 事件 handler 单 goroutine 消费（保证顺序）
- ✅ 断线自动重连（带指数 backoff）
- ❌ 切勿在 event handler 里调阻塞 IO（拖慢 stream）
- ❌ 切勿让 OOM 事件触发"自动重启"（policy 应在 daemon 配置层）

### 9. shim 进程模型：runc 的"中间人"（Shim Process）

**问题场景**：直接让 dockerd 管理 runc 进程，dockerd 崩溃时容器无人回收（孤儿进程）；而且 runc fork 子进程跑容器，runc 退出后 cgroup / namespace 无人清理。

**解决方案**：
```text
# containerd-shim-runc-v2 角色
dockerd → containerd → shim → runc → container
                  ↑                  ↓
                  └─── shim 持续运行 ───┘
                     （dockerd 崩溃后仍存活）
```

```go
// shim 启动后
func main() {
    // 1. 创建 runtime spec
    spec := loadSpec(bundlePath)
    // 2. fork runc
    cmd := exec.Command("runc", "create", "--bundle", bundlePath, id)
    cmd.Start()
    // 3. runc 退出后，shim 接管（不退出！）
    cmd.Wait()
    // 4. 持续 stdio 转发 + signal 代理
    for {
        select {
        case sig := <-sigCh:
            // 转发到 container
            signal.Process(sig, containerPID)
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `runc create` | 创建容器但不启动（让 shim 接管） |
| shim 生命周期 | 长于 runc，短于容器 |
| stdio 转发 | shim 持有 container stdio，dockerd 通过 shim 转发 |
| signal 代理 | shim 接收 SIGTERM/SIGKILL，转发到 container init |

**最佳实践**：
- ✅ 业务方"父进程管理子进程"模式都加 shim 中间层（防孤儿）
- ✅ shim 必须独立进程（不能在 dockerd 内）
- ✅ shim 持有 stdio（dockerd 退出后容器仍可写日志）
- ❌ 切勿让 dockerd 直接管 runc（崩溃后容器无人）
- ❌ 切勿让 shim 共享 dockerd 的 cgroup（隔离失败）

### 10. CDI 设备注入：GPU 声明式接入（Device Plugin）

**问题场景**：GPU / FPGA / DPU 等特殊设备需要注入容器（device cgroup / volume mount / env vars）；硬编码在 daemon 里会让每加一种设备都要改代码。

**解决方案**：
```go
// daemon/command/daemon.go
if cdiEnabled(cli.Config) {
    cdiCache = daemon.RegisterCDIDriver(cli.Config.CdiSpecDirs...)
    daemon.RegisterGPUDeviceDrivers(cdiCache)
}

// spec 生成时
func WithCDI(spec *oci.Spec, cdi *cdi.Cache) oci.SpecOpts {
    return func(ctx context.Context, spec *oci.Spec) error {
        devices, _ := cdi.GetDevices(spec.Annotations["cdi.devices"]...)
        for _, d := range devices {
            spec.Linux.Devices = append(spec.Linux.Devices, d.DeviceSpecs...)
            spec.Linux.Resources.Devices = append(spec.Linux.Resources.Devices, d.DeviceCgroup...)
            for _, m := range d.Mounts { spec.Mounts = append(spec.Mounts, m) }
        }
        return nil
    }
}
```

**关键参数**：

| 字段 | 推荐 |
| --- | --- |
| `cdi.devices` annotation | 容器级 CDI 设备选择 |
| `CdiSpecDirs` | `/etc/cdi` `/var/run/cdi` |
| `RegisterCDIDriver` | 启动时扫描 spec JSON |
| 自动注入 | cgroup + device + mounts + env |

**最佳实践**：
- ✅ 业务方设备接入用 CDI 规范（声明式 JSON）
- ✅ `cdi.devices` annotation 让用户选设备，无需改 daemon
- ✅ 启动时扫描 + 缓存 CDI spec
- ❌ 切勿把设备列表硬编码（每加 GPU 都要发版）
- ❌ 切勿在 runtime 时改 spec（应在 create 阶段）

---

## 三、镜像构建：BuildKit 集成

### 11. BuildKit gRPC 客户端：构建引擎外包（Build Outsource）

**问题场景**：Docker build 流程涉及 Dockerfile 解析、layer 缓存、并发构建、跨平台多架构——逻辑复杂到 5000+ 行代码；自研不如用 BuildKit（已捐赠 CNCF），但 BuildKit 是独立进程，daemon 要能 dial 它。

**解决方案**：
```go
// daemon/command/daemon.go initBuildkit
func initBuildkit(ctx context.Context, d *Daemon, cdiCache *cdi.Cache) (*buildkit.Builder, func(), error) {
    if !d.Config.Features.BuildKit {
        return nil, func() {}, nil  // 兼容老 builder
    }
    addr := d.Config.BuilderAddr  // unix:///run/buildkit/buildkitd.sock
    client, err := buildkit.NewClient(ctx, addr)
    if err != nil { return nil, nil, err }

    b := &buildkit.Builder{Client: client, CDI: cdiCache}
    shutdown := func() { client.Close() }
    return b, shutdown, nil
}

// 业务方用
result, err := b.Build(ctx, dockerfile, opts)
```

**关键参数**：

| 字段 | 默认 |
| --- | --- |
| `BuilderAddr` | `unix:///run/buildkit/buildkitd.sock` |
| 启动方式 | daemon fork buildkitd 子进程 |
| `Features.BuildKit` | 1.18+ 默认 true |
| shutdown | 10s timeout |

**最佳实践**：
- ✅ 业务方复杂子系统都走"独立进程 + gRPC"（独立升级、独立崩溃）
- ✅ daemon 与子系统用 unix socket（无网络配置）
- ✅ 启动时 dial + 健康检查（避免请求路径上 fail）
- ❌ 切勿让 BuildKit 跑在 dockerd 进程内（崩溃相互影响）
- ❌ 切勿假设 buildkitd 一定运行（必须 fork fallback）

### 12. BuildKit 注册到路由：builder/backend 模式（Backend Pattern）

**问题场景**：BuildKit 既要服务外部 CLI（`docker buildx build`），又要被 daemon 内部调用（`docker build`）；两种调用方需要统一认证、统一配额。

**解决方案**：
```go
// daemon/server/router/build/build_routes.go
func (b *buildRouter) initRoutes() {
    b.routes = []router.Route{
        router.NewPostRoute("/build", b.postBuild),
        router.NewPostRoute("/build/prune", b.postBuildPrune),
    }
}

func (b *buildRouter) postBuild(ctx context.Context, w http.ResponseWriter, r *http.Request, vars map[string]string) {
    // 1. 鉴权
    // 2. 调 backend.Build
    err := b.backend.Build(ctx, buildOpts)
    // 3. 流式返回
    output := buildctx.Stdout()
    flusher, _ := w.(http.Flusher)
    for line := range output {
        fmt.Fprintf(w, "%s\n", line)
        flusher.Flush()
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `http.Flusher` | 实时流式输出构建日志 |
| `BuildOptions` | Dockerfile 内容、tags、build args |
| 后端接口 | `BuildBackend.Build(ctx, opts) error` |
| Authz 中间件 | 统一鉴权 |

**最佳实践**：
- ✅ 业务方长任务（构建、迁移、导出）用 streaming response
- ✅ `http.Flusher` 逐行 flush，前端能实时显示
- ✅ 后端接口抽象（可替换为远端 builder）
- ❌ 切勿让构建任务 buffer 完再返回（用户等 10 分钟无反馈）
- ❌ 切勿把 BuildKit gRPC 调用散落到 router（应集中到 backend）

### 13. Dockerfile frontend + LLB 抽象（BuildKit Frontend）

**问题场景**：Dockerfile 是声明式语法，但 BuildKit 内部用 LLB（Low-Level Builder）DAG；需要在"Dockerfile 文本"和"LLB 拓扑"之间架一座桥。

**解决方案**：
```go
// BuildKit Dockerfile 前端
import "github.com/moby/buildkit/frontend/dockerfile/dockerfile"

func DockerfileFrontend(ctx context.Context, llbBridge frontend.LLBBridge, opts *frontend.BuildOpts) (*frontend.Result, error) {
    // 1. 解析 Dockerfile
    ast, _ := dockerfile.Parse(opts.Dockerfile)
    // 2. 转 LLB
    llb, _ := dockerfile2LLB(ast, llbBridge)
    // 3. 执行
    return llbBridge.Build(ctx, llb, opts)
}

// 业务方用自定义 frontend
buildctl build --frontend=mycompany.frontendspecial:v1 \
  --opt target=production
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `frontend.LLBBridge` | BuildKit 提供的 LLB 执行入口 |
| `--frontend` | 指定 frontend 镜像（容器化） |
| `--opt` | frontend 自定义参数 |
| Dockerfile frontend | 默认（`docker/dockerfile-upstream`） |

**最佳实践**：
- ✅ 业务方用 BuildKit frontend 写自定义构建（CI 内部 DSL）
- ✅ Dockerfile frontend 与 LLB 桥解耦（升级 BuildKit 不影响 Dockerfile）
- ✅ frontend 容器化运行（隔离依赖）
- ❌ 切勿在 daemon 进程内 parse Dockerfile（应交给 frontend）
- ❌ 切勿让 frontend 改用户文件（构建应是只读的）

### 14. Rootless 模式：非 root 跑 daemon（Unprivileged Daemon）

**问题场景**：生产环境不让 root 跑容器（安全 / 合规要求）；但 dockerd 默认要 root 跑 cgroup / iptables / mount；需要"非特权 daemon"模式。

**解决方案**：
```bash
# 启动 rootless dockerd
dockerd-rootless.sh

# 自动设置：
# - user namespace (unshare -U)
# - mount namespace (新建 /home/user/.local/share/docker)
# - slirp4netns 网络栈（无需 iptables 特权）
# - cgroup v2 user-owned
```

```go
// 简化
func rootlessSetup() error {
    // 1. 切 user namespace
    if err := unix.Unshare(unix.CLONE_NEWUSER); err != nil { return err }
    // 2. 配置 subuid / subgid
    setUIDMap(0, 0, 65536)
    // 3. 切 mount namespace
    unix.Unshare(unix.CLONE_NEWNS)
    // 4. 把 docker rootless 路径 bind mount
    syscall.Mount("overlay", dataRoot, "overlay", 0, "lowerdir=...,upperdir=...")
    return nil
}
```

**关键参数**：

| 字段 | 默认 |
| --- | --- |
| `XDG_DATA_HOME` | `/home/$USER/.local/share/docker` |
| 网络栈 | slirp4netns（用户态 NAT） |
| 性能损失 | ~10%（用户态网络） |
| cgroup | cgroup v2 user-owned |

**最佳实践**：
- ✅ 业务方高安全环境都用 rootless（K8s pod 内、CI runner）
- ✅ slirp4netns 提供网络（无需 root 改 iptables）
- ✅ cgroup v2 user-owned（v1 不支持）
- ❌ 切勿在 rootless 模式用 iptables 改网络（用 slirp4netns）
- ❌ 切勿让 rootless 跑特权容器（应直接禁）

### 15. 多架构构建：manifest 合并（Multi-Arch）

**问题场景**：一个 tag 要同时支持 linux/amd64 + linux/arm64 + windows/amd64；不同架构 layer 不同，需要合并成 single manifest。

**解决方案**：
```go
// daemon/images/image_store.go 多架构合并
func (is *ImageService) PushImageMultiArch(ctx context.Context, images []image.Ref, tag string) error {
    manifestList := &manifest.ManifestList{
        SchemaVersion: 2,
        MediaType: manifestListMediaType,
        Manifests: []manifest.ManifestEntry{},
    }
    for _, ref := range images {
        mfst, _ := is.GetManifest(ctx, ref)
        manifestList.Manifests = append(manifestList.Manifests, manifest.ManifestEntry{
            MediaType: mfst.MediaType,
            Digest:    mfst.Digest,
            Platform:  mfst.Platform,
            Size:      mfst.Size,
        })
    }
    return is.distribution.Push(ctx, manifestList, tag)
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `manifest.ManifestList` | OCI image index |
| `MediaType` | `application/vnd.oci.image.index.v1+json` |
| `Platform` | `linux/amd64` 等 |
| `docker manifest create` | CLI 入口 |

**最佳实践**：
- ✅ 业务方多架构镜像用 manifest list 合并
- ✅ `docker buildx build --platform=linux/amd64,linux/arm64` 一次产出
- ✅ 客户端按平台自动选择 layer
- ❌ 切勿让一个 tag 含不同架构但相同 digest（应分开）
- ❌ 切勿忘了 platform 字段（K8s 1.20+ 强依赖）

---

## 四、API 与网络：路由 + libnetwork

### 16. 声明式路由：路由即数据（Data-Driven Routes）

**问题场景**：Docker API 有 100+ 端点（containers / images / networks / volumes / swarm...）；用 if-else 分发难维护；用框架（gin / echo）又和标准库冲突。

**解决方案**：
```go
// daemon/server/router/container/container_routes.go
func (c *containerRouter) initRoutes() {
    c.routes = []router.Route{
        router.NewGetRoute("/containers/json", c.getContainersJSON),
        router.NewPostRoute("/containers/create", c.postContainersCreate),
        router.NewPostRoute("/containers/{name:.*}/start", c.postContainerStart),
        router.NewPostRoute("/containers/{name:.*}/stop", c.postContainerStop),
        router.NewGetRoute("/containers/{name:.*}/json", c.getContainersByName),
        router.NewDeleteRoute("/containers/{name:.*}", c.deleteContainer),
        // ...
    }
}

// 创建路由树
r := mux.NewRouter()
for _, route := range containerRouter.routes {
    r.Path(route.Path()).Methods(route.Method()).Handler(route.Handler())
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `router.NewGetRoute/PostRoute` | factory 强制 method+path+handler |
| `{name:.*}` | gorilla 正则，容器名含特殊字符 |
| `c.routes` | 路由表是 slice of struct |
| Authz 中间件 | 一次性遍历所有路由做权限检查 |

**最佳实践**：
- ✅ 业务方 API 路由用"路由表 = slice of struct"声明式定义
- ✅ factory 函数（`NewGetRoute`）强制三字段完整
- ✅ Authz 中间件遍历路由表统一挂载
- ❌ 切勿在 handler 里直接 `mux.HandleFunc`（路由散落）
- ❌ 切勿让一个 handler 绑多个 method（应拆 handler）

### 17. 鉴权中间件：plugin + 装饰器链（Authz Middleware）

**问题场景**：Docker 企业用户要自定义权限（"财务组只能看 logs，不能 exec"）；如果每个 handler 自己鉴权，权限策略散落。

**解决方案**：
```go
// pkg/authorization/middleware.go
type Middleware struct {
    plugins []Plugin  // 外部 plugin（如 Open Policy Agent）
}

func (m *Middleware) WrapHandler(handler http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 1. 收集 request 元数据
        req := &Request{
            Method:    r.Method,
            URI:       r.URL.Path,
            User:      getUser(r),
            Headers:   r.Header,
        }
        // 2. 问每个 plugin 是否允许
        for _, p := range m.plugins {
            allow, err := p.Authorize(req)
            if err != nil || !allow {
                w.WriteHeader(http.StatusForbidden)
                return
            }
        }
        // 3. 放行
        handler.ServeHTTP(w, r)
    })
}
```

**关键参数**：

| 字段 | 推荐 |
| --- | --- |
| `Plugin` 接口 | `AuthZReq \| AuthZRes` 两段鉴权 |
| 决策时机 | 鉴权（pre） + 响应（post） |
| Plugin transport | gRPC（in-process 或 out-of-process） |
| 默认 | 无 plugin（allow all） |

**最佳实践**：
- ✅ 业务方鉴权用 plugin 模式（OPA / Casbin / 自研都可）
- ✅ 两段鉴权：pre 拒绝请求，post 审计响应
- ✅ gRPC transport 让 plugin 独立进程（崩溃不影响 daemon）
- ❌ 切勿让 plugin 同步阻塞 > 100ms（用 timeout）
- ❌ 切勿把鉴权逻辑写死在 handler（应中间件层）

### 18. CNM 网络模型：libnetwork 抽象（Network Abstraction）

**问题场景**：容器网络有 bridge / overlay / host / macvlan / ipvlan 多种 driver；不同 driver 调 iptables / OVS / 内核 netlink；daemon 不能耦合具体 driver。

**解决方案**：
```go
// libnetwork/controller.go
type NetworkController interface {
    CreateNetwork(name string, opts ...NetworkOption) (Network, error)
    DeleteNetwork(nw Network) error
    EndpointByID(id string) (Endpoint, error)
}

type Network interface {
    CreateEndpoint(opts ...EndpointOption) (Endpoint, error)
    DeleteEndpoint(ep Endpoint) error
}

// driver 实现
type bridgeDriver struct{}
func (d *bridgeDriver) CreateNetwork(name string, opts ...NetworkOption) (Network, error) {
    // 1. 创建 linux bridge
    netlink.LinkAdd(&netlink.Bridge{LinkAttrs: netlink.LinkAttrs{Name: "br-xxx"}})
    // 2. 配置 iptables
    iptables("-A FORWARD -i br-xxx -j ACCEPT")
    // 3. 启动 DHCP server
    return &bridgeNetwork{name: name}, nil
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `NetworkController` | 顶层抽象（一个 daemon 多个 controller） |
| `Network` | 子网抽象 |
| `Endpoint` | 容器虚拟网卡（veth） |
| Driver | bridge / overlay / ipvlan / macvlan / host / null |

**最佳实践**：
- ✅ 业务方网络 / 存储 / 计算都用 controller 抽象（多 driver 切换）
- ✅ 用 netlink 而非 `ip` / `iptables` shell-out（性能 + 可控）
- ✅ driver 注册到 controller 即可热插拔
- ❌ 切勿让 daemon 直接调 `netlink`（应走 libnetwork）
- ❌ 切勿让一个 controller 跨 host（应 distributed overlay）

### 19. 优雅停服：sd_notify + 排空（Graceful Shutdown）

**问题场景**：dockerd 升级时，systemd 发 SIGTERM；要让容器继续运行（不 kill）、listener 排空（不再接新 conn）、BuildKit / containerd 优雅关闭；硬 kill 会让 in-flight 请求失败、容器突然停。

**解决方案**：
```go
// daemon/command/daemon.go
trap.Trap(cli.stop)  // SIGTERM → cli.stop

func (cli *daemonCLI) stop() {
    cli.stopOnce.Do(func() {  // sync.Once 防多次触发
        close(cli.apiShutdown)  // 触发 httpServer.Shutdown
    })
}

func shutdownDaemon(ctx context.Context, d *Daemon) {
    // 1. 停止接新容器
    // 2. 等 30s 现有容器自然退出
    // 3. 强制 kill
    timer := time.NewTimer(30 * time.Second)
    select {
    case <-d.allContainersStopped():
    case <-timer.C:
        d.KillAll()
    }
    // 4. 关子服务
    d.statsCollector.Close()
    d.imageStore.Close()
}

notifyStopping()  // systemd sd_notify
```

**关键参数**：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `stopOnce` | sync.Once | 防多次 SIGTERM 触发 |
| 排空 grace | 10s | listener 排空 |
| 容器 grace | 30s | 容器自然退出 |
| `sd_notify` | Type=notify | systemd 通知 |

**最佳实践**：
- ✅ 业务方 daemon 优雅停服分四段：listener → in-flight → 子服务 → sd_notify
- ✅ `sync.Once` 保护 stop 函数
- ✅ `sd_notify STOPPING=1` 让 systemd 不再发新请求
- ❌ 切勿用 `os.Exit`（defer 链断）
- ❌ 切勿让容器 grace 太短（业务方会感知数据丢失）

### 20. CLI 与 SDK：client 包独立版本（Staggered Module）

**问题场景**：Docker 客户端 SDK 升级频率和 daemon 不同（client 可以更激进）；用 `github.com/docker/docker/client` 路径会被迫跟随 daemon 版本；需要"client 独立 module"。

**解决方案**：
```go
// moby/v29 之后模块拆分
// go.mod (root)
module github.com/moby/moby  // 仅 daemon

// api/go.mod
module github.com/moby/moby/api  // 共享类型
go 1.21

// client/go.mod
module github.com/moby/moby/client  // 独立版本
require github.com/moby/moby/api v0.5.0
```

```bash
# 业务方用 client SDK
go get github.com/moby/moby/client@v0.5.0
go get github.com/moby/moby/api@v0.5.0
# 跟 daemon 版本解耦
```

**关键参数**：

| 模块 | tag | 用途 |
| --- | --- | --- |
| `moby/moby` | v29+ | daemon 二进制 |
| `moby/moby/api` | v0.5+ | 共享类型（types.go） |
| `moby/moby/client` | v0.5+ | Go SDK |
| 兼容性 | semver | 独立演进 |

**最佳实践**：
- ✅ 业务方 Go 项目用 staggered module 拆分"运行时 + 客户端"
- ✅ 共享类型放独立 module（避免循环依赖）
- ✅ semver 严格管理 breaking change
- ❌ 切勿让 client 强制跟随 daemon 版本（升级慢）
- ❌ 切勿在 root module 暴露 client API（污染 import path）

---

**标签**：#moby #docker #container #golang
**状态**：20/20 份详细内容
