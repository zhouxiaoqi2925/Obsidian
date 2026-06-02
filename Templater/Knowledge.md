---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [knowledge, 学习]
type: knowledge
category: <% tp.system.prompt("知识分类（如：软件架构、DevOps、AI）") %>
difficulty: <% tp.system.suggest(["入门", "中级", "高级"]) %>
---

# 📚 <% tp.file.title %>

> 创建于 <% tp.date.now("YYYY-MM-DD") %> ｜ 分类：<% tp.system.prompt("知识分类") %>

## 🎯 一句话定义

<% tp.file.cursor(1) %>

## 🧠 核心概念

### 它是什么？
-

### 解决什么问题？
-

### 核心优势
-

## ⚙️ 工作原理

### 关键机制
-

### 执行流程
-

## 💻 关键代码 / 命令

```bash
# 示例代码
```

## 🛠️ 实践应用

### 场景 1
-

### 场景 2
-

## ⚠️ 注意事项 & 坑点

- ⚠️

## 🔗 关联知识

- [[]]
- [[]]

## 📎 参考资料

- [链接1]()
- [链接2]()

## 🏷️ 标签

`#knowledge/<% tp.system.prompt("技术栈") %>` `#<% tp.file.title %>`
