# turborepo

> Vercel 开源的 Rust 增量构建系统：用任务图调度 + Cap'n Proto 跨语言确定性哈希 + 写穿缓存（本地 + 远程） + gRPC daemon 长连接把 monorepo 构建从"分钟级"压到"秒级"。本篇把 monorepo 构建系统的事实标准设计哲学拆成 20 个 Pattern，涵盖 4 大主题：核心机制、架构设计、性能优化、工程实践。

## 核心机制

### 模式 1：Phantom Type 表达 Engine 构建/已构建两态

**问题场景**：`EngineBuilder.build()` 返回 `Engine<Built>`，而执行需要 `Engine<Built>`。如果用 `Option<Engine>` 或 `Result<Engine>` 标记状态，运行时会忘记检查。

**解决方案**：

```rust
// crates/turborepo-engine/src/lib.rs
pub struct Engine<S = Built, T: TaskDefinitionInfo = TaskDefinitionInfo> {
    state: PhantomData<S>,
    tasks: HashMap<TaskId, T>,
    graph: DiGraph<TaskNode, ()>,
}

pub struct Building;
pub struct Built;

impl<T: TaskDefinitionInfo> Engine<Building, T> {
    pub fn build(self) -> Engine<Built, T> { ... }  // 状态转换
}

impl<T: TaskDefinitionInfo> Engine<Built, T> {
    pub fn execute(&self, walker: Walker) { ... }  // 只有 Built 才能执行
}
```

**关键参数**：

| 状态 | 含义 |
|------|------|
| `Engine<Building>` | 构造中，不可执行 |
| `Engine<Built>` | 已构建，可执行 |
| 转换点 | `build()` 触发 `Building → Built` |

**最佳实践**：

- ✅ 编译期阻止"未图化就执行"——零运行时开销
- ✅ `PhantomData<S>` 标记状态——不占空间
- ✅ 用类型参数而非 enum——避免运行时分支
- ✅ 给 builder 的 `build()` 方法用 `self` 而非 `&self`——消费后不可再用
- ❌ 避免在 Built 上暴露 mutable 方法——破坏构建后不变性

### 模式 2：Walker + Visitor 模式解耦"调度"与"执行"

**问题场景**：执行 task graph 时，"调度"（找下一个 task）和"执行"（跑子进程）职责混在一起。LSP 模式、dry-run、cache-only 都要换执行策略。

**解决方案**：

```rust
// crates/turborepo-engine/src/execute.rs
pub struct Walker { ... }

impl Walker {
    pub fn walk<G, F>(&mut self, graph: G, visitor: F) -> WalkResult
    where G: Visitable, F: FnMut(Message<TaskId, Result<()>>) -> ...
    {
        // DFS + mpsc + oneshot
    }
}

// visitor（run 层）决定执行策略
let visitor = |msg: Message<TaskId, Result<()>>| {
    match msg {
        Message::Task(id) => {
            if cache_hit(id) { return Done(Ok(())); }  // cache hit skip
            spawn_child_process(id);
        }
        Message::Done((id, result)) => { ... }
    }
};
walker.walk(graph, visitor);
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `Message<TaskId, Result<()>>` | 任务 ID + 自身结果 |
| `mpsc::Sender<Message>` | 调度→执行通道 |
| visitor | 决定如何处理每条消息 |
| `oneshot` 返回 | 反向控制 walker 推进 |

**最佳实践**：

- ✅ 调度与执行通过 `Message` 通道解耦——visitor 可换
- ✅ visitor oneshot 反向控制——子任务失败可阻断兄弟
- ✅ cache hit 时 visitor 直接 Done——跳过执行
- ✅ 同一 walker 适配 LSP、dry-run、cache-only
- ❌ 避免在 walker 内部 spawn 进程——破坏可测试性

### 模式 3：Cap'n Proto 跨语言确定性序列化

**问题场景**：JavaScript map key 排序、float 精度、UTF-8 BOM 在不同 OS 不同，导致同一份 `package.json` 算出来的 hash 不一致，远程缓存命中率归零。

**解决方案**：

```rust
// crates/turborepo-hash/src/lib.rs
include!(concat!(env!("OUT_DIR"), "/src/proto_capnp.rs"));

// global_hashable.capnp (schema)
struct GlobalHashable {
    turboVersion @0 :Text;
    packageJson @1 :Text;     // 字符串稳定
    lockfile @2 :Text;
    rootEnv @3 :List(Text);
}

fn calculate_global_hash(input: &GlobalHashable) -> String {
    let mut buf = Vec::new();
    capnp::write_message(&mut buf, &input.to_capnp());  // 字段顺序由 schema 决定
    format!("{:016x}", xxhash64(buf))  // 16 字符 hash
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `global_hashable.capnp` | 全局配置 schema |
| `task_hashable.capnp` | 单 task schema |
| `xxHash64` | 64 位非加密 hash，16 字符 |
| `capnp` | 二进制协议，字段编码顺序稳定 |

**最佳实践**：

- ✅ 用 Cap'n Proto / protobuf 而非 JSON.stringify——序列化确定性
- ✅ xxHash64 而非 sha256——快 5-10x
- ✅ 16 字符 hash 足够——碰撞率 < 2^-64
- ✅ 编译期 include! capnp schema——零运行时反射
- ❌ 避免用 JSON 算 hash——map 顺序不稳定

### 模式 4：GlobalHash + TaskHash 两层缓存命中粒度

**问题场景**：所有 task 共享同一份 `package.json` 和 lockfile。如果只有 task 级 hash，每个 task 都要把这些信息纳入 hash 字段，计算冗余。

**解决方案**：

```rust
// crates/turborepo-hash/src/lib.rs
pub struct GlobalHashable {
    turbo_version: String,
    package_json: String,        // 全局共享
    lockfile: String,            // 全局共享
    root_env: Vec<String>,
}

pub struct TaskHashable {
    task_id: TaskId,             // 任务标识
    package_json: String,        // task 自身 package.json
    file_hashes: Vec<FileHash>,  // task 范围内的文件
    env: Vec<String>,            // task 自己的 env
    dependency_task_hashes: Vec<String>,  // 依赖 task 的 hash
    global_hash: String,         // 引用 GlobalHash
}
```

**关键参数**：

| 缓存层 | 命中粒度 | 影响 |
|--------|---------|------|
| GlobalHash | 全局（lockfile + version） | lockfile 改了全 task 失效 |
| TaskHash | 单 task | task 改文件才失效 |

**最佳实践**：

- ✅ GlobalHash 涵盖 lockfile + version——多 task 共享
- ✅ TaskHash 引用 GlobalHash——避免重复计算
- ✅ Loose 模式清空 `pass_through_env`——运行时 env 不算输入
- ✅ `dependency_task_hashes` 反映依赖变化——下游自动失效
- ❌ 避免把 `pass_through_env` 纳入 hash——改个 TZ 就失效

### 模式 5：`mpsc::channel` + `Semaphore` 双层背压

**问题场景**：写穿缓存（write-through）有突发流量。直接 `Semaphore::acquire` 调用方会阻塞；只用 mpsc 又失去并发控制。

**解决方案**：

```rust
// crates/turborepo-cache/src/async_cache.rs
pub struct AsyncCache {
    tx: mpsc::Sender<CacheRequest>,
    semaphore: Arc<Semaphore>,
}

impl AsyncCache {
    pub fn put(&self, key: String, value: Vec<u8>) {
        self.tx.try_send(CacheRequest::Put(key, value)).ok();  // 永不阻塞
    }

    fn worker_loop(rx: Receiver<CacheRequest>, sema: Arc<Semaphore>) {
        let mut futures = FuturesUnordered::new();
        while let Some(req) = rx.recv() {
            let permit = sema.clone().acquire_owned();
            futures.push(async move {
                let _permit = permit.await.unwrap();
                handle(req).await
            });
        }
    }
}
```

**关键参数**：

| 层 | 作用 |
|---|------|
| `mpsc::channel` | 缓冲请求，调用方永不阻塞 |
| `Semaphore` | 限流真实并发数 |
| `FuturesUnordered` | 并发执行，不阻塞收集 |

**最佳实践**：

- ✅ mpsc 是缓冲层，Semaphore 才是限流层——两层语义不同
- ✅ `try_send` 而非 `send`——调用方永不阻塞
- ✅ `WARNING_CUTOFF: u8 = 4`——5 次以上停止警告
- ✅ 退出前 `Flush`——保证所有 worker 落盘
- ❌ 避免在 worker 内再 spawn——会突破 Semaphore 上限

## 架构设计

### 模式 6：petgraph `DiGraph` + DFS 拓扑遍历

**问题场景**：task graph 调度需要拓扑序（依赖在前）。手写 DFS 易错，要检测环。

**解决方案**：

```rust
use petgraph::graph::DiGraph;
use petgraph::algo::topological_sort;
use petgraph::visit::depth_first_search;

let mut graph: DiGraph<TaskNode, ()> = DiGraph::new();
let a = graph.add_node(TaskNode::Task("build:a".into()));
let b = graph.add_node(TaskNode::Task("build:b".into()));
let c = graph.add_node(TaskNode::Task("build:c".into()));
graph.add_edge(a, b, ());  // a → b
graph.add_edge(b, c, ());  // b → c

let sorted = topological_sort(&graph, None).unwrap();  // [a, b, c]
// 或 DFS
depth_first_search(&graph, ::node_indices(&graph), |event| {
    match event {
        DfsEvent::Finish(n, _) => { /* 节点 n 完成 */ }
        _ => {}
    }
});
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `DiGraph` | 有向图 |
| `NodeIndex` | 节点 ID |
| `EdgeIndex` | 边 ID |
| `topological_sort` | 拓扑序 |

**最佳实践**：

- ✅ 用 petgraph 而非自研——稳定 + 测试充分
- ✅ 检测环——`is_cyclic_directed`
- ✅ 包级循环放过，task 级拓扑循环拒绝
- ✅ `topological_sort` 返回 `Result`——环时返回错
- ❌ 避免在 hot path 重建图——用增量更新

### 模式 7：Daemon gRPC 长连接 + cookie 文件同步

**问题场景**：每次 `turbo run` 启动都要解析 turbo.json、构造 task graph、加载 lockfile——启动开销 800ms（Go 版）。需要长连接 daemon 复用状态。

**解决方案**：

```rust
// crates/turborepo-daemon/src/lib.rs
const COOKIE_FILENAME: &str = "cookie";

pub struct TurboDaemon {
    socket_dir: PathBuf,  // 基于 repo_hash 命名
    server: TurboGrpcService,
    _watcher: PackageChangesWatcher,
}

impl TurboDaemon {
    pub fn repo_hash(repo_root: &Path) -> String {
        let mut hasher = Sha256::new();
        hasher.update(repo_root.to_string_lossy().as_bytes());
        hex::encode(&hasher.finalize()[..8])  // 8 字节前缀
    }

    // 事件时序：文件写入 → cookie 写入 → gRPC 调用
    pub fn on_file_event(&self, event: FileEvent) {
        write_cookie(&self.socket_dir, &event);  // cookie 同步
        self.notify_clients(event);  // gRPC 推送
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| gRPC | 双向流（CLI ↔ daemon） |
| socket dir | `~/.turbo/daemon/<repo_hash>/` |
| cookie 文件 | 事件时序屏障 |
| repo_hash | Sha256 前 8 字节 |

**最佳实践**：

- ✅ Daemon 长连接——避免重复启动开销
- ✅ repo_hash 命名 socket——多 repo 同机并存
- ✅ cookie 文件做"事件时序 vs gRPC 调用"同步屏障
- ✅ CLI 启动检测 stale 进程并清理
- ❌ 避免用 stdio IPC——并发支持差

### 模式 8：`EngineBuilder` 流式 API + 4988 行业务

**问题场景**：`EngineBuilder` 要做 turbo.json 解析、extends 解析、依赖图构建、循环检测、validation——单一 builder 类膨胀到 4988 行。

**解决方案**：

```rust
// crates/turborepo-engine/src/builder.rs
pub struct EngineBuilder<'a, T: TaskDefinitionInfo> {
    repo: &'a Repository,
    turbo_json_loader: T,
    workspaces: HashSet<WorkspaceName>,
    tasks: HashSet<TaskName>,
    filters: Vec<Filter>,
}

impl<'a, T: TaskDefinitionInfo> EngineBuilder<'a, T> {
    pub fn new(repo: &'a Repository, turbo_json_loader: T) -> Self { ... }
    pub fn with_workspaces(mut self, ws: HashSet<WorkspaceName>) -> Self { ... }
    pub fn with_tasks(mut self, tasks: HashSet<TaskName>) -> Self { ... }
    pub fn with_filters(mut self, filters: Vec<Filter>) -> Self { ... }
    pub fn build(self) -> Result<Engine<Built, T::Info>, Error> {
        // 1. 解析 turbo.json（含 extends）
        // 2. 构建 package graph
        // 3. 构建 task graph
        // 4. 检测 task-level 环
        // 5. 验证任务定义
        // 6. 返回 Engine<Built>
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `with_*` | 链式配置 |
| `build()` | 终态，返回 `Result` |
| `T: TaskDefinitionInfo` | turbo.json 加载器 trait |

**最佳实践**：

- ✅ builder 用链式 `with_*` 而非构造函数——配置清晰
- ✅ `build()` 消费 `self`——build 后不可再配置
- ✅ 错误用大 enum 不用 `Box<dyn Error>`——可读性
- ✅ `T: TaskDefinitionInfo` trait 注入——测试可换内存实现
- ❌ 避免 builder 单文件 4988 行——应拆为 validator/extends_resolver/topology

### 模式 9：`AsyncCache` 写穿 + 懒 worker 池

**问题场景**：写穿缓存要把"put 到本地"+"put 到远程"两件事合并。如果同步等远程上传完成，前端会被拖慢。

**解决方案**：

```rust
// crates/turborepo-cache/src/async_cache.rs
pub struct AsyncCache {
    tx: mpsc::Sender<CacheRequest>,
    opts: CacheOpts,
}

impl AsyncCache {
    pub async fn put(&self, key: String, artifact: Vec<u8>) -> Result<()> {
        // 1. 同步写本地（必须）
        self.local.put(&key, &artifact).await?;
        // 2. 异步 put 远程
        self.tx.send(CacheRequest::RemotePut(key, artifact)).await?;
        Ok(())
    }

    async fn worker_loop(mut self) {
        let sema = Arc::new(Semaphore::new(self.opts.workers));
        let mut futures = FuturesUnordered::new();
        while let Some(req) = self.rx.recv().await {
            if self.warn_count > WARNING_CUTOFF { continue; }  // swallow
            let permit = sema.clone().acquire_owned();
            futures.push(async move {
                let _permit = permit.await.unwrap();
                if let Err(e) = handle(req).await {
                    warn!("cache error: {e}");
                }
            });
        }
    }
}
```

**关键参数**：

| 字段 | 默认 | 说明 |
|------|------|------|
| `opts.workers` | 4 | 远程上传并发数 |
| `WARNING_CUTOFF` | 4 | 5 次以上停止警告 |
| mpsc buffer | `workers` | 缓冲请求 |
| `Flush` | 同步 | 退出前等所有 worker |

**最佳实践**：

- ✅ 本地写同步、远程写异步——前端不被拖慢
- ✅ `try_send` 而非 `send`——永不阻塞
- ✅ `WARNING_CUTOFF` 防止 CI log 被缓存失败刷爆
- ✅ Remote 不可达时静默回落到本地——不阻塞 build
- ❌ 避免 sync_remote.put().await——会拖垮构建

### 模式 10：`TurboJsonLoader` trait + 测试替身

**问题场景**：builder 需要加载 turbo.json，但单测不想接触文件系统。需要注入测试用内存实现。

**解决方案**：

```rust
// crates/turborepo-engine/src/builder.rs
pub trait TurboJsonLoader: Send + Sync {
    fn load(&self, workspace: &WorkspaceName) -> Result<TurboJson>;
    fn resolve_extends(&self, parent: &TurboJson) -> Result<TurboJson>;
}

// 生产实现
pub struct FileSystemTurboJsonLoader<'a> {
    repo: &'a Repository,
}

// 测试实现
pub struct InMemoryTurboJsonLoader {
    fixtures: HashMap<WorkspaceName, TurboJson>,
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `Send + Sync` | trait 必须线程安全 |
| `load` | 加载单 workspace 的 turbo.json |
| `resolve_extends` | 处理 `extends` 链 |

**最佳实践**：

- ✅ 用 trait 抽象文件 IO——单测可注入内存实现
- ✅ 生产/测试双实现——单测零文件系统依赖
- ✅ 业务 crate 不直接 `std::fs`——通过 trait
- ✅ `Send + Sync` 约束——支持并发构建
- ❌ 避免在 builder 内 if is_test 分支——污染生产代码

## 性能优化

### 模式 11：xxHash64 而非 SHA-256 提速 5-10x

**问题场景**：每个 task 都要算 hash，hash 计算占构建时间 5-10%。SHA-256 安全但慢；MD5 不安全且也慢。

**解决方案**：

```rust
use xxhash_rust::xxh64::xxh64;

fn hash_inputs(inputs: &[u8]) -> String {
    let h = xxh64(inputs, 0xdeadbeef);  // 64-bit hash
    format!("{:016x}", h)  // 16 字符十六进制
}

// 用法
let hash = hash_inputs(&capnp_encoded);
let key = format!("{}-{}", task_id, hash);
```

**关键参数**：

| Hash | 速度 | 用途 |
|------|------|------|
| xxHash64 | ~5 GB/s | 非加密场景首选 |
| SHA-256 | ~500 MB/s | 加密场景 |
| MD5 | ~700 MB/s | 已不安全 |

**最佳实践**：

- ✅ 非加密场景用 xxHash64——快 10x
- ✅ 64 bit 足够——碰撞率 2^-64
- ✅ 用 16 字符十六进制（截前 8 字节）——哈希长度可读
- ✅ 固定 seed（0xdeadbeef）——确定性
- ❌ 避免用 MD5——已被破解

### 模式 12：Cap'n Proto 字段顺序确定性编码

**问题场景**：JSON.stringify 在不同 JS 引擎（V8、JSCore）、不同 OS（macOS UTF-8 BOM vs Linux）输出可能不同，hash 不一致。

**解决方案**：

```capnp
# global_hashable.capnp
@0x9eb32e19f86ee174;

struct GlobalHashable {
    turboVersion @0 :Text;        # 字段顺序由 schema 决定
    packageJson @1 :Text;
    lockfile @2 :Text;
    rootEnv @3 :List(Text);
}
```

```rust
// 用 capnp 序列化
let mut message = capnp::message::Builder::new_default();
let mut hashable = message.init_root::<global_hashable::Builder>();
hashable.set_turbo_version("1.10.0");
hashable.set_package_json(&pkg_json_str);
// ... 其他字段按 schema 顺序
let mut buf = Vec::new();
capnp::serialize::write_message(&mut buf, &message).unwrap();
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `@0`, `@1` | 字段编号，决定编码顺序 |
| `Text` | 字符串 |
| `List(Text)` | 字符串列表 |

**最佳实践**：

- ✅ 用 capnp/protobuf 而非 JSON——序列化确定性
- ✅ 字段顺序由 schema 决定——跨平台一致
- ✅ 编译期 `include!` capnp 代码——零运行时反射
- ✅ 二进制格式比 JSON 小——节省 IO
- ❌ 避免 JSON.stringify 算 hash——非确定性

### 模式 13：本地缓存 `.turbo/cache` mmap 加载

**问题场景**：本地 cache 启动时要把所有 .turbo/cache/<hash>.tar 读到内存。简单 read 太慢，mmap 零拷贝。

**解决方案**：

```rust
// 加载 cache artifact
let path = format!(".turbo/cache/{}.tar", hash);
let file = File::open(path)?;
let mmap = unsafe { Mmap::map(&file)? };  // 零拷贝

// 直接使用 mmap 的字节
let decompressed = flate2::read::ZlibDecoder::new(&mmap[..]).read_to_end(&mut buf)?;
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `.turbo/cache/<hash>.tar` | 单 task artifact |
| zlib 压缩 | 减少磁盘占用 |
| mmap | 零拷贝读取 |

**最佳实践**：

- ✅ 大 artifact（> 10MB）用 mmap——零拷贝
- ✅ zlib 压缩——磁盘 IO 减半
- ✅ tar 格式——保持目录结构
- ✅ async 读取——不阻塞 task 执行
- ❌ 避免同步 read——会阻塞 worker

### 模式 14：Vercel Remote Cache 远程 HTTP 缓存协议

**问题场景**：本地 cache 团队内不共享。每次 PR CI 都要全量构建。需要 Vercel Remote Cache 跨机器共享。

**解决方案**：

```bash
# 远程缓存 API
PUT /v8/artifacts/{hash}
Authorization: Bearer ${TURBO_TOKEN}
Content-Type: application/octet-stream
Body: <artifact bytes>

GET /v8/artifacts/{hash}
Authorization: Bearer ${TURBO_TOKEN}
Response: 200 + artifact / 404 not found
```

```rust
// 远程 cache 客户端
pub struct RemoteCacheClient {
    base_url: String,
    token: String,
    client: reqwest::Client,
}

impl RemoteCacheClient {
    pub async fn fetch(&self, hash: &str) -> Result<Vec<u8>> {
        let resp = self.client.get(format!("{}/v8/artifacts/{}", self.base_url, hash))
            .bearer_auth(&self.token)
            .send().await?;
        match resp.status() {
            StatusCode::OK => Ok(resp.bytes().await?.to_vec()),
            StatusCode::NOT_FOUND => Err(Error::NotFound),
            _ => Err(Error::Remote),
        }
    }

    pub async fn put(&self, hash: &str, artifact: Vec<u8>) -> Result<()> {
        self.client.put(format!("{}/v8/artifacts/{}", self.base_url, hash))
            .bearer_auth(&self.token)
            .body(artifact)
            .send().await?;
        Ok(())
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `TURBO_TOKEN` | 远程缓存认证 token |
| `base_url` | Vercel Cache 端点 |
| `hash` | 16 字符 hex |
| HTTP status | 200 命中 / 404 miss |

**最佳实践**：

- ✅ 远程命中后写本地——下次免远程
- ✅ 远程不可达时静默回落本地——不阻塞
- ✅ `TURBO_TOKEN` 用环境变量——不落日志
- ✅ `team_id` + `project_id` 命名空间——团队隔离
- ❌ 避免硬编码 token——会泄漏

### 模式 15：Rust 启动 50ms 而 Go 启动 800ms

**问题场景**：Go 进程每次启动加载 runtime + GC + stack setup，冷启动 800ms。Rust 单 binary + 零 runtime → 50ms。

**解决方案**：

- **Go 版本**：800ms 启动 → 每次 `turbo run` 都付
- **Rust 版本**：50ms 启动 → daemon 长连接可省

**关键参数**：

| 版本 | 启动时间 | 原因 |
|------|---------|------|
| Go 1.x | 800ms | 进程虚拟化 + GC + runtime |
| Rust 1.x | 50ms | 单 binary + 零 runtime |

**最佳实践**：

- ✅ CLI 工具首选 Rust——启动 + 内存优势明显
- ✅ daemon 长连接——避免重复启动开销
- ✅ 用 release profile（LTO + codegen-units=1）—— 进一步减少
- ✅ 用 `cargo-bloat` 找大依赖——可移除
- ❌ 避免在 CLI 工具用 Java/C#——JVM 启动慢

## 工程实践

### 模式 16：Rust workspace + pnpm workspace 双语言 monorepo

**问题场景**：turborepo 自身是 monorepo（Rust 核心 + TS 工具链 + 文档站）。需要双语言 workspace 协调。

**解决方案**：

```toml
# Cargo.toml (根)
[workspace]
members = ["crates/*"]
exclude = ["examples/*"]
```

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
  - "examples/*"
```

```bash
# Rust 编译
cargo build --release -p turbo
# TS 编译
pnpm install && pnpm -r build
# 自指：用 turbo 构建 turbo
./target/release/turbo run build
```

**关键参数**：

| Workspace | 工具 | 作用 |
|-----------|------|------|
| Rust | `cargo` | 核心引擎、daemon |
| pnpm | `pnpm` | CLI 包装、文档站、JS 工具 |

**最佳实践**：

- ✅ 双 workspace 各管一摊——Rust 核心、TS 工具
- ✅ `packages/turbo-repository` 把 Rust 编译为 napi 模块
- ✅ 自指 monorepo——用 turbo 自身构建 turbo
- ✅ 预编译 8 三元组（darwin-arm64、linux-gnu x64 等）——开箱即用
- ❌ 避免混用 cargo + npm script——会冲突

### 模式 17：napi-rs 跨语言绑定

**问题场景**：`turbo-repository`（JS 包）需要调用 Rust 库（`turborepo-repository`）。需要零成本绑定。

**解决方案**：

```rust
// crates/turborepo-repository/src/lib.rs
#[napi]
pub struct Repository { ... }

#[napi]
impl Repository {
    #[napi(constructor)]
    pub fn new(root: String) -> Result<Self> { ... }

    #[napi]
    pub fn package_graph(&self) -> Result<JsPackageGraph> { ... }
}
```

```typescript
// packages/turbo-repository/src/index.ts
import { Repository } from "./native";

export class TurboRepository {
  private repo: Repository;
  constructor(root: string) {
    this.repo = new Repository(root);
  }
  packageGraph() {
    return this.repo.packageGraph();
  }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `#[napi]` | napi-rs 宏标记导出 |
| `napi(constructor)` | 构造器 |
| 平台 | darwin-arm64、linux-gnu x64 等 8 三元组 |
| 编译 | `pnpm run build:native` |

**最佳实践**：

- ✅ 用 napi-rs 而非 Neon——更现代、更易维护
- ✅ 预编译多平台 binary——避免用户编译 Rust
- ✅ 把"包图、lockfile 解析"放 Rust 侧——性能优势
- ✅ TS 侧只做"用户 API"——业务逻辑不下沉
- ❌ 避免把所有逻辑放 Rust——调试困难

### 模式 18：`tracing` 全链路 + `miette` 错误诊断

**问题场景**：大型构建系统出问题时，开发者需要快速定位。日志需要支持"过滤 subsystem"和"显示源码位置"。

**解决方案**：

```rust
// 全链路 tracing
use tracing::{info, span, Level};

fn run_task(task_id: TaskId) {
    let span = span!(Level::INFO, "run_task", task_id = %task_id);
    let _enter = span.enter();
    info!("starting task");
    // ...
    info!("task done");
}

// 错误诊断
use miette::{Diagnostic, SourceSpan, SourceCode};

#[derive(Debug, thiserror::Error, Diagnostic)]
#[error("Invalid turbo.json")]
#[diagnostic(code(turbo_json::invalid))]
pub struct InvalidTurboJson {
    #[source_code] pub src: String,
    #[label("this field")] pub span: SourceSpan,
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `tracing` | 结构化 span，全链路 |
| `miette` | 带源码 span 的错误 |
| `TRACING=file:./trace.json` | 输出 Chrome trace |
| `#[diagnostic(code)]` | 错误码 |

**最佳实践**：

- ✅ 用 `tracing` 替代 `log`——支持 span 嵌套
- ✅ 用 `miette` 替代 `thiserror`——错误带源码位置
- ✅ 给 subsystem 标签——`Subsystem::Cache`、`Subsystem::Daemon`
- ✅ 输出 Chrome trace 格式——Chrome DevTools 可视化
- ❌ 避免 `println!` 调试——会被 CI log 淹没

### 模式 19：`oxlint` + `oxfmt` 替代 ESLint + Prettier

**问题场景**：ESLint 10-100x 慢于 oxlint。Prettier 30x 慢于 oxfmt。turborepo 自身代码量大，lint/format 是瓶颈。

**解决方案**：

```bash
# 用 oxc 工具链
oxlint .                # 比 ESLint 快 10-100x
oxfmt --check .         # 比 Prettier 快 30x
```

**关键参数**：

| 工具 | 替代 | 速度 |
|------|------|------|
| oxlint | ESLint | 10-100x |
| oxfmt | Prettier | 30x |
| oxc | 全套（parser + linter + formatter） | 100x |

**最佳实践**：

- ✅ monorepo 首选 oxc 工具链——lint 速度上 100x
- ✅ CI 用 `oxlint --max-warnings=0`——零警告
- ✅ pre-commit hook 跑 `oxfmt`——格式化
- ✅ oxc 由 VoidZero 主导，TypeScript 团队参与——未来标准
- ❌ 避免在 monorepo 继续用 ESLint——CI 慢

### 模式 20：`boundaries` 静态分析强制包边界

**问题场景**：monorepo 包之间有隐式依赖（`ui` 包不该 import `server-only` 代码）。ESLint 规则难以表达。

**解决方案**：

```rust
// crates/turborepo-boundaries
pub struct BoundaryRule {
    package: WorkspaceName,
    allowed_imports: Vec<Pattern>,
    forbidden_imports: Vec<Pattern>,
}

impl BoundaryRule {
    pub fn check(&self, file: &Path, imports: &[String]) -> Vec<Violation> {
        imports.iter()
            .filter(|imp| self.is_violation(imp))
            .map(|imp| Violation::new(file, imp))
            .collect()
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `package` | 当前包 |
| `allowed_imports` | 允许的 import 模式 |
| `forbidden_imports` | 禁止的 import 模式 |
| `Violation` | 违规描述 |

**最佳实践**：

- ✅ 用静态分析强制包边界——比 ESLint 规则更准确
- ✅ 把"边界规则"放 turbo.json——配置化
- ✅ CI 跑 `turbo boundaries`——零违规合并
- ✅ 违规给出修复建议——`rename to @company/ui`
- ❌ 避免"事后 review"——应 CI 拦截

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\turborepo\` |
| 主语言 | Rust（~65%）+ TypeScript（~30%） |
| License | MIT（CLI）+ MPL-2.0（daemon） |
| Stars | ~26k |
| 平台 | macOS arm64/x64、Linux gnu/musl、Win x64 |
| Crates | 60+ Rust 子 crate |
| TS packages | 18 |

## 一句话总结

turborepo 的精髓在 Phantom Type（编译期状态） + Walker Visitor 模式（调度执行解耦） + Cap'n Proto 确定性序列化（跨平台 hash 一致） + mpsc+Semaphore 双层背压（写穿缓存） + petgraph DAG 拓扑（任务图调度）五件套——任何"任务调度 + 内容寻址 + 远程缓存"项目都适用。任务图 + 远程缓存协议 + daemon 长连接三件基础设施可直接复用到任何 CI/CD 编排器。
