# vuex - Vue 官方集中式状态管理的单一状态树与 _withCommit 事务守卫典范

**GitHub**: vuejs/vuex
**Star**: ~28k
**语言**: TypeScript
**主题**: 状态管理、Flux 模式、单一状态树、模块化
**适用场景**: Vue 2/3 SPA 中大型应用、跨组件状态共享、严格模式

## 第一段：基础范式

### 模式 1：单一状态树（Single Source of Truth）

**问题场景**：组件间状态共享（user/cart/theme）散落在多个组件——传 props 穿透层级深，event bus 不可控。

**解决方案**：Vuex 把所有应用状态存到一个 `state` 对象（单一状态树），所有组件从 `store.state` 读。任何修改必须通过 `mutation`（同步）/`action`（异步）。`store` 是响应式的，状态变化触发视图更新。

**关键参数**：
- `state: { count: 0, user: null }`
- `mutations: { increment(state) {...} }`
- `actions: { asyncIncrement(ctx) {...} }`
- `getters: { doubleCount: state => state.count * 2 }`
- 严格模式 `strict: true`

**最佳实践**：所有跨组件状态走 Vuex；`state` 扁平（不深嵌套）；`mutations` 同步只改 state；`actions` 异步调 mutation；用 `modules` 拆分大型 store。

### 模式 2：Mutation 同步事务

**问题场景**：直接修改 `state.count++` 绕过 mutation 监听——调试工具无法追踪状态变更。

**解决方案**：所有 state 变更必须经 `mutation`（同步函数）。`store.commit('increment', payload)` 触发；`store.replaceState(newState)` 替换（仅用于 SSR/hydration）。`_withCommit(fn)` 是内部守卫，把 `committing` 标志置 true，允许直接改 state（不报警告）。

**关键参数**：
- `store.commit(type, payload)`
- `mutations[type](state, payload)`
- `_withCommit(fn)` 内部
- `committing` 标志
- `strict: true` 检测非 mutation 修改

**最佳实践**：用 mutation 名常量；payload 是对象（多字段）；`strict: true` 开发态；`replaceState` 仅用于 SSR；不要在 mutation 内调异步。

### 模式 3：Action 异步与业务编排

**问题场景**：mutation 同步限制——API 请求/定时器等异步逻辑放哪？

**解决方案**：`actions` 是异步函数，接收 `context`（`{ commit, dispatch, state, getters, rootGetters }`）。`store.dispatch('fetchUser', id)` 触发。action 内 `commit` 多次 mutation 编排业务。

**关键参数**：
- `actions: { async fetchUser({ commit }, id) {...} }`
- `store.dispatch(type, payload)`
- 异步可 `return Promise`
- `root: true` 访问根
- payload 可任意

**最佳实践**：用 ES6 解构 `{ commit, state }`；返回 Promise 让调用方 await；用 async/await 不用回调；action 不直接改 state（走 mutation）；用 `root: true` 跨模块 dispatch。

### 模式 4：Getter 计算派生

**问题场景**：多个组件要同一派生值（`doubleCount`/`activeUsers`）——重复写 computed。

**解决方案**：`getters: { doubleCount: state => state.count * 2 }` 派生属性。`store.getters.doubleCount` 取值。`getters` 第二个参数可访问其他 getter。`rootGetters`/`rootState` 访问根。

**关键参数**：
- `getters` 派生
- `(state, getters) => ...` 双参
- `rootGetters` 根 getter
- 缓存（基于依赖）
- 参数化 `getterXxx: (state) => (id) => state.users[id]`

**最佳实践**：用 getter 复用派生；参数化 getter 返回函数；缓存基于依赖（性能好）；用 `rootGetters` 跨模块；不要在 getter 内改 state。

### 模式 5：模块化（Modules）

**问题场景**：大型应用 store 巨大（数百 state/mutation）——单文件管理痛苦。

**解决方案**：`modules: { cart: { state, mutations, actions, getters, modules } }` 拆分。模块内 state 是局部的（`state.count` 而非 `state.cart.count`）。`namespaced: true` 启用命名空间。

**关键参数**：
- `modules: { a, b, c }`
- 局部 state
- `namespaced: true` 命名空间
- `root: true` 跨模块
- 嵌套模块

**最佳实践**：用 `namespaced: true` 避免冲突；按业务域分模块（user/cart/order）；用 `rootGetters`/`rootState` 跨模块；模块内可再嵌套；用 `mapState`/`mapGetters` 组件映射。

## 第二段：扩展范式

### 模式 6：严格模式（Strict Mode）

**问题场景**：开发者意外直接改 state（`store.state.count = 100`）——绕过 mutation，调试工具追踪不到。

**解决方案**：`strict: true` 时，store 用 `watch` 监听 state 变更。如果变更来自 mutation 之外（非 `_withCommit`），抛错。生产环境关 strict（性能）。

**关键参数**：
- `strict: true` 开发态
- `strict: false` 生产态
- `committing` 标志
- `Vue.config.devtools` 配
- `process.env.NODE_ENV !== 'production'`

**最佳实践**：dev 开 `strict: true`；生产关 strict；不直接改 state；用 mutation 改；strict 抛错时检查是否绕过 mutation；CI 测试用 strict。

### 模式 7：插件系统（Logger / Persist）

**问题场景**：需要日志记录所有 mutation（开发调试）——核心不自带。

**解决方案**：`plugins: [createLogger()]` 是函数数组，每次 mutation 后调用。`myPlugin(store) { store.subscribe((mutation, state) => { console.log(mutation.type) }) }`。`createLogger()` 是内置 logger。

**关键参数**：
- `plugins: [createLogger()]`
- `store.subscribe(mutation => ...)` 订阅
- `store.watch((state) => state.count, (newVal) => ...)` 监听
- 持久化插件 `vuex-persistedstate`
- 自定义插件

**最佳实践**：dev 用 `createLogger`；用 `vuex-persistedstate` 持久化（localStorage）；用 `subscribe` 做埋点；用 `watch` 监听特定 state；插件按域分文件。

### 模式 8：订阅与监听（subscribe / watch）

**问题场景**：组件外需要响应 state 变化（埋点/同步外部状态）——watch 写在组件内不够。

**解决方案**：`store.subscribe(mutation => ...)` 每次 commit 后触发；`store.watch((state) => state.a.b, (newVal, oldVal) => ...)` 监听特定 state 路径。`watch` 返回 `unsubscribe` 函数。

**关键参数**：
- `store.subscribe(handler)`
- `store.watch(getter, callback)`
- 返回 unsubscribe
- 路径式 watch
- `subscribe` 不传 mutation 过滤

**最佳实践**：用 `subscribe` 做全局埋点；用 `watch` 监听关键 state；用 `unsubscribe` 在组件 unmount 清理；`subscribe` 比 `watch` 性能高；用 `subscribeAction`（Vuex 4）订阅 action。

### 模式 9：组件辅助函数（mapState / mapGetters / mapActions / mapMutations）

**问题场景**：组件需要从 store 取多个 state/getter/action ——重复 `this.$store.state.x` 繁琐。

**解决方案**：`mapState(['count', 'name'])` 返回 `{ count() { return this.$store.state.count }, name() { ... } }`，混入 computed。`mapState({ localCount: state => state.count })` 自定义映射。`mapGetters`/`mapActions`/`mapMutations` 同理。

**关键参数**：
- `mapState(array | object)`
- `mapGetters(array | object)`
- `mapActions(array | object)`
- `mapMutations(array | object)`
- `createNamespacedHelpers` 命名空间

**最佳实践**：用 `mapXxx` 简化；数组形式适合简单映射；对象形式自定义；用 `createNamespacedHelpers('cart')` 配命名空间；Vue 3 改用 `useStore`。

### 模式 10：动态模块注册（registerModule）

**问题场景**：模块按需加载（用户登录后才加载 user 模块）——静态 modules 不支持。

**解决方案**：`store.registerModule('user', userModule)` 动态注册；`store.unregisterModule('user')` 卸载；`store.hasModule('user')` 检查。`preserveState: true` 保留已存在 state。

**关键参数**：
- `store.registerModule(path, module)`
- `store.unregisterModule(path)`
- `store.hasModule(path)`
- `preserveState: true`
- 嵌套路径 `['nested', 'user']`

**最佳实践**：路由懒加载对应 store 模块；用 `preserveState` 防止覆盖；用 `hasModule` 检查；HMR 时 `unregisterModule` 再 `registerModule`；用 `registerModule(['cart', 'items'], module)` 嵌套。

## 第三段：进阶范式

### 模式 11：Vuex 4 与 Vue 3 Composition API

**问题场景**：Vue 3 推 Composition API，Vuex 4 需支持 `useStore()`/`useState()`/`useGetters()`。

**解决方案**：`useStore()` 返回 store 实例（替代 `this.$store`）。`useState(map)` 替代 `mapState`，`useGetters(map)` 替代 `mapGetters`。这些是社区补充（如 `vuex-composition-helpers`），不是 Vuex 4 内置。

**关键参数**：
- `useStore()` 取 store
- `useState(['count'])` 映射
- `useGetters(['double'])` 映射
- `useActions`/`useMutations`
- Composition 风格

**最佳实践**：Vue 3 用 Pinia（官方推荐）；Vue 2 + Vuex 4 兼容；用 `useStore()` 替代 `this.$store`；用 `useState`/`useGetters` 替代 `mapXxx`；用 `storeToRefs` 解构。

### 模式 12：SSR 与 Nuxt

**问题场景**：SSR 模式每个请求要新 store——全局 store 状态会污染请求。

**解决方案**：`createStore()` 函数每次请求创建新 store（工厂模式）。`app.$store` 注入。Nuxt 用 `nuxtServerInit` 初始化 store。`store.replaceState` 注入服务端预取数据。

**关键参数**：
- `createStore()` 工厂
- `nuxtServerInit`
- `replaceState` 注入
- 每个请求独立
- `payload` 传客户端

**最佳实践**：SSR 每次请求 `createStore()`；用 `nuxtServerInit` 预加载；用 `payload` 传客户端；用 `replaceState` 注入；用 `v-once` 防止水合错误。

### 模式 13：TypeScript 与类型安全

**问题场景**：JS 写 Vuex，`store.commit('xxx')` 字符串易拼错——没有类型检查。

**解决方案**：`InjectionKey<Store<State>>` 强类型 store。`createStore` 配泛型 `<State>`。`mutations`/`actions` 类型推断靠工厂函数：
```ts
const store = createStore({
  state: { count: 0 },
  mutations: { increment(state) { state.count++ } }
})
type Store = ReturnType<typeof store.setup>
const key: InjectionKey<Store> = Symbol()
```

**关键参数**：
- `InjectionKey`
- `createStore<State>`
- 类型推断
- 工厂返回类型
- `commit`/`dispatch` 类型

**最佳实践**：用 `InjectionKey` 强类型；用 `createStore` 工厂返回类型；用 `useStore` 接受 key；用 `mapState`/`mapGetters` 类型映射；Vue 3 改用 Pinia（更好 TS）。

### 模式 14：热更新（Hot Module Replacement）

**问题场景**：开发时改 store 文件希望保留 state——HMR 默认会重置。

**解决方案**：`module.hot.accept(['./store'], () => { const newStore = createStore(); store.hotUpdate(newStore) })` 接受 HMR。`store.hotUpdate(newModule)` 内部用 `registerModule`/`unregisterModule` 替换。

**关键参数**：
- `module.hot.accept`
- `store.hotUpdate(newModule)`
- 注册/卸载模块
- 保留 state
- Vite HMR 不同

**最佳实践**：用 Vite + Vuex 4 配 HMR API；用 `import.meta.hot.accept`；用 `store.hotUpdate` 替换；保留关键 state（user）；用 `replaceState` 注入；Vite 自动处理 modules。

### 模式 15：单元测试与 Mock

**问题场景**：组件依赖 store，单测要 mock store——`this.$store` 难注入。

**解决方案**：`createStore({ state, mutations, actions })` 工厂创建测试 store。`localVue.use(Vuex)` 创建隔离 Vue。`mocks: { $store: store }` 注入 Vue Test Utils。`jest.fn()` mock action。

**关键参数**：
- `createStore` 工厂
- `localVue` 隔离
- `mocks: { $store }`
- `jest.fn()` mock
- Vue Test Utils 1.x

**最佳实践**：用 `createStore` 工厂配测试数据；用 `localVue` 隔离污染；用 `mocks` 注入 `$store`；用 `jest.fn()` mock action；用 `await wrapper.vm.$nextTick()` 等异步；Vue Test Utils 2.x 不同 API。

## 第四段：实战范式

### 模式 16：购物车业务实战

**问题场景**：电商购物车（add/remove/calc total）涉及多组件（商品列表/购物车/结算）。

**解决方案**：
```js
const cart = {
  namespaced: true,
  state: () => ({ items: [] }),
  getters: {
    total: state => state.items.reduce((sum, i) => sum + i.price * i.qty, 0),
    count: state => state.items.length
  },
  mutations: {
    ADD_ITEM(state, item) { state.items.push(item) },
    REMOVE_ITEM(state, id) { state.items = state.items.filter(i => i.id !== id) }
  },
  actions: {
    async checkout({ commit, state }, order) {
      const res = await api.order.create(state.items)
      commit('CLEAR_CART')
      return res
    }
  }
}
```

**关键参数**：
- `namespaced: true`
- `getters` 派生
- `actions` 业务编排
- 模块嵌套
- `commit('cart/ADD_ITEM')` 命名空间 commit

**最佳实践**：用 `namespaced` 隔离；用 getter 算总价；用 action 编排业务；用 dispatch 跨模块（`cart/checkout` 调 `user/addPoints`）；用 `rootGetters` 算用户折扣；写测试覆盖。

### 模式 17：用户认证 + Token 持久化

**问题场景**：登录后 token 存哪——localStorage 同步简单但不可控；sessionStorage 关闭就丢。

**解决方案**：用 `vuex-persistedstate` 插件自动持久化 `state.user.token` 到 localStorage。`actions.login({ commit }, credentials)` 调 API 存 token。`getters.isLoggedIn` 派生。

**关键参数**：
- `vuex-persistedstate` 插件
- `paths: ['user.token']` 白名单
- `storage: window.localStorage`
- 登录 action
- 路由守卫

**最佳实践**：用 `vuex-persistedstate` 持久化；用 `paths` 白名单（不存临时数据）；token 存 localStorage；用 cookie + `httpOnly` 防 XSS；用 `localStorage.removeItem` 主动登出；用 `actions/logout` 清 store。

### 模式 18：模块按需加载与 Code Splitting

**问题场景**：单 store 包含所有模块（user/cart/admin）——首屏加载全量。

**解决方案**：动态 `registerModule`：
```js
// router.js
router.beforeEach((to, from, next) => {
  if (to.matched.some(m => m.meta.requiresAdmin)) {
    store.registerModule('admin', adminModule)
  }
  next()
})
```

**关键参数**：
- `store.registerModule`
- 路由守卫
- 按需加载
- `unregisterModule`
- 嵌套模块

**最佳实践**：用路由 meta 标 `requiresAdmin`；用 `beforeEach` 动态注册；用 `unregisterModule` 离开时卸载；用 `webpackChunkName` 配魔法注释；首屏不加载 admin 模块。

### 模式 19：跨 Store 通信（Pinia vs Vuex 4）

**问题场景**：Vuex 4 + Pinia 混用？或者 Vuex 4 跨 store 调？

**解决方案**：
- **Vuex 4**：`rootGetters`/`rootState` 跨模块；`dispatch('cart/checkout')` 跨命名空间
- **Pinia**：用 import 直接 `useCartStore` 跨 store（无命名空间）
- **混用**：Vuex 4 仍维护；Pinia 简化；Vue 3 新项目用 Pinia
- **迁移**：`createPinia().use(piniaPluginPersist)` 替代 `vuex-persistedstate`

**关键参数**：
- Pinia 简化
- Composition 风格
- 移除 mutation
- setup store
- TS 友好

**最佳实践**：新项目用 Pinia（Vue 官方推荐）；老项目用 Vuex 4 维护；`useStore` 替代 `this.$store`；用 setup store 写法；用 `storeToRefs` 解构响应。

### 模式 20：生态与替代品对比

**问题场景**：Vue 状态管理方案（Vuex/Pinia/Provide-Inject/Event Bus）怎么选？

**解决方案**：对比矩阵：

| 方案 | 适合 | 优势 | 劣势 |
|------|------|------|------|
| Vuex 4 | 大型 Vue 2/3 | 严格、调试 | 模板代码多 |
| Pinia | Vue 3 中大型 | 简洁、TS | 生态较新 |
| Provide/Inject | 小型/单组件树 | 零依赖 | 不可控 |
| Event Bus | 临时通信 | 简单 | 难维护 |
| Composition API | 中型 | 无库 | 跨组件麻烦 |

**关键参数**：
- Vuex：老牌
- Pinia：新标准
- Composition：轻量
- 性能差异小
- 调试：Vue Devtools

**最佳实践**：新项目用 Pinia（Vue 官方推荐）；大型 Vue 2 项目用 Vuex 4；小型项目用 Provide/Inject；事件总线仅临时用；用 Vue Devtools 调试；TypeScript 选 Pinia。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\vuex\` |
| 主语言 | TypeScript |
| License | MIT |
| 解析时间 | 2026-06-02 |
| 核心模块 | `src/store.ts`、`src/helpers.ts`、`src/plugins/` |
| 关键基础设施 | Vue 3、严格模式、模块化、SSR、TypeScript InjectionKey |
