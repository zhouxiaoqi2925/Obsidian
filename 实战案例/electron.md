# electron - 用 Web 技术构建跨平台桌面应用

**GitHub**: electron/electron
**Star**: 118k+
**语言**: C++/JavaScript
**主题**: 桌面框架 / 跨平台
**适用场景**: VSCode/Slack/Discord/Notion 等桌面应用 / 工具型产品

---

## 第一段：基础范式（模式 1-5）

### 模式 1：多进程架构

**问题场景**：单进程 Chromium 渲染 + Node 集成出现安全漏洞（nodeIntegration=true 时代），renderer 崩溃导致整个应用挂。

**解决方案**：Electron 走主进程（main）+ 渲染进程（renderer）+ GPU 进程 + 工具进程的多进程模型。每个 BrowserWindow 一个 renderer 进程，进程间靠 IPC 通信。

**关键参数**：
- `BrowserWindow` webPreferences 配 `nodeIntegration: false` 强制隔离
- `contextIsolation: true` 防 prototype 污染
- `sandbox: true` 沙盒渲染
- preload 脚本桥接主渲染

**最佳实践**：永远 `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`；node API 走 preload 暴露最小面。

### 模式 2：主进程与渲染进程

**问题场景**：主进程是 Node 环境能访问 OS，但 UI 在 renderer 跑 Chromium，两套 runtime 数据互传。

**解决方案**：主进程管窗口生命周期 + 菜单 + 托盘 + 系统 API；renderer 跑 React/Vue；IPC `ipcMain.handle` / `ipcRenderer.invoke` 异步请求-响应。

**关键参数**：
- `ipcMain.handle('foo', handler)` 注册异步
- `webContents.send` 主推渲染
- `contextBridge.exposeInMainWorld` 暴露 API
- `Menu` / `Tray` / `dialog` 仅主进程

**最佳实践**：所有 IO/系统调用放主进程，渲染只做 UI；payload 走 structuredClone 不走 JSON 字符串化大对象。

### 模式 3：应用打包与分发

**问题场景**：Chromium 自身 100MB+，每个 OS 签名机制不同，跨平台分发耗时。

**解决方案**：`electron-builder` / `electron-forge` 配 target = `dmg|nsis|AppImage|snap|rpm`，签名走 `electron-builder.codeSigning`。资源 asar 归档。

**关键参数**：
- `appId` 唯一标识
- `mac.extendInfo` / `win.target` / `linux.target`
- `publish` 自动更新
- `asar: true` 默认开

**最佳实践**：生产用 `electron-builder`，开发用 `electron-forge` 启服务；多平台签名证书分开管理。

### 模式 4：自动更新

**问题场景**：桌面应用发布后用户不更新，bug 修不了；强更新又破坏回滚。

**解决方案**：`electron-updater` 走 S3/GitHub Releases 做差分更新，按 Squirrel/Mac/Windows 各家机制。灰度发布用 `updater.channel` 切 beta/stable。

**关键参数**：
- `autoUpdater.checkForUpdates()`
- `app-update.yml` 配 feed URL
- `forceDevUpdateConfig` dev 模式
- 差分 `blockmap` 走 S3

**最佳实践**：强制 SSL/HTTPS 校验；签名 `appimage` 防止中间人；灰度按 channel 切分。

### 模式 5：原生模块（Native Modules）

**问题场景**：纯 Node API 能力有限（USB/蓝牙/串口/系统通知），要调 C++ 库。

**解决方案**：`node-gyp` + `N-API` 写 C++ addon；Electron 走 `electron-rebuild` 重新编译对应 ABI 版本。`ffi-napi`/`koffi` 调动态库。

**关键参数**：
- `node-gyp` + `binding.gyp`
- `npm_config_target=` 配 Electron 版本
- `@electron/rebuild` 自动重编
- `prebuild` 预编译二进

**最佳实践**：用 `node-addon-api` 写新版 NAPI 跨 Node/Electron；CI 用 `electron-rebuild` 矩阵。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：进程间通信（IPC）深入

**问题场景**：频繁 IPC 通信造成序列化/反序列化开销，大对象传输成瓶颈。

**解决方案**：高频大数据走 `MessagePort` / `SharedArrayBuffer` 零拷贝；同步阻塞用 `ipcRenderer.sendSync`（慎用）；批量请求合并到单 IPC 调用。

**关键参数**：
- `MessageChannel` 双向端口
- `postMessage` 在 worker 传 transferable
- `IpcMainEvent.reply` 单次回复
- `MessagePortMain` 主进程端口

**最佳实践**：避免主进程和渲染进程同步 IPC 阻塞 UI；高频用 `MessageChannel` 替代 invoke。

### 模式 7：菜单、托盘与系统集成

**问题场景**：桌面应用必须有原生集成：菜单栏、托盘图标、Dock、系统通知、剪贴板、文件关联。

**解决方案**：`Menu.setApplicationMenu` 定义菜单；`Tray` 创建托盘；`Notification` 走系统通知；`clipboard` / `shell.openPath` / `dialog.showOpenDialog` 系统交互。

**关键参数**：
- `Menu` 用 `accelerator` 配快捷键
- `Tray` 配 context menu
- `app.setLoginItemSettings` 开机启动
- `protocol.registerSchemesAsPrivileged` 私有 scheme

**最佳实践**：macOS 走系统菜单栏；Windows 走 Tray；快捷键要 `globalShortcut` 注册。

### 模式 8：WebContents 与协议

**问题场景**：直接 load URL 受 CSP 限制，自定义协议（myapp://）需要 privileged scheme。

**解决方案**：`protocol.handle('myapp', handler)` 注册自定义协议；`webContents.setWindowOpenHandler` 控制新窗口；`session.webRequest` 改写请求。

**关键参数**：
- `protocol.registerSchemesAsPrivileged([{scheme:'myapp', privileges:{standard:true, secure:true}}])`
- `interceptHttpProtocol` / `handle`
- `setWindowOpenHandler(()=>({action:'deny'}))`

**最佳实践**：自定义协议做 update 校验；阻止 window.open 跳浏览器防钓鱼。

### 模式 9：性能与内存

**问题场景**：多个 BrowserWindow + 多个 WebView 内存爆炸，CPU idle 仍 30%。

**解决方案**：未显示窗口 `webContents.setBackgroundThrottling(true)` 降帧；限制 DevTools 开启；进程合并 `app.commandLine.appendSwitch`；关掉不必要 GPU 加速。

**关键参数**：
- `backgroundThrottling: true`
- `webPreferences.v8CacheOptions: 'none'`
- `app.commandLine.appendSwitch('disable-renderer-backgrounding')`
- `nodeIntegrationInWorker: false`

**最佳实践**：超过 5 个 BrowserWindow 拆多进程；空闲窗口必 throttle；监控 `process.memoryUsage()`。

### 模式 10：调试与诊断

**问题场景**：打包后 main 进程崩在用户机器，log 抓不到。

**解决方案**：`electron-log` 主进程日志；DevTools 远程调试配 `webContents.openDevTools()`；崩溃用 `crashReporter.start` 上报 Sentry。Sentry/Bugsnag 集成。

**关键参数**：
- `crashReporter.start({submitURL})`
- `mainWindow.webContents.on('render-process-gone')`
- `process.on('uncaughtException')` 全局兜底
- Sentry `init` 配 `release/version`

**最佳实践**：所有 catch 必上报 Sentry；区分 dev/prod 环境；崩溃附件含 `minidump`。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：渲染进程沙箱

**问题场景**：恶意脚本或第三方 npm 包能调用 Node API 造成 RCE。

**解决方案**：`sandbox: true` 让 renderer 进程跑在 OS 沙箱（Chromium sandbox）；preload 脚本只暴露最小白名单 API。OS-level 隔离 + contextIsolation 双保险。

**关键参数**：
- `sandbox: true`
- `contextIsolation: true`
- `nodeIntegration: false`
- preload 用 `contextBridge.exposeInMainWorld`

**最佳实践**：preload 脚本越薄越好；零依赖在 preload；所有调用都走白名单。

### 模式 12：窗口生命周期

**问题场景**：应用关闭时未保存的文档丢失；macOS 关窗不退出（docked），Windows 关窗退出。

**解决方案**：`window-all-closed` 区分平台；`before-quit` 拦截 + `event.preventDefault()`；`will-quit` 收尾；macOS 用 `app.on('activate', reopen)` 重开窗口。

**关键参数**：
- `app.on('window-all-closed', ()=>process.platform!=='darwin'&&app.quit())`
- `mainWindow.on('close', e => confirm?e.preventDefault():null)`
- `session.fromPartition('persist:name')` 持久化 storage
- `webContents.on('will-navigate')` 防外跳

**最佳实践**：每个窗口配单例；多窗口共享 session；dirty 检测必做。

### 模式 13：Electron 与 Chromium 升级

**问题场景**：Chromium 升级快，Electron 每版绑 Chromium 80+；上层框架兼容性。

**解决方案**：锁 Electron 主版本（每 8-12 周 minor 升级一次），用 `electron-chromedriver` 跑 e2e。chromium security patch 必须跟进。

**关键参数**：
- Electron 版本 = Chromium + Node + V8
- `process.versions.electron` / `chrome` / `node`
- `electron-builder` 矩阵多版本测试
- `npx electron --version` 验证

**最佳实践**：跟 Electron LTS 路线；升级前看 release notes；用 `@electron/asar` 包校验。

### 模式 14：安全加固（CSP / 权限）

**问题场景**：加载远程内容被 XSS；调用摄像头/麦克风/定位无授权。

**解决方案**：响应头 `Content-Security-Policy` 严控 script-src；`session.setPermissionRequestHandler` 拦截 `geolocation`/`media`/`notifications` 等权限请求；`webContents.setWindowOpenHandler({action:'deny'})`。

**关键参数**：
- `default-src 'self'`
- `setPermissionRequestHandler((wc, perm, cb)=>cb(false))`
- `app.enableSandbox()` 启 OS 沙箱
- `webSecurity: true` 默认开

**最佳实践**：CSP 设到 `script-src 'self'`，禁用 inline；外部 URL 走 trusted URL 验证。

### 模式 15：CI/CD 与发布

**问题场景**：Win/macOS/Linux 三平台二进制 + 签名 + 自动更新链路，CI 配置复杂。

**解决方案**：GitHub Actions 矩阵 `runs-on: windows-latest | macos-latest | ubuntu-latest`；`electron-builder --publish onTagOrDraft` 推 GitHub Releases。`@electron/forge` 走 Makers + Publishers 插件。

**关键参数**：
- `GH_TOKEN` 推 release
- macOS notarize `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`
- Windows `CSC_LINK` 证书
- `npm_config_build_from_source` 触发 native rebuild

**最佳实践**：CI 缓存 `~/.electron-gyp` + `node_modules` 提速；签名 + notarize 必做否则用户被 Gatekeeper 拦截。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：应用启动性能

**问题场景**：冷启动 5s+，用户看到白屏弃用。

**解决方案**：`ready-to-show` 事件后显示窗口防闪烁；preload 脚本极薄；main 进程冷启动先 `app.commandLine.appendSwitch` 配 GPU 策略；业务代码 lazy require。

**关键参数**：
- `BrowserWindow({show: false})` + `ready-to-show` 显示
- `backgroundColor: '#fff'` 防白闪
- `app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')`
- `app.getPath('userData')` 不阻塞 IO

**最佳实践**：冷启动拆 main 启动 + renderer 启动两步；主窗口先骨架，业务 lazy 加载。

### 模式 17：内存与渲染优化

**问题场景**：长时间使用 OOM；多 Tab 内存泄漏；动画卡顿。

**解决方案**：空闲窗口 throttle；用 `chrome://tracing` 抓 profile；避免频繁 setState/全量 re-render（React 用 memo + virtualized list）；nativeImage 缓存；webContents `did-finish-load` 释放中间产物。

**关键参数**：
- `app.getAppMetrics()` 看每窗口内存
- `webContents.getOSProcessId()` 配 OS profiler
- `webFrame.setVisualZoomLevelLimits(1,1)` 禁缩放
- `setMaxListeners(50)` 防 leak warn

**最佳实践**：每窗口配独立 session；用 Chrome DevTools Memory tab 抓 leak；图片用 `nativeImage.createFromPath` 缓存。

### 模式 18：跨平台 UX 一致性

**问题场景**：Mac/Win/Linux 行为不一致：菜单、快捷键、字体、滚动条、DPI。

**解决方案**：CSS 像素统一；字体走系统栈 `-apple-system, Segoe UI, sans-serif`；`os.EOL` 处理换行；`process.platform === 'darwin'` 分平台逻辑。`electron-builder` 配置差异化资源。

**关键参数**：
- `process.platform` / `process.arch`
- `app.getLocale()` / `app.getSystemLocale()`
- `nativeTheme.themeSource: 'dark'/'light'/'system'`
- `webContents.zoomFactor` 缩放

**最佳实践**：UI 用自适应布局；快捷键用 accelerator 跨平台；native dialog 替代 web dialog。

### 模式 19：原生通知与系统集成

**问题场景**：用户离开应用漏消息；用 web Notification 跨平台不一致。

**解决方案**：`new Notification({title, body, icon}).show()` 走系统通知；macOS 配 `app.setAppUserModelId`；Windows 配 shortcut。`app.setBadgeCount` macOS dock 角标；Linux libnotify。

**关键参数**：
- `app.setAppUserModelId('com.company.app')` Win Toast
- `Notification.isSupported()` 兼容检测
- `app.setBadgeCount(n)` dock 数字
- `app.dock.setBadge(text)` macOS

**最佳实践**：通知必走 `Notification.isSupported()`；点击通知 `notification.on('click', ...)` 路由到窗口。

### 模式 20：构建产物优化

**问题场景**：安装包 200MB+（含 Chromium），启动慢；首次下载转化低。

**解决方案**：`asar` 压缩源码；`electron-builder --dir` 拆 distributable；区分大文件 `extraResources` 单独下载；Mac 走 universal binary（arm64 + x64）合并；Win 拆 `nsis` web installer 按需下载。

**关键参数**：
- `asar: true` + `asarUnpack: ['*.node']`
- Mac `mac.target.universal=true`
- Win `nsis.oneClick=false; perMachine=true`
- 差分更新 `blockMapSize`

**最佳实践**：native module 必 `asarUnpack`；生产 strip 符号表；universal 二进制约 2x 大按需选择。
