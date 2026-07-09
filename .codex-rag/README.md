# Codex Desktop 第二大脑基础设施

部署在 G:\Obsidian Vault\.codex-rag\ 的本地第二大脑基础设施。
主人:周潇齐。生成日:2026-07-09。

## 架构

`
┌─────────────────────────────────────────────────────────────┐
│                    Codex Desktop 桌面端                       │
│                  (会话型,人工触发)                            │
└──────────────────────┬──────────────────────────────────────┘
                       │ 启动时按 SKILL.md 跑 preflight
                       │ 读 AGENTS.md / 用户档案 / 最近 Sessions
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           G:\Obsidian Vault\   (知识层,1494 笔记)            │
│                                                              │
│   Inbox / Projects / Knowledge / Wiki / Daily / Sessions /   │
│   实战案例 / 开发手册 / Dashboard / _analysis / AGENTS.md    │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┬──────────────┐
        │              │              │              │
        ▼              ▼              ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ Watcher │   │   RAG    │   │  Tasks   │   │ Sessions │
   │ (实时)   │   │ (语义)   │   │ (定时)   │   │ (会话)   │
   └─────────┘   └──────────┘   └──────────┘   └──────────┘
   监控文件变化   ChromaDB +     4 个 .ps1     Codex 桌面端
   → AutoLog     多语言嵌入     每天/每小时    自己追加
`

## 三层功能

### 第 1 层:Watcher(实时)
- **脚本**:scripts/watcher.ps1
- **触发**:任何 .md 文件 create/change/delete/rename
- **输出**:Sessions/Codex-AutoLog-YYYY-MM-DD.md(每天一份)
- **启动**:
  `powershell
  Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile","-File","G:\Obsidian Vault\.codex-rag\scripts\watcher.ps1"
  `
- **停止**:任务管理器 → 找 powershell 进程 → 结束

### 第 2 层:定时任务(4 个)
| 任务 | 频率 | 时间 | 脚本 | 输出 |
|---|---|---|---|---|
| Codex-SecondBrain-ScanInbox | 每天 | 09:00 | scan-inbox.ps1 | Dashboard/inbox-triage-YYYY-MM-DD.md |
| Codex-SecondBrain-CheckDaily | 每天 | 09:30 | check-daily.ps1 | Dashboard/daily-gaps-YYYY-MM-DD.md |
| Codex-SecondBrain-VaultSnapshot | 每天 | 23:50 | vault-snapshot.ps1 | _analysis/vault-snapshot-YYYY-MM-DD.md |
| Codex-SecondBrain-Port27124 | 每小时 | 整点 | check-port-27124.ps1 | Dashboard/port-27124-YYYY-MM-DD.md (仅状态变化时) |

**注册**:
`powershell
powershell -ExecutionPolicy Bypass -File "G:\Obsidian Vault\.codex-rag\scripts\register-tasks.ps1"
`

**查看**:任务计划程序 → 找 Codex-SecondBrain-*

### 第 3 层:RAG 语义搜索
- **嵌入模型**:paraphrase-multilingual-MiniLM-L12-v2(多语言,中文 OK,~470MB)
- **向量库**:ChromaDB(persistent,存 .codex-rag/data/chroma/)
- **MCP 工具**:ag_search(query, top_k, path_prefix) —— 接进 Codex 桌面端
- **CLI**:
  `ash
  # 索引
  "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe" "G:\Obsidian Vault\.codex-rag\scripts\index.py" --incremental
  "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe" "G:\Obsidian Vault\.codex-rag\scripts\index.py" --full

  # 搜索
  "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe" "G:\Obsidian Vault\.codex-rag\scripts\search.py" 上次关于 RAG 的讨论 -n 5
  "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe" "G:\Obsidian Vault\.codex-rag\scripts\search.py" Nexus Terminal architecture --path-prefix Projects/
  `

## 安装步骤(已经做完)

1. ✅ 创建 .codex-rag/ 目录结构
2. ✅ 写 10 个脚本(index/search/mcp/watcher/4 tasks/install/register/README)
3. ✅ 更新 vault .gitignore 屏蔽 .codex-rag/
4. ⏳ 创建虚拟环境 + 装依赖(本会话进行中)
5. ⏳ 跑首次全量索引(本会话进行中)
6. ⏳ 注册 4 个定时任务(本会话进行中)
7. ⏳ 启动 watcher(本会话进行中)
8. ⏳ 配置 Codex 桌面端 MCP(本会话进行中)

## 边界 / 不做什么

- **不写** G:\Obsidian 数据库\codex.db(那是 Codex CLI 领地,桌面端不碰)
- **不删** vault 任何文件(遵守 vault AGENTS.md)
- **不覆盖** vault 已有 .md(默认追加)
- **不动** 40-Archive/(只读)
- **不读** ttachments/(文本扫描)
- **不暴露** secrets(API key、token、个人凭证绝不出现在笔记中)

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 搜索为空 | 数据库没建 | 跑 index.py --full |
| 搜索结果差 | 模型没下载完整 | 删 ~/.cache\huggingface\ 重跑 |
| 定时任务不跑 | 用户没登录 / 任务被禁用 | 任务计划程序 → 检查 Codex-SecondBrain-* |
| watcher 没启动 | 没开过 | 重新跑启动命令 |
| MCP 调用失败 | 端口 / 路径 | 查 .codex-rag\logs\ |

## 维护建议

- **每周**:看 Dashboard/inbox-triage-*.md,处理 Inbox
- **每月**:对比 _analysis/vault-snapshot-*.md,看增长趋势
- **vault 大量变更后**:跑 index.py --full 重建
- **新加 skill / 改 AGENTS.md**:不需要重索引,代码变化不影响 RAG