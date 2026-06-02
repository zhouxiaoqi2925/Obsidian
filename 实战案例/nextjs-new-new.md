# nextjs-new-new - Next.js Turbopack Rust crates 快照

**GitHub**: https://github.com/vercel/next.js
**Star**: 130k+
**语言**: Rust (Turbopack)
**主题**: React 框架 / Turbopack / Rust crates
**适用场景**: Turbopack 编译原理研究、增量 lint 学习、Rust 工程实践

## 第一段：基础范式

### 模式 1: 同源仓库裁剪快照
**问题场景**：完整 Next.js 仓库 100+ GB（单 commit），日常开发只关心 Turbopack 的 Rust 部分，全克隆浪费磁盘。
**解决方案**：nextjs-new-new 是个"裁剪式快照"——只保留 `crates/` 子目录（next-core / next-build / next-api / next-code-frame 等）+ 根 Cargo.toml + 一行配置。把前端 packages/ 全部省掉，专心研究 Rust 编译器部分。
**关键参数**：
- 目录：crates/ + Cargo.toml
- 裁剪范围：~30 个 crate workspace
- 增量：1 行 segment_config.rs
- 体积：从 100+ GB 缩到 1.2 GB
**最佳实践**：研究大仓库的子项目时，本地 sparse-checkout + filter-repo 裁剪，3 秒克隆。

### 模式 2: Rust workspace 与 Turbopack
**问题场景**：Turbopack 是 Vercel 自研的 Rust 增量打包器，要同时支持 Webpack 兼容、SWR、HMR、SSR 多种场景。
**解决方案**：crates 用 Cargo workspace 管理。每个 crate 单一职责：next-core 是核心图、next-build 走 production 构建、next-api 桥接 Next.js 路由、next-code-frame 报错误位置。crate 之间通过 cargo path = "..." 互引。
**关键参数**：
- workspace: Cargo.toml [workspace] members
- crate 数：~30
- 编译：cargo build --release
- 集成测试：cargo test --workspace
**最佳实践**：Turbopack 用 task graph + 增量缓存，构建时间 10 倍快于 webpack。

### 模式 3: 1 行 Clippy lint 修复
**问题场景**：Rust 工具链升级后，Clippy 新 lint 触发，老代码需要批量调整。
**解决方案**：nextjs-new-new 在 `crates/next-core/src/segment_config.rs` 把 `*val` 改成 `val`（去掉不必要的解引用）。这是 Rust 1.78+ Clippy 的 `clippy::explicit_deref_methods` 自动建议。
**关键参数**：
- 触发：clippy::explicit_deref_methods
- 修复：去掉 `*` 显式解引用
- 工具：cargo clippy --fix --allow-dirty
- CI：cargo clippy -- -D warnings
**最佳实践**：开启 CI 卡 `cargo clippy -- -D warnings`，lint 错误一票否决。

### 模式 4: 增量裁剪与稀疏检出
**问题场景**：GitHub 仓库 100+ GB，本地拉不下。
**解决方案**：git sparse-checkout init --cone + `git sparse-checkout set crates/`。clone --depth 1 + --filter=blob:none + --sparse。配合 git lfs 单独拉大文件。
**关键参数**：
- git clone --filter=blob:none --depth 1
- sparse-checkout set crates/
- git lfs fetch --include="*.so"
- 总下载量：< 1 GB
**最佳实践**：大项目用 sparse-checkout 切子目录，本地 IDE 速度提升 5 倍。

### 模式 5: 编译期与运行期分层
**问题场景**：Turbopack 编译耗时（首次 30 分钟）、增量构建（5 秒）如何平衡？
**解决方案**：编译期 cargo build 走增量编译（sccache + mold linker），运行期 Turbopack 内部 task graph 复用 cache。开发模式启用 dev-only tracing。
**关键参数**：
- 增量：sccache + incremental
- linker：mold（10x faster）
- LTO：release 用 thin-LTO
- dev profile：debug = 1
**最佳实践**：首次 cargo build 前 export RUSTC_WRAPPER=sccache。

## 第二段：扩展范式

### 模式 6: Turbopack 任务图模型
**问题场景**：Webpack 把所有模块当字符串处理，粒度粗，HMR 慢。Turbopack 要做"函数级"细粒度增量。
**解决方案**：Turbopack 用 task graph（类似 Bazel）：每个文件、每个函数是一个 task，依赖构成有向无环图。改动一个 .tsx，task graph 只重跑受影响的 task。
**关键参数**：
- Task：file / function / chunk
- Function-level granularity
- 缓存：filesystem + memory
- worker 池：tokio runtime
**最佳实践**：监控 `turbo trace` 输出任务依赖图，定位热路径。

### 模式 7: SWC 替代 Babel
**问题场景**：Babel 转译 JS/TS 慢（10s+），大型项目 HMR 体验差。
**解决方案**：Next.js 用 SWC（Speedy Web Compiler）Rust 写的编译器，编译速度比 Babel 快 70 倍。SWC 核心由 swc-project 维护，Next.js 在 Rust 端通过 swc_core 包装。
**关键参数**：
- swc_ecma_parser / swc_ecma_transforms
- TypeScript / JSX / ESM / ES2022
- 插件：swc_plugin_*
- 性能：单核 1000+ LOC / ms
**最佳实践**：自定义 transformer 时写 SWC 插件（Rust），比 babel plugin 快 100 倍。

### 模式 8: segment_config 路由段配置
**问题场景**：Next.js App Router 用文件即路由，每个 layout / page / loading / error 都是一个 segment，配置如何集中管理？
**解决方案**：`crates/next-core/src/segment_config.rs` 定义 `SegmentConfig { runtime, preferred_region, experimental_ppr, ... }`，由 next-core 解析文件树生成。`val` 字段是 i32 enum 值，`*val` 老写法在 Rust 1.78 后被 clippy 标记。
**关键参数**：
- SegmentConfig：runtime / PPR / ISR / params
- 文件名约定：layout.tsx / page.tsx / loading.tsx / error.tsx
- 配置继承：父 layout → 子 page
- PPR：Partial Prerendering（实验性）
**最佳实践**：路由级配置用 config 对象导出，运行时读 SegmentConfig。

### 模式 9: Rust 1.78 与 clippy 严格化
**问题场景**：Rust 工具链 6 周一个版本，每个版本都加 lint 规则，老代码一夜爆红。
**解决方案**：CI 跑 `cargo clippy --workspace --all-targets -- -D warnings`，让 lint 必过。日常 `cargo clippy --fix --allow-dirty` 自动修。定期用 `cargo update` 跟版本。
**关键参数**：
- rustup update stable
- cargo clippy --fix
- rust-toolchain.toml 锁版本
- cargo-deny 检测依赖漏洞
**最佳实践**：仓库根放 `rust-toolchain.toml` 锁版本，避免漂移。

### 模式 10: monorepo + workspaces + pnpm
**问题场景**：Next.js 同时有 JS/TS 包（packages/）和 Rust crate（crates/），如何统一管理？
**解决方案**：JS/TS 用 pnpm workspace（pnpm-workspace.yaml），Rust 用 Cargo workspace。CI 两段独立：pnpm install + cargo build。
**关键参数**：
- pnpm-workspace.yaml：packages/*
- Cargo.toml [workspace] members
- 两套锁文件：pnpm-lock.yaml + Cargo.lock
- turbo.json 编排
**最佳实践**：用 Turborepo 跨语言编排（pnpm + cargo 同命令调度）。

## 第三段：进阶范式

### 模式 11: 自研编译器与中间表示 IR
**问题场景**：要做增量构建，必须有比 AST 更稳定的中间表示。
**解决方案**：Turbopack 设计自有 IR：每个模块的 imports / exports / 副作用 / 异步边界都建模为 OperationNode。改一个文件，IR 增量重算。
**关键参数**：
- IR：Operation Graph
- 节点：Module / Export / Import / SideEffect
- 边：依赖 + 顺序
- 序列化：bincode 写盘
**最佳实践**：自研 IR 时画完整 schema 文档，比代码重要 10 倍。

### 模式 12: tokio 异步运行时
**问题场景**：编译期有大量 IO（读文件、hash、写缓存），同步阻塞浪费多核。
**解决方案**：Turbopack 内部用 tokio 异步 runtime。spawn_blocking 给真正阻塞 IO，async fn 给计算。tokio::sync::RwLock 替代 std Mutex。
**关键参数**：
- tokio::main / #[tokio::test]
- spawn / spawn_blocking
- tokio::select!：多路复用
- tokio::time::timeout
**最佳实践**：CPU 密集用 rayon（线程池），IO 密集用 tokio（协程）。

### 模式 13: HMR 与持久缓存
**问题场景**：保存文件后浏览器要 1 秒内看到效果，Vite 模式不够快。
**解决方案**：Turbopack 持久化 file system cache（.turbo/cache/），二次启动复用 cache。WebSocket 推 HMR event，浏览器走 fast refresh。
**关键参数**：
- .turbo/cache/ 目录
- HMR 协议：HMRMessage
- fast refresh：react-refresh 包
- 失效：mtime + hash
**最佳实践**：HMR 失败时 fallback 到全量 reload，并 console.error 提示。

### 模式 14: Rust 工具链完整生态
**问题场景**：要写 Rust 项目，要装 rustup、cargo、clippy、rustfmt、sccache、mold 等等。
**解决方案**：rustup 装好后 `rustup component add clippy rustfmt rust-analyzer`。sccache 加速编译：export RUSTC_WRAPPER=sccache。mld linker：export RUSTFLAGS="-C link-arg=-fuse-ld=mold"。
**关键参数**：
- rustup component add clippy
- sccache：远程缓存
- mold / lld：linker
- rust-analyzer：IDE
**最佳实践**：Dockerfile 一次性装全，避免 dev/CI 不一致。

### 模式 15: 跨语言构建编排
**问题场景**：JS / Rust / Go / Python 混合 monorepo，怎么统一构建、测试、发布？
**解决方案**：用 Bazel（cn.starx/galaxy）、Nx 或 Turborepo 编排。每个语言有自己的 task（pnpm build / cargo build / go build），统一在 turbo.json 描述依赖。
**关键参数**：
- turbo.json pipeline
- dependsOn：["^build"]
- cache：本地 + 远程
- env：CI matrix
**最佳实践**：在 monorepo 根设 `make` 入口，串联所有语言工具链。

## 第四段：实战范式

### 模式 16: 编译期与运行期的清晰边界
**问题场景**：Turbopack 跑在 Node.js 子进程里还是 in-process？
**解决方案**：Turbopack 默认作为 Node.js 进程内的 native module（`@next/swc`），Rust 端编译成 .node（C ABI）。SWC 也有 wasm 版（@swc/wasm-web）跑浏览器。
**关键参数**：
- .node 文件：napi-rs 桥接
- .so / .dylib / .dll
- wasm-pack：浏览器版本
- abi-versioned：稳定 ABI
**最佳实践**：napi-rs + 线程安全函数（ThreadsafeFunction）做 Node ↔ Rust 通信。

### 模式 17: Rust crate 内 spec 风格测试
**问题场景**：Turbopack 这种大 crate 怎么保证正确性？
**解决方案**：每个 crate 内部 `#[cfg(test)]` + `#[tokio::test]` 写单元测试。集成测试放 `tests/` 目录。snapshot test 比较多（insta crate）。
**关键参数**：
- `#[cfg(test)] mod tests`
- `#[tokio::test]`
- insta：snapshot 测试
- cargo test --workspace
**最佳实践**：用 insta 写快照测试，自动接受更新（cargo insta accept）。

### 模式 18: 错误信息与用户提示
**问题场景**：Rust 编译错误"生命周期的 E0106"对前端开发者是天书。
**解决方案**：Next.js 在 SWC / Turbopack 报错时把 Rust 内部 error code 翻译成人类语言（"Cannot import .ts into .js file at this position"）。用 thiserror + 自定义 Display 实现。
**关键参数**：
- thiserror：派生 Error
- anyhow：通用 Result
- miette：富错误报告
- 自定义 error_message!
**最佳实践**：给框架错误写"建议修复"，比如"Try renaming to .ts"。

### 模式 19: 性能与基准
**问题场景**：Turbopack 比 Webpack 快 10 倍的指标怎么测出来的？
**解决方案**：在 `bench/` 目录放 criterion 基准（Rust）和 in-house JS benchmark。CI 跑 benchmark，对比基线性能。开发模式启 cargo flamegraph 找热点。
**关键参数**：
- criterion：Rust 基准
- pprof / flamegraph：火焰图
- hyperfine：CLI 基准
- perf record：CPU 采样
**最佳实践**：基准结果入 git LFS，画折线图，PR 引入性能退化时告警。

### 模式 20: 实战中的 Next.js Turbopack
**问题场景**：AI 直播平台前端用 Next.js + Turbopack？
**解决方案**：`next dev --turbo` 启动 Turbopack 模式，构建快、HMR 稳。生产用 `next build --turbopack`（v15 引入）。Rust 端 crates/ 是 Vercel 内部研究项目，AI 直播平台不用编译，仅消费 .node 产物。
**关键参数**：
- next dev --turbo
- next build --turbopack
- 远程缓存：TURBO_REMOTE_CACHE_SIGNING_KEY
- Webpack 兼容：保留 fallback
**最佳实践**：Turbopack 还没全替代 webpack，复杂 plugin（CSS Modules + Sass）走 webpack 兜底。
