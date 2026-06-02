# chartjs - 65k Star 的浏览器 Canvas 图表库鼻祖：单一 RAF 循环 + 原型链注册表 + scope 插件化

**GitHub**: chartjs/Chart.js
**Star**: 65k+
**语言**: TypeScript + JavaScript
**主题**: Canvas 图表 / 数据可视化 / 插件化 / 全局动画 / scope 配置
**适用场景**: Dashboard 图表、SaaS 数据展示、设计师友好的图表库、可视化插件开发

## 第一段：基础范式

### 模式 1：单一 RAF 循环驱动所有 chart 动画

**问题场景**：页面有 10 个 chart 实例——若每个 chart 各自起一个 `requestAnimationFrame`，浏览器一帧内会触发 10 次回调。Page 越忙帧率越不稳定，CPU 占用飙升。

**解决方案**：用全局 `Animator._charts: Map<Chart, anims>` 把所有 chart 的动画合并——`animator._refresh()` 起一个 RAF，所有 chart 在一帧内 `notify` 一次。`if (this._request) return` 防重入——10 个 chart 调 `start` 也只起 1 个 RAF。
```js
// core.animator.js:38-52
_refresh() {
  if (this._request) return;  // 防重入
  this._running = true;
  this._request = requestAnimFrame.call(window, () => {
    this._update();  // 遍历所有 chart
    this._request = null;
    if (this._running) this._refresh();
  });
}
```

**关键参数**：
- 全局 `_charts: Map<Chart, anims>`——所有 chart 共享
- `if (this._request) return`——10 个 start 触发 1 个 RAF
- RAF 回调里清 `_request = null`——下一帧能再次进入
- 链式触发 `if (this._running) this._refresh()`——自然管理
- `_update` 内遍历所有 chart 一次——10 chart 1 帧 1 次回调

**最佳实践**：多实例动画用全局单 RAF——避免 10 个 RAF 回调；`if (_request) return` 防重入——比状态机简单；`_request = null` 在回调里清——下一帧重入；`Map<Chart, anims>` 索引——O(1) 增删。

---

### 模式 2：原型链注册表 TypedRegistry 替代硬编码 if-else

**问题场景**：8 种图表（Bar/Line/Doughnut/Pie/...）的分发——传统 `if (type === 'bar') new BarController()` 散落各处。加新图表要改核心代码 + 测试。

**解决方案**：用 `TypedRegistry.isForType(type)`——`Object.prototype.isPrototypeOf.call(this.type.prototype, type.prototype)` 判断继承关系。新图表类型只需 `Chart.register(MyController)` 注册，原型链自动匹配。
```js
// core.typedRegistry.js:16-18
isForType(type) {
  return Object.prototype.isPrototypeOf.call(this.type.prototype, type.prototype);
}
// 用法：datasetController instanceof BarController
// 不需要 if/else
```

**关键参数**：
- `TypedRegistry` 按原型链注册
- `isPrototypeOf` 判断继承——OO 多态原机制
- 4 个 TypedRegistry——controller / scale / element / plugin
- 新图表 `Chart.register(...)` 注册一次
- 框架代码 `for (const reg of registries) if (reg.isForType(type))` 分发

**最佳实践**：多态分发用原型链注册表——避免 if/else 散落；`isPrototypeOf` 替代 `instanceof` 显式声明；4 个 TypedRegistry 分领域——controller / scale / element / plugin；新功能 0 改核心代码——只注册。

---

### 模式 3：descriptor 缓存 + 失效——plugin notify 性能优化

**问题场景**：`PluginService.notify(hook, args)` 每帧都会被调用——100 个插件 + 30 FPS = 3000 次/秒。如果每帧都遍历 `plugins` 数组 + 重新合并 options，性能扛不住。

**解决方案**：用 `_cache: {plugins, options}` 缓存合并后的 descriptor 数组。注册新插件时 `_oldCache = _cache` 后清空——避免每次 notify 都重建。
```js
// core.plugins.js:73-99
notify(hook, args) {
  const _cache = this._cache;
  if (!_cache) {
    this._buildCache();  // 重建
  }
  const descriptors = _cache[hook];
  for (const descriptor of descriptors) {
    descriptor.plugin[hook](args);  // 调钩子
  }
}
_buildCache() {
  this._cache = { /* 合并 plugins + options */ };
}
```

**关键参数**：
- `_cache: {plugins, options}` 缓存合并结果
- 注册新插件时 `_oldCache = _cache` + 清空
- 30 FPS 100 插件 = 3000 钩子/秒——缓存后 0 重建
- descriptor = `{plugin, options}` 解构——call 直接取
- `args.cancelable: true` 钩子返回 `false` 终止流程

**最佳实践**：高频回调必做缓存——避免每帧重建；`_oldCache` 保留旧引用——回滚可能；descriptor 合并在 build——call 路径 0 工作；`cancelable: true` 约定——可中断钩子。

---

### 模式 4：scope-based config resolver——chartOptionScopes 链式合并

**问题场景**：插件 / scale / element 都有自己的 default options。配置分散在多个对象里——合并优先级混乱。用户写 `chart.options.plugins.tooltip.enabled = false` 怎么覆盖？

**解决方案**：用 `chartOptionScopes()` 返回 `['chart', 'datasets', 'dataset', 'plugin.tooltip', 'scale.x', ...]` scope 链。`_mergeScopes` 沿链逐层 merge——后写覆盖前写。`scriptable` 函数可访问 chart 上下文做动态计算。
```js
// core.config.js
chartOptionScopes() {
  return [
    this.options,  // 1. 用户顶层 options
    this.options.plugins?.tooltip,  // 2. tooltip 插件
    this.scales?.x,  // 3. x scale
    // ... 动态链
  ];
}
_mergeScopes(scopes) {
  return scopes.reduce((acc, scope) => mergeDeep(acc, scope), {});
}
```

**关键参数**：
- `chartOptionScopes()` 返回 scope 链数组
- 后写覆盖前写——数组顺序即优先级
- 链式 `reduce(mergeDeep, {})`——O(N) 合并
- `scriptable(ctx)` 函数——访问 chart 上下文动态计算
- `indexable` 选项——按 data index 取值

**最佳实践**：多来源 config 用 scope 链式合并——比嵌套 if 清晰；`chartOptionScopes()` 返回数组——顺序即优先级；`scriptable` 函数动态计算——比固定值更灵活；`indexable` 按 data index 取值——per-point 配置。

---

### 模式 5：盒模型布局 box.position + box.weight + box.stackWeight

**问题场景**：Chart 内有 6+ 组件（title / legend / tooltip / x scale / y scale / drawing area）——如何描述每个的位置？固定像素太死板，centered 又不能共存。

**解决方案**：用 `box.position`（top/bottom/left/right/center）+ `box.weight`（比例）+ `box.stackWeight`（同位置谁先排）三件套描述每个组件。`_updateLayout` 算每个 box 实际位置。
```js
// core.layouts.js
const boxes = [
  {position: 'top', weight: 1.0, stackWeight: 1},  // title
  {position: 'top', weight: 1.0, stackWeight: 2},  // legend
  {position: 'bottom', weight: 1.0, stackWeight: 1},  // x scale
  {position: 'left', weight: 1.0, stackWeight: 1},  // y scale
  {position: 'center', weight: 999, stackWeight: 1},  // chart area
];
```

**关键参数**：
- `position` 5 选 1——top/bottom/left/right/center
- `weight` 比例——同位置占比
- `stackWeight` 同位置谁先排——数字小先
- `center` weight=999 占满——其他算完剩下的就是 chart area
- 布局计算是 1 轮 O(N) 循环

**最佳实践**：复杂布局用三件套（position/weight/stackWeight）——避免硬编码；`weight` 比例 + `center` 999 占满——自适应；`stackWeight` 数字小先排——同位置有序；盒模型比 flex 简洁——专用算法。

---

## 第二段：扩展范式

### 模式 6：Canvas 2D 选型 vs SVG——10x 性能差距

**问题场景**：D3 用 SVG 渲染图表——1 万点以上性能崩塌（10 万 DOM 节点）。动画需要 60 FPS——SVG 重排跟不上。

**解决方案**：用 Canvas 2D context 渲染——`ctx.fillRect` / `ctx.arc` / `ctx.bezierCurveTo` 直接画像素。1 万点 60 FPS 轻松，离屏渲染可重用一个 element。代价：无 DOM 节点（a11y 需 aria-label）+ 无法 CSS 改样式。
```js
// helpers/canvas.js
function drawBar(ctx, bar) {
  ctx.fillStyle = bar.options.backgroundColor;
  ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
}
```

**关键参数**：
- 1 万点 60 FPS——Canvas 性能优势
- 离屏渲染——重用一个 element
- 像素级控制——动画更流畅
- 代价：无 DOM / 无 CSS / a11y 弱
- 60 FPS 是 UX 关键——SVG 跟不上的场景

**最佳实践**：大数据图表选 Canvas——10k+ 点必备；小图表可 SVG——动画 + a11y 友好；Canvas 离屏渲染——重用一个 element 节省内存；a11y 兜底——`aria-label` + tooltip 文本描述。

---

### 模式 7：plugin POJO + notify 钩子替代继承

**问题场景**：扩展 Chart 行为——传统继承 `class MyChart extends Chart` 单继承限制扩展性。多插件叠加（Tooltip + Legend + Zoom）无法组合。

**解决方案**：插件注册为 POJO `{id, defaults, start, stop, install, ...}`——Chart 在每个生命周期钩子 `notify(hook, args)` 串行调用。多插件可叠加，组合 > 继承。`args.cancelable: true` 时返回 `false` 终止。
```js
// 自定义插件
const myPlugin = {
  id: 'my-plugin',
  defaults: { enabled: true, color: 'red' },
  start(chart) { /* 初始化 */ },
  stop() { /* 清理 */ },
  afterDraw(chart) { /* 自定义绘制 */ },
};
Chart.register(myPlugin);
```

**关键参数**：
- 插件 POJO——`{id, defaults, start, stop, install, afterDraw, ...}`
- 6+ 钩子：`install` / `start` / `stop` / `beforeDraw` / `afterDraw` / `beforeDatasetsDraw`
- `notify(hook, args)` 串行调用
- `args.cancelable: true` 可中断——返回 `false`
- 200+ 第三方插件生态

**最佳实践**：扩展机制用 POJO + 钩子——组合 > 单继承；6+ 生命周期钩子——精细控制；`cancelable: true` 约定——可中断流程；`Chart.register()` 注册——即用即生效；200+ 插件生态是核心资产。

---

### 模式 8：scale autoskip 标签自适应算法

**问题场景**：x 轴 1000 个 category 标签——画不下会重叠。手动算宽度太复杂。

**解决方案**：用 `core.scale.autoskip.js` 算法——`getLabelCapacity(axisLength, labelFontSize, rotation)` 算当前轴长度能放几个 label；遍历 ticks，按权重跳过（major / minor 优先级）。
```js
// core.scale.autoskip.js
function getLabelCapacity(axisLength, labelFontSize, rotation) {
  // 算字符宽度
  const labelWidth = measureLabel(labelFontSize, rotation);
  return Math.floor(axisLength / labelWidth);
}
```

**关键参数**：
- `getLabelCapacity` 算容量——字符宽度 + 旋转
- major / minor tick 权重——major 不可跳
- 旋转标签——节省横向空间
- 跨平台字体测量——`measureText`
- 标签重叠自动跳过——0 用户干预

**最佳实践**：标签密度自适应——`getLabelCapacity` 算容量；major/minor 优先级——关键标签不可跳；旋转标签——90° 节省 80% 横向空间；`measureText` 跨平台——统一 API；0 用户干预——自动化处理。

---

### 模式 9：decimation 插件——10 万点降到 1 千点

**问题场景**：1 万点 60 FPS OK，10 万点开始卡。LTTB（Largest Triangle Three Buckets）算法在保留形状前提下抽稀。

**解决方案**：用 `plugins/plugin.decimation.js`——LTTB 算法按桶选点。每桶选 1 个点（保留最大三角形面积），10 万点 → 1000 点保留形状。
```js
// plugin.decimation.js
function lttb(data, threshold) {
  const sampled = [];
  const bucketSize = (data.length - 2) / (threshold - 2);
  let a = 0;
  sampled.push(data[a]);
  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0, avgY = 0;
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length);
    for (let j = rangeStart; j < rangeEnd; j++) {
      avgX += data[j].x; avgY += data[j].y;
    }
    avgX /= (rangeEnd - rangeStart);
    avgY /= (rangeEnd - rangeStart);
    // ... 选最大面积点
  }
  return sampled;
}
```

**关键参数**：
- LTTB 算法——Largest Triangle Three Buckets
- 每桶选最大面积点——保留形状
- 10 万 → 1000 点——100x 数据减少
- 配置项 `samples: 1000`——用户自定义
- 视觉上几乎无差异——保留峰值谷值

**最佳实践**：大数据可视化必做抽稀——10x 性能提升；LTTB 是行业标准——保留形状；配置 `samples` 用户可调——平衡性能 + 精度；视觉无差异是算法核心——保留 peak/valley。

---

### 模式 10：intl 国际化 + 数字/日期本地化

**问题场景**：Y 轴显示"1000"——美国是 `1,000`，欧洲是 `1.000`，中国是 `1,000.00`。日期格式 `MM/DD/YYYY` vs `DD/MM/YYYY` 跨地区差异大。

**解决方案**：用 `Intl.NumberFormat` + `Intl.DateTimeFormat`——`chart.intl` 包装。`ticks.callback` 走 Intl 格式化，自动按 locale 渲染。
```js
// helpers/intl.js
const numberFormatter = new Intl.NumberFormat(locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat(locale, {
  year: 'numeric', month: 'short', day: 'numeric',
});
```

**关键参数**：
- `Intl.NumberFormat` / `Intl.DateTimeFormat`——浏览器原生
- 100+ locale 支持
- `ticks.callback` 走 Intl——自动本地化
- 货币、百分比、科学记数——统一 API
- 比 moment.js / numeral.js 轻——浏览器内置

**最佳实践**：数字/日期国际化用 `Intl` API——比 moment.js 轻 100x；`ticks.callback` 走 Intl——`locale` 自动渲染；100+ locale 开箱即用——`navigator.language` 探测；货币/百分比统一——同 API。

---

## 第三段：进阶范式

### 模式 11：_resizeBeforeDraw 在 draw 前消化待处理 resize

**问题场景**：浏览器窗口 resize 触发 chart 重新计算尺寸——如果在 draw 中途 resize 会渲染抖动（边算边画）。

**解决方案**：用 `_resizeBeforeDraw: {width, height}` 暂存待处理 resize——`draw()` 第一步消化 resize 后再画。`ResizeObserver` 监听到 resize 时只 set 状态，不立即触发 draw。
```js
// core.controller.js:698-732
draw() {
  if (this._resizeBeforeDraw) {
    const {width, height} = this._resizeBeforeDraw;
    this._resizeBeforeDraw = null;
    this._resize(width, height);
  }
  this.clear();
  // ... 后续绘制
}
```

**关键参数**：
- `_resizeBeforeDraw` 暂存状态
- `ResizeObserver` 监听到 resize 只 set 状态
- `draw()` 第一步消化 resize
- 渲染抖动 = 边算边画——避免
- 60 FPS 帧稳定

**最佳实践**：resize 处理用"暂存 + 帧内消化"——避免抖动；`ResizeObserver` 监听——比 `window.resize` 精确；`draw()` 第一步消化——状态机清晰；渲染抖动 = 边算边画——绝不能发生。

---

### 模式 12：layers z 排序 + beforeDatasetsDraw 兼容层

**问题场景**：z 轴排序——title (z=0) 在 datasets 之前，tooltip (z=10) 在之后。v2 的 `beforeDatasetsDraw` / `afterDatasetsDraw` 钩子无法迁到 layer。

**解决方案**：注释明示"datasets 不属于 layer 因为兼容层"——中间硬塞 `_drawDatasets()`，layer 按 z 排序：z ≤ 0 在前，z > 0 在后。**实用主义**胜过"理论完美"。
```js
// core.controller.js:698-732
const layers = this._layers;
for (i = 0; i < layers.length && layers[i].z <= 0; ++i) {
  layers[i].draw(this.chartArea);
}
this._drawDatasets();  // 硬塞兼容层
for (; i < layers.length; ++i) {
  layers[i].draw(this.chartArea);
}
```

**关键参数**：
- `layers: {z, draw}` 数组
- z ≤ 0 在前 / z > 0 在后
- datasets 硬塞中间——`beforeDatasetsDraw` 兼容
- 注释明示"v2 兼容层"
- 实用主义 > 理论完美

**最佳实践**：z 排序用 layers 数组——清晰；版本兼容用"硬塞"——胜过完全重写；注释明说"v2 兼容"——后人知其然；实用主义 > 理论完美——工程上能跑就行。

---

### 模式 13：scriptable 函数动态计算属性

**问题场景**：用户想"按 data index 给 bar 不同的颜色"——`backgroundColor: ['red', 'blue', 'green']` 写死 3 个值。100 个数据点要写 100 个？

**解决方案**：用 `scriptable` 选项——`backgroundColor: (ctx) => ctx.dataIndex % 2 ? 'red' : 'blue'`。回调接收 `ctx` 含 `chart / dataIndex / parsed / scale` 等上下文。
```js
{
  datasets: [{
    backgroundColor: (ctx) => {
      const value = ctx.parsed.y;
      return value > 100 ? 'red' : 'blue';
    },
  }],
}
```

**关键参数**：
- `scriptable: true` 选项开启
- 回调 `(ctx) => any` 接收上下文
- `ctx.parsed / dataIndex / chart / scale` 完整信息
- 动态颜色 / 边框 / 旋转——按 data 算
- 静态 vs 动态——`scriptable` + `indexable` 区分

**最佳实践**：动态属性用 `scriptable` 函数——访问完整 ctx；`ctx.parsed` 拿坐标值——不用自己算；`ctx.dataIndex` 索引——per-point 逻辑；静态 vs 动态——`indexable` + `scriptable` 区分；颜色映射——`value > 100 ? 'red' : 'blue'`。

---

### 模式 14：Color Plugin 自动循环 palette

**问题场景**：用户有 10 个 datasets 想自动不同颜色——手动写 `['red', 'blue', ...]` 维护噩梦。Tailwind 风格的"自动循环"是 UX 关键。

**解决方案**：用 `plugins/plugin.colors.js`——`Color Plugin` 默认按 Figma 风格 palette 循环。`backgroundColor` 不写时自动取下一个色。
```js
// plugin.colors.js
const palette = [
  '#3366CC', '#DC3912', '#FF9900', '#109618',
  '#990099', '#3B3EAC', '#0099C6', '#DD4477',
  // ...
];
function nextColor(chart, datasetIndex) {
  return palette[(datasetIndex + chart.chartArea.left) % palette.length];
}
```

**关键参数**：
- 12 色 Figma 风格 palette
- 按 `datasetIndex % 12` 循环
- 用户可自定义——`options.color` 覆盖
- 自动 + 手动双轨——有写用写，没写用自动
- 9 个内置 plugin 之一

**最佳实践**：自动 palette 减少用户配置——`plugin.colors` 内置；Figma 风格色板——专业设计感；`datasetIndex % 12` 循环——简单可靠；用户可覆盖——`options.color` 优先；自动 + 手动双轨。

---

### 模式 15：helpers 工具库——measureText / 颜色计算 / 曲线插值

**问题场景**：跨浏览器文本宽度测量——不同字体宽度不同。颜色 alpha 混合、HSL 转换、对比度计算重复写。

**解决方案**：`src/helpers/` 7 个文件——`canvas` / `color` / `curve` / `math` / `options` / `rtl` / `intl`。`helpers` 是 `Chart.helpers` 暴露给用户 + 内部使用——单一工具库。
```js
// helpers/color.js
function transparentize(color, alpha) {
  const rgba = colorToRgb(color);
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${alpha})`;
}
```

**关键参数**：
- 7 个 helpers 文件
- `transparentize(color, alpha)` 透明度混合
- `measureText` 跨平台文本测量
- 曲线插值——`helpers/curve.js` cubicInterpolation
- `Chart.helpers` 暴露给用户

**最佳实践**：工具库 1 文件 1 职责——canvas/color/curve/math 分离；`Chart.helpers` 暴露——用户复用；`transparentize` 颜色混合——比手算 rgba 简单；`measureText` 统一跨平台——避免重复实现。

---

## 第四段：实战范式

### 模式 16：Chart.register 一次注册 + 8 种图表即用即生效

**问题场景**：用户新装 Chart.js 默认不注册任何 controller——`new Chart(canvas, {type: 'bar'})` 报"bar is not a registered controller"。

**解决方案**：用 `import 'chart.js/auto'`——一次性注册所有可注册项（8 controller + 4 element + 6 scale + 7 plugin）。`auto/index.ts` 集中 export 所有。
```ts
// src/auto/index.ts
import { Chart, registerables } from '../index';
Chart.register(...registerables);
// 用户
import { Chart } from 'chart.js/auto';
```

**关键参数**：
- `chart.js/auto` 入口
- `registerables` 数组——所有内置项
- `Chart.register(...registerables)` 注册
- 体积影响：80KB+（gzip）——vs 按需 5KB
- 按场景选：内部产品用 auto，开源库按需

**最佳实践**：开箱即用 `chart.js/auto`——内部产品首选；按需 `Chart.register(BarController, ...)`——开源库减体积；`registerables` 集中 export——单一真相源；体积 trade-off：80KB vs 5KB。

---

### 模式 17：chart.update() 触发全流程

**问题场景**：用户改 data 后希望图表更新——手动调 `_updateDatasets` / `_render` 太底层。

**解决方案**：`chart.update()` 触发全流程——`_updateLayout` → `_updateDatasets` → `render` → `draw`。`update('none')` 跳过动画，`update('show')` 强制动画。
```js
// 用户
chart.data.datasets[0].data = newData;
chart.update();
// 或强制不动画
chart.update('none');
```

**关键参数**：
- `update()` 默认有动画
- `update('none')` 跳过动画
- `update('resize')` 处理 resize
- `update('reset')` 重置 state
- 5 步流程：layout → datasets → render → draw → plugins notify

**最佳实践**：组件 API 必有一个 `update()`——屏蔽内部流程；`update('none')` 跳过动画——批量更新场景；`update('resize')` 处理 resize——统一 API；5 步流程——`layout → datasets → render → draw → notify`。

---

### 模式 18：Chart.getChart(canvas) 查找实例

**问题场景**：用户拿 `<canvas>` 元素想拿对应 chart 实例——`new Chart(canvas)` 后 `chart` 变量丢失。需要从 DOM 反查。

**解决方案**：`Chart.getChart(canvas)` 静态方法——`Chart.instances: WeakMap<Canvas, Chart>` 索引。`getChart` 是反查 API，destroy 时清空。
```js
// DOM 反查
const canvas = document.getElementById('myChart');
const chart = Chart.getChart(canvas);
chart.data.datasets[0].data = newData;
chart.update();
```

**关键参数**：
- `Chart.instances: WeakMap` 全局索引
- `getChart(canvas)` 静态方法反查
- `destroy()` 时清 WeakMap——自动 GC
- `getChart('key1')` 也支持 key 查找
- DOM + JS 双入口

**最佳实践**：DOM 元素 + 实例必须有反查 API——`getChart`；`WeakMap<Canvas, Chart>` 自动 GC——避免内存泄漏；`destroy()` 清空引用——生命周期完整；DOM + JS 双入口——满足不同使用风格。

---

### 模式 19：Platform 平台抽象——SSR / Node 测试 / Web Worker

**问题场景**：Chart 默认假设浏览器环境——`window.devicePixelRatio` / `document` / `addEventListener`。但 SSR / Node 测试 / Web Worker 无这些 API。

**解决方案**：用 `platform/` 抽象——`BasePlatform` 抽象方法（`getDevicePixelRatio` / `addEventListener` / `getMaximumSize`）。`BasicPlatform` 浏览器默认实现。用户可自定义 `Chart.platform = new MyPlatform()`。
```js
// platform/BasicPlatform.js
class BasicPlatform extends BasePlatform {
  getDevicePixelRatio() { return window.devicePixelRatio; }
  addEventListener(chart, type, listener) { window.addEventListener(type, listener); }
  // ...
}
// 用户自定义
Chart.platform = new ServerPlatform();  // SSR 无 window
```

**关键参数**：
- `BasePlatform` 抽象类
- `BasicPlatform` 浏览器默认
- `DomPlatform` 旧版兼容
- `Chart.platform = new MyPlatform()` 替换
- SSR / Web Worker / Node 测试——各自实现

**最佳实践**：浏览器 API 必做平台抽象——`BasePlatform`；`Chart.platform` 全局可替换——SSR/Node 友好；`getDevicePixelRatio` 抽象——Retina 屏正确；`addEventListener` 抽象——`window` vs `globalThis` 切换。

---

### 模式 20：destroy + dispose + 完整清理

**问题场景**：SPA 路由切换销毁页面——chart 实例未释放，`ResizeObserver` / `requestAnimationFrame` / `addEventListener` 全泄漏。100 次路由切换后内存爆炸。

**解决方案**：`chart.destroy()` 完整清理——`stop()` / `unbindEvents()` / `_destroyBindings()` / `Chart.instances.delete(canvas)`。`destroyed: true` 标记防止重复操作。
```js
// 用户
useEffect(() => {
  const chart = new Chart(canvasRef.current, config);
  return () => chart.destroy();  // SPA 路由切换清理
}, []);
```

**关键参数**：
- `destroy()` 5 步：stop / unbindEvents / _destroyBindings / 清 cache / delete instance
- `destroyed: true` 防重入
- `ResizeObserver.disconnect()` 必须
- `requestAnimationFrame` cancel——清 `_request`
- `Chart.instances.delete(canvas)` 清 WeakMap

**最佳实践**：SPA 必调 `chart.destroy()`——避免内存泄漏；`destroyed: true` 防重入——避免副作用；`ResizeObserver.disconnect()` 必加——观察者必须清理；`requestAnimationFrame` cancel——清 RAF 句柄；5 步清理流程——不留死角。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | `github.com/chartjs/Chart.js` |
| 协议 | MIT |
| 总文件 | 1,758（src/ 90 + docs/ + test/ + .github/） |
| 主语言 | JavaScript (75%) + TypeScript (25%) |
| Star | 65k+ |
| 当前版本 | 4.5.1 |
| npm 周下载 | 300 万+ |
| 团队 | Chart.js 团队（5-7 核心维护者）+ 200+ 贡献者 |
| 关键依赖 | TypeScript 5.x / Rollup / Karma / Jasmine |
| 关键里程碑 | 2013 v1 → 2016 v2 → 2020 v3 TS 重构 → 2021 v4 新动画 + decimation → 2024 v4.5 维护中 |
| 商业模式 | MIT 开源 + 商业版 Chart.js Plus（高级类型 + 服务） |
| 浏览器 | `> 0.5%` + `last 2 versions` + `not dead` |
