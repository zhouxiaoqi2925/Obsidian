# leaflet · ABL 模式速查（Amazon Builders' Library Style）

> Leaflet 是 Volodymyr Agafonkin（@mourner）于 2010 年创建的开源交互式地图 JavaScript 库，40KB gzipped JS + 3.2KB gzipped CSS。当前 2.0.0-alpha.1，14 年长盛不衰的事实标准。本文按"问题场景 → 解决方案 → 关键参数 → 最佳实践"格式整理 20 个核心模式。

---

## 第一段：基础范式

### 模式 1 - `L.Class` 混入继承（轻量 OOP 而非 ES6 class）

**问题场景**：2010 年 ES5 时代没有 class 关键字，库里又需要"继承 + 混入（mixin） + 实例方法"语法糖。Leaflet 自实现 `L.Class`。

**解决方案**：`Class.extend(props)` 创子类构造函数，`Object.create(parentProto)` 设原型链，`__super__` 挂父引用，`statics` 静态方法，`includes` 数组 mixin，`addInitHook` 延迟初始化钩子。

**关键参数**：
- `initialize` 构造函数
- `__super__` 父类原型
- `statics` 静态方法
- `includes` mixin 数组
- `_initHooks` 构造后钩子
- `addInitHook` 钩子注册

**最佳实践**：子类 `initialize` **必须**调 `L.Layer.prototype.initialize.call(this, options)`；mixin 用 `includes: [L.Evented, L.Handler]` 避免 5 层继承；`L.Class.extend({})` 是**唯一**继承入口，**不要**用 `Object.assign`；任何"mixin 优先 OOP"项目可借鉴此范式。

### 模式 2 - `L.Evented` 事件总线（对象间松耦合通信）

**问题场景**：地图、图层、控件要通信（拖动结束、瓦片加载完成、缩放变更），强耦合回调导致 API 难扩展。

**解决方案**：`on(type, fn, ctx)` 注册（链式），`off(type, fn)` 注销防泄漏，`fire(type, data)` 同步触发，`once(type, fn)` 单次，`listens(type)` 探测，`event.target` 触发者引用，`event.propagatedFrom` 嵌套父事件。

**关键参数**：
- `on(type, fn, ctx)` 注册
- `off(type, fn)` 注销
- `fire(type, data)` 触发
- `once(type, fn)` 单次
- `listens(type)` 探测
- `event.target` 触发者
- `event.propagatedFrom` 父事件

**最佳实践**：自定义 Layer **必须** `L.Evented.include(MyClass)` 才有 `on/fire`；`off(type, fn)` 必填——Map 销毁前 `map.off()` 防内存泄漏；事件名用 `:` 分层 `layer:add` / `tile:load` / `zoom:change`；高频事件（`mousemove`）用 `requestAnimationFrame` 节流；任何"发布订阅"项目可借鉴此范式。

### 模式 3 - CRS + Projection + Transformation 三层分离（投影/缩放/平移独立）

**问题场景**：地图在 Web 墨卡托（EPSG:3857）、WGS84（EPSG:4326）、SimpleCRS 间切换；不同缩放级别瓦片布局不同。

**解决方案**：`CRS` 坐标参考系抽象基类，`Projection` 球面→平面（经纬度→米），`Transformation` 平面→像素（米→屏幕坐标），`latLng(point, zoom)` 三步合一业务调用，`scale(zoom)` 256×2^zoom 瓦片大小，`wrapLat` / `wrapLng` 边界包裹防溢出。

**关键参数**：
- `CRS` 坐标参考系
- `Projection` 球面→平面
- `Transformation` 平面→像素
- `latLng(point, zoom)` 三步合一
- `scale(zoom)` 256×2^zoom
- `wrapLat` / `wrapLng` 边界

**最佳实践**：默认 `EPSG:3857` 99% 业务够用；改 CRS `map.options.crs = L.CRS.EPSG4326`；自定义投影用 `Proj4Leaflet` 绑定 proj4js；中国业务用 `GCJ-02` 火星坐标 `gcoord` 库转换；任何"多层投影"项目可借鉴此范式。

### 模式 4 - `L.Point` 不可变值对象（坐标系统一）

**问题场景**：地图里坐标有"layer point / container point / map point" 3 种，混用必出 bug。Leaflet 用不可变 Point 类。

**解决方案**：`Point(x, y, round)` 构造（round 取整），`.add/.subtract` 算术返**新** Point 不可变，`.scaleBy(k, origin)` 缩放围绕 origin，`L.point(x, y)` 工厂接受数组/对象/两数字多种输入，round 像素对齐防亚像素模糊。

**关键参数**：
- `Point(x, y, round)` 构造
- `.add/.subtract` 算术返新
- `_add/_subtract` 私有变更
- `.scaleBy(k, origin)` 缩放
- `L.point(x, y)` 工厂
- `round` 像素对齐

**最佳实践**：`point.add(other)` 返回**新** Point 原 point 不变——React 风格；内部循环用 `_add` 改自己避免大循环 GC 压力；坐标输入模糊：数组 `[10,20]` / 对象 `{x,y}` / 两数字 都行；像素对齐 `new Point(x, y, true)` 防模糊；LatLng 与 Point 是独立类**不要**混用 `point.x` 当经度。

### 模式 5 - `L.LatLng` 球面坐标（经纬度校验 + 转换）

**问题场景**：经纬度数值范围（lat ±90、lng ±180）需要校验；与 `Point` 互转是高频操作。

**解决方案**：`LatLng(lat, lng, alt)` 构造（`isNaN` 抛错），防重复 new 陷阱，`equals(other, margin)` 浮点比较默认 1e-9，`distanceTo(other)` Haversine 球面距离米，`toBounds(sizeInMeters)` 边界 box，`wrap()` ±180 包裹防溢出，`L.latLng(...)` 工厂接受多种输入。

**关键参数**：
- `LatLng(lat, lng, alt)` 构造
- `.equals(other, margin)` 浮点比较
- `.distanceTo(other)` Haversine 米
- `.toBounds(sizeInMeters)` 边界 box
- `.wrap()` ±180 包裹
- `L.latLng(...)` 工厂

**最佳实践**：始终用 `L.latLng(40, -75)` 工厂**不**直接 `new LatLng` 避免重复 new 陷阱；`.equals` 用浮点 margin 比较 `===` 永远 false；高频点击坐标存 `LatLng` 不存 `{lat, lng}` 节省内存；`distanceTo` 是球面距离（米）——平面距离用 `toBounds` + box；任何"球面坐标"项目可借鉴此范式。

---

## 第二段：扩展范式

### 模式 6 - `L.Map` 容器类（地图状态/交互/动画的中央调度）

**问题场景**：地图要管理"中心点、缩放、图层列表、交互 handler、动画队列"——单一对象。

**解决方案**：`L.Map` 继承 `L.Evented`：`options.crs` 默认 `EPSG:3857`，`center` 默认 `[0,0]`，`zoom` 默认 `0`，`minZoom` / `maxZoom` 限制，`zoomControl` 显示 + / -，`fadeAnimation` 淡入，`zoomAnimation` 平滑缩放，`worldCopyJump` 跨日期；`setView(center, zoom)` 唯一改视图方法。

**关键参数**：
- `crs` 坐标参考系默认 EPSG:3857
- `center` 中心点默认 [0,0]
- `zoom` 缩放级别默认 0
- `minZoom` / `maxZoom` 限制
- `zoomControl` 显示 +/-
- `fadeAnimation` 淡入默认 true
- `zoomAnimation` 平滑缩放
- `worldCopyJump` 跨日期默认 false

**最佳实践**：初始化用 `L.map('divId', options)` id 字符串或 HTMLElement 都行；`setView(center, zoom)` 是**唯一**改视图的方法；`map.invalidateSize()` 在容器 resize 后调瓦片重排；关闭动画 `.options.fadeAnimation = false` 低端机优化；销毁 `map.remove()` 清理所有 handler + listeners。

### 模式 7 - `L.Layer` 基类 + 生命周期（图层统一接口）

**问题场景**：Tile/Marker/Vector/Popup 等等图层类型都要"加到 Map/从 Map 移除/重绘"——抽象出 Layer 基类。

**解决方案**：`L.Layer` 继承 `L.Evented`：`initialize(options)` 调 `L.setOptions`，`onAdd(map)` 加入地图钩子子类重写，`onRemove(map)` 移除钩子，`addTo(map)` 公开 API 链式，`remove()` / `removeFrom(map)` 反注册，`getPane(name)` DOM 容器，`bindPopup(content)` 弹窗，`pane: 'shadowPane'` 控制 DOM 层级。

**关键参数**：
- `onAdd(map)` 加入地图
- `onRemove(map)` 移除
- `addTo(map)` 注册链式
- `remove()` / `removeFrom(map)` 反注册
- `getPane(name)` DOM 容器
- `bindPopup(content)` 弹窗
- `pane` DOM 层级

**最佳实践**：自定义 Layer**总是** `L.Layer.extend({onAdd, onRemove})`；`onAdd` 返回 `this` 链式 `addTo(map).bindPopup()`；DOM 操作**仅**在 `onAdd` 里，`onRemove` 必须清理；多个 layer 用 `L.layerGroup([...]).addTo(map)` 批量管理；任何"统一图层接口"项目可借鉴此范式。

### 模式 8 - `L.GridLayer` 瓦片调度（可视区瓦片按需加载）

**问题场景**：地图视图变化要"加载哪些瓦片"、"哪些要卸载"。手算瓦片坐标难。

**解决方案**：`_initContainer` 建 3 个 pane（tileContainer / tilePane / gridLayer）+ `_zoom` / `_loaded` / `_tiles` 状态；`_pruneTiles` 移除不可见瓦片（`retain` 标记跳过）；`_update(center, zoom)` 调 `_pxBoundsToTileRange` + 双层循环 `_addTile` 新瓦片 + `_pruneTiles` 回收。

**关键参数**：
- `tileSize` 瓦片像素 256/512
- `opacity` 透明度
- `updateWhenZooming` 缩放时更新默认 true
- `updateInterval` 节流 ms 默认 200
- `zIndex` 层级
- `bounds` 限制范围
- `noWrap` 禁跨日期

**最佳实践**：自定义瓦片源继承 `L.GridLayer` 重写 `getTileUrl(coords)`；`tileSize: 512` retina 显示 OSM 主流；`updateWhenZooming: false` + `keepBuffer: 2` 减少缩放闪烁；瓦片源 `attribution: '© OpenStreetMap'` 法律要求；`bounds: L.latLngBounds([...])` 限制非全屏地图省流量。

### 模式 9 - `L.TileLayer.WMS` + GetCapabilities（WMS 服务适配）

**问题场景**：业务用 WMS（Web Map Service）服务端点（如 GeoServer）出图。TileLayer 需支持 `GetCapabilities` 自动发现。

**解决方案**：`TileLayerWMS` 继承 `TileLayer`：`defaultWmsParams = {service, request: 'GetMap', layers, format, transparent, version}`；`onAdd` 探测 CRS（`EPSG:4326` 或 `EPSG:3857`）+ 计算 bbox + 调父类；`getTileUrl(coords)` 用 `_crs.project` 把瓦片角点转投影坐标 + 拼接 bbox query string。

**关键参数**：
- `service: 'WMS'` 服务类型必填
- `version: '1.1.1'` WMS 版本
- `layers: 'states'` 图层名逗号分隔
- `format: 'image/png'` 瓦片格式透明要 png
- `transparent: true` 透明背景
- `crs` 投影默认地图
- `GetCapabilities` 自动发现

**最佳实践**：`L.tileLayer.wms(url, {layers: 'states'})` 工厂一行启动；`transparent: true` + `format: 'image/png'` 是基础配置；`TileLayer.WMS` 不缓存——服务端出图成本高；矢量瓦片优先：能用 `L.TileLayer.MVT`（Mapbox Vector Tile）就不用 WMS；大范围 WMS 配 `bounds` 限制减少白图。

### 模式 10 - `L.GeoJSON` 矢量数据加载（GeoJSON 数据可视化）

**问题场景**：业务有 GeoJSON 数据（边界/点/线），要在地图画。手动 `forEach feature → 画 Path` 重复。

**解决方案**：`L.GeoJSON` 继承 `L.FeatureGroup`：`addData(geojson)` 递归处理 features；`geometryToLayer` switch 6 种 geometry type：Point → Marker / LineString → Polyline / Polygon → Polygon / MultiPolygon；`pointToLayer` 自定义点 → Layer，`style` 线/面样式，`onEachFeature` 每 feature 回调 `bindPopup`，`filter` 动态过滤。

**关键参数**：
- `pointToLayer` 点 → Layer 默认 Marker
- `style` 线/面样式
- `onEachFeature` 每 feature 回调
- `filter` 过滤器 fn
- `coordsToLatLng` 坐标 → LatLng
- `attribution` 来源必填

**最佳实践**：`L.geoJSON(data, {style, onEachFeature})` 一行加载；`onEachFeature(feature, layer) { layer.bindPopup(feature.properties.name); }`；`pointToLayer: (feature, latlng) => L.circleMarker(latlng, {radius: feature.properties.size})`；大数据（>10k features）用 `Leaflet.markercluster` 插件——基础实现不虚拟化；任何"GeoJSON 渲染"项目可借鉴此范式。

---

## 第三段：进阶范式

### 模式 11 - SVG vs Canvas 双渲染器（矢量图形性能/质量权衡）

**问题场景**：地图矢量图形（折线、多边形）多时（>1000 个）SVG 慢，Canvas 难交互。Leaflet 提供 SVG + Canvas 双路径。

**解决方案**：`L.SVG` 渲染器 `_initContainer` 建 svg/g 节点挂 overlayPane，`_updatePoly` 算 attrs（stroke / stroke-width / fill / fill-opacity / pointer-events）+ setAttribute path d；`L.Canvas` 渲染器 `_redraw` 调 `clearRect` + 遍历 `_layers[id]._redraw(ctx)` 一次性重画。

**关键参数**：
- `renderer: L.svg()` 显式指定默认
- `renderer: L.canvas()` Canvas 路径
- `Pane` DOM 容器
- `interactive` 可点击
- `weight` 线宽像素
- `dashArray` 虚线

**最佳实践**：< 500 矢量用 SVG 可单独点击/拖拽；> 500 矢量用 Canvas 10-100x 性能优势；`L.canvas({padding: 0.5})` 让 layer 超出可视区不裁剪；想混合 `var poly = L.polygon(coords, {renderer: L.canvas()})`；自定义 Renderer `L.Canvas.extend({...})`。

### 模式 12 - 瓦片 retina 子域名（高 DPI 屏 + CDN 并发）

**问题场景**：retina 屏（2x）瓦片要 2x 分辨率；OSM CDN 多子域名（a/b/c.tile.openstreetmap.org）并发更快。

**解决方案**：`TileLayer.initialize` 检测 retina + 子域名展开（`'abc'` → 拆为 3 字符数组）；`getTileUrl` template 替换 `{r}`（`@2x` 或空）、`{s}`（子域名）、`{x}/{y/z}`，TMS 模式下翻转 Y 轴（`invertedY = max.y - coords.y`）。

**关键参数**：
- `subdomains: 'abc'` CDN 子域名并发 3
- `subdomains: 'abcd'` OSM 全 4
- `detectRetina: true` 自动 2x
- `zoomReverse: false` TMS Y 翻转
- `crossOrigin: true` CORS canvas 必备
- `errorTileUrl` 失败回退
- `maxNativeZoom` 原图最大

**最佳实践**：OSM 瓦片**必须**子域名并发 `{s}.tile.openstreetmap.org`；`detectRetina: true` 自动用 `@2x` 后缀（瓦片商提供时）；`crossOrigin: true` Canvas 渲染避免 CORS 污染；`errorTileUrl: '/404.png'` 瓦片 404 不留空白；自托管 `maxNativeZoom: 18` + `maxZoom: 20` 超分放大。

### 模式 13 - `L.PosAnimation` 60fps 动画（平移/缩放流畅）

**问题场景**：地图缩放/平移要 60fps，但浏览器布局/绘制成本高。Leaflet 用 `requestAnimationFrame`。

**解决方案**：`run(element, newPos, duration, easeLinearity)` 起动画；`_animate(time)` 算 `elapsed = (time - startTime) / 1000`，`< duration` 调 `_step(easeOut(t))` + rAF 继续；`_step(t)` 用 `newPos.subtract(startPos).multiplyBy(t)._add(startPos)` 插值 + `_round` 像素对齐 + `L.DomUtil.setPosition` 走 GPU transform。

**关键参数**：
- `duration` 动画时长秒
- `easeLinearity` 缓动 0.25=急停
- `requestAnimFrame` 帧驱动 polyfill
- `_round` 像素对齐
- `setPosition` transform GPU
- `cancelAnimFrame` 停止

**最佳实践**：自定义动画继承 `L.PosAnimation` + 重写 `_step`；`duration: 0` 立即跳——业务可触发"无动画模式"；动画**总是**像素对齐——亚像素看起来抖；`L.DomUtil.setPosition` 用 `transform` 比 `top/left` 走 GPU；平移过程中 `wheel` 事件取消动画 `L.DomEvent.stopPropagation`。

### 模式 14 - `L.DomEvent` + PointerEvents（跨设备交互）

**问题场景**：地图要在 PC（鼠标）+ 移动（触摸）统一交互。PointerEvents 统一。

**解决方案**：`DomEvent.addListener(obj, type, fn, context)` 自动 polyfill：`L.Browser.pointer && type.indexOf('touch') === 0` 触屏事件转 pointer；`addDoubleTapListener` 500ms 内两次 `pointerdown` 触发双击（`now - last <= delay` 守卫）。

**关键参数**：
- `addListener(obj, type, fn)` 绑定
- `removeListener` 解绑
- `stopPropagation` 防冒泡
- `preventDefault` 防默认
- `getMousePosition` 鼠标 → LatLng
- `disableClickPropagation` 容器内禁传播
- `addDoubleTapListener` 双击 500ms

**最佳实践**：自定义控件用 `L.DomEvent.disableClickPropagation(div)` 防地图响应；`L.DomEvent.stop(e)` 一行调 `stopPropagation + preventDefault`；触屏事件 Leaflet 自动转 PointerEvents——2.0 起默认开；移动双击缩放 `L.DomEvent.addDoubleTapListener(map, () => map.zoomIn())`；调试 `e.touches` 在 PointerEvents 下为空——用 `e.pointerType`。

### 模式 15 - `L.Util` 工具库（无依赖通用方法）

**问题场景**：Leaflet 体积敏感（40KB），不能引 lodash。`Util` 自实现必要工具。

**解决方案**：`extend(dest, ...src)` 浅合并多 src；`stamp(obj)` 自增 ID 挂 `_leaflet_id`；`template(str, data)` `{key}` 替换单层；`requestAnimFrame(fn, ctx)` rAF polyfill（旧 IE 退 `setTimeout(fn, 1000/60)`）；`bind(fn, ctx)` 绑定；`falseFn` 默认空函数；`lastId` stamp 计数器。

**关键参数**：
- `extend(dest, src)` 浅合并
- `stamp(obj)` 全局唯一 ID
- `template(str, data)` `{key}` 替换
- `requestAnimFrame(fn, ctx)` rAF polyfill
- `bind(fn, ctx)` bind
- `lastId` stamp 计数器
- `falseFn` 默认空函数

**最佳实践**：第三方开发用 `L.Util` 而不是引 lodash——**少 30KB**；`stamp(obj)` 给自定义对象挂唯一 ID——图层去重、缓存键；`template` 仅支持 `{key}` 单层——复杂需求用 function 替代；`requestAnimFrame` polyfill 旧浏览器（IE9/10）；任何"零依赖工具"项目可借鉴此范式。

---

## 第四段：实战范式

### 模式 16 - 800+ 第三方插件生态（框架本身不解决一切）

**问题场景**：地图库无法内置"绘图工具 / 路径规划 / 标注 / 热力图"等业务功能。插件机制让社区扩展。

**解决方案**：插件入口规范挂 `L.Plugin`：`L.MyPlugin = {install(L) { L.MyPlugin = new (L.Class.extend(...))(); }}`；`L.MyPlugin.install(L)` 安装钩子；插件分类 `L.control.*` 控件 / `L.Handler.*` 交互 / `L.Renderer.*` 渲染 / `L.GridLayer.*` 瓦片 / `L.Layer.*` 图层。

**关键参数**：
- `L.MyPlugin.install(L)` 安装钩子
- `L.control.*` 控件插件
- `L.Handler.*` 交互插件
- `L.Renderer.*` 渲染插件
- `L.GridLayer.*` 瓦片插件
- `L.Layer.*` 图层插件

**最佳实践**：写自己的插件**总是**挂在 `L` 命名空间——`L.MyCompany.MyPlugin`；复杂插件走 L.Class + L.Layer.extend 模式复用生命周期；官方列表 https://leafletjs.com/plugins.html 找现成的；体积敏感项目用 `leaflet.markercluster-src.js` 手动 import；任何"插件扩展"项目可借鉴此范式。

### 模式 17 - `L.Browser` 特性探测（跨浏览器兼容）

**问题场景**：触屏、retina、CSS3 transform 支持度差异大。`Browser` 对象集中探测。

**解决方案**：UA 探测 `webkit` / `ie` / `mobile` / `android`；PointerEvents 探测 `window.PointerEvent` / `navigator.msPointerEnabled`；`touch = (pointer || 'ontouchstart' in window) && /android|webos|iphone|ipad/i.test(ua)`；`retina = (devicePixelRatio || 1) > 1`；passive event listeners 探测（`Object.defineProperty({passive: {get() { supportsPassive = true }}}` 试绑）。

**关键参数**：
- `L.Browser.ie` IE 浏览器
- `L.Browser.webkit` Chrome / Safari
- `L.Browser.touch` 触屏设备
- `L.Browser.retina` 高 DPI
- `L.Browser.pointer` PointerEvents
- `L.Browser.mobile` 移动设备
- `L.Browser.passiveEvents` passive listener

**最佳实践**：写跨设备代码用 `if (L.Browser.touch)` 而**不**是 `ontouchstart`；retina 检测后**不**直接换瓦片——让 `TileLayer` 自动处理；2.0 起 Leaflet **放弃** IE 11 兼容——现代浏览器优先；Passive event listeners 在 `L.DomEvent` 默认开——滚动性能；调试 `console.log(L.Browser)` 一次性看所有特性。

### 模式 18 - Vitest + Playwright 视觉回归（地图渲染像素级一致）

**问题场景**：地图像素级渲染对 SVG/Canvas 数学变换敏感。改一个浮点数可能让瓦片错位。

**解决方案**：单元测试用 `vitest` + `jsdom` 环境（`environment: 'jsdom'`）；真实 Map 测试 `L.map(div).setView([40, -75], 13)`；`expect(map.getCenter().lat).toBeCloseTo(40, 5)` 浮点 1e-5 精度；视觉回归用 `playwright` 截图 `expect(screenshot).toMatchSnapshot()`；`map.remove()` 在 `afterEach` 必调防泄漏。

**关键参数**：
- `vitest` 单元测试 jest 兼容
- `jsdom` DOM 模拟
- `playwright` E2E 浏览器测试
- `L.map(div)` 真实 Map jsdom 下能跑
- `toBeCloseTo` 浮点比较
- `map.remove()` 清理

**最佳实践**：单元测试用 `jsdom`（vitest 默认）比 Playwright 快 10x；视觉回归用 Playwright 截图 `expect(screenshot).toMatchSnapshot()`；`map.remove()` 在 `afterEach` 必调——Map 监听 window resize 会泄漏；测试中心点用 `toBeCloseTo(40, 5)` 浮点 1e-5 精度；CI 跑 `vitest run --coverage` 覆盖率 > 80% 是合理的。

### 模式 19 - Leaflet vs Mapbox/MapLibre/OpenLayers（选型决策）

**问题场景**：业务选型要在 4 个地图库间选。各自定位不同。

**解决方案**：选型决策树——极简栅格瓦片 + 标注 → Leaflet (40KB)；高性能矢量瓦片（千万级 POI）→ Mapbox GL JS / MapLibre GL；GIS 专业（投影/拓扑/分析）→ OpenLayers；完全可控 + 开源 + WebGL → MapLibre GL（Mapbox 开源 fork）。

**关键参数**：

| 库 | 渲染 | 体积 | 矢量瓦片 | 选型场景 |
|----|------|------|----------|----------|
| Leaflet | SVG/Canvas | 40KB | 插件 | 简单栅格地图 |
| Mapbox GL | WebGL | 800KB | 原生 | 商业 WebGL 地图 |
| MapLibre GL | WebGL | 500KB | 原生 | 开源 WebGL 替代 |
| OpenLayers | Canvas/WebGL | 200KB | 原生 | GIS 专业 |

**最佳实践**：< 1000 个矢量对象用 Leaflet 简单稳；> 10000 个 POI 用 MapLibre GL WebGL 加速；GIS 业务用 OpenLayers 投影支持最全；Leaflet + `Leaflet.VectorGrid` 插件折中——MVT 矢量瓦片；中国业务优先用 `Mapbox 中国` 或自托管 MapLibre——海外服务不达。

### 模式 20 - CHANGELOG + 4 阶段发布（14 年兼容性）

**问题场景**：Leaflet 跨 14 年仍被生产用，1.x → 2.0 是 ESM + PointerEvents 大改。`RELEASE.md` 规范流程。

**解决方案**：4 阶段发布——alpha (内部 features merged 频繁更新 1-2 月) → beta (公开 API 冻结 1-2 月) → rc (发布候选仅修 bug 1-4 周) → stable (长期支持 12-18 月修复 + 安全)；2.0 破坏性变更——100% ESM + PointerEvents 替代 touchstart/touchmove + L.Icon 改 L.Icon.Default 工厂 + L.GridLayer 重写瓦片管理 + 弃用 IE 11。

**关键参数**：
- alpha 内部 1-2 月
- beta 公开 API 冻结 1-2 月
- rc 发布候选 1-4 周
- stable 长期支持
- LTS 12-18 月修复+安全
- CHANGELOG.md 2595 行

**最佳实践**：升级 Leaflet 前看 `CHANGELOG.md`——2.0 破坏性变更多；锁定版本 `leaflet@1.9.4` 比 `^1.9` 稳——npm 锁文件；大版本升级：alpha 试用 → beta 业务测试 → rc 灰度 → stable 切；插件兼容性查 [leaflet plugins](https://leafletjs.com/plugins.html) 版本支持；2.0 起必须用 ESM `<script type="module">`——`<script>` 不能直接用。

---

## 附：仓库元信息

| 维度 | 数据 |
| --- | --- |
| 总文件数 | 1005（仓库根 7 个 + src/ 50+ .js + spec/ 40+ 测试 + debug/ 80+ HTML + docs/ 700+ markdown） |
| 主语言 | JavaScript ES2022（100% ESM，`type: "module"`） |
| 涉及语言 | JavaScript + CSS + HTML + Ruby (Jekyll docs) + YAML (CI) |
| 核心 SLOC | ~50000 行（src/ 50+ .js 文件） |
| Star | 41k+ |
| License | BSD-2-Clause |
| 体积 | 40KB gzipped JS + 3.2KB gzipped CSS |
| CI | GitHub Actions：Vitest + Playwright |
| 创始人 | Volodymyr Agafonkin（@mourner） |
| 维护者 | ~10 人核心 + 200+ 贡献者 |
| 协议 | BSD-2-Clause 协议完全免费，靠捐款 + 插件生态 + 培训商业服务 |
| 兼容性 | 现代浏览器（2.0 起放弃 IE 11） |
| 性能 | 60fps 平移/缩放，retina 子域名瓦片并发，rAF 动画 |

## 一句话总结

Leaflet 用 `L.Class` + `L.Evented` 200 行造出 14 年长盛不衰的事实标准；`GridLayer` 瓦片调度 + `SVG/Canvas` 双渲染器 + `PosAnimation` 60fps 动画是底层三件套；选型 1000 矢量内用 Leaflet，万级用 MapLibre，GIS 用 OpenLayers。

## 参考

- Leaflet 官网：https://leafletjs.com/
- 仓库：https://github.com/Leaflet/Leaflet
- 文档：https://leafletjs.com/reference.html
- 当前版本：2.0.0-alpha.1（2025-08-16）
- 创始人：Volodymyr Agafonkin（@mourner）
- License：BSD-2-Clause
