# PostCSS - CSS 转换的 AST 处理引擎

**GitHub**: postcss/postcss
**Star**: 28k+
**语言**: JavaScript
**主题**: css、ast、postcss、tooling
**适用场景**: CSS 预处理（autoprefixer / postcss-preset-env）、CSS 模块化、代码检查、构建管线

---

## 一、基础范式

### 模式 1 · CSS → AST → CSS 流水线

**问题场景**：CSS 是纯文本，难以编程处理（加前缀 / 转换单位 / 检查错误）。

**解决方案**：PostCSS 把 CSS 解析为 AST（`Root` → `Rule` → `Declaration` → `AtRule`），插件遍历修改节点，再 `stringify` 还原为 CSS；类似 Babel 处理 JS 的思路。

**关键参数**：
- `postcss.parse(css)` 解析
- `root.walkRules()` 遍历
- `rule.walkDecls()` 遍历声明
- `postcss.stringify(root, builder)` 输出
- Source map 支持

**最佳实践**：所有需要编程处理 CSS 的场景（autoprefixer / stylelint / cssnano）都用 PostCSS AST。

### 模式 2 · Root / Rule / Declaration / AtRule / Comment 五件套

**问题场景**：AST 节点类型多，关系复杂。

**解决方案**：PostCSS AST 5 类节点：`Root`（根）/`Rule`（选择器 + 节点）/`AtRule`（@media / @keyframes）/`Declaration`（属性: 值）/`Comment`（注释）；`Container` 是 `Root` / `Rule` / `AtRule` 的父类。

**关键参数**：
- `Root.walk()`
- `Rule.selector` / `Rule.nodes`
- `Declaration.prop` / `Declaration.value`
- `AtRule.name` / `AtRule.params`
- `Container.push()` / `Container.walk()`

**最佳实践**：所有插件都基于这 5 类节点操作，避免直接字符串拼接。

### 模式 3 · 插件机制（postcss.plugin 工厂）

**问题场景**：需要复用 CSS 处理逻辑。

**解决方案**：`postcss.plugin('name', (opts) => { return (root, result) => {...} })` 工厂声明插件；访问者模式 + `walkRules` / `walkDecls` 遍历节点。

**关键参数**：
- `postcss.plugin(name, fn)`
- `(root, result) => {...}` 访问者
- `result.warn(msg, node)` 警告
- `decl.clone()` 克隆节点
- `rule.remove()` 删除

**最佳实践**：所有自定义 CSS 处理用 `postcss.plugin` 工厂，可独立发布 npm。

### 模式 4 · 解析器（Parser）+ 字符串化器（Stringifier）

**问题场景**：需要自定义 CSS 语法（如 SCSS / LESS / CSS Modules 局部）。

**解决方案**：PostCSS 用 `Parser` 接口（`parse(css)` 返回 Root）和 `Stringifier` 接口（`stringify(node, builder)` 输出 CSS）；SCSS / LESS / SugarSS 各自提供自定义 parser。

**关键参数**：
- `postcss.parse(css, { parser: scssParser })`
- 自定义 `Parser` / `Tokenizer`
- 自定义 `Stringifier`
- `postcss.stringify(root, builder)`
- 多种方言支持

**最佳实践**：所有 CSS 方言（SCSS / LESS）通过自定义 Parser 接入 PostCSS 生态。

### 模式 5 · Source Maps 双向追踪

**问题场景**：CSS 处理后报错位置难定位。

**解决方案**：PostCSS 维护 `source` 属性（输入文件）+ `sourceMap` 选项，`result.map` 输出 source map，浏览器 DevTools 自动关联原始 `.scss` / `.less`。

**关键参数**：
- `from: 'src/app.css'` 输入
- `to: 'dist/app.css'` 输出
- `map: { inline: false }` 独立 map
- `result.map` 输出
- `prev` 链式 source map

**最佳实践**：所有 PostCSS 链路（Vite / Webpack）传 `from` / `to` 启用 source map，调试效率提升 10x。

---

## 二、扩展范式

### 模式 6 · autoprefixer 前缀自动添加

**问题场景**：手写 `-webkit-` / `-moz-` / `-ms-` 前缀难维护。

**解决方案**：autoprefixer 读取 `browserslist` 数据 + Can I Use 数据库，自动给需要的声明加前缀；`flexbox: 'no-2009'` 等老语法兼容。

**关键参数**：
- `browserslist` 配置
- `autoprefixer({ grid: true })` 网格
- `flexbox: 'no-2009'`
- Can I Use 数据
- 0 配置

**最佳实践**：所有项目 autoprefixer + browserslist，零手动前缀。

### 模式 7 · postcss-preset-env 未来语法

**问题场景**：CSS 新特性（`color()` / `:has()` / `nesting`）浏览器未支持。

**解决方案**：postcss-preset-env 类似 Babel for CSS，自动把 CSS 新语法降级到目标浏览器支持；Stage 0/1/2/3/4 阶段配置。

**关键参数**：
- `stage: 2` 阶段
- `features.nesting-rules`
- `browserslist` 目标
- CSS Custom Properties 编译
- 自动降级

**最佳实践**：所有新项目用 postcss-preset-env，今天写未来 CSS。

### 模式 8 · CSS Modules（postcss-modules）

**问题场景**：需要 CSS 局部作用域（避免类名冲突）。

**解决方案**：postcss-modules 把 `.btn` 编译为 `.btn_hash123`，`composes` 实现类组合，导出 JS 对象供 JSX 用：`import s from './a.module.css'`。

**关键参数**：
- `localsConvention: 'camelCase'`
- `composes: globalClass from './global.css'`
- `getJSON` 导出
- `generateScopedName` 自定义
- 局部作用域

**最佳实践**：所有 React / Vue 项目用 postcss-modules + `*.module.css` 命名约定。

### 模式 9 · CSS Nano 压缩优化

**问题场景**：生产 CSS 体积大，需要压缩。

**解决方案**：cssnano 是 PostCSS 生态压缩器，剥离空白 / 合并相同规则 / 优化 calc / 合并媒体查询；`preset: 'default'` 集成 30+ 优化插件。

**关键参数**：
- `cssnano({ preset: 'default' })`
- 合并媒体查询
- 优化 calc
- 合并规则
- 30+ 优化

**最佳实践**：所有生产 CSS 走 cssnano，体积减少 30-50%。

### 模式 10 · stylelint 代码检查

**问题场景**：CSS 代码风格不统一，有错误难发现。

**解决方案**：stylelint 是 PostCSS 生态的 ESLint；100+ 规则（`declaration-block-no-duplicate-properties` / `selector-class-pattern` / `no-descending-specificity`）；`.stylelintrc.json` 配置。

**关键参数**：
- `stylelint.config`
- `plugins: ['stylelint-order']`
- 100+ 规则
- `--fix` 自动修复
- IDE 集成

**最佳实践**：所有项目用 stylelint + stylelint-config-standard，零代码风格问题。

---

## 三、进阶范式

### 模式 11 · 自定义语法（Custom Syntax）

**问题场景**：需要支持 SCSS / LESS / SugarSS。

**解决方案**：`postcss-scss` / `postcss-less` / `sugarss` 等自定义 parser/stringifier；`postcss([plugins], { syntax: scss })` 指定语法。

**关键参数**：
- `postcss-scss`
- `postcss-less`
- `sugarss` 缩进语法
- `syntax` 选项
- parser 链

**最佳实践**：所有 SCSS 项目用 `postcss-scss` parser，stylelint 才能正确解析嵌套。

### 模式 12 · 访问者模式（Visitor Pattern）

**问题场景**：插件需要遍历特定类型节点。

**解决方案**：PostCSS 提供 `walkRules` / `walkDecls` / `walkAtRules` / `walkComments` 4 个遍历方法 + `Container.each`（可删除安全）；`once` 选项只触发一次。

**关键参数**：
- `walkRules(rule => {...})`
- `walkDecls(/^border/, decl => {...})` 过滤
- `walkAtRules('media', ...)`
- `Container.each` 遍历
- `once: true`

**最佳实践**：所有插件用 walk 方法而非字符串处理，性能 + 安全。

### 模式 13 · 节点操作 API

**问题场景**：需要增删改查 AST 节点。

**解决方案**：PostCSS 提供完整 CRUD API：`node.clone()` 克隆 / `node.remove()` 删除 / `node.replaceWith()` 替换 / `node.next()` / `node.prev()` / `container.insertBefore()` / `container.append()`。

**关键参数**：
- `decl.clone({ value: 'red' })` 克隆改属性
- `rule.removeAll()` 清空
- `rule.replaceWith(other)`
- `rule.append(decl)`
- `insertBefore / insertAfter`

**最佳实践**：所有节点修改都用 PostCSS API，避免手动 `stringify` 再 `parse`。

### 模式 14 · 警告与错误（result.warn）

**问题场景**：插件需要抛出警告 / 错误。

**解决方案**：`result.warn('msg', { node })` 抛出警告，PostCSS 收集到 `result.warnings()`；Vite / Webpack 集成后会在控制台显示位置。

**关键参数**：
- `result.warn(msg, { node })`
- `result.warnings()` 数组
- 位置信息
- PostCSS 9+ 默认不抛错
- `node.source` 定位

**最佳实践**：所有插件用 `result.warn` 而非 `throw`，避免构建中断。

### 模式 15 · PostCSS 与构建工具集成

**问题场景**：Vite / Webpack / Rollup 怎么集成 PostCSS。

**解决方案**：Vite 内置 PostCSS（`postcss.config.js` 自动检测）；Webpack 用 `postcss-loader`；Rollup 用 `rollup-plugin-postcss`；所有工具统一读取 `postcss.config.js` / `.postcssrc.json`。

**关键参数**：
- Vite 内置
- `postcss-loader` Webpack
- `postcss.config.js`
- 自动检测
- `plugins` 数组

**最佳实践**：所有项目用 `postcss.config.js` 统一插件配置，构建工具自动加载。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 PostCSS 工具链。

**解决方案**：7 件套：① `postcss.config.js` 配置 ② `autoprefixer` 前缀 ③ `postcss-preset-env` 未来语法 ④ `cssnano` 压缩 ⑤ `stylelint` 检查 ⑥ `postcss-modules` 局部 ⑦ `browserslist` 目标。

**关键参数**：
- `postcss.config.js`
- autoprefixer
- preset-env
- cssnano
- stylelint
- CSS Modules
- browserslist

**最佳实践**：所有新项目 7 件套模板，5 分钟跑起来现代 CSS 工具链。

### 模式 17 · PostCSS 插件开发流程

**问题场景**：需要写自定义 PostCSS 插件。

**解决方案**：5 步开发：① `postcss.plugin('name', opts => (root, result) => {...})` 工厂 ② `root.walkRules` / `walkDecls` 遍历 ③ `decl.clone({ value: '... ' })` 修改 ④ `result.warn('msg', { node })` 提示 ⑤ 写测试（`postcss({ from: undefined }).process()` 验证）。

**关键参数**：
- `postcss.plugin` 工厂
- walk 遍历
- 节点 API
- warn
- 测试

**最佳实践**：所有自定义 CSS 逻辑用 `postcss.plugin` 独立发布。

### 模式 18 · 性能优化 5 招

**问题场景**：PostCSS 处理大项目慢。

**解决方案**：5 招优化：① 缓存解析结果（`postcss([...]).process(css, { from: ..., to: ... })`）② `once: true` 避免重复 ③ 节点用 `clone` 复用 ④ 避免无谓的 `walk` ⑤ 并行 `Promise.all` 处理多文件。

**关键参数**：
- 缓存
- `once: true`
- 节点复用
- 避免 walk
- 并行

**最佳实践**：5 招叠加，大型项目构建时间减半。

### 模式 19 · 与 Sass / Less / Stylus 对比

**问题场景**：CSS 预处理器选型。

**解决方案**：Sass / Less / Stylus 是「带语法 + 编译」的预处理器；PostCSS 是「AST + 插件」的工程化引擎，可处理 Sass / Less / 原生 CSS。Sass 适合复杂逻辑（mixin / function），PostCSS 适合工程化（autoprefixer / 压缩）。

**关键参数**：
- Sass：mixin + function + 嵌套
- Less：变量 + mixin（轻量）
- PostCSS：AST + 插件
- PostCSS 可处理 Sass 编译后
- 互补关系

**最佳实践**：逻辑用 Sass，工程化用 PostCSS，二者组合用。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork PostCSS 做内部 CSS 工具。

**解决方案**：7 天分 5 步：① Tokenizer 词法分析 ② Parser 语法分析（递归下降） ③ AST 节点类（Root / Rule / Declaration / AtRule / Comment） ④ Stringifier 输出 ⑤ 遍历 API（walk / each）。

**关键参数**：
- Day 1-2: Tokenizer
- Day 3: Parser
- Day 4: AST 节点
- Day 5: Stringifier
- Day 6: 遍历 API
- Day 7: 文档

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 PostCSS 复刻需要 3 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\postcss\`
- **大小**: ~5 MB
- **总文件数**: 数十 JS 核心文件
- **关键 commit**: v8.4.x
- **作者**: Andrey Sitnik + Autoprefixer 作者 + 社区
- **许可**: MIT

## 一句话总结

PostCSS 用「CSS → AST → CSS」流水线把 CSS 变成可编程对象，autoprefixer / postcss-preset-env / cssnano / stylelint 都基于它是现代 Web 工程化的事实标准 CSS 引擎。
