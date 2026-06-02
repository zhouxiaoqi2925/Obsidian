# marked - 速度优先的 Markdown 解析器

**GitHub**: markedjs/marked
**Star**: 35k+
**语言**: TypeScript
**主题**: markdown-parser、lexer-parser、gfm、commonmark
**适用场景**: 博客/文档站 Markdown→HTML 转换、静态站点生成器、CLI 工具

---

## 一、基础范式

### 模式 1 · Lexer → Tokens → Parser 主流水线

**问题场景**：Markdown 解析主流方案要么太重（markdown-it 7000 行），要么太慢（regex 全局替换），需要小而快的解析器。

**解决方案**：marked 走经典 3 段式：Lexer 块级分词（src/Lexer.ts 495 行） → 14 个 Tokenizer 块级分词器（src/Tokenizer.ts 963 行最胖） → Parser 块级渲染（src/Parser.ts） → Renderer 默认 HTML 渲染（src/Renderer.ts）。

**关键参数**：
- Lexer 走块级规则
- Tokenizer 14 个分词器（heading/paragraph/code/blockquote/list/hr/link/image/table 等）
- Parser 按 token 类型 dispatch
- Renderer 是默认 HTML 渲染器
- 4 段单向数据流

**最佳实践**：解析器都走「分词 → token → 渲染」3 段式，扩展点天然落在每段边界。

### 模式 2 · 块级 + 行级双重分词

**问题场景**：单层分词既要处理 `# 标题` 块级又要处理 `**粗体**` 行级，代码臃肿难维护。

**解决方案**：Tokenizer 内部把分词拆成 block（块级：paragraph/heading/code/blockquote 等）和 inline（行级：emphasis/link/image/code 等），通过 `blockTokens` 和 `inlineTokens` 两个 hook 暴露给扩展。

**关键参数**：
- `this.block.tokenize(src, top)` 块级入口
- `this.inline.tokenize(src, tokens)` 行级入口
- `blockTokens` hook 允许完全重写块级
- 块级用 regex 切段，行级用 char-by-char
- top-level 调用 lexer.tokenize

**最佳实践**：DSL 解析器都按「块级先切 → 行级再切」两阶段，每阶段独立扩展。

### 模式 3 · 扩展点一等公民（4 个）

**问题场景**：框架不暴露扩展点，外部只能 monkey-patch，破坏升级兼容性。

**解决方案**：marked 把扩展做成 4 个一等公民：① renderer ② tokenizer ③ hooks（preprocess / postprocess / postrender）④ walkTokens。每个扩展点都有完整类型签名。

**关键参数**：
- `renderer.heading = function(text, level, raw)` 替换
- `tokenizer.list = function(src)` 自定义
- `hooks.postprocess(html)` 文本级拦截
- `walkTokens = function(token)` 遍历所有 token
- 4 个 hook 互不耦合

**最佳实践**：库框架的扩展点必须都是「一等公民」（有类型、可替换、可组合），marked 是 50 行写完的范例。

### 模式 4 · CommonMark vs GFM 切换

**问题场景**：标准 Markdown 不支持表格、删除线、任务列表，GitHub Flavored Markdown (GFM) 是事实标准。

**解决方案**：marked 用单个 `gfm: true` 布尔开关切换 GFM 扩展，所有 GFM 规则（表格/任务列表/删除线/自动链接）走独立 Tokenizer，在 GFM 关闭时不进解析路径。

**关键参数**：
- `marked.setOptions({ gfm: true })` 全局开
- 表格/任务列表/删除线独立 tokenizer
- `pedantic: true` 严格 CommonMark
- `breaks: true` 软换行变 `<br>`
- `async: false` 同步解析

**最佳实践**：解析器的方言/扩展都用单一 flag 切换，不要在 parser 内部散落 if 判断。

### 模式 5 · ReDoS 防御

**问题场景**：用户输入恶意 Markdown 触发 catastrophic backtracking，CPU 100% 占用数秒。

**解决方案**：`src/rules.ts` 513 行正则大本营，每条 regex 都用「锚点 + 非贪婪 + 字符类限定」三件套；`test/recheck.ts` 用 safe-regex 扫描所有正则，匹配次数超过 10^6 直接报错。

**关键参数**：
- 正则首部 `^` 锚定
- 字符类 `[^\n]` 替代 `.`
- 量词 `*?` + 限定 `*?{0,n}`
- safe-regex 阈值 1e6
- `gfm` 不开时跳过表格正则

**最佳实践**：所有处理用户输入的 regex 库都过 safe-regex 扫描，marked 是社区标杆。

---

## 二、扩展范式

### 模式 6 · Renderer 替换 HTML 模板

**问题场景**：默认 HTML 渲染器无法满足自定义需求（如加 className、包裹容器）。

**解决方案**：`marked.Renderer` 暴露 heading / paragraph / link / image / list / listitem / table / tablerow / tablecell / code / blockquote / hr / del / strong / em / codespan / br / text 等 17 个方法，按 token 类型 dispatch。

**关键参数**：
- `renderer.link(href, title, text)` 6 个参数
- `renderer.image(href, title, text)`
- `renderer.code(code, infostring, escaped)`
- 替换默认实现即可
- 返回字符串

**最佳实践**：渲染层和解析层完全解耦，Renderer 是「视图模板」，可以替换为 React JSX、Vue template。

### 模式 7 · Tokenizer 注入新语法

**问题场景**：marked 默认只支持 CommonMark+GFM，团队需要自定义语法（如 :::warning 警告框）。

**解决方案**：Tokenizer 暴露 `list` / `paragraph` / `heading` 等 14 个方法的「priority 优先级队列」，自定义 tokenizer 标高优先级，在原 tokenizer 之前匹配。

**关键参数**：
- `tokenizer.list(src, tokens, top)` 返回 `{ tokens, remaining }`
- 优先级数字越大越先匹配
- 失败返回 `false` 让原 tokenizer 接盘
- `marked.Lexer` 是核心
- `extensions` 数组是 v5+ 高级 API

**最佳实践**：自定义语法先尝试 `tokenizer.X` 替换，失败再走 v5+ 的 `extensions` API。

### 模式 8 · Hooks 4 阶段拦截

**问题场景**：需要在解析前/后/渲染后做额外处理（如代码高亮、ID 生成、SEO 优化）。

**解决方案**：marked 提供 4 个 hook：① preprocess(markdown) 解析前改文本 ② postprocess(html) 渲染后改 HTML ③ postrender(html) 异步最终输出 ④ walkTokens(token) 遍历所有 token。

**关键参数**：
- `marked.use({ hooks: { preprocess, postprocess } })`
- 同步 hook 链
- `walkTokens` 在 tokenize 后渲染前
- preprocess 用于替换模板变量
- postprocess 用于注入 className

**最佳实践**：所有「需要拦截但不改核心流程」的需求都走 hook，不要 monkey-patch 内部方法。

### 模式 9 · walkTokens 遍历所有 token

**问题场景**：需要给所有 heading 加 id、给所有 link 加 target=\_blank、给所有图片加 lazy load。

**解决方案**：`walkTokens(token)` 在 tokenize 后、Parser 渲染前遍历所有 token 树，可在原地修改 token 字段。

**关键参数**：
- `marked.use({ walkTokens: fn })`
- token.type 区分
- 递归处理 token.tokens 子节点
- 修改 token 字段而非返回新对象
- 比 postprocess 更早介入

**最佳实践**：能用 walkTokens 解决的不要走 postprocess，效率高 30%，因为省去 HTML 重新解析。

### 模式 10 · Marked 类实例化 + 泛型

**问题场景**：marked() 单例函数无法在多租户场景下配置隔离。

**解决方案**：`src/Instance.ts` 提供 `new Marked(options)` 工厂类，可创建多个独立实例，每个实例独立的 renderer / tokenizer / hooks。

**关键参数**：
- `new Marked()` 工厂
- `instance.use(plugin)` 链式
- `instance.parse(src, opt)` 解析
- 泛型 `Marked<R extends Renderer = Renderer>` 类型化
- 默认 `marked` 是 `new Marked()` 单例

**最佳实践**：库框架从「单例函数」升级到「可实例化类」是规模化的必经之路，marked v15 完成。

---

## 三、进阶范式

### 模式 11 · Token 类型系统

**问题场景**：parser 不知道 token 具体类型，无法 dispatch 到正确 renderer。

**解决方案**：`src/Tokens.ts` 用 TypeScript 联合类型定义所有 token 形状（`Heading` / `Paragraph` / `List` / `Code` / `Table` ...），每种类型有 `type` 字段 + 业务字段。

**关键参数**：
- `Tokens.Heading` / `Tokens.Paragraph` 命名空间
- `type: 'heading'` 字段做 runtime 判别
- `raw` 字段保留原始文本
- `tokens` 字段嵌套子 token
- TypeScript discriminated union

**最佳实践**：解析器用 TS discriminated union 表达 token，避免 `any` 满天飞。

### 模式 12 · rules.ts 正则大本营

**问题场景**：50+ Markdown 规则用 inline 正则定义散落在代码里。

**解决方案**：`src/rules.ts` 513 行集中所有规则：block.ts 块级正则（heading/list/blockquote/code/table）、normal.ts 行级（em/strong/link/image）、gfm.ts GFM 扩展。每条规则 3 段：regex、cap（捕获组顺序）、lookahead（前置锚定）。

**关键参数**：
- block.js 块级
- normal.js 标准行级
- gfm.js GFM 扩展
- 每条 `{ regex, cap }` 二元组
- `src/Lexer.ts` 引用

**最佳实践**：DSL 解析器把所有规则集中到一个 rules.ts，新增规则只动一处。

### 模式 13 · 性能基准 bench.js

**问题场景**：解析器性能优化无依据，凭感觉改 regex。

**解决方案**：`test/bench.js` 用 benchmark.js 跑 marked / markdown-it / remark 三方对比，覆盖 5 个测试 Markdown 文档（短文/长文/嵌套/代码块/表格）。

**关键参数**：
- benchmark.js 库
- 5 个 fixture
- 5 次迭代取 min
- ops/sec 输出
- 性能回归 CI 检测

**最佳实践**：解析器必须有 bench.js 性能回归测试，marked 持续领先 markdown-it 30%。

### 模式 14 · TypeScript 类型生成（dts-bundle-generator）

**问题场景**：库手写 .d.ts 容易漏字段，与源码不同步。

**解决方案**：`package.json` 用 `dts-bundle-generator` 从 src/*.ts 自动生成单一 `lib/marked.d.ts`，类型和源码完全同步。

**关键参数**：
- `dts-bundle-generator` CLI
- 单文件输出 `lib/marked.d.ts`
- `exports['.']['types']` 指向产物
- 0 维护成本
- CI 自动跑

**最佳实践**：TypeScript 库用 dts-bundle-generator 生成类型，不手写 .d.ts。

### 模式 15 · semantic-release 自动化

**问题场景**：库发版靠人工写 changelog + 改版本号，容易出错。

**解决方案**：marked 用 semantic-release 监听 commit message，feat/fix/BREAKING CHANGE 自动 bump major/minor/patch，生成 CHANGELOG.md，发布到 npm + GitHub release。

**关键参数**：
- `.releaserc` 配置
- Conventional Commits 规范
- feat/fix/docs/style/refactor/perf/test/chore/revert
- BREAKING CHANGE: footer 触发 major
- 月下载量 3M+

**最佳实践**：库用 semantic-release 自动化发版，开发者只管写符合规范的 commit。

---

## 四、实战范式

### 模式 16 · CLI + Node 库双端

**问题场景**：marked 既要 Node.js 用又要命令行用。

**解决方案**：`bin/marked.js` 走 `#!/usr/bin/env node` 入口，支持 `-i input.md` / `-o output.html` / `-s` 同步阻塞；`src/marked.ts` 38 行薄壳暴露 `marked()` 顶层函数给 Node 模块。

**关键参数**：
- bin/marked.js CLI
- npx marked 临时用
- -o 输出到文件
- -i 从文件读
- -s 同步阻塞

**最佳实践**：Node 库同时提供 CLI 是扩大受众的关键，marked 是 200 行写完的范例。

### 模式 17 · 代码高亮 5 方案

**问题场景**：marked 默认不代码高亮，文档站需要 highlight.js 或 prismjs。

**解决方案**：5 套集成方案：① `marked-highlight` 官方包 + highlight.js ② `marked-prism` 官方包 + prismjs ③ `marked-shiki` VS Code 同款高亮 ④ 自定义 `renderer.code` 走 Shiki ⑤ 简单 `<pre><code>` 不高亮。

**关键参数**：
- `marked-highlight` npm 包
- `marked.setOptions({ highlight: code => hljs.highlightAuto(code).value })`
- Shiki 服务端高亮
- Prism 客户端高亮
- renderer.code 自定义

**最佳实践**：技术文档用 Shiki（VS Code 同款），博客用 highlight.js（轻量），技术教程用 Prism（多语言）。

### 模式 18 · CommonMark 0.30 规范兼容

**问题场景**：marked 早期与 CommonMark 规范有偏差，issue 区大量投诉。

**解决方案**：v4 起 marked 把 CommonMark 0.30 规范作为基线，所有 spec 失败用 `test/specs/commonmark/` 跑回归，CI 跑 600+ 用例。

**关键参数**：
- CommonMark 0.30
- 600+ spec 用例
- test/run-spec-tests.js
- test/specs/ 目录
- CI 必跑

**最佳实践**：Markdown 解析器必须 100% 通过 CommonMark spec，marked 是社区标杆。

### 模式 19 · 与 markdown-it / remark 对比

**问题场景**：选型在 marked / markdown-it / remark 之间。

**解决方案**：marked 定位「速度优先 + 极简 API」适合博客/文档站；markdown-it 定位「插件丰富 + CommonMark 严格」适合编辑器；remark 定位「AST 可操作 + 生态完整」适合复杂文档工具。

**关键参数**：
- 体积：marked 50KB / markdown-it 200KB / remark 400KB
- 速度：marked 快 30%
- 插件：markdown-it 50+ / remark 100+
- AST：remark 完整 mdast
- 学习曲线：marked 最平

**最佳实践**：博客/文档站选 marked，编辑器选 markdown-it，文档工具链选 remark。

### 模式 20 · 7 天复刻核心

**问题场景**：从零写一个 Markdown 解析器。

**解决方案**：7 天分 5 步：① Lexer 切块级 token ② Tokenizer 14 个分词器 ③ Parser 渲染 ④ Renderer 17 个 HTML 模板 ⑤ ReDoS 扫描。

**关键参数**：
- Day 1-2: 块级 Lexer
- Day 3: 行级 Tokenizer
- Day 4: Parser + Renderer
- Day 5: GFM 扩展
- Day 6: ReDoS 防御
- Day 7: bench + CommonMark spec

**最佳实践**：7 天只能做「够用 80% 场景」的解析器，完整 CommonMark 严格兼容要 1 个月。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\marked\`
- **大小**: ~2 MB
- **源文件**: 11 个 TS 源文件约 3500 行
- **关键 commit**: v18.0.4
- **作者**: Christopher Jeffrey + 30+ 贡献者
- **许可**: MIT

## 一句话总结

marked 用 3500 行 TS 把「Lexer → Tokens → Parser → Renderer」3 段式做到极致，4 个一等公民扩展点（renderer / tokenizer / hooks / walkTokens）是它能被 Vue/VitePress/Docusaurus 选为默认 Markdown 引擎的根本原因。
