# bulma - 基于 Flexbox + CSS 变量的现代 CSS 框架，零 JS 依赖

**GitHub**: jgthms/bulma
**Star**: 49k+
**语言**: SCSS
**主题**: css-framework/sass/flexbox/css-variables/可定制
**适用场景**: 全栈快速原型/中后台/学习双重变量系统设计；不想引入 JS 的场景

## 第一段：基础范式

### 模式 1：双变量系统（Sass + CSS 变量分工）

**问题场景**：纯 Sass 变量无法运行时换肤；纯 CSS 变量难做编译期循环生成 12 套 class。
**解决方案**：Sass 变量在编译期算 is-1 ~ is-12 宽度、生成颜色 palette；CSS 变量在运行期驱动主题切换、hover delta、focus shadow。两套系统各司其职。
**关键参数**：
- initial-variables.scss 158 行原子变量
- derived-variables.scss 语义变量
- themes/setup.scss 集中注册 CSS Var
- 注册到 :root 的 --bulma-* 命名空间
**最佳实践**：编译期 = Sass，运行期 = CSS 变量；两者不互相替代。

### 模式 2：9 行 @forward 装配单（_index.scss）

**问题场景**：73 个 scss 文件如何统一管理导入顺序？
**解决方案**：sass/_index.scss 9 个 @forward，按"utilities→themes→base→elements→form→components→grid→layout→skeleton→helpers"顺序。顺序就是编译顺序。
**关键参数**：
- @forward 替代 @import
- utilities 最先（mixin 入口）
- themes 第二（消费 utilities.register-vars）
- base/skeleton 倒数第二
- helpers 最后
**最佳实践**：用 @forward 装配单代替 @import 链；新文件加在合适位置。

### 模式 3：HSL 而非 HEX 颜色空间

**问题场景**：纯黑/纯白/灰阶在色相空间割裂，"偏冷的灰 + 偏暖的灰"混杂。
**解决方案**：所有颜色用 HSL——$black: hsl(221, 14%, 4%)。所有 greyscale 共享同一 hue/saturation，lightness 不同，整套配色永在同一色相。
**关键参数**：
- 221 hue + 14% saturation 是品牌基色
- 0~9 lightness 是色阶
- $primary-h/s/l 三元组派生语义色
- 副作用：pure black 不存在了
**最佳实践**：用 HSL 而非 HEX 锁色相；色阶用 lightness 控制。

### 模式 4：columns 用 flex-basis:0 + flex-grow:1

**问题场景**：固定 width:33.33% 在内容不等长时比例失调。
**解决方案**：.column 用 `flex-basis: 0; flex-grow: 1; flex-shrink: 1`，等分剩余空间而非按内容分配。
**关键参数**：
- display: block + flex 三件套
- padding 用 cv.getVar("column-gap")
- A/B 长度不等仍能 50/50
- 12 等分网格核心
**最佳实践**：用 flex-grow 而非 width 实现等分；A/B 等长 ≠ A/B 实际宽度。

### 模式 5：themes/setup.scss 集中 lightness 派生

**问题场景**：dark mode 要重写整套颜色变量吗？
**解决方案**：themes/setup.scss 定义 @mixin setup-theme，把"由 lightness 派生的 hsl 颜色"集中注册。dark.scss 只覆盖 lightness 变量，所有 hsl 自动重算。
**关键参数**：
- setup-theme mixin 被 light/dark 都 @include
- 13 行覆盖 lightness
- 174 行 setup 是 Bulma 1.0 灵魂
- 加新主题只覆盖 lightness
**最佳实践**：主题 = 覆盖 lightness 变量；不要重写整套颜色。

## 第二段：扩展范式

### 模式 6：!default 漫天飞（沙盒模式）

**问题场景**：用户如何零成本定制 Bulma？
**解决方案**：158 行 initial-variables 里 90% 变量都带 !default，用户 `@use "bulma" with ($primary: #ff0000)` 全部覆盖。
**关键参数**：
- 7 行 versions/bulma-prefixed.scss 切前缀
- 一行 with(...) 改主题
- 不破坏升级
- Sass 沙盒最干净
**最佳实践**：所有公共 Sass 变量必须带 !default；让用户零成本定制。

### 模式 7：@for $i from 0 through 12 生成 12 列类

**问题场景**：12 列 + 5 断点 = 60 类要手写吗？
**解决方案**：@for 循环展开 13 行 CSS，改粒度（24 列）只改循环边界。
**关键参数**：
- .columns.is-mobile > &.is-#{$i}
- flex: none + width: percentage($i/12)
- 5 断点 × 12 类 = 60 个 class
- 编译期展开，无运行时开销
**最佳实践**：用循环生成重复 class；改粒度只改循环边界。

### 模式 8：is-three-quarters 等"语义化小数"类

**问题场景**：4 列网格下 is-9 不存在，设计师想要"四分之三"怎么办？
**解决方案**：columns.scss 同时支持 12 等分（is-1 ~ is-12）+ 自然语言比例（is-three-quarters/is-two-thirds/is-one-third/is-half）。
**关键参数**：
- 12 等分面向开发者
- 自然语言比例面向设计师
- 双重语法共存
- Bulma 1.0 设计哲学
**最佳实践**：库要同时给"开发者语法"和"设计师语法"。

### 模式 9：utilities/extends.scss 8 个 %placeholder

**问题场景**：button/input/select/textarea 都要复用 control 基础样式，mixin 链嵌套会让 CSS 膨胀。
**解决方案**：8 个 %placeholder（%control/%button/%input/%table...）合并到一处选择器，CSS 输出更短。
**关键参数**：
- %control 用 @extend 复用
- control mixin 用于参数化场景
- 8 个 placeholder 覆盖 8 类
- CSS 输出更短
**最佳实践**：无条件继承用 %placeholder，参数化用 mixin。

### 模式 10：9 个 @forward 入口 + 4 个版本产物

**问题场景**：用户可能不需要 dark mode / helpers / 想加前缀。
**解决方案**：versions/ 下 4 个变体入口——bulma-no-dark.scss、bulma-no-helpers.scss、bulma-prefixed.scss、bulma-no-helpers-prefixed.scss。
**关键参数**：
- @use "../sass" with ($class-prefix: "bulma-")
- 一行切前缀
- 一个库满足 4 种部署场景
- no-dark 减体积 30%
**最佳实践**：库要支持"按需剪裁"；不要只发一个全量版本。

## 第三段：进阶范式

### 模式 11：generate-on-scheme-colors 对比度自适应

**问题场景**：品牌色 #ff0000 在白底对比度只有 4:1（不达 WCAG AA），开发者不会算怎么办？
**解决方案**：generate-on-scheme-colors 自动 -5%/-10%... lightness 直到对比度 ≥ 5:1（AAA），注册 --bulma-primary-on-scheme-l。
**关键参数**：
- WCAG AAA 标准 ratio > 5
- 每次循环加 5% lightness
- 20 次循环保险
- 用户只定义"品牌色是什么"
**最佳实践**：用算法解决"开发者不会算对比度"。

### 模式 12：bulmaColorLuminance 相对亮度

**问题场景**：Sass 内置 color.luminance() 不够用？颜色上该用白字还是黑字？
**解决方案**：bulmaColorLuminance 实现 WCAG 2.0 相对亮度公式（0.2126/0.7152/0.0722 加权），bulmaFindColorInvert 据此返回 #fff 或 rgba(#000, 0.7)。
**关键参数**：
- 0.55 阈值保对比度 ≥ 4.5:1
- rgba(#000, 0.7) 自适应彩色背景
- 323 行 functions.scss
- 三个核心算法
**最佳实践**：WCAG 标准的 Sass 实现；可访问性是设计系统刚需。

### 模式 13：button.scss 660 行 3D 立体感

**问题场景**：按钮如何看起来"有质感"？
**解决方案**：box-shadow: 0px 0.0625em 0.125em 实现 1px/2px 立体阴影，按下时翻转 inset。
**关键参数**：
- 0.0625em = 1px（16px 字体下）
- 0.125em = 2px
- 按下 inset 凹陷
- Bulma 1.0 重新引入的"经典按键"
**最佳实践**：em 相对单位跟字体大小走；按下感是交互反馈。

### 模式 14：loading-color CSS 变量继承

**问题场景**：按钮 hover 变色后，spinner 颜色不跟怎么办？
**解决方案**：loading-color 注册到 --bulma-loading-color，spinner 引用 var(--bulma-loading-color) 随父级按钮主题变化。
**关键参数**：
- CSS 变量解决"颜色继承 + 局部覆盖"
- spinner 不写死
- 主题切换零成本
- button.scss 660 行集中管理
**最佳实践**：用 CSS 变量做"颜色继承"；不要让 JS 同步颜色。

### 模式 15：JS 依赖 = 0（<details> + <input checkbox>）

**问题场景**：用户场景需要纯 CSS（不引入 JS）怎么办？
**解决方案**：`<details>` 实现 navbar 折叠，`<input type="checkbox">` 实现 modal 开关。
**关键参数**：
- 0 第三方 JS 依赖
- 0 运行时逻辑
- 静态 HTML 即可交互
- 移动端体验略差
**最佳实践**：用 HTML 元素做交互；JS 依赖是历史负担。

## 第四段：实战范式

### 模式 16：cssnano + 4 个版本产物压缩

**问题场景**：bulma.css 200KB 太大，部署怎么优化？
**解决方案**：cssnano 7.1 压缩 + 生成 4 个版本产物（默认/no-dark/no-helpers/prefixed）。
**关键参数**：
- npm run minify-bulma = cssnano
- npm run build-versions = 4 个变体
- ~200KB min.css
- CDN 用 jsDelivr 一行引入
**最佳实践**：库要发"全量 + 多个剪裁版"；用户按需选。

### 模式 17：!important 是设计系统毒药

**问题场景**：skeleton 需要强制透明 color。
**解决方案**：`color: transparent !important;`（skeleton.scss line 37）——但这是反模式。后期主题切换时 skeleton 永远不变色。
**关键参数**：
- !important 在设计系统里危险
- 属性选择器限定更好
- Bulma 自己都后悔
- 用 .is-skeleton[data-loading="true"] 替代
**最佳实践**：!important 是"按住葫芦起了瓢"的元凶；用属性选择器限定。

### 模式 18：autoprefixer + 渐进增强浏览器降级

**问题场景**：flexbox 的 -webkit-/-ms- 前缀怎么处理？IE10 还要支持吗？
**解决方案**：autoprefixer 处理 Flexbox 前缀，覆盖 IE10+。Bulma 1.0 不再支持 IE11。
**关键参数**：
- postcss-cli 11.0 + autoprefixer
- IE10/11 渐进增强
- 1.0 放弃 IE11
- 5 大主流浏览器原生支持
**最佳实践**：autoprefixer + 渐进增强；每版明确放弃目标浏览器。

### 模式 19：bulma-customizer 在线定制器

**问题场景**：用户想自己改变量又不想本地装 sass 怎么办？
**解决方案**：bulma-customizer（官网提供）+ bulmaswatch（100+ 主题）让用户零代码换主题。
**关键参数**：
- 100+ 主题
- 在线 Customizer
- 4 个版本变体
- 9 个 @forward 入口灵活组合
**最佳实践**：库的"零代码定制"是降低门槛的关键。

### 模式 20：BDFL 治理 + Open Collective 资金

**问题场景**：纯样式框架如何持续维护？商业模式是什么？
**解决方案**：Jeremy Thomas BDFL 治理 + Open Collective 众筹 + 商业培训（Bulma 官方教程）。
**关键参数**：
- BDFL 决策快
- 50+ 贡献者
- 每周 ~30 issue
- Open Collective 资金透明
- 商业培训是收入
**最佳实践**：纯开源靠众筹 + 培训变现；不要指望捐赠能养活全职。

## 关键代码段

```scss
// sass/grid/columns.scss:18-23 — flex-basis:0 等分布局核心
.column {
    display: block;
    flex-basis: 0;
    flex-grow: 1;
    flex-shrink: 1;
    padding: cv.getVar("column-gap");
}

// sass/themes/dark.scss — 13 行 dark mode
@use "../utilities/initial-variables" as iv;
@use "../utilities/setup" as setup;
@include setup.setup-theme {
    $scheme-main-l: iv.$scheme-main-l-d;  // 覆盖 lightness
    $scheme-main-bis-l: iv.$scheme-main-bis-l-d;
    // ... 13 行覆盖完
}
```

## 必偷 3 件

1. **`sass/_index.scss` 用 9 行 `@forward` 装配全库**——比 `@import` 链更清晰，比 webpack entry 更轻。
2. **`themes/setup.scss` 的 `@mixin setup-theme` 模式**——所有"由 lightness 派生的 hsl 颜色"集中一处，加新主题只覆盖 lightness。
3. **utilities 分 `initial-variables / derived-variables / functions / mixins / css-variables` 5 层**——每一层职责清晰，复用无歧义。

## 必避 3 坑

1. **不要复制 30+ CSS 变量的粒度**——Bulma 自己都后悔，一个 button 注册 30 个变量不可维护。
2. **不要在 Sass 变量里写 `!important`**——`color: transparent !important` 这种强覆盖后期会反噬。
3. **不要为了"无 JS"而不用 JS**——`<details>` 实现的 navbar 在移动端体验糟糕，必要时用 vanilla JS。
