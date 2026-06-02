# You-Dont-Know-JS · 架构与模式解析

> YDKJSY 2nd-ed 是 GitHub 上极少数"靠纯 Markdown 内容登顶 JS 类 Top 3"的项目，18.2 万 Star、单作者维护 11 年、CC BY-NC-ND 4.0 协议。本文用 ABL 视角拆解其内容架构：把仓库当印刷母版、把章节当模块、把附录当测试套件、把取消的目录当资产。

## 1. 内容架构核心

### 模式 1：Git-as-Publisher——把 GitHub 当 InDesign 用

**问题场景**：传统出版依赖 InDesign/Word+PDF+邮件来回，版本对比、协作、归档全靠人工管理。YDKJSY 在 2013 年首创"git 出版流水线"：放弃 GitBook/Read the Docs 等专门工具，直接用 GitHub 渲染 `.md`，把"印刷级母版"放进 git。

**解决方案代码**：
```bash
# 出版即 git tag
git tag -a v1.0.0-get-started -m "Get Started 2nd-ed 出版"
git push origin v1.0.0-get-started

# Leanpub 自动从指定分支拉取 .md 编译
# Amazon Kindle Direct Publishing 通过 leanpub-cli 同步
```

仓库顶层结构体现"出版母版"思想：
```
You-Dont-Know-JS/
├── README.md              # 门面：封面+购买+目录
├── preface.md             # 跨书前言
├── LICENSE.txt            # CC BY-NC-ND 4.0
├── get-started/           # 6 本书并列子目录
├── scope-closures/
├── objects-classes/       # 草稿
├── types-grammar/         # 草稿
├── sync-async/            # 空目录（已取消，保留）
└── es-next-beyond/        # 空目录（已取消，保留）
```

**关键参数表**：
| 元素 | YDKJSY 选择 | 替代方案 | 取舍 |
|:---|:---|:---|:---|
| 排版工具 | GitHub 原生 Markdown | GitBook/Docusaurus/AsciiDoc | 零依赖但 README 体验差 |
| 版本控制 | git tag = 出版版本 | SemVer + CHANGELOG.md | `git log` 即出版史 |
| 协作模型 | 出版后关闭 PR | 永远开放 PR | 防"水平稀释" |
| 渲染端 | GitHub Web + Leanpub | Read the Docs | 读者从 GitHub 入口，作者从 Leanpub 出版 |

**最佳实践**：
- 把"出版"动作映射为 git tag，每次大改=一次出版快照
- 母版仓库**不依赖**任何构建工具，`.md` 即最终交付物
- README 是"门面"，必须第一屏给：封面、购买、目录
- preface 跨书共享，避免每本书重复相同前情
- 出版即"封版"，避免长尾修订单稀释权威

---

### 模式 2：preface.md 跨书前言共享

**问题场景**：6 本书的 1st-ed 各写一份前言，2nd-ed 重写时发现"动机、心智模型、目标读者"等 80% 内容相同——重复且版本漂移。

**解决方案代码**：
```markdown
<!-- preface.md 顶层文件，所有书都引用 -->
# You Don't Know JS Yet

This is a series of books diving deep into the core mechanisms
of the JavaScript language. The goal is to equip you with the
mental models needed to truly understand JS — not just write it.

> "The most important thing to learn is not how to write code,
>  but how to reason about code."

## How to Read This Series

1. Read in order: Get Started → Scope & Closures → ...
2. Each book has apB (Practice) — try before you peek
3. Use the GitHub Issues for questions; not for typo PRs
```

每本书 `README.md` 顶部都加 `> See [preface.md](../preface.md) for the project-wide introduction.`，避免在 6 本书里复制粘贴。

**关键参数表**：
| 元素 | 1st-ed | 2nd-ed | 改进 |
|:---|:---|:---|:---|
| 前言位置 | 每本书独立 `preface.md` | 顶层共享 `preface.md` | DRY，避免漂移 |
| 字数 | 5-8 千字/本 | 1.5 千字（共享） | 减重 80% |
| 引用方式 | 各本自己 | `> See preface` + 锚点 | 跨书一致 |

**最佳实践**：
- 跨书共有内容**只写一份**放在顶层
- 用 `> See [preface.md](../preface.md)` 引用，避免直接复制
- 写前言时考虑"6 本书读者都会读"的密度，不要带具体书的话题
- preface 改一次即生效所有书，**单一 source of truth**

---

### 模式 3：ch1/ch2/apA/apB 命名约定的强约束力

**问题场景**：开源协作时，章节文件命名五花八门（`chapter-1.md` / `01-intro.md` / `1.md`），导致 toc 引用、翻译对照、grep 全部碎片化。

**解决方案代码**：
```
get-started/
├── README.md
├── toc.md
├── foreword.md
├── ch1.md          # 第 1 章：What is JavaScript?
├── ch2.md          # 第 2 章：Surveying JS
├── ch3.md          # 第 3 章：Digging to the Roots of JS
├── ch4.md          # 第 4 章：The Bigger Picture
├── apA.md          # 附录 A：Exploring Further
└── apB.md          # 附录 B：Practice, Practice, Practice!
```

**关键参数表**：
| 命名 | 含义 | 排序稳定性 | 翻译映射 |
|:---|:---|:---|:---|
| `chN.md` | 第 N 章（1-indexed） | 字典序=阅读序 | `ch1.md` → `ch1.zh-CN.md` |
| `apA.md` | 附录 A | 始终在 ch 之后 | 同上 |
| `toc.md` | 本书目录 | 每本固定 1 个 | 不翻译，独立维护 |
| `foreword.md` | 单书前言 | 每本固定 1 个 | 与 ch 并列翻译 |

**最佳实践**：
- `chN` 用 1-indexed、`apA` 用字母——人类直觉优先
- 永不插章（如 `ch2.5.md`），新章直接续号 + README 调整 toc
- 取消的章节不删文件，改为 `chX-deprecated.md` 并在 toc 划线
- 翻译者按 `ch1.zh-CN.md` 命名，**与原书并排**而不是目录嵌套

---

### 模式 4：toc.md 当作"轻量导航协议"

**问题场景**：一本书 4-8 章 + 2 附录，读者打开 GitHub 仓库需要一目了然看到"先读哪个"——但作者拒绝在 README 加冗长目录（理由：服务出版不服务在线阅读）。

**解决方案代码**：
```markdown
<!-- get-started/toc.md -->
# Table of Contents

| Part | Title | 
|:---|:---|
| Foreword | [Foreword](foreword.md) |
| Chapter 1 | [What Is JavaScript?](ch1.md) |
| Chapter 2 | [Surveying JS](ch2.md) |
| Chapter 3 | [Digging to the Roots of JS](ch3.md) |
| Chapter 4 | [The Bigger Picture](ch4.md) |
| Appendix A | [Exploring Further](apA.md) |
| Appendix B | [Practice, Practice, Practice!](apB.md) |
```

**关键参数表**：
| 元素 | toc.md 包含 | toc.md 排除 |
|:---|:---|:---|
| 章节标题 | 完整标题 | 章节摘要 |
| 链接 | GitHub 相对路径 | 外链（spec 链接放在章内） |
| 排序 | 阅读序（foreword→ch→ap） | 字母序、字数序 |
| 状态标注 | 无 | 草稿/取消（写在 README 不写 toc） |

**最佳实践**：
- toc 只列标题+链接，**不放摘要**——摘要属于章内第一节
- 表格化让 GitHub 渲染对齐
- toc.md **不被翻译**——翻译者独立维护 `toc.zh-CN.md`
- 新增章节只需 +1 行 toc + 1 个 chN.md，README 不动

---

### 模式 5：README.md 的"三段式门面"设计

**问题场景**：GitHub 仓库首屏决定 80% 读者去留——YDKJSY 用极简三段式（封面图+购买链接+目录）做到 18.2 万 Star。

**解决方案代码**：
```markdown
<!-- get-started/README.md -->
<img src="images/cover.png" width="200" align="right">

# You Don't Know JS Yet: Get Started
### 2nd Edition (in progress)

Purchase from: [GetiPub](https://getipub.com) · [Leanpub](https://leanpub.com) · [Amazon](https://amazon.com)

---

## Table of Contents

* Foreword
* [Chapter 1: What Is JavaScript?](ch1.md)
* [Chapter 2: Surveying JS](ch2.md)
* [Chapter 3: Digging to the Roots of JS](ch3.md)
* [Chapter 4: The Bigger Picture](ch4.md)
* [Appendix A: Exploring Further](apA.md)
* [Appendix B: Practice, Practice, Practice!](apB.md)
```

**关键参数表**：
| 段 | 内容 | 字符预算 | 目的 |
|:---|:---|:---|:---|
| 封面 | 200px 缩略图 + 书名 | < 200 字符 | 视觉识别 |
| 购买 | 3 个外链（自家+Leanpub+Amazon） | < 150 字符 | 商业闭环 |
| 目录 | 完整 toc 链接 | < 500 字符 | 阅读入口 |

**最佳实践**：
- 封面图固定 200px 对齐右侧，**不**做响应式
- 购买链接 3 个就够，不超过 5 个（避免选择疲劳）
- README **不**放章节摘要，不放作者介绍——只做"门"
- 状态用"in progress"标注（2nd-ed 草稿阶段），让读者自带预期

---

## 2. 写作方法论

### 模式 6：迷思→破除→重构→小结四段式

**问题场景**：传统技术书按"概念→语法→示例"线性铺——读者看到 100 页还在"hello world"，注意力散尽。YDKJSY 反向：每章开篇先抛一个**广为流传的错误观点**，逐条反证后重构心智模型。

**解决方案代码**：
```markdown
<!-- scope-closures/ch1.md 节选 -->
# Chapter 1: What's the Scope?

## Misconception: "JavaScript is interpreted"

Many tutorials claim JS is "an interpreted language", implying
line-by-line execution. **This is wrong.**

### Proof: parse happens before execute

​```js
var greeting = "Hello";
console.log(greeting);
greeting = ."Hi";   // SyntaxError: unexpected token .
​```

If JS were truly line-by-line interpreted, you would expect:
1. `console.log("Hello")` to print
2. Then the SyntaxError on line 3

What actually happens: **no output, immediate SyntaxError.**

The engine must parse the whole program first to detect the syntax
error, *before any execution begins*. JS is **compiled**, not interpreted
(at least at the JSC/V8/SpiderMonkey level — see TC39 spec section 8).

## Reframing the mental model

JS engines do **two-phase processing**:
1. **Parse / Compile**: read entire program → AST
2. **Execute**: walk the AST, running statements in order

## Summary

* JS is not "interpreted" in the line-by-line sense
* Engines parse first, execute second
* "Compiled" doesn't mean "compiled to machine code" — it means
  there's a distinct parse phase producing an intermediate form
```

**关键参数表**：
| 段 | 字数 | 钩子 |
|:---|:---|:---|
| Misconception 引子 | 50-100 词 | 引用流行错误观点 |
| Proof 反证 | 200-400 词 | 5-15 行最小反例代码 |
| Reframing 重构 | 300-500 词 | 给出新心智模型 |
| Summary 小结 | 100-200 词 | 3-5 个 bullet |

**最佳实践**：
- 每章只攻 1 个迷思，深度优先于广度
- 反例代码必须**最小可复现**（5-15 行），避免学生装工具
- 引用 ECMAScript spec 章节号作为权威兜底
- Summary 限定 3-5 个 bullet，让读者二次回顾快速抓住主线

---

### 模式 7：Spec-anchored 论证的引用密度

**问题场景**：作者单方面说"JS 是这样这样"——读者凭什么信？YDKJSY 把"Spec 引用密度"作为权威性指标。

**解决方案代码**：
```markdown
<!-- scope-closures/ch2.md 节选 -->
## Lexical Scope: A Spec-Anchored Definition

Per the ECMAScript 2024 specification:

> "Lexical Environment is a specification type used to define the
>  association of Identifiers to specific variables and functions
>  based upon the lexical nesting structure of ECMAScript code."
>  — [ECMA-262 §8.1](https://tc39.es/ecma262/#sec-lexical-environments)

The key phrase: **"based upon the lexical nesting structure"**.

In practice:

​```js
function outer() {
    var a = 1;
    function inner() {
        console.log(a);  // 1 — looked up via outer scope
    }
}
​```

`inner` resolves `a` by walking the **lexical** (i.e. text-based) chain:
`inner` → `outer` → global. This lookup happens at call time, but
the *structure* of the chain is fixed at parse time. See [§8.1.1.3]
for the resolution algorithm.
```

**关键参数表**：
| 引用类型 | YDKJSY 使用 | 链接形式 | 位置 |
|:---|:---|:---|:---|
| Spec 段落 | `ECMA-262 §X.Y` 编号 | GitHub 锚点 + TC39 官网 | 论断后 1 行内 |
| TC39 提案 | `proposal-foo` | tc39.es/proposals | 章节首段 |
| 实测引擎 | `V8`, `SpiderMonkey` | 引擎博客外链 | 性能/边角案例 |
| 第三方研究 | `Babel AST explorer` | 外链 | 工具演示 |

**最佳实践**：
- 论断后**第一行**给 spec 引用，不放脚注
- Spec 链接用 `tc39.es/ecma262/#sec-xxx` 永久 URL
- 关键概念 100% 引用 spec，实用技巧 50% 引用 spec
- 避免"作者说了算"式论断，spec 是 source of truth

---

### 模式 8：渐进式重构——`var` → IIFE → `let` → 模块模式

**问题场景**：直接给学生最优解（`let`）会让他们**不知道为什么**——遇到老代码时完全看不懂。YDKJSY 用"渐进式重构"叙事：从最差实现 → 改良版 → 标准方案 → 替代方案。

**解决方案代码**：
```js
// scope-closures/ch3.md —— 闭包陷阱的 4 步重构

// Step 1: 经典错误（var + 闭包）
for (var i = 1; i <= 3; i++) {
    setTimeout(function timer() {
        console.log(i);
    }, i * 1000);
}
// 输出: 4 4 4（因为 var i 是同一个绑定，3 次回调都看到最终值）

// Step 2: 用 IIFE 隔离每次迭代的 i
for (var i = 1; i <= 3; i++) {
    (function(j){
        setTimeout(function timer() {
            console.log(j);
        }, j * 1000);
    })(i);
}
// 输出: 1 2 3

// Step 3: 用 let 块作用域
for (let i = 1; i <= 3; i++) {
    setTimeout(function timer() {
        console.log(i);
    }, i * 1000);
}
// 输出: 1 2 3（let 每次迭代创建新绑定）

// Step 4: 模块模式（生产级）
const log = (() => {
    const timers = [];
    for (let i = 1; i <= 3; i++) {
        timers.push(setTimeout(() => console.log(i), i * 1000));
    }
    return () => timers.forEach(clearTimeout);
})();
log();  // 1 2 3
```

**关键参数表**：
| 步 | 方案 | 解决的问题 | 引入的新概念 |
|:---:|:---|:---|:---|
| 1 | `var` 错误版 | 建立"有 bug"基线 | 闭包捕获引用 |
| 2 | IIFE | 演示变量隔离技巧 | 立即调用函数表达式 |
| 3 | `let` | 演示语言自带机制 | 块作用域 |
| 4 | 模块模式 | 演示生产级封装 | IIFE + 闭包组合 |

**最佳实践**：
- 每步保留 5-15 行，**不引入**与当前主题无关的概念
- 故意给出 Step 1 的"错误答案"，让学生**先看到 bug**
- 重构后**回头解释**为什么 Step 1 错——而不是只贴 Step 4
- 4 步内必须收敛到 ES2024 主流写法，不要带学生跑进冷门方案

---

### 模式 9：最小可复现示例（5-15 行硬约束）

**问题场景**：教学示例常被 Node/webpack 依赖污染，学生花了 90% 时间在装环境。YDKJSY 严格规定：所有示例 ≤ 15 行、纯 `node REPL` 可跑、零依赖。

**解决方案代码**：
```js
// objects-classes/ch1.md —— 反 lazy property 例子
// 总计 6 行，Node REPL 直接粘贴

function twenty() { return 20; }
function myNumber() { return (twenty() + 1) * 2; }

myObj = { favoriteNumber: myNumber };   // 注意：myNumber 不是 myNumber()

console.log(myObj.favoriteNumber);      // [Function: myNumber]
console.log(myObj.favoriteNumber());    // 42

// 关键反直觉：JS 不存在 @property 语义
// 延迟求值必须显式包成函数，控制权完全给到调用方
```

**关键参数表**：
| 指标 | 阈值 | 原因 |
|:---|:---|:---|
| 行数 | ≤ 15 | 超过即"代码片段"而非"教学示例" |
| 依赖 | 0 | `node` REPL 即可跑 |
| 副作用 | 0 | 不写文件、不发请求、不 setTimeout |
| 副作用符号 | 显式标注 | 用 `// side-effect: ...` 注释 |

**最佳实践**：
- 5-15 行硬约束，超过则拆成多个示例
- 优先用 `const`/`let` 演示新语义，避免在示例里再解释 `var` 行为
- 注释只写"为什么"，不写"是什么"——后者属于文字章节
- 关键反直觉行为**显式注释**"注意：xxx 不是 yyy"
- 示例代码也走 git 版本控制，可单独 diff

---

### 模式 10：反 lazy property 的"控制权归调用方"哲学

**问题场景**：从 Python 转 JS 的开发者带着"应该有计算属性"预期来，碰壁后第一反应是"JS 设计烂"。YDKJSY 直接把"JS 没有 lazy"作为**特性**陈述，让学生理解这是显式控制。

**解决方案代码**：
```js
// objects-classes/ch1.md —— 三种"计算属性"模拟

// 方案 A：每次访问重新计算（无缓存）
const obj1 = {
    get fullName() {
        return this.first + ' ' + this.last;
    }
};

// 方案 B：首次访问后缓存（手动 lazy）
const obj2 = {
    _fullName: null,
    get fullName() {
        if (!this._fullName) this._fullName = this.first + ' ' + this.last;
        return this._fullName;
    }
};

// 方案 C：纯函数，调用方决定何时计算、何时缓存
const computeFullName = (first, last) => first + ' ' + last;
const obj3 = {
    first: 'Kyle',
    last: 'Simpson',
    computeFullName   // 函数引用，不是值
};

// 调用方控制：
const name = computeFullName(obj3.first, obj3.last);  // 'Kyle Simpson'
```

**关键参数表**：
| 方案 | 控制权 | 缓存 | 适用场景 |
|:---|:---|:---|:---|
| A (getter) | 框架 | 无 | 简单计算 + 读多写少 |
| B (懒缓存 getter) | 框架 | 内部 | 重计算 + 读多写少 |
| C (函数引用) | 调用方 | 外部 | 通用、与类解耦 |

**最佳实践**：
- 教学"反 Python `@property`"时**先承认** Python 的优点
- 把"无 lazy"作为**设计取舍**讲，而非缺陷
- 函数引用 vs 函数调用：作者用 1 行 `myObj = { favoriteNumber: myNumber }` 立竿见影
- 控制权交给调用方 = 可测试、可缓存、可替换
- 不要为了"接近其他语言"而引入装饰器黑魔法

---

## 3. 知识组织策略

### 模式 11：三大支柱主键——Scope/Prototypes/Types

**问题场景**：JS 知识点超过 200 个，如果按"语法点"线性排列（变量→运算符→函数→对象…），读者陷入"地图无法收敛"困境。YDKJSY 用三大支柱作为心智模型主键。

**解决方案代码**：
```markdown
<!-- get-started/ch4.md 节选：The Bigger Picture -->
## The Three Pillars of JS

1. **Scope & Closures** — *where* and *how* variables and functions
   are accessed. Includes: lexical scope, hoisting, closures, modules.

2. **Prototypes & Objects** — *what* the values are. Includes: object
   literals, prototypes, `this`, classes (syntactic sugar), delegation.

3. **Types & Coercion** — *how* values behave under operations.
   Includes: primitive types, coercion, equality, type spec.

## Why these three?

Every JS program is a conversation between:
- *Scope* (where to find the binding)
- *Objects* (what the binding resolves to)
- *Types* (what operations are valid on that value)

Get these three right, and the rest (async, modules, classes) is detail.
```

**关键参数表**：
| 支柱 | 核心问题 | 关键概念 |
|:---|:---|:---|
| Scope/Closures | 变量在哪里、可访问吗 | 词法作用域、提升、闭包、模块 |
| Prototypes/Objects | 值的内部结构是什么 | 原型链、`this`、委托 |
| Types/Coercion | 值参与运算时如何转换 | 7 种原始类型、强制转换、相等性 |

**最佳实践**：
- 三大支柱是 1st-ed 起贯穿的**主键**，2nd-ed 在 Get Started ch4 正式命名
- 所有章节都映射到 ≥1 个支柱
- 取消的 `sync-async/` 和 `es-next-beyond/` 也属于"周边支撑"而非支柱
- 学生读完后应能问"这个 bug 是属于哪个支柱的问题"

---

### 模式 12：取消的目录也要保留——"演进史是资产"

**问题场景**：开源项目中途放弃某些子项目时，惯例是删除目录 + 在 README 加一句"项目已变更"。YDKJSY 反向：把取消的子项目**留作空目录** + README 划线，作为"项目演进史"的一部分。

**解决方案代码**：
```
# 顶层 README 节选
# Available Books (2nd-ed)

* [Get Started](get-started/) — Published
* [Scope & Closures](scope-closures/) — Published
* [Objects & Classes](objects-classes/) — Rough draft
* [Types & Grammar](types-grammar/) — Rough draft
* ~~Sync & Async~~ — *Canceled; merged into other works*
* ~~ES Next & Beyond~~ — *Canceled; see blog posts instead*
```

```
# 实际目录树
You-Dont-Know-JS/
├── get-started/         # ch1-ch4 + apA/apB（出版）
├── scope-closures/      # ch1-ch8 + apA/apB（出版）
├── objects-classes/     # ch*.md（草稿稳定）
├── types-grammar/       # ch*.md（粗稿）
├── sync-async/          # 空目录（已取消）
└── es-next-beyond/      # 空目录（已取消）
```

**关键参数表**：
| 状态 | 目录处理 | README 标注 | 意图 |
|:---|:---|:---|:---|
| 出版 | 完整 ch/ap + images | 加购买链接 | 商业闭环 |
| 草稿稳定 | 部分 ch*.md | "Rough draft" | 期待读者提 issue |
| 粗稿 | 1-2 个 ch*.md | "Early draft" | 透明度 |
| 取消 | 空目录 | `~~xxx~~` 划线 | 历史可见 |
| 合并到其他 | 空目录 | "Merged into Y" | 指引替代 |

**最佳实践**：
- 取消的目录**不删除**——保留 git 历史 + 空目录结构
- README 用 `~~xxx~~` markdown 划线，比"删除文字"更显诚意
- 在每个取消目录的 `README.md` 写"为什么取消 + 替代是什么"
- 让读者看到"完整计划"，降低"作者烂尾"的印象
- git log 即演进史，无需额外写 ROADMAP.md

---

### 模式 13：apB.md——附录 B 当"零工具链单元测试"

**问题场景**：教学书的"练习题"常见弊病：题做不出来答案又不在身边，读者放弃。YDKJSY 的解法：把练习 + 答案**写进 apB.md**（附录 B），学生可以"先做后查"。

**解决方案代码**：
```markdown
<!-- get-started/apB.md 节选 -->
# Appendix B: Practice, Practice, Practice!

## Exercise 1: Compile vs Interpret
Without running the following code, predict the output:

​```js
console.log(a);
var a = 1;
​```

**Answer (no peeking!)**: `undefined`

**Why**: The `var` declaration is hoisted to the top of the scope
*with an initial value of `undefined`*. The assignment `= 1` happens
at the line where it appears. So at the `console.log`, the variable
exists but holds `undefined`.

**Spec reference**: [ECMA-262 §8.3](https://tc39.es/ecma262/#sec-declarations)

---

## Exercise 2: Lexical Scope
Predict the output:

​```js
var a = 1;
function outer() {
    var a = 2;
    function inner() {
        console.log(a);
    }
    inner();
}
outer();
​```

**Answer**: `2`

**Why**: `inner` looks up `a` via lexical scope: it sees the `a`
declared inside `outer` first, never reaches the global one.

**Spec reference**: [§8.1.1.3 GetIdentifierReference](https://tc39.es/ecma262/#sec-getidentifierreference)
```

**关键参数表**：
| 元素 | YDKJSY 选择 | 传统书做法 |
|:---|:---|:---|
| 答案位置 | apB.md **同文件** | 书后附录 / 配套 PDF / 网盘 |
| 题目数 | 6-12 个/本 | 5-30 个/章 |
| 答案格式 | 答案 + 解释 + spec 引用 | 纯答案 |
| 自测流程 | 滚动查看 / GitHub anchor 跳转 | 翻页 / 书签 |

**最佳实践**：
- apB 必须是**最后一节**——把练习当作章与购买之间的"防烂尾"设计
- 答案与题目**同文件**，避免"找不到答案"的挫败感
- 答案必须给"为什么"+ spec 引用，不是冷冰冰的 `Output: 2`
- 题目数控制在 6-12 个——超过 15 个读者不会做完
- apB 章节标题固定为 "Practice, Practice, Practice!" —— 跨书一致

---

### 模式 14：翻译分支隔离——按 ISO 语言码建独立 branch

**问题场景**：开源书翻译到 20+ 种语言时，主分支塞下 20 倍文件，PR diff 难以辨认、合并冲突频发。YDKJSY 用"按 ISO 语言码建独立 branch"解决：每个翻译者只看到自己的 `ch1.zh-CN.md`。

**解决方案代码**：
```bash
# 主仓库不直接合并翻译；翻译者 fork + 独立 branch
git clone https://github.com/getify/You-Dont-Know-JS.git
git checkout -b zh-CN
cp scope-closures/ch1.md scope-closures/ch1.zh-CN.md
# 翻译完成后，翻译者 push 到自己 fork 的 zh-CN branch
git push -u origin zh-CN
```

**关键参数表**：
| ISO 码 | 语言 | 维护者 | 状态 |
|:---|:---|:---|:---|
| `zh-CN` | 简体中文 | 社区译者 | 部分章节完成 |
| `es` | 西班牙语 | 社区译者 | 全部完成 |
| `de` | 德语 | 社区译者 | 全部完成 |
| `pt-BR` | 巴西葡语 | 社区译者 | 进行中 |

**最佳实践**：
- 翻译分支用 `zh-CN`（带地区）而非 `chinese`（不带地区）——避免简繁冲突
- 翻译者=该分支的 maintainer，作者**不** review 翻译内容
- 翻译者不直接合入主仓库，**独立发布**（自家 GitHub Pages / Leanpub）
- 主仓库的 `LICENSE.txt` 注明 CC BY-NC-ND 4.0——翻译必须整本、不获利
- 翻译时用并排文件（`ch1.md` + `ch1.zh-CN.md`）而非目录嵌套（`zh-CN/ch1.md`）

---

### 模式 15：跨书前言 + 单书 foreword + 章 + 附录的三层结构

**问题场景**：技术书目录深度不一致（有的 2 层、有的 3 层），读者在不同书之间跳跃时定位成本高。YDKJSY 严格统一三层结构。

**解决方案代码**：
```
Layer 0: 跨书前言（顶层 preface.md）
   ↓ 引用
Layer 1: 单书 README + toc + foreword
   ↓ 引用
Layer 2: 章（chN.md）+ 附录（apA.md / apB.md）
```

```markdown
<!-- Layer 0 顶层 -->
# preface.md
> "This is a series of books..." (1500 字)

<!-- Layer 1 单书 -->
# scope-closures/README.md
> See [preface.md](../preface.md) for the project-wide introduction.
# scope-closures/toc.md
# scope-closures/foreword.md
> 单书前言（500-1000 字，说明本书在系列中的位置）

<!-- Layer 2 内容 -->
# scope-closures/ch1.md ... ch8.md
# scope-closures/apA.md ... apB.md
```

**关键参数表**：
| 层 | 文件 | 作用 | 字数预算 |
|:---|:---|:---|:---|
| L0 | 顶层 `preface.md` | 跨书前言 | 1500 字 |
| L1a | `README.md` | 门面（封面+购买+目录） | < 1000 字 |
| L1b | `toc.md` | 目录 | < 500 字 |
| L1c | `foreword.md` | 单书前言 | 500-1000 字 |
| L2 | `chN.md` / `apN.md` | 章节 | 3000-8000 字/章 |

**最佳实践**：
- 三层结构是**强制约束**，新书必须遵循
- L1 三件套（README/toc/foreword）缺一不可
- L2 章数尽量 4-8 个 + 2 个附录——超过 10 章读者疲劳
- 跨书前言放在顶层，**禁止**复制到每本书
- 翻译者只翻译 L1c（foreword）+ L2（章/附录），L0/L1a/L1b 由翻译者**自行重写**

---

## 4. 出版与生态

### 模式 16：1st-ed / 2nd-ed 双分支的归档策略

**问题场景**：作者重写一本书时，旧版内容是否保留？YDKJSY 用 git 分支做"版本归档"：1st-ed 单独分支、2nd-ed 是当前 main，旧版**完整保留可读**。

**解决方案代码**：
```bash
# 1st-ed 分支：2013-2019 出版历史
git checkout 1st-ed
ls
#   scope-closures/  this-object-prototypes/  types-grammar/
#   async-performance/  es6-beyond/  up-going/

# 2nd-ed 分支：当前主版本
git checkout 2nd-ed
ls
#   get-started/  scope-closures/  objects-classes/
#   types-grammar/  sync-async/  es-next-beyond/
```

**关键参数表**：
| 版本 | 分支 | 状态 | 商业链接 |
|:---|:---|:---|:---|
| 1st-ed | `1st-ed` | **已绝版**（仓库仍可读） | 无（只读归档） |
| 2nd-ed | `2nd-ed`（默认） | 进行中 | GetiPub / Leanpub / Amazon |
| 草稿 | 临时 branch | 作者独写 | 无 |

**最佳实践**：
- 旧版本**不删 git 历史**——读者买不到的书，仓库仍可读
- README 顶部明确"当前活跃分支是 `2nd-ed`"
- 1st-ed 保持**完整可读**——这是 6 年积累，删除是巨大损失
- 草稿不暴露在 main，单独用作者私有 branch

---

### 模式 17：CC BY-NC-ND 4.0 协议——"开源但不商业可衍生"

**问题场景**：作者用 11 年写书，如何既保持"开源"姿态又避免被白嫖商用？YDKJSY 选择 **CC BY-NC-ND 4.0**：署名 + 非商用 + 不可衍生。

**解决方案代码**：
```
LICENSE.txt

You Don't Know JS (YDKJS) by Kyle Simpson is licensed under
Creative Commons Attribution-NonCommercial-NoDerivatives 4.0
International License.

You are free to:
* Share — copy and redistribute the material in any medium or format

Under the following terms:
* Attribution — You must give appropriate credit
* NonCommercial — You may not use the material for commercial purposes
* NoDerivatives — If you remix, transform, or build upon the material,
  you may not distribute the modified material.

Full text: https://creativecommons.org/licenses/by-nc-nd/4.0/
```

**关键参数表**：
| 权利 | CC BY-NC-ND 4.0 | 影响 |
|:---|:---|:---|
| 复制 | 允许 | 个人/教育免费用 |
| 商用 | **禁止** | 翻译印刷收费 = 违规 |
| 衍生（改写） | **禁止** | 不能基于本书写"XDKJS" |
| 署名 | 必需 | 引用时必须标 Kyle Simpson |
| 翻译 | **必须整本 + 不获利** | 翻译到纸质销售 = 违规 |

**最佳实践**：
- 协议选 CC BY-NC-ND：开源精神 + 商业保护，**两全**
- 翻译要"整本 + 非商用"——杜绝"逐章翻译+卖书"的灰产
- 作者另开 GetiPub 自出版 + Leanpub/Amazon 渠道——授权给**自己**的衍生
- LICENSE.txt **必须**列在仓库根目录——GitHub 自动识别 + 显示协议徽章
- 协议选择**不可逆**——切换协议等于切社区信任

---

### 模式 18：Leanpub + Amazon + GetiPub 三轨出版

**问题场景**：单一出版渠道（Amazon KDP）抽成高、跨境税务复杂。YDKJSY 用三轨覆盖：Leanpub（数字版+多货币）、Amazon KDP（纸质+Kindle）、GetiPub（自出版零抽成）。

**解决方案代码**：
```bash
# Leanpub：从 git 仓库自动构建
# 1. leanpub.com 后台设置 GitHub repo + 分支 + book 目录
# 2. 点 "Publish" → 拉取 .md → 转 EPUB/PDF
# 3. 作者手动触发，每次出版 = git tag

# Amazon KDP：手动上传 PDF + EPUB
# 1. kdp.amazon.com 后台
# 2. 上传打印 PDF + 数字 EPUB
# 3. 预览通过后上架
```

**关键参数表**：
| 渠道 | 抽成 | 货币 | 内容形式 | 目标读者 |
|:---|:---|:---|:---|:---|
| GetiPub | 0% | USD | PDF + EPUB | 早期支持者 |
| Leanpub | 抽成 80% 给作者 | 多货币 | PDF + EPUB + MOBI | 全球数字读者 |
| Amazon KDP | 70% 给作者（数字）/ 60%（纸） | USD/EUR/JPY | 纸 + Kindle | 亚马逊读者 |

**最佳实践**：
- 三轨**不是冗余**——各自覆盖不同读者群
- GetiPub 适合"未正式出版前"的早期版本
- Leanpub 适合"边写边卖"，可设置最低价 0+ 自愿付费
- Amazon 适合"完成后再出"，作为权威发布
- git tag → Leanpub 自动重建 → 触发 KDP 上架——形成"出版流水线"

---

### 模式 19：Frontend Masters 单一商业赞助

**问题场景**：开源书如何养活作者？YDKJSY 不接广告、不卖周边、不搞众筹，**唯一商业收入**是 Frontend Masters 视频课程的讲师分成。

**解决方案代码**：
```
# README.md 节选
> If you find these books valuable, please consider supporting
> the author by enrolling in the related video courses at
> [Frontend Masters](https://frontendmasters.com).
```

**关键参数表**：
| 收入源 | 抽成模式 | 读者重叠度 |
|:---|:---|:---|
| Frontend Masters 课程 | 讲师分成（具体比例非公开） | 高：书读者→课程付费 |
| GetiPub/Leanpub/Amazon | 一次性销售 | 中 |
| GitHub Sponsor | 自由金额 | 低（书 95% 为非赞助者） |

**最佳实践**：
- 书**永远免费**——这是作者的人设
- 商业化走"教育服务"——视频课程、Workshop、咨询
- Frontend Masters 课程与书**深度联动**——书是课程的预习材料
- 不在书内放广告——保持内容纯净度
- 不开 Patreon / 不开 GitHub Sponsor 大额档——避免"职业乞丐"人设

---

### 模式 20：单作者治理 + 拒绝 CoC/RFC——"11 年长跑的代价与回报"

**问题场景**：单作者维护 11 年的项目，作者精力是单点风险。YDKJSY 选择**单作者 + 拒绝 CoC/RFC/多人治理**，换取节奏不被拖垮。

**解决方案代码**：
```
# CONTRIBUTING.md 节选
> This book series is now **complete** and is **not open to further
> contributions** (other than typo reports for unfixed issues, but
> even those may be closed without action).

> The reasoning: the moment you let infinite contributors in, you
> end up with infinite process, diluting the work and adding overhead
> that doesn't match the vision of a coherent, single-author series.
```

**关键参数表**：
| 治理元素 | YDKJSY 做法 | 替代方案 | 取舍 |
|:---|:---|:---|:---|
| 决策权 | 单作者一票 | Maintainer 委员会 | 节奏快 |
| 贡献方式 | 仅 typo 报告 | 开放 PR | 抗稀释 |
| CoC | 无明示 | Contributor Covenant | 简化 |
| RFC 流程 | 无（作者即 RFC） | 公开 proposal | 简化 |
| Issue triaging | 作者自己做 | Triage team | 慢但可控 |
| 翻译社区 | 独立 branch 自治 | 主仓库合并 | 隔离争议 |

**最佳实践**：
- 单作者项目**不要**加 CoC——会引来"职业 CoC 警察"
- 出版即"封版"是开源书的**正确决策**——质量优先于贡献量
- 翻译社区用独立 branch 自治——主仓库作者不审
- 偶尔发 blog post 解释"为什么这样做"——主动建立预期
- 11 年长跑的关键是**作者不被拖垮**——所有治理设计都围绕这个目标

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库路径 | `github.com/getify/You-Dont-Know-JS` |
| 主分支 | `2nd-ed` |
| 归档分支 | `1st-ed` |
| 协议 | CC BY-NC-ND 4.0 |
| 商业渠道 | GetiPub / Leanpub / Amazon KDP |
| 赞助方 | Frontend Masters |
| Star 数 | 182k+ |
| 出版本数 | 2nd-ed 已出版 2 本 + 草稿 2 本 + 取消 2 本 |
