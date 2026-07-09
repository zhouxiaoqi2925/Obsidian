---
session: Codex-Desktop-Second-Brain-Takeover
date: 2026-07-09
agent: Codex Desktop (MiniMax-M3, Ark 推理)
session_type: 第二大脑接管
owner: 周潇齐 (zhxq)
trigger: 用户要求"接管 Obsidian 知识库,作为第二大脑"
permission: 全 vault 读写(遵守 vault AGENTS.md 所有权边界)
status: 完成(接管 + 修正 + 首次落地)
related:
  - Sessions/Codex-MCP-接入-2026-07-06.md
  - Sessions/Codex-Session-2026-06-16.md
  - Obsidian MCP 端口 27124 修复记录.md
  - 用户档案.md
tags: [codex, desktop, second-brain, takeover, vault-接管, sessions-log]
---

# Codex 桌面端第二大脑接管 · 2026-07-09

## 会话目标

应主人(周潇齐)指令,把 Codex 桌面端(区别于既有 Codex CLI)正式接管 G 盘 Obsidian Vault,作为长期记忆 / 第二大脑使用。会话内一次性完成:skill 装好、错位文件清理、AGENTS.md 修正、本次会话纪要、Daily 日记、vault 健康快照。

## 关键背景:我搞错了什么

会话初期,Codex 桌面端误判了 vault 位置,把 C 盘空测试 vault(3 个笔记)当成了主 vault,并在错位置写了一份冗余 AGENTS.md。实际主 vault 在 G 盘,1494 个笔记,1.7 GB,已有完整目录结构与规则。

经主人指出后立刻修正:删除 C 盘错位文件、以追加方式更新 G 盘 AGENTS.md、重写 skill 默认路径。

## 读取的上下文

- `AGENTS.md`(原版)—— 主人既有规则
- `用户档案.md` —— 主人身份与项目
- `Codex + Obsidian 使用指南.md` —— 既有 Codex CLI 集成方案
- `Obsidian MCP 端口 27124 修复记录.md` —— 27124 端口坑
- `Sessions/Codex-MCP-接入-2026-07-06.md` —— 最近一次 MCP 接入纪要
- 工作区 `AGENTS.md` —— 原指向 C 盘,已修正为 G 盘

## 创建 / 修改 / 删除文件清单

### 新建

- `~/.codex/skills/obsidian-second-brain/SKILL.md`(11614 字节)
- `Sessions/Codex-Session-2026-07-09.md`(本文件)
- `Daily/2026-07-09.md`
- `_analysis/vault-snapshot-2026-07-09.md`

### 修改

- `AGENTS.md`: 顶部"最后更新"日期 2026-07-07 → 2026-07-09;追加"2026-07-09 Codex 桌面端第二大脑接管"章节
- 工作区 `AGENTS.md`: 改写为指向 G 盘(1002 字节)

### 删除

- `C:\Users\15389\Documents\Obsidian Vault\AGENTS.md`(错位文件)

## 新 Skill 关键设计

- preflight 必读:每次会话先读 vault AGENTS.md + 用户档案.md + 最近一份 Sessions/
- 路径定位:默认 G 盘,绝不猜 C 盘
- 尊重既有结构:不推 PARA
- 核心安全规则:只动 .md,绝不写 G 盘元数据库(codex.db)的内容字段
- 三模式:文件系统直读(默认)→ Local REST API 27124(Obsidian 开时)→ MCP(已配时)
- 追加 > 覆盖;重命名到 _archive_pending/ > 删除
- 触发词:中文(记一下/上次/笔记/知识库/第二大脑) + 英文(Obsidian/save this/remember)

## 与既有 Codex CLI 接入的关系

Codex CLI(2026-07-07 起)走 MCP obsidian-mcp-server 3.2.9 → Local REST API 27124。Codex 桌面端(2026-07-09 起)优先文件系统直读,需要时升级到 27124。两者共享 vault,遵守 AGENTS.md 冲突仲裁。

## 教训(供未来 Codex 桌面端会话参考)

1. 不要猜 vault 路径。每次先确认 .obsidian 目录位置
2. 不要发明结构。主人 AGENTS.md 是 single source of truth
3. 不要覆盖,默认追加
4. 不要写 SQLite(codex.db)
5. 不要删,要清先重命名到 _archive_pending/

## 后续 TODO

- 主人重启 Codex 桌面端,让 skill 缓存刷新
- 整理 Inbox/ 570 个自动抓取文件(去重、归档)
- 决定 00-Inbox/ 去留
- 考虑给 Daily/ 补 2026-06-02 → 2026-07-08 之间缺的日子记

---

*本纪要由 Codex 桌面端于 2026-07-09 会话末尾自动追加。会话结束时严格不写 G 盘元数据库。*