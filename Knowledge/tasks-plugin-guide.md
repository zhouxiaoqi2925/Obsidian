---
title: Tasks 插件使用指南
tags: [Tasks, 任务, 看板, 教程]
date: 2026-06-01
---

# Tasks 插件使用指南

## 什么是 Tasks

Tasks 插件是 Obsidian 上强大的任务管理工具，支持：
- 任务优先级、到期日、计划日
- 任务查询块（类似 Dataview）
- 任务复盘
- 跨文件聚合

## 安装

**当前状态**：已在 community-plugins.json 启用，但 plugins/ 中未实际安装。

**安装方式**：
- [obsidian://show-plugin?id=obsidian-tasks-plugin](obsidian://show-plugin?id=obsidian-tasks-plugin)
- Obsidian → 设置 → 第三方插件 → 搜索 `Tasks`

## 任务语法

### 基础任务

```markdown
- [ ] 待办任务
- [x] 已完成
- [/] 已取消
- [-] 已迁移
```

### 带日期

```markdown
- [ ] 任务 📅 2026-06-15        <!-- 到期日 -->
- [ ] 任务 ⏳ 2026-06-10        <!-- 计划日 -->
- [ ] 任务 🛫 2026-06-01        <!-- 开始日 -->
- [ ] 任务 ➕ 2026-05-30        <!-- 创建日 -->
- [ ] 任务 ✅ 2026-06-20        <!-- 完成日 -->
```

### 带优先级

```markdown
- [ ] 紧急任务 🔺
- [ ] 高优先级 ⏫
- [ ] 中优先级 🔼
- [ ] 低优先级 🔽
- [ ] 最低 ⏬
```

### 带标签

```markdown
- [ ] 任务 #project/AI直播 #feature
```

### 任务状态

```markdown
- [ ] 普通
- [/] 进行中 [/]
- [-] 已取消 [-]
- [x] 完成 [x]
```

## 查询语法

### 基础查询

```tasks
not done
```

### 条件过滤

```tasks
not done
priority is high
due before 2026-07-01
path includes Projects
tags include #feature
```

### 排序

```tasks
not done
sort by priority
sort by due
sort by description
```

### 分组

```tasks
not done
group by priority
group by due
group by path
```

## 常用查询模板

### 今日任务

```tasks
not done
due today
```

### 逾期任务

```tasks
not done
due before today
sort by due
```

### 本周任务

```tasks
not done
due before in 7 days
sort by due
```

### 高优先级未完成

```tasks
not done
priority is high
```

## 与 Dataview 联动

```dataview
TASK
FROM "Projects"
WHERE !completed AND priority = "high"
SORT due ASC
LIMIT 10
```

## 高级：复盘视图

`Tasks` 插件提供 "Tasks Calendar" 视图，可在侧边栏看到日历分布。

## 已应用

- [[Projects/Kanban|Projects 看板]] - 全局任务看板
- [[Dashboard/Projects|项目仪表盘]] - 任务聚合

## 最佳实践

1. **每天清空到期任务**：在 Daily 中记录
2. **标签分层**：`#project/X` + `#type/feature`
3. **优先级谨慎使用高优先级**：滥用就失去意义
4. **任务分解到 2 小时内**：太大的任务需要拆

## 相关链接

- [Tasks 官方文档](https://obsidian-tasks-group.github.io/obsidian-tasks/)
- [[Projects/Kanban|Projects 看板]]
- [[Knowledge/Templater + QuickAdd 自动化]]
