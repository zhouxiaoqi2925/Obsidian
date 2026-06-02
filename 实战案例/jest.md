# Jest · ABL 风格深度解析

> 主题：Meta 出品的 JavaScript/TypeScript 零配置测试框架。50+ npm 包 Lerna monorepo + HasteMap 虚拟文件系统 + Worker 池隔离 + jest-circus 状态机 + expect matcher 开放协议 + jest-runtime VM 沙箱。本文聚焦 20 个可复用模式（核心原理 / 架构设计 / 性能优化 / 可靠性与生态）。

---

## 一、核心原理

### 模式 1：50+ 包 Lerna monorepo - 入口 facade + 子包 re-export

**问题场景**：Jest 是大型 monorepo，jest-cli / jest-core / jest-haste-map / jest-circus / jest-runtime / expect 等 50+ 子包。**用户只 import 一个 `jest`**，背后是 50+ 包协作。直接 require 全部会拖慢启动 + 难调依赖图。

**解决方案代码**（`packages/jest/src/index.ts` 入口 facade）：
```ts
// 用户主入口：把 50+ 子包的能力 re-export
export {default as jest} from './jest';
export {test, it, describe, expect} from '@jest/globals';
export {jest as default} from './jest';
```

```ts
// packages/jest/src/jest.ts（facade 聚合）
import {jestMock, jestSpyOn, jestFn, jestRequireActual} from '@jest/mock';
import {jestObject} from '@jest/globals';
export const jest = jestObject;
// 聚合 describe/it/test/expect/jest.mock/jest.spyOn/jest.fn/...
```

**关键参数表**：

| 模式 | 用途 | 加载时机 |
| :--- | :--- | :--- |
| `jest` 主包 | facade，re-export | 用户 import 时 |
| `@jest/globals` | describe/it/expect 全局 | 用户 import 时 |
| `@jest/core` | CLI + 调度 | CLI 启动 |
| `@jest/environment-*` | node/jsdom | 运行时 |
| `expect` 独立 | matcher 协议 | 用户 import 时 |

**最佳实践**：
- ✅ **facade 主包 + 子包分层**，**用户无感**
- ✅ 子包**独立版本**（`@jest/core@29.7.0` / `expect@29.7.0`）
- ✅ 子包可被**单独使用**（`import {expect} from 'expect'`）
- ✅ 任何"工具 + 多模块"项目可借鉴 facade 模式
- ✅ 避免"一锅端"导致版本锁死

---

### 模式 2：HasteMap 虚拟文件系统 - 全量文件 → 模块 ID 预计算

**问题场景**：传统 `fs.readdirSync + glob` 遍历项目 1w+ 文件，**启动 30s+**。Jest 自研 `jest-haste-map` 把"全量文件 → 模块 ID"映射预计算 + 持久化缓存，**启动 1s 内**。

**解决方案代码**（`packages/jest-haste-map/src/index.ts` 节选）：
```ts
export class HasteMap {
  private _buildPromise: Promise<InternalHasteMap> | null = null;
  private _cachePath: string;
  private _options: Options;

  async build(): Promise<InternalHasteMap> {
    if (this._buildPromise) return this._buildPromise;
    this._buildPromise = this._buildFileMap();
    return this._buildPromise;
  }

  private async _buildFileMap(): Promise<InternalHasteMap> {
    const {crawlers, fileSystem} = await this._buildFileCrawlers();
    const [fileMap, snapshot] = await this._parseManifest(fileSystem);
    return this._buildModuleMap(fileMap, snapshot);
  }

  getModuleMap(): ModuleMap {
    return this._moduleMap;
  }
}
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `_cachePath` | 缓存目录（`.jest-haste-cache/`）|
| `crawlers` | node/watchman 文件遍历器 |
| `fileSystem` | 解析后的文件表 |
| `ModuleMap` | 模块 ID → 路径映射 |
| `WorkerPool` | parse 任务并行 |

**最佳实践**：
- ✅ **预计算 + 缓存**，**避免每次扫描**
- ✅ 增量构建时**只重算变化文件**
- ✅ `watchman` 优先（秒级感知），`node fs` 兜底
- ✅ 任何"项目级文件遍历"工具可借鉴
- ✅ 缓存目录加 `.gitignore`

---

### 模式 3：jest-circus 状态机 - describe/it 树形 event-driven 引擎

**问题场景**：Jasmine 引擎是闭源的、hook 扩展困难。Jest 自研 `jest-circus` 把 describe/it/beforeEach 建模为**树形 state machine + event dispatcher**。WHY：**可插拔 hook + event 协议**。

**解决方案代码**（`packages/jest-circus/src/run.ts` 节选）：
```ts
const STATE = {
  describeBlock: new Map(),
  testName: new AsyncLocalStorage<string>(),
  dispatch: (event) => eventHandler(event),
};

export async function run(): Promise<void> {
  await dispatch({name: 'run_start'});
  const result = await _runTestsForDescribeBlock(rootDescribeBlock);
  await dispatch({name: 'run_finish'});
  return result;
}

async function _runTestsForDescribeBlock(describeBlock): Promise<void> {
  for (const child of describeBlock.children) {
    if (child.type === 'describe') {
      await _runTestsForDescribeBlock(child);
    } else if (child.type === 'test') {
      await _runTest(child);
    }
  }
}
```

**关键参数表**：

| 事件 | 触发时机 |
| :--- | :--- |
| `run_start` | run() 入口 |
| `test_start` | 每个 test 开始 |
| `test_done` | 每个 test 结束 |
| `run_finish` | run() 出口 |
| hook | `beforeAll` / `beforeEach` / `afterEach` / `afterAll` |

**最佳实践**：
- ✅ **state machine + event** 是 test runner 的黄金模式
- ✅ v27 起 `jest-circus` 替代 `jest-jasmine2`
- ✅ 任何"test runner / workflow engine"可借鉴
- ✅ event-driven 解耦 reporter + lifecycle
- ✅ 同步 + 异步 hook 都通过 event 触发

---

### 模式 4：expect matcher 开放协议 - `{ pass, message() }` 接口

**问题场景**：Jest 内置 30+ matcher（toBe/toEqual/toContain/...），但用户需要**自定义 matcher**（如 toBeUUID）。Jest 定义 `{ pass, message() }` 协议，**任何 matcher 都返回这结构**。

**解决方案代码**（`packages/expect/src/matchers.ts` 节选）：
```ts
export interface MatcherResult {
  pass: boolean;
  message: () => string;
}

// 自定义 matcher 范例
expect.extend({
  toBeUUID(received: string): MatcherResult {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return {
      pass: uuidRegex.test(received),
      message: () => uuidRegex.test(received)
        ? `expected ${received} not to be a valid UUID`
        : `expected ${received} to be a valid UUID`,
    };
  },
});
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `pass` | true=通过，false=失败 |
| `message()` | 失败时的诊断信息 |
| `this.isNot` | `.not.toBeUUID()` 反向断言 |
| `this.utils` | matcher 工具（`this.utils.diff`） |
| 注册 | `expect.extend({toBeUUID})` |

**最佳实践**：
- ✅ **开放协议** 比"内置方法"灵活 10 倍
- ✅ `message()` 是 **lazy 函数**（只在失败时调用）
- ✅ 任何"断言库 / 校验器"项目可借鉴此协议
- ✅ `this.isNot` 支持反向断言
- ✅ 失败信息要 human-readable（**带 diff**）

---

### 模式 5：jest-runtime VM 沙箱 - require 拦截 + 模块 mock 注入

**问题场景**：测试要 mock 模块依赖（如 `jest.mock('axios')`），但 ES Module + CommonJS 混合，**纯 require hook 难统一**。Jest 用 VM module 自定义 module 解析，**在用户代码 import 前注入 mock**。

**解决方案代码**（`packages/jest-runtime/src/index.ts` 节选）：
```ts
class Runtime {
  private _mockRegistry: Map<string, any> = new Map();
  private _moduleRegistry: Map<string, Module> = new Map();

  requireModule<T>(from: VMContext, moduleName: string): T {
    // 1. 检查 mock
    if (this._mockRegistry.has(moduleName)) {
      return this._mockRegistry.get(moduleName);
    }
    // 2. 解析真实模块
    const modulePath = this._resolveModule(from, moduleName);
    if (this._moduleRegistry.has(modulePath)) {
      return this._moduleRegistry.get(modulePath).exports;
    }
    // 3. 加载 + 缓存
    const mod = this._loadModule(modulePath);
    this._moduleRegistry.set(modulePath, mod);
    return mod.exports as T;
  }

  setMock(moduleName: string, mock: any): void {
    this._mockRegistry.set(moduleName, mock);
  }
}
```

**关键参数表**：

| 概念 | 含义 |
| :--- | :--- |
| `_mockRegistry` | mock 模块表 |
| `_moduleRegistry` | 已加载模块缓存 |
| `requireModule` | 模块加载入口 |
| `setMock` | `jest.mock()` 内部调用 |
| VM context | 隔离的执行环境 |

**最佳实践**：
- ✅ **mock 注入必须在 import 前**（hoisted）
- ✅ 模块缓存避免重复加载
- ✅ VM context 隔离全局状态
- ✅ 任何"模块 mock / DI 容器"项目可借鉴
- ✅ 配合 `jest.spyOn` 做局部 mock

---

## 二、架构设计

### 模式 6：CLI 启动管线 - yargs → validate → config → runCLI

**问题场景**：Jest CLI 接受 50+ 配置项（`--testPathPattern` / `--coverage` / `--watch` / `--maxWorkers`），**直接 `process.argv` 解析不健壮**。Jest 用 yargs 解析 + jest-validate 校验 + jest-config 加载。

**解决方案代码**（`packages/jest-cli/src/run.ts` 节选）：
```ts
export async function run(maybeArgv?: Array<string>, project?: string): Promise<void> {
  try {
    const argv = await buildArgv(maybeArgv);
    const projects = getProjectListFromCLIArgs(argv, project);
    const {results, globalConfig} = await runCLI(argv, projects);
    readResultsAndExit(results, globalConfig);
  } catch (error: any) {
    clearLine(process.stderr);
    console.error(chalk.red(error.stack ?? error));
    exit(1);
  }
}

async function buildArgv(maybeArgv?: string[]): Promise<Config.Argv> {
  const argv = maybeArgv ?? process.argv.slice(2);
  return validateCLIOptions(argv, {
    cliOptions: CLISymbols,
    defaultConfig,
  });
}
```

**关键参数表**：

| 阶段 | 职责 |
| :--- | :--- |
| yargs 解析 | 字符串 → 类型化 argv |
| jest-validate | 未知选项 + 错误信息 |
| jest-config | 配置合并（CLI > config file > default）|
| runCLI | 实际跑测试 |

**最佳实践**：
- ✅ **三段式**：parse → validate → load
- ✅ 配置优先级：**CLI > config file > default**
- ✅ `buildArgv` 可注入（**测试 mock 友好**）
- ✅ try/catch 兜底输出**红色 stack**
- ✅ 任何"CLI 工具"项目可借鉴此管线

---

### 模式 7：Worker 池 - 进程隔离 + maxWorkers 自动调节

**问题场景**：测试文件多（1k+），**串行跑 30 分钟**。多核 CPU 利用率应 100%。Jest 用 Worker 池 fork 进程跑测试，**每个 test file 独立进程**（隔离全局状态）。

**解决方案代码**（`packages/jest-worker/src/base/BaseWorkerPool.ts` 节选）：
```ts
export default class BaseWorkerPool {
  private _workers: Array<Worker> = [];
  private readonly _maxWorkers: number;

  constructor(workerPath: string, options: WorkerPoolOptions) {
    this._maxWorkers = options.maxWorkers ?? Math.max(os.cpus().length - 1, 1);
    for (let i = 0; i < this._maxWorkers; i++) {
      this._workers.push(new Worker(workerPath, options.forkOptions));
    }
  }

  async send(task: WorkerTask): Promise<any> {
    const worker = this._getIdleWorker();
    return new Promise((resolve, reject) => {
      worker.postMessage(task);
      worker.once('message', resolve);
      worker.once('error', reject);
    });
  }
}
```

**关键参数表**：

| 参数 | 默认值 | 含义 |
| :--- | :--- | :--- |
| `maxWorkers` | `cpus - 1` | 进程数 |
| `idleMemoryLimit` | 300MB | 空闲 worker 退出 |
| `forkOptions` | `--experimental-vm-modules` | fork 参数 |
| `workerIdleMemoryLimit` | 0.5 | GC 触发阈值 |

**最佳实践**：
- ✅ **`maxWorkers: cpus - 1`**（留 1 核给主进程）
- ✅ 进程隔离**避免 setTimeout mock 污染**
- ✅ idle worker 内存超限**自动回收**
- ✅ 任何"CPU 密集型任务"可借鉴 Worker 池
- ✅ worker 通信用 IPC，**JSON 序列化**

---

### 模式 8：Reporter 协议 - 订阅 Circus event 输出报告

**问题场景**：Jest 默认 reporter 是 spec（带颜色），CI 想要 JSON / JUnit XML / GitHub Actions 注释。Jest 用 Reporter 协议：**订阅 Circus event → 格式化输出**。

**解决方案代码**（`packages/jest-reporters/src/DefaultReporter.ts` 节选）：
```ts
export default class DefaultReporter implements Reporter {
  onRunStart(_result: AggregatedResult, _options: ReporterOnOptions): void {
    console.log('Running tests...');
  }

  onTestResult(_test: Test, testResult: TestResult, aggregatedResult: AggregatedResult): void {
    const path = testResult.testFilePath;
    if (testResult.numFailingTests > 0) {
      console.log(chalk.red(`FAIL ${path}`));
    } else {
      console.log(chalk.green(`PASS ${path}`));
    }
  }

  onRunComplete(_contexts: Set<Context>, results: AggregatedResult): void {
    console.log(`Tests: ${results.numTotalTests}, Failures: ${results.numFailedTests}`);
  }
}
```

**关键参数表**：

| 事件 | 用途 |
| :--- | :--- |
| `onRunStart` | 测试开始 |
| `onTestStart` | 单个 test 开始 |
| `onTestResult` | test file 完成 |
| `onRunComplete` | 全部完成 |

**最佳实践**：
- ✅ **reporter 订阅 event**，**与 Circus 解耦**
- ✅ 多个 reporter 可同时跑（spec + JSON）
- ✅ 任何"event-driven 工具"项目可借鉴 reporter 协议
- ✅ CI 用 JSON reporter，**开发用 spec**
- ✅ 自定义 reporter 只需 `implements Reporter`

---

### 模式 9：Test Environment 适配器 - node / jsdom / happy-dom

**问题场景**：测试 React 组件需要 `window`/`document`，但 Jest 跑在 Node 没 DOM。Jest 用 `Test Environment` 适配：**node / jsdom / happy-dom / 自定义**。

**解决方案代码**（`packages/jest-environment-jsdom/src/index.ts` 节选）：
```ts
export default class JSDOMEnvironment implements JestEnvironment {
  dom: JSDOM;
  global: WinType;

  constructor(config: Config.ProjectConfig, context: EnvironmentContext) {
    this.dom = new JSDOM('<!DOCTYPE html>', {url: config.testEnvironmentOptions?.url});
    this.global = this.dom.window as unknown as WinType;
    // 注入 jest 工具
    this.global.TextEncoder = TextEncoder;
    this.global.TextDecoder = TextDecoder;
  }

  async setup(): Promise<void> {
    // 注入到 vm context
  }

  async teardown(): Promise<void> {
    this.dom.window.close();
  }
}
```

**关键参数表**：

| 环境 | 用途 |
| :--- | :--- |
| `node` | 后端测试（默认）|
| `jsdom` | React/Vue 组件 |
| `happy-dom` | 更快 + 轻量 DOM |
| `jest-environment-jsdom-sixteen` | 旧 jsdom v16 |

**最佳实践**：
- ✅ **env 适配器模式**，**env 切换不改 runner**
- ✅ jsdom 启动慢，**happy-dom 提速 30%**
- ✅ 任何"多 runtime"项目可借鉴 adapter
- ✅ env 接口稳定，**自定义 env 容易**
- ✅ env 切换不污染代码

---

### 模式 10：Snapshot 快照测试 - 序列化 + 写入 + 自动更新

**问题场景**：测试大对象 / 复杂 DOM 树 / API 响应，**逐字段 assert 啰嗦 + 易碎**。Jest 创新**快照测试**：第一次跑生成 `.snap` 文件，**后续跑对比**。

**解决方案代码**（`packages/jest-snapshot/src/State.ts` 节选）：
```ts
export class SnapshotState {
  private _snapshotData: Map<string, SnapshotData> = new Map();
  private _inlineSnapshots: Map<string, string> = new Map();

  match({propertyMatchers, received, testName, key}: MatchSnapshotOptions): {pass: boolean; message?: string} {
    const formatted = prettyFormat(received);
    const expected = this._snapshotData.get(testName);
    if (!expected) {
      this._snapshotData.set(testName, formatted);
      return {pass: true, message: 'New snapshot written'};
    }
    if (expected === formatted) return {pass: true};
    return {
      pass: false,
      message: `Snapshot difference:\n${diff(expected, formatted)}`,
    };
  }
}
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `.snap` 文件 | 快照存储 |
| `toMatchSnapshot()` | 对象快照 |
| `toMatchInlineSnapshot()` | 内联快照 |
| `--ci` | CI 模式（**禁写新快照**）|
| `--updateSnapshot` | 更新快照 |

**最佳实践**：
- ✅ 快照测试**捕获完整输出**（减少 assert 数量）
- ✅ 故意变更时用 `--updateSnapshot` 或 `u` 键
- ✅ 任何"复杂对象 assert"项目可借鉴
- ✅ 大快照加 `propertyMatchers` 避免假阳性
- ✅ CI 禁止**意外写新快照**

---

## 三、性能优化

### 模式 11：HasteMap 缓存持久化 - `.jest-haste-cache/`

**问题场景**：HasteMap 首次 build 5s，**二次跑仍是 5s**。Jest 把"文件 → 模块 ID"映射**持久化到 `.jest-haste-cache/`**，二次启动 1s 内。

**解决方案代码**（`packages/jest-haste-map/src/index.ts` `_cacheFile` 节选）：
```ts
private async _cacheFile(): Promise<void> {
  const cacheFile = path.join(this._cachePath, this._options.id ?? 'default', 'map.json');
  const data = JSON.stringify(this._fileSystemData, this._replacer);
  await fs.writeFile(cacheFile, data);
}

private async _readCache(): Promise<InternalHasteMap | null> {
  try {
    const cacheFile = path.join(this._cachePath, this._options.id ?? 'default', 'map.json');
    const raw = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(raw, this._reviver);
  } catch {
    return null;
  }
}
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `.jest-haste-cache/` | 缓存目录 |
| `id` | 项目 id（多 project 区分）|
| `JSON.stringify` | 自定义 replacer 处理 Map |
| 失效条件 | mtime 变化 / 文件删除 |

**最佳实践**：
- ✅ **持久化 + 增量更新** 是加速关键
- ✅ 缓存目录加 `.gitignore`
- ✅ CI 用 `--no-cache`（**避免 cache 漂移**）
- ✅ 任何"全量扫描慢"项目可借鉴此模式
- ✅ 缓存格式用 JSON（**便于调试 + 跨平台**）

---

### 模式 12：Worker 池 idle 回收 - idleMemoryLimit 自动退出

**问题场景**：Worker 池启动 8 个进程，**测试只跑 2 个文件**，**6 个 worker 浪费内存**。Jest 用 `idleMemoryLimit` 让空闲 worker **自动退出**。

**解决方案代码**（`packages/jest-worker/src/base/BaseWorkerPool.ts` 节选）：
```ts
private _checkIdleMemory(): void {
  if (this._options.idleMemoryLimit == null) return;
  for (const worker of this._workers) {
    if (worker.isIdle()) {
      const memUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      if (memUsage > this._options.idleMemoryLimit) {
        worker.stop();
        this._workers.splice(this._workers.indexOf(worker), 1);
      }
    }
  }
}
```

**关键参数表**：

| 参数 | 默认值 | 含义 |
| :--- | :--- | :--- |
| `idleMemoryLimit` | 300MB | 单 worker 内存上限 |
| `workerIdleMemoryLimit` | 0.5 | GC 触发比例 |
| 检查时机 | 每 send 前 | 主动检查 |

**最佳实践**：
- ✅ **资源按需** 比"启动全部"省内存
- ✅ 任何"长跑 daemon"项目可借鉴此模式
- ✅ LRU 替代空闲 worker，**避免反复 fork**
- ✅ 内存监控用 `process.memoryUsage()`
- ✅ 配合 `--logHeapUsage` 调试

---

### 模式 13：模块缓存 - 跨 test file 共享已加载模块

**问题场景**：100 个 test file 都 `import lodash`，**每个文件都重新 load 一次**。Jest 把**已加载模块缓存**到 `_moduleRegistry`，跨 test file 共享（**只对 node_modules 生效**）。

**解决方案代码**（`packages/jest-runtime/src/index.ts` 节选）：
```ts
requireModule<T>(from: VMContext, moduleName: string): T {
  const modulePath = this._resolveModule(from, moduleName);
  // node_modules 跨文件缓存
  if (this._isNodeModule(modulePath)) {
    if (this._moduleRegistry.has(modulePath)) {
      return this._moduleRegistry.get(modulePath).exports as T;
    }
  }
  // 用户代码不缓存（每个 test file 独立）
  const mod = this._loadModule(modulePath);
  if (this._isNodeModule(modulePath)) {
    this._moduleRegistry.set(modulePath, mod);
  }
  return mod.exports as T;
}
```

**关键参数表**：

| 模块类型 | 缓存策略 |
| :--- | :--- |
| `node_modules` | 跨 test file 共享 |
| 用户代码 | 不缓存（独立）|
| `jest.mock` mock | 不缓存 |

**最佳实践**：
- ✅ **node_modules 共享**（读多写少）
- ✅ 用户代码**每次新加载**（隔离）
- ✅ 任何"模块加载"项目可借鉴此分层缓存
- ✅ `jest.mock` 必须**每次新**（隔离副作用）
- ✅ 配合 Worker 隔离**不冲突**

---

### 模式 14：并发 test - `concurrent: true` + p-limit 限制

**问题场景**：100 个 test 都是 `async`，**串行 await 慢**。v27 起 Jest 支持 `test.concurrent`，**同 describe block 内并发跑**，用 `p-limit` 限制并行度。

**解决方案代码**（`packages/jest-circus/src/run.ts` 节选）：
```ts
async function _runTestsForDescribeBlock(describeBlock): Promise<void> {
  if (describeBlock.concurrent) {
    const limit = pLimit(20); // 限制 20 并发
    await Promise.all(
      describeBlock.children
        .filter(c => c.type === 'test' && c.concurrent)
        .map(test => limit(() => _runTest(test)))
    );
  } else {
    for (const child of describeBlock.children) {
      await _runTestsForDescribeBlock(child);
    }
  }
}
```

**关键参数表**：

| 参数 | 默认值 | 含义 |
| :--- | :--- | :--- |
| `concurrent` | false | 是否并发 |
| `maxConcurrency` | 5 | describe 内最大并发 |
| `p-limit` | 第三方 | 并发限制器 |

**最佳实践**：
- ✅ `describe.concurrent` 整个 block 并发
- ✅ `test.concurrent` 单个 test 并发
- ✅ 任何"独立异步任务"项目可借鉴
- ✅ 共享 state 的 test 不能并发
- ✅ 配合 `--runInBand` 调试

---

### 模式 15：Bench 性能回归 - `benchmarks/` 持续追踪

**问题场景**：性能改了一行代码，**全部 test 慢 30%**？Jest 用 `benchmarks/` 目录**持续追踪 build / test 启动时间**。

**解决方案结构**（`benchmarks/` 目录）：
```
benchmarks/
├── test-suite/
│   ├── source/     # 真实规模项目
│   └── bench.ts    # 跑 N 次取平均
├── parse-ast/
└── run_all.ts
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `source/` | 真实规模（1000+ test file）|
| `bench.ts` | `Benchmark.js` 跑 N 次 |
| `process.hrtime.bigint()` | ns 精度计时 |
| 输出 | 平均时间 ± 标准差 |
| 触发 | PR push 自动跑 |

**最佳实践**：
- ✅ 真实规模 source（**1000+ test file**）
- ✅ 多次跑取平均（**避免 GC 抖动**）
- ✅ PR 自动跑 bench **防回归**
- ✅ 任何"性能敏感"项目可借鉴
- ✅ 配合 Codecov 跑覆盖率 + 性能

---

## 四、可靠性与生态

### 模式 16：自测试 dogfood - 用 Jest 测 Jest

**问题场景**：测试框架怎么**保证自己没问题**？Jest 的答案是 **dogfood**——Jest 用 Jest 测 Jest（`yarn test` 跑 2k+ 测试覆盖 50+ 包）。

**解决方案结构**：
```
yarn test
├── packages/jest-cli/__tests__/
├── packages/jest-haste-map/__tests__/
├── packages/jest-circus/__tests__/
├── ...
└── e2e/__tests__/   # 真实 CLI 行为
```

**关键参数表**：

| 测试类型 | 工具 | 数量 |
| :--- | :--- | :--- |
| Unit | Jest 单元 | 2000+ |
| E2E | Jest 跑 CLI | 200+ |
| Bench | benchmarks/ | 10+ |

**最佳实践**：
- ✅ **dogfood 是工具类项目的终极验证**
- ✅ 任何"测试 / 编译器 / 构建工具"项目都应 dogfood
- ✅ E2E 测试覆盖**真实 CLI 调用**
- ✅ 配合 Codecov 跑覆盖率
- ✅ 自测试能比"模拟"找出更多 bug

---

### 模式 17：E2E 测试 - `e2e/__tests__/` 真实 CLI 调用

**问题场景**：单元测试通过但**真实 CLI 行为有问题**（如参数解析、文件 IO 路径）。Jest 用 `e2e/__tests__/*.test.ts` 跑 `child_process.spawn('jest', ...)` 真实 CLI。

**解决方案代码**（`e2e/__tests__/cliPaths.test.ts` 节选）：
```ts
import {run} from '../Utils';

test('--config path resolves correctly', () => {
  const result = run(`--config ${JSON.stringify(customConfigPath)}`);
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch('Tests:');
});

test('fails on missing config', () => {
  const result = run('--config /nonexistent/jest.config.js', {stripAnsi: true});
  expect(result.status).toBe(1);
  expect(result.stderr).toMatch('Configuration file');
});
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `run(cmd, opts)` | spawn 真实 CLI |
| `result.status` | 退出码 |
| `result.stdout/stderr` | 输出 |
| `stripAnsi: true` | 去颜色码 |

**最佳实践**：
- ✅ **E2E 验证 CLI 真实行为**
- ✅ spawn 独立进程，**避免污染**
- ✅ 任何"CLI 工具"项目可借鉴
- ✅ stripAnsi 简化断言
- ✅ E2E 不能太多（**跑得慢**），**5%-10%** 比例

---

### 模式 18：Lint + tsc + 单元 + E2E + Bench 五道防线

**问题场景**：CI 跑得太慢 / 跑得不全面，**bug 漏到 main**。Jest CI 跑**五道防线**：
1. Lint（ESLint）
2. tsc（TypeScript 类型检查）
3. 单元（自测试）
4. E2E（CLI 行为）
5. Bench（性能回归）

**解决方案**（`package.json` scripts）：
```json
{
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "yarn jest",
    "test-e2e": "yarn jest --config e2e/jest.config.js",
    "bench": "node benchmarks/run_all.js"
  }
}
```

**关键参数表**：

| 防线 | 工具 | 时间 |
| :--- | :--- | :--- |
| Lint | ESLint | 30s |
| Typecheck | tsc --noEmit | 60s |
| 单元 | Jest | 5min |
| E2E | Jest | 10min |
| Bench | benchmarks | 30min |

**最佳实践**：
- ✅ **多道防线 = 多道安全保障**
- ✅ Lint + typecheck 先行（**快速失败**）
- ✅ 单元 + E2E 必跑，**Bench 可 nightly**
- ✅ 任何"严肃开源"项目可借鉴此分层
- ✅ Codecov 强制覆盖率门槛

---

### 模式 19：生态适配 - ts-jest / babel-jest / @swc/jest / vite-jest

**问题场景**：Jest 默认用 `babel-jest` 转译 TS，但**慢**。生态有 `ts-jest`（直接 tsc）/ `@swc/jest`（Rust 转译，快 20 倍）/ `vite-jest`（用 Vite）。

**解决方案对比**（`_config.ts` 配置）：

```ts
// 默认：babel-jest
import babelJest from 'babel-jest';
export default {
  transform: {'^.+\\.[jt]sx?$': 'babel-jest'},
};

// ts-jest：直接 tsc
import {createDefaultPreset} from 'ts-jest';
export default {
  preset: 'ts-jest',
};

// @swc/jest：Rust 转译
export default {
  transform: {'^.+\\.[jt]sx?$': ['@swc/jest', {jsc: {parser: {syntax: 'typescript'}}}]},
};
```

**关键参数表**：

| 适配器 | 速度 | 兼容性 |
| :--- | :--- | :--- |
| `babel-jest` | 慢 | 100% |
| `ts-jest` | 中 | TS 原生 |
| `@swc/jest` | **快 20x** | ESM/TSX/装饰器 |
| `vite-jest` | 快 | Vite 项目 |

**最佳实践**：
- ✅ **多适配器并存**，**用户按需选**
- ✅ `@swc/jest` 是性能首选
- ✅ 任何"工具 + 多语言"项目可借鉴适配器
- ✅ 适配器接口稳定，**切换零成本**
- ✅ babel-jest 兜底（**最稳**）

---

### 模式 20：OpenJS Foundation 治理 - Core Team + RFC + Discord

**问题场景**：JS 测试框架很多（Mocha/Vitest/AVA），**为什么 Jest 是默认**？**生态 + 治理**：OpenJS Foundation 托管 + Core Team 30+ 维护者 + RFC 流程 + Discord 社区。

**解决方案**（治理结构）：
```
治理
├── OpenJS Foundation 项目
├── Jest Core Team（30+ 维护者，Meta 主导）
└── Open Collective 赞助

流程
├── RFC（GitHub Discussions rfc 标签）
├── TSC 评审
├── good first issue（新手友好）
└── Bug Bash（社区活动）

沟通
├── Discord（实时）
├── GitHub Discussions
├── Twitter
└── JestJS.io 官网
```

**关键参数表**：

| 维度 | 数据 |
| :--- | :--- |
| 维护者 | 30+ |
| Star | 45k+ |
| 月下载 | 5000 万 |
| License | MIT |
| 主仓库 | jestjs/jekyll |
| 镜像 | 100+ fork |

**最佳实践**：
- ✅ **OpenJS Foundation 托管** = 中立 + 长期
- ✅ RFC 流程让**大变更先讨论**
- ✅ `good first issue` 降低贡献门槛
- ✅ 任何"开源大项目"可借鉴此治理
- ✅ 多渠道沟通（Discord + Discussions + Twitter）

---

## 总结速查

**一句话价值**：Jest = TypeScript + Lerna monorepo + HasteMap 虚拟 FS + jest-circus state machine + expect matcher 开放协议 + jest-runtime VM 沙箱 + Worker 池 = 45k+ Star 零配置测试框架。

**5 个核心架构模式**：
1. **50+ 包 Lerna monorepo + facade 入口**：用户 import 一处，背后 50+ 包协作
2. **HasteMap 虚拟文件系统**：全量文件 → 模块 ID 预计算 + 持久化缓存
3. **jest-circus state machine**：describe/it 树形 event-driven 引擎
4. **expect matcher 协议 `{pass, message()}`**：开放 assertion 协议
5. **jest-runtime VM 沙箱**：require 拦截 + mock 注入

**5 个性能优化模式**：
1. **HasteMap 缓存持久化**：`.jest-haste-cache/` 二次启动 1s
2. **Worker 池 idle 回收**：`idleMemoryLimit` 自动退出空闲 worker
3. **模块缓存分层**：node_modules 共享 + 用户代码独立
4. **concurrent test + p-limit**：v27 起支持并发 test
5. **bench 性能回归**：真实规模 + 多次平均 + PR 自动跑

**5 个可靠性与生态模式**：
1. **dogfood 自测试**：用 Jest 测 Jest（2000+ 单元 + 200+ E2E）
2. **E2E 真实 CLI 行为**：`child_process.spawn('jest', ...)` 验证
3. **五道防线**：Lint + tsc + 单元 + E2E + Bench
4. **多适配器**：ts-jest / babel-jest / @swc/jest / vite-jest
5. **OpenJS Foundation 治理**：Core Team + RFC + Discord + good first issue

**5 段必读代码**：
- `packages/jest-cli/src/run.ts`（100 行，CLI 启动范本）
- `packages/jest-haste-map/src/index.ts`（前 100 行，HasteMap 入口）
- `packages/jest-circus/src/run.ts`（前 100 行，state machine 引擎）
- `packages/expect/src/matchers.ts`（matcher 协议实现）
- `packages/jest-runtime/src/index.ts`（模块沙箱实现）

**3 个避坑要点**：
1. **不要 fork 每 test file**（大型 monorepo 1k+ test files 时 fork 开销爆炸）
2. **不要用 `@providesModule` haste ID**（已 deprecated）
3. **不要 `jest.mock` 全局副作用模块**（`jest.mock('fs')` 让代码不可读）

**仓库元信息**：
- 路径：`G:\Obsidian Vault\实战案例\jest.md`
- 版本：v29.7.x
- 主语言：TypeScript
- 核心入口：`packages/jest-cli/src/run.ts`
- 关键子包：`@jest/core` / `jest-circus` / `jest-haste-map` / `expect`
- License：MIT
- Star：45k+
