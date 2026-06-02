# Normalize.css - 跨浏览器一致性 CSS Reset 事实标准

**GitHub**: necolas/normalize.css
**Star**: 52k+
**语言**: CSS
**主题**: css、reset、normalize、cross-browser
**适用场景**: 跨浏览器样式统一、CSS reset、HTML5 元素默认样式

---

## 一、基础范式

### 模式 1 · Normalize vs Reset 哲学差异

**问题场景**：浏览器默认样式不统一，开发者要写大量 reset。

**解决方案**：Normalize.css 走「保留有用默认 + 修复 bug」哲学（HTML5 元素 display: block / 表单元素继承字体 / 修正 line-height），不是「清零所有样式」；Reset 把所有 margin/padding 清零。

**关键参数**：
- Normalize 哲学
- 保留有用
- 修复 bug
- 不清零
- 0 副作用

**最佳实践**：所有新项目用 Normalize.css 替代 Reset，更友好。

### 模式 2 · HTML5 元素 display 块级化

**问题场景**：IE / 老 Safari 不识别 HTML5 元素（article / section / aside / nav）。

**解决方案**：Normalize.css 给所有 HTML5 元素 `display: block`，避免 `<article>` 显示成 inline。

**关键参数**：
- HTML5 元素
- `display: block`
- IE 兼容
- 0 模板

**最佳实践**：所有项目用 Normalize.css，HTML5 元素自动块级。

### 模式 3 · 表单元素一致性

**问题场景**：Chrome / Firefox / Safari 表单元素样式不一致。

**解决方案**：Normalize.css 修正 `<button>` / `<input>` / `<select>` / `<textarea>` 字体继承（默认不继承父字体导致不同浏览器大小不一）；`button { cursor: pointer }` IE 修正。

**关键参数**：
- 字体继承
- 游标修复
- 表单元素
- 0 自定义
- 跨浏览器

**最佳实践**：所有项目用 Normalize.css，表单元素跨浏览器一致。

### 模式 4 · 边距与基线统一

**问题场景**：`<body>` / `<h1-h6>` / `<p>` / `<blockquote>` 等默认 margin 不一致。

**解决方案**：Normalize.css 统一 margin: 0 / margin-block: 1em（CSS3 逻辑属性），保持垂直节奏；`<figure>` `<dl>` 等也修正。

**关键参数**：
- 统一 margin
- 垂直节奏
- 逻辑属性
- `margin-block`
- 0 重复

**最佳实践**：所有项目用 Normalize.css，垂直节奏一致。

### 模式 5 · 字体与行高

**问题场景**：Chrome 字体大小不继承 `<body>`，IE9 浮动 `<figcaption>` 等 bug。

**解决方案**：Normalize.css 修正 `body { line-height: 1.15 }` / `figcaption { display: block }` / `[hidden] { display: none }` 等关键 bug。

**关键参数**：
- `line-height: 1.15`
- `[hidden]`
- `<figcaption>`
- 0 隐藏
- 跨浏览器

**最佳实践**：所有项目用 Normalize.css，基础排版一致。

---

## 二、扩展范式

### 模式 6 · 与现代 CSS Reset（Andy Bell / Josh Comeau）对比

**问题场景**：Normalize.css 8KB，体积稍大。

**解决方案**：现代 CSS reset 更激进：Andy Bell `* { margin: 0; padding: 0; box-sizing: border-box }`（100 字节）；Josh Comeau reset 加 `font: inherit`；Normalize.css 8KB 覆盖更全。

**关键参数**：
- Andy Bell 100B
- Josh Comeau 1KB
- Normalize.css 8KB
- 体积 vs 覆盖
- 0 重复

**最佳实践**：小型项目用 Andy Bell reset，中大型用 Normalize.css 完整。

### 模式 7 · 与 PostCSS 集成

**问题场景**：手工引入 Normalize.css 文件。

**解决方案**：`@import 'normalize.css';` 在主样式文件；或 PostCSS 插件 `postcss-normalize` 自动插入；Parcel / Vite 默认支持 `@import`。

**关键参数**：
- `@import`
- `postcss-normalize`
- 自动插入
- 0 手动
- 构建集成

**最佳实践**：所有项目用 PostCSS / Vite 自动处理 @import。

### 模式 8 · CSS 自定义属性（CSS Variables）增强

**问题场景**：Normalize.css 8.x 提供 CSS 变量 `--normalize-selector-color` 主题化。

**解决方案**：Normalize.css 8.x+ 支持 CSS 变量 `color: var(--normalize-selector-color, #2196f3)` 自定义；`@import` 时可覆盖。

**关键参数**：
- CSS Variables
- 8.x+
- 主题化
- 0 重复
- 可配置

**最佳实践**：所有项目用 Normalize.css 8.x+，享受 CSS 变量。

### 模式 9 · 与 CSS 框架集成（Tailwind / Bootstrap）

**问题场景**：CSS 框架有自己的 reset，需要选择。

**解决方案**：Tailwind CSS 内置 `preflight` 是简化版 Normalize；Bootstrap 5 内置 `Reboot`；Materialize 也有；选择其中一个避免重复。

**关键参数**：
- Tailwind preflight
- Bootstrap Reboot
- 避免重复
- 一个就够
- 0 冲突

**最佳实践**：用 Tailwind 不用额外 Normalize，用 Bootstrap 不用额外 reset。

### 模式 10 · 现代 CSS reset 5 选 1

**问题场景**：项目选哪个 reset。

**解决方案**：5 个候选：① Normalize.css 8KB 完整 ② Andy Bell 100B 激进 ③ Josh Comeau 1KB 现代 ④ Tailwind preflight 2KB ④ Modern CSS Reset 0.5KB；按项目大小选。

**关键参数**：
- 5 选 1
- 项目大小
- 体积权衡
- 0 重复
- 灵活

**最佳实践**：新小型项目用 Andy Bell reset，中大型用 Normalize.css 8.x。

---

## 三、进阶范式

### 模式 11 · 修复浏览器 Bug（10+ 个）

**问题场景**：浏览器一致性问题根除。

**解决方案**：Normalize.css 修复：① `button { overflow: visible }`（IE button 内 padding 异常）② `input[type='search']` 兼容 ③ `::-webkit-search-cancel-button` ④ `::-webkit-file-upload-button` ⑤ `[hidden] { display: none }` ⑥ SVG `vertical-align: middle` 等。

**关键参数**：
- 10+ bug 修复
- 浏览器细节
- 跨浏览器
- 0 漏修
- 稳定

**最佳实践**：所有项目用 Normalize.css，浏览器 bug 一次修完。

### 模式 12 · 暗色模式支持

**问题场景**：暗色模式需要适配。

**解决方案**：Normalize.css 9.x 实验性暗色模式 `@media (prefers-color-scheme: dark)` 内置；`<input>` / `<button>` 自动反色；自定义 `color-scheme: light dark` 属性。

**关键参数**：
- `prefers-color-scheme`
- 9.x 实验
- `color-scheme`
- 0 重复
- 现代

**最佳实践**：所有现代项目用 Normalize.css 9.x+ 暗色模式。

### 模式 13 · 国际化（i18n）

**问题场景**：需要 RTL（阿拉伯语）支持。

**解决方案**：Normalize.css 修正 `<body>` 文字方向；`<input>` / `<textarea>` 自动 RTL；`html[dir='rtl']` 配合使用。

**关键参数**：
- RTL 支持
- `<html dir="rtl">`
- 表单自动
- 0 重复
- 国际化

**最佳实践**：所有国际化项目用 Normalize.css，RTL 自动支持。

### 模式 14 · SVG 元素处理

**问题场景**：SVG `display: inline-block` 老 IE 异常。

**解决方案**：Normalize.css `svg { display: block; vertical-align: middle }`（IE11 bug）；现代浏览器 SVG 默认 `inline` 适合图标。

**关键参数**：
- SVG 块级
- IE11 兼容
- `vertical-align`
- 0 漏修
- 图标友好

**最佳实践**：所有项目用 Normalize.css，SVG 默认块级（避免基线偏移）。

### 模式 15 · CSS 优先级与继承

**问题场景**：用户样式（user agent stylesheet）与 Normalize.css 优先级。

**解决方案**：Normalize.css 用 `html { ... }` 元素选择器，优先级 (0,0,0,1) 低于用户 CSS (0,0,0,1,0+)；用户样式（如 `body { ... }`）优先级 (0,0,0,1) 同级，源码顺序后写优先。

**关键参数**：
- 元素选择器
- 优先级
- 后写优先
- 0 冲突
- 可预测

**最佳实践**：所有项目用 Normalize.css 在 main.css 之前 @import，优先级稳定。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭项目 CSS 基础。

**解决方案**：7 件套：① `@import 'normalize.css';` 入口 ② `box-sizing: border-box;` 全局 ③ 自定义变量（颜色 / 字体）④ 排版基础 ⑤ 工具类 ⑥ 组件库 ⑦ 暗色模式。

**关键参数**：
- normalize.css
- box-sizing
- CSS Variables
- 排版
- 工具类
- 组件
- 暗色模式

**最佳实践**：所有项目用 7 件套 + Normalize.css 8.x+。

### 模式 17 · 与设计系统集成

**问题场景**：设计系统 + Normalize.css 共存。

**解决方案**：`@import 'normalize.css'; @import 'design-system.css';` 顺序引入；设计系统基于 Normalize.css 之上构建；不要重复重置同一属性。

**关键参数**：
- 顺序引入
- 不重复
- 设计系统
- 0 冲突
- 一致性

**最佳实践**：所有设计系统用 Normalize.css 作为底座，避免重置冲突。

### 模式 18 · 性能优化 5 招

**问题场景**：CSS 体积 / 加载慢。

**解决方案**：5 招优化：① 选用合适 reset（小项目 Andy Bell）② PostCSS 自动 tree-shake 未用 ③ `<link rel="preload">` 预加载 ④ 合并到 single file ⑤ 启用 HTTP/2 多路复用。

**关键参数**：
- 合适 reset
- tree-shake
- preload
- 合并
- HTTP/2

**最佳实践**：5 招组合，CSS 加载 < 100ms。

### 模式 19 · 与 Reset / Reboot / Preflight / Sanitize.css 对比

**问题场景**：CSS reset 选型。

**解决方案**：Normalize.css 定位「保留有用 + 修复 bug」适合中大型；Reset 定位「激进清零」已过时；Bootstrap Reboot 定位「Bootstrap 内置」用 Bootstrap 必选；Tailwind Preflight 定位「Tailwind 内置」用 Tailwind 必选；Sanitize.css 定位「更激进版本 Normalize」。

**关键参数**：
- 哲学：Normalize 友好 > Sanitize > Preflight ≈ Reboot > Reset
- 体积：Reset 100B < Preflight 2KB < Sanitize 5KB < Normalize 8KB
- 跨浏览器：Normalize > Sanitize > Preflight ≈ Reboot > Reset
- 集成：框架内置 = 独立 reset

**最佳实践**：用框架用框架内置，独立项目用 Normalize.css 8.x+。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想做内部 CSS reset。

**解决方案**：7 天分 5 步：① HTML5 元素块级化 ② 表单元素字体继承 ③ 边距统一 ④ 修复 10+ 浏览器 bug ⑤ 添加 CSS 变量主题化。

**关键参数**：
- Day 1: HTML5
- Day 2: 表单
- Day 3: 边距
- Day 4: bug 修复
- Day 5: 变量
- Day 6-7: 文档

**最佳实践**：7 天复刻「极简 reset」，完整 Normalize.css 复刻需要 2 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\necolas\normalize.css\`
- **大小**: ~1 MB
- **总文件数**: 数十 CSS 文件
- **关键 commit**: v8.0.x（最新稳定）
- **作者**: Nicolas Gallagher + 社区
- **许可**: MIT

## 一句话总结

Normalize.css 用「保留有用默认 + 修复浏览器 bug + 8.x CSS 变量主题化 + 跨浏览器一致性」成为 CSS reset 领域的事实标准（HTML5 时代），是所有需要跨浏览器一致性的项目必备。
