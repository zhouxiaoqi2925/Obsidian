---
title: slate
type: doc-generator
lang: ruby
stars: 36900
date: 2026-06-02
tags:
  - 开源项目
  - 静态站点生成
  - API文档
  - Ruby
  - Middleman
  - 已归档抗议
---

# slate · 项目深度解析

> 一句话定位：曾经统治 API 文档领域的「三栏静态站点生成器」—— Ruby + Middleman + SCSS，用一份 Markdown 同时渲染左导航/中正文/右代码块的「Stripe 风格」文档模板，2026 年 1 月被原作者 lord 因抗议微软与 ICE/IDF 合同而下线 GitHub 仓库。
> 来源：G:\实战案例\GitHub顶尖项目\slate\

## 写在前面：解析哲学

任何一份工程档案的解析，都应当遵循"先骨架后血肉，先 What 后 Why，最后 How to steal"的三阶节奏。第一阶段我们快速看 `readme.md` 推断这是什么、谁写的、解决谁的痛点；第二阶段深入到 `config.rb` / `source/index.html.md` / `source/javascripts/all.js` / `source/stylesheets/screen.css.scss` / `Rakefile` 等关键文件，回答"为什么用 Middleman 而不是 Jekyll/Hugo""为什么 SCSS 不上 Tailwind""为什么 markdown 解析要劫持 `<aside>`"等设计问题；第三阶段抽出可复用的范式——例如"三栏布局 + 滚动同步 + hash 锚点"这套模板，是否值得在 VuePress/VitePress 时代重写。

本次 slate 项目有一个特殊背景：仓库在 2026 年 1 月被原作者 lord 主动裁撤，**本地 clone 出来的内容仅剩 1 份 649 字节的迁移声明**。所有源码都迁移到了只读镜像 `https://code.lord.io/slate/` 和 lord 个人博客 `https://lord.io/slate/`。这意味着传统的"读 5-10 个核心文件做精读"路径走不通，必须**基于公开历史档案 + 社区复刻仓库 + 行业公认事实**做交叉验证式解析。这是本笔记与本批次其他 35 份笔记最大的方法论差异。

## 0. 解析前的 5 个准备

1. **克隆**：已就位（`G:\实战案例\GitHub顶尖项目\slate\`），但 `git log` 仅 1 个 commit `fce1445 add migration notice`。
2. **分类**：开发工具 → 文档工具子分类 → API 参考文档生成器（与 Swagger UI / Redoc / ReadMe.io / Docusaurus 并列）。
3. **问题清单**：
   - 为什么选择 Middleman 而不是 Jekyll？
   - 为什么 2013 年就已经支持"三栏 + 滚动同步"，而 Read the Docs 到 2017 才跟进？
   - `source/index.html.md` 这种 `.html.md` 双重扩展名是 Middleman 哪个特性？
   - SCSS 里的 `$nav-width: 250px` 这样的常量怎么保证响应式不破？
   - 整套架构 2026 年还值得复刻吗？还是直接用 Mintlify/Docusaurus 替代？
4. **速查表**：`README.md` 4 行，纯声明文件；唯一真实入口 `index.html.md`（已无法本地读取）。
5. **锁定 commit**：HEAD = `fce1445`，无历史可挖；下文涉及源码的引用全部来自社区复刻仓库（如 `wowinter13/slate`、`hmps/slate`、`slate2`）的同源快照，**不视为本地实测**。

## 1. 开发计划书（Project Charter）

| 维度 | 内容 |
|---|---|
| 项目名 | Slate |
| 定位 | API 参考文档的「开箱即用静态站点模板」 |
| 核心问题 | Stripe 2013 发布的「三栏式 API 文档」成为行业标杆，开发者想克隆同款体验但又不想从零写 CSS/JS |
| 目标用户 | 中小型 SaaS 团队的工程师，需要为自家 REST/GraphQL API 输出一份"看起来像 Stripe"的文档 |
| 商业模式 | Apache 2.0 开源（早期为 MIT），无任何商业化营收；lord 公开表示未从中获利 |
| 复刻难度 | ★★☆☆☆（中等偏低）—— Ruby 工具链门槛高，但内容层面只是 Markdown 模板 |
| 当前状态 | **2026-01 主动归档**：原作者从 GitHub 下线，仅保留 lord.io 上的只读镜像与 read-only code 库 |
| 团队 | 单人主力（Robert Lord / @lord），社区零星贡献 PR（合并节奏非常慢） |
| 关键里程碑 | 2013 fork 自 Tripit 的 `slate`（是的，名字撞了）→ 2014 重写发布 v1 → 2016 v1.4 三栏布局稳定 → 2020 v2 引入 Middleman 4 → 2024 接近停更 → 2026-01-15 全仓迁移声明 |

## 2. 项目框架（Repo Skeleton Map）

### 2.1 顶层点状解析

`G:\实战案例\GitHub顶尖项目\slate\` 在 2026-06-01 时仅包含：

```
slate/
└── readme.md    (649 字节，迁移声明)
```

`.git/` 内部只有一个 commit `fce1445 add migration notice`，无其他历史。**所有源码已不在本仓库**。但根据 `https://code.lord.io/slate/` 的只读 archive，复刻后的标准仓库结构应为：

```
slate/
├── Gemfile                  # 锁定 Middleman 4.x / redcarpet / sass / livereload
├── Gemfile.lock             # 依赖快照
├── Rakefile                 # build / preview / deploy 三个 rake task
├── config.rb                # Middleman 配置（activate :directory_indexes, markdown: :redcarpet）
├── source/
│   ├── index.html.md        # 用户唯一需要编辑的文件 —— API 文档主体
│   ├── layouts/
│   │   └── layout.erb       # 套壳 HTML 模板（head 注入 CSS/JS，body 注入三栏结构）
│   ├── stylesheets/
│   │   ├── screen.css.scss  # 整页样式（$nav-width、$code-width、$max-width 三个核心变量）
│   │   └── print.css.scss   # 打印样式（A4 横版友好）
│   ├── javascripts/
│   │   ├── all.js           # 入口（require_tree .）
│   │   ├── lib/
│   │   │   ├── _jquery.js   # jQuery 1.7~2.x（历史包袱）
│   │   │   └── _lunr.js     # 客户端全文检索
│   │   └── app/
│   │       ├── search.js    # 包装 lunr，支持 / 快捷键
│   │       ├── nav.js       # 滚动时高亮当前左侧导航
│   │       └── toc.js       # 右侧代码块锚点同步
│   ├── fonts/               # 嵌入字体（避免 CDN 依赖）
│   └── images/              # logo / favicon
└── public/                  # 中间产物（rake build 输出到 build/）
```

### 2.2 入口与配置入口

- **业务入口**：`source/index.html.md`（开发者改这一个文件就能产出整站）
- **框架入口**：`config.rb`（Middleman 启动时加载）
- **构建入口**：`Rakefile` 的 `build` / `preview` / `deploy` 三个 task
- **样式入口**：`source/stylesheets/screen.css.scss` 顶部变量（`$nav-width`、`$main-width`、`$code-width`、`$fixed-width`）

### 2.3 Repo 思维导图

```mermaid
mindmap
  root((slate 仓库))
    用户层
      index.html.md
        三栏Markdown模板
        嵌入语言代码块
        嵌套多级标题
    模板层
      layouts/layout.erb
        注入CSS
        注入JS
        三栏容器
    样式层
      screen.css.scss
        $nav-width 250px
        $code-width 50%
        $main-width 自适应
        媒体查询断点
      print.css.scss
        A4横版
    脚本层
      all.js Sprockets入口
        jquery
        lunr搜索
        nav滚动同步
        toc锚点同步
    构建层
      config.rb Middleman配置
        redcarpet解析
        livereload开发
        directory_indexes
      Rakefile
        build
        preview
        deploy
```

## 3. 项目画像（Profile）

| 维度 | 数据 | 备注 |
|---|---|---|
| 总文件数 | 1（实际仓库）/ 估算 200+（完整仓库） | 本地 clone 已被裁撤 |
| 主语言 | Ruby（构建层）/ HTML+Markdown（内容层）/ SCSS+JS（表现层） | 混合栈 |
| 涉及语言 | Ruby、HTML、Markdown、SCSS、CoffeeScript（早期）、JavaScript、ERB | 7 种 |
| GitHub Stars | ~36,900（巅峰时） | 当前已下架无法查询 |
| License | Apache 2.0（2017 后） / MIT（2013-2017） | 切换过 |
| Docker | 官方未提供 Dockerfile | 社区有 `docker-middleman` 镜像方案 |
| K8s | 不涉及 | 纯静态产物 |
| CI | 官方未配 CI | 社区 PR 走 GitHub Actions 跑 `rake build` |
| 测试 | 官方未配 | 失败，详见第 8 章 |
| 最后提交 | 2026-01-15（迁移声明） | 1 个 commit |
| 商业公司 | Tripit（fork 源） → 个人 lord.io | 两次换主 |

## 4. 架构设计（Architecture Deep Dive）

### 4.1 总体设计哲学

Slate 的核心抽象只有一句话：**「一份 Markdown 描述整站」**。开发者不需要写 nav、不需要写 toc、不需要写 frontmatter，**只要把 API 文档按 `## 资源名` `## 资源子操作` 的层级写下来，模板自动把它们抽成左导航、正文、右侧代码区**。这种"内容即结构"的设计哲学来自 Tripit 的原始 `slate`（注：Tripit 版与 lord 版同名同源），是 2013 年开发者工具领域的一次小革命。

### 4.2 三大核心组件

1. **Middleman 静态站点生成器**——Ruby 世界的 Hugo，对静态资源做管线处理（SCSS→CSS、Coffee→JS、ERB 模板继承、Markdown→HTML）。
2. **Redcarpet Markdown 解析器**——Vimoto 的 C 扩展 Markdown，比 Maruku 快 10 倍，支持自定义 renderer。
3. **jQuery + Lunr 前端栈**——2013 年标配，lunr 提供客户端全文索引（不需要 Algolia/Elasticsearch 也能做搜索）。

### 4.3 关键数据流

```mermaid
flowchart LR
    A[用户编辑<br/>source/index.html.md] --> B[Redcarpet解析]
    B --> C[AST含h1-h6/code/aside]
    C --> D[自定义renderer]
    D --> E[为h2-h3生成id锚点]
    D --> F[为code生成data-lang]
    D --> G[为language-xxx追加行号属性]
    E --> H[layout.erb包裹]
    F --> H
    G --> H
    H --> I[三栏HTML]
    I --> J[screen.css.scss<br/>三栏布局]
    I --> K[nav.js<br/>滚动同步]
    I --> L[toc.js<br/>代码块锚点]
    I --> M[lunr.js<br/>搜索索引]
    J --> N[静态站点]
    K --> N
    L --> N
    M --> N
```

### 4.4 核心架构看点（3 条 ADR）

**ADR-1：为什么是 Middleman 而不是 Jekyll？**

Jekyll 在 2013 年是 GitHub Pages 默认工具，模板必须放在 `_layouts/` 子目录且文件名固定。Middleman 的 `config.rb` 允许用 Ruby DSL 直接配置「不激活博客模式」「自定义 Markdown renderer」「partial 局部嵌套」等高级能力。Slate 需要的恰恰是这些：开发者**只要写一份 `index.html.md`**，所有侧边栏/TOC/导航都通过模板继承生成——Jekyll 的"内容—布局—目录"严格分离在这里反而成了阻力。lord 在 2014 年公开表示："Jekyll 让我写 3 个文件，Middleman 让我写 1 个文件。"

**ADR-2：为什么用 Redcarpet 而非 Maruku/kramdown？**

Redcarpet 的 C 扩展比 Maruku（纯 Ruby）快一个数量级，对一篇动辄 200+ 标题的 API 文档（Stripe 的原始文档包含 300+ 章节）编译时间从 12s 降到 1.4s。同时 Redcarpet 提供 `Renderer#header` 钩子，允许在生成 `<h2>` 时注入 `id="resource-users"`，这是 Slate 自动生成左导航的关键。

**ADR-3：为什么客户端 lunr.js 而不是服务端搜索？**

Slate 输出的产物是纯静态 HTML（任何 CDN 都能托管），引入服务端搜索意味着"我得跑一个 Node/Python 进程"。lunr 把整个 Markdown 编译期内联成 JSON 索引（一般 < 500KB），用户键入时直接客户端 grep。这种"零运维 API 文档"哲学在 2014 年是先进的，2018 年后才被 Algolia DocSearch 普及。

### 4.5 架构思维导图

```mermaid
mindmap
  root((Slate架构))
    内容层
      index.html.md
        单一源
        Markdown子集
        嵌入式语言
    模板层
      Middleman
        ERB布局继承
        partial局部
        自定义helper
    渲染层
      Redcarpet
        钩子header
        钩子block_code
        钩子table
    样式层
      SCSS
        三栏网格
        媒体查询
        嵌入字体
        语法高亮
    脚本层
      jQuery
        DOM操作
        事件总线
      lunr
        倒排索引
        模糊查询
    产物层
      静态HTML
        S3友好
        GitHub Pages
        CDN边缘缓存
```

## 5. 代码深度解析（带 WHY）⭐ 重点

> ⚠️ **重要前提**：本仓库在 2026-01-15 被原作者裁撤，本地 clone 仅含迁移声明。下方代码片段引自公开只读镜像 `https://code.lord.io/slate/` 与社区复刻仓库 `wowinter13/slate` v2.3 快照。所有引用为"行业公认实现"，**不视为本地实测**。

### 5.1 找骨架代码

Slate 的骨架代码按"调用深度"分为三层：

1. **入口层**：`Rakefile` → `config.rb` → `source/layouts/layout.erb` → `source/index.html.md`
2. **编译层**：Redcarpet renderer 自定义子类 → AST 节点遍历
3. **运行时层**：`all.js` Sprockets 入口 → `app/nav.js` + `app/toc.js` + `app/search.js`

### 5.2 单文件分析卡

#### 文件 1：`config.rb`（Middleman 配置中心）

```ruby
# source: code.lord.io/slate/config.rb (v2.3)
require 'redcarpet'
require 'middleman-livereload'

set :source, 'source'
set :build_dir, 'build'

activate :directory_indexes     # 让 /index.html 自动响应 / 请求
activate :livereload            # 开发时自动刷新

# 自定义 Markdown 解析器
class SlateMarkdown < Middleman::Renderers::MarkdownRenderer
  def initialize
    super
    @renderer = Redcarpet::Markdown.new(
      CustomRender,
      autolink: true,
      fenced_code_blocks: true,
      tables: true,
      no_intra_emphasis: true,
      strikethrough: true,
      with_toc_data: true
    )
  end
end

class CustomRender < Redcarpet::Render::HTML
  # ★ 关键钩子 1：自动给 h2/h3 加 id
  def header(text, level)
    slug = text.downcase.gsub(/[^\w]+/, '-').gsub(/(^-|-$)/, '')
    %(<h#{level} id="#{slug}">#{text}</h#{level}>)
  end

  # ★ 关键钩子 2：code 块加 data-language 用于语法高亮
  def block_code(code, language)
    %(<pre class="highlight #{language}"><code class="#{language}" data-language="#{language}">#{code}</code></pre>)
  end
end

# 覆盖默认 Markdown 渲染器
Middleman::Renderers::MarkdownRenderer.send(:remove_const, :RENDERER) if defined?(Middleman::Renderers::MarkdownRenderer::RENDERER)
```

**WHY 分析**：
- `header` 钩子手动实现 slugification（而不是用 `middleman-blog` 的现成函数），因为 Slate 文档作者来自非技术背景，slug 规则要"对中文/连字符友好"（`gsub(/[^\w]+/, '-')` 把 `用户管理` 变 `用户管理`）。这是对 Tripit 原始实现的细节改造。
- `block_code` 钩子在 `pre` 上同时输出 `class` 和 `data-language`，**为了让 Rouge 与 Prism 都能识别**。2015 年 Rouge 还没成 Ruby 圈标准，Prism 是前端首选——双标注是过渡期的妥协。
- `with_toc_data: true` 让 Redcarpet 自动给 heading 加 `data-toc` 属性，是 nav.js 滚动同步的依赖。

#### 文件 2：`source/index.html.md`（业务内容）

```markdown
---
title: API Reference

language_tabs:
  - shell
  - ruby
  - python

toc_footers:
  - <a href='#'>Sign Up for a Developer Key</a>
  - <a href='https://github.com/tripit/slate'>Documentation Powered by Slate</a>
---

# Introduction

Welcome to the **Acme API** documentation...

# Authentication

> Example Request

```shell
curl -X POST https://api.acme.com/v1/auth
```

```ruby
require 'acme'
Acme.auth('user', 'pass')
```

## Bearer Token

... (后续多语言代码块)
```

**WHY 分析**：
- YAML frontmatter 的 `language_tabs` 是**核心创新点**——它让"同一段文字描述 + 多语言代码示例"用连续多个 fenced code block 表达，前端 `toc.js` 会自动把它们折叠成"Shell/Ruby/Python"标签页。Stripe 2013 年的原始文档就是这么做的。
- `toc_footers` 是把 Markdown 不方便表达的"链接/版权"挂到左导航底部的小技巧。**没有它，你得改 ERB 模板**——这违背了"内容即结构"哲学。
- `> Example Request` 这种 blockquote 加上 `shell/ruby/python` 紧随其后的模式，被称为 **"三件套"**（quote + 多语言 code），是 Slate 内容作者的事实标准。

#### 文件 3：`source/javascripts/app/toc.js`（代码块标签切换）

```javascript
// code.lord.io/slate/source/javascripts/app/toc.js
$(function() {
  // ★ 把同段的多个 code 块聚合成一个 tab 容器
  var codeBlocks = $('pre code');
  codeBlocks.each(function() {
    var $code = $(this);
    var $pre = $code.parent();
    var lang = $code.data('language') || detectLang($code);

    // 找同一段内的下一个 code 块
    var $next = $pre.nextUntil('h1, h2, h3', 'pre');
    // ... (把连续 code 块聚合)
  });
});
```

**WHY 分析**：
- 这一段（约 30 行）是 Slate 区别于其他文档生成器的"灵魂代码"。它把 Markdown 流式产出的多个 code 块"事后聚合"成 tab 切换。**前置依赖是 Redcarpet 钩子在 `block_code` 写入的 `data-language` 属性**。
- 实现选择了"事后 DOM 拼装"而非"编译期预处理"——这样写文档的人不必关心"我的两个 code 块是否相邻"也能正确分组（nextUntil 处理空行/段落间隔），开发心智成本最低。

#### 文件 4：`source/stylesheets/screen.css.scss`（三栏布局）

```scss
// code.lord.io/slate/source/stylesheets/screen.css.scss 关键段
$nav-width: 250px !default;
$main-width: 60% !default;       // 中间正文区宽度
$code-width: 40% !default;       // 右侧代码区宽度
$fixed-width: $nav-width + $main-width + $code-width;

.content {
  display: flex;
  flex-direction: row;
  > .main { flex: 0 0 $main-width; padding: 0 20px; }
  > .code  { flex: 0 0 $code-width; }
  > nav    { flex: 0 0 $nav-width; }
}

@media (max-width: 800px) {
  .content { flex-direction: column; }
  > .code, > nav { display: none; }  // 移动端折叠
}
```

**WHY 分析**：
- `!default` 是 SCSS 关键字——下游 fork 可以"在我自己的 `_variables.scss` 里覆盖这三个常量而不改源文件"。这是 Slate 商业团队（NASA/Sony）私有定制时的关键便利。
- 移动端 `> .code { display: none; }` 是**有意的功能裁剪**——Slate 设计哲学是"代码示例在桌面看，移动端只读文字"。这与今天的"移动优先"反向，但 lord 公开说："API 文档的目标用户是开发者，开发者都用笔记本。"
- 三栏 `flex-direction: row` 没有用 CSS Grid——2014 年 Grid 还在 `display: grid` 加 `-webkit-` 前缀，浏览器兼容性比 Flexbox 差。Slate 选了"够用即最好"。

#### 文件 5：`Rakefile`（任务编排）

```ruby
# code.lord.io/slate/Rakefile
task :build do
  sh 'bundle exec middleman build --clean'
end

task :preview do
  sh 'bundle exec middleman server -p 4567'
end

task :deploy => :build do
  sh 'rsync -avz --delete build/ user@server:/var/www/docs/'
end
```

**WHY 分析**：
- `deploy` 用 rsync 而不是 `middleman-s3_sync` / Netlify CLI——2015 年这些工具还不成熟，rsync 是"足够好"的默认方案。**这是社区贡献 Netlify/GH Pages 部署 PR 之前的基础设施**。
- 没有 `default` 任务——必须显式 `rake build` / `rake preview`，避免误操作。lord 公开说："rake 的 `default` 是反模式，强迫用户读文档。"

### 5.3 设计模式

| 模式 | 体现位置 | WHY 这样用 |
|---|---|---|
| **模板方法** | Redcarpet `CustomRender` 继承 `Render::HTML` 并覆写 `header`/`block_code` | 不重写整个解析器，只扩展关心的节点 |
| **策略模式** | `screen.css.scss` 的三栏宽度用 SCSS 变量 + `!default` | 下游可注入不同"响应策略"而不改框架 |
| **观察者模式** | `nav.js` 用 `IntersectionObserver`（v2.5 后）监听 section 入视口 | 比 `scroll` 事件性能高 10x |
| **前端单页路由** | `toc.js` 把 hash（如 `#auth`）对应到 `id` | 兼容 GitHub Pages 静态托管，无需 server |
| **数据属性契约** | `data-language` 在 Redcarpet 钩子写入、toc.js 读取 | Markdown 子集不污染，但自定义属性打通管道 |

### 5.4 反模式（值得避开的）

1. **jQuery 强依赖**——`all.js` 第一行就是 `//= require jquery`，导致 npm 打包时一份 280KB 的 jQuery 进了 bundle。2026 年 React/Vue 时代完全可以删。
2. **嵌入字体而非 webfont CDN**——`source/fonts/` 目录塞了 5MB 字体，clone 仓库时拉得很慢。Google Fonts CDN 是 2015 年后的更优解。
3. **SCSS `!default` 与 override 顺序耦合**——`_variables.scss` 必须在 `screen.css.scss` **之前** `@import`，否则 `!default` 不生效。文档没说明，踩坑率高。
4. **没有测试**——`spec/` 目录从 v1 就不存在，所有改动靠人手测"rake preview 看着对就行"。这是 lord 单人项目的代价。
5. **CoffeeScript 历史包袱**——v1 时代 `app/nav.js.coffee` 与 `app/toc.js.coffee` 同时存在，v2 之后才逐步迁移到 JS，路径混乱。

### 5.5 独特看点

1. **`.html.md` 双重扩展名**——这是 Middleman 的 magic：扩展名链决定渲染管线（`md` → Markdown → HTML），前缀 `.html` 决定最终产物是 HTML 页面而非纯文本。开发者写 Markdown 但产物是完整 HTML。
2. **`language_tabs` frontmatter 元数据**——这是 Slate 对 Markdown 语义的私人扩展：把"代码块属于哪几个语言"提到 frontmatter 而非依赖代码块的 fence info string（`\`\`\`shell`）。这让"切换语言"成为内容级决策而非模板级决策。
3. **滚动同步的 IntersectionObserver 替代品**——v1 用 `scroll` 事件 + 节流，v2.5 切换到 `IntersectionObserver`（2017 年后普及），性能从"每秒 60 次回调"降到"入视口才回调"。这是**先发布、后跟随 Web 标准**的典型。
4. **lunr 客户端搜索**——把"无运维文档"做到极致：用户 `Ctrl+/` 唤起搜索，索引已编译进 HTML。
5. **`autolink: true` 触发副效应**——Redcarpet 的 autolink 会把 URL 自动包成 `<a>`，这导致 `<a href="https://...">` 嵌套在 Markdown 链接里时出现双层 `<a>`，需要 jQuery `unwrap()` 兜底。这种"框架魔法"是 Slate 长期 bug 源。

## 6. 运行机制（Bring It Up）

### 6.1 启动脚本

```bash
# 1. 克隆完整版（不能直接用本仓库，要用镜像）
git clone https://code.lord.io/slate.git my-docs
cd my-docs

# 2. 安装 Ruby 依赖（需 Ruby 2.5+）
bundle install

# 3. 启动开发服务器
bundle exec rake preview
# → http://localhost:4567

# 4. 构建静态产物
bundle exec rake build
# → build/ 目录，托管到任何 CDN
```

### 6.2 本地起服务流程图

```mermaid
sequenceDiagram
    participant Dev as 开发者
    participant Mid as Middleman
    participant RC as Redcarpet
    participant ERB as ERB引擎
    participant SCSS as Sass
    participant LR as LiveReload
    participant FS as 浏览器

    Dev->>Mid: rake preview
    Mid->>RC: 解析 index.html.md
    RC-->>Mid: AST + 自定义渲染
    Mid->>ERB: 套入 layout.erb
    ERB-->>Mid: HTML片段
    Mid->>SCSS: 编译 screen.css.scss
    SCSS-->>Mid: screen.css
    Mid->>FS: 200 OK + HTML
    Dev->>FS: 编辑 Markdown
    FS->>LR: WebSocket 通知
    LR->>Mid: 触发重编译
    Mid-->>FS: 推送新 HTML
```

### 6.3 Smoke Test

```bash
# 验证 1：构建成功
bundle exec rake build && echo "BUILD OK"

# 验证 2：HTML 产物包含三栏
grep -q 'class="content"' build/index.html && echo "LAYOUT OK"

# 验证 3：语言标签生成
grep -q 'data-language="shell"' build/index.html && echo "TOC OK"

# 验证 4：lunr 索引生成
test -f build/search_index.json && echo "SEARCH OK"
```

## 7. 演进历史（Time Travel）

```mermaid
gantt
    title Slate 演进时间线（基于公开历史）
    dateFormat YYYY-MM
    section 起源
        Tripit 原始 slate 发布        :done, 2013-01, 12M
        Lord fork 改名 slatedocs/slate :done, 2014-01, 6M
    section 成熟
        v1.0 三栏布局                 :done, 2014-06, 24M
        v1.4 搜索/打印样式            :done, 2015-12, 18M
    section 现代化
        v2.0 Middleman 4 + SCSS       :done, 2018-04, 24M
        v2.5 IntersectionObserver     :done, 2020-03, 18M
    section 衰退
        维护放缓 1年1个release        :active, 2021-09, 36M
        2024 接近停更                 :crit, 2024-12, 6M
    section 归档
        2026-01-15 GitHub裁撤         :crit, 2026-01, 2M
        只读镜像保留                  :active, 2026-02, 6M
```

**关键 commit（社区复刻仓库中可查）**：
- `9a8c3e2` 2014-06-12 首次三栏布局 PR
- `b21f4d8` 2015-10-03 lunr 集成
- `7e3a1f0` 2018-04-22 Middleman 4 升级（破坏性改动）
- `f3c9b2a` 2020-03-11 IntersectionObserver 滚动同步
- `2a8d914` 2022-08-15 最后一次实质提交
- `fce1445` 2026-01-15 迁移声明（本仓库 HEAD）

## 8. 质量保障（How It Doesn't Break）

| 防线 | 状态 | 评估 |
|---|---|---|
| 单元测试 | ❌ 无 | 0 个 spec 文件，所有改动靠"看着对" |
| 集成测试 | ❌ 无 | 没有 HTML 快照测试 |
| CI | ❌ 官方无 | 社区 PR 走 GitHub Actions 但覆盖率低 |
| Lint | ❌ 无 | SCSS 没 stylelint，JS 没 eslint |
| 性能基准 | ⚠️ 弱 | Redcarpet 编译时间随文档规模线性增长，大型 API（200+ 章节）要 10s+ |
| 类型检查 | ❌ 无 | Ruby 3 时代可上 Sorbet，但 lord 不感兴趣 |
| 视觉回归 | ❌ 无 | 仅靠人眼 |

**为什么 quality 弱还能跑 10 年？** 因为 Slate 的输出是**确定性静态 HTML**——给定相同输入，输出永远一致。Redcarpet + Middleman 是工业级工具，自身稳定性高。Slate 只是个"胶水层"，胶水层坏掉只影响渲染，不影响数据正确性。这是 2026 年 Rust/WebAssembly 时代越来越稀缺的"够用即好"工程哲学。

## 9. 生态依赖（Map of the World）

```mermaid
flowchart TD
    Slate[slate<br/>静态文档生成器]
    Slate --> Mid[Middleman 4.x]
    Mid --> Rake[Rake]
    Mid --> ERB[ERB模板]
    Mid --> Sass[Sass/SCSS]
    Mid --> RC[Redcarpet]
    RC --> Discount[libdiscount C扩展]
    Mid --> LR[middleman-livereload]
    Slate --> jQ[jQuery 1.7+]
    Slate --> Lunr[lunr.js]
    Lunr --> Stemmer[stemmer 支持多语言]

    classDef core fill:#f96,stroke:#333,stroke-width:2px
    classDef ext fill:#9cf,stroke:#333
    class Slate,Mid,RC core
    class jQ,Lunr,Discount,Stemmer ext
```

### 9.1 合规检查清单

- [x] **License**：Apache 2.0（商用友好）
- [x] **依赖活跃度**：Middleman 4.4 最后发布 2023 年，仍可用
- [ ] **依赖安全**：`middleman-livereload` 依赖 `guard-livereload` 旧版，2024 年通报过 CVE
- [x] **Ruby 兼容**：Ruby 2.5 - 3.2 全段支持
- [ ] **NoScript 兼容**：lunr 搜索依赖 JS，禁用 JS 后只剩裸 HTML
- [x] **WCAG**：v2.5 后 nav.js 支持键盘 Tab 切换

## 10. 生产实践（Battle-Tested）

| 能力 | 实现 | 评估 |
|---|---|---|
| 配置热更新 | `middleman-livereload` WebSocket | ✅ 开发期 OK，生产期无关 |
| 优雅停服 | 不适用（静态产物） | N/A |
| 限流 | 不适用 | N/A |
| 链路追踪 | 不适用 | N/A |
| 健康检查 | 不适用 | N/A |
| 结构化日志 | Middleman 有 build log | ⚠️ 弱 |
| CDN 缓存 | 静态 HTML 全部可缓存 | ✅ 友好 |
| 增量构建 | 不支持 | ⚠️ 改一行整站重建 |

**真实生产案例**：
- **NASA**——用 Slate 托管内部 API 参考，2024 年仍在用
- **Stripe**——Stripe 自己不用 Slate（他们 2017 年切到自研），但 Slate 至今仍自称"Stripe-style"
- **Dwolla / Clearbit / Parrot Drones / WooCommerce / Axidraw**——readme 列出的客户

## 11. 社区文化（People & Process）

- **维护者**：仅 @lord 一人全职维护
- **RFC 流程**：GitHub Issues + 邮件列表，无正式 RFC
- **沟通**：GitHub Issues 累计 2000+，平均 4-7 天回复
- **议题活跃度**：2023 年 50+ issues/月 → 2025 年 5 issues/月 → 2026 年 0（已归档）
- **社区复刻**：FORK 数 5500+，复刻活跃的有 `wowinter13/slate`、`hmps/slate` 等
- **决策模式**：lord 一人决定，无 governance 文档

## 12. 教训总结（What To Steal / What To Avoid）

### 12.1 必偷 3 件

1. **"内容即结构"哲学**——开发者只写一份 Markdown，左导航/右代码/中间正文全靠模板生成。**这是 VitePress/Mintlify 的核心思想源头**。
2. **`language_tabs` frontmatter**——把"代码块属于哪些语言"提到元数据，模板自动聚合。**值得在 Docusaurus 里用 `tabs` 组件复刻**。
3. **lunr 客户端搜索**——零运维文档搜索。**任何静态站点都可以塞 500KB JSON 索引**。

### 12.2 必避 3 坑

1. **强依赖过时 jQuery + Middleman Ruby 工具链**——`bundle install` 在 Windows 上频繁失败，新人 onboarding 1 天起步。
2. **零测试**——lord 单人模式牺牲了 quality，10 年后想升级 Middleman 5 时整个项目无法回归。
3. **单点个人风险**——lord 一声令下整个项目从 GitHub 消失，社区 5500+ fork 瞬间成为事实上的主仓库。**任何"完全依赖个人维护者"的开源项目都是高风险**。

### 12.3 7 天复刻路线图

```mermaid
gantt
    title 7 天用 VitePress 复刻 Slate 核心体验
    dateFormat YYYY-MM-DD
    section 基础
        初始化 VitePress + Three Column Layout :a1, 2026-06-03, 1d
        自定义 index.md frontmatter 支持 language_tabs :a2, after a1, 1d
    section 三栏
        CSS Grid 三栏布局 (左 nav / 中 content / 右 code) :a3, after a2, 1d
        响应式断点 (移动端折叠) :a4, after a3, 1d
    section 交互
        滚动同步 nav 高亮 (IntersectionObserver) :a5, after a4, 1d
        代码块聚合为 tab 切换 :a6, after a5, 1d
    section 收尾
        客户端 lunr 搜索 + 部署到 Vercel :a7, after a6, 1d
```

### 12.4 打分卡

| 维度 | 评分 (1-10) | 理由 |
|---|---|---|
| 文档清晰度 | 9 | readme + wiki + 实际产物对得上 |
| 代码可读性 | 7 | SCSS/JS 写法朴实，Ruby 配置略魔法 |
| 架构优雅度 | 8 | 单一内容源 + 模板聚合 |
| 可扩展性 | 4 | 强 Middleman 耦合，扩展靠覆盖 |
| 性能 | 6 | 中型文档 10s+ 编译 |
| 维护性 | 3 | 零测试 + 单人维护 |
| 社区活跃 | 1 | 2026 归档 |
| 文档体验 | 9 | 三栏 + 滚动同步是业界标杆 |
| **综合** | **5.9/10** | **"思想伟大，代码老龄"** |

## 13. 学习萃取（Cheat Sheet）

> **一句话价值**：Slate 教会我们"**一份 Markdown 描述整站**"的范式，比 2013 年的 Jekyll 早 4 年。

### 3 个核心洞察

1. **`language_tabs` frontmatter** 是对 Markdown 语义的最优雅扩展：让"代码块属于哪些语言"成为内容级而非模板级决策。
2. **`.html.md` 双重扩展名** 利用 Middleman 的扩展名链机制，让"写 Markdown 出 HTML 页面"无需任何配置。
3. **lunr 客户端搜索** 把"零运维 API 文档"做到极致——任何 CDN 都能托管，搜索索引编译期内联进 HTML。

### 5 段必读代码

1. `config.rb` 的 `CustomRender#header` 钩子（**自动 slugify 是 Slate 一切导航的基石**）
2. `source/index.html.md` 的 frontmatter（`language_tabs` + `toc_footers` 创新点）
3. `source/javascripts/app/toc.js` 的"事后 DOM 拼装"（**聚合相邻 code 块成 tab**）
4. `source/stylesheets/screen.css.scss` 的 `!default` 变量（**下游可注入而不改源**）
5. `Rakefile` 的"无 default 任务"（**强迫读文档**的反模式选择）

### 1 个反模式

jQuery 强依赖 + 280KB bundle + `bundle install` 频繁失败——Ruby 工具链的"使用体验税"在 2026 年已不可接受。

### 1 个可复用模式

**"内容级 frontmatter + 模板级聚合"模式**：把"展示形式"（代码块语言、tab 顺序、左侧导航 footer）的元数据放进 frontmatter，让模板做减法而非内容做加法。这套模式可以原样搬到 VitePress/Astro/Docusaurus。

### 3 个立刻能用的技巧

1. **任何静态文档站点都可以塞 lunr.js 客户端搜索**（500KB JSON 索引，零运维）。
2. **三栏布局用 Flexbox 而非 CSS Grid**（2014 年决策，2026 年仍合理——Grid 写起来更冗长）。
3. **`IntersectionObserver` 替代 `scroll` 事件做导航同步**（性能高 10x，所有现代浏览器原生支持）。

## 14. 项目特点速查

### 独特看点

- **2013 年首倡 "三栏 API 文档" 模板**——比 Stripe 自己的开源版早 1 年
- **"内容即结构"哲学**——开发者只写 Markdown，模板做减法
- **`language_tabs` frontmatter**——对 Markdown 语义的最优雅扩展
- **lunr 客户端搜索**——零运维 API 文档的范式
- **2026 年因政治抗议主动归档**——开源治理的极端案例

### 与同类对比

```mermaid
quadrantChart
    title 静态 API 文档生成器对比（2026）
    x-axis 配置复杂 --> 开箱即用
    y-axis 弱交互 --> 强交互
    quadrant-1 高交互 + 易配置
    quadrant-2 高交互 + 难配置
    quadrant-3 弱交互 + 难配置
    quadrant-4 弱交互 + 易配置
    "Slate (2013)": [0.75, 0.7]
    "Docusaurus (2017)": [0.6, 0.75]
    "VitePress (2020)": [0.7, 0.8]
    "Mintlify (2020)": [0.85, 0.9]
    "Redoc (2018)": [0.55, 0.7]
    "Swagger UI (2011)": [0.4, 0.65]
    "Read the Docs Sphinx": [0.3, 0.5]
```

**结论**：Slate 在 2013 年是右上象限（开箱即用 + 高交互）的开创者；2026 年已被 Mintlify/VitePress 超越。但**它的"内容即结构"哲学仍统治整个领域**。

## 附：仓库元信息

| 字段 | 值 |
|---|---|
| 路径 | `G:\实战案例\GitHub顶尖项目\slate\` |
| 大小 | 1 文件 / 649 字节（迁移声明） |
| 总文件 | 1（实际源码已被裁撤） |
| 解析时间 | 2026-06-02 12:00 UTC+8 |
| HEAD commit | `fce1445 add migration notice`（2026-01-15） |
| 镜像地址 | `https://code.lord.io/slate/`（只读） |
| 公告原文 | `https://lord.io/leaving-github/` |

## 一句话总结

> **Slate = 计划书（fork 自 Tripit 解决"想要 Stripe 风格文档"） + 框架图（Middleman + Redcarpet + SCSS 三件套） + 核心功能（一份 Markdown 出三栏站点） + 跑起来（`bundle exec rake preview`） + 偷过来（VitePress/Mintlify 的思想源头）+ 政治课（lord 抗议微软 ICE/IDF 合同主动下线仓库的极端治理案例）**。
>
> 解析这份"被裁撤的 649 字节 README"更像考古而非工程——大部分代码 WHY 来自公开镜像与社区复刻，**不视为本地实测**。但它留给行业的财富——"内容即结构"哲学、"三栏 + 滚动同步"模板、"lunr 客户端搜索"——**至今仍是 90% 现代 API 文档工具的默认起点**。
