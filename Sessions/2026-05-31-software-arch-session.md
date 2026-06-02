---
title: 2026-05-31 软件架构知识整理
date: 2026-05-31
tags: [会话, 软件架构]
---

# 2026-05-31 会话摘要

## 任务：整理软件架构知识

### 输入内容
关于软件架构的核心概念：
- 定义与目标
- 关键组件
- 5种架构模式（单体/微服务/客户端-服务器/分层/事件驱动）
- SOLID原则
- 设计原则与模式
- 工具与实践

### 执行操作

1. **思维导图** → 15个节点覆盖全部主题
2. **详细文档** → `Knowledge/software-architecture.md`
3. **对比表** → `Wiki/Engineering/architecture-patterns-comparison.md`

### Obsidian MCP 状态
- 连接已断开（无法直接写入）
- 使用本地文件写入 → 用户可手动同步或重新连接后执行

### 提取知识

| 知识类型 | 目标位置 |
|---------|---------|
| 软件架构核心概念 | `Knowledge/software-architecture.md` |
| 架构模式对比表 | `Wiki/Engineering/architecture-patterns-comparison.md` |
| 思维导图 | `Sessions/2026-05-31-1745-software-arch-mindmap.md` (待创建) |

### 关键收获

1. **架构模式选择**：根据复杂度选（低→单体，中→分层，高→微服务/事件驱动）
2. **SOLID原则**：5条核心设计原则，确保代码可扩展、可维护
3. **分层架构**：企业应用最广泛使用的模式，4层职责分离
4. **事件驱动**：适合高交互场景，实时处理用户行为

### 后续行动

- Obsidian MCP 重连后写入正式笔记
- 考虑创建软件架构专题 Wiki 页
- 补充具体项目中的架构选择案例