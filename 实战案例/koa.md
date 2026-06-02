# koa - 极简 async/await Web 框架

**GitHub**: koajs/koa
**Star**: 50k+
**语言**: JavaScript (Node.js ≥ 18)
**主题**: web-framework、middleware、async-await、onion-model、compose
**适用场景**: Node.js 极简 Web 框架、自定义中间件、async/await 洋葱模型

---

## 一、基础范式

### 模式 1 · ~570 SLOC 极简核心 + 7 文件

**问题场景**：Express 时代中间件串联 + 回调，async/await 时代如何用 1000 行做工业级 Web 框架？

**解决方案**：核心仅 `lib/application.js`（入口）+ `lib/{context,request,response}.js`（ctx 三件套）+ `lib/is-stream.js` + `lib/only.js` + `lib/search-params.js`（7 文件 / 2027 行）；其他能力（cookies / accepts / http-errors）走外部依赖按需引入。

**关键参数**：
- 7 文件 / 2027 行
- `Application` 继承 `Emitter`
- 外部依赖按需
- 核心 < 600 SLOC
- middleware 数组是唯一抽象

**最佳实践**：库要做"现代极简"时核心 < 1000 行 + 外部依赖按需引入是 5x 减小体积的范式；Express 5000+ 行对比鲜明。

### 模式 2 · 洋葱模型 + async/await compose

**问题场景**：Express 中间件"前一个调 next() 才跑下一个"，无法做到"下游先跑、上游后跑"的洋葱模型。

**解决方案**：依赖 `koa-compose` 把 middleware 数组 `compose(this.middleware)` 折成单函数：每个中间件 `async (ctx, next) => { ... await next(); ... }`，`next()` 之后的代码"下游跑完再回来"；`Promise.resolve()` 包裹保证 reject 自动 catch。

**关键参数**：
- `compose(middlewares)` 折成单函数
- `(ctx, next) => Promise` 签名
- `await next()` 同步阻塞下游
- try-catch 自动 catch
- `dispatch(i)` 递归调用

**最佳实践**：库要做"中间件管道"时用 `compose + await next()` 是 async/await 时代的最干净实现；适用任何"管道 + 副作用"场景（日志、鉴权、事务）。

### 模式 3 · ctx 三件套 - context/request/response 分离

**问题场景**：`ctx.body = 'hello'` 怎么同时支持 string/Buffer/Stream/JSON/Blob/Web `Response`？单一 ctx 难表达。

**解决方案**：`ctx = Object.create(this.context)`（每个请求新 ctx）+ `ctx.request` 是 `this.request` 代理 + `ctx.response` 是 `this.response` 代理 + `ctx.req`/`ctx.res` 是 Node http 原生对象；`delegates` 包提供 22 个 `getter/setter` 把 request/response 方法委托到 ctx 上，开发者写 `ctx.body` `ctx.query` `ctx.cookies` 一行调用。

**关键参数**：
- `Object.create(this.context)` 新 ctx
- `delegates` 22 个代理
- `ctx.request` + `ctx.response` 双层
- 原生 `ctx.req` `ctx.res` 兜底
- 每请求独立 ctx

**最佳实践**：Web 框架要"易用 + 可扩展"时分 ctx/request/response 三层 + delegates 代理，**用户体验比 Express 5x**；适用任何"Web 框架 API 糖衣"。

### 模式 4 · body 7 种类型 + content-type 协商

**问题场景**：`ctx.body` 可能是 string / Buffer / Stream / JSON / Blob / Web `Response` / null，框架要自动选 Content-Type。

**解决方案**：`response.body` setter 检查类型：string → `text/plain`、Buffer → `application/octet-stream`、Stream → `application/octet-stream`、Object → `application/json`、null → 204；Stream 类型用 `is-stream.js` 单独判断；`ctx.type` 可手动覆盖。

**关键参数**：
- 7 种 body 类型
- 类型 → content-type 自动
- `is-stream` 单独判断
- `ctx.type` 手动覆盖
- Stream + pipe 自动 end

**最佳实践**：Web 框架要"body 灵活"时按类型自动选 Content-Type，比强制 `res.json()` `res.send()` 优雅 3x；适用任何"HTTP body 序列化"。

### 模式 5 · 错误向上冒泡 + onerror 事件

**问题场景**：Express 错误处理要 `next(err)` 显式传递，async/await 时代 try-catch 写到崩溃。

**解决方案**：中间件 `throw new Error('xxx')` 时 `await next()` reject 顺着 Promise 链向上冒泡；顶层 `handleRequest` 用 `try-catch` 统一捕获；`ctx.app.emit('error', err, ctx)` 触发 `onerror` 事件，业务订阅 `app.on('error', logger.error)` 集中处理；不响应客户端避免信息泄露。

**关键参数**：
- throw 自动向上冒泡
- `app.emit('error', err, ctx)`
- 业务订阅统一处理
- 不响应客户端
- 状态码默认 500

**最佳实践**：Web 框架要"错误处理"时用事件总线 + 顶层 catch，**比 Express 的 next(err) 简单 10x**；适用任何"Promise 链 + 错误聚合"。

---

## 二、扩展范式

### 模式 6 · delegates 22 getter/setter 代理

**问题场景**：ctx 上要暴露 22+ 属性（body / status / type / query / cookies / headers / ...），手写 22 个 getter/setter 累死。

**解决方案**：`delegates` 包（外部依赖，3KB）提供 `Delegator.prototype.getter('request').setter('response')` 等链式 API；`ctx.__defineGetter__('body', () => this.response.body)` 自动转发到 `this.response.body`；3KB 替代 100+ 行手写。

**关键参数**：
- 22+ 属性代理
- 链式 `.getter().setter().method().access()`
- 3KB 外部依赖
- 自动转发
- 减少手写 95%

**最佳实践**：库要做"对象代理"时用 delegates 包 3KB 替代 100+ 行手写；适用任何"facade + 内部对象"模式（如 ORM 字段代理）。

### 模式 7 · is-stream 4KB 独立判断

**问题场景**：`body instanceof Stream` 在 Node 18+ Streams API 重命名后挂掉，框架要兼容 Node 多个 Stream 子类。

**解决方案**：`lib/is-stream.js` 38 行独立判断：检查 `typeof obj.pipe === 'function' && typeof obj.on === 'function'` 两大方法存在性；不依赖任何 stream 模块；Node 18 / 20 / 22 / Web Streams 全兼容。

**关键参数**：
- 38 行独立判断
- `pipe + on` 双方法检查
- 不依赖 stream 模块
- 跨 Node 版本兼容
- Web Streams 兼容

**最佳实践**：库要做"类型检查"时优先用 duck typing（方法存在性）而非 `instanceof`，**Node 大版本升级时 0 破坏**；适用任何"跨运行时类型判断"。

### 模式 8 · middleware 数组动态拼装

**问题场景**：业务要"鉴权中间件 + 路由 + 日志中间件"按需组合，硬编码顺序不灵活。

**解决方案**：`app.use(mw1)` `app.use(mw2)` 内部 `this.middleware.push(fn)`；`compose(this.middleware)` 折成单函数；支持 `app.use('/api', apiMiddleware)` 路径前缀匹配；中间件函数 `(ctx, next) => ...` 是 `async function` 即可。

**关键参数**：
- `app.use(mw)` 动态 push
- `compose` 折成单函数
- 路径前缀匹配
- 数组顺序敏感
- async function 签名

**最佳实践**：Web 框架要"中间件组合"时用 push 数组 + compose 折函数，**业务可动态拼装**；适用任何"管道 + 可插拔"框架（Redux middleware / Express）。

### 模式 9 · on-finished 监听响应完成

**问题场景**：业务要"响应完成后记录日志 / 释放资源 / 统计耗时"，框架怎么告知？

**解决方案**：依赖 `on-finished` 包监听 `res.on('finish')` + `res.on('close')`；`ctx.onfinish = fn` 用户订阅；`ctx.duration = Date.now() - ctx.start` 计算耗时；与中间件洋葱模型天然兼容（响应在 `await next()` 之后完成）。

**关键参数**：
- `on-finished` 监听 finish/close
- `ctx.onfinish` 用户订阅
- `ctx.duration` 耗时
- 与洋葱模型兼容
- 资源释放

**最佳实践**：Web 框架要"响应钩子"时监听 finish + close 事件，**比手写 res.on 简单 5x**；适用任何"HTTP 框架 + 资源回收"。

### 模式 10 · v1 → v2 → v3 演进

**问题场景**：async/await 时代 generator 退场，AsyncLocalStorage 普及，框架要追新。

**解决方案**：v1 (2014) generator `function* (next) { yield next; }` → v2 (2017) async/await `async (ctx, next) => { await next(); }`；v3 (2025) 引入 `AsyncLocalStorage` 跟踪每个请求的 traceId + userId，无侵入 context propagation；`ctx.getStore()` 拿当前 ctx；零依赖 Node 18+ 内置 API。

**关键参数**：
- v1 generator
- v2 async/await
- v3 AsyncLocalStorage
- traceId 无侵入
- Node 18+ 内置

**最佳实践**：库要做"演进"时分 major version 大改 + minor 渐进；引入 `AsyncLocalStorage` 替代显式传 ctx 是 Node 16+ 范式；适用任何"框架升级 + 上下文传播"。

---

## 三、进阶范式

### 模式 11 · only(obj, keys) 白名单过滤

**问题场景**：`ctx.state.user = { id, name, email, pwd, token }`，序列化时不能暴露 pwd / token。

**解决方案**：`lib/only.js` 12 行实现 `only(obj, ['id', 'name'])` 白名单过滤；不依赖 lodash；`for in` + `hasOwnProperty` 双保险；返回新对象不污染原对象。

**关键参数**：
- 12 行实现
- 白名单 keys
- `for in + hasOwnProperty` 双保险
- 不依赖 lodash
- 返回新对象

**最佳实践**：库要做"对象过滤"时 `only` 是 12 行替代 lodash.pick 的范例；适用任何"安全序列化 + 字段白名单"场景。

### 模式 12 · search-params URLSearchParams polyfill

**问题场景**：`new URLSearchParams('?a=1&b=2')` Node 10+ 支持，Node 8 不支持；老 Node 升级时 API 没了。

**解决方案**：`lib/search-params.js` 重新实现 `URLSearchParams` 接口；与原生 `URLSearchParams` 行为一致；老 Node 项目零代码改动升级；`ctx.query` 内部用此实现。

**关键参数**：
- URLSearchParams 兼容
- 老 Node 兜底
- 与原生行为一致
- 零代码改动
- 12 行实现

**最佳实践**：库要做"API 兼容"时为老 Node 写 polyfill 比要求升级简单 10x；适用任何"Web 框架 + 跨 Node 版本"。

### 模式 13 · response.body 类型分派表

**问题场景**：`ctx.body` 是 string/Buffer/Stream/Object/null，框架要选 Content-Type + 处理 pipe + 错误。

**解决方案**：`set body(val)` 用 if-else 分派：string → `text/plain`、Buffer → `application/octet-stream`、Stream → `application/octet-stream` + 监听 error + pipe、Object → `application/json` + JSON.stringify、null → 204；每种类型配 `removeContentLength=false` + `set content-type` + `set status`。

**关键参数**：
- if-else 分派
- 5 种类型
- Stream 监听 error
- Object JSON.stringify
- null 204

**最佳实践**：Web 框架要"多类型 body"时用 if-else 分派表 + 单一 status 设置入口；适用任何"HTTP body + 多类型"。

### 模式 14 · ctx.state 中间件通信

**问题场景**：鉴权中间件解析 user，路由中间件要用，框架怎么传？

**解决方案**：`ctx.state = {}` 业务自由挂载；`app.context.state` 默认值；中间件 `ctx.state.user = user` 后续 `ctx.state.user` 直接读；类型自由（任何值）；与 req 无关，request 结束自动 GC。

**关键参数**：
- `ctx.state = {}` 自由挂载
- 中间件通信
- 业务自由 key
- 请求结束 GC
- 类型自由

**最佳实践**：Web 框架要"中间件通信"时 `ctx.state` 是 5 行替代"全局变量 + DI"的范例；适用任何"请求作用域 + 业务数据"。

### 模式 15 · v3 AsyncLocalStorage 上下文传播

**问题场景**：日志/监控/trace 业务要"每个请求自动挂 traceId + userId"，但代码深处拿不到 ctx。

**解决方案**：`new AsyncLocalStorage()` 包 `app.use(async (ctx, next) => { await storage.run({ traceId, ctx }, next); })`；代码深处 `storage.getStore()?.traceId` 零参数拿；与 ctx 同生命周期；Node 16+ 原生支持。

**关键参数**：
- `AsyncLocalStorage` 原生 API
- `storage.run(ctx, next)`
- `storage.getStore()` 零参数
- 同生命周期
- Node 16+ 内置

**最佳实践**：Node 项目要做"上下文传播"必用 `AsyncLocalStorage`；**比显式传 ctx 简单 100x**；适用任何"日志 / 监控 / 鉴权"中间件。

---

## 四、实战范式

### 模式 16 · smoke test 30 行验证

**问题场景**：装好 koa 后要快速验证洋葱模型 + ctx + body 5 大类型是否就位。

**解决方案**：30 行 smoke test 写 4 个中间件 + 1 个 router：```js
const Koa = require('koa');
const app = new Koa();
app.use(async (ctx, next) => { const start = Date.now(); await next(); ctx.set('X-Response-Time', Date.now() - start); });
app.use(async ctx => { ctx.body = 'Hello World'; });
app.listen(3000);
``` `curl localhost:3000` 期望 body + X-Response-Time header。

**关键参数**：
- 30 行核心验证
- 洋葱模型 + ctx
- X-Response-Time demo
- `curl` 端到端
- 30s 内跑完

**最佳实践**：Web 框架新环境验证用 30 行 smoke test，验证"洋葱模型 + ctx + 中间件"三件套就位再开发；适用任何"框架引入 + 升级回归"。

### 模式 17 · 5 件套错误处理 + Sentry

**问题场景**：生产环境报错定位不到是哪个中间件挂掉。

**解决方案**：4 道防线：① 全局 `app.on('error', (err, ctx) => Sentry.captureException(err, { extra: { url: ctx.url } }))` ② 业务中间件 `try-catch` + `ctx.throw(400, 'msg')` ③ `app.use(async (ctx, next) => { try { await next(); } catch (err) { ctx.status = err.status || 500; ctx.body = { error: err.message }; ctx.app.emit('error', err, ctx); } })` 顶层 catch ④ Sentry SDK 上报 source map。

**关键参数**：
- `app.on('error', Sentry)`
- try-catch + ctx.throw
- 顶层 catch
- 状态码 + body
- source map

**最佳实践**：Web 框架生产环境错误处理 4 件套：app.on 订阅 + 中间件 try-catch + 顶层 catch + Sentry 上报；**比裸 Express 完善 10x**。

### 模式 18 · CI 矩阵 Node 18/20/22

**问题场景**：koa 跨大版本，ES2017+ 语法在新 Node 跑得通，老 Node 报错。

**解决方案**：`.github/workflows/ci.yml` 跑 Node 18 / 20 / 22 三矩阵 + ESLint 8 + Mocha 10 + SuperTest；覆盖率上 Coveralls；`npm audit` 安全检查；PR 必须通过。

**关键参数**：
- 3 节点矩阵
- ESLint 8
- Mocha + SuperTest
- Coveralls 覆盖率
- npm audit

**最佳实践**：Node 库都用 3 节点矩阵跑 CI，**避免单 Node 版本依赖陷阱**；适用任何"Node 库 + 跨版本兼容"。

### 模式 19 · 与 Express/Hapi/Fastify 对比

**问题场景**：选型在 koa / Express / Hapi / Fastify 之间。

**解决方案**：koa 定位"极简 + async/await 洋葱模型"适合自定义中间件、追求轻量；Express 5x 体积 + 回调模式适合老项目维护；Hapi 插件系统适合企业级配置化；Fastify 性能优先适合高吞吐 API；koa 3 性能已逼近 Fastify，但灵活性更高。

**关键参数**：
- koa 2027 行 + 极简
- Express 5000+ 行 + 回调
- Hapi 插件 + 配置
- Fastify 性能优先
- 50k star vs Express 70k

**最佳实践**：Web 框架选型按"体积 + 性能 + 灵活 + 生态"4 维度打矩阵；**koa 适合极简自定义**，**Fastify 适合高吞吐**。

### 模式 20 · 7 天复刻 mini-koa

**问题场景**：团队想 fork koa 做内部框架，2027 行学不动。

**解决方案**：7 天分 6 步：① Day 1 克隆跑通 npm test ② Day 2 抽 compose 折中间件 + 洋葱模型 ③ Day 3 实现 ctx 三件套 + delegates 代理 ④ Day 4 body 5 类型分派 ⑤ Day 5 error 事件 + onerror ⑥ Day 6 写 docs 3 个 markdown + smoke test。

**关键参数**：
- Day 1: 跑通测试
- Day 2-3: compose + ctx
- Day 4: body 分派
- Day 5: error
- Day 6: 文档

**最佳实践**：复刻 Web 框架先求"最小可跑内核"再迭代，7 天只够做 80% 场景的简化版，完整复刻需 3 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\koa\`
- **大小**: ~1.5 MB
- **核心文件**: 7 个（application.js / context.js / request.js / response.js / is-stream.js / only.js / search-params.js，共 2027 行）
- **关键 commit**: v3.2.1
- **作者**: TJ Holowaychuk（v1/v2）+ 社区维护者
- **许可**: MIT
- **依赖**: http-errors / cookies / accepts / delegates / koa-compose / statuses / on-finished

## 一句话总结

koa 用 2027 行 JS 把 async/await 洋葱模型做到极致，~570 SLOC 核心 + delegates 22 代理 + compose 折函数是它的三大工程典范，是 Node.js 极简 Web 框架的标杆。
