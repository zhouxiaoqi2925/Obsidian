---
title: Periodic Notes 周期笔记使用指南
tags: [Periodic Notes, Daily, Weekly, Monthly, 复盘]
date: 2026-06-01
---

# Periodic Notes 周期笔记使用指南

## 什么是 Periodic Notes

Periodic Notes 是 Obsidian 上的周期笔记插件，能：
- 自动按日/周/月/年创建笔记
- 关联到对应时段的笔记
- 复盘 + 总结流程化

## 安装

**当前状态**：未启用、未安装。

**安装方式**：
- [obsidian://show-plugin?id=periodic-notes](obsidian://show-plugin?id=periodic-notes)
- 配合 Calendar 插件（已安装）使用

## 模板配置

### 设置路径

`设置 → Periodic Notes`

| 周期 | 格式 | 模板 |
|------|------|------|
| Daily | `YYYY-MM-DD` | `Templater/Daily.md` |
| Weekly | `gggg-[W]ww` | `Templater/Weekly.md` |
| Monthly | `YYYY-MM` | `Templater/Monthly.md` |
| Yearly | `YYYY` | `Templater/Yearly.md` |

## 模板示例

### Daily 模板（已在 Templater/Daily.md）

```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [daily]
---

# 📅 <% tp.date.now("YYYY年MM月DD日 dddd") %>

## 🎯 今日要事

## 📝 工作记录

## 💡 学到的东西

## 🐛 遇到的问题
```

### Weekly 模板

```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [weekly, 复盘]
type: weekly
week: <% tp.date.now("WW") %>
year: <% tp.date.now("YYYY") %>
---

# 📆 第 <% tp.date.now("WW") %> 周复盘｜<% tp.date.now("YYYY-MM-DD") %>

> 周期：<% tp.date.now("YYYY-MM-DD", -6) %> ~ <% tp.date.now("YYYY-MM-DD") %>

## 🎯 本周目标完成度

```dataview
TASK
FROM "Daily"
WHERE file.cday >= date(today) - dur(7 days) AND completed
```

## 📊 关键数据

### 完成的任务

```tasks
done
done this week
```

### 学到的东西

```dataview
LIST
FROM "Knowledge"
WHERE file.cday >= date(today) - dur(7 days)
```

## 💡 重要发现

1.
2.
3.

## 🐛 未解决的问题

- [ ]

## 🎯 下周目标

- [ ]

## 🌟 反思

- 做得好：
- 待改进：

## 🔗 本周 Daily 笔记

```dataview
LIST
FROM "Daily"
WHERE file.cday >= date(today) - dur(7 days)
SORT file.cday ASC
```
```

### Monthly 模板

```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [monthly, 复盘]
type: monthly
month: <% tp.date.now("YYYY-MM") %>
---

# 🗓️ <% tp.date.now("YYYY 年 MM 月") %> 月度复盘

> 周期：<% tp.date.now("YYYY-MM-01") %> ~ <% tp.date.now("YYYY-MM-DD") %>

## 🎯 本月 OKR

### O1:
- [ ] KR1:
- [ ] KR2:

### O2:
- [ ] KR1:

## 📊 关键指标

```dataview
TABLE
  length(rows) as "周笔记数"
FROM "Weekly"  
WHERE file.cday >= date(today) - dur(30 days)
GROUP BY dateformat(file.cday, "yyyy-ww")
```

## 💎 核心产出

1.
2.
3.

## 🏆 重要成就

- 

## ⚠️ 教训与不足

-

## 📚 学习总结

```dataview
LIST
FROM "Knowledge"
WHERE file.cday >= date(today) - dur(30 days)
SORT file.mtime DESC
LIMIT 30
```

## 🔗 本月周复盘

```dataview
LIST
FROM "Weekly"
WHERE file.cday >= date(today) - dur(30 days)
SORT file.cday ASC
```

## 🎯 下月规划

- [ ]
- [ ]
- [ ]
```

### Yearly 模板

```markdown
---
date: <% tp.date.now("YYYY-01-01") %>
tags: [yearly, 复盘]
type: yearly
year: <% tp.date.now("YYYY") %>
---

# 📅 <% tp.date.now("YYYY") %> 年度总结

> 个人年度回顾

## 🏆 年度成就

### 事业
-

### 学习
-

### 生活
-

## 📊 数据

```dataview
LIST
FROM "Monthly"
WHERE contains(tags, "yearly") OR file.cday >= date(today) - dur(365 days)
SORT file.cday ASC
```

## 💡 关键洞察

1.
2.
3.

## 🌟 2027 年目标

- [ ]
- [ ]
- [ ]
```

## 复盘节奏

```
Daily（每日）  →  记录
   ↓
Weekly（周末） →  总结 + 反思
   ↓
Monthly（月底）→  复盘 + 规划
   ↓
Yearly（年底） →  战略调整
```

## 关联插件

### Calendar 插件（已安装）

`Settings → Calendar → Periodic notes integration` 启用后：
- 日历视图上能看到 dot 标记
- 点击日期直接跳转 Daily 笔记
- 缺失日期红色标记

### Dataview 联动

```dataview
LIST
FROM "Daily"
WHERE file.cday = date(today)
```

## 实战流程

### 每天（5 分钟）

1. 打开 Periodic Notes 面板
2. 选 `Open today's daily note`
3. 写 3 件事：
   - 今日 Top 3
   - 关键学习
   - 遇到问题

### 每周日（30 分钟）

1. 打开 Weekly 模板
2. 查看本周 7 篇 Daily
3. 总结关键产出 + 教训

### 每月最后一天（1 小时）

1. 打开 Monthly 模板
2. 复盘 4-5 篇 Weekly
3. 调整下月 OKR

### 每年 12 月 31 日（半天）

1. 复盘 12 篇 Monthly
2. 制定新年规划
3. 调整 Vault 结构

## 已配置

- Daily 模板：`Templater/Daily.md`
- Calendar 插件（已安装）支持

## 待配置

- [ ] 安装 Periodic Notes 插件
- [ ] 配置 Weekly / Monthly / Yearly 模板
- [ ] 设置 Calendar 集成

## 相关链接

- [Periodic Notes 官方](https://github.com/liamcain/obsidian-periodic-notes)
- [Calendar 插件](https://github.com/liamcain/obsidian-calendar-plugin)
- [[Templater/Daily|Daily 模板]]
- [[Knowledge/proactive-knowledge-mgmt]]
