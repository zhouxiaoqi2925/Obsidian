# marionette - Backbone 之上的复合应用库

**GitHub**: marionettejs/backbone.marionette
**Star**: 7.4k（v4 仓库）
**语言**: JavaScript (ES2020+)
**主题**: Backbone 生态、SPA 视图层、复合应用
**适用场景**: 2013-2019 兼容 IE10+ 的企业 SPA、需要结构化视图管理的前端项目

---

## 一、基础范式

### 模式 1 · View 渲染与四态生命周期

**问题场景**：Backbone 1.x 没有规范 View 渲染状态，反复调用 render 会破坏 DOM；jQuery 时代的 zombie view 导致内存泄漏。

**解决方案**：用 `_isRendered` / `_isAttached` / `_isDestroyed` / `_isDestroying` 四个布尔位守门，让 render/attach/detach/destroy 都能幂等调用。Region 在 show 时自动触发完整生命周期。

**关键参数**：
- `_isRendered` 控制 `template()` 是否能再次执行
- `_isAttached` 控制 DOM 节点是否已挂载
- `_isDestroying` 防重入位，阻止 destroy 嵌套
- render() 返回 this，支持链式
- onBeforeRender / onRender 双钩子覆盖

**最佳实践**：永远通过 Region 的 `show()` 进入 View，不要直接 `view.render()` + 手动挂载，让 Region 管理 destroy 链。

### 模式 2 · Region 容器哨兵四步曲

**问题场景**：手动挂载 View 容易漏掉旧 View 销毁、漏触发 attach/detach 事件，SPA 内存爆炸。

**解决方案**：`Region.show(view)` 走「验证（`_ensureElement`）→ 查重（`view._isShown` 跨 Region 唯一）→ 走流程（empty → setup → render → attach）→ 收尾（`triggerMethod('show')`）」四步曲，自动回收旧 View。

**关键参数**：
- `currentView` 持有当前 View
- `_isSwappingView` 区分首次挂载 vs 换页
- `view._isShown` 哨兵防止双挂载
- empty() 触发 before:empty → empty 事件链
- `_setupChildView` 注入 region 反向引用

**最佳实践**：在 SPA 中任何容器都是 Region，包括弹窗、Tab 切换器、路由出口，零手动挂载。

### 模式 3 · Mixin 组合优于继承

**问题场景**：Backbone 1.x 时代用 class 继承容易出脆弱基类问题，多 View 类型复用同一组能力（如 regions/triggers/ui）时重复严重。

**解决方案**：所有公开类（View/CollectionView/Region/Application/Behavior）都用 `_.extend(prototype, MixinA, MixinB, ...)` 组合而非 ES6 class。Mixins 是纯对象文件 `src/mixins/*.js`，能力可跨类复用。

**关键参数**：
- ViewMixin / RegionsMixin / BehaviorsMixin / UiMixin / TriggersMixin
- `classOptions` 黑名单声明哪些 options 走 `_setOptions` 合并
- 后置 mixin 覆盖前置同名方法
- MnObject 作为所有可实例化类的最小基类

**最佳实践**：新功能先抽 mixin 而非开新基类，mixin 顺序用注释明确写出来，避免调试时排查覆盖关系。

### 模式 4 · triggerMethod 双通道事件

**问题场景**：Backbone 1.x 只支持 `view.on('foo:bar', cb)` 事件订阅，写业务时栈追踪丢失，IDE 跳转不到回调。

**解决方案**：`src/common/trigger-method.js` 同时触发 Backbone 事件 `foo:bar` 和调用同名方法 `onFooBar`，module 级 `methodCache` 缓存 `foo:bar → onFooBar` 转换结果。

**关键参数**：
- 正则 `/^|:\w/g` 一次性把 `foo:bar:baz` 转成 `onFooBarBaz`
- `methodCache = {}` 模块级 Map
- `getOnMethodName(event)` 懒查
- 事件名和方法名走同一字符串

**最佳实践**：所有 framework 事件（before:render / attach / show / destroy）都通过 triggerMethod 触发，业务既能用 `on('render')` 解耦也能用 `onRender()` 强类型。

### 模式 5 · Feature Flag 集中管理

**问题场景**：v3→v4 有 50+ breaking change，一次性升级让老项目崩溃。

**解决方案**：`src/config/features.js` 用 4 行 `FEATURES = { childViewEventPrefix: false, ... }` 集中管理行为开关，提供 `isEnabled` / `setEnabled` API，用户按需切回老行为。

**关键参数**：
- `Marionette.isEnabled('FEATURE_ID')` 读
- `Marionette.setEnabled('FEATURE_ID', true)` 写
- 4 行配置覆盖 4 类行为
- v3→v4 平滑过渡 2 年

**最佳实践**：所有「重大重构」项目都内置 feature flag，让老用户按需切回，是大版本无感升级的工程典范。

---

## 二、扩展范式

### 模式 6 · Behavior 横切关注点容器

**问题场景**：表单验证、tooltip、loading 态等横切逻辑写在 View 里既冗余又难复用。

**解决方案**：`Behavior` 把 `events / triggers / ui / modelEvents / collectionEvents` 整租搬到 Behavior 中，通过 `this.view` 反向引用宿主 View，UI 哈希在构造时 `_.extend({}, behavior.ui, view.ui)` 让宿主覆盖。

**关键参数**：
- `behavior.ui` + `view.ui` 后置合并
- `this.listenTo(view, 'all', this.triggerMethod)` 接收宿主所有事件
- `initialize.apply(this, arguments)` 钩子
- 宿主在 `behaviors: [LoadingBehavior]` 中声明

**最佳实践**：把滚动监听、键盘快捷键、自动保存这类跨 View 通用逻辑抽 Behavior，View 本体只剩业务状态。

### 模式 7 · CollectionView 增量更新

**问题场景**：完整 re-render 列表会丢滚动位置、focus 和 DOM 状态。

**解决方案**：`CollectionView` 监听 Backbone.Collection 的 `update` 事件（add+remove+sort 合并），用 `options.changes` 拿到完整 added/removed 列表，diff 算法逐个处理。

**关键参数**：
- `view.filter` / `view.sort` 钩子
- `_onCollectionUpdate` 处理 add+remove+sort
- 先 remove 后 add 优化小数组先查
- `_detachChildren` 在 sort 前做 DOM 卸载
- `_removeChildViews(removedViews)` 防内存泄漏

**最佳实践**：列表超过 50 条必须用 CollectionView + diff，不要用 Backbone 原生 `collection.reset()` 触发全量渲染。

### 模式 8 · setDomApi 解耦 jQuery

**问题场景**：框架硬绑 jQuery，2024 年新项目不想引 jQuery。

**解决方案**：`setDomApi(mixin)` 一行替换 DOM 适配层，jQuery / cheerio / vanilla.js / React-DOM 都能注入。Marionette 4.x 内部所有 DOM 操作都走 `this.$el`（适配层包装），不直接调 jQuery。

**关键参数**：
- `setDomApi({ find, html, on, off, appendTo })` 注入 7-8 个方法
- `Backbone.$ = newDomApi` 同步替换 Backbone
- vanilla.js / cheerio 测试环境用 jsdom
- React-DOM 适配层做 SPA 桥接

**最佳实践**：框架层永远不要硬绑 DOM 库，setDomApi 是 Marionette 能在 2024 年迁出 Backbone 的底层准备。

### 模式 9 · MnObject 最小基类

**问题场景**：Region/Application/Behavior 之间有 30% 代码重复（option 合并、cid、triggerMethod 转发）。

**解决方案**：`MnObject` 是所有非 View 类的基类，提供 `cid` / `_setOptions` / `mergeOptions` / `triggerMethod` / `listenTo` / `destroy` 这 6 个能力，不沾任何 DOM。

**关键参数**：
- `cidPrefix` 区分 `mna` / `mnb` / `mnr` / `mnv`
- `ClassOptions` 黑名单走 `_setOptions`
- `mergeOptions(this, options, props)` 浅合并
- `triggerMethod` 复用
- `destroy()` 释放 `stopListening` + 业务钩子

**最佳实践**：框架中所有「不需要 DOM 的状态对象」都继承 MnObject 而非 Backbone.Model，省掉 30% 重复代码。

### 模式 10 · Application 启动模型

**问题场景**：SPA 没有启动钩子，业务层乱写 `$(function() {...})`，调试时不知道是哪个模块先跑。

**解决方案**：`Application` 提供 `on('start', cb)` / `on('before:start', cb)` 启动钩子和 `on('stop', cb)` 停止钩子，所有 Region 监听 `app.on('start', ...)` 注册自己。

**关键参数**：
- `app.start(options)` 主入口
- `app.startHistory()` 启用 Backbone.Router
- `app.getRegion()` / `app.getView()`
- destroy 链反向清理
- 子模块 `app.module('Todo', TodoModule)` 命名空间

**最佳实践**：SPA 入口只调 `app.start()`，所有初始化逻辑都在 `on('start')` 钩子里，单元测试可直接 stub Region 验证 start 流程。

---

## 三、进阶范式

### 模式 11 · monitorViewEvents 抽离 attach/detach 监听

**问题场景**：v3 之前 View/Region/CollectionView 各自实现 attach/detach 监听，子视图事件容易漏触发。

**解决方案**：`src/common/monitor-view-events.js` 把 6 个事件钩子（before:attach / attach / before:detach / detach / before:render / render）抽到 `monitorViewEvents(view)` 函数，构造时统一注册。

**关键参数**：
- `_areViewEventsMonitored` 防重入位
- `monitorViewEvents === false` 显式关闭开关
- 6 个钩子集中管理
- CollectionView 内部 Region 复用 View 防双注册
- v4 重构标志

**最佳实践**：任何「同一逻辑被多个类需要」的场景，抽到外部函数 + 防重入位，比继承或 mixin 更干净。

### 模式 12 · proxy() 包装公共 API

**问题场景**：内部方法 `_bindEvents` 强绑 `this`，外部调用时丢失上下文。

**解决方案**：`src/backbone.marionette.js` 用 `proxy()` 把内部 `this`-bound 方法剥成顶层 API 调用，老用户既能用 `Marionette.bindEvents(el, ...)` 也能用 `view.bindEvents(...)`。

**关键参数**：
- `proxy(fn)` 包装器
- `Marionette.bindEvents` 顶层 API
- `Marionette.unbindEvents` 对应反向
- 入口门面 + 代理 + 注入三件套
- 11 年不动核心 API

**最佳实践**：库的顶层 API 一定要既能从命名空间调也能从实例调，proxy() 是 50 行写完的关键。

### 模式 13 · View 销毁链 + 内存回收

**问题场景**：Backbone 1.x 项目常出现 zombie view（DOM 删了但 JS 引用还在），导致内存泄漏。

**解决方案**：`view.destroy()` 链式清理：先 `triggerMethod('before:destroy')` → 解绑 events → 销毁子 Region/Behavior → 触发 `destroy` → 通知 Region 触发 `empty`。Region 通过 `view.on('destroy', this._empty, this)` 反向订阅。

**关键参数**：
- `isDestroyed` / `isDestroying` 状态机
- `DestroyMixin` 提供 destroy 默认实现
- Region 双向绑定 view.destroy
- `_removeChildViews` 递归清理
- Behavior 的 `this.view` 反向引用

**最佳实践**：SPA 路由切换必须调 `region.empty()` 触发销毁链，DevTools Memory 面板用 3 次快照对比验证零泄漏。

### 模式 14 · ClassOptions 黑名单机制

**问题场景**：构造器 `_setOptions(this.options, ...)` 整体覆盖时，子类声明的 `regions` / `behaviors` 等数组/对象被父类覆盖。

**解决方案**：`ClassOptions = ['behaviors', 'regions', 'ui', 'triggers', ...]` 显式声明哪些 options 走 `_setOptions` 合并而非整体覆盖，让父类构造器安全。

**关键参数**：
- 数组 / 对象类型 options 必进 ClassOptions
- `mergeOptions` 浅合并工具
- View / CollectionView / Region 各自维护 ClassOptions
- 子类同名 options 后置覆盖
- mixin 加新能力时同步更新 ClassOptions

**最佳实践**：所有「构造器继承」场景，预先列 ClassOptions 白/黑名单，避免子类数组被父类覆盖的隐蔽 bug。

### 模式 15 · Radio 全局事件总线

**问题场景**：跨模块通信用 Backbone 全局事件会污染，跨 Region 通信没有规范。

**解决方案**：`backbone.radio`（Marionette 官方配套）提供 `Radio.channel('todos')` 命名空间频道，每个 channel 有 `reply` / `request` / `on` / `trigger` 四件套，模块内私有通信不污染全局。

**关键参数**：
- `Radio.channel(name)` 命名空间
- `channel.reply('cmd', handler)` 请求-响应
- `channel.request('cmd', ...)` 同步调用
- `channel.on / trigger` 事件
- `Radio.DEBUG = true` 调试开关

**最佳实践**：大项目用 Radio 替代 Backbone 全局事件，每个业务域一个 channel，单元测试可 stub 整个 channel。

---

## 四、实战范式

### 模式 16 · Smoke test 最小可运行

**问题场景**：从 README 复制粘贴 200 行代码才能验证环境，跑不起来就放弃。

**解决方案**：5 行 View + 3 行 Region + 3 行 Application 即可起一个可点击的 counter：

```js
const Mn = require('backbone.marionette');
const App = new Mn.Application();
const MyView = Mn.View.extend({
  template: _.template('<button id="b">Click <%= n %></button>'),
  ui: { btn: '#b' },
  triggers: { 'click @ui.btn': 'count:click' },
  onCountClick() { this.count = (this.count||0) + 1; this.render(); }
});
App.on('start', () => {
  const r = new Mn.Region({ el: '#app' });
  r.show(new MyView());
});
App.start();
```

**关键参数**：
- Backbone.$ 必须在 require 后赋值
- Application.start() 是入口
- Region 必须传 el
- triggers 走 `事件 @ui.选择器` 语法
- onCountClick 同步方法

**最佳实践**：新环境验证用 30 行 smoke test，验证 Backbone + jQuery + Mn 三大件就位后再开发。

### 模式 17 · 4 件套 + Monitor 三件套

**问题场景**：Sentry 报错定位不到具体是 View 哪个生命周期挂掉。

**解决方案**：在 `triggerMethod` 上 monkey-patch 输出一行 `event: name` 到 console，加上 timestamp；Region.show 前后加埋点 `console.log('region:show', region.cid, view.cid)`。

**关键参数**：
- `monitorViewEvents` 集中 6 个事件
- 4 态布尔位打 snapshot
- triggerMethod 包一层 console.log
- `app.on('all', ...)` 全局拦截
- Backbone.Radio.DEBUG 开启追踪

**最佳实践**：生产环境用 1% 采样打 log，不开监控等于盲人摸象。

### 模式 18 · CI 矩阵 Node 16/18/20

**问题场景**：Marionette 跨大版本，ES2017+ 语法在新 Node 跑得通，老 Node 报错。

**解决方案**：`.github/workflows/ci.yml` 跑 Node 16 / 18 / 20 三矩阵 + ESLint + Mocha + Build 验证。覆盖率上 Coveralls，PR 必须通过。

**关键参数**：
- 3 节点矩阵
- ESLint 8 + `'use strict'` 强制
- Mocha + Chai + Sinon + jsdom
- Rollup 构建产物必须通过
- Coveralls 上报覆盖率

**最佳实践**：所有 UI 框架都用 3 节点矩阵跑 CI，避免单 Node 版本依赖陷阱。

### 模式 19 · 与同类对比与替代

**问题场景**：2019 年选 SPA 框架，要在 Marionette / Backbone 裸用 / Angular 1.x / React+Redux / Vue 2 之间选。

**解决方案**：Marionette 定位「学习曲线低 + 内存管理强」，Backbone 时代 SPA 唯一「view 内存回收开箱即用」的框架。2019 之后新项目直接选 React + Redux 或 Vue 2，Marionette 仅用于 IE10+ 兼容老项目。

**关键参数**：
- 4 维度：学习曲线 / 内存管理 / 生态 / 现代性
- 7.4k star vs React 200k+
- v5 已迁出 Backbone 主仓库
- IE10+ 兼容是企业唯一选择
- 维护期到 2024 截止

**最佳实践**：选型看「团队熟悉度 + 浏览器要求 + 维护周期」，Marionette 在 2024 后仅维护模式。

### 模式 20 · 7 天复刻路线图

**问题场景**：团队想 fork Marionette 4.x 做内部框架。

**解决方案**：7 天分 6 步：① 克隆跑通 npm test ② 抽 triggerMethod + Mixin 组合 ③ 实现 Region show/empty/attach 状态机 ④ CollectionView 监听 update+sort ⑤ Behavior ui 哈希覆盖 + listenTo view ⑥ 写 docs 5 个 markdown。

**关键参数**：
- Day 1: 跑通测试
- Day 2: triggerMethod 是核心
- Day 3-4: Region 哨兵四步曲最复杂
- Day 5: CollectionView diff
- Day 6: Behavior
- Day 7: 文档 + 灰度发布

**最佳实践**：7 天复刻只求「最小可跑内核」，完整复刻需要 3 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\marionette\`
- **大小**: ~3.5 MB
- **总文件数**: 147
- **关键 commit**: v4.1.3
- **作者**: Derick Bailey（v1-v4）+ 社区维护者
- **许可**: MIT

## 一句话总结

Marionette 用 5000 行 JS 把「View 树管理 + 内存回收 + 事件路由」做到了 Backbone 时代的最优解，triggerMethod 双通道 + Region 哨兵四步曲 + Mixin 组合是它的三大工程典范。
