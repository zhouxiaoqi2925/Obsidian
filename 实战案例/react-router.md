# React Router - React 生态路由事实标准

**GitHub**: remix-run/react-router
**Star**: 53k+
**语言**: TypeScript
**主题**: router、react、spa、rsc
**适用场景**: React SPA 路由、SSR 路由、Framework Mode（v7）、Remix 替代

---

## 一、基础范式

### 模式 1 · 三种使用模式（Library / Framework / RSC）

**问题场景**：React 项目路由需求多样（轻量 SPA / 全栈 SSR / RSC）。

**解决方案**：React Router v7 三种模式：① Declarative（`<BrowserRouter><Route>` 旧 API）② Data（`createBrowserRouter` + `loader/action`）③ Framework（`react-router.config.ts` + Vite 插件，Remix 升级）。

**关键参数**：
- Library 模式
- Data Router
- Framework Mode
- Remix 合并
- 5 种 entry

**最佳实践**：所有新项目用 Framework Mode（v7），旧项目用 Data Router 迁移。

### 模式 2 · 路由器对象 + 数据加载（loader / action）

**问题场景**：SPA 路由切换要重新 fetch 数据，状态丢失。

**解决方案**：`createBrowserRouter` 创建路由器，`loader: async ({ params, request }) => data` 在路由切换前并行预加载；`action: async ({ request }) => result` 处理表单提交。

**关键参数**：
- `createBrowserRouter`
- `loader` 数据
- `action` 提交
- `useLoaderData()` 取数
- `useNavigation()` 加载态

**最佳实践**：所有数据路由用 loader / action，自动并行 + 错误边界。

### 模式 3 · 嵌套路由（Nested Routes）

**问题场景**：UI 布局复用（侧边栏 / 顶部栏 / 内容区），需要按 URL 切换部分内容。

**解决方案**：路由嵌套 `<Route path="/dashboard" element={<Layout />}><Route path="stats" element={<Stats />} /></Route>`，父级 Outlet 渲染子路由，路径自动拼接。

**关键参数**：
- 嵌套 `<Route>`
- `<Outlet />` 占位
- 路径拼接
- Layout 复用
- 父子 loader 并行

**最佳实践**：所有中大型 SPA 用嵌套路由，UI 复用 + 数据并行。

### 模式 4 · 动态路由参数（params）

**问题场景**：需要根据 URL 参数加载对应数据（`/users/:id`）。

**解决方案**：`path="users/:id"` 动态段，`useParams()` 取参数；loader 内 `params.id` 拿到，配合 fetch 加载对应数据。

**关键参数**：
- `:id` 占位
- `useParams()`
- `params` in loader
- `*` 通配
- 可选参数

**最佳实践**：所有详情页用动态参数 + loader，避免组件挂载后再 fetch。

### 模式 5 · 错误边界（ErrorBoundary）

**问题场景**：路由组件抛错整个 SPA 崩溃。

**解决方案**：路由 `errorElement: <ErrorBoundary />` 捕获子树错误，UI 优雅降级不崩溃；`useRouteError()` 取错误对象。

**关键参数**：
- `errorElement`
- `useRouteError()`
- 局部边界
- 兜底 UI
- 不崩 SPA

**最佳实践**：所有路由都加 errorElement，根路由兜底。

---

## 二、扩展范式

### 模式 6 · 路由守卫（loader 重定向）

**问题场景**：需要登录后才访问某些页面。

**解决方案**：在 protected 路由的 loader 中检查登录态，未登录 `throw redirect('/login')`；登录后 loader 返回数据。

**关键参数**：
- `throw redirect()`
- loader 守卫
- 401 / 403
- 客户端 + 服务端统一
- 0 闪烁

**最佳实践**：所有需要登录的路由用 loader 守卫，比组件内 `useEffect` 检查更早返回。

### 模式 7 · 编程式导航（useNavigate）

**问题场景**：JS 代码内触发跳转（表单提交后 / 定时器）。

**解决方案**：`useNavigate()` 返回 `navigate('/path')` 函数，支持 `replace: true` / `state: {}` / 数字（前进后退）。

**关键参数**：
- `useNavigate()`
- `navigate(to, opts)`
- `replace`
- `state` 透传
- `(-1)` 后退

**最佳实践**：所有非链接跳转用 `useNavigate`，避免 `window.location.href` 全刷。

### 模式 8 · 搜索参数（searchParams）

**问题场景**：URL 需要带查询参数（`?page=2&sort=name`）。

**解决方案**：`useSearchParams()` 返回 `[searchParams, setSearchParams]`，类似 `useState` 但绑定 URL；`searchParams.get('page')` 取值。

**关键参数**：
- `useSearchParams()`
- `setSearchParams`
- URL 同步
- 浅合并
- 类型推导

**最佳实践**：所有列表筛选 / 分页用 searchParams，URL 可分享 + 浏览器后退。

### 模式 9 · 路由懒加载（lazy + Suspense）

**问题场景**：大 SPA 首屏 bundle 太大。

**解决方案**：路由组件用 `lazy(() => import('./Dashboard'))` + `<Suspense fallback>`，按需加载路由 chunk。

**关键参数**：
- `React.lazy()`
- `<Suspense>`
- 路由 chunk
- 预加载
- 错误边界

**最佳实践**：所有大项目用路由懒加载，首屏 < 200KB。

### 模式 10 · NavLink 高亮 + className 函数

**问题场景**：导航菜单当前项要高亮。

**解决方案**：`<NavLink to="/users" className={({ isActive }) => isActive ? 'active' : ''}>`，className 是函数接收 `{ isActive, isPending, isTransitioning }`。

**关键参数**：
- `<NavLink>`
- `isActive`
- `isPending`
- `end` 严格匹配
- className 函数

**最佳实践**：所有导航菜单用 NavLink，告别手动 location.pathname 判断。

---

## 三、进阶范式

### 模式 11 · 数据变更（useFetcher）

**问题场景**：组件内需要提交数据但不跳转（点赞 / 收藏）。

**解决方案**：`useFetcher()` 返回 `{ submit, formData, state, data }`，不触发导航，可在任意组件内调用 action。

**关键参数**：
- `useFetcher()`
- `fetcher.submit(data)`
- `fetcher.formData` 乐观更新
- `fetcher.load()`
- 0 跳转

**最佳实践**：所有「不跳转的提交」用 useFetcher，UI 立即响应。

### 模式 12 · 路由级 prefetch（prefetchIntent）

**问题场景**：用户 hover 链接时预加载数据，点击时秒开。

**解决方案**：`<Link prefetch="intent">` 用户 hover / focus 时预加载 loader + 组件；`prefetch="render"` 渲染时立即预加载；`prefetch="viewport"` 进入视口。

**关键参数**：
- `prefetch="intent"`
- `prefetch="render"`
- `prefetch="viewport"`
- 链接 + 数据
- 0 配置

**最佳实践**：所有内部链接加 `prefetch="intent"`，UX 提升 50%。

### 模式 13 · Defer + Await 流式渲染

**问题场景**：慢数据源（数据库 / 第三方 API）阻塞首屏。

**解决方案**：loader 用 `return defer({ slow: fetchSlow() })` 不 await，组件用 `<Await resolve={data.slow}>` 配合 `<Suspense>` 流式渲染。

**关键参数**：
- `defer()`
- `<Await resolve>`
- `<Suspense fallback>`
- 流式 HTML
- 渐进增强

**最佳实践**：所有「慢数据 + 快数据混合」场景用 defer + Await。

### 模式 14 · 路由级 prefetch + Cache-Control

**问题场景**：SPA 内嵌 SSR 路由需要 HTTP 缓存。

**解决方案**：Framework Mode 支持自定义 `headers` 函数（loader / action 返回 Response 时设 `Cache-Control`）；配合 CDN 边缘缓存。

**关键参数**：
- `headers` 函数
- `Cache-Control`
- CDN 集成
- 边缘缓存
- SWR

**最佳实践**：所有 SSR 路由用 `Cache-Control: public, max-age=60, stale-while-revalidate=300`。

### 模式 15 · React Router v7 + RSC

**问题场景**：需要 React Server Components。

**解决方案**：Framework Mode v7 + RSC 模式，loader 在服务端运行直接 RSC，客户端只发请求；`react-router/rsc` 单文件声明 RSC。

**关键参数**：
- RSC 集成
- 服务端组件
- 客户端组件
- 零 hydration
- v7+

**最佳实践**：所有新项目用 v7 RSC 模式，未来 React 趋势。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 React Router 项目。

**解决方案**：7 件套：① `createBrowserRouter` 路由表 ② Layout 组件 + `<Outlet />` ③ loader 数据加载 ④ action 提交处理 ⑤ errorElement 错误边界 ⑥ `<Link>` / `<NavLink>` 导航 ⑦ useFetcher 局部提交。

**关键参数**：
- `createBrowserRouter`
- Layout + Outlet
- loader / action
- errorElement
- Link / NavLink
- useFetcher

**最佳实践**：所有新项目用 7 件套 + Data Router 模式。

### 模式 17 · SPA → Framework Mode 迁移

**问题场景**：SPA 项目迁移到 SSR 框架模式。

**解决方案**：5 步迁移：① Vite 加 `@react-router/dev/vite` 插件 ② `react-router.config.ts` 配置 ③ 把 Vite 入口换成 react-router 入口 ④ 路由文件改用 file-based `app/routes/` ⑤ 加 root loader / action。

**关键参数**：
- Vite 插件
- file-based 路由
- 入口替换
- 根 loader
- 渐进迁移

**最佳实践**：所有 SPA 用 v7 升级 SSR，10x UX 提升。

### 模式 18 · 性能优化 5 招

**问题场景**：React Router SPA 性能问题。

**解决方案**：5 招优化：① 路由懒加载 ② `prefetch="intent"` 预加载 ③ loader 并行 ④ Defer + Await 流式 ⑤ CDN 缓存 loader 数据。

**关键参数**：
- 懒加载
- prefetch
- 并行 loader
- Defer
- 缓存

**最佳实践**：5 招组合，首屏 < 1s，跳转 < 200ms。

### 模式 19 · 与 Next.js / TanStack Router / Wouter 对比

**问题场景**：React 路由选型。

**解决方案**：React Router 定位「事实标准 + Framework Mode 完整」适合大多数项目；Next.js 定位「约定优先 + 内置 SSR / RSC」适合 SSR 项目；TanStack Router 定位「类型安全 100%」适合 TS 重项目；Wouter 定位「1KB 极简」适合迷你项目。

**关键参数**：
- 学习曲线：Wouter < React Router < TanStack < Next.js
- SSR：Next.js > React Router > TanStack > Wouter
- TS 体验：TanStack > React Router > Next.js > Wouter
- 生态：React Router > Next.js > TanStack > Wouter

**最佳实践**：中大型选 React Router v7，TS 重选 TanStack，全栈选 Next.js。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork React Router 做内部路由库。

**解决方案**：7 天分 5 步：① History API 封装 ② 路径匹配算法 ③ Router Context + Provider ④ Outlet 嵌套渲染 ⑤ useNavigate / useParams Hook。

**关键参数**：
- Day 1-2: History
- Day 3: 匹配
- Day 4: Context
- Day 5: Outlet
- Day 6-7: Hooks

**最佳实践**：7 天复刻「SPA 路由」，完整 React Router（含 SSR / RSC）需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\react-router\`
- **大小**: ~30 MB
- **总文件数**: 数百 TS 文件
- **关键 commit**: v7.x（Framework Mode）
- **团队**: Remix 团队主导 + 社区
- **许可**: MIT

## 一句话总结

React Router 用「路由即数据 + 嵌套 Outlet + loader/action 统一 SSR/CSR + v7 Framework Mode」成为 React 路由事实标准，是 SPA / SSR / RSC 三栖路由库。
