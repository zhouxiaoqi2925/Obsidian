---
tags: [claude-skills, c-level-advisor, 领域总览]
domain: c-level-advisor
total_skills: 68
source: claude-skills/c-level-advisor/
---

# C-Level Advisor 领域总览

## 1. 领域定位

**C-Level Advisor 领域**提供 **68 个**虚拟 C-suite 角色和顾问 Skills，覆盖从 CEO 到 VP Engineering 的所有高管决策场景。

**适用场景**：
- 战略决策（CEO）
- 技术战略（CTO）
- 财务规划（CFO）
- 产品路线图（CPO）
- 营销战略（CMO）
- 销售增长（CRO）
- 安全合规（CISO）
- 人力资源（CHRO）
- 数据战略（CDO）
- AI 战略（CAIO）
- 客户体验（CCO）
- 法务合规（General Counsel）
- 工程效率（VP Engineering）

## 2. Skill 分类

### 2.1 核心 C-suite 角色（13 个）
- **ceo-advisor** — CEO 顾问（战略愿景、董事会管理）
- **cto-advisor** — CTO 顾问（技术战略、团队建设）
- **cfo-advisor** — CFO 顾问（财务规划、融资）
- **cpo-advisor** — CPO 顾问（产品战略）
- **cmo-advisor** — CMO 顾问（营销战略）
- **cro-advisor** — CRO 顾问（销售增长）
- **ciso-advisor** — CISO 顾问（信息安全）
- **chro-advisor** — CHRO 顾问（人才管理）
- **coo-advisor** — COO 顾问（运营效率）
- **vp-engineering-advisor** — VP Engineering（工程效率）
- **chief-data-officer-advisor** — CDO 顾问（数据战略）
- **chief-ai-officer-advisor** — CAIO 顾问（AI 战略）
- **chief-customer-officer-advisor** — CCO 顾问（客户体验）

### 2.2 角色审查（10 个）
- **cto-review** — CTO 视角审查
- **cfo-review** — CFO 视角审查
- **cmo-review** — CMO 视角审查
- **cpo-review** — CPO 视角审查
- **cro-review** — CRO 视角审查
- **ciso-review** — CISO 视角审查
- **caio-review** — CAIO 视角审查
- **cdo-review** — CDO 视角审查
- **cco-review** — CCO 视角审查
- **vpe-review** — VPE 视角审查
- **gc-review** — General Counsel 视角审查

### 2.3 战略与决策（8 个）
- **board-meeting** — 董事会会议模拟
- **board-deck-builder** — 董事会 Deck 构建
- **decision-logger** — 决策日志
- **scenario-war-room** — 情景作战室
- **strategic-alignment** — 战略对齐
- **ma-playbook** — 并购作战手册
- **competitive-intel** — 竞争情报
- **intl-expansion** — 国际化扩张

### 2.4 组织与文化（5 个）
- **culture-architect** — 文化架构师
- **change-management** — 变革管理
- **org-health-diagnostic** — 组织健康诊断
- **executive-mentor** — 高管导师
- **founder-coach** — 创始人教练

### 2.5 战略能力（3 个）
- **company-os** — 公司运营系统
- **context-engine** — 上下文引擎
- **internal-narrative** — 内部叙事

### 2.6 特殊角色（2 个）
- **arquiteto-de-empresa** — 企业架构师（葡语）
- **agent-protocol** — Agent 协议

### 2.7 通用工具（5 个）
- **c-level-skills** — C-level 技能包
- **cs-onboard** — C-suite 入职
- **boardroom** — 董事会会议工作流
- **brief** — 简报
- **decide** — 决策工作流
- **execute** — 执行工作流
- **office-hours** — 办公时间
- **post-mortem** — 项目复盘
- **cross-eval** — 跨模型评估
- **founder-mode** — 创始人模式路由
- **onboard** — 新员工入职
- **freeze** — 冻结决策

### 2.8 高管教练（5 个）
- **board-prep** — 董事会准备
- **challenge** — 挑战（强制思考）
- **hard-call** — 艰难决定
- **postmortem** — 高管级复盘
- **stress-test** — 压力测试

## 3. 完整 Skills 索引（部分）

### C-Suite Advisor（13 个）
每个都有独立的"人格"和认知风格：
- **ceo-advisor** — 战略愿景、长期价值、董事会沟通
- **cto-advisor** — 技术债务、平台决策、团队拓扑
- **cfo-advisor** — 现金流、融资节奏、单位经济
- **cpo-advisor** — 产品愿景、Roadmap、用户研究
- **cmo-advisor** — 品牌、市场定位、增长营销
- **cro-advisor** — 销售渠道、定价、客户成功
- **ciso-advisor** — 安全合规、风险评估、事件响应
- **chro-advisor** — 招聘、文化、组织设计
- **coo-advisor** — 运营效率、流程优化
- **vp-engineering-advisor** — DORA 指标、工程招聘、团队拓扑

## 4. 工作模式

### 4.1 单顾问模式
```
用户：作为 CFO，我的下一轮融资应该什么估值？

Claude（自动调用 cfo-advisor）：
1. 加载 CFO 视角
2. 分析财务数据
3. 输出估值建议
```

### 4.2 多顾问协作
```
用户：我们要做国际化决策

Claude（自动调用）：
1. ceo-advisor — 战略价值
2. cfo-advisor — 财务可行性
3. cro-advisor — 销售可行
4. cmo-advisor — 品牌本地化
5. 综合输出决策建议
```

### 4.3 角色审查
```
用户：审查我的产品路线图

Claude（自动调用 cpo-review）：
1. CPO 视角：用户价值、竞争差异化
2. 战略一致性
3. 输出改进建议
```

## 5. 关键命令

### 5.1 cs: 命令家族
- `/cs:ceo-advisor` — 启动 CEO 顾问模式
- `/cs:founder-mode` — 创始人模式（自动路由）
- `/cs:office-hours` — 办公时间（强制提问）
- `/cs:boardroom` — 董事会会议
- `/cs:sprint` — 战略 Sprint
- `/cs:onboard` — 高管入职
- `/cs:cross-eval` — 跨模型评估
- `/cs:freeze` — 冻结决策
- `/cs:execute` — 执行

### 5.2 Persona Agents
13 个 cs-* agents（cs-cfo、cs-cto 等）

## 6. 与其它 Skill 的关系
- **上层**：调用所有业务类 Skill（marketing / product / engineering）
- **决策框架**：`spec-driven-workflow`（决策也需规格）
- **配合**：`scenario-war-room`、`board-deck-builder`

## 7. 下一步
- 📖 查看具体顾问 Skill 详解（如 [[Skill-详解/c-level-advisor/ceo-advisor]]）
- 🎯 进入 [[engineering-领域总览]] 查看工程实现