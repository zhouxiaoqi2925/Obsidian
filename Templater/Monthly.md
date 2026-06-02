---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [monthly, 复盘]
type: monthly
month: <% tp.date.now("YYYY-MM") %>
---

# 🗓️ <% tp.date.now("YYYY 年 MM 月") %> 月度复盘

> 周期：<% tp.date.now("YYYY-MM-01") %> ~ <% tp.date.now("YYYY-MM-DD") %>

## 🎯 本月 OKR

### O1: 目标
- [ ] KR1
- [ ] KR2

### O2: 目标
- [ ] KR1

## 📊 关键指标

```dataview
TABLE
  length(rows) as "周笔记数"
FROM "Weekly"
WHERE file.cday >= date(today) - dur(30 days)
GROUP BY dateformat(file.cday, "yyyy-ww")
```

## 💎 核心产出

1.
2.
3.

## 🏆 重要成就

## ⚠️ 教训与不足

## 📚 学习总结

```dataview
LIST
FROM "Knowledge"
WHERE file.cday >= date(today) - dur(30 days)
SORT file.mtime DESC
LIMIT 30
```

## 🔗 本月周复盘

```dataview
LIST
FROM "Weekly"
WHERE file.cday >= date(today) - dur(30 days)
SORT file.cday ASC
```

## 🎯 下月规划

- [ ]
- [ ]
- [ ]

## 🏷️ 标签

`#monthly/<% tp.date.now("YYYY/MM") %>`
