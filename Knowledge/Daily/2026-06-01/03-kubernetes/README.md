---
tags: [open-source, deep-dive, distributed, go, container]
type: open-source-analysis
created: 2026-06-01
project_name: "kubernetes"
project_url: "https://github.com/kubernetes/kubernetes"
language: "Go"
license: "Apache-2.0"
stars: 110000
parsed_date: 2026-06-01
category: "Distributed"
status: "completed"
steps_completed: "14/14"
---

# 开源项目深度解析｜Kubernetes

> 容器编排之王，声明式 API + Controller 模式 + Reconcile 循环

## 项目元信息

| 字段 | 值 |
|------|-----|
| 项目名 | Kubernetes (k8s) |
| 主语言 | Go |
| License | Apache-2.0 |
| Stars | 110k+ |
| 复刻难度 | ⭐⭐⭐⭐⭐⭐ |

---

## 0. 准备

```bash
git clone --depth 1 https://github.com/kubernetes/kubernetes.git  # 1.5GB
```

**5 问**：
1. 解决什么？→ 容器编排、自动扩缩、滚动更新
2. 为什么 Go？→ 生态 + 并发 + 部署友好
3. 核心数据流？→ kubectl → apiserver → etcd → controller → kubelet
4. 骨架文件？→ `cmd/kube-apiserver`、`cmd/kube-controller-manager`、`cmd/kubelet`、`pkg/kubelet`
5. 坑？→ 写 controller 不收敛 / CRD 改字段要小心 / apiserver 重启时 in-flight 请求

---

## 1. Charter

| 字段 | 内容 |
|------|------|
| 一句话定位 | 容器编排系统，自动化部署/扩缩/管理 |
| 核心问题 | 大规模容器生命周期管理 |
| 目标用户 | 云平台、SRE、DevOps |
| 商业模式 | CNCF 毕业，云厂商 + Red Hat 主导 |
| 复刻难度 | ⭐⭐⭐⭐⭐⭐ |

---

## 2. 框架

```
k8s/
├── cmd/                          # 入口
│   ├── kube-apiserver/
│   ├── kube-controller-manager/
│   ├── kube-scheduler/
│   └── kubelet/
├── pkg/                          # 核心包
│   ├── kubelet/                  # ⭐
│   ├── controller/               # ⭐
│   ├── scheduler/                # ⭐
│   ├── api/                      # 公共 API
│   ├── apis/                     # 版本化 API
│   ├── registry/                 # 注册中心
│   ├── runtime/                  # 运行时
│   └── util/
├── staging/                      # staging 目录（构建时 link）
│   └── src/k8s.io/
├── plugin/                       # 插件
├── test/                         # 集成测试
└── vendor/                       # 依赖
```

**架构模式**：
- apiserver + etcd：声明式存储
- Controller Manager：N 个 Controller
- Scheduler：plugin 链 + 过滤打分
- Kubelet：每个节点 1 个

---

## 3. 画像

| 维度 | 数据 |
|------|------|
| 代码行 | ~500 万（含 vendor） |
| 主代码 | ~150 万 Go |
| 贡献者 | 3500+ |
| 月均提交 | 500+ |
| 直接依赖 | 250+ |
| 间接依赖 | 2000+ |

---

## 4. 架构

```
┌──────────────────────────────────────────────┐
│           kubectl (CLI)                       │
└──────────────┬───────────────────────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────────────────────┐
│  kube-apiserver (声明式 API 入口)             │
│  - 认证鉴权                                   │
│  - admission webhook                         │
│  - 写 etcd                                    │
└──────────────┬───────────────────────────────┘
               │
        ┌──────┴──────┬──────────────┐
        ▼             ▼              ▼
   ┌─────────┐  ┌──────────┐  ┌─────────────┐
   │  etcd   │  │Scheduler │  │Controllers  │
   │         │  │(过滤+打分)│  │(Deployment, │
   │         │  │          │  │ ReplicaSet…) │
   └─────────┘  └──────────┘  └──────────────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │   Kubelet    │
                                │  (每节点 1)  │
                                │  - PodSpec   │
                                │  - CRI       │
                                │  - 探针       │
                                └──────┬───────┘
                                       ▼
                                ┌──────────────┐
                                │  Container   │
                                │  Runtime     │
                                │ (docker/containerd)│
                                └──────────────┘
```

**核心模式**：声明式 + Controller + Reconcile Loop

```go
// 伪代码：controller 核心
func (c *MyController) Reconcile(req Request) (Result, error) {
    // 1. 读期望状态
    obj := c.Get(req.NamespacedName)
    
    // 2. 读实际状态
    actual := c.observe(obj)
    
    // 3. 计算差异
    diff := computeDiff(obj.Spec, actual)
    
    // 4. 应用差异
    if err := c.apply(diff); err != nil {
        return RequeueAfter(5s), err
    }
    
    return Done, nil
}
```

---

## 5. 代码深度解析 ⭐

### 5.1 apiserver 的 watch 机制

**文件**：`staging/src/k8s.io/apimachinery/pkg/watch/*.go`

```go
// Watch 接口：从 etcd watch 出来后，apiserver 转发给 client
type Interface interface {
    Stop()
    ResultChan() <-chan Event
}
```

**为什么这样写**：
- channel-based：天然支持 fan-out（多个 watcher 共享一个 etcd watch）
- decoder 在 client 端：减少 apiserver 内存
- bookmark event：解决 resync 性能

### 5.2 Scheduler 框架

**文件**：`pkg/scheduler/framework/runtime/framework.go`

**核心流程**：
```
Pod 入队
    ↓
SchedulingQueue
    ↓
SchedulePod
    ↓
┌─────────────────────────────────┐
│ PreFilter → Filter (N 个)        │
│  ↓ 失败 → Unschedulable          │
│ PreScore → Score (N 个)          │
│  ↓ 算总分                        │
│ Reserve → Permit                  │
│ PreBind → Bind                   │
└─────────────────────────────────┘
```

**Plugin 接口设计**：
```go
type Plugin interface {
    Name() string
}

type FilterPlugin interface {
    Plugin
    Filter(ctx context.Context, state CycleState, pod *v1.Pod, nodeInfo *NodeInfo) *Status
}

type ScorePlugin interface {
    Plugin
    Score(ctx context.Context, state CycleState, p *v1.Pod, n *NodeInfo) (int64, *Status)
    ScoreExtensions() ScoreExtensions
}
```

**为什么这样写**：
- 扩展点（Filter/Score/Bind）独立：plugin 互不干扰
- 框架调度 plugin：用户只实现业务逻辑
- 借鉴：所有需要"插件 + 框架"的系统都该这么设计

### 5.3 Kubelet 核心循环

**文件**：`pkg/kubelet/kubelet.go`

```go
// 简化的 syncLoop
func (kl *Kubelet) syncLoop(ctx context.Context, ...) {
    for {
        select {
        case update := <-kl.configCh:
            kl.handleConfigUpdate(update)
        case <-kl.syncLoopCh:
            kl.syncPod(ctx, ...)
        case <-housekeepingCh:
            kl.runGarbageCollection()
        }
    }
}
```

**为什么这样写**：
- 单一 goroutine 处理核心循环：避免复杂并发
- 3 个 channel 分工清晰：pod 更新 / 周期同步 / 清理
- syncPod 是 reconcile 入口

### 5.4 Controller Runtime

**文件**：`pkg/controller/controller.go`

```go
func (c *Controller) processNextWorkItem() bool {
    key, quit := c.queue.Get()
    defer c.queue.Done(key)
    
    if err := c.syncHandler(ctx, key); err != nil {
        c.queue.AddRateLimited(key)  // 失败重试
        return true
    }
    c.queue.Forget(key)
    return true
}
```

**为什么**：
- workqueue：失败任务自动 requeue
- AddRateLimited：指数退避
- Forget：成功后清理

---

## 6. 运行

```bash
# 用 minikube 或 kind 本地起集群
minikube start

# 看节点
kubectl get nodes

# 部署应用
kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --port=80
```

**Smoke test**：
```bash
kubectl run test --image=busybox --rm -it --restart=Never -- wget -qO- http://nginx
```

---

## 7. 演进

| 阶段 | 时间 | 关键 |
|------|------|------|
| 2014 | v0.x | Google Borg 经验 |
| 2015 | v1.0 | 1.0 稳定 |
| 2016 | 1.3-1.4 | Deployment 完善 |
| 2017 | 1.6-1.8 | RBAC + CRD |
| 2018 | 1.10-1.13 | 监控 + 存储 |
| 2019 | 1.14-1.16 | Windows + CRD 稳定 |
| 2020 | 1.18-1.20 | Dockershim 废弃 |
| 2021 | 1.22 | Dockershim 移除 |
| 2023 | 1.28 | Sidecar GA |
| 2024 | 1.30+ | Gateway API GA |

**灵魂人物**：
- Joe Beda（创始）
- Brendan Burns
- Craig McLuckie

---

## 8. 质量

| 维度 | 数据 |
|------|------|
| 单测覆盖 | 75%+ |
| 集成测试 | e2e 套件庞大 |
| CI | Prow（Google 自研） |
| Lint | golangci-lint 50+ 规则 |
| 模糊测试 | 长期跑 |
| 性能 | Kubemark（模拟万节点） |

---

## 9. 依赖

| 依赖 | 用途 |
|------|------|
| `etcd-io/etcd` | 存储 ⭐ |
| `prometheus/client_golang` | metrics |
| `spf13/cobra` | CLI |
| `golang/protobuf` | 序列化 |
| `google.golang.org/grpc` | 内部通信 |

---

## 10. 生产实践

| 实践 | 怎么做 |
|------|--------|
| 部署 | kubeadm / kops / kubespray |
| HA apiserver | 3+ 节点 + LB |
| 网络 | CNI（calico/cilium/flannel） |
| 存储 | CSI |
| Ingress | NGINX / Traefik / Gateway |
| 监控 | Prometheus + Grafana |
| 日志 | Loki / EFK |
| Tracing | Jaeger / Tempo |
| GitOps | ArgoCD / Flux |
| 备份 | Velero |

---

## 11. 社区

- CNCF 毕业项目
- 3500+ 贡献者
- SIG（特别兴趣小组）分组治理
- 每年 KubeCon

---

## 12. 教训

### 必偷 3 件
1. **声明式 + Controller + Reconcile**：所有"期望状态"系统都该用
2. **Plugin 框架**：Filter/Score/Bind 扩展点独立
3. **Watch 机制 + workqueue**：异步事件处理范式

### 必避 3 坑
1. **写 Controller 不收敛**：一定要 idempotent + 加 metric
2. **CRD 改字段不兼容**：用 conversion webhook
3. **apiserver 直接读 etcd**：永远走 watch

### 7 天复刻
```
D1: minikube 跑起来
D2: 读 apiserver 入口
D3: 读 controller-manager 启动流程
D4: 读 kubelet syncLoop
D5: 写个 mini-controller（CRD + Reconcile）
D6: 读 scheduler 框架
D7: 写博客
```

### 打分（5/5/5/5/5）

---

## 13. 学习卡片

### 《Kubernetes》学习卡片

#### 一句话价值
> 容器编排的事实标准，**声明式 API + Controller 模式**的工业教科书。

#### 3 个洞察
1. **声明式 = "描述你想要什么"**：系统负责把实际状态逼近
2. **Controller = 永远在 Reconcile**：失败重试、最终一致
3. **Watch + workqueue**：异步事件处理的标准范式

#### 5 段必读代码
1. `pkg/kubelet/kubelet.go:syncLoop` — 节点核心循环
2. `staging/src/k8s.io/apimachinery/pkg/watch/...` — watch 机制
3. `pkg/scheduler/framework/runtime/framework.go` — 调度框架
4. `pkg/controller/controller.go:processNextWorkItem` — 队列消费
5. `cmd/kube-apiserver/app/server.go` — apiserver 启动

#### 反模式
- 早期 kubectl 直接连 etcd → 性能差 → 改为 apiserver 中转

#### 可复用模式
- Controller 模式 → 任何"期望状态"系统（数据库同步、配置下发、状态机同步）

#### 马上用 3 件事
1. [ ] 写个 mini-controller 用 controller-runtime
2. [ ] 用 Reconcile 模式改某个同步逻辑
3. [ ] 引入 watch + workqueue 做事件驱动

---

## 🏷️ 标签

`#开源项目` `#深度解析` `#Kubernetes` `#k8s` `#Controller` `#声明式` `#Go`

## 🔗 关联笔记

- [[开源项目深度解析体系]]
- [[每日开源项目抓取任务]]
- [[etcd-深度解析]]
- [[Redis-深度解析]]
