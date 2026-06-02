# seajs - 玉伯 2012 写给中文前端的 CMD 规范模块加载器

**GitHub**: seajs/seajs
**Star**: 8.5k
**语言**: JavaScript
**主题**: 前端模块加载器 / CMD 规范 / 浏览器端 require
**适用场景**: 学习"如何用 400 行代码写一个模块加载器"、CMD vs AMD 差异、循环依赖处理、IE 兼容

---

## 第一段：核心机制 - 状态机与 CMD 规范

### 模式 1：状态机驱动的模块加载

**问题场景**：浏览器没有原生 `require`，JS 按 `<script>` 顺序执行——无法异步按需加载、无法声明依赖、循环依赖死锁。

**解决方案**：seajs 用 400 行状态机解决——模块生命周期 = `FETCHING → SAVED → LOADING → EXECUTING → EXECUTED` 5 状态，状态转换 = 事件驱动，每个状态都有对应钩子。

```js
// src/module.js 状态机核心
var FETCHING = 1, SAVED = 2, LOADING = 3, EXECUTING = 4, EXECUTED = 5
function Module(uri, deps) {
    this.uri = uri
    this.dependencies = deps || []
    this.exports = null
    this.status = 0
    this._waitings = {}
    this._remain = 0
}
Module.prototype._load = function() {
    var mod = this
    mod.status = FETCHING
    var uri = mod.uri
    if (Module.cache[uri]) {
        mod._loadFromCache()
    } else {
        mod._fetch(function() { mod._loadFromResolved() })
    }
}
Module.prototype._exec = function() {
    var mod = this
    if (mod.status >= EXECUTING) return
    mod.status = EXECUTING
    // 递归执行依赖
    var deps = mod.dependencies
    var args = deps.map(function(dep) { return _loadAsync(dep)._exec() })
    // factory 第一个 require 参数是 seajs.require 包装
    var factory = mod.factory
    var require = function(id) { return _loadAsync(id, mod.uri)._exec() }
    mod.exports = factory.apply(null, [require, mod.exports, mod])
    mod.status = EXECUTED
    mod.emit('exec')
}
```

**关键参数**：
- 5 状态 = FETCHING（下载）/ SAVED（已保存源码）/ LOADING（注入 DOM）/ EXECUTING（执行）/ EXECUTED（完成）
- 状态机 = `Module.prototype._state` 字段
- 转换 = `_fetch` / `_save` / `_load` / `_exec` 4 步
- 回调 = `on('exec', callback)` 订阅
- 幂等 = 同 ID 模块只加载一次

**最佳实践**：异步加载用状态机（vs. 回调嵌套）——状态显式 + 可观察 + 易调试；新增状态只需加数字常量和处理函数；状态转移日志 = 调试黄金入口。

### 模式 2：CMD 规范"先 define 后 use"

**问题场景**：AMD（RequireJS）推崇"前置声明所有依赖"——`define(['./a', './b'], factory)`，但日常写代码时 deps 不直观，且依赖声明位置远离使用位置。

**解决方案**：CMD 推崇"就近声明"——`define(function(require, exports, module) { var a = require('./a'); ... })`，用 `require` 同步调用代替 deps 数组，依赖声明 = 用到再写。

```js
// CMD 风格 define
define(function(require, exports, module) {
    // 就近声明：用谁 require 谁
    var a = require('./a')
    var b = require('./b')
    // 同步写法，心智贴近 CommonJS
    var data = a.get() + b.fetch()
    // 导出方式 1：exports 加属性
    exports.foo = function() { return data }
    // 导出方式 2：覆盖整个 exports
    module.exports = { foo: function() { return data } }
})
// 启动入口
seajs.use(['./app', './router'], function(app, router) {
    app.start(router)
})
```

**关键参数**：
- define = `define(factory)` 或 `define(id?, deps?, factory)`
- factory 签名 = `function(require, exports, module)`
- require = 同步 `var a = require('./a')`
- exports = `exports.foo = ...`
- module = `module.exports = ...`

**最佳实践**：内部框架用 CMD 风格（就近声明）——比 AMD 直观，比 CommonJS 兼容浏览器；require 同步 vs. 异步只是书写形式，加载器实现都是异步预加载；export 方式选 `module.exports`（更明确）少用 `exports`（避免覆盖坑）。

### 模式 3：事件总线解耦

**问题场景**：模块加载是异步链式（a 依赖 b 依赖 c），纯回调嵌套深；想统一通知"模块 X 加载完成"给所有关心的人；也想给框架加全局 hook。

**解决方案**：`src/util-events.js` 事件总线——`module.on('exec', cb)` / `module.emit('exec')`，模块间解耦；seajs 全局事件透传每个 module 状态。

```js
// src/util-events.js
var events = {}
var ap = Array.prototype
function Event_Emitter() { this._events = {} }
Event_Emitter.prototype.on = function(name, cb) {
    var cbs = this._events[name] || (this._events[name] = [])
    cbs.push(cb)
}
Event_Emitter.prototype.emit = function(name) {
    var cbs = this._events[name]
    if (!cbs) return
    var args = ap.slice.call(arguments, 1)
    cbs.forEach(function(cb) { cb.apply(null, args) })
}
// Module 继承 EventEmitter
Module.prototype._emit = Event_Emitter.prototype.emit
// 使用
mod.on('exec', function() { console.log('mod loaded:', mod.uri) })
mod.on('error', function(err) { console.error('mod failed:', err) })
// 全局监听所有 module
seajs.on('load', function(mod) { /* 全局埋点 */ })
```

**关键参数**：
- API = `on` / `off` / `emit`
- 事件类型 = `fetch` / `save` / `load` / `exec` / `error`
- 监听者 = 当前 module + parent module + seajs 全局
- 一次性 = `once`（用完即焚）
- 调试 = `seajs.emit('all', event)` 透传

**最佳实践**：异步框架用事件总线（vs. 回调嵌套）——关注点解耦 + 调试可观察；事件粒度按生命周期（fetch/save/load/exec）切分，不要按业务语义切分；全局钩子暴露给框架埋点用（性能监控、错误上报）。

### 模式 4：工厂函数正则解析依赖

**问题场景**：CMD `define(function(require, exports, module) {...})` 怎么静态分析出"这个模块依赖了哪些文件"？要做 preload 就要在不执行代码的情况下知道依赖图。

**解决方案**：`src/util-deps.js` 正则解析——`/require\(\s*['"]([^'"]+)['"]\s*\)/g` 匹配所有 `require('xxx')` 调用，提取依赖 ID；在 factory 真正执行前静态扫描。

```js
// src/util-deps.js
var REQUIRE_RE = /"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'\s*|[)[:.,;?\s]|\b(?:require|seajs\.use)\s*\(\s*(["'])([^"'\s\)]+)\1\s*\)/g
function parseDependencies(code) {
    var deps = []
    // 替换字符串字面量为占位符（避免字符串里的 require 被误判）
    code = code.replace(REQUIRE_RE, function(m, _, dep) {
        if (dep) deps.push(dep)
        return m
    })
    return deps
}
// 使用
var factorySrc = 'function(require, exports, module){ var a = require("./a"); var b = require("./b"); }'
var deps = parseDependencies(factorySrc)  // ["./a", "./b"]
```

**关键参数**：
- 正则 = `/require\(\s*['"]([^'"]+)['"]\s*\)/g`
- 提取 = 依赖 ID 数组
- 静态分析 = 不执行代码，纯文本扫描
- 局限 = 动态 `require(varName)` 抓不到
- 优势 = 0 性能开销，preload 友好

**最佳实践**：AMD/CMD 加载器用正则静态分析依赖——preload + tree-shake 的基础；正则要处理字符串字面量（避免 "abc require('xxx')" 误判）；动态 require 只能 fallback 到懒加载（无解）。

### 模式 5：路径解析 id↔uri

**问题场景**：用户在 `define` 内部写 `require('./b')` 相对路径——seajs 怎么知道 './b' 是哪个文件？写死路径不灵活，需要 base/alias 机制。

**解决方案**：`src/util-path.js` 路径解析——id 是相对当前模块 URI 的相对路径，URI 是浏览器能加载的完整 URL；alias/base/vars/map 4 类配置逐层解析。

```js
// src/util-path.js
var ALIAS_RE = /^[a-z0-9_-]+$/i
function id2Uri(id, refUri) {
    // 1. alias 替换
    if (id in alias) return resolveAlias(id)
    // 2. vars 变量替换
    id = id.replace(VARS_RE, function(m, key) { return vars[key] || m })
    // 3. map 文件映射
    if (id in map) id = map[id]
    // 4. 相对路径基于 refUri 解析
    if (id.charAt(0) === '.') return realpath(refUri, id)
    // 5. 绝对路径基于 base 解析
    if (!ABS_RE.test(id)) return realpath(base, id)
    return id
}
// alias 配置
seajs.config({
    base: './js',
    alias: { 'jquery': 'jquery/1.11.1/jquery' },
    paths: { 'gallery': 'https://a.alipayobjects.com/gallery' },
    vars: { 'locale': 'zh-cn' },
    map: [['.css', '.css?v=1.0.0']]
})
```

**关键参数**：
- id = 模块标识（相对路径 / 绝对路径 / alias）
- uri = 实际 URL（http://example.com/js/b.js）
- 规则 = id 相对于当前 module uri 解析
- alias = `seajs.config({alias: {'jquery': '...'}})` 别名映射
- base = `seajs.config({base: './js'})` 基础路径

**最佳实践**：模块加载器必带路径解析——id 是人类友好的相对引用，uri 是机器能加载的 URL；alias 用于"长路径简化"和"版本切换"；map 用于"生产环境换 CDN 路径"（同 URL 不同部署）。

---

## 第二段：加载引擎 - 浏览器注入与 IE 兼容

### 模式 6：循环依赖处理

**问题场景**：模块 a 依赖 b，模块 b 依赖 a——同步 require 死锁（a 还没导出，b 要 a）。Node CommonJS 用"部分求值"破解，浏览器端怎么破？

**解决方案**：seajs 用"提前暴露"策略——a 加载时立即把空 exports 给 b，b 用到 a 的方法时 `require.async` 延迟；或用 factory 内引用解耦（b 不在 top-level 调 a）。

```js
// a.js
define(function(require, exports, module) {
    // 提前暴露：b 会拿到空 exports
    exports.say = function() { return 'a' }
    var b = require('./b')   // 同步
    module.exports = { name: 'a', b: b }
})
// b.js
define(function(require, exports, module) {
    var a = require('./a')   // 拿到 a 的空 exports（a 还没执行完）
    // 解决：用 require.async 延迟
    require.async('./a', function(realA) {
        console.log(realA.say())  // 拿到完整 a
    })
    // 或：b 不在 top-level 用 a 的方法
    exports.callA = function() {
        return require('./a').say()  // 调用时才同步加载
    }
})
```

**关键参数**：
- 检测 = 模块状态 = FETCHING（加载中）
- 行为 = 提前返回空 exports
- 调用 = 用户在 b 内 `var a = require('./a')` 拿到空对象
- 风险 = 调 a 的方法报错（a 还没执行完）
- 解法 = 改成 `require.async('./a', cb)` 异步

**最佳实践**：循环依赖用 require.async 延迟加载——避免空对象陷阱；模块设计原则：尽量单向依赖，A→B→C 而不是 A↔B；非要双向，解耦为"事件触发"或"延迟调用"。

### 模式 7：浏览器原生 script 注入

**问题场景**：seajs 怎么在浏览器里加载 JS？AJAX 拿源码 + eval 太慢，document.write 破坏 DOM；想要浏览器自动 fetch + exec + 缓存。

**解决方案**：`src/util-request.js` 动态 `<script>` 注入——`appendChild(script)` 浏览器自动 fetch + exec，依赖浏览器缓存；用 onload/onerror 事件通知加载完成。

```js
// src/util-request.js
var head = document.head || document.getElementsByTagName('head')[0]
var baseElement = head.getElementsByTagName('base')[0]
function request(url, callback, onerror) {
    var node = document.createElement('script')
    node.src = url
    node.async = true   // 异步加载关键
    node.onload = function() {
        node.onload = node.onerror = null
        head.removeChild(node)   // 清理 DOM
        callback()
    }
    node.onerror = function() {
        node.onload = node.onerror = null
        head.removeChild(node)
        onerror()
    }
    // base 元素之前插入（base 影响相对路径）
    baseElement ? head.insertBefore(node, baseElement) : head.appendChild(node)
}
// IE 兼容：onload 不可靠，回退 readyState
node.onreadystatechange = function() {
    if (/loaded|complete/.test(node.readyState)) {
        node.onreadystatechange = null
        callback()
    }
}
```

**关键参数**：
- `<script src=uri onload=onload onerror=onerror>` 注入
- 回调 = `onload` 触发 EXECUTING
- 失败 = `onerror` 触发 ERROR
- 缓存 = 浏览器 HTTP 缓存（带 hash 强缓存）
- 缺陷 = IE 6-9 的 onload bug（用 `script.readyState` 兜底）

**最佳实践**：浏览器端异步加载用动态 script 注入（vs. AJAX + eval）——浏览器自动缓存 + DOM 不破坏；插入到 base 元素前（base 影响相对路径解析）；加载完清理 DOM（避免内存泄漏）。

### 模式 8：IE 6-9 兼容策略

**问题场景**：IE 6-9 的 onload 不标准（无 onerror）、并发脚本加载 bug、CORS 限制——seajs 怎么兜底？放弃 IE 损失 5x 用户群。

**解决方案**：3 层兜底——1) `script.readyState === 'loaded'` 检测 onload 替代；2) `attachEvent('onreadystatechange')` 监听；3) 错误 `onerror = function() { throw }` 主动抛；并发限 6 个（IE 上限）。

```js
// IE 兼容：readyState 替代 onload
function ieOnLoad(node, callback) {
    node.attachEvent('onreadystatechange', function() {
        var rs = node.readyState
        if (rs === 'loaded' || rs === 'complete') {
            node.detachEvent('onreadystatechange', arguments.callee)
            callback()
        }
    })
}
// 并发限制（IE 最多 6 个并发 script）
var MAX_CONCURRENT = isIE ? 6 : 100
var queue = [], running = 0
function loadNext() {
    if (running >= MAX_CONCURRENT) return
    var next = queue.shift()
    if (!next) return
    running++
    request(next.uri, function() {
        running--
        next.callback()
        loadNext()
    })
}
// 错误处理（IE 8- 无 onerror）
node.onerror = function() {
    node.onerror = null
    throw new Error('Failed to load: ' + node.src)
}
```

**关键参数**：
- readyState = IE 特有属性（`loading` → `loaded` → `interactive` → `complete`）
- attachEvent = 老 IE 事件 API
- 缓存 = 304 协商缓存（IE 缓存重请求 bug）
- 并发 = 6 个并发上限（IE 不支持更多）
- 总成本 = 20% 代码量兜底 IE 兼容

**最佳实践**：库要支持老浏览器必带 readyState / attachEvent 兜底——20% 代码换 5x 用户群；并发限制 IE = 6，其他现代浏览器 = 无限制；2017+ 可放弃 IE（市场份额 < 1%），省 20% 维护成本。

### 模式 9：动态 script vs AJAX 优劣

**问题场景**：浏览器加载 JS 有两种主流方式——动态 script 注入（seajs 选用）和 AJAX + eval（webpack-dev-server 早期用）——选哪个？

**解决方案**：seajs 选动态 script 注入——理由：1) 浏览器自动缓存（同 URL 二次加载走 HTTP 缓存）；2) 浏览器并行 fetch（无浏览器 HTTP/1.1 6 限制）；3) 跨域支持（CDN 友好）；4) 不污染全局。

```js
// 方案 1：动态 script 注入（seajs 选用）
var s = document.createElement('script')
s.src = 'http://cdn.example.com/a.js'
s.onload = function() { /* 加载完成 */ }
document.head.appendChild(s)
// 优点：浏览器缓存 + 跨域 + 不污染全局
// 缺点：注入 DOM（要清理）
// 方案 2：AJAX + eval（早期 dev-server 思路）
var xhr = new XMLHttpRequest()
xhr.open('GET', 'a.js', true)
xhr.onload = function() {
    eval(xhr.responseText)  // 执行源码
    /* 加载完成 */
}
xhr.send()
// 优点：不污染 DOM
// 缺点：跨域受限 + 不走浏览器缓存 + eval 安全风险
```

**关键参数**：
- 缓存策略：script 注入走浏览器 HTTP 缓存，AJAX 走 XHR 缓存
- 跨域：script 天然支持（CDN 友好），AJAX 需 CORS
- 性能：script 注入并行受 6 并发限，AJAX 也受 6 限
- 安全：script 注入注入 DOM 要清理，AJAX eval 有 XSS 风险
- 调试：script 注入可在 Network 面板看，AJAX 在 XHR 面板

**最佳实践**：生产环境加载 JS 用 script 注入（缓存 + 跨域 + 调试友好）；动态拼接代码用 AJAX + eval（要 escape 内容）；微前端 qiankun 用 script 注入，webpack5 module federation 用 script 注入。

### 模式 10：requestIdleCallback 调度优化

**问题场景**：seajs 默认加载就立即发请求——首屏 a 链 a→b→c→d 一口气发 4 个 HTTP，首屏页面渲染慢；理想是"主线程空闲时才发非关键模块请求"。

**解决方案**：利用浏览器 `requestIdleCallback` API——浏览器空闲时（主线程没事干）才发非关键模块请求，关键模块（首屏用）立即发。

```js
// 空闲调度
var ric = window.requestIdleCallback || function(cb) { setTimeout(cb, 0) }
function loadIdle(uri, callback) {
    ric(function() {
        request(uri, callback)
    })
}
// seajs.use 标记优先级
seajs.use(['./app'], function(app) {
    // 关键：立即
    app.start()
    // 非关键：空闲时
    seajs.use(['./analytics', './monitor'], function(analytics, monitor) {
        analytics.init()
        monitor.init()
    })
})
// 配置：非关键模块延后
seajs.config({
    idle: true,  // 全局开启空闲加载
})
```

**关键参数**：
- API = `requestIdleCallback(cb, {timeout: 1000})`
- 浏览器支持 = Chrome 47+，其他 fallback 到 `setTimeout(cb, 0)`
- 适用 = 非首屏模块（analytics / monitor / 帮助中心）
- 收益 = 首屏 FCP/TTI 减少 200-500ms
- 限制 = 单帧预算 50ms，超时强制执行

**最佳实践**：非首屏 JS 用 requestIdleCallback 加载——首屏指标优化的银弹；超时必须设（防无限等待）；fallback 到 setTimeout 兼容 Safari/Firefox 老版本；不要用 requestAnimationFrame（每帧必跑，不算"空闲"）。

---

## 第三段：扩展体系 - 配置、缓存与 Plugin

### 模式 11：模块缓存机制

**问题场景**：同一模块被多个父模块 require——是每次重新 fetch，还是缓存？长生命周期 Web App 怎么避免内存增长？

**解决方案**：seajs 强缓存——模块 EXECUTED 后，引用 = `Module.cache[uri] = exports`，后续 require 直接返回；cache 是全局单例。

```js
// Module.cache 全局缓存
var cache = Module.cache = {}
function _loadAsync(id, refUri) {
    var uri = id2Uri(id, refUri)
    if (cache[uri]) return cache[uri]   // 命中直接返回
    var mod = new Module(uri, parseDependencies(id))
    cache[uri] = mod   // 先占位（处理循环依赖）
    mod._load()
    return mod
}
// 手动清理（特殊场景：HMR / 测试）
function clearCache(uri) {
    delete Module.cache[uri]
    // 清理子依赖
    var mod = Module.cache[uri]
    if (mod) mod.dependencies.forEach(function(dep) { clearCache(dep) })
}
// 内存监控
function cacheSize() {
    return Object.keys(Module.cache).length
}
```

**关键参数**：
- 缓存 = `Module.cache` 对象（uri → module）
- 命中 = 同 URI 第二次 require 直接返回 exports
- 失效 = 无（seajs 3.0 不支持 HMR）
- 内存 = 单页面 N 个模块，内存可控
- 风险 = 长生命周期页面（Web App）内存增长

**最佳实践**：模块加载必带强缓存——避免重复 fetch + 重复执行的开销；缓存键 = uri（含 query）确保版本切换；长生命周期页面用 route-based cache（路由切换时清理）；HMR 场景提供 `clearCache(uri)` API。

### 模式 12：SEA_DEBUG 调试模式

**问题场景**：模块加载链深（a → b → c → d），出错时怎么定位？哪个环节慢？哪里内存泄漏？

**解决方案**：`seajs.config({debug: true})` 开启调试——日志输出每个模块的状态转换 + 耗时 + 错误栈；用 console 颜色 + 分组。

```js
// src/util-log.js
var debug = false
function log() {
    if (!debug) return
    var args = [].slice.call(arguments)
    args.unshift('[seajs]')
    console.log.apply(console, args)
}
// 状态转换日志
Module.prototype._load = function() {
    log('loading:', this.uri)
    this.status = FETCHING
    // ...
    var start = Date.now()
    this._fetch(function() {
        log('loaded:', this.uri, Date.now() - start, 'ms')
        this.status = SAVED
    }.bind(this))
}
// 错误栈
mod.on('error', function(err) {
    log('error:', err.message, '\n', err.stack)
})
// 性能汇总
seajs.on('all', function(event) {
    log('[event]', event.type, event.uri)
})
```

**关键参数**：
- 日志级别 = `info` / `warn` / `error`
- 输出 = `console.log` 状态转换
- 耗时 = 每个模块 fetch + exec 时间
- 错误栈 = 链式加载错误栈
- 生产 = 关闭（避免性能开销）

**最佳实践**：库必带调试模式开关——开发环境用 verbose 日志，生产环境关闭；日志格式统一加前缀（`[seajs]`）便于过滤；耗时统计按模块输出（`Date.now() - start`）便于找慢模块；生产环境用 `console.log` wrapper 避免留痕。

### 模式 13：require.async 异步加载

**问题场景**：首屏只要 a 核心模块，b 推迟——同步 require 强制全加载；想按路由 / 按用户行为按需加载。

**解决方案**：`require.async('./b', function(b) {...})` 异步——不阻塞当前模块执行，回调内用 b；与同步 require 共存。

```js
// 同步 require：阻塞（用于核心依赖）
define(function(require, exports) {
    var $ = require('jquery')   // 必须
    exports.init = function() { $(...) }
})
// 异步 require.async：不阻塞（用于非核心）
define(function(require, exports) {
    exports.init = function() {
        require.async('./chart', function(Chart) {  // 推迟到调用时
            new Chart().render()
        })
    }
    exports.report = function() {
        require.async('./analytics', function(a) {  // 用户操作时才加载
            a.track('click')
        })
    }
})
// 多模块并行
require.async(['./a', './b', './c'], function(a, b, c) {
    // a, b, c 全部就绪
})
// 动态路径
require.async(template, function(tpl) {  // template = 字符串
    // 动态路径只能异步（静态分析抓不到）
})
```

**关键参数**：
- 同步 = `var b = require('./b')`（阻塞）
- 异步 = `require.async('./b', cb)`（不阻塞）
- 适用 = 路由组件 / 大库按需加载 / 非首屏
- 性能 = 减少首屏时间
- 陷阱 = 回调嵌套（vs. ES6 import()）

**最佳实践**：非首屏模块用 require.async——首屏优化 + 按需加载的标准做法；用户行为触发的模块用 `require.async`（点击后才加载）；预加载用 `<link rel="prefetch">` + `require.async` 组合（提前下载 + 延后执行）。

### 模式 14：Plugin 机制

**问题场景**：seajs 核心是 JS 加载，但用户要 CSS / JSON / 模板（tpl）——怎么扩展？让用户不 fork 也能加新文件类型支持。

**解决方案**：`seajs.plugin` 机制——`seajs.plugin('./plugin-css')` 注册解析器，把 `require('./style.css')` 转为 `<link>` 注入；钩子 = `_resolve` / `_fetch` / `_load`。

```js
// seajs-css 插件（简化）
seajs.plugin(function() {
    var _resolve = Module._resolve
    Module._resolve = function(id, refUri) {
        if (/\.css$/.test(id)) {
            return _resolve(id, refUri).replace(/\.js$/, '.css')
        }
        return _resolve(id, refUri)
    }
    var _load = Module.prototype._load
    Module.prototype._load = function() {
        if (/\.css$/.test(this.uri)) {
            // 注入 <link>
            var link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = this.uri
            document.head.appendChild(link)
            this.status = EXECUTED
            this.emit('exec')
            return
        }
        return _load.call(this)
    }
})
// 使用
seajs.use('./plugin-css')   // 启用 CSS 支持
// 业务代码
var style = require('./style.css')   // 自动转为 <link> 注入
```

**关键参数**：
- 注册 = `seajs.plugin(plugin, fn)` 或 `seajs.use(plugin)`
- 解析器 = `Module._resolve` 钩子改写 uri
- 类型 = css / json / tpl / 自定义
- 加载器 = `seajs.importStyle(uri)` 注入
- 案例 = seajs-css / seajs-json / seajs-text

**最佳实践**：库设计必带 plugin 机制——核心只做"必要的事"，扩展交给社区；插件钩子粒度细到"resolve / fetch / load / exec"4 阶段；插件命名规范 `seajs-<type>`（seajs-css / seajs-text）。

### 模式 15：seajs.use 入口 API

**问题场景**：用户用 seajs 时，怎么启动整个应用？多入口（app / router）怎么串起来？

**解决方案**：`seajs.use(['./app', './router'], function(app, router) { app.start() })`——入口 + 多个模块 + 启动回调；callback 在所有模块加载完成后才调用。

```js
// 1. 单模块入口
seajs.use('./app', function(app) { app.start() })
// 2. 多模块入口
seajs.use(['./app', './router', './config'], function(app, router, config) {
    config.init()
    app.start(router)
})
// 3. 嵌套入口
seajs.use('./shell', function(shell) {
    shell.mount()
    // shell 加载完后才挂子应用
    seajs.use('./sub-app', function(subApp) { subApp.start() })
})
// 4. 错误处理
seajs.use('./app', function(app) {
    app.start()
}).use('./app', function(app) {
    // 重复 use 不重复加载
    console.log('already loaded')
})
```

**关键参数**：
- use = `seajs.use(ids, callback)`
- ids = 数组 / 单个 id
- callback = 全部加载完成
- 嵌套 = `seajs.use('./a', function(a) { seajs.use('./b', function(b) { ... }) })`
- 全局 = 暴露 `window.seajs`

**最佳实践**：库的"启动入口"用 use + 回调——保证依赖就绪后才执行业务代码；use 第一个参数支持字符串和数组（保持 API 一致）；重复 use 走缓存不重新加载（幂等性）；SPA 路由切换不要用 seajs.use（用 require.async）。

---

## 第四段：规范演进 - 从 CMD 到 ESM 的历史与迁移

### 模式 16：CMD vs AMD vs CommonJS

**问题场景**：模块规范 CMD / AMD / CommonJS 哪个好？2012-2015 年前端社区激辩；2015+ ES Module 出现后局势明朗。

**解决方案**：决策树——服务端用 CommonJS（Node 同步加载快）；浏览器 AMD（RequireJS 异步兼容 IE8+）；国内多用 CMD（更接近 CommonJS 心智）；2015+ 一律 ES Module。

```js
// CommonJS（Node，同步）
const fs = require('fs')
module.exports = { read: fs.readFile }
// AMD（RequireJS，异步 + IE 兼容）
define(['./a', './b'], function(a, b) {
    return { foo: function() { return a.x + b.y } }
})
// CMD（SeaJS，异步 + 懒声明）
define(function(require, exports) {
    var a = require('./a')
    var b = require('./b')
    exports.foo = function() { return a.x + b.y }
})
// ES Module（标准）
import a from './a'
import { y } from './b'
export const foo = () => a.x + y
// 2020+ 选 ES Module——官方标准 + 工具链最完善 + tree-shake 友好
```

**关键参数**：
- CommonJS = 同步、`require` / `module.exports`、Node
- AMD = 异步、`define([deps], factory)`、RequireJS
- CMD = 异步 + 懒声明、`define(factory)`、SeaJS
- ES Module = 官方标准、`import` / `export`、2015+
- 现状 = ES Module 一统江湖

**最佳实践**：新项目用 ES Module（`import` / `export`）——官方标准，工具链最完善；服务端用 CommonJS（Node 原生支持）；老 AMD/CMD 项目渐进迁移到 ESM（webpack / rollup 都支持）；学习路径 = CommonJS → AMD/CMD → ESM（理解历史演进）。

### 模式 17：seajs 性能优化

**问题场景**：页面加载 20 个模块，HTTP 请求多、首屏慢；想合并模块 + CDN 强缓存 + 关键模块 inline。

**解决方案**：3 步优化——1) `spm build` 合并模块；2) 静态资源 CDN + hash 强缓存；3) 关键模块 inline；和现代打包工具思路一致。

```js
// 1. spm build 合并
// spm-build.json
{
    "family": "app",
    "main": "app.js",
    "output": {
        "compress": true,
        "combo": true   // 合并所有依赖到单文件
    }
}
// spm build  → dist/app.combo.js (1 个文件包含 20 个模块)
// 2. CDN + hash 强缓存
seajs.config({
    base: 'https://cdn.example.com/static/v1.0.0/',
    map: [['.js', '.js?v=1.0.0']]   // 强制带 hash
})
// 3. 关键模块 inline（首屏用）
// HTML
<script src="//cdn.example.com/seajs/3.0.0/sea.js"></script>
<script>
// 关键模块源码直接内联
seajs.use('./app')
</script>
```

**关键参数**：
- 合并 = `spm concat` 多个 module → 1 个文件
- 压缩 = `spm build --compress` uglify
- CDN = `seajs.config({base: 'https://cdn.example.com/js/'})`
- hash = 文件名带 hash 强缓存
- inline = 关键模块 `<script>` 直接嵌入 HTML

**最佳实践**：seajs 性能优化走"合并 + CDN + 缓存"三件套——和现代打包工具同思路；CDN 选 Cloudflare/阿里云/腾讯云（HTTP/2 多路复用）；强缓存 hash 用内容 hash（非时间戳）确保真更新；关键模块 < 14KB（gzip 后）可考虑 inline。

### 模式 18：从 seajs 迁移到 Webpack

**问题场景**：2016 后团队想从 seajs 迁到 Webpack/Rollup——怎么低成本迁移？历史代码 100+ 模块，重写代价大。

**解决方案**：渐进迁移——1) `seajs.use` 替换为 `import`；2) `define` 替换为 `export default`；3) 配置 Webpack `resolve.alias` 兼容路径；4) 工具 `seajs-to-webpack` 自动转换。

```js
// 老代码（seajs）
define(function(require, exports) {
    var $ = require('jquery')
    var util = require('./util')
    exports.init = function() { $(util.format(...)) }
})
seajs.use(['./app'], function(app) { app.init() })
// 新代码（Webpack + ESM）
import $ from 'jquery'
import { format } from './util'
export const init = () => $(format(...))
import('./app').then(({ init }) => init())
// Webpack 配置（兼容老路径）
module.exports = {
    resolve: {
        alias: {
            '@': path.resolve('src'),
            'jquery': 'jquery/dist/jquery.min.js'
        }
    }
}
// 工具：seajs-to-webpack 自动转换（jQuery / lodash 改名即可）
```

**关键参数**：
- define → export default
- require → import
- require.async → import()
- seajs.config → Webpack resolve.alias
- spm → npm
- 工具 = `seajs-to-webpack` 转换器

**最佳实践**：迁移到老框架走"渐进替换"——按模块拆分，新代码 Webpack，老代码维持；先迁移"叶子模块"（无依赖），再迁"核心模块"；配置 jQuery/lodash 等老库走 alias 兼容；测试用 jest+@vue/test-utils 等现代框架。

### 模式 19：历史意义与现代启示

**问题场景**：seajs 已被 Webpack 取代，还值得学吗？400 行代码在新框架动辄 10w+ 行的时代还有什么意义？

**解决方案**：值得——seajs 400 行代码讲清"模块加载器本质"（状态机 + 事件总线 + 路径解析 + 静态分析），这些思想在 Webpack/Vite/esbuild 仍在用；学小框架学思想。

```js
// seajs 思想在现代框架的体现
// 1. 状态机 → Webpack module resolution 状态推进
// seajs: FETCHING → SAVED → LOADING → EXECUTING → EXECUTED
// Webpack: 解析 → 加载 → 解析依赖 → 转换 → 生成
// 2. 事件总线 → Webpack Tapable hooks
// seajs: module.on('exec', cb)
// Webpack: compiler.hooks.afterCompile.tapAsync(...)
// 3. 静态分析 → esbuild import 扫描
// seajs: /require\(['"]([^'"]+)['"]\)/g 正则
// esbuild: AST 扫描 import / export（更准确）
// 4. 路径解析 → Webpack resolve / Vite resolve
// seajs: id2Uri(id, refUri)
// Webpack: resolve.alias + resolve.modules
// 5. 动态 script 注入 → Vite / qiankun 微前端
// seajs: appendChild(script)
// Vite: import() 动态 import（浏览器原生）
```

**关键参数**：
- 状态机 = 现代 loader 仍按"load → parse → transform → generate"状态推进
- 事件总线 = Webpack 的 Tapable hooks 同思路
- 静态分析 = esbuild 的 import 扫描同思路
- 路径解析 = Webpack 的 resolve 同思路
- 教学价值 = 400 行讲清"加载器"本质

**最佳实践**：读老框架源码学"思想"——比读新框架 100x 代码容易，核心思想万变不离其宗；新框架源码动辄 10w+ 行，老框架 400 行 1 小时读完；学习路径 = seajs/require.js → webpack → esbuild → vite；写技术文章讲"seajs 思想在 Vite 怎么体现"是好的二次创作。

### 模式 20：7 天复刻 mini-seajs 路线

**问题场景**：想做模块加载器练手但 400 行太多；想从零写一个 mini 版；想要 teach-by-doing 的练手项目。

**解决方案**：7 天 MVP——Day 1-2 状态机核心（FETCHING→SAVED→LOADING→EXECUTING→EXECUTED），Day 3 事件总线，Day 4 路径解析，Day 5 正则依赖提取，Day 6 script 注入，Day 7 seajs.use 入口。

```bash
# Day 1-2 状态机核心
mkdir mini-seajs && cd mini-seajs
npm init -y
# 写 src/module.js
#   - 5 状态常量
#   - Module class
#   - _fetch / _save / _load / _exec 4 步
# 测试：单模块加载

# Day 3 事件总线
# 写 src/util-events.js
#   - on / off / emit / once
# Module 继承 EventEmitter

# Day 4 路径解析
# 写 src/util-path.js
#   - id2Uri 转换
#   - alias / base / vars / map 配置

# Day 5 正则依赖提取
# 写 src/util-deps.js
#   - parseDependencies(code)
#   - 字符串字面量处理

# Day 6 浏览器 script 注入
# 写 src/util-request.js
#   - document.createElement('script')
#   - onload / onerror / readyState 兼容

# Day 7 seajs.use 入口
# 写 src/sea.js
#   - use(ids, callback)
#   - require.async 异步
# 测试：多模块链式加载
```

**关键参数**：
- 核心 = 状态机 + 事件总线
- 协议 = CMD（define + require）
- 路径 = uri 解析
- 加载 = 动态 script 注入
- 复刻难度 = 核心 200 行，IE 兼容 1 周

**最佳实践**：复刻 mini-seajs 先做"状态机 + 事件总线"——核心思想 200 行能讲清楚，剩下都是细节；每个模块 < 100 行单测覆盖（jest + jsdom）；加 demo 页面（demo/index.html）跑 3-5 个模块串联；最后写一篇"500 行实现 seajs 核心"博客（教学闭环）。

---

## 附录：5 段必读代码

1. `src/module.js` — 429 行核心状态机（FETCHING→EXECUTED 5 状态）
2. `src/util-events.js` — 事件总线（on / off / emit / once）
3. `src/util-request.js` — 动态 script 注入 + IE 兼容
4. `src/util-path.js` — id↔uri 路径解析（alias / base / relative）
5. `src/util-deps.js` — 工厂函数正则依赖提取

## 一句话总结

seajs = 400 行状态机（FETCHING→EXECUTED 5 状态）+ CMD 规范就近声明 + 事件总线解耦 + 正则静态分析依赖 + 动态 script 注入 + IE 兼容兜底，把"浏览器端模块加载"做到 2012-2016 年中文前端的事实标准，Webpack/Rollup 仍继承其核心思想。
