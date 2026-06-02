# tailwindcss · ABL 风格实战

> 20 个工程模式解决 utility-first CSS 编译器的真实痛点：DSL 字符串解析、FSM 候选解析、bigint variant 排序、Rust 扫描器、DefaultMap 缓存、Field-level memoization、增量构建。

---

## 一、核心机制

### 模式 1：bigint 位运算编码 variant 顺序

**问题场景**：v3 用"variant 字符串数组"做 lexicographic 比较——`hover:focus:flex` 排序要 6 步。CSS 输出顺序决定最终样式（后定义覆盖前定义），**比较 O(n) 在大量 utility 场景下慢 30%**。v4 用 bigint 位运算给每个 variant 分配 0-63 位偏移，组合成单个 bigint——O(1) 比较。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/compile.ts:64-94
let variantOrder = 0n
for (let variant of candidate.variants) {
  variantOrder |= 1n << BigInt(variantOrderMap.get(variant)!)
}

// 比较时
const aSorting = sortingMap.get(a)!
const zSorting = sortingMap.get(z)!
if (aSorting.variants !== zSorting.variants) {
  return Number(aSorting.variants - zSorting.variants) // bigint 减法
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `variantOrder` | `bigint` | variant 组合的位图编码 |
| `variantOrderMap` | `Map<string, number>` | variant 名 → 0-63 位偏移映射 |
| `1n << BigInt(n)` | `bigint` | 位运算——1 移到第 n 位 |
| `0n` | `bigint` | bigint 字面量——`0n` 区别于 `0` |
| `aSorting.variants - zSorting.variants` | `bigint` | 减法决定先后——O(1) 比较 |

**最佳实践**：
- ✅ 选择 `bigint` 而非 `number` 是因为 `1 << 53` 后精度丢失；v4 内置 variant 60+ 必须 bigint
- ✅ 位运算是因为 variant 顺序本质是 categorical 集合的优先级编码
- ✅ 上限 64 个 variant——实际不可能超过 10 个，绰绰有余
- ✅ 任何"多 categorical 选项的组合排序"（CSS variant、权限组合、特征开关）都可用此 trick

---

### 模式 2：候选类 FSM 解析

**问题场景**：`bg-red-500/50 [type=email]:hover:flex has-[>img]:grid` 这种 DSL 字符串含 arbitrary value + modifier + 嵌套 variant——传统正则匹配"分桶"会丢失上下文（`[` 在 `bg-[...]` 是 arbitrary value 起点，在 `[&:hover]:flex` 是 arbitrary variant 起点）。**手写 FSM**是唯一解。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/candidate.ts:104-200（类型定义）
type Variant =
  | { kind: 'arbitrary'; relative: boolean; selector: string; depth: number }
  | { kind: 'static'; root: string; ... }
  | { kind: 'functional'; root: string; ... }
  | { kind: 'compound'; ... }

type Candidate =
  | { kind: 'arbitrary'; property: string; value: string; variants: Variant[] }
  | { kind: 'static'; root: string; variants: Variant[]; important: boolean }
  | { kind: 'functional'; root: string; value: AstNode[]; variants: Variant[] }
  | { kind: 'compound'; ... }

// 摘自 candidate.ts:188 的相对选择器校验
if (variant.relative && depth === 0) return null
// WHY: [>img]:flex 这种"相对选择器"单独使用没意义（必须依附于父规则）
//      has-[>img]:flex 就可以，因为 depth=1（外层是 has-）
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Variant` | `union` | 4 种 kind：`arbitrary` / `static` / `functional` / `compound` |
| `Candidate` | `union` | 5 种 kind：`arbitrary` / `static` / `functional` / `compound` |
| `arbitrary variant` | `{}` | `[&:hover]:flex` 这种——含 selector 字符串 |
| `depth` | `number` | 嵌套深度——`has-[>img]:flex` 中 `[>img]` 是 depth=1 |
| `relative` | `bool` | 是否相对选择器（`>` / `+` / `~`）——顶层禁止 |

**最佳实践**：
- ✅ 4 种 `Variant` + 5 种 `Candidate` 判别联合——20+ 个判别条件
- ✅ `relative && depth === 0` 直接拒绝——**上下文相关合法**是 FSM 解析痛点
- ✅ 用递归 depth 显式建模嵌套——`has-[>img]:flex` 中外层是 has-，内层 `[>img]` 是 depth=1
- ✅ 任何"DSL 字符串 + 多语法结构"解析都该用 FSM——正则分桶丢失上下文

---

### 模式 3：手写 CSS Parser 保 source map 1:1

**问题场景**：早期 v3 用 PostCSS 的 `parse`，但 PostCSS 会规范化空白（删除注释、合并空格），导致 **source map 行号错位**——debug 时跳到错位置。v4 完全重写 CSS parser，**严格保持源字符偏移**——任何变换都不能改变字符串长度。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/css-parser.ts:64-150
// Note: it is important that any transformations of the input string
// *before* processing do NOT change the length of the string.
export function parse(input: string): AstNode[] {
  let ast: AstNode[] = []
  let i = 0
  // 递归下降 parser + 行/列位置记录
  return ast
}

// 摘自 source-maps/line-table.ts（手写 source map）
// 只生成 line table（输出第几行对应输入第几行）
// 不生成完整 VLQ——Tailwind 不需要列级精度
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `parse(input)` | `function` | 手写递归下降 parser——保持源字符偏移 |
| `line/column` | `position` | 1:1 映射——`error.line` 直接跳到源文件 |
| `line table` | `source map` | 只存行级映射——非完整 VLQ |
| `string length` | `invariant` | 任何变换不能改长度——否则 source map 错位 |
| `PostCSS parse` | `avoided` | 会规范化空白——错位 source map |

**最佳实践**：
- ✅ 严格保持源字符偏移——**任何变换不改字符串长度**
- ✅ 手写递归下降 parser——比 PostCSS 慢 20% 但 source map 1:1
- ✅ 自己的 `source-maps/line-table.ts`——只生成 line table，不需要列级精度
- ✅ 任何"调试体验敏感"的编译器都该保 source map 1:1

---

### 模式 4：DefaultMap 模式（读即建）

**问题场景**：传统 Map 需要 `if (!map.has(k)) map.set(k, factory(k)); return map.get(k)`——3 行模板代码。**读即建**（get-or-create）模式在"按需建索引"场景下出现 100+ 次。**DefaultMap** 是 v4 整个缓存机制的基石——10 行代码，把"读+创建"合并为原子操作。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/utils/default-map.ts
export class DefaultMap<K, V> extends Map<K, V> {
  constructor(private factory: (key: K) => V) { super() }

  get(key: K): V {
    if (!this.has(key)) {
      this.set(key, this.factory(key))
    }
    return super.get(key)!
  }
}

// 使用（design-system.ts:77-110）
let parsedCandidates = new DefaultMap((candidate) =>
  Array.from(parseCandidate(candidate, designSystem))
)

let compiledAstNodes = new DefaultMap<number>((flags) => {
  return new DefaultMap<Candidate>((candidate) => {
    // 编译逻辑
  })
})
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `DefaultMap<K, V>` | `class` | 继承 Map——`get` 时不存在自动调 factory 写入 |
| `factory` | `function` | `(key: K) => V`——key 不存在时调 |
| `get(key)` | `method` | 原子操作"读+创建"——3 行模板变 1 行 |
| `Map` | `extends` | 完全兼容 Map API——可 `new Map(map)` 转换 |
| `two-level` | `nested` | `compiledAstNodes = DefaultMap<number, DefaultMap<Candidate, ...>>`——flags + candidate 双层 |

**最佳实践**：
- ✅ 10 行代码把"读+创建"合并为原子操作——任何"按需建索引"场景都能用
- ✅ 两层 `DefaultMap<number, DefaultMap<Candidate, ...>>`——flags + candidate 双层缓存
- ✅ 完全兼容 Map API——`new Map(map)` 可转换
- ✅ 任何"缓存懒初始化"场景都用此模式——比手动 `if/has/set` 简洁 3 倍

---

### 模式 5：DesignSystem 即缓存（Field-level memoization）

**问题场景**：同一项目下多次编译（watch、dev HMR、prod）会反复解析同一批 utility。v3 让用户自己 `cache`，造成大量样板。v4 把缓存"内置"到 `DesignSystem` 对象——`parsedVariants` / `parsedCandidates` / `compiledAstNodes` 三个 `DefaultMap` 直接挂在对象上。**field-level memoization** 把"长生命周期状态 + memoization"聚合成一个对象，让调用者无需手动管理缓存生命周期。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/design-system.ts:77-110
class DesignSystem {
  parsedVariants = new DefaultMap((variant) => parseVariant(variant, this))
  parsedCandidates = new DefaultMap((candidate) =>
    Array.from(parseCandidate(candidate, this))
  )
  compiledAstNodes = new DefaultMap<number>((flags) => {
    return new DefaultMap<Candidate>((candidate) => {
      // 编译逻辑
    })
  })
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `DesignSystem` | `class` | 状态聚合对象——theme + utilities + variants |
| `parsedVariants` | `DefaultMap` | variant 字符串 → Variant AST |
| `parsedCandidates` | `DefaultMap` | candidate 字符串 → Candidate[] |
| `compiledAstNodes` | `DefaultMap<number, DefaultMap<Candidate, ...>>` | flags + candidate → AST 节点 |
| `field-level memoization` | `pattern` | 缓存字段直接挂在对象上——对调用者零侵入 |

**最佳实践**：
- ✅ 用户零成本获得 memoize——`DesignSystem` 实例在编译期间复用
- ✅ 缓存粒度细到"flags + candidate"——同一 candidate 不同 flags 也能命中
- ✅ 内存占用随编译量线性增长（无 LRU 驱逐）——可接受（编译期短）
- ✅ `DesignSystem` 实例不能跨多项目复用（cache 污染）——单项目生命周期内有效

---

## 二、架构设计

### 模式 6：编译管道（parse → build → compile）

**问题场景**：CSS 编译涉及"扫描源文件"→"解析候选类"→"查设计系统"→"生成 AST"→"排序"→"输出 CSS"——每步都可能写错。**显式生命周期**（parse → build → compile）让副作用与状态分离：每步输入输出明确、可单步调试、可单测。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/index.ts:142
export function parseCss(input: string, opts?: { ... }): { ast: AstNode[]; vars: string } {
  // 步骤1: 解析 CSS → AST
  let ast = parse(input)
  // ...
  return { ast, vars }
}

// 摘自 packages/tailwindcss/src/index.ts:154
export async function buildDesignSystem(opts?: { ... }): Promise<DesignSystem> {
  // 步骤2: 状态聚合——theme + utilities + variants
  return new DesignSystem(...)
}

// 摘自 packages/tailwindcss/src/compile.ts:11
export function compileCandidates(
  candidates: Iterable<string>,
  designSystem: DesignSystem
): { astNodes: AstNode[]; nodeSorting: Map<AstNode, Sorting> } {
  // 步骤3: 候选类 → AST 节点 + 排序
  // ...
  return { astNodes, nodeSorting }
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `parseCss(input)` | `function` | 步骤1——CSS 字符串 → AST |
| `buildDesignSystem()` | `function` | 步骤2——状态聚合（theme + utilities + variants） |
| `compileCandidates(candidates, ds)` | `function` | 步骤3——候选类 → 排序好的 AST 节点 |
| `optimizeAst(ast)` | `function` | 步骤4——优化（`@property` / `color-mix`） |
| `toCss(ast)` | `function` | 步骤5——AST → CSS 字符串 |

**最佳实践**：
- ✅ 显式 5 步管道——每步输入输出明确
- ✅ 副作用与状态分离——`parseCss` 无副作用，`buildDesignSystem` 副作用是建表
- ✅ 可单步调试——dev mode 调每个函数看中间结果
- ✅ 任何"复杂编译器"都该有显式生命周期——避免"大泥球函数"

---

### 模式 7：Utility 字典式注册（`Utilities` 类）

**问题场景**：v4 内置 200+ utility（`bg-red-500` / `flex` / `grid-cols-3` / `p-4` / ...），每个 utility 有自己的"选型规则"和"编译逻辑"。传统做法是 200 个 if-else 分支——慢且难维护。**字典式注册**用 `Map<name, Utility[]>` 存所有 utility，编译时按 root 名查表——O(1) 查找。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/utilities.ts:101-155
class Utilities {
  private utilities = new Map<string, Utility[]>()
  private hasKind = new Map<string, Set<Utility['kind']>>()

  static(name: string, options: { ... }, compileFn: StaticUtilityCompileFn) {
    let key = name
    this.utilities.set(key, this.utilities.get(key) ?? [])
    this.utilities.get(key)!.push({ kind: 'static', compileFn, ...options })
  }

  functional(name: string, options: { ... }, compileFn: FunctionalUtilityCompileFn) {
    // 同上
  }
}

// 编译时
for (let candidate of candidates) {
  let root = candidate.root
  let utilities = this.utilities.get(root) ?? []
  for (let utility of utilities) {
    if (utilityMatchesCandidate(utility, candidate)) {
      return utility.compileFn(candidate, designSystem)
    }
  }
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Utilities` | `class` | utility 字典——`Map<root_name, Utility[]>` |
| `static(name, options, fn)` | `method` | 注册静态 utility（`flex` / `block`） |
| `functional(name, options, fn)` | `method` | 注册函数式 utility（`bg-red-500` / `p-4`） |
| `Utility.kind` | `enum` | `'static' | 'functional'`——区分是否需要参数 |
| `compileFn(candidate, ds)` | `function` | 编译函数——返回 AST 节点 |

**最佳实践**：
- ✅ `Map<name, Utility[]>` 存所有 utility——O(1) 查找
- ✅ 数组而非单值——同一 utility 名可接受多种 dataType（`bg` 既要 named 也要 arbitrary）
- ✅ `utilityMatchesCandidate(utility, candidate)` 判定——`bg-red-500` 命中 `bg` 静态 utility
- ✅ 任何"大量同构函数"注册场景都该用字典式——比 if-else 链快 10 倍

---

### 模式 8：Theme CSS 变量主题

**问题场景**：v3 主题是 JS 对象——`tailwind.config.js:theme.extend.colors`。运行时改主题要"重新编译"。v4 把主题直接存在 **CSS 变量**——`--color-red-500: #ef4444`，运行时改 CSS 变量即可换主题，无需重新编译。**PRR（Property-Reference-Replacement）**：用 `var(--color-red-500)` 引用而非字面量值。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/theme.ts:139-142
prefixKey(key: string) {
  if (!this.prefix) return key
  return `--${this.prefix}-${key.slice(2)}`  // slice(2) 跳过 --
}

// 摘自 theme.ts:17-33
ignoredThemeKeyMap = {
  font: ['--font-weight', '--font-size']  // --font 命名空间下排除子命名空间
}

// 用户 @theme 块
// @theme {
//   --color-red-500: #ef4444;
//   --spacing-4: 1rem;
// }
// 自动生成：
// :root {
//   --color-red-500: #ef4444;
//   --spacing-4: 1rem;
// }
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Theme` | `class` | 设计 token → CSS 变量映射 |
| `--color-red-500` | `CSS var` | 设计 token 物理存储 |
| `var(--color-red-500)` | `PRR` | 引用而非字面量——运行时改主题 |
| `prefixKey()` | `method` | prefix in place——`--color-red-500` + prefix → `--prefix-color-red-500` |
| `ignoredThemeKeyMap` | `static` | 命名空间互斥——`--font` 下排除 `--font-weight` 等子命名空间 |

**最佳实践**：
- ✅ CSS 变量主题——运行时改主题无需重新编译
- ✅ `var(--color-red-500)` 引用而非字面量值——方便动态换肤
- ✅ `prefixKey()` 用 `slice(2)` 跳过 `--`——prefix in place 避免污染后续命名
- ✅ `ignoredThemeKeyMap` 命名空间互斥——`--font` 不被 `--font-weight` 干扰

---

### 模式 9：手写 AST walk 支持 Replace

**问题场景**：PostCSS 的 `walk()` 不支持"替换当前节点并跳过子节点"这种原子操作。Tailwind 的 `@apply` 需要"边遍历边改树"——把 `@apply flex` 替换成 `display: flex`，然后跳过子节点。**手写 walk 引擎**用 tagged union（`Continue` / `Skip` / `Stop` / `Replace` / `ReplaceSkip` / `ReplaceStop`）支持 6 种动作。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/walk.ts:10-20
const WalkAction = {
  Continue: 'continue',
  Skip: 'skip',
  Stop: 'stop',
  Replace: (replacement: AstNode) => ({ kind: 'replace', replacement }),
  ReplaceSkip: (replacement: AstNode) => ({ kind: 'replace-skip', replacement }),
  ReplaceStop: (replacement: AstNode) => ({ kind: 'replace-stop', replacement }),
}

// 遍历
function walk(ast: AstNode[], visit: (node) => WalkAction) {
  for (let node of ast) {
    let action = visit(node)
    if (action.kind === 'replace-stop') {
      // 替换当前节点 + 停止遍历
    } else if (action.kind === 'replace-skip') {
      // 替换当前节点 + 跳过子节点
    }
  }
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `WalkAction` | `tagged union` | 6 种动作：`Continue` / `Skip` / `Stop` / `Replace` / `ReplaceSkip` / `ReplaceStop` |
| `walk(ast, visit)` | `function` | 自定义 AST 遍历器 |
| `Continue` | `action` | 继续遍历子节点 |
| `Skip` | `action` | 跳过当前节点的子节点 |
| `Stop` | `action` | 停止整个遍历 |
| `Replace(replacement)` | `action` | 替换当前节点 |

**最佳实践**：
- ✅ Tagged union 比 boolean 返回值更细粒度——6 种动作原子化
- ✅ `Replace(replacement)` 让边遍历边改树成为可能——@apply 替换 + 跳过子节点
- ✅ PostCSS `walk()` 不支持 `ReplaceSkip` 原子操作——Tailwind 自己做
- ✅ 任何"边遍历边改树"的编译器都该有此设计

---

### 模式 10：Cumulative Context 节点

**问题场景**：遍历 AST 时常常需要把"父节点的元数据"传到子节点——`base` / `important` / `variants` 等。PostCSS 的 `result.opts` 是全局的，粒度太粗。**Cumulative Context 节点**（`ast.ts:50-57`）允许把 `base` 等元数据挂到 AST 子树，遍历时通过 `VisitContext` 透传。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/ast.ts:50-57
class Context extends AstNode {
  constructor(
    public node: AstNode,
    public context: { base: string; important: boolean }
  ) {
    super()
  }
}

// 遍历时
function walkWithContext(ast, visit, inheritedContext) {
  for (let node of ast) {
    if (node instanceof Context) {
      let merged = { ...inheritedContext, ...node.context }
      walkWithContext([node.node], visit, merged)
    } else {
      let action = visit(node, inheritedContext)
    }
  }
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Context` | `AstNode` | 包装子节点 + 携带元数据（`base` / `important`） |
| `node.context.base` | `string` | 父节点的 base utility（`flex` / `bg-red-500`） |
| `inheritedContext` | `recursive` | 父节点的 context 透传到子节点 |
| `merged context` | `combine` | 子节点 context 覆盖父节点（`{ ...parent, ...child }`） |
| `VisitContext` | `param` | 遍历时透传——`visit(node, inheritedContext)` |

**最佳实践**：
- ✅ `Context` 节点把父元数据挂到子树——粒度比 `result.opts` 细
- ✅ `inheritedContext` 递归透传——子节点继承父节点 context
- ✅ 子节点 context **覆盖**父节点（`{ ...parent, ...child }`）——子节点优先
- ✅ 任何"父元数据需要传到子节点"的 AST 都该有 Context 节点

---

## 三、性能优化

### 模式 11：Rust 扫描器（oxide）剥离 IO/CPU 重活

**问题场景**：v3 扫描器是 `defaultExtractor`，本质是正则匹配。项目大了之后（含 `node_modules`），扫描时间占比 60%+——30s+ 构建时间让 dev HMR 体验崩溃。v4 引入 `crates/oxide`（Rust crate）+ `@tailwindcss/oxide`（napi-rs 绑定），**Rust 干 IO/CPU 重的活，TS 干语义/编译重的活**。

**解决方案**：

```rust
// 摘自 crates/oxide/src/scanner/mod.rs
pub struct Scanner {
    base: PathBuf,
    sources: Vec<IncludePattern>,
    automations: bool,  // CSS 自动生成
}

impl Scanner {
    pub fn scan(&self) -> Vec<String> {
        // 1. 遍历 base 下所有文件（IO 重活）
        // 2. 按 extractor 抽候选类（CPU 重活）
        // 3. 返回候选类列表
    }
}
```

```ts
// @tailwindcss/postcss 调用
import { Scanner } from '@tailwindcss/oxide'
const scanner = new Scanner({ base: projectRoot, sources: ['**/*.{html,ts,tsx}'] })
const candidates = scanner.scan()
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `oxide` | `Rust crate` | 扫描器——IO/CPU 重活 |
| `napi-rs` | `binding` | Rust ↔ Node.js 绑定 |
| `WASI` | `WASM` | 浏览器 fallback（无 Node API） |
| `crates/node/npm/` | `14 平台` | win-x64 / darwin-arm64 / linux-x64-gnu 等 NAPI binary |
| `crates/oxide/src/scanner/` | `directory` | 扫描器 + 多语言 extractor |

**最佳实践**：
- ✅ **混合架构决策**——Rust 写扫描器、TS 写编译器，按 IO/CPU 复杂度分工
- ✅ NAPI + WASI 双绑定——Node.js 用 native module，浏览器用 WASI
- ✅ 大型 monorepo 构建时间从 30s+ 降到 3-5s——性能 +6-10 倍
- ✅ 编译/发布流程变复杂（`build.rs` 编译 NAPI、生成 14 个平台 binary）——权衡后值得

---

### 模式 12：lightningcss 优化 + polyfill 完备

**问题场景**：输出的 CSS 要兼容旧浏览器——`@property` / `color-mix()` 是 CSS 新特性，旧浏览器不支持。**polyfill** 让用户按需开启。同时，输出的 CSS 可被 **lightningcss** 进一步优化（合并规则、minify、autoprefixer）。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/index.ts:42-53
const Polyfills = {
  AtProperty: '@property polyfill',
  ColorMix: 'color-mix() polyfill',
}

// 用户配置
// @config "./tailwind.config.js" {
//   polyfills: ['at-property', 'color-mix']
// }

// 编译后
// @property --tw-bg-opacity { syntax: '<percentage>'; ... }
// .bg-red-500 { background-color: color-mix(in oklab, #ef4444 50%, transparent); }

// @tailwindcss/postcss:144-145
// CSS Module 文件中禁用 @property polyfill——* 语法污染全局
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `@property` | `CSS Houdini` | 自定义属性类型——`@property --tw-bg-opacity { syntax: '<percentage>'; }` |
| `color-mix()` | `CSS Color 5` | 颜色混合——`color-mix(in oklab, red 50%, blue)` |
| `lightningcss` | `optimizer` | CSS 优化器——minify / autoprefixer / 合并 |
| `Polyfills.AtProperty` | `class` | 旧浏览器 polyfill |
| `Polyfills.ColorMix` | `class` | 旧浏览器 polyfill |

**最佳实践**：
- ✅ `@property` + `color-mix()` 完备 polyfill——按需开启
- ✅ CSS Module 文件禁用 `@property` polyfill——`*` 语法污染全局
- ✅ 配合 lightningcss 进一步 minify + autoprefixer
- ✅ 任何"新 CSS 特性"项目都该有 polyfill 开关

---

### 模式 13：增量构建（`@tailwindcss/postcss` rebuildStrategy）

**问题场景**：dev HMR 时用户改一个文件，PostCSS 触发全量 rebuild——所有候选类重新扫描 + 编译，10s+ 延迟。**增量构建**跟踪文件 mtime 变化：未变文件用缓存，变化文件才重扫+重编译。

**解决方案**：

```ts
// 摘自 packages/@tailwindcss-postcss/src/index.ts:162-198
class RebuildStrategy {
  full: () => Promise<void>      // 全量重建
  incremental: () => Promise<void>  // 增量重建
}

// 决策
if (context.mtimes.has(changedFile)) {
  await strategy.incremental()  // 只重新跑候选提取
} else {
  await strategy.full()  // 全量重建
}

// Quick bail（packages/@tailwindcss-postcss:96-114）
// 快速扫一遍 AST，如果没有任何 Tailwind at-rule（@tailwind @apply @theme 等）
// 直接 return——避免给非 Tailwind 项目引入开销
if (!hasTailwindAtRules(root)) {
  return  // Quick bail
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `rebuildStrategy` | `'full' | 'incremental'` | 决策——mtime 变化 vs 全量 |
| `context.mtimes` | `Map<file, mtime>` | 文件 mtime 跟踪 |
| `Quick bail` | `optimization` | 无 Tailwind at-rule 直接 return——零开销 |
| `hasTailwindAtRules(root)` | `function` | 检测是否有 `@tailwind` `@apply` `@theme` |
| `incremental` | `optimization` | 只重跑候选提取——10s+ → 100ms |

**最佳实践**：
- ✅ `mtime` 跟踪——变化才增量重建，未变化文件用缓存
- ✅ Quick bail——无 Tailwind at-rule 直接 return，零开销
- ✅ dev HMR 延迟从 10s+ 降到 100ms——10x 性能提升
- ✅ 任何"watch + HMR"编译器都该有 incremental 模式

---

### 模式 14：Property-order 全局唯一排序

**问题场景**：CSS 输出顺序决定最终样式（后定义覆盖前定义）。v3 每次输出顺序随机——同一 utility 偶尔"被覆盖"偶尔"不覆盖"。**property-order 全局唯一排序**保证输出确定性——相同输入 → 相同输出。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/property-order.ts
const propertyOrder = [
  'display', 'visibility', 'position', 'inset', 'top', 'right', 'bottom', 'left',
  'isolation', 'z-index', 'order', 'grid-column', 'grid-row', 'flex', 'flex-basis',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-content', 'align-items',
  'align-self', 'place-content', 'place-items', 'place-self',
  // ... 200+ CSS 属性按"组"排序
]

// 排序时
function sortByPropertyOrder(astNodes) {
  return astNodes.sort((a, z) => {
    let aIndex = propertyOrder.indexOf(a.property)
    let zIndex = propertyOrder.indexOf(z.property)
    return aIndex - zIndex
  })
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `propertyOrder` | `array` | 200+ CSS 属性按"组"排序（display → position → 布局 → ...） |
| `sortByPropertyOrder` | `function` | 按属性顺序排序——确定输出 |
| 确定性 | `principle` | 相同输入 → 相同输出——可缓存、可对比 |
| 200+ 属性 | `coverage` | 覆盖所有常用 CSS 属性——未知属性排到末尾 |
| `group` | `concept` | display 组 / position 组 / flex 组 / grid 组 / ... |

**最佳实践**：
- ✅ 200+ 属性按"组"排序——display 组 / position 组 / flex 组
- ✅ 相同输入 → 相同输出——**确定性**是缓存和 diff 的前提
- ✅ 未知属性排到末尾——避免乱序
- ✅ 任何"输出顺序敏感"的编译器都该有全局 property order

---

### 模式 15：WASM 多平台 + NAPI fallback

**问题场景**：NAPI 绑定要编译 14 个平台 binary（win-x64 / darwin-arm64 / linux-x64-gnu / ...）——NAPI 失败时（缺 native module）需 fallback。**WASM**（通过 WASI）是 universal fallback——所有平台都支持。`@tailwindcss/browser` 纯浏览器跑 WASM，无需 Node API。

**解决方案**：

```ts
// 摘自 packages/tailwindcss/src/index.ts
import { Scanner } from '@tailwindcss/oxide'

// Node.js 环境用 NAPI native module
// 浏览器环境自动 fallback 到 WASI
const scanner = new Scanner({ base, sources })

// crates/node/npm/ 下 14 个平台子目录
// - win-x64/
// - darwin-arm64/
// - darwin-x64/
// - linux-x64-gnu/
// - linux-x64-musl/
// - linux-arm64-gnu/
// - linux-arm64-musl/
// - ...
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `NAPI` | `native` | Node.js 原生模块——性能最优 |
| `WASI` | `WASM` | 浏览器 fallback——universal |
| `14 平台` | `binary` | win/darwin/linux × x64/arm64 × gnu/musl |
| `crates/node/npm/` | `directory` | 14 个平台子目录 + 独立 package.json |
| `Instrumentation` | `class` | 性能监控——`env.DEBUG` 输出耗时 |

**最佳实践**：
- ✅ NAPI + WASI 双绑定——Node.js 优 NAPI、浏览器 fallback WASI
- ✅ 14 平台 binary 显式管理——避免运行时 NAPI 失败
- ✅ `Instrumentation` 类——`env.DEBUG` 开启后输出每步耗时
- ✅ 任何"跨平台 native 模块"项目都该有 NAPI + WASI 双 fallback

---

## 四、工程实践

### 模式 16：CSS-first 配置（`@theme` `@source` `@apply`）

**问题场景**：v3 配置在 `tailwind.config.js`——和业务代码分离，但配置变更要"重新 build + restart dev server"。v4 把配置**迁移到 CSS 内部**——`@theme` `@source` `@apply` `@plugin` 等指令在 `.css` 里。**CSS-first 配置**让"改主题"和"改 CSS"在同一文件——单源真相。

**解决方案**：

```css
/* 摘自用户 CSS 文件（v4 CSS-first） */
@import "tailwindcss";

@theme {
  --color-brand: #0088cc;
  --spacing-4: 1rem;
}

@source not "**/*.test.tsx";  /* 排除测试文件 */

@plugin "@tailwindcss/forms";

/* utility 定义 */
@utility tab-* {
  tab-size: --value(integer);
}

/* 使用 */
.btn {
  @apply bg-brand px-4 py-2;  /* 引用 utility */
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `@theme` | `directive` | 主题变量——`--color-brand: #0088cc` |
| `@source` | `directive` | 扫描源——`@source not "**/*.test.tsx"` 排除 |
| `@plugin` | `directive` | 加载插件——`@plugin "@tailwindcss/forms"` |
| `@utility` | `directive` | 自定义 utility——`@utility tab-* { tab-size: --value(integer); }` |
| `@apply` | `directive` | 在 CSS 中引用 utility |

**最佳实践**：
- ✅ 配置和 CSS 同文件——**单源真相（SSOT）**
- ✅ `@theme` 主题直接 CSS 变量——运行时改主题无需重新编译
- ✅ `@source not "**/*.test.tsx"` 排除测试文件——减小产物
- ✅ 任何"主题/配置/utility 同源"的项目都该用 CSS-first

---

### 模式 17：14 个平台 native binding + 自动 fallback

**问题场景**：NAPI binding 编译 14 个平台 binary——发布流程复杂；用户环境 NAPI 失败时不能"卡死"——必须有 WASI fallback。**14 个平台子目录**每个有独立 `package.json`，自动选择匹配的 binary。

**解决方案**：

```json
// 摘自 crates/node/npm/win-x64-msvc/package.json
{
    "name": "@tailwindcss/oxide-win32-x64-msvc",
    "version": "4.3.0",
    "main": "tailwindcss-oxide.win32-x64-msvc.node",
    "os": ["win32"],
    "cpu": ["x64"]
}

// 摘自 crates/node/npm/darwin-arm64/package.json
{
    "name": "@tailwindcss/oxide-darwin-arm64",
    "version": "4.3.0",
    "main": "tailwindcss-oxide.darwin-arm64.node",
    "os": ["darwin"],
    "cpu": ["arm64"]
}

// @tailwindcss/oxide 自动选择
try {
  const { Scanner } = require('@tailwindcss/oxide-win32-x64-msvc')
} catch {
  // fallback 到 WASI
  const { Scanner } = require('@tailwindcss/oxide-wasi')
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `os` | `package.json field` | 平台白名单——`["win32"]` / `["darwin"]` / `["linux"]` |
| `cpu` | `package.json field` | CPU 架构——`["x64"]` / `["arm64"]` |
| `main` | `package.json field` | native binary 路径 |
| `NAPI` | `binding` | Node.js native module |
| `WASI` | `fallback` | 浏览器/WASI fallback |

**最佳实践**：
- ✅ 每个平台子目录独立 `package.json`——npm 自动选择匹配 binary
- ✅ `os` + `cpu` 字段控制平台白名单——避免误装
- ✅ NAPI 失败自动 fallback 到 WASI——保证 universal 可用
- ✅ 任何"跨平台 native 模块"项目都该有此设计

---

### 模式 18：多适配层（CLI / PostCSS / Vite / Webpack / 浏览器）

**问题场景**：Tailwind 用户在各种构建工具下——CLI / PostCSS / Vite / Webpack / 浏览器。**单一入口无法覆盖**。v4 提供 6 个适配包——`@tailwindcss/cli` `@tailwindcss/postcss` `@tailwindcss/vite` `@tailwindcss/webpack` `@tailwindcss/browser` `@tailwindcss/standalone`——每个适配包都是**轻包装** + **重写到构建工具的钩子**。

**解决方案**：

```ts
// 摘自 packages/@tailwindcss-vite/src/index.ts（Vite 适配）
export default function tailwindcss(): Plugin {
  return {
    name: 'tailwindcss',
    // dev HMR
    configureServer(server) {
      server.watcher.add(['**/*.html', '**/*.tsx'])
      // 监听文件变化
    },
    // prod build
    transform(code, id) {
      // 处理 .css 文件
    },
  }
}

// 摘自 packages/@tailwindcss-postcss/src/index.ts（PostCSS 适配）
module.exports = (opts = {}) => {
  return {
    postcssPlugin: 'tailwindcss',
    Once(root, { result }) {
      // 一次性处理整个 CSS
    },
  }
}
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `@tailwindcss/cli` | `package` | CLI 入口——`tailwindcss --input input.css --output output.css` |
| `@tailwindcss/postcss` | `package` | PostCSS 插件——`postcss.config.js` 加 `tailwindcss: {}` |
| `@tailwindcss/vite` | `package` | Vite 插件——`vite.config.ts` 加 `tailwindcss()` |
| `@tailwindcss/webpack` | `package` | Webpack loader |
| `@tailwindcss/browser` | `package` | 浏览器版（CDN 即用）——WASM |
| `@tailwindcss/standalone` | `package` | 单文件二进制 CLI |

**最佳实践**：
- ✅ 6 个适配包——**轻包装 + 重写到构建工具的钩子**
- ✅ 核心编译器（`packages/tailwindcss/`）只做核心逻辑——适配层做"翻译"
- ✅ dev HMR + prod build 差异化——dev 走增量、prod 走全量
- ✅ 任何"多构建工具"项目都该有"核心 + 适配"分层

---

### 模式 19：4 道测试防线（unit + integration + Rust + E2E）

**问题场景**：CSS 编译器输出的 CSS 要在 100+ 真实框架（Next.js / Nuxt / SvelteKit / ...）跑得对——单测覆盖不到。**4 道防线**：vitest 单元 + 集成测试（真实跑 10+ 框架）+ Rust 单元（oxide 扫描器）+ Playwright E2E（真实浏览器加载页面）。

**解决方案**：

```bash
# 摘自 package.json scripts
"test": "cargo test && vitest run --hideSkippedTests",  # 单元
"test:integrations": "vitest --root=./integrations",     # 集成
"test:ui": "pnpm run --filter=@tailwindcss/browser test:ui",  # Playwright E2E
"bench": "vitest bench"                                  # 性能基准
```

```ts
// 摘自 packages/tailwindcss/src/__snapshots__/（50+ 快照）
test('bg-red-500/50', () => {
  expect(compile('.bg-red-500\\/50')).toMatchSnapshot()
})

test('[&_p]:flex', () => {
  expect(compile('[&_p]:flex')).toMatchSnapshot()
})
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `vitest` | `unit test` | 单元测试——`packages/tailwindcss/src/__snapshots__/` 50+ 快照 |
| `integrations/` | `integration test` | 真实跑 10+ 框架（Next.js / Nuxt / SvelteKit / ...） |
| `cargo test` | `Rust unit` | oxide 扫描器单元测试 |
| `Playwright` | `E2E` | 真实浏览器加载页面——检查计算样式 |
| `vitest bench` | `benchmark` | 性能基准——`css-parser.bench.ts` / `sort.bench.ts` |

**最佳实践**：
- ✅ 50+ 快照测试覆盖 DSL 角落——`bg-red-500/50` `[&:hover]:flex` `has-[>img]:grid`
- ✅ 集成测试跑真实 10+ 框架——验证生产环境兼容
- ✅ Rust 单元测试独立——`cargo test` 单独跑
- ✅ Playwright E2E——真实浏览器验证计算样式

---

### 模式 20：Playwright 验证 + 性能基准

**问题场景**：快照测试只能验证"输出字符串"——不能验证"浏览器真的渲染对了"。**Playwright 验证**启动真实 Chromium 加载页面，检查计算样式（`getComputedStyle(elem).backgroundColor === 'rgb(239, 68, 68)'`）。同时 **vitest bench** 跑性能基准——`css-parser.bench.ts` / `sort.bench.ts` 跟踪性能回归。

**解决方案**：

```ts
// 摘自 tests/ui.spec.ts
import { test, expect } from '@playwright/test'

test('bg-red-500 renders correctly', async ({ page }) => {
  await page.goto('/test-page.html')
  let bgColor = await page.locator('.bg-red-500').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bgColor).toBe('rgb(239, 68, 68)')
})

// 摘自 css-parser.bench.ts
import { bench, describe } from 'vitest'

describe('css-parser', () => {
  bench('parse simple css', () => {
    parse('body { color: red; }')
  })

  bench('parse complex css', () => {
    parse('@layer utilities { .flex { display: flex; } }')
  })
})
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Playwright` | `e2e` | 真实浏览器加载页面——检查计算样式 |
| `getComputedStyle` | `browser API` | 浏览器计算样式——`backgroundColor` / `display` / ... |
| `vitest bench` | `benchmark` | 性能基准——跟踪回归 |
| `css-parser.bench.ts` | `bench file` | CSS 解析性能 |
| `sort.bench.ts` | `bench file` | variant 排序性能 |
| `CI 矩阵` | `3 平台` | Win/Linux/macOS × 2 步 + 1 Playwright |

**最佳实践**：
- ✅ 真实浏览器验证——`getComputedStyle` 才是最终用户看到的样式
- ✅ vitest bench 跟踪性能回归——`css-parser.bench.ts` 每次跑测试都看
- ✅ 3 平台 CI 矩阵（Win/Linux/macOS）——跨平台验证
- ✅ 任何"输出视觉效果"项目都该有 Playwright E2E

---

## 总结

Tailwind CSS 的 20 个核心模式围绕 4 大主题：

1. **核心机制**（模式 1-5）— bigint 位运算编码 variant、FSM 候选解析、手写 CSS Parser 保 source map、DefaultMap 模式、DesignSystem 即缓存
2. **架构设计**（模式 6-10）— 编译管道（parse → build → compile）、Utility 字典式注册、Theme CSS 变量、手写 AST walk、Cumulative Context 节点
3. **性能优化**（模式 11-15）— Rust 扫描器（oxide）、lightningcss 优化 + polyfill 完备、增量构建、Property-order 全局唯一排序、WASM 多平台 + NAPI fallback
4. **工程实践**（模式 16-20）— CSS-first 配置、14 个平台 native binding、多适配层、4 道测试防线、Playwright 验证 + 性能基准

这 20 个模式是 Tailwind CSS v4 解决"utility-first CSS 编译"四大痛点（DSL 字符串解析、variant 排序、扫描性能、跨平台 native binding）的完整答案。任何要做"DSL 字符串 → AST → 编译输出"的项目都该照抄。
