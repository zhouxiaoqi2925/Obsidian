# typescript-fresh

> TypeScript 6.0 编译器（最后一代 JavaScript 实现）：Scanner/Parser/Binder/Checker/Emitter 五段独立流水线 + 不可变 AST + side-channel 标注 + BuilderProgram 增量构建 + Host/Program/BuilderProgram 三元组抽象。本篇把工业级静态分析器最值得偷的设计哲学拆成 20 个 Pattern，涵盖 4 大主题：核心机制、架构设计、性能优化、工程实践。

## 核心机制

### 模式 1：Scanner/Parser/Binder/Checker/Emitter 五段独立流水线

**问题场景**：编译器内部阶段耦合会导致"想优化单阶段却牵动全链"。需要清晰划分阶段边界，每段输出 IR，阶段间用 AST 传递。

**解决方案**：

```ts
// src/compiler/program.ts
export function createProgram(rootNames: string[], options: CompilerOptions, host?: CompilerHost): Program {
    // 1. Scanner: sourceText → Token 流
    const scanner = createScanner(...);
    // 2. Parser: Token → SourceFile AST
    const sourceFile = parseSourceFile(...);
    // 3. Binder: 符号解析 + 作用域
    binder.bindSourceFile(sourceFile, ...);
    // 4. Checker: 类型推断 + 错误诊断
    const checker = createTypeChecker(...);
    checker.checkSourceFile(sourceFile);
    // 5. Emitter: AST → JS/.d.ts/.map
    const emitResult = emit(sourceFile, ...);
}
```

**关键参数**：

| 阶段 | 输入 | 输出 |
|------|------|------|
| Scanner | 源文本 | Token 流 |
| Parser | Token 流 | SourceFile AST |
| Binder | AST | 绑定符号/作用域 |
| Checker | 绑定 AST | 类型 + 诊断 |
| Emitter | 类型化 AST | JS/.d.ts/.map |

**最佳实践**：

- ✅ 阶段之间用 IR（AST）传递——避免阶段间回环
- ✅ 每阶段可独立替换——优化 checker 不影响 parser
- ✅ 共享 SourceFile 节点——避免重复解析
- ✅ Program 编排器串联——阶段顺序可观察
- ❌ 避免在 Scanner 阶段做语义判断——破坏阶段边界

### 模式 2：节点不可变 + side-channel 多层标注

**问题场景**：多个 transformer（ES5/ES2020/装饰器）需要顺序处理同一棵 AST。如果直接修改节点，后续 transformer 会看到副作用，互相污染。

**解决方案**：

```ts
// src/compiler/factory/nodeFactory.ts
export function createIdentifier(text: string): Identifier {
    return factory.createIdentifier(text);
    // 节点一旦创建就不可变
    // 后续类型推断走 node.type
    // emit 标记走 getOrCreateEmitNode(node)
}

// side-channel 挂载
function getOrCreateEmitNode(node: Node): EmitNode {
    if (!node.emitNode) node.emitNode = { ... };
    return node.emitNode;
}
```

**关键参数**：

| side-channel | 作用 |
|--------------|------|
| `node.type` | 推断出的类型 |
| `node.symbol` | 绑定的符号 |
| `node.emitNode` | emit 阶段需要的标记 |
| `node.flowNode` | 控制流分析标记 |
| `node.parent` | 父节点指针 |

**最佳实践**：

- ✅ 节点创建后不修改——所有副作用走 side-channel
- ✅ side-channel 字段独立——互不污染
- ✅ 多 transformer 顺序处理同一棵树——无副作用
- ✅ 同一份 AST 输出多目标（ES5/ES2020/JSX）——共享基础
- ❌ 避免 transformer 直接改节点——破坏不可变

### 模式 3：`createTypeChecker` 工厂 + 单文件 IIFE 闭包

**问题场景**：类型系统是"信息全热"工作集——泛型实例化、符号解析、flow 分析共享大量本地缓存。如果拆模块，cache miss 爆炸。

**解决方案**：

```ts
// src/compiler/checker.ts（54434 行）
export function createTypeChecker(host: TypeCheckerHost): TypeChecker {
    // 内部所有状态通过闭包共享
    let symbolCount = 0;
    const symbolPool: Symbol[] = [];
    const typeInstanceCache = new Map<string, Type>();
    const flowNodeCache = new Map<Node, FlowNode>();

    return {
        getTypeOfSymbolAtLocation: (sym, node) => { ... },
        resolveTypeReference: (ref) => { ... },
        // ... 几百个方法
    };
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `symbolCount` | 符号 ID 计数器 |
| `symbolPool` | 符号实例池 |
| `typeInstanceCache` | 泛型实例化缓存 |
| `flowNodeCache` | 控制流节点缓存 |
| `getTypeOfSymbolAtLocation` | 核心 API |

**最佳实践**：

- ✅ 用闭包共享本地缓存——避免模块边界 cache miss
- ✅ 工厂返回接口——外部只见 `TypeChecker` 不见实现
- ✅ 所有方法都走 IIFE 内部函数——共享状态
- ✅ 避免在闭包内暴露 mutable 引用——用 return 函数封装
- ❌ 避免"模块化"拆分——会破坏缓存局部性

### 模式 4：递归下降 Parser + 手动 error recovery

**问题场景**：TypeScript 要从**部分损坏的源码**继续 parse——checker 需要看到尽可能多的节点以给出有效诊断。parser generator 不允许"软错误恢复"。

**解决方案**：

```ts
// src/compiler/parser.ts（10823 行）
function parseFunctionDeclaration(): FunctionDeclaration {
    // 1. expect 'function' 关键字
    // 2. parse 标识符
    if (token === SyntaxKind.OpenParenToken) {
        parseErrorForMissingName();  // 软错误：不中断
    }
    // 3. parse 参数列表
    // 4. parse 返回类型
    // 5. parse 函数体
    return factory.createFunctionDeclaration(/*...*/);
}

// 软错误恢复：parser 遇到 `function f(:` 仍能继续
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `parseXxx` | 每个语法一个函数 |
| `nextToken` | 前进 token |
| `reScanGreaterToken` | 回退 scanner 状态 |
| `reScanSlashToken` | 区分除号与正则 |

**最佳实践**：

- ✅ 用递归下降 + 手动 error recovery——软错误可继续
- ✅ `nextToken` / `reScan*Token` 灵活回退——处理歧义
- ✅ 不用 parser generator——失去错误恢复控制
- ✅ 给每种语法一个 `parseXxx` 函数——可独立测试
- ❌ 避免在 error 路径上 `throw`——会丢失后续节点

### 模式 5：`CompilerHost` 抽象 + Node/浏览器双实现

**问题场景**：TypeScript 核心要在 CLI（Node）、IDE（Web Worker）、浏览器、test runner 中复用。文件系统 IO 必须可替换。

**解决方案**：

```ts
// src/compiler/sys.ts
export interface CompilerHost {
    fileExists(fileName: string): boolean;
    readFile(fileName: string): string | undefined;
    writeFile(fileName: string, data: string): void;
    getCurrentDirectory(): string;
    getSourceFile(fileName: string, ...): SourceFile | undefined;
}

export const sys: System = createSystem();  // 默认 Node 实现
```

```json
// package.json
{
    "browser": {
        "fs": false,
        "os": false,
        "path": false,
        "crypto": false,
        "buffer": false,
        "inspector": false,
        "perf_hooks": false
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `CompilerHost` | 编译器 IO 抽象 |
| `sys` | 默认 Node System |
| `browser` | package.json 屏蔽 Node API |
| 浏览器安全 | `lib/typescript.js` 在浏览器中运行 |

**最佳实践**：

- ✅ Host 抽象 IO——同一核心多环境复用
- ✅ 默认 Node 实现——CLI 即用
- ✅ `package.json#browser` 屏蔽 Node API——浏览器安全
- ✅ VSCode / Volar / swc 都复用同一核心——生态共赢
- ❌ 避免在核心代码中直接 `require('fs')`——破坏浏览器兼容

## 架构设计

### 模式 6：Host/Program/BuilderProgram 三元组

**问题场景**：CLI、watch、IDE 都需要编译器核心，但要求差异大。CLI 一次性编译、watch 增量、IDE 多项目多用户视图。需要清晰分层。

**解决方案**：

```ts
// 三元组
export interface CompilerHost { /* IO */ }
export interface Program { /* 编排 parse/bind/check/emit */ }
export interface BuilderProgram extends Program { /* 增量缓存 */ }

// 使用
const host = createCompilerHost(options);
const program = createProgram(rootNames, options, host);
program.getTypeChecker();  // 普通模式

// 增量模式
const builder = createIncrementalProgram({ rootNames, options, host });
builder.getSemanticDiagnostics(...);  // 增量
```

**关键参数**：

| 层 | 关注 |
|----|------|
| `CompilerHost` | IO 抽象 |
| `Program` | 编排类型检查 |
| `BuilderProgram` | 增量重算 |

**最佳实践**：

- ✅ 三元组各管一摊——Host 管 IO、Program 管类型、Builder 管缓存
- ✅ BuilderProgram 继承 Program——薄封装增量缓存
- ✅ 复用同一 checker 与 emitter——`--build` 不重写
- ✅ IDE/CLI 共享核心——减少重复实现
- ❌ 避免在 BuilderProgram 内重写核心——会偏离主分支

### 模式 7：BuilderProgram 两层缓存（结构层 + 检查层）

**问题场景**：大型项目（数千文件）重编译要花数十秒。需要"文件没变就复用整个解析结果"。

**解决方案**：

```ts
// src/compiler/tsbuild.ts
class BuilderProgram {
    private parsedFiles: Map<string, SourceFile> = new Map();
    private checkedFiles: Map<string, SemanticDiagnostics> = new Map();

    getSemanticDiagnostics(file: SourceFile): Diagnostic[] {
        // 1. 文件 mtime 变了？重新 parse
        if (this.host.getModifiedTime(file.fileName) > this.parsedFiles.get(file.fileName).mtime) {
            this.parsedFiles.set(file.fileName, parseSourceFile(...));
            this.checkedFiles.delete(file.fileName);  // 失效检查缓存
        }
        // 2. 检查过？返回缓存
        if (this.checkedFiles.has(file.fileName)) {
            return this.checkedFiles.get(file.fileName);
        }
        // 3. 重新检查
        const diagnostics = this.checker.getSemanticDiagnostics(file);
        this.checkedFiles.set(file.fileName, diagnostics);
        return diagnostics;
    }
}
```

**关键参数**：

| 缓存层 | 粒度 | 失效条件 |
|--------|------|---------|
| 结构层 | SourceFile | mtime 变化 |
| 检查层 | SemanticDiagnostics | 文件 mtime + 依赖变化 |
| `.tsbuildinfo` | 跨进程 | 项目根 mtime |

**最佳实践**：

- ✅ 结构层 + 检查层分离——粒度不同
- ✅ 文件 mtime 触发结构层失效——精确
- ✅ `.tsbuildinfo` 跨进程复用——CI 加速
- ✅ `incremental: true` 自动启用——配置化
- ❌ 避免基于内容 hash 失效——IO 成本高

### 模式 8：`.tsbuildinfo` 跨进程缓存持久化

**问题场景**：CI 每次跑都从零开始编译。`.tsbuildinfo` 把"哪些文件用什么签名检查过"持久化，下次启动直接复用。

**解决方案**：

```ts
// 启用 incremental
{
    "compilerOptions": {
        "incremental": true,
        "tsBuildInfoFile": "./build/.tsbuildinfo"
    }
}

// 读取
const buildInfo = readBuildInfo("./build/.tsbuildinfo");
if (buildInfo && buildInfo.version === ts.version) {
    // 复用 cache
    program = createIncrementalProgram({ ...buildInfo });
}

// 写入
const newBuildInfo = getBuildInfo(program);
writeBuildInfo("./build/.tsbuildinfo", newBuildInfo);
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `incremental: true` | 启用 |
| `tsBuildInfoFile` | 文件路径 |
| `version` | TS 版本号 |
| `fileHash` | 单文件 hash |
| `checkTime` | 检查时间戳 |

**最佳实践**：

- ✅ 默认 `incremental: true`——CI 加速
- ✅ 把 `.tsbuildinfo` 提交到 cache——跨进程复用
- ✅ 用版本号作兼容检查——TS 升级失效旧 cache
- ✅ 大项目用 `composite: true`——多项目引用
- ❌ 避免在 Dockerfile 中删除 .tsbuildinfo——失去加速

### 模式 9：Namespace 聚合桶 `_namespaces/ts.ts`

**问题场景**：tsc 由几百个文件组成，但 `import * as ts from "typescript"` 要看到全部 API。如果每个文件都 `export`，d.ts 表面碎成几百个模块。

**解决方案**：

```ts
// src/compiler/_namespaces/ts.ts
// 把所有公开符号 re-export 到一个 ts 命名空间
export { createProgram, createIncrementalProgram, createWatchProgram } from "../program.js";
export { createTypeChecker, TypeChecker } from "../checker.js";
export { createScanner, createSourceFile } from "../scanner.js";
export { Scanner, Parser, CompilerOptions, ... } from "../types.js";
// ... 几百个 re-export

// 用户
import * as ts from "typescript";
const program = ts.createProgram(...);
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `_namespaces/ts.ts` | 聚合桶 |
| 公开 API | `ts.createXxx`、`ts.Xxx` |
| 内部模块 | 直接 `import` 不走聚合 |

**最佳实践**：

- ✅ 聚合桶给外部用户稳定 API——单 import 入口
- ✅ 内部代码用直接 import——避免 circular
- ✅ 名字带下划线前缀——`_namespaces` 表明内部
- ✅ TypeScript d.ts 友好——单文件 API 表面
- ❌ 避免所有符号都走聚合——内部代码会慢

### 模式 10：`CancellationToken` 贯穿长任务

**问题场景**：IDE 用户改一行代码，编译器跑几秒才发现用户已经改了下一行。需要能取消长任务。

**解决方案**：

```ts
// src/compiler/types.ts
export interface CancellationToken {
    isCancellationRequested(): boolean;
    throwIfCancellationRequested(): void;
}

// parser/checker/emit 中检查
function checkSourceFile(file: SourceFile, token: CancellationToken) {
    for (const statement of file.statements) {
        token.throwIfCancellationRequested();  // 周期性检查
        checkStatement(statement);
    }
}

// IDE 取消
const token = createCancellationToken();
tsserver.onUserTyping(() => token.cancel());
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `isCancellationRequested` | 状态查询 |
| `throwIfCancellationRequested` | 抛错中断 |
| 注入 | 通过 host 传递 |

**最佳实践**：

- ✅ 用 CancellationToken 而非 AbortSignal——保持平台无关
- ✅ 在长循环中周期性检查——不能每行查（开销）
- ✅ 抛出后立即停止——不留残余状态
- ✅ IDE 取消时给用户友好提示——不要默默失败
- ❌ 避免基于"超时"中断——用户体验差

## 性能优化

### 模式 11：Worker 池并行测试运行器

**问题场景**：TypeScript 几万个测试用例，单进程跑要几小时。需要多进程 worker 池并行。

**解决方案**：

```ts
// src/testRunner/parallel/host.ts
class ParallelHost {
    private workers: Worker[] = [];
    private queue: Test[] = [];

    async run(tests: Test[]): Promise<TestResult[]> {
        // 1. 分发测试到 worker
        // 2. worker 跑完回报
        // 3. 收集结果
        for (let i = 0; i < this.workerCount; i++) {
            const worker = new Worker('./worker.js');
            this.workers.push(worker);
            worker.on('message', (result) => this.onResult(result));
        }
        for (const test of tests) {
            this.dispatch(test);
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| workerCount | CPU 核数 |
| queue | 待测试队列 |
| dispatch | 分发到空闲 worker |

**最佳实践**：

- ✅ worker 数 = CPU 核数——避免上下文切换
- ✅ 用 Node Worker 而非 fork——进程开销小
- ✅ 测试独立无共享状态——才可并行
- ✅ 失败测试单独重跑——避免 flaky 阻塞
- ❌ 避免 worker 共享大对象——序列化成本高

### 模式 12：Fourslash 测试用注释断言 IDE 行为

**问题场景**：IDE 跳转、重构、补全等"基于光标位置"的行为难写测试。Fourslash 用 `//|` 注释直接写 IDE 行为断言。

**解决方案**：

```ts
// tests/cases/fourslash/quickInfoOnClass.ts
////class [|Foo|] {
////    bar: number;
////}
////var x = new [|F|]oo();
////x./*1*/bar;

// 断言：光标在 /*1*/ 时 QuickInfo 应为 number
verify.quickInfoAt("1", "var bar: number");
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `////` | 标记测试代码 |
| `[|...|]` | 标记光标位置 |
| `/*1*/` | 标记光标 ID |
| `verify.xxx` | 断言 API |

**最佳实践**：

- ✅ Fourslash 测 IDE 行为——跳转、重构、补全
- ✅ 注释 + 标记——避免额外 DSL
- ✅ 每个测试一个文件——可独立运行
- ✅ 与 Mocha runner 集成——CI 自动跑
- ❌ 避免在 Fourslash 中写逻辑——只测行为

### 模式 13：Hereby 构建系统 + esbuild 加速

**问题场景**：TypeScript 自己用 TS 写，编译 TS 要时间。`Herebyfile.mjs` 是 JS 版任务运行器，产物用 esbuild 加速。

**解决方案**：

```js
// Herebyfile.mjs
import { task, file, build } from "hereby";

export const buildTypeScript = task({
    name: "build:typescript",
    run: () => {
        // esbuild 编译 src/ → lib/
        return esbuild.build({
            entryPoints: ['src/typescript/index.ts'],
            outfile: 'lib/typescript.js',
            bundle: true,
            target: 'es2020',
        });
    },
});

export const build = task({
    name: "build",
    dependencies: [buildTypeScript],
    run: () => console.log("build complete"),
});
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `Hereby` | 任务运行器 |
| `esbuild` | 极速 TS→JS 编译 |
| `task()` | 任务定义 |
| `dependencies` | 任务依赖图 |

**最佳实践**：

- ✅ 用 esbuild 而非 tsc——快 10-100x
- ✅ Hereby 任务图管理——比 Makefile 灵活
- ✅ 增量构建——只重建改动的任务
- ✅ dprint 格式化——比 Prettier 快 30x
- ❌ 避免用 tsc 编译自身——慢

### 模式 14：Baseline 测试防止输出漂移

**问题场景**：编译器输出应稳定。`tests/baselines/` 锁定基线，CI 比对。

**解决方案**：

```ts
// tests/baselines/reference/quickInfoOnClass.js
// 上次确认的基线
class Foo {
    bar: number;
}
var x = new Foo();
x.bar;

// runner.ts 中
const baseline = readFileSync(`tests/baselines/${testName}.js`);
const actual = compile(testName);
if (actual !== baseline) {
    throw new Error(`Baseline mismatch: ${testName}`);
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `tests/baselines/` | 基线目录 |
| `localBaseline` | 本地基线 |
| `refBaseline` | 上游基线 |
| 差异 | 显式 diff |

**最佳实践**：

- ✅ 基线测试是"快照"——锁定行为
- ✅ 修改基线要显式 `accept`——避免误改
- ✅ 用 `refBaseline` 对比上游——防回归
- ✅ 关键场景（错误信息、emit 输出）必测
- ❌ 避免全部测试用 baseline——增加维护成本

### 模式 15：isolatedDeclarations 并行生成 .d.ts

**问题场景**：单进程生成 .d.ts 慢。`isolatedDeclarations` 让 .d.ts 可并行生成。

**解决方案**：

```json
// tsconfig.json
{
    "compilerOptions": {
        "declaration": true,
        "isolatedDeclarations": true  // 5.6+
    }
}
```

```ts
// 启用后，单个 .ts 文件可独立生成 .d.ts，无需全项目类型信息
// Compiler 可并行处理
// file1.ts → file1.d.ts
// file2.ts → file2.d.ts
// 并行
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `declaration: true` | 生成 .d.ts |
| `isolatedDeclarations: true` | 单文件可生成 |
| 限制 | 必须显式标注返回类型 |

**最佳实践**：

- ✅ 大项目启用 `isolatedDeclarations`——并行加速
- ✅ 配合 `composite: true`——多项目并行
- ✅ 公共 API 文件必显式类型——否则编译失败
- ✅ 5.6+ 项目默认开启——CI 提速明显
- ❌ 避免给内部文件加——增加维护成本

## 工程实践

### 模式 16：浏览器安全入口（`package.json#browser`）

**问题场景**：VSCode / swc / esbuild 都要在浏览器或 Web Worker 中用 TypeScript 核心。但 TS 默认 `require('fs')` 浏览器会崩。

**解决方案**：

```json
// package.json
{
    "main": "lib/typescript.js",
    "browser": {
        "fs": false,
        "os": false,
        "path": false,
        "crypto": false,
        "buffer": false,
        "inspector": false,
        "perf_hooks": false
    }
}
```

**关键参数**：

| Node API | 浏览器替代 |
|----------|----------|
| `fs` | `false`（屏蔽） |
| `os` | `false` |
| `path` | `false`（host 抽象替代） |
| `crypto` | 浏览器 `crypto.subtle` |
| `buffer` | 浏览器 `Uint8Array` |

**最佳实践**：

- ✅ 用 `browser: false` 屏蔽 Node-only API——核心代码不直接 `require`
- ✅ Host 抽象替代文件系统——核心不变
- ✅ 浏览器中 `Buffer` 替换为 `Uint8Array`
- ✅ VSCode / swc / esbuild 都能复用——生态共赢
- ❌ 避免在核心 `import * as fs from 'fs'`——破坏浏览器

### 模式 17：`AGENTS.md` AI 编码助手规范

**问题场景**：2025 年起大量 AI 助手自动提 PR。TypeScript 维护模式期间，要拒绝无意义 PR。

**解决方案**：

```markdown
# AGENTS.md
> 给 AI 编码助手的强制规范

1. **本仓库已处于维护模式**，只接受 critical / security / language service crash 修复
2. 提交 PR 前请确认用户已接受维护模式条款
3. **拒绝批量 AI 自动化 PR**——单次 PR 解决一个明确问题
4. PR 描述必须包含"问题描述 + 解决方案 + 复现步骤"
5. 重大变更需要先在 discussions/rfcs 发起
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 维护模式 | 6.0 之后只修 critical |
| 拒绝批量 | 单 PR 一个问题 |
| 强制 RFC | 重大变更先讨论 |

**最佳实践**：

- ✅ `AGENTS.md` 给 AI 助手明确规则——减少无效 PR
- ✅ `CONTRIBUTING.md` 同步更新——人机共知
- ✅ 维护模式期间显式拒绝"非必要 PR"
- ✅ 用 GitHub Actions 模板强制填写——提高 PR 质量
- ❌ 避免"默许 AI 助手提 PR"——会被淹没

### 模式 18：本地 npm 包 link 跨项目测试

**问题场景**：TypeScript 主仓库在 5.9 分支开发，但 VSCode 用 5.5 稳定版。VSCode 测试要用本地 TypeScript。

**解决方案**：

```bash
# TypeScript 仓库
cd G:\实战案例\GitHub顶尖项目\typescript-fresh
npm run build
npm link  # 创建全局 link

# VSCode 仓库
cd G:\vscode\src\vscode
npm link typescript  # 链接到本地 TS
```

```json
// vscode/package.json
{
    "dependencies": {
        "typescript": "file:../typescript-fresh"  // 或 5.5
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `npm link` | 全局 link |
| `file:` | 本地文件依赖 |
| `npm pack` | 打本地 tarball |

**最佳实践**：

- ✅ `npm link` 跨项目测试——避免发版
- ✅ `file:../` 显式本地依赖——npm/yarn/pnpm 都支持
- ✅ `npm pack` 打 tarball 测安装路径
- ✅ CI 用 GitHub Actions cache 跨 PR 复用
- ❌ 避免 `npm install -g typescript@latest`——会污染全局

### 模式 19：CI 多矩阵（OS × Node 版本）

**问题场景**：TypeScript 在 Linux/macOS/Windows × Node 18/20/22 都要能跑。CI 需要矩阵。

**解决方案**：

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
    test:
        strategy:
            matrix:
                os: [ubuntu-latest, macos-latest, windows-latest]
                node: [18.x, 20.x, 22.x]
                exclude:
                    - os: windows-latest
                      node: 18.x  # Windows 不支持老 Node
        runs-on: ${{ matrix.os }}
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: ${{ matrix.node }}
            - run: npm ci
            - run: npm test
            - run: npm run lint
```

**关键参数**：

| 维度 | 取值 |
|------|------|
| OS | ubuntu / macos / windows |
| Node | 18 / 20 / 22 |
| 排除 | 已知不兼容组合 |

**最佳实践**：

- ✅ OS × Node 双维度矩阵——兼容性全覆盖
- ✅ `exclude` 排除已知不兼容——节省 CI 时间
- ✅ Lint、TypeCheck、Test 三个 job 并行——反馈快
- ✅ 缓存 `~/.npm` + `node_modules`——加速 CI
- ❌ 避免仅测单一平台——bug 漏网

### 模式 20：Go 重写（typescript-go）作为长期演进

**问题场景**：TypeScript checker 5.4 万行单文件 IIFE 是历史包袱。JavaScript 单线程闭包无法用多核，并行能力受限。性能遇到天花板。

**解决方案**：

```go
// microsoft/typescript-go (7.0)
// API 100% 兼容 TypeScript 5.x
// 性能目标：启动 10x，内存 1/10
// 用 Go 替代 JS：原生并发（goroutine）、编译型、AOT 优化

// 用户无需改代码
import * as ts from "typescript";
const program = ts.createProgram(...);  // 7.0 由 Go 实现
```

**关键参数**：

| 维度 | JS 版本 | Go 版本 |
|------|---------|---------|
| 启动 | 1x | 10x |
| 内存 | 1x | 1/10 |
| 并行 | 受限 | 充分利用多核 |
| API 兼容 | 100% | 100% |

**最佳实践**：

- ✅ 性能瓶颈成体验瓶颈时——换底层语言
- ✅ API 100% 兼容——用户无感
- ✅ 行为对齐测试（BAT）——保证 5.x → 7.x 行为一致
- ✅ `microsoft/typescript-go` 单独仓库——渐进迁移
- ❌ 避免"边升级边重写"——会破坏兼容性

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\typescript-fresh\` |
| 主语言 | TypeScript（自举） |
| License | Apache-2.0 |
| 总文件 | 4904 |
| 核心代码 | `src/compiler/` 743 文件 |
| 关键文件 | `checker.ts`（5.4万行）、`parser.ts`（10823行）、`program.ts`（5201行） |

## 一句话总结

TypeScript 的精髓在不可变 AST + side-channel 标注（多 transformer 复用） + Host 抽象（CLI/Worker/IDE 复用） + BuilderProgram 两层缓存（增量编译） + single-file IIFE 闭包（信息全热场景的最优解）五件套——任何"工业级静态分析器 + 复杂流水线 + 跨环境复用"项目都适用。Node/浏览器双入口（`package.json#browser`）+ `tsbuildinfo` 跨进程缓存 + 行为对齐测试（Go 重写兼容）三件基础设施可直接复用到任何"重型 CLI 工具"。
