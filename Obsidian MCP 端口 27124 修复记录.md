# Obsidian MCP 端口 27124 连接失败 - 排查与修复

## 问题

启动 Claude Code，配置 `mcpServers.obsidian` 指向本地 Obsidian Local REST API（`https://127.0.0.1:27124/`），但所有 `mcp__obsidian__*` 工具调用都返回：

```
Error: fetch failed (failed after 4 attempts)
```

`Puppeteer` 直接访问 `https://127.0.0.1:27124/` 也 `ERR_CONNECTION_REFUSED`。
任务管理器确认 `Obsidian.exe` 进程在跑。

## 排查路径

### 第一层：配置文件不匹配
对比 `C:\Users\15389\.claude.json` 与 `G:\Obsidian Vault\.obsidian\plugins\obsidian-local-rest-api\data.json`：
- API key 一致 ✅
- `OBSIDIAN_BASE_URL` 端口一致 ✅
- HTTPS 启用、port 27124 一致 ✅

不是配置问题。

### 第二层：插件未启动
读 `G:\Obsidian Vault\.obsidian\community-plugins.json`：
- `obsidian-local-rest-api` 在启用列表里 ✅

### 第三层：Obsidian 主进程问题
看 `AppData\Roaming\Obsidian\`（确认进程真的跑）、`workspace.json`（确认 vault 已加载）—— 一切看起来正常。

**所有迹象**：Obsidian 主进程 + 插件都已经加载，但 27124 端口**没有任何进程监听**。

### 真正的根因：僵尸 renderer 进程占着端口

任务管理器找到 **多个 Obsidian.exe** 进程（主进程 + GPU/renderer 子进程）。
这些 zombie 进程**之前崩溃/未干净退出**，操作系统仍把 27124 视为占中状态。
新启动的 Obsidian 主进程里 Local REST API 插件调用 `secureServer.listen(27124)` → **`EADDRINUSE`** → 静默失败（插件代码缺 `secureServer.on("error", ...)`）。

## 验证（详见 main.ts）

Obsidian Local REST API 插件在 `https://127.0.0.1:27124` 启动逻辑（节选自 main.ts）：

```ts
this.secureServer = https.createServer({ key, cert }, this.requestHandler.api);
this.secureServer.listen(this.settings.port, this.settings.bindingHost ?? DefaultBindingHost);
```

**这里缺少 `secureServer.on("error", err => ...)`**，所以 `EADDRINUSE`、`证书加载失败` 等异常**会静默抛到 Obsidian console，不会重试也不会显示**——这是一个真实的上游 bug（项目地址: coddingtonbear/obsidian-local-rest-api）。

## 修复

1. **任务管理器**（Ctrl+Shift+Esc）
2. 找**所有** Obsidian.exe → 全部 **结束任务**
3. 等 5 秒
4. 重新**双击桌面 Obsidian 图标**打开
5. 等 Obsidian 完全加载（10 秒后状态栏稳定）
6. 立刻可连：`mcp__obsidian__obsidian_list_notes` 返回 vault 笔记列表

## 经验教训

- **Local REST API 静默失败是已知坑**——端口冲突 / 证书加载错误都没 UI 反馈，必须看 DevTools console（`Ctrl+Shift+I`）
- 端口冲突的常见原因是 **zombie renderer 进程未干净退出**，不是病毒也不是配置
- **测试时先重启整个进程家族** 而不是单进程，比来回改配置高效

## 关键文件位置

| 文件 | 作用 |
|---|---|
| `C:\Users\15389\.claude.json` | Claude Code MCP + permissions 配置 |
| `G:\Obsidian Vault\.obsidian\plugins\obsidian-local-rest-api\data.json` | 端口、API key、证书 |
| `G:\Obsidian Vault\.obsidian\community-plugins.json` | 已启用插件列表 |
| `G:\Obsidian Vault\.obsidian\plugins\obsidian-local-rest-api\main.ts` | 插件源码（listen 无 error 监听） |

## 备用方案（如果还不行）

如果重启还是失败，可改配置：
- 把端口改成 `27125`（避开冲突）
- `data.json` 加 `"bindingHost": "0.0.0.0"`（绑定所有网卡）
- 同步改 `.claude.json` 的 `OBSIDIAN_BASE_URL`
- 然后**再重启 Obsidian 主进程**（改 data.json 不重启不生效）

或者直接用 `obsidian-brain` MCP（不依赖 27124 端口），它从一开始就正常：
- `mcp__obsidian-brain__list_notes`
- `mcp__obsidian-brain__read_note`
- `mcp__obsidian-brain__search`

## 元数据

- 标签: #obsidian #mcp #troubleshooting #local-rest-api
- 日期: 2026-07-07
