# bat - 长着翅膀的 cat（语法高亮 + Git 集成 + 分页）

**GitHub**: sharkdp/bat
**Star**: 55k+
**语言**: Rust
**主题**: CLI 工具 / 语法高亮 / cat 替代 / syntect
**适用场景**: cat 替代、代码检视、man page 阅读、Git diff 着色

## 第一段：基础范式

### 模式 1：双 crate 单目录布局（lib + binary）

**问题场景**：CLI 工具常用作"工具"——但社区有需求"bat 暴露为 Rust 库"（如 delta / tokei 类 fork）。单 binary 形态无法复用。

**解决方案**：用 `src/lib.rs` 暴露库 API + `src/bin/bat/` 暴露 binary，共享业务代码：
```toml
# Cargo.toml
[features]
default = ["application", "git"]
minimal-application = []  # 仅 lib，无 CLI
```

**关键参数**：
- `src/bin/bat/main.rs`——binary 入口
- `src/lib.rs`——库 API 入口
- `pretty_printer.rs`——`PrettyPrinter` builder 风格
- 业务逻辑共享——Controller / Printer / Assets
- `examples/`——库 API demo

**最佳实践**：CLI 工具双形态——`lib + bin` 一份代码；`feature flag` 切换——`minimal-application`；`examples/` 演示库用法——下游 fork 参考。

---

### 模式 2：Controller 编排模式 + 瘦 Controller 原则

**问题场景**：CLI 工具入口写太多逻辑——单测困难、库复用难。

**解决方案**：bat 走"瘦 Controller"——Controller 只做"打开输入 → 构造 Printer → 写头/体/尾 → 写分页"四步：
```rust
// controller.rs:39-249
pub fn run(inputs, output_handle) {
  let printer = if self.config.loop_through { SimplePrinter } else { InteractivePrinter };
  // 打开 inputs + 构造 printer + 写头/体/尾 + 写分页
}
```

**关键参数**：
- `Controller::run(inputs, output_handle)` 入口
- 内部选择 Printer——`if config.loop_through` 分支
- 写头（header）/ 体（body）/ 尾（footer）
- 写分页（pager）
- 单测不必走完整 CLI

**最佳实践**：CLI 入口走瘦 Controller——业务逻辑放模块；`Controller::run` 接受标准输入——可测试；`if` 分支放 Controller——避免每 Printer 自决策。

---

### 模式 3：HighlightingAssets 懒加载 syntax 集

**问题场景**：350+ Sublime 语法原始 YAML 约 8MB——如果启动期全 parse 慢 30-50 倍；用户只用了 1-2 个语言，浪费 99% 加载。

**解决方案**：编译期 `syntect::dumps::dump_binary` 序列化进 `syntaxes.bin`（1.5MB），运行时 `OnceCell<SyntaxSet>` 懒反序列化：
```rust
pub struct HighlightingAssets {
  serialized_syntax_set: SerializedSyntaxSet,
  syntax_set: OnceCell<SyntaxSet>,
  // ...
}
impl HighlightingAssets {
  pub fn get_syntax_set(&self) -> &SyntaxSet {
    self.syntax_set.get_or_init(|| bincode::deserialize(&self.serialized_syntax_set))
  }
}
```

**关键参数**：
- `OnceCell<SyntaxSet>`——只解一次，多次复用
- `SerializedSyntaxSet` 编译期序列化
- `bincode` 反序列化快 30-50 倍
- 体积 8MB → 1.5MB
- 资产 build.rs 打包进二进制

**最佳实践**：大型资产用 `OnceCell` 懒加载——冷启动快；编译期序列化——运行时零成本；`bincode` 比 YAML 快 30-50x——用二进制格式。

---

### 模式 4：themes 二次拆分 LazyThemeSet 按需 inflate

**问题场景**：20+ theme 全部 inflate 进内存约 200KB——用户即使切 100 次 theme 也只用 1-2 个。

**解决方案**：`LazyThemeSet` 单打包——`get_theme("Dracula")` 时才 inflate 那个：
```rust
// assets.rs:54-58
COMPRESS_LAZY_THEMES = true  // 40kB vs 200kB
pub fn get_theme(&self, name: &str) -> Option<Theme> {
  // 单独 inflate 单 theme
}
```

**关键参数**：
- 三档压缩策略——`SYNTAXES / THEMES / LAZY_THEMES`
- 懒加载 theme——只 inflate 实际用的
- 元信息预加载——`get_theme_set()` 一次
- 注释明示"compress twice just makes performance suffer"
- 冷启动 < 50ms

**最佳实践**：可选资产用 Lazy——按需 inflate；元信息预加载——`get_theme_set()` 一次；二次压缩要测性能——有时反劣化。

---

### 模式 5：双 Printer 抽象（InteractivePrinter + SimplePrinter）

**问题场景**：`bat` 命令要支持 `bat`（带 header / 装饰 / pager）和 `bat -p`（裸 cat 输出到管道）——两种输出要求大相径庭。

**解决方案**：`trait Printer` + `InteractivePrinter`（高亮 / grid / header）+ `SimplePrinter`（裸输出）：
```rust
pub trait Printer { /* 抽象 */ }
impl Printer for InteractivePrinter { /* 带装饰 */ }
impl Printer for SimplePrinter { /* 裸 cat */ }
// controller.rs:192-202
let printer: Box<dyn Printer> = if config.loop_through { SimplePrinter } else { InteractivePrinter };
```

**关键参数**：
- `trait Printer` 抽象——双形态
- `loop_through = true` → SimplePrinter——`bat -p`
- 默认 InteractivePrinter——`bat`
- `bat > out.txt` 强制 SimplePrinter——剥掉所有装饰
- Box dyn 动态分发

**最佳实践**：多形态输出走 trait——避免 if/else 散落；`Box<dyn Printer>` 动态分发——单入口；行为分离——SimplePrinter 不实现装饰方法。

---

## 第二段：扩展范式

### 模式 6：build.rs 模板渲染生成 man page + completions

**问题场景**：CLI 工具的 man page + shell completions 难维护——手写一份错过 clap 变更。

**解决方案**：`build/application.rs` 编译期模板渲染——man page / bash / zsh / fish / powershell 一次性生成：
```rust
// build/main.rs + application.rs
fn main() {
  let app = build_clap_app();
  generate_man_page(&app, "bat.1");
  generate_completions(&app, "bash", "bat.bash");
  generate_completions(&app, "zsh", "_bat");
  // ...
}
```

**关键参数**：
- 编译期运行 build.rs
- 模板渲染——clap 提取 help 文本
- 多 shell 支持——bash / zsh / fish / powershell
- man page 1 章节
- 一次跑通所有平台

**最佳实践**：CLI 工具用 clap + build.rs——自动生成文档；模板渲染一致——避免手写漏改；多 shell completions 必加——用户体验。

---

### 模式 7：CLI args > BAT_OPTS env > config 文件优先级

**问题场景**：用户配置方式 3 种——CLI 参数 / 环境变量 / 配置文件。优先级混乱导致行为不可预测。

**解决方案**：严格三级优先级 + 显式 `--no-config` 跳过：
```rust
// 配置优先级
let config = parse_cli()  // 最高
  .merge(parse_env("BAT_OPTS"))
  .merge(parse_file("~/.config/bat/config"))
  .apply_no_config_flag();
```

**关键参数**：
- 三级优先级——`CLI > ENV > FILE`
- `BAT_OPTS` env 透传 CLI args
- `BAT_THEME / BAT_PAGER` env 单字段
- `NO_COLOR` 标准 env
- `bat --no-config` 跳过文件

**最佳实践**：配置优先级 3 级——`CLI > ENV > FILE` 固定；环境变量约定大写——`BAT_THEME`；`NO_COLOR` 标准 env——遵循生态；`--no-config` 跳过——调试友好。

---

### 模式 8：STDOUT 智能探测 + 内部 minus pager

**问题场景**：输出到 terminal 时希望走 pager（less）；输出到文件/管道时不走 pager。

**解决方案**：探测 stdout 是否 TTY——TTY 走 pager，非 TTY 走裸输出：
```rust
let output_type = if atty::is(Stream::Stdout) { Pager } else { Stdout };
match output_type {
  Pager => minus::Pager::new(...).run(),
  Stdout => fmt::write(...),
}
```

**关键参数**：
- `atty::is(Stream::Stdout)` 探测
- TTY → 内置 `minus::Pager` 或外部 `less`
- 非 TTY → `fmt::Write` 裸输出
- `PagingMode::Always/Never/Auto` 显式控制
- v0.22 引入 lessopen 钩子

**最佳实践**：CLI 输出探测 TTY——智能分支；`minus` 内置 pager——不依赖外部 less；`--paging always/never/auto` 显式控制；less 退化兼容老系统。

---

### 模式 9：content_inspector 自动检测 binary vs text

**问题场景**：用户 `bat some-file`——文件可能是 binary、图片、压缩包——误显示成乱码。

**解决方案**：`content_inspector` 库检测——binary 文件拒绝高亮（输出原始 binary 内容 + 警告）：
```rust
let inspector = ContentInspector::new();
let result = inspector.inspect(bytes);
if result.is_binary() { /* 警告 + 不高亮 */ }
```

**关键参数**：
- `content_inspector` crate
- binary 检测——高比例不可打印字符
- `is_binary()` 决策
- 高亮前过滤
- 性能好——O(n) 扫一遍

**最佳实践**：CLI 处理文件必加 binary 检测——避免乱码；`content_inspector` 是行业标准；不高亮 + 警告——用户体验。

---

### 模式 10：LineRange DSL 区间解析

**问题场景**：`bat -r 10:20 file` 要解析"10 到 20 行"——但还有 `1:5,15:20,30:` 这种多区间格式。

**解决方案**：`line_range.rs` 769 行 DSL 解析——支持 `1:5` / `1:` / `:5` / `1` / 多区间逗号分隔：
```rust
let ranges = LineRange::parse("1:5,15:20,30:")?;
// 返回 [(1,5), (15,20), (30, usize::MAX)]
```

**关键参数**：
- 769 行 DSL——边界 case 多
- 多区间——逗号分隔
- 开区间 / 闭区间 / 单点
- usize::MAX 表示无限
- 错误信息友好

**最佳实践**：DSL 解析拆独立模块——避免 1000 行混 main；多区间支持——贴近 sed / awk；错误信息友好——用户易调试。

---

## 第三段：进阶范式

### 模式 11：asset 分发 ADR 选 A（编译期内嵌）

**问题场景**：CLI 工具的资产分发——编译期内嵌 8MB vs 运行时下载？

**解决方案**：选 A 编译期内嵌——离线可用 + 单文件部署：
| ADR | 选项 A | 选项 B | 选定 | 理由 |
|---|---|---|---|---|
| 资产分发 | 编译期内嵌 | 运行时下载 | A | 离线可用 + 单文件部署 |

**关键参数**：
- 8MB 内嵌到二进制——可接受
- 离线场景——`bat` 在飞机 / 无网环境能用
- 单文件部署——`brew install bat` 一条命令
- 反面：二进制大——但用户场景可接受

**最佳实践**：CLI 资产编译期内嵌——离线场景优先；体积 8MB 可接受——单文件部署胜出；运行时下载是次选——有网场景可用。

---

### 模式 12：CLI 解析 clap 而非自写

**问题场景**：CLI 参数解析——自写繁琐、错误信息不友好。

**解决方案**：用 `clap` 库——`hide_possible_values` + `wrap_help` 体感好：
```rust
// clap_app.rs 786 行
let app = Command::new("bat")
  .arg(Arg::new("color").long("color").value_name("when").hide_possible_values(true))
  .arg(Arg::new("language").long("language").value_name("language"));
```

**关键参数**：
- `clap` derive 或 builder 风格
- 786 行 clap 定义
- `hide_possible_values`——隐藏过技术选项
- `wrap_help`——多行换行
- 错误信息友好

**最佳实践**：CLI 解析用 clap——行业标准；`hide_possible_values` 改善 UX——不暴露过技术选项；`wrap_help` 多行——长 help 美观；786 行不算多——clap 复杂场景正常。

---

### 模式 13：Git 集成 libgit2 + feature flag 解耦

**问题场景**：Git 集成（`bat --diff` / `bat show`）需要 libgit2——但有人不想带这个依赖（10MB+ 二进制变大）。

**解决方案**：libgit2 走 feature flag——`default = ["application", "git"]`，可关 `git`：
```toml
[features]
git = ["libgit2-sys"]
default = ["application", "git"]
```

**关键参数**：
- `libgit2` 子进程 vs 库调用——选库
- 与 Process 调用解耦
- 可关 feature——体积下降 10MB
- `bat --diff` / `bat show` 走 libgit2
- 老 git binary fallback

**最佳实践**：大依赖用 feature flag——可关；`libgit2` 比子进程更可控；`--diff` / `show` 子命令——走 git 集成；默认开启——常用功能。

---

### 模式 14：less.rs 132 行版本探测 + 兼容

**问题场景**：`bat --pager less` 调用外部 less——不同系统 less 版本（437 / 590）功能差异大。

**解决方案**：`less.rs` 132 行版本探测——检测 `less --version` 输出，适配不同版本特性：
```rust
let less_version = parse_less_version("less --version");
// 不同版本走不同路径
```

**关键参数**：
- 132 行版本探测
- 解析 `less --version` 输出
- 437 / 590 / 600+ 不同分支
- 特性检测——`--RAW-CONTROL-CHARS` 等
- 跨 Unix 兼容

**最佳实践**：依赖外部工具必加版本探测——`--version` 解析；`less -R` 支持 ANSI——必备探测；特性检测优先版本号——更稳。

---

### 模式 15：nu-ansi-term 平台无关 ANSI 序列

**问题场景**：ANSI 颜色序列跨平台差异——Windows cmd 不支持 `\x1b[31m`。

**解决方案**：`nu-ansi-term` 库做平台无关 ANSI——Windows 自动转 Win32 API：
```rust
use nu_ansi_term::Color::Red;
println!("{}", Red.paint("error"));
```

**关键参数**：
- `nu-ansi-term`——`colored` 库的 fork
- 平台检测——Windows 转 Win32
- `Color::Red.paint("text")` 链式
- `Style::new().fg(Red).bold()`
- 跨平台一致

**最佳实践**：跨平台 CLI 必用 ANSI 库——不直接写 `\x1b[31m`；`nu-ansi-term` 是 colored 维护分支；`Color::X.paint()` 链式更优雅；测试覆盖 Windows。

---

## 第四段：实战范式

### 模式 16：tests/snapshots insta 风格 golden file

**问题场景**：CLI 输出测试——断言完整输出太脆弱；regex 匹配又不够精确。

**解决方案**：`insta` crate snapshot 测试——首次跑生成 `.snap` golden file，二次跑 diff：
```rust
// tests/integration_tests.rs
insta::assert_snapshot!(bat_command("tests/examples/foo.rs"));
```

**关键参数**：
- `insta` crate
- `assert_snapshot!` 宏
- 首次生成 `.snap` 文件
- 二次跑 diff
- `cargo insta review` 手动接受
- CI 自动 fail

**最佳实践**：CLI 输出测试用 insta——golden file 行业标准；首次跑生成 baseline——CI 跑比对；`cargo insta review` 工具——开发友好；`assert_snapshot!` 宏——简洁。

---

### 模式 17：tests/syntax-tests 100+ 语言独立测试

**问题场景**：高亮引擎要测 100+ 语言——每个语言独立 sample + 期望 output。

**解决方案**：`tests/syntax-tests/` 目录——每个语言一个子目录，sample code + 期望高亮：
```
tests/syntax-tests/
  rust/
    basic.rs
    async.rs
  python/
    basic.py
    async.py
  // ...
```

**关键参数**：
- 100+ 语言子目录
- 每个子目录 2-5 个 sample
- sample code 简洁
- 期望高亮由 syntect baseline
- 独立 CI 跑通

**最佳实践**：高亮测试按语言分目录——独立运行；sample code 简洁——10-50 行最佳；期望 baseline 自动生成——首次跑定基。

---

### 模式 18：bugreport 子命令 + 调试信息收集

**问题场景**：用户报 bug——`bat --version` / 系统信息 / 配置 / 语法 asset 版本等要用户手动提供繁琐。

**解决方案**：`bugreport` 子命令自动收集——调用 `bugreport` crate：
```bash
bat --bugreport
# 输出：
# - bat version: 0.26.1
# - OS: macOS 14.2
# - shell: zsh 5.9
# - pager: less 590
# - syntax set version: 16
```

**关键参数**：
- `bugreport` crate
- 子命令 `--bugreport`
- 自动收集——version / OS / shell / pager / config
- 模板输出——`/tmp/bat-bugreport.txt`
- 用户粘到 GitHub issue

**最佳实践**：CLI 工具加 `--bugreport`——降低用户报 bug 门槛；自动收集信息——避免用户漏报；模板输出——粘到 issue 一气呵成。

---

### 模式 19：CI 4 workflow 矩阵 + dependabot

**问题场景**：跨平台 + 大量依赖——CI 配置要矩阵化。

**解决方案**：4 个 GitHub Actions workflow + dependabot 自动依赖更新：
```yaml
# .github/workflows/
CICD.yml               # 主 CI（test + build + lint）
require-changelog-for-PRs.yml  # PR 必带 CHANGELOG
codecov.yml            # 覆盖率
dependabot.yml         # 依赖自动 PR
```

**关键参数**：
- 4 workflow 矩阵
- 主 CI 跑 test + build + clippy
- codecov 覆盖率追踪
- dependabot 每周 PR
- 平台矩阵——Linux / macOS / Windows

**最佳实践**：跨平台 CI 矩阵化——3 平台各跑一遍；dependabot 自动 PR——避免依赖陈旧；`require-changelog-for-PRs` 强制规范——release 友好。

---

### 模式 20：v0.22 lessopen 钩子 + v0.26 内置 pager

**问题场景**：`git diff` / `man` 等工具调用 less 时——希望 `bat` 处理着色。

**解决方案**：
- v0.22 提供 `bat --lessopen` 钩子——less 调用 bat 处理 stdin
- v0.26 内置 `minus::Pager`——不依赖外部 less

```bash
# .lessfilter
case "$1" in
  *.rs) bat --style=numbered --color=always "$1";;
  *) bat "$1";;
esac
# export LESSOPEN="| bat --lessopen %s"
```

**关键参数**：
- v0.22 引入 `--lessopen`
- v0.26 内置 `minus::Pager`
- 与外部 less 兼容
- 钩子配置——`$LESSOPEN`
- 双轨支持——内置/外部

**最佳实践**：CLI 工具提供 `lessopen` 钩子——与其他工具集成；内置 pager 兜底——无 less 环境也能用；双轨——内置 + 外部 less。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | github.com/sharkdp/bat |
| 协议 | MIT OR Apache-2.0 |
| 总文件 | 905 |
| 主语言 | Rust（~15000 行 src + ~3000 行 build/test） |
| Star | 55k+ |
| 当前版本 | v0.26.1 |
| MSRV | Rust 1.88 |
| 关键依赖 | syntect / clap / nu-ansi-term / serde / git2 / minus / grep-cli |
| 关键里程碑 | 2018 v0.1 → 2019 v0.12 (git 集成) → 2021 v0.18 (lib API) → 2023 v0.22 (lessopen) → 2026 v0.26 (内置 pager) |
| 平台 | Linux / macOS / Windows（GNU + MUSL） |
| 团队 | sharkdp（David Peter） + 数百贡献者 |
