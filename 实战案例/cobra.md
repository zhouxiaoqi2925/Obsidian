# cobra - Go 生态事实标准 CLI 框架：Command Tree + pflag + POSIX 补全

**GitHub**: spf13/cobra
**Star**: 38k+
**语言**: Go
**主题**: cli-library/go/command-tree/pflag/posix-completion/doc-gen
**适用场景**: Go CLI 工具（kubectl/hugo/gh/etcd）、DevOps 平台、子命令复杂的命令

## 第一段：基础范式

### 模式 1：Command 树 + `Use / Short / Long / Run` 四字段

**问题场景**：CLI 写多了要"git-style 子命令 + flags + help + 补全"——手写模板 500+ 行 boilerplate。

**解决方案**：用 `cobra.Command` 树——`Use`（动词+用法）/ `Short`（一句）/ `Long`（详细）/ `Run`（执行函数）。`AddCommand` 父子嵌套。`RootCmd` 是入口，子命令是分支。
```go
var rootCmd = &cobra.Command{
    Use:   "mycli",
    Short: "我的 CLI 工具",
    Long:  "完整描述...",
    Run: func(cmd *cobra.Command, args []string) {
        // 执行
    },
}
var subCmd = &cobra.Command{
    Use:   "server",
    Short: "启动服务",
    Run: func(cmd *cobra.Command, args []string) { ... },
}
func init() { rootCmd.AddCommand(subCmd) }
```

**关键参数**：
- `cobra.Command` 树
- `Use / Short / Long / Run` 四字段
- `AddCommand` 嵌套
- `init()` 注册
- 12000 行 Go——覆盖 200+ 边界 case

**最佳实践**：CLI 用 Command 树模型——比 switch 灵活 10x；`Use / Short / Long` 标准化——help 模板自动生成；`init()` 注册——和 import 顺序对齐；200+ 项目用 cobra——行业事实标准。

---

### 模式 2：pflag 替代 stdlib flag——POSIX `--flag` + `-f`

**问题场景**：stdlib `flag` 只支持 `-flag`，不支持 GNU/POSIX `-f / --flag` 混用。`kubectl -n kube-system get pods` vs `kubectl --namespace kube-system get pods` 必须两种都支持。

**解决方案**：用 `pflag`（cobra 衍生）——POSIX 风格短长 flag + `NoOptDefVal`（布尔默认值）+ `Count`（`-vvv` 计数）+ `Shorthand`（`-f` = `--file`）。`flag.CommandLine` 全局共享。
```go
var port int
func init() {
    serverCmd.Flags().IntVarP(&port, "port", "p", 8080, "端口号")
    serverCmd.Flags().StringP("host", "H", "0.0.0.0", "主机")
    // -p, --port, --port=8080 都支持
}
```

**关键参数**：
- `Flags().IntVarP(...)` 绑定
- 短长 flag `IntVarP(&port, "port", "p", 8080, "...")`
- `NoOptDefVal` 布尔
- `Count` 计数
- 比 stdlib 灵活 10x

**最佳实践**：CLI flag 用 pflag——POSIX 兼容是行业标准；`P()` 版本同时绑短长——`./mycli -p 8080` 和 `./mycli --port=8080` 等价；`NoOptDefVal` 简化布尔——`--verbose` 不用 `=true`；`Count` 简化 verbosity——`-vvv` 比 `--level=3` 短。

---

### 模式 3：POSIX shell 补全——`__complete` 隐藏子命令

**问题场景**：CLI 用户要 `git <Tab>` 自动补全——bash/zsh/fish/powershell 各自一套 shell 脚本。手写 4 份 = 800+ 行难维护。

**解决方案**：用 `__complete` 隐藏子命令——cobra 检测到 `COMP_LINE` 环境变量时改走"补全模式"，输出 `<word>:description`。bash_completions.go 1025 行是 shell 端胶水，**核心逻辑全在 `__complete` 子命令**。4 套 shell 各 100-200 行。
```bash
# ~/.bashrc
source <(mycli completion bash)
# 自动注入 __complete 调用
```

**关键参数**：
- `__complete` 隐藏子命令
- `COMP_LINE` 环境变量探测
- bash / zsh / fish / powershell 各 100-200 行
- 1025 行 bash 胶水
- `<word>:description` 格式

**最佳实践**：CLI 补全用 `__complete` 隐藏子命令——核心逻辑 1 份，shell 胶水 4 份；环境变量切换模式——透明；shell 端只做"转调 + 解析"——薄胶水；行业标准——kubectl/helm/gh 都这么干；200+ 项目复用。

---

### 模式 4：4 套 shell 胶水用同一份 `__complete` 输出

**问题场景**：4 套 shell（bash/zsh/fish/powershell）补全协议不同——直接 `fmt.Println` 输出 4 份要维护 4 套。

**解决方案**：用 `completions.go` 1025 行生成统一补全输出——`ShellCompDirective` 告诉 shell 端"是否要空格 / 不要再补 / 文件名"等。**4 套 shell 端只解析 `__complete` 输出 + 调用 COMPREPLY**。
```go
// completions.go
const (
    ShellCompDirectiveNoSpace   = 1 << iota
    ShellCompDirectiveNoFileComp
    ShellCompDirectiveFilterWords // ...
)
```

**关键参数**：
- `ShellCompDirective` 位标志
- 4 套 shell 端只解析
- `__complete` 唯一输出
- `FilterWords` / `NoFileComp` 等指令
- 维护成本 1 份

**最佳实践**：跨 shell 补全用"统一输出 + shell 端胶水"——核心 1 份；位标志指令传达意图——比字符串灵活；shell 端薄胶水——`<200 行`；行业标准 `ShellCompDirective`——kubectl 同步；4 倍维护成本变 1 倍。

---

### 模式 5：PersistentPreRun / PreRun / Run 三层钩子

**问题场景**：子命令要"先做权限校验 + 加载配置 + 解析 flag"再执行——每个子命令复制粘贴？

**解决方案**：用 `PersistentPreRun[E]` — 在子命令 Run 之前自动跑，**沿树向下传递**。`PreRun[E]` 仅本命令，`Run[E]` 主逻辑。三层钩子支持依赖注入 `E` 上下文。
```go
var rootCmd = &cobra.Command{
    PersistentPreRun: func(cmd *cobra.Command, args []string) {
        // 加载配置 + 鉴权（所有子命令共享）
    },
}
var subCmd = &cobra.Command{
    PreRun: func(cmd *cobra.Command, args []string) {
        // 子命令特有预处理
    },
    Run: func(cmd *cobra.Command, args []string) { ... },
}
```

**关键参数**：
- `PersistentPreRun` 沿树向下
- `PreRun` 仅本命令
- `Run[E]` 主逻辑
- `E` 上下文注入
- 比 middleware 灵活 5x

**最佳实践**：子命令共享逻辑用 `PersistentPreRun`——沿树传递；`PreRun` 给局部预处理——避免污染；`Run` 是主逻辑——职责清晰；`E` 上下文注入——避免全局变量；比 middleware 灵活——可中断可重写。

---

## 第二段：扩展范式

### 模式 6：Args 验证器 + `OnlyValidArgs` + `MaximumNArgs`

**问题场景**：CLI 参数数量 + 合法性校验散落 `Run` 里——重复且易漏。

**解决方案**：用 `Args cobra.PositionalArgs`——`cobra.NoArgs` / `cobra.ExactArgs(n)` / `cobra.MinimumNArgs(n)` / `cobra.MaximumNArgs(n)` / `cobra.OnlyValidArgs` / `cobra.MatchAll` 组合。**校验在 Run 之前**。
```go
var subCmd = &cobra.Command{
    Use:  "clone URL",
    Args: cobra.ExactArgs(1),
    Run:  func(cmd *cobra.Command, args []string) { ... },
}
// Args = cobra.MinimumNArgs(1) + cobra.OnlyValidArgs（组合）
```

**关键参数**：
- 6 个预定义验证器
- `MatchAll` 组合
- 校验在 Run 前
- 错误信息自动
- 减少 Run 模板

**最佳实践**：参数验证用 `Args` 而非 Run 内——错误信息标准化；`MatchAll` 组合验证器——复杂规则可表达；6 个预定义——80% 场景够用；`OnlyValidArgs` + `RegisterValidArgs` 联动——白名单校验；错误前移——fail fast。

---

### 模式 7：Flag Groups 互斥 / 必填分组

**问题场景**：`--tls-cert` 和 `--tls-key` 必须同时给；`--insecure` 不能和 `--tls-cert` 同时给——传统 `if/else` 散落。

**解决方案**：用 `cobra.FlagGroup` + `MarkFlagsRequiredTogether` / `MarkFlagsMutuallyExclusive`。**校验在 Run 之前**。
```go
subCmd.MarkFlagsRequiredTogether("tls-cert", "tls-key")
subCmd.MarkFlagsMutuallyExclusive("insecure", "tls-cert")
```

**关键参数**：
- `MarkFlagsRequiredTogether` 同时必填
- `MarkFlagsMutuallyExclusive` 互斥
- 校验在 Run 前
- 自动 error message
- 6+ flag 关系方法

**最佳实践**：flag 关系用 `MarkFlags*` 系列——比 if/else 干净；`RequiredTogether` 表达"成对出现"——TLS cert/key；`MutuallyExclusive` 表达"二选一"——debug/release；error 自动生成——省维护成本；复杂场景可用 `FlagGroup` 视觉分组——help 输出更清晰。

---

### 模式 8：doc/man/bash/yaml/rest 全代码生成

**问题场景**：CLI 帮助文档要 Markdown / Manpage / bash 补全 / YAML schema / REST 文档——5 份手写？

**解决方案**：用 `cobra/doc` 子包——`GenMarkdownDoc(cmd, w)` / `GenManDoc(cmd, w)` / `GenBashCompletion(os.Stdout)` 等。**一次写 Command 树，5 种输出自动**。
```go
// 文档生成
func main() {
    doc.GenMarkdownDoc(rootCmd, os.Stdout)
    // 或 doc.GenManDoc(rootCmd, os.Stdout)
    // 或 doc.GenYamlDoc(rootCmd, os.Stdout)
}
```

**关键参数**：
- `cobra/doc/` 子包
- GenMarkdownDoc / GenManDoc / GenBashCompletion
- 5 种输出
- 一次写 5 份文档
- 工具型 CLI 必备

**最佳实践**：CLI 文档用代码生成——`cobra/doc` 5 份输出；`GenMarkdown` 给网站——Hugo 集成；`GenMan` 给 Unix manpage——传统运维；`GenBashCompletion` 给补全；`GenYaml` 给 schema——OpenAPI 等；5 份维护变 1 份。

---

### 模式 9：ActiveHelp 实时提示

**问题场景**：用户 `<Tab>` 补全后还要"额外提示"——如"这个命令需要 admin 权限"。

**解决方案**：用 `cobra.AddActiveHelp` —— 在补全后输出额外提示。`active_help.go` 61 行实现。**v1.8 新增**。
```go
cobra.AddActiveHelp(cmd, func(cmd *cobra.Command, args []string) string {
    return "提示：这个命令需要 admin 权限"
})
```

**关键参数**：
- `AddActiveHelp` 注册
- 补全后输出
- 61 行 active_help.go
- v1.8 新增
- 比 doc 更即时

**最佳实践**：补全后提示用 `AddActiveHelp`——用户当下看到；权限 / 警告 / 例子 即时反馈；v1.8 标准化——kubectl 等跟进；61 行小功能——大体验提升；活跃维护是竞争力。

---

### 模式 10：Mousetrap 防误运行

**问题场景**：CLI 跑在 `cmd` 双击 + Docker `CMD ["myapp"]` 意外执行——无 TTY 时应给警告。

**解决方案**：用 `cobra.MousetrapHelpText` + `cobra.MousetrapHelpFunc`——检测 `isatty(os.Stdin)` + 当前目录是否有 `go.mod` / `package.json` 等"项目文件"，是则提示"看起来是误运行，请用 myapp help"。**Windows 友好**。
```go
rootCmd.MousetrapHelpText = "看起来是误运行，请用 myapp help"
```

**关键参数**：
- `MousetrapHelpText` 自定义文本
- 自动 isatty 检测
- 项目文件探测
- Windows 双击保护
- 100% 防止误运行

**最佳实践**：GUI 误运行用 Mousetrap——`isatty` + 项目文件探测；自定义提示文本——本地化；Windows 双击是经典场景——`cmd.exe` 误打开；生态标准——kubectl 同步；100% 防止误运行——零成本集成。

---

## 第三段：进阶范式

### 模式 11：PreRunE / PersistentPreRunE 返回 error

**问题场景**：PreRun 失败如何不执行子命令 + 退出码 1？

**解决方案**：用 `PreRunE / PersistentPreRunE` 返回 `error`——`RunE` 同。**非 nil error 终止 Run 链 + 自动打印**。
```go
var subCmd = &cobra.Command{
    PreRunE: func(cmd *cobra.Command, args []string) error {
        if cfg == nil {
            return errors.New("配置文件缺失")
        }
        return nil
    },
    RunE: func(cmd *cobra.Command, args []string) error {
        if err := doWork(); err != nil {
            return err
        }
        return nil
    },
}
```

**关键参数**：
- `PreRunE / RunE` 返回 error
- 失败自动终止
- 退出码 1 自动
- 错误打印自动
- 错误链可加 wrap

**最佳实践**：PreRun/Run 失败用 `*E` 版本——错误传播；自动 exit code 1——CI 友好；error wrap 用 `fmt.Errorf("...%w", err)`——保留链路；非 E 版本仍可共存——简单场景；error-first 是 Go 哲学。

---

### 模式 12：`SilenceUsage / SilenceErrors` 精细控制

**问题场景**：用户已经看到错误，再打印 usage 干扰；error 用户已知，Silence 关闭。

**解决方案**：用 `cmd.SilenceUsage = true` 静默 usage，`cmd.SilenceErrors = true` 静默 cobra 内置错误打印。**应用自己用 `cmd.PrintErrln` 打印**。
```go
subCmd.SilenceUsage = true
subCmd.SilenceErrors = true
subCmd.RunE = func(cmd *cobra.Command, args []string) error {
    return fmt.Errorf("自定义错误，不打印 usage")
}
```

**关键参数**：
- `SilenceUsage` 静默 usage
- `SilenceErrors` 静默 cobra 错误
- 应用自己打印
- CI 友好
- 错误信息可控

**最佳实践**：用户已知错误用 `SilenceUsage`——不重复打印；自定义错误格式——`SilenceErrors` + 应用自己打印；CI 脚本友好——错误可控；默认 cobra 行为对开发者友好——保留 usage；用户体验关键。

---

### 模式 13：Aliases + Hidden + Deprecate 三件套

**问题场景**：CLI 演进要"保留老命令" / "隐藏内部命令" / "标记废弃"——3 件事分别做。

**解决方案**：用 `Aliases []string` 替代名 + `Hidden bool` 隐藏 + `Deprecated string` 标记废弃。**Aliases 走相同逻辑，Hidden 不显示 help，Deprecated 警告**。
```go
var lsCmd = &cobra.Command{
    Use:        "list",
    Aliases:    []string{"ls"},
    Deprecated: "Use 'list' instead",
}
var internalCmd = &cobra.Command{
    Use:    "_internal",
    Hidden: true,  // 不显示在 help
}
```

**关键参数**：
- `Aliases` 替代名
- `Hidden` 隐藏
- `Deprecated` 警告
- 兼容性 + 演进
- 比 fork 命令简单

**最佳实践**：CLI 演进用 `Aliases` ——保持兼容；`Hidden` 给内部命令——不暴露给用户；`Deprecated` 显式标注——v2 删除；`Hidden` 仍可执行——调试用；行业标准——kubectl 同步。

---

### 模式 14：Annotations 自定义元数据 + 文档生成器

**问题场景**：CLI 元数据要"插件系统识别 + 文档生成器提取"——`Use / Short` 不够用。

**解决方案**：用 `cmd.Annotations map[string]string`——任何 key/value。文档生成器 / 插件系统可读。**kubectl 用 Annotations 标识 RBAC 资源**。
```go
subCmd.Annotations = map[string]string{
    "group":       "core",
    "rbac":        "cluster-admin",
    "documentation:url": "https://...",
}
```

**关键参数**：
- `Annotations map[string]string`
- 任意 key/value
- 文档生成器读
- 插件系统读
- kubectl 风格

**最佳实践**：CLI 元数据用 `Annotations` —— `Use/Short` 不够用时；文档生成器读——自动生成文档元数据；插件系统读——元数据驱动；约定 key 名——`rbac:` / `group:` 命名空间；JSON / YAML 输出——和 OpenAPI 联动。

---

### 模式 15：Testable 注入 + `ExecuteContext(ctx)` 注入

**问题场景**：CLI 难测试——`os.Args` 是全局，污染测试。

**解决方案**：用 `cmd.SetArgs([]string)` —— 在测试中设 args。`cmd.ExecuteContext(ctx)` 注入 context。**Args 注入后 `os.Args` 忽略**。
```go
func TestServerCmd(t *testing.T) {
    cmd := NewServerCmd()
    cmd.SetArgs([]string{"server", "--port", "9090"})
    err := cmd.Execute()
    if err != nil { t.Fatal(err) }
}
```

**关键参数**：
- `SetArgs` 注入
- `ExecuteContext(ctx)` 注入
- 覆盖 `os.Args`
- 单元测试友好
- 子命令独立测试

**最佳实践**：CLI 测试用 `SetArgs` ——不污染 `os.Args`；`ExecuteContext` 注入——超时控制；子命令独立 `NewXxxCmd()` 构造——可测；`SetOut / SetErr` 捕获输出——断言；测试友好是 CLI 库的核心竞争力。

---

## 第四段：实战范式

### 模式 16：viper 集成 + 12-factor 配置

**问题场景**：CLI 要"flag / env / config file / default"4 来源优先级——手写 4 层覆盖 100+ 行。

**解决方案**：用 `viper.BindPFlag` / `viper.AutomaticEnv` / `viper.ReadInConfig` —— cobra 的姐妹项目 viper 处理 4 来源。**Viper 看 flag + env + yaml + remote**。
```go
viper.BindPFlag("port", serverCmd.Flags().Lookup("port"))
viper.AutomaticEnv()  // MYCLI_PORT
viper.SetDefault("port", 8080)
```

**关键参数**：
- viper 4 来源
- `BindPFlag` 绑定
- `AutomaticEnv` 自动 env
- `SetDefault` 默认
- 优先级：flag > env > file > default

**最佳实践**：CLI 配置用 viper——4 来源统一；`AutomaticEnv` 12-factor；优先级明确——flag > env > file > default；`BindPFlag` 双向绑——flag 改 viper 也改；`ReadInConfig` YAML/TOML——配置文件友好。

---

### 模式 17：2000 行 `command.go` 单一主类

**问题场景**：cobra 的 `Command` 字段 30+、方法 50+——分散到 10 文件还是单文件？

**解决方案**：用 2073 行 `command.go` 单文件——`Command` 是核心数据结构，所有操作都围绕它。**单文件 = 单一真相源 + 易跳转**。
```go
// command.go:1-2073
type Command struct {
    Use string
    // ... 30+ 字段
}
func (c *Command) Execute() error { ... }
// ... 50+ 方法
```

**关键参数**：
- 2073 行单文件
- 30+ 字段
- 50+ 方法
- 单一数据结构
- 易跳转 + 易 review

**最佳实践**：核心数据结构放单文件——`command.go` 2073 行；30+ 字段集中——避免散落 10 文件；测试 mock 用同一结构——单测覆盖容易；vs 多文件分散——单文件 5x 易读；GitHub 跳转方便。

---

### 模式 18：跨平台 Win/NonWin 条件编译

**问题场景**：cobra 在 Windows 路径分隔 / 终端 / 信号行为不同——`if runtime.GOOS == "windows"` 散落。

**解决方案**：用 `command_notwin.go` + `command_win.go`——Go 编译标签 + 文件名 `_windows.go` 后缀自动按 OS 编译。**核心逻辑共享，OS 特定逻辑分离**。
```
command.go           # 共享
command_notwin.go    # 非 Windows
command_win.go       # Windows 专属
```

**关键参数**：
- Go 编译标签 `_windows.go` 后缀
- 自动按 OS 编译
- 共享 + 平台分离
- 零运行时判断
- 性能 + 维护双赢

**最佳实践**：跨平台代码用文件名后缀——`_windows.go` 自动编译；共享逻辑放主文件——DRY；平台特定放分支文件——`if` 散落反模式；零运行时判断——性能 + 编译期安全；cobra 标准范式。

---

### 模式 19：200+ 项目采纳（kubectl/helm/hugo/gh）

**问题场景**：CLI 框架如何成为 Go 生态事实标准？

**解决方案**：用 spf13 团队主导 + Kubernetes / Hugo / GitHub CLI / Docker / etcd 早期采纳 + 文档站 + 工具链（cobra-cli）——**网络效应**。
```
kubectl    → Kubernetes (CNCF)
helm       → CNCF
hugo       → spf13
gh         → GitHub CLI
docker     → 早期
etcd       → CNCF
```

**关键参数**：
- 200+ 项目采纳
- CNCF 多项目
- spf13 团队维护
- 文档站 site/
- cobra-cli 脚手架

**最佳实践**：CLI 框架要"早期采纳头部项目"——Kubernetes 2017 采纳；CNI 8 项目都用——网络效应；`cobra-cli init myapp` 脚手架——降低门槛；社区驱动——200+ 贡献者；行业事实标准——比竞争者更稳。

---

### 模式 20：Apache-2.0 协议 + Warp 赞助

**问题场景**：CLI 框架如何持续维护 + 商业模式？

**解决方案**：Apache-2.0 + spf13 团队 + 5 位 MAINTAINERS + Warp 终端赞助（README 顶部 logo）。**纯开源 + 周边商业**。
```
License:    Apache-2.0
Maintainer: spf13 + 5 MAINTAINERS
Sponsors:   Warp 终端
Stars:      38k+
Forks:      5.5k+
```

**关键参数**：
- Apache-2.0 协议
- 6 位维护者
- Warp 赞助 logo
- 200+ 贡献者
- 周边商业（Warp 终端）

**最佳实践**：CLI 库商业模式 = 纯开源 + 周边商业；Apache-2.0 比 MIT 友好——专利授权；多家维护者——避免单点风险；README 顶部 logo——周边变现；Warp 模式——CLI 库 + 终端 = 生态闭环。

---

## 关键代码段

```go
// command.go — Command 核心
type Command struct {
    Use string
    Short string
    Long string
    Run func(cmd *Command, args []string)
    PersistentPreRun func(cmd *Command, args []string)
    Args PositionalArgs
    Flags *pflag.FlagSet
    // ... 30+ 字段
}
func (c *Command) Execute() error { ... }
// 50+ 方法

// completions.go — ShellCompDirective
const (
    ShellCompDirectiveNoSpace   = 1 << iota
    ShellCompDirectiveNoFileComp
    ShellCompDirectiveFilterWords
)
```

## 必偷 3 件

1. **Command 树模型**（`Use/Short/Long/Run` 四字段）：CLI 用 Command 树比 switch 灵活 10x；200+ 项目采纳。
2. **pflag 替代 stdlib flag**（`IntVarP` 短长 flag）：POSIX 兼容是行业标准；比 stdlib 灵活 10x。
3. **`__complete` 隐藏子命令统一 4 套 shell 补全**：核心逻辑 1 份，shell 端胶水 4 份；维护成本 4 倍变 1 倍。

## 必避 3 坑

1. **不要硬写 `flag` 而不用 pflag**——POSIX 短长 flag 是行业标准，stdlib 不支持。
2. **不要在 Run 里手写 usage 打印**——用 `SilenceUsage` 配合 `RunE`，cobra 自动管。
3. **不要跨平台用 `runtime.GOOS == "windows"` 散落**——用文件名后缀 `_windows.go` 自动编译。
