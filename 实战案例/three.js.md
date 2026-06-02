# three.js - 跨浏览器 WebGL/WebGPU 3D 渲染引擎的场景图与可插拔渲染器典范

**GitHub**: mrdoob/three.js
**Star**: ~102k
**语言**: JavaScript（含 GLSL/WGSL shader）
**主题**: 3D 渲染、场景图、WebGL/WebGPU、可视化
**适用场景**: Web 3D 应用、数据可视化、AR/VR、Web 游戏

## 第一段：基础范式

### 模式 1：场景图（Scene Graph）树形数据结构

**问题场景**：3D 应用有大量对象（模型/灯光/相机），它们之间有父子变换关系（子节点继承父节点的矩阵）。如果用扁平列表管理，矩阵更新与射线检测都要手动遍历关联。

**解决方案**：`Scene` 是根节点，`Object3D` 是基类，提供 `add()`/`remove()`/`parent`/`children` 树形结构。每个节点保存 `matrix`（局部）、`matrixWorld`（世界），父节点更新时自动级联子节点。`Mesh`/`Light`/`Camera`/`Group` 都继承自 `Object3D`。

**关键参数**：
- `Object3D` 基类定义 `.add()`/`.remove()`/`.traverse()`
- `matrix` 局部矩阵（相对父节点）
- `matrixWorld` 世界矩阵（相对场景根）
- `updateMatrixWorld(force)` 强制更新并级联
- `children` 数组维护父子关系

**最佳实践**：用 `Group` 聚合多个对象便于整体平移/旋转；调用 `updateMatrixWorld()` 后再做 raycaster；用 `Object3D.traverse()` 递归查找特定对象。

### 模式 2：BufferGeometry 与顶点缓冲区契约

**问题场景**：3D 模型的顶点数以万计，JS 对象方式存 `{x, y, z}` 内存与 GC 压力巨大，GPU 上传也低效。

**解决方案**：`BufferGeometry` 用 `Float32Array`/`Uint16Array` 等类型化数组存 `position`/`normal`/`uv`/`index` 等 attribute，调用 `setAttribute()` 注册到 GPU 顶点缓冲。`position.array` 直接传给 WebGL `bufferData`，无 JS 对象包装。

**关键参数**：
- `position` 顶点位置（Float32Array）
- `normal` 法向量
- `uv` 纹理坐标
- `index` 索引（Uint16Array/Uint32Array）
- `setAttribute(name, BufferAttribute)` 注册

**最佳实践**：顶点数据用 `Float32Array` 不要用普通数组；索引用 `Uint16Array` 减少 50% 内存；用 `BufferGeometryUtils.mergeGeometries()` 合并多个几何体；避免在动画循环中创建新 `BufferGeometry`。

### 模式 3：渲染器（WebGL / WebGPU / SVG / CSS3D）可插拔架构

**问题场景**：不同硬件/平台支持的图形 API 不同（WebGL 1/2、新的 WebGPU、SSR 友好的 SVG/CSS3D），需要同一份场景代码在不同 API 上跑。

**解决方案**：`WebGLRenderer`/`WebGPURenderer`/`SVGRenderer`/`CSS3DRenderer` 都实现统一 `Renderer` 接口，接收 `Scene` + `Camera`，调用 `.render(scene, camera)` 输出到 canvas 或 DOM。`extras/` 目录提供辅助能力。

**关键参数**：
- `new WebGLRenderer({ antialias: true, alpha: true })`
- `.setSize(width, height)` 设置渲染区域
- `.setPixelRatio(window.devicePixelRatio)` HiDPI
- `.render(scene, camera)` 一次渲染
- `.domElement` 返回 canvas DOM

**最佳实践**：默认用 WebGL2（兼容性最好），新项目实验 WebGPU；高 DPR 屏幕调 `setPixelRatio` 但限制上限 2 避免性能崩；用 `WebGLRenderer.debug.onShaderError` 调试 shader。

### 模式 4：材质-光照-着色器（Material/Light/Shader）解耦

**问题场景**：3D 外观有大量变种（漫反射、镜面、菲涅尔、PBR、卡通），如果每种变体都写独立 shader，代码会爆炸。

**解决方案**：`Material` 基类定义通用接口（颜色、贴图、uniform），派生 `MeshBasicMaterial`/`MeshStandardMaterial`/`MeshPhysicalMaterial`/`ShaderMaterial` 等几十种材质。`Light`（`AmbientLight`/`DirectionalLight`/`PointLight`）独立管理光源，shader 编译时根据 light 类型注入对应代码。

**关键参数**：
- `Material.color`/`Material.map` 基础属性
- `MeshStandardMaterial` PBR 渲染
- `MeshPhysicalMaterial` 透明/清漆/透射
- `ShaderMaterial` 自定义 GLSL
- `Light.intensity`/`Light.color`

**最佳实践**：默认用 `MeshStandardMaterial`（PBR 行业标准）；需要透明/折射用 `MeshPhysicalMaterial`；自定义 shader 优先用 `onBeforeCompile` 钩子扩展 `MeshStandardMaterial` 而非从零写。

### 模式 5：相机与投影（Perspective/Orthographic）

**问题场景**：3D 场景需要透视投影（近大远小、模拟人眼）做游戏/可视化，也需要正交投影（无透视）做 2.5D/UI 渲染。

**解决方案**：`Camera` 基类定义 `matrixWorldInverse`/`projectionMatrix` 两个核心矩阵。`PerspectiveCamera(fov, aspect, near, far)` 实现透视，`OrthographicCamera(left, right, top, bottom, near, far)` 实现正交。`updateProjectionMatrix()` 重建投影矩阵。

**关键参数**：
- `fov` 视野角度（度）
- `aspect` 宽高比
- `near`/`far` 裁剪面
- `position`/`lookAt()` 设置位置与朝向
- `updateProjectionMatrix()` 重建投影

**最佳实践**：fov 45-60 度接近人眼；`near` 不要太小（0.1 即可）避免深度精度问题；窗口 resize 时同步 `camera.aspect` + `updateProjectionMatrix()`；用 `OrbitControls` 简化交互。

## 第二段：扩展范式

### 模式 6：数学库（Vector3/Matrix4/Quaternion）独立可拆

**问题场景**：3D 数学（向量、矩阵、四元数）运算密集，JS 内置 `Math` 库是标量版，循环写矩阵乘法性能差且易错。

**解决方案**：`src/math/` 目录提供 `Vector2`/`Vector3`/`Vector4`/`Matrix3`/`Matrix4`/`Quaternion`/`Euler`/`Spherical` 等几十个数学类，每个类有 `.add()`/`.sub()`/`.normalize()`/`.applyMatrix4()` 等链式 API。所有类方法支持 `out` 参数避免 GC。

**关键参数**：
- 链式 API：`vec.add(v2).multiplyScalar(2).normalize()`
- `out` 参数：`Matrix4.multiply(m1, m2, target)`
- `Matrix4.compose(position, quaternion, scale)` 组合变换
- `Quaternion.setFromAxisAngle()` 旋转向量
- `Matrix4.lookAt()` 视图矩阵

**最佳实践**：性能敏感循环用 `out` 参数避免创建新对象；`quaternion` 旋转避免万向锁；用 `Vector3.lerpVectors()` 做插值；矩阵组合用 `Matrix4.compose()` 一次完成。

### 模式 7：纹理与图像加载管线

**问题场景**：3D 应用需要加载贴图（漫反射/法线/粗糙度/环境贴图），同步加载会卡 UI，重复加载浪费内存。

**解决方案**：`TextureLoader`/`CubeTextureLoader`/`RGBELoader`/`EXRLoader`/`KTX2Loader` 等多种 loader，异步 `load(url, onLoad)` 触发回调。`Texture` 类提供 `wrapS`/`wrapT`/`minFilter`/`magFilter`/`generateMipmaps` 等采样参数。

**关键参数**：
- `texture.wrapS = RepeatWrapping` 平铺
- `texture.minFilter = LinearMipmapLinearFilter` 三线性
- `texture.colorSpace = SRGBColorSpace` 色彩空间
- `texture.anisotropy = 16` 各向异性
- `KTX2`/`Basis` GPU 压缩格式

**最佳实践**：用 `KTX2Loader` + GPU 压缩格式省 80% 显存；色彩空间标注 SRGBColorSpace；`generateMipmaps = true` 远距离抗锯齿；`flipY = false` 配合 KTX2 压缩纹理。

### 模式 8：OrbitControls/TransformControls 等控制器

**问题场景**：用户交互需要鼠标拖拽旋转/缩放/平移相机，或拖拽移动/旋转/缩放 3D 对象——自己写事件监听+矩阵更新要几百行。

**解决方案**：`examples/jsm/controls/` 提供 `OrbitControls`/`TrackballControls`/`FlyControls`/`FirstPersonControls`/`TransformControls` 等十几种控制器，监听 DOM 事件，计算增量，更新相机/对象 transform。`TransformControls` 还能显示 3D 操纵杆。

**关键参数**：
- `OrbitControls(camera, domElement)` 绑定
- `.enableDamping = true` 阻尼
- `.dampingFactor = 0.05`
- `.minDistance`/`.maxDistance` 缩放范围
- `TransformControls.showX/Y/Z` 启用轴

**最佳实践**：OrbitControls 加 `enableDamping` 让旋转更顺滑；`minPolarAngle = 0` + `maxPolarAngle = Math.PI` 允许上下翻转；TransformControls 拖拽时禁用 OrbitControls 避免冲突。

### 模式 9：GLTFLoader 与模型加载

**问题场景**：3D 模型由 Maya/Blender 等 DCC 工具导出，格式有 OBJ/FBX/GLTF/GLB 等，glTF 是 Web 端事实标准（含几何/材质/动画/蒙皮）。

**解决方案**：`GLTFLoader` 解析 glTF/GLB 文件，加载几何/材质/动画/蒙皮，构造 `Scene` 子树。配合 `DRACOLoader`（几何压缩）、`KTX2Loader`（纹理压缩）、`MeshoptDecoder`（网格优化）实现生产级加载管线。

**关键参数**：
- `gltfLoader.load(url, onLoad)` 异步加载
- `DRACOLoader.setDecoderPath()` 设置解码器
- `MeshoptDecoder` 网格压缩
- `gltf.scene`/`gltf.animations`/`gltf.cameras`
- `AnimationMixer` 播放动画

**最佳实践**：生产环境必加 DRACO + Meshopt + KTX2 三件套，模型体积可缩 70-90%；用 `AnimationMixer.clipAction(animation).play()` 播放动画；用 `RoomEnvironment` 提供 IBL 环境贴图给 PBR 材质。

### 模式 10：射线检测（Raycaster）拾取与碰撞

**问题场景**：用户点击 3D 场景中的某个对象，需要知道点中了什么——DOM 事件只知道屏幕坐标，要反推 3D 命中。

**解决方案**：`Raycaster` 从相机出发，沿鼠标 NDC 坐标发射射线，与场景中所有 `Object3D` 的几何做相交测试，返回交点（距离/点/法线/对象）。`recursive = true` 递归测试子节点，`layers` 过滤特定层。

**关键参数**：
- `raycaster.setFromCamera(mouse, camera)` 设置射线
- `.intersectObjects(targets, recursive)` 测试对象
- `.intersectObject(obj)` 单个
- 返回 `Intersection` 数组：`distance`/`point`/`face`/`object`
- `raycaster.layers` 层级过滤

**最佳实践**：每帧射线检测前调 `raycaster.setFromCamera()`；用 `layers` 过滤 UI 层/编辑器层；`recursive = true` 遍历子节点；性能敏感场景用 `BVH` 八叉树加速。

## 第三段：进阶范式

### 模式 11：Nodes 系统与 TSL（Three.js Shading Language）

**问题场景**：自定义 shader 需要写 GLSL/WGSL，但跨平台（WebGL2/WebGPU）维护两套 shader 痛苦，且 shader 难以模块化、组合。

**解决方案**：`src/nodes/` 引入节点式材质系统 TSL，用 JS 描述材质图（"颜色 × 基础色 + 高光 × 反射"），编译时自动生成 WebGL GLSL 与 WebGPU WGSL。`Trixel` 节点编辑器允许可视化编辑。

**关键参数**：
- `MeshBasicNodeMaterial` 节点版基础材质
- `colorNode`/`positionNode`/`normalNode` 节点插槽
- `.mul()`/`.add()`/`.mix()` 节点运算
- `tslFn` 自定义函数节点
- WebGL/WebGPU 自动后端

**最佳实践**：复杂材质（程序化纹理、噪声、菲涅尔）用 TSL 写可读性高；自定义节点用 `tslFn` 封装；TSL 与 Material 双轨并行（Material 适合简单场景，TSL 适合复杂）。

### 模式 12：WebGPU 后端与 compute shader

**问题场景**：WebGL 在复杂场景下（数百万顶点、海量光源）性能受限；新一代 WebGPU 提供 compute shader、低开销驱动、显式管线。

**解决方案**：`WebGPURenderer` 与 WebGLRenderer API 兼容，底层用 WebGPU 实现。`WebGPUComputeRenderer` 跑 compute shader 做 GPU 粒子、布料模拟、GPU 剔除。NodeMaterial 同一份代码可同时编译到 GLSL/WGSL。

**关键参数**：
- `WebGPURenderer({ forceWebGL: false })` 启用
- `WebGPUComputeRenderer(computeNode)` compute
- 适配器请求：`navigator.gpu.requestAdapter()`
- 设备：`adapter.requestDevice()`
- 自动 fallback：WebGPU 不可用时退回 WebGL2

**最佳实践**：新项目优先 WebGPURenderer；compute 用例（粒子/布料/物理）性能比 WebGL 高 5-10 倍；用 `navigator.gpu` 特性检测并优雅降级；TSL 自动跨后端。

### 模式 13：后处理管线（Post-Processing）

**问题场景**：3D 渲染后还需要 Bloom 泛光、景深、SSAO、HDR 色调映射、FXAA 抗锯齿等效果——多个效果串联需要管线管理。

**解决方案**：`EffectComposer` 是后处理管线，串接 `RenderPass`/`UnrealBloomPass`/`BokehPass`/`SSAOPass`/`OutlinePass`/`OutputPass` 等多个 pass。每个 pass 渲染到 render target，下一个 pass 消费其纹理。

**关键参数**：
- `new EffectComposer(renderer)`
- `composer.addPass(new RenderPass(scene, camera))`
- `composer.addPass(new UnrealBloomPass(...))`
- `composer.setSize(w, h)` 调整
- `composer.render()` 一帧

**最佳实践**：管线顺序：RenderPass → 后处理 Pass → OutputPass；用 `MaskPass` 限定 Bloom 只影响亮区；用 `OutputPass` 做最后的 tone mapping 与色彩空间转换；性能敏感场景关闭部分 pass。

### 模式 14：动画系统（AnimationMixer/Clip/Action）

**问题场景**：模型有骨骼动画（关键帧 + 骨骼变换），需要在指定时间点播放、混合（idle + 跑动）、循环。

**解决方案**：`AnimationMixer` 持有模型，`clipAction(clip)` 创建 `AnimationAction` 控制播放/暂停/速度/权重。`AnimationClip` 包含多个 `KeyframeTrack`（VectorKeyframeTrack/QuaternionKeyframeTrack 等），可在 clip 间用 `crossFadeTo` 平滑过渡。

**关键参数**：
- `mixer = new AnimationMixer(model)`
- `action = mixer.clipAction(gltf.animations[0])`
- `action.play()`/`.stop()`/`.reset()`
- `action.crossFadeTo(otherAction, duration)` 过渡
- `mixer.update(deltaTime)` 每帧推进

**最佳实践**：所有动画用 `mixer.update(dt)` 推进，不要用 `setTimeout`/setInterval；用 `crossFadeTo` 切换 idle↔run；`action.weight` 控制多动画混合权重；`action.loop = LoopRepeat` 设置循环。

### 模式 15：CSS2DRenderer / CSS3DRenderer 与 DOM 集成

**问题场景**：3D 场景中需要叠加 HTML 元素（标签、Tooltip、UI 控件），直接用绝对定位 div 跟随 3D 位置复杂且不同步。

**解决方案**：`CSS2DRenderer` 把 2D HTML 元素投影到 3D 空间（始终面向相机），`CSS3DRenderer` 投影 3D 变换的 HTML 元素。`CSS2DObject` 包装 DOM 元素，作为 `Object3D` 子节点加入场景，自动随父节点变换。

**关键参数**：
- `labelRenderer = new CSS2DRenderer()`
- `labelRenderer.domElement` 叠加层
- `new CSS2DObject(div)` 包装
- `labelRenderer.render(scene, camera)` 渲染
- `pointerEvents: none` 不阻挡交互

**最佳实践**：用 CSS2DRenderer 做 3D 场景中的标签（城市名/数值）；HTML 元素 `pointer-events: none` 不阻挡 raycaster；用 TransformControls 拖拽时配合 CSS2D 显示坐标；CSS3D 性能差，优先 CSS2D。

## 第四段：实战范式

### 模式 16：性能优化（Instancing/Frustum Culling/矩阵更新）

**问题场景**：渲染 10000 棵树（每棵 1000 三角形）= 1000 万 draw call，FPS 跌到 5。性能瓶颈在 draw call 而非顶点数。

**解决方案**：`InstancedMesh` 用一次 draw call 渲染 N 个相同几何实例，每个实例有独立 `instanceMatrix`（位置/旋转/缩放）。`Frustum` 做视锥剔除——`mesh.frustumCulled = true` 默认开启，相机外的对象不送 GPU。`Object3D.matrixAutoUpdate = false` 手动控制矩阵更新时机。

**关键参数**：
- `new InstancedMesh(geom, mat, count)` 创建
- `mesh.setMatrixAt(i, matrix)` 设置实例
- `mesh.count` 实际渲染数量
- `mesh.frustumCulled = true` 启用剔除
- `matrixAutoUpdate = false` 手动控制

**最佳实践**：相同几何 100+ 个对象用 `InstancedMesh`（FPS 提升 10x+）；大量小对象用 `BatchedMesh`（不同几何）；`frustumCulled` 默认开但要测试边界；动画循环前更新 `matrixWorld`。

### 模式 17：响应式与设备像素比（DPR）

**问题场景**：HiDPI 屏幕（Retina/4K）上 3D 模糊或性能差——DPR=2 像素数 ×4，FPS 跌一半。

**解决方案**：`renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` 限制 DPR 上限为 2，平衡清晰度与性能。`window.addEventListener('resize', onResize)` 监听窗口变化，更新 `renderer.setSize` + `camera.aspect` + `composer.setSize`。

**关键参数**：
- `renderer.setPixelRatio(dpr)` 设置 DPR
- `renderer.setSize(width, height)` 渲染区域
- `composer.setSize(width, height)` 后处理管线
- `camera.aspect = w/h` 相机比例
- `camera.updateProjectionMatrix()` 重建

**最佳实践**：DPR 上限 2（再高肉眼难分辨但性能崩）；用 `ResizeObserver` 替代 `resize` 事件（更准确）；移动端用低 DPR 进一步省电；高 DPR 截图导出用 `toDataURL`。

### 模式 18：着色器调试（onShaderError / Spector.js）

**问题场景**：自定义 shader 编译失败或运行时输出异常，浏览器控制台只能看到 GLSL 错误行号——找不到对应 JS 代码。

**解决方案**：`renderer.debug.onShaderError = (gl, program, vs, fs) => { ... }` 捕获 shader 错误，可 dump 完整 shader 源码到 console。`Spector.js` 浏览器扩展能录制一帧的所有 draw call 与 shader 状态。`renderer.getContext().getExtension('WEBGL_debug_renderer_info')` 获取 GPU 信息。

**关键参数**：
- `renderer.debug.checkShaderErrors = true` 默认开
- `onShaderError` 回调
- `Spector.js` 浏览器扩展
- `WEBGL_debug_renderer_info` 扩展
- `#define USE_FOG` 等预处理宏

**最佳实践**：开发环境开 `onShaderError` 调试 shader；用 Spector.js 录一帧分析 draw call；用 `#define USE_X` 宏控制 shader 变体；用 `ShaderMaterial.extensions.derivatives = true` 启用 dFdx/dFdy。

### 模式 19：Tree-shaking 与按需 import

**问题场景**：three.js 全量 import（`import * as THREE from 'three'`）会打包进 600+ KB 的代码——绝大多数项目只用 10% 不到的 API。

**解决方案**：现代 three.js（r150+）支持按需 import：`import { Scene, Mesh, BoxGeometry, MeshStandardMaterial } from 'three'`。配合 Vite/Rollup 的 tree-shaking，未使用的类自动剔除。`addons/` 目录（`three/addons/...`）也是按需加载。

**关键参数**：
- `import { Scene } from 'three'` 按需
- `import 'three/addons/controls/OrbitControls.js'` 插件
- Vite/Rollup 自动 tree-shake
- `sideEffects: false` package.json
- Bundle 分析 `rollup-plugin-visualizer`

**最佳实践**：禁止 `import * as THREE from 'three'`；按需 import 后配合 tree-shaking 体积可压到 100-200 KB；用 `vite-plugin-glsl` 导入 shader 文件；用 bundle analyzer 监控产物。

### 模式 20：3D 应用分层架构（场景/逻辑/数据/UI）

**问题场景**：3D 项目从 demo 演进到生产，场景对象、业务逻辑、数据获取、UI 状态混在一起，代码难维护。

**解决方案**：分层架构：
- 数据层：API/JSON/状态管理（Zustand/Pinia）持有业务数据
- 场景层：`Scene` 树 + 控制器，把数据映射到 3D 对象
- 逻辑层：动画循环、事件处理、状态机
- UI 层：HTML/CSS 控件（leva/dat.gui），CSS2DObject 标签
- 渲染层：renderer + composer + 后处理

**关键参数**：
- 状态管理：Zustand/Pinia/Redux
- 控件：leva/dat.gui 实时调参
- 事件：EventBus/EventEmitter
- 循环：`requestAnimationFrame`
- 数据：API/JSON/IndexedDB

**最佳实践**：业务数据走状态管理（Zustand），不直接放在 Object3D.userData；用 leva 实时调参（光照/材质/后处理）；UI 控件与 3D 渲染解耦（UI 用 React/Vue，3D 用 imperative API）；用 `useFrame`（r3f）/自写循环同步。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\three.js\` |
| 主语言 | JavaScript |
| License | MIT |
| 解析时间 | 2026-06-02 |
| 核心模块 | `core/Object3D`、`math/`、`geometries/`、`materials/`、`renderers/`、`nodes/` |
| 关键基础设施 | WebGL 1/2、WebGPU、TSL、GLSL/WGSL |
