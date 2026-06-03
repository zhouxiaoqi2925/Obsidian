---
title: ESLint
tags: [代码检查, Linter, JavaScript, TypeScript, 代码规范]
---

# ESLint

## 前言

**定位**：可插拔的 JavaScript/TypeScript 代码检查工具，由 Nicholas C. Zakas 创建，是前端工程化的事实标准，让代码风格和质量检查自动化。

**核心价值**：
- 静态分析代码，发现潜在错误（未使用变量、未定义变量、类型错误）
- 统一团队代码风格（缩进、引号、分号）
- 插件化架构，300+ 官方规则，1000+ 社区规则
- 与编辑器深度集成（VSCode 实时提示）

**五大特性**：
1. **AST 分析**：基于 Espree 解析器，把代码转为 AST 后检查
2. **规则可插拔**：每条规则独立、可配置、可禁用
3. **自动修复**：`--fix` 参数自动修复大部分风格问题
4. **多解析器支持**：TypeScript（`@typescript-eslint`）、Vue、Babel 等
5. **共享配置**：`eslint-config-*` 一键继承团队规范

**对比表**：

| 维度 | ESLint | Prettier | TSLint | Biome | JSHint |
|---|---|---|---|---|---|
| 定位 | 代码质量 + 风格 | 纯格式化 | TS 检查 | 速度优先 | 轻量检查 |
| 速度 | ⚠️ 中 | ✅ 快 | ⚠️ 中 | ✅ 极快 | ✅ 快 |
| 可配置性 | ✅ 极强 | ⚠️ 中 | ✅ 强 | ⚠️ | ❌ |
| 自动修复 | ✅ | ✅ | ⚠️ 部分 | ✅ | ❌ |
| 类型检查 | ⚠️ 通过插件 | ❌ | ✅ | ⚠️ | ❌ |
| 适合 | 中大型项目 | 所有项目 | 旧 TS 项目 | 新项目 | 简单脚本 |

## 思维导图

```mermaid
mindmap
  root((ESLint))
    核心概念
      Rule 规则
        错误检测
      Plugin 插件
        规则集合
      Parser 解析器
        Espree 默认
      Formatter 输出
        stylish json
      Config 配置
        flat config
        legacy config
    规则类型
      Possible Errors
        必检查
      Best Practices
        最佳实践
      Strict Mode
        严格模式
      Variables
        变量
      Stylistic Issues
        风格
      ECMAScript 6
        ES6
    内置规则
      no-unused-vars
      no-undef
      eqeqeq
      no-console
      no-var
      prefer-const
      no-unreachable
    解析器
      espree
        默认
      @typescript-eslint/parser
        TypeScript
      @babel/eslint-parser
        Babel
      vue-eslint-parser
        Vue
    共享配置
      eslint-config-airbnb
        严格
      eslint-config-standard
        通用
      eslint-config-google
        Google
      @typescript-eslint/recommended
        TS 推荐
    命令
      eslint
        检测
      eslint --fix
        自动修复
      eslint --cache
        缓存加速
      eslint --max-warnings
        警告阈值
    编辑器集成
      VSCode
        ESLint 扩展
      WebStorm
        内置
      Vim
        ALE
    高级特性
      自定义规则
        AST 节点
        访问者模式
      内联禁用
        // eslint-disable
        临时关闭
      overrides
        文件级
        不同规则
      共享插件
        团队规范
    生态
      Prettier
        协作配置
      Husky
        git hook
      lint-staged
        暂存检查
      Standard
        零配置
    应用场景
      代码评审
        自动化
      团队规范
        统一风格
      重构保护
        防回归
      教育
        学习规范
```

## 关键代码

### 一、Flat Config（v9 默认配置）

```javascript
// eslint.config.js - v9 推荐的新格式
import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" }
    },
    plugins: { "@typescript-eslint": ts, react, "react-hooks": reactHooks },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "react/jsx-uses-react": "off",      // React 17+ JSX 转换不需要
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn"
    }
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.config.js"]
  }
];
```

### 二、传统 .eslintrc 配置（v8 兼容）

```json
// .eslintrc.json
{
  "root": true,
  "env": { "browser": true, "es2022": true, "node": true },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "ecmaVersion": "latest", "sourceType": "module" },
  "plugins": ["@typescript-eslint", "react", "import"],
  "rules": {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "warn",
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": ["error", "always"],
    "import/order": ["warn", { "groups": ["builtin", "external", "internal"] }]
  },
  "settings": {
    "react": { "version": "detect" }
  },
  "overrides": [
    {
      "files": ["*.test.ts", "*.test.tsx"],
      "rules": { "no-console": "off" }
    }
  ]
}
```

### 三、常用规则配置

```javascript
// 变量与作用域
"no-unused-vars": "error",
"no-undef": "error",
"prefer-const": "error",
"no-var": "error",
"no-shadow": "warn",

// 风格
"semi": ["error", "always"],
"quotes": ["error", "double"],
"indent": ["error", 2, { "SwitchCase": 1 }],
"comma-dangle": ["error", "never"],
"object-curly-spacing": ["error", "always"],

// 现代语法
"prefer-arrow-callback": "error",
"prefer-template": "error",
"prefer-destructuring": "warn",
"object-shorthand": "error",
"template-curly-spacing": "error",

// 错误预防
"no-debugger": "error",
"no-alert": "warn",
"no-eval": "error",
"no-implied-eval": "error",
"no-new-func": "error",
"no-return-await": "error",

// TypeScript
"@typescript-eslint/no-explicit-any": "warn",
"@typescript-eslint/explicit-function-return-type": "off",
"@typescript-eslint/no-floating-promises": "error",
"@typescript-eslint/await-thenable": "error"
```

### 四、自定义规则

```javascript
// eslint-plugin-mycompany/rules/no-hardcoded-strings.js
module.exports = {
  meta: {
    type: "problem",
    docs: { description: "禁止硬编码中文字符串（应使用 i18n）" },
    fixable: "code"
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        // 检测中文字符
        if (/[一-龥]/.test(node.value)) {
          context.report({
            node,
            message: "硬编码中文字符串 '{{text}}' 应使用 i18n",
            data: { text: node.value },
            fix(fixer) {
              return fixer.replaceText(
                node,
                `t(${JSON.stringify(node.value)})`
              );
            }
          });
        }
      }
    };
  }
};

// 使用
{
  plugins: ["mycompany"],
  rules: { "mycompany/no-hardcoded-strings": "error" }
}
```

### 五、Prettier 协作配置

```javascript
// .eslintrc.js
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended"  // 必须放最后
  ]
};

// eslint-config-prettier 关闭与 Prettier 冲突的规则
// eslint-plugin-prettier 把 Prettier 错误作为 ESLint 错误报告
```

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "printWidth": 100,
  "trailingComma": "none",
  "arrowParens": "always"
}
```

### 六、CI/CD 集成

```json
// package.json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx,.js",
    "lint:fix": "eslint . --ext .ts,.tsx,.js --fix",
    "lint:ci": "eslint . --ext .ts,.tsx,.js --max-warnings 0",
    "lint:cache": "eslint . --cache --cache-location .eslintcache"
  }
}
```

```yaml
# GitHub Actions
name: Lint
on: [push, pull_request]
jobs:
  eslint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: "npm" }
      - run: npm ci
      - run: npm run lint:ci
```

```json
// .lintstagedrc.json - husky + lint-staged
{
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yml}": ["prettier --write"]
}
```

## 核心洞察

- **ESLint vs Prettier 是"逻辑 vs 风格"分工**：ESLint 查代码正确性（潜在 bug、危险 API）、Prettier 管代码格式（缩进、引号、换行），两者通过 `eslint-config-prettier` 协作
- **Flat Config（v9）是配置的未来**：替代 `.eslintrc` 的层级继承模型，用纯 JS 数组声明式配置，更易理解和扩展
- **TypeScript 检查与 ESLint 是分开的**：ESLint 通过 `@typescript-eslint` 插件做语法级检查，类型级检查仍需 `tsc --noEmit`，两条流水线并行
- **`--fix` 自动修复 90% 风格问题**：缩进、引号、分号、import 排序、简单 rename 都能自动修
- **ESLint 的"配置即代码"哲学**：`eslint.config.js` 可以动态生成（按环境、文件类型切换规则），比 JSON 灵活
- **共享配置 = 团队知识沉淀**：`eslint-config-airbnb` 80+ 规则集 = 30+ 工程师多年的经验，新人第一天就达到团队标准
- **`no-console` 是代码洁癖之争**：生产环境要 `error`，但开发期需要 `console.log` 调试，常配 `allow: ["warn", "error"]` 折中
- **ESLint 慢是 AST 遍历本质**：大型项目 10000+ 文件 5min+，用 `--cache` 缓存可缩到 30s，`--max-warnings 0` 防止警告堆积
- **Biome 是 ESLint 的挑战者**：Rust 写的 linter，速度 100x+，但生态远不如 ESLint
- **`.eslintrc` 已成历史**：v9 默认 flat config，老项目用 `ESLINT_USE_FLAT_CONFIG=false` 回退兼容
- **禁用规则要谨慎**：`// eslint-disable-next-line` 应有 `why` 注释，否则债务会越积越多

## 跨项目引用

- **[[typescript]]**：`@typescript-eslint/parser` 是 TS 项目标配，与 `tsc --noEmit` 配合实现完整静态分析
- **[[prettier]]**：与 ESLint 通过 `eslint-config-prettier` 协作，Prettier 负责格式、ESLint 负责逻辑
- **[[react]]**：`eslint-plugin-react` + `eslint-plugin-react-hooks` 是 React 项目必装
- **[[vue]]**：`eslint-plugin-vue` + `vue-eslint-parser` 支持 Vue SFC
- **[[webpack]]**：`eslint-loader` 在 Webpack 编译时检查，已被 fork-ts-checker-webpack-plugin 替代
- **[[vite]]**：Vite 不直接集成 ESLint，但配合 `vite-plugin-checker` 实现保存时检查
- **[[next.js]]**：Next.js 自带 ESLint 集成，`npx next lint` 一键启用
- **[[jest]]**：`eslint-plugin-jest` 为测试文件提供规则（如 `no-disabled-tests`）
- **[[node.js]]**：`eslint-plugin-n` 强制 Node 风格（callback、CommonJS）
- **[[git]]**：`husky` + `lint-staged` 在 git commit 时只检查暂存文件，速度快
- **[[github actions]]**：CI 中 `npm run lint:ci` 阻断合并
- **[[npm]]**：`eslint-config-airbnb`、`eslint-config-standard`、`eslint-config-google` 是三大主流规范
