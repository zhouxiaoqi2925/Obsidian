# backbone - 14 年高龄的极简 MV* JavaScript 框架

**GitHub**: jashkenas/backbone
**Star**: 28k+
**语言**: JavaScript (ES5)
**主题**: MV* 框架 / 事件总线 / 路由 / 单文件库
**适用场景**: 轻量 SPA 骨架、jQuery 时代遗留维护、约束式前端架构

## 第一段：基础范式

### 模式 1：单文件 82KB 主代码承载全部 API

**问题场景**：jQuery 时代 DOM 与数据强耦合——大型 SPA 没有"分层"约束，新人写代码时 DOM 事件、Ajax、状态管理散落各文件。

**解决方案**：backbone 把 Model / Collection / View / Events / Router / History / sync 全部塞进 `backbone.js` 一个文件（2158 行，82KB）：
```js
// backbone.js
var Backbone = {
  Events, Model, Collection, View, Router, History, sync
};
```

**关键参数**：
- 单文件发布——`backbone.js` 82KB
- `backbone-min.js` uglify 压缩版
- 入口即所有 API——`Backbone.Model` / `Backbone.View` 等
- 子模块拆分——`modules/debug-info.js` 调试信息
- 无构建步骤——直接 `<script src="backbone.js">`

**最佳实践**：极简库走单文件——无构建即用；82KB 容量是 14 年经验值——多了不必要，少了不够；调试信息子模块——按需加载。

---

### 模式 2：Events 事件总线 + on/off/trigger 三件套

**问题场景**：多视图共享状态——View A 改数据要通知 View B 重渲染；DOM 事件需统一管理；跨模块通信难。

**解决方案**：backbone 抽出 `Events` 模块作为 mixin，Model / Collection / View 全部混入：
```js
var Events = {
  on(name, callback, context) { /* 绑定 */ },
  off(name, callback, context) { /* 解绑 */ },
  trigger(name) { /* 触发 */ },
  listenTo(other, name, cb) { /* 监听他人 */ },
  stopListening() { /* 停止监听 */ }
};
```

**关键参数**：
- `on / off / trigger` 三件套
- `listenTo / stopListening` 主动监听他人——避免循环引用
- `trigger('change', ...)` 携带数据
- 内部用 `_events` / `_listeners` map
- mixin 模式——任何 object 可混入

**最佳实践**：事件总线必加 `listenTo`——避免双向引用；`off + stopListening` 必加 cleanup——防内存泄漏；trigger 多参数支持——传递丰富数据。

---

### 模式 3：Model + Backbone.sync RESTful 持久化

**问题场景**：前端 Model 要持久化到后端 REST API，CRUD 操作样板重复。

**解决方案**：`Backbone.sync` 方法把 Model CRUD 映射到 REST 端点：
```js
// Model.save() -> POST /users
// Model.fetch() -> GET /users/:id
// Model.destroy() -> DELETE /users/:id
Backbone.sync = function(method, model, options) {
  // method: 'create' | 'read' | 'update' | 'patch' | 'delete'
  // 默认 RESTful 端点
};
```

**关键参数**：
- `sync` 单方法分派——5 个 CRUD 操作
- RESTful URL 约定——`/collection/:id`
- 覆盖 `sync` 即可换后端——localStorage / 自定义 API
- 失败回调 `options.error` / 成功 `options.success`
- 触发 Model `'sync'` 事件

**最佳实践**：CRUD 走 `sync` 抽象——一套代码多后端；localStorage adapter 覆盖 `sync`——离线 SPA；`error / success` 回调标准化——错误处理统一。

---

### 模式 4：View 极薄壳层 + `this.$el` jQuery 包装

**问题场景**：View 是 SPA 最重概念——既要管理 DOM 事件，又要响应 Model 变化。

**解决方案**：backbone 的 View 极薄——`el` 根节点 + `events` 声明式事件 + `render()` 方法：
```js
var UserView = Backbone.View.extend({
  el: '#user',
  events: { 'click .edit': 'onEdit' },
  initialize() { this.listenTo(this.model, 'change', this.render); },
  render() { this.$el.html(this.template(this.model.toJSON())); return this; }
});
```

**关键参数**：
- `el` 根 DOM 节点
- `events` 声明式事件——`{ 'click .edit': 'onEdit' }`
- `this.$el` = jQuery 包装
- `listenTo` 监听 Model `change` 自动重渲染
- `render()` 返回 this——链式

**最佳实践**：View 极薄壳层——业务逻辑放 Model；`events` 声明式——避免 `on('click')` 散落；`listenTo` 而非 `model.on('change', this.render, this)`——避免内存泄漏。

---

### 模式 5：Collection 有序集合 + Model 引用关系

**问题场景**：SPA 要展示用户列表 / 订单列表——单 Model 不够，要集合操作（filter / sort / map）。

**解决方案**：backbone Collection 封装有序 Model 集合：
```js
var Users = Backbone.Collection.extend({
  model: User,
  url: '/users',
  comparator: 'createdAt'  // 按字段排序
});
var users = new Users([
  { name: 'A' }, { name: 'B' }
]);
var a = users.at(0);  // 索引访问
users.add({ name: 'C' });  // 自动触发 'add' 事件
```

**关键参数**：
- `model` 字段——元素类型
- `comparator` 字段 / 函数——排序
- `at / get / add / remove` 数组操作
- `url` 同步——`fetch / create`
- 触发 `'add' / 'remove' / 'reset' / 'sort'` 事件

**最佳实践**：Collection 必设 `model`——类型化；`comparator` 字段比函数性能好；事件名稳定——`add / remove / reset / sort` 4 件套。

---

## 第二段：扩展范式

### 模式 6：Router pushState + History 监听

**问题场景**：SPA 要 URL 路由 + 浏览器前进后退按钮支持 + 收藏 URL 可分享。

**解决方案**：backbone Router 用 pushState（HTML5 History API）管理路由：
```js
var AppRouter = Backbone.Router.extend({
  routes: {
    '': 'home',
    'users/:id': 'userDetail',
    '*notFound': 'notFound'
  },
  home() { /* 渲染首页 */ },
  userDetail(id) { /* 渲染用户详情 */ }
});
Backbone.history.start({ pushState: true });
```

**关键参数**：
- `routes` 声明式路由表
- `:param` / `:param*` / `*splat` 三种通配
- `Backbone.history.start({ pushState: true })` 启动
- 监听 `popstate` + `pushState` 劫持
- 触发 `'route'` 事件

**最佳实践**：路由声明式而非命令式——`routes` map 集中管理；`pushState: true` 启用现代 API；`History.start()` 必须在 DOM ready 后；URL 命名空间——避免与后端冲突。

---

### 模式 7：extend 继承 + 静态属性 + prototype 拷贝

**问题场景**：用户要扩展 Model/View/Collection——backbone 提供 `extend` 类似 Backbone.Model.extend({...}) 写子类。

**解决方案**：`extend` 合并 parent prototype + child properties：
```js
var App.Model = Backbone.Model.extend({
  someProperty: 'foo',
  someMethod() { return 'bar'; }
}, {
  staticProperty: 'static-foo'  // 静态属性
});
var instance = new App.Model();
```

**关键参数**：
- `extend(protoProps, staticProps)` 签名
- 父 prototype 浅拷贝 + 子 properties 合并
- `__super__` 指向 parent——子类可调父方法
- 静态属性第二参数
- 经典 Backbone 风格——早于 ES6 class

**最佳实践**：`extend` 兼容 ES5——backbone 仍用；`__super__` 是逃生通道——`Backbone.Model.prototype.someMethod.apply(this, arguments)`；子类化时用 `_super`——避免覆盖父方法。

---

### 模式 8：noConflict 全局命名空间释放

**问题场景**：backbone 占用 `Backbone` 全局变量——其他库可能也想用 `Backbone`，冲突。

**解决方案**：`noConflict()` 方法释放 `window.Backbone`，返回 backbone 自己：
```js
var myBackbone = Backbone.noConflict();
// window.Backbone 恢复为之前的值
// myBackbone 现在持有 backbone 引用
```

**关键参数**：
- 保存 `previousBackbone = window.Backbone`
- `window.Backbone = undefined`
- 返回当前 backbone
- 测试 `test/noconflict.js` 验证
- jQuery 也有相同模式——一致约定

**最佳实践**：全局库必加 `noConflict`——避免冲突；返回自身引用——用户可改名；测试必加——验证不污染全局。

---

### 模式 9：listenTo vs on 解决循环引用

**问题场景**：View A listen Model X 变化，Model X listen View A 事件——双向引用 + 双方都不释放 = 内存泄漏。

**解决方案**：用 `listenTo` 让"被监听方"持有"监听方"引用，cleanup 时统一解绑：
```js
// View initialize
this.listenTo(this.model, 'change', this.render);
// View remove 时
this.stopListening();  // 自动清理所有 listenTo
```

**关键参数**：
- `view.listenTo(model, 'change', view.render)`——View 持有监听
- `_listeners` map——View 内部记录
- `stopListening()` 一次清理
- 比 `model.on('change', this.render, this)` 优势：单点清理
- 解决双向引用内存泄漏

**最佳实践**：永远用 `listenTo`——`stopListening` 单点清理；View `remove()` 必调 `stopListening`——防泄漏；`model.on(cb, this)` 留下隐患——`off` 必须逐个匹配。

---

### 模式 10：underscore 强依赖 + utility 复用

**问题场景**：Collection 操作要 `map / filter / find`——backbone 不重复造轮子。

**解决方案**：backbone 把 underscore 作为 utility 层（`_.each` / `_.map` / `_.extend`），所有内部实现走 underscore：
```js
// backbone.js
var _ = root._;  // 全局 underscore
// Collection._wrapped = []
each(this.models, function(model, index) { ... });
```

**关键参数**：
- 强依赖 underscore（1.13.x）
- `_.each / _.map / _.filter` 全用
- 30+ 内部方法走 `_.`
- `_.extend(proto, props)` 实现 extend
- `_.bind(fn, ctx)` 绑定 this

**最佳实践**：utility 层依赖成熟库——不造轮子；`_.extend` 是 extend 实现基础；`_.bind` 比 Function.prototype.bind 兼容性更好。

---

## 第三段：进阶范式

### 模式 11：debug-info 子模块按需暴露

**问题场景**：backbone 单文件 82KB——调试信息（依赖关系 / 性能计数）占体积但不常用。

**解决方案**：`modules/debug-info.js` 单独编译进 `backbone.js`，运行时由 `Backbone.debugInfo` 暴露：
```js
// modules/debug-info.js
Backbone.debugInfo = {
  version: '1.6.1',
  dependencies: { underscore: '1.13.x' },
  // ...
};
```

**关键参数**：
- `modules/package.json` 子模块元信息
- `modules/debug-info.js` 独立源
- 编译进主文件，但占空间小
- `Backbone.debugInfo` 按需访问
- 不影响核心 API 体积

**最佳实践**：调试元信息拆子模块——主文件体积最小化；按需暴露 `Backbone.debugInfo`——用户主动获取；构建脚本合并——单文件发布。

---

### 模式 12：Model validate 校验 + validationError 状态机

**问题场景**：Model save 前要校验——数据不合法时阻止请求 + 反馈给用户。

**解决方案**：`validate(attrs)` 方法返回错误字符串即视为失败，存入 `validationError`：
```js
var User = Backbone.Model.extend({
  validate(attrs) {
    if (!attrs.email) return 'Email required';
    if (attrs.age < 0) return 'Age must be positive';
  }
});
user.save({ email: '' });
// -> 触发 'invalid' 事件 + 设置 this.validationError
```

**关键参数**：
- `validate(attrs)` 返回字符串 = 失败
- `isValid()` 方法——主动校验
- `validationError` 字段——当前错误
- `'invalid'` 事件——监听失败
- save 时自动 validate——失败不发请求

**最佳实践**：`validate` 返回字符串或 Error 对象——简单明确；`isValid()` 主动校验 + `'invalid'` 事件被动监听——双路径；Form 提交前必 `isValid`——避免无效请求。

---

### 模式 13：jQuery/Zepto/Ender 适配器 + this.$ 自动包装

**问题场景**：backbone View 用 jQuery 操作 DOM——但用户可能用 Zepto（移动）或 Ender（轻量）。

**解决方案**：jQuery 是软依赖——`Backbone.$ = jQuery` 可覆盖，View 内部 `this.$ = $(this.el)` 自动包装：
```js
// 切换库
Backbone.$ = Zepto;  // 移动端
// View 内部
this.$el = Backbone.$(this.el);  // 自动包装
```

**关键参数**：
- `Backbone.$` 静态字段——可覆盖
- 软依赖——`<script src="jquery">` 不强制
- Zepto / Ender 兼容——API 相似
- 移动端用 Zepto——体积小
- `this.$el / this.$()` View 内部——库透明

**最佳实践**：DOM 库软依赖——`Backbone.$` 可切换；Zepto 移动端——体积优势；API 相似性是软依赖前提——`$()` 通用。

---

### 模式 14：Events 命名空间 + 事件 all 监听

**问题场景**：用户希望解除特定一组事件——如 `pubsub:foo` / `pubsub:bar` 一并解除。

**解决方案**：事件名用 `:` 命名空间，`off('pubsub:')` 一次性清除：
```js
obj.on('pubsub:foo', cb1);
obj.on('pubsub:bar', cb2);
obj.off('pubsub:');  // 一次性清除所有 pubsub 事件
// 'all' 监听所有事件
obj.on('all', function(name) { console.log(name); });
```

**关键参数**：
- 事件名约定 `category:event`
- `off('category:')` 一次解绑一类
- `'all'` 监听所有事件
- 内部按 `category` 分桶
- 调试日志友好

**最佳实践**：事件命名空间化——`pubsub:message` 避免冲突；`off('category:')` 批量清理；`'all'` 监听——debug 日志 + 中间件。

---

### 模式 15：Model toJSON() + parse() 反序列化

**问题场景**：Model 要序列化为 JSON 给 API / 模板；API 响应要 parse 到 Model 属性。

**解决方案**：`toJSON()` 返回属性对象，`parse(response)` 转换服务端格式：
```js
var User = Backbone.Model.extend({
  toJSON() {
    return { ...this.attributes, fullName: this.get('firstName') + this.get('lastName') };
  },
  parse(response) {
    response.created_at = new Date(response.created_at);  // 字符串转 Date
    return response;
  }
});
```

**关键参数**：
- `toJSON()` 默认返回 `attributes` 副本
- 可重写添加计算属性
- `parse(response)` 重写服务端格式
- `fetch` / `save` 时自动 parse
- `_previousAttributes` 记录上次值——diff 基础

**最佳实践**：`parse` 处理服务端字段转换——字符串转 Date / 嵌套展平；`toJSON` 添加计算属性——API 友好；`_previousAttributes` 是 `'change'` 事件 diff 基础。

---

## 第四段：实战范式

### 模式 16：CoffeeScript 兼容性测试 + 多浏览器矩阵

**问题场景**：backbone 14 年高龄，要支持老 IE / Safari / Chrome / Firefox / 移动端 + CoffeeScript 风格代码使用 backbone。

**解决方案**：`test/model.coffee` CoffeeScript 兼容性测试 + Karma 跨浏览器 + SauceLabs 老 IE：
```js
// karma.conf.js
browsers: ['Chrome', 'Firefox', 'Safari', 'IE11']
// karma.conf-sauce.js
sauceLabs: { /* IE 8-11 */ }
```

**关键参数**：
- QUnit + Karma 测试
- SauceLabs 老 IE 覆盖
- CoffeeScript 兼容性测试
- 6 个 test 文件：events / model / collection / view / router / sync
- 14 年兼容积累

**最佳实践**：跨浏览器测试用 SauceLabs——历史浏览器覆盖；CoffeeScript 测试是历史包袱——现代不必；6 个 test 文件按模块拆——单测隔离。

---

### 模式 17：docco 文档站 + 注释即文档

**问题场景**：backbone API 简单——但 14 年沉淀大量边界 case + tutorial 例子需要文档。

**解决方案**：用 docco（"literate programming" 工具）从注释生成 HTML 文档：
```bash
docco backbone.js
# 输出 docs/backbone.html
# 注释 + 代码交替排版
```

**关键参数**：
- `docs/backbone.html`——API 文档
- `docs/backbone.localStorage.html`——localStorage adapter
- `docs/todos.html`——TodoMVC 教程
- `docs/public/` 字体 + CSS
- `docs/images/` 客户 logo + 架构图

**最佳实践**：注释即文档——docco 工具零成本；教程单独 HTML——`docs/todos.html`；客户 logo + 架构图——生态展示。

---

### 模式 18：todos example + backbone.localStorage.js 离线示例

**问题场景**：用户首次接触 backbone——需要完整可跑例子 + 离线 demo。

**解决方案**：`examples/todos/` 经典 TodoMVC 实现 + `examples/backbone.localStorage.js` localStorage 持久化：
```js
// 启用 localStorage
var Todos = new Backbone.Collection([], {
  localStorage: new Backbone.LocalStorage('Todos-backbone')
});
// 创建自动持久化
```

**关键参数**：
- `examples/todos/` 完整 SPA
- `Backbone.LocalStorage` adapter
- 覆盖 `sync` 替换为 localStorage
- 离线 + 持久化
- 经典"框架入门"教程

**最佳实践**：框架必带 todos 例子——经典入门；localStorage adapter 覆盖 `sync`——离线 SPA 范式；`examples/` 单独目录——与主代码解耦。

---

### 模式 19：FUNDING.yml + Open Collective 双重赞助

**问题场景**：backbone 4-8 名核心 maintainer——长期维护需要资金支持。

**解决方案**：`.github/FUNDING.yml` + Open Collective 双重赞助：
```yaml
# .github/FUNDING.yml
github: [jashkenas]
open_collective: backbone
custom: ['https://tidelift.com/...']
```

**关键参数**：
- GitHub Sponsors + Open Collective
- Tidelift 商业赞助
- `FUNDING.yml` GitHub 官方识别
- 14 年资金来源透明
- maintainer 4-8 人轮值

**最佳实践**：OSS 长期维护需资金——FUNDING.yml 显式声明；Open Collective 透明——捐款人可见使用；Tidelift 商业化——企业级支持。

---

### 模式 20：1.6.x 长期支持 + IE 退役

**问题场景**：backbone 14 年仍维护——但 IE 退役后新版可以放弃老 IE 兼容。

**解决方案**：1.6.1（2024-03）正式放弃 IE 11 支持——使用现代 JS 特性：
```js
// 1.6.x 现代写法
Object.values(attrs)  // IE 不支持
// 放弃 IE 11 后启用
```

**关键参数**：
- v1.6.1（2024-03）放弃 IE 11
- ES5 → ES2017+ 渐进升级
- `Object.values / Object.entries` 启用
- 体积下降 5%
- 维护成本下降 30%

**最佳实践**：老库按"老 IE 退役"事件现代化——node 12 / IE 退役 双重时间点；ES5 写法的"老库"逐步升级——与生态对齐；v1.6.1 是 14 年里程碑——可借鉴。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | github.com/jashkenas/backbone |
| 协议 | MIT |
| 总文件 | ~50（极小） |
| 主语言 | JavaScript (ES5) |
| Star | 28k+ |
| 当前版本 | v1.6.1（2024-03） |
| 依赖 | underscore 1.13.x / jQuery（软依赖） |
| 关键依赖 | underscore（utility） / jQuery / Zepto（移动） |
| 关键里程碑 | 0.3.3（首版）→ 0.5.x（View 解耦）→ 1.0（API 稳定）→ 1.6.1（IE 退役 + 现代化） |
| 团队 | Jeremy Ashkenas（核心）+ DocumentCloud + 数百贡献者 |
