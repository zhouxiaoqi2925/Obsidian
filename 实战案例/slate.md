# slate - Stripe 风格三栏 API 文档静态站点生成器（已归档）

**GitHub**: lord/slate（2026-01 已归档）
**Star**: 36.9k
**语言**: Ruby + Middleman + SCSS
**主题**: 静态站点生成 / API 文档 / 三栏布局
**适用场景**: 学习 Middleman 配置、Stripe 风格文档设计、Markdown 转 HTML、API 文档模板

---

## 第一段：站点骨架 - Middleman 与双扩展名

### 模式 1：Middleman vs Jekyll 选型

**问题场景**：静态站点生成器选 Jekyll（Ruby 老牌）/ Hugo（Go 极快）/ Middleman（Ruby 专业）？2014 年时这 3 个是主流；API 文档对"配置专业度"和"主题灵活度"要求高。

**解决方案**：Slate 选 Middleman——比 Jekyll 配置更专业（多语言、目录索引、Sass 集成），比 Hugo 灵活（Ruby DSL），比 Hexo 早熟（Hexo 2015 才出现）。

```ruby
# config.rb（Middleman 配置入口）
require 'redcarpet'
require 'middleman-gh-pages'
set :build_dir, 'build'
set :css_dir, 'stylesheets'
set :js_dir, 'javascripts'
set :images_dir, 'images'
# 激活扩展
activate :syntax                    # 代码高亮
activate :livereload                # 改完即看
activate :minify_css                # 生产压缩
activate :minify_javascript
# i18n 多语言
activate :i18n, mount_at_root: :lang
# 部署
require 'middleman-gh-pages'
task :deploy do
  `middleman build`
  `git add -f build && git commit -m 'deploy'`
  `git subtree push --prefix build origin gh-pages`
end
```

**关键参数**：
- Middleman = Ruby 静态站点生成器
- `config.rb` = 全局配置入口
- `source/index.html.md` = 用户编辑入口（双扩展名）
- 模板 = ERB（Embedded Ruby）
- 部署 = `middleman build` 输出 `build/` 目录

**最佳实践**：API 文档工具选 Middleman——配置专业、Ruby 生态成熟、SCSS 集成好；Jekyll 适合博客，Middleman 适合文档；2020+ 新项目优先 Docusaurus / VitePress（JS 生态），Ruby 工具链不再是必选。

### 模式 2：双扩展名 `.html.md`

**问题场景**：用户写 Markdown，但 Middleman 默认生成 `.html`——怎么"输入 markdown 输出 html"？要"内容 + 布局声明"在同一文件。

**解决方案**：`source/index.html.md` 双扩展名——`.html.md` 告诉 Middleman 解析为 markdown + 套 HTML 布局，输出 `.html`；中间用 YAML frontmatter 声明 layout。

```markdown
---
title: API Reference
language_tabs:
  - shell
  - ruby
  - javascript
toc_footers:
  - <a href='#'>Sign Up for a Developer Key</a>
includes:
  - errors
search: true
---

# Introduction

Welcome to the **Slate API Documentation**. This is a test.

> Hello world

```shell
curl -X POST https://api.example.com/v1/users \
  -H "Authorization: Bearer xxx"
```
```

**关键参数**：
- 输入 = `index.html.md`
- 处理 = Middleman 识别 `html.md` → 用 markdown 解析 + html 布局
- 输出 = `build/index.html`
- 优势 = 单一文件 = 内容 + 布局声明
- 适用 = 单页面应用文档

**最佳实践**：文档站点用 `.html.md` 双扩展名——单文件搞定"内容 + 输出格式"；frontmatter 写 metadata（title / language_tabs / toc_footers）传给 layout；MDX 是 2020+ 现代方案（支持 React 组件），`.html.md` 是 2014 时代简化版。

### 模式 3：Markdown Frontmatter 元数据

**问题场景**：每个页面有不同 title / 语言标签 / 目录——硬编码 layout 灵活性差；要"页面级别配置"。

**解决方案**：YAML frontmatter——`---` 包围的 YAML 块定义 page-level 元数据，layout / helpers 调用 `current_page.data.title`。

```markdown
---
title: Authentication
language_tabs:
  - shell: cURL
  - ruby
  - python
toc_footers:
  - <a href='#'>Need help?</a>
search: true
---

# Authentication

> Authorize via OAuth 2.0

```shell
# With shell, you can just pass the correct header with each request
curl "api_endpoint_here" -H "Authorization: Bearer <token>"
```

```ruby
require 'net/http'
uri = URI('api_endpoint_here')
Net::HTTP.get(uri)
```
```

**关键参数**：
- 块标记 = `---` 开头 + `---` 结尾
- 字段 = `title` / `language_tabs` / `toc_footers` / `includes` / `search`
- 访问 = `current_page.data.title`（ERB 模板内）
- 校验 = Middleman build 时 YAML 解析失败会报错
- 嵌套 = 支持数组 / 对象 / 字符串

**最佳实践**：每篇 Markdown 顶部用 frontmatter 声明元数据——title 决定 `<title>`，language_tabs 决定代码切换，toc_footers 决定页脚链接；字段命名 camelCase（`language_tabs`）或 snake_case 保持一致；必要字段配默认值（layout 兜底）。

### 模式 4：ERB 模板 + helpers 复用

**问题场景**：所有页面共享导航 + 页脚 + 搜索框——不想每页重写；想要"模板变量 + 复用片段"。

**解决方案**：Middleman ERB 模板 + helpers——`source/layouts/layout.erb` 是父模板，子页用 `---` frontmatter 选 layout；helpers 函数封装常用 HTML。

```erb
<!-- source/layouts/layout.erb -->
<!DOCTYPE html>
<html>
<head>
    <title><%= current_page.data.title %> | Slate</title>
    <link rel="stylesheet" href="stylesheets/screen.css">
    <link rel="stylesheet" href="stylesheets/print.css" media="print">
</head>
<body class="<%= page_classes %>">
    <a href="#" id="nav-button">
        <span><%= image_tag 'navbar.png' %></span>
    </a>
    <div class="tocify-wrapper">
        <%= image_tag 'logo.png' %>
        <div id="toc"></div>
    </div>
    <div class="page-wrapper">
        <div class="dark-box"></div>
        <div class="content">
            <%= yield %>  <!-- 这里插入子页内容 -->
        </div>
    </div>
    <% javascript_include_tag 'all' %>
</body>
</html>
```

**关键参数**：
- ERB 语法 = `<%= ... %>` 输出 / `<% ... %>` 不输出
- 变量 = `current_page.data.title` 访问 frontmatter
- 助手 = `image_tag` / `javascript_include_tag` / `stylesheet_link_tag`
- 布局 = `layout: 'layout'` 在 frontmatter 指定
- 分区 = `<%= partial 'nav' %>` 引用片段

**最佳实践**：ERB 模板分离 layout（layout.erb）和内容（page）；用 helpers 封装重复 HTML（image_tag / link_to）；yield 位置决定内容插入点；partial 拆分 header/footer/sidebar 为独立片段。

### 模式 5：Rakefile 三任务

**问题场景**：build / preview / deploy 三个动作——怎么组织命令行工具？团队成员命令统一。

**解决方案**：`Rakefile` 9 行——`rake build` 调 middleman build，`rake preview` 调 middleman server，`rake deploy` 调 rsync / gh-pages。

```ruby
# Rakefile
require 'middleman-gh-pages'
namespace :site do
  desc 'Build the site'
  task :build do
    sh 'middleman build --clean'
  end
  desc 'Start local server with livereload'
  task :preview do
    sh 'middleman server'
  end
  desc 'Deploy to GitHub Pages'
  task :deploy => [:build] do
    sh 'git add -f build && git commit -m "deploy at $(date)"'
    sh 'git push origin `git subtree split --prefix build master`:gh-pages --force'
  end
end
desc 'Default: build + deploy'
task :default => 'site:build'
```

**关键参数**：
- `rake build` = 生成静态文件
- `rake preview` = 本地预览（livereload）
- `rake deploy` = 部署到 GitHub Pages
- 扩展 = 自定义 rake task（如 `rake publish`）
- 优势 = Ruby 生态成熟

**最佳实践**：静态站点用 Rakefile 统一命令——`build / preview / deploy` 三件套标准化；namespace 隔离命令（rake site:build）；依赖关系 `task :deploy => [:build]` 自动 build 后再 deploy；Makefile / npm scripts 是替代方案（看语言栈）。

---

## 第二段：视觉设计 - 三栏布局与 SCSS

### 模式 6：三栏布局 + 滚动同步

**问题场景**：Stripe 2013 发布的 API 文档成为行业标杆——左导航 + 中正文 + 右代码块 + 滚动同步，怎么实现？技术细节 = 250/800/250 宽度 + sticky 右侧。

**解决方案**：SCSS 3 个核心变量控制宽度——`$nav-width: 250px` / `$code-width: 250px` / `$max-width: 800px`，JS 监听滚动同步 active 状态。

```scss
// source/stylesheets/screen.css.scss
$nav-width: 250px !default;
$code-width: 250px !default;
$max-width: 800px !default;
$tablet-width: 930px;
$phone-width: $tablet-width - $nav-width;
.page-wrapper {
    margin: 0 auto;
    max-width: $max-width + 2 * $code-width + 50px;  // 800 + 500 + 50
    position: relative;
    padding: 0 ($nav-width + 10px) 0 $nav-width;
}
.tocify-wrapper {
    position: fixed;
    width: $nav-width;
    height: 100%;
    overflow-y: auto;
    left: 0;
    top: 0;
}
.content {
    pre, blockquote {
        // 右栏代码 sticky
        width: $code-width;
        position: absolute;
        right: (-$code-width - 10px);
        top: 0;
    }
    // 中栏正文 max-width
    h1, h2, h3, p, ul, ol {
        max-width: $max-width;
    }
}
```

**关键参数**：
- 左栏 = TOC（$nav-width: 250px）
- 中栏 = 正文（max-width: 800px）
- 右栏 = 代码（$code-width: 250px sticky）
- 同步 = ScrollSpy JS 监听滚动高亮当前章节
- 响应式 = < 1200px 折叠右栏

**最佳实践**：API 文档三栏布局 = 250 / 800 / 250 + sticky 右侧——Stripe 模式被 Stripe API / Twilio / Slack 全面采纳；CSS Grid 替代 float 是 2020+ 写法；右栏 `position: absolute; right: -260px;` 关键；折叠断点选 1200px（平板上限）。

### 模式 7：SCSS 常量驱动响应式

**问题场景**：文档站点的左/中/右宽度要随视口调整——硬编码 250px 必然破；改一处生效全局。

**解决方案**：SCSS 3 变量 + 媒体查询——`$nav-width` / `$code-width` / `$max-width` 顶层常量，媒体查询覆盖；BEM 命名 + 嵌套。

```scss
$nav-width: 250px !default;
$code-width: 260px !default;
$max-width: 800px !default;
$tablet-width: 930px;
$phone-width: $tablet-width - $nav-width;
// 桌面：> 1200px
@media (min-width: 1200px) {
    .page-wrapper { padding: 0 ($nav-width + 10px) 0 $nav-width; }
}
// 平板：930-1200px
@media (max-width: 1200px) and (min-width: 930px) {
    .page-wrapper { padding: 0; }
    .tocify-wrapper { display: none; }   // 隐藏左栏
    .content pre { position: static; width: 100%; }   // 右栏变正常流
}
// 手机：< 930px
@media (max-width: 930px) {
    .page-wrapper { padding: 0 20px; }
    .content pre { font-size: 12px; }
}
```

**关键参数**：
- 桌面 = 250 / 800 / 250
- 平板 = 200 / 700 / 200
- 手机 = 折叠右栏，单栏布局
- 媒体查询 = `@media (max-width: 1200px)` 切换
- 优势 = 改一处生效全局

**最佳实践**：响应式布局用 SCSS 变量 + 媒体查询——避免硬编码 250px 重复；`!default` 让用户覆盖；3 断点 = 桌面/平板/手机；移动优先用 `min-width`（推荐），桌面优先用 `max-width`；用 CSS 变量（自定义属性）做动态主题切换。

### 模式 8：redcarpet 自定义渲染器

**问题场景**：Markdown 标准无"右栏"概念——用户想在右侧展示代码示例 vs 正文，怎么办？标准 markdown 也不支持多语言 tab 切换。

**解决方案**：redcarpet 解析 + 自定义扩展——`{% aside %}` 块或 `<aside>` HTML 标签劫持，转为 sticky 右栏；自渲染器接管代码块渲染。

```ruby
# lib/redcarpet_custom.rb
class CustomRender < Redcarpet::Render::HTML
    def block_code(code, language)
        # 输出 <pre class="highlight"><code class="language-xxx">
        %(<pre class="highlight"><code class="language-#{language}">) +
        code.gsub('<', '&lt;') +
        '</code></pre>'
    end
    def header(text, header_level)
        # 添加 anchor + 滚动同步 ID
        anchor = text.gsub(/\s+/, '-').downcase
        %(<h#{header_level} id="#{anchor}" class="header-anchor">#{text} <a href="##{anchor}">¶</a></h#{header_level}>)
    end
end
# config.rb 配置
set :markdown_engine, :redcarpet
set :markdown, :fenced_code_blocks => true,
              :smartypants => true,
              :renderer => CustomRender
```

**关键参数**：
- redcarpet = Ruby Markdown 解析器
- 自定义扩展 = `aside` 块 + `language-xxx` 代码块
- 输出 = `<aside class="right-code">` 注入右栏
- 优势 = 用户 Markdown 写，框架切分
- 灵活 = 支持 HTML 内联

**最佳实践**：Markdown 文档支持"右栏代码"用 redcarpet 自定义扩展——保留 Markdown 简洁 + 增强排版；自定义渲染器要继承 `Redcarpet::Render::HTML`；header 渲染要加 anchor（滚动同步 + 分享链接）；CommonMarker（GitHub 风格）是 2020+ 替代。

### 模式 9：redcarpet vs kramdown 选型

**问题场景**：Ruby Markdown 解析器选 redcarpet（C 扩展快）/ kramdown（纯 Ruby 灵活）/ CommonMarker（GitHub 风格）？

**解决方案**：Slate 选 redcarpet——速度快 + 配置丰富（自定义渲染器）+ Middleman 默认支持；2014 年没有 CommonMarker 替代选项。

```ruby
# redcarpet 配置示例
set :markdown_engine, :redcarpet
set :markdown, {
    :fenced_code_blocks => true,   # ```xxx 代码块
    :tables => true,                # 表格支持
    :strikethrough => true,         # ~~删除线~~
    :no_intra_emphasis => true,     # 避免 foo_bar_baz 误判
    :autolink => true,              # 自动链接
    :space_after_headers => true,   # # header 后必须有空格
    :renderer => CustomRender
}
# 性能对比（1000 文档）
# redcarpet: 8s
# kramdown:  40s
# commonmarker: 5s（GitHub 风格，2020+ 替代）
```

**关键参数**：
- redcarpet = C 扩展（libupskirt）
- 优势 = 自定义渲染器（HTML 输出可控）
- 替代 = kramdown（更纯 Ruby）
- 性能 = redcarpet 比 kramdown 快 5x
- 局限 = redcarpet 维护慢

**最佳实践**：Ruby Markdown 选 redcarpet——性能 + 灵活性 + Middleman 集成最好；新项目选 CommonMarker（GitHub 风格 + 维护活跃）；kramdown 适合纯 Ruby 环境（无 C 扩展依赖）；自定义渲染器是 redcarpet 杀手锏（HTML 完全可控）。

### 模式 10：打印样式 print.css

**问题场景**：开发者在 IDE 看文档时 ctrl+P 想打印——默认打印右栏代码丢失；想打印版"A4 单栏 + 代码 inline"。

**解决方案**：`print.css.scss` A4 横版优化——右栏代码 inline、中文栏变单栏、隐藏导航；用 `@media print` 触发。

```scss
// source/stylesheets/print.css.scss
@media print {
    @page {
        size: A4 landscape;
        margin: 1cm;
    }
    .tocify-wrapper, .dark-box, #nav-button {
        display: none !important;  // 隐藏导航
    }
    .page-wrapper {
        padding: 0 !important;
        max-width: 100% !important;
    }
    .content {
        pre, blockquote {
            // 右栏代码变正常流
            position: static !important;
            width: 100% !important;
            border: 1px solid #ccc;
            page-break-inside: avoid;
        }
        h1, h2, h3 {
            page-break-after: avoid;  // 标题后不换页
        }
        p {
            font-size: 10pt;
            line-height: 1.4;
        }
    }
}
```

**关键参数**：
- A4 横版 = `@page { size: A4 landscape; }`
- 单栏 = 折叠三栏为单栏
- 代码 inline = `<aside>` 转为正常流
- 字体 = 10pt 黑体
- 优势 = 离线查阅

**最佳实践**：文档站必带 print.css——打印 / PDF 导出 / 离线查阅必备；`@page` 控制纸张 + 边距；`page-break-inside: avoid` 避免代码块跨页；隐藏交互元素（导航、按钮）；10pt 字体适合 A4 打印。

---

## 第三段：开发运维 - 搜索、部署与归档

### 模式 11：Livereload 开发体验

**问题场景**：改 Markdown 文档，要手动 `middleman build` 才能看效果——开发体验差；想"保存即刷新"。

**解决方案**：Middleman `livereload` 扩展——改 `source/index.html.md` 自动 rebuild + 浏览器自动刷新；WebSocket 推浏览器。

```ruby
# config.rb
activate :livereload do |livereload|
  livereload.watch 'source/stylesheets/*.scss'   # 监听 SCSS
  livereload.watch 'source/javascripts/*.js'    # 监听 JS
  livereload.wait 1   # 1 秒延迟（防抖）
end
# 启动
# $ middleman server
# == The Middleman is loading
# == LiveReload is waiting for a browser to connect on port 35729
# 安装 Chrome LiveReload 扩展
# http://localhost:4567  → 改文件 → 自动刷新
```

**关键参数**：
- livereload = `middleman server` + LiveReload Chrome 扩展
- 触发 = 文件变更 watch
- 刷新 = WebSocket 推浏览器
- 优势 = 改完即看
- 性能 = 增量 rebuild 1-2 秒

**最佳实践**：文档站开发用 livereload——改 Markdown 立刻预览，迭代速度 5x；watch 路径要包含 SCSS/JS（不只是 Markdown）；1 秒延迟防抖（避免每键触发）；webpack-dev-server / Vite HMR 是 2020+ 替代（更快）。

### 模式 12：Google Analytics 集成

**问题场景**：文档站点上线后想知道访问量 / 用户行为——怎么集成 GA？需要分页面统计 + 站内搜索事件。

**解决方案**：Middleman `config.rb` 注入 GA 脚本——`activate :google_analytics do |ga| ga.tracking_id = 'UA-xxx' end`；自定义事件追踪搜索。

```ruby
# config.rb
activate :google_analytics do |ga|
    ga.tracking_id = 'UA-XXXXXXX-XX'  # GA Property ID
    # 替代 GA4
end
# 注入位置 = `</head>` 前（自动）
# GA4 配置（自定义）
# content_for :head do
#     <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
#     <script>
#         window.dataLayer = window.dataLayer || [];
#         function gtag(){dataLayer.push(arguments);}
#         gtag('js', new Date());
#         gtag('config', 'G-XXXXXXX');
#     </script>
# end
# 搜索事件追踪
gtag('event', 'search', { search_term: query })
```

**关键参数**：
- tracking_id = GA Property ID
- 注入位置 = `</head>` 前
- 环境 = 仅 production 生效
- 替代 = Plausible / Umami（隐私友好）
- 优势 = Middleman 一行配置

**最佳实践**：文档站上线必带 GA / Plausible——访问量 + 跳出率 + 搜索词数据驱动改进；GA4 是 2020+ 标准（事件驱动）；Plausible / Umami 隐私友好（GDPR 合规）；自定义事件追踪"站内搜索"（用户最关心的功能）。

### 模式 13：Algolia DocSearch 集成

**问题场景**：文档站点搜索——站内搜索 vs Google 搜索 vs Algolia？需要全文搜索 + 高亮 + 0 成本。

**解决方案**：Algolia DocSearch 免费计划——`config.rb` 注入 `docsearch.js`，爬虫定时索引文档；申请免费计划（开源项目）。

```html
<!-- 注入 Algolia DocSearch -->
<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/docsearch.js@2/dist/cdn/docsearch.min.js"></script>
<script type="text/javascript">
    docsearch({
        apiKey: 'YOUR_API_KEY',          // Algolia Public Key
        indexName: 'slate',               // Index 名称
        inputSelector: '#algolia-search',  // 搜索框选择器
        debug: false
    });
</script>
<!-- 搜索框 HTML -->
<input type="search" id="algolia-search" placeholder="Search docs">
```

**关键参数**：
- DocSearch = Algolia 免费（开源项目）
- 注入 = `<script src="https://cdn.jsdelivr.net/npm/docsearch.js@2/dist/cdn/docsearch.min.js">`
- 配置 = apiKey / indexName / container
- 优势 = 0 成本 + 全文搜索 + 高亮
- 替代 = MeiliSearch / Elasticsearch 自建

**最佳实践**：开源文档用 Algolia DocSearch——免费 + 全文搜索 + 自动爬虫；申请条件 = 开源项目 + GitHub 仓库 + 公开文档；MeiliSearch / Elasticsearch 是私有部署替代；搜索框位置放右上角（用户习惯）。

### 模式 14：GitHub Pages 部署

**问题场景**：静态 build 后怎么部署到 GitHub Pages？每次 `git push` 触发自动部署。

**解决方案**：`rake deploy` 调 `middleman build` → `git subtree push --prefix build origin gh-pages`——子目录推 gh-pages 分支；GitHub Actions 自动化是 2020+ 替代。

```bash
# 手动部署
middleman build --clean
# build/ 目录下的内容推 gh-pages 分支
git subtree push --prefix build origin gh-pages
# 或用 middleman-gh-pages gem
# rake deploy
# GitHub Actions 自动化（2020+ 推荐）
# .github/workflows/deploy.yml
name: Deploy
on:
    push:
        branches: [master]
jobs:
    deploy:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v3
            - uses: ruby/setup-ruby@v1
                with: { ruby-version: 3.0, bundler-cache: true }
            - run: bundle exec middleman build
            - uses: peaceiris/actions-gh-pages@v3
                with:
                    github_token: ${{ secrets.GITHUB_TOKEN }}
                    publish_dir: ./build
```

**关键参数**：
- 构建 = `middleman build` 输出 `build/`
- 部署 = `git subtree push --prefix build origin gh-pages`
- CNAME = `source/CNAME` 自定义域名
- HTTPS = GitHub Pages 自动 + Let's Encrypt
- 替代 = Netlify / Vercel / Cloudflare Pages

**最佳实践**：静态文档用 GitHub Pages + subtree push——零成本 + HTTPS + 自定义域名；GitHub Actions 自动化是 2020+ 主流（不用手动跑 rake）；Netlify / Vercel / Cloudflare Pages 是替代（更快 CDN + 预览部署）；CNAME 文件自定义域名（apex domain）。

### 模式 15：仓库归档与社区 fork

**问题场景**：原作者 lord 在 2026-01 因抗议微软与 ICE/IDF 合同，主动下线 GitHub 仓库——这是"开源维护者的权利"还是"对社区的伤害"？社区怎么应对？

**解决方案**：历史事件——`slate` 仓库被裁撤，源码迁到只读镜像 `https://code.lord.io/slate/`，社区 fork 维持维护；用户面临"迁移到 Docusaurus / Mintlify"或"用社区 fork"的选择。

```bash
# 社区 fork（推荐：slatedocs/slate）
git clone https://github.com/slatedocs/slate
cd slate
bundle install
bundle exec middleman server
# 继续使用，社区维护
# 或迁移到 Docusaurus（2020+ 推荐）
npx create-docusaurus@latest my-docs classic
# Slate 主题代码需重写
```

**关键参数**：
- 主动归档 = 原作者选择（开源协议允许）
- 抗议 = 表达政治立场
- 替代 = 社区 fork（`slatedocs/slate` 等）
- 行业反应 = 支持 / 反对
- 长期 = 用户迁移到 Docusaurus / Mintlify

**最佳实践**：依赖单一维护者项目有"消失"风险——选有公司/基金会背书的工具，或自托管；归档不等于消失（git 永久记录 + 社区 fork）；商业项目选 Docusaurus / Mintlify（有商业公司支持）；抗议归抗议，技术选型要看长期维护性。

---

## 第四段：历史与迁移 - 归档事件与现代替代

### 模式 16：Slate 在 2026 的现代替代

**问题场景**：Slate 2026 已停更——新项目用 Docusaurus（Meta 维护） / Mintlify（商业） / ReadMe.io（SaaS）？要看"维护活跃度"+"主题美感"+"生态集成"。

**解决方案**：决策树——个人 / 小团队用 Docusaurus（免费 + MDX + React）；企业用 Mintlify（托管 + 美观）；简单用 VuePress / VitePress。

```bash
# Docusaurus（Meta 维护 + MDX + React）
npx create-docusaurus@latest my-site classic
# Mintlify（商业 SaaS + 美观主题）
npm install -g mintlify
mintlify new my-docs
# VitePress（Vue + Vite + 极快）
npm init vitepress my-docs
# ReadMe.io（SaaS，托管文档）
# 官网注册 → web 编辑器
```

**关键参数**：
- Docusaurus = Facebook 维护 + React + MDX
- Mintlify = 商业 + 美观模板 + AI 搜索
- VuePress / VitePress = Vue 生态 + 轻量
- Slate = 历史价值 + 已停更
- 迁移成本 = Slate 主题代码需重写

**最佳实践**：新项目用 Docusaurus / Mintlify——避免选已停更的框架，承担"消失"风险；Docusaurus 适合"开源 + 国际化 + 大型"；Mintlify 适合"商业 + 美观 + 不想运维"；VitePress 适合"极简 + 快"。

### 模式 17：社区 fork 与多版本维护

**问题场景**：lord 下线原仓库后，社区怎么维护？fork 怎么组织？多个 fork 怎么避免分裂？

**解决方案**：社区 fork 模式——`slatedocs/slate` / `centerforopenscience/slate` 等多个组织 fork 维护，PR 合并到社区版；维护者不集中，分散贡献。

```bash
# 社区 fork 列表
# - slatedocs/slate（最活跃）
# - centerforopenscience/slate（学术研究）
# - imsky/slate（原作者 lord 的 fork 镜像）
# 协作模式
# 1. 提 issue 到社区 fork
# 2. 提 PR
# 3. 维护者 review + merge
# 4. 发版 tagged release
# 局限：每个 fork 各自演进，长期分裂
```

**关键参数**：
- 复刻 = `git clone https://github.com/slatedocs/slate`
- 维护 = 社区 PR review + release
- 主题 = 多 fork 各自改进
- 现状 = 仍可用但缺新功能
- 推荐 = Docusaurus 新建

**最佳实践**：依赖停更项目，社区 fork 是过渡方案——长期应迁到活跃维护的框架；多 fork 维护是 OSS 常见模式（vs. 集中维护）；选 fork 看 commit 频率 + issue 响应时间；新项目直接 Docusaurus 比 fork 维护省事。

### 模式 18：三栏 + 滚动同步复刻

**问题场景**：想在新框架（Docusaurus / VitePress）复刻 Slate 三栏布局——怎么做？保持 Stripe 风格。

**解决方案**：Docusaurus 主题——`docusaurus-theme-classic` + 自定义 CSS 重写 grid，`scrollspy` 监听滚动；CSS Grid 替代 float。

```css
/* Docusaurus 自定义 CSS */
.doc-page {
    display: grid;
    grid-template-columns: 250px 1fr 250px;
    gap: 30px;
    max-width: 1400px;
    margin: 0 auto;
}
.doc-sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
}
.doc-content {
    max-width: 800px;
}
.doc-code {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
}
/* 滚动同步（IntersectionObserver） */
const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const id = entry.target.id;
            // 高亮左栏对应链接
            document.querySelectorAll('.doc-sidebar a')
                .forEach(a => a.classList.remove('active'));
            const link = document.querySelector(`.doc-sidebar a[href="#${id}"]`);
            if (link) link.classList.add('active');
        }
    });
});
document.querySelectorAll('.doc-content h2, h3').forEach(h => observer.observe(h));
```

**关键参数**：
- Docusaurus = `themeConfig.navbar` + `docs.sidebars`
- 三栏 = CSS Grid `grid-template-columns: 250px 1fr 250px`
- 滚动同步 = `IntersectionObserver` + `scrollspy` lib
- 代码右栏 = `pre` sticky
- 总成本 = 200 行 CSS + 50 行 JS

**最佳实践**：复刻三栏布局用 Docusaurus + CSS Grid——比 Slate 现代 + 活跃维护；CSS Grid 替代 float（响应式更简单）；IntersectionObserver 替代 scroll event listener（性能更好）；CSS sticky 替代 JS 计算位置。

### 模式 19：.html.md vs MDX

**问题场景**：Slate 的 `.html.md` 限制（仅 HTML 内联）vs Docusaurus 的 MDX（React 组件）？需要支持交互组件（API playground / Chart）时怎么办？

**解决方案**：决策——简单文档用 `.html.md`；复杂交互（图表、API playground）用 MDX；2026 MDX 成为主流。

```markdown
<!-- .html.md（Slate） -->
# My API

<aside class="right-code">curl example</aside>

<!-- MDX（Docusaurus） -->
# My API

import APIPlayground from '@site/src/components/APIPlayground'
import { Chart } from 'react-chartjs-2'

<APIPlayground endpoint="/users" method="GET" />

<Chart data={...} />

## Why MDX?

- 完整 React 组件支持
- JSX 表达式
- GraphQL playground 内嵌
- Storybook 集成
```

**关键参数**：
- `.html.md` = HTML 内联（`<aside>` `<div>`）
- MDX = Markdown + JSX（`<APIPlayground>` `<Chart>`）
- 学习曲线 = MDX 较陡
- 适用 = 简单选 html.md / 交互选 MDX
- 趋势 = MDX 成为 2026 标准

**最佳实践**：现代文档用 MDX——支持交互组件 + JSX 表达式 + GraphQL playground；MDX 是 Markdown + JSX 双语法；学习曲线 = 30 分钟（会 React 即可）；`.html.md` 是 2014 简化版（无交互）；GraphQL 文档必须 MDX（要 Playground）。

### 模式 20：7 天复刻 mini-Slate 路线

**问题场景**：想理解 Slate 架构但 Ruby 工具链门槛高；想用现代栈（VitePress）复刻三栏；想要 teach-by-doing 练手。

**解决方案**：7 天 MVP——Day 1-2 VitePress 初始化 + 主题，Day 3 三栏 CSS Grid，Day 4 Markdown 内容，Day 5 滚动同步 JS，Day 6 Algolia 搜索，Day 7 GitHub Pages 部署。

```bash
# Day 1-2 VitePress 初始化
npm init vitepress my-slate
cd my-slate
# 配置 .vitepress/config.ts
#   - title / nav / sidebar
#   - themeConfig.search.provider = 'algolia'
# 启动
npm run dev  # http://localhost:5173

# Day 3 三栏 CSS Grid
# .vitepress/theme/custom.css
#   - grid-template-columns: 250px 1fr 250px
#   - position: sticky
#   - 媒体查询 < 1200px 折叠

# Day 4 Markdown 内容
# docs/index.md
# docs/api/authentication.md

# Day 5 滚动同步 JS
# .vitepress/theme/scrollspy.js
#   - IntersectionObserver
#   - 高亮 sidebar 当前链接

# Day 6 Algolia 搜索
# themeConfig.search = { provider: 'algolia', options: {...} }

# Day 7 GitHub Actions 部署
# .github/workflows/deploy.yml
#   - on: push branches: [main]
#   - run: npm run docs:build
#   - uses: peaceiris/actions-gh-pages@v3
```

**关键参数**：
- 核心 = CSS Grid 三栏 + ScrollSpy
- 框架 = VitePress（Vue 生态）
- 内容 = Markdown 单一源
- 部署 = Vercel / Netlify
- 复刻难度 = 主题代码 200 行

**最佳实践**：复刻 Slate 三栏用 VitePress + CSS Grid——比 Middleman 现代 5x，部署更简单；VitePress 替代 Middleman 优势 = 启动快 + 热更新 + Vue 生态；Algolia DocSearch 2020+ 仍是开源文档标准；GitHub Actions 自动化部署（Vercel / Netlify 一键部署）。

---

## 附录：3 个核心历史文件

1. `source/index.html.md` — 双扩展名入口（Markdown + HTML 布局）
2. `source/stylesheets/screen.css.scss` — 整页三栏 SCSS（$nav-width / $code-width / $max-width）
3. `source/layouts/layout.erb` — ERB 模板（导航 + 正文 + 代码三栏）

## 一句话总结

slate = Middleman + redcarpet + `.html.md` 双扩展名 + SCSS 三栏（250/800/250）+ ScrollSpy 滚动同步 + Algolia DocSearch，把"Stripe 风格 API 文档"做到 2014-2026 行业标杆；2026-01 因原作者抗议微软而下线，但设计思想（Docusaurus / Mintlify）继续被新框架继承。
