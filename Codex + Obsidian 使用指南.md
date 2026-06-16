# Codex CLI + Obsidian 集成指南

## 概述
本文档记录 Codex CLI 与 Obsidian 知识库的协作方式。平行于 `Claude Code + Obsidian 使用指南.md`，两者并存、互不冲突。

## 与 Claude Code 的差异
| 维度 | Claude Code | Codex CLI |
|------|-------------|-----------|
| 接入方式 | MCP 服务器 | 直接文件系统访问 |
| Obsidian 运行要求 | 必须运行 + Local REST API 插件 | 不需要 |
| 工具命名 | `mcp__obsidian__*` | 直接 `exec_command` / `Get-Content` |
| 沙箱模式 | 通常受限 | 默认 `danger-full-access` |
| 典型场景 | 交互式会话 | 脚本化批量任务、CI 流水线 |

## 核心能力
通过 `exec_command` 调用 PowerShell / `rg` / `git` 即可完成：
- 读写笔记（`.md` / `.canvas`）
- 全库搜索（关键词 / tag / wikilink）
- Git 版本管理（`git status` / `diff` / `commit`）
- 批量处理（重命名 / 归档 / frontmatter 修改）

## 常用操作速查

### 列出笔记
```powershell
Get-ChildItem "G:\Obsidian Vault" -Recurse -Filter *.md | Select-Object FullName, Length
```

### 关键词搜索
```powershell
rg "关键词" "G:\Obsidian Vault" -n
```

### 读笔记
```powershell
Get-Content "G:\Obsidian Vault\路径\笔记.md" -Encoding UTF8
```

### 追加内容
```powershell
Add-Content "G:\Obsidian Vault\路径\笔记.md" "`n## 新章节`n内容" -Encoding UTF8
```

### 创建笔记
```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("G:\Obsidian Vault\新笔记.md", "# 标题`n`n内容", $utf8NoBom)
```

### 列出 tag
```powershell
rg "^tags:" "G:\Obsidian Vault" -n --no-ignore
```

## 协作流程（标准会话）
1. 进入会话 → 读 `用户档案.md` + `AGENTS.md`
2. `rg "TODO|未整理|待归档" "G:\Obsidian Vault\00-Inbox" -n` 找活儿
3. 按 `AGENTS.md` 守则操作
4. 结束时在 `Sessions/Codex-Session-YYYY-MM-DD.md` 追加纪要
5. 报告：本会话变更清单

## 工作目录
`C:\Users\15389\Documents\Codex\2026-06-16\mpc` —— Codex 临时工作区，含 helper 脚本、scratch 笔记、自动化输出。

## 与 Claude Code 的协作约定
- 同一笔记冲突时按 `AGENTS.md` 的仲裁规则处理
- Codex 负责批处理 / 归档 / 索引类任务
- Claude Code 负责交互式问答 / 创作类任务
- 任何方在 `Sessions/` 写记录，另一方下次进入先 `git pull` / `git log` 看最近动态