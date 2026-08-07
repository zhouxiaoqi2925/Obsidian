---
title: Obsidian 控制台
tags: [仪表盘, 索引, Obsidian, second-brain]
date: 2026-08-07
---

# Obsidian 控制台

> 这里是第二大脑的操作台：看今日抓取、看最近变化、进项目、进知识、进模板。

## 快速入口

| 区域 | 入口 | 作用 |
|---|---|---|
| 今日抓取 | [[Dashboard/Recent]] | 先看最新变化 |
| 学习总览 | [[Dashboard/Learning]] | 看 Daily / Knowledge 汇总 |
| 项目总览 | [[Dashboard/Projects]] | 看项目状态和进展 |
| 知识总库 | [[Knowledge/_index]] | 看知识分类与入口 |
| Wiki 总库 | [[Wiki/_index]] | 看模板、样稿、方法论 |
| 高级玩法 | [[Dashboard/Advanced]] | 看骚操作和自动化总控 |
| 单笔记模板 | [[Wiki/_templates/meaningful-analysis]] | 深度解析的固定骨架 |
| 深度项目模板 | [[Templater/Project-Deep]] | 直接生成单笔记项目页 |
| 样稿示例 | [[Wiki/grok-build-meaningful-analysis]] | 看一篇完整样稿长什么样 |

## 今日状态

```dataview
TABLE file.mtime as "更新时间", file.path as "路径"
FROM "Dashboard"
SORT file.mtime DESC
LIMIT 5
```

## 最近抓取

```dataview
LIST
FROM "Inbox"
SORT file.ctime DESC
LIMIT 10
```

## 今日 digest

```dataview
LIST
FROM "Dashboard"
WHERE contains(file.name, "knowledge-digest-") OR contains(file.name, "daily-digest-")
SORT file.ctime DESC
LIMIT 10
```

## 项目看板

```dataview
TABLE status as "状态", priority as "优先级", file.mtime as "更新时间"
FROM "Projects"
SORT file.mtime DESC
LIMIT 10
```

## 知识入口

```dataview
LIST
FROM "Knowledge"
SORT file.mtime DESC
LIMIT 15
```

## 深度项目

```dataview
LIST
FROM "Projects"
WHERE contains(type, "project-deep") OR contains(tags, "单笔记")
SORT file.mtime DESC
LIMIT 20
```

## 高级玩法

1. 每天 10:00 自动抓取 GitHub、资讯源、技术文章。
2. 每篇内容统一进单笔记模板，先结论，再树状图，再文字，再代码，再源码。
3. 项目只保留一篇主笔记，避免拆成一堆零散小页。
4. Dashboard 只做“查看与决策”，真正内容沉淀进 Wiki、Knowledge、Projects。
5. 抓取内容和手工整理内容保持同一骨架，方便横向比较。
6. 源码不折叠，保持全文可见，先能读，再谈压缩。

## 今日任务

- [ ] 打开 [[Dashboard/Recent]] 检查今天抓取是否成功
- [ ] 用 [[Wiki/_templates/meaningful-analysis]] 新建一篇项目分析
- [ ] 用 [[Wiki/grok-build-meaningful-analysis]] 作为示例对照
- [ ] 把最重要的项目收进一页主笔记
- [ ] 保持所有非代码内容为中文
