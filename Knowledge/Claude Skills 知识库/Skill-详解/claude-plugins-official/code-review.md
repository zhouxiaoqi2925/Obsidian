---
tags: [claude-skill, official, code-review, 5-agent]
source: claude-plugins-official/plugins/code-review
---

# code-review（官方版）

## 1. 元信息
- **仓库源**：claude-plugins-official/plugins/code-review
- **路径**：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\code-review`
- **分类**：官方 > 代码质量
- **触发词**："Use when the user asks to review code, check for issues, or run a code review"

## 2. 一句话定位
**5 个并行 Sonnet agent 独立审查代码**，按评分过滤，仅报告高置信度问题。

## 3. 工作流（5 个 Agent 并行）

```
         ┌─ Agent 1: 通用审查
         │
输入 ──→ ├─ Agent 2: 安全审查
代码     │
         ├─ Agent 3: 性能审查
         │
         ├─ Agent 4: 可读性审查
         │
         └─ Agent 5: 测试覆盖审查
                ↓
         评分过滤（≥80 分才采纳）
                ↓
         Haiku 二次验证
                ↓
         最终 PR 评论
```

## 4. 审查维度

| Agent | 关注点 |
|-------|--------|
| Agent 1 | 通用（命名、注释、复杂度） |
| Agent 2 | 安全（注入、密钥、权限） |
| Agent 3 | 性能（N+1、循环、内存） |
| Agent 4 | 可读性（命名、抽象） |
| Agent 5 | 测试（覆盖率、边界） |

## 5. 评分标准

- **≥80 分**：高置信度问题，写到 PR 评论
- **60-79 分**：中等置信度，可能跳过
- **<60 分**：低置信度，过滤掉

## 6. 调用示例

```
用户：审查我刚写的支付模块

Claude（自动调用 code-review）：
1. 启动 5 个 agent 并行审查
2. 评分：发现 3 个高置信度问题
   - 安全：SQL 拼接 → 必须修复
   - 性能：N+1 查询 → 必须修复
   - 错误处理：缺少重试 → 建议修复
3. 输出 PR 评论
```

## 7. 与其它 Skill 的关系
- **配合**：`karpathy-coder`、`spec-driven-workflow`
- **集成**：可作为 CI/CD 的一部分

## 8. 来源链接
- GitHub: https://github.com/anthropics/claude-plugins-official
- 本地路径：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\code-review`
- command: `code-review.md`