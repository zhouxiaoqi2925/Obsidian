# 《Next.js》速查卡

> 入口在 [[README|README.md]]｜分类：Web/Framework｜⭐⭐⭐⭐⭐⭐｜适用：全栈 Web / SSR / 边缘渲染

---

## 🎯 一句话价值

**React 的工程化标准答案**：约定式路由 + RSC + 边缘运行时，重新定义前端部署，让 SSR 重新伟大。

---

## 🧠 3 个核心洞察（必背）

1. **App Router = RSC + Streaming** — Server Component 在 server 跑（永不进 bundle），流式 HTML 让 TTFB < 200ms
2. **约定式路由 + 嵌套 layout** — 文件系统即路由，layout/template/error/loading 边界天然支持，零配置
3. **Server Actions = 端到端类型安全** — 不用写 API，server 函数直调，自动序列化、pending 状态、错误处理

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `packages/next/src/server/app-render/render-to-html-or-flight.tsx` | 双产物 render（RSC payload + HTML 并行流式），共享 React tree |
| 2 | `react-server-dom-webpack/src/ReactFlightServer.js:renderToReadableStream` | 自定义紧凑协议（$/L/@/F 前缀），Promise 占位流式 |
| 3 | `packages/next/src/client/components/app-router.tsx` | 客户端 useReducer 状态机 + 双树（Server 指令 + Client 组件） |
| 4 | `packages/next/src/server/base-server.ts:pipeline` | URL 匹配 + RSC render + 流式 sendPayload |
| 5 | `packages/next/src/server/next-server.ts:NextServer` | HTTP server + middleware 链 + dev/prod 双模式 |

---

## ⚡ 性能数字（实测，中型 SaaS）

| 场景 | 指标 | 数值 | 对比 |
|------|------|------|------|
| 首次渲染（cold） | TTFB | 100-350ms | Pages Router ~500ms |
| 缓存命中（L3） | TTFB | 10-30ms | 10x 快 |
| 客户端导航 | 切换 | 10-100ms | vs 整页 reload 1-3s |
| 浏览器 back/forward | 切换 | 0-50ms | bfcache 命中 0ms |
| Bundle size | 客户端 JS | ~100KB | Pages Router ~500KB |
| RSC payload | 大小 | 2-30KB | 同等 JSON 200KB |
| Edge cold start | 启动 | 5-20ms | Node.js 200-500ms |
| Stream chunk | 边界 | 5-15 个 Suspense | 过少/过多都慢 |
| Middleware | 耗时 | 5-15ms | 限 25ms 软上限 |

**结论**：RSC + Edge 是 TTFB 黄金组合，Server Component 是 bundle 缩减的核武器。

---

## 🌳 决策树 — 该用哪种渲染

```
渲染方式
  │
  ├── 数据静态 + 不常变 → SSG (Static Site Generation)
  │   └── generateStaticParams() 预渲染, CDN 直出
  │
  ├── 数据变化慢 + 可缓存 → ISR (Incremental Static Regen)
  │   └── revalidate: 60 / revalidateTag('post')
  │
  ├── 用户个性化 + 实时 → SSR (Server-Side Render)
  │   └── dynamic = 'force-dynamic' / cookies() / headers()
  │
  ├── 内部 dashboard + 重交互 → CSR (Client-Side Render)
  │   └── 'use client' + 客户端 fetch
  │
  └── AI 输出 / 长内容 / 慢 IO → RSC + Streaming
      └── <Suspense> 包裹慢组件, 流式 flush
```

### 缓存层（4 级，从上到下）

```
请求进入
  ↓
L1: HTTP cache (CDN/浏览器) — Cache-Control, s-maxage
  ↓ miss
L2: Data cache (RSC fetch) — in-memory + disk
  ↓ miss
L3: Full Route Cache (App Router) — 整路由 HTML 缓存
  ↓ miss
L4: Router Cache (client) — 客户端 prefetch
  ↓ miss
Render
```

---

## 🚀 命令分组速查

### 创建 & 运行
```bash
npx create-next-app@latest my-app    # 脚手架
cd my-app && npm run dev              # 开发 (HMR)
npm run build && npm start            # 生产 (编译产物)
npx next info                         # 诊断环境
```

### 编译 & 优化
```bash
# 分析 bundle
npm run build -- --profile
# 配置 analyzer
# next.config.js: bundleAnalyzer: '@next/bundle-analyzer'

# 编译输出分析
ANALYZE=true npm run build
# → 打开 .next/analyze/client.html
```

### 测试 & 类型
```bash
npm run lint                          # ESLint
npm run type-check                    # TypeScript
npm test                              # Jest
# E2E
npx playwright test
```

### 调试
```bash
# RSC payload: view-source:http://localhost:3000
# 搜 self.__next_f 看 RSC 序列化内容

# dev 模式错误覆盖 (右下角)
# prod 模式: Sentry / 自定义 error.tsx

# 性能: chrome devtools → Network → Timing
#   - TTFB
#   - Content Download
#   - DOMContentLoaded
#   - Time to Interactive
```

### 部署
```bash
# Vercel (最佳集成)
vercel                                # 一行部署
vercel --prod                         # 部署到生产

# Docker
docker build -t myapp .
docker run -p 3000:3000 myapp

# 静态导出
# next.config.js: output: 'export'
npx next build                        # → out/ 目录
```

### 关键配置 (next.config.js)
```js
module.exports = {
  reactStrictMode: true,              // 严格模式
  compress: true,                     // gzip
  images: { formats: ['image/avif'] },// 图片优化
  experimental: {
    optimizePackageImports: ['lodash'],// tree-shaking
  },
  // 静态导出
  output: 'export',
  // 自定义 server (失去 ISR)
  // 不推荐, 用 middleware + Vercel
}
```

---

## 🗂️ 路由约定速查

```
app/                              # App Router (推荐)
├── layout.tsx                    # 根布局 (必须, 包 children)
├── page.tsx                      # / 页面
├── loading.tsx                   # Suspense fallback
├── error.tsx                     # Error boundary
├── not-found.tsx                 # 404
├── template.tsx                  # 每次 re-render
├── route.ts                      # API endpoint
├── blog/
│   ├── layout.tsx                # 嵌套 layout
│   ├── page.tsx                  # /blog
│   └── [slug]/
│       ├── page.tsx              # /blog/:slug
│       └── opengraph-image.tsx   # OG 图
├── (marketing)/                  # 路由组 (不影响 URL)
│   └── about/
│       └── page.tsx              # /about
├── @modal/                       # 平行路由
│   └── default.tsx
└── photo/[id]/
    └── (..)photo/[id]/page.tsx   # 拦截路由

middleware.ts                     # Edge middleware (请求级)
```

---

## ⚠️ 必避 8 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **'use client' 边界错位** | 整页 hydrate, 失去 RSC 优势 | 默认 Server Component, 按需 'use client' |
| **Client 误用 Server 库** | 编译错 `fs is not defined` | server-only 库标 'use server', client 用 server action |
| **fetch 默认不缓存 POST** | 每次请求都重 fetch | GET 默认缓存, POST 加 cache: 'no-store' |
| **Date 在 SSR/CSR 不一致** | Hydration mismatch | 用 useEffect + 客户端时间, 或 suppressHydrationWarning |
| **window 在 Server 跑** | ReferenceError | 包 useEffect, 或加 'use client' |
| **useState 在 Server Component** | 编译错 | 标 'use client' 或提取到子组件 |
| **大文件 / 慢 IO 无 Suspense** | 失去 streaming | 慢 IO 用 <Suspense fallback={loading.tsx}> |
| **middleware 超 25ms** | Edge 超时警告 | 拆小, 复杂逻辑放 server action |

### 5 个隐藏坑

- **dynamic = 'auto' 推断错**：用了 cookies() 自动变 dynamic，缓存失效
- **RSC payload > 1MB**：客户端解析卡，拆分或分页
- **route handlers 不能用 cookies()**：要 Page 或 Server Component
- **parallel routes 缺 default.tsx**：硬刷新 404
- **generateStaticParams 缺动态路由**：编译时全静态，路由 404

---

## 🔄 Next.js vs 类似方案

| 维度 | Next.js (App Router) | Remix | Nuxt (Vue) | SvelteKit | Astro |
|------|----------------------|-------|------------|-----------|-------|
| 范式 | RSC + Streaming | Loader/Action | Nuxt 3 Server | Server load | Islands |
| 路由 | 文件约定 | 文件约定 | 文件约定 | 文件约定 | 文件约定 |
| 数据获取 | RSC + fetch | useLoaderData | useFetch | +page.server | +server.ts |
| 边缘 | ✅ Edge Runtime | ✅ | ✅ | ✅ | ✅ |
| 部署 | Vercel/自托管 | Vercel/自托管 | Vercel/自托管 | Vercel/自托管 | Vercel/自托管 |
| Bundle 优化 | 极致 (RSC) | 中等 | 较好 | 极致 (编译) | 极致 (islands) |
| 适用 | 大型 SaaS | 数据驱动 | Vue 生态 | 性能优先 | 内容站 |

---

## 🧩 可复用模式

| 模式 | Next.js 怎么实现 | 我能用到哪 |
|------|------------------|------------|
| **流式 SSR + Suspense** | <Suspense fallback={...}> + RSC | 任何慢 IO 服务端渲染 |
| **嵌套 layout** | layout.tsx 嵌套 | 多级后台 (admin)、多语言站 |
| **Server Actions** | 'use server' 标记函数 | 表单提交、数据变更、类型安全 |
| **Parallel Routes** | @slot 平行路由 | Modal + Main、Tab + Content |
| **Intercepting Routes** | (..)photo 拦截 | 模态预览、详情侧滑 |
| **Middleware** | middleware.ts (Edge) | 鉴权、A/B、geo-routing |
| **Route Handlers** | route.ts (GET/POST) | API endpoint、Webhook |
| **Streaming AI 输出** | RSC + Promise 流式 | AI 聊天、代码生成 |
| **Optimistic UI** | useOptimistic + Server Action | 点赞、收藏、即时反馈 |
| **Image Optimization** | next/image | 任何需要 CDN + 响应式 |

→ 模式 A-D 详细见 `deep-dive.md 专题 8`

---

## 📋 反思：Next.js 让我重新思考的 5 件事

1. **前端 ≠ SPA**。RSC 让 SSR 重新伟大, bundle 减少 90%。
2. **约定 > 配置**。文件系统即路由, 减少决策疲劳。
3. **边界 = 性能**。`'use client'` 用在刀刃上, 其余全 server。
4. **流式 = 体感**。用户先看到 shell, 慢 IO 后补, TTFB 极致。
5. **AI 时代前端 = 流式 UI**。RSC 这种结构天然适合 AI 输出的"内容流"。

---

## ✅ 我能马上用的 3 件事

- [ ] 把内部 admin 迁移到 App Router, 享受 RSC 优势
- [ ] 用 Server Actions 替换写了一半的 REST API, 类型安全
- [ ] 搭一个 RSC + Edge Runtime 的 demo 验证 TTFB

---

## 🔗 跨项目引用

- `[[../01-etcd/README|etcd]]` — 后端 KV, RSC 数据源
- `[[../06-vllm/README|vLLM]]` — AI 推理, RSC 流式渲染 AI 输出
- `[[../08-prometheus/README|prometheus]]` — 监控 RSC 路由 + RPS + 延迟
- `[[../10-vault/README|vault]]` — Secret 管理, Next.js env 注入
- `[[../03-kubernetes/README|k8s]]` — K8s 部署 Next.js + Ingress 配置

---

## 📚 进一步阅读

- 源码: https://github.com/vercel/next.js
- 文档: https://nextjs.org/docs
- App Router: https://nextjs.org/docs/app
- RSC 详解: https://github.com/reactwg/server-components/discussions
- 部署: https://nextjs.org/docs/app/building-your-application/deploying
- `deep-dive.md` — 16 专题深度解析
- `code-snippets/` — 5 段必读代码 (200-280 行/段, 完整函数 + 5 WHY + 性能数据)
