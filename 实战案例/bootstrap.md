# bootstrap - 世界上最流行的响应式、移动优先前端框架，5 万行 Sass + 3500 行 JS

**GitHub**: twbs/bootstrap
**Star**: 172k+
**语言**: SCSS / JavaScript
**主题**: CSS 框架/Sass/design-system/响应式/组件库
**适用场景**: 中后台/营销页/内部工具/想"开箱即用"的设计师；学习 design token 范式

## 第一段：基础范式

### 模式 1：4 层架构（Token → Mixins → Components → JS）

**问题场景**：30+ 组件如何共用一套 design token？用户如何一行覆盖主题色？
**解决方案**：4 层物理分层——_variables.scss（design token）→ mixins/（复用代码）→ components + utilities（消费层）→ BaseComponent（JS 父类）。
**关键参数**：
- _variables.scss 1754 行集中所有 token
- 32 个 mixin 文件
- 23 个 component + utilities/api 1242 行配置驱动
- 87 行 BaseComponent 父类
**最佳实践**：把"配置"和"实现"分目录；改 token 不动组件。

### 模式 2：!default + Maps 覆盖即可机制

**问题场景**：用户想换主题色，需要重编译还是只改 CSS？
**解决方案**：所有变量 `!default`，用户 `@import "bootstrap/scss/variables"` 之前覆盖即可。整个 Sass 生态最干净的设计 token 范式。
**关键参数**：
- 1754 行变量全部带 !default
- 用户只写 `@primary: #ff5500; @import "bootstrap";`
- 无需 fork 库
- 不破坏升级路径
**最佳实践**：所有公共 Sass 变量必须带 !default；让用户用最少的代码覆盖。

### 模式 3：CSS 变量双层抽象（mixin 输出 --bs-）

**问题场景**：v5.3 暗黑模式如何运行时切换？需不需要重编译？
**解决方案**：mixin（如 button-variant）不直接输出属性，而是先输出 `--bs-btn-color` 等 CSS 变量，selector 消费。运行时切主题用 `data-bs-theme="dark"` 直接改 7 个根 CSS 变量。
**关键参数**：
- button-variant mixin 只发 token
- 组件样式可被运行时覆盖
- _variables-dark.scss 7 个根变量
- 不重编译、不重打包
**最佳实践**：mixin 输出 CSS 变量而非硬编码属性；切主题只改根变量。

### 模式 4：BaseComponent + Data 单例

**问题场景**：13 个 JS 组件如何避免重复内存 + 状态冲突？
**解决方案**：BaseComponent.getOrCreateInstance(element) 走 Data Map（key=bs.modal），同一 DOM 节点只一个实例。EVENT_KEY = '.bs.modal' 命名空间清理。
**关键参数**：
- Data set(element, instance) 单例存储
- getOrCreateInstance 先取再 new
- dispose 走 EventHandler.off(element, EVENT_KEY) 一次清所有
- 子类只需写业务逻辑
**最佳实践**：DOM 节点 ↔ JS 对象用 Map 绑定；命名空间清理避免内存泄漏。

### 模式 5：generate-utility 配置驱动工具类

**问题场景**：200+ 工具类（margin/padding/display/flex）写 200 个 mixin 吗？
**解决方案**：utilities/api.scss 用 $utilities map 描述工具类规则，generate-utility 循环生成。`if($enable-important-utilities, !important, null)` 一份代码两种行为。
**关键参数**：
- $utilities: (property, values, class-name, rtl, css-var) 五元组
- @each 循环生成 .p-0/.p-1/.p-2/.p-3
- null 在编译期被完全消除
- enable-important-utilities 全局开关
**最佳实践**：用数据描述工具类，循环生成 CSS；一份配置两份行为。

## 第二段：扩展范式

### 模式 6：breakpoint-up/.02 防重叠

**问题场景**：`min-width: 768px` 和 `max-width: 768px` 在 768.0 时两个都触发。
**解决方案**：breakpoint-max 用 `$max - .02`（而非 `- 1`），让"max"严格小于"下一个 min"。`.d-md-block` 在 768.0 切换到下一档，无 1px 死区。
**关键参数**：
- breakpoint-max: 50% - .02
- 0.01 撞 Safari 圆角 bug → 用 .02 保险
- breakpoint-only 只生成一个断点 query
- min-width: 0 省 16 字节/工具类
**最佳实践**：W3C mediaquery 规范死区用 .02 解决；浏览器 bug 才是真坑。

### 模式 7：event-handler.js 自研委托（不依赖 jQuery）

**问题场景**：v5.0 移除 jQuery 后，事件委托如何不依赖外部库？
**解决方案**：bootstrapDelegationHandler 用 `for (target=event.target; target!==this; target=target.parentNode)` 沿 DOM 树向上找匹配。eventRegistry[uid][typeEvent][uid] 注册表。
**关键参数**：
- 手写委托 318 行
- nativeEvents Set 显式枚举 45 种
- customEvents 处理 mouseenter/leave 模拟
- originalTypeEvent 保留自定义事件
**最佳实践**：不依赖外部库手写委托；命名空间清理 + 祖先链遍历是核心。

### 模式 8：Config 三层合并 + 正则类型校验

**问题场景**：组件配置有 default/HTML data-attr/JS 对象三层，谁优先？
**解决方案**：_mergeConfigObj 顺序 `Default → JSON config → data-attributes → 用户 config`，优先级反过来。_typeCheckConfig 用正则匹配 DefaultType 字符串。
**关键参数**：
- DefaultType: '(boolean|string)' 字符串
- Manipulator.getDataAttribute 解析 data-bs-config
- 正则比 instanceof 灵活
- TypeError 信息含属性名+实际类型+期望类型
**最佳实践**：配置三层合并，类型校验抛清晰错误；HTML-only 也能配置组件。

### 模式 9：Sanitizer 白名单 + 自定义钩子

**问题场景**：tooltip/popover 接受 HTML 字符串，如何防 XSS？
**解决方案**：SAFE_URL_PATTERN = `/^(?!javascript:)(?:[a-z0-9+.-]+:|[^&:/?#]*(?:[/?#]|$))/i` 拒绝 javascript: 协议。sanitizeHtml 允许 sanitizeFunction 注入，等于"默认安全 + 用户可接管"。
**关键参数**：
- ARIA_ATTRIBUTE_PATTERN = /^aria-[\w-]*$/i 自动放行
- DefaultAllowlist 配置化
- sanitizeFunction 是用户逃生口
- 借鉴 Angular 实现
**最佳实践**：默认安全 + 自定义钩子；ARIA 用正则不用枚举。

### 模式 10：RTL 一份代码两套布局

**问题场景**：阿拉伯/希伯来语要从右到左布局，如何不改源码支持？
**解决方案**：rtlcss + `/* rtl:begin:remove */` 注释块。postcss-rtlcss 把 begin:remove 到 end:remove 中间段删掉，只保留 LTR 规则。
**关键参数**：
- 一份源码两套布局
- 编译后处理而非源码分支
- utilities/api 用 $is-rtl: map-get($utility, rtl) 控制
- 5 大 UI 框架唯一原生支持
**最佳实践**：布局方向用编译后处理；不要源码维护两个分支。

## 第三段：进阶范式

### 模式 11：去 jQuery + 13 年 IE 兼容史

**问题场景**：放弃 IE 兼容还是保留？jQuery 30KB 体积能省吗？
**解决方案**：v5.0 移除 jQuery，换取自研 event-handler + transitionend 同步。v4.6 还支持 IE10，v5.0 才放弃 IE11。
**关键参数**：
- event-handler.js 318 行替代 jQuery 委托
- transitionend 同步动画回调
- IE 矩阵逐版收缩
- jQuery 兼容代码保留为 defineJQueryPlugin
**最佳实践**：每个版本明确放弃目标；老项目用 defineJQueryPlugin 过渡。

### 模式 12：bundlewatch 体积门禁

**问题场景**：如何防止 PR 让 bootstrap.min.js 涨到 100KB？
**解决方案**：bundlewatch.config.json 限制 bootstrap.min.js ≤ 26KB gz，bootstrap.min.css ≤ 26KB gz，每个 PR 校验 8 个产物体积。
**关键参数**：
- 8 个产物：bundle/standalone/standalone-esm × min/non-min
- 体积阈值硬编码
- CI 失败 = PR 不合并
- terser 5 + clean-css 5 压缩
**最佳实践**：体积是 feature，bundlewatch 把"无意识膨胀"变成"显式 PR"。

### 模式 13：13 个组件 + 8 个 dom 原语 + 6 个 util

**问题场景**：组件越来越多，如何避免重复造轮子？
**解决方案**：base-component 父类 + 4 个 dom 原语（data/event-handler/manipulator/selector-engine）+ 6 个 util（backdrop/focustrap/sanitizer/scrollbar/swipe/template-factory）。
**关键参数**：
- 13 组件：Modal/Tooltip/Popover/Toast/Carousel/Collapse/Dropdown/Offcanvas/ScrollSpy/Tab/Alert/Button/Collapse
- dom 原语是组件的"工具箱"
- util 是协作能力
- config.js 66 行统管配置
**最佳实践**：用"原语 + 协作能力"分层，而非"组件大杂烩"。

### 模式 14：Astro 5 文档站 + Algolia 搜索

**问题场景**：35+ 组件文档 + 17 example 怎么组织？
**解决方案**：site/ 用 Astro 5 静态生成，30+ 翻译团队，Algolia DocSearch 3.9，StackBlitz 一键试。
**关键参数**：
- Astro 5.18 静态生成
- 17 example 页面
- 35+ mdx 组件页
- 30 翻译团队
- StackBlitz SDK 集成
**最佳实践**：文档站用静态生成 + 全文搜索 + 一键试；翻译靠社区众包。

### 模式 15：12 道 CI（js/css/docs/lint/codeql/scorecard/...）

**问题场景**：开源 UI 库如何保证质量？
**解决方案**：12 个 GitHub Action 工作流——js.yml/css.yml/docs.yml/lint.yml/codeql.yml/scorecard.yml/bundlewatch.yml/cspell.yml/browserstack.yml/release-notes.yml/release-drafter.yml/issue-labeled.yml。
**关键参数**：
- js + css + docs + lint 四主线
- codeql 静态分析
- scorecard OSSF 安全评分
- bundlewatch 体积门禁
- browserstack 5 大浏览器真机测试
**最佳实践**：CI 数量 = 质量维度数量；每个维度一个工作流。

## 第四段：实战范式

### 模式 16：reflow(element) 强制重排

**问题场景**：`classList.add('show')` 被浏览器合并到上一帧，CSS 动画不触发。
**解决方案**：`reflow(element) { element.offsetHeight }` 单行 trick，读 offsetHeight 强制浏览器重排。
**关键参数**：
- 一行函数解决动画不触发
- 注释引用 Harrytheo 博客解释原理
- 2014 年就用透的"动画重置法"
- 全局复用
**最佳实践**：浏览器 reflow 机制是性能 trick；一行代码解决一类问题。

### 模式 17：Backdrop + FocusTrap 协作者

**问题场景**：Modal 打开要遮罩 + 焦点循环，如何解耦？
**解决方案**：Backdrop/FocusTrap/ScrollBarHelper 是独立可插拔协作者，Modal 组合。Strategy 模式让 Modal 不依赖具体实现。
**关键参数**：
- Backdrop 管灰色遮罩
- FocusTrap 管 Tab 键循环
- ScrollBarHelper 管 body 滚动条占位
- Modal 持 3 个协作对象
**最佳实践**：复杂组件用"组合 + 协作者"代替继承；每个协作者可独立测试。

### 模式 18：show.bs/shown.bs 自定义事件

**问题场景**：组件动画完成如何通知业务方？
**解决方案**：Observer 模式——show.bs.modal/shown.bs.modal/hide.bs/hidden.bs 四事件。EventHandler.trigger 触发，业务方 `addEventListener` 监听。
**关键参数**：
- 4 个事件对：will/ing
- EventHandler.trigger 触发
- 命名空间清理
- jQuery 用户用 .on('show.bs.modal', ...) 监听
**最佳实践**：用事件解耦"行为完成"和"业务回调"；命名空间是关键。

### 模式 19：CustomProperty 多主题覆盖

**问题场景**：用户想局部覆盖主题（只改 button 不改 navbar）怎么办？
**解决方案**：组件用 `cv.getVar("button-h")` 拿值，主题在 `.theme-corporate` 下重新覆盖 `--bulma-button-h`（这里指 bs-button-h）。
**关键参数**：
- 每个组件 var(--bs-xxx-color)
- 主题 class 覆盖根变量
- 无需重新编译
- 运行时切换
**最佳实践**：局部覆盖 = 局部 CSS 变量；不要写主题切换 JS。

### 模式 20：5 万行 SCSS + 3500 行 JS 工程典范

**问题场景**：13 年长期维护的开源 UI 框架如何保持代码质量？
**解决方案**：分层清晰（functions/variables/maps/mixins/root/reboot/components/utilities）+ 命名规范（_ 前缀私有）+ 注释密度 + 50+ 维护者。
**关键参数**：
- 53 个 scss 文件分层
- 21 个 js 文件
- 686 总文件
- 50+ 核心维护者
- Open Collective 众筹
**最佳实践**：UI 框架的"长期主义" = 分层清晰 + 命名规范 + 众包维护。

## 关键代码段

```js
// js/src/base-component.js:65-67 — 单例核心
static getOrCreateInstance(element, config = {}) {
    return Data.get(this.DATA_KEY, element) || new this(element, config);
}

// js/src/dom/event-handler.js:102-122 — 自研委托
function bootstrapDelegationHandler(element, originalTypeEvent, handler, delegationFunction, oneOff) {
    return function handlerFn(event) {
        for (let { target } = event; target && target !== this; target = target.parentNode) {
            if (delegationFunction(target, event)) {
                handler.call(target, event);
                if (oneOff) return;
            }
        }
    };
}
```

## 必偷 3 件

1. **`!default` 变量 + `_variables.scss` 1754 行集中暴露**：所有 design token 放一个文件、用 `!default` 让用户覆盖——比 Tailwind config.js 简单，比 MUI theme.ts 透明。
2. **CSS 变量双层抽象**（`mixin` 输出 `--bs-*`，`selector` 消费）：mixin 只发 token，组件样式可被运行时覆盖。**这一招 v5.3 暗黑模式是杀手锏**。
3. **`Config` 类三层合并（Default → data-attr → 用户 config）** + **正则类型校验**：HTML-only 写 `data-bs-config='{"animation":false}'` 也能生效，给运营 / 设计师用。

## 必避 3 坑

1. **不要混 jQuery 和原生**：`isElement()` 里那种"if `object.jquery` 取 `[0]`"的兼容代码，维护成本高、tree-shake 困难。**一开始选边站**。
2. **不要在父类 dispose() 里全包**：`BaseComponent.dispose()` 不知道子组件，子类必须自己调 `super.dispose()`，结果到处是 3 行重复。**应该用生命周期钩子 `onDispose()` 回调**。
3. **不要堆 `@each` 嵌套**：6 层 `@each` + `@if` 的 `utilities/api.scss` 编译 3 秒起步，hot reload 卡顿。**先展开成普通 for 循环逻辑**再上 mixin。
