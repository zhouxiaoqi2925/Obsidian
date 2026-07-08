---
tags: [claude-skill, engineering, ci-cd, devops]
domain: engineering
source: claude-skills/engineering/skills/ci-cd-pipeline-builder
version: 2.9.0
---

# ci-cd-pipeline-builder

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/ci-cd-pipeline-builder
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\ci-cd-pipeline-builder`
- **版本**：2.9.0
- **分类**：Engineering > CI/CD
- **触发词**："Use when the user asks to build CI/CD pipelines, configure GitHub Actions, GitLab CI, or CircleCI workflows"

## 2. 一句话定位
自动检测技术栈、生成 GitHub Actions / GitLab CI / CircleCI 流水线配置的 CI/CD Skill。

## 3. 解决什么问题
- 不同项目需要不同的 CI/CD 配置（Python/Node/Go/Java/Rust）
- 安全部署门禁（测试 → 构建 → 安全扫描 → 部署）
- 多环境管理（dev/staging/prod）

## 4. 工作流（核心）

```
Step 1: stack_detector
  - 扫描项目根目录
  - 识别：语言、框架、包管理器、测试框架
  - 识别：Docker / K8s / Serverless

Step 2: pipeline_generator
  - 根据 stack 选择模板
  - 生成：build → test → lint → security-scan → package → deploy

Step 3: 安全门禁
  - 必须通过：linting + unit tests + coverage threshold
  - 必须通过：SAST（静态分析）
  - 必须通过：依赖漏洞扫描

Step 4: 多环境部署
  - dev → 自动
  - staging → 自动（merge to main）
  - prod → 手动 approval + 自动

Step 5: 输出
  - .github/workflows/*.yml
  - .gitlab-ci.yml
  - .circleci/config.yml
```

## 5. 输入与输出
- **输入**：项目目录（任意位置）
- **输出**：
  - 完整的 CI/CD 配置文件
  - 部署脚本
  - 环境变量模板

## 6. 源码解析

### 6.1 Python 工具脚本
- **pipeline_generator.py** — 流水线生成器
- **stack_detector.py** — 技术栈检测

### 6.2 参考文档
- **pipeline-design-notes.md** — 流水线设计笔记
- **deployment-gates.md** — 部署门禁规则
- **github-actions-templates.md** — GitHub Actions 模板库
- **gitlab-ci-templates.md** — GitLab CI 模板库

## 7. 支持的技术栈
- **Python**：pytest + black + flake8 + mypy
- **Node.js**：jest + eslint + prettier
- **Go**：go test + golangci-lint
- **Java**：maven/gradle + junit + checkstyle
- **Rust**：cargo test + clippy
- **Docker**：buildx + multi-stage
- **K8s**：kubectl + helm

## 8. 调用示例

### 示例 1：Python FastAPI 项目
```
用户：我的 FastAPI 项目需要 CI/CD

Claude（自动调用 ci-cd-pipeline-builder）：
1. stack_detector → Python 3.11 + FastAPI + pytest + poetry
2. 生成 .github/workflows/ci.yml：
   - lint: ruff + black --check
   - test: pytest --cov
   - security: bandit + safety
   - build: docker build
   - deploy: kubernetes/helm
3. 多环境：dev → staging → prod (with approval)
```

### 示例 2：React + Node.js
```
用户：给 React + Express 项目加 CI

Claude（自动调用）：
1. stack_detector → Node 18 + React + Express + Jest
2. 生成：
   - frontend-ci.yml → lint + test + build + e2e
   - backend-ci.yml → lint + test + coverage + security
   - deploy.yml → Docker → ECS/Fargate
```

## 9. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`（先有规格）
- **配合**：`docker-development`、`kubernetes-operator`、`helm-chart-builder`
- **后置**：`ship-gate`（发布门禁）

## 10. 注意事项
- 不要把 secrets 硬编码到配置中
- 使用 OIDC 而不是 long-lived API keys
- 必须有缓存策略（pip cache / node_modules cache / Docker layer cache）
- 必须设置超时（防止 hang 住）

## 11. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\ci-cd-pipeline-builder`
- SKILL.md: `SKILL.md`