# slate - Stripe 风格三栏 API 文档静态站点生成器（已归档）

**GitHub**: lord/slate（2026-01 已归档）
**Star**: 36.9k
**语言**: Ruby + Middleman + SCSS
**主题**: 静态站点生成 / API 文档 / 三栏布局
**适用场景**: 学习 Middleman 配置、Stripe 风格文档设计、Markdown 转 HTML、API 文档模板

---

## 第一段：基础范式

### 模式 1：Middleman vs Jekyll 选型

**问题场景**：静态站点生成器选 Jekyll（Ruby 老牌）/ Hugo（Go 极快）/ Middleman（Ruby 专业）？2014 年时这 3 个是主流。

**解决方案**：Slate 选 Middleman——比 Jekyll 配置更专业（多语言、目录索引、Sass 集成），比 Hugo 灵活（Ruby DSL），比 Hexo 早熟。

**关键参数**：
- Middleman = Ruby 静态站点生成器
- `config.rb` = 全局配置入口
- `source/index.html.md` = 用户编辑入口（双扩展名）
- 模板 = ERB（Embedded Ruby）
- 部署 = `middleman build` 输出 `build/` 目录

**最佳实践**：API 文档工具选 Middleman——配置专业、Ruby 生态成熟、SCSS 集成好。

### 模式 2：双扩展名 `.html.md`

**问题场景**：用户写 Markdown，但 Middleman 默认生成 `.html`——怎么"输入 markdown 输出 html"？

**解决方案**：`source/index.html.md` 双扩展名——`.html.md` 告诉 Middleman 解析为 markdown + 套 HTML 布局，输出 `.html`。

**关键参数**：
- 输入 = `index.html.md`
- 处理 = Middleman 识别 `html.md` → 用 markdown 解析 + html 布局
- 输出 = `build/index.html`
- 优势 = 单一文件 = 内容 + 布局声明
- 适用 = 单页面应用文档

**最佳实践**：文档站点用 `.html.md` 双扩展名——单文件搞定"内容 + 输出格式"。

### 模式 3：三栏布局 + 滚动同步

**问题场景**：Stripe 2013 发布的 API 文档成为行业标杆——左导航 + 中正文 + 右代码块 + 滚动同步，怎么实现？

**解决方案**：SCSS 3 个核心变量控制宽度——`$nav-width: 250px` / `$code-width: 250px` / `$max-width: 800px`，JS 监听滚动同步 active 状态。

**关键参数**：
- 左栏 = TOC（$nav-width: 250px）
- 中栏 = 正文（max-width: 800px）
- 右栏 = 代码（$code-width: 250px sticky）
- 同步 = ScrollSpy JS 监听滚动高亮当前章节
- 响应式 = < 1200px 折叠右栏

**最佳实践**：API 文档三栏布局 = 250 / 800 / 250 + sticky 右侧——Stripe 模式被 Stripe API / Twilio / Slack 全面采纳。

### 模式 4：Markdown 解析劫持 `<aside>`

**问题场景**：Markdown 标准无"右栏"概念——用户想在右侧展示代码示例 vs 正文，怎么办？

**解决方案**：redcarpet 解析 + 自定义扩展——`{% aside %}` 块或 `<aside>` HTML 标签劫持，转为 sticky 右栏。

**关键参数**：
- redcarpet = Ruby Markdown 解析器
- 自定义扩展 = `aside` 块 + `language-xxx` 代码块
- 输出 = `<aside class="right-code">` 注入右栏
- 优势 = 用户 Markdown 写，框架切分
- 灵活 = 支持 HTML 内联

**最佳实践**：Markdown 文档支持"右栏代码"用 redcarpet 自定义扩展——保留 Markdown 简洁 + 增强排版。

### 模式 5：Rakefile 三任务

**问题场景**：build / preview / deploy 三个动作——怎么组织命令行工具？

**解决方案**：`Rakefile` 9 行——`rake build` 调 middleman build，`rake preview` 调 middleman server，`rake deploy` 调 rsync / gh-pages。

**关键参数**：
- `rake build` = 生成静态文件
- `rake preview` = 本地预览（livereload）
- `rake deploy` = 部署到 GitHub Pages
- 扩展 = 自定义 rake task（如 `rake publish`）
- 优势 = Ruby 生态成熟

**最佳实践**：静态站点用 Rakefile 统一命令——`build / preview / deploy` 三件套标准化。

---

## 第二段：扩展范式

### 模式 6：SCSS 常量驱动响应式

**问题场景**：文档站点的左/中/右宽度要随视口调整——硬编码 250px 必然破。

**解决方案**：SCSS 3 变量 + 媒体查询——`$nav-width` / `$code-width` / `$max-width` 顶层常量，媒体查询覆盖。

**关键参数**：
- 桌面 = 250 / 800 / 250
- 平板 = 200 / 700 / 200
- 手机 = 折叠右栏，单栏布局
- 媒体查询 = `@media (max-width: 1200px)` 切换
- 优势 = 改一处生效全局

**最佳实践**：响应式布局用 SCSS 变量 + 媒体查询——避免硬编码 250px 重复。

### 模式 7：redcarpet vs kramdown

**问题场景**：Ruby Markdown 解析器选 redcarpet（C 扩展快）/ kramdown（纯 Ruby 灵活）/ CommonMarker（GitHub 风格）？

**解决方案**：Slate 选 redcarpet——速度快 + 配置丰富（自定义渲染器）+ Middleman 默认支持。

**关键参数**：
- redcarpet = C 扩展（libupskirt）
- 优势 = 自定义渲染器（HTML 输出可控）
- 替代 = kramdown（更纯 Ruby）
- 性能 = redcarpet 比 kramdown 快 5x
- 局限 = redcarpet 维护慢

**最佳实践**：Ruby Markdown 选 redcarpet——性能 + 灵活性 + Middleman 集成最好。

### 模式 8：Livereload 开发体验

**问题场景**：改 Markdown 文档，要手动 `middleman build` 才能看效果——开发体验差。

**解决方案**：Middleman `livereload` 扩展——改 `source/index.html.md` 自动 rebuild + 浏览器自动刷新。

**关键参数**：
- livereload = `middleman server` + LiveReload Chrome 扩展
- 触发 = 文件变更 watch
- 刷新 = WebSocket 推浏览器
- 优势 = 改完即看
- 性能 = 增量 rebuild 1-2 秒

**最佳实践**：文档站开发用 livereload——改 Markdown 立刻预览，迭代速度 5x。

### 模式 9：Google Analytics 集成

**问题场景**：文档站点上线后想知道访问量 / 用户行为——怎么集成 GA？

**解决方案**：Middleman `config.rb` 注入 GA 脚本——`activate :google_analytics do |ga| ga.tracking_id = 'UA-xxx' end`。

**关键参数**：
- tracking_id = GA Property ID
- 注入位置 = `</head>` 前
- 环境 = 仅 production 生效
- 替代 = Plausible / Umami（隐私友好）
- 优势 = Middleman 一行配置

**最佳实践**：文档站上线必带 GA / Plausible——访问量 + 跳出率 + 搜索词数据驱动改进。

### 模式 10：GitHub Pages 部署

**问题场景**：静态 build 后怎么部署到 GitHub Pages？

**解决方案**：`rake deploy` 调 `middleman build` → `git subtree push --prefix build origin gh-pages`——子目录推 gh-pages 分支。

**关键参数**：
- 构建 = `middleman build` 输出 `build/`
- 部署 = `git subtree push --prefix build origin gh-pages`
- CNAME = `source/CNAME` 自定义域名
- HTTPS = GitHub Pages 自动 + Let's Encrypt
- 替代 = Netlify / Vercel / Cloudflare Pages

**最佳实践**：静态文档用 GitHub Pages + subtree push——零成本 + HTTPS + 自定义域名。

---

## 第三段：进阶范式

### 模式 11：打印样式（print.css.scss）

**问题场景**：开发者在 IDE 看文档时 ctrl+P 想打印——默认打印右栏代码丢失。

**解决方案**：`print.css.scss` A4 横版优化——右栏代码 inline、中文栏变单栏、隐藏导航。

**关键参数**：
- A4 横版 = `@page { size: A4 landscape; }`
- 单栏 = 折叠三栏为单栏
- 代码 inline = `<aside>` 转为正常流
- 字体 = 10pt 黑体
- 优势 = 离线查阅

**最佳实践**：文档站必带 print.css——打印 / PDF 导出 / 离线查阅必备。

### 模式 12：多语言支持

**问题场景**：API 文档要 i18n（en / zh / ja）——Middleman 怎么处理？

**解决方案**：Middleman `i18n` 扩展——`/en/...` / `/zh/...` 子目录共享模板，`config.rb` 配置 `locales`。

**关键参数**：
- 配置 = `activate :i18n, mount_at_root: false`
- 目录 = `source/en/index.html.md` + `source/zh/index.html.md`
- 切换 = `?locale=zh` 或 `/zh/`
- 优势 = Middleman 原生支持
- 替代 = vuepress-i18n / docusaurus-i18n

**最佳实践**：国际化文档用 Middleman i18n——多语言 + 单一模板 + URL 区分。

### 模式 13：Algolia DocSearch 集成

**问题场景**：文档站点搜索——站内搜索 vs Google 搜索 vs Algolia？

**解决方案**：Algolia DocSearch 免费计划——`config.rb` 注入 `docsearch.js`，爬虫定时索引文档。

**关键参数**：
- DocSearch = Algolia 免费（开源项目）
- 注入 = `<script src="https://cdn.jsdelivr.net/npm/docsearch.js@2/dist/cdn/docsearch.min.js">`
- 配置 = apiKey / indexName / container
- 优势 = 0 成本 + 全文搜索 + 高亮
- 替代 = MeiliSearch / Elasticsearch 自建

**最佳实践**：开源文档用 Algolia DocSearch——免费 + 全文搜索 + 自动爬虫。

### 模式 14：仓库归档与社会责任

**问题场景**：原作者 lord 在 2026-01 因抗议微软与 ICE/IDF 合同，主动下线 GitHub 仓库——这是"开源维护者的权利"还是"对社区的伤害"？

**解决方案**：历史事件——`slate` 仓库被裁撤，源码迁到只读镜像 `https://code.lord.io/slate/`，社区 fork 维持维护。

**关键参数**：
- 主动归档 = 原作者选择
- 抗议 = 表达政治立场
- 替代 = 社区 fork（`slatedocs/slate` 等）
- 行业反应 = 支持 / 反对
- 长期 = 用户迁移到 Docusaurus / Mintlify

**最佳实践**：依赖单一维护者项目有"消失"风险——选有公司/基金会背书的工具，或自托管。

### 模式 15：Slate 在 2026 时代的替代

**问题场景**：Slate 2026 已停更——新项目用 Docusaurus（Meta 维护） / Mintlify（商业） / ReadMe.io（SaaS）？

**解决方案**：决策树——个人 / 小团队用 Docusaurus（免费 + MDX + React）；企业用 Mintlify（托管 + 美观）；简单用 VuePress / VitePress。

**关键参数**：
- Docusaurus = Facebook 维护 + React + MDX
- Mintlify = 商业 + 美观模板 + AI 搜索
- VuePress / VitePress = Vue 生态 + 轻量
- Slate = 历史价值 + 已停更
- 迁移成本 = Slate 主题代码需重写

**最佳实践**：新项目用 Docusaurus / Mintlify——避免选已停更的框架，承担"消失"风险。

---

## 第四段：实战范式

### 模式 16：社区复刻与维护

**问题场景**：lord 下线原仓库后，社区怎么维护？fork 怎么组织？

**解决方案**：社区 fork——`slatedocs/slate` / `centerforopenscience/slate` 等多个组织 fork 维护，PR 合并到社区版。

**关键参数**：
- 复刻 = `git clone https://github.com/slatedocs/slate`
- 维护 = 社区 PR review + release
- 主题 = 多 fork 各自改进
- 现状 = 仍可用但缺新功能
- 推荐 = Docusaurus 新建

**最佳实践**：依赖停更项目，社区 fork 是过渡方案——长期应迁到活跃维护的框架。

### 模式 17：三栏 + 滚动同步复刻

**问题场景**：想在新框架（Docusaurus / VitePress）复刻 Slate 三栏布局——怎么做？

**解决方案**：Docusaurus 主题——`docusaurus-theme-classic` + 自定义 CSS 重写 grid，`scrollspy` 监听滚动。

**关键参数**：
- Docusaurus = `themeConfig.navbar` + `docs.sidebars`
- 三栏 = CSS Grid `grid-template-columns: 250px 1fr 250px`
- 滚动同步 = `IntersectionObserver` + `scrollspy` lib
- 代码右栏 = `pre` sticky
- 总成本 = 200 行 CSS + 50 行 JS

**最佳实践**：复刻三栏布局用 Docusaurus + CSS Grid——比 Slate 现代 + 活跃维护。

### 模式 18：Stripe 风格 vs Mintlify 风格

**问题场景**：Stripe 风格（三栏） vs Mintlify 风格（双栏 + AI 搜索）哪个好？

**解决方案**：选型——传统 API 文档用 Stripe 风格（用户习惯）；现代 SaaS 用 Mintlify 风格（双栏 + AI 搜索 + 美观）。

**关键参数**：
- Stripe = 三栏 / 经典 / 2013 标杆
- Mintlify = 双栏 / 现代 / 2021 标杆
- 用户体验 = Mintlify 移动端更好
- 开发体验 = Docusaurus 框架 + Mintlify 主题
- 选择 = 看用户群 + 设计偏好

**最佳实践**：API 文档选 Mintlify 风格（双栏 + AI 搜索）——移动端友好 + 用户期望变化。

### 模式 19：.html.md vs MDX

**问题场景**：Slate 的 `.html.md` 限制（仅 HTML 内联）vs Docusaurus 的 MDX（React 组件）？

**解决方案**：决策——简单文档用 `.html.md`；复杂交互（图表、API playground）用 MDX。

**关键参数**：
- `.html.md` = HTML 内联（`<aside>` `<div>`）
- MDX = Markdown + JSX（`<APIPlayground>` `<Chart>`）
- 学习曲线 = MDX 较陡
- 适用 = 简单选 html.md / 交互选 MDX
- 趋势 = MDX 成为 2026 标准

**最佳实践**：现代文档用 MDX——支持交互组件 + JSX 表达式 + GraphQL playground。

### 模式 20：7 天复刻 mini-Slate 路线（VitePress 版）

**问题场景**：想理解 Slate 架构但 Ruby 工具链门槛高；想用现代栈（VitePress）复刻三栏。

**解决方案**：7 天 MVP——Day 1-2 VitePress 初始化 + 主题，Day 3 三栏 CSS Grid，Day 4 Markdown 内容，Day 5 滚动同步 JS，Day 6 Algolia 搜索，Day 7 GitHub Pages 部署。

**关键参数**：
- 核心 = CSS Grid 三栏 + ScrollSpy
- 框架 = VitePress（Vue 生态）
- 内容 = Markdown 单一源
- 部署 = Vercel / Netlify
- 复刻难度 = 主题代码 200 行

**最佳实践**：复刻 Slate 三栏用 VitePress + CSS Grid——比 Middleman 现代 5x，部署更简单。

---

## 附录：3 个核心历史文件

1. `source/index.html.md` — 双扩展名入口（Markdown + HTML 布局）
2. `source/stylesheets/screen.css.scss` — 整页三栏 SCSS（$nav-width / $code-width / $max-width）
3. `source/layouts/layout.erb` — ERB 模板（导航 + 正文 + 代码三栏）

## 一句话总结

slate = Middleman + redcarpet + `.html.md` 双扩展名 + SCSS 三栏（250/800/250）+ ScrollSpy 滚动同步 + Algolia DocSearch，把"Stripe 风格 API 文档"做到 2014-2026 行业标杆；2026-01 因原作者抗议微软而下线，但设计思想（Docusaurus / Mintlify）继续被新框架继承。
