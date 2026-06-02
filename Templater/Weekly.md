---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [weekly, 复盘]
type: weekly
week: <% tp.date.now("WW") %>
year: <% tp.date.now("YYYY") %>
---

# 📆 第 <% tp.date.now("WW") %> 周复盘｜<% tp.date.now("YYYY-MM-DD") %>

> 周期：<% tp.date.now("YYYY-MM-DD", -6) %> ~ <% tp.date.now("YYYY-MM-DD") %>

## 🎯 本周目标完成度

```dataview
TASK
FROM "Daily"
WHERE file.cday >= date(today) - dur(7 days) AND completed
```

## 📊 关键数据

### 完成的任务

```tasks
done
done this week
```

### 学到的东西

```dataview
LIST
FROM "Knowledge"
WHERE file.cday >= date(today) - dur(7 days)
```

## 💡 重要发现

1.
2.
3.

## 🐛 未解决的问题

- [ ]

## 🎯 下周目标

- [ ]

## 🌟 反思

### 做得好

### 待改进

## 🔗 本周 Daily 笔记

```dataview
LIST
FROM "Daily"
WHERE file.cday >= date(today) - dur(7 days)
SORT file.cday ASC
```

## 🏷️ 标签

`#weekly/<% tp.date.now("YYYY/WW") %>`
