# webpack-git - Webpack 5.107 源码层的 ModuleGraph 抽离 + AsyncQueue 队列驱动 + InnerGraph 深度 tree-shaking 典范

**GitHub**: webpack/webpack
**Star**: ~65k
**语言**: JavaScript
**主题**: 打包器源码、ModuleGraph、AsyncQueue、InnerGraph、CSS 提取
**适用场景**: 编译原理、构建工具开发、AST 分析、bundler 原理

## 第一段：基础范式

### 模式 1：ModuleGraph 抽离与依赖追踪

**问题场景**：Webpack 4 把 Module 关系散在 Compilation 中，N 个插件都要遍历 Module 找依赖——O(N) 重复遍历。

**解决方案**：Webpack 5 抽离 `ModuleGraph` 类作为"模块图谱"：每个 Module 关联一个 `ModuleNode`（含 `incomingConnections`/`outgoingConnections`）。`moduleGraph.getModule(dep)` 由依赖反查 Module。`moduleGraph.getDependencies(module)` 查 Module 的依赖。

**关键参数**：
- `compilation.moduleGraph`
- `ModuleGraph` 类
- `ModuleNode`/`Connection`
- `getModule(dep)`
- `getDependencies(module)`

**最佳实践**：用 `moduleGraph` 而非 `compilation.modules`；用 `getModule` 由 dep 查 module；用 `getDependencies` 替代 `module.dependencies`；写自定义 plugin 用 ModuleGraph API；v4 升级 v5 注意 API 变化。

### 模式 2：AsyncQueue 多阶段并发队列

**问题场景**：构建过程是阶段性的（factorize → build → seal → emit），各阶段用数组 + forEach 串行——慢，且难并发。

**解决方案**：`AsyncQueue` 是 Webpack 5 的并发队列：`enqueue` 任务、`enqueue` 显式依赖、`start` 启动 worker 池。`factorize`/`build`/`processDependencies` 都是 AsyncQueue 实例。`ParallelismPlugin` 限制并发数。

**关键参数**：
- `AsyncQueue` 类
- `enqueue(item)`
- `enqueueProvider`
- `ParallelismPlugin`
- `entries`/`start`/`stop`

**最佳实践**：理解 AsyncQueue 调度；写自定义 stage 用 `enqueue`；`ParallelismPlugin` 配 `cpu - 1`；异步构建用 `start`/`stop`；监控队列长度；不用乱调并发（OOM）。

### 模式 3：ChunkGraph 与 Chunk 模块映射

**问题场景**：Webpack 4 的 Chunk 关系散在 `Chunk` 对象上，跨 Chunk 找模块困难。

**解决方案**：Webpack 5 抽离 `ChunkGraph`：每个 Chunk 关联 `ChunkGraph` 节点，记录 `chunkModules`/`chunkRuntimeModules`/`runtimeRequirements`。`chunkGraph.getModuleChunks(module)` 反查 Module 在哪些 Chunk。`chunkGraph.getChunkRuntimeRequirements(chunk)` 查 Chunk 的 runtime。

**关键参数**：
- `compilation.chunkGraph`
- `ChunkGraph` 类
- `getModuleChunks`
- `getChunkModules`
- `runtimeRequirements`

**最佳实践**：用 `chunkGraph` API 替代 `chunk.modules`；`getModuleChunks` 反查；`runtimeRequirements` Set 配 chunk 运行所需；写自定义 chunk 优化插件用 ChunkGraph；理解 chunk graph vs module graph 区别。

### 模式 4：Factorize/Add/Build/Seal/Emit 五阶段

**问题场景**：Webpack 4 用回调串联（`compilation.hooks.buildModule`/`seal`...）——阶段边界模糊。

**解决方案**：Webpack 5 显式分 5 阶段：
1. **Factorize**：从 entry 递归解析 dependency
2. **Add**：注册 module 到 moduleGraph
3. **Build**：loader 转换 + parser 解析依赖
4. **Seal**：优化（tree-shake/splitChunks/hashing）
5. **Emit**：写入 dist

每阶段对应钩子 + AsyncQueue 驱动。

**关键参数**：
- `compilation.factorizeQueue`
- `compilation.addModuleQueue`
- `compilation.buildQueue`
- `compilation.seal`
- `compilation.emit`

**最佳实践**：理解 5 阶段边界；用对应阶段钩子订阅；`factorize` 可换模块（如 vue-loader 替换 module）；`seal` 后不能改 graph；`emit` 后不能再加资源；用 `compilation.getAsset` 取产物。

### 模式 5：Parser 与 ParserPlugin AST 钩子

**问题场景**：不同模块语法（JS/TS/JSX/CSS）需要不同解析器——Webpack 4 的 Parser 是大 switch。

**解决方案**：Webpack 5 拆 `Parser`（核心 + 钩子） + `ParserPlugin`（语言扩展）。`parser.hooks.evaluate` 解析表达式（用于 tree-shake 判断）。`parser.hooks.statement` 解析语句。`acorn` 解析 JS AST。

**关键参数**：
- `parser.hooks.evaluate`
- `parser.hooks.statement`
- `parser.hooks.expression`
- `ParserPlugin`
- `acorn` AST

**最佳实践**：用 `Parser` API 替代 `acorn`；`evaluate` 用于 dead code 分析；写自定义 import 解析用 `hooks.import`；`parser` 是单 Module 复用；tree-shake 依赖 evaluate；用 `swc`/`esbuild` 替代 acorn 加速。

## 第二段：扩展范式

### 模式 6：InnerGraph 深度 tree-shaking

**问题场景**：普通 tree-shake 只看 import/export 一层；嵌套引用（`export { a }` → `module.b.c`）无法传播。

**解决方案**：Webpack 5 引入 `InnerGraph`：分析模块内符号引用关系，标记 unused。`getInnerGraph` 返回 `TopLevelDeclarations`。`FlagDependencyExportsPlugin`/`FlagUsageExportsPlugin` 配 InnerGraph 做传播。

**关键参数**：
- `InnerGraph` 类
- `getInnerGraph(module)`
- `FlagDependencyExportsPlugin`
- `FlagUsageExportsPlugin`
- `harmony-imports` 标记

**最佳实践**：用 `sideEffects: false` 启用深度 tree-shake；理解 InnerGraph 是模块内分析；写库代码保持纯函数；避免 `eval`/`new Function` 阻断；用 `concatenateModules` 配合；测试 `bundle` size 验证。

### 模式 7：CSS 提取与 ChunkAsset 机制

**问题场景**：传统 CSS 走 `style-loader` 注入 `<style>`——首屏 FOUC。生产要抽离为独立 CSS 文件。

**解决方案**：`MiniCssExtractPlugin` 走 Webpack 5 的 `processAssets` 钩子：
1. CSS loader 把 CSS 编译为 Module
2. `CssModule` 类是 `Module` 子类
3. `CssExtractPlugin.loader` 收集 CSS 到 module._css
4. `processAssets` 阶段生成 `*.css` 文件
5. HTML 注入 `<link>`

**关键参数**：
- `CssModule` 扩展
- `processAssets` 阶段
- `compilation.emitAsset`
- `css/chunk` 类型
- `module.buildInfo.assets`

**最佳实践**：用 `MiniCssExtractPlugin` 抽 CSS；用 `css-loader`/`postcss-loader` 处理 CSS；用 `postcss` 配 autoprefixer；`mini-css-extract-plugin` + `css-minimizer-webpack-plugin` 压缩；HMR 配 `style-loader`（dev）；生产配 `MiniCssExtractPlugin`（prod）。

### 模式 8：runtime 与 runtimeRequirements

**问题场景**：Webpack 4 把 runtime 代码生成在每个 Chunk 中——重复且大。

**解决方案**：Webpack 5 显式 `runtime` + `runtimeRequirements`：
- `runtimeRequirements: Set<string>` 标记 Chunk 需要的 runtime 函数
- `compilation.addRuntimeModule(chunk, runtimeModule)` 注入 runtime
- `RuntimeGlobals` 枚举所有 runtime 符号
- 优化：去重 + 按需注入

**关键参数**：
- `RuntimeGlobals`
- `runtimeRequirements`
- `addRuntimeModule`
- `compilation.runtimeMap`
- 动态引入 runtime

**最佳实践**：写自定义 runtime 用 `RuntimeGlobals`；理解 `__webpack_require__`/`__webpack_modules__` 怎么生成；按 `runtimeRequirements` 去重；用 `runtimeChunk: 'single'` 抽公共 runtime；写自定义 runtime 优化插件；理解 `webpack/runtime/*` 内置 runtime。

### 模式 9：Stats 统计与构建分析

**问题场景**：构建完不知道 bundle 里有什么、为什么这么大——`stats.json` 是大黑盒。

**解决方案**：`stats.toJson()` 返回结构化统计：`modules`/`chunks`/`assets`/`errors`/`warnings`。`webpack-bundle-analyzer` 解析 stats.json 可视化。`stats.preset: 'minimal'` 简化输出。`stats.json` 可上传到 CI。

**关键参数**：
- `stats.toJson()`
- `webpack --profile --json > stats.json`
- `webpack-bundle-analyzer`
- `stats.preset`
- 嵌套 `assets`/`modules`

**最佳实践**：用 `stats.json` 分析；用 `bundle-analyzer` 可视化；用 `source-map-explorer` 分析 source map；CI 上传 stats 历史；用 `webpack-stats-plugin` 持久化；`stats: 'minimal'` 简化控制台输出。

### 模式 10：诊断与错误处理（Diagnostics）

**问题场景**：插件/loader 报错信息不友好——开发者不知道哪里错。

**解决方案**：Webpack 5 强化 `WebpackError`/`Diagnostic`：
- `compilation.errors.push(new WebpackError('xxx'))` 抛错
- `Diagnostic` 是结构化错误（含定位）
- 插件用 `getResolve()` 取 resolver 错误
- `ModuleNotFoundError`/`ModuleParseError` 等内置错误类

**关键参数**：
- `WebpackError`
- `Diagnostic`
- `compilation.errors`
- 错误类继承
- 错误聚合

**最佳实践**：写自定义 plugin 用 `WebpackError`；继承 `ModuleError`/`ModuleWarning` 增上下文；用 `getResolve()` 友好错误；用 `tapable` HookInterceptor 增强；CI 解析 errors 配 PR 检查；用 `friendly-errors-webpack-plugin` 友好输出。

## 第三段：进阶范式

### 模式 11：懒编译（Lazy Compilation）

**问题场景**：大型 monorepo（数百 routes）首屏编译 30s+——用不到的不该编译。

**解决方案**：Webpack 5 引入 `LazyCompilation` 插件：
- `import()` 走 HTTP 触发
- `entry` 标记为 lazy
- 服务端用 `webpack-dev-server` 配 `lazyCompilation`
- 首次访问触发编译

**关键参数**：
- `LazyCompilationPlugin`
- `entries: false`
- `imports: () => true`
- `webpack-dev-server` 配合
- 服务端中间件

**最佳实践**：用 `LazyCompilationPlugin` 加速 dev；按路由分 entry；用 `webpack-dev-server` v4 配；用 `babel-loader` `cacheDirectory` 配；按页面级分；监控 lazy 命中率；用 `@vue/cli-plugin-pwa` 配合。

### 模式 12：模块联邦（Module Federation）实现

**问题场景**：多个独立部署的应用共享组件/路由——传统 npm 同步成本高。

**解决方案**：Module Federation 由 4 个核心概念组成：
- **Host**：消费方，声明 `remotes`
- **Remote**：提供方，声明 `exposes`
- **Shared**：共享依赖（React/Vue）
- **Federation Runtime**：运行时加载 remote 模块

Webpack 5 原生 `ModuleFederationPlugin` 实现，运行时通过 `container.initialized` 异步加载。

**关键参数**：
- `ModuleFederationPlugin`
- `name`/`filename`
- `remotes`/`exposes`
- `shared`/`singleton`
- `eager`

**最佳实践**：用 `ModuleFederationPlugin` 做微前端；`shared: { react: { singleton: true } }` 单例；`eager: true` 同步加载关键模块；用 `@module-federation/runtime`；用 `federation-dashboard` 监控；按业务域分 remote；处理版本对齐。

### 模式 13：实验特性（experiments）

**问题场景**：Webpack 5 引入新特性（Output Module / Async WebAssembly / Top Level Await）——可能破坏插件。

**解决方案**：`experiments` 配置开启：
- `outputModule: true` 输出 ESM
- `asyncWebAssembly: true` 异步 WASM
- `topLevelAwait: true` 顶层 await
- `layers: true` Layer 概念
- `buildHttp: true` HTTP URL 作为 entry

**关键参数**：
- `experiments.outputModule`
- `experiments.asyncWebAssembly`
- `experiments.topLevelAwait`
- `experiments.layers`
- `experiments.css`

**最佳实践**：用 `experiments.outputModule` 输出 ESM；用 `topLevelAwait` 简化 async entry；用 `asyncWebAssembly` 配 Rust；用 `layers` 分 CSS（vue scoped）；按需开启（破坏插件）；阅读 release notes。

### 模式 14：CSS 与 assets modules 内置

**问题场景**：Webpack 4 需要 `file-loader`/`url-loader` 处理图片——内置更省事。

**解决方案**：Webpack 5 内置 `asset modules`：
- `asset/resource` 输出文件（原 `file-loader`）
- `asset/inline` 内嵌 base64（原 `url-loader`）
- `asset/source` 导出源码（原 `raw-loader`）
- `asset` 自动选择（< 8KB inline）

CSS 用 `type: 'css'` 配 `experiments.css`。

**关键参数**：
- `type: 'asset/resource'`
- `type: 'asset/inline'`
- `type: 'asset/source'`
- `type: 'asset'`
- `parser.dataUrlCondition`

**最佳实践**：用 `type: 'asset/resource'` 处理大文件；用 `type: 'asset/inline'` 处理小图标；用 `parser.dataUrlCondition.maxSize: 8 * 1024` 自动；用 `generator.filename` 改输出名；用 `publicPath` 配 CDN；用 `experiments.css` 处理原生 CSS。

### 模式 15：构建性能分析（Profiling）

**问题场景**：构建慢不知道哪步慢——盲调优。

**解决方案**：
- `node --inspect-brk ./node_modules/.bin/webpack` 启用 Chrome DevTools
- `webpack --profile --json` 输出 profile
- `speed-measure-webpack-plugin` 插件级耗时
- Webpack 内置 `compilation.hooks.buildModule` 计时
- 火焰图 `flamebearer`

**关键参数**：
- `--profile --json`
- `speed-measure-webpack-plugin`
- `console.time`/`console.timeEnd`
- `node --inspect-brk`
- 火焰图

**最佳实践**：用 `speed-measure-webpack-plugin` 测各 plugin/loader 耗时；用 `node --inspect-brk` 配合 Chrome DevTools；用 `webpackbar` 看进度；用 `webpack --profile --json` 上传到 CI；按耗时优化（loader 优先）；用 `terser-webpack-plugin` 配 `parallel`。

## 第四段：实战范式

### 模式 16：编写自定义 Plugin 模板

**问题场景**：要写自定义 Webpack 插件——模板是什么。

**解决方案**：
```js
class MyPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('MyPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'MyPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        (assets) => {
          for (const [name, asset] of Object.entries(assets)) {
            // 处理每个 asset
          }
        }
      )
    })
  }
}
module.exports = MyPlugin
```

**关键参数**：
- `apply(compiler)`
- `compiler.hooks.compilation`
- `compilation.hooks.processAssets`
- `stage` 阶段
- `compilation.assets`

**最佳实践**：用 class 写 plugin；用 `name` 标识；用 `stage` 配执行阶段；用 `compilation.assets` Map 处理；用 `RawSource` 创建新 asset；用 `compilation.emitAsset` 写产物；写测试 `node-memwatch`/`jest`；看官方 plugin 范例。

### 模式 17：编写自定义 Loader 模板

**问题场景**：要写自定义 loader——模板是什么。

**解决方案**：
```js
module.exports = function (source) {
  const callback = this.async()
  // 转换 source
  const result = source.replace(/__VERSION__/g, pkg.version)
  callback(null, result)
}
module.exports.raw = true // 告诉 webpack 源是 Buffer
```

**关键参数**：
- `this.async()` 异步
- `this.query` 选项
- `this.addDependency()` 加依赖
- `this.cacheable(true/false)`
- `module.exports.raw`

**最佳实践**：loader 保持简单（转换）；用 `this.addDependency` 监听文件变化；用 `this.cacheable(false)` 禁用缓存；用 `pitch` 阶段提前返回；用 `loader-utils.getOptions` 取选项；用 `schema-utils` 校验选项；用 babel 写复杂转换。

### 模式 18：性能优化清单

**问题场景**：bundle 慢/bundle 大——优化清单。

**解决方案**：
- `mode: 'production'` 启用压缩
- `optimization.minimize: true`
- `splitChunks` 拆 vendor
- `runtimeChunk: 'single'`
- `moduleIds: 'deterministic'`
- `cache: { type: 'filesystem' }`
- `thread-loader` 配多核
- `image-webpack-loader` 压图
- `purgecss-webpack-plugin` 删未用 CSS
- `terser-webpack-plugin` parallel

**关键参数**：
- 10+ 优化项
- `mode: 'production'`
- `splitChunks`
- `runtimeChunk`
- `moduleIds`/`chunkIds`

**最佳实践**：用 `mode: 'production'`；用 `splitChunks` 拆 vendor；用 `runtimeChunk: 'single'`；用 `moduleIds: 'deterministic'` 长缓存；用 `cache: { type: 'filesystem' }` 持久化；用 `thread-loader` 配多核；用 `terser-webpack-plugin` parallel；用 `BundleAnalyzerPlugin` 分析；按 list 逐项优化。

### 模式 19：常见错误排查

**问题场景**：构建报错——排查路径。

**解决方案**：常见错误类型：
1. **Module not found**：resolve 配置 / `extensions` / `alias`
2. **Loader not found**：没装 / 路径错
3. **Parse error**：parser 配置 / Babel
4. **Module parse failed**：loader 链漏
5. **Plugin tap error**：Hook 名错 / 阶段错
6. **Out of memory**：单进程 / 减少并发

**关键参数**：
- `ModuleNotFoundError`
- `ModuleParseError`
- `ModuleBuildError`
- `WebpackOptionsValidationError`
- Hook 名

**最佳实践**：读错误信息（精确到文件）；用 `resolve` 配置；用 `module.rules.test`/`include`/`exclude`；用 `--display-error-details` 显示详情；用 `friendly-errors-webpack-plugin` 友好输出；用 `node --inspect-brk` 调试；用 `stats` 看详细；分步构建定位。

### 模式 20：生态与未来（Webpack 6 展望）

**问题场景**：Webpack 会被 Vite/Rspack/Turbopack 取代吗？——Webapck 6 计划。

**解决方案**：
- **Webpack 5**：当前稳定
- **Webpack 6**：计划中（Rust 部分 + 优化）
- **Rspack**：Rust 写 Webpack 兼容（10x 快）
- **Turbopack**：Vercel 的 Rust bundler
- **Vite**：原生 ESM + Rollup
- **Module Federation**：独立标准化

**关键参数**：
- Webpack 5 稳定
- Rspack 兼容
- Vite 主流
- MF 标准
- 未来 Rust 化

**最佳实践**：新项目用 Vite/Rspack；老 Webpack 项目用 Rspack 升级；关注 Webpack 6；用 `Module Federation` 标准；理解 bundler 原理（不绑定工具）；按场景选工具（生态 vs 性能）。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\webpack\` |
| 主语言 | JavaScript |
| License | MIT |
| 解析时间 | 2026-06-02 |
| 核心模块 | `lib/ModuleGraph.js`、`lib/ChunkGraph.js`、`lib/AsyncQueue.js`、`lib/Compilation.js` |
| 关键基础设施 | Tapable、Module Federation、InnerGraph、runtime、Stats |
