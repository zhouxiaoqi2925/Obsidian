# ripgrep - Rust regex + SIMD + 并行遍历的 CLI 文本搜索标杆

**GitHub**: BurntSushi/ripgrep
**Star**: 51k
**语言**: Rust
**主题**: 命令行 / 文本搜索 / regex automata / SIMD / 跨平台
**适用场景**: 替代 grep/ag/git grep 做大型代码库正则搜索、CI lint、编辑器后端

---

## 第一段：基础范式与核心架构

### 模式 1：极简 CLI + 默认正确

**问题场景**：传统 `grep -r` 慢、不跳过 `.git`、不识别 `.gitignore`；`ag` 不支持 PCRE；`git grep` 限于 git index。开发者想"无脑好用"不要每次加 flag。

**解决方案**：`rg <pattern> <path>` 默认行为：递归搜索、自动跳过 `.gitignore`/`.ignore`/`.rgignore`、自动跳过隐藏文件和二进制文件、彩色高亮、显示行号。95% 场景零 flag。

```bash
# 基础
rg "TODO" src/
# 5 个高频 flag
rg "useState" -t ts               # 文件类型过滤
rg -l "FIXME"                     # 仅文件名
rg -i "error"                     # 大小写不敏感
rg -n "panic"                     # 显示行号
rg --json "error" | jq '...'      # 机器可读 JSON
# CI 用
! rg "TODO" --quiet src/          # exit 0 = found = fail
```

**关键参数**：
- 默认行为：递归 + 跳隐藏 + 跳二进制 + gitignore aware + 彩色
- `--no-ignore`：禁用 ignore 规则
- `-i`：大小写不敏感
- `-l` / `-c` / `-n`：仅文件名/计数/行号
- `--quiet`：仅 exit code（无输出）
- exit code：0 = found, 1 = not found, 2 = error

**最佳实践**：95% 场景用默认参数；记 5 个核心（`-l` / `-n` / `-i` / `-t` / `--json`）覆盖 90% 用法；CI 必加 `--quiet`（不污染 log）。

### 模式 2：Rust regex automata + SIMD 加速

**问题场景**：传统 regex 引擎（PCRE、Python re）匹配速度慢；大型代码库（百万行）搜一次 5-10s 不可接受。

**解决方案**：ripgrep 用 `regex` crate + `regex_automata::meta::Regex` 抽象：编译期提取 literal 子串走 Boyer-Moore / memmem 加速 + DFA vs NFA 自适应 + SIMD 指令（AVX2/AVX-512）扫内存；通常比 `grep` / `ag` 快 2-35x。

```rust
// crates/regex/src/config.rs — meta::Regex 抽象
use regex_automata::meta;
let re = meta::Regex::new(pattern)?;
// 内部：literal 提取 → memmem（memchr SIMD 加速）
//      DFA（快，不支持 backref）vs NFA（慢但全功能）自适应
//      meta::Config 限制 regex 大小防 DoS
re.is_match(input)
```

**关键参数**：
- literal 提取：编译期从 pattern 抠出固定子串
- memchr SIMD：单条指令扫 16-64 字节（AVX2/AVX-512）
- DFA vs NFA：meta 自动选（DFA 优先）
- 编译一次匹配多次：避免每次 `Regex::new()` 重编译
- `-F` flag：纯 literal 模式（无 regex），再快 2-5x

**最佳实践**：固定字符串搜索（无 regex）用 `-F`（literal 模式）；不要在循环里 `Regex::new()`（编译开销大）；让 meta::Regex 决定 DFA/NFA（不要手写）。

### 模式 3：ignore::WalkParallel 并行目录遍历

**问题场景**：单线程遍历大型 monorepo（百万文件）慢；ignore 规则散落（项目 `.gitignore` / 全局 `~/.config/git/ignore` / `.ignore` / `.rgignore`）。

**解决方案**：`ignore::WalkParallel` 基于 crossbeam 工作窃取（work-stealing）并行遍历，每文件 spawn 任务到 thread pool。`ignore` crate 解析 gitignore 嵌套语义 + 二进制检测 + 隐藏文件检测。

```rust
// crates/ignore/src/walk.rs — WalkParallel
use ignore::WalkParallel;
use crossbeam::thread;
WalkParallel::new(path)
    .threads(num_cpus::get())     // 默认 CPU 核数
    .run(|| {                     // closure 闭包每文件调用
        Box::new(|entry| {
            // entry: Result<DirEntry, Error>
            // 返回 WalkState::Continue / Skip /Quit
            WalkState::Continue
        })
    })
```

**关键参数**：
- 工作窃取：crossbeam scheduler 分配任务（空闲线程抢任务）
- 默认线程数：CPU 核数（`num_cpus::get()`）
- `.gitignore` 嵌套：子目录的覆盖父级（git 官方语义）
- 二进制检测：NUL 字节 + UTF-8 校验
- 跳过：`.git` / `node_modules` / `target` 等大目录（自动）

**最佳实践**：用 `ignore` crate 而非手写遍历（gitignore 嵌套语义复杂）；不要设线程数 > CPU 核数（线程切换开销）；尊重 gitignore 是"开发者友好"的关键（不要默认全搜）。

### 模式 4：mmap + 缓冲双策略

**问题场景**：`read()` 系统调用每次拷数据到用户空间；大文件 IO 开销高；但 mmap 不适合小文件（虚拟内存开销）。

**解决方案**：`isearcher` 抽象做自适应：
- **小文件**（< 几 MB）：直接 `read()` + buffer
- **大文件**（> 1MB）：`mmap()` 内存映射，内核分页按需加载，0 拷贝

```rust
// crates/searcher/src/searcher/mod.rs
pub enum Input<'a> {
    File { path: PathBuf, mmap: Option<Mmap> },   // 大文件 mmap
    Slice(&'a [u8]),                              // 小文件 buffer
    // ...
}
let input = if file_size > THRESHOLD {
    Input::File { mmap: Some(Mmap::map(&file)?) }   // mmap 路径
} else {
    Input::Slice(&buffer)                            // 缓冲路径
};
```

**关键参数**：
- 阈值：~1MB（可调）
- mmap 优势：0 系统调用、0 拷贝、内核按需分页
- mmap 劣势：小文件虚拟内存开销、Windows 行为差异
- 决策：`isearcher` 自动选
- 内存压力：mmap 不预先占内存（lazy load）

**最佳实践**：让 ripgrep 自动决策（不要手写 mmap 判断）；Windows 上 mmap 行为不同，社区已处理（无需关心）；并发读同一文件用 mmap 更安全（read 并发要协调）。

### 模式 5：多搜索引擎（Rust regex / PCRE2 / literal）

**问题场景**：PCRE2 支持 lookaround/backref 但慢；Rust regex 性能更好但不支持高级特性；纯 literal 搜索最快但不支持 pattern。如何让用户按需选？

**解决方案**：ripgrep 支持 3 个 engine：
- **Rust regex**（默认）：DFA + SIMD，最快但不支持 backref
- **PCRE2**（`-P` flag）：lookaround/backref 支持，慢
- **Literal**（`-F` flag）：纯字符串 memmem，最快

```bash
# 默认 Rust regex
rg "foo.*bar"
# PCRE2（lookaround）
rg -P "(?<=foo)bar"
# 纯 literal（无 regex）
rg -F "foo.bar"   # 此时 . 是字面量，不是任意字符
# auto-hybrid：含 literal 子串时自动混合
rg "function\s+foo"  # literal "function" + regex
```

**关键参数**：
- 默认 Rust regex（无 PCRE2 依赖，编译更轻）
- `-P` 切换 PCRE2（编译时 feature flag 启用）
- `-F` 切 literal（无 regex 元字符）
- auto-hybrid：pattern 含 literal 子串时自动用 memmem 加速
- PCRE2 编译：编译 ripgrep 时加 `--features pcre2`

**最佳实践**：默认 Rust regex（95% 场景够用）；要 PCRE2 特性（lookaround）才用 `-P`；纯字符串用 `-F`（再快 2-5x）；不要为"以防万一"用 `-P`（性能损耗 5-10x）。

---

## 第二段：gitignore 语义与 IO 抽象

### 模式 6：.gitignore 嵌套语义

**问题场景**：子目录 .gitignore 覆盖父级、global .gitignore、`.ignore` / `.rgignore` 优先级如何？团队不同项目用不同 ignore 文件，ripgrep 默认行为要"对"。

**解决方案**：`ignore` crate 实现 git 官方嵌套语义：
- 父级 .gitignore → 子级 .gitignore（叠加，子级可重新声明 `!pattern` unignore）
- `.ignore` ≡ `.gitignore`（仅 ripgrep 识别，git 忽略）
- `.rgignore` ≡ `.ignore`（别名）
- global gitignore（`~/.config/git/ignore`）默认开启

```bash
# 项目根 .gitignore
*.log
# 子目录 src/.gitignore
!*.log     # unignore（父级 *.log 在子目录被覆盖）
# 全局 ignore（所有项目生效）
~/.config/git/ignore
# 禁用
rg --no-ignore "secret"
# 自定义 ignore 文件
rg --ignore-file=custom.ignore "pattern"
```

**关键参数**：
- 子目录可重新声明 unignore（`!pattern`）
- `--no-ignore`：完全禁用 ignore 规则
- `--ignore-file=path`：自定义 ignore 文件
- 优先级：项目内 .gitignore > global > .ignore > .rgignore
- 跨多级：`parent_dir = true` 自动向上找

**最佳实践**：项目用 `.gitignore` 即可（git 共享）；要 ripgrep-specific 规则加 `.ignore`（不影响 git）；CI 用 `--no-ignore` 不被 .gitignore 干扰（搜所有文件）。

### 模式 7：二进制文件自动检测

**问题场景**：搜索 `.png` / `.pdf` / `.zip` 等二进制文件输出乱码（按 UTF-8 解析失败）；如何自动跳过又不让用户每次加 `--binary`？

**解决方案**：ripgrep 在打开文件后做两阶段检测：
- **NUL 字节检测**：扫前 8KB，含 `\0` 视为二进制
- **UTF-8 校验**：解码失败视为二进制

```bash
# 默认跳过二进制
rg "error" .                # 跳过 .png 等
# 简化输出
rg --binary "magic" .       # 仅显示 "Binary file X matches"
# 强制按文本（搜日志、混合编码）
rg --text "INFO" .
# 自定义 glob 过滤
rg -g '*.{png,pdf}' "data" .   # 显式搜这些
rg -g '!*.min.js' "fn" .       # 排除压缩 JS
```

**关键参数**：
- 默认行为：检测到二进制则跳过内容输出
- `--binary`：简化输出（"Binary file X matches"）
- `--text`：强制按文本（跳过检测）
- `-g glob`：glob 过滤（支持 `!` 反向）
- 检测阈值：前 8KB（足够识别大部分格式）

**最佳实践**：默认行为已对（无需加 flag）；要搜混合编码日志用 `--text`；要看二进制文件名用 `--binary`；用 `-g '!*.min.js'` 排除压缩文件（搜出来可读性差）。

### 模式 8：JSON 输出（NDJSON 流）

**问题场景**：CI 集成 ripgrep 结果、编辑器插件（VSCode / Helix）用 ripgrep 做后端、shell 脚本处理输出——需要机器可读格式而不是 grep 风格的彩色文本。

**解决方案**：`--json` 输出 NDJSON（每行一个 JSON 对象），event 类型：`begin` / `match` / `end` / `summary`，流式可处理。

```json
{"type":"begin","data":{"path":{"text":"src/main.rs"}}}
{"type":"match","data":{"path":{"text":"src/main.rs"},"lines":{"text":"fn main()"},"line_number":1,"absolute_offset":0,"submatches":[{"match":{"text":"fn"},"start":0,"end":2}]}}
{"type":"end","data":{"path":{"text":"src/main.rs"},"stats":{"matches":1}}}
```

**关键参数**：
- `--json` 启用 NDJSON 输出
- 事件类型：`begin`（文件开始） / `match`（单次匹配） / `end`（文件结束） / `summary`（全局汇总）
- 字段：`path` / `lines` / `line_number` / `absolute_offset` / `submatches[]`
- 流式处理：`rg --json | jq 'select(.type=="match")'`
- 兼容：与 grep、ack 完全不同，**不要解析默认输出**

**最佳实践**：编辑器插件统一用 `--json` 解析（vs 解析 grep 风格输出）；shell 脚本用 `jq` 流式处理；CI 跑 lint 用 `--quiet` 而非 `--json`（更简洁）。

### 模式 9：替换与编辑（ripgrep vs sd）

**问题场景**：搜索 + 替换用 sed 复杂、跨平台行为不一致（macOS BSD sed vs GNU sed）；ripgrep 要不要做"直接改文件"？

**解决方案**：`--replace=foo` 输出替换后的内容（不改文件）；ripgrep **故意不**直接改文件（避免 sed 误用）；改文件用 `sd`（Rust 重写 sed，更安全）。

```bash
# ripgrep 只输出，不改
rg "foo" --replace "bar"            # stdout 输出替换后内容
# 改文件用 sd（rust 重写）
sd 'foo' 'bar' file.rs
# 批量：ripgrep 找文件，sd 改文件
rg -l "old_api" src/ | xargs sd 'old_api' 'new_api'
# 跨平台
fd -e rs . | xargs sd ...
```

**关键参数**：
- `--replace=string`：仅 stdout 输出替换
- ripgrep 设计：只搜不改（避免 sed 风格误用）
- `sd`：Rust 重写，跨平台一致，语法类似 sed 但更安全
- 备份：sed 改前备份（`sed -i.bak`），sd 默认不备份
- dry-run：先 `rg --replace` 看效果再 `sd`

**最佳实践**：ripgrep 只搜不改（设计原则）；要替换用 `sd` 或 IDE refactor；批量替换前先 dry-run；用 `git diff` 看变更再 commit。

### 模式 10：性能调优选项

**问题场景**：在超大型 monorepo（>1M 文件）跑 ripgrep 仍慢；IO 等待长；恶意大行（>10MB 单行）拖慢匹配。

**解决方案**：5 个关键调优选项：
- `-j N`：N 线程（默认 CPU 核数）
- `--max-columns=N`：截断长行（防 DoS + 加速）
- `--max-columns-preview`：先匹配后截断（精度+速度平衡）
- `--pre cmd`：预处理（如 `gunzip -c`）
- `--threads=N`：自定义线程数

```bash
# 8 线程并行
rg -j 8 "TODO" .
# 限制每行 200 字符（避免恶意大行）
rg --max-columns=200 "error" .
# 先匹配后截断（更精确）
rg --max-columns-preview "error" .
# 搜压缩文件
rg --pre 'gunzip -c' "error" /var/log/*.gz
# 自定义文件类型
rg --type-add 'web:*.{html,css,js}' "function" .
```

**关键参数**：
- 线程数 = CPU 核数（不要过大，切换开销）
- `--max-columns`：防 DoS（默认 2000）
- `--max-columns-preview`：先匹配再截断（可能错过跨截断点的 match）
- `--pre` / `--pre-glob`：对压缩文件 / 加密文件预处理
- `--type-add`：自定义文件类型（`*.{html,css,js}` → `web`）

**最佳实践**：默认参数已 80% 优化；超大 monorepo 限 `max-columns` 加速；用 `--pre 'gunzip -c'` 搜日志；不要盲目调高线程数（context switch 拖累）。

---

## 第三段：regex 引擎与代码架构

### 模式 11：meta::Regex 高层抽象

**问题场景**：`regex` crate 0.x API 不稳定（早期频繁 breaking change）；用户希望"一次写、跨 Rust 版本跑"；不同 pattern 需要不同匹配策略（DFA/NFA/literal）。

**解决方案**：`regex_automata::meta::Regex` 是高层抽象：内部 DFA + NFA + literal 优化混合；编译期决定最优策略；用 `meta::Config` 限制 regex 大小防 DoS。

```rust
// crates/regex/src/config.rs
use regex_automata::meta;
let re = meta::Regex::new(pattern)?;
// 内部自动决策：
//   - 含 literal 子串 → memmem SIMD 预筛
//   - 简单 pattern → DFA（快，不支持 backref）
//   - 复杂 pattern → NFA（慢但全功能）
re.is_match(input)
```

**关键参数**：
- `meta::Regex::new(pattern)` 编译
- 自动选 DFA（不支持 backref）vs NFA
- `meta::Config`：限制 regex 复杂度（防止恶意大 pattern）
- 编译一次匹配多次：避免 `Regex::new()` 重复编译
- 跨 Rust 版本稳定（meta API 稳定）

**最佳实践**：用 `meta::Regex` 而非裸 NFA/DFA（接口稳定）；`lazy_static!` 包裹预编译（业务代码复用）；`meta::Config` 限 `nfa_size_limit` 防 DoS。

### 模式 12：auto-hybrid PCRE2 + Rust regex

**问题场景**：PCRE2 支持 lookaround 但慢 5-10x；Rust regex 快但不支持；用户用 PCRE2 写 lookaround 但大部分时间其实只匹配简单 pattern。

**解决方案**：ripgrep 的 hybrid 模式：先用 Rust regex 快速扫"候选区域"，发现候选后用 PCRE2 精确验证（只在这些位置调慢的 PCRE2）。接近 Rust regex 速度 + 保留 PCRE2 功能。

```rust
// crates/pcre2/src/config.rs（hybrid 模式）
// 1. Rust regex 找候选 match 位置
// 2. 在候选位置调 PCRE2 精确验证
// 3. 仅精确验证后才算 match
// 用户透明：ripgrep 自动决定是否走 hybrid
```

**关键参数**：
- 默认 Rust regex（不调 PCRE2）
- `-P` 启用 PCRE2（hybrid 模式自动）
- 内部判断：pattern 是否含 PCRE2 特性（lookaround / backref）
- 性能：hybrid 接近 Rust regex 速度（PCRE2 仅在候选位置调）
- 编译选项：`--features pcre2` 启用 PCRE2 支持

**最佳实践**：用 PCRE2 时无需手动 hybrid（ripgrep 自动优化）；不要为"以防万一"用 `-P`（性能损耗 5-10x）；仅在必须 lookaround 时才 `-P`。

### 模式 13：searcher glue 与 print 抽象

**问题场景**：搜索结果输出格式多（color / plain / JSON / files-with-matches / count）；匹配算法与输出格式耦合？

**解决方案**：`searcher` crate 把"匹配"与"打印"解耦：
- `Searcher` 抽象：在 `Input`（文件/buffer）上找匹配
- `Printer` 抽象：把 `Sink`（匹配事件）格式化为输出
- `glue.rs`（1550 行）做编排

```rust
// crates/searcher/src/searcher/glue.rs
let mut searcher = Searcher::new();
let mut printer = StandardBuilder::new().build(StandardConfig::default());
searcher.search_slice(input, printer.sink(match_finder))?;
// printer 知道如何输出（color / plain / JSON）
// searcher 只关心找 match
```

**关键参数**：
- `Searcher` 抽象：在 Input 上找 match
- `Sink` 类型化匹配事件（begin/match/end）
- `Printer` trait：知道如何打印（实现 Standard / JSON / Summary）
- `glue.rs` 1550 行做编排
- 扩展：实现 Printer trait 加新输出（HTML/CSV）

**最佳实践**：要扩展新输出（HTML/CSV）实现 Printer trait，不要 hack searcher；解耦 = "搜索逻辑可复用 + 多种输出可并存"；glue.rs 单文件 1550 行（核心调度器，单文件可接受）。

### 模式 14：命令行参数（clap derive）

**问题场景**：ripgrep 有 100+ 命令行选项（grep + ag 风格全集）；手写参数解析 3000+ 行代码、维护噩梦。

**解决方案**：`clap`（Rust CLI 库）derive macro：`#[derive(clap::Parser)]` + 字段属性，自动生成 `--help`、类型校验、子命令、shell completion。

```rust
// crates/core/main.rs
#[derive(clap::Parser)]
#[command(name = "rg", version)]
struct Args {
    pattern: String,
    paths: Vec<PathBuf>,
    #[arg(short, long)]
    ignore_case: bool,
    #[arg(short = 't', long = "type")]
    types: Vec<String>,
    // ... 100+ 字段
}
let args = Args::parse();
```

**关键参数**：
- 自动生成 `--help`（用 doc comments）
- 类型校验：path 必须存在（`#[arg(value_parser)`）
- 子命令支持：`#[command(subcommand)]`
- shell completion：`clap_complete` 生成 bash/zsh/fish
- derive 风格：比 builder 风格简洁 50%

**最佳实践**：用 clap 4.x（最新 API）；derive 风格优先（vs builder）；doc comments 直接当 `--help` 文本；用 `value_parser` 做自定义校验。

### 模式 15：跨平台兼容

**问题场景**：Windows / macOS / Linux 文件系统 API 差异（路径分隔符、文件锁、Unicode 规范化、行尾）；ripgrep 在 3 大 OS 都跑。

**解决方案**：
- 路径处理用 `std::path::PathBuf`（跨平台）
- 平台特定代码用 `#[cfg(target_os = "windows")]` 条件编译
- Unicode 大小写折叠用 `unicase` crate
- Windows mmap 行为差异：禁用 + 用 buffered IO

```rust
// crates/ignore/src/path.rs
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;
#[cfg(windows)]
use std::os::windows::fs::MetadataExt;
// 路径拼接
let path = base.join("subdir").join("file.rs");  // Path::join() 跨平台
// Unicode 大小写
use unicase::UniCase;
UniCase::new("ERROR") == UniCase::new("error")   // true（macOS/Windows 文件系统不敏感）
```

**关键参数**：
- 路径分隔符：`Path::join()` 不用字符串拼接（自动处理 `/` vs `\`）
- 文件名大小写：Windows 不敏感、Linux 敏感、macOS 默认不敏感
- 行尾：CRLF (Windows) vs LF (Unix) 自动处理
- 符号链接：默认 follow，可 `--no-symlinks` 禁用
- mmap：Windows 行为不同，ripgrep 自动用 buffered IO 替代

**最佳实践**：用 `Path::join()` 不用字符串拼接；测试覆盖三大 OS（CI matrix）；Unicode 文件名用 `String` 不用 `&str`；用 `path_clean` crate 规范化路径。

---

## 第四段：实战速查与生态对比

### 模式 16：常用 rg 命令速查

**问题场景**：每天用 rg 50 次，记忆命令参数浪费时间。

**解决方案**：10 个高频命令模板：
```bash
# 搜所有 TODO
rg "TODO" .
# 只搜 .ts 文件
rg "useState" -t ts
# 不搜 node_modules
rg "react" -g '!node_modules'
# 显示文件名而非内容
rg -l "FIXME"
# 替换预览（不改文件）
rg "foo" --replace "bar"
# JSON 输出给 jq
rg --json "error" | jq 'select(.type=="match") | .data.path.text'
# 大小写不敏感
rg -i "error"
# 显示上下文 3 行
rg -C 3 "panic"
# 仅看行数
rg -c "test_"
# 统计每文件匹配数
rg --count-matches "TODO"
```

**关键参数**：
- `-t type`：文件类型过滤（`ts` / `py` / `rust` / `go` / `js`...）
- `-g glob`：glob 过滤（支持 `!` 反向）
- `-l` / `-c` / `-n`：仅文件名/计数/行号
- `--json`：JSON 输出
- `-C N`：上下文 N 行
- `-i`：大小写不敏感

**最佳实践**：记 5 个核心（`-l` / `-n` / `-i` / `-t` / `--json`）覆盖 90% 场景；用 shell alias 简化（`alias r='rg'`）；CI 用 `--quiet` 模式（无输出）。

### 模式 17：与 grep / ag / git grep 对比

**问题场景**：团队代码评审有人用 grep、ag、git grep 风格；如何统一到 ripgrep？ripgrep 优势在哪？

**解决方案**：
- 速度：ripgrep > ag > git grep > grep（通常 2-35x）
- 默认行为：ripgrep = ag（gitignore aware + 跳二进制），grep 无 ignore，git grep 限 git 仓库
- 兼容性：rg 用 GNU grep 子集（多数参数兼容，`-l` / `-n` / `-i` / `-C` 一致）
- 替换策略：`alias grep='rg'` 或 `alias ag='rg'`

```bash
# 替换 grep
alias grep='rg'
# 替换 ag
alias ag='rg'
# 不影响 git grep（限于 git 仓库 + 用 git index 加速）
# ripgrep 完整替代：默认跳过 .git，跳过二进制，gitignore aware
```

**关键参数**：
- ripgrep 全部优势：默认 gitignore + 跳二进制 + SIMD + 并行 + JSON 输出
- git grep 优势：git index 加速（ripgrep 不读 index）
- ag 优势：历史地位（被 ripgrep 全面超越）
- 兼容性：GNU grep 子集（多数参数名一致）
- 迁移：alias 替换零成本

**最佳实践**：用 ripgrep 替代 grep + ag；git grep 仅在 git 仓库中需要 zsh history 加速时用；不要在脚本里 hardcode `grep`（用 `rg` + fallback）。

### 模式 18：CI 与脚本集成

**问题场景**：CI 跑 ripgrep 验证（lint / code smell / 不允许的 API）、shell 脚本处理输出。

**解决方案**：
```bash
# CI 检查 TODO 注释
! rg "TODO" --quiet src/                  # exit 0 = found = fail
# 统计代码行
rg -c '.' -t ts | awk -F: '{sum+=$2} END {print sum}'
# 提取所有 import
rg "^import .* from " -o | sort -u
# 监控文件变化（看哪些文件没 license header）
rg --files-without-match "license" src/
# 跨平台 NUL 分隔（防文件名含空格）
rg -l "TODO" --null | xargs -0 sed -i 's/TODO/FIXME/g'
```

**关键参数**：
- `--quiet`：仅 exit code（无输出）
- exit code：0 = found, 1 = not found, 2 = error
- `--null`：用 NUL 分隔（`xargs -0` 防空格）
- `--files-without-match`：找"没匹配"的文件
- `-o`：仅输出匹配部分

**最佳实践**：CI 用 `--quiet` 模式（不污染 log）；大数据集用 `--null` + `xargs -0`；lint 规则用 `! rg pattern` 反向退出码；shell 脚本封装 ripgrep 而不是直接调。

### 模式 19：编辑器集成

**问题场景**：VSCode / Vim / Emacs 搜索功能依赖 ripgrep；如何配置最舒服？所有现代编辑器默认都支持 ripgrep。

**解决方案**：
- **VSCode**：内置 search 用 ripgrep（设置 `"search.useExperimentalRipgrep": true`，2024+ 默认）
- **Vim**：`grep` 替换为 `rg` + `Plug 'ctrlpvim/ctrlp.vim'` 配 ripgrep
- **Emacs**：`counsel-rg` / `consult-rg` / `deadgrep`
- **JetBrains IDEs**（IDEA 2023+）：Search Everywhere 默认 ripgrep
- **Helix**：默认 ripgrep（直接用）

```json
// VSCode settings.json
{
    "search.useExperimentalRipgrep": true,
    "search.followSymlinks": false,
    "search.maxResults": 10000
}
```
```vim
" Vim ~/.vimrc
set grepprg=rg\ --vimgrep
set grepformat=%f:%l:%c:%m
" :grep 自动用 ripgrep
```

**关键参数**：
- VSCode：`search.followSymlinks: false`（避免循环）
- 项目根加 `.ignore` 排除 `node_modules` / `dist`
- `--max-columns=1000` 避免 IDE 卡（巨大行）
- Helix 默认 ripgrep（无需配置）

**最佳实践**：所有现代编辑器默认 ripgrep 后端；项目根加 `.ignore` 排除构建产物；大行文件配 `.ignore` 加 `!*.log` 或单独项目设置。

### 模式 20：贡献与扩展

**问题场景**：想给 ripgrep 提 PR / 加 feature / 修 bug；如何入门？ripgrep 是 monorepo（9 个 crate），从哪下手？

**解决方案**：6 步贡献流程：
1. **阅读** `ARCHITECTURE.md` + `crates/*/README.md`
2. **从简单 issue** 入手（`good first issue` 标签）
3. **写测试** `tests/test_*.rs` 先加失败用例
4. **用 `cargo run -- args` 跑本地版本**
5. **跑全测试** `cargo test --all`
6. **写 changelog** `CHANGELOG.md`

```bash
# 克隆
git clone https://github.com/BurntSushi/ripgrep
cd ripgrep
# 跑测试
cargo test --all
# 跑本地版本
cargo run -- "TODO" .
# 性能对比
cargo bench
# lint
cargo clippy --all
```

**关键参数**：
- 仓库 monorepo：9 个 crate（`grep` / `ignore` / `regex` / `searcher` / `pcre2` / `globset` / `fnv` / `memchr` / `termcolor`）
- MSRV 1.85（Minimum Supported Rust Version）
- 性能敏感：跑 `cargo bench`（regression 测）
- lint：`cargo clippy --all`（clippy 警告必须 0）
- CHANGELOG.md：每个 PR 必更新

**最佳实践**：先在 issues / Discussions 讨论设计（不要直接开大 PR）；从 `good first issue` 入手（社区友善）；MSRV 1.85 是最低门槛；性能改动跑 `cargo bench` 验证无 regression。

---

## 附录：5 段必读代码

1. `crates/core/main.rs` — CLI 入口（clap 参数解析 + 调度 main）
2. `crates/core/app.rs` — 应用主循环（参数 + 路径 + 搜索 + 输出）
3. `crates/ignore/src/walk.rs` — `WalkParallel` 并行目录遍历（crossbeam 工作窃取）
4. `crates/regex/src/config.rs` — `meta::Regex` 抽象（DFA + NFA + literal 混合）
5. `crates/searcher/src/searcher/glue.rs` — 编排搜索与打印（Searcher + Printer + Sink）

## 一句话总结

ripgrep = Rust regex automata + SIMD 加速（memchr/AVX2）+ `ignore::WalkParallel` 工作窃取并行遍历 + mmap/buffered IO 自适应 + 3 个 regex engine（Rust/PCRE2/literal）+ clap derive CLI + JSON NDJSON 流式输出，把"在大型代码库搜文本"做到 2-35x 速度提升 + 默认正确（gitignore + 跳二进制 + Unicode），是现代开发者终端搜索的事实标准，最值得偷的是"分层 crate 抽象（searcher/ignore/regex/printer）+ 自适应 IO 策略"的设计。
