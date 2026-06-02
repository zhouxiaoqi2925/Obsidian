---
title: 项目仪表盘
tags: [仪表盘, Dataview, 项目]
date: 2026-06-01
---

# 🎯 项目仪表盘

> 实时追踪所有项目状态、进度、关键文档

## 📊 项目总览

```dataview
TABLE
  status as "状态",
  start-date as "开始",
  priority as "优先级",
  tags as "标签"
FROM "Projects"
WHERE contains(tags, "项目")
SORT priority DESC, start-date DESC
LIMIT 20
```

## 🔥 进行中的项目

```dataview
TABLE
  status as "状态",
  priority as "优先级",
  start-date as "开始"
FROM "Projects"
WHERE status = "进行中"
SORT priority DESC
```

## ✅ 已完成项目

```dataview
TABLE
  end-date as "完成",
  tags as "标签"
FROM "Projects"
WHERE status = "已完成"
SORT end-date DESC
LIMIT 10
```

## 📅 最近更新的项目文档

```dataview
LIST
FROM "Projects"
SORT file.mtime DESC
LIMIT 15
```

## 🔗 项目相关链接

- [[Projects/_index|项目总索引]]
- [[AI直播平台/overview|AI 直播平台]]
- [[Nexus Terminal/overview|Nexus Terminal]]
- [[OpenClaw/overview|OpenClaw]]
- [[Obsidian知识库/overview|Obsidian 知识库]]
- [[TK跨境电商/overview|TK 跨境电商]]

## 💡 使用说明

- 状态字段：计划中 / 进行中 / 已完成 / 暂停
- 优先级字段：高 / 中 / 低
- 修改 Projects/ 下的 frontmatter 即可自动同步
