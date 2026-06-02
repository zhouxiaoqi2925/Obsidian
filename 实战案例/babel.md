# babel - 写下一代 JavaScript 的多阶段编译器与插件平台

**GitHub**: babel/babel
**Star**: 43k+
**语言**: TypeScript + JavaScript
**主题**: 编译器 / 插件平台 / AST 改写 / monorepo
**适用场景**: 源码到源码转译、语法降级、polyfill 注入、JSX/TS/Flow 兼容

## 第一段：基础范式

### 模式 1：parser/traverse/generator 三段 + babel-core 调度解耦

**问题场景**：编译器内部本来是 parse→transform→generate 三段流水线，但插件作者只想写 AST 改写（visitor），被迫理解整条管线细节——核心与插件紧耦合。

**解决方案**：把三段拆成独立 npm 包（`@babel/parser` / `@babel/traverse` / `@babel/generator`），`@babel/core` 做 plugin 调度 + File 抽象。插件作者 import `@babel/traverse` 写 visitor 即可：
```ts
export default function plugin({ types: t }) {
  return {
    visitor: { Identifier(path) { path.node.name = path.node.name.toUpperCase(); } }
  };
}
```

**关键参数**：
- `packages/babel-core`：调度核心 + `transformRunner`
- `packages/babel-parser`：tokenizer + statement + expression
- `packages/babel-traverse`：NodePath + Scope
- `packages/babel-generator`：printer + buffer + source-map
- `File AST` 跨段传递——结构化 AST 不丢信息

**最佳实践**：核心解耦三段——插件作者只 import traverse；每段独立发版——独立升级；`File` 是统一句柄——配置/plugin 状态全部挂在 File 上。

---

### 模式 2：gensync 协程统一 sync/async API

**问题场景**：babel 要同时支持 `transformSync`（webpack babel-loader 同步用）、`transformAsync`（jest 异步测试）、`transform(cb)`（老 API）。同一段编译逻辑写三遍。

**解决方案**：用 `gensync` 把整条流水线写成 generator function，由 runtime 切回任意形态：
```ts
const transformRunner = gensync(function* transform(code, opts) {
  const config = yield* loadConfig(opts);
  if (config === null) return null;
  return yield* run(config, code);
});
// 三种调用方式
transformRunner.sync(code, opts);
transformRunner.async(code, opts);
transformRunner.errback(code, cb);
```

**关键参数**：
- `gensync`——基于 generator 的协程库
- `runner.sync / runner.async / runner.errback`——同一代码三形态
- `yield*` 委托子 generator——子任务可独立 sync/async
- `beginHiddenCallStack` 重写栈帧——避免污染用户错误堆栈
- v8 强制 `transform()` 传 callback——显式选型避免隐式成本

**最佳实践**：多形态 API 用 generator 协程——三套 caller 共享一段代码；`beginHiddenCallStack` 必加——gensync 内部栈帧污染用户报错；强制 callback 参数——避免"以为是 sync 实际走到 async"的隐式成本。

---

### 模式 3：NodePath 13 个 mixin 文件聚合

**问题场景**：NodePath 是 babel 最常用的类——ancestry / replacement / evaluation / conversion / family / removal / modification 等 13 类操作。如果写一个 4000 行的 class，IDE 跳转只能到最外层，stack trace 看不出方法来自哪个文件。

**解决方案**：用 mixin 模式，13 个文件各 100-500 行，`import * as X from "./xxx.ts"` 注入到 `NodePath` 原型：
```ts
// packages/babel-traverse/src/path/index.ts:60
const NodePath_Final = class NodePath {
  // 13 个 mixin 通过 import * as 注入
};
```

**关键参数**：
- 13 个 mixin 文件：`ancestry / replacement / evaluation / conversion / family / removal / modification / context / introspection / comments`
- 每个 mixin 独立可读
- types 用 `declare` 拼装：`NodePathAssertions` / `NodePathValidators`
- IDE 跳转精准到 `replacement.ts:200`
- 调试 stack trace 显示来源文件

**最佳实践**：大型类用 mixin 聚合而非单文件 4000 行；types 用 `.d.ts` 联合声明——避免运行时膨胀；每个 mixin 单测可独立——降低回归成本。

---

### 模式 4：@babel/types 节点 + builder/validator 分离

**问题场景**：AST 节点挂方法有两种——OOP 风格 `node.identifier()` 或 FP 风格 `t.identifier(name)`。如果节点挂方法，节点是"非 plain object"——JSON 序列化、跨 worker 传递、diff 调试都成问题。

**解决方案**：节点是 plain object，validators/builders 外置为函数：
```ts
// 节点是 plain object
const idNode = { type: "Identifier", name: "foo" };
// builder 函数式
t.identifier("foo")  // 返回 plain object
// validator 独立
t.isIdentifier(node)  // 类型守卫
```

**关键参数**：
- 节点 = plain object——可 JSON 序列化
- `@babel/types` 暴露 builder 函数：`t.identifier / t.stringLiteral`
- validator 独立：`t.isIdentifier / t.assertIdentifier`
- 跨 worker 传递零成本
- diff 调试可视化友好
- OOP 链式放弃——换来序列化 + 跨线程

**最佳实践**：AST 节点用 plain object——序列化 + 跨线程零成本；validators/builders 函数式——更纯；`t.isXxx` 类型守卫——TS 收窄类型。

---

### 模式 5：visitor 标准化 explode + alias + enter/exit

**问题场景**：插件作者写 visitor 想"短形式"（`Identifier(p) {}`）、"管道"（`Identifier|Pattern(p) {}`）、"alias"（`Property` 包括 `ObjectProperty + ClassProperty`）。但 traverse 引擎需要的是标准化 `{ Identifier: { enter: [fn], exit: [] } }`。

**解决方案**：`explode()` 函数把短形式展开成标准化形式，一次 normalize 缓存：
```ts
const visitor = {
  Identifier(p) {},
  "Identifier|NumericLiteral"(p) {},
  Property: { enter(p) {}, exit(p) {} },
};
// explode() 内部
{ Identifier: { enter: [fn], exit: [] },
  NumericLiteral: { enter: [fn], exit: [] },
  ObjectProperty: { enter: [fn], exit: [] },
  ClassProperty: { enter: [fn], exit: [] } }
```

**关键参数**：
- 短形式 `Identifier(p) {}`——最常用
- 管道 `Identifier|NumericLiteral`——同处理逻辑
- alias `Property`——展开为多真实类型
- `enter` / `exit`——进入/离开节点时触发
- 一次 explode 缓存——hot path 不重复 normalize

**最佳实践**：visitor 写短形式——可读性优先；`explode()` 标准化——引擎处理统一；alias 在框架层展开——插件作者不感知真实类型。

---

## 第二段：扩展范式

### 模式 6：Plugin Pass 分组合并 visitor

**问题场景**：preset-env 通常需要 30+ 插件同步 traverse AST 改写；如果每个插件独立 traverse，30 次全树遍历 100% 慢 30 倍。

**解决方案**：把插件按 pass 分组（preset-env 通常 3 个 pass），同一 pass 内合并 visitor 一次性 traverse；不同 pass 共享同一 File 句柄。

**关键参数**：
- `plugin-pass.ts` 调度——按 pass 分组
- 同 pass 合并 visitor——一次 traverse
- 跨 pass 共享 File——配置不重传
- 改写 AST 后下一 pass 看到新 AST
- preset-env 拆 3 pass：syntax / polyfill / target 转换

**最佳实践**：插件按 pass 分组——同 pass 合并 visitor；preset 拆多 pass——按职责分层；跨 pass 共享 File——避免重复 init。

---

### 模式 7：block-hoist 内部插件 priority 0-4 数值

**问题场景**：preset-env 注入的 `var _interopRequireDefault = ...` helper 必须排在所有 `require()` 调用前；但插件输出的代码顺序由 visitor 决定，文本排序不优雅。

**解决方案**：用 priority 数字（0=very bottom、1=默认、2=高于默认、3=very top、4=helper 保留）让 AST visitor 自动排序：
```ts
// block-hoist-plugin.ts
const blockHoistPlugin = {
  name: "internal.blockHoist",
  visitor: {
    Block: { exit({ node }) { node.body = performHoisting(node.body); } }
  }
};
```

**关键参数**：
- 5 个 priority 档位
- `SwitchCase` 单独处理——case 内函数声明特殊
- AST visitor 排序比文本排序安全
- 改动一个插件立刻影响全流水线
- 注释明示 priority 含义——避免后人误用

**最佳实践**：plugin 排序用 priority 数字——比文本排序优雅；SwitchCase 单独承认不一致——比假装一致更工程；priority 含义写注释——防误用。

---

### 模式 8：parser unambiguous 模式 + 重解析回退

**问题场景**：`.js` 后缀文件历史上是 script，引入 ESM 后没人能 100% 区分；`await\n0` 在 module 是 `AwaitExpression(0)`，在 script 是两条 `ExpressionStatement`。

**解决方案**：先按 module 试 → 失败回退 script；module 成功但 `ambiguousScriptDifferentAst` 时再重解析为 script：
```ts
if (options?.sourceType === "unambiguous") {
  try { /* module parse */ return ast; }
  catch { /* 回退 script */ return parseScript(input); }
}
```

**关键参数**：
- `sourceType: 'unambiguous'`——自动判断
- 先 module 试——成功识别 import/export
- 失败回退 script——保证 `await` 合法
- `ambiguousScriptDifferentAst` 触发重解析
- 比 acorn 早一步解决 mixed-sourceType 痛点

**最佳实践**：未明确 sourceType 走 unambiguous——比强制用户选更友好；module 优先 + script 兜底——失败有路径；`ambiguousScriptDifferentAst` 解决边界——可预测 AST。

---

### 模式 9：Scope binding 一次收集 + 后续 cheap lookup

**问题场景**：transform 阶段插件经常要"判断变量是否已声明" / "重命名变量" / "找引用"——每次全 AST 遍历找 binding 极慢。

**解决方案**：`babel-traverse/scope` 在第一次 traverse 收集所有 binding 到 map，后续 cheap lookup：
```ts
path.scope.bindings  // 局部所有 binding Map
path.scope.getBinding("x")  // 找名为 x 的 binding
path.scope.rename("x", "y")  // 重命名
```

**关键参数**：
- 第一次 traverse 收集——binding map
- 后续 lookup O(1)
- `rename()` 同时改声明 + 引用
- 支持 block scope / function scope
- `crawl()` 重新收集——AST 改写后用

**最佳实践**：binding 一次收集——避免每次遍历；`getBinding / rename` 是高频 API；改写 AST 后调 `crawl()` 重新收集——保持正确性。

---

### 模式 10：helper 声明-注入分离

**问题场景**：preset-env 注入 polyfill 时需要 `_classCallCheck` 等 helper 函数——但 helper 注入时机和 plugin 改写时机不同步。

**解决方案**：插件通过 `api.addHelper(name)` 声明要用的 helper，实际注入在 generator 阶段：
```ts
// plugin
api.addHelper("classCallCheck");
// generator 阶段统一注入
import * as helpers from "@babel/helpers";
```

**关键参数**：
- `api.addHelper(name)` 声明
- `@babel/helpers` 集中所有 helper 实现
- generator 阶段统一注入到文件顶部
- 避免重复 import
- tree-shaking 友好——只引用的 helper 才打包

**最佳实践**：helper 走声明-注入分离——plugin 简洁；集中管理 helper——复用 + tree-shake；generator 阶段统一注入——避免重复。

---

## 第三段：进阶范式

### 模式 11：unambiguous ESM 识别 + 标识符大小写 lower/upper 双表

**问题场景**：`Number`（首字母大写）和 `number`（全小写）是两个不同变量；`rename("Number")` 时如果不知道 `Number` 是全局，会错误重命名。

**解决方案**：维护两个 JSON 表——`builtin-lower.json`（snake_case 全局）+ `builtin-upper.json`（PascalCase 全局）：
```ts
import globalsBuiltinLower from "@babel/helper-globals/data/builtin-lower.json" with { type: "json" };
import globalsBuiltinUpper from "@babel/helper-globals/data/builtin-upper.json" with { type: "json" };
```

**关键参数**：
- lower 表跳 snake_case 全局（`number` 不是全局）
- upper 表跳 PascalCase 全局（`Number` 是全局）
- rename 时 skip 全局——避免破坏内置
- `import ... with { type: "json" }` ESM JSON
- 数据驱动——新增全局只改 JSON

**最佳实践**：rename 必须有 builtin 表——大小写敏感；lower/upper 分两份——精确跳过；JSON 数据驱动——易维护。

---

### 模式 12：OptionFlags 位掩码 hot-path 性能

**问题场景**：parser hot-path 几百万次 `if (this.options.allowAwaitOutsideFunction)`——字符串属性访问 + boolean 判断，V8 不友好。

**解决方案**：把 options 转成 `OptionFlags` 位掩码，`|` 合并 + `&` 检查：
```ts
let optionFlags = 0;
if (normalizedOptions.allowAwaitOutsideFunction) optionFlags |= OptionFlags.AllowAwaitOutsideFunction;
// 7 个 flag 一个一个 or
// hot-path
if (optionFlags & AllowAwaitOutsideFunction) { ... }
```

**关键参数**：
- 7 个 flag 一个一个 or
- bit 运算 + JS engine 友好
- parser hot-path 全用位掩码
- 经典 perf-driven 改造
- 启动期一次转换，hot-path 直接位运算

**最佳实践**：hot-path 选项用位掩码——避免属性查找；启动期转换一次——运行时零成本；7 个 flag 是经验值——多了用 enum。

---

### 模式 13：explode$1 命名规避 d.ts 工具链 bug

**问题场景**：rollup-plugin-dts 在生成 `.d.ts` 时会把 `export function explode` 改成 `var explode`——破坏 `import { explode }` 解析。

**解决方案**：重命名为 `explode$1`——d.ts 工具无法误改：
```ts
// packages/babel-traverse/src/visitors.ts:42
export { explode$1 as explode };  // 注释：rollup-plugin-dts 命名空间问题
```

**关键参数**：
- 注释明示原因
- `explode$1` 是工具链防御命名
- rollup-plugin-dts 不识别 `$` 数字
- 极少见的"为工具链 bug 主动污染源码"
- 同类问题在 babel-helper-validator-identifier 也存在

**最佳实践**：工具链 bug 用命名约定规避；注释必须——下任 maintainer 不再绕弯路；`$1` 后缀是约定俗成——d.ts 工具的"无法识别"标记。

---

### 模式 14：experimental_preserveFormat 5 个前置条件 fail-fast

**问题场景**：用户期望"保留原格式"——但这个特性需要把每个 token 与 AST 节点映射，5 个前置条件（保留原 code / `retainLines=true` / 禁用 `compact/minified/jsescOption` / `tokens: true` parser option）任意一个不对就破坏语义。

**解决方案**：每个条件不满足直接 throw：
```ts
if (input?.code === undefined) throw new Error("experimental_preserveFormat requires original code");
// 5 个独立 if-throw
```

**关键参数**：
- 5 个前置条件全部强制
- 任一不满足 throw
- "我真的知道我在做什么"的安全锁
- 用户跑通就一定正确
- 失败模式明确——不用猜哪里错

**最佳实践**：实验性功能前置条件强校验——5 个 if-throw 显式失败；安全锁 = 任意环节不对就 throw；用户跑通 = 一定正确。

---

### 模式 15：BABEL_9_BREAKING env 切换 version 后缀

**问题场景**：v8 是 breaking 变更（callback 强制 / ESM 全面化），下游 monorepo 必须同时测试 7.28 + 8.0-rc 兼容；维护两个二进制浪费。

**解决方案**：通过 `BABEL_9_BREAKING` env 切换 version 字符串后缀 `999999999`：
```ts
if (process.env.BABEL_9_BREAKING) {
  VERSION = "8.0.0-rc.6";
} else {
  VERSION = "7.999999999";
}
```

**关键参数**：
- `BABEL_9_BREAKING` env 开关
- `999999999` 后缀——`7.999999999` 大于所有 7.x
- 一个二进制测试两个版本
- 下游 monorepo CI 矩阵化
- npm 解析时强制装 v8——绕过 7.x 范围

**最佳实践**：breaking 变更用 env 切换——一份代码两版；`999999999` 后缀——npm range 强制解析；下游 CI 矩阵化——单测覆盖两个版本。

---

## 第四段：实战范式

### 模式 16：140+ monorepo 包 + Yarn 4 workspaces

**问题场景**：babel 由 140+ 子包组成（`babel-plugin-*` / `babel-preset-*` / `babel-helper-*`），每个独立发版；用 npm + lerna 维护 140+ 软链性能差。

**解决方案**：Yarn 4.14.1（berry）workspaces + `packageManager` 字段固定版本 + `.yarnrc.yml` 配置：
```yaml
# package.json
{ "packageManager": "yarn@4.14.1", "workspaces": ["packages/*"] }
```

**关键参数**：
- 140+ 子包——`packages/babel-*`
- Yarn 4 berry——`packageManager` 字段固定
- workspaces 软链——`yarn install` 一次
- `scripts/postinstall.ts` 触发补丁
- `babel-release` 工具独立发版

**最佳实践**：大型 monorepo 用 Yarn 4 berry——性能 + 稳定；`packageManager` 字段固定——避免版本漂移；workspace 软链——避免重复安装。

---

### 模式 17：循环依赖用注释 + 行号兜底

**问题场景**：`packages/babel-traverse/src/index.ts:1` 用 `import "./path/context.ts"; // We have some cycles, this ensures correct order to avoid TDZ`——A import B，B import A，TS 编译出 TDZ。

**解决方案**：在 entry 显式 import 循环模块 + 注释说明顺序：
```ts
// packages/babel-traverse/src/index.ts
import "./path/context.ts"; // We have some cycles, this ensures correct order to avoid TDZ
```

**关键参数**：
- 注释 + 行号——`index.ts:1`
- 显式 import 触发加载顺序
- TDZ (Temporal Dead Zone) 防护
- 不优雅但有效
- 复刻时尽量避免——架构问题不是工程答案

**最佳实践**：循环依赖用显式 import + 注释兜底；注释挂行号——下任 maintainer 跳转；承认是 workaround——避免后人"优化"掉。

---

### 模式 18：12 万 parser fixtures 真实 runtime test

**问题场景**：parser 测试要覆盖 ES2015-2024 + TypeScript + Flow + JSX + JSX Fragment + 装饰器 + private fields——手写 case 不可能穷举。

**解决方案**：12 万 fixtures（`.js` / `.ts` / 期望 AST `.json`）跑 `babel-parser` + 真实 runtime 校验：
```ts
// jest 配置
testFixtures("packages/babel-parser/test/fixtures", { runMode: "parser" });
```

**关键参数**：
- 12 万 fixtures——行业最大
- 每个 fixture 配期望 AST JSON
- jest 自动化 diff
- 真实 runtime test——不是 mocked
- 维护成本大但准确度行业第一

**最佳实践**：parser 测试用 fixtures 集合——行业标准；期望 AST JSON 化——diff 直观；12 万规模是经验阈值——少 1 个量级覆盖不够。

---

### 模式 19：Gulpfile.ts 构建编排 + Makefile.source.ts 任务源

**问题场景**：babel 140+ 包 build / test / lint / release 任务跨 5+ workflow 文件——手维护一致性难。

**解决方案**：Gulpfile.ts 编排任务 + Makefile.source.ts 任务源 + CircleCI + GitHub Actions 5 workflow 矩阵：
```ts
// Gulpfile.ts
gulp.task("build", gulp.series("build-babel", "build-packages"));
// Makefile.source.ts
make build  // 等价于 yarn gulp build
```

**关键参数**：
- `Gulpfile.ts` 编排
- `Makefile.source.ts` 任务源
- CircleCI + 5 GitHub Actions workflow
- 任务名跨工具一致
- 5 workflow：ci / e2e-tests / issue-triage / release / pkg-pr-new

**最佳实践**：复杂构建用 Gulp 编排 + Make 入口；任务名跨工具一致——`build` / `test` 通用；CI 矩阵化——5 workflow 各管一面。

---

### 模式 20：plugin authoring 实战范式

**问题场景**：插件作者要写自定义转换（公司内部 DSL 转 JS / 自定义语法扩展），但 babel 7+ 插件 API 看似简单实则涉及 visitor / state / pre/post / inherits 等多面。

**解决方案**：用 `helper-plugin-utils` 简化 `declare()` 校验：
```ts
import { declare } from "@babel/helper-plugin-utils";
export default declare((api, opts) => {
  api.assertVersion(7);
  return {
    name: "my-plugin",
    visitor: { /* ... */ },
    pre(state) { /* 改写前 */ },
    post(state) { /* 改写后 */ },
    inherits: require("@babel/plugin-transform-classes"),
  };
});
```

**关键参数**：
- `declare()` 包装——版本断言 + options 校验
- `api.assertVersion(7)`——不兼容抛错
- `pre / post`——AST 改写前后钩子
- `inherits`——继承其他 plugin visitor
- `@babel/helper-plugin-utils` 是官方工具

**最佳实践**：自定义 plugin 用 `declare()` 包装——版本校验 + 类型化；`inherits` 复用社区 plugin——避免重写；`pre / post` 钩子在 visitor 之外——全局初始化/清理。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | github.com/babel/babel |
| 协议 | MIT |
| 总文件 | 28,011 |
| 主语言 | TypeScript + JavaScript |
| Star | 43k+ |
| 当前版本 | v8.0.0-rc.6 / v7.28.5 |
| 团队 | 4-8 名核心 + 数百贡献者 |
| 关键依赖 | Yarn 4 / Gulp / Jest 12 万 fixture / gen-sync |
| 包管理 | Yarn 4.14.1 berry + workspaces |
| 关键里程碑 | 6to5 → v6 → v7 plugin 命名空间 → v8 ESM breaking |
