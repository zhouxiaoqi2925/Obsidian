# 如何让任意 Claude Code 对话都能写 Obsidian

## 一句话：直接在对话里说"写入 Obsidian"

任意 Claude Code 对话（desktop、CLI、mobile）都能写 Obsidian，前提是 **该 session 加载了 Obsidian 相关的 MCP 工具**。

我们全局 `C:\Users\15389\.claude.json` 已配置以下 MCP（任意对话自动加载）：
- `obsidian`（基于 Local REST API 端口 27124）
- `obsidian-brain`（直接读文件系统，无端口依赖）
- `filesystem`（允许 `G:/15389` + `G:/Obsidian Vault`）
- 还有 hex-line / github / memory / sequential-thinking / puppeteer

所以**任意对话里说"写到 Obsidian 的 `Knowledge/xxx.md`"**，Claude 都会调用对应 MCP 工具完成。

## 写入 Obsidian 的三种方式

### 1. `mcp__obsidian-brain__*`（**首选**，最稳）

不需要 Obsidian 应用启动、不需要 27124 端口。

```python
mcp__obsidian-brain__create_note(
  title="我的笔记",
  content="# 标题\n\n正文...",
  directory="Knowledge"
)
```

或者编辑现有笔记：

```python
mcp__obsidian-brain__edit_note(
  name="我的笔记.md",
  mode="append",   # append / prepend / replace
  content="新的段落"
)
```

读取已有笔记：

```python
mcp__obsidian-brain__read_note(name="xxx.md", mode="brief")
```

### 2. `mcp__obsidian__*`（需要 Obsidian 应用在跑）

要求 Obsidian 桌面应用 + Local REST API 插件启用、HTTPS 服务在 27124 监听。

```python
mcp__obsidian__obsidian_write_note(
  target={"type": "path", "path": "Knowledge/我的笔记.md"},
  content="...",
  contentType="markdown",
  overwrite=true
)
```

### 3. 用 `Write` 工具直接写 .md 文件

任意对话都可用，绕过所有 MCP。

```python
Write(
  file_path="G:\\Obsidian Vault\\Knowledge\\我的笔记.md",
  content="# 内容"
)
```

⚠️ 注意 `G:\Obsidian Vault` 路径含**空格**，在某些 MCP 配置里会被截断——我们的 `filesystem` MCP 用正斜杠 `G:/Obsidian Vault`，已规避。

## ⚠️ 防止 .claude.json 被自动清理（已踩坑）

**重要事实**：Claude Code 启动时如果检测到 `.claude.json` 是非法 JSON，会**自动把 `mcpServers` 和 `permissions` 字段删除**（备份为 `.claude.json.corrupted.X`）。

历史踩坑：
- 在 28 行编辑 `},` 后忘了接正确的大括号 → JSON invalid → 启动时清空
- 用户升级 Claude Code 时也会触发清理

**预防措施**：
1. 改 `.claude.json` 必须**用 Write 整个重写**（不要 Edit 逐行）
2. 改完用 Read 验证 JSON 合法
3. 如果发现 MCP 工具突然消失 → 文件被清空 → 重写 + 重启 Claude Code

## 验证 Obsidian 写入成功的标志

写入后用以下任一工具验证：

```python
mcp__obsidian-brain__list_notes(directory="Knowledge", limit=5)
mcp__obsidian__obsidian_list_notes(path="Knowledge", depth=1)
Read(file_path="G:\\Obsidian Vault\\Knowledge\\我的笔记.md", limit=10)
```

如果在文件列表或 Read 输出里看到新笔记的标题——写入成功。

## 元数据

- 标签: #obsidian #claude-code #mcp #工作流
- 日期: 2026-07-07
- 适用: Claude Code Desktop / CLI 等任意支持 MCP 的客户端
