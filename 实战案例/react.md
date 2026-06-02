# react - 声明式 UI 库的工业标准与 Fiber 协调器范式

**GitHub**: facebook/react
**Star**: 230k+
**语言**: JavaScript / TypeScript / Flow
**主题**: UI 库 / 协调算法 / 虚拟 DOM
**适用场景**: SPA / SSR / 移动端 / 3D / PDF 多端 UI 开发

---

## 第一段：基础范式

### 模式 1：声明式 UI = 纯函数描述视图

**问题场景**：命令式 DOM 操作（jQuery）在大规模组件树中状态与视图一致性难维护；MVC 双向数据流性能差且难以调试。

**解决方案**：把 UI 视为 `UI = f(state)` 纯函数，开发者只描述"什么状态对应什么视图"，DOM 操作由框架完成。每次 state 变化，框架重新执行 `f` 并对比前后输出。

**关键参数**：
- 单向数据流：state 只能通过 setState 更新
- 不可变 state：新值替换旧值，不就地修改
- 组件 = 纯函数或类（无副作用）
- 渲染结果 = React Element 树

**最佳实践**：所有可变的 UI 状态都从 state 派生，绝不直接修改 DOM。

### 模式 2：JSX + createElement 编译时转换

**问题场景**：手写 `React.createElement` 嵌套 5 层后代码可读性归零；模板引擎有运行时开销且与 JS 隔离。

**解决方案**：JSX 是 `React.createElement(type, props, ...children)` 的语法糖，Babel/SWC 在编译时把 `<App />` 翻译成 `createElement(App)`。无运行时开销，调试时仍看到 JSX。

**关键参数**：
- 类型 + props + children 三元组
- 大写字母开头 = 组件，小写 = 宿主元素
- Fragment `<></>` 避免无意义 wrapper
- key 属性用于列表 diff 稳定性

**最佳实践**：把 JSX 当作"声明式 UI 的 DSL"用，享受编译期类型检查 + 编译期优化（如 React Compiler 自动 memo）。

### 模式 3：虚拟 DOM 与 diff 算法

**问题场景**：直接对比真实 DOM 树慢（DOM 节点含大量属性），且 DOM 操作比 JS 对象操作慢 10-100 倍。

**解决方案**：先用 JS 对象（ReactElement）描述 DOM，再 diff 前后对象树找出最小变更集，最后批量更新真实 DOM。React 用 O(n) 的启发式 diff（按层比较 + key 标识）替代理论 O(n^3) 的最优算法。

**关键参数**：
- 同层比较：跨层移动视为删除+新建
- key 复用：相同 key 复用 DOM 节点
- 元素类型决定子树命运
- 最后批处理真实 DOM 操作

**最佳实践**：列表渲染务必提供稳定 `key`（用 id 而非 index），避免 key 变化导致全量重建。

### 模式 4：组件生命周期（类组件时代）

**问题场景**：组件从创建到销毁需要管理副作用（订阅、计时器、DOM 监听），散落在构造器、render 之外的代码中。

**解决方案**：类组件定义 5 个生命周期方法（`constructor` / `componentDidMount` / `shouldComponentUpdate` / `componentDidUpdate` / `componentWillUnmount`），框架按固定顺序调用。

**关键参数**：
- Mount 阶段：构造 → render → DidMount
- Update 阶段：props/state 变化 → shouldUpdate → render → DidUpdate
- Unmount 阶段：WillUnmount 清理
- 副作用集中在 DidMount/DidUpdate/WillUnmount

**最佳实践**：新项目用函数组件 + Hooks，类组件仅维护旧代码。生命周期方法命名约定比记忆更可靠。

### 模式 5：受控组件与非受控组件

**问题场景**：表单输入需要响应"实时"变化又要避免每次按键都 re-render，如何在框架控制与浏览器原生行为间取舍？

**解决方案**：受控组件的 value/onChange 完全由 React state 驱动（推荐用于需要校验/格式化的场景）；非受控组件用 `defaultValue` + `ref` 读取真实 DOM 值（性能更优）。

**关键参数**：
- 受控：`value={state}` + `onChange={e => setState(e.target.value)}`
- 非受控：`defaultValue="init"` + `ref.current.value`
- file input 必须非受控
- 表单库（Formik/RHF）底层都是这两种模式

**最佳实践**：99% 场景用受控（可校验、可重置）；大表单（1000+ 字段）考虑非受控 + 提交时 collect。

---

## 第二段：扩展范式

### 模式 6：Hooks 让函数组件获得状态

**问题场景**：函数组件没有 this、没有实例、无状态；类组件语法重、minify 差、逻辑分散在生命周期里。

**解决方案**：用 `useState` / `useEffect` / `useMemo` 等 hook 把"状态 + 副作用"注入函数组件。Hooks 内部用链表（每个 fiber 节点的 `memoizedState`）记录 hook 状态。

**关键参数**：
- `useState` 返回 `[value, setValue]`
- `useEffect(fn, deps)` 在 commit 后异步执行
- 顺序敏感：hooks 不能写在 if/for 内
- 自定义 hook = 以 `use` 开头的函数

**最佳实践**：自定义 hook 抽取复用逻辑（如 `useFetch` / `useDebounce`），保持组件本体只关心渲染。

### 模式 7：useEffect 副作用模型

**问题场景**：需要在 render 后操作真实 DOM、订阅事件、设置计时器，但又不能阻塞 paint。

**解决方案**：`useEffect(fn, deps)` 在浏览器 paint 之后异步执行 `fn`，deps 数组决定何时重跑。`useLayoutEffect` 同步版本在 paint 前执行（用于读 layout 防抖动）。

**关键参数**：
- deps 数组：空数组 = 只跑一次，缺省 = 每次 render
- cleanup 函数：return 一个函数，在下次 effect 跑前 + 卸载时调用
- `useLayoutEffect` 用于同步读 DOM
- 避免在 effect 里直接 setState（用 useMemo 派生）

**最佳实践**：所有订阅/计时器必须 cleanup，闭包陷阱用 `useRef` 解决。

### 模式 8：Context 跨组件树传值

**问题场景**：props drilling 把 theme/locale/user 逐层传递到 5+ 层；Redux 太重只为传 1 个 string。

**解决方案**：`React.createContext()` 创建上下文，Provider 注入值，子孙用 `useContext(Context)` 读取。Context 通过 fiber 树的"dependencies 链表"传播。

**关键参数**：
- 默认值：createContext(defaultValue) 的 fallback
- Provider value 变化触发所有消费者 re-render
- 多 Context 可嵌套
- 性能：拆分细粒度 Context 减少不必要重渲

**最佳实践**：Context 适合低频变化（主题、用户、locale）；高频状态用 Zustand/Redux/Jotai。

### 模式 9：Refs 突破单向数据流

**问题场景**：需要直接操作 DOM（focus、scroll、measure）、保存"不会触发 re-render"的可变值、跨渲染保留定时器 id。

**解决方案**：`useRef(initialValue)` 返回 `{ current }` 对象，`.current` 可变且不触发 re-render。`forwardRef` 把 ref 透传到子组件。

**关键参数**：
- DOM ref：`<div ref={myRef} />` → `myRef.current` 是真实 DOM
- Mutable ref：保存 timer id、socket 实例
- 不会触发 re-render
- 跨多次 render 同一引用

**最佳实践**：能用 state 解决就别用 ref；ref 是"逃生舱口"不是首选工具。

### 模式 10：性能优化三件套（memo / useMemo / useCallback）

**问题场景**：父组件 setState 触发所有子组件 re-render，即使子组件 props 没变；昂贵计算每次 render 重跑。

**解决方案**：`React.memo(Component)` 对 props 做浅比较跳过 re-render；`useMemo(() => expensive(), [deps])` 缓存计算；`useCallback(fn, [deps])` 缓存函数引用。

**关键参数**：
- shallow compare 仅看引用相等
- 对象字面量当 props 永远不等
- useMemo 有自身开销，不是免费
- React Compiler 自动 memo 是终极解

**最佳实践**：先 profiling 再优化；不要无脑包裹。React Compiler 普及后这套会被淘汰。

---

## 第三段：进阶范式

### 模式 11：Fiber 协调器与可中断渲染

**问题场景**：同步递归渲染（Stack Reconciler）大组件树会阻塞主线程 200ms+，用户感知卡顿。

**解决方案**：Fiber 把渲染拆成可中断的"工作单元"，每个 React Element 对应一个 FiberNode，通过 `child/sibling/return` 链表遍历。配合 Scheduler 的 5ms 时间切片，每帧检查 `shouldYield()`。

**关键参数**：
- 5ms 时间片（`performance.now() + 5`）
- beginWork 进入节点，completeWork 离开
- 双缓冲：current tree + workInProgress tree
- 中断后可恢复，靠 alternate 指针

**最佳实践**：理解 Fiber 就理解了 React 18 的 concurrent mode，是 useTransition/useDeferredValue 的基础。

### 模式 12：双缓冲 + 副作用提交

**问题场景**：渲染中修改真实 DOM 会让用户看到半成品 UI，导致视觉抖动（layout thrashing）。

**解决方案**：所有 DOM 修改先在 workInProgress tree 完成，全部就绪后一次性 commit（commitWork）到 current tree。`flags` 位图记录每个 fiber 的副作用类型（Placement/Update/Deletion/Passive）。

**关键参数**：
- 提交前：所有计算在 workInProgress
- 提交时：按顺序执行 mutation effects
- useEffect 回调在 commit 之后异步跑
- Passive flags 标记 useEffect

**最佳实践**：永远不要在 render 阶段操作真实 DOM；只在 effect（layout/passive）里读写 layout。

### 模式 13：Concurrent Mode 与优先级调度

**问题场景**：用户输入（输入框打字、点击）应该立即响应；数据加载、列表渲染可以延迟。如何区分"紧急"与"不紧急"？

**解决方案**：`useTransition` 把更新标记为 transition（不紧急），React 可中断、推迟；`useDeferredValue` 延迟一个值的更新；`useSyncExternalStore` 同步订阅外部 store。

**关键参数**：
- transition：用户感知可延迟
- 同步：用户必须立即看到结果（如动画帧）
- Scheduler 5 个 lane 优先级
- 18.x 之前需 `ReactDOM.createRoot` 启用

**最佳实践**：昂贵列表过滤、大表单提交用 `useTransition` 包裹，避免输入卡顿。

### 模式 14：Server Components（RSC）

**问题场景**：客户端 bundle 越来越大（70% 是组件代码），首屏要等 JS 下载+解析+执行；SEO 需要服务端渲染完整 HTML。

**解决方案**：Server Components 在服务端运行，不发到客户端，可直接读数据库/文件系统。RSC payload 是序列化后的 React Element 树，客户端用 React Server DOM 格式 hydrate。

**关键参数**：
- `"use server"` / `"use client"` 边界标记
- Server 端组件不能有 state / effect
- 序列化：Date/Map/Set/Error 走 turbo-stream
- 与 SSR 协同：服务端 HTML + 流式 RSC payload

**最佳实践**：把数据获取放 server 组件，交互逻辑放 client 组件；Next.js App Router 是 RSC 的工业实现。

### 模式 15：React Compiler 自动 Memoization

**问题场景**：手动 useMemo/useCallback 心智负担重，新人不会写、写错会引入 bug。

**解决方案**：React Compiler 是 Babel 插件，编译期分析数据流，自动给函数组件插入 `memo()` 等价物。开发者不再需要手写性能优化代码。

**关键参数**：
- 安装：`npm i babel-plugin-react-compiler`
- 自动识别"哪些 props 实际被使用"
- 不会无限优化：识别不可序列化的值
- 仍是实验性：v19+ 稳定

**最佳实践**：启用 Compiler 后，代码库可以删掉 80% 的 useMemo/useCallback；让它来做正确的事。

---

## 第四段：实战范式

### 模式 16：State 管理选型

**问题场景**：Context 性能差（任何 value 变化全树 re-render）、Redux 太重、MobX 心智特殊，如何选？

**解决方案**：本地 state（useState）→ 提升到 Context（主题/用户）→ Zustand/Jotai（中等规模全局）→ Redux Toolkit（大型应用/严格规范）。判断标准：状态影响多少组件？变化频率？是否需要时间旅行？

**关键参数**：
- 5 个组件以下共享：useState + 提升
- 5-50 个组件：Zustand
- 50+ 组件 + 严格规范：Redux Toolkit
- 表单状态：React Hook Form
- 服务端状态：TanStack Query / SWR

**最佳实践**：不要在 Context 里放高频变化的值；服务端状态永远不要用 Redux 管（用专门的 server-state 库）。

### 模式 17：组件 API 设计

**问题场景**：第三方组件库 API 不一致（props 命名混乱、传 children 还是 props）；组件内部状态不暴露，外部无法控制。

**解决方案**：遵循"props 命名一致性"（`value/onChange` / `open/onClose` / `items/onSelect`），区分 controlled/uncontrolled，暴露 `ref` 转发 + `displayName`。

**关键参数**：
- 受控/非受控二元 API
- 复合组件（Tabs.TabList + Tabs.Tab）
- forwardRef 暴露 imperative API
- defaultProps vs 解构默认值

**最佳实践**：API 稳定性 > 灵活性；宁少勿多，提供 escape hatch（ref 转发、render props）。

### 模式 18：测试策略

**问题场景**：组件有 props、state、context、副作用、DOM 事件、异步加载，测试覆盖不全。

**解决方案**：单元测试用 React Testing Library（用户视角，不测实现细节）；E2E 用 Playwright/Cypress（关键用户路径）；Snapshot 测试谨慎用（易脆）；MSW mock 网络。

**关键参数**：
- 测用户行为：findByText / getByRole
- 不测实现：不用 enzyme 的 shallow
- 异步用 `await waitFor`
- Coverage 不追求 100%

**最佳实践**：每个组件至少 1 个集成测试（点击/输入触发状态变化）；不要测内部 state 变量。

### 模式 19：SSR / SSG / ISR 选型

**问题场景**：纯 SPA 首屏慢、SEO 差；纯 SSR 服务器压力大、TTFB 高。

**解决方案**：SSR（Next.js）服务端渲染每请求；SSG（`getStaticProps`）构建时生成；ISR（Incremental Static Regeneration）按需 revalidate；Streaming SSR（RSC + Suspense）边渲染边发送。

**关键参数**：
- SSG：博客/营销页（无变化）
- SSR：用户登录后内容
- ISR：电商商品页（偶尔更新）
- Streaming：大型 dashboard

**最佳实践**：能用 SSG 就不用 SSR；用 Next.js App Router 默认走 RSC + Streaming 是当前最优解。

### 模式 20：升级到 React 19 实战清单

**问题场景**：新项目用 v18，老项目从 v16/17 升级到 19 的迁移路径是什么？破坏性变更？

**解决方案**：v19 主要变化：自动 memoization 入口、Server Actions 稳定、`use` hook 读取 Promise/context、ref 作为 prop（不再需要 forwardRef）、新 `<Context>` 元素。升级步骤：升级到 18.x → 跑 codemod → 启用 strict mode → 试 v19。

**关键参数**：
- 移除：`forwardRef`（ref 可直接当 prop）
- 移除：`string ref`
- 新增：`<form action={serverAction}>` 服务端 action
- 移除：legacy context API
- 启用 React Compiler 提升性能

**最佳实践**：在分水岭项目上 v19 + Compiler；老项目按 16→17→18→19 节奏升级，每个 minor 跑 1-2 周稳定后再上。

---

## 附录：5 段必读代码

1. `packages/react-reconciler/src/ReactFiberWorkLoop.js` — 协调主循环（workLoop / beginWork / completeWork / commitWork）
2. `packages/react-reconciler/src/ReactFiberBeginWork.js` — 按 fiber.tag 派发的策略模式
3. `packages/react-reconciler/src/ReactFiberCommitWork.js` — 副作用提交（mutation effects / passive effects）
4. `packages/react-reconciler/src/ReactFiberHooks.js` — Hook 内存模型（链表 + dispatcher）
5. `packages/scheduler/src/forks/Scheduler.js` — 时间切片调度（5ms `shouldYield`）

## 一句话总结

React = 声明式 UI 范式（UI = f(state)）+ Fiber 协调器（可中断、双缓冲）+ Hooks 链表（函数组件状态），用工业级工程实现了"纯函数描述 UI"的方法论。
