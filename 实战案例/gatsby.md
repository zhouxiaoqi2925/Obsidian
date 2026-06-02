# gatsby - React 静态/混合站点生成器

**GitHub**: gatsbyjs/gatsby
**Star**: 55k+
**语言**: JavaScript / TypeScript
**主题**: static-site-generator / react-framework / graphql-data-layer
**适用场景**: 营销站 / 博客 / Documentation / 内容驱动 SaaS

---

## 第一段：基础范式

### 模式 1 - 双图模型（数据图 + 页面图）

**问题场景**：传统 SSG（Next.js / Hugo）数据源和页面模板紧耦合，每加一个数据源要重写模板；Gatsby 想让"任意数据源 → 任意页面"完全解耦。

**解决方案**：双图抽象 — 数据图（`Store / Nodes` 持有所有数据，schema-inferred GraphQL 类型）+ 页面图（`Page` 对象持有 path + component + context）。构建时把数据图按页面图重投影，组件用 GraphQL 拉数据。

**关键参数**：
- `Store` 是单例，存所有 sourceNodes 注册的 nodes
- `Schema` 通过 `inferSchema` 推断 GraphQL 类型
- `Page` = `{ path, component, context }`
- `createPage({ path, component, context })` 在 `gatsby-node.js` 注册页面

**最佳实践**：数据图思维 — "所有数据都进 Store，所有页面都通过 GraphQL 拉"；避免在 component 里直接 fetch；`context` 是 createPage 时的注入数据（分页、tag 等）。

### 模式 2 - Plugin 体系（source / transformer / generator）

**问题场景**：50+ 数据源（Markdown / CMS / API / DB），20+ 转换（YAML / MDX / 图像处理），30+ 优化（sourcemap / chunking），手写 100+ 配置不现实。

**解决方案**：三段式 plugin 体系：
- `source-*`：把外部数据拉入 Store（filesystem / wordpress / contentful）
- `transformer-*`：在 Store 内转换（remark / sharp / yaml）
- `gatsby-plugin-*`：构建期钩子（sitemap / manifest / offline）

**关键参数**：
- `gatsby-config.js` 的 `plugins: [{ resolve: 'gatsby-source-filesystem', options: { path: './content' } }, ...]`
- `createTypes` / `createSchemaCustomization` 扩展 schema
- plugin 通过 `onCreateNode` / `sourceNodes` 钩子接入

**最佳实践**：项目内 90% plugin 来自官方；自写 plugin 时遵守 hooks 命名（`onCreateNode` / `createPages`）；plugin 间用 schema 传递数据，避免硬编码。

### 模式 3 - GraphQL 数据层（schema 推断）

**问题场景**：每个数据源有自己的字段（Markdown 有 frontmatter，WordPress 有 post_meta），业务组件不想知道来源细节。

**解决方案**：Gatsby 在构建期把所有 nodes 的字段合并推断成 GraphQL schema。`createTypes` 显式扩展，`createSchemaCustomization` 自定义。

**关键参数**：
- `inferObjectStructureFromNodes` 自动推断
- `createTypes(`
  `` type Mdx implements Node { slug: String! title: String } ``
  `)`
- `@link(by: "id")` 跨类型引用
- `childMarkdownRemark` parent/child 自动关联

**最佳实践**：用 `createTypes` 显式声明优于自动推断（避免拼写错不报错）；cross-type 引用用 `@link`；大对象用 `@dontInfer` 关闭自动推断以加速构建。

### 模式 4 - 约定式页面（src/pages）

**问题场景**：每个页面都要 `createPage` 配置 100 个文件，繁琐。

**解决方案**：`src/pages/` 目录下的 .js 文件自动成为路由（index.js → /，about.js → /about）。MDX 走 `src/pages/blog/*.mdx` 同样自动路由。

**关键参数**：
- `src/pages/{about,index,blog}.js` 自动建路由
- `gatsby-plugin-page-creator` 实现约定
- 客户端 `<Link to="/about">` SPA 跳转
- `gatsby-browser.js` 配 `wrapPageElement`

**最佳实践**：静态路由用约定式（`src/pages/`），动态路由用 `createPage`（`/{year}/{slug}`）；`createPage` 配合 `gatsby-node.js` 的 `createPagesStatefully`。

### 模式 5 - Webpack 5 + 构建管线

**问题场景**：React + CSS Modules + 图像 + TypeScript + GraphQL，多个 loader 串起来手工配。

**解决方案**：Gatsby 内部用 webpack 5 + 自定义 loader/插件。`babel-plugin-remove-graphql-queries` 把组件内的 `graphql\`...\`` 编译期替换为静态 JSON 引用。

**关键参数**：
- `loaders.js` 集中管理 webpack rules
- `graphql` 标签编译为 `useStaticQuery` 调用
- `static query` 编译为静态 import
- 图像 loader 转 `<picture>` 多格式 + srcset

**最佳实践**：不要在 Gatsby 写自定义 webpack 配置（升级会破坏）；自定义 build 用 `onCreateWebpackConfig` 钩子（合规且兼容升级）；TS / CSS Modules 走约定启用。

---

## 第二段：扩展范式

### 模式 6 - 增量构建（Incremental Builds）

**问题场景**：5000 篇文章博客，全量构建 30 分钟；改 1 篇要重跑 30 分钟不可接受。

**解决方案**：增量构建 — 改 1 篇文章时只重建该 page + 受影响的下游（page-data.json + html + JS chunk）。`gatsby build --incremental` + LMDB 持久化 store。

**关键参数**：
- `.cache/` 目录存 LMDB 数据库（nodes / page-data）
- `data.json` 是 manifest，标记 dirty
- `--incremental` 模式只重 build 脏 page
- `gatsby-plugin-no-sourcemaps` 加速

**最佳实践**：增量构建需先跑过全量构建生成 cache；CI 用 `actions/cache@v2` 缓存 `.cache/`；改 schema 后必须清 cache 重 build；商用 Gatsby Cloud 增量效果最好。

### 模式 7 - DSG（Deferred Static Generation）

**问题场景**：5000 页博客，前 100 页常被访问，后 4900 页 90% 流量是 0；全部 SSG 浪费构建时间。

**解决方案**：DSG — `createPage({ ..., defer: true })` 标记 page 为"按需构建"，用户首次访问时 SSR 生成 + CDN 缓存。`gatsby build` 阶段不生成 HTML，runtime 触发。

**关键参数**：
- `defer: true` 在 createPage 选项
- 配置 `adapter: '@gatsbyjs/adapter-netlify'`
- CDN edge function 接管
- 命中后变为永久缓存

**最佳实践**：电商商品详情页 / 长尾博客用 DSG；前 100 高频页用 SSG；DSG 需要 CDN 支持（Netlify / Gatsby Cloud）；自定义 adapter 实现自托管。

### 模式 8 - SSR 与 Functions

**问题场景**：SSG 不适合登录后页面（用户私有），DSG 适合首访拉新 SSR 适合登录态。

**解决方案**：Gatsby Functions（基于 serverless）写 `src/api/*.js` 自动成为 API 端点；`getServerData` 在 page 组件中拉取服务端数据。

**关键参数**：
- `src/api/hello.js` → `GET /api/hello`
- `getServerData` 在 page 的 export 函数中
- Functions 部署到 Gatsby Cloud / Netlify
- 环境变量走 `GATSBY_*` 前缀

**最佳实践**：Gatsby Functions 比自建 serverless 简单；登录态 / 表单提交用 Functions；用 `gatsby-plugin-create-client-paths` 配 SPA fallback。

### 模式 9 - 图像优化（gatsby-plugin-image）

**问题场景**：图片是页面大小头号元凶（占 60% 流量），需要 AVIF / WebP / 多尺寸 / lazy load。

**解决方案**：`gatsby-plugin-image` + `gatsby-plugin-sharp` 自动生成多尺寸 + 现代格式 + `<picture>` 元素 + 模糊占位。

**关键参数**：
- `<StaticImage src="./cat.jpg" placeholder="blurred" formats={['AUTO', 'WEBP', 'AVIF']} />`
- `<GatsbyImage image={getImage(data.file)} />`
- 模糊占位：低分辨率 base64
- `sizes` 属性按视口加载

**最佳实践**：所有图片走 `StaticImage` / `GatsbyImage`（不用 `<img>`）；`placeholder="blurred"` 提升感知性能；CI 缓存 `.cache/transforms/` 加速；远程图配 `gatsbyImageData` resolver。

### 模式 10 - Head API（gatsby-script / Head export）

**问题场景**：SSG 站点 SEO 要求 `<title> / <meta> / <link>` 在 head，React 18 后服务端注入 head 困难。

**解决方案**：Head API — `export const Head = () => <><title>xxx</title>...</>` 在 page 顶层导出；构建期提取到 HTML head。

**关键参数**：
- `export const Head` (Gatsby v4.19+)
- `<title> / <meta name="description" />` 自动注入
- `useStaticQuery` 在 Head 内可用
- `gatsby-plugin-react-helmet` 兼容老代码

**最佳实践**：每个 page 写 `Head` 组件而非用 react-helmet；动态 meta 配 `useStaticQuery`；OG 图用 `getImage` + 静态化。

---

## 第三段：进阶范式

### 模式 11 - State Machine 驱动（xState）

**问题场景**：build / develop / deploy 流程复杂，串行步骤多（init → load config → load plugins → bootstrap → start server），出错时状态难恢复。

**解决方案**：xState 状态机 — `packages/gatsby/src/state-machines/build/index.ts` 把 build 拆成 20+ states，transitions 严格定义。错误时进入 `failed` 状态可恢复。

**关键参数**：
- `Machine({ id: 'build', initial: 'initializing', states: { ... } })`
- `invoke` 异步操作
- `services` 副作用
- `actions` / `guards` / `delays`

**最佳实践**：复杂流程用 xState 比 if-else 状态机可读性高 10x；可单元测试（machine.send + expect）；可可视化（stately inspector）。

### 模式 12 - LMDB 持久化 Store

**问题场景**：构建期 50000+ nodes 在内存，OOM 风险；增量构建需要跨次持久化。

**解决方案**：LMDB（Lightning Memory-Mapped Database）— 嵌入式 KV 库，写时映射到磁盘，读时 mmap 零拷贝。

**关键参数**：
- `gatsby/src/datastore/lmdb/lmdb-datastore.ts`
- key 编码：`/nodes/${id}` `/nodesByType/${type}/${id}`
- 事务：原子 batch write
- mmap 内存映射

**最佳实践**：大状态数据用 LMDB / SQLite / Badger 嵌入式 KV；mmap 适合读多写少；事务保证构建中断时一致。

### 模式 13 - Worker 池分页查询

**问题场景**：50000 篇文章 GraphQL 查询慢，单进程扛不住。

**解决方案**：Worker 池 + LMDB shared store — `WorkerPool` 启动 N 个 Node.js worker，每个 worker 独立处理 query，LMDB mmap 共享数据。

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
- `createContentDigest(obj)` 内容哈希（用于增量）
- `actions.createNode({ ...obj, id, internal: { type: 'NotionPage', contentDigest } })`
- `createSchemaCustomization` 声明类型

**最佳实践**：第三方数据源写 source 插件（`gatsby-source-notion-api`）；自用数据可直接 `sourceNodes` 内联；用 `createContentDigest` 启用增量。

### 模式 15 - 部署适配器（Adapters）

**问题场景**：Gatsby 构建产物（HTML + JS + assets）需要部署到 Netlify / Vercel / S3 / Cloudflare Pages，各自目录结构不同。

**解决方案**：Adapters（v5）— `@gatsbyjs/adapter-netlify` / `@adapter-vercel` / `@adapter-static` 各自处理产物路由 + functions 上传 + headers 配置。

**关键参数**：
- `gatsby-config.js` `adapter: require('@gatsbyjs/adapter-netlify')`
- `headers` / `redirects` / `functions`
- 自定义 adapter 实现 `adapter.activity`
- 适配 CDN 缓存策略

**最佳实践**：商用 Gatsby 5 必选 adapter；Netlify / Vercel 现成；自托管用 `@adapter-static`；自定义需求写 adapter 而非 `onPostBuild`。

---

## 第四段：实战范式

### 模式 16 - Contentful 集成（Headless CMS）

**问题场景**：营销团队用 Contentful 写文章，开发不想直接调 Contentful API。

**解决方案**：`gatsby-source-contentful` 自动拉取 Contentful entries + assets，生成 GraphQL types，构建期全量同步。

**关键参数**：
- `gatsby-source-contentful` 配置 accessToken + spaceId
- `allContentfulBlogPost { nodes { title slug body { raw } } }`
- 预览 API `gatsby-source-contentful` `host: preview.contentful.com`
- `gatsby-plugin-contentful-rich-text` 渲染 RichText

**最佳实践**：Contentful / Sanity / Strapi 是 Content-as-a-Service 主流；Gatsby 是中间层把 CMS 数据变成静态站；预览模式用 preview API + draft mode。

### 模式 17 - 国际化站点（gatsby-plugin-react-i18next）

**问题场景**：多语言站点需要 URL 区分语言（`/en/about` / `/zh/about`），且 i18n 资源在构建期打包。

**解决方案**：`gatsby-plugin-react-i18next` 配 i18next，自动从 `locales/{lang}/*.json` 拉资源，支持 SSR 注入。

**关键参数**：
- `gatsby-config.js` 配 `gatsby-plugin-react-i18next`
- `useTranslation()` 钩子
- `Link` 配 `language` prop 自动加前缀
- `gatsby-node.js` `onCreatePage` 创建多语言 page

**最佳实践**：URL 路径加语言前缀（`/en/` / `/zh/`）便于 SEO；hreflang 标签必加；翻译资源走 i18next 异步加载。

### 模式 18 - 性能优化清单

**问题场景**：SSG 站点首屏 Lighthouse 跑分 < 90，需要系统优化。

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
- LCP < 2.5s
- FID < 100ms
- CLS < 0.1
- Lighthouse > 90

**最佳实践**：SSG 性能优化核心是"减少首屏资源 + 缓存策略"；CDN edge 命中率 > 95% 是关键；用 `web-vitals` 上报真实用户数据。

### 模式 19 - Debug 技巧

**问题场景**：构建报错 `GraphQL error: Cannot read property 'fields' of undefined` 难定位。

**解决方案**：
- `gatsby develop` 启 GraphiQL IDE（`http://localhost:8000/___graphql`）
- `gatsby clean` 清 `.cache/`
- `DEBUG=gatsby:* gatsby develop` 详细日志
- 浏览器 Console 跑 `___loader.require('core/render').getPageResources()`

**关键参数**：
- `.cache/` 是 build 中间产物
- `public/` 是最终产物
- `process.env.NODE_ENV` 切 dev / prod
- 内存泄漏看 LMDB 增长

**最佳实践**：Gatsby debug 工具链：GraphiQL / `gatsby clean` / `DEBUG` / browser DevTools；用 `gatsby --verbose` 看完整日志；CI 缓存 `.cache/` 但出问题时清。

### 模式 20 - 迁移到 Next.js / Astro

**问题场景**：Gatsby 5 已被 Netlify 收编，社区活跃度下降，新项目在选 Gatsby / Next.js / Astro。

**解决方案**：迁移路径：
- Gatsby → Next.js：`createPages` 移 `getStaticProps`，`gatsby-node.js` 移 `next.config.js`，source 插件换成 API route
- Gatsby → Astro：SSG 部分易迁，React 组件变 Astro frontmatter + island

**关键参数**：
- Next.js 12+ 配 `output: 'export'` 类似 Gatsby
- Astro 0.x → 4.x Islands 架构更省 JS
- Gatsby 商业支持（Netlify）vs Next.js 商业支持（Vercel）

**最佳实践**：新项目首选 Next.js（生态最大 + Vercel 部署最简）；内容站 + 极少 JS 选 Astro；维护中 Gatsby 项目不急着迁；增量迁移按页面粒度而非整站。
