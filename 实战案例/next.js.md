# Next.js - React 全栈框架

**GitHub**: vercel/next.js
**Star**: 130k+
**语言**: TypeScript (70%) + Rust (25%) + C++ (3%)
**主题**: react、framework、ssg、ssr、rust、turbopack
**适用场景**: 中后台、SaaS、电商、内容站、独立开发者全栈 React 应用

---

## 一、基础范式

### 模式 1 · SSR / SSG / ISR / RSC 四种渲染

**问题场景**：纯 React SPA 不利于 SEO 和首屏性能，需要服务器端渲染能力。

**解决方案**：Next.js 把 4 种渲染做成 4 种导出：getServerSideProps（SSR 每次请求） / getStaticProps（SSG 构建时） / revalidate（ISR 增量静态） / `use server` 指令（RSC Server Components）。

**关键参数**：
- `getServerSideProps` 每次请求执行
- `getStaticProps` 构建时执行
- `revalidate: 60` ISR 60 秒重新生成
- `export const revalidate = 3600` App Router ISR
- `use server` Server Actions

**最佳实践**：内容站/博客用 SSG，电商商品页用 ISR，登录后页面用 SSR，Server Component 用于数据获取。

### 模式 2 · App Router（v13+）vs Pages Router

**问题场景**：旧 Pages Router 文件式路由不灵活，新 App Router 的 Server Component 模型需要学习曲线。

**解决方案**：App Router 用 `app/` 目录 + `layout.tsx` / `page.tsx` / `loading.tsx` / `error.tsx` 约定，Server Component 默认；Pages Router 维持 `pages/` 目录 + `getServerSideProps`。

**关键参数**：
- `app/layout.tsx` 根布局
- `app/page.tsx` 首页 Server Component
- `loading.tsx` Suspense fallback
- `error.tsx` Error Boundary
- `[id]` 动态路由

**最佳实践**：新项目直接用 App Router，老 Pages Router 项目维持双轨。

### 模式 3 · SWC 编译器 + Turbopack Rust 化

**问题场景**：Babel 转译速度慢，Webpack 构建时间长，Next.js 14+ dev 模式启动 30 秒。

**解决方案**：Next.js 用 Rust 写的 SWC 替代 Babel 做 TS/JSX 转译（快 20 倍），用 Rust 写的 Turbopack 替代 Webpack（dev 启动快 10 倍），Turbopack 稳定在 v15。

**关键参数**：
- `packages/next-swc/` SWC 插件
- `crates/next-core/` Turbopack 核心
- `--turbo` CLI flag
- `next dev --turbo` 启用
- `crates/next-custom-transforms/` 自定义 transform

**最佳实践**：dev 模式必须用 `--turbo`，CI 部署用 stable Webpack（更稳）。

### 模式 4 · 文件式路由 + Dynamic Routes

**问题场景**：手写 react-router 配置在大型项目难以维护。

**解决方案**：App Router 用 `app/blog/[slug]/page.tsx` 文件路径直接定义路由，`[slug]` 是动态参数，`(...)/group` 是路由分组不映射到 URL。

**关键参数**：
- `app/blog/page.tsx` → `/blog`
- `app/blog/[slug]/page.tsx` → `/blog/:slug`
- `app/(marketing)/about/page.tsx` → `/about` 分组
- `generateStaticParams()` SSG 动态路由
- `not-found.tsx` 404 页

**最佳实践**：超过 30 个路由必须用文件式路由，手写 route config 不可维护。

### 模式 5 · Server Component + Client Component 边界

**问题场景**：数据获取在客户端组件需要 fetch + useEffect，Server Component 让数据获取在服务端完成。

**解决方案**：默认所有组件是 Server Component（不能在文件顶部 import 'use client'），需要交互（useState / onClick）才用 Client Component 标记。

**关键参数**：
- `'use client'` 指令首行
- Server Component 不能用 hook
- Client Component 不能直接 await 数据
- `use client` 边界向下传递
- RSC 协议序列化 props

**最佳实践**：数据获取在 Server Component，交互状态在 Client Component，边界尽量靠下。

---

## 二、扩展范式

### 模式 6 · Image / Font / Script 性能优化

**问题场景**：图片未 lazy load、字体未 swap、第三方脚本阻塞渲染。

**解决方案**：`next/image` 自动 WebP + lazy + responsive；`next/font` 自动 preload + font-display: swap；`next/script` 策略加载（beforeInteractive / afterInteractive / lazyOnload）。

**关键参数**：
- `<Image src="" width={500} height={300} />` 自动优化
- `<Font>` 字体子集化
- `<Script strategy="lazyOnload">` 延迟加载
- AVIF/WebP 自动协商
- LCP 优化 30%+

**最佳实践**：所有项目都用 next/image + next/font + next/script 三件套，Core Web Vitals 显著提升。

### 模式 7 · Middleware + Edge Runtime

**问题场景**：A/B 测试、Bot 检测、地理路由需要请求级别拦截。

**解决方案**：`middleware.ts` 在 Edge Runtime 跑（V8 Isolate），`NextResponse.next()` / `NextResponse.rewrite()` / `NextResponse.redirect()` 三件套。

**关键参数**：
- `middleware.ts` 在项目根目录
- Edge Runtime 启动 < 5ms
- `matcher: ['/((?!api).*)']` 排除 API
- `req.cookies` / `req.headers` 读
- `NextResponse.rewrite()` 重写

**最佳实践**：A/B 测试 + 地理路由 + Bot 检测全在 middleware.ts，< 5ms 启动。

### 模式 8 · API Routes / Route Handlers

**问题场景**：需要写后端 API 但不想起 Node 服务。

**解决方案**：Pages Router 用 `pages/api/*.ts` 导出 handler；App Router 用 `app/api/[...slug]/route.ts` 导出 GET/POST/PUT/DELETE。

**关键参数**：
- `pages/api/hello.ts` 旧版
- `app/api/hello/route.ts` 新版
- `export async function GET(req: Request)` 
- Edge Runtime `export const runtime = 'edge'`
- Node.js Runtime 默认

**最佳实践**：MVP / BFF 用 route.ts，复杂后端用独立 Nest/Fastify 服务。

### 模式 9 · Standalone Build 部署

**问题场景**：传统 Next.js 部署需要复制 node_modules + .next，Docker 镜像 500MB+。

**解决方案**：`output: 'standalone'` 把 Node.js 应用打包成单目录（含 .next + 必要 node_modules），Docker 镜像 < 100MB。

**关键参数**：
- `next.config.js` 中 `output: 'standalone'`
- `output: 'standalone'` 输出 `.next/standalone/`
- 复制 `public/` + `.next/static/` + `server.js`
- Docker 多阶段构建
- 镜像 90MB

**最佳实践**：所有 Docker 部署都用 standalone build，K8s 友好。

### 模式 10 · Incremental Static Regeneration (ISR)

**问题场景**：电商商品价格 5 分钟更新一次，纯 SSG 数据过时，纯 SSR 性能差。

**解决方案**：`revalidate: 300` 在 getStaticProps 触发 ISR，后台增量重新生成静态页，过期前继续返回旧页。

**关键参数**：
- `revalidate: 60` 60 秒
- `revalidatePath('/blog/[slug]')` 主动失效
- `revalidateTag('posts')` 标签失效
- App Router `export const revalidate = 60`
- on-demand revalidation

**最佳实践**：电商/新闻用 ISR 5-15 分钟，关键页用 on-demand revalidation。

---

## 三、进阶范式

### 模式 11 · Monorepo + Turborepo + Workspaces

**问题场景**：多 Next.js 应用 + 共享组件库 + 共享 utils 在大团队难管理。

**解决方案**：Turborepo + pnpm workspaces 统一管理，apps/* 放应用，packages/* 放共享 lib，turbo.json 声明 pipeline 依赖。

**关键参数**：
- `apps/web` / `apps/admin` / `apps/docs`
- `packages/ui` / `packages/utils`
- `turbo.json` 声明 `build` / `test` / `lint`
- 远程缓存 Vercel
- `--filter=app` 只构建指定

**最佳实践**：超过 3 个应用必须用 Monorepo，依赖管理 + 构建速度 + 共享 lib 都靠它。

### 模式 12 · React Server Components (RSC) 协议

**问题场景**：Server Component 怎么把渲染结果传给 Client Component。

**解决方案**：RSC 协议用特殊二进制格式（包含 React 元素 + 异步 chunk + 边界）流式序列化，Client 端用 `react-server-dom-webpack` 反序列化。

**关键参数**：
- `react-server-dom-webpack/server.edge` 服务端
- `react-server-dom-webpack/client` 客户端
- Flight 协议
- 流式 SSR
- Server Action `use server`

**最佳实践**：理解 RSC 协议原理是优化 SSR 性能的关键。

### 模式 13 · Middleware + Auth (NextAuth/Clerk/Auth.js)

**问题场景**：用户认证状态跨 Server/Client Component 传递。

**解决方案**：Auth.js (NextAuth) 在 middleware.ts 验证 JWT cookie，Server Component 用 `getServerSession()` 拿 session，Client Component 用 `useSession()` 订阅。

**关键参数**：
- `auth()` / `getServerSession()` Server
- `useSession()` Client
- JWT 策略
- OAuth providers
- middleware.ts 保护路由

**最佳实践**：所有认证都用 Auth.js，5 分钟接入 Google/GitHub/邮箱登录。

### 模式 14 · Streaming + Suspense 边界

**问题场景**：数据获取慢阻塞首屏。

**解决方案**：Server Component 用 `<Suspense fallback={<Loading/>}>` 包裹慢数据，Next.js 流式 SSR，先发骨架后发数据。

**关键参数**：
- `<Suspense>` 边界
- `loading.tsx` App Router 约定
- 流式 HTML
- TTFB 优化 50%
- TTFD (Time to First DOM) 关键

**最佳实践**：每个慢查询用 Suspense 包裹，让快内容先到。

### 模式 15 · Custom Server + Custom Webpack

**问题场景**：需要自定义 HTTP 服务器（如 WebSocket、Express middleware）。

**解决方案**：`server.js` 自定义 HTTP 服务，`getRequestHandler()` 转发 Next 请求；`next.config.js` 中 `webpack(config)` 自定义构建。

**关键参数**：
- `const app = next({ dev })` 
- `app.getRequestHandler()`
- Express/Fastify/Koa 集成
- `webpack: (config) => { ...; return config }`
- `getServerSideProps` 兼容

**最佳实践**：MVP 不需要 custom server，复杂 BFF 用独立 Nest 服务。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：新项目从零搭 Next.js。

**解决方案**：`npx create-next-app@latest` 7 件套：app/layout.tsx（根布局）/ app/page.tsx（首页）/ app/loading.tsx（Suspense）/ app/error.tsx（Error Boundary）/ app/not-found.tsx（404）/ next.config.js（构建配置）/ package.json（依赖）。

**关键参数**：
- `app/` App Router
- `next.config.js` standalone + image
- `tsconfig.json` strict
- `.env.local` 环境变量
- `middleware.ts` 鉴权

**最佳实践**：所有项目都用 `create-next-app@latest` 起手，TS + ESLint + Tailwind + App Router 一次性到位。

### 模式 17 · Vercel 部署 + 自托管

**问题场景**：Vercel 部署好但绑定平台，自托管需要 Docker。

**解决方案**：Vercel 部署：git push → 自动 build → 全球 Edge Network；自托管：standalone build + Docker 多阶段 + K8s Deployment。

**关键参数**：
- Vercel 零配置
- 自托管 Dockerfile
- 镜像 90MB
- `output: 'standalone'`
- 端口 3000

**最佳实践**：MVP 选 Vercel，中大型项目选自托管 K8s，节省成本 80%。

### 模式 18 · 性能优化清单

**问题场景**：Core Web Vitals 不达标。

**解决方案**：10 项优化清单：① next/image WebP ② next/font 字体子集 ③ next/dynamic 代码分割 ④ Server Component 数据获取 ⑤ Suspense 流式 ⑥ prefetch={true} Link 预取 ⑦ Service Worker 缓存 ⑧ CDN + ISR ⑨ Critical CSS 内联 ⑩ Brotli 压缩。

**关键参数**：
- LCP < 2.5s
- FID < 100ms
- CLS < 0.1
- Lighthouse > 90
- Web Vitals 4 项全绿

**最佳实践**：性能优化从 Server Component + next/image + next/font 三件套开始，覆盖 80% 场景。

### 模式 19 · 与 Nuxt / Remix / SvelteKit 对比

**问题场景**：选型在 Next / Nuxt / Remix / SvelteKit 之间。

**解决方案**：Next 定位「生态最大 + Vercel 部署最简单」适合大众；Nuxt 定位「Vue 生态 + Nitro 灵活」适合 Vue 团队；Remix 定位「Web 标准 + 数据加载」适合全栈；SvelteKit 定位「小而美 + 编译时优化」适合小项目。

**关键参数**：
- Star: Next 130k > Nuxt 81k > Remix 30k > SvelteKit 18k
- 性能: SvelteKit > Next > Nuxt > Remix
- 生态: Next > Nuxt > Remix > SvelteKit
- 学习曲线: SvelteKit < Nuxt < Remix < Next

**最佳实践**：新项目 React 团队选 Next，Vue 团队选 Nuxt，全栈团队选 Remix。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Next.js 做内部框架。

**解决方案**：7 天分 6 步：① 文件式路由 ② Server Component 渲染 ③ App Router 约定 ④ getServerSideProps / getStaticProps ⑤ Image 优化 ⑥ Middleware 拦截。

**关键参数**：
- Day 1: 文件式路由
- Day 2: Server Component
- Day 3: App Router
- Day 4: 数据获取
- Day 5: Image
- Day 6: Middleware
- Day 7: 文档

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 Next.js 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\next.js\`
- **大小**: ~500 MB（含 Rust crates）
- **包数量**: 20+ 公开包 + Rust crates
- **关键 commit**: v15.x
- **团队**: Vercel 150+ 工程师 + 数千社区贡献者
- **许可**: MIT

## 一句话总结

Next.js 用 Rust 重写关键路径（SWC + Turbopack）+ App Router 的 Server/Client 边界 + 4 种渲染（SSR/SSG/ISR/RSC）统一了「React 全栈」的工程范式，是 2024 年 React 团队构建生产应用的事实标准。
