# fd - find 的现代化替代品

**GitHub**: sharkdp/fd
**Star**: 38000+
**语言**: Rust
**主题**: 命令行工具 / 文件搜索
**适用场景**: 替代 find / 配合 ripgrep / 脚本化文件操作

---

## 第一段：基础范式（模式 1-5）

### 模式 1：智能模式匹配

**问题场景**：`find . -name "*.rs"` 复杂语法难记；正则慢。

**解决方案**：fd 默认 glob 模式（`fd '\.rs$'`）；同时支持 regex。`fd foo` 搜文件名含 `foo`，不写扩展名。忽略 `.git` `node_modules` 默认。

**关键参数**：
- `fd pattern path` 简单搜
- `-e EXT` 扩展名过滤 `fd -e rs`
- `--type f|d|l|s` 文件类型
- `-i` 忽略大小写
- `-H` 包含隐藏文件

**最佳实践**：日常 `fd pattern`；指定扩展名 `fd -e md todo`；脚本走 `--type f`。

### 模式 2：并行与速度

**问题场景**：find 慢（百万文件级别）；多核 CPU 浪费。

**解决方案**：fd 用 Rust + rayon 并行遍历 + 自适应线程池。实测比 `find` 快 5-10x。

**关键参数**：
- 默认并行
- `--threads=N` 控制并发
- 大目录 `find`/`fd` 同样有 I/O 瓶颈
- 内存 mmap

**最佳实践**：脚本里用 fd 替代 find；监控 wall time；网络挂载目录跳过 fd 慢。

### 模式 3：扩展名与类型过滤

**问题场景**：找特定类型文件（图片/代码/配置）；`find -name` 不直观。

**解决方案**：`-e js,ts` 多扩展名；`--type f|d|l|e|x` 文件类型（file/dir/symlink/empty/executable）；`--extension` 多值。

**关键参数**：
- `-e rs -e toml` 多扩展
- `--type f|d|l|s|p|e|x`
- `--size +1M` 大小
- `--owner user`

**最佳实践**：`fd -e png -e jpg images`；`fd --type f --size +1M` 找大文件。

### 模式 4：执行命令（--exec / -x）

**问题场景**：find -exec 语法难记，shell 转义麻烦。

**解决方案**：`fd pattern -x command` 用 `{}` 占位；`fd -X command` 一次性传所有结果。`fd -0` null 分隔。

**关键参数**：
- `fd -e log -x rm` 删除所有 .log
- `fd -e jpg -X chmod 644` 批量改权限
- `-0` null 分隔（配合 xargs -0）
- `--batch-size 100` 流式

**最佳实践**：`fd -e tmp -X rm` 替代 `find ... -exec rm`；`--batch-size` 防止参数过长。

### 模式 5：忽略规则

**问题场景**：find 默认遍历 `.git` `node_modules` 慢；gitignore 不生效。

**解决方案**：fd 默认忽略 `.gitignore` / `.fdignore` / `.ignore` 模式。`--no-ignore` 关；`--ignore-file` 自定义。

**关键参数**：
- `--no-ignore` 全遍历
- `--ignore-file PATH`
- `.fdignore` 项目级
- `.gitignore` 默认支持

**最佳实践**：用 `.fdignore` 项目级配置；CI 跑 `fd --no-ignore` 查全部。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：深度与时间过滤

**问题场景**：限制搜索深度（只搜顶层）；按时间筛。

**解决方案**：`--max-depth N` / `--min-depth N`；`--changed-within` / `--changed-before` 配 human time（`1d` / `2weeks`）。

**关键参数**：
- `--max-depth 1` 只看顶层
- `--min-depth 2` 跳过顶层
- `--changed-within 1day` 24h 内
- `--changed-before 2024-01-01`

**最佳实践**：`fd --max-depth 1` 替代 `ls` 列出文件；找最近改动 `fd --changed-within 1day`。

### 模式 7：大小过滤

**问题场景**：找大文件清理 / 找空文件。

**解决方案**：`--size +100M` / `--size -1k`（+/- 表示大于/小于）；`--type e` 空文件/目录。

**关键参数**：
- `--size +1M` 大于 1M
- `--size -1k` 小于 1k
- `--type e` 空文件
- `+1G` / `+500K` 单位

**最佳实践**：`fd --type f --size +100M` 找大文件清理；`fd --type e` 找空目录。

### 模式 8：与 ripgrep 配合

**问题场景**：fd 找文件 → ripgrep 搜内容。

**解决方案**：`fd -e py | xargs rg pattern`；`fd -e py -X rg pattern {}`；`rg --files` 本身就是文件列表。`bat` 配合预览。

**关键参数**：
- `fd -e py | xargs rg 'TODO'`
- `fd -X rg pattern {}`
- `rg --files` 内置文件列表
- `fzf` 模糊选

**最佳实践**：`fd -e py | fzf | xargs vim` 选文件编辑；`fd -e md | xargs bat` 预览。

### 模式 9：颜色与可读性

**问题场景**：find 输出无层级，路径长难扫描。

**解决方案**：fd 默认开颜色，按路径组件着色；`--color=never` 关；`--print0` null 分隔。

**关键参数**：
- 默认 `--color=auto`
- 路径组件按 `/` 着色
- `--print0` / `-0`
- `--format` 自定义输出

**最佳实践**：终端走默认彩色；管道走 `--color=never`；脚本走 `--print0`。

### 模式 10：配置文件

**问题场景**：fd 命令行参数多，每次敲烦。

**解决方案**：项目级 `.fdignore` 走 ignore；命令行 alias + `~/.config/fd/config` 配默认。`--search-path` 默认搜路径。

**关键参数**：
- `.fdignore` 项目级
- `~/.config/fd/config.toml`
- `--search-path PATH` 默认
- CLI > ENV > config 优先级

**最佳实践**：项目根 `.fdignore` + 全局 alias；CI 走命令行明文。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：与 find 的语义差异

**问题场景**：find 命令粘到脚本，fd 跑出不同结果。

**解决方案**：fd 默认忽略 `.gitignore`、`.git`、`node_modules`；find 不会。fd 默认递归；find 必带 `-r` 递归。fd 默认输出相对路径。

**关键参数**：
- fd 默认 recursive
- fd 默认忽略隐藏
- fd 模式是 glob/regex
- find `-print0` → fd `--print0`

**最佳实践**：迁移时显式 `--no-ignore` + `--hidden`；脚本用 `\fd` 区别 alias。

### 模式 12：符号链接

**问题场景**：symlink 死链/循环。

**解决方案**：fd 默认不跟随 symlink；`--follow` 跟随；`--type l` 找 symlink。

**关键参数**：
- `--follow` 跟随
- `--type l` 链
- 死链检测
- 循环保护

**最佳实践**：清理死链 `fd --type l -X readlink`；不跟随防循环。

### 模式 13：性能调优

**问题场景**：超大目录遍历慢；NFS 挂载慢。

**解决方案**：`--threads=1` 顺序走（网络挂载）；`--max-depth 1` 限制；`--no-ignore` 关闭 ignore 解析。

**关键参数**：
- `--threads=N`
- `--max-depth 1`
- `--no-ignore`
- 跳过 network mount

**最佳实践**：NFS/SMB 走 `fd --threads=1 --max-depth 5`；本地 SSD 默认并行。

### 模式 14：JSON 输出

**问题场景**：脚本要解析文件列表做处理。

**解决方案**：fd 暂无 JSON 输出，靠 `--format` 自定义文本 + awk 解析。`eza` 有 JSON 但 fd 暂未跟进。

**关键参数**：
- `--format` 自定义
- 文本 + awk
- `--print0` + xargs
- `rg --json` 配合

**最佳实践**：脚本走 `fd --print0` + `xargs -0`；JSON 需求走 eza --json。

### 模式 15：特殊模式

**问题场景**：smart-case / 全字匹配 / 正则。

**解决方案**：默认 smart-case（大写敏感）；`--regex` 强制正则；`--fixed-strings` 字符串字面量。

**关键参数**：
- 默认 smart-case
- `--regex` / `--glob`
- `-F` / `--fixed-strings`
- `^foo` 锚定开头

**最佳实践**：模糊搜走默认；锚定走 `--regex '^main'`；shell 特殊字符 `\\` 转义。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：shell 工作流

**问题场景**：日常 `find` 命令痛苦；管道与 xargs 繁琐。

**解决方案**：zsh/bash alias `f=fd`；`FZF_DEFAULT_COMMAND='fd --type f'` 配 fzf；`fd -e py | xargs -I {} vim {}` 编辑多个。

**关键参数**：
- `alias f='fd --type f'`
- `FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'`
- `fd -X vim` 批量打开
- `fd -0 | xargs -0`

**最佳实践**：dotfiles 仓库统一 alias；`fzf` 集成；`bat` 预览。

### 模式 17：CI 流水线

**问题场景**：CI 找构建产物 / 扫过时文件 / 验证 ignore。

**解决方案**：`fd --no-ignore -e log` 找所有日志；`fd --type f --size +50M` 找大文件；`fd --changed-within 1hour` 找最近修改。

**关键参数**：
- `fd --no-ignore` 全遍历
- `fd --type f --size +N` 大小
- `fd --changed-within 1h` 时间
- `fd --owner root` 属主

**最佳实践**：CI 必 `--no-ignore` 完整性；时间过滤找新文件；JSON 走 `awk`。

### 模式 18：备份与归档

**问题场景**：备份某目录但排除 .git / node_modules。

**解决方案**：`fd --type f -X tar -czf backup.tar.gz {}`；配合 `.fdignore` 排除规则。

**关键参数**：
- `fd --type f` 排除目录
- `tar -czf backup.tar.gz` 归档
- `.fdignore` 排除
- `fd --max-depth 1` 顶层

**最佳实践**：备份前 `fd --type f > files.txt` 验证；rsync 走 `--exclude-from`。

### 模式 19：教学与新手

**问题场景**：`find` 语法老旧，新手难上手。

**解决方案**：fd 默认行为友好（recursion、ignore、颜色）；配 `bat` + `eza` + `zoxide` 构成现代化 shell 工具链。

**关键参数**：
- `fd` 默认递归
- 颜色 + 路径分层
- `--type` 直观类型
- `-e` 扩展名

**最佳实践**：教学环境默认 fd；教 `find` 必先教 fd；统一工具链降学习曲线。

### 模式 20：未来与生态

**问题场景**：fd 与其他工具（fselect / broot）关系。

**解决方案**：fd 是 POSIX find 替代；fselect 是 SQL 风格文件查询；broot 交互式树形。fd 维护活跃（sharkdp 还在更新）。

**关键参数**：
- fd 文件名搜索
- fselect SQL 风格
- broot 交互树
- `nushell` 替代 shell

**最佳实践**：日常用 fd；交互式用 broot；SQL 需求用 fselect。
