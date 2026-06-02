---
title: Spaced Repetition 间隔重复使用指南
tags: [SRS, 间隔重复, 学习, 复习]
date: 2026-06-01
sr-due: 2026-06-02
sr-interval: 1
sr-ease: 2.5
---

# Spaced Repetition 间隔重复使用指南

## 什么是 Spaced Repetition

Spaced Repetition (SR) 是 Obsidian 上的间隔重复插件，基于 SM-2 算法自动安排复习时间。

## 安装

1. Obsidian → 设置 → 第三方插件 → 浏览
2. 搜索 `Spaced Repetition`
3. 安装并启用
4. [直接打开](obsidian://show-plugin?id=obsidian-spaced-repetition)

## 闪记卡语法

### 单向卡（挖空）

```markdown
问题是什么？::这是答案
```

### 双向卡（问答）

```markdown
#flashcard
问题是什么？
?
这是答案
```

### 完形填空

```markdown
学习间隔重复的核心算法是::SM-2
```

## 复习命令

- 打开 `Spaced Repetition` 面板（默认左侧边栏）
- 快捷键：`Shift + 鼠标点击` 闪记链接会立即复习
- 每日提醒：会按到期时间推送卡片

## 评级方式

- **Again** (< 1天): 忘记了
- **Hard** (~2天): 困难
- **Good** (~5天): 良好
- **Easy** (~7天): 简单

## 已创建闪记卡包

- [[SRS-Cards-软件架构]]
- [[SRS-Cards-Obsidian高级玩法]]
- [[SRS-Cards-DevOps]]

## 最佳实践

1. **每天固定时间复习**（早晨或睡前）
2. **理解后再制卡**，不要死记硬背
3. **保持简短**，每张卡 1 个知识点
4. **使用完形填空**，降低写作成本
5. **联系实际**，加入项目案例

## 相关链接

- [Spaced Repetition 官方文档](https://www.stephenmwangi.com/obsidian-spaced-repetition/)
- [[Dataview 仪表盘使用指南]]
- [[proactive-knowledge-mgmt]]
