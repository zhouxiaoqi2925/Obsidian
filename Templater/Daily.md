---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [daily, journal]
type: daily
weekday: <% tp.date.now("dddd", 0, tp.file.title, "YYYY-MM-DD") %>
mood:
weather:
---

# 📅 <% tp.date.now("YYYY年MM月DD日 dddd", 0, tp.file.title, "YYYY-MM-DD") %>

> 创建时间：<% tp.date.now("HH:mm") %> ｜ 周<% tp.date.now("d", 0, tp.file.title, "YYYY-MM-DD") %>

## 🎯 今日要事（Top 3）

- [ ]
- [ ]
- [ ]

## 📝 工作记录

### 🕐 上午

### 🕐 下午

### 🌙 晚上

## 💡 学到的东西

- 

## 🐛 遇到的问题

-

## 🔗 相关链接

- [[]]
- [[]]

## 🌟 明日计划

- [ ]

## 💭 随想

> 一句话总结今天

## 📊 元数据

```dataview
TABLE
  weekday as "星期",
  mood as "心情",
  weather as "天气"
FROM "Daily"
WHERE file.name = "<% tp.file.title %>"
```

## 🏷️ 标签

`#daily/<% tp.date.now("YYYY/MM", 0, tp.file.title, "YYYY-MM-DD") %>`
