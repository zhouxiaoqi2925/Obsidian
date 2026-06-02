# exa - ls 的现代化替代品

**GitHub**: ogham/exa
**Star**: 23k+
**语言**: Rust
**主题**: 命令行工具 / ls 替代
**适用场景**: 日常 ls 体验升级 / 脚本化展示文件元信息

---

## 第一段：基础范式（模式 1-5）

### 模式 1：彩色输出与图标

**问题场景**：传统 `ls` 黑白输出无层级感，文件类型靠后缀猜，新手难分辨。

**解决方案**：exa 默认开 `--color=auto` + `--icons`（Nerd Font），按文件类型 + 权限 + 扩展名自动配色。`--color=always` 强制，`--color=never` 关。

**关键参数**：
- `--color=auto|always|never`
- `--icons=auto|always|never`
- `--color-scale=size|age` 大小/时间渐变
- `LS_COLORS` 兼容 GNU coreutils 配色

**最佳实践**：alias `ll='exa -alFh --icons'`；终端不支持 Nerd Font 关 `--icons`。

### 模式 2：网格/树/长格式视图

**问题场景**：ls 单一 `-l` 输出，文件多时难以扫描；tree 命令要单独装。

**解决方案**：exa 整合 4 种视图：默认网格、树形 `-T`、长格式 `-l`、扩展属性 `-l@`。`-G` grid、`-l` long、`-T` tree 三选一。

**关键参数**：
- `-l` / `-b` / `-G` / `-T` 视图切换
- `-R` 递归
- `--level=2` 树深度
- `--group-directories-first`

**最佳实践**：日常 `ls` 改 alias 为 `exa -alFh`；tree 视图 `--level=2 -T`。

### 模式 3：文件元信息扩展

**问题场景**：传统 ls 看不出 inode/git 状态/扩展属性；多个命令拼装。

**解决方案**：exa `--extended` / `-l@` 显示 xattr；`--git` 列 git 状态；`--inode` / `--links` / `--blocks` 多种开关。`--time=mtime|ctime|atime|birth` 切时间。

**关键参数**：
- `--git` 标 dirty
- `--inode` 显示 inode
- `-l@` xattr
- `--time-style=long-iso|relative|full-iso`

**最佳实践**：开发环境必 `--git` 标修改；运维 `--inode` 查硬链接。

### 模式 4：排序与过滤

**问题场景**：ls 排序单一 `-t`/`-S`，筛选需 grep 拼接。

**解决方案**：exa 多种排序 `--sort=name|size|modified|created|accessed|inode|type` + 反序 `-r`；过滤 `-d` 只看目录、`--group-directories-first`。

**关键参数**：
- `--sort=size -r` 倒序
- `--group-directories-first`
- `-d` / `--list-dirs`
- `-I '*.log'` 排除

**最佳实践**：大目录 `exa -lS | head` 找最大文件；`--sort=modified` 找最近改动。

### 模式 5：递归与脚本兼容

**问题场景**：脚本里 `ls -la` 输出格式被解析依赖，换 exa 兼容性。

**解决方案**：exa 配 `--oneline` 模仿 `ls -1`；脚本里走 `ls -la` alias 即可。exa 不解析 GNU `ls` 全部参数但常用兼容。

**关键参数**：
- `--oneline` 单列
- `-F` 文件类型标记
- `--no-permissions` 等价 `-g`
- `EXA_*` 环境变量

**最佳实践**：shell rc 配 `alias ls=exa` + `alias ll='exa -alFh'`；脚本用 `\ls` 走真 ls 防误改。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：超链接（terminal hyperlink）

**问题场景**：终端显示文件路径点不开；IDE 集成难。

**解决方案**：exa 支持 OSC 8 escape sequence，输出 `[name](file://...)` 可点击。VSCodium / iTerm2 / WezTerm 解析。

**关键参数**：
- `--hyperlink=auto|always|never`
- 终端能力探测
- `wezterm` / `iTerm2` 解析
- PowerShell 7+ 也支持

**最佳实践**：本地开发开 `--hyperlink=auto`；CI 关闭防日志污染。

### 模式 7：Nerd Font 与图标

**问题场景**：Nerd Font 字体装了图标却不显示 / 部分终端不支持。

**解决方案**：exa 自动探测 Nerd Font 加载情况；`--icons=always` 强制开启；`--icons=auto` 智能判断。配置 `~/.config/exa/icons.toml` 改映射。

**关键参数**：
- `--icons=auto|always|never`
- Nerd Font 字符集
- `icons.toml` 扩展名映射
- `EXA_ICONS_AUTO` 环境变量

**最佳实践**：终端配 `Hack Nerd Font` + exa `--icons=auto`；远程服务器无 Nerd Font 关 `--icons`。

### 模式 8：性能与 Rust 实现

**问题场景**：大目录 ls 卡顿；网络挂载目录 ls 慢。

**解决方案**：Rust 异步读取目录项 + 并行 stat；`--threads` 控制并发。`--no-permissions` / `--no-user` 跳 stat 提速。

**关键参数**：
- `--threads=N`
- `--no-permissions` 跳 stat
- 异步 tokio runtime
- 零拷贝路径处理

**最佳实践**：NFS / SMB 目录加 `--no-permissions --no-user` 提速 10x。

### 模式 9：配置文件

**问题场景**：exa 命令行参数多，每次敲烦。

**解决方案**：`~/.config/exa/config.toml` 全局配置；命令行参数覆盖。`--config` 指定自定义。

**关键参数**：
- `~/.config/exa/config.toml`
- `--config=path`
- CLI > ENV > File 优先级
- `EXA_CONFIG_DIR` 环境变量

**最佳实践**：日常 alias + config 双层；CI 走命令行明文。

### 模式 10：与其他工具的整合

**问题场景**：exa 仅展示，搜索/编辑需 fzf/vim/rg 接力。

**解决方案**：`exa | fzf` 模糊搜；`exa -l | awk` 提取列；`$(exa *.md | fzf)` 选文件。`bat` 配合做语法高亮。

**关键参数**：
- `exa -l | awk '{print $NF}'` 拿路径
- `exa | fzf --preview 'bat {}'`
- `xargs` 批量操作
- 配合 `zoxide` 跳转

**最佳实践**：`alias v='vim $(exa | fzf)'`；CI 流水线 `exa --json` 解析。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：与 ls 的语义差异

**问题场景**：换 exa 后脚本解析崩 / 部分 shell prompt 异常。

**解决方案**：exa 默认行为与 `ls` 80% 兼容，差异点：默认 `-G` grid 不是 `-l` long；颜色默认开；`-F` 默认带。`alias ls=exa` 时谨慎。

**关键参数**：
- `--classify` `-F` 强制
- `--colour` 同 `--color`
- 兼容 POSIX `ls`
- 路径单引号处理

**最佳实践**：脚本里用 `\ls` 避免 alias；powerlevel10k prompt 走 `ls` 别名。

### 模式 12：符号链接处理

**问题场景**：symlink 显示与目标混淆；递归时循环引用。

**解决方案**：exa 默认不跟随 symlink；`--follow-symlinks` 跟随；递归默认不陷循环。`--no-symlinks` 关闭递归。

**关键参数**：
- `--follow-symlinks`
- symlink 颜色 + 箭头
- target 显示
- 循环检测

**最佳实践**：日常不开 follow；运维检查 symlink 用 `readlink` 单独命令。

### 模式 13：JSON 输出（exa-derived）

**问题场景**：脚本要解析文件列表做处理。

**解决方案**：`eza`（exa 继任者）支持 `--json` 输出；原 exa 不支持 JSON，需 `awk` 解析文本。

**关键参数**：
- `eza --json`
- `--json` 字段标准
- `jq` 后处理
- `null` 字段兼容

**最佳实践**：脚本走 eza + jq；老 exa 走 `awk` 提取。

### 模式 14：可访问性（a11y）

**问题场景**：色盲用户难以区分颜色；屏幕阅读器（screen reader）友好。

**解决方案**：exa 配色用 Okabe-Ito 色盲友好调色板；`--color=never` 关颜色走纯文本；符号标记（`/ *`）辅助类型。

**关键参数**：
- `LS_COLORS` 自定义
- `di=01;34` ANSI 码
- 字符标记 `-F`
- 大字体模式

**最佳实践**：色盲用户走 `--color=never` + `-F` 字符标记。

### 模式 15：exa → eza 迁移

**问题场景**：exa 已 archived（2022 起），社区分叉 `eza` 持续维护。

**解决方案**：换装 eza（原 exa 维护者之一 `caelansears` 接手），命令兼容 `--icons` / `--git` / `--hyperlink` 全保留，加 `--json` / `--mounts` 等新功能。

**关键参数**：
- `eza --all --long --header --icons --git`
- `eza -alFh --git` 日常
- `eza --tree --level=2` 树
- Homebrew / cargo 安装

**最佳实践**：新项目直接 eza；老 exa 配置可平移；`alias ls=eza`。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：日常 shell 工作流

**问题场景**：开发者每天上百次 ls，效率瓶颈。

**解决方案**：zsh/bash `alias ls='eza'`，配合 `zoxide` + `fzf`：常用目录用 `z` 跳，文件搜 `fzf` 选。

**关键参数**：
- `alias ls='eza --icons'` 
- `alias ll='eza -alFh --icons --git'`
- `alias lt='eza -al --sort=modified | head -20'`
- `alias tree='eza --tree --level=3'`

**最佳实践**：starSHIP / powerlevel10k 主题支持 eza；`.zshrc` 集中配置。

### 模式 17：脚本与 CI 用法

**问题场景**：CI 流水线要列出构建产物 / 提取 metadata。

**解决方案**：`eza -l --json` 解析；`--no-permissions --no-user` 提速；`--sort=size` 找大文件。`--only-dirs` / `--only-files` 过滤。

**关键参数**：
- `eza --only-files` 跳过目录
- `eza --only-dirs`
- `--ignore-glob='*.log'`
- `eza -lR --json | jq`

**最佳实践**：CI 必显式 `--color=never` 防 ANSI 污染日志；输出 `--json` 走 jq 解析。

### 模式 18：服务器与远程工作

**问题场景**：SSH 远程服务器 ls 体验差；无 Nerd Font 字体。

**解决方案**：服务器装 `eza` 二进制（无依赖）；`--icons=never` 关闭；`--no-permissions` 跳 stat 适配 NFS。

**关键参数**：
- 服务器无 GUI 必 `--icons=never`
- 网络挂载 `--no-permissions`
- `LANG=C` 防 Unicode
- `TERM=xterm-256color`

**最佳实践**：dotfiles 仓库统一 alias；server install eza binary；本地配置 + 远程 alias 分离。

### 模式 19：教学与新手

**问题场景**：新人学 Linux 不懂 `ls -la` 那一堆字母；颜色和符号更直观。

**解决方案**：exa/eza 把 `drwxr-xr-x` 标色 + 区分文件类型；`--header` 显示列名；`--group` 显示属组；新手友好。

**关键参数**：
- `-l --header`
- `--color-scale=age`
- `LS_COLORS` 高亮特殊
- 图标区分文件类型

**最佳实践**：教学环境默认 exa；配 `bat`（cat 替代）+ `fd`（find 替代）+ `zoxide`（cd 替代）。

### 模式 20：未来与替代品

**问题场景**：exa 2022 archived，eza 持续更新；其他 ls 替代（lsd / lsd-rs）。

**解决方案**：eza 是首选继任；lsd 是 Rust 替代（lsd-rs），支持 Nerd Font 略弱。`broot` 是树形交互工具补充。

**关键参数**：
- eza 加 `--json` / `--mounts`
- lsd `lsd -l --icon theme=fancy`
- broot 交互式
- `nushell` 替代 shell

**最佳实践**：新项目 eza；老 exa 升级 eza；nushell + broot 是更激进的现代化路径。
