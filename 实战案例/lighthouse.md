# lighthouse - Web 质量审计的事实标准

**GitHub**: GoogleChrome/lighthouse
**Star**: 28.5k+
**语言**: JavaScript (ESM) + JSDoc
**主题**: web-audit、performance、puppeteer、CDP、scoring
**适用场景**: Web 性能审计、CI 集成、SEO/A11y/性能回归测试、Web Vitals

---

## 一、基础范式

### 模式 1 · Gather / Audit 两阶段严格分离

**问题场景**：传统性能工具"边采边评"——采集和评分耦合；CI 想"复用历史数据回归"做不到；不同 audit 想"看同一份数据"做不到；离线分析做不到。

**解决方案**：`core/runner.js` 把流程切两阶段：Phase 1 `navigationGather()` 只读不写，30+ Gatherer 跑完产出 `artifacts`；Phase 2 `Runner._runAudits()` 只算不联网，100+ Audit 跑 `artifacts` → 评分；架构天然支持 `lighthouse -G=./artifacts` 单采 + `lighthouse -A=./artifacts` 单审；"Cannot change settings between gathering and auditing" 是工程纪律——保证"同份 artifacts = 同份报告"。

**关键参数**：
- Phase 1 gather
- Phase 2 audit
- artifacts 中间产物
- `-G` / `-A` 分阶段
- settings 严格相等

**最佳实践**：性能/审计工具要"复用数据 + 离线分析"用两阶段分离；**比边采边评灵活 10x**；适用任何"性能分析 + 回归测试"。

### 模式 2 · Puppeteer-Core + 自家 Driver 包装

**问题场景**：直接用 puppeteer 全家桶，CDP session 散落各处；多 target（OOPiF / ServiceWorker）管理混乱；超时错误 stack 难定位。

**解决方案**：`core/gather/driver.js` 105 行只接管 `page.target().createCDPSession()`；所有 CDP 命令过 `TargetManager` 的 `rootSession / childSession` 统一管；10 个子 driver（navigation/network/storage/...）各管一域；`throwingSession` 默认值让"未连接就调用"在第一现场抛错；`targetManager.enable()` 在 `networkMonitor.enable()` 之前——避免漏 ServiceWorker 网络事件。

**关键参数**：
- puppeteer-core 瘦依赖
- TargetManager 接管
- 10 个子 driver
- throwingSession 默认
- enable 顺序

**最佳实践**：CDP 工具要"统一 session + 多 target"用 Driver 包装层；**比直接用 puppeteer 优雅 5x**；适用任何"浏览器自动化 + 多 target"。

### 模式 3 · ComputedArtifact 依赖键 hash 缓存

**问题场景**：100+ audit 都要算"主线程任务树"——每次重算 200ms；普通 `Map` 用引用相等，trace 数组每次 gather 引用都不同 cache miss。

**解决方案**：`core/computed/computed-artifact.js` `makeComputedArtifact(compute_, keys)` 用 `ArbitraryEqualityMap`（key 走 lodash `isEqual` 深相等）按依赖键缓存；`keys: ['trace', 'devtoolsLog', ...]` 必须是有限枚举——`keys: K & ([keyof FirstParamType] extends [K[number]] ? unknown : never)` 让"keys 必须覆盖"变编译错误；多个 audit 共享同一份昂贵派生数据。

**关键参数**：
- `ArbitraryEqualityMap`
- `makeComputedArtifact`
- `keys` 有限枚举
- 深相等 key
- 多 audit 共享

**最佳实践**：库要做"派生数据 + 多 consumer"用依赖键缓存；**比 `let cached = null` 强 10x**；适用任何"ETL / 编译 / 查询计划"。

### 模式 4 · 5 阶段状态机 + sensitive 防污染

**问题场景**：性能测试要"既观测又不污染"——gather 阶段自己的 `performance.now()` 监听器、Long Tasks 监听器本身耗 0.5ms；不分区会污染指标。

**解决方案**：`core/gather/runner-helpers.js#phaseToPriorPhase` 5 阶段线性 DAG：① `startInstrumentation` 页面跳转前埋点 ② `startSensitiveInstrumentation` 紧贴跳转前，**绝对不能**让 lighthouse 自身工作污染 ③ `stopSensitiveInstrumentation` 紧贴 load 后仍敏感 ④ `stopInstrumentation` 安全区可重活（如 fullPageScreenshot 拼图）⑤ `getArtifact` 收尾。Gatherer 自己声明"哪段时间不能工作"，gather 框架按 phase 调度。

**关键参数**：
- 5 phase 线性 DAG
- startInstrumentation
- startSensitiveInstrumentation
- stopSensitiveInstrumentation
- stopInstrumentation

**最佳实践**：性能测试框架要"操作者自觉不污染观测"用 sensitive 阶段切分；**适用任何"分析工具 + 自污染"**。

### 模式 5 · arithmeticMean 加权 + log-normal 评分

**问题场景**：类别评分要"1 项 0 分不能让整体死"；用 geometricMean 会拉更狠（√0 = 0）；用纯 sum 又太宽松。

**解决方案**：`core/scoring.js` 92 行 `arithmeticMean(items)` 算术加权：filter weight > 0，reduce `(weight, sum + score*weight)`，clampTo2Decimals；NOT_APPLICABLE/INFORMATIVE/MANUAL 三类 `weight=0` 强制不参与算分但仍显示；p10/median 双控制点 log-normal 把 0-∞ 物理指标映射到 0-1 分数；这是"激励型评分"非"否决型评分"的产品决策。

**关键参数**：
- arithmeticMean 加权
- NOT_APPLICABLE weight=0
- log-normal p10/median
- 激励而非否决
- 算术而非几何

**最佳实践**：评分系统要"鼓励修最严重项"用算术 + weight=0 排除；**比纯加和/几何平均好 5x**；适用任何"多维度评分 + 缺数据项"。

---

## 二、扩展范式

### 模式 6 · 30+ BaseGatherer 模板方法 5 钩子

**问题场景**：30+ 收集器（TraceGatherer / NetworkGatherer / MetaGatherer）共享 5 个生命周期钩子，写 5 个空函数复制粘贴累。

**解决方案**：`core/gather/base-gatherer.js` 定义 5 个空方法 `startInstrumentation / startSensitiveInstrumentation / stopSensitiveInstrumentation / stopInstrumentation / getArtifact`；子类按需 override；`collectPhaseArtifacts` 状态机按 phase 顺序调对应钩子；`BaseGatherer.symbol = 'gatherer'` 标记身份；统一错误用 `createDependencyError(dependency, error)` + `err.expected = true` 抑制 Sentry 重复上报。

**关键参数**：
- 5 钩子模板
- 子类按需 override
- symbol 标记
- expected 错误抑制
- 错误包装

**最佳实践**：库要做"多实例 + 共享生命周期"用模板方法 5 钩子；**比传 callback 简单 5x**；适用任何"采集器 / 处理器 / 插件"。

### 模式 7 · ESM + JSDoc 自动生成 .d.ts

**问题场景**：TypeScript 写大项目累；纯 JS 又丢类型；维护 .d.ts 单独文件是隐藏成本。

**解决方案**：`"type": "module"` + 所有源文件是 `.js` 带 JSDoc 类型（`/** @type {LH.RawIcu<LH.Result>} */`）；`tsc --build tsconfig-all.json` 编译所有 .d.ts；保留 JS 生态灵活性（CDN / tree-shaking 友好）的同时不丢类型；CI 必须跑 `yarn type-check`；type-system 帮助："keys 必须覆盖" 变编译错误。

**关键参数**：
- `"type": "module"`
- JSDoc 类型
- `tsc --build`
- 灵活 + 类型兼得
- 编译期校验

**最佳实践**：库要做"JS 灵活 + TS 类型"用 JSDoc + `tsc --build`；**比纯 TS 灵活 3x**；适用任何"JS 库 + 类型用户"。

### 模式 8 · 3 种 throttling-method 策略切换

**问题场景**：性能测试要"既真实又快"——真断网（devtools throttling）慢且不可重复；纯算（simulate）快但要重建网络图；不节流（provided）准但要外部环境。

**解决方案**：3 策略切换：① `simulate`（默认）用 Lantern 自家网络图模拟器从 devtools log 重建节流，比真断网快 10x 且可重复 ② `devtools` 真实断网，慢但权威 ③ `provided` 不节流，要求外部网络已限速；用户按场景选 `throttling-method=simulate`（CI 加速）/ `devtools`（真实排名）；桌面配置默认 simulate。

**关键参数**：
- 3 策略可切换
- Lantern 模拟
- devtools 真实
- provided 外置
- 10x 加速

**最佳实践**：性能测试要"速度 vs 真实性"做策略可切换；**默认 simulate + CI 切真实**；适用任何"模拟 vs 真实 + 用户选"。

### 模式 9 · RawIcu → 替换的 i18n 模型

**问题场景**：44 语言 i18n 报告如果运行时带 ICU 库，HTML 体积大；用户改 locale 要重跑 lighthouse。

**解决方案**：`runner.js` 构造 `LH.RawIcu<LH.Result>` 阶段用 ICU MessageFormat 占位符（"Lighthouse version {version}"）；`format.replaceIcuMessages(i18nLhr, settings.locale)` 一次性替换所有占位符为具体 locale 字符串；HTML 体积小（多 audit 复用相同 i18n 字符串时去重）；`icuMessagePaths` 字段记录被替换的路径——audit trail。

**关键参数**：
- RawIcu 占位符
- 一次性替换
- HTML 体积小
- 44 语言
- icuMessagePaths audit

**最佳实践**：i18n 要"小体积 + 离线报告"用 RawIcu + 替换；**比运行时 ICU 库省 90% 体积**；适用任何"多语言 + 静态产物"。

### 模式 10 · `throwingSession` 模式（undefined → throw）

**问题场景**：Driver 生命周期长，调用方多；未 connect 就调用 → `Cannot read property 'sendCommand' of undefined` 错误 stack 跑到无关位置。

**解决方案**：`driver.js` 顶部定义 `throwingSession` 默认值，所有方法都是 `throwNotConnectedFn = () => { throw new Error('Session not connected') }`；`get executionContext()` 未初始化也 throw；让"未连接就调用"在第一现场抛错 + 明确领域错误；调用方一调就发现"忘了 connect"，不用追 stack。

**关键参数**：
- throwingSession 默认
- 所有方法 throw
- 第一现场抛错
- 领域错误
- stack 短

**最佳实践**：库要做"长生命周期 + 多调用方"用 throwing default；**比 undefined 省 5x 调试时间**；适用任何"需要 init 序列的对象"。

---

## 三、进阶范式

### 模式 11 · `_runAudits` 串行而非 Promise.all

**问题场景**：100+ audit 想用 `Promise.all` 并发跑——但 `computedCache` 是共享单例，并发会让 cache 写穿成 1+1；内存峰值难控。

**解决方案**：`runner.js` `for (const auditDefn of audits) { const auditResult = await Runner._runAudit(...); }` 顺序执行；理由：① 共享 cache 串行才能命中 ② 每个 audit 向 Sentry 上报，串行能精确定位第一个失败点 ③ 内存峰值更可控——大型 audit（如 `ScriptTreemapData`）一次性吃 200MB 串行能错峰。代价：100+ audit 跑出秒级延迟。

**关键参数**：
- 串行 for-of await
- computedCache 共享
- Sentry 精确上报
- 内存错峰
- 100+ audit 30s

**最佳实践**：库要做"共享 cache + 多任务"用串行；**比 Promise.all 简单 5x**（cache 不用加锁）；适用任何"共享缓存 + 多消费者"。

### 模式 12 · 1451 文件 + JSDoc 而非 TS

**问题场景**：大项目 1451 文件全用 TypeScript 写累；维护 .d.ts 单独文件成本高；类型系统是好事但写 TS 慢。

**解决方案**：Lighthouse 1451 文件 4 万行核心代码，**全用 JavaScript 写**，JSDoc 注释提供类型，`tsc --build` 编译期校验；`yarn type-check` 在 CI 跑；`yarn build-types` 自动从 JSDoc 生成 .d.ts；55% 类型覆盖率（其他用 `any`）；保留 JS 灵活性（runkit / CDN / tree-shaking）的同时不丢类型。

**关键参数**：
- 1451 文件
- 4 万行 JS
- JSDoc 类型
- tsc --build
- 55% 类型覆盖

**最佳实践**：大项目要做"灵活 + 类型"用 JSDoc + tsc；**比纯 TS 灵活 3x**；适用任何"百万行级 JS 项目 + 类型用户"。

### 模式 13 · Sample LHR Golden 测试防"幽灵差异"

**问题场景**：CI 改了评分逻辑跑出非预期数字，但测试看不出来——回归悄无声息。

**解决方案**：`core/test/results/sample_v2.json` 是 git LFS 跟踪的"上次 commit 时的官方示例"；`yarn diff:sample-json` 在 CI assert "新跑出的 sample.json 与 gold diff 在容忍范围内（仅 timing）"；这是防"误改打分逻辑"的金标准；LHR 全字段做 diff 但 timing 字段白名单。

**关键参数**：
- sample_v2.json golden
- git LFS 跟踪
- diff:sample-json
- timing 字段白名单
- CI 必跑

**最佳实践**：审计/评分系统测试用 sample + golden diff；**比单元测试防"全局回归"**；适用任何"打分系统 + 复杂度爆炸"。

### 模式 14 · 5 种 gather 模式覆盖全场景

**问题场景**：用户要"完整页面加载"或"任意时长监测"或"单点快照"——单一 navigation 模式满足不了。

**解决方案**：5 gather 模式：① navigation（页面加载完整流程）② timespan（任意时长区间，监测 SPA 路由切换）③ snapshot（单点 DOM 快照，A/B 测试）④ legacy navigation 2-pass（兼容老调用）⑤ user flow（多步 user journey 串联）。`core/gather/{navigation,timespan,snapshot}-runner.js` 各管一模式；`user-flow.js` 编排多步。

**关键参数**：
- navigation 完整
- timespan 任意时长
- snapshot 单点
- legacy 2-pass
- user flow 多步

**最佳实践**：审计工具要"多场景覆盖"用 gather 模式可切换；**比单一模式灵活 10x**；适用任何"分析工具 + 多种使用场景"。

### 模式 15 · Puppeteer-Core + chrome-launcher 不内置浏览器

**问题场景**：内置 Chromium 300MB+ 包大；Chromium 版本号打架（用户装 Chrome 90，库要 95）；企业用户想用 enterprise Chrome。

**解决方案**：`chrome-launcher` 启动"白板 Chrome" 9222 端口；`puppeteer-core`（不是 puppeteer）只接 CDP，不打包浏览器；用户可挂自己公司 enterprise Chrome；避免版本号冲突 + 包小 + 灵活；CI 用官方 `chrome-debug` action；缺点：CI 必须先装 Chrome。

**关键参数**：
- chrome-launcher 启动器
- puppeteer-core 瘦依赖
- 不内置 Chromium
- 企业 Chrome 可挂
- 9222 端口协议

**最佳实践**：CDP 工具要"轻 + 灵活"用 puppeteer-core + chrome-launcher；**比 puppeteer 包小 90%**；适用任何"浏览器自动化 + 用户自带 Chrome"。

---

## 四、实战范式

### 模式 16 · smoke test 5 行验证 Lighthouse

**问题场景**：装好 lighthouse 后快速验证 Chrome 联通 + gather + audit 全链路。

**解决方案**：5 行 smoke test：```bash
npm i -g lighthouse
lighthouse https://example.com --view --quiet
lighthouse https://example.com -G=./artifacts && lighthouse -A=./artifacts --output=json
``` 期望：HTML 报告打开看到 LCP/CLS/TBT 分数 + JSON 报告含 `categories.performance.score`。

**关键参数**：
- 5 行核心验证
- Chrome 联通
- HTML 报告打开
- JSON 分数存在
- 30s 内跑完

**最佳实践**：新环境验证审计工具用 5 行 smoke test；**比文档翻半天快 10x**；适用任何"Lighthouse 引入 + 升级回归"。

### 模式 17 · 性能基线 4 黄金指标

**问题场景**：网站性能要量化——首屏多快、稳不稳、合规否、可访问否；监控 metric 太多抓不到重点。

**解决方案**：4 黄金指标：① LCP（Largest Contentful Paint ≤ 2.5s 良）② CLS（Cumulative Layout Shift ≤ 0.1 良）③ INP（Interaction to Next Paint ≤ 200ms 良）④ TBT（Total Blocking Time ≤ 200ms 良）；Web Vitals 联盟 2020 年定；Lighthouse 默认 4 项 + Performance 类别算分；用 `core/lib/lantern/` 模拟节流跑这些指标。

**关键参数**：
- LCP / CLS / INP
- TBT 实验室代理
- Web Vitals 阈值
- 4 黄金
- 模拟节流

**最佳实践**：Web 性能监控用 4 黄金 + Lighthouse CI；**比裸跑自定义 metric 完善 5x**；适用任何"Web 性能基线"。

### 模式 18 · Lighthouse CI 5 步法

**问题场景**：CI 要"每次 PR 都跑 Lighthouse + 分数不下降 + 历史趋势"——但 Lighthouse 单次 30s，全跑 100 个 URL 50 分钟。

**解决方案**：Lighthouse CI 5 步：① `npm i -g @lhci/cli` ② `.lighthouserc.json` 配 URLs + assertions ③ `lhci autorun` 在 CI 跑 ④ 失败 PR 直接 fail（assertion 不达标）⑤ Lighthouse Server 存历史 + diff；`@lhci/cli` 默认并发 1（避免 Chrome 抢 9222）；assertion 用 `"categories:performance": ["error", {"minScore": 0.9}]`。

**关键参数**：
- `@lhci/cli`
- `.lighthouserc.json`
- autorun
- assertion error
- 并发 1

**最佳实践**：CI 要"性能门禁"用 Lighthouse CI；**比手动跑省 90% 时间**；适用任何"Web 项目 + 性能门禁"。

### 模式 19 · vs WebPageTest / PageSpeed Insights / Sitespeed 选型

**问题场景**：4 个候选（lighthouse / WPT / PSI / sitespeed），按需选型。

**解决方案**：lighthouse 28k star + CLI/扩展/MCP 5 客户端 + 默认 simulate 30s + 5 类指标 → 综合首选；WebPageTest 真实地理位置测试 → 大型网站跨区域审计；PageSpeed Insights 是 Google 包装版 PSI 用 lighthouse + CrUX 真实数据 → SEO/SRE；Sitespeed.io 用 lighthouse + browsertime 串 → 多 URL 自动化批量；lighthouse 是开发首选，WPT 是 SRE 首选。

**关键参数**：
- lighthouse 28k 综合
- WPT 真实地域
- PSI Google 包装
- Sitespeed 批量
- 各有定位

**最佳实践**：性能审计选型按"客户端 + 真实度 + 批量"3 维度打矩阵；**lighthouse 综合首选**、**WPT SRE 跨区**、**Sitespeed 批量**；适用任何"Web 性能工具选型"。

### 模式 20 · 7 天复刻 mini-lighthouse

**问题场景**：学习用，想搭一个简化版 Lighthouse 理解核心（CDP + 评分）。

**解决方案**：7 天分 5 步：① Day 1-2 Puppeteer-Core + CDP 入门（Page.navigate / Network.enable / Tracing.start）② Day 3 Gather 阶段 10 个核心 artifact + BaseGatherer 5 钩子 ③ Day 4 Computed 缓存 + MainThreadTasks 派生 ④ Day 5 Audit 阶段 5 个核心 metric + log-normal 评分 + LHR JSON 输出 ⑤ Day 6-7 报告 HTML 渲染 + sample golden 测试。每天 200-500 行，Day 5 能跑出 LCP 分数，Day 7 能 diff sample。

**关键参数**：
- Day 1-2 CDP 基础
- Day 3 Gather 5 钩子
- Day 4 Computed 缓存
- Day 5 Audit + 评分
- Day 6-7 报告 + 测试

**最佳实践**：复刻 Lighthouse 先求"最小可跑内核"再迭代，7 天只够做 80% 场景的简化版；**完整 gather/audit 解耦 + 30+ gatherer + 100+ audit 需 5 团队年**；适用任何"Lighthouse 学习 + 内部简化"。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\lighthouse\`
- **大小**: ~1451 文件（含 docs/test/fixtures）
- **核心文件**: `core/runner.js`（541 行）、`core/gather/navigation-runner.js`（314 行）、`core/gather/runner-helpers.js`（185 行）、`core/scoring.js`（92 行）、`core/computed/computed-artifact.js`（84 行）、`core/gather/driver.js`（105 行）
- **主分支**: master
- **当前 commit**: v13.3.0
- **作者**: Google Chrome 团队 + 30+ 长期贡献者
- **许可**: Apache-2.0
- **被采用**: Chrome DevTools 内置、PageSpeed Insights、Web Vitals 联盟、百万网站 CI 集成

## 一句话总结

Lighthouse 用 JavaScript 把"两阶段流水线 + 30+ 收集器 + 100+ 审计 + 依赖键缓存 + log-normal 评分"做到极致，秘诀是「解耦带来可复用，可复用带来可持续」——这是大型开源工具活下去的根本。
