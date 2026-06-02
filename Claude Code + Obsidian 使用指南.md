# Claude Code + Obsidian 集成指南

## 概述

本文档记录 Claude Code 与 Obsidian 知识库集成的配置和使用方法。

## 当前配置

### MCP 服务器
- **obsidian-mcp-server**: 通过 Local REST API 访问 Obsidian
- **obsidian-brain**: 直接文件访问（无需 Obsidian 运行）
- **hex-line**: 代码编辑工具

### 模型
- 模型: DeepSeek V4 Pro
- API: sk-e6a62d4c92224761abb59a339f1896ca
- Base URL: https://api.deepseek.com/anthropic

## 快速开始

### 查询知识库
```
mcp__obsidian__obsidian_search_notes("搜索关键词")
mcp__obsidian__obsidian_list_notes("笔记路径")
mcp__obsidian__obsidian_get_note("笔记文件名.md")
```

### 创建笔记
```
mcp__obsidian__obsidian_write_note("新笔记.md", "# 标题\n内容")
```

### 编辑笔记
```
mcp__obsidian__obsidian_patch_note("笔记.md", "## 章节", "append", "追加内容")
```

## 适用场景

- 知识管理
- 项目文档
- 学习笔记
- 任务跟踪
- 代码笔记