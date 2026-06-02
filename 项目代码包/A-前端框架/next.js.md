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
