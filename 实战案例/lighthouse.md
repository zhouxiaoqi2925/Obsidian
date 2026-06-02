# lighthouse - 自动化 Web 质量审计

**GitHub**: GoogleChrome/lighthouse
**Star**: 30k+
**语言**: JavaScript (Node.js)
**主题**: web-vitals / performance / accessibility / seo / auditing
**适用场景**: Web 性能审计 / CI 质量门禁 / Core Web Vitals 监控 / SEO 检测 / 无障碍检查

---

## 第一段：基础范式

### 模式 1 - Gather/Audit 两阶段

**问题场景**：单次浏览器跑几十种检查（性能/可访问性/SEO），如果每个检查都启一次浏览器太慢。

**解决方案**：Lighthouse 分两阶段：① Gather（采集）驱动浏览器访问页面 + 收集 artifacts（NetworkRequests / Trace / Metrics / Accessibility）② Audit（审计）离线分析 artifacts 打分（FCP / LCP / CLS / TBT）。一采集多审计，速度快 10x。

**关键参数**：
- Gatherer 采集器
- Audit 审计器
- artifacts 中间产物
- LighthouseRunResult
- driver.evaluate

**最佳实践**：自定义 gatherer 写 `class MyGatherer extends Gatherer` + `startInstrumentation / gather / stopInstrumentation` 三钩子；自定义 audit 走 `class MyAudit extends Audit` + `audit(artifacts)`；artifacts 通过 gatherer 收集统一消费。

### 模式 2 - Puppeteer-Core Driver 浏览器

**问题场景**：Lighthouse 要驱动 Chrome 拿 trace + network + metrics，但 Chrome DevTools Protocol（CDP）调用复杂。

**解决方案**：用 `puppeteer-core` 库（不带 Chromium 浏览器）启动 Chrome + 通过 CDP 协议通信；`lighthouse(url, { port: 9222, output: 'json' })` 内部启动 Chrome / connect / Gather / Audit / return；`chrome-launcher` 启 Chrome `--remote-debugging-port` 监听。

**关键参数**：
- `puppeteer-core` 控浏览器
- `chrome-launcher` 启 Chrome
- CDP 协议
- `--remote-debugging-port`
- `port` 9222

**最佳实践**：Lighthouse CI 用 `chrome-launcher` 启 Chrome；自定义 driver 写 `ChromeProtocolSession` 包装；DevTools Protocol 协议升级 v1.3；`disableStorageReset: true` 保持登录态。

### 模式 3 - ComputedArtifact 缓存

**问题场景**：100 个 audit 都要算"页面所有 link 列表"，每个 audit 重算一次浪费。

**解决方案**：`ComputedArtifact` 缓存机制：artifacts 收集完后跑 `computedArtifacts` 阶段计算"派生数据"（`URLs / ImageElements / MetaElements / LinkElements`）；`artifacts.requestCriticalRequests()` 走 `ComputedArtifact.defineProperty` 一次性算 + 缓存。

**关键参数**：
- `ComputedArtifact`
- `defineProperty` 派生
- `requestCriticalRequests`
- `ImageElements`
- 一次性算

**最佳实践**：自定义 gatherer 收集原始数据；自定义 audit 走 `artifacts` 读 computed；computed 缓存走 module-level Map；调试时用 `lighthouse --view` 看 trace。

### 模式 4 - Lighthouse Runner 任务调度

**问题场景**：CI 跑 100 个 URL 审计，怎么调度并发 + 超时 + 错误恢复。

**解决方案**：`lighthouse-runner` 是 CLI 工具 + `lighthouse/batch-runner` 是 Node API；`batchRunner(urls, options, concurrency=5)` 并发跑；`lighthouse(url, opts, config)` 单次跑；`lighthouse-ci` 集 GitHub Actions 自动化。

**关键参数**：
- `lighthouse(url, opts, config)`
- `batchRunner(urls, ...)`
- concurrency 并发
- timeout 超时
- `lighthouse-ci` CI 集成

**最佳实践**：CI 用 `lhci collect --url=...` 跑 + `lhci upload` 存 + `lhci assert` 门禁；并发 5 + 每 URL 60s 超时；错误 URL 重试 3 次；`chrome-flags="--headless"` 无头。

### 模式 5 - 5 维度评分（Performance/A11y/SEO/BP/PWA）

**问题场景**：用户要"页面质量分数"，单一指标难表达。

**解决方案**：5 维度评分：① Performance 性能（FCP/LCP/CLS/TBT/Speed Index）② Accessibility 无障碍（aria/对比度/标签）③ Best Practices 最佳实践（HTTPS/控制台错误/图片宽高）④ SEO（meta/可爬/移动友好）⑤ PWA（Service Worker/manifest）。每维度 0-100 分。

**关键参数**：
- 5 维度
- 0-100 分
- weighted average
- pass/warn/fail
- opportunities 优化建议

**最佳实践**：CI 门禁 Performance > 90 / A11y > 95；分数 < 阈值阻断 PR；`lighthouse --only-categories=performance` 跑单维度快 5x；分数趋势图存数据仓库。

---

## 第二段：扩展范式

### 模式 6 - Lighthouse Config 配置

**问题场景**：业务要定制审计维度（只审计性能 + 特定规则集）。

**解决方案**：`lighthouse.config.js` 配 `extends: 'lighthouse:default'` 继承默认；`settings: { onlyCategories: ['performance'] }` 限定维度；`audits: ['unused-css-rules']` 包含额外；`skipAudits: ['uses-http2']` 跳过；`groups: { ... }` 自定义分组。

**关键参数**：
- `extends` 继承
- `onlyCategories`
- `audits` / `skipAudits`
- `groups` 分组
- `passes` 阶段

**最佳实践**：内部用 config 锁定审计集（CI 一致性）；`extends: 'lighthouse:default'` + `skipAudits` 微调；`lighthouse --config-path=custom.js url` 自定义；`desktop-config.js` vs `mobile-config.js` 切换设备。

### 模式 7 - Lighthouse Plugin 插件

**问题场景**：业务要"审计内部框架特定问题"（React 性能、Vue 路由等）。

**解决方案**：`lighthouse-plugin-myplugin` 子包；`lighthouse --plugins=lighthouse-plugin-react` 加载；插件含 `package.json` + `index.js`（注册 gatherers / audits / categories）；`lighthouse-plugin-field-performance` 是官方示例；`lighthouse-plugin-publisher-ads` Google Ads 专用。

**关键参数**：
- 插件子包
- `index.js` 注册
- `audits / categories`
- `--plugins=` 加载
- `lighthouse-plugin-*` 命名

**最佳实践**：内部审计写 `lighthouse-plugin-internal` 子包；插件配 `category: { id: 'lighthouse-internal', title: '内部审计' }`；`lighthouse --plugins` 加载多个；发布 npm 公开或内部 private。

### 模式 8 - 移动 vs 桌面 模拟

**问题场景**：移动/桌面用户得分差异大（移动算力低），CI 跑哪个？

**解决方案**：`lighthouse(url, { formFactor: 'mobile' })` 显式；`lighthouse(url, { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false } })` 桌面模拟；`throttling-method: 'simulate'` vs `devtools` 切换节流；`preset: 'desktop' | 'mobile'` 预设。

**关键参数**：
- `formFactor`
- `screenEmulation`
- `throttling-method`
- `preset: desktop/mobile`
- 移动 4G 节流

**最佳实践**：CI **必**跑移动（Core Web Vitals 默认移动）；桌面 1 个 + 移动 3 个抽样 URL；`screenEmulation.disabled: false` 真实模拟视口；`throttling.cpuSlowdownMultiplier: 4` 模拟低端机。

### 模式 9 - Trace + 性能分析

**问题场景**：Performance 分数低，要定位是 LCP 长 / TBT 高 / CLS 飘。

**解决方案**：trace 文件含 `Trace` events（`largestContentfulPaintCandidate` / `layoutShift` / `longtask`）；`./lighthouse --view` 打开 trace + 网络瀑布图 + 屏幕截图 + 详细时序；`artifacts.traces` 含完整 Chrome trace；外部工具用 `chrome://tracing` 打开。

**关键参数**：
- `artifacts.traces`
- largestContentfulPaint
- layoutShift events
- longtask
- 屏幕截图

**最佳实践**：分数低时**先**看 trace 定位；`lighthouse --view` 看完整报告；trace JSON 大（10MB+）存 S3；用 `speedline` 算 Speed Index；长任务 > 50ms 拆解。

### 模式 10 - lighthouse-ci + 持续监控

**问题场景**：上线后性能回归怎么监控？CI 怎么阻断 PR 引入低分？

**解决方案**：`@lhci/cli` 工具：① `lhci collect` 跑 + ② `lhci upload` 存到 server + ③ `lhci assert` 阻断 CI；`lighthouserc.js` 配 `assert: { assertions: [{ 'categories:performance': ['error', { minScore: 0.9 }] }] }`；`lhci server` 部署到公司内网 dashboard。

**关键参数**：
- `@lhci/cli`
- `collect/upload/assert`
- `lighthouserc.js`
- `minScore: 0.9`
- `lhci server` dashboard

**最佳实践**：GitHub Actions 配 `treosh/lighthouse-ci-action@v10`；`assert.assertions` 设硬阈值；`assertions` 比 `minScore` 更细（按 audit 维度）；`collect.numberOfRuns: 3` 取平均；`upload.target: 'lhci'` 存 server。

---

## 第三段：进阶范式

### 模式 11 - log-normal 评分（对数正态分布）

**问题场景**：FCP 1.5s 和 3.0s 体验差 10 倍，但分数差异要"非线性"映射。

**解决方案**：Lighthouse 5+ 改用 log-normal 分布：FCP 值取对数后用正态分布累计函数映射 0-100；中位数 P50=50 分；P10/P90 是关键阈值；每个 metric 独立 `logNormalScore` 公式。性能指标更贴合用户感知。

**关键参数**：
- log-normal 分布
- P50 中位数
- P10 / P90 阈值
- 累积分布
- metric 独立

**最佳实践**：理解 `metric.Score` 计算公式 = `logNormalCDF(value, median, p10ToP90Ratio)`；FCP P50=1.6s P10=0.8s；LCP P50=2.5s P10=1.2s；CLS P50=0.1 P10=0.01；TBT P50=200ms P10=100ms。

### 模式 12 - 评分加权（Category Weights）

**问题场景**：5 维度等权不合理（性能应该更重要）。

**解决方案**：`categories.performance.weight: 6 / accessibility: 1 / best-practices: 1 / seo: 1 / pwa: 0` 权重；总分 = `Σ(metric.score * weight) / Σ(weight)`；自定义权重覆盖默认；`groupWeight` 改组内 metric 权重。

**关键参数**：
- `weight` 权重
- `Σ(score * weight) / Σ(weight)`
- `groupWeight`
- 自定义覆盖
- 总分 0-100

**最佳实践**：电商业务 Performance 权重提到 8；A11y 业务 Accessibility 权重 8；`PWA: 0` 不用 PWA 关掉；自定义 category 配 `weight: 2` 加分；权重之和**不必**等于 1（归一化在计算时除以权重总和）。

### 模式 13 - Web Vitals 三件套

**问题场景**：Google 2020+ 主推 Core Web Vitals（LCP/FID/CLS），FID 后被 INP 替代。

**解决方案**：Core Web Vitals 3 件套：① LCP（Largest Contentful Paint）最大内容绘制 < 2.5s ② INP（Interaction to Next Paint）交互到下帧 < 200ms（替代 FID）③ CLS（Cumulative Layout Shift）累积布局偏移 < 0.1。Lighthouse 9+ 内置所有 Web Vitals 审计。

**关键参数**：
- LCP < 2.5s
- INP < 200ms
- CLS < 0.1
- Web Vitals
- 75th percentile

**最佳实践**：监控 75 百分位数（P75）**不要**平均值；INP 替代 FID（Lighthouse 10+）；Web Vitals 上报到 GA4 / Sentry；LCP 元素配 `<link rel="preload">`；CLS 配 `width/height` 防图片位移。

### 模式 14 - audit `details` + 优化建议

**问题场景**：分数低用户不知道怎么优化。

**解决方案**：每个 audit 有 `details: { type: 'list', items: [...] }` 列具体问题项；`opportunity` 类型显示预估节省（ms / KB）；`LighthouseOpportunity` 含 `numericValue / numericUnit / displayValue`；`Savings: 1.2s` 显示在报告。

**关键参数**：
- `details.type`
- `opportunity` 优化
- `numericValue` 数值
- `displayValue` 显示
- `scoreDisplayMode`

**最佳实践**：自定义 audit **必**填 `details` 给可执行建议；`scoreDisplayMode: 'metricSavings'` 显示节省；`opportunity` 配 `displayValue` 用户友好；`displayValue: 'Potential savings of 1,200 ms'`。

### 模式 15 - 完整 artifacts 协议

**问题场景**：自定义 gatherer 收集什么数据？自定义 audit 怎么消费？

**解决方案**：`artifacts` 类型：`NetworkRequests / Scripts / Trace / DevtoolsLog / Accessibility / MetaElements / ImageElements / LinkElements / Anchors / TagsBlockingFirstPaint / IframeElements / DoCumentElement / Manifest`；自定义 `class MyArtifact extends Gatherer` 输出到 artifacts；自定义 audit 读 `artifacts.myArtifact`。

**关键参数**：
- artifacts 协议
- `Gatherer` 钩子
- `startInstrumentation`
- `gather`
- `stopInstrumentation`

**最佳实践**：自定义 audit 走 `artifacts` 而**不是** `driver`（已被审计阶段不在线）；`@getArtifact` 缓存；artifacts 类型在 `types/artifacts.d.ts` 声明；用 `Array.prototype.filter` 简化审计逻辑。

---

## 第四段：实战范式

### 模式 16 - smoke test 10 行验证

**问题场景**：装好 lighthouse 验证能否跑通基础审计。

**解决方案**：10 行 smoke test：```js const lighthouse = require('lighthouse').default; (async () => { const result = await lighthouse('https://example.com', { port: 9222, output: 'json', logLevel: 'error' }); console.log('Performance:', result.lhr.categories.performance.score * 100); console.log('LCP:', result.lhr.audits['largest-contentful-paint'].displayValue); })(); ``` 期望：example.com Performance 95+ / LCP 0.6s 左右。

**关键参数**：
- 10 行核心验证
- `lighthouse(url, opts)` API
- score 0-1 乘 100
- `displayValue` 友好显示
- 30s 可跑完

**最佳实践**：新装 lighthouse 用 10 行 smoke test 验证"启动 Chrome + 跑 audit + 读 score"三件套；`logLevel: 'error'` 静默；测试本地 `http://localhost:3000`；CI 跑 example.com 校准。

### 模式 17 - GitHub Actions 集成

**问题场景**：PR 触发 Lighthouse 跑 + 阻断低分 + 上传报告。

**解决方案**：`.github/workflows/lhci.yml` 配 `treosh/lighthouse-ci-action@v10`；`url: ['https://staging.example.com/']` 审计 URL；`assert: true` 触发断言；`uploadArtifacts: true` 上传报告；`temporaryPublicStorage: true` 临时公开链接。

**关键参数**：
- `treosh/lighthouse-ci-action`
- `assert: true`
- `uploadArtifacts`
- `temporaryPublicStorage`
- `urls: [...]`

**最佳实践**：用 staging URL **不要**生产（避免 SEO 命中）；`assert.assertMatrix: 'lighthouse:default'` 跑默认；`budget.json` 配硬性指标；`if: github.event_name == 'pull_request'` 限定 PR；报告评论到 PR。

### 模式 18 - 监控 + 趋势分析

**问题场景**：性能随时间漂移（依赖升级、流量变化），单次分数不够。

**解决方案**：`lhci server` 部署 dashboard + 定时任务每日跑 + 时间序列存到 Prom/Grafana；`lighthouse --output=csv` 导 CSV 入库；`lighthouse-batch` 并发 100 URL；`@unlighthouse/cli` 整站扫描。

**关键参数**：
- `lhci server`
- 时间序列
- `output=csv`
- `lighthouse-batch`
- `@unlighthouse/cli`

**最佳实践**：每日定时 cron 跑；分数趋势告警 7 天平均 < 阈值；CSV 入 BigQuery / ClickHouse；`@unlighthouse/cli` 整站扫描发现长尾问题；配合 Sentry 性能告警。

### 模式 19 - vs WebPageTest / PageSpeed Insights 选型

**问题场景**：3 个 Web 性能工具（Lighthouse / WebPageTest / PageSpeed Insights）。

**解决方案**：Lighthouse 30k+ star + 自动化 + CI 集成 + 开源；WebPageTest 学术 + 真实地理位置 + 视频录制 + 高级配置；PageSpeed Insights Google 官方 + 综合 Lighthouse + CrUX 真实用户数据。Lighthouse 是 CI 自动化首选，PageSpeed Insights 是日常监测。

**关键参数**：
- Lighthouse 自动化
- WebPageTest 学术
- PageSpeed Insights CrUX
- 真实用户数据
- 视频录制

**最佳实践**：CI 自动化**用** Lighthouse（API + 集成）；生产监控**用** PageSpeed Insights（CrUX 真实用户数据）；深度分析**用** WebPageTest（视频 + 多地点）；3 工具结合最全面。

### 模式 20 - 7 天复刻 mini-lighthouse

**问题场景**：学习用，想搭一个简化版 Lighthouse 理解核心。

**解决方案**：7 天分 5 步：① Day 1-2 Puppeteer 启动 Chrome + 跑通 CDP ② Day 3 Gatherer 收集 NetworkRequests + Trace ③ Day 4 Audit 算 FCP/LCP/CLS 3 指标 ④ Day 5 评分 log-normal + 报告输出 ⑤ Day 6-7 加 a11y/seo/best-practices 维度。

**关键参数**：
- Day 1-2 Puppeteer
- Day 3 Gatherer
- Day 4 Audit
- Day 5 评分
- 7 天最小可用

**最佳实践**：复刻 Lighthouse 先求"最小可跑内核"再迭代；7 天只够做 60% 场景的简化版；**完整 5 维度 + 100+ audits + log-normal + 报告需要 3 个月+**；适用任何"性能审计学习"。
