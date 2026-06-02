# Next.js Turbopack - Rust 写的极速 Webpack 替代

**GitHub**: vercel/next.js (Turbopack 部分)
**Star**: 130k+
**语言**: Rust + TypeScript
**主题**: bundler、rust、incremental、turbopack
**适用场景**: Next.js dev / build 加速、Webpack 替代、monorepo 增量构建

---

## 一、基础范式

### 模式 1 · Rust 写核心 + JS 写胶水

**问题场景**：Webpack 启动慢（10-30 秒），大项目构建慢。

**解决方案**：Turbopack 用 Rust 写核心（增量计算引擎 + 模块图 + chunk 图），JS / TypeScript 写胶水层（loader / plugin）；NAPI 绑定 Node。

**关键参数**：
- Rust 核心
- NAPI 绑定
- 增量计算
- JS 胶水
- 10x 速度

**最佳实践**：所有大型项目用 Turbopack 替代 Webpack dev 模式。

### 模式 2 · 增量计算引擎（Persistent Caching）

**问题场景**：Webpack 5 缓存命中后仍需 30-60 秒构建。

**解决方案**：Turbopack 内置增量计算引擎（基于 `turbo-tasks`），任务图 + 结果缓存 + 失效传播；首次冷启后秒级 HMR。

**关键参数**：
- `turbo-tasks` 任务系统
- 结果缓存
- 失效传播
- 秒级 HMR
- 持久化

**最佳实践**：所有 Next.js dev 用 Turbopack，HMR < 100ms。

### 模式 3 · 文件系统路由 + 约定

**问题场景**：Webpack 路由配置散落。

**解决方案**：Turbopack 沿用 Next.js App Router 约定 `app/page.tsx` / `app/layout.tsx`；`next dev --turbo` 启用；pages router 兼容。

**关键参数**：
- App Router
- `next dev --turbo`
- `app/` 目录
- 约定式
- 0 配置

**最佳实践**：所有 Next.js 项目用 App Router + Turbopack dev。

### 模式 4 · SWC 编译器（替换 Babel）

**问题场景**：Babel 转译 TS / JSX 慢。

**解决方案**：Next.js 默认用 SWC（Rust 写）替代 Babel，单文件转译 < 1ms；Turbopack 内部用 SWC 处理所有 .ts / .tsx / .jsx 文件。

**关键参数**：
- SWC
- Rust 核心
- TS / JSX
- 0 Babel
- 10x 速度

**最佳实践**：所有 Next.js 项目默认用 SWC（已内置），0 配置。

### 模式 5 · RSC（React Server Components）

**问题场景**：需要服务端组件减少客户端 JS 体积。

**解决方案**：Turbopack 原生支持 RSC 编译；`app/page.tsx` 默认 Server Component（无 `'use client'`）；`'use client'` 切换 Client Component；RSC payload 序列化。

**关键参数**：
- RSC 协议
- Server Component
- `'use client'`
- 序列化
- 0 hydration

**最佳实践**：所有新项目用 RSC + Server Component 默认。

---

## 二、扩展范式

### 模式 6 · 持久化缓存（`.next/cache`）

**问题场景**：CI 每次冷启构建慢。

**解决方案**：Turbopack 把任务图结果缓存到 `.next/cache/turbopack/`，GitHub Action 缓存 `~/.next/cache`；CI 命中 99% 缓存。

**关键参数**：
- `.next/cache/turbopack/`
- GitHub Action 缓存
- 99% 命中
- 节省 80% 时间
- 0 重复

**最佳实践**：所有 CI 缓存 `.next/cache`，构建时间 5min → 1min。

### 模式 7 · 内置 loader 体系

**问题场景**：Webpack loader 配置复杂。

**解决方案**：Turbopack 内置 `loader: 'css' | 'scss' | 'svg' | 'static' | 'next-swc-loader'`，5 类 loader；无需写 webpack.config；自定义 loader 用 `experimental.turbo.loaders`。

**关键参数**：
- 内置 5 类
- `next-swc-loader`
- 自定义 loader
- 0 配置
- 现代化

**最佳实践**：所有 Next.js 项目用内置 loader，0 配置起步。

### 模式 8 · 资源优化（图片 / 字体 / 视频）

**问题场景**：图片 / 字体优化要额外工具。

**解决方案**：`next/image` 自动优化（WebP / AVIF + 响应式 + 懒加载）；`next/font` 自动子集化（自托管 Google Fonts）；Turbopack 集成 Image Optimization。

**关键参数**：
- `next/image`
- `next/font`
- WebP / AVIF
- 自托管字体
- 0 配置

**最佳实践**：所有 Next.js 项目用 next/image + next/font，资源优化 10x。

### 模式 9 · 微前端（Monorepo 增量）

**问题场景**：monorepo 大项目构建慢。

**解决方案**：Turbopack 任务图天然支持 monorepo 增量；只构建改动的 package + 依赖；Nx / Turborepo 配合。

**关键参数**：
- 任务图
- 增量
- monorepo
- Nx / Turborepo
- 0 全量

**最佳实践**：所有 monorepo 用 Turbopack + Turborepo，增量构建 5x。

### 模式 10 · 实验性功能（Server Actions / PPR）

**问题场景**：需要 Server Actions / Partial Prerendering。

**解决方案**：Next.js 15+ `next.config.js` 启用 `experimental: { ppr: true }`；Server Actions `'use server'` 函数直接在 RSC 调用；PPR 静态 + 动态混合。

**关键参数**：
- Server Actions
- `'use server'`
- PPR
- Partial Prerendering
- 混合渲染

**最佳实践**：所有新项目用 Server Actions + PPR，未来 React 趋势。

---

## 三、进阶范式

### 模式 11 · 内置 Server（不需要 Node 起 dev server）

**问题场景**：传统 dev server 启动慢（Next.js Node 启动 5s）。

**解决方案**：Turbopack 内置 server（Rust 写）不需要 Next.js Node bootstrap；`next dev --turbo` 直接起；生产用 `next build` 仍 Node。

**关键参数**：
- 内置 server
- Rust 启动
- `next dev --turbo`
- 0 Node bootstrap
- 1s 启动

**最佳实践**：所有项目 dev 用 Turbopack，build 用 Turbopack beta。

### 模式 12 · 调试 + Source Maps

**问题场景**：Rust 编译后调试难。

**解决方案**：Turbopack 自动生成 source maps（开发模式 inline / 生产模式独立）；Chrome DevTools 自动关联；`--profile` flag 输出性能分析。

**关键参数**：
- source maps 自动
- `--profile`
- Chrome 调试
- 性能分析
- 0 配置

**最佳实践**：所有项目启用 source maps + profile 调优。

### 模式 13 · Turbopack 与 Webpack 兼容性

**问题场景**：现有 Webpack 项目迁移到 Turbopack。

**解决方案**：Turbopack 实现 Webpack 90% loader 兼容；自定义 loader 用 `experimental.turbo.loaders`；`next.config.js` 兼容；`next dev --turbo` 渐进迁移。

**关键参数**：
- 90% 兼容
- `experimental.turbo.loaders`
- 渐进迁移
- 0 重写
- 双栈

**最佳实践**：所有 Webpack 项目用 Turbopack 渐进迁移，5x dev 速度。

### 模式 14 · 大规模应用 benchmark

**问题场景**：100K+ 文件规模 Turbopack 表现。

**解决方案**：Vercel 官方测试：Turbopack dev 启动比 Webpack 快 10x；HMR < 100ms；build（beta）比 Webpack 快 5x；monorepo 100+ packages 增量构建 < 5s。

**关键参数**：
- 100K+ 文件
- 10x dev
- 5x build
- 5s 增量
- 大规模验证

**最佳实践**：所有大规模项目用 Turbopack，性能 5-10x 提升。

### 模式 15 · Turbopack 限制（生产未稳定）

**问题场景**：Turbopack build 还在 beta，部分场景不支持。

**解决方案**：dev 模式 100% 稳定（`next dev --turbo`）；build 仍推荐 Webpack（`next build`）；plugins / 复杂 loader 暂用 Webpack；渐进式 dev 迁移。

**关键参数**：
- dev 稳定
- build beta
- 插件有限
- 渐进迁移
- 0 风险

**最佳实践**：所有项目 dev 用 Turbopack，build 仍用 Webpack（等稳定）。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Next.js + Turbopack 项目。

**解决方案**：7 件套：① `npx create-next-app@latest` 初始化 ② App Router 模式 ③ `next dev --turbo` Turbopack dev ④ RSC Server Component ⑤ `next/image` / `next/font` ⑥ Server Actions ⑦ `.next/cache` CI 缓存。

**关键参数**：
- create-next-app
- App Router
- `--turbo`
- RSC
- next/image
- Server Actions
- CI 缓存

**最佳实践**：所有新 Next.js 项目用 7 件套 + Turbopack dev。

### 模式 17 · 部署到 Vercel / 自托管

**问题场景**：Next.js 怎么部署。

**解决方案**：Vercel 一键部署（最佳体验）；自托管 `next build` + `next start` Node；Docker 多阶段 `node:20-alpine`；Edge Functions 部署到 CDN 边缘；Static Export `output: 'export'`。

**关键参数**：
- Vercel 一键
- `next start`
- Docker
- Edge Functions
- Static Export

**最佳实践**：所有项目首选 Vercel，自托管用 Docker。

### 模式 18 · 性能优化 5 招

**问题场景**：Next.js 应用性能问题。

**解决方案**：5 招优化：① RSC 减少客户端 JS ② Static Generation（SSG）尽可能 ③ `next/image` + `next/font` ④ `dynamic` 懒加载 ⑤ Edge Functions 就近执行。

**关键参数**：
- RSC
- SSG
- next/image
- lazy load
- Edge

**最佳实践**：5 招组合，Next.js 应用 Core Web Vitals 满分。

### 模式 19 · 与 Vite / Remix / Astro 对比

**问题场景**：React 框架选型。

**解决方案**：Turbopack + Next.js 定位「RSC + 边缘 + 生态最大」适合大型；Vite 定位「ESM dev + Rollup 生产」适合 SPA；Remix 定位「Web 标准 + 嵌套路由」适合表单；Astro 定位「Islands 架构 + 多框架」适合内容站。

**关键参数**：
- 速度：Vite > Turbopack dev > Webpack
- 生态：Next.js > Remix > Vite > Astro
- RSC：Next.js > Remix > Vite > Astro
- 内容站：Astro > Next.js > Vite > Remix

**最佳实践**：大型全栈选 Next.js，SPA 选 Vite，内容站选 Astro。

### 模式 20 · 7 天复刻 Turbopack 子集

**问题场景**：想做内部 Rust 写 bundler。

**解决方案**：7 天分 5 步：① Rust 项目 + NAPI 绑定 ② 文件监听 + 模块图 ③ 增量计算引擎 ④ SWC 集成 ⑤ 内置 dev server。

**关键参数**：
- Day 1-2: Rust + NAPI
- Day 3: 模块图
- Day 4: 增量
- Day 5: SWC
- Day 6-7: server

**最佳实践**：7 天复刻「Turbopack 极简版」，完整 Turbopack 复刻需要 2 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\vercel\next.js\crates\turbopack\`
- **大小**: ~50 MB（Rust crates）
- **总文件数**: 数百 Rust + TS 文件
- **关键 commit**: Turbopack beta
- **团队**: Vercel 团队
- **许可**: MIT

## 一句话总结

Turbopack 用「Rust 增量计算引擎 + 持久化缓存 + SWC 编译 + 内置 dev server」让 Webpack 慢的痛点彻底解决，是 Next.js dev 模式的未来（生产 build beta 中）。
