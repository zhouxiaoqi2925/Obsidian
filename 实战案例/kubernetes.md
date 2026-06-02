# kubernetes - 容器编排事实标准

**GitHub**: kubernetes/kubernetes
**Star**: 112k+
**语言**: Go
**主题**: container-orchestration、controller、scheduler、declarative-api、CRD
**适用场景**: 微服务容器编排、K8s 集群管理、Operator 模式开发、CRD 自定义资源

---

## 一、基础范式

### 模式 1 · 声明式 API + 期望状态

**问题场景**：传统运维靠 SSH 跑命令执行命令式变更，难追溯、难回滚、多人协作冲突；业务要"我声明想要什么状态，框架自动调成"。

**解决方案**：kubectl apply YAML 提交"期望状态"到 API Server；etcd 存当前状态；controller-manager 跑 reconcile loop 对比 diff 调成；status 字段回写实际状态；3 个角色清晰分离（用户声明 / 框架调成 / 用户查询）。

**关键参数**：
- Spec 期望状态
- Status 实际状态
- `kubectl apply` 提交
- etcd 存储
- reconcile diff

**最佳实践**：云原生项目首选"声明式 API + reconcile loop"范式，**比命令式脚本好测 10x**；适用任何"集群管理 / IaC / 自动化运维"。

### 模式 2 · Controller 模式 + Reconcile Loop

**问题场景**：业务要"Pod 挂了自动重启 / 副本数不够自动扩"，单一 watch 循环难复用。

**解决方案**：每个 controller 跑独立 goroutine；`Informer` watch 资源 + 事件入本地 cache；`workqueue` 去重保证 1 个资源 1 个处理；`reconcile(key)` 函数读期望状态 + 实际状态 + 调成；`RequeueAfter` 定时重试；处理失败重入 queue。

**关键参数**：
- `Informer` watch + cache
- `workqueue` 去重
- `reconcile(key)` 单入口
- 失败重入 queue
- RequeueAfter 定时

**最佳实践**：库要做"事件驱动"时用 controller + reconcile 是 K8s 黄金模式；**适用任何"自动化调谐"场景**（数据库同步、CI 触发、配置漂移）。

### 模式 3 · Scheduler 插件链 + Filter/Score

**问题场景**：调度 Pod 到 Node 要考虑 CPU/内存/亲和性/污点/拓扑 20+ 因素，单函数难维护。

**解决方案**：`kube-scheduler` 走 2 阶段：① Filter 阶段 `NodeFilter` 插件链排除不满足条件的 Node（resource fit / node selector / taints）② Score 阶段 `NodeScore` 插件链打分（least allocated / balanced / node affinity）③ Bind 选最高分；每个插件 100-500 行可插拔。

**关键参数**：
- Filter 排除不满足
- Score 打分排序
- 插件链可插拔
- 多阶段决策
- 默认 + 自定义插件

**最佳实践**：库要做"多约束决策"时分 Filter + Score 2 阶段，每阶段插件化；**比单一打分函数灵活 10x**；适用任何"调度 + 路由"系统。

### 模式 4 · Pod + Container 双层抽象

**问题场景**：业务要"1 个 Pod 跑多容器共享网络/存储"或"1 个容器 1 个 IP"二选一。

**解决方案**：Pod 是 K8s 最小调度单位，1 个 Pod 可含 1-N 个 Container；Pod 内 Container 共享 network namespace（localhost 互通）+ Volume；不同 Pod 独立 IP；`kind: Pod` YAML 直接定义；`Deployment` 间接管 Pod 副本。

**关键参数**：
- Pod 调度单位
- Container 计算单位
- 共享 network ns
- 共享 Volume
- 独立 IP 边界

**最佳实践**：K8s 部署要"边车模式"（日志收集/代理/监控）就用 Pod 多容器；**单容器用 Deployment**；适用任何"微服务 + 边车"。

### 模式 5 · Service + Endpoint 解耦 IP

**问题场景**：Pod IP 动态变化（重启/扩缩容），客户端要"固定地址 + 负载均衡"。

**解决方案**：`Service` 资源定义 selector 选 Pod；`Endpoint` 控制器自动维护 Pod IP 列表；kube-proxy 配 iptables/IPVS 负载均衡；ClusterIP / NodePort / LoadBalancer / ExternalName 4 种类型；DNS 解析 `service.namespace.svc.cluster.local`。

**关键参数**：
- `Service` selector
- `Endpoint` 自动维护
- kube-proxy 负载均衡
- 4 种 Service 类型
- DNS 解析

**最佳实践**：微服务要"服务发现"就用 Service + DNS；**比手动维护 IP 列表简单 100x**；适用任何"动态 IP + 服务发现"。

---

## 二、扩展范式

### 模式 6 · CRD + Operator 自定义资源

**问题场景**：业务要"自定义资源（Database / Cache / Topic）"和 Pod 同等地位管理，K8s 默认资源不够用。

**解决方案**：`CustomResourceDefinition`（CRD）声明自定义资源（spec/status）；`Controller`（Operator）watch CR + reconcile；`controller-runtime` 库简化开发；`kubebuilder` / `Operator SDK` 脚手架；CR 在 etcd 存储 + apiserver 暴露。

**关键参数**：
- CRD 声明自定义资源
- Operator 跑 reconcile
- `controller-runtime` 库
- `kubebuilder` 脚手架
- spec + status 字段

**最佳实践**：平台团队要做"领域抽象"就用 CRD + Operator；**K8s 是平台中的平台**；适用任何"自定义资源 + 自动化运维"。

### 模式 7 · Kubelet + CRI 容器运行时

**问题场景**：K8s 调度后怎么把 Pod 真正跑起来？硬绑 Docker 不灵活。

**解决方案**：`Kubelet` 节点代理接收 Pod spec；通过 `CRI`（Container Runtime Interface）调用容器运行时（containerd / CRI-O / Docker）；`CNI`（Container Network Interface）配网络（Calico / Flannel / Cilium）；`CSI`（Container Storage Interface）挂载存储。3 接口 + 3 插件解耦。

**关键参数**：
- `CRI` 容器运行时
- `CNI` 网络
- `CSI` 存储
- 3 接口 + 3 插件
- containerd 默认

**最佳实践**：K8s 抽象出 CRI/CNI/CSI 3 接口是"基础设施即插拔"范式；**适用任何"平台 + 多实现"**（数据库协议 / 存储协议）。

### 模式 8 · kubectl apply + 3-way merge

**问题场景**：`kubectl apply` 反复执行要保留用户手动修改的字段；纯 replace 会覆盖。

**解决方案**：`kubectl apply` 走 3-way merge：live config（K8s 当前）+ new config（用户 apply）+ last-applied config（注解 kubectl.kubernetes.io/last-applied-configuration）三方对比；只改 user 改的字段；`kubectl edit` 改后 last-applied 同步更新。

**关键参数**：
- 3-way merge
- last-applied 注解
- 字段级 diff
- 保留用户修改
- server-side apply 升级版

**最佳实践**：K8s 资源管理要"声明式 + 保留用户修改"用 3-way merge；**比纯 replace 安全 10x**；适用任何"配置管理 + 增量更新"。

### 模式 9 · Helm Chart 模板化部署

**问题场景**：K8s 资源多（Deployment + Service + ConfigMap + Secret + Ingress），每个应用 10+ YAML 重复样板。

**解决方案**：Helm 把 K8s 资源模板化 + values.yaml 参数化；`helm install` 渲染模板 + 提交集群；`helm upgrade` 增量更新；`helm rollback` 回滚到上一版本；Chart 仓库共享（Artifact Hub）；`helm template` 本地渲染验证。

**关键参数**：
- Chart 模板
- values.yaml 参数
- install/upgrade/rollback
- Chart 仓库
- template 本地渲染

**最佳实践**：K8s 部署要"应用打包"用 Helm；**比纯 YAML 简单 5x**；适用任何"应用分发 + 配置管理"。

### 模式 10 · RBAC + ServiceAccount 权限

**问题场景**：多租户集群要"用户/服务/命名空间"权限隔离，admin 误操作风险大。

**解决方案**：`Role` + `RoleBinding`（命名空间内）+ `ClusterRole` + `ClusterRoleBinding`（集群范围）；`ServiceAccount` 给 Pod 身份；`kubectl auth can-i` 验证；`subjectAccessReview` API server 鉴权；最小权限原则。

**关键参数**：
- Role / RoleBinding
- ClusterRole / ClusterRoleBinding
- ServiceAccount 身份
- `auth can-i` 验证
- 最小权限原则

**最佳实践**：K8s 集群要"权限管理"必用 RBAC；**比平台 admin 简单 100x**；适用任何"多租户平台 + 权限隔离"。

---

## 三、进阶范式

### 模式 11 · 36,392 文件 + Go 350+ 万行

**问题场景**：K8s 1.30+ 代码量爆炸，新人读不动；如何定位核心代码？

**解决方案**：核心代码集中在 `pkg/kubelet/`（节点代理）+ `pkg/controller/`（controller-manager）+ `pkg/scheduler/`（调度）+ `staging/src/k8s.io/api/`（资源定义）+ `staging/src/k8s.io/apimachinery/`（基础库）；`vendor/k8s.io/` 第三方依赖；`hack/` 构建脚本。

**关键参数**：
- 36,392 文件
- Go 350+ 万行
- 5 个核心目录
- staging 渐进式迁移
- vendor 隔离

**最佳实践**：大代码库定位"5 个核心目录 + staging 渐进迁移"是行业标杆；**适用任何"百万行级 monorepo"**。

### 模式 12 · staging 渐进式迁移

**问题场景**：K8s 拆 `k8s.io/api` / `k8s.io/apimachinery` 等子库为独立仓库，但 monorepo 还要保开发体验。

**解决方案**：`staging/src/k8s.io/` 目录是 monorepo 内嵌的子库（api / apimachinery / client-go / apiextensions-apiserver 等）；`hack/update-codegen.sh` 定期同步到独立仓库；`go.mod` replace 指令指向本地；渐进迁移不停开发。

**关键参数**：
- `staging/src/k8s.io/` 嵌入子库
- `hack/update-codegen.sh` 同步
- `go.mod` replace
- 渐进不停开发
- 子库独立发布

**最佳实践**：monorepo 拆子库用 `staging/` + 自动同步是 5x 减小单仓压力的范式；**适用任何"巨型 monorepo + 多子库"**。

### 模式 13 · API 版本演进 - alpha/beta/GA

**问题场景**：K8s 1.x → 1.30+ 升级，资源 API 字段频繁变动，旧客户端挂掉。

**解决方案**：每个资源 API 走 3 阶段：`v1alpha1`（可能废弃）+ `v1beta1`（基本稳定）+ `v1`（GA 稳定）；`conversion webhook` 多版本互转；`feature gate` 开关新特性；`deprecation policy` 12 个月或 3 版本保留期。

**关键参数**：
- alpha/beta/GA 三阶段
- conversion webhook
- feature gate 开关
- 12 个月保留期
- 多版本并存

**最佳实践**：云原生项目要"API 演进"用三阶段 + 保留期；**比"破坏式升级"温和 10x**；适用任何"长期演进 + 兼容性"项目。

### 模式 14 · Etcd 强一致 KV 存储

**问题场景**：API Server 状态存哪里？传统 DB（MySQL）难做 watch + 强一致。

**解决方案**：`etcd` 强一致 KV 存储（Raft 共识）+ watch 机制 + lease（TTL）；API Server 单一入口 + 写 etcd；`etcdctl` 备份恢复；3 节点集群容 1 故障；watch 触发 controller reconcile。

**关键参数**：
- Raft 共识
- KV + watch
- lease TTL
- 3 节点容 1
- 备份恢复

**最佳实践**：K8s 选 etcd 是"强一致 + watch"范式；**适用任何"集群状态 + watch 事件"**（服务发现、配置中心）。

### 模式 15 · Admission Webhook 扩展点

**问题场景**：业务要"Pod 创建时强制加 label / 拒绝特权容器 / 注入 sidecar"，K8s 默认 admission 不够。

**解决方案**：`MutatingAdmissionWebhook` 改 spec + `ValidatingAdmissionWebhook` 拒绝；`AdmissionReview` API 序列化请求；`FailurePolicy` 失败策略；`namespaceSelector` 命名空间过滤；`objectSelector` 对象过滤；3 阶段 admission chain（mutating → validating → conversion）。

**关键参数**：
- Mutating + Validating
- AdmissionReview API
- FailurePolicy
- namespaceSelector
- 3 阶段 chain

**最佳实践**：K8s 要"自定义策略"必用 Admission Webhook；**OPA / Vault / Istio 都靠它**；适用任何"准入控制 + 策略引擎"。

---

## 四、实战范式

### 模式 16 · kubectl 5 件套 + 上下文

**问题场景**：运维新人 kubectl 50+ 子命令记不住，频繁查文档。

**解决方案**：5 件套速记：① `kubectl get pods -n ns` 查 ② `kubectl describe pod name` 看详情 ③ `kubectl logs -f pod` 看日志 ④ `kubectl exec -it pod -- sh` 进容器 ⑤ `kubectl apply -f xx.yaml` 部署；`kubectl config use-context prod` 切集群。

**关键参数**：
- get / describe / logs
- exec / apply
- `-n` 命名空间
- `--context` 切集群
- 5 件套速记

**最佳实践**：K8s 运维必背 5 件套 + 上下文切换；**日常 80% 操作覆盖**；适用任何"kubectl 入门 + 日常运维"。

### 模式 17 · 监控 4 黄金指标

**问题场景**：K8s 集群挂了不知道哪里出问题；监控 metric 太多抓不到重点。

**解决方案**：4 黄金指标：① CPU/内存使用率（`node_cpu_utilization` / `container_memory_working_set_bytes`）② 网络流量（`node_network_transmit_bytes`）③ Pod 状态（`kube_pod_status_phase`）④ API Server 请求延迟（`apiserver_request_duration_seconds`）；Prometheus 抓取 + Grafana 展示 + AlertManager 告警。

**关键参数**：
- CPU / 内存使用率
- 网络流量
- Pod 状态
- API Server 延迟
- Prometheus + Grafana

**最佳实践**：K8s 监控用 4 黄金指标 + Prometheus Operator；**比裸跑 heapster 完善 10x**；适用任何"K8s 集群监控"。

### 模式 18 · 集群扩容 3 步法

**问题场景**：业务增长 K8s 集群扛不住，要扩容；加 Node / 加 Master / 拆集群怎么选？

**解决方案**：3 步法：① 加 Node（`kubectl edit node` 加 label / `cluster-autoscaler` 自动扩）② 加 Master（`kubeadm join` 加 control plane 节点到 3/5/7）③ 拆集群（按业务域 / 区域 / 安全等级拆多集群，`kubefed` / `cluster-api` 联邦管理）。

**关键参数**：
- 加 Node（最多 5000）
- 加 Master（3/5/7 奇数）
- 拆集群（按域/区/等级）
- cluster-autoscaler 自动
- kubefed 联邦

**最佳实践**：K8s 集群扩容分"加 Node → 加 Master → 拆集群"3 步；**每步有对应工具**；适用任何"K8s 规模演进"。

### 模式 19 · 与 Docker Swarm / Mesos 对比

**问题场景**：选型在 K8s / Docker Swarm / Apache Mesos 之间。

**解决方案**：K8s 112k+ Star + 5 万+ 贡献者 + 5k+ 公司生产 + 事实标准；Docker Swarm 简单易用（10 行 compose）但功能弱、生态薄；Apache Mesos 大数据场景（Spark / Marathon）但学习曲线陡；K8s 是新项目唯一选择，老 Swarm 项目保留兼容。

**关键参数**：
- K8s 112k star 事实标准
- Swarm 10 行 compose
- Mesos 大数据
- 5k+ 公司生产
- 学习曲线陡

**最佳实践**：容器编排选 K8s 是行业默认；**Swarm 仅适合小项目 / 学习**；**Mesos 仅适合大数据**；适用任何"容器编排选型"。

### 模式 20 · 7 天复刻 mini-k8s

**问题场景**：学习用，想搭一个简化版 K8s 理解核心。

**解决方案**：7 天分 5 步：① Day 1-2 etcd + API Server（CRUD + watch）② Day 3 Scheduler（filter + score + bind）③ Day 4 Kubelet + CRI 模拟（Docker API）④ Day 5 Controller 跑 reconcile + kubectl CLI 客户端。

**关键参数**：
- Day 1-2: etcd + API
- Day 3: scheduler
- Day 4: kubelet
- Day 5: controller
- 7 天最小可用

**最佳实践**：复刻 K8s 先求"最小可跑内核"再迭代，7 天只够做 80% 场景的简化版，**真实生产 K8s 数十人团队维护 10 年+**；适用任何"K8s 学习 + 内部简化"。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\kubernetes\`
- **大小**: ~500 MB（含 vendor）
- **总文件**: 36,392 个
- **主语言**: Go（350+ 万行）
- **关键 commit**: v1.30.x
- **作者**: Google + 5 万+ 贡献者 + CNCF 治理
- **许可**: Apache 2.0
- **被采用**: 5,000+ 公司生产

## 一句话总结

kubernetes 用 Go 把"声明式 API + controller reconcile + 调度插件链 + 36k 文件"做到极致，120k+ Star 是容器编排事实标准，学它就是学云原生时代的基础设施范式。
