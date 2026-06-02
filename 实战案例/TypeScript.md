# TypeScript - 类型编译器

**来源**：GitHub microsoft/TypeScript (100k+ stars)
**创建时间**：2026-06-02

---

## 一、编译管道核心（Compilation Pipeline）

### 1. 5 段式编译管道（Scanner → Parser → Binder → Checker → Emitter）

**问题场景**：编译器的代码规模大、阶段多、依赖复杂。TS 用 5 段式管道让**每段独立可测、独立可缓存、独立可复用**——tsserver（IDE）跟 tsc（CLI）共享 95% 代码。

**解决方案**：
```ts
// src/compiler/compiler.ts 入口
export function compile(input: string, options: CompilerOptions): EmitResult {
    // 1. Scanner: source code → Tokens
    const scanner = createScanner(options.target, /*...*/);

    // 2. Parser: Tokens → AST (SourceFile)
    const sourceFile = createSourceFile('input.ts', input, options.target, /*...*/);

    // 3. Binder: SourceFile → 含 Symbols 的 SourceFile
    bindSourceFile(sourceFile, options);

    // 4. Checker: 含 Symbol 的 AST → 类型错误
    const checker = createTypeChecker(/*...*/);
    const diagnostics = checker.getDiagnostics(sourceFile);

    // 5. Emitter: SourceFile → JS
    return emitFiles(
        checker, sourceFile, options,
        /*emitOnlyDtsFiles*/ false,
        /*customTransformers*/ undefined
    );
}
```

**关键参数**：

| 阶段 | 输入 | 输出 | 行数（src/compiler/） |
|---|---|---|---|
| Scanner | source string | SyntaxKind tokens | scanner.ts 4102 |
| Parser | tokens | SourceFile (AST) | parser.ts 7124 |
| Binder | SourceFile | 含 Symbol 的 SourceFile | binder.ts 1000+ |
| Checker | 含 Symbol 的 AST | 类型诊断 | checker.ts 54435 |
| Emitter | SourceFile | JS + SourceMap | emitter.ts 5000+ |

**最佳实践**：
1. ✅ **5 段**而非 3 段：Binder 是单独阶段，原因是 Symbol 早于类型建立
2. ✅ 增量编译靠 **`.tsbuildinfo`** 缓存 Binder 输出，跳过重复工作
3. ✅ IDE 跟 tsc 共享 `createTypeChecker()`——一次编译两种用途
4. ✅ `typescript-go` 用 Go 重写时把 5.4 万行 checker 拆 200+ 文件，性能 10x
5. ✅ **永远不要合并阶段**——每段都该独立可测

### 2. scanner.ts 状态机词法（不用正则）

**问题场景**：JS 词法复杂——Unicode escape、JSDoc、模板字符串、JSX 文本、RegExp 上下文。正则虽简洁但边界条件难处理。TS 用**纯状态机** 4102 行实现词法分析。

**解决方案**：
```ts
// src/compiler/scanner.ts
export function createScanner(
    languageVersion: ScriptTarget,
    skipTrivia: boolean,
    /*...*/
): Scanner {
    const scanner: Scanner = {
        getToken: () => nextToken(/*...*/),
        reScanTemplateToken: () => reScanTemplateToken(/*...*/),
        reScanJsxToken: () => reScanJsxToken(/*...*/),
        // ...
    };
    return scanner;
}

function scanIdentifier(): SyntaxKind {
    let pos = tokenPos;
    while (isIdentifierPart(ch)) {  // 状态机: isIdentPart 是纯函数
        nextChar();
    }
    const text = sourceText.substring(pos, tokenPos);
    return tokenIsIdentifierOrKeyword(text)
        ? lookupKeyword(text)  // 查 keyword 字典
        : SyntaxKind.Identifier;
}
```

**关键参数**：

| `SyntaxKind` | 含义 | 数量 |
|---|---|---|
| `FirstKeyword` ~ `LastKeyword` | JS/TS 关键字 | 100+ |
| `FirstPunctuation` | 操作符 | 60+ |
| `FirstLiteralToken` | 字面量 | 10+ |
| `FirstTrivia` | 注释/空白 | 5+ |
| **总数** | - | 200+ |

**最佳实践**：
1. ✅ **永远不用正则做词法**——状态机可控、零依赖
2. ✅ `const enum SyntaxKind` 编译成整数，V8 内联后等价于 switch
3. ✅ JSDoc 在 scanner 里解析成 `JSDocComment[]`，不丢 IDE 信息
4. ✅ TS 词法兼容所有 JS 边界（line terminator、ASI 自动分号）
5. ✅ `reScanTemplateToken` 解决模板字符串里 `${}` 重入的复杂场景

### 3. parser.ts 递归下降 + Pratt 表达式

**问题场景**：JS 表达式优先级有 17 级，简单的递归下降处理不了。**Pratt 算法**是 1973 年发明的"前缀优先级"表达——TS 用它处理 `a + b * c` 这种无歧义场景。

**解决方案**：
```ts
// src/compiler/parser.ts
function parseExpression(): Expression {
    return parseAssignmentExpression();
}

function parseAssignmentExpression(): Expression {
    // 递归：左边 + 右边
    let left = parseConditionalExpression();
    if (isAssignmentOperator(token)) {
        const operator = parseAssignmentOperator();
        const right = parseAssignmentExpression();
        return factory.createBinaryExpression(left, operator, right);
    }
    return left;
}

function parseMemberExpression(): MemberExpression {
    // Pratt 风格：先读 base，再用优先级递增 parse 后续
    let expression = parsePrimaryExpression();
    while (true) {
        if (token === SyntaxKind.DotToken) {
            nextToken();
            const name = parseIdentifierName();
            expression = factory.createPropertyAccessExpression(expression, name);
        } else if (token === SyntaxKind.OpenBracketToken) {
            const argument = parseExpression();
            parseExpected(SyntaxKind.CloseBracketToken);
            expression = factory.createElementAccessExpression(expression, argument);
        } else {
            break;
        }
    }
    return expression;
}
```

**关键参数**：

| 概念 | 作用 |
|---|---|
| 递归下降 | 处理 statement、declaration |
| Pratt 算法 | 处理 expression（`a.b.c[0]()` 一气呵成） |
| Error recovery | 输错 `{` 不会让整个文件失败 |
| AST 工厂 | 所有节点用 `factory.create*` 创建 |

**最佳实践**：
1. ✅ **永远不用 yacc/bison**——TS 故意手写 parser 控错误信息
2. ✅ Pratt 是 Pratt 1973 年的算法——处理优先级无需 priority table
3. ✅ Error recovery 让 IDE 不卡——vscode 输入 `{` 不会爆红一片
4. ✅ 5 万+ conformance 测试验证所有边界——错误信息稳如老狗
5. ✅ parser 输出**不可变** AST——所有修改都返回新节点

### 4. binder.ts Symbol 双向链表（首次扫描建立 Symbol）

**问题场景**：类型检查要查"变量 x 的类型是什么"——但 scanner/parser 只产出 AST。Binder 第一次扫描建立 **Symbol**——一个"语言层中间表示"承载多重声明、声明合并、接口合并。

**解决方案**：
```ts
// src/compiler/binder.ts
function bindSourceFile(file: SourceFile, options: CompilerOptions): void {
    file.symbol = bindBlock(file.statements, /*...*/);
    file.symbol.exports = collectSymbolDeclarations(/*...*/);
}

function bindBlock(statements: NodeArray<Statement>, parent: Symbol): Symbol {
    const locals: SymbolTable = createSymbolTable();
    for (const stmt of statements) {
        // 1. 先建立 symbol（不查类型）
        const sym = declareSymbol(locals, stmt);
        // 2. 递归
        if (stmt.kind === SyntaxKind.FunctionDeclaration) {
            bindFunctionDeclaration(stmt, sym);
        }
    }
    return createBlockSymbol(locals);
}

class Symbol {
    flags: SymbolFlags;          // Variable | Function | Class
    declarations: Declaration[];  // 多重声明（overload）
    valueDeclaration: Declaration;
    members?: SymbolTable;        // 类的成员
    exports?: SymbolTable;        // 模块导出
}
```

**关键参数**：

| Symbol 字段 | 作用 |
|---|---|
| `flags` | SymbolFlags 枚举（Variable/Function/Class 等） |
| `declarations` | 重载/合并时多个声明 |
| `valueDeclaration` | 主声明 |
| `members` | 类的成员符号表 |
| `exports` | 模块导出符号表 |

**最佳实践**：
1. ✅ **Symbol 不是类型**——Symbol 是"语言层中间表示"，类型是"类型层"
2. ✅ 一次扫描建立 Symbol——避免类型检查时再去查 AST
3. ✅ `declarations[]` 数组支持函数重载/接口合并
4. ✅ Binder 输出缓存到 `.tsbuildinfo`——增量编译复用
5. ✅ Binder 失败不影响 Emitter——只查类型错误时用

### 5. checker.ts 类型检查核心（5.4 万行单文件）

**问题场景**：TS 类型系统是**双向 + 渐进**——一个 `x + y` 表达式既要推断 `number`，又要校验 `+` 两侧都能 `number`。所有节点都需要 2-3 phase 检查（推断 + 收窄 + 重写）。这就是 checker.ts **5.4 万行 3.1MB** 的根本原因。

**解决方案**：
```ts
// src/compiler/checker.ts（精简到骨架）
function checkExpression(node: Expression, checkMode: CheckMode, typeOfArg?: Type): Type {
    switch (node.kind) {
        case SyntaxKind.BinaryExpression:
            return checkBinaryExpression(node, checkMode);  // 700+ 行
        case SyntaxKind.CallExpression:
            return checkCallExpression(node, checkMode);   // 1500+ 行
        // ... 200+ 种 Expression kind
    }
}

function checkBinaryExpression(node: BinaryExpression, checkMode: CheckMode): Type {
    // Phase 1: 推断左侧
    const leftType = checkExpression(node.left, CheckMode.Normal);
    // Phase 2: 推断右侧
    const rightType = checkExpression(node.right, CheckMode.Normal);
    // Phase 3: 校验运算符
    const operator = getOperator(node);
    if (!isValidOperator(operator, leftType, rightType)) {
        error(node, Diagnostics.Operator_X_cannot_be_applied_to_types_Y_and_Z);
    }
    return getResultType(operator, leftType, rightType);
}
```

**关键参数**：

| checkMode | 含义 | 用途 |
|---|---|---|
| `Normal` | 正常检查（推断+校验） | 大部分场景 |
| `Contextual` | 上下文敏感（已知期望类型） | 函数参数、return |
| `Inferentially` | 只推断不校验 | 内部 use |

**最佳实践**：
1. ✅ **5.4 万行是必要的**——TS 类型系统是工程奇迹
2. ✅ Go 重写时拆 200+ 文件——避免 JS 启动慢
3. ✅ checker 输出缓存到 `getSemanticDiagnostics`——IDE 增量更新
4. ✅ 任何类型 bug 都用 conformance test 修复——不要打 patch
5. ✅ **永远不要在外部改 checker**——这是 TS 团队核心

## 二、类型系统（Type System）

### 6. 类型推断算法（双向 + Hindley-Milner）

**问题场景**：用户写 `const x = 1`，TS 推断 x 为 `number`；写 `const f = (a: number) => a`，TS 推断 f 为 `(a: number) => number`。**双向类型检查**+ **Hindley-Milner 风格**是核心算法。

**解决方案**：
```ts
// 简单情况：赋值推断
const x = 1;  // x 推断为 number（从字面量）

// 复杂情况：泛型推断
function map<T, U>(arr: T[], fn: (x: T) => U): U[] { /*...*/ }
const arr = map([1, 2, 3], x => x.toString());
// T 推断为 number（从 [1,2,3]）
// U 推断为 string（从 x.toString() 返回）

// 上下文敏感
const arr: number[] = [1, '2', 3];
// [1,'2',3] 字面量数组 → 期望 number[] → 报错 '2' 不是 number

// checker.ts 实现
function inferTypeArguments(
    typeParameters: TypeParameter[],
    baseConstraints: Type[],
    candidates: Type[]
): Type[] {
    // HM 风格的 unification
    const inferences: Map<TypeParameter, Type> = new Map();
    for (let i = 0; i < typeParameters.length; i++) {
        const t = typeParameters[i];
        const c = candidates[i];
        // 把 T 跟 number 关联起来
        inferences.set(t, c);
    }
    return typeParameters.map(t => inferences.get(t));
}
```

**关键参数**：

| 推断方式 | 场景 | 规则 |
|---|---|---|
| 字面量推断 | `const x = 1` | 字面量类型（`1`）vs 宽类型（`number`） |
| 上下文推断 | `const x: number[] = []` | 期望类型覆盖字面量 |
| 泛型推断 | `map([1], x => x)` | T 从参数类型推断 |
| 条件类型 | `T extends U ? X : Y` | 分支选择 |
| 双向 | contextual typing | 期望类型 + 推断类型 |

**最佳实践**：
1. ✅ 用 `const` 而不是 `let` 锁定类型——字面量不被拓宽
2. ✅ 显式注解 + 推断混合用——避免 `as any`
3. ✅ 泛型不要嵌套超过 3 层——checker 会卡
4. ✅ 复杂类型用 `satisfies` 运算符（v4.7+）——保留推断同时校验
5. ✅ 优先用 `infer T` 在条件类型里——比手写泛型干净

### 7. 泛型实例化（Instantiation 缓存）

**问题场景**：`Array<number>` 和 `Array<string>` 是**不同类型**——TS 要为每个 `T = number/string` 实例化一次。频繁实例化会让 checker 慢成 PPT。

**解决方案**：
```ts
// checker.ts 关键实现
class TypeSystem {
    private instantiationCache = new Map<number, Type>();

    instantiateType(type: Type, args: Type[]): Type {
        // 用 hash 缓存实例化结果
        const key = hashType(type) ^ hashTypes(args);
        if (this.instantiationCache.has(key)) {
            return this.instantiationCache.get(key)!;
        }
        // 实例化（替换 T → number 等）
        const result = createInstantiatedType(type, args);
        this.instantiationCache.set(key, result);
        return result;
    }
}

// 用法
const arr1 = map<number, string>([1, 2], x => x.toString());
// checker 内部：
// 1. 实例化 T=number, U=string → Map<number, string> 缓存
// 2. 调用 fn: (x: number) => string
// 3. 返回 string[] 缓存
```

**关键参数**：

| 概念 | 作用 |
|---|---|
| 泛型参数 | `<T, U>` 形式参数 |
| 实例化 | `Array<number>` 用 T=number 实例化 |
| 缓存 | 避免重复实例化 |
| 条件类型 | `T extends U ? X : Y` 触发不同实例化 |
| 映射类型 | `{ [K in keyof T]: ... }` 触发映射 |

**最佳实践**：
1. ✅ 泛型嵌套 ≤ 3 层——超过 5 层 checker 性能断崖
2. ✅ 同一泛型函数调用 1000+ 次时——考虑 monomorphization
3. ✅ 避免 `T extends keyof any` 边界——引发指数实例化
4. ✅ 用 `interface` 而非 `type` 联合——type 联合实例化慢
5. ✅ `typesVersions` 字段可绕过特定 TS 版本的实例化 bug

### 8. 条件类型与映射类型（高级类型魔法）

**问题场景**：类型体操（type challenges）—`Pick<T, K>`、`Partial<T>`、`ReturnType<T>` 这些内置类型用 TypeScript 类型系统表达，**完全在编译时**。条件类型 + 映射类型是核心。

**解决方案**：
```ts
// 条件类型
type IsString<T> = T extends string ? true : false;
type X = IsString<number>;  // false
type Y = IsString<'foo'>;   // true

// 映射类型
type Readonly<T> = {
    readonly [K in keyof T]: T[K];
};
type User = { name: string; age: number };
type FrozenUser = Readonly<User>;
// { readonly name: string; readonly age: number }

// 内置 Pick
type Pick<T, K extends keyof T> = {
    [P in K]: T[P];
};
type UserPreview = Pick<User, 'name'>;
// { name: string }

// infer 关键字
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
type Fn = (x: number) => string;
type FnReturn = ReturnType<Fn>;  // string
```

**关键参数**：

| 关键字 | 用途 |
|---|---|
| `extends` | 条件类型 / 约束 |
| `infer T` | 从模式中提取类型 |
| `keyof T` | 联合类型的所有键 |
| `in keyof T` | 映射所有键 |
| `as` | 键重映射（v4.1+） |
| `satisfies` | 校验同时保留推断（v4.7+） |

**最佳实践**：
1. ✅ 优先用**内置**类型：`Pick`/`Omit`/`Partial`/`Readonly`/`Record`
2. ✅ 条件类型用 `infer` 提取——比手写映射干净
3. ✅ `satisfies` 比 `as` 安全——不丢失字面量类型
4. ✅ 避免 `T extends any` 边界——会让类型变 `any`
5. ✅ type challenges 刷 100+ 道——理解类型系统的金标准

### 9. strict 模式（strict + 5 子选项）

**问题场景**：默认 TS 跟 JS 类似宽松——`strictNullChecks` 关闭时 `null/undefined` 可赋给任何类型，**bug 高发**。strict 模式开启 5 个关键选项。

**解决方案**：
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,  // 一键开启以下 5 个
    "noImplicitAny": true,        // 隐式 any 报错
    "strictNullChecks": true,      // null/undefined 必须显式
    "strictFunctionTypes": true,   // 函数参数 bivariant → strict
    "strictBindCallApply": true,   // bind/call/apply 严格检查
    "strictPropertyInitialization": true,  // class 属性必须初始化
    "alwaysStrict": true           // 强制 "use strict"
  }
}
```

```ts
// strictNullChecks 关键场景
function findUser(id: number): User | null {
    return null;
}

const u = findUser(1);
console.log(u.name);  // ❌ Error: 'u' is possibly 'null'
console.log(u?.name); // ✅ OK
if (u) {
    console.log(u.name);  // ✅ OK（控制流收窄）
}

// strictFunctionTypes 关键场景
type Fn = (x: number | string) => void;
const fn: Fn = (x: number) => {};  // ❌ strict 模式报错
// bivariant: 函数参数双变（输入逆变、输出协变）→ 严格检查
```

**关键参数**：

| 选项 | 默认 | 推荐 | 作用 |
|---|---|---|---|
| `strict` | false | **true** | 一键开 5 项 |
| `noImplicitAny` | true (在 strict 下) | true | 禁止 `function f(x) {}` 隐式 any |
| `strictNullChecks` | false | **true** | null/undefined 显式 |
| `strictFunctionTypes` | true (在 strict 下) | true | 函数参数严格 |
| `strictPropertyInitialization` | true (在 strict 下) | true | class 属性 init |
| `alwaysStrict` | true (在 strict 下) | true | 强制 use strict |

**最佳实践**：
1. ✅ **永远 `strict: true`**——不要单独开 subset
2. ✅ 旧项目渐进升级——`// @ts-strict` 单文件开关
3. ✅ 配合 `noUncheckedIndexedAccess`——arr[i] 变 `T | undefined`
4. ✅ 配合 `exactOptionalPropertyTypes`——`{ x?: number }` 不接受 `{ x: undefined }`
5. ✅ strict 是迁移到 typescript-go 7.0 的关键——越多项目开 strict 升级越顺

### 10. Declaration merging 声明合并

**问题场景**：用户写 `interface User {}` 两次，TS 合并成一个；`namespace` 和 `class` 也能合并。**声明合并**是 TS 类型系统的"软扩展"机制，让库作者能增量加类型。

**解决方案**：
```ts
// Interface merging
interface User {
    name: string;
}
interface User {
    age: number;
}
// 合并后: { name: string; age: number }

// Namespace + Class merging
class Album {
    label: Album.AlbumLabel;
}
namespace Album {
    export class AlbumLabel { /*...*/ }
}

// 第三方扩展
// 用户可以扩展 react 模块
declare module 'react' {
    interface HTMLAttributes<T> {
        'data-test'?: string;
    }
}

// 内部用
const Foo = require('foo');
declare module 'foo' {
    export function myAddon(): void;
}
```

**关键参数**：

| 合并类型 | 规则 |
|---|---|
| interface + interface | 同名合并（成员相加） |
| namespace + namespace | 同名合并（导出相加） |
| class + namespace | 互不冲突（静态成员合并） |
| class + interface | interface 当 implements |
| module augmentation | `declare module 'x' {}` 扩展 |

**最佳实践**：
1. ✅ 用 `interface` 不用 `type`——interface 支持合并
2. ✅ 库作者用 `declare module` 暴露扩展点（如 React 的 `HTMLAttributes`）
3. ✅ 避免合并冲突——同名 interface 后期合并可能漏字段
4. ✅ 用 `// @ts-ignore` 单行绕过合并报错——不要 `as any`
5. ✅ module augmentation 必须放在 `import` 之后

## 三、性能与工具链（Performance & Tooling）

### 11. 20+ transformer 降级链（target ES 任意降级）

**问题场景**：开发者用 TS 5.0 的 decorator，但产品要兼容 IE11（ES5）。TS 用 **20+ transformer 链**把高级语法降级到目标 ES 版本——可降级到 ES3！

**解决方案**：
```ts
// src/compiler/transformers/es2015.ts（箭头函数降级）
function transformTypeScript(node: Node): Node {
    if (isArrowFunction(node)) {
        // () => this.x → function() { return this.x; }
        return factory.createFunctionExpression(
            /*modifiers*/ undefined,
            /*asteriskToken*/ undefined,
            node.name,
            /*typeParameters*/ undefined,
            node.parameters,
            /*type*/ undefined,
            factory.createBlock([
                factory.createReturn(transformExpression(node.body))
            ])
        );
    }
    return node;
}

// transformer 链
function getTransformers(target: ScriptTarget): TransformerFactory<SourceFile>[] {
    const transformers: TransformerFactory<SourceFile>[] = [];
    if (target < ScriptTarget.ES2015) {
        transformers.push(transformES2015);  // 箭头函数、let/const
    }
    if (target < ScriptTarget.ES2017) {
        transformers.push(transformES2017);  // async/await
    }
    if (target < ScriptTarget.ES2022) {
        transformers.push(transformES2022);  // class fields
    }
    if (options.experimentalDecorators) {
        transformers.push(transformDecorators);
    }
    if (options.jsx === JsxEmit.React) {
        transformers.push(transformJsx);
    }
    return transformers;
}
```

**关键参数**：

| transformer | 降级目标 |
|---|---|
| `transformES2015` | 箭头、let/const、class |
| `transformES2017` | async/await |
| `transformES2018` | async iter、rest/spread |
| `transformES2020` | optional chaining、nullish coalescing |
| `transformES2022` | class fields、top-level await |
| `transformDecorators` | decorator (legacy + standard) |
| `transformJsx` | `<div />` → `React.createElement('div')` |
| `transformModule` | import/export → require/module.exports |
| `transformTypeScript` | 移除 `: type` 注解 |

**最佳实践**：
1. ✅ `target: "ES2020"` + 现代浏览器——零降级开销
2. ✅ 不要用 `target: "ES3"`——esbuild/swc 都不支持这么老的降级
3. ✅ `useDefineForClassFields: true`（ES2022 class）配合 babel 转换
4. ✅ React JSX 转换：`jsx: "react-jsx"`（v17+ 不再需要 import React）
5. ✅ 装饰器分**legacy**（v2015）和 **standard**（v2022）——不要混

### 12. SourceMap VLQ 编码（手写不依赖库）

**问题场景**：浏览器调试 TS 必须 SourceMap 映射回原始 .ts。SourceMap 用 **VLQ**（Variable Length Quantity）编码行列号——TS 手写实现，不依赖 source-map 库。

**解决方案**：
```ts
// src/compiler/emitter.ts
function emitSourceMap(sourceFile: SourceFile, host: EmitHost): string {
    const mappings: number[] = [];
    let lastGeneratedLine = 0;
    let lastGeneratedColumn = 0;
    let lastSourceLine = 0;
    let lastSourceColumn = 0;

    sourceFile.statements.forEach(stmt => {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(stmt.pos);
        // VLQ 编码: signed base64
        encodeVLQ(line - lastSourceLine, mappings);
        encodeVLQ(character - lastSourceColumn, mappings);
        // ... sourceIndex, nameIndex

        lastSourceLine = line;
        lastSourceColumn = character;
    });

    return JSON.stringify({
        version: 3,
        file: sourceFile.fileName + '.js',
        sources: [sourceFile.fileName],
        mappings: encodeMappings(mappings)
    });
}

function encodeVLQ(value: number, out: number[]): void {
    let vlq = value < 0 ? ((-value) << 1) | 1 : value << 1;
    do {
        let digit = vlq & 0xF;
        vlq >>>= 4;
        if (vlq > 0) digit |= 0x10;
        out.push(encodeBase64(digit));
    } while (vlq > 0);
}
```

**关键参数**：

| 字段 | 作用 |
|---|---|
| `version: 3` | SourceMap v3 标准 |
| `sources` | 原始文件列表 |
| `mappings` | VLQ 编码的行列号映射 |
| `sourcesContent` | 原始内容（可选，inline 用） |
| `names` | 变量名（debug 用） |

**最佳实践**：
1. ✅ **`sourceMap: true`**——debug 必须
2. ✅ **`inlineSources: true`**——把 .ts 内容内联到 .map
3. ✅ `sourceRoot` 字段——monorepo 多包映射
4. ✅ VLQ 让 SourceMap 文件小——千行代码只几十 KB
5. ✅ **永远不要自己写 VLQ**——TS 团队已经实现，抄即可

### 13. tsserver + 168 services（IDE 共享编译器）

**问题场景**：VS Code 等 IDE 需要**实时类型检查、补全、重构、跳转**——但全量 `tsc` 太慢。TS 提供 **tsserver** 通过 stdio 协议接受 IDE 请求，**复用 95% tsc 代码**。

**解决方案**：
```ts
// bin/tsserver
import { createServer } from './server';
const server = createServer();
server.listen();  // 监听 stdio

// IDE 发请求（JSON-RPC 风格）
// {"seq":1,"type":"request","command":"definition","arguments":{...}}

// src/services/tsserver/server.ts 处理
function onRequest(req: Request) {
    switch (req.command) {
        case 'definition':
            return getDefinition(req.arguments.file, req.arguments.position);
        case 'completionInfo':
            return getCompletionsAtPosition(req.arguments.file, req.arguments.position);
        case 'references':
            return getReferencesAtLocation(req.arguments.file, req.arguments.position);
        // 168+ services
    }
}

// src/services/completions.ts
function getCompletionsAtPosition(
    host: LanguageServiceHost,
    fileName: string,
    position: number
): CompletionInfo {
    const program = getProgram(host);
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(fileName);

    return {
        isIncomplete: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        optionalReplacementSpan: undefined,
        entries: checker.getCompletionsAtPosition(sourceFile, position)?.entries || []
    };
}
```

**关键参数**：

| 服务 | 作用 |
|---|---|
| `completionInfo` | 代码补全 |
| `definition` | 跳转到定义 |
| `references` | 找所有引用 |
| `rename` | 重命名重构 |
| `format` | 代码格式化 |
| `quickFix` | 快速修复 |
| `signatureHelp` | 函数签名提示 |
| `organizeImports` | 整理 import |

**最佳实践**：
1. ✅ **tsserver 是 tsc 的子集**——补全/跳转/重构共享 checker
2. ✅ 168 个 services 文件在 `src/services/`——每个服务一个文件
3. ✅ LSP（Language Server Protocol）可以用 typescript-language-server 包
4. ✅ 大项目用 **`composite: true`** + project references——tsserver 增量更快
5. ✅ VS Code 内置 tsserver——不用自己装

### 14. project references 增量编译（tsc -b）

**问题场景**：monorepo 100+ 包，全量 `tsc` 慢成 PPT。TS 5.0+ 用 **project references**——`tsc -b` 只编译**改动的包及其依赖**。

**解决方案**：
```json
// packages/foo/tsconfig.json
{
  "compilerOptions": {
    "composite": true,  // 必填：声明这个包可被引用
    "declaration": true,  // 必填：生成 .d.ts
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../bar" }  // 依赖 bar 包
  ]
}

// packages/bar/tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}

// 根 tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./packages/foo" },
    { "path": "./packages/bar" }
  ]
}
```

```bash
# 增量编译——只编译改动的包及其依赖
tsc -b packages/foo packages/bar

# 全量构建——但仍是并行的
tsc -b
```

**关键参数**：

| 选项 | 必填 | 作用 |
|---|---|---|
| `composite` | ✅ | 启用 project references |
| `declaration` | ✅ | 生成 .d.ts 给依赖者 |
| `declarationMap` | - | 调试友好（跳转到 .ts） |
| `references` | - | 声明依赖 |
| `tsBuildInfoFile` | - | 自定义 .tsbuildinfo 路径 |

**最佳实践**：
1. ✅ **monorepo 必开**——`composite: true` + `tsc -b`
2. ✅ 配 pnpm workspaces——引用路径用 `../bar` 而非 npm 包名
3. ✅ `declaration: true` 让依赖者拿 .d.ts（也走类型检查）
4. ✅ CI 用 `tsc -b --pretty`——增量 + 美化输出
5. ✅ **不要混** `tsc -b` 和 `tsc`——前者增量，后者全量

### 15. tsbuildinfo 缓存（增量编译状态）

**问题场景**：第二次 `tsc -b` 还是要花 30 秒——因为 TS 不记得"上次改了什么"。**`.tsbuildinfo`** 文件存储**增量编译状态**——Type、Symbol、Emit 结果的 hash。

**解决方案**：
```json
// tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "incremental": true,  // 启用 tsbuildinfo
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  }
}
```

```bash
# 第一次构建
tsc -b
# 生成 packages/foo/dist/.tsbuildinfo（包含 1万+ 文件 hash）

# 第二次构建（只改 src/foo.ts）
tsc -b
# 跳过 9999 个未变文件 → 3 秒完成
```

`.tsbuildinfo` 文件结构（精简）：
```json
{
  "version": "5.8.0",
  "program": {
    "fileNames": ["src/foo.ts", "src/bar.ts", /*...*/],
    "fileInfos": [
      { "version": "abc123...", "signature": "def456..." },
      // ... 每个源文件
    ],
    "options": { /*...*/ }
  },
  "affectedFilesPendingEmit": []
}
```

**关键参数**：

| 字段 | 作用 |
|---|---|
| `version` | 编译器版本（升级时失效） |
| `fileInfos[].version` | 文件内容 hash（改动时失效） |
| `fileInfos[].signature` | AST 签名（emit 缓存） |
| `affectedFilesPendingEmit` | 改完未 emit 的文件 |

**最佳实践**：
1. ✅ `tsbuildinfo` 提交到 git——团队共享缓存
2. ✅ `composite: true` 必填——否则 incremental 不工作
3. ✅ 升级 TypeScript 版本**删掉** .tsbuildinfo——避免版本不兼容
4. ✅ CI 用 `tsc -b --force` 偶尔全量重建
5. ✅ `tsBuildInfoFile` 路径避开 `dist/` 内部目录

## 四、测试与生态（Testing & Ecosystem）

### 16. 5 万+ conformance 测试（用户驱动的回归）

**问题场景**：编译器改动极易破坏既有用户代码。TS 用 **conformance 测试**——5 万+ 来自真实 bug 报告的测试用例，每个 = .ts + .errors.txt + .js 三件套。

**解决方案**：
```
tests/cases/conformance/types/union/
├── unionTypeAtLiteralPosition.ts    # 用户提交的 bug
├── unionTypeAtLiteralPosition.errors.txt    # 期望错误
└── unionTypeAtLiteralPosition.js      # 期望输出
```

```ts
// unionTypeAtLiteralPosition.ts
function f(x: 'a' | 'b') {
    if (x === 'a' || x === 'b') {
        return x.toUpperCase();  // 应该推断为 'A' | 'B'
    }
}
```

```text
// unionTypeAtLiteralPosition.errors.txt
// (空 = 期望无错误)
```

```js
// unionTypeAtLiteralPosition.js（emitter 输出）
function f(x) {
    if (x === "a" || x === "b") {
        return x.toUpperCase();
    }
}
```

测试运行：
```bash
# 跑所有 conformance test（4-6 小时）
node ./built/local/tsc.js -b tests --pretty

# 跑单个测试
node ./built/local/tsc.js -b tests/cases/conformance/types/union --pretty
```

**关键参数**：

| 文件 | 必填 | 作用 |
|---|---|---|
| `*.ts` | ✅ | 输入源代码 |
| `*.errors.txt` | ✅ | 期望错误（空文件 = 无错误） |
| `*.js` | - | 期望输出（仅当 EMIT 模式） |
| `*.tsconfig.json` | - | 自定义编译选项（可选） |
| `*.symbols` | - | 期望 binder 符号（调试用） |

**最佳实践**：
1. ✅ **每个 bug 修复必须配 conformance test**——README 强制
2. ✅ test 名字 = bug 描述（如 `unionTypeAtLiteralPosition`）
3. ✅ 提交 PR 前 `tsc -b tests` 跑全量——CI 不会容忍失败
4. ✅ `tests/cases/compiler/` 是错误恢复测试——可以编译错代码
5. ✅ **永远不要在 PR 删 conformance test**——会破坏回归

### 17. tests/baselines 快照（reference 输出）

**问题场景**：conformance test 的"期望输出"经常变——加新 feature、TS 5.0 → 5.1 emitter 变化。TS 用 **baselines/reference** 目录存**所有测试的快照**——重新生成后 commit diff。

**解决方案**：
```
tests/baselines/reference/
├── conformance/types/union/
│   ├── unionTypeAtLiteralPosition.js          # 期望 emit 输出
│   ├── unionTypeAtLiteralPosition.d.ts        # 期望 .d.ts
│   ├── unionTypeAtLiteralPosition.errors.txt  # 期望错误
│   └── unionTypeAtLiteralPosition.types       # 期望类型快照
└── compiler/
    └── ...
```

```bash
# 重新生成 baselines
node ./built/local/tsc.js -b tests --baseline --pretty

# 检出新生成的 diff
git status
git diff tests/baselines/
git add tests/baselines/
git commit -m "Update baselines"
```

**关键参数**：

| baseline | 作用 |
|---|---|
| `*.js` | emit 输出 |
| `*.d.ts` | 声明文件输出 |
| `*.errors.txt` | 错误信息 |
| `*.types` | 类型快照（用于性能回归） |

**最佳实践**：
1. ✅ **改 emit 行为必须更新 baselines**——PR 必含 baseline diff
2. ✅ 团队 review baseline diff——看 emit 输出是否合理
3. ✅ baselines 频繁更新——TS 团队会审核每行
4. ✅ 性能 baseline 用 `*.types` 监控——类型数量爆炸
5. ✅ **永远不要 hand-edit baselines**——用 `-b` 重新生成

### 18. src/lib/*.d.ts 内置类型（标准库自带）

**问题场景**：每个 TS 项目都写 `Array.prototype.map` 的类型签名？太荒谬。TS 把**标准库类型**放在 `src/lib/*.d.ts`——108 个 .d.ts 文件，跟 compiler 一同发布。

**解决方案**：
```ts
// src/lib/es5.d.ts（ES5 标准库）
interface Array<T> {
    length: number;
    push(...items: T[]): number;
    pop(): T | undefined;
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
    // ... 几十个方法
}

interface Promise<T> {
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2>;
}

// src/lib/dom.d.ts（DOM 类型）
interface HTMLElement extends Element {
    classList: DOMTokenList;
    innerHTML: string;
    addEventListener<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): void;
}
```

**关键参数**：

| 库 | 大小 | 用途 |
|---|---|---|
| `es5.d.ts` | 100 KB | ES5 标准库 |
| `es2015.d.ts` ~ `es2024.d.ts` | 50-200 KB | ES2015+ 新增 |
| `dom.d.ts` | 800+ KB | 浏览器 DOM |
| `dom.iterable.d.ts` | 50 KB | DOM iterables |
| `webworker.d.ts` | 200 KB | Web Worker |
| `scripthost.d.ts` | 50 KB | 旧 IE 兼容 |
| `decorators.d.ts` | 5 KB | decorator 元数据 |

**最佳实践**：
1. ✅ `lib: ["ES2022", "DOM"]` 选需要的——避免 dom 污染 node 项目
2. ✅ `lib: ["ES2022"]` node 后端——不要 DOM
3. ✅ `lib: ["ES5", "DOM"]` 兼容老 IE——但 2026 年没意义
4. ✅ 跟 `target` 配合——`target: "ES2020"` + `lib: ["ES2020"]`
5. ✅ **永远不要在 lib 里加项目类型**——那是 `@types/*` 或自己 .d.ts

### 19. nightly + LKG（Last Known Good）

**问题场景**：PR 合 main 后可能破坏 nightly。TS 用 **nightly 每天跑全量** + **LKG（Last Known Good）** 滚动测试——保证每晚都有"健康"版本可发布。

**解决方案**：
```yaml
# .github/workflows/nightly.yaml
name: Nightly
on:
  schedule:
    - cron: '0 6 * * *'  # 每天 6AM UTC
  workflow_dispatch:

jobs:
  nightly:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [ES3, ES5, ES2015, ES2020, ES2024]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install
        run: npm ci
      - name: Build TS
        run: node ./node_modules/typescript/lib/tsc.js -b src
      - name: Run all tests
        run: ./built/local/tsc.js -b tests --pretty
      - name: Publish nightly
        if: success()
        run: node scripts/publishNightly.js
```

LKG 跟踪：
```js
// scripts/set-version.js
const LKG_VERSION = '5.8.0';  // 最近一次发布的版本

function isLKG() {
    return fs.existsSync(`built/local/typescript/package.json`)
        && fs.readJSONSync(`built/local/typescript/package.json`).version === LKG_VERSION;
}
```

**关键参数**：

| 触发 | 行为 | 频率 |
|---|---|---|
| `pull_request` | 跑相关 conformance | 即时 |
| `schedule` (cron 6AM) | 跑全量 conformance + publish nightly | 每天 |
| `push` (main) | 更新 LKG | 即时 |
| `workflow_dispatch` | 手动跑全量 | 按需 |

**最佳实践**：
1. ✅ **永远不要在 PR 改 nightly 行为**——nightly 失败 PR 必被 reject
2. ✅ 升级 TS 5.x 前先看 LKG——避免 breaking change
3. ✅ `npm install typescript@nightly` 可用——beta 用户
4. ✅ nightly 失败 PR 作者必查——不准"等下次 nightly"
5. ✅ LKG 是"已发布"快照——代码冻结期的最后参考

### 20. AGENTS.md AI 规则（明文给 AI 写代码规范）

**问题场景**：2024 年起，AI agent（Copilot/Cursor/Claude）能"批量提 PR"——但 TS 编译器代码极复杂，AI 提的 PR 质量低。TS 2025 年在 **AGENTS.md** 明文给 AI 写规则。

**解决方案**：
```markdown
<!-- AGENTS.md（节选） -->

# 仓库的 AI 规则

## 不要做的
- 不要再开"添加装饰器"等大 feature PR（**代码冻结期**）
- 不要单方面修改 `checker.ts` 超过 100 行
- 不要改 conformance test 输出（必须改 baseline）
- 不要 PR title 不符合格式
- 不要不写 `*.ts` 测试就直接改 src

## 必须做的
- 改 src/ 必加 conformance test
- 改 src/lib/ 必加对应 lib test
- 改 emit 行为必更新 baselines
- 改 API 必更新 public API 文档
- 用 `npm run check` 跑 lint + format

## 性能规则
- 改 checker 必跑 `tests/cases/compiler` 全量
- 关注 `*.types` baseline 增长——类型实例化爆炸
- 关注 startup time——冷启动 < 1s 目标
```

**关键参数**：

| 规则 | 来源 |
|---|---|
| 代码冻结 | `CONTRIBUTING.md` README 31-39 行 |
| AI 规则 | `AGENTS.md` + `copilot-instructions.md` |
| PR 模板 | `.github/ISSUE_TEMPLATE/` 8 个 |
| CODEOWNERS | `.github/CODEOWNERS` 按目录分 owner |

**最佳实践**：
1. ✅ **AI 提 PR 必读 AGENTS.md**——TS 团队明文要求
2. ✅ 不符合规则的 PR 必被 close + 警告
3. ✅ 大改 5.9 之后只能"小修"（bug fix、refactor）
4. ✅ 新功能迁移到 `typescript-go` 仓库（性能重写期）
5. ✅ AI PR 必须挂 `[ai-generated]` 标签让人识别

**标签**：#TypeScript #编译器 #语言服务 #Microsoft
**状态**：20/20 份详细内容
