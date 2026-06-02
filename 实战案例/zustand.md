# zustand - pmndrs 的 1.1KB 极简状态管理 + vanilla 优先 + useSyncExternalStore React 适配器 + 闭包式中间件链典范

**GitHub**: pmndrs/zustand
**Star**: 50k+
**语言**: TypeScript
**主题**: React 状态管理 / Hooks / useSyncExternalStore / 中间件
**适用场景**: React SPA + 跨组件状态共享 + 持久化 + DevTools + 中间件链

> zustand 把"状态共享"压缩到 1.1KB（gzip）——vanilla 100 行实现纯 JS 状态机，react 65 行用 `useSyncExternalStore` 适配 4 个 React 18 陷阱，闭包式中间件链用 `Mutate<StoreApi, [MutatorId, Args][]>` 泛型数组在编译期枚举所有中间件。`combine` / `devtools` / `persist` / `immer` / `subscribeWithSelector` 7 个中间件围绕 `(set, get, api)` 三元组装饰。理解这个文件结构就读懂现代 React 状态管理 70%。

## 第一段：基础范式（模式 1-5）

### 模式 1 · vanilla.ts createStore 状态机 + setState 合并/替换

**问题场景**：React 跨组件状态共享——Context 频繁 re-render、Redux 模板代码、useReducer 跨组件难共享——需要"小、快、零 Provider"的方案。

**解决方案**：`src/vanilla.ts:66-81` 的 `setState` 实现合并 / 替换策略：
```ts
const setState: StoreApi<TState>['setState'] = (partial, replace) => {
  const nextState = typeof partial === 'function'
    ? (partial as (state: TState) => TState)(state)
    : partial
  if (!Object.is(nextState, state)) {
    const previousState = state
    state = (replace ?? (typeof nextState !== 'object' || nextState === null))
      ? (nextState as TState)
      : Object.assign({}, state, nextState)
    listeners.forEach((listener) => listener(state, previousState))
  }
}
```
`Object.is` 同值短路（规避 `NaN === NaN === false` / `+0 === -0 === true`）；`replace` 缺省时 primitive / null 走替换；object 走 `Object.assign` 浅合并。

**关键参数**：
- `createStore` 工厂
- `Object.is` 同值短路
- `Object.assign({}, state, nextState)` 浅合并
- `listeners: Set` 订阅
- `Object.is` 替代 `===`

**最佳实践**：用 `Object.is` 替代 `===`（规避 NaN / ±0 边界）；object partial 走浅合并（immutable 思维）；primitive partial 自动走替换；`setState(0)` 等价于清空 store（含 actions）；不要传 unstable selector 引用（无限重渲染）。

### 模式 2 · useSyncExternalStore React 18 适配器

**问题场景**：React 18 并发模式下，外部 store 订阅要规避 zombie child / tearing / context loss 三个陷阱——自实现订阅易踩坑。

**解决方案**：`src/react.ts:30-34` 的 `useStore` 5 行实现：
```ts
const slice = React.useSyncExternalStore(
  api.subscribe,
  React.useCallback(() => selector(api.getState()), [api, selector]),
  React.useCallback(() => selector(api.getInitialState()), [api, selector])
)
```
三个参数：订阅、客户端 getSnapshot、SSR getServerSnapshot。React 18 用第三个参数解决 hydration mismatch。

**关键参数**：
- `useSyncExternalStore`
- `api.subscribe` 订阅
- `selector(api.getState())` 客户端
- `selector(api.getInitialState())` SSR
- `useCallback` 稳定引用

**最佳实践**：用 `useSyncExternalStore` 替代自实现订阅（React 18 标准答案）；`useCallback` 稳定 selector 引用；SSR 必传第三个参数；selector 返回新对象会触发无限重渲染（用 `useShallow`）；不要在 selector 里用 unstable 引用。

### 模式 3 · subscribe 闭包式 unsubscribe

**问题场景**：组件订阅 store 多次后清理订阅——`unsubscribe` 引用易丢（用 `closure` 捕获 listener）。

**解决方案**：`src/vanilla.ts:88-92`：
```ts
const subscribe: StoreApi<TState>['subscribe'] = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)  // 闭包捕获 listener
}
```
`unsubscribe` 是箭头函数，闭包捕获 `listener` 引用，调用方无需存 handle。`listeners.delete(listener)` 移除订阅。

**关键参数**：
- `listeners: Set<Listener>`
- `listeners.add(listener)` 添加
- `() => listeners.delete(listener)` unsubscribe
- 闭包捕获
- 同步 `forEach` 广播

**最佳实践**：用 `Set` 而非数组（O(1) 删除）；unsubscribe 用闭包（不暴露 listener 引用）；listener 同步 `forEach` 广播；不要在 listener 内调 `setState`（递归死循环）；用 `subscribeWithSelector` 中间件做细粒度订阅。

### 模式 4 · createStore 柯里化（无参 = 等待 initializer）

**问题场景**：中间件需要"先接收 set/get/api，再返回新 set/get/api"——柯里化让中间件透传类型。

**解决方案**：`src/vanilla.ts:99-100`：
```ts
export const createStore = ((createState) =>
  createState ? createStoreImpl(createState) : createStoreImpl) as CreateStore
```
`createStore()` 不传 `initializer` 返回"等待调用"工厂；`createStore(initializer)` 立即创建 store。中间件利用柯里化透传 `Mis/Mos` 泛型链。

**关键参数**：
- 柯里化
- `CreateStore` 双签名类型
- `Mis/Mos` 中间件泛型
- 工厂模式
- 中间件透传

**最佳实践**：用柯里化让中间件透传类型；`createStore()` 不传参返回工厂；`createStore(initializer)` 立即创建；不要破坏柯里化签名（破坏中间件链）；用 `as CreateStore` 类型断言（双签名）。

### 模式 5 · useBoundStore 工厂 = useStore + api

**问题场景**：组件既要 hook 又要 api（调 `setState` / `getState` / `subscribe`）——分别导出易错。

**解决方案**：`src/react.ts:36-45` 的 `createImpl` 把 useStore + api 合二为一：
```ts
const useBoundStore: any = (selector, equalityFn) =>
  useStore(api, selector, equalityFn)
Object.assign(useBoundStore, api)
```
`Object.assign(useBoundStore, api)` 把 `setState` / `getState` / `subscribe` 挂到 hook 上。`useBoundStore(selector)` 是 hook；`useBoundStore.setState(...)` 是 api 调用。

**关键参数**：
- `useBoundStore` 复合对象
- `Object.assign(useBoundStore, api)`
- hook + api 双形态
- `useStore(api, selector, equalityFn)`
- `any` 类型断言

**最佳实践**：用 `Object.assign` 复合 hook + api；调用方拿到的就是 hook；不要拆开 export（破坏 useBoundStore 约定）；`as any` 是类型系统妥协（中间件链推断）；用 `createWithEqualityFn` 加 equality 函数。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · shallow 比较 + prototype 判定

**问题场景**：selector 返回新对象（`useStore(s => ({a: s.a, b: s.b}))`）——每次引用不同触发无限重渲染——需要浅比较。

**解决方案**：`src/vanilla/shallow.ts:60-62` 先比 prototype：
```ts
if (Object.getPrototypeOf(valueA) !== Object.getPrototypeOf(valueB)) {
  return false
}
```
`{a:1}` 和 `class A{a=1}` 的 entries 一样但语义不同；`Map` 和 `Object` 也不能"shallow equal"。先比 prototype 把 90% 误判排除掉。再分 Map（`for of` 顺序无关）和 Set / Array（迭代器逐位 `Object.is`）。

**关键参数**：
- `Object.getPrototypeOf` prototype 比对
- `isIterable` 判定
- `Map` / `Set` / `Array` 分支
- `compareEntries` / `compareIterables`
- `Object.is` 终止

**最佳实践**：先比 prototype（90% 误判排除）；Map / Set / Array 分支（顺序语义不同）；`Object.is` 终止递归；用 `useShallow` hook 包裹 selector（自动 memo）；不要手写 shallow 函数（用库版本）。

### 模式 7 · useShallow hook + useRef 缓存

**问题场景**：`useStore(s => ({a: s.a, b: s.b}))` 每次返回新对象触发无限重渲染——需要 selector 结果稳定。

**解决方案**：`src/react/shallow.ts:5-11`：
```ts
function useShallow(selector) {
  const prev = React.useRef(undefined)
  return (state) => {
    const next = selector(state)
    return shallow(prev.current, next) ? prev.current : (prev.current = next)
  }
}
```
`useRef` 缓存上次结果；`shallow` 函数判定是否变化；相等返回 `prev.current`（稳定引用），不等返回 `next`（更新）。

**关键参数**：
- `useRef` 缓存
- `shallow(prev.current, next)` 判定
- 稳定引用返回
- `useShallow(selector)` 包裹
- 13 行极简

**最佳实践**：用 `useShallow` 包裹多字段 selector（稳定引用）；返回 `prev.current`（相等）保持稳定；返回 `next`（不等）触发更新；不要在 selector 里调 unstable 引用；用 `useShallow` + 稳定 selector 杜绝 99% 不必要 re-render。

### 模式 8 · persist 中间件 + partialize + 异步 hydration

**问题场景**：用户刷新页面 state 丢失——localStorage 同步 / AsyncStorage 异步——需要 persist 中间件。

**解决方案**：`src/middleware/persist.ts` 替换 `api.setState` 让"写"自动持久化：
```ts
const savedSetState = api.setState
api.setState = (state, replace) => {
  savedSetState(state, replace as any)
  return setItem()
}
```
`partialize: (state) => state` 默认透传（用户必须自己写 `(state) => ({ user: state.user })` 来"只持久化部分字段"，否则 action 函数会被 JSON.stringify 失败）。

**关键参数**：
- `partialize` 白名单
- `merge` 合并策略
- `storage` localStorage / AsyncStorage
- `setItem` 自动落盘
- `partialize + merge` 旋钮

**最佳实践**：persist 时**必须**写 `partialize`（actions 不能 JSON.stringify）；`merge` 默认"持久化覆盖当前"（新字段会丢）；用 `version` 字段做 migration；用 `name` 字段命名存储；用 `skipHydration` 配 SSR。

### 模式 9 · hydrationVersion 异步 + 版本号防御 TOCTOU

**问题场景**：异步 storage（IndexedDB / AsyncStorage）下，组件 unmount / remount 或 `rehydrate()` 被快速连续调用时，旧 Promise resolve 回来会"覆盖"新 hydration——TOCTOU 缺陷。

**解决方案**：`src/middleware/persist.ts:253-335`：
```ts
let hydrationVersion = 0
const hydrate = () => {
  const currentVersion = ++hydrationVersion
  hasHydrated = false
  hydrationListeners.forEach((cb) => cb(get() ?? configResult))
  return toThenable(storage.getItem.bind(storage))(options.name)
    .then((deserializedStorageValue) => { ... })
    .then((migrationResult) => {
      if (currentVersion !== hydrationVersion) return  // 旧请求失效
      ...
    })
}
```
`++hydrationVersion` 是无锁的轻量防御——每次新 hydrate 自增版本，旧 promise resolve 时检查版本不一致则丢弃结果。

**关键参数**：
- `hydrationVersion` 自增
- `currentVersion !== hydrationVersion` 检查
- `toThenable` Promise polyfill
- 异步 hydration
- 无锁版本号

**最佳实践**：异步 storage 必须有 hydrationVersion 防御；`++hydrationVersion` 无锁轻量；旧 promise resolve 时检查版本；`toThenable` 兼容同步 / 异步；`hasHydrated` 标志追踪状态。

### 模式 10 · devtools 中间件 + findCallerName V8/Gecko stack 解析

**问题场景**：Redux DevTools 期望 action 名（如 `INCREMENT`）——zustand 用户调 `setState({count: 1})` 没名字——需要自动捕获。

**解决方案**：`src/middleware/devtools.ts:170-186` 的 `findCallerName` 函数专门解析 V8 / Gecko / JSC 三种引擎的 stack trace 格式，提取 caller 函数名作为 devtools action 名字。这是"库作者读懂 React 周边生态"的细致之处。

**关键参数**：
- `findCallerName` 解析
- V8 / Gecko / JSC 三引擎
- stack trace 格式
- action 名字
- 自动捕获

**最佳实践**：devtools 中间件自动捕获 action 名；用 `findCallerName` 解析 stack trace；支持 V8 / Gecko / JSC 三引擎；用户传 `setState(state, false, 'INCREMENT')` 显式更稳；用 Redux DevTools Extension 时间旅行调试。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · Mutate<StoreApi, Ms> 泛型链枚举

**问题场景**：中间件往 StoreApi 上"加东西"（persist 加 `persist.rehydrate`、devtools 加 `setState(action)` 第三参数）——TypeScript 要在编译期枚举整条链。

**解决方案**：`Mutate<S, Ms>` 类型，`Ms` 是 `[MutatorId, Args][]` 元组数组：
```ts
type Mutate<S, Ms> = Ms extends [[infer Id, infer Args], ...infer Rest]
  ? Id extends string
    ? { [K in `setState`]: ... } & { [K in `${Id}Api`]: Args }
    : never
  : S
```
中间件按 `['persist', PersistOptions]` / `['devtools', DevtoolsOptions]` 排列，编译时把整条链解开。运行时零开销，类型完全可推导。

**关键参数**：
- `Mutate<S, Ms>` 类型
- `[MutatorId, Args][]` 元组数组
- 编译期枚举
- 中间件签名透传
- 零运行时开销

**最佳实践**：用 `Mutate` 泛型链编译期枚举中间件；中间件按 `['persist', PersistOptions]` 签名；运行时零开销；不要破坏 Mutate 链（破坏类型推断）；用 `Mis/Mos` 默认 `[]` 让中间件透传。

### 模式 12 · combine 中间件 + 闭包装饰 set/get/api

**问题场景**：state 一部分是 data（`{user: {...}}`），一部分是 actions（`{setUser: () => ...}`）——需要分开类型推断 + 自动 merge。

**解决方案**：`src/middleware/combine.ts:14`：
```ts
return (...args) => Object.assign({}, initialState, (create as any)(...args))
```
闭包装饰 `create` 工厂，把 initialState 浅合并到 initializer 返回的 actions 上。运行时零开销（一次 `Object.assign`）；类型上用 `combine(initialState, create)` 让 data / actions 分别推断。

**关键参数**：
- `Object.assign({}, initialState, create(...))`
- 闭包装饰
- data + actions 分开
- 浅合并
- 16 行极简

**最佳实践**：用 `combine(initialState, create)` 分开 data / actions；运行时一次 `Object.assign`；类型自动推断；不要在 actions 里写 data（破坏 immutable）；用 `as any` 暂时妥协（TypeScript 推到 4.5+ 才稳）。

### 模式 13 · immer 中间件 + mutable draft

**问题场景**：深层 state 嵌套更新写 spread operator 太繁琐——需要 mutable 写法 + immutable 效果。

**解决方案**：`src/middleware/immer.ts` 用 `immer` 库的 `produce` 函数：
```ts
const immer = (config) => (set, get, api) =>
  config((partial, replace) => {
    const nextState = typeof partial === 'function'
      ? produce(partial)
      : partial
    set(nextState as any, replace)
  }, get, api)
```
用户写 `set((state) => { state.user.name = 'new' })` 是 mutable 写法；`produce` 返回 immutable 副本。

**关键参数**：
- `immer.produce` produce
- mutable draft
- `set((state) => { state.x = ... })`
- immutable 副本
- 89 行极简

**最佳实践**：用 immer 中间件写 mutable 风格的 immutable 更新；`produce` 自动冻结；`state.x = ...` 写法简洁；不要在 produce 内异步操作；性能敏感场景禁用（produce 开销）；用 `set(state => { state.x = ... })` 替代 `set({ x: ... })`。

### 模式 14 · subscribeWithSelector 中间件 + 细粒度订阅

**问题场景**：组件外需要订阅"特定 selector 变化"（如 `state.user.name` 变才触发）——全量监听性能差。

**解决方案**：`src/middleware/subscribeWithSelector.ts:74` 让 `subscribe` 接收 selector：
```ts
subscribe(selector, listener, options) {
  return api.subscribe((nextState, previousState) => {
    const nextStateSlice = selector(nextState)
    const previousStateSlice = selector(previousState)
    if (!equalityFn(nextStateSlice, previousStateSlice)) {
      listener(nextStateSlice, previousStateSlice)
    }
  })
}
```
`subscribe(selector, listener, { equalityFn, fireImmediately })` 细粒度监听。

**关键参数**：
- `subscribe(selector, listener)`
- `equalityFn` 比较
- `fireImmediately` 立即触发
- 细粒度订阅
- 74 行极简

**最佳实践**：用 `subscribeWithSelector` 做组件外细粒度订阅；传 `equalityFn`（默认 `Object.is`）；用 `fireImmediately: true` 立即触发一次；不要在 listener 内调 `setState`（递归）；用 `shallow` 作 equalityFn 处理对象。

### 模式 15 · ssrSafe + skipHydration 配 useSyncExternalStore

**问题场景**：SSR 模式下，hydration 时机不对会触发 mismatch 警告——需要 ssrSafe 配 useSyncExternalStore。

**解决方案**：`src/middleware/ssrSafe.ts:26` 用 `useSyncExternalStore` 第三个参数（`getServerSnapshot`）配 `persist` 的 `skipHydration: true` 跳过初始 hydration。`react.ts:33` 第三个参数确保 SSR / CSR 一致。

**关键参数**：
- `skipHydration: true`
- `getServerSnapshot` SSR
- `useSyncExternalStore` 第三参数
- 异步 hydration
- hydration mismatch 避免

**最佳实践**：SSR 模式用 `skipHydration: true` + 手动 `rehydrate()`；`useSyncExternalStore` 传第三个参数（`getServerSnapshot`）；用 `ssrSafe` 中间件隔离；不要在 SSR 同步读 localStorage；用 `onRehydrateStorage` 回调等 hydration 完成。

## 第四段：实战范式（模式 16-20）

### 模式 16 · 按需分包（vanilla / react / traditional / shallow）

**问题场景**：Node / RN / 纯 JS 用户只想拿 vanilla（1KB），React 用户要 hook——单包 7KB 浪费。

**解决方案**：`package.json:27-57` 的 `exports` 字段定义 6 类子路径：
- `zustand/vanilla`（1KB 纯 JS）
- `zustand/react`（1.5KB React hook）
- `zustand/traditional`（带 equalityFn）
- `zustand/shallow`（shallow 工具）
- `zustand/middleware/*`（7 个中间件）
- `zustand`（默认入口 = vanilla + react）

构建产物按入口分裂（rollup.config.mjs 第 93 行 `if (c.startsWith('config-'))`）。

**关键参数**：
- `package.json exports`
- 6 类子路径
- rollup 多入口
- cjs + esm + d.ts
- 14 个独立 entry

**最佳实践**：库用 `package.json exports` 按需分包；rollup 多入口构建；cjs + esm + d.ts 三产物；用户按需 import 节省 bundle；纯 Node 用 `zustand/vanilla`；React 用 `zustand`；中间件按需 import。

### 模式 17 · useShallow + 稳定 selector 杜绝 99% 重复渲染

**问题场景**：组件 `const { a, b } = useStore()` 解构多字段——每次 store 变都重渲染（即使 a / b 没变）——需要 selector 稳定。

**解决方案**：`useShallow` 包裹 selector 让结果稳定：
```ts
const { a, b } = useStore(useShallow((s) => ({ a: s.a, b: s.b })))
```
`useShallow` 内部 `useRef` 缓存 + `shallow` 函数判定——相等返回 `prev.current`（稳定引用），不等返回 `next`（更新）。

**关键参数**：
- `useShallow(selector)`
- 稳定引用返回
- `useRef` 缓存
- shallow 比较
- 13 行极简

**最佳实践**：多字段解构用 `useShallow` 包裹；返回 `prev.current` 保持稳定；shallow 比较 a / b 字段；不要在 selector 里调 unstable 引用；用 `useStore(useShallow(s => ({ a, b })))` 替代手写 memo。

### 模式 18 · persist 时 partialize + merge 旋钮组合

**问题场景**：persist 默认可用但有坑：① actions 被 JSON.stringify 失败；② merge 默认"持久化覆盖当前"，新字段会丢。

**解决方案**：`partialize` 白名单 + `merge` 自定义：
```ts
const useStore = create(
  persist(
    (set) => ({ user: null, setUser: (u) => set({ user: u }) }),
    {
      name: 'app-storage',
      partialize: (state) => ({ user: state.user }),  // 只持久化 user
      merge: (persisted, current) => ({ ...current, ...persisted, setUser: current.setUser }),  // 保留 actions
    }
  )
)
```
`partialize` 白名单只持久化 data；`merge` 自定义保留 actions。

**关键参数**：
- `partialize` 白名单
- `merge` 自定义
- `name` 存储名
- `version` migration
- `skipHydration` SSR

**最佳实践**：persist **必须**写 `partialize`（actions 不能 JSON.stringify）；`merge` 保留 actions；用 `version` 做 migration；用 `onRehydrateStorage` 回调等 hydration；用 `skipHydration: true` 配 SSR。

### 模式 19 · 中间件链顺序（devtools(persist(immer(...)))）

**问题场景**：中间件链顺序不对会导致 DevTools 看不到正确 action / persist 存的不是 immer 处理后的 state——需要顺序约定。

**解决方案**：3 层中间件链 `devtools(persist(immer(...)))` 是最常见组合：
- `immer(...)` 内层处理 mutable draft → immutable
- `persist(...)` 中层 setState 拦截自动落盘
- `devtools(...)` 外层包装 action 名字

顺序从内到外是"数据流向"——内层先处理数据，外层后包装 metadata。

**关键参数**：
- 3 层链
- 内层数据
- 中层持久化
- 外层 devtools
- 顺序约定

**最佳实践**：用 `devtools(persist(immer(...)))` 三层链；内层先处理数据；外层后包装 metadata；不要颠倒顺序（devtools 看不见 immer 内部变化）；用 `name: 'storeName'` 区分多 store；用 `enabled: process.env.NODE_ENV !== 'production'` 关闭 prod devtools。

### 模式 20 · 7 天复刻 zustand 路线图

**问题场景**：复刻 zustand 看似复杂——vanilla 100 行可写，React 适配 65 行，中间件是工作量。

**解决方案**：7 天复刻路线图：① Day 1-2 vanilla store + setState / 订阅；② Day 3 react.ts 适配 + useSyncExternalStore；③ Day 4 shallow + useShallow；④ Day 5 persist 中间件（localStorage）；⑤ Day 6 devtools 中间件（精简）；⑥ Day 7 测试 + rollup 多入口构建。

**关键参数**：
- 7 天路线图
- Day 1-2 vanilla
- Day 3 React
- Day 4 shallow
- Day 5 persist
- Day 6 devtools
- Day 7 构建

**最佳实践**：Day 1-2 写 vanilla store 100 行（核心）；Day 3 写 react.ts 65 行（适配）；Day 4 写 shallow（useShallow hook 13 行）；Day 5 写 persist（partialize + hydration）；Day 6 写 devtools（findCallerName）；Day 7 rollup 多入口构建 + CI。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\zustand\`
- 主语言：TypeScript（100% 源码）
- License：MIT
- 解析时间：2026-06-02
- Commit：`04a8487`（v5.0.14）
- 核心模块：`src/vanilla.ts`（101 行）+ `src/react.ts`（65 行）+ `src/vanilla/shallow.ts`（75 行）+ `src/middleware/persist.ts`（403 行）+ `src/middleware/devtools.ts`（439 行）
- 关键基础设施：useSyncExternalStore + 闭包式中间件 + `Mutate` 泛型链 + `useShallow` + hydrationVersion + `Object.is` 同值短路

**3 核心洞察**：
1. **vanilla + react 双层架构** = 状态机 0 框架依赖，UI 层单独 65 行文件，跨 Node / Solid / Vue 都能用
2. **`useSyncExternalStore` 是 React 18 状态管理的"标准答案"**，zustand 是它最干净的实现（5 行代码适配 4 个陷阱）
3. **中间件是闭包不是继承**，类型链用 `Mutate<S, Ms>` 数组枚举——比 Redux `applyMiddleware` 少 80% 代码

**1 反模式**：`persist` 不写 `partialize`——actions（函数）被 `JSON.stringify` 会失败，hydration 回来后 actions 丢失，store 不可用。

**3 立刻能用**：
1. `useStore(useShallow(s => ({ a, b })))` 多字段解构保持稳定引用
2. `persist(...)` 时**必须**写 `partialize` 过滤 actions
3. `devtools(persist(immer(...)))` 三层链是常见顺序
