# vuepress - Vue 驱动的静态站点生成器与 markdown-it 管线 + 17 生命周期插件系统典范

**GitHub**: vuejs/vuepress
**Star**: 22k+
**语言**: TypeScript + JavaScript
**主题**: 静态站点生成 / markdown-it / Vite / 主题系统
**适用场景**: 文档站点 + 博客 + 技术官网 + 知识库

> vuepress 把"静态站点 + Vue 生态"做到极致——MPA 容器每个 markdown 独立 HTML，markdown-it 链式 plugin 生态，17 生命周期插件系统比 Vite 早期还细致，主题是 npm 包可继承/可发布。Vue 2 用 V1（webpack），Vue 3 用 V2（Vite）——文档站的事实标准之一。

## 第一段：基础范式（模式 1-5）

### 模式 1 · MPA 容器与多页应用

**问题场景**：传统 SPA 文档站 SEO 差、首次加载慢，需要每个文档一个独立 HTML 页面（多页应用）。

**解决方案**：VuePress 把每个 markdown 文件编译为一个独立 HTML 页面（`page.html`），但共享同一套 Vue 应用（`app.js` + `client.js`）。`createApp` 在每个页面创建 Vue 应用挂载到 `#app`。

**关键参数**：
- 多页（MPA）非 SPA
- `appEnhance` 配置
- `client.js` 客户端入口
- 每个 page 独立 HTML
- 共享 app 配置

**最佳实践**：用 VuePress 2 配 Vite；用 `appEnhance` 注册全局；用 `client.js` 做客户端逻辑；用 `head` 注入 meta；用多语言（i18n）支持多语言文档。

### 模式 2 · markdown-it 编译管线

**问题场景**：markdown 渲染需要支持扩展（代码块 / 数学公式 / 自定义容器），原生 parser 不够。

**解决方案**：VuePress 用 `markdown-it` 作核心，链式 `md.use(plugin)` 加载扩展（`markdown-it-anchor` / `markdown-it-toc` / `markdown-it-container`）。`markdown.lineNumbers` 在 build 阶段注入 line numbers。

**关键参数**：
- `markdown-it` 核心
- `md.use(plugin)` 扩展
- `markdown-it-anchor` 标题锚点
- `markdown-it-container` 自定义容器
- `lineNumbers` 编译期注入

**最佳实践**：用 `markdown-it-container` 做 `:::tip` 提示框；用 `markdown-it-mathjax3` 数学公式；用 `markdown-it-prism` 代码高亮；用 `markdown-it-emoji` emoji；扩展按需加载。

### 模式 3 · SFC 与主题系统

**问题场景**：文档站需要自定义布局 / 全局组件——硬编码到核心不灵活。

**解决方案**：VuePress 主题是 npm 包，导出 `layouts`（`Layout.vue` / `Home.vue`）+ `plugins`（如 `@vuepress/plugin-back-to-top`）。`extends: 'vuepress-theme-default'` 继承。`layouts: { 404: ... }` 自定义布局。

**关键参数**：
- `theme: 'default'`
- `theme: { name: 'reco' }`
- `layouts: { Layout, Home }`
- 主题是 npm 包
- `extends` 继承

**最佳实践**：用现成主题（`vuepress-theme-hope` / `reco` / `vuepress`）；自定义主题用 `extends`；用 `@vuepress/theme-default` 作 fallback；用 `themePlugins` 配置子插件。

### 模式 4 · 插件系统与 17 生命周期

**问题场景**：文档站需要扩展（搜索 / PWA / 分析）——核心不能装所有。

**解决方案**：VuePress 插件是 `function (app, options) => { ... }` 形式，注册 `app.use(plugin)` 触发。17 个生命周期（`onInitialized` / `onPrepared` / `onLoaded` / `extendsMarkdown` 等）。`alias` / `define` 改 webpack 别名/全局变量。

**关键参数**：
- `app.use(plugin, options)`
- 17 个生命周期
- `extendsMarkdown` 改 markdown
- `alias` / `define` 配置
- `clientAppEnhanceFiles` 客户端文件

**最佳实践**：用 `@vuepress/plugin-search` 搜索；用 `@vuepress/plugin-pwa` 离线；用 `@vuepress/plugin-medium-zoom` 图片缩放；用 `@vuepress/plugin-docsearch` Algolia；插件按域分类。

### 模式 5 · 路由与页面（Front Matter）

**问题场景**：markdown 文件要变路由（`/guide/intro.md` → `/guide/intro.html`），需要元信息（标题 / 侧边栏）。

**解决方案**：VuePress 把 `src/.../*.md` 编译为对应路径的 HTML 页面。Front Matter（YAML 头部）声明页面元信息：`title` / `sidebar` / `layout` / `permalink` 等。`path` 钩子可改路径。

**关键参数**：
- Front Matter YAML
- `title` / `sidebar` / `layout`
- `permalink: /url`
- `meta` / `tags` 自定义
- 默认路由即文件路径

**最佳实践**：用 Front Matter 配 `title` / `sidebar`；用 `permalink` 改 URL；用 `tags` / `categories` 分类；用 `sidebar: auto` 自动生成；用 `date` 配博客排序。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · 客户端文件与 clientAppEnhanceFiles

**问题场景**：需要全局注册组件、注入指令、添加全局样式——服务端构建和客户端运行时都需做。

**解决方案**：`clientAppEnhanceFiles` 数组注册客户端增强文件（`.client.ts`），运行时由 Vue 加载。`enhanceApp({ app, router, siteData })` 函数接收应用实例，类似 Vue Router 4 钩子。

**关键参数**：
- `clientAppEnhanceFiles: ['./enhance.ts']`
- `enhanceApp({ app, router })`
- 运行时加载
- 与服务端分离
- TS 友好

**最佳实践**：用 `enhance.ts` 全局注册组件；用 `app.use(VueAxios, axios)`；用 `app.component('GlobalComp', Comp)`；用 `router.beforeEach` 路由守卫；区分 client / server 文件名。

### 模式 7 · 开发服务器与 HMR

**问题场景**：开发时改 markdown / Vue 立即看到效果——需要 Vite 级别 HMR。

**解决方案**：VuePress 2 底层是 Vite。改 `.md` 文件触发 markdown-it 重编译 + HMR。改主题 / 插件代码触发 Vite HMR。`createDevServer()` 启动；`port` 配端口；`open` 自动开浏览器。

**关键参数**：
- Vite 底层
- markdown HMR
- 组件 HMR
- `createDevServer()`
- `port: 5173` 默认

**最佳实践**：用 VuePress 2.x（Vite 快）；用 `npm run docs:dev` 启动；用 `theme: devProcess` 配开发态；用 `open: true` 自动开浏览器；用 `pagePatterns` 调 glob。

### 模式 8 · 静态构建与部署

**问题场景**：写完 markdown 要生成静态 HTML 部署到 GitHub Pages / Netlify。

**解决方案**：`vuepress build src` 把所有 markdown 编译为 `src/.vuepress/dist/` 静态文件（HTML / JS / CSS / 图片）。`dest` 配输出目录；`public` 配静态资源；`head` 注入 head 标签。

**关键参数**：
- `vuepress build src`
- `.vuepress/dist/` 输出
- `dest: 'public'`
- `head: [['link', {...}]]`
- SPA / SSG 混合

**最佳实践**：输出目录用 `public`（Netlify 默认）；用 `head` 注入 favicon / og；用 `public` 放静态资源；用 GitHub Actions 自动化部署；用 CDN 加速。

### 模式 9 · 搜索（Algolia / 本地）

**问题场景**：文档站需要全文搜索——核心不能自带搜索 UI。

**解决方案**：`@vuepress/plugin-search` 提供本地搜索（生成 `search-index.json`）；`@vuepress/plugin-docsearch` 集成 Algolia（DocSearch 服务）。`searchMaxSuggestions` / `searchPlaceholder` 配 UI。

**关键参数**：
- `@vuepress/plugin-search` 本地
- `@vuepress/plugin-docsearch` Algolia
- `searchMaxSuggestions`
- `indexContent: true`
- `hotKeys: ['/']`

**最佳实践**：Algolia DocSearch 适合公开文档（免费）；本地搜索适合内部文档；用 `/` 作 hotkey；用 `indexContent: true` 索引内容；用 `customFields` 扩展索引。

### 模式 10 · Back-to-top / PWA / Medium Zoom

**问题场景**：长文档需要回顶按钮、离线访问、图片缩放——这些是常见 UX 需求。

**解决方案**：插件即装即用：
- `@vuepress/plugin-back-to-top` 回顶
- `@vuepress/plugin-pwa` Service Worker
- `@vuepress/plugin-medium-zoom` 图片缩放
- `@vuepress/plugin-copy-code` 复制代码
- `@vuepress/plugin-git` Git 提交记录

**关键参数**：
- 多个 UX 插件
- 几乎零配置
- `themePlugins` 主题插件
- 路由级 `plugins: ['xxx']`
- 站点级 `plugins: [...]`

**最佳实践**：用 `themePlugins: { backToTop: true }`；用 PWA 离线访问；用 `medium-zoom` 优化图床；用 `git` 显示更新时间；按需启用（不要全开）。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · 博客与分类（Page / Pagination）

**问题场景**：文档站要加博客模块（`/blog/` 列表 / 分页 / 分类 / 标签）。

**解决方案**：VuePress 通过 `frontmatter.permalink` + `themePlugins.blog` 或自建页面实现博客。`@vuepress/plugin-blog` 提供分类 / 分页；用 `pagination` 组件遍历页。

**关键参数**：
- Front Matter `tags` / `categories`
- `pagination` 组件
- 自定义 `pagination` 页面
- 时间排序 `date`
- per_page 分页

**最佳实践**：博客用 `vuepress-theme-hope/blog`；用 `pagination` 组件做分页；用 `tags` 列表做标签；用 `date` 排序；用 `sticky` 置顶。

### 模式 12 · 国际化（i18n）

**问题场景**：文档需要多语言（中英）——多套目录 + 切换器。

**解决方案**：`locales: { '/': { lang: 'zh-CN', title: '...' }, '/en/': { lang: 'en-US', title: '...' } }` 配多语言目录。`themeConfig.locales` 配主题级语言。`LocaleConfig` 含 `label` / `lang` / `title` / `description` / `head` 等。

**关键参数**：
- `locales: { '/': {}, '/en/': {} }`
- `themeConfig.locales`
- `label` 切换器文本
- `lang` HTML lang
- 多目录多主题

**最佳实践**：用 `locales` 配多语言；用 `themeConfig.locales` 配主题切换；`lang: 'zh-CN'` 设 HTML lang；`description` 多语言描述；用 `@vuepress/native-i18n` 主题 i18n。

### 模式 13 · 自定义容器（tip / warning / danger）

**问题场景**：markdown 写 `:::tip 提示` 这样的提示框——原生 markdown 不支持。

**解决方案**：`markdown-it-container` 插件：`md.use(container, 'tip', { validate: params => params.trim() === 'tip', render: (tokens, idx) => {...} })`。VuePress 主题默认提供 `tip` / `warning` / `danger` / `details` 容器。

**关键参数**：
- `markdown-it-container`
- `validate` 验证
- `render` 渲染
- 主题默认容器
- `:::` 三冒号语法

**最佳实践**：用默认容器（`tip` / `warning` / `danger`）；自定义容器加 `markdown-it-container`；用 `details` 做折叠；用 `code-group` 多代码块；用 `code-block` 嵌套容器。

### 模式 14 · TypeScript 与 SSR 水合

**问题场景**：VuePress 2 内部用 TS，主题/插件需 TS 支持——SSR 模式下需要正确的类型。

**解决方案**：`defineConfig` 替代 `defineConfig4VuePressV1` 配 TS 类型。`theme: 'xxx'` 字符串加载；`theme: () => import('xxx')` 动态加载。`markdown: { lineNumbers: true }` 类型安全。

**关键参数**：
- `defineConfig`
- `theme: string | (() => Promise)`
- TS 类型
- SSR 预渲染
- `clientAppEnhanceFiles` TS

**最佳实践**：用 `defineConfig` 配类型；用 `theme: 'reco'` 字符串；动态主题用 `() => import(...)`；TS 业务写在 `.client.ts`；用 `tsc --noEmit` 校验。

### 模式 15 · 性能优化（路由预加载 / SSR 缓存）

**问题场景**：文档站首屏慢 / 路由切换慢——需要预加载和缓存。

**解决方案**：
- `shouldPrefetch` 路由预取
- Vite 自动 code-split
- 静态资源 CDN
- `compress: ['gzip', 'brotli']` 压缩
- 图片懒加载 `@vuepress/plugin-medium-zoom`

**关键参数**：
- 路由级 code-split
- 静态预取
- Brotli 压缩
- 图片懒加载
- CDN 加速

**最佳实践**：用 CDN 部署（Cloudflare / Vercel）；用 Brotli 压缩；用图片懒加载；用 `prefetch` 配路由；用 `themeConfig` 配 favicon。

## 第四段：实战范式（模式 16-20）

### 模式 16 · 迁移 V1 到 V2

**问题场景**：VuePress 1（webpack）→ VuePress 2（Vite）有破坏性变更——需要升级路径。

**解决方案**：
- `theme` 配置改为 `theme: { name: 'xxx' }` 或字符串
- `@vuepress/plugin-xxx` 包名变更（去 `blog` / `medium-zoom` 等独立）
- Front Matter 不变
- `clientAppEnhanceFiles` 替代 `enhanceApp`
- 升级到 Vue 3 + Vite

**关键参数**：
- V2 是 Vue 3
- Vite 替代 webpack
- 包名简化
- `clientAppEnhanceFiles` 替代
- 破坏性变更

**最佳实践**：用 `vuepress migrate` 工具；查阅迁移指南；`@vuepress/plugin-xxx` 包名改；API 升级到 Vue 3；性能更好（Vite）；从 V1 升级到 V2。

### 模式 17 · 自定义主题开发

**问题场景**：现成主题不够用——需要写自己的主题（品牌色 / 特殊布局）。

**解决方案**：建 `vuepress-theme-mine/` 目录，包结构：
```
vuepress-theme-mine/
  package.json (name: "vuepress-theme-mine")
  layouts/
    Layout.vue
    Home.vue
    404.vue
  styles/
    index.scss
  index.js (export default { name, layouts })
```

**关键参数**：
- npm 包发布
- `layouts: { Layout, Home }`
- `extends: { Layout: 'parent-layout' }`
- `styles/config.scss` 变量
- 主题插件 `plugins: ['@vuepress/plugin-back-to-top']`

**最佳实践**：用 `vuepress-theme-hope` 作父主题；`extends` 继承；`layouts` 覆盖；用 SCSS 变量；用 VitePress 风格（但要 SSR）；用 monorepo 管理多主题。

### 模式 18 · CI/CD 与自动化部署

**问题场景**：push 触发自动部署到 GitHub Pages / Netlify / Vercel。

**解决方案**：
- **GitHub Actions**：`actions/checkout` + `npm ci` + `npm run docs:build` + `peaceiris/actions-gh-pages` 推送
- **Netlify**：`build command: npm run docs:build` + `publish dir: src/.vuepress/dist`
- **Vercel**：`build command: npm run docs:build` + `output dir: src/.vuepress/dist`
- **GitLab CI**：`.gitlab-ci.yml` 配 page 任务

**关键参数**：
- `actions-gh-pages@v3`
- `base: /repo-name/` base path
- `cname: 'docs.example.com'`
- `node-version: 18`
- `cache: 'npm'`

**最佳实践**：用 `base` 配子路径；用 `cname` 配自定义域名；用 `actions-gh-pages@v3` 推 gh-pages；用 `concurrency` 取消旧任务；用 `schedule` 定时任务。

### 模式 19 · 自定义插件实战

**问题场景**：业务需要自定义插件（如自动生成 API 文档 / 动态组件）——需要写 VuePress 插件。

**解决方案**：插件是函数：
```ts
import { definePlugin } from '@vuepress/core'
export default definePlugin({
  name: 'my-plugin',
  onInitialized: (app) => { /* ... */ },
  extendsMarkdown: (md) => { md.use(...) },
  clientAppEnhanceFiles: { name: 'client', content: '...' }
})
```

**关键参数**：
- `definePlugin`
- 17 生命周期
- `extendsMarkdown`
- `clientAppEnhanceFiles`
- `alias` / `define`

**最佳实践**：用 `definePlugin` 写；用 `extendsMarkdown` 改 markdown；用 `clientAppEnhanceFiles` 加 JS；用 `alias` / `define` 改配置；用 `name: 'my-plugin'` 标识。

### 模式 20 · 生态与竞品对比

**问题场景**：选 SSG 框架时，VuePress / VitePress / Docusaurus / Astro / Hexo 怎么选？

**解决方案**：对比矩阵：

| 框架 | 底层 | 渲染 | 适合 |
|------|------|------|------|
| VuePress 1 | webpack | SSR/SPA | 文档站 |
| VuePress 2 | Vite | SSG | 文档站 |
| VitePress | Vite | SSG | 文档站（Vue 3） |
| Docusaurus | webpack | SSG | 文档站（React） |
| Astro | Vite | 多模式 | 内容站 |
| Hexo | Node | SSG | 博客 |

**关键参数**：
- 底层：Vite / webpack / Node
- 渲染：SSG / SSR / SPA
- 框架：Vue / React / Multi
- 性能：Vite > webpack
- 生态：React > Vue

**最佳实践**：Vue 项目用 VuePress 2 或 VitePress；React 项目用 Docusaurus；内容站用 Astro（多框架）；博客用 Hexo；性能选 VitePress；选 VitePress 优于 VuePress 1。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\vuepress\`
- 主语言：TypeScript + JavaScript
- License：MIT
- 核心模块：`packages/docs/` + `packages/bundler-vite/` + `packages/bundler-webpack/` + `packages/core/`
- 关键基础设施：Vue 3 + Vite + markdown-it + markdown-it-container + SSG

**3 核心洞察**：
1. MPA + 共享 app = 文档站 SEO 友好但仍享受 Vue SPA 体验
2. 17 生命周期插件系统 = 比 Vite 早期 API 还细致的扩展点设计
3. 主题是 npm 包 = 主题可发布可继承，类似 WordPress 生态

**1 反模式**：在 VuePress 1 用 webpack 还想用 Vue 3 特性——必须升级到 V2 或换 VitePress。

**3 立刻能用**：
1. `vuepress dev src` 启动文档站
2. `markdown-it-container` + `:::tip` 自定义提示框
3. `app.use(plugin)` 注册 17 生命周期钩子
