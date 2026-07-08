---
tags: [claude-skill, official, feature-dev, fullstack]
source: claude-plugins-official/plugins/feature-dev
---

# feature-dev（官方完整功能开发）

## 1. 元信息
- **仓库源**：claude-plugins-official/plugins/feature-dev
- **路径**：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\feature-dev`
- **分类**：官方 > 开发工作流

## 2. 一句话定位
**完整功能开发** Skill：架构设计 → 探索现有代码 → 实现 → 审查，一气呵成。

## 3. 包含的 3 个 Agents

| Agent | 职责 |
|-------|------|
| **code-architect** | 设计架构方案 |
| **code-explorer** | 探索现有代码库 |
| **code-reviewer** | 审查实现的代码 |

## 4. 工作流

```
用户提出新功能需求
  ↓
Step 1: code-architect
  - 分析需求
  - 设计架构（模块划分、接口、数据流）
  - 输出 architecture.md
  ↓
Step 2: code-explorer
  - 探索现有代码
  - 识别可复用组件
  - 识别集成点
  - 输出 exploration.md
  ↓
Step 3: 实现
  - 按 architecture + exploration 写代码
  - 包含测试
  ↓
Step 4: code-reviewer
  - 审查实现的代码
  - 输出 review.md
  ↓
完成
```

## 5. 调用示例

```
用户：给我的电商项目加个会员等级功能

Claude（自动调用 feature-dev）：
1. code-architect：
   - 模块划分：models/level.py, services/level_service.py, api/levels.py
   - 数据流：用户行为 → 计算等级 → 持久化
   - 输出架构文档
2. code-explorer：
   - 发现现有 User 模型
   - 发现 events 事件总线
   - 识别集成点
3. 实现：完整代码 + 测试
4. code-reviewer：审查
```

## 6. 与其它 Skill 的关系
- **基础**：`spec-driven-workflow`（先写规格）
- **配合**：`database-designer`、`api-design-reviewer`、`api-test-suite-builder`
- **后置**：`ship-gate`

## 7. 注意事项
- 大功能需要拆分
- 架构设计阶段不要急于写代码
- 与 `claude-skills/spec-driven-workflow` 配合效果最佳

## 8. 来源链接
- GitHub: https://github.com/anthropics/claude-plugins-official
- 本地路径：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\feature-dev`
- command: `feature-dev.md`