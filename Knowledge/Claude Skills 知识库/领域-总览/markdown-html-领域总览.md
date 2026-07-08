---
tags: [claude-skills, markdown, html, slides, 领域总览]
domain: markdown-html
total_skills: 5
source: claude-skills/markdown-html/
---

# Markdown-HTML 领域总览

## 1. 领域定位

**Markdown-HTML 领域**提供 **5 个**将 Markdown 转换为交互式 HTML 的 Skill，覆盖编排器、设计系统、文档、代码审查、Slides。

## 2. Skills

- **markdown-html-orchestrator** — 编排器（主入口）
- **md-document** — Markdown 转长文档
- **md-review** — Markdown 转代码审查报告
- **md-slides** — Markdown 转 PPT（带键盘导航）
- **design-system** — 设计系统

## 3. 工作流示例

### 3.1 Markdown 转 Slides
```
用户：把我的 README 转成 PPT

Claude（自动调用 md-slides）：
1. 解析 Markdown
2. 设计幻灯片
3. 生成 HTML
4. 支持键盘导航（箭头/空格/PgDn/Home/End）
5. 支持 presenter mode（分屏 + 时钟 + 备注）
6. 支持 URL hash 直接跳转（#3 = 第 3 张）
7. 支持 @media print 每张幻灯片一页
```

### 3.2 代码审查转 HTML
```
用户：把 PR 评论导出成 HTML

Claude（自动调用 md-review）：
1. 解析 Markdown 格式的审查
2. 应用设计系统
3. 生成可分享 HTML
```

## 4. 技术栈
- 纯 vanilla JS（无框架运行时）
- Prism.js 可选（语法高亮）
- Markdown 解析器复用 md-document

## 5. 与其它 Skill 的关系
- **上游**：`code-review`、`pr-review-expert`
- **配合**：`frontend-design`、`anthropic-skills:pptx`

## 6. 下一步
- 🎨 进入 [[engineering-领域总览]]
- 📊 进入 [[c-level-advisor-领域总览]]