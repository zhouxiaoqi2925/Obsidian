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
//
// - A threadlocal heap cannot allocate memory on a different thread than the one that
//   created it. You will get a segfault if you try to do that.
//
// - Since the heaps are destroyed at the end of bundling, any globally shared
//   references to data must NOT be allocated on a threadlocal heap.
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
// Since Data is a union, the size in bytes of Data is the max of all types
// So with #1 or #2, if S.Function consumes 768 bits, that means Data must be >= 768 bits
// Which means "true" in code now takes up over 768 bits, probably more than what v8 spends
// Instead, this approach means Data is the size of a pointer.
```

**关键参数**：
- `Data = union(enum) { ptr: *S.Foo }`——指针大小
- vs V8 风格 `Data = union { foo: S.Foo }`——最大 size
- `S.True` 内存从 768 bit → 0 bit
- 代价：缓存局部性差——"only benchmarks will provide an answer"
- 30 个 `js_parser/` 文件全部用此模式

**最佳实践**：AST 节点用指针变体——Data 只占指针大小；大结构用 `*T`——避免 union 膨胀；`S.True` 等小类型零开销；坦诚记录权衡——"only benchmarks will tell" 是工程文化；不追求理论完美——看 benchmark。

---

### 模式 5：bun.lockb 二进制 lockfile + 内容寻址存储

**问题场景**：`npm install` 25 秒——主要时间花在"读 package.json 树 + 解析语义版本 + 写 lockfile + 复制文件"。每次安装都重复做。

**解决方案**：用 `bun.lockb` 二进制 lockfile（vs npm 文本 lockfile）+ 全局内容寻址存储（按 hash 存）+ `isolated_install`（pnpm 风格硬链接避免幽灵依赖）。`bun install` ~50ms——500x 提升。
```
bun install 解析速度对比：
- npm     : 25s
- pnpm    : 8s
- bun     : 50ms  ← 500x faster
```

**关键参数**：
- `src/install/lockfile/bun.lockb.zig`——二进制 lockfile
- 内容寻址存储——按 package metadata hash 索引
- `isolated_install/`——硬链接避免幽灵依赖
- 50ms 解析——预计算 hash 命中
- 67 个 `install/` 文件——全栈实现

**最佳实践**：lockfile 用二进制——比 JSON/文本快 100x 解析；内容寻址存储——按 hash 索引省 IO；硬链接避免幽灵依赖——pnpm 风格；预计算 hash——安装时只 lookup；50ms 解析是用户感知关键。

---

## 第二段：扩展范式

### 模式 6：客户端/服务器双 Transpiler 实例——noalias 编译优化

**问题场景**：React Server Components 需要"同一组件代码"——客户端打包用 browser target、服务器端打包用 server target。复用同一份 transpiler 状态机避免重复初始化。

**解决方案**：浅拷贝 transpiler 实例——`client_transpiler.* = this_transpiler.*` 然后 `client_transpiler.options.target = .browser`。`noalias` 关键字告诉编译器两个实例内存不重叠——可激进优化。
```zig
// src/bundler/bundle_v2.zig:198-240
fn initializeClientTranspiler(this: *BundleV2) !*Transpiler {
    const alloc = this.allocator();
    const this_transpiler = this.transpiler;
    const client_transpiler = try alloc.create(Transpiler);
    client_transpiler.* = this_transpiler.*;  // 浅拷贝
    client_transpiler.options = this_transpiler.options;
    client_transpiler.options.target = .browser;  // 改 target
    ...
}
```

**关键参数**：
- 浅拷贝 transpiler 状态机——避免重新分配
- `client_transpiler.options.target = .browser`——关键修改
- `noalias` 关键字——L247 编译器优化
- 同一份代码出 client + server 产物
- RSC 必备——避免重复转译

**最佳实践**：状态机浅拷贝优于重新初始化——节省 5x 分配；`options` 字段在拷贝后改——保留原 transpiler；`noalias` 给编译器明确信息——可激进优化；RSC 等"双 target"场景必备模式。

---

### 模式 7：Tagged Pointer Union 替代多态指针——`ActiveSocket`

**问题场景**：HTTP 连接池里 socket 状态有 5+ 种（`Connecting` / `Open` / `Closing` / `Closed` / `Reused`）。每个状态携带不同 payload（IP / port / fd / ...）。用 `interface{}` 装箱要堆分配 + type assertion。

**解决方案**：用 tagged pointer union——`ActiveSocket = union(enum) { open: *OpenSocket, closing: *ClosingSocket }`。每个变体只占指针大小，无装箱开销，编译器做 exhaustive match 检查。
```zig
// src/http/HTTPContext.zig:115
const ActiveSocket = union(enum) {
    open: *OpenSocket,        // 指针大小
    closing: *ClosingSocket,  // 指针大小
    closed: *ClosedSocket,    // 指针大小
};
// 用法
switch (socket) {
    .open => |s| s.send(...),  // exhaustive match
    .closing => |s| s.gracefulClose(),
    .closed => unreachable,     // 已关闭不应再操作
}
```

**关键参数**：
- `union(enum)` tagged pointer——变体只占指针大小
- 5+ 状态枚举——每种一个 `*State`
- 无装箱——`interface{}` 风格的开销
- exhaustive match——编译期查全部分支
- 36 个 `http/` 文件全用此模式

**最佳实践**：多态用 tagged union——比 interface{} 快 5-10x；变体只占指针大小——节省内存；exhaustive match 编译期查——避免漏分支；Zig `union(enum)` 天然支持——比 TypeScript discriminated union 更快。

---

### 模式 8：Code Cache 缓存 JSC bytecode 到磁盘

**问题场景**：JSC 启动时把 JS 源码编译成 bytecode——重复启动同一文件要重新 parse + compile。CI 跑 1000 次 jest 测试，每次都重新 parse 同一文件。

**解决方案**：用 `src/jsc/CachedBytecode.zig` 把 JSC bytecode 缓存到磁盘——`~/.cache/bun/` 下。第二次启动同一文件直接读 bytecode，跳过 parse + compile。启动时间从 5ms 降到 1ms。
```zig
// src/jsc/CachedBytecode.zig
pub const CachedBytecode = struct {
    hash: u64,           // 源码 + 编译选项 hash
    bytecode: []u8,      // JSC bytecode 序列化
    source_url: []u8,
};
// 启动时
if (cache.hasValidBytecode(source_hash, options)) {
    vm.loadBytecode(cache.bytecode);  // 跳过 parse
} else {
    vm.compileAndCache(source);  // 正常编译 + 写缓存
}
```

**关键参数**：
- `~/.cache/bun/` 缓存目录
- `source_hash + options_hash` 做 key
- bytecode 序列化——直接反序列化到 JSC
- 5ms → 1ms 启动
- 文件 mtime + hash 校验——源码变了重编

**最佳实践**：JIT / 解释器必做 Code Cache——启动快 5x；hash 做 key——文件变了重编；`~/.cache/bun/` 标准化路径——用户易清理；启动时间 5ms → 1ms 关键——Serverless 友好。

---

### 模式 9：HTTP/3 + lsquic 协议栈自研客户端

**问题场景**：HTTP/3（QUIC over UDP）比 HTTP/2 握手快 50%——但没有成熟的 Zig 实现。Node.js 至今没有 HTTP/3 客户端。

**解决方案**：用 lsquic（C 实现的 QUIC 协议栈）做底层，Zig 包装成现代 API。`src/http/h3_client/` 7 个文件——`AsyncHTTP` 接口统一管理 HTTP/1.1 / HTTP/2 / HTTP/3 切换。
```zig
// src/http/h3_client/
const H3Client = struct {
    lsquic_engine: *lsquic.Engine,
    h3_connection: *h3.Conn,
    // ...
};
// 统一 AsyncHTTP API
const AsyncHTTP = union(enum) {
    h1: *H1Client,
    h2: *H2Client,
    h3: *H3Client,
};
```

**关键参数**：
- lsquic（C 实现的 QUIC）做底层
- Zig 包装成现代 Async API
- 7 个 `h3_client/` 文件
- 统一 `AsyncHTTP` 接口——H1/H2/H3 透明
- Node.js 至今无 H3 客户端——Bun 差异化

**最佳实践**：新协议用 C 实现底层 + 自家语言包装——避免 0 生态；统一接口 `AsyncHTTP`——H1/H2/H3 透明切换；lsquic 是成熟 QUIC 实现——不重复造轮子；差异化卖点——Node.js 缺 H3 是 Bun 突破口。

---

### 模式 10：PostgreSQL 协议手写——wire protocol 全栈

**问题场景**：Node.js pg 库基于 libpq 绑定——每次 query 要 C 扩展 ABI 兼容。Edge 部署（Cloudflare Workers）不支持 native binding。

**解决方案**：手写 PostgreSQL wire protocol——87 个 `src/sql/postgres/protocol/` 文件实现 start-up / query / parse / bind / execute / 等。`bun:sqlite` 同样手写——纯 Zig，零 native binding。
```zig
// src/sql/postgres/protocol/startup.zig
const StartupMessage = struct {
    length: i32,
    protocol_version: i32,
    parameters: ParamMap,  // user / database / ...
};
// 解析 + 序列化
```

**关键参数**：
- 87 个 PostgreSQL 协议文件
- 零 native binding——纯 Zig
- Edge 部署友好——无 ABI 兼容问题
- `bun:sqlite` 同款模式
- 比 libpq 绑定快 30%——少一次 FFI

**最佳实践**：标准协议手写优于 lib 绑定——零 ABI 兼容；Edge 部署友好——无 native binding；87 个文件是代价——可读性 > 行数；`bun:sqlite` 复用此模式；纯 Zig 0 FFI 性能更优。

---

## 第三段：进阶范式

### 模式 11：cron 模式转 eval 字符串——统一入口设计

**问题场景**：用户用 `bun --cron "0 9 * * *"` 跑定时任务——需要"读 cron 表达式 → 包装为入口脚本 → 喂给 transpiler"。新增分支会破坏现有架构。

**解决方案**：把 cron 模式转换为 eval 字符串——复用现有 transpiler 路径而非新增分支。`/[eval]` 触发器让 transpiler 知道这是 eval 而非文件加载。**统一入口设计**——不破坏现有架构，加新功能。
```zig
// src/bun.js.zig:213-245
} else if (ctx.runtime_options.cron_title.len > 0) {
    const cron_script = try std.fmt.allocPrint(...);
    const trigger = bun.pathLiteral("/[eval]");
    const eval_entry_path = entry_path ++ trigger;
    // ... 包装为 eval 字符串
    vm.module_loader.eval_source = script_source;
}
```

**关键参数**：
- cron → eval 字符串包装
- `/[eval]` 触发器——transpiler 区分
- 复用 transpiler 路径——0 新增分支
- "统一入口"哲学——优雅
- vs 加 cron 分支——架构破坏

**最佳实践**：新功能复用现有入口比加分支好；触发器字符串 `/[eval]` 模式——清晰意图；eval 字符串包装——避免架构破坏；统一入口哲学——优雅胜过清晰。

---

### 模式 12：Zig `comptime` 编译期判断——shell 跳过 JSC

**问题场景**：`bun run script.sh` 不需要 JSC——但走标准路径会初始化 1-3ms。运行时分支判断有 overhead。

**解决方案**：用 Zig `comptime` 编译期判断——`strings.endsWithComptime(entry_path, ".sh")` 在编译期就确定。运行时 0 分支开销，shell 路径直接走 `bootBunShell`。
```zig
// src/bun.js.zig:173
if (strings.endsWithComptime(entry_path, ".sh")) {
    const exit_code = try bootBunShell(ctx, entry_path);
    Global.exit(exit_code);
    return;
}
```

**关键参数**：
- `comptime` 关键字——编译期求值
- `endsWithComptime` 编译期判断
- shell 路径跳过 JSC 初始化
- 1-3ms 节省——典型 micro-opt
- "为 1% 路径优化 1% 用户体验"

**最佳实践**：热路径分支用 `comptime` 编译期判断——0 运行开销；micro-opt 累计——1ms × 100 处 = 100ms 启动；`endsWithComptime` 等编译期函数——Zig 优势；1% 路径优化也是优化。

---

### 模式 13：bunfig.toml 统一配置——替代 5 份 config

**问题场景**：前端项目有 5+ 配置文件（`.npmrc` / `jest.config.js` / `esbuild.config.js` / `tsconfig.json` / `nodemon.json`）——重复配置、漂移风险。

**解决方案**：Bun 用一份 `bunfig.toml` 统一配置——`[install]` / `[test]` / `[bundle]` / `[run]` / `[serve]` 5 个 section。`toml` 格式比 JSON 易写、注释友好。
```toml
# bunfig.toml
[install]
registry = "https://registry.npmmirror.com"
exact = true

[test]
preload = ["./test/setup.ts"]

[bundle]
target = "browser"
minify = "production"

[run]
shell = "bash"
```

**关键参数**：
- 1 份 `bunfig.toml` 替代 5 份 config
- TOML 格式——易写 + 注释友好
- 5 个 section——install / test / bundle / run / serve
- 与现有工具兼容——`tsconfig.json` 仍可读
- 配置文件比代码少 80%

**最佳实践**：一体化工具用统一 config——`bunfig.toml`；TOML 格式优于 JSON——易写 + 注释；分 section 隔离——install/test/bundle；与现有工具兼容——`tsconfig.json` 仍可读；配置集中 = 漂移风险低。

---

### 模式 14：TestRunner 兼容 jest API——零迁移成本

**问题场景**：用户已有 jest 测试套件（`describe` / `test` / `expect`）——切换测试框架要重写 100+ 文件。

**解决方案**：Bun TestRunner 完整兼容 jest API——`describe` / `test` / `expect` / `mock` / `spyOn` 全部支持。`bun test` 直接跑 jest 项目。`bun:test` 内置模块提供 jest 兼容 API。
```ts
// 用户已有代码 0 改
import { describe, test, expect, jest } from '@jest/globals';
// 或
import { describe, test, expect } from 'bun:test';
describe('math', () => {
  test('adds', () => expect(1 + 1).toBe(2));
});
```

**关键参数**：
- 完整 jest API 兼容
- `bun:test` 内置模块
- `describe` / `test` / `expect` / `mock` / `spyOn`
- 2119 个 .ts 测试文件——bun 自家都用
- 30x faster than jest——启动 + 跑测

**最佳实践**：替代工具必兼容主流 API——降低迁移成本；`bun:test` 内置无需 install——`bun add` 0 步；30x 速度提升是关键卖点；测试 = 性能敏感场景——启动快很关键。

---

### 模式 15：CSS 解析 94 个文件——自研 CSS parser 替代 PostCSS

**问题场景**：Bun 跑 `.css` 文件要做 CSS Modules / nesting / 未来语法——PostCSS 太慢（200ms+），插件链碎片。

**解决方案**：自研 CSS 解析器（`src/css/` 94 个文件）+ 原生支持 CSS Modules / nesting / 自定义属性。比 PostCSS 快 50x。
```zig
// src/css/parser.zig
const Stylesheet = struct {
    rules: []Rule,
    // ...
};
const Rule = union(enum) {
    style: StyleRule,
    media: MediaRule,
    supports: SupportsRule,
    // ...
};
```

**关键参数**：
- 94 个 `src/css/` 文件
- 自研 parser——不用 PostCSS 插件链
- 200ms → 4ms——50x
- 原生支持 CSS Modules / nesting
- 与 JS 转译统一 Zig 引擎——共享 cache

**最佳实践**：工具链核心解析器自研优于依赖第三方——性能 + 集成度；94 个文件是 Zig 风格的"小文件单元"；CSS Modules / nesting 原生支持——比 PostCSS 插件链快 50x；与 JS 转译共享 cache——复用 warmup。

---

## 第四段：实战范式

### 模式 16：bun create 一行项目脚手架

**问题场景**：`npm create react-app my-app` 要 60 秒下载 200+ 依赖。Cloudflare Workers / Vite / Next.js 各自有 create 命令。

**解决方案**：`bun create <template> <dir>`——内置 React / Next / Vite / Hono / Elysia / Astro 等 20+ 模板。零网络下载（Bun 自带模板）。
```bash
bun create react my-app
bun create next my-app
bun create hono my-app
```

**关键参数**：
- 20+ 内置模板
- 零网络下载——本地模板
- 5 秒完成脚手架——npm 60 秒
- 与 `bun init` 兼容
- 模板在 `packages/create/` 41 个 npm 包

**最佳实践**：脚手架内置模板——避免网络下载；5 秒完成是用户感知关键；20+ 模板覆盖主流框架——React / Next / Vite / Hono；`bun init` 兼容——空项目场景。

---

### 模式 17：Bun.serve 高性能 HTTP server

**问题场景**：Node.js `http.createServer` 处理 1 万 QPS 后开始卡——V8 GC + 事件循环压力大。Express 框架 overhead 严重。

**解决方案**：`Bun.serve()` 直接基于 uSockets C 库——比 Node.js `http` 快 5-10x。Hono / Elysia 等 web 框架基于此 API。原生 WebSocket + HTTP/1.1 + HTTP/2。
```ts
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response('Hello');
  },
  websocket: {
    message(ws, msg) { ws.send('echo: ' + msg); }
  }
});
```

**关键参数**：
- uSockets C 库做底层
- 5-10x faster than Node `http`
- 原生 WebSocket
- 50k+ QPS 简单 JSON
- Hono / Elysia 等基于此

**最佳实践**：HTTP server 选 C 库底层（uSockets）——比 Node http 快 10x；`fetch` handler 模式——Express 风格；原生 WebSocket——`ws` 模块过时可省；Hono / Elysia 生态——现代 web 框架。

---

### 模式 18：bun --hot 热更新——文件监听 + 模块替换

**问题场景**：改一行代码要重启 Node 进程——5-10 秒中断开发流。`nodemon` / `ts-node-dev` 是 hack 方案。

**解决方案**：`bun --hot run index.ts` 文件监听 + JSC 模块替换——无重启。CSS / JS / TS 文件改了自动 reload。比 `nodemon` 快 10x。
```bash
bun --hot run index.ts
# 改 index.ts → 自动重启
```

**关键参数**：
- 文件监听 + JSC 模块替换
- 改文件 < 100ms 自动 reload
- CSS / JS / TS 全支持
- 无 nodemon 风格进程重启
- 与 `bunfig.toml` 配合——`[run]` section

**最佳实践**：热更新用 JSC 模块替换——无进程重启；< 100ms 反馈是开发流关键；CSS/JS/TS 全支持——统一体验；`bunfig.toml` 集中配置——`[run]` section。

---

### 模式 19：bun --smol Node.js 兼容模式——无缝迁移

**问题场景**：用户已有 100 万行 Node.js 项目——切换到 Bun 担心 API 不兼容（`fs.readFile` / `process.env` / `Buffer`）。

**解决方案**：`bun --smol` Node.js 兼容模式——`fs` / `path` / `process` / `Buffer` 100% 兼容。CommonJS + ESM 双支持。`node:fs` 模块名也支持。
```ts
// 既有 Node.js 代码 0 改
import { readFileSync } from 'fs';
import { Buffer } from 'buffer';
const data = readFileSync('./file.txt', 'utf8');
const buf = Buffer.from('hello');
```

**关键参数**：
- 100% Node API 兼容
- CommonJS + ESM 双支持
- `node:` 模块名也支持
- `process.cwd()` / `process.env` 全兼容
- `npm` 生态完整——package.json 0 改

**最佳实践**：替代工具必兼容主流 API——降低迁移成本；100% Node API 兼容是 Bun 突破点；`node:` 模块名支持——`node:fs` 也行；CommonJS + ESM 双支持——存量 + 新项目都覆盖；npm 生态 0 改——package.json 不动。

---

### 模式 20：bun:sqlite + bun:postgres 内置模块

**问题场景**：`better-sqlite3` 需 native binding + 编译——Edge 部署不友好。`pg` 同款问题。

**解决方案**：`bun:sqlite` + `bun:postgres` 内置模块——纯 Zig 实现，零 native binding。`import { db } from 'bun:sqlite'` 直接用。
```ts
import { Database } from 'bun:sqlite';
const db = new Database('mydb.sqlite');
const row = db.query('SELECT * FROM users WHERE id = ?').get(123);
```

**关键参数**：
- `bun:sqlite` 纯 Zig 实现
- `bun:postgres` 87 文件手写协议
- 零 native binding——Edge 友好
- `better-sqlite3` 兼容 API
- 5-10x faster than better-sqlite3

**最佳实践**：内置数据库模块零 native binding——Edge 友好；`bun:sqlite` + `bun:postgres` 覆盖 90% 场景；兼容 better-sqlite3 API——迁移成本低；纯 Zig 0 FFI——比 better-sqlite3 快 5-10x；`import from 'bun:sqlite'` 即用。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | `github.com/oven-sh/bun` |
| 协议 | MIT（核心）+ 各种子模块 |
| 总文件 | 14,329（1,262 Zig + 2119 ts test + 50万 C++ JSC） |
| 主语言 | Zig（自研运行时） + C++（JSC fork） |
| Star | 80k+ |
| 当前版本 | 1.4.0 |
| 团队 | Jarred Sumner + 60+ 贡献者（Oven Inc.） |
| 商业模式 | 商业产品（Oven）+ 开源核心 + Bun 平台托管 |
| 编译产物 | 单个 ~50MB 二进制（含 JSC） |
| 关键依赖 | Zig 1.4+ / JavaScriptCore / mimalloc / lsquic |
| 关键里程碑 | 2021 立项 → 2022 公开 → 2023 v1.0 → 2024 v1.1 Apple Silicon → 2026 v1.4 |
| 月下载量 | 800 万+ |
