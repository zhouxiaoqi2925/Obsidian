# gatsbyjs - Gatsby.js v5 静态/混合站点生成器

**GitHub**: gatsbyjs/gatsby
**Star**: 55k+
**语言**: JavaScript / TypeScript
**主题**: static-site-generator / react-framework / graphql-data-layer
**适用场景**: 营销站 / 博客 / 文档站 / 内容驱动 SaaS（v5 引入 DSG + Functions）

---

## 第一段：基础范式

### 模式 1 - v5 三种渲染模式

**问题场景**：v4 只有 SSG 一种渲染模式，所有 page 在 build 时全量生成；5000 页博客 30 分钟构建 + 大量存储空间。

**解决方案**：v5 引入三种模式：
- **SSG**：所有 page build 时生成 HTML（默认）
- **DSG**（Deferred Static Generation）：build 时不生成，首访 SSR + CDN 缓存
- **SSR**（Functions + getServerData）：每请求服务端渲染

`createPage({ ..., defer: true })` 触发 DSG；adapter 处理产物上传。

**关键参数**：
- `defer: true` 在 createPage 选项
- `getServerData` 触发 SSR
- `@gatsbyjs/adapter-netlify` / `@adapter-vercel` / `@adapter-static`
- `adapter` 必填（Gatsby 5 强约束）

**最佳实践**：营销首页用 SSG（首屏速度）；电商 SKU / 长尾博客用 DSG（节省构建时间）；登录后 dashboard 用 SSR；用 adapter 标准化部署。

### 模式 2 - 双图模型深化

**问题场景**：50+ 数据源 + 100+ 页面模板 + 跨类型关联，手工拼装数据流难维护。

**解决方案**：双图抽象 — Store（数据图，存 sourceNodes + LMDB 持久化）+ Page（页面图，path + component + context）。`createPage` 在数据图上"投影"出页面，组件用 `pageQuery` / `useStaticQuery` 拉数据。

**关键参数**：
- `Store` 单例 + `.cache/lmdb-data`
- `Page { path, component, context }`
- `createPage` API
- `pageQuery` 编译期执行（构建期报错）

**最佳实践**：所有数据进 Store，组件只走 GraphQL 拉；`context` 传分页 / tag 过滤；`createSchemaCustomization` 显式声明 types（避免拼写错）。

### 模式 3 - Plugin 体系

**问题场景**：50+ 数据源 + 30+ 转换 + 20+ 优化，零散配置不可维护。

**解决方案**：
- `source-*`（拉数据入 Store）
- `transformer-*`（在 Store 内转换）
- `gatsby-plugin-*`（构建期钩子）

**关键参数**：
- `gatsby-config.js` `plugins: [{ resolve, options }]`
- `sourceNodes` / `onCreateNode` / `createPages` 钩子
- `createTypes` / `createSchemaCustomization`

**最佳实践**：90% 用官方 plugin；自写 plugin 走 hook 协议；`@link(by: "id")` 跨类型引用优于自建关联。

### 模式 4 - GraphQL Schema 推断

**问题场景**：组件不想知道数据来源（Markdown / Contentful / API），需要统一查询接口。

**解决方案**：构建期把所有 nodes 字段合并推断成 GraphQL schema。

**关键参数**：
- 自动 schema 推断（`inferObjectStructureFromNodes`）
- `createTypes(graphql` ` type Mdx implements Node { slug: String! } ` `)`
- `@link(by: "id", from: "author")` 跨引用
- `childMarkdownRemark` / `parent` 自动关联

**最佳实践**：显式 schema 优于自动推断（类型安全）；大数据集 `@dontInfer` 关闭推断加速；`@searchable` 加 Algolia 索引（plugin 形式）。

### 模式 5 - Head API（v4.19+）

**问题场景**：SEO 需 `<title> / <meta> / <link>` 在 HTML head，React 18 后服务端注入难。

**解决方案**：`export const Head = () => <><title>xxx</title>...</>` 在 page 顶层导出；构建期提取到 head。

**关键参数**：
- `export const Head` (v4.19+)
- `<title> / <meta name="description" />` 自动注入
- `useStaticQuery` 在 Head 内可用
- `gatsby-plugin-react-helmet` 兼容老代码

**最佳实践**：每个 page 写 `Head` 组件；动态 meta 配 `useStaticQuery`；OG 图 `getImage` + 静态化。

---

## 第二段：扩展范式

### 模式 6 - DSG（Deferred Static Generation）

**问题场景**：5000 页博客，前 100 页常被访问，后 4900 页 90% 流量是 0；全 SSG 浪费构建时间 + 存储。

**解决方案**：`createPage({ ..., defer: true })` 标记 page 为"按需构建"，首访时 SSR 生成 + CDN 缓存。`gatsby build` 阶段不生成 HTML，runtime 触发。

**关键参数**：
- `defer: true` 在 createPage 选项
- `@gatsbyjs/adapter-netlify` 配 edge function
- 命中后永久缓存
- 同一 page 可混合 SSG / DSG / SSR

**最佳实践**：电商商品详情页 / 长尾博客用 DSG；前 100 高频页用 SSG；DSG 需 CDN 支持（Netlify / Vercel / Gatsby Cloud）；监控首访延迟（DSG 命中前慢）。

### 模式 7 - 增量构建（Incremental Builds）

**问题场景**：5000 篇文章全量构建 30 分钟；改 1 篇要 30 分钟不可接受。

**解决方案**：`gatsby build --incremental` + LMDB `.cache/` 持久化 store。脏 page + 受影响下游（page-data.json + html + JS chunk）重 build。

**关键参数**：
- `.cache/` 存 LMDB nodes / page-data
- `data.json` manifest 标 dirty
- `--incremental` 模式只重 build 脏 page
- `createContentDigest` 触发增量判断

**最佳实践**：CI 缓存 `.cache/`（GitHub Actions `actions/cache`）；改 schema 后必须 `gatsby clean` + 全量；商用 Gatsby Cloud 增量效果最好。

### 模式 8 - 图像优化（gatsby-plugin-image）

**问题场景**：图片占 60% 流量，需要 AVIF / WebP / 多尺寸 / lazy load / blur placeholder。

**解决方案**：`gatsby-plugin-image` + `gatsby-plugin-sharp` 自动生成多尺寸 + 现代格式 + `<picture>` + 模糊占位。

**关键参数**：
- `<StaticImage placeholder="blurred" formats={['AUTO','WEBP','AVIF']} />`
- `<GatsbyImage image={getImage(data.file)} />`
- `sizes` 属性按视口加载
- `quality` 默认 50

**最佳实践**：所有图走 `StaticImage` / `GatsbyImage`（不用 `<img>`）；`placeholder="blurred"` 提升感知性能；CI 缓存 `.cache/transforms/` 加速。

### 模式 9 - Functions 与 SSR

**问题场景**：登录后页面 / 表单提交 / API 代理，SSG 满足不了。

**解决方案**：Gatsby Functions — `src/api/*.js` 自动成为 serverless 端点；`getServerData` 在 page 组件中拉服务端数据。

**关键参数**：
- `src/api/hello.js` → `GET /api/hello`
- `getServerData` 在 page export
- Functions 部署到 Gatsby Cloud / Netlify / Vercel
- 环境变量 `GATSBY_*` 前缀

**最佳实践**：Gatsby Functions 适合轻量 BFF（< 5s）；重型用独立后端；登录态 + 表单走 Functions；`gatsby-plugin-create-client-paths` 配 SPA fallback。

### 模式 10 - 约定式路由

**问题场景**：100 个静态页面手写 `createPage` 痛苦。

**解决方案**：`src/pages/{about,index}.js` 自动变路由；`src/pages/blog/*.mdx` MDX 同样自动。`gatsby-plugin-page-creator` 实现。

**关键参数**：
- 文件路径 → URL 映射
- `<Link to="/about">` SPA 跳转
- `wrapPageElement` / `wrapRootElement` 全局包裹
- 动态路由 `createPage` + `gatsby-node.js`

**最佳实践**：静态路由走约定（`src/pages/`）；动态（`/{year}/{slug}`）走 `createPage`；`gatsby-browser.js` `onRouteUpdate` 配 page transition。

---

## 第三段：进阶范式

### 模式 11 - State Machine 驱动（xState）

**问题场景**：build / develop 流程复杂（init → load config → load plugins → bootstrap → start server），错误状态难恢复。

**解决方案**：xState 状态机 — `state-machines/build/index.ts` 把 build 拆成 20+ states，transitions 严格定义。错误进入 `failed` 状态可恢复。

**关键参数**：
- `Machine({ id: 'build', initial: 'initializing', states: { ... } })`
- `invoke` 异步操作
- `services` 副作用
- `actions` / `guards` / `delays`

**最佳实践**：复杂流程用 xState 比 if-else 可读性高 10x；machine.send + expect 单测；stately inspector 可视化。

### 模式 12 - LMDB 持久化 Store

**问题场景**：构建期 50000+ nodes 在内存 OOM；增量构建需要跨次持久化。

**解决方案**：LMDB — 嵌入式 KV 库，写时映射到磁盘，读时 mmap 零拷贝。

**关键参数**：
- `lmdb-datastore.ts` 单例
- key 编码：`/nodes/${id}` `/nodesByType/${type}/${id}`
- 事务原子 batch write
- mmap 内存映射

**最佳实践**：大状态数据用 LMDB / SQLite / Badger 嵌入式 KV；mmap 适合读多写少；事务保证构建中断时一致。

### 模式 13 - Worker 池分页查询

**问题场景**：50000 篇文章 GraphQL 查询慢，单进程扛不住。

**解决方案**：Worker 池 + LMDB shared store — `WorkerPool` 启动 N 个 Node.js worker，每个 worker 处理 query 切片，LMDB mmap 共享数据。

**关键参数**：
- `workerpool` 库
- 主进程 pool size = CPU 核数 - 1
- 每个 worker 拉自己分片
- 结果 reduce 回主进程

**最佳实践**：CPU 密集任务用 worker 池；shared mmap 替代 RPC；大查询先分页；Sourcemap 生成用 worker 并行。

### 模式 14 - Source 插件开发

**问题场景**：接入新数据源（Notion DB / Airtable / Linear），手写 fetch + 解析 + 注册 node 重复劳动。

**解决方案**：`sourceNodes` API — `exports.sourceNodes = async ({ actions, createNodeId, createContentDigest }, { apiKey }) => { ... }`，fetch + transform + `actions.createNode`。

**关键参数**：
- `createNodeId('NotionPage-' + id)` 唯一 id
- `createContentDigest(obj)` 内容哈希
- `actions.createNode({ ...obj, id, internal: { type, contentDigest } })`
- `createSchemaCustomization` 声明类型

**最佳实践**：第三方数据源写 source plugin；自用数据可内联 `sourceNodes`；`createContentDigest` 启用增量。

### 模式 15 - 部署适配器（Adapters）

**问题场景**：构建产物部署到 Netlify / Vercel / S3 / Cloudflare Pages 各异。

**解决方案**：Adapters（v5）— `@gatsbyjs/adapter-netlify` / `@adapter-vercel` / `@adapter-static` 各自处理产物路由 + functions 上传 + headers。

**关键参数**：
- `gatsby-config.js` `adapter: require('@gatsbyjs/adapter-netlify')`
- `headers` / `redirects` / `functions`
- 自定义 adapter 实现 `adapter.activity`
- 适配 CDN 缓存策略

**最佳实践**：Gatsby 5 必选 adapter；Netlify / Vercel 现成；自托管用 `@adapter-static`；自定义需求写 adapter 而非 `onPostBuild`。

---

## 第四段：实战范式

### 模式 16 - Contentful 集成

**问题场景**：营销团队用 Contentful 写文章，开发不想直接调 Contentful API。

**解决方案**：`gatsby-source-contentful` 自动拉取 Contentful entries + assets，生成 GraphQL types，构建期全量同步。

**关键参数**：
- 配 `accessToken` + `spaceId`
- `allContentfulBlogPost { nodes { title slug } }`
- 预览 API `host: preview.contentful.com`
- `gatsby-plugin-contentful-rich-text` 渲染 RichText

**最佳实践**：Contentful / Sanity / Strapi 是 CaaS 主流；预览模式用 preview API + draft mode；webhook 触发 Gatsby Cloud rebuild。

### 模式 17 - 国际化（gatsby-plugin-react-i18next）

**问题场景**：多语言站点 URL 区分（`/en/about` / `/zh/about`），i18n 资源构建期打包。

**解决方案**：`gatsby-plugin-react-i18next` 配 i18next，自动从 `locales/{lang}/*.json` 拉资源，支持 SSR 注入。

**关键参数**：
- `gatsby-config.js` 配 plugin
- `useTranslation()` 钩子
- `Link` 配 `language` prop 加前缀
- `onCreatePage` 创建多语言 page

**最佳实践**：URL 路径加语言前缀（`/en/` / `/zh/`）便于 SEO；hreflang 标签必加；翻译资源异步加载。

### 模式 18 - 性能优化清单

**问题场景**：SSG 站点首屏 Lighthouse < 90。

**解决方案**：10 条核心优化：
1. 图像全走 `GatsbyImage`（AVIF + blur placeholder）
2. `gatsby-plugin-preload-fonts` 字体 preload
3. Critical CSS 内联（`gatsby-plugin-inline-critical-css`）
4. JS chunk 分割（路由级 + 组件级）
5. `preconnect` CDN
6. `gatsby-plugin-manifest` PWA
7. 静态资源 `Cache-Control: public, max-age=31536000, immutable`
8. `defer` / `async` 第三方脚本
9. `IntersectionObserver` 懒加载
10. CDN edge cache + Brotli

**关键参数**：
- LCP < 2.5s / FID < 100ms / CLS < 0.1
- Lighthouse > 90
- RUM 真实用户监控

**最佳实践**：SSG 性能核心 = "减少首屏资源 + 缓存策略"；CDN edge 命中率 > 95%；`web-vitals` 上报 RUM。

### 模式 19 - Debug 技巧

**问题场景**：`GraphQL error: Cannot read property 'fields' of undefined` 难定位。

**解决方案**：
- `gatsby develop` 启 GraphiQL IDE（`http://localhost:8000/___graphql`）
- `gatsby clean` 清 `.cache/`
- `DEBUG=gatsby:* gatsby develop` 详细日志
- 浏览器 Console `___loader.require('core/render').getPageResources()`

**关键参数**：
- `.cache/` 中间产物 / `public/` 最终产物
- `process.env.NODE_ENV` 切 dev / prod
- 内存泄漏看 LMDB 增长

**最佳实践**：debug 工具链 GraphiQL / `gatsby clean` / `DEBUG` / DevTools；`gatsby --verbose` 看完整日志；CI 缓存 `.cache/` 但出问题时清。

### 模式 20 - 迁移到 Next.js / Astro

**问题场景**：Gatsby 5 被 Netlify 收编，社区活跃度下降，新项目在选 Gatsby / Next.js / Astro。

**解决方案**：迁移路径：
- Gatsby → Next.js：`createPages` 移 `getStaticProps`，`gatsby-node.js` 移 `next.config.js`，source 插件换 API route
- Gatsby → Astro：SSG 部分易迁，React 组件变 Astro frontmatter + island

**关键参数**：
- Next.js 12+ `output: 'export'` 类似 Gatsby
- Astro 4.x Islands 架构更省 JS
- Gatsby 商业支持（Netlify）vs Next.js（Vercel）

**最佳实践**：新项目首选 Next.js（生态最大 + Vercel 部署最简）；内容站 + 极少 JS 选 Astro；维护中 Gatsby 不急着迁；按页面粒度迁移而非整站。
