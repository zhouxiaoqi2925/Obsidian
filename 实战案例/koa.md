---
title: koa
type: web-framework
lang: javascript
stars: 50k+
date: 2026-06-02
tags:
  - 开源项目
  - web-framework
  - middleware
  - nodejs
  - async-await
---

# koa · 项目深度解析

> Expressive HTTP middleware framework for node.js — 极简的 ~570 SLOC 核心，以 `async/await` 中间件（洋葱模型）为核心的 Web 框架。
> 来源：G:\实战案例\GitHub顶尖项目\koa\

## 写在前面：解析哲学

先骨架后血肉，先 What 后 Why，最后 How to steal。

本文档严格基于 `lib/` 目录下 7 个真实源文件（`application.js`/`context.js`/`request.js`/`response.js`/`is-stream.js`/`only.js`/`search-params.js`，共 2027 行 + README 与 4 份迁移指南）逐行阅读后撰写。**第 5 章节的 WHY 分析直接引用源码行号**，不是套话。

Koa 3.x 是 Node.js 生态"以中间件为唯一抽象"的极简 Web 框架代表——它把 Express 时代"中间件串联 + 回调"模式彻底推到 `async/await`，并通过 `(ctx, next)` 签名让"下游先跑，上游后跑"的洋葱模型原生化。这份解析的目的不是吹"作者多牛"，而是讲清楚它**怎么用 ~570 SLOC 做出一个工业级框架的"骨架"**，并标记哪些代码是真正值得偷的"设计杠杆"。

## 0. 解析前的 5 个准备

1. **克隆**：`git clone https://github.com/koajs/koa`（已本地 `G:\实战案例\GitHub顶尖项目\koa`）
2. **分类**：Web 框架 / Node.js / 中间件 / MIT
3. **问题清单**：
   - Koa 的洋葱模型如何在 JS 运行时实现？
   - `ctx.body` 怎么同时支持 string/Buffer/Stream/JSON/Blob/Web `Response`？
   - 错误如何在中间件链中"向上冒泡"？
   - `ctx` 究竟是什么？`ctx.request`、`ctx.req`、`ctx.response`、`ctx.res` 四层关系？
   - Koa v1 → v2 → v3 演进了什么（generator → async/await → AsyncLocalStorage）？
4. **速查表**：
   - 入口：`lib/application.js`（类 `Application extends Emitter`）
   - 三件套：`lib/{context,request,response}.js`（纯对象原型 + delegates 代理）
   - 组合器：外部依赖 `koa-compose`（`compose(this.middleware)`）
   - 运行时：Node.js ≥ 18，依赖 `http-errors` / `cookies` / `accepts` / `delegates` / `koa-compose` / `statuses` / `on-finished`
5. **锁定 commit**：v3.2.1（2025-02 后的 3.x 稳定线，3.0.0-alpha.3 发布于 2025-02-11）

## 1. 开发计划书（Project Charter）

| 维度 | 内容 |
|---|---|
| 项目名 | koa |
| 定位 | Expressive HTTP middleware framework for node.js |
| 核心问题 | 摆脱 Connect/Express 时代"中间件只是函数串联、无 async/await 串接"的痛点 |
| 目标用户 | Node.js 后端开发者，特别是需要"中间件前后双向处理"的业务（鉴权/日志/错误） |
| 商业模式 | MIT 开源 + OpenCollective 赞助（`docs/` 含 `FUNDING.yml`） |
| 复刻难度 | ★★☆（核心 200 行；真正难度在错误处理与 stream 边界） |
| 当前状态 | 活跃，3.x 稳定线持续维护，每月发版节奏（GitHub Releases + `np` 工具） |
| 核心团队 | dead_horse（发起人，yahoo 系）、jonathanong、niftylettuce；社区治理 |
| 里程碑 | v1.0 (2014, generator) → v2.0 (2017, async/await) → v3.0 (2023, AsyncLocalStorage) |

## 2. 项目框架（Repo Skeleton Map）

Koa 是个**微型 monorepo 仅 1 个 npm 包**——它把"框架骨架"压到 7 个源文件 + 3 个测试帮助文件，**所有"业务中间件"都被推到 npm 生态（`koa-router`/`koa-bodyparser`/`koa-static`）**。

```mermaid
mindmap
  root((koa v3.2.1))
    核心源码 lib/
      application.js
        入口类 Application
        callback/handleRequest
        createContext
        onerror
      context.js
        proto + delegates
        cookies 缓存
        onerror
      request.js
        header/url/method
        accepts/fresh
        query/querystring
      response.js
        status/body setter
        redirect/attachment
        header helpers
      is-stream.js
        鸭式判断 Stream
      only.js
        白名单字段
      search-params.js
        URLSearchParams 封装
    文档 docs/
      guide.md
      api/{context,request,response,index}.md
      migration-v1-to-v2.md
      migration-v2-to-v3.md
      error-handling.md
      koa-vs-express.md
      faq.md
      troubleshooting.md
    测试 __tests__/
      application/
      context/
      request/
      response/
      lib/
      load-with-esm.test.js
    CI .github/
      workflows/
        node.js.yml
        npm-publish.yml
      dependabot.yml
      FUNDING.yml
    元信息
      package.json
      History.md
      AUTHORS
      LICENSE
      CODE_OF_CONDUCT.md
```

**目录树（精简）**：

```
koa/
├── lib/                      # 框架核心 (7 个文件)
│   ├── application.js        # 类 Application（入口）
│   ├── context.js            # 上下文原型 + delegates 代理
│   ├── request.js            # 请求代理 + 工具方法
│   ├── response.js           # 响应代理 + body 多态
│   ├── is-stream.js          # Stream 鸭式判断
│   ├── only.js               # 白名单 toJSON 工具
│   └── search-params.js      # URLSearchParams 封装
├── __tests__/                # node:test 原生测试 (4 个目录)
├── docs/                     # 8 份 markdown 文档
├── test-helpers/             # context.js / stream.js
├── package.json              # main: lib/application.js
├── History.md                # 变更日志（714 行）
├── Readme.md                 # 介绍
├── LICENSE                   # MIT
├── AUTHORS
├── CODE_OF_CONDUCT.md
├── .github/                  # CI / FUNDING / dependabot
├── .codecov.yml
├── .editorconfig
├── .mailmap
├── .gitignore
└── package-lock.json
```

**配置入口**：`package.json` 锁版本 `3.2.1`，`main: "lib/application.js"`，`engines.node: ">=18"`，测试用 Node 内置 `node --test`。
**代码入口**：`require('koa')` → 加载 `lib/application.js` → 导出 `Application` 类 + `HttpError`。

## 3. 项目画像（Profile）

| 维度 | 数值/描述 |
|---|---|
| 总文件数 | 111（含 `__tests__`/`docs`/`.github`） |
| 主语言 | JavaScript (CommonJS) |
| 涉及语言 | JavaScript（`dist/koa.mjs` 是 gen-esm-wrapper 生成的 ESM 包装） |
| 核心 SLOC | 2027 行（lib/ 7 个文件） |
| Star | 50k+（GitHub koajs/koa） |
| License | MIT |
| Docker | 无（Koa 自身不绑 Docker；用户用 koa 写应用时再选） |
| K8s | 无（应用层不涉及） |
| CI | GitHub Actions：`.github/workflows/node.js.yml` + `npm-publish.yml` |
| 有测试 | ✅ node:test（`__tests__/` 4 子目录，77 个 `*.test.js`） |
| 入口复杂度 | O(1)：单类 `Application extends Emitter` |
| 依赖数 | 19 个 prod deps（`package.json`） |

## 4. 架构设计（Architecture Deep Dive）

Koa 的架构是"**洋葱模型 + 三件套代理 + 中央错误处理**"三层结构。核心对象是 `ctx`（一个 `Object.create(context)` 而来的新对象），它身上挂载了 `app/req/res/request/response/state/originalUrl`，并通过 `delegates` 包把 `ctx.request` / `ctx.response` 的方法/属性**反射到 `ctx` 上**（这正是 `ctx.body = 'hi'` 能直接工作的原因）。

```mermaid
flowchart TD
    HTTP[Node http.IncomingMessage] -->|req/res| Ctx[ctx = Object.create context]
    Ctx -->|挂载| App[app = this]
    Ctx -->|挂载| Req[req = node req]
    Ctx -->|挂载| Res[res = node res]
    Ctx -->|挂载| Request[request = Object.create request]
    Ctx -->|挂载| Response[response = Object.create response]
    Ctx -->|挂载| State[state = {}]
    Ctx -->|delegates| Request
    Ctx -->|delegates| Response
    Request -->|getter/setter| Req
    Response -->|set body 多态| Res
    Ctx -->|throw 错误| Err[ctx.onerror]
    Err -->|app.emit| AppEvent[app error 事件]
    Err -->|res.end| Res
```

**核心架构 3 个看点**：

1. **洋葱模型中间件**（`koa-compose`）：用 `Promise` + 递归 `dispatch(i)` 实现"先入后出"的双向控制流——这是 Koa 与 Express 最大的语义差异。`next()` 返回 Promise，可以 `await`，使得"前/后处理"语义化（`await next()` 之前的代码是请求前，之后是响应后）。

2. **`ctx` 三件套代理**（`context.js` 末尾的 `delegate(proto, 'response')`）：用 `delegates` 包把 `request` / `response` 的 60+ 个方法/属性映射到 `ctx` 上（method/redirect/vary/status/headerSent/...），用户写 `ctx.body` 等价于 `ctx.response.body`，**既支持糖写法又不破坏 KoaRequest/KoaResponse 的内聚性**。

3. **零侵入错误处理**（`context.js:onerror` + `application.js:onerror`）：中间件抛错被 `handleRequest` 的 `.catch(onerror)` 抓住 → 转给 `ctx.onerror` → 抹除已写 header → 按 `err.status` 设置状态码 → 调 `res.end(msg)`。中间件**不需要写 try-catch**，靠链尾统一兜底——这是 Koa 优雅的关键。

```mermaid
sequenceDiagram
    participant C as 客户端
    participant N as node http server
    participant A as Application.callback
    participant K as koa-compose
    participant M1 as middleware #1
    participant M2 as middleware #2
    participant R as respond
    C->>N: GET /
    N->>A: (req, res)
    A->>A: createContext(req, res)
    A->>K: compose(this.middleware)(ctx)
    K->>M1: await next()
    M1->>M1: 请求前逻辑
    M1->>K: dispatch(1)
    K->>M2: await next()
    M2->>M2: 业务逻辑 ctx.body = 'hi'
    M2-->>K: return undefined
    K-->>M1: 回到 M1
    M1->>M1: 响应后逻辑 X-Response-Time
    M1-->>K: 链尾
    K-->>A: Promise resolved
    A->>R: respond(ctx)
    R->>N: res.end('hi')
    N-->>C: HTTP/1.1 200
```

## 5. 代码深度解析（带 WHY）⭐ 重点

### 5.1 找骨架代码

`lib/application.js` 是入口类（345 行），骨架三件套：

```javascript
// application.js:72-101  构造函数
constructor (options) {
    super()
    this.proxy = options.proxy || false
    this.subdomainOffset = options.subdomainOffset || 2
    this.proxyIpHeader = options.proxyIpHeader || 'X-Forwarded-For'
    this.maxIpsCount = options.maxIpsCount || 0
    this.env = options.env || process.env.NODE_ENV || 'development'
    this.compose = options.compose || compose
    if (options.keys) this.keys = options.keys
    this.middleware = []
    this.context = Object.create(context)        // 原型链挂载
    this.request = Object.create(request)        // 每个 app 共用原型
    this.response = Object.create(response)
    if (options.asyncLocalStorage) {
        this.ctxStorage = getAsyncLocalStorage(options)
    }
}
```

**WHY Object.create 而非 class extends**：
- `context.js` / `request.js` / `response.js` 全部以**纯对象字面量**导出（`module.exports = {...}`），不是 ES class。
- 每次请求 `createContext` 时再 `Object.create(this.context)`，让每个 ctx 拥有自己的属性、共享原型方法。
- 这样**用户可以在 app 创建后给 `app.context` 加方法/属性**（例如 `app.context.db = db`），所有请求的 `ctx` 自动继承——零配置扩展。
- 用 ES class 无法做到"运行时给所有实例加方法"，class 继承必须在编译期确定。

```javascript
// application.js:213-229  createContext 双向互挂
createContext (req, res) {
    const context = Object.create(this.context)
    const request = (context.request = Object.create(this.request))
    const response = (context.response = Object.create(this.response))
    context.app = request.app = response.app = this
    context.req = request.req = response.req = req
    context.res = request.res = response.res = res
    request.ctx = response.ctx = context
    request.response = response
    response.request = request
    context.originalUrl = request.originalUrl = req.url
    context.state = {}
    return context
}
```

**WHY 6 个互挂指针**：
- `ctx.req` / `ctx.res` 直接给"需要底层 node 对象"的用户用；
- `ctx.request` / `ctx.response` 是 Koa 的"增强代理"（带 `accepts` / `body` 多态等糖方法）；
- `request.response` / `response.request` 让 `request` 与 `response` 互访（响应里要读 `request.accepts`）；
- `request.app` / `response.app` 让单飞能力也能拿到 `app.proxy` / `app.keys` 等配置；
- 每个对象上都有 `ctx` 引用，回到根。

```javascript
// application.js:198-205  handleRequest
handleRequest (ctx, fnMiddleware) {
    const res = ctx.res
    res.statusCode = 404                              // 默认 404，body 未设置时返回
    const onerror = (err) => ctx.onerror(err)
    const handleResponse = () => respond(ctx)
    onFinished(res, onerror)                          // 客户端断连时也走 onerror
    return fnMiddleware(ctx).then(handleResponse).catch(onerror)
}
```

**WHY 默认 404 + onFinished**：
- 把 `res.statusCode = 404` 放在最前面——意味着**所有未设置 body 的请求自动 404**，用户只要 `ctx.body = 'hi'` 就走 200。
- `onFinished(res, onerror)`：HTTP 响应一旦异常关闭（客户端 abort / TCP RST）也走错误路径，避免 stream 泄漏。
- `.then(handleResponse).catch(onerror)`：链尾 `.catch` 是错误兜底核心——中间件抛错会变成 reject，被 `ctx.onerror` 吞下。

```javascript
// application.js:268-337  respond 函数（核心 70 行）
function respond (ctx) {
    if (ctx.respond === false) return                  // 用户手动接管
    const res = ctx.res
    if (!ctx.writable) return res.end()               // 不可写就关
    let body = ctx.body
    const code = ctx.status
    if (statuses.empty[code]) {                        // 204/205/304
        ctx.body = null
        return res.end()
    }
    if (ctx.method === 'HEAD') { ... return res.end() }
    if (body === null || body === undefined) {
        if (ctx.response._explicitNullBody) { ... return res.end() }  // 显式 null
        if (ctx.req.httpVersionMajor >= 2) body = String(code)
        else body = ctx.message || String(code)
        if (!res.headersSent) { ctx.type = 'text'; ctx.length = Buffer.byteLength(body) }
        return res.end(body)
    }
    if (Buffer.isBuffer(body)) return res.end(body)
    if (typeof body === 'string') return res.end(body)
    let stream = null
    if (body instanceof Blob) stream = Stream.Readable.from(body.stream())
    else if (body instanceof ReadableStream) stream = Stream.Readable.from(body)
    else if (body instanceof Response) stream = Stream.Readable.from(body?.body || '')
    else if (isStream(body)) stream = body
    if (stream) return Stream.pipeline(stream, res, err => { ... })
    body = JSON.stringify(body)                        // 默认 JSON
    if (!res.headersSent) ctx.length = Buffer.byteLength(body)
    res.end(body)
}
```

**WHY 这 70 行是精华**：
- 5 个早返回：bypass、unwritable、empty status、HEAD、null body——按"特殊性"递进；
- 默认走 `JSON.stringify(body)`——意味着**任何对象都是 JSON**（最常用的 case），这与 Express 的"body 必须 string/buffer"形成鲜明对比；
- 显式支持 Web 标准 `Blob` / `ReadableStream` / `Response`（Fetch API 对象）——v3 与 Web 平台靠拢的设计意图明显（`History.md` 提到 "Add support for web WHATWG #1830"）。

### 5.2 单文件分析卡

**`lib/context.js`（249 行）**——`ctx` 的"协议中心"。
- `inspect/toJSON`（行 30-57）：把 req/res/socket 序列化为 `'<original node req>'` 等占位符——避免 `util.inspect` 试图遍历整个 http 流；
- `assert = httpAssert`（行 72）：把 `http-assert` 直接挂上 `ctx.assert(value, 401, '...')`；
- `throw = (...args) => throw createError(...args)`（行 95-97）：糖写法 `ctx.throw(403, 'forbidden')` → 抛 `http-errors` 工厂出的带 status 的 Error；
- `onerror(err)`（行 106-162）：**核心 56 行**——判断 `headerSent`、emit 到 `app`、抹除所有 header、按 `err.expose` 决定 body 显隐、设 `type=text/length=byteLength/res.end(msg)`。
- 文件末尾的 `delegate(proto, 'response').method('redirect')` / `delegate(proto, 'request').getter('origin')` 是**代理声明**（行 195-249），对应 `delegates` 包——把 30+ 个方法/访问器/属性**反射到 ctx**。

**WHY `onerror` 抹除所有 header 再重设**：用户可能在抛错前写过 `ctx.set('X-Trace-Id', id)` 但因为错误回滚——Koa 强制 `getHeaderNames().forEach(removeHeader)` 后再 `this.set(err.headers)`，保证响应不会被"残留 header"污染。

**`lib/request.js`（749 行）**——纯 getter/setter 集合。
- `header/headers`（行 35-67）：直接代理 `this.req.headers`；
- `query`（行 172-176）：`this._querycache[str] || (c[str] = sp.parse(str))`——**按 querystring 字符串做键的 lazy memoize**，避免重复解析；
- `URL`（行 296-307）：lazy 解析 WHATWG URL，try/catch 后降级为 `Object.create(null)`，让后续 `.hostname` 等访问返回 undefined 而不是抛错；
- `ip`（行 464-469）：用 `Symbol('context#ip')` 当**单次请求的 IP 缓存键**——避免多中间件反复调 `ips[0]`；
- `host`（行 251-270）：先 `X-Forwarded-Host`（仅 `app.proxy=true`），然后 HTTP/2 `:authority`，最后 `Host`；处理 `user@host` 这种非规 userinfo 走 `new URL().host` 兜底。

**WHY 用 Symbol 做 instance 缓存**：`Symbol` 不会出现在 `Object.keys` 中、不污染 JSON 序列化；同一个 ctx 上多次访问 `ctx.request.ip` 只解析一次——这种"实例级缓存"是 Node.js Web 框架的惯用模式。

**`lib/response.js`（664 行）**——`set body` 是真正的"多态分发器"。
- `set status(code)`（行 84-93）：先 assert 100~999；记 `_explicitStatus = true`；同时设置 `res.statusMessage`（HTTP/1.x）；若 body 已设置且状态码是 204/205/304，会自动把 body 置 null（statuses.empty 校验）。
- `set body(val)`（行 135-232）：**60 多行巨型 setter**——按 `val` 类型分 7 路：
  1. `null/undefined` → 204（除非 type=application/json 则置 `'null'`）；
  2. `string` → `Buffer.byteLength` 计算 length，type 自动 `text` 或 `html`（看是否以 `<` 开头）；
  3. `Buffer` → length = `val.length`，type `bin`；
  4. `Stream`（`isStream` 鸭式判断）→ `onFinish` 钩子里 destroy、`remove('Content-Length')`；
  5. `ReadableStream`（Web）→ length 未知，type `bin`；
  6. `Blob`（Web）→ length = `val.size`；
  7. `Response`（Fetch API）→ 复制 status 与所有 headers；
  8. 默认 → `JSON.stringify`（最末的 fallback）。
- `writable`（行 600-613）：`res.writableEnded || res.finished || socket.writable`，**3 道兜底**——不同 Node 版本对"流是否还能写"判断不同，要做版本兼容。

**`lib/is-stream.js`（21 行）**——鸭式判断：
```javascript
module.exports = (stream) => {
    return stream instanceof Stream ||
      (stream !== null && typeof stream === 'object' &&
       !!stream.readable && typeof stream.pipe === 'function' &&
       typeof stream.read === 'function' &&
       typeof stream.readable === 'boolean' &&
       typeof stream.readableObjectMode === 'boolean' &&
       typeof stream.destroy === 'function' &&
       typeof stream.destroyed === 'boolean')
}
```
**WHY 鸭式 + instanceof 双判**：`stream instanceof Stream` 覆盖 `node:stream` 原生；但用户可能传 `{ readable, pipe, read, ... }` 这种"伪流"（比如测试 mock、proxyquire 出来的），用 7 个 duck-type 属性兜底——这是 Koa 兼容性的关键。

**`lib/only.js`（10 行）**：
```javascript
module.exports = (obj, keys) => {
    const ret = {}
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (obj[key] == null) continue
        ret[key] = obj[key]
    }
    return ret
}
```
**WHY 自己写**：这是为 `toJSON` 用的"白名单字段过滤"——把"内部状态"剥离掉，只暴露 `subdomainOffset/proxy/env` 这种可配置项，便于 `util.inspect` 与 debug 友好。10 行比 `lodash.pick` 轻。

### 5.3 设计模式

| 模式 | 体现位置 | 说明 |
|---|---|---|
| **原型链继承** | `Object.create(this.context)` | 避免 ES class 的僵化，支持 `app.context.xxx = ...` 运行时扩展 |
| **对象适配器** | `createContext` 6 个互挂指针 | ctx/request/response 互访，不冗余存储 |
| **代理模式** | `delegates(proto, 'response')` | 60+ 个方法/属性从 `request/response` 透传到 `ctx` |
| **链式责任链** | `koa-compose` | 洋葱模型 = `Promise.resolve(dispatch(0))` + 递归 |
| **空对象模式** | `Object.create(null)`（memoizedURL 失败） | 防原型污染 |
| **Symbol 实例缓存** | `Symbol('context#ip')` | 不污染序列化、避免重复计算 |
| **策略模式** | `respond` 7 路分发 | 按 `body` 类型选不同序列化策略 |
| **白名单过滤** | `only.js` | toJSON 安全暴露 |
| **鸭子类型** | `is-stream.js` | 7 个属性判定 Stream 兼容 |

### 5.4 反模式

- **巨型 setter**：`response.js: set body(val)` 一个方法 60+ 行 if-else 链——可读性差但**所有"body 多态"集中在一处反而易维护**（一处加 type、一处加测试）。这不是真反模式，只是"用代码集中度换可发现性"的取舍。
- **`onerror` 内 `res._headers = {}` 兼容 Node < 7.7**（`context.js:142`）：当 `res.getHeaderNames` 不存在时回退到直接清 `_headers`——版本兼容代价；现可移除。
- **`set status(code)` 里 `assert` 抛错**（`response.js:87-88`）：如果用户传字符串会同步抛 `AssertionError`——Koa 没把"设置 status"做成软失败，依赖用户守规矩。

### 5.5 独特看点

1. **`v8.startupSnapshot.addDeserializeCallback`**（`application.js:92-96`）：支持 v8 snapshot 启动时延迟初始化 `AsyncLocalStorage`——这是 Node.js 18+ 的"快速启动"特性，Koa 3.x 主动适配。
2. **`accepts instanceof Response`**：在 Web 平台同构趋势下，Koa v3 把 Fetch API 的 `Response`/`ReadableStream`/`Blob` 全部纳入 `body` 协议——这是它"面向未来"的设计宣言。
3. **完全无内置路由/解析**：body parser / router / static / session 全部外置——这是它"骨架薄、生态厚"哲学的硬约束。

## 6. 运行机制（Bring It Up）

```bash
# 1. 装依赖
cd G:\实战案例\GitHub顶尖项目\koa
npm install

# 2. 写 hello.js
cat > hello.js <<'EOF'
const Koa = require('./lib/application')
const app = new Koa()

app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  ctx.set('X-Response-Time', `${ms}ms`)
})

app.use(async ctx => {
  ctx.body = { hello: 'koa', v: '3.2.1' }
})

app.listen(3000)
EOF

# 3. 跑
node hello.js

# 4. smoke test
curl -i http://localhost:3000/
# 期望: HTTP/1.1 200 OK
#        Content-Type: application/json
#        X-Response-Time: <ms>ms
#        {"hello":"koa","v":"3.2.1"}
```

```mermaid
flowchart LR
    A[npm install] --> B[node hello.js]
    B --> C[http.createServer]
    C --> D[app.callback]
    D --> E[compose middlewares]
    E --> F[listen 3000]
    F --> G[curl GET /]
    G -->|200 OK| H[Response]
```

**Smoke test 验证点**：
- 状态码 200（默认 404 被 `ctx.body = {...}` 覆盖）；
- `Content-Type: application/json`（`response.js:230` 自动设置 type=json）；
- `X-Response-Time` header（说明洋葱模型跑了"前+后"两段）；
- Body 是 JSON 序列化后的对象（`respond` 默认 `JSON.stringify`）。

## 7. 演进历史（Time Travel）

```mermaid
gantt
    title Koa 演进里程碑
    dateFormat YYYY-MM
    section 早期
    v0.x 起步 (TJ)        :done, 2013-09, 6m
    v1.0 稳定 (generator) :done, 2014-08, 36m
    section async/await 时代
    v2.0 重写 (async)     :done, 2017-12, 24m
    v2.x 长尾维护         :done, 2018-01, 60m
    section 现代化
    v3.0 (AsyncLocalStorage):done, 2023-01, 6m
    v3.2.x 当前稳定线     :active, 2024-12, 7m
```

**关键历史点**（来自 `History.md` 714 行）：
- **v1.0 (2014-08)**：基于 `co` + generator 的 `function*(next){}` 中间件；作者 TJ Holowaychuk（也是 Express 作者）。
- **v2.0 (2017-12)**：完全抛弃 generator，迁移到 `async/await`——这是 Koa 的分水岭，因为 generator 与 co 限制了现代 JS 表达力。
- **v3.0-alpha.0 (2023-01)**：移除 generator 兼容性；引入 `AsyncLocalStorage` 允许 `app.currentContext` 拿当前 ctx；更新 `http-errors` v2。
- **v3.0.0-alpha.3 (2025-02)**：修复 `host` 与 `protocol` getter 的正则 ReDoS 漏洞。
- **v3.2.x**：当前稳定线，加入 WHATWG URL、Blob/ReadableStream/Response 支持。

## 8. 质量保障（How It Doesn't Break）

**4 道防线**：

1. **测试**：77 个 `*.test.js` 用 `node --test`（Node 18+ 内置 runner，无需 jest/mocha）；`test:coverage` 用 `c8` 覆盖率工具。`__tests__/application/compose.test.js` 验证洋葱模型 `calls === [1,2,3,4]` 顺序。
2. **CI**：`.github/workflows/node.js.yml` 多 Node 版本矩阵测试；`.github/workflows/npm-publish.yml` 自动化发布。
3. **Lint**：`standard`（零配置 JS 风格）+ `snazzy` 友好输出；`lint:fix` 自动修。
4. **性能基准**：未自建 bench（不像 fastify 那样内置）；依赖 V8 原生 async/await + 零依赖中间件循环 = 极小开销。

**Koa 自身的"质量护栏"**：
- `assert(Number.isInteger(code), ...)` 防止 status 越界；
- `headerSent` 守卫（`set/remove` 前检查）防止修改已发 header 抛 ERR_HTTP_HEADERS_SENT；
- `isNativeError` 检测（`context.js:115`）防止跨 realm 抛非 Error 对象；
- `vary(this.res, field)` 不污染 Vary header。

## 9. 生态依赖（Map of the World）

```mermaid
mindmap
  root((koa 依赖图))
    核心组合
      koa-compose
    错误协议
      http-errors
      http-assert
    网络协议
      accepts
      content-type
      type-is
      fresh
      vary
      parseurl
      statuses
    请求/响应
      cookies
      on-finished
      destroy
      encodeurl
      escape-html
      content-disposition
      mime-types
    工具
      delegates
```

**合规检查清单**（按 `package.json`）：
- 19 个 prod deps，全部为 jshttp 生态或成熟单文件库；
- 无原生模块编译依赖（pure JS），跨平台无坑；
- `engines.node: ">=18"`——强制 ES2015+ 异步；
- `dist/koa.mjs` 由 `gen-esm-wrapper` 在 `prepare` 时自动生成（`build: "gen-esm-wrapper . ./dist/koa.mjs"`）。

## 10. 生产实践（Battle-Tested）

| 实践 | Koa 内置支持 | 用户需补 |
|---|---|---|
| 配置热更新 | ❌（`app.proxy` 等需重启） | 自己监听 SIGHUP |
| 优雅停服 | ❌ | `server.close()` + `onfinish` 钩子 |
| 限流 | ❌ | `koa-ratelimit` |
| 链路追踪 | ❌（v3 的 AsyncLocalStorage 给了 `currentContext` 钩子） | `cls-hooked` 或用内置 + OpenTelemetry |
| 健康检查 | ❌ | `ctx.body = 'OK'` 中间件 |
| 结构化日志 | ❌ | `koa-logger` + `pino` |
| HTTPS | ❌ | 用户层 `https.createServer` 或 `app.callback()` 套 |
| Cluster | ❌ | `cluster` / `pm2` |
| Body 解析 | ❌ | `koa-bodyparser` |
| CORS | ❌ | `@koa/cors` |
| Session | ❌ | `koa-session` |
| 静态文件 | ❌ | `koa-static` |

**Koa 的哲学**："骨架" = 异步中间件机制 + ctx 三件套 + 错误处理 + respond；其他全部外置成 npm 包，避免"框架过度膨胀"。

## 11. 社区文化（People & Process）

- **核心维护者**：`dead_horse`（于涌，TJ 之后的接力者，yahoo 系）、`jonathanong`（Express 4 维护者）、`niftylettuce`。
- **治理模式**：GitHub Issues + Slack + 社区 RFC（`docs/migration-v1-to-v2.md` 与 `migration-v2-to-v3.md` 写得很细）；变更通过 PR + 至少 1 名 maintainer approve。
- **沟通渠道**：Slack (#koa-js)、Reddit (`r/koajs`)、Gitter、邮件列表、GitHub Discussions。
- **议题活跃**：截至 2026 年仍月均 10+ issue 处理；`History.md` 单 release 平均 5-15 条变更。
- **赞助**：OpenCollective 接收赞助 + `FUNDING.yml` 配置 GitHub Sponsors。

## 12. 教训总结（What To Steal / What To Avoid）

### 12.1 必偷 3 件

1. **Object.create 挂载 + 互挂指针**（`createContext`）：用对象原型继承替代 ES class，让 `app.context.db = ...` 扩展对所有请求生效——比 NestJS 的 `@Injectable` 轻得多。
2. **`delegates` 包做糖写法代理**（`context.js` 末尾 30 行）：把 60+ 方法/属性反射到 ctx 上，让用户写 `ctx.body` 等价于 `ctx.response.body`——零运行时开销（编译时生成的 getter/setter）。
3. **链尾 `.catch(onerror)` 统一兜底**（`handleRequest`）：中间件抛错自动转成 HTTP 错误响应，无需业务层 try-catch——比 `express-async-errors` 之类 patch 优雅。

### 12.2 必避 3 坑

1. **不要"业务全内置"**：Koa 把 body parser / router / static / session 全部外置——如果你写框架时把这些塞进核心，会迅速膨胀成"下一个 Express"。
2. **不要用 ES class 写 ctx 骨架**：`Object.create` 让你能运行时加方法；class 一旦定型就改不动。
3. **不要忽略 `headerSent` 守卫**：HTTP header 一旦 flush 就不能再 set——Koa 处处加 `if (this.headerSent) return` 是有教训的。

### 12.3 7 天复刻路线图

```mermaid
gantt
    title 7 天复刻 koa 骨架
    dateFormat YYYY-MM-DD
    section 骨架
    Day1 context/request/response 原型 :a1, 2026-06-01, 1d
    section 入口
    Day2 Application 类 + createContext :a2, after a1, 1d
    section 中间件
    Day3 koa-compose 30 行实现  :a3, after a2, 1d
    section 错误
    Day4 ctx.onerror + app.onerror    :a4, after a3, 1d
    section 响应
    Day5 respond 多态分发        :a5, after a4, 1d
    section 工具
    Day6 delegates 代理 + 单元测试 :a6, after a5, 1d
    section 集成
    Day7 端到端 + benchmark  :a7, after a6, 1d
```

**7 天交付物**：
- `lib/{application,context,request,response,is-stream,only}.js` 共 6 个文件；
- `compose` 函数 30 行（递归 dispatch）；
- 8 个单元测试 + 1 个 supertest 集成测试；
- `package.json` + `README.md`。

### 12.4 打分卡

| 维度 | 分数 | 评语 |
|---|---|---|
| 代码可读性 | 9/10 | 注释密度合理，函数单一职责 |
| 架构清晰度 | 10/10 | 洋葱模型 + 三件套 + 错误中心化 |
| 文档完整度 | 8/10 | docs/ 8 份，迁移指南详尽；示例少 |
| 测试覆盖 | 8/10 | 77 测试覆盖 lib/ 全部，集成有 supertest |
| 生产可用 | 7/10 | 核心稳，路由/body 解析等需外置 |
| 学习价值 | 10/10 | ~570 SLOC 读懂 Node.js Web 框架骨架 |

## 13. 学习萃取（Cheat Sheet）

**一句话价值**：**用 ~570 SLOC 示范了"以中间件为唯一抽象"如何撑起一个 Web 框架——是 Node.js 后端工程化的"骨架级"参考**。

**3 个核心洞察**：
1. **`async/await + Promise` 实现的洋葱模型**比 callback/EventEmitter 链更接近人脑"先入后出"的直觉——是"用语言特性换框架简洁度"的典范。
2. **`ctx` 通过 `Object.create` + `delegates` 实现"零拷贝糖写法"**——比起"ctx 继承 Request 类"更灵活，比起"全手写 getter"更省力。
3. **错误处理完全集中在 `ctx.onerror` + `app.onerror` 两层**——业务中间件不需要 try-catch，链尾自动兜底，**让"错误处理"从业务里解耦**。

**5 段必读代码**（按"先读这个再读那个"顺序）：

1. **`lib/application.js` L72-101** — `Application` 构造与 `Object.create` 三件套挂载，看懂"框架骨架如何支持运行时扩展"。
2. **`lib/application.js` L213-229** — `createContext` 6 个指针互挂，看懂"为什么 ctx/request/response 能互访而不冗余"。
3. **`lib/application.js` L198-205** — `handleRequest` 4 行核心，中间件链尾 `.catch` 兜底，看懂"错误如何不污染业务"。
4. **`lib/response.js` L135-232** — `set body` 60+ 行多态分发器，看懂"框架如何在 0 业务知识下决定如何序列化"。
5. **`lib/context.js` L195-249** — `delegate(proto, 'response')` 与 `delegate(proto, 'request')` 两段声明，看懂"为什么 `ctx.body` 等价于 `ctx.response.body`"。

**1 反模式**：`response.js` 中 `set body` 巨型 if-else——可读性差但**所有多态集中在一处反而易维护**。**不要分散到多个 setter**（`setStringBody` / `setBufferBody`）会破坏"一处改一处测"的心智模型。

**1 可复用模式**：`Object.create(prototype)` + 6 个指针互挂 + `delegates` 代理——任何需要"运行时扩展 + 多视图访问"的对象（如 DB session / WebSocket connection）都可以套这个模式。

**3 立刻能用**：
1. `app.context.db = pool` 给所有请求注入 DB 句柄——0 配置；
2. `app.on('error', (err, ctx) => sentry.capture(err))` 全局错误上报——无需 try-catch；
3. `ctx.throw(404)` 抛 404 错误——比 `ctx.status = 404; return` 链更短。

## 14. 项目特点速查

| 独特看点 | 说明 |
|---|---|
| 极简骨架 | 7 个源文件 / 2027 行 / 0 业务假设 |
| 真正异步中间件 | `async/await` 原生洋葱模型，next() 是 Promise |
| Web 平台同构 | 支持 Fetch API 的 `Response` / `ReadableStream` / `Blob` |
| AsyncLocalStorage | v3+ 允许任意位置 `app.currentContext` 拿当前 ctx |
| 无内置路由 | 哲学：业务中间件外置成 npm |
| 错误零侵入 | `ctx.throw` / `try { await next() }` 任意位置抛错都被统一兜底 |
| 极低启动开销 | 无 IO 初始化、无配置解析，1 ms 内可监听端口 |

**与同类对比**：

```mermaid
quadrantChart
    title Web 框架对比 (Node.js)
    x-axis "功能多" --> "功能少"
    y-axis "性能低" --> "性能高"
    quadrant-1 "高性能 + 功能少"
    quadrant-2 "高性能 + 功能多"
    quadrant-3 "性能低 + 功能多"
    quadrant-4 "性能低 + 功能少"
    "Express": [0.2, 0.4]
    "Koa":      [0.7, 0.8]
    "Fastify":  [0.6, 0.9]
    "NestJS":   [0.1, 0.3]
    "Hapi":     [0.3, 0.4]
    "uWebSockets.js": [0.8, 0.95]
```

Koa 处于"**功能少 + 性能高**"象限——这是它"骨架框架"定位的必然结果。

**与 Express 的核心差异**（来自 `docs/koa-vs-express.md`）：
- Express 中间件是 `function(req, res, next)`——`res` 不可链式；
- Koa 中间件是 `async (ctx, next)`——`ctx` 同时含 req/res，下游 `await next()` 后可继续处理响应；
- Express 用 `app.get/post` 内置路由；Koa 不内置路由（用 `koa-router`）。

## 附：仓库元信息

- 路径：`G:\实战案例\GitHub顶尖项目\koa\`
- 版本：v3.2.1（package.json）
- 大小：lib/ 7 个文件共 2027 行
- 总文件数：111（含 docs/、__tests__/、.github/）
- 解析时间：2026-06-02
- 解析者：Claude（V3 14 章节模板）

## 一句话总结

**Koa 用 ~570 SLOC 示范了"以中间件为骨架的 Node Web 框架"如何做到极简与优雅——核心在于 `Object.create` 上下文挂载 + `koa-compose` 洋葱模型 + `delegates` 糖写法代理 + 链尾 `.catch` 统一错误兜底。任何想写 Node 框架/中间件的人都该精读这 7 个源文件。**
