# svelte - 编译时框架

**来源**：GitHub sveltejs/svelte（v5.x，Runes 模式默认）
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. 编译期三阶段管线（Parse/Analyze/Transform）

**问题场景**：
Svelte 把组件源文编译成高效 vanilla JS——这个编译过程涉及 60+ AST 节点类型、scoping 解析、imports 收集、scoped CSS、runes 检测、代码生成——如果一锅端写在一个函数里，可读性和可维护性都会崩塌。需要清晰的三阶段切分。

**解决方案**：

```typescript
// packages/svelte/src/compiler/index.js
export function compile(source: string, options: CompileOptions): CompileResult {
  // 1) 解析：BOM 去除 + 状态重置 + TS 节点剥离
  const parsed = _parse(source, options);
  // 2) 分析：zimmerframe walk AST，收集 scope/runes/imports
  const analysis = analyze_component(parsed, options);
  // 3) 转换：分叉成 client / server 两条路径
  const result = transform_component(analysis, options);
  return { js: result.js, css: result.css, ast: parsed, warnings: analysis.warnings };
}
```

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1-parse        │     │  2-analyze      │     │  3-transform    │
│  手写状态机     │ ──▶ │  zimmerframe    │ ──▶ │  client/server  │
│                 │     │  walk AST       │     │  分叉 emit      │
│ AST.Fragment    │     │ ComponentAnalysis│     │ import '$'      │
│ + InstanceScript│     │ scope/runes/    │     │ from 'svelte/   │
│ + CSS           │     │ imports         │     │ internal/client'│
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `options.runes` | true | 启用 Runes 模式 |
| `options.namespace` | 'html' / 'svg' / 'mathml' | 命名空间 |
| `options.css` | 'external' / 'injected' / 'none' | 注入策略 |
| `parsed.metadata.ts` | bool | TS 节点存在 |
| `options.generate` | 'client' / 'server' | 输出目标 |

**最佳实践**：
1. ✅ Parse/Analyze/Transform 严格分开——每一段返回纯数据
2. ✅ Analyze 输出 `ComponentAnalysis` 是 immutable，方便缓存
3. ✅ 2-analyze 共享给 3-transform 客户端/服务端——避免重复
4. ✅ `options.css: () => parsed_options.css` 用函数延迟决策
5. ✅ `remove_typescript_nodes` 是 pre-pass——TS 节点剥离后才进 analyze

---

### 2. Runes 显式响应式（$state/$derived/$effect）

**问题场景**：
Svelte 4 的 `$: console.log(count)` 隐式 reactivity 难学、难静态分析、IDE 难补全——"在阅读时不易识别依赖图"。v5 引入 Runes 显式 API，让 reactive boundary 像 React Hooks 一样可静态分析。

**解决方案**：

```svelte
<!-- Svelte 5 Runes 模式 -->
<script>
  let count = $state(0);                    // 显式声明响应式
  let doubled = $derived(count * 2);        // 派生状态
  $effect(() => {                            // 副作用
    console.log('count is', count);
  });
</script>
<button onclick={() => count++}>{doubled}</button>
```

```typescript
// 编译器把 $state/$derived/$effect 翻译成 runtime helper
import { source, derived, effect } from 'svelte/internal/client';
let count = source(0);
let doubled = derived(() => count.v * 2);
effect(() => console.log('count is', count.v));
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `$state(initial)` | any | 响应式源 |
| `$derived(expr)` | expression | 派生（自动追踪依赖） |
| `$effect(fn)` | function | 副作用（自动重跑） |
| `$props()` | object | 父组件传 props |
| `$bindable()` | two-way binding | 父能改子 |

**最佳实践**：
1. ✅ Runes 模式（`runes: true`）是 v5 默认——v4 写法是 legacy
2. ✅ `$state` 只在顶层调用——不能在条件/循环里
3. ✅ `$derived` 替代 `$:` 标签——更显式
4. ✅ `$effect` 替代 `onMount`/`afterUpdate`——统一副作用语义
5. ✅ 派生值避免 `let doubled = count * 2`——会破坏缓存

---

### 3. Signals + 模块级 active_reaction

**问题场景**：
React useEffect 依赖数组要手动维护——漏一个就出 bug。Solid/MobX 早就证明"自动依赖追踪"的 signals 模型更优雅。Svelte 5 用"模块级 active_reaction + Set 收集依赖"实现零样板依赖追踪。

**解决方案**：

```typescript
// packages/svelte/src/internal/client/runtime.js
export let active_reaction: Reaction | null = null;
export let active_effect: Effect | null = null;
export let untracking = false;

export function update_reaction(reaction: Reaction) {
  // 1) 保存 previous reaction
  var previous_reaction = active_reaction;
  // 2) 把当前 reaction 设为 active
  active_reaction = reaction;
  try {
    // 3) 执行用户函数——读 source 时自动 push_reaction_value
    return reaction.fn();
  } finally {
    active_reaction = previous_reaction;
  }
}

export function push_reaction_value(value: Source) {
  // 把当前读到的 source 加到当前 reaction 的依赖集
  if (active_reaction !== null) {
    (active_reaction.sources ??= new Set()).add(value);
  }
}

// 写 source 时通知所有依赖
export function mark_reactions(source: Source) {
  source.reactions.forEach((reaction) => schedule_reaction(reaction));
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `active_reaction` | 模块级 let | 当前执行的 reaction |
| `reaction.sources` | Set<Source> | 依赖集 |
| `source.reactions` | Set<Reaction> | 反向依赖 |
| `untracking` | bool | 跳过依赖收集 |
| `effect.pre_effect` | function | 每次 effect 跑前 |

**最佳实践**：
1. ✅ 用模块级 let 而非 class 实例——少写 `this.reaction`
2. ✅ `push_reaction_value` 在 source 构造时就跑——防自循环
3. ✅ `untracking = true` 跳过依赖收集——用于读但不订阅
4. ✅ 反应图用 Set 存——O(1) 增删
5. ✅ Module-level state 让 IDE 跳转友好——不用看 this

---

### 4. 手写状态机 Parser

**问题场景**：
Svelte 模板语法 = HTML + 单一分隔符 `{...}`。用 acorn-jsx 之类的第三方 parser 又重又不对口（它不解析 CSS scoped）。需要一个"5-20 行状态机组合"的极简 parser。

**解决方案**：

```javascript
// packages/svelte/src/compiler/phases/1-parse/state/fragment.js
export default function fragment(parser) {
  if (parser.match('<')) return element;   // 标签
  if (parser.match('{')) return tag;       // 表达式
  return text;                              // 文本
}

// 整个 parser 状态机就是这种 5-20 行小文件的组合
// packages/svelte/src/compiler/phases/1-parse/state/element.js
export function element(parser) {
  parser.consume('<');
  const name = parser.read_identifier();
  const attrs = parser.read_attributes();
  if (parser.match('/>')) {
    parser.consume('/>');
    return { type: 'Element', name, attributes: attrs, selfClosing: true };
  }
  parser.consume('>');
  const children = parser.read_children(close_element);
  return { type: 'Element', name, attributes: attrs, children };
}
```

```javascript
// Parser.forCss 工厂方法
static forCss(source) {
  const parser = Object.create(Parser.prototype);
  parser.template = source;
  parser.index = 0;
  parser.loose = false;
  return parser;
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `parser.index` | 0 | 字符位置 |
| `parser.loose` | false | 严格模式 |
| `parser.template` | string | 源文 |
| `parser.match()` | string | 预测不消费 |
| `parser.consume()` | string | 消费 |

**最佳实践**：
1. ✅ 18 行的 `fragment.js` 证明 pratt-style dispatch 足够支撑整门语言
2. ✅ `Parser.forCss()` 用 `Object.create(Parser.prototype)` 0 字节继承
3. ✅ `is_whitespace` 双重快速路径——ASCII 优先
4. ✅ `loose: true` 模式用于 IDE——半成品代码不抛错
5. ✅ 状态机每状态 < 20 行——可读性 vs 性能 trade-off

---

### 5. zimmerframe AST Walker

**问题场景**：
编译器几乎所有 phase 都要遍历 AST——60+ 节点类型 × 2 端（client/server）= 120+ visitor。需要一个"带 scope state 的 visitor 模式"——每个 visitor 接收 `(node, { next, state })`，scope 切换时自动保存/恢复 state。

**解决方案**：

```typescript
// zimmerframe（自研 < 1KB）
import { walk } from 'zimmerframe';

walk(ast, {
  _(node, { next, state }) {
    // 通配 visitor：每次 enter 节点跑
    state.scope = state.scopes.get(node) ?? state.scope;
  },
  VariableDeclaration(node, { next, state }) {
    // 命名 visitor：处理具体节点类型
    state.scope.add(node.id.name);
    next(); // 递归
  },
  BlockStatement(node, { next, state }) {
    const prev = state.scope;
    state.scope = state.scopes.get(node);
    next();
    state.scope = prev; // leave 时恢复
  }
}, { scope: rootScope });
```

```javascript
// "通配 + 命名"双层 dispatch（zimmerframe 核心）
const visitors = {
  _: function set_scope(node, { next, state }) { ... },
  AnimateDirective, ArrowFunctionExpression, ... 60+ 个 import
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `walk(ast, visitors, state)` | 入口 | 遍历 AST |
| `state` | 任意 | 由父 push |
| `next()` | 递归 | 显式调用 |
| `visitors._` | 通配 | 每次 enter 跑 |
| `leave` | 回调 | 离开时跑 |

**最佳实践**：
1. ✅ 自研 zimmerframe（< 1KB）而非用 estree-walker——更轻
2. ✅ "通配 + 命名"双层 dispatch——scope 自动切换
3. ✅ 显式 `next()` 递归——比隐式遍历更灵活
4. ✅ `state` 由父 push，scope 切换时自动保存/恢复
5. ✅ 60+ 节点类型映射到具体 visitor——类型完整

---

## 二、架构设计

### 6. 编译期到运行时桥（metadata）

**问题场景**：
Svelte 编译器要做"理解代码"的工作（scope/runes/imports），runtime 只做"查表执行"。但这两层之间需要一个桥——编译期决定的事（"这个元素是 bound contenteditable"）要传到 runtime 让 fast path 走对分支。

**解决方案**：

```typescript
// packages/svelte/src/compiler/phases/3-transform/client/transform-client.js
metadata: {
  namespace: options.namespace,
  bound_contenteditable: false,
  // ... 22+ 个开关
}

// 编译期决定要不要加 bound_contenteditable
// runtime 端根据这个标记决定走哪条 fast path
```

```typescript
// 编译产物
$.bind_contenteditable(input, () => state.value);

// 运行时
export function bind_contenteditable(input, get) {
  input.addEventListener('input', () => {
    state.value = input.textContent;
  });
  // fast path
  if (metadata.bound_contenteditable) { /* 优化 */ }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `metadata.namespace` | 'html' / 'svg' | 标签命名空间 |
| `metadata.bound_contenteditable` | bool | 是否双向绑定 |
| `metadata.tracing` | bool | DEV 跟踪 |
| `metadata.compatibility` | { componentApi: 4 \| 5 } | 版本兼容 |
| `metadata.async` | bool | 异步模式 |

**最佳实践**：
1. ✅ 编译器做"理解代码"——runtime 做"查表执行"
2. ✅ metadata 集中 22+ 个开关——避免在 runtime 里 if-else
3. ✅ 编译器输出 `import { state, effect } from 'svelte/internal/client'`
4. ✅ runtime 通过 `$` alias 收口——所有 helper 集中
5. ✅ 编译产物对 source map 友好——错误栈指向 .svelte 行号

---

### 7. 客户端/服务端共享 Analyze

**问题场景**：
Svelte 编译产物分 client 和 server 两条路径（前者跑 vanilla DOM，后者字符串拼接 SSR）。但 scope/runes/imports 这些分析工作是共享的——如果 client/server 各自跑一遍 analyze，浪费 50% 编译时间。

**解决方案**：

```typescript
// packages/svelte/src/compiler/phases/3-transform/index.js
export function transform_component(analysis: ComponentAnalysis, options: CompileOptions) {
  // 共用 analyze 的结果
  const client = options.generate === 'server'
    ? null
    : transform_client(analysis, options);
  const server = options.generate === 'client'
    ? null
    : transform_server(analysis, options);
  return { js: { code: merge(client?.js.code, server?.js.code) }, css: client?.css };
}
```

```typescript
// 同一份 analysis 给 client_component 和 server_component
// ComponentAnalysis 包含：
//   - module.scopes
//   - instance_body.hoisted
//   - runes 标记
//   - imports 列表
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `options.generate` | 'client' / 'server' | 输出目标 |
| `ComponentAnalysis` | immutable | 共享中间结果 |
| `module.scopes` | Map | 词法作用域 |
| `instance_body.hoisted` | array | 提到模块顶部的语句 |
| `runes` | bool | 模式标记 |

**最佳实践**：
1. ✅ 2-analyze 共享给 3-transform 客户端/服务端——避免重复
2. ✅ ComponentAnalysis 是 immutable 纯数据——方便 cache
3. ✅ `generate` 选项决定输出——单一 analyze 多份 transform
4. ✅ hoisted 列表在 analyze 阶段就确定——避免在 transform 重算
5. ✅ SSR 和 CSR 走同一份 AST——保证 hydrate 一致

---

### 8. 运行时 24KB 极小化

**问题场景**：
Svelte 5 的运行时（reactivity + DOM helpers）总 gzip 仅 24KB——比 React 18 runtime（~45KB）+ react-dom（~120KB）小 7 倍。怎么做到？需要源码层面的极简抽象和 helper 复用。

**解决方案**：

```typescript
// packages/svelte/src/internal/client/index.js
// 全部导出 ~50 个 helper
export { mount, unmount, hydrate, render } from './dom/render';
export { effect, pre_effect, render_effect, branch } from './reactivity/effects';
export { state, derived, source, mutable_source, mutate } from './reactivity/sources';
export { append, append_styles, attr, bind_value, bind_checked } from './dom/elements/attributes';
export { set_class, set_style, set_attributes, set_data } from './dom/elements/element';
export { template, append_before, effect_root } from './dom/blocks';
export { text, html, if_block, each, await_block, key } from './dom/blocks/*';
```

```javascript
// tree-shaking 友好：每个 helper 单独文件
// 用户 import 时只 import 用到的
// import { state, effect } from 'svelte/internal/client' → ~3KB
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `runtime gzip` | ~24KB | 完整 reactivity + DOM |
| `$state only` | ~3KB | 仅 reactivity |
| `mount/unmount` | ~1KB | 生命周期 |
| `each block` | ~1.5KB | 列表渲染 |
| `if/each/key` | ~1KB | 流程控制 |

**最佳实践**：
1. ✅ 每个 helper 单文件——tree-shaking 友好
2. ✅ 全部从 `svelte/internal/client` 入口导出——统一收口
3. ✅ 编译产物用 `$` alias——import { state as $state }
4. ✅ helper 函数保持纯函数——容易静态分析
5. ✅ 不在 runtime 里跑 if-else 树——metadata 决策

---

### 9. 双轨支持（Legacy + Runes）

**问题场景**：
Svelte 5 是大改版——Runes 取代 `$:` 隐式 reactivity。但 v4 用户代码量巨大——一键全部升级不现实。需要"Runes 为主、v4 写法走 legacy 路径"的双轨制。

**解决方案**：

```javascript
// packages/svelte/src/compiler/phases/2-analyze/visitors/
// 分支处理 runes 和 legacy 模式
export function VariableDeclaration(node, { state, next }) {
  if (state.analysis.runes) {
    // Runes 路径：$state/$derived/$effect
    return analyze_runes_variable(node, state);
  } else {
    // Legacy 路径：$:/export let
    return analyze_legacy_variable(node, state);
  }
}

// packages/svelte/src/compiler/phases/3-transform/legacy.js
// 单独维护的 legacy transform
export function transform_legacy_reactive_statements(...) {
  // 把 $: console.log(count) 翻译成 effect
  return b.statement(b.call('$.effect', b.arrow([], statement)));
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `runes: true` | 默认 | v5 模式 |
| `runes: false` | legacy | v4 模式 |
| `<svelte:options runes={true}>` | 强制 | 文件级开关 |
| `$:` 标签 | legacy | v4 reactivity |
| `$state` | runes | v5 reactivity |

**最佳实践**：
1. ✅ Runes 是 v5 默认——v4 写法是过渡兼容
2. ✅ 不用一刀切删 `$:`——双轨降低迁移成本
3. ✅ `legacy_reactive_imports` / `legacy_reactive_statements` 单文件维护
4. ✅ visitors 检测 `state.analysis.runes` 分支
5. ✅ 编译期在 warnings 里给 v4 用户升级提示

---

### 10. 错误文案构建生成（messages）

**问题场景**：
Svelte 编译器有 200+ 错误/警告文案。如果硬编码在 .js 里，i18n、文档同步、Markdown 引用都不方便。需要把 .md 错误文案走构建生成 .js 常量。

**解决方案**：

```markdown
<!-- packages/svelte/messages/compile-warnings/template.md -->
## ssr_html_deprecated

> Use `{@html ...}` in your markup

> Use `\{@html ...}` instead of `%s`

Use the `{@html ...}` tag in your markup to render raw HTML.
```

```javascript
// packages/svelte/scripts/process-messages/index.js
// 跑构建时：扫 .md → 解析 → 生成 .js
const messages = {};
for (const file of globSync('messages/**/*.md')) {
  const content = readFileSync(file, 'utf-8');
  const [id, ...lines] = content.split('\n');
  messages[id] = lines.join('\n').trim();
}
writeFileSync('src/compiler/messages.js', `export default ${JSON.stringify(messages)};`);
```

```typescript
// 使用
throw new CompileError('ssr_html_deprecated', [oldSyntax]);
// → "Use the `{@html ...}` tag in your markup to render raw HTML."
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `messages/*.md` | 200+ 文件 | 错误/警告文案 |
| `id` | kebab-case | 错误代码 |
| `params` | array | `%s` 替换 |
| `CompileError` | class | 抛错统一 |
| `process-messages` | 构建脚本 | 跑 `pnpm build` 时执行 |

**最佳实践**：
1. ✅ 错误/警告走 .md 文件——i18n 友好
2. ✅ 构建时生成 .js 常量——运行时无 IO
3. ✅ `%s` 占位符用 `sprintf` 风格——参数化
4. ✅ 错误 ID kebab-case——grep 友好
5. ✅ 错误信息直接给"怎么做"——不只是"哪里错"

---

## 三、性能优化

### 11. Bitflag 状态机

**问题场景**：
Svelte 5 的 Effect 有 DIRTY/CLEAN/MAYBE_DIRTY/DESTROYED/INERT/CONNECTED 等多种状态。如果用 if-else 链，840 行 runtime.js 会变得难维护。用 bitflag 把状态打包成 `f: number`，位运算 O(1) 测试。

**解决方案**：

```typescript
// packages/svelte/src/internal/client/constants.js
export const DERIVED = 1 << 0;       // 0b00000001
export const EFFECT = 1 << 1;        // 0b00000010
export const DIRTY = 1 << 2;         // 0b00000100
export const MAYBE_DIRTY = 1 << 3;   // 0b00001000
export const CLEAN = 1 << 4;         // 0b00010000
export const DESTROYED = 1 << 5;     // 0b00100000
export const INERT = 1 << 6;         // 0b01000000
export const CONNECTED = 1 << 7;     // 0b10000000
export const ROOT = 1 << 8;
```

```typescript
// packages/svelte/src/internal/client/runtime.js
// 测试状态
if (effect.f & DIRTY) {
  // dirty 分支
}
// 设置状态
effect.f |= DIRTY;
// 清除状态
effect.f &= ~DIRTY;
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `DIRTY` | 1 << 2 | 需要重跑 |
| `MAYBE_DIRTY` | 1 << 3 | 父 dirty 时才重跑 |
| `CLEAN` | 1 << 4 | 已同步 |
| `DESTROYED` | 1 << 5 | 已销毁 |
| `INERT` | 1 << 6 | 暂停 |

**最佳实践**：
1. ✅ Bitflag 把多状态压成 `f: number`——位运算 O(1)
2. ✅ `f & DIRTY` 替代 `if (status === 'dirty')`——快
3. ✅ `f |= DIRTY` 设置位——一个赋值
4. ✅ `f &= ~DIRTY` 清除位——一个赋值
5. ✅ DEV 模式可加额外位——调试友好

---

### 12. 派生缓存（derived + rv/wv 版本号）

**问题场景**：
`$derived(count * 2)` 这种派生值如果每次都重算，性能浪费。Svelte 5 用"读版本号 (rv) / 写版本号 (wv)"做"细粒度响应"——只有 wv 变了才重算派生。

**解决方案**：

```typescript
// packages/svelte/src/internal/client/reactivity/sources.js
export function source(v: T, stack?: string): Source<T> {
  return {
    f: 0,                  // flags
    v,                     // value
    rv: 0,                 // read version
    wv: 0,                 // write version
    reactions: new Set(),  // 订阅我的 reactions
    equals: safe_equals
  };
}

// 写 source 时递增 wv
export function set(source: Source, value: T) {
  if (!source.equals(source.v, value)) {
    source.v = value;
    source.wv++;
    // 通知所有 reaction
    mark_reactions(source);
  }
}

// 读 source 时检查 wv 是否变了
export function get(source: Source): T {
  // 收集依赖
  if (active_reaction !== null) {
    if (source.wv > active_reaction.rv) {
      // wv 变了——标 dirty
    }
  }
  return source.v;
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `source.rv` | number | 反应方的 read version |
| `source.wv` | number | source 的 write version |
| `equals` | function | 变化检测 |
| `safe_equals` | function | NaN/循环引用安全 |
| `mutate` | 路径访问 | 大对象 patch |

**最佳实践**：
1. ✅ `wv > rv` 触发重算——细粒度响应
2. ✅ `equals` 自定义——`Object.is` / 深比较
3. ✅ `safe_equals` 处理 NaN——`NaN === NaN` 是 false
4. ✅ `mutate` 模式让 `state.user.name = 'X'` 只触发一次更新
5. ✅ 大对象用 `mutable_source` 优化——避免深拷贝

---

### 13. 模块级 active_reaction 优化

**问题场景**：
React `useEffect(fn, deps)` deps 数组漏一个就出 bug——而 Svelte 5 用模块级 `active_reaction` 自动收集依赖。但 module-level 状态在 SSR 和 DEV 模式下要避免污染。

**解决方案**：

```typescript
// packages/svelte/src/internal/client/runtime.js
export let active_reaction: Reaction | null = null;
export let active_effect: Effect | null = null;
export let untracking = false;

// SSR 模式：effect 不跑
export function effect(fn: () => void) {
  if (is_ssr) return; // SSR 跳过 effect
  // ...
}

// DEV 模式：捕获 stack
export function capture_signals() {
  if (DEV) {
    return new Error().stack; // stack trace
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `active_reaction` | module-level let | 当前 reaction |
| `untracking` | bool | 跳过依赖收集 |
| `is_ssr` | bool | SSR 模式 |
| `DEV` | bool | 开发模式 |
| `capture_signals` | function | 捕获 stack |

**最佳实践**：
1. ✅ Module-level let 避免 `this.reaction`——更轻
2. ✅ SSR 模式跳过 effect——避免 hydration 不匹配
3. ✅ DEV 模式捕获 stack——调试友好
4. ✅ `untracking = true` 跳过依赖——用于读但不订阅
5. ✅ 用 setter 函数读写 module-level state——`set_active_reaction()`

---

### 14. Tree-Shaking 友好导出

**问题场景**：
如果 `svelte/internal/client` 入口文件把所有 helper 都同步 import，bundle 会全量打包——但用户只用了 1-2 个 helper。需要 ESM tree-shaking 友好的导出方式。

**解决方案**：

```typescript
// packages/svelte/src/internal/client/index.js
// 单独的 named export，不走 default object
export { state, derived, source, mutable_source, mutate } from './reactivity/sources';
export { effect, pre_effect, render_effect, branch } from './reactivity/effects';
export { mount, unmount, hydrate, render } from './dom/render';
export { template, append_before, effect_root } from './dom/blocks';
export { text, html, if_block, each, await_block, key } from './dom/blocks/*';
export { attr, bind_value, bind_checked, bind_contenteditable } from './dom/elements/attributes';
```

```javascript
// 编译产物
import * as $ from 'svelte/internal/client';
// 仅引用用到的 helper
$.state, $.derived, $.effect, ...
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `sideEffects: false` | package.json | tree-shake 标记 |
| `module` | ESM only | 静态分析 |
| `exports` | 单独文件 | 减少 hoist 成本 |
| `bundle size` | 按使用量 | import 什么打包什么 |
| `alias` | `$` | 编译期约定 |

**最佳实践**：
1. ✅ `sideEffects: false` 让打包器放心 tree-shake
2. ✅ 每个 helper 单独文件——编译产物按需 import
3. ✅ `package.json#exports` 控制入口——避免深层路径
4. ✅ 用 `$` alias 统一——避免命名冲突
5. ✅ 编译产物 import * as $——保证 tree-shake 路径稳定

---

### 15. Push-based Reactivity

**问题场景**：
React `useState + setState` 是 pull-based——render 时遍历组件树判断"是否要 re-render"。Solid/Svelte 5 signals 是 push-based——source 写时直接通知所有订阅者。push-based 在大型应用更新效率更高。

**解决方案**：

```typescript
// packages/svelte/src/internal/client/runtime.js
export function mark_reactions(source: Source) {
  // 1) 拿到所有订阅了 source 的 reactions
  for (const reaction of source.reactions) {
    // 2) 标 dirty
    reaction.f |= DIRTY;
    // 3) 调度执行
    schedule_effect(reaction);
  }
}

export function schedule_effect(effect: Effect) {
  // 推到 microtask queue
  queueMicrotask(() => {
    if (effect.f & DIRTY) {
      execute_effect(effect);
    }
  });
}

export function execute_effect(effect: Effect) {
  // 1) 清 DIRTY
  effect.f &= ~DIRTY;
  // 2) 跑 effect
  update_reaction(effect);
  // 3) 递归跑子 effect
  for (const child of effect.children) {
    execute_effect(child);
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `source.reactions` | Set | 订阅列表 |
| `reaction.f` | bitflag | 状态 |
| `queueMicrotask` | 调度 | 异步执行 |
| `execute_effect` | 递归 | 跑 effect 树 |
| `MAYBE_DIRTY` | 1<<3 | 父 dirty 时检查 |

**最佳实践**：
1. ✅ Push-based：source 写时直接通知订阅者
2. ✅ 用 microtask 调度——避免阻塞 UI
3. ✅ `MAYBE_DIRTY` 优化——父没变就不检查子
4. ✅ Topological order 执行 effect——依赖顺序
5. ✅ 避免 effect 风暴——批量调度

---

## 四、工程实践

### 16. Snapshot 测试（compile output）

**问题场景**：
Svelte 编译器改动可能改变输出——但输出是几百万行 .js 模板，手工 diff 不现实。需要 snapshot 测试：把编译产物存为 .snap 文件，下次跑测试对比。

**解决方案**：

```typescript
// packages/svelte/tests/snapshot/test.ts
import { compile } from 'svelte/compiler';
import { readFileSync, writeFileSync } from 'fs';

const samples = globSync('tests/snapshot/samples/**/input.svelte');
for (const sample of samples) {
  const input = readFileSync(sample, 'utf-8');
  const { js } = compile(input, { name: sample });
  const snapshot = readFileSync(sample.replace('input.svelte', 'expected.js'), 'utf-8');
  // 比对
  expect(js.code).toBe(snapshot);
}
```

```bash
# 更新 snapshot
pnpm test -- -u
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `samples/` | ~3000 个 | .svelte 模板 |
| `expected.js` | .snap | 预期编译产物 |
| `-u` | vitest 标志 | 更新 snapshot |
| `js.code` | string | 编译产物 |
| `sourceMap` | inline | 错误栈 |

**最佳实践**：
1. ✅ ~3000 个 snapshot 覆盖所有 compile output 路径
2. ✅ 改动编译器先看 snapshot 变化——评估影响
3. ✅ 用 `pnpm test -- -u` 批量更新——但人工 review
4. ✅ 错误栈对 source map 友好——指向 .svelte 行号
5. ✅ snapshot 走 .md 注释——PR review 直观

---

### 17. pnpm + workspace Monorepo

**问题场景**：
Svelte 主包 + 编译器独立包 + IDE tools + playgrounds——多包共享 TypeScript 配置、test fixtures、benches。普通 lerna monorepo 太慢，pnpm workspaces 速度 + 磁盘效率都更好。

**解决方案**：

```json
// package.json
{
  "private": true,
  "packageManager": "pnpm@10.4.0",
  "workspaces": [
    "packages/*",
    "playgrounds/*",
    "documentation"
  ]
}
```

```bash
# 常用命令
pnpm install                        # 装所有包
pnpm --filter svelte test           # 只跑 svelte 包的测试
pnpm --filter svelte build          # 只 build svelte
pnpm -r run test                    # 所有包跑测试
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `pnpm version` | 10.4.0 | 当前版本 |
| `workspaces` | packages/* + playgrounds/* | monorepo 范围 |
| `--filter` | package name | 只对某包 |
| `-r` | recursive | 全部包 |
| `pnpm test` | vitest | 测试入口 |

**最佳实践**：
1. ✅ pnpm 比 yarn/npm 节省 50% 磁盘——硬链接 store
2. ✅ `--filter` 只跑某包——CI 提速
3. ✅ `workspaces` 范围明确——避免扫到无关注目录
4. ✅ `packageManager` 字段固定版本——团队一致
5. ✅ 跨包依赖用 workspace: protocol——版本一致

---

### 18. Playground 沙盒

**问题场景**：
编译器开发需要快速验证 .svelte 文件编译结果——但搭一个完整 Vite 项目太重。需要 7 个 playground 沙盒仓库（sandbox / motion / template / ...）让开发者快速验证。

**解决方案**：

```
playgrounds/
├── sandbox/         # 基础 Vite + Svelte
├── motion/         # 动画 demo
├── template/        # 模板项目
├── e2e-tests/      # E2E 测试
├── inspector/       # DevTools 集成
├── bundler-benchmark/  # 编译产物对比
└── vite-env-only/  # Vite 环境变量 demo
```

```bash
# 跑 sandbox
cd playgrounds/sandbox
pnpm install
pnpm dev   # 访问 http://localhost:5173 看实时编译
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `sandbox` | 基础 | 改编译器首选 |
| `e2e-tests` | Playwright | UI 测试 |
| `bundler-benchmark` | 性能 | 编译产物对比 |
| `inspector` | DevTools | 调试 |
| `template` | 项目脚手架 | 起始模板 |

**最佳实践**：
1. ✅ 7 个 playground 覆盖不同验证场景
2. ✅ `sandbox` 是改编译器首选——最小依赖
3. ✅ `bundler-benchmark` 对比 Vite/Rollup/Webpack 产物
4. ✅ `inspector` 跑 DevTools 集成——可视化反应图
5. ✅ `e2e-tests` 跑真实浏览器——覆盖 SSR + hydration

---

### 19. IDE Language Tools 集成

**问题场景**：
Svelte 编译产物是 vanilla JS，但 .svelte 源文件 IDE 不知道——没有 type info、没有补全、没有跳转。需要 `@sveltejs/language-tools`（VSCode 扩展）把编译器当后端。

**解决方案**：

```typescript
// svelte-language-server/src/.../compile.ts
import { compile } from '@sveltejs/compiler';
import ts from 'typescript';

export async function getDiagnostics(filePath: string, content: string) {
  // 1) 编译拿到 AST
  const { ast, warnings } = compile(content, { filename: filePath });
  // 2) TS 检查
  const program = ts.createProgram([filePath], tsConfig.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  // 3) 合并 compiler warnings + TS errors
  return [...warnings, ...diagnostics];
}
```

```json
// VSCode settings.json
{
  "svelte.enable-ts-plugin": true,
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `compile()` | 走 @sveltejs/compiler | 不依赖用户 Vite |
| `ts.createProgram` | TS API | 类型检查 |
| `getPreEmitDiagnostics` | function | 拿所有错误 |
| `language-tools` | sveltejs/language-tools | VSCode 扩展 |
| `ts-plugin` | svelte2tsx | TS 集成 |

**最佳实践**：
1. ✅ 编译器复用——VSCode 跑 `@sveltejs/compiler` 不是 Vite
2. ✅ TS 集成走 svelte2tsx——把 .svelte 翻译成 .ts
3. ✅ `getDiagnostics` 合并 compiler + TS errors——统一显示
4. ✅ 实时诊断——保存即检查
5. ✅ `loose: true` 让 IDE 友好——半成品不报错

---

### 20. 版本管理（Changesets）

**问题场景**：
Svelte 是 monorepo，60+ 包各自版本——手动维护 CHANGELOG.md 容易漏。需要 Changesets 工具：开发者写 changeset → bot 自动开 PR → 合并自动发版。

**解决方案**：

```bash
# 添加 changeset
pnpm changeset

# → 选择包
#   svelte (5.0.0 → 5.1.0)
#   @sveltejs/compiler (5.0.0 → 5.1.0)
# → 选 bump 类型
#   patch / minor / major
# → 写 changelog
```

```markdown
<!-- .changeset/svelte-5-1-0.md -->
---
'svelte': minor
'@sveltejs/compiler': minor
---

Add new `bind:value` syntax for `contenteditable` elements
```

```bash
# CI 跑
pnpm changeset version  # 读 .changeset/*.md → 升 package.json + 生成 CHANGELOG
pnpm changeset publish  # 发版到 npm
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `.changeset/*.md` | 变更说明 | 临时 |
| `pnpm changeset version` | 合并 PR 时 | 升版本 + 生成 CHANGELOG |
| `pnpm changeset publish` | 标签 push 时 | 发 npm |
| `bump type` | patch/minor/major | 语义化版本 |
| `GitHub Action` | changesets/action | 自动化 |

**最佳实践**：
1. ✅ 开发者写 changeset——bot 自动开 PR
2. ✅ `pnpm changeset version` 合并 PR 时跑——升版本
3. ✅ `pnpm changeset publish` 标签 push 时跑——发版
4. ✅ changesets/action GitHub App——无需自建 CI
5. ✅ patch/minor/major 严格——语义化版本

---

**标签**：#svelte #compiler #signals #runes #web-framework
**状态**：20/20 份详细内容
