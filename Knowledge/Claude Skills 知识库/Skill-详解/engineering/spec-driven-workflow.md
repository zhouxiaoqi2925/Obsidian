---
tags: [claude-skill, engineering, spec, workflow]
domain: engineering
source: claude-skills/engineering/skills/spec-driven-workflow
version: 2.9.0
---

# spec-driven-workflow

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/spec-driven-workflow
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\spec-driven-workflow`
- **版本**：2.9.0
- **分类**：Engineering > Workflow
- **触发词**："Use when the user asks to write specs before code, define acceptance criteria, plan features before implementation, generate tests from specifications, or follow spec-first development practices"

## 2. 一句话定位
**强制先写规格再写代码**的 Spec-First 开发工作流 Skill，所有代码必须可追溯到规格条目。

## 3. 解决什么问题
- 60-80% 的缺陷源自需求不清，写代码前澄清成本低、上线后澄清成本高
- 没有统一规格时，前端/后端/QA/文档各做各的，集成时混乱
- 没有验收标准，"完成"无定义，团队反复争论

## 4. 工作流（核心）

### Iron Law（铁律）
```
NO CODE WITHOUT AN APPROVED SPEC.
NO EXCEPTIONS. NO "QUICK PROTOTYPES." NO "I'LL DOCUMENT IT LATER."
```

### Step 1: 写规格（9 个强制章节）
| # | 章节 | 关键规则 |
|---|------|---------|
| 1 | Title and Metadata | 作者、日期、状态（Draft/In Review/Approved/Superseded）、审查者 |
| 2 | Context | 为什么存在，2-4 段，附证据（指标、工单） |
| 3 | Functional Requirements | RFC 2119 关键词，编号 FR-N，每条原子可测 |
| 4 | Non-Functional Requirements | 性能、安全、可访问性、可扩展性、可靠性 — 全部可测阈值 |
| 5 | Acceptance Criteria | Given/When/Then，每个 AC 至少引用一个 FR-* 或 NFR-* |
| 6 | Edge Cases | 编号 EC-N，覆盖所有外部依赖的失败模式 |
| 7 | API Contracts | TypeScript 接口，含成功和错误响应 |
| 8 | Data Models | 表格（字段、类型、约束），每个实体都要有 |
| 9 | Out of Scope | 明确排除项和原因 |

### Step 2: 规格评审
- 内部一致性检查
- 含糊度评分（>30% 不明确则 STOP）
- 询问利益相关者

### Step 3: 实施
- 每行代码追溯到 FR-*
- 每个测试追溯到 AC-*

### Step 4: 验证
- 规格 → 测试 → 代码 三方一致
- 任何偏离需要更新规格

## 5. Bounded Autonomy Rules（边界规则）

### STOP and Ask When:
1. **范围蔓延**：实现需要规格外的东西
2. **歧义 >30%**：无法从规格确定正确行为
3. **破坏性变更**：会改变现有 API/Schema/公共接口
4. **安全影响**：涉及认证、授权、加密、PII
5. **性能未知**：无法测量或保证性能特征

### 可以独立做：
- 实施已批准的规格
- 修复非破坏性 bug
- 添加日志/监控（不改业务行为）

## 6. RFC 2119 关键词

| Keyword | 含义 |
|---------|------|
| **MUST** | 绝对要求 |
| **MUST NOT** | 绝对禁止 |
| **SHOULD** | 推荐（除非有文档化理由才能省略） |
| **MAY** | 可选 |

## 7. 源码解析

### 7.1 Python 工具脚本
- **spec_generator.py** — 规格生成器
- **spec_validator.py** — 规格验证器（检查 9 个章节完整性）
- **test_extractor.py** — 从 AC 提取测试用例

### 7.2 参考文档
- **spec_format_guide.md** — 9 个章节的模板
- **acceptance_criteria_patterns.md** — Given/When/Then 模式库（认证、CRUD、搜索、文件上传、支付、通知、可访问性）
- **bounded_autonomy_rules.md** — 边界规则详细说明

## 8. 调用示例

### 示例 1：新功能开发
```
用户：我要做一个会员等级功能

Claude（自动调用 spec-driven-workflow）：
1. 询问业务上下文、目标用户、成功指标
2. 生成 spec.md：
   - FR-1: 系统 MUST 支持 5 个会员等级（普通/银/金/铂金/钻石）
   - FR-2: 用户 MUST 能查看当前等级和升级进度
   - FR-3: 系统 MUST 根据消费金额自动升级
   - AC-1: Given 用户消费满 1000 元，When 系统处理订单，Then 用户升级到银级
   - EC-1: 支付失败时不能升级
   - ...
3. 等待用户确认
4. 进入实施阶段
```

### 示例 2：Bug 修复
```
用户：登录接口 500 错误

Claude（自动调用）：
1. 评估：是否是 spec-violation bug（规格内有但实现错了）？
   - 是 → 直接修复
   - 否 → STOP，需要先更新规格
2. 修复后，更新测试覆盖此场景
```

## 9. 与其它 Skill 的关系
- **基础**：所有工程类 Skill 的前置（database-designer / api-design-reviewer / feature-dev 都需要规格）
- **配合**：`database-designer`（按规格设计 schema）
- **后置**：`code-review`（审查代码是否遵守规格）

## 10. 注意事项
- 不能跳过规格直接写代码
- 规格变更需要重新评审
- 不是文档，而是**合同**
- 规格 IS 测试计划

## 11. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\spec-driven-workflow`
- SKILL.md: `SKILL.md`