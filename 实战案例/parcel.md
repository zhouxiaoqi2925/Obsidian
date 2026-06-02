# Parcel - 零配置 Web 打包器

**GitHub**: parcel-bundler/parcel
**Star**: 43k
**语言**: Rust + JavaScript
**主题**: web-bundler、zero-config、rust、bundler
**适用场景**: 快速原型、多语言项目（JS/TS/CSS/HTML/Assets）、中大型 SPA

---

## 一、基础范式

### 模式 1 · 零配置开箱即用

**问题场景**：Webpack 配置 200+ 行，Vite 也需要写 `vite.config.js`，新人上手成本高。

**解决方案**：Parcel 走「约定优于配置」哲学，零配置即可打包 React/Vue/Svelte/TypeScript/Sass/Less/PostCSS 等 30+ 文件类型，自动检测 `package.json` 的 `browserslist` + `.parcelrc` 优先级低于约定。

**关键参数**：
- `parcel src/index.html` 一行启动
- 默认 ESM/HMR/Code Splitting
- 自动检测 React/Vue
- 30+ 内置 transform
- `browserslist` 自动目标

**最佳实践**：所有 demo / 内部工具用 Parcel 5 分钟启动，不写 config。

### 模式 2 · 多入口 + HTML 入口

**问题场景**：单入口不够用（如 admin + user 两个页面），多 HTML 入口。

**解决方案**：每个 HTML 文件是独立入口，`parcel src/index.html src/admin.html` 一次性打包多个应用，输出到 `dist/`。

**关键参数**：
- `parcel src/index.html` 单入口
- 多 HTML 入口
- `dist/` 输出
- 自动 code splitting
- HMR 集成

**最佳实践**：多页面应用每个 HTML 一个入口，Parcel 自动共享公共 chunk。

### 模式 3 · Rust 核心加速

**问题场景**：纯 JS 打包器慢，Webpack 5 启动 30 秒。

**解决方案**：Parcel 2 用 Rust 写核心（`@parcel/core` / `parcel-rs`），JS 写胶水层（plugin 系统），Rust 负责文件 IO / AST 解析 / 资源解析等 CPU 密集任务。

**关键参数**：
- Rust 核心
- JS plugin 系统
- NAPI 绑定
- 10x 启动加速
- swc/babylon 集成

**最佳实践**：所有 CPU 密集工具（解析器 / 编译器 / 打包器）都用 Rust 重写。

### 模式 4 · 自动 HMR + 资源 URL

**问题场景**：手写 HMR 复杂，资源 URL 处理麻烦。

**解决方案**：Parcel 内置 HMR，文件保存自动热更新（`parcel src/index.html` dev 模式）；资源 `import logo from './logo.png'` 自动生成 URL + 哈希。

**关键参数**：
- 自动 HMR
- 资源 URL 自动生成
- 哈希文件名
- 缓存友好
- 0 配置

**最佳实践**：开发环境 parcel dev 启动 HMR，生产环境 parcel build 静态资源。

### 模式 5 · 资源处理（图片 / 字体 / SVG）

**问题场景**：图片 / 字体 / SVG 等二进制资源处理复杂。

**解决方案**：Parcel 内置 30+ 资源转换器：图片自动优化（`url-loader`）/ SVG 转 React 组件（`@parcel/transformer-svg-react`）/ 字体子集化。

**关键参数**：
- 自动图片优化
- SVG → React 组件
- 字体子集化
- 30+ 内置 transformer
- `@parcel/transformer-*` 扩展

**最佳实践**：图片用 `import` 直接用，SVG 用 `@parcel/transformer-svg-react` 转组件。

---

## 二、扩展范式

### 模式 6 · Tree Shaking + Scope Hoisting

**问题场景**：打包后 bundle 包含未使用代码，体积大。

**解决方案**：Parcel 自动 tree shaking（ES Module 静态分析）+ scope hoisting（合并模块到一个作用域），产物比 Webpack 小 20%。

**关键参数**：
- ES Module 静态分析
- 自动 tree shaking
- Scope hoisting
- `sideEffects: false` package.json
- Dead code 消除

**最佳实践**：所有项目 `package.json` 加 `"sideEffects": false` 启用 tree shaking。

### 模式 7 · CSS / PostCSS / Sass 内置

**问题场景**：CSS / Sass / PostCSS 配置复杂。

**解决方案**：Parcel 内置 CSS / Sass / Less / Stylus / PostCSS，零配置自动处理，CSS Modules（`*.module.css`）/ autoprefixer 自动启用。

**关键参数**：
- 内置 Sass / Less
- CSS Modules `.module.css`
- PostCSS 自动
- autoprefixer
- 0 配置

**最佳实践**：CSS Modules 用 `*.module.css` 命名约定，无需配置。

### 模式 8 · TypeScript / JSX / Flow 内置

**问题场景**：TypeScript 转译需要 Babel / ts-loader。

**解决方案**：Parcel 内置 SWC / Babel 引擎，零配置处理 TypeScript / JSX / Flow，类型检查交给 IDE / `tsc --noEmit`。

**关键参数**：
- 内置 SWC / Babel
- TS / JSX / Flow
- 类型检查 IDE
- `tsc --noEmit` 分离
- 0 配置

**最佳实践**：Parcel 处理转译，`tsc` 做类型检查，两步分离避免 bundle 慢。

### 模式 9 · 插件系统（@parcel/plugin）

**问题场景**：内置 transform 不够用，需要自定义。

**解决方案**：Parcel 提供 `@parcel/plugin` 包，5 类插件：Transformer / Resolver / Bundler / Packager / Optimizer，每个都有 JS 钩子。

**关键参数**：
- `@parcel/plugin` 5 类
- Transformer 单文件转译
- Resolver 模块解析
- Bundler 依赖图
- Packager 产物打包

**最佳实践**：所有自定义 transform 都用 `@parcel/plugin` 5 类接口。

### 模式 10 · .parcelrc 优先级覆盖

**问题场景**：需要项目级 / 团队级配置覆盖默认。

**解决方案**：`.parcelrc` JSON 文件配置 `extends / transformers / resolvers`，优先级：`@parcel/config-default` < `.parcelrc` < 命令行参数。

**关键参数**：
- `.parcelrc` JSON
- `extends: '@parcel/config-default'`
- `transformers` 覆盖
- `resolvers` 覆盖
- 优先级链路

**最佳实践**：所有 monorepo 用 `.parcelrc` 统一团队配置。

---

## 三、进阶范式

### 模式 11 · Source Maps + 调试

**问题场景**：打包后调试困难。

**解决方案**：Parcel 自动生成 source maps（开发模式 inline / 生产模式独立 `.map` 文件），Chrome DevTools 自动关联。

**关键参数**：
- source maps 自动
- 开发 inline
- 生产独立
- Chrome DevTools 关联
- `--no-source-maps` 关闭

**最佳实践**：开发环境 source maps inline，生产环境独立 `.map` 文件，部署到 Sentry 类工具。

### 模式 12 · Differential Bundling（modern vs legacy）

**问题场景**：现代浏览器 vs 老浏览器需要不同产物。

**解决方案**：Parcel 根据 `browserslist` 自动生成两份产物：ES2020+（`<script type="module">`）+ ES5（`<script nomodule>`），用 `<script type="module">` 让现代浏览器优先加载。

**关键参数**：
- `browserslist` 自动
- modern vs legacy
- `<script type="module">`
- `<script nomodule>`
- 节省 20% 体积

**最佳实践**：所有项目用 browserslist + module/nomodule 模式，节省 20% 体积。

### 模式 13 · Content Addressing + 永久缓存

**问题场景**：CI 缓存浪费，文件 hash 变化整体重传。

**解决方案**：Parcel 用内容寻址（content-addressable storage），相同内容复用缓存，CI 缓存 5GB 命中 99%。

**关键参数**：
- 内容寻址
- 永久缓存
- `.parcel-cache/`
- CI 缓存 5GB
- 命中 99%

**最佳实践**：CI 缓存 `.parcel-cache/` 目录，构建时间从 5min 降到 30s。

### 模式 14 · Web Worker / Service Worker 内置

**问题场景**：Web Worker / Service Worker 配置复杂。

**解决方案**：Parcel 自动识别 `new Worker(new URL('./worker.ts', import.meta.url))` 语法，自动打包 worker。

**关键参数**：
- `new Worker(new URL(...))`
- 自动打包
- Service Worker
- SharedWorker
- 0 配置

**最佳实践**：用 `new URL('./worker.ts', import.meta.url)` 引入 Worker，Parcel 自动处理。

### 模式 15 · Bundle Analyzer（@parcel/bundler-analyzer）

**问题场景**：bundle 体积需要可视化分析。

**解决方案**：`@parcel/bundler-analyzer` 包输出交互式 treemap，可视化每个模块的体积占比。

**关键参数**：
- `@parcel/bundler-analyzer`
- 可视化 treemap
- 每个模块体积
- 优化方向
- CI 集成

**最佳实践**：每月跑一次 bundle analyzer，定位体积膨胀。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Parcel 项目。

**解决方案**：7 件套：① `package.json` 配 entry ② `src/index.html` 入口 ③ `src/index.tsx` 业务 ④ `src/app.css` 样式 ⑤ `src/components/` 组件 ⑥ `tsconfig.json` 类型 ⑦ `parcel src/index.html` 启动。

**关键参数**：
- `package.json` entry
- `src/index.html` 入口
- `parcel src/index.html`
- `tsconfig.json` 类型
- HMR 自动

**最佳实践**：所有 demo / 内部工具用 7 件套 + Parcel 5 分钟启动。

### 模式 17 · 与 Webpack / Vite / Rollup 对比

**问题场景**：选型在 Parcel / Webpack / Vite / Rollup 之间。

**解决方案**：Parcel 定位「零配置 + Rust 加速 + 多语言」适合快速原型 / 中型项目；Webpack 定位「配置丰富 + 生态最大」适合复杂 SPA；Vite 定位「ESM dev + Rollup 生产」适合现代 SPA；Rollup 定位「库打包」适合 npm 库。

**关键参数**：
- 速度：Vite > Parcel > Webpack
- 配置：Parcel < Vite < Webpack
- 生态：Webpack > Vite > Parcel > Rollup
- 库打包：Rollup > Vite > Parcel

**最佳实践**：demo / 中型项目选 Parcel，复杂 SPA 选 Vite，复杂配置选 Webpack，库打包选 Rollup。

### 模式 18 · 性能优化 5 招

**问题场景**：Parcel 打包慢 / bundle 大。

**解决方案**：5 招优化：① 启用 `browserslist` + module/nomodule ② `sideEffects: false` ③ `@parcel/bundler-analyzer` 分析 ④ `.parcel-cache` CI 缓存 ⑤ 移除未使用依赖。

**关键参数**：
- browserslist
- `sideEffects: false`
- 缓存命中
- bundle analyzer
- dead dep 移除

**最佳实践**：5 招叠加，bundle 体积减少 50%，构建时间减半。

### 模式 19 · 部署到 CDN + 静态托管

**问题场景**：Parcel 打包后怎么部署。

**解决方案**：`parcel build` 输出 `dist/`，上传到 Vercel / Netlify / Cloudflare Pages / S3 + CloudFront，配置 1 年 `Cache-Control: public, max-age=31536000, immutable`。

**关键参数**：
- `parcel build` 产物
- `dist/` 目录
- CDN 部署
- 哈希文件名
- 1 年缓存

**最佳实践**：所有静态资源用哈希文件名 + 1 年 immutable 缓存，CDN 命中率 99%。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Parcel 做内部打包器。

**解决方案**：7 天分 5 步：① Rust core（文件 IO + 资源图）② Resolver 模块解析 ③ Transformer 文件转译 ④ Bundler 依赖图 ⑤ Packager 产物打包。

**关键参数**：
- Day 1-2: Rust core
- Day 3: Resolver
- Day 4: Transformer
- Day 5: Bundler
- Day 6-7: Packager

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 Parcel 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\parcel\`
- **大小**: ~20 MB
- **总文件数**: 数千 Rust + JS 文件
- **关键 commit**: v2.x（Rust 核心）
- **团队**: Devon Govett 主导 + 社区
- **许可**: MIT

## 一句话总结

Parcel 用「零配置 + Rust 核心 + 自动 HMR + 内置多语言」让 Web 打包变得像 npm install 一样简单，是 5 分钟 demo + 中型项目的事实标准。
