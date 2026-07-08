---
tags: [claude-skills, dataview, index]
---

# Claude Skills 索引视图（Dataview）

## 1. 所有 Skills 笔记列表

```dataview
TABLE
  tags as "标签",
  domain as "领域",
  source as "源仓库",
  version as "版本"
FROM "Claude Skills 知识库/Skill-详解"
SORT domain ASC, file.name ASC
```

## 2. 所有领域总览列表

```dataview
LIST
FROM "Claude Skills 知识库/领域-总览"
SORT file.name ASC
```

## 3. 按领域分组

```dataview
TABLE
  rows.file.link as "Skill",
  rows.tags as "标签"
FROM "Claude Skills 知识库/Skill-详解"
GROUP BY domain
SORT domain ASC
```

## 4. 最近修改

```dataview
LIST
FROM "Claude Skills 知识库"
SORT file.mtime DESC
LIMIT 10
```

## 5. 按来源仓库分组

```dataview
TABLE
  length(rows) as "Skill 数量"
FROM "Claude Skills 知识库/Skill-详解"
GROUP BY source
SORT length(rows) DESC
```

## 6. 统计

```dataview
TABLE
  length(rows) as "数量"
FROM "Claude Skills 知识库"
WHERE type = "markdown"
GROUP BY "总文件数" as "项目"
```

## 7. 标签云

```dataview
LIST
FROM #claude-skill
SORT file.name ASC
```

---

> 💡 **使用方法**：在 Obsidian 中打开此文件，启用 Dataview 插件，上面的代码块会自动渲染成表格。
> 如果 Dataview 未启用，请先安装：Settings → Community Plugins → Dataview