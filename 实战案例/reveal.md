# Reveal.js - Web 演示文稿框架

**GitHub**: hakimel/reveal.js
**Star**: 70k+
**语言**: JavaScript
**主题**: presentation、slideshow、markdown、web
**适用场景**: 技术演讲、HTML 演示文稿、Markdown 幻灯片、互动展示

---

## 一、基础范式

### 模式 1 · 垂直 + 水平嵌套幻灯片

**问题场景**：传统 PPT 单层结构难表达分章节内容。

**解决方案**：reveal.js 用垂直（section）+ 水平（section）嵌套结构：顶层 section 是水平幻灯片，内嵌 section 是垂直子页；`→/↓/Space` 切换。

**关键参数**：
- `<section>` 节点
- 垂直 + 水平
- `Reveal` 全局
- 键盘 / 触摸 / 滚轮
- 嵌套无限

**最佳实践**：所有技术演讲用 reveal.js，告别 PowerPoint。

### 模式 2 · 单页应用（SPA）初始化

**问题场景**：幻灯片是 Web 页面，需要初始化。

**解决方案**：`Reveal.initialize({ controls, progress, slideNumber, hash: true, transition: 'slide' })` 一行初始化；事件 `slidechanged` / `ready` 监听。

**关键参数**：
- `Reveal.initialize`
- 配置项
- 事件监听
- SPA 加载
- 0 配置启动

**最佳实践**：所有 reveal.js 项目首屏 `Reveal.initialize`，5 分钟跑起来。

### 模式 3 · Markdown 内容（data-markdown）

**问题场景**：HTML 写幻灯片繁琐，Markdown 更顺手。

**解决方案**：`<section data-markdown="slides.md" data-separator="---" data-separator-vertical="--">` 外部 Markdown 文件分隔；`markdown: { smartypants: true }` 排版。

**关键参数**：
- `data-markdown`
- `data-separator`
- `data-separator-vertical`
- `---` 水平
- `--` 垂直

**最佳实践**：所有内容驱动演讲用 Markdown 写幻灯片，告别 HTML。

### 模式 4 · 主题系统（theme CSS）

**问题场景**：需要不同风格的主题（黑 / 白 / 简约 / 商务）。

**解决方案**：`theme: 'black' / 'white' / 'league' / 'beige' / 'sky' / 'night' / 'serif' / 'simple' / 'solarized' / 'blood' / 'moon'` 11 内置主题；`css/theme/<name>.css` 引用。

**关键参数**：
- 11 内置主题
- `theme: 'black'`
- `css/theme/`
- 自定义主题
- 0 配置

**最佳实践**：所有项目用内置主题起步，需要时自定义 CSS。

### 模式 5 · 片段动画（Fragments）

**问题场景**：需要分步展示内容（要点逐条出现）。

**解决方案**：`<li class="fragment">` 标记片段；`data-fragment-index="1"` 控制顺序；`fragment` 事件监听；多种出现动画 `fade-in` / `fade-up` / `grow` / `shrink` / `strike` 等 14 种。

**关键参数**：
- `class="fragment"`
- `data-fragment-index`
- 14 种动画
- 顺序控制
- 0 脚本

**最佳实践**：所有需要分步讲解的演讲用 fragment，UX 提升 5x。

---

## 二、扩展范式

### 模式 6 · 演讲者备注（Speaker Notes）

**问题场景**：演讲时需要看备注（自己看，不投影）。

**解决方案**：`Reveal.initialize({ showNotes: true })` + `<aside class="notes">这是我的备注</aside>`；按 `s` 打开演讲者窗口（独立窗口显示备注 + 计时 + 下一张预览）。

**关键参数**：
- `<aside class="notes">`
- `showNotes: true`
- `s` 演讲者视图
- 计时器
- 预览

**最佳实践**：所有演讲用 `s` 打开演讲者视图，专业感 10x。

### 模式 7 · 自动播放（autoSlide + progress bar）

**问题场景**：需要自动循环播放（展台 / 大屏）。

**解决方案**：`Reveal.initialize({ autoSlide: 5000, loop: true })` 5 秒自动切换 + 循环；`autoSlideStoppable: false` 禁止手动停；进度条显示。

**关键参数**：
- `autoSlide: 5000`
- `loop: true`
- 进度条
- 0 干预
- 展台模式

**最佳实践**：所有展台 / 大屏场景用 autoSlide 循环。

### 模式 8 · 导出 PDF

**问题场景**：演讲后想给观众发 PDF 备份。

**解决方案**：`Reveal.initialize({ pdf: true })` + 浏览器打开 `?print-pdf` 或 `?paper` 触发 PDF 模式；`Ctrl+P` 打印为 PDF（含分页）。

**关键参数**：
- `pdf: true`
- `?print-pdf`
- 浏览器打印
- PDF 导出
- 0 服务端

**最佳实践**：所有重要演讲用 PDF 备份，观众友好。

### 模式 9 · Multiplex（多客户端同步）

**问题场景**：主控端控制所有观众端幻灯片同步。

**解决方案**：`Reveal.initialize({ multiplex: { secret: ..., id: ..., url: 'https://reveal-multiplex.glitch.me/' } })` 主控端 secret 推，观众端 id 收；socket.io 通信。

**关键参数**：
- `multiplex.secret`
- `multiplex.id`
- socket.io
- 主从同步
- 0 配置

**最佳实践**：所有大型会议 / 在线教学用 multiplex 同步幻灯片。

### 模式 10 · 代码高亮（highlight.js）

**问题场景**：演讲中需要展示代码。

**解决方案**：`<pre><code class="hljs language-python">print("hello")</code></pre>` + highlight.js 自动高亮；50+ 主题可选。

**关键参数**：
- `class="hljs"`
- `language-xxx`
- 50+ 主题
- 行号插件
- 0 配置

**最佳实践**：所有代码演讲用 highlight.js，告别纯文本。

---

## 三、进阶范式

### 模式 11 · 自定义背景（data-background）

**问题场景**：每页幻灯片需要不同背景（图片 / 视频 / 渐变 / iframe）。

**解决方案**：`<section data-background="bg.png" data-background-video="loop.mp4" data-background-color="#ff0000" data-background-iframe="url">` 多种背景类型。

**关键参数**：
- `data-background-image`
- `data-background-video`
- `data-background-color`
- `data-background-iframe`
- 多类型

**最佳实践**：所有沉浸式演讲用 data-background，UX 提升 10x。

### 模式 12 · 过渡动画（transitions）

**问题场景**：幻灯片切换要平滑。

**解决方案**：`Reveal.initialize({ transition: 'slide' })` 6 种：none / fade / slide / convex / concave / zoom；`transition-speed: 'slow' / 'default' / 'fast'`。

**关键参数**：
- 6 种过渡
- `transition: 'slide'`
- 速度
- 全局
- 0 配置

**最佳实践**：所有演讲用 `slide` 或 `fade`，专业感。

### 模式 13 · 事件 API（slidechanged / ready）

**问题场景**：需要在幻灯片切换时执行脚本（埋点 / 演示）。

**解决方案**：`Reveal.on('slidechanged', event => { console.log(event.indexh, event.indexv) })` 监听；`Reveal.on('ready', ...)` 初始化完成；`Reveal.addEventListener` 别名。

**关键参数**：
- `Reveal.on('slidechanged')`
- `Reveal.on('ready')`
- 事件订阅
- 埋点
- 0 轮询

**最佳实践**：所有需要埋点 / 互动的演讲用事件 API。

### 模式 14 · 跳转 API（Reveal.slide / getIndices）

**问题场景**：需要代码内跳转指定幻灯片。

**解决方案**：`Reveal.slide(2, 1)` 跳第 3 张第 2 子页；`Reveal.getIndices()` 取当前 `{ h, v, f }`；`Reveal.getTotalSlides()` 总数。

**关键参数**：
- `Reveal.slide(h, v)`
- `Reveal.getIndices()`
- 总数
- 编程式
- 0 手动

**最佳实践**：所有需要跳页的演讲用 Reveal.slide API。

### 模式 15 · 插件系统（Reveal.registerPlugin）

**问题场景**：需要扩展 reveal.js（图表 / MathJax / 搜索）。

**解决方案**：`Reveal.registerPlugin(MyPlugin)` 注册自定义插件；`plugin.init(Reveal)` 初始化钩子；官方插件 `RevealNotes` / `RevealSearch` / `RevealZoom` / `RevealMath`。

**关键参数**：
- `Reveal.registerPlugin`
- `plugin.init`
- 官方插件
- 自定义
- 可扩展

**最佳实践**：所有高级需求用插件（MathJax / 图表 / 搜索）。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 reveal.js 演讲。

**解决方案**：7 件套：① `index.html` 入口 ② `<section>` 幻灯片结构 ③ `Reveal.initialize` 启动 ④ 主题 CSS ⑤ Markdown 内容 ⑥ 代码高亮 ⑦ 演讲者备注。

**关键参数**：
- index.html
- section
- initialize
- theme
- markdown
- highlight
- notes

**最佳实践**：所有新演讲用 7 件套，5 分钟跑起来。

### 模式 17 · Markdown 全流程

**问题场景**：纯 Markdown 写完整演讲。

**解决方案**：`<section data-markdown="slides.md" data-separator="---" data-separator-vertical="--" data-separator-notes="^Note:">`；`^Note:` 备注分隔符；外部 md 文件维护。

**关键参数**：
- data-markdown
- 水平 / 垂直 / 备注分隔
- 外部 md
- Git 版本控制
- 0 HTML

**最佳实践**：所有内容驱动演讲用 Markdown + Git，团队协作 10x。

### 模式 18 · 性能优化 5 招

**问题场景**：大型 reveal.js 演讲加载慢。

**解决方案**：5 招优化：① 压缩图片 ② 延迟加载非首屏 ③ highlight.js 按需加载语言 ④ 减少 fragment 数量 ⑤ CDN 加速。

**关键参数**：
- 图片压缩
- 延迟加载
- 按需语言
- 减少 fragment
- CDN

**最佳实践**：5 招组合，大型演讲首屏 < 1s。

### 模式 19 · 与 Slidev / Spectacle / Marp 对比

**问题场景**：Web 演示框架选型。

**解决方案**：reveal.js 定位「HTML + JS 老牌 + 嵌套 + 主题丰富」适合经典；Slidev 定位「Vue + Vite + Markdown」适合开发者；Spectacle 定位「React + JSX」适合 React 项目；Marp 定位「纯 Markdown → PPT/PDF」适合 Markdown 极简。

**关键参数**：
- 学习曲线：Marp < reveal.js < Slidev < Spectacle
- 主题：reveal.js > Slidev > Spectacle > Marp
- 适合开发者：Slidev > Spectacle > reveal.js > Marp
- 适合演讲者：reveal.js > Slidev > Spectacle > Marp

**最佳实践**：内容驱动选 Marp / Slidev，演示丰富选 reveal.js，React 项目选 Spectacle。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork reveal.js 做内部演示框架。

**解决方案**：7 天分 5 步：① DOM 结构 + CSS 过渡 ② 键盘事件 + 切换逻辑 ③ Fragment 动画 ④ 主题切换 ⑤ Markdown 解析。

**关键参数**：
- Day 1-2: DOM + CSS
- Day 3: 键盘
- Day 4: Fragment
- Day 5: 主题
- Day 6-7: Markdown

**最佳实践**：7 天复刻「极简 reveal.js」，完整 reveal.js 复刻需要 3 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\reveal.js\`
- **大小**: ~20 MB
- **总文件数**: 数百 JS / CSS 文件
- **关键 commit**: v5.x
- **作者**: Hakim El Hattab + 社区
- **许可**: MIT

## 一句话总结

Reveal.js 用「垂直 + 水平嵌套 + 主题丰富 + Fragment 动画 + Markdown 内容 + 演讲者视图」让 Web 演示文稿达到 PPT 体验，是技术演讲的事实标准。
