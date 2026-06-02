# koa · ABL 模式速查（Amazon Builders' Library Style）

> Koa 是 TJ Holowaychuk 之后由 dead_horse/jonathanong 维护的极简 Node.js Web 框架，~570 SLOC 核心，强制 `async/await` 中间件（洋葱模型）。本文按"问题场景 → 解决方案 → 关键参数 → 最佳实践"格式整理 20 个核心模式。

---

## 一、核心原理：洋葱模型与 ctx 三件套

### 模式 1：`compose` 递归 dispatch（解决"中间件先入后出"）

**问题场景**：Web 框架需要"请求前/响应后"对称处理（如鉴权在请求前、计时在响应后）。Express 用回调嵌套实现但语义混乱；手写 `Promise` 链又啰嗦。

**解决方案代码**：

```javascript
// node_modules/koa-compose/index.js（独立 npm 包）
function compose(middleware) {
  if (!Array.isArray(middleware)) throw new TypeError('Middleware stack must be an array!');
  for (const fn of middleware) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!');
  }
  return function (context, next) {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) return new Error('next() called multiple times');
      index = i;
      let fn = middleware[i];
      if (i === middleware.length) fn = next;
      if (!fn) return;
      try {
        return await fn(context, dispatch.bind(null, i + 1));
      } catch (err) {
        throw err;
      }
    }
  };
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `middleware` | 中间件数组 | 顺序敏感 |
| `dispatch(i)` | 递归到第 i 层 | i 递增 |
| `index` | 已执行序号 | 防重入 |
| `next` | 链尾 | 可选 |
| `await fn(ctx, dispatch.bind(null, i+1))` | 注入 next | `next()` 返回 Promise |

**最佳实践**：
- ✅ `next()` 调多次会抛 `next() called multiple times`——`index <= i` 守卫关键。
- ✅ 中间件**总是**在 `await next()` 前后各放一段逻辑，**不要**只写单边。
- ✅ 想跳出整条链：在中间件里 `ctx.respond = false`（Koa 把控制权交还上游）。
- ✅ 调试时打印 `i` 看递归深度——>30 多半是死循环（如递归路由）。
- ✅ 写"提前 return"中间件用 `await next(); return;` 显式标记（防止后续逻辑误执行）。

---

### 模式 2：`ctx` 三件套代理（解决"ctx.body / ctx.method / ctx.status 一行写完"）

**问题场景**：Koa 实际有 4 个对象：`ctx`、`ctx.request`（KoaRequest）、`ctx.req`（Node IncomingMessage）、`ctx.response`（KoaResponse）。让用户手写 4 层调用是反人类的。

**解决方案代码**：

```javascript
// lib/context.js
const util = require('util');
const KoaRequest = require('./request');
const KoaResponse = require('./response');
const delegates = require('delegates');

const proto = module.exports = {
  inspect() { ... },
  toJSON() { return only(this, ['app', 'req', 'res', ...]); },
  throw(err, status, msg) { ... },
  onerror(err) { ... },
  cookies: {}  // 懒查 ctx.request.header.cookie
};

delegate(proto, 'response')
  .method('attachment')
  .method('redirect')
  .method('remove')
  .access('status')
  .access('body')
  .getter('headerSent')
  .setter('lastModified');

delegate(proto, 'request')
  .method('acceptsLanguages')
  .method('get')
  .access('method')
  .access('query')
  .getter('ip')
  .getter('fresh');
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `delegate(proto, 'response')` | 把 response 的方法/属性挂到 ctx | 60+ 个 |
| `.method('attachment')` | 仅方法代理 | 写 ctx.attachment() |
| `.access('body')` | 读写属性代理 | 写 ctx.body = ... |
| `.getter('headerSent')` | 只读代理 | 写会抛错 |
| `delegates` | npm 包 | Koa 复用而非自写 |
| `proto.cookies` | 懒解析 cookie header | 写时序列化 |

**最佳实践**：
- ✅ `ctx.body = obj` 时 Koa 自动 `JSON.stringify` + 设 `Content-Type: application/json`。
- ✅ `ctx.redirect('/login')` 默认 302，要 301 用 `ctx.redirect('/login', 301)`。
- ✅ `ctx.throw(404, 'Not Found')` 抛 `HttpError`，链尾 `onerror` 兜底。
- ✅ `ctx.respond = false` 让 Koa 跳过自动写响应——给 WebSocket/Server-Sent Events 用。
- ✅ 自定义代理方法：写 KoaRequest 上的 method，**不要**在 ctx 上挂 method。

---

### 模式 3：`body` setter 多态（解决"string/Buffer/Stream/JSON/Blob 一处写"）

**问题场景**：HTTP 响应可能是字符串（HTML）、Buffer（二进制）、Stream（大文件）、JSON（API）、Blob（浏览器 fetch 的 Web Response）。每个都要手动设 Content-Type + Length + 调 res.end 是反模式。

**解决方案代码**：

```javascript
// lib/response.js
set body(val) {
  const original = this._body;
  this._body = val;
  if (val == null) return;  // null/undefined → 不动
  if (!this.status) this.status = 200;
  // 多态分支
  if (typeof val === 'string') {
    if (!this.has('Content-Type')) this.type = /^\s*</.test(val) ? 'html' : 'text';
    this.length = Buffer.byteLength(val);
    return;
  }
  if (Buffer.isBuffer(val)) { this.length = val.length; return; }
  if (val instanceof Stream) { ... this.res.pipe(val) ...; return; }
  if (val instanceof Blob) { ... }
  if (typeof val === 'object') {
    this.remove('Content-Length');
    this.type = 'json';
  }
}
```

**关键参数表**：

| 名称 | 作用 | 触发条件 |
|------|------|----------|
| `typeof val === 'string'` | HTML/text | 默认 |
| `Buffer.isBuffer(val)` | 二进制 | `Content-Length` |
| `val instanceof Stream` | 大文件流 | pipe 模式 |
| `val instanceof Blob` | Web Blob | fetch 互操作 |
| `typeof val === 'object'` | JSON | `Content-Type: application/json` |
| `_body` | 私有存储 | set 时检测变化 |

**最佳实践**：
- ✅ `ctx.body = 'hi'` 自动识别 `<` 开头设 `text/html`，否则 `text/plain`。
- ✅ 大文件**必须**用 `fs.createReadStream()` 而不是 `fs.readFile()` 后 `Buffer`。
- ✅ `ctx.body = null` 不写 body（保持已有 body），`ctx.body = undefined` 同；`ctx.body = ''` 清空。
- ✅ 想强制 JSON：`ctx.type = 'json'; ctx.body = obj`。
- ✅ Stream 模式 Koa 会监听 `error` 事件——Stream 出错时 `onerror` 自动触发。

---

### 模式 4：`is-stream` 鸭式判断（解决"跨 Node 版本的 Stream 识别"）

**问题场景**：Node 12 之前 `require('stream')` 给的类与之后不同；用户可能传 `{ pipe, on }` 鸭子对象。`instanceof Stream` 在边界模块下会漏。

**解决方案代码**：

```javascript
// lib/is-stream.js
const isStream = (val) => {
  if (typeof val !== 'object' || val === null) return false;
  if (typeof val.pipe !== 'function') return false;
  if (typeof val.on !== 'function') return false;
  return true;
};
// isReadable / isWritable 同理
module.exports = isStream;
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `typeof val.pipe === 'function'` | 必备方法 | Readable + Writable |
| `typeof val.on === 'function'` | 事件监听 | EventEmitter 标记 |
| `val !== null` | 排除 null | `typeof null === 'object'` |
| `typeof val === 'object'` | 排除 primitive | string/number 不算 |

**最佳实践**：
- ✅ 自定义 Stream-like 对象（如 mock）只要有 `pipe/on` 就被识别——这是 feature。
- ✅ 在 body setter 里用 `isStream(val)` 走 pipe 路径。
- ✅ 不可用 `instanceof` 的场景：子进程 `process.stdin` 来自不同 realm。
- ✅ 升级 Node 主版本时，鸭子判断**不会**挂——这是它比 `instanceof` 稳的原因。
- ✅ Web Stream（`ReadableStream`）有 `pipeTo` 但没 `pipe.on`——单独走 Blob 路径。

---

### 模式 5：`only` 白名单（解决"ctx.toJSON 不暴露敏感字段"）

**问题场景**：日志系统、错误监控要序列化整个 ctx。但 ctx 上有 `req`（含 cookie header）、`res`（含 socket fd）等敏感对象，`JSON.stringify(ctx)` 会爆 + 泄露。

**解决方案代码**：

```javascript
// lib/only.js
const only = (obj, keys) => {
  obj = obj || {};
  if (typeof keys !== 'object' || Array.isArray(keys)) {
    throw new TypeError('`keys` must be an object.');
  }
  const ret = {};
  for (const key of Object.keys(obj)) {
    if (keys[key]) ret[key] = obj[key];
  }
  return ret;
};
// 使用
const Koa = require('koa');
const only = require('./only');
// ctx.toJSON 里
toJSON() { return only(this, ['app', 'req', 'res', 'state', ...]); }
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `obj` | 待白名单对象 | 任意 |
| `keys` | 允许的键 | 字典（{app:1, req:1}） |
| `ret` | 结果对象 | 只含白名单键 |
| `Array.isArray(keys)` | 拒绝数组 | 数组视为"全留" |
| `for (const key of Object.keys(obj))` | 遍历自身可枚举 | 不递归 |

**最佳实践**：
- ✅ `ctx.toJSON()` 默认白名单 + `state`——业务可往 `ctx.state` 塞任意数据并安全序列化。
- ✅ 自定义白名单：`only(ctx, {method:1, url:1})`。
- ✅ **不要**把 `req.headers.cookie` 加白名单——会泄露 session。
- ✅ `state.reqId` 加进白名单方便链路追踪。
- ✅ `only` 是浅拷贝——`state` 内部嵌套对象仍要小心引用循环。

---

## 二、架构设计：Application、Context 与错误处理

### 模式 6：`Application` 类 + `Emitter` 继承（解决"实例方法 = 事件"）

**问题场景**：Web 框架需要支持"应用级"事件（启动、错误、监听），但又不想把 Express 那种"一坨静态方法"塞进全局。

**解决方案代码**：

```javascript
// lib/application.js
const Emitter = require('events');
const compose = require('koa-compose');
const { Socket } = require('net');
const onFinished = require('on-finished');
const response = require('./response');
const request = require('./request');
const context = require('./context');
const cookies = require('cookies');

class Application extends Emitter {
  constructor() {
    super();
    this.proxy = false;
    this.middleware = [];
    this.subdomainOffset = 2;
    this.proxyIpHeader = 'X-Forwarded-For';
    this.maxIpsCount = 0;
    this.env = process.env.NODE_ENV || 'development';
  }
  use(fn) {
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!');
    this.middleware.push(fn);
    return this;
  }
  callback() {
    const fn = compose(this.middleware);
    if (!this.listenerCount('error')) this.on('error', err => { ... });
    const handleRequest = (req, res) => { ... };
    return handleRequest;
  }
  // ... listen / handleRequest / createContext / onerror
}
```

**关键参数表**：

| 名称 | 作用 | 默认值 |
|------|------|--------|
| `middleware` | 中间件数组 | `[]` |
| `subdomainOffset` | 子域名切片 | `2` |
| `proxyIpHeader` | 反代 IP header | `'X-Forwarded-For'` |
| `maxIpsCount` | IP 链最大长度 | `0`（不切） |
| `env` | 运行环境 | `process.env.NODE_ENV` |
| `use(fn)` | 注册中间件 | 链式返回 this |

**最佳实践**：
- ✅ `app.use(fn)` 是链式——`app.use(a).use(b).use(c)`。
- ✅ 错误监听 `app.on('error', err => log(err))`——没监听时 stdout 打印。
- ✅ `app.listen(3000)` 是 `http.createServer(app.callback()).listen(3000)` 糖。
- ✅ 多 Koa 实例复用：每个 app 有自己的 middleware 数组。
- ✅ 切分子域名：`app.subdomainOffset = 3`（`a.b.example.com` → `a.b`）。

---

### 模式 7：`createContext` 工厂（解决"每请求一份新 ctx"）

**问题场景**：Node HTTP 模型是"每请求一份新 req/res"，但 ctx 需要"把 req/res/request/response 全部关联起来"。如果手动拼装容易漏；如果共享会出并发 bug。

**解决方案代码**：

```javascript
// lib/application.js
createContext(req, res) {
  const context = Object.create(this.context);
  const request = context.request = Object.create(this.request);
  const response = context.response = Object.create(this.response);
  context.app = request.app = response.app = this;
  context.req = request.req = response.req = req;
  context.res = request.res = response.res = res;
  request.ctx = response.ctx = context;
  request.response = response;
  response.request = request;
  context.originalUrl = request.originalUrl = req.url;
  context.state = {};
  return context;
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `Object.create(proto)` | 共享原型 | 每请求一份新对象 |
| `context.app = this` | 5 路反向引用 | 任意对象都能 `obj.app` 找回 app |
| `req/res/request/response` | 4 套对象互相引 | `ctx.req` 节点、`ctx.request` Koa 抽象 |
| `context.state = {}` | 业务传值桶 | 跨中间件共享 |
| `originalUrl` | 原始 URL | 路由改 `req.url` 后仍能拿 |

**最佳实践**：
- ✅ `ctx.state.user = user` 在鉴权中间件中赋值，下游 handler 直接 `ctx.state.user`。
- ✅ **不要**给 `ctx` 加自有属性——`Object.create` 出的对象加属性会污染所有请求。
- ✅ `ctx.originalUrl` 区别于 `ctx.url`：前者是原始，后者是路由改写后的。
- ✅ `ctx.req === request.req === response.req`——同一引用。
- ✅ `context.state` 初始化为 `{}`，**不要**在 app 构造里预设默认值（每请求应独立）。

---

### 模式 8：`ctx.onerror` 集中兜底（解决"中间件不需要 try-catch"）

**问题场景**：传统 Express 中间件要 `try { ... } catch (next) { next(err) }` 显式传错。Koa 靠链尾统一 catch，让业务中间件**零错误处理代码**。

**解决方案代码**：

```javascript
// lib/context.js
onerror(err) {
  if (err == null) return;
  // 抹掉已写 header（一旦写入不能再改 status）
  if (!(err instanceof Error)) err = new Error(`non-error thrown: ${err}`);
  if (this.headerSent) {
    err.headerSent = true;
  }
  const { res } = this;
  if (this.status && this.status >= 200 && this.status < 300) {
    this.status = err.status || 500;
  }
  // 默认错误响应
  if (err.statusCode) this.set('Content-Type', 'text/plain');
  res.end(err.message);
  this.app.emit('error', err, this);
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `err instanceof Error` | 类型守卫 | 字符串/对象也接 |
| `headerSent` | 已写 header 标记 | 写过的不能再改 |
| `err.status || 500` | 兜底状态码 | 用户 `ctx.throw(404)` 设 404 |
| `res.end(err.message)` | 直接结束 | 不再 pipe |
| `app.emit('error', err, this)` | 业务监听 | 默认 console.error |

**最佳实践**：
- ✅ `ctx.throw(404, 'Not Found')` 是 `throw Object.assign(new Error('Not Found'), {status: 404})` 糖。
- ✅ `app.on('error', err => log(err))` 把错误丢到 Sentry/Bugsnag。
- ✅ 已写 header 后报错只能 `res.destroy()`（没法改 status）。
- ✅ 自定义 `ctx.onerror`：用 `app.context.onerror = function(err) { ... }` 全局改。
- ✅ 写 `try-catch` 时记得 `ctx.app.emit('error', err, ctx)`，否则错误"哑"。

---

### 模式 9：`Application.handleRequest` 调度（解决"异步错误 + 响应兜底"）

**问题场景**：用户中间件抛 `Promise.reject`，Node 默认 `unhandledRejection` 直接崩。需要在 `handleRequest` 这层用 `.catch` 接住并转给 `ctx.onerror`。

**解决方案代码**：

```javascript
// lib/application.js
handleRequest(ctx, fnMiddleware) {
  const res = ctx.res;
  res.statusCode = 404;
  const onerror = err => ctx.onerror(err);
  const handleResponse = () => respond(ctx);
  onFinished(res, onerror);  // 连接断开时也触发
  return fnMiddleware(ctx).catch(onerror);
}

const respond = (ctx) => {
  if (ctx.respond === false) return;
  if (!ctx.writable) return;
  const res = ctx.res;
  let body = ctx.body;
  const code = ctx.status;
  if (statuses.empty[code]) {
    ctx.res.end();
    return;
  }
  if (ctx.method === 'HEAD') {
    ctx.res.end();
    return;
  }
  if (body == null) {
    if (ctx.response._explicitNullBody) {
      ctx.length = 0;
      return res.end();
    }
    if (ctx.req.httpVersionMajor >= 2) { body = String(code); }
    else { body = ctx.message || String(code); }
    body = body.replace(...);
    if (!res.headersSent) ctx.type = 'text';
    ctx.length = Buffer.byteLength(body);
    return res.end(body);
  }
  // 头部已写则 pipe body
  return body.pipe ? body.pipe(res) : res.end(body);
};
```

**关键参数表**：

| 名称 | 作用 | 默认值 |
|------|------|--------|
| `res.statusCode = 404` | 默认 404 | 业务设后覆盖 |
| `onFinished(res, onerror)` | 连接断开兜底 | 客户端断连也触发 |
| `ctx.respond === false` | 跳过自动响应 | WebSocket 用 |
| `ctx.writable` | 可写检测 | `!res.writableEnded` |
| `statuses.empty[code]` | 空 body 码 | 204/205/304 |
| `body.pipe` | 走 stream 路径 | 大文件 |

**最佳实践**：
- ✅ `app.proxy = true` + `app.proxyIpHeader = 'X-Real-IP'` 部署反代后正确取 IP。
- ✅ `ctx.respond = false` 给 SSE/WebSocket：自己 `res.write()` + `res.end()`。
- ✅ 客户端断连中间件仍跑——用 `ctx.req.aborted` 检查。
- ✅ `ctx.length` 是字节数，**不是**字符数（中文 UTF-8 3 字节）。
- ✅ 内部 `respond()` 之前调过 `ctx.body = ...`，**不要**再手动 `res.end()`。

---

### 模式 10：`search-params` URLSearchParams 封装（解决"querystring 跨版本 API"）

**问题场景**：`querystring` 是 Node 内置老 API（`parse`/`stringify`），用对象形式；`URLSearchParams` 是 Web 标准（`append`/`get`），两种 API 在不同 Node 版本出现。Koa 想统一。

**解决方案代码**：

```javascript
// lib/search-params.js
class URLSearchParams extends globalURL.URLSearchParams {
  get(name) { return super.get(name) || null; }
  set(name, value) { return super.set(name, value); }
  toString() { return super.toString(); }
  sort() { super.sort(); return this; }
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `get(name)` | 取值 | 无则 `null` |
| `set(name, value)` | 单值覆盖 | 不 append |
| `toString()` | 序列化 | 同样用于 toString ctx.query |
| `sort()` | 排序 | 缓存场景 |
| `globalURL.URLSearchParams` | Web 标准 | 跨 Node 18+ |

**最佳实践**：
- ✅ `ctx.query` 是 `URLSearchParams` 实例，直接 `q.get('key')`。
- ✅ `ctx.querystring` 是字符串，**不是**对象。
- ✅ `?a=1&a=2` 用 `getAll('a')` 取多值。
- ✅ `URLSearchParams` 是可迭代的，`for (const [k, v] of params)`。
- ✅ 不要用 `node:querystring`——Koa 已迁移到 URLSearchParams。

---

## 三、性能优化：流式响应与零拷贝

### 模式 11：Stream pipe 替代 Buffer（解决"大文件响应内存爆"）

**问题场景**：用户传 `ctx.body = fs.readFileSync('huge.zip')` 给 1GB 文件，内存峰值 1GB。Stream pipe 边读边写，内存稳定在 64KB。

**解决方案代码**：

```javascript
// lib/response.js
set body(val) {
  ...
  if (val instanceof Stream) {
    this.res.once('pipe', onfinish);
    this.res.once('error', onerror);
    val.pipe(this.res);
  }
  ...
}
// 移除 Content-Length（未知）
remove('Content-Length');
// 设置 chunked encoding
this.res.shouldKeepAlive = false;
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `val.pipe(this.res)` | 边读边写 | 不经过 Koa 内存 |
| `res.once('pipe', onfinish)` | 监听写完 | 触发 `ctx.app.emit('finish', ctx)` |
| `res.once('error', onerror)` | 监听错误 | 转 `ctx.onerror` |
| `remove('Content-Length')` | 不设长度 | HTTP/1.1 用 chunked |
| `shouldKeepAlive = false` | 关 keep-alive | 大文件避免长连接 |

**最佳实践**：
- ✅ 大文件**必须** `fs.createReadStream()`，**绝不** `readFileSync`。
- ✅ `Range` header 由 Koa 自动处理（`Accept-Ranges: bytes`）。
- ✅ Stream 模式不会自动设 `Content-Type`——记得 `ctx.type = 'video/mp4'`。
- ✅ 中间件提前 `ctx.respond = false` 接管 res 后再 pipe。
- ✅ Stream 模式默认 `errored` 事件转 `ctx.onerror`——流错误不会"哑"。

---

### 模式 12：`onFinished` 钩子（解决"响应完成后通知"）

**问题场景**：业务要"响应结束后"做清理（关闭文件描述符、写监控指标），但 HTTP 协议层无事件。`on-finished` 包能监听 `res` 的 `finish`/`close` 事件。

**解决方案代码**：

```javascript
// lib/application.js
handleRequest(ctx, fnMiddleware) {
  const onerror = err => ctx.onerror(err);
  onFinished(ctx.res, onerror);  // 响应结束（成功或失败）时触发
  return fnMiddleware(ctx).catch(onerror);
}
// 用法：自定义中间件
function* timer(next) {
  const start = Date.now();
  yield next;
  const ms = Date.now() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
}
// timer 自身需要 onFinished 才能拿到耗时——on-finished 包是基础设施
```

**关键参数表**：

| 名称 | 作用 | 触发 |
|------|------|------|
| `onFinished(res, cb)` | 监听响应结束 | `finish` 或 `close` |
| 客户端断连 | 也触发 | 避免悬挂 |
| 错误响应 | 也触发 | 统一清理 |
| 流式响应 | 完整 pipe 完才触发 | 适合大文件 |
| `err` 参数 | 错误时 err 非空 | cb(err) |

**最佳实践**：
- ✅ `X-Response-Time` 中间件基于 on-finished 写耗时。
- ✅ 监控 metrics 写入：on-finished 回调里 `metrics.responseTime.observe(ms)`。
- ✅ 数据库连接释放：on-finished 回调里 `connection.release()`。
- ✅ 不要在 `ctx.body` setter 里手动调 on-finished——框架自动装。
- ✅ `on-finished` 不会重复触发：内部用 flag 守卫。

---

### 模式 13：`request.fresh` 协商缓存（解决"304 Not Modified 零拷贝"）

**问题场景**：客户端 `If-None-Match` 带 ETag 服务端不查就 200，浪费带宽。fresh 检查 ETags + Last-Modified 一致性。

**解决方案代码**：

```javascript
// lib/request.js
get fresh() {
  const method = this.method;
  const s = this.ctx.status;
  // 只对 GET/HEAD 检查
  if (method !== 'GET' && method !== 'HEAD') return false;
  if ((s >= 200 && s < 300) || s === 304) {
    const etagMatches = this.freshEtag();
    const notModifiedMatches = this.freshNotModified();
    return etagMatches || notModifiedMatches;
  }
  return false;
}

freshEtag() {
  const noneMatch = this.request.header['if-none-match'];
  if (!noneMatch) return false;
  const etag = this.response.etag;
  if (!etag) return false;
  const etags = parseTokenList(noneMatch);
  for (const val of etags) {
    if (val === '*' || val === etag) return true;
  }
  return false;
}
```

**关键参数表**：

| 名称 | 作用 | 触发 |
|------|------|------|
| `ctx.fresh` | bool | 缓存有效 |
| `If-None-Match` | 客户端 ETag | header |
| `If-Modified-Since` | 客户端时间 | header |
| `response.etag` | 服务端 ETag | 设过才比较 |
| `parseTokenList` | 解析多值 ETag | `etag1, etag2` |
| `*` 匹配 | 强校验 | 任意 ETag 都中 |

**最佳实践**：
- ✅ `ctx.fresh` 用在 `if (ctx.fresh) ctx.status = 304; return;`。
- ✅ `ctx.response.etag = crypto.createHash('md5').update(body).digest('hex')`。
- ✅ 静态资源 `ctx.set('ETag', etag)` 配合 `Cache-Control: max-age=...`。
- ✅ `ctx.fresh` 只对 GET/HEAD 生效——POST 永远 false。
- ✅ 304 不写 body——Koa 自动 `res.end()`。

---

### 模式 14：`accepts` 内容协商（解决"客户端 Accept 头决定响应格式"）

**问题场景**：同一接口 `/users/123`，浏览器要 HTML、App 要 JSON。手动解析 `Accept` 头繁琐。

**解决方案代码**：

```javascript
// lib/request.js
accepts(...args) {
  return this.negotiator.types(...args);
}
// 用法
if (ctx.accepts('html')) { ctx.body = render('user', user); }
else if (ctx.accepts('json')) { ctx.body = user; }
else { ctx.throw(406); }
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `ctx.accepts('html', 'json')` | 第一个匹配的 | 按顺序优先 |
| `ctx.acceptsEncodings('gzip')` | 压缩协商 | 返回 bool |
| `ctx.acceptsCharsets('utf-8')` | 字符集 |  |
| `ctx.acceptsLanguages('en')` | 语言 |  |
| `negotiator` | 内部包 | npm |
| 406 Not Acceptable | 都不匹配 | 抛错 |

**最佳实践**：
- ✅ `ctx.accepts(['html', 'json'])` 数组形式，Keras 风格的"第一个匹配"。
- ✅ 写 API 用 `if (!ctx.accepts('json')) ctx.throw(406)`。
- ✅ 配合 `ctx.type = 'json'` 避免回写 Content-Type。
- ✅ 性能：accepts 解析 O(n) header tokens，不在热路径 cache。
- ✅ 浏览器通常发 `Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8`——支持多值。

---

### 模式 15：`cookies` 懒解析（解决"读 cookie 每次都 parse"）

**问题场景**：每个 `ctx.cookies.get('sid')` 都重新 parse `req.headers.cookie` 性能差。

**解决方案代码**：

```javascript
// lib/context.js
get cookies() {
  if (!this[COOKIES]) {
    this[COOKIES] = new Cookies(this.req, this.res, {
      keys: this.app.keys,
      secure: this.request.secure
    });
  }
  return this[COOKIES];
}

set cookies(_cookies) {
  this[COOKIES] = _cookies;
}
// 用法
ctx.cookies.set('name', 'value', { httpOnly: true, maxAge: 900000, signed: true });
const sid = ctx.cookies.get('sid');
```

**关键参数表**：

| 名称 | 作用 | 默认值 |
|------|------|--------|
| `httpOnly` | JS 不可读 | 建议 true |
| `secure` | 仅 HTTPS |  |
| `maxAge` | 过期毫秒数 | 浏览器关闭即过 |
| `expires` | 绝对过期 | Date 对象 |
| `signed` | HMAC 签名 | 防篡改 |
| `sameSite` | CSRF 防护 | `'Lax'` |
| `overwrite` | 同名覆盖 |  |

**最佳实践**：
- ✅ session 一定要 `httpOnly: true` + `signed: true`。
- ✅ 调试 cookie 失败先看 Network 面板 Response headers 的 `Set-Cookie`。
- ✅ `app.keys = [process.env.SECRET_KEY]` 是签名密钥**数组**（可轮换）。
- ✅ `ctx.cookies.get('sid', { signed: true })` 校验签名（没传 signed 不会验）。
- ✅ SameSite 默认在 npm `cookies` 包是 `false`——要主动设。

---

## 四、可靠性与生态：版本演进、监控与治理

### 模式 16：v1 → v2 → v3 演进（解决"generator/async/AsyncLocalStorage 适配"）

**问题场景**：Koa 1.x 用 generator（`function*` + `yield next`），2.x 改 async/await，3.x 引入 `AsyncLocalStorage` 隔离请求上下文。三代 API 互相破坏性升级。

**解决方案代码**：

```javascript
// v1 (generator) → v2 (async/await) 迁移
// v1
app.use(function* (next) {
  this.body = yield something;
  yield next;
});
// v2
app.use(async (ctx, next) => {
  ctx.body = await something;
  await next();
});
// v3 新增 AsyncLocalStorage（追踪 ctx）
const { AsyncLocalStorage } = require('async_hooks');
const requestStore = new AsyncLocalStorage();
app.use(async (ctx, next) => {
  await requestStore.run(ctx, () => next());
  // 业务可 requestStore.getStore() 取 ctx
});
```

**关键参数表**：

| 版本 | 时代 | 中间件签名 | 状态码 |
|------|------|------------|--------|
| 1.x | generator | `(this, next) => yield next` | 历史 |
| 2.x | async/await | `(ctx, next) => await next()` | 主流 |
| 3.x | + AsyncLocalStorage | 同 2.x | 当前 |
| 4.x | 计划 | Stream-first | RFC |

**最佳实践**：
- ✅ 新项目**只**用 2.x/3.x——不要学 generator。
- ✅ 迁移旧项目 `function*` → `async`，`yield` → `await`，`this` → `ctx`。
- ✅ 3.x 的 `AsyncLocalStorage` 让数据库连接、日志 trace id 跟随请求自动隔离。
- ✅ 部署时锁 `koa@^2.13` 或 `^3.x`——不要用 `latest`（破坏性变更）。
- ✅ `migration-v1-to-v2.md` / `migration-v2-to-v3.md` 是必读——仓库自带。

---

### 模式 17：`AsyncLocalStorage` 请求隔离（解决"日志/DB 连接跟踪"）

**问题场景**：用户登录后发起的 10 个 DB 查询来自不同请求，DB middleware 怎么知道"当前 ctx 是哪个"？传参太丑，用 `cls-hooked` 又黑魔法。

**解决方案代码**：

```javascript
// koa 3.x 集成 AsyncLocalStorage
// lib/application.js
const { AsyncLocalStorage } = require('async_hooks');
// ...在 handleRequest 内部：
return storage.run(ctx, () => fnMiddleware(ctx).catch(onerror));
// 业务使用
const storage = new AsyncLocalStorage();
async function dbQuery(sql) {
  const ctx = storage.getStore();
  ctx.logger.info({ sql }, 'db query');
  return pool.query(sql);
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `storage.run(ctx, fn)` | 启动隔离 | 绑定 ctx |
| `storage.getStore()` | 取当前 ctx | 同步代码可取 |
| `async_hooks` | Node 内置 | 不需额外包 |
| 异步链路 | 跟踪 | 跨 await 也通 |
| 多实例 | 互不干扰 | 关键 |

**最佳实践**：
- ✅ 业务库用 `storage.getStore()` 取 ctx——比 `req` 全局变量好。
- ✅ 不要在 storage 放**大对象**（如 1MB 的 user profile）——会增加 GC 压力。
- ✅ 同步代码里 `getStore()` 返回的 ctx 是当次请求的——`try/catch` 也能拿。
- ✅ `process.domain` 已被废弃，**只**用 AsyncLocalStorage。
- ✅ koa 3.x 内部已用它跟踪 ctx——业务层可以自己建第二个 storage。

---

### 模式 18：`proxies` 反代支持（解决"X-Forwarded-For / X-Real-IP 解析"）

**问题场景**：Nginx 转发后 `ctx.ip` 永远是 `127.0.0.1`，`ctx.host` 是 `localhost`。需要解析反代 header。

**解决方案代码**：

```javascript
// lib/request.js
get ip() {
  if (!this.app.proxy) return this.socket.remoteAddress;
  const proxyIps = this.ips;
  return proxyIps[0] || this.socket.remoteAddress;
}

get ips() {
  const proxyIps = (this.app.proxyIpHeader in this.headers) ?
    this.headers[this.app.proxyIpHeader].split(/ *, */) : [];
  return proxyIps.slice(0, this.app.maxIpsCount);
}

get host() {
  const proxy = this.app.proxy;
  let host = proxy && this.get('X-Forwarded-Host');
  if (!host) host = this.get('Host');
  return host ? host.split(/\s*,\s*/, 1)[0] : '';
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `app.proxy` | 是否信任反代 | 部署时设 |
| `app.proxyIpHeader` | IP header 名 | 默认 `X-Forwarded-For` |
| `app.maxIpsCount` | IP 链最大长度 | 防伪造 |
| `ctx.ips` | IP 链数组 | 逗号分隔 |
| `ctx.host` | 域名 | 不含端口 |
| `ctx.protocol` | http/https |  |

**最佳实践**：
- ✅ `app.proxy = true` **必须**显式开启（不开启时 `ctx.ip` 是直连 IP）。
- ✅ `app.maxIpsCount = 1` 防 `X-Forwarded-For: 1.1.1.1, 127.0.0.1` 攻击。
- ✅ Nginx 配置 `proxy_set_header X-Real-IP $remote_addr;` + `app.proxyIpHeader = 'X-Real-IP'`。
- ✅ `ctx.protocol` = `'https'` 时 `ctx.secure = true`——给 cookie `secure: true` 用。
- ✅ 调试反代问题：先 `console.log(ctx.ips)` 看链路。

---

### 模式 19：常见中间件生态（解决"裸 Koa 啥都不带"）

**问题场景**：Koa 设计哲学是"核心最小、生态丰富"，但新用户不知道要装哪些包。

**解决方案代码**：

```javascript
// 典型生产栈
const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const helmet = require('koa-helmet');
const logger = require('koa-logger');
const compress = require('koa-compress');
const static = require('koa-static');
const session = require('koa-session');

const app = new Koa();
app.use(async (ctx, next) => {  // 错误兜底
  try { await next(); }
  catch (err) { ctx.status = err.status || 500; ctx.body = { error: err.message }; }
});
app.use(logger());
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(compress());
app.use(bodyParser());
app.use(session(app));
app.use(static('public'));
const router = new Router();
router.get('/api/users', listUsers);
app.use(router.routes()).use(router.allowedMethods());
app.listen(3000);
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `@koa/router` | 路由 | Express 风格 |
| `koa-bodyparser` | 解析 JSON body | 大文件换 raw-body |
| `@koa/cors` | 跨域 | 配置 origin |
| `koa-helmet` | 安全 header | 默认开启 |
| `koa-logger` | 访问日志 | dev 用 |
| `koa-compress` | gzip/br 压缩 | 高 CPU 场景关 |
| `koa-static` | 静态资源 | ETag 支持 |
| `koa-session` | session | Redis/Knex store |

**最佳实践**：
- ✅ **不要**用 `koa-router`——已改名 `@koa/router`（Koa 团队新包）。
- ✅ 错误兜底中间件**放在最前**——`await next()` 让所有下游错误都接住。
- ✅ `koa-bodyparser` 默认 1MB body，大文件 `koa-bodyparser({ jsonLimit: '10mb' })`。
- ✅ `koa-session` 用 Redis 存：`new RedisStore({ client: redisClient })`。
- ✅ `koa-helmet` 默认 CSP 太严——开发时关 CSP。

---

### 模式 20：测试矩阵（解决"node:test 原生测试 + 77 个 case"）

**问题场景**：Koa 3.x 切到 Node 内置 `node --test`，避免 jest/mocha 依赖。需要在 18/20/22 三个 LTS 版本跑全测试。

**解决方案代码**：

```javascript
// __tests__/application/test.js
const test = require('node:test');
const assert = require('assert');
const Koa = require('../..');
const request = require('supertest');

test('app.use 注册中间件', async () => {
  const app = new Koa();
  app.use((ctx) => { ctx.body = 'hello'; });
  const server = app.listen();
  const res = await request(server).get('/');
  assert.equal(res.status, 200);
  assert.equal(res.text, 'hello');
  server.close();
});

test('洋葱模型双向执行', async () => {
  const app = new Koa();
  const order = [];
  app.use(async (ctx, next) => { order.push(1); await next(); order.push(4); });
  app.use(async (ctx, next) => { order.push(2); await next(); order.push(3); });
  app.use((ctx) => { ctx.body = 'ok'; });
  const server = app.listen();
  await request(server).get('/');
  assert.deepEqual(order, [1, 2, 3, 4]);
  server.close();
});
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `node --test` | 原生测试 | 无依赖 |
| `node:test` | 命名空间 | `describe/it/...` |
| `supertest` | HTTP 模拟 | npm |
| `assert.equal` | 严格等 | `===` |
| `server.close()` | 清理 | 避免挂起 |
| `node.js.yml` | CI | 18/20/22 矩阵 |

**最佳实践**：
- ✅ Koa 3.x **完全**用 `node:test`——其他项目可学（避免 jest 配置地狱）。
- ✅ 写中间件测试**优先**测洋葱模型（`order` 数组），不只测返回值。
- ✅ 错误处理测试：`app.use(() => { throw new Error('boom'); })` + 验证 500。
- ✅ CI 在 3 个 Node LTS 版本跑：`.github/workflows/node.js.yml` 已配。
- ✅ `request(app.callback())` 直接传入——`supertest` 自动处理。

---

## 参考

- Koa 官方文档：https://koajs.com/
- 源码：`lib/` 7 个文件
- npm：https://www.npmjs.com/package/koa
- 当前版本：3.2.1（v3.x 稳定线）
- License：MIT
- 核心维护者：dead_horse（发起人）、jonathanong、niftylettuce
