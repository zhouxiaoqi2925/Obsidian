# terraform - 多云基础设施即代码的 DAG 调度与 Provider 协议典范

**GitHub**: hashicorp/terraform
**Star**: ~44k
**语言**: Go（含 HCL 领域语言）
**主题**: IaC、DAG 调度、跨语言 Provider 协议、声明式编程
**适用场景**: 多云资源编排、平台工程、SRE 基础设施自动化

## 第一段：基础范式

### 模式 1：HCL 声明式基础设施描述

**问题场景**：多云 API 异构（AWS/Azure/GCP/K8s 各有数百个资源类型），运维团队需要用统一语言描述"期望状态"而非"达到该状态的步骤"。

**解决方案**：HashiCorp Configuration Language（HCL）把云资源抽象为 resource/data/module/variable 四大 block；用户只声明期望终态，Terraform 自行计算 diff 与执行计划。HCL2（0.12+）支持 for/for_each/dynamic block，从 JSON-like 配置进化为完整声明式编程语言。

**关键参数**：
- `resource "aws_instance" "web" { ... }` 资源 block
- `provider` block 显式声明 Provider 来源与版本
- `module` 引用远程 registry 模块
- `lifecycle.create_before_destroy = true` 蓝绿切换
- `terraform.lock.hcl` 锁定 Provider 版本

**最佳实践**：用 `for_each` 替代 `count` 避免列表中间插入导致全量重建；用 `lifecycle` 控制创建/销毁策略；用 `terraform.lock.hcl` 锁版本避免静默升级。

### 模式 2：DAG 调度算法

**问题场景**：资源之间存在复杂依赖（VM→Subnet→VPC、SG→VPC），Apply 必须按拓扑序执行，否则因前置未就绪而失败。

**解决方案**：`internal/dag.AcyclicGraph` 把配置编译为有向无环图，节点是 `NodeAbstractResourceInstance`、边是 `depends_on` 或隐式引用。`WalkFunc func(Vertex) tfdiags.Diagnostics` 是回调式 API，调度算法与业务逻辑（validate/plan/apply）解耦，可独立替换。

**关键参数**：
- `AcyclicGraph` 嵌入通用 `Graph` 复用基础设施
- `DepthFirstWalk` 深度优先遍历
- `Ancestors(vs ...Vertex) Set` 反查祖先节点
- 回调返回 `tfdiags.Diagnostics` 累积诊断
- 检测环（cycle）并报错

**最佳实践**：用 `terraform graph | dot -Tpng > out.png` 可视化依赖；DAG 是任何"按依赖批量处理"场景的通用解法，可直接复用 `hashicorp/go-dag`。

### 模式 3：命令工厂模式 CLI 框架

**问题场景**：CLI 工具有数十个子命令（apply/plan/destroy/init/console/validate/fmt/state/import/output），需要统一注册、统一 help、统一退出码。

**解决方案**：`Commands map[string]cli.CommandFactory` 是顶层命令表，每个子命令实现 `Command` 接口（`Run(args []string) int`）。`PrimaryCommands` 数组定义 help 中高亮显示的命令，`HiddenCommands` 集合定义不广告的命令，差异化展示无需改 help 生成逻辑。

**关键参数**：
- `Commands` 全量命令表
- `PrimaryCommands` 帮助中显式列出
- `HiddenCommands` 不显示在 help 中
- `cli.CommandFactory` 工厂函数延迟实例化
- 退出码 0/1/2 分别表示成功/错误/部分错误

**最佳实践**：新命令先放 `HiddenCommands` 灰度测试；用 `TF_CLI_ARGS` 环境变量让 CI 工具统一注入参数；命令实现放 `internal/command/*.go`，框架在 `commands.go`，分层清晰。

### 模式 4：Provider 子进程 + gRPC 协议

**问题场景**：云厂商 API 多达数百种（AWS 300+、GCP 200+、Azure 400+），把 Provider 编译进 Core 不现实——需要解耦语言、隔离崩溃、独立升级。

**解决方案**：Provider 是独立可执行文件，Terraform Core 通过 `hashicorp/go-plugin`（子进程 + gRPC over stdio）调用。`internal/plugin/discovery` 扫描 `~/.terraform.d/plugins/` 与 `.terraform/providers/` 下的二进制，协议消息用 MessagePack/v5 或 CBOR/v6 序列化。

**关键参数**：
- 子进程隔离：Provider 崩溃不拖垮 Core
- gRPC over stdio：避免端口冲突
- Protocol Buffers schema：`tfplugin5.proto`/`tfplugin6.proto`
- 多语言：Provider 可用 Python/Java/Go 任意语言写
- 独立发版：Provider 可单独发版不影响 Core

**最佳实践**：生产用 `terraform init -upgrade` 升级 Provider；锁定 `required_providers` 块中的版本范围；用 `provider_source` 多源发现；`hashicorp/go-plugin` 是跨语言插件系统的事实标准。

### 模式 5：状态机 + Plan/Apply 三阶段

**问题场景**：直接 `apply` 修改基础设施风险高——一次误操作可能摧毁生产。需要"先预览再执行"的审计机制。

**解决方案**：Terraform 引入三阶段工作流：`plan` 把"当前状态"与"期望状态"做 diff，生成可执行变更计划；`apply` 按 plan 执行；`destroy` 反向回收。每个阶段都可被拦截、审计、CI 检查。

**关键参数**：
- `terraform.tfstate` 持久化状态文件
- `terraform plan -out=tfplan` 序列化 plan 到文件
- `terraform apply tfplan` 严格执行该 plan
- `terraform refresh` 把真实世界同步到 state
- `terraform state` 子命令集操作状态

**最佳实践**：CI 流程强制 plan + 人工审批 + apply；用 S3 + DynamoDB 锁做团队协作；状态文件绝不入库；用 `terraform import` 把已有资源纳入管理；用 `terraform taint` 标记重建。

## 第二段：扩展范式

### 模式 6：状态后端抽象

**问题场景**：状态文件需要持久化与共享——本地磁盘只适合单人开发，团队协作需要 S3/GCS/Azure/Consul/etcd/Terraform Cloud 等多种后端。

**解决方案**：`internal/backend.Backend` 是统一接口，`local`/`s3`/`gcs`/`azure`/`remote`/`oss`/`cos` 都是该接口的实现。状态读写、分布式锁（Lock）、一致性（Consistency）、状态迁移都通过该接口抽象。

**关键参数**：
- `terraform { backend "s3" { ... } }` 配置块
- `bucket` + `key` + `region` S3 后端必备
- `dynamodb_table` 分布式锁
- `encrypt = true` 静态加密
- `init` 子命令初始化/迁移后端

**最佳实践**：生产用 S3 + DynamoDB 锁 + 加密；用 `backend "remote"` 接 Terraform Cloud 获得审计日志；用 `state push`/`state pull` 手动同步；不要在多人同时操作同一 state 时绕过锁。

### 模式 7：HCL2 编程化（for/each/dynamic）

**问题场景**：传统 HCL 只支持静态配置，重复资源必须复制粘贴 N 份（`web1`/`web2`/`web3`），维护噩梦。

**解决方案**：HCL2（0.12+）引入完整编程能力——`for` 循环遍历 list/map、`for_each` 给资源做集合化复制、`dynamic` block 动态生成嵌套 block。Terraform 从"配置工具"升级为"声明式编程语言"。

**关键参数**：
- `for_each = toset(["a", "b", "c"])` 集合化资源
- `count = 3` 索引化（不推荐，list 中间插入导致全量重建）
- `dynamic "ingress" { for_each = var.ports ... }` 动态 block
- `for k, v in var.map : k => v.upper()` map 变换
- `try()`/`can()` 错误容忍函数

**最佳实践**：优先用 `for_each` 而非 `count`；用 `dynamic` 配合 Packer/AMI 列表动态生成 ingress 规则；用 `lookup()` 代替直接 `var.x` 访问避免 null 报错。

### 模式 8：资源地址系统

**问题场景**：状态文件中需要唯一标识每个资源实例（跨 module 嵌套、跨 provider、跨 for_each 副本），直接用资源名会冲突。

**解决方案**：`internal/addrs` 定义统一地址系统：`aws_instance.web` 是基础地址、`module.app.aws_instance.web[0]` 是嵌套 + 索引、`aws_instance.web["key1"]` 是 for_each key。地址是 Plan/Apply/State 操作的统一引用语法。

**关键参数**：
- `resource_type.resource_name` 基础
- `module.X.Y` 嵌套模块
- `[index]` 或 `["key"]` 索引/key
- `data.X.Y` 数据源地址
- `local.X` 本地值

**最佳实践**：操作 state 用完整地址；`moved` block 重命名资源保留状态连续性；地址是 Terraform 内部 IR 的稳定标识符。

### 模式 9：表达式求值与函数库

**问题场景**：HCL 需要算术、字符串、集合、文件、加密、IP 等领域函数——但 HCL 是声明式，不能写任意命令。

**解决方案**：`internal/lang` 实现表达式 AST 求值器，内置 `merge()`/`concat()`/`lookup()`/`file()`/`jsonencode()`/`cidrsubnet()`/`formatdate()` 等数十个函数。用户写表达式 `{ for s in var.services : s.name => s.port }` 由 Terraform 求值。

**关键参数**：
- 算术：`+ - * / %`
- 集合：`merge`/`concat`/`distinct`/`flatten`
- 字符串：`format`/`join`/`split`/`upper`
- 文件：`file()`/`fileexists()`/`templatefile()`
- 类型：`tostring()`/`tonumber()`/`tolist()`

**最佳实践**：用 `templatefile()` 渲染配置模板（cloud-init、nginx.conf）；用 `cidrsubnet()` 划分子网；用 `sensitive = true` 标记敏感变量；用 `validation` block 校验变量取值。

### 模式 10：模块依赖与 Registry 协议

**问题场景**：基础设施配置日益复杂，需要把通用模式抽象为可复用模块（VPC 模块、EKS 模块、RDS 模块），并能从公共/私有 Registry 拉取。

**解决方案**：`module "vpc" { source = "terraform-aws-modules/vpc/aws" version = "5.0.0" }` 引用 Registry 模块，Terraform 拉取、校验、注入输入、暴露输出。`internal/moduledeps` 构建模块依赖图，`internal/moduletest` 支持模块级测试。

**关键参数**：
- `source` 支持本地路径、Git URL、HTTP URL、Registry 路径
- `version` 锁定 Registry 模块版本
- `for_each` 复用同一模块多份
- `providers` 显式传递 Provider 实例
- `depends_on` 跨模块依赖

**最佳实践**：用 `terraform get -update` 刷新依赖；用 `internal/moduletest` 的 `.tftest.hcl` 写模块断言；私有 Registry 用 `~/.terraformrc` 配置；用 `source = "./modules/vpc"` 引用本地模块便于联调。

## 第三段：进阶范式

### 模式 11：Provider 协议 v5/v6 双协议兼容

**问题场景**：新协议（v6 用 JSON 编码）上线后，老 Provider（v5 MessagePack 编码）必须仍能工作——但全网 Provider 升级是漫长的灰度过程。

**解决方案**：`internal/plugin/`（v5）与 `internal/plugin6/`（v6）并存，Terraform Core 同时支持两套协议的客户端。`internal/plugin/convert` 提供 v5/v6 消息转换层，老 Provider 无需重写即可与新 Core 通信。

**关键参数**：
- `tfplugin5.proto` v5 schema（MessagePack）
- `tfplugin6.proto` v6 schema（CBOR/JSON）
- `RequiredProviders` 块声明协议版本
- `ProtocolVersion` 协商
- `convert.Convert` 双向转换

**最佳实践**：新 Provider 直接用 v6 协议；老 Provider 暂时不升级也可工作；自研 Provider 用 `terraform-plugin-sdk` 屏蔽协议细节；这是"如何不打破生态做协议升级"的范本。

### 模式 12：插件发现与多源 Provider

**问题场景**：用户希望从多种来源获取 Provider——官方 Registry、HashiCorp 镜像、私有 Registry、本地文件系统、文件系统镜像（`filesystem_mirror`）。

**解决方案**：`internal/plugin/discovery` 实现统一发现机制，支持 `provider_source.go` 中注册多个源。`internal/getproviders` 定义 `Source` 接口：`RegistrySource`/`FileMirrorSource`/`FilesystemSource`/`RemoteSource` 都是其实现。

**关键参数**：
- `~/.terraformrc` 全局配置源
- `filesystem_mirror` 本地镜像
- `exclude` 排除特定 provider
- `include` 包含额外源
- `install_health_checks` 校验

**最佳实践**：生产环境用 `filesystem_mirror` 缓存 Provider 避免外网依赖；用 `network { allowed_urls }` block 限制 Terraform 出网；用 `skip_provider_registration` 跳过签名校验；CI 镜像预热 Provider 加速 `init`。

### 模式 13：状态加密与敏感数据

**问题场景**：state 文件可能包含明文密码（DB 连接串、API key、证书内容）——泄漏到 git 或 S3 是灾难。

**解决方案**：`state encryption`（1.5+）支持 AES-GCM 加密 state 文件，密钥来源包括 AWS KMS、GCP KMS、Azure Key Vault、PBKDF2 派生。`sensitive = true` 标记变量/输出在 plan/apply 输出中替换为 `<sensitive>`。

**关键参数**：
- `key_provider` 配置 KMS 来源
- `method = "aes_gcm"` 加密算法
- `fallback` 多密钥轮换
- `sensitive = true` 隐藏敏感值
- `endpoints` 强制本地 KMS

**最佳实践**：所有生产 state 启用 KMS 加密；用 `nonsensitive()` 显式解除敏感标记（谨慎）；用 `ephemeral` block（1.10+）确保敏感值不持久化到 state；密钥轮换时新旧 key 并行配置。

### 模式 14：检查（Checks）与 Sentinel 策略

**问题场景**：Apply 完成后无法保证资源实际状态符合预期（API 调用返回成功但实际未生效）——需要 post-apply 验证。

**解决方案**：`check` block（1.5+）定义 post-apply 断言，Terraform 执行后运行验证（HTTP 调用、CLI 命令、Terraform 数据源）。Sentinel/OPA 策略则在 plan 阶段拦截违规配置（强制加密、强制 tag）。

**关键参数**：
- `check "health" { data "http" "api" { url = "..." } assert { ... } }`
- Sentinel 策略文件 `.sentinel`
- OPA 策略 `.rego`
- `precondition`/`postcondition` 生命周期断言
- `terraform_data` 触发器

**最佳实践**：用 `check` 验证关键服务（ALB 健康、数据库连接）；用 Sentinel 强制所有 S3 bucket 启用加密；用 `terraform_data` 实现无资源副作用的 trigger。

### 模式 15：OpenTelemetry 集成与可观测性

**问题场景**：长时间运行的 apply 失败后无法定位是哪个 Provider 调用慢、哪个 RPC 失败——需要分布式追踪。

**解决方案**：Terraform 集成 `go.opentelemetry.io/otel/trace`，把 Plan/Apply 过程作为 root span，每个 Provider RPC 作为子 span，`TRACEPARENT` 通过环境变量传递到子进程 Provider。Span attribute 记录资源地址、Provider 名、RPC 类型。

**关键参数**：
- `OTEL_EXPORTER_OTLP_ENDPOINT` OTLP 端点
- `OTEL_TRACES_EXPORTER` exporter 类型
- `TF_LOG` 调试日志级别
- `checkpoint.go` 崩溃埋点
- `telemetry.go` 匿名遥测

**最佳实践**：生产部署用 OTLP 把 trace 推到 Jaeger/Tempo；用 `TF_LOG=DEBUG` 临时排错；HashiCorp 匿名遥测可关闭（`CHECKPOINT_DISABLE=1`）；自研 CLI 工具可直接复用 OTel 集成。

## 第四段：实战范式

### 模式 16：TF_CLI_ARGS 环境变量注入

**问题场景**：CI 工具（Jenkins/GitLab/CircleCI）需要给所有 `terraform` 调用统一注入参数（如 `-input=false`、`-no-color`），改 invocation 麻烦且易漏。

**解决方案**：`TF_CLI_ARGS` 与 `TF_CLI_ARGS_<command>` 两个环境变量让 CI 工具统一注入参数，Terraform 启动时读取并合并到 argv。`TF_CLI_ARGS=apply -auto-approve` 等价于所有 `terraform apply` 都加 `-auto-approve`。

**关键参数**：
- `TF_CLI_ARGS` 通用参数
- `TF_CLI_ARGS_init`/`TF_CLI_ARGS_plan` 子命令专属
- `TF_INPUT=0` 禁用交互
- `TF_IN_AUTOMATION=1` 标记自动化
- `TF_LOG`/`TF_LOG_PATH` 日志

**最佳实践**：CI 镜像中 `export TF_CLI_ARGS="-input=false -no-color"`；用 `TF_CLI_ARGS_apply="-auto-approve"` 强制 Apply 不交互；用 `TF_LOG=DEBUG` 排错时记录到 `TF_LOG_PATH`。

### 模式 17：DOT 依赖可视化与调试

**问题场景**：复杂基础设施的依赖图（数百节点、上千边）肉眼难调试——`terraform apply` 失败时不知道是哪个 cycle 引起。

**解决方案**：`internal/dag/dot.go` 把图导出为 GraphViz DOT 格式。`terraform graph | dot -Tpng > out.png` 一键生成可视化 PNG。`terraform graph -type=plan` 还可只展示 plan 阶段会变更的节点。

**关键参数**：
- `terraform graph` 默认 plan-destroy 全部节点
- `-type=plan` 仅 plan 阶段
- `-type=apply` 仅 apply 阶段
- `| dot -Tpng > graph.png` 转 PNG
- `| dot -Tsvg > graph.svg` 转矢量

**最佳实践**：CI 流程中 `terraform graph -type=plan` 输出存档便于审计；大型图用 `dot -Tsvg` 矢量格式；用 `unflatten` 简化布局；这是"用图论调试分布式系统"的范本。

### 模式 18：检查点遥测与崩溃埋点

**问题场景**：用户在生产环境跑 Terraform 时偶发崩溃或异常退出，HashiCorp 团队需要了解真实世界的失败模式以排优先级修 bug。

**解决方案**：`checkpoint.go` 在每次 `terraform` 启动时向 `checkpoint.hashicorp.com` 发送匿名埋点（CLI 版本、操作系统、`panic` 堆栈）。`telemetry.go` 收集匿名使用统计。两者都可通过环境变量禁用。

**关键参数**：
- `CHECKPOINT_DISABLE=1` 禁用埋点
- `CHECKPOINT_URL` 自定义埋点端点
- 匿名指标：版本、OS、arch、是否 panic
- 不收集：HCL 内容、状态、变量值
- `panic` 捕获后序列化堆栈

**最佳实践**：合规环境用 `CHECKPOINT_DISABLE=1`；用 `CHECKPOINT_URL` 指向自建遥测服务；不要在埋点代码中泄漏业务信息；这是"工具软件如何平衡数据收集与用户隐私"的工程样板。

### 模式 19：CLI 警告重定向到 stdout

**问题场景**：CI 脚本通过 `terraform output -json` 解析 stdout 取结果，但 `Warn()` 默认走 stderr 会被插入到 stdout 流中破坏 JSON 解析。

**解决方案**：`main.go` 中 `ui` 包装器把 `Warn(msg)` 重定向为 `Output(msg)`，强制警告走 stdout：

```go
type ui struct { cli.Ui }
func (u *ui) Warn(msg string) { u.Ui.Output(msg) }
```

**关键参数**：
- 用 struct embedding 改写方法（比继承更轻量）
- stdout 保持单一写入流
- JSON 解析器不被 stderr 警告污染
- 输出与日志分离（业务输出 stdout、调试日志 stderr）

**最佳实践**：CLI 工具默认把所有用户可见输出走 stdout，调试日志走 stderr；用 `-json` 输出可机器解析的结构化结果；用 `TF_LOG_PATH` 分离日志到文件避免污染 stdout。

### 模式 20：7 天复刻 mini-terraform 路径

**问题场景**：学完 Terraform 源码后想动手复刻一个 mini 版（mini IaC），需要分阶段路线图避免陷入细节。

**解决方案**：7 天分阶段：
- Day 1 克隆 + 阅读 `commands.go` 命令注册表
- Day 2 读 `internal/dag` 算法（AcyclicGraph + DFS）
- Day 3 实现 mini HCL 解析（KV 形式即可）
- Day 4 实现资源图构建（节点 + 边）
- Day 5 实现 plan（diff 算法：state vs config）
- Day 6 写 Plugin 协议（子进程 + JSON-RPC）
- Day 7 apply + 状态持久化（写本地 JSON 文件）

**关键参数**：
- 用 `hashicorp/go-dag` 复用 DAG
- 用 `hashicorp/go-plugin` 复用插件协议
- 用 `hashicorp/hcl` 复用 HCL 解析
- 用 `hashicorp/cli` 复用 CLI 框架
- 状态用 JSON 文件（不要一开始就上 S3）

**最佳实践**：先跑通 plan（不调 Provider，纯 diff），再加 Plugin；先 JSON 序列化 state，不要直接上 Protocol Buffers；分阶段验收，每步都能 `terraform apply` 跑一个最小 demo；这是学习 IaC 工具实现的最短路径。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\terraform\` |
| 主语言 | Go |
| License | BSL 1.1（2023 起，从 MPL 2.0 切换） |
| 解析时间 | 2026-06-02 |
| 内部模块数 | 60+ 个 internal/ 子包 |
| 关键基础设施 | `hashicorp/go-dag`、`hashicorp/go-plugin`、`hashicorp/cli`、`hashicorp/hcl/v2` |
