# gin - Go 生态最流行的 HTTP Web 框架

**GitHub**: gin-gonic/gin
**Star**: 82k+
**语言**: Go
**主题**: Web 框架 / HTTP router / 中间件
**适用场景**: REST API / 微服务 / 中小到大型 Go 后端

---

## 第一段：基础范式（模式 1-5）

### 模式 1：httprouter 风格路由

**问题场景**：标准库 `net/http` 路由手写 `if-else` 难维护；动态参数解析繁琐。

**解决方案**：Gin 基于 julienschmidt/httprouter 的 radix tree，零分配路由查找；`/users/:id` 路径参数；`/static/*filepath` 通配。

**关键参数**：
- `r := gin.Default()`
- `r.GET("/users/:id", handler)`
- `c.Param("id")` 拿路径参数
- `c.Query("name")` 拿查询参数
- `*filepath` 通配

**最佳实践**：路由按业务分组 `r.Group("/api/v1")`；具体路由放前面防通配吞。

### 模式 2：Handler 与 Context

**问题场景**：每个 handler 都要从 `request` 解析参数、设置响应，代码冗长。

**解决方案**：Gin 把 `*gin.Context` 注入 handler；`c.JSON()` / `c.String()` / `c.HTML()` 链式 API；`c.Set()` / `c.Get()` 跨中间件传值。

**关键参数**：
- `func(c *gin.Context)`
- `c.JSON(200, gin.H{"key": "value"})`
- `c.String(200, "hello")`
- `c.HTML(200, "index.html", data)`
- `c.Set("user", u); u2 := c.MustGet("user").(*User)`

**最佳实践**：handler 越薄越好；`c.MustGet` 拿值；错误用 `c.AbortWithStatusJSON()`。

### 模式 3：中间件链

**问题场景**：鉴权 / 日志 / 限流 / CORS 多道处理；手写中间件难统一。

**解决方案**：`func(c *gin.Context)` 形式中间件；`r.Use(mw)` 全局；`r.Group("/api", auth)` 分组；`c.Next()` 跳下一步；`c.Abort()` 终止。

**关键参数**：
- `r.Use(gin.Logger(), gin.Recovery())`
- `r.Group("/api/v1", AuthMiddleware())`
- `c.Next()`
- `c.AbortWithStatusJSON(401, gin.H{"error": "..."})`
- `defer c.Next()` 前置逻辑

**最佳实践**：Recovery 中间件必装（防 panic）；自定义中间件包 `func() gin.HandlerFunc` 工厂。

### 模式 4：参数绑定与验证

**问题场景**：JSON / form / query 参数解析；类型校验。

**解决方案**：`c.ShouldBindJSON(&user)` 自动绑定 struct；`binding:"required,email,min=6"` tag 校验；`ShouldBindQuery` / `ShouldBindUri` / `ShouldBindXML`。

**关键参数**：
- `c.ShouldBindJSON(&user)`
- `c.ShouldBindQuery(&query)`
- `c.ShouldBindUri(&uri)`
- `binding:"required,email,min=6,max=100"`
- `validate:"-"` 跳过

**最佳实践**：所有入参用 struct 接收 + `binding` tag；400 错误统一处理。

### 模式 5：响应渲染

**问题场景**：JSON / XML / YAML / HTML / 文件下载 / 重定向。

**解决方案**：`c.JSON()` / `c.XML()` / `c.YAML()` / `c.HTML()` / `c.File()` / `c.Redirect()`；`c.Render(code, render.JSON{Data: obj})` 自定义渲染。

**关键参数**：
- `c.JSON(200, data)`
- `c.IndentedJSON(200, data)` 缩进
- `c.SecureJSON(200, data)` 防 JSON 劫持
- `c.JSONP(200, data)` 跨域
- `c.Render(200, render.JSON{Data: obj})`

**最佳实践**：API 统一 JSON；`SecureJSON` 防 `[]` 开头被劫持；`IndentedJSON` 仅 debug。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：路由分组与版本

**问题场景**：API 版本管理 / 公共中间件按组挂载。

**解决方案**：`r.Group("/v1")` / `r.Group("/v2")` 多版本；`Group` 上挂中间件只对子路由生效。

**关键参数**：
- `v1 := r.Group("/v1")` 
- `v1.Use(AuthMiddleware())`
- `v1.GET("/users", listUsers)`
- 嵌套 `admin := v1.Group("/admin", AdminAuth())`
- `r.Group("/api", CORS())` 全局中间件

**最佳实践**：每个版本一个 Group；版本 URL 显式 `/v1` 不用 header；废弃 API 走 `/v2`。

### 模式 7：错误处理

**问题场景**：统一错误响应；中间件 + handler 错误传递。

**解决方案**：`c.Error(err)` 收集错误；`c.AbortWithStatusJSON()` 立即返回；自定义错误处理函数。

**关键参数**：
- `c.Error(err)` 累积
- `c.AbortWithStatusJSON(400, gin.H{"error": err.Error()})`
- `c.Errors` 数组
- `gin.ErrorTypePublic` 分类
- `gin.Recovery()` panic 恢复

**最佳实践**：业务错误返 4xx；系统错误 5xx；`c.Error` 累积不阻断；自定义 error code 字段。

### 模式 8：日志与配置

**问题场景**：生产日志格式 / 配置文件 / 多环境。

**解决方案**：`gin.LoggerWithFormatter` 自定义格式；JSON 格式走 `logrus` / `zap`；`r.MaxMultipartMemory` 配上传；env 配 `os.Getenv`。

**关键参数**：
- `gin.LoggerWithConfig(gin.LoggerConfig{Formatter: func(p gin.LogFormatterParams) string {...}})`
- `gin.LoggerWithWriter(io.Discard)` 关掉
- `r.MaxMultipartMemory = 8 << 20` 8 MB
- `r.TrustedPlatform` 代理头

**最佳实践**：生产 JSON 日志走 zap；Gin 默认 logger 太啰嗦换自定义；`os.Getenv` 配配置。

### 模式 9：优雅停服

**问题场景**：K8s 滚动更新丢请求；CTRL-C 直接退出。

**解决方案**：`http.Server` 配 `BaseContext` / `Shutdown(ctx)`；`signal.NotifyContext` 监听 SIGTERM；先停监听再等请求完成。

**关键参数**：
- `srv := &http.Server{Addr: ":8080", Handler: r}`
- `go srv.ListenAndServe()`
- `quit := make(chan os.Signal, 1); signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)`
- `<-quit; ctx, cancel := context.WithTimeout(...); srv.Shutdown(ctx)`

**最佳实践**：生产必 graceful shutdown；30s 超时；先停监听再处理 in-flight。

### 模式 10：测试

**问题场景**：Gin handler 单测；HTTP mock。

**解决方案**：`httptest.NewRecorder()` + `r.ServeHTTP(w, req)`；`ginkgo` / `testify` 断言；`gock` mock 外部 API。

**关键参数**：
- `w := httptest.NewRecorder()`
- `req := httptest.NewRequest("GET", "/users/1", nil)`
- `r.ServeHTTP(w, req)`
- `assert.Equal(t, 200, w.Code)`
- JSON 解析 `json.Unmarshal(w.Body.Bytes(), &resp)`

**最佳实践**：handler 100% 覆盖；E2E 走真服务；`go test -race` 检测竞态。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：自定义中间件

**问题场景**：业务自定中间件（鉴权 / 限流 / 链路追踪）。

**解决方案**：写 `func(c *gin.Context)` 函数；`c.Set/Get` 传值；`c.Next()` 跳下一步；`c.Abort()` 终止。

**关键参数**：
- `func JWTAuth() gin.HandlerFunc { return func(c *gin.Context) {...} }`
- `c.Set("user", u); c.Next()`
- `c.AbortWithStatusJSON(401, ...)`
- `defer func() { if r := recover(); r != nil {...} }()`

**最佳实践**：中间件可组合；副作用在 `c.Next()` 之前；用 defer 处理 panic。

### 模式 12：性能优化

**问题场景**：高并发 API 优化；内存分配 / GC 压力。

**解决方案**：`gin.SetMode(gin.ReleaseMode)` 关 debug 模式；`c.Copy()` 复制 context；sync.Pool 复用对象；`sonic` 替代 `encoding/json`。

**关键参数**：
- `gin.SetMode(gin.ReleaseMode)`
- `r.Use(gzip.Gzip(gzip.DefaultCompression))`
- `c.Copy()` 避免并发
- `json.NewDecoder` 流式
- `sync.Pool` 复用

**最佳实践**：生产 ReleaseMode；JSON 序列化用 `sonic`（字节开源）；`c.Copy()` 走 goroutine。

### 模式 13：数据库集成

**问题场景**：GORM / Ent / sqlx / sqlc ORM 选型。

**解决方案**：`GORM` 全功能 ORM；`Ent` Facebook schema-first；`sqlx` SQL + struct；`sqlc` SQL → Go code-gen；`database/sql` + `pgx`。

**关键参数**：
- GORM `db.Find(&users)`
- Ent `client.User.Query().All(ctx)`
- sqlc 生成 `Queries.GetUser(ctx, id)`
- `pgxpool` 连接池
- `sql.Open("postgres", dsn)`

**最佳实践**：新项目 sqlc 或 Ent；老项目 GORM 兼容；连接池调优。

### 模式 14：微服务

**问题场景**：服务发现 / 熔断 / RPC。

**解决方案**：`go-micro` / `go-zero` / `kratos` 微服务框架；`consul` / `etcd` / `nacos` 服务发现；`hystrix-go` / `sony/gobreaker` 熔断；`grpc-go` RPC。

**关键参数**：
- `grpc.Dial(addr, grpc.WithInsecure())`
- `consul.RegisterService(...)`
- `gobreaker.NewCircuitBreaker(settings)`
- `prometheus.NewCounterVec(...)` 指标

**最佳实践**：内部 RPC 走 gRPC；服务发现 K8s 走 DNS；熔断 + 降级必加。

### 模式 15：WebSocket 与 SSE

**问题场景**：实时通信（聊天 / 推送）。

**解决方案**：`gorilla/websocket.Upgrader` 升级 HTTP → WS；`c.Request, c.Writer` 升级握手；SSE 走 `c.SSEvent("name", data)`。

**关键参数**：
- `upgrader.Upgrade(c.Writer, c.Request, nil)`
- `conn.ReadMessage()` / `WriteMessage()`
- `c.Stream(func(w io.Writer) bool { c.SSEvent("tick", t); return true })`
- 心跳 / 重连

**最佳实践**：WS 走 gorilla/websocket；SSE 单向推送首选；心跳防断连。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：项目结构

**问题场景**：Gin 单 `main.go` 几百行膨胀；分层。

**解决方案**：`cmd/server/main.go` + `internal/handler/` + `internal/service/` + `internal/repository/` + `internal/model/` + `pkg/middleware/` + `router/router.go`。

**关键参数**：
```
cmd/server/main.go
internal/
  handler/user.go
  service/user.go
  repository/user.go
  model/user.go
pkg/middleware/auth.go
router/router.go
config/config.go
```

**最佳实践**：严格分层；config 用 `viper`；`pkg` 放可复用；`internal` 私有。

### 模式 17：监控与可观测性

**问题场景**：服务监控 / 链路追踪 / 错误聚合。

**解决方案**：`prometheus/client_golang` 暴露 `/metrics`；`OpenTelemetry` SDK 配 `otelgin`；`Sentry` 配 `sentry-go`；`pprof` 配 `net/http/pprof`。

**关键参数**：
- `promhttp.Handler()` `/metrics`
- `otelgin.Middleware("service-name")`
- `sentry.Init(sentry.ClientOptions{Dsn: ...})`
- `net/http/pprof` 暴露
- `trace.SpanFromContext(ctx)`

**最佳实践**：三件套 logging + tracing + metrics；Sentry 配 release；`pprof` 仅内网暴露。

### 模式 18：Docker 化

**问题场景**：Gin 应用容器化部署。

**解决方案**：多阶段构建 `golang:1.22 AS build → gcr.io/distroless/static`；`EXPOSE 8080`；`HEALTHCHECK`；Alpine 镜像（注意 musl libc）。

**关键参数**：
- `FROM golang:1.22 AS build`
- `RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o app`
- `FROM gcr.io/distroless/static`
- `COPY --from=build /app /app`
- `EXPOSE 8080`
- `ENTRYPOINT ["/app"]`

**最佳实践**：distroless 镜像最小；`CGO_ENABLED=0` 静态链接；`HEALTHCHECK` 配 K8s 探针。

### 模式 19：性能基准

**问题场景**：Gin 极限 QPS 多少？

**解决方案**：`wrk -t4 -c100 -d30s http://localhost:8080/`；`vegeta` 持续压测；`pprof` profile；`Hey` 简单压测。

**关键参数**：
- `wrk -t4 -c100 -d30s http://localhost:8080/`
- `vegeta attack -duration=30s -rate=1000 | vegeta report`
- `go test -bench=. -benchmem`
- `pprof http://localhost:6060/debug/pprof/profile`

**最佳实践**：Hello world 10w+ QPS；含 DB 1-3w QPS；持续压测找瓶颈。

### 模式 20：迁移与生态

**问题场景**：Gin → Fiber / Echo / go-zero 迁移？

**解决方案**：Gin API 与 Express 风格类似，迁移到 net/http 系框架（Echo）平移；迁 fasthttp 系（Fiber）注意库兼容。go-zero 走微服务架构升级。

**关键参数**：
- Gin → Echo API 类似
- Gin → Fiber 注意 fasthttp 差异
- Gin → go-zero 走微服务
- 共享 DB / 业务代码

**最佳实践**：单体应用 Gin 够；微服务选 go-zero/kratos；性能极限选 Fiber。
