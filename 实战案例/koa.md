# koa - 极简 Node.js Web 框架（洋葱模型）

**GitHub**: koajs/koa
**Star**: 35k+
**语言**: JavaScript
**主题**: web-framework / middleware / async-await / onion-model / nodejs
**适用场景**: Node Web 服务 / 轻量 API 网关 / 微服务 / 中间件开发

---

## 第一段：基础范式

### 模式 1 - `compose` 递归 dispatch（中间件先入后出）

**问题场景**：Web 框架需要"请求前/响应后"对称处理（鉴权在请求前、计时在响应后）。Express 用回调嵌套语义混乱；手写 `Promise` 链啰嗦。

**解决方案**：`koa-compose` 独立 npm 包，`compose(middleware)` 返 `function(context, next)`；内部 `dispatch(i)` 递归到第 i 层，`i <= index` 守卫防 `next()` 多次调用。`await fn(ctx, dispatch.bind(null, i+1))` 注入 next。

**关键参数**：
- `middleware` 中间件数组顺序敏感
- `dispatch(i)` 递归到第 i 层
- `index` 已执行序号防重入
- `next` 链尾可选
- `await fn(ctx, dispatch.bind(null, i+1))`

**最佳实践**：`next()` 调多次会抛 `next() called multiple times`；中间件**总是**在 `await next()` 前后各放一段逻辑；跳出整条链 `ctx.respond = false`；调试时打印 `i` 看递归深度 > 30 多半是死循环；任何"递归中间件"项目可借鉴此范式。

### 模式 2 - `ctx` 三件套代理（4 对象 1 行访问）

**问题场景**：Koa 实际有 4 个对象：`ctx` / `ctx.request`（KoaRequest）/ `ctx.req`（Node IncomingMessage）/ `ctx.response`（KoaResponse）。让用户手写 4 层调用是反人类。

**解决方案**：`lib/context.js` 用 `delegates` npm 包代理：`delegate(proto, 'response').method('attachment').access('status').access('body').getter('headerSent')` 把 60+ 个方法/属性挂到 ctx；`delegate(proto, 'request')` 同样代理。

**关键参数**：
- `delegate(proto, 'response')` 60+ 代理
- `.method('attachment')` 仅方法
- `.access('body')` 读写属性
- `.getter('headerSent')` 只读
- `delegates` npm 包
- `proto.cookies` 懒解析

**最佳实践**：`ctx.body = obj` 自动 `JSON.stringify` + `Content-Type: application/json`；`ctx.redirect('/login', 301)` 设 301；`ctx.throw(404, 'Not Found')` 抛 `HttpError`；`ctx.respond = false` 跳过自动写响应（WebSocket/SSE）；自定义代理方法写 KoaRequest 而**不是** ctx；任何"对象代理"项目可借鉴此范式。

### 模式 3 - `body` setter 多态（string/Buffer/Stream/JSON/Blob）

**问题场景**：HTTP 响应可能是字符串（HTML）、Buffer（二进制）、Stream（大文件）、JSON（API）、Blob（fetch）。每个手动设 Content-Type + Length + res.end 是反模式。

**解决方案**：`response.js` 的 `set body(val)` 多态分支：`string` 自动识 `<` 设 html/text + `Buffer.byteLength`；`Buffer.isBuffer` 设 `Content-Length`；`Stream` 走 `val.pipe(this.res)`；`Blob` 走 Blob 路径；`object` 设 json。

**关键参数**：
- `typeof val === 'string'` HTML/text
- `Buffer.isBuffer(val)` 二进制
- `val instanceof Stream` 大文件流
- `val instanceof Blob` Web Blob
- `typeof val === 'object'` JSON
- `_body` 私有存储

**最佳实践**：`ctx.body = '<div>'` 自动设 `text/html`；大文件**必须** `fs.createReadStream()` 而**不是** `fs.readFileSync`；`ctx.body = null` 不写 body（保持已有）；`ctx.body = ''` 清空；Stream 模式 Koa 监听 `error` 事件转 `ctx.onerror`；任何"多态 setter"项目可借鉴此范式。

### 模式 4 - `is-stream` 鸭式判断（跨 Node 版本识别）

**问题场景**：Node 12 之前 `require('stream')` 与之后不同；用户可能传 `{ pipe, on }` 鸭子对象。`instanceof Stream` 在边界模块下漏。

**解决方案**：`lib/is-stream.js` 用 `typeof val.pipe === 'function' && typeof val.on === 'function'` 鸭子判断；`val !== null` 排除（`typeof null === 'object'`）；`typeof val === 'object'` 排除 primitive。

**关键参数**：
- `typeof val.pipe === 'function'` 必备
- `typeof val.on === 'function'` EventEmitter
- `val !== null` 排除 null
- `typeof val === 'object'` 排除 primitive
- `isReadable` / `isWritable` 同理

**最佳实践**：自定义 Stream-like 对象只要有 `pipe/on` 就被识别（feature）；body setter 走 pipe 路径；不可用 `instanceof` 的场景：子进程 `process.stdin` 来自不同 realm；鸭子判断升级 Node 主版本不挂；Web Stream `ReadableStream` 有 `pipeTo` 但没 `pipe.on` 单独走 Blob 路径；任何"鸭子类型"项目可借鉴此范式。

### 模式 5 - `only` 白名单（ctx.toJSON 不暴露敏感字段）

**问题场景**：日志系统、错误监控要序列化整个 ctx。但 ctx 有 `req`（含 cookie header）、`res`（含 socket fd）等敏感对象，`JSON.stringify(ctx)` 会爆 + 泄露。

**解决方案**：`lib/only.js` 接受 `obj` + `keys` 字典白名单：`for (const key of Object.keys(obj)) { if (keys[key]) ret[key] = obj[key] }`；`Array.isArray(keys)` 抛错（数组视为"全留"危险）；浅拷贝不递归。

**关键参数**：
- `obj` 待白名单对象
- `keys` 允许的键字典 `{app:1, req:1}`
- `ret` 结果对象只含白名单
- `Array.isArray(keys)` 拒绝
- `Object.keys(obj)` 遍历自身可枚举

**最佳实践**：`ctx.toJSON()` 默认白名单 + `state`——业务可往 `ctx.state` 塞任意数据并安全序列化；自定义白名单 `only(ctx, {method:1, url:1})`；**不要**把 `req.headers.cookie` 加白名单会泄露 session；`state.reqId` 加进白名单方便链路追踪；任何"安全序列化"项目可借鉴此范式。

---

## 第二段：扩展范式

### 模式 6 - `Application` + `Emitter` 继承（实例方法 = 事件）

**问题场景**：Web 框架要支持"应用级"事件（启动、错误、监听），但又不想把 Express 那种"一坨静态方法"塞进全局。

**解决方案**：`class Application extends Emitter`：`use(fn)` 链式注册；`callback()` 走 `compose(this.middleware)`；`if (!this.listenerCount('error')) this.on('error', err => ...)` 默认错误监听；`subdomainOffset` / `proxyIpHeader` / `maxIpsCount` 配置项。

**关键参数**：
- `middleware` 数组 `[]`
- `subdomainOffset=2` 子域切片
- `proxyIpHeader='X-Forwarded-For'`
- `maxIpsCount=0` IP 链不切
- `env=process.env.NODE_ENV`
- `use(fn)` 链式返回 this

**最佳实践**：`app.use(a).use(b).use(c)` 链式注册；`app.on('error', err => log(err))` 监听；`app.listen(3000)` 是 `http.createServer(app.callback()).listen` 糖；多 Koa 实例复用各自 middleware 数组；切分子域 `app.subdomainOffset = 3`；任何"事件驱动应用"项目可借鉴此范式。

### 模式 7 - `createContext` 工厂（每请求一份新 ctx）

**问题场景**：Node HTTP 模型是"每请求一份新 req/res"，但 ctx 需要"把 req/res/request/response 全部关联"。手动拼装易漏；共享会出并发 bug。

**解决方案**：`createContext(req, res)` 用 `Object.create(proto)` 共享原型每请求新对象；5 路反向引用 `context.app = request.app = response.app = this`；4 套对象互相引 `ctx.req === request.req === response.req`；`context.state = {}` 业务传值桶。

**关键参数**：
- `Object.create(proto)` 共享原型
- `context.app = this` 5 路反向引用
- `req/res/request/response` 4 套互引
- `context.state = {}` 业务传值
- `originalUrl` 原始 URL 路由改后仍能拿

**最佳实践**：`ctx.state.user = user` 鉴权中间件赋值下游直接用；**不要**给 `ctx` 加自有属性（`Object.create` 加属性会污染所有请求）；`ctx.originalUrl` 区别 `ctx.url`（前者是原始）；`context.state` 初始化为 `{}` **不要**在 app 构造预设默认值；任何"每请求上下文"项目可借鉴此范式。

### 模式 8 - `ctx.onerror` 集中兜底（中间件零 try-catch）

**问题场景**：传统 Express 中间件要 `try { ... } catch (next) { next(err) }` 显式传错。Koa 靠链尾统一 catch 让业务中间件零错误处理。

**解决方案**：`onerror(err)` 抹掉已写 header（一旦写入不能再改 status）；`err instanceof Error` 守卫；`err.status || 500` 兜底；`res.end(err.message)` 直接结束；`app.emit('error', err, this)` 业务监听。

**关键参数**：
- `err instanceof Error` 类型守卫
- `headerSent` 已写 header 标记
- `err.status || 500` 兜底状态码
- `res.end(err.message)` 直接结束
- `app.emit('error', err, this)` 业务监听

**最佳实践**：`ctx.throw(404, 'Not Found')` 是 `throw Object.assign(new Error('Not Found'), {status: 404})` 糖；`app.on('error', err => log(err))` 丢 Sentry；已写 header 后报错只能 `res.destroy()`（没法改 status）；自定义 `app.context.onerror = function(err) {}` 全局改；任何"集中错误处理"项目可借鉴此范式。

### 模式 9 - `handleRequest` 调度（异步错误 + 响应兜底）

**问题场景**：用户中间件抛 `Promise.reject`，Node 默认 `unhandledRejection` 直接崩。需要在 `handleRequest` 这层 `.catch` 接住转 `ctx.onerror`。

**解决方案**：`handleRequest(ctx, fnMiddleware)`：`res.statusCode = 404` 默认；`onerror = err => ctx.onerror(err)`；`onFinished(res, onerror)` 连接断开也触发；`fnMiddleware(ctx).catch(onerror)`。`respond()` 决定写 body：`statuses.empty[code]` 走空 body（204/205/304）；`body.pipe ? body.pipe(res) : res.end(body)`。

**关键参数**：
- `res.statusCode = 404` 默认
- `onFinished(res, onerror)` 连接断开兜底
- `ctx.respond === false` 跳过自动
- `ctx.writable` 可写检测
- `statuses.empty[code]` 204/205/304
- `body.pipe` 走 stream 路径

**最佳实践**：`app.proxy = true` + `app.proxyIpHeader = 'X-Real-IP'` 部署反代后正确取 IP；`ctx.respond = false` 给 SSE/WebSocket 自己 `res.write()` + `res.end()`；客户端断连中间件仍跑用 `ctx.req.aborted` 检查；`ctx.length` 是字节数**不是**字符数（中文 UTF-8 3 字节）；任何"异步错误兜底"项目可借鉴此范式。

### 模式 10 - `search-params` URLSearchParams 封装（querystring 跨版本）

**问题场景**：`querystring` 是 Node 内置老 API（`parse`/`stringify`）用对象形式；`URLSearchParams` 是 Web 标准（`append`/`get`）。两种 API 在不同 Node 版本出现。

**解决方案**：`class URLSearchParams extends globalURL.URLSearchParams`：`get(name) { return super.get(name) || null }`（无则 null）；`set(name, value)` 单值覆盖不 append；`sort()` 返回 this 链式；用 Web 标准 `globalURL.URLSearchParams` 跨 Node 18+。

**关键参数**：
- `get(name)` 取值无则 null
- `set(name, value)` 单值覆盖
- `toString()` 序列化
- `sort()` 排序缓存
- `globalURL.URLSearchParams` Web 标准

**最佳实践**：`ctx.query` 是 `URLSearchParams` 实例直接 `q.get('key')`；`ctx.querystring` 是字符串**不是**对象；`?a=1&a=2` 用 `getAll('a')` 取多值；`URLSearchParams` 可迭代 `for (const [k, v] of params)`；**不要**用 `node:querystring` Koa 已迁移到 URLSearchParams；任何"标准 API 封装"项目可借鉴此范式。

---

## 第三段：进阶范式

### 模式 11 - Stream pipe 替代 Buffer（大文件响应内存爆）

**问题场景**：用户传 `ctx.body = fs.readFileSync('huge.zip')` 给 1GB 文件，内存峰值 1GB。Stream pipe 边读边写，内存稳定在 64KB。

**解决方案**：`set body(val)` 检测 `val instanceof Stream`：`this.res.once('pipe', onfinish)` 监听写完触发 `ctx.app.emit('finish', ctx)`；`this.res.once('error', onerror)` 错误转 `ctx.onerror`；`remove('Content-Length')` 未知长度 HTTP/1.1 用 chunked；`shouldKeepAlive = false` 大文件避免长连接。

**关键参数**：
- `val.pipe(this.res)` 边读边写
- `res.once('pipe', onfinish)` 监听写完
- `res.once('error', onerror)` 错误监听
- `remove('Content-Length')` 不设长度
- `shouldKeepAlive = false` 关 keep-alive

**最佳实践**：大文件**必须** `fs.createReadStream()` **绝不** `readFileSync`；`Range` header 由 Koa 自动处理（`Accept-Ranges: bytes`）；Stream 模式不会自动设 `Content-Type` 记得 `ctx.type = 'video/mp4'`；中间件提前 `ctx.respond = false` 接管 res 后再 pipe；Stream 模式 `errored` 事件转 `ctx.onerror`；任何"流式响应"项目可借鉴此范式。

### 模式 12 - `onFinished` 钩子（响应完成后通知）

**问题场景**：业务要"响应结束后"做清理（关闭文件描述符、写监控指标），但 HTTP 协议层无事件。`on-finished` 包能监听 `res` 的 `finish`/`close` 事件。

**解决方案**：`handleRequest` 内 `onFinished(ctx.res, onerror)` 响应结束（成功或失败）时触发。timer 中间件：先 `Date.now()` 记 start → `yield next` → 算 `ms = Date.now() - start` → `ctx.set('X-Response-Time', ${ms}ms)`。`on-finished` 是基础设施。

**关键参数**：
- `onFinished(res, cb)` 监听响应结束
- 客户端断连也触发
- 错误响应也触发
- 流式响应完整 pipe 完才触发
- `err` 参数错误时非空

**最佳实践**：`X-Response-Time` 中间件基于 on-finished 写耗时；监控 metrics 写入 `onFinished` 回调 `metrics.responseTime.observe(ms)`；数据库连接释放 `onFinished` 回调 `connection.release()`；**不要**在 `ctx.body` setter 里手动调 on-finished 框架自动装；`on-finished` 不会重复触发内部用 flag 守卫；任何"响应后回调"项目可借鉴此范式。

### 模式 13 - `request.fresh` 协商缓存（304 Not Modified 零拷贝）

**问题场景**：客户端 `If-None-Match` 带 ETag 服务端不查就 200，浪费带宽。fresh 检查 ETags + Last-Modified 一致性。

**解决方案**：`get fresh()` 仅对 GET/HEAD 检查；`(s >= 200 && s < 300) || s === 304` 范围内；`freshEtag()` 解析 `if-none-match` 多值；`freshNotModified()` 比 `if-modified-since` 时间；`etag === '*' || etag === response.etag` 强校验。

**关键参数**：
- `ctx.fresh` bool 缓存有效
- `If-None-Match` 客户端 ETag
- `If-Modified-Since` 客户端时间
- `response.etag` 服务端 ETag
- `parseTokenList` 解析多值 ETag
- `*` 匹配强校验

**最佳实践**：`if (ctx.fresh) ctx.status = 304; return`；`ctx.response.etag = crypto.createHash('md5').update(body).digest('hex')`；静态资源 `ctx.set('ETag', etag)` 配合 `Cache-Control: max-age=...`；`ctx.fresh` 只对 GET/HEAD 生效 POST 永远 false；304 不写 body Koa 自动 `res.end()`；任何"协商缓存"项目可借鉴此范式。

### 模式 14 - `accepts` 内容协商（Accept 头决定响应格式）

**问题场景**：同一接口 `/users/123`，浏览器要 HTML、App 要 JSON。手动解析 `Accept` 头繁琐。

**解决方案**：`accepts(...args) { return this.negotiator.types(...args) }`；用法 `if (ctx.accepts('html')) { ctx.body = render('user', user) } else if (ctx.accepts('json')) { ctx.body = user } else { ctx.throw(406) }`。`acceptsEncodings` / `acceptsCharsets` / `acceptsLanguages` 同样模式。

**关键参数**：
- `ctx.accepts('html', 'json')` 第一个匹配
- `ctx.acceptsEncodings('gzip')` 压缩
- `ctx.acceptsCharsets('utf-8')` 字符集
- `ctx.acceptsLanguages('en')` 语言
- `negotiator` 内部 npm 包
- 406 Not Acceptable 都不匹配

**最佳实践**：`ctx.accepts(['html', 'json'])` 数组形式第一个匹配；写 API 用 `if (!ctx.accepts('json')) ctx.throw(406)`；配合 `ctx.type = 'json'` 避免回写 Content-Type；accepts 解析 O(n) header tokens 不在热路径 cache；浏览器通常发 `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8` 多值；任何"内容协商"项目可借鉴此范式。

### 模式 15 - `cookies` 懒解析（读 cookie 不每次 parse）

**问题场景**：每个 `ctx.cookies.get('sid')` 都重新 parse `req.headers.cookie` 性能差。

**解决方案**：`get cookies()` 懒查：`if (!this[COOKIES]) { this[COOKIES] = new Cookies(this.req, this.res, { keys: this.app.keys, secure: this.request.secure }) }`；`set cookies(_cookies)` 显式 setter；`ctx.cookies.set('name', 'value', { httpOnly: true, maxAge: 900000, signed: true })`。

**关键参数**：
- `httpOnly` JS 不可读
- `secure` 仅 HTTPS
- `maxAge` 过期毫秒数
- `expires` 绝对过期 Date
- `signed` HMAC 签名
- `sameSite` CSRF 防护
- `overwrite` 同名覆盖

**最佳实践**：session **一定要** `httpOnly: true + signed: true`；调试 cookie 失败先看 Network 面板 Response headers 的 `Set-Cookie`；`app.keys = [process.env.SECRET_KEY]` 是签名密钥**数组**（可轮换）；`ctx.cookies.get('sid', { signed: true })` 校验签名（没传 signed 不会验）；SameSite 默认 `false` 要主动设；任何"懒解析 + 安全 cookie"项目可借鉴此范式。

---

## 第四段：实战范式

### 模式 16 - v1 → v2 → v3 演进（generator → async/await → AsyncLocalStorage）

**问题场景**：Koa 1.x 用 generator（`function* + yield next`），2.x 改 async/await，3.x 引入 `AsyncLocalStorage` 隔离请求上下文。三代 API 互相破坏性升级。

**解决方案**：v1 → v2 迁移 `function*` → `async`，`yield` → `await`，`this` → `ctx`；v3 新增 `const { AsyncLocalStorage } = require('async_hooks')` + `requestStore.run(ctx, () => next())`；业务可 `requestStore.getStore()` 取 ctx。

**关键参数**：
- 1.x generator `(this, next) => yield next` 历史
- 2.x async/await `(ctx, next) => await next()` 主流
- 3.x + AsyncLocalStorage 当前
- 4.x 计划 Stream-first RFC

**最佳实践**：新项目**只**用 2.x/3.x 不要学 generator；迁移旧项目 `function*` → `async`，`yield` → `await`，`this` → `ctx`；3.x `AsyncLocalStorage` 让 DB 连接、日志 trace id 跟随请求自动隔离；部署时锁 `koa@^2.13` 或 `^3.x` 不要用 `latest`（破坏性变更）；`migration-v1-to-v2.md` / `migration-v2-to-v3.md` 仓库自带必读；任何"大版本演进"项目可借鉴此范式。

### 模式 17 - `AsyncLocalStorage` 请求隔离（日志/DB 连接跟踪）

**问题场景**：用户登录后发起 10 个 DB 查询来自不同请求，DB middleware 怎么知道"当前 ctx 是哪个"？传参太丑，用 `cls-hooked` 又黑魔法。

**解决方案**：`const storage = new AsyncLocalStorage()`；`handleRequest` 内部 `return storage.run(ctx, () => fnMiddleware(ctx).catch(onerror))`；业务 `async function dbQuery(sql) { const ctx = storage.getStore(); ctx.logger.info({sql}, 'db query'); return pool.query(sql) }`。

**关键参数**：
- `storage.run(ctx, fn)` 启动隔离
- `storage.getStore()` 取当前 ctx
- `async_hooks` Node 内置
- 异步链路跟踪跨 await
- 多实例互不干扰

**最佳实践**：业务库用 `storage.getStore()` 取 ctx 比 `req` 全局变量好；**不要**在 storage 放**大对象**（如 1MB user profile）会增加 GC 压力；同步代码里 `getStore()` 返回 ctx 是当次请求的 `try/catch` 也能拿；`process.domain` 已废弃**只**用 AsyncLocalStorage；koa 3.x 内部已用它跟踪 ctx 业务层可以建第二个 storage；任何"请求级状态传递"项目可借鉴此范式。

### 模式 18 - `proxies` 反代支持（X-Forwarded-For / X-Real-IP）

**问题场景**：Nginx 转发后 `ctx.ip` 永远是 `127.0.0.1`，`ctx.host` 是 `localhost`。需要解析反代 header。

**解决方案**：`get ip()` 检查 `this.app.proxy`：信任时 `proxyIps = this.ips`；`get ips()` 解析 `this.app.proxyIpHeader in this.headers` 逗号分隔；`slice(0, this.app.maxIpsCount)` 防伪造；`get host()` 优先 `X-Forwarded-Host` 后 `Host`。

**关键参数**：
- `app.proxy` 是否信任反代
- `app.proxyIpHeader` IP header 名
- `app.maxIpsCount` IP 链最大长度
- `ctx.ips` IP 链数组
- `ctx.host` 域名不含端口
- `ctx.protocol` http/https

**最佳实践**：`app.proxy = true` **必须**显式开启（不开启时 `ctx.ip` 是直连 IP）；`app.maxIpsCount = 1` 防 `X-Forwarded-For: 1.1.1.1, 127.0.0.1` 攻击；Nginx 配置 `proxy_set_header X-Real-IP $remote_addr` + `app.proxyIpHeader = 'X-Real-IP'`；`ctx.protocol === 'https'` 时 `ctx.secure = true` 给 cookie `secure: true` 用；任何"反代 IP 解析"项目可借鉴此范式。

### 模式 19 - 中间件生态（裸 Koa 啥都不带）

**问题场景**：Koa 设计哲学是"核心最小、生态丰富"，新用户不知道要装哪些包。

**解决方案**：典型生产栈 9 件套：`Koa` + `@koa/router` 路由 + `koa-bodyparser` 解析 JSON + `@koa/cors` 跨域 + `koa-helmet` 安全 header + `koa-logger` 访问日志 + `koa-compress` gzip/br + `koa-static` 静态资源 + `koa-session` session。错误兜底中间件**放在最前** `try { await next() } catch (err) { ctx.status = err.status || 500; ctx.body = {error: err.message} }`。

**关键参数**：
- `@koa/router` 路由
- `koa-bodyparser` 解析 JSON body
- `@koa/cors` 跨域配置 origin
- `koa-helmet` 安全 header
- `koa-logger` 访问日志
- `koa-compress` gzip/br 压缩
- `koa-static` 静态资源
- `koa-session` session Redis/Knex store

**最佳实践**：**不要**用 `koa-router` 已改名 `@koa/router`（Koa 团队新包）；错误兜底中间件**放在最前** `await next()` 让所有下游错误都接住；`koa-bodyparser` 默认 1MB body 大文件 `koa-bodyparser({jsonLimit: '10mb'})`；`koa-session` 用 Redis 存 `new RedisStore({client: redisClient})`；`koa-helmet` 默认 CSP 太严开发时关 CSP；任何"框架 + 生态"项目可借鉴此范式。

### 模式 20 - 测试矩阵（node:test 原生测试 + 77 case）

**问题场景**：Koa 3.x 切到 Node 内置 `node --test`，避免 jest/mocha 依赖。需要在 18/20/22 三个 LTS 版本跑全测试。

**解决方案**：`__tests__/application/test.js` 用 `const test = require('node:test')` + `const assert = require('assert')` + `const request = require('supertest')`；`test('app.use 注册中间件', async () => { const app = new Koa(); app.use((ctx) => { ctx.body = 'hello' }); const server = app.listen(); const res = await request(server).get('/'); assert.equal(res.status, 200); assert.equal(res.text, 'hello'); server.close() })`。

**关键参数**：
- `node --test` 原生测试无依赖
- `node:test` 命名空间 describe/it
- `supertest` HTTP 模拟 npm
- `assert.equal` 严格等 ===
- `server.close()` 清理避免挂起
- `node.js.yml` CI 18/20/22 矩阵

**最佳实践**：Koa 3.x **完全**用 `node:test` 其他项目可学（避免 jest 配置地狱）；写中间件测试**优先**测洋葱模型（`order` 数组）不只测返回值；错误处理测试 `app.use(() => { throw new Error('boom') })` + 验证 500；CI 在 3 个 Node LTS 版本跑 `.github/workflows/node.js.yml` 已配；`request(app.callback())` 直接传入 `supertest` 自动处理；任何"原生测试"项目可借鉴此范式。
