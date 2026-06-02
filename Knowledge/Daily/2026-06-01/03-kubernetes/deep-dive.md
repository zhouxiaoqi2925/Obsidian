# Kubernetes 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：声明式 API + 控制循环 = 终极模式

### 核心公式
```
Observed State --diff--> Desired State
                          │
                          ↓ 控制器驱动
                   Observed State
```
**控制器 = 持续向"期望状态"靠拢的进程**

### 关键思想
| 概念 | 含义 | 类比 |
|------|------|------|
| **Spec** | 期望状态 | 菜谱 |
| **Status** | 实际状态 | 当前菜品 |
| **Controller** | 拉齐两者的循环 | 厨师 |
| **Reconcile** | 控制器调谐 | 做一道菜 |

### 为什么胜过命令式
- **幂等性**：apply 同一个 YAML 100 次 = 1 次
- **可观测**：diff 看到所有状态
- **可恢复**：删 pod 自动重建
- **可组合**：CRD + Controller = 子系统

---

## 专题 2：List-Watch 模式

### 客户端拿到集群全状态的 2 步
1. **List**：拉全量 (e.g. 所有 Pod)
2. **Watch**：监听增量 (Added/Modified/Deleted)

### 为什么是 List + Watch 而不是纯 Watch
- Watch 断了就丢事件，**List 重建状态**才稳
- 这是 etcd watch + 客户端缓存的 2 步套路

### 资源版本号 (ResourceVersion)
- 每次 List 拿 `resourceVersion`
- Watch 从这个版本继续，保证不漏
- 乐观并发控制：更新带 resourceVersion，版本对不上 409 Conflict

### 实际效果
```go
// 10w Pod 的集群
// List 一次: 1s, 5MB
// Watch 事件流: < 1MB/s
// 客户端 cache: O(1) 查 pod, 不打 API Server
```

---

## 专题 3：调度器深度 — 从 predicates 到 framework

### 调度 2 步
```
            filter
┌──────────┐  │  排除不满足硬约束的 Node
│  Pod     │──┤
└──────────┘  ↓
         ┌─────────────┐
         │ feasibleNodes│
         └──────┬──────┘
                │
            score
                │  软约束打分
                ↓
         ┌─────────────┐
         │ priorityList│
         └──────┬──────┘
                │
        selectHost 随机 + score
                ↓
         ┌─────────────┐
         │  chosen     │
         └─────────────┘
```

### 调度框架 13 个扩展点
| 阶段 | 扩展点 | 作用 |
|------|--------|------|
| 预过滤 | PreFilter | 提早算可复用信息 |
| 过滤 | Filter | 硬约束 (NodeSelector, NodeAffinity) |
| 后过滤 | PostFilter | 抢占前的清理 |
| 预打分 | PreScore | 打分前预处理 |
| 打分 | Score | 软约束 (least requested, balanced) |
| 预留 | Reserve | 临时占资源 |
| 允许 | Permit | 等待批准 (gang scheduling) |
| 预绑定 | PreBind | 绑前 hook (volume 预留) |
| 绑定 | Bind | 真正写 API |
| 后绑定 | PostBind | 绑后清理 |
| 释放 | Unreserve | 失败回滚 |

### 调度缓存
- `podQueue`：待调度 Pod
- `nodeInfoList`：每个 Node 的可调度资源 (CPU/Mem/Pods/Requested)
- 缓存更新异步，不阻塞调度循环

---

## 专题 4：网络模型 — CNI + kube-proxy

### Pod 网络要求
- 每个 Pod 唯一 IP
- Pod 间不 NAT 直接通
- Pod 看到的 IP = 集群外看到的 IP (No NAT)

### CNI 插件分类
| 类型 | 代表 | 性能 | 复杂度 |
|------|------|------|--------|
| 桥接 | bridge | 中 | 低 |
| Overlay | flannel/calico | 低 | 中 |
| BGP | calico-bgp | 高 | 高 |
| eBPF | cilium | 极高 | 中 |
| 路由 | kube-router | 高 | 中 |

### kube-proxy 模式
| 模式 | 性能 | 复杂度 | 适用 |
|------|------|--------|------|
| iptables | 中 | 低 | < 5000 service |
| IPVS | 高 | 中 | 大集群 |
| eBPF (cilium) | 极高 | 中 | 极致性能 |

### Service 三种类型
- **ClusterIP**：集群内
- **NodePort**：节点端口
- **LoadBalancer**：云厂商 LB
- **ExternalName**：CNAME 代理

### DNS
- CoreDNS：Pod 启动后注入 `nslookup kubernetes.default`
- FQDN：`<svc>.<ns>.svc.cluster.local`

---

## 专题 5：5 段必读代码逐段详解

### 5.1 `controller.go:processNextWorkItem` — 通用工作队列模式
**关键**：从 workqueue 取 item → reconcile → 处理错误
- 失败 requeue 限速（rate limiter）
- `Forget()` 成功后清除
- **可复用**：所有 K8s 控制器都长这样

### 5.2 `kubelet.go:syncLoop` — 3 通道 select
**关键**：housekeeping/source/loop 三类事件统一处理
- housekeeping: 1h 周期 (cleanup)
- source:PLEG (Pod Lifecycle Event Generator) 周期 1s
- loop:api watch 增量
- 任何一类都触发 SyncHandler

### 5.3 `SharedInformer:Run` — List-Watch 客户端缓存
**关键**：List 重建 + Watch 增量 + FIFO 队列
- 不打 API Server 也能查 Pod
- Resync 周期重发 → consumer 必须 idempotent

### 5.4 `scheduler.go:scheduleOne` — 调度主循环
**关键**：filter + score + 异步 bind
- bind 不阻塞下一个 Pod
- 失败入 unschedulable queue，周期重试

### 5.5 `proxier.go:Sync` — iptables 全量/增量同步
**关键**：期望状态 → iptables 规则
- 增量 diff 减少 IO
- chains 分层: KUBE-SERVICES → KUBE-SVC → KUBE-SEP

---

## 专题 6：性能调优

### API Server
```yaml
--max-requests-inflight=2000
--max-mutating-requests-inflight=1000
--watch-cache-sizes=pod#10000
# etcd 性能
--etcd-servers=https://etcd:2379
--etcd-compaction-interval=5m
```

### Scheduler
```yaml
--kube-api-qps=50
--kube-api-burst=100
--percentage-of-nodes-to-score=50  # 大集群采样
```

### Kubelet
```yaml
--max-pods=110
--node-status-update-frequency=10s
--image-gc-high-threshold=85
--image-gc-low-threshold=80
```

### kube-proxy
```yaml
# IPVS 模式
--proxy-mode=ipvs
--ipvs-min-sync-period=5s
--ipvs-scheduler=rr  # rr/lc/dh/sh/sed/nq
```

### 网络
- CNI：cilium 优于 calico 优于 flannel
- MTU：calico IPIP 1450, vxlan 1450, 裸 BGP 1500
- conntrack：调大 `nf_conntrack_max`

---

## 专题 7：故障模式 + 应急

### F1：Pod Pending
```bash
kubectl describe pod <name>  # 看 Events
# 常见原因:
# - 资源不足 (Events: 0/N nodes are available)
# - nodeSelector 不匹配
# - PVC 未 Bound
# - 镜像拉取失败
```

### F2：CrashLoopBackOff
```bash
kubectl logs <pod> --previous  # 上一次容器日志
# 常见原因:
# - 应用启动失败 (配置错)
# - 健康检查不通
# - 退出码 137 (OOMKilled)
```

### F3：节点 NotReady
```bash
kubectl describe node <node>
# 常见:
# - kubelet 挂了
# - 磁盘满 (ephemeral-storage)
# - 内存压力
# - 网络分区
```

### F4：etcd 性能
```bash
ETCDCTL_API=3 etcdctl endpoint status
# 关键指标:
# - disk_wal_fsync_duration_seconds (P99 < 10ms)
# - db_size (默认 2GB 上限)
# - leader_changes_seen_total
```

### F5：DNS 解析失败
```bash
kubectl exec -it <pod> -- nslookup kubernetes.default
# 常见:
# - CoreDNS 挂了
# - nodelocaldns 缓存污染
# - upstream DNS 不可达
```

---

## 专题 8：复用模式

### 模式 A：List-Watch + 缓存
**场景**：任何分布式客户端缓存
- 启动 list 一次
- watch 增量
- 本地 cache 供业务查

### 模式 B：workqueue + reconcile
**场景**：任何"持续向期望靠拢"的控制器
```go
for {
    key, _ := queue.Get()
    if err := reconcile(key); err != nil {
        queue.AddRateLimited(key)
    } else {
        queue.Forget(key)
    }
    queue.Done(key)
}
```

### 模式 C：3 通道 select
**场景**：长循环 + 多种事件源
- housekeeping (周期)
- source (状态变化)
- loop (外部信号)

### 模式 D：声明式 API + 控制器
**场景**：任何 SaaS 系统
- 用户改 spec
- 控制器自动 reconcile
- 状态变化通过 status 反馈

---

## 专题 9：实战部署拓扑

### 单 master（开发）
```
       ┌──────┐
       │Sched+API│
       │etcd   │
       └──────┘
           │
       ┌───┴───┐
       │       │
      Node1  Node2
```
**适用**：本地开发
**风险**：master 单点

### HA 3 master（生产）
```
       ┌──────────┐
       │  LB      │
       └────┬─────┘
   ┌───────┼────────┐
   │       │        │
┌──┴──┐ ┌──┴──┐ ┌──┴──┐
│API  │ │API  │ │API  │
│Sched│ │Sched│ │Sched│
│etcd │ │etcd │ │etcd │
└──┬──┘ └──┬──┘ └──┬──┘
   └───────┴───────┘
       Worker Nodes
```

### 多 Region / 边缘
- **Karmada**：多集群联邦
- **KubeFed**：v1 已被 Karmada 替代
- **Liqo**：跨集群 Pod 调度

---

## 专题 10：K8s 让我重新思考的 5 件事

1. **声明式 > 命令式**。给"期望状态"比给"步骤"更可恢复。
2. **控制器是分布式系统里的"猫"**。只要目标状态没达到，就一直尝试。
3. **API 是真理之源**。所有状态都在 etcd，UI/CLI/Operator 都只是 API 的客户端。
4. **CRD 让 K8s 变成平台**。Helm、Operator、Knative 都基于 CRD。
5. **不要试图绕过 K8s**。直接 SSH 到 Node 改东西最终必败。

---

## 专题 11：Scheduler Framework 13 扩展点深度

### 13 个扩展点全景
```
┌────────────────────────────────────────────┐
│  1. PreEnqueue        (workqueue 入口)     │
│  2. EnqueueExtension  (可否入队)           │
│  3. PreFilter         (调度前准备)         │
│  4. Filter            (硬约束 - 必须满足)  │
│  5. PostFilter        (filter 全失败后补救)│
│  6. PreScore          (打分前准备)         │
│  7. Score             (软约束 - 加权)      │
│  8. NormalizeScore    (归一化)             │
│  9. Reserve           (预留资源)           │
│ 10. Permit            (批准/等待/拒绝)     │
│ 11. PreBind           (绑定前钩子)         │
│ 12. Bind              (执行绑定)           │
│ 13. PostBind          (绑定后钩子)         │
└────────────────────────────────────────────┘
```

### 两阶段详解：Filter + Score

#### Filter 阶段（硬约束）
- **作用**: 把"绝对不能放"的节点排除
- **顺序**: 并行执行所有 Filter plugin, 任一返回 Unschedulable → 该节点淘汰
- **性能**: 越早 fail 越省, 默认 scheduler 内置 8 个 Filter:
  - NodeUnschedulable: 排除 cordon 节点
  - NodeName: 限定 nodeName 字段
  - NodeAffinity: 节点亲和/反亲和
  - NodePorts: 端口冲突检查
  - NodeResourcesFit: CPU/内存/HugePage 资源
  - NodeSelector: 节点 label 匹配
  - NodeTaints: toleration 检查
  - NodeVolumeLimits: 卷数限制

#### Score 阶段（软约束）
- **作用**: 在 Filter 过的节点里挑"最想要的"
- **算法**: 每个 plugin 给 0-100 分, 加权求和, 归一化后选最高
- **关键点**:
  - 默认 LeastAllocated (资源空闲越多分越高)
  - 反向是 MostAllocated (反 binpack, 节省节点)
  - BalancedAllocation: CPU/内存均衡

### 自定义扩展范式
```go
// 1. 实现 Plugin interface
type MyPlugin struct{}
func (p *MyPlugin) Name() string { return "MyPlugin" }

// 2. 注册到 framework
framework := runtime.NewFramework(
    runtime.WithPlugins(
        config.LoadFactory("MyPlugin",
            func(obj runtime.Object, h framework.Handle) (framework.Plugin, error) {
                return &MyPlugin{}, nil
            }),
        ),
)

// 3. scheduler 调用
func (p *MyPlugin) Filter(ctx context.Context, state *framework.CycleState, pod *v1.Pod, node *framework.NodeInfo) *framework.Status {
    // 写你的过滤逻辑
    return framework.NewStatus(framework.Success)
}
```

### Permit 阶段的高级玩法
- **Approve**: 直接批准
- **Wait**: 等待条件满足 (带 timeout)
- **Deny**: 拒绝
- **场景**: 多 scheduler 协调, 资源配额等待, 审批流

### 性能数字
- 5k 节点 + 10k Pod, 调度 1k Pod: ~5s (5 Pod/核/s)
- 自定义 plugin 加 2 个: 性能 -20% (filter 串行)
- Score 并行: 16 线程足够, 32 边际收益 0

---

## 专题 12：CRD + Operator 模式深度

### CRD 是什么
- **CustomResourceDefinition**: 让你自定义资源类型
- **作用**: 把"领域知识"注入 K8s, 不再只能跑 Pod
- **生态**: ArgoCD (Application), Cert-Manager (Certificate), Istio (VirtualService), KEDA (ScaledObject)

### CRD 三要素
```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: applications.argoproj.io
spec:
  group: argoproj.io
  scope: Namespaced  # 或 Cluster
  names:
    plural: applications
    singular: application
    kind: Application
    shortNames: [app]
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                source:
                  type: object
  subresources:
    status: {}  # 启用 status 子资源
```

### Controller 模式四要素
1. **Watch**: List-Watch 自定义资源
2. **Reconcile**: 期望状态 vs 实际状态
3. **Update status**: 反馈当前状态
4. **Requeue**: 失败重试 (指数退避)

### controller-runtime 模板
```go
func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    // 1. 获取资源
    obj := &MyResource{}
    if err := r.Get(ctx, req.NamespacedName, obj); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 2. 期望状态 (Spec) vs 实际状态 (Status)
    desired := computeDesired(obj)
    actual := obj.Status

    // 3. 收敛
    if !reflect.DeepEqual(desired, actual) {
        if err := r.applyState(ctx, obj, desired); err != nil {
            return ctrl.Result{Requeue: true}, err  // 失败重试
        }
        obj.Status = desired
        if err := r.Status().Update(ctx, obj); err != nil {
            return ctrl.Result{Requeue: true}, err
        }
    }
    return ctrl.Result{}, nil
}
```

### Operator 模式 5 层
- **L1**: 简单 Controller (单资源 CRUD)
- **L2**: 多资源协调 (Deployment + Service + ConfigMap)
- **L3**: 状态备份/恢复 (etcd backup, DB snapshot)
- **L4**: 升级/降级 (滚动 + 兼容性检查)
- **L5**: 自动化运维 (扩缩容, 自动调参)

### Finalizer 机制
- **问题**: 资源删除时需要清理外部资源 (RDS 实例, S3 bucket)
- **方案**: Finalizer 字段 + Controller 监听 Delete
- **流程**:
  1. 用户删资源 → apiserver 加 deletionTimestamp
  2. Controller 看到 deletionTimestamp + finalizer 不为空
  3. 跑清理逻辑 (删 RDS / S3)
  4. 移除 finalizer
  5. apiserver 真正删除

---

## 专题 13：RBAC + NetworkPolicy + Security

### RBAC 四要素
1. **Role / ClusterRole**: 一组权限 (verb + resource + namespace)
2. **Subject**: User / Group / ServiceAccount
3. **RoleBinding / ClusterRoleBinding**: 把权限绑给 Subject
4. **ServiceAccount**: Pod 身份

### 权限粒度
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["*"]
```

### ServiceAccount 身份传播
```yaml
# 1. 创建 SA
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-sa
  namespace: default

# 2. Pod 用 SA
spec:
  serviceAccountName: my-sa
  automountServiceAccountToken: true

# 3. 在 Pod 内 /var/run/secrets/kubernetes.io/serviceaccount/token
#    Authorization: Bearer <token> 调 apiserver
```

### NetworkPolicy 三要素
1. **podSelector**: 选目标 Pod
2. **policyTypes**: Ingress / Egress
3. **from / to**: 流量规则 (selector, namespaceSelector, ipBlock, port)

### 默认拒绝 + 显式允许
```yaml
# 1. 默认全拒绝 (namespace 标签)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]

# 2. 显式允许 web → db:5432
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-web-to-db
spec:
  podSelector:
    matchLabels: {role: db}
  policyTypes: [Ingress]
  ingress:
  - from:
    - podSelector: {matchLabels: {role: web}}
    ports: [{protocol: TCP, port: 5432}]
```

### Pod Security Standards (PSS)
- **Privileged**: 不受限 (系统 Pod)
- **Baseline**: 最小限制 (大部分)
- **Restricted**: 强安全 (生产)

### 7 个安全必做
1. 强制 Pod Security Standards (baseline+)
2. NetworkPolicy 默认拒绝 + 显式允许
3. RBAC 最小权限 (拒绝 cluster-admin)
4. Secret 走外部 (Vault, External Secrets)
5. Image 签名 (cosign, Notary)
6. Runtime 安全 (Falco, Tracee)
7. mTLS (Istio, Linkerd)

---

## 专题 14：K8s 故障排查决策树

### Pod 启动失败
```
Pod 状态: Pending / ImagePullBackOff / CrashLoopBackOff / Error
   │
   ├── Pending → describe 看 Events
   │     ├── "FailedScheduling" → 资源不足 / 节点亲和 / taint
   │     ├── "FailedMount" → PVC 没绑 / StorageClass 错
   │     └── "ImagePullBackOff" → image 名错 / 私有仓库凭证
   │
   ├── Waiting → describe 看 reason
   │     ├── CrashLoopBackOff → 看 logs --previous
   │     └── CreateContainerError → 资源 limit 错 / 权限
   │
   └── Running 但流量不来
         ├── Service selector 不匹配
         ├── Endpoints 为空
         └── kube-proxy 没生效 (iptables/ipvs 规则没)
```

### 5 大故障速查

| 症状 | 排查命令 | 根因 |
|------|---------|------|
| Pod Pending | `kubectl describe pod` | 资源 / 调度 / 镜像 |
| Pod 启动后崩 | `kubectl logs --previous` | 应用 bug / 配置错 |
| Service 流量不达 | `kubectl get ep` | selector 错 / 端口错 |
| Node NotReady | `kubectl describe node` | kubelet 死 / 资源耗尽 |
| apiserver 503 | `kubectl get events -A` | etcd 慢 / RBAC 限流 |

### 7 步排查法
1. **kubectl get**: 当前状态
2. **kubectl describe**: 事件 + 期望 vs 实际
3. **kubectl logs**: 应用日志
4. **kubectl exec**: 进 Pod 看现场
5. **kubectl debug**: 调试 sidecar
6. **kubectl get events -A**: 集群级事件
7. **kubectl get --raw /api/v1/...**: apiserver 直查

### 性能问题排查
- **etcd 慢**: `etcdctl endpoint status` 看 fsync 延迟, 写盘太慢
- **apiserver 卡**: `kubectl get --raw /metrics` 看 request_duration_seconds
- **scheduler 慢**: 看 `scheduler_queue_incoming_pods_total` / `scheduler_pending_pods`
- **kubelet 慢**: 看 `kubelet_pleg_relist_duration_seconds`

---

## 专题 15：K8s 反模式 (5 必避)

### 反模式 1：直接 SSH 节点
- **症状**: 临时修东西, 节点重启就丢
- **正解**: 走 DaemonSet / ConfigMap / Operator
- **金句**: "Node 是不受信的, 状态可丢失"

### 反模式 2：用 latest tag
- **症状**: 镜像悄无声息升级, 业务崩
- **正解**: 强制 v1.0.0-sha.abc1234
- **金句**: "不可变 = 镜像 ID 不可变"

### 反模式 3：不用 namespace
- **症状**: 资源混乱, 权限失控
- **正解**: 按 team/env 拆 namespace, 加 ResourceQuota
- **金句**: "namespace 是 K8s 的虚拟集群"

### 反模式 4：绕开 apiserver 直接读 etcd
- **症状**: 锁冲突 + 性能差
- **正解**: 永远走 watch / informer
- **金句**: "apiserver 是 K8s 唯一的真理"

### 反模式 5：把 K8s 当 VM 用
- **症状**: 1 Pod 1 进程 1 GB 内存, 浪费
- **正解**: Pod 内多容器, sidecar 模式
- **金句**: "Pod 不是 VM, 是逻辑主机"

---

## 专题 16：K8s 跨项目引用 / 上下游

### 上游依赖
- **etcd**: 唯一 storage, 强一致性要求
- **containerd / CRI-O**: 容器运行时
- **CNI plugin**: 网络 (Calico / Cilium / Flannel)
- **CSI driver**: 存储 (ceph-csi, aws-ebs-csi)

### 下游生态
- **Helm**: 包管理, template 渲染
- **ArgoCD / Flux**: GitOps
- **Prometheus**: 监控 (内置 metrics server)
- **Istio / Linkerd**: Service Mesh
- **cert-manager**: 证书管理 (CRD)
- **KEDA**: 事件驱动 autoscaling
- **Knative**: Serverless

### 跨项目对照表

| 项目 | K8s 怎么用 | 关键 API |
|------|-----------|----------|
| **etcd** | K8s storage | 客户端走 apiserver |
| **Redis** | K8s Operator 部署 | StatefulSet + Headless Service |
| **Postgres** | 云原生 Postgres Operator | CRD + PVC + Service |
| **Go** | client-go + controller-runtime | informer + workqueue |
| **vLLM** | GPU 调度 + Operator | device plugin + CRD |
| **Prometheus** | metrics API + serviceMonitor | apiserver 自定义 metric |
| **Vault** | auth/kubernetes 注入 | service account token 认证 |

### "如果我重来一次, 我会先学 K8s"
K8s 不是工具, 是平台。
- 学 K8s 前: 业务代码 + 部署脚本 + 监控脚本
- 学 K8s 后: 业务代码 + 几个 yaml
- 代价: 入门陡, 但学会后所有分布式问题都有"标准答案"

### "K8s 解决不了什么问题"
- **跨集群一致**: federation 弱, multi-cluster 是难题
- **有状态应用**: Operator 能解 80%, 剩下 20% 要手工
- **超大规模**: 5k 节点就吃力, 10k+ 需要 federation 或拆分
- **极致性能**: syscall 路径长, 延迟敏感场景 (高频交易) 不适合



---

## 🔗 进一步阅读

- 源码：https://github.com/kubernetes/kubernetes
- 设计文档：https://github.com/kubernetes/community/tree/master/contributors/design-proposals
- 调度框架：https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/
- CRD 开发：https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/
- 实战书：《Kubernetes 源码剖析》《Programming Kubernetes》
