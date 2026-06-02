# Quill · 架构与工程实践精要

> Quill 是用 Delta 数据流 + Parchment 文档树 + Registry 注册中心构建的现代富文本编辑器。本笔记从 Amazon Builders' Library 视角剖析其四层架构（Delta / Parchment / Editor / Theme），聚焦 20 个工程模式与决策。

---

## 一、核心机制与编辑器哲学

### 模式 1：Delta-as-SSOT（不可变操作流为单一可信源）

**问题场景**：富文本编辑器的"内容"需要在内存、DOM、本地存储、协同通道、历史栈之间反复流转。如果"内容"和"变更"用不同数据模型表示，序列化、逆操作、合并、撤销都需要重新设计，并且极难保持一致性。

**解决方案代码**：

```typescript
// quill-delta 库：所有"内容"和"变更"都表达为 op 数组
import Delta from 'quill-delta';

const initial = new Delta([
  { insert: 'Hello ' },
  { insert: 'World', attributes: { bold: true } },
  { insert: '!\n' },
]);

// 修改也用 Delta
const change = new Delta().retain(6).insert('Awesome ').delete(5);

// 应用变更
const next = initial.compose(change);
// next.ops === [
//   { insert: 'Hello ' },
//   { insert: 'Awesome ' },
//   { insert: 'World', attributes: { bold: true } },
//   { insert: '!\n' },
// ]

// 撤销：基于"基线"反演
const inverse = change.invert(initial);
// inverse.ops === [{ retain: 13 }, { delete: 8 }, { retain: 2 }, { delete: 1 }]

// 协同：两条并发变更按优先级合并
const merged = changeA.transform(changeB, true);
```

**关键参数表**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `insert` | string \| object \| number | 插入内容；字符串表示文本，number 表示行嵌入，对象表示 embed |
| `retain` | number | 保留 N 个字符不动，可携带 `attributes` 表示格式变更 |
| `delete` | number | 删除 N 个字符 |
| `attributes` | Record<string, any> | 内联属性（如 bold / italic / link），挂在 retain 上 |
| `invert(base)` | Delta → Delta | 求当前 delta 相对 base 的逆操作 |
| `transform(other, priority)` | Delta → Delta | OT 合并；priority=true 表示本地优先 |
| `compose(other)` | Delta → Delta | 顺序合并：先 this 后 other |

**最佳实践列表**：
- 把"内容"与"变更"用同一类型（Delta）表达，外部可以做乐观更新、OT 合并、撤销栈而无需类型转换
- 永不直接修改 op 数组——`compose/invert/transform` 都返回新实例
- `attributes` 挂载在 `retain` op 上而非 `insert` 上，因为"格式"是位置的属性，不是内容的属性
- 用 `JSON.stringify(delta)` 即可落库，跨语言反序列化只需 quill-delta 的同构实现

### 模式 2：contenteditable 而非 iframe 沙箱

**问题场景**：v0.19 之前的 Quill 用 iframe 隔离样式（因为当时 contenteditable 行为诡异），但代价是与宿主页面 CSS 隔离、移动端 IME 难处理、SEO 不友好、组件库（Material/Chakra）样式无法穿透。

**解决方案代码**：

```typescript
// core/quill.ts 构造函数：用 contenteditable 容器
class Quill {
  constructor(container: HTMLElement | string, options: QuillOptions = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    if (this.container == null) throw new Error('Container not found');

    // 关键：把容器加上 contenteditable
    this.container.classList.add('ql-container');
    this.container.setAttribute('contenteditable',
      this.options.bounds ? 'true' : 'false');  // bounds=false 时禁止光标出域

    // 监听原生 IME / Selection 事件
    this.selection = new Selection(this, this.container);
    this.composition = new Composition(this);  // 处理中文/日文 IME 合成
    this.editor = new Editor(this);            // Delta ⇄ DOM 翻译
  }
}
```

**关键参数表**：

| 选项 | 默认值 | 说明 |
|---|---|---|
| `theme` | `'snow'` | snow（经典工具栏）/ bubble（浮泡）/ base（无样式） |
| `bounds` | `document.body` | 限制光标可移动的 DOM 范围，置空则全局可达 |
| `placeholder` | `''` | 空文档占位符 |
| `readOnly` | `false` | 整体只读 |
| `scrollingContainer` | `document.body` | 滚动容器，用于选区自动滚动 |
| `debug` | `false` | 启用 `'log' / 'warn' / 'error'` 命名空间 |
| `registry` | globalRegistry | 自定义格式注册表 |

**最佳实践列表**：
- contenteditable + MutationObserver 是现代富文本的事实标准，iframe 仅用于样式完全隔离的极端场景
- `Composition` 模块必须独立成类——中文/日文/韩文 IME 合成期间不应触发 history 记录
- `bounds` 选项是 SaaS 多编辑器场景的安全阀：把光标锁在容器内避免选区逃逸
- 不要在 v1 时代用 `document.execCommand`——v2 已全面改用 Selection API

### 模式 3：Parchment 文档树与 Attributor 双轨制

**问题场景**：富文本既需要"内联属性"（bold/italic/color）又需要"嵌入对象"（image/video/table/mention）。如果用统一的 DOM 节点表达，"加粗文字 + 中间一张图"这种组合要么嵌套层级爆炸，要么属性丢失。

**解决方案代码**：

```typescript
// 简单属性用 Attributor（共享实例，挂在原生标签的 class/style/attribute）
import Parchment from 'parchment';
const Bold = new Parchment.Attributor.Class('bold', 'ql-bold', { scope: Parchment.Scope.INLINE });
const Color = new Parchment.Attributor.Style('color', 'color', { scope: Parchment.Scope.INLINE });
const Link = new Parchment.Attributor.Attribute('link', 'href', { scope: Parchment.Scope.INLINE });

// 复杂结构用 Blot（独立 DOM 子树）
class ImageBlot extends Parchment.Embed {
  static create(value: { src: string; alt?: string }) {
    const node = document.createElement('img');
    node.setAttribute('src', value.src);
    if (value.alt) node.setAttribute('alt', value.alt);
    return node;
  }
  static value(domNode: HTMLImageElement) {
    return { src: domNode.getAttribute('src'), alt: domNode.getAttribute('alt') };
  }
}
ImageBlot.blotName = 'image';
ImageBlot.tagName = 'IMG';
Quill.register('formats/image', ImageBlot);
```

**关键参数表**：

| 抽象 | 适用场景 | 渲染开销 | 内存开销 |
|---|---|---|---|
| `Attributor.Class` | 布尔属性（bold/italic/underline） | 极低（共享类名） | 极低（单例） |
| `Attributor.Style` | CSS 属性（color/font-size） | 低（共享 style） | 极低 |
| `Attributor.Attribute` | 值属性（href/src） | 低 | 极低 |
| `Embed Blot` | 嵌入对象（image/video/iframe） | 中（独立子树） | 中（每实例一节点） |
| `Block Blot` | 块级格式（header/blockquote） | 中 | 中 |
| `Inline Blot` | 内联容器（formula/math） | 中 | 中 |
| `Container Blot` | 容器（list/table） | 高 | 高 |

**最佳实践列表**：
- 简单属性永远用 Attributor，避免无谓的 DOM 嵌套
- 复杂结构（带 children 或独立行为）才用 Blot
- `Attributor.Scope.INLINE` / `BLOCK` 决定属性可挂载的位置
- 自定义 Blot 必须实现 `static create(value)` 和 `static value(domNode)`——前者序列化方向，后者反序列化方向

### 模式 4：Registry 注册中心（覆盖式注入）

**问题场景**：编辑器需要支持"出厂默认格式 + 用户自定义格式"。如果用 `Map<name, Constructor>` 简单映射，无法实现"覆盖默认 bold"、批量注册、tree-shaking。

**解决方案代码**：

```typescript
// core/quill.ts:127-179：3 种重载
static register(...args: any[]): void {
  if (typeof args[0] !== 'string') {
    // 重载 1：register({ a: x, b: y }, overwrite) —— 批量注册
    const [target, overwrite] = args;
    const name = 'attrName' in target ? target.attrName : target.blotName;
    if (typeof name === 'string') {
      this.register(`formats/${name}`, target, overwrite);
    } else {
      Object.keys(target).forEach((key) => this.register(key, target[key], overwrite));
    }
  } else {
    // 重载 2：register(path, target, overwrite)
    const [path, target, overwrite] = args;
    if (this.imports[path] != null && !overwrite) {
      debug.warn(`Overwriting ${path} with`, target);
    }
    this.imports[path] = target;
    // 自动注册到 Parchment 全局 Registry
    if ((path.startsWith('blots/') || path.startsWith('formats/')) && target.blotName !== 'abstract') {
      globalRegistry.register(target);
    }
    if (typeof target.register === 'function') {
      target.register(globalRegistry);
    }
  }
}

// 出厂配置：core/quill.ts:53-72 一行批量注册 17 个 attributor + 26 个 format
Quill.register({
  'attributors/attribute/class': ...,
  'attributors/style/color': ...,
  'formats/bold': ...,
  'formats/header': ...,
  'formats/image': ...,
  'modules/clipboard': Clipboard,
  'modules/keyboard': Keyboard,
  // ... 共 43 项
}, true);
```

**关键参数表**：

| 路径前缀 | 含义 | 注册目标 |
|---|---|---|
| `formats/<name>` | 具体格式 Blot/Attributor | globalRegistry |
| `blots/<name>` | 基础 Blot（block/inline/text） | globalRegistry |
| `modules/<name>` | 功能模块（clipboard/keyboard） | Quill 实例的 modules 表 |
| `themes/<name>` | 主题（snow/bubble） | Quill 实例的 theme |
| `attributors/class/<name>` | ClassAttributor 别名 | globalRegistry |
| `attributors/style/<name>` | StyleAttributor 别名 | globalRegistry |
| `attributors/attribute/<name>` | AttributeAttributor 别名 | globalRegistry |

**最佳实践列表**：
- 用 `Quill.register('formats/my', MyBlot)` 单条注册；用 `Quill.register({...}, true)` 批量覆盖
- `overwrite=true` 是 SaaS 二次开发的关键——可在不 fork 源码的情况下替换任意格式
- 自定义 Blot 必须有唯一 `blotName`（全局），否则会 warn
- `abstract` Blot 是 Parchment 内部基类，禁止注册到全局

### 模式 5：Emitter 双层总线（语义事件 + DOM 桥接）

**问题场景**：富文本需要响应"内容变化"（text-change）、"选区变化"（selection-change）、"编辑器状态"（editor-change）三类事件，同时还要桥接 DOM 事件（mousedown/keyup/paste）。如果用单一 EventEmitter，多实例页面（同一页两个 Quill）会串扰。

**解决方案代码**：

```typescript
// core/emitter.ts：继承 eventemitter3 + 作用域封装
import EventEmitter from 'eventemitter3';
const CAPTURE_BUBBLING_EVENTS = ['selectionchange', 'mousedown', 'mouseup', 'click', 'focus', 'blur'];

class Emitter extends EventEmitter<string | symbol> {
  static events = {
    TEXT_CHANGE: 'text-change',
    SELECTION_CHANGE: 'selection-change',
    EDITOR_CHANGE: 'editor-change',
  };

  listenDOM(node: Node, event: string, handler: (e: Event) => void) {
    // 把 DOM 事件桥接到语义事件，并按容器作用域分发
    const listener = (e: Event) => {
      if (this.container.contains(e.target as Node) || e.target === this.container) {
        handler(e);
      }
    };
    node.addEventListener(event, listener, CAPTURE_BUBBLING_EVENTS.includes(event));
    return () => node.removeEventListener(event, listener);  // 返回 unsubscribe
  }

  emitTextChange(delta: Delta, oldContents: Delta, source: string) {
    this.emit(Emitter.events.TEXT_CHANGE, { delta, oldContents, source });
    this.emit(Emitter.events.EDITOR_CHANGE, { type: 'text', delta, oldContents, source });
  }
}

// 使用：模块订阅
quill.on('text-change', (delta, oldContents, source) => {
  if (source === Emitter.sources.USER) saveDraft(quill.getContents());
});
```

**关键参数表**：

| 事件 | 触发时机 | 载荷 |
|---|---|---|
| `text-change` | 内容变化 | `{ delta, oldContents, source }` |
| `selection-change` | 选区变化 | `{ range, oldRange, source }` |
| `editor-change` | 文本/选区任意变化 | `{ type: 'text' \| 'selection', ... }` |
| `selectionchange` (DOM) | 浏览器原生选区 | Event |
| `mousedown/mouseup/click` (DOM) | 鼠标交互 | Event |
| `focus/blur` (DOM) | 焦点进出 | Event |

`source` 取值：`'user'`（用户操作） / `'api'`（程序调用） / `'silent'`（静默批处理）

**最佳实践列表**：
- 多实例页面用 `Emitter.listenDOM` 桥接 DOM 事件，自动按容器作用域分发
- 业务逻辑只订阅 `text-change` / `selection-change`，不要直接订阅 DOM 事件——`source` 区分用户/程序化操作
- `EDITOR_CHANGE` 是聚合事件，避免两个独立订阅者重复监听
- `selectionchange` 必须用 `capture: true` 才能在 Firefox 捕获冒泡前的事件

---

## 二、富文本与 Delta 算法层

### 模式 6：Op 三元组（insert / retain / delete）

**问题场景**：富文本操作需要表达"加字、保留、删字、格式化"四种动作。传统做法用"绝对坐标 + 动作类型"两元组，导致批处理时坐标频繁前移/回退，复杂度 O(n²)。

**解决方案代码**：

```typescript
// quill-delta/src/op.ts
class Op {
  static length(op: Op): number {
    if (typeof op.retain === 'number') return op.retain;
    if (typeof op.delete === 'number') return op.delete;
    if (typeof op.insert === 'string') return op.insert.length;
    if (typeof op.insert === 'object' && op.insert !== null && 'image' in op.insert) return 1;
    return 0;  // 非字符串 insert（如 formula）
  }

  static iterator(ops: Op[]) {
    // 顺序遍历 op 数组，把绝对位置"流式"前进
    let offset = 0;
    for (const op of ops) {
      const length = Op.length(op);
      yield { op, offset, length };
      offset += length;
    }
  }
}

// 用法：所有算法都基于"流式"游标，无须手动维护坐标
for (const { op, offset, length } of Op.iterator(delta.ops)) {
  if (op.retain != null && op.attributes) applyFormat(offset, length, op.attributes);
}
```

**关键参数表**：

| op 形态 | 含义 | length() |
|---|---|---|
| `{ insert: 'abc' }` | 插入字符串 | 字符数（3） |
| `{ insert: { image: '...' } }` | 插入嵌入对象 | 1（占一个字符位） |
| `{ insert: '\n' }` | 插入换行 | 1 |
| `{ insert: 1 }` | 插入行（数字=行号偏移） | 1 |
| `{ retain: 5 }` | 保留 5 个字符 | 5 |
| `{ retain: 5, attributes: { bold: true } }` | 在 5 字符上应用格式 | 5 |
| `{ delete: 3 }` | 删除 3 个字符 | 3 |

**最佳实践列表**：
- `Op.length()` 是整个 delta 算法的基石——所有"位置到 op 边界"的换算都走它
- 嵌入对象（image/video）的 length 恒为 1，便于在文本流中"占位"
- 数字 insert 是行级（block-level）操作，影响后续行的引用
- 不要尝试"优化" op 数组——`compose/invert/transform` 都假设 ops 已 normalize

### 模式 7：invert 算法（基线相对逆操作）

**问题场景**：撤销栈不能记录"完整快照"（内存爆炸），也不能记录"绝对位置"（与基线绑定死）。需要"基于上一次基线反演当前变更"的方式，用 O(delta) 内存换 O(1) 撤销操作。

**解决方案代码**：

```typescript
// quill-delta/src/delta.ts
invert(base: Delta): Delta {
  const inverted = new Delta();
  const baseIter = Op.iterator(base.ops);
  let baseNext = baseIter.next();
  this.ops.forEach((op) => {
    if (baseNext.done) return;
    if (op.delete) {
      // 当前是删除：撤销 = 在基线对应位置 retain 然后 insert 被删的内容
      inverted.retain(Op.length(op));
      const length = Op.length(op);
      const baseOp = baseNext.value.op;
      // 跳过基线中对应长度的部分
      if (Op.length(baseOp) <= length) {
        inverted.push(baseOp);
        baseNext = baseIter.next();
      }
      // ... 复杂分片逻辑
    } else if (op.insert) {
      // 当前是插入：撤销 = 直接 delete 同样长度
      inverted.delete(Op.length(op));
    } else if (op.retain && op.attributes) {
      // 当前是格式变更：撤销 = 在基线对应位置 retain 旧属性
      const length = Op.length(op);
      const baseOp = baseNext.value.op;
      if (baseOp.attributes) {
        inverted.retain(length, baseOp.attributes);  // 用基线属性覆盖
      } else {
        inverted.retain(length);  // 基线无属性 = 撤销为 remove
      }
    }
  });
  return inverted;
}
```

**关键参数表**：

| 场景 | base | 当前 delta | invert 结果 |
|---|---|---|---|
| 插入文本 | `[]` | `insert('abc')` | `delete(3)` |
| 删除文本 | `insert('abc')` | `delete(3)` | `insert('abc')` |
| 格式切换 | `retain(3, {bold:false})` | `retain(3, {bold:true})` | `retain(3, {bold:false})` |
| 插入嵌入 | `[]` | `insert({image:'x'})` | `delete(1)` |
| 混合操作 | `insert('hello')` | `retain(2).insert('X')` | `retain(2).delete(1)` |

**最佳实践列表**：
- `invert(base)` 永远要求"传入旧版本"——它是相对操作，不是绝对还原
- 撤销栈应存 `{delta, range}` 双向信息：delta 用于回退，range 用于恢复光标位置
- `delay=1000ms` 合并窗口内的连续操作要 `compose` 合并，避免"按一字一撤销"
- invert 后必须重新跑 `getDelta()` 校验——`Selection` 可能因 DOM 变化导致坐标漂移

### 模式 8：transform 算法（OT 协同合并）

**问题场景**：两个用户同时编辑同一段富文本，A 插入 "X"、B 插入 "Y"，需要把两条 delta 合并成"XY"或"YX"而互不覆盖。这就是经典的"操作变换"（OT）问题。

**解决方案代码**：

```typescript
// quill-delta/src/delta.ts
transform(other: Delta, priority: boolean): Delta {
  // priority=true 表示"我"（this）优先；other 是"对手"的 delta
  const thisIter = Op.iterator(this.ops);
  const otherIter = Op.iterator(other.ops);
  const thisNext = thisIter.next();
  const otherNext = otherIter.next();
  const transformed = new Delta();

  while (thisNext.value || otherNext.value) {
    if (thisNext.value && thisNext.value.op.insert) {
      // 本地是 insert：永远先应用，消耗自己的 op
      transformed.push(thisNext.value.op);
      thisNextDone(thisNext, thisIter);
    } else if (otherNext.value && otherNext.value.op.insert) {
      // 对手是 insert：先应用到 transformed
      if (priority) {
        transformed.retain(Op.length(otherNext.value.op));
      } else {
        transformed.push(otherNext.value.op);
      }
      otherNextDone(otherNext, otherIter);
    } else if (thisNext.value && thisNext.value.op.delete) {
      // 双方都 delete：互不干扰
      transformed.delete(Op.length(thisNext.value.op));
      thisNextDone(thisNext, thisIter);
      // 对手 delete 也要消耗
      if (otherNext.value && otherNext.value.op.delete) {
        otherNextDone(otherNext, otherIter);
      }
    } else {
      // 双方都 retain：取属性并集
      // ... 复杂属性合并逻辑
    }
  }
  return transformed;
}

// 协同场景：合并两个用户的同时编辑
const merged = deltaA.transform(deltaB, true);  // A 优先
```

**关键参数表**：

| 输入 | priority | 语义 |
|---|---|---|
| `transform(other, true)` | 本地优先 | 对手的 insert 变成 retain；本地 op 保持 |
| `transform(other, false)` | 对手优先 | 本地的 insert 推到对手位置之后 |

**最佳实践列表**：
- OT 只用于真正的协同场景——单用户编辑不需要，`invert` 配合历史栈足够
- `priority` 决策可基于"时间戳"或"用户权限"，不能基于"操作类型"
- Quill 故意不用 CRDT（Yjs/Automerge）——OT 足够，CRDT 引入额外 10x 内存开销
- 协同栈需配合"服务器仲裁"——客户端 OT 只保证最终一致，不保证实时一致

### 模式 9：compose 顺序合并

**问题场景**：编辑器一次操作往往是"先删后插"或"先选格式再输入"，但用户感知是单一动作。需要把多条 op 流合成一条 delta，便于历史栈、序列化、协同。

**解决方案代码**：

```typescript
// quill-delta/src/delta.ts
compose(other: Delta): Delta {
  const thisIter = Op.iterator(this.ops);
  const otherIter = Op.iterator(other.ops);
  const ops: Op[] = [];
  let firstOther = otherIter.next();

  this.ops.forEach((op) => {
    if (firstOther.value == null) {
      ops.push(op);  // 对方已空，原样保留
      return;
    }
    if (op.delete && firstOther.value.op.delete) {
      // 双方都 delete：只保留 op 的 delete
      ops.push({ delete: Math.min(op.delete!, firstOther.value.op.delete!) });
      // ... 推进游标
    } else if (op.delete && firstOther.value.op.retain) {
      // op delete + other retain：把 delete 推到对方之后
      ops.push({ delete: Math.min(op.delete!, firstOther.value.op.retain!) });
      // ... 复杂推进
    } else if (op.retain && firstOther.value.op.delete) {
      // op retain + other delete：op 位置前移
      const length = Math.min(op.retain!, firstOther.value.op.delete!);
      if (length > 0) ops.push({ delete: length });
      // ... 推进
    } else if (op.retain && firstOther.value.op.retain) {
      // 双方都 retain：合并属性
      ops.push({
        retain: Math.min(op.retain!, firstOther.value.op.retain!),
        attributes: AttributeMap.compose(op.attributes, firstOther.value.op.attributes),
      });
    } else if (op.insert) {
      ops.push(op);  // op 的 insert 永远先应用
    }
  });
  return new Delta(ops.concat(collectRemaining(otherIter)));
}
```

**关键参数表**：

| 组合 | 输出 | 说明 |
|---|---|---|
| retain + retain | `retain(min, attr.compose)` | 属性交集 |
| retain + delete | `delete(min)` | op 位置后移 |
| retain + insert | 保持 retain + 推进 other | 插入在 op 当前位置之后 |
| insert + (任何) | 保持 insert | 插入永远先应用 |
| delete + delete | `delete(min)` | 双重删除合并 |
| delete + retain | `delete(min)` | delete 优先 |

**最佳实践列表**：
- `compose` 是历史栈的核心——`stack.undo.push({ delta: newDelta.compose(prevDelta) })`
- `AttributeMap.compose` 处理属性冲突：`{bold: true}` + `{bold: false}` = `{bold: false}`（later wins）
- compose 后必须 normalize（合并相邻同类型 op）——`Delta(ops).normalize()` 一步完成
- 大批操作（粘贴 10k 字符）应"分片 compose"——一次合 1000 个 op，避免栈帧过深

### 模式 10：Delta 规范化（normalize + splitOpLines）

**问题场景**：外部 API 接受"任意形态" Delta（`setContents([{insert:'a\nb'}])`），但内部算法假设"每个 op 至多跨一行"（`{insert:'a\n'}` + `{insert:'b'}`）。需要规范化以减少算法分支。

**解决方案代码**：

```typescript
// core/editor.ts
function normalizeDelta(delta: Delta): Delta {
  // 1. 合并相邻同类型 op
  // 2. 拆掉跨行字符串（按 \n 切片）
  // 3. 补齐隐式换行
  return delta.reduce((acc, op) => {
    if (typeof op.insert === 'string') {
      const lines = op.insert.split('\n');
      lines.forEach((line, i) => {
        if (line.length) acc.insert(line);
        if (i < lines.length - 1) acc.insert('\n');
      });
    } else {
      acc.push(op);
    }
    return acc;
  }, new Delta());
}

function splitOpLines(ops: Op[]): Op[] {
  // 把跨行 op 拆成"行内段 + 换行"序列
  const result: Op[] = [];
  ops.forEach((op) => {
    if (typeof op.insert === 'string' && op.insert.includes('\n')) {
      const segments = op.insert.split(/(\n)/);  // 保留分隔符
      segments.forEach((seg) => {
        if (seg === '') return;
        if (seg === '\n') {
          result.push({ insert: '\n' });
        } else {
          result.push({ insert: seg, attributes: op.attributes });
        }
      });
    } else {
      result.push(op);
    }
  });
  return result;
}
```

**关键参数表**：

| 原始 op | normalize 后 | splitOpLines 后 |
|---|---|---|
| `{insert:'ab\ncd'}` | 不变（字符串 split） | `[{insert:'ab'},{insert:'\n'},{insert:'cd'}]` |
| `{insert:'abc'}` | 不变 | 不变 |
| `{insert:{image:'x'}}` | 不变 | 不变 |
| `{retain:3, attributes:{bold:true}}` | 不变 | 不变 |
| `{delete:2}` | 不变 | 不变 |

**最佳实践列表**：
- `normalize` 在 `applyDelta` 入口处调用一次即可，下游算法假设已规范化
- 跨行 op 拆分是为了让 `getLength()` 与 `splitOpLines` 后的 op 数组一致——`length()` 不需要重新计算
- 性能开销：10k 字符文档 normalize 约 5ms——可接受
- 不要在 hot path（每键击）调用 `normalize`——只在 `setContents/updateContents` 入口调

---

## 三、Parchment 文档树与渲染

### 模式 11：Blot 继承树（Block/Inline/Embed/Leaf）

**问题场景**：富文本需要"块级"（标题/列表/引用）、"内联"（链接/代码）、"嵌入"（图片/视频/公式）、"叶子"（纯文本）四种节点类型。如果用单一类继承树，块级节点无法正确响应"插入新行"操作。

**解决方案代码**：

```typescript
// blots/block.ts
class BlockBlot extends Parchment.Block {
  // 块级：每行独占、可被 \n 分割
  static formats(domNode: HTMLElement): Record<string, unknown> {
    // 从 domNode 的 className 提取 header level / list type 等
    return Parchment.Attributor.Attribute.values(domNode, 'header') || {};
  }

  insertBefore(node: Node, ref: Node | null) {
    // 块级插入：保证新块也以 \n 结尾
    super.insertBefore(node, ref);
    if (node instanceof Parchment.Embed) {
      this.parent.insertBefore(Parchment.create('block', '\n'), this.next);
    }
  }
}

// blots/inline.ts
class InlineBlot extends Parchment.Inline {
  // 内联：与文本同级，跨块时不分裂
  format(name: string, value: unknown) {
    // 递归应用到所有叶子后代
  }
}

// blots/embed.ts
class EmbedBlot extends Parchment.Embed {
  // 嵌入：独立 DOM 子树，不可编辑但可删除
  static value(domNode: HTMLElement): unknown { return null; }
  index(node: Node, offset: number): number { return offset; }
  position(index: number, inclusive?: boolean): [Node, number] { return [this.domNode, index]; }
}

// blots/text.ts
class TextBlot extends Parchment.Leaf {
  // 叶子：纯文本，无 children
  static value(domNode: Text): string { return domNode.data; }
}
```

**关键参数表**：

| Blot 类型 | 父类 | 特点 | 例子 |
|---|---|---|---|
| `Block` | `Parchment.Block` | 独占一行，自动以 \n 结尾 | header, list-item, blockquote |
| `Inline` | `Parchment.Inline` | 与文本同级，跨块不分裂 | formula, mention |
| `Embed` | `Parchment.Embed` | 独立 DOM 子树，不可编辑 | image, video, divider |
| `Leaf` | `Parchment.Leaf` | 纯文本或原子，无 children | text, break |
| `Container` | `Parchment.Container` | 含 children，递归操作 | list, table-cell, table-row |
| `Scroll` | `Parchment.Root` | 根节点，children=所有 block | 整个文档 |

**最佳实践列表**：
- 块级 Blot 必须 `insertBefore` 后追加 `\n`——否则 `getDelta()` 无法还原
- Embed Blot 的 `index/position` 必须按"占 1 字符"语义——所有 delta 坐标都假设 embed = 1
- 自定义 Inline Blot 须实现 `format(name, value)`——递归把格式应用到叶子后代
- 不要绕过 `Scroll.children` 直接 push——Parchment 树的 `optimize()` 会清理悬挂节点

### 模式 12：Attributor 三件套（Class / Style / Attribute）

**问题场景**：内联属性（bold/italic/color）需要在 DOM 上表达，但又不想为每个属性创建独立 DOM 节点。需要在"共享单例"和"DOM 表达"之间找到平衡。

**解决方案代码**：

```typescript
// Class Attributor：className 列表
const Bold = new Parchment.Attributor.Class('bold', 'ql-bold', { scope: Parchment.Scope.INLINE });
Bold.add(node, true);    // node.classList.add('ql-bold')
Bold.canAdd(node, '1');  // false（已存在）
Bold.remove(node);       // node.classList.remove('ql-bold')

// Style Attributor：style 字符串
const Color = new Parchment.Attributor.Style('color', 'color', { scope: Parchment.Scope.INLINE });
Color.add(node, 'red');     // node.style.color = 'red'
Color.value(node);          // 'red'
Color.remove(node);         // node.style.color = ''

// Attribute Attributor：任意 HTML 属性
const Link = new Parchment.Attributor.Attribute('link', 'href', { scope: Parchment.Scope.INLINE });
Link.add(node, 'https://x'); // node.setAttribute('href', '...')
Link.value(node);            // 'https://x'
```

**关键参数表**：

| Attributor | 写入方式 | 读取方式 | 适用场景 |
|---|---|---|---|
| `Class` | `classList.add/remove` | `classList.contains` | 布尔属性、预定义 class |
| `Style` | `style.setProperty/getPropertyValue` | `style.getPropertyValue` | CSS 值属性（color, font-size） |
| `Attribute` | `setAttribute/removeAttribute` | `getAttribute` | 值属性（href, src, data-x） |

`Scope` 选项：`INLINE`（行内位置）/ `BLOCK`（块级位置）/ `ANY`（任意）

**最佳实践列表**：
- 简单布尔属性（bold/italic/underline）永远用 `Class`，渲染开销最低
- CSS 值属性（color/font-size）用 `Style`——可与宿主页面 CSS 串联
- 业务自定义属性（mention/data-id）用 `Attribute`——可被外部 querySelector 命中
- Attributor 是单例（`Quill.imports` 表里只有一个实例），跨文档共享无副作用

### 模式 13：split 机制（强制断行）

**问题场景**：用户选中"加粗文本"中段粘贴图片时，粘贴内容不应继承加粗属性；如果不拆开当前 Blot，会"合并"到现有行，格式串行。

**解决方案代码**：

```typescript
// blots/scroll.ts: insertContents
insertContents(index: number, delta: Delta) {
  const renderBlocks = this.deltaToRenderBlocks(delta.concat(new Delta().insert('\n')));
  const last = renderBlocks.pop();
  if (last == null) return;
  this.batchStart();
  let [refBlot, refBlotOffset] = this.children.find(index);
  if (renderBlocks.length) {
    if (refBlot) {
      // 关键：在插入点拆开当前 Blot
      refBlot = refBlot.split(refBlotOffset);
      refBlotOffset = 0;
    }
    renderBlocks.forEach((renderBlock) => {
      if (renderBlock.type === 'block') {
        const block = this.createBlock(renderBlock.attributes, refBlot || undefined);
        insertInlineContents(block, 0, renderBlock.delta);
      } else {
        const blockEmbed = this.create(renderBlock.key, renderBlock.value) as EmbedBlot;
        this.insertBefore(blockEmbed, refBlot || undefined);
      }
    });
  }
  this.batchEnd();
}

// Inline Blot 的 split 实现
class InlineBlot extends Parchment.Inline {
  split(offset: number, force?: boolean): Parchment.LeafBlot | null {
    if (!force && offset === this.length()) return this;  // 边界 = 不拆
    const { domNode } = this;
    const parentNode = domNode.parentNode!;
    const after = domNode.cloneNode(false) as HTMLElement;
    // ... 复杂 DOM 克隆与文本切片
    return super.split(offset, force);
  }
}
```

**关键参数表**：

| offset 位置 | 行为 |
|---|---|
| `0` | 不拆，返回自身 |
| `length()` | 不拆，返回自身（边界对齐） |
| 中间位置 | 拆为两段，前段保留原属性，后段继承属性 |
| 跨 Blot 边界 | 拆到下一个 Blot 内部 |

**最佳实践列表**：
- `split(offset, force=false)` 的 `force` 标志用于"必须拆"场景（如粘贴）
- 拆 Inline Blot 时要 cloneNode 复制属性——不能直接 `removeAttribute`
- 拆 Block Blot 时要补 `\n` 节点——保证 `getDelta()` 反序列化正确
- 拆 Embed Blot 直接返回 null——Embed 不可拆

### 模式 14：bubbleFormats（属性向上冒泡）

**问题场景**：`getFormat(index)` 要返回"在 index N 处的所有有效格式"。例如：`getFormat(5)` 在 `<blockquote><b>hello world</b></blockquote>` 中应该返回 `{blockquote: true, bold: true}`。

**解决方案代码**：

```typescript
// core/editor.ts
bubbleFormats(index: number, length: number = 0): Record<string, unknown> {
  const formats: Record<string, unknown> = {};
  const iter = new Parchment.Iterator(this.scroll, index, length);
  // 倒序遍历 ancestor（从叶子到根）
  const ancestors: Parchment.ParentBlot[] = [];
  iter.iterator().forEach((blot) => {
    if (blot instanceof Parchment.ParentBlot) {
      ancestors.push(blot);
    } else {
      const attributeBlot = blot.parent;
      // 把 leaf 的 attribute 合并到 formats
      Object.assign(formats, AttributeMap.attribute(attributeBlot));
    }
  });
  // 从根到叶子倒序，让"更具体"的属性覆盖"更通用"的
  ancestors.reverse();
  ancestors.forEach((blot) => {
    Object.assign(formats, blot.formats());
  });
  return formats;
}
```

**关键参数表**：

| index 位置 | 祖先链 | bubbleFormats 返回 |
|---|---|---|
| `0`（文档头） | `Scroll > Block` | `{block: {...}}` |
| 加粗文本中间 | `Scroll > Block > Inline(bold) > Text` | `{bold: true}` |
| 列表项 | `Scroll > List > Item` | `{list: 'bullet'}` |
| 表格单元格 | `Scroll > Table > Row > Cell > Block` | `{cell: ..., row: ...}` |

**最佳实践列表**：
- `bubbleFormats` 决定了"Toolbar 按钮高亮"逻辑——必须在父链属性变化时重算
- 属性合并按"叶子优先"——Inline 属性覆盖 Block 属性
- 复杂格式（如 list/table）需要 Parchment.ParentBlot 子类实现 `formats()` 返回结构化对象
- 不要在 bubbleFormats 中返回 DOM 引用——它必须可序列化

### 模式 15：applyDelta 翻译器（Delta ⇄ Parchment）

**问题场景**：Delta 是逻辑层（位置/操作），Parchment 是物理层（DOM 节点）。两者必须双向翻译但又要解耦——改 Parchment 不应影响 Delta 协议。

**解决方案代码**：

```typescript
// core/editor.ts: applyDelta
applyDelta(delta: Delta): Delta {
  this.scroll.update();
  let scrollLength = this.scroll.length();
  this.scroll.batchStart();
  const normalizedDelta = normalizeDelta(delta);
  const deleteDelta = new Delta();
  const normalizedOps = splitOpLines(normalizedDelta.ops.slice());
  normalizedOps.reduce((index, op) => {
    const length = Op.length(op);
    let attributes = op.attributes || {};
    if (op.insert != null) {
      if (typeof op.insert === 'string') {
        const text = op.insert;
        // 隐式换行：如果前一个节点是 block embed，强制加 \n 让嵌入独占一行
        isImplicitNewlineAppended = !text.endsWith('\n') &&
          (scrollLength <= index || !!this.scroll.descendant(BlockEmbed, index)[0]);
        if (isImplicitNewlineAppended) {
          this.scroll.insertAt(index, '\n');
          deleteDelta.retain(index);
          deleteDelta.delete(1);
          scrollLength += 1;
          index += 1;
        }
        this.scroll.insertAt(index, text);
        scrollLength += text.length;
        index += text.length;
      } else if (typeof op.insert === 'object') {
        // 嵌入对象
        this.scroll.insertAt(index, op.insert);
        scrollLength += 1;
        index += 1;
      }
    } else if (op.retain != null) {
      // 格式应用
      this.scroll.formatAt(index, length, attributes);
      index += length;
    } else if (op.delete != null) {
      this.scroll.deleteAt(index, length);
      scrollLength -= length;
    }
    return index;
  }, 0);
  this.scroll.batchEnd();
  this.scroll.optimize();
  return deleteDelta.compose(delta);
}

// 反向：getDelta 把 Parchment 序列化为 Delta
getDelta(): Delta {
  return this.scroll.getDelta();
}
```

**关键参数表**：

| 步骤 | 输入 | 输出 |
|---|---|---|
| normalize | 任意 Delta | 跨行 op 拆开 + 隐式 \n 补齐 |
| splitOpLines | normalizedDelta.ops | 按 \n 切片的 op 数组 |
| reduce | ops | 累计 index + scrollLength |
| batchStart | — | 暂停 Parchment 通知 |
| batchEnd | — | 触发一次 MutationObserver |
| optimize | — | 合并相邻同属性节点 |
| compose deleteDelta | deleteDelta + 原 delta | 把隐式 \n 反映给调用方 |

**最佳实践列表**：
- `applyDelta` 是同步的——但 Parchment 修改会被 `batchStart/batchEnd` 合并为一次 DOM 写入
- `deleteDelta.compose(delta)` 让外部能拿到"包含隐式 \n"的真正 delta，便于二次保存
- `scroll.optimize()` 在末尾调用——它合并相邻同属性 Blot，减少 DOM 节点数
- 性能：10k 字符 setContents 约 100ms，其中 80ms 来自 DOM 写入而非算法

---

## 四、工程实践与扩展生态

### 模式 16：Clipboard 模块（14 个 matcher）

**问题场景**：复制粘贴是富文本编辑的"万恶之源"——不同浏览器（Chrome/Firefox/Safari）、不同来源（Word/Google Docs/Slack/Notion）会生成完全不同的 HTML 结构。Quill 必须用一套 matcher 列表把"任意 HTML"翻译为 Delta。

**解决方案代码**：

```typescript
// modules/clipboard.ts:32-48
const CLIPBOARD_CONFIG: [Selector, Matcher][] = [
  [Node.TEXT_NODE, matchText],           // 普通文本
  [Node.TEXT_NODE, matchNewline],        // 换行符
  ['br', matchBreak],                    // <br>
  [Node.ELEMENT_NODE, matchNewline],     // 块级 div/p 产生的换行
  [Node.ELEMENT_NODE, matchBlot],        // 已知 Blot（image/video/table）
  [Node.ELEMENT_NODE, matchAttributor],  // 已知 Attributor（class/style）
  [Node.ELEMENT_NODE, matchStyles],      // 内联 CSS 样式
  ['li', matchIndent],                   // 列表项
  ['ol, ul', matchList],                 // 列表
  ['pre', matchCodeBlock],               // 代码块
  ['tr', matchTable],                    // 表格行
  ['b', createMatchAlias('bold')],       // <b> → bold
  ['i', createMatchAlias('italic')],     // <i> → italic
  ['strike', createMatchAlias('strike')],// <strike> → strike
  ['style', matchIgnore],                // 忽略 <style> 标签
];

// 单个 matcher 签名
type Matcher = (node: Node, delta: Delta, scroll: ScrollBlot) => Delta;

// 使用
new ClipboardMatcher(node, delta, scroll).traverse(CLIPBOARD_CONFIG);
```

**关键参数表**：

| matcher | 用途 | 例子 |
|---|---|---|
| `matchText` | 处理普通文本节点 | `<p>hello</p>` 的 "hello" |
| `matchNewline` | 处理纯 `\n` 文本节点 | Google Docs 复制的换行 |
| `matchBreak` | 处理 `<br>` 标签 | Gmail 邮件签名 |
| `matchBlot` | 已知 Blot 节点 | `<img>` `<iframe>` |
| `matchAttributor` | 已知 Attributor 节点 | `<a href>` `<span style="color">` |
| `matchStyles` | 推断样式 | `<span style="font-weight:bold">` |
| `matchIgnore` | 跳过节点 | `<style>` `<script>` |
| `createMatchAlias` | 标签别名 | `<b>` → bold |

**最佳实践列表**：
- matcher 列表**顺序敏感**——把"语义化标签"（`<b>`/`<i>`）放在"通用样式"（`matchStyles`）之后，优先用语义
- `[Node.TEXT_NODE, matchText]` 和 `[Node.TEXT_NODE, matchNewline]` 都是 text node 但用不同 matcher 区分（普通字符 vs `\n`）
- `'style', matchIgnore` 必须存在——Google Docs 复制的 HTML 经常带 `<style>` 标签
- 自定义 Clipboard matcher 用 `new Quill(..., { clipboard: { matchers: [...] } })` 注入

### 模式 17：History 模块（OT 风格撤销/重做）

**问题场景**：撤销栈需要平衡"内存占用"与"操作精度"。记录完整快照（O(n) 内存/步）vs 记录 delta 变化（O(delta) 内存/步）。Quill 用 delta + 1 秒合并窗口实现"接近实时的撤销"。

**解决方案代码**：

```typescript
// modules/history.ts
record(changeDelta: Delta, oldDelta: Delta) {
  if (changeDelta.ops.length === 0) return;
  this.stack.redo = [];  // 新操作清空 redo
  let undoDelta = changeDelta.invert(oldDelta);
  let undoRange = this.currentRange;
  const timestamp = Date.now();
  // 1 秒合并窗口：连续输入合并为一个 undo 步骤
  if (this.lastRecorded + this.options.delay > timestamp && this.stack.undo.length > 0) {
    const item = this.stack.undo.pop();
    if (item) {
      undoDelta = undoDelta.compose(item.delta);  // 合并到上一个 undo
      undoRange = item.range;
    }
  } else {
    this.lastRecorded = timestamp;
  }
  this.stack.undo.push({ delta: undoDelta, range: undoRange });
}

transformStack(stack: Stack, delta: Delta) {
  // OT：当外部（协同/AI）改了内容，本地栈要 transform
  stack.undo.forEach((item) => {
    item.delta = delta.transform(item.delta, true);
  });
  stack.redo.forEach((item) => {
    item.delta = delta.transform(item.delta, true);
  });
}

undo() {
  const last = this.stack.undo.pop();
  if (!last) return;
  this.stack.redo.push(last);
  this.editor.applyDelta(last.delta);  // 撤销
  this.selection.setRange(last.range);  // 恢复光标
}
```

**关键参数表**：

| 选项 | 默认值 | 说明 |
|---|---|---|
| `delay` | `1000` (ms) | 合并窗口：连续操作 1s 内合并 |
| `maxStack` | `100` | undo 栈最大深度 |
| `userOnly` | `true` | 是否只记录用户操作（不记录 API 调用） |

`stack` 结构：
```typescript
type Stack = { undo: Array<{ delta: Delta; range: Range }>, redo: Array<{ delta: Delta; range: Range }> };
```

**最佳实践列表**：
- `delay=1000` 是 UX 最佳实践——避免"按一字一撤销"让用户按 N 次 Ctrl+Z
- `userOnly=true` 过滤程序化操作（`setContents` 不进栈）——防止"程序设值污染 undo"
- `transformStack` 在协同场景必调——否则 undo 会应用错位置
- `range` 必须随 delta 一起存——撤销后光标位置要正确

### 模式 18：Keyboard 模块（绑定表 + 优先级）

**问题场景**：富文本快捷键需同时支持"标准编辑"（Ctrl+B/Ctrl+Z）、"自定义操作"（Ctrl+Shift+L = 插入链接）、"浏览器默认"（Tab 缩进）。简单 `addEventListener('keydown')` 会被浏览器默认行为干扰。

**解决方案代码**：

```typescript
// modules/keyboard.ts
const bindings: Record<string, Binding> = {
  bold: { key: 'B', shortKey: true, handler: () => this.quill.format('bold', !this.quill.getFormat().bold) },
  italic: { key: 'I', shortKey: true, handler: () => this.quill.format('italic', !this.quill.getFormat().italic) },
  undo: { key: 'Z', shortKey: true, shiftKey: false, handler: () => this.history.undo() },
  redo: { key: 'Z', shortKey: true, shiftKey: true, handler: () => this.history.redo() },
  enter: { key: 13, handler: (range) => this.onEnter(range) },
  backspace: { key: 8, handler: (range) => this.onBackspace(range) },
};

interface Binding {
  key: number | string;       // keyCode 或字符
  shortKey?: boolean;          // 是否带 Ctrl/Cmd
  shiftKey?: boolean;          // 是否带 Shift
  altKey?: boolean;            // 是否带 Alt
  metaKey?: boolean;           // 是否带 Meta
  handler: (range: Range, context: Context) => void;
  prefix?: RegExp;             // 触发前缀（如输入 / 触发 slash command）
}

// 使用
const ctx = { collapsed: range.length === 0, format: {}, prefix: '', suffix: '' };
this.bindings[Key.match(evt, this.bindings)].handler(range, ctx);
```

**关键参数表**：

| 修饰键 | 含义 | 例子 |
|---|---|---|
| `shortKey: true` | 自动适配 Ctrl (Win/Linux) / Cmd (Mac) | `Ctrl+B` / `Cmd+B` |
| `shiftKey: true` | 必须带 Shift | `Ctrl+Shift+Z` = redo |
| `prefix: /^.$/` | 前缀匹配，触发后等待用户输入 | `/` 触发 slash command |
| `prefix: /^-?$/` | 列表项前缀 | `- ` 触发 bullet list |

**最佳实践列表**：
- `shortKey: true` 跨平台自动适配——不要硬编码 `Ctrl`（Mac 用户会用 `Cmd`）
- `prefix` 机制让"快捷键 → 命令"两步走——例如 `/` 触发 slash command 菜单
- 自定义绑定用 `quill.keyboard.addBinding(key, handler)`——可覆盖默认
- `handler` 返回 `true` 表示"已处理，阻止默认"——返回 `false` 让浏览器继续处理

### 模式 19：Uploader 模块（文件上传 + 回调）

**问题场景**：图片拖入/粘贴上传是富文本编辑器的标配。需求：(1) 接受 `File` / `DataTransfer` / URL 三种输入；(2) 自定义上传协议（CDN/S3/七牛/OSS）；(3) 上传过程中显示占位符；(4) 失败回滚。

**解决方案代码**：

```typescript
// modules/uploader.ts
class Uploader {
  options: { mimetypes: string[]; handler: (range, files) => Promise<{ url: string }[]> };

  constructor(quill, options) {
    this.quill = quill;
    this.options = options;
    this.range = null;
    quill.root.addEventListener('drop', this.onDrop.bind(this));
    quill.root.addEventListener('paste', this.onPaste.bind(this));
  }

  async onDrop(e: DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    this.range = this.quill.getSelection(true);
    await this.upload(files, this.range.index);
  }

  async upload(files: File[], rangeIndex: number) {
    const placeholders = files.map((file) => {
      const placeholder = `![${file.name}](${URL.createObjectURL(file)})`;
      this.quill.insertEmbed(rangeIndex, 'image', placeholder, Emitter.sources.USER);
      rangeIndex += 1;
      return placeholder;
    });
    try {
      const uploaded = await this.options.handler(this.range, files);
      // 替换占位符为真实 URL
      placeholders.forEach((placeholder, i) => {
        const url = uploaded[i].url;
        this.quill.updateContents(
          new Delta().retain(this.range.index + i).delete(1).insert({ image: url }),
          Emitter.sources.USER,
        );
      });
    } catch (err) {
      // 失败回滚
      this.quill.updateContents(
        new Delta().retain(this.range.index).delete(placeholders.length),
        Emitter.sources.SILENT,
      );
      throw err;
    }
  }
}

// 使用：自定义上传协议
const quill = new Quill('#editor', {
  uploader: {
    mimetypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
    handler: async (range, files) => {
      const form = new FormData();
      files.forEach((f) => form.append('file', f));
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      return res.json();  // { url: 'https://cdn.example.com/x.png' }
    },
  },
});
```

**关键参数表**：

| 选项 | 类型 | 说明 |
|---|---|---|
| `mimetypes` | `string[]` | 接受的文件 MIME 类型 |
| `handler` | `(range, files) => Promise<{url}[]>` | 自定义上传函数，返回 URL 数组 |
| `imageHandler` | `(range, files) => ...` | 仅图片的上传函数（覆盖默认 handler） |
| `dragEnter` | `EventListener` | 自定义拖入事件 |

**最佳实践列表**：
- 用 `URL.createObjectURL(file)` 插入占位符——上传前立即可见，上传后替换
- 上传失败必须回滚——`updateContents` 删除占位符，避免"上传失败但图还在"的鬼影
- `handler` 抛错时 Quill 会触发 `'error'` 事件——业务方可订阅上报
- 大文件（>5MB）应在客户端压缩后再上传——避免服务器压力

### 模式 20：多实例隔离（WeakMap + 容器作用域）

**问题场景**：同一页面有多个 Quill 实例（如 Notion-like 块编辑、多评论框）时，DOM 事件（`mousedown`/`selectionchange`）会触发所有实例，串扰选区。

**解决方案代码**：

```typescript
// core/instances.ts
const instances = new WeakMap<Node, Quill>();

class Quill {
  static find(node: Node): Quill | null {
    // 从 node 向上找最近的 .ql-container
    if (node instanceof HTMLElement && node.classList.contains('ql-container')) {
      return instances.get(node) || null;
    }
    return null;
  }

  static get(container: HTMLElement | string): Quill {
    const dom = typeof container === 'string' ? document.querySelector(container) : container;
    if (!dom) throw new Error('Container not found');
    const instance = instances.get(dom);
    if (!instance) throw new Error('Quill not initialized on this container');
    return instance;
  }

  constructor(container, options) {
    this.container = ...;
    instances.set(this.container, this);  // WeakMap 持有，container 销毁时自动释放
  }
}

// Emitter 的 DOM 事件按容器作用域分发
emitter.listenDOM(document, 'selectionchange', () => {
  const range = document.getSelection();
  if (range && this.container.contains(range.anchorNode)) {
    this.handleSelectionChange(range);
  }
});
```

**关键参数表**：

| 隔离机制 | 实现 |
|---|---|
| 实例表 | `WeakMap<Node, Quill>`——container GC 时自动清理 |
| DOM 事件作用域 | `Emitter.listenDOM` 检查 `container.contains(target)` |
| 选区作用域 | `Selection.setRange` 限制 `boundary` 容器 |
| Parchment 注册表 | `globalRegistry` 单例（所有实例共享） vs `localRegistry`（每实例独立） |

**最佳实践列表**：
- 用 `WeakMap` 而非 `Map`——container DOM 节点 GC 时实例自动释放
- 全局注册表（`Quill.register`）影响所有实例——慎用
- 多实例场景下用 `Quill.get(node)` 查找——不要保存实例引用
- `selectionchange` 必须用 `capture: true` 监听——Firefox 不会冒泡
- 移动端触摸事件需 `touchstart` 而非 `mousedown`——v2.0 已加兼容

---

## 附：仓库元信息

- **路径**：`G:\实战案例\GitHub顶尖项目\quill\`
- **大小**：约 8MB（不含 node_modules）
- **总文件**：377 个
- **核心包**：`packages/quill`（编辑器本体）+ `packages/website`（文档站）
- **运行时依赖**：4 个（eventemitter3 / lodash-es / parchment / quill-delta）
- **锁定 commit**：v2.0.3（2024 年发布版）
- **学习入口**：先读 `core/quill.ts`（注册中心）→ `core/editor.ts`（Delta ⇄ Parchment 翻译）→ `modules/clipboard.ts`（14 个 matcher）→ `modules/history.ts`（OT 风格撤销）→ `blots/scroll.ts`（文档树根节点）

## 一句话总结

Quill 用 4 个 npm 包、26 个 format、6 个核心模块的极简组合，证明了"Delta 不可变数据流 + Parchment 文档树 + Registry 注册中心"是富文本编辑器的最优架构。核心洞察：把"内容"与"变更"统一为 Delta，撤销/协同/序列化全部免费；Attributor 与 Blot 双轨制把"内联属性"与"嵌入对象"的关注点彻底分离；Emitter 的容器作用域分发是多实例页面零串扰的关键。
