# cypress - 浏览器内 E2E

**来源**：G:\实战案例\GitHub顶尖项目\cypress\
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. 同进程测试执行（In-Process Test Execution）

**问题场景**：Selenium / WebDriver 走"远程控制"模式：测试代码在 Node 进程，通过 JSON Wire Protocol / W3C WebDriver 协议跨进程操控浏览器。每次 `click()` 都要序列化 1KB+ 的协议数据往返两端，加上浏览器启动时间，调试时单步跟踪往往要等 200ms+。Cypress 反其道而行 —— 让测试代码（driver）跟被测应用（AUT）跑在同一个浏览器进程，通过本地 HTTP 代理 + 脚本注入实现"同生共死"。

**解决方案**：
```typescript
// driver/src/cypress.ts:90 — 核心标识
const isCypressInCypress = document.defaultView !== top
// 这是 Cypress 自举测试 E2E 的关键判断（一行代码精准识别）

// packages/proxy/lib/network-proxy.ts — 代理接管
// 浏览器访问任何域名时都被 localhost 代理劫持
// → HTTPS MITM 重新签名
// → 在 HTML 注入 <script src="__cypress/cypress_runner.js">
// → 注入 <script> 重写 document.domain
// 让跨域 iframe 可访问（同源策略放松）
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 进程数 | 1（测试代码 + AUT 共用） | 零协议往返 |
| 注入点 | `<head>` 内最前面 | 早于用户脚本 |
| 跨域 hack | document.domain 注入 | 浏览器原生 API |
| HTTPS | 自签 CA + MITM | 用户需信任 |
| 启动开销 | 800ms-2s | 一次性 |

**最佳实践**：
1. ✅ 接受启动慢：800ms-2s 启动换来 200ms→10ms 的运行时加速
2. ✅ 信任自签 CA：开发环境在系统信任 + 浏览器配置 `--ignore-certificate-errors`
3. ✅ 同源策略要主动放松：document.domain 必须双方都设
4. ✅ 自举测试要识别自己：`document.defaultView !== top` 一行判断
5. ✅ 失败时 dump AUT 状态：测试代码崩了能直接拿 DOM 调试

### 2. 命令队列 + 自动重试（Command Queue + Auto-Retry）

**问题场景**：传统 E2E 一半代码是 `waitForElement`、`waitForVisible`、`waitForText`。Selenium 时代一个登录测试要写 30+ 个显式等待，还经常 timeout。Cypress 革命性地用"自动重试 + 稳定性等待"取代显式 await —— `cy.get('button').click()` 内部循环重试直到按钮可点 / 稳定 / 超时。

**解决方案**：
```typescript
// driver/src/cy/retries.ts:100-145 — 重试算法核心
const runnableHasChanged = () => options._runnable !== state('runnable')
const ended = () => state('canceled') || runnableHasChanged()
// 承认 bluebird cancellation 有 bug（issue #1424），加双层 ended() 兜底

return Promise
  .delay(interval)
  .then(() => {
    if (ended()) return
    Cypress.action('cy:command:retry', options)
    // 页面不稳定，重新计时
    if (state('isStable') === false) options._start = undefined
    // 等到稳定再 invoke
    return whenStable(fn)
  })

// 三个条件同时满足才重试：
// 1. 当前 runnable 没变（防跨测试串扰）
// 2. 页面稳定（whenStable 等 cy:stability:changed）
// 3. 总耗时 < runnableTimeout
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 重试间隔 | 50ms 默认 | 改 `cypress.json` retryInterval |
| 总超时 | 4s 默认 | runnableTimeout |
| 页面稳定 | cy:stability:changed | 事件驱动 |
| 取消兜底 | 双层 ended() | 防 bluebird bug |
| 失败后策略 | 3 种可配 | flake-pass / flake-fail / 默认 |

**最佳实践**：
1. ✅ 不要混用显式 wait 和自动重试：会引入不可预期时延
2. ✅ 稳定性事件是金标准：不要 `cy.wait(1000)` 替代 `whenStable`
3. ✅ 重试上限要设：默认 4s，业务慢的 API 调到 30s
4. ✅ 失败后用 `cy.clock()` mock 时间：避免 CI 慢环境重试爆炸
5. ✅ 重试通过率入 dashboard：50% 一下是 flaky 候选
6. ✅ 测试用例不传超时：靠全局配置，应用层统一

### 3. 稳定性事件总线（Stability Event Bus）

**问题场景**：React/Vue 测试中，`cy.get('button').click()` 后立即 `cy.get('.result').should('have.text', 'X')` 可能因为渲染未完成读不到 DOM。传统做法 `setTimeout` 不可靠。Cypress 用"稳定性事件"——`cy:stability:changed(true/false)` 由应用层控制（`cy.type` 后稳定，`cy.contains` 等待响应），所有 retry 在稳定后批量 release。

**解决方案**：
```typescript
// driver/src/cy/stability.ts
const whenStableQueue: Array<{ fn, resolve, reject }> = []
isStable: (stable, event) => {
  if (state('isStable') === stable) return  // 幂等
  state('isStable', stable)
  Cypress.action('cy:stability:changed', stable, event)
  if (!stable) return
  Cypress.action('cy:before:stability:release').then(async () => {
    // 一次性 release 所有等待者
    const waitersToRelease = whenStableQueue.splice(0)
    await Promise.all(waitersToRelease.map((waiter) =>
      Promise.try(waiter.fn).then(waiter.resolve).catch(waiter.reject)
    ))
  })
}

// driver/src/cy/retries.ts:300
// invoke the passed in retry fn once we reach stability
return whenStable(fn)
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 事件名 | cy:stability:changed | 跨 driver 内部 |
| 队列类型 | FIFO | 公平调度 |
| 幂等保护 | 重复事件不重处理 | 防风暴 |
| 释放时机 | 稳定性 + cy:before:stability:release 钩子 | 双层 |
| reset() 行为 | reject 所有 waiter | 防泄漏到下一个测试 |

**最佳实践**：
1. ✅ 业务命令主动发稳定性事件：`.type()` 完立即发，不要等 React 渲染
2. ✅ 第三方库（XHR、WebSocket）要 hook 进事件总线
3. ✅ reset() 一定要 reject waiter：跨测试不串扰
4. ✅ 稳定性是幂等的：重复 trigger 不重复 release
5. ✅ 用 `cy:stability:changed` 配合 spy 工具调试
6. ✅ 队列是 FIFO：测试代码要预期"先注册先执行"

### 4. Mocha 原型方法重写（Mocha Prototype Patching）

**问题场景**：Cypress 不能直接用 Mocha —— 想要 retry 集成、状态广播、跨域事件、自动 dump trace。直接在 Mocha 上加功能，要么 fork（维护负担重），要么提交 PR（节奏不可控）。Cypress 的解法：保存 14 个 Mocha 原型方法为 const，再重写以注入 Cypress 行为。**这是"分叉 + 维护负担"的典型反模式，但 Cypress 体量大到不能等上游合并**。

**解决方案**：
```typescript
// driver/src/cypress/mocha.ts:18-33 — Mocha 原型方法保存
const mochaRunTests = Mocha.Runnable.prototype.run
const mochaRunHooks = Mocha.Runnable.prototype.runHooks
// ... 14 个原型方法保存为 const

// 重写注入 Cypress 行为
Mocha.Runnable.prototype.run = function() {
  // 1) 注册 runnable 到 Cypress 状态
  state('runnable', this)
  // 2) 包装 fn：自动 retry + 稳定性等待
  const wrappedFn = wrapRunnableFn(this.fn, this)
  // 3) 调用原方法
  return mochaRunTests.call(this).then(() => {
    // 4) Cypress 后置钩子
    Cypress.action('cy:test:end', this)
  })
}

// driver/patches/mocha+7.2.0.dev.patch — patch 文件
// 当 Mocha 升级时打补丁，避免 fork 整个仓库
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 重写方法数 | 14 | Mocha 主要原型 |
| Patch 方式 | .patch 文件 + postinstall | 自动化 |
| 升级 Mocha | patch 重打 | 不破坏 API |
| 保存原方法 | 闭包持有 | 防被覆盖 |
| 代价 | 升级主版本极易破 | 团队门槛 |

**最佳实践**：
1. ✅ 接受 fork 成本：Cypress 体量决定不能等上游
2. ✅ patch 文件用 npm postinstall：每次 install 自动打
3. ✅ 保存原方法为 const：避免覆盖
4. ✅ 注入顺序要固定：状态注册 → fn 包装 → 原方法调用 → 后置钩子
5. ✅ 文档化 patch 内容：`patches/CHANGELOG.md` 写明理由
6. ✅ 测试 patch 应用是否成功：CI 第一步 check 编译

### 5. 内存主动回收（Aggressive GC）

**问题场景**：Cypress 在浏览器里长期跑（CI 一跑 200+ 测试，AUT 重启要 800ms），普通 Mocha 不主动释放 `this.*` 引用。`test.fn` 闭包会持有整个测试作用域，导致内存累积到 GB 级。Cypress 测试结束时不只是"清理引用"，还**主动 nullify 任何对象 + 替换 fn 让 GC 立刻回收**。

**解决方案**：
```typescript
// driver/src/cypress/runner.ts:135-150 — 测试结束时的内存回收
// perf loop only through a tests OWN properties
// and not inherited properties from its shared ctx
for (let key of Object.keys(test.ctx || {})) {
  const value = test.ctx[key]
  if (_.isObject(value) && !mochaCtxKeysRe.test(key)) {
    // nuke any object properties that come from
    // cy.as() aliases or anything set from 'this'
    // so we aggressively perform GC and prevent obj
    // ref's from building up
    test.ctx[key] = undefined
  }
}

// reset the fn to be empty function
// for GC to be aggressive and prevent
// closures from hold references
test.fn = () => {}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 回收时机 | 每个测试结束 | before/after hook 之前 |
| 范围 | test.ctx 自身属性 | 不动共享 ctx |
| 过滤 | 正则 mochaCtxKeysRe | 保留 Mocha 内部 |
| 闭包 | 替换 fn 为空函数 | 释放 closure |
| 性能开销 | < 1ms | 几乎无感 |

**最佳实践**：
1. ✅ 不依赖引用计数：浏览器 GC 不一定及时
2. ✅ 主动 nullify：JS 引擎不会清理"你还能访问到"的对象
3. ✅ 闭包替换：空函数释放整个作用域
4. ✅ 区分 ctx 自身 vs 共享：避免误清框架数据
5. ✅ 在 beforeEach/afterEach 不做内存回收：太频繁反而卡
6. ✅ 监控堆大小：CI 加 `--expose-gc` + 主动 `global.gc()`

## 二、架构设计

### 6. HTTP 代理 + 文档改写（HTTP Proxy + Document Rewriting）

**问题场景**：Cypress 要测任意 origin 的应用（不只是同源），还要读 fetch 的请求体、改写响应 mock 跨域请求。如果只在浏览器里跑，跨域拦截就要靠 Service Worker（兼容性差）或浏览器扩展（部署难）。Cypress 的解法：本地启动一个 Node 端 HTTP 代理，浏览器实际访问的是代理，代理做 HTTPS MITM + HTML 注入 + 跨域 document.domain 改写。

**解决方案**：
```typescript
// packages/proxy/lib/network-proxy.ts
class NetworkProxy {
  // 监听代理端口
  listen(port: number) {
    this.server = http.createServer((req, res) => {
      // 1) HTTPS MITM：自签 CA 重新签名
      if (this.isHttps(req)) return this.handleHttps(req, res)
      // 2) HTML 注入：找到 </head> 前插入 cypress_runner.js
      if (this.isHtmlResponse(req)) return this.injectScript(req, res)
      // 3) 普通转发
      this.proxy.web(req, res)
    })
  }

  injectScript(req, res) {
    // 用 streams 处理大文件，避免内存爆炸
    const transform = new InjectScriptTransform('__cypress/cypress_runner.js')
    req.pipe(transform).pipe(res)
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 代理端口 | localhost:0 (随机) | 避免冲突 |
| HTTPS | 自签 CA + 注入到系统信任 | 用户需配置 |
| HTML 注入点 | <head> 顶部 | 早于用户脚本 |
| 跨域 hack | document.domain 双方设置 | 浏览器原生 |
| 大文件 | streams 处理 | 避免 OOM |

**最佳实践**：
1. ✅ 代理要 listen 0 端口：避免端口冲突
2. ✅ CA 要自动注入：用户机器一键信任
3. ✅ HTML 注入用 stream：避免 OOM（CDN 1GB 文件很常见）
4. ✅ document.domain 双向设置：单边无效
5. ✅ 失败时降级到明文：自签 CA 失败时不阻断测试
6. ✅ 代理要支持 WebSocket：Socket.IO 需要升级

### 7. 双通道架构（Dual-Channel Architecture）

**问题场景**：Cypress Server（Node）需要和 Driver（浏览器内）双向通信：Server 发"启动测试"指令，Driver 回"截图/日志"；同时 Server 还要和 CI/UI 通信（Socket.IO）。如果只用一个 channel 串行，截图会卡住指令。Cypress 用"双 Socket.IO transport"：runner ↔ server 走一通道，driver ↔ server 走另一通道，互不干扰。

**解决方案**：
```typescript
// server/lib/socket-base.ts:128-137 — Socket.IO 配置
return new socketIo.SocketIOServer(server, {
  path,
  cookie: typeof cookie === 'string' ? { name: cookie } : cookie,
  destroyUpgrade: false,
  serveClient: false,
  // TODO(webkit): the websocket socket.io transport is busted in WebKit, need polling
  transports: ['websocket', 'polling'],
})

// 两条 Socket 通道：
// 1) server ← → runner (Node ↔ Node, 跑测试编排)
// 2) server ← → driver (Node ↔ Browser, 跑实际测试)
// 解耦：runner 知道在跑哪个 spec
//       driver 知道正在执行哪个命令
//       两者不直接通信，统一过 server
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Transport | ws → polling 降级 | WebKit 兼容 |
| Path | /__socket.io | 隔离 |
| Cookie | cypress-session | 跨页面保持 |
| destroyUpgrade | false | 防止异常断开 |
| serveClient | false | 不暴露客户端文件 |

**最佳实践**：
1. ✅ 双通道是必要的：跑测试和拿数据是不同延迟敏感度
2. ✅ Transport 配 ws + polling：WebKit 兼容（生产代码写 TODO 是务实）
3. ✅ Cookie 持久化：跨页面保持会话
4. ✅ 不暴露客户端文件：serveClient=false 防泄露
5. ✅ 自动重连 + 心跳：Socket.IO 默认带
6. ✅ Channel 隔离：跑测试通道和拿日志通道不要混

### 8. CDP 浏览器自动化协议抽象（CDP Abstraction）

**问题场景**：Chrome/Edge 用 Chrome DevTools Protocol (CDP)，Firefox 走 WebDriver BiDi/Marionette，WebKit 用 Playwright 兼容协议。Cypress 想统一 API —— `cy.visit`、`cy.click` 在所有浏览器表现一致。解法是抽象 `cdp-connection.ts` + `cdp_automation.ts` 为薄层，业务逻辑（driver）只调自己 API，CDP 协议细节藏在实现里。

**解决方案**：
```typescript
// server/lib/browsers/cdp-connection.ts — 协议抽象
abstract class CdpConnection {
  abstract send<T>(method: string, params?: object): Promise<T>
  abstract on(event: string, handler: Function): void
  abstract close(): Promise<void>
}

// Chrome 实现
class ChromeCDP extends CdpConnection {
  private client: CDP.Client
  async send(method, params) {
    return this.client.send(method, params)
  }
}

// Firefox BiDi 实现
class FirefoxBiDi extends CdpConnection {
  private bidi: BiDi.Client
  async send(method, params) {
    // method 翻译成 BiDi 调用
    return this.bidi.send(this.translate(method), params)
  }
  private translate(method: string): string {
    // Page.navigate → browsingContext.navigate
    // Network.enable → network.enable
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Chrome | CDP（原生） | 最成熟 |
| Firefox | WebDriver BiDi + Marionette 降级 | BiDi 新协议 |
| WebKit | Playwright 兼容 | Playwright 团队贡献 |
| 抽象层 | 5-8 个方法 | send/on/close |
| 协议翻译 | 每个 BiDi 方法映射 CDP | 维护成本 |

**最佳实践**：
1. ✅ 抽象层要薄：业务代码不感知协议
2. ✅ BiDi/Playwright 是未来：CDP 在 Firefox/WebKit 不原生
3. ✅ 协议翻译要单测：每个 method 映射都有 case
4. ✅ 不实现每个 CDP 命令：只实现 Cypress 用到的子集
5. ✅ 协议版本管理：CDP v1.3 / BiDi v0.2 都要锁定
6. ✅ 失败时优雅降级：协议不支持就跳过而不是 crash

### 9. Lerna Monorepo 34 子包（Lerna Monorepo）

**问题场景**：Cypress 包含 CLI、Server、Driver、Proxy、UI（Vue/React）、Electron 二进制、Cloud Protocol、Data Context、Reporter、Frontend-Shared 等 34 个子模块。如果拆 34 个仓库，跨包改动要开 34 个 PR；如果单仓不模块化，编译时间 + 循环依赖爆炸。Lerna + Yarn workspaces 的 monorepo 解法：单仓 34 包，跨包引用像单仓一样自然。

**解决方案**：
```
cypress/
├── package.json (workspace root, 288 行, 60+ devDeps)
├── lerna.json
├── cli/                     # CLI 入口
├── packages/
│   ├── server/              # Node 端核心
│   ├── driver/              # 浏览器端运行时
│   ├── proxy/               # HTTP 代理
│   ├── net-stubbing/        # cy.intercept 实现
│   ├── launcher/            # 浏览器启动
│   ├── electron/            # Electron 二进制
│   ├── data-context/        # 数据层 + GraphQL
│   ├── extension/           # Chrome 扩展
│   ├── frontend-shared/     # UI 共享组件
│   ├── launchpad/           # 启动器 UI
│   ├── reporter/            # 实时报告 UI
│   └── runner/              # 测试运行器 UI
└── system-tests/            # 2404 个集成测试
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 子包数 | 34 | Lerna workspace |
| 依赖管理 | Yarn 1.x + Lerna 6.x | 经典组合 |
| 跨包引用 | 软链 + 协议 | @packages/* 命名空间 |
| 构建 | Lerna build 并行 | -j4 起步 |
| 共享 devDeps | 60+ | 顶层 package.json |

**最佳实践**：
1. ✅ 单仓多包：跨包改动一个 PR
2. ✅ 软链引用：@packages/server 能直接用 @packages/driver
3. ✅ 顶层 devDeps 集中：避免每个子包重复
4. ✅ system-tests 独立包：2404 个 spec 单独跑
5. ✅ 命名空间 @packages/*：区分本地包和外部包
6. ✅ 升级考虑迁移到 Nx/Turborepo：Lerna 维护放缓

### 10. 自定义错误体系（Custom Error System）

**问题场景**：Cypress 失败时既要给开发者看详细原因（DOM 状态、控制台、截图），又要给 CI 看简洁错误码。默认 JS Error 没法附上下文。Cypress 设计 `errors/` 包 —— 错误码 + 模板 + 上下文 + 友好渲染。一个错误对象 = 一个 Error 子类 + 错误码 + 模板字符串 + 上下文对象。

**解决方案**：
```typescript
// packages/errors/src/errors.ts
export class CypressError extends Error {
  constructor(
    public code: string,          // 'INCOMPATIBLE_HEADLESS_FLAGS'
    public message: string,       // 模板
    public context?: object       // 上下文
  ) {
    super(message)
    this.name = 'CypressError'
  }
}

// 注册
errors.register('INCOMPATIBLE_HEADLESS_FLAGS', {
  message: '`--headless` and `--headed` cannot both be passed',
  docs: 'https://docs.cypress.io/guides/references/configuration',
})

// 使用
if (options.headless && options.headed) {
  return throwInvalidOptionError(errors.incompatibleHeadlessFlags)
}

// 渲染
err.format({ headless: true, headed: true })
// → "Incompatible flags: --headless and --headed cannot both be passed"
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 错误码格式 | 大写 + 下划线 | 唯一标识 |
| 模板 | 字符串 | 占位符 |
| 上下文 | 任意对象 | 渲染时插入 |
| docs 链接 | 可选 | 用户自助 |
| 国际化 | 占位符支持 | 后续扩展 |

**最佳实践**：
1. ✅ 错误码要稳定：API 一旦发布不改
2. ✅ 模板要可读：用户第一眼能懂
3. ✅ 上下文要丰富：附相关变量值
4. ✅ 配套 docs 链接：引导用户查文档
5. ✅ 子类继承：`CypressError` + `NetworkError` + `TestError`
6. ✅ 错误码集中注册：errors.register() 集中表

## 三、性能优化

### 11. 截图缓存 + 命令日志（Screenshot Cache + Command Log）

**问题场景**：Cypress 跑测试时用户希望看到"时间旅行"——点 UI 上一个命令回看当时 DOM 状态。简单实现是每命令都截图，但内存爆炸（200 测试 × 50 命令 × 500KB = 5GB）。Cypress 优化：失败时全屏截图 + 选中时局部 DOM 快照 + 命令日志（轻量文本）补充。

**解决方案**：
```typescript
// driver/src/cypress/runner.ts — 命令快照
const commandSnapshot = {
  name: 'click',                  // 命令名
  args: ['#submit'],              // 参数
  error: null,                    // 错误
  snapshot: 'cypress/screenshots/cmd-1234.png',  // 失败时才有
  consoleEntries: [...],          // 控制台日志
  networkEntries: [...],          // 网络请求
  // ... 不存 DOM（DOM 快照按需取）
}

// 时间旅行
cy.get('.cmd-1234').click()
// UI 上点这个命令 → 重新跑 DOM 快照
// 失败命令存截图 DOM 快照 on-demand
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 失败截图 | 全屏 PNG | 必有 |
| 成功截图 | 不存 | 优化项 |
| DOM 快照 | 选中时按需 | 节省内存 |
| 命令日志 | 每命令 1KB | 轻量 |
| 时间旅行 | 重新取快照 | 不存全 DOM |

**最佳实践**：
1. ✅ 失败截图、成功不存：平衡调试 vs 内存
2. ✅ DOM 快照按需：选中时才重新计算
3. ✅ 命令日志轻量化：< 1KB / 命令
4. ✅ 时间旅行不存全 DOM：太大了
5. ✅ 截图压缩：PNG 8-bit + 调分辨率
6. ✅ 上传 dashboard 时重新压缩

### 12. 视频录制管线（Video Recording Pipeline）

**问题场景**：CI 跑测试时开发者看不到实时 DOM，但失败后要能复现。Cypress 在整个测试期间录视频，失败时可以下载回看。录视频 = 截屏 + 编码 = 性能开销。Cypress 用 ffmpeg 子进程 + x264 编码 + 关键帧间隔优化。

**解决方案**：
```bash
# packages/server/lib/video_capture.ts 简化
# 启动 ffmpeg 子进程
ffmpeg -f image2pipe -r 30 -i pipe:0 \
       -c:v libx264 -preset ultrafast -tune zerolatency \
       -crf 18 -pix_fmt yuv420p \
       -movflags +faststart \
       output.mp4
# Cypress 通过 stdin 推帧（30fps）
# x264 ultrafast preset：低 CPU 占用
# CRITICAL：测试结束时要发送 SIGINT 触发 finalize
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 帧率 | 30 fps | 平衡清晰度 vs 大小 |
| 编码 | libx264 ultrafast | 低 CPU |
| 质量 CRF | 18 | 视觉无损 |
| 像素格式 | yuv420p | 浏览器兼容 |
| 容器 | mp4 + faststart | 网络播放 |

**最佳实践**：
1. ✅ ffmpeg 子进程：避免阻塞主进程
2. ✅ ultrafast preset：CI 资源有限
3. ✅ CRF 18：质量 + 大小平衡
4. ✅ faststart flag：mp4 头放前面
5. ✅ 测试结束发 SIGINT：让 ffmpeg finalize moov
6. ✅ 失败时自动上传：dashboard 关联视频

### 13. v8-snapshot 冷启动加速（v8-Snapshot Cold Start）

**问题场景**：Electron 应用冷启动要 1-2s（V8 编译 JS）。Cypress 测试每天跑 1000+ 次，1s 启动 × 1000 = 16 分钟浪费。Cypress 团队用 v8-snapshot 工具把 JS 编译成二进制快照，启动时直接 mmap，**冷启动从 1.5s 降到 300ms**。

**解决方案**：
```javascript
// tooling/v8-snapshot — 自研工具
// 1) 启动时收集所有 JS 模块
// 2) 用 v8 isolat 创建快照
// 3) 输出 binary snapshot
// 4) 启动时 mmap + v8::Isolate::CreateSnapshot

// 集成在 build 流程
// yarn build → ts 编译 + v8-snapshot + electron 打包
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 冷启动优化 | 1.5s → 300ms | 5 倍加速 |
| 工具 | 自研 tooling/v8-snapshot | Electron 团队技巧 |
| 触发 | build 阶段 | 一次性 |
| 兼容 | Electron 12+ | 早期不支持 |
| 限制 | 动态 require 需排除 | snapshot 静态 |

**最佳实践**：
1. ✅ 静态依赖打 snapshot：动态 require 不能打
2. ✅ CI 必须用 snapshot：开发模式可以不打
3. ✅ 配合 lazy require：业务代码按需加载
4. ✅ 监控启动时间：每次 build 验证
5. ✅ 不要 snapshot 太大：> 50MB 反序列化慢
6. ✅ 考虑 NAPI/Rust 模块：snapshot 不包含

### 14. 稳定性等待队列（Stability Wait Queue）

**问题场景**：当多个 retry 命令同时挂起（如 `cy.get('.a').should(...)` + `cy.get('.b').should(...)`），它们都要等稳定性事件。事件来一次要"批量 release"，否则"先注册后执行"顺序错乱。Cypress 用 FIFO 队列 + splice(0) 一次性拿走，await Promise.all 全部执行。

**解决方案**：
```typescript
// driver/src/cy/stability.ts
const whenStableQueue: Array<{ fn, resolve, reject }> = []
isStable: (stable, event) => {
  if (state('isStable') === stable) return
  state('isStable', stable)
  Cypress.action('cy:stability:changed', stable, event)
  if (!stable) return
  Cypress.action('cy:before:stability:release').then(async () => {
    // 一次性 splice 拿走全部
    const waitersToRelease = whenStableQueue.splice(0)
    // 全部 await（避免乱序）
    await Promise.all(waitersToRelease.map((waiter) =>
      Promise.try(waiter.fn).then(waiter.resolve).catch(waiter.reject)
    ))
  })
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 队列类型 | FIFO | 公平 |
| 释放模式 | splice(0) 一次性 | 避免中间插入 |
| 钩子 | cy:before:stability:release | 前置 |
| 失败处理 | waiter.reject 单点失败不影响他人 | |
| reset | 全部 reject | 防泄漏 |

**最佳实践**：
1. ✅ 队列要 FIFO：先注册先执行
2. ✅ 释放一次性 splice：避免中间新 wait 错乱
3. ✅ 失败单点 reject：不影响其他 waiter
4. ✅ reset 全部 reject：跨测试不串扰
5. ✅ 前置钩子 cy:before:stability:release：让应用层做清理
6. ✅ splice 替代 shift：O(1) 而非 O(n)

### 15. 数据流快照（Data Flow Snapshot）

**问题场景**：测试失败时要还原"在失败那一刻，应用处于什么状态"。Cypress 通过 CDP 持续抓取控制台 + 网络 + 页面错误 + DOM 变化，存为"数据流"，失败时 dump。**这套机制是 Cloud Protocol 的一部分**。

**解决方案**：
```typescript
// packages/server/lib/cloud/protocol.ts
class CloudProtocol {
  streamCDPEvents() {
    this.cdp.on('Runtime.consoleAPICalled', (e) => {
      this.eventLog.push({ type: 'console', ts: Date.now(), args: e.args })
    })
    this.cdp.on('Network.requestWillBeSent', (e) => {
      this.eventLog.push({ type: 'network-req', ts: Date.now(), req: e.request })
    })
    this.cdp.on('Network.responseReceived', (e) => {
      this.eventLog.push({ type: 'network-resp', ts: Date.now(), resp: e.response })
    })
    this.cdp.on('Runtime.exceptionThrown', (e) => {
      this.eventLog.push({ type: 'exception', ts: Date.now(), err: e.exceptionDetails })
    })
  }
  // 失败时 dump
  onTestFail(test, err) {
    this.upload({
      test, err,
      events: this.eventLog,
      // + DOM 快照、截图、视频
    })
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 事件源 | CDP 全部 | Runtime + Network + Page |
| 存储 | 内存 + 序列化 protobuf | 上传 dashboard |
| 失败时 | dump 全量 | 完整回放 |
| 性能开销 | < 5% | 取决于事件量 |
| 序列化 | protobuf | 紧凑 |

**最佳实践**：
1. ✅ 失败时全 dump：完整上下文
2. ✅ 流式上传：大数据不要一次性堆内存
3. ✅ protobuf 序列化：紧凑
4. ✅ 过滤敏感数据：Authorization / Cookie 不能上传
5. ✅ 限制事件大小：超过 1MB 截断
6. ✅ 配合时间旅行 UI：dashboard 可视化

## 四、可靠性与生态

### 16. 系统测试 2404 个 Spec（System Tests）

**问题场景**：单元测试覆盖 driver 内部逻辑，但"端到端"（启动 Electron、跑测试、拿结果）要靠 system-tests。Cypress 把 system-tests 做成独立包，**2404 个 spec** 覆盖所有 CLI/Server/Driver 路径，**这是测试自举的典范**。

**解决方案**：
```bash
# system-tests/ 目录结构
system-tests/
├── cypress/
│   ├── e2e/                # 2404 个 e2e spec
│   ├── fixtures/           # 测试 fixture
│   └── support/            # 自定义命令
├── package.json
└── scripts/

# 跑
yarn test-system          # 跑 2404 个 spec
yarn test-system --spec record_spec.js
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Spec 数 | 2404 | 集成测试 |
| 框架 | Mocha | 复用 |
| 覆盖范围 | CLI + Server + Driver | 全栈 |
| 跑时间 | 30-60 分钟 | CI 全量 |
| 拆分 | 按 spec 单跑 | CI 优化 |

**最佳实践**：
1. ✅ system-tests 是质量的最后一道防线：单元测试通过不等于产品能用
2. ✅ spec 粒度要细：2404 个不是 24 个，调试容易
3. ✅ 复用 Mocha 框架：减少学习成本
4. ✅ fixtures 集中管理：测试数据共享
5. ✅ CI 拆分 spec：避免 60 分钟单 job
6. ✅ flakiness 监控：dashboard 跟踪

### 17. Retry 算法可配置（Retry Algorithm Configurable）

**问题场景**：不同团队对 flaky test 容忍度不同 —— 严格金融团队要求 100% 通过，UI 团队允许偶尔 flaky。Cypress 提供 3 种 retry 策略：**detect-flake-and-pass-on-threshold**（达到通过阈值就 pass）、**detect-flake-but-always-fail**（发现 flake 立即 fail）、**默认**（标准 Mocha 行为）。

**解决方案**：
```typescript
// driver/src/cy/mocha.ts:47-137 — calculateTestStatus 策略模式
function calculateTestStatus(test, options) {
  const strategy = {
    'detect-flake-and-pass-on-threshold': (test) => {
      // 比如 5 次重试 3 次通过 → 通过
      if (test.passes >= options.passesRequired) return 'pass'
      return 'fail'
    },
    'detect-flake-but-always-fail': (test) => {
      // 任何失败都 fail，即使后重试通过
      if (test.everFailed) return 'fail'
      return 'pass'
    },
    'default': (test) => {
      // 标准 Mocha 行为
      return test.failed ? 'fail' : 'pass'
    }
  }[options.strategy || 'default']
  return strategy(test)
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 策略 | 3 种 | 默认 / flake-pass / flake-fail |
| passesRequired | 3 | flake-pass 阈值 |
| stopIfAnyPassed | true | 提早结束 |
| 配置 | cypress.json | 全局 |
| 报告 | dashboard 标记 flaky | 可视化 |

**最佳实践**：
1. ✅ 严格场景用 flake-fail：金融 / 医疗
2. ✅ 宽松场景用 flake-pass：UI 探索
3. ✅ 默认场景用 standard：稳定优先
4. ✅ 配置统一：cypress.json 集中
5. ✅ dashboard 标记 flaky：跟踪趋势
6. ✅ 定期 review flaky test：消除而不是容忍

### 18. CI 双线（CircleCI + Actions）

**问题场景**：Cypress 团队自身用 CircleCI 跑主流水线（构建 + 测试），GitHub Actions 跑 PR triage（issue 分类 + SCA + dep 漏洞扫描）。双线分离：主流程不阻塞 PR review，PR 改动第一时间得到安全检查。

**解决方案**：
```yaml
# .circleci/config.yml
version: 2.1
jobs:
  build:
    docker: [cypress/base:14]
    steps:
      - checkout
      - restore_cache
      - run: yarn install --frozen-lockfile
      - run: yarn build
      - run: yarn test
      - save_cache
workflows:
  version: 2
  test:
    jobs: [build]

# .github/workflows/pr-triage.yml
on: [pull_request]
jobs:
  pr-triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/labeler@v4
      - uses: github/codeql-action/analyze@v2
      - run: npx snyk test
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| CircleCI | 主流程 | build + test |
| GitHub Actions | PR triage | 分类 + 安全 |
| 镜像 | cypress/base:14 | 含 Chrome 预装 |
| 缓存 | yarn 依赖 + Electron | 加速 |
| 触发 | 每次 PR + push main | 全量 |

**最佳实践**：
1. ✅ 主流程和 PR triage 分离：主流程不阻塞 review
2. ✅ 专用 docker 镜像：cypress/base:14 含所有依赖
3. ✅ 缓存依赖：yarn + Electron 二进制
4. ✅ 安全扫描在 PR：漏洞不入主仓
5. ✅ 自动 labeler：PR 分类自动化
6. ✅ 失败 fast-fail：节省 CI 资源

### 19. Cloud Protocol 可观测性（Cloud Protocol Observability）

**问题场景**：测试失败只在本地有完整上下文（DOM、截图、控制台），CI 跑时只有 exit code。开发者要快速定位 CI 失败，Cypress Cloud Protocol 把"测试可观测性"做到底 —— 抓 CDP 流量、DOM 快照、视频流、控制台日志、网络请求，序列化为 protobuf 上传 dashboard。**是测试领域第一个把"测试可观测性"做到底的项目**。

**解决方案**：
```typescript
// packages/server/lib/cloud/protocol.ts
class CloudProtocol {
  streamAll() {
    this.streamCDPEvents()      // Runtime + Network + Page
    this.streamDriverEvents()   // cy.* 命令
    this.streamScreenshots()    // 失败截图
    this.streamVideo()          // 视频流
  }
  async upload() {
    // protobuf 序列化
    const buf = CloudProtocolProto.encode({
      testRunId: this.testRunId,
      events: this.events,
      snapshots: this.snapshots,
      video: this.video,
    }).finish()
    // 上传 Cypress Cloud
    await this.cloud.upload(buf)
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 数据源 | CDP + Driver + 视频 | 完整 |
| 序列化 | protobuf | 紧凑 |
| 上传 | Cloud Storage | 加密 |
| 时机 | 测试运行中 + 失败时 | 流式 |
| 容量 | 100MB / test | 限制 |

**最佳实践**：
1. ✅ 失败时全 dump：完整上下文
2. ✅ 流式上传：不要堆内存
3. ✅ protobuf 序列化：紧凑
4. ✅ 过滤敏感数据：Authorization / Cookie 不能上传
5. ✅ 限制大小：100MB 截断
6. ✅ 配合时间旅行 UI：dashboard 可视化

### 20. Studio 录制回放（Studio Record-Replay）

**问题场景**：手写测试用例成本高，对新功能尤其如此。Cypress Studio（2024 GA）允许用户在 GUI 里点 / 输入，Cypress 自动记录操作 → 生成测试代码 → 重放验证。**这是低代码测试的突破**，QA 团队能"演示一次就行"。

**解决方案**：
```typescript
// packages/extension/src/studio.ts
class StudioRecorder {
  start() {
    // 监听所有 UI 事件
    document.addEventListener('click', this.onClick)
    document.addEventListener('input', this.onInput)
    document.addEventListener('submit', this.onSubmit)
  }
  onClick(e) {
    // 1) 提取元素 selector
    const selector = this.getSelector(e.target)
    // 2) 生成 cy.get(selector).click()
    this.commands.push({ type: 'click', selector, ts: Date.now() })
  }
  stop() {
    // 3) 输出测试代码
    return this.generateCode()
  }
  generateCode() {
    return `
describe('Recorded Test', () => {
  it('does stuff', () => {
    ${this.commands.map(this.toCypressCommand).join('\n    ')}
  })
})
    `
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 事件源 | click / input / submit | 主流 UI 事件 |
| 元素选择 | Playwright-style selector | 健壮 |
| 输出格式 | Cypress 测试代码 | 可读 |
| GA 时间 | 2024 | 稳定 |
| 限制 | 复杂交互需手动补 | v1 限制 |

**最佳实践**：
1. ✅ 录制起点明确：先 cy.visit 起始页
2. ✅ 选择器要健壮：优先 data-testid
3. ✅ 重放前 review 代码：避免误录
4. ✅ 复杂交互手动补：拖拽 / iframe
5. ✅ 录制 + 人工混合：60% 录制 + 40% 手动
6. ✅ 录制不要代替思考：核心逻辑仍要手写

---

**标签**：#cypress #E2E #TypeScript #Electron #测试 #浏览器自动化
**状态**：20/20 份详细内容
