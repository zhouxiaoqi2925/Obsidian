# axios - 跨平台 Promise 化 HTTP 客户端的事实标准

**GitHub**: axios/axios
**Star**: 105k+
**语言**: JavaScript
**主题**: HTTP 客户端 / Promise / 拦截器链 / 适配器
**适用场景**: 浏览器/Node/Bun/React Native/Deno 跨端 HTTP、鉴权/重试/取消/进度、SSR

## 第一段：基础范式

### 模式 1：createInstance 工厂 + bind 制造可调用 instance

**问题场景**：用户想 `axios(config)` 直接调用——但 `Axios` 是 class，prototype 上的 `request` 必须 `new` 才能用。还要暴露 `axios.get/post` 静态方法 + `axios.create` 子实例。

**解决方案**：用 `createInstance` 工厂 + `bind` 把 `Axios.prototype.request` 变成独立函数，再用 `utils.extend` 把 prototype 方法和 instance 字段都复制过去：
```js
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);
  utils.extend(instance, Axios.prototype, context, { allOwnKeys: true });
  utils.extend(instance, context, null, { allOwnKeys: true });
  instance.create = function (cfg) { return createInstance(mergeConfig(defaultConfig, cfg)); };
  return instance;
}
```

**关键参数**：
- `bind` 锁死 `this`——让方法脱离 class 也能用
- `utils.extend` 两段：第一段拷 prototype 方法（get/post/...），第二段拷 instance 字段
- `allOwnKeys: true`——Symbol 也复制
- `instance.create` 闭包引用 `defaultConfig`——实例继承链

**最佳实践**：不要让用户 `new Axios()`——工厂更友好；用 bind 而非箭头函数（箭头函数无 prototype）；`create` 必须基于 parent defaults 合并——实现"实例继承"。

---

### 模式 2：InterceptorManager 用 null 槽位实现 O(1) eject

**问题场景**：用户用 `use` 注册拦截器拿 id，eject 时怎么 O(1) 移除？splice 会让所有 id 重排，外部引用全失效。

**解决方案**：用 null 槽位替代 splice：
```js
eject(id) { if (this.handlers[id]) this.handlers[id] = null; }
forEach(fn) { this.handlers.forEach(h => h !== null && fn(h)); }
```

**关键参数**：
- `null` 槽位：eject 不重排 id
- `forEach` 跳过 null——O(1) eject
- `options`：`synchronous` / `runWhen` 配置
- id 是契约——用户不持有 handler 对象
- `use` 返回 id——给用户凭证

**最佳实践**：eject 用 null 槽位而非 splice——保 id 稳定；`synchronous: true` 是 first-class 标记——允许 SSR 热路径优化；`runWhen` 是 escape hatch——按条件跳过；返回 id 让用户能 eject——但禁止外部读 handlers。

---

### 模式 3：3 适配器能力探测 ≠ 环境判断

**问题场景**：浏览器用 xhr，Node 用 http，跨平台用 fetch——但环境判断（typeof window）不准确。Bun/Deno 既是浏览器又有 Node 能力。

**解决方案**：`adapters.js` 按"能力"选择，而非"环境"：
```js
defaults.adapter = ['xhr', 'http', 'fetch']  // 数组 fallback
```

**关键参数**：
- `isFunction(adapter)` / `adapter.get(config)`：支持函数或 `{get}` 两种形态
- xhr：浏览器专属，进度事件 + 同步上传
- http：Node 原生，流式支持
- fetch：跨平台，依赖 `Request` 构造
- `supportsRequestStream`：fetch 流能力探测
- `kAxiosInstalledTunnel`：http tunnel 标志

**最佳实践**：用能力探测而非环境判断——Bun/Deno 友好；`adapter` 接受数组——fallback 链；fetch 适配器走对象形态（带 get）——因依赖 `Request` 构造 + ServiceWorker 拦截；用户传自定义 adapter 走函数形态。

---

### 模式 4：请求/响应拦截器 LIFO/FIFO 双序

**问题场景**：用户加 auth interceptor 期望"后注册的先生效"（覆盖旧 token），加 log interceptor 期望"先注册的先看到响应"（按调用顺序日志）——同一条链两种顺序。

**解决方案**：
```js
// request: unshift (LIFO)
requestInterceptorChain.unshift(fulfilled, rejected);
// response: push (FIFO)
responseInterceptorChain.push(fulfilled, rejected);
```

**关键参数**：
- LIFO request：最后注册的最先跑——贴近洋葱模型
- FIFO response：先注册的最先跑——贴近中间件链
- async 链：`Promise.resolve(config).then(fulfilled, rejected)`
- 同步链：`while` 循环 + try/catch（节省 microtask）
- `options.synchronous`：声明同步拦截器

**最佳实践**：request LIFO + response FIFO——直觉对；用 `unshift/push` 而非数组反向遍历——性能好；同步拦截器避 microtask——SSR hot path 关键；统一链调用约定——`onFulfilled, onRejected` 成对 push。

---

### 模式 5：CancelToken + AbortSignal 双轨制

**问题场景**：axios 2017 年起就有 CancelToken（Promise-based），2018 后 fetch 标准引入 AbortSignal——两套 API 必须共存。

**解决方案**：用 `composeSignals` 把"用户传的 signal + 超时 signal + cancelToken"塞进一个 AbortController：
```js
function composeSignals(signals, timeoutSignal) {
  const controller = new AbortController();
  return { signal: controller.signal, abort: (reason) => controller.abort(reason) };
}
```

**关键参数**：
- `CancelToken`：老 API，`cancelToken.promise.then(...)`
- `AbortSignal`：新 API，标准 fetch 兼容
- `composeSignals`：统一内部 controller
- `AbortController` 包装：可多个 signal 合并
- `timeout`：自动生成 timeout signal

**最佳实践**：新代码用 AbortSignal——标准；老代码 CancelToken 不删——6 年向后兼容；统一到 AbortController 内部——避免暴露双套 API；`composeSignals` 必须支持"用户 signal + timeout signal"合并。

---

## 第二段：扩展范式

### 模式 6：AxiosHeaders 声明式 accessor

**问题场景**：`config.headers` 是 plain object，header 拼接要走 `Object.assign`，set-cookie 多值、content-type case-insensitive 等特例多。

**解决方案**：用 `AxiosHeaders` 内部统一封装，accessor 声明式 getter/setter：
```js
class AxiosHeaders {
  set(header, valueOrRewrite) { ... }
  get(header, parser) { ... }
  has(header) { ... }
  normalize(value) { ... }
}
```

**关键参数**：
- accessor pattern：`Object.defineProperty` 暴露常用 header
- normalize：自动转 lower-case / trim
- set-cookie 多值：用 array 存，序列化时 join
- `toJSON()`：转 plain object 给 fetch/Node
- `merge` 优先级：用户 > instance > defaults

**最佳实践**：headers 内部走 `AxiosHeaders`——边界统一；`config.headers` 对外保留 plain object——不破坏用户代码；set-cookie 用 array——多次设置不覆盖；accessor 暴露常用 header——`headers['Content-Type']` 直接用。

---

### 模式 7：AxiosError redactConfig 防泄漏

**问题场景**：错误对象上挂 `error.config`（含 auth header）和 `error.response`（含 body），序列化错误到日志/监控时敏感信息泄露。

**解决方案**：`redactConfig(config)` 删掉敏感字段（`Authorization`、`Cookie`、`X-Api-Key`），`AxiosError.toJSON()` 走脱敏路径：
```js
class AxiosError {
  toJSON() { return { ...this, config: redactConfig(this.config) }; }
}
```

**关键参数**：
- `redactConfig`：删 auth header / 敏感字段
- `toJSON` 默认脱敏——给监控/日志用
- `cause` 字段：保留原始 cause
- stack 缝补：async/await 边界补全
- `__proto__: null`：防 prototype pollution

**最佳实践**：error 序列化必须脱敏——监控合规要求；保留 `cause` 链——根因可追溯；stack 缝补放 async 边界——避免错位；自定义 redact 函数可注入——业务敏感字段。

---

### 模式 8：mergeConfig null-proto 防 prototype pollution

**问题场景**：用户传 `__proto__` 字段——CVE-2020-28168 教训：merge 时把 `__proto__` 当普通键写入会污染原型链。

**解决方案**：所有 merge 后的对象用 `Object.create(null)` 创建：
```js
function merge(/* obj1, obj2, obj3, ... */) {
  const result = Object.create(null);
  for (let i = 0; i < arguments.length; i++) mergeDeep(result, arguments[i]);
  return result;
}
```

**关键参数**：
- `Object.create(null)`：无 prototype
- 6 个文件用 `__proto__: null` 显式防
- `mergeDeep`：递归深度合并
- `mergeConfig(this.defaults, this.config)`：defaults 优先
- `forEach` 遍历：跳过原型链

**最佳实践**：所有 merge 后对象用 `Object.create(null)`；显式 `__proto__: null` 防御；不直接 `JSON.parse` 信任用户输入——先 sanitize；CVE 教训写在注释——防止后人重蹈覆辙。

---

### 模式 9：dispatchRequest 顺序固定 transformResponse

**问题场景**：用户想在响应前修改 data（解密、解 gzip、parse JSON）——但 transform 顺序错会破坏链。

**解决方案**：`dispatchRequest` 固定 4 步：transformRequest → adapter 请求 → 校验状态码 → transformResponse：
```js
async function dispatchRequest(config) {
  config.data = transformRequest.call(config, config.headers, config.data);
  const response = await adapter(config);
  response.data = transformResponse.call(config, config.headers, response.data);
  return response;
}
```

**关键参数**：
- `transformRequest`：data 序列化（JSON / FormData / URLSearchParams）
- `adapter`：xhr/http/fetch 之一
- `validateStatus`：状态码校验（默认 2xx 通过）
- `transformResponse`：data 反序列化
- 4 步顺序固定——`request flow` 不变

**最佳实践**：transform 走 plugin 而非改 dispatchRequest；`validateStatus` 配 2xx——用户可改 4xx 也接受；`transformResponse` 跑 `try/finally`——失败也清理；transform 链支持 async——返回 Promise。

---

### 模式 10：transformResponse 临时挂载的 try/finally

**问题场景**：transformResponse 失败时 response body 已部分读——要清理 stream 又不能影响 next transform。

**解决方案**：`transformResponse` 包在 try/finally 里，失败时清理中间流：
```js
try {
  response.data = await transformPipe(stream, transformers);
} finally {
  stream.destroy?.();
}
```

**关键参数**：
- `AxiosTransformStream`：流式 transform
- `try/finally`：失败也清
- 多个 transformer 链式 pipe
- stream.destroy：避免内存泄漏
- `composeSignals`：与取消信号联动

**最佳实践**：所有 stream 操作配 try/finally——防泄漏；`AxiosTransformStream` 兼容 fetch Body；多个 transform 链式 pipe——避免中间 buffer；用 AbortSignal 联动 stream destroy——取消响应。

---

## 第三段：进阶范式

### 模式 11：能力探测 fallback 链 `['xhr', 'http', 'fetch']`

**问题场景**：用户环境可能不支持某些 API——必须 fallback。Node 18+ 有原生 fetch，但 http adapter 性能更好。

**解决方案**：`defaults.adapter` 接受数组，按顺序探测：
```js
defaults: { adapter: ['xhr', 'http', 'fetch'] }
```

**关键参数**：
- 数组 fallback 链——按顺序
- 第一个支持的胜出
- 用户可覆盖：`axios.defaults.adapter = ['fetch']`
- 自定义 adapter：函数或 `{get}` 对象
- `getAdapter` 探测函数

**最佳实践**：adapter 数组——比单一指向更灵活；Node 18+ 优先 fetch——生态统一；Bun 优先 fetch——性能；老 Node 走 http——稳；用户可强制 adapter——`defaults.adapter = ...`。

---

### 模式 12：同步拦截器 microtask 节省

**问题场景**：SSR 场景 1000 RPS——每个请求都走 `Promise.resolve(config).then(...)` 至少 1 microtask。同步拦截器可 0 microtask。

**解决方案**：扫描所有 request 拦截器，若全 `synchronous: true` 走 `while` 循环：
```js
if (!synchronousRequestInterceptors) { /* 异步链 */ }
else { /* 同步 while 循环 */ }
```

**关键参数**：
- 同步标志位：所有拦截器 `synchronous: true` 才为真
- 同步路径：`while` 循环 + try/catch
- 0 microtask：节省数毫秒
- 退化机制：任一异步就退化
- 兼用同步响应拦截器

**最佳实践**：SSR / mock 场景声明 `synchronous: true`；不要半同步半异步——退化会让人困惑；同步路径要 try/catch——错误处理不能丢；保留 microtask 节省——大流量关键。

---

### 模式 13：进度事件 + 节流

**问题场景**：上传大文件进度条每 100ms 触发——但 xhr 的 `progress` 事件频率高，UI 卡顿。

**解决方案**：`throttle` 工具节流 + onUploadProgress / onDownloadProgress 回调：
```js
throttle(fn, threshold) { let last = 0; return (...args) => { const now = Date.now(); if (now - last >= threshold) { last = now; fn(...args); } }; }
```

**关键参数**：
- 节流阈值：100ms 默认
- 上传进度：`e.loaded / e.total`
- 下载进度：流式 chunk
- 自定义 callback：用户可传
- 取消联动：AbortSignal 触发 abort

**最佳实践**：节流 100ms——UI 流畅；进度回调用百分比——UI 通用；大文件上传用分片——避免单 chunk 错误重传；下载进度需要 `Content-Length` 头——缺失则用 `loaded` 估算。

---

### 模式 14：composeSignals 合并用户 signal + timeout

**问题场景**：用户传 AbortSignal + axios 自动 timeout signal——两者都要 abort 时触发 cancel。

**解决方案**：`composeSignals` 创建一个新 AbortController，监听多个 signal：
```js
function composeSignals(signals, timeoutSignal) {
  const controller = new AbortController();
  for (const signal of signals) signal?.addEventListener('abort', () => controller.abort(signal.reason));
  if (timeoutSignal) timeoutSignal.addEventListener('abort', () => controller.abort(timeoutSignal.reason));
  return controller.signal;
}
```

**关键参数**：
- 多 signal 合并：用户 + timeout
- 任一 signal abort：触发 controller
- reason 透传
- cleanup：监听器解绑
- AbortController 统一出口

**最佳实践**：合并多 signal——避免外部监听多个；`reason` 透传——告知触发源；`addEventListener('abort')` 而非 polling——事件驱动；解绑监听器——避免内存泄漏。

---

### 模式 15：__proto__ 显式 null 防御 prototype pollution

**问题场景**：`__proto__` 是 Object.prototype 属性——merge 时把它当 key 写入 `target.__proto__` 会污染原型。

**解决方案**：所有可能 merge 的对象显式 `__proto__: null`：
```js
const headers = { __proto__: null, 'Content-Type': 'application/json' };
```

**关键参数**：
- `__proto__: null`：Object.create(null) 显式写法
- 6 个文件显式声明
- mergeConfig 用 Object.create(null) 创建 result
- `hasOwnProperty` 严格判断
- CVE-2020-28168 教训写注释

**最佳实践**：所有 merge 对象用 `__proto__: null` 或 `Object.create(null)`；不直接 `Object.assign` 信任输入；CVE 教训写在注释——防重蹈；深度 merge 时也要 null-proto 每一层。

---

## 第四段：实战范式

### 模式 16：浏览器 + Node + Bun 跨平台分发

**问题场景**：axios 跑在浏览器/Node/React Native/Deno/Bun——不同 runtime 入口不同。

**解决方案**：4 个 dist 产物（`axios.js` UMD / `axios.cjs` CJS / `axios.esm.js` ESM / `axios.min.js`），`package.json` 配 `browser` / `main` / `module` 字段：
```json
{ "main": "index.js", "module": "index.js", "browser": { "./lib/adapters/http.js": "./lib/platform/browser/index.js" } }
```

**关键参数**：
- 4 dist：UMD / CJS / ESM / min
- `browser` 字段：覆盖 http 适配器
- `platform/browser/index.js` vs `platform/node/index.js`
- exports 条件导出
- `react-native` 走 xhr adapter

**最佳实践**：4 dist 产物——覆盖所有 runtime；`browser` 字段映射——浏览器无 http 模块；Bun/Deno 用 fetch adapter——跨平台；测试覆盖所有 runtime——CI 矩阵。

---

### 模式 17：withCredentials + CORS Cookie 跨域

**问题场景**：跨域请求带 cookie——浏览器需要 `withCredentials=true`，服务端要 `Access-Control-Allow-Credentials`。

**解决方案**：`config.withCredentials = true`，axios 自动给 xhr 设置：
```js
if (config.withCredentials) xhr.withCredentials = true;
```

**关键参数**：
- `withCredentials: boolean`
- xhr 自动配：浏览器
- http adapter：自动带 cookie jar
- CORS 头：服务端配
- 简单请求 vs preflight

**最佳实践**：跨域 cookie 走 `withCredentials: true`；CORS 头服务端配——不能漏 `Allow-Credentials: true`；预检请求浏览器自动发——配好后无感；用 `credentials: 'include'` 风格——更标准。

---

### 模式 18：formDataToJSON prototype pollution 修复

**问题场景**：FormData 转 JSON 时 `__proto__` 字段会污染原型——CVE 漏洞。

**解决方案**：`formDataToJSON` 显式排除 `__proto__`：
```js
function formDataToJSON(form) {
  const obj = Object.create(null);
  for (const [key, value] of form.entries()) {
    if (key === '__proto__') continue;
    obj[key] = value;
  }
  return obj;
}
```

**关键参数**：
- v1.16.1 修复：CVE-2020-28168
- `Object.create(null)`：无 prototype
- 跳过 `__proto__` 字段
- 测试覆盖：恶意 form data
- sanitization 必做

**最佳实践**：所有用户输入转对象——必 sanitization；`__proto__` 必过滤；用 `Object.create(null)` 创建 result；CVE 修复后写 release notes——明确告知用户。

---

### 模式 19：throttle 节流工具 + 自适应阈值

**问题场景**：xhr progress 事件频率高——回调频繁触发 UI 卡顿。

**解决方案**：`throttle(fn, threshold)` 用 leading + trailing 节流：
```js
function throttle(fn, threshold) {
  let last = 0; let deferTimer;
  return function (...args) {
    const now = Date.now();
    if (now - last >= threshold) { last = now; fn.apply(this, args); }
  };
}
```

**关键参数**：
- 时间窗口：100ms 默认
- leading 触发
- trailing 可选
- 自适应阈值：基于事件频率
- 进度回调：UI 流畅

**最佳实践**：进度事件必节流——100ms 阈值；用 leading trigger——立即响应；trailing 可选——避免最后一次丢失；自定义 callback 仍可传——escape hatch。

---

### 模式 20：错误分类 + isCancel 识别用户取消

**问题场景**：用户主动 cancel 的请求，错误处理要区分——不能算"真错误"触发监控告警。

**解决方案**：`isCancel(value)` 工具函数 + `axios.isCancel(err)`：
```js
axios.get(url, { cancelToken: source.token }).catch(err => {
  if (axios.isCancel(err)) return;  // 用户取消，吞掉
  throw err;
});
```

**关键参数**：
- `isCancel(value)`：检查是否取消
- `axios.isCancel`：静态方法
- `CancelToken.source().cancel('reason')`：触发取消
- 取消原因：传给 source.cancel
- 监控脱敏：取消不报警

**最佳实践**：cancel 错误用 `isCancel` 识别——不报警；cancel 必传 reason——日志可追溯；`source.token` 与 request 关联；`source.cancel('reason')` 显式触发。
