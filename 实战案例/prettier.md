# Prettier - 有主见代码格式化

**来源**：GitHub https://github.com/prettier/prettier
**创建时间**：2026-06-02

---

## 一、核心机制与解析哲学

### 1. 解析-格式化解耦（Parse-Format Decoupling）

**问题场景**：当团队里有人用 2 空格、有人用 4 空格、有人用 tab，lint 工具只能"标红"却不能"修复"；编辑器配置散落在 5 个 JSON 文件里，PR review 永远在为风格吵架。Prettier 要解决的不是"哪种风格更好"，而是"让风格之争从工程里彻底消失"。

**解决方案**：
```javascript
// 极简版 Prettier 主循环（src/main/core.js 思路）
async function format(text, options) {
  // 第一步：语言相关 —— 把文本变成 AST
  const parser = loadParser(options.parser);
  const ast = parser.parse(text);

  // 第二步：语言相关 —— 把 AST 翻译成"文档 IR"
  const doc = printAstToDoc(ast, options);

  // 第三步：语言无关 —— 把 IR 拟合格局化输出
  const { formatted, cursorOffset } = printDocToString(doc, {
    printWidth: options.printWidth ?? 80,
    tabWidth: options.tabWidth ?? 2,
  });

  return { formatted, cursorOffset };
}
```
**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| printWidth | 80 | 触发换行的字符数上限 |
| tabWidth | 2 | 缩进空格数 |
| useTabs | false | 是否用 tab 缩进 |
| semi | true | 语句末尾是否加分号 |
| singleQuote | false | 字符串是否强制单引号 |

**最佳实践**：
1. ✅ 在 monorepo 根目录放一个 `.prettierrc.json`，所有子包共享同一份配置
2. ✅ 用 `printWidth: 100` 当项目里有大量表格化数据时
3. ✅ 配合 `eslint-config-prettier` 关闭所有跟 Prettier 冲突的 ESLint 风格规则
4. ✅ `prettier --check` 走 CI，`--write` 走 pre-commit hook
5. ✅ 团队争论风格时直接指向 prettier.io 选项页面，不开新讨论

### 2. 文档中间表示（Document IR）

**问题场景**：如果每个语言都自己写"换行算法"，那 11 种语言要实现 11 遍 line breaking，还要 11 遍空格处理、11 遍缩进计算、11 遍注释悬挂。这等于把"布局"逻辑复制 11 份，永远改不到一致。Prettier 抽出一层 Doc IR，让所有语言只翻译"我要这些 token"，剩下的全部交给一个共享的打印机。

**解决方案**：
```javascript
// Doc 节点就是判别联合（src/document/builders/）
const doc = {
  // 1. group：尝试把内容拍扁放一行，放不下就 break
  group(concat([line, identifier, line])),
  // 2. indent：内部所有 line 多缩一层
  indent(concat([hardline, statement])),
  // 3. line / softline / hardline：换行语义
  concat([a, line, b]),      // 软换行（在 group 里可被压平）
  concat([a, hardline, b]),   // 硬换行（永远 break）
  // 4. ifBreak：break 时用 A，否则用 B
  ifBreak("{", "", { groupId: objGroup }),
  // 5. fill：把多段拼成空格分隔的列表，最后一段可换行
  fill(["a", "b", "c"]),
};
```
**关键参数**：

| Doc 原语 | 何时用 | 关键属性 |
|----------|--------|----------|
| `group(contents)` | 任意"可能一行也可能多行"的代码块 | `{ id, expandedStates }` |
| `indent(contents)` | 函数体、对象字面量、缩进层级 | 内部所有 `line` 多缩 |
| `line` / `softline` / `hardline` | 普通可换行点 | `hardline` 强制 break |
| `ifBreak(a, b, opts)` | break 与否用不同符号（如逗号） | `opts.groupId` 跨组协同 |
| `fill(parts)` | import 列表、参数列表 | 最后一段允许 break |
| `align(width, contents)` | 表格化对齐 | 罕见，慎用 |

**最佳实践**：
1. ✅ 写自定义 Doc 时永远先 `group()` 再 `indent()`，反之容易出"该 break 的没 break"
2. ✅ 给 `group` 加 `id: Symbol()`，方便远处 `ifBreak` 协同
3. ✅ 不要在 Doc 树里直接拼字符串，先用 `concat` 把节点串起来
4. ✅ 复杂场景用 `conditionalGroup([...])` 试多套 layout，从最紧凑到最展开
5. ✅ Doc 节点应该是纯数据，构造函数只赋值不计算（打印机才是计算阶段）

### 3. AST→Doc 阶段（ast-to-doc.js 编排）

**问题场景**：直接 print AST 会非常痛苦——`CallExpression` 在链式调用里要拆成 `chain`、TS 装饰器要重新归位、JSX 属性要拆成 props 列表。Prettier 在 print 前先做一轮"AST massage"：把难以直接打印的节点先"修整"成"印起来最干净"的样子，再交给 print。

**解决方案**：
```javascript
// src/main/ast-to-doc.js 主循环
function printAstToDoc(ast, options) {
  const cache = new WeakMap();

  function mainPrint(path) {
    if (cache.has(path.node)) return cache.get(path.node);
    const printed = callPluginPrintFunction(path, options, mainPrint);
    cache.set(path.node, printed);
    return printed;
  }

  return mainPrint(new AstPath(ast));
}

// 插件的 print 函数签名（prettier-plugin-* 都遵守）
const printer = {
  print(path, options, print) {
    // print 是 mainPrint 自己 —— 让插件能 print 任意子节点
    const node = path.getValue();
    switch (node.type) {
      case "CallExpression":
        return printCallExpression(path, options, print);
      // ...
    }
  },
  massageAst: { /* 可选：print 前的 AST 修整 */ },
};
```
**关键参数**：

| 概念 | 作用 | 必读函数 |
|------|------|----------|
| `path` | 当前 AST 节点 + 父节点栈 | `path.call(cb, "key")` |
| `print` | 递归打印子节点（带缓存） | 由 mainPrint 注入 |
| `massageAst` | 打印前修整 AST | JS 链式调用拆解 |
| `embed` | 内嵌语法（如 CSS-in-JS） | `print(path, print, text, path) => Doc` |
| `willPrintOwnComments` | 节点自己管注释归属 | 默认 false |

**最佳实践**：
1. ✅ 同一节点可能被访问多次，缓存到 `WeakMap` 避免重复 print
2. ✅ 让插件作者拿到 `print` 而不是裸 AST，提升可读性
3. ✅ `massageAst` 只做"语义保留的修整"，别删除信息
4. ✅ 跨语言复用：`embed` 是 Prettier 的彩蛋，CSS-in-JS 直接打回 HTML/CSS
5. ✅ `print(path)` 默认走 `path.call(print, "key")`，想 print 整个数组用 `path.map`

### 4. 注释归属算法（Comment Attachment）

**问题场景**：JS 里的注释在 AST 里"漂浮"着——`// foo` 在词法分析阶段被剥离，parse 只返回 token 流。Prettier 必须决定"这个 `// foo` 属于哪一行 AST 节点"（trailing / leading / dangling），错了就会把注释打到完全无关的地方。这是所有"按 token 流"解析器的共性难题。

**解决方案**：
```javascript
// src/main/comments/handle-comments.js 思路
function attach(comments, ast, text, options) {
  const ties = breakTies(tieComments, comments, ast, text, options);
  return decorateComment(
    comments.reduce((result, comment) => {
      if (handleOwnLineComment(comment, text, options, result, ast)) return result;
      if (handleEndOfLineComment(comment, text, options, result, ast)) return result;
      if (handleRemainingComment(comment, text, options, result, ast)) return result;
      throw new Error("Comment not attached: " + JSON.stringify(comment));
    }, { ...ast, comments: [] }).comments
  );
}
```
**关键参数**：

| 注释类型 | 判定规则 | 典型示例 |
|----------|----------|----------|
| Leading | 注释在前 + 跟着一行代码 | `// foo` 写在函数上面 |
| Trailing | 注释在后 + 跟着一行代码 | `x = 1; // foo` |
| Dangling | 不属于任何表达式 | 块注释在空函数体里 |
| OwnLine | 注释独占一行 | 行首 `// foo` |
| EndOfLine | 注释跟代码同一行 | 行尾 `// foo` |

**最佳实践**：
1. ✅ 永远不要假设注释一定归属于"最近的节点"，TS 类型注释经常跨节点
2. ✅ `@decorator` 这种语法要单独处理，装饰器既不是 leading 也不是 trailing
3. ✅ `/* eslint-disable */` 之类的"魔法注释"按 dangling 处理
4. ✅ JSDoc 块注释优先按 leading 解析到函数声明
5. ✅ 加新语言时，注释归属规则先写测试再写代码（快照测试天然适合）

### 5. Parser 适配层（Parser Adapter）

**问题场景**：JS/TS 用 Babel、Flow 用 `flow-parser`、Vue 单文件用 `vue-template-compiler`、Angular 用 `angular-estree-parser`——但 Prettier 的下游只认"标准化的 AST"。每接一个新 parser 都要写一层适配，把不同 parser 的输出"翻译"成 Prettier 内部能 print 的形状。

**解决方案**：
```javascript
// src/language-js/parse/babel.js 适配模式
const babelParsers = {
  babel: {
    parse: async (text, options) => {
      const ast = babelParser.parse(text, {
        sourceType: options.sourceType ?? "module",
        plugins: getPlugins(options),
        tokens: true,            // 必须！print 注释需要 token 流
        ranges: true,
        // ...
      });
      return { ast, text };       // text 必须随 AST 返回（给 printer 看注释）
    },
    astFormat: "estree",         // 声明 AST 类型，让 printer 路由
    locStart: (node) => node.start,
    locEnd:   (node) => node.end,
  },
  "babel-ts": { ... },           // TS 走同一个 parser 但换配置
};

// language-css 走 postcss，language-graphql 走 graphql
// 每个语言都注册 { parsers, printers, languages, options }
```
**关键参数**：

| Adapter 字段 | 必填 | 作用 |
|--------------|------|------|
| `parse(text, opts)` | 是 | 返回 `{ ast, text }` |
| `astFormat` | 是 | 让 printer 知道走哪个 print 函数 |
| `locStart` / `locEnd` | 是 | 给 printer 定位节点用 |
| `tokenize` | 否 | 提取 token 流供注释归属 |
| `hasPragma` | 否 | 配合 `/** @prettier */` 注释跳过 |

**最佳实践**：
1. ✅ `parse` 必须返回原始 `text`——注释挂载需要按文本偏移计算
2. ✅ `locStart`/`locEnd` 用闭包实现，避免传 node 进去丢类型
3. ✅ 同一种 AST 多个 parser 时，printer 只写一份，靠 `astFormat` 路由
4. ✅ `parse` 支持 `async`——大型项目解析会进入异步路径
5. ✅ Parser 切换时同时给 `parsers` 和 `printers` 加配置，少一个就跑不通

---

## 二、文档IR与打印管线

### 6. Command Stack 重写递归（Stack-based Printer）

**问题场景**：如果直接用递归实现 print，碰到深层嵌套的 AST（典型例子：超深的 JSX 或链式调用）会直接栈溢出——JS 引擎没有 TCO（尾调用优化），1000 层递归就崩。Prettier 把递归改成显式 `commands` 数组 + while 循环，单次循环可以走完任意深度，浏览器也能跑。

**解决方案**：
```javascript
// src/document/printer/printer.js printDocToString 思路
function printDocToString(doc, options) {
  const width = options.printWidth;
  const groupModeMap = new Map();      // groupId → mode
  const commands = [{ type: "indent", indent: 0, mode: MODE_FLAT, doc }];

  const out = [];                      // 字符缓冲
  let pos = 0;                          // 当前列

  while (commands.length > 0) {
    const cmd = commands.pop();
    switch (cmd.type) {
      case "group":  /* 可能展开成 indent+line，也可能保持 flat */ break;
      case "indent": /* 入栈 mode + indent */ break;
      case "line":   /* 视 mode 输出 \n + 缩进 或 空格 */ break;
      case "text":   out.push(cmd.contents); pos += cmd.contents.length; break;
      // ...
    }
  }
  return { formatted: out.join(""), cursor: /* diff 算出 */ };
}
```
**关键参数**：

| 命令类型 | 用途 | 关键字段 |
|----------|------|----------|
| `indent` | 进入缩进块 | `{ indent, mode, doc }` |
| `group` | 拟合 / 展开决策 | `{ mode, contents, break: bool }` |
| `line` | 行结束符 | `hardline` / `softline` / `line` |
| `text` | 文本片段 | `{ contents }` |
| `lineSuffix` | 行末补注 | 在 hardline 之前 flush |

**最佳实践**：
1. ✅ 永远不要在 printer 里写 `if (line.length > 80) break`——交给 `group` + `fits`
2. ✅ Stack 改写能省 30%-50% 性能，对 deep AST 几乎是必须的
3. ✅ `lineSuffix` 用来处理"注释跟在语句后面但行末才出现"的场景
4. ✅ `lineSuffixBoundary` 用来划定"补注 flush 时机"
5. ✅ 命令数组要复用，避免每轮循环都重新 `new` 数组

### 7. fits 算法（Backwards Fits）

**问题场景**：Prettier 想知道"这一组 Doc 放不放得下 printWidth"。朴素算法是"先 print 出来看长度"，但 print 完才能算长度，算完才知道要不要 break——鸡生蛋问题。`fits()` 用"模拟执行"走一遍剩余 Doc 树，估算"假设全 flat 输出，行宽够不够"。

**解决方案**：
```javascript
// src/document/printer/printer.js::fits 思路
function fits(next, restCommands, width, mustBeFlat) {
  let remainingWidth = width;
  const cmds = [{ ...next }].concat(restCommands);

  while (width >= 0) {
    const { mode, doc } = cmds.pop();
    if (doc.type === "group" && !mustBeFlat && doc.break === false) {
      cmds.push({ mode: MODE_FLAT, doc: doc.contents });
      continue;
    }
    switch (doc.type) {
      case "line":
        if (mustBeFlat) return false;
        return true;                  // 碰到 line 说明一行能装下
      case "text":
        remainingWidth -= doc.contents.length;
        if (remainingWidth < 0) return false;   // 装不下
        break;
      // ... 其他类型递归推入 cmds
    }
  }
  return true;
}
```
**关键参数**：

| 决策维度 | flat 模式 | break 模式 |
|----------|-----------|------------|
| `group.contents` 走 FLAT | 内部 `line` 变空格 | 内部 `line` 变 hardline |
| 触发条件 | `fits() === true` | 装不下 或 `shouldBreak` |
| 性能开销 | 多走一遍模拟栈 | 直接走真实栈 |
| `expandedStates` | 跳过 | 选第 2/3/N 个 layout |

**最佳实践**：
1. ✅ `fits` 是 Prettier 性能的关键瓶颈之一——复杂文档减少 `group` 嵌套
2. ✅ 内部 `group` 的 flat 判断会"穿透"——`propagateBreaks` 提前标记必 break 的组
3. ✅ `shouldBreak: true` 跳过 fits 计算直接展开
4. ✅ `expandedStates` 是 `conditionalGroup` 的物理实现
5. ✅ fits 遇到 `lineSuffix` 暂时挂起，等 hardline 触发

### 8. propagateBreaks 前向标注

**问题场景**：每个 `group` 都跑 `fits` 太贵了——如果一个嵌套 group 包含 `hardline` 或 `breakParent`，外层 group 必然 break 还要算 `fits` 完全是浪费。`propagateBreaks` 在 print 前先扫一遍 Doc 树，把"必然 break"的子组标记向上冒泡，print 时直接跳过拟合。

**解决方案**：
```javascript
// src/document/printer/printer.js 思路
function propagateBreaks(doc) {
  const breakGroupStack = [];
  function propagate(doc) {
    if (doc.type === "ifBreak" || doc.type === "line" || doc.type === "softline") {
      // 任何 break 节点都触发标记
    }
    if (doc.type === "group") {
      const hasHardLine = doc.contents.some(/* 含 hardline */);
      if (hasHardLine) {
        doc.break = "propagated";      // 标记"祖先们必 break"
        breakGroupStack.push(doc);
      }
    }
    // ... 递归处理 children
  }
  propagate(doc);
  return doc;
}
```
**关键参数**：

| 标记来源 | 上传播路径 | 最终效果 |
|----------|------------|----------|
| `hardline` | 直接把外层 group 标 `break: "propagated"` | 外层 group 直接展开 |
| `breakParent` | 显式告诉外层"别试了，必 break" | 同上 |
| `shouldBreak: true` | 程序员主动告知 | 同上 |
| `literalline` | raw 文本原样输出 | 同上 |
| `cursor` | 不会传播，但 cursor 位置会强 break | cursor 所在行 break |

**最佳实践**：
1. ✅ 写自定义 Doc 时用 `breakParent` 强制外层 group 展开（罕见场景）
2. ✅ 性能敏感场景先把 `propagateBreaks` 跑通，再看 `fits` 次数
3. ✅ `cursor` 偏移是"显式 break"——编辑器里改 1 字符重新 break 不会卡死
4. ✅ 不要手动调用 `propagateBreaks`——`printDocToString` 入口会跑
5. ✅ `propagateBreaks` 只能向上冒泡——组内 break 不会"传染"兄弟

### 9. conditionalGroup 多套 Layout

**问题场景**：JSX 属性、import 列表这种"既可能拍扁也可能展开"的代码，朴素 group 只能给两态（FLAT / BREAK）。但用户偏好："尽量多行" / "尽量少行" / "按字母对齐"——这是 3 种 layout 偏好。`conditionalGroup` 让作者声明"先试这个，break 就换下个"，一次写多套。

**解决方案**：
```javascript
// src/document/builders/conditional-group.js
function conditionalGroup(states, opts) {
  return {
    type: "group",
    id: opts?.id,
    contents: states[0],              // 首选：最紧凑的 layout
    break: false,
    expandedStates: states,           // break 后依次试 2/3/N
  };
}

// 使用：JSX 属性的"1 字符宽属性" vs "多行对齐" 两种风格
const doc = conditionalGroup([
  // State 0: 全拍扁
  group(concat([line, "<", fill(props), line, "/>"])),
  // State 1: 展开 + 多行
  group(concat([line, "<", indent(concat([hardline, join(hardline, props)])), hardline, "/>"])),
]);
```
**关键参数**：

| 字段 | 类型 | 作用 |
|------|------|------|
| `states` | `Doc[]` | 多套 Doc 树，按"紧凑→展开"排列 |
| `opts.id` | `Symbol?` | 给 `ifBreak` 跨组协同用 |
| `break: false` | 必填 | 让 `propagateBreaks` 不要提前标记 |
| 首项 | `Doc` | 默认 `group.contents`（最常用 layout） |

**最佳实践**：
1. ✅ `states[0]` 永远是最紧凑的——大多数场景下能装下
2. ✅ 不要超过 3 套 state——超过就拆成多个 `group` 串联
3. ✅ `conditionalGroup` 嵌套 `conditionalGroup` 性能差，先尝试简单 group
4. ✅ 配合 `printWidth` 调整——`printWidth: 80` 多用首项，`printWidth: 120` 多用展开项
5. ✅ 测试用 `cursor` 走一遍所有 state，确保每种状态都正确

### 10. align 表格化对齐

**问题场景**：Prettier 默认不做"等号对齐"——`const a = 1; const bb = 22;` 在 Prettier 里只会统一缩进，不会让 `=` 对齐。`align(width, contents)` 是少数能实现"表格化"的原语，但要慎用——它会让"diff 一行 = 改一整块"。

**解决方案**：
```javascript
// src/document/builders/align.js
function align(width, contents) {
  return { type: "align", n: width, contents };
}

// 典型用例：enum 成员表格化（罕见）
const doc = group(concat([
  "enum {",
  indent(concat([
    hardline,
    align(2, concat([
      "A", " = ", "1", ",",
      hardline,
      "BB", " = ", "22", ",",
    ])),
  ])),
  hardline, "}",
]));
```
**关键参数**：

| `align` 字段 | 含义 |
|--------------|------|
| `n: number` | 缩进列数（必须 ≥ 0） |
| `contents` | 被对齐的 Doc 块 |
| 配合 `indent` | align + indent 嵌套使用，缩进叠加 |
| 配合 `dedent` | 反向缩进，闭合 `{` / `}` 对齐用 |

**最佳实践**：
1. ✅ 99% 场景不要用 `align`——Prettier 的"不整齐"是有意为之
2. ✅ 真要表格化，优先用 `fill` 而不是 `align`（fill 处理 break 友好）
3. ✅ `align` 内部不要再嵌 `indent`——读者会迷惑"这是第几层缩进"
4. ✅ 自定义 printer 写测试时给 `align` 单独加 snapshot
5. ✅ `dedent` 跟 `indent` 配对，用来"取消一层缩进"

---

## 三、性能优化与拟合算法

### 11. 光标保留 = 字符级 diff（Cursor Tracking）

**问题场景**：在编辑器里按保存键格式化，光标不能跳到"完全无关的位置"——用户还在看第 5 行，格式化把它弹到第 200 行，体验直接崩。Prettier 必须把光标"原地"映射到格式化后文本。朴素做法"按行号"会被换行重排毁掉。

**解决方案**：
```javascript
// src/main/core.js cursor 跟踪
async function formatWithCursor(text, opts) {
  const { ast } = parse(text, opts);
  const { formatted } = await printDocToString(/* ... */);

  if (opts.cursorOffset === undefined) return { formatted };

  // 把光标位置当作 Symbol 注入原文本字符流
  const CURSOR = Symbol("cursor");
  const oldChars = [...text];
  oldChars.splice(opts.cursorOffset, 0, CURSOR);

  // diff 找出格式化后 Symbol 的新位置
  const newChars = [...formatted];
  const diff = diffArrays(oldChars, newChars);
  let newCursor = 0;
  for (const part of diff) {
    if (part.value.includes(CURSOR)) {
      newCursor = part.addedStart + part.value.indexOf(CURSOR);
      break;
    }
    if (!part.added) newCursor += part.value.length;
  }
  return { formatted, cursorOffset: newCursor };
}
```
**关键参数**：

| API | 输入 | 输出 | 用途 |
|-----|------|------|------|
| `format(text, opts)` | 文本 | 格式化后文本 | CLI 模式 |
| `formatWithCursor(text, opts)` | 文本 + `cursorOffset` | 文本 + 新 cursor | 编辑器保存时 |
| `formatWithCursor(text, opts)` | 文本 + `rangeStart/End` | 文本 + 新 cursor | 范围格式化 |
| `getCursorLocation(ast, offset)` | AST + offset | `{ node, before, after }` | 内部使用 |

**最佳实践**：
1. ✅ 编辑器集成用 `formatWithCursor`，不要用 `format`（光标会跳）
2. ✅ 范围格式化（`rangeStart/End`）跟 cursor 配合能做"局部 + 保留光标"
3. ✅ `cursorOffset < 0` 表示不关心光标，性能更好
4. ✅ diff 用字符级 + Symbol——行/词级 diff 在重排时会丢
5. ✅ 在 Worker 里跑 `formatWithCursor`，主线程 0 卡顿

### 12. 性能基准（Performance Benchmark）

**问题场景**：Prettier 在 monorepo 上跑一次"全项目格式化"可能要几十分钟，性能退化 5% 都会让 commit hook 慢到让人禁用。必须用 benchmark 守住"关键路径不退化"的底线。

**解决方案**：
```javascript
// benchmarks/run.js 思路
async function benchmark(name, fn, iterations = 10) {
  // 预热（JIT 编译）
  for (let i = 0; i < 3; i++) await fn();

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log(`${name}: min=${times[0].toFixed(2)}ms p50=${times[5].toFixed(2)}ms`);
}

// 跑 printDocToString
benchmark("printDocToString", () => {
  return printDocToString(realWorldDoc, { printWidth: 80 });
});
```
**关键参数**：

| Benchmark 目标 | 测量 | 报警线 |
|----------------|------|--------|
| `parse` | parser 耗时 | 单文件 > 200ms |
| `printAstToDoc` | AST→Doc 耗时 | 比例 < parse 50% |
| `printDocToString` | Doc→String 耗时 | 占总时间 40% |
| 完整 `format` | 端到端 | TypeScript 大文件 > 500ms |
| 内存峰值 | heap usage | < 500MB（10k 文件） |

**最佳实践**：
1. ✅ CI 跑 micro-benchmark，PR 不能让 `printDocToString` 退化 > 2%
2. ✅ 用 `real-world-fixture`（项目代码片段）而不是合成 AST
3. ✅ `min` + `p50` 比 `avg` 有用——`max` 永远是 GC 抖动
4. ✅ Web 端跑 wasm 版时单独测——wasm 不一定更快（序列化开销）
5. ✅ 内存 profile 用 `node --inspect` + Chrome DevTools

### 13. 大文件流式处理（Streaming）

**问题场景**：单文件 5MB JSON 一次 print 到内存，node 进程直接 OOM。Prettier 默认是全文件进内存处理（formatting 需要看上下文），但 CLI 可以在"分文件并行"层面避免单进程爆。

**解决方案**：
```javascript
// src/cli/format.js 文件级并行
async function formatFiles(files, options) {
  const CONCURRENCY = os.cpus().length;
  const queue = [...files];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) return;
      const text = await fs.readFile(file, "utf8");
      const { formatted } = await prettier.format(text, options);
      if (formatted !== text) await fs.writeFile(file, formatted);
    }
  });
  await Promise.all(workers);
}
```
**关键参数**：

| 优化维度 | 收益 | 局限 |
|----------|------|------|
| 文件级并行 | CPU 核数倍提速 | 单文件 1s 内算不出加速比 |
| worker_threads | 真正并行 | 启动 200ms 开销 |
| 缓存（`--cache`） | 重复跑节省 80% | 仅按文件内容哈希 |
| 跳过 `.gitignore` | 减少 30% 文件 | 默认开启 |
| `glob-parent` 路径 | 减少 50% glob 展开 | 大型 monorepo 收益明显 |

**最佳实践**：
1. ✅ 文件级并行用 `Promise.all` + 队列，CPU 数 = 并发数
2. ✅ worker_threads 适合 CPU-bound 场景（Prettier 是）但启动开销大
3. ✅ 缓存用 `find-cache-directory` + sha256 文件哈希
4. ✅ `picocolors` 替代 `chalk`——ANSI 颜色输出减 90% 体积
5. ✅ 大文件 > 5MB 时提示用户——`--cache-strategy metadata` 走 mtime

### 14. Editor 集成（Editor Plugin Architecture）

**问题场景**：VSCode / JetBrains / Sublime / Vim / Helix 各自有不同的扩展 API。Prettier 只暴露 JS API，怎么让 5 个编辑器都能用上 cursor 保留、范围格式化、错误提示？靠 LSP 协议 + 各编辑器"官方适配器"。

**解决方案**：
```javascript
// 各编辑器适配（prettier-vscode 思路）
{
  "languages": ["javascript", "typescript", "json", ...],
  "formatOnSaveTimeout": 1000,        // 防抖 1s
  "useEditorConfig": true,
  "prettierPath": "./node_modules/prettier"
}

// 调 prettier API
const { formatted, cursorOffset } = await prettier.formatWithCursor(
  editor.document.getText(),
  {
    parser: "babel-ts",
    cursorOffset: editor.selection.active.offset,
    filepath: editor.document.fileName,  // 用于 .prettierrc 解析
  }
);
editor.edit(edit => edit.replace(fullRange, formatted));
editor.selection.active = positionAt(cursorOffset);
```
**关键参数**：

| 编辑器集成维度 | 关注点 |
|----------------|--------|
| `formatOnSave` | 配 `editor.formatOnSave: true` |
| `cursorOffset` | 必须用 `formatWithCursor` |
| `filepath` | 必须传，`.prettierrc` 解析靠它 |
| `parser` | 文件后缀推断，可手动 override |
| ignore path | 走 `prettier --ignore-path .prettierignore` |
| LSP 支持 | `vscode-langservers-extracted` 桥接 |

**最佳实践**：
1. ✅ 永远传 `filepath`——`.prettierrc` 在 monorepo 根时不传会找错配置
2. ✅ `formatWithCursor` 必须在 Worker 里跑——主线程同步会卡 UI
3. ✅ `formatOnSaveTimeout` 设 1000ms 防止狂打键
4. ✅ `prettier --check` 走 CI 而非编辑器——编辑器只看自己文件
5. ✅ 支持 `prettier.resolveConfig(filepath)` 让插件按文件动态加载配置

### 15. 内存优化（Memory Layout）

**问题场景**：5000 个文件 monorepo 一次格式化，普通 node 进程 heap 1.5GB 起。V8 默认 4GB 限制直接 OOM。Prettier 走"每文件独立 AST + Doc"，但 parser 内部仍可能产生大量短命对象（acorn 的 token 流、babel 的 position table）。

**解决方案**：
```javascript
// 优化思路：复用字符串 + Symbol 池
const _CACHE = new Map();
function internString(s) {
  if (!_CACHE.has(s)) _CACHE.set(s, s);    // V8 自动去重
  return _CACHE.get(s);
}

// parser 选型：meriyah 比 @babel/parser 内存低 60%
// 但要 loss——放弃 Flow / JSX 严格模式支持
const parsers = {
  fast: "meriyah",                          // 轻量 + 快
  babel: "@babel/parser",                   // 全功能
  flow: "flow-parser",                      // Flow 专用
};

// 跑完文件后显式置空，让 GC 回收
async function formatOne(text, options) {
  const ast = await parse(text, options);
  const doc = printAstToDoc(ast, options);
  const result = printDocToString(doc, options);
  // 局部变量离开作用域，V8 minor GC 会清
  return result;
}
```
**关键参数**：

| 优化项 | 内存收益 | 兼容性影响 |
|--------|----------|------------|
| 选 `meriyah` parser | -60% 内存 | 失去 Flow 严格支持 |
| 关闭 `tokens: true` | -30% 内存 | 失去注释归属 |
| `WeakMap` 缓存 Doc 节点 | -15% 内存 | 配合 GC 自动清 |
| 字符串 intern | -10% 内存 | 高频 keyword 收益大 |
| 范围格式化 | 减少峰值 | 视场景 |

**最佳实践**：
1. ✅ 配置文件加 `parser: "meriyah"` 给纯 JS/TS 项目（默认用 babel）
2. ✅ `tokens: false` 给 Markdown 等"注释不重要"的语言
3. ✅ `WeakMap` 替代 `Map` 缓存 Doc 节点
4. ✅ 大型 monorepo 跑分片——`prettier --write packages/`
5. ✅ 监控 `process.memoryUsage().heapUsed`，超 2GB 报警

---

## 四、工程实践与生态

### 16. 插件 API 1.0（Plugin API Surface）

**问题场景**：Prettier 核心团队不可能支持所有语言（Solidity、Tailwind、PostCSS variants……）。社区要能"自己写一个 parser + printer 对接到 Prettier 生态"，但不能改核心代码。`prettier-plugin-*` 命名约定 + 明确的 API surface 让插件作者"按图施工"。

**解决方案**：
```javascript
// 一个最小 Prettier 插件
module.exports = {
  languages: [
    {
      name: "MyLang",
      parsers: ["my-lang"],
      extensions: [".mylang"],
    },
  ],
  parsers: {
    "my-lang": {
      parse: (text) => ({ ast: myParser(text), text }),
      astFormat: "my-lang-ast",
      locStart: (n) => n.start,
      locEnd:   (n) => n.end,
    },
  },
  printers: {
    "my-lang-ast": {
      print: (path, options, print) => {
        const node = path.getValue();
        if (node.type === "Program") {
          return concat(node.body.map((n) => print(n)));
        }
        // ...
      },
    },
  },
  options: {
    tabWidth: { default: 4, type: "int", description: "..." },
  },
};
```
**关键参数**：

| 插件字段 | 必填 | 作用 |
|----------|------|------|
| `languages` | 是 | 声明支持的语言 |
| `parsers` | 是 | text → AST |
| `printers` | 是 | AST → Doc |
| `options` | 否 | 自定义配置 |
| `massageAst` | 否 | 打印前修整 AST |
| `embed` | 否 | 内嵌其他语言 |
| `preprocess` | 否 | 打印前预处理 |
| `canAttachComment` | 否 | 注释归属规则 |

**最佳实践**：
1. ✅ 命名 `prettier-plugin-<lang>`——Prettier 自动按 `prettier-plugin-*` 发现
2. ✅ `astFormat` 字段让多个 parser 共享 printer（babel / babel-ts / estree 同一套）
3. ✅ 暴露 `print` 给插件作者，而不是裸 `path`——降低心智负担
4. ✅ `options` 字段用 `default` / `type` / `description` 描述清楚
5. ✅ 写插件时配套 snapshot 测试，跟主项目风格保持一致

### 17. 配置文件解析链（Config Resolution）

**问题场景**：项目可能有 `.prettierrc` / `.prettierrc.json` / `.prettierrc.js` / `prettier.config.js` / `package.json#prettier` / `.editorconfig` 6 种配置文件，Prettier 必须给出"明确优先级"否则用户改配置改错地方。`cosmiconfig` 帮 Prettier 处理"按优先级找配置"。

**解决方案**：
```javascript
// src/config/resolve-config.js 思路
const { cosmiconfigSync } = require("cosmiconfig");

function resolveConfig(filepath) {
  const explorer = cosmiconfigSync("prettier", {
    searchPlaces: [
      "package.json",              // 优先 package.json#prettier
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yaml",
      ".prettierrc.yml",
      ".prettierrc.json5",
      ".prettierrc.js",
      ".prettierrc.cjs",
      "prettier.config.js",
      "prettier.config.cjs",
    ],
    loaders: {
      ".json": loadJson,
      ".yaml": loadYaml,
      ".js":  require,
    },
  });

  const result = explorer.search(dirname(filepath));
  return result?.config ?? {};
}

// .editorconfig 单独解析（格式跟 Prettier 配置不完全对应）
function resolveEditorConfig(filepath) {
  const editorConfig = parseEditorConfig(filepath);
  return {
    tabWidth: editorConfig.indent_size,
    useTabs: editorConfig.indent_style === "tab",
    // ...
  };
}
```
**关键参数**：

| 配置文件 | 优先级 | 适用场景 |
|----------|--------|----------|
| `package.json#prettier` | 1 | 简单项目，跟 deps 一起 |
| `.prettierrc` | 2 | 旧版兼容 |
| `.prettierrc.json` | 3 | 现代 JSON 配置 |
| `.prettierrc.yaml` | 4 | 团队熟悉 YAML |
| `.prettierrc.js` | 5 | 需要逻辑（如函数式配置） |
| `prettier.config.js` | 6 | 跨语言项目 |
| `.editorconfig` | 副 | 兜底，按 `indent_style` 等 |

**最佳实践**：
1. ✅ 简单项目用 `package.json#prettier`——少一个文件
2. ✅ 需要 `extends` / 共享配置时用 `.prettierrc.js`
3. ✅ monorepo 根配一份 + 子包用 `prettier.config.cjs` 覆盖
4. ✅ `.editorconfig` 跟 Prettier 配置不一致时，Prettier 配置优先
5. ✅ `prettier.resolveConfig(filepath)` 让插件按文件动态加载

### 18. 快照测试（Snapshot Testing）

**问题场景**：格式化输出对"字符敏感"——少一个空格就 bug。手工写 assertion 难维护（几千个 case），改算法后所有 assertion 要重写。Prettier 用 Jest 快照测试：每条 case 配一个 `__snapshots__/xxx.js.snap`，跑测试时自动 diff 实际输出和快照。

**解决方案**：
```javascript
// tests/format/js/arrow-call/jsfmt.spec.js
runFormatTest(import.meta.url, ["babel", "flow", "typescript"]);

// 跑出来的快照（自动生成）
exports[`arrow-call.js - babel-1`] = `
"const fn = () =>
  doSomething(
    aaaaaaaaaaaaaaaaaaaaa,
    bbbbbbbbbbbbbbbbbbbbb,
    ccccccccccccccccccccc
  );
"
`;

// 改算法后手动更新
// jest --updateSnapshot
```
**关键参数**：

| 测试维度 | 配置 |
|----------|------|
| 输入 | `tests/format/<lang>/<name>/source.ts` |
| 输出 | `tests/format/<lang>/<name>/__snapshots__/...snap` |
| 多个 parser | `runFormatTest(url, ["babel", "flow"])` 一次跑多套 |
| 自动更新 | `jest --updateSnapshot` |
| 增量更新 | `jest -u` |
| 性能 | `tests/format/.../format.test.js` 跑全量 |

**最佳实践**：
1. ✅ 改算法前先看 snapshot 数量——心里有数改多少
2. ✅ Snapshot 文件必须进 git——否则 CI 看不到 diff
3. ✅ `tests/format/<lang>/` 路径用 `jsfmt.spec.js` 命名约定
4. ✅ Snapshot 配合 codemod——`jest --updateSnapshot` 后用 `git diff` 复查
5. ✅ 不写 `expect(formatted).toBe(snapshot)`——直接用 Jest 内置快照

### 19. 持续集成（CI Pipeline）

**问题场景**：500+ 贡献者的项目必须有"PR 提交后 30 分钟内跑完所有检查"的 CI，否则 review 速度会崩。Prettier 用 GitHub Actions 多矩阵：prod-test / dev-test / autofix / benchmark / lint 5 个 workflow 并行。

**解决方案**：
```yaml
# .github/workflows/prod-test.yml
name: prod-test
on: [push, pull_request]
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [22, 24]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: corepack enable
      - run: yarn install --immutable
      - run: yarn jest --colors
      - run: yarn lint
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: jest-output-${{ matrix.os }}-${{ matrix.node }}
          path: junit.xml
```
**关键参数**：

| CI 检查 | 触发 | 阻塞 merge |
|----------|------|-----------|
| `prod-test.yml` | push + PR | 是 |
| `dev-test.yml` | push + PR | 是（宽松） |
| `autofix.yml` | PR | 否（自动 commit） |
| `benchmark.yml` | PR 标记 | 是（perf 退化） |
| `eslint-rules.yml` | push | 是 |
| `cleanup.yml` | 定时 | 否 |

**最佳实践**：
1. ✅ `prod-test` 跑全量（OS × Node 矩阵），`dev-test` 跑单 OS 快
2. ✅ `corepack enable` + `yarn install --immutable` 锁版本
3. ✅ `yarn jest --colors` 失败时把 junit.xml 上传 artifact
4. ✅ `autofix.yml` 自动 commit `prettier --write` 后的文件，PR 不用人手改
5. ✅ `cleanup.yml` 跑 `git fetch --prune` 清 stale remote branch

### 20. CLI 设计与并发（CLI & Concurrency）

**问题场景**：CLI 工具要处理：glob 展开 / `.gitignore` 解析 / 配置文件发现 / 并发格式化 / 错误聚合 / 进度显示 / 颜色输出。Prettier CLI 用 `fast-glob` / `commander` / `chalk`（已换 `picocolors`）等小库做"工程化 CLI"。

**解决方案**：
```javascript
// src/cli/format.js 极简
async function format(args) {
  const ctx = new Context({ args });            // 解析 CLI 参数
  const patterns = await expandPatterns(ctx);   // glob + .gitignore
  const files = await filterFiles(patterns, ctx);
  await ctx.logger.setFilesTotal(files.length);

  // 并发格式化（CPU 数 = 并发数）
  const CONCURRENCY = os.cpus().length;
  const queue = [...files];
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift();
      if (!file) return;
      const text = await fs.readFile(file, "utf8");
      const { formatted } = await prettier.format(text, ctx.options);
      if (formatted !== text) {
        if (ctx.argv.write) await fs.writeFile(file, formatted);
        else ctx.logger.log(`${file} ${formatted.length} chars`);
      }
      ctx.logger.tickFileComplete();
    }
  }
}
```
**关键参数**：

| CLI 参数 | 行为 | 用途 |
|----------|------|------|
| `--write` | 写回文件 | 默认模式 |
| `--check` | 只检查不写 | CI 模式 |
| `--list-different` | 列出未格式化文件 | CI 模式 |
| `--cache` | 启用缓存 | 加速重复跑 |
| `--cache-location` | 缓存目录 | 自定义 |
| `--ignore-path` | 忽略文件 | 默认 `.prettierignore` |
| `--log-level` | 日志级别 | `debug` / `info` / `warn` / `error` |
| `--config` | 显式指定配置 | 调试用 |
| `--debug-check` | 检查解析后的 Doc 是否一致 | 开发用 |

**最佳实践**：
1. ✅ 默认 `--write` 走开发，`pre-commit` 用 `--check`
2. ✅ `prettier --check .` 走 CI，退出码 0 = 全部已格式化
3. ✅ `prettier --log-level warn` 部署时降噪
4. ✅ `prettier --cache` 加速 monorepo 二次跑（节省 80%）
5. ✅ 改源码后跑 `prettier --check` 验证未破坏格式

---

**标签**：#prettier #JavaScript #代码格式化 #AST #Doc-IR
**状态**：20/20 份详细内容
