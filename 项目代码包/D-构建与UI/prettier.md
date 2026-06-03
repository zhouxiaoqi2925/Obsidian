---
title: Prettier
tags: [代码格式化, 风格统一, 工具链, JavaScript, 多语言]
---

# Prettier

## 前言

**定位**：有主见的代码格式化工具（Opinionated Code Formatter），由 James Long 创建，号称"所有配置都是可选的"——让团队停止争论代码风格，专注代码本身。

**核心价值**：
- 一键格式化：保存即统一，再无风格 PR
- 极简配置：争议选项已被预定义，团队无需争论
- 多语言支持：JS/TS/JSX/TSX/CSS/HTML/JSON/YAML/Markdown 全覆盖
- 极快：基于 Node.js + 增量解析，比 ESLint 格式化快 10x

**五大特性**：
1. **有主见**：换行、缩进、引号、分号都是预设的，无需配置
2. **多语言**：前端全栈语言都支持（含 Rust/Go 也有相关 formatter）
3. **编辑器集成**：VSCode 保存自动格式化
4. **CI 检查**：`--check` 模式在 CI 中验证格式
5. **零冲突设计**：通过 `eslint-config-prettier` 关闭 ESLint 风格规则

**对比表**：

| 维度 | Prettier | ESLint | dprint | Biome | gofmt |
|---|---|---|---|---|---|
| 定位 | 纯格式化 | 代码质量 | 速度优先 | 一体化 | Go 官方 |
| 速度 | ✅ 快 | ⚠️ 中 | ✅ 极快 | ✅ 极快 | ✅ 极快 |
| 可配置性 | ⚠️ 有限 | ✅ 极强 | ⚠️ 中 | ⚠️ | ❌ |
| 类型检查 | ❌ | ⚠️ 插件 | ❌ | ⚠️ | ❌ |
| 自动修复 | ✅ | ✅ | ✅ | ✅ | ❌ |
| 适合 | 所有项目 | 中大型 | 速度敏感 | 新项目 | Go 项目 |

## 思维导图

```mermaid
mindmap
  root((Prettier))
    核心特性
      有主见
        默认风格
        极少配置
      多语言
        前端全栈
      编辑器集成
        保存自动
      CLI 工具
        命令行
      零冲突
        与 ESLint 协作
    支持语言
      JavaScript
      TypeScript
      JSX TSX
      CSS SCSS Less
      HTML Vue Svelte
      JSON JSON5
      YAML
      Markdown MDX
      GraphQL
      模板字符串
    配置
      .prettierrc
        JSON 格式
      .prettierrc.js
        JS 格式
      prettier.config.js
        Node 14+
      package.json
        prettier 字段
    配置选项
      printWidth
        80 100
      tabWidth
        缩进空格
      useTabs
        tab vs space
      semi
        分号
      singleQuote
        单引号
      quoteProps
        对象引号
      trailingComma
        尾逗号
      bracketSpacing
        对象空格
      arrowParens
        箭头函数
      endOfLine
        lf crlf
    命令
      prettier
        格式化
      prettier --write
        写回文件
      prettier --check
        检查
      prettier --list-different
        列出不同
    忽略
      .prettierignore
        类似 .gitignore
      // prettier-ignore
        行内注释
        /* prettier-ignore-start */
    编辑器
      VSCode
        Prettier 扩展
      WebStorm
        内置
      Vim
        vim-prettier
    协作
      ESLint
        eslint-config-prettier
        关闭冲突
      Husky
        pre-commit
      lint-staged
        暂存区检查
    高级特性
      嵌入式语言
        MDX 中的 JSX
        CSS 中的 JS
      插件
        API 接口
        自定义语言
      增量
        ESLint 集成
        更智能
    应用场景
      团队规范
        风格统一
      自动化
        保存格式化
      PR 减少
        无关 diff
      新人入门
        一键合规
```

## 关键代码

### 一、配置文件

```json
// .prettierrc
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": false,
  "quoteProps": "as-needed",
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "overrides": [
    {
      "files": "*.md",
      "options": { "proseWrap": "preserve" }
    },
    {
      "files": "*.yml",
      "options": { "singleQuote": true }
    },
    {
      "files": ["*.html", "*.vue"],
      "options": { "printWidth": 120 }
    }
  ]
}
```

```javascript
// .prettierrc.js - 动态配置
module.exports = {
  printWidth: process.env.CI ? 80 : 100,
  singleQuote: false,
  trailingComma: "es5"
};
```

### 二、忽略文件

```
# .prettierignore
dist/
build/
node_modules/
coverage/
public/
*.min.js
*.lock
package-lock.json
yarn.lock
pnpm-lock.yaml
```

### 三、CLI 命令

```bash
# 格式化单个文件
npx prettier --write src/index.ts

# 格式化整个目录
npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,md}"

# 检查格式（CI 用）
npx prettier --check "src/**/*.{ts,tsx}"

# 列出未格式化的文件
npx prettier --list-different "src/**/*.{ts,tsx}"

# 与 git diff 配合
npx prettier --check $(git diff --name-only --diff-filter=ACMR | grep -E '\.(ts|tsx|js|jsx)$')

# 输出格式化前后对比
npx prettier src/index.ts > /tmp/formatted.ts
diff src/index.ts /tmp/formatted.ts
```

### 四、package.json scripts

```json
{
  "scripts": {
    "format": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json,md,css}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,js,jsx,json,md,css}\"",
    "format:diff": "prettier --check $(git diff --name-only --diff-filter=ACMR | grep -E '\\.(ts|tsx|js|jsx)$' | tr '\\n' ' ')"
  }
}
```

### 五、编辑器集成

```json
// .vscode/settings.json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.formatOnPaste": false,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.fixAll.stylelint": "explicit"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[markdown]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": false
  }
}
```

### 六、ESLint 协作

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "prettier"  // eslint-config-prettier 关闭冲突
  ]
}

// 顺序：prettier 必须在最后，关闭所有与 Prettier 冲突的 ESLint 规则
```

```json
// lint-staged + husky - 仅格式化暂存文件
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["prettier --write", "eslint --fix"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

### 七、Prettier API

```javascript
// prettier-formatter.js
import prettier from "prettier";

const code = `
function foo(a,b){
return a+b
}
`;

const formatted = await prettier.format(code, {
  parser: "typescript",
  semi: true,
  singleQuote: false,
  tabWidth: 2
});

console.log(formatted);
// function foo(a, b) {
//   return a + b;
// }

// 嵌入使用：检查字符串是否已格式化
const isFormatted = await prettier.check(code, { parser: "typescript" });
console.log(isFormatted);  // false
```

## 核心洞察

- **Prettier 的"有主见"是设计哲学**：所有选项都是非黑即白（如 `singleQuote: true/false`），没有"5 个空格 vs 4 个空格"这种争论
- **`--check` 模式是 CI 标配**：格式化不影响功能，但在 PR 审查时浪费时间；CI 阻断未格式化代码是简单粗暴的解决方案
- **`eslint-config-prettier` 是 Prettier 与 ESLint 协作的关键**：把 ESLint 中所有"风格类"规则（`indent`/`quotes`/`semi`）关闭，让 Prettier 接管
- **Prettier 的格式化是"AST + 重写"**：解析代码为 AST，按规则重排，输出标准化代码；和 ESLint 的"检查+修复"不同，Prettier 是"直接覆盖"
- **`printWidth: 80` vs `100` 是经典争论**：80 适合老终端、100 是现代共识；项目决定后永不修改
- **Prettier 3.0 重大变化**：默认 ESM、TypeScript 5 支持、`--cache` 持久化缓存、内嵌语言增强
- **Prettier 不格式化注释中的代码**：`// prettier-ignore` 注释让该行保持原样
- **Prettier 处理大型项目慢**：1 万文件级别需要 30s+，但有 `--cache` 加速
- **Prettier 与 ESLint 的责任划分**：
  - ESLint：逻辑错误、未使用变量、危险 API
  - Prettier：缩进、引号、换行、尾逗号
- **Prettier 不能格式化所有语言**：对 Go/Rust 等原生支持的语言（gofmt/rustfmt）仍需用对应工具
- **Biome 想替代 Prettier + ESLint**：Rust 实现，速度 10-100x，但生态远不如

## 跨项目引用

- **[[eslint]]**：通过 `eslint-config-prettier` 协作；Prettier 管格式、ESLint 管逻辑
- **[[typescript]]**：内置 TS 解析器，`parser: "typescript"` 直接格式化
- **[[react]]**：JSX 支持是 Prettier 的"杀手特性"——JSX 缩进自动对齐大括号
- **[[vue]]**：通过 `parser: "vue"` 支持 SFC
- **[[svelte]]**：通过 `plugin-prettier` 或 Prettier 3 内置支持
- **[[css]]**：内置 CSS 解析器，嵌套规则也支持
- **[[markdown]]**：内置 Markdown 格式化；MDX 嵌入 JSX 也支持
- **[[node.js]]**：`prettier --check` 常用作 Node 项目的 pre-commit 检查
- **[[git]]**：`pre-commit` hook + `lint-staged` 只检查暂存文件
- **[[github actions]]**：CI 中 `npx prettier --check "src/**"` 阻断格式错误
- **[[vscode]]**：Prettier 扩展是 VSCode 必备，`editor.formatOnSave` 配对使用
- **[[biome]]**：Biome 是 Prettier + ESLint 的 Rust 一体化替代品
