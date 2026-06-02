# astro - 岛屿架构与 Content Layer 的现代 SSG 框架

**GitHub**: withastro/astro
**Star**: 50k+
**语言**: TypeScript
**主题**: SSG/SSR / 岛屿架构 / Content Layer / View Transitions
**适用场景**: 内容站、博客、文档、营销页、电商

## 第一段：基础范式

### 模式 1：pnpm workspace + 30+ 内部 Vite 插件的"组合式架构"

**问题场景**：Astro 同时要支持 6 个 UI 框架（React/Vue/Svelte/Solid/Preact/Lit）、5 个部署平台（Node/Cloudflare/Vercel/Netlify/Deno）、MDX/Sitemap/Partytown 等——单一巨型包不可能解耦。

**解决方案**：`packages/astro`（主包）+ `packages/integrations/`（6 框架 × 5 部署 × N 工具）+ `packages/markdown/`（remark/unified 管线），主包用 30+ `vite-plugin-*` 拆 Vite 插件。

**关键参数**：
- `packages/astro/src/core/`：config / app / routing / build / dev
- `packages/astro/src/runtime/server/`：SSR 渲染管线
- `packages/integrations/react/` `vue/` `svelte/` `solid/`
- `packages/markdown/`：remark 管线
- `withastro/compiler`：Rust 编译器独立仓库

**最佳实践**：功能用 packages 拆分——独立升级；内部 Vite 插件按职责命名（astro-pages / astro-routes / astro-content）；Rust 性能关键模块独立仓库——`withastro/compiler`；turborepo 编排——`turbo.json`。

---

### 模式 2：岛屿架构（Islands Architecture）+ astro-island 自定义元素

**问题场景**：传统 SPA 把所有组件当客户端组件——首屏加载大、SEO 差。MPA 没组件化——开发体验差。

**解决方案**：默认服务端渲染（HTML 输出），仅标注 `client:load` / `client:idle` / `client:visible` 的组件才水合为"岛屿"：
```astro
<MyReactComponent client:visible />
<!-- 仅当元素可见时才水合 -->
```

**关键参数**：
- `client:load` / `idle` / `visible` / `media` / `only`：水合时机
- `astro-island` 自定义元素：客户端占位
- SSR HTML 输出：默认
- 零 JS 默认：未标 `client:*` 不发 JS
- `runtime/server/render/`：服务端渲染

**最佳实践**：默认 SSR + 零 JS——`client:*` 才水合；`client:visible` 适用于折叠内容；`client:idle` 适用于非关键交互；`client:only="react"` 跳过 SSR；用 `transition:animate` 配 view transitions。

---

### 模式 3：Content Collections + Content Layer 类型安全

**问题场景**：Markdown 博客元数据散落各文件——frontmatter 无类型，YAML 错误延迟到运行时。

**解决方案**：`src/content/config.ts` 配 Zod schema，编译期校验 frontmatter：
```ts
import { defineCollection, z } from 'astro:content';
const blog = defineCollection({
  type: 'content',
  schema: z.object({ title: z.string(), date: z.date(), tags: z.array(z.string()) }),
});
export const collections = { blog };
```

**关键参数**：
- `defineCollection({ type, schema })`：定义
- `src/content/blog/*.md`：数据源
- Zod schema：编译期校验
- `getCollection('blog')`：查询
- Content Layer v5：多源（Notion / CMS / API）

**最佳实践**：所有 markdown 都用 Content Collection——类型安全；schema 必用 Zod——`z.string()` 不接受 `undefined`；v5 Content Layer 支持外部源——`loader: glob({ pattern, base })`；`getEntry('blog', slug)` 单条查询。

---

### 模式 4：.astro 文件 + frontmatter + scoped styles

**问题场景**：React/Vue 模板和逻辑混——HTML/CSS/JS 不分离。Astro 想要"模板即组件，零运行时"。

**解决方案**：`.astro` 文件 = `---` 之间的 frontmatter（TS）+ HTML 模板 + `<style>`（scoped）+ `<script>`（按需打包）：
```astro
---
const { name } = Astro.props;
---
<h1>Hello {name}</h1>
<style>
  h1 { color: red; }  /* scoped */
</style>
```

**关键参数**：
- `---` frontmatter：服务端 TS
- 模板：HTML + JSX 表达式
- `<style>` 默认 scoped：自动加 hash class
- `<script>` 按需：默认 type="module"
- `Astro.props`：组件 props

**最佳实践**：用 .astro 当页面 + 简单组件；复杂交互用 React/Vue 子组件；`<style>` scoped——避免污染；`is:inline` script 不打包；`Astro.props` 而非 `this.props`。

---

### 模式 5：astro.config.mjs + Vite 自加载

**问题场景**：配置文件是 TS 时——框架需要 TS 解析器；MJS 时——又要 ESM loader。Astro 不想重复造轮子。

**解决方案**：`core/config/vite-load.ts` 用 Vite 自己加载配置——Vite 内置 TS/ESM 解析：
```ts
import { defineConfig } from 'astro/config';
export default defineConfig({ integrations: [react()] });
```

**关键参数**：
- `astro.config.{mjs,js,ts,mts}`：4 格式支持
- `defineConfig` 类型化
- `core/config/vite-load.ts`：Vite loader
- Vite 自动 TS/ESM 解析
- `integrations: [react()]` 框架插件

**最佳实践**：用 `defineConfig`——TS 类型提示；TS 配置文件——IDE 跳转；`integrations: []` 列所有插件；`vite` 字段透传 Vite 配置；`output: 'static' | 'server' | 'hybrid'` 选模式。

---

## 第二段：扩展范式

### 模式 6：View Transitions + 视图过渡 API

**问题场景**：传统 MPA 整页白屏——SPA 又重。Apple 风格"页面间平滑过渡"怎么做？

**解决方案**：用 `<ViewTransitions />` 组件 + `transition:animate="slide"` 指令：
```astro
<head><ViewTransitions /></head>
<a href="/about" transition:animate="slide">关于</a>
```

**关键参数**：
- `<ViewTransitions />` head 注入
- `transition:name="hero"` 命名元素跨页持久
- `transition:animate="fade|slide|none"`
- `transition:persist` 不卸载
- 基于 View Transitions API（W3C 标准）

**最佳实践**：博客/文档站开 View Transitions——体验佳；`transition:name` 让"图片→详情页"无缝；`transition:persist` 保留 header；不滥用——单页应用反而慢。

---

### 模式 7：Server Islands + Server Actions

**问题场景**：静态站中"购物车"组件需要服务器 session——但要混在 SSG 页中。

**解决方案**：v4+ Server Islands——`server:defer` 让组件在客户端水合时再请求服务端：
```astro
<Cart server:defer>
  <Fragment slot="fallback"><CartSkeleton /></Fragment>
</Cart>
```

**关键参数**：
- `server:defer`：延迟渲染
- `<Fragment slot="fallback">`：占位
- v5 Server Actions：`actions.cart.add()`
- Server Functions 概念
- 与 React Server Components 异曲同工

**最佳实践**：Server Islands 用于"需要 session 的小部件"——购物车/用户头像；`fallback` 必填——避免 CLS；Server Actions 配 form action——少写 API。

---

### 模式 8：Routing 模式匹配 + manifest

**问题场景**：动态路由 `[id].astro` / `[...slug].astro` / 嵌套 `blog/[...page].astro`——传统 express 风格路由器慢。

**解决方案**：构建期生成 `routes` manifest（静态）+ SSR 期 `routePattern.exec(url)` 模式匹配：
```js
const route = routes.find(r => r.pattern.test(pathname));
```

**关键参数**：
- `pages/` 文件路由：自动注册
- `[param].astro`：动态段
- `[...rest].astro`：rest
- `getStaticPaths()`：SSG 预生成
- 嵌套 layout

**最佳实践**：动态路由用 `[slug].astro`；`getStaticPaths` 必填——SSG 必须；`prerender = true` 强制预渲染；layout 嵌套用 `<Layout>` 组件；`Astro.params` 拿路由参数。

---

### 模式 9：Integrations 适配器多部署目标

**问题场景**：一个 Astro 项目要部署到 Vercel/Netlify/Cloudflare/Node/Deno——各平台 runtime API 不同。

**解决方案**：`@astrojs/vercel` / `@astrojs/netlify` / `@astrojs/cloudflare` / `@astrojs/node` 适配器包，统一暴露 `AstroIntegration` API。

**关键参数**：
- `@astrojs/node`：Node SSR
- `@astrojs/vercel`：Vercel Edge
- `@astrojs/cloudflare`：Cloudflare Workers
- `output: 'server'`：SSR 模式
- adapter 暴露 `addEntrypoint` 钩子

**最佳实践**：选 adapter 与部署平台一致；`output: 'hybrid'` 混 SSG+SSR；edge runtime 限 API——`process.env` 不可用；`@astrojs/vercel/serverless` 走 Vercel Functions。

---

### 模式 10：构建期 + dev 期的双轨

**问题场景**：Astro 既要 `astro build`（产出静态文件）又要 `astro dev`（HMR 开发）——两套构建管线要保持一致。

**解决方案**：`core/build/`（build pipeline）+ `core/dev/`（HMR + Vite dev server）共享 `runtime/server` 渲染层。

**关键参数**：
- `astro build`：rollup 打包
- `astro dev`：Vite dev server
- `astro preview`：build 后预览
- `astro check`：类型检查
- 共享 `runtime/server/render.ts`

**最佳实践**：开发用 `astro dev` HMR；生产 `astro build`；`astro preview` 测生产构建；`astro check` 跑 TS 类型——CI 必加；`--verbose` 调试。

---

## 第三段：进阶范式

### 模式 11：Remark + 插件管线处理 Markdown

**问题场景**：Markdown 需支持 GFM / 数学公式 / 代码高亮 / 链接检查——直接 `marked` 不够。

**解决方案**：用 `unified` 生态（`remark-parse` → `remark-gfm` → `remark-math` → `remark-rehype` → `rehype-highlight`）：
```js
export default { markdown: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlight] } };
```

**关键参数**：
- `remarkPlugins`：`remark-gfm` / `remark-math` / `remark-mdx`
- `rehypePlugins`：`rehype-highlight` / `rehype-slug` / `rehype-autolink-headings`
- `shikiConfig.theme`：代码高亮主题
- `mdx` 集成
- `gfm: true`：表格 / 任务列表

**最佳实践**：配 `remark-gfm`——表格 + 任务列表；`rehype-slug` + `autolink-headings`——锚点；`rehype-highlight` 客户端高亮——不引 shiki；`shikiConfig.theme` 多主题。

---

### 模式 12：Image 组件自动优化

**问题场景**：用户传大图直接显示——首屏大、CDN 流量贵。手动用 `next/image` 风。

**解决方案**：内置 `<Image />` + `<Picture />` 组件，构建期 sharp 处理：
```astro
<Image src={import('./hero.jpg')} alt="hero" width={800} height={400} format="webp" />
```

**关键参数**：
- `<Image />`：单图优化
- `<Picture />`：多源（AVIF/WebP/JPG fallback）
- `import()` 引用：Vite 处理
- `width` / `height`：必填（防 CLS）
- `format="webp" | "avif"`

**最佳实践**：必传 `width`/`height`——避免 CLS；用 `import()` 而非字符串路径——Vite 处理；`<Picture>` 多源——AVIF 优先；`densities={[1, 2]}` 配 retina。

---

### 模式 13：I18n 国际化 + 默认 locale

**问题场景**：多语言站点——路由前缀、locale fallback、SEO hreflang。

**解决方案**：`astro.config.i18n` 配默认 locale + 路由前缀：
```js
i18n: { defaultLocale: 'en', locales: ['en', 'zh'], routing: { prefixDefaultLocale: false } }
```

**关键参数**：
- `defaultLocale`：默认
- `locales`：可用列表
- `routing.prefixDefaultLocale`：默认 locale 是否带前缀
- `Astro.currentLocale`：运行时
- `getRelativeLocaleUrl()`：URL 构造

**最佳实践**：i18n 走 config——非自建；`prefixDefaultLocale: false` 让 `/` 直接是默认；用 `getRelativeLocaleUrl` 避免硬编码；hreflang SEO 必加。

---

### 模式 14：Adapter 部署目标 Hooks

**问题场景**：不同部署平台（Vercel/Cloudflare/Node）需要不同 entrypoint 和构建产物——adapter 模式。

**解决方案**：`AstroIntegration` 暴露 `astro:config:done` / `astro:server:setup` / `astro:build:done` 钩子，adapter 改 Vite 配置 + 注入 entrypoint。

**关键参数**：
- `astro:config:done`：改 config
- `astro:server:setup`：dev server 钩子
- `astro:build:done`：构建产物
- `setAdapter(@astrojs/node)`：注册
- Vite `ssr.external` / `noExternal`

**最佳实践**：写自定义 integration 用 `defineIntegration`；`astro:config:done` 改 `vite.ssr` 配置；`astro:build:done` 注入 entrypoint；用 `addRoute` 加自定义 route。

---

### 模式 15：TypeScript 严格模式 + astro:content 类型

**问题场景**：项目用 TS 但内容（Markdown/Frontmatter）无类型——开发体验断崖。

**解决方案**：`tsconfig.json` extends `astro/tsconfigs/strict` + `astro:content` 自动生成类型：
```json
{ "extends": "astro/tsconfigs/strict", "include": [".astro/types.d.ts"] }
```

**关键参数**：
- `astro/tsconfigs/strict`：严格 TS
- `astro/tsconfigs/base`：基础
- `astro:content` 虚拟模块
- `.astro/types.d.ts`：自动生成
- `astro check`：类型检查

**最佳实践**：用 `astro/tsconfigs/strict`——最严；`astro check` CI 必跑；内容 schema 必 Zod——类型自动生成；`Astro.props` 类型化。

---

## 第四段：实战范式

### 模式 16：Content Layer 多源数据加载

**问题场景**：v5 前 content 只能从 `src/content/*.md` 读——CMS / Notion / API 不支持。

**解决方案**：v5 Content Layer 暴露 `loader` API：
```ts
const blog = defineCollection({
  loader: async () => (await fetch('https://cms.example.com/api/posts')).json(),
  schema: z.object({ title: z.string() }),
});
```

**关键参数**：
- `loader: glob({ pattern, base })`：本地
- `loader: file(...)`：单文件
- 自定义 `loader: async () => data`
- v5 替代 v4 glob loader
- 与 CMS 集成

**最佳实践**：本地 markdown 用 `glob` loader；外部 API 用 custom loader；schema 必 Zod；`getCollection('blog')` 拉全部；增量构建——`watch` 监听。

---

### 模式 17：Actions v5 + 表单提交

**问题场景**：表单提交要写 server endpoint + client fetch——重复样板。

**解决方案**：v5 `astro:actions` 暴露服务端 actions：
```ts
// src/actions/index.ts
import { defineAction } from 'astro:actions';
export const server = {
  addToCart: defineAction({ handler: async (input, ctx) => { ... } })
};
```

**关键参数**：
- `defineAction({ handler })`
- `Astro.callAction('addToCart', input)`
- 表单 `method="POST" action={actions.addToCart}`
- zod 输入校验
- 类型安全

**最佳实践**：表单提交用 actions——少写 endpoint；Zod 校验输入——`input: z.object({...})`；`ctx.locals` 拿 session；用 `Astro.getActionResult` 拿结果。

---

### 模式 18：Middleware 全局请求拦截

**问题场景**：所有请求要鉴权 / 注入 user / 改 response header——每个页面写一遍。

**解决方案**：`src/middleware.ts` 拦截所有请求：
```ts
import { defineMiddleware } from 'astro:middleware';
export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.user = await getUser(ctx.request);
  return next();
});
```

**关键参数**：
- `src/middleware.ts`：约定
- `defineMiddleware((ctx, next) => ...)`
- `Astro.locals` 类型扩展
- `sequence(m1, m2, m3)` 串行
- `ctx.request` / `ctx.cookies`

**最佳实践**：鉴权/限流放 middleware——所有路由生效；`sequence(m1, m2)` 串多个；`ctx.locals.user` 类型必扩展；`await next()` 必须——不 await 后续不跑。

---

### 模式 19：Hybrid 模式 + `prerender` 决策

**问题场景**：项目部分页静态（博客）部分 SSR（用户中心）——传统要两套部署。

**解决方案**：`output: 'hybrid'` 默认静态 + 单页 `export const prerender = false` 切 SSR。

**关键参数**：
- `output: 'static' | 'server' | 'hybrid'`
- `prerender = true` 强制预渲染
- `prerender = false` 强制 SSR
- `hybrid`：默认静态 + 单页覆盖
- 适配器必填 SSR

**最佳实践**：博客/文档 `output: 'static'`；用户中心 `output: 'server'`；混合 `hybrid` + `prerender` per-page；adapter 必选 Node/Vercel/Cloudflare 之一。

---

### 模式 20：性能优化 Zero-JS 默认 + 部分水合

**问题场景**：现代框架动辄发 100KB+ JS 到客户端——博客/文档站根本不需要。

**解决方案**：Astro 默认输出零 JS（除非 `client:*`），部分水合让"必要组件"才发 bundle。

**关键参数**：
- 零 JS 默认：HTML only
- `client:visible` 折叠组件
- `client:idle` 空闲时
- `<Image>` 组件：构建期优化
- `<ViewTransitions />`：按需

**最佳实践**：博客/文档站零 JS——Lighthouse 满分；`client:visible` 适用于评论/分享；`client:idle` 适用于分析脚本；用 `<link rel="preload">` 预加载字体。
