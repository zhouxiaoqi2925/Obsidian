# jquery - 统治 Web 前端 15 年的"瑞士军刀"库

**GitHub**: jquery/jquery
**Star**: 59k+
**语言**: JavaScript（4.0 起 ESM）
**主题**: dom-manipulation / ajax / event / selector / promise
**适用场景**: DOM 操作 / AJAX 请求 / 动画 / 事件委托 / 老项目维护

---

## 第一段：基础范式

### 模式 1 - jQuery.fn.init 多态分派（7 种入参一个函数）

**问题场景**：`$()` 这个函数要同时承担"选择器 / DOM 节点包装 / HTML 字符串解析 / ready 回调"四重语义。工厂函数 vs new 类两难——工厂无 new 优雅但丢 instanceof，new 类需要用户写 `new $()`。jQuery 用 `jQuery.fn.init` 一个函数 7 种入形态，根据 `nodeType` / `typeof` / 正则匹配分流。

**解决方案**：`src/core/init.js:18-122` 的 `init = jQuery.fn.init = function(selector, context, root) { ... }`。7 种入参：`null/undefined/false/""` 立即返回空 jQuery；`string + HTML`（`<...>`）走 `parseHTML` + `merge`；`string + #id` 走 `getElementById`；`string + selector` 走 Sizzle / qSA 委托；`DOMElement` `this[0] = elem`；`function` ready 回调队列；`array-like` 走 `makeArray` 归一化。`rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/` 单一正则区分 HTML vs #id。

**关键参数**：
- `null/undefined/false/""` 立即返回空 jQuery
- `string + HTML` parseHTML + merge
- `string + #id` getElementById
- `string + selector` Sizzle / qSA
- `DOMElement` this[0] = elem
- `function` ready 回调队列
- `array-like` makeArray 归一化

**最佳实践**：多态集中在 init 切面好改但 cyclomatic complexity > 20；`rquickExpr` 单一正则区分 HTML vs #id；`this[match]( context[match] )` "先当方法、失败当属性"优雅降级；任何"工具函数 + 多入参形态"项目可借鉴；Trade-off：可维护性 vs 单一入口。

### 模式 2 - 构造函数 + new 双形态

**问题场景**：`$("div")` 既要像函数（无 new）又要像类（链式 API）。工厂函数丢 instanceof，new 类需用户写 `new $()`。jQuery 用 `new jQuery.fn.init()` + `init.prototype = jQuery.fn` 让两条路共用同一 prototype。

**解决方案**：`src/core.js` 的 `init = jQuery.fn.init = function(selector, context, root) { ... }` + `init.prototype = jQuery.fn`。等价于 `new jQuery.fn.init(selector) instanceof jQuery === true` + `jQuery.fn.init(selector) instanceof jQuery === true`。`$("div")` = `jQuery("div")` = `jQuery.fn.init("div")`。2007 年 jQuery 取代 Prototype.js 的关键设计。

**关键参数**：
- `$("div")` jQuery.fn.init("div")
- `new $.fn.init("div")` 与 `$("div")` 实例完全相同
- `instanceof jQuery` true 共享 prototype
- `instanceof jQuery.fn.init` true

**最佳实践**：构造函数 + 工厂双形态 = 用户友好；共享 prototype = 省去 `if (!(this instanceof jQuery))` 守卫；2007 年 jQuery 取代 Prototype.js 的关键设计；任何"工具库 + 链式 API"项目可借鉴；Trade-off：新人难理解"为什么没 new"。

### 模式 3 - $.extend 双语义（深浅拷贝 + 防 __proto__ 污染）

**问题场景**：插件生态的基石是 `$.extend` 把对象方法合并到 jQuery / jQuery.fn。深浅拷贝用同一函数实现，`this` 切换语义（`$.extend` 静态 / `$.fn.extend` 实例）。2018 年 prototype pollution CVE 证明必须显式过滤 `__proto__`。

**解决方案**：`src/core.js:115-185` 的 `jQuery.extend = jQuery.fn.extend = function() { var options, name, src, copy, copyIsArray, clone, target = arguments[0] || {}, i = 1, length = arguments.length, deep = false; if (typeof target === "boolean") { deep = target; target = arguments[i] || {}; i++ }` + `for (name in options) { if (name === "__proto__" || target === copy) continue }`。CVE-2019-11358 修复（3.4.0+）。

**关键参数**：
- `target = arguments[0]` 目标对象
- `deep = false` 是否深拷贝
- `this` 单参数时 jQuery 静态 / jQuery.fn 实例
- `__proto__` 守卫 CVE-2019-11358 修复
- `target === copy` 防自引用死循环

**最佳实践**：双语义（this 切换）是 jQuery 插件生态基石；必须防 `__proto__` 污染（3 行代码）；任何"对象合并 / 插件 mixin"项目可借鉴；深浅拷贝用同一函数（参数重载）；`target === copy` 防自引用死循环。

### 模式 4 - Callbacks 状态机（6 变量 + 4 flag）

**问题场景**：2010 年前没有 EventEmitter，事件订阅 + 一次性 + memory（已 fire 后注册立即重放）各种 flag 组合。if/else 链 4 flag = 16 组合不可维护。jQuery 用 6 变量 + 4 boolean flag 笛卡尔积实现，支持"once memory unique stopOnFalse"任意组合。

**解决方案**：`src/callbacks.js:36-200` 的 `function Callbacks(options) { options = typeof options === "string" ? createOptions(options) : { ...options }; var firing = false, locked = false, list = [], queue = [], firingIndex = -1, memory = options.memory && !options.once ? new FiringState() : undefined }`。`fire(args)` 中 `if (list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false && options.stopOnFalse)` 中断传播。

**关键参数**：
- `once` fire 一次后清空 list
- `memory` fire 后注册立即用最新 args 重放
- `unique` 同 fn 多次 add 只保留一个
- `stopOnFalse` callback return false 中断 fire

**最佳实践**：6 变量 + 4 flag 自由组合 = 16 种行为；memory 模式是 Deferred `done().then()` 链式基础；任何"可订阅对象"（EventBus/PubSub/Observer）可借鉴；30 行实现工业级 PubSub；`=== false` 是有意的（`return 0` 不中断）。

### 模式 5 - Deferred + tuples 数组

**问题场景**：Deferred 三态（resolve/reject/notify）三 callbacks，9 个状态 if/else 链难维护。jQuery 用 `tuples` 数组配置：`[ "notify", "progress", callbacks("memory"), ... ]`，调用时只用 `tuple[4]` 通用调度。

**解决方案**：`src/deferred.js:43-56` 的 `tuples = [ ["resolve", "done", jQuery.Callbacks("once memory"), resolved = true, 0], ["reject", "fail", jQuery.Callbacks("once memory"), rejected = true, 1], ["notify", "progress", jQuery.Callbacks("memory")] ]`。`then: function(onFulfilled, onRejected, onProgress) { var maxDepth = -1; function deferredFunc() { var fn = onFulfilled; if (maxDepth === 1) fn = deferred.then = function() { return deferred }; if (fn) fn.apply(this, arguments) } for (var i = 0; i < tuples.length; i++) { tuples[i][2].add(deferredFunc) } return deferred.promise() }`。tuple 6 字段：`[action, addListener, callbacks, finalState, index, [state]]`。

**关键参数**：
- `tuple[4]` 状态索引 0=resolve / 1=reject / 2=notify
- `tuple[2]` callbacks 列表
- `maxDepth` then 链最大深度
- 2.3.3.3.4.1 忽略 post-resolution 异常
- thenable 桥接 if (typeof then === "function")

**最佳实践**：以表驱动代替分支是 jQuery 内部核心范式；任何"多状态机 + 多回调"项目可借鉴；tuple 化让 `then()` 用同一函数调度；Deferred 完整 Promises/A+ 2.3.3；thenable 桥接（`if (typeof then === "function")`）。

---

## 第二段：扩展范式

### 模式 6 - Sizzle 选择器引擎（rquickExpr 快速路径 + 退化为 qSA）

**问题场景**：CSS 选择器在 2006 年 IE6/7 没有 `querySelectorAll`，Sizzle 引擎自实现选择器。4.0 当排除 selector 模块时，`selector-native.js` 仅用 `querySelectorAll` 加一层 wrapper。快速路径覆盖 80%+ 真实选择器调用。

**解决方案**：`src/selector.js:108-140` 的 `rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+)|\.([\w-]+))$/`。快速路径：`if ((match = rquickExpr.exec(selector))) { // 1) #id → getElementById（最快）// 2) HTML 字符串 → parseHTML }`。selector-native 模式仅 qSA wrapper（丢 jQuery 伪类）。Andrew Dupont 的 scope 限定术让 Sizzle 性能稳赢原生 qSA。

**关键参数**：
- `#id` document.getElementById
- `.class` / `tag` 原生 querySelectorAll
- 复杂选择器 Sizzle 编译路径
- jQuery 扩展伪类 :eq()/:has() Sizzle 自实现
- selector-native 模式仅 qSA wrapper

**最佳实践**：快速路径 + 慢速路径（80/20 法则）；selector-native 模式进一步缩小体积；任何"高频调用 + 多形态入参"项目可借鉴；Sizzle 引擎单独抽出（jQuery 之外的库也用）；Andrew Dupont 的 scope 限定术让 Sizzle 性能稳赢原生 qSA。

### 模式 7 - Data 内部总线（expando + camelCase + dual namespace）

**问题场景**：DOM 节点要挂私有数据，用 expando 命名空间防冲突。所有子系统（event / manipulation / effects / queue）通过 `dataPriv` / `dataUser` 读写，单一真相源 + 命名空间分离让模块解耦。

**解决方案**：`src/data/Data.js` 的 `function Data() { this.expando = jQuery.expando + Data.uid++ }` + `dataPriv = new Data()`（内部数据）+ `dataUser = new Data()`（用户数据）。`function dataAttr(elem, key, value) { if (data === "string") cache[ camelCase( data ) ] = value }`。`Object.defineProperty(elem, expando, { value: { ... }, enumerable: false, configurable: true })`。

**关键参数**：
- `dataPriv` jQuery 内部数据 event handle / queue
- `dataUser` 用户数据 $elem.data("key")
- `expando = "jQuery" + uid` DOM 节点唯一标识
- `camelCase` key 归一化 foo-bar ↔ fooBar

**最佳实践**：Data 系统是 jQuery 内部"公交系统"；dual namespace 区分内部/用户数据；`enumerable: false` 防 for...in 泄露；`configurable: true` 允许 delete；任何"DOM 私有数据"项目可借鉴。

### 模式 8 - Event 系统（eventHandle 统一收口 + 委托分发）

**问题场景**：原生 addEventListener 一个 type 一个 listener，jQuery 想"按 selector 委托"必须统一收口再分发。`on()` 4 层参数重载：`(types, fn)` / `(types, data, fn)` / `(types, selector, fn)` / `(types, selector, data, fn)` / `(types-Object, ...)`。所有分支收敛到 `jQuery.event.add()`。

**解决方案**：`src/event.js:24-83` 的 `on: function(types, selector, data, fn) { return on(this, types, selector, data, fn) }`。`function on(elem, types, selector, data, fn, one)` 4 层参数重载分发。一次性 `one()`：`fn = function() { jQuery().off(elem); if (origFn) return origFn.apply(this, arguments) }` + `fn.guid = origFn.guid || (origFn.guid = jQuery.guid++)`。`elemData.handle = eventHandle = function(e) { ... }`。

**关键参数**：
- `(types, fn)` 普通事件
- `(types, data, fn)` 带数据
- `(types, selector, fn)` 委托
- `(types, selector, data, fn)` 委托 + 数据
- `(types-Object, ...)` 多事件对象

**最佳实践**：4 层参数重载用递归 / 条件收敛；eventHandle 统一收口 = 委托分发基础；`one = 1` 自动 off（`fn.guid = origFn.guid`）；命名空间（`.off(".namespace")` 一键解绑）；任何"事件系统"项目可借鉴。

### 模式 9 - AJAX 框架（Strategy + Chain of Responsibility）

**问题场景**：AJAX 4 种 transport（xhr / script / jsonp / binary），prefilters（请求前处理）+ transports（请求传输）+ converters（响应转换）三层链式调用。jQuery 用注册表 + 链式调度实现可扩展 AJAX。

**解决方案**：`src/ajax.js` 的 `jQuery.ajaxPrefilter("script", function(s) { ... })` + `jQuery.ajaxTransport("script", function(s) { return { send: ..., abort: ... } })` + `jQuery.ajaxConvert["text script"] = function(s) { return ... }`。调度：`transport = inspectPrefiltersOrTransports(prefilters, s, options, jqXHR)` + `transport = inspectPrefiltersOrTransports(transports, s, options, jqXHR)`。4 transport：xhr / script / jsonp / binary。7 datatype：`*`/`text`/`html`/`xml`/`json`/`jsonp`/`script`。

**关键参数**：
- `ajaxPrefilter` 请求前修改 options
- `ajaxTransport` 实际发送请求
- `ajaxConvert` 响应转换 text→json 等
- 4 transport xhr / script / jsonp / binary
- 7 datatype * / text / html / xml / json / jsonp / script

**最佳实践**：Strategy + Chain of Responsibility 是 AJAX 框架范本；注册表 + 链式调度可扩展；任何"多 transport + 多 converter"项目可借鉴；prefilter 改 options，transport 发请求，converter 改响应；配合 Promise 化 `jqXHR` 链式。

### 模式 10 - factory 模式 + ESM 双轨（5 个 entry）

**问题场景**：jQuery 不只能在浏览器跑，还要在 Node / Web Worker / Extension Service Worker 跑（无 `window` 全局）。`--factory` 构建产出一个 `factory(window)` 函数让 jQuery 在无 window 场景可用。`package.json` 的 `exports` 字段定义 5 个 entry 兼容 3 种消费场景。

**解决方案**：`package.json` exports 节选：`".": { "node": "./dist-module/jquery.node.js", "module": "./dist-module/jquery.modern.js", "import": "./dist-module/jquery.js", "default": "./dist/jquery.js" }` + `"./slim": { ... }` + `"./factory": { ... }` + `"./factory-slim": { ... }` + `"./src/*.js": "./src/*.js"`。factory 模式让 jQuery 在无 window 跑。slim 版本省 6KB（无 ajax/effects）。

**关键参数**：
- `.` 主入口（浏览器 / Node）
- `.slim` 不含 ajax/effects
- `.factory` 工厂模式（无 window 依赖）
- `.factory-slim` 工厂 + 精简
- `./src/*.js` 源码路径（bundler 用）

**最佳实践**：5 个 entry 兼容 3 种消费场景（Node CJS / bundler / 浏览器）；factory 模式让 jQuery 在无 window 跑；任何"工具库 + 多环境"项目可借鉴；ESM 迁移保留双轨（不破坏老用户）；slim 版本省 6KB（无 ajax/effects）。

---

## 第三段：进阶范式

### 模式 11 - Sizzle vs qSA（1.5x 慢换取扩展性）

**问题场景**：原生 `querySelectorAll` 极快，Sizzle 引擎自实现 1.5x 慢。WHY：jQuery 扩展伪类（`:eq()`/`:has()`）+ scope 限定 + context 链，qSA 做不到。jQuery 4.0 提供 selector-native 模式省 5KB 体积。

**解决方案**：`selector-native.js` 的 `jQuery.find = function(selector, context, results, seed) { var elem, match; results = results || []; context = context || document; if (!selector || typeof selector !== "string") { return results }; context.querySelectorAll(selector); return results }`。仅当 build 时排除 selector 模块。80% 用户用 CSS 3 选择器够用。

**关键参数**：
- 完整 Sizzle 35KB 1.5x qSA `:eq()` `:has()` 等
- selector-native 30KB = qSA 仅 CSS 3
- 80% 走快速路径

**最佳实践**：体积 vs 扩展性是 jQuery 4.0 的 trade-off；80% 用户用 CSS 3 选择器够用；任何"工具库 + 体积敏感"项目可借鉴；`rquickExpr.exec()` 80% 走快速路径；Andrew Dupont 的 scope 限定术让 Sizzle 稳赢 qSA。

### 模式 12 - rsingleTag 正则（HTML 字符串快速识别）

**问题场景**：`$("<div>")` 字符串要快速识别为 HTML 字符串。朴素 includes/startsWith 多次调用慢。jQuery 用 `rsingleTag = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i` 单一正则识别单标签。

**解决方案**：`src/core/init.js:76-88` 的 `if (rsingleTag.test(match[1]) && jQuery.isPlainObject(context)) { // $(html, props) → props 当方法或属性绑定；for (match in context) { if (jQuery.isFunction(this[match])) { this[match](context[match]) } else { this.attr(match, context[match]) } } return this }`。`$("<div>", { on: { click: fn } })` 自动绑定事件。

**关键参数**：
- `rquickExpr` 快速识别 #id / HTML
- `rsingleTag` 识别单标签 HTML 字符串
- `isPlainObject` 区分 plain object / DOM
- 优雅降级 方法失败时当属性

**最佳实践**：单标签 vs 多标签区分（性能 + 语义）；`$("<div>", { on: { click: fn } })` 自动绑定事件；任何"HTML 字符串 + 配置"项目可借鉴；方法 / 属性优雅降级；正则 + typeof 组合比 if-else 链快。

### 模式 13 - cheerio / jsdom 跑 Node 单测（22 模块 QUnit）

**问题场景**：纯 DOM 库在 Node 跑测试需要 DOM 模拟。jQuery 用 jsdom（lightweight）+ QUnit（自有测试框架）跑 22 模块单测。`browserstack-dispatch.yml` 拉起真实浏览器矩阵（IE11/Edge/Chrome/Firefox/Safari）。

**解决方案**：`package.json` scripts 节选：`"test": "npm run build:all && npm run lint && npm run test:jsdom && npm run test:browserless && npm run test:browser && npm run test:esm && npm run test:slim && npm run test:no-deprecated && npm run test:selector-native"` + `"test:jsdom": "qunit test/unit/ --jsdom"` + `"test:browser": "node test/node_smoke_tests/runner.js"`。22 模块 200-500 case + BrowserStack 真实 IE11-Edge-Chrome-FF-Safari 矩阵 + Promises/A+ `@mgol/promises-aplus-tests` 2.1.2 872 case。

**关键参数**：
- Unit QUnit 22 模块 200-500 case
- Browser BrowserStack 真实 IE11-Edge-Chrome-FF-Safari
- jsdom QUnit + jsdom 1 套
- Promises/A+ 872 case
- Bundler Webpack/Rollup smoke

**最佳实践**：jsdom + QUnit 是 DOM 库 Node 测试标准；22 模块单测 + 真实浏览器矩阵双轨；任何"前端库"项目可借鉴；`lint` 先行（`__proto__` 守卫检测）；Promises/A+ 合规是第三方背书。

### 模式 14 - build:all 输出 4 变体（main/slim/factory/factory-slim）

**问题场景**：用户场景多样（CDN 浏览器 / bundler / Node / 体积敏感）。单 build 输出不够。jQuery 用 `npm run build:all` 输出 4 变体（main / slim + esm / umd），用户按需选。

**解决方案**：build 产物结构：`dist/jquery.js`（main + UMD）+ `dist/jquery.min.js`（main + UMD + minify）+ `dist/jquery.slim.js`（main - ajax - effects）+ `dist/jquery.slim.min.js` + `dist/jquery.factory.js`（工厂模式 + UMD）+ `dist/jquery.factory.min.js` + `dist/jquery.factory.slim.js` + `dist/jquery.factory.slim.min.js`。`dist-module/` 目录：`jquery.js`（ESM 主入口）+ `jquery.modern.js`（ESM 现代浏览器）+ `jquery.node.js`（ESM Node）。

**关键参数**：
- main ~30KB CDN 浏览器
- slim ~24KB 不需 ajax/effects
- factory 同 main 无 window 环境
- factory-slim 同 slim 无 window + 精简

**最佳实践**：4 变体覆盖所有用户场景；任何"前端库 + 多环境"项目可借鉴；slim 比 main 省 6KB；factory-slim 跑 Web Worker / Extension；Rollup 输出 ESM + UMD 双轨。

### 模式 15 - jQuery.error + exceptionHook（全局异常捕获）

**问题场景**：用户回调里抛错不能传播到全局。jQuery 提供 `jQuery.error(msg)` + `Deferred.exceptionHook` 钩子，1.6+ 默认绑 `console.error`。

**解决方案**：`src/core.js:195-197` 的 `jQuery.error = function(msg) { throw new Error(msg) }`。`src/deferred/exceptionHook.js` 的 `deferred.exceptionHook = function(error, stack) { if (window.console && console.error) { console.error(error) } }`。`deferred.catch()` Promises/A+ 标准 catch。

**关键参数**：
- `jQuery.error(msg)` 主动抛错（带行号）
- `Deferred.exceptionHook` 异步回调异常钩子
- `console.error` 兜底输出
- `deferred.catch()` Promises/A+ 标准 catch

**最佳实践**：`exceptionHook` 钩子让宿主注入自定义错误处理；1.6+ 默认绑 `console.error` 避免静默失败；任何"异步框架"项目可借鉴；配合 Promises/A+ `catch()`；`jQuery.error(msg)` 抛 Error 而非字符串。

---

## 第四段：实战范式

### 模式 16 - __proto__ 防污染（CVE-2019-11358 修复 3 行代码）

**问题场景**：2018 年 prototype pollution CVE 揭示 `$.extend` 没防 `__proto__`。恶意 JSON `{"__proto__": {"isAdmin": true}}` 污染所有对象。jQuery 3.4.0 加 3 行代码修复。

**解决方案**：`src/core.js:153` 的 `for (name in options) { src = target[name]; copy = options[name]; // Prevent Object.prototype pollution (CVE-2019-11358); if (name === "__proto__" || target === copy) continue }`。修复版本 3.4.0+。同时防 `constructor.prototype`（额外保险）。配合 ESLint 规则检测残留。OWASP 2021 Top 10 收录。

**关键参数**：
- `name === "__proto__"` 跳过 __proto__ key
- `target === copy` 防自引用死循环
- CVE CVE-2019-11358
- 修复版本 3.4.0+
- OWASP 2021 Top 10 收录

**最佳实践**：3 行代码防 prototype pollution；任何"深 merge / extend"项目必须加这 3 行；同时防 `constructor.prototype`（额外保险）；配合 ESLint 规则检测残留；OWASP 2021 Top 10 收录。

### 模式 17 - Promises/A+ 2.1.2 合规（872 case 全过）

**问题场景**：jQuery 1.5 Deferred 是"Promise 雏形"，3.x 起完整 Promises/A+ 2.3.3。官方 `@mgol/promises-aplus-tests@2.1.2-mgol.2` 套件 872 case 全部通过，第三方背书。

**解决方案**：`test/promises_aplus_adapters/` 的 jQuery Deferred → A+ 适配器：`module.exports = { resolved: function(value) { return jQuery.Deferred().resolve(value).promise() }, rejected: function(reason) { return jQuery.Deferred().reject(reason).promise() }, deferred: function() { var d = jQuery.Deferred(); return { promise: d.promise(), resolve: d.resolve, reject: d.reject } } }`。A+ 要求：2.1 Promise 状态 + 2.2 then 方法 + 2.3 thenable 桥接 + 2.3.3.3.4.1 忽略 post-resolution 异常。

**关键参数**：
- 2.1 Promise 状态 pending / resolved / rejected
- 2.2 then 方法 .then(onFulfilled, onRejected)
- 2.3 thenable 桥接 adoptValue + thenable 检测
- 2.3.3.3.4.1 忽略 post-resolution 异常 maxDepth 计数器
- 第三方背书 872 case 全过

**最佳实践**：Promises/A+ 合规是第三方背书；任何"自研 Promise"项目可借鉴；872 case 官方测试全过；thenable 桥接（`if (typeof then === "function")`）；`maxDepth` 实现 2.3.3.3.4.1。

### 模式 18 - noConflict() 模式（不强制挂 window）

**问题场景**：jQuery 1.0 默认 `window.jQuery = window.$ = jQuery`，与同页 Prototype.js / Zepto 冲突。`$.noConflict()` 让用户拿回 `$` 控制权。

**解决方案**：`src/exports/global.js` 的 `noConflict = function(deep) { if (window.$ === jQuery) window.$ = _$; if (deep && window.jQuery === jQuery) window.jQuery = _jQuery; return jQuery }`。`_$` / `_jQuery` 暂存旧引用。`deep` 参数让出更彻底。

**关键参数**：
- 默认 `window.$ = window.jQuery = jQuery`
- `noConflict()` 仅让出 $
- `noConflict(true)` 让出 $ + jQuery

**最佳实践**：`noConflict()` 是多库共存标准；任何"工具库 + 挂全局"项目可借鉴；默认挂全局可选（如 es-module-shims）；`_$` / `_jQuery` 暂存旧引用；`deep` 参数让出更彻底。

### 模式 19 - OpenJS Foundation 治理（HeroDevs NES + 月度会议）

**问题场景**：20 年老项目，长期维护需要中立 + 资金。OpenJS Foundation 托管 + HeroDevs NES（Never-Ending Support）商业支持 + 月度公开会议。

**解决方案**：治理：OpenJS Foundation Cross-Project Council + jQuery Team 自治（10+ 维护者）+ timmywil/dependabot/arthurvr/gibson042/sgrove + 商业支持 HeroDevs NES。流程：commitplease 强制 [Component] description + 30 天无活动 issue 自动 lock + Bot 维护依赖 + 月度公开会议（meetings.jquery.org）。沟通：Matrix #jquery_meeting:gitter.im + GitHub Issues + Trac 老 issue 索引 + 论坛 contrib.jquery.org。

**关键参数**：
- Star 59k+
- 维护者 10+
- License MIT
- 主仓库 jquery/jquery
- 月下载 npm 数千万
- WordPress 默认捆绑（~30% 全网）

**最佳实践**：OpenJS Foundation 托管 = 中立 + 长期；HeroDevs NES 商业支持反哺开源；`commitplease` 强制 commit 格式；任何"20 年长寿"项目可借鉴；月度公开会议透明治理。

### 模式 20 - CDN + SRI hash + CSP 兼容（4 件套发布）

**问题场景**：jQuery 通过 CDN 加速（jsDelivr/unpkg/Google CDN），SRI hash 校验防篡改，CSP nonce 透传保证 inline script 可控。4 件套（CDN + SRI + CSP + TrustedHTML）保证生产安全。

**解决方案**：发布 4 件套：CDN 加速 `<script src="https://code.jquery.com/jquery-4.0.0.min.js">` + SRI 校验 `<script src="..." integrity="sha384-..." crossorigin="anonymous">` + CSP nonce 兼容 `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'nonce-{nonce}' https://code.jquery.com">` + TrustedHTML 字符串支持（4.0）`<script>jQuery.trustedHTMLPolicy.createHTML(...)</script>`。

**关键参数**：
- CDN 加速 jsDelivr/unpkg/Google CDN mirror
- SRI hash `<script integrity="sha384-...">` 校验
- CSP nonce DOMEval 支持 nonce 透传
- TrustedHTML 4.0 起 Trusted Types 兼容

**最佳实践**：CDN + SRI + CSP + TrustedHTML 4 件套；任何"前端库发布"项目可借鉴；SRI hash 必须在发布时计算；`DOMEval` 4.0 支持 nonce 透传；Trusted Types 防 XSS。
