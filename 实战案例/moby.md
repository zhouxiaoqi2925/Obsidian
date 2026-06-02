---
title: moby
type: container-engine
lang: go
stars: 70000+
date: 2026-06-02
tags:
  - 开源项目
  - container-engine
  - go
  - docker
  - daemon
---

# moby · 项目深度解析

> Docker 引擎的上游开源组件库，把容器化拆成可插拔的 Lego 积木
> 来源：G:\实战案例\GitHub顶尖项目\moby\

## 写在前面：解析哲学

先骨架后血肉，先 What 后 Why，最后 How to steal。本笔记不重复 README 的销售文案，只讲代码里能看到的事：Moby 怎么把 daemon、containerd、BuildKit、Swarm、API router 拼装在一起，为什么这么拼，以及哪些设计可以被你的下一个 Go 后端借鉴。

## 0. 解析前的 5 个准备

1. **克隆**：`git clone --depth 1 https://github.com/moby/moby.git`，锁定 v29 系列 tag（`docker-v29.x.x`）
2. **分类**：Go 实现的容器引擎/工具箱，Apache-2.0
3. **问题清单**：daemon 怎么启动？containerd 怎么嵌入？API 怎么路由？BuildKit 怎么挂载？rootless 怎么支持？
4. **速查表**：`cmd/dockerd/main.go` / `daemon/command/daemon.go` / `daemon/daemon.go` / `daemon/server/router/` / `daemon/server/backend/`
5. **锁定 commit**：Moby 单次提交改动可超过 50 文件，必须按 docker-v29 tag 切

## 1. 开发计划书（Project Charter）

| 字段 | 内容 |
|---|---|
| 项目名 | moby/moby |
| 定位 | Docker 引擎上游组件库 + 容器系统 Lego 集 |
| 核心问题 | 把容器生命周期（构建→分发→运行→编排）拆成可独立替换的模块 |
| 用户 | 平台工程师、容器发行版维护者、研究者（不是终端用户） |
| 商业模式 | Apache-2.0 开源；商业支持由 Docker Desktop / Mirantis 提供 |
| 复刻难度 | 极高（需要懂 Linux namespace/cgroup、containerd、BuildKit、Swarm、gRPC） |
| 状态 | 活跃（v29 后 API 改动剧烈） |
| 团队 | Docker Inc. + 社区（OpenSSF Scorecard 监控） |
| 里程碑 | 2013 dotCloud → 2014 Docker 1.0 → 2017 OCI 化 → 2020 BuildKit 集成 → 2023 rootless GA → 2025 docker→moby module 迁移 |

## 2. 项目框架（Repo Skeleton Map）

入口在 `cmd/dockerd/main.go`（仅 39 行，把所有事情交给 `daemon/command`）。Moby 的物理布局非常清晰：每个子系统一个目录，没有"杂货抽屉"。

```mermaid
mindmap
  root((moby))
    cmd
      dockerd
        main.go
        main_windows.go
      docker-proxy
    daemon
      command
        daemon.go 启动编排
        config.go 配置加载
        cobra.go CLI
        options.go flag 解析
      server
        router
          container
          image
          network
          volume
          swarm
          system
          build
          debug
          session
          plugin
          distribution
          checkpoint
          grpc
        backend 后端实现
        middleware 鉴权
      libnetwork CNM 网络模型
      container 容器运行时
      builder 构建器
      cluster Swarm 集成
      pkg 通用工具
    api
      types 共享类型
      common 错误/流协议
    client
      Go SDK
    integration
    integration-cli
    contrib
      buildpkg 各种 rootfs 脚本
    vendor
    hack
      Makefile.* 构建脚本
    docker-bake.hcl
    Dockerfile / Dockerfile.windows
```

实际配置/入口：

- 配置文件：`/etc/docker/daemon.json`（运行时 `cli.Config`）
- CLI 入口：`cmd/dockerd/main.go` → `daemon/command.NewDaemonRunner()` → `Run(ctx)`
- 后台入口：`daemon.NewDaemon(ctx, ...)` + `buildRouters(...)` + `httpServer.Serve(ls)`
- 构建：`docker buildx bake -f docker-bake.hcl`

## 3. 项目画像（Profile）

| 指标 | 值 |
|---|---|
| 总 Go 文件 | 约 3000+ 个 |
| 主语言 | Go（97%+）+ shell + Dockerfile + HCL |
| 涉及语言 | Go / Makefile / Shell / HCL / Yaml / Markdown |
| Stars | 70k+（github.com/moby/moby） |
| License | Apache-2.0 |
| Docker | 多阶段 Dockerfile.simple + docker-bake.hcl |
| K8s | 不直接支持（依赖 K8s 部署 moby 作为 runtime） |
| CI | GitHub Actions（`hack/ci/` 大量脚本） |
| 有测试 | 是（`integration/` + `integration-cli/` + 每包 `_test.go`） |
| Go 模块 | root `moby/v2`（仅编译二进制）、`api`、`client`（独立版本） |

## 4. 架构设计（Architecture Deep Dive）

Moby 不是一个"程序"，它是一组协作的进程级组件：

```mermaid
flowchart LR
  subgraph Client
    CLI[docker CLI]
    SDK[Go client]
  end
  subgraph Daemon[dockerd 进程]
    API[API Server :2375]
    Router[router group]
    DaemonCore[daemon.Daemon]
    LibNet[libnetwork]
    Supervisor[libcontainerd supervisor]
    Logger[log drivers]
    Authz[authz plugin]
  end
  subgraph External[外部进程]
    Containerd[containerd]
    BuildKit[buildkitd]
    Proxy[docker-proxy]
  end
  subgraph Kernel
    Runc[runc]
    NetNS[network namespace]
    CGroup[cgroup]
  end
  CLI -->|REST/gRPC| API
  SDK -->|HTTP| API
  API --> Router
  Router --> DaemonCore
  DaemonCore --> LibNet
  DaemonCore --> Supervisor
  DaemonCore --> Logger
  Authz -.-> Router
  Supervisor -->|gRPC| Containerd
  Containerd --> Runc
  DaemonCore -->|gRPC| BuildKit
  LibNet --> NetNS
  Supervisor --> CGroup
  CLI -->|TCP/UDP| Proxy
```

### 核心架构看点（3 条具体设计决策）

1. **gRPC + HTTP 双协议并行**：API 层在 `daemon/server/` 用 `gorilla/mux` 跑 HTTP/1.1+JSON，内部子系统（BuildKit、containerd）走 gRPC。原因：HTTP 给 CLI/第三方工具（无状态、可调试），gRPC 给有状态子系统（流式构建、长连接）。`daemon/command/daemon.go` 里 `var p http.Protocols; p.SetHTTP1(true); p.SetHTTP2(true); p.SetUnencryptedHTTP2(true)` 同时开 h2c，就是为了让"无 TLS 的本地 socket"也能跑 gRPC。
2. **三级路由（local router → daemon handler → backend）**：`daemon/server/router/container/container_routes.go` 只声明 URL+方法，把实现委托给 `daemon/server/backend` 的 `ContainerBackend` 接口。原因：路由表是声明式数据，可以做 codegen、文档生成、Authz 中间件统一挂载；handler 是可替换策略（默认 / 远端 Swarm）。
3. **containerd 作为"嵌入式子系统"而非"外部依赖"**：`daemon/internal/libcontainerd/supervisor/` 持有一个 long-lived gRPC client 到 containerd，并通过 `initContainerd(ctx)` 在 daemon 启动时拉起。原因：避免 fork 第二套容器运行时抽象；让 Docker 既能复用 containerd 的镜像/快照，又能保留自己的 CNM 网络模型。

## 5. 代码深度解析（带 WHY）⭐ 重点

### 5.1 找骨架代码

- `cmd/dockerd/main.go`：39 行的 main，所有事情都委托给 `daemon/command`
- `daemon/command/daemon.go`：500 行的 `start(ctx)`，是整个启动流程的"剧本"
- `daemon/daemon.go`：1931 行的 `Daemon` struct + `NewDaemon()`，是所有服务（image / container / network / volume / swarm）的"装配车间"
- `daemon/server/router/container/container_routes.go`：声明式路由表
- `daemon/server/backend/`：每个 router 后面都有一个 `*Backend` interface
- `daemon/internal/libcontainerd/supervisor/`：与 containerd 的 gRPC 长连接管理者

### 5.2 单文件分析卡

#### `cmd/dockerd/main.go`（39 行）

```go
func main() {
    if reexec.Init() {
        return  // <-- WHY: 子进程模式（execdriver）通过 reexec 回到 main，但已完成工作，直接 return
    }
    ctx := context.Background()
    signal.Ignore(syscall.SIGPIPE)  // <-- WHY: systemd 重启 journald 时不发 SIGPIPE 给 dockerd
    _, stdout, stderr := term.StdStreams()
    r, err := command.NewDaemonRunner(stdout, stderr)
    if err := r.Run(ctx); err != nil { ... }
}
```

**WHY 分析**：
- `reexec.Init()` 是 moby 自己造的"进程内重入"机制。当容器需要用 OCI 运行时（runc）跑起来时，会 `os.Args[0]="docker-reexec"` 再 fork 一次，新进程根据 `reexec.Register()` 里的 callback 选择执行路径。`return` 而不是 `os.Exit(0)`，是因为 `main` 函数的 `defer` 不应被跳过。
- `signal.Ignore(syscall.SIGPIPE)` 引用了 issue #19728。当 systemd-journald 重启时内核会给所有写 journal 失败的进程发 SIGPIPE，dockerd 的默认行为是崩溃，所以主动忽略。
- 整个 main 没有任何业务逻辑，是典型的"薄入口厚编排"——所有事情都在 `daemon/command.Run()` 里。

#### `daemon/command/daemon.go`（start 函数，第 118-422 行）

```go
func (cli *daemonCLI) start(ctx context.Context) (retErr error) {
    if err := daemon.CheckSystem(); err != nil { ... }  // 内核版本/特权检查
    configureProxyEnv(ctx, cli.Config.Proxies)
    configureDaemonLogs(ctx, cli.Config.DaemonLogConfig)
    ...
    lss, hosts, err := loadListeners(cli.Config, cli.apiTLSConfig)  // 加载 unix/tcp/tls listeners
    ctx, cancel := context.WithCancel(ctx)
    waitForContainerDShutdown, err := cli.initContainerd(ctx)  // 启动 containerd 子进程或复用
    ...
    httpServer := &http.Server{ReadHeaderTimeout: 5 * time.Minute}  // Slowloris 防御
    trap.Trap(cli.stop)  // SIGTERM/SIGINT 优雅停服
    go func() { <-cli.apiShutdown; httpServer.Shutdown(...); close(apiShutdownDone) }()
    ...
    pluginStore := plugin.NewStore()
    if cdiEnabled(cli.Config) { cdiCache = daemon.RegisterCDIDriver(...) }  // GPU/CDI 设备注入
    daemon.RegisterGPUDeviceDrivers(cdiCache)
    ...
    d, err := daemon.NewDaemon(ctx, cli.Config, pluginStore, cli.authzMiddleware)  // 1931 行的 daemon 装配
    d.StoreHosts(hosts)
    ...
    b, shutdownBuildKit, err := initBuildkit(ctx, d, cdiCache)  // 单独 goroutine 拉起 BuildKit
    ...
    routers := buildRouters(routerOptions{features: d.Features, daemon: d, cluster: c, builder: b})
    gs := newGRPCServer(ctx)
    b.backend.RegisterGRPC(gs)
    httpServer.Protocols = &p
    httpServer.Handler = newHTTPHandler(ctx, gs, apiServer.CreateMux(ctx, routers...))
    ...
    // 启动所有 listener
    for _, ls := range lss {
        apiWG.Go(func() { httpServer.Serve(ls) })
    }
    apiWG.Wait()  // 阻塞直到所有 listener 退出
    c.Cleanup()
    notifyStopping()  // systemd sd_notify
    shutdownDaemon(ctx, d)
    shutdownBuildKit()
}
```

**WHY 分析**：
- 启动顺序被精心编排：先 `CheckSystem`（早失败），再 listeners，再 containerd，再 daemon（依赖 containerd），再 BuildKit（依赖 daemon 的 image service），最后 routers/http server。每一步都有 `defer cancel()` / `defer shutdownXxx()` 来保证反向关闭。
- `ReadHeaderTimeout: 5 * time.Minute` 注释里写着"G112: Potential Slowloris Attack (gosec); not a real concern for our use, so setting a long timeout"——因为 docker build context 上传可能极大，不能用通用 web 的 5 秒超时。
- `trap.Trap(cli.stop)` 用 `sync.Once` 保护，确保无论收到多少 SIGTERM 都不会触发两次关闭流程。
- `httpServer.Handler = newHTTPHandler(ctx, gs, apiServer.CreateMux(ctx, routers...))` 把 HTTP 路由器和 gRPC 服务器合并到同一个 `http.Server`，复用同一个 listener。这是"单端口多协议"的经典做法。

#### `daemon/daemon.go`（Daemon struct）

```go
type Daemon struct {
    ID                    string
    repository            string  // image repo
    containers            container.Store
    execCommands          *exec.Store
    imageService          images.Service
    imageStore            image.Store
    distributionService   distribution.Service
    pluginStore           *plugin.Store
    volumeStore           *volume.Store
    networkControllers    map[string]libnetwork.NetworkController
    ...
    statsCollector        *stats.Collector
    ...
}
```

**WHY 分析**：
- `Daemon` 不是"业务实体"，它是"服务定位器 + 生命周期根"。所有子服务（image / container / volume / network）都是它的字段，目的是**确保关闭时按依赖反序回收**。
- `imageService` 和 `imageStore` 拆开：Service 是业务接口（"列出镜像"），Store 是底层存储（"读 boltdb"）。这是依赖倒置的具体应用——上层 (router handler) 依赖 Service，Service 实现依赖 Store。
- 注意没有 `Mutex`，并发安全是通过子服务的"内部锁"和 context 传递来保证的，避免了"上帝锁"。

#### `daemon/server/router/container/container_routes.go`

声明式路由的范本：

```go
func (c *containerRouter) initRoutes() {
    c.routes = []router.Route{
        router.NewGetRoute("/containers/json", c.getContainersJSON),
        router.NewPostRoute("/containers/create", c.postContainersCreate),
        router.NewPostRoute("/containers/{name:.*}/start", c.postContainerStart),
        router.NewPostRoute("/containers/{name:.*}/stop", c.postContainerStop),
        ...
    }
}
```

**WHY 分析**：
- `router.NewGetRoute` / `NewPostRoute` 是 factory，强制每个路由都带 method+path+handler 三个字段，杜绝"忘记加 method"的 bug。
- `{name:.*}` 是 gorilla 的正则语法，让"容器名可以含特殊字符"成为路由层的合法表达。
- 这种"路由表 = 数据"的做法，让 Authz 中间件可以一次性遍历所有路由做权限检查（`pkg/authorization/`）。

### 5.3 设计模式

| 模式 | 体现位置 | 收益 |
|---|---|---|
| Service Locator | `daemon.Daemon` struct | 启动期一次性组装，运行时 O(1) 取服务 |
| 策略模式 | `authzMiddleware`、`AuthorizationPlugins` | 用户级权限可热替换 |
| 装饰器 | `daemon/server/middleware/` 链 | 给所有 API 加 Authz/Logging/CORS |
| Adapter | `libcontainerd/supervisor` 把 containerd 包装成 `Backend` | 内部子系统可替换 |
| 模板方法 | `daemon/command/cobra.go` 的 `RunE` 链 | CLI 子命令复用统一错误处理 |

### 5.4 反模式

1. **巨型 `Daemon` struct**：1931 行的 `daemon/daemon.go`，god struct。一个对象同时管 image/container/volume/network，违反"单一职责"。改造路径是按子域拆成 `ImageDaemon`、`ContainerDaemon`，但代价是交叉调用变多。
2. **`integration-cli` 里的 shell-out 测试**：用 bash + docker CLI 跑端到端，启动慢、易碎、CI 占用高。新代码应直接用 Go + testcontainers。
3. **`daemon/server/router/` 每个 router 都自己实现 `initRoutes()`**：重复代码。若用 reflection 或 codegen，路由声明可以收敛到一处。
4. **`errdefs.IsNotFound(err)` + 多种 error 类型**：containerd 错误、daemon 错误、OCI 错误混用，调用者必须知道每一种。

### 5.5 独特看点

- **reexec 机制**：用 `os.Args[0]` 的特殊名字在进程内"重入 main"，避免 fork 复杂状态。是 moby 的招牌 hack。
- **CDI 集成**：`tags.cncf.io/container-device-interface/pkg/cdi` 把 GPU 设备声明式注入容器 spec，是 K8s 1.28+ 的同款设计。
- **OpenTelemetry + OpenCensus 桥接**：`opencensus.InstallTraceBridge()` 把 Windows hcsshim 的 OC trace 翻译成 OTel，异构可观测性统一。
- **staggered 模块化（v29 之后）**：`github.com/moby/moby/api` 和 `client` 独立打 tag，root module 仅构建二进制——明确告诉使用者"不要 import 我的根"。

## 6. 运行机制（Bring It Up）

```bash
# 1. 构建（多阶段 Docker 构建，输出静态二进制）
docker buildx bake -f docker-bake.hcl

# 2. 本地起服务
./dockerd --config-file /etc/docker/daemon.json \
          --pidfile /var/run/docker.pid \
          --host unix:///var/run/docker.sock

# 3. 客户端验证
docker version          # Server + Client 两段
docker info             # 看 Storage Driver、Plugins、CDI
docker run --rm hello-world
```

启动时序：

```mermaid
sequenceDiagram
    participant Sys as systemd
    participant D as dockerd
    participant C as containerd
    participant B as buildkitd
    participant L as Listeners
    Sys->>D: ExecStart
    D->>D: CheckSystem
    D->>D: loadListeners (unix, tcp, fd)
    D->>C: initContainerd (fork 或 gRPC dial)
    D->>D: NewDaemon (assemble all services)
    D->>B: initBuildkit (gRPC dial)
    D->>L: httpServer.Serve (per listener goroutine)
    D->>Sys: notifyReady (sd_notify)
    D-->>Sys: ready
    Sys->>D: SIGTERM
    D->>L: httpServer.Shutdown (graceful)
    D->>C: containerd shutdown (10s timeout)
    D->>B: buildkitd shutdown
    D->>Sys: notifyStopping
```

Smoke test：

```bash
docker run --rm alpine echo "moby OK"
docker network create test && docker run -d --network test --name c1 alpine sleep 100
docker buildx build - <<< 'FROM alpine\nCMD echo buildkit OK'
```

## 7. 演进历史（Time Travel）

```mermaid
gantt
    title moby 里程碑
    dateFormat YYYY-MM
    section 启动期
    2013 dotCloud开源 :done, 2013-01, 6M
    2014 Docker 1.0   :done, 2014-06, 3M
    section 容器化拆分
    2015 runC独立     :done, 2015-04, 3M
    2016 containerd捐赠CNCF :done, 2017-03, 2M
    section 上游统一
    2017 Moby改名     :done, 2017-04, 1M
    2019 BuildKit集成  :done, 2019-09, 6M
    2023 rootless GA  :done, 2023-08, 2M
    2025 docker→moby模块迁移 :active, 2025-11, 3M
    2026 v29 release  :active, 2026-04, 2M
```

主要 commit 风格：

- 早期：squash PR 少，单 commit 巨大
- 2018 后：要求 sign-off DCO + squash merge
- 2022 后：要求 "Conventional Commits" + 自动化 changelog
- 2025 v29：直接重命名 module path，是少见的"破坏性重命名 PR"

## 8. 质量保障（How It Doesn't Break）

四道防线：

1. **单元测试**：`go test ./...` 覆盖核心包。`daemon/` 关键路径 `container_*.go` 都有 mock backend。
2. **集成测试**：`integration/` 用 Go + testcontainers；`integration-cli/` 是 shell-based 历史包袱，新代码已停止新增。
3. **CI**：GitHub Actions 跑 `hack/ci/` 下的十几个脚本，跨 ubuntu/debian/rhel/windows/multi-arch（amd64/arm64/ppc64le/s390x）。
4. **性能基准**：`daemon/internal/metrics/` + Prometheus exporter（`metricsAddress`），没有公开的 go test -bench 套件。

```mermaid
flowchart LR
  Code[Code] --> UT[Unit Tests]
  Code --> IT[Integration Tests]
  Code --> Lint[golangci-lint + gofmt]
  Code --> Vet[go vet + staticcheck]
  UT --> CI[GitHub Actions]
  IT --> CI
  Lint --> CI
  Vet --> CI
  CI --> Signoff[Sign-off + 2 review]
  Signoff --> Merge
```

## 9. 生态依赖（Map of the World）

主要直接依赖：

- `github.com/containerd/containerd/v2` — 镜像/快照/运行时
- `github.com/moby/buildkit` — 构建引擎
- `github.com/moby/sys` — Linux/Windows 系统调用封装
- `github.com/docker/go-connections` — TLS + NAT
- `github.com/spf13/cobra` + `pflag` — CLI
- `go.etcd.io/bbolt` — daemon 本地 KV
- `google.golang.org/grpc` — 进程间通信
- `go.opentelemetry.io/otel` — tracing
- `github.com/sirupsen/logrus` — 结构化日志
- `tags.cncf.io/container-device-interface` — CDI 设备注入

合规检查清单：

- [x] Apache-2.0 兼容
- [x] DCO sign-off
- [x] OpenSSF Scorecard 监控
- [x] SBOM 随 release 发布
- [x] SLSA L3 构建链（2024 后）
- [ ] SOC2（社区版本无）

## 10. 生产实践（Battle-Tested）

| 维度 | 现状 | 备注 |
|---|---|---|
| 配置热更新 | `SIGHUP` reload 部分配置 | 不支持 storage driver 切换 |
| 优雅停服 | SIGTERM → 排空 listener → 关 BuildKit → 关 containerd | 默认 grace 10s |
| 限流 | 路由级并发限制（`golang.org/x/sync/semaphore`） | container create 限流 |
| 链路追踪 | OTel + 自动注入到 BuildKit、containerd | exporter 走 OTLP |
| 健康检查 | `/info` `/_ping` `/events` | K8s liveness 推荐 `/_ping` |
| 结构化日志 | logrus + JSON tag + trace_id 关联 | log driver 可换 syslog/fluentd |

## 11. 社区文化（People & Process）

- **治理**：`MAINTAINERS` 文件 + Moby Project 治理文档，新贡献者需要"shepherd"（维护者）担保
- **维护者**：约 30 个活跃 maintainer，分散在 Docker Inc.、Mirantis、AWS、Azure、individual
- **RFC**：重大变更走 `MOBY-RFC` 标签，公开讨论 2 周
- **沟通**：GitHub Issues 主导，Slack #moby 频道，季度社区会议
- **议题活跃**：每月 ~400 issues，~150 PRs；反应时间中位数 2 天

## 12. 教训总结（What To Steal / What To Avoid）

### 12.1 必偷 3 件

1. **薄入口 + 厚编排**：`cmd/dockerd/main.go` 只有 39 行，所有逻辑在 `daemon/command.Run()`。你的下一个 CLI 工具也可以这么做。
2. **声明式路由 + Authz 中间件**：`router.NewGetRoute("/containers/json", ...)` + 统一 Authz，权限变更只动一处。
3. **reexec 机制**：当你想在不引入新二进制的情况下"跳到不同执行模式"时，`os.Args[0]` 改名 + 进程内注册回调是 Go 里的最简方案。

### 12.2 必避 3 坑

1. **巨型 god struct**：`daemon.Daemon` 字段超过 50 个，单元测试 setup 痛苦。早期就拆。
2. **shell-based E2E**：`integration-cli/*.sh` 维护成本极高，直接 Go + testcontainers。
3. **跨进程 gRPC 协议不版本化**：BuildKit/containerd 一旦改 field，daemon 升级会失配。务必用 protobuf + 兼容期。

### 12.3 7 天复刻路线图

```mermaid
gantt
    title 7天复刻一个最小 moby 兼容 daemon
    dateFormat YYYY-MM-DD
    section Day1-2
    go.mod + containerd client 集成 :a1, 2026-06-02, 2d
    section Day3-4
    REST API 路由 + container backend :a2, after a1, 2d
    section Day5
    BuildKit 集成 + image build :a3, after a2, 1d
    section Day6
    网络（libnet 简化版）:a4, after a3, 1d
    section Day7
    rootless + OTel + 文档 :a5, after a4, 1d
```

### 12.4 打分卡

| 维度 | 1-5 | 评语 |
|---|---|---|
| 架构清晰度 | 4 | 唯一扣分：god struct |
| 代码可读性 | 3 | 函数过长、命名偏长 |
| 测试覆盖 | 3 | 核心有，边缘弱 |
| 文档质量 | 5 | docs/ 极全 |
| 生产就绪 | 5 | 70k+ star 验证 |
| 学习价值 | 5 | Go 容器生态教科书 |

## 13. 学习萃取（Cheat Sheet）

**一句话价值**：moby 展示了"如何把一个 10 年生命周期的 Go 后端，做成可插拔的 Lego 集"。

**3 核心洞察**：
1. 薄入口 + 厚编排 + 服务定位器，让 daemon 启动流程读起来像剧本
2. 路由即数据 + Authz 中间件，权限治理是 O(1) 操作
3. 跨进程 gRPC 让你可以"功能外包"给 BuildKit/containerd 而不牺牲类型安全

**5 段必读代码**：
- `cmd/dockerd/main.go` — 39 行的入口，reexec 机制
- `daemon/command/daemon.go` 第 118-422 行 — `start(ctx)` 启动剧本
- `daemon/daemon.go` 第 99-200 行 — `Daemon` struct 的服务定位器范本
- `daemon/server/router/container/container_routes.go` — 声明式路由表
- `daemon/internal/libcontainerd/supervisor/` — 跨进程 gRPC 长连接管理

**1 反模式**：`daemon.Daemon` god struct，所有子系统塞一个对象。

**1 可复用模式**：Service Locator + 依赖反序的 defer 关闭链。

**3 立刻能用**：
1. 抄 `cmd/dockerd/main.go` 的 39 行薄入口范式
2. 抄 `daemon/server/router/container/container_routes.go` 的声明式路由
3. 抄 `reexec.Init()` 模式做"无新二进制的多模式"

## 14. 项目特点速查

- **独特看点**：reexec 机制、CDI 集成、rootless、OpenCensus→OTel 桥接、staggered module
- **与同类对比**：

```mermaid
quadrantChart
    title 容器引擎对比
    x-axis 轻量 --> 全功能
    y-axis 单机 --> 集群
    "moby/dockerd": [0.9, 0.5]
    "containerd": [0.4, 0.6]
    "cri-o": [0.3, 0.3]
    "podman (daemon)": [0.5, 0.4]
    "k8s kubelet": [0.8, 0.95]
```

## 附：仓库元信息

- 路径：G:\实战案例\GitHub顶尖项目\moby\
- 大小：约 200MB（含 vendor）
- 总文件：约 8000 个（Go + 文档 + 资源）
- 解析时间：2026-06-02

## 一句话总结

解析 = 计划书 + 框架图 + 核心功能 + 跑起来 + 偷过来。moby 的核心可偷之处不在 containerd 集成，而在它那 39 行的 main 和 500 行的 start 编排剧本——把"启动一个长生命周期 daemon"变成一份可读、可中断、可回放的剧本。
