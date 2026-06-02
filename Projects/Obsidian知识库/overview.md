---
tags: [project, obsidian, knowledge-base]
created: 2026-05-30
updated: 2026-05-31
status: active
---

# Obsidian 知识库系统

## 📋 项目概述

构建一个以 Obsidian 为核心的知识管理平台，集成 DeepSeek AI 和 Claude Code，实现：
- AI 驱动的知识生成与管理
- 自动化文档整理与分类
- Claude Code 自主读写知识库
- 思维导图可视化

## 🏗️ 系统架构

```
┌─────────────────┐     MCP      ┌──────────────────┐
│   Claude Code    │◄────────────►│  Obsidian Vault   │
│   (DeepSeek V4)  │   REST API   │  (G:\Obsidian)    │
└─────────────────┘              └──────────────────┘
        │                                │
        ▼                                ▼
┌─────────────────┐    ┌──────────────────────────┐
│  DeepSeek API   │    │  Community Plugins:       │
│  (deepseek-chat)│    │  - deepseek-plugin        │
└─────────────────┘    │  - enhancing-mindmap      │
                       │  - local-rest-api         │
                       │  - realclaudian           │
                       └──────────────────────────┘
```

## 📦 技术栈

| 组件 | 版本 | 用途 |
|------|------|------|
| Obsidian | latest | 知识库核心 |
| DeepSeek API | v4 pro / chat | AI 生成 |
| Claude Code | 2.1.132 | 自主管理 |
| obsidian-mcp-server | 3.2.3 | REST API 桥接 |
| obsidian-brain | 1.7.24 | 语义搜索/图谱 |
| hex-line | latest | 文件操作 |

## 🔌 MCP 服务器

### obsidian (Local REST API)
- **端口**: 27124 (HTTPS)
- **连接方式**: stdio → HTTPS localhost
- **工具**: 读写搜索笔记、管理标签

### obsidian-brain
- **连接方式**: 直接文件访问 (VAULT_PATH)
- **工具**: 语义搜索、图谱分析、PageRank

### hex-line
- **连接方式**: 直接文件访问
- **工具**: 文件搜索替换、批量操作

## 📂 Obsidian 插件

### deepseek-plugin (自研)
- **ID**: `deepseek-plugin`
- **功能**: AI 生成、总结、润色、Wiki 创建、思维导图
- **快捷键**: Ctrl+Shift+G/W/M/D/R/O/L

### enhancing-mindmap (社区)
- **ID**: `obsidian-enhancing-mindmap`
- **版本**: 0.2.5
- **功能**: Markdown 可视化思维导图

### obsidian-local-rest-api (社区)
- **ID**: `obsidian-local-rest-api`
- **版本**: 2.5.4
- **功能**: HTTPS REST API 访问 Vault

## 📝 开发日志

- [[Daily/2026-05-30|2026-05-30]] — 初始搭建：Obsidian 安装、MCP 配置、Claude Code 集成
- [[Daily/2026-05-31|2026-05-31]] — DeepSeek 插件开发、LLM Wiki 搭建、思维导图、自主整理系统
