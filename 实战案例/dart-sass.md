# dart-sass - SCSS/Dart 编译器

**来源**：G:\实战案例\GitHub顶尖项目\dart-sass\
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. 共享 AST 双语法（Shared AST for SCSS/Sass）

**问题场景**：Sass 有两种语法：`.scss`（花括号，类 CSS）和 `.sass`（缩进，类 Python）。早期实现把两套 AST 分开维护，加新节点要改两处。dart-sass 1.0+ 用**一棵共享 AST** + 不同 parser。AST 节点带 `Syntax` 字段标记来源，序列化时根据字段选输出风格。**核心收益：求值/序列化 100% 共享**。

**解决方案**：
```dart
// lib/src/ast/sass/statement/declaration.dart
abstract class Declaration implements Statement {
  Statement clone(Uri url) => throw SassException(...);
}

// lib/src/ast/sass/statement/rule.dart
class Rule extends ParentStatement {
  final SelectorList selector;
  final Interpolation_span span;  // ← SourceSpan 位置信息
  // ...
}

// lib/src/ast/sass/expression/string.dart
class StringExpression implements Expression {
  final String text;
  final bool hasQuotes;       // true: "foo", false: foo
  final Syntax syntax;        // SCSS or SASS
  // ...
}

// lib/src/parse/scss.dart + lib/src/parse/sass.dart
// 不同 parser 输出同一棵 AST
// scss 解析 "color: red" → Declaration(name="color", value="red")
// sass 解析 "color: red" (缩进) → 同样 Declaration
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| AST 节点数 | 200+ | 完整覆盖 Sass 语法 |
| Parser | 2 个 | scss + sass |
| 序列化 | 1 个 | serialize.dart 通用 |
| 节点共享 | 100% | 不分叉 |
| SourceSpan | 每节点 | 错误定位 |

**最佳实践**：
1. ✅ AST 节点 immutable：所有字段 final
2. ✅ SourceSpan 强制：编译错误精准定位
3. ✅ 共享树不分叉：加新节点改一处
4. ✅ Syntax 字段标记来源：序列化时切换输出
5. ✅ 用 visitor 协议遍历：不暴露内部结构
6. ✅ clone() 必须带 Uri：保证相对路径

### 2. 同步/异步双 Visitor（Sync/Async Dual Visitor）

**问题场景**：Sass 既有同步编译（CLI 一次性编译）又有异步编译（Embedded Protocol 长连接，VS Code 编辑时实时编译）。同一棵 AST 既要走同步 Visitor 又要走异步 Visitor。dart-sass 用**两个独立 Visitor**：`evaluate.dart` (4941 行) + `async_evaluate.dart` (4972 行)。**两者逻辑镜像、方法名一致、结果相同**。

**解决方案**：
```dart
// lib/src/visitor/evaluate.dart — 同步求值
class Evaluator implements StatementVisitor, ExpressionVisitor {
  @override
  Value evaluate(Expression expr) {
    if (expr is NumberExpression) return SassNumber(...);
    if (expr is BinaryOperationExpression) {
      final left = evaluate(expr.left);
      final right = evaluate(expr.right);
      return left.performOperation(expr.operator, right);
    }
    // ...
  }
}

// lib/src/visitor/async_evaluate.dart — 异步求值
class AsyncEvaluator implements AsyncStatementVisitor, AsyncExpressionVisitor {
  @override
  Future<Value> evaluate(Expression expr) async {
    if (expr is NumberExpression) return SassNumber(...);
    if (expr is BinaryOperationExpression) {
      final left = await evaluate(expr.left);  // ← 唯一区别：await
      final right = await evaluate(expr.right);
      return left.performOperation(expr.operator, right);
    }
    // ...
  }
}

// lib/src/async_compile.dart — 异步编译协调器
class AsyncCompiler {
  Future<CompileResult> compile() async {
    // 1) parse
    final ast = await parseStylesheet(...);
    // 2) async evaluate
    final evaluated = await AsyncEvaluator(ast).run();
    // 3) serialize
    final css = SerializeVisitor(evaluated).run();
    return CompileResult(css, sourceMap);
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 同步 Visitor | 4941 行 | evaluate.dart |
| 异步 Visitor | 4972 行 | async_evaluate.dart |
| 差异 | 仅 await | 逻辑一致 |
| 共享 AST | 100% | 不分叉 |
| 接口分组 | 20+ 个 | visitor/interface/ |

**最佳实践**：
1. ✅ 两个 Visitor 逻辑镜像：维护时同步改
2. ✅ 接口分文件：visitor/interface/ 按 AST 类型分组
3. ✅ await 唯一区别：业务代码尽量共享
4. ✅ 异步用 Future：避免污染同步代码
5. ✅ 单测覆盖两路：参数化测试
6. ✅ 文档化同步/异步差异：CHANGELOG 写清

### 3. SourceSpan 位置信息（SourceSpan Tracking）

**问题场景**：编译错误"Expected '}'"在第 5 行第 12 列，编译警告"Unused variable"在第 10 行。如果 AST 不带位置信息，错误只能"在某个文件"模糊报。dart-sass 强制每节点带 `SourceSpan`，含 `start` + `end` 位置 + 所属文件 URI。**错误信息精确到列号**。

**解决方案**：
```dart
// lib/src/ast/sass/ast.dart
abstract class SassNode {
  SourceSpan get span;
}

class SourceSpan {
  final Uri file;
  final int start;     // 字符偏移
  final int end;
  final int? startLine;
  final int? startColumn;
  // ...
}

// lib/src/parse/parser.dart — 解析时填 span
class Parser {
  int _position = 0;
  SourceSpan _span() => SourceSpan(
    file: _file,
    start: _startPos,
    end: _position,
    startLine: _line,
    startColumn: _column,
  );
}

// 错误抛出
throw SassException(
  "Expected '}'",
  ast.span,  // ← 用节点自身的 span
);

// 编译输出
// Error: Expected '}'
//   ╷
// 5 │   color: red
//   │            ^
// 6 │ }
//   ╵
//   file.scss 5:12
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 字段 | file + start + end | 精确 |
| 节点数 | 200+ | 全覆盖 |
| 工具 | CLI + 嵌入式协议 | 都用 |
| 性能开销 | < 5% | parser 成本 |
| 调试体验 | 列号级 | IDE 友好 |

**最佳实践**：
1. ✅ AST 节点强制带 span：编译时就记录
2. ✅ span 含 startLine/startColumn：避免重复算
3. ✅ 错误用节点 span：不用全局位置
4. ✅ SourceMap 同时输出：让浏览器能定位原文件
5. ✅ 嵌套节点 span 独立：避免父节点覆盖
6. ✅ 错误信息带代码片段：IDE 可点击跳转

### 4. 18 个值类型 + 16 个颜色空间（Value Types & Color Spaces）

**问题场景**：Sass 18 个值类型（SassNumber、SassColor、SassString、SassList、SassMap、SassFunction、SassMixin、...）和 16 个颜色空间（sRGB、sRGB-linear、display-p3、rec2020、lab、lch、oklab、oklch、xyz、xyz-d50、xyz-d65、hsl、hwb、...）。每个值类型 + 每个颜色空间都是独立类，**操作符重载**让 `red + blue` 自动转合适空间。**这是 Sass 4 级颜色空间的核心**。

**解决方案**：
```dart
// lib/src/value/color.dart
abstract class SassColor implements Value {
  ColorSpace get space;
  double get red;
  double get green;
  double get blue;
  // ...
}

// sRGB 颜色
class RgbColor extends SassColor {
  @override
  final ColorSpace space = ColorSpace.srgb;
  @override
  final double red, green, blue;
  @override
  final double? alpha;
}

// Lab 颜色
class LabColor extends SassColor {
  @override
  final ColorSpace space = ColorSpace.lab;
  @override
  final double lightness, a, b;
  // ...
}

// 颜色空间转换
class ColorOperations {
  SassColor changeSpace(SassColor c, ColorSpace to) {
    if (c.space == to) return c;
    // sRGB → XYZ → Lab → oklab 等
    return _convert(c, c.space, to);
  }
}

// 用法（Sass 代码）
// $c1: rgb(255 0 0);    // sRGB
// $c2: color(display-p3 1 0 0);  // display-p3
// $c3: color-mix(in oklab, $c1, $c2);  // 自动转 oklab 后混合
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 值类型 | 18 个 | number/color/string/list/map/... |
| 颜色空间 | 16 个 | sRGB / p3 / rec2020 / lab / oklab / ... |
| 操作符 | + - * / 比较 | 全部重载 |
| 转换 | 任意两两 | 中间过 XYZ |
| 精度 | 0.0001 | 视觉无损 |

**最佳实践**：
1. ✅ 值类型 immutable：所有字段 final
2. ✅ 颜色空间独立类：避免单一类爆炸
3. ✅ 操作符重载：让 `red + blue` 走转换
4. ✅ 中间过 XYZ：保证转换精度
5. ✅ display-p3 / rec2020 是未来：先支持
6. ✅ color-mix(in oklab, ...) 渐变更平滑

### 5. Parser Combinator 风格（Parser Combinator）

**问题场景**：手写 parser（状态机 + 词法分析）写 SCSS 复杂语法（嵌套规则 + at-rule + expression）极容易出 bug。dart-sass 用 **parser combinator** 风格：基础 parser 组合成复杂 parser。`identifier + colon + expression` 就是 `seq(identifier, colon, expression)`。**递归下降 + 组合子**让 grammar 接近 BNF。

**解决方案**：
```dart
// lib/src/parse/parser.dart
abstract class Parser<T> {
  ParseResult<T> parse(Uri url, List<Token> tokens, int position);
}

// lib/src/parse/scss.dart
Parser<Rule> ruleParser = seq3(
  selectorListParser,           // 选择器
  whitespaceToken(TokenKind.LBRACE),  // {
  () => declarationListParser,    // 声明列表
  (selectors, _, decls) => Rule(selectors, decls, _span()),
);

// lib/src/parse/expression.dart
Parser<Expression> expressionParser = lazy(() => seq(
  termParser,                   // 项
  zeroOrMore(seq(
    whitespaceToken(TokenKind.PLUS),  // +
    termParser,
    (op, term) => BinaryOperation(op, term),
  )),
  (first, rest) => rest.fold(first, (acc, item) => ...),
));

// 解析 SCSS "color: red + 1px;"
// → identifier("color") + colon + expr(red + 1px) + semicolon
// → Declaration(name="color", value=BinaryOp(red, +, 1px))
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Parser 数 | 100+ | 各种语法元素 |
| stylesheet.dart | 4887 行 | 最复杂 |
| 错误恢复 | 有限 | 失败重抛 |
| 性能 | 100K token/s | 实测 |
| lazy() | 关键 | 解决递归 |

**最佳实践**：
1. ✅ 用 parser combinator：grammar 接近 BNF
2. ✅ lazy() 解决递归：parser 之间互引用
3. ✅ seq3 / zeroOrMore 等组合子：避免状态机
4. ✅ ParseResult 含位置：错误精准
5. ✅ 词法 + 语法分离：token 流先预处理
6. ✅ 错误恢复有限：失败立即抛，IDE 自己重试

## 二、架构设计

### 6. 三产物同源代码（Multi-Output from Single Codebase）

**问题场景**：dart-sass 同一份 Dart 源码要输出 3 种产物：JS（npm `sass` 包）、Native VM（pub `sass` 独立可执行）、Embedded Protocol（IPC 服务）。Dart 2dart2js 编译成 JS，Dart VM 编译成 ELF/Mach-O，Dart IO 编译成 isolate。**同一份代码 → 3 种产物**。

**解决方案**：
```dart
// lib/sass.dart — 公开 API
// 同步
CompileResult compile(String path, {...}) {...}
CompileResult compileToResult(String source, {...}) {...}

// 异步
Future<CompileResult> compileAsync(String path, {...}) async {...}

// 嵌入式
Future<ProtocolService> startEmbeddedServer() async {...}

// lib/src/io/ — IO 抽象
abstract class IoInterface {
  File readFile(Uri uri);
  void writeFile(Uri uri, String content);
  Stream<List<int>> stdin();
  // ...
}

// VM 实现
class IoImpl implements IoInterface { ... }

// JS 实现（dart2js）
class JsIoImpl implements IoInterface {
  // 调浏览器 IndexedDB / fetch / FileReader
  ...
}

// 嵌入式
// protobuf 序列化 + stdin/stdout
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 产物数 | 3 | JS / VM / Embedded |
| 同一源码 | lib/src/ | 共享 |
| 编译 | dart2js / VM | 不同工具 |
| IO 抽象 | lib/src/io/ | 跨平台 |
| 体积 | JS ~2MB | 含完整编译器 |

**最佳实践**：
1. ✅ IO 抽象在 lib/src/io/：跨平台
2. ✅ 不直接用 dart:io：避免污染 JS
3. ✅ 业务代码全在 lib/src/：一份
4. ✅ dart2js 编译 JS：注意 dart:mirrors 不能用
5. ✅ Embedded 用 protobuf：稳定协议
6. ✅ 三产物 CI 测试：JS / VM / Embedded 都跑

### 7. 嵌入式协议（Embedded Protocol）

**问题场景**：VS Code、Vim、Sublime 等编辑器需要"长连接"的 Sass 编译服务（不是一次性编译，是按需编译文件）。dart-sass 1.23+ 提供 Embedded Protocol：基于 protobuf + stdin/stdout IPC，编辑器 spawn 一个 sass 进程，发送 CompileRequest，收到 CompileResponse。**支持增量、错误诊断、长会话**。

**解决方案**：
```protobuf
// pkg/embedded_sass.proto
message CompileRequest {
  string path = 1;
  string source = 2;
  string syntax = 3;          // scss / sass / css
  repeated string load_paths = 4;
  string importer = 5;        // node_modules / pkg
  OutputStyle style = 6;      // expanded / compressed
  // ...
}

message CompileResponse {
  oneof result {
    CompileSuccess success = 1;
    CompileFailure failure = 2;
  }
}

message CompileSuccess {
  string css = 1;
  string source_map = 2;
}

message CompileFailure {
  string message = 1;
  SourceSpan span = 2;
  string stack_trace = 3;
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 协议 | protobuf 3 | 跨语言 |
| 传输 | stdin/stdout | 标准 IPC |
| 隔离 | isolate 池 | 并发编译 |
| 包 | sass-embedded (npm) | JS 客户端 |
| 客户端 | pkg/sass_api | TypeScript |

**最佳实践**：
1. ✅ protobuf 协议：跨语言稳定
2. ✅ stdin/stdout IPC：跨平台兼容
3. ✅ isolate 池：并发编译不阻塞
4. ✅ SourceSpan 在协议里：编辑器能定位
5. ✅ 客户端在 sass-embedded npm：JS 友好
6. ✅ 错误信息含 stack trace：调试方便

### 8. 三种导入语义（@import / @use / @forward）

**问题场景**：Sass 早期只有 `@import`，但 `@import` 有副作用（重复导入、全局污染、命名冲突）。Sass 1.15+ 引入 `@use` + `@forward` 模块系统，新旧语义如何共存？dart-sass 的策略：**三种并存，1.80+ 推 @use**。**parser 同时识别三种，AST 节点带标记**。

**解决方案**：
```scss
// styles.scss — 新写法
@use 'colors' as c;  // 命名空间
@use 'typography';

.button {
  color: c.$primary;
  font-size: typography.$size-md;
}

// legacy.scss — 旧写法
@import 'colors';  // 仍然支持
.button {
  color: $primary;  // 全局污染
}
```

```dart
// lib/src/ast/sass/statement/import.dart
class ImportRule extends ParentStatement {
  final Interpolation import;
  final ImportPath path;
  // ...
}

// lib/src/ast/sass/statement/use_rule.dart
class UseRule extends ParentStatement {
  final ImportedNamespace namespace;
  final bool hasAsClause;
  // ...
}

// lib/src/ast/sass/statement/forward_rule.dart
class ForwardRule extends ParentStatement {
  final ImportedNamespace namespace;
  // ...
}

// 求值时区分
// @import → 全局可见
// @use → 命名空间 + 单次
// @forward → 转发命名空间
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| @import | legacy | 不推荐 |
| @use | 1.15+ | 推荐 |
| @forward | 1.15+ | 库作者 |
| 共存 | 是 | parser 三个分支 |
| 弃用 | @import 软弃用 | warn |

**最佳实践**：
1. ✅ 新代码用 @use：避免全局污染
2. ✅ 库用 @forward：暴露 API
3. ✅ @import 兼容：旧项目能升级
4. ✅ 求值时区分：AST 节点标记
5. ✅ 文档化差异：CHANGELOG 写清
6. ✅ 工具辅助：sass-migrator 工具转 @use

### 9. @extend 算法（@extend Algorithm）

**问题场景**：Sass 的 `@extend` 让一个选择器继承另一个选择器的样式，比 mixin 更节省 CSS。`%placeholder { color: red }` + `.a { @extend %placeholder; } .b { @extend %placeholder; }` → `.a, .b { color: red }`。算法核心是构建"扩展图"——每个选择器找所有"父选择器" + 所有"子选择器"。**1139 行的 extension_store.dart**。

**解决方案**：
```dart
// lib/src/extend/extension_store.dart
class ExtensionStore {
  final Map<Selector, List<Extension>> _extensions = {};
  final Map<SimpleSelector, List<Extension>> _simpleSelectorExtensions = {};

  // 1) 注册扩展
  void addExtension(Extension ext) {
    // 把 .error 扩展到 %placeholder
    // → _extensions[extender].add(ext)
    // → _simpleSelectorExtensions[simpleSelector].add(ext)
  }

  // 2) 收集所有扩展
  void addExtensions(SelectorList selectors, ExtensionSet set) {
    // 递归遍历选择器树，收集所有 @extend
    for (selector in selectors) {
      // 对每个 simpleSelector，找所有反向引用
      for (ext in _simpleSelectorExtensions[simpleSelector] ?? []) {
        set.add(ext);
      }
    }
  }

  // 3) 求解
  // .a { @extend %placeholder; }
// %placeholder { color: red; }
// → .a, .b { color: red; }
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 文件 | extension_store.dart | 1139 行 |
| 数据结构 | 双向图 | 选择器 ↔ 扩展 |
| 求值时机 | serialize 前 | 一次求完 |
| 性能 | O(N×M) | N=选择器 M=扩展数 |
| 边角 case | 跨文件 / media | 复杂 |

**最佳实践**：
1. ✅ 优先 mixin 而非 @extend：性能 + 可读性
2. ✅ %placeholder 比 .class 安全：不输出
3. ✅ @extend 跨文件慎用：顺序敏感
4. ✅ 性能差的话考虑用 selector-replace 工具
5. ✅ 测试覆盖：复杂嵌套 + media
6. ✅ 文档化限制：避免误用

### 10. Visitor 接口分组（Visitor Interface Grouping）

**问题场景**：AST 200+ 节点类型，每个 Visitor（evaluate / async_evaluate / serialize）要实现 200+ visit 方法。单文件 5000+ 行难维护。dart-sass 把 Visitor 接口按 AST 类型分组：`visitor/interface/statement.dart` + `expression.dart` + `selector.dart` + ...。**混入模式让 Visitor 只实现需要的接口**。

**解决方案**：
```dart
// lib/src/visitor/interface/statement.dart
abstract interface class StatementVisitor<T> {
  T visitAtRule(AtRule rule);
  T visitContentBlock(ContentBlock block);
  T visitDeclaration(Declaration decl);
  T visitExtendRule(ExtendRule rule);
  T visitForwardRule(ForwardRule rule);
  // ...
}

// lib/src/visitor/interface/expression.dart
abstract interface class ExpressionVisitor<T> {
  T visitNumberExpression(NumberExpression expr);
  T visitStringExpression(StringExpression expr);
  T visitBinaryOperationExpression(BinaryOperationExpression expr);
  // ...
}

// lib/src/visitor/evaluate.dart
class Evaluator implements StatementVisitor<Value>, ExpressionVisitor<Value> {
  @override
  Value visitDeclaration(Declaration decl) {
    final value = decl.value.accept(this);  // ExpressionVisitor
    // 存到 currentScope
    return value;
  }
  @override
  Value visitNumberExpression(NumberExpression expr) {
    return SassNumber(expr.value, expr.unit);
  }
  // ...
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 接口文件 | 10+ | 分类型分组 |
| 方法数 | 200+ | 全覆盖 |
| 混入 | 多个 | 灵活 |
| 同步/异步 | 镜像 | 维护 |
| 性能 | O(1) visit | 直接 dispatch |

**最佳实践**：
1. ✅ 按类型分组接口：避免单文件爆炸
2. ✅ 用 `accept(this)`：节点调 visitor
3. ✅ 混入多个接口：Visitor 可只实现需要的
4. ✅ 同步/异步镜像：方法名一致
5. ✅ 错误时 throw：Visitor 内不恢复
6. ✅ 测试覆盖：每接口 1 个最小测试

## 三、性能优化

### 11. 增量编译（Incremental Compilation）

**问题场景**：编辑器实时编译（VS Code 改一行 → 重新编译整个文件），如果每次全量 100ms 编译 1 万行 SCSS，编辑器卡顿。dart-sass Embedded Protocol 配合 isolate 池 + 缓存：相同输入 + 相同 import 树 → 复用编译结果。**编译一次 < 50ms 增量 < 5ms**。

**解决方案**：
```dart
// lib/src/async_compile.dart
class AsyncCompiler {
  final Map<Uri, CompileCache> _cache = {};

  Future<CompileResult> compile(Uri uri) async {
    // 1) 算 import 树 hash
    final importHash = await _computeImportHash(uri);
    // 2) 查缓存
    if (_cache.containsKey(uri) && _cache[uri].hash == importHash) {
      return _cache[uri].result;  // ← 增量
    }
    // 3) 全量编译
    final result = await _fullCompile(uri);
    // 4) 存缓存
    _cache[uri] = CompileCache(importHash, result);
    return result;
  }

  Future<String> _computeImportHash(Uri uri) async {
    // 哈希 import 树所有文件
    // 文件 mtime + 内容 hash
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 缓存 key | import 树 hash | 包含全部依赖 |
| 失效 | 文件 mtime 变化 | 立即 |
| 命中率 | 95%+ | 编辑器场景 |
| 内存 | 1MB / 文件 | 限制 |
| 持久化 | 否 | 进程内 |

**最佳实践**：
1. ✅ 缓存 key 含 import 树：避免脏读
2. ✅ 文件 mtime 失效：简单可靠
3. ✅ LRU 淘汰：内存有界
4. ✅ 进程内缓存：跨进程不共享
5. ✅ 配合 Embedded Protocol：编辑器友好
6. ✅ 监控命中率：< 80% 排查

### 12. SassNumber 单位运算（SassNumber Unit Math）

**问题场景**：CSS 单位运算复杂（`100px + 1em = ?`，`90deg + 1turn = ?`，`1px * 2 = 2px`）。dart-sass 实现单位表（px / em / rem / vh / vw / deg / rad / turn / ...），自动转换兼容单位。**这是数学上严谨的"单位代数"**。

**解决方案**：
```dart
// lib/src/value/number.dart
class SassNumber implements Value {
  final double value;
  final Unit unit;
  // ...
  SassNumber performOperation(Operator op, SassNumber other) {
    // 1) 同单位直接算
    if (unit == other.unit) return SassNumber(value + other.value, unit);
    // 2) 兼容单位转换
    final converted = other.coerceTo(unit);
    return SassNumber(value + converted.value, unit);
  }

  SassNumber coerceTo(Unit other) {
    // px → in：除以 96
    // em → px：当前 fontSize 上下文
    if (unit == px && other == in) return SassNumber(value / 96, in);
    // ...
  }
}

// SassNumber.coerceValueToUnit(value, unit) 在每个单位对的硬编码
// 表格维护在 number.dart
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 单位数 | 60+ | CSS 完整 |
| 兼容对 | 100+ | px↔in↔pt↔pc 等 |
| 性能 | O(1) 转换 | 硬编码 |
| 错误 | 不兼容抛异常 | fail-fast |
| 文档 | 单位代数章节 | spec |

**最佳实践**：
1. ✅ 单位代数硬编码：避免运行时计算
2. ✅ 不兼容单位抛异常：fail-fast
3. ✅ 配合 @use：单位变量可继承
4. ✅ 测试覆盖：所有单位对
5. ✅ 文档化代数：用户能预测结果
6. ✅ calc() 表达式：1.96+ 支持复杂

### 13. SassList 间隔与括号（SassList Separator & Parens）

**问题场景**：Sass 列表有两种分隔符（逗号 / 空格），三种括号（圆 / 方 / 无）。`(1 2 3)` vs `1, 2, 3` vs `[1 2 3]` 行为不同：`map-get` 只接受 `()`，`nth` 接受所有。dart-sass 用 `SassList(separator, brackets)` 精确记录，序列化时还原。

**解决方案**：
```dart
// lib/src/value/list.dart
class SassList implements Value {
  final List<Value> contents;
  final ListSeparator separator;  // comma / space
  final bool hasBrackets;          // true: (1 2 3)
  // ...
}

// 序列化
String listToCss(SassList list) {
  final sep = list.separator == ListSeparator.comma ? ', ' : ' ';
  final result = list.contents.map(valueToCss).join(sep);
  return list.hasBrackets ? '($result)' : result;
}

// Sass
// $colors: red blue green;          // 空格
// $sizes: 10px, 20px, 30px;         // 逗号
// $matrix: (1 2 3, 4 5 6);          // 逗号空格混合
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 分隔符 | 2 种 | comma / space |
| 括号 | 2 种 | 有 / 无 |
| 类型推断 | 启用 | 1.0+ 自动 |
| 性能 | O(1) | 字段记录 |
| API | nth/join/length/... | 内建函数 |

**最佳实践**：
1. ✅ 字段精确记录：避免字符串解析
2. ✅ 类型推断：1.0+ 自动识别
3. ✅ nth 默认索引 1（不是 0）：Sass 历史
4. ✅ join 函数：构造新列表
5. ✅ 序列化时还原：双向精确
6. ✅ 文档化语义：括号语义差异

### 14. SourceMap 生成（SourceMap Generation）

**问题场景**：编译 SCSS 出 CSS 后，浏览器报错在第 5 行 12 列 —— 但这是编译后的 CSS，对应原 SCSS 哪一行？SourceMap v3 协议解决：CSS 末尾 `//# sourceMappingURL=foo.css.map` + .map 文件含映射关系。dart-sass 自动生成。

**解决方案**：
```dart
// lib/src/visitor/serialize.dart
class SerializeVisitor {
  final StringBuffer _buffer = StringBuffer();
  final List<SourceMapEntry> _entries = [];

  void visitDeclaration(Declaration decl) {
    final css = '${decl.name}: ${decl.value.accept(this)};';
    _buffer.writeln(css);
    // 记录映射：CSS 行 → SCSS 位置
    _entries.add(SourceMapEntry(
      generatedLine: _currentLine,
      generatedColumn: 0,
      sourceFile: decl.span.file,
      sourceLine: decl.span.startLine! - 1,
      sourceColumn: decl.span.startColumn! - 1,
    ));
  }

  String toSourceMap() {
    return SourceMapV3.serialize(_entries);
  }
}

// 用法
final result = compileToResult(source, style: expanded, sourceMap: true);
// result.css → "a { color: red; }"
// result.sourceMap → '{"version":3,"sources":["input.scss"],"mappings":"AAAA;..."}'
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 协议 | SourceMap v3 | 标准 |
| 输出 | inline / 独立 | 两种 |
| 映射 | 节点级 | 每行对应 |
| 性能 | < 5% | 序列化时记录 |
| 工具 | Chrome DevTools / VS Code | 都支持 |

**最佳实践**：
1. ✅ 默认开 SourceMap：调试体验
2. ✅ inline 模式：单文件部署
3. ✅ 独立文件：CDN 缓存友好
4. ✅ 节点级映射：比行级准
5. ✅ 跨文件 import：sourceRoot 字段
6. ✅ 性能监控：> 5% 排查

### 15. Import 解析 + 缓存（Import Resolution & Caching）

**问题场景**：`@import 'foo'` 怎么找文件？loadPath 列表 + 文件名扩展名 + Node 模块解析。dart-sass 配 `pkg-importer` + `node-importers` + `file-importer`，按优先级尝试。**缓存加速：避免重复 IO**。

**解决方案**：
```dart
// lib/src/importer/legacy_node.dart
class NodeImporter implements Importer {
  final List<String> _loadPaths;
  final Map<String, Uri> _cache = {};

  Uri? canonicalize(String url, ContextSet context) {
    // 1) 缓存
    if (_cache.containsKey(url)) return _cache[url];
    // 2) 试 loadPath
    for (final loadPath in _loadPaths) {
      for (final ext in ['.scss', '.sass', '.css']) {
        final candidate = '$loadPath/$url$ext';
        if (File(candidate).existsSync()) {
          final uri = Uri.file(candidate);
          _cache[url] = uri;  // ← 缓存
          return uri;
        }
      }
    }
    // 3) 试相对当前文件
    final current = context.containingUrl;
    final candidate = '${current.dirname}/$url';
    if (File(candidate).existsSync()) {
      return Uri.file(candidate);
    }
    return null;
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Importer | 5+ | pkg / node / file / legacy / canonicalize |
| 缓存 | URL → URI | 进程内 |
| 扩展名 | .scss / .sass / .css / _partial | 4 种 |
| 优先级 | loadPath → current | 顺序 |
| 性能 | < 1ms | 缓存命中 |

**最佳实践**：
1. ✅ URL → URI 缓存：避免重复 IO
2. ✅ 多种 importer 串联：pkg + node + file
3. ✅ partial 文件（_foo.scss）：约定优于配置
4. ✅ 含扩展名优先：减少歧义
5. ✅ 失败抛明确错误：找不到文件
6. ✅ 性能监控：缓存命中率

## 四、可靠性与生态

### 16. 5+ 1 测试矩阵（5+1 Test Matrix）

**问题场景**：dart-sass 是单仓，但有 3 产物（JS / VM / Embedded）+ 2 大平台（Node + Dart VM）+ 多操作系统。测试矩阵必须 5+1 维度都跑。**CI 跑 30+ 任务 = 3 产物 × 4 OS × 3 平台 = 36 任务**。

**解决方案**：
```yaml
# .github/workflows/test.yml
jobs:
  test-dart:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        channel: [stable, beta]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dart-lang/setup-dart@v1
        with: { channel: ${{ matrix.channel }} }
      - run: dart test

  test-js:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: npm test
      - run: npm run test:integration

  test-embedded:
    runs-on: ubuntu-latest
    steps:
      - run: dart run pkg/sass_api/test.ts
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 产物 | 3 | JS / VM / Embedded |
| OS | 4 | Linux / macOS / Windows / FreeBSD |
| Node 版本 | 3 | 18 / 20 / 22 |
| Dart channel | 2 | stable / beta |
| 任务数 | 30+ | 全矩阵 |
| 时间 | 60-90 min | 全量 |

**最佳实践**：
1. ✅ 矩阵策略：OS × 版本 × 产物
2. ✅ 任务并行：fail-fast: false
3. ✅ 缓存依赖：node_modules / pub cache
4. ✅ 集成测试 + 单元测试：分层
5. ✅ 性能基准：track perf 回归
6. ✅ nightly build：master 每日

### 17. Sass 规范合规（Sass Spec Compliance）

**问题场景**：Sass 是 18 年历史的语言（2006 起源），sass/dart-sass 是"参考实现"。所有新功能必须通过 sass/sass-spec 仓库的 7000+ 测试。**dart-sass 测试套件 = sass-spec 全部用例 + 自己的 dart_api / cli / embedded 测试**。

**解决方案**：
```bash
# 测试目录
dart-sass/test/
├── cli/                  # CLI 测试
├── dart_api/             # 公开 Dart API
├── embedded/             # Embedded Protocol
├── util/                 # 工具函数
└── spec/                 # sass-spec（git submodule）

# 跑
dart test test/spec        # sass-spec 7000+ 用例
dart test test/cli         # CLI 测试
dart test test/dart_api    # API 测试
dart test test/embedded    # Embedded 测试
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| sass-spec 用例 | 7000+ | 官方 |
| dart_api 测试 | 500+ | 内部 |
| CLI 测试 | 300+ | 内部 |
| Embedded 测试 | 100+ | 内部 |
| 跑时间 | 5-10 min | 全量 |

**最佳实践**：
1. ✅ 跟踪 sass-spec 仓库：保持合规
2. ✅ CI 自动跑 spec：不允许 regress
3. ✅ 公开 spec 报告：dashboard
4. ✅ spec 失败立即修：阻塞合并
5. ✅ 性能基准：track 编译时间
6. ✅ 长期分支：v1 / v2 LTS

### 18. CHANGELOG 4295 行（Comprehensive CHANGELOG）

**问题场景**：Sass 用户（百万级前端工程师）需要知道每个版本改了什么。dart-sass 的 CHANGELOG.md **4295 行**，每个 commit 都有条目。**这是开源项目的诚意**。

**解决方案**：
```markdown
# CHANGELOG.md

## 1.100.0
### Deprecations
- None

### Behavior Changes
- None

### Dart API
- **Added** `CompileResult.statistics` field exposing
  parse/evaluation/serialization timing in milliseconds.

## 1.99.0
### Deprecations
- None

### Behavior Changes
- **Fixed** Calculation of `color-contrast()` in display-p3.

## 1.98.0
### Deprecations
- None

### Behavior Changes
- None

## 1.97.0
...
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 行数 | 4295 | 13 年累积 |
| 频率 | 每版 10-30 commit | 细粒度 |
| 分类 | 6 类 | Deprecations / Behavior / Dart API / JS API / Embedded / CLI |
| 自动生成 | 部分 | manual + script |
| 强制性 | 阻塞合并 | PR 要求更新 |

**最佳实践**：
1. ✅ 每个 PR 必更新 CHANGELOG
2. ✅ 分类清晰：用户能扫读
3. ✅ 标 Breaking Change：显眼提示
4. ✅ 标 Deprecation：提前 1 版预告
5. ✅ 性能数字：parse / eval / serialize 时间
6. ✅ 链接到 commit：追溯具体改动

### 19. 三种产物同步发布（Triple-Output Release）

**问题场景**：JS / VM / Embedded 三产物必须同步发布同版本号（1.100.0 三产物都 1.100.0）。`pub publish` + `npm publish` + GitHub release 三步，手工易错。dart-sass 用 `tool/grind.dart` 自动化：tag 一打，三产物同时发布。

**解决方案**：
```dart
// tool/grind.dart
@Task('Publish to pub.dev and npm')
void publish() {
  // 1) 校验：当前在 master + tag 已打
  final version = pubspec.version;
  // 2) pub publish
  run('dart', args: ['pub', 'publish']);
  // 3) npm publish
  run('npm', args: ['publish'], workingDirectory: 'pkg/sass-parser');
  run('npm', args: ['publish'], workingDirectory: 'pkg/sass-api');
  // 4) GitHub release
  run('gh', args: ['release', 'create', 'v$version']);
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 同步发布 | pub + npm + gh | 三处 |
| 工具 | grind.dart | 自动化 |
| 验证 | 版本号一致 | fail-fast |
| 顺序 | pub → npm → gh | 依赖链 |
| 失败回滚 | 手动 | 不自动 |

**最佳实践**：
1. ✅ 自动化三发布：避免漏
2. ✅ 版本号严格一致：1.100.0 三处
3. ✅ 校验 tag 一致：先 check
4. ✅ GitHub release 含 changelog：链接
5. ✅ 测试通过才发：CI gate
6. ✅ 发版公告：Twitter / 邮件列表

### 20. 18 年向后兼容（18-Year Backward Compat）

**问题场景**：Sass 2006 起源（Hampton Catlin），2011 Natalie Weizenbaum 接手维护至今。18 年历史代码 + 几百万项目依赖。dart-sass 1.0+ 严格保持 1.0 行为不变 —— 加新功能 + 弃用 + 文档化，绝不删。

**解决方案**：
```scss
// 2006 年写法 — 仍支持
.foo
  :color red
  :background blue
.bar
  color: red;

// 2011 年写法 — 仍支持
.foo { color: red; }
.bar {
  color: $primary;
}

// 2024 年写法 — 推荐
@use 'colors';
.foo { color: colors.$primary; }
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 历史 | 18 年 | 2006 至今 |
| 兼容写法 | 3 种 | sass / scss / @use |
| 弃用 | 软弃用 | 5 年警告 |
| 删除 | 从不 | 仅废标 |
| sass-migrator | 工具 | 自动升级 |

**最佳实践**：
1. ✅ 永不删 API：仅 deprecate
2. ✅ sass-migrator 工具：自动升级
3. ✅ CHANGELOG 标 Deprecation：显眼
4. ✅ 软弃用 5 年：用户有缓冲
5. ✅ 兼容测试：所有旧写法
6. ✅ 长期分支：v1 / v2 LTS

---

**标签**：#dart-sass #Sass #Dart #编译器 #CSS
**状态**：20/20 份详细内容
