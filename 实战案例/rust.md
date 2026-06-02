# rust - 内存安全 + 零成本抽象的系统编程语言

**GitHub**: rust-lang/rust
**Star**: 100k+
**语言**: Rust (~92%) / Python (bootstrap) / LLVM IR
**主题**: 系统编程 / 内存安全 / 零成本抽象 / 并发安全
**适用场景**: 系统工具、嵌入式、WebAssembly、CLI、操作系统、高性能网络服务

---

## 第一段：基础范式

### 模式 1：所有权 + 借用 = 编译期内存安全

**问题场景**：C/C++ 手动 malloc/free 内存泄漏、use-after-free、double-free 频发；GC 语言（Java/Go）性能有损、stop-the-world 卡顿。

**解决方案**：Rust 用"所有权"系统：每个值有唯一所有者，赋值/传参时 move，引用受借用检查器约束（同一时刻要么 N 个不可变引用，要么 1 个可变引用）。编译期保证无内存 bug，零运行时开销。

**关键参数**：
- `let s = String::from("hi")`：s 拥有这个 String
- `let s2 = s`：move，s 不再可用
- `&s` / `&mut s`：不可变/可变借用
- 借用规则：同一时刻多读 OR 一写，不能同时
- 违反规则：编译错误

**最佳实践**：用 `&` 传引用而非 `clone()`；用 `Cow<'a, T>` 减少 clone；编译器是你的盟友。

### 模式 2：零成本抽象（trait + generic）

**问题场景**：Java/C# 的泛型有装箱开销；template/宏难学；高阶语言 runtime 重。

**解决方案**：Rust 的 trait + generic 编译期单态化（monomorphization）：`fn max<T: Ord>(a: T, b: T) -> T` 编译为 `max_i32` / `max_f64` 等具体类型函数，无装箱、无虚函数调用。

**关键参数**：
- `trait Drawable { fn draw(&self); }`
- `impl Drawable for Circle { ... }`
- `fn render<T: Drawable>(item: T) { item.draw() }`
- 编译时单态化 = 0 抽象开销
- 静态分派 vs 动态分派（`dyn Trait` 虚函数表）

**最佳实践**：默认 generic + 静态分派；要"异构集合"才用 `dyn Trait`。

### 模式 3：Result / Option 错误处理

**问题场景**：C 返回 int 错误码易忽略；Java checked exception 啰嗦；Go `if err != nil` 满屏。

**解决方案**：Rust 无 exception，所有错误显式：
- `Result<T, E>`：成功 `Ok(T)` / 失败 `Err(E)`
- `Option<T>`：有 `Some(T)` / 无 `None`
- `?` 运算符：自动 propagate 错误
- `match` 强制处理两个 case

**关键参数**：
- `fn read_file() -> Result<String, io::Error>`
- `let s = read_file()?;` // 失败时自动 return
- `match opt { Some(x) => ..., None => ... }`
- `unwrap()` / `expect()` 仅用于 prototype
- `anyhow` / `thiserror` 库简化错误处理

**最佳实践**：永远不用 `unwrap()` 在生产代码；用 `?` propagate；自定义 error type。

### 模式 4：模式匹配

**问题场景**：复杂的条件分支（type 检查、enum 状态）写一串 if/else，漏 case 编译器不提醒。

**解决方案**：`match` 强制穷尽（exhaustive）所有可能：
```rust
match opt {
  Some(x) if x > 0 => "positive",
  Some(_) => "non-positive",
  None => "none",
}
```

**关键参数**：
- 必须覆盖所有 case
- `if` guard 附加条件
- `_` 通配
- `if let` 简化单 case
- `while let` 循环匹配

**最佳实践**：编译器警告 `non-exhaustive match`，永远响应该警告。

### 模式 5：Cargo 包管理与构建

**问题场景**：C/C++ 无统一包管理（CMake / Make 痛苦）；Node npm 有 lockfile 但生态差。

**解决方案**：`cargo` 一站式：包管理 + 构建 + 测试 + 文档 + 跨平台编译。
- `cargo new myapp`：创建项目
- `cargo add serde`：加依赖
- `cargo build` / `cargo test` / `cargo run`
- `Cargo.toml` 声明依赖
- `Cargo.lock` 锁定版本

**关键参数**：
- `[dependencies]` / `[dev-dependencies]` / `[build-dependencies]`
- `cargo update` 更新 lockfile
- `cargo publish` 发到 crates.io
- `cargo build --release` 优化编译
- Workspaces：monorepo 共享依赖

**最佳实践**：永远 commit `Cargo.lock`（应用项目）；库项目忽略。

---

## 第二段：扩展范式

### 模式 6：生命周期（Lifetime）

**问题场景**：引用谁活得久？悬垂引用（dangling reference）编译期如何防？

**解决方案**：生命周期标注 `'a`、`'static`，借用检查器追踪引用存活期：
```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
  if x.len() > y.len() { x } else { y }
}
```

**关键参数**：
- `'a`：生命周期参数
- `'static`：整个程序生命周期
- 借用检查器：编译期验证
- 生命周期省略规则：3 条（输入生命周期 + 输出生命周期）
- `Box::leak` 创建 'static

**最佳实践**：90% 场景生命周期可省略（编译器自动）；遇到复杂引用看编译器提示。

### 模式 7：trait 对象 vs 泛型（动态 vs 静态分派）

**问题场景**：需要"异构集合"（Vec 装不同类型）；运行时才知道具体类型。

**解决方案**：
- **泛型**（静态）：`fn render<T: Drawable>(item: T)`，单态化，0 开销
- **trait 对象**（动态）：`fn render(item: &dyn Drawable)`，虚函数表，开销小

**关键参数**：
- `&dyn Trait` / `Box<dyn Trait>`：trait 对象
- 动态分派：vtable 间接调用（ns 级）
- 不能 dyn 加泛型方法
- `dyn` 不能 clone（除非 trait 继承 Clone）

**最佳实践**：默认泛型；要"异构集合"或"插件架构"用 dyn Trait。

### 模式 8：智能指针（Box / Rc / Arc / RefCell / Mutex）

**问题场景**：单一所有权不够用（共享 / 内部可变性 / 跨线程）；裸指针不安全。

**解决方案**：
- `Box<T>`：堆分配，单所有权
- `Rc<T>`：单线程引用计数（共享所有权）
- `Arc<T>`：跨线程引用计数（atomic）
- `RefCell<T>`：单线程内部可变性（运行时借用检查）
- `Mutex<T>`：跨线程互斥（runtime 锁）

**关键参数**：
- `Rc::clone(&rc)` 增加引用计数
- `Arc<Mutex<T>>` 跨线程共享可变
- `RefCell::borrow()` / `borrow_mut()`
- `Box<dyn Trait>` trait 对象装箱

**最佳实践**：`Arc<Mutex<T>>` 是跨线程共享标准模式；能避免就用消息传递（`mpsc::channel`）。

### 模式 9：并发（async/await + Tokio）

**问题场景**：高并发 IO（10k+ 连接）需要"非阻塞 + 轻量协程"；Go goroutine 是 8KB/个，百万连接爆内存。

**解决方案**：`async/await` 编译为状态机（无栈协程），每个 task 几十字节。Tokio 是事实标准 runtime：
- `#[tokio::main]` runtime
- `async fn` 异步函数
- `tokio::spawn` 启动 task
- `tokio::select!` 多路复用

**关键参数**：
- Future：`poll(self, cx) -> Poll<T>`
- 异步运行时：Tokio / async-std
- `Send` + `Sync` trait 跨线程安全
- 异步 trait（Rust 1.75+ 稳定）

**最佳实践**：IO 密集用 async；CPU 密集用 `rayon`（data parallelism）；不要混用阻塞调用。

### 模式 10：宏系统（declarative + procedural）

**问题场景**：写大量样板代码（println!、JSON 序列化、ORM 映射）；模板/泛型搞不定。

**解决方案**：
- **声明宏**（macro_rules!）：模式匹配替换
- **过程宏**（proc-macro）：编译期生成代码（derive、自定义属性、函数宏）

**关键参数**：
- `#[derive(Debug, Clone)]` 自动实现 trait
- `serde::Serialize` derive
- `#[tokio::main]` 函数宏
- 过程宏在 `proc-macro = true` crate
- 编译期运行，零运行时开销

**最佳实践**：用现成 derive（serde / thiserror / clap）；自定义宏小心，编译错误信息难懂。

---

## 第三段：进阶范式

### 模式 11：unsafe Rust

**问题场景**：系统编程必须操作裸指针、调用 C 库、内联汇编；safe Rust 表达不了。

**解决方案**：`unsafe` 块放开 5 个不安全操作：
- 解引用裸指针 `*const T`
- 调用 unsafe 函数
- 访问/修改可变静态变量
- 实现 unsafe trait
- 访问 union 字段

**关键参数**：
- `unsafe fn` 函数声明 unsafe
- `unsafe { ... }` 块包裹
- 安全抽象：unsafe impl + safe API
- `#[deny(unsafe_op_in_unsafe_fn)]`

**最佳实践**：unsafe 局限在最小模块；包成 safe API；写清楚 safety 注释。

### 模式 12：FFI（C 互操作）

**问题场景**：调用系统 C 库（libc、OpenSSL、SQLite）；Rust 重写所有 C 库不现实。

**解决方案**：`extern "C"` 声明 C 函数 + `bindgen` 自动生成绑定：
```rust
extern "C" { fn abs(input: i32) -> i32; }
```

**关键参数**：
- `extern "C"` C ABI
- `#[repr(C)]` 结构体布局兼容 C
- `bindgen` 从 .h 生成 Rust 绑定
- `cbindgen` 反向（Rust 暴露给 C）
- `cc` crate 编译 C 代码

**最佳实践**：用 bindgen 自动绑定；不要手写（容易错）；FFI 函数包成 safe wrapper。

### 模式 13：性能优化（unsafe / SIMD / 缓存友好）

**问题场景**：要榨干 CPU 性能（高频交易、游戏、HPC）；safe Rust 不够快。

**解决方案**：
- **unsafe**：去掉边界检查、bounds check
- **SIMD**：`std::arch::x86_64::_mm256_add_ps` 或 `packed_simd` crate
- **数据结构**：AoS vs SoA（cache-friendly）
- **分片**：`rayon` 并行化
- **profile**：`cargo flamegraph` + `perf`

**关键参数**：
- `#[inline]` 强制内联
- `#[cold]` 标记冷路径
- `Vec::with_capacity` 预分配
- `SmallVec` 栈上小 buffer
- `bytes::Bytes` 引用计数零拷贝

**最佳实践**：先 profile 再优化；safe Rust 90% 场景够用；unsafe 集中在内部模块。

### 模式 14：WebAssembly（WASM）

**问题场景**：浏览器跑 C++/Rust 高性能代码（游戏引擎、图像处理）；JS 太慢。

**解决方案**：`wasm-pack` 一键编译 Rust → WASM，JS 调用：
```bash
wasm-pack build --target web
```

**关键参数**：
- `wasm-bindgen`：Rust ↔ JS 互操作
- `web-sys` / `js-sys`：浏览器 API 绑定
- `target = "wasm32-unknown-unknown"`
- 体积优化：`wasm-opt -Oz`
- WASI：服务端 WASM

**最佳实践**：用 wasm-pack + wasm-bindgen；性能比 JS 快 5-10x；体积仍是挑战。

### 模式 15：嵌入式与 no_std

**问题场景**：嵌入式 MCU（无 OS、KB 级 RAM）；不能依赖 std（堆分配、线程）。

**解决方案**：`no_std` crate 不用 std，用 `core` + `alloc`（可选）：
```rust
#![no_std]
#![no_main]
```

**关键参数**：
- `core`：无堆、无 OS
- `alloc`：堆分配
- `cortex-m` / `riscv`：MCU HAL
- `RTIC` / `Embassy`：嵌入式 RTOS/async
- `flip-link`：链接器防栈溢出

**最佳实践**：嵌入式用 Embassy（async + 高效）；MCU 选 cortex-m / riscv HAL。

---

## 第四段：实战范式

### 模式 16：项目结构

**问题场景**：Rust 项目如何组织代码（lib + bin + tests）？

**解决方案**：
```
my-app/
├── Cargo.toml
├── src/
│   ├── lib.rs          # 库入口（核心逻辑）
│   ├── main.rs         # 二进制入口（CLI）
│   ├── config.rs       # 模块
│   ├── error.rs        # 错误类型
│   └── domain/         # 业务领域
│       ├── mod.rs
│       ├── user.rs
│       └── order.rs
├── tests/              # 集成测试
│   └── integration.rs
├── benches/            # 性能基准
│   └── bench.rs
└── examples/           # 示例
    └── basic.rs
```

**关键参数**：
- `src/lib.rs` 是库入口
- `src/main.rs` 是 binary 入口
- `tests/` 集成测试（每个 .rs 独立 crate）
- `benches/` cargo bench
- `examples/` cargo run --example

**最佳实践**：核心逻辑放 lib.rs（可重用）；bin 入口极简（参数解析 + 调 lib）。

### 模式 17：测试与 CI

**问题场景**：Rust 项目如何测试 + CI 验证？

**解决方案**：
- **单元测试**：`#[cfg(test)] mod tests { ... }` 在同文件
- **集成测试**：`tests/*.rs` 测 lib API
- **文档测试**：`/// # Example` 块（`cargo test --doc`）
- **性能基准**：`criterion` 库
- **CI**：GitHub Actions 跑 `cargo test` + `cargo clippy` + `cargo fmt --check`

**关键参数**：
- `cargo test` 一键跑全部
- `#[test]` 函数标记
- `assert_eq!` / `assert!` 断言
- `#[should_panic]` 预期 panic
- Mock：`mockall` crate

**最佳实践**：CI 必跑 fmt + clippy + test；clippy 警告零容忍。

### 模式 18：常用库生态

**问题场景**：Rust 生态有哪些必备库？

**解决方案**：
- **序列化**：`serde` + `serde_json` / `serde_yaml`
- **HTTP 客户端**：`reqwest`（同步/异步）
- **HTTP 服务端**：`axum` / `actix-web` / `warp`
- **数据库**：`sqlx`（async） / `diesel`（同步） / `sea-orm`
- **异步运行时**：`tokio` / `async-std`
- **日志**：`tracing` / `log` + `env_logger`
- **错误**：`anyhow` / `thiserror`
- **CLI**：`clap` / `structopt`
- **正则**：`regex` / `regex_automata`
- **日期**：`chrono` / `time`

**关键参数**：
- 同步 vs 异步：默认 tokio 异步
- `serde` 是必学（几乎所有 crate 都用）
- `tracing` 优于 `log`（结构化、span）
- `clap` 4.x derive 风格

**最佳实践**：先看 `tokio` + `serde` + `clap` + `tracing` 四个库就够 80% 项目。

### 模式 19：从 C++/Java/Go 迁移

**问题场景**：团队有 C++/Java/Go 经验，迁移到 Rust 常见痛点？

**解决方案**：
- **C++ → Rust**：所有权消灭内存 bug；宏系统 vs 模板元编程
- **Java → Rust**：性能 + 内存节省（无 GC）；类型系统表达力强
- **Go → Rust**：性能 + 表达力；学习曲线陡（生命周期 + 借用）

**关键参数**：
- 编译时长：Rust 慢（C++ 数量级），用 `mold` linker 加速
- IDE：`rust-analyzer` 是主流
- 学习曲线：所有权 + 生命周期 2-4 周
- 生态：成熟（生产级 80% 场景够用）

**最佳实践**：Rust 适合"新写高性能服务"；老 C++ 系统渐进迁移；不要一上来就大规模替换。

### 模式 20：Rust 2024 + 未来趋势

**问题场景**：Rust 1.85+ 有什么新特性？Rust 未来走向？

**解决方案**：
- **Rust 2024 Edition**：精化语法、改默认行为
- **异步 trait**（稳定）：trait 内 async fn
- **`let chains`**（稳定）：`if let Some(x) = a && x > 0`
- **`gen blocks`**（实验）：同步生成器
- **Polonius**（实验）：更智能借用检查器
- **Rust for Linux**：内核模块进入 mainline
- **cargo script**（实验）：`cargo run script.rs`

**关键参数**：
- 关注 RustConf / This Week in Rust
- 重要 crate 进展（axum / tokio / bevy）
- Rust 1.85 LTS-like 行为
- 编译器 LTO 优化

**最佳实践**：每 6 周升级 Rust；用 stable + 必要 nightly feature；不要追新 feature 牺牲稳定性。

---

## 附录：5 段必读代码

1. `compiler/rustc/src/main.rs` — rustc 入口（CLI 解析 + 调度）
2. `library/alloc/src/vec.rs` — Vec 实现（看 grow / drop / unsafe 边界）
3. `library/core/src/iter/mod.rs` — Iterator trait 抽象（看 trait 设计）
4. `library/std/src/sync/mutex.rs` — Mutex 实现（看 unsafe + Send + Sync）
5. `compiler/rustc_borrowck/src/lib.rs` — 借用检查器核心（看生命周期推断算法）

## 一句话总结

Rust = 所有权 + 借用（编译期内存安全）+ 零成本抽象（trait + generic）+ 显式错误（Result/Option）+ Cargo 一站式，用工业级工程把"系统编程"从"内存 bug 频发"变成"编译期 0 panic"的可能。
