# NW.js - Web 技术构建桌面应用

**GitHub**: nwjs/nw.js
**Star**: 41k+
**语言**: C++ + JavaScript
**主题**: 桌面应用、Chromium、Node.js、HTML5
**适用场景**: 跨平台桌面应用、Electron 替代品、需要访问 Node.js API 的 Web 应用

---

## 一、基础范式

### 模式 1 · Chromium + Node.js 同进程集成

**问题场景**：传统 Web 应用无法访问本地文件系统、操作系统 API；Electron 集成复杂。

**解决方案**：NW.js 把 Chromium 和 Node.js 编译到同一进程，DOM 可直接调用 Node.js API（`fs` / `child_process` / `path`），无需 IPC 桥接。

**关键参数**：
- `package.json` 配置入口
- `main: "index.html"` 主窗口
- `node-main: "background.js"` 后台脚本
- `window: { width: 800, height: 600 }` 窗口
- `chromium-args` 自定义参数

**最佳实践**：NW.js 适合「Web 技术 + Node.js API 直接调用」场景，Electron 适合「多进程沙箱」场景。

### 模式 2 · 三种入口（HTML / Node-main / 混合）

**问题场景**：需要决定是从 HTML 还是 Node 脚本启动应用。

**解决方案**：`package.json` 中 `main` 字段接受 HTML 路径（主窗口）或 JS 路径（Node 入口），混合模式同时存在 `main: "index.html"` 和 `node-main: "background.js"`。

**关键参数**：
- `main: "index.html"` HTML 入口
- `node-main: "background.js"` Node 入口
- 混合：两个都配置
- 窗口管理 `nw.Window`
- 多窗口 `nw.Window.open()`

**最佳实践**：简单应用用 HTML 入口，复杂应用用混合模式（HTML 显示 UI + node-main 跑服务）。

### 模式 3 · Native UI 控件集成

**问题场景**：HTML 控件无法满足系统级 UI（菜单、托盘、通知）。

**解决方案**：NW.js 提供原生 API：`nw.Menu` / `nw.MenuItem` 创建应用菜单，`nw.Tray` 创建系统托盘，`nw.Notification` 发系统通知。

**关键参数**：
- `nw.Menu` / `nw.MenuItem` 菜单
- `nw.Tray` 托盘
- `nw.Notification` 通知
- `nw.Shell` 系统 shell
- `nw.Clipboard` 剪贴板

**最佳实践**：所有桌面应用都用 nw.Menu + nw.Tray 提供原生体验。

### 模式 4 · 窗口管理（多窗口 + 透明 + 异形）

**问题场景**：需要多窗口（如 IDE）、无边框透明窗口（如启动器）、Kiosk 模式。

**解决方案**：`package.json` 中 `window` 字段配置：`width` / `height` / `frame: false`（无边框）/ `transparent: true`（透明）/ `kiosk: true`（全屏）/ `show: false`（隐藏）。

**关键参数**：
- `frame: false` 无边框
- `transparent: true` 透明背景
- `always-on-top: true` 置顶
- `resizable: false` 固定
- `kiosk: true` Kiosk 模式

**最佳实践**：UI 美观的应用用 frame: false + transparent: true 自定义标题栏。

### 模式 5 · 本地资源访问（fs / shell）

**问题场景**：浏览器沙箱禁止访问本地文件。

**解决方案**：NW.js DOM 可直接调用 Node.js `fs` / `path` / `os` / `child_process` 模块，无需任何配置。

**关键参数**：
- `require('fs').readFileSync(...)` 直接调用
- `require('path').join(...)` 路径处理
- `require('child_process').exec(...)` 执行命令
- `require('os').homedir()` 系统信息
- `__dirname` 访问应用目录

**最佳实践**：所有 NW.js 应用都直接用 Node.js API，无需 IPC 桥接。

---

## 二、扩展范式

### 模式 6 · 跨平台打包（nw-builder）

**问题场景**：需要在 Windows / macOS / Linux 三个平台分发应用。

**解决方案**：`nw-builder` 工具读取 `package.json`，下载对应平台 NW.js 二进制，生成 `.exe` / `.app` / `.AppImage`。

**关键参数**：
- `nw-builder` 工具
- Windows / macOS / Linux
- `--platform` / `--arch` 参数
- 输出 `.exe` / `.dmg` / `.AppImage`
- 100MB+ 二进制

**最佳实践**：跨平台分发用 nw-builder，CI 用 GitHub Actions 三平台矩阵。

### 模式 7 · DevTools 集成

**问题场景**：调试需要 Chrome DevTools。

**解决方案**：NW.js 内置 DevTools，`F12` 打开；`window.showDevTools()` 编程式打开；`chromium-args: '--auto-open-devtools-for-tabs'` 自动打开。

**关键参数**：
- `F12` 默认打开
- `window.showDevTools()`
- `chromium-args` 配置
- 远程调试端口 `--remote-debugging-port=9222`
- 节点调试 `--inspect=5858`

**最佳实践**：开发环境 auto-open-devtools-for-tabs，生产环境关闭。

### 模式 8 · Chrome 扩展 API 兼容

**问题场景**：NW.js 应用需要 Chrome 扩展 API（`chrome.tabs` / `chrome.storage`）。

**解决方案**：NW.js 内置 chrome.* 命名空间，`chrome.app.runtime` / `chrome.app.window` 提供 NW 风格的窗口管理。

**关键参数**：
- `chrome.app.window.create()` 创建窗口
- `chrome.storage.local` 存储
- `chrome.runtime` 运行时
- 扩展加载 `nw.Window.loadExtension()`
- Kiosk 模式

**最佳实践**：老 Chrome 应用迁移用 chrome.* API，新项目用 nw.* API。

### 模式 9 · Node.js 版本管理

**问题场景**：NW.js 内置 Node.js 版本与项目需求不匹配。

**解决方案**：`chromium-args` 不可改 Node 版本；通过 `node-main` 引入自定义 Node 模块；或升级到新版 NW.js（v0.50+ Node 18+）。

**关键参数**：
- 内置 Node.js 版本
- 升级 NW.js
- 外部 Node 进程
- nwjs 内置
- ABI 兼容

**最佳实践**：选择 NW.js 版本时关注 Node.js 版本，v0.50+ Node 18+ 够用。

### 模式 10 · 安全模型（ContextIsolation）

**问题场景**：恶意脚本访问 Node.js API 风险大。

**解决方案**：`contextIsolation: true`（默认）隔离 Node 和 V8 上下文，DOM 调用 Node API 通过 `nw.require('fs')` 显式进入 Node 上下文。

**关键参数**：
- `contextIsolation: true` 默认
- `nodejs: false` 关闭 Node
- `sandbox: true` 沙箱
- `nw.require` 显式调用
- `process.versions.node` 版本

**最佳实践**：第三方内容用 contextIsolation + sandbox，自家代码用 nodejs: true。

---

## 三、进阶范式

### 模式 11 · 多窗口应用（IDE / 设计工具）

**问题场景**：单窗口无法满足 IDE、设计工具的多文档界面。

**解决方案**：`nw.Window.open(url, options)` 创建子窗口，`window.on('close', () => {})` 监听，`window.window` 拿到 DOM window。

**关键参数**：
- `nw.Window.open(url, { ... })`
- 父子通信 `window.postMessage()`
- 子窗口管理
- 关闭监听
- 窗口间引用

**最佳实践**：超过 5 个文档窗口用 BrowserWindow 池管理，零内存泄漏。

### 模式 12 · 性能优化（启动 + 渲染）

**问题场景**：NW.js 启动慢（5-10 秒），首屏卡顿。

**解决方案**：5 招优化：① 精简 Chromium flags ② 关闭非必要服务 ③ 启动画面 ④ 预加载 ⑤ 资源 lazy load。

**关键参数**：
- 启动时间 5-10s
- 启动画面 `chrome-url`
- 预加载 `<link rel="preload">`
- 代码分割
- V8 snapshot

**最佳实践**：核心路径用 V8 snapshot，启动时间从 5s 降到 1s。

### 模式 13 · 自动更新（node-webkit-updater）

**问题场景**：用户使用旧版本有 bug，需要强制更新。

**解决方案**：`node-webkit-updater` 在启动时检查服务器版本，下载新版本并替换。

**关键参数**：
- `node-webkit-updater` npm 包
- 服务器托管新版本
- `manifestUrl` 检查
- 静默下载
- 重启生效

**最佳实践**：所有 NW.js 应用都加自动更新，用户无感升级。

### 模式 14 · 原生模块（native modules）

**问题场景**：需要调用系统 DLL / dylib / .so 库。

**解决方案**：用 `node-gyp` 编译 C++ 原生模块，`require('./build/Release/foo.node')` 加载。

**关键参数**：
- `node-gyp` 编译
- `binding.gyp` 配置
- C++ Addon
- ABI 匹配
- nw-gyp 工具

**最佳实践**：用 nw-gyp 编译原生模块，匹配 NW.js 内置 Node ABI。

### 模式 15 · 调试 + 测试（chrome-devtools-protocol）

**问题场景**：远程调试 + 自动化测试。

**解决方案**：`--remote-debugging-port=9222` 启动远程 DevTools 协议，CDP 客户端（puppeteer-core）连接，自动化测试 + 远程调试。

**关键参数**：
- `--remote-debugging-port=9222`
- puppeteer-core 客户端
- CDP 协议
- 远程调试
- E2E 测试

**最佳实践**：CI 跑 E2E 测试用 puppeteer-core + remote-debugging-port。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 NW.js 项目。

**解决方案**：7 件套：package.json（入口配置）/ index.html（主窗口 UI）/ background.js（Node 后台）/ app.js（业务逻辑）/ style.css / icon.png（应用图标）/ build/（构建产物）。

**关键参数**：
- `package.json` main
- `index.html` UI
- `background.js` Node
- `app.js` 业务
- 图标 .ico / .icns
- 构建脚本

**最佳实践**：所有 NW.js 项目用 7 件套模板，10 分钟跑起来。

### 模式 17 · 跨平台打包 + 签名

**问题场景**：需要 macOS / Windows 签名防止系统警告。

**解决方案**：`nw-builder` 跨平台打包，macOS 用 codesign + notarytool，Windows 用 signtool，Linux 用 GPG。

**关键参数**：
- `nw-builder` 打包
- macOS codesign
- Windows signtool
- Linux AppImage
- 自动更新元数据

**最佳实践**：所有分发应用都加签名，避免系统警告 + 提升信任。

### 模式 18 · 性能监控 + 崩溃报告

**问题场景**：用户机器崩溃无法定位问题。

**解决方案**：`window.on('crashed', ...)` 监听崩溃，`nw.Window.crashProcess()` 测试崩溃，集成 Sentry / Bugsnag 上报。

**关键参数**：
- `window.on('crashed')` 监听
- `nw.Window.crashProcess()` 测试
- Sentry 集成
- Crashpad 集成
- 用户无感上报

**最佳实践**：所有线上应用都集成崩溃报告，5 分钟定位 90% 问题。

### 模式 19 · 与 Electron / Tauri / Wails 对比

**问题场景**：桌面应用选型在 NW.js / Electron / Tauri / Wails 之间。

**解决方案**：NW.js 定位「Web + Node 同进程」，适合快速迁移 Web 应用；Electron 定位「多进程 + 沙箱」，适合复杂应用；Tauri 定位「Rust 后端 + Web 前端」，适合小体积高性能；Wails 定位「Go 后端 + Web 前端」，适合 Go 团队。

**关键参数**：
- 体积：Tauri 5MB < Wails 8MB < Electron 80MB < NW.js 100MB
- 性能：Tauri > Wails > NW.js > Electron
- 生态：Electron > NW.js > Tauri > Wails
- 上手：NW.js < Electron < Wails < Tauri

**最佳实践**：MVP 选 NW.js，复杂应用选 Electron，高性能选 Tauri，Go 团队选 Wails。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork NW.js 做内部桌面框架。

**解决方案**：7 天分 5 步：① Chromium 嵌入 ② Node.js 子进程桥接 ③ package.json 解析 ④ 窗口管理 ⑤ 原生 API 暴露。

**关键参数**：
- Day 1-2: Chromium + Node
- Day 3: package.json
- Day 4: 窗口
- Day 5: 原生 API
- Day 6-7: 文档

**最佳实践**：7 天只能做「够用 80% 场景」的桌面框架，完整 NW.js 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\nwjs\`
- **大小**: ~500 MB（包含 Chromium 源码）
- **总文件数**: 数千 C++/JS 文件
- **关键 commit**: v0.50+（Chromium 130+ / Node 18+）
- **团队**: Intel 主导 + Roger Wang 创始 + 社区
- **许可**: MIT

## 一句话总结

NW.js 用「Chromium + Node.js 同进程集成」让 Web 技术构建桌面应用变得简单，无需 IPC 桥接可直接调用 Node API，是 Web 应用迁移桌面端的最低门槛选择。
