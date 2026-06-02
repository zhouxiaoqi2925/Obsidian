# vue - 渐进式前端框架的响应式三件套、VDOM 双端 diff 与编译时优化典范

**GitHub**: vuejs/vue
**Star**: ~207k
**语言**: TypeScript
**主题**: 渐进式框架、响应式系统、VDOM diff、Composition API、SFC 编译
**适用场景**: SPA/SSR、UI 组件库、跨端框架（Weex/UniApp）、微前端

## 第一段：基础范式

### 模式 1：响应式三件套（reactive/ref/computed）

**问题场景**：JS 变量改了 DOM 不更新（命令式），需要"数据变了视图自动更新"的声明式绑定。

**解决方案**：Vue 3 用 Proxy 替代 Object.defineProperty 实现 `reactive(obj)`，内部维护 `dep` Set（依赖收集）+ `effect`（订阅者）。`ref(x)` 把基本类型包成 `{value: x}`。`computed(fn)` 是带缓存的 effect。

**关键参数**：
- `reactive(obj)` 深 Proxy
- `ref(value)` 单值响应
- `computed(() => ...)` 缓存
- `effect` 副作用函数
- `track`/`trigger` 依赖收集/触发

**最佳实践**：基本类型用 `ref`；对象用 `reactive`；`computed` 不传 setter 是只读；`effect` 多用于自定义；用 `markRaw` 标记非响应。

### 模式 2：模板编译（template → render）

**问题场景**：手写 VDOM 渲染函数繁琐，HTML-like 模板需要编译成 render 函数。

**解决方案**：Vue 编译器分 3 步：parse（HTML → AST）→ transform（AST 标注优化）→ generate（AST → render 函数代码字符串）。`compile(template)` 返回 `{ code }`，运行时 `new Function(code)` 执行。

**关键参数**：
- `parse` 模板 → AST
- `transform` 静态提升/补丁标志
- `generate` AST → 代码
- `with(ctx)` 作用域
- `baseCompile` 入口

**最佳实践**：用模板（更声明）；SFC 用 `<template>`；动态组件 `<component :is="...">`；用 `v-once` 跳过 diff；用 `v-memo` 缓存子树。

### 模式 3：SFC（Single File Component）单文件组件

**问题场景**：组件三段（template/script/style）拆三个文件太碎——HTML 工程师要看 CSS、JS 工程师要看模板，跨段协作难。

**解决方案**：SFC 是 `.vue` 文件，`<template>` + `<script setup>` + `<style scoped>` 三段。Vite/Vue Loader 用 `@vue/compiler-sfc` 拆成三个模块分别编译。`<style scoped>` 自动加 `data-v-xxx` 属性选择器实现局部作用域。

**关键参数**：
- `<template>` 模板段
- `<script setup>` Composition API
- `<style scoped>` 局部样式
- `<script lang="ts">` TS
- `defineProps`/`defineEmits` 宏

**最佳实践**：组件都用 SFC；`<script setup>` 是现代写法；`scoped` 用属性选择器（性能 OK）；`<style module>` 启用 CSS Modules；用 `<script setup lang="ts">` 强类型。

### 模式 4：VDOM 与 h 函数

**问题场景**：直接操作 DOM 性能差，命令式繁琐——需要虚拟 DOM 描述视图，让框架 diff 后批量更新。

**解决方案**：`h(tag, props, children)` 创建 VNode 树（`{ type, props, children, key, el }`）。`patch(oldVNode, newVNode)` diff 两棵树，挂载时 `patch(null, vnode)`。`createApp` 把 VNode 树挂到 DOM。

**关键参数**：
- `h(type, props, ...children)`
- VNode `{type, props, key, children}`
- `patch` diff 函数
- `mountElement` 真实 DOM
- `Fragment`/`Text`/`Comment` 节点

**最佳实践**：用模板（SFC）自动生成 render；动态节点加 `key`；同 tag 不同 key 是 diff 关键；用 `Fragment` 渲染多根；用 `Teleport` 跨 DOM 树。

### 模式 5：组件实例与生命周期

**问题场景**：组件有状态/方法/生命周期，散落在多文件难统一——需要"组件实例"作为运行时单元。

**解决方案**：`createComponentInstance` 创建实例 `{ props, data, methods, setupState, ctx, ... }`；`setupComponent` 跑 setup/props/data；`setupRenderEffect` 创建 effect。`onMounted`/`onUnmounted` 等钩子由 `injectHook` 注入。

**关键参数**：
- `ComponentInternalInstance`
- `setup()` 入口
- `onBeforeMount`/`onMounted`
- `onBeforeUnmount`/`onUnmounted`
- `currentInstance` 当前实例

**最佳实践**：业务写在 `setup`；钩子必须在 `setup` 内同步调用；用 `getCurrentInstance` 拿当前实例；`onUnmounted` 清理定时器/事件；用 `defineExpose` 暴露给父。

## 第二段：扩展范式

### 模式 6：Composition API 与 setup

**问题场景**：Options API（data/methods/computed）相关逻辑分散，复杂组件复用靠 mixin（命名冲突）。

**解决方案**：Composition API 是函数式——`setup(props, ctx)` 返回渲染数据，按逻辑关注点组织（`useXxx` 组合式函数）。`ref`/`reactive`/`computed`/`watch` 全在 setup 内。`<script setup>` 是语法糖。

**关键参数**：
- `setup(props, ctx)` 入口
- `ref`/`reactive`/`computed`/`watch`
- `useXxx` 组合函数
- `defineProps`/`defineEmits`
- `provide`/`inject` 依赖

**最佳实践**：复杂组件用 Composition API；逻辑复用用 composable；`<script setup>` 简化；用 `toRefs(props)` 解构响应；用 `defineModel` v-model 宏。

### 模式 7：依赖注入（provide/inject）

**问题场景**：祖孙组件传 props 太长（穿透多层），需要类似 React Context 的依赖提供机制。

**解决方案**：`provide(key, value)` 在祖先提供依赖；`inject(key)` 在后代注入。`InjectionKey<T>` 是 TS 类型标识。`app.provide` 全局；`hasInjectionContext` 检查是否在 setup。

**关键参数**：
- `provide(key, value)` 提供
- `inject(key, default)` 注入
- `InjectionKey<T>` 类型
- `app.provide` 全局
- 响应式值可被追踪

**最佳实践**：主题/i18n 等用 provide；`InjectionKey` 强类型；传 ref 保持响应；避免滥用（Prop Drilling 也可）；用 Symbol 作 key 防冲突。

### 模式 8：自定义指令（v-focus/v-lazy）

**问题场景**：复用 DOM 操作逻辑（自动聚焦/懒加载图片）——组件方式太重，需要命令式 DOM 增强。

**解决方案**：自定义指令是带生命周期的钩子对象：`{ mounted(el, binding, vnode) {}, updated() {} }`。`app.directive('focus', { mounted: el => el.focus() })` 注册。模板用 `v-focus`。

**关键参数**：
- `mounted`/`updated`/`unmounted`
- `binding.value`/`arg`/`modifiers`
- `app.directive(name, dir)`
- 局部：`directives: { focus: {...} }`
- 全局/局部两级

**最佳实践**：用 `v-xxx` 复用 DOM 操作；`binding.value` 传参；`modifiers` 表修饰符；不要在指令里改 state；用 `nextTick` 等待更新。

### 模式 9：Teleport 与 Suspense

**问题场景**：Modal/Tooltip 需要挂到 body（脱离父组件 z-index/overflow 上下文）；异步组件需要等待时显示 fallback。

**解决方案**：`Teleport to="body">` 把内容渲染到目标 DOM；`Suspense` 包裹异步组件 + `#default` + `#fallback`。`defineAsyncComponent` 是异步加载。Suspense 触发 `onPending`/`onResolve`/`onFallback`。

**关键参数**：
- `<Teleport to="body">`
- `<Suspense>` 异步
- `defineAsyncComponent(() => import(...))`
- `useSuspense()` 编程式
- `defer`/suspensible

**最佳实践**：Modal 用 Teleport；异步 setup 用 Suspense；不要在 SSR 用 Teleport（限制）；用 `defineAsyncComponent` 配 loader；用 `errorCaptured` 捕获子组件错误。

### 模式 10：模板指令系统（v-if/v-for/v-model）

**问题场景**：模板需要条件渲染、列表渲染、双向绑定——JSX 写三元/map 繁琐。

**解决方案**：内置指令是模板语法糖——`v-if`/`v-show` 条件；`v-for="item in list"` 列表；`v-model` 双向绑定（基于 `value`+`input`/`update:modelValue`）。自定义指令也可注册。

**关键参数**：
- `v-if`/`v-else-if`/`v-else`
- `v-show` display 切换
- `v-for` 列表（必带 `key`）
- `v-model` 双向
- `v-on` 简写 `@`/`v-bind` 简写 `:`

**最佳实践**：`v-if` 真正销毁；`v-show` 仅切换 display（适合频繁切换）；`v-for` 必带 `key`；`v-model` 解构 `defineModel`；避免 `v-if` + `v-for` 同元素。

## 第三段：进阶范式

### 模式 11：VDOM 双端 diff 算法

**问题场景**：VDOM diff 是 O(n³) 复杂度（树编辑距离），实际工程需要 O(n) 的近似算法。

**解决方案**：Vue 3 用双端 diff（`patchKeyedChildren`）：4 指针（oldStart/oldEnd/newStart/newEnd）依次比较头头/尾尾/头尾/尾头，相同则 patch + 移动；都不中则 keyMap 查新节点在旧的位置，移动到头部。极端情况（乱序长列表）退回 mount/unmount。

**关键参数**：
- `oldStartIdx`/`oldEndIdx`
- `newStartIdx`/`newEndIdx`
- 4 种 hit 模式
- `keyToNewIndexMap` 查位置
- `getSequence` LIS 最长递增子序列

**最佳实践**：列表必带 `key`（稳定 ID）；避免 index 作 key（性能问题）；不要在中间穿插 unmount；用 `shallowRef` 减少深响应；用 `v-memo` 缓存子树。

### 模式 12：编译器优化（patch flag / 静态提升）

**问题场景**：VDOM diff 性能仍可优化——静态节点无需 diff，动态节点类型不同 diff 策略不同。

**解决方案**：Vue 3 编译器分析 AST，给动态节点加 patch flag（`TEXT=1`/`CLASS=2`/`STYLE=4`/`PROPS=8`...）。静态节点 `hoist` 到模块顶部（不参与 render）。`v-memo` 让子树缓存。

**关键参数**：
- `PatchFlags` 位掩码
- `hoist` 静态提升
- `cacheHandler` 事件缓存
- `v-memo="[dep]"` 缓存
- `openBlock`/`createBlock` block 树

**最佳实践**：用 `v-memo` 优化长列表；编译器自动 hoist；用 `defineStatic` 定义静态；避免深嵌套动态结构；用 `<KeepAlive>` 缓存组件。

### 模式 13：服务端渲染（SSR）与水合

**问题场景**：SPA 首屏慢/SEO 差——需要服务端直接输出 HTML，客户端"水合"（hydrate）激活。

**解决方案**：`renderToString(app)` Node 端渲染为 HTML 字符串；`createSSRApp` 客户端；`hydrate` 复用 DOM 不重建。`useSSRContext` 区分 SSR/CSR。`<Suspense>` 配 `onServerPrefetch`。

**关键参数**：
- `renderToString` / `renderToStream`
- `createSSRApp`
- `app.mount('#app', true)` hydrate
- `useSSRContext`
- `onServerPrefetch` 异步数据

**最佳实践**：路由懒加载配 `defineAsyncComponent`；用 `@vue/server-renderer`；用流式 SSR（首字节快）；水合失败回退 client-only；用 `useHead` 配 unhead。

### 模式 14：响应式系统进阶（customRef / shallowRef / toRaw）

**问题场景**：基础响应式不满足需求——需要防抖 ref、浅响应、原始对象获取。

**解决方案**：`customRef((track, trigger) => ...)` 自定义依赖收集；`shallowRef(obj)` 仅 `.value` 响应；`shallowReactive` 仅首层响应；`toRaw(reactive)` 取 Proxy 源对象；`markRaw` 永久非响应。

**关键参数**：
- `customRef` 自定义
- `shallowRef` 浅
- `toRaw` 原始
- `markRaw` 标记
- `triggerRef` 强制

**最佳实践**：大对象用 `shallowRef`；外部库实例用 `markRaw`；防抖用 `customRef`；用 `toRaw` 调试响应；用 `triggerRef` 强制更新。

### 模式 15：Pinia 状态管理与跨组件

**问题场景**：Vuex 复杂（mutation/action 分离），Vue 3 需要更轻量的状态管理。

**解决方案**：Pinia 是 Vue 3 官方推荐：`defineStore('id', () => { const count = ref(0); return { count } })` 组合式 store。`storeToRefs(store)` 解构响应。`store.$patch`/`$reset` 内置。

**关键参数**：
- `defineStore(id, setupFn)`
- `storeToRefs(store)` 解构
- `store.$patch` 批量更新
- `store.$subscribe` 监听
- `store.$dispose` 销毁

**最佳实践**：用 setup store（更组合式）；用 `storeToRefs` 解构保留响应；模块按域分 store；用 `$subscribe` 持久化；用 `$onAction` 调试。

## 第四段：实战范式

### 模式 16：Vue Router 4 路由系统

**问题场景**：SPA 需要 URL → 组件映射，支持 history 模式、路由守卫、懒加载。

**解决方案**：`createRouter({ history: createWebHistory(), routes })` 创建路由；`router.beforeEach((to, from) => ...)` 守卫；`router.push` 编程式；`defineAsyncComponent` 懒加载。`useRoute`/`useRouter` 组合式 API。

**关键参数**：
- `createWebHistory` / `createWebHashHistory`
- `routes: [{ path, component, children }]`
- `beforeEach`/`beforeResolve`/`afterEach`
- `useRoute` 当前路由
- `useRouter` 路由实例

**最佳实践**：用 history 模式（SEO 友好）；用懒加载分 chunk；用 `beforeEach` 做权限；用 `meta` 存路由元信息；用 `onBeforeRouteLeave` 组件内守卫。

### 模式 17：组合式函数（Composable）实战

**问题场景**：组件间复用逻辑（鼠标跟踪/分页/表单验证）——mixin 不直观，需要函数式复用。

**解决方案**：组合式函数以 `useXxx` 命名：`function useMouse() { const x = ref(0); onMounted(() => { window.addEventListener('mousemove', e => x.value = e.clientX) }); onUnmounted(() => {...}); return { x } }`。约定：`useXxx` 命名、可返回响应值、可用其他 composable。

**关键参数**：
- `useXxx` 命名约定
- 返回响应式值
- 内部可调 composable
- `onUnmounted` 清理
- VueUse 是 composable 库

**最佳实践**：用 VueUse 库（300+ composable）；自定义 composable 命名 `useXxx`；返回 ref/reactive 不用解构；测试 composable 直接调；用 `tryOnScopeDispose` 跨环境清理。

### 模式 18：动画与过渡（Transition / TransitionGroup）

**问题场景**：DOM 进出/列表变化需要过渡——CSS 动画需要钩子配合。

**解决方案**：`<Transition>` 包裹单个节点；`<TransitionGroup>` 包裹列表（自动 + `key`）。6 个钩子 `v-enter-from`/`v-enter-active`/`v-enter-to`/`v-leave-from`/`v-leave-active`/`v-leave-to`。`appear` 首屏过渡。

**关键参数**：
- `<Transition name="fade">`
- 6 个 CSS class
- `appear` 首次
- `mode="out-in"`/`in-out`
- JS 钩子 `@before-enter` 等

**最佳实践**：用 CSS class 钩子（性能好）；用 `appear` 让首屏也有过渡；用 `TransitionGroup` 列表过渡；用 `mode` 防重叠；用 `@enter` JS 钩子做 GSAP。

### 模式 19：性能优化（v-memo / shallowRef / markRaw）

**问题场景**：Vue 3 默认深响应，大列表/外部库实例可能卡顿——需要细粒度优化。

**解决方案**：
- `v-memo="[dep]"` 缓存子树
- `shallowRef` 大对象不深响应
- `markRaw` 标记非响应
- `defineAsyncComponent` 懒加载
- `<KeepAlive>` 缓存组件
- `app.config.performance` 开启性能追踪

**关键参数**：
- `v-memo` 缓存
- `shallowRef`/`shallowReactive`
- `markRaw`/`toRaw`
- `<KeepAlive include="...">`
- `app.config.performance = true`

**最佳实践**：长列表必 `v-memo` + 稳定 key；外部库实例必 `markRaw`；用 `shallowRef` 配 `triggerRef`；`<KeepAlive>` 路由缓存；用 `app.config.performance` 调试。

### 模式 20：跨端与微前端（Native / Weex / qiankun）

**问题场景**：Vue 写代码需要跑到 iOS/Android/小程序——跨端框架基于 Vue。

**解决方案**：
- **Weex**：阿里跨端（Vue 语法 → Native）
- **UniApp**：多端（Vue → 微信小程序/H5/APP）
- **Taro 3**：京东跨端
- **qiankun**/wujie：微前端（多 Vue 实例）
- **Vant**/NutUI：UI 库
- **Vue 3 + Vite** 是当前模板

**关键参数**：
- Weex `<template>` 语法
- UniApp `pages.json` 路由
- qiankun `registerMicroApps`
- Vant 移动组件
- `@vue/runtime-core` 跨端核心

**最佳实践**：移动端用 UniApp（生态成熟）；微前端用 qiankun/wujie（多技术栈）；用 `@vue/runtime-core` 写跨端；用 Vant 做 UI；性能敏感场景用原生 + WebView 混合。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\vue\` |
| 主语言 | TypeScript |
| License | MIT |
| 解析时间 | 2026-06-02 |
| 核心模块 | `packages/runtime-core/`、`packages/reactivity/`、`packages/compiler-core/`、`packages/runtime-dom/` |
| 关键基础设施 | Proxy 响应式、VDOM diff、patch flag、Suspense、Pinia |
