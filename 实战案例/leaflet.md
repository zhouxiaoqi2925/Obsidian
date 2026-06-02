# leaflet - 开源移动优先 Web 地图库：L.Class mixin 多继承 + L.Map 中介者 + GridLayer 瓦片

**GitHub**: Leaflet/Leaflet
**Star**: 42k+
**语言**: JavaScript (ES5/ES6)
**主题**: 地图 / 瓦片 / GIS / 可视化 / 移动优先
**适用场景**: 移动 Web 地图 / LBS 应用 / 数据可视化 / 离线地图 / GIS 二次开发

```
src/map/         # L.Map 中介者
src/layer/       # L.Layer 基类 + Tile/Marker/Path 子类
src/dom/         # L.DomEvent 浏览器兼容
src/geo/         # L.CRS 投影 + L.LatLng
src/control/     # L.Control UI 组件
```

## 第一段：基础范式

### 模式 1：L.Class + Mixin 多继承混入

**问题场景**：地图对象要同时具备"可拖拽 + 可缩放 + 弹出层"等多个能力，传统单继承链难以组合。

**解决方案**：`L.Class` 是 Leaflet 自研的 class 框架，支持 `include / extend / mergeOptions` 三种混入。`L.Marker` 通过 `L.Mixin.Events` 拿到 `on/off/fire`，通过 `L.Mixin.Events` 拿交互。多 mixin 自由组合，避免菱形继承。

**关键参数**：
- `L.Class.extend()` 定义类
- `include(Mixin)` 实例方法
- `extend(Mixin)` 静态方法
- `mergeOptions()` 默认选项
- `initialize()` 构造钩子

**最佳实践**：所有 Leaflet 类都从 `L.Class.extend()` 起步；mixin 放 `src/layer/mixin/` 目录；钩子走 `fire('event', data)` 自定义事件；子类构造函数**总是**调 `L.Util.setOptions(this, options)`。

---

### 模式 2：L.Evented 事件总线

**问题场景**：地图对象几十种事件（click/moveend/zoomstart）需要在多个模块间分发监听。

**解决方案**：`L.Evented` mixin 提供 `on/off/once/off/fireEvent` 完整事件 API；`map.on('click', handler)` 监听；`map.fire('movestart')` 触发；事件支持命名空间 `map.on('layeradd:popup', ...)` 精准订阅；事件可携带 `L.LeafEvent` 对象含原始 DOM 事件。

**关键参数**：
- `on(types, handler)` 订阅
- `off(types, handler)` 取消
- `once(types, handler)` 单次
- `fire(type, data)` 触发
- `L.LeafEvent` 包装

**最佳实践**：地图操作前 `map.on('moveend', updateMarkers)` 同步更新 marker；用 `off()` 解绑避免内存泄漏；事件命名空间 `layeradd:popup` 便于批量 off；不要直接改内部状态用 `fire` 走事件让其他模块响应。

---

### 模式 3：Map 中介者模式

**问题场景**：Map / Layer / Control 几十个组件要互相协调，单向依赖会导致耦合爆炸。

**解决方案**：`L.Map` 是中介者（mediator）：layer 添加删除通过 `map.addLayer/l.removeLayer` 走 map 通知所有 control 同步；pane 切换、坐标转换、事件分发都走 map 中心化。组件之间不直接通信。

**关键参数**：
- Map 中心节点
- `addLayer/removeLayer`
- 事件广播
- `getBounds/getCenter`
- `fitBounds/setView`

**最佳实践**：自定义组件通过 `L.Map` 暴露的 API 接入**不**绕过；用 `map.eachLayer` 遍历；中心坐标用 `map.getCenter()` 不缓存；自定义 control 监听 `map.on('zoomend', ...)` 同步。

---

### 模式 4：L.CRS 投影抽象

**问题场景**：不同地图服务用不同投影（Web Mercator / 地理坐标 / 百度 BD09），底层计算差异巨大。

**解决方案**：`L.CRS` 抽象基类 + 4 内置实现（`L.CRS.EPSG3857` Web 墨卡托 / `L.CRS.EPSG4326` 地理坐标 / `L.CRS.Earth` 简单球面 / `L.CRS.Simple` 平面）；`latLngToPoint / pointToLatLng / scale / transformation` 4 核心方法。TileLayer 创建时绑定 CRS 决定瓦片计算。

**关键参数**：
- 4 内置 CRS
- `latLngToPoint` 投影
- `pointToLatLng` 反投影
- `scale(zoom)` 缩放因子
- `transformation` 仿射变换

**最佳实践**：默认 Web 墨卡托足够；中国业务接百度/高德需自定义 CRS（`L.CRS.Baidu`）；`L.CRS.Simple` 适合游戏/室内图；切 CRS 时同步换 TileLayer。

---

### 模式 5：MapPanes 7 层 z-index

**问题场景**：地图有底图、矢量、overlay、tooltip、popup 多个图层，要保证 popup 在最上、tooltip 在 marker 上、底图在最下。

**解决方案**：`L.Map` 内部维护 7 个 pane（`mapPane / tilePane / overlayPane / shadowPane / markerPane / tooltipPane / popupPane`），每个 pane 是独立 `HTMLElement` 配 z-index；自定义 pane `map.createPane('custom')` 插入指定层级。CSS `z-index` 控叠放。

**关键参数**：
- 7 内置 pane
- `createPane(name)` 自定义
- `getPane(name)` 取出
- z-index 100-700
- DOM 层级 = 视觉层级

**最佳实践**：业务自定义层**用** `createPane` 不直接挂 DOM；pane 名字带前缀 `customTraffic` 防冲突；pane 性能优化 `transform: translate3d` 走 GPU；popup 永远在最高层。

---

## 第二段：扩展范式

### 模式 6：GridLayer 瓦片网格

**问题场景**：地图要按视口加载瓦片（256x256 PNG），拖动时实时计算可见瓦片 + 加载未缓存瓦片。

**解决方案**：`L.GridLayer` 是瓦片基础类；`getTileUrl(coords)` 子类覆写；`_tiles` 内部 Map 缓存 DOM 元素；`redraw()` 强制刷新；`L.TileLayer` 继承 GridLayer 实现 `getTileUrl` 走 OSM/Mapbox URL 模板。viewport 计算用 `map.getBounds()` + 瓦片坐标。

**关键参数**：
- `tileSize` 256 瓦片
- `minZoom/maxZoom`
- `getTileUrl(coords)` URL
- `_tiles` 内部缓存
- `redraw()` 刷新

**最佳实践**：自定义瓦片源继承 `L.GridLayer` 而**不是** `L.TileLayer`（更灵活）；`tileSize: 512` 走 Retina 高清屏；`updateWhenZooming: false` 防快速缩放时频繁加载；`keepBuffer: 2` 留 2 圈缓存。

---

### 模式 7：L.Layer 抽象基类

**问题场景**：marker、polyline、polygon、tile、image 几十种地图对象类型要有统一接口。

**解决方案**：`L.Layer` 是所有可视对象基类，定义 `addTo/remove/on/off/getBounds/setStyle` 通用 API；子类（Marker/Polyline/Polygon/TileLayer/ImageOverlay）实现 `onAdd(map)/onRemove(map)` 钩子做 DOM 挂载/卸载；`map.hasLayer(layer)` 检测存在。

**关键参数**：
- `addTo(map)` 挂载
- `remove()` 卸载
- `onAdd / onRemove` 钩子
- `getBounds` 边界
- `setStyle` 样式

**最佳实践**：所有可视对象继承 `L.Layer`；`onAdd` 负责 DOM 创建 + 事件绑定 + map 注册；`onRemove` 反向释放防泄漏；自定义 layer 必须实现 `onAdd / onRemove` 不留空。

---

### 模式 8：Renderer 双实现 SVG/Canvas

**问题场景**：渲染 1 万个点 / 线，传统 SVG 节点太多 DOM 爆炸；Canvas 难交互（点击拾取）。

**解决方案**：`L.SVG` 和 `L.Canvas` 两种 Renderer 都继承 `L.Renderer`；`L.Path`（Polyline/Polygon/Circle）渲染时通过 `map.options.renderer` 决定走哪个；SVG 适合 < 1000 元素 + 强交互；Canvas 适合 > 1000 元素 + 高性能。`renderer: L.canvas()` 创建时指定。

**关键参数**：
- `L.SVG` 矢量 DOM
- `L.Canvas` 像素绘制
- `renderer` 工厂
- `redraw()` 重绘
- 拾取算法

**最佳实践**：1000 元素以下默认 SVG，之上切 `L.canvas({ padding: 0.5 })`；Canvas 不能用 CSS 选择器改样式，得 `setStyle({ color: 'red' })`；混合使用 `map.options.preferCanvas = true`。

---

### 模式 9：TileLayer.WMS 标准化协议

**问题场景**：业务要接 WMS（Web Map Service）标准服务（地形、气象、海图）数据。

**解决方案**：`L.TileLayer.WMS extends TileLayer` 配 `wmsOptions: { layers: 'topo', format: 'image/png', transparent: true }`；自动构造 GetCapabilities 请求 + GetMap URL；`on('loading', e => showSpinner())` 监听加载状态。OGC 标准协议。

**关键参数**：
- `wmsOptions.layers`
- `format: image/png`
- `transparent: true`
- `version: 1.1.1/1.3.0`
- `crs` 投影

**最佳实践**：WMS 服务地址走 HTTPS；多图层用逗号分隔 `layers: 'topo,roads'`；`infoFormat: 'application/json'` 接 WMS GetFeatureInfo；超时配 `maxGetUrlLength: 1900` 防 URL 截断。

---

### 模式 10：InteractiveLayer + 拾取

**问题场景**：地图上 1 万个 marker，要点击时精准定位是哪个。

**解决方案**：`L.Layer` 默认不可交互（仅显示）；`L.Path` 走 SVG 时 DOM 事件天然拾取；`L.Marker` 用 `divIcon` 自定义 HTML 拾取；`L.Canvas` 需自己写 hit detection（`renderer._hitTest`）。`interactive: true` 控制是否响应事件。

**关键参数**：
- `interactive` 标志
- `bubblingMouseEvents`
- `getElement()` 拾取入口
- Canvas `hitTest`
- 事件冒泡控制

**最佳实践**：业务自定义 layer 总设 `interactive: true`；多个 layer 嵌套用 `L.LayerGroup` 防事件穿透；Canvas 高密度场景用 `Leaflet.PixiOverlay` 走 WebGL 提升拾取。

---

## 第三段：进阶范式

### 模式 11：Handler 拖拽 / 缩放手势

**问题场景**：地图要支持鼠标拖拽、滚轮缩放、双击放大、键盘方向键、触摸双指捏合，5 种交互要正交组合。

**解决方案**：`L.Handler` 抽象基类 5 个子类（`Drag / BoxZoom / DoubleClickZoom / ScrollWheelZoom / TouchZoom`）；`map.dragging.enable()/disable()` 开关；Handler 走 `enable/disable/_onMouseDown/_onMouseMove/_onMouseUp` 钩子；多 Handler 可同时启用。

**关键参数**：
- `L.Handler` 基类
- 5 内置 Handler
- `enable/disable`
- `_onMouseDown/Up`
- 自定义 Handler

**最佳实践**：移动端用 `touchZoom: true` 启双指缩放；禁用部分交互 `map.boxZoom.disable()` 业务场景；自定义 Handler 继承 `L.Handler` + 实现 4 钩子；不要直接绑 `mousedown` 走 Handler 抽象。

---

### 模式 12：L.Control 4 内置 + 自定义

**问题场景**：地图右上角要有 zoom +/- 按钮、左下角 attribution、右上角图层切换器。

**解决方案**：`L.Control` 是 UI 组件基类；4 内置（`Zoom / Attribution / Scale / Layers`）；自定义 Control `L.Control.MyControl = L.Control.extend({ onAdd: map => container, onRemove: container })`；`map.addControl(new L.Control.Zoom({ position: 'topright' }))` 4 位置（topleft/topright/bottomleft/bottomright）。

**关键参数**：
- 4 内置 Control
- `position: 4 边角`
- `onAdd/onRemove`
- `addControl/removeControl`
- 容器 DOM

**最佳实践**：自定义 Control 放 `L.Control.MyTool = L.Control.extend`；onAdd 返回容器 DOM；onRemove 清理事件；位置冲突自动栈式排列。

---

### 模式 13：14 年兼容 + PointerEvent 升级

**问题场景**：14 年前发布要兼容 IE9+ 老浏览器 + 现代 PointerEvent API。

**解决方案**：核心走原生 `mousedown/mousemove/mouseup` 老 API；现代浏览器走 `pointerdown/pointermove/pointerup` 统一指针；`L.DomEvent` 抽象层 `addListener` 自动选最优 API；CSS `touch-action: none` 阻止浏览器默认手势。

**关键参数**：
- `L.DomEvent` 抽象
- `mousedown` 老 API
- `pointerdown` 新 API
- `touch-action` CSS
- 事件坐标归一化

**最佳实践**：自定义交互走 `L.DomEvent.addListener(el, type, handler)` 跨浏览器；移动端加 `touch-action: none` 防页面滚动；高 DPI 屏用 `getBoundingClientRect` 算真实坐标。

---

### 模式 14：L.marker + L.divIcon 自定义图标

**问题场景**：业务 marker 要根据 type 显示不同颜色 / 图标 / 大小，OSM 默认 marker 单一蓝色。

**解决方案**：`L.divIcon({ html: '<div class="my-marker">A</div>', className: '', iconSize: [40, 40], iconAnchor: [20, 40] })` 返回 `L.Icon`；`L.marker([lat, lng], { icon: myIcon })` 使用；`L.icon` 是默认 `imageIcon` 走 `iconUrl`；CSS 动画 + 状态类自定义样式。

**关键参数**：
- `L.divIcon` HTML
- `L.Icon` 图片
- `iconSize/Anchor`
- `popupAnchor`
- `className`

**最佳实践**：10+ 类 marker 用 `L.divIcon` + CSS 类切换而**不是** 10 个 PNG；`iconAnchor: [w/2, h]` 底部居中；marker cluster 用 `Leaflet.markercluster` 插件。

---

### 模式 15：L.Popup + 弹层

**问题场景**：点击 marker 弹出信息卡，支持关闭、定位、自定义 HTML。

**解决方案**：`L.popup({ maxWidth: 300, autoPan: true, offset: [0, -30] })` 创建；`popup.setLatLng([lat, lng]).setContent('<h3>Title</h3>').openOn(map)` 链式；`marker.bindPopup(popup)` 绑定；事件 `popupopen/popupclose`。

**关键参数**：
- `setContent` HTML
- `openOn/closePopup`
- `bindPopup` 绑定
- `autoPan` 自动移位
- `maxWidth/offset`

**最佳实践**：popup HTML 通过 XSS 转义防注入；长内容懒加载 `popupopen` 时再 fetch；多个 popup `openPopup` 关上一个；自定义 popup 类 `L.Popup.extend`。

---

## 第四段：实战范式

### 模式 16：Vitest + Playwright E2E 测试

**问题场景**：地图交互（拖拽/缩放/点击）跑在浏览器，传统 jsdom 无法模拟 Canvas/SVG 事件。

**解决方案**：`vitest` 跑单测 + `playwright` 跑 E2E；`@vitest/browser` 直接在浏览器跑；mock 用 `vitest-canvas-mock` 拦截 Canvas API；地图初始化用 `document.createElement('div')` 给固定 size 600x400；断言用 `expect(map.getCenter().lat).toBeCloseTo(51.5, 5)`。

**关键参数**：
- `vitest` 单元
- `playwright` E2E
- `@vitest/browser` 浏览器内跑
- `vitest-canvas-mock`
- 固定 size 容器

**最佳实践**：地图测试用真实浏览器（playwright）不用 jsdom；DOM 容器给固定 size；canvas 操作用 mock；E2E 截图回归 `playwright screenshot`；多 zoom level 矩阵化测试。

---

### 模式 17：smoke test 5 行验证环境

**问题场景**：新装 Leaflet 后快速验证地图是否就位。

**解决方案**：5 行 smoke test：
```html
<div id="map" style="height:400px"></div>
<script>
const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OSM' }).addTo(map);
L.marker([51.5, -0.09]).addTo(map).bindPopup('Hello');
</script>
```
期望：显示伦敦地图 + 一个 marker + 点击 popup。

**关键参数**：
- 5 行核心验证
- `setView` 中心
- `tileLayer` OSM
- `marker + bindPopup`
- 30s 可跑完

**最佳实践**：新环境验证地图库用 5-10 行 smoke test 验证"瓦片 + 标记 + 弹层"三件套；OSM attribution 必加；HTTPS 引用瓦片防 mixed content；CDN 路径用 unpkg / jsdelivr。

---

### 模式 18：OSM Attribution 强制要求

**问题场景**：用 OSM 瓦片必须挂 attribution，否则违反 OSM 政策。

**解决方案**：`L.tileLayer(url, { attribution: '&copy; <a href="https://osm.org">OSM</a>' })` 必传；OSM Tile Usage Policy 要求商业应用联系 `tile@openstreetmap.org`；高流量业务切自家瓦片服务（Mapbox / Maptiler / 自建）防 OSM 限流。

**关键参数**：
- `attribution` 强制
- OSM Tile Usage Policy
- 商业联系邮箱
- 高流量切私有瓦片
- `&copy;` HTML 实体

**最佳实践**：attribution 永远保留（OSM 法律要求）；商业大流量**不要**直连 OSM 改用商业瓦片（Mapbox/Maptiler）；attribution 链到 OSM contributor 页面；缓存瓦片减负担。

---

### 模式 19：vs Mapbox GL JS / OpenLayers 选型

**问题场景**：4 个候选库（Leaflet 42k / Mapbox GL 11k / OpenLayers 11k / Google Maps API 商业），按需选型。

**解决方案**：Leaflet 轻量 42KB + 成熟稳定 + 移动优先 + 插件生态 700+；Mapbox GL JS WebGL 矢量瓦片 + 3D 建筑 + 性能高 5x；OpenLayers OGC 标准 + GIS 专业 + 学术首选；Google Maps API 易用但商业收费 + 锁定。Leaflet 适合 90% 业务，Mapbox 适合大流量矢量，OpenLayers 适合 GIS 专业。

**关键参数**：
- Leaflet 42k 通用
- Mapbox GL WebGL 矢量
- OpenLayers GIS 专业
- Google Maps 商业
- 插件生态

**最佳实践**：90% 业务选 Leaflet 性价比最高；矢量瓦片/3D 选 Mapbox GL；GIS 学术/标准选 OpenLayers；不要直接调 Google Maps API 用 Leaflet 插件 `Leaflet.GoogleMutant`；3D 室内图选 `Leaflet-Indoor`。

---

### 模式 20：7 天复刻 mini-leaflet

**问题场景**：学习用，想搭一个简化版 Leaflet 理解核心。

**解决方案**：7 天分 5 步：① Day 1-2 L.Class + L.Layer + L.Evented 核心 30 个 API ② Day 3 L.Map 中介者 + L.CRS 投影 ③ Day 4 L.GridLayer 瓦片 + L.TileLayer ④ Day 5 L.Marker + L.Popup + L.Control 5 个组件。

**关键参数**：
- Day 1-2 核心
- Day 3 中介
- Day 4 瓦片
- Day 5 组件
- 7 天最小可用

**最佳实践**：复刻 Leaflet 先求"最小可跑内核"再迭代；7 天只够做 80% 场景的简化版；**完整 L.Map + L.Layer + 4 CRS + 瓦片 + 5 内置组件需要 3 个月+**；适用任何"地图库学习"。

---

## 关键代码段

```js
// 5 行 smoke test - 验证"瓦片 + 标记 + 弹层"
const map = L.map('map').setView([51.505, -0.09], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://osm.org">OSM</a>'
}).addTo(map);
L.marker([51.5, -0.09]).addTo(map).bindPopup('Hello Leaflet');

// 自定义 divIcon + popup
const myIcon = L.divIcon({
  html: '<div class="my-marker">A</div>',
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 40]
});
L.marker([51.5, -0.09], { icon: myIcon })
  .addTo(map)
  .bindPopup(L.popup().setContent('<h3>Title</h3>'));
```

## 必偷 3 件

1. **L.Class 多 mixin 自由组合**：`include/extend/mergeOptions` 3 件套替代单继承；`L.Mixin.Events` 拿 `on/off/fire`；比 Backbone 时代 ES5 mixin 灵活 5x。
2. **L.Map 中介者 + 7 Pane DOM 分层**：`addLayer/removeLayer` 走 map 中心化；7 个 pane 控 z-index；自定义 `createPane` 插入指定层级；性能优化 `transform: translate3d` 走 GPU。
3. **GridLayer 瓦片 + Renderer 双实现**：256 瓦片按视口懒加载；SVG 1000 元素以下默认，之上切 `L.canvas()`；`L.TileLayer.WMS` 走 OGC 标准；插件生态 700+ 是最大优势。

## 必避 3 坑

1. **不要直接调 Google Maps API**——商业收费 + 锁定；用 Leaflet 插件 `Leaflet.GoogleMutant` 或换 Mapbox。
2. **不要忽略 OSM attribution**——OSM Tile Usage Policy 强制要求；商业大流量要切商业瓦片（Mapbox/Maptiler）防限流。
3. **不要在 jsdom 测地图交互**——Canvas/SVG 事件模拟不全；用 `playwright` 真实浏览器 + `vitest-canvas-mock` 拦截；多 zoom level 矩阵化。
