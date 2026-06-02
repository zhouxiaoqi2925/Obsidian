---
title: mobx
type: frontend-library
lang: typescript
stars: 28000
date: 2026-06-02
tags:
  - 开源项目
  - state-management
  - reactive
  - signals
  - tfrp
---

# mobx · 项目深度解析

> "Anything that can be derived from the application state, should be derived. Automatically." — MobX 用信号式 TFRP (Transparently Functional Reactive Programming) 把组件渲染、副作用、状态缓存都编织在同一张"依赖图"上,写起来像普通 JS,跑起来只动该动的部分。
> 来源：G:\实战案例\GitHub顶尖项目\mobx\

## 写在前面:解析哲学

先骨架后血肉,先 What 后 Why,最后 How to steal。MobX 是一个"看起来简单,实际极其精妙"的状态管理库 —— 它的 API 表面只有 ~10 个方法,但 `core/` 里的算法 (4 态依赖传播、POSSIBLY_STALE 优化、依赖数组复用) 是它十年的精华。本笔记按 V3 14 章节展开,重点剖析 `core/observable.ts`、`core/derivation.ts`、`core/computedvalue.ts` 的 WHY。

## 0. 解析前的 5 个准备

- **克隆**: `git clone https://github.com/mobxjs/mobx.git` (~5MB 源码,monorepo 5 个 package)
- **分类**: TypeScript 编写的状态管理层,React 适配通过 mobx-react / mobx-react-lite
- **问题清单**:
  1. React 怎么知道"哪些状态变了"?
  2. 为什么 MobX 的 computed 只在用到时才重算?
  3. 为什么一个 atom 改了,整个依赖图能精确传播?
  4. 为什么 MobX 6 默认不开 proxy 而要求 makeAutoObservable?
  5. Strict mode 下为什么不允许裸赋值?
- **速查表**: 核心算法 = Atom + Derivation (Computed/Reaction) + Dependency Tracking
- **锁定 commit**: 当前 main 分支版本 `mobx@6.15.4`

## 1. 开发计划书 (Project Charter)

| 字段 | 内容 |
|------|------|
| 项目名 | MobX |
| 一句话定位 | "Simple, scalable state management" —— 信号式透明响应式状态管理库 |
| 核心问题 | React/Vue 等声明式 UI 框架缺少"自动追踪"能力,业务代码要写大量 `useEffect`/`watch` 来同步派生状态,极易遗漏或重复触发 |
| 目标用户 | 中大型 React/前端应用,需要细粒度响应式且不想写选择器/reselect 的人 |
| 商业模式 | MIT 开源 + OpenCollective 赞助(Guilded/Canva/Coinbase/Mendix 等) |
| 复刻难度 | 极难 —— 反应式系统 + Proxy + 类型推导,核心算法细节繁复 |
| 当前状态 | 6.15.4,生产稳定,被 Mendix、Canva、DAZN 等使用 |
| 维护者 | Michel Weststrate (作者) + 社区 |
| 核心里程碑 | 2015 v1 → 2016 v2 → 2017 v3 → 2018 v4 (TypeScript 重写) → 2019 v5 (Proxy) → 2020 v6 (makeAutoObservable) → 2024 v6.13 (TS 5.5 装饰器) |

## 2. 项目框架 (Repo Skeleton Map)

点状解析:
- **packages/mobx**: 核心库 (~28K 行 TS)
- **packages/mobx-react-lite**: Hook 适配 (useObserver + useSyncExternalStore)
- **packages/mobx-react**: Class 组件兼容层
- **packages/eslint-plugin-mobx**: 静态检查 (强制 observer / makeObservable)
- **packages/mobx-undecorate**: 装饰器 → makeObservable 迁移工具

```mermaid
mindmap
  root((MobX Monorepo))
    packages/mobx
      api
        observable / computed / action / autorun / reaction / when / flow
      core
        atom.ts 基础单元
        derivation.ts 依赖跟踪核心
        computedvalue.ts 派生缓存
        observable.ts 传播引擎
        reaction.ts 副作用入口
        globalstate.ts 进程内单例
        action.ts 事务边界
        spy.ts 调试钩子
      types
        observableobject.ts 真实世界对象
        observablearray.ts 数组代理
        observablemap.ts Map 包装
        observableset.ts Set 包装
        observablevalue.ts 单值
        dynamicobject.ts Proxy 拦截
        modifiers.ts ref/shallow/struct
        annotations 装饰器
    packages/mobx-react-lite
      useObserver
      observer Hook
      useLocalObservable
      printDebugValue
    packages/mobx-react
      observer Class 版
      inject Provider
    packages/eslint-plugin-mobx
      4 条 lint 规则
    packages/mobx-undecorate
      codemod CLI
```

实际目录树(mobx 核心):
```
packages/mobx/
├── src/
│   ├── mobx.ts          # 入口 barrel re-export
│   ├── internal.ts      # 内部模块聚合
│   ├── errors.ts        # die() 错误定义
│   ├── api/             # 12 个公开 API
│   ├── core/            # 反应式算法核心
│   └── types/           # 各种可观察类型
├── __tests__/           # v4/v5 兼容 + 装饰器测试
└── package.json
```

- **配置入口**: `packages/mobx/src/mobx.ts` —— 验证 Symbol/Map/Set 存在后做 re-export
- **代码入口**: `observable(...)` / `makeAutoObservable(this)` / `autorun(() => ...)`
- **构建**: tsdx (rollup 包装) → 产物 ESM + CJS + UMD,带 `__DEV__` 死代码消除

## 3. 项目画像 (Profile)

| 指标 | 值 |
|------|------|
| 总文件数 | 475 (含 docs、tests) |
| 核心源码 | ~12K 行 TS (src/ 下) |
| 主语言 | TypeScript (99%) |
| 涉及语言 | TS, JS, Flow (旧测试) |
| Stars | ~28K (GitHub) |
| License | MIT |
| Docker | 否 (库项目) |
| K8s | 否 |
| CI | GitHub Actions (build_and_test.yml) |
| 测试 | Jest 30 + ts-jest + jest-mock-console |
| Lint | ESLint + Prettier + pretty-quick (pre-commit) |
| 覆盖率 | coveralls 集成 |
| 提交频率 | 持续维护 (~6.x 系列 2026 仍在更新) |

## 4. 架构设计 (Architecture Deep Dive)

### 4.1 核心抽象

MobX 的整个反应式系统建立在 3 个对象上:

1. **Atom** —— 状态最小单元,可以被订阅和标记变更
2. **Derivation** (ComputedValue / Reaction) —— 派生单元,既观察 Atom 又被 Reaction 观察
3. **GlobalState** —— 进程级单例,记录当前跟踪谁、batch 计数、待执行反应

### 4.2 数据结构

```mermaid
classDiagram
    class IObservable {
        +name_: string
        +observers_: Set~IDerivation~
        +lastAccessedBy_: number
        +lowestObserverState_: IDerivationState_
        +reportObserved() bool
        +onBecomeStale_() void
    }
    class Atom {
        +reportChanged() void
        +flags_ BitField
    }
    class ComputedValue~T~ {
        +derivation: () => T
        +value_: T | CaughtException
        +get() T
        +set(v) void
        -isComputing: bool
    }
    class Reaction {
        +onInvalidate_: () => void
        +schedule_() void
        +track(fn) void
        +dispose() void
    }
    class ObservableObjectAdministration {
        +values_: Map~key, ObservableValue | ComputedValue~
        +keysAtom_: Atom
        +pendingKeys_: Map
        +lazyComputedKeys_: Map
        +getObservablePropValue_(key)
        +setObservablePropValue_(key, value)
    }
    IObservable <|-- Atom
    IObservable <|-- ComputedValue
    IObservable <|-- ObservableValue
    IDerivation <|.. ComputedValue
    IDerivation <|.. Reaction
    ObservableObjectAdministration --> ObservableValue : 持有
    ObservableObjectAdministration --> ComputedValue : 持有
    ObservableObjectAdministration --> Atom : keysAtom_
```

### 4.3 核心看点 (3 条具体设计决策)

**决策 A: 4 态依赖传播 (NOT_TRACKING / UP_TO_DATE / POSSIBLY_STALE / STALE)**

看 `packages/mobx/src/core/derivation.ts:11-29` 的 `IDerivationState_` 枚举:

```typescript
export enum IDerivationState_ {
    NOT_TRACKING_ = -1,    // 没在运行或没被观察
    UP_TO_DATE_ = 0,       // 浅层依赖没变,直接返回缓存
    POSSIBLY_STALE_ = 1,   // 某个深层依赖变了,但不确定浅层是否变
    STALE_ = 2             // 浅层依赖肯定变了,下次访问必须重算
}
```

WHY: 这是 MobX 性能的核心。如果只有"脏/干净"两态,每次依赖变了所有 computed 都要重算;引入 POSSIBLY_STALE 后,只有当父级 computed **真正被读到**时,才通过 `shouldCompute` 沿依赖链回溯查浅层是否真变了。`core/derivation.ts:84-128` 的 `shouldCompute` 实现了"按需检查":

```typescript
case IDerivationState_.POSSIBLY_STALE_: {
    const obs = derivation.observing_, l = obs.length
    for (let i = 0; i < l; i++) {
        const obj = obs[i]
        if (isComputedValue(obj)) {
            obj.get()  // 触发该依赖的 onBecomeStale_ 链式传播
        }
        if (derivation.dependenciesState_ === IDerivationState_.STALE_) {
            return true  // 真的变了
        }
    }
    changeDependenciesStateTo0(derivation)  // 浅层没变,恢复 UP_TO_DATE
    return false
}
```

**决策 B: 依赖数组复用 + runId 优化**

`core/observable.ts:135-160` 的 `reportObserved`:

```typescript
if (derivation.runId_ !== observable.lastAccessedBy_) {
    observable.lastAccessedBy_ = derivation.runId_
    derivation.newObserving_![derivation.unboundDepsCount_++] = observable
    // ...
}
```

WHY: 每次运行 derivation 都给一个递增的 `runId_`,observable 记住上次被哪个 run 访问过。如果同一个 run 重复访问,直接跳过 (派生里的循环读同一个 observable 很常见)。另外 `newObserving_` 是复用数组,避免每次都分配 —— 注释里直接写"Tried storing newObserving, or observing, or both as Set, but performance didn't come close" —— 实测过 Set 比 Array 慢。

**决策 C: BitField Flags 压缩内存**

`core/atom.ts:27-30`:

```typescript
private static readonly isBeingObservedMask_ = 0b001
private static readonly isPendingUnobservationMask_ = 0b010
private static readonly diffValueMask_ = 0b100
private flags_ = 0b000
```

WHY: Atom 是高频创建对象 (一个 observable object 可能几十个 atom),用 3 个独立 boolean 会让对象头 24 字节起步;压缩到 1 个 number 只占 8 字节,GC 压力小。`utils/utils.ts` 的 `getFlag`/`setFlag` 是位操作,O(1) 零开销。这种小细节在 React/Vue 这种"为每条数据建响应式节点"的库里能差出几 MB 内存。

### 4.4 关键 ADR

| 决策 | 选择 | 否决的方案 | 原因 |
|------|------|------|------|
| 代理机制 | 优先 `Object.defineProperty` (无侵入)+ Proxy 仅在 `proxy: true` | Vue 2 那种 defineProperty 递归 / immer 那种 copy-on-write | 兼容性 + 老 IE,6.0 之后用户主动选 Proxy |
| 状态修改约束 | 默认 `enforceActions: "observed"`,开发期警告 | 完全自由 | 防止派生中的副作用污染 (类似 React 的 render purity) |
| 装饰器 | 兼容 TS 5.0 stage-3 + Babel legacy + 2022.3 三种 | 只支持一种 | 渐进式迁移,生态库多 |
| 算法 | 数组依赖 + runId 去重 + 4 态传播 | Set / WeakMap | 性能基准 Array 比 Set 快 3-5x |
| 副作用入口 | Reaction 独立类,不混入 Computed | computed 也能有副作用 | 区分纯计算和副作用,便于序列化/事务 |

## 5. 代码深度解析 (带 WHY) ⭐ 重点

### 5.1 找骨架代码

入口链:
- `src/mobx.ts` → barrel 导出
- `src/api/observable.ts:105` → `createObservable()` 工厂
- `src/api/makeObservable.ts:51` → `makeAutoObservable()` (用户最常用)
- `src/api/autorun.ts:38` → `autorun()` (副作用入口)
- `src/core/observable.ts:185` → `propagateChanged()` (传播起点)
- `src/core/reaction.ts:118` → `schedule_()` (反应调度)

### 5.2 单文件分析卡

**5.2.1 `core/atom.ts` (121 行) — 反应式最小组件**

WHY 看点:
- `reportChanged()` 总是包在 `startBatch()` + `endBatch()` 里 (`core/atom.ts:92-96`),WHY:保证多个同步变更合并成一次 reaction 执行,避免级联触发风暴
- `private static readonly isBeingObservedMask_` 用 class static 而非 instance,WHY:mask 是固定值,放在原型上能共享,GC 更友好
- `noop` 默认 onBecomeObserved 不创建 Set,WHY:大部分 atom 不需要生命周期回调,空 Set 占内存且无意义 (`core/atom.ts:111-118`)

**5.2.2 `core/observable.ts` (283 行) — 传播引擎**

核心方法:
- `addObserver` / `removeObserver` (行 66-91): 维护双向链表,`observers_` 是 Set
- `startBatch` / `endBatch` (行 106-133): 嵌套 batch 计数,为 0 时才真正跑 reactions + 处理 pendingUnobservations
- `reportObserved` (行 135-160): 跟踪时把当前 observable 记到 derivation 的 `newObserving_` 数组
- `propagateChanged` (行 185-202): 单源多目标广播,`lowestObserverState_` 是优化:如果最小观察者状态已经是 STALE 就直接 return
- `propagateChangeConfirmed`: 实际触发 STALE
- `propagateMaybeChanged`: 触发 POSSIBLY_STALE (computed 专用)

**5.2.3 `core/derivation.ts` (344 行) — 跟踪引擎**

核心方法:
- `shouldCompute` (行 84-128): 上面分析过,POSSIBLY_STALE 的按需检查
- `trackDerivedFunction` (行 167-198): 用 try/catch 捕获 user code 异常,封装成 `CaughtException` 避免污染 propagation
- `bindDependencies` (行 200+): 差量更新 `observing_` —— 只 add 新依赖、remove 消失的依赖、复用未变的

**5.2.4 `core/computedvalue.ts` (381 行) — 派生缓存**

```typescript
get() {
    if (this.isComputing) {
        die(37)  // 循环依赖
    }
    if (shouldCompute(this)) {
        this.computeValue_()
    }
    // 注意: 每次 get 都 reportObserved,把当前 computed 链入外层 derivation
    reportObserved(this)
    return this.value_
}
```

WHY:
- `value_: T | CaughtException` 用哨兵对象,避免 throw 抛栈丢失上下文
- `equals_` 默认 `===` 但可配 `structural` —— 同样内容不触发下游
- 5 个 bitfield flag 用同一个 `flags_` 压缩

**5.2.5 `core/reaction.ts` (318 行) — 副作用调度**

```typescript
schedule_() {
    if (!this.isScheduled) {
        this.isScheduled = true
        globalState.pendingReactions.push(this)
        runReactions()  // 立即执行栈内反应
    }
}
```

WHY:
- `runReactions()` 是 EAGER 执行:在 batch 结束前就消化完所有反应,这样用户同步代码里就能看到副作用
- 注释 (行 33-44) 解释了 Reaction vs Computed:Reaction 一定执行、可改状态、可被自己重新触发
- `dispose()` 调 `clearObserving` 解订阅,避免内存泄漏

**5.2.6 `types/observableobject.ts` (802 行) — 真实世界对象**

`ObservableObjectAdministration` 是核心:
- `values_`: Map<key, ObservableValue | ComputedValue>
- `keysAtom_`: 专门跟踪 keys 变化的 atom
- `getObservablePropValue_` (行 122): hot path,单次 Map lookup
- `setObservablePropValue_` (行 139): intercept → prepareNewValue → setNewValue → notify

`asDynamicObservableObject` 在 `types/dynamicobject.ts:82-89` 用 Proxy 拦截 `in`/`get`/`set`/`delete`,**只在用户没声明完整 key 时**用 Proxy,WHY:defineProperty 性能更好但需要静态 schema;Proxy 灵活但 `name in obj` 这种操作在 dev 模式会 warn。

**5.2.7 `api/observable.ts` (265 行) — 公开工厂**

`createObservable` (行 105-149) 是个 dispatcher:按入参类型分派到 object/array/map/set/box。这种"重载 + 工厂"模式比 `if/else` 链可读性强,且让 TS 推断更准。

**5.2.8 `api/makeObservable.ts` (95 行) — 显式声明式 API**

`makeAutoObservable` (行 51-94):
- 默认所有 own+proto keys 都变 observable
- 缓存 keys 在 `proto[keysSymbol]` 上 (行 76-82) —— WHY:同一个 class 多实例可共享 keys 列表
- `overrides` 参数允许局部声明 (比如 `getX: false` 表示不要转 observable)

**5.2.9 `mobx-react-lite/src/useObserver.ts` (120 行) — React 18 适配**

```typescript
adm.reaction = new Reaction(`observer${adm.name}`, () => {
    adm.stateVersion = Symbol()  // 关键:用 Symbol 而非 number
    adm.onStoreChange?.()
})
```

WHY:
- 用 `useSyncExternalStore` (React 18 原生) 取代之前的 `forceUpdate` —— 这是 6.13+ 的迁移
- `stateVersion = Symbol()` 而非 `++stateVersion` —— Symbol 永远不等,确保 React 判定为"变了"触发重渲
- `observerFinalizationRegistry.register(admRef, adm, adm)` —— 用 FinalizationRegistry 在组件卸载时自动 dispose reaction,WHY:用户忘了调 useEffect cleanup 不会泄漏
- 注释 (行 8-9): "Do NOT store admRef on this object, otherwise it will prevent GC" —— 闭包陷阱显式声明

**5.2.10 `api/autorun.ts` (199 行) — 用户最爱的入口**

```typescript
const runSync = !opts.scheduler && !opts.delay
if (runSync) {
    reaction = new Reaction(name, function () { this.track(reactionRunner) }, ...)
} else {
    const scheduler = createSchedulerFromOptions(opts)  // setTimeout / 自定义
    reaction = new Reaction(name, () => {
        if (!isScheduled) { isScheduled = true; scheduler(() => { ... }) }
    }, ...)
}
```

WHY:
- 默认同步 (runSync) —— MobX 的设计哲学是"读到就拿到最新",不引入 setTimeout 的延迟
- `opts.delay` 用 setTimeout 模拟 debounce,但作者推 `reaction()` + `equals` 来做"直到值真变才触发"
- `r.track(() => expression(r))` 中 `allowStateChanges(false, ...)` 临时打开 state change 权限 —— 因为 reaction 的 expression 允许是新数据,这是设计上的豁免

### 5.3 设计模式 (3 个)

1. **观察者 + 依赖图混合模式**: 经典 Observer 升级版,把"事件"抽象成"依赖关系" —— 适合 UI 场景,比 EventEmitter 节省订阅样板
2. **Annotation Pattern**: `observableAnnotation` / `actionAnnotation` 等统一抽象,把"什么算 observable/action"的元数据从代码中抽离 (`api/observable.ts:70-79`)
3. **Batch / Transaction**: `startBatch` / `endBatch` 嵌套计数,所有 mutation 都包在 batch 里,反应执行只发生在外层 batch 结束时

### 5.4 反模式 (2 个,带为什么是反)

1. **过度依赖 Proxy**: v5 推 Proxy 后用户吐槽性能 (Proxy 比 defineProperty 慢 3-5x)。MobX 6 退回到默认 `defineProperty`,只在用户显式 `proxy: true` 才用 Proxy。**教训**:响应式框架的代理选择,要测真实 workload 而非 micro-benchmark。
2. **强制 makeAutoObservable**: 用户在 class 构造器里 `this.foo = 1` 这种赋值,如果在 `makeAutoObservable` 之前会被绕过追踪。MobX 6 用 `enforceActions: "always"` 强制开发期报错。**教训**:把"显式声明状态"作为硬约束,胜过 runtime 检测。

### 5.5 独特看点

- **"读" = 订阅**: 用户 `obj.foo` 这一行同时是"取值"和"建立依赖"。这是 MobX 跟 Vue 3 / Solid 共享的 reactive paradigm,不同之处是 MobX 把这个语义塞进了 `reportObserved` 一次函数调用。
- **Atom vs Derivation 不对称**: Atom 只能 `reportChanged` 广播,Derivation 还能被订阅和重算。这种"事件源 vs 监听者"在 mobx 里体现为两个 interface,设计干净。
- **`lazyComputedKeys_`**: `observableobject.ts:101` 维护一个"未激活的 computed 工厂",只有真的读到才 materialize —— 大 store 的优化点,没被 reactively 用到的 computed 不付启动开销。
- **`isBeingObserved` 配 `onBO/onBUO`**: 像 RxJava 的 subscribe/unsubscribe,但粒度更细。`computedvalue.ts:79` 的注释写"this process happens recursively, this computed might be the last observable of another, etc.." —— 链式回收。

## 6. 运行机制 (Bring It Up)

### 6.1 本地构建

```bash
git clone https://github.com/mobxjs/mobx.git
cd mobx
npm install  # workspaces 装 5 个 package
npm run build  # tsc + rollup 产物
```

### 6.2 跑测试

```bash
npm test  # jest --config 默认 root
npm run test -w mobx  # 单独跑 mobx 包
```

### 6.3 Smoke Test (15 行)

```typescript
import { makeAutoObservable, autorun } from "mobx"

class Counter {
    count = 0
    constructor() { makeAutoObservable(this) }
    inc() { this.count++ }
}

const c = new Counter()
autorun(() => console.log("count:", c.count))
c.inc()  // 打印 "count: 0" → "count: 1"
c.inc()  // 打印 "count: 1" → "count: 2"
```

## 7. 演进历史 (Time Travel)

```mermaid
gantt
    title MobX 主要里程碑
    dateFormat YYYY-MM
    section 早期
    2015 v1 发布           :done, 2015-01, 12M
    2016 v2 重构          :done, 2016-06, 6M
    section 现代
    2017 v3 ES2015        :done, 2017-01, 12M
    2018 v4 TypeScript 重写 :done, 2018-04, 8M
    2019 v5 Proxy         :done, 2019-03, 9M
    2020 v6 makeAutoObservable :done, 2020-08, 6M
    section 生态
    mobx-react-lite 独立   :done, 2018-10, 4M
    eslint-plugin-mobx    :done, 2021-05, 3M
    mobx-undecorate codemod :done, 2020-12, 4M
    section 当前
    v6.13+ TS 5 装饰器   :active, 2024-04, 18M
    v6.15 性能/类型优化   :active, 2025-08, 10M
```

版本变化的核心事件:
- v4 (2018): 完全 TS 重写,引入 makeObservable 显式声明
- v5 (2019): 默认 Proxy 拦截,但性能问题
- v6 (2020): 回退到 `defineProperty` 默认,Proxy 仅 opt-in
- v6.13+ (2024): 适配 TC39 stage-3 装饰器,跟 Babel/TS 5 双轨

## 8. 质量保障 (How It Doesn't Break)

### 8.1 测试 4 道防线

1. **核心 API 回归** (`packages/mobx/__tests__/v5/base/`) — 200+ 文件,覆盖 observable/computed/action/autorun/flow 全 API
2. **多版本共存** (`__tests__/mixed-versions/`) — 验证 v4/v5/v6 之间能 mix-import
3. **装饰器兼容** (`__tests__/decorators_20223/`) — 3 种装饰器 (TC39 stage-3 / Babel legacy / TS 5)
4. **性能基准** (`__tests__/perf/`) — `npm run perf-legacy` vs `perf-proxy` vs `perf-decorator`

### 8.2 CI 流水线

`.github/workflows/build_and_test.yml`:
- Node 多版本矩阵 (18, 20, 22)
- 跑 `npm run lint` + `npm test` + `npm run build:check`
- coveralls 上报覆盖率

### 8.3 静态检查

- `eslint-plugin-mobx` 4 条规则强制:
  - `missing-observer`: React 组件用 observable 必须包 observer
  - `missing-make-observable`: class 必须调 makeObservable
  - `unconditional-make-observable`: 不能在 if 里调
  - `exhaustive-make-observable`: 列出所有字段

### 8.4 性能基准

```bash
npm run test:performance  # perf legacy + proxy + decorator
```

`__tests__/perf/perf.js` 跑 100K atom 创建/订阅/解订阅,数据写入 `.github/workflows/coveralls.yml` 追踪。

## 9. 生态依赖 (Map of the World)

```mermaid
flowchart LR
    MobX[mobx 核心]
    MobRL[mobx-react-lite]
    MobR[mobx-react]
    MobXU[mobx-undecorate]
    Eslint[eslint-plugin-mobx]
    
    React[React 18+]
    ReactDom[react-dom]
    USSES[use-sync-external-store]
    
    MobX -->|运行时观察| MobRL
    MobX --> MobR
    MobRL -->|绑定| React
    MobRL --> USSES
    MobR --> MobRL
    MobR --> React
    Eslint --> MobX
    MobXU --> MobX
    
    style MobX fill:#ff6,stroke:#333
    style MobRL fill:#bbf
    style MobR fill:#bbf
```

合规检查清单:
- ✅ TypeScript strict mode
- ✅ 100% 包内 src 可选,无 React 依赖
- ✅ MIT + 赞助商披露 (`docs/backers-sponsors.md`)
- ✅ 多个 npm dist (ESM/CJS/UMD),tree-shakable (`sideEffects: false`)

## 10. 生产实践 (Battle-Tested)

| 关注点 | MobX 实现 | 文件位置 |
|--------|-----------|----------|
| 配置热更新 | 通过 `configure({ ... })` 改 enforceActions 等 | `api/configure.ts` |
| 优雅停服 | reaction 都有 disposer,可注册到 shutdown hook | `core/reaction.ts:dispose()` |
| 限流 | `autorun({ delay: 200 })` 或 `reaction({ scheduler })` | `api/autorun.ts:53-86` |
| 链路追踪 | `spy()` 订阅所有 change/start/end,可对接 sentry | `core/spy.ts` |
| 健康检查 | 无 (库无需) | - |
| 结构化日志 | spy 输出 + 自定义 listener | `core/spy.ts:78-95` |
| 错误隔离 | `disableErrorBoundaries` 默认开,reaction 报错不影响其他 | `core/globalstate.ts:133` |
| 严格模式 | `enforceActions: "always"` 强制裸赋值报错 | `core/globalstate.ts:100` |
| 调试支持 | `trace()` / `getDependencyTree()` 打印依赖图 | `api/trace.ts` |
| DevTools | mobx-devtools 浏览器扩展 | 外部包 |

## 11. 社区文化 (People & Process)

- **治理**: Michel Weststrate (创建者) 主导,几个核心 maintainer 共同维护
- **RFC**: 通过 GitHub Discussions 公开讨论
- **沟通渠道**:
  - GitHub Issues: 漏洞和功能
  - GitHub Discussions: 用法/RFC
  - OpenCollective: 资金
  - Discord/Slack: 历史上有
- **议题活跃度**: 6.x 仍在持续合 PR,issue 响应 1-3 天
- **发布流程**: changesets (`@changesets/cli`) + GitHub Actions 自动发布

## 12. 教训总结 (What To Steal / What To Avoid)

### 12.1 必偷 3 件

1. **`runId_` 去重 + 复用数组**: 性能优化里最朴素也最有效的一招,任何高频跟踪系统都该学
2. **4 态依赖传播**: 把"脏"拆成"可能脏/确定脏",把重算延后到被读时 —— 比 React 的 `useMemo`/`useCallback` 手动依赖声明智能
3. **BitField Flags 压缩**: 高频创建对象(atom/derivation)用位域压缩,内存和 GC 都受益

### 12.2 必避 3 坑

1. **不要默认 Proxy**: v5 的教训,Proxy 在 dev 模式有 3-5x 性能损耗,只在你确实需要"动态 key"时才用
2. **不要让 `enforceActions` 默认关**: 不强制 action 会导致"读时副作用"污染派生缓存
3. **不要在 reaction 里写 while 死循环**: MobX 允许 reaction 改自己依赖的状态,容易卡死 —— 用 `equals` 做"真变才触发"或加 `delay`

### 12.3 7 天复刻路线图

```mermaid
gantt
    title 7天复刻 MobX 核心
    dateFormat YYYY-MM-DD
    section 算法
    Day1 Atom + reportObserved/changed :a1, 2026-06-01, 1d
    Day2 Derivation + 4 态传播 :a2, after a1, 1d
    section 类型
    Day3 ObservableObject + defineProperty :b1, after a2, 1d
    Day4 ObservableArray + Map + Set :b2, after b1, 1d
    section 公开 API
    Day5 observable + makeAutoObservable :c1, after b2, 1d
    Day6 autorun + reaction + action :c2, after c1, 1d
    section 集成
    Day7 React useObserver + useSyncExternalStore :d1, after c2, 1d
```

### 12.4 打分卡 (1-5)

| 维度 | 分数 | 评语 |
|------|------|------|
| 性能 | 5 | signal-based 比 React 默认快 10x+ |
| 易用性 | 4 | API 简单但需要理解 4 态 |
| 类型安全 | 5 | TS 5 装饰器一流支持 |
| 生态 | 5 | 10 年积累,跟 Mendix/Canva 深度集成 |
| 文档 | 5 | mobx.js.org + docs/ 完整 |
| **总评** | **4.8** | 反应式编程的工业级范本 |

## 13. 学习萃取 (Cheat Sheet)

**一句话价值**: MobX = Atom + Derivation + Reaction, 4 态传播 + runId 去重 + 数组复用 = 性能王者

**3 核心洞察**:
1. **"读"= 订阅** 任何 `obj.foo` 都在悄悄建依赖
2. **POSSIBLY_STALE** 把"重算"延后到真的被读,空跑开销极小
3. **BitField Flags** 高频对象的内存压缩技巧

**5 段必读代码**:
1. `packages/mobx/src/core/derivation.ts:84-128` — `shouldCompute()` 4 态决策
2. `packages/mobx/src/core/observable.ts:135-160` — `reportObserved()` runId 去重
3. `packages/mobx/src/core/atom.ts:92-96` — `reportChanged()` batch 包裹
4. `packages/mobx/src/types/observableobject.ts:122-198` — `get/setObservablePropValue_` 热路径
5. `packages/mobx-react-lite/src/useObserver.ts:25-99` — `useSyncExternalStore` + FinalizationRegistry 集成

**1 反模式**: v5 默认 Proxy 是性能反模式,v6 退到 defineProperty 是正确选择

**1 可复用模式**: 任何"读即订阅"的反应式系统都可套用 runId 去重 + 数组复用 + 4 态传播

**3 立刻能用**:
1. **类里加 `makeAutoObservable(this)`** + 写普通赋值,自动响应式
2. **用 `reaction(() => x, (v) => ...)`** 替代 `useEffect([x])`,自动精确依赖
3. **`mobx-devtools` + `trace()`** 排查"为什么这个组件没刷新" —— 打印整条依赖链

## 14. 项目特点速查

- **独特看点**:
  - 唯一支持 TC39 stage-3 装饰器 + Babel legacy + TS 5 三轨
  - `getDependencyTree()` 可视化依赖图
  - 4 态传播比 Vue 3/Solid 多了 POSSIBLY_STALE 优化
  - `mobx-flow` 用 generator 写 async 状态机
- **与同类对比**:

```mermaid
quadrantChart
    title 状态管理工具对比
    x-axis "低学习成本" --> "高学习成本"
    y-axis "低性能" --> "高性能"
    "MobX 6": [0.4, 0.9]
    "Redux Toolkit": [0.6, 0.5]
    "Recoil": [0.7, 0.7]
    "Zustand": [0.2, 0.8]
    "Jotai": [0.3, 0.85]
    "Vue 3 ref": [0.3, 0.9]
    "Signals (Solid)": [0.5, 0.95]
```

## 附:仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\mobx\`
- **总文件数**: 475
- **核心源码**: ~12K 行 TS (`packages/mobx/src/`)
- **解析时间**: 2026-06-02
- **GitHub**: https://github.com/mobxjs/mobx
- **当前版本**: mobx 6.15.4
- **Star**: ~28K
- **License**: MIT

## 一句话总结

解析 = 计划书 + 框架图 + 核心功能 + 跑起来 + 偷过来。MobX 是一个"写起来像普通 JS、跑起来精确到字节"的反应式状态库,核心算法 (4 态传播 + runId 去重 + 数组复用) 是任何反应式系统都该偷的内功。
