# chakra-ui - Panda 风味驱动的 React 组件库，token + recipe + factory 三位一体

**GitHub**: chakra-ui/chakra-ui
**Star**: 38k+
**语言**: TypeScript
**主题**: ui-library/react/design-system/styled-system/无障碍
**适用场景**: 中大型 React 应用（电商/SaaS/官网）；需要 a11y + theme token 不想自己写 design system

## 第一段：基础范式

### 模式 1：styled-system 引擎（不绑定 React 可移植）

**问题场景**：如何让同一套 design token 跨 SSR / RSC / 客户端一致？
**解决方案**：styled-system 是一个不绑定 React 的可移植引擎，createSystem(config) 吐 SystemContext，由 provider.tsx 喂给 React tree；同样 config 可喂给 vanilla-extract/Panda/CSS Modules。
**关键参数**：
- createSystem(configs) 入口
- SystemContext 喂 React tree
- config 复用
- 与 React 解耦
- 同一份 token 多端用
**最佳实践**：把"样式系统"做成可移植引擎；UI 库别和视图层强耦合。

### 模式 2：Token → Condition → CSS Variable → Recipe 四级数据流

**问题场景**：每次渲染都重新算 token 太慢？
**解决方案**：四级数据流在运行时一次性索引成 Map，渲染只做 Map.get（O(1)），避免每次渲染重新计算。
**关键参数**：
- token-dictionary.ts 注册 nameMap/conditionMap/cssVarMap
- @walkObject 静态展开
- Map.get O(1)
- 初始化一次复用
- 渲染零计算
**最佳实践**：编译期/初始化期把数据"扁平化"成 Map；渲染期只读不计算。

### 模式 3：chakra factory = Emotion 注入 + shouldForwardProp 过滤

**问题场景**：如何用 Emotion 同时支持 RSC + 浏览器 hydration？
**解决方案**：chakra factory 是 Emotion 注入的 `<style>` + shouldForwardProp 过滤器，把 React 19 的 useInsertionEffect 优势与 SSR style hoist 兜底都接住。
**关键参数**：
- factory.tsx:53-78 useInsertionEffectAlwaysWithSyncFallback
- Emotion cache 复用
- SSR style hoist
- 浏览器/SSR 双路径
- shouldForwardProp 过滤
**最佳实践**：UI 库要 SSR/CSR 双兼容；不要只在客户端跑。

### 模式 4：cva() 函数式 recipe + splitVariantProps

**问题场景**：variant / compound variant 怎么不靠运行时判断、靠静态 class？
**解决方案**：cva() 把 base / variants / compoundVariants / defaultVariants 在工厂里合并成单一 css object；splitVariantProps 让消费方 O(1) 拆出 variant prop 与 HTML prop。
**关键参数**：
- cva.ts:34-107 工厂合并
- base + variants + compoundVariants + defaultVariants
- splitVariantProps O(1) 拆分
- 静态 class 非运行时判断
- 用户写 variant="solid" 不重算
**最佳实践**：用静态 class 替代 runtime 条件；渲染期零判断。

### 模式 5：typed token + semantic token 双层

**问题场景**：dark mode 不该让用户自己写 useColorModeValue，框架该编译期就知道。
**解决方案**：token-dictionary.ts:62-189 把 tokens.colors.red.500 与 semanticTokens.colors.bg.error 分两遍 walkObject 注册；后者支持 { base, _dark, _light } 条件值。
**关键参数**：
- 5 个 token 维度（color/spacing/typography/...）
- semanticToken 条件值
- { base, _dark, _light } 三态
- 框架编译期/初始化期知道
- 零 useColorModeValue
**最佳实践**：token 分"原始"和"语义"两层；语义 token 处理模式切换。

## 第二段：扩展范式

### 模式 6：@ark-ui/react 外包无障碍行为

**问题场景**：自己写 Dialog/Menu/Tabs 无障碍行为成本高？
**解决方案**：@ark-ui/react（Zag.js 团队）作为状态机，每个交互组件把 headless 逻辑外包给 Ark，自己只负责样式 + 命名空间。
**关键参数**：
- package.json 直接依赖 @ark-ui/react 5.36.2
- Zag.js 团队维护
- headless 状态机外包
- 自身只管样式
- 100+ 组件复用
**最佳实践**：把"无障碍"外包给专业库；自己不要重写 ARIA 状态机。

### 模式 7：createRecipeContext 的 PropsProvider 链

**问题场景**：`<Group><Button>OK</Button></Group>` 中 Button 不用传 variant 也能继承 size？
**解决方案**：createRecipeContext 用一个 Context 喂子组件默认 variant，避免 prop drilling 又不引入 render props。
**关键参数**：
- create-recipe-context.tsx:23-49
- Context 喂子组件
- 默认 variant 继承
- 避免 prop drilling
- 无 render props
**最佳实践**：用 Context 喂默认 variant；prop drilling 的解药。

### 模式 8：sortAtRules + layers.wrap 隔离层叠

**问题场景**：v2 emotion css prop 覆盖 token 太难？
**解决方案**：sortAtRules + layers.wrap 把 tokens/recipes/base 用 CSS @layer 隔离，用户 css={{ bg: "red" }} 无 !important 仍能覆盖 theme。
**关键参数**：
- system.ts:140-157 sortAtRules
- @layer reset/tokens/base/recipes
- 优先级：reset < tokens < base < recipes
- 用户覆盖 < !important
- 终于解决 v2 痛点
**最佳实践**：用 @layer 解决 CSS 优先级噩梦；显式胜于隐式。

### 模式 9：utility 注册表 + token 类型推导

**问题场景**：bg="red.500" 必须能被 TypeScript 推断成合法 token，否则 DX 灾难。
**解决方案**：system.ts:96 isValidProperty = properties.has(prop) || isCssProperty(prop)；utility.ts:35-70 暴露 register() 让主题作者扩展。
**关键参数**：
- 5 元组 property 验证
- isValidProperty 双源
- register() 扩展点
- 主题作者自定义
- TS 推断覆盖
**最佳实践**：用 TypeScript 类型系统保护 token 合法性；DX 强约束。

### 模式 10：mergeCva 二次包装叠加样式

**问题场景**：chakra(Button, { base: ... }) 二次包装时如何叠加样式？
**解决方案**：factory.tsx:126 mergeCva(tag.__emotion_cva, cvaFn) 在每次渲染合并当前 tag 已注册 cva 与新传入 cva。
**关键参数**：
- tag.__emotion_cva 已注册
- 运行时合并
- 不复制粘贴
- 二次包装支持
- 样式叠加
**最佳实践**：用 merge 替代 copy；HOC 不该复制样式。

## 第三段：进阶范式

### 模式 11：build:fast 跳过 dts 日常开发提速

**问题场景**：日常开发每次构建 30s 太慢？
**解决方案**：scripts/build/main.ts 自研 fast build + build:fast 跳过 dts，build 出 dts 仅发布时跑。
**关键参数**：
- build:fast 仅 ESM（3s）
- build 含 dts（30s）
- 日常开发快
- 发布才完整
- 跳过 tsc 检查
**最佳实践**：日常构建要快；dts 没必要每次都生成。

### 模式 12：v2 → v3 codemod 迁移工具

**问题场景**：v2 升级到 v3 大量 import 路径要改？
**解决方案**：packages/codemod 用 jscodeshift 写转换器，一行命令批量改 import + props。
**关键参数**：
- jscodeshift 引擎
- v2 → v3 自动转换
- import 路径重写
- props 名称变更
- 一行命令批量
**最佳实践**：破坏性升级要发 codemod；不要只发 changelog。

### 模式 13：monorepo pnpm + turbo + changesets

**问题场景**：3718 个文件 + 5 个子包如何管理？
**解决方案**：pnpm workspaces + turbo 任务编排 + changesets 版本管理，CI 跑 quality/release.yml。
**关键参数**：
- pnpm workspaces
- turbo 并行任务
- changesets 版本
- 5 个子包独立发版
- GitHub Actions
**最佳实践**：多包库要 monorepo；turbo 比 lerna 快 10x。

### 模式 14：style props vs className 双语法

**问题场景**：业务方想用 JSX 风格写样式？
**解决方案**：`<chakra.button bg="red.500" />` style props 与 className 共存，style props 通过 utility 编译成 class。
**关键参数**：
- bg / m / p 简写
- token 合法
- className 直通
- 运行时编译
- 两种风格兼容
**最佳实践**：库要支持多种 DX；style props + className 都给。

### 模式 15：compose + www 文档站

**问题场景**：100+ 组件如何展示使用示例？
**解决方案**：apps/compositions 是大量 example 集合，apps/www 是官网文档站，Storybook sandbox 单独沙盒。
**关键参数**：
- apps/compositions example 库
- apps/www 文档站
- Storybook 沙盒
- StackBlitz 集成
- 30+ 翻译
**最佳实践**：组件库要 example 库 + 文档站 + 沙盒三件套。

## 第四段：实战范式

### 模式 16：useInsertionEffect AlwaysWithSyncFallback

**问题场景**：React 18 之前如何注入 style 避免闪烁？
**解决方案**：factory.tsx:53-78 用 useInsertionEffectAlwaysWithSyncFallback 兼容 React 19 + SSR；React 19 优先 useInsertionEffect，老版本同步 fallback。
**关键参数**：
- React 19 useInsertionEffect
- 老版本同步 fallback
- SSR style hoist
- 零闪烁
- 兜底逻辑
**最佳实践**：新 API 要有 fallback；React 版本兼容是工程细节。

### 模式 17：ThemeProvider + 嵌套主题覆盖

**问题场景**：局部区域要换主题（如 dark section 嵌在 light 中）怎么办？
**解决方案**：嵌套 ChakraProvider 覆盖 token 局部；CSS 变量在 root 注册后可在任何元素级覆盖。
**关键参数**：
- ChakraProvider 嵌套
- token 局部覆盖
- CSS var 级联
- 暗色 section 嵌亮色
- 状态可逆
**最佳实践**：用 CSS 变量级联实现局部主题；不要在 JS 同步。

### 模式 18：Storybook 沙盒 + benchmark 性能追踪

**问题场景**：每个 PR 如何保证性能不退化？
**解决方案**：memo.bench.ts + token-cloning.bench.ts 跑 vitest bench，Storybook 跑所有组件，benchmark 在 CI 跑。
**关键参数**：
- vitest bench 框架
- token-cloning.bench.ts
- memo.bench.ts
- CI 跑 benchmark
- 性能回归门禁
**最佳实践**：库作者要发 benchmark；性能退化要门禁。

### 模式 19：panda-preset 独立可移植包

**问题场景**：不用 React 但想要 Chakra 的 token/recipe？
**解决方案**：packages/panda-preset 把同款 token/recipe 暴露给 Panda CSS 用户，独立可装。
**关键参数**：
- panda-preset/ 独立包
- 同款 token
- 同款 recipe
- 跨框架复用
- 同一团队维护
**最佳实践**：样式系统要"框架无关"；React 用户和 Panda 用户共用一套 token。

### 模式 20：OpenCollective + Vercel/Netlify 商业背书

**问题场景**：纯开源 UI 库如何持续维护？
**解决方案**：MIT 开源 + OpenCollective 赞助 + Vercel/Netlify 等组织背书（公司层面使用，间接资金支持）。
**关键参数**：
- MIT 完全免费
- OpenCollective 众筹
- Vercel/Netlify 背书
- 30+ 维护者
- 数百位贡献者
**最佳实践**：开源 UI 库靠"用户企业 + OpenCollective"双资金来源。

## 关键代码段

```typescript
// factory.tsx:126 — mergeCva 二次包装
function mergeCva<T>(tag: T, cvaFn: CvaFn): T {
    (tag as any).__emotion_cva = (tag as any).__emotion_cva || [];
    (tag as any).__emotion_cva.push(cvaFn);
    return tag;
}

// system.ts:140-157 — layers.wrap 优先级
const layers = {
    wrap: (name: string, css: CSSObject) => ({
        [`@layer ${name}`]: css
    })
};
// @layer reset < tokens < base < recipes
```

## 必偷 3 件

1. **styled-system 引擎不绑定 React**（`createSystem(config)`）：把样式系统做成可移植引擎，UI 库别和视图层强耦合。
2. **`@ark-ui/react` 外包无障碍行为**：把"无障碍"外包给专业库，自己不要重写 ARIA 状态机。
3. **cva() 工厂 + splitVariantProps O(1) 拆分**：用静态 class 替代 runtime 条件；渲染期零判断。

## 必避 3 坑

1. **不要在主仓库硬塞所有平台**（web/native/cli）：monorepo 拆清楚，每个平台一个子包。
2. **不要丢弃 v2 用户的 codemod 路径**：破坏性升级要发 codemod 工具。
3. **不要让 emotion css prop 覆盖 token 太难**：用 @layer 显式管理优先级，user override 走 recipes 层。
