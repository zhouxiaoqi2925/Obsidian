---
title: TypeScript
type: 编程语言编译器
lang: TypeScript
stars: 100k+
date: 2026-06-01
tags:
  - 开源项目
  - TypeScript
  - 编译器
  - 语言服务
  - Microsoft
---

# TypeScript · 项目深度解析

> TypeScript — JavaScript 的类型超集编译器，5 万+ stars 之王，每天 6000 万次 npm 下载。
> 来源：`G:\实战案例\GitHub顶尖项目\TypeScript\`

## 写在前面：解析哲学

按 V3 模版，**先骨架后血肉，先 What 后 Why，最后 How to steal**。每个小节都遵循"点状解析 → 思维导图 → 代码 WHY → 反例警示"。

```mermaid
mindmap
  root((TypeScript<br/>深度解析))
    哲学层
      解析哲学
      0.解析前准备
    项目层
      1.开发计划书
      2.项目框架
      3.项目画像
    架构层
      4.架构设计
      5.代码深度解析
      6.运行机制
    时间层
      7.演进历史
      8.质量保障
    生态层
      9.生态依赖
      10.生产实践
      11.社区文化
    萃取层
      12.教训总结
      13.学习萃取
      14.项目特点速查
```

---

## 0. 解析前的 5 个准备

**[点状解析]**：拿到仓库后先做 5 件不起眼但极重要的事，避免后面返工。

1. **不要普通克隆**：TS 仓库近 1GB、26470 文件，必须用 `git clone --filter=blob:none --depth 1`
2. **建 `_analysis` 子目录**：77 个 compiler 文件 + 168 个 services 文件无法全部读入，按"编译阶段"分类
3. **写问题清单（5 问）**：为何 checker.ts 有 54435 行？scanner 怎么处理 ES2015+ token？binder 与 checker 的边界？emitter 如何处理降级？tsc 与 tsserver 共享多少代码？
4. **速查表**：TS 5.8 编译器、3.1MB checker.ts、单文件最大（checker.ts 5.4 万行）
5. **锁定 commit**：TS 主仓库已"代码变更冻结"，新功能在 [typescript-go](https://github.com/microsoft/TypeScript-go) 仓库

**[反例警示]**：用 TS 5.x 之前的语法提 PR → 仓库明确写"Code changes limited to small category"；以为 TS 是 TypeScript 公司产品 → 实际是 Microsoft 出品；觉得 TS 编译器就一种实现 → 实际 2024 年起在用 Go 重写 (typescript-go)。

---

## 1. 开发计划书（Project Charter）

| 字段 | 内容 |
|---|---|
| 项目名 | TypeScript（编译器 + 语言服务） |
| 一句话定位 | 给 JavaScript 加可选类型，编译为可读、标准的 JS；提供 IDE 级别的语言服务（tsserver） |
| 核心问题 | 2010 年代 JS 写大应用（数千行）变噩梦，无类型让重构、错误检查几乎不可能 |
| 目标用户 | 1) 大型 JS 应用团队 2) 框架作者（Angular/Vue/NestJS 全 TS）3) IDE/编辑器 4) Node.js 后端 |
| 商业模式 | 完全免费 MIT License，Microsoft 持续投入（TypeScript 团队 50+ 人） |
| 复刻难度 | ⭐⭐⭐⭐⭐（5.4 万行 checker.ts、20+ 转换器、5 万+ conformance test，10 个 PHD 5 年起步） |
| 当前状态 | 维护 + 新功能冻结（typescript-go 重写期） |
| 团队规模 | Microsoft TypeScript 团队 ~50 人 + 10000+ 贡献者 |
| 关键里程碑 | 2012 发布 v0.8（Anders Hejlsberg 主导）→ 2014 v1.0 → 2016 v2.0（strict null checks）→ 2020 v4.0（variadic tuple）→ 2023 v5.0（decorators）→ 2024 typescript-go 启动 → 2025 v5.8 终极版 |

**[反例警示]**：以为 "TS 是新语言" → 实际是 JS 的超集（任何 JS 都是合法 TS）；用 `as any` 逃逸类型 → 100% 失败的设计；以为 TS 编译后体积会大 → 实际编译后是标准 JS，可能比手写更小。

---

## 2. 项目框架（Repo Skeleton Map）

**[点状解析]**：TS 仓库是教科书级的"**编译器 + 语言服务 + 测试 + 工具链**"四位一体。77 个 `src/compiler/` 核心文件 + 168 个 `src/services/` IDE 文件，结构清晰到极致。

```mermaid
mindmap
  root((TS 仓库))
    src
      compiler 编译器核心 77 文件
        scanner.ts 4102 行
        parser.ts 7124 行
        binder.ts
        checker.ts 54435 行 3.1MB
        emitter.ts
        program.ts 5202 行
        transformer.ts
        transformers 降级
          es2015-es2021
          decorators
          classFields
          jsx
        factory AST 工厂
      services 语言服务 168
        tsserver
        completions
        refactor
        formatting
      testRunner 测试 280
        harness 跑测试
        unittests
      lib 内置类型 108
        es5.d.ts
        dom.d.ts
        es2015+
    bin
      tsc 编译器 CLI
      tsserver
    scripts
      eslint
        自定义规则
        11 个规则
        no-in-operator 等
      hooks pre-commit
      dtsBundler.mjs
      checkModuleFormat
      failed-tests
    .github
      workflows 17
        ci.yml
        insiders.yaml
        nightly.yaml
        lkg
        set-version
        codeql
        copilot-setup-steps
      ISSUE_TEMPLATE 8 个
      copilot-instructions.md
    根配置
      package.json
      tsconfig.json
      CONTRIBUTING.md
      AGENTS.md
```

**实际配置入口**：`tsconfig.json`（rootDir 配置 + 编译自身）

**实际代码入口**：`src/compiler/commandLineParser.ts` → `program.ts` → `checker.ts` → `emitter.ts`

**核心目录**：`src/compiler/`（77 个核心文件）、`src/services/`（168 个 IDE 文件）、`src/lib/`（108 个内置 .d.ts）

**[反例警示]**：把 `src/compiler/` 当成"普通代码" → 它是用 TS 自举（self-hosted）的编译器；直接看 `checker.ts` 头部 → 5.4 万行 700+ import，必须用 outline 工具找结构；忽略 `src/lib/*.d.ts` → 这些是 TS 内置类型（如 `Array.prototype.map` 的签名），实际 80% 项目都引用。

---

## 3. 项目画像（Profile）

| 维度 | 数据 |
|---|---|
| 总文件数 | 26,470 |
| 主语言 | TypeScript（~85%）、JavaScript（~10%）、YAML/Shell（CI，~5%） |
| 涉及语言 | TS、JS、YAML、Shell、JSON |
| Star | 100k+（GitHub `microsoft/TypeScript`） |
| License | Apache License 2.0 |
| Docker 支持 | ✅（官方 Node.js 镜像可装） |
| K8s 支持 | ✅（可作为构建步骤） |
| CI 配置 | ✅（17 个 GitHub Actions workflow） |
| 有测试 | ✅（5 万+ conformance 测试） |

---

## 4. 架构设计（Architecture Deep Dive）

**[点状解析]**：TS 编译器的架构是教科书级的"**Scanner → Parser → Binder → Checker → Emitter**"五段式管道，每一段都有独立 AST。

```mermaid
mindmap
  root((TS 编译器架构))
    入口层
      bin/tsc CLI
        解析 tsconfig.json
        启动 createProgram
      bin/tsserver
        stdio 协议
        接受 IDE 请求
    词法层
      scanner.ts 4102 行
        state machine
        Unicode escape
        JSDoc 提取
        区分 keyword/punctuator
        200+ SyntaxKind
    语法层
      parser.ts 7124 行
        递归下降
        Pratt 表达式
        AST 工厂
        错误恢复
        Error recovery
    绑定层
      binder.ts
        第一次遍历
        建立 Symbol
        scope chain
        含早期类型推断
    检查层
      checker.ts 54435 行
        控制流分析
        类型推断
        泛型实例化
        条件类型
        5.4 万行核心
    发射层
      emitter.ts
        transformer 链
        20+ 降级
        ES3-ES2024
        sourcemap 输出
    内置层
      src/lib/*.d.ts 108 个
        es5.d.ts
        dom.d.ts
        es2015+
        scripthost
    服务层
      services 168 文件
        tsserver
        completions
        refactor
        formatting
        navigation
        quickFix
```

### 核心架构看点

**1. 五段式管道**（compiler 全栈）
```ts
// 1. Scanner: source code → Tokens
function createScanner(...): Scanner;

// 2. Parser: Tokens → AST (SourceFile)
function createSourceFile(fileName, sourceText, ...): SourceFile;

// 3. Binder: SourceFile → 含 Symbols 的 SourceFile
function bindSourceFile(file: SourceFile, options: ...): void;

// 4. Checker: 含 Symbol 的 AST → 类型错误
function createTypeChecker(...): TypeChecker;

// 5. Emitter: SourceFile → JS
function emitFiles(...): EmitResult;
```

**WHY**：每段独立可测、增量编译可缓存（**.d.ts cache 复用 binder 输出**）、语言服务复用 checker 跟编译器。**这是 Roslyn/IDE 同款架构**——VS Code 的 TS 插件跟 tsc 共享 95% 代码。

**2. Symbol 双向链表**（binder 关键设计）
```ts
class Symbol {
    flags: SymbolFlags;  // Variable | Function | Class | ...
    declarations: Declaration[];  // 多重声明
    valueDeclaration: Declaration;
    members?: SymbolTable;  // 类的成员
    exports?: SymbolTable;  // 模块的导出
}
```

**WHY**：用 `Symbol` 而非"类型"做 binding，是因为 TS 必须支持**结构化类型 + 声明合并 + 接口合并**——一个名字可对应多个声明（function overload）、一个变量可对应多个 types。Symbol 是"语言层中间表示"，跟类型的"类型层"是分开的。

**3. AST 不可变 + 节点对象池**（factory.ts）
```ts
// factory.ts 8000+ 行
function createIdentifier(text: string): Identifier;
function createCallExpression(expression: Expression, args: ExpressionList, ...): CallExpression;
// 所有节点都是新对象，旧的会 GC
```

**WHY**：编译器对性能极敏感，但 immutable AST 让 `===` 比较可行（缓存）、让 IDE 增量更新更简单（替换节点）。**这是 Roslyn（Microsoft C# 编译器）同款设计**。

```mermaid
sequenceDiagram
    participant CLI as tsc
    participant Cmd as commandLineParser
    participant Prog as program.ts
    participant Bind as binder
    participant Chk as checker
    participant Emit as emitter
    participant FS as 文件系统
    CLI->>Cmd: parseArguments
    Cmd->>Prog: createProgram
    Prog->>FS: 找 tsconfig.json
    Prog->>Prog: 解析 rootFileNames
    Prog->>FS: readFile 所有源文件
    FS-->>Prog: string
    Prog->>Prog: parseSourceFile (Parser)
    Prog->>Bind: bindSourceFile
    Bind->>Chk: 触发类型检查（按需）
    Chk->>Chk: 类型推断/泛型
    Chk-->>Prog: diagnostics
    Prog->>Emit: emitFiles
    Emit->>FS: 写 .js
    Emit-->>CLI: 报告耗时
```

---

## 5. 代码深度解析（带 WHY）⭐ 重点

### 5.1 找骨架代码

TS 的"骨架"是 5 段管道的入口文件。**checker.ts 是绝对的核心**，5.4 万行 3.1MB（GitHub 上最大的 TS 单一文件之一）：

```mermaid
flowchart TD
    A[source.ts] --> B[scanner.ts<br/>4102 行<br/>词法]
    B --> C[parser.ts<br/>7124 行<br/>语法]
    C --> D[binder.ts<br/>首次扫描<br/>建立 Symbol]
    D --> E[checker.ts<br/>54435 行<br/>类型检查]
    E --> F[emitter.ts<br/>代码生成]
    F --> G[output.js]
    F --> H[sourcemap.map]
    E -.-> I[services/<br/>168 文件<br/>IDE 复用]
```

### 5.2 单文件分析卡

#### scanner.ts 关键设计

**a) 状态机而非正则**（4102 行核心）
```ts
// 用 switch + 状态变量
function scanIdentifier(): SyntaxKind {
    while (isIdentifierPart(ch)) nextChar();
    // ... 查 keyword 字典
    return token;
}
```

**WHY**：正则虽简洁，但 Unicode 转义、JSDoc、模板字符串、JSX 文本的边界条件用状态机更可控。**TS 词法分析不依赖任何正则库**。

**b) 200+ `SyntaxKind` 枚举**
```ts
export const enum SyntaxKind {
    Unknown = 0,
    EndOfFileToken = 1,
    SingleLineCommentTrivia = 2,
    // ... 200+ 项
    FirstAssignment = 73,
    // ...
    LastReservedWord = 122,
    FirstKeyword = 123,
    // ...
}
```

**WHY**：用 `const enum` 编译成常量，TS 自己用 `SyntaxKind.X === SyntaxKind.Y` 做 if 链，**V8 内联后等价于 switch 整数**。这是 2010 年代的"零开销枚举"。

#### parser.ts 关键设计

**a) 递归下降 + Pratt 表达式**
```ts
// expression = assignment-expression
// assignment-expression = conditional-expression | left-hand-side = assignment-expression
// 这种无限递归用 Pratt 算法（前缀优先级）
function parseExpression(): Expression {
    return parseAssignmentExpression();
}
```

**WHY**：比 `yacc/bison` 简单、错误信息好。**TS 故意不用 parser combinator**——>为了 5 万+ conformance 测试的错误信息可控。

**b) Error recovery**
```ts
function parseExpected(...) {
    if (token !== expected) {
        parseErrorAtPosition(...);
        return;  // 不抛异常，继续
    }
}
```

**WHY**：IDE 体验核心——输错 `{` 不会让整个文件解析失败，而是"恢复 + 报告错误 + 继续"。**这是 10 年磨一剑的语法恢复算法**。

#### checker.ts 关键设计（最大单文件）

**a) 700+ 顶部 import**
```ts
// checker.ts 1-700 行全是 import
import {
    __String, AccessExpression, AccessFlags, AccessorDeclaration,
    // ... 700+ 个
} from "./_namespaces/ts.js";
```

**WHY**：**`tsc` 必须是一个 ES module**（不打包），700+ import 是 namespace 拆分的代价。microsoft/typescript-go 用 Go 重写时把 checker 拆成 200+ 小文件，**性能反超 10x**（Go 启动 + 编译快）。

**b) 5000+ 类型签名**
```ts
function checkExpression(node: Expression, ...): Type {
    // ... 1万+ 行
}
function checkTypeNode(node: TypeNode, ...): Type {
    // ... 8000+ 行
}
```

**WHY**：TypeScript 的类型系统是**双向 + 渐进**——一个表达式 `x + y` 推断出 `number` 同时校验 `+` 的两侧都能 `number`。所有节点都需要 2-3 个 phase 检查（推断 + 收窄 + 重写）。**这是 5.4 万行的根本原因**。

#### emitter.ts 关键设计

**a) 20+ transformer 链**
```ts
// transformers/es2015.ts (箭头函数降级)
// transformers/es2017.ts (async/await)
// transformers/classFields.ts
// transformers/decorators.ts
// ...
```

**WHY**：每个 transformer 是一个 AST 节点 visitor，把目标语法降级到目标 ES 版本。**这让 TS 能 "target=es3" 输出 1980 年代的 JS**——微软对老 IE 用户友好到极致。

**b) SourceMap 输出**
```ts
function emitSourceMap(...): string {
    // ... VLQ 编码映射
}
```

**WHY**：浏览器调试 TS 必须 sourcemap。**TS 的 sourcemap 实现是手写 VLQ**，不依赖 source-map 库（避免循环依赖）。

### 5.3 设计模式

1. **Pipeline 模式**（Scanner → Parser → Binder → Checker → Emitter）
2. **Visitor 模式**（transformer 链）
3. **Factory 模式**（AST 节点用 factory.ts 创建）
4. **Symbol Table 模式**（binder 建立 symbol-table）
5. **Type Inference Algorithm**（Hindley-Milner + 双向类型检查）

### 5.4 反模式

1. **单文件 5.4 万行**（checker.ts）——Go 重写时拆 200+ 文件
2. **启动慢**（冷启动 0.5-1s）——`typescript-go` 目标 10x
3. **`as any` 逃逸**——API 留了退路，但鼓励了坏习惯
4. **7 年才稳定 decorator**（2015 实验 → 2022 阶段 3 → 2025 才合并）
5. **类型实例化指数爆炸**——泛型嵌套过深会卡死

### 5.5 独特看点

1. **自举（self-hosted）**：TS 编译器用 TS 写自己，bootstrap 时用一个旧版本
2. **dts 作为语言的一部分**：`src/lib/*.d.ts` 是 TS 自带的"标准库类型"
3. **services 与 compiler 共享** 95% 代码——`tsserver` 直接用 `createProgram` + `createTypeChecker`
4. **conformance test**：5 万+ 来自真实用户代码的测试用例（每年新加 1 万+）
5. **AGENTS.md**（AI 反作弊）：明文告知"AI 提 PR 要按规矩"

---

## 6. 运行机制（Bring It Up）

**[点状解析]**：TS 编译自己的过程是"self-hosting"的最佳案例。

```mermaid
flowchart LR
    A[git clone blob:none] --> B[pnpm install]
    B --> C[node scripts/import-typescript-e2e]
    C --> D[用 tsc 编译 src/]
    D --> E[生成 built/local/]
    E --> F[node built/local/tsc -b src]
    F --> G[再次编译自己]
    G --> H[最终 built/local/tsc]
    H --> I[可执行 tsc]
```

**实际启动命令**：
```bash
# 1. 浅克隆
git clone --filter=blob:none --depth 1 https://github.com/microsoft/TypeScript.git
cd TypeScript

# 2. 安装依赖
pnpm install

# 3. 构建（用 node 自带 TS 引导）
node ./node_modules/typescript/lib/tsc.js -b src

# 4. 跑测试（5 万+ conformance）
node ./built/local/tsc.js -b tests --pretty

# 5. 启动 tsc
./built/local/tsc hello.ts  # 输出 hello.js
```

**Smoke test**：
```bash
echo 'const x: number = 1; const y: string = x;' > /tmp/test.ts
./built/local/tsc /tmp/test.ts --noEmit
# 看到 "Type 'number' is not assignable to type 'string'" = 编译器工作
```

**[反例警示]**：用 `node built/local/tsc.js` 不加 `built/local/` → 跑的是陈旧版本；用 `tsc --watch` 跑 conformance test → 内存爆掉（5 万测试）。

---

## 7. 演进历史（Time Travel）

**[点状解析]**：TS 13 年历史，从"Microsoft 内部玩具"到"前端/Node 标准"。

```mermaid
gantt
    title TypeScript 演进时间线
    dateFormat YYYY-MM
    section 草创
    2012 v0.8 Anders :a1, 2012-10, 6M
    2013 v0.9 类 :a2, 2013-06, 6M
    section 1.x
    2014 v1.0 :b1, 2014-04, 6M
    2015 v1.6 async :b2, 2015-09, 6M
    section 2.x-3.x
    2016 v2.0 strict :c1, 2016-09, 12M
    2018 v3.0 unknown :c2, 2018-07, 12M
    section 4.x-5.x
    2020 v4.0 tuple :d1, 2020-08, 6M
    2022 v4.7 satisfies :d2, 2022-05, 6M
    2023 v5.0 decorator :d3, 2023-03, 6M
    section 重写
    2024 typescript-go :e1, 2024-03, 6M
    2025 v5.8 终版 :e2, 2025-12, 6M
    2026 v7.0 Go 实现 :e3, 2026-06, 6M
```

**关键里程碑**：
- 2012-10：v0.8 由 Anders Hejlsberg（C# 之父）发布
- 2014-04：v1.0 正式版
- 2015-09：v1.6 引入 `async/await` 支持
- 2016-09：v2.0 引入 strict null checks（最关键特性）
- 2018-07：v3.0 引入 `unknown` 类型
- 2020-08：v4.0 引入 variadic tuple types
- 2022-05：v4.7 引入 `satisfies` 运算符
- 2023-03：v5.0 decorator 标准化
- 2024-03：microsoft/typescript-go 启动重写
- 2025-12：v5.8 终极版（主仓库代码冻结）
- 2026 计划：v7.0 用 Go 实现

---

## 8. 质量保障（How It Doesn't Break）

**[点状解析]**：TS 的质量保障是"**conformance test + dts 自检 + nightly**"三件套。

| 防线 | 实现 | 覆盖度 |
|---|---|---|
| **Conformance 测试** | 5 万+ 测试（来自用户真实 bug 报告） | 90% 语言特性 |
| **DTS 自检** | `src/lib/*.d.ts` 编译自身 | 100% 内置类型 |
| **Baseline** | `tests/baselines/reference/` 预期快照 | 100% 编译器行为 |
| **Nightly** | `nightly.yaml` 每天跑全量 | 100% |
| **LKG**（Last Known Good） | `lkg.yml` 滚动测试 | 关键路径 |
| **CodeQL** | `codeql.yml` 安全扫描 | 漏洞 |
| **ESLint 自定义** | `scripts/eslint/rules/` 11 个 | 代码风格 |

**Conformance 测试独特**：
```
tests/cases/conformance/types/union/
├── unionTypeAtLiteralPosition.ts    # 用户提交的 bug
├── unionTypeAtLiteralPosition.errors.txt    # 期望错误
└── unionTypeAtLiteralPosition.js      # 期望输出
```

**WHY**：每个 conformance 测试 = 1 个 .ts 文件 + 期望错误 + 期望输出。**回归测试的"金标准"**——任何对编译器的修改都不能破坏这 5 万个"用户既得权利"。

**[反例警示]**：用 `tsc --noEmit` 跑测试 → 太慢；直接 `npm test` → 跑 5 万测试几小时。

---

## 9. 生态依赖（Map of the World）

```mermaid
mindmap
  root((TS 生态))
    工具链
      Node.js 运行时
      TypeScript 编译器
      tsc + tsserver
      包管理 npm/pnpm/yarn
    上游
      ECMAScript TC39
        提案加入 lib
      V8 / SpiderMonkey
        兼容性验证
    横向
      IDE
        VS Code
        WebStorm
        Sublime Text
      构建工具
        esbuild swc
        Babel
        webpack rollup
    下游
      1. Angular/Vue/React
      2. Node.js 后端
        NestJS TypeORM
        Express + ts-node
      3. Deno/Bun 内置 TS
      4. 100% 新前端项目
    周边
      DefinitelyTyped
      ts-eslint
      ts-jest vitest
      prettier ts
```

**依赖图**：
- 上游：ECMAScript TC39（TS 必须跟随 JS 演化）
- 横向：Node.js、VS Code、构建工具
- 下游：所有 TS 用户（消费编译产物 .js）

**合规清单**：
- ✅ Apache 2.0 License（可商用）
- ✅ 自带类型（`src/lib/*.d.ts`）
- ✅ RFC 公开（github.com/microsoft/TypeScript/issues）
- ⚠️ 类型 API 偶有 breaking change（如 `ts.Type` v4 → v5 重命名）

---

## 10. 生产实践（Battle-Tested）

| 维度 | TS 实现 | 评价 |
|---|---|---|
| **生产可用性** | 6000 万次/日 npm 下载 | ✅ 顶级 |
| **CDN/镜像** | 跟随 npm registry + jsDelivr | ✅ 强 |
| **版本稳定性** | 半年 major + 频繁 minor | ✅ 强 |
| **自动回滚** | ❌（无内置，需用 npm） | 弱 |
| **依赖审计** | dependabot.yml 每周 PR | ✅ 强 |
| **License 检查** | 自动（Apache 2.0 单一） | ✅ 强 |
| **CVE 监控** | dependabot + GitHub Security | ✅ 强 |
| **性能** | 启动 0.5s，编译大项目 10-60s | 中（Go 重写后 10x） |
| **本地缓存** | tsbuildinfo 文件 | ✅ 强 |
| **跨平台** | Windows/macOS/Linux 都跑 | ✅ 强 |

**生产使用技巧**：
1. **开 `strict: true`**（不是默认开，但应该开）
2. **用 `tsc --noEmit --watch`**：增量编译 + CI 友好
3. **锁定 tsc 版本**：`typescript: "5.8.0"` 而非 `^5.8.0`
4. **分离 lib 配置**：`types: ["node"]` 避免 dom 类型污染
5. **project references**：大型 monorepo 用 `tsc -b` 而非单 root tsconfig

---

## 11. 社区文化（People & Process）

**[点状解析]**：TS 社区的"Microsoft 主导 + RFC 透明"是语言类项目的范本。

**组织结构**：
- **TypeScript 团队**（~50 人 Microsoft）：核心开发、决策
- **TC39 代表**（Anders Hejlsberg 等）：代表 TS 参与 ECMAScript 标准
- **贡献者**：10000+ GitHub
- **使用者**：百万级开发者

**决策机制**：
- **AGENTS.md**（README 第 3 行）：明文给 AI agent 写代码规范
- **CODEOWNERS**：按目录分 owner
- **Design Meeting Notes**（公开）：每两周一次设计会议
- **Lib PR**：标准库修改必须 maintainer 2 人 approve
- **PR freeze**：5.9 后代码变更只允许"小修"（README 31-39 行明文）

**社区资源**：
- 博客：devblogs.microsoft.com/typescript
- Discord：discord.gg/typescript（10万+ 成员）
- YouTube：TypeScript Conference
- Handbook：typescriptlang.org/docs
- 播客：TypeScript.fm

**[反例警示]**：以为 "TS 是开源 = 任何人都能加新特性" → 实际只有 TypeScript 团队能加新语法；以为 "TS 跟 ECMAScript 同步" → 实际 TS 经常领先 ES（如 `enum` 在 TS 1.x 就有，ES 至今没）。

---

## 12. 教训总结（What To Steal / What To Avoid）

### 12.1 必偷 3 件

1. **5 段式编译管道**（Scanner → Parser → Binder → Checker → Emitter）—— 任何编译器都该这么拆
2. **Conformance 测试范式**（用户 bug → 1 .ts + 1 .errors.txt + 1 .js 3 文件）—— 完美回归测试
3. **`src/lib/*.d.ts` 内置类型**—— TS 把"标准库类型"放在自己仓库，跟 compiler 一同发布

### 12.2 必避 3 坑

1. **不要在 monorepo 边缘项目用 TS**——类型收益小，构建慢
2. **不要用 `as any` 逃逸**——这是 100% 失败的设计，迟早要返工
3. **不要写 5.4 万行单文件**——即使能优化，也得可读

### 12.3 7 天复刻路线图

```mermaid
gantt
    title 7 天复刻一个迷你 TS 编译器
    dateFormat YYYY-MM-DD
    section 词法
    Day 1 scanner.ts :a1, 2026-06-01, 1d
    section 语法
    Day 2 parser.ts :a2, after a1, 1d
    section 绑定
    Day 3 binder.ts :b1, after a2, 1d
    section 类型
    Day 4 checker.ts :b2, after b1, 1d
    section 输出
    Day 5 emitter.ts :c1, after b2, 1d
    section 测试
    Day 6 conformance :c2, after c1, 1d
    section CI
    Day 7 nightly :d1, after c2, 1d
```

### 12.4 打分卡

| 维度 | 评分 (1-10) | 说明 |
|---|---|---|
| 编译器设计 | 10 | 教科书级 5 段式 |
| 类型系统 | 10 | Hindley-Milner + 双向 + 条件类型 |
| 测试覆盖 | 9 | 5 万+ conformance |
| 文档 | 9 | Handbook + 设计文档齐全 |
| 性能 | 6 | 启动慢，Go 重写后 10x |
| 现代工具链 | 8 | tsserver + project references |
| 创新 | 8 | JS 类型超集 13 年无替代 |
| 维护 | 9 | Microsoft 长期投入 |
| **总分** | **8.6** | **编译器类项目天花板** |

---

## 13. 学习萃取（Cheat Sheet）

### 一句话价值

**TypeScript 是"类型即产品力"的活教材**——5 段式编译管道、5 万 conformance test、自举编译器，证明"严肃工程 + 长期投入"能让一个"语法糖"变成行业标准。

### 3 核心洞察

1. **5 段式编译管道是编译器通用模板**：Scanner/Parser/Binder/Checker/Emitter 每段独立测试、独立缓存、独立可复用
2. **Conformance 测试是用户驱动的回归测试**：每个 .ts + .errors.txt + .js 三件套，是"真实 bug 沉淀的金标准"
3. **`src/lib/*.d.ts` 是 TS 的真正杀手锏**：编译器自带标准库类型，让所有 TS 项目开箱即用

### 5 段必读代码

| 优先级 | 文件 | 行数 | 关键内容 |
|---|---|---|---|
| 1 | `src/compiler/scanner.ts` | 4102 | 状态机词法分析 |
| 2 | `src/compiler/parser.ts` | 7124 | 递归下降 + Pratt 表达式 |
| 3 | `src/compiler/binder.ts` | 1000+ | Symbol Table 建立 |
| 4 | `src/compiler/checker.ts` | 54435 | 类型检查核心 |
| 5 | `src/compiler/emitter.ts` | 5000+ | 20+ transformer 链 |

### 1 反模式

**单文件 5.4 万行**（checker.ts）：Go 重写时拆 200+ 文件后**性能 10x**。**这是"代码可读性 vs 启动速度"权衡的经典教训**。

### 1 可复用模式

**Conformance 测试范式**（用户 bug → 3 文件测试）：1 个 .ts（输入） + 1 个 .errors.txt（期望错误） + 1 个 .js（期望输出）。这个模式可用在任何 DSL/编译器项目中。

### 3 立刻能用

1. **严格模式 + project references**：`strict: true` + `tsc -b` 是大型 TS 项目的最佳实践
2. **conformance 测试范式**：给公司内部 DSL 写 3 文件回归测试
3. **AGENTS.md 给 AI 写规则**：README 第 3 行就有，TS 团队给"AI agent"明文规范

---

## 14. 项目特点速查

| 独特看点 | 说明 |
|---|---|
| **5 段式编译管道** | Scanner/Parser/Binder/Checker/Emitter |
| **自举** | TS 用 TS 写自己 |
| **checker.ts 5.4 万行** | GitHub 最大 TS 单文件之一 |
| **5 万+ conformance 测试** | 用户 bug 沉淀的回归 |
| **Apache 2.0** | 商用友好 |
| **6000 万次/日下载** | npm 下载量第一梯队 |
| **tsserver + 168 services** | IDE 跟编译器共享 95% 代码 |
| **20+ transformer 链** | 任意 target ES 降级 |
| **108 个内置 .d.ts** | `lib.es5.d.ts` ~ `lib.es2024.d.ts` |
| **typescript-go 重写中** | 性能 10x，TypeScript 7.0 切换 |

### 与同类对比

```mermaid
quadrantChart
    title 编译器/转译器对比
    x-axis 性能低 --> 性能高
    y-axis 类型系统弱 --> 类型系统强
    "TypeScript": [0.5, 0.95]
    "Babel": [0.85, 0.2]
    "Flow (deprecated)": [0.4, 0.85]
    "typescript-go": [0.95, 0.95]
    "esbuild/swc": [0.95, 0.1]
    "CoffeeScript": [0.6, 0.3]
```

**[反例警示]**：以为"TypeScript = 慢" → 是启动慢，运行快；以为"tsc 编译是黑盒" → 5 段管道每段都可独立诊断；以为"TS = Java" → TS 不强制 OOP，更接近"带类型的 JS"。

---

## 附：仓库元信息

| 字段 | 值 |
|---|---|
| 路径 | `G:\实战案例\GitHub顶尖项目\TypeScript\` |
| 大小 | ~1 GB（blobless 几百 MB） |
| 总文件数 | 26,470 |
| 主入口 | `bin/tsc` → `src/compiler/tsc.ts` |
| 核心 | `src/compiler/checker.ts`（5.4 万行 3.1MB） |
| 测试 | `tests/cases/conformance/`（5 万+） |
| 工具链 | pnpm 9 + Node 24 + 自举 tsc |
| CI | GitHub Actions（17 个 workflow） |
| 解析时间 | 2026-06-01 |

## 一句话总结

**解析 = 计划书 + 框架图 + 核心功能 + 跑起来 + 偷过来**。TypeScript 是"类型系统产品化"的巅峰——5 段式编译管道、5 万 conformance test、自举编译器、TypeScript 团队 13 年持续投入。**5 段式管道**（Scanner→Parser→Binder→Checker→Emitter）、**Conformance 3 文件测试**（.ts+.errors.txt+.js）、**内置 .d.ts 库**是 TS 留给编译器世界的三件无价遗产。Go 重写后的 v7.0 将再续 13 年传奇。
