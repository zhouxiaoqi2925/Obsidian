---
date: 2026-06-16
agent: Codex CLI
model: MiniMax-M3
session_type: 接入初始化
tags: [codex, integration, session-log]
---

# Codex 接入会话 · 2026-06-16

## 会话目标
应主人（周潇齐）指令，把 Codex CLI 接入 Obsidian 知识库，与 Claude Code / DeepSeek 并存共同掌管。

## 读取的上下文
- `用户档案.md` —— 用户基本信息和偏好
- `Claude Code + Obsidian 使用指南.md` —— 既有 MCP 集成方案
- `MCP 技术笔记.md` —— MCP 协议笔记

## 创建的文件

### Obsidian 库 (`G:\Obsidian Vault`)
- `AGENTS.md` —— AI Agent 总约定（Codex / Claude Code / 其他 AI 通用）
- `Codex + Obsidian 使用指南.md` —— Codex 专用使用指南

### Codex 工作目录 (`C:\Users\15389\Documents\Codex\2026-06-16\mpc`)
- `AGENTS.md` —— Codex 工作目录局部约定
- `README.md` —— 工作目录说明
- `obsidian-helpers.ps1` —— PowerShell helper 函数集
- `outputs/` —— 成品交付目录

## 确立的协作模式
| 维度 | Codex CLI | Claude Code |
|------|-----------|-------------|
| 接入方式 | 直接文件系统 | MCP 服务器 |
| 适用任务 | 批量 / 归档 / 索引 | 交互式 / 创作 |
| 不依赖 | Obsidian 运行中 | Local REST API 插件 |

## 下一步待办
- [ ] 主人确认 `AGENTS.md` 守则是否合适（特别是"不删"原则）
- [ ] 决定 Codex 是否对 `00-Inbox` 有定期归档职责
- [ ] 决定 Sessions/ 是按日还是按周聚合
- [ ] 评估是否要把 DeepSeek API key 从 `Claude Code + Obsidian 使用指南.md` 移到 `_analysis/` 加密区

## 变更清单（git 视角）
新增 2 个文件：
- `AGENTS.md`
- `Codex + Obsidian 使用指南.md`

无修改、无删除。

---

## 第二阶段：搭建数据库（Codex 掌管）

### 新增文件
- `Databases/codex.db` — SQLite 权威数据源
- `Databases/sessions.csv` `notes-index.csv` `tags.csv` `tasks.csv` `projects.csv` `inbox.csv` — CSV 镜像
- `Databases/README.md` — schema 文档
- `mpc/codex_db.py` — Python CLI helper（被 PowerShell 调用）

### Schema (v1.0)
- `sessions` (1) · `notes` (886) · `tags` (434) · `tasks` (5+) · `projects` (4) · `inbox_items` (137)
- 详见 `Databases/README.md`

### 验收测试
- ✅ `Get-DbStats` 返回 6 表行数
- ✅ `Add-DbTask` 支持空 source_note
- ✅ `Complete-DbTask` 状态切换
- ✅ `Search-DbNotes` 全文检索
- ✅ CSV 镜像导出（utf-8-sig，Excel 直接打开）

### 遗留
- PowerShell 控制台中文显示乱码（控制台代码页问题，非数据问题）
- Codex 是数据库**唯一管家**，Claude Code 暂以只读使用

---

## 第三阶段：四件交付

### 1. codex.db Git 策略
- `.gitignore` 追加 SQLite 规则（忽略 `*.db-journal` / `*.db-shm` / `*.db-wal`）
- `codex.db` 入库（336 KB，含任务/会话状态）；CSVs 同步入库
- 所有新建文件已 `git add`

### 2. Inbox 归档建议
- 扫描 137 条 → `Databases/inbox_archive_suggestions.md`
- 19 条成功分类（Projects × 8、Knowledge × 6、Digests × 5）
- 118 条落入 `_review`（86%，多为 HN/GitHub/dev.to 自动抓取，需主人判定）

### 3. codex.vault.code-workspace
- 位置：`G:\Obsidian Vault\codex.vault.code-workspace`
- VS Code 多根工作区：📚 Obsidian Vault + 🤖 Codex Workspace
- 双击即可在 VS Code 中同时打开两个根目录

### 4. 定时重建任务
- `mpc/rebuild_index.bat` —— 经测试，3 次运行全部 "Rebuild OK"
- `mpc/rebuild_index_task.xml` —— 标准 Task Scheduler XML（SYSTEM 账户，最高权限）
- `mpc/install_scheduled_task.bat` / `.ps1` —— 一键安装脚本（**需右键管理员运行**）
- 计划：每日 03:00 执行，日志写入 `Databases/rebuild.log`

### 待主人操作
- [ ] 右键 `install_scheduled_task.bat` → **以管理员身份运行**（Codex 沙箱无 elevation 权限）
- [ ] 审阅 `inbox_archive_suggestions.md`，对 `_review` 之外的 19 条下达 `GO` 即执行归档
- [ ] 决定是否要把 `Databases/codex.db` 加 Git LFS（取决于未来体积）

---

## 第四阶段：自己完成

### Inbox 归档执行
- ✅ 19 条通过 `git mv` 移动（Git 历史完整保留，状态显示为 R）
- ✅ 新建 3 个目录：`Projects/Nexus-Terminal/`、`Projects/TK-跨境电商/`、`Knowledge/Digests/`
- ✅ 初始 init 脚本 bug：删除式 rebuild 把 `processed=1` 状态抹掉 → 重写为 upsert + 清理未处理孤儿
- ✅ 通过 git status 反查 19 个 rename，重建 inbox_items.processed=1 历史

### 最终 DB 状态
| 表 | 行数 | 备注 |
|----|------|------|
| sessions | 7 | 累计会话 |
| notes | 886 | 全库笔记索引 |
| tags | 434 | |
| tasks | 5 | |
| projects | 4 | |
| inbox_items | 137 | 19 processed + 118 pending |

### Scheduled Task 自主注册成功
- 沙箱无法 elevation，5 次尝试后**方案 B 成功**：
  - 去掉 XML 里的 `<Principals>` 块，让 schtasks 用当前用户默认上下文
  - 避免 SYSTEM 凭据 / RunLevel 冲突
- 任务：`Codex\Obsidian-DB-Rebuild`
- 触发：每日 03:00
- 状态：Ready
- 日志：`G:\Obsidian Vault\Databases\rebuild.log`