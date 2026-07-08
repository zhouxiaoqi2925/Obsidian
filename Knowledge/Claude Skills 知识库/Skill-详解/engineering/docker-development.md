---
tags: [claude-skill, engineering, docker, container, devops]
domain: engineering
source: claude-skills/engineering/docker-development
version: 2.9.0
---

# docker-development

## 1. 元信息
- **仓库源**：claude-skills/engineering/docker-development
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\docker-development`
- **版本**：2.9.0
- **分类**：Engineering > DevOps > Docker
- **触发词**："Use when the user asks to write Dockerfiles, optimize images, docker-compose, or containerize applications"

## 2. 一句话定位
Dockerfile 最佳实践 + 多阶段构建 + 镜像优化 + docker-compose 编排。

## 3. Dockerfile 最佳实践

### 3.1 多阶段构建
```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### 3.2 关键原则
- **使用官方基础镜像**（Alpine 优先）
- **多阶段构建**（最终镜像小）
- **层缓存优化**（先复制 package.json，再 COPY .）
- **非 root 用户**
- **.dockerignore**（避免无用文件）
- **最小化层数**
- **HEALTHCHECK**
- **使用 ENTRYPOINT + CMD**

## 4. 工作流（核心）

### Step 1: dockerfile_analyzer
- 分析现有 Dockerfile
- 识别反模式（root 用户、太大的镜像、未优化的层）
- 输出：dockerfile_report.json

### Step 2: dockerfile_optimizer
- 生成多阶段构建
- 添加非 root 用户
- 优化层顺序
- 添加 HEALTHCHECK
- 输出：optimized_dockerfile

### Step 3: compose_validator
- 验证 docker-compose.yml
- 检查 healthcheck
- 检查 depends_on 顺序
- 检查 volume 挂载
- 输出：compose_validation.json

## 5. 镜像大小优化技巧

| 技巧 | 节省 | 示例 |
|------|------|------|
| Alpine 基础镜像 | 80% | node:18-alpine vs node:18 |
| 多阶段构建 | 50-80% | 分离构建和运行时 |
| 清理 apt cache | 30% | `rm -rf /var/lib/apt/lists/*` |
| 合并 RUN 命令 | 10-20% | 减少层数 |
| 使用 .dockerignore | 10% | 排除 node_modules 等 |
| distroless 镜像 | 90% | gcr.io/distroless/... |

## 6. 源码解析

### 6.1 Python 工具脚本
- **dockerfile_analyzer.py** — Dockerfile 分析
- **compose_validator.py** — Compose 验证

### 6.2 参考文档
- **dockerfile-best-practices.md** — 完整最佳实践
- **compose-patterns.md** — Compose 模式

## 7. 调用示例

### 示例 1：优化现有 Dockerfile
```
用户：我的 Docker 镜像 2GB，太大了

Claude（自动调用 docker-development）：
1. dockerfile_analyzer → 发现使用完整 ubuntu 镜像、未多阶段、未清理 cache
2. dockerfile_optimizer → 输出 Alpine + 多阶段，镜像降到 150MB
```

### 示例 2：docker-compose 编排
```
用户：写个 docker-compose 启动我的 FastAPI + Postgres + Redis

Claude（自动调用）：
1. compose_validator → 自动生成
2. 包含 healthcheck、depends_on、networks、volumes
```

## 8. 与其它 Skill 的关系
- **配合**：`kubernetes-operator`、`ci-cd-pipeline-builder`
- **后置**：`helm-chart-builder`

## 9. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\docker-development`
- SKILL.md: `skills/docker-development/SKILL.md`