---
title: Obsidian MCP 工具使用指南
date: 2026-05-31
tags: [Obsidian, MCP, 工具使用]
---

# Obsidian MCP 工具使用指南

## 可用工具

| 工具 | 用途 |
|------|------|
| `obsidian_get_note` | 读取笔记（content/full/document-map/section） |
| `obsidian_write_note` | 创建/覆盖笔记 |
| `obsidian_append_to_note` | 追加内容到笔记末尾 |
| `obsidian_replace_in_note` | 搜索替换笔记内容 |
| `obsidian_patch_note` | 编辑 heading/block/frontmatter |
| `obsidian_list_notes` | 列出笔记 |
| `obsidian_search_notes` | 搜索笔记 |
| `obsidian_manage_tags` | 管理标签 |
| `obsidian_manage_frontmatter` | 管理 frontmatter |

## 常见模式

### 创建新笔记
```javascript
obsidian_write_note({
  target: { path: "Folder/Note.md", type: "path" },
  content: "# Title\n\nContent..."
})
```

### 追加内容（不覆盖）
```javascript
obsidian_append_to_note({
  target: { path: "Daily/2026-05-31.md", type: "path" },
  content: "\n\n## New Section\n\n..."
})
```

### 搜索替换
```javascript
obsidian_replace_in_note({
  target: { path: "Note.md", type: "path" },
  replacements: [{ search: "旧文本", replace: "新文本" }]
})
```

## 注意事项

- 连接断开时重试即可恢复
- 文件已存在时 `write_note` 会失败，用 `append_to_note` 或 `overwrite: true`
- `replace_in_note` 需要 search 字符串长度 >= 1