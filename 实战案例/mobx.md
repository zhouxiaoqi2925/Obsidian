# MobX - 信号式响应式状态管理

**来源**：GitHub mobxjs/mobx
**创建时间**：2026-06-02

---

## 一、反应式核心：Atom 与 Derivation

### 1. Atom 与 4 态依赖传播（Reactive State Machine）

**问题场景**：状态变了，依赖该状态的 computed / reaction 都要重算，但全量重算太浪费；纯脏/净二态无法表达"深层依赖变了但浅层可能没变"。

**解决方案**：
```typescript
// packages/mobx/src/core/derivation.ts
export enum IDerivationState_ {
    NOT_TRACKING_ = -1,   // 没在运行或没被观察
    UP_TO_DATE_ = 0,      // 浅层依赖没变,直接返回缓存
    POSSIBLY_STALE_ = 1,  // 某个深层依赖变了,但不确定浅层是否变
    STALE_ = 2            // 浅层依赖肯定变了,下次访问必须重算
}

// packages/mobx/src/core/derivation.ts:84
case IDerivationState_.POSSIBLY_STALE_: {
    const obs = derivation.observing_, l = obs.length
    for (let i = 0; i < l; i++) {
        const obj = obs[i]
        if (isComputedValue(obj)) obj.get()  // 沿依赖链回溯
        if (derivation.dependenciesState_ === IDerivationState_.STALE_) {
            return true  // 真的变了
        }
    }
    changeDependenciesStateTo0(derivation)  // 浅层没变,恢复 UP_TO_DATE
    return false
}
```

**关键参数**：

| 状态 | 触发条件 | 行为 |
| --- | --- | --- |
| `NOT_TRACKING_` | 初始 | 不订阅 |
| `UP_TO_DATE_` | 上次访问后没变 | 返回缓存 |
| `POSSIBLY_STALE_` | 某个 computed 子依赖变了 | 按需检查 |
| `STALE_` | 直接依赖变了 | 必重算 |

**最佳实践**：
- ✅ 业务方用 `computed` 缓存昂贵计算（仅依赖变时重算）
- ✅ 嵌套 computed 自动只重算受影响的层
- ✅ `equals` 配 `comparer.shallow` / `comparer.structural` 减少无谓重算
- ❌ 切勿在 computed 内做副作用（必须用 reaction）
- ❌ 切勿让 computed 形成环（A 依赖 B，B 依赖 A）

### 2. 依赖数组与 runId 去重（Dep Tracking）

**问题场景**：每次重算 computed 要记录"我读了哪些 atom"；用 Set 优雅但慢，循环读同一 atom 重复订阅浪费。

**解决方案**：
```typescript
// packages/mobx/src/core/observable.ts:135
if (derivation.runId_ !== observable.lastAccessedBy_) {
    observable.lastAccessedBy_ = derivation.runId_
    derivation.newObserving_![derivation.unboundDepsCount_++] = observable
    // 复用数组,避免每次都分配
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `derivation.runId_` | 每次运行的递增 ID |
| `observable.lastAccessedBy_` | 上次被哪个 run 访问 |
| `newObserving_` | 复用的依赖数组 |
| `unboundDepsCount_` | 数组游标 |

**最佳实践**：
- ✅ 业务方在循环里读同一 observable 不会重复订阅（runId 去重）
- ✅ 复用数组比 Set 快 3-5x（MobX 实测）
- ✅ bindDependencies 差量更新：只 add 新依赖、remove 消失的、复用未变的
- ❌ 切勿在派生里手写 `addObserver`（会破坏 runId 去重）
- ❌ 切勿在派生内修改 `runId_`

### 3. propagateChanged 单源多目标（Change Propagation）

**问题场景**：atom.set() 后要通知所有依赖此 atom 的 computed / reaction；如果 computed 又被其他 computed 依赖，要链式传播。

**解决方案**：
```typescript
// packages/mobx/src/core/observable.ts:185
propagateChanged() {
    const observers = this.observers_
    if (observers.size === 0) return  // 无订阅者,直接返回
    
    // 优化:如果最小观察者状态已经是 STALE 就直接 return
    if (this.lowestObserverState_ === IDerivationState_.STALE_) return
    
    for (const der of observers) {
        if (der.dependenciesState_ === IDerivationState_.UP_TO_DATE_) {
            der.onBecomeStale_()  // 触发链式传播
        }
        der.dependenciesState_ = IDerivationState_.STALE_
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `observers_` | 订阅本 atom 的 derivation Set |
| `lowestObserverState_` | 最小观察者状态（STALE 短路） |
| `onBecomeStale_` | 链式触发上游 derivation |

**最佳实践**：
- ✅ 业务方用 `startBatch` + `endBatch` 包裹多个 set（合并为一次传播）
- ✅ `lowestObserverState_` 短路避免重复传播
- ✅ observers 用 Set（去重 + 快速 delete）
- ❌ 切勿在 atom.set() 外手动调 propagateChanged
- ❌ 切勿在 reaction 副作用里调 set（会触发死循环）

### 4. BitField Flags 内存压缩（Atom Flags）

**问题场景**：Atom 是高频创建对象（一个 observable object 可能几十个 atom）；用 3 个 boolean 让对象头 24 字节起步，1 万个 atom 多 240KB 内存。

**解决方案**：
```typescript
// packages/mobx/src/core/atom.ts:27
private static readonly isBeingObservedMask_ = 0b001
private static readonly isPendingUnobservationMask_ = 0b010
private static readonly diffValueMask_ = 0b100
private flags_ = 0b000

// 位操作 O(1)
getFlag(flag: number) { return (this.flags_ & flag) > 0 }
setFlag(flag: number, val: boolean) {
    if (val) this.flags_ |= flag
    else this.flags_ &= ~flag
}
```

**关键参数**：

| 标志位 | 含义 |
| --- | --- |
| `0b001` | isBeingObserved（被观察中） |
| `0b010` | isPendingUnobservation（待解订阅） |
| `0b100` | diffValue（值变了） |

**最佳实践**：
- ✅ 业务方自建高频对象也用 BitField 压缩标志
- ✅ mask 用 `static readonly` 放原型（共享）
- ✅ 位运算 O(1) 零开销
- ❌ 切勿用 `boolean` 单独存标志（GC 压力）
- ❌ 切勿让 mask 数量超过 32（升级到 BigInt）

### 5. ComputedValue 缓存与 equals（Computed Memoization）

**问题场景**：computed 是"昂贵的派生计算"，要缓存值；值真变才重算，相同不重算。

**解决方案**：
```typescript
// packages/mobx/src/core/computedvalue.ts
get() {
    if (this.isComputing) die(37)  // 循环依赖
    if (shouldCompute(this)) {
        this.computeValue_()
    }
    reportObserved(this)  // 每次 get 都 reportObserved
    return this.value_
}

get value_(): T {
    if (this.equals_(this.value_, newValue)) {
        return this.value_  // 值未变,返回旧值,不触发下游
    }
    return this.value_ = newValue
}
```

**关键参数**：

| 字段 | 默认 | 用途 |
| --- | --- | --- |
| `equals_` | `comparer.default` (===) | 值相等判断 |
| `keepAlive` | false | 是否常驻内存 |
| `requiresReaction` | false | 必须有 reaction 订阅才重算 |
| `value_` | `T \| CaughtException` | 哨兵值避免 throw |

**最佳实践**：
- ✅ 业务方对数组/对象用 `comparer.shallow` / `comparer.structural`
- ✅ 同样内容不触发下游（防止无限循环）
- ✅ 业务方用 `computed.struct` 一键开启深比较
- ❌ 切勿在 computed 内做 `console.log`（破坏 purity）
- ❌ 切勿让 computed 依赖非 observable 变量（不会自动重算）

---

## 二、observable 类型：Object / Array / Map / Set

### 6. ObservableObjectAdministration 与 keysAtom（Object Internals）

**问题场景**：observable object 的属性 key 本身是动态的（业务方 add/delete key）；需要一个"key 变化"的 atom 让 `Object.keys` 也能响应。

**解决方案**：
```typescript
// packages/mobx/src/types/observableobject.ts
class ObservableObjectAdministration {
    values_ = new Map<string, ObservableValue | ComputedValue>();
    keysAtom_ = new Atom(`keys.${name}`);  // key 变化专用 atom
    
    getObservablePropValue_(key) {
        return this.values_.get(key)?.get();
    }
    
    setObservablePropValue_(key, value) {
        const oldValue = this.values_.get(key);
        // intercept → prepareNewValue → setNewValue → notify
        this.values_.set(key, new ObservableValue(value));
        this.keysAtom_.reportChanged();  // key 变了
    }
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `values_` | Map<key, observable> |
| `keysAtom_` | 跟踪 keys 变化的 atom |
| `pendingKeys_` | 延迟提交的 keys |
| `lazyComputedKeys_` | 延迟创建的 computed |

**最佳实践**：
- ✅ 业务方 `Object.keys(obj)` 自动响应 key 增删（keysAtom）
- ✅ 用 Map 而非 plain object 存 properties（避免 prototype 污染）
- ✅ `setObservablePropValue_` 走 intercept → validate 管线
- ❌ 切勿直接修改 `adm.values_`（绕过 set 管线）
- ❌ 切勿在 keysAtom 变化时遍历整个 object

### 7. Proxy vs defineProperty 切换（Dynamic Object）

**问题场景**：业务方给"未声明完整 key"的对象用 observable（如 `obj.foo = 1` 后才创建 observable foo）；defineProperty 性能好但需要静态 schema。

**解决方案**：
```typescript
// packages/mobx/src/types/dynamicobject.ts:82
function asDynamicObservableObject(target, adm) {
    return new Proxy(target, {
        get(t, key) { return adm.getObservablePropValue_(key); },
        set(t, key, value) { adm.setObservablePropValue_(key, value); return true; },
        has(t, key) { return adm.has_(key); },
        deleteProperty(t, key) { adm.delete_(key); return true; },
    });
}

// 业务方选 Proxy
makeAutoObservable(this, {}, { proxy: true });
```

**关键参数**：

| 字段 | 默认 |
| --- | --- |
| `proxy` | `false`（v6 默认） |
| 性能 | defineProperty 30% 快 |
| 灵活性 | Proxy 支持 `in` / `delete` |

**最佳实践**：
- ✅ 业务方明确 schema 用 `proxy: false`（性能）
- ✅ 业务方动态增删 key 用 `proxy: true`
- ✅ 装饰器版本用 defineProperty（TS 装饰器元数据驱动）
- ❌ 切勿同时设 `proxy: true` 又写 `keyof` 类型
- ❌ 切勿混用 Proxy / non-Proxy 同一个对象

### 8. observable array / map / set 容器（Collection Types）

**问题场景**：JS 内置 Array / Map / Set 是 mutable，但响应式需要"任何变更都被追踪"；改方法不破坏 API 兼容性。

**解决方案**：
```typescript
// packages/mobx/src/types/observablearray.ts
class ObservableArray<T> {
    [Symbol.toPrimitive]() { return 'Array' }
    get length() { return this.values_.length }
    
    push(...items) {
        const values = items.map(toObservable);
        this.values_.push(...values);
        this.atom_.reportChanged();
        return this.values_.length;
    }
    
    map<U>(fn: (v: T) => U): U[] {
        this.atom_.reportObserved();
        return this.values_.map(fn);
    }
}

// 业务方
const list = observable([1, 2, 3]);
autorun(() => console.log(list.length, list.map(x => x * 2)));
list.push(4);  // 自动触发
```

**关键参数**：

| 方法 | 报告 Observed | 报告 Changed |
| --- | --- | --- |
| `length` | ✅ | ❌ |
| `[i]` | ✅ | ❌ |
| `push/pop` | ❌ | ✅ |
| `map/filter` | ✅ | ❌ |
| `sort/reverse` | ❌ | ✅ |

**最佳实践**：
- ✅ 业务方用 `observable.array` 而非普通 array（响应式）
- ✅ 遍历方法（map/filter）自动订阅；变更方法（push/sort）自动通知
- ✅ 大列表用 `observable.map`（O(1) key 查找）
- ❌ 切勿用 `[...arr]` 解构（断开引用）
- ❌ 切勿对 observable array 用 `JSON.stringify`（返回代理）

### 9. Action 与 startBatch 事务边界（Transaction）

**问题场景**：业务方一次 set 多个 observable，期望"一次更新、一次 reaction 执行"；裸 set 会触发 N 次 reaction。

**解决方案**：
```typescript
// packages/mobx/src/core/observable.ts:106
startBatch() { globalState.batchLevel_++ }
endBatch() {
    if (--globalState.batchLevel_ === 0) {
        // 处理 pendingUnobservations + 跑 reactions
        runReactions()
    }
}

// 业务方
import { action, runInAction } from 'mobx';

class Store {
    @action
    updateUser(name: string, age: number) {
        this.user.name = name;  // 不立即触发 reaction
        this.user.age = age;
    }  // action 结束时统一触发一次
}

// 或运行时
runInAction(() => {
    store.user.name = 'Bob';
    store.user.age = 30;
});
```

**关键参数**：

| 字段 | 默认 |
| --- | --- |
| `enforceActions` | `"observed"` |
| `batchLevel_` | 嵌套 batch 计数 |
| `runInAction` | 临时开启 action 权限 |

**最佳实践**：
- ✅ 业务方用 `@action` 或 `runInAction` 包裹多个 set
- ✅ 嵌套 action 自动累加 batchLevel
- ✅ `enforceActions: "always"` 强制 strict mode
- ❌ 切勿在 reaction 内部裸 set（违反 purity）
- ❌ 切勿让 action 内有 async/await（破坏事务边界）

### 10. Annotation Pattern 装饰器（Decorators）

**问题场景**：业务方想把 class 字段标为 `observable` / `action` / `computed`，但 TS 装饰器分 legacy / stage-3 / Babel 三种，库要兼容。

**解决方案**：
```typescript
// packages/mobx/src/types/observableobject.ts
const observableAnnotation = createAnnotation('observable');
const actionAnnotation = createAnnotation('action');
const computedAnnotation = createAnnotation('computed');

class Store {
    @observable user: User = new User();
    @observable.ref items: Item[] = [];  // ref: 不深度响应
    @observable.shallow config = { ... }; // shallow: 只顶层响应
    
    @action
    update() { ... }
    
    @computed
    get count() { return this.items.length; }
}
```

**关键参数**：

| 注解 | 行为 |
| --- | --- |
| `observable` | 深度响应（递归） |
| `observable.ref` | 只读引用（替换才更新） |
| `observable.shallow` | 顶层响应 |
| `observable.struct` | 结构化比较（默认 ===） |
| `action` | 事务边界 |
| `action.bound` | 自动 bind this |
| `computed` | 派生缓存 |

**最佳实践**：
- ✅ 业务方用 `makeAutoObservable` 简化（自动推断）
- ✅ 装饰器版本需 `useDefineForClassFields: false`（TS 5.0 stage-3）
- ✅ Babel 装饰器需 legacy config
- ❌ 切勿混用 legacy 和 stage-3 装饰器
- ❌ 切勿对 ref 字段用 push（要替换整个数组）

---

## 三、性能优化：调度、批处理、React 适配

### 11. autorun 与 Reaction 调度（Reactive Side Effect）

**问题场景**：业务方要"状态变了就执行某段代码"；用 setInterval 轮询浪费；用 EventEmitter 又要手动清理。

**解决方案**：
```typescript
// packages/mobx/src/api/autorun.ts:38
import { autorun, reaction, when, flow } from 'mobx';

// autorun: 自动追踪 + 立即执行
const dispose = autorun(() => {
    console.log(store.user.name);  // 自动订阅 user.name
});

// reaction: 显式声明 data + effect
const dispose2 = reaction(
    () => store.user.name,  // data
    (name) => console.log('name changed:', name)  // effect
);

// when: 条件满足执行一次
when(() => store.user.age >= 18, () => console.log('adult'));

// flow: async 生成器
function* fetchUser() {
    const data = yield fetch('/api/user');
    store.user = data;
}
```

**关键参数**：

| API | 触发 | 用途 |
| --- | --- | --- |
| `autorun(fn)` | 任何依赖变 | 调试、日志 |
| `reaction(data, effect)` | data 函数返回值变 | 副作用 |
| `when(cond, fn)` | cond 变 true | 一次性回调 |
| `flow(gen)` | 异步生成器 | async 状态管理 |

**最佳实践**：
- ✅ 业务方用 `reaction` 而非 `autorun`（明确 data vs effect）
- ✅ `dispose()` 必须调用避免内存泄漏
- ✅ 业务方传 `delay: 100` 做 debounce
- ❌ 切勿在 effect 内改它订阅的 data（会触发无限循环）
- ❌ 切勿忘记 dispose（memory leak）

### 12. MobX 6 默认 makeAutoObservable（Simpler API）

**问题场景**：MobX 4 强制写 `@observable` 装饰器；MobX 5 引入 Proxy 性能问题；MobX 6 默认关闭 Proxy，让 `makeAutoObservable` 推断。

**解决方案**：
```typescript
// packages/mobx/src/api/makeObservable.ts:51
import { makeAutoObservable } from 'mobx';

class Store {
    count = 0;
    user = { name: 'Alice' };
    
    constructor() {
        makeAutoObservable(this, {}, { autoBind: true });
    }
    
    increment() {
        this.count++;
    }
    
    get doubled() {
        return this.count * 2;
    }
}

// 业务方用
const store = new Store();
autorun(() => console.log(store.doubled));
store.increment();
```

**关键参数**：

| 字段 | 默认 | 用途 |
| --- | --- | --- |
| `autoBind` | false | 自动 bind action this |
| `proxy` | false | 用 defineProperty 而非 Proxy |
| `deep` | true | 深度响应 |
| `overrides` | `{}` | 局部覆盖 |

**最佳实践**：
- ✅ 业务方优先用 `makeAutoObservable`（简洁）
- ✅ `autoBind: true` 让 action 不用 `.bind(this)`
- ✅ `overrides: { items: false }` 跳过某些字段
- ❌ 切勿在 `makeAutoObservable` 之后再改 class 字段（不响应）
- ❌ 切勿在 super() 之前调 makeAutoObservable

### 13. mobx-react-lite 的 useObserver（React 18 Adapter）

**问题场景**：MobX 是"框架无关"的状态管理；要在 React 里订阅变化触发 re-render；useSyncExternalStore 是 React 18 原生 API。

**解决方案**：
```typescript
// packages/mobx-react-lite/src/useObserver.ts
const useObserver = (fn) => {
    const admRef = useRef(null);
    
    if (!admRef.current) {
        const adm = createReactionTrackingAdm(fn.name);
        adm.reaction = new Reaction(`observer${adm.name}`, () => {
            adm.stateVersion = Symbol();  // Symbol 永远不等
            adm.onStoreChange?.();
        });
        admRef.current = adm;
    }
    
    return useSyncExternalStore(
        adm.subscribe,
        adm.getSnapshot,  // 返回 adm.stateVersion
        adm.getServerSnapshot
    );
};
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `useSyncExternalStore` | React 18 并发模式原生 |
| `stateVersion = Symbol()` | 每次反应产生新 Symbol |
| `FinalizationRegistry` | 组件卸载时自动 dispose |

**最佳实践**：
- ✅ React 18 项目用 `useSyncExternalStore`（无 tearing）
- ✅ 业务方用 `observer(() => <JSX />)` 包装组件
- ✅ 用 `useLocalObservable` 创建组件内 store
- ❌ 切勿在 observer 内修改 observable（不纯）
- ❌ 切勿把 observable 传给 `useMemo`/`useCallback` deps

### 14. spy 与 onBecomeObserved 调试（DevTools）

**问题场景**：业务方想知道"哪些 observable 被改了 / 被订阅了"；生产环境不想要 console.log，但 dev 想要。

**解决方案**：
```typescript
// packages/mobx/src/core/spy.ts
import { spy } from 'mobx';

spy((event) => {
    if (event.type === 'action') {
        console.log('Action:', event.name, event.arguments);
    } else if (event.type === 'reaction') {
        console.log('Reaction:', event.name);
    } else if (event.type === 'compute') {
        console.log('Compute:', event.name);
    } else if (event.type === 'update') {
        console.log('Update:', event.object, event.name, '→', event.newValue);
    }
});

// Observable 生命周期
const obs = observable.box(0);
const dispose = onBecomeObserved(obs, () => console.log('first observer'));
const dispose2 = onBecomeUnobserved(obs, () => console.log('all gone'));
```

**关键参数**：

| 事件类型 | 触发 |
| --- | --- |
| `action` | action 执行 |
| `reaction` | reaction 调度 |
| `compute` | computed 重算 |
| `update` | observable 值变 |
| `create` | observable 创建 |

**最佳实践**：
- ✅ dev 环境用 `spy` 接入 devtools（mobx-devtools-mst 等）
- ✅ `onBecomeObserved` 实现"懒初始化"（如加载大数据集）
- ✅ `onBecomeUnobserved` 实现"资源释放"
- ❌ 切勿在 spy 回调内做重操作（会拖慢 mutation）
- ❌ 切勿在 production 启用 spy

### 15. globalState 与单例（Process-Singleton State）

**问题场景**：整个进程共用同一份"batch 计数、pendingReactions、isComputing"等状态；多个 MobX 实例要共享这些。

**解决方案**：
```typescript
// packages/mobx/src/core/globalstate.ts
class GlobalState {
    batchLevel_ = 0;
    pendingReactions: Reaction[] = [];
    pendingUnobservations: IObservable[] = [];
    inBatch = 0;
    isRunningReactions = false;
    runId = 0;
    
    startBatch() { this.batchLevel_++ }
    endBatch() {
        if (--this.batchLevel_ === 0) {
            this.processPendingUnobservations();
            this.runReactions();
        }
    }
}

export const globalState = new GlobalState();  // 单例
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `batchLevel_` | 嵌套 batch 计数 |
| `pendingReactions` | 待执行的 reaction |
| `pendingUnobservations` | 待解订阅的 observable |
| `runId` | 每次运行的递增 ID |

**最佳实践**：
- ✅ 业务方 `import { globalState }` 不要重新实例化
- ✅ 嵌套 batch 自动累加，最外层结束时统一跑 reaction
- ✅ 跨 store 共享状态走 globalState
- ❌ 切勿在 SSR 多请求间共享 globalState（必须每次创建新 instance）
- ❌ 切勿让 batchLevel 越积越多（必须配对调用）

---

## 四、可靠性与生态：测试、迁移、生态库

### 16. tsdx + Rollup 构建（Build Pipeline）

**问题场景**：MobX 既要给浏览器用（UMD）又要给 Node.js 用（CJS）；还要给 bundler 用（ESM）；构建配置复杂。

**解决方案**：
```typescript
// tsdx.config.js
module.exports = {
    rollup(config, options) {
        config.output = {
            ...config.output,
            // ESM + CJS + UMD 三套输出
            format: 'esm',
        };
        return config;
    },
};

// 产物
dist/
  mobx.cjs.development.js
  mobx.cjs.production.min.js
  mobx.esm.js
  mobx.umd.development.js
  mobx.umd.production.min.js
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `__DEV__` | 构建时死代码消除（dev 警告） |
| `format` | esm / cjs / umd |
| `minify` | 生产压缩 |
| `sourcemap` | 调试支持 |

**最佳实践**：
- ✅ 业务方用 `tsup` 或 `tsdx` 简化 build
- ✅ 库项目输出 ESM + CJS（不输出 UMD，CDN 走 esm.sh）
- ✅ dev 模式保留 `__DEV__` 警告，prod 树摇掉
- ❌ 切勿把测试代码打进 dist
- ❌ 切勿用 webpack 打包库（慢且配置重）

### 17. jest 测试 30 配置（Testing）

**问题场景**：MobX 内部用很多全局状态（globalState、batch level），jest 默认 `clearMocks: false` 状态会污染；测 computed 循环依赖需要堆栈深度。

**解决方案**：
```typescript
// jest.config.js
module.exports = {
    testEnvironment: 'jsdom',
    setupFiles: ['./jest.setup.js'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
    },
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
```
```typescript
// test/autorun.test.ts
import { autorun, observable, runInAction } from '../src/mobx';

test('autorun re-runs on dependency change', () => {
    const obs = observable.box(1);
    const fn = jest.fn(() => obs.get());
    const dispose = autorun(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    
    runInAction(() => obs.set(2));
    expect(fn).toHaveBeenCalledTimes(2);
    
    dispose();
    runInAction(() => obs.set(3));
    expect(fn).toHaveBeenCalledTimes(2);  // 已 dispose,不再触发
});
```

**关键参数**：

| 字段 | 推荐 |
| --- | --- |
| `testEnvironment` | `jsdom` |
| `isolatedModules` | `true`（ts-jest 快） |
| 覆盖率 | coveralls 集成 |

**最佳实践**：
- ✅ 业务方用 `runInAction` 包裹 set 测反应式
- ✅ 每次 `dispose()` 验证内存不泄漏
- ✅ 测循环依赖 die(37) 异常
- ❌ 切勿在测试间共享 observable（状态污染）
- ❌ 切勿忘了 dispose（jest 警告 memory leak）

### 18. mobx-undecorate codemod 迁移工具（Migration）

**问题场景**：老项目用 `@observable` 装饰器，升级 MobX 6 想改 `makeAutoObservable`；手写转换 100 个 class 痛苦。

**解决方案**：
```bash
# 安装
npm install -D mobx-undecorate

# 转换项目
npx mobx-undecorate ./src/**/*.ts

# 输出：装饰器 → makeAutoObservable
# BEFORE:
class Store {
    @observable count = 0;
    @action increment() { this.count++; }
    @computed get doubled() { return this.count * 2; }
}

# AFTER:
class Store {
    count = 0;
    increment() { this.count++; }
    get doubled() { return this.count * 2; }
    constructor() {
        makeAutoObservable(this);
    }
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `mobx-undecorate` | codemod 工具 |
| `--help` | 查看所有选项 |
| `src/` | 目标目录 |

**最佳实践**：
- ✅ 业务方先跑 codemod 试运行（`--dry-run`）
- ✅ 转换后跑完整测试套件验证
- ✅ 大项目分批迁移（每 PR 1-2 个 store）
- ❌ 切勿直接 production 跑 codemod
- ❌ 切勿混用装饰器和新 API（混乱）

### 19. eslint-plugin-mobx 静态检查（Linting）

**问题场景**：业务方漏写 `makeAutoObservable` / `observer`，运行时才发现；用 ESLint 在编译期强制。

**解决方案**:
```javascript
// .eslintrc.js
module.exports = {
    plugins: ['mobx'],
    rules: {
        'mobx/missing-make-observable': 'error',  // class 字段必须包 makeAutoObservable
        'mobx/no-anonymous-observer': 'warn',       // observer 必须有 name
        'mobx/missing-observer': 'error',           // 返回 JSX 的组件必须 observer
        'mobx/unexpected-mobx-in-createcontext': 'error',
    },
};
```

**关键参数**：

| 规则 | 含义 |
| --- | --- |
| `missing-make-observable` | class 字段必须调用 makeAutoObservable |
| `no-anonymous-observer` | observer 组件必须有 name（DevTools 友好） |
| `missing-observer` | 返回 JSX 用 observable 必须 observer |
| `unexpected-mobx-in-createcontext` | 禁止 MobX 在 React Context 中 |

**最佳实践**：
- ✅ 业务方 CI 必开 `missing-make-observable: error`
- ✅ IDE 配置 ESLint 实时提示
- ✅ 老项目渐进式开（先 warn，后 error）
- ❌ 切勿关掉 `missing-observer`（会破坏响应式）
- ❌ 切勿在 unit test 文件禁用规则（应严格）

### 20. SSR 与 Next.js 适配（Server-Side Rendering）

**问题场景**：Next.js 14 server component 不能用 MobX（globalState 跨请求污染）；需要 per-request store + hydrate。

**解决方案**：
```typescript
// app/[lang]/layout.tsx (Next.js 14)
import { createStore, StoreProvider } from './store';

export default function RootLayout({ children }) {
    // 每个请求一个 store（不要单例）
    const store = createStore();
    return (
        <StoreProvider value={store}>
            {children}
        </StoreProvider>
    );
}

// store.ts
import { createContext, useContext } from 'react';

const StoreContext = createContext<Store | null>(null);

export const StoreProvider = StoreContext.Provider;

export function useStore() {
    const store = useContext(StoreContext);
    if (!store) throw new Error('useStore must be used within StoreProvider');
    return store;
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `createStore()` | 每个请求一个 store |
| `StoreProvider` | React Context 注入 |
| `useStore` | 子组件拿 store |

**最佳实践**：
- ✅ Next.js / SSR 项目每个请求一个 store 实例
- ✅ 用 React Context 注入 store
- ✅ 在 `useEffect` 内订阅（避免 hydration mismatch）
- ❌ 切勿在 server component 内直接 `useStore`（无 Context）
- ❌ 切勿把 MobX store 当单例（请求间污染）

---

**标签**：#mobx #state-management #reactive #signals
**状态**：20/20 份详细内容
