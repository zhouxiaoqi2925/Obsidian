---
title: 近期活动仪表盘
tags: [仪表盘, Dataview, 近期]
date: 2026-06-01
---

# 🕐 近期活动仪表盘

> 跨文件夹聚合最近的内容更新

## 🆕 最近 24 小时

```dataview
LIST
FROM ""
WHERE file.mtime >= date(now) - dur(1 day)
SORT file.mtime DESC
LIMIT 50
```

## 📆 最近 7 天

```dataview
LIST
FROM ""
WHERE file.mtime >= date(now) - dur(7 days)
SORT file.mtime DESC
LIMIT 50
```

## 📅 最近 30 天

```dataview
LIST
FROM ""
WHERE file.mtime >= date(now) - dur(30 days)
SORT file.mtime DESC
LIMIT 50
```

## 🔗 待整理笔记（包含 TODO）

```dataview
LIST
FROM ""
WHERE contains(text, "TODO") OR contains(text, "待办")
SORT file.mtime DESC
LIMIT 20
```

## ❓ 缺少链接的孤立笔记

```dataview
LIST
FROM ""
WHERE length(file.inlinks) = 0 AND length(file.outlinks) = 0
SORT file.mtime DESC
LIMIT 20
```

## 📂 笔记统计

```dataview
TABLE
  length(rows) as "笔记数"
FROM ""
GROUP BY file.folder
SORT length(rows) DESC
```

## 🏷️ 最近标签

```dataview
TABLE
  length(rows) as "数量",
  max(rows.file.mtime) as "最近使用"
FROM ""
WHERE file.mtime >= date(now) - dur(7 days)
FLATTEN tags
WHERE tags != null
GROUP BY tags
SORT length(rows) DESC
LIMIT 20
```
