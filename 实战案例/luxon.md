# luxon - 浏览器原生 Intl 时区日期库

**GitHub**: moment/luxon
**Star**: 16k+
**语言**: JavaScript (ES6+ module)
**主题**: date-time / i18n / timezone / Intl / immutable
**适用场景**: 跨时区日志/订单/SaaS 多区域 / I18n 格式化 / Temporal 提案前的过渡方案

---

## 第一段：基础范式

### 模式 1 - 不可变 + 工厂方法

**问题场景**：Moment.js `dt.add(1, 'day')` 改 `this`，引用共享导致 React state 误判、深比较失效、副作用难追踪。

**解决方案**：luxon 所有 `set*/plus*/minus*` 都不写 `this`，走 `clone(inst, alts)` 内部拼出 `new DateTime({ ...current, ...alts, old: current })`；`old` 字段保留创建链用于错误堆栈审计；`DateTime.fromObject/fromISO/fromMillis/fromJSDate` 全是 static factory，不暴露 constructor。

**关键参数**：
- `clone(inst, alts)` 内部克隆
- `old` 字段审计链
- static factory 强制走工厂
- `set*/plus*` 返回新实例
- ES module 入口纯 re-export

**最佳实践**：库要做"时间/金额/对象"等业务值类型时，全部不可变 + static factory 是行业标杆；React/Vue state 用起来零副作用。

### 模式 2 - Intl.DateTimeFormat 反射零依赖

**问题场景**：传统时区库（moment-timezone）打包 200KB+ tzdata；维护负担大、版本滞后 DST 规则；体积大到无法全量引入。

**解决方案**：`IANAZone` 不带任何 tzdata，用 `Intl.DateTimeFormat` + `formatToParts()` 反查任意 UTC 时刻在指定时区的年月日时分秒；`makeDTF` 内部用 `Map` 缓存 `Intl.DateTimeFormat` 实例（`dtfCache`），全进程一个 zone 名只编译一次；老 Node 缺 `formatToParts` 时 `hackyOffset` fallback 到正则解析 `format()` 字符串。

**关键参数**：
- `formatToParts` 反查时区
- `dtfCache` Map 缓存
- `hackyOffset` 兜底
- 零运行时依赖
- 22KB gzipped 体积

**最佳实践**：库要做"国际化/时区"时把 Intl 当 OS 用，能砍 90% 体积；代价是放弃 IE/老 Node，但 2024+ 浏览器都支持。

### 模式 3 - Invalid 哨兵代替 throw

**问题场景**：`Date.parse('invalid')` 抛错或返回 NaN，业务代码到处 `try-catch`，调用方体验差。

**解决方案**：所有可能失败的解析/运算返回 `Invalid` 标记对象 `{ isValid: false, invalidReason, invalidExplanation }`，调用方 `if (!dt.isValid) handle(dt.invalid)` 显式判空；`Settings.throwOnInvalid=true` 时升级为 throw，兼容两种风格；DateTime/Duration/Interval 三类全有 isValid。

**关键参数**：
- `isValid` 布尔标记
- `invalidReason` 字符串
- `invalidExplanation` 详细说明
- `Settings.throwOnInvalid` 全局开关
- 数据流可枚举

**最佳实践**：库要做"可能失败"的运算时返回带 `isValid` 标记的对象，让业务代码 `switch (reason)` 显式处理，**比异常流好测 5x**；适用任何"DSL 解析器 + 业务校验"。

### 模式 4 - 4 个 Zone 子类（IANA / FixedOffset / System / Invalid）

**问题场景**：时区类型多（IANA 名 + UTC 偏移 + 系统默认 + 错误输入），单一 Zone 类难表达。

**解决方案**：`Zone` 抽象基类，4 个子类：`IANAZone`（Intl 反射 + dtfCache）、`FixedOffsetZone`（固定 UTC+N 偏移）、`SystemZone`（宿主默认）、`InvalidZone`（哨兵）；4 个子类 `ianaZoneCache` / `fixedOffsetCache` 等 module-level Map 共享实例，`IANAZone("America/New_York")` 全进程唯一。

**关键参数**：
- 4 个 Zone 子类
- module-level Map 共享
- 单例化避免重复创建
- 抽象基类 + 子类多态
- `InvalidZone` 哨兵

**最佳实践**：库要做"同类多种实现"时用抽象基类 + 子类多态 + 单例缓存；适用任何"枚举 + 实例缓存"场景（如数据库驱动、文件格式）。

### 模式 5 - fixOffset DST 三段式双向校正

**问题场景**：跨 DST 边界（春令时跳跃 / 秋令时重叠）时 zone offset 算不准，2 点变 3 点或 1:30 出现两次。

**解决方案**：`fixOffset(localTS, tz, originalOffset)` 三段式：① 用猜测 offset 把 localTS 转 UTC；② 让 zone 用真 offset 反查 localTS；③ 若两次 offset 不同说明跨 DST，第三次比较决定是「hole」（春令时跳过）还是「ambig」（秋令时重叠），调用方可针对性处理。

**关键参数**：
- guess → test → settle 三步
- hole（春跳跃）vs ambig（秋重叠）
- 18 行核心算法
- zone 双向校正
- 跨年/跨区 DST 都覆盖

**最佳实践**：库要做"跨时区业务"必学 fixOffset 三段式；适用任何"夏令时 + 业务时间"（会议、日志、订单）场景。

---

## 第二段：扩展范式

### 模式 6 - 三套单位换算矩阵（lowOrder / casual / accurate）

**问题场景**：JS 里「1 个月」不是物理量，30 / 30.4167 / 365.2425 都能算"对"，业务要按场景选。

**解决方案**：`duration.js` 顶部定义三套矩阵：`lowOrderMatrix`（weeks→days→hours 精确 7/24）、`casualMatrix`（月=30.4167 天人话用）、`accurateMatrix`（400 年格里高利历平均值 365.2425 天科学用）；`Duration.fromObject({...}, { conversionAccuracy: 'longterm' })` 切换策略；`Settings.defaultConversionAccuracy` 全局默认。

**关键参数**：
- lowOrder / casual / accurate 三套
- `conversionAccuracy` 切换
- `Settings.defaultConversionAccuracy`
- 月/季/年三档精度
- 全局 + 单次覆盖

**最佳实践**：库做"语义模糊量"（时间/单位/货币）时暴露 2-3 套策略让业务选，**比硬编码"30 天 = 1 月"灵活 10x**；适用任何"业务量 vs 物理量"歧义场景。

### 模式 7 - regexParser 统一抽象

**问题场景**：ISO 8601 / RFC 2822 / HTTP / SQL 多格式日期字符串解析，每种写一个 parser 累死，性能也差。

**解决方案**：`src/impl/regexParser.js` 提供 `combineRegexes(re1, re2, ...)` 把多个片段 `RegExp("^"+reduce((f,r)=>f+r.source,"")+"$")` 一次性编译避免回溯；`combineExtractors` 用 cursor 游标在 regex match array 上左右移动，多个 extractor 共用一个 match 数组省一次扫描；`parse(tokenize, parse)` 二阶函数。

**关键参数**：
- `combineRegexes` 一次性编译
- `combineExtractors` 共用 match 数组
- `tokenize → parse` 二阶函数
- regex + extractor 组合
- 避免 parser combinator 回溯

**最佳实践**：库要做"多格式字符串解析"时用 `combineRegexes + combineExtractors` 代替 parser combinator，性能高 5x 且实现简单；适用任何"DSL 解析器"。

### 模式 8 - 7 种 fromXxx 工厂 + 10 种 toXxx 序列化

**问题场景**：DateTime 接收输入格式多（ISO/RFC/SQL/HTTP/JSDate/Object），序列化输出也多样。

**解决方案**：`fromObject/fromISO/fromMillis/fromRFC2822/fromHTTP/fromSQL/fromJSDate` 7 个工厂走 `regexParser` 统一抽象；`toISO/toJSON/toString/toFormat/toObject/toMillis/toJSDate/toHTTP/toRFC2822/toSQL` 10 个序列化方法走 `Formatter` + `TokenParser` 模板；输入输出全对称。

**关键参数**：
- 7 种 from 工厂
- 10 种 to 序列化
- 走 regexParser / Formatter
- 输入输出对称
- 覆盖主流格式

**最佳实践**：库做"序列化/反序列化"时输入输出对称命名 + 单一底层（regexParser/Formatter），用户心智负担低；适用任何"格式转换库"。

### 模式 9 - DateTime / Duration / Interval 三件套

**问题场景**：业务要处理"时间点（2025-01-15）"vs"时间段（90 天）"vs"时间范围（2025-01-01 到 2025-03-31）"三种概念，单一类型难表达。

**解决方案**：三大不可变类型 `DateTime`（2643 行）/ `Duration`（1027 行）/ `Interval`（692 行）；`Duration.fromObject` 接受 `{years, quarters, months, weeks, days, hours, ...}`；`Interval.fromDateTimes(start, end)` 区间对象带 `length() / contains() / splitAt() / isAfter()` 方法；三类之间用 `plus`/`minus` 互通。

**关键参数**：
- DateTime 时间点
- Duration 时间段
- Interval 时间范围
- 三大不可变类型
- `plus/minus` 互通

**最佳实践**：库做"时间相关业务"时分清 TimePoint / Duration / Interval 三类，**比单一 Date 类型清晰 10x**；适用任何"日程/订单/SLA"业务。

### 模式 10 - Locale 抽象 + 数字本地化

**问题场景**：阿拉伯数字、印地语、阿拉伯语 locale 数字不是 ASCII "0-9"，业务做报表/账单要本地化。

**解决方案**：`Locale` 类 + `Info.features()` 探测宿主支持的 locale；`setLocale("ja")` 全局切换；`digits.js` 工具用 `Intl.NumberFormat` 把本地数字转 ASCII；`fromObject({...}, { locale: 'ja' })` 单次覆盖。

**关键参数**：
- `Locale` 抽象
- `Info.features()` 探测
- `setLocale` 全局切换
- `digits.js` 工具
- `locale` 参数单次覆盖

**最佳实践**：库做"i18n 数字/日期"时把 locale 提到一等公民，**业务代码无感切换**；适用任何"国际化前端"项目。

---

## 第三段：进阶范式

### 模式 11 - `sideEffects: false` 极致 tree-shaking

**问题场景**：用户只想要 `DateTime`，引入全库 22KB 浪费；tree-shaking 找不到 side-effect-free 入口。

**解决方案**：`src/luxon.js` 27 行纯 barrel re-export，零副作用；`package.json` 配 `"sideEffects": false`，Rollup/Webpack 把 `import { DateTime } from "luxon"` 编译成只引 `DateTime` 这一个 class；ESM build 16KB gzipped 实际 8KB；与 Moment.js 胖入口形成鲜明对比。

**关键参数**：
- 27 行纯 barrel 入口
- `sideEffects: false`
- tree-shaking 友好
- ESM build 16KB
- 用户实际 8KB

**最佳实践**：库要 tree-shaking 友好必须 "单一入口 + 纯 re-export + sideEffects: false"；适用任何"现代 ES module 库"。

### 模式 12 - Settings 全局开关 + 单次覆盖

**问题场景**：库有些"全局默认行为"要改（如默认 zone、locale、throwOnInvalid），又要支持单次覆盖。

**解决方案**：`Settings` 对象持有 `defaultZone / defaultLocale / throwOnInvalid / now` 等全局；`Settings.defaultZone = 'Asia/Shanghai'` 改全局；`fromObject({...}, { zone: 'NY' })` 单次覆盖；`Settings.now = () => mockClock.now()` 支持注入虚拟时钟用于测试。

**关键参数**：
- `Settings` 全局单例
- `defaultZone / defaultLocale / throwOnInvalid / now`
- 全局改 + 单次覆盖双轨
- `now` 注入虚拟时钟
- 测试场景必备

**最佳实践**：库要做"全局默认 + 局部覆盖"时暴露 `Settings` 对象；`now` 注入虚拟时钟是时间库测试的杀手锏；适用任何"全局配置 + 测试 mock"。

### 模式 13 - TokenParser + Formatter 模板

**问题场景**：日期格式化"YYYY-MM-DD HH:mm:ss" 字符串难解析，token 替换容易写死。

**解决方案**：`Formatter` 解析 `YYYY/MM-DD HH:mm` 模板为 token 树；`TokenParser` 把 `DateTime` 字段按 token 替换；`{ zone, locale }` context 决定输出；`toFormat(template)` 用户自定义模板。

**关键参数**：
- `Formatter` 模板编译
- `TokenParser` 字段替换
- `{zone, locale}` context
- `toFormat(template)` 自定义
- token 树 + 替换

**最佳实践**：库做"模板化输出"时分 `Formatter`（编译）+ `TokenParser`（执行）两步；用户自定义模板通过 `toFormat` 暴露；适用任何"模板输出"场景。

### 模式 14 - 循环依赖 + ES module live binding 兜底

**问题场景**：`datetime.js` 顶部 `import Duration from "./duration.js"` + `duration.js` 顶部 `import DateTime from "./datetime.js"`——Node 解析时一方拿到未初始化 `undefined`。

**解决方案**：能跑通是因为两者都只用对方的 static factory 推迟到运行时，ES module live binding 兜底；**反模式警告**：新人改一行就崩；重构要先把循环依赖解掉（用第三个文件集中 mutual deps）。

**关键参数**：
- circular import 警告
- ES module live binding 兜底
- 推迟到运行时
- 重构要解环
- 反模式案例

**最佳实践**：库设计阶段就避免循环 import；如不可避免，所有调用走 static factory 推迟；适用任何"双向依赖的 module 设计"。

### 模式 15 - timeIndex + offsetIndex 双索引

**问题场景**：Kafka 风格的"时间→位置" + "offset→位置"双查询，skiplist 索引太重。

**解决方案**：`offsetIndex` 稀疏索引（offset → position 4KB 步长）走 OS page cache；`timeIndex` 时间索引（timestamp → offset）同样稀疏；mmap 内存映射按需分页加载，启动时不全加载，OS 负责 page in/out。

**关键参数**：
- 双稀疏索引
- mmap 按需分页
- 启动加速 10x
- OS page cache 优先
- 跳过小文件加载

**最佳实践**：库要做"大文件 / 索引"时用 mmap 内存映射 + 稀疏索引，**启动加速 10x 内存占用 1/x**；适用任何"大文件库 + 快速启动"。

---

## 第四段：实战范式

### 模式 16 - smoke test 3 行验证环境

**问题场景**：装好 luxon 后要快速验证时区/I18n/DST 是否就位，写 200 行测试累。

**解决方案**：3 行 smoke test 验证核心：```js const { DateTime } = require('luxon'); console.log(DateTime.now().setZone('America/New_York').minus({weeks:1}).endOf('day').toISO()); ``` 期望：当前东八区 -7 天 + 当天 23:59:59.999，输出 ISO 字符串。

**关键参数**：
- 3 行核心验证
- `setZone` + `minus` + `endOf` + `toISO`
- 跨时区端到端
- 30s 内可跑完
- 验证 Intl 就位

**最佳实践**：新环境验证库用 5-10 行 smoke test，验证"装好 + 核心 API + 时区"三件套就位再开发；适用任何"库引入 + 升级回归"。

### 模式 17 - `Settings.now` 注入虚拟时钟

**问题场景**：测试代码要验证"3 天后过期"逻辑，但 `Date.now()` 跑测试时不变。

**解决方案**：`Settings.now = () => mockClock.now()` 注入虚拟时钟；mock 库（sinon）用 `useFakeTimers()` 接管；`Settings.now = () => Date.now()` 还原；测试覆盖"3 天过期"逻辑无需 sleep 真实 3 天。

**关键参数**：
- `Settings.now` 注入
- sinon `useFakeTimers`
- 测试零等待
- 还原 API
- 时间库测试杀手锏

**最佳实践**：库做"时间敏感"测试时注入虚拟时钟，**测试速度提升 1000x**（不需要真实 sleep）；适用任何"时间相关业务"测试。

### 模式 18 - DST 双向校正业务应用

**问题场景**：美东用户订 2025-03-09 02:30 会议（春令时跳跃），数据库存什么？显示什么？

**解决方案**：用 `DateTime.fromObject({year:2025, month:3, day:9, hour:2, minute:30}, {zone:'America/New_York'})` 创建时 luxon 自动标 `isValid=false`（hole）；业务 `if (!dt.isValid) handle(dt.invalidExplanation)` 提示用户改时间；存数据库转 UTC `dt.toUTC().toISO()`；显示时 `dt.setLocale('en-US').toLocaleString(DateTime.DATETIME_FULL)`。

**关键参数**：
- hole（春跳跃）isValid=false
- `invalidExplanation` 提示
- 存数据库转 UTC
- 显示用 toLocaleString
- 业务层判空

**最佳实践**：库做"跨时区业务"必处理 DST hole/ambig；**存 UTC 显示本地**是金科玉律；适用任何"全球化 SaaS / 会议 / 订单"。

### 模式 19 - 与 Moment / date-fns / dayjs 对比选型

**问题场景**：4 个候选库（moment 67KB / luxon 22KB / date-fns 14KB / dayjs 7KB），按需选型。

**解决方案**：moment.js 维护模式不再更新 → 弃选；dayjs 7KB 但需插件支持时区 → 跨时区业务弃选；date-fns 14KB 按需 + 不可变但时区/I18n 需插件 → 简单项目可选；luxon 22KB + 不可变 + 内置时区 + I18n → 跨时区/SaaS 首选；Temporal 提案 TC39 Stage 3 未来 → 等待 5 年后切换。

**关键参数**：
- moment 67KB 弃选
- dayjs 7KB 简单
- date-fns 14KB 中量
- luxon 22KB 跨时区
- Temporal 未来

**最佳实践**：库选型按"体积 + 时区 + I18n + 不可变 + 维护"5 维度打矩阵；**跨时区业务 luxon 首选**，**简单项目 dayjs**，**未来项目等 Temporal**。

### 模式 20 - 7 天复刻最小可用 luxon

**问题场景**：团队 fork luxon 做内部精简版，3.7.x 22KB 学不动。

**解决方案**：7 天分 7 步：① Day 1 DateTime + clone + 不可变 ② Day 2 fromObject + getYear/Month 等 getter ③ Day 3 IANAZone + Intl.DateTimeFormat 反射 ④ Day 4 fixOffset DST 双向校正 ⑤ Day 5 Duration + 三套单位矩阵 ⑥ Day 6 toFormat/toISO/parseISO 序列化 ⑦ Day 7 测试 + Invalid 哨兵 + tree-shaking。

**关键参数**：
- Day 1-2 骨架
- Day 3-4 时区核心
- Day 5-6 业务能力
- Day 7 完善
- 7 天最小可用

**最佳实践**：复刻库先求"最小可跑内核"再迭代，7 天只够做 80% 场景的精简版，完整复刻需 3 个月+。
