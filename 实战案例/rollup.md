# rollup - ES Module 时代的 Tree-shaking 标杆打包器

**GitHub**: rollup/rollup
**Star**: 26k+
**语言**: TypeScript
**主题**: 打包器 / ESM / Tree-shaking / 库构建
**适用场景**: 库/SDK 打包（Vue / React / Svelte 官方用 rollup）、应用层打包（Vite 底层用 rollup）

---

## 第一段：基础范式

### 模式 1：ES Module 原生支持 + Tree-shaking

**问题场景**：CommonJS `require()` 静态分析难，无法做 tree-shaking；打包后 bundle 含未用代码，体积大 30-50%。

**解决方案**：rollup 专为 ES Module 设计：所有 `import` / `export` 是静态的（不能写在 if 里），打包器能在编译期画出完整依赖图，删掉没被 import 的 export。

**关键参数**：
- 入口：`input: 'src/main.js'`
- 输出：`output: { file: 'dist/bundle.js', format: 'esm' }`
- 格式：`esm` / `cjs` / `umd` / `iife` / `amd`
- 默认开 tree-shaking

**最佳实践**：库打包首选 rollup（输出 ESM 最干净）；应用层用 Vite（基于 rollup）。

### 模式 2：单文件输出（IIFE / ESM）

**问题场景**：浏览器直接 `<script>` 加载要 IIFE（立即执行函数）；CommonJS 项目要 CJS 输出。

**解决方案**：`output.format` 控制输出：
- `esm`：保留 ES Module 语法（库首选）
- `cjs`：CommonJS（Node 库）
- `iife`：立即执行函数（浏览器 `<script>`）
- `umd`：UMD（同时支持 AMD/CJS/global）

**关键参数**：
- `name: 'MyLib'`：IIFE/UMD 的全局变量名
- `file: 'dist/my-lib.js'`：输出路径
- `sourcemap: true`：生成 source map
- `globals: { vue: 'Vue' }`：UMD external 映射

**最佳实践**：库作者出 ESM + CJS 双格式（`@rollup/plugin-json` + `output: [{...esm}, {...cjs}]`）。

### 模式 3：External 标记外部依赖

**问题场景**：库依赖 React/Vue；打包时不该把 React 一起打进 bundle（避免重复、版本冲突）。

**解决方案**：`external: ['react', 'react-dom']` 告诉 rollup 不要 bundle 这些 import，运行时从 `node_modules` 解析。

**关键参数**：
- `external: ['react']`：单依赖
- `external: ['@scope/*']`：glob 匹配
- `external: (id) => id.startsWith('react')`：函数判断
- `output.globals`：UMD 格式的全局变量名映射

**最佳实践**：库打包 100% external 依赖；让用户控制版本。

### 模式 4：Plugin 系统

**问题场景**：rollup 只处理 JS；JSON / CSS / Vue SFC / TypeScript 怎么办？自定义 transform 怎么做？

**解决方案**：rollup 核心提供 hook 钩子（`resolveId` / `load` / `transform` / `renderChunk`），plugin 实现这些 hook 改变文件加载/转换逻辑。

**关键参数**：
- `resolveId(id, importer)`：解析模块 ID
- `load(id)`：返回文件内容
- `transform(code, id)`：转换源码（babel/ts 编译）
- `renderChunk(code, chunk)`：后处理生成 chunk

**最佳实践**：所有非 JS 资源走 plugin；不要 hack rollup 内部。

### 模式 5：Config 文件（rollup.config.js）

**问题场景**：复杂打包配置（多入口 + 多格式 + plugin）命令行塞不下。

**解决方案**：`rollup.config.js`（CommonJS）或 `rollup.config.mjs`（ESM）导出默认 config 对象。`rollup -c` 读取。

**关键参数**：
- `input`：入口文件
- `output`：输出配置（数组支持多输出）
- `plugins`：plugin 数组
- `external`：外部依赖
- `watch`：开发期 watch 模式

**最佳实践**：库项目必用 config 文件；小 demo 可命令行参数。

---

## 第二段：扩展范式

### 模式 6：Tree-Shaking 原理

**问题场景**：为什么 ES Module 才能 tree-shaking？CJS 不行？

**解决方案**：rollup 编译期分析所有 `import` / `export`：
- 未被 `import` 的 `export` → 标记 unused → 删除
- 副作用检测：纯函数（无顶层副作用）可安全删除
- `sideEffects: false` 在 `package.json` 关闭副作用检测

**关键参数**：
- `package.json` 设 `"sideEffects": false`（或数组列出有副作用的文件）
- 函数声明被删时，函数体内代码连带删除
- 副作用（如 `console.log` 顶层）保留
- `@rollup/plugin-terser` 进一步压缩

**最佳实践**：库作者必设 `sideEffects: false`（大幅提升 tree-shaking 效果）。

### 模式 7：Code Splitting

**问题场景**：单 bundle 1MB 首屏慢；路由级 / 组件级懒加载怎么拆？

**解决方案**：rollup 静态分析 `import()` 动态导入，拆成多个 chunk：
```js
// 应用层用 Vite/Webpack 的 import() 即可
const Settings = () => import('./Settings.js')
```

**关键参数**：
- `output.dir: 'dist'`：目录输出（多文件）
- `output.chunkFileNames: '[name]-[hash].js'`
- `output.entryFileNames: '[name].js'`
- 动态 import 自动拆分

**最佳实践**：应用层用 Vite（基于 rollup + code splitting）；库打包一般不开。

### 模式 8：Source Maps

**问题场景**：生产环境报错要看 stack trace 定位源码；bundle 后定位难。

**解决方案**：`output.sourcemap: true` 生成 `.map` 文件，浏览器 DevTools 自动加载。

**关键参数**：
- `sourcemap: true`：生成独立 .map 文件
- `sourcemap: 'inline'`：内嵌为 data URI（单文件）
- `sourcemap: 'hidden'`：生成但不关联（不报错）
- 配合 Sentry / Bugsnag 上传 .map

**最佳实践**：生产环境生成 .map 但不公开（防止源码泄露）；上 Sentry 才上传。

### 模式 9：Watch 模式

**问题场景**：开发库时改一行代码要重跑 build；命令行反复 build 慢。

**解决方案**：`rollup -c -w` watch 模式，文件变化自动 rebuild。集成 `chokidar`（rollup 内部用）。

**关键参数**：
- `-w` / `--watch`：watch 模式
- `watch.include: 'src/**'`
- `watch.exclude: 'node_modules/**'`
- 与 `rollup-plugin-livereload` 配浏览器刷新

**最佳实践**：开发库用 watch + livereload；正式 build 跑一次。

### 模式 10：多入口 + 多输出

**问题场景**：库同时支持浏览器（ESM + min）和 Node（CJS）；多 package monorepo 每个 entry 单独打包。

**解决方案**：`input` 对象多入口 + `output` 数组多输出：
```js
input: { main: 'src/index.js', utils: 'src/utils.js' }
output: [
  { file: 'dist/main.esm.js', format: 'esm' },
  { file: 'dist/main.cjs.js', format: 'cjs' },
]
```

**关键参数**：
- 入口 key 决定 chunk name
- 多输出共用同一份构建
- 每个输出可有独立 format / sourcemap
- preserveModules：保留原文件结构

**最佳实践**：库出 ESM + CJS + min 三个输出；不混淆。

---

## 第三段：进阶范式

### 模式 11：常用 Plugin 生态

**问题场景**：需要支持 TypeScript / Vue / JSX / JSON / CSS / CommonJS 怎么办？

**解决方案**：rollup 官方 + 社区 plugin：
- `@rollup/plugin-typescript`：TS 编译
- `@rollup/plugin-node-resolve`：解析 node_modules
- `@rollup/plugin-commonjs`：转 CJS 为 ESM
- `@rollup/plugin-json`：import JSON
- `@rollup/plugin-babel`：Babel 转换
- `rollup-plugin-vue`：Vue SFC
- `rollup-plugin-postcss`：CSS + autoprefixer
- `rollup-plugin-terser`：压缩

**关键参数**：
- 顺序：resolve → commonjs → typescript → json → babel → terser
- `@rollup/plugin-node-resolve` 必须最先
- 不要重复转译（ts + babel 同时配会出错）

**最佳实践**：库项目标配：node-resolve + commonjs + typescript + terser。

### 模式 12：与 Vite / esbuild 对比

**问题场景**：Vite（基于 rollup）、esbuild、swc、Parcel、Webpack 这么多打包器，rollup 优势在哪？

**解决方案**：
- **rollup**：库打包之王，输出 ESM 最干净
- **Vite**：dev 用 esbuild（快），build 用 rollup（稳）
- **esbuild**：极快（10-100x rollup），但 HMR/产物不够好
- **Webpack**：生态最全，配置复杂
- **Parcel**：零配置但不够灵活

**关键参数**：
- 库 → rollup（标准）
- 应用 + dev server → Vite
- 大型 monorepo → Turbopack / Rspack（Rust 重写）
- 快速原型 → esbuild + tsc

**最佳实践**：库用 rollup；应用用 Vite；不要用 Webpack 配半天。

### 模式 13：TypeScript / TSX 打包

**问题场景**：TS 项目要 rollup 打包，类型擦除、JSX 处理、声明文件（.d.ts）生成怎么搞？

**解决方案**：
```js
import typescript from '@rollup/plugin-typescript'
plugins: [typescript({ tsconfig: './tsconfig.build.json' })]
```

**关键参数**：
- `tsconfig`：独立 build 配置（不包含测试）
- `declaration: true`：生成 .d.ts
- `declarationDir: 'dist/types'`：d.ts 输出
- `outDir`：JS 输出
- 配 `rollup-plugin-dts` 单独打包 d.ts bundle

**最佳实践**：`tsconfig.build.json` 排除 test；`package.json` 配 `"types": "dist/index.d.ts"`。

### 模式 14：CommonJS 互操作

**问题场景**：老库用 CJS 写（如 lodash），rollup 只支持 ESM 怎么办？

**解决方案**：`@rollup/plugin-commonjs` 把 CJS 转 ESM：
- 识别 `module.exports = ...`
- 解析 `require()` 语法
- 处理 `__esModule` 标记
- 默认 `requireReturnsDefault: 'auto'`

**关键参数**：
- `extensions: ['.js']`：处理 .js 文件
- `include: 'node_modules/lodash/**'`
- `transformMixedEsModules: true`：混合 CJS/ESM
- 性能：大量 CJS 时慢（用 esbuild-plugin-commonjs 替代）

**最佳实践**：库打包时把所有 CJS 依赖转 ESM；性能敏感场景用 esbuild。

### 模式 15：CSS / 资源处理

**问题场景**：库要把 CSS 一起打包；图片 / 字体怎么处理？

**解决方案**：
- `rollup-plugin-postcss`：CSS + autoprefixer + CSS Modules
- `@rollup/plugin-image`：import 图片（`import logo from './logo.png'`）
- `@rollup/plugin-url`：base64 内联小资源
- `rollup-plugin-svg`：import SVG 作为组件

**关键参数**：
- `extract: true`：CSS 抽离到单独文件
- `modules: true`：CSS Modules
- `plugins: [autoprefixer()]`：PostCSS 插件
- 图片 < 4KB 自动 base64

**最佳实践**：组件库 CSS 抽离成独立文件；图片 < 4KB 内联。

---

## 第四段：实战范式

### 模式 16：库发布到 npm 的配置

**问题场景**：库作者要发布 npm 包；ESM + CJS + min + d.ts 全套怎么配？

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
- `exports` 字段：现代打包器优先看
- `module` 字段：Webpack 4/Rollup 看
- `main` 字段：Node + 老打包器
- `sideEffects: false`：关键 tree-shaking

**最佳实践**：`exports` 字段最全；保留 main + module 兼容老工具。

### 模式 17：性能优化清单

**问题场景**：rollup build 慢（30s+），如何加速？

**解决方案**：
1. **少用 plugin**（每个 plugin 100-500ms）
2. **`@rollup/plugin-commonjs` 替换为 `esbuild-plugin-commonjs`**（5x 加速）
3. **`rollup-plugin-esbuild`** 替代 `@rollup/plugin-typescript` + `babel`（5-10x）
4. **增量构建**：`output.preserveModules: true`
5. **缓存**：`rollup --cache`

**关键参数**：
- `cache: true`：rollup 内部缓存
- 跳过 sourcemap（dev 模式）
- 用 esbuild + rollup 组合
- 监控：`rollup --perf`

**最佳实践**：库项目用 `rollup-plugin-esbuild`（5x 加速）。

### 模式 18：测试集成

**问题场景**：build 完要测试产物（不是源码）；ESM/CJS 都能测吗？

**解决方案**：
- **Vitest**：原生支持 ESM，最快
- **Jest**：配 `@rollup/plugin-commonjs` 或 `ts-jest` 处理 ESM
- **uvu**：极简测试 runner
- **测试产物**：`import { fn } from '../dist/index.esm.js'`

**关键参数**：
- Vitest 配 `vite.config.ts`（基于 rollup）
- Jest 配 `transform: { '^.+\\.ts$': 'ts-jest' }`
- 测试 ESM 产物：Jest v28+ experimental ESM
- 覆盖率：c8 / istanbul

**最佳实践**：库项目 Vitest 测源码 + 测产物；不要在 Jest 上死磕 ESM。

### 模式 19：Monorepo 中的 rollup

**问题场景**：monorepo 多 package，每个包要 rollup build；如何共享配置？

**解决方案**：
- 共享 `rollup.config.base.js` → 各 package 扩展
- pnpm workspace + changesets
- Turborepo / Nx 跑并行 build
- `rollup --configListPlugin` 调试

**关键参数**：
- pnpm catalog 协议：统一 TS 版本
- changesets：版本管理
- Turborepo：`turbo run build --parallel`
- 共享 plugin 列表

**最佳实践**：monorepo 必用 Turborepo（5-10x 加速 build）；共享 base config。

### 模式 20：rollup vs tsup

**问题场景**：tsup（基于 esbuild）号称"零配置 TS 打包"，要不要从 rollup 切到 tsup？

**解决方案**：
- **tsup**：极快（5-10x rollup），零配置（TypeScript 优先）
- **rollup**：灵活，plugin 生态丰富，库作者首选
- **实战**：中小库用 tsup（5 分钟起步）；复杂需求（多入口 + 多格式 + 特殊 plugin）用 rollup

**关键参数**：
- tsup：`tsup src/index.ts --format esm,cjs --dts`
- tsup 内部用 esbuild
- 不支持 rollup plugin（用 esbuild plugin）
- 大型库（如 Vue、React）仍 rollup

**最佳实践**：80% 库用 tsup（5 分钟搞定）；特殊需求（自定义 chunking、legacy browser）用 rollup。

---

## 附录：5 段必读代码

1. `src/rollup/index.ts:1-50` — 入口（CLI 解析 + watch 模式）
2. `src/utils/parseAst.ts:100-200` — AST 解析（rollup 用 acorn）
3. `src/finalisers/` — 各格式（ESM/CJS/UMD/IIFE）输出
4. `src/Graph.ts:200-300` — 依赖图构建（核心算法）
5. `src/utils/treeshake.ts:50-150` — Tree-shaking 算法（标记 unused export + 副作用分析）

## 一句话总结

rollup = ES Module 原生支持 + 静态依赖图 + Tree-shaking + Plugin 生态，把"库打包"做到 ESM 输出最干净，Vite/Webpack/Rspack 都基于其设计思想，库作者的事实标准。
