---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [project, 项目]
type: project
status: "进行中"
priority: "中"
start-date: <% tp.date.now("YYYY-MM-DD") %>
end-date:
tech-stack: []
---

# 🎯 <% tp.file.title %>

> 项目起始：<% tp.date.now("YYYY-MM-DD") %> ｜ 状态：进行中

## 📋 项目概览

### 🎯 目标
<% tp.system.prompt("用一句话描述项目目标") %>

### 👥 干系人
- **负责人**：
- **协作方**：

### 🏷️ 优先级
<% tp.system.suggest(["高", "中", "低"]) %>

## 🏗️ 技术栈

- **前端**：
- **后端**：
- **数据库**：
- **部署**：

## 📅 里程碑

```dataview
TASK
FROM "<% tp.file.title %>"
WHERE !completed
SORT scheduled ASC
```

## 📝 任务清单

### 🔥 进行中
- [ ]

### 📋 待办
- [ ]

### ✅ 已完成
- [x]

## 🔗 相关链接

- [[]]
- [[]]

## 📊 项目统计

```dataview
TABLE
  status as "状态",
  priority as "优先级",
  start-date as "开始"
FROM "Projects"
WHERE title = "<% tp.file.title %>"
```

## 🏷️ 标签

`#project/<% tp.file.title %>`
