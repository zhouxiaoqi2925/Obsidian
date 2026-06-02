# webpack - 工业级打包器的 Tapable Hook 系统与 Module/Chunk 图算法双引擎典范

**GitHub**: webpack/webpack
**Star**: 65k+
**语言**: JavaScript
**主题**: 模块打包 / 依赖图 / Tapable Hook / Loader / Plugin
**适用场景**: SPA + MPA + 库打包 + SSR + Monorepo

> webpack 把"模块打包"做到工业级——Tapable Hook 系统 60+ 钩子让插件无所不能，Module/Chunk 双图算法支持复杂切分策略，Loader 链式转换支持任意文件类型，Module Federation 让微前端成为可能。webpack 5 + 持久化缓存让大项目从"5 分钟"变"30 秒"。前端工程化的"事实标准"——也是 vite/rspack 追赶的目标。

## 第一段：基础范式（模式 1-5）

### 模式 1 · 依赖图与 Module / Chunk 引擎

**问题场景**：浏览器不支持 `require` / `import`，需要把散落的 `import` 关系打包为单文件——手写脚本会爆。

**解决方案**：Webpack 构建依赖图（Module Graph）：入口开始，递归解析 `require` / `import`，把每个文件视为 Module。根据 `splitChunks` / `entry` 切分为多个 Chunk（`entry` / `async` / `split`），最后输出为 Bundle。

**关键参数**：
- 入口 `entry: './src/index.js'`
- 出口 `output: { path, filename }`
- 模式 `mode: 'production'`
- Module Graph
- Chunk Graph

**最佳实践**：单入口 + `splitChunks` 切分；多入口用 `entry: { main, admin }`；用 `mode` 配生产 / 开发；用 `target` 配 Node / 浏览器；用 `optimization` 调优。

### 模式 2 · Loader 链式转换

**问题场景**：浏览器只认 JS / CSS / HTML，`.ts` / `.vue` / `.scss` / `.png` 需要转换——不可能内置所有。

**解决方案**：Loader 是右到左的函数链：`module: { rules: [{ test: /\.ts$/, use: 'ts-loader' }] }`。Webpack 把文件内容传给 loader 链。`ts-loader` 转 TS 为 JS。`style-loader` 把 CSS 注入 `<style>` 标签。

**关键参数**：
- `module.rules` 规则
- `test` / `include` / `exclude`
- `use: 'loader-name'`
- `use: { loader, options }`
- loader 链右到左

**最佳实践**：用 `exclude: /node_modules/` 加速；用 `oneOf` 二选一；用 `use: ['style-loader', 'css-loader']` 链式；用 `loader: 'xxx-loader'` 简写；用 `enforce: 'pre' / 'post'` 强制顺序。

### 模式 3 · Plugin 系统与生命周期

**问题场景**：打包器需要扩展（HTML 生成 / CSS 抽离 / 资源压缩）——硬编码不可能。

**解决方案**：Plugin 是带 `apply(compiler)` 方法的对象，在 Webpack 生命周期钩子（`compilation.hooks.processAssets`）注册回调。`compiler.hooks.emit` / `compiler.hooks.done` 等 60+ 钩子。`HtmlWebpackPlugin` / `MiniCssExtractPlugin` 是常见插件。

**关键参数**：
- `apply(compiler)` 方法
- `compiler.hooks.xxx.tap('PluginName', ...)`
- `compilation.hooks.xxx`
- 60+ 生命周期钩子
- 插件是 class 或对象

**最佳实践**：用 `HtmlWebpackPlugin` 生成 HTML；用 `MiniCssExtractPlugin` 抽离 CSS；用 `TerserPlugin` 压缩 JS；用 `CopyPlugin` 复制静态资源；用 `DefinePlugin` 注入全局变量；用 `BundleAnalyzerPlugin` 分析。

### 模式 4 · Tapable Hook 系统

**问题场景**：插件需要在特定时机执行——核心代码用 if/else 判断插件存在？太丑。

**解决方案**：Tapable 是 Webpack 自带的发布订阅：`SyncHook` / `AsyncSeriesHook` / `AsyncParallelHook` 等。`compiler.hooks.done.tap('MyPlugin', () => {})` 订阅。`tap` 同步、`tapAsync` / `tapPromise` 异步。

**关键参数**：
- `new SyncHook(['arg'])`
- `hooks.run.tap('Name', fn)`
- `tapAsync` / `tapPromise`
- `interception` 拦截
- 6 种 Hook 类型

**最佳实践**：写插件用 `compiler.hooks.xxx.tap()`；区分同步 / 异步 Hook；用 `interception` 拦截（修改参数）；按阶段订阅（`compile` / `emit` / `done`）；Hook 名清晰。

### 模式 5 · Chunk 与代码分割

**问题场景**：单 bundle 巨大（1MB+）首屏慢——需要分块并行加载。

**解决方案**：Webpack 三种 Chunk：
- **Entry Chunk**：入口文件
- **Async Chunk**：`import()` 动态加载
- **Split Chunk**：`splitChunks` 配置从 node_modules 拆

`optimization.splitChunks: { chunks: 'all', cacheGroups: { vendor: { test: /node_modules/ } } }` 把 `node_modules` 拆为 vendor chunk。

**关键参数**：
- `entry` 入口 chunk
- `import()` 动态（async）
- `splitChunks` 自动
- `cacheGroups` 分组
- `chunks: 'all' | 'async' | 'initial'`

**最佳实践**：用 `splitChunks` 拆 vendor；用动态 `import()` 路由懒加载；用 `webpackChunkName` 配魔法注释；用 `cacheGroups` 配多组；用 `runtimeChunk: 'single'` 抽 runtime。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · Source Map 与开发模式

**问题场景**：编译后 JS 报错要映射回源码——生产不能暴露源码。

**解决方案**：`devtool: 'source-map'` / `eval-source-map` / `cheap-module-source-map` 等 12 种模式。`hidden-source-map` 生成 map 但不引用。`nosources-source-map` 不暴露源码。`devtool: 'eval-cheap-module-source-map'` 是开发态推荐。

**关键参数**：
- `devtool: 'source-map'`
- 12 种模式
- `eval` 加速
- `cheap` 简化
- `module` 保留 loader

**最佳实践**：dev 用 `eval-cheap-module-source-map`（快）；prod 用 `source-map`（精确）；CI 上传 `.map` 到 Sentry；用 `hidden-source-map` 配 sentry 工具；不要在 prod 用 `eval`（CSP 限制）。

### 模式 7 · Tree Shaking 与 ESM

**问题场景**：项目有 100 个工具函数但只用了 5 个——怎么剔除未用代码？

**解决方案**：Webpack 用 ES Module 静态分析做 Tree Shaking：`import { used } from 'lib'` 中 `unused` 在生产构建时移除。`sideEffects: false` 在 `package.json` 声明无副作用。`usedExports: true` / `providedExports` 标记。

**关键参数**：
- `mode: 'production'` 启用
- `sideEffects: false`
- `usedExports`
- `concatenateModules`（Scope Hoisting）
- Terser 配合

**最佳实践**：用 ES Module 写库（`import` / `export`）；`package.json` 标 `sideEffects: false`；用 `mode: 'production'`；用 Terser 移除 dead code；`concatenateModules` Scope Hoisting 进一步压缩。

### 模式 8 · HMR（Hot Module Replacement）

**问题场景**：改代码不刷新页面（保留 state）——webpack-dev-server HMR。

**解决方案**：`devServer: { hot: true }` 开启 HMR。`module.hot.accept('./module', () => {...})` 接受模块替换。`module.hot.dispose()` 清理副作用。HMR 客户端通过 WebSocket 推送更新。

**关键参数**：
- `devServer.hot: true`
- `module.hot.accept()`
- `module.hot.dispose()`
- WebSocket 推送
- runtime + manifest

**最佳实践**：用 `vue-loader` / `react-refresh` 自动 HMR；写 HMR 接受回调保留 state；用 `if (module.hot) module.hot.accept(...)` 守卫；HMR 失败回退 full-reload；用 `hot: 'only'` 不刷新。

### 模式 9 · resolve 与 alias

**问题场景**：深路径 `../../../components/Button` 难维护——需要 `@/components/Button` 别名。

**解决方案**：`resolve.alias: { '@': path.resolve(__dirname, 'src') }` 配别名。`resolve.modules: ['node_modules']` 配模块搜索。`resolve.extensions: ['.js', '.ts']` 配自动补全。`enforceExtension: true` 强制后缀。

**关键参数**：
- `resolve.alias` 别名
- `resolve.modules` 模块
- `resolve.extensions` 后缀
- `enforceExtension`
- `mainFields`

**最佳实践**：用 `resolve.alias` 配 `@` / `~`；用 `extensions: ['.ts', '.js']` 自动补全；用 `modules` 配自定义目录；用 `enforceExtension: true` 严格模式；用 `mainFields: ['browser', 'module', 'main']`。

### 模式 10 · Module Federation 微前端

**问题场景**：多个独立构建的应用共享代码——传统 npm 包版本同步问题。

**解决方案**：Webpack 5 内置 `ModuleFederationPlugin`：
- **Host**（消费方）：`remotes: { app2: 'app2@http://...' }`
- **Remote**（提供方）：`exposes: { Button: './src/Button' }`
- **Shared**：`shared: ['react', 'react-dom']` 共享依赖

构建时联邦清单（federation manifest），运行时异步加载 remote。

**关键参数**：
- `ModuleFederationPlugin`
- `name` / `filename`
- `remotes` / `exposes`
- `shared` 共享
- `eager: false`

**最佳实践**：用 MF 做微前端；`shared` 配 `singleton: true` 单例；`eager: true` 同步加载；用 `federation-runtime` 加载；用 `Module Federation Dashboard` 监控；用 `Webpack 5` 原生支持。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · 性能优化（持久化缓存 / 多进程）

**问题场景**：大项目构建慢（5min+）——需要缓存和并行。

**解决方案**：
- `cache: { type: 'filesystem' }` 持久化缓存
- `thread-loader` 多进程 Loader
- `terser-webpack-plugin` parallel: true
- `splitChunks` 拆 vendor
- `optimization.runtimeChunk: 'single'`

**关键参数**：
- `cache.type: 'filesystem'`
- `thread-loader`
- `parallel: true`
- `cacheGroups`
- `optimization` 全套

**最佳实践**：用 `cache: { type: 'filesystem' }` 持久化；用 `thread-loader` 配多核；Terser 配 `parallel: true`；拆 vendor 缓存命中率高；用 `webpackbar` 看进度；CI 缓存 `node_modules/.cache`。

### 模式 12 · Library 打包（UMD / ESM / CJS）

**问题场景**：写库要兼容多环境（浏览器 CJS / ESM / AMD / UMD）——一套代码多格式输出。

**解决方案**：`output: { library: { name, type: 'umd' }, globalObject: 'this' }` 输出 UMD。`output.library.type: 'module'` ESM。`output.library.type: 'commonjs2'` CJS。`output.library.export: 'default'` 默认导出。

**关键参数**：
- `output.library.name`
- `output.library.type`
- `output.globalObject`
- `output.library.export`
- `externals`

**最佳实践**：用 `output.library.type: 'umd'` 兼容；用 `externals` 不打包外部依赖；用 `output.library.export: 'default'`；用 `tsconfig` 输出 d.ts；用 `terser` 压缩；用 `banner` 加版权。

### 模式 13 · 多页面应用（MPA）

**问题场景**：多页面（每个 HTML 独立）需要共享 common chunk。

**解决方案**：`entry: { page1: './src/page1.js', page2: './src/page2.js' }` 多入口。`HtmlWebpackPlugin` 用 `chunks: ['page1']` 选 chunks。`optimization.splitChunks.cacheGroups` 配 common 共享。

**关键参数**：
- 多 `entry`
- `HtmlWebpackPlugin` 多实例
- `chunks: ['page1']`
- `splitChunks.cacheGroups.common`
- `runtimeChunk: 'single'`

**最佳实践**：用 `entry` 配多入口；用 `HtmlWebpackPlugin` 多实例生成 HTML；`chunks` 选对应入口；`splitChunks` 配 common 共享；用 `filename: '[name].[contenthash]'` 长缓存；用 `mini-css-extract-plugin` 抽 CSS。

### 模式 14 · 环境变量与 DefinePlugin

**问题场景**：dev / prod 不同配置（API 地址）——硬编码不行。

**解决方案**：`DefinePlugin` 注入变量：`new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('production') })`。配合 `.env` 文件用 `dotenv-webpack` 加载。`webpack.EnvironmentPlugin(['NODE_ENV', 'API_URL'])` 简写。

**关键参数**：
- `new webpack.DefinePlugin({...})`
- `process.env.NODE_ENV`
- `dotenv-webpack`
- `EnvironmentPlugin`
- `webpack --env`

**最佳实践**：用 `DefinePlugin` 注入常量；用 `dotenv-webpack` 配 `.env`；用 `cross-env` 跨平台；用 `EnvironmentPlugin` 简写；区分 `process.env.NODE_ENV`（构建时）和 `import.meta.env`（Vite）；库代码用 `process.env.NODE_ENV !== 'production'` 区分。

### 模式 15 · Watch 与 DevServer

**问题场景**：开发时改代码自动重新构建。

**解决方案**：`webpack --watch` 启用 watch 模式。`webpack-dev-server` 起本地服务器 + HMR：`devServer: { port: 8080, hot: true, open: true, proxy: {...} }`。`webpack-dev-middleware` 配合 Express。

**关键参数**：
- `--watch` 命令
- `webpack-dev-server`
- `devServer.port`
- `devServer.hot`
- `devServer.proxy`

**最佳实践**：用 `webpack-dev-server` 配 HMR；用 `proxy` 配后端 API；用 `historyApiFallback` 配 SPA 路由；用 `open: true` 自动开浏览器；用 `headers` 配 CORS；用 `static` 配静态目录。

## 第四段：实战范式（模式 16-20）

### 模式 16 · Vue / React 项目 Webpack 配置

**问题场景**：从零配 Vue / React 项目的 Webpack 配置。

**解决方案**：Vue 3 + TS：
```js
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')
module.exports = {
  entry: './src/main.ts',
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].[contenthash].js' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') }, extensions: ['.ts', '.js'] },
  module: {
    rules: [
      { test: /\.vue$/, loader: 'vue-loader' },
      { test: /\.ts$/, loader: 'ts-loader' },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] }
    ]
  },
  plugins: [new VueLoaderPlugin(), new HtmlWebpackPlugin({ template: 'public/index.html' })]
}
```

**关键参数**：
- `vue-loader` + `VueLoaderPlugin`
- `ts-loader`
- `style-loader` / `css-loader`
- `HtmlWebpackPlugin`
- `vue/react-refresh` HMR

**最佳实践**：用现成模板（`vue-cli` / `create-react-app` / `Vite`）；配 `ts-loader` 走 `transpileOnly` 加速；用 `MiniCssExtractPlugin` 抽 CSS；HMR 配 `vue-loader` / `react-refresh`；生产配 `MiniCssExtractPlugin` + `Terser`。

### 模式 17 · 性能分析与 Bundle 优化

**问题场景**：bundle 体积大（1MB+），首屏慢——需要分析优化。

**解决方案**：
- `webpack-bundle-analyzer` 生成可视化报告
- `webpack --profile --json > stats.json` 输出 stats
- `source-map-explorer` 分析 source map
- `compression-webpack-plugin` Gzip
- `image-webpack-loader` 图片压缩

**关键参数**：
- `BundleAnalyzerPlugin`
- `compression-webpack-plugin`
- `image-webpack-loader`
- `stats.json`
- `purgecss-webpack-plugin`

**最佳实践**：用 `BundleAnalyzerPlugin` 分析；用 `compression-webpack-plugin` 配 Gzip + Brotli；用 `image-webpack-loader` 压图；用 `purgecss-webpack-plugin` 删未用 CSS；用 `terser` 压 JS；用 `splitChunks` 拆 vendor。

### 模式 18 · CSP 与安全

**问题场景**：Webpack 输出文件要配 CSP（Content Security Policy）——eval 违反 CSP。

**解决方案**：
- `devtool: 'source-map'` 不用 `eval`
- `output.crossOriginLoading: 'anonymous'`
- 避免 `new Function(...)`
- 配 `Content-Security-Policy` HTTP 头
- 用 `subresource-integrity` 防篡改

**关键参数**：
- `output.crossOriginLoading`
- `devtool: 'source-map'`
- `script-src 'self'`
- `webpack-subresource-integrity`
- `Nonce`

**最佳实践**：用 `devtool: 'source-map'` 不带 eval；用 `crossOriginLoading: 'anonymous'`；用 `webpack-subresource-integrity` 加 SRI；用 `nonce-<value>` 配 CSP；用 `script-src 'self' 'sha256-...'`；用 `HttpOnly` cookie 防 XSS。

### 模式 19 · Monorepo 与 Webpack 5 Workspaces

**问题场景**：monorepo 多个 package 共享 Webpack 配置。

**解决方案**：
- `webpack --config packages/app/webpack.config.js`
- 用 `webpack-cli` 配 workspaces
- `tsconfig` `paths` 配别名
- `module-federation` 跨包
- 用 `nx` / `turborepo` 加速

**关键参数**：
- `--config` 多配置
- pnpm workspaces
- `tsconfig.paths`
- `ModuleFederationPlugin`
- `nx` / `turborepo`

**最佳实践**：用 `pnpm workspaces` + `turborepo` 加速；用 `tsconfig.paths` 配别名；用 `Module Federation` 跨 app；用 `nx` 看依赖图；用 `webpack --watch` 增量；CI 缓存 `node_modules/.cache`。

### 模式 20 · 迁移到 Vite / Rspack

**问题场景**：Webpack 慢（30s+）——Vite / Rspack 是新一代。

**解决方案**：
- **Vite**：原生 ESM + esbuild + Rollup
- **Rspack**：Rust 写 Webpack 兼容
- **Turbopack**：Vercel 的 Rust bundler
- **Module Federation**：Vite 5 已支持
- **迁移路径**：新项目用 Vite；老项目用 Rspack 升级

**关键参数**：
- Vite dev < 1s
- Rspack 10x 快
- 兼容 Webpack API
- 渐进迁移
- `vite-plugin-legacy` 老浏览器

**最佳实践**：新项目用 Vite（快）；老项目用 Rspack（兼容）；Module Federation 用 Vite 5；用 `@rspack/cli` 替代 `webpack-cli`；用 `rspack-dev-server` 替代 `webpack-dev-server`；按团队节奏迁移。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\webpack\`
- 主语言：JavaScript
- License：MIT
- 核心模块：`lib/compiler.js` + `lib/Compilation.js` + `lib/dependencies/` + `lib/optimize/`
- 关键基础设施：Tapable + Module Federation + Loader / Plugin + Code Splitting + Tree Shaking

**3 核心洞察**：
1. Tapable Hook 60+ 钩子 = 插件系统"无所不能"的扩展点设计
2. Module / Chunk 双图算法 = 比 esbuild 单图更适合复杂切分策略
3. Module Federation = 微前端的"原生支持"，比 qiankun 更底层

**1 反模式**：在 prod 配 `devtool: 'eval-source-map'`——eval 违反 CSP 且性能差。

**3 立刻能用**：
1. `webpack --watch` + `webpack-dev-server` 起开发服务
2. `splitChunks: { chunks: 'all' }` 自动拆 vendor
3. `ModuleFederationPlugin` 做微前端共享
