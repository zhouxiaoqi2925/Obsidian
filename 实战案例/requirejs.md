# RequireJS - 浏览器端 AMD 异步模块加载器

**GitHub**: requirejs/requirejs
**Star**: 12k+
**语言**: JavaScript
**主题**: amd、module-loader、browser、async
**适用场景**: 传统 jQuery 项目、AMD 模块化、浏览器模块加载、ES5 老项目

---

## 一、基础范式

### 模式 1 · AMD 规范（Asynchronous Module Definition）

**问题场景**：浏览器端无模块系统，多个 `<script>` 全局污染 + 依赖顺序问题。

**解决方案**：AMD 规范用 `define([deps], factory)` 异步定义模块，`require([deps], factory)` 异步加载；先加载依赖再执行 factory。

**关键参数**：
- `define([deps], factory)`
- `require([deps], factory)`
- 异步加载
- 浏览器原生
- 0 全局

**最佳实践**：所有 jQuery / 传统 JS 项目用 AMD 模块化，告别全局污染。

### 模式 2 · define 三种签名

**问题场景**：模块定义有 3 种形式（无依赖 / 有依赖 / 简化对象）。

**解决方案**：`define(factory)`（无依赖）/ `define([deps], factory)`（有依赖）/ `define({ name: 'value' })`（简化对象）；RequireJS 自动识别。

**关键参数**：
- `define(factory)`
- `define(deps, factory)`
- `define({...})`
- 简化对象
- 自动识别

**最佳实践**：所有 AMD 模块用 `define` 工厂，3 种签名按需选择。

### 模式 3 · 入口配置（require.config）

**问题场景**：路径别名 / 依赖映射 / 打包版本切换。

**解决方案**：`require.config({ baseUrl: '/js/', paths: { jquery: 'lib/jquery' }, shim: { 'underscore': { exports: '_' } } })` 统一配置。

**关键参数**：
- `baseUrl`
- `paths` 别名
- `shim` 老库适配
- `deps` 启动模块
- `waitSeconds`

**最佳实践**：所有 AMD 项目用 `require.config` 集中管理路径。

### 模式 4 · shim 非 AMD 库适配

**问题场景**：jQuery / Backbone / Underscore 这些老库没有 AMD 接口。

**解决方案**：`shim: { 'backbone': { deps: ['underscore', 'jquery'], exports: 'Backbone' } }` 声明依赖 + 导出全局变量。

**关键参数**：
- `deps` 依赖
- `exports` 全局名
- `init` 初始化
- 老库适配
- 0 修改源码

**最佳实践**：所有 jQuery 老项目用 shim 接入 AMD。

### 模式 5 · 优化器（r.js + almond）

**问题场景**：开发时多文件 AMD 慢，生产需要合并。

**解决方案**：`r.js` Node 命令行 `r.js -o baseUrl=js name=main out=main-built.js` 合并 + 压缩；`almond` 是 1KB 极简 AMD 加载器替代 RequireJS 用于生产。

**关键参数**：
- `r.js` 命令行
- 合并 + 压缩
- `almond` 1KB
- 生产构建
- 0 运行时开销

**最佳实践**：所有 AMD 项目用 r.js + almond 构建生产版本。

---

## 二、扩展范式

### 模式 6 · CommonJS 兼容（simple-wrap）

**问题场景**：Node.js 项目用 `require('module')`，想在浏览器用。

**解决方案**：RequireJS 1.x 内置 `simple-wrap` 或 r.js 转换 `module.exports = ...` 为 AMD；现代项目用 Browserify / Webpack 替代。

**关键参数**：
- `simple-wrap`
- `module.exports` → AMD
- r.js 转换
- Node + 浏览器
- 桥接

**最佳实践**：新项目用 Browserify / Webpack 替代，老项目保留 RequireJS 桥接。

### 模式 7 · 动态加载（require([deps], cb)）

**问题场景**：按需加载（路由切换时加载组件）。

**解决方案**：`require(['app/dashboard'], function(Dashboard) { Dashboard.init(); })` 运行时异步加载；jQuery 路由 / Backbone Router 配合。

**关键参数**：
- `require([deps], cb)`
- 异步加载
- 按需
- 0 阻塞
- 性能优

**最佳实践**：所有大项目用按需加载，首屏 < 200KB。

### 模式 8 · 错误处理（requirejs.onError）

**问题场景**：模块加载失败（404 / 解析错误）需要统一处理。

**解决方案**：`requirejs.onError = function(err) { ... }` 全局错误回调；`err.requireType` 区分类型（`timeout` / `nodefine` / `scripterror`）。

**关键参数**：
- `requirejs.onError`
- `err.requireType`
- 错误分类
- 优雅降级
- 监控上报

**最佳实践**：所有 AMD 项目配 onError，统一错误处理。

### 模式 9 · 文本插件（text!）

**问题场景**：需要加载 HTML 模板 / 文本文件。

**解决方案**：`require('text!templates/user.html')` 加载文本为字符串；插件自动处理；CSS 插件 `css!` / JSON 插件 `json!`。

**关键参数**：
- `text!` 插件
- HTML 模板
- `css!` 注入样式
- `json!` 解析 JSON
- 多插件

**最佳实践**：所有 jQuery 模板项目用 text! 插件，告别模板字符串拼接。

### 模式 10 · 国际化插件（i18n!）

**问题场景**：多语言字符串管理。

**解决方案**：`require('i18n!nls/strings')` 加载对应语言包；`baseUrl + nls/` 目录按浏览器语言自动选；`root.nls/` 兜底。

**关键参数**：
- `i18n!` 插件
- `nls/` 目录
- 自动选语言
- 兜底
- 0 配置

**最佳实践**：所有多语言项目用 i18n! 插件，自动选语言。

---

## 三、进阶范式

### 模式 11 · 循环依赖处理

**问题场景**：A 依赖 B，B 依赖 A，AMD 怎么处理。

**解决方案**：`require(['a'], function(a) { ... })` 在回调内使用 a，部分模块用 late require；工厂函数延迟到回调内。

**关键参数**：
- 循环依赖
- late require
- 工厂内延迟
- 部分导出
- 0 死锁

**最佳实践**：避免循环依赖，必须时用 late require 模式。

### 模式 12 · 路径解析优先级

**问题场景**：同名模块在不同目录，怎么选。

**解决方案**：RequireJS 路径解析顺序：① 显式 `var $ = require('jquery')` ② `paths` 配置 ③ `packages` 配置 ④ `baseUrl` 相对；先到先得。

**关键参数**：
- 显式 > paths
- packages
- baseUrl
- 优先级
- 可预测

**最佳实践**：所有 AMD 项目用 `paths` 显式映射，避免歧义。

### 模式 13 · URL Args 缓存破坏

**问题场景**：生产部署后浏览器缓存老 JS。

**解决方案**：`urlArgs: 'v=' + version` 每次发版改 version，所有 URL 变 `main.js?v=2.1.0` 强制刷新；`urlArgs: 'bust=' + (new Date()).getTime()` 开发用时间戳。

**关键参数**：
- `urlArgs`
- 版本号
- 时间戳
- 缓存破坏
- 0 老版本

**最佳实践**：所有 AMD 项目配 urlArgs，发布无忧。

### 模式 14 · Map 配置（私有模块 / 别名）

**问题场景**：某个文件想用不同版本模块。

**解决方案**：`map: { 'app/a': { jquery: 'jquery-private' }, '*': { underscore: 'underscore1' } }` 映射模块到不同版本；`'*'` 通用 / `'app/a'` 限定模块。

**关键参数**：
- `map`
- `'*'` 通用
- 模块限定
- 版本切换
- 0 全局污染

**最佳实践**：所有多版本依赖项目用 map 配置隔离。

### 模式 15 · Node.js 端使用（r.js / amd-loader）

**问题场景**：Node.js 想直接跑 AMD 模块。

**解决方案**：`r.js` 自带 Node 入口 `r.js -run`；`amd-loader` 钩子 `require('amd-loader')` 后 `require('./module')` 直接加载 AMD 文件。

**关键参数**：
- `r.js` Node
- `amd-loader`
- AMD 文件 Node 跑
- 服务端渲染
- 0 转换

**最佳实践**：所有 SSR 项目用 amd-loader 在 Node 跑 AMD。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 RequireJS 项目。

**解决方案**：7 件套：① `<script src="require.js" data-main="js/main">` 入口 ② `require.config` 配置 ③ `app/` 目录 ④ `define` 模块 ⑤ `r.js` 构建 ⑥ `almond` 1KB 加载 ⑦ `urlArgs` 缓存破坏。

**关键参数**：
- data-main
- require.config
- app/
- define
- r.js
- almond
- urlArgs

**最佳实践**：所有 jQuery / 传统项目用 7 件套 + RequireJS。

### 模式 17 · jQuery + RequireJS 集成

**问题场景**：jQuery 老项目怎么接入 AMD。

**解决方案**：`shim: { jquery: { exports: '$' } }` + `paths: { jquery: 'lib/jquery' }`；业务代码 `define(['jquery'], function($) { ... })` 替代全局 $。

**关键参数**：
- `shim.jquery`
- `paths.jquery`
- `define([jquery])`
- 替代全局
- 0 侵入

**最佳实践**：所有 jQuery 项目用 shim 接入 AMD，平滑迁移。

### 模式 18 · 性能优化 5 招

**问题场景**：AMD 项目性能问题。

**解决方案**：5 招优化：① r.js 合并 ② almond 替换 ③ `require` 动态加载 ④ 压缩 JS（UglifyJS）⑤ CDN 加速 + urlArgs 缓存破坏。

**关键参数**：
- 合并
- almond
- 按需
- 压缩
- CDN

**最佳实践**：5 招组合，AMD 项目首屏 < 500KB。

### 模式 19 · 与 ES Modules / Browserify / Webpack 对比

**问题场景**：浏览器模块系统选型。

**解决方案**：RequireJS 定位「AMD 异步 + 浏览器原生」适合传统项目；ES Modules 是「浏览器 + Node 原生」是未来；Browserify / Webpack 把 CommonJS / ESM 打包到浏览器；RequireJS 已逐渐被 Webpack / Vite 替代。

**关键参数**：
- 现代度：ESM > Webpack > Browserify > RequireJS
- 学习曲线：RequireJS < ESM < Browserify < Webpack
- 生态：Webpack > ESM > RequireJS > Browserify
- 适合老项目：RequireJS > Browserify > Webpack > ESM

**最佳实践**：新项目用 ESM / Webpack / Vite，老 jQuery 项目保留 RequireJS。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork RequireJS 做模块加载器。

**解决方案**：7 天分 5 步：① 动态 `<script>` 注入 ② `define` 模块注册表 ③ `require` 依赖加载 ④ 路径解析 + 缓存 ⑤ `r.js` 构建器。

**关键参数**：
- Day 1: script 注入
- Day 2: define
- Day 3: require
- Day 4: 路径
- Day 5: r.js
- Day 6-7: 文档

**最佳实践**：7 天复刻「极简 AMD」，完整 RequireJS 复刻需要 2 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\requirejs\`
- **大小**: ~3 MB
- **总文件数**: 数十 JS 文件
- **关键 commit**: v2.3.x
- **作者**: James Burke + 社区
- **许可**: MIT

## 一句话总结

RequireJS 用「AMD 异步模块定义 + 浏览器原生 + r.js 合并 + shim 老库适配」让传统 jQuery 项目告别全局污染，是 Webpack 时代之前浏览器模块化的事实标准。
