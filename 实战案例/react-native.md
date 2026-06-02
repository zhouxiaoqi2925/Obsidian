# react-native - 用 React 范式写 iOS/Android 真原生 UI

**GitHub**: facebook/react-native
**Star**: 119k+
**语言**: JavaScript / C++ / Objective-C++ / Java
**主题**: 移动端跨平台 / JS-Native 桥 / New Architecture
**适用场景**: iOS / Android 双端原生应用，团队 JS 技术栈复用

---

## 第一段：基础范式

### 模式 1：JS 组件映射到原生 View

**问题场景**：写两套代码（Swift + Kotlin）成本高；H5 / WebView 体验差（动画卡、权限受限）；跨平台框架如何在"开发效率"和"原生性能"间取舍？

**解决方案**：保留 React 范式（组件 + state + JSX），但 `<View>` / `<Text>` / `<Image>` 不渲染到 DOM，而是通过桥接层映射成 iOS 的 `UIView` / `UITextView` / `UIImageView`、Android 的 `ViewGroup` / `TextView` / `ImageView`。

**关键参数**：
- `<View>` → iOS UIView / Android ViewGroup
- `<Text>` → iOS UITextView / Android TextView
- `<Image>` → iOS UIImageView / Android ImageView
- YOGA 引擎在 C++ 端跑 Flexbox layout

**最佳实践**：RN 不是 webview，每个组件都是真原生 View，性能接近原生；不要把 web 组件库（用 `document` / `window`）直接搬过来。

### 模式 2：AppRegistry 注册组件

**问题场景**：Native 端（iOS AppDelegate / Android MainActivity）需要知道"启动哪个 JS 组件"，JS 端多个应用如何区分？

**解决方案**：`AppRegistry.registerComponent('AppName', () => App)` 把根组件注册到中央注册表，Native 端通过 `appKey: 'AppName'` 找到对应组件并渲染。`runApplication` 真正启动。

**关键参数**：
- 注册：JS 端 `registerComponent(name, factory)`
- Native 端：传入 `moduleName` / `appKey` 参数
- 多应用支持：同一 bundle 注册多个根组件
- 关键文件：`Libraries/AppRegistry/AppRegistry.js`

**最佳实践**：应用名作为常量集中管理；测试环境可注册不同根组件做集成测试。

### 模式 3：JS-Native 通信

**问题场景**：JS 跑在 Hermes 引擎（独立线程），Native 跑在主线程，二者数据类型不同（JS Object vs Java/ObjC Object），如何互调？

**解决方案**：
1. **Old Bridge**：JSON 序列化 + 异步消息队列
2. **New JSI**：C++ 持有 JS runtime 引用 + 函数指针直接互调，0 序列化、0 跨线程

**关键参数**：
- Bridge：JSON 字符串 + 多线程 queue
- JSI：`jsi::Runtime` C++ 类 + C++ ↔ JS 直接调用
- TurboModules：懒加载的 Native Module，按需启动
- Codegen：TypeScript spec 自动生成双端接口

**最佳实践**：新项目必须启用 New Architecture（0.76+ 默认），老项目按升级路径迁移；自定义 Native Module 必走 TurboModule 规范。

### 模式 4：StyleSheet 与 Flexbox

**问题场景**：iOS 用 Auto Layout、Android 用 ConstraintLayout，写法各异；CSS 子集（flex）是最熟悉的布局语法。

**解决方案**：`StyleSheet.create({...})` 提供类似 CSS 的 API，但内部走 YOGA（Facebook 自研 C++ Flexbox 引擎）做跨平台 layout 计算。`flex: 1` / `justifyContent` / `alignItems` 都是 Flexbox 概念。

**关键参数**：
- 主轴/交叉轴：默认 column
- flex: 子项占主轴剩余空间比例
- StyleSheet.create 返回 ID 引用
- 不支持 CSS Grid / float / position: absolute 复杂场景

**最佳实践**：所有样式走 `StyleSheet.create`，不要在 render 里写内联对象（每次 render 新对象，触发额外 diff）。

### 模式 5：Platform 模块处理平台差异

**问题场景**：同一段 JS 代码需要根据 iOS/Android 走不同实现（API 差异、UI 差异、权限差异），又不想拆两个文件。

**解决方案**：`Platform.OS` 是 `'ios' | 'android' | 'web' | 'macos' | 'windows'`，`Platform.select({ ios: ..., android: ..., default: ... })` 根据平台选不同值。`Platform.Version` 拿系统版本。

**关键参数**：
- `Platform.OS`：平台名
- `Platform.select({...})`：值选择器
- `Platform.Version`：Android API level / iOS version
- 文件后缀约定：`.ios.js` / `.android.js` 自动按平台 import

**最佳实践**：能用 `Platform.select` 就不拆文件；文件后缀约定用于"整段逻辑不同"的场景（如 iOS 导航 vs Android 抽屉）。

---

## 第二段：扩展范式

### 模式 6：List 性能优化（FlatList）

**问题场景**：用 `map()` + `<View>` 渲染 1000 行列表，内存爆、滚动卡、首次渲染慢。

**解决方案**：`FlatList` 用虚拟化（virtualization）：只渲染屏幕内可见的行 + 少量 buffer（`windowSize`），滚动时回收离屏组件。`keyExtractor` 提供稳定 key，`getItemLayout` 跳过测量。

**关键参数**：
- `data`：数据源数组
- `renderItem`：每行渲染函数
- `keyExtractor`：稳定 key 函数
- `getItemLayout`：跳过测量（已知固定高度时）
- `windowSize`：可视区倍数（默认 21）

**最佳实践**：必填 `keyExtractor`；固定行高时必填 `getItemLayout`（性能提升 10x）。

### 模式 7：动画系统（Animated / Reanimated）

**问题场景**：JS 线程繁忙时 `setState` 触发的动画会卡顿（掉帧到 10fps），尤其列表滚动期间。

**解决方案**：
- **Animated**（基础）：`useNativeDriver: true` 把动画声明序列化到 Native 端，由 Native UI 线程 60fps 跑
- **Reanimated 3**（高级）：worklet 机制让 JS 函数在 UI 线程同步执行，支持手势交互

**关键参数**：
- `Animated.Value` 驱动值
- `Animated.timing(value, { toValue, duration })` 渐变
- `useNativeDriver`：transform/opacity 走 UI 线程；layout 属性不支持
- Reanimated worklet：`'worklet'` 指令函数

**最佳实践**：transform/opacity 类动画必开 `useNativeDriver`；复杂手势/物理动画用 Reanimated。

### 模式 8：导航（React Navigation）

**问题场景**：RN 不带导航器；Native 端 iOS UINavigationController / Android Fragment 都不可用。

**解决方案**：社区方案 `react-navigation` 提供 stack / tab / drawer 三种导航器，用 JS 实现（不调 native），跨平台一致。支持 deep link、navigation lifecycle、`useNavigation` hook。

**关键参数**：
- Stack：iOS UINavigationController 等价
- Tab：底部 tab bar
- Drawer：侧边抽屉
- `createNativeStackNavigator`：iOS 用 UINavigationController / Android 用 Fragment，性能更好

**最佳实践**：简单 stack 用 native stack（性能好）；复杂自定义 tab 切换用 JS 版本（灵活）。

### 模式 9：状态管理（Zustand / Redux Toolkit）

**问题场景**：Context Provider 在 RN 里 re-render 范围广，性能差；Redux 经典模式样板代码多。

**解决方案**：
- **Zustand**：3 行代码一个 store，`create((set) => ({ count: 0, inc: () => set(s => ({ count: s.count + 1 })) }))`
- **Redux Toolkit**：`createSlice` + `createAsyncThunk` 大幅简化 Redux 样板
- **Jotai** / **Recoil**：原子化状态，适合细粒度订阅

**关键参数**：
- Zustand：selector 订阅细粒度
- RTK：createSlice 自动生成 actions + reducer
- 服务端状态用 TanStack Query（自动缓存、refetch、乐观更新）
- 本地状态用 useState / useReducer

**最佳实践**：默认 Zustand；大型团队 + 严格规范选 RTK；服务端状态永远不放在全局 store（用专门的 server-state 库）。

### 模式 10：调试工具（Flipper / React DevTools / LogBox）

**问题场景**：RN 跑在模拟器/真机，浏览器 DevTools 看不到；Network 请求、CSS layout、JS 报错怎么调试？

**解决方案**：
- **React DevTools**：独立桌面 app，inspect 组件树 / props / state
- **Flipper**（Meta 官方）：Network inspector、Layout inspector、Database inspector
- **LogBox**：JS 报错 + 警告浮窗（开发模式默认开启）
- **Hermes Debugger**：Chrome DevTools 协议

**关键参数**：
- React DevTools 通过 WebSocket 连接
- Flipper 需本地启动（Electron app）
- 生产模式关闭 LogBox
- Hermes 字节码调试（Source Map 映射）

**最佳实践**：开发期必装 React DevTools；性能问题用 Flipper 的 Layout Inspector 看视图层级。

---

## 第三段：进阶范式

### 模式 11：New Architecture（JSI + Fabric + TurboModules）

**问题场景**：老 Bridge 架构有 3 大瓶颈：① JSON 序列化慢 ② 启动时 bridge 初始化慢 ③ UI 命令走 bridge 阻塞 UI 线程。

**解决方案**：
- **JSI**（JavaScript Interface）：C++ 持有 JS runtime 引用，函数指针直接互调，0 序列化
- **Fabric**：新 UI 渲染器，同步 layout + concurrent rendering
- **TurboModules**：懒加载 Native Module，按需启动（启动加速 50%+）
- **Codegen**：TypeScript spec → 双端 stub 代码，消除手写

**关键参数**：
- JSI：`jsi::Runtime&` + `jsi::HostObject` 模式
- Fabric：同步 layout、concurrent reconciler
- TurboModules：`getModule(name, moduleProvider)` 懒加载
- Codegen：TypeScript interface → Java/ObjC++ stub

**最佳实践**：0.76+ 新建项目默认 New Arch（不用配置）；老项目按官方 migration guide 升级；自定义 Native Module 必须写 spec 文件（`NativeXxx.ts`）。

### 模式 12：Hermes JS 引擎

**问题场景**：JSC（JavaScriptCore）启动慢、内存占用大、对 RN 优化少。

**解决方案**：Hermes 是 Meta 自研 JS 引擎，专为 RN 优化：① 字节码预编译（AOT）启动加速 50% ② 体积小（apk 减小 1MB+）③ 内存占用低 ④ 优化 garbage collection 减少卡顿。

**关键参数**：
- 编译时把 JS 源码 → Hermes 字节码（`.hbc`）
- 字节码打包到 APK/IPA
- 启动：直接 load 字节码，0 解析
- v0.70+ 默认开启

**最佳实践**：开启 Hermes 是"无脑选项"（无明显缺点），仅在极少数性能敏感场景考虑回退 JSC。

### 模式 13：Codegen 自动化双端类型

**问题场景**：Native Module 必须在 iOS（ObjC++）和 Android（Java/Kotlin）各写一份接口，参数类型一一对应极易出错。

**解决方案**：Codegen 读 TypeScript spec 文件（`NativeXxx.ts`）→ 生成 iOS header + Android Java/Kotlin interface。运行时双端调用同一份 spec 保证类型一致。

**关键参数**：
- Spec 文件：`NativeAsyncStorage.ts` 导出 `Spec` 接口
- Codegen CLI：`npx react-native codegen`
- 生成：iOS `.h` 文件 + Android `TurboModule` 接口
- TurboModule 必须继承 codegen 生成的基类

**最佳实践**：所有自定义 Native Module 必走 codegen；spec 文件放在 `src/specs/` 目录集中管理。

### 模式 14：性能监控与 Profiling

**问题场景**：线上 app 性能问题（启动慢、列表卡顿、内存爆）如何定位？没有 web 的 Lighthouse。

**解决方案**：
- **Hermes Profiler**：火焰图看 JS 函数执行时间
- **Flipper Layout Inspector**：UI 层级 + 真实尺寸
- **Sentry / Bugsnag**：线上崩溃 + 性能监控
- **React Native Performance**（社区）：FP/FCP/TTI 等 web 指标移植
- **`__DEV__` 模式**：开启详细日志

**关键参数**：
- Hermes Profiler 输出 `.cpuprofile`（Chrome 格式）
- Flipper 看 `printElementAtPoint(x, y)` 命中元素
- Sentry 设置 `tracesSampleRate: 0.2`
- React DevTools Profiler 录制交互

**最佳实践**：性能问题先 Flipper 看 UI 层级（嵌套过深 = 渲染慢），再 Hermes Profiler 看 JS 函数。

### 模式 15：OTA 更新（CodePush / Expo Updates）

**问题场景**：发版后紧急修复 bug、要等 Apple/Google 审核（1-7 天）；JS 业务逻辑变更不需要重启 Native。

**解决方案**：OTA（Over-The-Air）服务把 JS bundle 推送到客户端，运行时下载 + 替换。CodePush（微软）/ Expo Updates / 自建 S3 + Expo Server SDK。

**关键参数**：
- CodePush：`code-push deploy` 发布版本
- 启动时检查更新 + 静默下载
- 强制更新：标记 `mandatory: true`
- Native 代码变更仍需走应用市场审核

**最佳实践**：JS 业务逻辑 100% 可 OTA；涉及权限/SDK 集成必须走 Native 发版；不要用 OTA 绕过应用市场审核（违反 Apple/Google 政策）。

---

## 第四段：实战范式

### 模式 16：项目初始化（Expo vs bare RN CLI）

**问题场景**：从零开始 RN 项目该选 Expo（零配置）还是 bare RN（完全控制）？何时需要 eject？

**解决方案**：
- **Expo Go**：零配置，扫码即跑，适合原型/学习/小型 app
- **Expo Dev Client / EAS Build**：仍用 Expo SDK 但构建自家二进制，适合商业 app
- **bare RN CLI**：完全控制 native code，适合需要改 native 源码或集成特殊 SDK

**关键参数**：
- Expo Go 不能用自定义 Native Module
- EAS Build 云端构建（告别本地 Xcode/Gradle）
- 何时 eject：需要自定义 native code（ffmpeg、自家 SDK）
- 推荐：默认用 Expo（managed workflow），需要时再 eject

**最佳实践**：90% 新项目用 Expo + EAS Build；只有 native 重度需求才用 bare RN。

### 模式 17：测试体系

**问题场景**：单元测试（Jest）+ 组件测试（RTL）+ E2E（Detox）+ 截图测试，多层覆盖如何选？

**解决方案**：
- **Jest**：纯函数/工具函数单元测试
- **React Native Testing Library**：组件渲染 + 交互
- **Detox**：E2E 测试（真机/模拟器）
- **Maestro / Appium**：更轻量 E2E 替代
- **react-native-snapshot-testing**：截图回归

**关键参数**：
- Jest 配 `@testing-library/react-native`
- Detox 配 iOS Simulator / Android Emulator
- Coverage 不追求 100%（UI 测试成本高）
- E2E 关键路径 5-10 个场景

**最佳实践**：Jest 覆盖 80% 业务逻辑；E2E 覆盖关键用户路径（登录/支付/上传）。

### 模式 18：CI/CD 流水线

**问题场景**：iOS / Android 双端构建配置差异大，PR 阶段如何快速验证？发版如何自动化？

**解决方案**：
- **GitHub Actions / CircleCI**：PR 跑 Jest + lint
- **Fastlane**：iOS 签名 + Android APK/AAB 构建 + 上传
- **EAS Build**：Expo 推荐，云端构建省本地依赖
- **CodePush**：JS bundle OTA 部署

**关键参数**：
- iOS：证书 + Provisioning Profile（Fastlane match 管理）
- Android：keystore + Play Console JSON key
- EAS Build 配置文件 `eas.json`
- 内部分发：TestFlight / Firebase App Distribution

**最佳实践**：CI 必跑 lint + typecheck + Jest；E2E 按需跑（耗时大）；发版走 Fastlane + EAS。

### 模式 19：内存与性能优化清单

**问题场景**：app 跑久了内存爆、列表滚动掉帧、启动慢，如何系统性优化？

**解决方案**：
1. **Hermes** 默认开启（已优化）
2. **FlatList** 虚拟化 + `keyExtractor` + `getItemLayout`
3. **图片**用 `react-native-fast-image`（SDWebImage/Glide 后端）
4. **动画**用 `useNativeDriver: true`
5. **避免** inline function（每次 render 新闭包）
6. **大列表**考虑 `SectionList` 或分页加载
7. **常驻计时器**用 `BackgroundTimer`

**关键参数**：
- 内存：iOS `show me the memory` / Android `adb shell dumpsys meminfo`
- 帧率：iOS Instruments / Android GPU Profiler
- 启动时间：`react-native-startup-time` 包
- 包体积：iOS ipa size / Android apk analyzer

**最佳实践**：90% 性能问题来自"列表没虚拟化 + 图片没优化 + 动画没走 native driver"。

### 模式 20：升级到 React Native 0.76+ 路径

**问题场景**：项目跑 0.71/0.72，升级到 0.76+ 启用 New Architecture 风险大；新项目用什么版本？

**解决方案**：
- 0.76+ 默认开启 New Architecture（Fabric + TurboModules + Codegen）
- 0.71 → 0.76 升级路径：1. 升级到 0.74 LTS → 2. 开启 Bridgeless 模式（0.74 实验性）→ 3. 跑全测试 → 4. 升级到 0.76 启用 New Arch
- 所有第三方库检查是否兼容（看 release notes）

**关键参数**：
- `newArchEnabled=true` in `gradle.properties` / `Podfile`
- 第三方库兼容矩阵：react-native-new-architecture.org
- 社区库滞后 3-6 个月
- 升级前在 0.74/0.75 LTS 跑稳

**最佳实践**：商业 app 升 0.76+ 等核心依赖都支持；新项目直接 0.76+ 默认 New Arch。

---

## 附录：5 段必读代码

1. `ReactCommon/react/nativemodule/core/ReactCommon/TurboModule.h` — TurboModule 基类（New Arch 入口）
2. `ReactCommon/react/runtime/ReactInstance.h` — JS runtime 容器（持有 Hermes + Fabric）
3. `Libraries/AppRegistry/AppRegistry.js` — JS 端应用注册中心
4. `Libraries/Components/View/View.js` — View 组件（最常用，映射到 Native）
5. `ReactCommon/yoga/yoga/Yoga.h` — 跨平台 Flexbox 引擎（C++ 端跑 layout）

## 一句话总结

React Native = React 范式 + JS-Native 桥（JSI）+ 真原生 View 映射 + Codegen 自动生成，把"一套代码写 iOS+Android"从口号变成接近原生的工程实践，0.76+ New Architecture 默认开启。
