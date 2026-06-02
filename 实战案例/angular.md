# angular · 架构与模式解析

> Angular 22（仓库 22.1.0-next.0）是 Google 维护、面向企业级 SPA/SSR/Hydration 的全栈前端框架；核心由 Ivy 渲染器（LView 数组）+ Signals 响应式图（ReactiveNode + epoch）+ 层级 DI（R3Injector Records Map）+ 模板 IR Pipeline 编译构成。本文用 ABL 视角拆解其原语层、编译层、运行时层、平台层 4 大领域 20 个可复用模式。

## 1. 原语层（Primitives）

### 模式 1：ReactiveNode 双角色双向链表

**问题场景**：MobX/Vue 等响应式库把"生产者"和"消费者"拆成两类节点，节点数和访问路径翻倍。computed/effect/template 既读 signal 又产出值，单类型结构最优雅。

**解决方案代码**：
```typescript
// packages/core/primitives/signals/src/graph.ts
interface ReactiveNode {
  // 消费方（读其他 signal 时记录）
  consumer: {
    prev: ReactiveNode;
    next: ReactiveNode | null;
  } | null;
  // 生产方（被下游读）
  producer: {
    prev: ReactiveNode;
    next: ReactiveNode | null;
  } | null;
  // 版本号 + 状态
  version: number;
  epoch: number;
  // ... producers 链表
}
```

**关键参数表**：
| 元素 | 选择 | 替代 | 取舍 |
|:---|:---|:---|:---|
| 节点类型 | 单类型双角色 | 拆 producer/consumer 两类 | 减少类型切换 |
| 链表结构 | 双向（prev/next） | 单向 / Set | O(1) 增删、避免 hot path Set 分配 |
| 版本号 | `version: number` 自增 | 脏标记 boolean | 1 字节能区分"多个"还是"没变" |
| 状态机 | 6 个 enum | 散落 boolean | 编译期穷举检查 |

**最佳实践**：
- 双角色单结构比双类型实现**少 30%** 代码量
- 双向链表在 hot path 中比 Set/Map 快 5-10×（V8 monomorphic）
- 写时**自增** `version` + 同步推进全局 `epoch`，下游懒重算时 O(1) 跳过
- `inNotificationPhase` 标志位防止递归污染依赖
- `consumerOnSignalRead` 走 `prevProducerLink` 短路——同一节点连续读不开新边

---

### 模式 2：epoch 计数器替代脏标记的快速跳过

**问题场景**：computed 重算时遍历所有 producers 才知道"哪些变了"——O(N) 开销。`lastCleanEpoch === epoch` 直接判断"自上次清理以来有没有 signal 被写"。

**解决方案代码**：
```typescript
// graph.ts
function producerUpdateValueVersion(node: ReactiveNode): boolean {
  if (node.lastCleanEpoch === globalEpoch) {
    return false;  // 自上次清理以来没人写，直接跳过
  }
  // ... 真正重算逻辑
  node.lastCleanEpoch = globalEpoch;
  return true;
}

function signalValueChanged<T>(node: SignalNode<T>): void {
  node.version++;
  globalEpoch++;  // 全局写计数器 +1
  producerNotifyConsumers(node);
}
```

**关键参数表**：
| 方案 | 复杂度 | 空间 |
|:---|:---|:---|
| 脏标记 boolean | O(1) 写 | 1 bit/node，但"重置"时 O(N) |
| epoch 计数 | O(1) 写 + O(1) 读 | 4-8 bytes global + 4-8 bytes/node |
| 完整版本号 | O(1) 写 + O(1) 读 | 8 bytes/global + 8 bytes/node |

**最佳实践**：
- 全局 `globalEpoch` 用 `number` 自增——JS 53-bit 整数够用 285 年
- 节点 `lastCleanEpoch` 在重算完成后**立即**写入，避免重复判定
- 写信号时**先** `version++` **再** `globalEpoch++`，保证下游读到一致值
- `inNotificationPhase` 守卫**先**于 epoch 更新——防递归通知
- 在 dev mode 下记录 epoch 历史用于 DevTools 时间线

---

### 模式 3：linkedSignal 源驱动派生

**问题场景**：computed 是"只读派生"，但很多场景需要"源变了就把派生重置为新源对应的默认值"——比如表单字段联动、购物车编辑。

**解决方案代码**：
```typescript
// packages/core/primitives/signals/src/linked_signal.ts
function createLinkedSignal<S, T>({
  source,
  computation,
}: {
  source: Signal<S>;
  computation: (source: S, prev?: { source: S; value: T }) => T;
}): WritableSignal<T> {
  // LinkedSignalNode 持有 source 引用 + 当前 value
  // 源 signal 变化时 producerUpdateValueVersion 检测并把 value 重算
  return createSignal(...) as WritableSignal<T>;
}
```

**关键参数表**：
| 派生类型 | 是否可写 | 源变化时行为 | 典型场景 |
|:---|:---|:---|:---|
| `computed` | 否 | 重新派生 | 只读衍生值 |
| `linkedSignal` | 是 | 重置为 `computation(source)` | 表单字段重置 |
| `effect` | 是 | 触发副作用 | 日志、订阅 |
| `resource` | 是 | 重新拉取 | HTTP 拉取 |

**最佳实践**：
- linkedSignal = "有 source 指针的 writable computed"
- `computation` 第二参数 `prev` 让你根据"前一个值 + 新源"做渐进更新
- linkedSignal 是"可写"，但写它**不会**污染 source——源仍是真理
- 模板里 `*ngFor`/控制流表达式**禁止**写 signal——会抛 `INVALID_WRITE_TO_SIGNAL`
- 跨域时用 `untracked()` 包裹读——告诉系统"这次访问不建立依赖边"

---

### 模式 4：DI Records Map + Sentinel 哨兵

**问题场景**：DI 容器需要支持"lazy 工厂 + 循环依赖"——传统 Promise/async 方案与 Angular 同步启动冲突。用 `Map + NOT_YET/CIRCULAR` 哨兵对象模拟"未初始化"状态。

**解决方案代码**：
```typescript
// packages/core/src/di/r3_injector.ts
class R3Injector {
  private records = new Map<ProviderToken<any>, Record<any> | null>();

  processProvider(record: Record<any>): void {
    // 构造时跑（同步）
    this.records.set(record.token, record);
  }

  get(token: ProviderToken<any>, ...): any {
    const record = this.records.get(token);
    if (record === null) return this.injectFromParent(token);
    if (record.value === NOT_YET) {
      record.value = CIRCULAR;  // 防二次进入
      record.value = record.factory();
    }
    return record.value;
  }
}
```

**关键参数表**：
| 哨兵 | 含义 | 何时用 |
|:---|:---|:---|
| `null` | token 已查询但未提供 | 走 parent injector |
| `NOT_YET` | 已注册但未实例化 | 第一次 `get()` 时实例化 |
| `CIRCULAR` | 正在实例化中 | 检测到循环依赖 |

**最佳实践**：
- `Map` 而非 `Object`——保留 `null` 哨兵不被原型链污染
- 所有 token 在构造期**同步**注册——`inject()` 才能在构造期被调用
- 循环依赖通过 `CIRCULAR` 哨兵+二次进入检测——不抛错也不死循环
- `INJECTOR` token 既指 R3Injector 又指 EnvironmentInjector——DI 通过 prototype chain 解析
- `runInInjectionContext` 提供"事后注入"逃生口——但**不能跨 await**

---

### 模式 5：primitives 子包分层——框架无关的纯逻辑库

**问题场景**：Angular core 越来越胖，但 signals / DI / event-dispatch 等核心机制**与 Angular 抽象无关**。把它们独立成子包，让社区项目也能复用。

**解决方案代码**：
```typescript
// packages/core/primitives/signals/src/index.ts
// 0 个 @angular/core 依赖
export { signal, computed, effect, untracked } from './graph';
export { linkedSignal } from './linked_signal';

// packages/core/src/core.ts —— 框架层
export { signal, computed, effect } from '@angular/core/primitives/signals';
// 加上 @Component / @Injectable / ChangeDetectionStrategy 等框架概念
```

**关键参数表**：
| 层级 | 路径 | 依赖 | 复用范围 |
|:---|:---|:---|:---|
| primitives | `packages/core/primitives/*` | 0 依赖（除 rxjs） | 任何 JS 项目 |
| core | `packages/core/src/*` | primitives + Zone | Angular 应用 |
| 应用 | 用户代码 | @angular/core | Angular SPA |

**最佳实践**：
- `primitives/*` 目录**禁止** import 任何 `@angular/core` 路径
- 子包内部也分层：`primitives/signals` → `primitives/di` → `primitives/event-dispatch`
- 子包可独立发布到 npm——`@angular/signals` 已有 preview
- 框架概念（@Component / DI token）只在 `core` 层加挂
- DevTools 独立子仓——与 core 解耦后可独立发版

---

## 2. 编译层

### 模式 6：模板 IR Pipeline 替代 AST→Code 直译

**问题场景**：直接 `template AST → template function code` 的编译器缺引用、难 ID 化、source map 错位。引入 IR（中间表示）让 tree-shake、增量编译、source map 都成为可能。

**解决方案代码**：
```typescript
// packages/compiler/src/template/pipeline/src/compilation.ts
class CompilationJob {
  units: CompilationUnit[] = [];
  ir = createIR();  // 中间表示
  refEmitter = new ReferenceEmitter();
  // ...
}

function compile(job: CompilationJob): Output {
  // Phase 1: AST → IR（ops + xrefId）
  const ops = astToIR(job.units[0].component);
  // Phase 2: 优化 Pass（变量提升、命名空间压缩、Slot 提取）
  optimizeIR(ops);
  // Phase 3: IR → ɵɵ* 指令
  const code = emitInstructions(ops);
  return code;
}
```

**关键参数表**：
| 编译步骤 | 输入 | 输出 | 收益 |
|:---|:---|:---|:---|
| AST → IR | HTML/AST | `CreateElementOp` / `PropertyOp` 等 | 易做优化、source map |
| IR 优化 Pass | IR | 紧凑 IR | 变量提升、命名空间压缩 |
| IR → Code | IR | `ɵɵelementStart(...)` 指令流 | 与 Ivy 运行时对齐 |

**最佳实践**：
- 每个 IR op 必须带 `xrefId`——source map 还原位置信息
- 优化 Pass**可插拔**——未来加新 Pass 不动其他 Pass
- `TemplateCompilationMode.Full` 支持指令 + HTML 元素，`DomOnly` 只支持元素
- DomOnly 模式编译产物**更小**——Angular 内部 Component / host 编译优先用
- IR 比 AST 多一层，但换来**增量编译**与**tree-shaking**的可行性

---

### 模式 7：ɵɵ 指令集的单态化（monomorphic）

**问题场景**：运行时调用不同形状的指令会让 V8 走 megamorphic 路径，性能下降 4×。Ivy 用**统一指令签名**+**指令 ID**确保所有调用 monomorphic。

**解决方案代码**：
```typescript
// packages/core/src/render3/instructions/element.ts
export function ɵɵelementStart(index: number, name: string, ...attrs): void {
  // 统一指令签名：index + name + attrs
  // 所有元素创建都走这里
  ngDevMode && ngDevMode.elementStart(index, name);
  const lView = getLView();
  const tNode = getTNode(index, lView);
  // ...
}

export function ɵɵtext(index: number, value: string): void {
  // 文本节点单态
}

export function ɵɵadvance(index: number): void {
  // 跳过空白节点
}
```

**关键参数表**：
| 指令 | 签名 | 用途 |
|:---|:---|:---|
| `ɵɵelementStart` | `(index, name, attrs)` | 创建元素 |
| `ɵɵtext` | `(index, value)` | 创建文本 |
| `ɵɵadvance` | `(index)` | 跳过 / 跳过空白 |
| `ɵɵproperty` | `(index, name, value)` | 属性绑定 |
| `ɵɵconditional` | `(index, condition, trueBranch, falseBranch?)` | `@if` |
| `ɵɵrepeater` | `(index, trackByFn, ...values)` | `@for` |

**最佳实践**：
- 所有指令**前 1-2 个参数**用 `(index, name)`——固定形状 → V8 monomorphic
- 复杂数据走 `LView` 数组下标寻址——避免指令参数膨胀
- 编译时按控制流插桩 `ɵɵconditional` / `ɵɵrepeater`——模板写法与指令 1:1 映射
- `ɵ` 前缀是"私有 API"——告诉用户"勿直接调用"
- PERF_NOTES.md 强调"monomorphic call 比 megamorphic 快 4×"

---

### 模式 8：指令代替装饰器，静态字段读取

**问题场景**：`@Component / @Directive / @Injectable` 在运行时依赖 `reflect-metadata` 反射读取参数——增加 100KB+ 启动开销。Angular 用 `ɵɵdefineComponent` 静态字段替代，**纯函数式**读取。

**解决方案代码**：
```typescript
// 编译产物（伪代码）
export class AppComponent {
  static ɵɵcmp = ɵɵdefineComponent({
    type: AppComponent,
    selectors: [['app-root']],
    factory: () => new AppComponent(),
    template: (rf: RenderFlags, ctx: AppComponent) => {
      if (rf & RenderFlags.Create) {
        ɵɵelementStart(0, 'button');
        ɵɵlistener('click', ctx.inc);
        ɵɵtext(1);
      }
      if (rf & RenderFlags.Update) {
        ɵɵtextBinding(1, ctx.count());
      }
    },
  });
}
```

**关键参数表**：
| 装饰器 | 静态字段 | 用途 |
|:---|:---|:---|
| `@Component` | `static ɵɵcmp` | 组件元数据 |
| `@Directive` | `static ɵɵdir` | 指令元数据 |
| `@Injectable` | `static ɵɵprov` | DI 工厂 |
| `@Pipe` | `static ɵɵpipe` | 管道元数据 |

**最佳实践**：
- `ɵɵdefineComponent` 接收纯对象字面量——可序列化、可静态分析
- AOT 编译时把所有装饰器转换为静态字段——JIT 也走同一份运行时
- 反射 API 依赖降为 0——bundle 减小 100KB+
- `template` 函数按 `RenderFlags.Create` / `Update` 分段——首次渲染 vs 更新走不同分支
- `factory` 字段是 `() => new AppComponent()`——DI 知道怎么实例化

---

### 模式 9：LView 数组的 SoA 分段布局

**问题场景**：每个组件实例需要存 DOM 节点、绑定值、查询节点、HostBinding 等多类数据。用对象 `{dom, comp, bindings}` 会出现 hidden class 切换；用 `any[]` 模拟 SoA 可获得 monomorphic。

**解决方案代码**：
```typescript
// packages/core/src/render3/VIEW_DATA.md（伪代码）
// LView: any[]，分段布局
//  [0..HEADER] HEADER
//  [HEADER+1..HEADER+DECLS_LEN] DECLS
//  [HEADER+DECLS+1..HEADER+DECLS+VARS_LEN] VARS
//  [...EXPANDO] EXPANDO（动态扩展）

const HEADER = 12;  // 上下文指针、状态等固定字段
// DECLS: 创建期分配的 DOM / pipe / local ref
// VARS: 绑定值
// EXPANDO: hostBindings、query results、dynamic nodes
```

**关键参数表**：
| 段 | 长度 | 内容 | 写入时机 |
|:---|:---|:---|:---|
| HEADER | 固定 ~12 | context、state、parent | 构造 |
| DECLS | 计算时确定 | DOM、pipe、ref | 创建期 |
| VARS | 编译时确定 | 绑定值 | 更新期 |
| EXPANDO | 动态 | host bindings、query、动态节点 | 运行期 |

**最佳实践**：
- 4 段长度 JIT/AOT 都能在创建期算出——避免 resize
- `TView.data` 跟 `LView` 用同一索引——`LView[123]` 是实例，`TView.data[123]` 是类型元数据
- `any[]` 是性能妥协——`[DOM, Component, Binding, Query]` 多类型数组会让 V8 hidden class 切换
- "Each Array costs 70 bytes"——用空间换 monomorphic
- EXPANDO 段允许运行期动态扩展——host bindings/query results 在创建后才能确定

---

### 模式 10：tree-shaking 优先与 enum 规避

**问题场景**：TypeScript `enum` 编译成 IIFE，**不能** tree-shake——5 个 enum 全部打入 bundle。Angular 用字符串字面量 + 编译期裁剪规避。

**解决方案代码**：
```typescript
// 反例：enum 不可 tree-shake
export enum ChangeDetectionStrategy {
  Default = 0,
  OnPush = 1,
}
// 编译产物：var ChangeDetectionStrategy = { Default: 0, OnPush: 1 } — 全部打入

// 正例：字符串字面量 + 类型 union
export type ChangeDetectionStrategy = 'Default' | 'OnPush';
export const ChangeDetectionStrategy = {
  Default: 'Default' as const,
  OnPush: 'OnPush' as const,
};
// 编译产物：const ChangeDetectionStrategy = { Default: 'Default', OnPush: 'OnPush' }
// bundler 能识别"只用了 OnPush"并裁剪 Default
```

**关键参数表**：
| TS 特性 | 编译产物 | Tree-shakable | 替代方案 |
|:---|:---|:---|:---|
| `enum` | IIFE | ❌ | 字符串字面量 + type union |
| `const enum` | 内联 | ✅ | 字符串字面量（无运行期） |
| `namespace` | IIFE | ❌ | 静态方法 / 独立文件 |
| `class` | function | ✅ | 默认就是 |

**最佳实践**：
- 内部 enum 全部用**字符串字面量 + type union**——TREE_SHAKING.md 全文论证
- `public-api` 字段用 `const` 对象 + `as const`——保留类型
- 公共 API 黄金快照——`goldens/public-api/*.d.ts` 跑 CI 校验 export 稳定性
- enum 改名 PR 必须经 maintainer review——破坏 tree-shaking
- 任何 PR 加 `enum` 关键词都会被 reviewer 提醒

---

## 3. 运行时层

### 模式 11：Signals 取代 ZoneJS 的反应源

**问题场景**：ZoneJS 通过 monkey-patch 全局 API（setTimeout/Promise/Event）追踪变更源——50KB+ 运行时、心智模型黑魔法。Signals 显式声明依赖，**0 monkey-patch**。

**解决方案代码**：
```typescript
// packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts
class ChangeDetectionSchedulerImpl {
  private useMicrotaskScheduler = true;  // Zoneless 模式
  
  notify(): void {
    if (!this.useMicrotaskScheduler) return;
    this.pendingFlag = true;
    scheduleCallbackWithMicrotask(() => {
      if (this.pendingFlag) {
        this.pendingFlag = false;
        this.appRef.tick();
      }
    });
  }
}

// 模板里读 signal 时建依赖边
function consumerOnSignalRead(node: ReactiveNode): void {
  const consumer = activeConsumer;
  if (consumer) {
    // 把 signal 节点挂到 consumer 的 producers 链表
    node.producer.next = consumer.producer.next;
    // ...
  }
}
```

**关键参数表**：
| 维度 | ZoneJS | Signals |
|:---|:---|:---|
| 反应源 | 全局 API monkey-patch | 显式 `signal/computed/effect` |
| Bundle | 50KB+ | < 5KB |
| 依赖追踪 | 黑魔法 | 显式链表 |
| 心智模型 | "我调了任何 API 都触发 CD" | "signal 写触发 CD" |
| 性能 | 每次操作都有 monkey-patch 开销 | 仅 signal 写时记录 |

**最佳实践**：
- Zoneless 是 ZoneJS 之上的**叠加能力**——不破坏旧模式
- `provideExperimentalZonelessChangeDetection()` 作为可选 provider 引入
- `useMicrotaskScheduler` 强制 false 避免与 Zone 重复触发 CD
- `CONSECUTIVE_MICROTASK_NOTIFICATION_LIMIT = 100` 防无限 dirty 循环
- zoneless 下写 `setTimeout` 不会自动触发 CD——必须用 `afterNextRender` 或 effect

---

### 模式 12：微任务合并 + 100 次限制

**问题场景**：单次 click 可能触发 N 次 signal 写，N 次 CD 浪费 CPU。`scheduleCallbackWithMicrotask` 把多次写合并为一次 tick；但**无限循环**（signal 写触发 effect 写回 signal）会让浏览器卡死。

**解决方案代码**：
```typescript
// zoneless_scheduling_impl.ts
let consecutiveMicrotaskNotifications = 0;
const CONSECUTIVE_MICROTASK_NOTIFICATION_LIMIT = 100;

function trackMicrotaskNotificationForDebugging(): void {
  if (++consecutiveMicrotaskNotifications >= CONSECUTIVE_MICROTASK_NOTIFICATION_LIMIT) {
    // 抓 stack 抛出
    throw new RuntimeError(RuntimeErrorCode.INFINITE_CHANGE_DETECTION);
  }
}
```

**关键参数表**：
| 阈值 | 含义 | 调整策略 |
|:---|:---|:---|
| `100` | 连续 100 次微任务 | dev 模式抛错，prod 模式 reset |
| 合并周期 | 1 个微任务 | 微任务队列清空时 |
| 触发器 | `pendingFlag = true` | 多次写合 1 次 |

**最佳实践**：
- 100 次是经验值——人眼能感觉的"卡"在 ~1s 内 60 帧
- dev 抛错 + stack 抓取——快速定位递归源头
- prod 静默 reset——避免线上崩溃
- 与 `ngZone.onUnstable` 互斥——避免双跑 CD
- 模板里**禁止**在 `*ngFor`/`@if` 表达式中写 signal——会抛 `INVALID_WRITE_TO_SIGNAL`

---

### 模式 13：Hydration 增量注水策略

**问题场景**：SSR 渲染的 HTML 上线后，传统"整体重 hydrate"会重新走遍整棵 DOM 树，TTI 慢。Incremental Hydration 只对**触发的 `@defer` 块**下载 JS 并 hydrate。

**解决方案代码**：
```typescript
// packages/core/src/hydration/incremental_runtime.ts
function hydrateDeferBlock(block: DeferBlockInternalState): void {
  // 按需注水——只有触发 hover/click/timer 的块才下载 JS
  if (block.state === 'serialized') {
    loadAndExecuteBlock(block);
    block.state = 'hydrated';
  }
}
```

**关键参数表**：
| 阶段 | 状态 | 行为 |
|:---|:---|:---|
| SSR 完成 | `serialized` | DOM 节点在，JS 未下载 |
| 触发器触发 | `loading` | 下载 chunk + 模板函数 |
| 注水完成 | `hydrated` | 接管事件监听 |

**最佳实践**：
- `provideClientHydration(withIncrementalHydration())` 显式启用
- `@defer (on hover)` / `@defer (on viewport)` 都是 trigger 配置
- 未触发的块保持 `serialized` 状态——**TTI 显著降低**
- 触发后 JS chunk 走 `import()` 动态加载——首屏 0 阻塞
- NGH（Native Garbage-free Hydration）序列化元数据——避免重复请求

---

### 模式 14：WebMCP 把 AI Agent 当 DI Provider

**问题场景**：AI agent 越来越需要"调用前端组件的能力"——发 HTTP、调弹窗、读 form 状态。传统 Web 缺少标准协议；MCP（Model Context Protocol）成为事实标准。

**解决方案代码**：
```typescript
// packages/core/src/webmcp/index.ts
bootstrapApplication(App, {
  providers: [
    provideTools([
      {
        name: 'submitForm',
        description: 'Submit the current form',
        parameters: z.object({ id: z.string() }),
        execute: ({ id }, injector) => {
          const form = injector.get(FORM_TOKEN, id);
          return form.submit();
        },
      },
    ]),
  ],
});
```

**关键参数表**：
| 元素 | 选择 | 备注 |
|:---|:---|:---|
| 协议 | MCP（Model Context Protocol） | Anthropic 提出，2024 标准 |
| 注册方式 | DI Provider | 与 Router/Forms 同级 |
| 参数校验 | Zod schema | 类型安全 |
| 工具调用 | `execute(args, injector)` | 拿 DI 容器 |
| 来源 | Angular 22.0 实验引入 | 跟随 LLM 趋势 |

**最佳实践**：
- 工具定义走 Zod schema——既是校验又是文档
- `injector` 参数让工具**复用 DI**——避免传全局 state
- 实验性 API 走 `provideExperimentalWebMCP()` 命名空间
- AI agent 通过 MCP server 调前端——前后端**协议统一**
- 国内 AI Agent 生态尚不成熟——WebMCP 是先手布局

---

### 模式 15：afterRender 阶段化钩子

**问题场景**：DOM 测量（如 `getBoundingClientRect`）必须在 DOM 更新后跑，但变更检测钩子 `ngAfterViewInit` 与"DOM 真正绘制"之间存在时间差。

**解决方案代码**：
```typescript
// packages/core/src/render3/after_render/hooks.ts
afterNextRender(() => {
  const rect = this.canvas.getBoundingClientRect();
  this.renderer.setSize(rect.width, rect.height);
}, { phase: AfterRenderPhase.Write });

// 阶段枚举
enum AfterRenderPhase {
  EarlyRead,    // 读 DOM
  Write,        // 写 DOM
  MixedReadWrite,
  Read,
}
```

**关键参数表**：
| 阶段 | 时机 | 适用 |
|:---|:---|:---|
| EarlyRead | DOM 更新后、首次绘制前 | `getBoundingClientRect` |
| Write | EarlyRead 后 | 写 DOM |
| MixedReadWrite | Write 后 | 混合 |
| Read | 第一次绘制后 | 慢测量 |

**最佳实践**：
- `afterNextRender` 跑一次，`afterRender` 每次 CD 后跑
- Zoneless 模式下 `afterRender` 是**唯一**的 DOM 测量钩子
- 阶段化让"读 → 写 → 读"分离——避免强制重排
- 服务端渲染下 `afterRender` **不**跑——用 `afterNextRender` 时要 guard
- 与 effect 区分：effect 跑在 reactive 图，afterRender 跑在 DOM 阶段

---

## 4. 平台与工具

### 模式 16：Bazel + pnpm 双轨构建

**问题场景**：Angular 单仓 10k+ 文件，编译/测试/打包全靠 npm scripts 慢如蜗牛。Bazel 提供增量编译 + Remote Cache，pnpm 提供 monorepo 依赖管理——双轨结合。

**解决方案代码**：
```yaml
# MODULE.bazel（Bazel 7+）
module(
    name = "angular",
    version = "22.0.0",
    compatibility_level = 1,
)

bazel_dep(name = "rules_nodejs", version = "6.3.0")
bazel_dep(name = "aspect_rules_js", version = "2.0.0")
```

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'modules/*'
  - 'integration/*'
  - 'adev'
  - 'devtools'
```

**关键参数表**：
| 构建工具 | 用途 | 关键能力 |
|:---|:---|:---|
| Bazel | 源码编译、测试 | 增量、Remote Cache、`ibazel` watch |
| pnpm | 运行时包管理 | workspace、`pnpm install --frozen-lockfile` |
| esbuild | docs / DevTools 打包 | 极快冷启动 |
| rollup | 库打包 | tree-shaking 强 |

**最佳实践**：
- 源码 / 构建走 Bazel，**所有 BUILD.bazel 必须提交**——用户不需要懂 Bazel 也能 build
- 运行时包元数据走 pnpm——`package.json` + `pnpm-lock.yaml` 锁定
- `pnpm install --frozen-lockfile` 强制使用 lockfile——保证 CI 一致
- ibazel watch + `pnpm test:ci` 组合——文件改动后自动跑相关测试
- Remote Cache 跨 CI 复用——PR build 时间从 30 min 降到 5 min

---

### 模式 17：Standalone API 全面落地

**问题场景**：NgModule 在 14 之前是"必须"——但用户反馈"配置噪音大于价值"。Standalone 让 Component/Directive/Pipe**直接可 bootstrap**，绕过 NgModule。

**解决方案代码**：
```typescript
// 14.x 之前：必须 NgModule
@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, FormsModule],
  bootstrap: [AppComponent],
})
class AppModule {}

// 15.x+：Standalone
bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideHttpClient()],
});

// 17.x+：控制流语法
@Component({
  template: `
    @if (user.isAdmin) {
      <admin-panel />
    } @for (item of items(); track item.id) {
      <item-card [item]="item" />
    }
  `,
})
```

**关键参数表**：
| 元素 | 旧 (NgModule) | 新 (Standalone) |
|:---|:---|:---|
| 启动方式 | `platformBrowserDynamic().bootstrapModule(AppModule)` | `bootstrapApplication(App, providers)` |
| Component 声明 | 必须 `declarations` 数组 | 直接 import |
| 路由 | `RouterModule.forRoot(routes)` | `provideRouter(routes)` |
| HTTP | `HttpClientModule` | `provideHttpClient()` |
| 控制流 | `*ngIf / *ngFor` | `@if / @for` |

**最佳实践**：
- 17.x 后 `*ngIf / *ngFor` 仍兼容，但**新项目必须用 `@if / @for`**
- Standalone 让 tree-shaking 更彻底——NgModule 容易把整批组件拉进来
- `provideRouter` / `provideHttpClient` / `provideAnimations` 等都走 `provide*` 工厂
- 19.x 后 Standalone 是**默认**——`@NgModule` 仅遗留
- 控制流语法编译为 `ɵɵconditional` / `ɵɵrepeater` 指令——性能与 *ngFor 持平

---

### 模式 18：公共 API 黄金快照 + PullApprove 路由

**问题场景**：monorepo 30+ 维护者，PR 一不小心 export 改了 → 破坏下游用户。公共 API 黄金快照 + 40+ reviewer 路由**双重保险**。

**解决方案代码**：
```typescript
// goldens/public-api/core/index.d.ts（黄金快照）
export declare class ApplicationRef {
    static ɵfac: ɵɵFactoryDeclaration<ApplicationRef>;
    // ...
    tick(): void;
}

// pnpm public-api:check
// 比对实际 public API 与 goldens/* 的 diff，CI 失败
```

```yaml
# pullapprove.yml
groups:
  - name: "core-runtime"
    reviewers:
      - minko
      - igor
    conditions:
      - "'packages/core/**' in files"
  - name: "compiler"
    reviewers:
      - dylhunn
    conditions:
      - "'packages/compiler/**' in files"
```

**关键参数表**：
| 防线 | 工具 | 触发 |
|:---|:---|:---|
| 黄金快照 | `goldens/public-api/*.d.ts` | `pnpm public-api:check` |
| PullApprove | `pullapprove.yml` | 40+ reviewer 自动路由 |
| CLA | `cla: yes` 标签 | Google CLA 机器人 |
| API 变更标签 | `feat(api)` | 公共 API 变更必须前缀 |

**最佳实践**：
- 黄金快照**必须提交**——它是事实标准，不是参考
- 任何公共 API 变更需要 `feat(api): xxx` 前缀 + maintainer review
- 40+ reviewer 路由按文件路径自动分配——避免 1 个 reviewer 看所有
- CLA 检查自动化——Google CLA 机器人验签
- `area: *` + `comp: *` 双标签路由到对应维护者

---

### 模式 19：DevTools 独立子仓 + Graph 导出

**问题场景**：DevTools 与 core 耦合会导致发版节奏冲突；DevTools 需要"看穿"框架的 DI 图、Signal 图——需要框架主动暴露数据。

**解决方案代码**：
```typescript
// packages/core/primitives/devtools/ —— 框架侧
class DevToolsProfiler {
  exportGraph(): GraphJSON {
    return {
      nodes: Array.from(signals.values()).map(s => ({
        id: s.id,
        value: s.value,
        consumers: s.consumers.map(c => c.id),
      })),
      edges: [...],
    };
  }
}

// devtools/ —— Chrome 扩展侧（独立子仓）
chrome.devtools.network.onRequestFinished.addListener(req => {
  // 把 GraphJSON 渲染成力导向图
});
```

**关键参数表**：
| 模块 | 路径 | 发版节奏 |
|:---|:---|:---|
| core | `packages/core/` | 半年一次大版本 |
| DevTools | `devtools/` | 独立节奏，2-3 月一次 |
| 协议 | Profiler API + JSON | 双向桥接 |

**最佳实践**：
- 框架侧暴露 `exportGraph()`——DevTools 不需要 hack 内部状态
- DevTools 走独立子仓——发版节奏不绑死 Angular
- Profiler API 标准化——`@angular/core/primitives/devtools` 子包
- JSON 序列化是"安全"边界——DevTools 崩溃不影响 Angular
- DevTools 子包提供 Cypress E2E——可视化测试

---

### 模式 20：Zoneless 提供商化 + 实验 API 命名空间

**问题场景**：新特性如果作为"配置参数"硬塞——用户升级就被迫接受。Zoneless / WebMCP / Resource API 等用 `provideExperimental*` 命名空间引入，**用户主动 opt-in**。

**解决方案代码**：
```typescript
// 反例：硬塞配置
bootstrapApplication(App, {
  zoneless: true,  // 破坏性升级
});

// 正例：Provider 工厂
bootstrapApplication(App, {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideExperimentalWebMCP(),
  ],
});
```

**关键参数表**：
| 实验 API | 命名空间 | 状态 |
|:---|:---|:---|
| Zoneless | `provideExperimentalZonelessChangeDetection` | 18.x 实验 → 22 稳定中 |
| WebMCP | `provideExperimentalWebMCP` | 22.x 引入 |
| Resource | `resource` API | 19.x 稳定 |
| Signal Forms | — | 20.x 实验 |

**最佳实践**：
- 实验 API 必须用 `Experimental` 前缀——明示"非稳定"
- 文档明确"何时移除 Experimental 前缀"——给用户预期
- 与 Router / Forms 同级——`provide*` 工厂模式
- 不在 stable API 中混用 experimental——避免"半 stable"
- 用户升级时不需要立即接受——按需 opt-in

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | `github.com/angular/angular` |
| 协议 | MIT |
| 总文件 | 10,553 |
| 主语言 | TypeScript 6.0.3 |
| 构建 | Bazel + pnpm 双轨 |
| 包管理 | pnpm 11.3.0 |
| 状态 | 22.1.0-next.0 活跃 |
| 团队 | Google Angular Team + 30+ 维护者 |
| 关键里程碑 | 2.x 重写 → 9.x Ivy → 13.x VE 移除 → 16/17.x Signals → 18+ Zoneless → 22 WebMCP |
