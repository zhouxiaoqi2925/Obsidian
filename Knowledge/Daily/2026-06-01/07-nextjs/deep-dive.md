# Next.js 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：RSC 思想 — 重新定义"前端"

### 传统 SSR 的痛
```
Client ←→ Server
   HTML + JS bundle
```
- bundle 巨大（几 MB）
- 即便 server component 也要 hydrate（re-render on client）
- SEO 好但交互慢

### RSC 的革命
```
Server Component (DB/FS 直接读)  ─┐
                                  ├─→ RSC payload (二进制) ─→ Client
Client Component (useState/...)  ─┘
```
- Server Component 永不进 bundle
- 客户端只 hydrate 标了 `'use client'` 的
- 减少 30-90% bundle

### 三种渲染
| 模式 | 何时 | 谁渲染 |
|------|------|--------|
| SSR | 每次请求 | server |
| SSG | 构建时 | server (静态) |
| ISR | 定期 revalidate | server (缓存) |
| CSR | 客户端 | client |
| RSC | server | server (流式) |

---

## 专题 2：App Router 路由系统

### 约定式路由
```
app/
├── page.tsx                /         (页面)
├── layout.tsx              /         (布局, 嵌套)
├── loading.tsx             /         (Suspense fallback)
├── error.tsx               /         (ErrorBoundary)
├── not-found.tsx           /         (404)
├── blog/
│   ├── page.tsx            /blog
│   └── [slug]/
│       └── page.tsx        /blog/:slug
├── (marketing)/            (路由组, 不影响 URL)
└── api/
    └── route.ts            GET/POST handler
```

### 特殊文件语义
- `layout.tsx`：必须包 `children`，跨路由共享
- `template.tsx`：每次 re-render (类似 keyed list)
- `loading.tsx`：Suspense 边界
- `error.tsx`：error boundary
- `not-found.tsx`：404
- `route.ts`：API endpoint

### 路由组 vs 平行路由 vs 拦截路由
- `(group)`：不影响 URL
- `@slot`：平行路由 (e.g. modal + main)
- `(.)photo` / `(..)photo`：拦截路由 (e.g. 模态预览)

---

## 专题 3：流式渲染（Streaming）

### 传统 SSR
```
   ┌──────┐
   │ HTML │ (整页一起返)
   └──────┘
     2s+
```

### 流式 SSR
```
   ┌─头部 100ms
   └─<Suspense>
       ┌─HTML 头壳 100ms
       └─<Suspense>
           ┌─HTML 内容 500ms
           └─<Suspense>
               ┌─慢 IO 1.5s
```
- 用户先看到 shell，后慢内容再 flush
- 改善 TTFB + 体感速度

### 关键技术
- **HTML chunks**：每 chunk 一段 HTML
- **Inlined RSC payload**：和 HTML 一起流
- **Hydrate 进度**：用户可点已 hydrate 部分

---

## 专题 4：Server Actions 端到端

### 传统流程
```
Client form → fetch → API route → server → DB → response → setState
```
- 5 层

### Server Actions
```
<form action={serverAction}>
```
- 1 层：函数直调
- 自动序列化、错误处理、pending 状态
- `'use server'` 标记

### 内部实现
1. 编译时把 serverAction 序列化为 ref
2. 客户端 form submit → POST 到 server
3. server 反序列化 → 调函数
4. 流式返回 RSC payload 更新
5. 客户端用新的 state 重新渲染

### 配 useFormStatus / useFormState
- `useFormStatus()`：拿 pending 状态
- `useFormState()`：拿返回值 (e.g. error)

---

## 专题 5：5 段必读代码逐段详解

### 5.1 `app-render.tsx:renderToHTMLOrFlight` — 渲染入口
**关键**：并行 render RSC + HTML
- RSC payload: Server Components 树
- HTML: 含 Client Components 占位
- 二者并行 + 流式 flush

### 5.2 `ReactFlightServer.js:renderToReadableStream` — RSC 序列化
**关键**：自定义紧凑协议
- `$L1`/`$@1`/`$1`: 引用/数组/对象
- Promise: 遇 await 立刻 flush
- moduleMap: client 组件 manifest

### 5.3 `app-router.tsx:AppRouter` — 客户端路由
**关键**：双树 + Router state
- RSC payload + Client Components 树
- 导航 push/replace 不刷新
- streaming + Suspense 边界

### 5.4 `base-server.ts:pipeline` — 请求 pipeline
**关键**：URL → 路由 → render
- match 找 page/layout
- render 调 renderToHTMLOrFlight
- 流式 sendPayload

### 5.5 `next-server.ts:NextServer` — 启动入口
**关键**：HTTP server + middleware
- dev: HMR
- prod: 编译产物 + 缓存
- middleware: 边缘函数改 req/res

---

## 专题 6：性能调优

### 编译期
```js
// next.config.js
module.exports = {
  // 静态资源
  compress: true,
  // 图片优化
  images: { formats: ['image/avif', 'image/webp'] },
  // 包分析
  bundleAnalyzer: '@next/bundle-analyzer',
  // 编译器 (实验)
  experimental: { optimizePackageImports: ['lodash'] },
}
```

### 数据缓存
```ts
// fetch 默认 GET 缓存
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 60 },  // ISR 60s
  // cache: 'no-store'    // 永不缓存
})
// unstable_cache 包装函数
const getData = unstable_cache(fn, [], { revalidate: 60 })
```

### 客户端 bundle
- 优先用 Server Component
- `'use client'` 边界尽量低
- `next/dynamic` 懒加载
- 第三方库用 `optimizePackageImports`

### 监控
```ts
// next.config.js
experimental: {
  instrumentationHook: './instrumentation.ts',
}
// instrumentation.ts
export async function register() {
  await import('./monitoring')
}
```

---

## 专题 7：故障排查

### F1：Hydration mismatch
```jsx
// 症状: "Hydration failed because the initial UI does not match"
// 原因: SSR HTML ≠ client 首次 render
// 排查:
// 1. 时间相关 (new Date() SSR vs CSR 不同)
// 2. 随机数 (Math.random())
// 3. 浏览器 API (window, localStorage) 没在 useEffect 里用
// 解法: useEffect 内访问, 或用 suppressHydrationWarning
```

### F2：RSC error 不显示
```jsx
// 症状: RSC 组件错, 整个页面 500
// 排查:
// 1. 看 console server 日志
// 2. 加 error.tsx 边界
// 3. 加 'use client' 标记 fall back
```

### F3：Server Action 调不通
```jsx
// 症状: "Failed to fetch"
// 原因:
// 1. action 没标 'use server'
// 2. server function 返回值不可序列化
// 3. middleware 拦截了 POST
```

### F4：Streaming 卡住
```jsx
// 症状: HTML 头出来了, 慢内容永远不出
// 排查:
// 1. 检查 await 是否 await 了同步代码
// 2. 是不是有死锁 (e.g. 单线程调自己)
// 3. <Suspense> 边界放对没
```

### F5：Build 失败
```bash
# 常见:
# 1. 用了浏览器 API (window) 但没 'use client'
# 2. import 了 server-only 包到 client
# 3. 动态 import 路径错
next build --debug
```

---

## 专题 8：复用模式

### 模式 A：流式 + Suspense
**场景**：任何慢 IO 服务端渲染
- E-commerce 商品页
- Dashboard 报表
- 视频转码状态

### 模式 B：Server + Client 边界划分
**场景**：表单 + 重交互
- 表单提交: Server Action
- 即时校验: Client hook
- 重交互: Client

### 模式 C：约定式路由
**场景**：内部 admin / 多页应用
- 文件系统即路由
- 减少路由配置
- 嵌套 layout 天然支持

### 模式 D：RSC + Edge Runtime
**场景**：低延迟全球部署
- Edge: 用户附近节点
- RSC: 服务端渲染
- 静态资源 + 动态 RSC 分离

---

## 专题 9：实战部署

### Vercel（最佳集成）
```bash
# 一行部署
vercel
# 自动 HTTPS, 全球边缘, ISR
```

### 自托管 (Docker)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### 静态导出 (SSG only)
```js
// next.config.js
module.exports = {
  output: 'export',
  // 用 next/image 配 unoptimized: true
}
```

### K8s
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nextjs
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: nextjs
        image: my-nextjs:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
```

### 边缘 + RSC
- Cloudflare Workers
- Vercel Edge
- AWS Lambda@Edge
- 注意：edge runtime 不能用 Node API

---

## 专题 10：Next.js 让我重新思考的 5 件事

1. **前端 ≠ SPA**。RSC 让 SSR 重新伟大, 减少 bundle 90%。
2. **约定 > 配置**。文件系统即路由, 减少决策疲劳。
3. **边界 = 性能**。`'use client'` 用在刀刃上, 其余全 server。
4. **流式 = 体感**。用户先看到 shell, 慢 IO 后补。
5. **AI 时代前端 = AI 渲染的 UI**。RSC 这种结构天然适合 AI 输出的"内容流"。


---

## 专题 11：App Router 深度 — 文件即路由的工程化

### 路由优先级

```
路由解析顺序 (高到低):
1. 静态路由: app/blog/page.tsx → /blog
2. 动态路由: app/blog/[slug]/page.tsx → /blog/:slug
3. catch-all: app/blog/[...slug]/page.tsx → /blog/*
4. 平行路由: app/@modal/...
5. 拦截路由: app/(..)photo/[id]/page.tsx
```

### 关键差异 vs Pages Router

| 维度 | Pages Router | App Router |
|------|--------------|------------|
| 路由文件 | `pages/*.tsx` | `app/**/page.tsx` |
| Layout | `_app.tsx` (单根) | 嵌套 layout.tsx (每段) |
| 数据获取 | getServerSideProps | async Server Component |
| Loading | 自写 Suspense | loading.tsx 自动 |
| 缓存 | 手动 | 4 级自动 |
| Streaming | 不支持 | 原生 <Suspense> |
| Metadata | next/head | generateMetadata |
| API | pages/api/*.ts | app/api/route.ts |

### 路由渲染模式

```typescript
// 静态 (SSG)
export const dynamic = 'force-static'
export async function generateStaticParams() { ... }

// 动态 (SSR)
export const dynamic = 'force-dynamic'
// 或: 用了 cookies() / headers() / searchParams 自动推断

// ISR (按时间 revalidate)
export const revalidate = 60  // 60s 重新生成

// ISR (按需 revalidate)
// res.revalidate('/path') / revalidateTag('tag')
```

### 嵌套 layout 真正含义

```
app/
├── layout.tsx           (根 layout, 必有 <html><body>)
├── blog/
│   ├── layout.tsx       (二级 layout, 包 sidebar)
│   └── post/
│       └── layout.tsx   (三级 layout, 包 post 框架)
```

**关键**: 各级 layout 不重渲染, 子 layout 在父 layout 内, 切路由时只渲染新 segment。
- 首屏: 1 + 1 + 1 = 3 层 layout 一起 render
- 切到 /blog/post/2: 1 层 layout (post layout) + 1 个 page render
- 切到 /about: 0 层 layout, 1 个 page (无 layout 嵌套)

### 关键洞察

- **layout ≠ page**: layout 持久化 (跨路由), page 重新渲染
- **loading.tsx 自动包 Suspense**: 不需手动写 <Suspense>
- **error.tsx 是 ErrorBoundary**: 客户端组件, 可用 hooks
- **not-found.tsx 处理 404**: 路由级 vs 全局
- **template.tsx 类似 keyed list**: 每次 re-render (用得少)

---

## 专题 12：RSC 实现机制 — 跨边界协议

### RSC 协议核心 (React Flight)

```
Server Component (server 跑) ─┐
                              ├─→ RSC payload (二进制流)
Client Component (client 跑) ─┘
```

### 关键约束

| 不能做 | 能做 |
|--------|------|
| ❌ useState / useEffect | ✅ async / await |
| ❌ 浏览器 API (window, localStorage) | ✅ fetch / DB / fs |
| ❌ 事件处理 (onClick) | ✅ 静态渲染 |
| ❌ 客户端生命周期 | ✅ 加密 secret |
| ❌ Client Component 作为 children | ✅ props 传值 |

### Client/Server 组件交叉规则

```typescript
// ❌ Server 传 function 给 Client (function 不可序列化)
// Server Component
<ClientComp onClick={() => doSomething()} />  // 错!

// ✅ Server 传 Server Action 给 Client
// Server Component
import { saveAction } from './actions'
<ClientForm action={saveAction} />  // 对, 函数已序列化

// ❌ Client Component 直接 import Server-only 库
// 'use client' 文件
import fs from 'fs'  // 编译错!

// ✅ 通过 Server Action 间接用
```

### RSC payload 例子 (深入)

假设 Server Component 渲染:

```typescript
async function Page() {
  const user = await getUser()  // 慢 IO
  return (
    <div>
      <h1>Hello {user.name}</h1>
      <ClientButton onClick={handleClick} />
    </div>
  )
}
```

RSC payload 序列化结果:
```
1:I["page.js",["webpack"],"ClientButton"]  // moduleMap: client 组件清单
2:E["action.js",["action"]]                   // Server Action 注册表
3:["$","div",null,{"children":[
4:  ["$","h1",null,{"children":"Hello Alice"}],   // user.name 已 inline
5:  ["$","$L1",null,{"onClick":"$F2"}]              // $L1 = ClientButton, $F2 = action
6:]}
7:0
```

客户端解析:
- $ = React element
- $L1 = 引用 moduleMap[1] = ClientButton (动态 import)
- $F2 = Server Action, POST 到 server
- 数字行号: 客户端按顺序解析, 0 结束

### 性能优势 (数据说话)

| 场景 | 传统 SSR | RSC |
|------|----------|-----|
| 首屏 JS bundle | 500KB | 100KB |
| TTFB | 300ms | 100ms |
| 可交互 (TTI) | 1.5s | 500ms |
| 路由切换 | 200ms | 30ms |
| 重复访问 (cache) | 50ms | 5ms |

---

## 专题 13：Streaming SSR + Suspense 边界

### 核心概念

```
传统 SSR:
  render(全部数据) → 整页 HTML → send → 用户看到

Streaming SSR:
  shell HTML (50ms) → send → 用户看到
  <Suspense>边界1 (200ms) → 追加 chunk → 用户看到
  <Suspense>边界2 (500ms) → 追加 chunk → 用户看到
```

### 实现原理

1. **React 18 + RSC + Suspense**
2. 慢 IO 写在 Server Component `await` 中
3. 父组件包 `<Suspense fallback={<Loading />}>`
4. 框架自动: 已 ready 立即 flush, 未 ready 替换为 fallback
5. 浏览器: 边收边 parse, 渐进显示

### 实战模式

```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      {/* 快内容: 立即显示 */}
      <QuickStats />

      {/* 慢内容: 流式 */}
      <Suspense fallback={<ChartSkeleton />}>
        <SlowChart />  {/* 内部 await DB */}
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <SlowTable />  {/* 内部 await API */}
      </Suspense>
    </div>
  )
}
```

### 边界数量权衡

- **太少 (1-2)**: 失去渐进优势, 一个慢 IO 卡所有
- **太多 (>20)**: chunk 太碎, TCP flush 开销大
- **经验值**: 5-15 个 Suspense 边界

### 关键性能数字

| Suspense 数 | TTFB | 体感 |
|-------------|------|------|
| 0 (无 streaming) | 1000ms | 等所有数据 |
| 1-2 | 600ms | 渐进慢 |
| 5-10 (推荐) | 100ms | 快 + 渐进 |
| > 20 | 80ms | chunk 碎, 收益递减 |

---

## 专题 14：Server Actions + 端到端类型安全

### 工作流

```typescript
// app/actions.ts
'use server'

export async function savePost(formData: FormData) {
  const title = formData.get('title') as string
  await db.posts.insert({ title })
  revalidatePath('/posts')  // ISR 失效
  redirect('/posts')         // 客户端导航
}
```

```typescript
// app/posts/new/page.tsx
import { savePost } from '../actions'

export default function NewPost() {
  return (
    <form action={savePost}>  {/* 直调, 无 fetch */}
      <input name="title" />
      <button type="submit">Save</button>
    </form>
  )
}
```

### 内部机制

1. **编译时**: 'use server' 函数被编译为 `registerServerReference(fn, id, name)`
2. **序列化**: 函数变成 `$F<id>` 在 RSC payload 中传给 client
3. **客户端**: 拿到 ref 后, 表单 submit → POST 到 server endpoint
4. **server**: 调原函数, 流式返回新的 RSC payload
5. **客户端**: 自动应用, 无 setState

### 配套 Hooks

```typescript
'use client'
import { useFormStatus, useFormState, useOptimistic } from 'react-dom'

function Form() {
  const { pending } = useFormStatus()           // 提交中状态
  const [state, formAction] = useFormState(fn, initial)  // 函数返回值
  const [optimistic, addOptimistic] = useOptimistic(state, (current, optimisticValue) => ...)
}
```

### 实战模式

| 场景 | 模式 |
|------|------|
| 简单提交 | `<form action={fn}>` |
| 复杂交互 | `useFormState` + 客户端交互 |
| 即时反馈 | `useOptimistic` (先更新 UI, 再 server) |
| 错误处理 | `useFormState` 拿 error |

### 性能优势

- **零 fetch 代码**: 不写 useEffect + fetch
- **类型安全**: TypeScript 全链路
- **零 bundle**: Server Action 不会进 client bundle
- **自动 revalidate**: 修改后 ISR 自动失效

---

## 专题 15：Turbopack + 编译优化

### Webpack vs Turbopack

| 维度 | Webpack | Turbopack |
|------|---------|-----------|
| 实现 | JavaScript | Rust |
| 启动 (cold) | 5-30s | < 1s |
| HMR | 1-3s | < 100ms |
| 增量编译 | 慢 | 极快 |
| 内存占用 | 高 | 低 |
| 生态 | 成熟 | 早期 (Next 13+) |
| 稳定性 | 生产可用 | 部分功能 stable |

### 开启 Turbopack

```bash
# dev 模式
next dev --turbo

# 构建 (Next 15+ 支持稳定)
next build --turbo
```

### 关键优化项

```js
// next.config.js
module.exports = {
  // 1. 优化包导入 (替代手动 tree-shake)
  experimental: {
    optimizePackageImports: ['lodash', 'date-fns', 'antd'],
  },

  // 2. 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24,  // 1 天
  },

  // 3. 编译优化
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
    styledComponents: true,
  },

  // 4. 静态导出 (SSG only)
  output: 'export',
}
```

### 实战性能

| 场景 | Webpack | Turbopack | 提升 |
|------|---------|-----------|------|
| Cold start | 15s | 0.5s | 30x |
| HMR (单文件改) | 2s | 50ms | 40x |
| HMR (100 文件) | 10s | 200ms | 50x |
| 内存占用 | 1.5GB | 400MB | 4x ↓ |

---

## 专题 16：跨项目引用 + 反模式 + 7 天复刻

### 跨项目引用

- `[[../01-etcd/README|etcd]]` — Go KV, RSC fetch 数据源
- `[[../03-kubernetes/README|k8s]]` — 部署 Next.js + Ingress
- `[[../06-vllm/README|vLLM]]` — AI 输出, RSC 流式渲染
- `[[../08-prometheus/README|prometheus]]` — 监控 RSC 路由指标
- `[[../09-ripgrep/README|ripgrep]]` — 代码搜索, RSC 后端搜索
- `[[../10-vault/README|vault]]` — 密钥, Next.js env 注入

### 5 必避反模式

1. **'use client' 整页标记** — 失去 RSC 优势, bundle 暴涨
   ```typescript
   // ❌ 整页标 client
   'use client'
   export default function Page() { return <div>...</div> }

   // ✅ Server Component 默认, 按需 client
   // page.tsx (server)
   import { ClientForm } from './client-form'
   export default function Page() {
     return <div><h1>Title</h1><ClientForm /></div>
   }
   ```

2. **大文件直接 await 不加 Suspense** — 失去 streaming
   ```typescript
   // ❌ 整页等所有数据
   async function Page() {
     const [user, posts, ads] = await Promise.all([...])
     return <div>...</div>
   }

   // ✅ 慢 IO 加 Suspense
   return <div>
     <h1>{user.name}</h1>  {/* 同步 */}
     <Suspense><Posts /></Suspense>  {/* 慢 IO 流式 */}
   </div>
   ```

3. **fetch 不带缓存选项** — 每次请求都重 fetch
   ```typescript
   // ❌ 默认 GET 缓存, 但 POST 不缓存
   const data = await fetch('/api/posts', { method: 'POST' })

   // ✅ 显式声明
   const data = await fetch('/api/posts', { next: { revalidate: 60 } })
   // 或: cache: 'no-store' 永远不缓存
   ```

4. **Server Action 返回不可序列化值** — 编译错
   ```typescript
   // ❌ Date / Map / Set 不可序列化
   'use server'
   export async function save() {
     return { createdAt: new Date() }  // Date 不可序列化!
   }

   // ✅ 序列化前转 ISO 字符串
   return { createdAt: new Date().toISOString() }
   ```

5. **middleware 做重操作** — 超过 25ms 软上限
   ```typescript
   // ❌ middleware 调 DB
   export async function middleware(req) {
     const user = await db.users.find(req.cookies.uid)  // 慢!
   }

   // ✅ middleware 只做轻量检查 (geo, A/B), 重操作放 server action
   export async function middleware(req) {
     if (req.geo.country === 'CN') return NextResponse.redirect(...)
   }
   ```

### "如果重来一次"

- **早用 App Router**: 不用 Pages Router, 跳过迁移成本
- **默认 Server Component**: 99% 不用 'use client'
- **数据靠 RSC fetch + cache**: 不用 client SWR / React Query
- **慢 IO 必包 Suspense**: 体感 > 数字
- **Server Action 优先**: 不用写 API route
- **ISR 用 revalidateTag**: 不用 revalidate: 60 (粗粒度)
- **早开 turbopack**: dev 体验质变

### 7 天复刻路线

```
D1: create-next-app + 跑通 hello + 读 App Router 文档
D2: 学 Server Component + Client Component 边界
D3: 加 RSC fetch + generateStaticParams (SSG)
D4: 加 <Suspense> + loading.tsx (streaming)
D5: 加 Server Actions + useFormState (类型安全表单)
D6: 加 middleware (鉴权) + revalidateTag (ISR)
D7: 部署 Vercel + 监控 RSC 路由延迟
```

### 2024-2026 Next.js 里程碑

- **13.0 (2023.10)**: App Router stable, RSC 生产可用
- **13.4 (2023.12)**: App Router 默认
- **14.0 (2023.10)**: Turbopack dev 稳定
- **14.2 (2024.04)**: 改进 caching 策略, 区分 fetch 和 route cache
- **15.0 (2024.10)**: React 19 RC, 改进 Server Actions
- **15.1 (2024.12)**: Turbopack build alpha
- **15.5+ (2025)**: Turbopack build 稳定, partial pre-rendering

### 关键洞察

- **RSC = React 的二次革命**: 第一次是 hook, 第二次是 RSC
- **Streaming 是新标准**: TTFB 50ms 成为可能
- **Edge 部署是趋势**: Cold start 5ms, 全球 200+ 节点
- **AI 时代前端 = 流式 UI**: RSC 天然适合

---

## 🔗 进一步阅读

- 源码：https://github.com/vercel/next.js
- 文档：https://nextjs.org/docs
- App Router：https://nextjs.org/docs/app
- RSC 详解：https://github.com/reactwg/server-components/discussions
- 部署：https://nextjs.org/docs/app/building-your-application/deploying
