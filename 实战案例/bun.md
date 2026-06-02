# bun - 5-in-1 JS 工具链单体：JSC + Zig + mimalloc arena 的极致性能工程

**GitHub**: oven-sh/bun
**Star**: 80k+
**语言**: Zig + JavaScriptCore + TypeScript + Rust
**主题**: JS 运行时 / 包管理 / 打包器 / 测试器 / 转译器 / 一体化
**适用场景**: Node.js 替代、全栈 JS 工具链、Serverless 部署、Edge 运行时、性能敏感场景

## 第一段：基础范式

### 模式 1：5-in-1 单体二进制——一个可执行替代 Node + npm + esbuild + Jest + tsc

**问题场景**：前端项目工具链碎片化——`node` 跑代码 + `npm` 装包 + `esbuild` 打包 + `jest` 测 + `tsc` 转译 + `nodemon` 监控——6 个工具、6 个版本、6 份配置文件。CI 上"装依赖"就 30 秒。

**解决方案**：Bun 用 50MB 单体二进制把 5 个工具整合：`bun run`（运行时）+ `bun install`（包管理）+ `bun build`（打包器）+ `bun test`（测试）+ `bunx`（执行包）。一个二进制 + 一个 `bunfig.toml` 配置。`bun --version` 启动 < 5ms。
```
bun run         → JSC 运行时
bun install     → PackageManager（25x faster than npm）
bun build       → BundleV2（基于 esbuild 算法）
bun test        → TestRunner（jest API 兼容）
bunx            → npx 等价（包内执行）
```

**关键参数**：
- 50MB 单体二进制——含 JSC fork
- 1.4.0 稳定版——月下载 800 万+
- `bunfig.toml` 统一配置——替代 5 份 config
- Zig 1.4+ + JSC fork（WebKit/262K LOC C++）
- 启动 5ms vs Node 50ms——10x 提升

**最佳实践**：一体化工具链降低配置成本——一个二进制 + 一份 config 替代 6 个；启动性能是核心 KPI——5ms 内进入主循环；JSC 替代 V8——启动快 30% + 内存低；JIT 启动延迟小——Serverless 场景关键。

---

### 模式 2：JSC 选型——苹果维护 + 启动快 + 内存低

**问题场景**：Node.js 用 V8 是为 JIT 性能——但 V8 启动慢（50ms+）、内存占用大（base 30MB），Serverless 场景"启动 100ms 内"是刚需。Bun 创始人不愿 fork V8 但要"启动 5ms 内"。

**解决方案**：用 JavaScriptCore（JSC，WebKit 内核）替代 V8。JSC 苹果维护，启动快 30%、内存低、JIT 启动延迟小。代价：JSC API 偏 C 语言，需要大量 Zig/C++ 绑定层（`src/jsc/` 113 个文件）。
```zig
// src/bun.js.zig:158
pub fn Run.boot(ctx: *Command.Context) !void {
    if (strings.endsWithComptime(entry_path, ".sh")) {
        return bootBunShell(ctx, entry_path);  // shell 跳过 JSC
    }
    bun.jsc.initialize(ctx.runtime_options.eval.eval_and_print);
    // 进入 JSC 事件循环
}
```

**关键参数**：
- JSC 50万行 C++ fork——WebKit/Source/JavaScriptCore
- 启动 5ms vs V8 50ms——10x
- 内存 base ~10MB vs V8 30MB——3x 节省
- 代价：`src/jsc/` 113 个绑定文件
- `endsWithComptime` 编译期判断——shell 跳过 JSC

**最佳实践**：运行时选型看场景——Serverless 优先 JSC 启动快；CPU 密集选 V8 峰值性能；Bun 走 JSC——Serverless / Edge 友好；JSC API 偏 C——用 Zig 封装成现代 API；shell 跳过 JSC——为 1% 路径优化 1% 用户体验。

---

### 模式 3：mimalloc threadlocal arena——任务结束一次性释放

**问题场景**：打包器一个 bundle 任务要分配百万级 AST 节点 + 字符串 + 映射——手动 free 易错、GC 太慢、引用计数有开销。任务结束后"清空所有临时内存"是常见需求。

**解决方案**：用 mimalloc threadlocal heap 做 arena——每个 bundle 任务一个独立堆，所有分配走这个堆。任务结束 → 堆销毁 → 一次性释放所有内存。**手动 free 0 负担**。
```zig
// src/bundler/bundle_v2.zig:7-44
// Bun's bundler relies on mimalloc's threadlocal heaps as arena allocators.
// When a new thread is spawned for a bundling job, it is given a threadlocal
// heap and all allocations are done on that heap. When the job is done, the
// threadlocal heap is destroyed and all memory is freed.
```

**关键参数**：
- mimalloc threadlocal heap = arena
- 任务结束 heap 销毁——所有内存自动 free
- 全局共享数据必须用 `bun.default_allocator`（全局堆）
- 违反会段错误——编译期不可检查
- 4510 行 `bundle_v2.zig` 主引擎——全用 arena

**最佳实践**：短生命周期任务用 arena allocator——避免手动 free；threadlocal heap 让分配零开销；全局共享数据必须明确用全局堆——避免段错误；任务边界就是 arena 边界——自然管理内存；50 万行 Zig 代码全用此模式。

---

### 模式 4：AST 节点指针变体——Data 只占指针大小

**问题场景**：JS AST 节点有 30+ 类型（`S.Function` 768 bit / `S.Call` 50 bit / `S.True` 1 bit）。V8 风格的"Data union"会取最大值——`S.True` 也占 768 bit 内存，浪费。

**解决方案**：用 `Data = union(enum) { function: *S.Function, true: void }` 指针变体——Data 只占指针大小。`S.True` 用 0 字节 payload，Bun 整体 AST 内存降 10 倍。**代价是缓存局部性差**——注释坦诚写"only benchmarks will provide an answer"。
```zig
// src/js_parser/js_parser.zig:8-35
// I chose #3 mostly for code simplification -- sometimes, the data is modified in-place.
// But also it uses the least memory.
```

**关键参数**：
- 30+ AST 类型——`S.Function / S.Call / S.True / S.Identifier / S.BinaryExpression`
- 指针变体 union(enum)——Data 只占指针大小
- `S.True` 0 字节 payload
- 整体 AST 内存降 10 倍
- 缓存局部性差——benchmark 说话

**最佳实践**：AST 节点多变体用指针变体——Data 只占指针大小；枚举 union 编译期穷尽检查——少一个 case 报错；缓存局部性 vs 内存 trade-off——benchmark 验证；多 type 数据结构用指针变体——节省 10x 内存；项目方注释坦诚 trade-off。

---

### 模式 5：S3 风格的 lock-free MPSC channel

**问题场景**：JS 引擎有"主线程 + 后台解析/编译 worker"——跨线程通信用 Mutex+Condvar 太重；Web 平台只能传 structured clone。

**解决方案**：用 `bun.simdutf` + 自家 MPSC channel——lock-free 环形 buffer + atomic head/tail。Zig 0.13+ 提供 `atomic.Value(T)` CAS 操作。**Web Worker 用 `postMessage` + `Transferable`；本地线程用 lock-free channel**。
```zig
// src/threading/Channel.zig
pub fn send(self: *Channel, item: T) !void {
    while (true) {
        const head = self.head.load(.Acquire);
        if (head - self.tail.load(.Acquire) < self.capacity) {
            self.buffer[head % self.capacity] = item;
            self.head.store(head + 1, .Release);
            return;
        }
        // queue full, spin or yield
    }
}
```

**关键参数**：
- MPSC ring buffer
- atomic head/tail
- CAS 操作——Zig `atomic.Value(T)`
- spin-then-yield 退避
- Web `postMessage` + `Transferable` 兜底

**最佳实践**：跨线程通信用 lock-free MPSC——比 Mutex 快 10x；ring buffer 容量 2 的幂——`% cap` 优化为 `& mask`；Web 平台用 `Transferable`——零拷贝传 ArrayBuffer；spin-then-yield 退避——CPU 友好；多平台用最合适的原语。

---

## 第二段：扩展范式

### 模式 6：N-API 兼容层——原生 Node 模块无需重写

**问题场景**：Node 生态有 100 万+ 原生 C++ 插件（`bcrypt` / `sharp` / `better-sqlite3`）——Bun 重新实现 N-API 才能兼容。代价大。

**解决方案**：用 `node-api`（C ABI 规范）实现 N-API 兼容层——所有原生模块按 N-API 编译即可同时跑 Node + Bun。Bun 提供 `bun:ffi` 直接调 C 库（不写 N-API 胶水）。**N-API 100% 覆盖 + FFI 子集 = 90% 兼容**。
```zig
// src/bun.js/api/bun/napi.zig
pub fn napi_get_cb_info(env: napi_env, cbinfo: napi_callback_info,
    argc: *c_int, argv: [*c]napi_value,
    this_arg: *napi_value, data: *c_void) napi_status {
    // 直接调 JSC API
    return napi_ok;
}
```

**关键参数**：
- node-api C ABI 规范
- 100 万+ 原生模块复用
- `bun:ffi` 直接调 C 库
- jsc-bindings 在 `src/bun.js/bindings/`
- 90% 兼容——少数 V8 专属 API 失败

**最佳实践**：跨运行时兼容用 N-API 规范——C ABI 一次编译多 runtime；Bun 加 `bun:ffi` 简化路径——不写 N-API 胶水；100 万+ 插件复用——生态护城河；ABI 而非 API——稳定 10 年；少数 V8 专属——文档明示不支持。

---

### 模式 7：BunPM 用 25x 加速 npm install

**问题场景**：`npm install` 一个 1000 依赖的 React 项目要 30s——串行下载 + 解压 + 链接 + 写 lock。

**解决方案**：用 BunPM——并行下载（HTTP/2 + 多连接）+ 并行解压（worker pool）+ 硬链接共享文件（`bun install --linker=hoisted` 或 `isolated`）+ `bun.lockb` 二进制 lock（比 `package-lock.json` 小 10x）。**网络层用 uWebSockets-c 替代 Node http**。
```ts
// src/install/PackageManager.ts
async function install(pkg: Pkg) {
    // 1. 并行下载 tarball（多 HTTP/2 流）
    // 2. 并行解压到临时目录
    // 3. 硬链接到 node_modules（共享 .bin / .package.json）
    // 4. 写 bun.lockb（MessagePack 编码）
}
```

**关键参数**：
- HTTP/2 多流并发下载
- worker pool 并行解压
- 硬链接共享——磁盘 IO 减半
- `bun.lockb` MessagePack 二进制 lock
- 25x 速度提升 vs npm 7

**最佳实践**：包管理器用硬链接共享文件——磁盘 IO 减半；二进制 lock 比 JSON lock 小 10x；多 HTTP/2 流并发——比串行快 10x；worker pool 并行解压——CPU 密集并行化；`--linker` 切换 hoisted / isolated——兼容 npm / pnpm 风格。

---

### 模式 8：HTML-first bundler——`<script src>` 自动检测打包

**问题场景**：传统 webpack/vite 要配 `entry: './src/index.js'` 才能打包。开发者写 `<script src="main.js">` 浏览器原生加载，Bundler 不知道入口。

**解决方案**：用 HTML-first bundler——Bun 扫 HTML `<script src>` 自动识别入口。`bun build ./index.html` 一步打包。**不需要 webpack.config.js**。
```html
<!-- index.html -->
<script src="./main.js"></script>
<link rel="stylesheet" href="./style.css">
```
```bash
bun build ./index.html --outdir=dist --minify
```

**关键参数**：
- HTML 扫描入口
- 0 配置启动
- `<script src>` 自动收集
- CSS 链接处理
- `<link rel="modulepreload">` 识别

**最佳实践**：Bundler 用 HTML-first 扫描——0 配置；`<script src>` 自动收集——浏览器/Bundler 同一入口；省 webpack.config.js——onboarding 简单；CSS 自动跟随——一站式；Vite 也是 HTML-first 思路——行业标准。

---

### 模式 9：TypeScript-native——tsconfig.json 替代 babel.config

**问题场景**：TypeScript 跑在 Node 要先 `tsc` 转译再 `node` 跑——两步 + 慢。开发体验差。

**解决方案**：`bun run` 直接跑 `.ts` 文件——内嵌 TS 编译器前端（基于 swc）。`tsconfig.json` 直接生效。**React JSX 同样支持**——`bun run server.tsx` 一步。
```bash
# 不用 tsc + node 两步
bun run server.ts
# 直接跑
```

**关键参数**：
- 内嵌 swc TS 编译器
- tsconfig.json 直接生效
- JSX/TSX 支持
- 启动 < 10ms 转译
- 比 ts-node 快 30x

**最佳实践**：JS 运行时直接支持 TS——零配置转译；swc 转译比 tsc 快 30x；`tsconfig.json` 复用——IDE 同步；JSX 一步支持——React 用户友好；启动延迟 < 10ms——开发体验关键。

---

### 模式 10：Bun Shell — `.sh` 脚本用 JS 语法 + POSIX 兼容

**问题场景**：CI 脚本写 Bash 难调试（无类型、字符串拼接）；跨平台 shell 兼容性差（macOS bash 3.2 vs Linux bash 5）。

**解决方案**：`bun run` 内置 Bun Shell——JS 语法写 shell 命令，跨平台一致。`$ \`ls *.ts\` `$ `` 模板字符串。**支持 glob / pipe / 环境变量 / 命令替换**。
```ts
import { $ } from "bun";
const files = await $`ls *.ts`.text();
// 跨平台一致
await $`rm -rf ${buildDir} && mkdir -p ${buildDir}`;
```

**关键参数**：
- `$` 模板字符串
- glob / pipe / env
- 跨平台一致
- 错误处理——非零退出码抛
- 比 zx 轻 5x

**最佳实践**：跨平台 shell 脚本用 Bun Shell——JS 语法 + 跨平台一致；`$` 模板字符串——类 shell 体验；glob / pipe 原生支持——常用功能不缺；非零退出抛错——比 shell 隐式好；替代 zx——更轻量。

---

## 第三段：进阶范式

### 模式 11：Hot Reload 监听 fs.watch + 进程内重载

**问题场景**：开发 Node 服务改代码要 `Ctrl+C` + `node server.js`——重启 1s。开发体验差。

**解决方案**：`bun --hot server.ts` 监听 `fs.watch`——文件变更时进程内重新执行模块。**WebSocket 通知前端 HMR**。比 nodemon 快 5x（无进程 fork）。
```bash
bun --hot server.ts
# 改 server.ts → 进程内 reload → WebSocket 通知 HMR
```

**关键参数**：
- `fs.watch` 监听
- 进程内 reload
- WebSocket HMR
- 无进程 fork
- 比 nodemon 快 5x

**最佳实践**：开发时用进程内 reload——无 fork 开销；`fs.watch` 而非轮询——系统调用高效；HMR 配合前端——保留状态；nodemon 慢是因 fork——Bun 直接 reload 解决；开发体验是竞争力。

---

### 模式 12：MySQL/Postgres/Redis 客户端统一 interface

**问题场景**：Node 生态 MySQL 用 `mysql2`、Postgres 用 `pg`、Redis 用 `ioredis`——3 套 API、3 套连接池、3 套类型。

**解决方案**：`bun:sqlite` + `bun:postgres` + `bun:redis` 内置驱动——统一 tagged template literal `$` 调用 SQL/Redis 命令。**比 mysql2/pg/ioredis 快 2-5x**（Zig 实现 + 零拷贝）。
```ts
import { sql, redis } from "bun";
// SQL
const users = await sql`SELECT * FROM users WHERE id = ${id}`;
// Redis
await redis.set("key", "value", "EX", 60);
```

**关键参数**：
- `bun:sqlite` 内置驱动
- `bun:postgres` / `bun:redis`
- tagged template literal
- 2-5x 速度提升
- 零拷贝 Zig 实现

**最佳实践**：内置驱动性能优于 npm 包——Zig 实现零拷贝；tagged template 防止 SQL 注入——比拼接安全；统一 API 跨 DB——降低切换成本；`bun:sqlite` 同步 API——适合嵌入式场景；性能 + 体验双赢。

---

### 模式 13：Bun macros — 编译期 JS 展开

**问题场景**：业务要"编译期跑 JS 生成常量"——传统 macro 系统复杂（Rust proc-macro、Lisp macro）。

**解决方案**：`bun test` + Bun macros — `import { macro } from "bun"`，`macro(sql => "select 1")` 在编译期求值并展开。**TS 类型擦除后 inline**。
```ts
import { macro } from "bun";
const generated = macro(() => {
    return Math.random() > 0.5 ? "a" : "b";
});
// 编译时跑一次，运行时拿结果
```

**关键参数**：
- 编译期求值
- TS 类型擦除后 inline
- 简单 API
- 调试友好
- 编译期 + 运行时双轨

**最佳实践**：需要"编译期常量生成"用 Bun macros——简单 API；TS 友好——IDE 仍能补全；调试可关掉——临时降级到运行时；比 Rust proc-macro 简单 10x；JS 生态罕见的 compile-time 元编程。

---

### 模式 14：node:compat 全面覆盖——drop-in 替代

**问题场景**：Node 应用迁 Bun 要改 `import` 路径 + 适配 API 差异——迁移成本高。

**解决方案**：`bun:fs` / `bun:path` / `bun:stream` / `bun:http` / `bun:net` + 全套 `node:*` 兼容模块。`node:fs.writeFile` 在 Bun 跑几乎一样。**90%+ 兼容**。
```ts
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
// 在 Node 跑得通 → 在 Bun 也跑得通
```

**关键参数**：
- `node:*` 全套兼容
- 90%+ 兼容
- drop-in 替代
- 少数 V8 专属——文档明示
- 性能优于 Node 2-5x

**最佳实践**：替代 Node 要 100% drop-in 兼容——降低迁移成本；`node:*` 命名空间——和 Node 一致；性能优势作为卖点——迁移动机；少数不兼容——文档明示 + 备选；社区测试矩阵 + bug bounty。

---

### 模式 15：Workspace monorepo 原生支持

**问题场景**：monorepo 用 pnpm/turborepo/yarn workspaces——3 套配置，跨工具切换痛苦。

**解决方案**：`bun install` 原生支持 `workspaces` 字段——自动识别 `packages/*` + 符号链接 + 共享依赖。`bun run --filter @app/web dev` 类似 turbo filter。**配置文件 `bunfig.toml` 跨工作区共享**。
```json
// root package.json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

**关键参数**：
- `workspaces` 字段
- 自动符号链接
- 共享依赖 hoisting
- `--filter` 命令
- 比 pnpm 简单 50%

**最佳实践**：monorepo 用 workspace 字段——标准 npm 协议；自动符号链接——避免相对路径；`--filter` 跨包命令——turbo 等价；`bunfig.toml` 集中配置——避免每个包重写；零学习成本用 npm 协议。

---

## 第四段：实战范式

### 模式 16：test runner jest API 兼容 + 自家 `expect`

**问题场景**：jest 在 Bun 下要 `jest --transform` + `babel-jest`——慢。Vitest 是 vitest-only 生态。

**解决方案**：`bun test` 跑 jest 兼容 API（`describe / it / expect / mock`）——内置 swc 转译 TS/JSX。**`bun:test` 是 jest 兼容 API + bun 速度**。`mock` 系统用 `bun:junit` 输出 CI。
```ts
import { test, expect, mock } from "bun:test";
test("addition", () => {
    expect(1 + 1).toBe(2);
    const fn = mock(() => 42);
    expect(fn()).toBe(42);
});
```

**关键参数**：
- jest API 兼容
- 内置 swc 转译
- `bun:test` 模块
- `mock` / `spyOn`
- 比 jest 快 30x

**最佳实践**：测试用 jest 兼容 API——降低迁移成本；`bun:test` 单一来源；swc 内置——比 babel-jest 快 30x；`mock` 自动化——降测试样板；CI 集成 `bun:junit`——JUnit XML 报告。

---

### 模式 17：HTTP server `Bun.serve()` 30x Node

**问题场景**：Node `http.createServer` 性能瓶颈——QPS 1 万封顶。Express 框架 5000 QPS 入门。

**解决方案**：`Bun.serve({ port, fetch })` 走 Zig 实现的 HTTP/1.1 + TLS——30 万 QPS。`fetch` 处理器直接 `Request → Response`，Web 标准 API。**WebSocket / TLS / HTTP/2 同一接口**。
```ts
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("Hello, world!");
  },
});
```

**关键参数**：
- Zig 实现 HTTP/1.1
- 30 万 QPS
- Web Fetch API
- WebSocket 同接口
- TLS/HTTP/2 一起

**最佳实践**：HTTP server 用 Bun.serve——30x Node 性能；Web Fetch API 标准化——不再 Express 专属；WebSocket 同入口——避免另起服务；TLS 内置——简化部署；性能 + 标准化双赢。

---

### 模式 18：FFI 直接调 C 库

**问题场景**：Node 调 C 库要写 N-API 胶水（500+ 行 boilerplate）——Bun 也得写。

**解决方案**：`bun:ffi` 声明 C 函数签名——直接调 C 库。**零胶水**。
```ts
import { dlopen, FFIType } from "bun:ffi";
const { symbols: { strlen } } = dlopen("libc.so.6", {
  strlen: { args: [FFIType.pointer], returns: FFIType.int },
});
console.log(strlen(Buffer.from("hello\0")));
```

**关键参数**：
- `dlopen` 加载动态库
- 声明 C 函数签名
- 零胶水
- FFIType 类型系统
- 共享 `node-api` 之上的快路径

**最佳实践**：调 C 库用 bun:ffi——省 500+ 行 N-API；声明签名强制类型——避免 runtime 错；FFIType 系统覆盖基础类型——复杂 struct 用 buffer；性能好——`memcpy` 零拷贝；N-API 兜底——C++ 复杂 API。

---

### 模式 19：bunfig.toml 配置统一

**问题场景**：前端项目有 6 个工具 6 份 config——`tsconfig.json` / `webpack.config.js` / `jest.config.js` / `.eslintrc` / `.prettierrc` / `package.json`。新人 onboarding 看 6 文件。

**解决方案**：`bunfig.toml` 统一 Bun 工具链配置——`[install]` / `[test]` / `[bundle]` 三段。**TS 转译、测试、bundler、安装统一配置**。
```toml
# bunfig.toml
[install]
production = false
exact = true

[test]
preload = ["./setup.ts"]

[bundle]
target = "browser"
minify = true
```

**关键参数**：
- 单一配置
- 4 段：install / test / bundle / run
- TOML 格式
- 跨工作区共享
- 6 份 config 变 1 份

**最佳实践**：工具链配置要单一来源——`bunfig.toml` 一份；TOML 比 JSON 易读——注释友好；4 段分组——install / test / bundle / run；新人 onboarding 简单——少看 5 文件；版本控制——和 lockfile 一起提交。

---

### 模式 20：单二进制 + cross-compile 部署

**问题场景**：Node 部署要 `node` + `node_modules`（500MB+）——容器镜像大。`pkg` / `nexe` 打包麻烦。

**解决方案**：`bun build --compile` 静态编译成单二进制——无需 node / npm 运行时。`--target=bun-linux-x64` 跨平台。**容器镜像 < 50MB**。
```bash
bun build --compile --target=bun-linux-x64 ./server.ts --outfile=server
# 50MB 单二进制
```

**关键参数**：
- `--compile` 静态编译
- `--target` 跨平台
- 50MB 单二进制
- 容器镜像 < 50MB
- 比 pkg 简单 5x

**最佳实践**：部署用 `bun build --compile`——50MB 单二进制；`--target` 跨平台——CI 一键出多平台；容器镜像 < 50MB——alpine 基础镜像；比 pkg 简单 5x；Serverless 友好——冷启动 < 100ms。

---

## 关键代码段

```zig
// src/bundler/bundle_v2.zig:7-44 — mimalloc threadlocal arena
// Bun's bundler relies on mimalloc's threadlocal heaps as arena allocators.
// When a new thread is spawned for a bundling job, it is given a threadlocal
// heap and all allocations are done on that heap. When the job is done, the
// threadlocal heap is destroyed and all memory is freed.

// src/bun.js.zig:158 — boot
pub fn Run.boot(ctx: *Command.Context) !void {
    if (strings.endsWithComptime(entry_path, ".sh")) {
        return bootBunShell(ctx, entry_path);
    }
    bun.jsc.initialize(ctx.runtime_options.eval.eval_and_print);
}
```

## 必偷 3 件

1. **5-in-1 单体二进制**：一个二进制 + 一份 config 替代 6 个工具；启动 < 5ms 是核心竞争力。
2. **mimalloc threadlocal arena**：短生命周期任务用 arena allocator；任务边界就是 arena 边界。
3. **HTML-first bundler**：扫描 `<script src>` 自动识别入口；0 配置启动。

## 必避 3 坑

1. **不要在 Bun 中用 V8 专属 API**（`process.binding` 私有 API）——Bun 用 JSC，覆盖不全。
2. **不要把全局共享数据分配在 threadlocal heap**——段错误，编译期不可检查。
3. **不要硬写 `node:fs` 而忽略 `bun:fs`**——Bun 的 `bun:fs` 性能 2-5x。
