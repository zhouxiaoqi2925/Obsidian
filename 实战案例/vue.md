# vue - 207k Star 渐进式框架的响应式三件套、VDOM 双端 diff 与组件实例化模型典范

**GitHub**: vuejs/vue
**Star**: ~207k
**语言**: TypeScript（2.7 迁移）
**主题**: 渐进式框架、响应式系统、虚拟 DOM、组件系统、模板编译
**适用场景**: 声明式 UI 框架、响应式状态管理、组件化复用、跨平台渲染

## 第一段：响应式系统

### 模式 1：Object.defineProperty 拦截属性 getter/setter

**问题场景**：JS 对象的属性读写无法被拦截，框架无法知道用户何时改了数据——Vue 想做"改 data 自动更新 UI"必须解决"侦听属性变化"。

**解决方案**：Vue 2 在 `Observer` 初始化时遍历对象的每个属性，用 `Object.defineProperty` 把属性改写为 `getter`/`setter`。`getter` 触发 `dep.depend()` 收集依赖；`setter` 触发 `dep.notify()` 通知所有订阅者。这是 Vue 2 响应式的核心机制。

**关键参数**：
- `Object.defineProperty(obj, key, { get, set })`
- `Observer` 遍历对象属性
- getter 内 `dep.depend()` 收集
- setter 内 `dep.notify()` 派发
- `__ob__` 隐藏属性防重复

**最佳实践**：
- ✅ 不在响应式对象里放非纯数据（函数/Symbol 没必要劫持）
- ✅ 大对象响应式化成本高（每个 key 一次 defineProperty）
- ✅ 用 `Vue.set(obj, key, val)` 给响应式对象加新属性
- ✅ 数组方法被重写（push/pop/shift/unshift/splice/sort/reverse）
- ✅ 2.7 仍用 defineProperty，Vue 3 已换 Proxy

### 模式 2：Dep 单例与依赖收集

**问题场景**：每个响应式属性都要"记住"谁订阅了自己——多对多关系（一个属性被多个 Watcher 订阅，一个 Watcher 订阅多个属性）。

**解决方案**：每个响应式属性有专属 `Dep`（dependency）。`getter` 执行时通过 `Dep.target`（当前求值中的 Watcher）调用 `dep.depend()`，把 Watcher 加到 `dep.subs` 数组。`setter` 触发时 `dep.notify()` 遍历 `subs` 数组，调用每个 Watcher 的 `update()`。

**关键参数**：
- `Dep.subs: Watcher[]` 订阅者
- `Dep.target` 全局静态当前 Watcher
- `dep.depend()` 双向绑定（Dep→Watcher + Watcher→Dep）
- `dep.notify()` 派发更新
- `pendingCleanupDeps` 批量清理

**最佳实践**：
- ✅ `Dep.target` 是全局静态（简化实现但有限制）
- ✅ 用 `Stack` 而非单例（嵌套 Watcher 安全）
- ✅ `subs` 数组不能太大（splice 性能问题）
- ✅ Vue 2.7 优化：`removeSub` 标记 null 而非 splice
- ✅ 用 `pendingCleanupDeps` 批量清理减少内存压力

### 模式 3：Watcher 观察者与 newDeps 重新收集

**问题场景**：用户组件渲染时读 `this.a`、`this.b.c`（订阅属性），但条件渲染可能下次只读 `this.a`（取消 `b.c` 订阅）——如何保证不订阅未使用的属性、避免内存泄漏。

**解决方案**：`Watcher` 用 `newDeps` + `newDepIds` 在每次求值时新建依赖集合，求值结束后与 `deps`（上次依赖）做 diff，diff 出需要 `addSub`（新订阅）和 `removeSub`（取消订阅）的部分。`getter` 内部 `dep.depend()` 同时把 Watcher 加到 Dep.subs，把 Dep 加到 Watcher.newDeps。

**关键参数**：
- `newDeps: Dep[]` 本次求值收集
- `deps: Dep[]` 上次求值
- `newDepIds: Set<number>` 去重
- `cleanupDeps()` diff 订阅
- `dirty: boolean` computed 缓存

**最佳实践**：
- ✅ Watcher 必须在 `getter` 内部订阅（Dep.depend 需在 getter 中）
- ✅ 条件渲染要避免残留订阅（`v-if` 切换会自动清理）
- ✅ `computed` 用 `lazy: true` + `dirty` 做缓存
- ✅ `sync: true` 强制同步触发（默认异步）
- ✅ `deep: true` 深度遍历对象/数组

### 模式 4：nextTick 与 microtask 异步批处理

**问题场景**：用户在同步代码中连续改 100 个 data 属性——如果每次都同步重渲染，会触发 100 次 patch（性能灾难）。

**解决方案**：`scheduler.queueWatcher()` 把要更新的 Watcher 加入队列（用 id 去重），在 `nextTick` 中一次性遍历队列执行。`nextTick` 优先用 `Promise.resolve().then(flushCallbacks)`（microtask）——microtask 在当前同步任务结束后立即执行，setTimeout 需要 ~4ms 等待。

**关键参数**：
- `queue: Watcher[]` 待更新队列
- `queue.sort((a,b) => a.id - b.id)` 按 id 排序
- `nextTick(cb)` microtask 优先
- `flushSchedulerQueue()` 遍历执行
- 同一 Watcher 在同一 tick 内只执行一次

**最佳实践**：
- ✅ 用 microtask 而非 setTimeout（更快）
- ✅ 队列要按 Watcher id 排序（保证父组件先于子组件更新）
- ✅ 多次改同一 data 在同一 tick 内合并为 1 次更新
- ✅ `Vue.nextTick(() => {})` 等 DOM 更新后再操作
- ✅ SSR 用 `setTimeout` 替代 microtask（Node 无 microtask 队列）

### 模式 5：数组响应式与 7 个方法 hack

**问题场景**：数组方法（`push`/`pop`/`shift` 等）不经过 setter，`Object.defineProperty` 拦截不到——改数组不会触发更新。

**解决方案**：Vue 2 在 `Observer` 阶段把 `Array.prototype` 上 7 个会改变数组的方法重写（`push`/`pop`/`shift`/`unshift`/`splice`/`sort`/`reverse`）为可拦截版本：先调原生方法，再 `ob.dep.notify()` 通知更新；`push`/`unshift`/`splice` 还会把新元素转为响应式。

**关键参数**：
- `arrayProto.__proto__ = Array.prototype` 继承
- 7 个方法重写为 `def(arrayProto, method, ...)`
- `ob.dep.notify()` 派发
- 新元素 `observe(item)` 响应式化
- `__ob__` 数组自身的 Observer

**最佳实践**：
- ✅ 不要用 `arr[0] = 1`（不触发更新），用 `Vue.set(arr, 0, 1)`
- ✅ 不要用 `arr.length = 0`（不触发更新），用 `arr.splice(0)`
- ✅ 修改数组项用 `splice` 或 `Vue.set`
- ✅ 数组索引/长度不在响应式范围（性能权衡）
- ✅ 2.7 仍 hack 数组，Vue 3 Proxy 完整支持

## 第二段：虚拟 DOM 与渲染

### 模式 6：VNode 数据结构与 6 种类型

**问题场景**：真实 DOM 节点属性（childNodes/attributes/style/class）数量大、状态多，跨平台（Web/SSR/Weex Native）描述困难——需要轻量"虚拟节点"。

**解决方案**：VNode 是 `{ tag, data, children, text, elm, ns, key, componentOptions, ... }` 纯对象。6 种类型：`element`（元素）/ `text`（文本）/ `comment`（注释）/ `component`（组件）/ `fragment`（片段，多根节点）/ `slot`（插槽）。`createElement(tag, data, children)` 工厂创建。

**关键参数**：
- `VNode` 接口
- `tag: string` 标签
- `data: VNodeData` 属性/事件/指令
- `children: VNode[]` 子节点
- `componentInstance` 组件实例
- `asyncFactory` 异步组件

**最佳实践**：
- ✅ VNode 是不可变快照（patch 完后被替换）
- ✅ 不要修改 VNode 字段（破坏一致性）
- ✅ 用 `createElement('div', { class: 'box' }, [...])` 创建
- ✅ 异步组件用 `() => import('./Foo.vue')`
- ✅ Fragment 让组件多根（Vue 3 内置支持）

### 模式 7：patch 同层比较 + key 优化

**问题场景**：新旧两棵 VNode 树要 diff 出最小 DOM 操作集合——全树 diff 是 O(n^3)，性能不可接受。

**解决方案**：patch 算法做"同层比较"（不跨层移动）——分 3 步：
1. `oldVnode.tagName` 不存在？说明是真实 DOM（首次挂载），`createElm` 创建
2. `sameVnode(oldVnode, vnode)`（同 key + 同 tag + 同 data）？`patchVnode` 深入比较
3. 否则 `createElm(new)` + `removeVnode(old)` 替换

`patchVnode` 内部用"双端 diff"（4 种 key 配对：oldStart/oldEnd/newStart/newEnd）+ `key` 优化复用，复杂度 O(n)。

**关键参数**：
- `sameVnode` 复用判断
- 双端指针 `oldStartIdx/oldEndIdx/newStartIdx/newEndIdx`
- `key` 优化
- `4` 种 key 配对策略
- `createElm` 创建真实 DOM

**最佳实践**：
- ✅ `v-for` 必须用 `key`（无 key 退化为 index，性能差）
- ✅ 不要用 index 作 key（中间插入破坏稳定性）
- ✅ 同层比较假设树结构稳定（不要跨层移动 v-for）
- ✅ 用唯一字段（id）作 key
- ✅ 大量列表用 `object-style v-for` 而非 `in`

### 模式 8：模板编译器 parser + optimizer + codegen

**问题场景**：用户写 HTML 模板（`<div>{{ msg }}</div>`），但运行时要的是 render 函数（`function() { ... }`）——需要把 HTML 编译为 JS。

**解决方案**：模板编译分 3 段：
1. **parser**（`html-parser`）— HTML → AST（`Element`/`Text`/`Attribute` 节点）
2. **optimizer**（`optimizer.ts`）— 静态节点标记 `static: true`，构建 `staticRoot`
3. **codegen**（`codegen.ts`）— AST → render 函数代码（`with(this) { return _c('div', [_v(_s(msg))]) }`）

**关键参数**：
- `parse(template, options)` 解析
- `optimize(ast, options)` 静态标记
- `generate(ast, options)` codegen
- `compileToFunctions(template)` 编译 + 转 Function
- `with(this) { ... }` 作用域

**最佳实践**：
- ✅ 编译时优化（webpack `vue-loader`）比运行时快
- ✅ 静态节点跳过 patch（`isStatic` 优化）
- ✅ `with` 让模板变量直接可用（已被 Vue 3 移除）
- ✅ 大模板要 precompile（运行时编译器 ~12KB）
- ✅ `compilerOptions` 可关闭 whitespace/comments

### 模式 9：render 函数与 createElement

**问题场景**：模板适合静态 UI，但动态生成（递归组件、动态 tag）时模板表达力不足——需要 JS 函数返回 VNode。

**解决方案**：`render: function(h) { return h('div', { class: 'box' }, [h('span', this.msg)]) }`。`createElement`（简写 `h`）创建 VNode，支持 tag、data、children 三参数。`render` 优先级高于 `template`，可以直接用 JS 表达 UI 逻辑。

**关键参数**：
- `h(tag, data, children)` 三参数
- `h('div', { class: 'a' }, [...])` 元素
- `h(Component, { props: {} })` 组件
- `_c(tag, data, children)` 编译产物
- `_v(text)` 文本节点

**最佳实践**：
- ✅ 复杂动态 UI 用 render 而非 template
- ✅ 递归组件必须用 render（template 不支持递归）
- ✅ 用 `h` 别名简化（解构 `const { h } = this.$createElement`）
- ✅ functional 组件无实例用 render
- ✅ 编译产物不可读，但 render 函数等同

### 模式 10：跨平台 platforms/web + platforms/weex

**问题场景**：同一套响应式 + VDOM 逻辑要跑在 Web（DOM）、SSR（字符串）、Weex（Native）——平台差异怎么处理。

**解决方案**：Vue 把"核心"和"平台"分离：
- `src/core/` 跨平台（响应式、VDOM、组件）
- `src/platforms/web/` Web 平台（DOM 操作、属性、事件、指令）
- `src/platforms/weex/` Weex 平台（Native 模块）
- `src/server/` SSR（renderToString）

`platforms` 注入 `nodeOps`（创建/插入/删除节点）、`modules`（属性/事件/指令）、`directives`（v-model/v-on）。

**关键参数**：
- `platforms/web/runtime/index.ts`
- `nodeOps` 节点操作
- `modules` 属性/样式/事件
- `directives` v-model/v-show/v-on
- `patch(prev, next)` 平台无关

**最佳实践**：
- ✅ 自定义渲染目标用 `createRenderer(nodeOps)` 注入
- ✅ Native 端用 Weex 模板 + Vue 组件
- ✅ SSR 用 `server-renderer` 包
- ✅ 自定义平台（Canvas/小游戏）参考 `mpvue`
- ✅ 平台代码 ≤ 5% 体积（核心 ≥ 95%）

## 第三段：组件与生命周期

### 模式 11：组件 = Vue 实例 + 嵌套即组件树

**问题场景**：组件需要"自己的状态、自己的生命周期、父子通信"——如何统一抽象。

**解决方案**：Vue 2 核心抽象：**组件 = new Vue(options)**。每个组件是独立 Vue 实例，有自己的 data/computed/methods/lifecycle；组件嵌套通过 `parent`/`$children` 形成树。父子通信用 `props`（父→子）+ `$emit`（子→父）+ `provide/inject`（祖先→后代）+ `eventBus`（任意）。

**关键参数**：
- `new Vue(options)` 实例化
- `parent/$children` 树
- `propsData` 属性注入
- `$emit(event, ...args)` 派发
- `provide/inject` 注入

**最佳实践**：
- ✅ 组件 data 必须是函数（避免共享状态）
- ✅ 用 `props` + `$emit` 做父子通信（单向数据流）
- ✅ 跨层级通信用 `provide/inject`
- ✅ 大型应用用 Vuex/Pinia（避免 prop drilling）
- ✅ 用 `name` 选项让组件可自递归

### 模式 12：8 个生命周期钩子与时序

**问题场景**：组件从"创建→挂载→更新→销毁"需要给用户钩子做副作用（数据获取、DOM 操作、清理）。

**解决方案**：Vue 2 定义 8 个生命周期：
- `beforeCreate`（init 之前，data 未响应式）
- `created`（init 之后，data 已响应式，$el 未挂载）
- `beforeMount`（render 之前）
- `mounted`（$el 已挂载，可访问 DOM）
- `beforeUpdate`（data 已变，DOM 未更新）
- `updated`（DOM 已更新）
- `beforeDestroy`（销毁前）
- `destroyed`（销毁后，已 cleanup）

**关键参数**：
- `lifecycle.ts` 钩子实现
- `callHook(vm, 'mounted')` 触发
- `vm._isMounted` 标志
- 父子钩子时序（先子后父）
- 错误钩子 `errorCaptured`

**最佳实践**：
- ✅ `created` 做数据初始化（不访问 DOM）
- ✅ `mounted` 做 DOM 操作（`this.$refs`）
- ✅ `beforeDestroy` 做清理（定时器/订阅）
- ✅ 用 `errorCaptured` 做错误边界
- ✅ 父子组件 `mounted` 时序：子先父后

### 模式 13：props / emit / slot 三件套

**问题场景**：组件要复用——怎么传配置、回报状态、定制内容。

**解决方案**：
- **props**：父→子传值（`props: { msg: String }`），单向数据流
- **emit**：子→父通信（`this.$emit('change', val)`），父用 `@change="onChange"`
- **slot**：内容分发（`<slot name="header" />`），父用 `<template #header>` 插入

**关键参数**：
- `props` 属性定义
- `$emit(event, ...args)` 派发
- `<slot />` 默认插槽
- `<slot name="x" />` 具名插槽
- `<slot :data="x" />` 作用域插槽

**最佳实践**：
- ✅ props 验证用 `type/required/default/validator`
- ✅ 复杂数据用 `v-bind="object"` 批量传
- ✅ 自定义事件用 `kebab-case` 命名（HTML 限制）
- ✅ 具名插槽用 `<template #name>` 语法
- ✅ 作用域插槽让父级控制子级渲染

### 模式 14：mixin 与 extends 复用模式

**问题场景**：多个组件共享相同逻辑（生命周期/方法/data）——重复代码不想复制粘贴。

**解决方案**：
- **mixin**：`Vue.mixin({ mounted() {} })` 全局混入；`mixins: [myMixin]` 局部混入
- **extends**：`const CompA = Vue.extend({ ... })` 继承
- 混入的钩子按数组顺序合并，data 冲突时以组件自身为准
- 混入的 `methods/components/directives` 浅合并

**关键参数**：
- `Vue.mixin(globalOptions)`
- `mixins: [mixin1, mixin2]`
- 钩子合并策略
- `Vue.extend(extendOptions)`
- 命名冲突：组件优先

**最佳实践**：
- ✅ 全局 mixin 谨慎（污染所有组件）
- ✅ 优先用 composables（Vue 3）/ 组合式函数
- ✅ 命名空间避免冲突（`mixin.data` 加前缀）
- ✅ `extends` 替代深层 mixin 嵌套
- ✅ 第三方库用 mixin 注入（如 vue-router）

### 模式 15：keep-alive 与组件缓存

**问题场景**：动态组件切换（`v-if`/`v-show`）时组件被销毁重建，状态/滚动位置丢失——如何缓存。

**解决方案**：`<keep-alive>` 包裹动态组件，被切换的组件实例被缓存到 `cache` 对象。`activated` 钩子在组件激活时触发，`deactivated` 钩子停用时触发。`include`/`exclude`（正则/字符串/数组）控制哪些组件被缓存，`max` 限制最大缓存数（LRU 淘汰）。

**关键参数**：
- `<keep-alive include="Comp" exclude="Comp2" :max="10" />`
- 内部 `cache: { key: vnode }`
- `keys: string[]` LRU 顺序
- `activated`/`deactivated` 钩子
- `pruneCacheEntry` 清理

**最佳实践**：
- ✅ 路由用 `<keep-alive>` 缓存页面
- ✅ 用 `include` 精确控制（避免缓存所有）
- ✅ 配合 `activated` 钩子刷新数据
- ✅ `max` 限制防止内存爆炸
- ✅ 缓存组件要 `name` 唯一（cache key）

## 第四段：工程实践

### 模式 16：Vue.config 全局配置

**问题场景**：错误处理、性能调优、开发者提示要全局开启——需要配置中心。

**解决方案**：`Vue.config` 是全局配置对象：
- `productionTip` 生产提示
- `devtools` 启用 vue-devtools
- `errorHandler` 全局错误处理
- `warnHandler` 自定义警告
- `performance` 性能追踪
- `silent` 静默模式
- `optionMergeStrategies` 自定义合并策略

**关键参数**：
- `Vue.config.errorHandler = (err, vm, info) => {}`
- `Vue.config.warnHandler = (msg, vm, trace) => {}`
- `Vue.config.devtools = true`
- `Vue.config.performance = true`
- `optionMergeStrategies` 自定义钩子合并

**最佳实践**：
- ✅ 全局错误处理接 Sentry
- ✅ 生产关 `devtools` 和 `productionTip`
- ✅ 自定义合并策略处理 mixin 冲突
- ✅ `silent` 只在测试时用
- ✅ 不要在 `errorHandler` 抛异常

### 模式 17：vue-router 与路由钩子

**问题场景**：单页应用需要按 URL 切换组件——需要路由匹配、参数解析、守卫。

**解决方案**：`vue-router` 是官方路由库。`<router-link to="/path">` 触发导航；`<router-view />` 渲染匹配组件。`router.beforeEach((to, from, next) => {})` 全局守卫；`beforeRouteEnter`/`beforeRouteUpdate`/`beforeRouteLeave` 组件守卫。`{ path: '/user/:id', component: User }` 动态路由。

**关键参数**：
- `Vue.use(VueRouter)` 安装
- `new VueRouter({ mode: 'history', routes })`
- `<router-link to="/x">` 链接
- `<router-view />` 出口
- `beforeEach` 守卫
- `$route.params`/`$route.query`

**最佳实践**：
- ✅ 用 `history` 模式（URL 无 `#`）
- ✅ 路由懒加载 `() => import('./Foo.vue')`
- ✅ 守卫用 `next(false)` 取消
- ✅ 动态路由用 `:id` 占位
- ✅ 用 `meta` 字段做权限控制

### 模式 18：Vuex 状态管理

**问题场景**：多个组件共享状态（用户信息/购物车/主题）—— props 钻透难维护。

**解决方案**：Vuex 4 件套：
- **state**：单一状态树
- **getters**：计算属性
- **mutations**：同步修改（唯一通道）
- **actions**：异步操作（提交 mutation）
- **modules**：分模块

`store.commit('increment')` 触发 mutation；`store.dispatch('fetch')` 触发 action；组件用 `computed: { count() { return this.$store.state.count } }` 访问。

**关键参数**：
- `new Vuex.Store({ state, getters, mutations, actions })`
- `store.state` 状态
- `store.commit(type, payload)` mutation
- `store.dispatch(type, payload)` action
- `mapState`/`mapGetters`/`mapMutations`/`mapActions` 辅助

**最佳实践**：
- ✅ 大型应用必须用 Vuex
- ✅ mutation 必须同步（devtools 记录）
- ✅ action 异步通过 `commit` 改 state
- ✅ 模块化 `modules: { user, cart }`
- ✅ 用 `mapXxx` 辅助简化代码

### 模式 19：SSR 服务端渲染

**问题场景**：SPA 首屏慢、不利于 SEO——需要服务端直接输出 HTML。

**解决方案**：`vue-server-renderer` 包提供 `renderToString(app)` 把 Vue 实例渲染为 HTML 字符串。SSR 关键约束：
- 组件不能有副作用（`mounted` 不执行）
- 数据预取用 `asyncData` + `store.replaceState`
- 用 `entry-server.js` + `entry-client.js` 双入口
- 客户端用 `app.$mount('#app')` hydrate

**关键参数**：
- `renderer.renderToString(vm)` SSR
- `entry-server.js` 服务入口
- `entry-client.js` 客户端
- `app.$mount('#app', true)` hydrate
- `asyncData` 预取数据

**最佳实践**：
- ✅ SSR 服务端用 Node.js（同一语言栈）
- ✅ 用 `Nuxt.js` 简化 SSR（约定式路由/数据预取）
- ✅ 数据预取要在 `created`（mounted 不执行）
- ✅ 客户端 `hydrate: true` 复用 DOM
- ✅ SSR 后用客户端接管（mount 替代 hydrate）

### 模式 20：Vue 2.7 与 Vue 3 reactivity 兼容

**问题场景**：Vue 2 已 EOL（2023-12-31），但存量项目大——Vue 2.7 引入 Vue 3 `@vue/reactivity` 做兜底，渐进迁移。

**解决方案**：Vue 2.7 把 Vue 3 的 `reactivity` 模块复制到 `src/v3/reactivity/`，可选择性使用。`Vue.observable(obj)` 仍走 defineProperty 路径，但 2.7 新增 `effectScope` API（对齐 Vue 3）。`@vue/composition-api` 兼容包让用户用 `<script setup>` 风格写组件。

**关键参数**：
- `src/v3/reactivity/` Vue 3 reactivity 镜像
- `effectScope` API
- `@vue/composition-api` 兼容包
- `defineComponent` 兼容
- 2.7 EOL 后 vuejs/core 是主线

**最佳实践**：
- ✅ 新项目直接用 Vue 3（Proxy + Composition API）
- ✅ 2.7 存量项目用 `composition-api` 兼容
- ✅ 用 `Vue 3 migration build` 渐进迁移
- ✅ 工具链用 Vite（Vue 3 官方推荐）
- ✅ 不再添加新 Vue 2 特性依赖

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\vue\` |
| 主语言 | TypeScript（2.7 迁移） |
| License | MIT |
| 状态 | EOL（2023-12-31） |
| 解析时间 | 2026-06-02 |
| 核心目录 | `src/core/instance/`、`src/core/observer/`、`src/core/vdom/`、`src/compiler/`、`src/platforms/web/`、`src/v3/reactivity/` |
| 关键基础设施 | defineProperty + Dep + Watcher、nextTick microtask、VDOM 双端 diff、模板编译器、组件实例化、跨平台 platforms |
