# slick - jQuery 时代事实标准轮播组件

**GitHub**: kenwheeler/slick
**Star**: 28.5k+
**语言**: JavaScript (jQuery plugin)
**主题**: jQuery / carousel / 滑动组件 / 前端 UI
**适用场景**: 学习"配置驱动 + 状态机 + 命名空间事件"UI 组件实现、IE8 兼容、跨设备轮播

---

## 第一段：核心架构 - jQuery 插件与状态机

### 模式 1：配置驱动的 jQuery 插件

**问题场景**：jQuery 时代 UI 组件 API 设计——链式调用 vs 配置对象？30+ 配置怎么组织？怎么让用户"用最少的代码"完成配置？

**解决方案**：slick 用配置对象 + 链式——`$('.slider').slick({slidesToShow: 3, arrows: false})`，30+ 配置 + 默认值降级；`$.fn.slick.defaults` 暴露默认值方便用户覆写。

```js
// slick.js IIFE 核心
(function($) {
    var slick = function(element, options) {
        var _ = this
        _.defaults = {
            accessibility: true,
            adaptiveHeight: false,
            arrows: true,
            autoplay: false,
            autoplaySpeed: 3000,
            dots: false,
            draggable: true,
            fade: false,
            infinite: true,
            slidesToShow: 1,
            slidesToScroll: 1,
            speed: 300,
            swipe: true,
            // ... 共 30+ 配置
        }
        _.options = $.extend({}, _.defaults, options)  // 合并
        _.currentSlide = 0
        _.slideCount = 0
        // ... 状态字段
    }
    $.fn.slick = function(options) {
        var _ = this
        return _.each(function() {
            if (!$.data(this, 'slick')) {
                $.data(this, 'slick', new slick(this, options))
            }
        })
    }
    $.fn.slick.defaults = slick.prototype.defaults  // 暴露
})(jQuery)
// 用户调用
$('.slider').slick({
    slidesToShow: 3,
    arrows: false
})
// 用户覆写默认
$.fn.slick.defaults.autoplay = true
```

**关键参数**：
- 入口 = `$.fn.slick = function(options) { ... }`
- 默认 = `$.fn.slick.defaults = { slidesToShow: 1, ... }`
- 合并 = `$.extend({}, defaults, options)`
- 链式 = `return this.each(function() { ... })`
- 状态 = `$(this).data('slick')` 存实例

**最佳实践**：jQuery 插件用配置对象 + 默认值 + `$.extend` 合并——比参数列表灵活 + 用户友好；`$.fn.plugin.defaults` 暴露给用户覆写；`$.data(el, 'plugin')` 存实例（避免重入）；`$.extend(true, ...)` 深拷贝处理嵌套配置。

### 模式 2：状态机实现 UI 组件

**问题场景**：轮播有"静止 / 自动播放中 / 拖拽中 / 切换中 / 暂停" 5 状态——怎么组织逻辑避免 if-else 地狱？怎么保证状态一致性？

**解决方案**：slick 用 `_states` 字段 + 状态转换函数——`changeSlide` / `autoPlay` / `drag` 各自检查状态、转换、触发事件；状态显式记录在 `this.currentSlide` / `this.slideCount`。

```js
// 状态机 + 转换
slick.prototype.changeSlide = function(direction, animate) {
    var _ = this
    if (_.animating) return  // 切换中忽略新请求（幂等）
    _.animating = true
    var targetSlide = _.currentSlide + direction
    if (targetSlide < 0) {
        targetSlide = _.options.infinite ? _.slideCount - 1 : 0
    } else if (targetSlide >= _.slideCount) {
        targetSlide = _.options.infinite ? 0 : _.slideCount - 1
    }
    _.trigger('beforeChange', _, _.currentSlide, targetSlide)
    _.currentSlide = targetSlide
    _.animating = false
    _.trigger('afterChange', _, _.currentSlide)
}
slick.prototype.autoPlay = function() {
    var _ = this
    if (_.options.autoplay && !_.paused && !_.animating) {
        _.interval = setInterval(function() {
            _.changeSlide(1)  // 切下一张
        }, _.options.autoplaySpeed)
    }
}
```

**关键参数**：
- 5 状态 = `idle` / `playing` / `dragging` / `changing` / `paused`
- 转换 = `changeSlide(direction)` 检查状态后改
- 事件 = `trigger('beforeChange')` / `trigger('afterChange')`
- 状态字段 = `this.slideCount` / `this.currentSlide`
- 幂等 = 同方向多次点击合并

**最佳实践**：UI 组件用状态机（vs. 散乱 flag）——状态显式 + 转换清晰 + 事件可观察；`animating` 标志位防止动画重叠；自动播放 + 拖拽 + 切换三态互斥；状态转换前后各触发 1 个事件（before/after）让用户干预。

### 模式 3：命名空间事件

**问题场景**：jQuery `$(el).on('click', ...)` 无命名空间——同名事件被覆盖、难解绑；slick 怎么让 10+ 事件不与宿主代码冲突？

**解决方案**：slick 自定义事件加 `.slick` 命名空间——`trigger('beforeChange.slick')` / `on('afterChange.slick', cb)`；`off('.slick')` 一次性解绑所有 slick 事件。

```js
// 命名空间事件
slick.prototype.trigger = function(eventName, slick, slideIndex, direction) {
    var _ = this
    // 内部事件
    $(_.$slider).trigger(eventName + '.slick', [slick, slideIndex, direction])
    // 兼容驼峰命名
    var camelEvent = eventName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    $(_.$slider).trigger(camelEvent + '.slick', [slick, slideIndex, direction])
}
// 用户监听
$('.slider').on('afterChange.slick', function(event, slick, currentSlide) {
    console.log('slide changed to', currentSlide)
})
// 一次性解绑
$('.slider').off('.slick')   // 解绑所有 .slick 事件
// slick 销毁时自动解绑
slick.prototype.destroy = function() {
    var _ = this
    _.$slider.off('.slick')   // 防止内存泄漏
    _.$slider.slickUnfilter()
    _.$slider.slick('slickUnfilter')
    _.$slider.slick('unslick')
    // ...
}
```

**关键参数**：
- 触发 = `$(element).trigger(eventName + '.slick', args)`
- 监听 = `$(element).on(eventName + '.slick', handler)`
- 解绑 = `$(element).off('.slick')` 一次性解绑所有
- 10+ 事件 = `init` / `beforeChange` / `afterChange` / `breakpoint` / `destroy`
- 优势 = 与其他库事件不冲突

**最佳实践**：jQuery 插件用命名空间事件（`.slick`）——避免冲突 + 一次解绑；事件命名规范 `eventName.slick`；驼峰 + 横线双触发（兼容 React 风格 / Vue 风格）；`destroy` 时必 `off('.slick')` 防止内存泄漏。

### 模式 4：断点响应式配置

**问题场景**：视口变（PC → 平板 → 手机）——轮播的"显示 3 张"要变"显示 1 张"，怎么自动响应？硬编码 media query 不灵活。

**解决方案**：slick 断点机制——`responsive: [{ breakpoint: 1024, settings: { slidesToShow: 3 } }, { breakpoint: 600, settings: { slidesToShow: 1 } }]`，window resize 自动切换；`unslick()` + 重建 or 局部更新。

```js
// 断点配置
$('.slider').slick({
    slidesToShow: 3,
    slidesToScroll: 1,
    responsive: [
        {
            breakpoint: 1024,
            settings: {
                slidesToShow: 3,
                slidesToScroll: 3,
                infinite: true
            }
        },
        {
            breakpoint: 600,
            settings: {
                slidesToShow: 2,
                slidesToScroll: 2
            }
        },
        {
            breakpoint: 480,
            settings: {
                slidesToShow: 1,
                slidesToScroll: 1
            }
        }
    ]
})
// 内部：监听 resize
$(window).on('resize.slick', this.breakpoint)
slick.prototype.breakpoint = function() {
    var _ = this
    var windowWidth = window.innerWidth
    var newSettings = null
    // 找到匹配的断点
    _.$settings.each(function() {
        if (windowWidth < $(this).attr('data-breakpoint')) {
            newSettings = $(this).data('slick-settings')
        }
    })
    // 应用设置
    if (newSettings) {
        _.options = $.extend({}, _.options, newSettings)
        _.reinit()
    }
    _.trigger('breakpoint', _, _.breakpointSettings)
}
```

**关键参数**：
- 触发 = `$(window).on('resize', ...)` 监听
- 节流 = 100ms debounce
- 匹配 = 当前宽度匹配断点
- 切换 = 销毁重建 vs 渐变
- 事件 = `breakpoint` 事件通知

**最佳实践**：响应式组件用断点配置（vs. CSS media query）——配置驱动 + JS 控制重建；断点按"由大到小"排序（1024 → 600 → 480）；`window.innerWidth` 而非 `document.documentElement.clientWidth`（mobile viewport 准）；断点切换要触发 `breakpoint` 事件供用户干预。

### 模式 5：触摸 + 鼠标 + 键盘三态统一

**问题场景**：跨设备输入——鼠标拖拽 / 触屏滑动 / 键盘左右键——3 种输入怎么统一？避免重复实现 3 套代码。

**解决方案**：slick 三态抽象——`Swipe` / `Drag` / `Keyboard` 三个方法 + 统一事件 `changeSlide(direction)`；方向 = `left` | `right` 抽象。

```js
// 触摸事件
slick.prototype.swipeStart = function(event) {
    var _ = this
    _.dragging = true
    _.touchObject = {
        startX: event.touches[0].pageX,
        startY: event.touches[0].pageY,
        curX: event.touches[0].pageX,
        curY: event.touches[0].pageY
    }
}
slick.prototype.swipeMove = function(event) {
    var _ = this
    var touch = event.touches[0]
    _.touchObject.curX = touch.pageX
    _.touchObject.curY = touch.pageY
    // 计算方向
    if (Math.abs(_.touchObject.startX - _.touchObject.curX) > 40) {
        var direction = _.touchObject.startX > _.touchObject.curX ? 1 : -1
        _.changeSlide(direction)  // 统一入口
    }
}
// 鼠标拖拽
slick.prototype.dragStart = function(event) { /* 类似 swipeStart */ }
// 键盘
slick.prototype.keyHandler = function(event) {
    var _ = this
    if (event.which === 37) _.changeSlide(-1)  // ←
    if (event.which === 39) _.changeSlide(1)   // →
}
```

**关键参数**：
- 触摸 = `touchstart` / `touchmove` / `touchend`
- 鼠标 = `mousedown` / `mousemove` / `mouseup`
- 键盘 = `keydown` (left/right)
- 抽象 = `direction = 'left' | 'right'`
- 统一 = 触发 `changeSlide(direction)`

**最佳实践**：跨设备输入用抽象方向（left/right）——多端差异收敛到统一语义；事件命名 `swipeStart` / `dragStart` 区分触摸和鼠标；`passive: true` 提升滚动性能（移动端必加）；触摸和鼠标可以共用 `changeSlide` 但要分状态（避免同时触发）。

---

## 第二段：交互设计 - 事件、过滤与性能

### 模式 6：无限循环 + 克隆节点

**问题场景**：轮播到底要"跳回首张"还是"无缝循环"？无缝循环怎么做？用户感知不到循环点。

**解决方案**：slick 克隆首尾节点——前后各克隆 N 张（N=slidesToShow），无限滚动时调整 translateX，用户无感；DOM 节点 + transform 平移。

```js
// 无限循环
slick.prototype.loadSlick = function() {
    var _ = this
    // 1. 计算原始 slides 数量
    _.slideCount = _.$slideTrack.children().length
    // 2. 前后各克隆 N 张
    for (var i = 0; i < _.options.slidesToShow; i++) {
        var clone = _.$slides.eq(i).clone().attr('data-clone', true)
        _.$slideTrack.append(clone)
    }
    for (var i = _.slideCount - 1; i >= _.slideCount - _.options.slidesToShow; i--) {
        var clone = _.$slides.eq(i).clone().attr('data-clone', true)
        _.$slideTrack.prepend(clone)
    }
    // 3. 计算总 slideCount
    var newSlideCount = _.slideCount + 2 * _.options.slidesToShow
    _.$slideTrack.css('width', newSlideCount * (100 / _.options.slidesToShow) + '%')
}
// 切换时
slick.prototype.changeSlide = function(direction) {
    var _ = this
    _.currentSlide += direction
    // 到达克隆区域时
    if (_.currentSlide < _.options.slidesToShow) {
        // 立即跳到真实末尾（无动画）
        setTimeout(function() {
            _.$slideTrack.css('transition', 'none')
            _.currentSlide = _.slideCount + _.currentSlide
            _.goTo(_.currentSlide)
            // 下一帧恢复动画
            setTimeout(function() { _.$slideTrack.css('transition', '') }, 0)
        }, _.options.speed)
    }
}
```

**关键参数**：
- 克隆 = `$slider.prepend(clones)` / `$slider.append(clones)`
- 数量 = `slidesToShow` 张
- 切换 = 到达克隆时 `instant` 跳转 + translateX 重置
- 性能 = 克隆节点不重新布局
- 陷阱 = 索引计算要绕

**最佳实践**：无限循环用克隆首尾（vs. 算术 mod）——DOM 操作简单 + 动画平滑；克隆数量 = slidesToShow（够用户滑动到边缘）；`data-clone` 标记避免用户选择克隆节点；`transition: none` 临时关闭动画（无缝跳到真实边界）。

### 模式 7：懒加载图片

**问题场景**：轮播 20 张图，首屏只显示 3 张——一次性加载 20 张浪费；移动端流量宝贵。

**解决方案**：slick `lazyLoad: 'ondemand'` ——切换到下一张时才加载（`<img data-lazy>`）；`progressive` 选项=全部预加载（适合小图）。

```js
// 用户 HTML
<div class="slider">
    <div><img data-lazy="img-1.jpg"></div>
    <div><img data-lazy="img-2.jpg"></div>
    <!-- ... 20 张 -->
</div>
// 配置
$('.slider').slick({
    lazyLoad: 'ondemand'   // 或 'progressive'
})
// 内部：afterChange 事件后检查
slick.prototype.lazyLoad = function() {
    var _ = this
    var currentSlide = _.$slider.find('.slick-current')
    var nextSiblings = currentSlide.nextAll('img').slice(0, _.options.slidesToShow)
    // 加载当前可见 + 即将可见
    _.loadImage(currentSlide.find('img[data-lazy]'))
    _.loadImage(nextSiblings.find('img[data-lazy]'))
}
slick.prototype.loadImage = function($img) {
    $img.each(function() {
        var src = $(this).attr('data-lazy')
        if (src) {
            $(this).attr('src', src).removeAttr('data-lazy')
        }
    })
}
```

**关键参数**：
- 配置 = `lazyLoad: 'ondemand' | 'progressive'`
- 属性 = `<img data-lazy="url" />`
- 触发 = `afterChange` 事件后检查当前 slide
- 加载 = `attr('src', data-lazy)`
- 占位 = loading spinner

**最佳实践**：图片轮播必带懒加载——首屏快 + 流量省；`ondemand` 默认（按需加载）+ `progressive` 适合小图（全部预加载）；预加载 N 张（slidesToShow）避免切换空白；data-lazy 而非 data-src（语义清晰）。

### 模式 8：CSS3 动画降级到 jQuery animate

**问题场景**：动画走 `transform: translateX(...)` 配 `transition`——但老浏览器（IE8）不支持 CSS3；怎么优雅降级？

**解决方案**：slick 自动降级——`useCSS = Modernizr.test('transforms3d')`？用 CSS3 ：用 jQuery animate；`useCSS: false` 强制 jQuery。

```js
// Modernizr 检测
slick.prototype.useCss = function() {
    var _ = this
    _.options.useCSS = _.options.useCSS !== false
    if (_.options.useCSS && Modernizr.csstransitions && Modernizr.csstransforms3d) {
        // CSS3 动画
        _.$slideTrack.css({
            'transform': 'translate3d(-' + (_.currentSlide * 100) + '%, 0, 0)',
            'transition': 'transform ' + _.options.speed + 'ms ' + _.options.cssEase
        })
    } else {
        // jQuery animate 降级
        _.$slideTrack.animate({
            left: '-' + (_.currentSlide * 100) + '%'
        }, _.options.speed, _.options.cssEase, function() {
            _.animating = false
        })
    }
}
```

**关键参数**：
- 检测 = `useCSS: true` 默认 / `useCSS: false` 强制 jQuery
- CSS3 = `transform: translate3d(-100%, 0, 0)` + `transition`
- jQuery = `$slider.animate({left: '-100%'}, speed, easing)`
- 性能 = CSS3 60fps / jQuery animate 30fps
- 决策 = Modernizr 检测

**最佳实践**：动画库必带 CSS3 + jQuery animate 双路——优雅降级到 IE8；Modernizr 检测（或 `useCSS: false` 强制）；CSS3 走 translate3d 触发 GPU；jQuery animate 走 left 调整（IE6+ 兼容）；新项目放弃 IE 兼容后只走 CSS3 即可。

### 模式 9：CSS 性能 + will-change

**问题场景**：轮播 60fps 动画——CSS transform 触发 GPU 加速但内存占用高；怎么平衡性能与内存？

**解决方案**：slick `useTransform: true`（默认） + `will-change: transform` 提示浏览器 GPU；用时加 + 不用时移。

```scss
// slick-theme.css
.slick-slider .slick-track,
.slick-slider .slick-list {
    transform: translate3d(0, 0, 0);  // 强制 GPU layer
    will-change: transform;             // 浏览器优化
}
.slick-slide {
    backface-visibility: hidden;        // 避免文字抖动
    -webkit-perspective: 1000;
    perspective: 1000;
}
.slick-slide.slick-loading {
    background: url('../images/ajax-loader.gif') center no-repeat;
}
```

**关键参数**：
- `transform: translate3d` = 强制 GPU layer
- `will-change: transform` = 浏览器优化
- 局限 = 太多 layer 吃内存
- 折中 = 用时加 + 不用时移
- 性能 = 60fps vs 30fps

**最佳实践**：轮播动画用 transform + GPU 加速——60fps 平滑，避免 layout thrashing；`translate3d(0,0,0)` 触发 GPU layer；`will-change` 谨慎用（多了吃内存）；`backface-visibility: hidden` 解决移动端文字抖动；不要对所有元素都加 will-change（内存爆炸）。

### 模式 10：多轮播双向同步 asNavFor

**问题场景**：slider A 和 slider B 联动（导航 + 详情）——怎么同步切换？避免双独立实例。

**解决方案**：slick `asNavFor` 配置——`$sliderA.slick({asNavFor: $sliderB})`，A 切换时 B 同步；监听 `beforeChange` / `afterChange` 事件。

```js
// 配置联动
$('.slider-nav').slick({
    slidesToShow: 3,
    asNavFor: '.slider-for'   // 联动大图
})
$('.slider-for').slick({
    slidesToShow: 1,
    asNavFor: '.slider-nav',   // 联动缩略图
    arrows: false,
    fade: true
})
// 内部：去抖防止循环
slick.prototype.changeSlide = function(direction) {
    var _ = this
    // ... 切自己
    // 通知联动
    if (_.options.asNavFor) {
        $(_.options.asNavFor).slick('slickGoTo', _.currentSlide)
    }
}
// 接收联动
$('.slider-nav').on('afterChange.slick', function(event, slick, currentSlide) {
    $('.slider-for').slick('slickGoTo', currentSlide)
})
```

**关键参数**：
- 配置 = `asNavFor: '.slider-other'`
- 同步 = 监听 `beforeChange` / `afterChange`
- 链式 = A↔B 双向（去抖）
- 用途 = 缩略图导航 + 详情
- 限制 = 不支持多对多

**最佳实践**：联动轮播用 `asNavFor`——声明式同步，避免手写事件桥接；A↔B 双向要防止无限循环（用标志位去抖）；`slickGoTo(idx)` 而非 `changeSlide(dir)` 更精确；不支持 N 对 N（1 对 N 实际有 bug）。

---

## 第三段：扩展体系 - 过滤、主题与文档

### 模式 11：Slick 方法 API

**问题场景**：用户要在 JS 动态操作轮播（slickNext / slickPrev / slickGoTo）——怎么暴露方法？避免在 `$` 上挂过多函数。

**解决方案**：slick `$.fn.slick` 二次调用——`$('.slider').slick('slickNext')`（传方法名），内部 `methods[method].apply(this, rest)`；15+ 方法统一入口。

```js
// 方法 API
$.fn.slick = function(options) {
    var _ = this
    var arg = arguments
    if (typeof options === 'string') {
        // 方法调用
        var method = options
        return _.each(function() {
            var instance = $.data(this, 'slick')
            if (instance && typeof instance[method] === 'function') {
                instance[method].apply(instance, Array.prototype.slice.call(arg, 1))
            }
        })
    } else {
        // 初始化
        return _.each(function() {
            if (!$.data(this, 'slick')) {
                $.data(this, 'slick', new slick(this, options))
            }
        })
    }
}
// 15+ 方法
var methods = {
    slickNext: function() { this.changeSlide(1) },
    slickPrev: function() { this.changeSlide(-1) },
    slickGoTo: function(idx) { this.slideHandler(idx) },
    slickPause: function() { this.paused = true; clearInterval(this.interval) },
    slickPlay: function() { this.paused = false; this.autoPlay() },
    slickAdd: function(html, idx) { /* 动态添加 slide */ },
    slickRemove: function(idx) { /* 动态删除 slide */ },
    slickFilter: function(filter) { /* 过滤 */ },
    slickUnfilter: function() { /* 取消过滤 */ },
    slickDestroy: function() { this.destroy() },
    slickGetOption: function(name) { return this.options[name] },
    slickSetOption: function(name, value) { this.options[name] = value; this.reinit() }
}
```

**关键参数**：
- 调用 = `$(el).slick('methodName', arg1, arg2)`
- 内部 = `if (methods[method]) return methods[method].apply(this, Array.prototype.slice.call(arguments, 1))`
- 15+ 方法 = `slickNext` / `slickPrev` / `slickGoTo` / `slickPause` / `slickPlay` / `slickAdd` / `slickRemove` / `slickFilter` / `slickUnfilter` / `slickDestroy` / `slickGetOption` / `slickSetOption`
- 优势 = API 统一

**最佳实践**：jQuery 插件用 `$(el).plugin('methodName', ...)` 暴露方法——单一入口 + 链式；方法命名 `slick<Verb>` 风格（slickNext / slickPause）；`slickGetOption` / `slickSetOption` 暴露配置读写；`slickDestroy` 必 cleanup（off 事件 + 移除 DOM 引用）。

### 模式 12：过滤器 Filter

**问题场景**：用户想筛选轮播项（如按标签）——不需要重建实例，怎么实现？需要保持状态。

**解决方案**：slick `slickFilter` / `slickUnfilter`——基于 jQuery selector 隐藏/显示节点；不销毁实例，状态保留。

```js
// 过滤调用
$('.slider').slick('slickFilter', ':visible')   // 只显示可见
$('.slider').slick('slickFilter', '.active')    // 只显示 .active 元素
$('.slider').slick('slickFilter', function(idx) {
    return $(this).data('category') === 'news'  // 自定义过滤函数
})
$('.slider').slick('slickUnfilter')  // 恢复
// 内部实现
slick.prototype.slickFilter = function(filter) {
    var _ = this
    if (filter) {
        // 隐藏不匹配
        _.$slidesCache.css('display', 'none')
        _.$slides.filter(filter).css('display', '')
    }
    // 重算 slideCount
    _.slideHandler(_.currentSlide, false, true)
}
slick.prototype.slickUnfilter = function() {
    var _ = this
    _.$slidesCache.css('display', '')
    _.slideHandler(_.currentSlide, false, true)
}
```

**关键参数**：
- 调用 = `$('.slider').slick('slickFilter', ':visible')` 或 `'.active'`
- 隐藏 = `slide.css({display: 'none'})` + 标记
- 重建 = 重算 slideCount / currentSlide
- 取消 = `slickUnfilter` 恢复显示
- 性能 = 不销毁实例

**最佳实践**：轮播筛选用 slickFilter（vs. 销毁重建）——性能好 + 状态保留；`display: none` 而非 `remove`（避免动画重置）；filter 支持 selector / function 两种形式；重算 slideCount 后 currentSlide 要 clamp 到合法范围。

### 模式 13：核心 / 主题样式分离

**问题场景**：用户想要"换主题"——slick 怎么分离核心与样式？皮肤修改不影响结构。

**解决方案**：slick 提供 4 套样式（`.css` / `.less` / `.scss` / 主题版）+ Iconfont（`slick.eot/ttf/woff/woff2`）；核心管结构，主题管皮肤。

```css
/* slick.css（结构） */
.slick-slider { position: relative; display: block; box-sizing: border-box; }
.slick-list { position: relative; overflow: hidden; display: block; }
.slick-track { position: relative; top: 0; left: 0; display: block; }
.slick-slide { display: none; float: left; height: 100%; min-height: 1px; }
/* slick-theme.css（皮肤） */
.slick-prev, .slick-next {
    font-size: 0;
    line-height: 0;
    position: absolute;
    top: 50%;
    display: block;
    width: 20px;
    height: 20px;
    padding: 0;
    transform: translate(0, -50%);
    cursor: pointer;
    color: transparent;
    border: none;
    outline: none;
    background: transparent;
}
.slick-prev:before, .slick-next:before {
    font-family: 'slick';
    font-size: 20px;
    line-height: 1;
    color: white;
    opacity: 0.75;
}
```

**关键参数**：
- 主样式 = `slick.css`（结构性 .slick-slide 等）
- 主题样式 = `slick-theme.css`（皮肤）
- 字体图标 = 箭头 / 分页点（CSS 改色）
- 替换 = 改 `slick-theme.css` 即可换肤
- 优势 = 核心 / 主题分离

**最佳实践**：UI 组件核心/主题分离——核心管结构，主题管皮肤；4 套样式覆盖多种预处理器；Iconfont 4 格式覆盖 IE8+；换肤不改 JS 只改 CSS 即可；`@font-face` 引用 Iconfont。

### 模式 14：30+ 配置文档表格

**问题场景**：30+ 公开配置 + 10+ 事件 + 15+ 方法——用户记不住怎么办？API 文档要详尽。

**解决方案**：slick README 详细表格——按"功能 / 默认值 / 类型 / 说明"4 列分组；按主题分类（基础 / 高级 / 响应式 / 事件 / 方法）。

```markdown
<!-- README 片段 -->
### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| accessibility | boolean | true | Enables tabindex and arrow key navigation |
| adaptiveHeight | boolean | false | Enables adaptive height for single slide horizontal carousels |
| autoplay | boolean | false | Enables Autoplay |
| autoplaySpeed | int | 3000 | Autoplay Speed in milliseconds |
| arrows | boolean | true | Prev/Next Arrows |
| asNavFor | string | null | Set the slider to be the navigation of other slider |
| ... | ... | ... | ... |

### Events

| Event | Arguments | Description |
|-------|-----------|-------------|
| afterChange | slick, currentSlide | Fires after slide change |
| beforeChange | slick, currentSlide, nextSlide | Fires before slide change |
| breakpoint | event, slick, breakpoint | Fires after a breakpoint is hit |
| destroy | event, slick | When slider is destroyed |

### Methods

| Method | Arguments | Description |
|--------|-----------|-------------|
| slickNext() | none | Goes to next slide |
| slickPrev() | none | Goes to previous slide |
| slickGoTo(idx) | index : int | Goes to slide by index |
| ... | ... | ... |
```

**关键参数**：
- 基础 = `slidesToShow` / `slidesToScroll` / `arrows` / `dots` / `infinite` / `speed` / `autoplay` / `autoplaySpeed` / `fade` / `cssEase`
- 高级 = `lazyLoad` / `pauseOnHover` / `pauseOnFocus` / `pauseOnDotsHover` / `draggable` / `swipe` / `touchMove` / `vertical` / `rtl` / `centerMode`
- 响应式 = `responsive` / `mobileFirst` / `asNavFor` / `focusOnSelect` / `accessibility` / `adaptiveHeight`
- 事件 = `init` / `beforeChange` / `afterChange` / `breakpoint` / `destroy`
- 方法 = `slickNext` / `slickPrev` / `slickPause` / `slickGoTo` / `slickAdd` / `slickRemove` / `slickDestroy`

**最佳实践**：30+ 配置用详细文档表格——比口述强 10x，IDE 提示必备；表格分 4 列（Option / Type / Default / Description）；分类按主题（基础 / 高级 / 响应式）；TypeScript 类型声明（`.d.ts`）让 IDE 智能提示；事件 + 方法独立章节。

### 模式 15：data-slick 属性配置

**问题场景**：用户不想写 JS——只想 HTML 标记就能用 slick 怎么办？WordPress / CMS 用户友好。

**解决方案**：slick `data-slick` 属性——`<div data-slick='{"slidesToShow": 3}'>` 自动初始化；JSON.parse 解析。

```html
<!-- HTML 配置 -->
<div data-slick='{"slidesToShow": 3, "autoplay": true}'>
    <div>Slide 1</div>
    <div>Slide 2</div>
    <div>Slide 3</div>
</div>
<!-- 自动初始化 -->
<script>
$(function() {
    $('[data-slick]').each(function() {
        var config = JSON.parse($(this).attr('data-slick'))
        $(this).slick(config)
    })
})
</script>
<!-- 设计师 / CMS 友好 -->
<!-- WordPress / Webflow / 钉钉宜搭都能用 -->
```

**关键参数**：
- 属性 = `data-slick='{json}'`
- 解析 = `JSON.parse($(el).data('slick'))`
- 初始化 = `$(el).slick(parsedConfig)`
- 优势 = 设计师友好 / WordPress 友好
- 限制 = JSON 转义要小心（单引号）

**最佳实践**：前端组件支持 `data-xxx` 属性配置——降低 JS 门槛，方便设计师/编辑器；JSON 单引号（HTML 属性允许）；多属性 `data-plugin` / `data-config` 分层；启动脚本扫描 `data-xxx` 自动初始化；复杂配置仍走 JS 路径（避免 HTML 污染）。

---

## 第四段：实战选型 - 替代品、无障碍与复刻

### 模式 16：Slick vs Swiper vs Splide 选型

**问题场景**：轮播组件选 jQuery 时代 slick / 现代 Swiper（无依赖）/ Splide（轻量）？看 jQuery 依赖 + 体积 + 功能。

**解决方案**：决策——老项目 jQuery 必装选 slick；新项目无 jQuery 选 Swiper（功能最全）或 Splide（最轻量）。

```js
// 选型决策
function pickCarousel(project) {
    if (project.usesJQuery) {
        return 'slick'  // 老项目 jQuery 必装
    }
    if (project.needs === 'full-featured') {
        return 'swiper'  // 6 模式（slide/fade/cube/coverflow/flip/cards）
    }
    if (project.needs === 'lightweight') {
        return 'splide'  // 5KB + TypeScript + 极快
    }
    if (project.needs === 'vanilla') {
        return 'swiper'  // 也支持 vanilla
    }
}
// 性能对比
// slick: 90KB + jQuery 30KB = 120KB
// swiper: 50KB（无依赖）
// splide: 5KB（最轻量）
// 功能对比
// slick: 30+ 配置 / IE8 兼容
// swiper: 50+ 配置 / 无 IE 兼容
// splide: 20+ 配置 / 现代浏览器
```

**关键参数**：
- Slick = jQuery 依赖 / 28.5k star / 3046 行
- Swiper = 无依赖 / 40k+ star / 6 模式（slide / fade / cube / coverflow / flip / cards）
- Splide = 无依赖 / 5KB 轻量 / TypeScript
- 性能 = Splide > Swiper > Slick
- 选择 = 看 jQuery 依赖

**最佳实践**：新项目用 Splide（5KB 轻量）或 Swiper（功能全）；老 jQuery 项目维持 slick；Swiper 功能最全（6 模式）但体积大；Splide 是 2020+ 新趋势（轻量 + 现代 API）。

### 模式 17：jQuery 依赖的利弊

**问题场景**：slick 必须 jQuery——2014 没问题，2026 还要不要绑 jQuery？体积代价多大？

**解决方案**：jQuery 依赖 = 用户群决定——老项目 90% 已有 jQuery，免费用；新项目无 jQuery 选 Swiper/Splide。

```bash
# 体积对比（gzipped）
slick: 30KB
swiper: 50KB
splide: 5KB
jQuery: 30KB（slick 依赖）
# 老项目（已用 jQuery）
# 代价 = 30KB（slick 本身）
# 0 额外 jQuery 代价
# 新项目（不用 jQuery）
# slick 总代价 = 30KB + 30KB（jQuery）= 60KB
# swiper 总代价 = 50KB
# splide 总代价 = 5KB
# 选型
# 老项目 + jQuery → slick
# 新项目 + 大轮播 → swiper
# 新项目 + 小轮播 → splide
```

**关键参数**：
- 体积 = jQuery 30KB + slick 90KB = 120KB
- 替代 = Swiper 50KB / Splide 5KB
- 兼容性 = jQuery 1.7-3.x
- IE8 = jQuery 1.x 支持 / slick 支持
- 决策 = 看项目 jQuery 状态

**最佳实践**：新项目摆脱 jQuery——Swiper/Splide 是未来，老项目维持 slick；jQuery 1.x 支持 IE8（slick 兼容）；3.x 现代化但放弃 IE；Slick 3046 行代码可读性高（jQuery 时代典范）；2026 新项目无 jQuery 必要。

### 模式 18：CSS vs JS 动画权衡

**问题场景**：轮播动画走 CSS transition 还是 JS requestAnimationFrame？性能与兼容性怎么平衡？

**解决方案**：slick 走 CSS transition（useCSS） + jQuery animate 降级——简单 + 60fps 友好 + 老 IE 兼容；现代项目放弃 IE 只走 CSS。

```js
// CSS vs JS 动画对比
// CSS transition
.slick-track {
    transition: transform 300ms ease;
    transform: translate3d(-100%, 0, 0);
    will-change: transform;
}
// 优点：60fps / GPU 加速 / 现代浏览器
// 缺点：IE9- 不支持 / 控制能力弱
// jQuery animate
$slider.animate({ left: '-100%' }, 300, 'swing')
// 优点：IE6+ 兼容 / 控制能力强
// 缺点：30fps / 主线程计算
// requestAnimationFrame（手动）
function animate(target, duration) {
    var start = performance.now()
    function step(now) {
        var progress = Math.min((now - start) / duration, 1)
        slider.style.transform = `translate3d(${-100 * progress}%, 0, 0)`
        if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
}
// 优点：60fps / 精确控制
// 缺点：IE10+ / 代码量大
// 选型 = CSS 优先 + 降级
```

**关键参数**：
- CSS transition = 60fps / GPU 加速 / IE10+
- jQuery animate = 30fps / JS / IE6+
- requestAnimationFrame = 60fps / JS / IE10+
- 决策 = CSS 优先 + 降级到 jQuery
- 性能 = GPU 加速是 60fps 关键

**最佳实践**：动画走 CSS transform（GPU 优先） + JS 降级——现代浏览器 60fps，老 IE 兼容；新项目放弃 IE 后只走 CSS；`transform: translate3d` 触发 GPU layer；JS 动画用 rAF 不用 setTimeout；CSS 动画无法暂停 / 中断（用 animation-play-state）。

### 模式 19：无障碍 Accessibility

**问题场景**：屏幕阅读器用户怎么用轮播？键盘用户怎么导航？WCAG 2.1 AA 合规要求。

**解决方案**：slick `accessibility: true` 默认——`role="region"` + `aria-live` + 键盘左右键；自动添加 ARIA 属性。

```html
<!-- 自动添加的 ARIA -->
<div class="slick-slider" role="region" aria-roledescription="carousel" aria-label="...">
    <ul class="slick-dots" role="tablist">
        <li role="presentation">
            <button type="button" role="tab" aria-selected="true" aria-controls="slick-slide00" id="slick-slide00-tab">1</button>
        </li>
    </ul>
    <div class="slick-list">
        <div class="slick-track">
            <div class="slick-slide" role="tabpanel" id="slick-slide00" aria-labelledby="slick-slide00-tab" aria-hidden="false">...</div>
        </div>
    </div>
</div>
<!-- 键盘导航 -->
<button type="button" class="slick-prev" aria-label="Previous">Previous</button>
<button type="button" class="slick-next" aria-label="Next">Next</button>
```

**关键参数**：
- `accessibility` = 启用 / 禁用
- `aria-roledescription="carousel"` + `aria-label="..."`
- `tabindex="0"` 让 slide 可聚焦
- 键盘 = `←` / `→` 切换
- 屏幕阅读器 = 公告 "Slide 2 of 5"

**最佳实践**：UI 组件必带无障碍——WCAG 2.1 AA 合规，开箱即用最佳；ARIA 默认开启（`accessibility: true`）；`role="region"` + `aria-roledescription="carousel"` 标识轮播；每个 slide 必 `role="tabpanel"` + `aria-label`；键盘 ←→ 切换 + 空格暂停自动播放。

### 模式 20：7 天复刻 mini-slick 路线

**问题场景**：想理解轮播组件架构；想做一个轻量现代版（无 jQuery）；想要 teach-by-doing 练手。

**解决方案**：7 天 MVP（Vanilla JS）——Day 1-2 配置 + 状态机，Day 3 自动播放 + 拖拽，Day 4 无限循环 + 克隆，Day 5 断点响应式，Day 6 懒加载 + 动画，Day 7 无障碍 + 文档。

```bash
# Day 1-2: 入口 + 配置 + 状态机
mkdir mini-slick && cd mini-slick
npm init -y
# src/index.js
#   - class Carousel
#   - constructor(el, options) {
#       this.el = el
#       this.options = { slidesToShow: 1, ... }
#       this.currentSlide = 0
#       this.init()
#     }
#   - next() / prev() / goTo(idx)
# 测试：基础切换

# Day 3: 自动播放 + 拖拽
#   - setInterval 触发 next
#   - touchstart / touchmove 监听
#   - mousedown / mousemove 监听
#   - 计算 swipe 距离

# Day 4: 无限循环 + 克隆
#   - prepend(clones.slice(0, slidesToShow))
#   - append(clones.slice(-slidesToShow))
#   - 到达边界时 translate3d 重置

# Day 5: 断点响应式
#   - window resize 监听
#   - breakpoints: [{ width: 1024, settings: {...} }]
#   - 100ms debounce

# Day 6: 懒加载 + 动画
#   - IntersectionObserver 观察 .slick-slide
#   - <img data-lazy>
#   - CSS transform: translate3d

# Day 7: 无障碍 + 文档
#   - role="region" + aria-label
#   - ← → 键盘事件
#   - README 写 30+ 配置 + 10+ 事件 + 15+ 方法
```

**关键参数**：
- 核心 = 状态机 + 配置对象
- 协议 = jQuery 插件或 Vanilla JS
- 性能 = CSS transform + GPU
- 兼容 = 现代浏览器（放弃 IE8）
- 复刻难度 = 核心 1000 行，5-7 天

**最佳实践**：复刻 mini-slick 用 Vanilla JS + CSS Grid + IntersectionObserver——比 jQuery 版轻 5x，性能更好；放弃 IE 兼容（省 20% 代码）；Slick 设计模式（状态机 + 配置 + 命名空间事件）依然适用；Swiper 源码是更好的现代参考（无 jQuery 依赖）。

---

## 附录：3 段必读代码

1. `slick/slick.js` — 3046 行核心 IIFE（配置 + 状态机 + 30+ 方法）
2. `slick/slick.css` + `slick-theme.css` — 核心/主题双样式分离
3. `slick/fonts/` — Iconfont 4 格式（eot/ttf/woff/woff2）

## 一句话总结

slick = jQuery 时代事实标准轮播（28.5k star）+ 配置对象 + 状态机 5 状态 + 命名空间事件（`.slick`）+ 断点响应式 + 触摸/鼠标/键盘三态统一 + 无限循环克隆 + 懒加载 + CSS3 动画降级 + asNavFor 联动，把"轮播组件"做到 IE8 兼容 + 30+ 配置 + 10+ 事件 + 15+ 方法的工业级水准，2014-2020 主流位置被 Swiper/Splide 取代但仍是历史项目默认。
