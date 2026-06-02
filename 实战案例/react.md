# React · 架构与工程实践精要

> React 是全球最主流的 UI 库，定义了"声明式组件 + 虚拟 DOM + 单向数据流"的范式。本笔记从 Amazon Builders' Library 视角剖析其 Fiber 协调器、双缓冲机制、Hooks 内存模型，聚焦 20 个工程模式与决策。

---

## 一、核心机制与协调哲学

### 模式 1：声明式 UI 与单向数据流

**问题场景**：传统 jQuery 时代手动操作 DOM（`$el.html()` / `appendChild`）导致状态散落、UI 与状态不一致。Angular 1.x 双向绑定虽然便利，但"循环更新"性能差且难调试。React 用"状态 → UI 单向映射"重新定义 UI 范式。

**解决方案代码**：

```jsx
// 声明式：状态是什么，UI 就是什么
function Counter() {
  const [count, setCount] = useState(0);  // 状态
  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}  {/* UI = f(state) */}
    </button>
  );
}

// 每次 setState 触发 render → React 比对新旧虚拟 DOM → 最小化 DOM 更新
// 开发者只关心"状态变化"，不关心"DOM 怎么改"
```

**关键参数表**：

| 概念 | 传统命令式 | React 声明式 |
|---|---|---|
| 状态管理 | DOM 属性 / 全局变量 | `useState` / `useReducer` |
| 视图更新 | `el.innerHTML = ...` 手动 | render 函数返回 JSX |
| 事件处理 | `addEventListener` | JSX `onClick={fn}` |
| 父子通信 | 共享变量 / 全局 store | props 单向 / callback 回调 |
| 性能优化 | 手动 diff / throttle | React 内部 diff + 自动 batching |

**最佳实践列表**：
- "UI = f(state)" 是 React 心法——所有 UI 都是 state 的纯函数
- 状态提升（Lift state up）到共同父组件——避免子组件间直接通信
- 派生状态用 `useMemo` / `useState` 计算——不要存可推导的值
- 反模式：直接修改 `state`（mutation）——React 看不到变化，必须 `setX(...)`

### 模式 2：JSX 编译为 React.createElement

**问题场景**：在 JS 文件里写 `<div>...</div>` 看起来很怪——JS 怎么支持 HTML 语法？React 用 Babel 插件把 JSX 编译为 `React.createElement(...)` 调用，开发体验与运行时性能兼顾。

**解决方案代码**：

```jsx
// 源码（JSX）
function App() {
  return (
    <div className="container">
      <h1>Hello {name}</h1>
      <Button onClick={handleClick}>Click me</Button>
    </div>
  );
}
```

```js
// 编译后（Babel @babel/preset-react）
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

function App() {
  return _jsxs("div", {
    className: "container",
    children: [
      _jsx("h1", { children: `Hello ${name}` }),
      _jsx(Button, { onClick: handleClick, children: "Click me" }),
    ]
  });
}

// 最终：React.createElement("div", {className:"container"}, ...)
```

**关键参数表**：

| JSX | 编译产物 | 备注 |
|---|---|---|
| `<div>text</div>` | `createElement("div", null, "text")` | 字符串 tagName |
| `<Foo />` | `createElement(Foo, null)` | 组件 tagName = 引用 |
| `<div {...props} />` | `createElement("div", props)` | spread 属性 |
| `<>{cond && <X />}</>` | `createElement(Fragment, null, cond && createElement(X))` | 短语法 Fragment |
| `key={id}` | `createElement("div", {key: id})` | key 是 prop |

**最佳实践列表**：
- JSX 是 `React.createElement` 的语法糖——没有运行时魔法
- 17+ 用新 JSX runtime（`react/jsx-runtime`）——不需要 import React
- 组件名必须大写——`<foo />` 是字符串标签，`<Foo />` 是组件引用
- Fragment（`<>...</>`）避免无谓的 div 包装——不创建 DOM 节点
- 编译期优化：React Compiler 自动 memoize 组件——告别手动 `useMemo`/`useCallback`

### 模式 3：ReactElement 与 Fiber 双层模型

**问题场景**：虚拟 DOM（ReactElement）是"不可变快照"，但"协调"（reconciliation）需要"可中断、可恢复的工作单元"。这两个数据结构目标不同，需要分开设计。

**解决方案代码**：

```js
// ReactElement：不可变快照，描述"这个时刻 UI 应该长什么样"
const element = {
  type: 'div',
  key: null,
  ref: null,
  props: { className: 'container', children: ['Hello'] },
  $$typeof: REACT_ELEMENT_TYPE,  // 类型标记
};

// Fiber：可中断的工作单元，描述"这次更新要做什么"
const fiber = {
  type: 'div',                       // 同 element
  key: null,
  stateNode: domNode,                // 对应真实 DOM
  child: childFiber,                 // 第一个子 fiber
  sibling: siblingFiber,             // 兄弟 fiber
  return: parentFiber,               // 父 fiber
  alternate: currentFiber,           // 双缓冲指针
  pendingProps: { className: 'new' },// 等待应用的 props
  memoizedProps: { className: 'old' },// 已应用的 props
  memoizedState: hookList,           // hooks 链表
  flags: Update | Placement,         // 副作用标记
  lanes: SyncLane,                   // 优先级
};
```

**关键参数表**：

| 字段 | ReactElement | Fiber |
|---|---|---|
| 可变性 | 不可变 | 可变（构造中不断更新） |
| 生命周期 | render 一次创建 | commit 后保留，作为下次 diff 基准 |
| 关系 | 无（无 child/sibling） | 链表（child/sibling/return） |
| 副作用 | 无 | flags 标记位 |
| 调度 | 无 | lanes 优先级 |

**最佳实践列表**：
- ReactElement 是"目标"——每次 render 重建
- Fiber 是"工作单元"——渲染时构造、commit 后保留
- 双缓冲：`fiber.alternate` 指向"上一次"的 fiber，diff 在 alternate 上做
- 调度的最小单位是 Fiber——可中断、可恢复
- 真实 DOM 由 `stateNode` 持有，commit 阶段挂载

### 模式 4：Reconciler 与 Renderer 解耦

**问题场景**：React 要支持 web（DOM）、React Native（iOS/Android）、React 3D（Three.js）、React PDF、React Art（Canvas/SVG）。如果把"协调算法"和"具体渲染"耦合，每个新平台都要重写协调器。

**解决方案代码**：

```js
// packages/react-reconciler/src/ReactFiberReconciler.js
function createContainer(containerInfo, tag, hydrate, hydrationCallbacks) {
  return createFiberRoot(containerInfo, tag, hydrate, hydrationCallbacks);
}

// packages/react-dom/src/client/ReactDOMRoot.js
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('app'));
root.render(<App />);  // → createContainer → reconciler

// packages/react-native-renderer/src/ReactNativeRenderer.js
import { AppRegistry } from 'react-native';
AppRegistry.registerComponent('App', () => App);  // 同一个 reconciler

// reconciler 内部用"host config"抽象渲染目标
const HostConfig = {
  createInstance(type, props) { return document.createElement(type); },
  appendChild(parent, child) { parent.appendChild(child); },
  commitUpdate(instance, type, oldProps, newProps) { /* 更新 DOM */ },
  // ... 100+ host methods
};
```

**关键参数表**：

| 包 | 职责 | 依赖 reconciler |
|---|---|---|
| `react` | 核心 API（createElement / hooks / Component） | ❌ 不依赖 |
| `react-reconciler` | 协调算法（diff + 调度） | ❌ 不依赖 |
| `react-dom` | web 渲染 | ✅ 依赖 reconciler |
| `react-native` | iOS/Android 渲染 | ✅ 依赖 reconciler |
| `react-art` | Canvas/SVG 渲染 | ✅ 依赖 reconciler |
| `react-three-fiber` | Three.js 3D 渲染 | ✅ 依赖 reconciler |
| `react-pdf` | PDF 渲染 | ✅ 依赖 reconciler |

**最佳实践列表**：
- 业务代码只 import `react` + 渲染目标（`react-dom`）——不直接接触 reconciler
- 第三方库作者用 `react-reconciler` 实现自定义渲染——如 Monaco Editor、PDF 查看器
- `react` 核心包可独立运行在 Node（如 SSR、testing）
- React 19 Server Components 渲染器是另一条"reconciler"链路——同样的协议

### 模式 5：三层模型（API / Reconciler / Renderer）

**问题场景**：React 代码量巨大（~7000 文件），新贡献者不知从何读起。需要明确"哪些是 API 层"、"哪些是核心算法"、"哪些是平台绑定"，让"分工"和"职责"清晰。

**解决方案代码**：

```js
// 第一层：packages/react/ —— 公共 API
// src/React.js
export {
  createElement,    // JSX 编译目标
  useState,         // hooks
  useEffect,
  useTransition,
  Component,        // class 基类
  Fragment,
  Suspense,
  // ...
};

// 第二层：packages/react-reconciler/ —— 协调算法
// src/ReactFiberWorkLoop.js
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    workInProgress = performUnitOfWork(workInProgress);  // 调度单元
  }
}

// src/ReactFiberBeginWork.js
function beginWork(current, workInProgress, renderLanes) {
  // 调用组件 render、diff children、构造新 fiber
}

// src/ReactFiberCompleteWork.js
function completeWork(current, workInProgress, renderLanes) {
  // 创建 DOM、收集副作用
}

// src/ReactFiberCommitWork.js
function commitWork(...) {
  // 提交到真实 DOM
}

// 第三层：packages/react-dom-bindings/ —— 浏览器 DOM 绑定
// src/client/ReactDOMHostConfig.js
export function createInstance(type, props, rootContainerInstance, hostContext, internalInstanceHandle) {
  return document.createElement(type);
}
```

**关键参数表**：

| 层 | 文件数 | 核心模块 |
|---|---|---|
| API 层 | ~100 | `react/src/React.js` `ReactHooks.js` |
| Reconciler | ~150 | `ReactFiberWorkLoop` `ReactFiberBeginWork` `ReactFiberCompleteWork` `ReactFiberCommitWork` |
| Renderer (web) | ~80 | `react-dom-bindings/src/client/` |
| Scheduler | ~30 | `scheduler/src/Scheduler.js` |
| Server | ~50 | `react-server/` |

**最佳实践列表**：
- 业务开发者只关注第一层（API）——理解 useState/useEffect 即可
- 想理解 Fiber 工作循环读 `ReactFiberWorkLoop.js`——是整个协调器的入口
- 调性能问题看 `flags` / `lanes`——理解副作用标记和调度优先级
- 自定义渲染器实现 `react-reconciler` 提供的 `HostConfig` 接口——100+ 方法

---

## 二、Fiber 协调器与调度

### 模式 6：双缓冲（Current Tree / WorkInProgress Tree）

**问题场景**：渲染时直接修改"已渲染的树"会导致 UI 闪烁、中途状态不一致。需要"在副本上构造新树，构造完成再原子切换"。

**解决方案代码**：

```js
// packages/react-reconciler/src/ReactFiber.js
const createFiber = (tag, pendingProps, key, mode) => ({
  // ...
  alternate: null,  // 指向"另一半"fiber
});

function createWorkInProgress(current, pendingProps) {
  let workInProgress = current.alternate;
  if (workInProgress === null) {
    // 第一次：创建新 fiber
    workInProgress = createFiber(current.tag, pendingProps, current.key, current.mode);
    workInProgress.elementType = current.elementType;
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;
    // 双向指针
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    // 复用已有的 workInProgress
    workInProgress.pendingProps = pendingProps;
    workInProgress.flags = NoFlags;
    workInProgress.subtreeFlags = NoFlags;
  }
  return workInProgress;
}

// commit 阶段：指针互换
function commitRoot(root, finishedWork) {
  root.current = finishedWork;  // 原子切换：WIP 变成 current
  // ...
}
```

**关键参数表**：

| 状态 | current 树 | workInProgress 树 |
|---|---|---|
| 初始 | null | 首次 mount 创建 |
| update 阶段 | 上次 commit 的树 | 本次 render 构造中 |
| commit 后 | 本次 render 的树 | 留作下次 update 的 current |

**最佳实践列表**：
- 双缓冲 = 渲染时屏幕不抖动——commit 原子切换
- `fiber.alternate` 字段是关键——所有 diff 都在 alternate 上做
- 内存占用 2x——但相比动画流畅性，可接受
- commit 阶段是同步的——但 commitWork 内部拆分（Mutation / Layout / Passive 三阶段）

### 模式 7：beginWork / completeWork / commitWork 三阶段

**问题场景**：React 16 之前用 Stack Reconciler——同步递归渲染，大组件树卡死主线程。Fiber 把渲染拆为"工作单元"（每个 fiber），配合调度器实现可中断。

**解决方案代码**：

```js
// packages/react-reconciler/src/ReactFiberWorkLoop.js
function performUnitOfWork(unitOfWork) {
  const current = unitOfWork.alternate;
  // 阶段 1: beginWork —— 构造 fiber 子树
  let next = beginWork(current, unitOfWork, renderLanes);
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    // 无子节点 → 进入阶段 2
    next = completeUnitOfWork(unitOfWork);
  }
  return next;
}

function completeUnitOfWork(unitOfWork) {
  // 阶段 2: completeWork —— 向上冒泡，创建 DOM
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;
    // 调用 completeWork：创建 DOM、收集 flags
    completeWork(current, completedWork, renderLanes);
    // 收集子树副作用
    collectSiblingSubtreeFlags(completedWork);
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) return siblingFiber;  // 处理兄弟
    completedWork = returnFiber;
  } while (completedWork !== null);
  // 阶段 3: commitWork —— 应用到真实 DOM
  commitRoot(root, finishedWork);
}
```

**关键参数表**：

| 阶段 | 时机 | 可中断 | 副作用 |
|---|---|---|---|
| beginWork | 向下构造 fiber | ✅ 可中断 | 触发组件 render |
| completeWork | 向上冒泡 | ✅ 可中断 | 创建 DOM、收集 flags |
| commitWork | 提交到屏幕 | ❌ 同步 | 真实 DOM 更新、ref 绑定、effect 调度 |

**最佳实践列表**：
- beginWork + completeWork 是"可中断"——用 `shouldYield()` 检查
- commitWork 是同步的——一旦开始不能中断（避免 UI 撕裂）
- flags 标记位（Update / Placement / Deletion）在 completeWork 阶段累积
- commit 阶段拆分三个子阶段：BeforeMutation → Mutation → Layout

### 模式 8：时间切片与 Scheduler

**问题场景**：浏览器一帧（16.67ms）内既要处理用户输入、动画、JS 执行、网络。如果 React 渲染耗时 >16ms，下一帧就被推迟——UI 卡顿。

**解决方案代码**：

```js
// packages/scheduler/src/Scheduler.js
function shouldYieldToHost() {
  const elapsed = performance.now() - startTime;
  if (elapsed < 5) return false;  // 至少 5ms 工作块
  if (navigationStart !== performance.now() - performance.now()) return true;
  return true;  // 让出主线程
}

function workLoop(hasTimeRemaining, currentTime) {
  let currentTask = peek(taskQueue);
  while (currentTask !== null) {
    if (currentTask.expirationTime > currentTime && (!hasTimeRemaining || shouldYieldToHost())) {
      // 时间到了，让出主线程
      break;
    }
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      currentTask.callback = null;
      const continuation = callback(currentTask.expirationTime <= currentTime);
      if (typeof continuation === 'function') {
        currentTask.callback = continuation;  // 中断后恢复
      } else {
        pop(taskQueue);  // 完成
      }
    } else {
      pop(taskQueue);
    }
    currentTask = peek(taskQueue);
  }
  return currentTask !== null;  // 还有任务
}

// React 19 的 MessageChannel 调度
let scheduleCallback = (callback, options) => {
  let channel = new MessageChannel();
  channel.port2.onmessage = performWorkUntilDeadline;
  channel.port1.postMessage(null);
};
```

**关键参数表**：

| 调度策略 | 描述 | 例子 |
|---|---|---|
| `SyncLane` | 同步（高优） | 用户输入（onChange） |
| `InputContinuousLane` | 持续输入 | 拖拽、滚动 |
| `DefaultLane` | 默认 | 普通 setState |
| `TransitionLane` | 可中断 | useTransition |
| `IdleLane` | 空闲 | 预加载、埋点 |
| `OffscreenLane` | 屏幕外 | OffscreenCanvas / Worker |

**最佳实践列表**：
- 用 `useTransition` 包装"可延迟"更新——避免阻塞用户交互
- 用 `useDeferredValue` 推迟"派生状态"——如搜索过滤
- 大列表用 `react-window` / `react-virtual` 虚拟化——避免 mount 千个节点
- `startTransition(() => setX(x))` 标记"可中断更新"——React 自动调度到下一个空闲周期

### 模式 9：副作用链表与 flags

**问题场景**：commit 阶段要把所有"待更新的 DOM"集中提交。如果每次都遍历整棵树找"哪些 fiber 变了"，O(n²) 复杂度。需要把副作用 fiber 串成链表，commit 时只遍历链表。

**解决方案代码**：

```js
// packages/react-reconciler/src/ReactFiberCompleteWork.js
function completeWork(current, workInProgress, renderLanes) {
  // 冒泡副作用到根
  if (current !== null) {
    workInProgress.dependencies = current.dependencies;
  }
  // 子树有副作用 → 标记自己
  const newFlags = workInProgress.flags | (current !== null ? current.subtreeFlags : NoFlags);
  workInProgress.flags = newFlags;
}

// packages/react-reconciler/src/ReactFiberCommitWork.js
function commitRoot(root, finishedWork) {
  // 找到 first effect
  let firstEffect = finishedWork.firstEffect;
  let lastEffect = finishedWork.lastEffect;
  // 遍历 effect 链表
  let nextEffect = firstEffect;
  while (nextEffect !== null) {
    const flags = nextEffect.flags;
    if (flags & Update) commitHookEffectListUnmount(...);
    if (flags & Placement) commitPlacement(nextEffect);
    if (flags & Deletion) commitDeletion(root, nextEffect);
    nextEffect = nextEffect.nextEffect;  // 链表下一节点
  }
}
```

**关键参数表**：

| flag | 含义 | 何时设置 |
|---|---|---|
| `Placement` | 节点需要插入 | 新建、移动 |
| `Update` | 节点需要更新 | props/state 变化 |
| `Deletion` | 节点需要删除 | 组件 unmount |
| `Ref` | ref 需要绑定/解绑 | ref 变化 |
| `Callback` | useEffect/useLayoutEffect | 副作用钩子 |
| `Passive` | useEffect 调度 | 异步 effect |
| `Snapshot` | useMemo/useCallback 重算 | 派生值变化 |

**最佳实践列表**：
- flags 是位运算标记——32 位最多 31 种副作用
- commit 阶段按"effect 链表"顺序处理——O(变更节点数) 而非 O(整树)
- `useTransition` 标记的更新不阻塞用户输入——通过 TransitionLane
- 性能优化：用 `memo` / `useMemo` / `useCallback` 让 props 引用稳定——减少 Update flag

### 模式 10：调度优先级（lanes 模型）

**问题场景**：用户输入（onChange）必须立即响应，setTimeout 回调可以延迟，预加载可以更晚。如果所有更新都用同一优先级，要么卡顿要么浪费 CPU。

**解决方案代码**：

```js
// packages/react-reconciler/src/ReactFiberLane.js
export const NoLanes = /*            */ 0b0000000000000000000000000000000;
export const SyncLane = /*           */ 0b0000000000000000000000000000010;
export const InputContinuousLane = /**/ 0b0000000000000000000000000001000;
export const DefaultLane = /*        */ 0b0000000000000000000000000100000;
export const TransitionLanes = /*    */ 0b0000000011111111111111110000000;
export const RetryLanes = /*         */ 0b0000111100000000000000000000000;
export const IdleLanes = /*          */ 0b1111000000000000000000000000000;

function mergeLanes(a, b) {
  return a | b;
}

function requestTransitionLane(transition) {
  // 从 TransitionLanes 分配一个空闲位
  const lane = claimNextTransitionLane();
  transitions.forEach((t) => t === transition ? pendingLanes |= lane : null);
  return lane;
}
```

**关键参数表**：

| Lane | 触发场景 | 例子 |
|---|---|---|
| `SyncLane` | 离散事件 | onClick / onChange |
| `InputContinuousLane` | 持续事件 | onScroll / onMouseMove |
| `DefaultLane` | 默认 | setState / useState |
| `TransitionLane` | 过渡 | useTransition |
| `RetryLane` | 错误重试 | Suspense 重试 |
| `IdleLane` | 空闲 | prefetch |

**最佳实践列表**：
- `useTransition` 让 setState 走 TransitionLane——不阻塞用户
- `useDeferredValue` 推迟派生值——如搜索结果过滤
- 多个 setState 自动批处理（v18+）——React 把它们合并到同一 Lane
- `flushSync(() => setX(x))` 强制同步——会阻塞渲染，仅在 DOM 测量时用

---

## 三、Hooks 内存模型与并发

### 模式 11：Hook 链表（memorizedState 串联）

**问题场景**：函数组件没有"实例"概念，但需要"跨多次 render 保持状态"（useState 的值）和"订阅副作用"（useEffect 的清理函数）。React 用 Hook 链表实现"无实例却有状态"。

**解决方案代码**：

```js
// packages/react-reconciler/src/ReactFiberHooks.js
function mountWorkInProgressHook() {
  const hook = {
    memoizedState: null,      // 状态值
    baseState: null,           // 基础状态
    baseQueue: null,           // 待处理更新队列
    queue: null,               // setState 队列
    next: null,                // 下一 hook
  };
  if (workInProgressHook === null) {
    // 第一个 hook：挂在 fiber.memoizedState
    currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
  } else {
    // 后续 hook：接到链表尾
    workInProgressHook = workInProgressHook.next = hook;
  }
  return workInProgressHook;
}

function useState(initialState) {
  const hook = mountWorkInProgressHook();
  hook.memoizedState = hook.baseState = initialState;
  const queue = { pending: null, lanes: NoLanes, dispatch: null };
  hook.queue = queue;
  const dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue, lane);
  queue.dispatch = dispatch;
  return [hook.memoizedState, dispatch];
}

function useEffect(create, deps) {
  const hook = mountWorkInProgressHook();
  hook.memoizedState = pushEffect(HasEffect | Passive, create, deps);
}
```

**关键参数表**：

| Hook | 存储在 hook.memoizedState | 副作用类型 |
|---|---|---|
| `useState` | 当前值 | 无 |
| `useReducer` | reducer 计算值 | 无 |
| `useRef` | `{current: ...}` | 无 |
| `useMemo` | `[value, deps]` | 缓存值 |
| `useCallback` | `[fn, deps]` | 缓存函数 |
| `useEffect` | `Effect` 节点 | 异步副作用 |
| `useLayoutEffect` | `Effect` 节点 | 同步副作用 |
| `useTransition` | `[isPending, start]` | 并发标记 |

**最佳实践列表**：
- hooks 顺序必须稳定——不能写在 if / for 里
- React 用 hook 链表的下标 = 调用顺序，每次 render 按顺序匹配
- 条件 hook 错误用 `eslint-plugin-react-hooks` 检测
- 自定义 hook 提取"有状态逻辑"——本质是把 hook 链表段提取出来复用
- React 19 的 `use()` hook 接受 Promise / Context——可写在 if 里

### 模式 12：Dispatcher 切换（render / commit 阶段）

**问题场景**：同一 hook 函数（如 `useState`）在 mount 和 update 时行为不同。React 用 `ReactCurrentDispatcher` 全局变量在 mount / update / rerender 三种上下文切换 hook 实现。

**解决方案代码**：

```js
// packages/react-reconciler/src/ReactFiberHooks.js
const HooksDispatcherOnMount = {
  useState: mountState,
  useEffect: mountEffect,
  useRef: mountRef,
  useMemo: mountMemo,
  useCallback: mountCallback,
  // ...
};

const HooksDispatcherOnUpdate = {
  useState: updateState,
  useEffect: updateEffect,
  useRef: updateRef,
  useMemo: updateMemo,
  useCallback: updateCallback,
  // ...
};

function renderWithHooks(current, workInProgress, Component, props, secondArg) {
  // 切换 dispatcher
  ReactCurrentDispatcher.current = (current === null || current.memoizedState === null)
    ? HooksDispatcherOnMount
    : HooksDispatcherOnUpdate;

  // 渲染组件
  const children = Component(props, secondArg);

  // 切回（避免泄漏）
  ReactCurrentDispatcher.current = ContextOnlyDispatcher;
  return children;
}

function useState(initialState) {
  // 根据当前 dispatcher 走 mount 或 update
  return ReactCurrentDispatcher.current.useState(initialState);
}
```

**关键参数表**：

| Dispatcher | 触发时机 | 行为 |
|---|---|---|
| `HooksDispatcherOnMount` | 首次渲染 | 初始化 hook 链表 |
| `HooksDispatcherOnUpdate` | 后续渲染 | 复用 hook 链表，diff deps |
| `HooksDispatcherOnRerender` | useReducer 强制重渲染 | 类似 update |
| `ContextOnlyDispatcher` | 组件外部调用 hook | 抛 "Invalid hook call" 错误 |

**最佳实践列表**：
- hook 只能在 React 函数组件 / 自定义 hook 中调用——其他位置抛错
- `ContextOnlyDispatcher` 是安全网——保证 hook 不会在异步/事件处理器里调用
- 业务代码不应直接 import dispatcher——`useState` 是稳定 API
- 测试 hook 用 `renderHook` from `@testing-library/react`——自动提供 dispatcher

### 模式 13：useEffect 时机（commit 后异步执行）

**问题场景**：副作用（数据请求、订阅、DOM 操作）应该在"页面更新后"执行，但放在 render 函数里会阻塞渲染。React 用 useEffect 标记"commit 后才执行"。

**解决方案代码**：

```jsx
function ProfilePage({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchUser(userId).then((data) => {
      if (!cancelled) setUser(data);
    });
    return () => { cancelled = true; };  // 清理：下个 effect 前 / 组件卸载
  }, [userId]);  // 依赖：userId 变才重跑

  return <div>{user?.name}</div>;
}

// 阶段拆解：
// 1. render 阶段：调用 useEffect，但 create 函数不执行
// 2. commit 阶段：DOM 更新到屏幕
// 3. passive effects 阶段：useEffect 的 create 函数执行
// 4. cleanup 阶段：上次的 cleanup 执行
```

**关键参数表**：

| 钩子 | 时机 | 是否阻塞渲染 |
|---|---|---|
| `useLayoutEffect` | commit 后、浏览器绘制前 | ✅ 阻塞（同步） |
| `useEffect` | commit 后、浏览器绘制后 | ❌ 异步 |
| `useInsertionEffect` | commit 中、DOM 节点创建后 | ✅ 阻塞（CSP 注入） |
| `useEffectEvent` | 任意时机调用 | 不会触发额外渲染 |

**最佳实践列表**：
- 默认用 `useEffect`——大多数副作用（请求、订阅）适用
- 涉及 DOM 测量（`getBoundingClientRect`）用 `useLayoutEffect`——避免闪烁
- CSS-in-JS 用 `useInsertionEffect`——保证样式在 DOM 渲染前注入
- 清理函数必须 return——避免内存泄漏（订阅、定时器）
- 依赖数组 `[userId]` 必须包含所有外部引用——ESLint 规则自动检测

### 模式 14：useTransition 与 useDeferredValue

**问题场景**：大列表过滤（输入 1k+ 条数据 → 重渲染 10k 节点）会卡 UI。需要"标记这个更新可以延迟"——用户能继续输入，UI 不卡。

**解决方案代码**：

```jsx
function SearchPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    setInput(e.target.value);  // 同步：控制输入响应
    startTransition(() => {
      setQuery(e.target.value);  // 异步：可中断
    });
  }

  const results = useMemo(() => filterData(data, query), [data, query]);
  return (
    <>
      <input value={input} onChange={handleChange} />
      {isPending ? <Spinner /> : <ResultsList data={results} />}
    </>
  );
}

// useDeferredValue：自动推迟派生值
function App({ query }) {
  const deferredQuery = useDeferredValue(query);
  // deferredQuery 滞后于 query，但用户输入不卡
  const results = useMemo(() => filterData(data, deferredQuery), [data, deferredQuery]);
  return <ResultsList data={results} />;
}
```

**关键参数表**：

| Hook | 用途 | 阻塞 UI |
|---|---|---|
| `useTransition` | 标记"可中断更新" | ❌ 不阻塞 |
| `useDeferredValue` | 滞后派生值 | ❌ 不阻塞 |
| `useSyncExternalStore` | 订阅外部 store | 视实现而定 |

**最佳实践列表**：
- 大列表/树/虚拟滚动用 `useTransition`——保持输入响应
- 复杂计算（搜索过滤、图表）用 `useDeferredValue`——避免派生值卡渲染
- `isPending` 配合 Suspense fallback——给用户"加载中"反馈
- React 19 简化：`useTransition` 不再需要 `startTransition` 调用——直接传函数

### 模式 15：React Server Components（RSC）序列化

**问题场景**：传统 SSR 把整个组件树渲染为 HTML + hydration 重新执行所有组件。RSC 区分"server-only"和"client"组件——server 组件只渲染一次，结果序列化传到 client，避免 hydration 重复。

**解决方案代码**：

```jsx
// app/PostList.server.js —— 在 server 端运行
import { db } from './db';

export default async function PostList() {
  const posts = await db.posts.findMany();  // 直接 await，不需要 useEffect
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}><a href={`/post/${p.id}`}>{p.title}</a></li>
      ))}
    </ul>
  );
}

// app/PostList.client.js —— client 组件
'use client';
import { useState } from 'react';

export default function PostList({ posts }) {
  const [filter, setFilter] = useState('');
  return <ClientList posts={posts} filter={filter} onChange={setFilter} />;
}

// 父组件（默认是 server component）
import ServerList from './PostList.server';
import ClientList from './PostList.client';

export default function App() {
  return (
    <div>
      <ServerList />           {/* server-only，序列化 RSC payload */}
      <ClientList posts={...} /> {/* client，hydration 接管 */}
    </div>
  );
}
```

**关键参数表**：

| 组件类型 | 渲染时机 | 能否用 useState | 能否用 fs/db |
|---|---|---|---|
| Server Component | 仅 server | ❌ | ✅ |
| Client Component | server + client | ✅ | ❌（除非 API） |
| Shared Component | 两者皆可 | ❌（无状态） | ❌ |

RSC payload 格式（v19 稳定）：
```
M1:{"id":"./PostList.js","chunks":["abc"],"name":"default"}
J0:["$","div",null,{"children":[["$","ul",null,{"children":[...]}]]}]
```

**最佳实践列表**：
- RSC 默认组件就是 server component——不写 `'use client'`
- 数据获取移到 server——不再 useEffect fetch
- 客户端交互（onClick、useState）必须用 client component
- 第三方组件（react-hook-form、framer-motion）需要 `'use client'` 包装
- v19 起 RSC 稳定——Next.js 13+ / Remix / Waku 全面支持

---

## 四、工程实践与现代演进

### 模式 16：JSX 编译细节与新 JSX Runtime

**问题场景**：传统 JSX 编译为 `React.createElement(...)`——所有文件必须 `import React`，且 createElement 函数路径冗长（`react.createElement`）。React 17+ 引入新 JSX runtime——直接 import 编译后的辅助函数。

**解决方案代码**：

```jsx
// 老 runtime（17-）
import React from 'react';
const el = <div className="x">hello</div>;
// 编译为：React.createElement("div", {className:"x"}, "hello")
// 必须 import React

// 新 runtime（17+）
// 不用 import React
const el = <div className="x">hello</div>;
// 编译为：
import { jsx as _jsx } from "react/jsx-runtime";
_jsx("div", { className: "x", children: "hello" });
// 用 jsxs 处理多 children（数组）
import { jsxs as _jsxs } from "react/jsx-runtime";
_jsxs("div", { children: [_jsx("h1", { children: "hi" })] });
```

**关键参数表**：

| runtime | 来源 | 文件 | 体积 |
|---|---|---|---|
| `classic` | `react` | 间接从 `React.createElement` 拿 | 略大 |
| `automatic` | `react/jsx-runtime` | 直接 export `jsx/jsxs` | 小 20% |

**最佳实践列表**：
- 新项目用 `automatic` runtime——Babel `@babel/preset-react` 的 `runtime: 'automatic'`
- 旧项目升级：设 `runtime: 'automatic'` 即可，无需手动 import React
- `jsx` 是单子节点，`jsxs` 是多子节点（数组）——React 区分以优化
- 自定义 JSX 工厂：`<MyDiv>` 编译为 `_jsx(MyDiv, ...)`——用 `<>...</>` 短语法

### 模式 17：合成事件系统

**问题场景**：原生 DOM 事件 API 不统一（`e.target` / `e.srcElement`）、冒泡行为在不同浏览器有差异。React 用"合成事件"统一——所有 onClick/onChange 接收 SyntheticEvent，跨浏览器一致。

**解决方案代码**：

```jsx
function Button() {
  function handleClick(e) {
    // e 是 SyntheticEvent，跨浏览器一致
    console.log(e.type);        // "click"
    console.log(e.target);      // DOM 节点
    console.log(e.nativeEvent); // 原生 MouseEvent
    e.stopPropagation();        // 阻止冒泡（合成层）
  }
  return <button onClick={handleClick}>Click</button>;
}

// 事件委托
// react-dom-bindings/src/events/DOMPluginEventSystem.js
const rootContainerElement = ...;
rootContainerElement.addEventListener('click', dispatchEvent, { capture: false });
// 所有 onClick 委托到 root container 处理
```

**关键参数表**：

| 事件 | 触发时机 | 冒泡 |
|---|---|---|
| onClick | 鼠标点击 | ✅ |
| onChange | 输入变化（input/select/textarea） | ✅ |
| onSubmit | 表单提交 | ✅ |
| onKeyDown / onKeyUp | 键盘 | ✅ |
| onFocus / onBlur | 焦点 | ❌（用 focusin/focusout 委托） |
| onMouseEnter / onMouseLeave | 鼠标进出 | ❌（不进/出另算） |
| onScroll | 滚动 | ✅（passive） |

**最佳实践列表**：
- 合成事件统一了浏览器差异——开发体验一致
- React 17+ 事件委托到 root container——不再 document 级委托
- onChange 行为统一为"每次值变化"——不像 onInput 那样区分 input vs change
- 性能优化：onClick 加 throttle/debounce 避免渲染抖动
- 阻止冒泡用 `e.stopPropagation()`——只在合成层生效

### 模式 18：Suspense 与流式 SSR

**问题场景**：传统 SSR 等所有数据 ready 才返回 HTML，TTFB 高。Suspense 让"慢的部分"异步流式到达——首屏先出来，剩下"挂起"部分后到。

**解决方案代码**：

```jsx
// app/feed/page.js
import { Suspense } from 'react';
import Posts from './Posts';  // 异步组件
import Comments from './Comments';

export default function Feed() {
  return (
    <>
      <h1>Feed</h1>
      <Suspense fallback={<Spinner />}>
        <Posts />  {/* 数据请求中，先显示 Spinner */}
      </Suspense>
      <Suspense fallback={<Spinner />}>
        <Comments />  {/* 独立加载，独立 fallback */}
      </Suspense>
    </>
  );
}

// 异步组件（server component）
async function Posts() {
  const posts = await db.posts.findMany();  // 慢
  return <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

**关键参数表**：

| Suspense 边界 | 触发条件 | fallback |
|---|---|---|
| 数据未就绪 | throw Promise（lazy / fetch） | 渲染 fallback |
| 错误边界 | throw Error | 错误 UI |
| 嵌套 | 子组件可嵌套 Suspense | 独立 fallback |

`renderToPipeableStream`（流式 SSR）：

```js
import { renderToPipeableStream } from 'react-dom/server';
const { pipe, abort } = renderToPipeableStream(<App />, {
  bootstrapScripts: ['/main.js'],
  onShellReady() {  // 初次 HTML 准备好
    response.pipe(pipe);
  },
  onAllReady() {  // 所有 Suspense 解析后
    response.write(finalHtml);
    response.end();
  },
});
```

**最佳实践列表**：
- 多个独立 Suspense 边界——每个慢部分独立 fallback
- 不嵌套过深——2-3 层即可，否则 fallback 嵌套复杂
- onShellReady 早返回首屏；onAllReady 全加载完——前者 SEO 友好，后者更稳定
- 错误边界用 ErrorBoundary 类组件或 `react-error-boundary` 库
- 客户端 hydration 配合 `use()` hook 读取 server promise

### 模式 19：React Compiler（自动 memoization）

**问题场景**：手动 `useMemo` / `useCallback` 容易写错（依赖数组遗漏），且性能优化心智负担重。React Compiler（Babel 插件）自动分析组件依赖，按需 memoize。

**解决方案代码**：

```jsx
// 源码（开发者写"朴素"代码）
function ExpensiveComponent({ items, onClick }) {
  const filtered = items.filter(x => x.active);
  return (
    <div>
      {filtered.map(item => <Row key={item.id} item={item} onClick={onClick} />)}
    </div>
  );
}

// React Compiler 编译产物（伪代码）
function ExpensiveComponent(props) {
  const $ = useMemoCache(props);
  const items = $.get('items');
  const onClick = $.get('onClick');
  const filtered = useMemo(() => items.filter(x => x.active), [items]);
  return ...
}
```

**关键参数表**：

| 编译优化 | 等价手动代码 | 适用场景 |
|---|---|---|
| 自动 memo | `useMemo` | 派生值、过滤、计算 |
| 自动 callback | `useCallback` | 传给子组件的函数 |
| 自动 fragment hoist | `useMemo` 数组 | 返回 JSX 列表 |
| 跳过常量 | 普通赋值 | 静态字面量 |

**最佳实践列表**：
- v19+ GA：装 `babel-plugin-react-compiler` 自动启用
- 业务代码不再需要手动 `useMemo` / `useCallback`——Compiler 自动做
- 性能提升：组件跳过不必要的 re-render——无需手写 `React.memo`
- 反模式：手动 memo + Compiler 同时用——可能过度优化
- Compiler 依赖"组件纯函数"——有副作用的代码要放在 useEffect

### 模式 20：性能优化与 DevTools

**问题场景**：组件多、状态复杂时性能问题难定位。需要可视化工具看"哪个组件渲染了"、"为什么渲染"、"渲染耗时多少"。

**解决方案代码**：

```jsx
// 1. React.memo：浅比较 props
const Row = React.memo(function Row({ item, onClick }) {
  return <div onClick={() => onClick(item.id)}>{item.name}</div>;
});

// 2. useMemo：缓存派生值
const filtered = useMemo(() => items.filter(x => x.active), [items]);

// 3. useCallback：稳定函数引用
const handleClick = useCallback((id) => doSomething(id), [doSomething]);

// 4. 列表 key 稳定
items.map(item => <Row key={item.id} item={item} />);

// 5. 虚拟列表（react-window）
import { FixedSizeList } from 'react-window';
<FixedSizeList height={600} itemCount={10000} itemSize={35}>
  {({ index, style }) => <div style={style}>Row {index}</div>}
</FixedSizeList>

// 6. Profiler API（性能测量）
import { Profiler } from 'react';
<Profiler id="App" onRender={(id, phase, actualDuration) => {
  console.log(`${id} ${phase} took ${actualDuration}ms`);
}}>
  <App />
</Profiler>
```

**关键参数表**：

| 工具 | 用途 | 解决 |
|---|---|---|
| React DevTools | 组件树 + 状态检查 | "为什么 re-render" |
| Profiler API | 性能测量 | "渲染耗时多少" |
| Why Did You Render | 冗余 re-render 警告 | "不必要的渲染" |
| `React.memo` | props 浅比较 | "父更新子不更新" |
| `useMemo` / `useCallback` | 缓存值/函数 | "引用稳定" |
| 虚拟列表 | 大列表优化 | "渲染 10k 项" |

**最佳实践列表**：
- 默认不要优化——先 measure 再优化
- `React.memo` 用于"纯展示组件"——父更新频繁时跳过 re-render
- 列表必须用稳定 key——`item.id` 优于 `index`
- 10k+ 节点用虚拟列表——`react-window` / `react-virtual` / `@tanstack/react-virtual`
- Profiler API 上报到 Sentry / DataDog——线上性能监控
- React Compiler 普及后大部分手动优化不再需要

---

## 附：仓库元信息

- **路径**：`G:\实战案例\GitHub顶尖项目\react\`
- **大小**：约 200MB（含 git 历史）
- **总文件**：~7000
- **核心包**：`react` / `react-reconciler` / `react-dom` / `scheduler` / `react-server`
- **锁定 commit**：v19.x（2025+）
- **学习入口**：先读 `packages/react`（hooks API）→ `packages/react-reconciler/src/ReactFiberWorkLoop.js`（调度循环）→ `ReactFiberHooks.js`（hook 链表）→ `ReactFiberCommitWork.js`（commit 阶段）→ `packages/react-dom-bindings`（DOM 绑定）

## 一句话总结

React 用"声明式 + 虚拟 DOM + 单向数据流"重新定义 UI 范式，用 Fiber 协调器 + 双缓冲 + Scheduler 把"渲染"拆为可中断、可调度的工作单元。核心洞察：把组件视为"状态到 UI 的纯函数"，让 useState/useEffect 等 hooks 链表模拟"类组件实例状态"；用 Reconciler 与 Renderer 解耦，让同一协调器支持 web/native/3D/PDF；v19 的 Server Components 把"数据获取"从客户端搬到服务端，告别 useEffect 异步瀑布。
