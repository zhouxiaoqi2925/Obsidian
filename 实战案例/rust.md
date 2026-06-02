# rust - 内存安全 + 零成本抽象的系统编程语言

**GitHub**: rust-lang/rust
**Star**: 100k+
**语言**: Rust (~92%) / Python (bootstrap) / LLVM IR
**主题**: 系统编程 / 内存安全 / 零成本抽象 / 并发安全
**适用场景**: 系统工具、嵌入式、WebAssembly、CLI、操作系统、高性能网络服务

---

## 第一段：内存安全与零成本抽象

### 模式 1：所有权 + 借用 = 编译期内存安全

**问题场景**：C/C++ 手动 `malloc/free` 内存泄漏、`use-after-free`、`double-free` 频发；GC 语言（Java/Go）性能有损、`stop-the-world` 卡顿。开发者既想要 C 的性能，又想要 Java 的安全。

**解决方案**：Rust 用"所有权"系统——每个值有唯一所有者，赋值/传参时 `move`，引用受借用检查器约束（同一时刻要么 N 个不可变引用 `&T`，要么 1 个可变引用 `&mut T`）。编译期保证无内存 bug，零运行时 GC 开销。

```rust
// 所有权 + 借用
fn main() {
    let s = String::from("hello");   // s 拥有这个 String
    let s2 = s;                       // move：s 不再可用，s2 拥有
    // println!("{}", s);             // 编译错：s 已 move
    let len = calculate_length(&s2);  // &s2 不可变借用，不夺所有权
    println!("{} {}", s2, len);       // s2 仍可用
}
fn calculate_length(s: &String) -> usize {  // 借用，调用完归还
    s.len()
}
```

**关键参数**：
- `let s = String::from("hi")`：s 拥有这个 String
- `let s2 = s`：move 语义，s 失效
- `&s` / `&mut s`：不可变/可变借用
- 借用规则：同一时刻多读 OR 一写，不能同时
- 违反规则：编译错误（不是运行时崩溃）
- `Copy` trait：栈类型自动复制（i32 / bool / char）
- `Clone` trait：堆类型显式 clone

**最佳实践**：用 `&` 传引用而非 `clone()`；用 `Cow<'a, T>` 延迟 clone（`Borrowed` → 不 clone，`Owned` → clone 一次）；编译器是你的盟友——看见"borrow checker"错误先想"我的所有权设计哪里不对"，不要 `clone()` 绕开。

### 模式 2：trait + generic 零成本抽象

**问题场景**：Java/C# 的泛型有装箱开销（`Object`）；C++ template 编译慢、错误信息难看；高阶语言 runtime 重（v8/erlang）。开发者想"高级语法 + 底层性能"。

**解决方案**：Rust 的 `trait` + `generic` 编译期单态化（monomorphization）——`fn max<T: Ord>(a: T, b: T) -> T` 编译为 `max_i32` / `max_f64` 等具体类型函数，无装箱、无虚函数调用。`trait` 定义行为契约，`impl Trait for Type` 实现契约。

```rust
trait Drawable { fn draw(&self); }
struct Circle { r: f64 }
struct Square { s: f64 }
impl Drawable for Circle {
    fn draw(&self) { println!("○ r={}", self.r); }
}
impl Drawable for Square {
    fn draw(&self) { println!("□ s={}", self.s); }
}
// 泛型 + trait bound（静态分派）
fn render<T: Drawable>(item: T) {
    item.draw();   // 编译为 render_Circle / render_Square
}
// 静态分派：编译期决定调用哪个 draw
render(Circle { r: 1.0 });
render(Square { s: 2.0 });
```

**关键参数**：
- `trait Drawable { fn draw(&self); }`：行为契约
- `impl Drawable for Circle { ... }`：为类型实现 trait
- `T: Drawable` / `where T: Drawable`：trait bound 约束
- 单态化 = 编译期复制泛型为具体类型函数（0 抽象开销）
- 静态分派（generic）vs 动态分派（`dyn Trait` 虚函数表）
- 编译后二进制 = 多个具体函数，无泛型残留

**最佳实践**：默认 generic + 静态分派（性能最佳）；要"异构集合"（`Vec` 装不同类型）或"插件架构"才用 `dyn Trait`；不要为了"灵活"用 `Box<dyn Trait>` 包装一切（vtable 调用 + 堆分配开销）。

### 模式 3：Result / Option 显式错误处理

**问题场景**：C 返回 `int` 错误码易忽略；Java checked exception 啰嗦（try/catch 满屏）；Go `if err != nil` 满屏但忘了检查就静默失败。开发者想要"错误处理必须显式"。

**解决方案**：Rust 无 exception，所有错误显式——`Result<T, E>`（成功 `Ok(T)` / 失败 `Err(E)`）、`Option<T>`（有 `Some(T)` / 无 `None`）；`?` 运算符自动 propagate 错误；`match` 强制处理两个 case。

```rust
use std::fs::File;
use std::io::{self, Read};
// Result<T, E> 显式错误
fn read_file(path: &str) -> Result<String, io::Error> {
    let mut f = File::open(path)?;     // ? 自动 propagate io::Error
    let mut s = String::new();
    f.read_to_string(&mut s)?;
    Ok(s)
}
// Option<T> 表示可能缺失
fn first_word(s: &str) -> Option<&str> {
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        if b == b' ' { return Some(&s[..i]); }
    }
    None   // 没有空格 = 没"第一个词"
}
fn main() {
    match read_file("Cargo.toml") {
        Ok(s)  => println!("{}", s),
        Err(e) => eprintln!("err: {}", e),  // 必须处理
    }
    // ? 用法（main 也可 Result）
    let content = read_file("a.txt")?;
}
```

**关键参数**：
- `Result<T, E>::Ok(T)` / `Result<T, E>::Err(E)`
- `Option<T>::Some(T)` / `Option<T>::None`
- `?`：自动 propagate 错误（等价于 `match` + `return Err(...)`）
- `match` 强制穷尽：编译器警告未处理分支
- `unwrap()` / `expect("msg")`：仅 prototype / 测试用
- `anyhow!` / `thiserror` 库：简化错误类型定义
- `From` trait：自动转换错误类型（`io::Error` → `MyError`）

**最佳实践**：永远不在生产代码用 `unwrap()`（panic 崩溃）；用 `?` propagate 错误；自定义 error type（`thiserror` derive）；库作者用 `thiserror`，应用层用 `anyhow`；`expect("...")` 比 `unwrap()` 好（带说明的 panic 信息）。

### 模式 4：模式匹配穷尽性

**问题场景**：复杂的条件分支（type 检查、enum 状态）写一串 `if/else`，漏掉一个 case 编译器不提醒；运行时崩溃难以定位。

**解决方案**：`match` 强制穷尽（exhaustive）所有可能——加一个 `enum` variant 不更新 `match` 就编译错。`if let` / `while let` 简化单 case；`@` 绑定捕获匹配值。

```rust
enum Event {
    Click { x: i32, y: i32 },
    KeyPress(char),
    Quit,
}
fn handle(e: Event) {
    match e {
        Event::Click { x, y } if x > 0 && y > 0 => println!("click ({},{})", x, y),  // guard
        Event::Click { .. } => println!("click ignore"),                              // 任意
        Event::KeyPress('q') => std::process::exit(0),                                // 字面匹配
        Event::KeyPress(c)   => println!("key: {}", c),                               // 绑定
        Event::Quit          => println!("bye"),                                     // 必须列全
    }
}
let opt: Option<i32> = Some(5);
if let Some(x) = opt {                    // 单 case 简化
    println!("{}", x);
}
let mut stack = Vec::new();
stack.push(1);
while let Some(top) = stack.pop() {        // 循环匹配
    println!("{}", top);
}
```

**关键参数**：
- `match` 必须覆盖所有 case（否则编译错 `non-exhaustive patterns`）
- `if` guard：附加条件 `Some(x) if x > 0`
- `_` 通配忽略
- `..` 忽略剩余字段
- `if let Some(x) = opt` / `while let Some(x) = iter` 简化
- `@` 绑定：`Some(x @ 1..=10) => ...`

**最佳实践**：编译器警告 `non_exhaustive_xxx`，永远响应该警告（加 `_ => unreachable!()` 兜底）；enum variant 加新分支时编译器自动列出未处理位置；用 `if let` 减少 `match { _ => () }` 噪音。

### 模式 5：Cargo 一站式构建

**问题场景**：C/C++ 无统一包管理（CMake / Make 痛苦）；Node npm 有 lockfile 但生态质量参差；开发者想要"包管理 + 构建 + 测试 + 文档 + 跨平台"一站式。

**解决方案**：`cargo` 一站式——包管理 + 构建 + 测试 + 文档 + 跨平台编译。`Cargo.toml` 声明依赖，`Cargo.lock` 锁定版本；`cargo build / test / run / doc / publish` 命令一致。

```bash
# 快速开始
cargo new myapp                # 创建项目（默认 --bin）
cd myapp
cargo add serde --features derive    # 加依赖（自动改 Cargo.toml）
cargo build                        # 编译
cargo test                         # 跑测试
cargo run                          # 跑 binary
cargo doc --open                   # 生成并打开文档
cargo publish                      # 发到 crates.io
```

```toml
# Cargo.toml
[package]
name = "myapp"
version = "0.1.0"
edition = "2021"                    # Rust edition（2015/2018/2021/2024）

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }

[dev-dependencies]                  # 仅测试用
mockall = "0.11"

[build-dependencies]                # 仅 build.rs 用
cc = "1.0"

[profile.release]
lto = true                          # 链接时优化
codegen-units = 1                   # 减少并行（更优）
```

**关键参数**：
- `cargo new` / `cargo init` / `cargo add`
- `cargo build` / `cargo run` / `cargo test` / `cargo doc`
- `[dependencies]` / `[dev-dependencies]` / `[build-dependencies]`
- `cargo update` 更新 lockfile（保守/激进）
- `cargo build --release` 优化（debug assert 关闭）
- Workspaces：monorepo 共享 `Cargo.lock` + 依赖

**最佳实践**：应用项目**永远 commit `Cargo.lock`**（版本复现）；库项目忽略（用户决定版本）；用 `cargo update -p serde` 单包更新（避免全量跳版本）；CI 跑 `cargo build --locked` 校验 lockfile 一致。

---

## 第二段：类型系统与内存管理

### 模式 6：生命周期（Lifetimes）

**问题场景**：引用谁活得久？悬垂引用（dangling reference）编译期如何防？多个引用之间"谁先死"编译器怎么知道？

**解决方案**：生命周期标注 `'a` / `'static`，借用检查器追踪引用存活期——`'a` 是一段"引用存活范围"的占位符，编译器验证"返回的引用不会比传入的引用活更久"。

```rust
// 显式生命周期标注
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
// 生命周期省略（编译器自动推断常见情况）
fn first_word(s: &str) -> &str {       // 等价于 fn first_word<'a>(s: &'a str) -> &'a str
    s.split(' ').next().unwrap()
}
// 静态生命周期
let s: &'static str = "hello world";    // 字符串字面量 = 'static
// 结构体生命周期
struct ImportantExcerpt<'a> {
    part: &'a str,                      // 持有引用，必须标注
}
impl<'a> ImportantExcerpt<'a> {
    fn level(&self) -> i32 { 3 }
    fn announce_and_return_part(&self, announcement: &str) -> &str {
        println!("{}", announcement);
        self.part   // 省略规则：输入 &self + 输出 &str = 同生命周期
    }
}
```

**关键参数**：
- `'a` / `'b`：生命周期参数（泛型的一种）
- `'static`：整个程序生命周期（字符串字面量默认）
- 借用检查器：编译期验证"引用存活期"
- 生命周期省略规则：3 条（输入生命周期 → 输出生命周期自动推断）
- `Box::leak` 把 `'a` 转 `'static`（慎用）
- `'a: 'b` 表示 `'a` 至少活到 `'b`

**最佳实践**：90% 场景生命周期可省略（编译器自动）；遇到复杂引用关系看编译器提示"expected lifetime parameter"；不要用 `Box::leak` 绕开生命周期（破坏内存安全保证）。

### 模式 7：智能指针（Box / Rc / Arc / RefCell / Mutex）

**问题场景**：单一所有权不够用——共享所有权（多个变量持同一值）、内部可变性（不可变引用下修改）、跨线程共享；裸指针 `*const T` 不安全。

**解决方案**：5 类智能指针覆盖典型场景——`Box<T>`（堆分配+单所有权）、`Rc<T>`（单线程引用计数）、`Arc<T>`（跨线程 atomic 引用计数）、`RefCell<T>`（单线程内部可变性，运行时借用检查）、`Mutex<T>`（跨线程互斥锁）。

```rust
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::cell::RefCell;

// Box：堆分配 + 单所有权（递归类型 / 大数据转移）
let b = Box::new(5);
let five = *b;

// Rc：单线程共享所有权（图 / 共享配置）
let shared = Rc::new(String::from("hi"));
let c1 = Rc::clone(&shared);   // 引用计数 +1
let c2 = Rc::clone(&shared);
println!("{}", Rc::strong_count(&shared));  // 3

// RefCell：单线程内部可变性（编译期不变，运行时检查）
let cell = RefCell::new(5);
*cell.borrow_mut() += 1;                    // 运行时检查借用
println!("{}", cell.borrow());               // 6

// Arc<Mutex<T>>：跨线程共享可变（标准模式）
let counter = Arc::new(Mutex::new(0));
let mut handles = vec![];
for _ in 0..10 {
    let c = Arc::clone(&counter);
    handles.push(std::thread::spawn(move || {
        *c.lock().unwrap() += 1;             // 锁内修改
    }));
}
for h in handles { h.join().unwrap(); }
println!("{}", *counter.lock().unwrap());    // 10
```

**关键参数**：
- `Box::new(x)`：堆分配，单所有权
- `Rc::clone(&rc)`：引用计数 +1（不 deep clone）
- `Arc<Mutex<T>>`：跨线程共享可变（标准）
- `RefCell::borrow()` / `borrow_mut()`：运行时借用检查
- `Mutex::lock()` 返回 `LockResult<MutexGuard<T>>`
- 死锁风险：多锁按固定顺序获取；用 `parking_lot` 更快

**最佳实践**：`Arc<Mutex<T>>` 是跨线程共享可变标准模式；能用消息传递（`mpsc::channel` / `crossbeam_channel`）就避免共享状态；`RefCell` 仅限单线程（无 `Sync`）；大锁拆小锁减少竞争。

### 模式 8：trait 对象 vs 泛型（动态 vs 静态分派）

**问题场景**：需要"异构集合"（`Vec` 装不同类型，运行时才知道具体类型）；插件架构（用户上传任意类型）；generic 写不出"装什么都能调"。

**解决方案**：`&dyn Trait` / `Box<dyn Trait>` 是 trait 对象（胖指针：data ptr + vtable）；运行时虚函数表调用；和泛型（编译期单态化）互补。

```rust
trait Animal { fn speak(&self); }
struct Dog;
struct Cat;
impl Animal for Dog { fn speak(&self) { println!("woof"); } }
impl Animal for Cat { fn speak(&self) { println!("meow"); } }

// 泛型 = 静态分派（编译期单态化）
fn speak_static<T: Animal>(a: T) { a.speak(); }

// trait 对象 = 动态分派（运行时 vtable）
fn speak_dyn(a: &dyn Animal) { a.speak(); }

// 异构集合（generic 做不到）
let animals: Vec<Box<dyn Animal>> = vec![
    Box::new(Dog),
    Box::new(Cat),
];
for a in &animals {
    speak_dyn(a.as_ref());   // 运行时决定调 Dog::speak 还是 Cat::speak
}
```

**关键参数**：
- `&dyn Trait` / `Box<dyn Trait>`：trait 对象（胖指针 = data + vtable）
- 动态分派：vtable 间接调用（ns 级开销，可接受）
- 限制：不能 `dyn Clone`（除非 `trait Clone: Any`）
- 限制：不能 `dyn` 加泛型方法
- `impl Trait`（静态分派的语法糖）：`fn make() -> impl Animal`
- 对象安全（object safe）：方法不能带泛型、不能返回 `Self`

**最佳实践**：默认泛型 + 静态分派（0 开销）；需要"异构集合"或"插件架构"用 `dyn Trait`；`impl Trait` 返回类型是更好的静态分派语法糖；trait 设计时检查"是否 object safe"（决定能否 `dyn`）。

### 模式 9：宏系统（declarative + procedural）

**问题场景**：写大量样板代码（`println!`、JSON 序列化、ORM 映射、CLI 参数解析）；template/泛型搞不定（需要解析代码结构）。

**解决方案**：两套宏——声明宏 `macro_rules!`（模式匹配替换）、过程宏 `proc-macro`（编译期生成代码，`derive` / 自定义属性 / 函数宏）。过程宏在 `proc-macro = true` crate 中实现，编译期运行零运行时开销。

```rust
// derive 宏（最常用：自动实现 trait）
use serde::{Serialize, Deserialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct User { id: u64, name: String, email: String }

// 函数宏（应用层）
#[tokio::main]                          // 函数宏
async fn main() { /* ... */ }

#[test]                                 // 属性宏
fn test_add() { assert_eq!(2 + 2, 4); }

// macro_rules! 声明宏（用户自定义）
macro_rules! vec_of_strings {
    ($($x:expr),*) => {
        vec![$($x.to_string()),*]
    };
}
let v = vec_of_strings!["a", "b", "c"];  // Vec<String>
```

```rust
// 自定义 derive 宏（proc-macro crate 中）
// use proc_macro::TokenStream;
// #[proc_macro_derive(MyDerive)]
// pub fn my_derive(input: TokenStream) -> TokenStream {
//     // 解析 input，生成 impl MyTrait for Type { ... }
// }
```

**关键参数**：
- `#[derive(Debug, Clone)]`：自动实现 trait（最常用）
- `serde::Serialize` / `serde::Deserialize`：JSON 序列化
- `#[tokio::main]` / `#[test]` / `#[bench]`：属性宏
- `macro_rules!`：`($x:expr),*` 模式匹配 + 重复
- 过程宏在 `proc-macro = true` crate
- 编译期运行：零运行时开销（vs Python runtime 装饰器）

**最佳实践**：用现成 derive（`serde` / `thiserror` / `clap` / `derive_more`）覆盖 90% 场景；自定义宏小心，编译错误信息难懂；宏调试用 `cargo expand` 看展开后代码；不要用宏做"代码生成器"（template + generic 也能搞定）。

### 模式 10：闭包与函数式范式

**问题场景**：高阶函数（`map` / `filter` / `fold`）接收回调；闭包要捕获环境（let 变量）；如何"函数式"地处理集合？

**解决方案**：`Fn` / `FnMut` / `FnOnce` 三 trait 表达闭包捕获方式；迭代器 `Iterator` trait 链式调用（lazy）；闭包自动捕获（按引用 / 可变引用 / move）。

```rust
fn main() {
    let nums = vec![1, 2, 3, 4, 5];
    // 闭包 + 迭代器链
    let sum: i32 = nums.iter()
        .filter(|x| x % 2 == 0)              // 偶数
        .map(|x| x * x)                       // 平方
        .sum();
    println!("{}", sum);                      // 4 + 16 = 20

    // 捕获环境：move 闭包
    let threshold = 10;
    let big = nums.into_iter()
        .filter(move |&x| x > threshold)      // 捕获 threshold（Copy）
        .collect::<Vec<_>>();
    println!("{:?}", big);                    // []

    // FnOnce：消耗捕获的闭包
    let s = String::from("hi");
    let consume = move || { println!("{}", s); s.len() };
    consume();
    // consume();  // 编译错：FnOnce 只能调一次

    // 三 trait 选择
    // Fn：&self 调用，可多次
    // FnMut：&mut self 调用，可多次
    // FnOnce：consumes self，只能一次（move）
}
```

**关键参数**：
- `Fn`：不可变借用捕获，多次调用
- `FnMut`：可变借用捕获，多次调用
- `FnOnce`：获取所有权，一次调用
- 闭包自动推断捕获方式（最小权限）
- `move` 强制捕获所有权（线程间传闭包必需）
- 迭代器 `lazy`：`map` / `filter` 不立刻执行，`collect()` / `sum()` 才执行

**最佳实践**：闭包尽量用 `Fn`（最灵活，可被 `FnMut` / `FnOnce` 接受）；线程间传闭包必加 `move`；迭代器链比手写 `for` 循环更地道的 Rust；复杂组合用 `itertools` crate。

---

## 第三段：并发与零成本

### 模式 11：async/await + Tokio 协程

**问题场景**：高并发 IO（10k+ 连接）需要"非阻塞 + 轻量协程"；Go goroutine 是 8KB/个，百万连接爆内存；callback hell（Node 早期）难维护。

**解决方案**：`async/await` 编译为状态机（无栈协程），每个 task 几十字节。Tokio 是事实标准 runtime——`#[tokio::main]` 入口、`async fn` 异步函数、`tokio::spawn` 启动 task、`tokio::select!` 多路复用。

```rust
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    loop {
        let (mut socket, _) = listener.accept().await?;
        tokio::spawn(async move {
            let mut buf = [0; 1024];
            let n = socket.read(&mut buf).await?;
            socket.write_all(&buf[..n]).await?;   // echo
            Ok::<_, Box<dyn std::error::Error>>(())
        });
    }
}
// 多路复用
async fn race() {
    tokio::select! {                              // 类似 Go select
        _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => println!("timeout"),
        _ = some_future() => println!("done"),
    }
}
```

**关键参数**：
- `Future`：`poll(self, cx: &mut Context) -> Poll<T>` 状态机
- `async fn`：返回 `impl Future<Output = T>`
- `#[tokio::main]`：runtime 入口
- `tokio::spawn(future)`：启动 task（独立 task 句柄）
- `tokio::select!`：多路复用
- 异步 trait（Rust 1.75+）：`trait Foo { async fn bar(); }`
- `Send + Sync` trait：跨线程安全

**最佳实践**：IO 密集用 `async/await`；CPU 密集用 `rayon`（data parallelism）或 `std::thread`；不要在 async 上下文调阻塞 IO（`std::fs::read` 阻塞整个 worker），改用 `tokio::fs`；runtime 选一个（Tokio / async-std / smol）。

### 模式 12：Send + Sync 标记 trait 跨线程安全

**问题场景**：跨线程传值，编译器怎么知道安全？哪些类型"天然线程安全"？手动锁用户怎么发现漏锁？

**解决方案**：`Send` 表示"所有权可在线程间转移"；`Sync` 表示"引用可在线程间共享（&T 是 Send）"。`Rc<T>` 不 `Send`（非 atomic 引用计数）；`Mutex<T>` 是 `Send + Sync`（内部锁保护）。编译期阻止数据竞争。

```rust
use std::rc::Rc;
use std::sync::Arc;
use std::thread;

// Rc 非 Send：跨线程会编译错
let rc = Rc::new(5);
thread::spawn(move || {
    println!("{}", rc);   // 编译错：Rc<i32> cannot be sent between threads safely
});

// Arc 是 Send：跨线程 OK
let arc = Arc::new(5);
let arc2 = arc.clone();
thread::spawn(move || {
    println!("{}", arc2);
});

// 自动派生规则：
//   - 基础类型（i32 / bool）：Send + Sync
//   - 复合类型：所有字段都 Send + Sync → 整体 Send + Sync
//   - 裸指针 *const T：!Send + !Sync
//   - Rc<T>：!Send + !Sync
//   - Mutex<T>：Send + Sync（T: Send）
fn assert_send<T: Send>() {}
fn assert_sync<T: Sync>() {}
assert_send::<i32>();
assert_sync::<String>();
```

**关键参数**：
- `Send`：所有权可跨线程转移（move 语义）
- `Sync`：`&T` 可跨线程共享（不可变引用可共享）
- 关系：`T: Sync` ⟺ `&T: Send`
- 自动派生：字段全 `Send` → 整体 `Send`
- 标记 trait：零运行时开销（仅编译期）
- `PhantomData<T>` 控制"假装持有 T"以影响 Send/Sync 派生

**最佳实践**：用 `Arc<T>` 跨线程共享（`Rc<T>` 仅限单线程）；自定义类型编译错 `cannot be sent` 时检查是否误用 `Rc` / 裸指针；`Mutex<T>` 是 `Send`（即使 T 不是 Sync）；想"不可跨线程"用 `PhantomData<*const T>` 标记。

### 模式 13：模块系统 + 可见性

**问题场景**：代码组织（避免单文件 1 万行）；可见性控制（哪些 fn 公开、哪些内部）；命名空间冲突（两个 crate 同名 type）。

**解决方案**：`mod` 声明模块（文件/目录）；`pub` / `pub(crate)` / `pub(super)` / `pub(in path)` 控制可见性；`use` 引入路径（绝对 `crate::` / `super::` / 相对）；`pub use` 重导出。

```rust
// src/lib.rs
mod front_of_house {                              // 嵌套模块
    pub mod hosting {
        pub fn add_to_waitlist() {}
        fn seat_at_table() {}                     // 私有（crate 内可见）
    }
    mod serving {                                  // 私有模块
        fn take_order() {}
    }
}
mod back_of_house {
    pub struct Breakfast {                          // struct 公开
        pub toast: String,                          // 字段公开
        seasonal_fruit: String,                     // 字段私有
    }
    pub enum Appetizer {                            // enum 公开 → 所有 variant 公开
        Soup, Salad,
    }
}
pub fn eat_at_restaurant() {
    crate::front_of_house::hosting::add_to_waitlist();
    let mut meal = back_of_house::Breakfast::new();
    meal.toast = String::from("Wheat");
    // meal.seasonal_fruit  // 编译错：私有字段
}
```

**关键参数**：
- `mod foo;`：声明模块（找 `foo.rs` 或 `foo/mod.rs`）
- `pub fn` / `pub struct` / `pub enum`：可见性
- `pub(crate)`：crate 内可见
- `pub(super)`：父模块可见
- `pub use foo::bar`：重导出（让外部用更短路径）
- `use crate::front_of_house::hosting;`：绝对路径
- `use super::*;`：相对路径

**最佳实践**：默认 fn 私有，加 `pub` 时再思考"是否真要公开"；用 `pub(crate)` 暴露给 crate 内（同 crate 的二进制 + 库共享）；用 `pub use` 在 `lib.rs` 顶部组织"对外 API 平面化"（用户不用记深层路径）。

### 模式 14：测试体系（单元 + 集成 + Doc）

**问题场景**：写代码容易、改代码慌——怕破坏现有功能；测试覆盖率难统计；CI 怎么保证不回归？

**解决方案**：`cargo test` 一键跑三种测试——单元测试（`#[test]` mod 内）、集成测试（`tests/` 目录，黑盒）、文档测试（`///` 注释里的代码块，可执行）。`assert_eq!` / `assert!` 断言；`#[should_panic]` 测 panic。

```rust
// 1. 单元测试（同文件内）
pub fn add(a: i32, b: i32) -> i32 { a + b }
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_add() { assert_eq!(add(2, 3), 5); }
    #[test]
    #[should_panic]
    fn test_panic() { panic!("boom"); }
}

// 2. 集成测试（tests/integration.rs，黑盒）
// use my_crate::add;
// #[test] fn integration_add() { assert_eq!(add(2, 3), 5); }

// 3. Doc test（/// 注释里的代码，cargo test 自动跑）
/// Add two numbers.
///
/// ```
/// use my_crate::add;
/// assert_eq!(add(2, 3), 5);
/// ```
pub fn add(a: i32, b: i32) -> i32 { a + b }
```

```bash
# 跑测试
cargo test                       # 全部（unit + integration + doc）
cargo test --lib                 # 仅单元
cargo test --test integration    # 仅 integration
cargo test --doc                 # 仅 doc
cargo test test_add              # 仅匹配名
cargo test -- --nocapture        # 显示 println! 输出
```

**关键参数**：
- `#[test]`：标记测试函数
- `#[cfg(test)]`：仅测试编译
- `assert!` / `assert_eq!` / `assert_ne!` 宏
- `#[should_panic(expected = "msg")]`：测 panic
- `#[ignore]`：跳过（`cargo test -- --ignored` 单独跑）
- Doc test：`///` 注释里 ``` 代码块
- 覆盖率：`cargo install cargo-tarpaulin` + `cargo tarpaulin`

**最佳实践**：单元测试放同文件 `#[cfg(test)] mod tests`（可访问私有 fn）；集成测试放 `tests/` 目录（黑盒，模拟外部用户）；Doc test 必加（用户看文档时跑）；CI 跑 `cargo test --all` + `cargo clippy -- -D warnings`。

### 模式 15：Benchmark + Profiling

**问题场景**：性能优化靠猜？重构不知道快还是慢？哪里是 hot path？

**解决方案**：`cargo bench`（Rust nightly，稳定用 `criterion`）+ `cargo flamegraph`（火焰图）+ `perf`（Linux 采样）。Benchmark 测吞吐量 / 延迟，profiling 找热点。

```rust
// 1. criterion（稳定 Rust，第三方 crate）
// Cargo.toml: dev-dependencies: criterion = "0.5"
// benches/add.rs:
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use my_crate::add;
fn bench_add(c: &mut Criterion) {
    c.bench_function("add 2+3", |b| b.iter(|| add(black_box(2), black_box(3))));
}
criterion_group!(benches, bench_add);
criterion_main!(benches);
```

```bash
# 跑 benchmark
cargo bench
# 火焰图（找热点）
cargo install flamegraph
cargo flamegraph --bin myapp
# Linux perf（更细粒度）
perf record -F 99 -g ./target/release/myapp
perf report
```

**关键参数**：
- `cargo bench`（nightly 内置；稳定用 `criterion`）
- `criterion`：`benches/` 目录 + 统计显著
- `cargo flamegraph`：生成 `flamegraph.svg`
- `perf record -F 99 -g`：Linux 采样（99Hz，call graph）
- `cargo build --release` 必须（debug 编译优化关闭）
- `black_box()` 防止编译器优化掉基准

**最佳实践**：所有"性能敏感"代码加 `criterion` benchmark；改前后跑一遍对比（`--save-baseline` / `--baseline`）；用 `cargo flamegraph` 找热点（不要凭直觉优化）；`cargo build --release` 测性能（debug 模式 10-100x 慢）。

---

## 第四段：生态与工程实践

### 模式 16：FFI 与 unsafe 边界

**问题场景**：Rust 生态不如 C 丰富（有些库只有 C 实现）；想用 OpenSSL / SQLite / 系统调用；Rust 怎么"安全地"调 C 代码？

**解决方案**：`extern "C"` 声明 C 函数；`unsafe` 块包危险操作（裸指针解引用、FFI 调用）；`bindgen` 自动生成绑定（读 `.h` 头文件）；最小化 `unsafe` 边界（封装成安全 API）。

```rust
// 1. 声明外部 C 函数
extern "C" {
    fn abs(input: i32) -> i32;
    fn printf(format: *const u8, ...) -> i32;
}
// 2. 标 C 函数给 C 调
#[no_mangle]
pub extern "C" fn rust_add(a: i32, b: i32) -> i32 {
    a + b
}
// 3. unsafe 块（必须包）
unsafe fn dangerous() {
    let p: *const i32 = std::ptr::null();
    // *p;  // 编译错：裸指针解引用需要 unsafe
    // println!("{}", *p);  // 在 unsafe 块里 OK（行为未定义）
}
// 4. 安全封装
fn safe_dangerous() -> Option<i32> {
    unsafe {
        let p: *const i32 = std::ptr::null();
        if p.is_null() { None } else { Some(*p) }
    }
}
```

**关键参数**：
- `extern "C" { fn foo(); }`：声明外部 C 函数
- `#[no_mangle]` + `pub extern "C"`：暴露给 C 调
- `unsafe { ... }`：裸指针解引用 / FFI / `transmute` / 调 `unsafe fn`
- `bindgen` crate：自动从 `.h` 生成 Rust 绑定
- `#[link = "..."]` 链接 C 库
- 安全抽象：unsafe 代码包成安全 API（`Vec` / `String` / `Box`）

**最佳实践**：最小化 `unsafe` 范围（一行就一行，函数就一个函数）；`unsafe` 必加注释说明"为什么这里安全"；用 `bindgen` 自动化 C 绑定；封装 unsafe 成 safe API（不让用户碰裸指针）；用 `cargo-geiger` 统计 unsafe 用量。

### 模式 17：Iterator 与零成本抽象

**问题场景**：手写 `for` 循环繁琐；集合操作（map / filter / fold）想"链式表达"；性能要和手写循环一样。

**解决方案**：`Iterator` trait + 50+ 适配器（`map` / `filter` / `take` / `skip` / `fold` / `collect` / `sum`）形成"lazy pipeline"——`map` / `filter` 不立刻执行，`collect()` / `sum()` 才触发。零成本抽象（编译后等价手写循环）。

```rust
fn main() {
    let nums = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // 链式 + lazy + 零成本
    let result: Vec<i32> = nums.iter()
        .filter(|&&x| x % 2 == 0)        // 偶数
        .map(|&x| x * x)                  // 平方
        .take(3)                          // 取前 3
        .collect();
    println!("{:?}", result);             // [4, 16, 36]

    // fold 累加
    let sum = nums.iter().fold(0, |acc, x| acc + x);

    // 自定义迭代器（实现 Iterator trait）
    struct Counter { i: u32 }
    impl Iterator for Counter {
        type Item = u32;
        fn next(&mut self) -> Option<u32> {
            self.i += 1;
            if self.i < 6 { Some(self.i) } else { None }
        }
    }
    let c: Vec<u32> = Counter { i: 0 }.collect();
    println!("{:?}", c);                   // [1, 2, 3, 4, 5]
}
```

**关键参数**：
- `Iterator` trait：`next(&mut self) -> Option<Item>`
- 适配器：`map` / `filter` / `take` / `skip` / `enumerate` / `zip`
- 消费器：`collect` / `sum` / `fold` / `count` / `for_each`
- `lazy`：链式调用不执行，`collect()` 触发
- 零成本：编译后等价 `for` 循环
- `iter()` / `iter_mut()` / `into_iter()` 三种借用模式

**最佳实践**：用迭代器链代替手写 `for`（更地道、更短、更安全）；自定义数据结构实现 `Iterator` trait 复用整个生态；需要 `&` 用 `iter()`，要所有权用 `into_iter()`，要 `&mut` 用 `iter_mut()`；用 `itertools` crate 扩展（`unique` / `join` / `sorted`）。

### 模式 18：Web 生态（actix / axum）

**问题场景**：用 Rust 做 Web 服务（HTTP API / 微服务）；Java Spring 太重、Node Express 性能差、Go 中规中矩；想要"高吞吐 + 类型安全"。

**解决方案**：`actix-web` / `axum`（基于 hyper + tokio）是主流 Web 框架——axum 由 Tokio 团队维护（tokio-rs 官方），`Router` + `Handler` 模式；类型安全（编译期检查路径参数 / body 类型）；`tower` 中间件生态。

```rust
use axum::{routing::get, Router, Json, extract::Path};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct User { id: u64, name: String }

async fn hello() -> &'static str { "Hello, World!" }

async fn get_user(Path(id): Path<u64>) -> Json<User> {
    Json(User { id, name: "Alice".into() })
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(hello))
        .route("/user/:id", get(get_user));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

**关键参数**：
- `Router::new().route(path, get(handler))`：路由
- `Path<T>`：路径参数（自动解析）
- `Json<T>`：JSON body / 响应（自动序列化）
- `#[tokio::main]`：async runtime 入口
- `tower` 中间件：超时 / 限流 / tracing / 压缩
- 类型安全：`Path(u64)` 自动校验（不匹配返回 400）
- 性能：actix-web 长期霸榜 TechEmpower 基准

**最佳实践**：新项目选 `axum`（Tokio 官方，生态一致）；用 `serde` + `Json<T>` 序列化；用 `tower-http` 加 `TraceLayer`（tracing） / `TimeoutLayer` / `CorsLayer`；生产用 `tokio::main(flavor = "multi_thread")` 充分利用多核。

### 模式 19：嵌入式与 no_std

**问题场景**：嵌入式设备（MCU 256KB RAM）跑不了 std；OS 内核开发要直接控制硬件；想做"bare metal" Rust。

**解决方案**：`#![no_std]` 禁用 std（仅保留 `core` + `alloc` 可选）；`core` crate 是 `no_std` 基础（无堆分配）；`alloc` 加堆（`Vec` / `String`）；嵌入式 HAL 框架（`embedded-hal`）。

```rust
// src/main.rs（嵌入式）
#![no_std]
#![no_main]

use panic_halt as _;       // panic = halt
use cortex_m_rt::entry;
use cortex_m::peripheral::Peripherals;

#[entry]
fn main() -> ! {
    let p = Peripherals::take().unwrap();
    // 配置 GPIO / 定时器 / UART ...
    let mut led = p.PB0.into_push_pull_output();  // 假设 HAL 提供
    loop {
        led.set_high().unwrap();
        cortex_m::asm::delay(10_000_000);
        led.set_low().unwrap();
        cortex_m::asm::delay(10_000_000);
    }
}
```

**关键参数**：
- `#![no_std]`：禁用 std
- `core`：无堆基础（`memcpy` / `fmt` / `iter`）
- `alloc`：加堆（`Vec` / `String` / `Box`）
- `cortex-m-rt`：Cortex-M 启动 + `#[entry]`
- `embedded-hal`：硬件抽象 trait（`OutputPin` / `InputPin`）
- `panic-halt` / `panic-semihosting`：panic 策略
- 工具链：`rustup target add thumbv7em-none-eabihf`

**最佳实践**：嵌入式新项目用 `cortex-m-quickstart` 模板起步；用 `embedded-hal` trait 写"可移植"驱动（换芯片不改应用代码）；用 `defmt` 日志（比 RTT 更快 + 格式化）；生产固件 `panic-halt` + 看门狗复位。

### 模式 20：Rust 生态与学习路径

**问题场景**：Rust 学习曲线陡（所有权、生命周期、trait）；新项目怎么选框架？哪些 crate 是"必学"？如何从 Java/Go 迁过来？

**解决方案**：分层学习 + 必知 crate 列表——基础（`std` / `serde` / `tokio` / `clap`）、Web（`axum` / `sqlx` / `diesel`）、系统（`clap` / `anyhow` / `tracing` / `config`）、GUI（`egui` / `iced`）。

```toml
# 必学 10 大 crate
[dependencies]
serde = { version = "1", features = ["derive"] }   # 序列化
tokio = { version = "1", features = ["full"] }     # 异步 runtime
anyhow = "1"                                       # 错误处理（应用层）
thiserror = "1"                                    # 错误处理（库层）
clap = { version = "4", features = ["derive"] }    # CLI 参数解析
tracing = "0.1"                                    # 结构化日志
tracing-subscriber = "0.3"                         # tracing 后端
axum = "0.7"                                       # Web 框架
reqwest = { version = "0.12", features = ["json"] } # HTTP 客户端
sqlx = { version = "0.8", features = ["postgres", "runtime-tokio-rustls"] }  # 异步 SQL
```

**关键参数**：
- 学习路径：`The Book` → `Rust by Example` → `std docs` → `tokio` → `axum`
- 必读：`The Rust Programming Language`（官方书）
- 练习：`Rustlings`（小练习集，5-10 小时）
- 编译器：`rustup` 装多工具链（`stable` / `nightly`）
- IDE：rust-analyzer（VSCode 插件）
- 工具：`cargo` / `clippy`（lint）/ `rustfmt`（格式化）

**最佳实践**：从 `The Book` + `Rustlings` 起步（不要直接看 advanced）；用 `rust-analyzer` 提升 IDE 体验（不是 vscode 内置）；clippy 是"隐式最佳实践"——所有警告先想再 `#[allow]`；用 `cargo fmt --check` CI 保证格式；新项目直接 `cargo new --bin` 起步，加 `.gitignore` + `README.md`。

---

## 附录：5 段必读代码

1. `core/src/lib.rs` — `core` crate 入口（`no_std` 基础 + intrinsics）
2. `compiler/rustc_passes/src/borrowck.rs` — 借用检查器（编译期内存安全核心）
3. `library/std/src/sync/mutex.rs` — `Mutex<T>` 实现（锁 + poison）
4. `library/std/src/collections/hash/map.rs` — `HashMap<K, V>` 实现（hash + robin_hood）
5. `library/core/src/iter/traits/iterator.rs` — `Iterator` trait 定义（零成本迭代器链基础）

## 一句话总结

rust = 所有权 + 借用（编译期内存安全）+ trait + generic（零成本抽象）+ Result / Option（显式错误）+ Cargo 一站式 + async/await（无栈协程）+ 智能指针（Box / Rc / Arc / Mutex）+ 宏系统（derive 自动化）+ 严格 Send/Sync（编译期防数据竞争），把"系统编程"做到 Java 的安全 + C 的性能 + Haskell 的表达力，最值得偷的是"用类型系统约束运行时行为"——所有权 / 借用 / 生命周期 / Send/Sync 全是编译期规则，让运行时崩溃变成编译错误。
