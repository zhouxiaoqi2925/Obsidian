---
title: 主动知识管理最佳实践
date: 2026-05-31
tags: [知识管理, Obsidian, 最佳实践]
---

# 主动知识管理最佳实践

## 核心理念

**不要等待询问**。完成重要任务后立即整理，不要等用户提醒。

## 触发条件检查清单

每次会话结束问自己：
- [ ] 完成了什么重要任务？
- [ ] 解决了什么技术问题？
- [ ] 做出了什么决策？
- [ ] 发现了什么可复用的模式？
- [ ] 有什么值得未来回顾？

满足任一条件 → 主动整理

## 执行顺序

1. **思维导图** (3分钟)
   - 创建 `Sessions/YYYY-MM-DD-HHMM-mindmap.md`
   - 使用 `## ### ####` 层级
   - 至少 10 个节点

2. **详细文档** (5分钟)
   - 追加到 `Sessions/YYYY-MM-DD.md`
   - 更新 `Daily/YYYY-MM-DD.md`
   - 更新 `Projects/{项目}/overview.md`

3. **知识提取** (2分钟)
   - 写入 `Knowledge/{主题}.md`
   - 更新 `Wiki/_index.md`

## 目标文件夹

```
Vault/
├── Daily/           # 每日日志
├── Sessions/        # 会话 + 思维导图
├── Knowledge/       # 可复用知识
├── Projects/        # 项目进展
└── Wiki/           # 概念术语
    ├── Claude/
    ├── DevOps/
    └── Patterns/
```

## 质量标准

- frontmatter 标签完整
- 双向链接 `[[...]]` 有效
- 思维导图层级清晰
- 内容可被未来检索