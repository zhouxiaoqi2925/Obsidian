# Redux - 可预测状态容器（严格单向数据流）

**GitHub**: reduxjs/redux
**Star**: 60k+
**语言**: TypeScript
**主题**: state-management、redux、react、flux
**适用场景**: React 中大型应用、复杂状态管理、Redux Toolkit + RTK Query

---

## 一、基础范式

### 模式 1 · Store + State + Action + Reducer 四件套

**问题场景**：复杂 SPA 状态分散在组件，跨组件通信困难。

**解决方案**：Redux 用四件套：① `store` 唯一状态源 ② `state` 不可变数据 ③ `action` 描述事件 ④ `reducer` (state, action) => newState 纯函数。Flux 单向数据流。

**关键参数**：
- `createStore(reducer)`
- `store.getState()`
- `store.dispatch(action)`
- `store.subscribe(cb)`
- 不可变 state

**最佳实践**：所有复杂 React 应用用 Redux，状态集中可调试。

### 模式 2 · createSlice（Redux Toolkit 推荐）

**问题场景**：手写 action types + action creators + reducer 啰嗦。

**解决方案**：`createSlice({ name, initialState, reducers: { inc(state) {...} } })` 自动生成 action types + creators + reducer；可写「可变」语法（Immer 内部）。

**关键参数**：
- `createSlice`
- 自动 action
- Immer
- 可变语法
- 0 boilerplate

**最佳实践**：所有新项目用 Redux Toolkit + createSlice，告别 boilerplate。

### 模式 3 · Provider + useSelector + useDispatch

**问题场景**：组件怎么访问 store。

**解决方案**：根组件 `<Provider store={store}>` 注入；`useSelector(state => state.user.name)` 取状态；`useDispatch()` 派发 action。

**关键参数**：
- `<Provider>`
- `useSelector`
- `useDispatch`
- 性能自动优化
- Context 注入

**最佳实践**：所有 React 项目用 React-Redux Hooks API，告别 connect HOC。

### 模式 4 · 中间件（Middleware）

**问题场景**：需要在 dispatch 前后加副作用（异步 / 日志）。

**解决方案**：`const middleware = store => next => action => {...}` 洋葱模型，3 参数：store / next / action；`applyMiddleware(thunk, logger)` 注册。

**关键参数**：
- 3 参数签名
- `applyMiddleware`
- `next(action)`
- 洋葱链
- 可组合

**最佳实践**：所有副作用用中间件（thunk / saga / observable）。

### 模式 5 · 不可变更新（Immer）

**问题场景**：手写不可变更新易错（深拷贝 / 展开运算符）。

**解决方案**：Redux Toolkit 内置 Immer，`state.user.name = 'foo'` 可变写法自动生成不可变 state；reducer 写起来像 mutation。

**关键参数**：
- `produce(state, draft => {})`
- 可变语法
- 不可变结果
- 结构共享
- 性能优

**最佳实践**：所有 Redux Toolkit 项目自动用 Immer，告别手写展开运算符。

---

## 二、扩展范式

### 模式 6 · RTK Query 数据获取

**问题场景**：数据获取 / 缓存 / 失效 / 重新拉取逻辑散落各处。

**解决方案**：RTK Query 定义 `createApi({ baseUrl, endpoints: builder => ({ getUser: builder.query({ query: id => `/users/${id}` }) }) })` 自动生成 Redux slice + hooks。

**关键参数**：
- `createApi`
- `builder.query`
- `useGetUserQuery(id)`
- 自动缓存
- 自动 refetch

**最佳实践**：所有需要服务端数据的项目用 RTK Query，替代 React Query / SWR。

### 模式 7 · redux-thunk 异步 action

**问题场景**：action 需要异步（API 调用）。

**解决方案**：`thunk` 中间件让 action creator 返回函数 `async (dispatch, getState) => { const data = await fetch(...); dispatch({ type: 'SET', payload: data }) }`。

**关键参数**：
- `redux-thunk`
- 函数 action
- `dispatch` / `getState`
- 异步
- 简单

**最佳实践**：简单异步用 thunk，复杂流程用 saga。

### 模式 8 · redux-saga 复杂流程

**问题场景**：复杂异步流程（轮询 / 防抖 / 竞态 / 并发）。

**解决方案**：`saga` 用 generator 函数描述副作用（`call` / `put` / `take` / `fork` / `race`），声明式编排。

**关键参数**：
- generator
- `take` / `put` / `call`
- `race` 竞态
- 声明式
- 可测试

**最佳实践**：所有复杂业务流（订单 / 支付）用 saga，10x 可测试性。

### 模式 9 · Redux DevTools 时间旅行

**问题场景**：状态变化难追踪，bug 难定位。

**解决方案**：Redux DevTools 浏览器扩展 + `composeWithDevTools` enhancer，记录所有 action / state；时间旅行 + action 跳过 + state 导入导出。

**关键参数**：
- 浏览器扩展
- `composeWithDevTools`
- 时间旅行
- action 跳过
- state 导入导出

**最佳实践**：所有 dev 环境开 Redux DevTools，调试效率 10x。

### 模式 10 · 实体适配器（createEntityAdapter）

**问题场景**：列表状态管理（CRUD / 排序 / 筛选）样板代码多。

**解决方案**：`createEntityAdapter()` 预制 normalized state `{ ids: [], entities: {} }` + `addOne` / `updateOne` / `removeOne` / `selectAll` / `selectById` reducer + selector。

**关键参数**：
- `createEntityAdapter`
- normalized state
- CRUD reducers
- selectors
- 0 样板

**最佳实践**：所有列表场景用 createEntityAdapter，节省 70% 代码。

---

## 三、进阶范式

### 模式 11 · reselect / createSelector 记忆化

**问题场景**：派生状态重复计算，组件重复渲染。

**解决方案**：`createSelector([selectA, selectB], (a, b) => ...)` 输入不变输出不变，记忆化缓存；`useSelector(selectFoo)` 自动应用。

**关键参数**：
- `createSelector`
- 记忆化
- 依赖数组
- 0 重复计算
- 性能优

**最佳实践**：所有派生状态用 createSelector，性能自动优化。

### 模式 12 · 规范化状态（normalizr）

**问题场景**：嵌套数据（user 包含 posts，posts 包含 comments）难更新。

**解决方案**：用 `normalizr` 把嵌套数据展平为 `{ users: {}, posts: {}, comments: {} }` + id 引用；Redux 推荐规范化。

**关键参数**：
- `normalizr`
- `schema`
- 嵌套展平
- id 引用
- O(1) 更新

**最佳实践**：所有 Redux 状态用规范化，告别深拷贝。

### 模式 13 · Redux + TypeScript 类型

**问题场景**：action / state 没类型，TypeScript 难推。

**解决方案**：`createSlice` 自动推导；自定义 `RootState` 类型 `useSelector((state: RootState) => state.user.name)`；`createAction<T>` / `createReducer<S>` 显式类型。

**关键参数**：
- `createSlice` 自动
- `RootState`
- `TypedUseSelectorHook`
- 0 配置
- 强类型

**最佳实践**：所有 TS 项目用 typed hooks，类型安全 100%。

### 模式 14 · 持久化（redux-persist）

**问题场景**：刷新页面 Redux 状态丢失。

**解决方案**：`redux-persist` 插件自动持久化到 localStorage，`persistStore(store)` + `<PersistGate loading={null}>` 包装。

**关键参数**：
- `redux-persist`
- `persistReducer`
- `PersistGate`
- `whitelist` / `blacklist`
- localStorage

**最佳实践**：所有需要刷新保留的场景用 redux-persist。

### 模式 15 · 替代品（Zustand / Jotai / Valtio）

**问题场景**：Redux 太重，需要轻量方案。

**解决方案**：Zustand（hook 式 store）/ Jotai（atomic state）/ Valtio（proxy state）都是 Redux 简化版；Redux 适合大型，Zustand 适合中小型。

**关键参数**：
- Zustand 4KB
- Jotai atomic
- Valtio proxy
- 轻量
- API 简单

**最佳实践**：新中型项目用 Zustand，复杂大型项目用 Redux Toolkit。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Redux 项目。

**解决方案**：7 件套：① `@reduxjs/toolkit` 包 ② `configureStore({ reducer })` ③ `createSlice` 切片 ④ `<Provider store>` 注入 ⑤ `useSelector` / `useDispatch` ⑥ RTK Query API ⑦ Redux DevTools。

**关键参数**：
- Redux Toolkit
- `configureStore`
- `createSlice`
- Provider
- Hooks
- RTK Query
- DevTools

**最佳实践**：所有新项目用 7 件套 + Redux Toolkit，5 分钟跑起来。

### 模式 17 · 大型项目代码组织（feature folder）

**问题场景**：Redux 文件多难组织。

**解决方案**：Feature Folder 结构：`src/features/users/{ usersSlice.ts, UsersList.tsx, userApi.ts }`；每个 feature 独立 slice + 组件 + API。

**关键参数**：
- Feature Folder
- `features/` 目录
- 独立 slice
- 独立 API
- 独立组件

**最佳实践**：所有大型 Redux 项目用 Feature Folder，模块化清晰。

### 模式 18 · 性能优化 5 招

**问题场景**：Redux 项目性能问题。

**解决方案**：5 招优化：① `createSelector` 记忆化 ② `useSelector` 浅比较 ③ `React.memo` 组件 ④ normalized state ⑤ `batch()` 合并 dispatch。

**关键参数**：
- `createSelector`
- 浅比较
- `React.memo`
- 规范化
- `batch()`

**最佳实践**：5 招组合，Redux 项目性能问题全解决。

### 模式 19 · 与 Zustand / MobX / Recoil 对比

**问题场景**：状态管理选型。

**解决方案**：Redux 定位「严格单向 + 强类型 + DevTools」适合大型；Zustand 定位「Hook 轻量 + 0 boilerplate」适合中小型；MobX 定位「响应式 proxy」适合 OOP；Recoil / Jotai 定位「atomic state」适合 React 细粒度。

**关键参数**：
- 学习曲线：Zustand < MobX < Redux < Recoil
- 强类型：Redux > Zustand > MobX > Recoil
- 生态：Redux > MobX > Zustand > Recoil
- DevTools：Redux > MobX > Zustand > Recoil

**最佳实践**：大型 TS 项目选 Redux Toolkit，中小型选 Zustand。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Redux 做状态管理库。

**解决方案**：7 天分 5 步：① `createStore` 工厂 ② reducer 纯函数 ③ dispatch / getState / subscribe ④ 中间件机制 ⑤ combineReducers。

**关键参数**：
- Day 1-2: createStore
- Day 3: reducer
- Day 4: 中间件
- Day 5: combine
- Day 6-7: Hooks

**最佳实践**：7 天复刻「极简 Redux」，完整 RTK 复刻需要 2 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\redux\`
- **大小**: ~5 MB
- **总文件数**: 数十 TS 文件
- **关键 commit**: v5.x（RTK 2.0）
- **团队**: Redux 团队 + React 社区
- **许可**: MIT

## 一句话总结

Redux 用「严格单向数据流 + 不可变 state + 中间件洋葱模型 + RTK 0 boilerplate」让 React 状态管理可预测可调试，是大型 React 应用状态管理的事实标准。
