---
tags: [claude-skill, engineering, helm, kubernetes]
domain: engineering
source: claude-skills/engineering/helm-chart-builder
version: 2.9.0
---

# helm-chart-builder

## 1. 元信息
- **仓库源**：claude-skills/engineering/helm-chart-builder
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\helm-chart-builder`
- **版本**：2.9.0
- **分类**：Engineering > K8s
- **触发词**："Use when the user asks to write Helm charts, template values, or design chart structure"

## 2. 一句话定位
Helm Chart 构建与优化：模板设计、values 验证、Chart 测试。

## 3. Chart 结构

```
my-chart/
├── Chart.yaml           # Chart 元数据
├── values.yaml          # 默认配置
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── _helpers.tpl     # 命名模板
│   └── NOTES.txt        # 安装后提示
├── charts/              # 依赖
├── ci/                 # 测试配置
└── README.md
```

## 4. 工作流（核心）

### Step 1: chart_analyzer
- 分析现有 Chart
- 识别反模式（hardcode、缺少 selector 等）
- 输出：chart_analysis.json

### Step 2: values_validator
- 验证 values.yaml
- 检查类型
- 检查必填字段
- 输出：values_validation.json

## 5. Helm 最佳实践

### 5.1 命名模板
```yaml
{{- include "mychart.fullname" . -}}
{{- include "mychart.labels" . -}}
```

### 5.2 资源命名
```yaml
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
```

### 5.3 强制标签
```yaml
commonLabels:
  app.kubernetes.io/name: {{ include "mychart.name" . }}
  app.kubernetes.io/instance: {{ .Release.Name }}
  app.kubernetes.io/managed-by: {{ .Release.Service }}
  app.kubernetes.io/version: {{ .Chart.AppVersion }}
```

### 5.4 values 设计
```yaml
replicaCount: 3
image:
  repository: nginx
  tag: ""  # 默认用 Chart.AppVersion
  pullPolicy: IfNotPresent
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

## 6. 高级特性

### 6.1 Conditions
```yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  ...
{{- end }}
```

### 6.2 Hooks
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  annotations:
    "helm.sh/hook": post-install,post-upgrade
    "helm.sh/hook-weight": "1"
```

### 6.3 Library Charts
```yaml
# Chart.yaml
apiVersion: v2
type: library
```

## 7. Chart 测试

```bash
# 语法检查
helm lint ./my-chart

# 渲染测试
helm template my-release ./my-chart

# dry-run
helm install my-release ./my-chart --dry-run --debug

# 单元测试
helm unittest ./my-chart

# 集成测试（kind）
helm install my-release ./my-chart
```

## 8. 源码解析

### 8.1 Python 工具脚本
- **chart_analyzer.py** — Chart 分析
- **values_validator.py** — Values 验证

### 8.2 参考文档
- **chart-patterns.md` — Chart 模式
- **values-design.md** — Values 设计原则

## 9. 调用示例

### 示例 1：创建 Chart
```
用户：给我的 FastAPI 服务写个 Helm Chart

Claude（自动调用 helm-chart-builder）：
1. chart_analyzer → 自动生成
2. values_validator → 包含 Deployment/Service/Ingress/HPA
```

## 10. 与其它 Skill 的关系
- **前置**：`docker-development`、`kubernetes-operator`
- **配合**：`ci-cd-pipeline-builder`、`ship-gate`

## 11. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\helm-chart-builder`
- SKILL.md: `skills/helm-chart-builder/SKILL.md`