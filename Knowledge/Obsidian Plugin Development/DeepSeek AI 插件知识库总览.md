---
tags:
  - obsidian-plugin
  - 知识导航
created: '2026-05-31'
title: DeepSeek AI 插件知识库总览
---
# DeepSeek AI 插件知识库总览

**创建时间**：2026-05-31
**文档类型**：知识导航

---

## 一、核心文档

| 文档 | 说明 |
|------|------|
| [[DeepSeek AI 插件开发完整记录]] | 开发历程、技术决策、架构设计 |
| [[DeepSeek AI 插件使用指南]] | 使用方法、配置说明、常见问题 |
| [[Claude Code 企业级工程体系]] | 企业级开发框架、能力成长模型 |

---

## 二、开发工具索引

### 十大开发工具
1. **代码审查** → Code Review 分析
2. **技术方案设计** → Architecture Design
3. **Bug诊断** → Debug & Troubleshooting
4. **Schema生成** → Database Schema Generator
5. **需求拆分** → User Story Mapping
6. **代码解说** → Code Explanation
7. **测试生成** → Test Case Generation
8. **提交信息** → Git Commit Message
9. **配置生成** → Config Generator
10. **智能体流水线** → Agent Pipeline（5阶段自动执行）

---

## 三、技术栈

### 3.1 AI 模型
- **当前**：GLM-4-Flash（智谱）
- **API 端点**：https://open.bigmodel.cn/api/paas/v4/chat/completions

### 3.2 插件架构
- **语言**：TypeScript
- **构建**：esbuild
- **输出**：CommonJS bundle
- **文件**：`main.js` (65.8KB)

---

## 四、能力模型

### 六维度核心能力
1. **上下文工程**：精准提取、裁剪、投喂项目信息
2. **提示词架构**：将模糊需求转化为结构化指令
3. **架构把控**：识别 AI 代码中的设计缺陷
4. **验证与 TDD**：构建自动化验证网
5. **智能体编排**：Hooks、MCP、CI/CD 集成
6. **安全与合规**：威胁建模、沙箱化验证

### 四阶演进路径
| 阶段 | 名称 | 核心技能 |
|------|------|----------|
| L1 | 破冰者 | 基础交互、单文件任务 |
| L2 | 驾驭者 | 标准工作流、TDD |
| L3 | 架构师 | 跨文件重构、MCP集成 |
| L4 | 智能体工程师 | CI/CD深度集成 |

---

## 五、知识库结构

```
G:\Obsidian Vault\Knowledge\
├── Claude Code 企业级工程体系.md
├── Obsidian Plugin Development\
│   ├── DeepSeek AI 插件开发完整记录.md
│   ├── DeepSeek AI 插件使用指南.md
│   └── DeepSeek AI 插件知识库总览.md
└── AI开发助手\
    └── [后续扩展]
```

---

## 六、自动整理机制

### 触发条件
- 重要技术决策完成
- 新功能实现完成
- 用户反馈重要指导
- 错误修复完成

### 整理流程
```
触发 → 判定类型 → 生成文档 → 写入知识库 → 更新索引
```

---

**标签**：#obsidian-plugin #知识导航 #AI开发助手
**最后更新**：2026-05-31
