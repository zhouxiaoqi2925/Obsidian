---
tags: [claude-skills, trailofbits, security, 领域总览]
source: trailofbits-skills/
---

# Trail of Bits Skills 总览（安全专精）

## 1. 仓库定位

**trailofbits-skills** 由 **Trail of Bits**（顶级安全研究公司）维护，专注于代码安全审计、漏洞检测、密码学验证。

## 2. Skills 列表

### 2.1 漏洞检测
- **cosmos-vulnerability-scanner** — Cosmos/区块链智能合约漏洞扫描
  - EVM、CosmosWasm、IBC、State、Advanced 漏洞模式
- **zeroize-audit** — 内存清理审计
  - 检测敏感数据是否被正确清理

### 2.2 测试与验证
- **property-based-testing** — 基于属性的测试（fuzzing）
- **semgrep-rule-creator** — Semgrep 规则创建
- **semgrep-rule-variant-creator** — Semgrep 规则变体创建
- **testing-handbook-generator** — 测试手册生成

### 2.3 分析工具
- **dimensional-analysis** — 量纲分析（检测单位错误）
- **differential-review** — 差异审查
- **fp-check** — 浮点检查

### 2.4 调试
- **debug-buttercup** — 调试（Buttercup 工具）
- **property-based-testing** — 属性测试

### 2.5 工作流设计
- **workflow-skill-design** — 工作流 Skill 设计
  - 含反模式、工具分配指南、渐进式披露指南
- **skill-improver** — Skill 改进器

### 2.6 智能合约
- **building-secure-contracts** — 构建安全合约
  - Cosmos、EVM、Solidity 漏洞模式

## 3. 关键工作流

### 3.1 Cosmos 漏洞扫描
```
输入：Cosmos SDK 项目
Step 1: 静态分析（IR Analysis）
Step 2: 漏洞模式匹配
Step 3: 生成报告（含修复建议）
```

### 3.2 基于属性的测试
```
1. 定义属性（不变量）
2. 自动生成测试用例
3. 边界情况探索
4. 报告违规
```

### 3.3 Semgrep 规则创建
```
1. 输入漏洞模式描述
2. 自动生成 Semgrep 规则
3. 在目标代码库验证
4. 调整精度
```

## 4. 与其它 Skill 的关系
- **配合**：`engineering/security-guidance`、`engineering/secrets-vault-manager`
- **集成**：可集成到 CI/CD pipeline

## 5. 注意事项
- 这些 Skill 都是**专业级**，需要安全背景
- 输出报告含 CVE 引用
- 部分 Skill 需要外部工具（Semgrep、Buttercup）

## 6. 来源链接
- GitHub: https://github.com/trailofbits/skills
- 本地路径：`C:\Users\15389\claude-skills\trailofbits-skills`
- 包含 plugins: cosmos-vulnerability-scanner、property-based-testing、semgrep-rule-creator、zeroize-audit、workflow-skill-design 等

## 7. 下一步
- 🔒 查看具体安全 Skill 详解
- 🏗️ 进入 [[engineering-领域总览]]