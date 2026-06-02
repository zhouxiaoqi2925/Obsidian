# zustand - 50k+ Star React 状态管理的 vanilla+react 双层架构 + useSyncExternalStore 适配 + 闭包式中间件 + Mutate 泛型链典范

**GitHub**: pmndrs/zustand
**Star**: ~50k+
**语言**: TypeScript
**主题**: React 状态管理、Hooks、useSyncExternalStore、中间件、泛型链
**适用场景**: React 中型应用状态管理、bundle 优化、Hooks-first 架构

## 第一段：核心架构

### 模式 1：vanilla + react 双层拆分

**问题场景**：状态管理库被 React 绑定——但 Solid/Vue/Svelte/Node 都需要状态机——把状态机和 UI 适配绑在一起限制了复用。

**解决方案**：zustand 把"状态容器"和"React 适配器"切成两半：
- `src/vanilla.ts`（101 行）——纯 JS、零依赖的状态机，可被任何框架复用
- `src/react.ts`（65 行）——React 适配层，全部 React 特性收敛在这里

第三方 `zundo`（temporal）、`zustand/middleware/immer` 等都基于 vanilla 衍生。bundle gzip 仅 1.1KB。

**关键参数**：
- `vanilla.ts` 101 行
- `react.ts` 65 行
- 0 框架依赖
- 第三方基于 vanilla
- 1.1KB gzip

**最佳实践**：
- ✅ 状态机与 UI 适配分离
- ✅ vanilla 可被 Node/Solid/Vue 复用
- ✅ react.ts 仅 65 行做适配
- ✅ `package.json#exports` 按入口分包
- ✅ rollup 多入口构建

### 模式 2：createStore + setState 合并/替换策略

**问题场景**：`set({a:1})` 是合并还是替换？primitive（`set(0)`）怎么处理？同值怎么避免无意义渲染。

**解决方案**：`vanilla.ts:66-81` 的 `setState`：
```ts
const setState = (partial, replace) => {
  const nextState = typeof partial === 'function' ? partial(state) : partial
  if (!Object.is(nextState, state)) {                    // ① 同值短路
    const previousState = state
    state = (replace ?? (typeof nextState !== 'object' || nextState === null))
      ? (nextState as TState)                            // ② 替换模式
      : Object.assign({}, state, nextState)              // ③ 浅合并
    listeners.forEach((listener) => listener(state, previousState))
  }
}
```
① `Object.is` 而非 `===`：规避 `NaN===NaN===false`、`+0===-0===true`。② `replace` 回退：primitive/`null` 自动替换。③ `Object.assign` 浅合并强迫 immutable 思维。

**关键参数**：
- `Object.is` 同值比较
- `replace` 默认回退
- 浅合并 vs 替换
- `listeners.forEach` 同步广播
- `previousState` 通知

**最佳实践**：
- ✅ 用 `Object.is` 而非 `===`（边界）
- ✅ primitive 自动替换（语法糖）
- ✅ 浅合并强迫 immutable
- ✅ 同步广播 listeners
- ✅ 同值短路避免无意义渲染

### 模式 3：柯里化 createStore + 中间件泛型推导

**问题场景**：中间件链 `devtools(persist(immer(initializer)))` 需要类型透传——`createStore()` 不传 initializer 时返回"等待调用"的工厂。

**解决方案**：`vanilla.ts:99-100` 柯里化：
```ts
export const createStore = ((createState) =>
  createState ? createStoreImpl(createState) : createStoreImpl) as CreateStore
```
当 `Mis/Mos`（中间件泛型链）为空时 `createStore()` 返回"等待 initializer"的工厂。中间件能透传类型——`persist` 内部就利用了这一点。

**关键参数**：
- 柯里化签名
- `CreateStore` 类型断言
- 中间件泛型链
- 等待 initializer 工厂
- 类型透传

**最佳实践**：
- ✅ 柯里化支持中间件类型推导
- ✅ 工厂模式解耦创建
- ✅ `as CreateStore` 类型断言
- ✅ 中间件链可枚举
- ✅ 编译期推导

### 模式 4：subscribe 闭包 + Set 监听器

**问题场景**：发布订阅如何支持"订阅者内部 unsubscribe"而不破坏迭代器？

**解决方案**：`vanilla.ts:88-92` 用 `Set` 而非数组：
```ts
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)   // 闭包捕获 listener
}
```
闭包直接捕获 `listener` 引用，外部不用存 handle。`Set.add/delete` 自身 O(1)，迭代期间 `delete` 安全（ES2015+ 规范）。

**关键参数**：
- `Set<Listener>` 监听器
- 闭包返回 unsubscribe
- 同步广播
- O(1) add/delete
- 迭代安全

**最佳实践**：
- ✅ 用 `Set` 而非数组
- ✅ 闭包返回 unsubscribe
- ✅ 同步 forEach 广播
- ✅ 迭代期间 delete 安全
- ✅ 外部不存 handle

### 模式 5：useSyncExternalStore 5 行适配 React 18

**问题场景**：React 18 引入并发模式——Context 频繁 re-render、tearing、zombie child 等问题——自实现订阅容易踩坑。

**解决方案**：`react.ts:30-34` 整个 useStore 就 5 行：
```ts
const slice = React.useSyncExternalStore(
  api.subscribe,                                              // 订阅
  React.useCallback(() => selector(api.getState()), [api, selector]),    // 客户端 getSnapshot
  React.useCallback(() => selector(api.getInitialState()), [api, selector]) // SSR getServerSnapshot
)
```
3 个参数：订阅、客户端 getSnapshot、SSR getServerSnapshot。React 18 用第三个参数解决 hydration mismatch。

**关键参数**：
- `useSyncExternalStore` React 18 hook
- 3 个参数 subscribe/getSnapshot/getServerSnapshot
- `useCallback` 稳定引用
- SSR 初始值
- `api, selector` 依赖

**最佳实践**：
- ✅ 用 React 18 官方 hook
- ✅ selector 必须稳定引用（useCallback）
- ✅ SSR 用 getServerSnapshot
- ✅ 零 useEffect/useState/Provider
- ✅ 规避 zombie child / tearing

## 第二段：中间件体系

### 模式 6：中间件装饰器 + (set, get, api) 闭包

**问题场景**：状态管理需要扩展（持久化/devtools/immer/redux）——class 继承复杂，Redux applyMiddleware 80+ 行。

**解决方案**：zustand 中间件是函数式装饰器：
```ts
// persist.ts:229-234: 替换 setState
const savedSetState = api.setState
api.setState = (state, replace) => {
  savedSetState(state, replace as any)
  return setItem()
}
```
每个中间件接收 `(set, get, api)`，返回新的 StateCreator。`combine.ts` 14 行就完成组合：`return (...args) => Object.assign({}, initialState, (create as any)(...args))`。

**关键参数**：
- `(set, get, api)` 三元组
- 闭包装饰
- 链式组合
- `savedSetState` 保存原引用
- 拦截 + 透传

**最佳实践**：
- ✅ 函数式装饰器（不 class 继承）
- ✅ `(set, get, api)` 三元组
- ✅ 链式组合
- ✅ 闭包替换 `api.setState`
- ✅ 80% 代码量节省 vs Redux

### 模式 7：Mutate<S, Ms> 泛型链 + 中间件类型透传

**问题场景**：中间件会往 StoreApi 上"加东西"（persist 加 `persist.rehydrate`、devtools 加 `setState(action)` 第三参数）——类型如何在编译期透传。

**解决方案**：`vanilla.ts:53-58` 的 `CreateStore` 类型用 `Mos extends [...] = []` 让中间件链编译期可枚举：
```ts
export type Mutate<S, Ms> = Ms extends [infer Head, ...infer Tail]
  ? Head extends [infer Key, infer Value]
    ? Mutate<...> : ...
  : S
```
中间件链是 `[StoreMutatorIdentifier, unknown][]` 数组，类型递归展开——React 生态里的"TS 元编程做 DI"。

**关键参数**：
- `Mutate<S, Ms>` 泛型
- `Mos extends [...] = []` 链
- `StoreMutatorIdentifier` 标识
- 编译期递归
- 零运行时开销

**最佳实践**：
- ✅ 泛型链编译期枚举
- ✅ `[Id, Args][]` 元组数组
- ✅ 递归展开
- ✅ 零运行时开销
- ✅ 完整类型推导

### 模式 8：shallow 比较 + prototype 一致性

**问题场景**：`{a:1}` 和 `class A{a=1}` 浅比较一样但语义不同；`Map` 和 `Object` 不能直接 shallow equal。

**解决方案**：`vanilla/shallow.ts:60-62` 先比 prototype：
```ts
if (Object.getPrototypeOf(valueA) !== Object.getPrototypeOf(valueB)) {
  return false
}
```
排除 90% 误判。`isIterable` 识别 Map/Set/Array：
- `Map` 无序键值对，用 `compareEntries`（保序）
- `Set`/`Array` 有序，用迭代器逐位 `Object.is`

**关键参数**：
- prototype 一致性
- `isIterable` 识别
- `compareEntries` Map
- `compareIterables` Set/Array
- `Object.is` 逐位

**最佳实践**：
- ✅ 先比 prototype（90% 误判排除）
- ✅ Map/Set/Array 分类
- ✅ 保序比较 Map
- ✅ 逐位 `Object.is`
- ✅ 性能 vs 准确平衡

### 模式 9：useShallow + useRef 稳定引用

**问题场景**：`useStore(state => ({a: state.a, b: state.b}))` 每次返回新对象——shallow 失败导致无限重渲染。

**解决方案**：`react/shallow.ts:5-11` 的 `useShallow` 用 `useRef` 缓存 selector 返回值：
```ts
function useShallow(selector) {
  const prev = React.useRef()
  return state => {
    const next = selector(state)
    return shallow(prev.current, next) ? prev.current : (prev.current = next)
  }
}
```
13 行把"稳定引用 + 等价比较"两个 React 难点都解决。

**关键参数**：
- `useRef` 缓存
- shallow 比较
- 引用稳定
- 13 行实现
- selector 包装

**最佳实践**：
- ✅ `useShallow` 包裹多字段 selector
- ✅ `useRef` 缓存返回值
- ✅ shallow 比较决定是否更新
- ✅ 杜绝 99% 不必要 re-render
- ✅ 13 行解决稳定引用

### 模式 10：persist 中间件 + hydrationVersion TOCTOU 防御

**问题场景**：异步 storage（IndexedDB/AsyncStorage）下，组件 unmount/remount 或 `rehydrate()` 连续调用——旧 Promise resolve 覆盖新 hydration——TOCTOU 缺陷。

**解决方案**：`persist.ts:253-335` 的 `hydrate` 用自增版本号防御：
```ts
let hydrationVersion = 0
const hydrate = () => {
  const currentVersion = ++hydrationVersion    // ① 自增
  ...
  return storage.getItem.bind(storage)(name)
    .then((deserialized) => {
      if (currentVersion !== hydrationVersion) return  // ② 旧请求失效
      ...
    })
}
```
无锁轻量防御。

**关键参数**：
- `++hydrationVersion` 自增
- 版本号比较
- 旧请求失效
- 无锁轻量
- TOCTOU 防御

**最佳实践**：
- ✅ 异步 storage 用版本号
- ✅ `++hydrationVersion` 自增
- ✅ 比对 `currentVersion !== hydrationVersion`
- ✅ 旧 Promise resolve 时失效
- ✅ 替代锁

## 第三段：扩展范式

### 模式 11：devtools 中间件 + findCallerName 解析 stack trace

**问题场景**：devtools 时间旅行需要 action 名——但用户写 `set({a:1})` 没传 action 名——怎么自动捕获。

**解决方案**：`devtools.ts:170-186` 的 `findCallerName` 函数专门解析 V8/Gecko/JSC 三种引擎 stack trace 格式，提取 caller 函数名作为 devtools action 名字：
```ts
const findCallerName = () => {
  const stack = new Error().stack
  // V8: '    at fn (file:line:col)'
  // Gecko: 'fn@file:line:col'
  // JSC: 'fn@file:line:col'
  return parseStack(stack)
}
```
"库作者读懂 React 周边生态"的细致之处。

**关键参数**：
- V8/Gecko/JSC 格式
- `new Error().stack`
- caller 函数名
- action 名字
- 3 引擎适配

**最佳实践**：
- ✅ 解析 stack trace 自动捕获
- ✅ 适配 V8/Gecko/JSC
- ✅ 用作 devtools action 名
- ✅ 库作者读懂周边生态
- ✅ 细致之处体现功力

### 模式 12：subscribeWithSelector 中间件

**问题场景**：默认 `subscribe(listener)` 监听整个 state 变化——但只关心某个字段变化。

**解决方案**：`subscribeWithSelector.ts`（74 行）中间件扩展 `subscribe` 支持 selector + equalityFn：
```ts
const subscribe = (selector, equalityFn = Object.is) => (listener) => {
  return originalSubscribe(state => {
    const next = selector(state)
    if (!equalityFn(prev, next)) {
      prev = next
      listener(next, prev)
    }
  })
}
```
配合 useShallow 在 React 侧用。

**关键参数**：
- selector 订阅
- equalityFn 比较
- prev state 缓存
- 中间件扩展
- 74 行实现

**最佳实践**：
- ✅ 中间件扩展 `subscribe` API
- ✅ selector + equalityFn 参数
- ✅ 用 useShallow 配合
- ✅ 替代 EventEmitter
- ✅ 精细订阅

### 模式 13：immer 中间件 + mutable 语法

**问题场景**：`set(state => ({ ...state, count: state.count + 1 }))` 样板繁琐——需要 mutable 写法。

**解决方案**：`immer.ts`（89 行）中间件用 immer 库，让 `set` 支持 mutable 写法：
```ts
set(state => {
  state.count += 1        // mutable 写法
  state.user.name = 'x'   // 内部转 immutable
})
```
底层 immer 用 Proxy 拦截 + 拷贝写时。

**关键参数**：
- immer 库 Proxy
- mutable 写法
- 拷贝写时
- 中间件包装
- 89 行实现

**最佳实践**：
- ✅ mutable 写法降样板
- ✅ immer Proxy 拦截
- ✅ 配合其他中间件
- ✅ `devtools(persist(immer(...)))` 链
- ✅ 状态变更更直观

### 模式 14：redux 中间件 + reducer/action 兼容

**问题场景**：迁移 Redux 项目到 zustand——不想重写 reducer/action。

**解决方案**：`redux.ts`（51 行）中间件让 zustand 用 reducer 风格：
```ts
const useStore = create(redux(reducer, initialState))
// 用 dispatch({type: 'INC', payload: 1})
```
51 行实现完整 Redux 兼容。

**关键参数**：
- reducer 风格
- action type
- dispatch
- 51 行
- 兼容迁移

**最佳实践**：
- ✅ 中间件兼容 Redux 模式
- ✅ 迁移成本低
- ✅ 51 行实现
- ✅ action/payload 兼容
- ✅ 渐进式迁移

### 模式 15：ssrSafe 中间件 + 服务端渲染

**问题场景**：Next.js SSR 下 `window`/`localStorage` 不可用——直接用 persist 中间件会报错。

**解决方案**：`ssrSafe.ts`（26 行）中间件检测 `typeof window === 'undefined'`，自动跳过 storage 读写：
```ts
if (typeof window === 'undefined') return  // SSR 跳过
```
26 行解决 SSR 安全。

**关键参数**：
- `typeof window` 检测
- SSR 跳过
- 26 行
- Next.js 兼容
- 持久化可选

**最佳实践**：
- ✅ SSR 检测 `typeof window`
- ✅ 自动跳过 storage
- ✅ Next.js/Gatsby 兼容
- ✅ 26 行轻量
- ✅ 配合 persist 用

## 第四段：工程实践

### 模式 16：package.json#exports 按入口分包

**问题场景**：Node 用户不需要 React——单 bundle 把所有代码发出去会浪费。

**解决方案**：`package.json#exports` 字段定义 6 类子路径：`./vanilla`、`./react`、`./traditional`、`./shallow` 全部独立发包。Node/RN/纯 JS 用户各自只拿自己要的部分。rollup.config.mjs 多入口构建。

**关键参数**：
- `exports` 字段
- 6 类子路径
- 多入口构建
- rollup 配置
- tree-shaking 友好

**最佳实践**：
- ✅ `exports` 按入口分包
- ✅ Node 用户只拿 vanilla
- ✅ React 用户拿 react
- ✅ rollup 多入口构建
- ✅ `sideEffects: false` 配合

### 模式 17：柯里化 + 工厂模式 + 中间件链顺序

**问题场景**：中间件组合顺序很关键（`devtools(persist(immer(...)))`）——文档没说清，bug 难定位。

**解决方案**：明确中间件顺序约定——洋葱模型，外层捕获，里层先执行：
```ts
const useStore = create(
  devtools(
    persist(
      immer((set) => ({...})),
      { name: 'my-store' }
    ),
    { name: 'myStore' }
  )
)
```
`devtools` 是最外层（捕获所有 action）；`persist` 在中间（写时落盘）；`immer` 是最里层（状态变更）。

**关键参数**：
- 洋葱模型顺序
- devtools 最外
- persist 中间
- immer 最里
- 顺序关键

**最佳实践**：
- ✅ devtools(persist(immer(...))) 三层链
- ✅ 外层捕获 action
- ✅ 里层先执行
- ✅ persist 必须在 immer 外
- ✅ 文档明确顺序

### 模式 18：8 个 GitHub Actions workflow 矩阵

**问题场景**：zustand 要支持 React 18/19、TS 4.5+、6 种产物（cjs/esm/各入口）——单 CI 不够。

**解决方案**：8 个 GitHub Actions workflow：
- `test.yml` 主测试
- `test-multiple-builds.yml` 跨 6 产物
- `test-multiple-versions.yml` 跨 React 18/19
- `test-old-typescript.yml` 旧 TS 兼容
- `docs.yml` 文档站
- `compressed-size.yml` bundle 大小
- `preview-release.yml` 预览发布
- `publish.yml` 发布

`compressed-size.yml` 失败会卡 PR（强制 1KB 目标）。

**关键参数**：
- 8 workflow
- 6 产物矩阵
- React 18/19 矩阵
- TS 4.5+ 兼容
- bundle 1KB 卡口

**最佳实践**：
- ✅ 8 workflow 矩阵
- ✅ 跨构建产物
- ✅ 跨 React 版本
- ✅ bundle size 卡口
- ✅ 旧 TS 兼容

### 模式 19：Object.assign 浅合并隐式回退（坑）

**问题场景**：用户写 `set(0)` 传 primitive——自动走 replace 模式清空整个 store（含 actions）——文档没强调。

**解决方案**：在文档明确说明：
- 默认浅合并（`Object.assign({}, state, nextState)`）
- primitive/null 自动 replace
- 传 `set(0)` 会清空 actions
- 迁移到 v5 是 breaking change

**关键参数**：
- `Object.assign` 浅合并
- primitive 自动 replace
- actions 被清空风险
- breaking change
- 文档明确

**最佳实践**：
- ✅ 文档明确浅合并行为
- ✅ primitive 自动 replace
- ✅ 传 set(0) 清空 actions
- ✅ 用 immer 避免
- ✅ 自己写时保留精确签名

### 模式 20：vanilla store + react adapter 最小模板

**问题场景**：5 分钟上手——需要最小可运行模板（vanilla store + react adapter）。

**解决方案**：
```ts
// 最小 vanilla store
export const createStore = (init) => {
  let s = init(set, get, api)
  const listeners = new Set()
  const api = { set, get, subscribe: l => { listeners.add(l); return () => listeners.delete(l) } }
  function set(p, r) {
    const n = typeof p === 'function' ? p(s) : p
    if (!Object.is(n, s)) { const o = s; s = r ? n : {...s, ...n}; listeners.forEach(l => l(s, o)) }
  }
  function get() { return s }
  return api
}
```
+ `react.ts` 5 行 `useSyncExternalStore` 适配。

**关键参数**：
- 最小 vanilla store
- 5 行 react 适配
- `useSyncExternalStore` 标准答案
- 闭包式中间件
- 100 行覆盖 90% 用法

**最佳实践**：
- ✅ 抄 vanilla store 模板
- ✅ 抄 useSyncExternalStore 适配
- ✅ 中间件用闭包装饰
- ✅ Mutate 泛型链
- ✅ bundle < 1KB gzip

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\zustand\` |
| 主语言 | TypeScript（100% 源码） |
| License | MIT |
| 状态 | v5.0.14 活跃维护 |
| 解析时间 | 2026-06-02 |
| 核心目录 | `src/vanilla.ts`、`src/react.ts`、`src/vanilla/shallow.ts`、`src/middleware/persist.ts`、`src/middleware/devtools.ts`、`src/middleware/immer.ts` |
| 关键基础设施 | vanilla+react 双层架构、useSyncExternalStore 5 行适配、闭包式中间件、Mutate<S, Ms> 泛型链、hydrationVersion TOCTOU 防御、shallow prototype 判定、findCallerName stack trace 解析、bundle 1.1KB gzip |
