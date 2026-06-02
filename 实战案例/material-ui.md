# Material UI - 设计令牌与样式引擎

**来源**：GitHub mui/material-ui
**创建时间**：2026-06-02

---

## 一、设计令牌：主题系统的核心机制

### 1. createTheme 与 cssVariables 双轨（Theme Tokens）

**问题场景**：传统 v5 主题切换必须 `setState` 触发整树 re-render，大型项目（1000+ 组件）dark mode 切换肉眼可见卡顿；同时 SSR 阶段 JS 对象无法直接写到 `<html>` style 标签上导致首屏闪烁。

**解决方案**：
```typescript
import { createTheme, ThemeProvider } from '@mui/material/styles';

// v5 旧路径：JS 对象主题（默认，零 break-change）
const legacyTheme = createTheme({
  palette: { mode: 'dark', primary: { main: '#90caf9' } },
});

// v6+ 新路径：CSS 变量主题（推荐）
const varsTheme = createTheme({
  cssVariables: true,
  colorSchemes: { dark: true },
});

<ThemeProvider theme={varsTheme}>{app}</ThemeProvider>
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
| --- | --- | --- |
| `cssVariables` | `true` | 开启 `--mui-*` 变量；默认 `false` 保持 v5 兼容 |
| `colorSchemes` | `{ light: true, dark: true }` | 显式声明两套配色；未传时自动塞入 `{ light: true }` |
| `palette.mode` | `'light'` \| `'dark'` | v5 路径字段；v6 路径用 `colorSchemes.{light\|dark}` |
| `palette.primary.main` | HEX 颜色 | 主色，会自动派生出 `light` / `dark` / `contrastText` |
| `shape.borderRadius` | 数字或 CSS 变量 | 圆角，cssVariables 模式下为 `var(--mui-shape-borderRadius)` |

**最佳实践**：
- ✅ 新项目直接 `createTheme({ cssVariables: true })`，避免迁移成本
- ✅ 升级 v5 → v6 时保留 `cssVariables: false` 默认值，渐进式迁移
- ✅ 通过 `(theme.vars || theme).shape.borderRadius` 写法让组件代码兼容两套主题
- ✅ dark mode 切换只改根节点 CSS 变量，零 React re-render
- ❌ 切勿在 render 期间调用 `createTheme()`，会生成新对象引用导致整树更新
- ❌ 切勿在 cssVariables 模式下还用 `palette.mode` 字段，应改用 `colorSchemes`

### 2. useTheme 与 ThemeProvider 上下文（Theme Context）

**问题场景**：组件树深度嵌套时，props drilling 传 theme 既冗长又难以维护；styled-components 风格又和 MUI 的 sx 系统冲突。

**解决方案**：
```typescript
import { useTheme, ThemeProvider } from '@mui/material/styles';

function DeepComponent() {
  const theme = useTheme();
  return <div style={{ color: theme.palette.primary.main }} />;
}

// 嵌套覆盖（局部主题）
<ThemeProvider theme={createTheme({ palette: { primary: { main: '#ff0000' } } })}>
  <DeepComponent />
</ThemeProvider>
```

**关键参数**：

| 参数 | 说明 |
| --- | --- |
| `themeId` | 字符串，标识子主题，配合 `<ThemeProvider themeId="...">` 多主题隔离 |
| `defaultTheme` | 当 Provider 未注入时使用的兜底主题（Box 组件必传） |
| `nested` | 布尔，true 时继承父主题，false 时完全替换 |

**最佳实践**：
- ✅ Box / Typography 等基础组件接受 `themeId` 用于多主题场景
- ✅ useTheme 读取稳定引用，theme 引用未变不会触发子组件 re-render
- ✅ 自定义 Hook 封装 `useAppTheme()` 而非直接暴露 `useTheme()`，便于切换数据源
- ❌ 切勿在 HOC 中调用 `useTheme`（违反 Hooks 规则）
- ❌ 切勿在 module 顶层用 useTheme（违反 Hooks 规则）

### 3. palette 与 colorManipulator 派生色（Color Derivation）

**问题场景**：设计师只给一个主色 `#1976d2`，但组件需要 `primary.light` / `primary.dark` / `primary.contrastText` 数十个派生色，手工算易错且不可主题切换。

**解决方案**：
```typescript
import { createTheme } from '@mui/material/styles';
import { alpha, lighten, darken } from '@mui/material/styles';

// 派生效用
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      // 自动派生：light = lighten(main, 0.2)，dark = darken(main, 0.3)
    },
  },
});

// 半透明遮罩
const overlay = alpha(theme.palette.primary.main, 0.5);
const hoverBg = alpha(theme.palette.text.primary, 0.04);
```

**关键参数**：

| 函数 | 输入 | 输出 | 用途 |
| --- | --- | --- | --- |
| `lighten(color, 0-1)` | 主色 + 比例 | 偏白色 | hover 态背景 |
| `darken(color, 0-1)` | 主色 + 比例 | 偏黑色 | active 态背景 |
| `alpha(color, 0-1)` | 颜色 + 透明度 | rgba | 遮罩、悬浮层 |
| `getContrastText(bg)` | 背景色 | 文字色 | 自动决定白/黑文字 |

**最佳实践**：
- ✅ 在 createTheme 中只指定 `main`，让 MUI 自动派生其他字段
- ✅ 业务方 hover/active 态用 `alpha(theme.palette[color].main, 0.04-0.08)` 生成
- ✅ 文字颜色用 `getContrastText()` 自动决定黑白，避免硬编码
- ❌ 切勿在多处直接 `lighten('#1976d2', 0.2)`，应统一用 theme.palette 引用
- ❌ 切勿对 alpha 后的颜色再调 `lighten`/`darken`，rgba 转 hex 可能失真

### 4. breakpoints 响应式令牌（Breakpoint Tokens）

**问题场景**：业务方需要在 sx prop 中写响应式样式，CSS media query 写法心智重；不同项目断点值不一，需要 token 化统一。

**解决方案**：
```typescript
import { createTheme, useTheme } from '@mui/material/styles';

const theme = createTheme({
  breakpoints: {
    values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
  },
});

// sx 数组式响应式
<Box
  sx={{
    fontSize: { xs: '14px', md: '16px', lg: '18px' },
    p: { xs: 1, sm: 2, md: 3 },
  }}
/>

// 编程式判断
const { breakpoints } = useTheme();
const isMobile = useMediaQuery(breakpoints.down('sm')); // < 600px
```

**关键参数**：

| 断点 | 宽度阈值 | 设备类型 |
| --- | --- | --- |
| `xs` | 0px | 手机竖屏 |
| `sm` | 600px | 手机横屏 / 小平板 |
| `md` | 900px | 平板 |
| `lg` | 1200px | 桌面 |
| `xl` | 1536px | 大屏 |

**最佳实践**：
- ✅ sx 中断点简写 `{ md: { color: 'red' } }` 比写 `@media` 简洁 5 倍
- ✅ 用 `useMediaQuery(breakpoints.up('md'))` 判断移动端而非硬编码 768
- ✅ 业务方覆盖 breakpoints.values 时**保留全部 5 个 key**，避免运行时 undefined
- ❌ 切勿在 sx 嵌套对象内混用断点 key 和普通 key（同名冲突）
- ❌ 切勿对动态生成的断点（如 `'xxl'`) 写文档，团队心智负担大

### 5. typography 排版令牌（Typography Tokens）

**问题场景**：设计师给 12 种字号字重规范，但组件库没有统一入口，开发各写各的导致视觉不一致。

**解决方案**：
```typescript
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14, // 基准字号
    h1: { fontSize: '6rem', fontWeight: 300, lineHeight: 1.167 },
    button: { textTransform: 'none', fontWeight: 500 }, // 覆盖默认大写
  },
});

// 使用
<Typography variant="h1">标题</Typography>
<Typography variant="body2" color="text.secondary">副文本</Typography>
```

**关键参数**：

| 变体 | 字号 | 用途 |
| --- | --- | --- |
| `h1` ~ `h6` | 6rem → 1.25rem | 标题 |
| `subtitle1` / `subtitle2` | 1rem / 0.875rem | 副标题 |
| `body1` / `body2` | 1rem / 0.875rem | 正文 |
| `button` | 0.875rem | 按钮（默认大写） |
| `caption` | 0.75rem | 辅助文字 |

**最佳实践**：
- ✅ 业务方 `theme.typography.button` 派生按钮样式，避免硬编码
- ✅ 想禁用按钮大写用 `textTransform: 'none'`
- ✅ 自定义 `fontFamily` 时用 `fontFamily: 'Inter, "Helvetica Neue", sans-serif'` 兜底链
- ❌ 切勿覆盖 fontSize 基准值（14px）以外的体系，所有变体相对基准计算
- ❌ 切勿在 sx 中写死字号字重，应通过 variant token 引用

---

## 二、样式引擎：sx / styled / Box 的分层架构

### 6. sx prop 解析器 styleFunctionSx（Sx Engine）

**问题场景**：业务方想要"在 JSX 里写 CSS"，同时支持响应式 / 伪类 / theme 引用 / 嵌套数组；运行时解析不能太慢，编译时不能太复杂。

**解决方案**：
```javascript
// packages/mui-system/src/styleFunctionSx.js 简化版
export function styleFunctionSx(props) {
  const { sx, theme, ...other } = props;
  if (!sx) return null;

  let result = {};
  if (Array.isArray(sx)) {
    for (let i = 0; i < sx.length; i += 1) {
      const value = sx[i];
      if (typeof value === 'function') {
        result = deepmerge(result, value({ theme, ...other }), { clone: false });
      } else {
        result = deepmerge(result, value, { clone: false });
      }
    }
  } else if (typeof sx === 'function') {
    result = sx({ theme, ...other });
  } else {
    result = sx;
  }

  // 断点预处理：{ xs: ..., md: ... } → { '@media (min-width:900px)': ... }
  return breakpoints.keys.reduce((acc, key) => {
    if (result[key]) {
      acc[breakpoints.up(key)] = result[key];
      delete result[key];
    }
    return acc;
  }, result);
}
```

**关键参数**：

| sx 形式 | 解析行为 | 性能 |
| --- | --- | --- |
| 对象 `sx={{ color: 'red' }}` | 直接 assign | 最快 |
| 函数 `sx={theme => ({...})}` | 调用后 assign | 每次 render 调 |
| 数组 `sx={[{...}, theme => ({...})]}` | 逐项 deepmerge | 中等 |

**最佳实践**：
- ✅ 默认用对象形式 sx，性能最优
- ✅ 必须读 theme 时用函数形式 `sx={t => ({ color: t.palette.primary.main })}`
- ✅ 多个条件样式用数组形式按顺序合并
- ❌ 切勿在 sx 闭包内读外部变量，会破坏 memo——改成 `sx={[t => ({ color: t.palette[ext] })]}`
- ❌ 切勿在 sx 中写超大对象（嵌套 5 层以上），应拆分到 styled component

### 7. shouldForwardProp 与 processStyle 过滤（Styled Filter）

**问题场景**：styled 链会把所有 props 透传到底层 DOM，React 会警告"unknown DOM attribute"；同时 sx 引擎 / theme / ownerState 是内部消费，需要拦截。

**解决方案**：
```javascript
// packages/mui-system/src/createStyled/createStyled.js 简化版
export function shouldForwardProp(prop) {
  return prop !== 'ownerState' && prop !== 'theme' && prop !== 'sx' && prop !== 'as';
}

function processStyle(props, style, layerName) {
  const resolvedStyle = typeof style === 'function' ? style(props) : style;
  // isProcessed 标记位：styled 链嵌套时复用已处理结果
  if (resolvedStyle && resolvedStyle.isProcessed) return resolvedStyle;
  const final = serializeStyles(resolvedStyle, layerName);
  final.isProcessed = true;
  return final;
}
```

**关键参数**：

| 拦截字段 | 用途 |
| --- | --- |
| `ownerState` | 组件变体合集，业务方不写但要传 |
| `theme` | 主题对象，不落到 DOM |
| `sx` | sx 引擎自己消费 |
| `as` | 多态标签（如 `as="a"`） |

**最佳实践**：
- ✅ 业务方自定义 styled 组件时，参考 shouldForwardProp 拦截自定义 prop
- ✅ 用 `isProcessed` 标记位让嵌套 styled 短路返回
- ✅ shallowLayer 用 `@layer mui { ... }` 让业务方 CSS 优先级天然高于 MUI
- ❌ 切勿拦截 `children` / `className` / `style` 等基础 DOM 字段
- ❌ 切勿让 ownerState 落到 DOM，会触发 React 警告

### 8. ownerState 单向数据流（OwnerState Pattern）

**问题场景**：组件有十几个变体 props（variant / size / color / loading / disabled...），要传给 styled 派生样式，常规做法是 props drilling 一长串；维护性差且 React DevTools 难读。

**解决方案**：
```javascript
const Button = React.forwardRef(function Button(inProps, ref) {
  const props = useThemeProps({ name: 'MuiButton', props: inProps });
  const {
    color = 'primary', variant = 'text', size = 'medium', loading, ...
  } = props;

  // 单一数据源
  const ownerState = {
    ...props,
    color, variant, size, loading,
  };

  const classes = useUtilityClasses(ownerState);

  return (
    <ButtonRoot
      ref={ref}
      ownerState={ownerState}  // 一次传所有
      className={classes.root}
      {...other}
    >
      {loading && <CircularProgress className={classes.loadingIndicator} />}
      {children}
    </ButtonRoot>
  );
});
```

**关键参数**：

| ownerState 字段 | 类型 | 说明 |
| --- | --- | --- |
| `variant` | `'text' \| 'contained' \| 'outlined'` | 视觉变体 |
| `size` | `'small' \| 'medium' \| 'large'` | 尺寸 |
| `color` | `'primary' \| 'secondary' \| 'error' \| ...` | 主色 |
| `loading` | boolean | 加载态 |
| `disabled` | boolean | 禁用态 |

**最佳实践**：
- ✅ 组件内部用 `useUtilityClasses(ownerState)` 拆 className
- ✅ styled 函数用 `overridesResolver` 读 ownerState 派生变体样式
- ✅ 子组件只接收自己需要的子集 ownerState（如 LoadingIndicator 只读 loading）
- ❌ 切勿在 ownerState 内放非视觉相关字段（如 onClick 回调）
- ❌ 切勿让 ownerState 直接 = props，会把 children 之类基础字段传进去

### 9. variants 数组条件样式（Variants Compiling）

**问题场景**：组件有 N 个 variant（'contained' / 'outlined' / 'text'），传统做法是生成 N 个 emotion class，引入越多 variant 体积越大。

**解决方案**：
```javascript
const ButtonRoot = styled(ButtonBase)({
  // variants 数组是 v6 新增的"props 条件样式"
  variants: [
    { props: { variant: 'contained', color: 'primary' }, style: { backgroundColor: (t) => t.palette.primary.main } },
    { props: { variant: 'outlined' }, style: { border: '1px solid currentColor' } },
    { props: { size: 'small' }, style: { padding: '4px 10px', fontSize: '0.8125rem' } },
    { props: { size: 'large' }, style: { padding: '8px 22px', fontSize: '0.9375rem' } },
  ],
})(({ theme }) => ({
  minWidth: 64,
  padding: '6px 16px',
  borderRadius: (theme.vars || theme).shape.borderRadius,
}));
```

**关键参数**：

| variants 字段 | 类型 | 说明 |
| --- | --- | --- |
| `props` | 对象 | 触发条件（多字段 AND） |
| `style` | 对象或函数 | 命中时注入的样式 |

**最佳实践**：
- ✅ 同一组件的"枚举型" props 用 variants 数组，避免 class 爆炸
- ✅ variants 顺序从具体到一般（先 contained+primary，再 contained）
- ✅ 跨字段组合（variant + color）作为单一条件项，提升 SSR 缓存命中率
- ❌ 切勿在 variants 内做复杂计算（每次 render 都执行）
- ❌ 切勿让 variants 数 > 20，会让 emotion 内部 selector 矩阵过大

### 10. styled-engine 抽象层与 zero-styled 替换（Engine Abstraction）

**问题场景**：库作者要支持"业务方自己选 emotion / styled-components / Pigment CSS"，但不想在每个组件里写 if-else。

**解决方案**：
```javascript
// packages/mui-styled-engine/index.js 简化
// 业务方安装哪个就 export 哪个
import styled from '@emotion/styled';  // 默认
// 或 import styled from '@mui/styled-engine-sc';  // styled-components 版

// packages/mui-material/src/zero-styled/index.ts（v6+ 实验）
// 编译时 zero-runtime，不依赖 emotion
import { styled } from '@mui/material/zero-styled';
```

**关键参数**：

| 引擎 | runtime | bundle | RSC 兼容 |
| --- | --- | --- | --- |
| `@emotion/styled` | ✅ | 中 | ❌ |
| `styled-components` | ✅ | 大 | ❌ |
| `@pigment-css/react` | ❌（编译时） | 小 | ✅ |

**最佳实践**：
- ✅ 库作者提供 `styled-engine` 抽象层，让用户选实现
- ✅ 大型项目切到 Pigment CSS（zero-runtime），RSC 友好
- ✅ styled-components 用户安装 `@mui/styled-engine-sc`
- ❌ 切勿直接 import `@emotion/styled` 在库代码中，破坏可替换性
- ❌ 切勿在 RSC 中用 emotion，需要 Pigment CSS

---

## 三、性能与打包：让组件库跑得动 10000 个实例

### 11. useUtilityClasses 拆分 slot className（Slot Composition）

**问题场景**：组件有 root / startIcon / endIcon / loadingIndicator 等多个子节点，业务方想精确覆盖某个 slot 的样式；如果整组件一个 className，业务方只能 `& > *` 选择器覆盖。

**解决方案**：
```javascript
const useUtilityClasses = (ownerState) => {
  const { color, variant, size, loading, disabled, classes } = ownerState;
  const slots = {
    root: [
      'root',
      variant && `variant${capitalize(variant)}`,
      `size${capitalize(size)}`,
      `color${capitalize(color)}`,
      loading && 'loading',
      disabled && 'disabled',
    ],
    startIcon: ['startIcon'],
    endIcon: ['endIcon'],
    loadingIndicator: ['loadingIndicator'],
  };
  return composeClasses(slots, getButtonUtilityClass, classes);
};
```

**关键参数**：

| slot | 用途 |
| --- | --- |
| `root` | 组件根容器 |
| `startIcon` / `endIcon` | 左右图标位 |
| `loadingIndicator` | 加载转圈 |

**最佳实践**：
- ✅ 业务方覆盖样式 `& .MuiButton-startIcon { ... }` 精确到 slot
- ✅ composeClasses 三参：slots、getUtilityClass、用户 classes（合并用户覆盖）
- ✅ slots 数组可传 falsy 值（false / undefined），composeClasses 自动过滤
- ❌ 切勿把 slot 名写死成中文或驼峰，要保持 kebab-case 风格统一
- ❌ 切勿一个组件所有元素都拆 slot，会让 className 数量爆炸

### 12. memoTheme 缓存与 Object.is 比较（Memoized Theme）

**问题场景**：emotion 内部每次 render 会比较 styled 的 style 输出，没变才跳过 hash；theme 引用没变却用了旧 style，会导致 emotion 重新生成 className。

**解决方案**：
```javascript
// 简化版 memoTheme
function memoTheme(fn) {
  let lastTheme = null;
  let lastResult = null;
  return (props) => {
    if (lastTheme !== props.theme) {  // Object.is 比较
      lastResult = fn(props);
      lastTheme = props.theme;
    }
    return lastResult;
  };
}

// 使用
const ButtonRoot = styled(ButtonBase)(
  memoTheme(({ theme }) => ({
    color: theme.palette.primary.main,
    // ...
  }))
);
```

**关键参数**：

| 比较方式 | 性能 | 适用 |
| --- | --- | --- |
| `Object.is(a, b)` | O(1) | 引用比较，最快 |
| `JSON.stringify` | O(n) | 序列化，深比较慢 |
| `_.isEqual` | O(n) | lodash 深比较 |

**最佳实践**：
- ✅ 始终用 Object.is 引用比较，避免深比较
- ✅ module 顶层 `const theme = createTheme()` 复用引用
- ✅ ThemeProvider 注入 theme 时也用稳定引用
- ❌ 切勿在 render 中 `createTheme()`，新对象会让 memo 失效
- ❌ 切勿在 styled 函数中读 theme 之外的可变状态（外部变量导致 memo 失效）

### 13. ClassNameGenerator 稳定 className（Stable Class Names）

**问题场景**：SSR 阶段组件渲染出 `MuiButton-root-1`，客户端又生成 `MuiButton-root-2`，导致 React hydration mismatch 警告。

**解决方案**：
```javascript
import { unstable_ClassNameGenerator } from '@mui/material/ClassNameGenerator';

unstable_ClassNameGenerator.configure((componentName) => `Mui${componentName}`);

// SSR 端需要在 server 入口预先 configure 一次
// <ServerStyleSheets> 会用同样的配置
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `prefix` | className 前缀，默认 `Mui` |
| `seed` | 自定义 hash 种子，确保 SSR/CSR 一致 |

**最佳实践**：
- ✅ SSR 项目在 server 入口 configure ClassNameGenerator
- ✅ CSR 项目用默认配置即可
- ✅ 业务方覆盖样式时按 `MuiComponent-root` 拼写，不要硬编码 hash 后缀
- ❌ 切勿在生产环境改 className 策略，会让 SSR 缓存失效
- ❌ 切勿依赖 className 排序，因为 emotion 会按声明顺序排

### 14. bundle-size snapshot 体积守护（Bundle Budget）

**问题场景**：组件库一次升级就 +50KB 体积，业务方 bundle 越来越胖；CI 没有量化约束，全靠 reviewer 凭感觉看。

**解决方案**：
```bash
# .size-snapshot.json
{
  "files": [
    { "path": "packages/mui-material/index.js", "parsedSize": 921000 },
    { "path": "packages/mui-material/Button/index.js", "parsedSize": 32000 }
  ]
}

# CI 阶段
pnpm size:snapshot  # 对比上次 PR，差异超阈值 block merge
```

**关键参数**：

| 字段 | 推荐阈值 |
| --- | --- |
| `@mui/material` 全量 | < 1MB（gzipped < 250KB） |
| 单个组件 | < 50KB（gzipped < 15KB） |
| PR 增量 | < 5KB（gzipped） |

**最佳实践**：
- ✅ CI 中设 `+5KB` 硬阈值，超了必须解释
- ✅ 业务方按需 import：`import Button from '@mui/material/Button'` 而非 `@mui/material`
- ✅ 监控每个子路径的体积，定位哪个组件在膨胀
- ❌ 切勿加未使用的 dependencies 进 material 包
- ❌ 切勿让 emotion 自身成为体积瓶颈（考虑 Pigment CSS）

### 15. Tree-shaking 子路径导出（Sub-path Exports）

**问题场景**：业务方用 `import { Button } from '@mui/material'` 会拉整个 mui-material 包（即便它有副作用优化），无法 tree-shake；用 `@mui/material/Button` 才能按需。

**解决方案**：
```javascript
// package.json
{
  "exports": {
    "./Button": "./Button/index.js",
    "./TextField": "./TextField/index.js",
    "./styles": "./styles/index.js",
    "./styles/createTheme": "./styles/createTheme.js"
  },
  "sideEffects": false
}

// 业务方
import Button from '@mui/material/Button';  // ✅ 按需
import { Button } from '@mui/material';     // ⚠️ namespace import 拉全量
```

**关键参数**：

| 导入方式 | Tree-shake | 体积 |
| --- | --- | --- |
| `@mui/material/Button` | ✅ | 32KB |
| `@mui/material`（具名） | 依赖 build | 920KB+ |
| `@mui/material`（namespace） | ❌ | 920KB+ |

**最佳实践**：
- ✅ 业务方统一用 `@mui/material/<Component>` 子路径导入
- ✅ `package.json` 设 `"sideEffects": false` 让 bundler 100% tree-shake
- ✅ Babel 插件自动改写 import 路径（@mui/material/Button）
- ❌ 切勿用 `import * as MUI from '@mui/material'`
- ❌ 切勿跨子路径共享内部 helper（会破坏 tree-shake 边界）

---

## 四、可靠性与生态：CI、视觉回归、可访问性

### 16. 视觉回归 Argos（Visual Regression）

**问题场景**：组件库改了一个 borderRadius，所有 Button 视觉都变了；单元测试通过但用户看到的是破碎 UI。pixel-level diff 才能发现。

**解决方案**：
```yaml
# .github/workflows/visual-regressions.yml
name: Visual regressions
on: pull_request
jobs:
  regressions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:regressions  # 起 playwright + argos
      # argos 自动对比 base 分支截图，超阈值 block PR
```

**关键参数**：

| 阈值 | 建议 |
| --- | --- |
| 像素差异 | < 0.1%（1000x1000 截图约 1000 像素） |
| CI 超时 | 10 分钟 |
| 并行 worker | 4 |

**最佳实践**：
- ✅ 每个组件都有对应的视觉回归截图（docs/.screenshot.png）
- ✅ Argos 自动评论 PR 标记视觉变化
- ✅ 大型 PR（> 50 文件改动）跳过视觉回归，避免噪音
- ❌ 切勿禁用视觉回归通过 PR，视觉问题就是 bug
- ❌ 切勿对动效组件跑视觉回归（diff 永远不为 0）

### 17. a11y 可访问性测试（Accessibility）

**问题场景**：Material Design 强调 a11y，但组件库作者容易忽略：aria 属性缺失、focus trap 漏写、键盘导航断链。

**解决方案**：
```javascript
// packages/mui-material/src/Dialog/Dialog.test.js
import { render, screen } from '@testing-library/react';

test('Dialog traps focus', () => {
  render(<Dialog open><input data-testid="a" /><button>close</button></Dialog>);
  const firstInput = screen.getByTestId('a');
  expect(document.activeElement).toBe(firstInput);  // 焦点自动 trap
});

// 键盘事件测试
test('Dialog closes on Escape', () => {
  render(<Dialog open onClose={onClose}>content</Dialog>);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
```

**关键参数**：

| 字段 | 要求 |
| --- | --- |
| `aria-label` | 所有 icon button 必有 |
| `role` | 语义化（如 dialog / listbox） |
| `tabIndex` | focus 顺序符合视觉顺序 |
| 键盘 | 所有交互能用键盘完成 |

**最佳实践**：
- ✅ IconButton 强制要求 `aria-label` prop
- ✅ Dialog 自动 trap focus，无需业务方手动
- ✅ 用 `@testing-library/user-event` 模拟真实键盘事件
- ❌ 切勿用 `div` 模拟 `button` 却不加 role/onKeyDown
- ❌ 切勿让 focus 在打开 Dialog 时丢失

### 18. pnpm + nx + lerna 三套工具的取舍（Monorepo Tooling）

**问题场景**：monorepo 工具选择：lerna（发布）、nx（任务缓存）、pnpm（依赖管理）、turbo（替代 nx）—— 该怎么搭？

**解决方案**：
```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'packages-internal/*'

# nx.json
{
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx/tasks-runners/default",
      "options": {
        "cacheableOperations": ["build", "test", "lint"]
      }
    }
  }
}

# lerna.json（仅发布用）
{
  "npmClient": "pnpm",
  "version": "independent",
  "useWorkspaces": true
}
```

**关键参数**：

| 工具 | 职责 |
| --- | --- |
| pnpm | 依赖管理，hoist + 硬链接 |
| nx | 任务编排，缓存 + 影响分析 |
| lerna | 版本发布（independent mode） |
| changesets | 替代 lerna 的轻量 changelog |

**最佳实践**：
- ✅ 业务方 monorepo 可简化为 pnpm + changesets，省去 nx 复杂度
- ✅ nx 缓存对 monorepo 加速 5-10 倍，必装
- ✅ `build:ci` 显式 `--skip-nx-cache` 避免脏读
- ❌ 切勿混用 yarn + npm + pnpm，依赖解析会乱
- ❌ 切勿让 lerna 跑构建（让 pnpm 跑），lerna 只负责发布

### 19. Pigment CSS 零运行时实验（Zero-Runtime CSS-in-JS）

**问题场景**：React Server Components 不支持运行时 CSS-in-JS（emotion / styled-components 都需要 client 端），需要编译时 zero-runtime 方案。

**解决方案**：
```javascript
// Babel 配置启用 Pigment CSS
// babel.config.js
module.exports = {
  presets: [
    ['@babel/preset-react', { runtime: 'automatic' }],
    ['@pigment-css/react/babel', {}],  // 编译 sx → 普通 class
  ],
};

// 业务代码不变
<Box sx={{ color: 'red', '&:hover': { color: 'blue' } }} />
// 编译后：<div class="MuiBox-root-abc123" />
// 其中 .MuiBox-root-abc123 { color: red; }
// .MuiBox-root-abc123:hover { color: blue; }
```

**关键参数**：

| 维度 | emotion（runtime） | Pigment CSS（zero-runtime） |
| --- | --- | --- |
| 启动时间 | 100-300ms | < 10ms |
| Bundle | +50KB | 0（编译产物） |
| RSC 兼容 | ❌ | ✅ |
| 动态样式 | ✅ 函数式 sx | ⚠️ 受限 |

**最佳实践**：
- ✅ RSC 项目用 Pigment CSS
- ✅ 静态主题用 Pigment CSS，动态主题用 emotion
- ✅ 编译产物体积 < emotion runtime 30%
- ❌ 切勿在 Pigment CSS 用需要 runtime 主题的函数式 sx
- ❌ 切勿混用 emotion 和 Pigment CSS（className 命名冲突）

### 20. zero-styled 桥接实验（Engine Bridge）

**问题场景**：业务方想"不依赖 emotion 也能用 styled API"——比如换 styled-components 或 zero-runtime 引擎，又不想改业务代码。

**解决方案**：
```typescript
// packages/mui-material/src/zero-styled/index.ts
import { styled } from './styled-engine';  // 桥接层

// 业务方安装哪个引擎就 export 哪个
// 默认：emotion；可选：styled-components、pigment-css

// styled 函数签名保持一致
const ButtonRoot = styled('button', {
  shouldForwardProp: (prop) => prop !== 'variant',
})<{ variant: 'text' | 'contained' }>(({ variant, theme }) => ({
  background: variant === 'contained' ? theme.palette.primary.main : 'transparent',
}));
```

**关键参数**：

| 桥接层 | 适用 |
| --- | --- |
| `zero-styled/emotion` | 兼容现有 emotion 项目 |
| `zero-styled/styled-components` | 已用 sc 的项目 |
| `zero-styled/pigment` | 新项目 / RSC |

**最佳实践**：
- ✅ 库作者提供 zero-styled 桥接层
- ✅ 业务方根据项目状态选 engine
- ✅ 编译产物应该是不同 className 风格，但 API 一致
- ❌ 切勿在桥接层加业务逻辑（只做 1:1 翻译）
- ❌ 切勿让 emotion 升级 breaking change 影响桥接层

---

**标签**：#material-ui #react #design-system
**状态**：20/20 份详细内容
