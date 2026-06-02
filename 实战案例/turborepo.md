# turborepo - Rust 增量构建系统的任务图与 Cap'n Proto 确定性哈希缓存典范

**GitHub**: vercel/turborepo
**Star**: ~26k
**语言**: Rust（CLI）+ TypeScript（配置/插件）
**主题**: monorepo、增量构建、任务图调度、远程缓存
**适用场景**: 大型 monorepo（pnpm/yarn/npm workspaces）、CI 加速、本地 DX

## 第一段：基础范式

### 模式 1：任务图（Task Graph）调度模型

**问题场景**：monorepo 数百个包有 build/test/lint 等任务，包间存在依赖（A 依赖 B 的产物）——naive 顺序执行慢 10x+。

**解决方案**：Turborepo 把 `turbo.json` 定义的 pipeline 任务编译为 DAG，节点是 `package#task`（如 `@app/web#build`），边是 `dependsOn` 显式或隐式（包依赖）。调度器拓扑序执行，相同层级的包并行跑。

**关键参数**：
- `pipeline.build` 任务定义
- `dependsOn: ["^build"]` 跨包 build 依赖
- `dependsOn: ["lint", "test"]` 同包前置
- `outputs: ["dist/**"]` 产物声明
- `cache: true` 启用缓存

**最佳实践**：用 `^build` 触发上游包的 build；用 `cache: false` 关掉不需要的（如 deploy）；用 `inputs` 精确控制 hash 输入。

### 模式 2：确定性哈希（Content-Addressable Hash）

**问题场景**：构建缓存命中要可靠——同一份代码不同机器/不同时间必须算出相同 hash，否则缓存命中率低。

**解决方案**：Turborepo 把"任务输入"序列化（包源文件 + 依赖包 lock + 环境变量）→ SHA-256 哈希，作为缓存 key。跨平台用 Cap'n Proto 序列化保证字节级一致。

**关键参数**：
- `globalHash` 全局配置（turbo.json 变更）
- `taskHash` 任务输入（文件 + env + 依赖 hash）
- Cap'n Proto 序列化
- `inputs: ["src/**", "package.json"]`
- `env: ["NODE_ENV"]`

**最佳实践**：精确声明 `inputs` 避免无用 hash；`env` 列具体变量名（不要 `**`）；用 `globalDependencies` 标 turbo.json/pnpm-lock.yaml。

### 模式 3：写穿缓存（Local + Remote Cache）

**问题场景**：本地缓存只对单台机器有效，CI 集群/团队成员之间不能复用——同一次构建跑 N 次浪费 N-1 倍时间。

**解决方案**：Turborepo 实现写穿缓存：`turbo run build` 后产物写入本地 `node_modules/.cache/turbo`，同时上传到远程 Vercel 缓存 / 自建 S3 缓存。同事/CI 直接 `turbo run build` 命中远程缓存秒级完成。

**关键参数**：
- 本地：`node_modules/.cache/turbo`
- 远程：`TURBO_TOKEN` + `TURBO_TEAM` Vercel
- 自建：`turbo-remote-cache` + S3
- `cache: { outputLogs: "full" }` 缓存命中输出日志
- `force: false` 不强制重跑

**最佳实践**：CI 必配远程缓存（团队复用）；用 `force` 标志调试；自建缓存用 S3 + DynamoDB 锁；监控 cache hit rate。

### 模式 4：gRPC Daemon 长连接加速

**问题场景**：每次 `turbo run` 启动新进程，reindex 数千个包（解析 package.json/tsconfig.json）耗时 5-10 秒。

**解决方案**：`turbo daemon` 启动后台守护进程，索引、文件监听、缓存查询通过 gRPC 长连接复用，避免重复启动开销。`turbo run` 自动连 daemon，第二次起 0.5s。

**关键参数**：
- `turbo daemon` 启动守护
- `turbo daemon stop` 停止
- `turbo daemon status` 状态
- gRPC over Unix socket / TCP
- File watcher：`notify` crate

**最佳实践**：开发环境常开 daemon（CI 不需要）；用 `turbo daemon clean` 清理；监控 daemon 内存；用 `turbo login` 关联 Vercel。

### 模式 5：Cap'n Proto 跨语言序列化

**问题场景**：Turborepo Rust 引擎需要与 Go 哈希守护进程通信（同时也是 Vercel 平台多语言基础设施），JSON 慢且不一致。

**解决方案**：Cap'n Proto 是 Google 开源的二进制序列化协议，比 Protobuf 更快（zero-copy）+ 跨语言（C++/Rust/Go/JS）。Turborepo 用其序列化哈希输入，保证跨平台字节级一致。

**关键参数**：
- `.capnp` schema 文件
- `capnp compile` 生成代码
- 零拷贝 read
- 跨语言：`rust capnp` / `go capnp`
- 嵌套结构（struct/list）

**最佳实践**：跨语言 RPC 用 Cap'n Proto；JS 端用 `capnp-ts`；schema 集中在 `schemas/`；不要混入 JSON（破坏一致性）。

## 第二段：扩展范式

### 模式 6：包过滤器（--filter）

**问题场景**：monorepo 数百个包，`turbo run build` 全量跑慢——只想跑某个包及其依赖。

**解决方案**：`--filter` 标志按 glob/name/dir 过滤包，依赖自动包含（用 `...` 前缀/后缀）。`--filter=@app/web...` 表示 `@app/web` 及其依赖，`--filter=...^@app/web` 表示依赖 `@app/web` 的包。

**关键参数**：
- `--filter=@app/web` 单包
- `--filter=@app/web...` 及其依赖
- `--filter=...@app/web` 依赖该包的
- `--filter=./apps/*` 路径
- `--filter=[main]` Git diff

**最佳实践**：CI 按 changed packages 触发（`--filter=[origin/main]`）；PR 验证只跑受影响包；本地开发用 `...` 触发依赖。

### 模式 7：依赖关系感知调度

**问题场景**：包 A 依赖 B，B 依赖 C——A 改了要重 build，但 C 没改可以缓存命中。

**解决方案**：Turborepo 通过 workspace 元数据（package.json `dependencies`）+ turbo.json `dependsOn: ["^build"]` 推断跨包依赖，自动上游追溯。改 A 时只重 build A，B 命中 C 的缓存。

**关键参数**：
- `dependsOn: ["^build"]` 显式声明
- 包依赖自动分析
- 拓扑序调度
- 跨 workspace 哈希继承
- `package.json#dependencies`

**最佳实践**：每个 `build`/`test` 任务都加 `dependsOn: ["^build"]`；测试任务不依赖 build 时去掉；用 `turbo run build --dry-run=json` 看图。

### 模式 8：Dry Run 与 JSON 输出

**问题场景**：想知道 Turborepo 会跑哪些任务、按什么顺序——不用实际跑一遍看输出。

**解决方案**：`--dry-run` 模拟执行，输出任务列表与顺序；`--dry-run=json` 输出 JSON 结构供 CI 解析。`--graph` 生成 dot 图可视化。

**关键参数**：
- `--dry-run` 模拟
- `--dry-run=json` JSON
- `--graph` dot 图
- `--summarize` 摘要
- `--log-prefix` 区分并行任务

**最佳实践**：CI 加 `--dry-run=json` 预演；用 `--graph | dot -Tpng > graph.png` 可视化；`--summarize` 输出 cache 命中/未命中。

### 模式 9：环境变量控制缓存

**问题场景**：构建产物依赖环境变量（如 `NODE_ENV=production`），但默认 hash 不包含环境变量会导致缓存污染。

**解决方案**：`env: ["NODE_ENV", "API_URL"]` 显式声明影响哈希的变量；`env: ["!SECRET_*"]` 用 glob 排除（不参与哈希但传递）；`globalEnv: ["CI"]` 全局变量。

**关键参数**：
- `env: ["NODE_ENV"]` 参与哈希
- `env: ["!**"]` 排除
- `globalEnv: ["CI"]` 全局
- `passThroughEnv: ["DATABASE_URL"]` 透传
- `dependsOn` 环境敏感

**最佳实践**：生产/测试环境分开缓存（不同 NODE_ENV）；用 `!` 前缀排除 secret；显式列 env 避免漏算哈希。

### 模式 10：包发现与 Workspace 协议

**问题场景**：monorepo 不同工具用不同 workspace 协议（pnpm/yarn/npm workspaces）——Turborepo 都要支持。

**解决方案**：Turborepo 通过 Globby 扫描 `pnpm-workspace.yaml`/`yarn.lock`/`package.json#workspaces`，自动发现包路径。统一为内部 `Package` 表示。

**关键参数**：
- 自动发现包
- pnpm/yarn/npm workspaces 兼容
- `package.json#workspaces` 字段
- `pnpm-workspace.yaml` 字段
- 内部 `Package` 结构

**最佳实践**：用 pnpm 配 workspaces（性能最佳）；避免混合使用多个 workspace 配置；用 `apps/` `packages/` 目录约定。

## 第三段：进阶范式

### 模式 11：远程缓存协议与自建服务

**问题场景**：Vercel 远程缓存 50GB/月免费额度，超过要付费——大团队想要自建 S3 缓存服务。

**解决方案**：Vercel 公开了 Remote Cache API 协议（HTTP + 签名 token），有多个开源实现：`turbo-remote-cache`（Node + S3）、`turborepo-remote-cache`（Go + S3）、`turbo-cache`（Rust）。CI 配 `TURBO_TOKEN` 即可接入。

**关键参数**：
- `TURBO_API` 远程地址
- `TURBO_TOKEN` 签名
- `TURBO_TEAM` team id
- 自建 S3 + 签名
- 协议：`PUT /v8/artifacts/{hash}` + `GET` + `HEAD`

**最佳实践**：团队 > 10 人用自建 S3（成本可控）；用 IAM 角色签名；监控 cache 大小与命中率；CI 配 `TURBO_TOKEN` env 变量。

### 模式 12：缓存命中与输出日志

**问题场景**：缓存命中时默认不显示任务输出，但调试时想知道上次输出是什么。

**解决方案**：`outputs` 字段声明缓存产物；`cache.outputLogs: "full"` 缓存日志全量；`"errors-only"` 只缓存错误；`"new-only"` 只缓存新输出。

**关键参数**：
- `outputs: ["dist/**", ".next/**"]`
- `outputLogs: "full"|"errors-only"|"new-only"|"none"`
- 命中时显示 `cache hit, replaying logs`
- 产物软链接/复制策略
- `cache: false` 关缓存

**最佳实践**：lint/test 任务 `outputLogs: "errors-only"` 减少日志；build 任务 `outputLogs: "new-only"`；`outputs` 精确列产物。

### 模式 13：多 Turborepo 实例

**问题场景**：组织内多个 monorepo 团队独立，缓存不互通——能不能跨 monorepo 共享缓存？

**解决方案**：用 `TURBO_TEAM` + Vercel 团队空间共享缓存；自建缓存用相同 `teamId` 配置。但跨 monorepo 缓存命中要求 hash 命名空间不冲突（默认用 `globalHash` + `taskHash` 复合）。

**关键参数**：
- `TURBO_TEAM` 跨 monorepo 共享
- `globalHash` 命名空间
- `id: "build-1"` turbo.json 自定义
- 跨 monorepo 缓存协议
- 权限隔离

**最佳实践**：跨 monorepo 缓存用 `id` 字段区分；用 `TURBO_TEAM` 共享；监控跨 monorepo 命中率（应 > 80%）。

### 模式 14：Go/Rust 二进制加速

**问题场景**：Turborepo 早期 Node 实现 monorepo 性能差——5000 包扫一遍 30s。

**解决方案**：Turborepo 1.x 重写为 Rust（`turbo` 二进制），10x 性能提升。核心 crate：`turborepo-lib`（任务调度）、`turborepo-repository`（包发现）、`turborepo-cache`（缓存）。

**关键参数**：
- `turbo` Rust 二进制
- 性能：5000 包 1s 内索引
- 并行：rayon crate
- 文件监听：notify crate
- 跨平台：Linux/macOS/Windows

**最佳实践**：升级到 1.x+（Rust 引擎）；CI 用 binary cache 加速 `npm i turborepo`；监控 `turbo` 内存（daemon 模式）。

### 模式 15：Vercel 平台集成

**问题场景**：Vercel 部署平台用 Turborepo 加速 build pipeline——需要与平台 Vercel API 集成。

**解决方案**：Turborepo 与 Vercel 深度集成：`vercel.json` + `turbo.json` 自动推断入口；`TURBO_TOKEN` 关联 Vercel 团队；Vercel 构建时使用 Remote Cache；PR 部署预览用 `--filter` 单独部署子项目。

**关键参数**：
- `vercel.json` 部署配置
- `TURBO_TOKEN` 关联
- `vercel build` 用 turbo
- `--filter` 部署子项目
- Vercel 团队权限

**最佳实践**：Vercel 部署的 monorepo 必装 turborepo；用 `buildCommand: "turbo run build --filter=@app/web..."`；监控 Vercel 构建时间。

## 第四段：实战范式

### 模式 16：CI 集成（GitHub Actions / Vercel / Buildkite）

**问题场景**：CI 跑完整 monorepo build/test 慢（30 分钟），需要按 changed packages 增量跑。

**解决方案**：`turbo run build --filter=[origin/main]` 跑与 main 差异的包及依赖。GitHub Actions 用 `turbo run` 配 `actions/cache`（备份 `node_modules` + `.turbo`）；Vercel 自动用 turbo；Buildkite 用 turbo remote cache。

**关键参数**：
- `--filter=[origin/main]` 增量
- `actions/cache` 路径：`node_modules`, `.turbo`
- `TURBO_TOKEN` CI secret
- `turbo-remote-cache-self-hosted` 自建
- `cache: true` 任务级

**最佳实践**：CI 必配 `TURBO_TOKEN` + Remote Cache；用 `--filter=[origin/main]` 增量；用 `actions/cache` 加速依赖安装；监控 build 时间。

### 模式 17：包分割与代码所有权

**问题场景**：monorepo 数百个包，团队不知道某个包归谁——代码所有权不清。

**解决方案**：Turborepo 与 `CODEOWNERS` 配合：包级 ownership + turbo.json 任务 ownership。`tags` 字段给包打标签（`scope:web`/`scope:api`），pipeline 限制运行范围。

**关键参数**：
- `CODEOWNERS` GitHub
- `tags: ["scope:web"]`
- `pipeline.build.scope: ["web"]`
- `turbo-ignore` 跳过单包
- `affected` GitHub Actions

**最佳实践**：用 `CODEOWNERS` + `tags` 双重 ownership；用 `turbo-ignore` 跳过未影响包；用 `affects` GitHub Action 标 PR 影响范围。

### 模式 18：环境感知配置

**问题场景**：同一份 turbo.json 在 dev/CI/prod 环境行为不同——dev 想要 watch 模式，CI 想要 strict mode。

**解决方案**：`turbo.json` 用 `extends` + 多文件分层（`turbo.json` 基础 + `turbo.ci.json` CI 覆盖）；`--env-mode=loose` 禁用 strict；环境变量驱动配置分支。

**关键参数**：
- `extends: ["./turbo.base.json"]`
- `turbo.ci.json` 覆盖
- `--env-mode=loose`
- `CI=1` 自动检测
- `nonStrictEnv` 字段

**最佳实践**：dev 用基础配置；CI 用 strict + 全局 cache；用 `extends` 复用公共配置；监控不同环境 cache hit rate。

### 模式 19：微前端与多应用部署

**问题场景**：monorepo 包含多个独立应用（web/admin/mobile），需要独立部署到不同平台。

**解决方案**：每个应用配独立 `turbo.json` + 独立 `pipeline.deploy` 任务；用 `extends` 共享公共；Vercel 用 `vercel.json` 多项目；用 `--filter=@app/web deploy` 单独部署。

**关键参数**：
- `apps/web/vercel.json` 独立
- `apps/admin/netlify.toml` 独立
- `turbo run deploy --filter=@app/web`
- 多平台部署
- `outputDirectory` 各自配置

**最佳实践**：每个应用独立平台配置；`turbo run deploy` 一键部署所有；用 `--filter` 单应用部署；监控各应用 build 时间。

### 模式 20：性能分析 Profile

**问题场景**：Turborepo 本身慢（冷启动/缓存未命中/daemon 失效）——需要 Profile 找瓶颈。

**解决方案**：`turbo run build --profile` 输出 Chrome trace 文件，用 Chrome DevTools `chrome://tracing` 查看。`--summarize` 输出 JSON 摘要（任务耗时/缓存命中/网络）。`turbo daemon status` 看 daemon 健康。

**关键参数**：
- `--profile=<file>.json`
- Chrome DevTools `chrome://tracing`
- `--summarize` JSON
- `turbo daemon status`
- `TURBO_LOG_VERBOSITY=debug`

**最佳实践**：CI 失败时开 `--profile`；用 Chrome tracing 看任务并行度；监控 `turbo daemon` 内存；用 `TURBO_LOG_VERBOSITY=debug` 调试。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\turborepo\` |
| 主语言 | Rust + TypeScript |
| License | MPL 2.0 |
| 解析时间 | 2026-06-02 |
| 核心 crate | `turborepo-lib`、`turborepo-repository`、`turborepo-cache` |
| 关键基础设施 | `capnp`、`rayon`、`notify`、Vercel Remote Cache API |
