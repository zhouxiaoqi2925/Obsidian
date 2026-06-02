---
title: 🏠 Obsidian 首页
tags: [仪表盘, 索引]
date: 2026-06-01
---

# 🏠 欢迎回到 Obsidian

> 知识库导航中心 · 8 大高级玩法 v1.0

## 🚀 快速跳转

| 区域 | 入口 | 说明 |
|------|------|------|
| 📚 知识库 | [[Knowledge/_index]] | 软件架构 + Obsidian 体系 |
| 🛠️ 实战案例 | [[实战案例/大企业实战案例 - 总索引]] | 大厂技术架构 |
| 📅 Daily | [[Daily/2026-06-01]] | 每日笔记 |
| 📊 Sessions | [[Sessions/]] | 会话记录 |
| 💼 Projects | [[Projects/_index]] | 项目中心 |
| 📖 Wiki | [[Wiki/_index]] | 知识 Wiki |

## 📊 实时仪表盘

### 🎯 项目
```dataview
TABLE status as "状态", priority as "优先级"
FROM "Projects"
WHERE contains(tags, "项目")
SORT file.mtime DESC
LIMIT 10
```

### 📚 最近学习
```dataview
LIST
FROM "Knowledge"
SORT file.mtime DESC
LIMIT 10
```

### 🆕 今日 Daily
```dataview
LIST
FROM "Daily"
WHERE file.cday = date(today)
```

### 🔥 最近会话
```dataview
LIST
FROM "Sessions"
SORT file.mtime DESC
LIMIT 5
```

## 🎮 8 大高级玩法

| # | 玩法 | 状态 | 入口 |
|---|------|------|------|
| 1 | Dataview 动态仪表盘 | ✅ 已配置 | [[Dashboard/Projects]]、[[Dashboard/Learning]]、[[Dashboard/Recent]] |
| 2 | Spaced Repetition 间隔重复 | 🔧 待安装 | [需安装插件](obsidian://show-plugin?id=obsidian-spaced-repetition) |
| 3 | Templater + QuickAdd 自动化 | ✅ 已安装 | [[Wiki/_templates]] |
| 4 | Projects 看板（Tasks） | ✅ 已安装 | [[Projects/_index]] |
| 5 | Excalidraw + Mermaid 双画板 | ✅ 已安装 | 任意 `.excalidraw` / ` ```mermaid ` |
| 6 | Smart Connections AI 联想 | 🔧 待安装 | [需安装插件](obsidian://show-plugin?id=smart-connections) |
| 7 | Git 自动备份 | 🔧 待配置 | [[.obsidian/自动备份方案]] |
| 8 | Periodic Notes 周期笔记 | 🔧 待安装 | [需安装插件](obsidian://show-plugin?id=periodic-notes) |

## 💡 今日 Tips

> 打开 `Dashboard/Home.md` 即可看到所有仪表盘
> 修改 Projects/ 下的 frontmatter 自动同步到 [[Dashboard/Projects]]

## 🛠️ 待办

- [ ] 安装 Dataview 插件（已启用但未安装）
- [ ] 安装 Spaced Repetition 插件
- [ ] 安装 Smart Connections 插件
- [ ] 安装 Periodic Notes 插件
- [ ] 配置 Git 备份
- [ ] 在 Obsidian 中打开各 Dashboard 验证
