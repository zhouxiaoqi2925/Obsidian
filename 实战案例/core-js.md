# core-js - JS 世界的"瑞士军刀 polyfill"：模块化按需 + 不污染全局

**GitHub**: zloirock/core-js
**Star**: 25k+
**语言**: JavaScript
**主题**: polyfill/ecmascript/web-standard/babel-default/tc39-proposals
**适用场景**: 库作者、框架作者、企业前端基建、Babel/构建工具链维护者、TC39 提案跟读

## 第一段：基础范式

### 模式 1：7 包 monorepo + 单一共享 `internals/`

**问题场景**：Babel/Next/Vue CLI 默认 polyfill 源——一个包覆盖 ES2015~2025 + 全部活跃 proposal？

**解决方案**：用 7 包 monorepo + 共享 `internals/`——`core-js`（主入口/全局污染）+ `core-js-pure`（standalone 不污染全局）+ `core-js-compat`（Babel 用 browserslist 兼容数据）+ `core-js-builder`（CLI 自定义打包）+ `core-js-bundle`（预打包产物）。
```
core-js                 # 主入口，全局污染
core-js-pure            # standalone 不污染
core-js-compat          # Babel 用，输出 browserslist 数据
core-js-builder         # CLI 自定义打包
core-js-bundle          # 预打包产物
```

**关键参数**：
- 7 子包
- npm workspaces
- 共享 `internals/`
- 每月 2.5 亿+ 下载
- Babel / Next / Vue CLI 默认

**最佳实践**：polyfill 库用 monorepo——单包可装，多包分发；`core-js` vs `core-js-pure`——污染 vs 不污染两版本；`internals/` 抽公共——避免重复；Babel 默认源——生态护城河；`core-js-compat` 喂 browserslist——构建工具链关键。

---

### 模式 2：5 层 `actual / stable / full / es / proposals` 数据组织

**问题场景**：polyfill 范围如何组织？用户要"只稳定" / "含 proposals" / "Web 标准" 不同需求？

**解决方案**：用 5 层组织——`actual`（已发布稳定 + 已实现 proposal）/ `stable`（仅 ES 稳定特性）/ `full`（actual+proposals）/ `es`（按规范章节分组）/ `proposals`（按 Stage 分组）。**用户按需选入口**。
```
core-js/actual          # 稳定 + 已实现 proposal
core-js/stable          # 仅稳定 ES
core-js/full            # actual + proposals
core-js/es              # 按规范章节分组
core-js/proposals       # 按 stage 分组
core-js/web             # URL/URLSearchParams 等
core-js/stage           # Stage 0~3
```

**关键参数**：
- `actual` 主流入口
- `stable` 仅稳定
- `full` 含 proposal
- `es` 按规范章节
- `proposals` 按 Stage

**最佳实践**：polyfill 范围要"分层"——`actual` 主流、`stable` 保守、`full` 激进；用户按风险偏好选入口；`es` 按规范章节——学习路径清晰；`proposals` 按 Stage——TC39 跟读；5 层覆盖 100% 场景。

---

### 模式 3：internals 抽象层 + `$()` 函数收编"原生 vs polyfill"

**问题场景**：同一段代码要"原生支持用原生" / "不支持用 polyfill"——`if (Array.from)` 散落各处。

**解决方案**：用 `internals/` 200+ 抽象 + `$()` 函数——每个特性抽 `isForced` / `isActual` / `isPure` 标志。**`$()` 统一调入口**。
```js
// core-js/internals/array-from.js
module.exports = function ($) {
  return function from(arrayLike /*, mapfn, thisArg */) {
    return $.arrayFrom(arrayLike, ...arguments)
  }
}
```

**关键参数**：
- 200+ internals
- `$` 入口
- `isForced` 强制覆盖
- `isActual` 已实际
- `isPure` pure 入口

**最佳实践**：polyfill 用 internals 抽象——避免 `if (Array.from)` 散落；`$()` 统一入口——单一真相源；`isForced` 覆盖原生 bug；`isActual` 检测原生支持；`isPure` 区分污染/不污染；抽象层是大型 polyfill 库的关键。

---

### 模式 4：`forced` / `sham` / `unsafe` 三段式

**问题场景**：原生有 bug 怎么办？不同浏览器实现不一致？性能反优化？

**解决方案**：用 `forced`（强制覆盖）+ `sham`（假装支持，但原生优先）+ `unsafe`（性能反优化但代码正确）三段式。**用户按需开启**。
```
forced:  强制覆盖原生（原生有 bug）
sham:    假装支持，但调原生（假阳）
unsafe:  性能反优化（小型 polyfill 但运行时差）
```

**关键参数**：
- `forced: true` 强制覆盖
- `sham: true` 假阳
- `unsafe: true` 性能反优化
- 200+ 模块支持
- Babel `useBuiltIns` 联动

**最佳实践**：polyfill 三段式——`forced` 覆盖 bug、`sham` 假装支持、`unsafe` 性能；按需开启——不滥用 `forced`；`sham` 给"我要这 API 但用原生"场景；`unsafe` 暴露运行时风险；200+ 模块每个都支持三段式。

---

### 模式 5：Stage 0~4 proposal 跟读 + 提前 polyfill

**问题场景**：TC39 提案到浏览器实现要 2-5 年——开发者想用最新 API？

**解决方案**：core-js 跟读 TC39 每周会议——Stage 3 proposal 提前 polyfill，Stage 4 稳定后推 `actual`。**作者 Denis Pushkarev 1 人跟 5 年**。
```
Stage 0:  strawman / 想法
Stage 1:  proposal / 接受
Stage 2:  draft / 形态
Stage 3:  candidate / 等待实现
Stage 4:  finished / 标准
```

**关键参数**：
- Stage 0~4 跟读
- Stage 3 polyfill
- Stage 4 进 actual
- 1 人维护
- 每周 TC39 会议

**最佳实践**：polyfill 库要"跟 TC39"——Stage 3 提前 polyfill；1 人维护虽危险但响应快；周会议跟读——时效性；Stage 4 进 stable——质量保证；Denis Pushkarev 模式——单一作者 + 高质量；core-js 护城河 = 跟读深度。

---

## 第二段：扩展范式

### 模式 6：core-js-compat 输出 browserslist 兼容数据

**问题场景**：Babel `preset-env` 要"按 targets 选 polyfill"——`> 1%, not dead` 哪些需要 polyfill 哪些不需要？

**解决方案**：用 `core-js-compat` 维护浏览器/特性兼容数据——Babel `useBuiltIns: 'usage'` 自动按数据 import。**200+ 特性 × 浏览器版本矩阵**。
```json
// core-js-compat/data.json
{
  "es.array.from": {
    "chrome": "45",
    "firefox": "32",
    "safari": "9",
    "node": "4"
  }
}
```

**关键参数**：
- 200+ 特性矩阵
- browserslist 联动
- Babel 自动 import
- `useBuiltIns: 'usage'`
- 体积最小化

**最佳实践**：polyfill 数据要结构化——`{特性: {浏览器: 最低版本}}`；Babel `useBuiltIns: 'usage'` 自动按数据 import；`core-js-compat` 喂 browserslist——构建工具链关键；体积最优——仅 polyfill 需要的；200+ 特性矩阵——持续维护。

---

### 模式 7：core-js-builder 自定义打包 + `browserslist` 输入

**问题场景**：用户要"按自己的 targets 打包最小 polyfill"——`core-js` 全量 200KB 太大。

**解决方案**：用 `core-js-builder` CLI——输入 browserslist 输出最小 polyfill bundle。**`core-js-bundle` 是预打包的全量版**。
```bash
npx core-js-builder --browserslist '> 0.5%, not dead' \
  --modules 'es.array.from es.promise.finally' \
  --outfile polyfill.min.js
```

**关键参数**：
- `core-js-builder` CLI
- `--browserslist` 输入
- `--modules` 选特性
- `--outfile` 输出
- 体积最小化

**最佳实践**：polyfill 库要发"builder CLI"——按需打包；`--browserslist` 输入——复用生态数据；`--modules` 选特性——精细控制；体积最小化——关键场景（移动端 / Edge）；`core-js-bundle` 是预打包兜底。

---

### 模式 8：core-js-pure 不污染全局 + standalone

**问题场景**：库作者要"用 Array.from 但不污染用户全局"——`core-js` 会污染。

**解决方案**：用 `core-js-pure`——所有特性 standalone 引入 `from 'core-js-pure/features/array/from'`。**零全局污染**。
```js
// 库作者
import from from 'core-js-pure/features/array/from'
// 仅这个 from，不污染用户的 Array.from
```

**关键参数**：
- 不污染全局
- 库作者友好
- `core-js-pure/features/xxx`
- 零副作用
- 体积稍大（每调用一次独立）

**最佳实践**：库作者用 `core-js-pure`——不污染用户全局；`features/xxx` 路径明确——按需引入；体积 vs 全局污染 trade-off——库优先 pure；应用优先 polluted（`core-js`）；双入口是 polyfill 库标配。

---

### 模式 9：modules/ + es/ + proposals/ 按 feature 一文件

**问题场景**：200+ 特性如何组织代码？单文件 5000 行难维护。

**解决方案**：每个特性一文件——`modules/es.array.from.js` / `modules/es.promise.finally.js` / `proposals/array-flat-map.js`。**200+ 文件，每文件 5-50 行**。
```
core-js/
├── modules/
│   ├── es.array.from.js        # 5-50 行
│   ├── es.array.flat.js
│   ├── es.promise.all.js
│   └── ... 200+
├── proposals/
│   ├── array-flat-map.js
│   ├── array-grouping.js
│   └── ...
├── internals/
│   ├── array-from.js
│   └── ... 200+
```

**关键参数**：
- 一文件一特性
- 5-50 行/文件
- 200+ 文件
- `internals/` 共享
- 易维护

**最佳实践**：大库用"一文件一特性"——200+ 文件 5-50 行/文件；`internals/` 抽公共——避免重复；`modules/` vs `proposals/` 分离——稳定 vs 实验；易读 + 易维护 + 易 review；core-js 模块化精髓。

---

### 模式 10：26+ 生态集成（Babel / swc / esbuild / Vite）

**问题场景**：Babel `preset-env` 默认用 core-js——如何让 swc / esbuild / Vite 也用？

**解决方案**：维护多套集成包——`@babel/preset-env` / `swc-plugin-core-js`（社区）/ esbuild plugin（社区）/ Vite plugin。**26+ 生态默认 core-js**。
```
生态集成
- @babel/preset-env
- swc-plugin-core-js
- esbuild-plugin-core-js
- Vite plugin
- Rollup plugin
- Webpack plugin
```

**关键参数**：
- 26+ 集成
- Babel 官方
- swc 社区
- esbuild 社区
- Vite 官方

**最佳实践**：polyfill 库要"广集成"——Babel 官方是护城河；swc / esbuild 社区版——快速跟进；Vite / Rollup / Webpack 全覆盖；26+ 集成 = 生态默认；core-js 事实标准 = 集成广度。

---

## 第三段：进阶范式

### 模式 11：Map / Set polyfill + WeakMap/WeakSet 用 ES6 原生

**问题场景**：Map / Set ES6 引入——但用户要支持 ES5 浏览器（如 IE11）？

**解决方案**：用 ES5 兼容 Map / Set 实现——`entries` / `forEach` / `size` 全套 API。**WeakMap / WeakSet 无法 polyfill**——文档明示不支持。
```js
// core-js/modules/es.map.js
var Map = require('../internals/map') // Map 完整 polyfill
// 但 WeakMap 在 IE11 无法 polyfill（语言层）
```

**关键参数**：
- Map / Set 可 polyfill
- WeakMap / WeakSet 不可
- ES5 兼容实现
- 完整 API 覆盖
- 文档明示限制

**最佳实践**：polyfill 库要"明确不可 polyfill 的 API"——WeakMap / Proxy / WeakRef；文档明示——避免用户误解；Map / Set 可 polyfill——用 Map 而非 Object；Reflect / Symbol 部分可 polyfill——谨慎；明确边界 = 工程诚信。

---

### 模式 12：Array.from polyfill + Symbol.iterator 检测

**问题场景**：Array.from ES6——但 iterable（Map / Set / Generator）IE11 不支持？

**解决方案**：用 Symbol.iterator 检测——`if (typeof Symbol === 'function' && Symbol.iterator)` 走原生，否则 fallback 数组。**Array.from polyfill 需 Symbol.iterator fallback**。
```js
// core-js/modules/es.array.from.js
var toLength = require('../internals/to-length')
module.exports = function from(arrayLike) {
  if (arrayLike == null) throw TypeError(...)
  var items = iterableToArray(arrayLike)  // Symbol.iterator fallback
  // ...
}
```

**关键参数**：
- Symbol.iterator 检测
- iterable fallback
- IE11 兼容
- toLength 工具
- 完整 iterable 支持

**最佳实践**：ES6 polyfill 必含 Symbol.iterator fallback——iterable 是核心；`toLength` / `toInteger` 工具——边界值处理；ES5 浏览器兼容——Symbol polyfill 链；可迭代检测先于 polyfill；用户友好——错误信息清晰。

---

### 模式 13：Async Iterator + for-await-of polyfill

**问题场景**：`for await (const x of asyncIterable)` ES2018——IE11 不支持。

**解决方案**：core-js 提供 async iterator polyfill + `forAwaitOf` 工具。**`Symbol.asyncIterator` 完整支持**。
```js
const asyncIter = {
  [Symbol.asyncIterator]() {
    return {
      async next() { return { value: 1, done: false } }
    }
  }
}
for await (const x of asyncIter) { ... }
```

**关键参数**：
- Symbol.asyncIterator
- for-await-of 语法
- async generator
- ES2018 标准
- 完整 polyfill

**最佳实践**：async iterator 是 ES2018 核心——`Symbol.asyncIterator` 必 polyfill；`for-await-of` 语法糖——async generator 底层；现代 API 完整覆盖——`AbortController` / `Promise.allSettled`；Babel stage 3+ 提前支持；core-js 跟读深度 = 现代 API 完整度。

---

### 模式 14：Promise polyfill + microtask 调度

**问题场景**：`Promise` ES6——IE11 同步 setTimeout fallback 性能差。

**解决方案**：core-js Promise polyfill 用 `asap` 库做 microtask 调度——`MutationObserver` / `process.nextTick` / `setImmediate` 选最快。**比 setTimeout(0) 快 100x**。
```js
// core-js/modules/es.promise.js
var $ = require('../internals/export')
var microtask = require('../internals/microtask')
// microtask 选择：MO > nextTick > setImmediate > setTimeout
```

**关键参数**：
- microtask 调度
- `asap` 库
- `MutationObserver`
- `process.nextTick`
- 比 setTimeout 快 100x

**最佳实践**：Promise polyfill 必用 microtask 调度——`setTimeout(0)` 太慢；优先级 `MutationObserver` > `nextTick` > `setImmediate`；IE11 用 `setTimeout` 兜底——性能差但可用；asap 库抽公共——多 Promise 实现共享；core-js 性能优化 = microtask 调度。

---

### 模式 15：Reflect / Proxy polyfill 边界

**问题场景**：`Reflect` / `Proxy` ES6——Proxy 完全无法 polyfill，Reflect 部分可。

**解决方案**：core-js polyfill `Reflect` 全套 API（`Reflect.get` / `Reflect.set` 等），但 `Proxy` 仅在原生支持时导出 polyfill 包装。**Proxy = 语言层不可能 polyfill**。
```
Reflect.get           可 polyfill
Reflect.set           可 polyfill
Proxy(obj, handler)   不可 polyfill（语言层）
```

**关键参数**：
- Reflect 可 polyfill
- Proxy 不可
- Proxy 包装检测原生
- ES5 浏览器陷阱
- 文档明示

**最佳实践**：明确"不可 polyfill 边界"——Proxy / WeakRef 不可；Reflect 可 polyfill——内部 Object 操作封装；Proxy 检测原生——否则抛错；现代 API 完整性 = 跟读 TC39；边界明确 = 工程诚信。

---

## 第四段：实战范式

### 模式 16：forced: true 强制覆盖 Safari 9 Array.from 慢

**问题场景**：Safari 9 Array.from 性能差 10x——开发者要"强制用 polyfill 覆盖原生"。

**解决方案**：`core-js/modules/es.array.from` 配 `forced: true`——强制覆盖原生用 polyfill 实现。**针对特定浏览器版本强制**。
```js
// core-js/modules/es.array.from.js
module.exports = require('../internals/export')({
  global: true,
  forced: true,  // 强制覆盖原生
}, {
  from: function from(arrayLike) { ... }
})
```

**关键参数**：
- `forced: true`
- 覆盖原生实现
- 特定浏览器优化
- 性能优于原生
- `useBuiltIns: 'usage'` 联动

**最佳实践**：polyfill 必含 `forced` 选项——特定浏览器原生 bug / 性能差；Safari 9 Array.from 是经典——10x 性能差距；IE11 Object.assign 也 `forced`；用户按需开启——不滥用；`useBuiltIns: 'usage'` 自动识别；core-js 实战。

---

### 模式 17：Babel `useBuiltIns: 'usage'` 自动按需 import

**问题场景**：项目用了 `Promise.allSettled` + `Array.flat` + `Map.groupBy`——如何仅 import 需要的 polyfill？

**解决方案**：Babel `preset-env` 配 `useBuiltIns: 'usage'` + `corejs: 3`——按 AST 检测 + 浏览器 targets 算 diff，自动 import 缺失特性。**零配置按需**。
```js
// babel.config.js
{
  presets: [
    ['@babel/preset-env', {
      useBuiltIns: 'usage',
      corejs: 3,
      targets: '> 0.5%, not dead'
    }]
  ]
}
```

**关键参数**：
- `useBuiltIns: 'usage'`
- `corejs: 3`
- AST 检测
- browserslist 联动
- 体积最优

**最佳实践**：Babel + core-js 配 `useBuiltIns: 'usage'`——零配置按需；AST 检测——比手写精准；browserslist 联动——按 targets 算；体积最优——仅 polyfill 缺失；现代项目标配；core-js 护城河 = Babel 默认源。

---

### 模式 18：core-js-compat 数据 + 维护浏览器版本矩阵

**问题场景**：200+ 特性 × 30+ 浏览器 × 5+ 版本 = 30000+ 单元格——如何维护？

**解决方案**：用 `core-js-compat/data.json`——JSON 格式 `特性 → 浏览器: 最低支持版本`。**`mdn-data` + 人工修正**。
```json
{
  "es.array.flat": {
    "chrome": "69",
    "firefox": "62",
    "safari": "12",
    "edge": "79",
    "node": "11"
  }
}
```

**关键参数**：
- 200+ 特性
- 30+ 浏览器
- JSON 格式
- mdn-data 来源
- 人工修正

**最佳实践**：polyfill 数据要"结构化"——JSON 比 XML/YAML 易解析；`mdn-data` 是事实来源——MDN 浏览器兼容数据；人工修正——Safari 9 Array.from 性能差需 forced；200+ 特性 + 30+ 浏览器——数据量；CI 自动校验——避免数据漂移。

---

### 模式 19：拒绝 OpenJSF 接管的独立治理

**问题场景**：OpenJSF 2019 想接管 core-js——作者为什么拒绝？

**解决方案**：作者 Denis Pushkarev 拒绝——理由"个人维护响应快 + 治理单一 + 不会被委员会拖慢"。**社区支持但作者独立决策**。
```
2019: OpenJSF 提议接管
作者: 拒绝
理由: 个人维护响应快 + 治理单一
后续: 持续个人维护
```

**关键参数**：
- OpenJSF 提议
- 2019 拒绝
- 个人维护
- 治理单一
- 持续 5+ 年

**最佳实践**：开源治理要"灵活"——个人 vs 基金会各有优；个人维护响应快——新提案 1 周跟进；基金会治理有资金保障——但慢；core-js 模式——个人 + OpenCollective 资金 + 26+ 集成；治理选择 = 项目灵魂。

---

### 模式 20：OpenCollective + Patreon + Bitcoin 5 渠道赞助

**问题场景**：1 人维护的 polyfill 库如何持续？商业模式？

**解决方案**：README 第 21 行列 5 个打赏渠道——OpenCollective / Patreon / Bitcoin / Boosty / 直接赞助。**个人 + 透明 + 多渠道**。
```
赞助渠道（README 第 21 行）
- OpenCollective
- Patreon
- Boosty
- Bitcoin
- 直接赞助
```

**关键参数**：
- 5 赞助渠道
- OpenCollective 透明
- Patreon 月费
- Bitcoin
- 个人维护

**最佳实践**：开源个人项目要"多赞助渠道"——OpenCollective 透明 + Patreon 月费 + Bitcoin；README 顶部列赞助——降低门槛；核心 vs 周边分工——核心作者维护 + 社区贡献；不依赖单一渠道——5 渠道分散风险；core-js 模式 = 1 人 + 5 渠道。

---

## 关键代码段

```js
// core-js/modules/es.array.from.js
module.exports = require('../internals/export')({
  global: true,
  forced: true,  // 强制覆盖 Safari 9
}, {
  from: function from(arrayLike /*, mapfn, thisArg */) {
    var O = toObject(arrayLike)
    // ... 完整 polyfill
  }
})

// core-js/internals/array-from.js
module.exports = function ($) {
  return function from(arrayLike) {
    return $.arrayFrom(arrayLike, ...arguments)
  }
}

// core-js-compat/data.json
{
  "es.array.flat": {
    "chrome": "69",
    "firefox": "62",
    "safari": "12",
    "edge": "79",
    "node": "11"
  }
}
```

## 必偷 3 件

1. **5 层 `actual / stable / full / es / proposals` 数据组织**：polyfill 范围要分层；用户按风险偏好选入口；5 层覆盖 100% 场景。
2. **`internals/` 抽象 + `$()` 函数收编原生 vs polyfill**：避免 `if (Array.from)` 散落；统一入口单一真相源；抽象层是大型 polyfill 库关键。
3. **`forced` / `sham` / `unsafe` 三段式**：按需开启——不滥用 forced；sham 给"我要这 API 但用原生"；unsafe 暴露运行时风险；200+ 模块都支持。

## 必避 3 坑

1. **不要在 IE11 期望 Proxy / WeakRef polyfill**——语言层不可能 polyfill；文档明示避免误解。
2. **不要用 `core-js` 污染全局做库**——库作者必用 `core-js-pure`；零全局污染是库伦理。
3. **不要追求"100% 覆盖"目标浏览器**——`> 0.5%, not dead` 是行业共识；小众浏览器留给用户手动 polyfill。
