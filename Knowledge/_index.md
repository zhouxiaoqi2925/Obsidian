---
title: 知识总库
tags: [知识, 索引, second-brain]
date: 2026-08-07
---

# 知识总库

> 这里放可复用知识、读书笔记、项目研究、源码分析和每日抓取的沉淀。

## 入口

- [[Dashboard/Home|控制台]]
- [[Dashboard/Recent|最近活动]]
- [[Dashboard/Learning|学习看板]]
- [[Wiki/_templates/meaningful-analysis|单笔记分析模板]]
- [[Wiki/grok-build-meaningful-analysis|完整样稿]]

## 知识分类

```dataview
TABLE file.mtime as "更新时间"
FROM "Knowledge"
SORT file.mtime DESC
LIMIT 50
```

## 使用方式

1. 先选一个主题。
2. 用单笔记模板写成一篇完整主笔记。
3. 代码部分直接贴关键源码或关键片段。
4. 结论、树状图、文字描述、源码解释放在同一页。
5. 如果是项目，就只保留一篇主笔记，别拆太碎。
