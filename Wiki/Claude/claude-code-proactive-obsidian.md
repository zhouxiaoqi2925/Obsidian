---
title: Claude Code 主动知识管理策略升级
date: 2026-05-31
tags: [Claude, Obsidian, 知识管理, 自动化]
---

# Claude Code 主动知识管理策略升级

## 触发条件

| 触发事件 | 行动 |
|---------|------|
| 完成重要任务/功能 | 立即写入项目进展 |
| 解决技术难题/bug | 立即写入踩坑记录 |
| 做出技术决策 | 立即写入决策日志 |
| 发现新模式/最佳实践 | 立即提取到知识库 |
| 部署成功/失败 | 立即写入部署日志 |
| 会话结束 | 生成会话摘要 |

## 执行流程

1. 快速判断 (<30秒) → 什么值得记住？
2. 思维导图优先 🧠 → Sessions/YYYY-MM-DD-HHMM-mindmap.md
3. 写入对应文件夹 📚
4. 提取与沉淀 📝 (mind map first, details second)
5. 索引更新 🔗

## 目标文件夹

- `Daily/` - 每日日志
- `Sessions/` - 会话记录 + 思维导图
- `Knowledge/` - 可复用知识
- `Projects/` - 项目进展
- `Wiki/` - 概念/术语库

## 相关文件

- Scheduled Task: `C:\Users\15389\.claude\scheduled-tasks\obsidian-daily-organize\SKILL.md`
- Memory: `C:\Users\15389\.claude\projects\C--Users-15389\memory\feedback\proactive_obsidian.md`