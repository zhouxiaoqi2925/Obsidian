# Playwright - 现代 Web 端到端测试框架

**GitHub**: microsoft/playwright
**Star**: 75k+
**语言**: TypeScript
**主题**: E2E测试、自动化、浏览器、testing
**适用场景**: Web E2E 自动化测试、跨浏览器测试、CI/CD 集成、爬虫

---

## 一、基础范式

### 模式 1 · 三浏览器统一 API

**问题场景**：Selenium 需要每个浏览器单独 driver，Puppeteer 只支持 Chromium。

**解决方案**：Playwright 提供统一 API 控制 Chromium / Firefox / WebKit 三大浏览器，引擎内置浏览器版本（无 driver 下载），`chromium.launch()` / `firefox.launch()` / `webkit.launch()` 一行切换。

**关键参数**：
- `chromium.launch()` / `firefox.launch()` / `webkit.launch()`
- 内置浏览器版本
- `playwright install` 下载
- `browserType.launch({ headless: true })`
- `await browser.close()`

**最佳实践**：所有跨浏览器 E2E 测试用 Playwright，零环境配置。

### 模式 2 · Page Object Model + Locator 链

**问题场景**：测试代码硬编码 selector，维护成本高。

**解决方案**：Locator 抽象 `page.getByRole('button')` / `page.getByText('Submit')` / `page.getByTestId('submit')` / `page.locator('.btn')` 四种语义化定位器，自动等待 + 重试。

**关键参数**：
- `page.getByRole()` ARIA 角色
- `page.getByText()` 文本
- `page.getByTestId()` data-testid
- `page.locator()` CSS
- 自动重试

**最佳实践**：所有 selector 用 getByRole / getByTestId 语义化，不写 CSS。

### 模式 3 · 自动等待 + Actionability Check

**问题场景**：测试 flaky（点不到 / 等不到元素），手写 `waitFor` 难维护。

**解决方案**：Playwright 内置 actionability check：click 前自动等元素 visible / enabled / stable / receives events；fill 前自动等 editable / enabled。30+ 内置检查。

**关键参数**：
- 自动等待 visible
- 自动等 stable
- 自动 receives events
- 30+ 检查
- 重试机制

**最佳实践**：所有 Playwright action 都自动等，手写 `waitFor` 极少。

### 模式 4 · 多页签 / 上下文隔离

**问题场景**：测试需要多用户 / 多标签场景（聊天应用 / 多账户）。

**解决方案**：`browser.newContext()` 隔离 cookie / localStorage / 缓存，模拟多用户；`context.newPage()` 在同上下文创建多 tab。

**关键参数**：
- `browser.newContext()` 隔离
- 多用户模拟
- `context.newPage()` 多 tab
- 独立 cookie
- 独立 storage

**最佳实践**：所有多账户测试用 `newContext()` 隔离，比单页签快 10x。

### 模式 5 · Trace Viewer 调试

**问题场景**：测试失败难定位（flaky / 时序问题）。

**解决方案**：`context.tracing.start({ screenshots: true, snapshots: true })` 录制测试全过程，失败时 `trace.zip` 可在 `playwright show-trace` 交互式回放（截图 + DOM + 网络 + 控制台）。

**关键参数**：
- `context.tracing.start()`
- screenshots / snapshots
- 网络 / 控制台
- `playwright show-trace`
- 失败时保留

**最佳实践**：所有 CI 跑 Playwright 都开启 trace，失败定位 10x 快。

---

## 二、扩展范式

### 模式 6 · 网络拦截（route / fulfill）

**问题场景**：测试需要 mock API 响应 / 拦截第三方请求。

**解决方案**：`page.route('**/api/users', route => route.fulfill({ body: '...', status: 200 }))` 拦截 + 自定义响应；`page.route('**/analytics/*', route => route.abort())` 屏蔽。

**关键参数**：
- `page.route()` 拦截
- `route.fulfill()` 自定义
- `route.continue()` 透传
- `route.abort()` 终止
- glob 模式

**最佳实践**：所有 E2E 测试用 route.fulfill mock 后端，独立测试前端。

### 模式 7 · 截图 + 视觉回归

**问题场景**：UI 视觉回归测试。

**解决方案**：`page.screenshot({ path: 'screenshot.png' })` + `expect(page).toHaveScreenshot()` 视觉比对，5% pixel diff 阈值。

**关键参数**：
- `page.screenshot()` 截图
- `toHaveScreenshot()` 断言
- 5% pixel diff
- 视觉回归
- baseline 管理

**最佳实践**：所有 UI 关键页面用 `toHaveScreenshot` 视觉回归。

### 模式 8 · 自动代码生成（codegen）

**问题场景**：手写测试用例费时。

**解决方案**：`npx playwright codegen https://example.com` 打开浏览器 + 录制器，自动生成 page.click / page.fill 代码，输出到 TypeScript / JavaScript。

**关键参数**：
- `playwright codegen`
- 录制点击
- 自动生成代码
- TS / JS 输出
- selector 推断

**最佳实践**：所有新手用 codegen 起步，5 分钟生成 100 行测试。

### 模式 9 · 移动端模拟

**问题场景**：需要测试移动端布局 + 触摸事件。

**解决方案**：`devices['iPhone 13']` 预设 50+ 设备；`browser.newContext({ ...devices['iPhone 13'] })` 创建移动上下文，触摸事件 / 视口 / user agent 全部模拟。

**关键参数**：
- `devices` 预设
- iPhone / Pixel
- 触摸事件
- 视口
- user agent

**最佳实践**：所有响应式测试用设备模拟，无需真实设备。

### 模式 10 · Playwright Test Runner

**问题场景**：需要测试框架（describe / it / beforeEach）。

**解决方案**：`@playwright/test` 是官方测试 runner，Vitest 风格 API：test.describe / test / test.beforeEach / test.afterAll；并行执行 + sharding + retries。

**关键参数**：
- `@playwright/test` 框架
- `test.describe` 分组
- `test.beforeEach`
- 并行 + sharding
- retries

**最佳实践**：所有新项目用 `@playwright/test`，零配置上手。

---

## 三、进阶范式

### 模式 11 · 组件测试（Component Testing）

**问题场景**：需要测试 React / Vue 组件而非整页。

**解决方案**：`@playwright/experimental-ct-react` / `-ct-vue` 组件测试，`mount(<MyComponent />)` 在浏览器内挂载组件，避免起整个 E2E。

**关键参数**：
- `@playwright/experimental-ct-react`
- `mount(<MyComponent />)`
- 浏览器内运行
- 组件独立测试
- 实验性

**最佳实践**：所有组件级测试用 CT，整页用 E2E。

### 模式 12 · 浏览器上下文并行 + 隔离

**问题场景**：测试需要并行执行。

**解决方案**：`@playwright/test` 自动并行，多个 worker 进程；`test.describe.parallel` 显式声明；`test.describe.configure({ mode: 'parallel' })`。

**关键参数**：
- `test.describe.parallel`
- worker 进程
- `--workers=4` 控制并发
- 隔离
- sharding

**最佳实践**：所有测试套件用 `parallel` 加速，CPU 核数 = worker 数。

### 模式 13 · 移动原生应用（playwright-mobile）

**问题场景**：iOS / Android 原生应用测试。

**解决方案**：`@playwright/test` + 设备 farm 远程控制真机；`adb` + Android Debug Bridge 控制 Android；XCUITest 桥接 iOS。

**关键参数**：
- 真机测试
- 设备 farm
- adb
- XCUITest
- 远程控制

**最佳实践**：MVP 用模拟器，发布前用 BrowserStack / Sauce Labs 真机测试。

### 模式 14 · WebSocket 拦截

**问题场景**：测试 WebSocket 通信（聊天 / 实时）。

**解决方案**：`page.routeWebSocket()` v1.40+ 拦截 WebSocket 握手 + 消息，自定义 payload 发送。

**关键参数**：
- `page.routeWebSocket()`
- 握手拦截
- 消息自定义
- 双向 mock
- 实时测试

**最佳实践**：所有 WebSocket 实时应用测试用 routeWebSocket。

### 模式 15 · Playwright vs Cypress / Selenium

**问题场景**：E2E 框架选型。

**解决方案**：Playwright 定位「现代 + 跨浏览器 + 速度快 + auto-wait」；Cypress 定位「前端友好 + 时间旅行」；Selenium 定位「生态最大 + 老牌」。

**关键参数**：
- 速度：Playwright > Cypress > Selenium
- 跨浏览器：Playwright > Selenium > Cypress
- 学习曲线：Cypress < Playwright < Selenium
- 生态：Selenium > Cypress > Playwright

**最佳实践**：新项目用 Playwright，复杂 SPA 用 Cypress，老项目维持 Selenium。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Playwright 项目。

**解决方案**：7 件套：① `npm init playwright@latest` 初始化 ② `playwright.config.ts` 配置 ③ `tests/` 测试目录 ④ `pages/` Page Object ⑤ `playwright/test` 引入 ⑥ `npx playwright test` 跑测 ⑦ `npx playwright show-report` 看报告。

**关键参数**：
- `playwright init`
- `playwright.config.ts`
- `tests/` 目录
- `npx playwright test`
- trace / report
- CI 集成

**最佳实践**：所有新项目用 7 件套模板，5 分钟跑起来。

### 模式 17 · CI/CD 集成（GitHub Actions）

**问题场景**：CI 跑 Playwright 慢 / 不稳定。

**解决方案**：GitHub Actions 装 `microsoft/playwright-github-action`，并行 sharding：`matrix: { shard: [1/4, 2/4, 3/4, 4/4] }`，上传 trace artifact。

**关键参数**：
- `microsoft/playwright-github-action`
- sharding
- 4 worker 并行
- trace 上传
- 失败时 artifact

**最佳实践**：所有 GitHub Actions 跑 Playwright 用官方 action + sharding，节省 75% 时间。

### 模式 18 · 性能优化 5 招

**问题场景**：测试套件跑 30 分钟太长。

**解决方案**：5 招优化：① sharding 并行 ② `test.describe.parallel` ② `test.skip()` 跳过不必要测试 ③ API mocking 替代真实 API ④ `headless: true` ⑤ `test.retry(1)` 应对 flaky。

**关键参数**：
- sharding
- parallel
- skip
- API mock
- headless
- retry

**最佳实践**：5 招组合，30 分钟套件降到 5 分钟。

### 模式 19 · Page Object Model 设计

**问题场景**：测试代码难维护（重复 selector）。

**解决方案**：`pages/LoginPage.ts` 封装页面，`page.login(username, password)` 一行完成登录，`expect(page).toHaveURL(...)` 断言。

**关键参数**：
- `pages/` 目录
- 类封装
- 公共方法
- 复用 selector
- 维护成本低

**最佳实践**：所有中型测试套件用 POM 模式，节省 50% 维护成本。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Playwright 做内部测试工具。

**解决方案**：7 天分 6 步：① CDP / Firefox / WebKit 协议 ② Browser Context 隔离 ③ Page DOM 包装 ④ Locator 语义化 ⑤ Actionability Check ⑥ 截图 / Trace。

**关键参数**：
- Day 1-2: 协议
- Day 3: Context
- Day 4: DOM
- Day 5: Locator
- Day 6: Check
- Day 7: 截图

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 Playwright 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\playwright\`
- **大小**: ~100 MB
- **总文件数**: 数千 TS 文件
- **关键 commit**: v1.40+
- **团队**: Microsoft 主导 + 社区
- **许可**: Apache-2.0

## 一句话总结

Playwright 用「三浏览器统一 API + Locator 语义化 + Actionability Check + Trace Viewer」让 Web E2E 测试告别 flaky，是 2024-2025 年 Web 自动化测试的事实标准。
