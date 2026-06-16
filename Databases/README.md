---
tags: [codex, database, system]
---

# Databases — Codex 掌管的数据库

## 概述
Codex 维护的 Obsidian 库元数据库。SQLite 作为权威数据源，CSV 作为 Obsidian 可读镜像。

## 文件清单

| 文件 | 类型 | 用途 |
|------|------|------|
| `codex.db` | SQLite | 权威数据源，Codex 通过 helper 函数读写 |
| `sessions.csv` | CSV | AI 会话记录 |
| `notes-index.csv` | CSV | 全库笔记索引（886 条） |
| `tags.csv` | CSV | tag 聚合统计（434 个） |
| `tasks.csv` | CSV | 任务清单 |
| `projects.csv` | CSV | 项目清单 |
| `inbox.csv` | CSV | Inbox 状态（137 条） |
| `README.md` | 文档 | 本文件 |

## Schema (v1.0)

### sessions
所有 AI 会话记录。
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| date | TEXT | YYYY-MM-DD |
| agent | TEXT | codex / claude-code / deepseek |
| model | TEXT | 模型名 |
| summary | TEXT | 一句话摘要 |
| session_file | TEXT | 对应笔记路径 |
| created_at | TEXT | 入库时间 |

### notes
全库笔记索引。
| 字段 | 类型 | 说明 |
|------|------|------|
| path | TEXT UNIQUE | 相对库路径 |
| title | TEXT | 一级标题或文件名 |
| size_bytes | INTEGER | 文件大小 |
| modified_at | TEXT | 最后修改时间 |
| word_count | INTEGER | 字数 |
| tags | TEXT (JSON) | frontmatter tags 数组 |
| links_out | INTEGER | 出链数（`[[...]]`） |
| folder | TEXT | 父目录 |
| has_frontmatter | INTEGER | 是否有 YAML frontmatter |

### tags
tag 使用频次聚合。

### tasks
任务清单。
| 字段 | 类型 | 说明 |
|------|------|------|
| status | TEXT | open / done / cancelled |
| priority | TEXT | P0 / P1 / P2 / P3 |

### projects
项目元数据。
| 字段 | 类型 | 说明 |
|------|------|------|
| status | TEXT | active / paused / done / archived |
| folder | TEXT | 在库中的对应分区 |

### inbox_items
Inbox 文件状态追踪。

### schema_meta
schema 版本号与最后重建时间。

## 使用方式

### Codex 会话内（推荐）
在 Codex 工作目录 dot-source helpers：
```powershell
. "C:\Users\15389\Documents\Codex\2026-06-16\mpc\obsidian-helpers.ps1"
Get-DbStats
Get-DbRecentNotes -Limit 10
Search-DbNotes "MCP"
Get-DbTopTags -Limit 15
Add-DbTask -Text "整理 Inbox" -Priority P1
Rebuild-DbIndex
```

### 直接 Python
```python
import sqlite3
conn = sqlite3.connect(r"G:\Obsidian Vault\Databases\codex.db")
conn.row_factory = sqlite3.Row
for row in conn.execute("SELECT path, title FROM notes ORDER BY modified_at DESC LIMIT 10"):
    print(row["path"], "|", row["title"])
```

### Obsidian 内查看
- CSV 文件用 Dataview 或表格插件打开
- 或直接拖入 Bases 视图

## 重建索引
修改笔记后数据可能滞后，运行：
```powershell
Rebuild-DbIndex
```
或在 Codex 工作目录执行：
```bash
python init_database.py
```

## 数据归属
- Codex 是数据库的**唯一管家**：负责 schema 演进、索引重建、备份
- Claude Code 暂以只读方式使用此数据库（通过 helper）
- 任何 schema 变更需在 `Sessions/` 留下记录

## 备份策略
- 数据库文件加入库 Git 跟踪
- 每周 Codex 会话自动执行 `Rebuild-DbIndex`（建议加入 cron / scheduled task）
- 关键变更前 Codex 会先 `git status` + 提示备份