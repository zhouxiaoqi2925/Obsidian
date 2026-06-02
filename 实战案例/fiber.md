# fiber - Go 生态最快的 Web 框架（Express 风格）

**GitHub**: gofiber/fiber
**Star**: 33000+
**语言**: Go
**主题**: Web 框架 / Go / 性能
**适用场景**: 高 QPS API / 微服务 / 替代 Express 到 Go

---

## 第一段：基础范式（模式 1-5）

### 模式 1：fasthttp 替代 net/http

**问题场景**：标准库 `net/http` 每个请求分配大量对象，高并发下 GC 压力；性能不如 Node Express。

**解决方案**：Fiber 基于 `valyala/fasthttp`（零分配 HTTP 解析器），把 `http.Request` / `http.ResponseWriter` 换成 `fasthttp.RequestCtx`，复用对象池。

**关键参数**：
- `app := fiber.New(config)`
- `app.Get("/", func(c *fiber.Ctx) error { ... })`
- `c.SendString("hello")` / `c.JSON(...)`
- `c.Params("id")` 路径参数
- `c.Query("name")` 查询参数

**最佳实践**：需要与 `net/http` 生态共存时配 `adaptor.HTTPHandler` 桥接；纯 Fiber 项目性能最佳。

### 模式 2：路由系统

**问题场景**：动态路由 + 参数解析 + 优先级匹配。

**解决方案**：Fiber 用自定义 radix tree 路由（基于 `gofiber/fiber/v2`），支持路径参数 `:id`、通配 `*splat`、可选 `?`、约束 `/user/:id<int>`。

**关键参数**：
- `app.Get("/users/:id", ...)` 路径参数
- `app.Get("/files/*", ...)` 通配
- `:id<int>` 类型约束
- `app.Route("/api").Get(...).Post(...)` 链式
- `app.Use("/api", middleware)` 中间件

**最佳实践**：路由放最具体在前面；用 Group 拆版本；约束类型减少误匹配。

### 模式 3：中间件链

**问题场景**：鉴权/限流/日志/CORS 多道处理。

**解决方案**：Fiber `func(c *fiber.Ctx) error` 形式中间件；`app.Use(...)` 注册；`c.Next()` 跳下一步。内置 20+ 中间件（`logger`、`recover`、`cors`、`jwt`、`limiter`、`compress`）。

**关键参数**：
- `app.Use(logger.New())` 内置
- `app.Use("/api", auth)` 路径前缀
- `c.Next()` 跳
- `c.Locals("user", u)` 请求级数据
- `return c.Next()` vs `return c.Status(403).SendString("denied")`

**最佳实践**：中间件顺序注册；用 `c.Locals` 传数据；错误用 `return c.Status(...).JSON(...)`。

### 模式 4：请求与响应

**问题场景**：Body 解析、表单、文件上传、Cookie、Header。

**解决方案**：`c.Body()` / `c.BodyParser(&user)` / `c.FormValue("name")` / `c.File(...)` / `c.Cookie(...)` / `c.Get("Header")`。

**关键参数**：
- `c.BodyParser(&user)` JSON/form/multipart
- `c.FormFile("file")` 单文件
- `c.MultipartForm()` 多文件
- `c.Cookies("name")` / `c.Cookie(&fiber.Cookie{...})`
- `c.Set("X-Foo", "bar")` header

**最佳实践**：body 解析失败返 400；文件上传配 `MaxBodySize`；cookie 配 `Secure + HttpOnly + SameSite`。

### 模式 5：配置与启动

**问题场景**：超时、Body 限制、代理头、优雅停机。

**解决方案**：`fiber.Config{...}` 配；`app.Listen(":3000")` 启动；`app.Shutdown()` 优雅停。

**关键参数**：
- `ReadTimeout: 5 * time.Second`
- `WriteTimeout: 5 * time.Second`
- `BodyLimit: 4 * 1024 * 1024`
- `EnableTrustedProxyCheck: true`
- `app.Listen(":3000")` / `app.ListenTLS(...)`

**最佳实践**：生产必设超时；配 `ProxyHeader: "X-Forwarded-For"`；SIGTERM 优雅停服。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：错误处理

**问题场景**：统一错误响应 / 自定义错误码 / HTTPException。

**解决方案**：`c.Status(400).JSON(fiber.Map{"error": ...})`；`ErrorHandler` 全局钩子；自定义 `*fiber.Error`。

**关键参数**：
- `app := fiber.New(fiber.Config{ErrorHandler: func(c, err) { ... }})`
- `return fiber.NewError(404, "msg")`
- `c.Status(400).JSON(...)`
- `c.Next(err)` 跳错误链

**最佳实践**：统一 `{code, msg, data}` 结构；4xx 业务错 / 5xx 系统错；ErrorHandler 配 Sentry。

### 模式 7：WebSocket

**问题场景**：实时通信（聊天 / 推送）。

**解决方案**：`github.com/gofiber/contrib/websocket` 提供 `websocket.New(handler)`；`conn.WriteMessage` / `ReadMessage`。

**关键参数**：
- `app.Get("/ws", websocket.New(func(c *websocket.Conn) { ... }))`
- `conn.WriteMessage(websocket.TextMessage, []byte("hi"))`
- 心跳 / 重连
- 房间管理

**最佳实践**：WS 单独走 `/ws` 路径；身份验证在 `app.Use`；客户端断线清理。

### 模式 8：视图模板

**问题场景**：服务端渲染 HTML（控制台 / 邮件）。

**解决方案**：`app.Views()` 配 HTML 引擎（`html`、`pug`、`handlebars`、`mustache`）；`c.Render("index", data)`。

**关键参数**：
- `app := fiber.New(fiber.Config{Views: engine})`
- `c.Render("index", fiber.Map{"title": "x"})`
- 模板缓存
- Layout 嵌套

**最佳实践**：SSR 用 `html/template`；前端 SPA 分离时不用。

### 模式 9：日志与监控

**问题场景**：请求日志 / Prometheus 指标 / APM。

**解决方案**：`logger` 内置中间件；`gofiber/adaptor` 桥接 `net/http` 配 `promhttp`；`expvar` 指标；Sentry 集成。

**关键参数**：
- `logger.New(logger.Config{Format: "${time} ${method} ${path} ${status} ${latency}"})`
- `monitor` 中间件
- `pprof` profiling
- Sentry `sentrygin`-like 包装

**最佳实践**：JSON 格式日志走 Loki；Prometheus 暴露 `/metrics`；生产开启 pprof。

### 模式 10：测试

**问题场景**：Fiber handler 单测 / HTTP 测试。

**解决方案**：`app.Test(req)` in-memory；`httptest` 桥接；`gofiber/fiber/v2/middleware/session` 测。

**关键参数**：
- `req := httptest.NewRequest("GET", "/", nil)`
- `resp, _ := app.Test(req)`
- `app.Test(req, -1)` 超时
- `app.Handler()` 拿 `http.Handler`

**最佳实践**：handler 100% 覆盖；E2E 走 `app.Test`；性能 `k6` 压测。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：性能调优

**问题场景**：高 QPS 场景优化（10万+）。

**解决方案**：`Prefork` 模式起多进程（与 nginx 配合）；`fasthttp` 零分配；`pool` 复用对象；`compress` 压缩。

**关键参数**：
- `fiber.New(fiber.Config{Prefork: true})`
- `app := fiber.New(fiber.Config{...})`
- `compress.New(compress.Config{Level: 4})`
- `etag.New()`
- `app.Server().MaxConnsPerIP = 50`

**最佳实践**：Prefork + nginx 翻倍 QPS；`uv` 工具压测；监控 goroutine 数。

### 模式 12：依赖注入

**问题场景**：DB / 配置 / 服务注入。

**解决方案**：用第三方 `gofiber/fiber/v2` 自带无 DI；社区 `go-fx` / `wire` / `uber-go/dig` 集成。`c.Locals` 跑请求级数据。

**关键参数**：
- `app.Use(func(c *fiber.Ctx) error { c.Locals("db", db); return c.Next() })`
- `dig.Invoke` 注入
- 闭包注入
- 第三方 fx

**最佳实践**：依赖用 fx/wire 注入；请求级数据走 `c.Locals`；handler 越薄越好。

### 模式 13：数据库与 ORM

**问题场景**：GORM / Ent / sqlx / Bun / sqlc 选型。

**解决方案**：`GORM` 全功能 ORM；`Ent` Facebook schema-first；`sqlx` SQL + struct 映射；`sqlc` SQL → Go code-gen；`Bun` 轻量 ORM。

**关键参数**：
- GORM `db.Find(&users)`
- Ent `client.User.Query().All(ctx)`
- sqlc 生成类型安全
- `database/sql` + `pgx`

**最佳实践**：新项目 sqlc（类型安全 + SQL 优先）或 Ent（schema 优先）；老项目 GORM 兼容。

### 模式 14：微服务

**问题场景**：服务发现 / 熔断 / 限流 / RPC。

**解决方案**：`go-kit` / `go-micro` / `kratos` 框架；`consul` / `etcd` 服务发现；`hystrix-go` 熔断；`grpc-go` RPC。

**关键参数**：
- `go-micro` 微服务框架
- `grpc-go` gRPC
- `consul` 注册中心
- `ratelimit` 限流

**最佳实践**：内部 RPC 走 gRPC；外部 HTTP 走 Fiber；服务发现 K8s 走 DNS。

### 模式 15：生产部署

**问题场景**：Docker 镜像 / 反代 / 健康检查。

**解决方案**：`Dockerfile` 多阶段构建 `FROM golang:1.22 AS build → FROM gcr.io/distroless/static`；Nginx 反代；`/health` `ready` 端点；graceful shutdown。

**关键参数**：
- `Distroless` 镜像
- `nginx` 反代 + HTTPS
- `livenessProbe` / `readinessProbe`
- `app.Shutdown()` SIGTERM

**最佳实践**：distroless 镜像最小；nginx 启 SSL；K8s liveness 探针 `/health`；readiness `/ready`。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：项目结构

**问题场景**：Fiber 单 `main.go` 几百行膨胀。

**解决方案**：`cmd/server/main.go` + `internal/handler/` + `internal/service/` + `internal/repository/` + `internal/model/` + `pkg/middleware/`。

**关键参数**：
```
cmd/server/main.go
internal/
  handler/user.go
  service/user.go
  repository/user.go
  model/user.go
pkg/middleware/auth.go
config/config.go
```

**最佳实践**：严格分层；config 用 `viper`；`pkg` 放可复用；`internal` 私有。

### 模式 17：与 Gin/Echo 对比

**问题场景**：Go 三大 Web 框架 Fiber / Gin / Echo 选哪个？

**解决方案**：Fiber 最快（fasthttp）；Gin 中庸（net/http）；Echo 简洁。Fiber 缺 net/http 生态（部分库不适配）。

**关键参数**：
- Fiber 基于 fasthttp
- Gin 基于 net/http
- Echo 简洁
- chi / iris 边缘

**最佳实践**：极致性能选 Fiber；生态兼容选 Gin；微服务选 go-zero / kratos。

### 模式 18：监控与追踪

**问题场景**：分布式追踪 / 性能监控 / 错误聚合。

**解决方案**：`OpenTelemetry` SDK 配 `otelgin`/`otelfiber`；`Sentry` 配 `sentry-go`；`pprof` 配 `net/http/pprof`。

**关键参数**：
- `otelfiber.Middleware()`
- `sentry.Init(sentry.ClientOptions{Dsn: ...})`
- `net/http/pprof` 暴露
- `trace.SpanFromContext(ctx)`

**最佳实践**：三件套 logging + tracing + metrics；Sentry 配 release；`pprof` 仅内网暴露。

### 模式 19：性能极限

**问题场景**：Fiber 极限 QPS 多少？

**解决方案**：本地 wrk 压测 Fiber `Hello world` 50万+ QPS；加业务逻辑 5-10万 QPS；Prefork + nginx 翻倍。

**关键参数**：
- Hello world 50w+ QPS
- 含 DB 1-3w QPS
- 含 PProf 5-10w QPS
- `prefork` 翻倍

**最佳实践**：压测找瓶颈（pprof）；连接池调优；`fasthttp.Server` 参数。

### 模式 20：迁移与生态

**问题场景**：Express 应用迁到 Fiber（语法类似）。

**解决方案**：Fiber 模仿 Express API（`app.Get` / `c.JSON` / `app.Use`），Go 编译型语言性能 5-10x 提升。注意 fasthttp 与 net/http 差异（部分库不兼容）。

**关键参数**：
- `c.JSON` ↔ `res.json`
- `c.SendString` ↔ `res.send`
- `c.Status(400)` ↔ `res.status(400)`
- `c.Params("id")` ↔ `req.params.id`

**最佳实践**：业务逻辑可平移；库依赖查 fasthttp 兼容；性能调优走 `Prefork`。
