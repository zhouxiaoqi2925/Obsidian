# seajs - 玉伯 2012 写给中文前端的 CMD 规范模块加载器

**GitHub**: seajs/seajs
**Star**: 8.5k
**语言**: JavaScript
**主题**: 前端模块加载器 / CMD 规范 / 浏览器端 require
**适用场景**: 学习"如何用 400 行代码写一个模块加载器"、CMD vs AMD 差异、循环依赖处理、IE 兼容

---

## 第一段：基础范式

### 模式 1：状态机驱动的模块加载

**问题场景**：浏览器没有原生 `require`，JS 按 `<script>` 顺序执行——无法异步按需加载、无法声明依赖、循环依赖死锁。

**解决方案**：seajs 用 400 行状态机解决——模块生命周期 = `FETCHING → SAVED → LOADING → EXECUTING → EXECUTED` 5 状态，状态转换 = 事件驱动。

**关键参数**：
- 5 状态 = FETCHING（下载）/ SAVED（已保存源码）/ LOADING（注入 DOM）/ EXECUTING（执行）/ EXECUTED（完成）
- 状态机 = `Module.prototype._state` 字段
- 转换 = `_fetch` / `_save` / `_load` / `_exec` 4 步
- 回调 = `on('exec', callback)` 订阅
- 幂等 = 同 ID 模块只加载一次

**最佳实践**：异步加载用状态机（vs. 回调嵌套）——状态显式 + 可观察 + 易调试。

### 模式 2：CMD 规范"先 define 后 use"

**问题场景**：AMD（RequireJS）推崇"前置声明所有依赖"——`define(['./a', './b'], factory)`，但日常写代码时 deps 不直观。

**解决方案**：CMD 推崇"就近声明"——`define(function(require, exports, module) { var a = require('./a'); ... })`，用 `require` 同步调用代替 deps 数组。

**关键参数**：
- define = `define(factory)` 或 `define(id?, deps?, factory)`
- factory 签名 = `function(require, exports, module)`
- require = 同步 `var a = require('./a')`
- exports = `exports.foo = ...`
- module = `module.exports = ...`

**最佳实践**：内部框架用 CMD 风格（就近声明）——比 AMD 直观，比 CommonJS 兼容浏览器。

### 模式 3：事件总线解耦

**问题场景**：模块加载是异步链式（a 依赖 b 依赖 c），纯回调嵌套深；想统一通知"模块 X 加载完成"。

**解决方案**：`src/util-events.js` 事件总线——`module.on('exec', cb)` / `module.emit('exec')`，模块间解耦。

**关键参数**：
- API = `on` / `off` / `emit`
- 事件类型 = `fetch` / `save` / `load` / `exec` / `error`
- 监听者 = 当前 module + parent module
- 一次性 = `once`（用完即焚）
- 调试 = `seajs.emit('all', event)` 透传

**最佳实践**：异步框架用事件总线（vs. 回调嵌套）——关注点解耦 + 调试可观察。

### 模式 4：工厂函数正则解析

**问题场景**：CMD `define(function(require, exports, module) {...})` 怎么静态分析出"这个模块依赖了哪些文件"？

**解决方案**：`src/util-deps.js` 正则解析——`/require\(\s*['"]([^'"]+)['"]\s*\)/g` 匹配所有 `require('xxx')` 调用，提取依赖 ID。

**关键参数**：
- 正则 = `/require\(\s*['"]([^'"]+)['"]\s*\)/g`
- 提取 = 依赖 ID 数组
- 静态分析 = 不执行代码，纯文本扫描
- 局限 = 动态 `require(varName)` 抓不到
- 优势 = 0 性能开销，preload 友好

**最佳实践**：AMD/CMD 加载器用正则静态分析依赖——preload + tree-shake 的基础。

### 模式 5：路径解析 id↔uri

**问题场景**：用户在 `define` 内部写 `require('./b')` 相对路径——seajs 怎么知道 './b' 是哪个文件？

**解决方案**：`src/util-path.js` 路径解析——id 是相对当前模块 URI 的相对路径，URI 是浏览器能加载的完整 URL。

**关键参数**：
- id = 模块标识（相对路径 / 绝对路径 / alias）
- uri = 实际 URL（http://example.com/js/b.js）
- 规则 = id 相对于当前 module uri 解析
- alias = `seajs.config({alias: {'jquery': '...'}})` 别名映射
- base = `seajs.config({base: './js'})` 基础路径

**最佳实践**：模块加载器必带路径解析——id 是人类友好的相对引用，uri 是机器能加载的 URL。

---

## 第二段：扩展范式

### 模式 6：循环依赖处理

**问题场景**：模块 a 依赖 b，模块 b 依赖 a——同步 require 死锁（a 还没导出，b 要 a）。

**解决方案**：seajs 用"提前暴露"策略——a 加载时立即把空 exports 给 b，b 用到 a 的方法时 `require.async` 延迟。

**关键参数**：
- 检测 = 模块状态 = FETCHING（加载中）
- 行为 = 提前返回空 exports
- 调用 = 用户在 b 内 `var a = require('./a')` 拿到空对象
- 风险 = 调 a 的方法报错（a 还没执行完）
- 解法 = 改成 `require.async('./a', cb)` 异步

**最佳实践**：循环依赖用 require.async 延迟加载——避免空对象陷阱。

### 模式 7：浏览器原生 script 注入

**问题场景**：seajs 怎么在浏览器里加载 JS？AJAX 拿源码 + eval 太慢，document.write 破坏 DOM。

**解决方案**：`src/util-request.js` 动态 `<script>` 注入——`appendChild(script)` 浏览器自动 fetch + exec，依赖浏览器缓存。

**关键参数**：
- `<script src=uri onload=onload onerror=onerror>` 注入
- 回调 = `onload` 触发 EXECUTING
- 失败 = `onerror` 触发 ERROR
- 缓存 = 浏览器 HTTP 缓存（带 hash 强缓存）
- 缺陷 = IE 6-9 的 onload bug（用 `script.readyState` 兜底）

**最佳实践**：浏览器端异步加载用动态 script 注入（vs. AJAX + eval）——浏览器自动缓存 + DOM 不破坏。

### 模式 8：IE 6-9 兼容策略

**问题场景**：IE 6-9 的 onload 不标准（无 onerror）、并发脚本加载 bug、CORS 限制——seajs 怎么兜底？

**解决方案**：3 层兜底——1) `script.readyState === 'loaded'` 检测 onload 替代；2) `attachEvent('onreadystatechange')` 监听；3) 错误 `onerror = function() { throw }` 主动抛。

**关键参数**：
- readyState = IE 特有属性（`loading` → `loaded` → `interactive` → `complete`）
- attachEvent = 老 IE 事件 API
- 缓存 = 304 协商缓存（IE 缓存重请求 bug）
- 并发 = 6 个并发上限（IE 不支持更多）
- 总成本 = 20% 代码量兜底 IE 兼容

**最佳实践**：库要支持老浏览器必带 readyState / attachEvent 兜底——20% 代码换 5x 用户群。

### 模式 9：seajs.config 全局配置

**问题场景**：base / alias / charset / timeout 怎么全局配置？

**解决方案**：`seajs.config({base: './js', alias: {...}, timeout: 20000})` 单一入口配置。

**关键参数**：
- base = 所有相对路径基础
- alias = 简化第三方引用
- paths = 别名同义
- vars = 变量替换
- map = 文件映射（生产环境换 CDN）
- debug = 调试模式

**最佳实践**：模块加载器配置用单一 config 函数（vs. 全局变量）——配置集中管理，运行时可改。

### 模式 10：spm 包管理器

**问题场景**：seajs 加载器有了，谁来管"包"（包名 + 版本 + 依赖）？

**解决方案**：spm（SeaJS Package Manager）——npm 思路搬到浏览器端，`spm install jquery` 拉包，`spm build` 打包。

**关键参数**：
- 配置文件 = package.json
- 注册 = `spm publish` 到 spmjs.org
- 兼容性 = 类似 npm 但面向浏览器
- 现状 = 2016 停更，被 npm + Webpack 取代
- 历史意义 = 中文前端工程化启蒙

**最佳实践**：包管理工具是生态必备——加载器只解决"运行时"，包管理解决"开发时"。

---

## 第三段：进阶范式

### 模式 11：模块缓存机制

**问题场景**：同一模块被多个父模块 require——是每次重新 fetch，还是缓存？

**解决方案**：seajs 强缓存——模块 EXECUTED 后，引用 = `cached[uri] = exports`，后续 require 直接返回。

**关键参数**：
- 缓存 = `Module.cache` 对象（uri → module）
- 命中 = 同 URI 第二次 require 直接返回 exports
- 失效 = 无（seajs 3.0 不支持 HMR）
- 内存 = 单页面 N 个模块，内存可控
- 风险 = 长生命周期页面（Web App）内存增长

**最佳实践**：模块加载必带强缓存——避免重复 fetch + 重复执行的开销。

### 模式 12：SEA_DEBUG 调试模式

**问题场景**：模块加载链深（a → b → c → d），出错时怎么定位？

**解决方案**：`seajs.config({debug: true})` 开启调试——日志输出每个模块的状态转换 + 耗时 + 错误栈。

**关键参数**：
- 日志级别 = `info` / `warn` / `error`
- 输出 = `console.log` 状态转换
- 耗时 = 每个模块 fetch + exec 时间
- 错误栈 = 链式加载错误栈
- 生产 = 关闭（避免性能开销）

**最佳实践**：库必带调试模式开关——开发环境用 verbose 日志，生产环境关闭。

### 模式 13：require.async 异步加载

**问题场景**：首屏只要 a 核心模块，b 推迟——同步 require 强制全加载。

**解决方案**：`require.async('./b', function(b) {...})` 异步——不阻塞当前模块执行，回调内用 b。

**关键参数**：
- 同步 = `var b = require('./b')`（阻塞）
- 异步 = `require.async('./b', cb)`（不阻塞）
- 适用 = 路由组件 / 大库按需加载 / 非首屏
- 性能 = 减少首屏时间
- 陷阱 = 回调嵌套（vs. ES6 import()）

**最佳实践**：非首屏模块用 require.async——首屏优化 + 按需加载的标准做法。

### 模式 14：Plugin 机制

**问题场景**：seajs 核心是 JS 加载，但用户要 CSS / JSON / 模板（tpl）——怎么扩展？

**解决方案**：`seajs.plugin` 机制——`seajs.plugin('./plugin-css')` 注册解析器，把 `require('./style.css')` 转为 `<link>` 注入。

**关键参数**：
- 注册 = `seajs.plugin(plugin, fn)` 或 `seajs.use(plugin)`
- 解析器 = `Module._resolve` 钩子改写 uri
- 类型 = css / json / tpl / 自定义
- 加载器 = `seajs.importStyle(uri)` 注入
- 案例 = seajs-css / seajs-json / seajs-text

**最佳实践**：库设计必带 plugin 机制——核心只做"必要的事"，扩展交给社区。

### 模式 15：seajs.use 入口 API

**问题场景**：用户用 seajs 时，怎么启动整个应用？

**解决方案**：`seajs.use(['./app', './router'], function(app, router) { app.start() })`——入口 + 多个模块 + 启动回调。

**关键参数**：
- use = `seajs.use(ids, callback)`
- ids = 数组 / 单个 id
- callback = 全部加载完成
- 嵌套 = `seajs.use('./a', function(a) { seajs.use('./b', function(b) { ... }) })`
- 全局 = 暴露 `window.seajs`

**最佳实践**：库的"启动入口"用 use + 回调——保证依赖就绪后才执行业务代码。

---

## 第四段：实战范式

### 模式 16：CMD vs AMD vs CommonJS

**问题场景**：模块规范 CMD / AMD / CommonJS 哪个好？2012-2015 年前端社区激辩。

**解决方案**：决策——服务端用 CommonJS（Node 同步加载快）；浏览器 AMD（RequireJS 异步兼容 IE8+）；国内多用 CMD（更接近 CommonJS 心智）。

**关键参数**：
- CommonJS = 同步、`require` / `module.exports`、Node
- AMD = 异步、`define([deps], factory)`、RequireJS
- CMD = 异步 + 懒声明、`define(factory)`、SeaJS
- ES Module = 官方标准、`import` / `export`、2015+
- 现状 = ES Module 一统江湖

**最佳实践**：新项目用 ES Module（`import` / `export`）——官方标准，工具链最完善。

### 模式 17：seajs 性能优化

**问题场景**：页面加载 20 个模块，HTTP 请求多、首屏慢。

**解决方案**：3 步优化——1) `spm build` 合并模块；2) 静态资源 CDN + hash 强缓存；3) 关键模块 inline。

**关键参数**：
- 合并 = `spm concat` 多个 module → 1 个文件
- 压缩 = `spm build --compress` uglify
- CDN = `seajs.config({base: 'https://cdn.example.com/js/'})`
- hash = 文件名带 hash 强缓存
- inline = 关键模块 `<script>` 直接嵌入 HTML

**最佳实践**：seajs 性能优化走"合并 + CDN + 缓存"三件套——和现代打包工具同思路。

### 模式 18：从 seajs 迁移到 Webpack

**问题场景**：2016 后团队想从 seajs 迁到 Webpack/Rollup——怎么低成本迁移？

**解决方案**：渐进迁移——1) `seajs.use` 替换为 `import`；2) `define` 替换为 `export default`；3) 配置 Webpack `resolve.alias` 兼容路径。

**关键参数**：
- define → export default
- require → import
- require.async → import()
- seajs.config → Webpack resolve.alias
- spm → npm
- 工具 = `seajs-to-webpack` 转换器

**最佳实践**：迁移到老框架走"渐进替换"——按模块拆分，新代码 Webpack，老代码维持。

### 模式 19：历史意义与现代启示

**问题场景**：seajs 已被 Webpack 取代，还值得学吗？

**解决方案**：值得——seajs 400 行代码讲清"模块加载器本质"（状态机 + 事件总线 + 路径解析 + 静态分析），这些思想在 Webpack/Vite 仍在用。

**关键参数**：
- 状态机 = 现代 loader 仍按"load → parse → transform → generate"状态推进
- 事件总线 = Webpack 的 Tapable hooks 同思路
- 静态分析 = esbuild 的 import 扫描同思路
- 路径解析 = Webpack 的 resolve 同思路
- 教学价值 = 400 行讲清"加载器"本质

**最佳实践**：读老框架源码学"思想"——比读新框架 100x 代码容易，核心思想万变不离其宗。

### 模式 20：7 天复刻 mini-seajs 路线

**问题场景**：想做模块加载器练手但 400 行太多；想从零写一个。

**解决方案**：7 天 MVP——Day 1-2 状态机核心（FETCHING→SAVED→LOADING→EXECUTING→EXECUTED），Day 3 事件总线，Day 4 路径解析，Day 5 正则依赖提取，Day 6 script 注入，Day 7 seajs.use 入口。

**关键参数**：
- 核心 = 状态机 + 事件总线
- 协议 = CMD（define + require）
- 路径 = uri 解析
- 加载 = 动态 script 注入
- 复刻难度 = 核心 200 行，IE 兼容 1 周

**最佳实践**：复刻 mini-seajs 先做"状态机 + 事件总线"——核心思想 200 行能讲清楚，剩下都是细节。

---

## 附录：5 段必读代码

1. `src/module.js` — 429 行核心状态机（FETCHING→EXECUTED 5 状态）
2. `src/util-events.js` — 事件总线（on / off / emit / once）
3. `src/util-request.js` — 动态 script 注入 + IE 兼容
4. `src/util-path.js` — id↔uri 路径解析（alias / base / relative）
5. `src/util-deps.js` — 工厂函数正则依赖提取

## 一句话总结

seajs = 400 行状态机（FETCHING→EXECUTED 5 状态）+ CMD 规范就近声明 + 事件总线解耦 + 正则静态分析依赖 + 动态 script 注入 + IE 兼容兜底，把"浏览器端模块加载"做到 2012-2016 年中文前端的事实标准，Webpack/Rollup 仍继承其核心思想。
