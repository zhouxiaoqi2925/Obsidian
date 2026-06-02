---
tags: [obsidian, plugin, setup, dev-knowledge-base]
type: setup-guide
created: 2026-06-01
category: "Obsidian 配置"
---

# Obsidian 插件安装清单

> 配置已在 `.obsidian/community-plugins.json` 中标记。**打开 Obsidian → 设置 → 第三方插件 → 浏览** 搜索对应插件名点击安装。

## ✅ 已装（4 个）

| 插件 | 作用 |
|------|------|
| **obsidian-local-rest-api** | MCP 工具调用 Obsidian 的 HTTP 接口 |
| **realclaudian** | Claudian - Claude Code 集成 |
| **deepseek-plugin** | DeepSeek AI 助手 |
| **obsidian-enhancing-mindmap** | 思维导图增强 |

## 🆕 待装（推荐 11 个）

### 🔴 核心必备

| 插件 | 作用 | 安装后必做 |
|------|------|-----------|
| **Templater** | 模板一键调用（7 套模板已就绪） | 设置 → Template Folder = `Wiki/_templates/` |
| **Dataview** | 自动统计、检索笔记 | 无需配置 |
| **obsidian-tasks-plugin** | 任务管理（每日抓取任务用它追踪） | 配置任务标签 |

### 🟡 强烈推荐

| 插件 | 作用 |
|------|------|
| **obsidian-code-files** | 代码片段高亮、分类管理 |
| **quickadd** | 快速新建笔记 / 调用模板 |
| **obsidian-mermaid** | 架构图 / 流程图 |
| **obsidian-excalidraw-plugin** | 手绘架构图 |

### 🟢 效率提升

| 插件 | 作用 |
|------|------|
| **calendar** | 日历视图，看日记 |
| **tag-wrangler** | 批量管理标签 |
| **obsidian-paste-image** | 粘贴图片自动保存到 G 盘 |
| **obsidian-image-automation** | 图片自动化处理 |

## 📥 批量安装步骤

1. 打开 Obsidian（`G:\Obsidian Vault` 仓库）
2. **设置 → 第三方插件 → 关闭安全模式**（已关则跳过）
3. 点击「浏览」按钮，依次搜索以下插件名并安装：
   - `Templater`
   - `Dataview`
   - `Tasks`
   - `Code Files`
   - `QuickAdd`
   - `Mermaid`
   - `Excalidraw`
   - `Calendar`
   - `Tag Wrangler`
   - `Paste image`
   - `Image auto upload`
4. 安装后启用，每个插件独立开关
5. Templater 必做配置：Settings → Templater → **Template folder location** = `Wiki/_templates`

## ⚠️ 配置说明

- 所有插件**不修改 G 盘外的任何位置**
- 图片粘贴默认存 `Wiki/_templates/attachments/`（可改）
- Dataview 查询示例见 [[00-开发知识库索引]]
- 每日抓取任务依赖：Templater + Tasks + Dataview

## 🔗 关联笔记

- [[开发技术知识库搭建指南]]
- [[Obsidian-Dev-Template-System]]
- [[每日知识抓取任务框架]]
