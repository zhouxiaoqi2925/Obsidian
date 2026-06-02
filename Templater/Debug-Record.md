---
title: <% tp.file.title %>
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [debug, 排查, troubleshooting]
type: debug
status: "open"
severity: <% tp.system.suggest(["P0-紧急", "P1-高", "P2-中", "P3-低"]) %>
environment:
language:
project:
---

# 🐛 <% tp.file.title %>

> 创建于 <% tp.date.now("YYYY-MM-DD") %> ｜ 等级：P_ ｜ 状态：open

## 📋 报错现象

**完整报错信息**：

```bash
# 粘贴完整 stack trace
```

**影响范围**：

<% tp.file.cursor(1) %>

## 🔍 复现步骤

1. **环境**：<% tp.system.prompt("如：Windows 11 + Go 1.21 + Linux 服务器") %>
2. **触发操作**：
3. **复现率**：100% / 偶发

## 🎯 报错分析

### 表层原因

### 根本原因

```bash
# 排查命令
```

## ✅ 解决方案

### 推荐方案

```bash
# 修复代码 / 命令
```

### 备选方案

```bash
#
```

## ✔️ 验证

- [ ] 修复后是否复现
- [ ] 回归测试通过
- [ ] 监控告警

## 🔗 关联

- [[]]
- [[]]

## 🏷️ 标签

`#debug/<% tp.date.now("YYYY/MM") %>` `#<% tp.file.title %>`
