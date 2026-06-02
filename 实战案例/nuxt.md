# Nuxt - Vue 全栈 Web 框架

**GitHub**: nuxt/nuxt
**Star**: 81k
**语言**: TypeScript
**主题**: 全栈Web框架、Vue、SSR、Nitro
**适用场景**: 中大型 Vue 应用、需要 SEO/性能的内容/电商/SaaS 站、独立开发者

---

## 一、基础范式

### 模式 1 · 约定式目录 + 文件路由

**问题场景**：手写 vue-router 配置在大型项目难维护，团队成员路由命名风格不统一。

**解决方案**：Nuxt 用 `pages/` 目录文件名直接定义路由，`index.vue` → `/`，`blog/[slug].vue` → `/blog/:slug`，动态参数 / 嵌套 / catch-all 全部走文件名约定。

**关键参数**：
- `pages/index.vue` → `/`
- `pages/blog/[slug].vue` → `/blog/:slug`
- `pages/[...slug].vue` catch-all
- `definePageMeta({ middleware: 'auth' })` 元数据
- `pages/(group)/` 分组不影响 URL

**最佳实践**：超过 20 个路由用文件式路由，手写 route config 不可维护。

### 模式 2 · 三种渲染模式（SSR/SSG/SPA）

**问题场景**：Vue SPA 不利于 SEO 和首屏，需要 SSR 能力。

**解决方案**：Nuxt 用单 `nuxt.config.ts` 文件切换 `ssr: true/false`，`routeRules` 按路由配置不同渲染策略：`{ prerender: true }` SSG / `{ ssr: true }` SSR / `{ ssr: false }` SPA。

**关键参数**：
- `ssr: true` 全局 SSR
- `routeRules: { '/blog/**': { prerender: true } }` SSG
- `routeRules: { '/api/**': { cors: true } }` CORS
- `routeRules: { '/admin/**': { ssr: false } }` SPA
- `nitro.prerender.routes` 预渲染列表

**最佳实践**：内容/博客用 prerender，电商商品页用 SSR，后台用 SPA。

### 模式 3 · 自动导入（Auto Import）

**问题场景**：每个组件都要 `import { ref, computed } from 'vue'` + 各种组件库，重复模板代码。

**解决方案**：Nuxt 集成 `unimport`，自动扫描 `composables/` / `utils/` / `components/` 目录下的所有 export，无需 import 直接用。

**关键参数**：
- `composables/*.ts` 自动导入
- `utils/*.ts` 自动导入
- `components/*.vue` 自动导入
- `imports.dirs` 自定义扫描目录
- `imports.scan` 启动时扫描

**最佳实践**：所有 composables 放 `composables/` 目录，工具函数放 `utils/`，组件放 `components/`。

### 模式 4 · Nitro Server 引擎

**问题场景**：Nuxt 的 server 部分需要跨平台部署（Vercel/Netlify/Cloudflare/Node/Deno/Bun）。

**解决方案**：`Nitro` 是 Nuxt 的 server 引擎，把 Express/Koa 风格的 h3 框架打包成单一 `.output/` 目录，跨 12+ 平台部署。

**关键参数**：
- `server/api/*.ts` 路由
- `h3` 框架
- `.output/server/index.mjs` 入口
- 12+ 平台 preset
- `nitro.prerender` SSG 预渲染

**最佳实践**：API 路由放 `server/api/`，middleware 放 `server/middleware/`，跨平台部署用 Nitro preset。

### 模式 5 · useAsyncData + useFetch

**问题场景**：SSR 期间数据获取，CSR 复用相同数据，重复写 fetcher + 状态管理。

**解决方案**：`useAsyncData('key', () => fetch(...))` 在 SSR 时获取并序列化到 payload，CSR 端从 payload 反序列化复用；`useFetch` 是 `useAsyncData` + `$fetch` 的语法糖。

**关键参数**：
- `useAsyncData('todos', () => $fetch('/api/todos'))`
- `useFetch('/api/todos')` 简写
- `key` 唯一标识
- `default: () => []` 默认值
- `transform: (data) => data` 转换

**最佳实践**：所有 SSR 数据获取用 useAsyncData/useFetch，key 必须唯一。

---

## 二、扩展范式

### 模式 6 · 模块系统（Modules）

**问题场景**：第三方集成（如 @nuxtjs/tailwindcss）如何自动注册插件/组件/路由。

**解决方案**：`defineNuxtModule` 定义模块，`modules: ['@nuxtjs/tailwindcss']` 一行启用；模块在 setup 阶段执行 `addComponent` / `addImports` / `addServerHandler` 等 API。

**关键参数**：
- `defineNuxtModule({ meta, defaults, setup })` 工厂
- `nuxt.callHook('module:done', ...)` 钩子
- `addComponent({ name, export })`
- `addImports({ from, name })`
- `addServerHandler({ route, handler })`

**最佳实践**：所有第三方集成都封装成 module，团队内可复用的逻辑也封装成 module。

### 模式 7 · Layer 层级覆盖

**问题场景**：多团队多主题复用基础框架，每个团队定制自己的 UI 和配置。

**解决方案**：Nuxt 3+ 的 `extends: ['../base-layer']` 机制，Layer 0 是 base，Layer 1+ 覆盖 base 的 `components/` / `pages/` / `nuxt.config.ts` / `composables/`，深度合并。

**关键参数**：
- `extends: ['./base']` 单继承
- `extends: ['./a', './b']` 多继承
- `pages/` 后置覆盖
- `composables/` 后置覆盖
- `nuxt.config.ts` 浅合并

**最佳实践**：企业级 monorepo 用 Layer 共享基础代码，每个 app 是顶层 layer。

### 模式 8 · Hookable 钩子总线

**问题场景**：模块间通信用 EventEmitter 难管理生命周期。

**解决方案**：`hookable` 是 Nuxt 的钩子总线，`nuxt.hook('ready', () => {})` 监听，`nuxt.callHook('custom', payload)` 触发；20+ 内置钩子（modules:done / build:before / app:created 等）。

**关键参数**：
- `nuxt.hook('build:before', () => {})` 监听
- `nuxt.callHook('module:done', module)` 触发
- 20+ 内置钩子
- 优先级参数
- 异步支持

**最佳实践**：写 module 时大量使用 hookable，避免直接操作 nuxt 实例内部状态。

### 模式 9 · 多 Builder（Vite / Webpack / Rspack）

**问题场景**：不同团队偏好不同构建工具（Vite 快 / Webpack 稳 / Rspack Rust 快）。

**解决方案**：`@nuxt/vite-builder` / `@nuxt/webpack-builder` / `@nuxt/rspack-builder` 三个独立包，`builder: 'vite' | 'webpack' | 'rspack'` 切换。

**关键参数**：
- `builder: 'vite'` 默认
- `builder: 'webpack'` 稳定
- `builder: 'rspack'` Rust 加速
- Vite 5+
- Rspack 0.5+

**最佳实践**：新项目用 Vite，老项目维持 Webpack，团队偏好 Rspack 可切。

### 模式 10 · 内置 UI Templates（错误页 + 欢迎页）

**问题场景**：错误页（404/500）需要手写，欢迎页需要初始化引导。

**解决方案**：`@nuxt/ui-templates` 提供 10+ 套现成模板：`error-404.vue` / `error-500.vue` / `welcome.vue`，可直接覆盖。

**关键参数**：
- `error.vue` 自定义错误页
- `app.vue` 自定义根组件
- `error: { layout: 'error' }` 配置
- 10+ 内置模板
- 可定制颜色

**最佳实践**：所有项目都覆盖 `error.vue` 提供品牌化 404 页。

---

## 三、进阶范式

### 模式 11 · Server Middleware + 跨域

**问题场景**：需要在 SSR 期间拦截请求做权限校验 / 日志 / 跨域。

**解决方案**：`server/middleware/*.ts` 在 SSR 阶段执行，`defineEventHandler` + `getHeader` / `setHeader` 读写请求；`nitro.routeRules` 配 CORS / Cache。

**关键参数**：
- `server/middleware/auth.ts`
- `event.node.req` / `event.node.res`
- `routeRules: { '/api/**': { cors: true } }`
- 全局 middleware
- 顺序执行

**最佳实践**：跨域 / 鉴权 / 日志用 `server/middleware/`，业务 API 用 `server/api/`。

### 模式 12 · plugins/ 客户端插件

**问题场景**：Vue 插件（如 i18n / pinia）需要在客户端初始化。

**解决方案**：`plugins/*.ts` 自动注册，`defineNuxtPlugin((nuxtApp) => {})` 工厂；`.client.ts` 后缀只跑客户端，`.server.ts` 后缀只跑服务端。

**关键参数**：
- `plugins/i18n.ts` 全平台
- `plugins/analytics.client.ts` 客户端
- `plugins/auth.server.ts` 服务端
- `nuxtApp.vueApp.use(pinia)`
- `order: 1` 顺序

**最佳实践**：Vue 插件放 `plugins/`，`.client.ts` 区分 SSR 不可用的库（localStorage / window）。

### 模式 13 · runtimeConfig 运行时配置

**问题场景**：环境变量（API key、数据库密码）需要按 dev/staging/prod 区分。

**解决方案**：`runtimeConfig` 分为 `public`（暴露到客户端）和私有（仅服务端），`NUXT_API_KEY` 环境变量自动注入到 `runtimeConfig.apiKey`。

**关键参数**：
- `runtimeConfig.apiSecret` 私有
- `runtimeConfig.public.apiBase` 公开
- `NUXT_API_SECRET` env 覆盖
- `useRuntimeConfig()` 客户端/服务端
- 类型推导

**最佳实践**：所有环境变量走 runtimeConfig，敏感信息放私有。

### 模式 14 · Nitro 路由规则 routeRules

**问题场景**：URL 维度配置 SSR/SSG/CORS/Cache/Redirect/Headers 策略。

**解决方案**：`routeRules` 是 Nitro 的核心创新，按 URL pattern 声明策略：prerender SSG / ssr / cors / cache / redirect / headers。

**关键参数**：
- `prerender: true` SSG
- `ssr: false` SPA
- `cors: true` CORS
- `cache: { maxAge: 3600 }` 缓存
- `redirect: '/new'` 重定向
- `headers: { 'X-Frame-Options': 'DENY' }`

**最佳实践**：URL 维度策略用 routeRules，组件维度用 middleware。

### 模式 15 · payload 序列化 + SSR hydration

**问题场景**：SSR 渲染的 HTML + 数据怎么传给客户端做 hydration。

**解决方案**：Nitro 把 `useAsyncData` / `useState` 的数据序列化到 `__NUXT__` window 全局，客户端启动时从 window 读取并 hydrate。

**关键参数**：
- `__NUXT__.data` 序列化数据
- `useState('key', init)` 跨 SSR/CSR
- `useAsyncData` 自动 payload
- `payloadExtractor` 自定义
- `experimental.payloadExtraction`

**最佳实践**：理解 payload 序列化是优化 SSR 性能的关键。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：新项目从零搭 Nuxt。

**解决方案**：`npx nuxi@latest init app-name` 7 件套：app.vue（根组件）/ nuxt.config.ts（配置）/ pages/index.vue（首页）/ components/（自动导入组件）/ composables/（自动导入逻辑）/ server/api/（API 路由）/ public/（静态资源）。

**关键参数**：
- `nuxi init` 初始化
- `npm run dev` 开发
- `npm run build` 构建
- `npm run preview` 预览
- `nuxi module add` 加模块

**最佳实践**：所有项目都用 `nuxi init` 起手，TS + ESLint + Tailwind 一次性到位。

### 模式 17 · 部署 12 平台 preset

**问题场景**：不同部署平台（Vercel/Netlify/Cloudflare/Node/Deno/Bun）需要不同构建。

**解决方案**：Nitro 提供 12+ preset：`nitro deploy --preset=vercel` / `--preset=netlify` / `--preset=cloudflare-pages` / `--preset=node-server` / `--preset=deno-deploy` 等。

**关键参数**：
- Vercel preset
- Cloudflare preset
- Node preset
- Deno preset
- Bun preset
- 12+ 平台

**最佳实践**：MVP 用 Vercel，中大型用 Cloudflare Pages/Workers，私有化用 Node。

### 模式 18 · 性能优化 7 招

**问题场景**：Core Web Vitals 不达标。

**解决方案**：7 招：① routeRules prerender SSG ② 组件懒加载 `defineAsyncComponent` ③ 图片用 `<NuxtImg>` ④ 字体子集化 ⑤ payload 精简（useAsyncData 选必要字段）⑥ 关键 CSS 内联 ⑦ service worker 缓存。

**关键参数**：
- LCP < 2.5s
- routeRules prerender
- NuxtImg 自动 WebP
- font subset
- payload 50KB

**最佳实践**：性能优化从 routeRules SSG + NuxtImg + 组件懒加载三件套开始。

### 模式 19 · 与 Next / Remix / SvelteKit 对比

**问题场景**：选型在 Nuxt / Next / Remix / SvelteKit 之间。

**解决方案**：Nuxt 定位「Vue 生态 + 自动导入 + 跨平台」适合 Vue 团队；Next 定位「React 生态 + Vercel 部署」适合大众；Remix 定位「Web 标准 + 数据加载」适合全栈；SvelteKit 定位「小而美」适合小项目。

**关键参数**：
- Star: Next 130k > Nuxt 81k > Remix 30k > SvelteKit 18k
- 自动导入: Nuxt > 其他
- 跨平台: Nitro 12+ 平台
- 学习曲线: SvelteKit < Nuxt < Remix < Next

**最佳实践**：Vue 团队选 Nuxt，React 团队选 Next，全栈团队选 Remix。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Nuxt 做内部框架。

**解决方案**：7 天分 6 步：① 文件式路由 ② useAsyncData + useFetch ③ 自动导入扫描 ④ Vite 集成 ⑤ Nitro 简化版 ⑥ hookable 钩子。

**关键参数**：
- Day 1: 文件式路由
- Day 2: useAsyncData
- Day 3: 自动导入
- Day 4: Vite
- Day 5: Nitro
- Day 6: hookable
- Day 7: 文档

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 Nuxt 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\nuxt\`
- **大小**: ~30 MB
- **总文件数**: 数千 TS/Vue 文件
- **关键 commit**: v4.x
- **团队**: Nuxt SAS + 数百位社区维护者
- **许可**: MIT

## 一句话总结

Nuxt 用「约定式目录 + 自动导入 + Nitro 跨平台 + 多种渲染模式」把 Vue 全栈开发体验做到极致，是 Vue 生态唯一一个把「SSR/SSG/SPA 切换像换 config 一样简单」的框架。
