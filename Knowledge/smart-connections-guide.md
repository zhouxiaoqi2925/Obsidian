---
title: Smart Connections AI 联想使用指南
tags: [AI, Smart Connections, 联想, 知识图谱]
date: 2026-06-01
---

# Smart Connections AI 联想使用指南

## 什么是 Smart Connections

Smart Connections 是 Obsidian 上的 AI 联想插件，能：
- 自动发现相关笔记
- 基于本地嵌入（embeddings）找语义相似
- 支持 OpenAI / 本地 LLM
- 实时显示相关片段

## 安装

**当前状态**：未启用、未安装。

**安装方式**：
1. Obsidian → 设置 → 第三方插件
2. 关闭安全模式
3. 浏览社区插件 → 搜索 `Smart Connections`
4. 安装并启用

或直接点击：
- [obsidian://show-plugin?id=smart-connections](obsidian://show-plugin?id=smart-connections)

## 核心功能

### 1. 智能联想侧边栏

打开 Smart Connections 面板（在右侧边栏），会自动显示：
- 当前笔记的语义相关笔记
- 相似度评分
- 一句话摘要

### 2. 自动嵌入块

在每篇笔记底部自动插入：

```markdown
## 🔗 Smart Connections
- [[相关笔记1]] (95%)
- [[相关笔记2]] (87%)
- [[相关笔记3]] (82%)
```

### 3. AI 问答

在侧边栏可以问：
- "我写过哪些关于 K8s 的笔记？"
- "上次解决 X 问题的方案是什么？"
- "总结我近 30 天的学习重点"

## 配置

### 使用 OpenAI

`设置 → Smart Connections → API Key` 填入：

```yaml
API Provider: OpenAI
API Key: sk-xxxxx
Model: gpt-4o-mini
Embedding Model: text-embedding-3-small
```

### 使用 DeepSeek（推荐，便宜）

```yaml
API Provider: OpenAI Compatible
API Base URL: https://api.deepseek.com/v1
API Key: sk-xxxxx
Model: deepseek-chat
Embedding Model: text-embedding-3-small
```

> 注：DeepSeek 嵌入 API 路径：`https://api.deepseek.com/v1/embeddings`

### 使用本地模型（Ollama）

```yaml
API Provider: Ollama
API Base URL: http://localhost:11434/v1
Model: llama3
Embedding Model: nomic-embed-text
```

## 使用场景

### 场景 1：写笔记时联想

打开一篇关于"微服务"的笔记，侧边栏立刻显示：
- "分层架构实践"
- "微服务架构指南"
- "Netflix 技术架构实战"
- "Uber 技术架构实战"

### 场景 2：找历史方案

输入："上次 K8s 部署失败怎么解决的？"

AI 会从历史 Daily 笔记中提取相关内容。

### 场景 3：知识复盘

输入："近 30 天我学了什么？"

AI 总结 Daily + Knowledge 中的关键学习点。

## 性能优化

### 嵌入成本

- 笔记 1000 篇：约 $0.01（OpenAI text-embedding-3-small）
- DeepSeek：约 ¥0.001
- 本地 Ollama：免费

### 增量更新

Smart Connections 默认增量嵌入，只处理新笔记/修改笔记。

### 排除文件夹

`设置 → Smart Connections → Excluded Files`：

```
Daily/**
Sessions/**
.obsidian/**
```

## 最佳实践

1. **整理后再启用**：先清理 Vault，再启用 Smart Connections
2. **结合标签使用**：配合 `tags: [AI-friendly]` 筛选
3. **定期清理嵌入缓存**：`设置 → Smart Connections → Clear Embeddings`
4. **慎用 GPT-4**：先用 gpt-4o-mini 测试

## 与 Dataview 联动

可以创建仪表盘查询 AI 推荐：

```dataview
TABLE
  file.inlinks as "入链",
  length(file.inlinks) as "重要度"
FROM "Knowledge"
WHERE length(file.inlinks) > 5
SORT length(file.inlinks) DESC
LIMIT 20
```

## 与 DeepSeek API 联动（已有 deepseek-plugin）

`G:\Obsidian Vault\.obsidian\plugins\deepseek-plugin/` 已有 DeepSeek 插件。
可与 Smart Connections 互为补充：
- **DeepSeek 插件**：通用 AI 对话
- **Smart Connections**：笔记内嵌 AI 联想

## 隐私说明

- OpenAI 模式：嵌入向量发送到 OpenAI
- 本地模式：完全离线，0 隐私泄露
- 推荐使用本地 Ollama（敏感笔记）或 DeepSeek（中文友好 + 便宜）

## 相关链接

- [Smart Connections 官方](https://github.com/brianpetro/obsidian-smart-connections)
- [[Knowledge/proactive-knowledge-mgmt]]
- [[Knowledge/Dataview 仪表盘使用指南]]
