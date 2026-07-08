---
tags: [claude-skill, engineering, code-quality, karpathy]
domain: engineering
source: claude-skills/engineering/karpathy-coder
version: 2.9.0
---

# karpathy-coder

## 1. 元信息
- **仓库源**：claude-skills/engineering/karpathy-coder
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\karpathy-coder`
- **版本**：2.9.0
- **分类**：Engineering > Code Quality
- **触发词**："Use when the user asks to write code following Karpathy's principles, run complexity checks, or enforce goal verification"

## 2. 一句话定位
按 **Andrej Karpathy 的编码原则**写代码：假设验证、复杂度控制、Diff 外科手术、目标验证。

## 3. 解决什么问题
- AI 写代码容易"过度工程"——加很多假设的特性
- 代码改动太大（diff 不集中）
- 实现了功能但偏离目标

## 4. Karpathy 的核心原则

### 4.1 原则 1：先假设验证
> Don't write code based on assumptions. Test the assumption first.

### 4.2 原则 2：最简单的代码
> The best code is the code you don't write. Second best is the simplest code that works.

### 4.3 原则 3：Diff 外科手术
> Changes should be minimal and focused. Don't refactor unrelated code.

### 4.4 原则 4：目标验证
> After implementation, verify the original goal is met. Not just "did I write code" but "did I solve the problem".

## 5. 工作流（核心）

```
Step 1: assumption_linter
  - 扫描代码中的"假设"注释（TODO/FIXME/XXX/假设）
  - 评估：哪些假设需要先验证
  - 输出：assumptions_to_test.json

Step 2: 验证假设
  - 写最小测试代码验证假设
  - 失败 → 重新设计
  - 成功 → 继续

Step 3: complexity_checker
  - 圈复杂度
  - 嵌套深度
  - 函数长度
  - 参数数量
  - 输出：complexity_report.json

Step 4: diff_surgeon
  - 检查 diff 范围
  - 是否涉及未相关的重构
  - 输出：diff_audit.json

Step 5: goal_verifier
  - 对照原始目标
  - 检查每个目标点是否实现
  - 输出：goal_verification.json
```

## 6. 输入与输出
- **输入**：代码变更 + 原始目标
- **输出**：4 个 JSON 报告 + 通过/失败结论

## 7. 源码解析

### 7.1 Python 工具脚本
- **assumption_linter.py** — 扫描代码假设
- **complexity_checker.py** — 复杂度检查
- **diff_surgeon.py** — Diff 范围审计
- **goal_verifier.py** — 目标达成验证

### 7.2 参考文档
- **karpathy-principles.md** — Karpathy 原始原则
- **anti-patterns.md** — 反模式
- **enforcement-patterns.md** — 强制执行模式

### 7.3 期望输出
- **assumption_linter.json** — 假设清单
- **complexity_checker.json** — 复杂度评分
- **diff_surgeon.json** — Diff 审计
- **goal_verifier.json** — 目标验证

### 7.4 Hooks
- **karpathy-gate.sh** — 强制 gate，CI/CD 中可集成

### 7.5 Agent
- **karpathy-reviewer.md** — Karpathy 风格审查员

## 8. 调用示例

### 示例 1：写新功能
```
用户：帮我写一个缓存装饰器

Claude（自动调用 karpathy-coder）：
1. assumption_linter → 识别假设："假设所有函数都是可序列化的"
2. 验证假设 → 写测试，反序列化失败 → 修改设计
3. complexity_checker → 检查装饰器复杂度
4. diff_surgeon → 检查改动是否最小
5. goal_verifier → "缓存装饰器"目标达成
```

### 示例 2：审查代码
```
用户：审查我刚提交的 PR

Claude（自动调用 karpathy-reviewer agent + karpathy-coder skill）：
1. 加载 PR diff
2. assumption_linter → 找出所有 TODO/FIXME
3. complexity_checker → 复杂度评分
4. diff_surgeon → 是否包含无关重构
5. goal_verifier → 对照 PR 描述的目标
6. 输出报告
```

## 9. 与其它 Skill 的关系
- **基础**：所有代码类 Skill 的质量保障
- **配合**：`code-simplifier`、`zero-hallucination-coder`、`spec-driven-workflow`
- **集成**：可集成到 `ci-cd-pipeline-builder` 的 quality gate

## 10. 注意事项
- 这不是替换 lint，而是补充
- 对 AI 生成的代码特别有效
- 与 `code-review` Skill 互补（karpathy 关注 AI 编码质量，code-review 关注通用质量）

## 11. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\karpathy-coder`
- SKILL.md: `skills/karpathy-coder/SKILL.md`