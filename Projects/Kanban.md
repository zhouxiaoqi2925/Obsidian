---
title: 🎯 Projects 看板
tags: [看板, Tasks, Kanban, 项目]
date: 2026-06-01
type: kanban
---

# 🎯 Projects 看板

> 任务全生命周期追踪：📥 待办 → 🚧 进行中 → 👀 评审中 → ✅ 完成

## 📊 全局统计

```dataview
TABLE
  length(rows) as "任务数"
FROM ""
WHERE contains(tags, "project-task") OR contains(text, "#task")
GROUP BY "分类"
```

## 📥 待办（Backlog）

```tasks
not done
path includes Projects
tags includes #task
priority is low
sort by priority
```

## 🔥 高优先级

```tasks
not done
path includes Projects
priority is high
sort by due
```

## 🚧 进行中（Do）

> 状态 = `in-progress` 的任务

```dataview
TASK
FROM "Projects"
WHERE status = "in-progress" AND !completed
```

### AI 直播平台

```tasks
not done
path includes AI直播平台
description includes 进行中
```

### Nexus Terminal

```tasks
not done
path includes Nexus Terminal
description includes 进行中
```

### OpenClaw

```tasks
not done
path includes OpenClaw
description includes 进行中
```

## 👀 评审中（Review）

```dataview
TASK
FROM ""
WHERE contains(text, "[review]") AND !completed
```

## ✅ 今日完成

```tasks
done
path includes Projects
done today
```

## 📅 即将到期（7 天内）

```tasks
not done
due before in 7 days
sort by due
```

## ❗ 逾期任务

```tasks
not done
due before today
sort by due
```

## 🗂️ 项目维度

### 🎙️ AI 直播平台

```dataview
TASK
FROM "AI直播平台"
WHERE !completed
SORT priority DESC, due ASC
LIMIT 20
```

### 💻 Nexus Terminal

```dataview
TASK
FROM "Nexus Terminal"
WHERE !completed
SORT priority DESC, due ASC
LIMIT 20
```

### 🤖 OpenClaw

```dataview
TASK
FROM "OpenClaw"
WHERE !completed
SORT priority DESC, due ASC
LIMIT 20
```

### 📚 Obsidian 知识库

```dataview
TASK
FROM "Obsidian知识库"
WHERE !completed
SORT priority DESC, due ASC
LIMIT 20
```

### 🛒 TK 跨境电商

```dataview
TASK
FROM "TK跨境电商"
WHERE !completed
SORT priority DESC, due ASC
LIMIT 20
```

## 📈 项目健康度

```dataview
TABLE
  length(filter(rows, (r) => r.completed)) as "已完成",
  length(filter(rows, (r) => !r.completed)) as "未完成",
  length(rows) as "总任务"
FROM "Projects"
FLATTEN file.tasks as tasks
WHERE file.tasks != null
GROUP BY file.link
SORT length(rows) DESC
LIMIT 10
```

## 🏷️ 任务标签规范

- `#task` - 通用任务
- `#bug` - 缺陷修复
- `#feature` - 新功能
- `#docs` - 文档编写
- `#chore` - 杂项
- `#urgent` - 紧急

## 💡 使用技巧

### 任务语法

```markdown
- [ ] 任务描述 🆕 2026-06-01 📅 2026-06-15 #task #feature
- [x] 已完成 #done
```

### 优先级

- 🔴 紧急（高）
- 🟡 重要（中）
- 🟢 一般（低）

### 状态（用 [status] 前缀）

- `[ ]` 待办
- `[wip]` 进行中
- `[review]` 评审中
- `[x]` 完成
- `[blocked]` 阻塞

## 🔗 相关链接

- [[Projects/_index|项目总索引]]
- [[Dashboard/Projects|项目仪表盘]]
- [[Knowledge/Templater + QuickAdd 自动化]]
