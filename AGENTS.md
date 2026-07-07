# AGENTS.md - Obsidian Vault AI Agent Convention

> 任何 AI Agent（Codex CLI、Claude Code、Cursor 等）操作本库时的总约定。
> 最后更新：2026-07-07
> 主人：周潇齐（zhxq）

## 已注册 AI 工具
| 工具 | 接入方式 | 适用场景 |
|------|---------|---------|
| Claude Code | MCP（obsidian / obsidian-brain / hex-line） | 交互式会话 |
| Codex CLI | MCP（obsidian-mcp-server 3.2.9 → Local REST API :27124） | 脚本化批量 + 交互式会话（2026-07-07 由直读改 MCP） |
| DeepSeek | 通过 Claude Code 间接接入 | 模型推理 |

## 所有权边界（核心约定）

**两件事是分开的，别搞混：**

| 类别 | 是什么 | 谁拥有 | 写权限 |
|------|--------|--------|--------|
| **知识库** | Obsidian 库内全部 `.md` 笔记（`00-Inbox`/`Inbox`/`Daily`/`Projects`/`Knowledge`/`Wiki`/`实战案例`/`开发手册`/`Sessions` 等） | **周潇齐** | 仅主人；AI Agent 需明确指令才动 |
| **元数据库** | `G:\Obsidian 数据库\codex.db` + `G:\Obsidian 数据库\*.csv` | **Codex CLI** | Codex 自由读写，但**仅限元数据** |

**Codex 的禁区（碰了就违规）：**
- ❌ 把笔记正文 / 段落 / 摘要 / 概念解释写入 `codex.db` 任何字段
- ❌ 用 AI 提取 / 压缩 / 改写主人的笔记后存入数据库
- ❌ 把"知识"从 `.md` 文件迁移到 DB（哪怕只是缓存）
- ❌ 在主人未授权时生成新的"知识类"笔记

**Codex 可以做的（元数据层）：**
- ✅ 索引文件路径、字数、tag、修改时间、链接数
- ✅ 追踪 Inbox 处理状态、任务状态、项目状态
- ✅ 移动文件位置（不改内容）
- ✅ 生成 CSV 镜像供 Obsidian 查看
- ✅ 跑定时索引重建

**审计方法：** 任何时刻可执行 `python mpc/audit_db.py` 检查数据库是否"纯净"。

## 目录分工
| 目录 | 用途 | 主责 AI |
|------|------|---------|
| `00-Inbox` / `Inbox` | 待整理的快速捕获 | Codex（去重 / 归档） |
| `Daily` | 每日日志 | 任意 AI（追加） |
| `Sessions` | AI 会话记录 | 自动追加 |
| `Projects` | 项目文档 | Codex + Claude Code 并行 |
| `Knowledge` | 长期知识 | 仅追加、不删 |
| `Wiki` | 概念百科 | 任意 AI |
| `实战案例` | 案例归档 | Codex 优先 |
| `开发手册` | 工程手册 | Codex 优先 |
| `Dashboard` | 仪表盘 | 任意 AI |
| `_analysis` | AI 分析输出 | 任意 AI |
| `Templater` / `Excalidraw` | 模板与画图 | 不动 |
| `.obsidian` / `.claude` / `.claudian` / `copilot` | 配置 | 不动 |

## 操作守则
1. **不删**：永远不要删除笔记（除非主人明确指令并二次确认）。
2. **不覆盖**：默认追加，避免覆盖他人或自己前一轮的工作。
3. **先读后写**：修改笔记前先 `rg` 或 `Get-Content` 确认存在性与当前内容。
4. **尊重 frontmatter**：保留 YAML 元数据，不要擅改 `tags` / `created` / `aliases`。
5. **wikilink 优先**：笔记间引用用 `[[笔记名]]` 格式。
6. **批量前确认**：跨分区移动、批量重命名、删除前先报清单，等主人确认。
7. **Git 守门**：库已用 Git 跟踪；批量操作前 `git status` 看一眼脏状态。
8. **隐私红线**：API key、token、个人凭证严禁写入笔记。

## 冲突仲裁
若两个 AI 同时编辑同一文件：
1. 后到的立即 `git diff` 检视冲突；
2. 报给主人（周潇齐）仲裁；
3. 不要默默覆盖。

## Codex CLI 接入详情
- 详见 `Codex + Obsidian 使用指南.md`
- 工作目录：`C:\Users\15389\Documents\Codex\2026-06-16\mpc`
- 进入会话先读 `用户档案.md` + `AGENTS.md`
- **2026-07-07 变更**：Codex CLI 接入方式由"直接文件系统访问"改为 **MCP（obsidian-mcp-server 3.2.9）**，走 Local REST API :27124 HTTPS。
  本次变更由主人周潇齐在 2026-07-06 当日会话中显式拍板授权，
  详见 `Sessions/Codex-MCP-接入-2026-07-06.md`。
  - 限制：omnisearch / commands（`OBSIDIAN_ENABLE_COMMANDS`）默认关闭。
  - 与 Claude Code 共用同一组 Local REST API API key，双 AI 写冲突按"冲突仲裁"条款处理。
  - 隐私红线（API key 不进 .md）依然有效；如需轮换 key，必须同步更新 `~/.codex/config.toml`。
  - Codex CLI 仍保留对 Vault 文件系统的直接访问能力（这是 MCP 协议默认允许的 fallback），但**默认不再走直读**，除非主人明确要求。

## Claude Code 接入详情
- 详见 `Claude Code + Obsidian 使用指南.md`
- MCP：obsidian（REST 27124）/ obsidian-brain（直读）/ hex-line（代码编辑）

## Codex 掌管的元数据库（不是知识库）
- 位置：`G:\Obsidian 数据库\codex.db` (SQLite) + `G:\Obsidian 数据库\*.csv` (镜像)
- 详见 `G:\Obsidian 数据库\README.md`
- Codex 是元数据库**唯一管家**：schema 演进、索引重建、备份都由 Codex 执行
- Claude Code 暂以只读方式使用，写操作需主人授权
- **关键约束：DB 内仅存元数据，不存知识内容**（见上方"所有权边界"）