# typescript-fresh - TypeScript 编译器的五段流水线与不可变 AST 增量构建典范

**GitHub**: microsoft/TypeScript
**Star**: 100k+
**语言**: TypeScript
**主题**: 编译器 / AST / 类型系统 / 增量构建
**适用场景**: 静态分析 + IDE 智能感知 + 代码转换 + linter 工具

> TypeScript 编译器把"词法 → 语法 → 语义 → 类型 → 代码生成"拆成五段独立流水线，AST 不可变（`ts.factory.updateXxx` 创建新节点）+ side-channel 补充信息（不破坏不可变性），Project References 实现多项目增量。整套设计是"编译器作为库"的工程范本——tsserver 把同一套 Program 暴露给 VS Code，让 IDE 响应 < 100ms。

## 第一段：基础范式（模式 1-5）

### 模式 1 · Scanner/Parser/Binder/Checker/Emitter 五段流水线

**问题场景**：编译器功能复杂（词法/语法/语义/类型/代码生成），如果用单趟 pipeline 难以维护和优化（typecheck vs emit 性能差异 10x）。

**解决方案**：TypeScript 拆分为五段独立流水线——Scanner（源码 → tokens，保留 trivia 用于错误恢复与 sourcemap）、Parser（tokens → AST，递归下降）、Binder（AST → 符号表，scope/identifier 解析）、Checker（类型检查 + 类型推断，消费 symbol + type）、Emitter（AST + 类型 → JS 代码）。

**关键参数**：
- `Scanner` 流式词法
- `Parser` 生成 `Node` 树
- `Binder` 产出 `Symbol`
- `Checker` 输出 `Diagnostic`
- `Emitter` 生成 `.js` / `.d.ts`

**最佳实践**：理解五段边界——`ts.createSourceFile` 只跑 Scanner+Parser；`program.getSemanticDiagnostics` 跑 Binder+Checker；用 `--noEmit` 跳过 Emitter 加快类型检查。

### 模式 2 · 不可变 AST（SyntaxKind 枚举 + Node 接口）

**问题场景**：编译器需对 AST 做大量变换（类型擦除 + 转换器），可变树会引入共享状态 bug；IDE 还要做"语法树 vs 改后树"对比。

**解决方案**：TypeScript AST 是不可变树（`createXxx` 工厂创建新节点，原节点不变）。每个节点带 `kind: SyntaxKind` 枚举 + `pos` / `end` 文本位置 + `parent` 反向指针。`Node` 接口用访问者模式 `forEachChild`。

**关键参数**：
- `SyntaxKind` 枚举数百种
- `Node.kind` 区分类型
- `Node.pos` / `Node.end` 位置
- `Node.flags` 标志位
- `ts.visitNode` 不可变变换

**最佳实践**：用 `ts.factory.updateXxx` 创建修改后的节点（保留位置）；用 `ts.transform` 跑转换器链；不要直接修改 `Node` 字段（破坏不可变性）。

### 模式 3 · side-channel 标注（SourceFile 携带辅助信息）

**问题场景**：编译器内部需要补充信息（节点已绑定 + 文件已解析），但又不能改 AST 本身（IDE 缓存）。

**解决方案**：用"边车"（side-channel）对象存额外信息——`SourceFile` 自带 `bindDiagnostics` / `parseDiagnostics`；Checker 内部用 `Node` 到 `Symbol` / `Type` 的 map 维护。`Node` 不变，map 单独存。

**关键参数**：
- `SourceFile.bindDiagnostics` 绑定错误
- `SourceFile.languageVersion` TS 版本
- `SourceFile.resolvedModules` 解析缓存
- 内部 `nodeLinks` map
- `program.getResolvedModule()` 外部 API

**最佳实践**：用 `getResolvedModule` 而不是手动解析 import；用 `node.moduleAugmentations` 处理模块增强；side-channel 是"在不破坏不可变性的前提下补充信息"的标准做法。

### 模式 4 · Symbol 符号表与作用域

**问题场景**：标识符解析（`foo` 是什么？）需要嵌套作用域（全局/模块/函数/block）；同名标识符在不同作用域指向不同实体。

**解决方案**：Binder 把每个 `Identifier` 解析为 `Symbol` 对象（name/flags/declarations）。`Symbol` 通过 `parent` 链形成作用域树，查找时沿作用域链向上找。

**关键参数**：
- `Symbol.flags`（`Function` / `Variable` / `Class` / `ValueModule` 等）
- `Symbol.declarations` 所有声明
- `Symbol.valueDeclaration` 主声明
- `Symbol.members` 类的成员
- `symbolTable` 作用域

**最佳实践**：用 `checker.getSymbolAtLocation(node)` 取符号；用 `symbol.flags & SymbolFlags.Function` 判断类型；用 `symbol.exports` 查模块导出。

### 模式 5 · Type 类型系统与结构化类型

**问题场景**：TypeScript 是结构化类型（structural typing）——只要 shape 一样就兼容，与名义类型（Java/C#）相反。

**解决方案**：Type 系统把每个类型表示为 `Type` 对象（`flags` / `symbol` / `types`（联合/泛型参数））。`IntrinsicType`（`string` / `number` / `boolean`）是单例。Checker 用 `isAssignableTo(source, target)` 做结构化赋值检查。

**关键参数**：
- `Type.flags`（`Union` / `Intersection` / `Object` / `TypeParameter` 等）
- `Type.symbol` 关联的 Symbol
- `TypeUnion.types` 联合的成员
- `ObjectType.members` 对象成员
- `isAssignableTo` 赋值检查

**最佳实践**：用 `checker.getTypeAtLocation(node)` 取类型；用 `type.isUnion()` / `type.isIntersection()` 判断；用 `checker.typeToString(type)` 渲染类型字符串。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · BuilderProgram 增量构建

**问题场景**：IDE 边改边保存，传统 `program` 每次都全量重做 typecheck（5-10s），不可接受。

**解决方案**：`BuilderProgram` 维护文件指纹（mtime + content hash）缓存，文件未变直接复用 `SourceFile` AST。`getSemanticDiagnostics` 只对变更文件重跑 Binder+Checker。`incremental: true` 写到 `.tsbuildinfo`。

**关键参数**：
- `ts.createIncrementalProgram()` 增量
- `.tsbuildinfo` 缓存
- `program.getSemanticDiagnostics()` 复用
- `createWatchProgram` watch 模式
- `BuilderProgramBuilder` 内部

**最佳实践**：CI 必开 `incremental: true`；用 `tsc --watch` 边改边编；用 `projectReferences` 多项目增量；用 `--assumeChangesOnlyAffectDirectDependencies` 加速。

### 模式 7 · Language Service 与 IDE 集成

**问题场景**：编辑器（VS Code）需要快速响应（hover/补全/跳转/重命名），每秒数十次请求，且要支持跨文件。

**解决方案**：`LanguageService` 是面向 IDE 的高层 API，封装 `Program` + `Host` + 各种 Service。`getCompletionsAtPosition` / `getQuickInfoAtPosition` / `getDefinitionAtPosition` 等接口针对 IDE 优化（增量 + 单文件 + 缓存）。

**关键参数**：
- `ts.createLanguageService(host, documentRegistry)`
- `getCompletionsAtPosition(fileName, position)`
- `getDefinitionAtPosition(fileName, position)`
- `getReferencesAtPosition(fileName, position)`
- `getRenameInfo(fileName, position, findInComments)`

**最佳实践**：用 `tsserver` 启动 Language Service；用 `ts-morph` 简化 AST 操作；用 `Project` + `LanguageService` 做 codemod 工具；用 `getSemanticClassifications` 做语义高亮。

### 模式 8 · Program 与 Module Resolution

**问题场景**：TS 编译需要找到每个 `import` 指向哪个 `.ts` / `.d.ts` / `.js` 文件——支持 node/node10/classic/bundler 多种解析模式。

**解决方案**：`Program` 持 `SourceFile` 集合 + 模块解析缓存。`moduleResolution` 选项决定解析策略（`node16` / `nodenext` / `bundler` / `classic`）。`getResolvedModule` 走 `node_modules` 解析算法。

**关键参数**：
- `moduleResolution: "node16"` 现代
- `moduleResolution: "bundler"` Vite / webpack 风格
- `paths` / `baseUrl` 路径映射
- `typeRoots` 自动包含 `@types`
- `getResolvedModule()` 解析

**最佳实践**：用 `bundler` 模式配 Vite/webpack；用 `node16` / `nodenext` 配 Node.js；`paths` 用于 monorepo 包别名；`typeRoots` 自动发现 `@types/*`。

### 模式 9 · Compiler Options 与 tsconfig

**问题场景**：TS 编译选项 100+（`target` / `module` / `strict` / `jsx` / `esModuleInterop`...），如何用一份配置让所有 IDE/工具一致？

**解决方案**：`tsconfig.json` 是 JSON Schema 化的配置中心（`compilerOptions` / `include` / `exclude` / `references` / `extends`）。`extends` 支持配置继承，`references` 支持项目引用（增量构建）。

**关键参数**：
- `target: "ES2022"` 输出目标
- `module: "ESNext"` 模块格式
- `strict: true` 严格模式
- `extends: "./base.json"` 继承
- `references` 项目引用

**最佳实践**：用 `@tsconfig/strictest` 起点；用 `extends` 分层（base + node + browser）；`project references` 多 package 增量；`composite: true` 强制项目引用。

### 模式 10 · Diagnostic 与错误恢复

**问题场景**：代码有语法/类型错误，编译器不能停下来——IDE 还要给错误位置，并尽量恢复让后续检查继续。

**解决方案**：`Diagnostic` 是 `{ file, start, length, messageText, category, code }` 结构。Parser 用错误恢复（panic mode + skip）继续解析；Binder 用 fallback symbol；Checker 用 `any` 类型继续检查（不传染）。

**关键参数**：
- `DiagnosticCategory` Error / Warning / Message / Suggestion
- `Diagnostic.code` 错误码（`TS2322` 等）
- `Diagnostic.start` / `length` 位置
- `parseDiagnostics` 解析错误
- `getSuggestionDiagnostics` 建议

**最佳实践**：自定义 Transformer 用 `addDiagnostic` 报错；用 `--pretty` 错误模板；用 `Suggestion` 类别给 fix；`isNoSubstitutionTemplateSpan` 等守卫检查。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · Transformer 与 codegen

**问题场景**：TS 编译要做代码转换（类型擦除 + 装饰器 + JSX → JS + const enum 展开），需要可组合的转换器链。

**解决方案**：`TransformerFactory` 是 `(context: TransformationContext) => Transformer`，`Transformer` 访问每个节点决定如何变换。`ts.transform(sourceFile, [transformer1, transformer2])` 串行应用。Compiler 内置 8 个 transformer 链。

**关键参数**：
- `ts.transform(sourceFile, transformers)`
- `TransformationContext` 工厂与辅助
- `ts.visitNode` / `ts.visitEachChild` 访问
- `ts.factory` 创建节点
- 8 个内置 transformer

**最佳实践**：用 `ts.factory` 创建新节点（`ts.createSourceFile` 已废弃）；用 `ts.visitEachChild` 递归；用 `context.hoistVariableDeclaration` 等辅助。

### 模式 12 · Decorator 元数据与反射

**问题场景**：装饰器（`@Component` / `@Injectable`）需要存储元数据（路由表 + 依赖图）——`reflect-metadata` polyfill 提供运行时反射能力。

**解决方案**：TS 编译装饰器保留元数据（设置 `emitDecoratorMetadata: true`），在类/方法/属性上注入 `design:type` / `design:paramtypes` / `design:returntype`。运行时库（如 NestJS）用 `Reflect.getMetadata` 读取。

**关键参数**：
- `emitDecoratorMetadata: true`
- `experimentalDecorators: true` 旧式
- `design:type` / `design:paramtypes` / `design:returntype`
- `Reflect.metadata()` API
- 5 阶段装饰器（ECMAScript Stage 3）

**最佳实践**：用新装饰器（Stage 3，无 `experimentalDecorators`）；用 `reflect-metadata` polyfill；不要混用新旧装饰器；用类装饰器 + 反射做 DI 框架。

### 模式 13 · Project References 增量多项目

**问题场景**：monorepo 多个 `tsconfig.json` 项目，A 依赖 B 的 `.d.ts`——B 改了 A 要重 build，但传统方式全量重做。

**解决方案**：`tsconfig.references` 声明项目依赖图，A 配 `references: [{ path: "../B" }]`。B 配 `composite: true` 输出 `.d.ts` + `.tsbuildinfo`。A 改代码只重 build A，B 改触发 A 增量重 build。

**关键参数**：
- `composite: true` 项目根
- `references: [{ path: "./B" }]`
- `tsc --build` 多项目构建
- `.tsbuildinfo` 文件
- `outDir` 输出

**最佳实践**：monorepo 必用 project references；B 配 `composite: true` + `declaration: true`；CI 用 `tsc --build` 增量；用 `--verbose` 看构建顺序。

### 模式 14 · Source Map 与声明文件

**问题场景**：编译后的 JS 报错要能映射回 TS 源——需要 source map。库要发布 `.d.ts` 让用户获得类型提示。

**解决方案**：`sourceMap: true` 生成 `.js.map`（含 mappings 编码位置）；`declaration: true` 生成 `.d.ts`（类型擦除后保留类型签名）。`declarationMap: true` 把 `.d.ts` 映射回源 `.ts`。

**关键参数**：
- `sourceMap: true` / `.js.map`
- `declaration: true` / `.d.ts`
- `declarationMap: true` 映射回源
- `inlineSourceMap` 内嵌
- `sourceRoot` 路径

**最佳实践**：库项目必发 `.d.ts`；用 `declarationMap` 让用户"Go to Definition"到源；用 `paths` 配合 `declarationMap`；CI 上传 `.map` 到 Sentry 错误追踪。

### 模式 15 · 类型操作工具（infer / template literal / conditional）

**问题场景**：复杂类型编程（`Awaited<T>` / `Partial<T>` / `ReturnType<T>`）需要类型级逻辑——递归条件类型、模板字面量类型、映射类型、infer 推断。

**解决方案**：TS 类型系统是图灵完备的——`infer X` 从泛型位置推断类型；`T extends U ? X : Y` 条件类型；`` `${T}-${U}` `` 模板字面量类型；`{ [K in keyof T]: ... }` 映射类型；递归条件类型实现 `Awaited<T>`。

**关键参数**：
- `infer` 关键字
- 条件类型 `T extends U ? X : Y`
- 模板字面量 `` `${Uppercase<T>}` ``
- 映射类型 `{ [K in keyof T]: ... }`
- `keyof T` / `typeof T`

**最佳实践**：用 `Awaited<ReturnType<typeof fn>>` 取异步返回类型；用模板字面量做路由类型；用 `infer` 实现 `Parameters` / `ReturnType`；用 mapped types 做 readonly/optional。

## 第四段：实战范式（模式 16-20）

### 模式 16 · tsc CLI 与 build 模式

**问题场景**：CLI 工具（`tsc` / `tsserver` / `ts-node`）的参数与配置文件一致——如何高效使用 `tsc`？

**解决方案**：`tsc` 直接读 `tsconfig.json`；`tsc --noEmit` 类型检查不输出；`tsc --watch` watch 模式；`tsc --build` 项目引用构建。`tsc -p ./other-tsconfig.json` 选配置。

**关键参数**：
- `tsc --noEmit` 类型检查
- `tsc --watch` watch
- `tsc --build` 项目引用
- `tsc -p` 指定配置
- `tsc --listFiles` 列出文件

**最佳实践**：CI 用 `tsc --noEmit` 快速检查；开发用 `tsc --watch`；monorepo 用 `tsc --build`；用 `--listFiles | grep node_modules` 查未排除文件。

### 模式 17 · ts-node / tsx / swc-node 开发体验

**问题场景**：`tsc` 编译慢（10s+）——开发时运行 `node` 跑 TS 怎么加速？

**解决方案**：`ts-node`（TS 编译器即时转译，`ts-node-dev` 监听）/ `tsx` / `tsm`（基于 esbuild 的极速 TS 运行器，冷启动 < 100ms）/ `swc-node`（基于 swc（Rust）的转译，比 esbuild 略慢但支持类型检查）/ `ts-node --transpile-only` 跳过类型检查加速。

**关键参数**：
- `ts-node --transpile-only` 跳过类型检查
- `tsx watch` 监听模式
- `swc-node` swc 后端
- `--esm` ESM 模式
- `TS_NODE_PROJECT` 配置

**最佳实践**：开发用 `tsx`（最快）；CI 必跑 `tsc --noEmit`（类型检查）；库发布前 `tsc` 全量编；`ts-node` 适合一次性脚本。

### 模式 18 · ESLint / Prettier 集成

**问题场景**：TS 代码既要类型检查又要 lint——两个工具不同步会冲突。

**解决方案**：`@typescript-eslint/parser` 解析 TS AST 给 ESLint；`@typescript-eslint/eslint-plugin` 提供规则；`typescript-eslint` monorepo 统一。Prettier 做格式化与 ESLint 互补（不重叠规则）。

**关键参数**：
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `parserOptions.project: "./tsconfig.json"`
- `eslint --fix` 自动修
- `prettier --check` 格式校验

**最佳实践**：用 `typescript-eslint` v6+（扁平配置）；`project: true` 让 lint 知道类型；用 `eslint --fix` + `prettier --write` 自动化；CI 跑 `tsc --noEmit && eslint . && prettier --check .`。

### 模式 19 · 路径映射与 monorepo

**问题场景**：monorepo 多个包（`@org/ui` / `@org/utils`）需要互相引用，TS 不能解析 workspace 协议（`workspace:*`）。

**解决方案**：`tsconfig.paths` 配置路径映射——`"@org/*": ["packages/*"]`；用 `tsc-alias` / `tsconfig-paths` 在运行时解析（Node.js 实际加载）。`project references` 是更彻底的方案。

**关键参数**：
- `paths: { "@org/*": ["packages/*"] }`
- `baseUrl: "."`
- `tsc-alias` 运行时解析
- `project references` 多 tsconfig
- `tsconfig-paths/register`

**最佳实践**：用 project references 而非 paths（更彻底）；用 `tsc-alias` 在构建时把 paths 转相对路径；运行时用 `tsconfig-paths/register`；用 `pnpm` 配 workspace 协议。

### 模式 20 · 性能优化（skipLibCheck / isolatedModules）

**问题场景**：TS 类型检查慢（>30s），CI 跑不完——需要优化。

**解决方案**：`skipLibCheck: true` 跳过 `.d.ts` 检查（10x 加速）/ `isolatedModules: true` 限制单文件独立编译（与 esbuild/swac 兼容）/ `incremental: true` 增量（重复构建 5x 加速）/ `tsBuildInfoFile` 缓存 / 减少 `paths` / `project references`。

**关键参数**：
- `skipLibCheck: true` 加速
- `isolatedModules: true` esbuild 兼容
- `incremental: true` 缓存
- `noEmitOnError: false` 错误也输出
- `assumeChangesOnlyAffectDirectDependencies: true`

**最佳实践**：必开 `skipLibCheck`（无副作用）；用 `isolatedModules` 配 esbuild；`incremental: true` 配合 `.gitignore .tsbuildinfo`；用 `tsc --diagnostics` 看瓶颈。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\typescript-fresh\`
- 主语言：TypeScript
- License：Apache 2.0
- 核心模块：`src/compiler/` + `src/services/` + `src/tsc.ts`
- 关键基础设施：TypeScript Compiler API + tsserver + Language Service + Project References

**3 核心洞察**：
1. 不可变 AST + side-channel = 在不破坏不可变性前提下补充信息
2. 五段流水线分层 = typecheck vs emit 性能独立优化
3. Project References + 增量 = monorepo TS 编译从 30s 变 3s

**1 反模式**：直接 `modify(node, ...)` 改 AST 字段——破坏不可变性，导致 IDE 缓存与 codemod 工具行为异常。

**3 立刻能用**：
1. `tsc --noEmit` + `tsc --build` CI 快速类型检查
2. `skipLibCheck: true` + `isolatedModules: true` 5x 加速
3. `ts.transform(sourceFile, [myTransformer])` 写自定义 codemod
