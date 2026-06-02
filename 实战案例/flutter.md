# flutter - 跨端 UI 工具包与自绘引擎

**GitHub**: flutter/flutter
**Star**: ~170k
**语言**: Dart (99%) + C++ / Swift / Kotlin / Java
**主题**: 跨端 UI / 自绘渲染 / 响应式框架
**适用场景**: iOS / Android / Web / Windows / macOS / Linux 单代码基 60-120fps 应用

---

## 第一段：基础范式

### 模式 1 - 三树模型（Widget / Element / RenderObject）

**问题场景**：一份 UI 描述要支持高频重建（动画、手势、状态），又要保证 60/120fps 渲染。React 用 VDOM 解决重建，但 diff 成本高；Android XML + Java 字段组合粒度粗。

**解决方案**：Flutter 用四层拆解 — Widget（不可变配置）→ Element（生命周期 + diff）→ RenderObject（layout / paint / hit test）→ Layer（合成单元）。重建时仅 Widget 被新建，Element/Reuse 复用，RenderObject 仅在结构变化时调整。

**关键参数**：
- Widget 永远是 `@immutable const`，可被 `==` 直接比较
- Element 维护 `Widget? _widget` 字段，新旧不一致时调 `updateRenderObject`
- RenderObject 在 `attach()` 时挂入 `_owner!.renderViewElement`
- Layer 由 `LayerTree` 持有，分 `OffsetLayer / TransformLayer / ClipRectLayer / PictureLayer`

**最佳实践**：业务代码 99% 写 Widget，必要时下沉 RenderObject（如 `RenderBox` 自定义 layout）而非 Element；避免在 `build()` 中创建非 const 对象，会强制取消 Element 复用。

### 模式 2 - BoxConstraints 单趟下传布局

**问题场景**：传统布局（HTML / Flexbox）需要父 → 子 → 父回溯才能算出最终尺寸，瀑布式 reflow 性能差。

**解决方案**：Flutter 改用"约束下传 / 尺寸上传"：父给子一组 `BoxConstraints(minW, maxW, minH, maxH)`，子自主决定 size 后回填。算法是单趟自顶向下，复杂度 O(n)，无需回溯。

**关键参数**：
- `BoxConstraints.tight(Size s)` 强制等于 s
- `BoxConstraints.loose(Size s)` 最大不超过 s
- `BoxConstraints.expand()` 撑满父区域
- 子节点 `performLayout()` 中调 `layout(child, constraints)` 递归

**最佳实践**：自定义 RenderBox 时必须先 `size = layout(child, ...)` 决定子尺寸，再 `size = constraints.constrain(Size(...))` 决定自己；任何漏调 layout 都会导致子节点 measure 不到。

### 模式 3 - SchedulerBinding + 帧驱动

**问题场景**：浏览器用 `requestAnimationFrame`，iOS 用 `CADisplayLink`，Android 用 `Choreographer`，跨端框架必须统一抽象帧节奏并保证 vsync 对齐。

**解决方案**：`SchedulerBinding` 是 Flutter 引擎的"心脏"，单例挂在 `WidgetsBinding` 之上。`scheduleFrameCallback` 注册回调到下一帧的 `_transientCallbacks`，引擎 vsync 触发后批量执行 `handleDrawFrame` → `drawFrame` → `flushLayout` → `flushPaint`。

**关键参数**：
- `Ticker` 是高频回调封装，`start()` / `stop()` 控制生命周期
- `SchedulerBinding.instance.scheduleFrame()` 主动请求帧
- `vsync: VsyncCallback` 由 engine 通过 `Window.onBeginFrame` 提供
- `WidgetsBinding.handleDrawFrame` 在 16ms 内完成绘制，超时掉帧

**最佳实践**：动画用 `AnimationController` 内部 `Ticker`；不要手动调 `scheduleFrame` 除非实现 `CustomPainter`；测试时用 `tester.pump(Duration)` 推进虚拟时间。

### 模式 4 - Skia / Impeller 自绘引擎

**问题场景**：用 WebView 跨端性能差（JS Bridge），用原生控件风格难统一。Flutter 选择完全自绘，绕过平台 UI 层。

**解决方案**：`flutter/engine` 仓用 C++ 绑定 Skia（2022 前）或 Impeller（2022 后），把 `dart:ui` 的 Canvas 调用翻译成 Metal / Vulkan / OpenGL / DirectX 指令。`Picture` 对象记录所有绘制命令，由 `PictureLayer` 在 GPU 线程 rasterize。

**关键参数**：
- Impeller 是 Flutter 团队自研的 RHI（Render Hardware Interface），编译期生成 shader
- `Canvas.drawPath / drawText / drawImage` 全部走 GPU
- `RenderObject.paint` 中调 `PaintingContext.repaintCompositedChild` 触发 layer 缓存
- `TextureLayer / PlatformViewLayer` 用于嵌入原生视频/地图

**最佳实践**：避免 `Canvas.saveLayer`（会创建离屏 buffer）；动画里用 `Opacity` 组件而非手动 `saveLayer + paint with alpha`；列表用 `ListView.builder` 复用 `RepaintBoundary`。

### 模式 5 - PlatformChannel 桥接原生

**问题场景**：跨端框架没法 100% 覆盖所有平台 API（蓝牙、NFC、相机高级模式、AR），必须有"逃生舱"回到原生。

**解决方案**：`MethodChannel` / `EventChannel` / `BasicMessageChannel` 三套桥。Dart 端 `MethodChannel('samples.flutter.dev/battery').invokeMethod('getBatteryLevel')` 异步调用，iOS 端 `FlutterMethodChannel` handler 接收，Android 端 `MethodChannel.MethodCallHandler.onMethodCall` 处理。

**关键参数**：
- 通道名用 reverse-DNS 命名 `package.channel`
- iOS 用 `FlutterViewController`, Android 用 `FlutterEngine + MethodChannel`
- `invokeMethod` 返回 `Future<T?>`，需 try/catch `PlatformException`
- 大量数据用 `BasicMessageChannel` + `ByteData` 二进制传

**最佳实践**：所有 platform call 集中到一个 `PlatformService` 抽象层；用 mock 实现支持 widget test；批量操作做成单次 invokeMethod + 数组参数，不要循环 1000 次。

---

## 第二段：扩展范式

### 模式 6 - 状态管理分层

**问题场景**：大型应用 setState 不够用（跨页面共享），InheritedWidget 又过度耦合。需要分层抽象。

**解决方案**：Flutter 官方推荐四层 — `setState`（本地 UI）→ `InheritedWidget`（向下共享）→ `ValueNotifier / ChangeNotifier`（响应式）→ `Provider / Riverpod / Bloc`（依赖注入 + 状态机）。每层解决不同问题，避免一刀切。

**关键参数**：
- `InheritedWidget` 通过 `Element.dependOnInheritedWidgetOfExactType` 注册依赖
- `ChangeNotifier` 调 `notifyListeners()` 触发 Element markNeedsBuild
- `Provider` 包装 InheritedWidget + ChangeNotifier + 重建策略（`Selector` 局部）
- `Bloc` 用 `Stream<State>` + `Event → State` 模式

**最佳实践**：业务状态用 Provider/Bloc，本地 UI 用 setState；不要把 `BuildContext` 存进 service；widget tree 深层共享用 `Provider.value` 避免重复创建。

### 模式 7 - Navigator 2.0 声明式路由

**问题场景**：原生 `Navigator.push / pop` 命令式路由在大应用里难维护（深链、web URL 同步、嵌套路由都成噩梦）。

**解决方案**：Navigator 2.0 用 `Router` widget + `RouterDelegate` + `RouteInformationParser` 声明式栈。URL 改变 → 解析为 `RouteInformation` → Delegate 维护 `List<Page>` → Router 自动 diff 栈。

**关键参数**：
- `Page<T>` 不可变，描述一个路由（name / arguments / key）
- `RouterDelegate.setNewRoutePath` 接收 URL 变化
- `RouteInformationParser.parseRouteInformation` URL → typed data
- `go_router` / `auto_route` 是社区主流封装

**最佳实践**：web 端必须用 Router 2.0 + URL strategy；移动端可保留 1.0 但新页面用 2.0 写；deeplink 在 Android Manifest / iOS Info.plist 注册 scheme。

### 模式 8 - 国际化（i18n）架构

**问题场景**：应用出海到 30+ 国家，需要复数、性别、日期、RTL 支持，硬编码 string 必然炸。

**解决方案**：`flutter_localizations` 提供 `GlobalMaterialLocalizations` / `GlobalCupertinoLocalizations` / `GlobalWidgetsLocalizations`。`intl` 包生成 `AppLocalizations` 强类型翻译类，`arb` 文件作源。`MaterialApp.localizationsDelegates` 注册。

**关键参数**：
- `arb` 文件 `@@locale` 头声明 locale，每行 key + placeholders + description
- `flutter gen-l10n` 生成 `AppLocalizations` Dart 类
- `Intl.plural` / `Intl.gender` 处理复数与性别
- `Directionality` widget 控制 RTL/LTR

**最佳实践**：所有 user-facing string 走 `AppLocalizations.of(context).xxx`；时间用 `DateFormat.yMMMd(localName).format(date)`；测试覆盖中文/英文/阿拉伯三语 + RTL 切换。

### 模式 9 - 动画系统

**问题场景**：补间动画、弹簧物理、手势驱动动画、隐式 vs 显式动画 API 太多，新人无从选择。

**解决方案**：四套 API 分场景：
- `AnimatedXxx`（隐式，setState 后自动插值，如 `AnimatedContainer`）
- `AnimationController` + `Tween`（显式，`controller.forward()`）
- `PhysicsSimulation`（弹簧 `SpringSimulation` / 摩擦 `FrictionSimulation`）
- `Hero` + `PageRouteBuilder`（共享元素 + 自定义过渡）

**关键参数**：
- `AnimationController(vsync: this, duration: Duration(milliseconds: 300))`
- `CurvedAnimation(parent: c, curve: Curves.easeInOut)` 缓动
- `Tween<double>(begin: 0, end: 1).animate(c)` 插值
- `controller.animateWith(SpringSimulation(spring, 0, 1, 0))` 弹簧

**最佳实践**：短动画（< 200ms）用 `AnimatedContainer`；手势驱动用 `AnimationController.unbounded`；关键动画曲线用 `Curves.fastOutSlowIn` / `Curves.easeOutCubic` 而非线性。

### 模式 10 - 测试三层金字塔

**问题场景**：移动应用测试容易写成 E2E 一把梭，运行慢、难定位问题。Flutter 给了三层但用错比例。

**解决方案**：三层按 70/20/10 分布：
- 单元测试（`flutter_test`）：纯函数、状态机、reducer
- Widget 测试（`tester.pumpWidget` + `find.text`）：组件树 + 交互
- 集成测试（`integration_test`）：真机/模拟器跑完整流程

**关键参数**：
- `WidgetTester` 模拟 `binding.window` 物理像素 / DPI
- `find.byKey(Key('xxx'))` / `find.text('登录')` 定位节点
- `tester.tap / drag / enterText` 触发交互
- `tester.pumpAndSettle()` 跑完所有动画

**最佳实践**：business logic 写纯 Dart 类，unit test 100% 覆盖；UI 关键流程 1-2 个 widget test；integration test 只跑核心 happy path（登录 → 主页 → 支付）；CI 用 `flutter test --coverage` 生成 lcov。

---

## 第三段：进阶范式

### 模式 11 - 自定义 RenderObject

**问题场景**：内置 `Container / Row / Stack` 满足 95% 场景，但图表引擎、可视化、自定义布局需要直接操作 RenderObject 层。

**解决方案**：继承 `RenderBox`（已知 size）或 `RenderObject`（自定义 layout 协议），重写 `performLayout` / `paint` / `hitTestSelf` / `hitTestChildren`。配合 `RenderObjectWidget` 暴露配置。

**关键参数**：
- `RenderBox.size` 必须赋值，否则后续 layout 失败
- `markNeedsLayout()` 触发父节点下一帧重新 layout
- `markNeedsPaint()` 触发 paint，仅影响当前节点
- `PaintingContext.paintChild(child, offset)` 递归画子节点

**最佳实践**：先看 `RenderConstrainedBox` / `RenderPadding` 源码学模板；自定义 layout 算法务必先写测试用例覆盖边界（min=0, max=∞, tight）；避免在 `paint` 中调 `markNeedsLayout` 会死循环。

### 模式 12 - 性能分析（DevTools Timeline）

**问题场景**：动画卡顿、列表滚动掉帧、build 时间长，找不到瓶颈在哪。

**解决方案**：`flutter run --profile` 启动后 DevTools 抓取 timeline，看到三类开销：
- UI（build + layout + paint，target < 16ms）
- Raster（GPU 线程，target < 16ms）
- Jank（> 16ms 的帧，会标红）

**关键参数**：
- `debugPrintBeginFrameBanner` / `debugPrintEndFrameBanner` 控制台打时间戳
- `Timeline.startSync('xxx')` 自定义埋点
- `WidgetsBinding.instance.addTimingsCallback` 收集帧时延
- `flutter inspector` 可视化 widget tree

**最佳实践**：卡顿先看 raster（GPU 满载）还是 UI（CPU 满载）；`Opacity`/`ClipRRect` 触发的 saveLayer 是常见 raster 杀手；列表 60+ items 必须 `ListView.builder` + `RepaintBoundary`。

### 模式 13 - 平台 Embedder 与 FFI

**问题场景**：Flutter 主要跑在 Android/iOS/web/桌面，但有些场景需要嵌入到原生 View（Android Fragment / iOS UIView）做混合栈。

**解决方案**：`FlutterEngine` + `FlutterViewController` 提供原生 API 嵌入；Dart 端用 `dart:ffi` 调 C 库（如 SQLite 本地、加密算法）；`pigeon` 工具生成类型安全的 platform interface。

**关键参数**：
- iOS `FlutterViewController(engine, nibName, bundle:)` 创建 view
- Android `FlutterEngine(ctx).dartExecutor.executeDartEntrypoint(...)`
- FFI `DynamicLibrary.open('libsqlite3.so').lookup<NativeFunction<...>>('sqlite3_open')`
- `pigeon` 输入 Dart `@HostApi` 类，输出 Kotlin/Swift stub

**最佳实践**：混合栈 Android 用 `FlutterFragment`，iOS 用 `FlutterViewController asChild`；FFI 调用前用 `package:ffi` 包装一层，类型转换集中；pigeon 比手写 channel 减少 80% 模板代码。

### 模式 14 - 编译产物与 AOT

**问题场景**：Dart 既能 JIT（开发期热重载）又能 AOT（生产期原生），两种模式产物体积、启动速度差异巨大。

**解决方案**：Debug 模式 `flutter run` 用 JIT + kernel snapshot（~30MB）；Profile 模式 AOT + 调试符号（找性能问题用）；Release 模式纯 AOT（无调试，~5-10MB Android libapp.so）。

**关键参数**：
- AOT 编译 `flutter build apk --release` → `libapp.so`（含 Dart 编译后 native code）
- iOS Release 默认 AOT；macOS / Linux 用 `--target-platform`
- `flutter build appbundle` 上传 Play Store
- `flutter build web --release` 编译成 JS / WasmGC

**最佳实践**：本地测启动速度用 `--profile`（保留 stack trace）；体积优化 `flutter build apk --split-per-abi`；web 用 `flutter build web --wasm` 启用 WasmGC（Wasm 体积比 JS 小 30%）。

### 模式 15 - 包管理与发布

**问题场景**：跨端应用要管理原生依赖（Gradle / CocoaPods），还要发到 Play / App Store / Web。

**解决方案**：`pubspec.yaml` 声明 Dart 依赖 + 资源；`android/app/build.gradle` 调原生依赖；`ios/Runner.xcodeproj` 配 Podfile；`flutter build` 多目标产物。

**关键参数**：
- `pubspec.yaml` 的 `dependencies` / `dev_dependencies` / `flutter.uses-material-design`
- `flutter pub deps` 看依赖树
- `flutter pub upgrade --major-versions` 大版本升级
- `flutter pub publish` 发到 pub.dev

**最佳实践**：依赖锁 `pubspec.lock` 提交 git；用 `dependency_overrides` 处理 fork 临时方案但要在 issue 跟踪；发版前 `flutter analyze` + `flutter test` + `flutter build apk --release` 三连。

---

## 第四段：实战范式

### 模式 16 - 应用架构：Feature-first 目录

**问题场景**：100+ 屏的 Flutter 应用按 `screens/widgets/models` 分层，新人找不到 LoginScreen 相关的所有文件。

**解决方案**：Feature-first 结构（`lib/features/{auth,home,profile}/`），每个 feature 内部再分 `data/domain/presentation` 三层。共享 `lib/core/` 放工具、`lib/shared_widgets/` 放跨 feature 组件。

**关键参数**：
```
lib/
├── main.dart
├── app.dart              # MaterialApp + theme + routes
├── core/                 # network, storage, utils
├── features/
│   ├── auth/
│   │   ├── data/         # repository impl, dto
│   │   ├── domain/       # entity, usecase
│   │   └── presentation/ # pages, widgets, bloc
│   └── home/...
└── shared_widgets/       # 跨 feature 通用组件
```

**最佳实践**：feature 之间通过 `core/` 接口通信，禁止 `features/auth/` 直接 import `features/home/`；每个 feature 配独立 test 目录；`very_good_analysis` lint 规则保证一致性。

### 模式 17 - 状态管理选型

**问题场景**：Provider、Riverpod、Bloc、GetX、MobX 五花八门，新项目选型纠结。

**解决方案**：按规模选：
- 小项目（< 20 屏）：`Provider + ChangeNotifier`，零成本学习
- 中型（20-100 屏）：`Riverpod`，编译期安全 + 强类型
- 大型（100+ 屏，复杂状态机）：`Bloc`，事件溯源 + 易于测试
- 紧急 MVP：`GetX`，但有反模式（service locator + 路由 + 状态）耦合

**关键参数**：
- Provider `ChangeNotifierProvider(create: (_) => LoginViewModel())`
- Riverpod `final loginProvider = StateNotifierProvider<LoginViewModel, LoginState>(...)`
- Bloc `BlocProvider(create: (ctx) => LoginBloc(authRepo: ctx.read()))`
- GetX `final Rx<LoginState> state = Rx(LoginState.initial())`

**最佳实践**：不要混用多个状态库；新项目首选 Riverpod（类型安全 + 无 BuildContext 依赖）；Bloc 适合金融/医疗等强审计场景；GetX 慎用，团队规模大时维护成本高。

### 模式 18 - 网络层与错误处理

**问题场景**：HTTP 请求、错误重试、token 刷新、loading/error 状态需要统一抽象，否则 30 个 screen 写 30 套。

**解决方案**：`dio` + `retrofit` 风格 + 拦截器分层：
- `AuthInterceptor` 自动加 Bearer token + 401 刷新
- `RetryInterceptor` 网络错误重试 3 次
- `LogInterceptor` 调试期打印
- `ErrorInterceptor` 统一转 `ApiException` 业务错误

**关键参数**：
- `dio.options.baseUrl` + `dio.options.connectTimeout = 5s`
- `ResponseInterceptor` 中 `handler.reject(DioException(...))`
- `CancelToken` 取消进行中请求
- `FormData.fromMap` 上传文件

**最佳实践**：Repository 层包 dio，业务只看 Result<Success, ApiException>；token 刷新用单例 + 锁，避免并发请求都触发 refresh；web 端处理 CORS preflight。

### 模式 19 - CI/CD 多平台流水线

**问题场景**：iOS/Android/Web/macOS/Windows/Linux 7 个目标，GitHub Actions 矩阵怎么排最省时。

**解决方案**：matrix strategy 跑 build，`fastlane` 处理发布，`firebase-app-distribution` 做内测。

**关键参数**：
```yaml
strategy:
  matrix:
    target: [android, ios, web, macos, windows, linux]
```
- Android：`flutter build apk --release` + `fastlane supply`
- iOS：`flutter build ipa` + `fastlane pilot`
- Web：`flutter build web --release` + 上传 S3 / Firebase Hosting

**最佳实践**：CI 用 `subosito/flutter-action@v2` 缓存 pub 与 gradle；iOS macOS-only runner 单独跑；PR 触发 `flutter analyze + test`，tag 触发 `build + deploy`；签名密钥走 GitHub Secrets。

### 模式 20 - Web 平台特殊处理

**问题场景**：Flutter Web 用 HTML renderer 还是 CanvasKit（已弃用，统称 Wasm/JS）？URL 怎么深链？SEO 怎么做？

**解决方案**：`flutter build web --wasm` 默认 WasmGC + CanvasKit-like 渲染；`go_router` 配 URL strategy 处理深链；meta 标签用 `seo_utils` 包或 SSR 单独做（Flutter Web 不支持 SSR，需用 Next.js/Nuxt 套壳）。

**关键参数**：
- `--wasm` 启用 WasmGC 编译，体积比 JS 小 30%
- `--web-renderer html`（已废弃，新版本用 Skwasm/Canvaskit）
- `RouteInformationProvider` 同步 URL
- `flutter build web --pwa-strategy offline-first` 生成 service worker

**最佳实践**：web 端避免用 `dart:io`（编译会失败）；图片用 `Image.network` + `precacheImage`；首屏加 `loading_builder`；用 `--web-renderer html` 仅在低端设备（已弃用，慎用）；SEO 强需求用 Next.js host Flutter Web 子路径。
