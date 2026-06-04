# Next.js

> React 全栈框架 — Vercel 维护，集成 SSR/SSG/ISR/App Router/Server Components

## 一、前言

**定位**：生产级 React 框架，约定优于配置，零配置即可部署

**核心价值**：
1. **多渲染模式** — SSG、SSR、ISR、CSR、Streaming SSR 自由组合
2. **App Router**（13+）— 基于文件系统的路由 + 嵌套布局
3. **Server Components** — 服务端组件，零 JS 推到客户端
4. **零配置** — TypeScript、CSS Modules、Image 优化内置
5. **Edge Runtime** — 全球边缘部署（Vercel）
6. **数据获取** — fetch 扩展（自动 dedupe + cache）

**应用场景**：营销站点、电商、博客、仪表盘、SaaS Web 应用

**版本演进**：
- **Next.js 9**（2019）— 引入 SSG/SSR
- **Next.js 13**（2022）— App Router、React Server Components
- **Next.js 14**（2023）— Server Actions、Partial Prerendering
- **Next.js 15**（2024）— React 19 支持、async 请求 API

---

## 二、架构思维导图

```mermaid
mindmap
  root((Next.js))
    路由
      Pages Router
      App Router
      动态路由
      嵌套布局
      Route Groups
      Parallel Routes
    渲染
      SSG
      SSR
      ISR
      CSR
      Streaming
      PPR
    数据
      getStaticProps
      getServerSideProps
      React Server Components
      Server Actions
      use()
    优化
      Image
      Font
      Script
      Link 预取
      Code Splitting
    中间件
      Edge Middleware
      Auth
      A/B Test
    部署
      Vercel
      Self-hosted
      Docker
      Static Export
    工具
      next dev
      next build
      next start
      Turbopack
```

---

## 三、关键代码

### 1. App Router — Server Component (RSC)

```tsx
// 文件: app/products/page.tsx
// Server Component：默认在服务端运行，零 JS
import { Suspense } from 'react';
import { getProducts } from '@/lib/api';

export default async function ProductsPage() {
  // 1. 异步数据获取
  const products = await getProducts();

  return (
    <div>
      <h1>Products</h1>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductList products={products} />
      </Suspense>
    </div>
  );
}

// 文件: app/products/actions.ts
'use server';  // 标记为 Server Action

export async function addToCart(formData: FormData) {
  const productId = formData.get('productId');
  // 1. 服务端逻辑：数据库写入、权限检查
  await db.cart.create({ productId });
  // 2. 自动 revalidate 缓存
  revalidatePath('/cart');
}
```

### 2. 路由文件结构

```
app/
├── layout.tsx           # 根布局
├── page.tsx             # / 路由
├── products/
│   ├── layout.tsx       # /products 布局
│   ├── page.tsx         # /products 列表
│   └── [id]/
│       └── page.tsx     # /products/:id 详情
├── (marketing)/         # Route Group（不影响 URL）
│   ├── about/
│   └── pricing/
├── @modal/              # Parallel Route（插槽）
│   └── default.tsx
└── api/
    └── revalidate/
        └── route.ts     # API Route

# 文件: app/products/[id]/page.tsx
export async function generateStaticParams() {
  // 预生成所有详情页
  const products = await getProducts();
  return products.map(p => ({ id: p.id }));
}

export default async function ProductPage({ params }) {
  const { id } = await params;  // 15+ 新 API
  const product = await getProduct(id);
  return <ProductDetail product={product} />;
}
```

### 3. 渲染策略 — caching / revalidate

```ts
// 文件: lib/api.ts
// Next.js 扩展 fetch：自动 dedupe + cache
export async function getProducts() {
  const res = await fetch('https://api.example.com/products', {
    next: {
      revalidate: 3600,   // ISR：1 小时重新生成
      tags: ['products'], // 用于按标签失效
    }
  });
  return res.json();
}

// 主动失效
import { revalidateTag } from 'next/cache';
revalidateTag('products');

// 路由级重新生成
import { revalidatePath } from 'next/cache';
revalidatePath('/products/[id]', 'page');
```

### 4. Middleware（Edge Runtime）

```ts
// 文件: middleware.ts
import { NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!api|_next/static|favicon.ico).*)'],
};

export async function middleware(request) {
  // 1. A/B 测试
  const bucket = request.cookies.get('bucket')?.value ?? 'A';
  const response = NextResponse.next();
  if (bucket === 'B') {
    response.headers.set('x-variant', 'B');
  }
  // 2. 鉴权
  const token = request.cookies.get('token');
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}
```

---

## 四、核心洞察

1. **RSC 核心思想**：服务端组件不打包 JS 到客户端，零运行时；客户端组件用 'use client' 标记
2. **Streaming SSR**：用 Suspense 把慢数据"挂起"，先返回快内容，配合 HTTP/2 push 流式传输
3. **PPR（Partial Prerendering）**：14+ 新特性，静态部分预渲染 + 动态部分流式，兼顾 SSG 速度 + SSR 实时
4. **Server Actions**：不用写 API 路由，form action 直接调服务端函数，自动处理 CSRF
5. **Vercel 锁定**：Server Actions / Streaming / PPR 部分功能仅 Vercel Edge 完整支持，自托管有限制
6. **学习曲线**：App Router 比 Pages Router 陡，RSC 模型 + 数据流 + 缓存策略
7. **性能优势**：SSG/ISR 比传统 SPA 首屏快 5-10x；Server Components 减少 JS 体积 30-50%
8. **生态对比**：Next.js vs Nuxt（Vue）vs SvelteKit — 三大全栈框架，Next.js 生态最大

## 五、跨项目引用

- [[./react|React]] — Next.js 是 React 的官方推荐全栈方案
- [[./remix|Remix]] — 另一款 React 全栈框架，强调 web standards
- [[./nuxt|Nuxt]] — Vue 版的 Next.js
- [[./sveltekit|SvelteKit]] — Svelte 版的 Next.js

---

**项目地址**：`G:\实战案例\GitHub顶尖项目\nextjs-vercel`
**类型**：全栈框架 | **Stars**: 125k+ | **License**: MIT

---

# Next.js 完整知识手册（深度扩展版）

> 本文档是 Next.js 的深度实践手册，覆盖 App Router 14/15 新特性、Server Components 原理、Server Actions、数据获取与缓存、Streaming SSR、性能优化、企业级部署、踩坑指南、大厂实践、跨境电商场景等全部核心主题。建议配合官方文档（nextjs.org/docs）使用。

## 目录

- 第 1 章：Next.js 14/15 核心更新
- 第 2 章：App Router 深度剖析
- 第 3 章：React Server Components 原理
- 第 4 章：Server Actions 完整指南
- 第 5 章：路由系统（动态/并行/拦截/路由组）
- 第 6 章：数据获取与缓存策略
- 第 7 章：Streaming SSR 与 Suspense
- 第 8 章：Partial Prerendering（PPR）
- 第 9 章：性能优化手册
- 第 10 章：中间件（Middleware）实战
- 第 11 章：认证与授权方案
- 第 12 章：国际化（i18n）
- 第 13 章：部署方案（Vercel / Docker / 自托管）
- 第 14 章：真实案例研究
- 第 15 章：踩坑指南（80+ 问题）
- 第 16 章：大厂实践（Vercel、字节、Shopify）
- 第 17 章：核心洞察与设计哲学
- 第 18 章：跨项目引用
- 第 19 章：参考资源

---

## 第 1 章：Next.js 14/15 核心更新

### 1.1 版本对比表

| 版本 | 发布时间 | 核心特性 | 适用场景 |
|------|---------|---------|---------|
| 13.0 | 2022-10 | App Router 稳定、RSC 实验性 | 新项目起步 |
| 13.4 | 2023-05 | App Router 默认稳定、Server Actions 预览 | 全面迁移 |
| 14.0 | 2023-10 | Server Actions 稳定、PPR 预览、Turbopack beta | 生产可用 |
| 14.1 | 2024-01 | 自托管优化、改进错误处理 | 大规模部署 |
| 14.2 | 2024-04 | 改进内存占用、构建速度 +20% | CI/CD 优化 |
| 15.0 | 2024-10 | React 19 稳定、async 请求 API 默认 | 全面升级 |
| 15.1 | 2025-01 | Turbopack 稳定、改进 Hydration | 性能优化 |
| 15.2 | 2025-04 | 增强 Server Actions、改进缓存 | 企业级 |
| 15.3 | 2025-08 | 完整 PPR 稳定、支持 Edge Config | 全功能 |

### 1.2 Next.js 15 重大变化

#### 1.2.1 async 请求 API（破坏性更新）

Next.js 15 起，`params`、`searchParams`、`cookies()`、`headers()` 全部改为异步 API，必须使用 `await`：

```tsx
// ❌ Next.js 14 及之前（同步）
export default function Page({ params, searchParams }) {
  const { id } = params;
  const q = searchParams.q;
  return <div>{q}</div>;
}

// ✅ Next.js 15+（异步）
export default async function Page({ 
  params, 
  searchParams 
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  return <div>{q}</div>;
}
```

**为什么改为异步？**

1. **支持 PPR 与 Streaming**：在部分预渲染场景下，参数需要在请求时才能确定
2. **支持动态元数据**：每个请求可以独立生成 metadata
3. **统一类型签名**：避免同步/异步混用导致的类型错误
4. **未来兼容**：为 React 19 的 Server Components 演进铺路

**迁移工具**：

```bash
# 自动迁移 codemod
npx @next/codemod@canary upgrade latest
```

#### 1.2.2 缓存策略重构

Next.js 15 重大调整：**默认不再缓存 fetch 请求**（14 是默认 force-cache）。

```tsx
// Next.js 14：默认 force-cache（永久缓存）
const res = await fetch('https://api.example.com/data');

// Next.js 15：默认 no-store（不缓存）
// 必须显式声明
const res = await fetch('https://api.example.com/data', {
  cache: 'force-cache',  // 显式开启缓存
  // 或 next: { revalidate: 3600, tags: ['data'] }
});
```

**调整理由**：
- 默认缓存容易导致数据不一致（开发者不知道）
- 显式声明更符合"显式优于隐式"
- 减少生产环境意外缓存问题

**完整缓存选项**：

```ts
fetch(url, {
  cache: 'force-cache',      // 永久缓存（SSG）
  cache: 'no-store',         // 不缓存（SSR）
  cache: 'no-cache',         // 重新验证（类似 ISR）
  next: {
    revalidate: 3600,        // 时间窗口（秒）
    revalidate: 0,           // 等同 no-store
    revalidate: false,       // 等同 force-cache
    tags: ['products'],      // 标签失效
  }
});
```

#### 1.2.3 React 19 集成

```tsx
// app/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '我的应用',
  description: 'Next.js 15 + React 19',
};

// 使用 use() hook 读取 Promise
import { use } from 'react';

function ProductPrice({ promise }: { promise: Promise<number> }) {
  const price = use(promise);  // React 19 新 hook
  return <div>¥{price}</div>;
}

// 父组件（Server Component）
export default async function Page() {
  const pricePromise = fetchPrice();
  return (
    <Suspense fallback={<Skeleton />}>
      <ProductPrice promise={pricePromise} />
    </Suspense>
  );
}
```

#### 1.2.4 Turbopack 稳定

```json
// package.json
{
  "scripts": {
    "dev": "next dev --turbopack",    // 开发构建 5-10x 加速
    "build": "next build --turbopack"  // 生产构建 beta
  }
}
```

**性能提升实测**：

| 项目规模 | Webpack 启动 | Turbopack 启动 | 加速比 |
|---------|------------|---------------|-------|
| 小型（<100 路由） | 8s | 0.6s | 13x |
| 中型（100-500 路由） | 30s | 2.1s | 14x |
| 大型（>500 路由） | 90s | 4.5s | 20x |
| HMR 更新（小改动） | 1.2s | 0.05s | 24x |

### 1.3 升级检查清单

升级到 Next.js 15 时需要逐项检查：

- [ ] 所有 `params`/`searchParams` 改为 `Promise<>` + `await`
- [ ] `cookies()`/`headers()` 改为 `await` 形式
- [ ] fetch 默认行为改变，显式声明缓存策略
- [ ] React 类型升级到 19
- [ ] Server Actions 错误处理改造（try/catch）
- [ ] `useFormState` 改为 `useActionState`（React 19）
- [ ] 重新评估 `dynamic = 'force-dynamic'` 配置
- [ ] 第三方库兼容性检查（特别是 auth、ORM）
- [ ] TypeScript 严格模式调整
- [ ] Edge Runtime 兼容性测试

---

## 第 2 章：App Router 深度剖析

### 2.1 文件系统路由约定

App Router 基于**文件夹结构**生成路由，每个文件夹代表一个 URL 段：

| 文件 | 用途 | 是否必需 |
|------|------|---------|
| `page.tsx` | 路由唯一 UI | 路由必需 |
| `layout.tsx` | 共享布局 | 嵌套可选 |
| `loading.tsx` | 加载状态（Suspense fallback） | 可选 |
| `error.tsx` | 错误边界 | 可选 |
| `not-found.tsx` | 404 页面 | 可选 |
| `template.tsx` | 重新挂载的布局 | 可选 |
| `route.ts` | API 路由（替代 api/*） | 替代方案 |
| `default.tsx` | Parallel Route 默认内容 | 必需 |
| `global-error.tsx` | 全局错误 | 可选 |
| `opengraph-image.tsx` | 动态 OG 图 | 可选 |
| `icon.tsx` | 动态图标 | 可选 |
| `sitemap.ts` | 动态 sitemap | 可选 |
| `robots.ts` | 动态 robots.txt | 可选 |
| `manifest.ts` | PWA manifest | 可选 |

### 2.2 完整目录结构示例

```
app/
├── layout.tsx                    # 根布局（必需）
├── template.tsx                  # 重新挂载模板
├── page.tsx                      # / 页面
├── loading.tsx                   # 全局 loading
├── error.tsx                     # 全局错误边界
├── not-found.tsx                 # 全局 404
├── global-error.tsx              # 全局 fatal error
│
├── (marketing)/                  # 路由组（不影响 URL）
│   ├── layout.tsx                # 营销布局
│   ├── about/
│   │   └── page.tsx              # /about
│   ├── pricing/
│   │   ├── page.tsx              # /pricing
│   │   └── loading.tsx
│   └── contact/
│       └── page.tsx              # /contact
│
├── (shop)/                       # 路由组
│   ├── layout.tsx                # 商店布局
│   ├── products/
│   │   ├── page.tsx              # /products
│   │   ├── [id]/
│   │   │   ├── page.tsx          # /products/:id
│   │   │   ├── loading.tsx
│   │   │   └── opengraph-image.tsx
│   │   ├── [...slug]/
│   │   │   └── page.tsx          # /products/* 通配
│   │   └── _components/          # 私有文件夹（_前缀不参与路由）
│   │       └── ProductCard.tsx
│   └── cart/
│       └── page.tsx              # /cart
│
├── (dashboard)/                  # 路由组
│   ├── layout.tsx                # 仪表盘布局（需认证）
│   ├── dashboard/
│   │   ├── page.tsx              # /dashboard
│   │   ├── @analytics/           # Parallel Route 插槽
│   │   │   ├── default.tsx
│   │   │   └── page.tsx
│   │   ├── @notifications/       # Parallel Route
│   │   │   ├── default.tsx
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx          # /dashboard/settings
│
├── @modal/                       # 顶层 Parallel Route
│   ├── default.tsx               # 默认空内容
│   ├── login/
│   │   └── page.tsx              # 模态登录
│   └── cart/
│       └── page.tsx              # 模态购物车
│
├── (.)login/                     # 拦截路由
│   └── page.tsx                  # 当前层级打开 /login 模态
│
├── api/                          # API 路由（替代方案）
│   ├── auth/
│   │   └── [...nextauth]/
│   │       └── route.ts          # NextAuth handler
│   ├── webhooks/
│   │   └── stripe/
│   │       └── route.ts          # Stripe webhook
│   └── revalidate/
│       └── route.ts              # 手动 ISR 失效
│
├── _lib/                         # 私有工具
│   ├── db.ts
│   └── auth.ts
│
├── _components/                  # 私有组件
│   └── Button.tsx
│
├── public/                       # 静态资源
│   ├── images/
│   └── favicon.ico
│
└── styles/
    ├── globals.css
    └── theme.css
```

### 2.3 特殊文件语义详解

#### 2.3.1 layout.tsx — 持久布局

```tsx
// app/layout.tsx — 根布局（必须包含 <html> 和 <body>）
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'My App',
  description: 'Built with Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
```

**关键特性**：
- 不会重新渲染（除非 `template.tsx` 介入）
- 跨路由保持状态（如侧边栏滚动位置）
- 自动包裹 `error.tsx`、`loading.tsx`
- 必须接收 `children` prop

#### 2.3.2 loading.tsx — 流式加载

```tsx
// app/products/loading.tsx
export default function Loading() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-48 bg-gray-200 rounded" />
          <div className="h-4 bg-gray-200 rounded mt-2" />
        </div>
      ))}
    </div>
  );
}
```

**触发时机**：当 `page.tsx` 内有异步数据获取（`await`）时自动触发。

#### 2.3.3 error.tsx — 错误边界

```tsx
// app/dashboard/error.tsx
'use client';  // 必须是 Client Component

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 上报到 Sentry
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-2xl font-bold">出错了</h2>
      <p className="text-gray-600 mt-2">{error.message}</p>
      <Button onClick={reset} className="mt-4">
        重试
      </Button>
    </div>
  );
}
```

**关键点**：
- 必须是 Client Component
- 自动包裹子树
- `error.digest` 用于服务端日志关联
- `reset()` 重新渲染子树

#### 2.3.4 not-found.tsx — 404 处理

```tsx
// app/products/[id]/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div>
      <h2>产品未找到</h2>
      <Link href="/products">返回产品列表</Link>
    </div>
  );
}

// 触发方式（在 page 内）
import { notFound } from 'next/navigation';

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();  // 自动渲染最近的 not-found.tsx
  return <div>{product.name}</div>;
}
```

#### 2.3.5 template.tsx — 重新挂载

```tsx
// app/(dashboard)/template.tsx
// 每次导航重新挂载（layout 不会）
export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 比如：埋点上报、动画重新触发
    trackPageView();
  }, []);
  return <div>{children}</div>;
}
```

**适用场景**：
- 每次进入路由需要重置状态（如动画、计时器）
- 强制重新挂载
- 大多数情况下用 layout 就够了

### 2.4 动态路由（Dynamic Routes）

```tsx
// 1. 基础动态段 [slug]
// app/blog/[slug]/page.tsx
export default async function BlogPost({ 
  params 
}: { 
  params: Promise<{ slug: string }> 
}) {
  const { slug } = await params;
  const post = await getPost(slug);
  return <article>{post.content}</article>;
}

// 2. Catch-all [...slug]
// app/docs/[...slug]/page.tsx
// 匹配 /docs/a, /docs/a/b, /docs/a/b/c
// 不匹配 /docs
export default async function Docs({ 
  params 
}: { 
  params: Promise<{ slug: string[] }> 
}) {
  const { slug } = await params;  // ['a', 'b', 'c']
  return <div>Path: {slug.join('/')}</div>;
}

// 3. Optional Catch-all [[...slug]]
// app/shop/[[...slug]]/page.tsx
// 匹配 /shop, /shop/a, /shop/a/b
// slug 可能是 undefined
export default async function Shop({ 
  params 
}: { 
  params: Promise<{ slug?: string[] }> 
}) {
  const { slug } = await params;
  return <div>Filters: {slug?.join(',') ?? 'all'}</div>;
}
```

### 2.5 路由组（Route Groups）

用 `(folder)` 创建路由组，**不影响 URL**：

```
app/
├── (marketing)/
│   ├── about/page.tsx     → /about
│   ├── pricing/page.tsx   → /pricing
│   └── layout.tsx         → 仅这些页面共享此布局
└── (app)/
    ├── dashboard/page.tsx → /dashboard
    └── layout.tsx         → 仪表盘布局（需登录）
```

**核心用途**：
1. **按业务分组**：marketing、app、admin 各自独立布局
2. **多个根布局**：在同一个 app 中实现不同根 layout
3. **代码组织**：把相关路由归档，不污染 URL

### 2.6 并行路由（Parallel Routes）

用 `@slot` 创建命名插槽：

```
app/
├── layout.tsx
├── page.tsx
├── @modal/
│   ├── default.tsx       # 必需！默认内容（无匹配时）
│   └── login/page.tsx
├── @sidebar/
│   ├── default.tsx
│   └── page.tsx
└── dashboard/
    ├── layout.tsx
    ├── page.tsx
    ├── @analytics/
    │   ├── default.tsx
    │   └── page.tsx
    └── @notifications/
        ├── default.tsx
        └── page.tsx
```

```tsx
// app/layout.tsx
export default function RootLayout({
  children,
  modal,
  sidebar,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;     // @modal 插槽
  sidebar: React.ReactNode;   // @sidebar 插槽
}) {
  return (
    <html>
      <body>
        {children}
        {sidebar}
        {modal}
      </body>
    </html>
  );
}

// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
  analytics,
  notifications,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;     // @analytics
  notifications: React.ReactNode; // @notifications
}) {
  return (
    <div className="dashboard">
      <main>{children}</main>
      <aside>
        <section>{analytics}</section>
        <section>{notifications}</section>
      </aside>
    </div>
  );
}
```

**核心优势**：
- 独立加载（每个插槽可独立 streaming）
- 独立错误处理
- 独立布局（不同插槽用不同 loading.tsx）
- **典型应用**：模态框、侧边栏、Split View

### 2.7 拦截路由（Intercepting Routes）

用 `(.)`、`(..)`、`(..)(..)`、`(...)` 拦截其他路由：

| 语法 | 含义 |
|------|------|
| `(.)` | 拦截同层级 |
| `(..)` | 拦截上一层级 |
| `(..)(..)` | 拦截上两层 |
| `(...)` | 拦截根层级 |

**经典案例：模态打开 / 直接访问**

```
app/
├── @modal/                     # 模态插槽
│   ├── default.tsx             # 默认不显示
│   ├── (.)photos/
│   │   └── [id]/
│   │       └── page.tsx        # 拦截：从 feed 点击时显示模态
│   └── login/
│       └── page.tsx
├── photos/
│   └── [id]/
│       └── page.tsx            # 完整页面：直接访问时显示
└── layout.tsx
```

```tsx
// app/layout.tsx
export default function Layout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
```

**用户体验**：
- 从 `/photos` 点击图片 → 显示模态（URL 变为 `/photos/123`）
- 用户刷新模态页面 → 显示完整页面
- 用户点击关闭 → 返回 `/photos`（浏览器后退）
- 完美结合浏览器历史

### 2.8 Private Folders（私有文件夹）

下划线 `_` 前缀的文件夹**不参与路由**：

```
app/
├── _components/           # 私有（不暴露为路由）
│   └── Button.tsx
├── _lib/                  # 私有
│   └── db.ts
├── _utils/                # 私有
│   └── format.ts
└── page.tsx
```

可作为 `_components`、`_lib`、`_utils` 等公共组织目录，但通过 `@/` alias 访问。

### 2.9 Route Handlers（替代 API Routes）

```ts
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';

// 支持所有 HTTP 方法
export async function GET(request: NextRequest) {
  const users = await db.user.findMany();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const user = await db.user.create({ data: body });
  return NextResponse.json(user, { status: 201 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const user = await db.user.update({ where: { id }, data: body });
  return NextResponse.json(user);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.user.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

// 动态配置
export const dynamic = 'force-dynamic';    // 强制 SSR
export const revalidate = 3600;            // ISR
export const runtime = 'edge';              // Edge Runtime
```

**高级用法**：

```ts
// 1. 动态段
// app/api/posts/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}

// 2. Streaming Response
export async function GET() {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode('data: '));
      // 持续推送
      const interval = setInterval(() => {
        controller.enqueue(new TextEncoder().encode('chunk\n\n'));
      }, 1000);
      request.signal.addEventListener('abort', () => clearInterval(interval));
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// 3. 表单上传
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());
  await saveToS3(buffer, file.name);
  return NextResponse.json({ ok: true });
}

// 4. Cookie/Header 操作
export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const response = NextResponse.json({ data: '...' });
  response.cookies.set('session', 'abc123', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
```

---

## 第 3 章：React Server Components 原理

### 3.1 核心概念

**RSC 是 React 18+ 引入的新型组件模型**，组件在**服务端运行**，不向客户端发送 JS。

**三类组件的区分**：

| 类型 | 运行环境 | 是否发送 JS | 是否有 hooks | 能否用 onClick |
|------|---------|-----------|------------|--------------|
| Server Component | 服务端 | 否 | 否 | 否 |
| Client Component | 客户端 | 是 | 是 | 是 |
| Shared Component | 两端 | 看情况 | 视情况 | 视情况 |

### 3.2 RSC 工作原理

**渲染流程**：

```
1. 客户端发起请求 GET /products
2. Next.js 服务端执行 RootLayout → ProductPage → ProductList
3. Server Component 渲染为 RSC Payload（特殊格式）
4. Client Component 也渲染，但保留为占位符 + 引用
5. 服务端发送 HTML + RSC Payload 到客户端
6. 客户端 Hydrate Client Component
7. 客户端订阅 RSC Stream，路由切换时只更新变化部分
```

**RSC Payload 格式**（简化）：

```json
{
  "type": "div",
  "children": [
    { "type": "h1", "children": "Products" },
    {
      "type": "ProductList",
      "props": {
        "products": [
          { "id": 1, "name": "iPhone", "price": 999 }
        ]
      }
    }
  ]
}
```

### 3.3 何时使用 Server / Client Components

**Server Component（默认）**：
- 异步数据获取（直接 await）
- 直接访问后端资源（DB、文件系统）
- 大型依赖（如 markdown 渲染器）
- 敏感逻辑（API key、token）
- SEO 关键内容

**Client Component（'use client'）**：
- 需要用户交互（onClick、onChange）
- 使用 React hooks（useState、useEffect）
- 浏览器 API（localStorage、window）
- 第三方客户端库（图表、富文本）
- 实时更新（WebSocket）

### 3.4 边界原则

**'use client' 是边界，不是单文件标记**：

```tsx
// app/components/AddToCartButton.tsx
'use client';  // 这是边界，import 此文件的所有组件树都进入客户端

import { useState } from 'react';

export function AddToCartButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  return <button onClick={() => addToCart(productId)}>Add</button>;
}
```

```tsx
// app/products/[id]/page.tsx
// 父组件保持 Server Component
import { AddToCartButton } from '@/components/AddToCartButton';  // 引入客户端组件
import { getProduct } from '@/lib/db';

export default async function ProductPage({ params }) {
  const { id } = await params;
  const product = await getProduct(id);  // 服务端数据获取
  return (
    <div>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      {/* 这里引入客户端组件 - 形成边界 */}
      <AddToCartButton productId={id} />
    </div>
  );
}
```

**关键规则**：
- 服务端组件**不能**导入客户端组件然后调用它
- 服务端组件**可以**渲染客户端组件（作为 children 传递也可以）
- 客户端组件**不能**直接 await 服务端数据

### 3.5 RSC 数据获取模式

#### 3.5.1 直接数据库访问

```tsx
// app/products/page.tsx
import { db } from '@/lib/db';  // 直接 ORM

export default async function ProductsPage() {
  // 直接查询，无 API 层
  const products = await db.product.findMany({
    where: { published: true },
    take: 20,
  });
  return <ProductList products={products} />;
}
```

**优势**：
- 无 fetch 开销
- 无序列化/反序列化
- 类型完全保留
- SQL 优化更直接

#### 3.5.2 跨组件数据共享

```tsx
// 父组件
export default async function DashboardPage() {
  const user = await getUser();
  const orders = await getOrders(user.id);
  const stats = await getStats(user.id);
  
  // 把数据作为 props 传给子组件
  return (
    <DashboardLayout>
      <UserCard user={user} />
      <OrdersList orders={orders} />
      <StatsCards stats={stats} />
    </DashboardLayout>
  );
}
```

**模式对比**：

| 模式 | 数据流 | 适用场景 |
|------|-------|---------|
| 父取子传 | 父→子 | 数据有明确层级 |
| Context | 全局可访问 | 主题、用户信息 |
| 客户端获取 | useEffect + SWR | 高度动态数据 |
| Suspense 流式 | 独立加载 | 独立区块 |

#### 3.5.3 并行数据获取

```tsx
// ❌ 串行获取（瀑布流）
export default async function Page() {
  const user = await getUser();       // 200ms
  const posts = await getPosts();      // 300ms（等待 user）
  const comments = await getComments(); // 200ms（等待 posts）
  // 总耗时：700ms
}

// ✅ 并行获取
export default async function Page() {
  const [user, posts, comments] = await Promise.all([
    getUser(),      // 200ms
    getPosts(),     // 300ms
    getComments(),  // 200ms
  ]);
  // 总耗时：300ms（max）
}

// ✅ Suspense 包裹（流式）
import { Suspense } from 'react';

export default function Page() {
  return (
    <>
      <Suspense fallback={<UserSkeleton />}>
        <UserSection />  {/* 内部 await getUser() */}
      </Suspense>
      <Suspense fallback={<PostsSkeleton />}>
        <PostsSection />  {/* 内部 await getPosts() */}
      </Suspense>
      <Suspense fallback={<CommentsSkeleton />}>
        <CommentsSection />  {/* 内部 await getComments() */}
      </Suspense>
    </>
  );
}
```

### 3.6 序列化的边界

RSC 通过**序列化**在服务端→客户端传递数据：

```tsx
// Server Component
export default async function Page() {
  const user = await getUser();
  return <UserCard user={user} />;  // user 必须可序列化
}
```

**可序列化的类型**：
- 原始类型（string、number、boolean、null）
- 数组、对象
- Date、Map、Set（受限）
- React 元素
- 客户端组件引用

**不可序列化**：
- 函数（除了 Server Actions）
- Symbol
- 类实例
- 循环引用
- 未打包的 Node 模块

**错误示例**：

```tsx
// ❌ 函数不能作为 prop 传递
<ClientComponent onClick={() => doSomething()} />  // 错误

// ✅ 用 Server Action
<ClientComponent action={myServerAction} />

// ❌ 类实例
<ClientComponent date={new DateWithMethods()} />

// ✅ 只传可序列化的部分
<ClientComponent date={date.toISOString()} />
```

### 3.7 Server Components 限制

| 限制 | 原因 | 解决 |
|------|------|------|
| 不能用 hooks | 服务端无 React 状态 | 用 Client Component |
| 不能用 onClick | 服务端无 DOM | 用 Client Component |
| 不能用 Context Provider | Provider 是客户端 | 嵌套 Client Provider |
| 不能读取 localStorage | 服务端无浏览器 | 客户端读取后传给服务端 |
| 不能用 Date.now() 动态 | 每次渲染结果不同 | 用 dynamic = 'force-dynamic' |

### 3.8 组合模式

#### 3.8.1 Server 包裹 Client

```tsx
// 父：Server Component
import { CartBadge } from './CartBadge';  // Client

export default async function Layout({ children }) {
  const cartCount = await getCartCount();
  return (
    <>
      <CartBadge count={cartCount} />
      {children}
    </>
  );
}
```

#### 3.8.2 Client 包裹 Server（用 children prop）

```tsx
// ClientComponent.tsx
'use client';
import { useState } from 'react';

export function Modal({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children}  {/* children 在服务端渲染后传入 */}
    </Dialog>
  );
}

// page.tsx (Server)
import { Modal } from './Modal';

export default async function Page() {
  const data = await getData();  // 服务端获取
  return (
    <Modal>
      <div>
        <h1>{data.title}</h1>  {/* children 在服务端渲染 */}
      </div>
    </Modal>
  );
}
```

#### 3.8.3 跨边界传递 Server Action

```tsx
// actions.ts
'use server';
export async function updateProfile(formData: FormData) {
  // ...
}

// form.tsx
'use client';
import { updateProfile } from './actions';

export function ProfileForm() {
  return (
    <form action={updateProfile}>
      <input name="name" />
      <button type="submit">保存</button>
    </form>
  );
}
```

---

## 第 4 章：Server Actions 完整指南

### 4.1 核心定义

**Server Actions 是运行在服务端的异步函数**，可以从客户端组件或服务端组件调用，而无需显式 API 路由。

```ts
// app/actions.ts
'use server';  // 文件级标记

// 1. 简单 Server Action
export async function createUser(formData: FormData) {
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  await db.user.create({ data: { name, email } });
}

// 2. 接收参数
export async function deleteUser(userId: string) {
  await db.user.delete({ where: { id: userId } });
}

// 3. 返回数据
export async function getUserCount(): Promise<number> {
  return await db.user.count();
}
```

**两种使用方式**：

```tsx
// 方式 1：作为 form action（自动处理）
<form action={createUser}>
  <input name="name" />
  <button type="submit">创建</button>
</form>

// 方式 2：从客户端组件手动调用
'use client';
import { createUser } from './actions';
import { useState } from 'react';

export function CreateUserButton() {
  const [pending, setPending] = useState(false);
  return (
    <button 
      onClick={async () => {
        setPending(true);
        const fd = new FormData();
        fd.set('name', 'Alice');
        await createUser(fd);
        setPending(false);
      }}
      disabled={pending}
    >
      创建
    </button>
  );
}
```

### 4.2 内联定义

```tsx
// app/products/page.tsx
export default function ProductsPage({ products }: { products: Product[] }) {
  // 内联 Server Action（必须 async）
  async function addToCart(formData: FormData) {
    'use server';
    const productId = formData.get('productId');
    await db.cart.create({ data: { productId } });
    revalidatePath('/cart');
  }

  return (
    <form action={addToCart}>
      <input type="hidden" name="productId" value="123" />
      <button type="submit">加入购物车</button>
    </form>
  );
}
```

### 4.3 错误处理与返回状态

```tsx
// actions.ts
'use server';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

export type ActionState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
} | null;

export async function createUser(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const data = schema.parse({
      name: formData.get('name'),
      email: formData.get('email'),
    });
    
    const existing = await db.user.findUnique({ 
      where: { email: data.email } 
    });
    if (existing) {
      return {
        success: false,
        message: '邮箱已被注册',
        errors: { email: ['该邮箱已存在'] },
      };
    }
    
    await db.user.create({ data });
    revalidatePath('/users');
    return { success: true, message: '创建成功' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: '验证失败',
        errors: error.flatten().fieldErrors,
      };
    }
    return { success: false, message: '服务器错误' };
  }
}
```

**客户端使用 useActionState（React 19）**：

```tsx
'use client';
import { useActionState } from 'react';
import { createUser } from './actions';

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(
    createUser,
    null
  );

  return (
    <form action={formAction}>
      <input name="name" />
      {state?.errors?.name && (
        <p className="error">{state.errors.name[0]}</p>
      )}
      <input name="email" />
      {state?.errors?.email && (
        <p className="error">{state.errors.email[0]}</p>
      )}
      <button type="submit" disabled={isPending}>
        {isPending ? '提交中...' : '创建'}
      </button>
      {state?.message && (
        <p className={state.success ? 'success' : 'error'}>
          {state.message}
        </p>
      )}
    </form>
  );
}
```

### 4.4 乐观更新（useOptimistic）

```tsx
'use client';
import { useOptimistic } from 'react';
import { sendMessage } from './actions';

type Message = { id: string; text: string; sending?: boolean };

export function MessageList({ messages }: { messages: Message[] }) {
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage]
  );

  async function formAction(formData: FormData) {
    const text = formData.get('message') as string;
    addOptimistic({
      id: `temp-${Date.now()}`,
      text,
      sending: true,
    });
    await sendMessage(text);
  }

  return (
    <>
      {optimisticMessages.map(msg => (
        <div key={msg.id} className={msg.sending ? 'opacity-50' : ''}>
          {msg.text}
        </div>
      ))}
      <form action={formAction}>
        <input name="message" />
        <button type="submit">发送</button>
      </form>
    </>
  );
}
```

### 4.5 重新验证缓存

```tsx
// actions.ts
'use server';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function createPost(data: FormData) {
  await db.post.create({ data: { title: data.get('title') as string } });
  
  // 1. 重新验证特定路径
  revalidatePath('/posts');
  revalidatePath('/posts/[id]', 'page');  // 动态段
  
  // 2. 重新验证特定 layout
  revalidatePath('/dashboard', 'layout');
  
  // 3. 按 tag 失效
  revalidateTag('posts');
  
  // 4. 跳转到其他页面
  redirect('/posts');
}
```

**revalidatePath 第二参数**：

| 值 | 含义 |
|---|---|
| `'page'` | 仅刷新页面的 fetch（默认） |
| `'layout'` | 刷新布局及其子页面 |
| `undefined` | 自动推断 |

### 4.6 鉴权与安全

**每个 Server Action 都必须检查权限**：

```tsx
'use server';
import { getServerSession } from 'next-auth';
import { auth } from '@/lib/auth';

export async function deleteAccount(userId: string) {
  // 1. 检查登录
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  
  // 2. 检查资源所有权
  if (session.user.id !== userId && session.user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  
  await db.user.delete({ where: { id: userId } });
}
```

**CSRF 保护**：

Next.js Server Actions **默认开启 CSRF 保护**：
- 验证 Origin 头是否匹配 host
- 使用 POST + 加密的 action ID
- 不可跨域调用

```ts
// next.config.js
module.exports = {
  experimental: {
    serverActions: {
      allowedOrigins: ['example.com', '*.example.com'],
      bodySizeLimit: '2mb',
    },
  },
};
```

### 4.7 调用模式对比

| 模式 | 写法 | 适用场景 |
|------|------|---------|
| form action | `<form action={fn}>` | 表单提交、渐进增强 |
| 手动调用 | `await fn(arg)` | 按钮点击、复杂逻辑 |
| useActionState | `useActionState(fn, init)` | 错误返回、表单状态 |
| useOptimistic | `useOptimistic(state, updater)` | 即时反馈 |
| 触发其他 Action | 嵌套调用 | 复杂工作流 |

### 4.8 性能优化

```tsx
'use server';
import { unstable_cache } from 'next/cache';

// 1. 缓存昂贵操作
const getCachedStats = unstable_cache(
  async () => {
    return await db.stat.aggregate({ /* ... */ });
  },
  ['stats'],
  { revalidate: 3600, tags: ['stats'] }
);

export async function getStats() {
  return await getCachedStats();
}

// 2. 数据并行
export async function createOrder(data: OrderInput) {
  const [user, products, inventory] = await Promise.all([
    db.user.findUnique({ where: { id: data.userId } }),
    db.product.findMany({ where: { id: { in: data.productIds } } }),
    db.inventory.findMany({ where: { productId: { in: data.productIds } } }),
  ]);
  
  // 业务逻辑...
}
```

### 4.9 Server Actions 调试技巧

```tsx
'use server';
import { headers } from 'next/headers';

export async function myAction(formData: FormData) {
  // 1. 打印日志（服务端控制台）
  console.log('Action called:', { formData });
  
  // 2. 获取请求头
  const h = await headers();
  console.log('User-Agent:', h.get('user-agent'));
  
  // 3. 错误堆栈
  try {
    // ...
  } catch (e) {
    console.error('Stack:', e.stack);
  }
  
  // 4. 自定义错误返回
  return { error: 'Something went wrong' };
}
```

**追踪 action ID**：

每次 Server Action 编译时生成唯一 ID，便于调试：
- 浏览器 DevTools → Network → 找 action 请求
- Payload 包含加密的 action ID

### 4.10 常见错误与解决

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| "Server Actions are not enabled" | 旧版本未启用 | 升级到 14+ |
| "Failed to find Server Action" | Action ID 过期（开发热重载） | 重新加载页面 |
| "Body exceeded bodySizeLimit" | 上传文件过大 | 增大 `bodySizeLimit` |
| "Cannot read property of undefined" | 客户端组件未传参 | 检查参数签名 |
| "Module not found" | 'use server' 缺失 | 在文件顶部添加 |
| "Cookies can only be modified in a Server Action" | 在客户端修改 | 改用 Server Action |

---

## 第 5 章：数据获取与缓存策略

### 5.1 数据获取全貌

Next.js 15 提供了**四层数据获取抽象**：

```
┌─────────────────────────────────┐
│ 1. fetch() 扩展                  │  ← 网络请求
│ 2. ORM/DB 直接调用               │  ← 服务端组件直接查询
│ 3. Server Actions                │  ← 写入
│ 4. 客户端 useSWR/React Query    │  ← 客户端获取
└─────────────────────────────────┘
```

### 5.2 fetch 扩展详解

```ts
// Next.js 扩展了原生 fetch
// app/lib/api.ts

// 1. 默认行为（Next.js 15+）
const res = await fetch('https://api.example.com/data');
// 不缓存（每次新请求）

// 2. 强制缓存（SSG）
const cached = await fetch('https://api.example.com/data', {
  cache: 'force-cache',
});

// 3. 不缓存（SSR）
const fresh = await fetch('https://api.example.com/data', {
  cache: 'no-store',
});

// 4. ISR（按时间）
const isr = await fetch('https://api.example.com/data', {
  next: { revalidate: 60 },
});

// 5. Tag 失效
const tagged = await fetch('https://api.example.com/data', {
  next: { tags: ['products'] },
});

// 6. 自动去重（同请求合并）
// 多个组件同时 await 同一 URL → 只发一次请求
const [a, b] = await Promise.all([
  fetch('https://api.example.com/data').then(r => r.json()),
  fetch('https://api.example.com/data').then(r => r.json()),
]);
// 实际只发一个网络请求
```

### 5.3 数据获取模式

#### 5.3.1 服务端组件直接获取

```tsx
// app/products/page.tsx
import { db } from '@/lib/db';  // Prisma / Drizzle

export default async function ProductsPage() {
  // 1. 直接数据库查询（推荐）
  const products = await db.product.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  
  return <ProductList products={products} />;
}
```

**优势**：
- 类型安全（TypeScript）
- 无 fetch 开销
- 无序列化问题
- 完整 SQL 优化能力

#### 5.3.2 客户端获取（动态数据）

```tsx
'use client';
import useSWR from 'swr';

export function LiveStats() {
  const { data, error, isLoading } = useSWR('/api/stats', fetcher, {
    refreshInterval: 5000,  // 5 秒刷新
  });
  
  if (isLoading) return <Skeleton />;
  if (error) return <Error />;
  return <StatsDisplay stats={data} />;
}
```

#### 5.3.3 客户端获取（一次性）

```tsx
'use client';
import { useEffect, useState } from 'react';

export function UserLocation() {
  const [location, setLocation] = useState(null);
  
  useEffect(() => {
    fetch('/api/location')
      .then(r => r.json())
      .then(setLocation);
  }, []);
  
  if (!location) return <Skeleton />;
  return <div>{location.city}</div>;
}
```

### 5.4 缓存策略矩阵

| 场景 | 推荐策略 | 配置 |
|------|---------|------|
| 营销页面（极少变） | SSG（force-cache） | `cache: 'force-cache'` |
| 博客文章（偶尔更新） | ISR | `next: { revalidate: 3600 }` |
| 用户仪表盘 | SSR（no-store） | `cache: 'no-store'` |
| 实时数据 | 客户端获取 | useSWR + refreshInterval |
| 写后立即读 | `revalidatePath` | Server Action |
| 部分内容动态 | Streaming + Suspense | `<Suspense>` |

### 5.5 unstable_cache 高级用法

```ts
import { unstable_cache } from 'next/cache';

// 缓存计算结果（不是 fetch）
const getCachedStats = unstable_cache(
  async () => {
    const orders = await db.order.findMany();
    return {
      total: orders.length,
      revenue: orders.reduce((sum, o) => sum + o.amount, 0),
    };
  },
  ['dashboard-stats'],  // cache key
  {
    revalidate: 3600,
    tags: ['stats'],
  }
);

export default async function Dashboard() {
  const stats = await getCachedStats();
  return <div>{stats.total}</div>;
}
```

### 5.6 缓存层级

```
1. 内存缓存（请求级别 - React 缓存函数）
2. 数据缓存（persistent across requests - fetch / unstable_cache）
3. 路由缓存（Router Cache - 客户端 RSC 缓存）
4. 完整路由缓存（Full Route Cache - 静态渲染结果）

时间线：
请求 → 内存缓存命中 → 数据缓存命中 → 渲染或返回缓存 RSC
        ↓ miss          ↓ miss           ↓
        数据获取        fetch/DB         HTML
```

### 5.7 数据变更与失效

```tsx
'use server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';

export async function updateProduct(id: string, formData: FormData) {
  await db.product.update({
    where: { id },
    data: {
      name: formData.get('name') as string,
      price: Number(formData.get('price')),
    },
  });
  
  // 选项 1：失效特定路径
  revalidatePath('/products');
  revalidatePath(`/products/${id}`, 'page');
  
  // 选项 2：按 tag 失效（更精细）
  revalidateTag(`product-${id}`);
  revalidateTag('products');
  
  // 选项 3：跳转到新页面（自动失效）
  redirect('/products');
}
```

### 5.8 实战：电商数据获取

```ts
// lib/data/products.ts
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';

// 1. 产品列表（带筛选 + 分页 + 缓存）
export const getProducts = unstable_cache(
  async (filters: ProductFilters) => {
    return await db.product.findMany({
      where: {
        published: true,
        category: filters.category,
        priceRange: filters.priceRange && {
          gte: filters.priceRange[0],
          lte: filters.priceRange[1],
        },
      },
      orderBy: filters.sortBy ? { [filters.sortBy]: 'desc' } : { createdAt: 'desc' },
      take: filters.limit ?? 20,
      skip: filters.offset ?? 0,
    });
  },
  ['products'],
  { tags: ['products'], revalidate: 3600 }
);

// 2. 单个产品（按 ID 缓存）
export const getProduct = (id: string) =>
  unstable_cache(
    async () => db.product.findUnique({ 
      where: { id },
      include: { reviews: true, inventory: true },
    }),
    [`product-${id}`],
    { tags: [`product-${id}`, 'products'], revalidate: 3600 }
  )();

// 3. 用户相关（不缓存）
export async function getUserCart(userId: string) {
  return await db.cart.findUnique({
    where: { userId },
    include: { items: { include: { product: true } } },
  });
}
```

```tsx
// app/products/page.tsx
import { getProducts } from '@/lib/data/products';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string }>;
}) {
  const { category, sort } = await searchParams;
  const products = await getProducts({
    category,
    sortBy: sort as any,
    limit: 20,
  });
  
  return <ProductList products={products} />;
}
```

### 5.9 客户端数据获取（React Query 集成）

```tsx
// app/providers.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));
  
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

```tsx
// app/products/[id]/StockIndicator.tsx
'use client';
import { useQuery } from '@tanstack/react-query';

export function StockIndicator({ productId }: { productId: string }) {
  const { data: stock } = useQuery({
    queryKey: ['stock', productId],
    queryFn: () => fetch(`/api/stock/${productId}`).then(r => r.json()),
    refetchInterval: 30000,  // 30 秒轮询
  });
  
  return <span>{stock?.inStock ? '有货' : '缺货'}</span>;
}
```

### 5.10 数据获取的取舍

| 取舍 | 服务端获取 | 客户端获取 |
|------|----------|----------|
| SEO | 优秀 | 差 |
| 首屏速度 | 快 | 慢（需 JS 加载） |
| 实时性 | 需手动刷新 | 可轮询/SSE |
| 交互性 | 静态 | 完全可交互 |
| 离线 | 不支持 | 可缓存 |
| 代码复杂度 | 简单 | 需处理加载状态 |

**黄金法则**：
- **首屏关键内容** → 服务端
- **用户交互后更新** → Server Action
- **频繁实时数据** → 客户端
- **SEO 内容** → 始终服务端

---

## 第 6 章：Streaming SSR 与 Suspense

### 6.1 什么是 Streaming SSR

**传统 SSR**：服务端渲染完整 HTML → 一次性发送 → 浏览器解析渲染
**Streaming SSR**：服务端分块发送 HTML → 浏览器边收边渲染

```
传统 SSR：
[████████████████████████████████] → 200ms → 浏览器显示
   所有内容一起渲染

Streaming SSR：
[██头部] → 50ms → 浏览器显示头部
    [██侧边栏] → 100ms → 浏览器显示侧边栏
        [████████主要内容] → 300ms → 浏览器显示内容
            [██评论] → 500ms → 浏览器显示评论
```

### 6.2 Suspense 基础

```tsx
import { Suspense } from 'react';

// 父组件：定义加载顺序
export default function Page() {
  return (
    <>
      {/* 立即显示的部分 */}
      <Header />
      <Navigation />
      
      {/* 慢数据用 Suspense 包裹 */}
      <Suspense fallback={<ProductListSkeleton />}>
        <SlowProductList />  {/* 内部 await */}
      </Suspense>
      
      <Suspense fallback={<ReviewsSkeleton />}>
        <SlowReviews />
      </Suspense>
    </>
  );
}
```

### 6.3 嵌套 Suspense

```tsx
// app/dashboard/page.tsx
export default function Dashboard() {
  return (
    <div className="grid">
      {/* 第一层 - 用户信息 */}
      <Suspense fallback={<UserSkeleton />}>
        <UserCard userId="123" />
      </Suspense>
      
      {/* 第二层 - 用户信息和订单（依赖用户） */}
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersForUser userId="123" />
      </Suspense>
      
      {/* 并行 - 推荐商品（不依赖用户） */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <RecommendedProducts />
      </Suspense>
    </div>
  );
}

// UserCard.tsx (Server)
async function UserCard({ userId }: { userId: string }) {
  const user = await getUser(userId);  // 200ms
  return <div>{user.name}</div>;
}

async function OrdersForUser({ userId }: { userId: string }) {
  const user = await getUser(userId);  // 200ms（与 UserCard 共享请求）
  const orders = await getOrders(user.id);  // 300ms
  return <OrdersList orders={orders} />;
}
```

**Suspense 行为**：
- 并行等待所有数据
- 任一完成就显示该部分
- 其他部分继续 loading
- 完成后插入对应位置（不重排）

### 6.4 错误边界与 Suspense

```tsx
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

// 错误 + 加载双重保护
<ErrorBoundary fallback={<ErrorUI />}>
  <Suspense fallback={<LoadingUI />}>
    <AsyncDataComponent />
  </Suspense>
</ErrorBoundary>
```

### 6.5 Loading Skeleton 模式

```tsx
// components/Skeleton.tsx
export function ProductCardSkeleton() {
  return (
    <div className="card animate-pulse">
      <div className="h-48 bg-gray-200 rounded" />
      <div className="h-4 bg-gray-200 rounded mt-2 w-3/4" />
      <div className="h-4 bg-gray-200 rounded mt-2 w-1/2" />
    </div>
  );
}

// 使用
<Suspense fallback={
  <div className="grid grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <ProductCardSkeleton key={i} />
    ))}
  </div>
}>
  <ProductList />
</Suspense>
```

### 6.6 Streaming 的服务端实现

Next.js 默认开启 streaming，可通过 `loading.tsx` 或 `<Suspense>` 实现：

```tsx
// app/products/loading.tsx（自动包裹）
export default function Loading() {
  return <ProductGridSkeleton />;
}

// 效果等同：
<Suspense fallback={<ProductGridSkeleton />}>
  <ProductList />
</Suspense>
```

### 6.7 关闭 Streaming（不推荐）

```tsx
// app/page.tsx
export const dynamic = 'force-dynamic';

export default async function Page() {
  // 等待所有数据后再响应（关闭 streaming）
  const data = await getAllData();
  return <div>{data}</div>;
}
```

### 6.8 Streaming 的网络层细节

**HTTP/1.1 Transfer-Encoding: chunked**：

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Transfer-Encoding: chunked

<!DOCTYPE html>
<html>...<head>...</head><body>
<header>...</header>     ← 第一个 chunk
<main>...<aside>...
  <div>用户信息</div>   ← 第二个 chunk（5 秒后）
</aside></main>
</body></html>
```

**HTTP/2 多路复用**：天然支持多个独立流。

### 6.9 实战：流式 AI 输出

```tsx
// app/chat/page.tsx
import { Suspense } from 'react';
import { streamLLMResponse } from '@/lib/llm';

async function StreamingResponse({ prompt }: { prompt: string }) {
  const stream = await streamLLMResponse(prompt);
  
  // 包装为可读流
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  
  return (
    <div>
      {await (async function* () {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield <span>{decoder.decode(value)}</span>;
        }
      })()}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div>AI 正在思考...</div>}>
      <StreamingResponse prompt="解释量子力学" />
    </Suspense>
  );
}
```

### 6.10 Streaming 性能对比

| 指标 | 传统 SSR | Streaming SSR |
|------|---------|--------------|
| TTFB | 慢（等所有数据） | 快（首字节即可） |
| FCP | 慢 | 快 |
| LCP | 慢（最慢部分决定） | 快（快部分先显示） |
| TTI | 慢 | 取决于水合 |
| SEO | 优秀 | 优秀 |
| 实现复杂度 | 低 | 中 |

**经验法则**：
- 数据获取 > 200ms → 用 Suspense
- 多块独立数据 → 多个 Suspense
- 首屏快内容 → 不包裹

---

## 第 7 章：Partial Prerendering（PPR）

### 7.1 PPR 概念

**PPR（Partial Prerendering，部分预渲染）** 是 Next.js 14+ 引入的**实验性**特性，结合 SSG 和 SSR 的优势：

- **静态部分**：构建时预渲染，CDN 缓存（SSG 速度）
- **动态部分**：请求时流式渲染（SSR 实时）

```
单一 URL：
[静态外壳] → 立即返回（CDN 边缘，10ms）
   [动态孔洞] → 流式注入（边缘 SSR，200ms）
```

### 7.2 PPR 状态

| 版本 | 状态 |
|------|------|
| Next.js 14.0 | 预览版（实验） |
| Next.js 15.0+ | 仍 experimental，Vercel 完全支持 |

### 7.3 启用 PPR

```js
// next.config.js
module.exports = {
  experimental: {
    ppr: 'incremental',  // 增量启用
    // 或 ppr: true（全部启用）
  },
};
```

### 7.4 使用 Suspense 标记动态边界

```tsx
// app/products/page.tsx
import { Suspense } from 'react';
import { cookies } from 'next/headers';

// PPR 默认所有内容是静态
// 用 Suspense + 动态数据访问 → 自动成为动态"孔洞"

export default function ProductsPage() {
  return (
    <div>
      {/* 静态 - 预渲染 */}
      <Header />
      <ProductFilters />
      
      {/* 动态 - 用户相关，从 cookies 读取 */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <UserRecommendations />  {/* 内部 await cookies() */}
      </Suspense>
      
      {/* 静态 - 商品列表 */}
      <ProductList />
      
      {/* 动态 - 购物车数量 */}
      <Suspense fallback={<CartCountSkeleton />}>
        <CartCount />
      </Suspense>
    </div>
  );
}

async function UserRecommendations() {
  // 任何动态 API（cookies/headers）触发此部分为动态
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;
  const recs = await getRecommendations(userId);
  return <RecommendationsList items={recs} />;
}
```

### 7.5 PPR 路由配置

```tsx
// app/products/page.tsx
export const experimental_ppr = true;  // 启用此路由的 PPR
// 或
export const dynamic = 'force-static';  // 整个页面静态（无 PPR）
// 或
export const dynamic = 'force-dynamic';  // 整个页面动态
```

### 7.6 PPR 工作原理

```
1. 构建时：
   - 扫描所有 Suspense 边界
   - 静态部分预渲染为 HTML（CDN 缓存）
   - 动态部分保留为"孔洞"占位符

2. 请求时：
   - 边缘节点返回预渲染的 HTML（< 50ms）
   - 浏览器立即看到静态内容
   - 服务端并行计算动态部分
   - 流式注入到孔洞位置
   - 用户看到完整页面
```

### 7.7 PPR vs SSG vs SSR

| 维度 | SSG | SSR | PPR |
|------|-----|-----|-----|
| 首字节 | 最快 | 慢 | 接近 SSG |
| 数据实时性 | 差（构建时） | 优秀 | 优秀 |
| 个性化 | 不支持 | 支持 | 支持（动态部分） |
| 缓存效率 | 最高 | 低 | 中（部分缓存） |
| 实现复杂度 | 最低 | 中 | 中 |
| 适用场景 | 营销页 | 仪表盘 | 电商/内容站 |

### 7.8 实战：电商首页 PPR

```tsx
// app/page.tsx
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';

// 静态部分 - 预渲染
const getBanners = unstable_cache(
  async () => db.banner.findMany({ where: { active: true } }),
  ['banners'],
  { revalidate: 3600 }
);

const getFeaturedProducts = unstable_cache(
  async () => db.product.findMany({ 
    where: { featured: true }, 
    take: 8 
  }),
  ['featured'],
  { revalidate: 3600 }
);

export default async function HomePage() {
  const [banners, products] = await Promise.all([
    getBanners(),
    getFeaturedProducts(),
  ]);
  
  return (
    <main>
      {/* 全部静态 - 一次预渲染 */}
      <Banners items={banners} />
      <FeaturedProducts items={products} />
      
      {/* 动态孔洞 */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <PersonalizedRecommendations />
      </Suspense>
      
      <Suspense fallback={<CartIndicatorSkeleton />}>
        <CartIndicator />
      </Suspense>
    </main>
  );
}

async function PersonalizedRecommendations() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('uid')?.value;
  if (!userId) return <GuestRecommendations />;
  const recs = await getRecommendationsForUser(userId);
  return <Recommendations items={recs} />;
}
```

### 7.9 PPR 限制

- 仅在支持 Node.js / Edge 的运行时
- Vercel 完整支持，自托管需 Next.js 15+
- 不支持 POST 等非 GET 请求的预渲染
- 部分三方库不兼容

---

## 第 8 章：性能优化手册

### 8.1 性能指标体系（Core Web Vitals）

| 指标 | 全称 | 目标值 | 测量方式 |
|------|------|-------|---------|
| **LCP** | Largest Contentful Paint | < 2.5s | 最大可见元素渲染时间 |
| **FID** | First Input Delay | < 100ms | 首次交互延迟 |
| **INP** | Interaction to Next Paint | < 200ms | 交互响应时间（替代 FID） |
| **CLS** | Cumulative Layout Shift | < 0.1 | 视觉稳定性 |
| **TTFB** | Time to First Byte | < 800ms | 首字节时间 |
| **FCP** | First Contentful Paint | < 1.8s | 首次内容渲染 |
| **TBT** | Total Blocking Time | < 200ms | 主线程阻塞时间 |

### 8.2 图片优化（next/image）

```tsx
import Image from 'next/image';

// 1. 基础用法（自动 WebP、响应式）
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority  // 首屏图，立即加载
/>

// 2. 远程图片（需配置 next.config.js）
<Image
  src="https://cdn.example.com/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."  // 模糊占位
/>

// 3. 响应式（fill 模式）
<div className="relative w-full h-96">
  <Image
    src="/banner.jpg"
    alt="Banner"
    fill
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    style={{ objectFit: 'cover' }}
  />
</div>

// 4. next.config.js 远程域名配置
module.exports = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};
```

**Image 优化原理**：
- 自动按设备宽度生成多尺寸
- 自动选择最优格式（AVIF > WebP > JPEG）
- 懒加载（首屏外）
- 防止 CLS（width/height 必需）
- CDN 缓存（自托管需配置 loader）

### 8.3 字体优化（next/font）

```tsx
// app/layout.tsx
import { Inter, Noto_Sans_SC } from 'next/font/google';
import localFont from 'next/font/local';

// Google 字体（构建时下载，自托管）
const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '700'],
});

// 中文（思源黑体）
const notoSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

// 本地字体
const myFont = localFont({
  src: './fonts/MyFont.woff2',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${notoSC.variable}`}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

**优势**：
- 构建时下载字体（无运行时网络）
- 自托管（无 Google CDN 依赖）
- 自动预加载关键字体
- 消除布局偏移（FOUT/FOIT）
- CSS 变量方式使用

### 8.4 Script 优化（next/script）

```tsx
import Script from 'next/script';

// 1. 加载策略
<Script src="https://example.com/analytics.js" strategy="beforeInteractive" />
<Script src="https://example.com/chat.js" strategy="afterInteractive" />  // 默认
<Script src="https://example.com/widget.js" strategy="lazyOnload" />  // 空闲时

// 2. 内联脚本
<Script id="gtm">
  {`(function(w,d,s,l,i){...})(window,document,'script','dataLayer','GTM-XXXX');`}
</Script>

// 3. 事件回调
<Script
  src="https://example.com/sdk.js"
  onLoad={() => console.log('SDK loaded')}
  onError={(e) => console.error('SDK failed', e)}
  onReady={() => console.log('SDK ready')}
/>

// 4. Partytown（Web Worker 运行）
<Script src="..." strategy="worker" />
```

### 8.5 Link 预取

```tsx
import Link from 'next/link';

// 默认行为：视口内自动预取（viewport visible）
<Link href="/about">关于我们</Link>

// 禁用预取
<Link href="/about" prefetch={false}>关于我们</Link>

// 手动预取
import { useRouter } from 'next/navigation';

function ProductCard({ product }) {
  const router = useRouter();
  
  return (
    <div onMouseEnter={() => router.prefetch(`/products/${product.id}`)}>
      {/* 鼠标悬停时预取详情页 */}
    </div>
  );
}
```

### 8.6 代码分割（Code Splitting）

```tsx
// 1. 动态导入（按需加载）
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,  // 禁用 SSR
});

const AdminPanel = dynamic(() => import('@/components/AdminPanel'), {
  loading: () => <p>Loading...</p>,
});

// 2. 命名导出
const Component = dynamic(
  () => import('@/components/Modal').then(mod => mod.Modal),
  { ssr: false }
);

// 3. 第三方库按需
const Editor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.Editor),
  { ssr: false }
);

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <HeavyChart data={data} />  {/* 仅在需要时加载 */}
    </div>
  );
}
```

### 8.7 包体积分析

```bash
# 1. 安装分析工具
npm install @next/bundle-analyzer

# 2. next.config.js 配置
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // 配置...
});

# 3. 运行
ANALYZE=true npm run build
```

**优化策略**：

| 策略 | 效果 | 实施难度 |
|------|------|---------|
| Tree Shaking | 自动 | 低 |
| Code Splitting | 显著 | 低 |
| 替换大库 | 显著 | 中 |
| 懒加载 | 中 | 低 |
| CDN 加载三方 | 显著 | 中 |
| Polyfill 优化 | 中 | 中 |

### 8.8 Bundle 优化实战

```ts
// next.config.js
module.exports = {
  // 1. 实验性优化
  experimental: {
    optimizePackageImports: ['lodash', 'date-fns', 'antd', 'mui'],
  },
  
  // 2. 构建优化
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error'],
    } : false,
  },
  
  // 3. 静态资源 CDN
  assetPrefix: process.env.NODE_ENV === 'production' 
    ? 'https://cdn.example.com' 
    : '',
  
  // 4. 压缩
  compress: true,
  
  // 5. 生产 source map
  productionBrowserSourceMaps: false,
};
```

```tsx
// 4. 选择性导入（避免 barrel 文件）
// ❌ import { Button } from 'antd'; // 加载整个 antd
// ✅ import Button from 'antd/es/button';

// 5. 客户端组件最小化
// ❌ 把整个组件标 'use client'
// ✅ 把需要的交互部分拆出来
```

### 8.9 Web Vitals 监控

```tsx
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

**自定义监控**：

```tsx
// lib/vitals.ts
import { onCLS, onLCP, onINP, onFID } from 'web-vitals';

export function reportWebVitals() {
  onCLS(console.log);
  onLCP(console.log);
  onINP(console.log);
  onFID(console.log);
  
  // 发送到自定义后端
  onLCP((metric) => {
    fetch('/api/analytics', {
      method: 'POST',
      body: JSON.stringify({
        name: metric.name,
        value: metric.value,
        id: metric.id,
      }),
    });
  });
}

// app/layout.tsx
import { reportWebVitals } from '@/lib/vitals';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (typeof window !== 'undefined') {
    reportWebVitals();
  }
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

### 8.10 性能检查清单

**构建阶段**：
- [ ] 启用 SWC minify
- [ ] 启用 gzip/brotli
- [ ] 静态资源 CDN
- [ ] 图片优化
- [ ] 字体优化
- [ ] 移除 console.log
- [ ] 生产 source map 配置

**运行时**：
- [ ] Server Components 优先
- [ ] 客户端组件按需引入
- [ ] 动态导入大组件
- [ ] Link 预取配置
- [ ] DNS prefetch
- [ ] 缓存头配置

**数据获取**：
- [ ] 静态内容预渲染
- [ ] ISR 策略
- [ ] Streaming Suspense
- [ ] 数据并行获取

**网络**：
- [ ] HTTP/2 或 HTTP/3
- [ ] 启用 Service Worker
- [ ] 资源合并
- [ ] Critical CSS 内联

---

## 第 9 章：中间件（Middleware）实战

### 9.1 中间件基础

```ts
// middleware.ts（项目根目录，与 app/ 同级）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 1. 基础中间件
export function middleware(request: NextRequest) {
  // 请求信息
  const url = request.nextUrl;
  const userAgent = request.headers.get('user-agent');
  const country = request.geo?.country ?? 'US';
  
  // 修改请求
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-country', country);
  
  // 修改响应
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('x-custom-header', 'value');
  
  return response;
}

// 2. 匹配器配置
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
  // 排除静态资源和 API
};
```

### 9.2 鉴权中间件

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  
  // 1. 公开路由白名单
  const publicPaths = ['/', '/login', '/register', '/about', '/api/auth'];
  const isPublic = publicPaths.some(p => 
    request.nextUrl.pathname.startsWith(p)
  );
  
  if (isPublic) {
    return NextResponse.next();
  }
  
  // 2. 检查 token
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // 3. 验证 token
  try {
    const user = await verifyToken(token);
    
    // 添加用户信息到请求头（供下游 RSC 使用）
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', user.id);
    requestHeaders.set('x-user-role', user.role);
    
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch (err) {
    // token 无效
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session');
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
```

**在 Server Component 中读取**：

```tsx
// app/dashboard/page.tsx
import { headers } from 'next/headers';

export default async function DashboardPage() {
  const h = await headers();
  const userId = h.get('x-user-id');
  const role = h.get('x-user-role');
  
  // ... 业务逻辑
}
```

### 9.3 A/B 测试中间件

```ts
// middleware.ts
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // 1. 基于 cookie 决定 bucket
  let bucket = request.cookies.get('ab-bucket')?.value;
  
  if (!bucket) {
    // 2. 50/50 分配
    bucket = Math.random() < 0.5 ? 'A' : 'B';
  }
  
  // 3. 设置响应 cookie（持久化）
  const response = NextResponse.next();
  
  if (!request.cookies.get('ab-bucket')) {
    response.cookies.set('ab-bucket', bucket, {
      maxAge: 60 * 60 * 24 * 30,  // 30 天
    });
  }
  
  // 4. 传递 bucket 到 RSC
  response.headers.set('x-ab-bucket', bucket);
  
  return response;
}
```

```tsx
// app/page.tsx
import { headers } from 'next/headers';

export default async function HomePage() {
  const h = await headers();
  const bucket = h.get('x-ab-bucket');
  
  if (bucket === 'A') {
    return <HomePageVariantA />;
  } else {
    return <HomePageVariantB />;
  }
}
```

### 9.4 国际化路由中间件

```ts
// middleware.ts
import { NextResponse } from 'next/server';

const locales = ['en', 'zh', 'ja', 'es'];
const defaultLocale = 'en';

function getLocale(request: NextRequest) {
  // 1. 检查 cookie
  const cookieLocale = request.cookies.get('locale')?.value;
  if (cookieLocale && locales.includes(cookieLocale)) {
    return cookieLocale;
  }
  
  // 2. 检查 Accept-Language
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    for (const lang of acceptLanguage.split(',')) {
      const code = lang.split(';')[0].trim().split('-')[0];
      if (locales.includes(code)) {
        return code;
      }
    }
  }
  
  // 3. 默认
  return defaultLocale;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 跳过静态资源、API
  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return;
  }
  
  // 检查路径是否已有 locale 前缀
  const hasLocale = locales.some(locale => 
    pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );
  
  if (!hasLocale) {
    const locale = getLocale(request);
    const newUrl = new URL(`/${locale}${pathname}`, request.url);
    return NextResponse.redirect(newUrl);
  }
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
```

### 9.5 限流中间件

```ts
// middleware.ts
import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),  // 每分钟 100 次
});

export async function middleware(request: NextRequest) {
  // 1. 仅对 API 限流
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }
  
  // 2. 识别客户端
  const ip = request.ip ?? 'anonymous';
  
  // 3. 检查限流
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);
  
  if (!success) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': reset.toString(),
        'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString(),
      },
    });
  }
  
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', limit.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  
  return response;
}
```

### 9.6 安全中间件（Headers）

```ts
// middleware.ts
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // 1. 安全头
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // 2. CSP（内容安全策略）
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.example.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://api.example.com;"
  );
  
  // 3. HSTS
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  
  // 4. Permissions Policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  
  return response;
}
```

### 9.7 中间件限制

| 限制 | 说明 |
|------|------|
| 运行在 Edge Runtime | 不能用 Node API（如 fs、net） |
| 1MB 限制 | 中间件打包后大小 < 1MB |
| 不能直接响应 | 必须 `NextResponse.next()` 或 `redirect` |
| 静态资源不执行 | 排除 _next/static 等 |
| 不能修改请求体 | 只能修改 headers |
| 不能用 setHeader（headers） | Edge Runtime 不支持 |

### 9.8 中间件调试

```ts
// middleware.ts
export function middleware(request: NextRequest) {
  console.log('Middleware:', {
    path: request.nextUrl.pathname,
    method: request.method,
    geo: request.geo,
    ip: request.ip,
    userAgent: request.headers.get('user-agent'),
  });
  
  return NextResponse.next();
}
```

查看日志：开发模式下在终端查看。

---

## 第 10 章：认证与授权方案

### 10.1 认证方式对比

| 方案 | 适用场景 | 复杂度 | 安全性 |
|------|---------|-------|-------|
| **NextAuth.js / Auth.js** | 全场景，最流行 | 中 | 高 |
| **Clerk** | SaaS 快速集成 | 低 | 高 |
| **自建 JWT** | 简单应用 | 中 | 中 |
| **Supabase Auth** | 与 Supabase 集成 | 低 | 高 |
| **BaaS（Auth0、Firebase）** | 企业级 | 中 | 高 |
| **NextAuth + 数据库** | 自托管生产 | 中 | 高 |

### 10.2 NextAuth.js v5（Auth.js）配置

```ts
// auth.ts（根目录）
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';

export const { 
  handlers, 
  auth, 
  signIn, 
  signOut 
} = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_ID!,
      clientSecret: process.env.GOOGLE_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });
        
        if (!user) return null;
        
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        
        if (!valid) return null;
        
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
```

```ts
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from '@/auth';
// 或
import { handlers } from '@/auth';
export const { GET, POST } = handlers;
```

### 10.3 服务端鉴权

```tsx
// app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function DashboardPage() {
  const session = await auth();
  
  if (!session) {
    redirect('/login');
  }
  
  return <div>欢迎, {session.user.name}</div>;
}
```

**中间件 + 服务端双重保护**：

```ts
// middleware.ts（粗粒度）
export async function middleware(request: NextRequest) {
  const session = await auth();
  
  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

// page.tsx（细粒度）
export default async function Page() {
  const session = await auth();
  if (!session) redirect('/login');
  
  // 资源级检查
  if (session.user.role !== 'admin') {
    redirect('/403');
  }
}
```

### 10.4 客户端鉴权

```tsx
'use client';
import { useSession, signIn, signOut } from 'next-auth/react';

export function AuthButton() {
  const { data: session, status } = useSession();
  
  if (status === 'loading') return <p>加载中...</p>;
  
  if (session) {
    return (
      <div>
        <p>欢迎, {session.user.name}</p>
        <button onClick={() => signOut()}>登出</button>
      </div>
    );
  }
  
  return <button onClick={() => signIn()}>登录</button>;
}
```

### 10.5 Server Action 鉴权

```tsx
// actions/profile.ts
'use server';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function updateProfile(formData: FormData) {
  // 1. 鉴权
  const session = await auth();
  if (!session) {
    throw new Error('Unauthorized');
  }
  
  // 2. 验证
  const data = {
    name: formData.get('name') as string,
    bio: formData.get('bio') as string,
  };
  
  // 3. 业务逻辑
  await prisma.user.update({
    where: { id: session.user.id },
    data,
  });
  
  revalidatePath('/profile');
}
```

### 10.6 RBAC（角色访问控制）

```ts
// lib/rbac.ts
type Permission = 'read' | 'write' | 'delete' | 'admin';

const rolePermissions: Record<string, Permission[]> = {
  guest: ['read'],
  user: ['read', 'write'],
  moderator: ['read', 'write', 'delete'],
  admin: ['read', 'write', 'delete', 'admin'],
};

export function hasPermission(
  role: string,
  permission: Permission
): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}

// Server Action 中使用
'use server';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/rbac';

export async function deleteUser(userId: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  
  if (!hasPermission(session.user.role, 'delete')) {
    throw new Error('Forbidden');
  }
  
  await prisma.user.delete({ where: { id: userId } });
}
```

### 10.7 实战：完整登录流程

```tsx
// app/login/page.tsx
import { signIn } from '@/auth';

export default function LoginPage() {
  return (
    <div className="max-w-md mx-auto mt-20">
      <h1 className="text-2xl font-bold mb-6">登录</h1>
      
      <form action={async (formData) => {
        'use server';
        await signIn('credentials', {
          email: formData.get('email'),
          password: formData.get('password'),
          redirectTo: '/dashboard',
        });
      }}>
        <input name="email" type="email" required className="input" />
        <input name="password" type="password" required className="input" />
        <button type="submit" className="btn-primary">登录</button>
      </form>
      
      <div className="mt-6">
        <p>或使用：</p>
        <form action={async () => {
          'use server';
          await signIn('github', { redirectTo: '/dashboard' });
        }}>
          <button type="submit">GitHub 登录</button>
        </form>
      </div>
    </div>
  );
}
```

### 10.8 鉴权最佳实践

1. **始终在服务端检查**：永远不要仅靠客户端检查
2. **多层防护**：中间件 + Server Action + 页面级
3. **HTTPS Only**：生产环境强制 HTTPS
4. **HttpOnly Cookie**：防止 XSS 盗取
5. **SameSite**：防止 CSRF
6. **Token 过期**：短期 access + 长期 refresh
7. **审计日志**：记录所有敏感操作
8. **资源级权限**：基于所有权检查
9. **密码哈希**：bcrypt / argon2
10. **MFA**：关键操作二次验证

---

## 第 11 章：国际化（i18n）

### 11.1 i18n 方案对比

| 方案 | 实现方式 | 优势 | 劣势 |
|------|---------|------|------|
| **next-intl** | App Router 友好 | 完整 TypeScript、SSR 支持 | 学习曲线 |
| **next-i18next** | Pages Router 传统 | 老牌稳定 | 不适配 App Router |
| **react-i18next** | 纯客户端 | 灵活 | 需手动处理 SSR |
| **自建 JSON** | 完全自定义 | 极简 | 需自实现所有功能 |

### 11.2 next-intl 配置（推荐）

```bash
npm install next-intl
```

```ts
// i18n.ts
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

export const locales = ['en', 'zh', 'ja'] as const;
export const defaultLocale = 'en' as const;

export default getRequestConfig(async ({ locale }) => {
  if (!locales.includes(locale as any)) notFound();
  
  return {
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
```

```json
// messages/en.json
{
  "Index": {
    "title": "Hello, World!",
    "description": "Welcome to our app"
  },
  "Navigation": {
    "home": "Home",
    "about": "About",
    "contact": "Contact"
  }
}
```

```json
// messages/zh.json
{
  "Index": {
    "title": "你好，世界！",
    "description": "欢迎使用我们的应用"
  },
  "Navigation": {
    "home": "首页",
    "about": "关于",
    "contact": "联系"
  }
}
```

```ts
// middleware.ts
import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',  // URL 总带前缀
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
```

```ts
// next.config.js
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n.ts');

module.exports = withNextIntl({});
```

### 11.3 路由结构

```
app/
├── [locale]/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── about/
│   │   └── page.tsx
│   └── products/
│       ├── page.tsx
│       └── [id]/
│           └── page.tsx
```

```tsx
// app/[locale]/layout.tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, unstable_setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';

export function generateStaticParams() {
  return locales.map(locale => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = await params;
  
  if (!locales.includes(locale as any)) {
    notFound();
  }
  
  // 启用静态渲染
  unstable_setRequestLocale(locale);
  
  const messages = await getMessages();
  
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

```tsx
// app/[locale]/page.tsx
import { useTranslations } from 'next-intl';
import { unstable_setRequestLocale } from 'next-intl/server';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  // 在 Server Component 中设置
  const { locale } = use(params);
  unstable_setRequestLocale(locale);
  
  const t = useTranslations('Index');
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </div>
  );
}
```

### 11.4 客户端翻译

```tsx
'use client';
import { useTranslations } from 'next-intl';

export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations('Product');
  
  return (
    <div className="card">
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <button>{t('addToCart')}</button>
    </div>
  );
}
```

### 11.5 复数与插值

```json
{
  "Cart": {
    "items": "{count, plural, =0 {空购物车} =1 {1 件商品} other {# 件商品}}",
    "total": "总价：{amount, number, currency}"
  }
}
```

```tsx
const t = useTranslations('Cart');
t('items', { count: cart.items.length });  // "3 件商品"
t('total', { amount: 99.99 });  // "总价：¥99.99"
```

### 11.6 日期、数字、货币本地化

```tsx
import { useFormatter } from 'next-intl';

export function OrderInfo({ order }: { order: Order }) {
  const format = useFormatter();
  
  return (
    <div>
      {/* 日期 */}
      <p>下单时间：{format.dateTime(order.createdAt, { 
        dateStyle: 'long', 
        timeStyle: 'short' 
      })}</p>
      
      {/* 数字 */}
      <p>数量：{format.number(order.quantity)}</p>
      
      {/* 货币 */}
      <p>金额：{format.number(order.total, { 
        style: 'currency', 
        currency: 'USD' 
      })}</p>
      
      {/* 相对时间 */}
      <p>相对时间：{format.relativeTime(order.createdAt)}</p>
      
      {/* 列表 */}
      <p>标签：{format.list(tags, { type: 'disjunction' })}</p>
    </div>
  );
}
```

不同语言输出：
- en: "$1,234.56", "Jan 1, 2026 at 10:30 AM"
- zh: "¥1,234.56", "2026年1月1日 10:30"
- ja: "¥1,234", "2026年1月1日 10:30"

### 11.7 语言切换器

```tsx
'use client';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { locales } from '@/i18n';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  
  function switchLocale(newLocale: string) {
    // 替换路径中的 locale
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  }
  
  return (
    <select 
      value={locale} 
      onChange={(e) => switchLocale(e.target.value)}
    >
      {locales.map(l => (
        <option key={l} value={l}>
          {l === 'en' ? 'English' : l === 'zh' ? '中文' : '日本語'}
        </option>
      ))}
    </select>
  );
}
```

### 11.8 SEO 与 i18n

```tsx
// app/[locale]/layout.tsx
export async function generateMetadata({ 
  params 
}: { 
  params: { locale: string } 
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Index' });
  
  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      languages: {
        'en': '/en',
        'zh': '/zh',
        'ja': '/ja',
      },
    },
  };
}
```

```tsx
// app/[locale]/layout.tsx - 添加 hreflang
export default function Layout({ children, params }) {
  return (
    <html lang={params.locale}>
      <head>
        {locales.map(l => (
          <link 
            key={l} 
            rel="alternate" 
            hrefLang={l} 
            href={`https://example.com/${l}`} 
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 11.9 翻译文件组织

```
messages/
├── en.json
├── zh.json
├── ja.json
├── es.json
└── ...

# 大项目可拆分：
messages/
├── en/
│   ├── common.json
│   ├── product.json
│   ├── checkout.json
│   └── admin.json
├── zh/
│   └── ...
```

```ts
// i18n.ts
export default getRequestConfig(async ({ locale }) => {
  return {
    messages: {
      ...(await import(`./messages/${locale}/common.json`)).default,
      ...(await import(`./messages/${locale}/product.json`)).default,
    },
  };
});
```

### 11.10 i18n 最佳实践

1. **避免字符串拼接**：用 ICU MessageFormat
2. **使用命名空间**：避免 key 冲突
3. **提取与翻译协作**：用 Transifex、Crowdin 平台
4. **伪本地化测试**：用 `xx-Accent` 字符串测试
5. **考虑 RTL**：阿拉伯语、希伯来语
6. **图片本地化**：不同地区不同素材
7. **日期/货币格式化**：不要硬编码格式
8. **SEO 优化**：hreflang 标签
9. **缓存语言文件**：构建时或 CDN
10. **不要翻译技术字符串**：错误码、ID 等

---

## 第 12 章：部署方案

### 12.1 部署方式对比

| 部署方式 | 难度 | 性能 | 成本 | 适用场景 |
|---------|------|------|------|---------|
| **Vercel** | 最简单 | 最佳 | 免费层够用，中等 | 99% 项目首选 |
| **Netlify** | 简单 | 优秀 | 类似 Vercel | 静态站、JAMstack |
| **Cloudflare Pages** | 中 | 优秀 | 极低 | 全球边缘 |
| **AWS Amplify** | 中 | 优秀 | 中等 | AWS 生态 |
| **自托管 Node.js** | 高 | 取决于配置 | 服务器成本 | 完全控制 |
| **Docker + K8s** | 高 | 取决于基础设施 | 高 | 大规模 |
| **静态导出** | 最简单 | 极快 | 极低 | SSG 站、博客 |

### 12.2 Vercel 部署（推荐）

#### 12.2.1 一键部署

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 部署（首次会问问题）
vercel

# 4. 生产部署
vercel --prod
```

#### 12.2.2 通过 Git 集成

1. 推送代码到 GitHub/GitLab/Bitbucket
2. 登录 Vercel → New Project → 导入仓库
3. 配置构建设置：
   - Build Command: `next build`
   - Output Directory: `.next`（默认）
   - Install Command: `npm install`
4. 点击 Deploy

#### 12.2.3 环境变量

```bash
# CLI 方式
vercel env add DATABASE_URL production
vercel env add API_KEY production

# .env.local（不提交到 Git）
DATABASE_URL=postgres://...
NEXTAUTH_SECRET=...
```

#### 12.2.4 Vercel 配置（vercel.json）

```json
{
  "buildCommand": "next build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["sin1", "hnd1", "iad1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ],
  "redirects": [
    { "source": "/old", "destination": "/new", "permanent": true }
  ],
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" }
  ],
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 0 * * *" }
  ]
}
```

#### 12.2.5 Vercel 高级功能

```tsx
// 1. 边缘函数
export const runtime = 'edge';
export const preferredRegion = 'sin1';

export async function GET(request: Request) {
  return new Response('Hello from edge');
}

// 2. ISR 触发
// 在 Server Action 中调用
import { revalidatePath } from 'next/cache';
revalidatePath('/products');

// 3. 图像优化（自动启用）
<Image src="..." width={500} height={300} alt="..." />

// 4. 分析
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
```

#### 12.2.6 Vercel 限制（免费层）

| 项目 | Hobby | Pro |
|------|-------|-----|
| 部署 | 无限 | 无限 |
| 带宽 | 100 GB/月 | 1 TB/月 |
| 函数执行 | 100 GB-Hours | 1000 GB-Hours |
| 图像优化 | 1000 张 | 5000 张 |
| 边缘函数 | 500K 调用 | 5M 调用 |
| 构建时间 | 45 分钟 | 不限 |

### 12.3 自托管 Node.js

#### 12.3.1 基础部署

```bash
# 1. 构建
npm run build

# 2. 启动
npm run start
# 等同于 next start
# 默认端口 3000
```

#### 12.3.2 PM2 部署

```bash
# 1. 安装 PM2
npm i -g pm2

# 2. ecosystem.config.js
module.exports = {
  apps: [{
    name: 'next-app',
    script: 'npm',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '1G',
  }],
};

# 3. 启动
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 12.3.3 Nginx 反向代理

```nginx
# /etc/nginx/sites-available/nextjs
server {
  listen 80;
  server_name example.com;
  
  # HTTP 重定向到 HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com;
  
  ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  
  # SSL 配置
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  
  # 安全头
  add_header X-Frame-Options "DENY";
  add_header X-Content-Type-Options "nosniff";
  add_header Referrer-Policy "strict-origin-when-cross-origin";
  
  # 压缩
  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
  gzip_min_length 1000;
  
  # 静态资源（Next.js _next/static）
  location /_next/static/ {
    proxy_pass http://localhost:3000;
    expires 365d;
    access_log off;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
  
  # 图片优化
  location /_next/image/ {
    proxy_pass http://localhost:3000;
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
  }
  
  # 主应用
  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }
  
  # 健康检查
  location /api/health {
    proxy_pass http://localhost:3000;
  }
}
```

#### 12.3.4 systemd 服务

```ini
# /etc/systemd/system/nextjs.service
[Unit]
Description=Next.js Application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/nextjs
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable nextjs
sudo systemctl start nextjs
sudo systemctl status nextjs
```

### 12.4 Docker 部署

#### 12.4.1 多阶段构建 Dockerfile

```dockerfile
# Dockerfile
# 第一阶段：依赖
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 复制 package 文件
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# 第二阶段：构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建时环境变量
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# 第三阶段：运行
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### 12.4.2 next.config.js standalone 输出

```js
// next.config.js
module.exports = {
  output: 'standalone',  // 生成最小可运行文件
  experimental: {
    // ...
  },
};
```

#### 12.4.3 docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    depends_on:
      - db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=mydb
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

#### 12.4.4 构建和运行

```bash
# 构建镜像
docker build -t my-nextjs-app .

# 运行
docker run -p 3000:3000 my-nextjs-app

# docker-compose
docker-compose up -d

# 查看日志
docker logs -f my-nextjs-app
```

### 12.5 Kubernetes 部署

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nextjs-app
  labels:
    app: nextjs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nextjs
  template:
    metadata:
      labels:
        app: nextjs
    spec:
      containers:
      - name: nextjs
        image: myregistry/nextjs-app:v1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: NODE_ENV
          value: production
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: nextjs-service
spec:
  type: LoadBalancer
  selector:
    app: nextjs
  ports:
  - port: 80
    targetPort: 3000
```

### 12.6 静态导出（Static Export）

```js
// next.config.js
module.exports = {
  output: 'export',  // 静态导出
  images: {
    unoptimized: true,  // 静态导出需要
  },
  trailingSlash: true,
};
```

```bash
# 构建
npm run build

# 产物在 out/ 目录
# 部署到任何静态托管
# - Vercel（自动）
# - Netlify
# - Cloudflare Pages
# - S3 + CloudFront
# - GitHub Pages
# - Nginx（直接服务）
```

**限制**：
- 不能用 Server Actions
- 不能用 API Routes（动态）
- 不能用 `revalidate`（无服务器）
- 不能用 Middleware（部分）
- 不能用 Image 优化（需 unoptimized）

### 12.7 Cloudflare Pages

```toml
# wrangler.toml
name = "nextjs-app"
compatibility_date = "2026-01-01"
pages_build_output_dir = ".vercel/output/static"

[build]
command = "npx vercel build"
```

```bash
# 部署
npm install -g wrangler
wrangler pages deploy .vercel/output/static
```

**配置**：
- 兼容 Node.js API 通过 Polyfill
- Edge Runtime 优化
- 全球 CDN 自动启用
- 图像优化（Cloudflare Images）

### 12.8 部署检查清单

**构建优化**：
- [ ] `output: 'standalone'`（Docker）
- [ ] `.dockerignore` 完整
- [ ] 多阶段构建减小镜像
- [ ] 非 root 用户运行
- [ ] 健康检查端点

**性能**：
- [ ] CDN 静态资源
- [ ] 启用 Brotli 压缩
- [ ] 缓存头配置
- [ ] 图像优化
- [ ] 字体预加载

**安全**：
- [ ] HTTPS 强制
- [ ] 安全响应头
- [ ] 环境变量隔离
- [ ] 依赖漏洞扫描
- [ ] CORS 配置

**可观测**：
- [ ] 日志收集
- [ ] 错误监控（Sentry）
- [ ] 性能监控（Vercel Analytics）
- [ ] 业务指标埋点
- [ ] 告警配置

**扩展性**：
- [ ] 水平扩展
- [ ] 数据库连接池
- [ ] 缓存层（Redis）
- [ ] 队列处理（异步任务）
- [ ] CDN 容灾

### 12.9 零停机部署

```bash
# 1. 蓝绿部署
# 同时运行新旧两个版本
# 验证新版本后切换流量

# 2. 滚动更新（K8s 默认）
kubectl set image deployment/nextjs-app nextjs=myapp:v2

# 3. 健康检查 + 就绪探针
# 失败时自动回滚

# 4. 数据库迁移
# 步骤：
# a. 部署新代码（兼容旧 schema）
# b. 迁移数据库
# c. 部署新代码（使用新 schema）
# d. 清理旧 schema
```

### 12.10 部署监控示例

```ts
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // 检查数据库连接
    await db.$queryRaw`SELECT 1`;
    
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
      uptime: process.uptime(),
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Database connection failed' },
      { status: 503 }
    );
  }
}

// 详细健康检查
export async function HEAD() {
  // 仅检查进程存活（轻量）
  return new NextResponse(null, { status: 200 });
}
```

---

## 第 13 章：真实案例研究

### 13.1 案例一：Vercel 官网（nextjs.org）

**技术栈**：
- Next.js 14 App Router
- 100% Server Components
- MDX 文档
- 多语言（13 种）

**关键特性**：
- 静态生成所有文档页（build time）
- MDX 渲染（heavy component，server only）
- Algolia DocSearch
- 实时预览
- 全站 < 100KB JS（首屏）

**性能**：
- LCP < 1.0s
- TTI < 0.5s
- Lighthouse: 100/100/100/100

**踩坑**：
- 大量 MDX 组件在客户端水合问题 → 全 server side
- 搜索结果实时性 → 客户端 useSWR

### 13.2 案例二：Notion 官网

**特点**：
- 复杂的 marketing page
- 大量动画
- 多语言（20+）
- A/B 测试密集

**架构**：
- App Router + ISR
- 静态内容 + 动态表单
- 边缘中间件做 A/B 路由
- Cloudflare Images 加速

**性能优化**：
- 图片 CDN（Cloudflare）
- 字体子集化
- 关键 CSS 内联
- 资源预连接

### 13.3 案例三：TikTok 创作者后台

**技术栈**：
- Next.js 13 App Router
- 大型 SPA-like 仪表盘
- 复杂表单（视频上传、剪辑）
- 实时通知

**挑战**：
- 大量客户端交互（编辑器、图表）
- 视频上传（大文件）
- 多角色权限
- 实时数据

**解决方案**：
- Server Components 渲染数据层
- Client Components 处理交互
- 分块上传（tus-js-client）
- WebSocket 通知（SSE）
- 复杂的 RBAC 中间件

**性能**：
- 首屏 1.5s（东南亚网络）
- 通过 SSR + CDN 边缘
- 图片走独立 CDN

### 13.4 案例四：Shopify Hydrogen（电商）

**特点**：
- Headless 电商
- Storefront API
- 复杂的商品/购物车

**架构**：
- Next.js + RSC
- GraphQL（Apollo）
- 边缘缓存
- 多店铺路由

**关键决策**：
- 商品详情用 SSG（ISR 1 小时）
- 购物车用 SSR（实时）
- 搜索用客户端
- 结账流纯 CSR（敏感）

### 13.5 案例五：字节跳动 Lark 文档

**特点**：
- 复杂协同编辑
- 实时多人
- 性能要求极高

**架构**：
- Next.js + 自研 RSC
- WebSocket 协同
- CRDT（Yjs）
- WebAssembly 编辑器

**性能**：
- 首屏 < 1s
- 编辑响应 < 16ms
- 支持 100+ 协作者

### 13.6 案例六：跨境电商 SaaS（实战案例）

**项目背景**：
- TikTok Shop 多店铺管理
- 实时订单同步
- 选品分析
- 直播数据看板

**技术栈**：
```
- Next.js 15 (App Router) + React 19
- TypeScript（严格模式）
- Tailwind CSS + shadcn/ui
- Prisma + PostgreSQL
- Redis（缓存、队列）
- BullMQ（后台任务）
- NextAuth.js v5
- next-intl（多语言）
- Vercel（部署）
- Sentry（监控）
- PostHog（分析）
```

**目录结构**：
```
app/
├── (marketing)/
│   ├── page.tsx
│   ├── pricing/
│   └── features/
├── (dashboard)/
│   ├── dashboard/
│   │   ├── page.tsx              # 总览
│   │   ├── products/             # 商品管理
│   │   ├── orders/               # 订单管理
│   │   ├── analytics/            # 数据分析
│   │   ├── live/                 # 直播数据
│   │   ├── creators/             # 达人管理
│   │   └── settings/
│   ├── layout.tsx                # 需认证布局
│   └── loading.tsx
├── (auth)/
│   ├── login/
│   ├── register/
│   └── forgot/
├── [locale]/                     # i18n
│   └── (marketing)/
└── api/
    ├── auth/
    ├── webhooks/
    │   ├── tiktok/
    │   └── stripe/
    └── cron/
```

**核心模式**：
- Server Components 渲染列表
- Server Actions 处理表单
- React Query 处理客户端实时数据
- SSE 推送订单更新
- ISR 缓存店铺数据

**性能数据**：
- 首屏 LCP：1.2s
- API 平均响应：180ms
- 95% 请求 < 500ms
- 月活跃用户：50,000

### 13.7 案例对比总结

| 案例 | 行业 | 规模 | 关键技术 | 性能 |
|------|------|------|---------|------|
| nextjs.org | 文档 | 全网 | SSG + MDX | 100/100 |
| Notion | SaaS | 全球 | ISR + 边缘 | 95+/100 |
| TikTok | 创作者 | 亿级 | SSR + WS | 复杂 |
| Hydrogen | 电商 | 大 | SSG + GraphQL | 90+/100 |
| Lark | 办公 | 千万级 | RSC + WASM | 极致 |
| 跨境 SaaS | 电商 | 中 | 混合 | 90/100 |

---

## 第 14 章：踩坑指南（80+ 问题）

### 14.1 App Router 常见问题

#### 问题 1：'use client' 缺失导致错误

**症状**：报 "Functions cannot be passed directly to Client Components"。

**原因**：服务端组件传递函数 prop 给客户端组件。

**解决**：
```tsx
// ❌ 错误
<ClientComponent onClick={() => doSomething()} />

// ✅ 解决 1：把逻辑搬到客户端
'use client';
export function ClientComponent() {
  return <button onClick={() => doSomething()}>Click</button>;
}

// ✅ 解决 2：用 Server Action
<ClientComponent action={myServerAction} />
```

#### 问题 2：动态导入错误

**症状**：`ssr: false` 在 Server Component 中报"不能在服务端组件使用"。

**解决**：
```tsx
// ❌ 错误（Server Component 中）
const Modal = dynamic(() => import('./Modal'), { ssr: false });

// ✅ 解决：包一层 'use client'
// DynamicWrapper.tsx
'use client';
import dynamic from 'next/dynamic';
export const ClientOnlyModal = dynamic(() => import('./Modal'), { ssr: false });
```

#### 问题 3：静态生成失败

**症状**：`generateStaticParams` 抛错或超时。

**解决**：
```tsx
// 添加 dynamicParams
export const dynamicParams = true;  // 允许未预生成的动态路由
// 或
export const dynamicParams = false;  // 严格只生成已定义的

// 添加 revalidate
export const revalidate = 3600;
```

#### 问题 4：params 异步问题

**症状**：Next.js 15 中 `params.id` 是 undefined。

**解决**：
```tsx
// ❌ Next.js 14
export default function Page({ params }: { params: { id: string } }) {
  return <div>{params.id}</div>;
}

// ✅ Next.js 15
export default async function Page({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  return <div>{id}</div>;
}
```

#### 问题 5：Server Action 不执行

**症状**：表单提交后无反应。

**排查**：
1. 检查 `'use server'` 标记
2. 检查网络（DevTools → Network → 是否有 POST 请求）
3. 检查 Origin（开发环境允许）
4. 检查函数签名（必须 async）

### 14.2 数据获取问题

#### 问题 6：缓存不更新

**症状**：改了数据，页面还是旧的。

**解决**：
```tsx
'use server';
// 1. 用 revalidate
import { revalidatePath, revalidateTag } from 'next/cache';
revalidatePath('/products');
revalidateTag('products');

// 2. 显式 no-store
const res = await fetch(url, { cache: 'no-store' });
```

#### 问题 7：fetch 报错不抛错

**症状**：404 响应的 fetch 不抛错，代码继续。

**原因**：默认 4xx/5xx 不抛错。

**解决**：
```ts
const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Failed: ${res.status}`);
}
```

#### 问题 8：cookies() / headers() 报错

**症状**：必须在 Server Component 或 Route Handler 中调用。

**解决**：
```tsx
// ❌ 在 Client Component 用
'use client';
import { cookies } from 'next/headers';  // 报错

// ✅ 通过 Server Action 或服务端组件传递
```

#### 问题 9：环境变量在客户端 undefined

**症状**：`process.env.NEXT_PUBLIC_*` 在客户端 undefined。

**原因**：必须 `NEXT_PUBLIC_` 前缀才会暴露给客户端。

**解决**：
```env
# .env.local
NEXT_PUBLIC_API_URL=https://api.example.com  # 客户端可见
SECRET_KEY=xxx  # 仅服务端
```

### 14.3 样式问题

#### 问题 10：Tailwind 类不生效

**排查清单**：
- [ ] `tailwind.config.js` 的 `content` 包含所有文件
- [ ] `globals.css` 引入 `@tailwind` 指令
- [ ] 没有动态拼接类名（`bg-${color}-500` 不生效）
- [ ] 没有被 `purge` 误删

```js
// tailwind.config.js
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  // 避免动态类名删除：
  safelist: ['bg-red-500', 'bg-blue-500'],
};
```

#### 问题 11：CSS Modules 类名冲突

**解决**：
```tsx
// styles.module.css
.button { }

// page.tsx
import styles from './styles.module.css';
<button className={styles.button}>...</button>
```

#### 问题 12：FOUC（无样式闪烁）

**原因**：CSS 加载慢。

**解决**：
- 使用 `app/layout.tsx` 全局 CSS
- 关键 CSS 内联
- 字体 `display: 'swap'`
- Tailwind 启用 JIT

### 14.4 性能问题

#### 问题 13：首屏 LCP 慢

**排查**：
1. 检查最大元素（图片？文字？）
2. Network 看加载顺序
3. Performance 看关键路径

**解决**：
```tsx
// 1. 首屏图 priority
<Image src="/hero.jpg" priority />

// 2. 字体预加载
<link rel="preload" href="/font.woff2" as="font" />

// 3. 关键 CSS 内联
// next.config.js
experimental: {
  optimizeCss: true,
}
```

#### 问题 14：JS 体积过大

**解决**：
```bash
# 1. 分析
ANALYZE=true npm run build

# 2. 动态导入
const HeavyComponent = dynamic(() => import('./Heavy'));

# 3. 选择性导入
import Button from 'antd/es/button';  // 不 import 'antd'

# 4. Tree shaking
# package.json
{
  "sideEffects": false
}
```

#### 问题 15：hydration mismatch

**症状**：控制台报 "Hydration failed"。

**原因**：服务端和客户端渲染结果不同。

**常见原因**：
```tsx
// 1. Date.now() / Math.random()
const id = Date.now();  // ❌ 服务端/客户端不同

// 2. window 对象
const width = window.innerWidth;  // ❌ 服务端无 window

// 3. 浏览器 API
localStorage.getItem('key');  // ❌ 服务端无 localStorage

// 4. 时区/语言
new Date().toLocaleString();  // ❌ 服务端/客户端时区可能不同
```

**解决**：
```tsx
// 用 useEffect 客户端挂载后再设置
const [width, setWidth] = useState(0);
useEffect(() => setWidth(window.innerWidth), []);

// 用 suppressHydrationWarning
<div suppressHydrationWarning>{Date.now()}</div>
```

### 14.5 部署问题

#### 问题 16：Vercel 部署失败

**排查清单**：
- [ ] Node.js 版本（package.json engines）
- [ ] 环境变量配置
- [ ] 构建命令输出
- [ ] 依赖大小（Vercel 限制 250MB 未压缩）
- [ ] 输出目录正确

**常用命令**：
```bash
# 本地模拟 Vercel 环境
npx vercel env pull .env.local
npm run build
```

#### 问题 17：Docker 镜像过大

**解决**：
- 多阶段构建
- 基础镜像用 alpine
- `.dockerignore` 完整
- 用 `output: 'standalone'`

```dockerfile
# 优化前：1.5GB
FROM node:20

# 优化后：150MB
FROM node:20-alpine
```

#### 问题 18：Serverless 冷启动慢

**原因**：函数长时间不调用后第一次启动慢。

**解决**：
- 配置 provisioned concurrency
- 减少依赖
- 边缘运行时
- 预热

### 14.6 路由问题

#### 问题 19：动态路由不匹配

**症状**：`/posts/abc` 报 404。

**排查**：
```
app/
└── posts/
    ├── [slug]/
    │   └── page.tsx    ← 文件名正确吗？
    └── page.tsx
```

#### 问题 20：Parallel Routes 不渲染

**症状**：插槽内容不显示。

**检查**：
- `default.tsx` 是否存在（必需）
- 父 layout 是否接收并渲染插槽

```tsx
// app/layout.tsx - 必须有 children 和 modal
export default function Layout({ children, modal }: { 
  children: React.ReactNode; 
  modal: React.ReactNode; 
}) {
  return <>{children}{modal}</>;
}
```

#### 问题 21：拦截路由失效

**症状**：直接打开完整页面，没有模态。

**原因**：拦截路由需要 `default.tsx` 配合 Parallel Routes。

```
app/
├── photos/
│   └── [id]/page.tsx           # 完整页
├── @modal/
│   ├── default.tsx             # 必需
│   └── (.)photos/
│       └── [id]/page.tsx       # 拦截
```

### 14.7 中间件问题

#### 问题 22：中间件不执行

**排查**：
- `matcher` 配置是否正确
- 文件位置（必须在项目根或 `src/`）
- 导出名必须 `middleware`

```ts
// ✅ 正确
export function middleware(request: NextRequest) { }

// ❌ 错误
export default function middleware() { }
```

#### 问题 23：中间件打包超 1MB

**解决**：
- 减少依赖（仅用 Web API）
- 不导入整个库
- 拆分 middleware

```ts
// ❌ 引入整个 lodash
import _ from 'lodash';

// ✅ 用原生方法或单独函数
function get(obj, path) { /* ... */ }
```

### 14.8 其他问题（持续补充）

| 编号 | 问题 | 解决 |
|------|------|------|
| 24 | Server Action 找不到 | 重新加载页面（开发热重载） |
| 25 | 'use server' 文件不能 export 非 async 函数 | 拆文件 |
| 26 | useFormState 已废弃 | 改用 useActionState |
| 27 | 路由缓存不更新 | router.refresh() |
| 28 | Link 不预取 | 检查 prefetch prop |
| 29 | Image 远程域名报错 | 配置 remotePatterns |
| 30 | next/image 警告 fill 模式缺 sizes | 添加 sizes prop |
| 31 | Static Export 失败 | 检查是否有动态 API |
| 32 | 国际化路由 404 | middleware 配置正确 |
| 33 | generateMetadata 报错 | 不能在 try/catch 外抛错 |
| 34 | 客户端组件无法 await | 改用 useEffect 或 SWR |
| 35 | cookies().set 在 Server Component 报错 | 改用 Server Action |

---

## 第 15 章：大厂实践

### 15.1 Vercel 官方最佳实践

**核心团队发表的工程实践**：

#### 15.1.1 组件分层策略

```tsx
// 原则：服务端组件包含所有"数据"和"布局"
// 客户端组件仅"叶子节点"（按钮、输入框、动画）

// ❌ 反模式：客户端组件中加载数据
'use client';
function ProductPage() {
  const [products, setProducts] = useState([]);
  useEffect(() => { fetch(...).then(setProducts) }, []);
  return <div>{products.map(...)}</div>;
}

// ✅ 正模式：服务端组件加载，客户端组件交互
// page.tsx (Server)
async function ProductPage() {
  const products = await db.product.findMany();
  return <ProductList products={products} />;
}

// ProductList.tsx (Server)
function ProductList({ products }) {
  return products.map(p => <ProductCard key={p.id} product={p} />);
}

// ProductCard.tsx (Client)
'use client';
function ProductCard({ product }) {
  const [favorited, setFavorited] = useState(false);
  return (
    <div>
      <h3>{product.name}</h3>
      <button onClick={() => setFavorited(!favorited)}>
        {favorited ? '♥' : '♡'}
      </button>
    </div>
  );
}
```

#### 15.1.2 数据获取模式

```tsx
// 1. 树形数据（依赖关系）
// 用户 → 订单 → 商品 → 库存
// 用 Promise.all 并行无依赖项
// 串行只在有依赖时

// 2. Suspense 模式
// 关键路径 → 不包裹
// 慢数据 → 包裹 Suspense
// 完全独立 → 多个 Suspense

// 3. cache() 函数
import { cache } from 'react';

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session) return null;
  return await db.user.findUnique({ where: { id: session.user.id } });
});

// 同一请求中多次调用 → 只执行一次
const user = await getCurrentUser();  // 第一次：DB 查询
const user2 = await getCurrentUser(); // 第二次：返回缓存
```

#### 15.1.3 性能预算

```
- LCP < 2.5s
- TBT < 200ms  
- CLS < 0.1
- 客户端 JS < 100KB (gzip)
- 首屏 HTML < 50KB (gzip)
- 图片 < 200KB (首屏)
```

### 15.2 字节跳动内部实践

**抖音 / TikTok 创作者生态**：

```tsx
// 1. 巨型应用拆分为多个 Next.js 应用
// 边界：用户群体 + 业务域

// monorepo 结构
apps/
├── creator-web/         # 创作者后台
├── seller-web/          # 商家后台
├── affiliate-web/       # 达人后台
└── marketing-web/       # 营销站
packages/
├── ui/                  # 共享组件
├── api-client/          # API SDK
├── i18n/                # 多语言
└── utils/
```

**关键技术决策**：

| 决策 | 选择 | 原因 |
|------|------|------|
| 框架 | Next.js 14 | 团队熟悉度高、SSR 稳定 |
| 状态管理 | Zustand + URL state | 轻量、SSR 友好 |
| 数据获取 | SWR + RSC 双轨 | 服务端首屏 + 客户端实时 |
| UI 库 | 自研 + Radix UI | 定制化强 |
| 部署 | 自建 K8s | 内部基础设施 |
| 监控 | 自研 + Sentry | 国产化 |
| 测试 | Jest + Playwright | 成熟方案 |

**踩过的坑**：
- RSC 与 Ant Design 不兼容 → 改用自研 UI
- 大量客户端组件 → 重新切分边界
- 中间件 1MB 限制 → 拆分
- 边缘冷启动 → 加预热

### 15.3 Shopify Hydrogen 架构

**Headless 电商**：

```tsx
// 1. Storefront API 集成
import { StorefrontClient } from '@shopify/hydrogen-react';

const client = new StorefrontClient({
  storeDomain: 'myshop.myshopify.com',
  publicStorefrontToken: process.env.SHOPIFY_TOKEN!,
});

// 2. 商品详情（SSG + ISR）
export async function generateStaticParams() {
  const { products } = await client.query(PRODUCTS_QUERY, { first: 100 });
  return products.map(p => ({ handle: p.handle }));
}

export async function generateMetadata({ params }) {
  const { product } = await client.query(PRODUCT_QUERY, { 
    handle: params.handle 
  });
  return {
    title: product.title,
    description: product.description,
  };
}

// 3. 购物车（SSR + Action）
'use server';
export async function addToCart(lines: CartLineInput[]) {
  const cart = await cartCreate({ lines });
  cookies().set('cartId', cart.id);
  return cart;
}
```

**关键经验**：
- 商品页用 SSG（99% 静态）
- 购物车用 SSR（实时）
- 结账用纯 CSR（敏感）
- 多店铺路由 + middleware

### 15.4 Vercel 内部案例（nextjs.org）

**文档站架构**：

```ts
// 1. MDX 渲染（Server Component）
import { MDXRemote } from 'next-mdx-remote/rsc';

export default async function DocPage({ params }) {
  const source = await getDoc(params.slug);
  return (
    <article>
      <MDXRemote source={source} components={mdxComponents} />
    </article>
  );
}

// 2. 重型组件在服务端渲染
const mdxComponents = {
  // CodeBlock 永远在服务端渲染（避免 prism.js 在客户端）
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  
  // 交互式组件（客户端）
  Tabs: TabsClient,  // 'use client' 组件
  Copy: CopyClient,
};

// 3. 静态生成所有文档
export const dynamic = 'force-static';
export const revalidate = 3600;
```

**性能优化**：
- 全站 JS < 50KB
- LCP < 1.0s
- 全文搜索 Algolia（客户端）
- 反馈按钮 Sentry + 自研

### 15.5 Notion 官网实践

**Marketing site 架构**：

```tsx
// 1. 多语言 + A/B 测试
// middleware.ts 处理两件事
// - locale 路由
// - A/B bucket 分配

// 2. 内容 + 表单分离
// 内容用 ISR
// 表单用 Server Action

// 3. 性能
// - 关键 CSS 内联
// - 图片懒加载（next/image）
// - 字体子集化
// - 资源预连接
```

**决策**：
- 用 `output: 'export'` 部分路由（无需动态）
- 复杂交互用客户端
- SEO 关键内容用 SSG

### 15.6 Linear 工程实践

**项目管理 SaaS**：

```tsx
// 1. 极简主义
// - 状态管理：URL state + Server Actions
// - 不引入全局 store
// - 不引入 React Query（用 RSC + revalidate）

// 2. 实时协作
// - Yjs CRDT
// - WebSocket
// - 乐观更新

// 3. 性能极致
// - LCP < 500ms
// - 几乎零加载状态
// - 路由切换 < 100ms
```

### 15.7 Vercel 边缘网络经验

**全球部署**：

```ts
// 1. 选择区域
export const preferredRegion = 'sin1';  // 新加坡

// 2. 边缘 KV（Edge Config）
import { get } from '@vercel/edge-config';

const config = await get('feature-flags');

// 3. 边缘函数（更快但限制多）
export const runtime = 'edge';
export const preferredRegion = ['hnd1', 'sin1', 'iad1'];
```

**冷启动优化**：
- 减少依赖
- 预编译正则
- 复用连接
- 配置 Provisioned Concurrency

### 15.8 跨境电商场景实践

#### 15.8.1 多站点架构

```
主域：example.com
  ├── /us → 美国站（默认 English、USD）
  ├── /eu → 欧洲站（多语言、EUR）
  ├── /sg → 东南亚站（English、SGD）
  └── /cn → 中国站（中文、CNY）

技术栈：
- Next.js 15 + i18n
- Vercel 多区域（sin1、hnd1、fra1、iad1）
- CDN：Cloudflare
- 数据库：PostgreSQL 多区域
- 支付：Stripe + 本地支付
```

#### 15.8.2 性能优化（跨境场景）

**挑战**：
- 跨地区网络延迟
- 不同网络环境（4G、5G、WiFi）
- 不同设备性能

**优化措施**：
- 边缘缓存（Vercel/Cloudflare）
- 静态资源 CDN
- 图片压缩（WebP/AVIF）
- 字体子集化
- 关键路径优先
- 减少 RTT（HTTP/3、preconnect）

```ts
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['antd', 'lodash'],
  },
  // HTTP/3
  httpAgentOptions: {
    keepAlive: true,
  },
  // 图片优化
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,  // 30 天
  },
};
```

#### 15.8.3 合规与安全

- GDPR（欧洲）
- CCPA（加州）
- PIPL（中国）
- 数据本地化
- Cookie 同意管理

```tsx
// app/layout.tsx
import { CookieConsent } from '@/components/CookieConsent';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
```

### 15.9 字节跳动 TikTok Shop 实践（综合）

**选品分析系统**：

```tsx
// 1. 实时数据流
// - WebSocket 订单推送
// - SSE 商品热度
// - 定时同步（每 5 分钟）

// 2. 数据可视化
// - Recharts / ECharts
// - 大数据量虚拟滚动
// - 客户端渲染（避免 SSR 过重）

// 3. AI 选品
// - OpenAI / Claude 集成
// - 流式输出（Streaming）
// - RSC + Suspense

// 4. 多店铺管理
// - 切换店铺 → 重新获取数据
// - URL state 持久化
// - 缓存按店铺 key
```

### 15.10 实战工程经验

#### 经验 1：渐进式升级

```
阶段 1：Pages Router（已有项目）
   ↓ 渐进迁移
阶段 2：App Router（部分路由）
   ↓ 共存
阶段 3：全面 App Router
   ↓ 优化
阶段 4：RSC + Server Actions（性能优化）
```

#### 经验 2：团队协作

- **前端规范**：组件命名、目录结构、TypeScript 严格
- **代码审查**：性能、安全、可维护性
- **CI/CD**：自动 lint、test、build
- **文档**：Storybook、ADR（架构决策记录）

#### 经验 3：监控体系

```ts
// 1. 错误监控
import * as Sentry from '@sentry/nextjs';
Sentry.init({ dsn: process.env.SENTRY_DSN });

// 2. 性能监控
import { Analytics } from '@vercel/analytics/react';

// 3. 业务监控
// 自研埋点 → ClickHouse / BigQuery
// 关键路径打点
```

#### 经验 4：性能预算

```
- 客户端 JS：< 200KB（gzip）
- 首屏 HTML：< 100KB
- LCP：< 2.5s
- TTI：< 3.5s
- API 响应：< 500ms（95%）
```

#### 经验 5：渐进式增强

```tsx
// 即使 JS 加载失败也能用
<form action={serverAction}>
  <input name="email" />
  <button type="submit">订阅</button>
</form>

// 然后增强体验
<form action={serverAction} className="ajax-form">
  <input name="email" />
  <SubmitButton />  {/* 客户端增强：loading、success 状态 */}
</form>
```

---

## 第 16 章：核心洞察与设计哲学

### 16.1 核心思想

#### 16.1.1 服务端优先

**传统 React 思维**："一切从 React 组件开始"
**Next.js 思维**："一切从 Server Component 开始"

```
传统 SPA：
  浏览器下载 JS → React 启动 → 发起 API → 渲染数据
  首屏：1-3 秒

Next.js RSC：
  服务端渲染完整页面 → 浏览器接收 HTML + RSC Payload
  首屏：100-500ms
```

**RSC 重新定义了边界**：
- 数据获取在服务端（更近、更安全、更快）
- 交互在客户端（按需）
- 中间是 RSC Payload（轻量、增量）

#### 16.1.2 渐进式增强

```
1. 先确保基础功能（HTML + 表单）
2. 再加 CSS 美化
3. 再加 JS 增强交互
4. 最后加 PWA、离线、动画

不要反过来！
```

#### 16.1.3 流优先（Streaming First）

```
传统：渲染完成 → 一次性发送
流式：边渲染边发送 → 浏览器边收边渲染

优势：
- TTFB 几乎为 0
- 用户感知速度提升
- 网络利用率更高
```

#### 16.1.4 约束驱动设计

```
'use client' 强制你思考：什么必须客户端？
这导致：
- 减少不必要的客户端代码
- 减少 hydration 开销
- 减少 JS 体积
- 提高性能（被动效果）
```

### 16.2 设计哲学

#### 16.2.1 约定优于配置

```
文件名 = 路由
layout.tsx = 布局
loading.tsx = 加载态
error.tsx = 错误边界
[id] = 动态段
[...slug] = catch-all
[[...slug]] = optional catch-all
```

#### 16.2.2 渐进式采用

```ts
// 阶段 1：静态页面（getStaticProps）
// 阶段 2：服务端渲染（getServerSideProps）
// 阶段 3：增量静态（ISR）
// 阶段 4：App Router（混用）
// 阶段 5：RSC + Server Actions
// 阶段 6：PPR + Edge
```

#### 16.2.3 跨边界一致性

```
客户端：
- TypeScript 类型
- 组件复用
- 工具函数

服务端：
- 同上

RSC：
- 共享数据层
- 共享类型
- 共享业务逻辑
```

#### 16.2.4 用户体验优先

```
1. 加载快（首屏）
2. 交互快（响应）
3. 不出错（可靠性）
4. 离线可用（PWA）
5. 可访问（a11y）
6. SEO 友好
```

### 16.3 关键权衡

#### 16.3.1 Server vs Client 组件

| 维度 | Server | Client |
|------|--------|--------|
| 数据 | 直接 DB | useEffect/SWR |
| 状态 | 无 | useState/useReducer |
| 事件 | 无 | onClick 等 |
| 包大小 | 不计 | 计 |
| 缓存 | 内置 | 自管理 |

**原则**：
- 默认 Server
- 必须时 Client
- 边界明确

#### 16.3.2 缓存 vs 实时

| 缓存策略 | 适用 |
|---------|------|
| 不缓存（SSR） | 仪表盘、用户特定 |
| 短缓存（10s-1min） | 价格、库存 |
| 中等缓存（1h-1d） | 商品列表、博客 |
| 长缓存（永久） | 营销页、文档 |
| Tag 失效 | 写后立即更新 |

#### 16.3.3 静态 vs 动态

| 维度 | 静态 | 动态 |
|------|------|------|
| 速度 | 极快 | 取决于数据 |
| 个性化 | 不支持 | 支持 |
| SEO | 优秀 | 取决于实现 |
| 复杂度 | 低 | 中 |

**PPR 是答案**：
- 静态部分快
- 动态部分实时
- 同一页面兼具

#### 16.3.4 性能 vs DX

| 极致性能 | 优秀 DX |
|---------|---------|
| 手写 fetch | 自动 fetch |
| 手写缓存 | 自动缓存 |
| 手动 ISR | 自动 revalidate |
| 手写 Suspense | loading.tsx 自动 |

**Next.js 选择 DX**：
- 让 80% 的场景零配置
- 让 20% 的场景可定制

### 16.4 常见误区

#### 误区 1：所有数据都走客户端

**错误**：
```tsx
'use client';
function Page() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/data').then(r => r.json()).then(setData);
  }, []);
  // ...
}
```

**正确**：
```tsx
// 服务端获取
async function Page() {
  const data = await getData();
  return <Display data={data} />;
}
```

#### 误区 2：Server Action 替代所有 API

**适用**：
- 表单提交
- 简单 CRUD
- 写操作

**不适用**：
- 公开 API（给第三方）
- 流式响应（SSE）
- Webhook（无 form）

#### 误区 3：缓存是银弹

**坑**：
- 缓存陈旧数据
- 缓存击穿、雪崩
- 缓存预热

**正确**：
- 显式声明
- 配套失效机制
- 监控命中率

#### 误区 4：RSC 是性能优化

**正确理解**：
- RSC 是架构变化（不只是性能）
- 改变了数据流
- 改变了组件设计
- 改变了部署方式

#### 误区 5：Next.js = Vercel

**正确**：
- Next.js 是框架
- Vercel 是平台
- 可以自托管（Node.js、Docker、K8s）
- 平台无锁定（除部分功能）

### 16.5 未来趋势

#### 趋势 1：RSC 成熟

- 更多框架支持（Remix、Nuxt 实验中）
- 工具链完善
- 性能进一步提升
- Server Components 成 React 主流

#### 趋势 2：边缘优先

- 边缘运行时
- 全球低延迟
- 数据就近
- 减少中心化

#### 趋势 3：流式 UI

- LLM 流式输出
- 实时协作
- 渐进式渲染
- Suspense 普及

#### 趋势 4：AI 集成

- Server Actions 调用 LLM
- 客户端 AI（WebGPU）
- 个性化推理
- AI 辅助开发

#### 趋势 5：性能极致

- 编译时优化
- 部分预渲染（PPR）
- 增量更新
- 协议升级（HTTP/3、QUIC）

### 16.6 与同类框架对比

| 框架 | 语言 | 渲染 | 路由 | 数据 | 优势 |
|------|------|------|------|------|------|
| **Next.js** | JS/TS | RSC | App/Pages | Server Actions | 生态最大 |
| **Remix** | JS/TS | SSR + Loader | 嵌套 | Loader/Action | Web 标准 |
| **Nuxt** | Vue | RSC 类似 | 文件 | useFetch | Vue 生态 |
| **SvelteKit** | Svelte | SSR | 文件 | load | 极简 |
| **Astro** | 多框架 | MPA | 文件 | 数据层 | 内容站 |
| **SolidStart** | Solid | RSC 类似 | 文件 | Resource | 性能极致 |

**选择建议**：
- 团队熟悉 React → Next.js
- 喜欢 Web 标准 → Remix
- Vue 技术栈 → Nuxt
- 性能敏感 + 极简 → SvelteKit
- 内容站 → Astro
- 极致性能 → SolidStart

### 16.7 何时不要用 Next.js

| 场景 | 替代方案 | 原因 |
|------|---------|------|
| 简单静态博客 | Astro / Hugo | Next.js 太重 |
| Electron 应用 | Vite + React | 不需要 SSR |
| 纯客户端工具 | Vite + React | 无服务端需求 |
| React Native 移动 | React Native + Expo | 平台不同 |
| 极致 SEO SPA | Next.js 即可 | 适用 |
| 服务端纯 API | Hono / H3 | 不需要 React |

### 16.8 关键认知

#### 认知 1：Next.js 是工具，不是银弹

```
它能解决：
- 首屏慢
- SEO 差
- 全栈一体
- 性能优化

它不能解决：
- 产品定位
- 业务逻辑
- 团队能力
- 市场需求
```

#### 认知 2：架构比框架重要

```
坏的架构 + 好框架 = 失败的产品
好的架构 + 任何框架 = 成功的产品
```

#### 认知 3：持续学习

```
- 关注 React 19、Server Components
- 关注 Vercel、Next.js 官方
- 关注社区（r/nextjs、Twitter）
- 实操项目
- 总结输出
```

#### 认知 4：与生态共成长

```
- shadcn/ui（UI）
- Prisma（ORM）
- NextAuth（认证）
- Tailwind（样式）
- Vercel（部署）
- Sentry（监控）
- Linear（管理）
```

---

## 第 17 章：跨项目引用与生态整合

### 17.1 相关前端框架对比

#### 17.1.1 Next.js vs Remix

```
Next.js 优势：
- 生态最大（组件库、教程、案例）
- Vercel 一等支持
- RSC 早期实验者
- App Router 强大
- Server Actions

Remix 优势：
- 强调 Web Standards
- 嵌套路由更优雅
- Loader/Action 模型清晰
- 不锁定部署平台
- 表单渐进增强
- 错误边界更精细

选择建议：
- 团队大、需要生态 → Next.js
- 喜欢 Web Standards → Remix
- 简单项目 → Remix
- 复杂 dashboard → Next.js
```

#### 17.1.2 Next.js vs Nuxt

```
Nuxt：
- Vue 生态
- 类似 API
- 中文社区强
- 国内接受度高

Next.js：
- React 生态
- 国际化更好
- 海外项目首选
- 工具链更丰富
```

#### 17.1.3 Next.js vs SvelteKit

```
SvelteKit：
- 编译时优化（更快）
- 体积更小
- 学习曲线低
- 生态较小

Next.js：
- 运行时灵活
- React 生态丰富
- 团队好招
- 工具齐全
```

#### 17.1.4 Next.js vs Astro

```
Astro：
- 内容站首选
- 群岛架构（按需水合）
- 多框架支持
- 极致性能

Next.js：
- 复杂应用
- 强交互
- 大量客户端逻辑
- 生态丰富
```

### 17.2 关键配套库

#### 17.2.1 UI 组件库

| 库 | 特点 | 适合 |
|-----|------|------|
| **shadcn/ui** | 复制源码、可定制 | 现代项目首选 |
| **Ant Design** | 完整、企业级 | 后台系统 |
| **Material UI** | Google 规范 | 通用 |
| **Chakra UI** | 简单、accessible | 中小项目 |
| **Mantine** | 全面、TypeScript | 复杂应用 |
| **Radix UI** | 无样式、accessible | 高度定制 |
| **HeroUI / NextUI** | 漂亮、现代 | 营销站 |
| **Tremor** | 仪表盘 | 数据可视化 |

**shadcn/ui 集成**：

```bash
# 1. 初始化
npx shadcn-ui@latest init

# 2. 添加组件
npx shadcn-ui@latest add button card dialog form

# 3. 使用
import { Button } from '@/components/ui/button';

export function MyForm() {
  return <Button variant="outline">点击</Button>;
}
```

#### 17.2.2 表单库

```tsx
// 1. React Hook Form（推荐）
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email')} />
      {errors.email && <p>{errors.email.message}</p>}
      {/* ... */}
    </form>
  );
}

// 2. Conform（Server Action 友好）
import { useForm } from '@conform-to/react';
import { parseWithZod } from '@conform-to/zod';

export function SignupForm() {
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate: ({ formData }) => parseWithZod(formData, { schema }),
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
  });
  
  return (
    <form id={form.id} onSubmit={form.onSubmit} action={action} noValidate>
      <input name="email" />
      {fields.email.errors && <p>{fields.email.errors[0]}</p>}
    </form>
  );
}
```

#### 17.2.3 ORM 与数据库

```ts
// Prisma（最流行）
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  where: { active: true },
  include: { posts: true },
});

// Drizzle（更轻量、SQL 风格）
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { users } from './schema';

const db = drizzle(connection);
const result = await db.select().from(users).where(eq(users.active, true));
```

#### 17.2.4 状态管理

```tsx
// 1. Zustand（推荐）
import { create } from 'zustand';

const useStore = create((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}));

// 2. URL State（首选）
import { useSearchParams } from 'next/navigation';

// 3. React Context（少量）
```

#### 17.2.5 认证

```ts
// NextAuth.js v5（推荐）
// Auth.js
// Clerk（托管）
// Supabase Auth
// 自建 JWT
```

#### 17.2.6 样式

```
- Tailwind CSS（主流）
- CSS Modules
- styled-components（不推荐，RSC 不友好）
- vanilla-extract
- Panda CSS
- Stitches（已不维护）
```

#### 17.2.7 数据可视化

```tsx
// 1. Recharts（简单）
import { LineChart, Line, XAxis, YAxis } from 'recharts';

// 2. ECharts（功能强）
import ReactECharts from 'echarts-for-react';

// 3. Tremor（Dashboard 专用）
import { Card, Metric, Text, AreaChart } from '@tremor/react';

// 4. visx（D3 风格）
import { XYChart, AreaSeries, Axis } from '@visx/xychart';
```

#### 17.2.8 测试

```ts
// 1. Vitest（推荐，速度快）
import { describe, it, expect } from 'vitest';

describe('MyComponent', () => {
  it('should work', () => {
    expect(1 + 1).toBe(2);
  });
});

// 2. Playwright（E2E）
import { test, expect } from '@playwright/test';

test('homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading')).toBeVisible();
});

// 3. React Testing Library
import { render, screen } from '@testing-library/react';
```

### 17.3 与后端 API 整合

#### 17.3.1 tRPC（端到端类型安全）

```ts
// server/trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

// server/routers/user.ts
export const userRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return await db.user.findUnique({ where: { id: input.id } });
    }),
  create: publicProcedure
    .input(z.object({ name: z.string(), email: z.string().email() }))
    .mutation(async ({ input }) => {
      return await db.user.create({ data: input });
    }),
});

// app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => ({}),
  });

export { handler as GET, handler as POST };

// 客户端使用（完全类型安全）
// app/providers.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';

export const api = createTRPCReact<AppRouter>();

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [httpBatchLink({ url: '/api/trpc' })],
      transformer: superjson,
    })
  );
  
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </api.Provider>
  );
}

// 组件中使用
'use client';
import { api } from '@/lib/trpc';

export function UserProfile({ id }: { id: string }) {
  const { data, isLoading } = api.user.getById.useQuery({ id });
  const create = api.user.create.useMutation();
  
  if (isLoading) return <div>Loading...</div>;
  return <div>{data?.name}</div>;
}
```

#### 17.3.2 GraphQL（Apollo / urql）

```ts
// Apollo Client
import { ApolloClient, InMemoryCache, ApolloProvider, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'https://api.example.com/graphql',
  cache: new InMemoryCache(),
});

const GET_USERS = gql`
  query GetUsers {
    users {
      id
      name
      email
    }
  }
`;

function Users() {
  const { loading, error, data } = useQuery(GET_USERS);
  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;
  return data.users.map(({ id, name }) => <div key={id}>{name}</div>);
}
```

#### 17.3.3 REST / OpenAPI

```ts
// openapi-typescript 自动生成类型
import { OpenAPIV3 } from 'openapi-types';

const response = await fetch('/api/users');
const data: Components.Schemas.User[] = await response.json();
```

### 17.4 与 AI 集成

#### 17.4.1 OpenAI / Anthropic SDK

```ts
// app/api/chat/route.ts
import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages,
  });
  
  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}
```

#### 17.4.2 Vercel AI SDK

```tsx
'use client';
import { useChat } from 'ai/react';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  });
  
  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.role}: {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">发送</button>
      </form>
    </div>
  );
}
```

#### 17.4.3 流式 AI 响应

```tsx
// app/chat/page.tsx
import { Suspense } from 'react';

async function AIResponse({ prompt }: { prompt: string }) {
  const stream = await streamLLM(prompt);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  
  return <div>{result}</div>;
}

export default function ChatPage({ searchParams }) {
  return (
    <Suspense fallback={<div>AI 正在思考...</div>}>
      <AIResponse prompt={searchParams.q} />
    </Suspense>
  );
}
```

### 17.5 与数据库配合

#### 17.5.1 Prisma + Next.js

```ts
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

```ts
// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

```ts
// lib/data.ts
import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

export const getUser = unstable_cache(
  async (id: string) => {
    return await prisma.user.findUnique({
      where: { id },
      include: { posts: { take: 5 } },
    });
  },
  ['user'],
  { tags: ['users'], revalidate: 3600 }
);
```

#### 17.5.2 Drizzle + Next.js

```ts
// db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

```ts
// db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

### 17.6 监控与可观测性

#### 17.6.1 Sentry

```ts
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});
```

```tsx
// app/error.tsx
'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  
  return (
    <div>
      <h2>出错了</h2>
      <button onClick={reset}>重试</button>
    </div>
  );
}
```

#### 17.6.2 Vercel Analytics

```tsx
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
```

#### 17.6.3 PostHog（产品分析）

```tsx
// app/providers.tsx
'use client';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';

export function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    });
  }, []);
  
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}

// 使用
posthog.capture('button_clicked', { button: 'signup' });
```

#### 17.6.4 自研埋点

```ts
// lib/analytics.ts
export const track = (event: string, properties?: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  
  // Google Analytics
  (window as any).gtag?.('event', event, properties);
  
  // PostHog
  posthog.capture(event, properties);
  
  // 自研埋点
  fetch('/api/track', {
    method: 'POST',
    body: JSON.stringify({ event, properties, timestamp: Date.now() }),
  }).catch(() => {});
};

// 业务使用
'use client';
import { track } from '@/lib/analytics';

export function BuyButton() {
  return (
    <button onClick={() => {
      track('buy_click', { productId: '123' });
      // ...
    }}>
      购买
    </button>
  );
}
```

### 17.7 与 CI/CD 整合

#### 17.7.1 GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      
      - run: npm ci
      
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test
      - run: npm run build
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

#### 17.7.2 自动部署

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - run: npm ci
      
      - name: Build
        run: npm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

### 17.8 与 Web3 集成

```tsx
// wagmi + viem
import { createConfig, http } from 'wagmi';
import { mainnet, polygon } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';

const config = createConfig({
  chains: [mainnet, polygon],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

---

## 第 18 章：参考资源

### 18.1 官方资源

| 资源 | 链接 | 说明 |
|------|------|------|
| 官方文档 | https://nextjs.org/docs | 必读 |
| 学习教程 | https://nextjs.org/learn | 入门 |
| 博客 | https://nextjs.org/blog | 更新日志 |
| GitHub | https://github.com/vercel/next.js | 源码 |
| Examples | https://github.com/vercel/next.js/tree/canary/examples | 示例集合 |
| Showcase | https://nextjs.org/showcase | 真实案例 |

### 18.2 中文资源

| 资源 | 链接 | 说明 |
|------|------|------|
| 思否 Next.js 专栏 | segmentfault.com/t/next.js | 中文社区 |
| 掘金 Next.js 话题 | juejin.cn/tag/Next.js | 实战文章 |
| 知乎专栏 | zhuanlan.zhihu.com | 深度文章 |
| B 站视频 | bilibili.com | 视频教程 |
| 慕课网 | imooc.com | 系统课程 |
| 极客时间 | time.geekbang.org | 进阶课程 |

### 18.3 视频教程

- **Vercel 官方 YouTube** — Next.js Conf 演讲
- **Lee Robinson**（VP DevRel）— 大量实战视频
- **Sam Selikoff** — App Router 深度
- **Theo** — Next.js 教程
- **Web Dev Simplified** — 入门友好
- **ByteGrad** — 中级实战

### 18.4 推荐书籍

1. **《Next.js in Action》** — Adam Boduch（入门）
2. **《Real-World Next.js》** — Michele Riva（实战）
3. **《Full Stack React with Next.js》** — 进阶
4. **《Learning React**（Modern React 章节）— 配合使用

### 18.5 关键 GitHub 仓库

- [vercel/next.js](https://github.com/vercel/next.js) — 主仓库
- [vercel/next-learn](https://github.com/vercel/next-learn) — 教程
- [vercel/examples](https://github.com/vercel/examples) — 示例
- [shadcn-ui/ui](https://github.com/shadcn-ui/ui) — UI 库
- [t3-oss/create-t3-app](https://github.com/t3-oss/create-t3-app) — T3 Stack 模板
- [vercel/platforms](https://github.com/vercel/platforms) — 多租户模板
- [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth) — Auth.js
- [prisma/prisma](https://github.com/prisma/prisma) — Prisma ORM

### 18.6 重要博客文章

- **RSC 起源**：Dan Abramov 的系列文章
- **PPR 详解**：Vercel 官方博客
- **App Router 迁移指南**：官方 docs
- **Server Actions 实战**：Lee Robinson 博客

### 18.7 关键 Twitter 账号

- @nextjs — 官方账号
- @leeerob — Lee Robinson（VP DevRel）
- @rauchg — Guillermo Rauch（CEO）
- @sebmarkbage — Sebastian Markbåge（React 核心）
- @dan_abramov2 — Dan Abramov
- @wesbos — Wes Bos（教程）
- @mxstbr — Max Stoiber（生态）

### 18.8 关键会议与发布

- **Next.js Conf**（每年）— 新版本发布
- **React Conf**（每年）— React 新特性
- **Vercel Ship** — 工程实践分享

### 18.9 工具集

| 工具 | 用途 |
|------|------|
| **Next.js DevTools** | 调试、性能分析 |
| **Vercel CLI** | 部署、本地开发 |
| **React DevTools** | 组件树分析 |
| **Chrome DevTools** | 网络、性能 |
| **Lighthouse** | 性能审计 |
| **WebPageTest** | 全球性能测试 |
| **Bundle Analyzer** | 包大小分析 |
| **Sentry** | 错误监控 |
| **PostHog** | 用户分析 |
| **Linear** | 项目管理 |

### 18.10 学习路径

#### 初学者（0-3 个月）
1. React 基础
2. Next.js 官方教程
3. App Router 入门
4. 简单 SSG 项目
5. 部署到 Vercel

#### 进阶者（3-6 个月）
1. Server Components 深度
2. Server Actions
3. 数据获取与缓存
4. 鉴权（NextAuth）
5. 国际化
6. 真实项目实战

#### 高级（6-12 个月）
1. 性能优化（Web Vitals）
2. 边缘运行时
3. 自托管 + Docker
4. 微前端架构
5. 监控 + 告警
6. 团队协作流程

#### 专家（1 年+）
1. RSC 内部原理
2. 贡献 Next.js 源码
3. 内部框架封装
4. 跨端方案
5. 复杂业务架构
6. 技术布道

---

## 第 19 章：高级主题扩展

### 19.1 微前端与 Next.js

```ts
// 1. Module Federation（多团队应用）
// host 应用
// next.config.js
const { NextFederationPlugin } = require('@module-federation/nextjs-mf');

module.exports = {
  webpack(config, options) {
    config.plugins.push(
      new NextFederationPlugin({
        name: 'host',
        filename: 'static/chunks/remoteEntry.js',
        remotes: {
          teamA: 'teamA@https://team-a.com/remoteEntry.js',
          teamB: 'teamB@https://team-b.com/remoteEntry.js',
        },
        shared: ['react', 'react-dom'],
      })
    );
    return config;
  },
};

// 2. Multi-Zones（多 Next 应用 + 同一域）
// next.config.js（marketing）
module.exports = {
  basePath: '/marketing',
  async rewrites() {
    return [
      { source: '/app/:path*', destination: '/app/:path*' },  // 转发到 dashboard
    ];
  },
};
```

### 19.2 SSR 缓存层（Redis）

```ts
// lib/cache.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  // 1. 检查缓存
  const cached = await redis.get<T>(key);
  if (cached) return cached;
  
  // 2. 缓存未命中，获取数据
  const data = await fetcher();
  
  // 3. 写入缓存
  await redis.setex(key, ttl, JSON.stringify(data));
  
  return data;
}

// 使用
const products = await getCachedData(
  'products:list',
  () => db.product.findMany(),
  600  // 10 分钟
);
```

### 19.3 实时数据（WebSocket / SSE）

#### 19.3.1 SSE（Server-Sent Events）

```ts
// app/api/notifications/stream/route.ts
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // 定时推送
      const interval = setInterval(() => {
        const data = `data: ${JSON.stringify({ time: Date.now() })}\n\n`;
        controller.enqueue(encoder.encode(data));
      }, 1000);
      
      // 客户端断开
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

```tsx
'use client';
import { useEffect, useState } from 'react';

export function LiveNotifications() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    const eventSource = new EventSource('/api/notifications/stream');
    
    eventSource.onmessage = (e) => {
      setData(JSON.parse(e.data));
    };
    
    return () => eventSource.close();
  }, []);
  
  return <div>{data?.time}</div>;
}
```

#### 19.3.2 WebSocket

```ts
// app/api/ws/route.ts（不支持，需独立服务）
// 用 ws / socket.io

// 客户端
'use client';
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function LiveChat() {
  const [messages, setMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  
  useEffect(() => {
    const s = io('wss://api.example.com');
    setSocket(s);
    
    s.on('message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });
    
    return () => s.disconnect();
  }, []);
  
  return (
    <div>
      {messages.map((m, i) => <div key={i}>{m.text}</div>)}
    </div>
  );
}
```

### 19.4 错误处理完整模式

```tsx
// lib/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400, { fields });
  }
}

export class AuthError extends AppError {
  constructor(message: string = '未授权') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = '资源') {
    super(`${resource}未找到`, 'NOT_FOUND', 404);
  }
}

// 全局错误处理
// app/global-error.tsx
'use client';

export default function GlobalError({ 
  error, 
  reset 
}: { 
  error: Error & { digest?: string }; 
  reset: () => void; 
}) {
  return (
    <html>
      <body>
        <div>
          <h1>出错了</h1>
          <button onClick={reset}>重试</button>
        </div>
      </body>
    </html>
  );
}
```

### 19.5 数据库事务模式

```ts
// Prisma 事务
'use server';
import { prisma } from '@/lib/prisma';

export async function transferFunds(
  fromId: string, 
  toId: string, 
  amount: number
) {
  return await prisma.$transaction(async (tx) => {
    // 1. 扣款
    const sender = await tx.account.update({
      where: { id: fromId },
      data: { balance: { decrement: amount } },
    });
    
    if (sender.balance < 0) {
      throw new Error('余额不足');
    }
    
    // 2. 入账
    await tx.account.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    });
    
    // 3. 记录
    await tx.transaction.create({
      data: {
        fromId,
        toId,
        amount,
        status: 'COMPLETED',
      },
    });
  });
}
```

### 19.6 文件上传

```tsx
// app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  if (!file) {
    return NextResponse.json({ error: 'No file' }, { status: 400 });
  }
  
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `uploads/${Date.now()}-${file.name}`;
  
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: file.type,
  }));
  
  return NextResponse.json({ url: `https://cdn.example.com/${key}` });
}
```

```tsx
'use client';
import { useState } from 'react';

export function FileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    // 简单上传（小文件）
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    // 分块上传（大文件）
    // 实际项目用 tus-js-client / uppy
    
    setUploading(false);
  }
  
  return (
    <input 
      type="file" 
      onChange={handleUpload} 
      disabled={uploading} 
    />
  );
}
```

### 19.7 大数据量列表

```tsx
// 1. 服务端分页
async function ProductList({ page }: { page: number }) {
  const PAGE_SIZE = 20;
  const products = await db.product.findMany({
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return <List items={products} />;
}

// 2. 客户端虚拟滚动
'use client';
import { useVirtualizer } from '@tanstack/react-virtual';

export function VirtualList({ items }: { items: any[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });
  
  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. 游标分页（适合无限滚动）
async function getProducts(cursor?: string) {
  return await db.product.findMany({
    take: 20,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { id: 'asc' },
  });
}
```

### 19.8 邮件发送

```ts
// lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: React.ReactElement;
}) {
  const { data, error } = await resend.emails.send({
    from: 'noreply@example.com',
    to,
    subject,
    react,
  });
  
  if (error) throw error;
  return data;
}

// 使用（Server Action）
'use server';
import { WelcomeEmail } from '@/emails/Welcome';

export async function sendWelcome(userId: string) {
  const user = await getUser(userId);
  
  await sendEmail({
    to: user.email,
    subject: '欢迎加入！',
    react: <WelcomeEmail name={user.name} />,
  });
}
```

### 19.9 定时任务（Cron）

```ts
// app/api/cron/daily/route.ts
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
  // 1. 验证 cron secret（防止外部调用）
  const h = await headers();
  if (h.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  
  // 2. 执行任务
  await cleanupOldData();
  await sendDailyReport();
  
  return NextResponse.json({ ok: true });
}

// vercel.json
{
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 0 * * *" }
  ]
}
```

### 19.10 高级 SEO

```tsx
// app/[product]/page.tsx
export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ product: string }> 
}) {
  const { product } = await params;
  const data = await getProduct(product);
  
  return {
    title: `${data.name} - 我的商店`,
    description: data.description,
    keywords: [data.category, ...data.tags],
    openGraph: {
      title: data.name,
      description: data.description,
      images: [data.image],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: data.name,
      description: data.description,
      images: [data.image],
    },
    alternates: {
      canonical: `https://example.com/${data.slug}`,
    },
  };
}

// JSON-LD 结构化数据
export default function ProductPage({ params }) {
  const product = await getProduct(params.product);
  
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  };
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div>...</div>
    </>
  );
}
```

### 19.11 性能监控（自定义）

```ts
// lib/performance.ts
export function reportMetric(name: string, value: number, tags?: Record<string, string>) {
  // 1. 上报到自定义后端
  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    navigator.sendBeacon('/api/metrics', JSON.stringify({
      name,
      value,
      tags,
      timestamp: Date.now(),
    }));
  }
  
  // 2. 上报到第三方
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', name, { value, ...tags });
  }
}

// 自动监控
// app/layout.tsx
import { useEffect } from 'react';

export function PerformanceMonitor() {
  useEffect(() => {
    // FCP
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        reportMetric('FCP', entry.startTime);
      }
    }).observe({ type: 'paint', buffered: true });
    
    // LCP
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      reportMetric('LCP', lastEntry.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    
    // 长任务
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        reportMetric('longtask', entry.duration);
      }
    }).observe({ type: 'longtask', buffered: true });
  }, []);
  
  return null;
}
```

### 19.12 安全加固

```ts
// 1. CSP 头
const csp = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  form-action 'self';
`;

// 2. 输入验证
import { z } from 'zod';

const userInput = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  bio: z.string().max(1000).optional(),
});

const validated = userInput.parse(input);

// 3. SQL 注入防护（用 ORM）
// Prisma 自动防护
await prisma.user.findFirst({
  where: { email: userInput.email },  // 参数化查询
});

// 4. XSS 防护
// React 自动转义
<div>{userContent}</div>  // 安全
// 避免 dangerouslySetInnerHTML

// 5. CSRF
// Next.js Server Actions 内置
// API Routes 用 token 验证

// 6. 速率限制（中间件）
// 见前面章节
```

### 19.13 构建优化

```js
// next.config.js
module.exports = {
  // 1. 实验性优化
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'lodash',
      'ramda',
      'antd',
      '@mui/material',
      'react-bootstrap',
    ],
    
    // 2. 并行路由缓存
    ppr: 'incremental',
    
    // 3. 编译优化
    serverMinification: true,
    serverSourceMaps: false,
    
    // 4. 静态生成
    staticGenerationMaxConcurrency: 8,
    staticGenerationMaxPages: 100,
  },
  
  // 5. Webpack 优化
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      // 生产客户端构建
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          framework: {
            chunks: 'all',
            name: 'framework',
            test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
            priority: 40,
            enforce: true,
          },
          lib: {
            test(module) {
              return module.size() > 160000 &&
                /node_modules[/\\]/.test(module.identifier());
            },
            name: 'lib',
            priority: 30,
            minChunks: 1,
            reuseExistingChunk: true,
          },
        },
      };
    }
    return config;
  },
  
  // 6. Headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
        ],
      },
    ];
  },
  
  // 7. 图片
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    minimumCacheTTL: 60,
  },
};
```

### 19.14 测试策略

```ts
// 1. 单元测试（Vitest）
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders correctly', () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click');
  });
  
  it('handles click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalled();
  });
});

// 2. Server Component 测试
import { render } from '@testing-library/react';
import { ProductsList } from './ProductsList';

vi.mock('@/lib/db', () => ({
  db: {
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, name: 'Test' },
      ]),
    },
  },
}));

it('renders products', async () => {
  const { findByText } = render(await ProductsList());
  expect(await findByText('Test')).toBeInTheDocument();
});

// 3. E2E 测试（Playwright）
import { test, expect } from '@playwright/test';

test('user can sign up', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: '注册' }).click();
  
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('欢迎')).toBeVisible();
});

// 4. 视觉回归测试
import { test, expect } from '@playwright/test';

test('homepage visual regression', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixelRatio: 0.05,
  });
});
```

### 19.15 灰度发布与 Feature Flag

```ts
// lib/feature-flags.ts
import { get } from '@vercel/edge-config';

export async function isFeatureEnabled(flag: string, userId?: string): Promise<boolean> {
  const config = await get('feature-flags');
  const flags = (config as any)?.[flag];
  
  if (typeof flags === 'boolean') return flags;
  
  if (typeof flags === 'object' && flags.percentage !== undefined) {
    // 百分比灰度
    const hash = simpleHash(userId ?? 'anonymous');
    return hash % 100 < flags.percentage;
  }
  
  if (Array.isArray(flags?.userIds)) {
    return userId ? flags.userIds.includes(userId) : false;
  }
  
  return false;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// 使用
// app/page.tsx
import { isFeatureEnabled } from '@/lib/feature-flags';
import { auth } from '@/auth';

export default async function HomePage() {
  const session = await auth();
  const newUI = await isFeatureEnabled('new-ui', session?.user?.id);
  
  return newUI ? <NewHomePage /> : <OldHomePage />;
}
```

### 19.16 跨平台复刻（React Native + Next.js）

```ts
// 共享业务逻辑
// packages/logic/src/products.ts
export async function getProducts() {
  return await db.product.findMany();
}

// packages/ui/src/ProductCard.tsx
import { Product } from '@myapp/types';

export function ProductCard({ product }: { product: Product }) {
  return <div>{product.name}</div>;
}

// web/app/products/page.tsx
import { ProductCard } from '@myapp/ui';
import { getProducts } from '@myapp/logic';

export default async function Page() {
  const products = await getProducts();
  return products.map(p => <ProductCard key={p.id} product={p} />);
}

// mobile/App.tsx（React Native）
import { ProductCard } from '@myapp/ui';
import { getProducts } from '@myapp/logic';

export default function App() {
  const [products, setProducts] = useState([]);
  
  useEffect(() => {
    getProducts().then(setProducts);
  }, []);
  
  return products.map(p => <ProductCard key={p.id} product={p} />);
}
```

### 19.17 持续演进路线

```
Year 1: 基础项目
- App Router
- Server Components
- 基础鉴权
- 部署到 Vercel

Year 2: 扩展
- 性能优化（Web Vitals）
- 国际化
- 微前端
- 团队拆分

Year 3: 高级
- 自定义 Server Runtime
- 内部框架
- 跨端方案
- AI 集成

Year 4+: 平台化
- 内部 PaaS
- 通用业务组件
- 监控告警平台
- 持续演进
```

---

## 第 20 章：综合实战项目

### 20.1 项目：TikTok Shop 卖家管理后台

**目标**：构建一个完整的电商卖家管理后台，覆盖商品、订单、数据分析、直播、设置等核心模块。

#### 20.1.1 技术选型

```
- Next.js 15 (App Router) + React 19
- TypeScript 严格模式
- Tailwind CSS + shadcn/ui
- Prisma + PostgreSQL
- Redis（缓存、队列）
- NextAuth.js v5
- next-intl（中英泰越）
- Vercel（部署）
- Sentry（错误）
- PostHog（分析）
- BullMQ（任务）
```

#### 20.1.2 完整目录结构

```
tiktok-seller/
├── app/
│   ├── (marketing)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # 首页
│   │   ├── pricing/
│   │   │   └── page.tsx
│   │   └── features/
│   │       └── page.tsx
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/
│   │   │   ├── page.tsx
│   │   │   └── actions.ts
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── forgot/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                  # 需认证
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # 概览
│   │   │   ├── loading.tsx
│   │   │   └── _components/
│   │   │       ├── StatCards.tsx
│   │   │       ├── RecentOrders.tsx
│   │   │       └── SalesChart.tsx
│   │   ├── products/
│   │   │   ├── page.tsx                # 商品列表
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx            # 商品详情
│   │   │   │   └── edit/
│   │   │   │       └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── orders/
│   │   │   ├── page.tsx                # 订单列表
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx            # 订单详情
│   │   │   └── _components/
│   │   │       ├── OrderTable.tsx
│   │   │       └── OrderFilters.tsx
│   │   ├── analytics/
│   │   │   ├── page.tsx                # 数据分析
│   │   │   ├── sales/
│   │   │   │   └── page.tsx
│   │   │   ├── traffic/
│   │   │   │   └── page.tsx
│   │   │   └── products/
│   │   │       └── page.tsx
│   │   ├── live/
│   │   │   ├── page.tsx                # 直播数据
│   │   │   └── [roomId]/
│   │   │       └── page.tsx
│   │   ├── creators/
│   │   │   └── page.tsx                # 达人管理
│   │   ├── settings/
│   │   │   ├── page.tsx                # 设置
│   │   │   ├── profile/
│   │   │   ├── shop/
│   │   │   ├── billing/
│   │   │   └── team/
│   │   └── _components/
│   │       ├── Sidebar.tsx
│   │       ├── Header.tsx
│   │       └── ...
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts
│   │   ├── webhooks/
│   │   │   ├── tiktok/
│   │   │   │   └── route.ts
│   │   │   └── stripe/
│   │   │       └── route.ts
│   │   ├── cron/
│   │   │   ├── sync-orders/
│   │   │   │   └── route.ts
│   │   │   └── daily-report/
│   │   │       └── route.ts
│   │   ├── upload/
│   │   │   └── route.ts
│   │   └── health/
│   │       └── route.ts
│   ├── [locale]/
│   │   └── (marketing)/
│   │       ├── page.tsx
│   │       └── ...
│   ├── layout.tsx                      # 根布局
│   ├── not-found.tsx
│   ├── error.tsx
│   └── global-error.tsx
├── components/
│   ├── ui/                             # shadcn/ui
│   ├── forms/
│   ├── charts/
│   └── ...
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   ├── redis.ts
│   ├── api/
│   │   ├── tiktok.ts
│   │   └── ...
│   ├── data/
│   │   ├── products.ts
│   │   ├── orders.ts
│   │   └── analytics.ts
│   ├── utils/
│   │   ├── format.ts
│   │   └── validation.ts
│   └── i18n.ts
├── actions/
│   ├── products.ts
│   ├── orders.ts
│   ├── settings.ts
│   └── ...
├── prisma/
│   └── schema.prisma
├── messages/
│   ├── en/
│   └── zh/
├── public/
├── styles/
├── types/
├── middleware.ts
├── i18n.ts
├── next.config.js
├── tailwind.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

#### 20.1.3 核心代码示例

**根布局**：

```tsx
// app/layout.tsx
import { Inter, Noto_Sans_SC } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  display: 'swap',
});

const notoSC = Noto_Sans_SC({ 
  subsets: ['latin'], 
  variable: '--font-noto-sc',
  display: 'swap',
});

export const metadata = {
  title: {
    template: '%s | TikTok Shop 卖家后台',
    default: 'TikTok Shop 卖家后台',
  },
  description: '专业的 TikTok Shop 卖家管理工具',
};

export default function RootLayout({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return (
    <html 
      lang="zh-CN" 
      className={`${inter.variable} ${notoSC.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Dashboard 概览**：

```tsx
// app/(dashboard)/dashboard/page.tsx
import { Suspense } from 'react';
import { getDashboardStats } from '@/lib/data/dashboard';
import { getRecentOrders } from '@/lib/data/orders';
import { StatCards } from './_components/StatCards';
import { RecentOrders } from './_components/RecentOrders';
import { SalesChart } from './_components/SalesChart';
import { TopProducts } from './_components/TopProducts';

export default async function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">店铺概览</h1>
      
      <Suspense fallback={<StatCardsSkeleton />}>
        <StatCards />
      </Suspense>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Suspense fallback={<ChartSkeleton />}>
            <SalesChart />
          </Suspense>
        </div>
        
        <div>
          <Suspense fallback={<ListSkeleton />}>
            <TopProducts />
          </Suspense>
        </div>
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-4">最近订单</h2>
        <Suspense fallback={<OrdersSkeleton />}>
          <RecentOrders limit={10} />
        </Suspense>
      </div>
    </div>
  );
}

async function StatCards() {
  const stats = await getDashboardStats();
  return <StatCards data={stats} />;
}

async function SalesChart() {
  const data = await getSalesData({ days: 30 });
  return <SalesChart data={data} />;
}

async function TopProducts() {
  const products = await getTopProducts({ limit: 5 });
  return <TopProductsList products={products} />;
}

async function RecentOrders({ limit }: { limit: number }) {
  const orders = await getRecentOrders({ limit });
  return <RecentOrdersTable orders={orders} />;
}
```

**商品管理 Server Action**：

```ts
// actions/products.ts
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { uploadImage } from '@/lib/storage';

const ProductSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(10).max(5000),
  price: z.coerce.number().positive().max(999999),
  stock: z.coerce.number().int().min(0),
  category: z.enum(['clothing', 'beauty', 'electronics', 'home']),
  images: z.array(z.string().url()).min(1).max(9),
});

export type ProductFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
} | null;

export async function createProduct(
  prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await auth();
  if (!session) {
    return { success: false, message: '请先登录' };
  }
  
  // 1. 解析数据
  const rawData = {
    name: formData.get('name'),
    description: formData.get('description'),
    price: formData.get('price'),
    stock: formData.get('stock'),
    category: formData.get('category'),
    images: formData.getAll('images'),
  };
  
  // 2. 验证
  const validated = ProductSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      success: false,
      message: '表单验证失败',
      errors: validated.error.flatten().fieldErrors,
    };
  }
  
  // 3. 业务逻辑
  try {
    const product = await prisma.product.create({
      data: {
        ...validated.data,
        sellerId: session.user.id,
        status: 'draft',
      },
    });
    
    revalidatePath('/dashboard/products');
    return { success: true, message: '商品创建成功' };
  } catch (error) {
    return { success: false, message: '创建失败' };
  }
}

export async function updateProduct(
  productId: string,
  prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await auth();
  if (!session) {
    return { success: false, message: '请先登录' };
  }
  
  // 检查所有权
  const existing = await prisma.product.findUnique({
    where: { id: productId },
  });
  
  if (!existing || existing.sellerId !== session.user.id) {
    return { success: false, message: '无权操作' };
  }
  
  // ... 验证 + 更新
  await prisma.product.update({
    where: { id: productId },
    data: validated.data,
  });
  
  revalidatePath(`/dashboard/products/${productId}`);
  revalidatePath('/dashboard/products');
  
  return { success: true, message: '更新成功' };
}

export async function deleteProduct(productId: string) {
  const session = await auth();
  if (!session) return { success: false, message: '请先登录' };
  
  await prisma.product.delete({
    where: { id: productId, sellerId: session.user.id },
  });
  
  revalidatePath('/dashboard/products');
}
```

**实时订单 SSE**：

```ts
// app/api/orders/stream/route.ts
import { auth } from '@/lib/auth';
import { subscribe } from '@/lib/redis';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const channel = `orders:${session.user.id}`;
      
      // 订阅 Redis 频道
      const subscriber = await subscribe(channel, (message) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
        );
      });
      
      request.signal.addEventListener('abort', () => {
        subscriber.unsubscribe();
        controller.close();
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
```

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export function LiveOrderNotifications() {
  const { data: session } = useSession();
  const [orders, setOrders] = useState<any[]>([]);
  
  useEffect(() => {
    if (!session) return;
    
    const eventSource = new EventSource('/api/orders/stream');
    
    eventSource.onmessage = (e) => {
      const order = JSON.parse(e.data);
      setOrders(prev => [order, ...prev].slice(0, 50));
      
      // 通知
      new Notification('新订单', {
        body: `${order.productName} - ¥${order.amount}`,
      });
    };
    
    return () => eventSource.close();
  }, [session]);
  
  return <div>{orders.length} 个新订单</div>;
}
```

#### 20.1.4 性能数据

```
首屏 LCP：1.2s
TTFB：120ms
JS 体积：185KB（gzip）
API 平均响应：180ms
95% 请求：< 500ms
月活用户：50,000
月订单：1,000,000+
日均 API 调用：5,000,000
```

#### 20.1.5 关键决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 框架 | Next.js 15 | 团队熟悉、SSR 优秀 |
| 部署 | Vercel | 快速、边缘 |
| 数据库 | PostgreSQL | 复杂查询、JSON 支持 |
| 缓存 | Redis | 实时数据、限流 |
| 鉴权 | NextAuth | 灵活、多 provider |
| 状态 | Zustand | 轻量、SSR 友好 |
| UI | shadcn/ui | 定制、TypeScript |
| 表单 | React Hook Form | 性能、生态 |
| 监控 | Sentry + PostHog | 错误 + 用户 |

---

## 附录：常用命令清单

### 开发命令

```bash
# 创建项目
npx create-next-app@latest my-app
cd my-app

# 开发
npm run dev                  # 默认
npm run dev -- --turbopack   # Turbopack

# 构建
npm run build

# 启动生产
npm run start

# 代码检查
npm run lint
npm run type-check

# 测试
npm run test
npm run test:e2e

# 格式化
npm run format
```

### 部署命令

```bash
# Vercel
vercel login
vercel
vercel --prod

# Docker
docker build -t my-app .
docker run -p 3000:3000 my-app
docker-compose up -d

# 静态导出
NEXT_OUTPUT=export npm run build
# out/ 目录部署到 CDN
```

### 数据库命令

```bash
# Prisma
npx prisma init
npx prisma generate
npx prisma migrate dev
npx prisma db push
npx prisma studio
```

### 调试命令

```bash
# 查看环境变量
vercel env ls

# 拉取环境
vercel env pull .env.local

# 性能分析
ANALYZE=true npm run build

# 清理缓存
rm -rf .next
rm -rf node_modules
npm install
```

### 升级命令

```bash
# Next.js
npm install next@latest react@latest react-dom@latest
npx @next/codemod@canary upgrade latest

# 依赖检查
npx npm-check-updates
```

---

## 附录：推荐学习顺序

```
1. JavaScript 基础
2. TypeScript 基础
3. React 18 基础
4. Next.js 官方教程
5. App Router 基础
6. Server Components
7. Server Actions
8. 数据获取
9. 鉴权
10. 部署
11. 性能优化
12. 高级特性（PPR、Edge）
13. 源码阅读
14. 内部框架封装
15. 技术布道
```

---

## 附录：常见问题 FAQ

**Q1: Next.js 适合做什么？**
A: 适合需要 SSR、SEO、性能的全栈 Web 应用。不适合纯客户端工具、Electron。

**Q2: Next.js 和 React 什么关系？**
A: Next.js 是基于 React 的全栈框架，封装了构建、路由、SSR 等。

**Q3: Pages Router 和 App Router 怎么选？**
A: 新项目用 App Router（未来方向），老项目继续用 Pages Router 没问题。

**Q4: RSC 是否会取代客户端组件？**
A: 不会，是互补关系。RSC 处理数据，Client Component 处理交互。

**Q5: Next.js 是否锁定 Vercel？**
A: 不是。可以自托管（Node、Docker、K8S），但部分高级功能仅 Vercel。

**Q6: 学习曲线陡吗？**
A: 基础 1 周，进阶 1 月，熟练 3 月。需要 React 基础 + 服务端思维。

**Q7: 如何调试？**
A: 服务端 console.log、客户端 DevTools、Network、Server Components Inspector。

**Q8: 性能瓶颈在哪？**
A: 客户端 JS 体积、数据获取瀑布流、未优化的图片、未使用的代码。

**Q9: 如何优化 SEO？**
A: metadata API、SSG/ISR、结构化数据、hreflang、sitemap。

**Q10: Server Actions 安全吗？**
A: 是的，Next.js 默认开启 CSRF 保护、Origin 验证。但仍需手动鉴权。

**Q11: 如何处理大量客户端状态？**
A: URL state 优先 → Server Actions → Zustand → Context（按需）。

**Q12: 如何选择 ORM？**
A: Prisma（最流行）、Drizzle（更灵活）、Sequelize（老牌）。

**Q13: 如何做测试？**
A: Vitest（单元）、Playwright（E2E）、React Testing Library（组件）。

**Q14: 何时使用 RSC vs Client Component？**
A: 默认 RSC，需要交互/状态/浏览器 API 时 Client。

**Q15: 如何部署到非 Vercel？**
A: Docker + K8S、PM2 + Nginx、Cloudflare Pages、Netlify、AWS Amplify。

**Q16: 如何处理国际化？**
A: next-intl（推荐）、next-i18next（Pages）、react-i18next（手动）。

**Q17: 如何监控线上问题？**
A: Sentry（错误）、PostHog（行为）、Vercel Analytics（性能）、自研埋点。

**Q18: 如何实现实时数据？**
A: SSE（推荐）、WebSocket、长轮询、Vercel Live（实验）。

**Q19: 如何做权限控制？**
A: 中间件（粗粒度）、Server Action（细粒度）、RLS（数据库级）。

**Q20: Next.js 未来方向？**
A: RSC 成熟、边缘优先、AI 集成、编译时优化、跨端统一。

---

**完**

> 本文档是 Next.js 学习的完整手册，覆盖了从基础到高级的几乎所有主题。
> 建议配合官方文档和实际项目使用，定期更新以反映新版本特性。
> 如有疑问，可查阅：https://nextjs.org/docs

---

# 进阶篇：深度专题

## 21. Server Components 高级模式

### 21.1 Server Components 组合模式

Server Components 的真正威力在于组合，下面是几种经典模式：

```tsx
// 模式 1：根组件 - 数据获取与分发
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { getUser, getStats, getActivities } from '@/lib/data';
import { StatsCards } from './_components/StatsCards';
import { ActivityFeed } from './_components/ActivityFeed';
import { Skeleton } from '@/components/ui/skeleton';

export default async function DashboardPage() {
  // 顶层并行获取（同一渲染阶段并发）
  const [user, stats, activities] = await Promise.all([
    getUser(),
    getStats(),
    getActivities(),
  ]);
  
  return (
    <div className="dashboard">
      <h1>欢迎回来，{user.name}</h1>
      
      {/* 嵌套 Suspense - 允许部分内容先渲染 */}
      <Suspense fallback={<StatsCardsSkeleton />}>
        <StatsCards data={stats} />
      </Suspense>
      
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityFeed activities={activities} />
      </Suspense>
    </div>
  );
}
```

```tsx
// 模式 2：纯展示组件（无数据获取）
// app/dashboard/_components/StatsCards.tsx
// 注意：默认就是 Server Component，无需 'use client'
import { Card } from '@/components/ui/card';

export function StatsCards({ data }: { data: Stats }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Card title="订单" value={data.orders} delta="+12%" />
      <Card title="营收" value={`¥${data.revenue}`} delta="+8%" />
      <Card title="访客" value={data.visitors} delta="+3%" />
      <Card title="转化率" value={`${data.conversion}%`} delta="-0.5%" />
    </div>
  );
}
```

```tsx
// 模式 3：客户端组件 + Server Component 注入
// app/dashboard/_components/ActivityFeed.tsx
'use client';
import { useState, useTransition } from 'react';
import { deleteActivity } from './actions';

interface Props {
  activities: Activity[];
}

export function ActivityFeed({ activities }: Props) {
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');
  
  const filtered = activities.filter(a => a.title.includes(filter));
  
  return (
    <div>
      <input
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="搜索活动..."
      />
      
      {isPending && <div>处理中...</div>}
      
      <ul>
        {filtered.map(activity => (
          <li key={activity.id}>
            {activity.title}
            <button
              onClick={() => startTransition(() => deleteActivity(activity.id))}
            >
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 21.2 Server Component 树形数据流

```tsx
// 完整的树形数据流示例
// app/products/[category]/page.tsx
import { Suspense } from 'react';
import { ProductGrid } from './_components/ProductGrid';
import { ProductFilters } from './_components/ProductFilters';
import { ProductRecommendations } from './_components/ProductRecommendations';
import { getProducts, getFilters, getRecommendations } from '@/lib/products';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
}) {
  // 1. 并行获取数据（关键性能优化）
  const [{ category }, { sort = 'default', page = '1' }] = await Promise.all([
    params,
    searchParams,
  ]);
  
  // 2. 静态部分（不依赖参数）
  const filters = await getFilters(category);
  
  return (
    <div className="grid grid-cols-[240px_1fr_300px] gap-6">
      {/* 左侧：筛选器 - 独立数据流 */}
      <ProductFilters
        category={category}
        initialFilters={filters}
      />
      
      {/* 中间：商品列表 - 依赖参数 */}
      <Suspense key={`${category}-${sort}-${page}`} fallback={<ProductGridSkeleton />}>
        <ProductGrid
          category={category}
          sort={sort}
          page={parseInt(page)}
        />
      </Suspense>
      
      {/* 右侧：推荐 - 独立数据流 */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <ProductRecommendations category={category} />
      </Suspense>
    </div>
  );
}
```

```tsx
// _components/ProductGrid.tsx - Server Component
import { getProducts } from '@/lib/products';

export async function ProductGrid({
  category,
  sort,
  page,
}: {
  category: string;
  sort: string;
  page: number;
}) {
  const products = await getProducts({ category, sort, page });
  
  return (
    <div className="grid grid-cols-3 gap-4">
      {products.items.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
      
      <Pagination
        current={page}
        total={products.total}
        pageSize={20}
      />
    </div>
  );
}
```

### 21.3 Server Component 复用策略

```tsx
// 1. 共享数据上下文
// app/providers.tsx
import { getSession } from '@/lib/auth';
import { Header } from './_components/Header';
import { Footer } from './_components/Footer';

export async function Layout({ children }: { children: React.ReactNode }) {
  // 在 layout 一次获取，多个页面共享
  const session = await getSession();
  
  return (
    <div>
      <Header user={session?.user} />
      {children}
      <Footer />
    </div>
  );
}
```

```tsx
// 2. 共享布局 - parallel routes
// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
  analytics,
  notifications,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  notifications: React.ReactNode;
}) {
  return (
    <div className="dashboard-layout">
      <main>{children}</main>
      <aside>
        {analytics}
        {notifications}
      </aside>
    </div>
  );
}

// app/dashboard/@analytics/default.tsx
export default function Analytics() {
  return <AnalyticsWidget />;
}

// app/dashboard/@notifications/default.tsx
export default function Notifications() {
  return <NotificationList />;
}
```

### 21.4 RSC 序列化的边界

```tsx
// 可以跨边界传递的内容：
// 1. 普通 JSON 数据
// 2. 不可变的 Date、Map、Set、RegExp
// 3. Server Action 引用
// 4. 不可变对象引用
// 5. Promise（Suspense 集成）

// 不能跨边界传递的：
// 1. 函数（非 Server Action）
// 2. class 实例
// 3. Symbol
// 4. 循环引用

// 示例：使用 Server Action
'use server';
export async function addItem(formData: FormData) {
  'use server';
  // ...
}

// 'use client';
import { addItem } from './actions';

export function AddItemForm() {
  return (
    <form action={addItem}>
      <input name="name" />
      <button>添加</button>
    </form>
  );
}
```

### 21.5 错误边界与 RSC

```tsx
// app/dashboard/error.tsx - 错误边界（必须是 Client Component）
'use client';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 上报到 Sentry
    console.error('Dashboard error:', error);
  }, [error]);
  
  return (
    <div>
      <h2>出错了</h2>
      <p>{error.message}</p>
      <button onClick={() => reset()}>重试</button>
    </div>
  );
}
```

```tsx
// 全局错误 - app/global-error.tsx
'use client';
export default function GlobalError({ error, reset }: any) {
  return (
    <html>
      <body>
        <h2>应用错误</h2>
        <button onClick={() => reset()}>重试</button>
      </body>
    </html>
  );
}

// not-found.tsx - 404 页面
// app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div>
      <h2>页面未找到</h2>
      <Link href="/">返回首页</Link>
    </div>
  );
}
```

## 22. 数据获取深入

### 22.1 数据获取模式对比

| 模式 | 渲染时机 | 缓存策略 | 适用场景 | 优缺点 |
|------|---------|---------|---------|--------|
| **静态生成 (SSG)** | 构建时 | 默认永久 | 文档、博客、营销页 | 极快、不可变 |
| **ISR** | 构建+按需 | 定时失效 | 电商列表、新闻 | 性能与新鲜的平衡 |
| **动态 SSR** | 请求时 | 默认不缓存 | 仪表盘、个性化内容 | 实时、慢 |
| **PPR** | 部分静态+部分动态 | 混合 | 复杂页面 | Next.js 15 实验性 |
| **客户端获取** | 客户端 | 自定义 | 实时交互 | 灵活、SEO 不友好 |

### 22.2 数据获取的缓存控制

```tsx
// 1. fetch 缓存控制
// 静态（默认，永久缓存）
fetch('https://api.example.com/data', { cache: 'force-cache' });

// 重新验证（ISR）
fetch('https://api.example.com/data', {
  next: { revalidate: 60 }, // 60 秒后重新验证
});

// 永不缓存（动态 SSR）
fetch('https://api.example.com/data', { cache: 'no-store' });

// 标签失效
fetch('https://api.example.com/data', {
  next: { tags: ['products'] },
});

// 2. 在 layout/page 级别控制
export const revalidate = 3600; // 每小时重新验证
export const dynamic = 'force-dynamic'; // 强制动态
export const dynamicParams = true; // 动态参数允许
export const fetchCache = 'force-cache'; // 默认缓存策略

// 3. 路由级 fetch 缓存配置
export const fetchCache = 'default-cache';
// 可选：'auto', 'default-cache', 'default-no-store', 'force-cache', 'force-no-store', 'only-cache'
```

### 22.3 数据库直连 vs API 代理

```tsx
// 模式 1：Server Component 直连数据库（推荐）
// app/products/page.tsx
import { prisma } from '@/lib/prisma';

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
  });
  
  return <ProductList products={products} />;
}

// 优势：
// - 无 HTTP 开销
// - 自动在服务端执行
// - 类型安全（Prisma）
// - 部署简单

// 模式 2：通过内部 API（适合微服务）
// app/products/page.tsx
async function getProducts() {
  const res = await fetch(`${process.env.API_URL}/products`, {
    next: { revalidate: 60, tags: ['products'] },
  });
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export default async function ProductsPage() {
  const products = await getProducts();
  return <ProductList products={products} />;
}

// 优势：
// - 服务端解耦
// - 跨语言服务
// - API 复用给移动端

// 模式 3：tRPC（端到端类型安全）
// app/products/page.tsx
import { trpc } from '@/lib/trpc/server';

export default async function ProductsPage() {
  const products = await trpc.products.list.query({ limit: 20 });
  return <ProductList products={products} />;
}

// 优势：
// - 端到端类型
// - 自动推断
// - 服务端调用零开销
```

### 22.4 数据预取与 Suspense

```tsx
// lib/data.ts
import { unstable_cache } from 'next/cache';

// 内存级别的缓存包装
export const getProducts = unstable_cache(
  async (category: string) => {
    return await prisma.product.findMany({
      where: { category },
    });
  },
  ['products'],
  {
    revalidate: 3600,
    tags: ['products'],
  }
);

// 使用
const products = await getProducts('electronics');
```

```tsx
// React 19 的 use() Hook
// 注意：实验性，需要 Next.js 15 + React 19
'use client';
import { use, Suspense } from 'react';

function ProductList({ productsPromise }: { productsPromise: Promise<Product[]> }) {
  const products = use(productsPromise);
  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
}

export function ProductsPage({ productsPromise }: { productsPromise: Promise<Product[]> }) {
  return (
    <Suspense fallback={<ProductListSkeleton />}>
      <ProductList productsPromise={productsPromise} />
    </Suspense>
  );
}
```

### 22.5 服务端组件的数据流

```tsx
// 完整的数据流架构
// lib/data/orders.ts
import { prisma } from '@/lib/prisma';
import { cache } from 'react';

// 1. request-scoped caching（React 19 的 cache）
export const getOrder = cache(async (id: string) => {
  return await prisma.order.findUnique({
    where: { id },
    include: { items: true, user: true },
  });
});

// 2. 多个组件调用不会重复查询
// _components/OrderHeader.tsx
export async function OrderHeader({ orderId }: { orderId: string }) {
  const order = await getOrder(orderId); // 第一次查询
  return <h1>订单 #{order.id}</h1>;
}

// _components/OrderItems.tsx
export async function OrderItems({ orderId }: { orderId: string }) {
  const order = await getOrder(orderId); // 复用缓存，不重复查询
  return <ul>{order.items.map(i => <li key={i.id}>{i.name}</li>)}</ul>;
}
```

### 22.6 实时数据流

```tsx
// 1. 使用 SWR 客户端轮询
'use client';
import useSWR from 'swr';

export function OrderStatus({ orderId }: { orderId: string }) {
  const { data, error, isLoading } = useSWR(
    `/api/orders/${orderId}`,
    fetcher,
    { refreshInterval: 5000 } // 每 5 秒轮询
  );
  
  if (isLoading) return <Skeleton />;
  if (error) return <div>加载失败</div>;
  
  return <div>状态：{data.status}</div>;
}

// 2. 使用 EventSource（SSE）
'use client';
import { useEffect, useState } from 'react';

export function LiveNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  useEffect(() => {
    const eventSource = new EventSource('/api/notifications/stream');
    
    eventSource.onmessage = (e) => {
      const notification = JSON.parse(e.data);
      setNotifications(prev => [notification, ...prev].slice(0, 50));
    };
    
    return () => eventSource.close();
  }, []);
  
  return (
    <ul>
      {notifications.map(n => <li key={n.id}>{n.message}</li>)}
    </ul>
  );
}

// 3. Server-Sent Events API 路由
// app/api/notifications/stream/route.ts
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        const notification = generateNotification();
        controller.enqueue(`data: ${JSON.stringify(notification)}\n\n`);
      }, 1000);
      
      // 清理
      return () => clearInterval(interval);
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

## 23. 缓存策略全解

### 23.1 Next.js 缓存层次

```
┌─────────────────────────────────────────────┐
│ 浏览器缓存（BFCache、Memory Cache、Disk）│
├─────────────────────────────────────────────┤
│ CDN 缓存（Vercel Edge、Cloudflare）       │
├─────────────────────────────────────────────┤
│ Full Route Cache（路由级 SSG 缓存）         │
├─────────────────────────────────────────────┤
│ Data Cache（fetch 缓存）                    │
├─────────────────────────────────────────────┤
│ Router Cache（客户端路由缓存）              │
├─────────────────────────────────────────────┤
│ React Server Component Payload              │
└─────────────────────────────────────────────┘
```

### 23.2 各类缓存的详细配置

```tsx
// 1. Data Cache（fetch 缓存）
// 行为：跨请求共享，但同一请求不共享
fetch('https://api.example.com/data', {
  cache: 'force-cache', // 永久缓存
  // 或
  next: {
    revalidate: 60, // 时间失效
    tags: ['products'], // 标签失效
  },
});

// 2. Full Route Cache
// 行为：构建时生成，跨请求共享
export const dynamic = 'force-static'; // 强制静态
export const revalidate = 3600; // ISR 重新验证

// 3. Router Cache（客户端）
// 默认 30 秒（动态）/ 5 分钟（静态）
// 配置：
experimental: {
  staleTimes: {
    dynamic: 30,
    static: 180,
  },
}

// 4. Request Memoization
// 行为：单次请求内共享
import { cache } from 'react';
export const getUser = cache(async (id: string) => {
  return await db.user.findUnique({ where: { id } });
});
```

### 23.3 缓存失效策略

```tsx
// 1. 标签失效（Tag-based Revalidation）
// app/actions/products.ts
'use server';
import { revalidateTag } from 'next/cache';

export async function updateProduct(id: string, data: ProductData) {
  await db.product.update({ where: { id }, data });
  revalidateTag('products'); // 使所有 products 标签的缓存失效
  revalidateTag(`product-${id}`); // 失效特定
}

// 2. 路径失效
import { revalidatePath } from 'next/cache';

export async function createPost(data: PostData) {
  await db.post.create({ data });
  revalidatePath('/blog'); // 失效整页
  revalidatePath('/blog/[slug]', 'page'); // 失效特定页面类型
  revalidatePath('/', 'layout'); // 失效整个 layout
}

// 3. 路由失效（Server Action 中）
'use server';
import { revalidatePath } from 'next/cache';

export async function deleteUser(id: string) {
  await db.user.delete({ where: { id } });
  revalidatePath('/admin/users');
}

// 4. 时间失效
export const revalidate = 60; // 60 秒后重新验证
```

### 23.4 缓存最佳实践

```tsx
// 1. 细粒度缓存粒度
// 错误：粗粒度
export default async function Page() {
  const [users, posts, comments] = await Promise.all([
    fetch('/api/users').then(r => r.json()),
    fetch('/api/posts').then(r => r.json()),
    fetch('/api/comments').then(r => r.json()),
  ]);
  // 任何一个数据变化都需重新生成整个页面
}

// 正确：细粒度
async function getUsers() {
  const res = await fetch('https://api.example.com/users', {
    next: { revalidate: 3600, tags: ['users'] },
  });
  return res.json();
}

async function getPosts() {
  const res = await fetch('https://api.example.com/posts', {
    next: { revalidate: 60, tags: ['posts'] },
  });
  return res.json();
}

export default async function Page() {
  const [users, posts] = await Promise.all([getUsers(), getPosts()]);
  return <Dashboard users={users} posts={posts} />;
}

// 2. 用户特定数据不缓存
async function getUserData(userId: string) {
  const session = await getSession();
  if (session?.userId !== userId) throw new Error('Unauthorized');
  
  const res = await fetch(`https://api.example.com/users/${userId}`, {
    cache: 'no-store', // 不缓存用户特定数据
  });
  return res.json();
}

// 3. 静态 + 动态混合
export default async function ProductPage({ params }: any) {
  const { id } = await params;
  
  // 静态（不依赖用户）
  const product = await getProduct(id);
  
  return (
    <div>
      <ProductInfo product={product} />
      
      {/* 动态部分（依赖用户） */}
      <Suspense fallback={<div>加载中...</div>}>
        <UserSpecificContent productId={id} />
      </Suspense>
    </div>
  );
}
```

### 23.5 缓存调试

```bash
# 查看构建产物
npm run build
# 包含每个路由的渲染类型：
# ●  (SSG)    静态生成
# ●  (ISR)    增量静态再生
# ●  (SSR)    服务器端渲染
# ●  (PPR)    部分预渲染

# 开发模式监控
# 终端显示：
# ✓ Compiled /products in 245ms
# ✓ GET /products 200 in 156ms
# ✓ GET /products 200 in 12ms (cached)
```

```tsx
// 添加日志追踪缓存命中
// lib/data.ts
import { unstable_cache } from 'next/cache';

export const getProducts = unstable_cache(
  async (category: string) => {
    console.log('[Cache MISS] Fetching products for:', category);
    return await db.product.findMany({ where: { category } });
  },
  ['products-cache-key'],
  {
    revalidate: 60,
    tags: ['products'],
  }
);

// 使用
const products = await getProducts('electronics');
// 第一次：打印 [Cache MISS]
// 60秒内：不再打印（缓存命中）
```












