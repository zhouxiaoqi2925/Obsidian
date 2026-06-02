# underscore - 17 年仍在维护的 JavaScript 函数式工具带与 mixin 双形态典范

**GitHub**: jashkenas/underscore
**Star**: ~27k
**语言**: JavaScript
**主题**: 函数式编程、集合操作、mixin 模式、链式 API
**适用场景**: 工具库、Node.js 工具链、遗留代码兼容、链式数据处理

## 第一段：基础范式

### 模式 1：1 函数 1 文件的模块化

**问题场景**：工具库函数众多（200+），单个 `index.js` 文件管理混乱；用户希望按需引入减少体积。

**解决方案**：Underscore 早期版本每个函数一个文件（`each.js`/`map.js`/`reduce.js`），主入口 `index.js` 统一 require。`underscore/modules/` 目录提供单函数 ESM 入口（`import each from 'underscore/modules/each.js'`），支持 tree-shaking。

**关键参数**：
- 1 函数 1 文件
- `index.js` 聚合
- `modules/*.js` 子入口
- CJS + ESM 双格式
- npm 包 `main`/`module`/`exports` 字段

**最佳实践**：库设计采用 1 文件 1 函数便于维护；用 `package.json#exports` 暴露子入口；现代库用 ESM 优先；老库用 UMD 兼容。

### 模式 2：mixin 静态/链式双形态

**问题场景**：同一个 `_.map` 函数既要支持函数式（`_.map(arr, fn)`）又要支持链式（`_(arr).map(fn).value()`）——双形态有不同 this 绑定。

**解决方案**：`each`/`map`/`filter`/`reduce` 等集合函数有静态形态（`_.each(arr, fn)`）和链式形态（`_(arr).each(fn)`）。`mixin(obj)` 把对象方法混入 Underscore 实例，链式 API 通过 `_(obj).chain()` 启用。

**关键参数**：
- `_.each(arr, fn)` 静态
- `_(arr).each(fn)` 链式
- `_.chain(obj)` 链式入口
- `_.mixin(obj)` 混入
- `_.prototype` 链式原型

**最佳实践**：链式与静态并存时优先静态（更直观）；自定义函数用 `_.mixin({ myFn: ... })` 注册；用 `tap` 调试链。

### 模式 3：iteratee 4 形态 callback lookup

**问题场景**：传给 `_.filter(arr, ?)` 的回调有 4 种可能：函数、属性名（字符串）、对象（属性值匹配）、null（identity）——实现要分支。

**解决方案**：`cb(value, context, argCount)` 内部把 4 形态归一为函数：
- 函数 → 原样返回
- 字符串 `_.property("name")` → `(obj) => obj.name`
- 对象 `{active: true}` → `(obj) => obj.active === true`
- null/未传 → `_.identity(x) => x`

**关键参数**：
- `cb(value, context)` callback 解析
- `_.property(path)` 属性访问
- `_.matches(attrs)` 对象匹配
- `_.iteratee` 别名
- `context` 绑定 this

**最佳实践**：用 `_.iteratee` 兼容 4 形态；性能敏感循环用 `_.property` 预编译；用 `_.matches` 做对象过滤；用 `context` 参数绑定 this。

### 模式 4：链式 API 与 value() 终结

**问题场景**：链式 API 调用链长（`_(arr).map(...).filter(...).reduce(...)`）需要明确"何时取结果"——链不终结无法拿值。

**解决方案**：`_(arr).chain()` 返回 wrapped 对象支持链式；链上调用普通方法返回 wrapped，继续链；调 `value()` 终结链返回原值。`tap(fn)` 在链中插入副作用（不终结）。

**关键参数**：
- `_(arr).chain()` 启用链
- `.map(fn)` 链中调用
- `.value()` 终结取结果
- `tap(fn)` 副作用
- `_.prototype.valueOf()` 隐式终结

**最佳实践**：链短用静态（更清晰）；链长（>3 步）用链式；用 `tap` 调试；`valueOf` 让模板字符串 `\`${_([1,2,3])}\` 自动取结果。

### 模式 5：trampoline stack 防爆栈

**问题场景**：递归函数（如 `_.flatten` 递归展开嵌套数组）深度大时栈溢出——浏览器栈深度有限（万级）。

**解决方案**：把递归改为 trampoline——返回 thunk（`() => next()`）而非直接递归，外层循环不断调 thunk 直到返回非 thunk 值。`_.flatten` 用 trampoline 处理任意深度嵌套。

**关键参数**：
- thunk：`() => result | thunk`
- 外层 `while (typeof ret === 'function') ret = ret()`
- 防止栈溢出
- 限制每次调用栈深度
- `_.flatten` 实现

**最佳实践**：深递归优先 trampoline；用 `setImmediate`/`process.nextTick` 让出；用 `requestIdleCallback` 分批；这是"无限递归不爆栈"的通用解法。

## 第二段：扩展范式

### 模式 6：集合操作（each/map/filter/reduce/find）

**问题场景**：原生 JS 数组方法有 `forEach`/`map`/`filter`/`find`/`reduce`，但 Underscore 提供跨对象/跨 ES5 兼容的统一 API。

**解决方案**：`_.each(collection, iteratee)` 同时支持数组与对象（`for (key in obj)`）；`_.map` 返回新数组；`_.filter` 谓词过滤；`_.reduce` 累加器；`_.find` 短路查找。

**关键参数**：
- `_.each(coll, fn)` 兼容数组/对象
- `_.map(coll, fn)` 变换
- `_.filter(coll, pred)` 过滤
- `_.find(coll, pred)` 短路
- `_.reduce(coll, fn, init)` 累加

**最佳实践**：现代代码用原生方法（性能更好）；老浏览器/Node 用 Underscore 兼容；用 `_.each` 避免 `for...of` polyfill；用 `_.reduce` 替代 `for` 循环。

### 模式 7：对象操作（extend/clone/keys/values）

**问题场景**：JS 对象操作（合并/克隆/属性遍历）在 ES5 时代不完整，需要库补足。

**解决方案**：`_.extend(dest, src1, src2)` 浅合并；`_.clone(obj)` 浅克隆（`_.cloneDeep` 深克隆）；`_.keys()`/`_.values()` 替代 `Object.keys`；`_.defaults(dest, src)` 不覆盖已有值。

**关键参数**：
- `_.extend(dest, ...srcs)` 浅合并
- `_.defaults(obj, defaults)` 默认值
- `_.clone(obj, deep)` 克隆
- `_.pick(obj, keys)` 挑选属性
- `_.omit(obj, keys)` 排除属性

**最佳实践**：用 `_.defaults` 配默认配置；用 `_.pick`/`_.omit` 做白/黑名单；用 `_.cloneDeep` 谨慎（性能差）；`_.extend` 浅合并多次调用效率低。

### 模式 8：函数式工具（compose/partial/curry/once）

**问题场景**：函数式编程模式（组合/偏应用/柯里化/单次执行）在 ES5 时代缺失。

**解决方案**：`_.compose(f, g, h)` 从右到左组合；`_.partial(fn, ...args)` 偏应用；`_.curry(fn)` 柯里化；`_.once(fn)` 缓存首次结果；`_.memoize(fn, hash)` 记忆化。

**关键参数**：
- `_.compose(...fns)` 组合
- `_.partial(fn, ...presetArgs)` 偏应用
- `_.curry(fn)` 柯里化
- `_.once(fn)` 单次
- `_.memoize(fn)` 记忆化

**最佳实践**：用 `_.compose` 做管道；`_.partial` 替代 `bind`（更灵活）；`_.curry` 让多元函数可分批传参；`_.once` 适合初始化。

### 模式 9：模板与字符串（template/escape）

**问题场景**：JS 字符串模板（插值 + 条件 + 循环）原缺失。

**解决方案**：`_.template(text, settings)` 编译为函数，支持 `<% js %>`、`<%= value %>`、`<%- html %>`（HTML 转义）。编译结果可复用。

**关键参数**：
- `<% js %>` 任意 JS
- `<%= value %>` 插值
- `<%- value %>` HTML 转义
- `_.templateSettings.interpolate` 自定义分隔符
- `compile` 后 `source` 可看

**最佳实践**：用 `<%- %>` 防 XSS；不信任输入走 `<%- %>`；用 `_.templateSettings` 改分隔符（Mustache 风格）；编译一次复用多次。

### 模式 10：debounce / throttle 定时器哲学

**问题场景**：高频事件（scroll/resize/input）触发回调导致性能差——需要节流或防抖。

**解决方案**：`_.debounce(fn, wait)` 延迟 wait 毫秒执行，最后一次调用触发；`_.throttle(fn, wait)` 每 wait 毫秒最多执行一次；`_.debounce(fn, wait, {leading: true, trailing: false})` 配置首尾触发。

**关键参数**：
- `_.debounce(fn, wait, immediate?)` 防抖
- `_.throttle(fn, wait)` 节流
- `leading`/`trailing` 配置
- `maxWait` 最大等待
- 返回新函数（带 cancel）

**最佳实践**：搜索框输入用 `debounce(300ms)`；scroll 用 `throttle(100ms)`；用 `leading: true` 让首次立即触发；用返回函数的 `.cancel()` 取消。

## 第三段：进阶范式

### 模式 11：deepGet / deepSet 嵌套访问

**问题场景**：深嵌套对象（`a.b.c.d`）访问/修改易错——路径字符串化是常见需求。

**解决方案**：`_.get(obj, path, default)` 嵌套取值（点/dot 路径或数组）；`_.set(obj, path, value)` 嵌套赋值；`_.has(obj, path)` 存在性检查。`_.property(path)` 预编译取值函数。

**关键参数**：
- `_.get(obj, "a.b.c", default)` 路径
- `_.set(obj, "a.b", value)` 赋值
- `_.has(obj, "a.b")` 检查
- `_.property(path)` 函数
- `_.propertyOf(obj)` 偏应用

**最佳实践**：用 `_.get` 替代深 `?.`（兼容老 Node）；用 `_.property` 预编译（性能好）；用 `_.set` 不可变更新（实际是变异）；`_.propertyOf` 类似 `get`。

### 模式 12：invoke / pluck 批量方法调用

**问题场景**：批量对集合元素调用方法（`arr.map(x => x.toUpperCase())`）重复样板。

**解决方案**：`_.invoke(list, method, ...args)` 调每个元素的方法；`_.invokeMap` 返回结果数组；`_.pluck(list, prop)` 旧版属性提取（现已被 `map + property` 替代）。

**关键参数**：
- `_.invoke(list, "methodName", arg1, arg2)`
- `_.invoke(list, fn, ...args)`
- `_.pluck(list, "prop")` 已废弃
- 等价 `_.map(list, _.property("prop"))`
- `_.sortBy(list, "name")` 间接用

**最佳实践**：用 `_.invoke` 调集合方法（`[str].map("toUpperCase")` 类似）；`pluck` 已被 `map + property` 取代；用 `_.sortBy(list, "created_at")` 排序。

### 模式 13：times / random / now 工具

**问题场景**：循环 N 次（`for (let i = 0; i < 10; i++)`）+ 随机数 + 时间戳是高频需求。

**解决方案**：`_.times(n, fn)` 调 fn n 次（fn 接收 index）；`_.random(min, max)` 整数随机；`_.now()` Date.now 别名；`_.uniqueId(prefix)` 自增 ID；`_.constant(value)` 始终返回 value 的函数。

**关键参数**：
- `_.times(10, i => ...)` 循环
- `_.random(1, 100)` 整数
- `_.now()` 时间戳
- `_.uniqueId("user_")` ID
- `_.constant(x)` 常量函数

**最佳实践**：用 `_.times` 替代 `for`（更声明式）；`_.constant` 适合 `filter`/`map` 默认值；`_.uniqueId` 用于 React key 之外的 ID 生成；`_.now()` 性能好于 `new Date().getTime()`。

### 模式 14：链式与 mixin 实战组合

**问题场景**：业务代码想用 Underscore 但需要扩展（如加 `_.sumBy`/`_.groupBy`）——不能改库源码。

**解决方案**：`_.mixin({ sumBy: (coll, fn) => _.reduce(coll, (acc, x) => acc + x[fn], 0) })` 注册到 Underscore。链式与静态都自动支持（新方法挂在 `_.prototype`）。

**关键参数**：
- `_.mixin({ method: fn })` 注册
- `_(arr).myMethod()` 链式
- `_.myMethod(arr)` 静态
- 内部 `_.functions(_)` 看所有方法
- `_.chain(obj)` 链入口

**最佳实践**：自定义扩展统一在 `underscore-ext.js`；用 `_.mixin` 而非 `_.prototype.method = ...`；扩展函数支持 `iteratee` 4 形态；扩展返回新值（不破坏链）。

### 模式 15：UMD / ESM / CJS / MJS / AMD 5 套打包

**问题场景**：库要兼容浏览器（UMD/AMD）、Node CJS（`require`）、Node ESM（`import`）、bundler——5 套打包让所有环境可加载。

**解决方案**：Underscore 用 Makefile（不用 webpack）打包 5 个版本：
- `underscore.js` UMD（浏览器 + Node）
- `underscore-esm.js` ES Module
- `underscore-node.cjs` CJS
- `underscore-node.mjs` ESM
- `underscore-amd.js` AMD

**关键参数**：
- UMD：`(function(root, factory) { ... })`
- 头部判断 `typeof exports` / `define` / `root._`
- `package.json#exports` 字段映射
- 5 套输出
- Makefile 编排

**最佳实践**：现代库用 `package.json#exports` 暴露多格式；UMD 头模板固定；用 `tsc` + `tsconfig.cjs.json`/`esm.json` 双输出；用 `npm publish` 前 dry-run。

## 第四段：实战范式

### 模式 16：链式管道处理数组

**问题场景**：数据处理管道（filter → map → sortBy → take）用函数式组合比链式更清晰，但 Underscore 提供链式。

**解决方案**：用链式串接：
```js
_(users)
  .filter(u => u.active)
  .map(u => u.name)
  .sortBy()
  .take(10)
  .value()
```

**关键参数**：
- `_(arr).chain()` 启用链
- 中间方法返回 wrapped
- `.value()` 终结
- 链每步惰性？Underscore 是即时
- lodash/fp 是惰性链

**最佳实践**：链短（<5 步）用链式清晰；长链用函数式（`pipe`/`compose`）；惰性用 lodash；用 `tap` 调试；链式不持久化（不保留 wrapped 引用）。

### 模式 17：模板引擎与 XSS 防护

**问题场景**：服务端/客户端模板需要支持条件/循环 + 防 XSS。

**解决方案**：`_.template(text)` 编译模板为函数。`<%- value %>` 输出 HTML 转义（防 XSS）；`<%= value %>` 原样输出（信任值）；`<% js %>` 任意 JS。

**关键参数**：
- `_.template(text)` 编译
- `<%- %>` 转义
- `<%= %>` 不转义
- `<% %>` 任意 JS
- `interpolate`/`escape`/`evaluate` settings

**最佳实践**：所有用户输入用 `<%- %>`；内部可信值用 `<%= %>`；编译一次复用（性能）；用 `with` 作用域让变量直接可用（默认开启）。

### 模式 18：debounce/throttle 实战组合

**问题场景**：表单提交防双击（用户手抖）、滚动节流、搜索防抖、resize 限流。

**解决方案**：
- 搜索框：`_.debounce(search, 300)`
- 滚动：`_.throttle(handleScroll, 100)`
- 提交按钮：`_.once(submit, 1000)` 限流
- resize：`_.debounce(handleResize, 250)`

**关键参数**：
- `_.debounce(fn, ms)` 防抖
- `_.throttle(fn, ms)` 节流
- `leading: true` 立即首次
- `trailing: false` 忽略末尾
- 返回的 `.cancel()` 取消

**最佳实践**：搜索用 `debounce(300)`；scroll/resize 用 `throttle(100)`；提交按钮用 `_.once`；用 `cancel` 在组件卸载时清；不要在 render 中创建新 debounce（引用变化）。

### 模式 19：underscore-ext 扩展实战

**问题场景**：业务需要 `_.sumBy`/`_.groupBy`/`_.partitionBy` 等 Underscore 没有的方法。

**解决方案**：写 `underscore-ext.js` 扩展：
```js
_.mixin({
  sumBy: (coll, fn) => _.reduce(coll, (acc, x) => acc + fn(x), 0),
  groupBy: (coll, fn) => _.reduce(coll, (acc, x) => { ... }, {}),
});
```

**关键参数**：
- `_.mixin({ method: fn })` 注册
- 函数支持 `iteratee` 4 形态
- 链式自动支持
- 静态/链式双形态
- 命名空间用 `_.` 前缀

**最佳实践**：扩展在入口统一 import；用 `_.iteratee` 兼容 4 形态；避免命名冲突（业务用 `_.myApp.xx`）；扩展单测；用 `_.functions(_)` 看全部方法。

### 模式 20：CVE 修复与 17 年维护哲学

**问题场景**：17 年的库要持续修复 CVE 而不破坏 API 兼容性——这是个工程难题。

**解决方案**：Underscore 模式：
- CVE 修复在源码注释内嵌原因（CVE-2021-23358 等）
- 老分支 1.13.x 仍维护（Node 0.10 兼容）
- 主分支支持现代 Node（`_.template` 升级）
- 测试覆盖 `tests/` 数百用例
- `contrib/` 收集社区扩展

**关键参数**：
- 旧版 1.13.x LTS
- 现代 1.14+
- `_.template` 升级移除 `with`
- CVE 注释
- `_.VERSION` 字段

**最佳实践**：用 `_.VERSION` 检测版本；CVE 修复及时升级；老分支用 `package-lock.json` 锁；扩展用 `mixin` 而非 fork；测试用 mocha + chai。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\underscore\` |
| 主语言 | JavaScript |
| License | MIT |
| 解析时间 | 2026-06-02 |
| 核心模块 | `index.js`、`modules/*.js`、`underscore.js`、`test/` |
| 关键基础设施 | mixin、iteratee、trampoline、UMD/ESM/CJS 双格式 |
