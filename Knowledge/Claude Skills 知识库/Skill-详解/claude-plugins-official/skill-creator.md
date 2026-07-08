---
tags: [claude-skill, official, skill-creator, meta]
source: claude-plugins-official/plugins/skill-creator
---

# skill-creator（官方 Skill 创建器）

## 1. 元信息
- **仓库源**：claude-plugins-official/plugins/skill-creator
- **路径**：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\skill-creator`
- **分类**：官方 > 元工具
- **触发词**："Use when the user asks to create a new Skill, write a SKILL.md, or design Claude Skills"

## 2. 一句话定位
**教你写自己的 Skill**。包含完整流程：设计 → 实现 → 评估 → 优化 → 打包。

## 3. 工作流

```
Step 1: skill-description 设计
  - 写 description（触发词）
  - 使用 improve_description.py 自动优化
  ↓
Step 2: SKILL.md 编写
  - 按标准模板
  - 包含工作流、规则、示例
  ↓
Step 3: 实现 scripts/ 工具
  - Python 工具脚本
  ↓
Step 4: 实现 references/ 文档
  - 参考文档、决策树、模式库
  ↓
Step 5: 评估
  - quick_validate.py — 快速校验
  - run_eval.py — 运行评估
  - aggregate_benchmark.py — 聚合基准
  - generate_report.py — 生成报告
  ↓
Step 6: 优化循环
  - 读取报告
  - 改进 SKILL.md 描述
  - 改进 references
  - 重新评估
  ↓
Step 7: 打包
  - package_skill.py — 打包成 .skill 文件
  ↓
完成
```

## 4. 关键脚本

| 脚本 | 用途 |
|------|------|
| `improve_description.py` | 自动优化 description 触发词 |
| `quick_validate.py` | 快速校验 SKILL.md 格式 |
| `run_eval.py` | 运行评估测试 |
| `aggregate_benchmark.py` | 聚合基准结果 |
| `generate_report.py` | 生成评估报告 |
| `package_skill.py` | 打包成 .skill 文件 |
| `run_loop.py` | 优化循环 |
| `utils.py` | 工具函数 |

## 5. Eval 系统

每个 Skill 应该有 `evals.json`：
```json
{
  "queries": [
    {
      "input": "帮我设计用户表",
      "expected_output_contains": ["users", "id", "email"]
    }
  ]
}
```

## 6. 来源链接
- GitHub: https://github.com/anthropics/claude-plugins-official
- 本地路径：`C:\Users\15389\claude-skills\claude-plugins-official\plugins\skill-creator`
- SKILL.md: `skills/skill-creator/SKILL.md`