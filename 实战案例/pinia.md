# Pinia - Vue 官方推荐状态管理库

**GitHub**: vuejs/pinia
**Star**: 21k+
**语言**: TypeScript
**主题**: 状态管理、Vue生态、Pinia
**适用场景**: Vue 3 / Nuxt 3/4 中大型应用、组件库、需要 SSR 的项目

---

## 一、基础范式

### 模式 1 · Store + state + actions + getters 三件套

**问题场景**：Vuex 4 的 modules / mutations / action types 太啰嗦，TypeScript 体验差。

**解决方案**：Pinia 简化为 `defineStore('id', () => { state, actions, getters })` 三件套，用 Vue 3 Composition API 风格（ref / reactive / computed / watch），无 mutations，TypeScript 自动推导。

**关键参数**：
- `defineStore('todos', () => {...})` 工厂
- `ref()` / `reactive()` state
- `computed()` getters
- `function increment()` actions
- Setup store 风格

**最佳实践**：所有新 Vue 3 项目用 Pinia 替代 Vuex 4，零迁移成本。

### 模式 2 · Setup Store vs Options Store

**问题场景**：传统 Options Store（state/actions/getters）vs Composition API 风格 Setup Store。

**解决方案**：Pinia 支持两种风格：Options Store（`state: () => ({...})` 显式声明）/ Setup Store（`defineStore` 函数体直接用 ref）。Setup Store 复用 Vue 3 习语，是 v2+ 主推。

**关键参数**：
- Options Store
- Setup Store
- `defineStore('id', setup)`
- TS 自动推导
- Composition API

**最佳实践**：新项目用 Setup Store，与 Vue 3 习语一致。

### 模式 3 · 多 Store 互引用

**问题场景**：多个 store 之间相互调用（user store 调用 cart store）。

**解决方案**：在 action 内部 `useCartStore()` 动态获取另一个 store，Pinia 内部用 `inject` 实现跨 store 通信。

**关键参数**：
- `useCartStore()` 内部调用
- `getActivePinia()` 全局
- 跨 store 通信
- inject 机制
- 动态注入

**最佳实践**：所有跨 store 引用都在 action 内 `useXxxStore()`，避免循环依赖。

### 模式 4 · 状态订阅（$subscribe / $onAction）

**问题场景**：需要监听状态变化做日志 / 持久化 / 调试。

**解决方案**：Pinia 提供 `$subscribe((mutation, state) => {})` 监听所有 mutation；`$onAction(({ name, args, after, onError }) => {})` 监听 action 生命周期。

**关键参数**：
- `$subscribe` 状态变化
- `$onAction` action 生命周期
- mutation 类型
- before / after / onError
- 解订阅

**最佳实践**：所有需要「状态变化日志」的场景用 `$subscribe`。

### 模式 5 · 状态补丁（$patch）

**问题场景**：多个状态字段同时更新写很多行。

**解决方案**：`store.$patch({ count: 10, name: 'foo' })` 一次更新多个字段；`$patch((state) => { state.count = 10 })` 函数式 patch。

**关键参数**：
- `$patch(obj)` 对象式
- `$patch(fn)` 函数式
- 批量更新
- 触发一次订阅
- 性能优

**最佳实践**：批量更新用 `$patch`，避免触发多次订阅。

---

## 二、扩展范式

### 模式 6 · Plugins 插件系统

**问题场景**：需要全局功能（持久化 / 同步 / 日志）。

**解决方案**：Pinia 插件是函数 `function piniaPlugin(context) { return { ... } }`，通过 `pinia.use(plugin)` 注册；`context` 暴露 `store` / `options` / `pinia`。

**关键参数**：
- `pinia.use(plugin)` 注册
- `context.store` 当前 store
- `context.options` 选项
- `pinia.state` 全局
- 全局属性

**最佳实践**：所有「跨 store 通用逻辑」用插件实现，官方提供 `pinia-plugin-persistedstate` 持久化。

### 模式 7 · 热更新（HMR + acceptHMRUpdate）

**问题场景**：开发时改 store 代码页面状态丢失。

**解决方案**：`import { acceptHMRUpdate } from 'pinia'` + `import.meta.hot.accept(acceptHMRUpdate(useStore, import.meta.hot))`，Vite / Webpack HMR 自动保留状态。

**关键参数**：
- `acceptHMRUpdate`
- `import.meta.hot`
- Vite / Webpack
- 状态保留
- 自动 reload

**最佳实践**：所有 dev 环境加 HMR，零状态丢失。

### 模式 8 · 状态持久化（pinia-plugin-persistedstate）

**问题场景**：刷新页面状态丢失。

**解决方案**：`pinia-plugin-persistedstate` 插件 `persist: true` 启用 localStorage 持久化，`persist: { storage: sessionStorage, paths: ['user'] }` 细粒度控制。

**关键参数**：
- `persist: true`
- localStorage / sessionStorage
- `paths` 选择字段
- `key` 自定义
- 序列化

**最佳实践**：所有需要刷新保留的场景用持久化插件。

### 模式 9 · SSR 跨请求隔离

**问题场景**：Nuxt SSR 多个请求共享 store 状态导致串扰。

**解决方案**：Pinia 在 SSR 中每个请求独立 pinia 实例，`nuxt` 模块自动 `useState('pinia', () => createPinia())` 创建请求级实例，序列化 `__PINIA__` 状态到 payload。

**关键参数**：
- 请求级 pinia
- payload 序列化
- Nuxt 模块
- `useState`
- 跨请求隔离

**最佳实践**：所有 Nuxt 项目用 `@pinia/nuxt` 模块，自动处理 SSR。

### 模式 10 · DevTools 集成

**问题场景**：调试 store 状态麻烦。

**解决方案**：Pinia 内置 Vue DevTools 集成，时间旅行 / 状态快照 / action 跟踪；`createPinia()` 时自动注册。

**关键参数**：
- Vue DevTools
- 时间旅行
- 状态快照
- action 跟踪
- 自动注册

**最佳实践**：所有 dev 环境开 Vue DevTools，调试效率提升 10x。

---

## 三、进阶范式

### 模式 11 · TypeScript 零成本类型推导

**问题场景**：Vuex 4 需要手写类型。

**解决方案**：Pinia 用 Setup Store 风格 + Vue 3 ref 自动推导，`storeToRefs(store)` 解构不丢失响应性。

**关键参数**：
- `defineStore` 自动推导
- `storeToRefs`
- `ref` / `computed` 类型
- 无需手写接口
- 0 成本类型

**最佳实践**：所有新项目用 TS + Pinia Setup Store，享受零成本类型推导。

### 模式 12 · Getters 缓存机制

**问题场景**：getters 重复计算慢。

**解决方案**：Pinia getters 基于 `computed`，依赖不变不重算，缓存到下次依赖变化。

**关键参数**：
- `computed` 缓存
- 依赖追踪
- 0 重复计算
- 自动失效
- 性能优

**最佳实践**：所有派生状态用 `computed` getter，0 重复计算。

### 模式 13 · Actions 异步支持

**问题场景**：actions 内部异步操作（API）。

**解决方案**：actions 可以是 async 函数，`store.fetchUser()` 返回 Promise，调用方 `await store.fetchUser()`；actions 内部可访问其他 store。

**关键参数**：
- `async function fetchUser() {...}`
- `await store.fetchUser()`
- 内部 `useOtherStore()`
- `$onAction` 监听
- 错误处理

**最佳实践**：所有数据获取 actions 用 async / await。

### 模式 14 · 状态拆分（mapStores / mapState / mapActions）

**问题场景**：Options API 组件需要从 store 取状态。

**解决方案**：`mapStores` / `mapState` / `mapActions` / `mapWritableState` 四个辅助函数，把 store 状态映射到组件计算属性，Options API 也能用。

**关键参数**：
- `mapStores`
- `mapState`
- `mapActions`
- `mapWritableState`
- Options API

**最佳实践**：Composition API 用 `storeToRefs`，Options API 用 `mapState`。

### 模式 15 · Pinia 与 Vue Router 4 集成

**问题场景**：路由变化时清空 store。

**解决方案**：在 `router.beforeEach` 钩子清空 store；或用插件订阅路由变化清空状态。

**关键参数**：
- `router.beforeEach`
- `store.$reset()`
- 全局清空
- 路由订阅
- 状态重置

**最佳实践**：用户登出 / 路由切换时 `$reset()` 清空 store。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Pinia 项目。

**解决方案**：7 件套：① `defineStore` 工厂 ② `state` 状态 ③ `actions` 业务 ④ `getters` 派生 ⑤ `createPinia()` 实例 ⑥ `app.use(pinia)` 注入 ⑦ `useStore()` 组件内使用。

**关键参数**：
- `defineStore` 定义
- `createPinia` 实例
- `app.use(pinia)` 注入
- `useStore()` 组件
- `storeToRefs` 解构
- `$reset` 重置
- `acceptHMRUpdate` HMR

**最佳实践**：所有 Vue 3 项目用 7 件套模板，5 分钟接入 Pinia。

### 模式 17 · Pinia + Nuxt 4 集成

**问题场景**：Nuxt 4 项目用 Pinia。

**解决方案**：`@pinia/nuxt` 模块自动注册 + SSR 跨请求隔离 + 状态序列化 payload；`stores/` 目录自动导入。

**关键参数**：
- `@pinia/nuxt` 模块
- 自动注册
- SSR 隔离
- payload 序列化
- `stores/` 自动导入

**最佳实践**：所有 Nuxt 4 项目用 `@pinia/nuxt` 模块。

### 模式 18 · 性能优化 5 招

**问题场景**：Pinia 性能瓶颈。

**解决方案**：5 招优化：① `storeToRefs` 解构保留响应性 ② `shallowRef` 大列表 ③ `$patch` 批量更新 ④ 派生状态用 `computed` 缓存 ⑤ pinia-plugin-persistedstate 异步。

**关键参数**：
- `storeToRefs`
- `shallowRef`
- `$patch`
- `computed` 缓存
- 异步持久化

**最佳实践**：大列表用 `shallowRef` + `$patch` 组合，性能提升 10x。

### 模式 19 · 与 Vuex 4 / Redux / Zustand 对比

**问题场景**：状态管理选型。

**解决方案**：Pinia 定位「Vue 官方 + Composition API 风格 + TS 零成本」适合 Vue 3；Vuex 4 适合 Vue 2 维护；Redux 适合 React 复杂状态；Zustand 适合 React 轻量。

**关键参数**：
- TS 体验：Pinia > Zustand > Redux > Vuex 4
- 学习曲线：Zustand < Pinia < Vuex 4 < Redux
- 生态：Redux > Vuex 4 > Pinia > Zustand
- DevTools：Redux > Pinia ≈ Vuex 4 > Zustand

**最佳实践**：Vue 3 选 Pinia，React 复杂选 Redux，React 轻量选 Zustand。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Pinia 做状态管理库。

**解决方案**：7 天分 5 步：① `createPinia()` 实例工厂 ② `defineStore` 工厂 ③ ref / reactive 包装 ④ `$subscribe` / `$onAction` 订阅 ⑤ DevTools 集成。

**关键参数**：
- Day 1: createPinia
- Day 2: defineStore
- Day 3: ref 包装
- Day 4: 订阅
- Day 5: DevTools
- Day 6-7: 文档

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 Pinia 复刻需要 2 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\pinia\`
- **大小**: ~5 MB
- **总文件数**: 9 个核心 TS 源文件约 3700 行
- **关键 commit**: v3.0.4
- **作者**: posva + Vue 团队
- **许可**: MIT

## 一句话总结

Pinia 用「Setup Store 风格 + ref/computed 原语 + 零成本 TS 推导 + Vue DevTools 集成」让 Vue 状态管理回到 Composition API 的简洁本质，是 Vue 3 时代官方唯一推荐的状态管理库。
