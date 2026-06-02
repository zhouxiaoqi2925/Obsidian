# less.js - 工业级 CSS 预处理器：Parser → AST → Visitor 三段式 + 5 Pass 编译管线

**GitHub**: less/less.js
**Star**: 17k+
**语言**: JavaScript (Node + Browser)
**主题**: css-preprocessor / dynamic-stylesheet / mixin / function / variable
**适用场景**: 中大型 Web 项目 CSS 工程化 / 主题切换 / 响应式样式 / 旧项目渐进式升级

```
lib/less/tree/      # AST 节点（Ruleset/Declaration/Expression）
lib/less/visitors/  # Visitor 遍历（变量/Mixin/嵌套）
lib/less/parse.js   # 词法 + 语法 Parser
lib/less/index.js   # 主入口（render/parse/refresh）
bin/lessc           # CLI 二进制
```

## 第一段：基础范式

### 模式 1：Parser → AST → Visitor 三段式

**问题场景**：CSS 预处理器要解析 `.less` 文件成抽象语法树（AST），再做变量替换、Mixin 展开、嵌套展平。

**解决方案**：less.js 用三段式：① `Parser` 把源码切成 token 流生成 AST（`Ruleset / Declaration / Expression / Operation` 节点）② `Visitor` 树遍历执行替换（变量查找、Mixin 注入、运算求值）③ `ImportVisitor` 单独处理 `@import` 递归；AST 节点类型丰富支持完整语义。

**关键参数**：
- `Parser` 词法 + 语法
- AST 节点 `Ruleset`
- `Visitor` 遍历
- `ImportVisitor` 递归
- `tree` 模块

**最佳实践**：理解 less.js 源码从 `lib/less/tree/` 起步；所有转换都是 AST 节点操作；扩展自定义函数走 `tree/functions.js`；性能调优看 `Visitor.visit` 缓存。

---

### 模式 2：lessc CLI + Node API

**问题场景**：CSS 预处理器要"命令行编译 + 库 API 调用 + 浏览器运行时"3 种使用场景。

**解决方案**：`lessc input.less output.css` CLI 命令行单文件编译；`lessc --watch` 监听变更；`lessc --source-map` 生成 sourcemap；Node API `less.render(input, options, callback).then` 返回 `{ css, map, imports }`；浏览器版本 `<script src="less.js"></script>` + `<link rel="stylesheet/less" href="main.less">` 实时编译。

**关键参数**：
- `lessc input output` CLI
- `--watch` 监听
- `--source-map` 调试
- `less.render()` Node API
- 浏览器 `<link rel="stylesheet/less">`

**最佳实践**：现代项目用 `less-watch-compile` 或 `gulp-less` 自动编译**不要**浏览器运行时（性能差）；Node API 走 `less.render` Promise 风格；CI 用 `lessc --strict-math on` 严格数学。

---

### 模式 3：变量 + 嵌套 + Mixin 3 武器

**问题场景**：CSS 硬编码颜色/尺寸散落几百处，改一次要全局搜索；嵌套选择器写重复代码。

**解决方案**：3 武器：① `@primary: #4285f4;` 变量声明 ② `&:hover { color: @primary; }` 嵌套 + `&` 父选择器引用 ③ `.border-radius(@r) { border-radius: @r; }` Mixin 函数 + `.border-radius(4px)` 调用。3 武器组合替代 60% 重复 CSS。

**关键参数**：
- `@var: value` 变量
- `&` 父选择器
- `.mixin(@arg)` 函数
- `@arguments` 全参
- `+:` / `+_:` 合并

**最佳实践**：变量名语义化 `@brand-primary` 不 `c1`；Mixin 参数必填给默认值 `.btn(@bg: @primary)`；嵌套**最多** 3 层（4 层难维护）；变量在 `:root` 声明走 CSS Custom Properties 双轨。

---

### 模式 4：运算 + 函数 + 单位处理

**问题场景**：CSS 写 `@width: 100px; @width: @width * 2;` 直接给 200px，跨单位换算麻烦。

**解决方案**：`@w: 100px; @w2: @w * 2;` 数学运算支持 +、-、*、/；`round(3.6)` / `ceil(3.2)` / `floor(3.8)` / `percentage(0.5)` 内置函数；`@var: ~"calc(100% - 20px)";` 字符串转义绕过编译；`unit(@w, px)` 强制换单位。运算结果自动推导单位。

**关键参数**：
- `+ - * /` 运算
- `round/ceil/floor`
- `percentage()` 百分比
- `~"..."` 转义
- `unit(@x, em)` 换算

**最佳实践**：运算结果单位自动推导（`5px * 2 = 10px`）；`~"calc(@a + @b)"` 保留 calc 表达式让浏览器算；不混用 `px` 和 `em` 单位；用 `darken(@primary, 10%)` 而**不是**写死颜色。

---

### 模式 5：5 Pass 编译管线

**问题场景**：从 `.less` 源码到 `.css` 输出要经过多个阶段（解析、变量替换、Mixin 展开、嵌套展平、压缩）。

**解决方案**：5 Pass 管线：① Parse（源码 → AST）② Process（变量 + Mixin + 函数求值）③ Join（嵌套展平，Ruleset 合并）④ PrependPrefixes（autoprefixer 简化版）⑤ Compress（CSS 压缩）。每个 Pass 单独 `less.parse / less.process / less.joinTree` 可独立调用。

**关键参数**：
- 5 阶段管线
- `parse` 词法
- `process` 求值
- `joinTree` 展平
- `compress` 压缩

**最佳实践**：调试 less 编译慢用 `--verbose` 看每阶段耗时；自定义函数在 `process` 阶段注册；`tree.join()` 手动展平自定义树；`compress: true` 生产**必**开。

---

## 第二段：扩展范式

### 模式 6：环境抽象（Environment / FileManager）

**问题场景**：less.js 跑在 Node 能读文件，浏览器不能读，框架嵌入（webpack）要从内存取。

**解决方案**：`Environment` 抽象运行时环境（paths / mime / encoding）；`FileManager` 抽象文件 IO（`getFile / writeFile`）；3 内置实现（`NodeFileManager` / `BrowserFileManager` / `MemoryFileManager`）；`addImport` 注入虚拟文件。框架集成（less-loader）走 MemoryFileManager 走 webpack module。

**关键参数**：
- `Environment` 抽象
- `FileManager` IO
- 3 内置实现
- `addImport` 注入
- `paths` 路径配置

**最佳实践**：写插件走 `Environment` + 自定义 `FileManager`；测试时用 `MemoryFileManager` 模拟；`globalVars` / `modifyVars` 注入全局变量无需修改源文件；less-loader 走 `paths: [resolve('src/less')]`。

---

### 模式 7：ImportVisitor + @import 递归

**问题场景**：`@import "common.less";` 嵌套引用要递归解析 + 合并 + 路径处理。

**解决方案**：`ImportVisitor` 在 Process 阶段遍历 AST 找 `Import` 节点；按路径策略（`@import (less) / (inline) / (reference) / (once) / (multiple)`）走对应处理；递归深度 + 循环引用检测。`inline` 把目标 less 当字符串内联；`reference` 不输出只引 Mixin。

**关键参数**：
- `@import (less)` 解析
- `@import (inline)` 内联
- `@import (reference)` 引用
- `@import (once)` 单次
- `@import (multiple)` 多次

**最佳实践**：大型项目 `@import (reference) "theme.less"` 引用而不输出；`@import (inline) "data.less"` 内联数据；循环引用用 `tree.importManager.push` 检测；`@import "lib/"` 目录遍历（`index.less`）。

---

### 模式 8：嵌套展平算法

**问题场景**：`.a { .b { color: red; } }` 要展平为 `.a .b { color: red; }`，但 `&` 父引用要拼合。

**解决方案**：`tree.join()` 算法递归遍历 Ruleset；`joinSelector` 把父子选择器数组 `["a", "b"]` 拼成 `"a b"`；`joinPath` 处理 `&` 父引用（`a { &.b }` → `a.b`）；同名 Ruleset 合并 `merge()`。最终输出纯 CSS 选择器树。

**关键参数**：
- `tree.join()`
- `joinSelector`
- `joinPath` & 拼接
- `merge()` 合并
- 递归展平

**最佳实践**：嵌套 3 层内**不要**超过（4 层难维护）；`&.active` 是 `&` + `.active` 拼合**不是** `& .active`；同名 Ruleset 合并走 `+:` 语法；调试展平结果用 `--source-map`。

---

### 模式 9：严格数学 + `--strict-math`

**问题场景**：`@w: 100px; height: @w / 2;` 编译成 `height: 100px / 2;` 浏览器不认识。

**解决方案**：`--strict-math on` 强制数学运算求值（`50px`）；默认 off 保留 calc 表达式；`--math=always` 始终 calc；`--math=parens-division` 括号内除法 calc 括号外不 calc。三档可调。

**关键参数**：
- `--strict-math on/off`
- `--math=always`
- `--math=parens-division`
- calc() 兼容
- 单位推导

**最佳实践**：新项目**总是** `--strict-math on` 避免浏览器不识别；`@w / 2` 在 strict 下变 `50px`；老项目渐进切严格数学；`calc(@a + @b)` 主动 calc 浏览器算。

---

### 模式 10：sourcemap + 调试

**问题场景**：less 编译出错要定位回原 `.less` 文件具体行，传统报错只给编译后行号。

**解决方案**：`--source-map` 输出 `.map` 文件含源映射；浏览器 DevTools 在 Source 看到原 `.less` 行号直接断点；`sourceMapURL=` 注释挂 `.map`；`--source-map-rootpath` 配根路径；`less.render` API 返 `{ css, map, imports }` 三件套。

**关键参数**：
- `--source-map` 开关
- `.map` 文件
- `sourceMapURL` 注释
- `source-map-inline` 内联
- `map: { outputSourceFiles: true }`

**最佳实践**：生产**必**开 sourcemap 调试；`sourceMapURL=data:application/json;base64,...` 内联省一个 HTTP；webpack `less-loader` 配 `sourceMap: true`；CI 上传 sourcemap 到 Sentry 拿真实行号。

---

## 第三段：进阶范式

### 模式 11：Plugin 体系（Visitor + PreProcessor）

**问题场景**：业务想扩展 less.js 能力（自定义函数、修改 AST、注入 import）。

**解决方案**：`less.Plugin("myPlugin", less => { ... })` 形式注册插件；插件可注入 `functions` / `visitors` / `preProcessor`；`install(less, pluginManager)` 钩子；`preProcessor` 在 Parse 前修改源码；`visitors` 在 Process 阶段加自定义 AST 遍历。

**关键参数**：
- `less.Plugin(name, fn)` 注册
- `functions` 函数扩展
- `visitors` 树遍历
- `preProcessor` 预处理
- `pluginManager`

**最佳实践**：写 less 插件走 `less.Plugin` 而**不是** monkey-patch 内部；`preProcessor` 可注入全局样式；`visitors` 改 AST 走 `tree.api` 工具；测试用 `less.render(src, { plugins: [myPlugin] })`。

---

### 模式 12：函数注册（`tree.functions`）

**问题场景**：less 内置函数不够用，要加业务函数（`formatDate()` / `t()` 多语言）。

**解决方案**：`tree.functions` 是函数表；`less.functions.function.add('myFunc', (arg) => new tree.Anonymous('...'))` 注册；函数返回值是 `tree.Node`（`Anonymous` 字符串 / `Color` 颜色 / `Dimension` 数值 / `URL` 路径）；`less.js` 函数文档列所有可用 API。

**关键参数**：
- `tree.functions`
- `function.add(name, fn)`
- `tree.Node` 返回值
- `Anonymous/Color/Dimension`
- `lib/less/tree/functions.js`

**最佳实践**：自定义函数用 `tree.Anonymous` 返回字符串；颜色用 `new tree.Color(r,g,b)`；`@var: #fff; lighten(@var, 10%)` 注册 lighten 函数；`tree.operate` 算运算。

---

### 模式 13：同步/异步渲染

**问题场景**：less 早期是 callback，ES6+ 用 Promise；同步/异步 API 选哪个。

**解决方案**：`less.render(css, options, callback)` callback 风格；`less.render(css, options).then(({css, map, imports}) => ...)` Promise 风格；`less.parse(css, options, callback)` 单独解析；`less.refresh(reload, options, callback)` 浏览器热重载。两种风格并存。

**关键参数**：
- `less.render` 编译
- `less.parse` 解析
- `less.refresh` 热重载
- callback + Promise 双 API
- `modifyVars` 变量改

**最佳实践**：Node API 走 Promise `.then` 链；浏览器开发者模式用 `less.refresh(true)` 监听文件变更；`less.modifyVars({primary: '#000'})` 主题切换实时；`less.watch()` 监听。

---

### 模式 14：主题切换 + 实时编译

**问题场景**：SaaS 产品要"白天/夜间模式"动态切换主题，CSS 预编译后怎么动态改？

**解决方案**：`less.modifyVars({ '@primary': '#000' })` 浏览器 API 改变量全量重编译；CSS Custom Properties 双轨（`:root { --primary: #4285f4; } .dark { --primary: #fff; }`）纯 CSS 切主题；编译后产多套 CSS 主题文件按需 `<link rel="stylesheet">` 切。

**关键参数**：
- `less.modifyVars` 重编译
- CSS Variables 双轨
- 多套 CSS 主题
- 主题切换器
- 持久化

**最佳实践**：现代项目**用** CSS Custom Properties 切主题**不要** less.modifyVars（性能差）；老项目 less.modifyVars 兼容；主题存 localStorage 持久化；`prefers-color-scheme` 媒体查询自动暗色。

---

### 模式 15：autoprefixer 后处理集成

**问题场景**：less 编译后 CSS 要补齐浏览器前缀（`-webkit-` / `-moz-` / `-ms-`）。

**解决方案**：less 4.x 内置 `Prefixes` 阶段做简化 autoprefixer；`--autoprefix` 配置 `last 2 versions` 等 browserslist 字符串；外部集成用 `postcss-less` 走 `postcss([require('autoprefixer')]).process(lessOutput)`；less-loader 链式 `less` + `postcss` 双编译器。

**关键参数**：
- `--autoprefix`
- browserslist 字符串
- `postcss-less`
- `less` + `postcss` 链
- 前缀补齐

**最佳实践**：现代项目 autoprefixer 走 PostCSS 而**不是** less 内置（更全更新）；`browserslistrc` 统一目标浏览器；`last 2 versions, > 1%` 默认；CI 校验 autoprefixer 后体积膨胀 < 10%。

---

## 第四段：实战范式

### 模式 16：smoke test 5 行验证

**问题场景**：less 装好验证能否跑通基础语法。

**解决方案**：5 行 smoke test：
```js
const less = require('less');
less.render(`
  @primary: #4285f4;
  .btn { background: @primary; padding: 10px * 2;
    &:hover { background: darken(@primary, 10%); } }
`, {}).then(out => console.log(out.css));
```
期望输出：`.btn { background: #4285f4; padding: 20px; } .btn:hover { background: ... }`。

**关键参数**：
- 5 行核心验证
- 变量 + 嵌套 + 运算
- darken 函数
- Promise 风格
- 10s 可跑完

**最佳实践**：新装 less 环境用 5-10 行 smoke test 验证"变量 + Mixin + 嵌套 + 函数"四件套；预期输出与实际对比；CI 跑 `lessc smoke.less` 验证 CLI。

---

### 模式 17：less-loader + webpack 集成

**问题场景**：Webpack 项目要 less loader 处理 `.less` 资源。

**解决方案**：`less-loader` 9.x 走 `less.render` 同步 API；`webpack.config.js` 配 `module.rules: [{ test: /\.less$/, use: ['style-loader', 'css-loader', 'less-loader'] }]`；`lessOptions` 传 `globalVars / modifyVars / math / paths`；`additionalData` 注入全局 `@import`。

**关键参数**：
- `less-loader` 9.x
- `lessOptions` 配置
- `globalVars` 全局变量
- `modifyVars` 改变量
- `additionalData` 注入

**最佳实践**：`lessOptions: { lessOptions: { math: 'always' } }` 嵌套配置（v9 改了）；`additionalData: '@import "src/styles/variables.less";'` 注入全局变量**不要**每文件 import；`sourceMap: true` webpack dev 调试。

---

### 模式 18：Vite + less 集成

**问题场景**：Vite 项目要原生支持 `.less` 文件无需 loader。

**解决方案**：Vite 内置 less 支持（`vite` 自身用 less）；`npm install less` 装编译器即可；`vite.config.js` 不需要 `css.preprocessorOptions.less` 默认配置；`@import "@/styles/variables.less"` 路径别名；`@import "vars.less"` 隐式后缀。

**关键参数**：
- Vite 内置支持
- `npm install less`
- `css.preprocessorOptions.less`
- 路径别名 `@`
- HMR 热更新

**最佳实践**：Vite 5+ `css.preprocessorOptions.less: { additionalData: '@import "@/vars.less";' }` 注入全局；**不要**装 sass 那样装 sass-loader；`@import (reference)` 减少输出；HMR 改 less 即时刷新。

---

### 模式 19：vs Sass / PostCSS / Stylus 选型

**问题场景**：4 个候选 CSS 预处理器（Sass / Less / Stylus / PostCSS）。

**解决方案**：Sass（SCSS）最大生态 + 强大函数 + Vue/Bootstrap 默认；Less 学习曲线低 + 浏览器可运行 + 旧项目多；Stylus 极简 + Node 生态；PostCSS 是工具集合（autoprefixer/postcss-preset-env）不直接是预处理器。新项目 Sass，老项目 Less。

**关键参数**：
- Sass/SCSS 最大生态
- Less 易学
- Stylus 极简
- PostCSS 工具集
- Bootstrap 4- 用 Less

**最佳实践**：新项目**用** Sass（生态 + 工具链最全）；Less 适合老 Bootstrap 4- 维护项目；PostCSS 适合配 autoprefixer 走原生 CSS 渐进；Stylus 适合小项目极简风格。

---

### 模式 20：7 天复刻 mini-less

**问题场景**：学习用，想搭一个简化版 less.js 理解核心。

**解决方案**：7 天分 5 步：① Day 1-2 词法 + AST（10 节点类型） ② Day 3 变量 + 运算 + 函数 ③ Day 4 Mixin + 嵌套 ④ Day 5 `@import` 递归 + sourcemap 输出。

**关键参数**：
- Day 1-2 词法 AST
- Day 3 变量
- Day 4 Mixin
- Day 5 Import
- 7 天最小可用

**最佳实践**：复刻 less 先求"最小可跑内核"再迭代；7 天只够做 60% 场景的简化版；**完整变量 + Mixin + 嵌套 + 函数 + import + sourcemap 需要 3 个月+**；适用任何"预处理器学习"。

---

## 关键代码段

```js
// Node API - 5 行 smoke test
const less = require('less');
less.render(`
  @primary: #4285f4;
  .btn {
    background: @primary;
    padding: 10px * 2;
    &:hover { background: darken(@primary, 10%); }
  }
`, { math: 'always' }).then(out => console.log(out.css));

// 浏览器主题切换 - less.modifyVars
less.modifyVars({ '@primary': '#000000' });  // 触发全量重编译

// 自定义函数 - tree.functions 注册
less.functions.function.add('myFunc', (arg) =>
  new less.tree.Anonymous(`processed-${arg.value}`)
);
```

## 必偷 3 件

1. **Parser → AST → Visitor 三段式**：所有转换都是 AST 节点操作；`tree.Ruleset/Declaration/Expression/Operation` 节点类型；`Visitor.visit` 缓存；理解 less.js 源码从 `lib/less/tree/` 起步。
2. **5 Pass 编译管线**：Parse → Process → Join → PrependPrefixes → Compress；每阶段独立可调；`compress: true` 生产**必**开；调试用 `--verbose` 看每阶段耗时。
3. **Environment + FileManager 3 实现**：`NodeFileManager` / `BrowserFileManager` / `MemoryFileManager`；`globalVars` / `modifyVars` 注入全局变量；less-loader 走 MemoryFileManager 配 `paths`。

## 必避 3 坑

1. **不要用浏览器运行时编译生产 CSS**——`<link rel="stylesheet/less">` 性能差；用 `lessc` CLI 或 webpack/vite 预编译。
2. **不要混用 `px` 和 `em` 运算**——单位推导失败；用 `unit(@x, em)` 强制换算；不混用缩放逻辑。
3. **不要在新项目用 less**——生态比 Sass 小 5x；新项目用 Sass/SCSS，Less 留 Bootstrap 4- 老项目维护。
