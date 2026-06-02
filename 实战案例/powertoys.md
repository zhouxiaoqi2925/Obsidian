# PowerToys - 微软官方 Windows 效率工具集

**GitHub**: microsoft/PowerToys
**Star**: 117k+
**语言**: C# / C++ / WinUI 3
**主题**: windows、utility、productivity、winui
**适用场景**: Windows 高级用户、效率工具、键盘流、电源用户

---

## 一、基础范式

### 模式 1 · 多个独立工具 + 统一设置中心

**问题场景**：Windows 默认能力有限（窗口分屏 / 批量重命名 / 快捷键），需要多个独立工具。

**解决方案**：PowerToys 把 20+ 独立工具整合到一个 app，每个工具独立 dll / exe，统一 PowerToys Settings 设置中心（WinUI 3 编写）开关。

**关键参数**：
- 20+ 独立工具
- PowerToys Settings
- 统一托盘
- 模块化加载
- 0 依赖

**最佳实践**：所有 Windows 效率用户装 PowerToys，单一工具箱。

### 模式 2 · FancyZones 窗口分屏

**问题场景**：手动拖窗口分屏费时，多显示器难布局。

**解决方案**：FancyZones 自定义网格布局，按住 Shift 拖窗口到区域自动贴靠；支持 6 种布局（columns / rows / grid / priority grid / custom）。

**关键参数**：
- 自定义网格
- Shift+drag 贴靠
- 6 种布局
- 多显示器
- 编辑器

**最佳实践**：所有多任务用户开 FancyZones，节省 50% 窗口整理时间。

### 模式 3 · PowerToys Run 快速启动器

**问题场景**：Windows 搜索慢，按名字找应用麻烦。

**解决方案**：PowerToys Run（类似 macOS Spotlight / Alfred）`Alt+Space` 唤起，输入应用名 / 计算 / 文件 / 翻译 / 网页搜索；插件系统扩展。

**关键参数**：
- `Alt+Space` 唤起
- 模糊匹配
- 计算器插件
- Shell 插件
- 30+ 插件

**最佳实践**：所有键盘流用 PowerToys Run，告别开始菜单。

### 模式 4 · Keyboard Manager 键位重映射

**问题场景**：习惯 macOS / Linux 快捷键，Windows 难改。

**解决方案**：Keyboard Manager 把单键 / 组合键重映射（如 `CapsLock` → `Ctrl`，`Cmd+C` → `Ctrl+C`）；按应用独立映射。

**关键参数**：
- 单键映射
- 组合键映射
- 按应用独立
- 低级钩子
- 0 重启

**最佳实践**：所有 macOS 迁移用户用 Keyboard Manager 改键。

### 模式 5 · 文件预览（Preview）SVG / Markdown / PDF

**问题场景**：资源管理器看 SVG / Markdown / PDF 内容要打开应用。

**解决方案**：PowerToys 装 SVG / Markdown / PDF / 代码 等预览器，资源管理器选中文件按空格直接预览（`IFileExplorerCommand` 接口）。

**关键参数**：
- `IFileExplorerCommand`
- SVG 渲染
- Markdown 渲染
- PDF 预览
- 实时

**最佳实践**：所有开发者开 SVG / Markdown 预览，选中即看。

---

## 二、扩展范式

### 模式 6 · 颜色拾取器（ColorPicker）

**问题场景**：截图取色麻烦。

**解决方案**：`Win+Shift+C` 唤起颜色拾取器，吸取屏幕任意位置颜色，复制 HEX / RGB / HSL 到剪贴板，含历史记录。

**关键参数**：
- `Win+Shift+C` 唤起
- HEX / RGB / HSL
- 历史记录
- 编辑器模式
- 屏幕任意位置

**最佳实践**：所有设计师 / 前端开 ColorPicker，告别外部取色工具。

### 模式 7 · 文本提取（Text Extractor）

**问题场景**：截图 / 视频中文字复制不出来。

**解决方案**：`Win+Shift+T` 框选屏幕区域，PowerToys 调用 Windows OCR 提取文字到剪贴板。

**关键参数**：
- `Win+Shift+T` 框选
- Windows OCR
- 多语言
- 剪贴板
- 实时

**最佳实践**：所有需要截图取字场景开 Text Extractor。

### 模式 8 · 批量重命名（PowerRename）

**问题场景**：手动批量重命名文件慢。

**解决方案**：资源管理器右键 PowerRename，支持正则替换 / 序号 / 大小写转换 / 文件日期等 10+ 规则组合。

**关键参数**：
- 右键 PowerRename
- 正则替换
- 序号
- 大小写
- 10+ 规则

**最佳实践**：所有批量文件整理用 PowerRename，节省 90% 时间。

### 模式 9 · 鼠标工具（Mouse Utilities）

**问题场景**：找不到鼠标 / 高亮位置麻烦。

**解决方案**：Find My Mouse（按 Ctrl 双击高亮鼠标位置）+ Mouse Highlighter（按住 Ctrl 显示鼠标轨迹 + 焦点圈）+ Mouse Jump（跨大屏快速移动）。

**关键参数**：
- Find My Mouse
- Mouse Highlighter
- 焦点圈
- 跨屏跳转
- 教学 / 演示

**最佳实践**：所有教学 / 演示场景开 Mouse Highlighter。

### 模式 10 · 视频会议静音（Video Conference Mute）

**问题场景**：会议中忘记静音 / 取消静音。

**解决方案**：`Win+Shift+Q` 全局一键静音麦克风 / 摄像头 + 系统托盘显示状态；多会议应用支持（Teams / Zoom / Meet）。

**关键参数**：
- `Win+Shift+Q` 全局
- 麦克风 + 摄像头
- 多应用支持
- 托盘状态
- 0 干扰

**最佳实践**：所有远程会议用户开 Video Conference Mute。

---

## 三、进阶范式

### 模式 11 · Hosts 文件编辑器

**问题场景**：手动改 hosts 文件需要管理员权限。

**解决方案**：PowerToys Hosts File Editor 提供 GUI 编辑 hosts（加条目 / 注释 / 启用禁用），自动提权。

**关键参数**：
- GUI 编辑
- 自动提权
- 条目管理
- 注释
- 启用 / 禁用

**最佳实践**：所有开发者用 Hosts File Editor，告别记事本。

### 模式 12 · 环境变量编辑器

**问题场景**：Windows 环境变量编辑是 90 年代 UI，难用。

**解决方案**：PowerToys Environment Variables 提供现代 UI 编辑（用户 / 系统 PATH），自动检测重复 / 冲突，profile 切换。

**关键参数**：
- 现代化 UI
- 用户 / 系统
- PATH 检测
- profile 切换
- 自动保存

**最佳实践**：所有配环境变量的用户用 Environment Variables。

### 模式 13 · 注册表预览（Registry Preview）

**问题场景**：改注册表需要导出文件再用编辑器看。

**解决方案**：选中 `.reg` 文件按空格，PowerToys 渲染为可读树形结构（类似 JSON viewer）。

**关键参数**：
- `.reg` 预览
- 树形结构
- 语法高亮
- 搜索
- WinUI 3

**最佳实践**：所有改注册表场景用 Registry Preview。

### 模式 14 · Awake 屏幕常亮

**问题场景**：演示 / 下载时屏幕自动休眠。

**解决方案**：PowerToys Awake 保持屏幕常亮（OFF / INDEFINITE / TIMED 三档），不修改电源设置。

**关键参数**：
- 屏幕常亮
- 三档
- 不改电源设置
- 任务栏托盘
- 0 干扰

**最佳实践**：所有演示 / 长下载场景开 Awake。

### 模式 15 · Command Not Found 建议

**问题场景**：命令行敲错命令不知道装了什么包。

**解决方案**：PowerToys 启用 Command Not Found 后，输入 `node` 但没装，会提示 `Run 'winget install OpenJS.NodeJS.LTS' to install`。

**关键参数**：
- 命令缺失检测
- winget 建议
- scoop / chocolatey 支持
- 全局 PATH 扫描
- 0 配置

**最佳实践**：所有命令行用户开 Command Not Found，新手友好。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：新 Windows 装机后配置。

**解决方案**：7 件套：① PowerToys Run 启动器 ② FancyZones 窗口分屏 ③ Keyboard Manager 键位 ④ ColorPicker 取色 ⑤ PowerToys Awake 常亮 ⑥ Always On Top 置顶 ⑦ File Explorer Add-ons 预览。

**关键参数**：
- PowerToys Run
- FancyZones
- Keyboard Manager
- ColorPicker
- Awake
- Always On Top
- 预览

**最佳实践**：所有新 Windows 装机后用 7 件套，效率提升 100%。

### 模式 17 · 安装与更新（winget / Microsoft Store / GitHub）

**问题场景**：PowerToys 怎么装。

**解决方案**：3 种安装：① `winget install Microsoft.PowerToys` 命令行 ② Microsoft Store 自动更新 ③ GitHub Release `.exe` 安装包；自动检测升级。

**关键参数**：
- winget 安装
- Microsoft Store
- GitHub Release
- 自动升级
- 0 干扰

**最佳实践**：所有用户用 `winget` 装，自动升级最省心。

### 模式 18 · 性能优化 5 招

**问题场景**：PowerToys 占用内存 / 启动慢。

**解决方案**：5 招优化：① 关闭不用工具 ② `PowerToys.exe --startup` 自启动管理 ③ Settings 减少动画 ④ FancyZones 网格精简 ⑤ 升级到最新版（性能持续优化）。

**关键参数**：
- 关闭不用的
- 自启动
- 减少动画
- 网格精简
- 升级

**最佳实践**：5 招叠加，PowerToys 内存占用 < 100MB。

### 模式 19 · 与 macOS / Linux 工具对比

**问题场景**：跨平台效率工具对比。

**解决方案**：PowerToys 定位「Windows 平台 Alfred + Rectangle + 1Password 替代」；macOS 自带 Spotlight + Rectangle；Linux 用 Albert / KRunner + i3。功能上 PowerToys 已覆盖 80% macOS 效率工具。

**关键参数**：
- 跨平台对比
- macOS 自带
- Linux 自由
- PowerToys 整合度更高
- 100% 免费

**最佳实践**：Windows 用户用 PowerToys，macOS 自带够用，Linux 自选。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想做内部 Windows 工具集。

**解决方案**：7 天分 5 步：① WinUI 3 项目初始化 ② 单一工具（Hotkey 监听） ③ 设置存储（JSON / SQLite） ④ 托盘图标 ⑤ 第二个工具。

**关键参数**：
- Day 1: WinUI 3
- Day 2-3: Hotkey
- Day 4: 设置
- Day 5: 托盘
- Day 6-7: 扩展

**最佳实践**：7 天复刻「单工具 + 设置 + 托盘」，完整 PowerToys 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\PowerToys\`
- **大小**: ~500 MB
- **总文件数**: 数百 C# / C++ 文件
- **关键 commit**: v0.85+（持续更新）
- **团队**: Microsoft 官方 + 社区
- **许可**: MIT

## 一句话总结

PowerToys 用「20+ 独立工具 + 统一设置中心 + 键盘流优先」让 Windows 拥有 macOS 级别的效率工具，是微软 2020+ 对 Windows 效率工具的官方回应。
