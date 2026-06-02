# redux - 严格单向数据流的可预测状态容器

**GitHub**: reduxjs/redux
**Star**: 60.7k
**语言**: TypeScript
**主题**: 状态管理 / 单向数据流 / 时间旅行
**适用场景**: React/Vue/原生 JS 全局状态、跨环境同构（client/server/native）、可回放/可序列化

---

## 第一段：核心机制与状态哲学

### 模式 1：单一 Store + 单一 State 树

**问题场景**：前端 SPA 状态分散在多个组件、多个 model、多个 lib，bug 复现时不知道"什么时候谁改了哪个 state"；多 store 方案让 devtools 无法统一回放。

**解决方案**：整个应用所有 state 集中存放在一棵 object tree（`store.getState()`），是整个应用的"快照"。任何地方想读 state 都从 store 拿。

```ts
import { createStore } from 'redux'
type State = { count: number }
const reducer = (state: State = { count: 0 }, action: any) => state
const store = createStore(reducer)
store.getState()                  // 读整棵 state 树
store.dispatch({ type: 'INC' })    // 写（唯一入口）
store.subscribe(() => {})         // 订阅变化
```

**关键参数**：
- `createStore(reducer, preloadedState?)` 创建
- `store.getState()` 同步读
- `store.dispatch(action)` 同步写
- `store.subscribe(listener)` 注册监听
- 内部 `nextListeners` 数组管理订阅快照

**最佳实践**：单一 store 不是限制，是简化调试/时间旅行的代价；多 store 仅在跨应用边界（如 iframe）才用；新项目直接用 RTK `configureStore`。

### 模式 2：Action 描述发生了什么

**问题场景**：组件直接调用 setState/修改 model 方法，调用方和被调方紧耦合，难以序列化/记录/重放；业务事件名散落无法做集中埋点。

**解决方案**：所有 state 变更必须派发一个 plain object 的 action，结构 `{ type: 'string', payload?: any }`。`type` 是事件名（动词过去式），`payload` 是数据。

```ts
type Action<T = string> = { type: T; payload?: unknown; meta?: unknown; error?: boolean }
const addTodo = (text: string) => ({ type: 'todos/add', payload: { id: nanoid(), text } })
const increment = (n = 1) => ({ type: 'counter/increment', payload: n })
store.dispatch(addTodo('learn redux'))
```

**关键参数**：
- 必须有 `type` 字段（string）
- 推荐用 Flux Standard Action（FSA）规范（type/payload/meta/error）
- action creator：`(args) => action object` 集中创建避免拼写错
- 不可变：dispatch 同 action 多次效果一致

**最佳实践**：action type 用 `domain/eventName` 命名（如 `todos/toggle`、`auth/login`）；用 action creator 集中创建；action 必须可序列化（不传函数/Symbol）。

### 模式 3：Reducer 纯函数计算新 State

**问题场景**：state 变更逻辑散落在 setState 回调、middleware、各组件中，调试时不知道"这次 setState 实际改了什么"；时间旅行无法回放。

**解决方案**：reducer 是签名严格为 `(state, action) => state` 的纯函数：相同输入永远相同输出，无副作用，不修改原 state（用 spread/Object.assign 返回新对象）。

```ts
type TodosState = { list: { id: string; text: string; done: boolean }[] }
const todos = (state: TodosState = { list: [] }, action: Action): TodosState => {
  switch (action.type) {
    case 'todos/add':
      return { list: [...state.list, action.payload] }
    case 'todos/toggle':
      return { list: state.list.map(t => t.id === action.payload ? { ...t, done: !t.done } : t) }
    default:
      return state
  }
}
```

**关键参数**：
- 纯函数：无 IO、无 `Date.now()`、无随机数、无 `fetch`
- 不可变：不修改入参，返回新对象（`...spread` / `Object.assign` / `structuredClone`）
- 处理未知 action：`default: return state`
- 初始 state：第二个参数 `undefined` 时返回初始值

**最佳实践**：reducer 内禁止 `fetch` / `localStorage` / `console.log`；副作用一律放 middleware（thunk/saga）；用 RTK `createSlice` + Immer 让"可变写法 = 不可变结果"。

### 模式 4：Dispatch 单向数据流

**问题场景**：组件 A 直接修改组件 B 的 state，多个组件互相 setState 形成"事件链"，无法预测；同步/异步 setState 混在一起。

**解决方案**：唯一改变 state 的方式是 `store.dispatch(action)` → reducer 计算 → store 通知所有 subscriber → 组件重新渲染。形成"用户事件 → action → reducer → 新 state → 重渲染"的闭合环。

```ts
function Counter() {
  const [s, setS] = useState(store.getState().count)
  useEffect(() => store.subscribe(() => setS(store.getState().count)), [])
  return <button onClick={() => store.dispatch({ type: 'INC' })}>{s}</button>
}
```

**关键参数**：
- `dispatch(action)` 是同步的（middleware 链全部跑完才返回）
- 一次 dispatch 一次 state 更新
- 同步阻塞：dispatch 期间其他 dispatch 被忽略（避免 race）
- store 内部 `nextListeners` 在 dispatch 前拷贝避免遍历时被改

**最佳实践**：UI 事件 = dispatch(action)；绝不在 render 期间 dispatch（无限循环）；`dispatch` 返回传入的 action，可用于链式判断。

### 模式 5：Subscribe 订阅 + Unsub 取消

**问题场景**：组件需要响应 state 变化，但 React 组件应该用 `connect`/`useSelector`，原生 JS 环境（Node 服务端、Vanilla JS）怎么办？

**解决方案**：`store.subscribe(listener)` 返回 unsubscribe 函数，listener 在每次 dispatch 后被调用（state 引用变化时）。手动调 `unsub()` 取消订阅。

```ts
const unsub = store.subscribe(() => {
  const s = store.getState()
  console.log('state changed', s)
})
store.dispatch({ type: 'INC' })   // 触发 listener
unsub()                            // 取消订阅
store.dispatch({ type: 'INC' })   // 不再触发
```

**关键参数**：
- listener 接收 `() => getState()`，调用时拿最新 state
- subscribe 内部用 `nextListeners` 数组，dispatch 前 `ensureCanMutateNextListeners` 拷贝
- React 18 用 `useSyncExternalStore` 替代手写 subscribe（防 tearing）
- listener 抛错不影响其他 listener（try/catch 包裹）

**最佳实践**：手动管理 subscribe 时，必须在 unmount 调 unsubscribe 防内存泄漏；React 项目优先用 react-redux 的 hooks。

---

## 第二段：单向数据流与中间件链

### 模式 6：combineReducers 分模块

**问题场景**：100+ action type 写在一个 reducer 里 500+ 行；多人协作时改一个模块要小心影响其他模块；state 树平铺导致 key 冲突。

**解决方案**：`combineReducers({ user, posts, comments })` 把多个子 reducer 合并成根 reducer。state 自动按 key 拆分，每个子 reducer 只管自己的 slice。

```ts
import { combineReducers, createStore } from 'redux'
const rootReducer = combineReducers({
  user:    userReducer,
  posts:   postsReducer,
  comments: commentsReducer,
})
const store = createStore(rootReducer)
store.getState()   // { user: {...}, posts: {...}, comments: {...} }
```

**关键参数**：
- 子 reducer key = state slice key（一一对应）
- 未知 action：子 reducer 必须返回原 state（`default: return state`）
- 嵌套：`combineReducers({ ui: combineReducers({ modal, toast }) })`
- 内部用 `assertReducerShape` 校验初始 state

**最佳实践**：按"业务领域"拆分（user / posts / cart）而非按组件树；reducer 文件按 slice 独立成文件；不要嵌套超过 2 层（`a.b.c` 难维护）。

### 模式 7：applyMiddleware 链

**问题场景**：异步 action（fetch 后再 dispatch）、日志、错误监控、撤销重做，都是"对 dispatch 的拦截增强"，写在 reducer 破坏纯函数。

**解决方案**：`applyMiddleware(thunk, logger)` 返回 store enhancer，middleware 是 `(store) => (next) => (action) => {...}` 的三层函数：`store` 拿 getState/dispatch，`next` 调下一个 middleware，`action` 是入参。

```ts
import { createStore, applyMiddleware } from 'redux'
import thunk from 'redux-thunk'
import { createLogger } from 'redux-logger'
const logger = createLogger({ collapsed: true })
const store = createStore(reducer, applyMiddleware(thunk, logger))

// 自定义 middleware 示例
const api: Middleware = ({ dispatch, getState }) => next => action => {
  if (action.type !== 'api/call') return next(action)
  fetch(action.url, action.options)
    .then(r => r.json())
    .then(data => dispatch({ type: action.successType, payload: data }))
  return next(action)
}
```

**关键参数**：
- 洋葱模型：多个 middleware 按顺序嵌套（`a(b(c(action)))`）
- thunk middleware：函数 action（异步）`function(dispatch, getState) { ... }`
- saga middleware：generator 副作用（`take` / `put` / `call`）
- 自定义 middleware：日志/性能/撤销/401 拦截

**最佳实践**：middleware 只关心"横向关注点"（副作用、日志、错误）；业务逻辑放 reducer；middleware 顺序敏感（logger 在最外层先记录）。

### 模式 8：bindActionCreators 简化调用

**问题场景**：组件每次都要 `dispatch(addTodo('text'))` 多写一层 dispatch，烦；多 action 转发给子组件时写一堆 `dispatch`。

**解决方案**：`bindActionCreators({ addTodo, removeTodo }, dispatch)` 返回 `{ addTodo: (text) => dispatch(addTodo(text)), ... }`，组件直接 `props.addTodo('text')`。

```ts
import { bindActionCreators } from 'redux'
const actions = bindActionCreators({ addTodo, removeTodo }, store.dispatch)
actions.addTodo('learn redux')    // 等价于 store.dispatch(addTodo('learn redux'))
```

**关键参数**：
- 第一个参数：action creator 集合（对象或单函数）
- 第二个参数：dispatch
- React-Redux 的 `mapDispatchToProps`（object 形式）内部就是它
- 简单项目可省（直接 `useDispatch + addTodo`）

**最佳实践**：配合 `connect` HOC 或 `useDispatch` hook 用；现代项目多用 RTK 的 `useDispatch` 替代（不用再 bind）；HOC 转发 props 时尤其有用。

### 模式 9：compose 工具函数

**问题场景**：多个 enhancer（applyMiddleware、devToolsEnhancer、persistorEnhancer）要按顺序组合成单个 enhancer；手写 `reduce` 可读性差。

**解决方案**：`compose(f, g, h)(x) === f(g(h(x)))`，从右到左嵌套调用。`applyMiddleware(a, b, c)` 内部就是 `compose(...chain.map(m => m(middlewareAPI)))`。

```ts
import { compose } from 'redux'
const enhance = compose(
  applyMiddleware(thunk, logger),
  devToolsEnhancer({ name: 'MyApp' })
)
const store = createStore(reducer, enhance)
```

**关键参数**：
- 从右到左：最后一个参数先执行
- 单参数：直接返回
- 无参数：返回 `x => x`（恒等）
- 借鉴自函数式编程（`Ramda.compose` / `lodash.flowRight`）

**最佳实践**：自己写 enhancer 时用 `compose` 组合；不直接用 `reduce`（语义不清）；增强链不超过 5 层（调试困难）。

### 模式 10：Redux DevTools 时间旅行

**问题场景**：bug 复现时不知道"哪一步 action 改坏了 state"，想回退到上一步看；issue 复现需要拿到用户现场 state。

**解决方案**：Redux DevTools 浏览器扩展记录所有 dispatch 的 action + state diff，UI 上可"回放"、"撤销"、"重做"、导入/导出 state（issue 复现）。

```ts
import { composeWithDevTools } from '@redux-devtools/extension'
const store = createStore(
  reducer,
  composeWithDevTools(applyMiddleware(thunk, logger))
)
```

**关键参数**：
- `composeWithDevTools(applyMiddleware(...))` 接入
- 支持 action 跳转到任意历史点（时间旅行）
- 支持持久化 state 快照（导出/导入 JSON）
- 支持远程 DevTools（多端调试：移动端用 `react-native-debugger`）

**最佳实践**：开发期必装；记录"哪些 action 触发"是性能分析 + bug 定位的关键；生产环境不接（性能开销 + 暴露 state）；用 `actionSanitizer` / `stateSanitizer` 隐藏敏感字段。

---

## 第三段：Toolkit 与服务端状态

### 模式 11：Redux Toolkit（RTK）现代写法

**问题场景**：经典 Redux 样板代码多（action types、action creators、reducer switch case 满屏），新项目不友好；老项目 80% 代码是"类型 + 工厂"。

**解决方案**：`@reduxjs/toolkit` 提供 `configureStore` + `createSlice` + `createAsyncThunk` 大幅简化：

```ts
import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit'
const counter = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    increment: (state, action: PayloadAction<number>) => { state.value += action.payload },
    reset: (state) => { state.value = 0 },
  },
})
export const { increment, reset } = counter.actions
export const store = configureStore({ reducer: { counter: counter.reducer } })
```

**关键参数**：
- `configureStore({ reducer, middleware })`：默认带 thunk、serializableCheck、immutableCheck、redux-devtools
- `createSlice`：`reducers: { addTodo: (state, action) => { state.list.push(action.payload) } }`
- Immer 让"可变写法 = 不可变结果"（背后用 Proxy 拦截赋值）
- `createAsyncThunk('user/login', async (creds) => api.login(creds))`

**最佳实践**：新项目 100% 用 RTK；老项目逐步迁移（`createSlice` 替换 reducer + action creators）；享受 Immer 但避免在 reducer 内做副作用。

### 模式 12：RTK Query 服务端状态

**问题场景**：服务端数据（列表/详情/分页）+ 缓存 + refetch + 乐观更新，手写 thunk/saga 样板爆炸；Redux 不该管服务端数据（缓存语义不同）。

**解决方案**：`createApi({ baseUrl, endpoints: (builder) => ({...}) })` 一行定义 CRUD，自动生成 React hooks（`useGetPostsQuery` / `useAddPostMutation`），自动缓存、refetch、tag-based invalidation。

```ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
const api = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Post'],
  endpoints: (builder) => ({
    getPosts: builder.query<Post[], void>({
      query: () => 'posts',
      providesTags: ['Post'],
    }),
    addPost: builder.mutation<Post, Partial<Post>>({
      query: (body) => ({ url: 'posts', method: 'POST', body }),
      invalidatesTags: ['Post'],
    }),
  }),
})
export const { useGetPostsQuery, useAddPostMutation } = api
```

**关键参数**：
- `builder.query<T, Args>({ query, providesTags })` 定义读端点
- `builder.mutation<T, Args>({ query, invalidatesTags })` 定义写端点
- 自动缓存：相同 query 不会重复请求（带 staleTime）
- tag 关联：mutation 后自动 refetch 标了同 tag 的 query
- 支持 `pollingInterval` / `refetchOnFocus` / `refetchOnReconnect`

**最佳实践**：服务端状态 100% 用 RTK Query 或 TanStack Query；本地 UI 状态用 createSlice；绝不混用（避免双源真相）。

### 模式 13：createSlice 内部机制

**问题场景**：手写 reducer switch + action types 容易拼写错；新人学 Redux 入门成本高；想用 Immer 又不想自己配。

**解决方案**：`createSlice` 用 `createAction` + `createReducer` + `createNextState`（Immer）组合：
- 自动从 `reducers` key 生成 action types（`name/reducerKey`）
- 自动生成 action creators
- reducer 用 Immer 写"可变"代码，编译为不可变更新

```ts
const slice = createSlice({
  name: 'todos',
  initialState: [] as Todo[],
  reducers: {
    add: (state, action: PayloadAction<string>) => {
      state.push({ id: nanoid(), text: action.payload, done: false })  // Immer 拦截
    },
  },
  extraReducers: (builder) => {
    builder.addCase(authSlice.actions.logout, () => [])  // 处理非本 slice 的 action
  },
})
```

**关键参数**：
- `name: 'todos'` → action types 前缀 `todos/`
- `reducers: { add }` → action type `todos/add`
- `extraReducers` 处理非本 slice 的 action（如 `auth/logout` 清除 todos）
- `selectors` 字段（v2+）：自动推导 state 类型
- `prepare` 回调自定义 payload 构造（`{ payload, meta }`）

**最佳实践**：用 `prepare` 校验 action payload；不要在 reducer 内 throw（用 `rejectWithValue`）；`extraReducers` 用于跨 slice 联动。

### 模式 14：Middleware 实战（auth / logging / persist）

**问题场景**：登录态过期跳转、API 请求 401 拦截、redux state 持久化到 localStorage，这些"横切关注点"写在哪里？

**解决方案**：用 middleware 拦截 dispatch：

```ts
// 401 拦截
const auth: Middleware = ({ dispatch }) => next => action => {
  const result = next(action)
  if ((action as any).error?.status === 401) dispatch(authSlice.actions.logout())
  return result
}
// 持久化
const persist: Middleware = () => next => action => {
  const result = next(action)
  localStorage.setItem('redux-state', JSON.stringify(store.getState()))
  return result
}
const store = configureStore({ reducer, middleware: (gDM) => gDM().concat(auth, persist) })
```

**关键参数**：
- middleware 是 curry 三层函数 `({dispatch, getState}) => next => action => {...}`
- `next(action)` 调下一个 middleware/reducer
- 可在 `next` 前/后做副作用（前：拦截；后：副作用）
- `redux-persist` 是社区标杆（自动 rehydrate + whitelist/blacklist）

**最佳实践**：业务无关的副作用放 middleware；业务相关放 thunk/saga；middleware 抛错用 try/catch 包裹避免整个 dispatch 链中断。

### 模式 15：性能优化（reselect / shallowEqual）

**问题场景**：`mapStateToProps` 每次返回新对象，所有 `connect` 组件 re-render；selector 计算昂贵（filter/sort 每次都重算）。

**解决方案**：`createSelector`（reselect）记忆化 selector：相同 input 永远返回相同 output（浅比较）。`useSelector` 配 `shallowEqual` 做浅比较避免引用变化导致 re-render。

```ts
import { createSelector } from '@reduxjs/toolkit'
const selectUser = (s: RootState) => s.user
const selectPosts = (s: RootState) => s.posts
const selectVisiblePosts = createSelector(
  [selectUser, selectPosts],
  (user, posts) => posts.filter(p => p.authorId === user.id)  // 记忆化
)
// React 端
const visible = useSelector(selectVisiblePosts, shallowEqual)
```

**关键参数**：
- `createSelector([input1, input2], (a, b) => result)` 记忆化组合
- input 引用相等 → 直接返回缓存（`===` 比较）
- 多个 input selector 时按位置比较
- RTK 自带 reselect（无需单独安装）
- `useSelector(state => state.x, shallowEqual)` 浅比较返回值

**最佳实践**：派生数据用 createSelector；频繁 re-render 用 React-Redux v8+ 的 `useSelector` 自动浅比较；selector 拆细粒度（按字段）提升缓存命中率。

---

## 第四段：工程实践与现代演进

### 模式 16：React-Redux 集成

**问题场景**：原生 React 用 subscribe + forceUpdate 难维护；React 18 并发模式下需要避免 tearing（state 不一致）；需要 hooks 风格订阅。

**解决方案**：`react-redux` v8+ 提供：
- `<Provider store={store}>` 注入 store
- `useSelector(state => state.x)` 读（内部用 `useSyncExternalStore`）
- `useDispatch()` 拿 dispatch
- `connect(mapStateToProps, mapDispatchToProps)` HOC（兼容旧代码）

```tsx
import { Provider, useSelector, useDispatch } from 'react-redux'
import { configureStore, createSlice } from '@reduxjs/toolkit'
const store = configureStore({ reducer: counter.reducer })
function App() {
  return <Provider store={store}><Counter /></Provider>
}
function Counter() {
  const value = useSelector((s: RootState) => s.value)
  const dispatch = useDispatch()
  return <button onClick={() => dispatch(counter.actions.increment(1))}>{value}</button>
}
```

**关键参数**：
- Provider 必须包在根组件外（`createRoot` 之外）
- `useSelector` 接受 `equalityFn`（默认 reference 比较）
- 多个 selector 用 `useSelector(state => state.x, shallowEqual)`
- `connect` 性能比 hooks 略差但可记忆（`connectAdvanced`）
- v8 内部用 `useSyncExternalStore` 解决 React 18 并发模式 tearing

**最佳实践**：默认 useSelector + useDispatch；只在性能敏感场景用 connect + ownProps；每次 `useSelector` 选最小 slice（避免不必要订阅）。

### 模式 17：TypeScript 类型安全

**问题场景**：手写 Redux 类型样板多（State、Action、Dispatch 类型散落）；用 any 失去类型保护；thunk payload 类型难推导。

**解决方案**：
- RTK 内置 `configureStore` 自动推导 RootState / AppDispatch
- `useSelector` 配 typed hook `useAppSelector`
- `createSlice` 自动推导 action payload 类型
- ThunkAction 类型化：`const thunk: ThunkAction<void, RootState, unknown, Action> = ...`

```ts
export const store = configureStore({ reducer: rootReducer })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
export const useAppDispatch: () => AppDispatch = useDispatch
```

**关键参数**：
- `RootState = ReturnType<typeof store.getState>`：根 state 类型
- `AppDispatch = typeof store.dispatch`：dispatch 类型（含 thunk）
- typed hooks：`useAppDispatch` / `useAppSelector`
- `createAsyncThunk<TReturned, TThunkArg, TConfig>` 配 generic

**最佳实践**：100% TS 项目用 RTK（类型推导最完善）；手写 Redux 时维护单一 `types.ts`；`createAsyncThunk` payload 用 Zod 校验防运行时错。

### 模式 18：异步数据流（thunk vs saga vs observable）

**问题场景**：API 请求要 dispatch 多个 action（pending / success / error），还要处理 race condition、retry、debounce、cancel；不同方案如何选？

**解决方案**：
- **thunk**：函数 action，`(dispatch, getState) => async () => {...}`，最简单
- **createAsyncThunk**：自动生成 pending/fulfilled/rejected 三个 action
- **saga**：generator + effect（`call` / `put` / `take`），适合复杂流程
- **observable**：rxjs 风格，最强大但学习曲线陡

```ts
// thunk 写法
const fetchUser = (id: string) => async (dispatch) => {
  dispatch({ type: 'user/load' })
  try {
    const data = await api.getUser(id)
    dispatch({ type: 'user/loadSuccess', payload: data })
  } catch (e) { dispatch({ type: 'user/loadError', error: e }) }
}
// createAsyncThunk 写法
const fetchUser = createAsyncThunk('user/load', async (id: string) => {
  const data = await api.getUser(id)
  return data
})
```

**关键参数**：
- thunk 适合简单异步（1-2 步）
- saga 适合长流程（登录 → 拉取配置 → 跳转）、race condition 复杂
- 99% 场景用 RTK Query 或 TanStack Query（更简单）
- 性能：saga 可取消（`takeLatest`）thunk 不可

**最佳实践**：优先 RTK Query（自动处理一切）；简单场景用 createAsyncThunk；超复杂流程才用 saga（学习成本高）。

### 模式 19：测试策略

**问题场景**：reducer 纯函数好测，但 action creator / middleware / store 集成难测；网络异步怎么 mock？

**解决方案**：
- **reducer 测试**：导入 reducer，dispatch action，断言新 state（100% 覆盖）
- **action creator 测试**：纯函数，断言返回对象
- **middleware 测试**：mock store，dispatch action，验证副作用
- **集成测试**：render `<Provider>`，模拟用户交互
- **MSW mock 网络**：测 thunk/RTK Query

```ts
import reducer, { increment, addTodo } from './counterSlice'
test('increment adds 1', () => {
  const prev = { value: 0 }
  const next = reducer(prev, increment(1))
  expect(next.value).toBe(1)
})
test('addTodo adds item', () => {
  const next = reducer({ list: [] }, addTodo('x'))
  expect(next.list).toHaveLength(1)
})
```

**关键参数**：
- Vitest/Jest + `@testing-library/react`
- reducer 覆盖率 100%（太容易测了，纯函数无 IO）
- mock store：`const mockStore = configureStore({ reducer: () => ({}) })`
- snapshot 测试 store 不推荐（state 易变，snapshot 噪声大）
- MSW（Mock Service Worker）拦截真实 fetch（不只是 jest mock）

**最佳实践**：reducer/action creator 100% 测；integration 测关键用户路径（点击 → 渲染）；不要测内部 state 变量（测行为不测实现）。

### 模式 20：迁移到 RTK 实战清单

**问题场景**：老项目用经典 Redux（手写 reducer、action types、thunk），如何迁移到 RTK？一次性重写风险大。

**解决方案**：渐进式迁移（不破坏现有代码）：
1. 安装 `@reduxjs/toolkit` + `@reduxjs/toolkit/query/react`
2. 用 `createSlice` 替换一个 slice（user / posts）
3. 用 `configureStore` 替换 `createStore`（保留旧 middleware）
4. 异步 thunk 用 `createAsyncThunk` 替换手写 thunk
5. 新功能用 RTK Query
6. 删除手写 action types 文件

```ts
// 迁移前
const INCREMENT = 'counter/INCREMENT'
const increment = (n: number) => ({ type: INCREMENT, payload: n })
const reducer = (s = 0, a: Action) => a.type === INCREMENT ? s + a.payload : s
// 迁移后
const slice = createSlice({ name: 'counter', initialState: 0, reducers: { increment: (s, a: PayloadAction<number>) => s + a.payload } })
```

**关键参数**：
- `createSlice` 替换：原 reducer + action creators + action types 三件套
- `configureStore` 默认带 thunk middleware（手写 thunk 仍可用）
- RTK Query 与 redux-saga 不能共存（迁移完再删 saga）
- 不要混用 `createSlice` 和手写 reducer（在同 slice 内）

**最佳实践**：按 slice 逐个迁移；不要一次性大爆炸重写；CI 跑全测试保证不退化；保留 git bisect 能力（每个 slice 一个 commit）。

---

## 附录：5 段必读代码

1. `src/createStore.ts` — `createStore` 工厂 + `dispatch` 同步阻塞 + `nextListeners` 拷贝
2. `src/applyMiddleware.ts` — middleware 链式组合（`compose(...chain.map(m => m(middlewareAPI)))` 洋葱模型）
3. `src/combineReducers.ts` — 多 reducer 合并 + `assertReducerShape` 校验初始 state
4. `src/utils/actionTypes.ts` — `INIT` / `REPLACE` 内部 action type（reducer 必须处理）
5. `packages/toolkit/src/createSlice.ts` — RTK createSlice 源码（Immer + 自动 action 生成 + extraReducers builder）

## 一句话总结

Redux = 单一 store + action 描述事件 + reducer 纯函数计算 + dispatch 单向流，把"状态变化"从分散的副作用变成可记录、可回放、可序列化的纯函数变换；RTK 把 2KB 核心扩展成"现代 Redux 工具集"（Immer + thunk + Query + 5KB 体积），是 React 生态事实标准。
