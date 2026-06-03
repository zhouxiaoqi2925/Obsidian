---
title: Rollup
tags: [构建工具, 模块打包, ES模块, JavaScript, 库打包]
---

# Rollup

## 前言

**定位**：面向 JavaScript 库的下一代模块打包器，专注于 ES Module 标准输出，React/Vue/Three.js 等知名库都使用它打包。

**核心价值**：
- 输出标准 ES Module，Tree-shaking 极致，bundle 体积最小
- 插件化架构，所有转换都通过插件完成
- 比 Webpack 简单 10 倍，配置即代码
- 库开发首选，应用开发也能用

**五大特性**：
1. **Tree-shaking 原生支持**：基于 ES Module 静态分析，删除未使用代码
2. **多格式输出**：ESM/CJS/UMD/IIFE 一键配置
3. **插件驱动**：从 babel/postcss/typescript 到 json/yaml 应有尽有
4. **代码分割**：动态 `import()` 自动分包
5. **Source Map**：内置 source map 调试

**对比表**：

| 维度 | Rollup | Webpack | Vite | esbuild | Parcel |
|---|---|---|---|---|---|
| 定位 | 库打包 | 应用打包 | 开发服务器 | 极速编译器 | 零配置 |
| Tree-shaking | ✅ 极强 | ⚠️ 中 | ✅ 强 | ⚠️ 中 | ✅ 强 |
| 输出格式 | ES/CJS/UMD/IIFE | ES/CJS | ESM | ES/CJS | ES/CJS |
| 配置复杂度 | 低 | 高 | 低 | 低 | 极低 |
| HMR | ❌ | ✅ | ✅ 极快 | ✅ | ✅ |
| 适合 | 类库/SDK | 大型应用 | 现代 Web | 工具链 | 小项目 |

## 思维导图

```mermaid
mindmap
  root((Rollup))
    核心概念
      Bundle
        输出文件
      Chunk
        代码块
      Module
        输入文件
      Graph
        依赖图
    配置文件
      rollup.config.js
        input 输出
        plugins 插件
        external 外部依赖
    输出格式
      es
        ES Module
        库默认
      cjs
        CommonJS
        Node.js
      umd
        通用模块
        浏览器+Node
      iife
        立即执行
        script 标签
      amd
        异步模块
    Tree-shaking
      静态分析
        ES Module 严格
      副作用标记
        sideEffects false
        package.json
      scope hoisting
        作用域提升
        性能优化
    插件生态
      @rollup/plugin-node-resolve
        解析 node_modules
      @rollup/plugin-commonjs
        转 CJS
      @rollup/plugin-typescript
        TS 支持
      @rollup/plugin-babel
        Babel 转译
      @rollup/plugin-replace
        变量替换
      @rollup/plugin-json
        加载 JSON
      @rollup/plugin-alias
        路径别名
      rollup-plugin-postcss
        CSS 处理
      rollup-plugin-terser
        代码压缩
      rollup-plugin-serve
        开发服务器
    代码分割
      动态导入
        import()
        手动分割
      manualChunks
        手动分块
    高级特性
      watch 模式
        rollup -c -w
        文件变化重打包
      sourcemap
        调试支持
      缓存
        rollup --cache
      钩子
        buildStart
        transform
        generateBundle
    应用场景
      类库开发
        React Vue
        Three.js
      框架内核
        Vite 基于 Rollup
      SDK 工具
        体积敏感
      微前端
        子应用打包
```

## 关键代码

### 一、最简配置：打包一个工具库

```javascript
// rollup.config.js
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/index.ts",
  output: [
    { file: "dist/index.cjs.js", format: "cjs", sourcemap: true },
    { file: "dist/index.esm.js", format: "es", sourcemap: true },
    { file: "dist/index.umd.js", format: "umd", name: "MyLib", sourcemap: true }
  ],
  plugins: [
    resolve(),         // 解析 node_modules
    commonjs(),        // 转 CJS
    typescript({ tsconfig: "./tsconfig.json" }),
    terser()           // 压缩
  ]
};
```

### 二、Tree-shaking 实战

```javascript
// package.json - 关键配置
{
  "name": "my-lib",
  "sideEffects": false,  // 告诉 Rollup 所有代码无副作用，可安全删除
  "module": "dist/index.esm.js",  // ESM 入口（Webpack 优先用）
  "main": "dist/index.cjs.js",
  "types": "dist/index.d.ts"
}

// src/index.ts - 多个导出
export { add } from "./math";
export { sub } from "./math";
export { Button } from "./ui/Button";
export { Modal } from "./ui/Modal";

// 用户只 import { add }，Rollup 自动剔除 Button/Modal 等未引用代码
```

### 三、外部依赖（External）

```javascript
// rollup.config.js
export default {
  input: "src/index.ts",
  output: { file: "dist/bundle.js", format: "es" },
  external: [
    "react",               // 不打包 React
    "react-dom",
    /^@babel\/.*/,         // 正则匹配
    "lodash-es"            // ESM 版的 lodash 可被 tree-shake
  ],
  globals: {              // UMD 时使用
    react: "React",
    "react-dom": "ReactDOM"
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript()
  ]
};
```

### 四、代码分割（Code Splitting）

```javascript
// src/index.ts
export async function loadChart() {
  const { Chart } = await import("./chart");  // 动态导入
  return new Chart();
}

// rollup.config.js
export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
    chunkFileNames: "chunks/[name]-[hash].js",
    entryFileNames: "[name].js"
  },
  // 手动分块
  manualChunks: {
    vendor: ["react", "react-dom"],
    utils: ["./src/utils/format", "./src/utils/validate"]
  }
};
```

### 五、自定义插件

```javascript
// my-plugin.js - 自定义 Rollup 插件
export default function myPlugin() {
  return {
    name: "my-plugin",
    // 钩子
    buildStart(options) {
      console.log("开始构建");
    },
    transform(code, id) {
      if (id.endsWith(".md")) {
        // 处理 Markdown 文件
        return { code: `export default ${JSON.stringify(code)}`, map: null };
      }
    },
    generateBundle(options, bundle) {
      // 生成最终 bundle 时修改
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === "chunk") {
          file.code = file.code.replace("__VERSION__", "1.0.0");
        }
      }
    }
  };
}

// 使用
import myPlugin from "./my-plugin";
export default {
  input: "src/index.ts",
  output: "dist/bundle.js",
  plugins: [myPlugin()]
};
```

### 六、Watch 模式 + 调试

```bash
# 监听模式：文件变化自动重打包
rollup -c -w

# sourcemap 调试
rollup -c --sourcemap

# 性能分析
rollup -c --perf

# 静默模式（CI 用）
rollup -c --silent

# package.json scripts
{
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c -w",
    "build:prod": "NODE_ENV=production rollup -c"
  }
}
```

## 核心洞察

- **Rollup 是"库的 Webpack"**：React/Vue/Three.js/D3/Svelte/Vite 等头部项目都选 Rollup，原因是库需要标准化 ESM 输出 + 极致 tree-shaking
- **`sideEffects: false` 是 tree-shaking 的金钥匙**：包大小可减少 60%+，但前提是代码确实无副作用（如不能有 `import "./polyfill"`）
- **Rollup 不擅长应用开发**：缺 HMR/资源加载/CSS 提取等应用级能力，Vite 应运而生——开发用 Vite（基于 Rollup 接口），构建用 Rollup
- **插件钩子的 11 个阶段**：`buildStart → options → load → resolveId → transform → moduleParsed → buildEnd → outputOptions → render → generateBundle → writeBundle`，每个插件在特定阶段介入
- **多格式输出是库开发标配**：一个项目同时输出 cjs/esm/umd，最大化兼容性；现代项目可只输出 esm（如 D3 v6+）
- **Rollup 的学习曲线在插件**：理解插件架构后，所有工具链都能在 200 行内自研替代品
- **`external` 是包大小控制核心**：把所有 peerDependencies 设为 external，否则打出的 bundle 用户无法 dedupe
- **Vite 底层就是 Rollup**：开发用 esbuild 编译 + 浏览器原生 ESM，构建用 Rollup——所以 Vite 的生产优化与 Rollup 等价
- **Rollup 3 的最大变化**：默认 ESM 配置、`@rollup/plugin-*` 命名空间统一、watch 性能提升 50%

## 跨项目引用

- **[[webpack]]**：Rollup 的"应用版"；Rollup 专注库打包、Webpack 专注应用打包，二者互补
- **[[vite]]**：开发时基于 Rollup 插件 API + esbuild 编译；生产构建用 Rollup；Vite 的所有插件都是 Rollup 插件的扩展
- **[[babel]]**：通过 `@rollup/plugin-babel` 集成，Babel 负责语法降级、Rollup 负责打包
- **[[typescript]]**：通过 `@rollup/plugin-typescript` 或 `rollup-plugin-typescript2` 集成，TS 类型 + 打包一体化
- **[[react]]** / **[[vue]]** / **[[svelte]]**：这些框架本身的发布包都是用 Rollup 打包的
- **[[node.js]]**：Rollup 主要面向 Node.js 生态，依赖解析遵循 Node 规则
- **[[npm]]**：Rollup 输出 `package.json` 的 `module`/`main`/`types` 字段，npm/yarn/pnpm 按需加载
- **[[esbuild]]**：与 Rollup 是竞品 + 互补关系；Vite 用 esbuild 编译单文件，用 Rollup 打包生产 bundle
