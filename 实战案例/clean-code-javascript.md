# clean-code-javascript - Robert C. Martin《Clean Code》JS 适配版，93k Star 知识库

**GitHub**: ryanmcdermott/clean-code-javascript
**Star**: 93k+
**语言**: JavaScript（示例） + Markdown（文档）
**主题**: 编程规范/Clean Code/知识库/教学
**适用场景**: JS 全栈开发者、Code Reviewer、团队 Lead、面试准备者、团队 onboarding 文档模板

## 第一段：基础范式

### 模式 1：单文件 README 而非多文件 Wiki

**问题场景**：知识库如何组织？分散文件 vs 单一文件？
**解决方案**：所有内容塞进一个 README.md（2387 行 60KB），不开 docs/、wiki/。入口唯一，clone 后立即可读，GitHub 全文搜索覆盖所有章节。
**关键参数**：
- 2387 行 / 60KB
- 无 src/ test/ examples/
- 锚点跳转（⬆）
- 翻译版 fork 单文件做 git diff
- 零构建零依赖
**最佳实践**：知识库优先单文件；clone 即可读胜于文档站。

### 模式 2：Bad/Good/Why 三段式教学法

**问题场景**：纯说教为什么效果差？
**解决方案**：每条原则都用 ❶ Bad ❷ Good ❸ Why 三段式呈现。读者瞬间理解"什么是反例"，对照阅读降低认知负担。
**关键参数**：
- 50+ Bad/Good 对照
- 三段式（反例/正例/论证）
- 反例来自真实代码 review
- 文字量翻 3 倍
- README 60KB 可接受
**最佳实践**：用"反例库"对照教学；纯说教效果差 10 倍。

### 模式 3：12 章按原则难度递进而非代码规模递进

**问题场景**：如何组织代码规范的章节顺序？
**解决方案**：从 Variables（最小）→ SOLID（最抽象）递进。前半是"如何写"，SOLID 是"如何设计"，后半是"如何运维"。
**关键参数**：
- 变量 → 函数 → 对象 → 类 → SOLID → 测试 → 并发 → 错误 → 格式 → 注释
- 入门到架构师
- 测试/并发/错误放 SOLID 之后
- 注释作为元规则
- 1-5 年工程师成长路径
**最佳实践**：教材按"难度递进"组织；新手从最小单元入门。

### 模式 4：60+ Bad/Good 代码示例的语言中立化

**问题场景**：JS 教程如何保持普适性？
**解决方案**：示例用 ES5 + ES6+ 对照，原则可移植到任何语言（命名/函数/SOLID/错误/注释都是普适的）。
**关键参数**：
- ES5 vs ES6+ 对照
- 50+ 例子
- 25+ 语言翻译
- 原则语言中立
- 实际是"工程哲学"非 JS 专属
**最佳实践**：原则要语言中立；JS 教程可以教普适工程哲学。

### 模式 5：600+ 贡献者协作的治理模式

**问题场景**：单一作者仓库如何处理大量 PR？
**解决方案**：创始人 Ryan McDermott 主导 + 600+ 贡献者协作，PR review 节奏稳定，bad/good 例子持续补充。
**关键参数**：
- 单一作者起步
- 600+ 贡献者协作
- 25+ 翻译版
- 翻译版 fork → 翻译 → PR → 反哺
- 12k+ forks
**最佳实践**：知识库的"网络效应" = 翻译版 fork。

## 第二段：扩展范式

### 模式 6：Variables 章节（Searchable Names + 命名论）

**问题场景**：86400000 是什么鬼？magic number 难维护？
**解决方案**：提取为带语义的命名常量 `MILLISECONDS_PER_DAY = 60 * 60 * 24 * 1000`，代码可读 + 可搜索。
**关键参数**：
- L82-106 Searchable Names
- magic number 提取常量
- 命名表达意图
- IDE 可搜索
- 注释 + 命名 = 自文档
**最佳实践**：所有 magic number 必须提常量；让代码"可搜索"。

### 模式 7：Functions 章节（One Thing + 函数论）

**问题场景**：长函数怎么办？嵌套 if-else 难读？
**解决方案**：一个函数只做一件事；嵌套 if-else 提取为独立函数（如 `isResidentEligible()`），提升可读性。
**关键参数**：
- L290-322 One Thing
- 函数 < 20 行
- 嵌套层级 < 2
- 函数命名表达意图
- 参数 < 3 个
**最佳实践**：函数只做一件事；用命名代替注释。

### 模式 8：Encapsulate Conditionals（条件封装）

**问题场景**：复杂布尔表达式 `if (date.before(SUMMER_START) || date.after(SUMMER_END))` 难懂？
**解决方案**：提取为 `isSummer(date)` 函数，意图清晰。
**关键参数**：
- L799-819 条件封装
- boolean 表达式 → 命名函数
- isXXX/hasXXX/canXXX 命名
- 单元测试可独立写
- 复用容易
**最佳实践**：复杂条件提函数；命名表达意图。

### 模式 9：Composition over Inheritance（组合优于继承）

**问题场景**：多层继承导致 class 爆炸？
**解决方案**：用 has-a 关系（组合）替代 is-a 关系（继承），更灵活。
**关键参数**：
- L1309-1375
- has-a vs is-a
- 组合灵活
- 测试容易
- 避免继承耦合
**最佳实践**：优先组合；继承是强耦合。

### 模式 10：SOLID 五原则的 JS 落地

**问题场景**：SOLID 原则如何在 JS 中体现？
**解决方案**：5 个章节用 50+ 例子把 SOLID 翻译成 JS 习惯——SRP/OCP/LSP/DIP/ISP。
**关键参数**：
- L1381-1437 SRP
- L1441-1528 OCP
- L1532-1647 LSP
- L1729-1828 DIP
- ISP 拆分胖接口
**最佳实践**：用具体例子教 SOLID；抽象原则需要"翻译"。

## 第三段：进阶范式

### 模式 11：Testing 章节（质量底线）

**问题场景**：什么算"测试通过"？
**解决方案**：TDD/AAA 模式（Arrange/Act/Assert），单个测试只测一个概念，F.I.R.S.T 原则。
**关键参数**：
- AAA 模式
- 一个测试一个概念
- F.I.R.S.T：Fast/Independent/Repeatable/Self-Validating/Timely
- mock vs stub 区别
- 测试覆盖率不追求 100%
**最佳实践**：测试 = 文档 + 验证；F.I.R.S.T 原则是底线。

### 模式 12：Concurrency 章节（Promise 异步范式）

**问题场景**：回调地狱 + 竞态条件 + 内存泄漏？
**解决方案**：用 Promise/async-await 替代 callback，避免副作用（setTimeout 不清理），错误用 try/catch 捕获。
**关键参数**：
- Promise vs callback
- async/await 同步风格
- 错误处理
- 副作用清理
- 避免 setTimeout 内存泄漏
**最佳实践**：用 async/await 替代 callback；副作用必清理。

### 模式 13：Error Handling 章节（不要吞噬错误）

**问题场景**：catch 后什么都不做？
**解决方案**：catch 后要么 throw（更具体错误）、要么 log + 标记状态、要么给默认值。**不要静默吞噬**。
**关键参数**：
- catch 不留空
- 错误链式
- 自定义 Error 类
- Promise reject 要处理
- 全局兜底
**最佳实践**：catch 不留空；错误吞噬是 bug 温床。

### 模式 14：Formatting 章节（风格统一）

**问题场景**：缩进/引号/分号团队不统一？
**解决方案**：用 Prettier/ESLint 强制格式化，配置文件进版本库，CI 校验。
**关键参数**：
- Prettier 自动化
- ESLint 规则
- 配置文件进版本库
- 团队 vs 个人偏好
- CI 卡门禁
**最佳实践**：格式化 = 工具自动化；不要靠 code review 卡格式。

### 模式 15：Comments 章节（自证文档）

**问题场景**：注释是必要的吗？什么不该注释？
**解决方案**：好代码 = 自文档；注释解释"为什么"而非"是什么"。TODO/FIXME 用专用 tag，废弃代码直接删。
**关键参数**：
- 注释 Why 而非 What
- TODO/FIXME/XXX 专用 tag
- 注释要更新
- JSDoc 公共 API
- 法律注释必须留
**最佳实践**：好代码 = 自文档；注释解释"为什么"。

## 第四段：实战范式

### 模式 16：25+ 翻译版 = 病毒式传播

**问题场景**：知识库如何扩大影响？
**解决方案**：25+ 翻译版（中文/日文/韩文/俄文/西班牙文/葡萄牙文/...）让任何语言的开发者都能 fork → 翻译 → 形成 PR → 反哺主仓库。
**关键参数**：
- 25+ 翻译
- 翻译版 fork 单文件
- PR 反哺主仓库
- 社区自治
- 网络效应
**最佳实践**：翻译版是知识库"网络效应"的杠杆。

### 模式 17：50+ 例子的"WHY 浓度"分级

**问题场景**：2000+ 行 README 如何让读者找到重点？
**解决方案**：每个章节选 1-2 个"WHY 浓度"最高的例子重点讲解（⭐⭐⭐⭐⭐），其余提供索引。
**关键参数**：
- 影响力 × 论证质量 双维度
- 8 个核心例子
- ⭐⭐⭐⭐⭐ 标记
- 其余提供索引
- TOC 跳转
**最佳实践**：知识库要"标星"重点；长文档要降低阅读门槛。

### 模式 18：Code Review 评审模板

**问题场景**：如何把 Clean Code 用到 Code Review？
**解决方案**：用 SOLID 5 原则 + Functions 命名论 + Comments 注释规范作 review checklist，逐项打勾。
**关键参数**：
- SOLID 5 项 check
- 命名 check
- 函数长度 check
- 注释 check
- 测试覆盖 check
**最佳实践**：把规范做成 review checklist；不要凭感觉。

### 模式 19：教学叙事结构（Bad → Good → WHY）

**问题场景**：如何把工程原则讲清楚？
**解决方案**：用反例库 → 正例 → 论证三段式，反例来自真实 review，论证要可证伪。
**关键参数**：
- Bad → Good → WHY 三段式
- 反例来自真实 review
- 论证要可证伪
- 命名论/函数论/SOLID/错误论
- 25+ 翻译扩散
**最佳实践**：教学法 = 反例 + 正例 + 论证；纯说教无效。

### 模式 20：知识库而非代码库的"反架构"决策

**问题场景**：仓库该有 build/test/CI 吗？
**解决方案**：**主动放弃**所有软件工程基础设施（无构建、无测试、无 CI、无依赖），只保留"知识传播"这一条主线。
**关键参数**：
- 3 个文件（README + LICENSE + .gitattributes）
- 无 package.json
- 无 src/ test/ examples/
- 反架构 = ADR
- 知识传播 = 唯一目标
**最佳实践**：明确"我们要解决什么问题"；不要为"工程完整性"过度投入。

## 关键代码段

```javascript
// L82-106 — Searchable Names
// Bad: 86400000 是什么鬼？
setTimeout(blastOff, 86400000);

// Good: 提取为带语义的命名常量
const MILLISECONDS_PER_DAY = 60 * 60 * 24 * 1000; // 86400000
setTimeout(blastOff, MILLISECONDS_PER_DAY);

// L290-322 — One Thing（一个函数只做一件事）
// Bad: 多层嵌套 + 多职责
function showEmployeePaycheck(employee) {
    // 计算工资
    const grossPay = ...;
    // 计算税
    const tax = ...;
    // 打印
    console.log(...);
}

// Good: 拆分为单一职责函数
function calculateGrossPay(employee) { ... }
function calculateTax(grossPay) { ... }
function printPaycheck(amount) { ... }
function showEmployeePaycheck(employee) {
    printPaycheck(calculateTax(calculateGrossPay(employee)));
}
```

## 必偷 3 件

1. **单文件 README 而非多文件 Wiki**：知识库优先单文件；clone 即可读胜于文档站。
2. **Bad/Good/Why 三段式教学法**：用"反例库"对照教学；纯说教效果差 10 倍。
3. **25+ 翻译版 = 病毒式传播**：翻译版是知识库"网络效应"的杠杆。

## 必避 3 坑

1. **不要把规范写在 Confluence**：要写成版本化的 README，让 fork → 翻译 → PR 成为可能。
2. **不要追求"工程完整性"**：知识库不需要 build/test/CI；明确"唯一目标"是知识传播。
3. **不要照搬原则而不给例子**：每条原则都要 Bad/Good 对照，否则读者无法落地。
