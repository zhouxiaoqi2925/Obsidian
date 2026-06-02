# rollup - ES Module 时代的 Tree-shaking 标杆打包器

**GitHub**: rollup/rollup
**Star**: 26k+
**语言**: TypeScript
**主题**: 打包器 / ESM / Tree-shaking / Plugin 系统 / 库构建
**适用场景**: 库/SDK 打包（Vue/React/Svelte 官方用）、应用层打包（Vite 底层用 rollup）

---

## 第一段：基础范式与 ESM 原生支持

### 模式 1：ES Module 原生支持 + Tree-shaking

**问题场景**：CommonJS `require()` 是运行时解析（动态、不可静态分析），打包器无法画出完整依赖图，未用代码（30-50%）无法删除。如何在编译期就识别"未用 export"？

**解决方案**：rollup 专为 ES Module 设计——所有 `import` / `export` 是**静态**的（不能写在 if 里、不能动态构造），打包器在编译期画出完整依赖图，删掉没被 import 的 export。

```js
// rollup.config.js
export default {
    input: 'src/main.js',
    output: {
        file: 'dist/bundle.js',
        format: 'esm',   // esm / cjs / umd / iife / amd
    },
    // tree-shaking 默认开启
}
// src/main.js
import { used } from './lib'   // 只 import used
export const a = 1
// lib.js
export const used = 'x'
export const unused = 'y'      // 被打包器删除
```

**关键参数**：
- 入口：`input: 'src/main.js'`（支持字符串/对象多入口/数组）
- 输出：`output: { file, format, name?, sourcemap? }`
- 格式：`esm`（库首选）/ `cjs`（Node）/ `umd` / `iife` / `amd`
- tree-shaking：默认开启，无需配置

**最佳实践**：库打包首选 rollup（输出 ESM 最干净）；应用层用 Vite（基于 rollup）；项目代码坚持 ESM（让 tree-shaking 生效）。

### 模式 2：单文件输出（IIFE / ESM / CJS / UMD）

**问题场景**：浏览器直接 `<script>` 加载要 IIFE（立即执行函数）；Node 项目要 CJS 输出；老 AMD 项目要 UMD。如何用同一份源码出 4 种格式？

**解决方案**：`output.format` 控制输出格式 + `output` 支持数组（多输出共用一次构建）：
- `esm`：保留 ES Module 语法（库首选）
- `cjs`：CommonJS（Node 库）
- `iife`：立即执行函数（浏览器 `<script>`）
- `umd`：UMD（同时支持 AMD/CJS/global）

```js
// 多输出：库作者标配 ESM + CJS
output: [
    { file: 'dist/my-lib.esm.js', format: 'esm', sourcemap: true },
    { file: 'dist/my-lib.cjs.js', format: 'cjs', sourcemap: true },
    { file: 'dist/my-lib.min.js', format: 'esm', plugins: [terser()] },
]
// UMD 输出
output: {
    format: 'umd',
    name: 'MyLib',                 // IIFE/UMD 的全局变量名
    globals: { vue: 'Vue', react: 'React' },   // external 全局映射
}
```

**关键参数**：
- `name: 'MyLib'`：IIFE/UMD 的全局变量名（`window.MyLib`）
- `file: 'dist/my-lib.js'`：输出路径
- `sourcemap: true` / `'inline'` / `'hidden'`：生成 .map
- `globals: { vue: 'Vue' }`：UMD external 映射（import → global var）
- `output` 数组：多输出共用一次构建

**最佳实践**：库作者出 ESM + CJS 双格式（用数组 output）；UMD 给老项目兼容；`sourcemap: 'hidden'` 生成但不关联（生产环境用）。

### 模式 3：External 标记外部依赖

**问题场景**：库依赖 React/Vue；打包时不该把 React 一起打进 bundle（避免重复打包、版本冲突、用户被迫用你的 React 版本）。

**解决方案**：`external: ['react', 'react-dom']` 告诉 rollup 不要 bundle 这些 import，运行时从 `node_modules` 解析（ESM）或从 `globals` 映射读（UMD）。

```js
// rollup.config.js
export default {
    input: 'src/index.js',
    external: ['react', 'react-dom'],                    // 字符串数组
    // 或 glob 模式
    external: ['@scope/*', /^lodash/],                   // 数组支持正则/glob
    // 或函数判断
    external: (id) => id.startsWith('react'),
    output: {
        file: 'dist/bundle.js',
        format: 'umd',
        globals: { react: 'React', 'react-dom': 'ReactDOM' },   // UMD 用
    },
}
// 用户 import 你的库 + 自己装 react
```

**关键参数**：
- `external: ['react']`：单依赖
- `external: ['@scope/*']`：glob 匹配
- `external: (id) => boolean`：函数判断
- `output.globals`：UMD 格式的全局变量名映射
- 库必须 external：让用户控制版本

**最佳实践**：库打包 100% external 依赖（让用户控制版本）；用 `peerDependencies` 在 package.json 声明；UMD 时 `globals` 必填（否则 UMD 引用未定义变量）。

### 模式 4：Plugin 系统（resolveId / load / transform / renderChunk）

**问题场景**：rollup 核心只处理 JS；JSON / CSS / Vue SFC / TypeScript 怎么办？自定义 transform 怎么做？

**解决方案**：rollup 核心提供 4 个核心 hook 钩子，plugin 实现这些 hook 改变文件加载/转换逻辑：
- `resolveId(id, importer)`：解析模块 ID
- `load(id)`：返回文件内容
- `transform(code, id)`：转换源码（babel/ts 编译）
- `renderChunk(code, chunk)`：后处理生成 chunk

```js
// 简化版 plugin 示例
export default function myPlugin() {
    return {
        name: 'my-plugin',
        resolveId(id) {                              // 1. 解析 ID
            if (id === 'virtual-module') return '\0virtual'
            return null
        },
        load(id) {                                   // 2. 加载内容
            if (id === '\0virtual') return 'export default 42'
            return null
        },
        transform(code, id) {                        // 3. 转换源码
            if (id.endsWith('.json')) return `export default ${code}`
            return null
        },
    }
}
// 内部钩子：moduleParsed / options / outputOptions / renderChunk
```

**关键参数**：
- `resolveId(id, importer)`：解析模块 ID（返回新 ID 或 null 跳过）
- `load(id)`：返回文件内容（字符串或 `{ code, map }`）
- `transform(code, id)`：转换源码（返回新 code）
- `renderChunk(code, chunk)`：后处理生成的 chunk
- 钩子顺序：resolveId → load → transform → ... → renderChunk

**最佳实践**：所有非 JS 资源走 plugin（不要 hack rollup 内部）；plugin 名（`name` 字段）必须唯一（调试用）；多 plugin 按数组顺序执行。

### 模式 5：Config 文件（rollup.config.js / .mjs）

**问题场景**：复杂打包配置（多入口 + 多格式 + 10+ plugin）命令行塞不下；需要 source control 跟踪配置变更。

**解决方案**：`rollup.config.js`（CJS）或 `rollup.config.mjs`（ESM）导出默认 config 对象。`rollup -c` 读取。

```js
// rollup.config.mjs（ESM 写法）
import typescript from '@rollup/plugin-typescript'
import { terser } from 'rollup-plugin-terser'
export default {
    input: 'src/main.ts',
    output: [
        { file: 'dist/main.esm.js', format: 'esm', sourcemap: true },
        { file: 'dist/main.cjs.js', format: 'cjs', sourcemap: true },
    ],
    plugins: [
        typescript({ tsconfig: './tsconfig.build.json' }),
        terser(),
    ],
    external: ['react', 'react-dom'],
}
// 跑：rollup -c
```

**关键参数**：
- `input`：入口文件
- `output`：输出配置（数组支持多输出）
- `plugins`：plugin 数组
- `external`：外部依赖
- `watch`：开发期 watch 模式
- `cache`：增量构建缓存

**最佳实践**：库项目必用 config 文件（source control 跟踪）；小 demo 可命令行参数；多包项目用 `rollup.config.mjs`（ESM 一致性）。

---

## 第二段：Tree-Shaking 与产物优化

### 模式 6：Tree-Shaking 原理

**问题场景**：为什么 ES Module 才能 tree-shaking，CJS 不行？rollup 如何知道哪些 export 没被用？

**解决方案**：rollup 编译期分析所有 `import` / `export`：
- 未被 `import` 的 `export` → 标记 unused → 删除
- 副作用检测：纯函数（无顶层副作用）可安全删除
- `sideEffects: false` 在 `package.json` 关闭副作用检测（关键！）

```js
// lib.js
export const used = 'x'
export const unused = 'y'           // 被打包器删除（未 import）
console.log('init')                // 顶层副作用，保留
// main.js
import { used } from './lib'       // 只用 used → unused 被删
// package.json
{
    "sideEffects": false           // 关键！告诉 rollup 全库无副作用
}
```

**关键参数**：
- `package.json` 设 `"sideEffects": false`（或数组列出有副作用文件：`["*.css"]`）
- 函数声明被删时，函数体内代码连带删除
- 副作用（如 `console.log` / `import './polyfill'`）保留
- `@rollup/plugin-terser` 进一步压缩（删除 dead code）
- 检测能力：acorn AST 分析所有 import / export

**最佳实践**：库作者必设 `"sideEffects": false"`（大幅提升 tree-shaking 效果）；CSS 文件列在 `sideEffects` 数组（`"*.css"`）；纯函数库 100% 安全。

### 模式 7：Code Splitting（动态 import 拆分）

**问题场景**：单 bundle 1MB 首屏慢；路由级 / 组件级懒加载怎么拆？库打包用不用 code splitting？

**解决方案**：rollup 静态分析 `import()` 动态导入，自动拆成多个 chunk。应用层用 Vite/Webpack 的 `import()` 即可。

```js
// src/router.js
const Home = () => import('./pages/Home.js')     // 动态导入
const Settings = () => import('./pages/Settings.js')
// rollup 自动拆成：
// dist/main.js           (入口)
// dist/Home-[hash].js    (懒加载 chunk)
// dist/Settings-[hash].js
```

**关键参数**：
- `output.dir: 'dist'`：目录输出（多文件）
- `output.chunkFileNames: '[name]-[hash].js'`
- `output.entryFileNames: '[name].js'`
- 动态 import：自动拆分
- `manualChunks`：手动指定 chunk 归属

**最佳实践**：应用层用 Vite（基于 rollup + code splitting）；库打包一般不开（单文件发布）；共享 vendor chunk 用 `manualChunks`。

### 模式 8：Source Maps

**问题场景**：生产环境报错要看 stack trace 定位源码；bundle 后单文件 1MB 报错定位难；Sentry 上报需要 source map 才能解 stack。

**解决方案**：`output.sourcemap: true` 生成独立 `.map` 文件，浏览器 DevTools 自动加载。配合 Sentry/Bugsnag 上传 .map。

```js
output: {
    file: 'dist/bundle.js',
    format: 'esm',
    sourcemap: true,        // 生成独立 .map 文件
    // sourcemap: 'inline', // 内嵌为 data URI（单文件，体积大）
    // sourcemap: 'hidden', // 生成但不关联（不报错 stack）
}
```

**关键参数**：
- `sourcemap: true`：生成独立 .map（推荐）
- `sourcemap: 'inline'`：内嵌为 data URI（单文件部署方便，体积 +30%）
- `sourcemap: 'hidden'`：生成 .map 但末尾不关联 `//# sourceMappingURL=`（不暴露给浏览器）
- 配合 Sentry：用 `sentry-cli` 上传 .map
- 安全：生产环境 .map 不公开（防源码泄露）

**最佳实践**：生产环境生成 .map 但不公开（`hidden` 模式）；上 Sentry 才上传 .map（CI 阶段）；`inline` 模式仅用于自包含部署。

### 模式 9：Watch 模式

**问题场景**：开发库时改一行代码要重跑 build；命令行反复 build 慢；编辑器保存 → 浏览器看不到效果。

**解决方案**：`rollup -c -w` watch 模式，文件变化自动 rebuild。集成 `chokidar`（rollup 内部用）+ `rollup-plugin-livereload` 浏览器刷新。

```bash
# 启动 watch
rollup -c -w
# 输出：
# rollup v4.x
# → dist/bundle.js...
# created dist/bundle.js in 230ms
# [watch] watching for changes...
# [watch] change in src/main.js detected, rebuilding...
```

**关键参数**：
- `-w` / `--watch`：watch 模式
- `watch.include: 'src/**'`：监听路径
- `watch.exclude: 'node_modules/**'`：排除
- `watch.clearScreen: false`：保留屏幕日志
- 配 `rollup-plugin-livereload`：浏览器自动刷新

**最佳实践**：开发库用 watch + livereload（`rollup-plugin-livereload`）；正式 build 跑一次（`rollup -c`）；大 monorepo 用 Turborepo 并行 watch。

### 模式 10：多入口 + 多输出

**问题场景**：库同时支持浏览器（ESM + min）和 Node（CJS）；多 package monorepo 每个 entry 单独打包；多入口共享部分代码。

**解决方案**：`input` 对象多入口 + `output` 数组多输出：
```js
{
    input: {
        main: 'src/index.js',       // 入口名
        utils: 'src/utils.js',      // 共享工具
    },
    output: [
        { file: 'dist/main.esm.js', format: 'esm' },
        { file: 'dist/main.cjs.js', format: 'cjs' },
        { dir: 'dist/esm', format: 'esm', preserveModules: true },   // 保留目录
    ],
}
```

**关键参数**：
- 入口 key 决定 chunk name
- 多输出共用同一份构建（不重跑）
- 每个输出可有独立 format / sourcemap / plugin
- `preserveModules: true`：保留原文件结构（多个小文件）
- 共享 chunk：自动识别被多入口引用的模块

**最佳实践**：库出 ESM + CJS + min 三个输出；`preserveModules` 用于按需引入场景；不要混淆（min 输出用 terser）。

---

## 第三段：Plugin 生态与多语言支持

### 模式 11：常用 Plugin 生态

**问题场景**：需要支持 TypeScript / Vue / JSX / JSON / CSS / CommonJS 怎么办？plugin 顺序敏感吗？

**解决方案**：rollup 官方 + 社区 plugin：
- `@rollup/plugin-typescript`：TS 编译
- `@rollup/plugin-node-resolve`：解析 node_modules
- `@rollup/plugin-commonjs`：转 CJS 为 ESM
- `@rollup/plugin-json`：import JSON
- `@rollup/plugin-babel`：Babel 转换
- `rollup-plugin-vue`：Vue SFC
- `rollup-plugin-postcss`：CSS + autoprefixer
- `rollup-plugin-terser`：压缩

```js
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'
import { terser } from 'rollup-plugin-terser'

export default {
    plugins: [
        resolve(),         // 1. 先 resolve（node_modules）
        commonjs(),        // 2. 转 CJS 为 ESM
        typescript(),      // 3. TS 编译
        json(),            // 4. JSON 转 ESM
        terser(),          // 5. 压缩（最后）
    ],
}
```

**关键参数**：
- 顺序：resolve → commonjs → typescript → json → babel → terser
- `@rollup/plugin-node-resolve` 必须最先（否则 node_modules 找不到）
- 不要重复转译（ts + babel 同时配会出错）
- terser 放最后（输出前压缩）

**最佳实践**：库项目标配：`node-resolve` + `commonjs` + `typescript` + `terser`；顺序敏感（resolve 必须最先）；terser 放最后（不影响 source map 链）。

### 模式 12：与 Vite / esbuild / swc / Webpack 对比

**问题场景**：Vite（基于 rollup）、esbuild、swc、Parcel、Webpack 这么多打包器，rollup 优势在哪？什么场景选什么？

**解决方案**：
- **rollup**：库打包之王，输出 ESM 最干净，plugin 生态丰富
- **Vite**：dev 用 esbuild（快），build 用 rollup（稳）
- **esbuild**：极快（10-100x rollup），但 HMR/产物不够好
- **Webpack**：生态最全，配置复杂（适合大型应用）
- **swc**：Rust 重写，tsc 替代品（编译更快）
- **Parcel**：零配置但不够灵活

```bash
# 选型决策树
# 库/SDK → rollup（标准）
# 应用 + dev server → Vite
# 大型 monorepo → Turbopack / Rspack（Rust 重写）
# 快速原型 → esbuild + tsc
# 已有 Webpack 项目 → 继续 Webpack（迁移成本高）
```

**关键参数**：
- rollup 优势：ESM 输出最干净、tree-shaking 最强、plugin 灵活
- esbuild 优势：速度（10-100x）、TS/JSX 内置
- Vite 优势：dev server 快 + build 稳 + 现代默认
- Webpack 优势：loader 全（老项目兼容）
- swc 优势：tsc 替代（编译快）

**最佳实践**：库用 rollup（标准）；应用用 Vite（默认）；不要用 Webpack 配半天（迁移到 Vite 收益更大）；超大型 monorepo 考虑 Rspack（Rust 速度 + Webpack 兼容）。

### 模式 13：TypeScript / TSX 打包

**问题场景**：TS 项目要 rollup 打包，类型擦除、JSX 处理、声明文件（.d.ts）生成怎么搞？

**解决方案**：`@rollup/plugin-typescript` 编译 + `tsconfig.build.json` 独立 build 配置 + `rollup-plugin-dts` 单独打 d.ts bundle。

```js
// rollup.config.mjs
import typescript from '@rollup/plugin-typescript'
import dts from 'rollup-plugin-dts'

export default [
    {   // 第一阶段：打 JS
        input: 'src/index.ts',
        output: { file: 'dist/index.js', format: 'esm' },
        plugins: [typescript({ tsconfig: './tsconfig.build.json' })],
    },
    {   // 第二阶段：打 d.ts bundle（rollup-plugin-dts）
        input: 'dist/types/index.d.ts',
        output: { file: 'dist/index.d.ts', format: 'esm' },
        plugins: [dts()],
    },
]
// tsconfig.build.json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "declaration": true,
        "declarationDir": "dist/types",
        "outDir": "dist"
    },
    "exclude": ["**/*.test.ts", "tests/"]
}
```

**关键参数**：
- `tsconfig`：独立 build 配置（不包含测试）
- `declaration: true`：生成 .d.ts
- `declarationDir: 'dist/types'`：d.ts 输出
- `rollup-plugin-dts`：单独打 d.ts bundle
- `package.json` 配 `"types": "dist/index.d.ts"`

**最佳实践**：`tsconfig.build.json` 排除 test（`exclude: ["**/*.test.ts"]`）；`package.json` 配 `"types": "dist/index.d.ts"`；用 `rollup-plugin-dts` 单独打 d.ts（保证类型正确）。

### 模式 14：CommonJS 互操作

**问题场景**：老库用 CJS 写（如 lodash），rollup 只支持 ESM 怎么办？大量 CJS 依赖时打包慢。

**解决方案**：`@rollup/plugin-commonjs` 把 CJS 转 ESM：
- 识别 `module.exports = ...`
- 解析 `require()` 语法
- 处理 `__esModule` 标记
- 默认 `requireReturnsDefault: 'auto'`

```js
import commonjs from '@rollup/plugin-commonjs'
export default {
    plugins: [
        commonjs({
            include: 'node_modules/lodash/**',     // 只处理 CJS 依赖
            extensions: ['.js'],
            transformMixedEsModules: true,         // 混合 CJS/ESM
        }),
    ],
}
// lib.js (CJS)
const foo = require('lodash')
module.exports = foo
// rollup 转换后等效：
// import foo from 'lodash'
// export default foo
```

**关键参数**：
- `extensions: ['.js']`：处理 .js 文件
- `include: 'node_modules/lodash/**'`：限定范围（性能优化）
- `transformMixedEsModules: true`：混合 CJS/ESM
- 性能：大量 CJS 时慢（用 `esbuild-plugin-commonjs` 替代）
- 嵌套依赖：`commonjs` 必须 + `node-resolve` 一起

**最佳实践**：库打包时把所有 CJS 依赖转 ESM；性能敏感场景用 esbuild（`esbuild-plugin-commonjs` 5x 加速）；`include` 限定范围（不要全 node_modules 处理）。

### 模式 15：CSS / 资源处理

**问题场景**：库要把 CSS 一起打包；图片 / 字体怎么处理？组件库 CSS 抽离？

**解决方案**：
- `rollup-plugin-postcss`：CSS + autoprefixer + CSS Modules
- `@rollup/plugin-image`：import 图片
- `@rollup/plugin-url`：base64 内联小资源
- `rollup-plugin-svg`：import SVG 作为组件

```js
// rollup.config.mjs
import postcss from 'rollup-plugin-postcss'
import image from '@rollup/plugin-image'
import url from '@rollup/plugin-url'
import svg from 'rollup-plugin-svg'
import autoprefixer from 'autoprefixer'

export default {
    plugins: [
        postcss({
            extract: 'styles.css',   // 抽离成独立 CSS 文件
            modules: true,           // CSS Modules
            plugins: [autoprefixer()],
            use: ['sass'],           // 支持 SCSS
        }),
        image(),
        url({ limit: 4 * 1024 }),    // <4KB 自动 base64
        svg(),
    ],
}
// 组件库
import styles from './Button.css'   // CSS Modules
import logo from './logo.png'        // 图片 URL
```

**关键参数**：
- `extract: true`：CSS 抽离到单独文件
- `modules: true`：CSS Modules
- `plugins: [autoprefixer()]`：PostCSS 插件
- 图片 < 4KB 自动 base64（`url({ limit: 4*1024 })`）
- `use: ['sass']`：支持 SCSS

**最佳实践**：组件库 CSS 抽离成独立文件（`extract: true`）；图片 < 4KB 内联（base64）；CSS Modules 配 `modules: true`；SVG 用 `rollup-plugin-svg` 当组件。

---

## 第四段：实战范式与生态

### 模式 16：库发布到 npm 的配置

**问题场景**：库作者要发布 npm 包；ESM + CJS + min + d.ts 全套怎么配？现代打包器读哪些字段？

**解决方案**：`package.json` 关键字段：
```json
{
    "main": "./dist/index.cjs.js",
    "module": "./dist/index.esm.js",
    "types": "./dist/index.d.ts",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "import": "./dist/index.esm.js",
            "require": "./dist/index.cjs.js"
        }
    },
    "files": ["dist", "README.md"],
    "sideEffects": false
}
```

**关键参数**：
- `exports` 字段：现代打包器优先看（Node 12+ / Vite / Webpack 5+）
- `module` 字段：Webpack 4 / Rollup 看
- `main` 字段：Node + 老打包器
- `sideEffects: false`：关键 tree-shaking
- `files`：发布到 npm 的文件白名单

**最佳实践**：`exports` 字段最全（Vite/Node 优先）；保留 `main` + `module` 兼容老工具；`sideEffects: false` 必加；用 `files` 限制发布文件（不要发 .map）。

### 模式 17：性能优化清单

**问题场景**：rollup build 慢（30s+），如何加速？CI 跑构建太久怎么办？

**解决方案**：6 个加速技巧：
1. **少用 plugin**（每个 plugin 100-500ms）
2. **`@rollup/plugin-commonjs` 替换为 `esbuild-plugin-commonjs`**（5x 加速）
3. **`rollup-plugin-esbuild` 替代 `@rollup/plugin-typescript` + `babel`**（5-10x）
4. **增量构建**：`output.preserveModules: true`
5. **缓存**：`rollup --cache`
6. **并行**：Turborepo `turbo run build --parallel`

```js
// rollup.config.mjs（性能优化版）
import esbuild from 'rollup-plugin-esbuild'   // 5-10x 比 typescript 快
import { nodeResolve } from '@rollup/plugin-node-resolve'
export default {
    input: 'src/index.ts',
    output: { file: 'dist/bundle.js', format: 'esm', sourcemap: true },
    plugins: [
        nodeResolve(),
        esbuild({ target: 'es2020', tsconfig: './tsconfig.json' }),  // esbuild 编译 TS
    ],
}
// 跑：rollup -c
// 监控：rollup --perf  （--perf flag 显示 plugin 耗时）
```

**关键参数**：
- `cache: true`：rollup 内部缓存
- 跳过 sourcemap（dev 模式）
- 用 esbuild + rollup 组合
- 监控：`rollup --perf` 显示 plugin 耗时
- Turborepo 并行：5-10x 加速

**最佳实践**：库项目用 `rollup-plugin-esbuild`（5x 加速）；dev 跳过 sourcemap（speed up 2x）；CI 必加 `cache`；大 monorepo 用 Turborepo。

### 模式 18：测试集成

**问题场景**：build 完要测试产物（不是源码）；ESM/CJS 都能测吗？覆盖率怎么算？

**解决方案**：
- **Vitest**：原生支持 ESM，最快（推荐）
- **Jest**：配 `@rollup/plugin-commonjs` 或 `ts-jest` 处理 ESM
- **uvu**：极简测试 runner
- **测试产物**：`import { fn } from '../dist/index.esm.js'`

```js
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        coverage: { provider: 'c8' },
    },
})
// src/index.test.ts
import { describe, it, expect } from 'vitest'
import { add } from '../src/index'    // 测源码（开发期）
// 或测产物
import { add } from '../dist/index.esm.js'   // 测产物（发布前）
```

**关键参数**：
- Vitest 配 `vite.config.ts`（基于 rollup）
- Jest 配 `transform: { '^.+\\.ts$': 'ts-jest' }`
- 测试 ESM 产物：Jest v28+ experimental ESM
- 覆盖率：`c8` / `istanbul`
- Vitest 测 ESM 产物（vs Jest 配 transform）

**最佳实践**：库项目 Vitest 测源码 + 测产物（CI 必跑）；不要在 Jest 上死磕 ESM（Jest ESM 支持实验性）；覆盖率用 `c8`（快）。

### 模式 19：Monorepo 中的 rollup

**问题场景**：monorepo 多 package，每个包要 rollup build；如何共享配置？CI 跑全 monorepo 慢怎么办？

**解决方案**：
- 共享 `rollup.config.base.js` → 各 package 扩展
- pnpm workspace + changesets
- Turborepo / Nx 跑并行 build
- `rollup --configListPlugin` 调试

```js
// rollup.config.base.mjs（共享基础）
import { nodeResolve } from '@rollup/plugin-node-resolve'
import esbuild from 'rollup-plugin-esbuild'
export function createBaseConfig(opts) {
    return {
        input: opts.input,
        output: opts.output,
        plugins: [
            nodeResolve(),
            esbuild({ target: 'es2020' }),
        ],
        external: opts.external,
    }
}
// packages/foo/rollup.config.mjs（扩展）
import { createBaseConfig } from '../../rollup.config.base.mjs'
export default createBaseConfig({
    input: 'src/index.ts',
    output: { file: 'dist/foo.esm.js', format: 'esm' },
    external: ['react'],
})
```

**关键参数**：
- pnpm catalog 协议：统一 TS 版本
- changesets：版本管理
- Turborepo：`turbo run build --parallel`（5-10x 加速）
- 共享 plugin 列表
- 独立 tsconfig.build.json

**最佳实践**：monorepo 必用 Turborepo（5-10x 加速 build）；共享 base config（不复制粘贴）；`pnpm` workspace + `catalog:` 协议统一依赖版本。

### 模式 20：rollup vs tsup vs unbuild

**问题场景**：tsup（基于 esbuild）号称"零配置 TS 打包"，要不要从 rollup 切到 tsup？unbuild（Nuxt 用）呢？

**解决方案**：
- **tsup**：极快（5-10x rollup），零配置（TypeScript 优先）
- **rollup**：灵活，plugin 生态丰富，库作者首选
- **unbuild**（Nuxt 团队）：多产物 + 智能依赖 external
- **实战**：中小库用 tsup（5 分钟起步）；复杂需求用 rollup

```bash
# tsup 一行命令
tsup src/index.ts --format esm,cjs --dts
# 等效 rollup.config.mjs（30 行）
# tsup 内部用 esbuild，速度 5-10x
# 限制：不支持 rollup plugin（用 esbuild plugin）
```

**关键参数**：
- tsup：`tsup src/index.ts --format esm,cjs --dts`
- tsup 内部用 esbuild
- 不支持 rollup plugin（用 esbuild plugin）
- 大型库（Vue / React / Svelte）仍 rollup
- unbuild：智能判断依赖是源码还是产物

**最佳实践**：80% 库用 tsup（5 分钟搞定）；特殊需求（自定义 chunking、legacy browser、多产物复杂场景）用 rollup；unbuild 用于"既要源码又要产物"的混合包。

---

## 附录：5 段必读代码

1. `src/rollup/index.ts:1-50` — 入口（CLI 解析 + watch 模式）
2. `src/utils/parseAst.ts:100-200` — AST 解析（rollup 用 acorn）
3. `src/finalisers/` — 各格式（ESM/CJS/UMD/IIFE）输出（关键 finalisers/es.ts）
4. `src/Graph.ts:200-300` — 依赖图构建（核心算法 Module Graph）
5. `src/utils/treeshake.ts:50-150` — Tree-shaking 算法（标记 unused export + 副作用分析）

## 一句话总结

rollup = ES Module 原生支持 + 静态依赖图 + Tree-shaking（acorn AST + sideEffects 检测）+ Plugin 系统（resolveId/load/transform/renderChunk 4 大 hook）+ 多格式输出（ESM/CJS/UMD/IIFE）+ source map；把"库打包"做到 ESM 输出最干净、tree-shaking 最强，Vite/Webpack/Rspack 都借鉴其设计思想，是库作者的事实标准，最值得偷的是"plugin 钩子链（4 个核心 hook）+ sideEffects 标记"的库打包范式。
