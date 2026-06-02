# requirejs - 浏览器端 AMD 异步模块加载器的奠基范式

**GitHub**: requirejs/requirejs
**Star**: 12k+
**语言**: JavaScript
**主题**: AMD 规范 / 浏览器模块系统 / 状态机驱动加载
**适用场景**: 维护老项目 IE6+ 浏览器兼容、Dojo/jQuery 时代异步加载、新项目已被 ES Modules + bundler 取代

---

## 第一段：模块系统与 AMD 核心

### 模式 1：define() / require() 基础范式

**问题场景**：2009 年浏览器没有原生模块系统；`<script>` 顺序依赖脆弱、全局变量污染、构建优化困难；如何用纯 JS 模拟"模块 + 依赖"？

**解决方案**：RequireJS 实现 AMD（Asynchronous Module Definition）规范：`define(id?, deps?, factory)` 定义模块，`require(deps, cb)` 异步加载依赖后回调。

```js
// 定义模块
define('myModule', ['jquery', './utils'], function ($, utils) {
  return { greet: () => $('#app').text(utils.format('Hi')) }
})
// 异步加载
require(['myModule', 'lodash'], function (mod, _) {
  mod.greet()
  _.chunk([1, 2, 3], 2)
})
// 入口
// <script data-main="js/main" src="require.js"></script>
```

**关键参数**：
- `define(id, deps, factory)`：id 可省略（匿名模块），deps 是依赖 ID 数组
- `require([deps], cb)`：cb 收到各模块的 export
- `require.config({ baseUrl, paths, shim, ... })`：全局配置
- `data-main="js/main"`：HTML 标签驱动入口，省一次 HTTP

**最佳实践**：现代项目用 ES Modules + bundler；维护 AMD 老项目时 `require.config` 集中放 `main.js` 入口；匿名模块（无 id）依赖 `<script data-requiremodule>` 注入归属。

### 模式 2：Module 状态机（6 态流转）

**问题场景**：AMD 规范要求"在所有依赖 resolve 后再执行 factory"；IE6 没有 Promise；如何纯 JS 手写"异步加载 + 同步执行"？

**解决方案**：每个 `Module` 实例走 6 态流转：`enabled → enabling → inited → fetched → defining → defined`，全靠标志位手写，无状态机库。

```js
Module = function (map) {
  this.events = getOwn(undefEvents, map.id) || {}
  this.map = map
  this.shim = getOwn(config.shim, map.id)
  this.depExports = []
  this.depMaps = []
  this.depMatched = []
  this.pluginMaps = {}
  this.depCount = 0
}
// 6 态流转
Module.prototype.init = function (depMaps) { /* enabled → inited */ }
Module.prototype.enable = function () { /* enabling → inited */ }
Module.prototype.fetch = function () { /* inited → fetched */ }
Module.prototype.check = function () { /* fetched → defining → defined */ }
Module.prototype.callPlugin = function () { /* plugin 路径 */ }
Module.prototype.load = function () { /* 普通 JS 路径 */ }
```

**关键参数**：
- `depCount`：剩余未 resolve 的依赖数（初始 = deps.length，每 `defineDep` 减 1）
- `events` + `on()/emit()`：先订阅、后定义（"deferred callback"模式）
- `enabledRegistry` vs `registry`：双注册表避免大型应用 O(N) 扫描
- `breakCycle`：循环依赖强制定义部分 exports

**最佳实践**：理解 AMD 状态机 = 理解前端模块系统的"deferred callback"模式；新项目直接用 ESM（`import` 编译期静态分析）；手写 loader 时 `depCount` 计数是核心。

### 模式 3：makeModuleMap 唯一 ID 生成

**问题场景**：相对路径 `'./foo'` + 父模块 baseName 怎么变成绝对 ID？两个相对路径在 plugin normalize 之前碰撞怎么办？

**解决方案**：`makeModuleMap(relName, parentModuleMap)` 把 `'./foo' + baseName` 解析成绝对 ID；`unnormalizedCounter += 1` 给未归一化 plugin 资源打后缀（`_unnormalized1`）解决碰撞。

```js
function makeModuleMap(name, parentModuleMap, isNormalized) {
  var parentName = parentModuleMap ? parentModuleMap.name : ''
  var normalizedName = name
  // ... 路径拼接
  if (name === 'require' || name === 'exports' || name === 'module') {
    normalizedName = name   // 三个保留字直接返回
  }
  return {
    prefix: prefix,         // 父 ID（用于相对路径解析）
    name: normalizedName,   // 绝对 ID
    parentMap: parentModuleMap,
    unnormalized: !isNormalized,
    url: urlMap[normalizedName]  // 缓存
  }
}
```

**关键参数**：
- 解析：相对路径 → 拼接 `parentName` → 绝对 ID
- 保留字：`require` / `exports` / `module` 不当模块名
- `unnormalized` 标记 + `unnormalizedCounter`：plugin 资源去重
- `urlMap[id]`：缓存 ID → URL 映射

**最佳实践**：所有"相对路径 → 绝对 ID"都用 `makeModuleMap` 模式；ID 编码状态信息（`_unnormalized1`）是经典去重技巧；ESM 的"模块记录"本质上是同一套路。

### 模式 4：多 Context 隔离（多版本共存）

**问题场景**：同一个应用要同时跑 jQuery 1.6 和 jQuery 1.9（渐进式升级）；不同团队插件需要独立依赖空间；如何隔离？

**解决方案**：`contexts[contextName]` 是字典，每个 context 拥有独立的 `registry / defQueue / urlFetched / config`。`requirejs.config({ context: 'legacy' })` 创建独立命名空间。

```js
requirejs.config({ context: 'modern', baseUrl: '/js/modern' })
requirejs.config({ context: 'legacy', baseUrl: '/js/legacy' })
// 不同 context 下的 jQuery 完全隔离
requirejs(['modern', 'jquery'], function (m, $) { /* 1.9 */ })
requirejs(['legacy', 'jquery'], function (l, jq) { /* 1.6 */ })
```

**关键参数**：
- `contexts[contextName]`：每个 context 是独立闭包
- `defaultContext = '_'`：默认 context
- 每个 context 独立 `registry / defQueue / urlFetched / config`
- 跨 context 通信：没有（设计就是隔离）

**最佳实践**：AMD 多 context 是"渐进式升级"的杀手锏（ES Modules 没有这个能力）；新项目用 ESM + 微前端（Module Federation）替代；维护 AMD 老项目时按版本分 context。

### 模式 5：nameToUrl 路径解析（paths / pkgs / bundles）

**问题场景**：模块 ID 怎么映射到 URL？CDN 路径 vs 本地路径？多版本号要替换？同名模块走不同 bundle？

**解决方案**：`nameToUrl` 三套策略独立：
- `paths`：最长前缀匹配（`'jquery': '//cdn.com/jquery'`）
- `packages`：整包替换 main（`'pkg': { main: 'lib/main' }`）
- `bundles`：跳转 bundle 入口（`'jquery': ['jquery-private']`）

```js
requirejs.config({
  baseUrl: '/js',
  paths: { jquery: '//cdn.com/jquery/3.6.0/jquery.min' },
  packages: [{ name: 'backbone', main: 'backbone-min' }],
  bundles: { 'app-bundle': ['app/main', 'app/utils'] }
})
```

**关键参数**：
- `paths` 数组：fallback 顺序（CDN1 → CDN2 → 本地）
- `pkgs` 数组：`{ name, main, location }` 三字段
- `bundles` 字典：模块名 → 所属 bundle 名
- 解析顺序：bundles → pkgs → paths → baseUrl

**最佳实践**：用 `paths` 数组做 CDN 故障转移（第一个失败试第二个）；`bundles` 配合 r.js 合并优化；新项目用 bundler alias 替代。

---

## 第二段：加载器与浏览器适配

### 模式 6：req.load 的 script 注入策略

**问题场景**：浏览器唯一加载 JS 的方式是 `<script>` 标签；如何追踪加载完成（`onload` / `onreadystatechange`）？如何不阻塞渲染？

**解决方案**：`req.load(context, moduleName, url)` 注入 `<script>`，`onload`（W3C）或 `onreadystatechange`（IE）触发 `completeLoad`。

```js
req.load = function (context, moduleName, url) {
  var node = config.isBuild ? ... : doc.createElement('script')
  node.type = 'text/javascript'
  node.charset = 'utf-8'
  node.async = true
  node.setAttribute('data-requiremodule', moduleName)
  if (context.config.onNodeCreated) context.config.onNodeCreated(node, url, moduleName)
  node.addEventListener('load', context.onScriptLoad, false)
  node.addEventListener('error', context.onScriptError, false)
  node.src = url
  head.appendChild(node)
  return node
}
```

**关键参数**：
- `node.async = true`：不阻塞
- `data-requiremodule` 属性：记录归属（用于匿名模块绑定）
- `onNodeCreated` 钩子：用户可拦截 script 标签创建
- 完成后 `head.removeChild(node)` 释放 DOM

**最佳实践**：用 `onNodeCreated` 注入 crossorigin / integrity（子资源完整性）；监听 `error` 事件做 fail-fast；r.js 打包后 `req.load` 可短路（直接走 `context.makeRequire`）。

### 模式 7：onScriptLoad 与 IE6+ 兼容

**问题场景**：IE6-9 用 `attachEvent` 监听 script 加载；IE8 的 `attachEvent.toString()` 不输出 `[native code]`；Opera 有 `attachEvent` 但行为是标准 DOM。

**解决方案**：`node.attachEvent.toString().indexOf('[native code')` 这个看起来像 hack 的字符串嗅探，**排除掉 IE8 polyfill 注入** + Opera 误判。

```js
// require.js:1912-1944
if (node.attachEvent &&
    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
    !isOpera) {
  useInteractive = true
  node.attachEvent('onreadystatechange', context.onScriptLoad)
}
```

**关键参数**：
- `'[native code'`（注意缺右括号）：兼容 IE8 不完整 toString 输出
- `isOpera` 排除：Opera 有 `attachEvent` 但行为标准
- `useInteractive`：IE 路径走 `onreadystatechange`
- W3C 路径走 `addEventListener('load', ...)`：标准浏览器

**最佳实践**：现代项目放弃 IE 兼容（接受损失 1% 用户）；必须兼容时用 polyfill service 而非源码 string sniffing；这种"feature detect by quirk"是历史包袱的负资产。

### 模式 8：completeLoad + 匿名模块绑定

**问题场景**：浏览器执行 `<script src="a.js">` 时，require.js 没法"提前"知道脚本里 `define()` 的模块名；用户写匿名 `define([deps], factory)` 怎么归属？

**解决方案**：`define()` 把匿名包 `[null, deps, factory]` 塞进 `defQueue`，等 `onload` 触发时（`<script>` 的 `data-requiremodule` 已注入）把 `null` 替换为真实 moduleName。

```js
// require.js:1567-1616
completeLoad: function (moduleName) {
  var found, args
  while (defQueue.length) {
    args = defQueue.shift()
    if (args[0] === null) {
      args[0] = moduleName
      if (found) break   // 已绑过同名 anon，第二个就丢弃
      found = true
    } else if (args[0] === moduleName) {
      found = true
    }
    callGetModule(args)
  }
}
```

**关键参数**：
- `defQueue`：等待绑定的 `define()` 调用队列
- `data-requiremodule` 属性：归属依据
- `found` 标志：处理连续两个 anon 都找不到归属
- 第二个 anon 被 `break` 丢弃（避免重复注册）

**最佳实践**：写 AMD 模块时**最好显式写 id**（避免依赖 script 加载顺序）；匿名模块必须有 `<script data-requiremodule>` 配合；r.js 打包后匿名模块归属自动处理。

### 模式 9：shim 兼容层（非 AMD 老代码接入）

**问题场景**：jQuery 1.x 时代是 `window.$` 全局，不是 AMD 模块；怎么把"老代码"接入 AMD 系统？

**解决方案**：`shim: { jquery: { exports: '$' } }` 告诉 requirejs：这个模块"load 完后从全局变量 `$` 取 export"。

```js
requirejs.config({
  shim: {
    'jquery': { exports: '$' },
    'jquery-ui': ['jquery'],                 // 简单依赖
    'backbone': {
      deps: ['jquery', 'underscore'],
      exports: 'Backbone',
      init: function ($, _) {                // init 优先于 exports
        return Backbone.noConflict()         // 解决 $ 冲突
      }
    }
  }
})
```

**关键参数**：
- `shim[name].exports`：load 完后从 window 取这个变量
- `shim[name].deps`：声明依赖（load 顺序）
- `shim[name].init`：自定义工厂（`init` 优先于 `exports`）
- 适用：jQuery 1.x / Backbone / 老的 IIFE 库

**最佳实践**：所有"非 AMD 库"都走 shim（不要手写 wrapper）；`init` 用来 `noConflict()` 解决多版本全局变量冲突；新项目用 ESM + interop 默认导出。

### 模式 10：path fallback（CDN 故障转移）

**问题场景**：CDN 1 挂了，业务想"自动切到 CDN 2"；多源备份是高可用的常见需求；try/catch 写在业务代码里太丑。

**解决方案**：`paths: { jquery: ['//cdn1.cdn.com/jquery', '//cdn2.cdn.com/jquery', '/local/jquery'] }` 数组顺序就是 fallback 顺序，第一个失败自动试第二个。

```js
requirejs.config({
  paths: {
    jquery: [
      '//cdn1.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min',
      '//cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min',
      '/static/lib/jquery.min'
    ]
  }
})
```

**关键参数**：
- 数组顺序：CDN1 → CDN2 → 本地
- 失败触发：`onerror` 事件 → `nameToUrl` 重试下一项
- `hasPathFallback` 标志：当前正在 fallback 中
- 全部失败：`waitSeconds` 后抛 `timeout` 错

**最佳实践**：3 个 fallback 是经验值（1 主 + 2 备）；生产环境 CDN + 本地双备份（CDN 全部挂时本地兜底）；用 SRI（Subresource Integrity）防止 CDN 被污染。

---

## 第三段：插件体系与扩展点

### 模式 11：插件契约（text / i18n / domReady）

**问题场景**：加载 `.html` 模板、`.json` 数据、CSS 图片资源；等待 DOMContentLoaded；这些"非 JS 模块"怎么用同一套 AMD 接口？

**解决方案**：AMD 插件 = 模块 ID 后面带 `!pluginName`（`'text!./template.html'`）。`callPlugin` 调用 `plugin.load(name, req, load, config)`，`load(export)` 把结果喂回。

```js
define('text!./template.html', ['module', 'require'], function (module, require) {
  return {
    load: function (name, req, load, config) {
      var url = req.toUrl(name)
      fetch(url).then(r => r.text()).then(text => load(text))
    }
  }
})
// 用法
require(['text!./template.html', 'domReady!'], function (html, ready) {
  // html 是字符串，ready 是 DOMContentLoaded 时机
})
```

**关键参数**：
- 模块 ID 语法：`'pluginName!resource-path'`
- 插件模块导出 `load(name, req, load, config)` 方法
- `load(export)` 把结果喂回依赖图
- 官方插件：`text` / `i18n` / `domReady`（独立仓库）

**最佳实践**：所有"非 JS 资源"用 AMD 插件（统一接口）；插件开发遵循 `load(name, req, load, config)` 契约；新项目用 bundler 内置 loader（webpack `text-loader`）替代。

### 模式 12：fromText（字符串当模块）

**问题场景**：开发期想跑一段 CoffeeScript / TypeScript / JSX，但没构建工具；怎么在浏览器里"动态编译"？

**解决方案**：`fromText: function (text) { return transform(text) }` 把字符串转成 `Function('exports', 'require', 'module', text)`，让 AMD 把它当模块执行。

```js
// CoffeeScript 插件简化
define('cs', ['module'], function (module) {
  return {
    fromText: function (text) {
      return CoffeeScript.compile(text)   // .cs → .js
    }
  }
})
// 加载 .cs 文件
require(['cs!./module.cs'], function (mod) { /* mod 是编译后执行的结果 */ })
```

**关键参数**：
- `fromText(text)`：字符串 → JS 字符串
- 内部用 `new Function('exports', 'require', 'module', jsText)` 执行
- 适用：开发期 / 教学 / 沙箱
- 不适用：性能敏感（每次都编译）

**最佳实践**：开发期用 fromText（快速迭代）；生产环境预编译（r.js / esbuild）；不要在 hot path 用 fromText（编译开销 100ms+）。

### 模式 13：CommonJS 互转（Node 适配器）

**问题场景**：Node 端 requirejs 跑 AMD 模块，模块作者写 `module.exports = ...`；怎么互转？

**解决方案**：`nodeRequire` 把 Node 内置 require 注入；`module.exports` 在 AMD 包装内被自动转成 `return`。

```js
// Node 端
var requirejs = require('requirejs')
requirejs.config({ baseUrl: __dirname, nodeRequire: require })
requirejs(['./my-cjs-module'], function (mod) { /* mod 是 module.exports */ })
// my-cjs-module.js（CJS 写法）
module.exports = { foo: 'bar' }   // 自动适配
```

**关键参数**：
- `nodeRequire`：注入 Node 的 `require`
- CommonJS wrapper：`function (exports, require, module) { ... }`
- AMD 包装：`(function (require, exports, module) { ... })(...)`
- 双向兼容：AMD 写法 `define()` / CJS 写法 `module.exports` 都行

**最佳实践**：跨 Node + 浏览器项目用 AMD 写法（避免 CJS 同步加载语义冲突）；纯 Node 项目用 CJS 或 ESM；新项目用 ES Modules 一统江湖。

### 模式 14：错误体系（makeError + 文档 URL 绑定）

**问题场景**：loader 内部错误（脚本加载失败、超时、循环依赖）抛什么错？开发者看到 console error 怎么知道怎么修？

**解决方案**：`makeError(name, msg)` 内部抛 `Error`，stack 自动指向调用点；`name` 同时拼到文档 URL `'https://requirejs.org/docs/errors.html#' + id`。

```js
// require.js:168
function makeError(id, msg, err, requireModules) {
  throw new Error(msg + (
    'More info: https://requirejs.org/docs/errors.html#' + id
  ))
}
// 抛错示例
makeError('notloaded', 'Module name "x" has not been loaded yet for context: _')
makeError('timeout', 'Load timeout for modules: ' + mods)
makeError('circular', 'Circular dependency: ' + cycle)
```

**关键参数**：
- 错误 ID 列表：`notloaded` / `timeout` / `circular` / `scripterror` / `definecmd` / `notdefined` 等
- 文档 URL 一一对应：每个 ID 都有专门章节
- `req.onError = defaultOnError`：用户可整体替换
- `requireModules` 列表：出错时涉及的模块（用于 `onError` 遍历）

**最佳实践**：任何 SDK 都该学"错误 ID → 文档 URL"绑定（console error 可点开教学）；用 `req.onError` 做错误聚合（统一上报 Sentry）；自定义错误继承 `Error` 且 stack 准确。

### 模式 15：超时与资源回收

**问题场景**：网络慢导致 script 加载卡 30s；用户以为页面卡死；超大应用 registry 内存爆炸。

**解决方案**：`waitSeconds: 7` 默认 7s 超时；`cleanRegistry(id)` 在 `defined` 后立即清理（不是 destroy，是解除引用让 GC 回收）。

```js
requirejs.config({ waitSeconds: 10 })  // 全局超时
// 自定义超时（per-script）
s.giveRes = function (config) {
  config.waitSeconds = 30  // 长 timeout 用于大文件
}
// cleanRegistry
cleanRegistry: function (id) {
  delete registry[id]                // 解除 Module 引用
  delete enabledRegistry[id]
  delete undefEvents[id]
}
```

**关键参数**：
- `waitSeconds`：默认 7 秒
- `cleanRegistry` 时机：模块 `defined` 后立即执行
- 内存模型：registry 弱引用，GC 可回收
- 错误：超时抛 `'Load timeout for modules: ...'`

**最佳实践**：production `waitSeconds=10`；大文件单独配置 `giveRes` 拉长 timeout；`cleanRegistry` 让 AMD 跑大型应用不爆内存（vs 把 Module 全留 registry）。

---

## 第四段：工程实践与历史局限

### 模式 16：r.js 构建优化器

**问题场景**：开发期按模块拆 100 个 `<script>` 没问题，生产期 100 个 HTTP 请求慢爆；怎么合并 + 压缩？

**解决方案**：`r.js` 是 Node 端构建工具，读 AMD 配置把所有模块合并成单文件（按 bundle 分组）+ uglify 压缩。

```bash
# 装 r.js
npm install -g requirejs
# 跑构建
r.js -o baseUrl=js name=main out=main-built.js
# 或用 build.js 配置
r.js -o build.js
```

**关键参数**：
- `baseUrl` / `name`：入口模块
- `out`：输出文件
- `bundlesConfig`：自定义 bundle 分组
- `optimize: 'uglify'` / `'uglify2'` / `'none'`
- `include`：强制包含的模块
- `exclude`：强制排除的模块

**最佳实践**：生产构建用 r.js 把所有模块压成单文件（HTTP 请求从 100 减到 1）；`exclude` 掉已通过 CDN 加载的库（jQuery）；r.js 2015 后实质停更，新项目用 esbuild / rollup 替代。

### 模式 17：测试体系（DOH 框架 + 100+ 场景）

**问题场景**：loader 行为复杂（依赖图、状态机、循环依赖、IE 兼容）；手动测成本高；CI 怎么保证不回归？

**解决方案**：Dojo's DOH（Dojo Objective Harness）框架 + 638 个测试 fixture + 100+ 场景（circular / mapConfig / plugins / i18n / domReady / shim / nestedRequire）。

```bash
# 启动静态服务器
python -m http.server 8080
# 浏览器打开 DOH runner
# http://localhost:8080/tests/index.html
# 100+ 场景自动跑
```

**关键参数**：
- DOH：`tests/doh/` 自包含，零依赖
- 测试 fixture：`tests/` 638 个文件
- 场景覆盖：circular / mapConfig / plugins / i18n / domReady / shim / nestedRequire / 错误处理
- CI 现状：Travis 仅 lint，功能测试需手工跑 6+ 浏览器

**最佳实践**：浏览器代码用 Karma / Cypress 替代 DOH（自动 e2e）；CI 跑真实浏览器矩阵（BrowserStack）；AMD 项目维护时优先加核心场景测试（circular / shim / plugins）。

### 模式 18：data-main 入口与配置继承

**问题场景**：HTML 标签要驱动整个应用入口；不想在 `<script>` 之外再多发一个 `require.config()` 的 HTTP 请求。

**解决方案**：`<script data-main="js/main" src="require.js"></script>` 让 require.js 从自己的 `<script>` 标签读 `data-main`，反推 baseUrl，再注入 `<script src="js/main.js">`。

```html
<!-- 唯一需要写的 script 标签 -->
<script data-main="js/main" src="require.js"></script>
<!-- require.js 内部：eachReverse(scripts) 找自己 → 读 data-main = "js/main" -->
<!-- → cfg.deps = ["main"]; 注入 <script src="js/main.js"> -->
<!-- → main.js 跑 require.config({...}) 继续配置 -->
```

**关键参数**：
- `data-main`：HTML 标签属性 = 入口模块名
- `eachReverse(scripts())`：从后往前找 require.js 自己的 `<script>`
- `cfg.deps = ['main']`：自动加载入口
- `main.js` 内部 `require.config({...})`：补配置

**最佳实践**：用 `data-main` 驱动入口（省一次 HTTP）；`main.js` 第一行就 `require.config({...})`；新项目用 `<script type="module" src="main.js">` 替代（ESM 原生入口）。

### 模式 19：与 ES Modules + Bundler 对比

**问题场景**：2026 年用 AMD 还是 ES Modules？RequireJS 还能用吗？什么场景选什么？

**解决方案**：
- **新项目 100% 用 ESM** + bundler（Vite / esbuild / webpack）—— 编译期静态分析 + tree-shaking
- **维护 AMD 老项目**继续用 requirejs（迁移成本 > 收益）
- **IE6-9 兼容**才用 AMD（ESM 浏览器原生要求 Edge 79+）
- **多版本共存**场景 AMD 仍有优势（context 隔离）

```js
// AMD 写法（2010 风格）
define(['jquery'], function ($) {
  return { greet: () => $('#app').text('Hi') }
})
// ESM 写法（2020 风格）
import $ from 'jquery'
export const greet = () => $('#app').text('Hi')
```

**关键参数**：
- AMD：运行时解析（动态 `define()`），IE6+ 支持
- ESM：编译期静态分析（`import` 提升），现代浏览器原生
- Bundler 角色：把 ESM 编译成单文件（生产），开发期按需加载
- 体积：r.js 5.9KB gzip；ESM + bundler 0KB（运行时浏览器原生）

**最佳实践**：新项目**永远用 ESM**（Vite / Next.js 默认）；维护 AMD 项目不强行迁移（成本爆炸）；用 AMD 的多 context 隔离解决"渐进式升级"是 ESM 缺失的能力。

### 模式 20：现代意义与历史局限

**问题场景**：requirejs 还有什么现代价值？哪些设计在 2026 年仍然适用？哪些是负资产？

**解决方案**：
- **必偷 3 件**：`makeModuleMap` 唯一 ID 生成 / `path fallback` 数组配置 / 错误 ID → 文档 URL 绑定
- **必避 3 坑**：2145 行单文件 IIFE / `globalDefQueue` 跨 context 共享 / 字符串嗅探
- **状态机模式**仍适用（手写 deferred callback 比 Promise 库更可控）
- **多 context 隔离**比 ESM namespace 更强（AMD 唯一杀手锏）

```js
// 现代：手写状态机仍可读
const states = { idle: 'idle', loading: 'loading', resolved: 'resolved', error: 'error' }
let state = states.idle
function transition(next) {
  if (isValid(state, next)) state = next
  else throw new Error(`Invalid: ${state} → ${next}`)
}
```

**关键参数**：
- 必偷：`makeModuleMap`（ID 化）、`path fallback`（数组 fallback）、`makeError`（错误 URL 绑定）
- 必避：单文件 IIFE（不利于 tree-shake）、跨 context 全局（多版本冲突）、string sniffing（polyfill 误判）
- 复用：状态机 + 闭包（显式可见，调试友好）
- 局限：v2.3.8 长期停更，Travis Node 0.12，r.js 停更，实质"个人英雄式"维护

**最佳实践**：把 requirejs 视为"AMD 时代的活化石"，**学习其状态机 + context 隔离设计**而非搬运代码；新项目用 ESM + Vite；用 `path fallback` 模式做 CDN 故障转移（任何 SDK 都适用）；用 `makeError` 模式做"console error 可点开教学"。

---

## 附录：5 段必读代码

1. `require.js:236-257` — `trimDots()` 路径规范（`'./a/../b'` → `'b'`，保留 `..` 边界）
2. `require.js:727-792` — `Module` 构造 + `init`（状态机初始化 + `deferred callback` 模式）
3. `require.js:804-836` — `Module.fetch + load`（shim / plugin / 普通 JS 三路分发）
4. `require.js:1567-1616` — `completeLoad + 匿名模块绑定`（`defQueue` + `data-requiremodule`）
5. `require.js:1912-1944` — `req.load IE 检测`（历史包袱最重，理解"浏览器兼容代码为什么丑"）

## 一句话总结

requirejs = 88KB 单文件 + 零依赖 + 6 态 Module 状态机 + 多 context 隔离，在 IE6+ 浏览器里实现完整 AMD 模块系统；2026 年已被 ES Modules + bundler 取代，但其 `makeModuleMap` ID 化、`path fallback` 数组配置、`makeError` 错误 URL 绑定、`multi-context` 多版本隔离四大设计仍是前端模块系统的奠基范式。
