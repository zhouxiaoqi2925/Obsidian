# mui - 十年沉淀的 Material Design React 组件库

**GitHub**: mui/material-ui
**Star**: 95k+
**语言**: TypeScript
**主题**: React组件库 / 主题系统 / CSS-in-JS / Monorepo
**适用场景**: 中后台 SaaS / 设计系统 / BFF 前端 / Next.js 项目

---

## 一、基础范式

### 1. 三层样式栈：组件 → system → styled-engine（Layered Engine）

**问题场景**：组件库要"换样式引擎"（从 emotion 切 styled-components 或 Pigment CSS）时，如果每个组件都直接 import 底层引擎，70+ 组件要改 70+ 文件，且业务方代码会因引擎升级而 break。

**解决方案**：在组件层和底层引擎之间插入 `zero-styled` 门面 + `@mui/system` 样式系统两层，组件层只依赖门面，引擎切换只改 1 个文件。
```tsx
// packages/mui-material/src/zero-styled/index.tsx
export { default as styled } from '../styles/styled';
export { css, keyframes } from '@mui/system';
export function globalCss(styles) { /* 双协议适配器 */ }
```
组件层一行：`import { styled } from '../zero-styled'`。

**关键参数**：
- 门面层（zero-styled）：隔离 styled/css/keyframes/useTheme
- 样式系统层（@mui/system）：sx prop + style 函数 + breakpoints
- 引擎层（@mui/styled-engine）：emotion/styled-components 抽象
- `'use client'` 指令：标记 Client Component
- `composeClasses`：合并用户 classes + 自动 utility class

**最佳实践**：所有组件统一从 `../zero-styled` 导入 styled，不直接 import 底层引擎。业务方换引擎零成本。

### 2. useUtilityClasses：slot → className 映射（Slot Pattern）

**问题场景**：组件有多个子元素（root/startIcon/endIcon/loadingIndicator），用户要 e2e 测试或自定义样式时，需要稳定 className 选择器；硬编码 className 会让用户无法覆写。

**解决方案**：用 `useUtilityClasses(ownerState)` 钩子把"slot 数组"映射成"className 对象"，配合 `composeClasses` 合并用户传入的 classes prop。
```js
const useUtilityClasses = (ownerState) => {
  const { color, size, variant, loading } = ownerState;
  const slots = {
    root: ['root', variant, `size${capitalize(size)}`, `color${capitalize(color)}`],
    startIcon: ['startIcon', loading && 'loading'],
  };
  return composeClasses(slots, getButtonUtilityClass, classes);
};
```

**关键参数**：
- slot 数组：声明式列出每个子元素的所有 class
- `capitalize` 工具：size + medium → sizeMedium
- `getButtonUtilityClass`：生成 `MuiButton-root MuiButton-variantContained` 形式
- 用户覆写：`classes={{ root: 'my-btn' }}` 即可精细控制

**最佳实践**：每个组件写一个 `useUtilityClasses` 钩子，className 不在 JSX 里硬编码，让 e2e/视觉回归测试稳定。

### 3. createTheme 工厂：默认值 + 用户覆盖（Theme Factory）

**问题场景**：用户用 MUI 时不可能每次都传完整 palette/typography/breakpoints；需要"开箱即用"的主题默认值，又支持用户部分覆盖。

**解决方案**：`createTheme(options)` 工厂深合并默认主题与用户 options，未传字段走默认，CSS Variables 模式（`cssVariables: true`）时主题落到 `var(--mui-palette-primary-main)`。
```ts
export default function createTheme(options: ThemeOptions = {} as any, ...args: object[]): Theme {
  const { palette, cssVariables = false, colorSchemes, defaultColorScheme, ...other } = options;
  if (cssVariables === false) {
    if (!('colorSchemes' in options)) return createThemeNoVars(options, ...args);
  }
  // ... colorSchemes 展开、palette 生成、CSS Vars 输出
}
```

**关键参数**：
- `cssVariables: false`（默认）：保持 v5 行为兼容
- `cssVariables: true`：主题切换变 DOM reflow，不重渲 React
- `colorSchemes: { light: true, dark: true }`：双主题
- `...args: object[]`：多主题 merge 兼容
- `DefaultPropsProvider`：RSC 下无 ThemeProvider 也能拿默认

**最佳实践**：库的主题默认值要让"不传任何 options 也能用"，CSS Vars 默认关闭以保持向后兼容。

### 4. sx prop：style 对象的超集（Shorthand System）

**问题场景**：用户想"快速写样式但不想写 styled component"——`style={{ mt: 2, p: 1 }}` 风格，但需要主题断点 + palette + typography 的自动展开。

**解决方案**：`sx` prop 接受"shorthand 对象"，内部经 `styleFunctionSx` 展开成 emotion 样式，支持 `mt`/`p`/`bgcolor`/`color` 等主题感知 shorthand。
```tsx
<Box sx={{
  mt: 2,           // theme.spacing(2) → '16px'
  bgcolor: 'primary.main',  // theme.palette.primary.main
  p: { xs: 1, md: 2 },       // 响应式断点
  '&:hover': { opacity: 0.8 }
}} />
```

**关键参数**：
- spacing shorthand：`mt`/`p`/`mx` 走 theme.spacing
- palette shorthand：`bgcolor`/`color` 走 theme.palette
- 响应式断点：`{ xs: 1, md: 2 }` 自动展开为 media query
- 嵌套选择器：`&:hover` 走 emotion 嵌套
- CSS 函数：`bgcolor: (theme) => theme.palette[mode].primary.main`

**最佳实践**：业务方在 demo/原型用 sx 提速，复杂组件用 styled + sx 双轨。sx 是"sugar"，styled 才是"结构"。

### 5. DefaultPropsProvider：RSC 兜底主题（Provider Bypass）

**问题场景**：Next.js App Router 下，组件可能在 React Server Component（RSC）树里被渲染，那时没有 React Context，`useTheme()` 返回 undefined；用户期待"无 ThemeProvider 也能用默认主题"。

**解决方案**：`DefaultPropsProvider` 在 client root 注入一次默认 theme + 默认 props，RSC 渲染的组件通过它读默认值，绕过 Context 限制。
```tsx
// DefaultPropsProvider.js（简化）
export default function DefaultPropsProvider({ value, children }) {
  const contextValue = React.useMemo(() => value, value);
  return (
    <DefaultPropsContext.Provider value={contextValue}>
      {children}
    </DefaultPropsContext.Provider>
  );
}
// useDefaultProps.ts
export function useDefaultProps<T>(props: T) { /* 合并 context + props */ }
```

**关键参数**：
- `useDefaultProps(props)`：合并 context 默认 + 用户 props
- RSC 安全：context 在 client root 注入
- v5 → v6 兼容：v5 行为是 v6 默认
- `unstable_useId`：RSC 下稳定 ID 生成

**最佳实践**：做兼容 RSC 的库时，"默认值"要走 Provider + hook 双轨，不要假设 Context 总是存在。

---

## 二、扩展范式

### 6. CSS Variables 双主题：DOM 级 reflow（Theme Switch）

**问题场景**：用户切换 light/dark 主题时，传统 MUI 用 emotion 改 React 状态触发整棵树重渲，复杂页面 200ms+ 卡顿；目标是"切主题不重渲"。

**解决方案**：`createTheme({ cssVariables: true })` 后，主题颜色落到 `var(--mui-palette-primary-main)`，切换主题只需在 `<html>` 上切 `data-mui-color-scheme="dark"`，浏览器 reflow 而非 React 重渲。
```ts
// createTheme.ts（简化）
if (cssVariables === true) {
  // 把 palette 序列化为 --mui-palette-primary-main: #1976d2
  cssVarPrefix: 'mui',  // → --mui-palette-...
  colorSchemes: { light: {...}, dark: {...} },
  defaultColorScheme: 'light',
}
```

**关键参数**：
- `var(--mui-palette-*)`：颜色 CSS 变量
- `data-mui-color-scheme`：根元素标记
- reflow vs repaint：DOM 重排但 React 树不变
- v5 兼容：`cssVariables: false` 时回退到 JS 主题
- `<InitColorSchemeScript>`：SSR 时注入颜色避免闪烁

**最佳实践**：新项目开 CSS Variables 模式（`cssVariables: true`），大列表/复杂表单场景下主题切换从 200ms 降到 16ms。

### 7. Pigment CSS 双轨：zero-runtime 引擎（Build-Time Extract）

**问题场景**：runtime CSS-in-JS（emotion）在大型应用首屏 hydration 时有 100-200ms 性能开销；用户期待"组件用 MUI，但 CSS 编译期提取，零运行时"。

**解决方案**：MUI v6 推出 `pigment-css-react` zero-runtime 引擎，通过 Babel plugin 编译期提取 sx/styled 为静态 CSS，运行时只有 className。保留 emotion 默认路径，业务方可按场景选。
```ts
// 引擎切换：pnpm 装 @pigment-css/react + babel plugin
// babel.config.js
plugins: [
  ['@pigment-css/react/babel', { theme: './theme.ts' }]
]
// 业务代码不变，sx/styled 自动编译期提取
```

**关键参数**：
- Babel plugin：`@pigment-css/react/babel`
- zero-runtime：sx/styled 在 build 时生成 .css 文件
- 主题对象：编译期确定，避免运行时序列化
- 兼容 emotion：通过 `internal_createExtendSxProp` 桥接
- Linaria 借鉴：参考 Linaria 的实现思路

**最佳实践**：首屏关键路径用 Pigment（landing page），交互复杂页面用 emotion（dialog/drawer），双轨制给业务方自由度。

### 8. memoTheme：浅比较绕过重渲（Theme Memoization）

**问题场景**：emotion 每次 render 都生成新 className 对象（动态 className），如果 theme 引用变了，所有 styled 组件重生成 className，导致子组件 re-render；用户传新 theme 时不希望雪崩。

**解决方案**：`memoTheme` 浅比较新旧 theme，引用没变就复用，引用变了才重生成；通常配合 `useTheme()` + `React.useMemo` 一起用。
```js
// utils/memoTheme.js（简化）
function memoTheme(prev, next) {
  if (prev === next) return prev;
  if (shallowEqual(prev.palette, next.palette) && /* ... */) return prev;
  return next;
}
```

**关键参数**：
- 浅比较：`shallowEqual(prev, next)` 即可，theme 是平铺对象
- 引用相等：未变直接返回 prev
- 配合 useMemo：父组件 `useMemo(() => createTheme(...), [...])`
- styled 重生成：theme 真变了才生成新 className

**最佳实践**：父组件用 `useMemo` 包住 theme，下游不必每处 memo 就能避免雪崩重渲。

### 9. Monorepo 拆分：18 个包按职责分（Package Boundary）

**问题场景**：MUI 有 70+ 组件、sx 系统、styled 引擎、主题、codemod，全塞一个包会让 bundle 体积大、tree-shake 失效、版本管理困难。

**解决方案**：Lerna + pnpm workspace 拆 18 个公开包 + 5 个内部包，按"职责"而非"组件类型"分——`mui-material`（核心）/ `mui-system`（sx）/ `mui-styled-engine`（引擎）/ `mui-private-theming`（主题 provider）/ `mui-lab`（实验组件）/ `mui-icons-material`（图标）。
```
mui monorepo
├── packages/mui-material 核心组件
├── packages/mui-system sx + style 函数
├── packages/mui-styled-engine styled 抽象
├── packages/mui-private-theming 主题 provider
├── packages/mui-utils composeClasses/resolveProps
├── packages/mui-lab 实验组件
├── packages/mui-icons-material 图标
├── packages/mui-codemod 升级 codemod
└── packages/pigment-css-react zero-runtime 引擎
```

**关键参数**：
- pnpm workspace：包之间软链（symlink）
- Lerna version：统一版本号
- Nx 缓存：构建结果命中跳过
- `mui-codemod`：v4→v5→v6 自动升级
- `@mui/material/Button` sub-path：单独 import 减小 bundle

**最佳实践**：组件库拆包按"职责"拆（system/material/engine），不要按"组件类型"拆（input/form/layout）——后者会让组件跨包依赖变乱。

### 10. codemod 升级路径：v4→v5→v6 自动迁移（Migration Tool）

**问题场景**：v5 改 emotion 引擎、v6 改 CSS Vars，每次大版本升级让 100 万 + 用户的业务代码 break，文档写得再好也比不上"自动改"。

**解决方案**：`@mui/codemod` 提供 jscodeshift 脚本，把 v4 语法（`makeStyles`/`withStyles`）自动改 v5 语法（`styled`），v5 改 v6 同样有 codemod。
```bash
# v4 → v5
npx @mui/codemod v5.0.0/preset-safe src/
# 包含：withStyles → styled, makeStyles → styled
# v5 → v6
npx @mui/codemod v6.0.0/preset-safe src/
```

**关键参数**：
- jscodeshift：AST 重写
- `preset-safe`：安全转换（80% 场景）
- 单独 codemod：组件级精确转换
- dry-run：`--dry` 预览不改
- 文档：每个 codemod 对应一个 RFC 编号

**最佳实践**：库的破坏性变更必须配套 codemod，否则 1 万 star 升不上去。"破坏性 + codemod" 是大型库的标配。

---

## 三、进阶范式

### 11. globalCss 双协议适配器：Pigment ↔ emotion（Adapter）

**问题场景**：Pigment CSS 的 `globalCss` 期望 callback 收到 `{ theme, ...props }` 平铺对象，emotion 的 `GlobalStyles` 期望 `(theme) => styles` 单一参数；业务方写一次代码要能在两个引擎跑。

**解决方案**：`zero-styled` 的 `globalCss` 函数用 `typeof styles === 'function'` 判断协议，包装成"看起来一样"的双协议适配器。
```ts
export function globalCss(styles: Interpolation<{ theme: Theme }>) {
  return function GlobalStylesWrapper(props: Record<string, any>) {
    return (
      <GlobalStyles
        styles={
          (typeof styles === 'function'
            ? (theme) => styles({ theme, ...props })
            : styles) as GlobalStylesProps['styles']
        }
      />
    );
  };
}
```

**关键参数**：
- 协议探测：`typeof === 'function'`
- 平铺参数：`(theme) => styles({ theme, ...props })`
- 类型断言：`as GlobalStylesProps['styles']`
- 业务方无感：写一次代码，引擎切换零改
- `internal_` 前缀：内部 API 警告用户

**最佳实践**：库支持多引擎时，"门面函数"内部做协议适配，业务方只调门面；不要让业务方自己判断引擎。

### 12. Button.js 范本：组件级单文件分析（Reference Impl）

**问题场景**：70+ 组件要保持代码风格一致，新贡献者加新组件时需要"标准范本"作为参考。

**解决方案**：`Button.js` 是 MUI 内部的"标准组件范本"——`'use client'` 指令、resolveProps 合并、useUtilityClasses 钩子、styled 组件、useDefaultProps、slots 转发，所有"必做项"都齐。
```js
// packages/mui-material/src/Button/Button.js
'use client';
import * as React from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import resolveProps from '@mui/utils/resolveProps';
import composeClasses from '@mui/utils/composeClasses';
import { styled } from '../zero-styled';
import { useDefaultProps } from '../DefaultPropsProvider';

const useUtilityClasses = (ownerState) => {
  const slots = {
    root: ['root', variant, `size${capitalize(size)}`, `color${capitalize(color)}`],
    startIcon: ['startIcon'],
  };
  return composeClasses(slots, getButtonUtilityClass, classes);
};
```

**关键参数**：
- `'use client'`：Next.js App Router 友好
- `resolveProps`：主题默认 + 用户 prop 合并
- `useDefaultProps`：RSC 兜底
- `useUtilityClasses`：slot className
- `composeClasses`：用户覆写 + 自动 class

**最佳实践**：大库的"标准组件范本"要明确写在 docs 里，新贡献者对照范本写能减少 50% PR 改动。

### 13. composeClasses：用户 class + 框架 class 合并（Class Composer）

**问题场景**：用户传 `classes={{ root: 'my-btn' }}` 想覆写 root 的 className，但框架生成的 `MuiButton-root` 不能丢（要保留选择器稳定性），用户的 utility class 也不能丢。

**解决方案**：`composeClasses(slots, getUtilityClass, userClasses)` 把"框架生成的 class + 用户传入的 class"按 slot key 合并，返回 `{ root: 'MuiButton-root my-btn', startIcon: 'MuiButton-startIcon' }`。
```js
export default function composeClasses(slots, getUtilityClass, classes) {
  const output = {};
  Object.keys(slots).forEach((slot) => {
    output[slot] = slots[slot]
      .filter(Boolean)
      .map(className => {
        const utilityClass = getUtilityClass(className);
        return classes && classes[slot]
          ? `${utilityClass} ${classes[slot]}`  // 框架 class + 用户 class
          : utilityClass;
      })
      .join(' ');
  });
  return output;
}
```

**关键参数**：
- 过滤 falsy：`loading && 'loading'` 跳过 false
- utility class 生成：`getButtonUtilityClass`
- 用户 class 后置：让用户 CSS 优先级更高
- 空格分隔：标准 className 格式
- slot-by-slot：每个 slot 独立合并

**最佳实践**：库的"用户覆写 class"机制要明确"框架 class + 用户 class" 顺序，建议用户后置（CSS 优先级高）。

### 14. Vitest + Playwright 视觉回归：截图比对（Visual Regression）

**问题场景**：组件改了一个 CSS 属性，所有视觉变了的页面都是"用户报告"才知道；单元测试断言 className 不能覆盖"按钮 padding 是 8px 还是 10px"。

**解决方案**：用 Playwright + 自研 `test/regressions/` 跑全组件 demo 截图，diff 上传 `argos-ci`（MUI 自托管的视觉回归服务），PR 触发自动对比。
```bash
# 跑视觉回归
pnpm test:regressions
# argos-ci 截图 diff
# https://argos-ci.com/mui/material-ui
```

**关键参数**：
- Playwright：跨浏览器截图（Chromium/Firefox/WebKit）
- argos-ci：像素级 diff（>0.1% 阈值报警）
- 全组件 demo：每组件跑所有 props 组合
- CI 集成：PR 触发自动截图
- 手动 baseline：第一次截图作为基准

**最佳实践**：组件库必须做视觉回归，否则 CSS 改一行不知道影响多少 demo。argos-ci 是开源方案，Percy/Chromatic 是商业。

### 15. bundle size 监控：whybundled + size-why（Bundle Audit）

**问题场景**：发版时一行 import 改动可能导致 50KB 体积膨胀，用户侧不知情，投诉"MUI 越更新越慢"。

**解决方案**：`docs:size-why` 用 `whybundled` 跑全包 size 分析，CI 报警"哪个包涨了多少"，发版前人工 review。
```bash
# 全包 size 分析
pnpm docs:size-why
# 输出：哪个包 + 哪个 import + 多少 KB
# CI 阈值：>5KB 增量报警
```

**关键参数**：
- `whybundled`：trace 哪个 import 引入多少 KB
- sub-path exports：`@mui/material/Button` 单独 import 走 sub-path
- tree-shake：ESM 导出 + sideEffects 字段
- gz 体积：CI 检查 gz 后体积
- 增量监控：每 PR diff bundle size

**最佳实践**：库发版前必须跑 size check，>5KB 增量的 PR 要在 changelog 标注，>50KB 增量要 block merge。

---

## 四、实战范式

### 16. SSR 兼容：emotion cache + Pigment 全栈（Server-Side Render）

**问题场景**：Next.js Pages/App Router 都用 MUI 时，SSR HTML 要带正确样式（避免 FOUC），hydration 又不能 mismatch；不同 Next 版本 API 还不一样。

**解决方案**：MUI 提供 `@mui/material-nextjs` 集成包，Pages Router 用 `_document.tsx` 注入 emotion cache，App Router 用 `AppRouterCacheProvider` 处理 RSC 边界。
```tsx
// app/layout.tsx（App Router）
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider } from '@mui/material/styles';

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

**关键参数**：
- `AppRouterCacheProvider`：RSC + 客户端 cache 共享
- emotion cache：服务端收集样式注入 HTML
- `<InitColorSchemeScript>`：防主题闪烁
- Pigment：SSR 输出静态 CSS
- hydration mismatch：cache key 同步

**最佳实践**：用 Next.js + MUI 必须装 `@mui/material-nextjs` 配套包，手搓 emotion cache 容易踩 hydration 坑。

### 17. 设计系统主题继承：createTheme 嵌套（Theme Composition）

**问题场景**：企业设计系统要"基线主题"（品牌色 + 字体），各产品线再覆盖（不同 secondary 颜色）；用户期待"继承 + 覆盖"模式。

**解决方案**：`createTheme(options, ...customizations)` 支持"多主题 merge"，但更好做法是"基线主题 export + 业务方 spread"。
```ts
// 基线主题
export const baseTheme = createTheme({
  palette: { primary: { main: '#1976d2' } },
  typography: { fontFamily: 'Inter, sans-serif' },
});
// 业务主题
export const productTheme = createTheme(baseTheme, {
  palette: { secondary: { main: '#dc004e' } },
});
// React 渲染
<ThemeProvider theme={productTheme}>...</ThemeProvider>
```

**关键参数**：
- spread 模式：`createTheme(...themes)` 链式 merge
- palette 优先级：后传覆盖先传
- typography inherit：未指定走父主题
- 业务方零成本：直接 `import { baseTheme }`
- v6 推荐：CSS Variables 模式下主题切换无重渲

**最佳实践**：做企业级设计系统时，"基线主题"放独立包（`@company/theme`），业务方 spread 而不是 copy。

### 18. DataGrid Pro 商业版：核心免费 + Pro 付费（Open Core）

**问题场景**：组件库 95k+ star 但单靠赞助不赚钱，团队要 30+ 人工资；用户期待"基础组件免费，高级组件付费"的开源核心模式。

**解决方案**：MUI 走 Open Core——`@mui/material`（70+ 基础组件）MIT 免费，`@mui/x-data-grid`（高级表格）/ `@mui/x-date-pickers`（高级日期选择器）分 Pro/Premium 商业许可。
```
MUI 开源核心
├── @mui/material MIT 免费
├── @mui/icons-material MIT 免费
├── @mui/system MIT 免费
└── @mui/lab MIT 免费
MUI X 商业版
├── @mui/x-data-grid Pro/Premium 商业
├── @mui/x-date-pickers Pro/Premium 商业
├── @mui/x-charts Pro/Premium 商业
└── @mui/x-tree-view Pro/Premium 商业
```

**关键参数**：
- MIT 基础：覆盖 80% 用户场景
- Pro 高级：DataGrid 行虚拟化 / 列冻结
- Premium 旗舰：DataGrid 聚合 / 行分组
- 钻石赞助商：年付 5 万美元 logo 展示
- 团队规模：~30+ maintainer

**最佳实践**：开源库要长期活下去必须有商业模式，Open Core（基础免费 + 高级付费）比"完全免费靠赞助"更可持续。

### 19. unstable_* API 治理：命名稳定性（API Lifecycle）

**问题场景**：库要实验新功能（`unstable_useId`、`unstable_ClassNameGenerator`），但用户用了之后 v2 改 API 会让所有用户 break；不暴露又无法让用户测试。

**解决方案**：MUI 用 `unstable_` 前缀标记实验 API，社区看到就不敢放心用，等稳定后改名为稳定 API（`useId`、`ClassNameGenerator`）。
```ts
// 实验阶段
import { unstable_useId as useId } from '../utils';
// 稳定后
import { useId } from '@mui/utils';
```

**关键参数**：
- `unstable_` 前缀：警告用户"会变"
- 文档标记：每个 unstable API 单独页面
- 1-2 年观察期：稳定后再 unprefix
- codemod 配合：unprefix 时同步 codemod
- SemVer：不计入 major 版本

**最佳实践**：库的"实验 API" 必须有 `unstable_` 前缀 + 文档警告 + codemod 升级路径，3 件套缺一不可。

### 20. 7 天复刻路线图：最小可运行内核（Steal Roadmap）

**问题场景**：学习者读完 95k+ star 的 MUI 源码后想"自己做一个最小版本"，但不知道从哪开始；目标是 7 天能跑出"Button + TextField + 主题"最小内核。

**解决方案**：7 天分阶段——Day1 monorepo 搭建、Day2 styled-engine 抽象、Day3 ThemeProvider、Day4 3 个核心组件、Day5 useUtilityClasses、Day6 docs 站、Day7 测试。
```
Day 1 monorepo + tsconfig + lerna
Day 2 styled-engine 抽象 + emotion
Day 3 ThemeProvider + createTheme
Day 4 Button / TextField / Paper
Day 5 useUtilityClasses slot 模式
Day 6 docs 站 + examples
Day 7 测试 + CI
```

**关键参数**：
- Day 1-2：脚手架 + 引擎抽象（地基）
- Day 3：主题系统（灵魂）
- Day 4-5：组件 + slot 模式（骨架）
- Day 6-7：docs + 测试（验收）
- 完整复刻：3 个月+（含 70+ 组件 + a11y + RTL）
- 偷骨架不偷组件：1 个组件 + 1 个主题 + 1 个引擎抽象就能搭出 10 年可演进库

**最佳实践**：学习大库不要逐组件抄，先抄"骨架"（monorepo 拆分 + 引擎门面 + 主题工厂 + slot 模式），1 个组件 + 1 个主题 + 1 个引擎抽象就能搭出可演进库。

---

**标签**: #mui #react #component-library #theming #monorepo
**状态**: 20/20 模式完整
