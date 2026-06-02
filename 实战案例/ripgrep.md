# ripgrep - 极致快的 Rust 正则行搜索 CLI 工具

**GitHub**: BurntSushi/ripgrep
**Star**: 51k
**语言**: Rust
**主题**: 命令行工具 / 文本搜索 / 正则 / SIMD 优化
**适用场景**: 在大型代码库中做快速正则搜索（grep 替代品），gitignore-aware 默认正确

---

## 第一段：基础范式

### 模式 1：极简 CLI + 默认正确

**问题场景**：传统 `grep -r` 慢、忽略 .git 不方便；`ag` 不支持 PCRE；`git grep` 索引仓库有限制。如何"无脑好用"？

**解决方案**：`rg <pattern> <path>` 默认递归搜索、自动跳过 `.gitignore` / `.ignore` / `.rgignore`、自动跳过隐藏/二进制文件、彩色输出。

**关键参数**：
- `rg "TODO" src/`：基本用法
- 默认递归 + 跳隐藏 + 跳二进制
- `--no-ignore`：禁用 ignore 规则
- `-i`：大小写不敏感
- `-l` / `-c` / `-n`：仅文件名/计数/行号

**最佳实践**：95% 场景用默认参数；CI 跑 `rg --no-ignore` 不被 .gitignore 干扰。

### 模式 2：Rust regex automata + SIMD 加速

**问题场景**：传统 regex 引擎（PCRE、Python re）匹配速度慢；大型代码库搜索耗时秒级。

**解决方案**：ripgrep 用 `regex` crate（Rust 实现）+ `regex_automata`（DFA）+ SIMD 指令（AVX2/AVX-512）+ 激进字面量优化（literals 提取）。通常比 `grep` / `ag` 快 2-35x。

**关键参数**：
- 编译期提取字面量（literal）→ Boyer-Moore / memmem 加速
- DFA vs NFA 自适应（meta::Regex 引擎）
- SIMD 加速 memchr（内存字符搜索）
- mmap + 缓冲双策略

**最佳实践**：固定字符串搜索（无 regex）用 `-F`（literal），再快 2-5x。

### 模式 3：ignore::Walk 并行目录遍历

**问题场景**：单线程遍历大型 monorepo（百万文件）慢；忽略规则散落（.gitignore / .ignore / global gitignore）。

**解决方案**：`ignore::WalkParallel` 基于 crossbeam 工作窃取并行遍历，每文件 spawn 任务到 thread pool。`ignore` crate 解析 gitignore 嵌套 + 二进制检测 + hidden 检测。

**关键参数**：
- 工作窃取：空闲线程抢任务
- 跳过 .git / node_modules / target 等大目录
- `.gitignore` 嵌套（子目录的 .gitignore 覆盖父级）
- 二进制检测：检测 NUL 字节 + UTF-8 校验

**最佳实践**：用 `ignore` crate 而非手写遍历；尊重 gitignore 是"开发者友好"的关键。

### 模式 4：mmap + 缓冲双策略

**问题场景**：read() 系统调用每次拷贝数据到大用户空间；处理大文件 IO 开销高。

**解决方案**：
- **小文件**（< 几 MB）：直接 read() + buffer
- **大文件**：mmap() 内存映射 → 内核分页按需加载 → 0 拷贝
- 决策：file size + 平台能力

**关键参数**：
- mmap 适用：>1MB 文件
- 小文件用 buffered IO（更可控）
- 内存压力：mmap 不预先占内存
- 平台差异：Windows mmap 行为不同

**最佳实践**：让 ripgrep 自动决策（`isearcher` 抽象）；不要手写 mmap。

### 模式 5：多搜索引擎（Rust regex / PCRE2 / literal）

**问题场景**：PCRE2 高级特性（lookaround、backreference）Rust regex 不支持；纯 Rust regex 性能更好。

**解决方案**：ripgrep 支持 3 个 engine：
- **Rust regex**（默认）：DFA + SIMD，2-5x 快
- **PCRE2**：开 `-P` flag，lookaround/backref 支持
- **Literal**：纯字符串（`-F`），memmem 加速

**关键参数**：
- 默认 Rust regex（无 PCRE2 依赖）
- `-P` 切换 PCRE2（编译时 feature）
- `-F` 切 literal（最快）
- `auto-hybrid`：正则含 literal 时自动混合

**最佳实践**：默认 Rust regex；要 PCRE2 特性才用 `-P`；literal 搜索用 `-F`。

---

## 第二段：扩展范式

### 模式 6：.gitignore 嵌套语义

**问题场景**：子目录 .gitignore 覆盖父级、global .gitignore、`.ignore` / `.rgignore` 优先级如何？

**解决方案**：`ignore` crate 实现 git 官方语义：
- 父级 .gitignore → 子级 .gitignore（叠加）
- `.ignore` 等价 .gitignore（仅 ripgrep 识别）
- `.rgignore` = `.ignore` 别名
- global .gitignore（`~/.config/git/ignore`）默认开启

**关键参数**：
- 子目录可重新声明 unignore（`!pattern`）
- `--no-ignore` 完全禁用
- `--ignore-file=path` 自定义文件
- `parent_dir = true` 跨多级

**最佳实践**：项目用 `.gitignore` 即可；要 ripgrep-specific 规则加 `.ignore`。

### 模式 7：二进制文件自动检测

**问题场景**：搜索 .png / .pdf / .zip 二进制文件输出乱码；如何自动跳过？

**解决方案**：ripgrep 在打开文件后检测：
- 含 NUL 字节 → 视为二进制
- UTF-8 解码失败 → 视为二进制
- `--text` 强制当文本
- `--binary` 显示 "Binary file X matches" 而不打印

**关键参数**：
- 默认跳过二进制内容
- `--binary` 简化输出
- `--text` 强制按文本
- `glob!("!*.{png,pdf,zip}")` 自定义过滤

**最佳实践**：默认行为已对；要搜日志用 `--text`；要看二进制文件名用 `--binary`。

### 模式 8：JSON 输出

**问题场景**：CI 集成 ripgrep 结果、编辑器插件用 ripgrep、需要机器可读输出。

**解决方案**：`--json` 输出 NDJSON（每行一个 JSON 对象）：
```json
{"type":"begin","data":{"path":{"text":"src/main.rs"}}}
{"type":"match","data":{"path":{"text":"src/main.rs"},"lines":{"text":"fn main()"},"line_number":1,...}}
{"type":"end","data":{"path":{"text":"src/main.rs"},"stats":{...}}}
```

**关键参数**：
- `--json` 启用 NDJSON
- event types: begin / match / end / summary
- 用 `jq` / `python` 流式处理
- 与 grep、ripgrep 子进程集成友好

**最佳实践**：编辑器插件用 `--json` 解析（vs 解析 grep 风格输出）。

### 模式 9：替换与编辑

**问题场景**：搜索 + 替换用 sed 复杂、跨平台行为不一致。

**解决方案**：
- `--replace=foo`：输出替换后的内容（不改文件）
- ripgrep 不直接改文件（避免 sed 误用）
- 替代方案：`rg -l pattern | xargs sed -i 's/.../.../g'`
- 跨平台：`fd` + `sd`（rust 重写 sed）

**关键参数**：
- `--replace=string` 仅输出
- 改文件用 `sd`（更安全）
- 批量替换先 dry-run
- 备份原文件

**最佳实践**：ripgrep 只搜不改；要替换用 `sd` 或 IDE refactor。

### 模式 10：性能调优选项

**问题场景**：在超大型 monorepo 跑 ripgrep 仍慢；IO 等待长。

**解决方案**：
- `-j 8`：8 线程（默认 CPU 数）
- `--max-columns=200`：截断长行（避免巨大行拖慢匹配）
- `--max-columns-preview`：先匹配后截断
- `--threads=N`：自定义线程数
- `--pre` / `--pre-glob`：预处理（如 `gunzip -c`）

**关键参数**：
- 线程数 = CPU 核数（不要过大）
- `--max-columns` 防 DoS（恶意大行）
- `--pre` 处理压缩文件
- `--type-add`：自定义文件类型

**最佳实践**：默认参数已 80% 优化；要更快就限制 max-columns。

---

## 第三段：进阶范式

### 模式 11：Rust regex crate 的 meta::Regex 抽象

**问题场景**：regex crate 0.x API 不稳定（早期频繁 breaking change）；用户希望"一次写、跨版本跑"。

**解决方案**：`regex_automata::meta::Regex` 是高层抽象：内部用 DFA（确定有限状态机）+ NFA + literal 优化混合，编译期决定最优策略。

**关键参数**：
- `meta::Regex::new(pattern)` 编译
- 自动选 DFA（快但不支持 backref）/ NFA（慢但全功能）
- `meta::Config`：限制 regex 大小防 DoS
- 编译一次匹配多次

**最佳实践**：用 `meta::Regex` 而非裸 NFA/DFA；统一接口跨 Rust 版本稳定。

### 模式 12：auto-hybrid PCRE2 + Rust regex

**问题场景**：PCRE2 支持 lookaround 但慢，Rust regex 快但不支持；用户用 PCRE2 写 lookaround 但大部分时间其实匹配简单 pattern。

**解决方案**：ripgrep 的 hybrid 模式：先用 Rust regex 快速扫描定位"可能匹配"区域，发现后用 PCRE2 精确验证（仅在这些位置调用慢的 PCRE2）。

**关键参数**：
- 默认 Rust regex（不调 PCRE2）
- `-P` 启用 PCRE2
- 自动判断 pattern 是否含 PCRE2 特性
- 性能：hybrid 接近 Rust regex 速度

**最佳实践**：用 PCRE2 时无需手动 hybrid；让 ripgrep 自动优化。

### 模式 13：searcher glue 与 print 抽象

**问题场景**：搜索结果输出格式多（color / plain / JSON / files-with-matches / count），如何解耦匹配与输出？

**解决方案**：`searcher` crate 把"匹配"与"打印"解耦：
- `Searcher` 抽象：在 `Input`（文件/buffer）上找匹配
- `Printer` 抽象：把 `Sink`（匹配事件）格式化为输出
- `glue.rs`（1550 行）做编排

**关键参数**：
- `Searcher::new()` 创建
- `searcher.search_slice(input, &mut printer)`
- `Sink` 类型化匹配事件
- `Printer` 知道如何打印

**最佳实践**：要扩展新输出（HTML/CSV）实现 Printer trait，不要 hack searcher。

### 模式 14：命令行参数（clap derive）

**问题场景**：ripgrep 有 100+ 命令行选项；手写参数解析 3000 行代码、维护噩梦。

**解决方案**：`clap`（Rust CLI 库）用 derive macro：
```rust
#[derive(clap::Parser)]
#[command(name = "rg", version)]
struct Args {
    pattern: String,
    paths: Vec<PathBuf>,
    #[arg(short, long)]
    ignore_case: bool,
    // ...
}
```

**关键参数**：
- 自动生成 `--help`
- 类型校验（path 必须存在）
- 子命令支持
- shell completion 生成

**最佳实践**：用 clap 4.x（最新 API）；derive 风格比 builder 风格简洁 50%。

### 模式 15：跨平台兼容

**问题场景**：Windows / macOS / Linux 文件系统 API 差异（路径分隔符、文件锁、Unicode 规范化）；ripgrep 在 3 大 OS 都跑。

**解决方案**：
- 路径处理用 `std::path::PathBuf`（跨平台）
- 平台特定代码用 `#[cfg(target_os = "windows")]` 条件编译
- Unicode 大小写折叠用 `unicase` crate
- Windows mmap 行为差异：禁用 + 用 buffered IO

**关键参数**：
- 路径分隔符：`Path::join()` 不用字符串拼接
- 文件名大小写：Windows 不敏感、Linux 敏感
- 行尾：CRLF vs LF 自动处理
- 符号链接：默认 follow，可 `--no-symlinks` 禁用

**最佳实践**：用 `path_clean` crate 规范化路径；测试覆盖三大 OS。

---

## 第四段：实战范式

### 模式 16：常用 rg 命令速查

**问题场景**：每天用 rg 50 次，记忆命令参数。

**解决方案**：
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

# 多个 pattern（OR）
rg "foo|bar"

# 统计每文件匹配数
rg --count-matches "TODO"
```

**关键参数**：
- `-t type`：文件类型过滤
- `-g glob`：glob 过滤
- `-l` / `-c` / `-n`：仅文件名/计数/行号
- `--json`：JSON 输出

**最佳实践**：记 5 个核心（`-l` / `-n` / `-i` / `-t` / `--json`）够用 90% 场景。

### 模式 17：与 grep / ag / git grep 对比

**问题场景**：团队代码评审有人用 grep、ag、git grep 风格；如何统一到 ripgrep？

**解决方案**：
- 速度：ripgrep > ag > git grep > grep（通常 2-35x）
- 默认行为：ripgrep = ag（gitignore aware），grep 无 ignore，git grep 限 git 仓库
- 兼容性：rg 用 GNU grep 子集（多数参数兼容）
- 替换策略：`alias grep='rg'` 或 `alias ag='rg'`

**关键参数**：
- 全部 ripgrep 优势：默认 gitignore + 跳二进制 + SIMD + 并行
- git grep 优势：git index 加速
- 替换老 CLI 后，记忆成本 0

**最佳实践**：用 ripgrep 替代 grep + ag；git grep 仅在 git 仓库中需要 zsh history 加速时用。

### 模式 18：CI 与脚本集成

**问题场景**：CI 跑 ripgrep 验证（lint / code smell / 不允许的 API）、shell 脚本处理输出。

**解决方案**：
```bash
# CI 检查 TODO 注释
! rg "TODO" --quiet src/  # exit 0 = found = fail

# 统计代码行
rg -c '.' -t ts | awk -F: '{sum+=$2} END {print sum}'

# 提取所有 import
rg "^import .* from " -o | sort -u

# 监控文件变化
rg --files-without-match "license" src/
```

**关键参数**：
- `--quiet`：仅 exit code（无输出）
- exit code：0 = found, 1 = not found, 2 = error
- `--null`：用 NUL 分隔（防文件名含空格）
- 与 `xargs` / `parallel` 配合

**最佳实践**：CI 用 `--quiet` 模式（无输出浪费 log）；大数据集用 `--null`。

### 模式 19：编辑器集成

**问题场景**：VSCode / Vim / Emacs 搜索功能依赖 ripgrep；如何配置最舒服？

**解决方案**：
- **VSCode**：内置 search 用 ripgrep（设置 `"search.useExperimentalRipgrep": true`）
- **Vim**：`grep` 替换为 `rg`，`Plug 'ctrlpvim/ctrlp.vim'` 配 ripgrep
- **Emacs**：`counsel-rg` / `deadgrep`（consult-rg）
- **JetBrains IDEs**：内置 Search Everywhere 用 ripgrep（IDEA 2023+）
- **Helix**：默认 ripgrep

**关键参数**：
- VSCode：`search.followSymlinks: false`
- 配 `.ignore` 排除 node_modules / .git
- `--max-columns=1000` 避免 IDE 卡

**最佳实践**：所有现代编辑器默认 ripgrep 后端；无需额外配置。

### 模式 20：贡献与扩展

**问题场景**：想给 ripgrep 提 PR / 加 feature / 修 bug；如何入门？

**解决方案**：
1. **阅读** `ARCHITECTURE.md` + `crates/*/README.md`
2. **从简单 issue** 入手（`good first issue` 标签）
3. **写测试** `tests/test_*.rs` 先加失败用例
4. **用 `cargo run -- args` 跑本地版本**
5. **跑全测试** `cargo test --all`
6. **写 changelog** `CHANGELOG.md`

**关键参数**：
- 仓库 monorepo：9 个 crate（`grep` / `ignore` / `regex` / `searcher` / `pcre2` 等）
- MSRV 1.85（Minimum Supported Rust Version）
- 性能敏感：跑 `cargo bench`
- lint：`cargo clippy --all`

**最佳实践**：先在 issues / Discussions 讨论设计；不要直接开大 PR。

---

## 附录：5 段必读代码

1. `crates/core/main.rs` — CLI 入口（clap 参数解析 + 调度 main）
2. `crates/core/app.rs` — 应用主循环（参数 + 路径 + 搜索 + 输出）
3. `crates/ignore/src/walk.rs` — `WalkParallel` 并行目录遍历（crossbeam 工作窃取）
4. `crates/regex/src/config.rs` — `meta::Regex` 抽象（DFA + NFA + literal 混合）
5. `crates/searcher/src/searcher/glue.rs` — 编排搜索与打印（Searcher + Printer + Sink）

## 一句话总结

ripgrep = Rust regex automata + SIMD 加速 + ignore-aware 并行遍历 + mmap 缓冲双策略，把"在大型代码库搜文本"做到 2-35x 速度提升 + 默认正确（gitignore + 跳二进制），是现代开发者终端搜索的事实标准。
