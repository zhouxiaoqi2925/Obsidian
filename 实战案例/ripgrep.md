# ripgrep - Rust 写的极速命令行文本搜索

**GitHub**: BurntSushi/ripgrep
**Star**: 51k+
**语言**: Rust
**主题**: cli、regex、search、rust
**适用场景**: 代码搜索、日志分析、批量替换、文件内容查找

---

## 一、基础范式

### 模式 1 · 递归搜索（rg "pattern"）

**问题场景**：`grep -r` 慢、参数复杂、跳过 `.git` 需要 `--exclude-dir`。

**解决方案**：`rg "pattern"` 一行递归搜索；自动忽略 `.gitignore` / `.git` / 二进制文件；速度比 grep 快 10x。

**关键参数**：
- `rg "pattern"`
- 递归默认
- 忽略 .gitignore
- 跳过二进制
- 0 配置

**最佳实践**：所有代码搜索用 rg，告别 grep -r 复杂参数。

### 模式 2 · 文件类型过滤（-t + 全局类型）

**问题场景**：只想在 JS 文件搜索，需要 find + grep 组合。

**解决方案**：`rg "TODO" -t js` 只搜 JS 文件；`--type-add 'web:*.{html,css,js}' -t web` 自定义类型；内置 30+ 文件类型（python / rust / js / json 等）。

**关键参数**：
- `-t js`
- `--type-add`
- 30+ 类型
- 自定义
- 0 find

**最佳实践**：所有语言相关搜索用 `-t` 类型过滤。

### 模式 3 · Glob 过滤（-g）

**问题场景**：只在某些文件搜（`*.test.ts`）。

**解决方案**：`rg "test" -g '*.test.ts'` glob 匹配；`rg "test" -g '!node_modules'` 排除；多 glob 组合。

**关键参数**：
- `-g '*.test.ts'`
- `-g '!node_modules'`
- 多 glob
- 排除 / 包含
- 灵活

**最佳实践**：所有需要文件过滤的搜索用 `-g` glob。

### 模式 4 · 替换（rg + xargs / sd）

**问题场景**：搜索并替换（ripgrep 不直接替换）。

**解决方案**：`rg "old" -l | xargs sed -i 's/old/new/g'`；`sd "old" "new" file.txt`（sd 是 ripgrep 兼容的现代替换工具）；ripgrep 13+ 实验性 `--replace` 选项。

**关键参数**：
- `rg -l` 列出文件
- `xargs sed -i`
- `sd` 工具
- 批量替换
- 0 手写

**最佳实践**：所有搜索替换用 `rg -l` + `sd` / `sed`，比 IDE 更快。

### 模式 5 · 正则 + 大小写（-i / -F）

**问题场景**：需要正则 / 大小写不敏感 / 固定字符串。

**解决方案**：`rg "TODO|FIXME"` 正则默认；`-F "fixed string"` 固定字符串（更快）；`-i` 大小写不敏感；`-w` 单词边界；`-x` 整行匹配。

**关键参数**：
- 默认正则
- `-F` 固定
- `-i` 大小写
- `-w` 单词
- `-x` 整行

**最佳实践**：所有复杂模式用正则，固定字符串用 `-F` 提速。

---

## 二、扩展范式

### 模式 6 · 多线程 + SIMD 加速

**问题场景**：传统 grep 单线程，大目录慢。

**解决方案**：ripgrep 用 Rust + 多线程（默认 CPU 核数）+ SIMD 加速 + memory-map 文件 I/O，搜索速度比 grep 快 10-100x。

**关键参数**：
- Rust 核心
- 多线程
- SIMD
- memory-map
- 10-100x 速度

**最佳实践**：所有大项目搜索用 ripgrep，秒级响应。

### 模式 7 · JSON 输出（--json）

**问题场景**：脚本需要结构化处理搜索结果。

**解决方案**：`rg "TODO" --json` 每行输出 JSON `{ type: "match", data: { path: { text: ... }, lines: { text: ... }, submatches: [...] } }`；脚本 jq 处理。

**关键参数**：
- `--json`
- 结构化输出
- `jq` 处理
- 脚本友好
- 0 解析

**最佳实践**：所有脚本处理搜索结果用 `--json` + `jq`。

### 模式 8 · 上下文显示（-A / -B / -C）

**问题场景**：搜索时需要看上下文（前后几行）。

**解决方案**：`rg "func" -A 5 -B 2` 后 5 行前 2 行；`-C 3` 前后各 3 行；`--field-match` 仅字段匹配。

**关键参数**：
- `-A 5` 后文
- `-B 2` 前文
- `-C 3` 上下
- 上下文
- 阅读友好

**最佳实践**：所有代码搜索用 `-C` 看上下文，定位快 5x。

### 模式 9 · 多文件编码支持

**问题场景**：搜到二进制 / 编码异常文件。

**解决方案**：`rg` 默认跳过二进制（通过 NUL 字节检测）；`--text` 强制当作文本；`--encoding utf-8` 显式编码；`--no-encoding` 关闭。

**关键参数**：
- 自动跳过二进制
- `--text` 强制
- `--encoding`
- 多编码
- 0 崩溃

**最佳实践**：所有跨编码项目用 ripgrep，零崩溃。

### 模式 10 · PCRE2 / Rust 正则引擎切换

**问题场景**：需要 PCRE 高级特性（look-around / 原子组）。

**解决方案**：`rg "pattern" -P` PCRE2 引擎；默认 Rust 正则（更快但功能少）；`--regex-size-limit 100M` 大正则。

**关键参数**：
- `-P` PCRE2
- Rust regex
- look-around
- 原子组
- 性能 / 兼容

**最佳实践**：所有 PCRE 特性用 `-P`，常规用默认 Rust regex（更快）。

---

## 三、进阶范式

### 模式 11 · 文件预览（--files / --files-without-match）

**问题场景**：只想列出包含 / 不包含的文件名。

**解决方案**：`rg "TODO" --files-with-matches` 只输出文件名；`rg "TODO" -l` 同义；`rg --files` 列出所有被搜文件（受 ignore 限制）。

**关键参数**：
- `--files-with-matches`
- `-l`
- `--files`
- 文件名模式
- 0 内容

**最佳实践**：所有「找文件」场景用 `-l` 模式。

### 模式 12 · 多模式 + 或（-e / --or）

**问题场景**：需要搜多个模式（`TODO|FIXME`）。

**解决方案**：`rg -e "TODO" -e "FIXME"` 多 `-e` 自动 OR；`rg "(TODO|FIXME)"` 正则；`--regex "(foo|bar)"` 显式正则。

**关键参数**：
- `-e "pattern"`
- 多 `-e`
- 自动 OR
- 0 转义
- 灵活

**最佳实践**：所有「多模式」用 `-e` 多参数，告别转义。

### 模式 13 · 隐藏文件 + 符号链接（--hidden / -L）

**问题场景**：需要搜隐藏文件（`.env`）或跟随符号链接。

**解决方案**：`rg "SECRET" --hidden` 搜隐藏文件；`rg "x" -L` 跟随符号链接（默认 -uuu 也搜所有）；`--no-ignore` 关闭 gitignore。

**关键参数**：
- `--hidden`
- `-L` 符号链接
- `--no-ignore`
- 灵活控制
- 0 默认

**最佳实践**：所有 `.env` / 配置搜索用 `--hidden`。

### 模式 14 · 统计（--count / -c）

**问题场景**：需要每个文件匹配数量统计。

**解决方案**：`rg "TODO" -c` 每文件匹配数；`--count-matches` 匹配数（与 `-c` 略不同）；`--stats` 详细统计（搜索的文件 / 行 / 字节 / 时间）。

**关键参数**：
- `-c` 计数
- `--count-matches`
- `--stats`
- 调试
- 0 手写

**最佳实践**：所有统计场景用 `-c` / `--stats`。

### 模式 15 · 自定义 ignore（--ignore-file）

**问题场景**：项目没有 `.gitignore` 或需要临时 ignore。

**解决方案**：`rg --ignore-file my-ignore.txt` 自定义 ignore；`-uu` 不忽略隐藏 + .gitignore；`-uuu` 全不忽略（搜所有）。

**关键参数**：
- `--ignore-file`
- `-uu` / `-uuu`
- 灵活忽略
- 0 强制

**最佳实践**：所有临时搜索用 `-uuu` 看完整结果。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 ripgrep 工作流。

**解决方案**：7 件套：① `rg "pattern"` 基础搜索 ② `-t js` 类型过滤 ③ `-g '*.test.*'` glob 过滤 ④ `-C 3` 上下文 ⑤ `--json` 结构化 ⑥ `sd` 替换 ⑦ `fzf` 集成。

**关键参数**：
- `rg`
- `-t`
- `-g`
- `-C`
- `--json`
- `sd`
- `fzf`

**最佳实践**：所有开发环境装 rg + sd + fzf 三件套，搜索体验 10x。

### 模式 17 · 与 fzf 集成（Ctrl-R 历史 / Ctrl-T 文件）

**问题场景**：命令行历史 / 文件名搜索。

**解决方案**：`source <(rg --generate-bash-completion)` 自动补全；`Ctrl-R` ripgrep 替换 fzf 搜索历史；`Ctrl-T` 选文件。

**关键参数**：
- bash 补全
- `Ctrl-R` 历史
- `Ctrl-T` 文件
- 0 手动
- shell 集成

**最佳实践**：所有 shell 用户用 rg + fzf + fzf-git，工作流 10x。

### 模式 18 · 性能优化 5 招

**问题场景**：ripgrep 大项目搜索慢。

**解决方案**：5 招优化：① `-F` 固定字符串（比正则快）② `--threads N` 控制线程 ③ `--max-columns` 截断长行 ④ `--max-depth` 限制深度 ⑤ 排除大目录 `node_modules` / `.git`。

**关键参数**：
- `-F`
- `--threads`
- `--max-columns`
- `--max-depth`
- 排除

**最佳实践**：5 招组合，ripgrep 性能极致。

### 模式 19 · 与 grep / ag / The Silver Searcher 对比

**问题场景**：CLI 搜索工具选型。

**解决方案**：ripgrep 定位「Rust + SIMD + 自动 ignore + 最快」是事实标准；grep 定位「POSIX 标准 + 通用」；ag（The Silver Searcher）定位「ripgrep 之前的快搜」已过时；`ugrep` 定位「更多功能（fzf 集成）」。

**关键参数**：
- 速度：ripgrep > ugrep > ag > grep
- 默认 ignore：ripgrep > ugrep > ag > grep
- 跨平台：grep > ripgrep > ag > ugrep
- 现代：ripgrep > ugrep > ag > grep

**最佳实践**：所有现代项目用 ripgrep，POSIX 脚本用 grep。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork ripgrep 做内部搜索工具。

**解决方案**：7 天分 5 步：① Rust 项目 + clap CLI ② walkdir 递归 ③ regex 搜索 ④ ignore crate 处理 .gitignore ⑤ 输出格式化。

**关键参数**：
- Day 1: CLI
- Day 2: walkdir
- Day 3: regex
- Day 4: ignore
- Day 5: 输出
- Day 6-7: 性能优化

**最佳实践**：7 天复刻「极简 grep」，完整 ripgrep（含 SIMD / PCRE2）需要 3 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\ripgrep\`
- **大小**: ~50 MB（含 Rust 依赖）
- **总文件数**: 数百 Rust 文件
- **关键 commit**: v14.x
- **作者**: Andrew Gallant (BurntSushi)
- **许可**: MIT / Unlicense

## 一句话总结

ripgrep 用「Rust + SIMD + 多线程 + memory-map + 自动 .gitignore」把 CLI 文本搜索做到极致速度和体验，是 grep 时代后命令行搜索的事实标准。
