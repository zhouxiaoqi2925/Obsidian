# golang-project-layout - Go 项目目录布局事实标准

**GitHub**: golang-standards/project-layout
**Star**: 51k+
**语言**: Go
**主题**: design-pattern-reference / directory-structure / 工程规范
**适用场景**: Go 微服务 / CLI / 后端项目初始化 / 团队规范统一

---

## 第一段：基础范式

### 模式 1 - 顶层目录分类

**问题场景**：Go 项目 90% 是 `main.go + go.mod` 两文件结构，但生产级项目（10+ 万行）需要清晰分层（cmd / internal / pkg / api / configs / docs / test）。

**解决方案**：`golang-standards/project-layout` 定义标准目录：
- `cmd/`：二进制入口（每个子目录一个 main）
- `internal/`：私有代码（限制同 parent 导入）
- `pkg/`：可被外部导入的公共库
- `api/`：API 定义（protobuf / openapi / json schema）
- `configs/`：配置文件模板
- `scripts/`：运维 / 构建脚本
- `docs/`：设计 / 用户文档
- `test/`：外部测试 / 测试数据
- `deployments/`：Docker / K8s / Terraform
- `examples/`：示例代码

**关键参数**：
- `cmd/myapp/main.go` 主程序入口
- `internal/service/` 服务层
- `pkg/client/` 公共客户端
- `api/openapi.yaml` OpenAPI 定义
- `Makefile` 顶层命令

**最佳实践**：新项目按此布局初始化（避免后期重构）；`internal/` 偏好于 `pkg/`（Go 团队建议）；`cmd/` 每个二进制一个子目录（避免单 main 文件膨胀）；`Makefile` 统一构建入口。

### 模式 2 - cmd/ 入口分层

**问题场景**：单个 `main.go` 几千行（CLI flag / 配置 / wire / 启动），难测试难维护。

**解决方案**：`cmd/` 按二进制拆子目录：
- `cmd/myapp/main.go` 主入口
- `cmd/migrate/main.go` 数据库迁移工具
- `cmd/seed/main.go` 种子数据
- `cmd/admin/main.go` 运维 CLI

每个子目录独立 main 包，独立 `go build`。

**关键参数**：
- `cmd/<name>/main.go` 子命令
- `internal/app/<name>/` 业务逻辑
- `main.go` 仅做"装配 + 启动"
- `internal/runner` 抽象启动流程

**最佳实践**：`main.go` < 100 行（仅 wire + run）；业务逻辑放 `internal/app`；CLI 用 cobra / urfave/cli；启动流程可单元测试（抽 `Runner` 接口）。

### 模式 3 - internal/ 限制可见性

**问题场景**：业务代码不想被外部项目导入（避免成为 API 兼容负担），但 Go 没有 Java package-private。

**解决方案**：`internal/` 目录 — `path/foo/internal/bar` 只可被 `path/foo/...` 导入。`go build` 自动阻止。

**关键参数**：
- `path/to/foo/internal/bar` bar 包
- `path/to/foo/...` 任何子包可导入 bar
- 跨 module 不可导入
- 嵌套 `internal/` 也遵守

**最佳实践**：90% 业务代码放 `internal/`（隐藏实现）；`pkg/` 留给"真正可独立发布"的库；标准库 `internal/` 也大量用此模式；`internal/thirdparty/` 可二次封装第三方。

### 模式 4 - pkg/ 公共库

**问题场景**：项目内的可复用代码（client / util / types）需要被其他项目 import。

**解决方案**：`pkg/` 目录 — 公共 API 入口，包名即为导入路径。`pkg/client/redis/redis.go` → `import "myapp/pkg/client/redis"`。

**关键参数**：
- `pkg/<category>/<name>.go`
- 可被外部 import
- 需 godoc 注释
- 独立版本（推荐 v0.x → v1.x）

**最佳实践**：`pkg/` 用谨慎（Go 团队建议"不要为了可重用而分 pkg"）；优秀的 `pkg/` 是 `kubernetes/pkg/` / `prometheus/promql/`；避免暴露内部细节（接口 > 实现）。

### 模式 5 - api/ 接口优先

**问题场景**：前端 / 后端 / 第三方客户端要对接 API，需要一份"事实契约"避免字段漂移。

**解决方案**：`api/` 目录存接口定义：
- `api/protobuf/v1/*.proto` gRPC + buf
- `api/openapi.yaml` OpenAPI 3.0
- `api/graphql/schema.graphql` GraphQL
- `api/json-schema/*.json` JSON Schema
- `api/http/*.yaml` HTTP API blueprint

**关键参数**：
- `api/proto/` 配 `buf.yaml` 工具链
- `api/openapi.yaml` 配 swagger codegen
- `make api/gen` 生成代码
- git submodule 引用公共 proto

**最佳实践**：API 优先于实现（"design first"）；`buf.build` 取代 protoc；`openapi-generator` 自动生成 client / server；`api/` 改动触发 `make api/gen` 重生成代码。

---

## 第二段：扩展范式

### 模式 6 - configs/ 配置分层

**问题场景**：开发 / 测试 / 生产环境配置不同；配置文件散落 `config.json` / `.env` / `config.yaml`。

**解决方案**：`configs/` 目录存配置模板：
- `configs/config.example.yaml` 模板（提交）
- `configs/config.dev.yaml` 开发（不提交）
- `configs/config.prod.yaml` 生产（CI/CD 注入）
- `configs/certs/*.pem` 证书（不提交）

**关键参数**：
- `viper` / `koanf` 库加载
- 环境变量覆盖
- `consul` / `etcd` 配置中心
- `Makefile` `make config` 复制模板

**最佳实践**：配置模板提交，实际配置走环境变量 / 配置中心；敏感信息（DB 密码 / API key）走 Vault / KMS；config 验证启动时 fail-fast；`config.example` 必填字段注释。

### 模式 7 - test/ 外部测试

**问题场景**：集成测试 / E2E 测试需要外部依赖（DB / Redis / 真实服务），与单元测试混在 `*_test.go` 难管理。

**解决方案**：`test/` 目录集中外部测试：
- `test/integration/` 集成测试
- `test/e2e/` 端到端测试
- `test/fixtures/` 测试数据
- `test/scripts/` 自动化脚本

**关键参数**：
- `_test.go` vs `test/xxx_test.go`（package test）
- `test/...` 跑外部测试
- `go test -tags=integration ./test/integration/...` 标签
- Docker Compose 起测试依赖

**最佳实践**：集成测试打 build tag `//go:build integration` 隔离；`docker-compose.test.yml` 起测试服务；`testdata/` 目录存 fixture（git 提交）；`make test` 跑全套。

### 模式 8 - deployments/ 部署资产

**问题场景**：Docker / K8s / Terraform 部署配置散落各处，devops 与开发脱节。

**解决方案**：`deployments/` 目录集中：
- `deployments/Dockerfile` 镜像构建
- `deployments/docker-compose.yml` 本地起服务
- `deployments/k8s/*.yaml` K8s manifests
- `deployments/terraform/*.tf` 基础设施
- `deployments/ansible/*.yml` 配置管理

**关键参数**：
- 多阶段 Dockerfile（golang:1.22 → alpine）
- `kustomize` 配 `deployments/overlays/{dev,prod}/`
- `helm/` 子目录 Helm chart
- `skaffold` 本地开发循环

**最佳实践**：Dockerfile 与应用代码同仓库（同步版本）；K8s manifests 走 `kustomize` / `helm` 而非裸 yaml；Terraform state 存远端（S3 / GCS）；CI 自动 `docker build` + 推到 registry。

### 模式 9 - scripts/ 运维脚本

**问题场景**：运维脚本（迁移 / 备份 / 监控）散落 root 或各目录，难以发现。

**解决方案**：`scripts/` 目录集中：
- `scripts/migrate.sh` DB 迁移
- `scripts/backup.sh` 数据备份
- `scripts/load-test.sh` 压测
- `scripts/install-go.sh` 装 Go 版本

**关键参数**：
- `bash` / `python` / `make` 脚本
- `make xxx` 调用
- 脚本头部 `#!/usr/bin/env bash set -euo pipefail`
- 路径用 `$SCRIPT_DIR/...` 相对路径

**最佳实践**：脚本能跑就行，复杂度低；不要写成大 Python；Shell 脚本头部 `set -euo pipefail`；用 `make` 编排而非 shell if-else。

### 模式 10 - docs/ 文档分层

**问题场景**：项目文档（README / 设计 / 用户 / API）混在一起，新人不知从哪开始。

**解决方案**：`docs/` 目录分层：
- `docs/architecture.md` 架构图
- `docs/design/` 设计文档
- `docs/user-guide/` 用户手册
- `docs/developer-guide/` 开发者指南
- `docs/api.md` API 文档
- `docs/CHANGELOG.md` 变更日志

**关键参数**：
- Markdown 通用
- `docs/index.md` 总览
- `mkdocs-material` / `hugo` / `docusaurus` 生成静态站
- `docs/adr/` 架构决策记录

**最佳实践**：README 简短（< 200 行）；详细文档走 `docs/`；ADR（Architecture Decision Record）记录"为什么这样设计"；CI 自动发布到 GitHub Pages。

---

## 第三段：进阶范式

### 模式 11 - 内部包分层（按层 vs 按功能）

**问题场景**：业务代码按层组织（`internal/handler / service / repository`）vs 按功能（`internal/user / order / payment`），各有优劣。

**解决方案**：
- **按层（Layered）**：简单清晰，跨功能复用好，团队规模 < 10 人
- **按功能（Feature-based）**：内聚性强，团队规模 10+ 人按 feature 分组

**关键参数**：
- 按层 `internal/handler/ / service/ / repository/`
- 按功能 `internal/user/{handler,service,repository}.go`
- 大型项目混合（按功能 + 共享层）
- `internal/pkg/` 共享工具

**最佳实践**：小项目按层（学习成本低）；中大型项目按功能（团队独立）；Django 风格按 app（`internal/blog / internal/users`）；Go 标准库倾向"扁平 + 包"。

### 模式 12 - 错误处理分层

**问题场景**：错误信息五花八门（`fmt.Errorf` / `errors.New` / 业务错误码），日志 / API 响应格式不统一。

**解决方案**：错误分层：
- 基础设施错误（DB / Redis / HTTP）
- 业务错误（业务规则违反）
- 域错误（领域模型违规）
- API 错误（HTTP status + 业务 code）

用 `pkg/errors`（带 stack trace）+ 业务 code 枚举。

**关键参数**：
- `errors.Is(err, sql.ErrNoRows)`
- `errors.As(err, &domainErr)`
- `pkg/errors.Wrap(err, "create user")` 带 stack
- 业务错误 `var ErrUserNotFound = errors.New("user not found")`

**最佳实践**：底层 error 不带 HTTP context；handler 层转 HTTP status；业务错误用 sentinel error `var ErrXxx`；stack trace 在 server 端；client 端只返 code + message。

### 模式 13 - 配置加载

**问题场景**：配置来源多样（环境变量 / 文件 / 配置中心 / 命令行 flag），散落读取难管理。

**解决方案**：`config` 包统一加载：
- `viper` 库（支持多源）
- `koanf` 新一代（更轻）
- 12-factor 推崇环境变量

`func Load() (*Config, error)` 在 `internal/config/`。

**关键参数**：
- `os.Getenv("DB_HOST")`
- `viper.GetString("db.host")`
- 配置 schema `mapstructure` tag
- 启动 fail-fast 验证

**最佳实践**：12-factor 推崇纯环境变量（无文件依赖）；`viper` 配默认值 + env 覆盖；config 验证在 `Load()` 入口；敏感配置走 Vault / KMS；不要把 config 散落业务代码。

### 模式 14 - 日志规范

**问题场景**：日志格式不统一（print / fmt / log / zap / logrus），结构化字段缺失。

**解决方案**：`pkg/logger` 抽象日志接口：
- `zap`（Uber 出品，高性能）
- `zerolog`（极简 API）
- `slog`（Go 1.21+ 标准库）
- `logrus`（老牌）

`logger.Info("user login", "user_id", id, "ip", ip)` 结构化字段。

**关键参数**：
- `slog.SetDefault(slog.NewJSONHandler(os.Stderr, nil))`
- zap `logger.Info("login", zap.String("user", name))`
- zerolog `log.Info().Str("user", name).Msg("login")`
- 日志级别：Debug / Info / Warn / Error
- request_id / trace_id 关联

**最佳实践**：Go 1.21+ 选 `slog`（标准库）；结构化字段替代 string format；request_id 注入 context；日志分级 + 采样；ELK / Loki 聚合。

### 模式 15 - 依赖注入

**问题场景**：业务代码耦合具体实现（`*sql.DB` 硬编码），难测试难替换。

**解决方案**：
- **构造函数注入**：`NewService(repo Repository) *Service`
- **接口分离**：`type Repository interface { ... }`
- **Wire 编译期 DI**（Google 出品）
- **fx 运行时 DI**（Uber 出品）

**关键参数**：
- `type Repo interface { Get(id) (*User, error) }`
- `type Service struct { repo Repo }`
- `func NewService(r Repo) *Service { return &Service{r} }`
- Wire `//go:build wireinject` 标签

**最佳实践**：业务代码依赖接口（`Repository`）而非实现（`*sqlDB`）；构造函数注入显式可控；DI 容器用于大型项目（fx / wire）；小项目直接手写 `main()` 装配。

---

## 第四段：实战范式

### 模式 16 - 微服务目录结构

**问题场景**：微服务项目（10+ 微服务）共用代码（proto / 中间件 / 工具）难管理。

**解决方案**：monorepo 微服务布局：
- `services/user/main.go` 用户服务
- `services/order/main.go` 订单服务
- `pkg/proto/v1/user.pb.go` 共享 proto
- `pkg/middleware/` 共享中间件
- `pkg/db/postgres.go` 共享 DB 客户端
- `Makefile` 跑 `make user` 编译用户服务

**关键参数**：
- `services/<name>/cmd/main.go` 入口
- `services/<name>/internal/` 业务
- `pkg/` 共享库
- `deployments/k8s/<name>.yaml` K8s
- Buf / Thrift 共享 IDL

**最佳实践**：monorepo 适合 5-20 微服务（看到彼此代码）；20+ 拆分 multi-repo；proto 共享是 monorepo 最大价值；`go.work` workspace mode 加速。

### 模式 17 - API Gateway 与 BFF

**问题场景**：前端多端（Web / iOS / Android）调用多个微服务，跨域 / 鉴权 / 聚合重复。

**解决方案**：API Gateway / BFF（Backend for Frontend）：
- `gateway/` 通用网关
- `bff-web/` Web 后端
- `bff-mobile/` 移动端后端

BFF 负责聚合多个 service + 适配前端 schema。

**关键参数**：
- `gateway/kong.yaml` Kong 配置
- `bff-web/handlers/` 聚合 handler
- `bff-web/internal/aggregator/` 聚合业务
- GraphQL BFF（单一端点）
- gRPC-Gateway（proto 注释生成）

**最佳实践**：BFF 模式是"为前端定制后端"；通用 gateway + 多个 BFF 组合；GraphQL 是 BFF 的最佳实现（前端自取数据）；GraphQL Federation 解决多团队 BFF 互通。

### 模式 18 - 依赖管理实践

**问题场景**：`go.mod` 依赖多（200+ 直接 / 1000+ 间接），升级风险大；vendor 大。

**解决方案**：
- `go mod tidy` 清理
- `go mod why` 看依赖原因
- `go mod graph` 看依赖图
- `renovate` / `dependabot` 自动 PR 升级
- `golangci-lint` 静态检查

**关键参数**：
- `go mod tidy` 同步 go.sum
- `go mod edit -require=...` 编辑
- `replace` 临时 fork
- `go list -m -mod=mod -f '{{.Path}}@{{.Version}}' all` 列所有

**最佳实践**：CI 跑 `go mod tidy` 校验（防止 dirty）；`dependabot` 自动 PR 升级（人工 review）；security scan `govulncheck`；锁定 go 版本 `go 1.22` 严格匹配。

### 模式 19 - CI/CD 流水线

**问题场景**：手写脚本 `go test / build / deploy` 难统一；CI 配置散落。

**解决方案**：
- `.github/workflows/ci.yml` GitHub Actions
- `.gitlab-ci.yml` GitLab
- `Makefile` 统一命令
- `Dockerfile` 多阶段构建
- `goreleaser` 二进制发布

**关键参数**：
- `make test` 跑测试
- `make build` 编译
- `make lint` 静态检查
- `make docker-build` 镜像构建
- `make deploy` 部署

**最佳实践**：`Makefile` 统一命令（不写 `go test ./...` 在文档里）；CI 缓存 `~/.cache/go-build` + `~/go/pkg/mod`；multi-stage Docker 镜像（golang:1.22 → distroless）；`goreleaser` 一键发布多平台二进制。

### 模式 20 - 团队规范与文档

**问题场景**：10+ 团队成员代码风格不统一（命名 / 错误处理 / 测试覆盖），review 耗时。

**解决方案**：
- `CONTRIBUTING.md` 贡献指南
- `.golangci.yml` 静态检查配置
- `CODEOWNERS` GitHub 权限
- `docs/style-guide.md` 编码规范
- `docs/architecture.md` 架构文档

**关键参数**：
- `gofmt` 自动格式化
- `golangci-lint run` 静态检查
- `pre-commit` hook 提交前检查
- `conventional commit` 提交规范
- `semantic-release` 自动发版

**最佳实践**：风格靠工具自动化（`gofmt` / `goimports` / `golangci-lint`）；不要靠人 review 改格式；`CODEOWNERS` 配 reviewer；提交规范用 conventional commit；`semantic-release` 自动版本 + CHANGELOG。
