# storybook - 元数据协议

**来源**：GitHub storybookjs/storybook（v10.4.x 系列，HEAD `d6ce689`）
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. 故事索引（StoryIndex）

**问题场景**：
当项目里同时存在上万个 story（.stories.* 文件）时，传统"启动时 import 全部入口"的方式会让首屏 JS 体积爆炸、解析耗时飙升。Storybook 需要一种"元数据先行、实现按需"的策略，让 manager 在不读用户代码的前提下知道有哪些 story 存在。

**解决方案**：

```typescript
// code/core/src/core-server/utils/StoryIndexGenerator.ts
// build 阶段扫 .stories.* 文件，产出一份元数据 JSON
export class StoryIndexGenerator {
  async extractStories(specifier: NormalizedStoriesSpecifier) {
    // 1. glob 找到所有 .stories.*
    const files = await glob(specifier.files, { cwd: specifier.directory });
    // 2. AST 解析每个文件、提取 default export + named exports
    const entries = await this.analyze(files);
    // 3. 生成 { v:5, entries: { "Button--primary": { id, title, importPath, ... } } }
    return { v: 5, entries };
  }
}
```

```typescript
// preview 端按需 import
const story = await this.importFn(importPath); // importPath 来自 index.json
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `index.json v` | 5 | 当前 schema 版本，v6 在 v10 引入 |
| `specifier.files` | `**/*.stories.@(ts\|tsx\|js\|jsx)` | 匹配规则 |
| `extractStories.concurrency` | 4-8 | AST 解析并发数 |
| `lazyImport` | true | preview 默认开启 |
| `cacheFilePath` | `.storybook/index.json.cache` | 缓存命中跳过 AST |

**最佳实践**：
1. ✅ 把 `index.json` 落到 git，让首屏构建 O(1) 文件读
2. ✅ 通过 AST 而不是 eval 拿元数据（隔离用户代码）
3. ✅ 在 CI 缓存 `index.json.cache` 提速 5-10 倍
4. ✅ 同一 `importPath` 在不同 specifier 合并去重
5. ✅ 用 `tags` 字段给 story 打标，`docsOnly`/`testOnly` 用来隔离环境

---

### 2. 跨帧信道（Channel + postMessage）

**问题场景**：
Storybook 的 manager（主窗口 React 应用）和 preview（iframe 沙盒）是两个独立的 JavaScript 运行时——它们在浏览器层面就是跨 origin 通信。需要一个"事件总线 + 可注入 transport"的基础设施，让 addon 在两端互通。

**解决方案**：

```typescript
// code/core/src/channels/main.ts
export class Channel {
  private listeners = new Map<string, (event: any) => void>();
  constructor(public readonly transports: ChannelTransport[] = []) {}

  on(eventName: string, handler: (e: any) => void) {
    this.listeners.set(eventName, handler);
  }
  emit(eventName: string, payload: any) {
    const event = { type: eventName, payload, from: this.sender };
    // 1) 同步通知本地监听者
    this.listeners.get(eventName)?.(event);
    // 2) 通过 transport 广播到对端（默认 postMessage）
    this.transports.forEach((t) => t.send(event));
  }
}
```

```typescript
// postMessage transport 用了 telejson 序列化（支持 RegExp/Date/Error/Map）
import { stringify, parse } from 'telejson';
window.parent.postMessage(stringify({ key, event }), '*');
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `Channel.isAsync` | false（默认） | 同步 emit 走 setImmediate，异步用 setTimeout |
| `telejson.maxDepth` | 25 | 防循环引用 |
| `allowedOrigins` | `['*']` | 跨 origin 必备，lockdown 后可收紧 |
| `event.prefix` | `STORYBOOK_` | 协议前缀 |
| `reconnect` | true | v10 transport 断线重连 |

**最佳实践**：
1. ✅ event name 集中在 `core-events/index.ts` 193 行 enum 当协议
2. ✅ 永远用 `telejson` 而非 `JSON.stringify`——后者丢 Date/RegExp
3. ✅ 默认 `isAsync: false`，addon 互相 observe 才有同步语义
4. ✅ transport 列表可注入，方便测试用 MemoryChannel
5. ✅ channel.error / channel.warn 也要 emit 出来，addon 才能接

---

### 3. 异步 Ready 模式（Preview 基类）

**问题场景**：
`Preview` 在构造时就要 fire-and-forget 启动 store 初始化，但 `channel.emit`、addon 注册、首个 `prepareStory` 都依赖 store ready。JavaScript 构造函数无法 await，又不能阻塞——需要一个"暴露显式 Promise + 内部 resolve 句柄"机制。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/preview-web/Preview.tsx:60
export class Preview<TRenderer extends Renderer> {
  protected storeInitializationPromise: Promise<void>;
  protected resolveStoreInitializationPromise!: () => void;
  protected rejectStoreInitializationPromise!: (err: unknown) => void;

  constructor(
    public importFn: ModuleImportFn,
    public getProjectAnnotations: () => MaybePromise<ProjectAnnotations<TRenderer>>,
    protected channel: Channel = addons.getChannel(),
    shouldInitialize = true
  ) {
    this.storeInitializationPromise = new Promise((resolve, reject) => {
      this.resolveStoreInitializationPromise = resolve;
      this.rejectStoreInitializationPromise = reject;
    });
    if (shouldInitialize) this.initialize();
  }

  ready() {
    return this.storeInitializationPromise;
  }

  get storyStore(): StoryStore<TRenderer> {
    // 未 ready 时调任何方法抛 StoryStoreAccessedBeforeInitializationError
    if (!this.storyStoreValue) throw new StoryStoreAccessedBeforeInitializationError();
    return this.storyStoreValue;
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `shouldInitialize` | true | 测试场景传 false，构造后再手动调用 |
| `timeoutMs` | 5000 | ready() 的默认超时 |
| `Error` | `StoryStoreAccessedBeforeInitializationError` | 显式异常类，便于 catch |
| `Promise.unhandledRejection` | reject | 暴露 reject 让上层能 catch |

**最佳实践**：
1. ✅ 暴露 `ready()` Promise + 内部 resolve 句柄，外部 `await` 不会阻塞构造
2. ✅ store accessor 上挂 Proxy，未 ready 调用立刻抛显式错误
3. ✅ `shouldInitialize` 参数让单元测试可手动控制时序
4. ✅ `initialize()` 内捕获 reject 并 emit 到 channel，让 UI 看到错误
5. ✅ 永远不要 `await this.initialize()` 在构造里——会变同步启动

---

### 4. 装饰链一次性焊接（prepareStory）

**问题场景**：
每个 story 都有 project/component/story 三层 decorators、loaders、beforeEach、afterEach、play function。如果每次 render 时再拼一次，args 变化的开销是 O(N × 装饰层数)。需要"prepare 阶段一次焊死，render 阶段只 dispatch"。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/store/csf/prepareStory.ts:37
const decoratedStoryFn = applyHooks<TRenderer>(applyDecorators)(
  undecoratedStoryFn,
  decorators
);

return {
  ...partialAnnotations,
  applyLoaders: async (context) => {
    // 闭包捕获三层 loaders，按顺序合并
    await runLoaders(project.loaders, context);
    await runLoaders(component.loaders, context);
    await runLoaders(story.loaders, context);
  },
  applyBeforeEach: (context) => {
    [...project.beforeEach, ...component.beforeEach, ...story.beforeEach]
      .forEach((fn) => fn(context));
  },
  applyAfterEach: (context) => {
    // LIFO cleanup —— 后注册的先跑
    [...story.afterEach, ...component.afterEach, ...project.afterEach]
      .reverse()
      .forEach((fn) => fn(context));
  },
  playFunction,
  mount
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `decorators` | 3-5 层 | 多了 prepare 阶段变慢 |
| `loaders` | data fetching | 1-2 层足够 |
| `beforeEach` | 重置全局状态 | 慎用，每次 render 都跑 |
| `afterEach.reverse` | true | LIFO 清理 |
| `play function` | 异步测试 | v8 CSF3 引入 |

**最佳实践**：
1. ✅ prepare 阶段用闭包捕获三层 annotations，render 阶段只 dispatch
2. ✅ `applyAfterEach` 必须 reverse()——LIFO 才能正确清理
3. ✅ 装饰链用 `applyHooks(applyDecorators)` 组合（hook 计数有状态）
4. ✅ `playFunction` 失败抛 `PlayFunctionTimeoutError`，addon 才能捕获
5. ✅ 不要在 prepare 里读 `args`——args 是 render 时才定的

---

### 5. AddonStore 单例 + Channel 总线

**问题场景**：
Addon 之间需要互相 observe（a11y addon 想看 docs addon 切换、actions 想看 args 变化）。直接 import 会循环依赖。需要一个"全局单例 + 共享 channel"的基础设施，让任意包都能拿到同一份 addon 注册表。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/addons/main.ts:7
class AddonStore {
  private elements: Record<string, Addon> = {};
  private channel: Channel | null = null;

  register(addon: Addon) {
    Object.entries(addon).forEach(([key, value]) => {
      this.elements[key] = { ...this.elements[key], ...value };
    });
  }
  getChannel() {
    if (!this.channel) this.channel = new Channel({});
    return this.channel;
  }
}

// 挂在 globalThis 上，preview iframe 内任何模块都能拿到
globalThis.__STORYBOOK_ADDONS_PREVIEW__ = addons;
```

```typescript
// addon 注册：每个 addon 暴露 default export
export default {
  title: 'a11y',
  paramKey: 'a11y',
  run: (state, api) => {
    api.channel.on(STORY_RENDERED, () => runAxe());
  }
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `AddonStore` | globalThis 单例 | 不走 DI |
| `paramKey` | addon 唯一 id | 避免和 meta.parameters 冲突 |
| `channel.on` | STORY_RENDERED / SET_CURRENT_STORY | 标准事件 |
| `global key` | `__STORYBOOK_ADDONS_PREVIEW__` | 仅 preview 用 |
| `manager key` | `__STORYBOOK_ADDONS_MANAGER__` | manager 端独立 |

**最佳实践**：
1. ✅ AddonStore 是单例，但 channel 是实例——测试可注入 MemoryChannel
2. ✅ 每个 addon 暴露 default export（`{ title, paramKey, run }`）而非类
3. ✅ addon 内部用 `useChannel` / `useAddonState` hooks 而非直接 on()
4. ✅ 不要在 addon 里 `import` manager 代码——会被 preview bundle 进去
5. ✅ `paramKey` 必须和 addon 名字一致，meta 里才能用

---

## 二、架构设计

### 6. 双运行时隔离（Manager + Preview iframe）

**问题场景**：
用户的 CSF 文件可能引入了任意 React/Vue/Svelte 组件、用了任意全局副作用（修改 `window.__xxx__`）。如果 manager 直接 import，会污染主窗口 UI——story 之间也会相互影响。需要把"组件实现"放到独立 origin 的 iframe 沙盒里执行。

**解决方案**：

```
+-----------------------------+         postMessage         +-----------------------+
|  Manager (主窗口)           |  <------------------------>  |  Preview iframe        |
|  React 应用 + Sidebar/      |  Channel: SET_CURRENT_STORY |  独立 origin 沙盒       |
|  Canvas/Panel               |  /STORY_RENDERED /DOCS_... |  跑用户的 CSF 文件      |
+-----------------------------+                              |  StoryStore + Preview  |
        |                                                     +-----------------------+
        |  fetch /index.json
        v
+-----------------------+
|  Builder (Node 端)    |
|  Vite/Webpack dev srv |
|  生成 index.json       |
+-----------------------+
```

```typescript
// 加载顺序：manager bundle -> 创建 iframe -> iframe fetch index.json -> 准备 store
const iframe = document.createElement('iframe');
iframe.src = '/iframe.html';
iframe.id = 'storybook-preview-iframe';
container.appendChild(iframe);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `iframe.origin` | 同源 | 跨 origin 需 `crossOriginIsolated` |
| `sandbox` | `allow-scripts allow-same-origin` | 关闭 `allow-top-navigation` |
| `lazy` | true | 默认按需加载 CSF |
| `viewport` | 自适应 | preview 自带 toolbar 切尺寸 |

**最佳实践**：
1. ✅ preview iframe 必须同 origin + sandbox 属性最小化
2. ✅ manager 和 preview 不共享 React 上下文——避免版本冲突
3. ✅ iframe URL 加随机 token，防第三方嵌入
4. ✅ 跨 tab 协作时切到 WebSocket transport（同 origin 仍可用 SharedWorker）
5. ✅ DevTools / a11y addon 跑在 preview iframe 内（离用户组件近）

---

### 7. Render 抽象（Render<TRenderer>）

**问题场景**：
Storybook 支持 React/Vue/Svelte/Preact/HTML/Server 等 12 个框架，每个框架的"挂载组件"API 都不同（React 是 `createRoot`，Vue 是 `createApp`，Svelte 是 `new Component`）。Manager 不需要关心用户点的是 React story 还是 Vue story——需要一个 `Render<TRenderer>` 接口把渲染逻辑抽象掉。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/preview-web/render/Render.ts:14
export abstract class Render<TRenderer extends Renderer> {
  protected canvasElement: TRenderer['canvasElement'];
  public abstract type: 'story' | 'docs' | 'mdx';
  public abstract storyFn: (ctx: StoryContext) => TRenderer['storyResult'];
  public abstract render(context: RenderContext): Promise<void>;
  public abstract rerender(): Promise<void>;
  public abstract unmount(): Promise<void>;
  public abstract forceRemount(): Promise<void>;
}

// 三种 subtype：StoryRender / CsfDocsRender / MdxDocsRender
class StoryRender<TRenderer> extends Render<TRenderer> {
  async render(context) { /* React 走 createRoot，Vue 走 createApp */ }
  async unmount() { /* framework-specific 清理 */ }
}
```

```typescript
// React renderer 适配
// code/renderers/react/src/render.tsx:7
export async function renderToCanvas(
  storyFn: ReactElement | ReactPortal,
  canvasElement: HTMLElement
) {
  const root = createRoot(canvasElement);
  root.render(<>{storyFn}</>);
  return () => root.unmount();
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `Renderer.name` | 'react' / 'vue3' | framework 唯一 id |
| `canvasElement` | `<div id="root">` | preview iframe 内 |
| `Render.type` | 'story' | story 还是 docs |
| `rerender` | O(1) | framework 提供 patch 能力 |
| `forceRemount` | 重建 root | args 大幅变化时用 |

**最佳实践**：
1. ✅ 用 `Render<TRenderer>` 抽象三种 subtype（story/docs/mdx）
2. ✅ 每个 framework 在 `code/renderers/<name>/` 提供 1 个 render.ts
3. ✅ render/unmount 必须成对——避免 React 19 strict mode 警告
4. ✅ docs 和 story 的 Render 类分开，但共享 decorators/loaders
5. ✅ 异步 render 时 abort 信号传到 framework 层

---

### 8. UniversalStore 跨帧同步

**问题场景**：
v9 之前 manager 和 preview 各自维护状态（preview 的 `ArgsStore`、manager 的 MobX），通过 Channel 双向 RPC 同步——容易出竞态。v10 引入协作（多人编辑同一 story）后，需要一个 leader/follower 拓扑的"权威-镜像"模式。

**解决方案**：

```typescript
// code/core/src/shared/universal-store/index.ts:83
export class UniversalStore<State, CustomEvent extends { type: string; payload?: any }> {
  public static readonly ActorType = { LEADER: 'LEADER', FOLLOWER: 'FOLLOWER' } as const;
  private state: State;
  private followers = new Set<UniversalStore<State, CustomEvent>>();

  constructor(public readonly id: string, public readonly actorType: 'LEADER' | 'FOLLOWER') {
    this.state = this.createInitialState();
    if (actorType === 'LEADER') {
      this.exposeViaChannel(); // 暴露到 channel，follower 来订阅
    } else {
      this.subscribeToLeader(); // 1s 内必须找到 leader，否则抛超时
    }
  }

  setState(updater: (prev: State) => State) {
    if (this.actorType === 'FOLLOWER') throw new Error('Follower is read-only');
    this.state = updater(this.state);
    this.fanout(); // 通知所有 follower
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `actorType` | 'LEADER' | server 端是 source of truth |
| `followerTimeoutMs` | 1000 | 找不到 leader 抛错 |
| `state diff` | immer | 默认 deep equal diff |
| `eventPrefix` | `UNIVERSAL_STORE:` | channel 事件前缀 |
| `reconnectBackoff` | 100-3000ms | leader 重连退避 |

**最佳实践**：
1. ✅ Leader 在 server 端（不会被 reload 清状态）
2. ✅ Follower 是只读镜像，调用 `setState` 立刻抛错
3. ✅ State 用 immer 包装——避免逐字段 diff
4. ✅ Channel 事件名加 `UNIVERSAL_STORE:` 前缀，避免和业务事件冲突
5. ✅ 跨 tab 协作时，所有 manager 页面都连同一 Leader

---

### 9. 装饰链闭包（contextStore）

**问题场景**：
Decorator 经常这样写：`<div>{storyFn()}</div>`——它不传 context，但 Storybook 要求 context 一致。朴素做法是每个装饰器 `storyFn.bind(null, currentContext)`，但每次 args 变化会 O(N) 重建。需要"闭包持有上下文对象 + 工厂创建一次"。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/store/decorators.ts:49
export function defaultDecorateStory<TRenderer extends Renderer>(
  storyFn: LegacyStoryFn<TRenderer>,
  decorators: DecoratorFunction<TRenderer>[]
): LegacyStoryFn<TRenderer> {
  // 闭包持有 context 引用
  const contextStore: ContextStore<TRenderer> = {};

  // 每个装饰器拿到的是"会读 contextStore.value 的 getter"
  const bindWithContext = (decoratedStoryFn) => (update) => {
    contextStore.value = { ...contextStore.value, ...sanitizeStoryContextUpdate(update) };
    return decoratedStoryFn(contextStore.value);
  };

  // 装饰器链只 reduce 一次
  const decoratedWithContextStore = decorators.reduce(
    (story, decorator) => decorateStory(story, decorator, bindWithContext),
    storyFn
  );

  return (context) => {
    contextStore.value = context; // 每次 render 只改一个对象引用
    return decoratedWithContextStore(context);
  };
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `decorators` | 数组 | 顺序很重要 |
| `contextStore.value` | 浅合并 | 不深拷贝 |
| `bindWithContext` | 工厂 | 只创建一次 |
| `parallelRender` | 不支持 | 注释 L58 自承：必须串行 |
| `render queue` | StoryRender 维护 | notYetRendered / rerenderEnqueued |

**最佳实践**：
1. ✅ 装饰器链用 `reduce` 创建一次，render 时只改 `contextStore.value`
2. ✅ 装饰器拿"会读 context 的 getter"而非"已经 bind 好的函数"
3. ✅ 装饰链不深拷贝 context——浅合并是 O(1) 优化
4. ✅ 同一 story 串行 render——并行会破坏 contextStore 闭包
5. ✅ StoryRender 内部维护 `notYetRendered`/`rerenderEnqueued` 队列

---

### 10. CSF 工具链（processCSFFile → prepareStory）

**问题场景**：
CSF 有 v1/v2/v3/v4 四代语法（`render`/`userStoryFn`/meta 工厂）。Storybook 需要一个统一的 pipeline 把"原始 .stories.ts 文件"标准化成 `PreparedStory` 对象，addons 拿到的是一致结构。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/store/csf/processCSFFile.ts:45
export function processCSFFile<TRenderer extends Renderer>(
  moduleExports: StoreModule,
  title: string | { prefix?: string; suffix?: string }
): NormalizedComponentAnnotations<TRenderer> {
  // 1) 解析 default export（meta）
  const meta = normalizeMeta(title, moduleExports.default);
  // 2) 遍历 named exports（每个 story）
  const stories = Object.entries(moduleExports)
    .filter(([key]) => key !== 'default')
    .map(([exportName, storyFn]) => {
      const storyId = toId(meta.id, exportName); // "Button--primary"
      // 3) hack：把 id 写到 parameters.__id
      storyFn.parameters = { ...storyFn.parameters, __id: storyId };
      return { exportName, storyId, story: normalizeStory(storyFn, meta) };
    });
  return { ...meta, stories };
}
```

```typescript
// normalizeStory 处理 v1/v2/v3/v4 四种语法
function normalizeStory(rawStory, meta) {
  // v4: meta.factory({ ...args })(storyObj)
  // v3: { render, args, play } 直接 meta 化
  // v2: { storyFn, parameters }
  // v1: function StoryFn() { return <Button/> }
  if (typeof rawStory === 'function') return { render: rawStory };
  if (rawStory.render) return rawStory;
  if (rawStory.storyFn) return { render: rawStory.storyFn, ...rawStory };
  return rawStory;
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `title` | 'Components/Button' | meta 必填 |
| `id` | 自动生成 | 不填就 `${title}--${exportName}` |
| `parameters.__id` | internal | 别在 addon 里读 |
| `tags` | array | v8 引入：autodocs / test-only |
| `exportName` | named export | 必须是 export const |

**最佳实践**：
1. ✅ 用 CSF3 工厂语法 `{ render, args, play }` 而非函数式
2. ✅ title 路径用 `/` 分隔，Sidebar 自动建树
3. ✅ tags 给 story 打 autodocs / test-only 标签
4. ✅ `parameters.__id` 是 internal，addon 不要读（v10 可能改）
5. ✅ 工厂写法 `meta.factory({ ... })(storyObj)` 支持 type-safe args

---

## 三、性能优化

### 11. 延迟导入（lazy importFn）

**问题场景**：
10 万级 story 项目的 manager 启动时间 = N × CSF 文件 parse + evaluate。即使 CSF 文件每个 50KB，10 万个就是 5GB——首屏直接白屏。需要"manager 只读元数据，实现按需 import"。

**解决方案**：

```typescript
// manager 端：只读 index.json，不 import CSF
const index = await fetch('/index.json').then((r) => r.json());
this.sidebar.render(index.entries);

// preview 端：用户点哪个 story 才 import
class PreviewWeb extends Preview<TRenderer> {
  async loadStory({ storyId }) {
    const entry = this.index.entries[storyId];
    const module = await this.importFn(entry.importPath); // 动态 import
    const csf = processCSFFile(module, entry.title);
    return this.storyStore.addStory(csf, entry);
  }
}
```

```typescript
// importFn 适配不同 builder
const importFn = (path) => import(/* @vite-ignore */ path);
const importFnWebpack = (path) => import(/* webpackIgnore: true */ path);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `lazy` | true | preview 默认 |
| `importFn.timeout` | 10s | 单文件 import 超时 |
| `index.json size` | < 5MB | 10 万 entry 大约 3MB |
| `prefetchAdjacent` | false | v9 移除，相邻 story 靠预取 |
| `cacheKey` | importPath + version | esbuild-cache 命中 |

**最佳实践**：
1. ✅ `index.json` 是元数据、CSF 是实现——彻底解耦
2. ✅ `importFn` 是函数引用，builder 注入实现
3. ✅ 大项目（> 5k story）考虑 `tag: 'autodocs'` 分组加载
4. ✅ esbuild 缓存 + `importFn.cacheKey` 让二次 import < 50ms
5. ✅ 不要在 `meta.loaders` 跑同步阻塞——preview 会卡死

---

### 12. LRU Memoize（StoryStore）

**问题场景**：
同一个 CSF 文件会被多次 prepare（args 变化、装饰器热更新、addon 切换）。`prepareStory` 内部要做 AST 解析、装饰链 reduce、loader 闭包捕获——如果每次都重做，10 万 story 项目就崩溃。需要 memoize 缓存。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/store/StoryStore.ts:51
import memoizerific from 'memoizerific';

export class StoryStore<TRenderer extends Renderer> {
  constructor() {
    this.processCSFFile = memoizerific(1)(this.processCSFFile);
    this.prepareMeta = memoizerific(1)(this.prepareMeta);
    this.prepareStory = memoizerific(1)(this.prepareStory);
  }
  // ... 其他逻辑
}
```

```typescript
// memoizerific(1) 含义：只缓存 1 个最近结果（LRU 1）
// 为什么是 1？因为 args 变化时 key 也变，老的会被清
// 更高的 N 会保留无用缓存
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `memoizerific(1)` | LRU size=1 | args 一变就清掉 |
| `cacheKey` | args + globals | 自定义 key |
| `maxAge` | 5min | 超时清理 |
| `disableCache` | 测试用 | 性能基准 |
| `cacheHitRate` | 监控 | 命中率 < 50% 说明 key 不稳 |

**最佳实践**：
1. ✅ 默认 `memoizerific(1)`——args 变化 key 就变，size=1 已够
2. ✅ 不要在 prepareStory 里读 `Date.now()` / `Math.random()`——key 不稳
3. ✅ args 之外的引用（装饰链结构）变化，cache 也要失效
4. ✅ 单元测试要 `disableCache`——避免测试相互污染
5. ✅ 用 `console.log(memoizerific.stats())` 调试命中率

---

### 13. 静态构建（build-static）

**问题场景**：
Storybook 是 dev tool，但用户用其产物（文档站、设计系统）——他们要把 storybook-static/ 部署到 CDN。需要一个"build 阶段把所有 story 预渲染"的能力，让静态站点支持 SEO、首屏快。

**解决方案**：

```typescript
// code/core/src/core-server/build-static.ts
export async function buildStaticStandalone(options: BuildStaticStandaloneOptions) {
  // 1) 调 builder 生成 manager + preview bundle
  await builder.build({ configDir, outdir: 'storybook-static' });
  // 2) 跑 StoryIndexGenerator 全量扫 .stories.*
  const index = await generator.extractStories(specifier);
  // 3) 写 index.json 到 outdir
  await fs.writeJson(path.join(outdir, 'index.json'), index);
  // 4) 复制 .storybook 静态资源
  await copyDir('public', outdir);
  // 5) 生成 manager.html / iframe.html 模板
  await generateHTMLShell(outdir);
}
```

```bash
# 部署
npx sb build
npx http-server storybook-static -p 8080
# 或直接 S3 同步
aws s3 sync storybook-static s3://my-bucket --delete
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `--output-dir` | storybook-static | 默认 |
| `--quiet` | false | CI 友好 |
| `--test` | false | 跑测试后 build |
| `disableTelemetry` | true | CI 关掉 |
| `cacheKey` | git SHA | esbuild 缓存命中 |

**最佳实践**：
1. ✅ `build-static` 产物是纯静态文件，可部署到任意 CDN
2. ✅ 在 CI 缓存 `node_modules/.cache/esbuild` 让 build < 30s
3. ✅ 加 `--test` 标志，build 前先跑测试
4. ✅ 用 git SHA 做 cache key，避免 stale cache
5. ✅ 部署到 Netlify/Vercel 时配 SPA fallback（`/* -> /index.html`）

---

### 14. Transport 切换（postMessage → WebSocket）

**问题场景**：
跨 tab 协作（v10 新加）时，多个 manager tab 同时连到同一 preview。如果只用 postMessage，每个 tab 都开一个 iframe，浪费 4-6x 内存。需要把 Channel 的 transport 切到 WebSocket——一个 server-side 进程，broadcast 给所有 client。

**解决方案**：

```typescript
// v10 引入 WebSocket transport
class WebSocketTransport implements ChannelTransport {
  constructor(public url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (msg) => this.handleIncoming(msg.data);
  }
  send(event: ChannelEvent) {
    this.ws.send(JSON.stringify(event));
  }
  onMessage(handler: (event: ChannelEvent) => void) {
    this.onMessageHandler = handler;
  }
}

// 注入到 Channel
const channel = new Channel({
  transports: [new WebSocketTransport('ws://localhost:6007/collaboration')],
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `transport.type` | 'websocket' | 默认 postMessage |
| `reconnectDelay` | 100-3000ms | 指数退避 |
| `pingInterval` | 30s | 维持连接 |
| `compression` | permessage-deflate | 大 payload 用 |
| `authToken` | JWT | 协作权限验证 |

**最佳实践**：
1. ✅ 默认用 postMessage（最简单）——只在协作场景切 WebSocket
2. ✅ transport 列表可叠加（先 postMessage 再 WS），双通道冗余
3. ✅ WS 断线用指数退避——1s/2s/4s/8s 上限 30s
4. ✅ 大 payload（> 64KB）开 permessage-deflate 压缩
5. ✅ 跨 origin WS 配 CORS——`Access-Control-Allow-Origin: *`

---

### 15. 装饰链串行化（StoryRender 队列）

**问题场景**：
`defaultDecorateStory` 用 `contextStore` 闭包持有 context——这意味着同一 story 不能并行 render。但用户连续点 sidebar 多个 story，或者同时跑 vitest addon 的并发测试。需要 StoryRender 内部维护一个队列，串行执行。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/preview-web/render/StoryRender.ts
export class StoryRender<TRenderer extends Renderer> extends Render<TRenderer> {
  private notYetRendered: RenderContext[] = [];
  private rerenderEnqueued = false;
  private runningRender: Promise<void> | null = null;

  async render(context: RenderContext) {
    // 1) 串行：把 render 加入队列
    if (this.runningRender) {
      this.notYetRendered.push(context);
      return this.scheduleNext();
    }
    this.runningRender = this.doRender(context);
    return this.runningRender;
  }

  async rerender() {
    if (this.runningRender) {
      this.rerenderEnqueued = true; // 跑完后只重渲一次
      return;
    }
    this.runningRender = this.doRerender();
    return this.runningRender;
  }

  private async scheduleNext() {
    if (this.runningRender) await this.runningRender;
    if (this.notYetRendered.length === 0) return;
    const next = this.notYetRendered.shift()!;
    await this.render(next);
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `notYetRendered` | queue | 等待 render 的 context |
| `rerenderEnqueued` | bool | 防止 rerender 风暴 |
| `runningRender` | Promise | 当前 render |
| `concurrentRenders` | 1 | 必须 1，contextStore 不支持并行 |
| `cancelOnUnmount` | true | 组件卸载时取消 |

**最佳实践**：
1. ✅ 同一 story 串行 render——contextStore 闭包不支持并行
2. ✅ `rerenderEnqueued` 防止"用户连点 args slider"风暴
3. ✅ StoryRender 队列比 React 18 transition 简单——addon 容易理解
4. ✅ unmount 时 abort 当前 render，避免 setState on unmounted
5. ✅ vitest addon 并发测试用独立 StoryStore——不串行化

---

## 四、工程实践

### 16. Monorepo 拆分（Yarn 4 + Nx）

**问题场景**：
Storybook 60+ 包要共享 TypeScript 类型、addon 接口、channel 协议——但又要独立发版（`@storybook/react`、`@storybook/vue3` 是不同 npm 包）。用普通 monorepo 工具（lerna）太慢；Yarn workspaces 解决依赖解析但解决不了 task 编排。

**解决方案**：

```json
// package.json
{
  "workspaces": ["code/core", "code/renderers/*", "code/frameworks/*", "code/addons/*"]
}
```

```yaml
# .nx/workflows/
- name: build
  steps:
    - run: yarn task build
      inputs: { target: 'core' }
- name: test
  steps:
    - run: vitest run
      cache: true
```

```bash
# Nx 增量构建：只重 build 受影响的包
yarn nx affected:build
yarn nx affected:test
yarn nx run-many --target=lint --all
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `Yarn version` | 4.10.3 | berry |
| `Nx version` | 22 | task 编排 |
| `cache` | .nx/cache | 命中跳过 70% 任务 |
| `affected` | git diff | 只跑受 PR 影响的包 |
| `workspaces.packages` | 4 类 | core/renderers/frameworks/addons |

**最佳实践**：
1. ✅ `workspaces.packages` 用 4 类拆分（core/renderers/frameworks/addons）
2. ✅ Nx `affected` 只跑 git diff 涉及的包——CI 提速 3-5x
3. ✅ `.nx/cache` 进 git ignore 但保留本地——10x 提速
4. ✅ 跨包共享代码用 `paths` in tsconfig.base.json 而非相对路径
5. ✅ Yarn 4 的 `resolutions` 强制锁定 react / typescript 主版本

---

### 17. TypeScript 泛型链路（Preview<TRenderer>）

**问题场景**：
12 个 framework 适配器，每个 framework 的 component 类型都不一样（React 是 `ReactElement`、Vue 是 `VNode`、Svelte 是 `SvelteComponent`）。但 Storybook 核心要保持单一类型——`Preview<TRenderer>` 整条链路是泛型，TS 推断到 framework 那一层才落地。

**解决方案**：

```typescript
// code/core/src/preview-api/modules/preview-web/Preview.tsx
export class Preview<TRenderer extends Renderer> {
  // Renderer 是 type parameter，把 framework 类型传进来
  constructor(
    public importFn: ModuleImportFn,
    public getProjectAnnotations: () => MaybePromise<ProjectAnnotations<TRenderer>>,
    ...
  ) {}
}

// code/renderers/react/src/types.ts
export interface ReactRenderer extends Renderer {
  component: ComponentType<any>;
  storyResult: ReactElement | ReactPortal;
  canvasElement: HTMLElement;
}

// 使用
const preview = new Preview<ReactRenderer>(importFn, getProject);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `TRenderer extends Renderer` | 泛型约束 | framework-specific |
| `component` | framework 组件类型 | React: `ComponentType` |
| `storyResult` | 渲染结果 | React: `ReactElement` |
| `canvasElement` | 挂载点 | React: `HTMLElement` |
| `Meta<TRenderer>` | 工厂泛型 | CSF3 type-safe args |

**最佳实践**：
1. ✅ 核心包用 `Preview<TRenderer extends Renderer>` 泛型
2. ✅ framework 包在 `code/renderers/<name>/types.ts` 落 `ReactRenderer` / `Vue3Renderer`
3. ✅ CSF3 的 `Meta<TRenderer>` + `StoryObj<typeof meta>` 是 type-safe args 的入口
4. ✅ `extends Renderer` 强制每个 framework 实现 `component/storyResult/canvasElement` 三件套
5. ✅ 用 `as` 收口：framework 内部允许 `as any`，出口必须类型完整

---

### 18. Addon 生态（11 内建 + 1000+ 第三方）

**问题场景**：
Storybook 核心只做"story 容器 + 渲染"。但用户需要 a11y、docs、interactions test、visual regression、mock server……需要一个 addon 生态，让第三方能"插入"到 render 流程的任意阶段。

**解决方案**：

```
Addon 钩子点：
  meta.loaders       -> story 加载数据
  meta.beforeEach    -> 重置全局状态
  meta.decorators    -> 包裹 story
  meta.parameters    -> 配置
  meta.render        -> 自定义渲染
  channel.on(...)    -> 监听事件
  addon-panels       -> 底部/侧边面板
  addon-toolbar      -> 顶部工具栏
```

```typescript
// a11y addon：包装 axe-core
// code/addons/a11y/src/index.ts
export default {
  title: 'a11y',
  paramKey: 'a11y',
  run: (state, api) => {
    api.channel.on(STORY_RENDERED, async () => {
      const iframe = document.getElementById('storybook-preview-iframe');
      const result = await runAxe(iframe.contentDocument);
      api.setAddonState(ADDON_ID, { violations: result.violations });
    });
  }
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `paramKey` | addon 名 | 唯一 id |
| `run` | (state, api) => void | 启动钩子 |
| `api.setAddonState` | 同步状态到 panel | |
| `channel.on(STORY_RENDERED)` | 标准钩子 | |
| `addon-panels` | 注册底部面板 | `addons/addon-a11y/register` |

**最佳实践**：
1. ✅ Addon 暴露 default export `{ title, paramKey, run }` 而非类
2. ✅ 用 `api.setAddonState` 同步状态到 panel——Manager 自动 rerender
3. ✅ a11y / interactions 走 iframe.contentDocument——离用户组件近
4. ✅ Toolbar addon 用 `addons.add('toolbar', ...)` 注册
5. ✅ 发布到 npm 加 `@storybook/addon-` scope——用户搜索友好

---

### 19. 测试矩阵（Vitest + Playwright）

**问题场景**：
Storybook 跨 12 个 framework，每个 framework 的 render 行为都不一样（React strict mode、Vue reactivity、Svelte runes）。单跑一个 framework 的测试覆盖率 < 50%，会出"只有 Vue 挂"这种 bug。需要"单元 + 集成 + E2E"三层矩阵。

**解决方案**：

```bash
# 单元测试：Vitest 4
yarn test                    # vitest run
yarn test --watch            # vitest watch
yarn test:coverage           # v8 coverage

# 集成测试：test-storybooks/ 4 个真实 fixture
yarn test:integration        # vitest --config vitest.integration.ts
yarn test:integration react  # 只跑 React fixture

# E2E：Playwright 1.58
yarn test:e2e                # playwright test
yarn test:e2e --ui           # 调试模式
```

```yaml
# .circleci/config.yml 触发矩阵
- run: yarn test:integration react-vite/default-ts
- run: yarn test:integration vue3-vite/default-ts
- run: yarn test:integration svelte-vite/default-ts
- run: yarn test:integration angular/default-ts
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `Vitest` | 4 | 替代 Jest |
| `Playwright` | 1.58 | E2E |
| `coverage` | v8 | 比 istanbul 快 5x |
| `parallelism` | 4 | CircleCI 上 4 并发 |
| `flaky threshold` | 0.1% | retry 2 次 |

**最佳实践**：
1. ✅ Vitest 替代 Jest——和 Vite builder 共享 transform 缓存
2. ✅ `test-storybooks/` 放 4 个真实 fixture（react-vite/vue3-vite/svelte-vite/angular）
3. ✅ E2E 用 Playwright 的 `--ui` 模式调试——录像回放
4. ✅ flaky 测试 retry 2 次，但记入 CI dashboard
5. ✅ coverage 阈值按 framework 分——React 80%、Vue 70%、新框架 50%

---

### 20. CI 编排（CircleCI + GitHub Actions + Nx）

**问题场景**：
Storybook monorepo 60+ 包、1300+ 贡献者、20+ GH Actions。PR 跑全量测试要 40+ 分钟。需要分三层 CI：本地 pre-commit、PR 增量、release 全量。

**解决方案**：

```yaml
# .circleci/config.yml 主 CI
version: 2.1
jobs:
  affected:
    docker: { image: 'cimg/node:22' }
    steps:
      - checkout
      - restore_cache: { key: yarn-v4-{{ checksum "yarn.lock" }} }
      - run: yarn install --immutable
      - run: yarn nx affected --target=test --base=origin/main
      - run: yarn nx affected --target=lint --base=origin/main
      - run: yarn nx affected --target=build --base=origin/main
```

```yaml
# .github/workflows/release.yml 发版
name: Release
on: { push: { branches: [main] } }
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn release
        env: { GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} }}
```

```bash
# 本地 pre-commit
.husky/pre-commit: yarn knip && yarn lint-staged
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `CircleCI` | 主 CI | 跑 integration + e2e |
| `GitHub Actions` | release / agent | 轻量任务 |
| `Nx affected` | git diff | PR 增量 70% 提速 |
| `cache key` | yarn.lock checksum | Yarn 4 cache 命中 |
| `parallelism` | 8 | CircleCI 4×8 容器 |

**最佳实践**：
1. ✅ CircleCI 跑 integration + e2e（重），GH Actions 跑 release（轻）
2. ✅ Nx `affected` 只跑 git diff 受影响的包——PR 提速 70%
3. ✅ yarn 4 用 `yarn install --immutable` + lockfile 缓存
4. ✅ Husky + lint-staged：本地 pre-commit 跑 knip + lint
5. ✅ Zizmor 扫 GH Actions YAML——防 supply chain 攻击

---

**标签**：#storybook #frontend-tooling #monorepo #csf
**状态**：20/20 份详细内容
