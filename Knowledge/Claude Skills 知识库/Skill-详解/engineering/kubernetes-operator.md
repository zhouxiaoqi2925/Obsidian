---
tags: [claude-skill, engineering, kubernetes, operator, k8s]
domain: engineering
source: claude-skills/engineering/kubernetes-operator
version: 2.9.0
---

# kubernetes-operator

## 1. 元信息
- **仓库源**：claude-skills/engineering/kubernetes-operator
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\kubernetes-operator`
- **版本**：2.9.0
- **分类**：Engineering > K8s
- **触发词**："Use when the user asks to design Kubernetes Operators, CRDs, or reconcile loops"

## 2. 一句话定位
Kubernetes Operator 开发 Skill：CRD 设计、Reconcile 循环、Operator SDK / Kubebuilder。

## 3. Operator 架构

```
┌─────────────────────┐
│   Custom Resource   │  ← 用户声明期望状态
│   (CR / CRD)        │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Reconcile Loop     │  ← 持续对比实际 vs 期望
│  (Controller)       │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Actual State      │  ← K8s 资源
│   (Deployments,     │
│    Services, etc.)  │
└─────────────────────┘
```

## 4. 工作流（核心）

### Step 1: crd_validator
- 验证 CRD 设计
- 检查 spec/status 划分
- 检查 schema 规范
- 输出：crd_validation.json

### Step 2: operator_capability_audit
- 评估 Operator 成熟度
- 检查能力等级（1-5）
- 输出：capability_matrix.json

### Step 3: reconcile_lint
- 验证 reconcile 循环幂等性
- 检查错误处理
- 输出：reconcile_lint.json

## 5. Operator 5 个成熟度等级

| Level | 名称 | 能力 |
|-------|------|------|
| 1 | Basic Install | 自动化部署 |
| 2 | Seamless Upgrades | 平滑升级 |
| 3 | Full Lifecycle | 完整生命周期 |
| 4 | Deep Insights | 监控/日志/指标 |
| 5 | Auto Pilot | 自动调优/自愈 |

## 6. CRD 设计原则

### 6.1 spec vs status 分离
```yaml
apiVersion: example.com/v1
kind: MyApp
metadata:
  name: my-app
spec:                    # 用户定义的期望状态
  replicas: 3
  image: myapp:v1.0
  config:
    logLevel: info
status:                  # Operator 维护的实际状态
  phase: Running
  readyReplicas: 3
  conditions:
    - type: Ready
      status: "True"
      lastTransitionTime: "..."
```

### 6.2 字段命名
- **结构化**（不扁平）
- **可选字段用指针**（区分未设置 vs 零值）
- **枚举值明确**
- **包含 examples**

## 7. Reconcile 循环原则

### 7.1 幂等性
> 同样的输入永远产出同样的输出

### 7.2 单调性
> Reconcile 不应该撤销前一次的成功

### 7.3 错误处理
```go
func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 1. 获取 CR
    // 2. 比较 spec vs status
    // 3. 如果不一致 → 调整 actual state
    // 4. 更新 status
    // 5. 返回（requeue 或 done）
    
    if err != nil {
        return ctrl.Result{Requeue: true}, err
    }
    return ctrl.Result{}, nil
}
```

## 8. 工具链

| 工具 | 语言 | 特点 |
|------|------|------|
| Kubebuilder | Go | 官方推荐 |
| Operator SDK | Go/ Ansible/ Helm | 多种选择 |
| Metacontroller | 任意 | 基于 Webhook |
| KUDO | YAML | 声明式 |

## 9. 源码解析

### 9.1 Python 工具脚本
- **crd_validator.py** — CRD 验证
- **operator_capability_audit.py** — 成熟度审计
- **reconcile_lint.py** — Reconcile lint

### 9.2 参考文档
- **crd_design.md** — CRD 设计原则
- **operator_pattern.md** — Operator 模式
- **reconcile_loop.md** — Reconcile 循环详解
- **tooling_landscape.md** — 工具全景

### 9.3 资产
- **crd_template.yaml** — CRD 模板
- **reconcile_skeleton.go** — Reconcile Go 骨架

## 10. 调用示例

### 示例 1：CRD 设计
```
用户：我要为我的数据库服务设计一个 Operator

Claude（自动调用 kubernetes-operator）：
1. crd_validator → 设计 Database CRD
2. operator_capability_audit → Level 2
3. reconcile_lint → 提供 Go 骨架
```

## 11. 与其它 Skill 的关系
- **前置**：`spec-driven-workflow`、`docker-development`
- **配合**：`helm-chart-builder`、`ci-cd-pipeline-builder`

## 12. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\kubernetes-operator`
- SKILL.md: `skills/kubernetes-operator/SKILL.md`