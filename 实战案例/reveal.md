# reveal.js - 演示文稿框架的 DOM 即真相范式

**GitHub**: hakimel/reveal.js
**Star**: 70k+
**语言**: TypeScript / JavaScript
**主题**: 演示框架 / Controller-per-aspect / FLIP / 多视图同源
**适用场景**: 浏览器内 HTML 演示文稿、技术演讲、教育课件、需要"分享链接恢复进度"的场景

---

## 第一段：核心架构与工厂函数范式

### 模式 1：工厂函数 + 闭包 namespace

**问题场景**：一个 2964 行的主控制器要管理 18 个子模块（翻页、键盘、URL、动画……），用 ES class 继承会形成深继承链；用 ES module 多文件又需要解决循环依赖。如何用最朴素的方式组织一个 3k 行单文件框架？

**解决方案**：`export default function( revealElement, options )` 工厂函数 + 闭包作 namespace。内部 `let` 18 个 Controller 实例 + 内部状态变量，对外返回 `Reveal` 对象暴露 API。无 `class`、无继承、无循环依赖问题。

```js
// js/reveal.js:40-126
export default function( revealElement, options ) {
    // ... 200 行内部状态（let config, indexh, indexv, ...）
    slideContent = new SlideContent( Reveal ),
    slideNumber = new SlideNumber( Reveal ),
    jumpToSlide = new JumpToSlide( Reveal ),
    autoAnimate = new AutoAnimate( Reveal ),
    // ... 共 18 个 Controller 一次性 new
    function initialize( initOptions ) { ... }
    function start() { ... }
    return { initialize, slide, next, prev, ... }   // 公共 API
}
```

**关键参数**：
- 入口签名：`(revealElement, options) => Reveal`（DOM 元素 + 配置）
- 内部状态：`let config, indexh, indexv, indexf`（横向/纵向/片段索引）
- Controller 列表：`slideContent / slideNumber / jumpToSlide / autoAnimate / backgrounds / controls / fragments / keyboard / location / notes / overview / plugins / pointer / print / scrollview / slideChores / touch / focus`
- 公共 API：返回对象解构 30+ 方法（`slide` / `next` / `prev` / `configure` / `destroy` ...）

**最佳实践**：闭包 namespace 适合"一次实例化 + 长期持有"的对象（演示 deck、编辑器实例）；调试栈全是 "anonymous" 是代价，换 ES class + private field 更友好；新交互 = 加新 Controller，不改老 Controller。

### 模式 2：Controller-per-aspect 模式

**问题场景**：翻页、键盘、URL、片段、动画……如果全部堆在一个大对象里，3k 行后必然是"谁动了我的 state"；如何拆分关注点又不引入复杂的消息总线？

**解决方案**：每个 Controller 是独立类，构造时接收 `Reveal` 引用，自己读 `this.Reveal.getConfig()`、自己写 `this.Reveal.dispatchEvent()`，不互相调用——形成"广播 + 拉取"的事件模型。

```js
// js/controllers/keyboard.js（核心结构）
export default class Keyboard {
    constructor( Reveal ) {
        this.Reveal = Reveal
        // 读 config
        this.config = this.Reveal.getConfig().keyboard
        // 绑定事件
        this.Reveal.getRevealElement().addEventListener( 'keydown', this.onKeyDown, false )
    }
    onKeyDown( event ) {
        // 调 Reveal.next() / prev()
        if ( event.keyCode === 39 ) this.Reveal.next()
    }
}
```

**关键参数**：
- Controller 构造：`new XxxController( Reveal )`（不传具体依赖，传整个 Reveal 引用）
- 通信方式：`this.Reveal.getConfig()` / `this.Reveal.getRevealElement()` / `this.Reveal.dispatchEvent()` / `this.Reveal.on()`
- 生命周期：随 Reveal 工厂函数 new 出来 + 绑定事件，destroy 时各自清理
- 数量：v6.0.1 共 18 个 Controller（`js/controllers/` 目录）

**最佳实践**：Controller 持有 `this.Reveal` 引用（不互相 import，避免循环依赖）；Controller 之间不直接调方法（用事件总线）；新功能 = 加新 Controller 文件 + 在 `reveal.js` 第 107-125 行注册一次。

### 模式 3：5 层配置合并

**问题场景**：配置可能来自 5 个地方：默认值、用户全局配置、构造选项、initialize 选项、URL hash。手动合并易错；URL 优先级最高（"分享链接带状态"）怎么实现？

**解决方案**：`js/reveal.js:151` 一行 spread 5 层合并：URL hash 胜出（最后覆盖），便于做"分享带状态链接"。

```js
// js/reveal.js:151
config = { ...defaultConfig, ...config, ...options, ...initOptions, ...Util.getQueryHash() }
// 5 层合并：默认 → 全局configure → 构造选项 → initialize → URL hash
```

**关键参数**：
- 5 层优先级（从低到高）：`defaultConfig` < 全局 `configure({...})` < 构造函数 `options` < `initialize({...})` < `Util.getQueryHash()`
- 内部合并：用 ES6 spread（不是 deep merge，是 shallow merge）
- 深度配置：需要用户自己 deep merge（如 `theme` 是对象，用户手写 `{...default, ...user}`）
- URL 解析：`Util.getQueryHash()` 读 `location.hash` 转对象

**最佳实践**：多层 spread 是浅合并（顶层 key 覆盖），深层 key 需自己深合并；URL hash 胜出 = "分享链接 = 分享进度" 是杀手锏；多 deck 同页时 `configure({...})` 调用时机要清晰。

### 模式 4：DOM 即数据源

**问题场景**：传统 SPA 维护内存中的 slide 数组 + DOM 双向同步，每次新增/删除 slide 要双向更新；Markdown 插件、URL 反序列化都需要"知道当前 slide 结构"——如何让数据源唯一？

**解决方案**：slides 内容完全来自用户写的 HTML，框架**不维护内存模型**，只做"标记"（`past/present/future/hidden/aria-hidden`）。所有扩展（Markdown、URL、auto-animate）通过读 DOM 参与。

```js
// js/reveal.js:1709-1762 — 状态标记循环
function updateSlidesVisibility() {
    for ( let i = 0; i < slides.length; i++ ) {
        // 通过 class 表达状态
        slides[i].classList.toggle( 'past', i < indexh )
        slides[i].classList.toggle( 'present', i === indexh )
        slides[i].classList.toggle( 'future', i > indexh )
    }
}
// 读当前 slide：document.querySelector('.slides > .present')
// URL 反序列化：document.getElementById(decodeURIComponent(name))
```

**关键参数**：
- 状态表达：CSS class `past` / `present` / `future` / `hidden`
- slide 查询：`document.querySelector('.slides > .present')`（无内存索引）
- 命名查找：`document.getElementById('my-slide')`（支持 Unicode slide 名）
- 性能问题：>100 张 slide 时循环所有 slide 标记 class 有性能开销

**最佳实践**：DOM 即数据源 = "单一真相源"，避免双向同步 bug；缺点是 >100 slide 时纯 class 切换有性能问题（考虑 `data-state` 属性 + 委托）；扩展插件统一通过 querySelector 读 DOM。

### 模式 5：事件总线 on/off/dispatchEvent

**问题场景**：18 个 Controller 互相之间要通信（翻页后通知 Overview 缩略图更新、URL 同步、片段更新……），如果 A 直接调 B 的方法就是紧耦合；如何解耦？

**解决方案**：`Reveal` 充当 Mediator，提供 `on(event, cb)` / `off(event, cb)` / `dispatchEvent(type, args)` 三个 API。所有 Controller 通过事件订阅和广播。

```js
// js/reveal.js 内置事件总线
Reveal.on( 'slidechanged', ( event ) => {
    // event.indexh, event.indexv, event.previousSlide, event.currentSlide
} )
Reveal.on( 'fragmentshown', ( event ) => { ... } )
Reveal.on( 'overviewshown', () => { ... } )
// Controller 内部广播
this.Reveal.dispatchEvent( 'slidechanged', { indexh, indexv, previousSlide, currentSlide } )
```

**关键参数**：
- 事件类型：`slidechanged` / `fragmentshown` / `fragmenthidden` / `overviewshown` / `overviewhidden` / `paused` / `resumed` / `ready` / `destroyed`
- 订阅方式：`Reveal.on(type, listener)` 返回 unsubscribe 函数
- 广播 payload：`dispatchEvent(type, data)` 第二参数透传给 listener
- 内部使用：所有 Controller 在 `slide()` 后广播 `slidechanged`，Overview / Location / Notes 各自订阅

**最佳实践**：跨 Controller 通信 = 事件总线（不是直接方法调用）；外部用户也能订阅（写插件用）；事件 payload 命名要稳定（`indexh` / `indexv` 用了 14 年没改过）。

---

## 第二段：翻页与视图系统

### 模式 6：SlideContent 与翻页算法

**问题场景**：键盘 `→` 翻页、触摸滑动翻页、URL `#/3/1` 直接定位、Overview 缩略图点击跳转——多源输入如何统一到同一个"翻页"操作？

**解决方案**：`SlideContent` Controller 负责"翻页算法"本身：维护 `indexh / indexv / indexf`（横向/纵向/片段索引），`slide(h, v, f)` 是唯一改 state 的入口。键盘/触摸/URL 都最终调 `Reveal.slide()`。

```js
// js/reveal.js:slide() — 翻页主入口
function slide( h, v, f, o ) {
    // 边界检查
    if ( !overviewActive() && h !== undefined && !isVerticalSlide( currentSlide ) ) {
        h = constrainH( h )   // 0 ≤ h < horizontalSlides.length
    }
    // 更新索引
    indexh = h
    indexv = v ?? 0
    indexf = f ?? -1
    // 广播
    dispatchEvent( 'slidechanged', { indexh, indexv, previousSlide, currentSlide } )
    return currentSlide
}
```

**关键参数**：
- 三维索引：`indexh`（横向）/ `indexv`（纵向 slide 栈）/ `indexf`（片段步骤）
- 边界约束：`constrainH(h)` / `constrainV(v)` 防止溢出
- 唯一入口：`slide()` 内部处理所有翻页逻辑，键盘/触摸/URL 都调它
- 返回值：返回 `currentSlide` DOM 节点（链式判断）

**最佳实践**：翻页算法 = 单一函数 + 单一状态；输入源（键盘/触摸/URL）只调不实现；`slide()` 返回 DOM 节点是"翻页成功的副作用"（链式判断）。

### 模式 7：Fragments 步骤控制

**问题场景**：一张 slide 上有 5 个 bullet point，演讲者希望逐步显示（前一个出现后一个再出现），不是一次性全显。Markdown 写 `<!-- .element: class="fragment" -->` 怎么映射？

**解决方案**：`Fragments` Controller 扫描 slide 内 `.fragment` 元素，按 DOM 顺序编号。`navigateFragment(direction)` 控制 next/prev 步骤，配合 `data-fragment-index` 排序。

```js
// js/controllers/fragments.js 核心
function navigateFragment( direction ) {
    const fragments = currentSlide.querySelectorAll( '.fragment' )
    if ( direction > 0 && indexf < fragments.length - 1 ) {
        indexf++
        fragments[indexf].classList.add( 'visible' )
    } else if ( direction < 0 && indexf >= 0 ) {
        fragments[indexf].classList.remove( 'visible' )
        indexf--
    }
}
// HTML 写法
// <li class="fragment">First point</li>
// <li class="fragment">Second point</li>
```

**关键参数**：
- 元素标记：CSS class `fragment` + 可选 `data-fragment-index` 显式排序
- 状态：每个 fragment 有 `visible` class（逐步添加）
- 索引：当前步骤 `indexf`（-1 = 全部隐藏）
- 跨 slide：翻页时 `indexf` 重置

**最佳实践**：Markdown 插件通过 `marked` 渲染时为每个 list item 加 `class="fragment"`；复杂动画用 `data-fragment-style="appear"` / `"fade-up"` 选动画类型；不要超过 10 个 fragment（演讲节奏失控）。

### 模式 8：Keyboard 多条件阻断

**问题场景**：用户在演讲中按 `→` 想翻页，但可能焦点在 speaker notes 的 input 框、或者按了 `Ctrl+→` 想在 word 间跳转——键盘事件不能"无脑"响应。

**解决方案**：`Keyboard` Controller 监听 keydown，第 178 行多条件阻断：焦点在 input/textarea/contenteditable / 多余 modifier 键 / Notes 窗口打开时，全部 return。

```js
// js/controllers/keyboard.js:178
onKeyDown( event ) {
    const activeElementIsCE = document.activeElement?.isContentEditable
    const activeElementIsInput = ['INPUT','TEXTAREA','SELECT'].includes( document.activeElement?.tagName )
    const activeElementIsNotes = document.activeElement?.classList?.contains( 'speaker-notes' )
    const unusedModifier = ( event.shiftKey && event.keyCode < 48 )   // shift+letter 是合法修饰
    if ( activeElementIsCE || activeElementIsInput || activeElementIsNotes || unusedModifier ) return
    // 真正处理
    if ( event.keyCode === 39 ) this.Reveal.next()
}
```

**关键参数**：
- 阻断条件：4 个 OR（contenteditable / form input / speaker notes / 异常 modifier）
- 修饰键容忍：shift+letter 是合法组合（不用阻断）
- 焦点检测：`document.activeElement` 实时读
- 键位映射：`keyCode === 39` → `→` / `keyCode === 32` → space / `B` 暂停 / `F` 全屏 / `S` 打开 notes

**最佳实践**：键盘事件"少响应"原则（误触发比不响应更糟）；同时监听 keyup 防止长按重复触发；自定义键位暴露 `keyboard: { 39: 'next', ... }` 配置。

### 模式 9：ScrollView 备份/恢复 innerHTML

**问题场景**：演示有两种"看"的方式——全屏翻页（normal）和长页面滚动（scroll 阅读模式）。两种模式的 DOM 结构不同（scroll 要把 slide 重组成 page），切回 normal 时怎么恢复原始结构？

**解决方案**：`ScrollView` Controller 在激活时**备份**原始 innerHTML，重组 DOM（包 `.scroll-page` 容器 + auto-animate 合并 page）；切回 normal 时**恢复**备份。

```js
// js/controllers/scrollview.js:79
this.slideHTMLBeforeActivation = this.Reveal.getSlidesElement().innerHTML
// 激活时：备份原始 HTML
// this.Reveal.getSlidesElement().innerHTML = this.slideHTMLBeforeActivation   // 恢复
// 重组：每个 slide 包 .scroll-page
// auto-animate slide 合并到同一 page（避免动画跨页断掉）
if ( shouldAutoAutoAnimateBetween ) {
    page = appendAutoAnimatePages( page, slides )
}
```

**关键参数**：
- 备份时机：scrollview 激活前
- 备份位置：`slideHTMLBeforeActivation` 实例字段
- 恢复时机：scrollview 失活
- auto-animate 合并：第 69-74 行 `shouldAutoAnimateBetween` 把动画序列 slide 放同一 `.scroll-auto-animate-page`
- 文件大小：scrollview.js 951 行（v6.0.1 是最长的 Controller 之一）

**最佳实践**：状态切换前**先备份**比"再构造一次"快（避免重新执行 Markdown 渲染）；DOM 重组后要重置 scroll 位置；auto-animate 在 scroll 模式要特殊处理（合并 page）。

### 模式 10：多视图同源 + viewDistance 性能开关

**问题场景**：`normal/print/scroll/reader/overview` 5 种视图共用同一棵 DOM 树，远处 slide 渲染浪费 CPU/内存；>100 slide 时每张都设 `past/present/future` 循环可见。

**解决方案**：`viewDistance: 3`（默认）+ `mobileViewDistance: 2` 控制"激活可见 slide 范围"；超过范围的 slide 调 `slideContent.load()/unload()` 卸载到 placeholder。

```js
// js/reveal.js:1822-1899 updateSlidesVisibility
function updateSlidesVisibility() {
    const viewDistance = isMobileDevice ? config.mobileViewDistance : config.viewDistance
    for ( let i = 0; i < slides.length; i++ ) {
        const distance = Math.abs( i - indexh )
        if ( distance < viewDistance ) {
            slideContent.load( slides[i] )   // 渲染
        } else {
            slideContent.unload( slides[i] )  // 卸载
        }
        // 永远更新 class（past/present/future）
        slides[i].classList.toggle( 'past', i < indexh )
        slides[i].classList.toggle( 'present', i === indexh )
        slides[i].classList.toggle( 'future', i > indexh )
    }
}
```

**关键参数**：
- `viewDistance`：默认 3（可见范围内 slide 数）
- `mobileViewDistance`：默认 2（移动设备更激进卸载）
- `slideContent.load()`：渲染 slide（解析 Markdown / Highlight / Math）
- `slideContent.unload()`：卸载到 placeholder（保留 DOM 结构，释放计算）
- 视图切换：`print` 模式设 `viewDistance = Number.MAX_VALUE`（全部加载便于 PDF 打印）

**最佳实践**：viewDistance 是性能优化关键（>50 slide 时调小）；print 模式单独放大 viewDistance 保证 PDF 完整；不要在 render 期间触发 `updateSlidesVisibility`（无限循环）。

---

## 第三段：动画与插件体系

### 模式 11：AutoAnimate FLIP 技术

**问题场景**：两张 slide 上有相同元素（如 `<h1>`），翻页时希望元素"自动从 A 位置飞到 B 位置"，而不是"消失再出现"。CSS 做不到（不知道两张 slide 的相对位置），JS 如何实现？

**解决方案**：FLIP 四步——First（测 from-slide 元素位置）/ Last（设 to-slide 元素 transform 偏移到 from 位置）/ Invert（去掉 transform 触发 transition）/ Play（用户看到元素从 from 位置平滑滑到 to 位置）。

```js
// js/controllers/autoanimate.js:24-122
// First: 测 from-slide 元素位置
const fromRect = fromElement.getBoundingClientRect()
// Last: 测 to-slide 元素位置 + 设 transform 偏移
const toRect = toElement.getBoundingClientRect()
const deltaX = fromRect.left - toRect.left
const deltaY = fromRect.top - toRect.top
toElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`
// Invert: 改 data-auto-animate="running" 触发 CSS transition
toElement.closest('.slide').setAttribute('data-auto-animate', 'running')
// Play: 清掉 transform，浏览器自动用 transition 过渡
requestAnimationFrame( () => toElement.style.transform = '' )
```

**关键参数**：
- 标记：两张 slide 加 `data-auto-animate` 属性
- 元素匹配：相同 `id` 或 `data-id` 的元素配对
- 未匹配元素：`data-auto-animate-unmatched="false"` 关掉
- 缓动：`data-auto-animate-easing="linear"` 单元素覆盖
- CSS 注入优化：第 99 行 `this.autoAnimateStyleSheet.innerHTML = css.join('')` 一次性写入（注释说 "sheet.insertRule is multiple factors slower"）

**最佳实践**：FLIP = 4 个独立步骤（测量/设置/触发/播放），每步独立可调；要 `requestAnimationFrame` 包一层确保 transition 触发；批量元素用 transform 不用 top/left（GPU 加速）。

### 模式 12：Plugins 三态机（idle → loading → loaded）

**问题场景**：插件有同步和异步两种（如 markdown 是同步、highlight 是异步大依赖）；如何统一管理加载状态避免重复 init？

**解决方案**：`Plugins` Controller 的 `state` 字段在 `idle → loading → loaded` 三态间转换，串行 `initNextPlugin()` 显式处理依赖（不是 `Promise.all`）。

```js
// js/controllers/plugins.js:35-90
state: 'idle'    // 三态
function load( plugins, dependencies ) {
    this.state = 'loading'
    // 1. 同步脚本并发加载
    Promise.all( dependencies.scripts.map( loadScript ) )
        // 2. 串行 init（不 Promise.all）
        .then( () => this.initNextPlugin() )
}
function initNextPlugin() {
    if ( this.plugins.length === 0 ) {
        this.state = 'loaded'
        this.dispatchEvent( 'ready' )
        return
    }
    const plugin = this.plugins.shift()
    try {
        plugin.init?.()    // 调 init 钩子
    } finally {
        this.initNextPlugin()  // 显式递归（不 await）
    }
}
```

**关键参数**：
- 三态：`idle`（未加载） / `loading`（加载中） / `loaded`（就绪）
- 串行 init：`initNextPlugin()` 显式递归（不是 `Promise.all`）
- 错误处理：`try/finally` 包 `plugin.init()`，单个插件失败不影响后续
- 同步依赖：`scripts[]` 数组（先全部加载完再 init）
- 异步依赖：`asyncDependencies[]`（在 `loadAsync()` 阶段才加载，不阻塞首屏）

**最佳实践**：插件 init 串行 = 简单可推理（不是性能问题，因为 init 本身快）；同步依赖 vs 异步依赖分离 = 首屏不阻塞；`state` 字段 + `dispatchEvent('ready')` 让外部能 `await Reveal.ready`。

### 模式 13：同步/异步双轨加载

**问题场景**：插件依赖可能是同步的小脚本（marked、katex）也可能是异步大文件（highlight.js 1MB+）；如果全走同步加载，首屏卡死；如果全走异步，Markdown 渲染不出来。

**解决方案**：`dependencies.scripts[]`（同步，并发加载，全部完成才 init）+ `dependencies.asyncDependencies[]`（异步，fire-and-forget，演讲时后台加载）。

```js
// js/controllers/plugins.js
function load( plugins, dependencies ) {
    // 同步依赖：并发 + 全部等
    const scriptPromises = dependencies.scripts.map( src => loadScript( src ) )
    // 异步依赖：fire-and-forget
    dependencies.asyncDependencies.forEach( ({ src, asyncLoad }) => {
        loadScript( src ).then( () => asyncLoad() )   // 加载完才跑
    } )
    return Promise.all( scriptPromises ).then( () => this.initNextPlugin() )
}
// 用法
Reveal.initialize({
    plugins: [ Markdown, Notes, Highlight ],   // 同步插件
    dependencies: [
        { src: 'plugin/highlight/plugin.js' },                                       // 同步
        { src: 'plugin/highlight/load.js', asyncLoad: true },                       // 异步
    ]
})
```

**关键参数**：
- `scripts[]`：同步依赖（marked、mathjax）—— 全部加载完才 init
- `asyncDependencies[]`：异步依赖（highlight.js）—— 后台加载，加载完跑 `asyncLoad()`
- `loadScript()`：内部用 `<script>` 注入 + 监听 `onload` 包成 Promise
- 错误处理：单个 script 失败 `Promise.all` reject → 整批失败

**最佳实践**：大依赖（highlight.js、mathjax 完整版）走 asyncDependencies；小依赖（marked、katex）走 scripts；演讲关键依赖绝不放异步（首屏必须可用）。

### 模式 14：Markdown 插件节点注入

**问题场景**：用户写 `<section data-markdown><script type="text/template"># Hello</script></section>`，如何让 reveal 在初始化时把 Markdown 文本转成 DOM 节点？

**解决方案**：Markdown 插件扫描 `data-markdown` section，读 `<script type="text/template">` 内容 → `marked()` 解析 → `innerHTML` 注入 → 触发 slide 重新布局。

```js
// plugin/markdown/plugin.ts
function convertMarkdownToHTML( section ) {
    const template = section.querySelector( 'script[type="text/template"]' )
    const markdown = template?.textContent ?? ''
    const html = marked.parse( markdown, { smartypants: true } )
    section.innerHTML = html   // 注入 DOM
}
// reveal 初始化时调用
Reveal.getMarkdownSlides().forEach( convertMarkdownToHTML )
```

**关键参数**：
- 标记：`data-markdown` 属性
- 容器：`<section data-markdown><script type="text/template">...</script></section>`
- 解析器：`marked ^17`（外部依赖）+ `marked-smartypants`（智能引号）
- 注入时机：`Reveal.initialize()` 时一次性处理
- 属性支持：`<!-- .element: class="fragment" -->`（reveal 扩展语法）

**最佳实践**：Markdown 是**事后**注入节点（初始化阶段），符合"DOM 即真相"原则；`<script type="text/template">` 防止浏览器解析 HTML 实体（避免 `<` 变 `&lt;`）；多语言版本（`data-separator` + `data-separator-vertical`）支持横纵分页。

### 模式 15：Highlight / Math 异步大依赖

**问题场景**：highlight.js 体积 1MB+（含 200+ 语言），mathjax 完整版 3MB+；演讲一上来全加载 = 首屏 5s 白屏；按需加载又怕"演讲到代码 slide 时才加载"来不及。

**解决方案**：用 `asyncDependencies` 机制（模式 13）让 highlight/math 后台加载，配合 `callback` 字段指定"加载完跑什么"。

```js
// plugin/highlight/plugin.ts
Reveal.initialize({
    dependencies: [
        { src: 'plugin/highlight/plugin.js', async: true, callback: () => hljs.initHighlightingOnLoad() }
    ]
})
// plugin/highlight/plugin.ts 内部
hljs.registerLanguage( 'javascript', javascript )
hljs.registerLanguage( 'python', python )
// <pre><code class="javascript">let x = 1</code></pre>  // HTML 写法
```

**关键参数**：
- 异步标记：`async: true`
- 回调：`callback: () => hljs.initHighlightingOnLoad()`
- 语言注册：插件加载时调 `hljs.registerLanguage()`
- HTML 写：`class="javascript"` / `class="python"`（CSS class 标识语言）
- Math：Katex（轻量，~300KB）vs MathJax（完整，~3MB）

**最佳实践**：highlight.js 必走异步（体积太大）；Math 看场景选 Katex（速度 + 中等体积）或 MathJax（功能全 + 大体积）；用 `data-line-numbers` 给代码加行号。

---

## 第四段：URL 状态、React 适配与现代演进

### 模式 16：Location URL hash 双向同步

**问题场景**：演讲中按 `→` 翻到第 5 页，希望浏览器 URL 变成 `#/5/1`，让用户**复制链接发给同事**就能直接看到第 5 页。如何双向同步（`slide(5,1)` 写 hash，hash 变化时也翻页）？

**解决方案**：`Location` Controller 监听 `hashchange` + `slidechanged` 事件，写入 `location.hash` 用 `history.replaceState`（不污染 history）；`MAX_REPLACE_STATE_FREQUENCY = 1000ms` 防止 Chrome 缩略图 bug 频刷。

```js
// js/controllers/location.js:43-99 getIndicesFromHash
function getIndicesFromHash() {
    const hash = window.location.hash
    // 1. 优先尝试命名链接 #/my-slide/2
    const nameMatch = hash.match( /#\/([^\/]+)\/(\d+)/ )
    if ( nameMatch ) {
        const slide = document.getElementById( decodeURIComponent( nameMatch[1] ) )
        if ( slide ) return { h: parseInt( nameMatch[2] ), v: 0, f: -1 }
    }
    // 2. 退路数字索引 #/3/1
    const numMatch = hash.match( /#\/(\d+)\/(\d+)/ )
    if ( numMatch ) return { h: parseInt( numMatch[1] ), v: parseInt( numMatch[2] ), f: -1 }
    return null
}
// 写入（带去抖）
writeURL( delay = 0 ) {
    clearTimeout( this.writeURLTimeout )
    this.writeURLTimeout = setTimeout( () => {
        history.replaceState( null, '', `#/${indexh}/${indexv}` )
    }, delay )
}
```

**关键参数**：
- 读：`getIndicesFromHash()` 优先命名（`#/my-slide/2`）退路数字（`#/3/1`）
- 写：`writeURL(delay)` 用 `setTimeout` 去抖 + `history.replaceState`（不污染 history）
- `MAX_REPLACE_STATE_FREQUENCY = 1000ms`：防 Chrome 缩略图 bug
- 双向：`hashchange` 事件 → 调 `slide()` 翻页
- 命名支持：`document.getElementById()` 支持 Unicode slide 名

**最佳实践**：URL 即状态 = "分享链接 = 分享进度" 杀手锏；用 `replaceState` 不 `pushState`（否则浏览器后退键会卡死）；`?print-pdf` query 用 `Util.getQueryHash()` 单独读（不在 hash 里）。

### 模式 17：命名链接（data-id → Unicode slide 名）

**问题场景**：URL 用数字索引 `#/3/1` 不友好（用户不知道 3 是哪张），但用纯文本名太长（`#/introduction-to-algorithm`），如何平衡可读性 + 简短？

**解决方案**：`Location` Controller 支持 `data-id` 属性做 slide 名字，URL 解析时优先尝试命名（`#/intro/1`），退路数字。`document.getElementById(decodeURIComponent(name))` 查 DOM 支持 Unicode。

```html
<!-- HTML 写法 -->
<section data-id="intro">
    <h1>Introduction</h1>
</section>
<section data-id="algo">
    <h1>Algorithm</h1>
</section>
<!-- URL: #/intro/0 = intro slide 第 0 段 -->
```

**关键参数**：
- 标记：`<section data-id="intro">`（id 唯一）
- URL 语法：`#/intro/0`（name + 段索引）
- Unicode 支持：`decodeURIComponent()` 解码，支持中文 slide 名（`#/介绍/0`）
- 退路：未命中的 id 仍走数字索引
- 持久化：URL hash 自带"分享"能力

**最佳实践**：data-id 用"短英文"（`intro` / `algo` / `demo`），不是完整短语；中文 slide 名可行但不友好（URL 编码变长）；`#/` 数字路径作 fallback 永远保留。

### 模式 18：React 子包 + StrictMode 兼容

**问题场景**：reveal.js 是 vanilla JS 库（工厂函数返回对象），React 项目想用 `<Deck>` 组件复用，怎么桥接？React 18 StrictMode 会**故意双调用** effect 检测 bug（unmount 后再 mount），如何避免误销毁活跃 Reveal 实例？

**解决方案**：`react/src/components/deck.tsx` 用 `useEffect` 调 `new Reveal()` + `initialize()`，unmount 调 `destroy()`。`teardownRequestRef` 计数器 + `Promise.resolve().then(...)` 推迟 teardown 避免 StrictMode 假销毁。

```tsx
// react/src/components/deck.tsx:114-150
const teardownRequestRef = useRef( 0 )
useEffect( () => {
    const deck = new Reveal( revealRef.current, options )
    deck.initialize().then( () => resolve() )
    return () => {
        teardownRequestRef.current++
        const myTeardown = teardownRequestRef.current
        // 推迟到下一微任务
        Promise.resolve().then( () => {
            if ( teardownRequestRef.current === myTeardown ) {
                deck.destroy()   // 确认是"真的卸载"才销毁
            }
        } )
    }
}, [] )
```

**关键参数**：
- 桥接：`new Reveal( ref.current, options )` + `deck.initialize()`
- StrictMode 兼容：`teardownRequestRef.current++` + 推迟到微任务，验证"是否被新的 mount 覆盖"
- `Promise.resolve().then(...)`：推到下一微任务（StrictMode 双调用后，第二次 mount 的 counter 必然 > 第一次）
- 错误处理：`destroy()` 内部 try/catch
- 子包解耦：`react/` 是独立 npm package，peerDependency `"reveal.js"`

**最佳实践**：任何"桥接到外部生命周期"的库（vanilla / jQuery）都要处理 React StrictMode 双调用；用 ref 计数器 + 微任务推迟是经典模式；React 子包独立维护（不污染核心）。

### 模式 19：WeakMap slide id 分配

**问题场景**：React 节点（虚拟 DOM）每次 render 重新创建，URL/auto-animate 又需要稳定数字 id 做引用 + diff，怎么把"React 节点"映射到"稳定 id"？

**解决方案**：`slideIdsRef = useRef(new WeakMap())` 把"React 节点"作为 key（WeakMap 自动 GC），`nextSlideIdRef = useRef(1)` 维护下一个 id。WeakMap 的 key 是 React 节点对象，无需手动清理。

```tsx
// react/src/components/deck.tsx:108-109
const slideIdsRef = useRef( new WeakMap() )
const nextSlideIdRef = useRef( 1 )
// 分配 id
const id = (node) => {
    if ( !slideIdsRef.current.has( node ) ) {
        slideIdsRef.current.set( node, nextSlideIdRef.current++ )
    }
    return slideIdsRef.current.get( node )
}
// 用 id 做 diff
JSON.stringify( slideNodes.map( id ) )  // 稳定签名
```

**关键参数**：
- 数据结构：`WeakMap<object, number>`（React 节点 → 稳定 id）
- 起始：`nextSlideIdRef.current = 1`
- 自增：每次新节点分配新 id（永不重用）
- GC：WeakMap key 释放时自动 GC（无需手动清理）
- 应用：JSON.stringify slide 列表做"结构签名" diff

**最佳实践**：WeakMap 是"对象 → 任意值"映射的标准方案（比 Map 强在自动 GC）；永不重用 id 避免 stale reference；用 `useRef` 包裹保证 React 多次 render 同一 WeakMap。

### 模式 20：多产物导出 + 打印视图

**问题场景**：现代打包器（Vite/Webpack）用 ESM，老 IE 用 UMD/ES5，TypeScript 项目要 `.d.ts` 类型——单 package.json 怎么暴露 7 个子路径（核心 + 6 个插件）？

**解决方案**：`package.json#exports` 字段配置多子路径 + 多条件（`import` / `require` / `default`），构建脚本分别打 ESM/ES5/类型。

```json
// package.json
{
    "main": "dist/reveal.js",                      // UMD ES5（老 IE）
    "module": "dist/reveal.mjs",                   // ES Module（现代打包器）
    "types": "dist/reveal.d.ts",                   // TypeScript 类型
    "exports": {
        ".": {
            "import": "./dist/reveal.mjs",
            "require": "./dist/reveal.js",
            "types": "./dist/reveal.d.ts"
        },
        "./plugin/markdown": {
            "import": "./plugin/markdown/plugin.mjs",
            "require": "./plugin/markdown/plugin.js"
        },
        "./plugin/highlight": "...",               // 6 个插件各一个
        "./plugin/math": "...",
        "./plugin/notes": "...",
        "./plugin/search": "...",
        "./plugin/zoom": "..."
    }
}
```

**关键参数**：
- 7 个子路径：`.` (核心) + 6 个插件
- 3 种条件：`import`（ESM）/ `require`（CJS）/ `types`（TS）
- 双产物：ES5（`reveal.js`）+ ESM（`reveal.mjs`）
- 构建脚本：`tsc && vite build && vite build -c vite.config.styles.ts`（TS + JS + SCSS 三个产物）
- 打印视图：`?print-pdf` query → 调 `view: 'print'` + `viewDistance = MAX_VALUE` → 浏览器原生 PDF 打印

**最佳实践**：双产物 + 多 subpath 是工业级 npm 包标配；打印视图不重新生成 DOM（设 viewDistance 让浏览器原生分页）；TypeScript 类型用 `tsc --emitDeclarationOnly` 单独产 `.d.ts`。

---

## 附录：5 段必读代码

1. `js/reveal.js:40-126` — 18 Controller 一次性注入 + 闭包 namespace（理解"工厂函数 + Controller"）
2. `js/reveal.js:130-168` — `initialize()` + 5 层 config 合并（URL hash 胜出）
3. `js/controllers/autoanimate.js:24-122` — FLIP 4 步动画（First/Last/Invert/Play）
4. `js/controllers/plugins.js:35-90` — 三态机 + 同步/异步双轨加载
5. `react/src/components/deck.tsx:114-150` — React StrictMode 兼容的 `Promise.resolve().then` 推迟 teardown

## 一句话总结

reveal.js = 2964 行工厂函数 + 18 个 Controller + 5 层 config 合并 + DOM 即数据源 + 4 视图同源 + FLIP auto-animate + 三态机插件 + URL 即状态 + React 桥接；2011 年至今 14 年长寿命，用"闭包 namespace + Controller 协奏"的朴素架构撑起 GitHub 70k+ 演示框架的事实标准，最值得偷的不是代码而是"DOM 即真相 + 多视图同源 + URL 即状态"的思维模型。
