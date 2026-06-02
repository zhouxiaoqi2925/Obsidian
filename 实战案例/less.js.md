# less.js - CSS 预处理器的工程范本

**GitHub**: less/less.js
**Star**: 17.1k+
**语言**: JavaScript (ESM)
**主题**: css-preprocessor、compiler、ast、visitor、frontend-tooling
**适用场景**: CSS 扩展语言、DSL 编译器学习、AST 多 pass 工程实践

---

## 一、基础范式

### 模式 1 · 单遍 Parser + AST 多 Pass Visitor

**问题场景**：传统编译器"lexer→parser→AST→optimize→codegen"5 阶段写死；增加一个 pass 要改主循环；浏览器场景下 1MB 的 .less 文件 lexer 生成 token 数组是巨大开销；DSL 经常要"加新 pass"。

**解决方案**：`lib/less/parser/parser.js` 顶部注释明确"a relatively straight-forward predictive parser. There is no tokenization/lexing stage"——输入分块（`chunks` + `j` + `currentPos`）单遍扫完直接构 AST；后续 `ImportVisitor` → `Eval` → `JoinSelectorVisitor` → `ExtendVisitor` → `MarkVisibleSelectorsVisitor` → `ToCSSVisitor` → `SourceMapBuilder` 各自独立的 Visitor 跑同一棵 AST。新加 pass = 写一个 Visitor 类 + 在 `transform-tree.js` 注册。

**关键参数**：
- 单遍 parser 不用 token
- chunks 三指针 4x 加速
- `Anonymous` 节点 fast-path
- `transform-tree.js` 调度
- `isPreEvalVisitor` / `isPreVisitor` 钩子

**最佳实践**：DSL 编译器要"加新 pass 不改旧代码"用单遍 parser + 多 Visitor；**比传统 5 阶段简单 5x**；适用任何"DSL 编译器 + 可扩展 transform"。

### 模式 2 · Visitor typeIndex 字典化

**问题场景**：35+ AST 节点类型，每次 visit 走 `if/else` 链或 `switch` 性能差；用 `instanceof` 又有继承问题。

**解决方案**：`lib/less/visitors/visitor.js` 一次性遍历 `tree` 注册表给每个节点类打 `typeIndex`（自增数字 ID）；`visit(node)` 用 `node.typeIndex` 作 O(1) 字典查找 `_visitInCache[typeIndex]`；`_hasIndexed` 单次性 guard 避免重复索引；`visitXxxIn` / `visitXxxOut` 是 enter/exit 钩子。

**关键参数**：
- `indexNodeTypes` 启动时遍历
- `typeIndex` 数字 ID
- `_visitInCache` / `_visitOutCache` 字典
- `_hasIndexed` 单次 guard
- enter/exit 钩子

**最佳实践**：库要做"多类型节点事件分发"用 `typeIndex` 字典 + 启动时索引；**比 `switch` 快 5-10x**；适用任何"事件分发 + 多种节点类型"。

### 模式 3 · 5 Pass 流水线架构

**问题场景**：DSL 编译器要把"解析 → import 解析 → 变量展开 → 选择器嵌套 → extend 重写 → CSS 输出 → sourcemap"7 步串起来，单一函数 5000 行难维护。

**解决方案**：`lib/less/transform-tree.js` 显式 5 阶段：`preEvalVisitors`（如 ImportVisitor）→ `root.eval(evalEnv)`（imperative method dispatch，递归 eval 子节点）→ `JoinSelectorVisitor` → `MarkVisibleSelectorsVisitor` → `ExtendVisitor` → `ToCSSVisitor`；`transform-tree.js` 第 44-99 行"两轮 visitor 注册"是核心魔法：plugin 在 `isPreEvalVisitor` 跑在 eval 前、`isPreVisitor` 排到队首、其他排到队尾。

**关键参数**：
- preEvalVisitors 分桶
- eval 阶段 imperative dispatch
- 5 个内置 visitor
- plugin 双轮注册
- unshift/push 排序

**最佳实践**：DSL 编译器要"plugin 注入 + 多 pass"用 `transform-tree.js` 双轮注册；**允许 plugin 动态修改 visitor 列表**是 plugin 体系能 work 的核心；适用任何"编译器 + 扩展点"。

### 模式 4 · 跨环境抽象层（Node + Browser）

**问题场景**：同一份编译核心要跑在 Node（用 `fs`）和浏览器（用 `XHR`）两种 runtime；硬写 `if (typeof window)` 污染核心。

**解决方案**：`lib/less/environment/abstract-file-manager.js` 定义 IO 接口（`loadFile` / `getPath` / `join` / `pathDiff`）；`lib/less-node/file-manager.js` 实现 fs 版；`lib/less-browser/file-manager.js` 实现 XHR 版；`createFromEnvironment(environment, [FileManager, UrlFileManager], version)` 工厂把 environment + fileManagers 注入核心；核心编译代码零 `if (isNode)`。

**关键参数**：
- AbstractFileManager 抽象类
- Node / Browser 双实现
- 工厂 `createFromEnvironment`
- dependency injection
- 核心零 runtime 判断

**最佳实践**：库要做"同一代码多 runtime"用抽象层 + 工厂注入；**比 `typeof window` 优雅 10x**；适用任何"跨 Node/Browser/Worker/Deno"。

### 模式 5 · 函数注册表 + 链式 inherit 模拟作用域

**问题场景**：DSL 函数要"全局函数（darken/lighten）+ ruleset 内 `@function` 局部函数 + 子作用域继承父作用域"；用 class 继承或 Map 嵌套都复杂。

**解决方案**：`lib/less/functions/function-registry.js` 36 行极简：`makeRegistry(base)` 返回 `{_data, add, get, inherit, create}`；`get(name)` 优先查自己再向上找 `base`，把"作用域"做成 prototype-chain 模式；ruleset 内 `@function: ...` 时 `inherit()` 拿父表，查不到 fallback 到父表；`create(base)` 给顶层做无 base 的根表。

**关键参数**：
- 36 行极简
- `get` 递归向上
- `inherit()` 子继承父
- `create(base)` 根表
- prototype-chain 模拟

**最佳实践**：库要做"作用域 + 函数注册"用 `inherit()` 链式；**比 class 继承省 50% 代码**；适用任何"配置中心 + 多租户 / 主题切换"。

---

## 二、扩展范式

### 模式 6 · `expect()` 统一 token/子 parser 入口

**问题场景**：递归下降 parser 写起来"调子 parser 函数 / 匹配终结符正则"两套写法割裂。

**解决方案**：`parser.js#expect(arg, msg)` 接受函数（子 parser，递归调用）或正则/字符串（终结符匹配）；`(arg instanceof Function) ? arg.call(parsers) : parserInput.$re(arg)` 一行统一入口；这是 PEG 解析器典型接口——`expect(function)` 走非终结符，`expect(re)` 走终结符；`parsers` 是 Parser 实例自身（call 后保留 this）。

**关键参数**：
- `expect(function)` 非终结符
- `expect(re)` 终结符
- `parserInput.$re`
- PEG 风格
- parsers.this 传递

**最佳实践**：递归下降 parser 用 `expect()` 统一函数/正则；**比写两套入口简单 2x**；适用任何"PEG / 递归下降 parser"。

### 模式 7 · `Anonymous` 节点 fast-path

**问题场景**：`1px solid #000` 这种纯字面量在解析时走完 dimension/color 完整 token 化是浪费；CSS 语法错（拼写错属性名）通常由浏览器兜底。

**解决方案**：Parser 检测"值不含变量/操作/动态引用"时整段当 `Anonymous` 字符串节点直接吞下，不解析内部 token；eval 阶段 `Anonymous` 节点 `eval()` 返回自身（identity）；代价：CSS 语法错误延迟到 eval/运行时才发现；收益：50% parse 时间节省。

**关键参数**：
- 无变量/操作/dynamic 判定
- `Anonymous` 节点
- eval identity
- 50% 性能提升
- 错误延迟发现

**最佳实践**：parser 要"快 path"用"无操作字面量当字符串"判定；**性能换错误延迟**；适用任何"DSL parser + 大量字面量"。

### 模式 8 · 5 种 Plugin 接口（Visitor/Function/Importer/PreProcessor/PostProcessor）

**问题场景**：DSL 工具需要 plugin 机制：自定义函数（darken）、自定义 import（去重）、自定义预处理（autoprefixer）……接口不统一 plugin 难写。

**解决方案**：`lib/less-plugin/` 体系定义 5 接口：① `install(less, pluginManager, functions)` 加自定义函数 ② `visitor` 数组加自定义 Visitor ③ `importers` 数组加自定义文件加载 ④ `preProcessor` 字符串预处理 ⑤ `postProcessor` CSS 字符串后处理；`PluginManager` 集中管理；`createFromEnvironment` 接受 `pluginManager` 选项。

**关键参数**：
- 5 类扩展点
- `PluginManager` 集中
- `install` 函数注册
- `visitor` 数组
- `importers` / pre / post

**最佳实践**：库要做"plugin 机制"按功能切 5 接口；**让用户 5 行写一个 plugin**；适用任何"工具库 + 生态扩展"。

### 模式 9 · 2 轮 Visitor 注册解决 plugin 时序

**问题场景**：plugin 体系里"plugin B 想在 plugin A 的 visitor 之后跑"——但 A 注册时 B 还没注册，引用不到；plugin 想在 eval 前/后插队。

**解决方案**：`transform-tree.js` 第 44-99 行 `for (let i = 0; i < 2; i++)`：第一轮把所有 visitor 注册到 `visitors` 列表 + `preEvalVisitors` 列表；第二轮发现"如果前一次已经跑过就不重复跑"；`isPreEvalVisitor` 跑在 eval 之前、`isPreVisitor` 用 `unshift` 排到队首、其他用 `push` 排到队尾；plugin 可在运行期动态添加 visitor。

**关键参数**：
- 2 轮 for 循环
- `isPreEvalVisitor` 时序
- `isPreVisitor` 队首
- 动态 visitor 列表
- `first()/get()` 迭代器

**最佳实践**：plugin 体系要"plugin 注册时序无关"用 2 轮注册；**解决 plugin A/B 互相依赖**；适用任何"plugin 框架 + 时序控制"。

### 模式 10 · callback / Promise 双模式 API

**问题场景**：Node 风格 API 早期用 callback，async/await 时代用 Promise。两种风格切换写两套包装累。

**解决方案**：`lib/less/render.js` 42 行极简：`render(input, options, callback)`；`if (typeof options === 'function')` 判定 callback 模式；不传 callback 时 `return new Promise(...)` 内调 `render.call(self, input, options, cb)`；用户既可 `less.render(src, cb)` 也可 `await less.render(src)`；`parse` 内部 try/catch 把 `LessError` 传到 `callback(err)` 或 `reject(err)`。

**关键参数**：
- 42 行极简
- `typeof options === 'function'` 判定
- callback / Promise 二选一
- `bind(api)` this 上下文
- `LessError` 错误统一

**最佳实践**：Node 库 API 要"老 callback + 新 async/await"双模式；**比写两套 wrapper 简单 5x**；适用任何"Node 库 + 双风格 API"。

---

## 三、进阶范式

### 模式 11 · `lessc` 手写 argv 解析（679 行）

**问题场景**：CLI 参数解析简单工具（minimist / yargs） 早期不流行；自己写可控；现在回头看是技术债。

**解决方案**：`bin/lessc` 第 1-10 行是 shebang + 引入 Node 入口；后 669 行是手写 argv 解析：`-` 前缀判断、`--flag` 长选项、`-x=value` 短选项带值、参数消费顺序、`--no-color` 否定语法、help 文本生成；`process.argv` 切片 + state machine；优点：完全可控、零依赖；缺点：679 行复杂度。

**关键参数**：
- 679 行手写
- 零依赖
- `-` / `--` 双格式
- `--no-X` 否定
- help 文本内置

**最佳实践**：CLI 工具要"早期 + 零依赖"手写 argv；**现代用 yargs 5 行代替**；适用任何"早期 CLI + 单 binary"。

### 模式 12 · `render.js` `this` 上下文假设（10 年技术债）

**问题场景**：`less/index.js` 末尾 `initial.parse = initial.parse.bind(api); initial.render = initial.render.bind(api);`——承认 "Some of the functions assume a `this` context of the API object, which causes it to fail when wrapped for ES6 imports. An assumed `this` should be removed in the future."

**解决方案**：历史问题用 `bind()` 兜底；ES6 import 拿到的是独立 `parse` 函数，缺 this 上下文；ESM 时代应该全部用显式参数传 API；`render.js` 内部 `if (!callback) return new Promise(...).bind(self, ...)` 显式自管理；这是 less.js 在仓库公开承认的"未来应该改"。

**关键参数**：
- 10 年技术债
- `bind(api)` 兜底
- ES6 import 不兼容
- 显式 this 应被替换
- 公开承认待重构

**最佳实践**：库设计阶段就避免隐式 `this` 上下文；**新项目从 day-1 显式参数**；适用任何"OOP 库 + 模块化"。

### 模式 13 · parser 注释即架构文档

**问题场景**：传统 ADR 写在 docs/，写完 3 个月就过期；新人读 parser.js 不知道"为什么这样写"。

**解决方案**：`parser.js` 顶部 13-44 行注释直接写"4x 加速""50% 加速"性能数据 + 原因（"Matching and slicing on a huge input is often cause of slowdowns"）；注释里直白"放弃 lexer 阶段，因为浏览器场景下不划算"；10 年后回头看这些数字就是项目史，比单独 ARCHITECTURE.md 不会腐烂。

**关键参数**：
- 顶部 13-44 行
- 4x / 50% 性能数据
- WHY 而非 WHAT
- 10 年不腐烂
- 比 ADR 实用

**最佳实践**：库要做"长期维护"在源码顶部写 WHY + 性能数据；**比单独 ADR 文件可靠 5x**；适用任何"10 年+ 开源项目"。

### 模式 14 · circular import 警告（datetime/duration 案例）

**问题场景**：`datetime.js` 顶部 `import Duration from "./duration.js"` + `duration.js` 顶部 `import DateTime from "./datetime.js"`——Node 解析时一方拿到未初始化 `undefined`；能跑通是因为两者只用对方 static factory 推迟到运行时 + ES module live binding 兜底。

**解决方案**：能跑靠 ES module live binding（import 是 binding 而非值）；**反模式警告**：新人改一行就崩；重构要先把循环依赖解掉（用第三个文件集中 mutual deps）；静态分析工具（madge / circular-dependency-scanner）可检测。

**关键参数**：
- circular import 警告
- live binding 兜底
- 推迟到运行时
- static factory 隔离
- 反模式案例

**最佳实践**：库设计阶段就避免循环 import；**如不可避免，调用都走 static factory 推迟**；适用任何"双向依赖的 module 设计"。

### 模式 15 · `Ruleset._lookups` lazy 缓存（简单但正确）

**问题场景**：`@variable` 变量在 ruleset 内查询，递归往上找父级；每次查询 O(深度)；ruleset 实际只查几次变量。

**解决方案**：`lib/less/tree/ruleset.js` 构造函数 `this._lookups = {}; this._variables = null; this._properties = null;` 第一次访问时构建缓存，后续 O(1) 字典查找；这是"启动慢一点、运行时快很多"的 memoization 简单范本；`Ruleset` 共 1067 行但核心是 4 个 lazy 缓存字段。

**关键参数**：
- `_lookups` 字典
- lazy 首次构建
- 后续 O(1)
- 简单 memoization
- Ruleset 1067 行

**最佳实践**：库要做"重复查询"用 lazy 缓存字段；**第一次慢、后续 O(1)**；适用任何"深度查找 + 多次查询"。

---

## 四、实战范式

### 模式 16 · smoke test 10 行验证 Less 环境

**问题场景**：新环境装好 less 后要快速验证编译 + sourcemap + @import 3 件套。

**解决方案**：10 行 smoke test：```bash
echo '@base: #f00; .a { color: @base; }' > /tmp/t.less
node packages/less/bin/lessc /tmp/t.less
# 期望输出: .a { color: #ff0000; }
# sourcemap:
node packages/less/bin/lessc --source-map /tmp/t.less /tmp/out.css
# 验证 .map 文件生成
``` 期望：编译成功 + 颜色替换 + sourcemap 文件可读。

**关键参数**：
- 10 行核心验证
- 变量替换
- @import 解析
- sourcemap 生成
- 1 分钟可跑完

**最佳实践**：新环境验证 DSL 工具用 10 行 smoke test；**比 dev server 5 分钟快 30x**；适用任何"Less 引入 + 升级回归"。

### 模式 17 · 测试资产即文档（Golden File）

**问题场景**：DSL 编译器测试难写——单元测试覆盖不到"输出 CSS 字符串对了"。

**解决方案**：`test-data/tests-unit/` 下每个文件夹一个特性（mixins/extend/import/...），每个 .less 配一个 .css 当 golden file；测试编译 .less 对比 .css；改 Parser 后 golden file diff 一眼看出"哪里回归"；比注释不会腐烂——注释可能错，golden file 错就测试 fail。

**关键参数**：
- 每个 .less + .css
- golden file diff
- 改 Parser 即时反馈
- 比注释可靠
- test-data 仓库

**最佳实践**：DSL 编译器测试用 golden file 配对；**比单元测试覆盖更全面**；适用任何"编译器 / 转换器"。

### 模式 18 · 插件 5 行 demo 模板

**问题场景**：想给 less 加一个 `darken-strong` 函数 plugin，不知道从哪入手。

**解决方案**：5 行 plugin 模板：```js
// my-plugin.js
module.exports = {
  install(less, pluginManager, functions) {
    functions.add('darken-strong', (color) => darken(color, 30));
  }
};
// 调用: less.render(src, { pluginManager: new less.PluginManager([myPlugin]) })
``` 期望：`darken-strong(#fff)` 输出 `#b3b3b3`。

**关键参数**：
- 5 行极简
- `install` 函数
- `functions.add` 注册
- PluginManager 注入
- 立即生效

**最佳实践**：DSL 工具 plugin 体系设计要"5 行写一个 plugin"；**降低扩展门槛 10x**；适用任何"工具 + 生态"。

### 模式 19 · vs Sass / PostCSS / Stylus 选型

**问题场景**：4 个候选（less / sass / postcss / stylus），按需选型。

**解决方案**：less 17k star + CSS 超集 + 浏览器原生 + 体积 250KB → 学习成本最低、Bootstrap 4 之前事实标准；sass 30k+ star + Dart 编译 + 功能最全 + 社区最大 → 新项目默认；stylus 11k star + 极简语法 → 灵活但学习曲线不一致；postcss 28k+ star + 插件架构 → 极致可组合 + 需自选插件；less 是"最低学习成本"，sass 是"功能完备"，postcss 是"灵活可组合"。

**关键参数**：
- less 17k CSS 超集
- sass 30k Dart 编译
- postcss 28k 插件
- stylus 11k 灵活
- 各有定位

**最佳实践**：CSS 预处理器选型按"学习成本 + 功能 + 体积"3 维度打矩阵；**新项目默认 sass**、**老项目留 less**、**极致灵活选 postcss**；适用任何"CSS 工具选型"。

### 模式 20 · 7 天复刻 mini-less

**问题场景**：学习用，想搭一个简化版 Less 理解 DSL 编译器核心。

**解决方案**：7 天分 5 步：① Day 1 AST 节点类（Ruleset / Declaration / Value）② Day 2 Parser 变量 + Mixin 基础 ③ Day 3 ToCSSVisitor 输出 CSS 字符串 ④ Day 4 @import 跨文件 + 环境抽象 ⑤ Day 5 Plugin 体系 5 接口 + 2 轮 Visitor 注册 + 单元测试。每天 200-500 行，Day 1 能跑空 Parser，Day 5 能跑"变量 + Mixin + @import"完整子集。

**关键参数**：
- Day 1-2 骨架 + AST
- Day 3 渲染输出
- Day 4 @import
- Day 5 插件 + 测试
- 7 天最小可用

**最佳实践**：复刻 Less 先求"最小可跑内核"再迭代，7 天只够做 80% 场景的简化版；**完整 typeIndex 缓存 + 5 Pass Visitor + 5 接口 plugin 需 1 个月+**；适用任何"DSL 编译器学习"。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\less.js\`
- **大小**: ~30MB
- **总文件**: 907（src 50+ + test 200+ + docs 100+）
- **核心文件**: `lib/less/parser/parser.js`（2693 行）、`lib/less/tree/ruleset.js`（1067 行）、`lib/less/visitors/visitor.js`（166 行）、`lib/less/transform-tree.js`（103 行）、`lib/less/render.js`（42 行）、`lib/less/functions/function-registry.js`（36 行）
- **主分支**: master
- **当前 commit**: gitHead 1df9072ee9
- **作者**: Alexis Sellier（cloudhead）+ Matthew Dean 等核心维护者
- **许可**: Apache-2.0
- **被采用**: Bootstrap 4 之前事实标准、几十万网站

## 一句话总结

less.js 用 JavaScript 把"DSL 编译器应有的形状"做出来：单遍 Parser + 5 Pass Visitor + 环境抽象 + Plugin 5 接口 + 顶部注释即架构文档，是学编译原理/前端工程化的优秀样本。
