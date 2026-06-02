---
title: Dataview 仪表盘使用指南
tags: [Dataview, 仪表盘, 教程]
date: 2026-06-01
---

# Dataview 仪表盘使用指南

## 什么是 Dataview

Dataview 是一个 Obsidian 插件，能把 Vault 里的笔记当作数据库来查询，自动生成动态列表、表格、日历。

## 安装方式

**当前状态**：`community-plugins.json` 中已启用，但 `plugins/` 目录未实际安装。

**安装步骤**：
1. 打开 Obsidian → 设置 → 第三方插件
2. 关闭安全模式
3. 浏览社区插件 → 搜索 `Dataview`
4. 安装并启用

**或在 Obsidian 中点击**：
- [obsidian://show-plugin?id=dataview](obsidian://show-plugin?id=dataview)

## 已创建的仪表盘

| 文件 | 用途 |
|------|------|
| `Dashboard/Home.md` | 知识库首页入口 |
| `Dashboard/Projects.md` | 项目状态追踪 |
| `Dashboard/Learning.md` | 学习进度监控 |
| `Dashboard/Recent.md` | 近期活动聚合 |

## Dataview 语法速查

### 基础表格

```dataview
TABLE
  field1 as "列1",
  field2 as "列2"
FROM "文件夹"
WHERE 条件
SORT 字段 方向
LIMIT 数量
```

### 列表

```dataview
LIST
FROM "Knowledge"
SORT file.mtime DESC
LIMIT 10
```

### 任务列表

```dataview
TASK
FROM "Daily"
WHERE !completed
```

### 日历

```dataview
CALENDAR date
FROM "Daily"
```

## 常用元数据字段

| 字段 | 用途 |
|------|------|
| `file.name` | 文件名 |
| `file.path` | 完整路径 |
| `file.folder` | 所在文件夹 |
| `file.cday` | 创建日期 |
| `file.mtime` | 修改时间 |
| `file.inlinks` | 入链列表 |
| `file.outlinks` | 出链列表 |
| `file.tags` | 标签数组 |

## 函数参考

- `date(today)` - 今日
- `date(yesterday)` - 昨天
- `date(now) - dur(7 days)` - 7 天前
- `length(x)` - 长度
- `contains(x, "y")` - 包含

## 进阶：JS 表达式（DataviewJS）

```dataviewjs
dv.table(["文件", "入链数"],
  dv.pages("")
    .sort(p => p.file.inlinks.length, "desc")
    .limit(10)
    .map(p => [p.file.link, p.file.inlinks.length])
);
```

## 相关链接

- [Dataview 官方文档](https://blacksmithgu.github.io/obsidian-dataview/)
- [[Dashboard/Home|首页]]
- [[Dashboard/Projects|项目仪表盘]]
