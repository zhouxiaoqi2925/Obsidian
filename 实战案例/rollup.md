# Rollup - ES Module 时代的 Tree-Shaking 标杆打包器

**GitHub**: rollup/rollup
**Star**: 26k+
**语言**: TypeScript
**主题**: bundler、esm、tree-shaking、library
**适用场景**: npm 库打包、Vite 生产构建、ESM 应用打包、组件库

---

## 一、基础范式

### 模式 1 · ES Module 入口 + Tree Shaking

**问题场景**：Webpack 早期不支持 ES Module 静态分析，库打包带无用代码。

**解决方案**：Rollup 原生 ES Module 解析，静态分析 `import` / `export` 找出未使用代码删除（Tree Shaking）；输出 ES / CJS / UMD 多种格式。

**关键参数**：
- ESM 入口
- 静态分析
- Tree Shaking
- 多种输出格式
- 库首选

**最佳实践**：所有 npm 库用 Rollup 打包，bundle 体积小 30%。

### 模式 2 · 配置文件（rollup.config.js）

**问题场景**：打包参数复杂（input / output / plugins）。

**解决方案**：`rollup.config.js` 导出默认配置对象 `{ input, output, plugins, external }`；`npx rollup -c` 跑。

**关键参数**：
- `input` 入口
- `output: { file, format, name, sourcemap }`
- `plugins` 插件数组
- `external` 外部依赖
- 0 配置启动

**最佳实践**：所有库项目用 `rollup.config.js` 标准化。

### 模式 3 · 多格式输出（ES / CJS / UMD / IIFE）

**问题场景**：库需要同时支持 ESM（现代）/ CJS（Node）/ UMD（浏览器脚本）。

**解决方案**：`output: [{ file: 'dist/index.js', format: 'es' }, { file: 'dist/index.cjs', format: 'cjs' }, { file: 'dist/index.umd.js', format: 'umd', name: 'MyLib' }]` 数组多输出。

**关键参数**：
- `format: 'es'`
- `format: 'cjs'`
- `format: 'umd'`
- `format: 'iife'`
- 多 output

**最佳实践**：所有库项目用 ES + CJS 双输出，package.json `exports` 字段指向。

### 模式 4 · 插件系统（@rollup/plugin-*）

**问题场景**：需要处理非 JS 文件（TypeScript / CSS / JSON / 图像）。

**解决方案**：Rollup 插件是对象 `{ name, buildStart, transform, load, resolveId, ... }`；`@rollup/plugin-typescript` / `@rollup/plugin-node-resolve` / `@rollup/plugin-commonjs` / `@rollup/plugin-json` 是核心插件。

**关键参数**：
- 插件对象
- `buildStart` 钩子
- `transform` 转译
- `resolveId` 解析
- `load` 加载

**最佳实践**：所有 TS / CSS 库用 `@rollup/plugin-typescript` + `@rollup/plugin-node-resolve`。

### 模式 5 · 代码分割（manualChunks / dynamic import）

**问题场景**：应用打包需要按需加载（多入口 / 共享代码）。

**解决方案**：`output.manualChunks(id => id.includes('node_modules') ? 'vendor' : null)` 拆 vendor；`import('./lazy.js')` 动态导入自动 split。

**关键参数**：
- `manualChunks`
- 动态 import
- 自动 split
- chunk 名
- 0 手工

**最佳实践**：所有大型库 + 应用用 manualChunks 拆 vendor。

---

## 二、扩展范式

### 模式 6 · 外部依赖（external）

**问题场景**：库依赖 React / Vue 等大包，不应打入 bundle。

**解决方案**：`external: ['react', 'react-dom', /^@babel\/.*/]` 配置外部依赖；输出保留 `import` 语句，让消费方提供。

**关键参数**：
- `external: [...]`
- 正则匹配
- `peerDependencies`
- 减小 bundle
- 0 重复

**最佳实践**：所有库用 external 把 peerDependencies 排除，bundle 减小 90%。

### 模式 7 · 监听模式（rollup --watch）

**问题场景**：开发时需要增量构建。

**解决方案**：`npx rollup -c -w` 进入 watch 模式，文件变化自动重新打包；`rollup-plugin-serve` 起本地服务器；`rollup-plugin-livereload` 浏览器自动刷新。

**关键参数**：
- `-w` / `--watch`
- 增量构建
- 插件 server
- livereload
- 0 手动

**最佳实践**：所有库开发用 `-w` 模式 + serve 插件。

### 模式 8 · TypeScript 支持

**问题场景**：库用 TypeScript 写，需要编译。

**解决方案**：`@rollup/plugin-typescript` 插件调用 TypeScript 编译器；`tsconfig.json` 配置 `declaration: true` 输出 `.d.ts`；`rollup-plugin-dts` 单独打包类型声明。

**关键参数**：
- `@rollup/plugin-typescript`
- `tsconfig.json`
- `.d.ts` 输出
- `rollup-plugin-dts`
- 类型 + 运行时

**最佳实践**：所有 TS 库用 `@rollup/plugin-typescript` + `rollup-plugin-dts` 双打包。

### 模式 9 · 压缩（@rollup/plugin-terser）

**问题场景**：生产 bundle 体积需要压缩。

**解决方案**：`@rollup/plugin-terser` 插件调用 Terser 压缩；`output.plugins: [terser()]` 数组形式；`@rollup/plugin-swc` 更快压缩（Rust 写）。

**关键参数**：
- `@rollup/plugin-terser`
- `output.plugins`
- `@rollup/plugin-swc`
- 体积减少 50%
- 0 配置

**最佳实践**：所有生产库用 terser / swc 压缩。

### 模式 10 · Source Maps

**问题场景**：打包后调试需要 source map。

**解决方案**：`output: { sourcemap: true }` 输出 `.js.map`；`sourcemap: 'inline'` 内联；`sourcemap: 'hidden'` 不带 `//# sourceMappingURL` 注释。

**关键参数**：
- `sourcemap: true`
- `'inline'`
- `'hidden'`
- `.js.map`
- 调试

**最佳实践**：所有库都生成 source map，调试体验 10x。

---

## 三、进阶范式

### 模式 11 · 入口预设（多入口）

**问题场景**：库需要多个入口（`index` / `browser` / `node`）。

**解决方案**：`input: { main: 'src/index.ts', browser: 'src/browser.ts', node: 'src/node.ts' }` 多入口；`output.entryFileNames: '[name].js'` 输出多文件。

**关键参数**：
- `input` 对象
- 多入口
- `entryFileNames`
- 多文件
- 0 配置

**最佳实践**：所有多环境库用多入口 + `package.json` `exports` 字段。

### 模式 12 · 副作用标记（sideEffects）

**问题场景**：库有 CSS 副作用，Tree Shaking 误删。

**解决方案**：`package.json` 配 `"sideEffects": ["*.css", "*.scss"]` 标记有副作用的文件；`"sideEffects": false` 表示全部无副作用（Tree Shaking 最激进）。

**关键参数**：
- `sideEffects`
- `false` 全无副作用
- 文件数组
- 保留 CSS
- 0 误删

**最佳实践**：所有纯 JS 库配 `"sideEffects": false` 启用激进 Tree Shaking。

### 模式 13 · Vite 集成（生产构建）

**问题场景**：Vite 项目用 Rollup 替代 Vite 自己的打包。

**解决方案**：Vite 生产模式（`vite build`）内部用 Rollup，`build.rollupOptions` 透传 Rollup 配置；Vite dev 用 esbuild 不走 Rollup。

**关键参数**：
- `vite build` 内部 Rollup
- `build.rollupOptions`
- dev 用 esbuild
- 生产用 Rollup
- 0 重复

**最佳实践**：所有 Vite 项目用 `build.rollupOptions` 高级配置。

### 模式 14 · 浏览器原生 ESM 输出

**问题场景**：现代浏览器需要 `<script type="module">` 直接 import。

**解决方案**：`output.format: 'es'` + `output.dir: 'dist'` 输出目录；`index.html` 直接 `<script type="module" src="./dist/index.js">`；CDN 部署如 esm.sh / jspm。

**关键参数**：
- `format: 'es'`
- `output.dir`
- `<script type="module">`
- CDN
- 0 打包

**最佳实践**：所有现代浏览器项目用原生 ESM 输出，jspm 部署。

### 模式 15 · Alias 别名（@rollup/plugin-alias）

**问题场景**：需要路径别名（`@/components`）。

**解决方案**：`@rollup/plugin-alias` 插件配 `entries: [{ find: '@', replacement: path.resolve(__dirname, 'src') }]`；替代 Webpack/Vite alias。

**关键参数**：
- `@rollup/plugin-alias`
- `entries`
- `find` / `replacement`
- 别名
- 0 相对路径

**最佳实践**：所有库项目用 alias 告别相对路径。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Rollup 库。

**解决方案**：7 件套：① `rollup.config.js` ② `@rollup/plugin-typescript` ③ `@rollup/plugin-node-resolve` + `commonjs` ④ `@rollup/plugin-terser` ⑤ ES + CJS 双输出 ⑥ `package.json` `exports` 字段 ⑦ `sideEffects: false`。

**关键参数**：
- rollup.config.js
- TypeScript
- node-resolve / commonjs
- terser
- ES + CJS
- exports
- sideEffects

**最佳实践**：所有新库用 7 件套 + Rollup，5 分钟跑起来。

### 模式 17 · 库发布流程（changesets / release-it）

**问题场景**：库版本管理 + CHANGELOG + 发布。

**解决方案**：`@changesets/cli` 管理工作流（`pnpm changeset` 添加变更 / `pnpm version` 升级版本 / `pnpm release` 发布）；自动生成 CHANGELOG；GitHub Action 自动发布。

**关键参数**：
- `@changesets/cli`
- `pnpm changeset`
- 自动 CHANGELOG
- GitHub Action
- 0 手动

**最佳实践**：所有 monorepo 库用 changesets 管理工作流。

### 模式 18 · 性能优化 5 招

**问题场景**：Rollup 打包慢 / bundle 大。

**解决方案**：5 招优化：① `external` 排除大依赖 ② `sideEffects: false` 激进 Tree Shaking ③ `@rollup/plugin-swc` 替代 TS 编译 ④ `output.manualChunks` 拆分 ⑤ `@rollup/plugin-terser` 压缩。

**关键参数**：
- external
- sideEffects
- swc
- manualChunks
- terser

**最佳实践**：5 招组合，Rollup 库 bundle 最小化。

### 模式 19 · 与 Webpack / Vite / Parcel 对比

**问题场景**：打包器选型。

**解决方案**：Rollup 定位「ESM 静态分析 + Tree Shaking 最强 + 库首选」适合库；Webpack 定位「生态最大 + 应用首选」适合复杂 SPA；Vite 定位「ESM dev + Rollup 生产」适合现代应用；Parcel 定位「零配置」适合 demo。

**关键参数**：
- 库打包：Rollup > Vite > Webpack > Parcel
- 应用：Webpack > Vite > Parcel > Rollup
- Tree Shaking：Rollup > Webpack > Vite > Parcel
- 学习曲线：Parcel < Vite < Rollup < Webpack

**最佳实践**：npm 库选 Rollup，应用选 Vite/Webpack，demo 选 Parcel。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Rollup 做内部打包器。

**解决方案**：7 天分 5 步：① ES Module AST 解析（acorn）② 依赖图构建 ③ 静态分析 + Tree Shaking ④ 多格式输出（ES / CJS）⑤ 插件系统。

**关键参数**：
- Day 1-2: AST
- Day 3: 依赖图
- Day 4: Tree Shaking
- Day 5: 输出
- Day 6-7: 插件

**最佳实践**：7 天复刻「极简 Rollup」，完整 Rollup 复刻需要 6 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\rollup\`
- **大小**: ~30 MB
- **总文件数**: 数百 TS 文件
- **关键 commit**: v4.x
- **作者**: Rich Harris + 社区
- **许可**: MIT

## 一句话总结

Rollup 用「ESM 静态分析 + Tree Shaking 最强 + 多格式输出 + 插件系统」成为 npm 库打包的事实标准，Vite 生产构建也基于 Rollup。
