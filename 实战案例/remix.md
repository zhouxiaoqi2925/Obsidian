# Remix - Web 标准之上的全栈 React 框架

**GitHub**: remix-run/remix
**Star**: 32k+
**语言**: TypeScript
**主题**: fullstack、react、ssr、web-standards
**适用场景**: 全栈 React 应用、表单密集型、渐进增强、迁移到 React Router v7

---

## 一、基础范式

### 模式 1 · loader / action + Web 标准 Request/Response

**问题场景**：传统 SSR 框架（Next.js Pages）有私有 API，难用平台原生能力。

**解决方案**：Remix 用 Web 标准 `Request` / `Response` / `fetch` API，loader 返回 `Response.json(data)`，action 接收 `Request.formData()`；不发明新概念。

**关键参数**：
- Web 标准
- `Request` / `Response`
- `loader` 返回 Response
- `action` 处理提交
- 0 私有 API

**最佳实践**：所有 Remix 项目用 Web 标准 API，0 锁定。

### 模式 2 · 文件路由（File-based Routes）

**问题场景**：路由配置中心化（`routes.ts`）难维护。

**解决方案**：Remix 用文件路由 `app/routes/dashboard.tsx`（`/dashboard`）+ `app/routes/users.$id.tsx`（`/users/:id`）+ `app/routes/dashboard._index.tsx`（嵌套）；点分隔符表达嵌套。

**关键参数**：
- `app/routes/`
- `users.$id.tsx` 动态
- `dashboard._index.tsx` 嵌套
- `dashboard.tsx` 父布局
- 点语法

**最佳实践**：所有 Remix 项目用文件路由，告别路由配置地狱。

### 模式 3 · 嵌套布局（Nested Layouts）

**问题场景**：UI 布局复用（侧边栏 + 顶部 + 内容）。

**解决方案**：父路由 `dashboard.tsx` 渲染 `<Outlet />`，子路由 `dashboard._index.tsx` / `dashboard.settings.tsx` 自动套入；父子 loader 并行加载。

**关键参数**：
- `<Outlet />`
- 父子并行 loader
- 路径拼接
- Layout 复用
- 数据并行

**最佳实践**：所有中大型 Remix 项目用嵌套布局，UI + 数据自动复用。

### 模式 4 · 表单 + 渐进增强

**问题场景**：JS 加载前表单提交不工作。

**解决方案**：`<Form method="post">` 替代 `<form>`，无 JS 时浏览器原生提交，有 JS 时拦截 fetch action；`useNavigation()` 取提交状态。

**关键参数**：
- `<Form method>`
- 无 JS 也能用
- `useNavigation`
- 渐进增强
- 0 SPA 锁定

**最佳实践**：所有 Remix 表单用 `<Form>`，JS 失败也能提交。

### 模式 5 · 错误边界（ErrorBoundary）

**问题场景**：loader 抛错整个应用崩溃。

**解决方案**：路由文件 `export function ErrorBoundary() { return <div>Error</div> }` 兜底；`useRouteError()` 取错误。

**关键参数**：
- `ErrorBoundary` 导出
- `useRouteError()`
- 局部兜底
- 根 boundary
- 不崩

**最佳实践**：所有路由都导出 ErrorBoundary，根路由兜底。

---

## 二、扩展范式

### 模式 6 · 嵌套路由 + 数据并行加载

**问题场景**：父子路由数据需要并行加载，瀑布流慢。

**解决方案**：Remix 路由 loader 在导航时并行调用（不是父等子），loader 通过 `Promise.all` 收集数据；`useLoaderData()` 取本路由数据，`useMatches()` 取所有父级数据。

**关键参数**：
- 并行 loader
- `useMatches()`
- `Promise.all`
- 0 瀑布流
- 性能优

**最佳实践**：所有 Remix 项目用嵌套 loader + 并行 fetch，UX 提升 5x。

### 模式 7 · useFetcher 局部数据提交

**问题场景**：组件需要提交数据但不跳转（点赞 / 搜索）。

**解决方案**：`useFetcher()` Hook 返回 `{ Form, submit, state, data }`，提交到指定 action，UI 立即响应；适合多组件共享状态。

**关键参数**：
- `useFetcher()`
- `fetcher.submit(data, { method: 'post' })`
- 乐观更新
- 多组件独立
- 0 跳转

**最佳实践**：所有「不跳转的提交」用 useFetcher，UX 极佳。

### 模式 8 · Resource Routes（无 UI 路由）

**问题场景**：需要纯 API 路由返回 JSON。

**解决方案**：路由文件 `app/routes/api.users.tsx` 只导出 `loader` 返回 `Response.json()` 不导出组件；前端 fetch 调用。

**关键参数**：
- Resource Route
- 只有 loader
- JSON 返回
- 0 组件
- API 端点

**最佳实践**：所有 Remix 项目用 Resource Route 提供 API，与 UI 路由统一。

### 模式 9 · 路由级 prefetch

**问题场景**：用户 hover 链接时预加载数据。

**解决方案**：`<Link prefetch="intent">` 触发 hover 时预加载 loader + 组件；`prefetch="render"` 渲染时立即预加载。

**关键参数**：
- `prefetch="intent"`
- `prefetch="render"`
- `prefetch="viewport"`
- 0 配置
- 链接 + 数据

**最佳实践**：所有内部链接加 `prefetch="intent"`，UX 提升 50%。

### 模式 10 · Cookie / Session 抽象

**问题场景**：用户登录态 / 偏好需要持久化。

**解决方案**：`createCookieSessionStorage({ cookie: { name: 'session', secrets: [...] } })` 抽象 cookie 存储；`session.get('userId')` / `session.set('userId', 1)`。

**关键参数**：
- `createCookieSessionStorage`
- 签名 cookie
- `session.get` / `set`
- 加密
- 服务端

**最佳实践**：所有 Remix 项目用 Session 抽象，告别手写 cookie 加密。

---

## 三、进阶范式

### 模式 11 · Server Modules（仅服务端代码）

**问题场景**：需要 Node-only 模块（fs / 数据库驱动）又不能打包到客户端。

**解决方案**：`.server.ts` 后缀文件 Remix 自动 tree-shake 不打包到客户端；`.client.ts` 反之；`*.server` 用于 Node API。

**关键参数**：
- `.server.ts`
- `.client.ts`
- 自动 tree-shake
- 0 客户端泄漏
- 数据库驱动

**最佳实践**：所有 Node-only 依赖用 `.server.ts` 命名约定。

### 模式 12 · Streaming + Defer 慢数据

**问题场景**：慢数据源（数据库 / 第三方 API）阻塞首屏。

**解决方案**：`defer({ slow: fetchSlow() })` 不 await，组件 `<Await resolve={data.slow}>` + `<Suspense>` 流式渲染，先发快数据再发慢数据。

**关键参数**：
- `defer()`
- `<Await resolve>`
- `<Suspense>`
- 流式 HTML
- 渐进增强

**最佳实践**：所有「慢数据 + 快数据」混合场景用 defer + Await。

### 模式 13 · ESM + 编译优化

**问题场景**：打包慢，SSR 启动慢。

**解决方案**：Remix 内置 esbuild 编译，ESM 模块；`serverBuildPath` 缓存；`future.unstable_singleFetch` 合并 loader 调用。

**关键参数**：
- esbuild
- ESM
- 编译缓存
- single fetch
- 0 配置

**最佳实践**：所有 Remix 项目用 ESM 入口 + esbuild 编译，10x 启动速度。

### 模式 14 · 部署适配（Node / Cloudflare / Deno / Bun）

**问题场景**：Remix 项目需要部署到不同平台。

**解决方案**：Remix 提供 server build 适配：Node (`@remix-run/node`)、Cloudflare Workers (`@remix-run/cloudflare`)、Deno、Bun；同套代码 4 平台部署。

**关键参数**：
- `@remix-run/node`
- `@remix-run/cloudflare`
- 适配器
- 4 平台
- 同代码

**最佳实践**：所有 Remix 项目选适配器部署，平台无锁定。

### 模式 15 · 迁移到 React Router v7

**问题场景**：Remix v2 升级到 React Router v7（合并）。

**解决方案**：5 步迁移：① `npx react-router migrate` 自动 codemod ② `import` 改 `@react-router/*` ③ Vite 插件替换 Remix 插件 ④ `remix.config.js` 改 `react-router.config.ts` ⑤ 路由文件 `app/routes/` 不变。

**关键参数**：
- codemod
- 导入改名
- Vite 插件
- 配置改名
- 路由不变

**最佳实践**：所有 Remix v2 项目升级 v7，未来是 React Router 统一。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Remix 项目。

**解决方案**：7 件套：① Vite + Remix 插件 ② `app/root.tsx` 根布局 ③ `app/routes/` 路由文件 ④ loader + action ⑤ `<Form>` + `useFetcher` ⑥ Session 抽象 ⑦ ErrorBoundary。

**关键参数**：
- Vite + Remix
- root.tsx
- routes/
- loader/action
- Form/Fetcher
- Session
- ErrorBoundary

**最佳实践**：所有新项目用 7 件套 + Remix Vite 5 分钟跑起来。

### 模式 17 · 表单设计（受控 + 乐观更新）

**问题场景**：表单提交等待响应慢。

**解决方案**：`<fetcher.Form>` + `useFetcher` + 乐观更新 `fetcher.formData` 取提交中数据，UI 立即显示；失败回滚。

**关键参数**：
- `fetcher.Form`
- `formData` 乐观
- 失败回滚
- UX 即时
- 0 等待

**最佳实践**：所有 Remix 表单用乐观更新，UX 提升 5x。

### 模式 18 · 性能优化 5 招

**问题场景**：Remix 应用性能问题。

**解决方案**：5 招优化：① `defer` + Await ② `prefetch="intent"` ③ Resource Route 拆分 ④ 缓存 loader ⑤ 嵌套 loader 并行。

**关键参数**：
- `defer`
- `prefetch`
- Resource Route
- 缓存
- 并行

**最佳实践**：5 招组合，Remix 应用性能极佳。

### 模式 19 · 与 Next.js / SvelteKit / Nuxt 对比

**问题场景**：全栈 React 框架选型。

**解决方案**：Remix 定位「Web 标准 + 渐进增强 + 表单优先」适合表单密集；Next.js 定位「约定优先 + 生态最大」适合大型；SvelteKit 定位「Svelte 框架」适合 Svelte 项目；Nuxt 定位「Vue 框架」适合 Vue。

**关键参数**：
- Web 标准：Remix > Next.js > Nuxt > SvelteKit
- 生态：Next.js > Nuxt > Remix > SvelteKit
- 表单：Remix > Next.js > Nuxt > SvelteKit
- 学习曲线：SvelteKit < Nuxt < Remix < Next.js

**最佳实践**：表单密集 + Web 标准选 Remix，全栈大型选 Next.js。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Remix 做内部框架。

**解决方案**：7 天分 5 步：① Vite 插件加载路由 ② `Request` / `Response` 包装 loader ③ `<Outlet />` 嵌套渲染 ④ `<Form>` 渐进增强 ⑤ ErrorBoundary 兜底。

**关键参数**：
- Day 1-2: Vite 插件
- Day 3: loader
- Day 4: Outlet
- Day 5: Form
- Day 6-7: ErrorBoundary

**最佳实践**：7 天复刻「极简 Remix」，完整 Remix 复刻需要 6 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\remix\`
- **大小**: ~30 MB
- **总文件数**: 数百 TS 文件
- **关键 commit**: v2.x（v7 后并入 react-router）
- **团队**: Remix 团队 + 社区
- **许可**: MIT

## 一句话总结

Remix 用「Web 标准 Request/Response + 嵌套路由 + loader/action 统一 + Form 渐进增强」让 React 全栈开发回归 Web 平台原生能力，是表单密集型应用的最佳框架。
