---
tags: [claude-skills, claude-plugins-official, 官方插件, 领域总览]
source: claude-plugins-official/
---

# Claude Plugins Official 仓库总览

## 1. 仓库定位

**claude-plugins-official** 是 Anthropic 官方维护的 Claude Code 插件市场。所有插件都是**官方出品，质量最高、最稳定**。

## 2. 主要 Plugins

### 2.1 开发工作流
- **code-review** — 代码审查（5 个并行 agent）
- **code-simplifier** — 代码简化
- **feature-dev** — 完整功能开发（含 3 agents）
- **commit-commands** — Git 提交命令
- **code-modernization** — 代码现代化（7 agents + 12 commands）

### 2.2 Skill 创建
- **skill-creator** — Skill 创建器（教你写 Skill）
- **plugin-dev** — 插件开发套件
- **hookify** — Hook 编写

### 2.3 前端/设计
- **frontend-design** — 前端设计
- **playground** — Playground 设计模板

### 2.4 安全
- **security-guidance** — 安全指导
- **pr-review-toolkit** — PR 审查工具包

### 2.5 MCP
- **mcp-server-dev** — MCP 服务器开发
- **mcp-tunnels** — MCP 隧道
- **laravel-boost** / **firebase** / **github** / **gitlab** / **linear** / **asana** / **discord** / **telegram** / **serena** / **terraform** / **context7** / **imessage** / **greptile** — 外部集成

### 2.6 LSP（语言服务器）
- clangd-lsp / csharp-lsp / gopls-lsp / jdtls-lsp / kotlin-lsp / lua-lsp / php-lsp / pyright-lsp / ruby-lsp / rust-analyzer-lsp / swift-lsp / typescript-lsp

### 2.7 其他
- **session-report** — 会话报告
- **claude-code-setup** — Claude Code 配置建议
- **claude-md-management** — CLAUDE.md 管理
- **explanatory-output-style** — 解释输出风格
- **learning-output-style** — 学习输出风格
- **ralph-loop** — Ralph 循环
- **project-artifact** — 项目工件
- **math-olympiad** — 数学奥林匹克
- **cwc-makers** — Cardputer/M5 设备开发
- **example-plugin** — 示例插件

## 3. 核心详解

### code-review
**最常用**。5 个并行 Sonnet agent 独立审查 → 评分过滤（≥80分） → 报告问题。

### feature-dev
**完整功能开发**：
1. code-architect（架构）
2. code-explorer（探索现有代码）
3. code-reviewer（审查）

### frontend-design
专业的 UI/UX 设计 Skill，由 Anthropic 维护。

## 4. 怎么用

```bash
# 在 Claude Code CLI 中
/plugin install code-review
/plugin install feature-dev
/plugin install frontend-design
```

## 5. 与 claude-skills 的区别

| 维度 | claude-plugins-official | claude-skills |
|------|------------------------|---------------|
| 数量 | ~30 | ~348 |
| 维护方 | Anthropic | 社区 |
| 稳定性 | ★★★★★ | ★★★ |
| 复杂度 | 适中 | 复杂 |
| 适合 | 必装 | 按需 |

## 6. 下一步
- 🔧 查看具体官方插件详解（如 [[Skill-详解/claude-plugins-official/code-review]]）
- 🏗️ 进入 [[engineering-领域总览]]