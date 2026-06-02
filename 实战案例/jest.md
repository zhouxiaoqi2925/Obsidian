# jest - Meta 出品的 JS/TS 零配置测试框架

**GitHub**: jestjs/jest
**Star**: 45k+
**语言**: TypeScript
**主题**: test-framework / monorepo / haste-map / circus-state-machine / expect-matcher
**适用场景**: JS/TS 单元测试 / 组件测试 / 快照测试 / 覆盖率

---

## 第一段：基础范式

### 模式 1 - 50+ 包 Lerna monorepo + facade 入口

**问题场景**：Jest 是大型 monorepo（jest-cli / jest-core / jest-haste-map / jest-circus / jest-runtime / expect 等 50+ 子包）。用户只 `import 'jest'`，背后 50+ 包协作。直接 require 全部会拖慢启动 + 难调依赖图。

**解决方案**：`packages/jest/src/index.ts` 入口 facade 把子包能力 re-export。`export {default as jest} from './jest'` + `export {test, it, describe, expect} from '@jest/globals'`。`packages/jest/src/jest.ts` 聚合 jestMock / jestSpyOn / jestFn / jestRequireActual 多个子包。子包独立版本（`@jest/core@29.7.0` / `expect@29.7.0`）可被单独使用。

**关键参数**：
- `jest` 主包 facade，用户 import 时加载
- `@jest/globals` 全局 describe/it/expect
- `@jest/core` CLI 启动时加载
- `@jest/environment-*` node/jsdom 运行时加载
- `expect` 独立 matcher 协议

**最佳实践**：facade 主包 + 子包分层用户无感；子包独立版本避免锁死；任何"工具 + 多模块"项目可借鉴 facade 模式；避免一锅端导致依赖图混乱。

### 模式 2 - HasteMap 虚拟文件系统

**问题场景**：传统 `fs.readdirSync + glob` 遍历项目 1w+ 文件启动 30s+。Jest 自研 `jest-haste-map` 把"全量文件 → 模块 ID"映射预计算 + 持久化缓存，启动 1s 内。

**解决方案**：`packages/jest-haste-map/src/index.ts` 暴露 `HasteMap` 类。`build()` 方法单次 Promise 缓存（`_buildPromise`），避免重复构建。`_buildFileMap` 内部走 crawlers（node/watchman 文件遍历器）→ parseManifest → buildModuleMap。`getModuleMap()` 返回模块 ID → 路径映射。`WorkerPool` 并行 parse 任务。

**关键参数**：
- `_cachePath` 缓存目录（`.jest-haste-cache/`）
- `crawlers` node/watchman 遍历器
- `fileSystem` 解析后文件表
- `ModuleMap` 模块 ID → 路径
- `WorkerPool` parse 任务并行

**最佳实践**：预计算 + 缓存避免每次扫描；增量构建只重算变化文件；watchman 优先（秒级感知），node fs 兜底；任何"项目级文件遍历"工具可借鉴；缓存目录加 `.gitignore`。

### 模式 3 - jest-circus 状态机

**问题场景**：Jasmine 引擎闭源、hook 扩展困难。Jest 自研 `jest-circus` 把 describe/it/beforeEach 建模为树形 state machine + event dispatcher。可插拔 hook + event 协议。

**解决方案**：`packages/jest-circus/src/run.ts` 用 `STATE` 对象管理 describeBlock / testName / dispatch。`run()` 主函数 dispatch `run_start` 事件 → `_runTestsForDescribeBlock(rootDescribeBlock)` 递归 → dispatch `run_finish`。事件包括 `run_start` / `test_start` / `test_done` / `run_finish` + 4 个 hook（beforeAll / beforeEach / afterEach / afterAll）。同步 + 异步 hook 都通过 event 触发。

**关键参数**：
- `STATE` 单一对象存状态
- `dispatch(event)` event 总线
- `_runTestsForDescribeBlock` 递归
- 事件列表：run_start / test_start / test_done / run_finish
- 4 hook：beforeAll/beforeEach/afterEach/afterAll

**最佳实践**：state machine + event 是 test runner 黄金模式；v27 起 `jest-circus` 替代 `jest-jasmine2`；任何"test runner / workflow engine"项目可借鉴；event-driven 解耦 reporter + lifecycle。

### 模式 4 - expect matcher 开放协议

**问题场景**：Jest 内置 30+ matcher（toBe/toEqual/toContain），但用户需要自定义 matcher（如 toBeUUID）。Jest 定义 `{ pass, message() }` 协议，任何 matcher 都返回这结构。

**解决方案**：`packages/expect/src/matchers.ts` 定义 `MatcherResult { pass: boolean; message: () => string }` 接口。`expect.extend({ toBeUUID(received: string): MatcherResult { ... } })` 注册自定义 matcher。`this.isNot` 支持 `.not.toBeUUID()` 反向断言。`this.utils` 提供 matcher 工具（`this.utils.diff`）。`message()` 是 lazy 函数只在失败时调用。

**关键参数**：
- `pass: boolean` 断言结果
- `message(): string` 失败诊断（lazy）
- `this.isNot` 反向断言
- `this.utils` 工具方法（diff / stringify）
- `expect.extend({...})` 注册

**最佳实践**：开放协议比内置方法灵活 10 倍；`message()` 是 lazy 函数；任何"断言库 / 校验器"项目可借鉴此协议；`this.isNot` 支持反向；失败信息要 human-readable 带 diff。

### 模式 5 - jest-runtime VM 沙箱

**问题场景**：测试要 mock 模块依赖（如 `jest.mock('axios')`），但 ES Module + CommonJS 混合，纯 require hook 难统一。Jest 用 VM module 自定义 module 解析，在用户代码 import 前注入 mock。

**解决方案**：`packages/jest-runtime/src/index.ts` 定义 `Runtime` 类。`_mockRegistry: Map<string, any>` 存 mock 模块表，`_moduleRegistry: Map<string, Module>` 存已加载模块缓存。`requireModule<T>(from, moduleName)` 流程：检查 mock → 解析真实模块 → 检查 module cache → 加载 + 缓存。`setMock(moduleName, mock)` 是 `jest.mock()` 内部调用。VM context 隔离全局状态。

**关键参数**：
- `_mockRegistry` mock 模块表
- `_moduleRegistry` 已加载模块缓存
- `requireModule` 模块加载入口
- `setMock` `jest.mock()` 内部
- VM context 隔离执行环境

**最佳实践**：mock 注入必须在 import 前（hoisted）；模块缓存避免重复加载；VM context 隔离全局状态；任何"模块 mock / DI 容器"项目可借鉴；配合 `jest.spyOn` 做局部 mock。

---

## 第二段：扩展范式

### 模式 6 - CLI 启动管线（yargs → validate → config → runCLI）

**问题场景**：Jest CLI 接受 50+ 配置项（`--testPathPattern` / `--coverage` / `--watch` / `--maxWorkers`），直接 `process.argv` 解析不健壮。Jest 用 yargs 解析 + jest-validate 校验 + jest-config 加载。

**解决方案**：`packages/jest-cli/src/run.ts` 的 `run(maybeArgv, project)` 主流程：buildArgv 解析 → getProjectListFromCLIArgs → runCLI 调度 → readResultsAndExit 退出。`buildArgv` 走 `validateCLIOptions(argv, { cliOptions: CLISymbols, defaultConfig })`。try/catch 兜底 `clearLine + chalk.red` 输出错误。配置优先级：CLI > config file > default。

**关键参数**：
- yargs 解析 → 类型化 argv
- jest-validate 未知选项 + 错误信息
- jest-config 合并多源
- runCLI 实际跑测试
- CLI > config file > default

**最佳实践**：三段式 parse → validate → load；配置优先级固定；`buildArgv` 可注入测试 mock 友好；try/catch 兜底输出红色 stack；任何"CLI 工具"项目可借鉴此管线。

### 模式 7 - Worker 池 + 进程隔离

**问题场景**：测试文件多（1k+），串行跑 30 分钟。多核 CPU 利用率应 100%。Jest 用 Worker 池 fork 进程跑测试，每个 test file 独立进程（隔离全局状态）。

**解决方案**：`packages/jest-worker/src/base/BaseWorkerPool.ts` 实现。`_maxWorkers = options.maxWorkers ?? Math.max(os.cpus().length - 1, 1)`。构造时循环 new Worker 创建 N 个进程。`send(task)` 走 `_getIdleWorker()` + postMessage + once('message')。`idleMemoryLimit: 300MB` 空闲 worker 自动退出。`forkOptions: --experimental-vm-modules`。

**关键参数**：
- `maxWorkers: cpus - 1` 留 1 核
- `idleMemoryLimit: 300MB` 触发回收
- `forkOptions` fork 参数
- `workerIdleMemoryLimit: 0.5` GC 阈值
- IPC 通信 JSON 序列化

**最佳实践**：`maxWorkers: cpus - 1` 留 1 核给主进程；进程隔离避免 setTimeout mock 污染；idle worker 内存超限自动回收；任何"CPU 密集型任务"可借鉴 Worker 池；worker 通信用 IPC。

### 模式 8 - Reporter 协议

**问题场景**：Jest 默认 reporter 是 spec（带颜色），CI 想要 JSON / JUnit XML / GitHub Actions 注释。Jest 用 Reporter 协议：订阅 Circus event → 格式化输出。

**解决方案**：`packages/jest-reporters/src/DefaultReporter.ts` 实现 `Reporter` 接口。`onRunStart` 打印 "Running tests..."。`onTestResult` 检查 `numFailingTests` 选 `chalk.red("FAIL")` / `chalk.green("PASS")`。`onRunComplete` 打印总数。4 个事件：onRunStart / onTestStart / onTestResult / onRunComplete。多个 reporter 可同时跑（spec + JSON）。

**关键参数**：
- `onRunStart` 测试开始
- `onTestStart` 单个 test 开始
- `onTestResult` test file 完成
- `onRunComplete` 全部完成
- 自定义只需 `implements Reporter`

**最佳实践**：reporter 订阅 event 与 Circus 解耦；多个 reporter 可同时跑；任何"event-driven 工具"项目可借鉴 reporter 协议；CI 用 JSON reporter 开发用 spec；自定义 reporter 只需实现接口。

### 模式 9 - Test Environment 适配器

**问题场景**：测试 React 组件需要 `window`/`document`，但 Jest 跑在 Node 没 DOM。Jest 用 `Test Environment` 适配：node / jsdom / happy-dom / 自定义。

**解决方案**：`packages/jest-environment-jsdom/src/index.ts` 实现 `JSDOMEnvironment` 类。构造时 `new JSDOM('<!DOCTYPE html>', { url })` 创建 DOM，`dom.window as unknown as WinType` 转 `this.global`。`setup()` 注入到 vm context，`teardown()` 调 `this.dom.window.close()`。env 切换不改 runner。`happy-dom` 提速 30%。

**关键参数**：
- `node` 后端测试（默认）
- `jsdom` React/Vue 组件
- `happy-dom` 更快 + 轻量 DOM
- `jest-environment-jsdom-sixteen` 旧 jsdom v16
- env 接口稳定

**最佳实践**：env 适配器模式，env 切换不改 runner；jsdom 启动慢，happy-dom 提速 30%；任何"多 runtime"项目可借鉴 adapter；env 接口稳定自定义 env 容易；env 切换不污染代码。

### 模式 10 - Snapshot 快照测试

**问题场景**：测试大对象 / 复杂 DOM 树 / API 响应，逐字段 assert 啰嗦 + 易碎。Jest 创新快照测试：第一次跑生成 `.snap` 文件，后续跑对比。

**解决方案**：`packages/jest-snapshot/src/State.ts` 的 `SnapshotState` 类。`_snapshotData: Map<string, SnapshotData>` 存快照，`_inlineSnapshots: Map<string, string>` 存内联快照。`match({ propertyMatchers, received, testName, key })` 流程：`prettyFormat(received)` → 查 expected → 不存在则写新 → 比对。`--ci` 禁写新快照，`--updateSnapshot` 更新。

**关键参数**：
- `.snap` 文件快照存储
- `toMatchSnapshot()` 对象快照
- `toMatchInlineSnapshot()` 内联快照
- `--ci` CI 模式禁写新
- `--updateSnapshot` 更新

**最佳实践**：快照测试捕获完整输出（减少 assert 数量）；故意变更时用 `--updateSnapshot` 或 `u` 键；任何"复杂对象 assert"项目可借鉴；大快照加 `propertyMatchers` 避免假阳性；CI 禁止意外写新快照。

---

## 第三段：进阶范式

### 模式 11 - HasteMap 缓存持久化

**问题场景**：HasteMap 首次 build 5s，二次跑仍是 5s。Jest 把"文件 → 模块 ID"映射持久化到 `.jest-haste-cache/`，二次启动 1s 内。

**解决方案**：`packages/jest-haste-map/src/index.ts` 的 `_cacheFile()` + `_readCache()`。`cacheFile = path.join(this._cachePath, this._options.id ?? 'default', 'map.json')`。`JSON.stringify(this._fileSystemData, this._replacer)` 序列化。`_readCache` 失败返 null 不抛错。失效条件：mtime 变化 / 文件删除。

**关键参数**：
- `.jest-haste-cache/` 缓存目录
- `id` 项目 id（多 project 区分）
- `JSON.stringify` 自定义 replacer 处理 Map
- 失效条件 mtime 变化
- 缓存格式 JSON

**最佳实践**：持久化 + 增量更新是加速关键；缓存目录加 `.gitignore`；CI 用 `--no-cache` 避免 cache 漂移；任何"全量扫描慢"项目可借鉴；缓存格式用 JSON 便于调试 + 跨平台。

### 模式 12 - Worker 池 idle 回收

**问题场景**：Worker 池启动 8 个进程，测试只跑 2 个文件，6 个 worker 浪费内存。Jest 用 `idleMemoryLimit` 让空闲 worker 自动退出。

**解决方案**：`packages/jest-worker/src/base/BaseWorkerPool.ts` 的 `_checkIdleMemory()`。循环 `for (const worker of this._workers)`，检查 `worker.isIdle()`，`process.memoryUsage().heapUsed / 1024 / 1024` 超过 `idleMemoryLimit` 则 `worker.stop()` + `splice` 移除。检查时机在每次 `send` 前主动检查。

**关键参数**：
- `idleMemoryLimit: 300MB` 单 worker 上限
- `workerIdleMemoryLimit: 0.5` GC 比例
- 检查时机每 send 前
- 主动检查非定时器

**最佳实践**：资源按需比"启动全部"省内存；任何"长跑 daemon"项目可借鉴；LRU 替代空闲 worker 避免反复 fork；内存监控用 `process.memoryUsage()`；配合 `--logHeapUsage` 调试。

### 模式 13 - 模块缓存分层

**问题场景**：100 个 test file 都 `import lodash`，每个文件都重新 load 一次。Jest 把已加载模块缓存到 `_moduleRegistry`，跨 test file 共享（只对 node_modules 生效）。

**解决方案**：`packages/jest-runtime/src/index.ts` 的 `requireModule<T>` 流程。`_resolveModule` 算路径 → `_isNodeModule(modulePath)` 判定 → 是 node_modules 则查 `_moduleRegistry` → 用户代码不缓存每次新加载。`jest.mock` mock 不缓存。配合 Worker 隔离不冲突。

**关键参数**：
- `node_modules` 跨 test file 共享
- 用户代码不缓存（独立）
- `jest.mock` mock 不缓存
- `_isNodeModule` 判定
- Worker 隔离不冲突

**最佳实践**：node_modules 共享（读多写少）；用户代码每次新加载（隔离）；任何"模块加载"项目可借鉴此分层缓存；`jest.mock` 必须每次新（隔离副作用）；配合 Worker 隔离不冲突。

### 模式 14 - 并发 test（concurrent + p-limit）

**问题场景**：100 个 test 都是 `async`，串行 await 慢。v27 起 Jest 支持 `test.concurrent`，同 describe block 内并发跑，用 `p-limit` 限制并行度。

**解决方案**：`packages/jest-circus/src/run.ts` 的 `_runTestsForDescribeBlock`。判断 `describeBlock.concurrent`，是则 `const limit = pLimit(20)`，`Promise.all(filter(c => c.concurrent).map(test => limit(() => _runTest(test))))`。否则保持串行递归。`describe.concurrent` 整个 block 并发，`test.concurrent` 单 test 并发。

**关键参数**：
- `concurrent: false` 默认
- `maxConcurrency: 5` 限制
- `p-limit` 第三方并发限制器
- 共享 state 的 test 不能并发

**最佳实践**：`describe.concurrent` 整个 block 并发；`test.concurrent` 单 test 并发；任何"独立异步任务"项目可借鉴；共享 state 的 test 不能并发；配合 `--runInBand` 调试。

### 模式 15 - Bench 性能回归

**问题场景**：性能改了一行代码，全部 test 慢 30%？Jest 用 `benchmarks/` 目录持续追踪 build / test 启动时间。

**解决方案**：`benchmarks/` 目录结构：`test-suite/source/` 真实规模项目 + `test-suite/bench.ts` 跑 N 次取平均 + `parse-ast/` AST 解析基准 + `run_all.ts` 编排。`process.hrtime.bigint()` ns 精度计时。PR push 自动跑。Codecov 跑覆盖率 + 性能。

**关键参数**：
- `source/` 真实规模（1000+ test file）
- `bench.ts` Benchmark.js 跑 N 次
- `process.hrtime.bigint()` ns 精度
- 输出平均时间 ± 标准差
- 触发 PR push 自动

**最佳实践**：真实规模 source（1000+ test file）；多次跑取平均避免 GC 抖动；PR 自动跑 bench 防回归；任何"性能敏感"项目可借鉴；配合 Codecov 跑覆盖率 + 性能。

---

## 第四段：实战范式

### 模式 16 - dogfood 自测试

**问题场景**：测试框架怎么保证自己没问题？Jest 的答案是 dogfood——Jest 用 Jest 测 Jest（`yarn test` 跑 2k+ 测试覆盖 50+ 包）。

**解决方案**：`yarn test` 跑 `packages/jest-cli/__tests__/` + `packages/jest-haste-map/__tests__/` + `packages/jest-circus/__tests__/` + ... + `e2e/__tests__/` 真实 CLI 行为。Unit 2000+ + E2E 200+ + Bench 10+。Codecov 跑覆盖率。

**关键参数**：
- Unit Jest 单元 2000+
- E2E Jest 跑 CLI 200+
- Bench benchmarks/ 10+
- 自测试 vs 模拟

**最佳实践**：dogfood 是工具类项目的终极验证；任何"测试 / 编译器 / 构建工具"项目都应 dogfood；E2E 测试覆盖真实 CLI 调用；配合 Codecov 跑覆盖率；自测试能比"模拟"找出更多 bug。

### 模式 17 - E2E 测试 + spawn 真实 CLI

**问题场景**：单元测试通过但真实 CLI 行为有问题（如参数解析、文件 IO 路径）。Jest 用 `e2e/__tests__/*.test.ts` 跑 `child_process.spawn('jest', ...)` 真实 CLI。

**解决方案**：`e2e/__tests__/cliPaths.test.ts` 用 `import {run} from '../Utils'`。`test('--config path resolves correctly', () => { const result = run(...) })`，断言 `result.status === 0` + `result.stdout.toMatch('Tests:')`。`run(cmd, opts)` spawn 独立进程。`stripAnsi: true` 去颜色码简化断言。

**关键参数**：
- `run(cmd, opts)` spawn 真实 CLI
- `result.status` 退出码
- `result.stdout/stderr` 输出
- `stripAnsi: true` 去颜色码
- E2E 比例 5-10%

**最佳实践**：E2E 验证 CLI 真实行为；spawn 独立进程避免污染；任何"CLI 工具"项目可借鉴；stripAnsi 简化断言；E2E 不能太多跑得慢，5%-10% 比例。

### 模式 18 - Lint + tsc + 单元 + E2E + Bench 五道防线

**问题场景**：CI 跑得太慢 / 跑得不全面，bug 漏到 main。Jest CI 跑五道防线：Lint / tsc / 单元 / E2E / Bench。

**解决方案**：`package.json` scripts：`"lint": "eslint ."` + `"typecheck": "tsc --noEmit"` + `"test": "yarn jest"` + `"test-e2e": "yarn jest --config e2e/jest.config.js"` + `"bench": "node benchmarks/run_all.js"`。Lint 30s + Typecheck 60s + 单元 5min + E2E 10min + Bench 30min。Codecov 强制覆盖率门槛。

**关键参数**：
- Lint ESLint 30s
- Typecheck tsc --noEmit 60s
- 单元 Jest 5min
- E2E Jest 10min
- Bench benchmarks 30min

**最佳实践**：多道防线 = 多道安全保障；Lint + typecheck 先行快速失败；单元 + E2E 必跑 Bench 可 nightly；任何"严肃开源"项目可借鉴此分层；Codecov 强制覆盖率门槛。

### 模式 19 - ts-jest / babel-jest / @swc/jest / vite-jest 多适配器

**问题场景**：Jest 默认用 `babel-jest` 转译 TS，但慢。生态有 `ts-jest`（直接 tsc）/ `@swc/jest`（Rust 转译，快 20 倍）/ `vite-jest`（用 Vite）。

**解决方案**：默认 `transform: {'^.+\\.[jt]sx?$': 'babel-jest'}`。`ts-jest` 用 `preset: 'ts-jest'`。`@swc/jest` 用 `transform: { '^.+\\.[jt]sx?$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript' } } }] }`。`@swc/jest` 快 20x。babel-jest 兜底（最稳）。

**关键参数**：
- `babel-jest` 慢但 100% 兼容
- `ts-jest` 中速 TS 原生
- `@swc/jest` 快 20x
- `vite-jest` 快 Vite 项目
- 适配器接口稳定切换零成本

**最佳实践**：多适配器并存用户按需选；`@swc/jest` 是性能首选；任何"工具 + 多语言"项目可借鉴适配器；适配器接口稳定切换零成本；babel-jest 兜底最稳。

### 模式 20 - OpenJS Foundation 治理

**问题场景**：JS 测试框架很多（Mocha/Vitest/AVA），为什么 Jest 是默认？生态 + 治理：OpenJS Foundation 托管 + Core Team 30+ 维护者 + RFC 流程 + Discord 社区。

**解决方案**：治理 = OpenJS Foundation 项目 + Jest Core Team（30+ 维护者，Meta 主导）+ Open Collective 赞助。流程 = RFC（GitHub Discussions rfc 标签）+ TSC 评审 + good first issue（新手友好）+ Bug Bash（社区活动）。沟通 = Discord（实时）+ GitHub Discussions + Twitter + JestJS.io 官网。Star 45k+ + 月下载 5000 万 + License MIT。

**关键参数**：
- 维护者 30+
- Star 45k+
- 月下载 5000 万
- License MIT
- 主仓库 jestjs/jekyll

**最佳实践**：OpenJS Foundation 托管 = 中立 + 长期；RFC 流程让大变更先讨论；`good first issue` 降低贡献门槛；任何"开源大项目"可借鉴此治理；多渠道沟通 Discord + Discussions + Twitter。
