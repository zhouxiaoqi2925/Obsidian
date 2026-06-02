---
title: AI 助手对比（DeepSeek / Claudian / Smart Connections）
tags: [AI, DeepSeek, Claudian, Smart Connections, 对比]
date: 2026-06-01
---

# AI 助手对比

> 当前 Vault 已安装 3 个 AI 相关工具，各有所长

## 工具矩阵

| 工具 | 类型 | 用途 | 优势 |
|------|------|------|------|
| **deepseek-plugin** | 通用 AI 对话 | 整篇笔记生成、问答 | 中文友好、价格便宜 |
| **claudian** | Claude API 集成 | 高级推理、长文 | 上下文大、逻辑强 |
| **smart-connections** | 笔记内嵌 AI | 自动联想 | 本地嵌入、精准相关 |

## 详细对比

### DeepSeek 插件（已安装）

**位置**：`G:\Obsidian Vault\.obsidian\plugins\deepseek-plugin\`

**特点**：
- 国内访问稳定
- 价格便宜（输入 ¥1/M tokens）
- 中文语义理解好
- 支持自定义 prompt 模板

**使用场景**：
- 大批量笔记整理
- 翻译/总结
- 代码生成

### Claudian 插件（已安装）

**位置**：`G:\Obsidian Vault\.obsidian\plugins\claudian\`

**特点**：
- Claude API（Anthropic）
- 200K 上下文窗口
- 推理能力强
- 适合复杂分析

**使用场景**：
- 架构设计
- 代码审查
- 复杂问题拆解

### Smart Connections（待安装）

**特点**：
- 嵌入本地笔记
- 实时联想
- 支持多种 LLM

**使用场景**：
- 写笔记时联想相关历史笔记
- 知识图谱可视化
- AI 问答

## 互补策略

```
场景 → 推荐工具
─────────────────────────────────────
笔记整理     → DeepSeek（便宜 + 中文）
架构设计     → Claudian（推理强）
查找资料     → Smart Connections（精准）
代码生成     → Claudian / DeepSeek
复杂研究     → Claudian
日常记录     → Smart Connections
```

## 统一 Prompt 模板

可存放在 `Knowledge/Prompts/`：

### 笔记总结

```markdown
请总结以下笔记的核心内容（3 个要点）：

{{content}}
```

### 知识串联

```markdown
基于以下笔记，请推荐 5 篇最相关的历史笔记（用 [[笔记名]] 格式）：

{{content}}
```

### 代码审查

```markdown
请审查以下代码，关注：
1. 性能
2. 可读性
3. 安全性
4. SOLID 原则

{{content}}
```

## API Key 配置建议

| 工具 | API Key 位置 |
|------|--------------|
| DeepSeek | `设置 → DeepSeek Plugin → API Key` |
| Claudian | `设置 → Claudian → Anthropic API Key` |
| Smart Connections | `设置 → Smart Connections → API Key` |

## 相关链接

- [[Knowledge/smart-connections-guide]]
- [[Knowledge/proactive-knowledge-mgmt]]
- [[Knowledge/dataview-dashboard-guide]]
