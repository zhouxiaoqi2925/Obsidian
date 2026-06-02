# core - Vue 3 核心仓库：响应式图 + 渲染器 + 编译器 + SSR 的 13 包 monorepo

**GitHub**: vuejs/core
**Star**: 47k+
**语言**: TypeScript
**主题**: frontend-framework/响应式/编译器/虚拟DOM/SSR
**适用场景**: Vue 3 源码研究、响应式原理、模板编译、跨端框架、组件库底层

## 第一段：基础范式

### 模式 1：13 包 monorepo + pnpm workspace

**问题场景**：Vue 3 仓库同时管"编译器 + 运行时 + 响应式 + SSR"——单一 package.json 难独立发布 + 难树摇。

**解决方案**：用 pnpm workspace + 13 子包——`reactivity` / `runtime-core` / `runtime-dom` / `compiler-core` / `compiler-dom` / `compiler-sfc` / `server-renderer` / `shared` / `vue`（运行时+编译器合集）。**每个子包可独立发布、树摇**。
```
packages/
├── reactivity/         # 响应式
├── runtime-core/       # 虚拟渲染器
├── runtime-dom/        # 浏览器适配
├── runtime-test/       # 测试适配
├── server-renderer/    # SSR
├── compiler-core/      # 平台无关编译
├── compiler-dom/       # 浏览器编译
├── compiler-sfc/       # .vue 文件
├── compiler-ssr/       # SSR 编译
├── shared/             # 工具与常量
├── vue/                # 运行时+编译器合集
├── vue-compat/         # v2 兼容
└── size-format/        # 注水目标
```

**关键参数**：
- pnpm workspace
- 13 子包独立发布
- 树摇友好
- rollup 打产物
- size-report 监控

**最佳实践**：大仓库用 monorepo + workspace——独立发布、树摇；13 子包按"职责"分——编译/运行/响应式/SSR；`shared` 抽公共代码——避免循环依赖；`runtime-test` 单独——测试专用；`vue` 聚合——一键安装。

---

### 模式 2：响应式图 Dep / Link / Subscriber 双向链表

**问题场景**：Vue 2 用 `Object.defineProperty` 拦截 getter/setter——数组下标变化 / 新增属性无法拦截；Vue 3 改用 Proxy 还要"自动收集依赖 + 精准触发"。

**解决方案**：用 `Dep / Link / Subscriber` 双向链表——`Dep` 是键（每个对象属性一个），`Subscriber` 是消费者（`effect` / `computed`），`Link` 是双向链表节点。`track()` 注册 + `trigger()` 触发 O(1)。
```ts
// packages/reactivity/src/dep.ts
export class Dep {
  subs: Link | undefined = undefined;
  track(): Link {
    if (!activeLink || activeLink.dep !== this) {
      activeLink = new Link(this, activeLink, activeSub)
    }
    return activeLink
  }
  trigger(): void {
    let link = this.subs
    while (link) {
      link.sub.notify()
      link = link.nextDep
    }
  }
}
```

**关键参数**：
- `Dep` 键
- `Subscriber` 消费者
- `Link` 双向链表
- `track()` 注册 O(1)
- `trigger()` 触发 O(订阅数)

**最佳实践**：响应式用图结构（Dep-Subscriber-Linked）——O(1) track / O(N) trigger；`Link` 双向链表——避免 GC；Proxy + Reflect 替代 defineProperty——覆盖数组/新增属性；`WeakMap` 存 target-key-Dep——避免内存泄漏；图比数组灵活。

---

### 模式 3：PatchFlag 位掩码标注 VNode 动态性

**问题场景**：模板 `<div :class="cls">{{ text }}</div>` 编译出 VNode，但 diff 时如何知道"哪些 prop 是动态的"——盲目 diff 性能差。

**解决方案**：用 `PatchFlag` 位掩码——编译器扫描模板标记动态节点 + 动态属性。渲染器 diff 看 flag 只 patch 动态字段。
```ts
// packages/shared/src/patchFlags.ts
export const enum PatchFlags {
  TEXT = 1 << 0,        // 1 动态文本
  CLASS = 1 << 1,       // 2 动态 class
  STYLE = 1 << 2,       // 4 动态 style
  PROPS = 1 << 3,       // 8 动态 props
  FULL_PROPS = 1 << 4,  // 16 full props
  NEED_HYDRATION = 1 << 5, // 32 SSR hydration
  // ...
}
```

**关键参数**：
- 位掩码 PatchFlags
- 编译期标注
- 运行期只 patch 动态字段
- diff 从 O(n) 退化 O(d)（d 动态节点数）
- block tree 收集

**最佳实践**：VNode 编译期打 PatchFlag——运行期只 patch 动态字段；位掩码——多 flag 组合；block tree 收集动态节点——diff 性能提升 5-10x；SSR hydration 标志——区分客户端/服务端；编译优化 = 性能优化的主战场。

---

### 模式 4：block tree + dynamicChildren 动态块追踪

**问题场景**：模板有 1000 个静态节点 + 10 个动态节点——传统 diff 全部遍历 O(n)=1010。

**解决方案**：用 `block tree` + `dynamicChildren` 数组——编译期收集所有动态节点到 `block.dynamicChildren`，diff 时只比对该数组。**O(1010) 退化 O(10)**。
```ts
// 编译产物
{
  type: 'div',
  children: [...1000 个静态节点],
  dynamicChildren: [
    { type: 'span', children: text, patchFlag: TEXT },
    // ... 10 个动态节点
  ]
}
```

**关键参数**：
- `block` 块
- `dynamicChildren` 数组
- 编译期收集
- 运行期 O(d) diff
- 嵌套 block 树

**最佳实践**：大模板用 block tree——diff 性能提升 5-10x；`dynamicChildren` 数组——单一来源；嵌套 block——子 block 也独立收集；`v-if` / `v-for` 创建新 block——边界管理；编译器 = 性能优化主战场。

---

### 模式 5：模板编译 4 阶段（parse / transform / generate / emit）

**问题场景**：模板字符串 → render 函数——单遍扫描难处理嵌套 + 表达式 + 指令。

**解决方案**：4 阶段流水线——`parse` 模板 → AST / `transform` 遍历 AST（transformer 链）/ `generate` AST → render 函数代码字符串 / `emit` 拼装 module。**`transform` 是开放扩展点**。
```
模板:  <div>{{ msg }}</div>
  ↓ parse
AST:   { type: 'root', children: [{ type: 'element', tag: 'div', ... }] }
  ↓ transform（v-if / v-for / 表达式）
AST:   { type: 'root', children: [{ ..., children: [{ type: 'interpolation', content: { type: 'expression', content: 'msg' }}]}] }
  ↓ generate
code:  "const _hoisted_1 = ['div']\nexport function render(_ctx) {...}"
```

**关键参数**：
- 4 阶段
- AST 中间表示
- transform 链可扩展
- codegen 输出字符串
- emit 拼装 module

**最佳实践**：DSL 编译用 4 阶段——关注点分离；`transform` 链式扩展——插件化关键；codegen 输出字符串——`new Function()` 拼装；AST 比 token 流语义丰富；前端编译器范式——Babel/SWC 同思路。

---

## 第二段：扩展范式

### 模式 6：render 函数 编译器产物而非手写

**问题场景**：手写 render 函数（如 React JSX）需要 babel-plugin 编译；Vue 模板编译是否一致？

**解决方案**：编译器把模板 → `render(ctx) { return h('div', ctx.msg) }` 函数体字符串——`new Function(...)` 拼装 module。**模板 = render 的语法糖**。
```ts
// 模板: <div>{{ msg }}</div>
// 编译产物:
function render(_ctx, _cache) {
  return _openBlock(), _createElementBlock("div", null, _toDisplayString(_ctx.msg), 1)
}
```

**关键参数**：
- `_openBlock()` 打开 block
- `_createElementBlock` 创建
- `_toDisplayString` 文本
- 数字 1 = PatchFlag.TEXT
- new Function 拼装

**最佳实践**：模板是 render 的语法糖——编译产物统一；`new Function()` 拼装——比 eval 安全；`_hoisted` 提取静态节点——避免重复创建；`_cache` 缓存——v-once / v-memo 优化；编译器比手写快 2-3x。

---

### 模式 7：runtime-core 平台无关 + runtime-dom 浏览器适配

**问题场景**：Vue 3 要支持"浏览器 DOM + 小程序 Canvas + Native iOS/Android"——单 runtime 难适配。

**解决方案**：`runtime-core` 平台无关——管理 VNode / diff / patch / lifecycle；`runtime-dom` 浏览器适配——`createApp` / `mount` / DOM ops。**新增平台只需实现 `runtime-xxx` 包**。
```
runtime-core
  ├── Custom Renderer API
  ├── VNode / diff / patch
  └── lifecycle
       ↓
runtime-dom（浏览器）
runtime-native（移动端）
runtime-canvas（小程序）
```

**关键参数**：
- runtime-core 平台无关
- Custom Renderer API
- runtime-dom 浏览器
- VNode → DOM 节点映射
- 平台特性下沉

**最佳实践**：跨端框架用"平台无关 core + 平台适配层"——runtime-core 是核心；Custom Renderer API——可扩展；platform ops 抽接口——`nodeOps` + `patchProp`；新平台 1-2 周适配；`@vue/runtime-canvas` 实战。

---

### 模式 8：Custom Renderer API 让小程序 / 终端 / 嵌入式复用

**问题场景**：Vue 3 想跑在"非 DOM 环境"——Canvas / 小程序 / 终端 TUI。

**解决方案**：用 `createRenderer({ nodeOps, patchProp })` —— 传入 `nodeOps: { createElement, insert, remove, ... }` + `patchProp: (el, key, prev, next) => void`——VNode 自动适配任意树形结构。**@vue/runtime-canvas 实战**。
```ts
import { createRenderer } from '@vue/runtime-core'
const renderer = createRenderer({
  nodeOps: {
    createElement: type => new CanvasElement(type),
    insert: (child, parent) => parent.insert(child),
    // ...
  },
  patchProp: (el, key, prev, next) => el.setProp(key, next),
})
```

**关键参数**：
- `createRenderer` 工厂
- `nodeOps` 节点操作
- `patchProp` 属性 patch
- @vue/runtime-canvas 实战
- 自定义平台

**最佳实践**：跨端框架用 Custom Renderer API——任何树形结构可适配；`nodeOps` + `patchProp` 抽接口——核心 ≤ 50 行；@vue/runtime-canvas / runtime-test 实战；新平台 1-2 周；Vue 3 跨端核心优势。

---

### 模式 9：composition API + `<script setup>` 编译期糖

**问题场景**：Options API（data/methods/computed）业务复杂时"按选项拆分"难组织。

**解决方案**：Composition API —— `setup() { const x = ref(0) }` 函数式组织。`<script setup>` 编译期糖——顶层变量自动 expose。**与 React Hooks 异曲同工**。
```vue
<script setup>
import { ref, computed } from 'vue'
const count = ref(0)
const double = computed(() => count.value * 2)
</script>
<template>
  <div>{{ count }} / {{ double }}</div>
</template>
```

**关键参数**：
- `setup()` 函数
- `ref / reactive / computed`
- `<script setup>` 顶层暴露
- 编译期糖
- 逻辑复用 `composables/`

**最佳实践**：复杂组件用 Composition API——按"逻辑"组织而非"选项"；`<script setup>` 编译期糖——省 `return {}`；`composables/` 目录复用——类似 React hooks；`ref` vs `reactive`——基础类型 ref，引用类型 reactive；与 React Hooks 异曲同工。

---

### 模式 10：v-model 编译为 `:modelValue + @update:modelValue`

**问题场景**：`<input v-model="text">` 双向绑定——表面糖衣，底层如何工作？

**解决方案**：`v-model` 编译为 `:modelValue="text" @update:modelValue="$event => text = $event"`。**子组件 `defineProps(['modelValue'])` + `defineEmits(['update:modelValue'])` 配套**。
```vue
<!-- 父组件 -->
<MyInput v-model="text" />
<!-- 编译产物 -->
<MyInput :modelValue="text" @update:modelValue="e => text = e" />

<!-- 子组件 -->
<script setup>
defineProps(['modelValue'])
defineEmits(['update:modelValue'])
</script>
<template>
  <input :value="modelValue" @input="e => $emit('update:modelValue', e.target.value)">
</template>
```

**关键参数**：
- `modelValue` 默认 prop
- `update:modelValue` 默认 event
- `defineProps` / `defineEmits` 编译宏
- 多 `v-model:xxx` 命名
- 自定义 v-model 修饰符

**最佳实践**：v-model 是语法糖——`prop + event` 对；`defineProps` 编译宏——无需 import；`v-model:foo` 多个双向绑定；`.lazy` / `.number` / `.trim` 修饰符；自定义组件 v-model 显式声明 prop+event；底层 = 单向数据流。

---

## 第三段：进阶范式

### 模式 11：编译器 transformer 链——`v-if` / `v-for` / `v-on` 各一个 transformer

**问题场景**：模板指令 20+ 种（`v-if` / `v-for` / `v-on` / `v-bind` / `v-slot` / `v-model` / `v-pre` / `v-once` / `v-memo` / `v-show`）——散落 if/else 难维护。

**解决方案**：用 `transformer` 链式架构——`vIf / vFor / vOn / vBind / vSlot / vModel` 各自一个 transformer，`transform` 阶段遍历 AST 链式调用。**新指令 = 新 transformer**。
```ts
// packages/compiler-core/src/transforms/vIf.ts
export const transformIf: NodeTransform = (node, ctx) => {
  if (node.type === NodeTypes.IF) {
    // 重写 AST
  }
}
```

**关键参数**：
- 20+ transformer
- `NodeTransform` 类型
- 链式调用
- enter/exit 钩子
- 新指令可扩展

**最佳实践**：DSL 编译用 transformer 链——新指令可扩展；`NodeTransform` 类型化——避免错位；enter/exit 钩子——处理嵌套；`vIf` 改 AST——而非 codegen 时拼字符串；transformer 顺序——父子关系处理；Vue 编译器 = 教科书式 AST 工程。

---

### 模式 12：静态提升 + `v-once` / `v-memo` 优化

**问题场景**：模板 `<div class="static">` 每次 render 重新创建 VNode——浪费。

**解决方案**：用"静态提升"——编译期识别纯静态节点提取到模块顶部 `_hoisted_1 = ['div', { class: 'static' }]` 一次创建。`v-once` 强制只创建一次；`v-memo([dep])` 依赖变更才重新创建。
```ts
// 编译产物
const _hoisted_1 = ['div', { class: 'static' }]
function render(_ctx) {
  return (_openBlock(), _createElementBlock('div', _hoisted_1))
}
```

**关键参数**：
- 静态提升 `_hoisted_*`
- `v-once` 强制单次
- `v-memo([dep])` 依赖记忆
- 模块级缓存
- 编译期识别

**最佳实践**：静态节点用 `_hoisted`——避免重复创建；`v-once` 永不更新；`v-memo([deps])` 列表优化；编译期优化 > 运行期优化；体积 + 性能双赢；`compiler-sfc` 编译 `<template>` 用此模式。

---

### 模式 13：SSR 客户端激活 + 序列化协议

**问题场景**：SSR 渲染 HTML 后，客户端 JS 加载后要"激活"（hydration）——VNode 如何匹配服务端 HTML？

**解决方案**：用 `hydrate` 而非 `mount`——客户端从已有 DOM 出发匹配 VNode。`vnode.el` 引用真实 DOM。**复用服务端 DOM，避免重建**。
```ts
// packages/runtime-core/src/hydration.ts
export function hydrate(vnode, container) {
  // 比对 VNode 与已有 DOM
  // 不创建只绑定
  // mismatch 时回退 client render
}
```

**关键参数**：
- `hydrate` 激活
- 复用服务端 DOM
- `vnode.el` 引用
- mismatch 回退
- `app.hydrate()` 入口

**最佳实践**：SSR 必走 hydration——避免重建 DOM；`vnode.el` 引用——避免查 DOM；mismatch 兜底 client render——安全网；Next.js/Nuxt 实战；`serverPrefetch` 数据预取——SSR 关键。

---

### 模式 14：defineProps / defineEmits 编译宏

**问题场景**：`<script setup>` 中如何声明 props / emits？手写 `props: ['msg']` 还是 TS 类型？

**解决方案**：用 `defineProps<T>()` / `defineEmits<T>()` 编译宏——TS 类型即 props 定义。**编译时提取为 `__props` / `__emits`**。
```ts
<script setup lang="ts">
defineProps<{ msg: string; count?: number }>()
const emit = defineEmits<{ (e: 'change', val: string): void }>()
</script>
```

**关键参数**：
- `defineProps<T>()` 类型宏
- `defineEmits<T>()` 事件宏
- 编译时提取
- 无运行时开销
- TS 类型即文档

**最佳实践**：`<script setup>` + `defineProps<T>()`——类型即文档；编译宏 vs 运行时 API——性能更好；`withDefaults` 给默认值；`defineExpose` 暴露给 ref；`<script setup>` 是 Vue 3 SFC 的未来。

---

### 模式 15：响应式 `ref` vs `reactive` 选择

**问题场景**：基础类型（`number` / `string`）如何响应式？引用类型用 ref 还是 reactive？

**解决方案**：`ref` 通用——`ref(0)` 包装为 `{ value: 0 }`；`reactive(obj)` Proxy 代理。**基础类型必 `ref`，引用类型皆可**。**自动 `unref` 在 template**。
```ts
const count = ref(0)            // { value: 0 }
const user = reactive({ name: 'foo' })  // Proxy
count.value++                   // 脚本
{{ count }}                     // template 自动 unwrap
```

**关键参数**：
- `ref(value)` 包装
- `reactive(obj)` Proxy
- `.value` 访问
- template 自动 unref
- 基础类型必 ref

**最佳实践**：基础类型必 `ref`——避免 reactive 包装报错；引用类型皆可——团队约定；template 自动 unwrap——DX 友好；`reactive` 解构会丢失响应性——用 `toRefs`；`shallowRef` / `shallowReactive` 大对象优化。

---

## 第四段：实战范式

### 模式 16：Vapor mode 编译产物 skip VDOM

**问题场景**：传统 Vue 3 用 VNode + diff——对小项目太大。Solid.js / Svelte 直接编译成命令式 DOM 更新。

**解决方案**：用 Vapor mode（Vue 3.4+）——编译产物是直接 `el.textContent = msg.value` 命令式 DOM 更新，**skip VDOM**。**与 React Server Components 同思路**。
```ts
// 传统编译
return h('div', msg)
// Vapor 编译
el.textContent = msg.value
```

**关键参数**：
- 编译产物命令式
- skip VDOM
- 性能 +30%
- 体积 -30%
- 与传统 mode 共存

**最佳实践**：小项目用 Vapor mode——性能 + 体积双赢；与传统 mode 共存——渐进迁移；与 React Server Components 同思路——编译期优化；Vue 3 持续进化；不是 Svelte 独有。

---

### 模式 17：defineModel + 多 v-model 命名

**问题场景**：`v-model` 默认 `modelValue`——多 v-model（`v-model:name`）如何写？

**解决方案**：Vue 3.4+ `defineModel('name')` 编译宏——`v-model:name` = `:name` + `@update:name`。**省去 props + emit 样板**。
```vue
<script setup>
const name = defineModel('name')
const age = defineModel('age')
</script>
<template>
  <input v-model="name">
  <input v-model="age">
</template>
```

**关键参数**：
- `defineModel('name')` 命名
- 编译期糖
- 多 v-model 友好
- 3.4+ 新特性
- 省 props + emit 样板

**最佳实践**：多 v-model 用 `defineModel`——省样板；`v-model:foo` 命名——清晰；3.4+ 新特性——现代化；`<script setup>` 完整生态；与传统 `v-model` 100% 兼容。

---

### 模式 18：性能优化 + `markRaw` / `shallowRef` / `v-memo`

**问题场景**：大对象（10 万行表格数据）用 `reactive` 会深 Proxy——性能差。

**解决方案**：用 `markRaw(obj)` 标记为非响应式；`shallowRef(obj)` 浅响应只 ref 本身；`v-memo([deps])` 列表项记忆。**避免不必要响应式**。
```ts
import { markRaw, shallowRef } from 'vue'
const tableData = shallowRef([...10000 rows])  // 不深 Proxy
const heavyComp = markRaw(HeavyComponent)      // 组件不响应
```

**关键参数**：
- `markRaw` 非响应
- `shallowRef` 浅响应
- `v-memo` 列表记忆
- 大对象优化
- 性能关键场景

**最佳实践**：大对象用 `shallowRef` / `markRaw`——避免深 Proxy；`v-memo([row.id])` 列表项缓存；`v-once` 永不更新节点；性能优化 = 知道哪里不需要响应式；与 Svelte / Solid 思路一致。

---

### 模式 19：测试套件 vitest + jsdom + e2e

**问题场景**：Vue 3 13 包 + 编译器 + 渲染器——测试金字塔如何组织？

**解决方案**：用 `vitest` 单测 + `@vue/runtime-test` 测试渲染器（无 DOM 依赖） + `e2e` puppeteer 跑真实浏览器。**`packages-private/dts-test` 跑 TS 类型测试**。
```
tests/
├── unit/         # vitest 单测
├── component/    # @vue/runtime-test
├── e2e/          # puppeteer
└── dts-test/     # TS 类型测试
```

**关键参数**：
- vitest 单测
- @vue/runtime-test 渲染器测
- puppeteer e2e
- dts-test 类型测
- 4 层测试金字塔

**最佳实践**：前端框架测试金字塔——unit + component + e2e + dts；`@vue/runtime-test` 渲染器无 DOM——快；vitest 兼容 jest API；e2e 必跑 puppeteer；dts-test 防止类型回归。

---

### 模式 20：size-report 监控产物 + `verify-treeshaking`

**问题场景**：Vue 3.4+ `Object.defineProperty` → Proxy 体积微增——如何监控？

**解决方案**：用 `scripts/size-report.js` 监控每个子包产物体积 + `verify-treeshaking.js` 验证 `@vue/xxx` 可被 tree-shake。**CI 卡门禁**。
```bash
# scripts/size-report.js
node scripts/size-report.js
# 输出: runtime-core: 16.5KB → 17.2KB (+0.7KB)  // 超过阈值 CI fail
```

**关键参数**：
- `size-report.js` 监控
- `verify-treeshaking` 验证
- CI 卡门禁
- 体积增量
- 性能预算

**最佳实践**：库作者必发 `size-report`——体积是核心竞争力；`verify-treeshaking` 验证可摇；CI 卡门禁——避免膨胀；与 bundlephobia 集成——可视化；Preact / Svelte 同样策略；性能 + 体积预算。

---

## 关键代码段

```ts
// packages/reactivity/src/dep.ts — Dep-Subscriber 图
export class Dep {
  subs: Link | undefined = undefined;
  track(): Link {
    if (!activeLink || activeLink.dep !== this) {
      activeLink = new Link(this, activeLink, activeSub)
    }
    return activeLink
  }
  trigger(): void {
    let link = this.subs
    while (link) {
      link.sub.notify()
      link = link.nextDep
    }
  }
}

// packages/shared/src/patchFlags.ts — PatchFlag 位掩码
export const enum PatchFlags {
  TEXT = 1 << 0,        // 1
  CLASS = 1 << 1,       // 2
  STYLE = 1 << 2,       // 4
  PROPS = 1 << 3,       // 8
  FULL_PROPS = 1 << 4,  // 16
  NEED_HYDRATION = 1 << 5, // 32
}
```

## 必偷 3 件

1. **Dep / Link / Subscriber 双向链表响应式图**：图结构比数组灵活；O(1) track / O(N) trigger；与 Solid.js 思路不同但都解决响应式。
2. **PatchFlag 位掩码 + block tree dynamicChildren**：编译期优化 > 运行期优化；diff O(n) → O(d)；编译器是性能主战场。
3. **13 包 monorepo + Custom Renderer API**：平台无关 runtime-core + 平台适配层；任何树形结构可适配；跨端 1-2 周。

## 必避 3 坑

1. **不要在 `reactive` 中放基础类型**——会报"value cannot be made reactive"；基础类型必 `ref`。
2. **不要在 `template` 中用 `v-if` 替代 `<KeepAlive>`**——`v-if` 销毁重建，`KeepAlive` 缓存组件。
3. **不要让组件模板过大**——> 1000 行拆 `<script setup>` 拆 composables；模板编译产物 readability 下降。
