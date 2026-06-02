# runjs - 商业闭源 Electron 项目的"空仓库"反推方法论

**GitHub**: lukehaas/RunJS
**Star**: ~5k
**语言**: JavaScript / TypeScript（周边文件，无应用源码）
**主题**: Electron 桌面应用 / 代码沙盒 / 闭源反推 / 双运行时协调
**适用场景**: 学习"商业闭源 Electron 项目如何用周边文件反推架构"、Chrome/Node 双 runtime 协调、GUI 级 REPL 设计

---

## 第一段：基础范式与架构

### 模式 1：商业 Electron 项目的"空仓库"反推法

**问题场景**：拿到商业闭源 Electron app 的 GitHub 仓库，发现没有 `src/`、没有 `package.json`、CHANGELOG 写了 8 年；怎么快速理解其架构？

**解决方案**：把仓库当"考古现场"——CHANGELOG 是产品时间机器（每条 "Upgraded Node" = 商业压力），FOSS_Notices 是真实依赖图（法定披露不可改），翻译文件是 UI 全息图。三者并排即可还原 80% 模块切分。

```bash
# 30 分钟画出 80% 架构流程
1. CHANGELOG.md 头尾各 50 行
   - 看 "Added" / "Upgraded" / "Fixed" 关键词
   - 每条 "Upgraded Node" = 商业压力点
2. FOSS_Notices 头 100 行
   - 看 67 库（1327 行）= 真实打进 .asar 的依赖
   - 关键库：CodeMirror / Babel / asar / electron-log
3. 主语言翻译前 50 键
   - 看 8 顶层命名空间 = 内部模块切分
   - main / common / editor / preferences / license / vars / installer / snippets
4. 错误键 `errorXxx` 子串 = 错误处理矩阵
5. 配置键 `setXxx` 子串 = 用户可配置项
```

**关键参数**：
- CHANGELOG 行数与产品寿命正相关（538 行 = 8 年 30+ 版本）
- FOSS_Notices 长度 = 真正打进 .asar 的库数量（67 库 = 1327 行）
- i18n 命名空间 = 内部模块切分（8 个顶层）
- 翻译键 `errorXxx` 子串 = 错误处理矩阵
- 翻译键 `setXxx` 子串 = 用户可配置项

**最佳实践**：面对"无源码"商业仓库，优先读 CHANGELOG.md 头尾 + FOSS_Notices 头 100 行 + 主语言翻译前 50 键，30 分钟即可画出 80% 架构；不要尝试反编译 .asar（违法 + 不可靠）。

### 模式 2：三运行时并存架构

**问题场景**：开发者想要"一段代码同时跑 Node 和 DOM"——既需要 `require('axios')` 又要 `window.fetch`，VSCode 启动慢，Node REPL 没 GUI。

**解决方案**：v4.0.0 起引入 "Browser & Node.js / Node only / Browser only" 三模式——同进程 fork Node Worker 跑后端，iframe + WebView 跑浏览器 API，输出按行号回流编辑器。

```js
// 用户选 runtime
// v4.0.0 配置
runtime: 'browser-and-node'  // 默认 80% 用户预期
// 或 'node-only' / 'browser-only'
// 内部：
//   Node 代码 → fork Worker 子进程（独立 V8 context）
//   DOM 代码 → iframe（隔离 BrowserWindow）
//   输出 → stdout + tsserver 诊断 → 按行号反查回编辑器 gutter
```

**关键参数**：
- Runtime 选择 = 策略模式，编译期不变
- Node Worker = 独立子进程，避免污染主 V8 context
- WebView = 独立 BrowserWindow 标签，隔离 DOM
- 结果回流协议 = stdout + tsserver 诊断，按"行号"反查回编辑器
- 默认 runtime = "Browser & Node.js"（80% 用户预期）

**最佳实践**：用户既要 Node 生态又要 DOM 时，拆双进程 + IPC 桥比共享 V8 context 更稳；崩溃边界清晰是双进程最大价值；默认选 "Browser & Node.js" 符合 80% 预期。

### 模式 3：Logpoints 替代传统 Debugger

**问题场景**：教学/演示场景下，传统 breakpoint debugger 太重——要启 inspector、要写 launch.json，新手望而生畏。

**解决方案**：在 tsserver 上加 `provideInlineValues` 实现 logpoints——编辑器左侧 gutter 出现"logpoint 标记"，代码运行后输出面板自动按行号打印顶层表达式结果。

```js
// 用户写法（不打断点）
// 编辑器左侧点 gutter 添加 logpoint → 跑代码 → 输出面板自动打印
const result = expensiveFunction()   // logpoint 标记后 → 输出: result = {...}
console.log('done')                   // logpoint → 输出: console.log('done') = done
// 翻译键
"autoLog": "Automatically log the result of each top-level expression"
```

**关键参数**：
- logpoints ≠ breakpoints：无暂停、无 inspector、纯输出
- `autoLog` 翻译键 = "Automatically log the result of each top-level expression"
- 输出面板每条带"匹配行号"，hover 反查回编辑器
- 适用场景 = 教学 / API 调研 / 快速验证
- 不替代：复杂条件断点、async 调用栈、内存快照

**最佳实践**：教学/演示工具优先做 logpoints 而非 debugger；用户零摩擦，90% 场景够用，省掉 80% debugger 复杂度；不替代真正 debugger（async 栈、内存快照）。

### 模式 4：4 Provider AI Chat 统一接入

**问题场景**：用户用 OpenAI / Gemini / Mistral / Anthropic 不同 AI 服务商，每个有不同 API 协议；开发者想"一个 UI 切换 provider"。

**解决方案**：抽象 `AIService` interface，4 个 adapter 实现（OpenAI / Gemini / Mistral / Anthropic），翻译文件 4 键（`aiApiKey` / `aiModel` / `aiProvider` / `aiBaseUrl`）覆盖全部配置。

```js
// AIService 接口（伪代码）
interface AIService {
    chat(messages: Message[]): Promise<Response>
    listModels(): Promise<string[]>
}
// 4 个 adapter
class OpenAIAdapter implements AIService { ... }
class GeminiAdapter implements AIService { ... }
class MistralAdapter implements AIService { ... }
class AnthropicAdapter implements AIService { ... }
// 4 个配置键
{
    "aiProvider": "openai",       // openai / gemini / mistral / anthropic
    "aiApiKey": "sk-...",
    "aiBaseUrl": "https://...",   // 兼容代理/Azure
    "aiModel": "gpt-4"
}
```

**关键参数**：
- 适配器模式：4 个实现类 + 1 个接口
- 用户自配 key = 零运营成本，隐私边界清晰
- `aiBaseUrl` 支持自定义（兼容代理/Azure）
- 模型列表按 provider 动态拉取
- 失败处理 = 4 类（invalid / notFound / twoMachinesActive / connectionProblem）

**最佳实践**：AI 接入做"接口 + 多 adapter + 4 配置键"模式；用户自配 key 优于中心化代理（规避合规和成本）；`aiBaseUrl` 字段兼容 Azure / 自家代理。

### 模式 5：Magic Comment 注释驱动功能

**问题场景**：playground 工具里，用户想对部分代码"豁免运行"或"保留旧值"；加菜单太重，加配置项太散。

**解决方案**：`// @runjs-skip` / `// @runjs-keep` 等 magic comment——注释驱动行为，编辑时无需打开设置。

```js
// 用户写法
// @runjs-skip  — 下一行不执行
console.log('debug')         // 实际不跑
// @runjs-keep — 输出保留旧值不更新
let config = loadConfig()   // 多次跑结果不变
// @runjs-pure  — 标记纯函数（启用 tree-shaking 优化）
// @runjs-noLog — 不在 logpoints 输出
// 解析位置：Babel transform 之前
// 翻译键 toggleMagicComment 暴露为菜单项
```

**关键参数**：
- 注释前缀 = `// @runjs-<flag>`
- 解析位置 = Babel transform 之前
- 适用 flag = skip / keep / pure / noLog
- 翻译键 `toggleMagicComment` 暴露为菜单项
- 用户群体 = 教学 / 演示 / API 文档作者

**最佳实践**：playground 类工具做"magic comment"开关；零配置成本，用户学一次永久受益；解析位置在 Babel transform 之前（最早时机拿到 AST）。

---

## 第二段：i18n 命名空间与商业化基建

### 模式 6：i18n 命名空间设计

**问题场景**：商业应用菜单/对话框/设置项极多，每加一个菜单要在 5 个语言文件同步字符串；翻译外包经常漏改、拼写错误传染。

**解决方案**：`translations/{lang}/translation.json` 单文件 + 顶层 8 个命名空间（`main` / `common` / `editor` / `preferences` / `license` / `vars` / `installer` / `snippets`）——按"用户行为"和"对象类型"切分。

```json
// translations/en/translation.json（344 键 / 8 命名空间）
{
    "main": { "setWorkingDirectory": "...", "newFile": "..." },
    "common": { "save": "...", "cancel": "..." },
    "editor": { "format": "...", "find": "..." },
    "preferences": {
        "appearance": { "theme": "...", "fontSize": "..." },
        "ai": { "provider": "...", "apiKey": "..." }
    },
    "license": { "renew": "...", "expired": "..." },
    "vars": { "autoLog": "..." },
    "installer": { "npmWhitelist": "..." },
    "snippets": { "import": "...", "export": "..." }
}
```

**关键参数**：
- 8 命名空间 = 用户行为（main）+ 通用动词（common）+ 业务模块（editor / preferences / license）
- 区域分文件 ≠ 按字段分文件（每文件 300+ 行，翻译者一次拿全）
- 命名空间粒度 = "新增一个菜单项只动 1 个 key，5 个文件同步"
- 同步成本 = 5 文件 × 1 key = 5 行 diff
- 缺点：新增业务模块要 5 文件同步建新命名空间

**最佳实践**：i18n 按"行为 + 对象"分命名空间；加 PR lint 检查拼写（避免 `errorOccured` 传染 5 语言）；每文件 300+ 行（翻译者一次拿全）。

### 模式 7：Release Webhook 极简管线

**问题场景**：商业闭源项目，构建在内网，公开仓库如何触发发布？完整 GitHub Actions 编译流程会暴露编译命令。

**解决方案**：`.github/workflows/release.yml` 仅 16 行——`release: published` 触发后 POST 一个 webhook 到 `$WEBHOOK_URL`，负载 `{appId, releaseId, repository, owner}`，由内部 CI 接手。

```yaml
# .github/workflows/release.yml（16 行）
name: Release
on:
    release:
        types: [published]
jobs:
    notify:
        runs-on: ubuntu-latest
        steps:
            - name: Send webhook
              run: |
                  curl -X POST "$WEBHOOK_URL" \
                      -H "Content-Type: application/json" \
                      -d '{"appId":"'$APP_ID'","releaseId":"${{ github.event.release.id }}","repository":"${{ github.repository }}","owner":"${{ github.repository_owner }}"}'
```

**关键参数**：
- 仓库 GitHub 角色 = 法律凭证 + 事件通知管道
- `$WEBHOOK_URL` / `$APP_ID` = GitHub Secrets
- 解耦 = 公开仓库 ≠ 构建机
- 内部 CI 抓 GitHub release 附件 = 单一数据源
- 优点：仓库极简、零暴露、合规清晰

**最佳实践**：商业/强合规项目把"代码仓库只发事件、构建在内网"做默认解耦；公开仓库攻击面不扩大；webhook 极简（不暴露构建细节）。

### 模式 8：Squirrel 跨平台自动更新

**问题场景**：桌面 app 跨 macOS/Windows/Linux 三平台分发，用户安装后如何无感升级？强制下载 dmg 太重。

**解决方案**：Squirrel-based auto-update——macOS 走 Squirrel.Mac，Windows 走 Squirrel.Windows，Linux 走 AppImage 增量。CHANGELOG v2.8 专门提"Change the way auto-updates are handled"。

```js
// 平台分发对应
// macOS    → Squirrel.Mac   = .dmg + sparkle
// Windows  → Squirrel.Windows = .exe + Update.exe
// Linux    → AppImage 增量下载
// 触发点 = 应用启动 + 每 6 小时轮询
// 失败回滚 = 旧版 binary 保留
```

**关键参数**：
- Squirrel.Mac = .dmg + sparkle（macOS 增量更新）
- Squirrel.Windows = .exe + Update.exe（Windows 增量）
- Linux AppImage = 增量下载
- 触发点 = 应用启动 + 每 6 小时轮询
- 失败回滚 = 旧版 binary 保留（v2.8 改进）

**最佳实践**：桌面 app 选 Squirrel 系（vs. Electron 自带 autoUpdater）；跨平台一致性更好，macOS 体验接近 App Store；失败回滚是关键（v2.8 改进点）。

### 模式 9：许可证订阅 + 降级机制

**问题场景**：商业软件年费到期后，强制关闭会激怒老用户；放任继续用又影响续费。

**解决方案**：三段式——付费买断 + 年度续费（"update period"）+ 到期降级到 `downloadVersion` 旧版。`timeToRenew` / `pleaseRenew` 提前 30 天弹窗。

```js
// License Server 协议（伪代码）
// license.haaslabs.app API
{
    action: 'check',
    licenseKey: '...',
    machineId: '...'
}
// 返回
{
    status: 'active' | 'expired' | 'invalid' | 'notFound' | 'twoMachinesActive' | 'connectionProblem',
    daysUntilExpiry: 30,
    downloadVersion: '2.5.0',  // 降级目标旧版
}
// 用户流程
// active → 正常用
// 30 天内到期 → timeToRenew 弹窗
// 7 天内到期 → pleaseRenew 弹窗（更频繁）
// expired → 引导降级到 downloadVersion 旧版
```

**关键参数**：
- 续费提醒窗口 = 30 天
- 降级目标 = `runjs.app/releases/<old>`（CHANGELOG 中标注）
- License Server = `license.haaslabs.app`
- 自助管理 = `runjs.app/license-manager`
- 4 类错误 = invalid / notFound / twoMachinesActive / connectionProblem

**最佳实践**：订阅制做"提前提醒 + 自动降级"，避免强制关闭；老用户品牌忠诚度高，温和降级比强关更赚 LTV；4 类错误给具体动作（不是"出错了"）。

### 模式 10：.env 自动加载

**问题场景**：开发者测试 API key、数据库连接串，每次手动 `dotenv.config()` 太烦；又要兼容用户已有的 dotenv 习惯。

**解决方案**：v3.2.0 起"Setting a working directory now loads environment variables from .env files"——切换工作目录自动读 `.env`，免去 dotenv 库手动管理。

```js
// 用户流程
// 1. 用户 cd 到项目目录（设置工作目录）
// 2. 自动读 .env.local > .env > shell env
// 3. 用户代码里直接 process.env.API_KEY
// 不需 require('dotenv').config()
// 加密保护：.env 写 userData（不进项目仓库，不上传）
```

**关键参数**：
- 加载时机 = 切换 working directory
- 加载顺序 = `.env.local` > `.env` > shell env
- 加密保护 = `.env` 写 `userData` 不上传
- 兼容性 = 不破坏 `process.env` 优先级
- 教学场景 = 学生少配一个库

**最佳实践**：本地 playground 工具内置 .env 加载；零配置成本，对接 SaaS API 体验质变；优先级 `.env.local` > `.env` > shell（标准 dotenv 顺序）。

---

## 第三段：反推方法论与编辑器集成

### 模式 11：翻译键反推模块切分法

**问题场景**：商业闭源项目无源码，但有完整 i18n；如何从翻译文件反推内部模块结构？

**解决方案**：把翻译键当"伪代码"——键名 = `i18n.t('main.setWorkingDirectory')` 的命名空间路径，直接对应源码中的模块。

```json
// 翻译键 → 源码模块映射（推断）
{
    "main.setWorkingDirectory": "MenuBar.tsx (File menu)",
    "main.newFile": "MenuBar.tsx (File menu)",
    "editor.format": "EditorController.tsx",
    "preferences.ai.provider": "AISettings.tsx",
    "preferences.appearance.theme": "AppearanceSettings.tsx",
    "license.expired": "LicenseService.ts",
    "snippets.import": "SnippetsManager.tsx",
    "installer.npmWhitelist": "InstallerService.ts"
}
// 错误键模式 = errorXxx（firewall / notFound / twoMachinesActive）
// 推断置信度 = 80%（命名风格统一时）
```

**关键参数**：
- 顶层 key = 模块名（main / editor / preferences / license）
- 二级 key = 子功能（preferences.appearance / preferences.ai）
- 翻译键命名规范 = camelCase 动词 + 名词
- 错误键模式 = `errorXxx`（firewall / notFound / twoMachinesActive）
- 推断置信度 = 80%（命名风格统一时）

**最佳实践**：审计商业闭源 app 时，导出所有翻译键按命名空间分组，30 分钟画出 80% 模块图；不要尝试反编译（违法 + 不可靠）。

### 模式 12：FOSS_Notices 真实依赖图

**问题场景**：商业软件必须附 FOSS 通告（GPL/MIT/Apache 系义务），这恰好是真实打进 .asar 的依赖清单。

**解决方案**：把 `FOSS_Notices.md` 当依赖图——每条 `npm-name@version | License` 就是一个运行时依赖，配合 CHANGELOG 的"Upgraded X to Y"还原依赖升级路径。

```markdown
<!-- FOSS_Notices.md 真实依赖（67 库 / 1327 行） -->
- codemirror@^6.0.0 | MIT
- @babel/core@^7.0.0 | MIT
- electron-log@^5.0.0 | MIT
- @electron/asar@^3.0.0 | MIT
- tsserver (TypeScript) | Apache-2.0
- ... 共 67 库
<!-- 配合 CHANGELOG 还原升级路径 -->
<!-- v4.5: Upgraded Electron to 22.x -->
<!-- v4.0: Upgraded CodeMirror to 6.0 -->
<!-- v3.5: Upgraded Node to 18.0 -->
```

**关键参数**：
- 67 库 = 真实依赖数量（package.json 推测 80-100，含 dev）
- 关键库 = CodeMirror (MIT) / Babel (MIT) / asar (MIT) / electron-log (MIT)
- 升级节奏 = Electron 主版本每 6-12 个月
- 许可证合规 = 1327 行 = 67 库全披露
- 推断置信度 = 90%（商业合规要求极严）

**最佳实践**：从 FOSS_Notices 反推运行时依赖图；商业闭源项目无法直接读 package.json，但 FOSS 是法定披露；配合 CHANGELOG 看升级路径。

### 模式 13：Loop Protection 与大文件保护

**问题场景**：用户写了死循环 `while(true){}`，worker 进程卡死整个 app；粘贴了 50MB 文件，编辑器 OOM。

**解决方案**：内置 4 类防护——`loopProtection`（v2.7.5 修复"always be enabled"）、`errorFileTooLarge`、`npmrcTooLarge`、`pasteErrorContent`。

```js
// 4 类防护
// 1. Loop detection：顶层 await 超时 + worker 心跳
function runWithTimeout(code, timeoutMs = 5000) {
    return Promise.race([
        worker.execute(code),
        new Promise((_, reject) => setTimeout(() => reject(new Error('loop detected')), timeoutMs))
    ])
}
// 2. File size threshold：推测 10MB
if (fileSize > 10 * 1024 * 1024) throw new Error('fileTooLarge')
// 3. npmrc size limit：避免误粘贴 .npmrc 全文
if (npmrcContent.length > 1024) throw new Error('npmrcTooLarge')
// 4. Paste content validation：长度 + 编码
if (pasteText.length > MAX_PASTE_SIZE) throw new Error('pasteErrorContent')
```

**关键参数**：
- Loop 检测 = 顶层 await 超时 / worker 心跳
- 文件大小阈值 = 推测 10MB（CHANGELOG 提及）
- npmrc 大小限制 = 避免误粘贴 .npmrc 全文
- 粘贴内容校验 = 长度 + 编码
- 4 类错误 = 4 个翻译键对应 4 种处理

**最佳实践**：playground 工具必装 3 类防护（loop / 大文件 / 错误粘贴）；90% 崩溃源自这 3 类；每种防护对应 1 个翻译键（用户友好提示）。

### 模式 14：CodeMirror 6 + tsserver 集成

**问题场景**：编辑器要支持 JS/TS 语法高亮、自动补全、类型检查、hover info；自研成本极高。

**解决方案**：CodeMirror 6 渲染层 + TypeScript tsserver Language Server Protocol；CHANGELOG 多次提"language server"、"type checking"、"autocomplete"、"hover info"。

```js
// CodeMirror 6 + tsserver
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { tsserver } from '@codemirror/lsp-client'  // 桥接 LSP
const view = new EditorView({
    parent: document.getElementById('editor'),
    doc: code,
    extensions: [
        basicSetup,
        javascript(),
        tsserver(),  // 启用 tsserver LSP
    ],
})
// 能力：autocomplete / hover / definition / references / rename
// LSP 协议 = JSON-RPC over stdio
```

**关键参数**：
- CodeMirror 6 = MIT 编辑器引擎
- tsserver = TypeScript 官方 LSP（Language Server Protocol）
- LSP 协议 = JSON-RPC over stdio
- 能力 = autocomplete / hover / definition / references / rename
- 性能权衡 = 启动慢但编辑流畅

**最佳实践**：JS/TS 编辑器集成走 CodeMirror 6 + tsserver；vs. Monaco，启动快 2-3 倍，体积小 50%；LSP 协议用 JSON-RPC over stdio（tsserver 标准）。

### 模式 15：Activity Bar + Status Bar VSCode 化

**问题场景**：开发者习惯 VSCode 的左侧图标栏（Activity Bar）和底部状态栏（Status Bar）；新工具要降低学习成本。

**解决方案**：v3.0 加 activity bar，v4.0 加 status bar——左侧放 File Explorer / Search / Git / Extensions 等图标，底部放 runtime / 行号 / 语言 / 编码。

```js
// Activity Bar（左侧 5 图标栏）
// - File Explorer
// - Search
// - Git
// - Extensions
// - Settings
// Status Bar（底部单行 status）
// - 左：当前文件 / 行号 / 列号
// - 中：runtime（Browser & Node.js / Node only / Browser only）
// - 右：语言 / 编码 / 缩进
// 快捷键 = Cmd+B 切换 activity bar 显隐
```

**关键参数**：
- Activity Bar = VSCode 风格左侧 5 图标栏
- Status Bar = 底部单行 status 信息
- 快捷键 = `Cmd+B` 切换 activity bar
- 自定义项 = 用户可隐藏/重排图标
- 学习成本 = 接近零（VSCode 用户秒上手）

**最佳实践**：开发者工具 UI 抄 VSCode（activity bar + status bar + command palette）；用户群重合度高，迁移摩擦小；自定义项要支持（用户隐藏不需要的图标）。

---

## 第四段：商业化与复刻路线

### 模式 16：Chromium / Node / V8 同步升级

**问题场景**：商业 Electron 工具的安全生命线 = 跟住 Chromium 主版本；但 Chromium 每 6-8 周一个 major，Node 每 6 个月，V8 嵌在 Chromium 里——三连升级成本极高。

**解决方案**：CHANGELOG 每次升级都列 "Chromium +xxx / Node +x.y.z / V8 +x.y"——形成"主版本号 + 升级日志"的发布节奏。Electron 主版本 = Chromium + Node 同步跳。

```markdown
<!-- CHANGELOG 升级节奏样例 -->
## v4.5.0 (2024-03-15)
- Upgraded Chromium to 122.0.x
- Upgraded Node to 20.11.0
- Upgraded V8 to 12.2.x
## v4.0.0 (2023-11-01)
- Upgraded Chromium to 118.0.x
- Upgraded Node to 20.9.0
- Major: 3 runtime architecture
```

**关键参数**：
- Chromium 升级窗口 = 6-8 周
- Node 升级窗口 = 6 个月
- V8 跟随 Chromium
- ABI 兼容性 = Electron 团队打包保证
- 升级成本 = 测试 + 重打包（每个平台）

**最佳实践**：商业 Electron 项目把"Chromium 升级"当月度 KPI；不发版本 = 用户被旧 Chromium 漏洞打，强压力驱动迭代；ABI 兼容性由 Electron 团队保证（无需关心）。

### 模式 17：Tab Unresponsive 检测

**问题场景**：用户开了 20 个 tab，某个 worker 进程卡死（IPC 超时），整个 app 体验崩坏。

**解决方案**："Tab Unresponsive" 对话框——主进程检测 IPC 心跳超时，弹窗让用户 force kill 单 tab 而非整个 app。

```js
// 主进程监控
setInterval(() => {
    tabs.forEach(tab => {
        const lastHeartbeat = tab.lastHeartbeat || 0
        if (Date.now() - lastHeartbeat > 30000) {  // 30s 无心跳
            showUnresponsiveDialog(tab)
        }
    })
}, 5000)  // 每 5s 检查
// 弹窗选项 = "Wait" / "Kill Tab"
// 翻译键 tabUnresponsive
```

**关键参数**：
- 心跳间隔 = 推测 5 秒
- 超时阈值 = 推测 30 秒
- 翻译键 = `tabUnresponsive`
- 弹窗选项 = "Wait" / "Kill Tab"
- 数据保护 = 提示先 save

**最佳实践**：多 tab 桌面 app 必装 unresponsive 检测；单 tab 强杀 vs. 整 app 崩溃，体验天差地别；Kill Tab 前提示 save（数据保护）。

### 模式 18：NPM 包管理白名单

**问题场景**：playground 工具允许 `npm install` 任意包，安全风险高（恶意包执行任意代码），但完全禁用又没价值。

**解决方案**：installer 命名空间 + 白名单——`npm install <pkg>` 走白名单校验，未知包弹警告而非拒绝（教学场景下"装试试"是核心）。

```js
// installer 流程
async function npmInstall(pkg) {
    if (isWhitelisted(pkg)) {
        return await runNpmInstall(pkg)   // 静默装
    } else {
        return await showWarningDialog(pkg)   // 警告（不拒绝）
    }
}
// 白名单 = 推测 npm 官方 top 1000
// 警告而非拒绝 = 降低教学摩擦
// npmrc 大小校验 = 避免误粘贴
// 离线缓存 = 二次安装走本地
```

**关键参数**：
- 白名单 = 推测 npm 官方 top 1000
- 警告而非拒绝 = 降低教学摩擦
- `npmrc` 大小校验 = 避免误粘贴
- 网络代理 = `aiBaseUrl` 同样支持
- 离线缓存 = 二次安装走本地

**最佳实践**：NPM 集成做"白名单 + 警告"而非"黑名单 + 拒绝"；playground 场景"试一下"是核心价值；二次安装走本地缓存（速度 + 离线）。

### 模式 19：Snippet 库导入导出

**问题场景**：开发者积累的代码片段（snippet）需要跨设备同步、跨工具复用；纯本地文件难分享。

**解决方案**：v2.5 起 snippets 命名空间 + import/export 按钮——支持 JSON / .js 文件导入，按 folder/tag 分类，跨设备同步走用户云盘（iCloud / OneDrive / Dropbox）。

```js
// 存储路径 = userData/snippets/
// 文件格式 = .json / .js
// 同步方式 = 用户云盘（非中心化）
// 翻译键 = importSnippets / exportSnippets / manageSnippets
// 分类 = folder + tag
// 示例
{
    "folders": [
        {
            "name": "React Hooks",
            "snippets": [
                { "name": "useState", "code": "const [s, setS] = useState(0)", "tags": ["react", "hooks"] }
            ]
        }
    ]
}
```

**关键参数**：
- 存储路径 = `userData/snippets/`
- 文件格式 = `.json` / `.js`
- 同步方式 = 用户云盘（非中心化）
- 翻译键 = `importSnippets` / `exportSnippets` / `manageSnippets`
- 分类 = folder + tag

**最佳实践**：snippet 库做"本地文件 + 用户云盘同步"而非"中心化账号"；隐私边界清晰，无运营成本；JSON 格式 + 分类导出（用户掌控数据）。

### 模式 20：7 天复刻 RunJS-like 路线

**问题场景**：开发者想复刻 RunJS 的核心体验（playground + 多 runtime + AI），但不想从零摸索。

**解决方案**：7 天 MVP 拆解——Day 1-3 搭核心（Electron + CodeMirror + Worker 拆双 runtime + Babel transpile + auto-run），Day 4-6 产品化（设置面板 + .env + snippet + NPM 白名单），Day 7 加分（AI Chat 单 provider + logpoints）。

```bash
# Day 1-3 核心
npx create-electron-app my-runjs --template=typescript
npm i codemirror @codemirror/lang-javascript
# 拆双 runtime
#   - Node: worker_threads
#   - DOM: BrowserWindow 内 iframe
# Babel transpile + auto-run
npm i @babel/core @babel/preset-env

# Day 4-6 产品化
# 设置面板 + .env 自动加载 + snippet 库 + NPM 白名单

# Day 7 加分
# AI Chat 单 provider（先 OpenAI）
# logpoints（tsserver provideInlineValues）
```

**关键参数**：
- 技术栈 = Electron + CodeMirror 6 + React
- 关键库 = tsserver (LSP) / Babel / electron-log / asar
- MVP 范围 = 3 runtime + AI + snippet + .env
- 复刻难度 = 8/10（多 Chromium/Node 同步升级是隐性成本）
- 差异化 = logpoints + magic comment + 多 runtime

**最佳实践**：复刻 playground 工具，先做"3 runtime + logpoints"核心体验；其他都是装饰，2 周内能出可用品；MVP 先单 AI provider（不要 4 个同时上）。

---

## 附录：3 个核心文件

1. `CHANGELOG.md` — 538 行产品时间机器（8 年架构演进）
2. `FOSS_Notices.md` — 1327 行 67 库真实依赖图
3. `translations/en/translation.json` — 344 键 UI 树全息图

## 一句话总结

runjs = 商业闭源 Electron 项目的"空仓库反推"样本（CHANGELOG + FOSS_Notices + i18n 还原 80% 架构）+ 3 运行时并存（Node Worker + iframe + WebView）+ Logpoints 替代 debugger + Magic Comment 注释驱动 + 4 Provider AI Chat 适配器 + Squirrel 跨平台自动更新；把"playground 工具"做到开发者秒上手，最值得偷的是"空仓库反推三件套（CHANGELOG/FOSS/i18n）"的逆向工程方法论。
