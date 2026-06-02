---
tags:
  - obsidian-plugin
  - ai-development
created: '2026-05-31'
status: completed
title: DeepSeek AI 插件开发完整记录
---
# DeepSeek AI 插件开发完整记录

**创建时间**：2026-05-31
**项目阶段**：已完成 V3.0
**文档状态**：最终版本

---

## 一、项目起源与需求演进

### 1.1 初始需求
将 Obsidian 打造成完整的 AI 开发助手平台，核心诉求：
- 替换 DeepSeek 为国产大模型
- 创建固定 AI 对话窗口
- 添加联网搜索 + 专家思考模式
- 接入 GitHub 进行项目深度分析
- 添加 10 个开发工具
- 创建智能体流水线

### 1.2 需求演进路径
```
V1.0 → V2.0 → V3.0
单模型 → 多能力 → 全栈开发平台
```

---

## 二、技术架构

### 2.1 四层微内核架构
```
┌─────────────────────────────────────┐
│         接入层 (Interface Layer)      │
│   CLI / Web / RESTful API / 管理后台   │
├─────────────────────────────────────┤
│         业务层 (Business Layer)        │
│  学习流程引擎 / 代码评测 / 任务管理     │
├─────────────────────────────────────┤
│         AI能力层 (AI Core Layer)       │
│  Claude客户端 / Prompt模板 / 代码解析   │
├─────────────────────────────────────┤
│        基础设施层 (Infra Layer)         │
│  配置中心 / 日志 / 缓存 / 安全沙箱      │
└─────────────────────────────────────┘
```

### 2.2 核心模块

| 模块 | 功能 |
|------|------|
| DevPanelBase | 所有开发工具抽象基类 |
| GLMClient | 智谱 GLM-4 API 调用 |
| ExpertMode | 专家思考模式（5步推理链）|
| AgentPipeline | 智能体流水线（5阶段执行）|
| GitHubIntegration | GitHub 仓库分析 |

---

## 三、API 配置

### 3.1 智谱 GLM-4 配置
```json
{
  "provider": "glm",
  "glmApiKey": "674fa76fd43a43c996eb363c64add5df.kpaItwOmMK1IkWLX",
  "glmModel": "glm-4-flash",
  "glmUrl": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

### 3.2 模型切换历史
1. **Gemini AQ 格式** → 403 PERMISSION_DENIED（AQ 是 Vertex AI OAuth 令牌）
2. **glm-4.7-flash** → HTTP 429 限流
3. **glm-4-flash** → 当前版本，稳定运行

---

## 四、十大开发工具

### 4.1 工具列表
| 编号 | 工具名称 | 功能描述 |
|------|----------|----------|
| 1 | 代码审查 | Code Review 分析 |
| 2 | 技术方案设计 | Architecture Design |
| 3 | Bug诊断 | Debug & Troubleshooting |
| 4 | Schema生成 | Database Schema Generator |
| 5 | 需求拆分 | User Story Mapping |
| 6 | 代码解说 | Code Explanation |
| 7 | 测试生成 | Test Case Generation |
| 8 | 提交信息 | Git Commit Message |
| 9 | 配置生成 | Config Generator |
| 10 | 智能体流水线 | Agent Pipeline |

### 4.2 统一架构：DevPanelBase
所有工具继承自 DevPanelBase：
- 统一 UI 样式
- 统一执行流程
- 统一结果展示
- 可扩展性强

---

## 五、智能体流水线

### 5.1 五阶段执行流程
```
用户输入项目目标
    ↓
阶段1：深度分析 → 解析需求与目标
    ↓
阶段2：知识获取 → GitHub 仓库分析
    ↓
阶段3：架构规划 → 制定技术方案
    ↓
阶段4：任务分解 → 拆分开发任务
    ↓
阶段5：执行方案 → 给出详细步骤
    ↓
最终合成 → 输出架构图 + 思维导图
```

### 5.2 动态规划机制
- 根据用户输入动态生成 5 阶段计划
- 逐阶段执行，每阶段独立调用 AI
- 最终汇总生成完整方案

---

## 六、专家思考模式

### 6.1 5步推理链
```
1. 问题拆解 → 将问题分解为核心子问题
2. 知识梳理 → 列出分析所需的全部关键知识点
3. 深度分析 → 对每个子问题进行专家级分析
4. 综合结论 → 整合所有分析，给出系统性结论
5. 行动计划 → 提供可执行的下一步建议
```

### 6.2 配置参数
- temperature: 0.3（确定性）
- system prompt: 专家角色定义
- 联网搜索: 同时启用

---

## 七、错误修复记录

### 7.1 Gemini API 403 错误
- **原因**：AQ 格式是 Vertex AI OAuth 令牌，无法调用 generateContent
- **解决**：切换到智谱 GLM-4

### 7.2 限流 429 错误
- **原因**：glm-4.7-flash 模型限流
- **解决**：改用 glm-4-flash 模型

### 7.3 插件消失问题
- **原因**：data.json 残留旧配置导致加载崩溃
- **解决**：清理所有旧字段，仅保留 glm 配置

### 7.4 AI 对话窗口闪退
- **原因**：生成完成后窗口关闭
- **解决**：重写为固定面板，结果直接显示在面板上方

---

## 八、文件结构

```
G:\Obsidian Vault\.obsidian\plugins\deepseek-plugin\
├── src/
│   └── main.ts          # 核心插件代码
├── main.js              # 构建输出 (65.8KB)
├── data.json            # 配置存储
└── manifest.json        # 插件清单
```

---

**相关文档**：
- [[Claude Code 企业级工程体系]]
- [[DeepSeek AI 插件使用指南]]

**标签**：#obsidian-plugin #ai-development #glm-4 #开发助手
