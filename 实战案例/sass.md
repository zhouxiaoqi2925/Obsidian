# sass - Sass 语言的"宪法 + RFC + 实施协议"规范仓库

**GitHub**: sass-lang/sass
**Star**: 5.4k
**语言**: Markdown（规范）+ TypeScript（工具）+ Protocol Buffers
**主题**: language-spec / css-preprocessor / living-spec / embedded-protocol
**适用场景**: 学习"规范仓库"组织方式、Literate Programming、Protobuf 跨语言 RPC、协议版本管理

---

## 第一段：规范仓库的分层演进与文档工程

### 模式 1：规范仓库三层演进流（proposal → accepted → spec）

**问题场景**：语言有多个实现（Dart Sass / libSass / JS），需要保证行为一致；语言本身要演进（新语法、新语义），又要给实现者"明确契约"——怎么组织仓库让"激进实验"和"稳定契约"解耦？

**解决方案**：三层演进流——`proposal/`（自由讨论中的 RFC，改动自由）、`accepted/`（已落地提案，语义冻结允许补丁）、`spec/`（主规范，ASN.1 风格过程式算法契约）。单向演进：proposal 接受后并入 accepted，实现落地后合入 spec。

```bash
sass/
├── proposal/        # 讨论中的 RFC（0 个）
├── accepted/        # 已接受提案（90 个，含 Draft 编号）
│   ├── module-system.md    # 79KB / 1801 行 / Draft 10
│   ├── color-4-*.md
│   └── ...
├── spec/            # 主规范（64 个，强契约）
│   ├── spec.md             # 主入口 222 行
│   ├── modules.md
│   ├── syntax.md
│   ├── EMBEDDED_PROTOCOL_VERSION  # 2 行版本号
│   └── js-api/
├── tool/            # 工具链（tangle / untangle / toc / sync-deprecations）
├── test/            # 一致性校验（link-check / js-api-doc-check）
└── .github/workflows/ci.yml  # 7 job
```

**关键参数**：
- `proposal/` = 讨论中的 RFC（语义不确定可激进改）
- `accepted/` = 90 个已落地提案（语义冻结 + Draft 补丁）
- `spec/` = 主规范（spec.md / modules.md / syntax.md，强契约）
- 关系 = proposal RFC 接受后并入 accepted → 实现落地合入 spec
- 90 个 accepted 文档 = 已稳定的语言特性
- 单向演进：不允许从 spec 退回 accepted

**最佳实践**：规范仓库三层结构（proposal / accepted / spec）让"激进实验"和"稳定契约"解耦；新特性先在 proposal 跑通再合并 accepted，最后才合入 spec；用 CI 强校验"spec 改 → version 必改 → CHANGELOG 必改"避免版本号遗忘。

### 模式 2：Literate Programming 双源同步

**问题场景**：规范文档需要展示 TypeScript 类型声明（`compile.d.ts`），但又要保持文档可读（不能光看代码块）——双源易漂移。改完类型忘了同步文档、改完文档忘了改类型？

**解决方案**：`spec/js-api/*.d.ts.md` = literate programming 单一源（既是规范文本也是 .d.ts 源），`js-api-doc/*.d.ts` = tangle 后产物。`tool/tangle.ts` 抽 `<pre>` 块 → 跑 prettier → 写回；`untangle.ts` 反向。

```markdown
<!-- spec/js-api/compile.d.ts.md（人读 + 机读合一） -->
The `compile` function compiles Sass to CSS.

<pre>
/**
 * Compile Sass to CSS.
 * @param path the source file path
 */
export function compile(path: string): Result;
</pre>

See also: `compileString`.
```

```typescript
// tool/tangle.ts（64 行核心）
function tangle(md: string): string {
    const blocks: string[] = [];
    const re = /<pre>([\s\S]*?)<\/pre>/g;
    let m;
    while ((m = re.exec(md)) !== null) {
        blocks.push(prettier.format(m[1], { parser: 'typescript' }));
    }
    return blocks.join('\n\n');
}
// 产物：js-api-doc/compile.d.ts（与 .d.ts.md 中 <pre> 块一一对应）
```

**关键参数**：
- 单一源 = `.d.ts.md`（人读 + 机读合一）
- `<pre>` 块 = tangle 边界
- `// ==<[tangle boundary]>==` = untangle 反向回写锚点
- SHA256 哈希 = 防漂移指纹（源一变 hash 变）
- 工具链 = `tangle.ts` 64 行核心 + `untangle.ts` 反向
- 适用范围 = d.ts.md / proto.md / 任何带语言标记的代码块

**最佳实践**：规范 + 类型声明用 literate programming 写——人读的散文 + 机抽的代码块，单一来源零漂移；`<pre>` 块加 tangle 边界注释支持 untangle 反向；CI 跑 `tangle-check` 校验产物与源 hash 一致。

### 模式 3：Algorithm Specification 过程伪码

**问题场景**：类型签名只说"输入输出"，不承诺执行顺序；但编译器对**副作用顺序**（`@use` 解析顺序、`!global` flag 定稿时机）极敏感。三个实现（Dart / C++ / JS）如何保证行为一致？

**解决方案**：用"let X be...then..."过程伪码定义语义，**而不是**类型签名或测试用例。ASN.1 / RFC 算法描述风格——承诺行为（执行序列），不承诺结构（数据结构）。三个实现各自推导出等价执行序列。

```markdown
<!-- accepted/module-system.md 中的过程伪码 -->
### Resolving `@use 'foo' as bar`

Let `M` be the module being loaded. To resolve the `@use` rule:

1. Let `URL` be the result of resolving `'foo'` relative to `M`'s URL.
2. If no module exists at `URL`:
   a. Throw an error: "Can't find stylesheet 'foo'".
3. Let `Loaded` be the module at `URL`. If `Loaded` is in the process of loading:
   a. Throw a `circular @use` error including the cycle.
4. Add `Loaded` to `M`'s dependency list.
5. For each variable defined in `Loaded` with flag `!default`:
   a. If `M` has a `with` clause providing that variable, use that value.
   b. Otherwise, use `Loaded`'s default value.
6. Bind `bar` (or `Loaded`'s namespace) to `M`'s scope.
```

**关键参数**：
- 风格 = ASN.1 / RFC 算法描述
- 承诺 = 行为（执行序列），不承诺结构（数据结构）
- 多实现 = 各自数据结构 + 同一行为
- 副作用敏感 = import 顺序 / global flag / module 解析
- 反例 = 类型签名不写顺序，三个实现可能分叉
- 实施验证 = dart-sass / libSass 都跑 `sass-spec` 测试套件

**最佳实践**：多实现语言规范用过程伪码描述行为（vs. 类型签名）——保证行为一致 + 实现自由；用 `sass-spec` 外部测试仓库验证多实现行为等价；副作用敏感点（`!global` / `@use` 顺序）必写伪码而不靠测试覆盖。

### 模式 4：Living Spec 不锁版本号

**问题场景**：ECMAScript 标准 4 段式（stage 0/1/2/3 + final）管理复杂；版本号爆炸（TS 5.0 / 5.5 / 6.0）；用户困惑"我现在能用哪个特性"。

**解决方案**：Sass 走"living spec"路线——`spec/spec.md` 显式声明"Sass 是活规范，不分版本号"，实现可以落后，规范可以扩展。`dart-sass` 标记 "not yet implemented" 表示临时落后。

```markdown
<!-- spec/spec.md 顶部声明 -->
# Sass: The Living Spec

This is the **living specification** for Sass. Unlike some languages
which are versioned, Sass is continuously evolving. Implementations
are expected to track the latest spec, but may temporarily lag
behind in unimplemented features (marked as such in this document).

> Sass is intentionally unversioned. There is no "Sass 1.0" or
> "Sass 2.0". The language evolves continuously through accepted
> proposals, and implementations are expected to converge over time.
```

**关键参数**：
- 单一规范 = 没有 stage 0/1/2/3
- 实施滞后 = 合法（dart-sass 标记 "not yet implemented"）
- 扩展性 = 接受新 RFC 即可生效
- 责任 = 实现者读全 spec
- 反例 = TypeScript 锁版本号（5.0 / 5.5 / 6.0）要关心兼容性
- 优势 = 用户不用记"哪个版本支持哪个特性"

**最佳实践**：内部 DSL / 配置文件规范走 living spec（不分版本号）——避免版本爆炸 + 实现者主动追规范；规范文档顶部明文写"这是活规范，不分版本号"；实施者用 "not yet implemented" 标记临时落后项。

### 模式 5：提案 → 接受 → 规范 3 阶段流程

**问题场景**：社区想加新特性（`@extend` 改进、`@apply` 替代），怎么避免"主分支乱改"？怎么给 RFC 透明度？

**解决方案**：3 阶段流程——`proposal/`（自由讨论）→ `accepted/`（语义冻结 + 后续补丁）→ `spec/`（实现契约）。每个阶段有明确的"晋升条件"。

```bash
# RFC 提交流程
1. 起草 proposal/foo.md
   # 模板：动机 / 详细设计 / 缺点 / 备选方案 / 未解决问题
2. PR 提交到 proposal/ 目录
   # 自由讨论、可改 10 次
3. 接受条件 = 实现落地 + 多数实现采纳 + 委员会批准
4. 接受后：proposal/foo.md → accepted/foo.md（含 Draft 编号）
5. 实现稳定后：accepted/foo.md 内容并入 spec/*.md
```

**关键参数**：
- `proposal/` = 0 个（讨论中的）
- `accepted/` = 90 个已落地（含 Draft 1..N 编号）
- `spec/` = 64 个主规范
- 演进流 = 单向（不允许从 spec 退回 accepted）
- 文档大小 = `accepted/module-system.md` 79KB / 1801 行（最大）
- Draft 编号 = 补丁计数（Draft 10 = 改过 10 次）

**最佳实践**：语言演进走 3 阶段（proposal / accepted / spec）——避免主分支乱改，RFC 流程透明；每个 RFC 必含"动机 / 设计 / 缺点 / 备选 / 未解决"5 段；接受后允许补丁（Draft 编号递增）但语义冻结。

---

## 第二段：嵌入式协议与跨语言 RPC

### 模式 6：Embedded Protocol 跨语言 RPC

**问题场景**：host 进程（webpack / vite / rspack）要用任意语言（Node / Python / Rust）调 Sass 编译器，怎么做跨语言通信？JSON-RPC 慢、HTTP 重、gRPC 难嵌入 Node。

**解决方案**：Protocol Buffers over stdio——每条消息 = varint 长度 + 编译 ID + protobuf 负载。子进程跑 `sass-embedded`，host 用任意语言生成 stub。协议版本 `spec/EMBEDDED_PROTOCOL_VERSION` = 3.2.0。

```protobuf
// spec/embedded_sass.proto
syntax = "proto3";
message CompileRequest {
    string input = 1;                    // SCSS 源码
    map<string, string> importer = 2;     // 自定义 import
    string style = 3;                    // expanded / compressed
    repeated string load_paths = 4;
}
message CompileResponse {
    string css = 1;                      // 编译产物
    repeated string loaded_urls = 2;     // @use/@import 加载的 URL
    string source_map = 3;
}
// stdio 帧格式
// [varint 长度][uint32 编译 ID][protobuf 负载]
```

```typescript
// host 端（TypeScript stub）
import { Sass } from './sass-embedded-stub';
const sass = new Sass('/path/to/sass-embedded');
const resp = await sass.compile({ input: '$a: red; .x { color: $a; }' });
console.log(resp.css);  // ".x { color: red; }"
```

**关键参数**：
- 三段式 = 长度前缀 + 编译 ID + 负载
- 长度前缀 = stdio 流无消息边界，需要分帧
- 编译 ID = 一个连接跑多个并行编译（异步响应匹配）
- proto IDL = 自带向后兼容 + 跨语言工具链
- 协议版本 = `spec/EMBEDDED_PROTOCOL_VERSION` = 3.2.0
- 性能 = 比 JSON-RPC 快 10x（protobuf 二进制 + 长度前缀）

**最佳实践**：跨语言 RPC 走 Protobuf over stdio（vs. JSON-RPC）——性能 10x + 跨语言零成本 + 协议向后兼容；用编译 ID 关联请求/响应支持多路复用；协议版本用单文件 + CI 强校验。

### 模式 7：Protocol Buffers 长度前缀分帧

**问题场景**：stdio 流是无消息边界的字节流——直接写 protobuf 消息，接收方不知道一条消息在哪结束。用换行符分帧则转义麻烦、传输效率低。

**解决方案**：长度前缀分帧——每条消息 = `varint 长度 + protobuf 负载`，接收方先读 varint 拿长度，再读对应字节数。Google Stubby / gRPC 标准做法。

```typescript
// 帧写入
function writeFrame(stream: Writable, payload: Buffer, compileId: number) {
    const idBuf = Buffer.alloc(4);
    idBuf.writeUInt32BE(compileId);
    const lenBuf = Buffer.alloc(8);   // 8 字节 varint（最高 64 位）
    // ... varint 编码 length
    stream.write(Buffer.concat([lenBuf, idBuf, payload]));
}
// 帧读取
function readFrame(stream: Readable): { id: number; payload: Buffer } {
    const len = readVarint(stream);   // 阻塞读 varint
    const id = stream.read(4).readUInt32BE();
    const payload = stream.read(len);
    return { id, payload };
}
```

**关键参数**：
- varint = 可变长整数（1-9 字节，小数值省字节）
- 长度 = 整个消息的字节数
- 协议 = Google Stubby 标准做法
- 优势 = 简单（不用换行符）+ 性能（不用扫描）
- 工具 = `protobufjs` / `prost` / `google-protobuf` 跨语言库
- 长度上限 = varint 最多 9 字节（约 4GB）

**最佳实践**：跨进程 / 跨语言 RPC 用"长度前缀 + protobuf"分帧（vs. JSON-RPC）——性能 10x + 跨语言零成本；varint 编码小数值省字节；接收方阻塞读 varint（避免半包）。

### 模式 8：版本号当 CI 数据

**问题场景**：Embedded Protocol 版本号要从 `3.1.0` 升到 `3.2.0`，改了 spec + CHANGELOG 但忘了改 `EMBEDDED_PROTOCOL_VERSION` 文件——CI 怎么强制一致性？

**解决方案**：`spec/EMBEDDED_PROTOCOL_VERSION` 文件 = 2 行（`3.2.0\n`），CI 强校验 `EMBEDDED_PROTOCOL_CHANGELOG.md` 中最新版本号 = 文件值。简单粗暴但有效。

```bash
# spec/EMBEDDED_PROTOCOL_VERSION（2 行）
3.2.0

# CI: .github/workflows/ci.yml
embedded_protocol_versions:
  runs-on: ubuntu-latest
  steps:
    - name: Check version consistency
      run: |
        FILE_VER=$(cat spec/EMBEDDED_PROTOCOL_VERSION | tr -d '[:space:]')
        CHANGELOG_VER=$(grep -oE '## [0-9]+\.[0-9]+\.[0-9]+' \
                        spec/EMBEDDED_PROTOCOL_CHANGELOG.md | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        if [ "$FILE_VER" != "$CHANGELOG_VER" ]; then
          echo "ERROR: version mismatch: file=$FILE_VER, changelog=$CHANGELOG_VER"
          exit 1
        fi
```

**关键参数**：
- 文件 = `spec/EMBEDDED_PROTOCOL_VERSION`（仅版本号）
- CI job = `embedded_protocol_versions`
- 校验 = spec 改 → version 必改 → CHANGELOG 必改
- 失败行为 = CI fail（合并拒绝）
- 简单粗暴 = 无需复杂 schema 校验
- 优势 = 一行命令即可校验，零学习成本

**最佳实践**：版本号用文件存储 + CI 强校验——比写在代码字符串里更难遗忘；版本号变更流程必含三处同步（spec / version 文件 / CHANGELOG）；CI job 必加 .PHONY 标签（即使失败也能继续）。

### 模式 9：YAML 单源 + Checksum 同步

**问题场景**：deprecations 列表要同时出现在 spec 文档、JS API 文档、typedoc——三处手改易漂移。改了一处忘改另两处，文档不一致。

**解决方案**：`spec/deprecations.yaml` 单一源，`tool/sync-deprecations.ts` 同时更新 spec 和 doc 两副本，生成时嵌入 `<!-- Checksum: SHA1 -->` 指纹。`test/deprecations-check.ts` 离线校验漂移。

```yaml
# spec/deprecations.yaml（单一源）
- name: '@import'
  deprecated_in: 'Dart Sass 1.0'
  removed_in: 'Dart Sass 2.0'
  replacement: '@use'
  description: |
    The `@import` rule pollutes the global namespace.
    Use `@use` instead.
- name: 'global-variable-shadowing'
  deprecated_in: 'Dart Sass 1.33'
  replacement: '!default flag with @use'
```

```typescript
// tool/sync-deprecations.ts
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
const yaml = readFileSync('spec/deprecations.yaml', 'utf-8');
const hash = createHash('sha1').update(yaml).digest('hex').slice(0, 8);
const list = yamlToList(yaml);   // 解析
const rendered = `<!-- Checksum: ${hash} -->
${list.map(d => `- **${d.name}** (deprecated in ${d.deprecated_in}): ${d.description}`).join('\n')}
<!-- END -->`;
// 同时写入 spec/js-api/deprecations.d.ts.md 和 js-api-doc/deprecations.d.ts
writeFileSync('spec/js-api/deprecations.d.ts.md', injected);
writeFileSync('js-api-doc/deprecations.d.ts', injected);
```

**关键参数**：
- 单一源 = `deprecations.yaml`
- 双副本 = `spec/js-api/deprecations.d.ts.md` + `js-api-doc/deprecations.d.ts`
- 同步边界 = `<!-- START/END AUTOGENERATED LIST -->`
- 指纹 = SHA1 前 8 字符（反向校验不需要再读 yaml）
- 漂移检测 = `test/deprecations-check.ts` 离线校验
- 漂移行为 = 校验失败 → CI fail

**最佳实践**：多副本数据用"单源 + Checksum"模式——源变更触发再生，指纹反向校验漂移；`<!-- AUTOGENERATED -->` 边界明确禁止手改副本；用 SHA1 前 8 字符（够用 + 简短）。

### 模式 10：死链 + 锚点 + 路径三层校验

**问题场景**：规范文档互相引用（`[link](spec/foo.md#bar)`）——目标文件被删 / 锚点改了 / 相对路径不规范，怎么自动抓出？文档镜像到 sass-lang.com 后相对路径全失效。

**解决方案**：`test/link-check.ts` 三层校验——1) `fs.existsSync` 检查目标文件；2) 解析目标 TOC 查锚点；3) 拒绝 `../spec/` 相对路径（文档镜像后路径会变）。

```typescript
// test/link-check.ts
import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';
const errors: string[] = [];
for (const md of glob.sync('**/*.md', { cwd: 'spec' })) {
    const content = readFileSync(`spec/${md}`, 'utf-8');
    const links = [...content.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]);
    for (const link of links) {
        if (link.startsWith('http')) continue;
        // 第 1 层：路径规范
        if (link.startsWith('../spec/')) {
            errors.push(`${md}: 禁止 ../spec/ 相对路径（用绝对 /spec/）`);
            continue;
        }
        const [path, anchor] = link.split('#');
        if (!existsSync(`spec/${path}`)) {
            errors.push(`${md}: 死链 ${path}`);
            continue;
        }
        // 第 2 层：锚点存在
        if (anchor) {
            const target = readFileSync(`spec/${path}`, 'utf-8');
            const headings = [...target.matchAll(/^#{1,6}\s+(.+)$/gm)];
            if (!headings.some(h => slug(h[1]) === anchor)) {
                errors.push(`${md}: 锚点不存在 #${anchor} in ${path}`);
            }
        }
    }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
```

**关键参数**：
- 文件存在 = 基础（`fs.existsSync`）
- 锚点存在 = 解析 `<!-- TOC -->` 块或 markdown heading
- 路径洁癖 = `../spec/` 不允许（位置无关性）
- 公共文档 = 镜像到 sass-lang.com 后路径变
- CI = `link-check` job 失败即合并拒绝
- heading slug 规则 = GitHub 风格（小写、空格 → `-`、去标点）

**最佳实践**：规范文档加 3 层链接校验（文件 + 锚点 + 路径）——文档镜像 / 路径变化自动抓住；用绝对路径 `/spec/foo.md` 不用相对路径 `../spec/foo.md`（位置无关）；CI 必跑 link-check。

---

## 第三段：CSS 语言特性与工具链

### 模式 11：@use 模块系统

**问题场景**：传统 `@import` 全局污染——变量/混合器/函数作用域不分；同名覆盖静默发生；大型项目维护崩溃。jQuery 时代样式表相互依赖的混乱。

**解决方案**：`@use` 模块系统——按文件分 namespace，`@use 'foo' as bar` 显式命名空间，变量/混合器只在本文件可见。私有成员用 `_` 前缀，`@forward` 转发，`with()` 配置参数化。

```scss
// src/_colors.scss（私有模块）
$primary: #3498db;     // 私有（_ 前缀）
$_secondary: #2ecc40;  // 私有
@forward 'colors' show $primary;   // 转发 + 显式白名单

// src/_typography.scss
$base-size: 16px;
@mixin heading { font-family: sans-serif; }

// src/main.scss（主入口）
@use 'colors' as c;
@use 'typography' with (
    $base-size: 18px       // 配置覆盖
);
.button {
    color: c.$primary;
    @include typography.heading;
    font-size: typography.$base-size;
}
```

**关键参数**：
- 文件 = 独立 namespace（默认 = 文件名）
- 显式命名空间 = `@use 'foo' as f`，避免污染
- 私有成员 = `_` 前缀（外部不可访问）
- 转发 = `@forward 'foo'` 重新导出
- 配置 = `with ($primary: blue)` 覆盖模块内变量
- 旧版兼容 = `@import` 仍支持（但新项目禁用）
- Sass 1.23+ 稳定（2019）

**最佳实践**：新项目用 `@use` 替代 `@import`——namespace 显式 + 作用域隔离 + 配置参数化；用 `with()` 做模块配置（API 形式）；用 `@forward` 做库"门面"（用户只引一个文件）。

### 模式 12：Plain CSS Nesting 兼容

**问题场景**：原生 CSS 在 2023 加入 Nesting（`& > .child { ... }`），但 Sass 的 nesting 语法（无 `&`）不兼容——怎么平滑过渡？团队代码两种风格混杂。

**解决方案**：`accepted/plain-css-nesting` RFC——Sass 编译器检测 `&` 出现则走原生 CSS Nesting 路径；纯缩进走 Sass 路径。同时支持两种语法。

```scss
// Sass 风格（传统）
.card {
    padding: 1rem;
    .title {                       // 无 & 隐式继承
        font-size: 1.5rem;
    }
    &:hover {                       // & 显式引用父
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
}
// CSS 风格（2023+）
.card {
    padding: 1rem;
    & > .title {                   // & 显式
        font-size: 1.5rem;
    }
    &:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
}
```

**关键参数**：
- 检测 = 看代码中是否有 `&` 符号
- 兼容层 = Sass 编译到 CSS 后给浏览器解释
- 过渡期 = 用户混合写（推荐学习 CSS 官方语法）
- 工具支持 = 编译器 / 编辑器 LSP 同步识别
- 长期 = 减少预处理器特有语法依赖
- 优势 = 团队代码风格统一 + 学一次到处用

**最佳实践**：CSS 标准追上来的特性（nesting / color-mix）逐步用原生写法 + 编译器兜底，渐进迁移；新代码用 CSS 风格 `&`（标准化），老代码保留 Sass 风格（不强制改）；用 stylelint 规则统一风格。

### 模式 13：CSS Color 4 支持

**问题场景**：传统 Sass 颜色用 hex / rgb / hsl，色域窄；CSS Color 4 加 lab / lch / oklch + color() 函数 + 动态色——怎么集成？设计系统主题切换、动态对比度计算需要更广色域。

**解决方案**：`accepted/color-4-*` RFCs——`color.adjust($c, $lightness: 10%)` 支持所有 color space；新增 `color.channel($c, 'oklch', 'lightness')` API；编译时选最佳表示。

```scss
@use 'sass:color';

$brand: oklch(60% 0.15 250);              // oklch 色域更广
$dark: color.adjust($brand, $lightness: -20%);
$complement: color.rotate($brand, 180);

// 主题切换（动态色）
@mixin theme($is-dark) {
    background: if($is-dark,
        color.adjust($brand, $lightness: -30%),
        color.adjust($brand, $lightness: 10%)
    );
}

// 通道 API
$l: color.channel($brand, 'oklch', 'lightness');  // 60%
$h: color.channel($brand, 'oklch', 'hue');        // 250
```

**关键参数**：
- 新色域 = lab / lch / oklch / display-p3
- 通道 API = `color.channel($c, $space, $channel)`
- 转换 = `color.to-space($c, 'oklch')`
- 输出 = 编译时选最佳表示（hex / color() / oklch()）
- 降级 = 老浏览器转 sRGB
- oklch 优势 = 感知均匀（亮度变化线性）+ 广色域

**最佳实践**：颜色处理走 CSS Color 4（oklch 色域更广）——做设计系统主题切换、动态对比度计算必备；用 `color.adjust` 而非手算 hex 亮度；老浏览器目标用 `@supports` 降级到 hex。

### 模式 14：Sass Compiler 选型（dart-sass / libSass / sass-embedded）

**问题场景**：webpack / vite / rspack 集成 Sass 编译，用 dart-sass（官方 Dart） / libSass（C++，已弃用） / sass-embedded（独立子进程）哪个？性能 / 集成 / 维护性如何权衡？

**解决方案**：`sass-embedded` 是新标准——跨语言 host 调子进程，协议稳定 3.2.0，性能接近 libSass（Dart AOT 编译后）。dart-sass 仍维护（fallback），libSass 2022 弃用。

```bash
# 选型对比
# dart-sass（Dart 官方，JS 集成）
npm install sass
# sass-loader 默认 dart-sass

# sass-embedded（独立子进程，跨语言 host）
npm install sass-embedded
# vite / rspack / 自研构建工具选 embedded
# 性能：dart-sass AOT 编译后 vs libSass 慢 30%，但够用

# libSass（已弃用，2022）
# 不要用
```

```typescript
// vite.config.ts（用 sass-embedded）
import { defineConfig } from 'vite';
export default defineConfig({
    css: {
        preprocessorOptions: {
            scss: { api: 'modern-compiler' }
        }
    }
});
```

**关键参数**：
- dart-sass = 官方、慢、JS 集成容易（npm install sass）
- libSass = 快、但 2022 弃用（不再更新）
- sass-embedded = 子进程 + protobuf RPC + 跨语言
- 性能 = dart-sass AOT 比 libSass 慢 30%，但够用
- 集成 = webpack-sass-loader / vite 都支持 embedded
- 协议 = Embedded Protocol 3.2.0（向后兼容）

**最佳实践**：新项目用 `sass-embedded`——性能好 + 跨语言 host + 协议稳定，避免 libSass 弃用陷阱；纯 Node 项目可继续用 `sass`（dart-sass）；不要选 libSass（已弃用）。

### 模式 15：accepted/ 与 spec/ 的差异

**问题场景**：社区新提案可能改 10 次才稳定，规范冻结后不能改——怎么管理"灵活性"和"稳定性"？给实现者多强的承诺？

**解决方案**：`accepted/` 允许打补丁（`Draft N`），`spec/` 是最终契约——accepted 是"暂稳定"，spec 是"长期稳定"。两阶段承诺强度不同。

```bash
# 三层关系
proposal/        # 0 文档 = 暂无（讨论中）
accepted/        # 90 文档 = 已接受（含 Draft 编号）
spec/            # 64 文档 = 主规范

# accepted 文档演进
# module-system.md：Draft 1 → 2 → 3 → ... → Draft 10（语义冻结，补丁允许）
# 一旦合入 spec/：最终契约，重大变更需新 RFC

# accepted → spec 的转换时机
# 1. dart-sass 落地
# 2. 多数实现采纳
# 3. 委员会批准
# 4. 内容合入 spec/*.md
```

**关键参数**：
- `proposal/` = 0 文档 = 暂无
- `accepted/` = 90 文档 = 已接受（含 Draft 编号）
- `spec/` = 64 文档 = 主规范
- 演进节奏 = accepted 模块系统 Draft 10 = 10 次迭代
- 转换时机 = 实现落地 + 多数实现采纳 → 合入 spec
- 承诺强度 = spec > accepted > proposal

**最佳实践**：规范仓库分"暂稳定（accepted）+ 长期稳定（spec）"两层——给实现者明确承诺强度；accepted 文档 Draft 编号反映补丁次数（Draft 10 = 改过 10 次）；spec 合入后重大变更需新 RFC（不允许直接改 spec）。

---

## 第四段：TypeScript 类型与工程实践

### 模式 16：TypeScript 模板字面量泛型

**问题场景**：CustomFunction 同步返回 `Value`，异步返回 `Promise<Value>`；用户传错类型时想要 IDE 立刻报错。怎么用类型系统强制"调用者约束"？

**解决方案**：`CustomFunction<sync extends 'sync' | 'async'>` 模板字面量泛型——`'sync'` 时返回 `Value`，`'async'` 时返回 `Promise<Value>`，编译期约束调用方。`PromiseOr<T, Sync>` 辅助类型映射。

```typescript
// spec/js-api/legacy/legacy_api.d.ts.md
type PromiseOr<T, Sync extends 'sync' | 'async'> =
    Sync extends 'sync' ? T : Promise<T>;

interface CustomFunction<Sync extends 'sync' | 'async' = 'sync'> {
    (args: Value[]): PromiseOr<Value, Sync>;
}

interface Options {
    functions?: Record<string, CustomFunction<'sync'>>;     // 同步函数
    asyncFunctions?: Record<string, CustomFunction<'async'>>; // 异步函数
}

// 编译器内部
class Compiler {
    compile(options: Options): Value;             // 只接同步
    compileAsync(options: Options): Promise<Value>; // 只接异步
}
```

**关键参数**：
- 泛型 = `sync extends 'sync' | 'async'`
- 类型映射 = `PromiseOr<T, 'sync'>` = `T`，`PromiseOr<T, 'async'>` = `Promise<T>`
- 约束 = `compileAsync` 只能用 `'async'`，`compile` 只能用 `'sync'`
- IDE 反馈 = 传错类型编译错误
- 优势 = 把"调用者约束"编译进类型系统
- 文档即类型 = `.d.ts.md` 同时是规范和类型

**最佳实践**：sync/async 双签名 API 用模板字面量泛型——用户传错时 IDE 立刻报错，文档即类型；用辅助类型 `PromiseOr<T, Sync>` 包装双签名；`.d.ts.md` literate programming 同时是规范和类型（避免漂移）。

### 模式 17：多实现 + 同一行为

**问题场景**：dart-sass（官方 Dart 实现） / libSass（C++ 实现） / sass-embedded（独立包）三个实现，行为必须一致——怎么约束？三个实现走各自数据结构。

**解决方案**：规范只承诺"行为"不承诺"结构"——过程伪码定义执行序列，三个实现各自选数据结构（树 / AST / SSA）。行为测试靠外部 `sass-spec` 仓库（dart-sass / libSass 都跑）。

```bash
# sass-spec 仓库（外部）
sass-spec/
├── spec/
│   ├── css/
│   │   ├── at-use/
│   │   │   ├── basic.hrx        # 输入 SCSS + 期望 CSS
│   │   │   └── ...
│   │   └── ...
│   └── ...
├── scaffolds/                   # 公共 setup
└── run_spec.rb                  # 跑所有实现

# 各实现跑测试
dart-sass$ pub run sass-spec   # 跑全部
libsass$   make spec            # 跑全部
```

**关键参数**：
- 规范层 = 行为（执行序列、副作用顺序）
- 实现层 = 数据结构（自由）
- 行为测试 = `sass-spec` 仓库（外部），dart-sass / libSass 都跑
- 多样性 = Dart 慢但易维护 / C++ 快但难改 / Node 易嵌入
- 长期 = dart-sass 是 reference，libsass 弃用
- 行为覆盖 = 100% spec 行为都有对应测试

**最佳实践**：多实现语言规范只承诺行为——给实现者数据结构自由，行为靠 spec 强制；用外部 `sass-spec` 仓库集中行为测试（各实现跑同一套）；deprecate 慢实现时给迁移期（libsass 弃用但保留 2 年过渡）。

### 模式 18：Sass Spec 工具链全景

**问题场景**：214 个文件（90 accepted + 64 spec）需要自动化维护——TOC 生成 / 链接检查 / 漂移检测 / Protobuf 生成。手动维护不可能。

**解决方案**：`tool/` 4 个核心工具 + `test/` 4 个检查器 + `.github/workflows/ci.yml` 7 个 job。`tangle.ts` / `untangle.ts` / `toc.ts` / `sync-deprecations.ts` 自动化文档。

```bash
# tool/ 目录
tool/
├── tangle.ts            # 64 行 literate 编织器（.d.ts.md → .d.ts）
├── untangle.ts          # 反向（.d.ts → .d.ts.md）
├── toc.ts               # 自动生成 TOC（markdown heading → 链接）
├── sync-deprecations.ts # YAML 双源同步（spec + doc 副本）
└── ...

# test/ 目录（自检）
test/
├── link-check.ts        # 死链 + 锚点 + 路径校验
├── js-api-doc-check.ts  # spec/doc 一致性
├── deprecations-check.ts # 校验 yaml → 双副本哈希一致
└── ...

# CI: .github/workflows/ci.yml（7 job）
# 1. tangle-check
# 2. toc-check
# 3. link-check
# 4. deprecations-check
# 5. js-api-doc-check
# 6. embedded_protocol_versions
# 7. sass-spec
```

**关键参数**：
- `tangle.ts` = 64 行 literate 编织器
- `untangle.ts` = 反向工具
- `toc.ts` = 自动生成 TOC
- `sync-deprecations.ts` = YAML 双源同步
- `link-check.ts` = 死链 + 锚点 + 路径校验
- `js-api-doc-check.ts` = spec/doc 一致性
- CI = 7 job（任意一个 fail 即合并拒绝）

**最佳实践**：规范仓库必备"工具链 + 自检脚本 + CI"三件套——文档一致性问题自动化抓住；每个工具一个职责（tangle / link / toc 独立）；CI job 数量反映"检查维度"，多 job 比单 job 失败信息清晰。

### 模式 19：spec.md 主入口 222 行

**问题场景**：规范文档动辄上千行，新人难找入口；spec 必须有"一句话定义 + 核心算法 + 子规范索引"。新贡献者 10 分钟读不完核心。

**解决方案**：`spec/spec.md` 仅 222 行——scope / compiling / executing 三大段，每段给子规范链接（`@use` / `@import` / `@extend`）。主入口不长，细节下沉到子文档。

```markdown
<!-- spec/spec.md（222 行主入口） -->
# Sass: The Living Spec

## Scope
Sass is a stylesheet language... [→ syntax.md for full grammar]

## Compiling
The compiler transforms a Sass file to a CSS file in two phases:
1. Parsing (lexical + syntactic)
2. Execution (interpreting the AST)

### Loading
The `@use` and `@forward` rules [→ modules.md].
The `@import` rule [→ imports.md] (deprecated).

### Extending
The `@extend` rule [→ extend.md].

## Executing
Sass uses lazy evaluation with late binding...

## Sub-specifications
- [Style](style.md): nested rules + parent selector
- [Values](values.md): numbers / colors / strings / lists / maps
- [Variables](variables.md]: `!default` / `!global`
- [Modules](modules.md]: `@use` / `@forward` / `with()`
```

**关键参数**：
- scope = 语言定义 + 非目标
- compiling = 编译期规则（语法树、@ 规则）
- executing = 执行期规则（求值、副作用）
- 子规范 = linked via TOC
- 维护纪律 = 主入口不长，细节下沉到子文档
- 222 行 = 经验值（核心算法+索引+示例）

**最佳实践**：规范主入口控制在 200-300 行——细节下沉子文档，新人 10 分钟能读完核心；scope / compiling / executing 三段式覆盖全生命周期；用 TOC 自动生成而非手写（避免漂移）。

### 模式 20：7 天复刻 mini-Sass-Spec 仓库

**问题场景**：想做自己的"规范仓库"（内部 DSL / 配置文件 / 协议），但不知道从何入手。规范设计哲学难，工具链反而简单。

**解决方案**：7 天 MVP——Day 1-2 搭 spec/accepted/proposal 目录，Day 3 literate programming 工具，Day 4 link-check 脚本，Day 5 typedoc 集成，Day 6 CI 7 job，Day 7 镜像到 docs site。

```bash
# Day 1-2：目录结构
mkdir -p spec/{accepted,proposal,js-api}
echo "1.0.0" > spec/VERSION
mkdir -p tool test .github/workflows

# Day 3：literate programming 工具
cat > tool/tangle.ts << 'EOF'
// 抽 <pre> 块 → 写产物
EOF

# Day 4：link-check
cat > test/link-check.ts << 'EOF'
// 校验文件 + 锚点 + 路径
EOF

# Day 5：typedoc 集成
npm install typedoc
typedoc --out js-api-doc spec/js-api/

# Day 6：CI 7 job
cat > .github/workflows/ci.yml << 'EOF'
jobs:
  tangle-check:
  toc-check:
  link-check:
  deprecations-check:
  js-api-doc-check:
  version-check:
  spec-test:
EOF

# Day 7：镜像到 docs site
mkdocs gh-deploy
```

**关键参数**：
- 核心 = literate programming 工具（50 行）
- 校验 = link / toc / deprecations 一致性
- CI = 至少 3 job（link / toc / drift）
- 文档站 = typedoc / vuepress / docusaurus
- 复刻难度 = 工具链不难，规范本身的设计哲学难
- 关键决策 = 走 living spec 还是版本号（推荐 living spec）

**最佳实践**：复刻规范仓库先做 literate 工具 + 链接校验——文档一致性问题自动化，剩余靠规范设计哲学；CI 必含 3 job（link / toc / drift）作为最低要求；内部 DSL 推荐走 living spec（不分版本号）。

---

## 附录：5 段必读代码

1. `spec/spec.md` — 主规范入口（222 行，scope + compiling + executing）
2. `accepted/module-system.md` — 最大 RFC（79KB / 1801 行 / Draft 10）
3. `tool/tangle.ts` — literate programming 编织器（64 行核心）
4. `test/link-check.ts` — 三层链接校验（文件 + 锚点 + 路径）
5. `spec/EMBEDDED_PROTOCOL_VERSION` — 版本号文件（2 行 + CI 强校验）

## 一句话总结

sass 规范仓库 = proposal/accepted/spec 三层演进流 + Literate Programming 双源同步 + ASN.1 风格过程伪码 + Protocol Buffers 跨语言 RPC + Living Spec 不锁版本号，把"语言宪法"的演化做到"激进实验"和"稳定契约"解耦，dart-sass / libSass / sass-embedded 三实现行为一致；最值得偷的是"规范仓库的工程化"——三层演进流让 RFC 透明，literate programming 让规范 + 类型声明零漂移，Protobuf over stdio 让跨语言 RPC 标准化，living spec 让内部 DSL 摆脱版本号负担。
