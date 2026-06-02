---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [meeting, 会议]
type: meeting
attendees: []
duration: "1h"
---

# 🤝 <% tp.file.title %>

> 时间：<% tp.date.now("YYYY-MM-DD HH:mm") %> ｜ 时长：1h

## 👥 参会人

<% tp.file.cursor(1) %>

## 📋 议题

1.
2.
3.

## 📝 讨论要点

### 议题 1
- 讨论内容
- 结论

### 议题 2
- 讨论内容
- 结论

## ✅ 行动项

```tasks
not done
path includes <% tp.file.title %>
```

- [ ] 负责人 1：动作 1 - 截止日期
- [ ] 负责人 2：动作 2 - 截止日期

## 📌 决议

-

## 🔗 相关

- [[]]
