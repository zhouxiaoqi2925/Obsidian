---
title: 学习仪表盘
tags: [仪表盘, Dataview, 学习]
date: 2026-06-01
---

# 📚 学习仪表盘

> 整合 Daily 笔记、Knowledge 笔记、学习进度

## 🆕 今日新增（Daily）

```dataview
LIST
FROM "Daily"
WHERE file.cday = date(today)
SORT file.ctime DESC
```

## 📖 今日新增（Knowledge）

```dataview
LIST
FROM "Knowledge"
WHERE file.cday = date(today)
SORT file.ctime DESC
```

## 📅 昨天更新的笔记

```dataview
LIST
FROM ""
WHERE file.mtime >= date(yesterday) AND file.mtime < date(today)
SORT file.mtime DESC
LIMIT 30
```

## 🔥 最近 7 天最活跃

```dataview
TABLE
  length(file.inlinks) as "入链数",
  length(file.outlinks) as "出链数"
FROM ""
WHERE file.mtime >= date(today) - dur(7 days)
SORT file.mtime DESC
LIMIT 20
```

## 🌐 知识地图

```dataview
LIST
FROM "Knowledge"
SORT file.ctime DESC
LIMIT 30
```

## 🏷️ 标签云（按使用频次）

```dataview
TABLE
  length(rows) as "笔记数"
FROM ""
FLATTEN tags
WHERE tags != null
GROUP BY tags
SORT length(rows) DESC
LIMIT 20
```

## 💡 学习追踪

- 🎯 **每日目标**：1 篇 Daily + 1 篇 Knowledge
- 🔁 **复盘周期**：每周末看 Weekly
- 🌟 **里程碑**：每月底看 Monthly
