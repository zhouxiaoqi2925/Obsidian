# vite - 下一代前端工具的浏览器原生 ESM 零打包与 Rolldown Rust 构建典范

**GitHub**: vitejs/vite
**Star**: 75k+
**语言**: TypeScript + Rust
**主题**: 前端构建工具 / ESM 零打包 / Rust bundler / HMR
**适用场景**: 现代前端开发 + Vue / React / Svelte 工程化 + SSR

> vite 把"dev 零打包 + 生产 Rolldown 打包"做到极致——dev 阶段浏览器原生 ESM 按需加载 + esbuild 预打包依赖，HMR 速度 10-50ms；生产用 Rolldown（Rust 写的 Rollup 兼容 bundler）10x 加速。Vite 6+ 引入 Environment API 把 client / ssr / edge / lib 分环境隔离——前端构建工具的"云原生"标准。

## 第一段：基础范式（模式 1-5）

### 模式 1 · dev 阶段浏览器原生 ESM 零打包

**问题场景**：传统 webpack dev 启动慢（30s+）、HMR 慢（全量重编译），是因为把所有依赖打包成 bundle 给浏览器。

**解决方案**：Vite dev 阶段不做 bundle——浏览器原生支持 ESM（`<script type="module">`），直接按需请求 `.js` 文件。dev server 拦截请求做即时转译（TS → JS、CSS 注入 JS），浏览器原生 import 解析链。

**关键参数**：
- `index.html` + `<script type="module" src="/src/main.ts">`
- dev server 中间件即时转译
- 依赖预打包 `optimizeDeps`
- 浏览器原生 ESM
- 无 bundle 启动 < 1s

**最佳实践**：dev 用浏览器原生 ESM 启动快；生产用 Rolldown 打包；用 `optimizeDeps.include` 预打包大依赖（Vue / React）；HMR 速度快（10-50ms）。

### 模式 2 · esbuild 依赖预打包（optimizeDeps）

**问题场景**：项目依赖数百 npm 包（Vue / React / lodash / axios），浏览器原生 ESM 直接 import 这些 CommonJS 或 ESM 嵌套深的包会发数百请求。

**解决方案**：dev 启动时用 esbuild 把所有依赖预打包成一个或几个 chunk（`node_modules/.vite/deps/`），缓存到磁盘。浏览器请求 `/node_modules/.vite/deps/vue.js` 单文件即可。

**关键参数**：
- `optimizeDeps.entries` 入口
- `optimizeDeps.include` 强制打包
- `optimizeDeps.exclude` 不打包
- esbuild 并行打包
- `.vite/deps/` 缓存

**最佳实践**：用 `include` 显式列大依赖；`exclude` 列需保留原 ESM 的包（如类型库）；首次启动后缓存生效；`force: true` 调试时强制重打包。

### 模式 3 · 模块图谱与 import 重写

**问题场景**：`import vue from 'vue'` 在浏览器里要解析为 `/node_modules/.vite/deps/vue.js?v=xxx`，开发期需要智能重写。

**解决方案**：Vite 用 `es-module-lexer` 解析 import 语法（AST 级别，不全量 parse），`importAnalysis` 插件重写 import 路径为浏览器可加载 URL，加 `?v=hash` 用于缓存失效。

**关键参数**：
- `es-module-lexer` 极速解析
- `importAnalysis` 插件
- 路径重写 `vue` → `/@id/vue` 或 `/node_modules/.vite/deps/vue.js`
- `?v=hash` 缓存标识
- `?import` 后缀递归

**最佳实践**：用 `?import` 后缀递归加载；`?v=hash` 在依赖变更时更新；`es-module-lexer` 性能比 acorn 快 100x；用 `resolve.alias` 配自定义映射。

### 模式 4 · 插件系统（Rollup-style Hooks）

**问题场景**：前端工具需要扩展点（Vue SFC 解析、CSS 预处理、PostCSS、图片压缩）——硬编码不可能。

**解决方案**：Vite 插件基于 Rollup 插件接口（`resolveId` / `load` / `transform`），加上 Vite 特有的 `configureServer` / `handleHotUpdate` 等钩子。`enforce: 'pre' / 'post'` 控制插件顺序。

**关键参数**：
- `name` 插件名
- `resolveId` / `load` / `transform` Rollup 钩子
- `configureServer(server)` 配置 dev server
- `handleHotUpdate(ctx)` HMR
- `enforce: 'pre' | 'post'`

**最佳实践**：用 Rollup 兼容 API 写插件（可移植）；`name` 必须唯一；`transform` 返回 `null` 跳过；用 `apply: 'build' | 'serve'` 限定环境；Vite 插件可与 Rollup 通用。

### 模式 5 · CSS 注入 JS 与 CSS Modules

**问题场景**：dev 阶段希望改 CSS 立即生效（不刷新），传统方式 `<link rel="stylesheet">` 加载慢且无法 HMR。

**解决方案**：Vite dev 阶段把 CSS 注入到 JS 模块里（`import './style.css'` 变成 JS 执行时 `<style>` 注入到 `<head>`），HMR 时仅替换该 `<style>` 标签内容。生产构建 Rollup 抽离为独立 CSS 文件。

**关键参数**：
- `import './style.css'` JS 注入
- `<style>` 标签动态创建
- HMR 替换 `<style>` 文本
- 生产 CSS 抽离
- `css.modules` 配置

**最佳实践**：用 `*.module.css` 自动启用 CSS Modules；`css.preprocessorOptions` 配 Sass / Less；HMR 性能极好（10ms 内）；生产构建自动 code-split CSS。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · HMR（Hot Module Replacement）协议

**问题场景**：改代码不刷新页面（保持 state）——webpack HMR 复杂且慢，Vite HMR 极快（10-50ms）。

**解决方案**：Vite HMR 通过 WebSocket 推送 `update` 事件，客户端按模块类型用对应 runtime（`import.meta.hot.accept`）。Vite 内置 `vue` / `react` / `svelte` 等框架的 HMR runtime。

**关键参数**：
- WebSocket `/__vite_hmr` 通道
- `update` / `full-reload` 事件
- `import.meta.hot.accept()` 客户端 API
- HMR 边界（无 accept 则 full-reload）
- `import.meta.hot.invalidate()`

**最佳实践**：组件级 HMR 用 `import.meta.hot.accept('./Comp.vue')`；module 无 HMR 边界就 full-reload；用 `data-allow-mismatch` 临时容忍错误；HMR 失败回退 full-reload。

### 模式 7 · 环境 API（Environment API）

**问题场景**：传统前端工具把"运行环境"硬编码为 dev / build 两态——SSR / Edge / SSG / 库等场景需要更细粒度环境隔离。

**解决方案**：Vite 6+ 引入 `Environment API`——每个环境（`client` / `ssr` / `edge` / `lib`）是独立容器，独立的 resolver / transformer / plugin pipeline。`environments: { ssr: { resolve: { ... } } }` 显式配置。

**关键参数**：
- `environments` 字段
- `client` / `ssr` / `edge` / `lib`
- 每个环境独立 `resolve` / `plugins`
- `Runner` 跨环境
- 共享 plugins 通过 `sharedDuringBuild`

**最佳实践**：SSR 用 `environments.ssr` 独立配置；`sharedDuringBuild` 共享通用插件；库模式用 `lib` 环境；用 `DevEnvironment` / `BuildEnvironment` 类。

### 模式 8 · Module Runner 与 SSR 通道

**问题场景**：SSR 需要在 Node.js 执行客户端组件（如 Vue / React），但同时保留 Vite 的 HMR 与模块图能力。

**解决方案**：`ModuleRunner` 是 Vite 提供的 Node 端模块执行器，接收 server 传来的 `evaluatedModules`，用同一套 transform 管道在 Node 端跑模块。`server.ssrLoadModule(url)` 是 API 入口。

**关键参数**：
- `createServer().ssrLoadModule`
- `ModuleRunner` 类
- `ssrTransform` 转换（`import.meta.url` 重写）
- 缓存 evaluated modules
- 错误堆栈映射源文件

**最佳实践**：用 `ssrLoadModule` 在 dev SSR 加载组件；用 `ssr.noExternal` 强制打包某些依赖；用 `ssr.target: 'webworker'` 跑在 worker；HMR 跨服务端 / 客户端同步。

### 模式 9 · 依赖预构建与缓存失效

**问题场景**：依赖预打包后，开发者改了 `package.json` / `lock` 文件需要重打包——但 Vite 怎么知道要重打？

**解决方案**：Vite 把 `package.json` + `lock` + `optimizeDeps` 配置做 hash 存入 `node_modules/.vite/deps/_metadata.json`，hash 变则清缓存重打。`force: true` 强制。

**关键参数**：
- `_metadata.json` 缓存清单
- hash 匹配
- `optimizeDeps.force` 强制
- `optimizeDeps.holdUntilCrawlEnd` 等待爬完
- `optimizeDeps.disabled` 关闭

**最佳实践**：`package.json` 改完自动清缓存；`force: true` 调试用；`disabled: true` 关闭预打包（项目小可加速启动）；用 `lockfile` 检测锁文件变更。

### 模式 10 · CSS Modules 与 PostCSS

**问题场景**：CSS 命名冲突、传统 CSS 难维护——需要 CSS Modules 局部作用域 + PostCSS 自动加前缀。

**解决方案**：`.module.css` 后缀自动启用 CSS Modules（局部 class 名 hash 化），`vite.config.ts` 配 PostCSS 插件（autoprefixer / postcss-nested 等）。`cssCodeSplit: true` 把 CSS 切到对应 chunk。

**关键参数**：
- `*.module.css` 局部 class
- `composes` 复用
- `:global` 强制全局
- `cssCodeSplit` CSS 切分
- `postcss.config.js` 插件

**最佳实践**：用 `*.module.css` 强制 CSS Modules；`composes: class from './base.css'` 复用；用 `data-vite-dev-id` 调试 HMR；`cssCodeSplit: true` 生产抽离 CSS。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · Rolldown Rust bundler 替换 Rollup

**问题场景**：Rollup 是 Vite 生产构建的 bundler，性能瓶颈在大项目（>10k 模块，构建 30s+）。

**解决方案**：Vite 7+ 计划用 Rolldown（Rust 写的 Rollup 兼容 bundler）替换 Rollup，10x+ 构建速度，兼容 Rollup 插件 API。`rolldown-vite` 是过渡版本。

**关键参数**：
- `rolldown-vite` npm tag
- Rust 实现
- 兼容 Rollup 插件
- 10x 构建速度
- Drop-in 替换

**最佳实践**：用 `rolldown-vite` 体验 Rust 构建；插件兼容性测试；监控构建时间；用 `vite build --debug` 看 bundler 类型；准备 Rolldown 升级。

### 模式 12 · 自定义插件与钩子

**问题场景**：业务需要虚拟模块（运行时生成代码）、自定义资源处理、特殊文件格式——需要写 Vite 插件。

**解决方案**：写 `name: 'my-plugin'` 的对象，实现 `resolveId`（解析虚拟 ID）/ `load`（返回虚拟模块代码）/ `transform`（修改已有模块）。`configureServer(server)` 加 dev 中间件。

**关键参数**：
- `resolveId(id, importer)` 解析
- `load(id)` 加载
- `transform(code, id)` 转换
- `configureServer(server)` 中间件
- `handleHotUpdate(ctx)` HMR

**最佳实践**：虚拟模块用 `\0` 前缀（如 `\0virtual:my-mod`）；`resolveId` 返回 null 让其他插件处理；`transform` 链式；用 `apply: 'serve' | 'build'` 限定环境。

### 模式 13 · 多页面应用（MPA）与库模式

**问题场景**：单页应用（SPA）不够用——多页面（MPA，每个 HTML 入口独立）或库模式（输出 .d.ts + ESM / CJS）。

**解决方案**：`rollupOptions.input` 配多个入口（`index.html` / `admin.html`）。库模式 `build.lib` 配 `entry` / `name` / `formats`，输出 `.d.ts` / `esm` / `cjs` / `umd`。

**关键参数**：
- `rollupOptions.input` 多入口
- `build.lib` 库模式
- `build.lib.entry`
- `build.lib.formats: ['es', 'cjs', 'umd']`
- `build.lib.name`

**最佳实践**：MPA 配 `input` 多个 HTML；库模式配 `formats` 多格式；用 `sourcemap: true` 输出 .map；用 `dts` 选项生成 .d.ts（`vite-plugin-dts`）。

### 模式 14 · 路径别名与解析（resolve.alias）

**问题场景**：深路径 `../../../components/Button.vue` 难维护——需要 `@/components/Button` 别名。

**解决方案**：`resolve.alias` 配置路径别名；`vite-tsconfig-paths` 自动从 `tsconfig.json#paths` 读。dev 阶段 Vite 解析；生产 Rolldown 也解析（必须配）。

**关键参数**：
- `resolve.alias` 字段
- `find: '@'` / `replacement: '/src'`
- `vite-tsconfig-paths` 插件
- `tsconfig.json#compilerOptions.paths`
- 严格匹配 `exact: true`

**最佳实践**：配 `tsconfig.paths` + `vite-tsconfig-paths` 同步；用 `find: /^@\//` 正则匹配；生产构建务必配（dev 配了没用）；库代码用相对路径（避免消费方配置负担）。

### 模式 15 · TypeScript 集成（esbuild 转译 + tsc 类型检查）

**问题场景**：纯 tsc 编译慢（30s+）——dev 阶段能否跳过类型检查加速？

**解决方案**：Vite 用 esbuild 做 TypeScript 转译（去掉类型注解，0.1s），但不做类型检查。配 `vue-tsc` / `tsc --noEmit` 在 CI / 保存时做类型检查。

**关键参数**：
- esbuild 0.1s 转译
- `vue-tsc --noEmit` 类型检查
- `tsc --noEmit`
- IDE 类型检查实时
- `fork-ts-checker-webpack-plugin` Vite 版

**最佳实践**：dev 阶段 esbuild 转译跳过类型检查（快）；CI 跑 `tsc --noEmit` 严格检查；用 `vue-tsc` 配 Vue 项目；用 `tsc --watch` IDE 实时检查。

## 第四段：实战范式（模式 16-20）

### 模式 16 · dev server 代理（server.proxy）

**问题场景**：dev 前端在 `localhost:5173`，后端 API 在 `localhost:8080`，跨域 CORS 烦。

**解决方案**：`server.proxy` 配置代理：
```js
proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } }
```

**关键参数**：
- `server.proxy` 字段
- `target` 后端地址
- `changeOrigin: true` 改 Host
- `rewrite` 路径重写
- `ws: true` WebSocket 代理

**最佳实践**：用代理避免 CORS 配置；`changeOrigin: true` 改 Host 头（后端虚拟主机需要）；用 `rewrite` 去 `/api` 前缀；`ws: true` 代理 WebSocket（HMR 用）。

### 模式 17 · 环境变量（import.meta.env）

**问题场景**：dev / prod / test 不同环境需要不同配置（如 API 地址）——硬编码不行。

**解决方案**：Vite 内置 `import.meta.env` 暴露环境变量，`.env` / `.env.development` / `.env.production` 自动加载。`VITE_` 前缀的变量才会暴露给客户端。

**关键参数**：
- `import.meta.env.MODE` 模式
- `import.meta.env.VITE_API_URL` 自定义
- `import.meta.env.DEV` / `PROD`
- `.env.local` 本地覆盖
- `loadEnv(mode, root)` 工具

**最佳实践**：`VITE_` 前缀才暴露（安全）；`.env.local` 入 `.gitignore`；用 `loadEnv` 配 vite.config.ts；用 `MODE` 区分 dev / prod。

### 模式 18 · 生产构建优化（chunk 切分 + terser）

**问题场景**：生产 bundle 体积大（1MB+），首屏加载慢——需要切 chunk + 压缩。

**解决方案**：`build.rollupOptions.output.manualChunks` 切分策略（按 node_modules 拆）；`build.minify: 'esbuild' | 'terser'` 压缩；`build.cssCodeSplit: true` CSS 切分；`build.target: 'es2020'` 目标浏览器。

**关键参数**：
- `manualChunks` 自定义切分
- `minify: 'esbuild'` 默认快
- `minify: 'terser'` 极致压
- `cssCodeSplit`
- `rollup-plugin-visualizer` 分析

**最佳实践**：用 `manualChunks` 拆 `vue` / `react` / `lodash` 等大依赖；用 `esbuild` 压缩（默认、快）；用 `rollup-plugin-visualizer` 分析产物；用 `target: 'es2020'` 减少 polyfill。

### 模式 19 · SSR 实战（Vite + Express / Vue / React）

**问题场景**：单页应用 SEO 差、首屏慢——需要 SSR（Node 端渲染 HTML）。

**解决方案**：Vite SSR 模式用 `createServer({ middlewareMode: true })` 中间件模式 + `ssrLoadModule` 加载组件。生产用 `build.ssr` 输出 SSR bundle，Node 端 require 渲染。

**关键参数**：
- `middlewareMode: true` 中间件
- `ssrLoadModule(url)`
- `build.ssr: 'src/entry-server.ts'`
- `index.html` 用作模板
- `vite-node` 轻量运行时

**最佳实践**：用 `vite-node` 替代完整 vite（生产 SSR 启动快）；用 `unhead` 配 Vue 3 SSR 注入 meta；用 `useSSRContext` 区分 SSR / CSR；用 `streaming` 流式 SSR。

### 模式 20 · 监控与调试（vite --debug / vite inspect）

**问题场景**：插件冲突、依赖未预打包、HMR 失败——需要深度调试。

**解决方案**：`vite --debug` 输出详细日志（含插件调用）；`vite build --debug` 看构建时序；`npx vite inspect` 打开浏览器看每文件的 plugin 转换 pipeline；`vite preview` 本地预览生产构建。

**关键参数**：
- `vite --debug` 详细日志
- `vite build --debug`
- `npx vite inspect` 转换 pipeline
- `vite preview` 预览
- `--force` 强制重打

**最佳实践**：用 `vite inspect` 看 transform 链（最有用）；用 `--debug` 排查插件顺序；用 `--force` 强制重打预打包；用 `vite preview` 验证生产构建。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\vite\`
- 主语言：TypeScript + Rust（Rolldown）
- License：MIT
- 核心模块：`src/node/` + `src/client/` + `packages/vite/`
- 关键基础设施：esbuild + Rolldown + es-module-lexer + Rollup 插件 API

**3 核心洞察**：
1. dev 零打包 + 生产 Rolldown = "开发体验"与"产物性能"分开优化
2. es-module-lexer 极速解析 = 浏览器原生 ESM 不需要全量 parse
3. Environment API 多环境 = SSR / Edge / Lib 一份配置多环境隔离

**1 反模式**：dev 用 Vite 走 `npm run build` 模式做热更新——本质上是反向用工具，浪费 dev 阶段速度优势。

**3 立刻能用**：
1. `import { defineConfig } from 'vite'` 一行配 dev server
2. `optimizeDeps.include: ['vue', 'vue-router']` 预打包大依赖
3. `npx vite inspect` 看每文件 plugin 转换 pipeline
