# three.js

> Three.js 是 Web 端 3D 编程的事实标准：场景图 + 几何/材质解耦 + 多渲染器抽象 + Nodes 可编程材质。本篇把 10 年沉淀的 3D 库设计哲学拆成 20 个 Pattern，涵盖 4 大主题：核心机制、架构设计、性能优化、工程实践。

## 核心机制

### 模式 1：`Object3D extends EventDispatcher` 让树状事件自动冒泡

**问题场景**：场景图是树状结构，节点增删要通知所有子节点的监听器（物理引擎同步、UI 反射、状态保存）。如果每个工具组件自己监听父子关系，会重复实现 + 难维护。

**解决方案**：

```js
// src/core/Object3D.js
class Object3D extends EventDispatcher {
    add(object) {
        if (object.parent !== null) {
            object.parent.remove(object);
        }
        object.parent = this;
        this.children.push(object);
        object.dispatchEvent({ type: 'added' });
        // 冒泡到所有子节点
        for (let i = 0; i < object.children.length; i++) {
            object.children[i].dispatchEvent({ type: 'added' });
        }
    }
}
```

**关键参数**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `add` | 挂子节点 + 触发 added | 同步 + 事件 |
| `remove` | 摘子节点 + 触发 removed | 同步 + 事件 |
| 事件冒泡 | 子孙节点都收到 | 物理引擎/UI 都受益 |

**最佳实践**：

- ✅ 任何"树状结构 + 父子事件"场景都让基类继承 EventDispatcher
- ✅ 事件冒泡到所有子节点——单一 API 满足所有订阅者
- ✅ 把"加入场景"事件设为首要事件——比"对象创建"事件更有用
- ✅ 给事件加 `target` 字段——监听器知道是哪个父节点触发的
- ❌ 避免在事件处理器里再次 add/remove——可能死循环

### 模式 2：四元数内部存储 + Euler 仅作视图

**问题场景**：旋转有 4 种表示（Matrix3 / Euler / Quaternion / AxisAngle），需要互转。直接存 Euler 会有 gimbal lock；存 Matrix 不可读；存 AxisAngle 难插值。

**解决方案**：

```js
// src/core/Object3D.js
class Object3D {
    constructor() {
        this.quaternion = new Quaternion();  // 内部真实表示
        this._rotation = new Euler();
        this._rotation._onChange(() => {
            this.quaternion.setFromEuler(this._rotation);
        });
    }
    get rotation() { return this._rotation; }
    set rotation(value) {
        this._rotation = value;
        this.quaternion.setFromEuler(value);
    }
}
```

**关键参数**：

| 表示 | 优点 | 缺点 | 用途 |
|------|------|------|------|
| Quaternion | 避免 gimbal lock、平滑插值 | 难读 | 内部存储 |
| Euler | 可读、直观 | gimbal lock | 视图层 |
| Matrix3 | GPU 友好 | 不直观 | 着色器 uniform |

**最佳实践**：

- ✅ 内部用四元数，Euler 仅作 view——避免 gimbal lock + 平滑插值
- ✅ 用 `Object.defineProperty` 或 setter 让 Euler 修改自动同步到四元数
- ✅ Quaternion 提供 `slerp` 而非 `lerp`——球面插值保持单位长度
- ✅ 把 `_onChange` 监听做成单向——避免 Euler → Quaternion → Euler 循环
- ❌ 避免直接让用户访问四元数底层——会破坏 Euler 同步

### 模式 3：`slerp` 球面插值做动画关键帧过渡

**问题场景**：`AnimationMixer` 在两个关键帧之间过渡时，旋转如果用线性插值会归一化失败，导致动画中途突然缩小/放大。

**解决方案**：

```js
// src/math/Quaternion.js
class Quaternion {
    slerp(qb, t) {
        const cosHalfTheta = this.w * qb.w + this.x * qb.x + ...;
        if (cosHalfTheta < 0) {
            qb = qb.clone().negate();
            cosHalfTheta = -cosHalfTheta;
        }
        if (cosHalfTheta >= 1.0) return this;
        const halfTheta = Math.acos(cosHalfTheta);
        const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
        if (Math.abs(sinHalfTheta) < 0.001) {
            return this.clone().lerp(qb, t);
        }
        const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
        const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
        return this.clone().multiplyScalar(ratioA).add(qb.clone().multiplyScalar(ratioB));
    }
}
```

**关键参数**：

| 函数 | 输入 | 输出 |
|------|------|------|
| `slerp(qb, t)` | 目标四元数 + 进度 0~1 | 球面插值结果 |
| `lerp(qb, t)` | 目标四元数 + 进度 | 线性（仅小角度差） |
| `squad` | 三次样条 | 多个关键帧平滑 |

**最佳实践**：

- ✅ 旋转动画永远用 `slerp`——`lerp` 会破坏单位长度
- ✅ 检测点积 < 0 时取反——保证走最短路径
- ✅ 在 `cosHalfTheta` 接近 1 时退化为 `lerp`——避免除零
- ✅ 用 `squad` 处理多关键帧——比 `slerp` 串接更平滑
- ❌ 避免对四元数直接做 `+`/`*`——破坏单位性质

### 模式 4：Mesh = `BufferGeometry` + `Material` 数据与渲染解耦

**问题场景**：同一份几何（顶点数据）需要用不同着色器（基础、PBR、卡通）渲染。如果几何和材质绑定在一起，无法复用。

**解决方案**：

```js
// src/objects/Mesh.js
class Mesh extends Object3D {
    constructor(geometry, material) {
        super();
        this.geometry = geometry;  // 数据
        this.material = material;  // 渲染参数
    }
}

const sphere = new SphereGeometry(1, 32, 32);
const basicMat = new MeshBasicMaterial({ color: 0xff0000 });
const pbrMat = new MeshStandardMaterial({ roughness: 0.5, metalness: 0.8 });
const m1 = new Mesh(sphere, basicMat);
const m2 = new Mesh(sphere.clone(), pbrMat);  // 同一几何不同材质
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `geometry` | `BufferGeometry` 顶点缓冲 |
| `material` | `Material` 子类（Basic/Standard/Physical） |
| 多材质 | `Mesh` 支持 `material` 数组 + `groups` 分段 |

**最佳实践**：

- ✅ 几何是数据、材质是渲染参数——两者解耦
- ✅ 同一几何对象不要共享给多个 Mesh——修改会传染
- ✅ 用 `.clone()` 复制几何——避免意外修改
- ✅ 复杂模型用 `groups[]` 支持多材质——例如汽车的车身/玻璃/轮胎
- ❌ 避免把材质实例塞进几何——破坏解耦

### 模式 5：`/*@__PURE__*/` 注释配合 Rollup 死代码消除

**问题场景**：临时对象池（`_v1`、`_q1`、`_m1`）如果方法没被调用，本应不进 bundle，但 Rollup 默认不知道"这个变量是否纯"。

**解决方案**：

```js
// src/core/Object3D.js
const _v1 = /*@__PURE__*/ new Vector3();
const _q1 = /*@__PURE__*/ new Quaternion();
const _m1 = /*@__PURE__*/ new Matrix4();

class Object3D {
    add(object) {
        if (object.parent !== null) {
            _v1.copy(object.position).sub(this.position);  // 临时变量
            object.position.add(_v1);
        }
    }
}
```

**关键参数**：

| 标记 | 作用 |
|------|------|
| `/*@__PURE__*/` | 告诉 Rollup "此调用无副作用" |
| 无标记 | Rollup 默认保守，保留变量 |

**最佳实践**：

- ✅ 临时对象池全部加 `/*@__PURE__*/`——按需打包，节省体积
- ✅ 工具函数（Vector3/Quaternion 静态方法）也加标记
- ✅ 用 tree-shaking 友好的写法——`export function f()` 而非挂全局
- ✅ 写 benchmark 验证——Three.js bundle 体积节省 30%+
- ❌ 避免忘记标记——保留无用变量会膨胀 bundle

## 架构设计

### 模式 6：场景图（Scene Graph）树状结构统一变换与剔除

**问题场景**：3D 场景中节点有层级关系（车的轮子是车的子节点）。变换（移动、旋转、缩放）需要按层级传播；剔除（视锥裁剪）要按子树遍历；拾取（点击）要自顶向下测试。

**解决方案**：

```js
// src/core/Object3D.js
class Object3D {
    updateMatrixWorld(force) {
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldNeedsUpdate || force) {
            if (this.parent === null) {
                this.matrixWorld.copy(this.matrix);
            } else {
                this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
            }
            this.matrixWorldNeedsUpdate = false;
            force = true;
        }
        const children = this.children;
        for (let i = 0, l = children.length; i < l; i++) {
            children[i].updateMatrixWorld(force);
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `matrix` | 局部变换矩阵 |
| `matrixWorld` | 全局变换矩阵 |
| `matrixAutoUpdate` | 默认 true，每帧自动更新 |
| 传播 | 父变换 × 自身变换 = 子世界变换 |

**最佳实践**：

- ✅ 父子变换用矩阵乘法链——数学正确
- ✅ 局部矩阵 + 世界矩阵分离——可单独修改局部而不影响全局
- ✅ 静态场景可关闭 `matrixAutoUpdate`——减少计算
- ✅ 用 `Object3D.traverse(callback)` 一次性访问整棵子树
- ❌ 避免每帧都 `updateMatrixWorld(true)`——除非矩阵真的需要更新

### 模式 7：多渲染器抽象（WebGL / WebGPU / SVG / CSS3D）

**问题场景**：Web 端 3D 渲染有 4 种后端：WebGL（主流）、WebGPU（未来）、SVG（数据可视化）、CSS3D（DOM 集成）。每个 API 差异巨大，但场景图应该通用。

**解决方案**：

```js
// src/renderers/Renderer.js (基类)
class Renderer {
    render(scene, camera) { throw new Error('abstract'); }
    setSize(w, h) { throw new Error('abstract'); }
}

// src/renderers/WebGLRenderer.js
class WebGLRenderer extends Renderer {
    render(scene, camera) {
        this.info.reset();
        this._renderLists.dispose();
        this._currentRenderList = this._renderLists.get(scene, this.renderListStack);
        this._render(scene, camera);
    }
}

// 用户切换后端
const renderer = navigator.gpu
    ? new WebGPURenderer()
    : new WebGLRenderer();
renderer.render(scene, camera);
```

**关键参数**：

| 渲染器 | 用途 |
|--------|------|
| WebGLRenderer | 主流 |
| WebGPURenderer | 新一代 |
| SVGRenderer | 数据可视化 |
| CSS3DRenderer | DOM 集成 |

**最佳实践**：

- ✅ 抽象基类定义接口——不同后端实现同一接口
- ✅ 场景图与渲染器解耦——同一份场景可在 4 种后端跑
- ✅ 检测 `navigator.gpu` 决定用 WebGL 还是 WebGPU
- ✅ SVG/CSS3D 用于特殊场景（PPT、数据图）——不是 3D 主力
- ❌ 避免在场景图对象中持有 GPU 资源——渲染器层管理

### 模式 8：`BufferGeometry` + `BufferAttribute` 直接对接顶点缓冲

**问题场景**：WebGL 调 `gl.drawElements()` 吃的是裸缓冲区（`Float32Array`）。如果中间再套一层"顶点对象"，会有额外的 GC 压力与拷贝。

**解决方案**：

```js
// src/core/BufferGeometry.js
class BufferGeometry {
    constructor() {
        this.attributes = {
            position: new BufferAttribute(new Float32Array([...]), 3),
            normal: new BufferAttribute(new Float32Array([...]), 3),
            uv: new BufferAttribute(new Float32Array([...]), 2),
        };
        this.index = new BufferAttribute(new Uint16Array([...]), 1);
    }
    setAttribute(name, attribute) {
        this.attributes[name] = attribute;
        return this;
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `attributes` | 顶点属性集合（position/normal/uv/color） |
| `index` | 顶点索引（启用 indexed drawing） |
| `groups` | 多材质分组 |
| `drawRange` | 局部渲染（start, count） |

**最佳实践**：

- ✅ 直接持有 `Float32Array`——避免包装对象
- ✅ `itemSize` 标记每顶点分量数（3 = vec3）
- ✅ 用 `setAttribute` API 链式调用——DSL 风格
- ✅ indexed drawing 节省 GPU 内存——三角形共享顶点
- ❌ 避免每帧修改顶点缓冲——上传 GPU 是慢操作

### 模式 9：Nodes 系统（TSL）用 JS 节点图描述着色器

**问题场景**：传统材质用 GLSL/WGSL 写，跨 GPU API 要写两遍。Three.js 抽象出"节点图"，让 JavaScript 描述材质，再由 Nodes 编译器翻译成 GLSL/WGSL。

**解决方案**：

```js
// src/nodes/Nodes.js
import { color, positionLocal, mix } from 'three/nodes';

const material = new NodeMaterial();
material.colorNode = mix(
    color(0x0000ff),
    color(0xff0000),
    positionLocal.x  // 位置 X 决定混合
);

// Nodes 编译器输出 WebGL/WebGPU 着色器
const compiled = material.getCompilationNodes();
```

**关键参数**：

| 节点 | 作用 |
|------|------|
| `color(rgb)` | 颜色常量 |
| `positionLocal` | 局部空间位置 |
| `mix(a, b, t)` | 插值 |
| `NodeMaterial` | 节点材质容器 |

**最佳实践**：

- ✅ 用 JS 描述材质——单一语言跨 GPU API
- ✅ 节点可组合（mix → map → multiply）——DSL 表达力强
- ✅ Nodes 编译器输出 GLSL/WGSL——后端切换零成本
- ✅ 复杂效果（程序化纹理、噪声）用节点图比 GLSL 字符串清晰
- ❌ 避免在节点图里写 100+ 节点——拆成子函数/子图

### 模式 10：`WebGLRenderLists` 对象池减少每帧 GC

**问题场景**：每帧 render() 都要创建数千个 `RenderItem`（带材质、几何、变换的对象）。如果用 `new` 创建，GC 压力巨大，会导致 60fps 不稳。

**解决方案**：

```js
// src/renderers/webgl/WebGLRenderLists.js
class WebGLRenderLists {
    constructor() {
        this.lists = new Map();  // scene → RenderList 缓存
    }
    get(scene, renderListStack) {
        const list = this.lists.get(scene) ?? new RenderList(renderListStack);
        this.lists.set(scene, list);
        return list;
    }
    dispose() {
        this.lists.clear();  // 回收
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `lists` | `Map<Scene, RenderList>` 缓存 |
| `get` | 复用或新建 |
| `dispose` | 帧末回收 |

**最佳实践**：

- ✅ 跨帧复用对象池——避免每帧 `new` 数千元数据
- ✅ 用 `Map` 按场景缓存——同场景的 RenderList 不重建
- ✅ 在 render 末尾 `dispose()`——下帧重置内容
- ✅ 把高频临时对象都池化（Vector3 / Matrix4 / RenderItem）
- ❌ 避免在 render 中间 `new RenderItem()`——回到性能原点

### 模式 11：`Layers` 通道系统实现按层过滤

**问题场景**：场景中不同对象需要不同处理（UI 浮层、辅助线、可拾取、不可拾取）。如果用 `if (obj.userData.tag === 'ui')` 判断，不可扩展。

**解决方案**：

```js
// src/core/Layers.js
class Layers {
    constructor() {
        this.mask = 0b00000001;  // 默认 layer 0
    }
    set(channel) { this.mask = (1 << channel) | 0; }
    enable(channel) { this.mask |= (1 << channel) | 0; }
    disable(channel) { this.mask &= ~((1 << channel) | 0); }
    test(layers) { return (this.mask & layers.mask) !== 0; }
}

// 使用
raycaster.layers.set(1);  // 只拾取 layer 1
camera.layers.enable(0);   // 渲染 layer 0
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `mask` | 32 位位掩码 |
| `set/enable/disable` | 操作通道 |
| `test` | 按位与 |

**最佳实践**：

- ✅ 用位掩码而非 tag 字符串——O(1) 测试
- ✅ 默认 `mask = 1`（layer 0）——新对象可见
- ✅ Raycaster 用独立 Layers——不拾取 UI 浮层
- ✅ 相机用 `layers.enableAll()`——临时切换全显示
- ❌ 避免用 tag 字符串——慢 + 易拼写错

## 性能优化

### 模式 12：临时对象池 + `/*@__PURE__*/` 标记

**问题场景**：矩阵运算（如 `matrix.multiply(other)`）需要临时 `Vector3`、`Matrix4`。每帧 60 次、每场景数千节点，会产生数十万临时对象，GC 压力大。

**解决方案**：

```js
// src/math/Matrix4.js
const _v1 = /*@__PURE__*/ new Vector3();
const _m1 = /*@__PURE__*/ new Matrix4();

class Matrix4 {
    makeTranslation(x, y, z) {
        this.set(
            1, 0, 0, x,
            0, 1, 0, y,
            0, 0, 1, z,
            0, 0, 0, 1
        );
        return this;
    }
    multiply(m) {
        // 内部使用 _v1, _m1 作为临时变量
        const a = this.elements, b = m.elements;
        // ...
    }
}
```

**关键参数**：

| 临时变量 | 用途 |
|---------|------|
| `_v1` ~ `_v5` | Vector3 池 |
| `_q1` ~ `_q2` | Quaternion 池 |
| `_m1` ~ `_m4` | Matrix4 池 |

**最佳实践**：

- ✅ 全局临时变量复用——避免每帧 `new`
- ✅ `/*@__PURE__*/` 告诉 Rollup 死代码消除
- ✅ 写 benchmark 验证 GC 暂停时间下降
- ✅ 配合 Chrome DevTools Performance 标签查 GC 频率
- ❌ 避免把临时变量返回给调用方——会破坏封装

### 模式 13：WebGL 扩展统一处理（`WebGLExtensions` / `WebGLCapabilities`）

**问题场景**：WebGL 1.0/2.0 扩展差异大，浏览器支持度也不同。`OES_texture_float` vs `EXT_color_buffer_float` vs `OES_texture_half_float`，每个浏览器支持矩阵不同。

**解决方案**：

```js
// src/renderers/webgl/WebGLExtensions.js
class WebGLExtensions {
    constructor(gl) {
        this.gl = gl;
        this.extensions = {};
    }
    has(name) {
        return this.extensions[name] !== undefined;
    }
    init(name) {
        if (this.extensions[name] !== undefined) return;
        let ext;
        switch (name) {
            case 'WEBGL_depth_texture':
                ext = this.gl.getExtension('WEBGL_depth_texture');
                break;
            case 'EXT_color_buffer_float':
                ext = this.gl.getExtension('EXT_color_buffer_float');
                break;
        }
        this.extensions[name] = ext;
    }
    get(name) {
        this.init(name);
        return this.extensions[name];
    }
}
```

**关键参数**：

| 扩展 | 用途 |
|------|------|
| `WEBGL_depth_texture` | 深度纹理 |
| `EXT_color_buffer_float` | 浮点渲染目标 |
| `OES_texture_float_linear` | 浮点纹理线性过滤 |
| `EXT_shader_texture_lod` | 着色器纹理 LOD |

**最佳实践**：

- ✅ 抽象层统一 getExtension——上层不关心浏览器差异
- ✅ 懒加载扩展——按需查询，避免启动时阻塞
- ✅ 缓存检测结果——避免重复 getExtension 调用
- ✅ 在 `WebGLCapabilities` 中汇总——UI 显示"GPU 支持矩阵"
- ❌ 避免硬编码"默认 WebGL 2.0 都有"——移动 Safari 经常缺

### 模式 14：`WebGLPrograms` 着色器程序缓存

**问题场景**：每个材质 + 每个光源组合都对应一个 GLSL 着色器。GLSL 编译慢（50-200ms），重复编译会卡顿。

**解决方案**：

```js
// src/renderers/webgl/WebGLPrograms.js
class WebGLPrograms {
    constructor(renderer) {
        this.programs = [];
        this.cacheKey = '';
    }
    getParameters(material, lights, shadows, scene, object) {
        return JSON.stringify({
            vertexShader: material.vertexShader,
            fragmentShader: material.fragmentShader,
            defines: material.defines,
            lightsHash: lights.hash,  // 光源签名
            shadowsHash: shadows.hash, // 阴影签名
        });
    }
    getProgramCacheKey(parameters) {
        // hash 字符串
    }
}
```

**关键参数**：

| 缓存键 | 说明 |
|--------|------|
| `vertexShader` | 顶点着色器源码 |
| `fragmentShader` | 片元着色器源码 |
| `defines` | `#define` 宏 |
| `lightsHash` | 光源配置签名 |

**最佳实践**：

- ✅ 着色器程序按 hash 缓存——同配置复用
- ✅ hash 包含所有影响编译的因素（defines、lights）
- ✅ 缓存 LRU 淘汰——避免内存爆炸
- ✅ 启动时预编译关键材质——避免第一帧卡顿
- ❌ 避免每帧重新编译——编译是 GPU 操作中最慢的之一

### 模式 15：Frustum Culling 视锥剔除减少 draw call

**问题场景**：场景中 10000 个 Mesh，相机只看到其中 100 个。盲目渲染 10000 个 draw call 会浪费 99% GPU 时间。

**解决方案**：

```js
// src/core/Frustum.js
class Frustum {
    setFromProjectionMatrix(matrix) {
        // 从 projectionMatrix 提取 6 个平面
    }
    intersectsObject(object) {
        if (object.boundingSphere === undefined) {
            const geometry = object.geometry;
            if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
            object.boundingSphere = geometry.boundingSphere.clone();
            object.boundingSphere.applyMatrix4(object.matrixWorld);
        }
        return this.intersectsSphere(object.boundingSphere);
    }
}

// WebGLRenderer.render() 中
this._frustum.setFromProjectionMatrix(camera.projectionMatrix);
visibleObjects = objects.filter(o => this._frustum.intersectsObject(o));
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `Frustum` | 6 个平面定义可视空间 |
| `boundingSphere` | 物体包围球 |
| `computeBoundingSphere` | 一次性计算 |
| `intersectsSphere` | 球-平面测试 |

**最佳实践**：

- ✅ 用包围球而非包围盒——球测试快
- ✅ 预计算 `boundingSphere`——避免每帧重算
- ✅ 关闭 `frustumCulled = false` 的物体要少——减少浪费
- ✅ 配合 `Occlusion Culling`（遮挡剔除）效果更佳
- ❌ 避免给小物体（< 1px）用昂贵包围体——得不偿失

### 模式 16：`renderer.info` 监控 draw call 与三角面数

**问题场景**：性能调优需要看 draw call 数、三角面数、纹理数。生产环境需要实时监控卡顿点。

**解决方案**：

```js
// src/renderers/WebGLRenderer.js
class WebGLRenderer {
    constructor() {
        this.info = {
            autoReset: true,
            render: { calls: 0, triangles: 0, points: 0, lines: 0 },
            memory: { geometries: 0, textures: 0 },
            programs: null,
        };
    }
    render(scene, camera) {
        if (this.info.autoReset) this.info.reset();
        this._render(scene, camera);
    }
}

// 监控
const renderer = new WebGLRenderer();
setInterval(() => {
    console.log(`draw calls: ${renderer.info.render.calls}, triangles: ${renderer.info.render.triangles}`);
}, 1000);
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| `render.calls` | draw call 次数 |
| `render.triangles` | 三角形数 |
| `memory.geometries` | 几何对象数 |
| `memory.textures` | 纹理对象数 |

**最佳实践**：

- ✅ 在 dev 环境每 1 秒输出 renderer.info
- ✅ 监控 draw call 突增——可能是不必要的 instancing 失效
- ✅ 监控三角面数——超过 1M 就要优化 LOD
- ✅ 配合 Chrome DevTools Performance——查 GPU 占用
- ❌ 避免在生产每帧输出——IO 开销大

## 工程实践

### 模式 17：`Object3D` 的 `id` + `uuid` 双标识

**问题场景**：3D 对象需要可识别。进程内自增 id 方便 debug，但跨序列化/网络传输时冲突。需要两种标识。

**解决方案**：

```js
// src/core/Object3D.js
let _object3DId = 0;

class Object3D {
    constructor() {
        this.id = _object3DId++;  // 进程内自增
        this.uuid = generateUUID();  // 全局唯一
    }
}

// UUID 生成
function generateUUID() {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let uuid = '';
    for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) {
            uuid += '-';
        } else if (i === 14) {
            uuid += '4';
        } else {
            uuid += chars[(Math.random() * 64) | 0];
        }
    }
    return uuid;
}
```

**关键参数**：

| 字段 | 用途 |
|------|------|
| `id` | 进程内自增，debug 用 |
| `uuid` | 全局唯一，序列化用 |

**最佳实践**：

- ✅ id + uuid 双标识——兼顾 debug 与序列化
- ✅ id 进程级自增——零成本
- ✅ uuid 符合 RFC 4122——跨系统兼容
- ✅ 把 id 暴露给 dev 工具——`window.scene.children[3].id`
- ❌ 避免用 id 做主键——多页面冲突

### 模式 18：父子事件冒泡 + 嵌入式事件常量

**问题场景**：`add`/`remove` 事件需要冒泡到所有子节点。如果监听器误改事件对象（`event.type = 'foo'`），会影响所有节点。

**解决方案**：

```js
// src/core/Object3D.js
const _addedEvent = { type: 'added' };
const _removedEvent = { type: 'removed' };

class Object3D extends EventDispatcher {
    add(object) {
        // ...
        object.dispatchEvent(_addedEvent);  // 共享单例
    }
    remove(object) {
        // ...
        object.dispatchEvent(_removedEvent);
    }
}
```

**关键参数**：

| 常量 | 用途 |
|------|------|
| `_addedEvent` | 共享单例事件 |
| `_removedEvent` | 共享单例事件 |

**最佳实践**：

- ✅ 共享单例事件对象——节省内存
- ✅ 监听器只读事件对象——避免误改
- ✅ 事件冒泡到所有子节点——Tree.add 触发整子树 added
- ✅ 提供 `event.target` 字段——监听器知道触发者
- ❌ 避免监听器修改 `_addedEvent.type`——会污染全局

### 模式 19：`loaders` 抽象 GLTF/OBJ/FBX/Texture 等

**问题场景**：3D 资源有 20+ 种格式（GLTF、OBJ、FBX、STL、PLY、Collada、3DS...）。每种格式解析逻辑不同，但用户接口应该统一。

**解决方案**：

```js
// src/loaders/Loader.js (基类)
class Loader {
    constructor(manager) {
        this.manager = manager ?? DefaultLoadingManager;
    }
    load(url, onLoad, onProgress, onError) { ... }
}

// src/loaders/GLTFLoader.js
class GLTFLoader extends Loader {
    load(url, onLoad, onProgress, onError) {
        this.manager.itemStart(url);
        fetch(url).then(r => r.arrayBuffer()).then(buf => {
            const gltf = parseGLTF(buf);
            onLoad(gltf);
            this.manager.itemEnd(url);
        });
    }
}

// 使用
const loader = new GLTFLoader();
loader.load('scene.gltf', (gltf) => {
    scene.add(gltf.scene);
});
```

**关键参数**：

| Loader | 格式 |
|--------|------|
| GLTFLoader | glTF 2.0 |
| OBJLoader | Wavefront OBJ |
| FBXLoader | Autodesk FBX |
| TextureLoader | PNG/JPG |
| RGBELoader | HDR Environment |

**最佳实践**：

- ✅ 抽象 `Loader` 基类——所有 loader 都有 `load` 接口
- ✅ 用 `LoadingManager` 统一进度回调
- ✅ 支持 `parse(buffer)` 与 `load(url)` 两种入口
- ✅ 加载完成调用 `manager.itemEnd`——进度同步
- ❌ 避免在 loader 内部创建 Object3D——交给用户组装

### 模式 20：JSDoc + `manual/` 文档双轨制

**问题场景**：3D 库的 API 极其庞大（`renderer`、`scene`、`camera`、`material`、`geometry` 各有几十个属性），纯手写文档维护不过来。纯自动生成文档可读性差。

**解决方案**：

```js
// src/math/Vector3.js
/**
 * 三维向量。
 * @param {number} [x=0] - X 分量
 * @param {number} [y=0] - Y 分量
 * @param {number} [z=0] - Z 分量
 */
class Vector3 {
    /**
     * 线性插值。
     * @param {Vector3} v - 目标向量
     * @param {number} alpha - 插值因子 (0~1)
     * @returns {Vector3}
     */
    lerp(v, alpha) { ... }
}
```

```bash
# 构建
npm run build   # 编译 + 生成 .d.ts
npm run docs    # 生成 JSDoc HTML
```

**关键参数**：

| 工具 | 输出 |
|------|------|
| JSDoc | API 文档（自动） |
| `docs/` | 类型定义 `.d.ts` |
| `manual/` | 教程（人类阅读） |

**最佳实践**：

- ✅ JSDoc + `manual/` 双轨——自动 API + 手动教程
- ✅ 重要 API 写 `manual/` 教程——新手友好
- ✅ JSDoc 标注参数类型——VSCode 智能提示
- ✅ 写 `docs/` 维护更新日志——`rXXX → rXXX` 的 breaking change
- ❌ 避免文档与代码不同步——CI 检查 JSDoc 覆盖率

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\three.js\` |
| 主语言 | JavaScript（ESM） |
| License | MIT |
| 包大小 | minified ~600KB（gzip 130KB） |
| 关键模块 | `core/`、`math/`、`geometries/`、`materials/`、`renderers/`、`nodes/` |

## 一句话总结

Three.js 的精髓在 `Object3D extends EventDispatcher`（树状事件） + `BufferGeometry` 与 `Material` 解耦（数据/渲染分离） + 多渲染器抽象（同场景多后端） + Nodes（JS 描述着色器）四件套——任何"树状结构 + 数据驱动 + 多后端 + 可编程管线"项目都适用。
