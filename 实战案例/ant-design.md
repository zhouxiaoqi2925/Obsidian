# ant-design · 设计系统驱动的 React 组件库架构

**GitHub**: ant-design/ant-design
**Star**: 95k+
**语言**: TypeScript + CSS-in-JS
**主题**: React UI 库 / Design Token / 静态 API / CSS-in-JS 运行时
**适用场景**: 中后台 UI 库搭建、设计系统建设、ConfigProvider 配置透传、message 静态 API 跨树调用

## 第一段：主题与设计系统层

### 模式 1：Seed → Map → Alias 三层 Design Token 派生

**问题场景**：用户改主色 `#1677ff` → 期待 70+ 组件的 hover/active/border/bg 全部自动跟随——但传统 CSS 变量是"声明即终态"，要手算 200+ 派生值。改一处主色写 200 行 Less 变量映射不可维护。

**解决方案**：用递归 `getComputedToken` 把"主色"沿 Seed→Map→Alias 三层派生，每层都有"算法"介入：
```ts
export const getComputedToken = (originToken, overrideToken, theme) => {
  const derivativeToken = theme.getDerivativeToken(originToken);
  const { override, ...components } = overrideToken;
  let mergedDerivativeToken = { ...derivativeToken, override };
  mergedDerivativeToken = formatToken(mergedDerivativeToken);
  if (components) {
    Object.entries(components).forEach(([key, value]) => {
      const { theme: componentTheme, ...componentTokens } = value;
      let mergedComponentToken = componentTokens;
      if (componentTheme) {
        mergedComponentToken = getComputedToken(
          { ...mergedDerivativeToken, ...componentTokens },
          { override: componentTokens },
          componentTheme,
        );
      }
      mergedDerivativeToken[key] = mergedComponentToken;
    });
  }
  return mergedDerivativeToken;
};
```

**关键参数**：
- `SeedToken`：用户输入（如 `colorPrimary`），原子量
- `MapToken`：由 `theme.algorithm` 计算（如 `colorPrimaryBg` 10 阶色板）
- `AliasToken`：组件可消费的语义名（如 `colorBgContainer`）
- 嵌套 `theme.components.Button.theme` 触发递归——支持"全局 light + 局部 dark"
- `formatToken` 把"原始数字/字符串"归一为 CSS 可用值

**最佳实践**：三层 Token 比"单层变量"高 3 个段位；递归合并让"嵌套主题"零成本；`getDerivativeToken` 是纯函数——可缓存、可测试。

---

### 模式 2：unitless / ignore / preserve 元数据集中定义

**问题场景**：cssinjs 默认给所有数字加 `px`，但 `lineHeight: 1.5` 不该加；某些媒体查询断点（`screenXS`）必须保留原值（不能进哈希）；动画内部临时 token 不该输出到 CSS 变量。三个需求散落各处，配置无从追溯。

**解决方案**：在 `useToken` 入口把"token 元数据"集中声明：
```ts
const tokenMeta = {
  unitless: new Set(['lineHeight', 'opacity', 'fontWeight', ...]),
  ignore: new Set(['motionDurationMid']),
  preserve: new Set(['screenXS', 'screenSM', 'screenMD']),
};
```

**关键参数**：
- `unitless` 告诉 cssinjs"这个 token 不加 px"
- `ignore` 参与哈希但不输出到 CSS 变量（动画内部用）
- `preserve` 列出"原样保留"的特殊 token（媒体查询断点）
- 集中在 `useToken.ts` 顶部声明——一行注释即说明意图
- 元数据驱动 cssinjs 内部 `unit` / `hash` 决策——可测试

**最佳实践**：把"token 的元属性"集中定义——配置的可发现性 > 散落各处的 hack；`unitless` 是 cssinjs 必需的契约——`Set` 查找 O(1) 性能好。

---

### 模式 3：返回 6 元组 vs 6 字段对象

**问题场景**：`useToken` 同时要给 70+ 组件用，组件各自需要的"切片"不同——`style/index.ts` 拿 hashId 拼 className，`useStyle` 拿 cssVar 拼前缀，主题编辑器拿 realToken 显示真值。返回大对象 → 调用方按需解构，V8 隐藏类稳定；返回元组 → 调用方按位置取，性能更优但语义不清晰。

**解决方案**：用元组返回 + 注释说明每个位置语义：
```ts
return [mergedTheme, realToken, hashed ? hashId : '', token, cssVar, !!zeroRuntime];
// 0: theme    1: realToken  2: hashId  3: token  4: cssVar  5: zeroRuntime
```

**关键参数**：
- 元组 = V8 数组 = 隐藏类不分裂 → 性能最优
- 位置命名靠注释 / 类型推导
- `style/index.ts` 用第 3 个 hashId
- `useStyle` 用第 5 个 cssVar
- 主题编辑器用第 2 个 realToken
- 6 元素是经验值——多了记不住，少了不够用

**最佳实践**：内部 hook 返回元组，外部 API 返回对象——分层暴露；元组用 IDE 跳转注释维持可读性；6 个是 antd 5+ 年沉淀的"够用边界"。

---

### 模式 4：useId + themeKey 做多 ConfigProvider 隔离

**问题场景**：同一页面多个 `<ConfigProvider>` 都用 CSS 变量模式，相同 `cssVar` key 会互相覆盖——用户期望"内层 Modal 走 darkTheme"却"泄漏到外层 Button"。

**解决方案**：用 React 18 `useId` 生成唯一 `themeKey`，强制作为 cssVar 前缀：
```ts
const themeKey = useId();
const cleanedKey = themeKey.replace(/:/g, ''); // React 18 返回 ":r0:" 带冒号
if (process.env.NODE_ENV !== 'production') {
  const validKey = !!((isPlainObject(themeConfig.cssVar) && themeConfig.cssVar?.key) || themeKey);
  warning(
    !cssVarEnabled || validKey,
    'breaking',
    'Missing key in `cssVar` config. Please upgrade to React 18 or set `cssVar.key` manually...',
  );
}
```

**关键参数**：
- `useId()` 唯一化保证 SSR / CSR 一致
- `themeKey.replace(/:/g, '')` 清理 React 18 格式
- `inherit === false` 短路支持"完全重置主题"
- dev 环境强制检查 `validKey`——可执行的错误信息
- CSS 变量模式强制 key——否则覆盖全局

**最佳实践**：`useId` 必清理冒号——CSS 选择器语法错误；dev 警告给"修复路径"——`升级 React 18 或设 cssVar.key`；`inherit: false` 短路 = 完全隔离局部主题。

---

### 模式 5：algorithm 三件套 default/dark/compact 切换

**问题场景**：用户想要"暗色主题" / "紧凑布局"——传统做法是写两套 CSS 类切换，体积翻倍且 token 不可组合。daisyUI / Tailwind 用 class 切换，Tailwind 模式让设计 token 与算法耦合。

**解决方案**：把"主题算法"抽象为纯函数（输入 SeedToken → 输出 MapToken），`default` / `dark` / `compact` 是三个独立函数可叠加：
```ts
const themeConfig = {
  algorithm: [defaultAlgorithm, darkAlgorithm, compactAlgorithm],
  token: { colorPrimary: '#1677ff' },
};
```

**关键参数**：
- 算法 = 纯函数（SeedToken + 上下文 → MapToken）
- 算法可叠加——`[default, compact]` 等于"默认+紧凑"
- 切换主题 = 换 algorithm 引用，不换 token
- `darkAlgorithm` 把 `colorBgBase` 翻转 `colorBgContainer`
- `compactAlgorithm` 把 `controlHeight` 缩到 24px

**最佳实践**：主题算法 = 纯函数——无副作用、可组合；`algorithm: [...]` 数组支持"叠加"——比"单选"灵活 1 个量级；切主题不动 token——切算法引用。

---

## 第二段：组件层

### 模式 6：color × variant 正交矩阵 + 历史 type 兼容

**问题场景**：v3/v4 用户写 `<Button type="primary">`，v6 重构为"color × variant"模型要兼容历史 API——直接 break change 损失 100% 存量用户。3×3 矩阵比"5 种 type 字符串"扩展性强，但需要映射表。

**解决方案**：用 `ButtonTypeMap` 把历史 `type` 映射到正交 `(color, variant)` 对：
```ts
const ButtonTypeMap: Partial<Record<ButtonType, ColorVariantPairType>> = {
  default: ['default', 'outlined'],
  primary: ['primary', 'solid'],
  dashed: ['default', 'dashed'],
  // `link` is not a real color but we should compatible with it
  link: ['link' as ButtonColorType, 'link'],
  text: ['default', 'text'],
};
```

**关键参数**：
- `type` → `(color, variant)` 映射表——单一真相
- `link` 既当 type 又当 color——注释明示"非真实 color 但要兼容"
- 4 步合并：local sugar → context fallback → ghost override → danger merge
- 两个独立 `useMemo`：第一层算 base，第二层修 edge case
- `color × variant` 正交矩阵支持"组合爆炸"——5×5 = 25 种

**最佳实践**：破坏性变更必须给映射表——`ButtonTypeMap` 注释明说"兼容"意图；分步合并的 `useMemo` 让"计算→修正"清晰可读；`Partial<Record<...>>` 表示"可选映射"——TS 强约束。

---

### 模式 7：useLayoutEffect 解决 loading delay 闪烁

**问题场景**：用户连续点 Button，`loading=true` 在两次 paint 之间切换——`useEffect` 异步执行，可能第二次点击时 `disabled` 还没设上，导致 onClick 重复触发。低概率但必现。

**解决方案**：用 `useLayoutEffect` 同步执行 loading delay，杜绝"loading 闪现"：
```ts
// Loading. Should use `useLayoutEffect` to avoid low perf multiple click issue.
// https://github.com/ant-design/ant-design/issues/51325
useLayoutEffect(() => {
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  if (loadingOrDelay.delay > 0) {
    delayTimer = setTimeout(() => {
      delayTimer = null;
      setInnerLoading(true);
    }, loadingOrDelay.delay);
  } else {
    setInnerLoading(loadingOrDelay.loading);
  }
  return () => { if (delayTimer) clearTimeout(delayTimer); };
}, [loadingOrDelay.delay, loadingOrDelay.loading]);
```

**关键参数**：
- `useLayoutEffect` 在 paint 前同步执行
- `delayTimer` cleanup 防泄漏
- issue 链接直接挂在注释里——下次重构能追溯
- 依赖列表只放真实变化的 `[delay, loading]`
- `loadingOrDelay.loading` 是 props.loading || props.delay 合并对象

**最佳实践**：`useLayoutEffect` 用于"必须同步生效的副作用"；注释里挂 issue 链接——代码考古起点；cleanup 必须——`setTimeout` 不清理会内存泄漏。

---

### 模式 8：表单 4 层 Provider 嵌套 + local > context 优先级

**问题场景**：Form 子树 100+ `Form.Item` 各自要 `SizeContext` / `DisabledContext` / `FormContext`——每个 Item 单独 `useContext` 3 次性能低；某 Form 想"局部关闭滚动到错误"却"全局默认开启"——需要 local > context 优先级。

**解决方案**：在 Form 入口集中声明 4 层 Provider，校验失败时 local prop 优先：
```jsx
<VariantContext.Provider value={variant}>
  <DisabledContextProvider disabled={disabled}>
    <SizeContext.Provider value={mergedSize}>
      <FormProvider validateMessages={contextValidateMessages}>
        <FormContext.Provider value={formContextValue}>
          <NoFormStyle status>
            <FieldForm .../>
          </NoFormStyle>
        </FormContext.Provider>
      </FormProvider>
    </SizeContext.Provider>
  </DisabledContextProvider>
</VariantContext.Provider>
```

校验失败处理：
```ts
const onInternalFinishFailed = (errorInfo: ValidateErrorEntity) => {
  onFinishFailed?.(errorInfo);
  if (errorInfo.errorFields.length) {
    const fieldName = errorInfo.errorFields[0].name;
    if (scrollToFirstError !== undefined) {  // local prop 优先
      scrollToField(scrollToFirstError, fieldName);
      return;
    }
    if (contextScrollToFirstError !== undefined) {  // context fallback
      scrollToField(contextScrollToFirstError, fieldName);
    }
  }
};
```

**关键参数**：
- 4 层 Provider 集中声明——100+ FormItem 共享 1 次 useContext
- `scrollToFirstError !== undefined` 判 undefined 不判 falsy——支持 `false` 显式关闭
- local prop > context——支持"局部覆盖全局"
- `validateMessages` 走 FormProvider——支持多语言错误信息
- `NoFormStyle status` 抑制子组件的默认样式——Form 内部状态

**最佳实践**：Provider 集中声明 > 散落 hook；判 `!== undefined` 而非 `!prop`——支持"显式关闭"；`local > context` 优先级是 antd 配置透传的统一规则。

---

### 模式 9：useSelection + useSorter + useFilter 三件套拆分 Table 逻辑

**问题场景**：Table 多列选择 + 排序 + 筛选 + 分页——4 个独立能力写在一个文件 1000+ 行；列定义是用户传的，每次操作都要遍历列；选择状态需要在多列间共享。

**解决方案**：把"行为"拆成 3 个独立 hook，每个返回 `[transformColumns, state]`：
```ts
const [transformSelectionColumns, selectedKeys] = useSelection(rowSelection, ...);
const [transformSorterColumns, sorterStates] = useSorter({ ... }, ...);
const [transformFilterColumns, filterStates] = useFilter({ ... }, ...);
const transformColumns = [...transformSelectionColumns, ...transformSorterColumns, ...transformFilterColumns];
```

**关键参数**：
- 每个 hook 独立测试——单测 3 个
- `transformColumns` 是 column transform 函数数组——compose
- `selectedKeys` / `sorterStates` / `filterStates` 状态分离
- 多个 `useXxxColumns` 共享 column ref——避免重复遍历
- 最终 `[mergedColumns, contextHolder] = mergeProps...` 喂给 rc-table

**最佳实践**：复杂 Table 行为拆成 3-5 个独立 hook——单测容易；`transformColumns` 数组是 compose 模式——可任意顺序叠加；状态与 column transform 分离——重渲时只重渲变化部分。

---

### 模式 10：rc-component 分层 = 行为/皮肤分离

**问题场景**：Table 行为（选/排/筛/分页/虚拟滚动）200+ 个边界 case，自己撸要 5+ 年；rc-component 已经有成熟实现，但皮肤与 antd 设计语言不同。

**解决方案**：复用 `@rc-component/table` 处理行为，antd 自己写"皮肤层"覆盖：
```ts
import RcTable from '@rc-component/table';
const Table = React.forwardRef<HTMLDivElement, TableProps>((props, ref) => {
  const [transformColumns] = useSelection(...);
  return <RcTable columns={transformColumns} prefixCls={prefixCls} ... />;
});
```

**关键参数**：
- `rc-component` 10+ 年沉淀——行为稳定
- antd 只写"皮肤 + 业务逻辑"——专注设计语言
- `prefixCls` 注入——`rc-` 前缀变 `ant-`
- `contextConfig` 透传——`useConfig` 拿到 prefixCls/theme/locale
- 200+ 行 rc-table + 100 行 antd Table = 300 行总量

**最佳实践**：复杂行为复用成熟库（`@rc-component/*`），自己只做"皮肤层"；`prefixCls` 注入做命名空间隔离；`@rc-component/util` 提供 `render/unmount` 让静态 API 绕开 React 树。

---

## 第三段：静态 API 与 Context 层

### 模式 11：lazy GlobalHolder + taskQueue 静态 API 跨树调用

**问题场景**：`message.error()` 能在任何上下文调用，背后怎么拿 ConfigProvider 的 theme/prefixCls？直接 import 会丢失 Context；Hook API (`useMessage`) 强制用户改写代码——破坏 v3/v4 命令式用法。

**解决方案**：模块级单例 + 任务队列 + ref-based ready 信号：
```ts
let message: GlobalMessage | null = null;
let taskQueue: Task[] = [];

const flushMessageQueue = () => {
  if (!message) {
    const holderFragment = document.createDocumentFragment();
    const newMessage: GlobalMessage = { fragment: holderFragment };
    message = newMessage;
    act(() => {
      render(<GlobalHolderWrapper ref={(node) => {
        const { instance, sync } = node || {};
        Promise.resolve().then(() => {
          if (!newMessage.instance && instance) {
            newMessage.instance = instance;
            newMessage.sync = sync;
            flushMessageQueue();
          }
        });
      }} />, holderFragment);
    });
    return;
  }
  if (!message.instance) return;
  taskQueue.forEach((task) => { ... });
  taskQueue = [];
};
```

**关键参数**：
- 模块级单例 `let message: GlobalMessage | null`
- 第一次调用 lazy render holder 到 `documentFragment`
- `Promise.resolve().then` 在 ref 里赋值——避免 React 18 测试警告
- `flushMessageQueue` 自我递归——holder ready 后消费积压 task
- `act()` 包裹 setState 路径——测试环境由 jest 注入真 act
- `actDestroy` test-only 重置——避免 jest 跨 case 串状态

**最佳实践**：静态 API + 任务队列是"命令式也能享受 Context"的范本；`act()` 包裹是 antd 兼容 React 18 测试环境的关键；`actDestroy` test-only 注入——必加，否则 jest 状态串味。

---

### 模式 12：act() 包裹 setState 兼容 React 18 测试

**问题场景**：React 18 测试环境下"立即同步 setState"会触发 "can't perform state update on unmounted component" 警告；生产环境 `act` 不存在；测试环境由 jest 注入真 `act` 才会批处理 setState。

**解决方案**：`act` 在生产是 `(cb) => cb()` 透传，测试是真 `act` 包裹：
```ts
// rc-util/lib/act
const act = process.env.NODE_ENV === 'test' 
  ? (cb) => React.act(cb) 
  : (cb) => cb();
```

**关键参数**：
- 生产环境透传——零开销
- 测试环境由 jest 注入真正的 `act`
- setState 在 `act` 内会立即 flush——避免异步警告
- 用 `Promise.resolve().then` 在 ref 赋值后延迟一拍——React 18 测试环境必加
- `useEffect` 不在 `act` 内可能延后——必须用 `act` 强制同步

**最佳实践**：动态 `act` 注入——生产透传、测试真包裹；`Promise.resolve().then` 是 React 18 测试环境的标准逃逸路径；`act` 不是性能优化——是测试兼容性。

---

### 模式 13：dev 警告可执行 + warnContext 静态 API 提示

**问题场景**：用户写 `message.error()` 但没套 `<App>`，theme 上下文丢失、prefixCls 默认成 `ant`——运行时不报错但视觉"不对"；用户不知道要 `<App useMessage>`。

**解决方案**：dev 环境检测 `global.holderRender` 缺失并 warn 给出修复路径：
```ts
function typeOpen(type: NoticeType, args: Parameters<TypeOpen>): MessageType {
  const global = globalConfig();
  if (process.env.NODE_ENV !== 'production' && !global.holderRender) {
    warnContext('message');
  }
  // ...
}
```

`warning()` 是 antd 自带的开发警告工具——`warning(!cond, 'breaking', '[antd: XXX] Please use...')`。

**关键参数**：
- `process.env.NODE_ENV !== 'production'` 守卫——生产移除
- `warnContext` 字符串硬编码——78 个组件名维护一份表
- `global.holderRender` 由 `<App useMessage>` 注册
- 警告信息给"修复路径"——`<App useMessage>` / `<ConfigProvider>`
- 警告不阻塞——用户能继续用默认行为

**最佳实践**：dev 警告可执行 = 给修复路径；`process.env.NODE_ENV` 守卫——tree-shaking 移除；78 个组件名硬编码改进方向：TS 自动从 `ComponentNameMap` 推导。

---

### 模式 14：void Promise.thenable 包装同步 close

**问题场景**：`message.success(text)` 要返回"close 函数"让用户主动关闭，但 Promise 不能同步；老用户写 `const hide = message.success(...); hide();`——同步 close 必须支持。

**解决方案**：`wrapPromiseFn` 把 setState 异步路径包成 thenable：
```ts
type MessageType = Promise<...> & { then: (resolve) => void, ... };
function wrapPromiseFn(fn) {
  return (...args) => {
    const promise = fn(...args);
    // 返回 thenable 而非 Promise
    return {
      then: (resolve) => promise.then(resolve),
      // 其他 close 方法...
    };
  };
}
```

**关键参数**：
- `thenable` = `{ then: fn }` 形态——`await x` 能用
- 同步 close 函数可挂在 thenable 上
- `await message.success('saved')` 等通知关完
- 不返回真 Promise——避免 React 18 异步警告
- `wrapPromiseFn` 适配任何"setState 异步"API

**最佳实践**：thenable = 同步 close + async 等待 两全其美；不返回真 Promise——避免 React 18 警告；`wrapPromiseFn` 适配 setState 路径。

---

### 模式 15：Wave 水波纹 raf + ResizeObserver 同步位置

**问题场景**：Button 点击瞬间 `target.offsetWidth` 可能还是 0（layout 未完成），波纹位置错位；Button 文字"加载中"图标动态插入，宽度变化——波纹不贴合边缘。

**解决方案**：`useEffect` + `raf` 推迟一帧 + `ResizeObserver` 同步尺寸：
```ts
React.useEffect(() => {
  if (target) {
    const id = raf(() => { syncPos(); setEnabled(true); });
    let resizeObserver: ResizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(syncPos);
      resizeObserver.observe(target);
    }
    return () => {
      raf.cancel(id);
      resizeObserver?.disconnect();
    };
  }
}, [target]);
```

**关键参数**：
- `raf` 推迟一帧——等浏览器完成 layout
- `ResizeObserver` 监听 target 尺寸变化
- cleanup 必加——`raf.cancel` + `resizeObserver.disconnect`
- `target` 是 Button 真实 DOM 节点
- `showWaveEffect` 用 `render(<WaveEffect/>, holder)` 绕开 React 树

**最佳实践**：`raf` 推迟一帧是"等 layout 完成"的标准范式；`ResizeObserver` 监听变化比 MutationObserver 更精准；cleanup 必加——`raf` 不 cancel 会内存泄漏。

---

## 第四段：工程化层

### 模式 16：CSS-in-JS @layer 优先级排序

**问题场景**：用户自定义样式优先级 vs antd 默认——传统做法是 `!important` 暴力覆盖；CSS Cascade Layer (`@layer`) 提供原生优先级机制——可声明 `theme, base, antd, components, utilities;` 顺序。

**解决方案**：`npm run style -- --layer='@layer theme, base, global, antd, components, utilities;'` 注入 CSS 层顺序：
```css
@layer theme, base, global, antd, components, utilities;
.ant-btn { /* @layer antd */ }
```

**关键参数**：
- 6 个 `@layer` 优先级排序——`utilities` 最高
- 用户 `@layer antd { .override { ... } }` 可覆盖
- `!important` 仍然能在 layer 内升权
- layer 声明必须全局唯一
- dumi 提供 `--layer` flag 切换

**最佳实践**：`@layer` 是 CSS 原生级联层——比 `!important` 优雅；`utilities` 最高层 = 工具类必能覆盖；`@layer antd` 暴露给用户——自定义可控。

---

### 模式 17：zeroRuntime 模式体积/性能兼得

**问题场景**：cssinjs 运行时生成 `<style>` 标签——低端机首屏卡顿；用户有 SSR 需求——`<style>` 难缓存；纯 CSS 变量模式体积小但失去 cssinjs 动态计算能力。

**解决方案**：v6 新增 `theme.zeroRuntime: true`——不输出 `<style>` 标签，只输出 CSS 变量：
```ts
const themeConfig = {
  cssVar: { key: 'app' },
  zeroRuntime: true,
};
```

**关键参数**：
- `zeroRuntime: true` 完全跳过 cssinjs 运行时
- 体积：~30% ↓（无 `<style>` 标签生成）
- 性能：首屏快（无运行时计算）
- 局限：失去 cssinjs 动态 token 计算
- 适合 SSR / 静态站点
- 配 `cssVar` 必须——否则零 token 注入

**最佳实践**：性能敏感场景（SSR / 静态站）走 `zeroRuntime`；动态 token 场景走 cssinjs；`zeroRuntime + cssVar` 是 v6 双轨——一份代码两套产物。

---

### 模式 18：BUG_VERSIONS.json 运行时检测

**问题场景**：用户升级 antd 后遇到"已知 bug"——发 issue 之前可以自动检测"你当前 antd 版本有 X 个未修 bug"。

**解决方案**：在仓库根 `BUG_VERSIONS.json` 列出"已知 bug 的版本范围"：
```json
{
  "5.0.0": ["Button loading state issue"],
  "5.1.0": ["Table column reorder broken"]
}
```

运行时 `import { version } from 'antd/package.json'` 比对：
```ts
import { version } from 'antd/package.json';
const buggyVersions = require('antd/BUG_VERSIONS.json');
if (buggyVersions[version]) {
  warning(true, 'compatible', `Warning: antd@${version} has known issues: ...`);
}
```

**关键参数**：
- `BUG_VERSIONS.json` 维护成本低——只需 PR
- 运行时检测——用户无感知
- 警告给"issue 链接 + 修复版本"——可执行的错误信息
- 仅 dev 环境提示——生产不阻塞
- 与 `process.env.NODE_ENV` 守卫配合

**最佳实践**：`BUG_VERSIONS.json` 替代"读 changelog 才知 bug"；版本号是字符串 key——简单 JSON lookup；警告给 issue 链接——可追溯。

---

### 模式 19：useStyle hashId + cssVarCls 双 prefix

**问题场景**：用户多 antd 版本共存 / 微前端子应用——CSS class 冲突；cssVar 模式不同 `cssVar.key` ——变量名冲突。

**解决方案**：`useStyle(prefixCls)` 返回 `[hashId, cssVarCls]`——`hashId` 拼到 className，`cssVarCls` 拼到 CSS 变量：
```ts
const [, , hashId, , cssVar] = useToken();
// className 拼接
return <button className={`${prefixCls} ${hashId} ${cssVar?.key ? `css-var-${cssVar.key}` : ''}`} />;
```

**关键参数**：
- `hashId` 是基于 token 内容的哈希——同 token 同 hash
- `cssVarCls` 是 `css-var-${key}` 格式
- 两者必须组合——单用 hashId 不支持 cssVar
- v6 强制 `cssVar.key` 检查
- `useStyle` hook 在每个组件独立调用——避免全局共享

**最佳实践**：`hashId + cssVarCls` 双 prefix 解决微前端冲突；同 token 同 hash——`useCacheToken` 复用；`useStyle` 在每个组件独立——避免全局共享导致 re-render。

---

### 模式 20：视觉回归 blazediff + 4 道 CI 防线

**问题场景**：改一行 token 影响 70+ 组件视觉——单元测试捕获不到；像素级回归需要工具支持。

**解决方案**：`.jest.image.js` + Puppeteer + `blazediff` 像素 diff + 4 个 CI 矩阵：
```yaml
# .github/workflows/test.yml
jobs:
  lint:        # Biome + ESLint + Prettier + tsc
  test-react-legacy:  # React 18 + 2 shard
  test-react-latest:  # React 最新 + 覆盖率
  test-react-latest-dist:  # dist 产物测试
```

视觉回归：`npm run test:image` 跑 blazediff：
```ts
expect(await page.screenshot()).toMatchImageSnapshot();
```

**关键参数**：
- 4 个 CI 矩阵——lint / test / dist / image
- `blazediff` 是 antd 自研像素 diff——比 `pixelmatch` 快
- 374 个 `.test.tsx` 单元测试
- `pr-auto-merge.yml`——CI 绿 + review 通过自动合并
- `size-limit` 监控 dist 体积上限

**最佳实践**：4 道防线：lint / unit / dist / image——每道拦截不同问题；`blazediff` 自研——性能 + 业务贴合；`size-limit` 卡体积——性能也是 feature；`pr-auto-merge` 加速 review。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | github.com/ant-design/ant-design |
| 协议 | MIT |
| 总文件 | 4 800+ |
| 主语言 | TypeScript（98%） |
| 关键依赖 | React 18+, TypeScript 5, @ant-design/cssinjs, @rc-component/* |
| Star | 95k+ |
| 当前版本 | 6.4.3 |
| 团队 | 蚂蚁集团体验技术部 + 700+ 社区贡献者 |
| 关键里程碑 | 2017 v1 → 2018 v3 全 TS → 2020 v4 Hooks → 2021 v5 CSS-in-JS + Token → 2024 v6 React 19 + Zero-RT |
| 浏览器 | `> 0.5%` + `last 2 versions` + `not dead` |
