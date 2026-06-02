# deno - 现代 JS/TS 运行时

**来源**：G:\实战案例\GitHub顶尖项目\deno\
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. V8 Isolate + Rust 异步 Runtime 桥接（V8 Isolate + Tokio FFI）

**问题场景**：V8 是 C++ 写的事件循环，Tokio 是 Rust 写的多线程 async runtime，两者"语言 + 线程模型 + GC" 都不同。Node.js 用了 libuv + 异步 I/O，但 libuv 性能不佳且集成复杂。Deno 的解法：**V8 Isolate 跑 JS（同步），Tokio 跑 async I/O（多线程）**，中间用 FFI 桥接。V8 的 main thread 调 Rust op，Tokio 在 worker thread 真正执行，promise resolve 时再调回 V8。**这是 Deno 性能的关键**。

**解决方案**：
```rust
// crates/deno_core/runtime.rs
pub struct JsRuntime {
  v8_isolate: v8::Isolate,        // V8 隔离实例
  v8_context: v8::Global<v8::Context>,
  pub(crate) inspector: Option<Inspector>,
  // ... tokio integration
}

// Op 注册（Rust 函数暴露给 JS）
#[op]
async fn op_read_file(path: String) -> Result<String, AnyError> {
  // 1) V8 调这个 op（V8 main thread）
  // 2) op 进 await，Tokio 在 worker thread 真读文件
  // 3) 文件读完后，Tokio 调回 V8 resolve promise
  tokio::fs::read_to_string(&path).await
}

// JS 调
const text = await Deno.core.ops.op_read_file("/path/to/file");
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| V8 Isolate | 1/线程 | 隔离 |
| Tokio runtime | 1+ 工作线程 | 取决于 CPU |
| Op dispatch | FFI 直接调 | 零序列化 |
| Promise 调度 | V8 microtask | 自动 |
| 性能 | 100K ops/s | 实测 |

**最佳实践**：
1. ✅ V8 isolate + Tokio worker：1:1 资源匹配
2. ✅ Op 用 #[op] 宏：自动注册
3. ✅ 异步 op 用 async fn：Tokio 自动调
4. ✅ 错误用 AnyError：自动 throw
5. ✅ Op id 序列化在 FFI：稳定
6. ✅ Performance API 监控 op 时间

### 2. 默认安全沙箱（Default Secure Sandbox）

**问题场景**：Node.js 启动一个 JS 进程，默认能读所有文件 + 连所有网络 + 启动子进程。`fs.readFileSync('/etc/passwd')` 直接拿到 root 数据。Node 的 `--experimental-permissions` 长期是实验性。Deno 的解法：**默认无权限，所有文件/网络/环境访问都需显式 grant**。`--allow-net`、`--allow-read` 等白名单。

**解决方案**：
```rust
// crates/deno_runtime/permissions/
pub struct Permissions {
  read: HashSet<PathBuf>,        // 允许读的文件
  write: HashSet<PathBuf>,       // 允许写的文件
  net: HashSet<String>,          // 允许连的 host
  env: HashSet<String>,          // 允许读的环境变量
  run: HashSet<String>,          // 允许运行的命令
  ffi: HashSet<PathBuf>,         // 允许 FFI 的 .so
  hrtime: bool,                  // 允许高精度时间
}

// 检查权限
impl Permissions {
  pub fn check_read(&self, path: &Path) -> Result<(), PermissionDeniedError> {
    if self.read.iter().any(|p| path.starts_with(p)) {
      Ok(())
    } else {
      Err(PermissionDeniedError::read(path))
    }
  }
}

// CLI 启动
let permissions = Permissions::from_flags(&flags);
// --allow-read=/tmp  → self.read = {/tmp}
// --allow-net=example.com  → self.net = {example.com}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| read | path 前缀 | /tmp, /home/user |
| write | path 前缀 | 同 read |
| net | host 或 host:port | example.com, *.example.com |
| env | 变量名 | PATH, HOME |
| run | 命令白名单 | /usr/bin/git |
| 默认 | 无 | 启动零权限 |

**最佳实践**：
1. ✅ 默认零权限：白名单优于黑名单
2. ✅ CLI flag grant：--allow-read=/tmp
3. ✅ 运行时再检：fail-fast
4. ✅ 子进程继承：deno run → deno test 都需 grant
5. ✅ 程序内 ask()：Deno.permissions.request()
6. ✅ CI 默认无权限：fail-fast 暴露漏洞

### 3. TypeScript 一等公民（TypeScript First-Class）

**问题场景**：Node.js 跑 TypeScript 要 ts-node + tsconfig + tsc build + 复杂类型路径。Deno 跑 .ts 文件零配置：内置 SWC（或 swc + tsc 严格模式）做 transpile。**Deno 1.x 用 swc 编译，2.x 提供 tsc 严格模式**。开发者写 `import type` 直接能用。

**解决方案**：
```typescript
// main.ts — 无需 tsconfig
import { add } from "./utils.ts";  // 直接 .ts 扩展名
const result = add(1, 2);
console.log(result);

// 类型检查：deno check
// 运行：deno run
// 编译：deno bundle
// 测试：deno test
// 打包：deno compile → 单一二进制
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 默认 transpile | swc | 快 |
| 严格类型 | deno check | 可选 |
| 配置 | deno.json | 单文件 |
| 扩展名 | .ts / .tsx | 必须 |
| import 路径 | 相对 + 绝对 | 无 node_modules |
| 类型解析 | JSX + ESM | Web 标准 |

**最佳实践**：
1. ✅ 零配置 .ts：deno run main.ts
2. ✅ deno check 严格类型：CI 必跑
3. ✅ import 用 .ts 扩展名：明确
4. ✅ deno.json 集中配置：imports / tasks
5. ✅ JSDoc 注释当类型：纯 JS 也能类型
6. ✅ 跨文件 import：deno cache 自动下载

### 4. Web 标准 API 优先（Web Standard First）

**问题场景**：Node.js 有自己的 API（`fs`、`http`），浏览器有 Web API（`fetch`、`Request`）。Deno 选择**优先 Web API**：`fetch` 浏览器一致、`URL` 浏览器一致、`TextEncoder` 浏览器一致。Node API 通过 `node:` 前缀兼容。**这套设计让 Deno 代码在浏览器/服务端可移植**。

**解决方案**：
```typescript
// Web 标准 API（默认）
const response = await fetch("https://api.example.com");
const data: MyData = await response.json();
const url = new URL("https://api.example.com/path?a=1");
const encoder = new TextEncoder();
const bytes = encoder.encode("hello");

// Node 兼容 API（node: 前缀）
import { readFile } from "node:fs/promises";
const buf = await readFile("/path/to/file");

// Deno 特有 API（Deno 命名空间）
const file = await Deno.open("/path/to/file", { read: true });
const stat = await Deno.stat("/path/to/file");
const cmd = new Deno.Command("echo", { args: ["hello"] });
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Web API 优先 | fetch / URL / Request | 默认 |
| Node 兼容 | node:fs / node:http | 2.0+ |
| Deno 特有 | Deno namespace | 系统 API |
| 跨运行时 | 单代码双跑 | 浏览器/服务端 |
| 浏览器代码 | 几乎可移植 | 同 API |

**最佳实践**：
1. ✅ 优先 Web API：浏览器/服务端可移植
2. ✅ node: 前缀兼容：迁 Node 项目
3. ✅ Deno 命名空间系统 API：权限校验
4. ✅ 跨运行时库：选 Web API 实现
5. ✅ 测试覆盖双 runtime：Deno + 浏览器
6. ✅ 文档化差异：Web API + Node + Deno

### 5. 权限系统（Permission System）

**问题场景**：默认无权限，但开发者要"读 ./data 文件、写 ./out 文件、连 api.example.com"。每次写完整 `--allow-read=./data --allow-write=./out --allow-net=api.example.com` 长。Deno 解决：CLI flag 启动 + 运行时 `Deno.permissions.request()` 弹窗 + `deno.json` 集中配置。**3 层级权限管理**。

**解决方案**：
```typescript
// 启动时 grant（CLI）
// deno run --allow-read=./data --allow-net=api.example.com main.ts

// 运行时 ask（用户决定）
const status = await Deno.permissions.request({
  name: "read",
  path: "./data/secret.json"
});
if (status.state === "granted") {
  const text = await Deno.readTextFile("./data/secret.json");
}

// 配置文件（deno.json）
{
  "tasks": {
    "dev": "deno run --allow-read=./data --allow-net main.ts"
  }
}

// 3 种状态：granted / denied / prompt
// prompt 状态 → 启动时询问（--no-prompt 默认 deny）
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| CLI flag | --allow-read=path | 启动 grant |
| Runtime | Deno.permissions.request() | 弹窗 |
| deno.json | tasks + permissions | 集中 |
| 状态 | granted / denied / prompt | 三态 |
| 默认 | prompt | 启动询问 |
| --no-prompt | 默认 deny | CI 友好 |

**最佳实践**：
1. ✅ CLI 启动 grant：CI 用
2. ✅ Runtime ask：交互式
3. ✅ deno.json 集中：项目级
4. ✅ 默认 deny：CI 必加 --no-prompt
5. ✅ 路径用绝对：相对易错
6. ✅ 文档化权限：README 写清

## 二、架构设计

### 6. deno_core / deno_runtime / deno_cli 三层（Three-Layer Architecture）

**问题场景**：Deno 早期单体 crate，扩展性差。1.0+ 重构成 3 个 crate：`deno_core`（V8 + ops 核心）、`deno_runtime`（平台集成 + 扩展）、`deno_cli`（命令行）。**第三方可基于 deno_core 造新 runtime（如 bolt、jsrt）**。**这是"核心+平台+入口"分层**。

**解决方案**：
```rust
// crates/deno_core/ — V8 + ops 核心（约 5000 行）
// 提供：
// - JsRuntime：V8 isolate + 模块系统
// - #[op] 宏：注册 Rust 函数到 JS
// - Extension trait：动态扩展 runtime
// - Resources：handle 抽象

// crates/deno_runtime/ — 平台集成（约 50000 行）
// 提供：
// - Deno 命名空间（Deno.open / Deno.readTextFile / ...）
// - Web API（fetch / WebSocket / crypto）
// - Permissions 实现
// - Worker 进程

// crates/deno_cli/ — CLI 入口（约 30000 行）
// 提供：
// - args 解析
// - subcommand（run / test / fmt / lint / bundle / compile / install）
// - TUI（deno repl）
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| deno_core | ~5K 行 | 薄核心 |
| deno_runtime | ~50K 行 | 平台 |
| deno_cli | ~30K 行 | CLI |
| 第三方 | bolt, jsrt | 用 deno_core |
| 总代码 | ~100K Rust + 30K TS | |

**最佳实践**：
1. ✅ 三层清晰：core / runtime / cli
2. ✅ deno_core 独立 crate：可复用
3. ✅ deno_runtime 平台集成：可换
4. ✅ deno_cli 纯 CLI：可换
5. ✅ Extension 系统：deno_core 动态扩展
6. ✅ 文档化分层：CONTRIBUTING.md 写清

### 7. Extension 系统（Extension System）

**问题场景**：Deno 默认不内置 fs / net / fetch（避免大 bundle）。但 Node 兼容 / Web API 都要扩展。deno_core 提供 **Extension trait**：动态注册 ops / 静态模块 / 状态。**第三方可写 ext 扩展 Deno**。

**解决方案**：
```rust
// crates/deno_core/extension.rs
pub trait Extension {
  fn init_js(&self) -> Option<&'static str> { None }
  fn init_ops(&self) -> Option<Vec<OpDecl>> { None }
  fn init_state(&self) -> Option<ExtensionState> { None }
  // ...
}

// 注册一个 fetch 扩展
let fetch_ext = Extension::builder("fetch")
  .ops(vec![op_fetch::decl()])
  .js(include_str!("./js/fetch.js"))  // 静态模块
  .state(move |state| {
    state.put(FetchState::default());
  })
  .build();

// deno_runtime 启用
let mut runtime = JsRuntime::new(RuntimeOptions {
  extensions: vec![
    deno_webidl::init_ops(),
    deno_fetch::init_ops_and_esm(...)
  ],
  ..Default::default()
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| init_js | 静态 ESM | 浏览器侧 |
| init_ops | Vec<OpDecl> | Rust 侧 |
| init_state | 状态 | 共享 |
| 数量 | 30+ | 内置扩展 |
| 第三方 | 任何 crate | 动态注册 |

**最佳实践**：
1. ✅ Extension 动态注册：避免硬编码
2. ✅ init_js 用静态：性能好
3. ✅ init_ops 用宏：自动序列化
4. ✅ init_state 共享：避免全局
5. ✅ 命名空间隔离：ext 冲突由 ext 处理
6. ✅ 文档化扩展：deno_runtime 列所有 ext

### 8. Op 注册（Op Registration）

**问题场景**：Rust 函数怎么暴露给 JS？必须：序列化参数、异步执行、反序列化结果。Deno 的 `#[op]` 宏自动做：参数反序列化、Future 调度、结果序列化。**开发者只写业务逻辑**。

**解决方案**：
```rust
// crates/deno_core/ops.rs
#[op]
fn op_sum(x: i32, y: i32) -> i32 {
  x + y
}

#[op]
async fn op_read_file(path: String) -> Result<Vec<u8>, AnyError> {
  // 异步操作
  Ok(tokio::fs::read(&path).await?)
}

// 注册
let ext = Extension::builder("math")
  .ops(vec![op_sum::decl(), op_read_file::decl()])
  .build();

// JS 调
const r = Deno.core.ops.op_sum(1, 2);  // 3
const bytes = await Deno.core.ops.op_read_file("/path/to/file");
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 同步 op | fn | V8 main thread |
| 异步 op | async fn | Tokio worker |
| 参数 | 自动序列化 | serde-like |
| 错误 | AnyError | 自动 throw |
| 性能 | 1µs / call | 实测 |

**最佳实践**：
1. ✅ 用 #[op] 宏：自动注册
2. ✅ 同步 op 快：V8 thread 直接执行
3. ✅ 异步 op 必须 await：Tokio 调度
4. ✅ 错误用 AnyError：自动 throw
5. ✅ 性能监控：op 计数
6. ✅ 测试覆盖：每 op 至少 1 测试

### 9. Worker 进程模型（Worker Process Model）

**问题场景**：Web Worker 在浏览器跑独立线程，Node.js 用 `worker_threads`。Deno 也用 Worker：`new Worker("./worker.ts")`。**但 Deno Worker 是独立 V8 isolate**（独立 JS 上下文），不是 thread。**比 Node 更安全**：worker 崩溃不影响主进程。

**解决方案**：
```typescript
// main.ts
const worker = new Worker(
  new URL("./worker.ts", import.meta.url).href,
  { type: "module", name: "my-worker" }
);

worker.postMessage({ type: "start", data });
worker.addEventListener("message", (e) => {
  console.log("from worker:", e.data);
});

// worker.ts
self.addEventListener("message", (e) => {
  const { type, data } = e.data;
  if (type === "start") {
    // 独立 V8 isolate
    // 独立权限（默认继承，但可独立 grant）
    const result = heavyCompute(data);
    self.postMessage({ type: "result", data: result });
  }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 进程 | 独立 V8 isolate | 隔离 |
| 通信 | postMessage | 序列化 |
| 权限 | 独立 / 继承 | 配置 |
| 性能 | < 10ms spawn | 实测 |
| 内存 | 5-10MB / worker | 限制 |

**最佳实践**：
1. ✅ 重 CPU 用 Worker：避免阻塞主
2. ✅ 独立 V8 isolate：worker 崩溃不影响
3. ✅ postMessage 序列化：传 JSON
4. ✅ 权限独立：worker 可少权限
5. ✅ type: "module"：支持 ESM
6. ✅ 监控 worker 数量：避免过多

### 10. Module Loader（Module Loader）

**问题场景**：浏览器有 `<script src>` + ESM `import`。Node.js 有 `require` + `import`。Deno 统一 ESM `import`，但要支持 URL（http://, file://, data:）和 npm 互操作。**Module Loader 是核心扩展点**。

**解决方案**：
```rust
// crates/deno_core/modules/
pub trait ModuleLoader {
  // 1) 解析模块 URL
  fn resolve(&self, specifier: &str, referrer: &str) -> Result<ModuleUrl, Error>;
  // 2) 加载模块源码
  fn load(&self, url: &ModuleUrl) -> Result<ModuleSource, Error>;
}

// Deno 默认 loader
pub struct DenoModuleLoader {
  file_loader: FileLoader,
  npm_loader: NpmLoader,        // 2.0+ npm
  http_loader: HttpLoader,
  // ...
}

// JS 调
// import x from "./foo.ts"  → file_loader
// import x from "npm:lodash"  → npm_loader
// import x from "https://..."  → http_loader + cache
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Specifier | URL 或路径 | 多源 |
| 协议 | file: / http: / data: / npm: | 多协议 |
| 缓存 | 进程内 + global | 加速 |
| npm | 2.0+ | node_modules 互操作 |
| 性能 | < 5ms 加载本地 | 缓存命中 |

**最佳实践**：
1. ✅ ESM 统一：no CJS
2. ✅ npm: 前缀：2.0+ Node 包
3. ✅ file: / http: 协议：明确
4. ✅ 缓存机制：避免重复 IO
5. ✅ deno.json imports：别名
6. ✅ 监控 loader 性能

## 三、性能优化

### 11. V8 Isolate 性能优化（V8 Isolate Performance）

**问题场景**：每个 Worker 一个 V8 Isolate（5-10MB），多 worker 内存爆。冷启动 100ms+。Deno 用 **V8 snapshot** + **代码缓存** + **lazy parsing** 三件套：snapshot 把内置 JS 序列化进二进制，懒解析 + 代码缓存让用户代码启动快。

**解决方案**：
```rust
// crates/deno_core/runtime.rs
pub struct JsRuntime {
  v8_isolate: v8::Isolate,
  // 1) Snapshot
  snapshot: Option<v8::StartupData>,
  // 2) Code cache
  code_cache: Option<v8::CodeCache>,
  // ...
}

// 启动
let mut isolate = v8::Isolate::new(...);
if let Some(snapshot) = snapshot {
  isolate.set_snapshot_data(snapshot);
  // ↑ V8 内部直接 mmap 二进制，避免 100ms 解析
}

// 代码缓存
isolate.set_code_cache(code_cache);
// ↑ 第二次跑同代码：跳过解析 + 编译
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Snapshot | 2-3MB | 内置 JS 序列化 |
| Code cache | 1-2MB | 用户代码缓存 |
| 冷启动 | 50-100ms | snapshot + cache |
| 重复启动 | 10-20ms | 完整 cache |
| V8 优化 | TurboFan + Sparkplug | 2-tier |

**最佳实践**：
1. ✅ Snapshot 内置 JS：deno_cli 启动 50ms
2. ✅ Code cache 用户代码：第二次快 5x
3. ✅ Lazy parsing：启动不解析未用代码
4. ✅ V8 优化等级：TurboFan hot code
5. ✅ 监控冷启动时间：deno bench
6. ✅ 配合 --no-check：跳过 TS check

### 12. 缓存加速（Cache Acceleration）

**问题场景**：每次 `deno run main.ts` 都要 re-parse 所有 import 的 .ts 文件 + 远程 npm 包。Deno 用 **global cache** (`~/.cache/deno`)：第一次下，第二次复用。**远程模块甚至无需网络**。

**解决方案**：
```bash
# 第一次：下载 + 解析
deno run main.ts
# → ~/.cache/deno/deps/https/deno.land/std@0.220.0/...
# → ~/.cache/deno/gen/path/to/main.ts.js  （编译后）

# 第二次：复用
deno run main.ts
# → 无网络 → 直接读 cache

# 强制更新
deno run --reload main.ts
# → 重新下载 + 编译
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 位置 | ~/.cache/deno | 全局 |
| 协议 | http / npm | 缓存 |
| 大小 | 100MB+ | 大项目 |
| 失效 | --reload | 手动 |
| 离线 | 默认可用 | 二次启动 |

**最佳实践**：
1. ✅ 全局 cache：避免重复下载
2. ✅ 离线可用：CI 第一次联网即可
3. ✅ --reload 强制更新：升级库时用
4. ✅ CI 缓存 cache：跨 job 复用
5. ✅ 监控 cache 大小：定期清理
6. ✅ vendor/ 目录：可锁定依赖

### 13. Snapshot 启动（Snapshot Startup）

**问题场景**：deno 启动 50-100ms 主要是 V8 解析 + 编译内置 JS。**Snapshot 把内置 JS 序列化进二进制**，启动时 mmap + 直接 mmap-to-context。**比 Node.js 快 5-10x**。

**解决方案**：
```rust
// crates/deno_core/snapshot_util.rs
// 1) 创建 snapshot
pub fn create_snapshot(extensions: &[Extension]) -> v8::StartupData {
  let mut isolate = v8::Isolate::new(Default::default());
  let mut snapshot_creator = v8::SnapshotCreator::new(isolate);
  // 执行所有 ext 的 init_js
  for ext in extensions {
    if let Some(js) = ext.init_js() {
      // 编译 + 缓存到 snapshot
    }
  }
  snapshot_creator.create_blob()
}

// 2) 启动用 snapshot
pub fn startup_with_snapshot(snapshot: v8::StartupData) -> JsRuntime {
  let mut isolate = v8::Isolate::new(isolate_options);
  isolate.set_snapshot_data(snapshot);
  // 跳过 100ms 解析 + 编译
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Snapshot 大小 | 2-3MB | 内置 JS |
| 启动时间 | 50-100ms | 加速 5-10x |
| 创建时机 | build 阶段 | 一次性 |
| 跨平台 | 4 个 | Linux/macOS/Win/ARM |
| 跨 V8 版本 | 严格 | 版本锁定 |

**最佳实践**：
1. ✅ Build 时生成 snapshot：release 用
2. ✅ Dev 时不用：deno run 直接编译
3. ✅ 跨平台 snapshot：每个 OS 单独
4. ✅ 跨 V8 版本：lock V8 版本
5. ✅ 监控启动时间：deno bench
6. ✅ 文档化 snapshot 限制

### 14. WASM 支持（WASM Support）

**问题场景**：Rust/C++ 高性能库要跑在 JS runtime，Deno 用 WebAssembly（`import x from "./foo.wasm"`）。**WASM 在 V8 直接编译为机器码**，性能接近 native。**这是 Rust + JS 互操作的关键**。

**解决方案**：
```typescript
// import WASM
import { add } from "./math.wasm";  // 直接 import
const result = add(1, 2);

// 动态加载
const wasmModule = await WebAssembly.instantiateStreaming(
  fetch("./math.wasm")
);
const instance = wasmModule.instance;
const add = instance.exports.add as (a: number, b: number) => number;

// Rust → WASM
// cargo build --target wasm32-unknown-unknown
// 产物 math.wasm
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| WASM 引擎 | V8 内置 | 编译为机器码 |
| 性能 | 接近 native | 0.5-0.8x |
| 内存 | 共享线性内存 | 与 JS 通信 |
| 工具 | wasm-pack | Rust → WASM |
| 调试 | DWARF / source map | 跨语言 |

**最佳实践**：
1. ✅ 静态 import：deno import "./foo.wasm"
2. ✅ instantiateStreaming：避免 base64
3. ✅ 共享 ArrayBuffer：JS ↔ WASM 数据传递
4. ✅ wasm-pack：Rust → WASM 一键
5. ✅ 性能监控：deno bench 对比 native
6. ✅ 调试友好：DWARF + source map

### 15. 编译优化（Compile Optimization）

**问题场景**：`deno compile` 把 .ts → 单一二进制（AOT），分发方便。**类似 PyInstaller / pkg，但 Deno 是 native V8 snapshot + 用户代码 bundle**。**启动比 `deno run` 还快**（snapshot 复用 + 用户代码预加载）。

**解决方案**：
```bash
# 编译为单一二进制
deno compile --allow-read --allow-net main.ts -o myapp
# → 50MB 单文件（含 V8 + snapshot + 用户代码）

# 启动
./myapp
# → < 50ms 启动（V8 snapshot + 用户代码预加载）
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 输出 | ELF / Mach-O / PE | 单文件 |
| 大小 | 50-100MB | 含 V8 |
| 启动 | < 50ms | AOT |
| 跨平台 | 4 | Linux/macOS/Win/ARM |
| 调试 | 保留 source map | 可选 |

**最佳实践**：
1. ✅ AOT 编译：单一二进制分发
2. ✅ V8 snapshot 复用：启动 < 50ms
3. ✅ 用户代码预加载：避免 IO
4. ✅ 跨平台 build：4 个 target
5. ✅ 监控二进制大小：strip + LTO
6. ✅ 文档化编译：README 写清

## 四、可靠性与生态

### 16. Node.js 兼容层（Node.js Compatibility Layer）

**问题场景**：Deno 2018 公开时宣称"Node 替代品"，但 Node 几百万 npm 包难以迁。Deno 2.0（2024）**拥抱 Node**：`node:` 前缀 + node_modules 互操作。**承认 Node 生态规模，不可能全替代**。**这是务实转向**。

**解决方案**：
```typescript
// Node 内置模块（node: 前缀）
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import process from "node:process";

// 配置文件：deno.json
{
  "nodeModulesDir": "auto",  // 自动创建 node_modules
  "unstable": ["node-globals"]
}

// npm 包（2.0+）
import express from "npm:express";
// 或
import express from "express";  // 自动从 node_modules 找
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 兼容模块 | 30+ | node:fs / http / path / ... |
| npm | 2.0+ | npm: 前缀 |
| node_modules | 2.0+ | 自动识别 |
| CJS | 部分 | require() 支持 |
| 覆盖率 | 90% | 大部分 Node API |

**最佳实践**：
1. ✅ node: 前缀：明确 Node 兼容
2. ✅ npm: 前缀：单文件 import
3. ✅ nodeModulesDir：自动管理
4. ✅ 测试覆盖：双 runtime 跑
5. ✅ 文档化差异：deno.com 写清
6. ✅ 迁移工具：deno init + 自动改

### 17. npm 互操作（npm Interop）

**问题场景**：Node 几百万 npm 包，Deno 用户也要用。早期 Deno 拒绝 npm（自创 JSR / deno.land/x），Deno 2.0+ 拥抱 npm。**`npm:lodash`、`npm:react@18`**。同时 JSR 是新一代 registry（TypeScript 优先）。

**解决方案**：
```typescript
// npm: 前缀
import lodash from "npm:lodash@4";
import { z } from "npm:zod@3";

// deno.json aliases
{
  "imports": {
    "lodash": "npm:lodash@4",
    "@/": "./src/"
  }
}

// JSR（新一代）
import { z } from "jsr:@zod/zod";
// JSR 特点：TS first / 强类型 / 无 build

// node_modules 兼容
// 自动 nodeModulesDir: "auto" 创建
import express from "express";  // 自动从 node_modules 找
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| npm: 前缀 | 2.0+ | 单文件 |
| JSR | 新 | jsr.io |
| node_modules | 自动 | 2.0+ |
| 类型 | 自动 | JSDoc + .d.ts |
| 性能 | 接近 Node | 共享解析 |

**最佳实践**：
1. ✅ 新项目用 JSR：TypeScript first
2. ✅ 旧项目用 npm:：Node 兼容
3. ✅ deno.json imports 别名：清晰
4. ✅ nodeModulesDir: auto：自动管理
5. ✅ 版本锁定：deno.lock
6. ✅ 监控依赖大小

### 18. 跨平台支持（Cross-Platform Support）

**问题场景**：Deno 跑 Linux / macOS / Windows / FreeBSD / Android / iOS。**每平台二进制要单独编译**。V8 snapshot 不能跨平台。**CI 矩阵 4 OS × 3 arch = 12 任务**。

**解决方案**：
```bash
# 安装 Deno
# macOS
brew install deno
# Windows
irm https://deno.land/install.ps1 | iex
# Linux
curl -fsSL https://deno.land/install.sh | sh
# 容器
docker run -it denoland/deno repl

# 编译跨平台
deno compile --target x86_64-unknown-linux-gnu
deno compile --target x86_64-apple-darwin
deno compile --target x86_64-pc-windows-msvc
deno compile --target aarch64-apple-darwin
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| OS | 6+ | Linux / macOS / Win / FreeBSD / Android / iOS |
| Arch | 3+ | x86_64 / aarch64 / wasm |
| Binary | 静态链接 | 单一文件 |
| V8 | 系统库 | 动态链接 |
| CI 矩阵 | 12 任务 | 4 OS × 3 arch |

**最佳实践**：
1. ✅ CI 矩阵 4 OS × 3 arch：全覆盖
2. ✅ Static 编译：分发方便
3. ✅ Docker 镜像：CI 复用
4. ✅ Homebrew / apt / winget：用户友好
5. ✅ 文档化平台差异：README
6. ✅ 监控平台 bug：用户反馈

### 19. Deno Deploy 边缘计算（Deno Deploy）

**问题场景**：传统 serverless 冷启动 500ms+（Lambda、Vercel）。Deno Deploy 在 35+ 边缘节点用 **V8 isolate**：冷启动 < 5ms，跨节点 < 50ms。**是 V8 + 边缘计算的极致组合**。

**解决方案**：
```typescript
// Deno Deploy — 边缘 fetch
Deno.serve((req: Request) => {
  return new Response("Hello from the edge!");
});

// KV（边缘 KV）
const kv = await Deno.openKv();
await kv.set(["visits", today], count + 1);
const visits = await kv.get(["visits", today]);

// Queues
Deno.serve(async (req) => {
  const { type, data } = await req.json();
  await Deno.cron("daily", "0 0 * * *", async () => {
    // ...
  });
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 边缘节点 | 35+ | 全球 |
| 冷启动 | < 5ms | V8 isolate |
| 跨节点 | < 50ms | 全球加速 |
| KV | 全球一致 | Deno.openKv |
| 计费 | 按使用 | 免费 tier |
| 限制 | 50ms CPU | 短任务 |

**最佳实践**：
1. ✅ 用 Web API：fetch / URL / Request
2. ✅ 避免长任务：< 50ms CPU
3. ✅ 用 Deno KV：边缘状态
4. ✅ 配 deno.json：build 触发
5. ✅ 监控冷启动：< 5ms 目标
6. ✅ 文档化 Deploy：deploy.deno.com

### 20. CI 多平台矩阵（Multi-Platform CI）

**问题场景**：Deno 跑 6+ OS × 3+ arch × 3 产物。**CI 矩阵 50+ 任务**。GitHub Actions + denoland/deno self-hosted runner。**核心是 60+ 任务的快慢分离**。

**解决方案**：
```yaml
# .github/workflows/ci.yml
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        target: [x86_64, aarch64]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v1
        with: { deno-version: v2.x }
      - run: deno test --allow-all
      - run: deno check **/*.ts
      - run: deno fmt --check
      - run: deno lint

  build:
    needs: test
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - run: deno task build
      - run: deno compile --target ...

  integration:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: deno task test:integration
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| OS | 3+ | Linux/macOS/Win |
| Arch | 2+ | x86_64 / aarch64 |
| 任务数 | 50+ | 全矩阵 |
| 时间 | 60-90 min | 全量 |
| 缓存 | deno cache | 跨 job |

**最佳实践**：
1. ✅ 矩阵策略：OS × arch × 产物
2. ✅ fail-fast: false：避免掩盖
3. ✅ 任务并行：节省时间
4. ✅ 缓存依赖：deno cache
5. ✅ 集成测试：跑 e2e
6. ✅ 性能监控：track 回归

---

**标签**：#deno #运行时 #V8 #Rust #TypeScript #安全
**状态**：20/20 份详细内容
