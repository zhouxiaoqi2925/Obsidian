---
created: '2026-05-31'
tags:
  - 用户反馈
  - Obsidian配置
title: Obsidian AI 助手用户反馈记录
---
# Obsidian AI 助手用户反馈记录

**记录时间**：2026-05-31
**更新类型**：首次完整记录

---

## 一、用户背景

### 1.1 身份与角色
- **职业**：跨境电商从业者（TikTok Shop 东南亚/美国/欧洲）
- **副业**：AI 直播平台开发（全栈项目）
- **技术栈**：React + Go + Python + PostgreSQL + Docker/K8s

### 1.2  Obsidian 用途
- 知识管理
- AI 开发助手平台
- 项目文档管理
- Claude Code 学习框架

---

## 二、核心需求与反馈

### 2.1 功能需求（按时间顺序）

| 序号 | 需求 | 状态 | 实现方式 |
|------|------|------|----------|
| 1 | 替换 DeepSeek 为 GLM-4 | ✅ 已完成 | 插件配置切换 |
| 2 | 创建固定 AI 对话窗口 | ✅ 已完成 | 重写面板逻辑 |
| 3 | 添加联网搜索 | ✅ 已完成 | web_search tools |
| 4 | 添加专家思考模式 | ✅ 已完成 | 5步推理链 |
| 5 | 接入 GitHub 分析 | ✅ 已完成 | REST API |
| 6 | 10个开发工具 | ✅ 已完成 | DevPanelBase |
| 7 | 智能体流水线 | ✅ 已完成 | 5阶段自动执行 |
| 8 | Claude Code 工程体系文档 | ✅ 已完成 | 整理到知识库 |
| 9 | 主动整理知识库 | ✅ 已完成 | 自动整理机制 |

### 2.2 用户偏好

| 偏好项 | 具体要求 |
|--------|----------|
| 语言 | 中文回复 |
| 风格 | 紧凑、实操导向 |
| 代码注释 | 默认不写注释 |
| 询问频率 | 速度优先，减少不必要的询问 |
| 工具类型 | 只要开发相关，其他不要 |

---

## 三、问题与解决

### 3.1 API 相关
| 问题 | 原因 | 解决 |
|------|------|------|
| Gemini 403 | AQ格式是OAuth令牌 | 切换到GLM-4 |
| glm-4.7限流429 | 模型限流 | 改用 glm-4-flash |

### 3.2 插件相关
| 问题 | 原因 | 解决 |
|------|------|------|
| 插件消失 | data.json残留配置 | 清理旧配置 |
| AI窗口闪退 | 生成完就关闭 | 重写为固定面板 |

---

## 四、关键指导原则

### 4.1 开发类任务
```
代码审查/PR → code-review / pr-review
代码重构 → code-refactor
调试 → systematic-debugging
前端开发 → frontend-implementation
后端开发 → backend-api
全栈集成 → fullstack-integration
数据库 → database-modeling
测试 → testing-quality / test-driven-development
CI修复 → ci-fix
DevOps → devops-deployment
安全 → security-audit / security-hardening
```

### 4.2 文档与写作
```
README → readme-writing
架构文档 → architecture-docs
技术写作 → technical-writing
发布说明 → release-notes
会议纪要 → meeting-notes
邮件 → email-communication
提案 → proposal-writing
```

### 4.3 规划与项目
```
项目规划 → project-planning
产品需求 → product-requirements
报告 → business-report-writing
```

### 4.4 LN系列精细工序
```
文档管线：ln-100-documents-pipeline
需求分解：ln-201-opportunity-discoverer
任务执行：ln-300-task-coordinator
质量检查：ln-510-quality-coordinator
部署运维：ln-730-devops-setup
```

---

## 五、自动化规则

### 5.1 自主 Memory 更新
- 发现新的用户偏好/项目信息 → 自动写入 memory
- 发现矛盾/过时记忆 → 自动更新
- 使用章节标记标记工作阶段变化

### 5.2 知识库主动整理
- 重要决策自动写入知识库
- 技术方案自动归档
- 使用反馈自动记录
- 错误修复过程记录

### 5.3 /compact 时机
- 完成子任务后继续下一个时
- 上下文窗口使用超过 60%
- 大文件读取/搜索操作后

---

## 六、项目路径

| 项目 | 路径 |
|------|------|
| AI直播平台 | `C:\skill\ai-live-platform\` |
| Obsidian笔记库 | `G:\Obsidian Vault\` |

---

**标签**：#用户反馈 #开发偏好 #Obsidian配置
**下次更新**：持续记录
