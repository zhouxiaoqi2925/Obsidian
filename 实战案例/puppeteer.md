# Puppeteer - Chrome DevTools 协议客户端

**来源**：GitHub https://github.com/puppeteer/puppeteer
**创建时间**：2026-06-02

---

## 一、核心机制与协议哲学

### 1. CDP 协议与 WebDriver BiDi 双轨（Dual Protocol）

**问题场景**：Chrome 主导 CDP（Chrome DevTools Protocol），但 Firefox / Safari 主导 W3C WebDriver BiDi。Puppeteer 要做"事实标准的浏览器自动化库"，必须同时吃下两套协议——上层 API 不能让用户感知"我用的是 Chrome 还是 Firefox"。

**解决方案**：
```typescript
// packages/puppeteer-core/src/common/ConnectionTransport.ts
interface ConnectionTransport {
  send(message: string): void;                  // 发送 JSON-RPC
  on(event: 'message', listener: (msg: string) => void): void;
}

// 协议层抽象
abstract class Connection {
  abstract send<C extends Command>(method: C['method'], params: C['params']): Promise<Awaited<ReturnType<...>>>;
  abstract on<C extends Event>(event: C['method'], handler: (params: C['params']) => void): void;
}

// CDP 协议实现（走 Chrome）
class CdpCDPConnection extends Connection { ... }
// BiDi 协议实现（走 Firefox）
class BidiConnection extends Connection { ... }
```
**关键参数**：

| 协议 | 目标 | 标准化 | 协议层 |
|------|------|--------|---------|
| CDP | Chrome / Edge / Opera | Google 自有 | JSON-RPC over WebSocket |
| WebDriver BiDi | Firefox / Safari | W3C 标准 | JSON-RPC over WebSocket |
| WebDriver Classic | 通用 | W3C 标准 | HTTP REST |
| `Connection` 抽象 | 上层无感知 | Puppeteer 内部 | 协议层 facade |

**最佳实践**：
1. ✅ 上层 API（Page/Frame）只依赖 `Connection` 抽象
2. ✅ Chrome 走 CDP，Firefox 走 BiDi，Safari 待定
3. ✅ v23+ BiDi 实验支持，v24+ 强化
4. ✅ 协议层不暴露 `any` 给上层
5. ✅ 测试用同一 Page 脚本跑 Chrome + Firefox 验证行为一致

### 2. puppeteer vs puppeteer-core 二分（Library vs Download）

**问题场景**：完整 Puppeteer 默认会下载 ~200MB Chrome for Testing，每次 `npm install` 都触发，CI 极慢。Docker 镜像里 Chrome 已经装好，不应重复下载。**库 + 下载解耦**：`puppeteer-core` 纯库，不下载；`puppeteer` 在 core 基础上下载 Chrome。

**解决方案**：
```typescript
// packages/puppeteer-core/src/api/Puppeteer.ts
import type { PuppeteerNode } from 'puppeteer-core/internal/node';
// puppeteer-core 不带 launch 下载逻辑
const puppeteer: PuppeteerNode = {
  launch: () => import('../node/Launcher.js').then(m => m.launch),
  // ...
};

// packages/puppeteer/src/node/Puppeteer.ts
// puppeteer 包自动下载 Chrome
export async function launch(options?: LaunchOptions): Promise<Browser> {
  const browser = await PuppeteerNode.launch({
    ...options,
    executablePath: await ChromeLauncher.executablePath(),  // 自动下载/查路径
  });
  return browser;
}
```
**关键参数**：

| 包 | 体积 | 行为 | 适用 |
|------|------|------|------|
| `puppeteer` | ~250MB（含 Chrome） | 启动时下载 | 开发、单机 |
| `puppeteer-core` | ~2MB | 纯 API | Docker、自管 Chrome |
| `@puppeteer/browsers` | ~500KB | 下载器 | 自定义版本管理 |
| `puppeteer-stream` | ~3MB | 截视频 | 录像 |

**最佳实践**：
1. ✅ 库包（`puppeteer-core`）永远不下载 Chrome
2. ✅ 下载器（`@puppeteer/browsers`）独立包，可被三方使用
3. ✅ Docker 镜像里装 Chrome 后用 `puppeteer-core` + `executablePath`
4. ✅ CI 里预下载 Chrome 到 `~/.cache/puppeteer/`
5. ✅ 切换 Chromium / Chrome Beta / Unstable：`browserFetcher.download()`

### 3. WebSocket 多路复用（Connection as Bus）

**问题场景**：CDP 协议本质是 JSON-RPC over WebSocket，每个命令一 id，应答按 id 路由。浏览器自动化有上百并发操作（多 Page、多 Frame），需要"消息总线"层做路由。**自研 Connection 层**比直接用 WebSocket 库精确控制超时、错误格式、session 嵌套。

**解决方案**：
```typescript
// packages/puppeteer-core/src/common/Connection.ts
class Connection {
  private _callbacks = new Map<number, Callback>();
  private _sessions = new Map<string, CDPSession>();
  private _lastId = 0;
  
  send(method: string, params: object = {}): Promise<object> {
    const id = ++this._lastId;
    return new Promise((resolve, reject) => {
      this._callbacks.set(id, { resolve, reject, method, params });
      this._rawSend(JSON.stringify({ id, method, params }));
    });
  }
  
  onMessage(message: string): void {
    const msg = JSON.parse(message);
    if (msg.id) {
      // 应答消息：按 id 路由到 callback
      const cb = this._callbacks.get(msg.id);
      if (msg.error) cb.reject(new Error(msg.error.message));
      else cb.resolve(msg.result);
      this._callbacks.delete(msg.id);
    } else if (msg.method) {
      // 事件消息：广播
      this.emit(msg.method, msg.params);
    }
  }
}
```
**关键参数**：

| 概念 | 用途 |
|------|------|
| `id` | 请求 id，应答按 id 路由 |
| `method` | 命令名（`Page.navigate`） |
| `params` | 命令参数 |
| `sessionId` | target session 嵌套 |
| `error` | 错误信息（带 code） |
| `_callbacks` | 待应答 map |

**最佳实践**：
1. ✅ 自研 WebSocket 包装层——JSON-RPC 模式标准化
2. ✅ `_callbacks` Map 配 `_lastId` 计数器
3. ✅ 消息分两类：应答（id 路由）+ 事件（method 广播）
4. ✅ session 嵌套用 `sessionId` 字段做 sub-bus
5. ✅ 长跑必须加心跳（v24+ 修复）

### 4. Driver + Locator 模式（Auto-Wait Pattern）

**问题场景**：`page.click('button#submit')` 可能在按钮没渲染前就调用，结果抛"找不到元素"。开发者要写一堆 `await page.waitForSelector('button#submit')`，繁琐。**Locator API** 把"等待 + 重试"内置：自动等元素出现 + 自动 retry。

**解决方案**：
```typescript
// packages/puppeteer-core/src/api/locators/Locator.ts
class Locator {
  constructor(private _selector: string, private _page: Page) {}
  
  async click(options?: ClickOptions): Promise<void> {
    // 1. 等元素 actionable
    const handle = await this._waitForElement();
    // 2. 滚动到可视
    await handle.scrollIntoView();
    // 3. 触发点击
    return handle.click(options);
  }
  
  private async _waitForElement() {
    // 默认 30s 轮询（100ms 一次）
    const handle = await this._page.waitForSelector(this._selector, {
      timeout: 30000,
      visible: true,
    });
    return handle;
  }
}

// 用法
await page.locator('button#submit').click();     // 自动等
// 等价于
await page.waitForSelector('button#submit', { visible: true });
await page.click('button#submit');
```
**关键参数**：

| Locator API | 行为 | 对比 `$('css')` |
|-------------|------|----------------|
| `page.locator(s).click()` | 自动等 + retry | `page.click(s)` 立刻抛 |
| `page.locator(s).fill(t)` | 自动等 + clear | `page.type(s, t)` 追加 |
| `page.locator(s).textContent()` | 等存在 + 读 | `page.$eval(s, el => el.textContent)` |
| `page.locator(s).wait()` | 等条件 | `page.waitForSelector` |
| `page.locator(s).count()` | 计数 | `page.$$eval` |

**最佳实践**：
1. ✅ 优先 `page.locator(s)` 而不是 `page.click(s)`
2. ✅ Locator 默认 30s timeout（可调）
3. ✅ 支持 `xpath` / `css` / `text` / `aria`
4. ✅ Locator 是 lazy——不立刻执行
5. ✅ `Locator` 可以过滤、串联、组合

### 5. Chrome for Testing 版本管理（BrowserFetcher）

**问题场景**：每次 Chrome 大版本升级（v120 → v121），CDP 协议字段可能变化，Puppeteer 必须发新版跟。"下载哪个版本"靠 `@puppeteer/browsers` 管理，**可重定位、可校验、可清理**。

**解决方案**：
```typescript
// packages/browsers/src/browsers/Chrome.ts
import { Browser, createProfile } from '@puppeteer/browsers';
import fs from 'node:fs/promises';

const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
const chrome = await Browser.create({
  browser: 'chrome',
  channel: 'stable',
  cacheDir,
  buildId: '120.0.6099.71',
});

if (!chrome.executablePath) {
  // 下载
  const url = Browser.getDownloadURL('chrome', 'stable', '120.0.6099.71');
  await fetchAndUnzip(url, cacheDir);
}

// 启动
const browser = await puppeteer.launch({
  executablePath: chrome.executablePath,
  // ...
});
```
**关键参数**：

| 字段 | 用途 | 例子 |
|------|------|------|
| `browser` | 浏览器类型 | `chrome` / `chrome-headless-shell` / `firefox` |
| `channel` | 渠道 | `stable` / `beta` / `canary` |
| `buildId` | 具体版本 | `120.0.6099.71` |
| `cacheDir` | 缓存目录 | `~/.cache/puppeteer` |
| `executablePath` | 启动路径 | `/path/to/chrome` |
| `downloadProgressCallback` | 下载进度 | `(bytes, total) => void` |

**最佳实践**：
1. ✅ `cacheDir` 用 `~/.cache/puppeteer` 默认值
2. ✅ `buildId` 跟 Puppeteer 版本强绑定
3. ✅ 升级前用 `Browser.update()` 检查
4. ✅ Docker 镜像预装 Chrome for Testing 路径
5. ✅ 自定义下载用 `Browser.getDownloadURL()`

---

## 二、API 分层与协议映射

### 6. api/ 层：公开 API（Public Surface）

**问题场景**：Puppeteer 维护者承诺稳定的只有 `api/` 层。`common/` / `internal/` / `cdp/` 都是实现细节，版本升级可能 break。**api/common/internal 三层分离**让协议重写不影响用户。

**解决方案**：
```typescript
// packages/puppeteer-core/src/api/Api.ts
const api = {
  Puppeteer,            // 启动器
  Browser,              // 浏览器实例
  Page,                 // 页面
  Frame,                // frame
  ElementHandle,        // 元素
  Locator,              // 定位器
  CDPSession,           // 低阶协议
  ConsoleMessage,
  Dialog,
  // ...
};

// 用户用法
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({...});
```
**关键参数**：

| 层 | 稳定性 | 重写频率 | 用途 |
|----|--------|----------|------|
| `api/` | 高 | 慢 | 公开 API |
| `common/` | 中 | 中 | 跨环境实现 |
| `internal/` | 低 | 高 | CDP 协议包 |
| `cdp/` | 低 | 高 | CDP 类型 |
| `node/` | 中 | 中 | Node 特性 |

**最佳实践**：
1. ✅ 用户只导入 `puppeteer` / `puppeteer-core`
2. ✅ 内部模块走 `puppeteer-core/internal/node`（隐式 import）
3. ✅ `internal/*` 改动写 changelog
4. ✅ `api/` 类的方法签名稳定
5. ✅ `common/` 跨 Node/Deno/Bun 共用

### 7. common/ 层：跨环境抽象（Cross-Runtime）

**问题场景**：Puppeteer 不仅 Node 跑，理论上 Deno / Bun / Cloudflare Workers 都能用。**common/ 层**封装跨环境差异：文件系统、网络、子进程、WebSocket。**Node 特性放 node/ 层**。

**解决方案**：
```typescript
// packages/puppeteer-core/src/common/Puppeteer.ts
abstract class CommonPuppeteer {
  // 跨环境实现
  abstract launch(options: LaunchOptions): Promise<Browser>;
  abstract connect(options: ConnectOptions): Promise<Browser>;
}

// packages/puppeteer-core/src/node/PuppeteerNode.ts
import { CommonPuppeteer } from '../common/Puppeteer.js';

class PuppeteerNode extends CommonPuppeteer {
  async launch(options) {
    // 1. spawn Chrome 子进程（Node 特性）
    const proc = spawn(executablePath, args);
    // 2. 解析 /json/version 找 WebSocket URL
    const wsUrl = await getWebSocketURL(proc);
    // 3. 创建 Browser
    return await super.launch({...options, browserWSEndpoint: wsUrl});
  }
}
```
**关键参数**：

| 环境 | 入口 | 子进程 | WebSocket |
|------|------|--------|-----------|
| Node.js | `PuppeteerNode` | `child_process.spawn` | `ws` |
| Deno | `PuppeteerDeno` | `Deno.command` | `WebSocket` |
| Bun | `PuppeteerBun` | `Bun.spawn` | `WebSocket` |
| Cloudflare | 实验 | - | 远程 |

**最佳实践**：
1. ✅ 跨环境逻辑放 `common/`
2. ✅ 平台特性放 `node/deno/bun/`
3. ✅ 抽象基类用 `abstract class`
4. ✅ 测试覆盖 Node + Deno + Bun
5. ✅ `connect()` 在所有环境都支持（无 spawn）

### 8. CDP 协议类型自动生成（Schema Generation）

**问题场景**：CDP 协议 2000+ 方法，每个方法有 N 个参数，TS 类型手写不现实。`tools/` 拉 `chrome://version` 自带的 CDP JSON，TS 类型自动同步协议字段。

**解决方案**：
```typescript
// tools/generate_cdp_protocol.ts
import { Protocol } from 'devtools-protocol';

const protocol = await fetch('https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/inspector/browser_protocol.json?format=TEXT').then(r => r.text());
const decoded = JSON.parse(Buffer.from(protocol, 'base64').toString());

// 生成 TS 类型
for (const [domain, methods] of Object.entries(decoded.domains)) {
  fs.writeFileSync(`packages/puppeteer-core/src/cdp/${domain}.ts`, generateDomainTypes(methods));
}
```
**关键参数**：

| 概念 | 来源 | 用途 |
|------|------|------|
| `browser_protocol.json` | Chromium 源码 | CDP 域定义 |
| `js_protocol.json` | V8 源码 | Runtime / Debugger |
| `devtools-protocol` npm | 类型化协议 | 上层用 |
| `tools/` | Puppeteer 仓库 | 类型生成 |

**最佳实践**：
1. ✅ 类型自动生成——手动维护过期
2. ✅ 用 `devtools-protocol` 包作为基线
3. ✅ `tools/` 是 devDep 工具，发布时不带
4. ✅ 每次 Chrome 升级重新生成
5. ✅ 内部 override 用 `internal/` 而非改 `cdp/`

### 9. LazyArg 惰性求值（Serialization Avoidance）

**问题场景**：`page.evaluate(fn, ...args)` 中 `fn` 序列化成字符串再传到浏览器执行。`args` 是 `Object` / `BigInt` 等，序列化代价大。**LazyArg** 让参数"按需转换"——只 evaluate 一次，后续引用复用。

**解决方案**：
```typescript
// packages/puppeteer-core/src/common/LazyArg.ts
class LazyArg<T> {
  constructor(private _value: T, private _serialize: (v: T) => unknown) {}
  
  // 显式触发序列化（传 evaluate 时）
  toJSON() { return this._serialize(this._value); }
}

// 用法
const bigHandle = await page.$('div');
await page.evaluate((handle) => {
  handle.textContent;
}, new LazyArg(bigHandle, (h) => h._guid));  // 只传 guid，不传整个对象
```
**关键参数**：

| 概念 | 用途 |
|------|------|
| `LazyArg<T>` | 包装 T，延迟序列化 |
| `toJSON()` | 序列化时自动调 |
| `_serialize` | 自定义转换函数 |
| `page.evaluate` | 接受 LazyArg |

**最佳实践**：
1. ✅ 序列化代价大的对象用 `LazyArg`
2. ✅ `BigInt` / `Date` / `Object Handle` 都用 LazyArg
3. ✅ 不要传整个 Object Handle 到 evaluate
4. ✅ 内部用 `convertArg` 函数递归处理
5. ✅ `Symbol` 等不可序列化类型用 `Symbol.for()` 映射

### 10. Tracing 与 Coverage（Instrumentation）

**问题场景**：性能调试需要 trace.json 看到哪段代码慢；测试覆盖率需要知道"哪些代码没被测试到"。Puppeteer 直接调 Chrome `Tracing.start` + `Coverage.startJSCoverage` —— **零依赖把 Chrome DevTools 能力暴露给 Node**。

**解决方案**：
```typescript
// Tracing
const client = await page.context().newCDPSession(page);
await client.send('Tracing.start', {
  categories: 'devtools.timeline,v8.execute',
  options: { samplingFrequency: 10000 },
});
await page.goto('https://example.com');
await client.send('Tracing.end');
const trace = await client.send('Tracing.tracingComplete');
await fs.writeFile('trace.json', trace.stream);

// Coverage
await page.coverage.startJSCoverage();
await page.goto('https://example.com');
const coverage = await page.coverage.stopJSCoverage();
// coverage = [{ url, ranges: [{ start, end }] }]
```
**关键参数**：

| 字段 | 用途 | 默认 |
|------|------|------|
| `categories` | trace 类别 | `devtools.timeline` |
| `samplingFrequency` | 采样频率 | 10000 Hz |
| `path` | 输出路径 | `trace.json` |
| `Coverage.startJSCoverage` | JS 覆盖 | 包含未用代码 |
| `Coverage.startCSSCoverage` | CSS 覆盖 | 包含未用样式 |

**最佳实践**：
1. ✅ 性能调优用 `Tracing.start`
2. ✅ `chrome://tracing` 打开 trace.json
3. ✅ 测"用户真正用到的代码"用 `startJSCoverage`
4. ✅ 配合 `nyc` / `c8` 用作辅助覆盖
5. ✅ 不要在生产环境跑——会注入 5-10% 开销

---

## 三、性能优化与执行模型

### 11. 鼠标键盘事件模拟（Input Dispatch）

**问题场景**：自动化测试要"像用户一样"操作浏览器——点击、键盘输入。模拟 JS `element.click()` 不会触发所有事件监听器（mousedown / focus / click），不真实。**Puppeteer 调 CDP `Input.dispatchMouseEvent`**，触发完整事件流。

**解决方案**：
```typescript
// packages/puppeteer-core/src/common/Input.ts
async click(x: number, y: number, options: ClickOptions = {}) {
  // 1. mousePressed
  await this._client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y,
    button: options.button ?? 'left',
    clickCount: options.clickCount ?? 1,
  });
  // 2. mouseReleased
  await this._client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y,
    button: options.button ?? 'left',
    clickCount: options.clickCount ?? 1,
  });
}

async type(text: string) {
  for (const char of text) {
    await this._client.send('Input.dispatchKeyEvent', {
      type: 'char', text: char, unmodifiedText: char,
    });
  }
}
```
**关键参数**：

| 事件 | CDP 命令 | 字段 |
|------|----------|------|
| 鼠标按下 | `Input.dispatchMouseEvent` | `type=mousePressed` |
| 鼠标松开 | `Input.dispatchMouseEvent` | `type=mouseReleased` |
| 移动 | `Input.dispatchMouseEvent` | `type=mouseMoved` |
| 滚轮 | `Input.dispatchMouseEvent` | `type=mouseWheel` |
| 键盘按下 | `Input.dispatchKeyEvent` | `type=keyDown` |
| 键盘松开 | `Input.dispatchKeyEvent` | `type=keyUp` |
| 字符输入 | `Input.dispatchKeyEvent` | `type=char` |

**最佳实践**：
1. ✅ 用真实鼠标事件而不是 JS `element.click()`
2. ✅ `clickCount: 2` 触发双击
3. ✅ 键盘输入用 `type` 而不是 `keyDown`/`keyUp`
4. ✅ 滚动用 `mouseWheel`
5. ✅ `delay: 0` 关闭按键间隔

### 12. 远程执行（browserWSEndpoint）

**问题场景**：Chrome 在容器里跑（K8s / Docker），Node 脚本在另一台机器。**`browserWSEndpoint` 模式**：用 `--remote-debugging-port` 暴露 WS，Node 端 `puppeteer.connect()` 远程连。

**解决方案**：
```typescript
// 服务端：暴露 Chrome WS 端点
// Chrome 启动
google-chrome --headless --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0

// 客户端：连接
const browser = await puppeteer.connect({
  browserWSEndpoint: 'ws://chrome-service:9222/devtools/browser/abc123',
  defaultViewport: null,
});

const page = await browser.newPage();
await page.goto('https://example.com');
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `browserWSEndpoint` | WS URL |
| `browserURL` | HTTP URL（自动取 WS） |
| `defaultViewport` | 视口大小 |
| `protocolTimeout` | 协议超时 |
| `transport` | 自定义 ConnectionTransport |
| `headers` | 自定义 header |

**最佳实践**：
1. ✅ 远程 Chrome 配 `--remote-debugging-address=0.0.0.0`
2. ✅ 容器间用 `browserWSEndpoint` 替代 `launch()`
3. ✅ 配 `--remote-allow-origins=*`（Chrome 111+ 强制）
4. ✅ `puppeteer.connect()` 比 `launch()` 更快
5. ✅ 多客户端共享同一 Chrome 用 `connect()`

### 13. 启动链路优化（Launch Pipeline）

**问题场景**：`puppeteer.launch()` 走 7 步（spawn → 找 WS URL → 握手 → 创建 target → 注入 user data dir），首次启动 1-2s。**缓存路径 + 复用 user data** 优化到 < 500ms。

**解决方案**：
```typescript
// ChromeLauncher.start() 启动链
async start(options: LaunchOptions) {
  // 1. 找 / 解析 Chrome 路径
  const executablePath = options.executablePath || await ChromeLauncher.executablePath();
  // 2. 准备 user-data-dir
  const userDataDir = options.userDataDir || await fs.mkdtemp(...);
  // 3. spawn 子进程
  this._proc = spawn(executablePath, [
    `--headless=${options.headless}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    ...options.args,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  // 4. 轮询 /json/version 找 WS URL
  const browserWSEndpoint = await this.waitForChromeToStart();
  // 5. 创建 Connection
  this._connection = new Connection(browserWSEndpoint, this, ...);
  // 6. attach 进程关闭回调
  this._proc.once('exit', this._onProcessExit);
  return browserWSEndpoint;
}
```
**关键参数**：

| 字段 | 用途 | 默认 |
|------|------|------|
| `headless` | headless 模式 | `'new'` (v22+) |
| `args` | 启动参数 | `[]` |
| `userDataDir` | 用户数据 | temp dir |
| `executablePath` | Chrome 路径 | 查 BrowserFetcher |
| `dumpio` | 转发 stdout/stderr | `false` |
| `handleSIGINT` | SIGINT 退出 | `true` |
| `handleSIGTERM` | SIGTERM 退出 | `true` |
| `handleSIGHUP` | SIGHUP 退出 | `true` |
| `port` | 远程调试端口 | `0`（随机） |

**最佳实践**：
1. ✅ 复用 `userDataDir` —— 启动 30%+ 加速
2. ✅ `headless: 'new'` 用新版 headless
3. ✅ `pipe` 模式用 `--enable-logging --v=1` 看日志
4. ✅ `handleSIGINT/TERM/HUP` 默认 true
5. ✅ Chrome `--disable-gpu` 在容器里必须

### 14. Page 上下文与 Frame（Page Context Model）

**问题场景**：iframe 是常见结构，主 Page 有 `frame.mainFrame()` + 多个子 Frame。**Frame 是 Page 的子树**——`page.frames()` 列出所有 frame，主 frame + iframes。

**解决方案**：
```typescript
// packages/puppeteer-core/src/api/Frame.ts
class Frame {
  parentFrame(): Frame | null;            // 父 frame
  childFrames(): Frame[];                  // 子 frames
  isOOPFrame(): boolean;                   // out-of-process frame
  isDetached(): boolean;
  
  // 操作子 frame
  $(selector): Promise<ElementHandle | null>;
  $$(selector): Promise<ElementHandle[]>;
  $(selector).then(h => h?.click());
}

// 用法
const mainFrame = page.mainFrame();
const allFrames = page.frames();
for (const frame of allFrames) {
  console.log(frame.url());
}
```
**关键参数**：

| 概念 | 用途 |
|------|------|
| `mainFrame` | 顶级 frame |
| `childFrames` | 子 frame（iframe） |
| `isOOPFrame` | out-of-process frame（跨域） |
| `isDetached` | 已分离（unload 触发） |
| `parentFrame` | 父 frame |
| `executionContext` | JS 上下文 |

**最佳实践**：
1. ✅ `page.mainFrame()` 拿主 frame
2. ✅ iframe 操作前 `frame.waitForSelector()`
3. ✅ 跨域 frame 是 OOP frame
4. ✅ `page.frames()` 实时快照——可能过期
5. ✅ frame 监听 `frame.on('framenavigated', ...)`

### 15. ElementHandle 与 DOM 序列化（DOM Bridge）

**问题场景**：`page.$('button')` 返回 `ElementHandle` —— Node 端的代理，**对应浏览器内真实 DOM 元素**。所有操作（click / textContent / getAttribute）都通过 CDP 协议走远程调用。

**解决方案**：
```typescript
// packages/puppeteer-core/src/api/ElementHandle.ts
class ElementHandle {
  private _remoteObject: JSHandle;
  
  async click(options?: ClickOptions): Promise<void> {
    // 1. 等 actionable
    await this.scrollIntoView();
    // 2. 计算中心点
    const box = await this.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // 3. 触发 click
    await this._page.mouse.click(x, y, options);
  }
  
  async textContent(): Promise<string | null> {
    return await this.evaluate(el => el.textContent);
  }
  
  async getAttribute(name: string): Promise<string | null> {
    return await this.evaluate((el, name) => el.getAttribute(name), name);
  }
}
```
**关键参数**：

| API | 行为 |
|-----|------|
| `el.click()` | 触发鼠标事件 |
| `el.fill(text)` | clear + type |
| `el.textContent()` | 读文本 |
| `el.getAttribute(n)` | 读属性 |
| `el.boundingBox()` | 矩形坐标 |
| `el.screenshot()` | 单元素截图 |
| `el.dispose()` | 释放（防泄漏） |

**最佳实践**：
1. ✅ `el.dispose()` 主动释放，避免堆泄漏
2. ✅ 优先用 `Locator` 而不是 `ElementHandle`
3. ✅ `el.evaluate(fn, ...)` 自定义 JS
4. ✅ `boundingBox()` null = 元素不可见
5. ✅ `el.uploadFile(path)` 触发文件选择

---

## 四、工程实践与生态

### 16. WebMCP 实验（v24+）

**问题场景**：AI Agent 想"驱动浏览器"——读懂页面、操作元素、提取数据。传统做法是给 LLM 喂截图 + 自定义工具调用。**WebMCP** 是 Chrome 内置 MCP server，直接暴露浏览器能力给 LLM（`browser_click` / `browser_extract`）。

**解决方案**：
```typescript
// v24+ WebMCP 实验
import { WebMCP } from 'puppeteer';

const browser = await puppeteer.launch({ headless: false });
const mcp = new WebMCP(browser);

await mcp.start();
// Claude 现在能直接调 browser_click, browser_type, browser_extract_text
```
**关键参数**：

| 概念 | 用途 | 状态 |
|------|------|------|
| WebMCP | 浏览器内置 MCP server | v24 实验 |
| browser_click | 调 MCP click 工具 | 实验 |
| browser_extract | 调 MCP 提取工具 | 实验 |
| Chrome DevTools MCP | Google 官方 | 2025+ |

**最佳实践**：
1. ✅ 关注 v24+ WebMCP 进展
2. ✅ AI 驱动浏览器还早，先用 Puppeteer API
3. ✅ 配合 Claude / GPT-4V 截图理解
4. ✅ 不在生产用——API 还在变
5. ✅ 实验项目用 `headless: false` 看效果

### 17. 测试与 CI 矩阵（Test Matrix）

**问题场景**：Puppeteer 跑在 Linux / macOS / Windows × Chrome Stable / Beta / Dev 矩阵上。**集成测试**开 Chrome 子进程，跑 Page 脚本，验证结果。

**解决方案**：
```typescript
// tests/integration/cdp/page.spec.ts
describe('Page', () => {
  it('should navigate', async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const response = await page.goto('https://example.com');
    expect(response.status()).toBe(200);
    expect(await page.title()).toBe('Example Domain');
    await browser.close();
  });
});

// CI 配置
// .github/workflows/ci.yml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    chrome: [stable, beta]
```
**关键参数**：

| 测试类型 | 工具 | 跑什么 |
|----------|------|--------|
| 单元 | mocha + c8 | 纯函数 |
| 集成 | mocha | 完整 Chrome |
| 差分 | Playwright 对比 | 跨实现 |
| 类型 | tsc --strict | TypeScript |
| Lint | ESLint + Prettier | 代码风格 |

**最佳实践**：
1. ✅ 集成测试用 `mocha` + Chrome 子进程
2. ✅ CI 矩阵 OS × Chrome 版本
3. ✅ 差分测试跟 Playwright 对比——抓协议实现 bug
4. ✅ `tsc --strict` 把协议层 `any` 控制住
5. ✅ 集成测试在 Windows 容易挂——加 `retry`

### 18. 优雅停服（Graceful Shutdown）

**问题场景**：Node 进程 SIGTERM 时 Chrome 还在跑——僵尸进程。**`browser.close()`** 等 in-flight 完成 + SIGINT/TERM/HUP 钩子。

**解决方案**：
```typescript
// packages/puppeteer-core/src/node/Launcher.ts
async close(): Promise<void> {
  // 1. 关闭所有 target
  for (const target of this.targets()) {
    await target.close();
  }
  // 2. 关闭 Connection
  await this._connection.dispose();
  // 3. 杀 Chrome 进程
  if (this._proc) {
    this._proc.kill('SIGTERM');
    // 4. 等 Chrome 退出
    await new Promise<void>((resolve) => {
      this._proc!.once('exit', () => resolve());
      setTimeout(() => this._proc!.kill('SIGKILL'), 5000);  // 5s 兜底
    });
  }
}
```
**关键参数**：

| 信号 | 行为 |
|------|------|
| SIGINT (Ctrl+C) | 关闭 Chrome |
| SIGTERM (kill) | 关闭 Chrome |
| SIGHUP | 关闭 Chrome |
| `handleSIGINT` | 默认 `true` |
| `handleSIGTERM` | 默认 `true` |
| `handleSIGHUP` | 默认 `true` |
| `killTimeout` | SIGKILL 兜底，5s |

**最佳实践**：
1. ✅ `browser.close()` 显式关闭
2. ✅ 默认 `handleSIGINT/TERM/HUP` 为 `true`
3. ✅ 配 `killTimeout` 兜底 SIGKILL
4. ✅ CI 跑完测试必 close 浏览器
5. ✅ 长跑脚本加 `process.on('SIGTERM', () => browser.close())`

### 19. Tracing 与 Performance 调优（Trace Pipeline）

**问题场景**：自动化的页面加载慢——是网络、是 JS、是渲染？**Puppeteer Tracing API** 调 Chrome Tracing 引擎，输出 trace.json 在 `chrome://tracing` 看。

**解决方案**：
```typescript
// Page.tracing.start() 内部实现
async start(options?: TracingOptions): Promise<void> {
  const client = await this.context().newCDPSession(this);
  await client.send('Tracing.start', {
    categories: options?.categories || 'devtools.timeline',
    options: { samplingFrequency: 10000 },
  });
  this._tracingClient = client;
}

async stop(): Promise<Buffer> {
  const path = this._tracingPath;
  return new Promise((resolve) => {
    this._tracingClient.on('Tracing.dataCollected', (data) => {
      // 累积 trace events
      this._tracingEvents.push(...data.value);
    });
    this._tracingClient.send('Tracing.end').then(async () => {
      const buffer = Buffer.from(JSON.stringify(this._tracingEvents));
      if (path) await fs.writeFile(path, buffer);
      resolve(buffer);
    });
  });
}
```
**关键参数**：

| 字段 | 用途 | 默认 |
|------|------|------|
| `path` | 输出路径 | `undefined` |
| `categories` | trace 类别 | `devtools.timeline` |
| `samplingFrequency` | 采样频率 | 10000 Hz |
| `screenshots` | 截图 | `false` |

**最佳实践**：
1. ✅ `page.tracing.start({ path: 't.json' })` 一键开
2. ✅ `chrome://tracing` 打开看
3. ✅ `categories` 加 `v8.execute` 看 JS
4. ✅ 加 `disabled-by-default-devtools.timeline` 看详情
5. ✅ 配合 `Page.coverage` 看未用代码

### 20. 错误处理与重连（Resilience）

**问题场景**：Chrome 崩溃 / WS 断开 / 协议超时 —— 用户要清晰错误 + 优雅重试。**Connection 层**统一处理：`send()` 加 timeout、`on('error')` 监听 WS 异常、`target` 关闭自动重连。

**解决方案**：
```typescript
// Connection.send() 加 timeout
send(method: string, params: object = {}, options: SendOptions = {}): Promise<unknown> {
  const timeout = options.timeout ?? 180_000;        // 3 分钟
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      this._callbacks.delete(id);
      reject(new TimeoutError(`Protocol timeout (${timeout}ms): ${method}`, ...));
    }, timeout);
    
    this._callbacks.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject:  (e) => { clearTimeout(timer); reject(e); },
      method, params,
    });
    this._rawSend(JSON.stringify({ id, method, params }));
  });
}

// WS 异常处理
onWSError(error: Error) {
  this.emit(ConnectionFromErrorEvent, error);
  // 1. 拒所有 pending callback
  for (const [id, cb] of this._callbacks) {
    cb.reject(new Error('Connection closed'));
  }
  this._callbacks.clear();
}
```
**关键参数**：

| 错误类型 | 触发 | 行为 |
|----------|------|------|
| `TimeoutError` | 协议超时 | reject 单一 callback |
| `ConnectionClosedError` | WS 断开 | reject 所有 pending |
| `ProtocolError` | CDP 返回 error | reject 单一 callback |
| `TargetClosedError` | target 关闭 | reject 关联 callback |
| `BrowserError` | Chrome 崩溃 | 触发 `'disconnected'` |

**最佳实践**：
1. ✅ `send()` 默认 180s timeout
2. ✅ WS 异常 reject 所有 pending callbacks
3. ✅ Chrome 崩溃发 `'disconnected'` 事件
4. ✅ 用户用 `try/catch` 捕获
5. ✅ 长跑脚本监听 `browser.on('disconnected')` 重连

---

**标签**：#puppeteer #TypeScript #浏览器自动化 #CDP #WebSocket
**状态**：20/20 份详细内容
