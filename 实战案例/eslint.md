# eslint - JS 生态事实标准 Linter

**GitHub**: eslint/eslint
**Star**: 25000+
**语言**: JavaScript
**主题**: Lint / 静态分析 / AST
**适用场景**: 团队代码规范强制 / CI 卡口 / 插件扩展

---

## 第一段：基础范式（模式 1-5）

### 模式 1：AST 解析与遍历

**问题场景**：正则匹配代码风格脆弱（缩进/字符串嵌套），JS 语法变化快（ES2024 decorator、private fields）。

**解决方案**：ESLint 用 espree（默认）/ espree-vb / @typescript-eslint/parser 解析成 ESTree AST，Visitor 模式遍历节点。规则回调拿到 `context` + `node`，按节点类型触发。

**关键参数**：
- `parserOptions.ecmaVersion` 决定支持语法
- `parserOptions.sourceType: 'module' | 'script'`
- `context.report({node, messageId})` 上报违规
- `Selector.querySelectorAll(node, 'Identifier')` 节点选择

**最佳实践**：规则必用 visitor + messageId（不直接写 message 字符串）；解析器优先 espree（性能 + 一致性）。

### 模式 2：规则即插件

**问题场景**：每个项目代码规范不同，硬编码规则会冲突。

**解决方案**：规则 = 工厂函数 `create(context) -> { visitor }`，`meta` 描述 fixable/type/docs/replacedBy。规则按 npm 包分发（`eslint-plugin-*`），`.eslintrc` 启用。

**关键参数**：
- `meta.type: 'problem'|'suggestion'|'layout'`
- `meta.fixable: 'code'|'whitespace'`
- `context.options` 拿配置
- `context.sourceCode` 拿源码文本

**最佳实践**：规则默认 `recommended` 集；fixable 规则提供 `fixer`；禁止规则配 `meta.deprecated`。

### 模式 3：Linter vs ESLint 双层 API

**问题场景**：单文件 lint（编辑器集成）和项目级 lint（CLI/IDE）需求差异大。

**解决方案**：`Linter` 类提供 `verify(code, config)` / `verifyAndFix(code, config)` 单文件 API（不读文件系统）；`ESLint` 类走 `lintFiles(patterns)` / `loadFormatter()` 文件级，集成缓存 + 自动修复。

**关键参数**：
- `new Linter()` 单文件
- `new ESLint({fix: true, cache: true, cacheLocation: '.eslintcache'})`
- `await eslint.lintFiles(['src/**/*.js'])`
- `await ESLint.outputFixes(results)`

**最佳实践**：CLI/CI 用 ESLint 类（缓存 + fix）；编辑器/单测用 Linter 类（轻量、零 IO）。

### 模式 4：共享配置与继承

**问题场景**：多仓库规范不一致，团队维护 N 份 `.eslintrc`。

**解决方案**：`@scope/eslint-config` npm 包导 config object；`.eslintrc` 用 `extends: ['plugin:foo/recommended', '@scope/config']` 链式继承。`overrides` 按 glob 覆盖。

**关键参数**：
- `root: true` 禁用向上继承
- `extends: ['eslint:recommended', 'plugin:react/recommended']`
- `overrides: [{files: ['*.test.js'], env: {jest: true}}]`
- Flat config `eslint.config.js` 数组式（v9 默认）

**最佳实践**：公司内部用 monorepo `packages/eslint-config`；v9+ 用 flat config `eslint.config.js`。

### 模式 5：自动修复

**问题场景**：纯提示不能根治风格问题，手改 N 千行代码痛苦。

**解决方案**：规则 `meta.fixable: 'code'` 配 `fix(fixer) { return fixer.replaceText(node, '...') }`；`fixer.removeRange` / `fixer.insertTextAfter` 等多操作。CLI `eslint --fix` 自动应用安全 fix；`--fix-dry-run` 演练。

**关键参数**：
- `fixer.replaceText(node, str)`
- `fixer.removeRange([start, end])`
- 一次 fix 不能改变其他 fix 结果
- 复杂 fix 用 `fixer.indent` + `replaceTextRange`

**最佳实践**：fix 仅做安全变更；风险变更只报不修；多次 fix 循环直到 no fix。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：插件机制

**问题场景**：每框架（React/Vue/Svelte）需定制规则，每库（TypeScript/Jest）需环境配置。

**解决方案**：`eslint-plugin-foo` 包导出 `rules` + `configs` + `processors`；`.eslintrc` `plugins: ['foo']` 启用，规则用 `foo/rule-name` 引用。`@eslint/eslintrc` flat config `plugins: {foo: plugin}`。

**关键参数**：
- `module.exports = {rules, configs, processors, environments}`
- `configs.recommended: {rules: {...}, plugins: ['self']}`
- `FlatCompat` 桥接 legacy plugin
- `meta.docs.recommended: true`

**最佳实践**：插件包名以 `eslint-plugin-` 前缀；configs 必带 `recommended`/`all` 两档。

### 模式 7：自定义解析器

**问题场景**：TS/Vue/Flow 语法不在 ESTree 内，ESLint 默认 espree 解不了。

**解决方案**：解析器实现 `parseForESLint(code, options) -> {ast, services, scopeManager, visitorKeys}`。`@typescript-eslint/parser` / `vue-eslint-parser` / `babel-eslint` 是常见解析器。`parserOptions` 配额外选项。

**关键参数**：
- `parser: '@typescript-eslint/parser'`
- `parserOptions: {project: './tsconfig.json'}` 类型感知
- `parserOptions.ecmaFeatures: {jsx: true}`
- `parserOptions.extraFileExtensions: ['.vue']`

**最佳实践**：TS 项目用 `@typescript-eslint/parser` + 类型感知规则；Vue 用 `vue-eslint-parser` + 模板规则。

### 模式 8：Processor 与 markdown/html

**问题场景**：ESLint 默认按 `.js` 单文件 lint，markdown 内嵌代码片段、Vue SFC `<template>` 块需要提取再 lint。

**解决方案**：`processor.preprocess(text, filename)` 返回代码块数组；`processor.postprocess(messages, filename)` 合并。`eslint-plugin-markdown` / `eslint-plugin-vue` 是典型例子。

**关键参数**：
- `processor.supportsAutofix: true`
- `processor.preprocess(text) -> string[]`
- `.eslintrc` 用 `overrides: [{files: ['*.md'], processor: 'markdown'}]`
- 块位置记录到 message 的 `line`/`column`

**最佳实践**：SFC 配 vue-eslint-parser + 模板规则；Markdown 配 markdown plugin + JS 规则。

### 模式 9：缓存与并行

**问题场景**：大型项目 lint 慢（分钟级），CI 频繁运行浪费时间。

**解决方案**：ESLint 默认 `cache: true` 写 `.eslintcache`，增量运行只 lint 变更文件。Node Worker 不可直接用，可用 `concurrent` 字段配合第三方工具（如 `eslint-parallel`）。

**关键参数**：
- `cache: true, cacheLocation: '.eslintcache'`
- `cacheStrategy: 'metadata'|'content'`（v8.57+）
- `cacheInvalidateGlobPattern: ['**/dist/**']`
- CI 缓存 `~/.cache/eslint`

**最佳实践**：CI 缓存 `.eslintcache`；用 GitHub Actions 缓存；pre-commit 用 `lint-staged` 只 lint 暂存文件。

### 模式 10：插件体系 `@eslint/*`

**问题场景**：ESLint 核心包越来越胖，工具（scope 分析、visitor keys）该独立。

**解决方案**：核心拆 `@eslint/js` / `@eslint/eslintrc` / `@eslint/plugin-kit` / `@eslint/visitor-keys` / `@eslint-community/eslint-utils`，规则作者按需引用。monorepo 模式管理。

**关键参数**：
- `@eslint/js` 内置 `eslint:recommended` 配置
- `@eslint/eslintrc` legacy config 桥接
- `@eslint/plugin-kit` 插件工具
- `@eslint/compat` FlatCompat

**最佳实践**：写新插件用 `@eslint/plugin-kit` + `@eslint-community/eslint-utils`；Flat config 优先。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：自定义规则工程化

**问题场景**：业务约定（API 调用必须带 retry、log 必须带 trace_id）无法用现有规则表达。

**解决方案**：本地 plugin 写 `create` 工厂；用规则测试（`RuleTester`）+ 单元测试覆盖有效/无效用例；规则 fixer 必须幂等。`utils` 抽 selector helper。

**关键参数**：
- `RuleTester` 跑 `valid`/`invalid` 数组
- `context.getSourceCode()` 拿文本
- `context.getFilename()` 拿文件
- `context.parserServices` 拿 TS 类型

**最佳实践**：规则 100% 测试覆盖；fix 跑 `RuleTester` 多轮无变化；`meta.schema` 验配置 JSON Schema。

### 模式 12：TypeScript 与类型感知

**问题场景**：JS 规则看不到类型，不知道 `foo.bar` 是否存在；TS 写死变量名易误报。

**解决方案**：`@typescript-eslint/parser` + `parserOptions.project`；类型感知规则 `no-floating-promises` / `no-misused-promises` 走 TS compiler API 检查类型。`type-checked` 规则按需引入。

**关键参数**：
- `parserOptions.project: ['./tsconfig.json']`
- `extends: ['plugin:@typescript-eslint/recommended-type-checked']`
- `parserOptions.tsconfigRootDir: __dirname`
- 大项目用 `projectService: true`（v8+）

**最佳实践**：项目 > 5000 文件用 `projectService: true` 提速；类型感知规则按需启用否则 CI 慢。

### 模式 13：与 Prettier 协同

**问题场景**：Prettier 管格式（缩进/引号/尾逗号），ESLint 管逻辑（no-unused-vars/no-console）—— 两者规则冲突。

**解决方案**：禁用 ESLint 风格规则（`eslint-config-prettier` 关掉冲突规则），Prettier 管格式 ESLint 管代码。`eslint-plugin-prettier` 不推荐（运行慢、双重 fix）。

**关键参数**：
- `extends: ['prettier']` 关冲突
- `eslint --fix` 走 Prettier 格式化
- 单独跑 `prettier --write`
- 共享 ignore `.prettierignore` / `.eslintignore`

**最佳实践**：Prettier 管格式 ESLint 管逻辑，规则集严格分开；prettier 单独跑不用 eslint-plugin-prettier。

### 模式 14：Monorepo 与增量

**问题场景**：monorepo 100+ 包，每个包独立 lint + 共享规则。

**解决方案**：根目录 `eslint.config.js` + `tsconfig.json` 配 `project: ['packages/*/tsconfig.json']`；按 package 配 `overrides`。Nx/Turborepo 跑增量 `nx lint pkg-name --skip-nx-cache`。

**关键参数**：
- `parserOptions.project: true` 自动找
- Turborepo `pipeline.lint.dependsOn: ['^lint']`
- `nx affected --target=lint`
- `lerna run lint --scope=@scope/pkg`

**最佳实践**：用 Nx/Turbo 受影响 lint 提速 5-10x；根 config + 包级 override 兼顾。

### 模式 15：编辑器与 IDE 集成

**问题场景**：编辑器反馈 vs 终端反馈脱节，开发者不跑 CLI。

**解决方案**：`eslint.lsp` / VSCode ESLint 扩展走 LSP/语言服务；`{run: 'onType'}` 自动 fix on save。`.vscode/settings.json` 配工作区规则。

**关键参数**：
- VSCode `editor.codeActionsOnSave: { 'source.fixAll.eslint': 'explicit' }`
- `eslint.validate: ['javascript', 'typescript', 'vue']`
- Flat config `eslint.useFlatConfig: true`
- 远程开发用 server install eslint

**最佳实践**：保存触发 fix（`source.fixAll.eslint`）；编辑器规则与项目规则严格一致；远程开发 / 容器开发 `eslint --no-warn-ignored`。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：性能优化

**问题场景**：首次运行 30s+，编辑器卡顿。

**解决方案**：`--cache` + `.eslintcache` 命中免解析；`--max-warnings=0` CI 卡口；`--concurrency`（第三方工具）多核；规则按 `severity: 'off'` 关闭大规则；`plugin:import/recommended` 智能 import 排序。

**关键参数**：
- `cache: true`
- `--max-warnings 0`
- `TIMING=1 eslint .` 看慢规则
- `noInlineConfig: false` 允许 inline 关闭

**最佳实践**：CI 必开 cache；规则超时 `RuleTester` 验证；用 `TIMING=1` 找慢规则优化。

### 模式 17：自定义规则测试

**问题场景**：自定义规则改动没测试，发布后误报。

**解决方案**：`RuleTester` + `vitest`/`mocha` 跑 valid/invalid 用例；`snapshot test` 存预期输出。`npm run test:rule` 必跑。

**关键参数**：
- `new RuleTester({parser: require.resolve('espree')})`
- `valid: [{code: '...', options: [...]}]`
- `invalid: [{code: '...', errors: [{messageId, line, column}], output: '...'}]`
- 边界用例 100% 覆盖

**最佳实践**：每个规则 100% 测试覆盖；fix 后 `output` 必断言；CI 必跑 lint 自己。

### 模式 18：CI 集成与 PR 卡口

**问题场景**：lint 不卡 PR 就形同虚设。

**解决方案**：GitHub Actions 跑 `eslint . --max-warnings 0` + `prettier --check .`；Danger.js 提醒增量；合并前 status check。`/lint` 评论 diff 行内错误。

**关键参数**：
- `.github/workflows/lint.yml`
- `actions/setup-node@v4` + 缓存 `~/.npm`
- `continue-on-error: false`
- ESLint `--format github` 输出到 PR review

**最佳实践**：CI lint 必 fail；PR 必绿；用 `format: github` 行内评论。

### 模式 19：渐进式采用

**问题场景**：老项目一次性上 ESLint 几千错误，团队抗拒。

**解决方案**：分阶段开启规则（先 severity: 'warn'）；`--fix` 一键 auto fix 风格问题；用 `eslint-plugin-diff` 限制新代码必 lint 干净，老代码逐步收敛。`--rule '{"no-console": "off"}'` 例外。

**关键参数**：
- `--fix` 风格 auto
- `eslint --rule '{"no-unused-vars": "warn"}'`
- `eslint --max-warnings=N` 渐进
- `lint-diff` 工具

**最佳实践**：先 0-error baseline，后慢慢收紧；用 baseline 文件 `eslint . --rule '{"*": "off"}'` 老代码关闭。

### 模式 20：Flat Config 迁移（v9+）

**问题场景**：v9 启用 flat config，legacy `.eslintrc` 兼容到 v10。

**解决方案**：`eslint.config.js` ESM 数组式；`FlatCompat` 桥接 plugin 生态；`@eslint/js` `recommended` 内置；`defineConfig` 类型提示。

**关键参数**：
- `eslint.config.js` 用 `export default defineConfig([...])`
- `FlatCompat.plugin(legacyPlugin)` 桥接
- `tseslint.configs.recommendedTypeChecked`
- `ignores: ['dist/**', 'node_modules/**']`

**最佳实践**：v9 项目直接 flat config；老项目用 `FlatCompat` 桥接 + 渐进迁移；`@eslint/js` 取代 `eslint:recommended`。
