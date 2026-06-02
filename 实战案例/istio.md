# Istio · ABL 风格深度解析

> 主题：CNCF 顶级服务网格，给 K8s 加流量管理 + mTLS + 可观测。控制面（istiod/istio-agent）+ 数据面（Envoy sidecar）+ xDS 协议三层架构。本文聚焦 20 个可复用模式（核心原理 / 架构设计 / 性能优化 / 可靠性与生态）。

---

## 一、核心原理

### 模式 1：控制面 + 数据面分离的 Sidecar 模式

**问题场景**：业务应用要做流量管理（灰度/熔断/限流）、零信任（mTLS）、可观测（tracing/metrics/logs）。把这些能力做进业务进程 → 升级 5 个语言 SDK，且无法跨语言统一。Istio 解法是"控制面 + 数据面"分离 + sidecar 注入，**业务进程无侵入**。

**解决方案架构**（部署图）：
```
┌─────────────────── Pod ────────────────────┐
│ ┌────────────────┐  ┌──────────────────┐   │
│ │ App Container  │  │ Envoy Sidecar    │   │
│ │ (业务代码)      │  │ (数据面)          │   │
│ │                │──│ L7 路由 + mTLS   │   │
│ │                │  │                  │   │
│ └────────────────┘  └──────────────────┘   │
│            localhost:15001 (outbound)        │
│            localhost:15006 (inbound)         │
└─────────────────────────────────────────────┘
                  ↕ xDS gRPC
        ┌──────────────────────────┐
        │ istiod (控制面)           │
        │ Pilot + CA + Galley     │
        │ 提供 xDS + 证书          │
        └──────────────────────────┘
```

**关键参数表**：

| 参数 | 取值 | 含义 |
| :--- | :--- | :--- |
| 数据面 | Envoy sidecar | 业务同 Pod 的代理 |
| 控制面 | istiod | 集中配置 + CA |
| 通信协议 | xDS (LDS/RDS/CDS/EDS) | gRPC push |
| 注入方式 | mutating webhook | K8s 自动注入 |
| `outboundPort` | 15001 | 出站流量拦截 |
| `inboundPort` | 15006 | 入站流量拦截 |

**最佳实践**：
- ✅ 数据面用 Envoy，**L7 能力全部下沉到 sidecar**
- ✅ 控制面集中管控，**业务 Pod 无侵入**
- ✅ 流量拦截通过 iptables (initContainer 注入)，**透明代理**
- ✅ xDS gRPC push，**配置变更秒级生效**
- ✅ 业务无语言绑定，**Go/Java/Python/Node 统一治理**

---

### 模式 2：xDS 协议 + LDS/RDS/CDS/EDS 四件套

**问题场景**：Envoy 怎么知道"路由规则 + 集群列表 + 端点列表"？Istio 实现了完整 xDS 实现，**配置变更推送到所有 sidecar**。

**解决方案代码**（istio-agent 启动时 xDS 客户端订阅）：
```go
// istio-agent 简化伪代码
func (a *Agent) startXDSServer() error {
    // 创建 LDS/RDS/CDS/EDS 订阅
    a.xdsClient = xds.NewClient(a.configPath, a.secretPath)
    
    // 各类型订阅
    a.xdsClient.WatchListener(ldsHandler)   // 监听器
    a.xdsClient.WatchRouteConfig(rdsHandler) // 路由
    a.xdsClient.WatchCluster(cdsHandler)    // 集群
    a.xdsClient.WatchEndpoints(edsHandler)  // 端点
    
    return a.xdsClient.Start()
}
```

**关键参数表**：

| 类型 | 含义 | 频率 |
| :--- | :--- | :--- |
| LDS | Listener Discovery Service | 监听器（入/出站端口） |
| RDS | Route Discovery Service | 路由规则（VirtualService） |
| CDS | Cluster Discovery Service | 上游集群（DestinationRule） |
| EDS | Endpoint Discovery Service | 端点 IP:Port 列表 |
| SDS | Secret Discovery Service | TLS 证书（mTLS） |
| ADS | Aggregated Discovery Service | 聚合推送（避免乱序） |

**最佳实践**：
- ✅ xDS 用 gRPC streaming，**变更推送而非轮询**
- ✅ ADS 聚合推送，**避免 LDS/RDS/CDS/EDS 乱序导致连接重置**
- ✅ 增量更新（incremental xDS），**减少网络流量**
- ✅ 资源版本号（system version）去重
- ✅ v1.13+ 默认 ADS

---

### 模式 3：istiod 集成 Pilot + CA + Galley

**问题场景**：早期版本（v1.0-）istio 有 5 个组件（pilot、citadel、galley、sidecar-injector、telemetry），运维复杂。v1.5+ 把多个组件合并为 istiod，**单二进制 5 合 1**。

**解决方案代码**（istiod 启动伪代码）：
```go
func main() {
    server := bootstrap.NewServer()
    
    // 1. Pilot：xDS 服务
    server.AddComponent(pilot.NewServer(config))
    
    // 2. Citadel（CA）：证书签发
    server.AddComponent(citadel.NewCA(rootCaPath))
    
    // 3. Galley：配置验证 + 分发
    server.AddComponent(galley.NewValidator())
    
    // 4. Sidecar Injector：自动注入 webhook
    server.AddComponent(injector.NewWebhook())
    
    // 5. Telemetry v2：指标生成
    server.AddComponent(telemetry.New())
    
    server.Run()
}
```

**关键参数表**：

| 组件 | 功能 | 集成到 istiod |
| :--- | :--- | :--- |
| Pilot | xDS 配置生成 | ✓ |
| Citadel / CA | 证书签发 | ✓ |
| Galley | CRD 验证 + 分发 | ✓ |
| Sidecar Injector | mutating webhook | ✓ |
| Telemetry v2 | metrics/traces 桥接 | ✓ |
| 5 → 1 | 单二进制 istiod | v1.5+ |

**最佳实践**：
- ✅ 单二进制 istiod 降低运维复杂度
- ✅ 减少 5 个 Pod → 1 个 Pod
- ✅ 配置统一：CRD → Galley 验证 → Pilot 转 xDS
- ✅ CA 集中签发 SPIFFE 身份证书
- ✅ 任何"多组件合并单二进制"演进可借鉴

---

### 模式 4：mTLS 自动 + SPIFFE 身份

**问题场景**：服务间通信要加密 + 身份认证，证书分发 + 轮换复杂。Istio 自动 mTLS + SPIFFE 身份编码到证书，**业务零感知**。

**解决方案代码**（生成 SPIFFE URI）：
```go
// SPIFFE 身份格式
spiffeID := fmt.Sprintf(
    "spiffe://%s/ns/%s/sa/%s",
    trustDomain,    // e.g. "cluster.local"
    namespace,      // e.g. "default"
    serviceAccount, // e.g. "my-app"
)
// spiffe://cluster.local/ns/default/sa/my-app
```

**解决方案配置**（PeerAuthentication 启用 mTLS）：
```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT  # 严格模式：所有流量必须 mTLS
```

**关键参数表**：

| 参数 | 取值 | 含义 |
| :--- | :--- | :--- |
| `trustDomain` | cluster.local | SPIFFE 信任域 |
| `SPIFFE URI` | spiffe://cluster.local/ns/x/sa/y | 服务身份 |
| `mode` | DISABLE/PERMISSIVE/STRICT | mTLS 模式 |
| `PERMISSIVE` | 兼容模式 | 同时接受明文 + TLS |
| `STRICT` | 严格模式 | 仅接受 mTLS |
| 证书轮换 | 自动 | 24h 一次，istiod 签发 |

**最佳实践**：
- ✅ SPIFFE URI 作为服务身份，**跨命名空间仍可识别**
- ✅ 默认 PERMISSIVE 模式，**逐步迁移到 STRICT**
- ✅ 证书 24h 轮换，**降低泄露风险**
- ✅ AuthorizationPolicy 配合，**RBAC 细粒度授权**
- ✅ 任何"零信任 + 自动证书"场景可套

---

### 模式 5：流量拦截 - iptables initContainer

**问题场景**：业务 Pod 流量怎么"透明"地走 Envoy？Istio 用 initContainer 设置 iptables，**应用启动前已完成**。

**解决方案代码**（initContainer iptables 规则伪代码）：
```bash
# initContainer: istio-init
# 1. 把出站流量（除 Envoy 自己）重定向到 15001
iptables -t nat -A OUTPUT -p tcp -j ISTIO_OUTPUT
iptables -t nat -A ISTIO_OUTPUT -p tcp --dport 15090 -j RETURN
iptables -t nat -A ISTIO_OUTPUT -p tcp -m owner --uid-owner 1337 -j RETURN
iptables -t nat -A ISTIO_OUTPUT -p tcp -j REDIRECT --to-ports 15001

# 2. 把入站流量重定向到 15006
iptables -t nat -A PREROUTING -p tcp -j ISTIO_INBOUND
iptables -t nat -A ISTIO_INBOUND -p tcp --dport 15008 -j RETURN
iptables -t nat -A ISTIO_INBOUND -p tcp --dport 22 -j RETURN
iptables -t nat -A ISTIO_INBOUND -p tcp -j REDIRECT --to-ports 15006
```

**关键参数表**：

| 参数 | 取值 | 含义 |
| :--- | :--- | :--- |
| `ISTIO_OUTPUT` chain | 自定义链 | 出站流量策略 |
| `ISTIO_INBOUND` chain | 自定义链 | 入站流量策略 |
| `15001` | outbound port | Envoy 出站代理 |
| `15006` | inbound port | Envoy 入站代理 |
| `15090` | Envoy Prometheus | 排除自身 |
| `1337` | istio-proxy UID | 排除 Envoy 自身 |
| `15021/15020` | 健康检查 | 排除 K8s 探针 |

**最佳实践**：
- ✅ initContainer 在应用容器前跑，**iptables 规则就绪**
- ✅ 排除 Envoy 自身（`--uid-owner 1337`），**避免递归**
- ✅ 排除 15090/15021/15020，**sidecar 与平台探针不互相影响**
- ✅ v1.10+ 支持 eBPF 模式（无 sidecar，**性能更好**）
- ✅ 任何"流量透明代理"场景可借鉴

---

## 二、架构设计

### 模式 6：CRD + Kubernetes 原生 API 扩展

**问题场景**：服务网格需要"流量规则、目标规则、安全策略"等配置入口。Istio 用 K8s CRD 暴露 8+ 资源，**所有配置 GitOps 友好**。

**解决方案配置清单**：
```yaml
# 1. VirtualService: 流量路由
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: { name: reviews }
spec:
  hosts: [reviews]
  http:
  - match:
    - headers: { end-user: { exact: jason } }
    route:
    - destination: { host: reviews, subset: v2 }
    retries: { attempts: 3, perTryTimeout: 2s }

# 2. DestinationRule: 目标规则（subset + 熔断）
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata: { name: reviews }
spec:
  host: reviews
  subsets:
  - name: v1
    labels: { version: v1 }
  - name: v2
    labels: { version: v2 }
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100 }
      http: { h2UpgradePolicy: UPGRADE }
```

**关键参数表**：

| CRD 资源 | 功能 | 示例字段 |
| :--- | :--- | :--- |
| VirtualService | 流量路由 + 重试 + 故障注入 | `http[].route[].destination` |
| DestinationRule | subset + 熔断 + 负载均衡 | `trafficPolicy.connectionPool` |
| Gateway | 入口网关 | `servers[].port.number` |
| ServiceEntry | 外部服务注册 | `hosts[].resolution: DNS` |
| PeerAuthentication | mTLS 策略 | `mtls.mode: STRICT` |
| AuthorizationPolicy | RBAC 授权 | `rules[].from[].source.principals` |
| Sidecar | sidecar 资源限制 | `egress.hosts` |
| EnvoyFilter | Envoy 底层补丁 | `configPatches` |

**最佳实践**：
- ✅ 8+ CRD 全部用 K8s API 暴露，**GitOps 友好**
- ✅ VirtualService + DestinationRule 配套使用
- ✅ AuthorizationPolicy 支持 `principals` (SPIFFE) / `ipBlocks` / `namespaces` 多维度
- ✅ EnvoyFilter 兜底（用户自定义 Envoy 配置补丁）
- ✅ 任何"K8s 平台 + 高级策略"项目可借鉴

---

### 模式 7：VirtualService 流量切分（canary / blue-green）

**问题场景**：发布新版本要 5% → 25% → 50% → 100% 灰度。Istio 用 VirtualService 权重路由，**秒级生效**。

**解决方案配置**（90/10 切分）：
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: { name: my-app }
spec:
  hosts: [my-app]
  http:
  - route:
    - destination: { host: my-app, subset: v1 }
      weight: 90
    - destination: { host: my-app, subset: v2 }
      weight: 10
  - fault:
      delay: { percentage: { value: 0.1 }, fixedDelay: 5s }
    # 1% 概率注入 5s 延迟 → 验证 v2 韧性
```

**关键参数表**：

| 字段 | 含义 | 用途 |
| :--- | :--- | :--- |
| `weight` | 0-100 | 流量比例 |
| `subset` | subset 名 | DestinationRule 定义 |
| `match` | 匹配条件 | headers/uri/method |
| `fault.delay` | 故障注入 | 测试韧性 |
| `fault.abort` | 异常注入 | 模拟 500 |
| `retries` | 重试 | attempts + perTryTimeout |
| `timeout` | 超时 | 默认 15s |

**最佳实践**：
- ✅ 灰度发布 90/10 → 50/50 → 100/0，**逐步放量**
- ✅ `match.headers` 按用户 ID 灰度（内部测试）
- ✅ 配合 `fault.delay` 故障注入，**验证韧性**
- ✅ DestinationRule subset 标签选 Pod，**自动同步**
- ✅ 比 Nginx ingress 灰度灵活（按 header/cookie）

---

### 模式 8：DestinationRule + 熔断 + 负载均衡

**问题场景**：上游服务不可用时防止雪崩（circuit breaker），长连接复用（connection pool），多副本负载均衡策略。Istio 用 DestinationRule 集中管理。

**解决方案配置**：
```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata: { name: payment-service }
spec:
  host: payment-service
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100, connectTimeout: 30ms, tcpKeepalive: { time: 60s } }
      http: { h2UpgradePolicy: UPGRADE, maxRequestsPerConnection: 100 }
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_REQUEST
      # 或 RANDOM / ROUND_ROBIN / PASSTHROUGH
      localityLbSetting:
        enabled: true
        failoverPriority: ["topology.kubernetes.io/region"]
```

**关键参数表**：

| 字段 | 含义 | 默认值 |
| :--- | :--- | :--- |
| `maxConnections` | TCP 最大连接 | 1024 |
| `maxRequestsPerConnection` | 单连接最大请求 | ∞ |
| `consecutive5xxErrors` | 5xx 阈值 | 100 |
| `baseEjectionTime` | 驱逐时间 | 30s |
| `maxEjectionPercent` | 最多驱逐比例 | 10% |
| `LEAST_REQUEST` | 最少请求 | 默认 RANDOM |
| `localityLbSetting` | 区域优先 | 关闭 |

**最佳实践**：
- ✅ 熔断 + 重试在 mesh side，**业务无感知**
- ✅ `outlierDetection` 5xx 阈值 + 驱逐时间要合理
- ✅ `LEAST_REQUEST` 比 `ROUND_ROBIN` 更适合异构机器
- ✅ `localityLbSetting` 跨 AZ 时启用，**就近访问**
- ✅ 任何"服务间韧性"项目可借鉴

---

### 模式 9：Gateway + Ingress 边缘路由

**问题场景**：外部 HTTP 流量怎么进 mesh？Istio 用 Gateway 资源描述边缘监听器，**与 VirtualService 解耦**。

**解决方案配置**：
```yaml
# 1. Gateway: 边缘监听器
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata: { name: my-gateway }
spec:
  selector: { istio: ingressgateway }
  servers:
  - port: { number: 443, name: https, protocol: HTTPS }
    tls: { mode: SIMPLE, credentialName: my-cert }
    hosts: [api.example.com]

# 2. VirtualService: 关联 Gateway + 路由
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: { name: my-app }
spec:
  hosts: [api.example.com]
  gateways: [my-gateway]  # 关联 Gateway
  http:
  - match:
    - uri: { prefix: /v1/ }
    route:
    - destination: { host: my-app }
      weight: 100
```

**关键参数表**：

| 字段 | 含义 | 用途 |
| :--- | :--- | :--- |
| `selector` | Pod 选择器 | 关联 istio-ingressgateway Pod |
| `servers[].port` | 监听端口 | HTTP/HTTPS/TCP |
| `tls.mode` | SIMPLE/MUTUAL/PASSTHROUGH | TLS 模式 |
| `credentialName` | Secret 名 | TLS 证书 |
| `gateways` | 关联 Gateway | VirtualService 用 |
| `PASSTHROUGH` | 透传 | HTTPS 不解密 |

**最佳实践**：
- ✅ Gateway 与 VirtualService **职责分离**
- ✅ 一个 Gateway 可被多个 VirtualService 复用
- ✅ `mesh` 内置 Gateway 处理 mesh 内部流量
- ✅ `PASSTHROUGH` 用于 gRPC 等需要原始 TCP 的场景
- ✅ 任何"边缘 + 内部"双层路由项目可借鉴

---

### 模式 10：Sidecar 资源限制 + 性能隔离

**问题场景**：每个 Pod 都有 sidecar，**内存/CPU 开销大**。Istio 用 Sidecar CRD 让用户自定义 sidecar 资源，**控制资源范围**。

**解决方案配置**：
```yaml
apiVersion: networking.istio.io/v1beta1
kind: Sidecar
metadata: { name: default }
  namespace: prod
spec:
  egress:
  - hosts:
    - "./*"           # 命名空间内所有服务
    - "istio-system/*" # 控制面服务
  ingress:
  - port: { number: 9080, protocol: HTTP, name: http }
    defaultEndpoint: 127.0.0.1:9080
  outboundTrafficPolicy: { mode: REGISTRY_ONLY }
```

**关键参数表**：

| 字段 | 含义 | 用途 |
| :--- | :--- | :--- |
| `egress.hosts` | 出站白名单 | 限制 sidecar 可达服务 |
| `ingress.defaultEndpoint` | 入站目标 | Pod 内应用端口 |
| `outboundTrafficPolicy: REGISTRY_ONLY` | 严格模式 | 未声明服务不可访问 |
| `ALLOW_ANY` | 宽松模式 | 默认 |
| 资源限制 | K8s `resources.limits` | 控制 CPU/mem |

**最佳实践**：
- ✅ Sidecar CRD 限制 egress，**减少 xDS 推送量**
- ✅ 不用 services 全部可见，**缩窄 sidecar 内存**
- ✅ `REGISTRY_ONLY` 模式阻止意外出网
- ✅ 设置 sidecar `resources.limits`，**避免 OOM 影响节点**
- ✅ 任何"按需加载 + 资源限制"项目可借鉴

---

## 三、性能优化

### 模式 11：eBPF 加速（无 sidecar 模式）

**问题场景**：每个 Pod 一个 Envoy sidecar，**内存 50-100MB + 启动延迟 5s**。生产环境 sidecar 资源占比可观。Istio v1.10+ 引入 eBPF 模式（ambient mesh），**无 sidecar 但仍享 mTLS**。

**解决方案架构对比**：
```
传统 sidecar 模式：
Pod: [App] [Envoy] [Envoy]  ← 内存 × 2

Ambient mesh (eBPF)：
Node: [ztunnel]  ← 节点级共享
Pod:  [App]
```

**关键参数表**：

| 模式 | 资源 | 启动 | 兼容性 |
| :--- | :--- | :--- | :--- |
| Sidecar | 每 Pod 50-100MB | 5s | 全功能 |
| Ambient (ztunnel) | 每 Node 50MB | 节点级 | L4 |
| Ambient (waypoint) | 每 Service 100MB | 按需 | L7 |
| 性能 | 0 overhead（eBPF） | 0 启动延迟 | 新 |

**最佳实践**：
- ✅ eBPF 模式用 `kubectl label namespace istio.io/dataplane-mode=ambient`
- ✅ 节点级 ztunnel 共享，**内存节省 90%**
- ✅ L7 能力下沉到 waypoint proxy（按需部署）
- ✅ 启动延迟从 5s → 0（sidecar 没了）
- ✅ 任何"sidecar 资源开销大"场景可套 eBPF

---

### 模式 12：遥测数据采样 + 降低 Cardinality

**问题场景**：Envoy 报告 metrics，**每个请求都生成 metrics** → 内存/CPU 暴涨。Istio 用 Telemetry API + 采样率控制。

**解决方案配置**：
```yaml
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata: { name: mesh-default }
  namespace: istio-system
spec:
  sampling: 10.0  # 10% 采样
  metrics:
  - providers: [{ name: prometheus }]
    overrides:
    - match: { metric: REQUEST_COUNT }
      tagOverrides:
        response_code: { value: "MASKED" }  # 不上报状态码
```

**关键参数表**：

| 字段 | 含义 | 默认值 |
| :--- | :--- | :--- |
| `sampling` | trace 采样率 (%) | 1.0 |
| `metrics.providers` | 指标后端 | prometheus |
| `tagOverrides` | tag 覆盖 | 全部上报 |
| `MASKED` | 不上报 | 降低 cardinality |
| `accessLogging` | access log 配置 | enabled |

**最佳实践**：
- ✅ 高 QPS 服务采样率 1-10%，**降低 trace 后端成本**
- ✅ 屏蔽高基数 tag（userId / traceId），**降低 metrics 内存**
- ✅ 关键服务 100% 采样，**异常服务全量**
- ✅ 遥测数据按 Service 维度差异化配置
- ✅ 任何"可观测性成本控制"项目可借鉴

---

### 模式 13：连接池调优 - HTTP/2 + 连接复用

**问题场景**：HTTP/1.1 每次请求新建 TCP 连接，**延迟高**。Envoy 默认支持 HTTP/2，**长连接复用减少握手**。

**解决方案配置**：
```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata: { name: api-server }
spec:
  host: api-server
  trafficPolicy:
    connectionPool:
      http:
        h2UpgradePolicy: UPGRADE  # 升级到 H2
        maxRequestsPerConnection: 1000
        http1MaxPendingRequests: 100
        useClientProtocol: true
      tcp:
        maxConnections: 200
        connectTimeout: 50ms
        tcpKeepalive:
          time: 60s
          interval: 30s
```

**关键参数表**：

| 字段 | 含义 | 推荐值 |
| :--- | :--- | :--- |
| `h2UpgradePolicy: UPGRADE` | 升级到 H2 | 默认 |
| `maxRequestsPerConnection` | 单连接最大请求 | 1000 |
| `tcpKeepalive.time` | keepalive 时间 | 60s |
| `connectTimeout` | 连接超时 | 50ms |
| `useClientProtocol` | 用客户端协议 | true |

**最佳实践**：
- ✅ HTTP/2 升级减少握手，**延迟降 50%+**
- ✅ 1000 req/conn 平衡长连接复用 + 负载均衡
- ✅ TCP keepalive 60s + 30s 探测，**发现死连接**
- ✅ 任何"高并发连接"项目可套

---

### 模式 14：智能负载均衡 + localityLbSetting

**问题场景**：跨 AZ 调用延迟高（典型 5-20ms vs 同 AZ 0.5ms）。Envoy 支持按区域/zone/子网优先级，**就近访问**。

**解决方案配置**：
```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata: { name: db }
spec:
  host: db
  trafficPolicy:
    loadBalancer:
      simple: LEAST_REQUEST
      localityLbSetting:
        enabled: true
        failoverPriority:
        - "topology.kubernetes.io/region"
        - "topology.kubernetes.io/zone"
        - "kubernetes.io/hostname"
        failover:
        - from: region
          to: region
```

**关键参数表**：

| 字段 | 含义 | 用途 |
| :--- | :--- | :--- |
| `enabled` | 启用本地优先 | true |
| `failoverPriority` | 优先级列表 | region > zone > hostname |
| `failover.from/to` | 故障转移范围 | 区域级 fallback |
| `LEAST_REQUEST` | 最少请求优先 | 异构机器 |
| `PASSTHROUGH` | 透传到原始 | 跨集群 |

**最佳实践**：
- ✅ 跨 AZ 延迟敏感服务，**locality 优先**
- ✅ 同 region 全挂时跨 region fallback
- ✅ 配合 `LEAST_REQUEST`，**异构机器更均衡**
- ✅ 任何"多 AZ 部署 + 延迟优化"项目可借鉴

---

### 模式 15：访问日志格式自定义 + 异步刷盘

**问题场景**：Envoy 默认 access log 输出到 stdout，**格式固定且量大**。Istio 用 Telemetry API 自定义格式 + 异步输出。

**解决方案配置**：
```yaml
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata: { name: custom-log }
spec:
  accessLogging:
  - providers:
    - name: envoy
    filter:
      expression: "response.code >= 400"  # 只记录 4xx/5xx
    path: /dev/stdout
    format: |
      [%START_TIME%] "%REQ(:METHOD)% %REQ(PATH)% %PROTOCOL%"
      %RESPONSE_CODE% %RESPONSE_FLAGS% %BYTES_RECEIVED% %BYTES_SENT%
      %DURATION% %UPSTREAM_CLUSTER%
```

**关键参数表**：

| 字段 | 含义 | 示例 |
| :--- | :--- | :--- |
| `START_TIME` | 请求开始时间 | 2026-06-02T10:00:00Z |
| `REQ(:METHOD)` | HTTP 方法 | GET |
| `REQ(PATH)` | URL 路径 | /api/users |
| `RESPONSE_CODE` | 状态码 | 200 / 500 |
| `BYTES_RECEIVED/SENT` | 字节数 | 1024 |
| `DURATION` | 耗时 | 50ms |
| `UPSTREAM_CLUSTER` | 上游 | outbound|80|v1|reviews.default.svc.cluster.local |

**最佳实践**：
- ✅ 4xx/5xx 才记录，**降日志量 90%**
- ✅ 自定义格式含 traceId，**关联分布式追踪**
- ✅ 用 `%RESPONSE_FLAGS%` 识别熔断/重试事件
- ✅ 用 `%UPSTREAM_CLUSTER%` 定位目标 service
- ✅ 任何"高 QPS + 日志成本"项目可借鉴

---

## 四、可靠性与生态

### 模式 16：故障注入 + chaos engineering

**问题场景**：线上故障难复现，需要验证系统韧性。Istio 用 VirtualService `fault` 字段，**HTTP 层注入延迟 + 异常**。

**解决方案配置**：
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata: { name: reviews }
spec:
  hosts: [reviews]
  http:
  - fault:
      delay:
        percentage: { value: 50 }   # 50% 概率
        fixedDelay: 7s              # 注入 7s 延迟
      abort:
        percentage: { value: 5 }    # 5% 概率
        httpStatus: 503             # 503 错误
    route:
    - destination: { host: reviews }
```

**关键参数表**：

| 字段 | 含义 | 用途 |
| :--- | :--- | :--- |
| `fault.delay` | 注入延迟 | 测试超时/重试 |
| `fault.abort` | 注入异常 | 测试熔断/降级 |
| `percentage.value` | 概率 (0-100) | 流量比例 |
| `fixedDelay` | 固定延迟 | e.g. 5s |
| `exponentialDelay` | 指数延迟 | 模拟慢响应 |

**最佳实践**：
- ✅ 5% 异常 + 50% 延迟注入，**验证韧性**
- ✅ 注入范围按 namespace/subset 控制
- ✅ 生产禁用 chaos，**仅在预发环境**
- ✅ 配合 `retries.attempts: 3` 测试重试逻辑
- ✅ 任何"韧性测试"项目可套

---

### 模式 17：AuthorizationPolicy + RBAC

**问题场景**：默认 mesh 内所有服务互相可访问，**权限过大**。Istio 用 AuthorizationPolicy 细粒度授权，**默认 deny + 显式 allow**。

**解决方案配置**：
```yaml
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: allow-frontend-to-api
  namespace: prod
spec:
  selector:
    matchLabels:
      app: api-server
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/prod/sa/frontend"]
    to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/*"]
    when:
    - key: request.headers[x-api-key]
      values: ["valid-key"]
```

**关键参数表**：

| 字段 | 含义 | 用途 |
| :--- | :--- | :--- |
| `action: ALLOW` | 允许 | 默认 DENY |
| `action: DENY` | 拒绝 | 排除特定来源 |
| `principals` | SPIFFE 身份 | 服务身份 |
| `methods/paths` | HTTP 方法/路径 | URL 级 |
| `request.headers[x-key]` | 自定义 header | API key 校验 |
| `remoteIpBlocks` | IP 白名单 | 边缘防护 |

**最佳实践**：
- ✅ 默认 `DENY` + 显式 `ALLOW`，**白名单模式**
- ✅ 用 SPIFFE 身份而非 IP，**扩缩容不受影响**
- ✅ 配合 `methods/paths`，**URL 级权限**
- ✅ 自定义 header 校验，**应用层 API key**
- ✅ 任何"零信任 + 细粒度 RBAC"项目可借鉴

---

### 模式 18：可观测性 - Metrics/Traces/Logs 三件套

**问题场景**：mesh 内流量监控 + 调用链追踪 + 异常日志。Istio 默认集成 Prometheus + Jaeger + Fluentd。

**解决方案配置**：
```yaml
# 1. Prometheus 抓取（K8s ServiceMonitor）
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata: { name: istio-mesh }
spec:
  selector:
    matchLabels: { app: istiod }
  endpoints:
  - port: http-monitoring
    interval: 15s

# 2. Jaeger 追踪（envoy tracer 配置）
# istiod 启动参数
# --tracing.zipkin.address=jaeger-collector.observability:9411

# 3. Envoy 指标查询
# istio_requests_total{destination_service="api-server",response_code="200"}
# 99th percentile latency
# histogram_quantile(0.99, rate(istio_request_duration_milliseconds_bucket[5m]))
```

**关键参数表**：

| 维度 | 工具 | Istio 集成 |
| :--- | :--- | :--- |
| Metrics | Prometheus | 默认 15014 端口 |
| Traces | Jaeger / Zipkin | `--tracing.zipkin.address` |
| Logs | Fluentd / Loki | stdout JSON |
| Dashboards | Grafana | 官方 dashboard |
| Service Graph | Kiali | 拓扑可视化 |

**最佳实践**：
- ✅ 三件套默认开箱即用，**业务无感知**
- ✅ 关键指标：QPS / latency p99 / error rate
- ✅ Trace 关联：traceId 在 access log / metrics
- ✅ Kiali 可视化 mesh 拓扑，**看服务依赖**
- ✅ 任何"mesh 级可观测"项目可套

---

### 模式 19：多集群 mesh - east-west gateway

**问题场景**：多 K8s 集群要互通，mesh 要跨集群。Istio 用 east-west gateway 暴露控制面 + 数据面，**多 mesh 互联**。

**解决方案架构**：
```
Cluster A (primary)              Cluster B (remote)
  ┌──────────────┐                ┌──────────────┐
  │ istiod       │                │ istiod       │
  │ (primary)    │──east-west───→│ (remote)     │
  │              │   gateway      │              │
  │ [Pod][Envoy] │                │ [Pod][Envoy] │
  └──────────────┘                └──────────────┘
       ↕                                ↕
   east-west gateway                east-west gateway
       ↕                                ↕
  Cross-cluster Network (e.g. VPN)
```

**关键参数表**：

| 概念 | 含义 | 用途 |
| :--- | :--- | :--- |
| Primary cluster | 主集群 | 部署 primary istiod |
| Remote cluster | 远端集群 | 部署 remote istiod |
| East-west gateway | 东西网关 | 跨集群 mesh 流量 |
| Multi-primary | 双主模式 | 两个集群都主 |
| ServiceEntry | 远端服务 | 引入对端服务 |

**最佳实践**：
- ✅ Primary/Remote 模式简单，**单 istiod 多集群**
- ✅ Multi-primary 模式无单点，**每个集群都主**
- ✅ East-west gateway 暴露 15443 (TLS) + 15012 (mTLS)
- ✅ 任何"多 K8s 集群 + mesh 互通"项目可借鉴

---

### 模式 20：Canary 升级 + ControlPlaneRevision

**问题场景**：istiod 升级风险大，**全网 sidecar 同时切版本**。Istio 用 ControlPlaneRevision 灰度升级，**新旧版本共存**。

**解决方案架构**：
```
旧版（v1.20）: istiod-rev-1.20
  - 已注入 sidecar → 连旧 istiod

新版（v1.21）: istiod-rev-1.21
  - 新注入 sidecar → 连新 istiod

切换: kubectl label namespace istio.io/rev=1.21 --overwrite
```

**关键参数表**：

| 字段 | 含义 | 用途 |
| :--- | :--- | :--- |
| `Revision` | istiod 版本标签 | e.g. `1.20` / `1.21` |
| `istio.io/rev` | namespace 标签 | 选哪个 istiod |
| `istiod-{rev}` | service 名 | 命名空间隔离 |
| 灰度 | 逐 ns 切换 | 风险可控 |
| 回滚 | 改标签 | 30s 完成 |

**最佳实践**：
- ✅ 双 istiod 并存，**新旧 sidecar 不互相影响**
- ✅ namespace 粒度灰度，**逐步切流量**
- ✅ 1.20 → 1.21 切完一个 ns 观察 1h 再切下一个
- ✅ 出问题改回标签秒级回滚
- ✅ 任何"控制面高风险升级"项目可借鉴

---

## 总结速查

**一句话价值**：Istio = Envoy sidecar 数据面 + istiod 控制面 + xDS 协议 + mTLS 零信任 + 流量管理 CRD = CNCF 顶级服务网格。

**5 个核心架构模式**：
1. **控制面 + 数据面分离**：业务无侵入治理
2. **xDS 四件套**：LDS/RDS/CDS/EDS 推送配置
3. **istiod 5 合 1**：Pilot + CA + Galley + Injector + Telemetry 单二进制
4. **mTLS + SPIFFE 身份**：零信任自动证书
5. **iptables initContainer**：流量透明代理

**5 个性能优化模式**：
1. **eBPF ambient mesh**：无 sidecar 节省 90% 内存
2. **遥测数据采样 + MASKED tag**：降低可观测成本
3. **HTTP/2 升级 + 连接复用**：延迟降 50%+
4. **localityLbSetting 区域优先**：跨 AZ 延迟优化
5. **access log filter**：4xx/5xx 才记录

**5 个可靠性与生态模式**：
1. **故障注入 chaos engineering**：HTTP 层注入延迟/异常
2. **AuthorizationPolicy RBAC**：SPIFFE 身份 + URL 级权限
3. **Metrics/Traces/Logs 三件套**：Prometheus + Jaeger + Fluentd
4. **多集群 mesh + east-west gateway**：跨 K8s 集群互通
5. **ControlPlaneRevision 灰度升级**：双 istiod 并存

**5 段必读代码**（istio 1.21+）：
- `istio.io/istio/pilot/pkg/xds/`：xDS 协议实现
- `istio.io/istio/security/pkg/...`：mTLS + SPIFFE 身份
- `istio.io/istio/pkg/kube/inject/`：sidecar 自动注入
- `istio.io/istio/operator/`：istioctl 安装 + CRD
- `samples/manifests/`：8+ CRD 范例

**3 个避坑要点**：
1. **不要开 STRICT mTLS 在非 mesh 客户端**：会让外部请求失败，先用 PERMISSIVE 灰度
2. **不要把 sidecar 资源限制设太小**：低于 64MB Envoy 会 OOM
3. **不要忽视 locality 优先配置**：跨 AZ 流量延迟爆炸

**仓库元信息**：
- 路径：`G:\Obsidian Vault\实战案例\istio.md`
- 版本：v1.21+（2025 末）
- 主语言：Go（控制面）+ C++（Envoy 数据面）
- 核心组件：istiod + istio-agent + istioctl
- 依赖：Envoy 1.31+ + K8s 1.27+
- License：Apache-2.0
- Star：36k+
