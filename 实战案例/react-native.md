# React Native · 架构与工程实践精要

> React Native 是 React 的移动端实现，把"一套代码跑 iOS + Android"从口号变成工程事实。本笔记从 Amazon Builders' Library 视角剖析其 JS-Native 桥接机制、Fabric 渲染管线、Hermes 引擎、TurboModules，聚焦 20 个工程模式与决策。

---

## 一、核心机制与桥接哲学

### 模式 1：JS 端到 Native 端通信（Old Bridge vs JSI）

**问题场景**：移动端 JS 引擎（JavaScriptCore/Hermes）跑 JS 代码，Native 端（iOS/Android）跑原生 UI。如何让 JS 调用 Native 模块，反之亦然？传统做法是异步消息队列，但每次调用都要 JSON 序列化/反序列化，性能差。

**解决方案代码**：

```cpp
// Old Bridge（已弃用）：异步 JSON 消息队列
// JS 端
import { NativeModules } from 'react-native';
const Camera = NativeModules.Camera;
Camera.takePicture().then(photo => console.log(photo));
// 内部：把 takePicture 序列化为 {"method": "takePicture", "args": []}
// 通过 messageQueue 异步发送到 Native
// Native 反序列化、执行、回调也是 JSON 序列化

// JSI（New Arch）：C++ 共享指针，直接同步调用
// C++ 端 jsi/jsi.h
class Runtime {
  virtual Value call(const Function& fn, const Value* args, size_t count) = 0;
};

// Native 端把 host function 暴露给 JS
class CameraModule {
public:
  void takePicture(facebook::jsi::Runtime& rt) {
    // 直接执行，无 JSON 序列化
    auto photo = ...;
    rt.global().setProperty(rt, "lastPhoto", jsi::Value::createFromJson(rt, photoJson));
  }
};

// JS 端直接调
import Camera from './Camera'; // TurboModule
const photo = Camera.takePicture(); // 同步，0 序列化开销
```

**关键参数表**：

| 维度 | Old Bridge | JSI (New Arch) |
|---|---|---|
| 通信方式 | 异步消息队列 | C++ 共享指针（同步） |
| 数据序列化 | JSON（每次） | 零（共享对象） |
| 调用延迟 | 1-2ms / 次 | 0.01ms / 次 |
| 类型安全 | 字符串协议 | Codegen TS 接口 |
| 启动开销 | 高 | 低 |

**最佳实践列表**：
- Old Bridge 已在新架构中弃用——0.76+ 默认 Bridgeless + JSI
- 性能敏感模块（相机、音频、动画）必须用 TurboModule
- 跨平台模块封装 TurboModule 一次，iOS + Android 共用
- JSI 不替代 Bridge——它替代的是"调用"机制，模块注册仍需 codegen

### 模式 2：C++ 跨平台核心层（ReactCommon）

**问题场景**：iOS 用 Objective-C++，Android 用 Java + C++，两端都要实现"协调器"逻辑（diff、layout、commit）。如果各写一份，维护成本翻倍，且容易不一致。

**解决方案代码**：

```cpp
// ReactCommon/react/nativemodule/core/ReactCommon/TurboModule.h
class TurboModule {
public:
  virtual std::string getName() = 0;
  virtual void invoke(...) = 0;
};

// ReactCommon/fabric/mounting/ShadowNode.h
class ShadowNode {
public:
  ShadowNode(const ShadowNode& src, const Props& props);
  virtual ComponentName getComponentName() const = 0;
  virtual Props getProps() const = 0;
  // ... 跨平台共享
};

// ReactCommon/yoga/Yoga.h
class YGNode {
public:
  void calculateLayout(float width, float height, YGDirection direction);
  // Yoga 布局引擎：iOS / Android 共享同一份 C++ 代码
};
```

**关键参数表**：

| 跨平台 C++ 组件 | 作用 | iOS 实现 | Android 实现 |
|---|---|---|---|
| `ReactCommon/jsi` | JS 引擎 C++ 接口 | 共享 | 共享 |
| `ReactCommon/fabric` | 渲染器（Shadow Tree） | 共享 | 共享 |
| `ReactCommon/yoga` | Flexbox 布局引擎 | 共享 | 共享 |
| `ReactCommon/react/nativemodule` | TurboModule 协议 | 共享 | 共享 |
| `ReactCommon/react/renderer/uimanager` | UI 管理 | 共享 | 共享 |

**最佳实践列表**：
- 业务 Native 模块尽量用 C++ 写——iOS + Android 共用一份
- Yoga 是 RN 的"布局秘密"——Java/ObjC 端只暴露 API
- Fabric（New Renderer）100% 写在 C++——两端 UI 行为一致
- 不直接 import ReactCommon——通过 RN 提供的 API 间接使用

### 模式 3：JS 端 React 与 Native 端 UI 映射

**问题场景**：JS 写 `<View>` / `<Text>`，但 iOS 用 `UIView` / `UILabel`，Android 用 `android.view.View` / `android.widget.TextView`。需要"JS 标签 → Native 组件"的映射层。

**解决方案代码**：

```jsx
// JS 端
import { View, Text, ScrollView, Image } from 'react-native';
function App() {
  return (
    <View style={{ flex: 1 }}>
      <Text>Hello</Text>
      <Image source={{ uri: 'https://x.com/y.jpg' }} />
    </View>
  );
}

// 内部映射（Fabric）：
// <View> → RCTViewComponentView (iOS) / ReactViewGroup (Android)
// <Text> → RCTTextComponentView (iOS) / ReactTextView (Android)
// <Image> → RCTImageComponentView (iOS) / ReactImageView (Android)

// ShadowNode 类型对应
class ViewShadowNode : public ConcreteViewShadowNode<ViewComponentName> {};
class TextShadowNode : public ConcreteTextShadowNode<TextComponentName> {};
class ImageShadowNode : public ConcreteImageShadowNode<ImageComponentName> {};
```

**关键参数表**：

| JS 组件 | iOS Native | Android Native | 用途 |
|---|---|---|---|
| `<View>` | `RCTViewComponentView` | `ReactViewGroup` | 容器 |
| `<Text>` | `RCTTextComponentView` | `ReactTextView` | 文字 |
| `<Image>` | `RCTImageComponentView` | `ReactImageManager` | 图片 |
| `<ScrollView>` | `RCTScrollViewComponentView` | `ReactScrollViewManager` | 滚动 |
| `<TextInput>` | `RCTTextInputComponentView` | `ReactTextInputManager` | 输入 |
| `<Pressable>` | `RCTPressableComponentView` | `ReactViewGroup` | 点击 |
| `<FlatList>` | `RCTVirtualView` | `ReactVirtualView` | 虚拟列表 |

**最佳实践列表**：
- JS 端组件是"声明式"——只描述 UI 树，Fabric 映射为 Shadow Tree
- 自定义 Native 组件：`codegen` 生成 JS/ObjC/Java 接口，3 端同时可用
- 性能：Fabric 同步布局 + commit，UI 不抖
- 反模式：避免深层 View 嵌套（>20 层）——影响 diff 性能

### 模式 4：New Architecture 三大件（Fabric + TurboModules + Codegen）

**问题场景**：Old Bridge 序列化开销大、类型不安全、必须异步。New Architecture 用三个核心改进：(1) JSI 共享内存替代 Bridge 序列化；(2) Fabric 同步渲染管线；(3) Codegen 编译期生成类型化绑定。

**解决方案代码**：

```typescript
// 1. Codegen：TS 接口自动生成 iOS/Android/JS 绑定
// src/NativeCameraModule.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  takePicture(): Promise<string>;  // 返回 base64
  startRecording(): void;
  stopRecording(): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('CameraModule');
// 编译时 Codegen 生成：
//   iOS: NativeCameraModuleSpec.h/m
//   Android: NativeCameraModuleSpec.java
//   JS: TypeScript types 验证

// 2. TurboModule：JSI 直接调用，无 JSON 序列化
// iOS 实现
class CameraModule : public NativeCameraModuleSpecJSI {
  void startRecording(jsi::Runtime& rt) {
    // 直接调 AVAudioRecorder
    [AVAudioRecorder startRecording];
  }
};

// 3. Fabric：同步渲染管线
// 一次 React state 更新 → 同步 layout → 同步 commit → 一次 frame
// 旧架构：3 个 frame（async bridge）
```

**关键参数表**：

| 改进 | Old | New (Fabric + TurboModules + Codegen) |
|---|---|---|
| 通信 | Bridge（async JSON） | JSI（sync 共享） |
| 渲染 | 异步（多 frame） | 同步（单 frame） |
| 类型 | 字符串协议 | Codegen TS 类型 |
| 启动 | 加载 bridge | Bridgeless 懒加载 |
| 性能 | 基线 | 2-5x 提升 |

**最佳实践列表**：
- 0.76+ 默认 New Architecture——新项目无需配置
- 旧项目升级：用 `react-native-upgrade-helper` 配合 codegen
- 自定义 Native 模块：用 TS spec 写接口，codegen 自动生成 3 端绑定
- Fabric 强制同步——避免"读 DOM 然后 setState"的连续调用
- Bridgeless 模式（0.76+）移除了 Old Bridge 残留——启动更快

### 模式 5：Old vs New Architecture 演进时间线

**问题场景**：理解 RN 必须知道"老架构"在做什么——很多文档、博客、stackoverflow 答案都是基于 Old Architecture。新人按老教程配环境会一脸懵。

**解决方案代码**：

```yaml
# Old Architecture（0.74-）
- 通信：Bridge 异步消息队列
- 渲染：异步 commit，3 帧
- 模块：NativeModules（async + JSON 序列化）
- 启动：bridge 加载（~200ms）

# New Architecture（0.76+）
- 通信：JSI 同步
- 渲染：Fabric 同步 commit，1 帧
- 模块：TurboModules + Codegen
- 启动：Bridgeless 懒加载（<50ms）

# 关键里程碑：
# 2018 v0.57 AsyncStorage 拆分
# 2019 v0.60 Fast Refresh
# 2020 v0.64 Hermes 默认（替代 JSC）
# 2022 v0.69 New Arch 实验
# 2023 v0.71 TypeScript 默认
# 2024 v0.76 New Arch 默认
# 2025 Bridgeless GA
```

**关键参数表**：

| 版本 | 关键变化 | 推荐度 |
|---|---|---|
| 0.60-0.69 | 经典 Old Arch | 维护旧项目 |
| 0.70-0.75 | 过渡（可开启 New Arch） | 升级中 |
| 0.76+ | New Arch 默认 | 新项目首选 |

**最佳实践列表**：
- 新项目一律 0.76+——默认 New Arch
- 旧项目升级路径：升级依赖 → 开 New Arch 标志 → 测试 → 删 fallback
- 第三方库兼容：检查 `peerDependencies.react-native >= 0.76`
- 性能调优前先升级——New Arch 自带 2-5x 提升
- Codegen 失败时看 iOS / Android 编译日志——TS 签名错误

---

## 二、JS-Native 桥与 JSI 层

### 模式 6：JSI 共享 C++ 运行时

**问题场景**：Old Bridge 通过消息队列传递"调用请求"和"返回值"——每次都 JSON 序列化/反序列化/排队。对 60fps 动画/复杂手势，序列化开销明显（1-2ms/call）。

**解决方案代码**：

```cpp
// jsi/jsi.h
namespace facebook::jsi {
class Runtime {
public:
  // JS 调 Native
  virtual Value call(const Function& fn, const Value* args, size_t count) = 0;

  // Native 调 JS
  virtual Function globalThisGetProperty(const std::string& name) = 0;

  // 共享对象（避免序列化）
  virtual Object createObject() = 0;
  virtual Value getProperty(const Object& obj, const std::string& name) = 0;

  // 共享数组（高效传输）
  virtual ArrayBuffer createArrayBuffer(std::shared_ptr<MutableBuffer> buffer) = 0;
};

// 共享 ArrayBuffer：JS 端直接持有 Native 分配的内存
auto buffer = runtime.createArrayBuffer(sharedMutableBuffer);
// JS 端
const view = new Uint8Array(buffer);  // 0 拷贝访问 Native 内存
nativeProcess(view);  // 直接传给 Native 处理
```

**关键参数表**：

| 操作 | Old Bridge | JSI |
|---|---|---|
| 调用一次 Native | JSON 编码 + 排队 + 序列化返回 | 直接 C++ 函数调用 |
| 共享大数组 | 拷贝（深） | 共享指针（0 拷贝） |
| 错误处理 | 异步 reject | 同步抛 C++ 异常 |
| 类型检查 | 字符串协议 | C++ 强类型 |

**最佳实践列表**：
- 大数据传递（图像 buffer、音频）用 ArrayBuffer 共享——避免拷贝
- 同步调用需要小心——避免在主线程执行长操作
- JSI 是 C++ 层——JS 端不直接感知，但能感受到"快"
- TypeScript spec 通过 Codegen 编译为 C++ 类——类型安全

### 模式 7：TurboModules 协议与 Codegen

**问题场景**：Old Bridge 模块用字符串协议（`NativeModules.Camera.takePicture()`），类型靠手写 JSDoc，编译期无校验。运行时拼错方法名 = undefined error。

**解决方案代码**：

```typescript
// 1. 用 TS spec 定义模块
// src/specs/NativeCamera.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  +getConstants: () => {| resolution: string |};
  +takePicture: (options: Object) => Promise<string>;
  +startRecording: () => void;
  +stopRecording: () => Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('CameraModule');

// 2. 编译时 codegen 生成：
// iOS: build/generated/ios/NativeCameraSpec.h
//   JSI_EXTERN_METHOD(ObjCTurboModule, takePicture, ...)
//
// Android: build/generated/source/codegen/java/.../NativeCameraSpec.java
//   public abstract void takePicture(...)
//
// 3. Native 端实现
// iOS:
@interface RCTCameraModule : NSObject <NativeCameraSpec>
@end
@implementation RCTCameraModule
RCT_EXPORT_MODULE()  // 注册到 TurboModuleRegistry

- (void)takePicture:(JS::NativeCamera::Options &)options
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject {
  // 实际拍照
  resolve(base64);
}
@end

// 4. JS 端调用：编译期检查，运行时 0 序列化
import Camera from './specs/NativeCamera';
const photo = await Camera.takePicture({ quality: 0.8 });
// ↑ 类型错误直接 TS 编译失败，无需运行
```

**关键参数表**：

| 维度 | Old (`NativeModules`) | New (TurboModule) |
|---|---|---|
| 类型检查 | 运行时（undefined） | 编译期（TypeScript） |
| 调用方式 | 异步 + JSON 序列化 | JSI 同步/异步 |
| 代码生成 | 无 | Codegen 自动 |
| 启动开销 | 预加载所有模块 | 懒加载 |

**最佳实践列表**：
- 自定义 Native 模块一定要用 TurboModule spec + Codegen——告别手写类型
- 同步方法（`startRecording`）只用于"立即执行"——异步用 Promise
- 大数据返回（图像、音频）用 ArrayBuffer——避免 Base64 编码
- TurboModule 可与"现有" Native Module 共存——逐步迁移

### 模式 8：Bridgeless 模式（启动优化）

**问题场景**：传统 RN 启动要加载 Bridge（~200ms），初始化所有 NativeModules（即使不用），并把 JS 引擎绑定到 Bridge。Bridgeless 模式把 Bridge 砍掉——JSI 直接连 C++ 运行时，启动 < 50ms。

**解决方案代码**：

```objc
// Old Bridge 启动
[Bridge start];  // 创建 RCTBridge 实例，加载所有 NativeModules
// JS 引擎通过 RCTBridge 调 Native

// Bridgeless 启动（RCTHost）
RCTHost *host = [[RCTHost alloc] initWithBundleURL:url
                                       hostDelegate:nil
                                  turboModuleManager:tm
                                         bridgeManager:nil
                                    // ... JSI 运行时
];
// 启动期不加载任何 NativeModule
// JS 首次访问模块时，TurboModuleManager 懒加载

// JS 端
import { TurboModuleRegistry } from 'react-native';
const Camera = TurboModuleRegistry.get('CameraModule');
// 第一次访问时，触发 Native 端初始化
```

**关键参数表**：

| 维度 | Old Bridge | Bridgeless |
|---|---|---|
| 启动时间 | 200-300ms | < 50ms |
| 内存占用 | 高（所有模块预加载） | 低（懒加载） |
| 兼容性 | 兼容 Old + New | 仅 New Architecture |
| 调试 | RCTLog / Chrome DevTools | Hermes Inspector / Flipper |

**最佳实践列表**：
- 0.76+ 默认 Bridgeless——无需配置
- 自定义 Native 模块要测"懒加载"——确保首次访问时才初始化
- 启动期禁用"重模块"——避免阻塞 JS 引擎
- Hermes + Bridgeless 组合是 0.76+ 推荐——性能最优
- Flipper 已弃用——改用 React Native DevTools（0.74+）

### 模式 9：Hermes 引擎（替代 JSC）

**问题场景**：iOS/Android 自带 JavaScriptCore（JSC）——但 JSC 启动慢（100ms+）、无 AOT 优化、占用内存高。Hermes 是 Meta 自研的 JS 引擎，专为 RN 优化。

**解决方案代码**：

```bash
# 启用 Hermes
# ios/Podfile
use_react_native!(
  :hermes_enabled => true,  # 0.70+ 默认 true
)

# android/gradle.properties
hermesEnabled=true  # 默认 true
```

```js
// 启动流程
// Old JSC: JSC 加载 JS bundle → parse → compile → run (~300ms)
// Hermes: 预编译为字节码 → 加载字节码 → 启动 (~50ms)

// Hermes 字节码
// 编译：./hermes -emit-binary -out app.hbc main.jsbundle
// 运行时直接加载 .hbc，跳过 parse
```

**关键参数表**：

| 指标 | JSC | Hermes |
|---|---|---|
| 启动 | 100-300ms | 30-80ms |
| 内存 | 较高 | 较低（30% 减少） |
| AOT | ❌ | ✅（预编译字节码） |
| 兼容性 | 老库兼容 | 0.7+ 引擎特性 |
| 调试 | Safari Inspector | Chrome DevTools / RN DevTools |

**最佳实践列表**：
- Hermes 0.70+ 默认——新项目自动启用
- 预编译字节码（CI 阶段）——发布版 bundle 直接是 .hbc
- Hermes Inspector（Flipper / DevTools）调试——比 JSC 调试体验更好
- 反模式：动态 eval（`eval` / `new Function`）——Hermes 禁用
- 性能敏感模块用 Hermes（市场普遍）——JSC 已不推荐

### 模式 10：异步调度与 Microtask Queue

**问题场景**：JS 是单线程，渲染、用户输入、网络回调都在同一队列。如果一个 setState 触发 100ms 同步渲染，UI 卡顿。RN 需协调 JS / Native / 渲染三层调度。

**解决方案代码**：

```js
// 1. requestAnimationFrame：与屏幕刷新同步
function onScroll(e) {
  requestAnimationFrame(() => {
    setScrollY(e.nativeEvent.contentOffset.y);
  });
}

// 2. InteractionManager：长任务在交互完成后才跑
import { InteractionManager } from 'react-native';

useEffect(() => {
  const handle = InteractionManager.runAfterInteractions(() => {
    // 等所有动画/scroll 完成
    expensiveCalculation();
  });
  return () => handle.cancel();
}, []);

// 3. setImmediate / setTimeout(fn, 0)：让出当前任务
process.nextTick(() => {
  // 比 setTimeout(fn, 0) 快
});

// 4. 优先级 Promise：与 RN 内部调度器配合
schedulePriorityCallback('user-visible', () => {
  // 业务关键代码
});
```

**关键参数表**：

| 调度 API | 用途 | 时机 |
|---|---|---|
| `requestAnimationFrame` | 动画 | 下一帧 |
| `setImmediate(fn)` | 让出当前任务 | 当前 microtask 队列空后 |
| `setTimeout(fn, 0)` | 延迟到下一个 task | 下一个宏任务 |
| `InteractionManager.runAfterInteractions` | 交互后执行 | 所有动画/scroll 完成 |
| `Promise.then` | 微任务 | 当前 task 末尾 |

**最佳实践列表**：
- 滚动/动画用 `requestAnimationFrame` 包装——保证 60fps
- 初始化重计算（解析大 JSON）用 `InteractionManager.runAfterInteractions`
- 不在 render 函数里执行同步重计算——用 `useMemo`
- 业务关键路径用 `schedulePriorityCallback`——避免被低优任务阻塞
- 反模式：`setTimeout(fn, 0)` 替代 requestAnimationFrame——会丢帧

---

## 三、UI 抽象与 Fabric 渲染管线

### 模式 11：Shadow Tree 与 View Flattening

**问题场景**：JS 端的 View 树（带 View/Text/Image 嵌套）映射为 Native 树时，会产生"深嵌套 + 透明 View"——影响 GPU 渲染和 hit-test。Fabric 引入 Shadow Tree（中间表示）+ View Flattening 优化。

**解决方案代码**：

```cpp
// ReactCommon/fabric/mounting/ShadowNode.h
class ShadowNode {
public:
  // 描述：组件类型 + props + 状态
  ComponentName getComponentName() const;
  SharedShadowNodeList getChildren() const;

  // 克隆（不可变，新 props）
  ShadowNode(const ShadowNode& src, const Props& newProps);
};

// ReactCommon/fabric/mounting/ShadowTree.cpp
class ShadowTree {
public:
  void commit(ShadowNodeUnsharedList const& newRoots) {
    // 计算 patch（diff 旧 ShadowTree → 新 ShadowTree）
    auto mutations = calculateMutations(roots_, newRoots);
    // 应用到 Native tree
    mountSurface_.mount(mutations);
  }
};

// View Flattening：合并"无样式 View"到父
class ViewComponentName {
  static bool canBeFlattened(Props props) {
    return !props.backgroundColor &&
           !props.borderColor &&
           !props.shadows &&
           !props.transforms;
  }
};
```

**关键参数表**：

| 概念 | 描述 | 用途 |
|---|---|---|
| Shadow Node | 不可变、跨平台 UI 表示 | 渲染协议的"事实" |
| Shadow Tree | 整棵 UI 树的快照 | 一次 commit 单位 |
| View Flattening | 合并无样式 View | 减少 Native 树深度 |
| Yoga Layout | Flexbox 引擎 | 跨平台布局 |
| Mounting | Shadow Tree → Native Tree | 最终 DOM 挂载 |

**最佳实践列表**：
- 避免深层嵌套（< 20 层）——超过时考虑拆分组件
- 无样式 `<View>` 会被自动 Flatten——加 `collapsable={false}` 阻止
- 用 `console.log(inspectNative)`（Hermes）看 Native 树实际深度
- 性能调优：用 React DevTools Profiler 看 Shadow Tree diff

### 模式 12：Yoga 布局引擎（C++ Flexbox）

**问题场景**：iOS 用 Auto Layout（Constraint-based），Android 用 ViewGroup（measure/layout pass）。两套布局逻辑不一致，导致"同一代码不同渲染"。Yoga 把 Flexbox 标准化，用 C++ 实现，跨平台一致。

**解决方案代码**：

```cpp
// ReactCommon/yoga/Yoga.h
class YGNode {
public:
  void setFlexDirection(YGFlexDirection direction);
  void setJustifyContent(YGJustifyContent justify);
  void setAlignItems(YGAlign align);

  // 布局计算
  void calculateLayout(float availableWidth, float availableHeight, YGDirection direction);
  float getComputedWidth() const;
  float getComputedHeight() const;
};

// 实际布局流程（Fabric）
// 1. JS 端 setState → ShadowTree 更新
// 2. Yoga 计算所有节点 width/height
// 3. Native 端用 measure/layout 一次性应用
// 4. commit 到屏幕
```

**关键参数表**：

| Yoga 属性 | 含义 | 例子 |
|---|---|---|
| `flex` | flex-grow | `flex: 1` 充满 |
| `flexDirection` | 主轴方向 | `row` / `column` |
| `justifyContent` | 主轴对齐 | `space-between` |
| `alignItems` | 交叉轴对齐 | `center` |
| `padding` / `margin` | 内/外边距 | `padding: 10` |

**最佳实践列表**：
- Flexbox 是 RN 的"通用布局"——不要尝试 Auto Layout 思维
- `flex: 1` 在父级 column 布局中 = 占满剩余空间
- 性能：嵌套 Flex 容器会增加布局计算时间——避免过深
- 反模式：`<View style={{ width: screenWidth }}>`——用 `Dimensions.get('window')` 或 flex

### 模式 13：Fabric 渲染管线（同步 commit）

**问题场景**：Old Architecture 渲染是异步的——JS 计算 → bridge 传递 → Native 异步 mount，3 帧才能完成更新。复杂动画/手势下明显卡顿。Fabric 引入同步管线——一次 commit 一个 frame。

**解决方案代码**：

```cpp
// ReactCommon/fabric/mounting/ReactFabricMountingManager.cpp
class ReactFabricMountingManager {
public:
  void mount(ShadowNode::Unshared rootNode) {
    // 1. 计算 layout（同步，Yoga）
    measureLayout(rootNode);
    // 2. 创建/更新 Native 节点（同步）
    createOrUpdateNativeNodes(rootNode);
    // 3. 提交到屏幕
    commitToScreen();
  }
};

// 旧架构对比（Old）
// JS: render → 序列化 → 消息队列
// Native: 反序列化 → 异步 mount → 多 frame 完成
// 新架构（Fabric）:
// JS: render → ShadowTree 同步更新
// Native: measure → mount → 1 frame 完成
```

**关键参数表**：

| 阶段 | Old | New (Fabric) |
|---|---|---|
| JS render | 同步 | 同步 |
| bridge 序列化 | 必选 | 跳过 |
| Native mount | 异步（多 frame） | 同步（1 frame） |
| 整体延迟 | 3 帧 | 1 帧 |
| 60fps 动画 | 可能掉帧 | 稳定 |

**最佳实践列表**：
- 性能敏感（动画/手势）必须用 Fabric 渲染器
- 避免在 render 函数内做重计算——Fabric 同步执行会阻塞
- Profiler 工具看"哪一帧 mount"——识别瓶颈
- 反模式：直接修改 Native UI（`findNodeHandle` 找节点改 props）——绕过 React 树

### 模式 14：原生模块懒加载（TurboModule 启动优化）

**问题场景**：应用启动时 RN 预加载所有 NativeModules（即使不用）——如相机/相册/位置/通知，启动慢。TurboModuleManager 懒加载——首次访问才初始化。

**解决方案代码**：

```objc
// iOS: TurboModuleManager.mm
- (id)getModuleInstanceFromClass:(Class)moduleClass {
  if ([moduleClass respondsToSelector:@selector(init)]) {
    // 第一次访问才创建
    id instance = [[moduleClass alloc] init];
    [self registerModule:instance];
    return instance;
  }
  // 已有实例
  return [self.modules objectForKey:NSStringFromClass(moduleClass)];
}

- (id)provideModuleForName:(NSString *)name {
  // JS 调 Camera.takePicture → 首次 getModule → init
  if (![self.modules objectForKey:name]) {
    Class cls = [self getModuleClassForName:name];
    return [self getModuleInstanceFromClass:cls];
  }
  return self.modules[name];
}
```

**关键参数表**：

| 启动指标 | 预加载 | 懒加载（TurboModule） |
|---|---|---|
| 首屏时间 | 慢（所有模块） | 快（只 JS bundle） |
| 内存 | 高 | 低 |
| 首次访问延迟 | 0 | 几十 ms（一次） |
| 总体验 | 启动慢，运行快 | 启动快，运行略慢 |

**最佳实践列表**：
- 关键路径模块（首页需要的）显式预加载
- 重模块（相机、地图、AR）懒加载——首屏更快
- TurboModule + Bridgeless 组合是 0.76+ 默认——无需手写懒加载逻辑
- 用 `TurboModuleRegistry.get`（非 `getEnforcing`）允许模块不存在

### 模式 15：React Native 与原生 UI 组件互通

**问题场景**：App 已有原生 iOS/Android 组件（如自定义相机、地图、AR 视图），RN 应用想嵌入。需要在 Native 端"暴露"组件给 JS，并桥接 props/events。

**解决方案代码**：

```objc
// iOS: 自定义 Fabric 组件
// RCTCameraComponentView.h
@interface RCTCameraComponentView : RCTViewComponentView
@end

// RCTCameraComponentView.mm
@implementation RCTCameraComponentView {
  AVCaptureSession* _session;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<RCTCameraComponentViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    _session = [[AVCaptureSession alloc] init];
    // 初始化相机
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  [super updateProps:props oldProps:oldProps];
  // props 变化时更新
  if (props->resolution != oldProps->resolution) {
    [self configureSession:props->resolution];
  }
}

@end

// JS 端
<CameraComponent resolution="1080p" onPictureTaken={(e) => console.log(e.nativeEvent.uri)} />
```

**关键参数表**：

| 自定义组件层 | 抽象 |
|---|---|
| ShadowNode (C++) | 跨平台 UI 描述 |
| ComponentDescriptor (C++) | 注册组件类 |
| ComponentView (ObjC/Java) | 平台具体视图 |
| Codegen (TS) | JS 端 prop/event 类型 |
| JS 组件包装 | JSX 标签使用 |

**最佳实践列表**：
- 自定义 Native 组件用 Fabric ComponentView 模式——同步更新
- 复杂组件用 C++ 写 ShadowNode——iOS/Android 共享
- 事件用 `RCTBubblingEventBlock` 注册——JS 端 onXxx 接收
- Codegen 自动生成 TS 类型——无需手写 prop 校验
- 第三方原生组件库（react-native-maps、react-native-camera）已迁移到 Fabric

---

## 四、工程实践与 New Architecture

### 模式 16：Metro Bundler 与 HMR（Fast Refresh）

**问题场景**：RN 开发时改代码要重新加载 bundle（~3-5s），反复调试时等待时间长。Fast Refresh（基于 HMR）只重载修改的模块——保持组件 state，重载时间 < 1s。

**解决方案代码**：

```js
// metro.config.js
module.exports = {
  resolver: { sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json'] },
  transformer: { getTransformOptions: async () => ({ transform: { experimentalImportSupport: false } }) },
};

// 启动
// npx react-native start  → 启动 Metro
// npx react-native run-ios  → 启动 App + 连 Metro

// Fast Refresh 触发条件：
// 1. 编辑 React 组件文件 → 局部重载（保留 state）
// 2. 编辑非组件文件 → 全局重载（清空 state）
// 3. 编辑原生代码（ObjC/Java）→ 重新编译 + 重启 App
```

**关键参数表**：

| 模式 | 重载范围 | state 保留 | 速度 |
|---|---|---|---|
| Live Reload（旧） | 全局 | ❌ 清空 | 3-5s |
| Hot Reload（旧） | 局部 | ✅ | 1-2s |
| Fast Refresh（新） | 局部（带边界） | ✅（除非改 hooks 顺序） | < 1s |

**最佳实践列表**：
- 0.60+ 默认 Fast Refresh——无需配置
- Hook 顺序变化时 Fast Refresh 会全重载（避免崩溃）
- 改 config 文件（metro.config.js、babel.config.js）需重启 Metro
- 生产环境关闭 Fast Refresh——避免 HMR 客户端代码入 bundle
- 调试复杂 state 时用 `__DEV__` 守卫——只在 dev 启用 console

### 模式 17：TypeScript 默认（0.71+）

**问题场景**：JS 动态类型导致 RN 错误多（prop 拼错、类型不匹配）。0.71+ 默认启用 TypeScript——App 入口 .tsx，编译期拦截。

**解决方案代码**：

```tsx
// App.tsx
import React from 'react';
import { SafeAreaView, Text, View } from 'react-native';

interface Props {
  name: string;
  age: number;
}

export default function App({ name, age }: Props) {
  return (
    <SafeAreaView>
      <Text>Hello {name}, age {age}</Text>
    </SafeAreaView>
  );
}

// tsconfig.json（0.71+ 默认生成）
{
  "extends": "@react-native/typescript-config/tsconfig.json",
  "compilerOptions": { "strict": true }
}
```

**关键参数表**：

| 优势 | 体现 |
|---|---|
| prop 校验 | `<App name={123} />` 编译失败 |
| 导航类型 | `useNavigation<NativeStackNavigationProp<...>>()` |
| Redux 状态 | `useSelector((state: RootState) => state.user)` |
| Codegen 类型 | TS spec → iOS/Android 自动生成 |

**最佳实践列表**：
- 0.71+ 新项目默认 TS——旧项目可手动迁移
- 严格模式 `strict: true`——开 noImplicitAny / strictNullChecks
- 类型导入用 `import type`——避免运行时开销
- 导航库用 typed navigator——避免 route.params 类型为 any

### 模式 18：Expo 集成（生产级工作流）

**问题场景**：裸 RN 项目需要手动配置 Xcode/Android Studio/Native modules，初始成本高。Expo 提供：(1) 一键初始化；(2) EAS Build 云编译；(3) OTA Update 热更新；(4) 一套官方模块（expo-camera、expo-notifications 等）。

**解决方案代码**：

```bash
# Expo CLI
npx create-expo-app my-app
cd my-app

# 本地运行
npx expo start

# OTA 更新（升级 JS bundle，无需重装 App）
npx expo publish

# 云构建 iOS/Android
eas build --platform ios
eas build --platform android

# 配置
# app.json
{
  "expo": {
    "name": "MyApp",
    "slug": "my-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "ios": { "bundleIdentifier": "com.example.myapp" },
    "android": { "package": "com.example.myapp" },
    "plugins": ["expo-camera", "expo-notifications"]
  }
}
```

**关键参数表**：

| 特性 | 裸 RN | Expo |
|---|---|---|
| 初始化 | 手动 Xcode/Android Studio | `npx create-expo-app` |
| Native 模块 | 手动 link | `expo install` 自动 |
| 构建 | 本地 Xcode / Gradle | EAS Build（云） |
| OTA | 第三方（CodePush） | `expo publish` |
| 模块 | 社区库（兼容问题） | 官方套件（expo-camera 等） |

**最佳实践列表**：
- 0.81+ 推 "Expo for CLIs"——把 Expo 工具链用于裸 RN 项目
- EAS Build 免维护构建机——CI/CD 集成
- OTA Update 适合"业务逻辑"——不适合"重大结构性升级"
- 选用 Expo SDK 模块优先于第三方 RN 库——兼容性最好
- Expo 50+ 全面支持 New Architecture

### 模式 19：性能优化清单

**问题场景**：RN 性能问题有典型模式：JS 线程繁忙、Native 线程繁忙、bridge/JSI 通信频繁、组件频繁 re-render。需要"按层排查"的方法。

**解决方案代码**：

```jsx
// 1. 列表性能：FlatList 虚拟化
<FlatList
  data={items}
  renderItem={({ item }) => <Row item={item} />}
  keyExtractor={item => item.id}
  getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}  // 已知行高
  initialNumToRender={10}  // 首屏渲染数量
  windowSize={5}           // 视窗大小
  removeClippedSubviews    // 离屏 View 移除
/>

// 2. 动画：useNativeDriver 避免 JS 桥
const translateX = useRef(new Animated.Value(0)).current;
Animated.timing(translateX, {
  toValue: 100,
  duration: 300,
  useNativeDriver: true,  // 动画在 Native 线程跑
}).start();

// 3. memo 跳过 re-render
const Row = React.memo(function Row({ item, onPress }) {
  return <Pressable onPress={() => onPress(item.id)}><Text>{item.name}</Text></Pressable>;
}, (prev, next) => prev.item === next.item && prev.onPress === next.onPress);

// 4. Hermes 字节码 + New Architecture
// 0.76+ 默认开启
```

**关键参数表**：

| 优化手段 | 适用 | 提升 |
|---|---|---|
| `FlatList` + `getItemLayout` | 列表 | 5-10x |
| `useNativeDriver` 动画 | 动画 | 10x（不掉帧） |
| `React.memo` | 纯组件 | 减少 80% re-render |
| Hermes 引擎 | 全局 | 启动 -50% |
| Fabric 渲染 | 复杂 UI | 1-2x 帧率 |
| Codegen TurboModule | 自定义 Native | 10x 调用速度 |

**最佳实践列表**：
- 用 React DevTools Profiler 找"卡顿组件"——不靠猜
- 列表项必须 memo + 稳定 key——避免不必要 re-render
- 动画一定用 useNativeDriver：true——JS 线程繁忙时也不抖
- 大图用 `expo-image` 或 `react-native-fast-image`——本地缓存 + 并发
- 性能监控：`react-native-performance` 上报到 Sentry
- 避免：内联函数（`onPress={() => do(item)}`）——每次 render 重建引用

### 模式 20：发布与 CI/CD（EAS）

**问题场景**：RN 编译 iOS 需要 macOS + Xcode + 证书 + 描述文件；Android 需要 JDK + Android SDK + 签名。CI 搭建维护成本高。EAS Build 把这些托管——开发者 `git push` → EAS 云编译 → 产出 IPA/APK。

**解决方案代码**：

```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录
eas login

# 配置
eas.json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "production": {}
  },
  "submit": {
    "production": {
      "ios": { "ascAppId": "123456789" },
      "android": { "serviceAccountKeyPath": "..." }
    }
  }
}

# 触发构建
eas build --platform ios --profile production

# 提交到 App Store / Google Play
eas submit --platform ios --latest

# OTA 热更新（仅 JS bundle，不重装 App）
eas update --branch production
```

**关键参数表**：

| EAS Build 模式 | 用途 | 输出 |
|---|---|---|
| `development` | dev 客户端（含 Metro） | 内部分发 |
| `preview` | 内测 | TestFlight / 内部 Track |
| `production` | 正式发布 | App Store / Google Play |

| 提交方式 | 适用 |
|---|---|
| `eas submit` | 自动提交 App Store / Play Console |
| `eas build --auto-submit` | 构建完自动提交 |
| `eas update` | 仅 JS 热更新 |

**最佳实践列表**：
- EAS Build 是 0.81+ 官方推荐——告别手动 Xcode/CI
- 用 `--profile` 区分 dev / preview / production——避免配错
- EAS Update 适合"非破坏性"更新——重大版本用 Build
- 敏感信息（API key）用 EAS Secrets——不写入 source
- 配合 GitHub Actions：push → EAS Build → TestFlight 自动分发

---

## 附：仓库元信息

- **路径**：`G:\实战案例\GitHub顶尖项目\react-native\`
- **大小**：约 500MB（含 git 历史）
- **总文件**：~25000
- **核心包**：`react-native`（主包）/ `react-native/Libraries`（JS）/ `ReactCommon`（C++ 核心）/ `ReactAndroid`（Java + C++）/ `ReactApple`（ObjC++）
- **锁定 commit**：v0.76+（New Architecture 默认）
- **学习入口**：先读 `Libraries/ReactNative/AppRegistry.js` → `Libraries/Pressable/Pressable.js` → `ReactCommon/fabric/mounting/ShadowNode.h` → `ReactCommon/jsi/jsi.h` → `ReactCommon/yoga/Yoga.h` → `packages/gradle-plugin` / `packages/apple`

## 一句话总结

React Native 用"JS 描述 UI + Native 渲染"重新定义移动开发，把 React 的声明式范式延伸到 iOS/Android。核心洞察：用 JSI 替代 Old Bridge 的 JSON 序列化，让 TurboModule 同步调用、Fabric 同步渲染，跨平台 UI 树（C++ ShadowNode）作为协议事实；用 Yoga 标准化 Flexbox 布局，让 iOS/Android 共享同一份 C++ 布局逻辑；0.76+ 默认开启 New Architecture（Fabric + TurboModules + Codegen + Hermes + Bridgeless），把启动时间从 300ms 降到 50ms。
