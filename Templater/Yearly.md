---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-01-01") %>
tags: [yearly, 复盘]
type: yearly
year: <% tp.date.now("YYYY") %>
---

# 📅 <% tp.date.now("YYYY") %> 年度总结

> 个人年度回顾

## 🏆 年度成就

### 事业
-

### 学习
-

### 生活
-

## 📊 数据

```dataview
LIST
FROM "Monthly"
WHERE contains(tags, "yearly") OR file.cday >= date(today) - dur(365 days)
SORT file.cday ASC
```

## 💡 关键洞察

1.
2.
3.

## 🌟 <% tp.date.now("YYYY", 1) %> 年目标

- [ ]
- [ ]
- [ ]

## 🏷️ 标签

`#yearly/<% tp.date.now("YYYY") %>`
