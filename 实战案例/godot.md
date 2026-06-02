# godot - 2D/3D 跨平台开源游戏引擎

**GitHub**: godotengine/godot
**Star**: 94k+
**语言**: C++ (核心) + GDScript / C# (脚本)
**主题**: game-engine / gdscript / gdextension / cross-platform
**适用场景**: 独立游戏 / 2D / 3D / 教学

---

## 第一段：基础范式

### 模式 1 - 节点树（SceneTree）

**问题场景**：游戏对象有复杂层级（玩家 → 子节点：Sprite / Animation / Collision / Script），传统 OOP 继承链深、难复用。

**解决方案**：Godot 用 SceneTree — 一切都是 Node，节点可挂任意子节点形成树。场景（.tscn）描述树结构，节点运行时实例化。父子节点通过 `get_node("path")` / `get_parent()` 通信。

**关键参数**：
- `Node` 基类（无视觉/逻辑）
- `Node2D` / `Node3D` 加 transform
- `CanvasItem` 加绘制
- `_ready()` / `_process(delta)` 生命周期

**最佳实践**：节点优先组合而非继承（多用 `Node` 容器挂子节点）；场景实例化用 `instance()` 而非深拷贝；信号机制解耦节点间通信（避免 get_node 硬编码）。

### 模式 2 - GDScript 脚本语言

**问题场景**：Unity 用 C# 写脚本（学习曲线陡），Unreal 用 C++（编译慢），新手门槛高。

**解决方案**：GDScript — Python-like 动态类型语言，与 Godot API 深度集成。`var x = 5; func _ready(): print("hello")` 即可跑。`@onready` 注解在 ready 前赋值节点引用。

**关键参数**：
- `extends Node` / `extends Node2D` 继承节点
- `@export var speed: float = 100` 编辑器暴露
- `@onready var sprite = $Sprite` 延迟引用
- `signal hit` 自定义信号

**最佳实践**：性能关键代码用 C# / GDExtension（C++ 绑定）；业务逻辑用 GDScript（开发快）；type hint `func add(a: int, b: int) -> int` 提升 IDE 补全；`@tool` 注解让脚本在编辑器内运行。

### 模式 3 - 信号机制

**问题场景**：游戏事件（玩家死亡 / 物品拾取 / 碰撞）需要解耦发布者和订阅者，Unity 委托 / UE 多播事件代码复杂。

**解决方案**：Godot Signal — `signal died` 声明，`emit_signal("died")` 触发，`connect("died", callable_object)` 订阅。`func _on_player_died(): pass` 自动连接（编辑器可视化）。

**关键参数**：
- `signal health_changed(new_hp: int)`
- `emit_signal("health_changed", hp)` 触发
- `obj.connect("health_changed", on_health_changed)`
- `obj.health_changed.connect(on_health_changed)` GDScript 2.0 语法

**最佳实践**：用 `obj.signal_name.connect()` 而非 `connect("name", ...)`（类型安全）；Lambda 慎用（生命周期难追踪）；编辑器"Node"面板可视化连信号；高频信号用 `call_deferred` 延迟到 idle 帧。

### 模式 4 - Godot Server 抽象

**问题场景**：游戏需要 Physics / Audio / Rendering / Network / Display 各子系统，模块紧耦合难维护。

**解决方案**：Server 抽象 — `PhysicsServer2D/3D` / `AudioServer` / `RenderingServer` / `DisplayServer` / `NavigationServer` 是 C++ 单例。Node 树只是"便利包装"，底层都通过 Server 工作。Server 暴露 RID（Resource ID）句柄。

**关键参数**：
- `PhysicsServer2D` 提供 `body_create() / shape_create() / body_add_shape()`
- RID 是不透明 uint64 句柄
- `RenderingServer` 暴露 canvas / mesh / light
- Server 可独立于 SceneTree 运行（headless 服务器）

**最佳实践**：业务用 Node 包装类（`RigidBody2D` / `Sprite2D`），高级优化用 Server RID 直接操作；headless 服务器（`godot --headless`）跑 Dedicated Game Server；GDScript 写业务，C++ 写底层。

### 模式 5 - GDExtension（C ABI 绑定）

**问题场景**：脚本语言（GDScript）性能不够；C# 集成 mono/.NET 复杂；原生 C++ 集成要走引擎编译。

**解决方案**：GDExtension — 跨语言 C ABI 绑定，第三方 C++ 库编译成 .so / .dll 动态加载。GDExtension API 用 `extern "C"` 函数指针（无 C++ ABI 兼容问题）。

**关键参数**：
- `gdextension_interface.h` 定义 ABI
- `gdextension.h` 头文件
- `GDREGISTER_CLASS(MyClass)` 注册类
- `MyClass::MyClass() = default` 构造函数

**最佳实践**：性能关键模块（物理 / 渲染 / 加密）用 GDExtension；Rust / Zig 也可写 GDExtension（无 C++ 头文件依赖）；gdextension 比 C# Mono 启动快 100x（无 JIT）。

---

## 第二段：扩展范式

### 模式 6 - Resource 系统

**问题场景**：游戏数据（物品 / 技能 / 关卡）需统一管理，重复实例化浪费内存；JSON / XML 散落各处难统一。

**解决方案**：Resource — `extends Resource` 的类可序列化到 .tres / .res 文件。`ResourceLoader.load("res://item.tres")` 加载，资源可被多个实例引用（共享）。

**关键参数**：
- `class_name Item extends Resource` 自定义
- `@export var name: String` 字段
- `.tres` 文本格式 / `.res` 二进制
- `preload("res://item.gd")` 编译期加载

**最佳实践**：游戏数据（物品 / 技能）走 Resource；运行时数据用 `Dictionary` 即可；Resource 提供 `@export` 在编辑器可视化编辑；预加载用 `preload` 而非 `load`（编译期解析）。

### 模式 7 - PackedScene 复用

**问题场景**：子弹 / 敌人 / 特效有大量重复实例化，每次 `new` + 配置性能差。

**解决方案**：PackedScene（.tscn）— 场景文件可"打包"成模板，`instance()` 生成独立实例。子节点可独立改属性（覆盖）。

**关键参数**：
- `var Bullet = preload("res://bullet.tscn")`
- `var b = Bullet.instance()`
- `add_child(b)`
- `b.position = ...` 覆盖

**最佳实践**：高频生成实体（子弹 / 粒子）用 PackedScene；不同实例共享子节点（修改子节点属性不影响其他实例）；`@export var bullet_scene: PackedScene` 配 Node 暴露。

### 模式 8 - 物理与碰撞

**问题场景**：2D / 3D 物理（碰撞检测 / 刚体 / 触发器）需要统一 API。

**解决方案**：CollisionObject2D/3D 体系 — `RigidBody2D`（动力学刚体）/ `StaticBody2D`（静态）/ `CharacterBody2D`（玩家控制）/ `Area2D`（触发器）。`CollisionShape2D` 挂 `Shape2D`（Rectangle / Circle / Capsule / ConvexPolygon）。

**关键参数**：
- `body_entered` / `body_exited` 信号
- `move_and_collide` / `move_and_slide` 移动
- `Physics2DServer.body_add_shape()` 直接用 Server
- `collision_layer` / `collision_mask` 32 层过滤

**最佳实践**：玩家控制用 `CharacterBody2D`（手动控制），物理对象用 `RigidBody2D`（引擎控制）；collision layer / mask 按"什么打我 / 我打什么"切分；debug `get_tree().debug_collisions_hint` 可视化碰撞体。

### 模式 9 - 自动加载（Singleton）

**问题场景**：全局管理器（GameManager / AudioManager / SaveSystem）需要在所有场景访问。

**解决方案**：Project Settings → Autoload 注册单例脚本，挂到 SceneTree 根。`GameManager.score += 1` 任意位置可访问。

**关键参数**：
- Project Settings → AutoLoad → Add
- 节点名 + 脚本路径
- 全局唯一
- `get_node("/root/GameManager")` 访问

**最佳实践**：全局管理器（分数 / 音频 / 存档）用 AutoLoad；游戏状态机也用 AutoLoad；AutoLoad 节点用 PascalCase（`GameManager`）便于识别；`get_node("/root/GameManager")` 可改为单例类 `class_name GameManager extends Node`。

### 模式 10 - 跨平台导出

**问题场景**：游戏要发布到 Windows / macOS / Linux / iOS / Android / Web / Console。

**解决方案**：Export Templates + Export Presets。`godot --export-release "Windows Desktop" game.exe` 命令行导出，编辑器可视化配置每个平台的签名 / 资源 / 启动画面。

**关键参数**：
- Editor → Project → Export → Add Preset
- 选择平台 → 配置（图标 / 启动屏 / 包名 / 签名）
- Export Templates 下载后启用
- `godot --export-debug` 调试包 / `--export-release` 发布包

**最佳实践**：跨平台图标多分辨率打包；iOS / Android 签名证书管理（`keystore` / `mobileprovision`）；web 平台注意 pck 体积（分包）；console 平台需申请开发者账号 + 单独 SDK。

---

## 第三段：进阶范式

### 模式 11 - 渲染管线（RenderingServer）

**问题场景**：游戏画面要 60/120 FPS，需要 GPU 加速 + 多 Pass 渲染（base / transparent / post-process）。

**解决方案**：RenderingServer 单例管理 GPU 资源 — RID 句柄指向 GPU 端 buffer / texture / shader。`canvas_item_add_texture_rect` / `mesh_surface_create_from_arrays` 等 C++ API。

**关键参数**：
- RID（Resource ID）uint64 句柄
- `RenderingServer.instance_create2(mesh, scenario)` 创建可见实例
- `RenderingServer.canvas_item_set_parent` 画到 canvas
- Compatibility / Forward+ / Mobile 三种渲染后端

**最佳实践**：默认 Forward+（桌面 + 移动高端）；移动端可选 Mobile Renderer（更省电）；高级用户用 RenderingServer RID 直接写自定义 Pass；多分辨率渲染（Render scale 0.5-2.0）。

### 模式 12 - 着色器（Shaders）

**问题场景**：游戏需要复杂视觉效果（水 / 雾 / 后期），CPU 算不动。

**解决方案**：Godot 着色器 — `shader_type spatial;` (3D) / `canvas_item` (2D) / `sky` / `fog` / `particles`。`.gdshader` 文件 + `.gdshaderinc` include。

**关键参数**：
- `shader_type spatial;`
- `void fragment() { ... }` / `void vertex() { ... }`
- `uniform float time;` 暴露 uniform
- `ALBEDO` / `EMISSION` / `ROUGHNESS` 内置输出

**最佳实践**：先看官方 `material` 库学模板；`#include "res://my_func.gdshaderinc"` 复用代码；`render_mode` 改 blend / cull / depth；性能 profile 看 GPU 时间（不只是 CPU）。

### 模式 13 - 性能优化（Profile）

**问题场景**：60 FPS 变 30 FPS 需要定位瓶颈。

**解决方案**：Monitors 面板 + Profile 标签 — 实时显示 Physics / Idle / Render 时间，定位是逻辑慢还是绘制慢。`Performance.add_custom_monitor` 自定义埋点。

**关键参数**：
- Monitors: FPS / PROCESS_TIME / PHYSICS_TIME / NAVIGATION_TIME
- 自定义：`Performance.add_custom_monitor("MyMetric", func() -> float: return total_cost)`
- Visual Profiler 看每帧函数耗时
- `EngineDebugger.profiler_add_frame_data` 集成自定义

**最佳实践**：先看 Monitors 整体趋势，再 Visual Profiler 看具体函数；物理慢减碰撞体 / 用更简单 shape；绘制慢减 draw call（合并 sprite / 用 atlas）；脚本慢用 C# / GDExtension。

### 模式 14 - 多人游戏（Multiplayer）

**问题场景**：多人游戏（PvP / 合作）需要网络同步（位置 / 状态 / 事件）。

**解决方案**：MultiplayerAPI — 底层是 ENet（默认）或 WebRTC（浏览器间）。`MultiplayerSpawner` 同步节点生成 / 销毁；`MultiplayerSynchronizer` 同步属性。

**关键参数**：
- `ENetConnection.host` 起服务 / `ENetConnection.client` 连入
- `peer.connect()` 客户端
- `MultiplayerSpawner.spawn_function` 自定义同步
- `MultiplayerSynchronizer` 复制属性

**最佳实践**：高频同步（位置）用插值 + 预测，不要每帧同步；低频事件用 RPC；服务端权威（防作弊）；GDScript-RPC 简单但 ENet 适合 < 16 玩家；大规模用 dedicated server + 自定义协议。

### 模式 15 - iOS / Android 平台适配

**问题场景**：移动端触控 / 传感器 / 后台 / 性能模式与桌面不同。

**解决方案**：
- iOS：`godot-ios` plugin 调 Objective-C（In-App Purchase / Game Center）
- Android：`godot-android` plugin 调 Kotlin / Java
- 通用 API：`Input.get_gyroscope()` / `OS.get_model_name()` / `OS.get_screen_orientation()`

**关键参数**：
- `Project Settings → Input Map` 配触控手势
- `Engine.get_main_loop().process_frame` 主循环
- 平台检测 `OS.get_name() == "iOS"`
- iOS 签名 / Provisioning / Android keystore

**最佳实践**：移动端禁用鼠标 hover 效果；省电模式用 `OS.low_processor_mode = true`；In-App Purchase 用官方 plugin；后台切回 on_foreground 重新加载资源。

---

## 第四段：实战范式

### 模式 16 - 状态机（FSM）

**问题场景**：游戏对象（敌人 / 玩家 / UI）有多个状态（巡逻 → 追击 → 攻击 → 死亡），if-else 嵌套难维护。

**解决方案**：FSM 状态机 — `enum State { IDLE, CHASE, ATTACK }` + `var state = IDLE` + `match state:` 切换；或通用 `StateMachine` Node，每个 State 一个子节点（`StateMachine.gd` / `State.gd`）。

**关键参数**：
- `var current_state: State`
- `func _physics_process(delta): match current_state: ...`
- 状态转换：`transition_to(new_state)`
- 状态 enter / exit 钩子

**最佳实践**：每个状态独立子节点（`StateMachine` / `IdleState` / `ChaseState`）；状态切换 emit_signal；动画用 `AnimationPlayer` 配合 state；可视化调试 `print(current_state)`。

### 模式 17 - 对象池（Object Pooling）

**问题场景**：子弹 / 粒子 / 敌人高频生成 + 销毁，GC 压力 + Instantiate 开销巨大。

**解决方案**：对象池 — 预生成 N 个对象隐藏备用，`acquire()` 取出激活，`release()` 回收。`extends Node2D` + `class_name Pool`。

**关键参数**：
- 预生成 `for i in 100: var obj = BulletScene.instance(); pool.add_child(obj); obj.set_process(false); obj.visible = false`
- `acquire()` 找一个未激活的
- `release()` 隐藏 + 停 process
- `signal pool_empty` 池满告警

**最佳实践**：子弹 / 粒子 / 短命敌人用对象池；长命对象（玩家 / 摄像机）不池化；`get_tree().get_nodes_in_group("bullets")` 快速遍历；池大小 = 平均并发数 × 1.5。

### 模式 18 - 存档系统（Save/Load）

**问题场景**：玩家进度 / 设置需持久化（重启游戏 / 跨设备同步）。

**解决方案**：ResourceSaver / ResourceLoader — `var save_data = SaveData.new(); save_data.coins = 100; ResourceSaver.save(save_data, "user://save.tres")`。`user://` 路径是平台特定用户目录。

**关键参数**：
- `user://` 平台用户目录
- `ResourceSaver.save(obj, "user://save.tres", ResourceSaver.FLAG_COMPRESS)`
- `var data = ResourceLoader.load("user://save.tres")`
- `ConfigFile` 存简单配置
- `JSON.stringify` 存 JSON 字符串

**最佳实践**：存档用 `Resource`（带类型）而非 JSON（裸 string）；云存档走 `Steamworks` / `PlayFab` / `GameSparks`；加密敏感数据（`AESContext`）；自动保存 + 手动保存双轨。

### 模式 19 - AI 与寻路

**问题场景**：敌人 AI 需要寻路（避开障碍 / 追玩家 / 巡逻）。

**解决方案**：NavigationServer2D/3D — 烘焙 navmesh（`bake_navigation_mesh`），运行时寻路（`NavigationAgent2D`）。`NavigationAgent2D` 提供 `get_next_path_position()` 返回下一步方向。

**关键参数**：
- `NavigationRegion2D` + `NavigationPolygon`
- 烘焙 `bake_navigation_mesh(false)` 离屏
- `agent.set_target_position(player.position)`
- `var dir = agent.get_next_path_position() - position`

**最佳实践**：复杂场景烘焙静态 navmesh（设计期）；动态障碍用 `NavigationObstacle2D`；多层 navmesh（楼梯 / 平台）配 `link`；`avoidance_enabled` 启用 RVO 避让。

### 模式 20 - 移动端发布与优化

**问题场景**：移动端性能（CPU / GPU / 内存 / 电量）受限，桌面游戏 60 FPS 移植到手机掉 20 FPS。

**解决方案**：
- 渲染：降低 internal resolution（`window_size / 2`）+ Mobile Renderer
- 物理：减少 collision shape 复杂度 + 更小 world
- 资产：纹理压缩 ASTC / ETC2，模型减面
- 脚本：避免 `_process(delta)` 大量对象 + 用 `set_process(false)` 暂停

**关键参数**：
- Project Settings → Rendering → Mobile Renderer
- `--rendering-driver opengl3` vs `vulkan`
- 纹理压缩 Import → compress / VRAM
- `OS.low_processor_mode = true` 低端机降级

**最佳实践**：移动端做设备分级（高端/中端/低端三档 asset pack）；用 Profiler 测真机（不是 PC）；省电 + 散热考虑（持续高 GPU → 降频 → 卡顿）；首次启动 < 5s（避免 splash 白屏）。
