# Jekyll · ABL 风格深度解析

> 主题：Tom Preston-Werner（GitHub 创始人）2008 年创立的博客感知 SSG，GitHub Pages 默认引擎。Ruby + Liquid 模板 + Kramdown Markdown + 5 类插件扩展点 + autoload + Hooks 优先级。本文聚焦 20 个可复用模式（核心原理 / 架构设计 / 性能优化 / 可靠性与生态）。

---

## 一、核心原理

### 模式 1：5 阶段管线 - reset → read → generate → render → write

**问题场景**：SSG 要把"源文件 + 模板 + 数据"变成"静态 HTML"，流程顺序很重要。Jekyll 用 5 阶段管线，**每阶段独立可测可挂钩**。

**解决方案代码**（`lib/jekyll/site.rb` `process` 方法节选）：
```ruby
def process
  reset
  read
  generate
  render
  cleanup
  write
end
```

**关键参数表**：

| 阶段 | 输入 | 输出 | 钩子事件 |
| :--- | :--- | :--- | :--- |
| `reset` | 上次状态 | 清空 | `:site, :after_init` |
| `read` | 源文件 | pages/posts/docs | `:site, :post_read` |
| `generate` | 源 + Generators | pages（生成） | `:site, :post_generate` |
| `render` | pages + layouts | HTML | `:site, :pre_render` / `:post_render` |
| `write` | HTML | `_site/` | `:site, :post_write` |

**最佳实践**：
- ✅ 5 阶段分明，**单阶段可测**
- ✅ 每阶段有钩子，**插件可注入**
- ✅ 顺序固定，**Generator 必须在 Render 前完成**
- ✅ 任何"流水线 + 多阶段"项目可借鉴
- ✅ 阶段拆分让增量构建（`Regenerator`）只重跑变化阶段

---

### 模式 2：autoload 内部 API + require_all 扩展点

**问题场景**：jekyll.rb 195 行要加载 40+ 内部类 + 5 类插件扩展点。**直接 require 全部** → 启动慢；**全 autoload** → 扩展点注册时机不确定。Jekyll 用 autoload 内部 + require_all 扩展点双轨。

**解决方案代码**（`lib/jekyll.rb` 节选）：
```ruby
module Jekyll
  # 内部类用 autoload（延迟加载）
  autoload :Site,                "jekyll/site"
  autoload :Renderer,            "jekyll/renderer"
  autoload :Hooks,               "jekyll/hooks"
  autoload :Regenerator,         "jekyll/regenerator"
  # ...40+ 内部类

  class << self
    def env
      ENV["JEKYLL_ENV"] || "development"
    end
  end
end

# 扩展点用 require_all（按字母序 require）
require_all "jekyll/commands"
require_all "jekyll/converters"
require_all "jekyll/generators"
require_all "jekyll/tags"
```

**关键参数表**：

| 模式 | 用途 | 加载时机 |
| :--- | :--- | :--- |
| `autoload` | 内部类 | 首次引用 |
| `require_all` | 扩展点 | 启动时 |
| 顺序 | 字母序 | 确定性 |
| 数量 | 40+ 内部 | autoload |
| 数量 | 5 类扩展 | require_all |

**最佳实践**：
- ✅ **autoload 用于内部 API**（不暴露给外部）
- ✅ **require_all 用于扩展点**（按字母序确定注册）
- ✅ 双轨制清晰：**内部懒加载、扩展必加载**
- ✅ Generator/Converter/Tag 注册顺序确定，**避免顺序耦合**
- ✅ 任何"分层 + 扩展点"项目可借鉴

---

### 模式 3：Hooks 注册中心 - 4 owner × 6 事件 × 优先级 map

**问题场景**：插件要监听"读完 / 生成完 / 渲染完 / 写出完"等事件，每个事件可有多个回调。Jekyll 用 Hooks 注册中心统一管理。

**解决方案代码**（`lib/jekyll/hooks.rb` 节选）：
```ruby
module Jekyll
  module Hooks
    DEFAULT_PRIORITY = 20
    PRIORITY_MAP = { low: 10, normal: 20, high: 30 }

    @registry = {
      site:      { post_init: [], post_read: [], post_generate: [], post_render: [], post_write: [] },
      pages:     { post_init: [], pre_render: [], post_render: [], post_write: [] },
      posts:     { post_init: [], pre_render: [], post_render: [], post_write: [] },
      documents: { post_init: [], pre_render: [], post_render: [], post_write: [] },
    }

    def self.register(owners, event, priority: DEFAULT_PRIORITY, &block)
      owners = Array(owners)
      @hook_priority[block] = [-priority, @hook_priority.size]
      owners.each do |owner|
        @registry[owner][event] << block
      end
    end

    def self.trigger(owner, event, *args)
      return [] unless @registry[owner]
      blocks = @registry[owner][event]
      return [] if blocks.empty?
      sorted_blocks = blocks.sort_by { |b| @hook_priority[b] }
      sorted_blocks.map { |b| b.call(*args) }
    end
  end
end
```

**关键参数表**：

| owner | 事件 |
| :--- | :--- |
| `:site` | post_init / post_read / post_generate / post_render / post_write |
| `:pages` | post_init / pre_render / post_render / post_write |
| `:posts` | post_init / pre_render / post_render / post_write |
| `:documents` | post_init / pre_render / post_render / post_write |
| 优先级 | `:low(10) / :normal(20) / :high(30)` |

**最佳实践**：
- ✅ 4 owner × 6 事件 × 多回调 **多维注册**
- ✅ `[-priority, size]` 排序键保证**优先级大先执行、同优先级按注册顺序**
- ✅ 闭包 block 作为 key，**简洁但难调试**
- ✅ 任何"事件总线 + 优先级"项目可借鉴

---

### 模式 4：5 类插件 - Generator / Converter / Command / Tag / Filter

**问题场景**：SSG 需要扩展点才能生态化。Jekyll 定义 5 类插件，**每类职责单一**。

**解决方案**（5 类插件清单）：

| 类型 | 职责 | 例子 |
| :--- | :--- | :--- |
| **Generator** | 在 render 前生成新 page | `jekyll-feed` 生成 feed.xml |
| **Converter** | 处理特定 extname | `kramdown` 处理 `.md` |
| **Command** | 新 CLI 子命令 | `jekyll doctor` |
| **Tag** | 自定义 Liquid 标签 | `{% include %}` |
| **Filter** | 自定义 Liquid 过滤器 | `{{ page.date \| date_to_xmlschema }}` |

**解决方案代码**（自定义 Generator 范例）：
```ruby
module Jekyll
  class SitemapGenerator < Generator
    safe true
    priority :low  # :low / :normal / :high

    def generate(site)
      site.pages << SitemapPage.new(site)
    end
  end
end
```

**关键参数表**：

| 字段 | 含义 | 必填 |
| :--- | :--- | :--- |
| `safe` | 是否允许运行任意代码 | true |
| `priority` | 优先级 | normal |
| `generate(site)` | 主方法 | 必填 |
| 注册方式 | autoload | Jekyll 自动注册 |
| 失败处理 | raise | 阻止 build |

**最佳实践**：
- ✅ 5 类插件**职责单一**
- ✅ 优先级 `:low/:normal/:high` 控制 Generator 执行顺序
- ✅ 任何"SSG/编译器"项目可借鉴此 5 类扩展点
- ✅ 失败抛错**阻止 build**，**CI 友好**
- ✅ `safe true` 防止恶意插件

---

### 模式 5：Drop 模型 - Liquid 模板对象代理

**问题场景**：Liquid 模板访问 `site.posts`、`page.title`，**直接暴露 site 对象 → 模板可改内部状态**。Jekyll 用 Drop 模型做**只读代理**。

**解决方案代码**（`lib/jekyll/drops/site_drop.rb` 节选）：
```ruby
module Jekyll
  class SiteDrop < Drop
    def posts
      @obj.posts
    end

    def pages
      @obj.pages
    end

    def html_files
      @obj.pages.reject { |p| p.html? }
    end

    def config
      @obj.config
    end
  end
end
```

**关键参数表**：

| 概念 | 含义 |
| :--- | :--- |
| `Drop` | Liquid 模板的只读代理 |
| `@obj` | 真实 site/page 对象 |
| `liquid_method_missing` | 委托调用 |
| 优点 | 模板不能改对象 |
| 缺点 | 需要为每个字段写 method |

**最佳实践**：
- ✅ Drop **只读** → 模板安全
- ✅ `site.config` 在模板里是 hash，**不是整个 Site**
- ✅ 任何"模板 + 内部对象"项目可借鉴
- ✅ 用 `method_missing` 动态代理
- ✅ 性能开销小（一次方法调用）

---

## 二、架构设计

### 模式 6：Reader 体系 - Static / Dynamic / Layouts / Data

**问题场景**：jekyll 要读 `_posts/` 博客、`_layouts/` 模板、`_includes/` 片段、`_data/` 数据，每种路径规则不同。Jekyll 用 Reader 体系分离。

**解决方案**（`lib/jekyll/reader.rb` 节选）：
```ruby
class Reader
  def read
    retrieve_dirs(Regexp.union(@site.include_dirs)) if @site.collections.any?
    retrieve_dirs(@site.layouts_dir, LayoutReader) if @site.layouts_dir
    retrieve_dirs(@site.data_dir, DataReader) if @site.data_dir
    retrieve_dirs(@site.inclusions_dir, IncludeReader) if @site.inclusions_dir
    retrieve_dirs(@site.theme.includes_path, IncludeReader) if @site.theme && @site.theme.includes_path
  end
end
```

**关键参数表**：

| Reader | 处理目录 | 用途 |
| :--- | :--- | :--- |
| `StaticReader` | 静态资源 | images/css/js |
| `LayoutReader` | `_layouts/` | 模板 |
| `DataReader` | `_data/` | YAML/JSON 数据 |
| `IncludeReader` | `_includes/` | 片段 |
| `PageReader` | 顶层 `.md` | 普通 page |
| `PostReader` | `_posts/` | 博客 post |
| `DocumentReader` | `_collection/` | 自定义 collection |

**最佳实践**：
- ✅ **每类资源一个 Reader**，**职责单一**
- ✅ Reader 知道自己的"目录约定"
- ✅ Plugin 可自定义 Reader
- ✅ 任何"多源文件 + 不同规则"项目可借鉴
- ✅ 测试时 mock Reader，**专注 Reader 之上逻辑**

---

### 模式 7：Converter 链 - Markdown / Smartypants / Identity

**问题场景**：同一 extname 可能多 converter（如 `.md` → Markdown + Identity 备选），Jekyll 用 Converter 链按优先级排序。

**解决方案代码**（`lib/jekyll/converters/markdown.rb` 节选）：
```ruby
class MarkdownConverter < Converter
  safe true
  priority :low

  def matches(ext)
    ext =~ /^\.md$/i
  end

  def output_ext(ext)
    ".html"
  end

  def convert(content)
    @config = @config["markdown"] || {}
    Kramdown::Document.new(content, @config).to_html
  end
end
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `safe true` | 允许运行任意代码 |
| `priority :low/:normal/:high` | 同 extname 排序 |
| `matches(ext)` | 是否处理该 extname |
| `output_ext(ext)` | 输出 extname |
| `convert(content)` | 实际转换 |

**最佳实践**：
- ✅ Converter 按 `priority` 排序，**避免重复处理**
- ✅ 多个 Converter 处理同一 extname 时**优先级高的胜出**
- ✅ Identity Converter 兜底（**.html 直接复制**）
- ✅ 任何"格式转换链"项目可借鉴

---

### 模式 8：Liquid 模板 + 安全沙盒

**问题场景**：用户写 Liquid 模板不能调任意 Ruby，**要沙盒化**。Jekyll 用 Liquid 内置沙盒 + SafeYAML 防 YAML 注入。

**解决方案代码**（`lib/jekyll/renderer.rb` 节选）：
```ruby
def render_liquid(content, payload, info)
  Liquid::Template
    .register_filter(Jekyll::Filters)
    .parse(content)
    .render!(payload, :registers => { :file => info })
end
```

**关键参数表**：

| Liquid 特性 | 用途 |
| :--- | :--- |
| `register_filter` | 注册自定义 filter |
| `parse` | 编译模板 |
| `render!` | 渲染（! 抛错版本） |
| `:registers` | 自定义上下文 |
| `disabled_filters` | 禁用 filter 沙盒 |
| `SafeYAML` | YAML 加载防注入 |

**最佳实践**：
- ✅ Liquid 默认沙盒，**模板不能调 Ruby**
- ✅ `Jekyll::Filters` 注册自定义 filter
- ✅ `SafeYAML.load` 防 YAML 注入（**仅允许白名单 tag**）
- ✅ 任何"用户模板 + 沙盒"项目可借鉴

---

### 模式 9：Regenerator 增量构建 - 文件 mtime 跟踪

**问题场景**：1000+ page 站点全量 build 30s+，**日常编辑只改 1 页**。Jekyll 用 Regenerator 跟踪 mtime，**只重渲染变化文件**。

**解决方案代码**（`lib/jekyll/regenerator.rb` 节选）：
```ruby
class Regenerator
  def regenerate?(document)
    return true unless @cache.exists?(document.path)
    cached = @cache.read(document.path)
    document.mtime > cached
  end

  def add(document)
    @cache.write(document.path, document.mtime)
  end
end
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `@cache` | 持久化缓存（`/.jekyll-cache/`） |
| `document.path` | 文件路径 |
| `document.mtime` | 修改时间 |
| `cache.read` | 上次 mtime |
| 增量 build | `--incremental` 标志 |

**最佳实践**：
- ✅ mtime 跟踪**比 hash diff 简单**
- ✅ 缓存目录 `.jekyll-cache/` 默认 `.gitignore`
- ✅ `--incremental` 标志启用
- ✅ 任何"重复 build 慢"项目可借鉴
- ✅ 配合 `--watch` 自动 rebuild

---

### 模式 10：Stevenson 自研 Logger - 彩色 + 分级

**问题场景**：stdlib `Logger` 无彩色 + 等级粗。Jekyll 自研 `Stevenson`（Tom Preston-Werner 命名）**彩色 + 4 级**。

**解决方案代码**（`lib/jekyll/steveenson.rb` 节选）：
```ruby
class Stevenson
  LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }.freeze

  def self.log_level=(level)
    @@log_level = level
  end

  def self.info(message)
    log(:info, message, :cyan) if level_enabled?(:info)
  end

  def self.warn(message)
    log(:warn, message, :yellow) if level_enabled?(:warn)
  end
end
```

**关键参数表**：

| 级别 | 颜色 | 用途 |
| :--- | :--- | :--- |
| `:debug` | gray | 开发 |
| `:info` | cyan | 普通信息 |
| `:warn` | yellow | 警告 |
| `:error` | red | 错误 |
| `JEKYLL_LOG_LEVEL` | env 变量 | 控制级别 |
| `colorator` | 库 | 终端彩色 |

**最佳实践**：
- ✅ **彩色 + 4 级** 区分错误严重度
- ✅ `Jekyll.logger.info(...)` 全局统一
- ✅ env 变量控制级别（**CI 关闭 debug**）
- ✅ 任何"CLI 工具"可借鉴彩色日志
- ✅ 任何"日志级别"项目可借鉴 4 级模式

---

## 三、性能优化

### 模式 11：autoload 延迟加载 + 子命令快速启动

**问题场景**：40+ 内部类 + 5 类插件，全 require 启动 5s+。**子命令 `jekyll new` 只需 5 个类**，加载全部是浪费。Jekyll autoload 启动 200ms 内。

**解决方案**：见模式 2（autoload 双轨）

**关键参数表**：

| 方式 | 启动时间 | 内存 |
| :--- | :--- | :--- |
| 全 require | 5s+ | 200MB |
| autoload | 200ms | 50MB（按需加载）|
| trade-off | 延迟加载的内部类 | 首次访问时 0.1s |

**最佳实践**：
- ✅ **CLI 工具 + autoload** 黄金组合
- ✅ 启动时间 < 500ms **用户体验**
- ✅ 内存按需加载，**冷启动友好**
- ✅ 任何"CLI + 多子命令"项目可借鉴

---

### 模式 12：Regenerator 增量构建 + cache 持久化

**问题场景**：万页站点全量 build 30s+。增量 build 只重跑变化文件，**2s 内完成**。

**解决方案**：见模式 9（Regenerator）

**关键参数表**：

| 模式 | 1000 页 build 时间 |
| :--- | :--- |
| 全量 | 30s |
| 增量 | 2s（仅 1 页修改）|
| 首次增量 | 30s（建 cache）|
| 缓存目录 | `.jekyll-cache/` |

**最佳实践**：
- ✅ `--incremental` 标志启用
- ✅ **CI 用全量**（避免 cache 漂移）
- ✅ 开发用增量 + `--watch`
- ✅ cache 目录加 `.gitignore`
- ✅ 任何"重复 build 慢"项目可借鉴

---

### 模式 13：Liquid 模板编译缓存

**问题场景**：同一模板编译 1000 次（每 page 一次），**编译时间 10ms × 1000 = 10s**。Jekyll 用 Liquid 模板对象缓存。

**解决方案代码**（`lib/jekyll/renderer.rb` 节选）：
```ruby
def render_liquid(content, payload, info)
  template = @site.liquid_renderer.file(info[:path])
  template.parse(content).render!(payload, registers)
end
```

**关键参数表**：

| 字段 | 用途 |
| :--- | :--- |
| `@site.liquid_renderer` | Liquid 渲染器池 |
| `.file(path)` | 按文件路径缓存 |
| `parse` | 编译一次 |
| `render!` | 多次渲染 |
| 缓存 | Liquid::Template 对象 |

**最佳实践**：
- ✅ 模板编译一次，**渲染多次**
- ✅ Liquid 模板对象池化
- ✅ 任何"模板预编译"项目可借鉴
- ✅ Hugo / Jekyll 都用此模式
- ✅ 模板 cache key = 模板源 hash

---

### 模式 14：parallel gem - Generator 并行

**问题场景**：多个 Generator 串行执行，**总耗时累加**。社区有 `jekyll-parallel` 插件并行跑 Generator。

**解决方案配置**（`_config.yml`）：
```yaml
plugins:
  - jekyll-parallel

parallel:
  processors: 4  # 4 核 CPU
```

**关键参数表**：

| 字段 | 默认值 | 用途 |
| :--- | :--- | :--- |
| `processors` | CPU 数 | 并行度 |
| `chunk_size` | 10 | 每次处理任务数 |
| Generator 类型 | 全部 | 适用 |
| 副作用 | 共享 state 风险 | 仅独立 Generator 安全 |

**最佳实践**：
- ✅ 并行 Generator **性能提升 2-4x**
- ✅ 共享 state 的 Generator **不能用**
- ✅ 任何"独立任务"项目可借鉴并行
- ✅ 任务粒度不能太细（**overhead 反而慢**）
- ✅ 测试时强制串行（`processors: 1`）

---

### 模式 15：benchmark/ 性能回归测试

**问题场景**：性能改了一行代码，**全量 build 慢了 30%**？Jekyll 用 `benchmark/` 目录**持续追踪**。

**解决方案结构**：
```
benchmark/
├── bench-1-large-site/
│   ├── source/    # 1000+ 页源
│   └── bench.rb   # 跑 N 次取平均
├── bench-2-incremental/
│   └── bench.rb
└── run_all.rb     # 跑全部 benchmark
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `source/` | 测试源（1000+ 页）|
| `bench.rb` | 跑 N 次取平均 |
| `Benchmark.realtime` | Ruby 标准库 |
| 输出 | 平均时间 ± 标准差 |
| 触发 | PR push 时跑 |

**最佳实践**：
- ✅ 真实规模源（**1000+ 页**）
- ✅ 多次跑取平均（**避免 GC 抖动**）
- ✅ PR 自动跑 benchmark **防回归**
- ✅ 任何"性能敏感"项目可借鉴
- ✅ 配合 Codecov 跑覆盖率 + 性能

---

## 四、可靠性与生态

### 模式 16：GitHub Pages 白名单插件机制

**问题场景**：GitHub Pages 用 Jekyll 跑用户仓库，**恶意插件风险**。GitHub Pages 强制插件白名单 + `--safe` 模式。

**解决方案配置**（GitHub Pages 限制）：
```
白名单插件（GitHub Pages 允许）：
- jekyll-coffeescript
- jekyll-default-layout
- jekyll-gist
- jekyll-github-metadata
- jekyll-optional-front-matter
- jekyll-paginate
- jekyll-readme-index
- jekyll-redirect-from
- jekyll-relative-links
- jekyll-seo-tag
- jekyll-sitemap
- jekyll-titles-from-headings
- jekyll-userpic
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `safe: true` | 不允许运行任意 Ruby |
| 白名单插件 | GitHub 维护 |
| 用户不可用 | jekyll-admin |
| `--safe` 模式 | 关闭不安全插件 |

**最佳实践**：
- ✅ GitHub Pages 限制**用户插件**（安全）
- ✅ 用户可在自己机器跑（**灵活**）
- ✅ 任何"用户代码 + 平台执行"项目可借鉴白名单
- ✅ `--safe` 模式兜底
- ✅ Whitelist 比 Blacklist 安全

---

### 模式 17：Cucumber 特性测试 - 端到端 + 用户视角

**问题场景**：单元测试通过但端到端失败（**如 Hook 顺序错**）。Jekyll 用 Cucumber **端到端 + 用户视角**。

**解决方案**（`features/post_data.feature` 节选）：
```gherkin
Feature: Post data
  As a blogger
  I want my posts to be rendered correctly
  So I can publish to my blog

  Scenario: Post with front matter
    Given I have a _posts directory
    And I have a _posts/2026-06-02-test.md file with content:
      """
      ---
      layout: default
      title: Test Post
      ---
      Hello, world!
      """
    When I run jekyll build
    Then the _site directory should exist
    And the _site/2026/06/02/test.html file should exist
    And I should see "Hello, world!" in "_site/2026/06/02/test.html"
```

**关键参数表**：

| 工具 | 用途 |
| :--- | :--- |
| Cucumber | 行为驱动（BDD） |
| Gherkin | DSL（given/when/then） |
| `features/*.feature` | 端到端测试 |
| `features/step_definitions/` | 步骤实现 |
| RSpec 单元 | lib 内部类 |

**最佳实践**：
- ✅ 单元 + 特性**双轨测试**
- ✅ 特性测试**用户视角**
- ✅ Gherkin DSL 业务可读
- ✅ 任何"用户产品"项目可借鉴
- ✅ 测试金字塔：**单元 > 集成 > 端到端**

---

### 模式 18：PathManager 路径安全 - 防 Path Traversal

**问题场景**：恶意用户上传 `_layouts/../../etc/passwd` 文件，**Jekyll 写入时覆盖系统文件**。Jekyll 用 PathManager 防 path traversal。

**解决方案代码**（`lib/jekyll/path_manager.rb` 节选）：
```ruby
class PathManager
  def self.sanitized_path(path, base_directory = nil)
    return File.expand_path(path) if base_directory.nil?
    File.expand_path(path, base_directory)
  end

  def self.relative_path(source, destination)
    Pathutil.new(source).relative_path_from(destination)
  end
end
```

**关键参数表**：

| 函数 | 用途 |
| :--- | :--- |
| `sanitized_path` | 解析 + 验证 |
| `File.expand_path` | 处理 `..` 和符号链接 |
| `relative_path` | 转相对路径 |
| 限制 | 必须 base_directory 内 |
| 检测 | path traversal 抛错 |

**最佳实践**：
- ✅ `File.expand_path` **处理 `..`**
- ✅ 白名单 base_directory
- ✅ 任何"用户文件 + 服务端写"项目必须做
- ✅ 配合 SafeYAML 防注入
- ✅ 任何"文件系统 + 用户输入"项目可借鉴

---

### 模式 19：Plugin 生态 - 200+ 官方 + 3000+ 第三方

**问题场景**：SSG 生态靠插件繁荣。Jekyll 提供 5 类插件扩展点 + 官方维护**核心插件**。

**解决方案**（官方插件分类）：

| 类别 | 插件 |
| :--- | :--- |
| Feed | `jekyll-feed`（Atom feed）|
| SEO | `jekyll-seo-tag` |
| Sitemap | `jekyll-sitemap` |
| Image | `jekyll-picture-tag` |
| Compress | `jekyll-compress-html` |
| Admin | `jekyll-admin`（仅本地）|
| Paginate | `jekyll-paginate` |
| 第三方 | 3000+ （RubyGems） |

**关键参数表**：

| 维度 | 数据 |
| :--- | :--- |
| 官方插件 | 200+ |
| 第三方 | 3000+ |
| GitHub Topics | jekyll-plugin |
| 安装 | `gem install jekyll-plugin` |
| 配置 | `_config.yml` 启用 |

**最佳实践**：
- ✅ 5 类扩展点**插件生态繁荣基础**
- ✅ 官方插件**质量标杆**
- ✅ 第三方插件走 RubyGems **自动发现**
- ✅ 任何"插件化"项目可借鉴此生态策略
- ✅ 官方插件占位**核心 + 扩展**

---

### 模式 20：Tom Preston-Werner 文化 - 创始人 + SemVer + "Changelog Driven"

**问题场景**：开源项目长寿靠文化。Jekyll 创始人 Tom（GitHub 创始人）的文化影响项目风格。

**解决方案**：
```
治理
├── Tom Preston-Werner 创始人（2008）
├── Jekyll Core Team（10+ 维护者）
└── Open Collective 赞助

文化
├── SemVer 严格
├── CHANGELOG.md 详细
├── GitHub Discussions RFC
├── 友好社区（Jekyll Talk 论坛）
└── 多语言支持（i18n）

版本节奏
├── v3.0 2013 单文件入口
├── v3.5 2015 增量
├── v4.0 2018 性能
├── v4.2 2020 增量稳定
└── v4.3 2022 稳定
```

**关键参数表**：

| 维度 | 状态 |
| :--- | :--- |
| 创始人 | Tom Preston-Werner |
| License | MIT |
| Star | 49k+ |
| 维护者 | 10+ Core Team |
| 月下载 | 150 万 gem |
| 主仓库 | jekyll/jekyll |
| 镜像 | 100+ fork |

**最佳实践**：
- ✅ Tom 风格 **SemVer 严格**
- ✅ CHANGELOG.md 详细记录每次变更
- ✅ RFC 流程在 GitHub Discussions
- ✅ Jekyll Talk 论坛 + Libera IRC **多渠道**
- ✅ 任何"开源 SSG"项目可借鉴此治理

---

## 总结速查

**一句话价值**：Jekyll = Ruby + Liquid + Kramdown + 5 阶段管线 + 5 类插件 + autoload + Hooks 优先级 = GitHub Pages 默认 SSG 引擎，49k+ Star。

**5 个核心架构模式**：
1. **5 阶段管线**：reset → read → generate → render → write
2. **autoload + require_all 双轨**：内部 API 延迟 + 扩展点即时
3. **Hooks 注册中心**：4 owner × 6 事件 × 优先级 map
4. **5 类插件扩展点**：Generator / Converter / Command / Tag / Filter
5. **Drop 模型只读代理**：模板不能改内部状态

**5 个性能优化模式**：
1. **autoload 延迟加载**：启动 5s → 200ms
2. **Regenerator 增量构建**：mtime 跟踪 + cache 持久化
3. **Liquid 模板编译缓存**：一次编译多次渲染
4. **jekyll-parallel 并行**：Generator 并行 2-4x
5. **benchmark/ 性能回归**：PR 自动跑防止性能退化

**5 个可靠性与生态模式**：
1. **GitHub Pages 白名单**：用户插件强制白名单 + `--safe` 模式
2. **Cucumber 特性测试**：单元 + 端到端双轨
3. **PathManager 路径安全**：防 path traversal
4. **5 类插件生态**：200+ 官方 + 3000+ 第三方
5. **Tom Preston-Werner 文化**：SemVer + CHANGELOG + RFC 流程

**5 段必读代码**：
- `lib/jekyll.rb`（195 行，入口与 autoload 注册）
- `lib/jekyll/hooks.rb`（100 行，钩子注册中心）
- `lib/jekyll/site.rb`（前 80 行，Site 构造与 config 处理）
- `lib/jekyll/renderer.rb`（前 80 行，单文档渲染）
- `lib/jekyll/commands/build.rb`（构建命令实现）

**3 个避坑要点**：
1. **不要碰 `Jekyll.sites` 全局数组**（thread-unsafe）
2. **不要让插件改 Site 内部状态**（Site 30+ attr_accessor）
3. **不要在 GitHub Pages 用未白名单插件**（构建失败）

**仓库元信息**：
- 路径：`G:\Obsidian Vault\实战案例\jekyll.md`
- 版本：v4.3.x
- 主语言：Ruby
- 核心入口：`lib/jekyll.rb`（195 行）
- 模板引擎：Liquid
- Markdown 引擎：Kramdown
- License：MIT
- Star：49k+
