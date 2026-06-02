# express - Node.js 生态事实标准 Web 框架

**GitHub**: expressjs/express
**Star**: 66000+
**语言**: JavaScript
**主题**: Web 框架 / Node.js / 中间件
**适用场景**: REST API / SSR / 微服务 / 中间件生态底座

---

## 第一段：基础范式（模式 1-5）

### 模式 1：中间件链（Middleware Chain）

**问题场景**：HTTP 请求要经过鉴权/解析/日志/限流多道处理，每个路由都加一段 if-else 难维护。

**解决方案**：Express 把请求处理抽象成中间件链 `(req, res, next) => {}`，按 `app.use(path, mw)` 顺序执行。`next()` 传控制权；`next(err)` 跳错误处理。

**关键参数**：
- `app.use(mw)` 全局
- `app.use('/api', mw)` 路径前缀
- `app.get('/path', handler)` 路由
- `next('route')` 跳下一个路由

**最佳实践**：中间件按"日志→CORS→body 解析→鉴权→路由"顺序注册；永远 `next()` 不在中间件后 return 阻断。

### 模式 2：路由系统

**问题场景**：URL 路径参数解析 + 方法分发 + RESTful 资源路由。

**解决方案**：Express `Router()` 拆子路由；路径参数 `app.get('/users/:id', ...)`；`router.route('/').get().post().put().delete()` 链式定义。

**关键参数**：
- `req.params.id` 路径参数
- `req.query` 查询参数
- `req.body` body 解析
- `Router({mergeParams: true})` 合并父参数

**最佳实践**：子路由按资源/版本拆分 `/v1/users` / `/v1/orders`；用 Router 避免 `app` 巨型单文件。

### 模式 3：请求与响应对象

**问题场景**：HTTP 头/状态码/JSON 序列化手写繁琐。

**解决方案**：`res.json(obj)` / `res.status(404).json(err)` / `res.sendFile()` / `res.cookie()` / `res.redirect()` 链式 API；`req` 扩展 `req.body` / `req.cookies` / `req.ip`。

**关键参数**：
- `res.json()` / `res.send()` / `res.end()`
- `res.status(code).json()`
- `res.setHeader` / `res.set()`
- `res.cookie(name, val, opts)`

**最佳实践**：响应统一 JSON `{code, data, msg}` 结构；用 `res.locals` 存请求级数据。

### 模式 4：模板引擎与视图

**问题场景**：服务端渲染 HTML（SSR/邮件模板），多模板引擎不统一。

**解决方案**：`app.set('view engine', 'pug|ejs|handlebars')`；`res.render('index', {data})` 渲染。`app.engine('hbs', expbhs.engine())` 自定义扩展名。

**关键参数**：
- `app.set('views', './views')`
- `res.render('tpl', locals)`
- `app.locals.appName = 'foo'` 全局
- EJS `<%= %>` 转义 / `<%- %>` 不转义

**最佳实践**：SSR 场景 pug/ejs；纯 API 用不到；模板缓存默认开。

### 模式 5：静态资源托管

**问题场景**：HTML/CSS/JS/图片静态资源需要服务出去。

**解决方案**：`express.static('public')` 中间件；多目录 `app.use(express.static('public'), express.static('uploads'))`；配 `maxAge` 缓存 + `etag`。

**关键参数**：
- `express.static(root, {maxAge: '1d', etag: true, index: 'index.html'})`
- `fallthrough: true|false`
- `setHeaders: (res, path) => res.setHeader(...)`
- 路径前缀 `app.use('/static', express.static('public'))`

**最佳实践**：静态资源上 CDN；本地用 `maxAge` 强缓存 + 文件名 hash 防 stale。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：错误处理

**问题场景**：同步/异步错误冒泡到框架层需要统一处理；避免 try-catch 散落。

**解决方案**：Express 4 错误中间件 `(err, req, res, next) => {}`，4 个参数识别。`next(err)` 跳错误处理。Async 错误用 `express-async-errors` 自动捕获。

**关键参数**：
- `app.use((err, req, res, next) => res.status(500).json(err))`
- `next(err)` 显式跳
- `app.use((req, res) => res.status(404))` 兜底
- `process.on('unhandledRejection')` 全局

**最佳实践**：错误处理必 4 参数；用 `express-async-errors` 包装；统一状态码 4xx 业务错 / 5xx 系统错。

### 模式 7：子应用与 Router 拆分

**问题场景**：大型项目路由/中间件集中在一个 `app` 上难维护；需要多租户/多版本隔离。

**解决方案**：`express.Router()` 子路由 + `app.use('/api/v1', v1Router)` 挂载；`express()` 子应用独立中间件栈，挂到 `app.use('/admin', subApp)`。

**关键参数**：
- `const router = express.Router({mergeParams: true})`
- `app.use('/api', router)`
- `app.use(mountPath, subApp)`
- `subApp.set('env', 'production')`

**最佳实践**：按业务/版本拆 Router；子应用只挂载公共中间件，私有中间件内部注册。

### 模式 8：Body 解析与文件上传

**问题场景**：JSON / form-data / multipart 上传解析。

**解决方案**：`express.json()` / `express.urlencoded({extended: true})` 内置；multipart 走 `multer` 中间件。`raw` / `text` 也支持。

**关键参数**：
- `express.json({limit: '1mb'})`
- `express.urlencoded({extended: false})`
- `multer({storage, fileFilter, limits})`
- `req.file` / `req.files`

**最佳实践**：body 限大小防 DoS；multer 走 memoryStorage 配合 S3 SDK 流式上传。

### 模式 9：CORS 与安全

**问题场景**：跨域请求被浏览器拦截；XSS/CSRF 攻击。

**解决方案**：`cors` 中间件配 origin / methods / credentials；`helmet` 设安全头（X-Frame-Options / CSP / HSTS）。`csurf` CSRF token。

**关键参数**：
- `cors({origin: 'https://app.com', credentials: true})`
- `helmet()` 默认 15+ 安全头
- `express-rate-limit` 限流
- `cookie-parser` + `sameSite: 'lax'`

**最佳实践**：生产 helmet + cors + rate-limit 必加；cookie sameSite strict 防 CSRF。

### 模式 10：日志与监控

**问题场景**：请求日志缺失 / 性能难监控 / APM 集成。

**解决方案**：`morgan` 请求日志（combined / common / dev / tiny 格式）；APM 走 `New Relic` / `DataDog` / `Sentry`。`req.id` 配 `cls-hooked` 链路追踪。

**关键参数**：
- `morgan('combined')` Apache 日志
- `morgan(':method :url :status :res[content-length] - :response-time ms')` 自定义
- 流式输出 + 切分日志
- Sentry `Sentry.init({dsn})`

**最佳实践**：开发 `morgan('dev')`；生产 `combined`；日志走 pino/winston 结构化 + JSON。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：性能优化

**问题场景**：Node 单线程 + 同步中间件 = 整站卡死；QPS 上不去。

**解决方案**：`compression` 压缩响应；`cluster` 模式多核；`--max-old-space-size=8192` 调堆；中间件按耗时排序；用 `pino` 异步日志。

**关键参数**：
- `compression({level: 6})`
- `cluster.fork()` 多进程
- PM2 cluster mode
- `keepAliveTimeout` 优化

**最佳实践**：压测 `autocannon` 找瓶颈；生产必 compression + cluster；监控 event loop lag。

### 模式 12：与现代框架对比

**问题场景**：Express 老旧？Fastify/Koa/NestJS 哪个选？

**解决方案**：Express 简单生态最丰富；Koa 极简 async-first；Fastify 比 Express 快 2-3x；NestJS 类 Spring 架构。新项目按需选。

**关键参数**：
- Koa `ctx` 单对象
- Fastify schema 校验内建
- NestJS 装饰器 DI
- Hapi 路由优先

**最佳实践**：中型项目 Express OK；高 QPS 选 Fastify；大型工程 NestJS；微服务 Express 仍是最快上手。

### 模式 13：TypeScript 集成

**问题场景**：JS 写 Express 缺类型；req/res 扩展属性乱。

**解决方案**：`@types/express` + 模块声明合并 `declare global { namespace Express { interface Request { user?: User } } }`。ts-node-dev / tsx 开发。

**关键参数**：
- `import express, { Request, Response, NextFunction } from 'express'`
- `Request<{id: string}>` 路径参数
- `Response<{msg: string}>` body
- `interface AuthedRequest extends Request { user: User }`

**最佳实践**：自定义类型放 `types/express.d.ts`；Express 5.x 原生支持 async / Promise；TypeScript 5+ 走 strict。

### 模式 14：测试

**问题场景**：HTTP handler / 中间件难测；E2E 慢。

**解决方案**：`supertest` 跑 in-process HTTP 请求；`jest` / `vitest` 单元；`nock` mock 外部 HTTP。`chai` BDD 断言。

**关键参数**：
- `request(app).get('/api').expect(200)`
- `supertest.agent(app)` 持久 cookie
- `nock('https://api.foo').get('/x').reply(200, {...})`
- `jest.mock('../db')` 模块 mock

**最佳实践**：handler 100% 覆盖；E2E 走 supertest 不启真服务；mock 外部 API。

### 模式 15：WS / SSE / 实时

**问题场景**：WebSocket 长连接、Server-Sent Events 流式响应。

**解决方案**：`ws` + `express` 共享 `http.Server`；SSE 走 `res.write('data: ...\n\n')` 流。`socket.io` 高层封装（房间/重连）。

**关键参数**：
- `const server = http.createServer(app); new WebSocketServer({server})`
- SSE `res.setHeader('Content-Type', 'text/event-stream')`
- socket.io `io.on('connection', socket => ...)`
- 心跳 / 重连策略

**最佳实践**：WS 走 `ws`（轻量）或 `socket.io`（生态）；SSE 单向推送首选。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：项目结构与分层

**问题场景**：Express 单 `app.js` 几百行膨胀；controllers/services/routes 混在一起。

**解决方案**：经典分层 `routes/ → controllers/ → services/ → repositories/`；`middlewares/` + `utils/` + `config/` + `validators/`。DI 用 `awilix` / `inversify`。

**关键参数**：
- `routes/` 只做 URL → controller 映射
- `controllers/` 拿 req/res 调 service
- `services/` 业务逻辑
- `repositories/` 数据访问

**最佳实践**：分层禁止跨层调用；error middleware 统一捕获；DTO/Validator 在 controller 入口。

### 模式 17：生产部署

**问题场景**：直接 `node app.js` 部署后内存泄漏 / 进程挂了不拉起 / 零停机发布。

**解决方案**：PM2 cluster mode + `ecosystem.config.js`；Docker 多阶段构建 + `node:20-alpine`；Nginx 反代 + HTTPS；健康检查 `/health`。

**关键参数**：
- PM2 `instances: 'max'` / `exec_mode: 'cluster'`
- `pm2 reload` 零停机
- Docker `HEALTHCHECK CMD wget -qO- http://localhost:3000/health`
- 蓝绿 / 滚动发布

**最佳实践**：生产必 PM2 + cluster + 反代；zero-downtime reload；监控 memory + event loop lag。

### 模式 18：数据库集成

**问题场景**：连接池 / 事务 / ORM 选择。

**解决方案**：`mongoose`（Mongo）/ `prisma` / `typeorm` / `knex` / `sequelize`；`pg` / `mysql2` 原生驱动。`connect-mongo` session。

**关键参数**：
- `mongoose.connect(uri, {maxPoolSize: 10})`
- Prisma schema-first
- TypeORM decorator
- 事务 `db.transaction(async tx => ...)`

**最佳实践**：Prisma 是新项目首选；连接池配合理大小；慢查询监控 + 索引优化。

### 模式 19：微服务与网关

**问题场景**：Express 服务拆成微服务，API 网关聚合。

**解决方案**：Kong / Nginx / 自研 `http-proxy-middleware` 转发；服务发现走 Consul / Nacos / K8s Service。`express-gateway` 框架。

**关键参数**：
- `http-proxy-middleware({target, changeOrigin: true})`
- JWT 网关校验
- rate limit 网关层
- tracing 跨服务

**最佳实践**：网关层做认证/限流/聚合；服务间 mTLS 或 JWT；tracing 跨服务用 OpenTelemetry。

### 模式 20：可观测性（Observability）

**问题场景**：线上问题难复现 / 不知道慢在哪 / 错误链路追不到。

**解决方案**：`pino` 结构化日志 + `pino-http` 自动请求日志；`OpenTelemetry` SDK 走 traces/metrics/logs 推后端（Jaeger / Tempo / Honeycomb）；Sentry 错误聚合。

**关键参数**：
- `pino({level: 'info'})` + `pino-http()`
- `OTEL_EXPORTER_OTLP_ENDPOINT` 配置
- `Sentry.init({tracesSampleRate: 0.1})`
- `req.id` 链路 ID

**最佳实践**：三件套 logging + tracing + metrics；Sentry 配 release + sourcemap；trace 跨服务传递 `traceparent`。
