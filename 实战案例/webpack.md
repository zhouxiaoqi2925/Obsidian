# webpack - 65k Star 工业级打包器的 Tapable Hook 系统与 Module/Chunk 图算法双引擎典范

**GitHub**: webpack/webpack
**Star**: ~65k
**语言**: JavaScript
**主题**: 模块打包器、Tapable Hook、Loader/Plugin 双协议、Module Federation、持久化缓存
**适用场景**: 静态资源打包、JS/CSS/图片/字体统一处理、Module Federation 微前端、构建系统

## 第一段：核心机制

### 模式 1：Tapable Hook 系统 11 种类型

**问题场景**：编译系统有 200+ 阶段（`beforeRun`/`run`/`compile`/`make`/`emit` 等），每个阶段都需可介入——单纯 Plugin 数组按序调用无法表达并发、熔断、瀑布流等需求。

**解决方案**：Webpack 自创 `tapable` 库（独立 npm 包），提供 11 种 Hook：
- `SyncHook` 同步无返回
- `SyncBailHook` 同步熔断（返回非 undefined 终止）
- `SyncWaterfallHook` 同步瀑布（上一步结果传给下一步）
- `AsyncSeriesHook` 异步串行
- `AsyncSeriesBailHook` 异步串行熔断
- `AsyncSeriesWaterfallHook` 异步瀑布
- `AsyncParallelHook` 异步并行

`compiler.hooks.xxx.tap(name, fn)` 注册回调，`call/callAsync` 触发。

**关键参数**：
- `tapable` 库（11 种 Hook）
- `tap(name, fn)` 注册
- `call` 同步触发
- `callAsync` 异步触发
- `Object.freeze(hooks)` 锁定

**最佳实践**：
- ✅ 选择合适 Hook 类型（`emit` 串行/`make` 并行）
- ✅ 用 `Object.freeze(hooks)` 防误改
- ✅ `tap` 时给清晰 `name`（调试可见）
- ✅ 熔断 Hook 用 Bail（return true 终止）
- ✅ 复用 `tapable` 库（vs 自创）

### 模式 2：Compiler vs Compilation 双层对象

**问题场景**：watch 模式下要支持"重启编译"——但又要复用配置、文件系统、缓存等全局资源。单一对象难区分"跨多次编译"与"单次编译"状态。

**解决方案**：Webpack 拆为双层：
- **Compiler**（`lib/Compiler.js`，600+ 行）——跨多次编译持有配置/缓存/文件系统/监听器
- **Compilation**（`lib/Compilation.js`，1500+ 行）——单次编译持有 ModuleGraph/ChunkGraph/模块/chunk 列表

watch 模式下，多 Compilation 共享一个 Compiler。Plugin 可在 `compiler.hooks.watchRun`（每次重启 watch）注册，也可在 `compilation.hooks.processAssets`（每次编译产物处理）注册。

**关键参数**：
- `Compiler` 全局对象
- `Compilation` 单次对象
- `compiler.hooks` 编译生命周期
- `compilation.hooks` 单次编译阶段
- watch 模式多 Compilation

**最佳实践**：
- ✅ Compiler 持跨编译状态（配置/缓存）
- ✅ Compilation 持单次编译状态（模块图）
- ✅ 缓存挂 Compiler（跨编译复用）
- ✅ 监听器挂 Compiler（避免泄漏）
- ✅ 自定义 Plugin 选择合适层级

### 模式 3：Module 抽象 + NormalModule/ContextModule/ExternalModule

**问题场景**：所有资源（JS/CSS/图片/字体/Node 内建）都是"模块"，但加载逻辑差异大——目录用 glob、外部模块不打进 bundle、容器模块跨应用共享。

**解决方案**：`Module` 是基类（`lib/Module.js`），持 `dependencies`/`blocks`/`variables`。子类：
- `NormalModule`（`lib/NormalModule.js`）——普通文件，走 loader
- `ContextModule`（`lib/ContextModule.js`）——目录 glob
- `ExternalModule`（`lib/ExternalModule.js`）——外部模块不打包
- `ContainerModule`（`lib/container/ContainerModule.js`）——Module Federation 容器

`Module.identifier()` 返回 `loader 路径 + resource 路径 + 依赖列表` 的哈希。

**关键参数**：
- `Module` 基类
- `NormalModule` 普通
- `ContextModule` 目录
- `ExternalModule` 外部
- `identifier()` 唯一标识

**最佳实践**：
- ✅ 不同模块类型拆为子类
- ✅ `_identifier` 懒加载 + 缓存
- ✅ `dependencies` 列表跟踪引用
- ✅ 外部模块不打包（`ExternalModule`）
- ✅ Module Federation 走 `ContainerModule`

### 模式 4：ModuleGraph + ChunkGraph 双图结构

**问题场景**：编译要做"循环依赖检测/tree-shaking/code-splitting"——但模块之间的引用是图，产物之间也是图。平面数据难做图算法。

**解决方案**：`ModuleGraph`（`lib/ModuleGraph.js`）跟踪模块与依赖关系；`ChunkGraph`（`lib/ChunkGraph.js`）跟踪 chunk 与模块包含关系。`ModuleProfile`/`Dependency`/`Connection` 等图节点。两个图都是惰性构建（用时算）。

**关键参数**：
- `ModuleGraph` 依赖图
- `ChunkGraph` 产物图
- `Module` 图节点
- `Dependency` 边
- `Connection` 实际连接

**最佳实践**：
- ✅ 把模块/产物建模为图
- ✅ 惰性构建（避免启动慢）
- ✅ 循环依赖在图上做 DFS 检测
- ✅ tree-shaking 在 ModuleGraph 标记未用
- ✅ splitChunks 在 ChunkGraph 做合并

### 模式 5：Chunk 产物块 + getModules 懒加载

**问题场景**：entry / splitChunks / dynamic import 都会产生多个 chunk；chunk 内模块列表是 O(n) 操作，每次访问重算性能差。

**解决方案**：`Chunk`（`lib/Chunk.js`）持 `id`/`name`/`files`/`modules`/`entryModule`/`runtime`。`getModules()` 懒加载——首次访问遍历 `ChunkGraph` 查表，结果缓存到 `_modules`。

**关键参数**：
- `Chunk` 产物块
- `files: string[]` 输出文件
- `modules: Module[]` 包含模块
- `runtime` 运行时 chunk
- `_modules` 懒加载缓存

**最佳实践**：
- ✅ Chunk 是输出单元（不是模块）
- ✅ `getModules` 懒加载 + 缓存
- ✅ `runtime` 区分 entry / async chunk
- ✅ `auxiliary` 标记辅助 chunk
- ✅ ChunkGraph 记录 chunk 间共享

## 第二段：Loader 与 Plugin

### 模式 6：Loader 链式转译（pitch + normal 双阶段）

**问题场景**：`.vue`/`.ts`/`.scss`/`.png` 等资源浏览器不认识——需要"转译器"把它们转成 JS 字符串。单一 loader 不够（scss 既要 sass 编译又要 postcss 处理）。

**解决方案**：Loader 链式调用——多个 loader 串联成 pipeline（如 `postcss-loader` → `sass-loader` → `css-loader` → `style-loader`）。Webpack 跑两阶段：
1. **Pitch 阶段**（反向）：`post.pitch → sass.pitch → css.pitch → style.pitch`——任一返回非 undefined 终止
2. **Normal 阶段**（正向）：`style(source) → css(source) → sass(source) → postcss(source)`——前者输出传给后者

**关键参数**：
- `loader` 链
- `pitch` 阶段（反向）
- `normal` 阶段（正向）
- `loaderContext` 上下文
- 终止（pitch 返回非 undefined）

**最佳实践**：
- ✅ 链式 loader 用 `use: [{loader, options}]`
- ✅ pitch 阶段做"拦截"（如 style-loader 注入）
- ✅ normal 阶段做"转译"
- ✅ loader 用 `this.cacheable()` 标记可缓存
- ✅ loader 必须 `return` 字符串或 Buffer

### 模式 7：Loader-runner 执行器 + 缓存

**问题场景**：loader 链是动态结构（按文件类型匹配），需要独立 runner 跑 loader 而非塞在 NormalModule 里。

**解决方案**：`lib/loader-runner.js` 独立模块跑 loader 链。`runLoaders({ resource, loaders, context, readResource }, (err, result) => {})` 接受资源/loaders 数组/上下文，回调返回 `{result, resource, sourceMap, dependencies}`。`cacheable: true` 时缓存到 `.cache/webpack`。

**关键参数**：
- `runLoaders` 独立执行器
- `resource` 资源路径
- `loaders` loader 数组
- `loaderContext` 上下文
- `.cache/webpack` 缓存目录

**最佳实践**：
- ✅ `runLoaders` 与 NormalModule 解耦
- ✅ 用 `this.cacheable()` 标记可缓存
- ✅ 缓存目录 `.cache/webpack`
- ✅ 异步 loader 用 `this.async()`
- ✅ loaderContext 提供 `addDependency` 等 API

### 模式 8：Plugin 接口 + apply(compiler) 模式

**问题场景**：第三方要介入编译过程（HtmlWebpackPlugin/ProgressPlugin/MiniCssExtractPlugin）——需要稳定的扩展接口。

**解决方案**：Plugin 是带 `apply(compiler)` 方法的对象——Webpack 初始化时 `plugin.apply(compiler)`，Plugin 内部 `compiler.hooks.xxx.tap(pluginName, fn)` 注册回调。`compiler.hooks` 暴露 200+ Hook 阶段。

```js
class MyPlugin {
  apply(compiler) {
    compiler.hooks.emit.tapAsync('MyPlugin', (compilation, cb) => {
      // 介入 emit 阶段
      cb();
    });
  }
}
```

**关键参数**：
- `apply(compiler)` 入口
- `compiler.hooks.xxx.tap` 注册
- `tap` 同步 / `tapAsync` 异步 / `tapPromise` Promise
- `pluginName` 调试标识
- Hook 阶段任意

**最佳实践**：
- ✅ Plugin 用 class + `apply(compiler)`
- ✅ `tap` 给清晰 `pluginName`（调试可见）
- ✅ 异步用 `tapAsync` 或 `tapPromise`
- ✅ 不在 Plugin 构造函数内做重活
- ✅ Plugin 内部状态用闭包或 WeakMap

### 模式 9：PROCESS_ASSETS_STAGE 11 个资产处理阶段

**问题场景**：多个 Plugin 都要介入资产处理（添加/删除/压缩/上传 sourcemap）——需要精细的阶段排序。

**解决方案**：Webpack 5 把所有资产处理统一到 `compilation.hooks.processAssets` 阶段，按 `PROCESS_ASSETS_STAGE_*` 排序：
- `ADDITIONAL` (0) 新增资产
- `PRE_PROCESS` (100) 预处理
- `DERIVED` (200) 派生
- `ADDITIONS` (500) 添加
- `OPTIMIZE` (700) 优化
- `OPTIMIZE_COUNT` (900) 大小优化
- `OPTIMIZE_COMPATIBILITY` (1100) 兼容性
- `OPTIMIZE_SIZE` (1300) 尺寸
- `DEV_TOOLING` (1500) 调试
- `OPTIMIZE_INLINE` (1700) 内联
- `REPORT` (5000) 报告
- `SUMMARIZE` (5500) 总结
- `OPTIMIZE_HASH` (5500) 哈希
- `OPTIMIZE_TRANSFER` (5700) 传输
- `ANALYSE` (9999) 分析
- `FINISH` (10000) 完成

**关键参数**：
- `processAssets` 阶段
- `PROCESS_ASSETS_STAGE_*` 11 阶段
- 数值排序
- `additionalAssets: true` 添加新资产
- 阶段间顺序

**最佳实践**：
- ✅ 用 stage 数值排序介入顺序
- ✅ 数字 100 间隔方便插入新阶段
- ✅ 报告类 Plugin 选 `REPORT`/`SUMMARIZE`
- ✅ 优化类 Plugin 选 `OPTIMIZE_*`
- ✅ 不要在 5 阶段内做重计算

### 模式 10：Module Federation 运行时模块共享

**问题场景**：微前端要跨应用共享组件/工具——iframe 太重，npm 共享要重新打包，CDN 共享难做版本控制。

**解决方案**：Module Federation 让"远程模块"在运行时加载。`ModuleFederationPlugin` 配置：
- `name` 应用名
- `filename` 入口文件名
- `exposes` 暴露模块
- `remotes` 远程应用
- `shared` 共享依赖（避免重复加载 React）

Webpack 构建时把 `exposes` 注册到 `remoteEntry.js`，运行时通过 `import('host@http://x/remoteEntry')` 加载。

**关键参数**：
- `ModuleFederationPlugin`
- `exposes: { './Button': './src/Button' }`
- `remotes: { host: 'host@url' }`
- `shared: { react: { singleton: true } }`
- `remoteEntry.js` 入口

**最佳实践**：
- ✅ `shared: { react: { singleton: true } }` 单例
- ✅ `exposes` 用语义化路径
- ✅ `remotes` 用版本化 URL
- ✅ 异步边界做 fallback
- ✅ 微前端跨应用首选 Module Federation

## 第三段：缓存与产物

### 模式 11：持久化缓存 + .cache/webpack 目录

**问题场景**：每次构建从头跑所有 loader，5s+ 起步——开发体验差。内存缓存又不能跨进程。

**解决方案**：Webpack 5 持久化缓存到文件系统（`.cache/webpack`）——基于 `mtime + content hash` 判定。第二次构建只跑变更的模块。`cache: { type: 'filesystem' }` 启用；默认 `memory` 仅内存。

**关键参数**：
- `.cache/webpack` 缓存目录
- `cache: { type: 'filesystem' }` 启用
- `mtime + content hash` 失效
- `buildDependencies` 构建依赖
- `cacheDirectory` 自定义路径

**最佳实践**：
- ✅ 启用 `cache: { type: 'filesystem' }`
- ✅ `buildDependencies` 声明配置依赖（config 变清缓存）
- ✅ CI 用 `cache: false`（避免脏缓存）
- ✅ `.gitignore .cache`
- ✅ 自定义 `cacheDirectory` 路径

### 模式 12：CacheFacade 缓存外观 + 多后端

**问题场景**：缓存有多种后端（memory/filesystem/Redis）——Plugin 用具体后端会耦合。

**解决方案**：`CacheFacade`（`lib/CacheFacade.js`）是统一接口——`get/has/merge/store/delete` 5 个方法。底层 `MemoryCache`/`FileCache`/`PluginCache` 多种实现。Plugin 用 `CacheFacade` 而非具体后端。

**关键参数**：
- `CacheFacade` 外观
- `get(key)` 取
- `store(key, data)` 存
- `merge` 合并
- 5 个方法

**最佳实践**：
- ✅ 用 `CacheFacade` 而非具体后端
- ✅ key 用 `etag` 而非路径（更稳定）
- ✅ 缓存不可变（store 副本）
- ✅ 大对象压缩（`serialize-javascript`）
- ✅ 缓存监控（`Cache.getStats()`）

### 模式 13：splitChunks 自动拆 chunk 策略

**问题场景**：大文件要拆成多个 chunk 实现并行加载——但拆太多又增加 HTTP 请求开销。怎么平衡。

**解决方案**：`optimization.splitChunks` 自动按规则拆 chunk：
- `chunks: 'all'/'async'/'initial'` 范围
- `minSize`/`maxSize` 大小限制
- `minChunks` 引用次数
- `cacheGroups` 缓存组（vendors/common）

默认值：vendors（node_modules）拆出，common（≥2 chunk 共享）拆出。Plugin 顺序介入 splitChunks 阶段。

**关键参数**：
- `splitChunks.chunks` 范围
- `minSize: 20000` 最小
- `maxSize: 244000` 最大
- `cacheGroups` 分组
- `name: true` 自动命名

**最佳实践**：
- ✅ 用默认 splitChunks 即可
- ✅ `maxSize: 244000` 强制分包
- ✅ `cacheGroups` 自定义拆分
- ✅ `name: false` 自动命名（避免冲突）
- ✅ 大 vendor 库拆为单独 chunk

### 模式 14：tree-shaking + sideEffects 标记

**问题场景**：import 整个 lodash 但只用 1 个函数——bundle 包含未用代码（体积大）。

**解决方案**：Webpack tree-shaking 走 ES Module 静态分析——`import { debounce } from 'lodash'` 只打包用到的导出。`package.json#sideEffects: false` 标记让 Webpack 安全删除未用 export。`mode: 'production'` 启用 minify。

**关键参数**：
- ES Module 静态分析
- `sideEffects: false` 标记
- `mode: 'production'` 启用 minify
- `usedExports` 标记
- `providedExports` 收集

**最佳实践**：
- ✅ 用 ES Module（`import`/`export`）
- ✅ `package.json` 加 `"sideEffects": false`
- ✅ 第三方库要 `sideEffects: false`（lodash-es 才行）
- ✅ 生产 mode 自动启用
- ✅ `usedExports` 配 `terser` 删除未用

### 模式 15：HMR 热更新 + module.hot.accept

**问题场景**：改一行代码要等 5s 重新打包——开发体验差。需要"保留状态"的热更新。

**解决方案**：HMR（Hot Module Replacement）让模块替换不刷新页面。`module.hot.accept('./foo', () => { /* 替换逻辑 */ })` 声明接受更新。Webpack-dev-server 推送 `hash` + `jsonp` 回调，客户端拉更新模块。

```js
if (module.hot) {
  module.hot.accept('./foo', () => {
    // 重新跑 foo 副作用
  });
}
```

**关键参数**：
- `module.hot.accept(deps, cb)` 接受
- `module.hot.decline()` 拒绝
- `module.hot.dispose(cb)` 清理
- `webpack-dev-server` 推送
- HMR runtime 客户端

**最佳实践**：
- ✅ 框架（React/Vue）用官方 HMR 适配器
- ✅ `module.hot.accept` 声明接受
- ✅ `dispose` 清理订阅
- ✅ 失败回退 `module.hot.decline()`
- ✅ 生产 build 不含 HMR 代码

## 第四段：工程实践

### 模式 16：webpack-cli + cac 命令注册

**问题场景**：CLI 工具要支持多子命令（`build`/`dev`/`init`/`info`）+ 多参数——需要稳健的 CLI 框架。

**解决方案**：`webpack-cli` 用 `cac` 命令注册。`webpack build --mode production` 解析为子命令 + 参数。`info` 输出环境信息（OS/Node/包版本）；`init` 引导生成 `webpack.config.js`。

**关键参数**：
- `cac` 命令注册
- `build`/`dev`/`init` 子命令
- `--mode`/`--entry` 标志
- `webpack info` 环境
- `webpack init` 引导

**最佳实践**：
- ✅ 用 `webpack-cli` 而非裸 webpack
- ✅ `webpack-cli init` 引导配置
- ✅ 配置文件优先（CLI 标志补充）
- ✅ `webpack --json > stats.json` 输出
- ✅ 多环境用 `--env`

### 模式 17：configuration schema + validation

**问题场景**：1000+ 配置项（`webpack.config.js`）——手写配置易写错，且无 IDE 提示。

**解决方案**：`schemas/webpackOptions.json` 是 JSON Schema 化的配置定义（所有合法字段/类型/默认值/枚举）。`validateSchema(webpackOptions, schema)` 在 build 前校验。VS Code 用 `webpack.schema.json` 给 IDE 自动提示。

**关键参数**：
- `schemas/webpackOptions.json`
- JSON Schema 校验
- `validateSchema`
- VS Code 自动提示
- `configuration` 字段

**最佳实践**：
- ✅ 用 TypeScript 类型 + JSON Schema
- ✅ 配 `webpack.schema.json` 给 IDE
- ✅ `validate` 字段关闭（仅信任配置）
- ✅ 拆分配置到 `webpack.common.js`/`dev.js`/`prod.js`
- ✅ 用 `webpack-merge` 合并

### 模式 18：Stats 输出 + bundle 分析

**问题场景**：bundle 体积大但不知道为什么——需要"哪些模块占了多少字节"的可视化。

**解决方案**：`webpack --json > stats.json` 输出完整构建统计。`webpack-bundle-analyzer` 读 stats 生成 treemap 可视化。`stats: 'normal'/'detailed'/'errors-only'` 控制输出详细度。

**关键参数**：
- `stats: 'normal'/'detailed'/'errors-only'`
- `--json` 输出
- `stats.json` 分析
- `webpack-bundle-analyzer` 可视化
- `assetsByChunkName`

**最佳实践**：
- ✅ 生产用 `webpack-bundle-analyzer`
- ✅ CI 输出 stats.json 上传
- ✅ `stats: 'errors-only'` 减少噪声
- ✅ 看 `assetsByChunkName` 拆 chunk
- ✅ 监控 `modules` 大小变化

### 模式 19：watch 模式 + 文件监听

**问题场景**：dev 模式要监听源文件变化自动重 build——但每次重启 compilation 性能差。

**解决方案**：`webpack --watch` 启 watch 模式——`Compiler.watch()` 持续监听。底层用 `chokidar` 监听文件系统（避免原生 `fs.watch` 的多平台 bug）。`watchOptions` 配置 `{ ignored, persistent, followSymlinks }`。

**关键参数**：
- `webpack --watch` 启 watch
- `Compiler.watch()` API
- `chokidar` 监听
- `watchOptions.ignored`
- `aggregateTimeout` 防抖

**最佳实践**：
- ✅ 用 `webpack --watch` 而非 `nodemon`
- ✅ `aggregateTimeout: 300` 防抖
- ✅ `ignored: /node_modules/`
- ✅ 大项目用 `webpack-dev-server`（HMR）
- ✅ CI 必关 watch

### 模式 20：LFX Foundation 治理 + 严格向后兼容

**问题场景**：Webpack 5.x 已发 100+ minor（5.0 → 5.95+）——严格向后兼容避免生态破坏。

**解决方案**：Webpack 团队坚持 0-breaking-change 政策——新功能用新 flag 启用（如 `experiments.outputModule`）。Linux Foundation（LFX）治理确保开放。`.changeset/` 记录每次发版；GitHub Actions 多 Node 版本矩阵测试。

**关键参数**：
- LFX 治理
- 严格向后兼容
- `experiments` 实验 flag
- `.changeset` 变更日志
- Node 16/18/20/22 矩阵

**最佳实践**：
- ✅ 严格向后兼容（不破坏 plugin）
- ✅ 新功能用 `experiments` 灰度
- ✅ 严格 semver（minor 不破坏）
- ✅ 多 Node 版本 CI 矩阵
- ✅ LFX 治理确保开放

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\webpack\` |
| 主语言 | JavaScript |
| License | MIT |
| 状态 | 5.95+ 活跃维护 |
| 解析时间 | 2026-06-02 |
| 核心目录 | `lib/Compiler.js`、`lib/Compilation.js`、`lib/Module.js`、`lib/NormalModule.js`、`lib/Chunk.js`、`lib/ChunkGraph.js`、`lib/loader-runner.js`、`lib/WebpackOptionsApply.js` |
| 关键基础设施 | Tapable Hook 11 类型、Compiler/Compilation 双层、Module/Chunk 双图、Loader 链式、Plugin 接口、PROCESS_ASSETS_STAGE 11 阶段、Module Federation、持久化缓存、HMR |
