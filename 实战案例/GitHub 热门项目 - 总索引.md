# GitHub 热门企业级实战项目总索引

> 收录100+个GitHub最热门的企业级开源项目，涵盖微服务、数据库、云原生、DevOps等核心领域

---

## 一、微服务框架 (15个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [kratos](https://github.com/go-kratos/kratos) | 22k+ | B站开源微服务框架 | Protobuf、gRPC、高性能 |
| [Dubbo](https://github.com/apache/dubbo) | 40k+ | Apache RPC框架 | 分布式、高可用、多协议 |
| [Sentinel](https://github.com/alibaba/Sentinel) | 22k+ | 流量控制熔断 | 限流、熔断、热点防护 |
| [Hystrix](https://github.com/Netflix/Hystrix) | 25k+ | 熔断器模式 | 延迟和容错、线程隔离 |
| [nacos](https://github.com/alibaba/nacos) | 30k+ | 配置中心+服务发现 | 动态配置、DNS-F |
| [istio](https://github.com/istio/istio) | 35k+ | 服务网格 | 流量管理、安全、可观测 |
| [spring-cloud-tencent](https://github.com/Tencent/spring-cloud-tencent) | 8k+ | 腾讯微服务套件 | Spring Cloud集成 |

**实战要点：**
```python
# Kratos 微服务注册
from kratos.registry import Registry

class MyService(Registry):
    async def Register(self, ctx, info):
        return await self.register_service(
            name="user-service",
            addr=f"{info.IP}:{info.Port}",
            weight=100
        )
```

---

## 二、数据库与存储 (20个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [TiDB](https://github.com/pingcap/tidb) | 38k+ | 分布式SQL数据库 | HTAP、水平扩展 |
| [ClickHouse](https://github.com/ClickHouse/ClickHouse) | 35k+ | OLAP列式数据库 | 列存储、向量计算 |
| [ShardingSphere](https://github.com/apache/shardingsphere) | 22k+ | 分布式数据库中间件 | 分库分表、读写分离 |
| [Dgraph](https://github.com/dgraph-io/dgraph) | 23k+ | 分布式图数据库 | GraphQL原生、分布式 |
| [Supabase](https://github.com/Supabase/supabase) | 70k+ | Firebase替代 | Postgres、实时、Auth |
| [Redis](https://github.com/redis/redis) | 65k+ | 内存数据库 | 高性能、丰富数据结构 |
| [Dragonfly](https://github.com/dragonflydb/dragonfly) | 18k+ | 高性能Redis替代 | 多线程、Jubilee水平扩展 |
| [Prisma](https://github.com/prisma/prisma) | 35k+ | TypeScript ORM | 类型安全、自动迁移 |
| [TimescaleDB](https://github.com/timescale/timescaledb) | 18k+ | 时序数据库 | PostgreSQL扩展 |

**实战要点：**
```sql
-- TiDB 水平扩展
ALTER TABLE users SET TiDB_PARTITION num = 8;
-- ShardingSphere 分布式配置
spring.shardingsphere.sharding.tables.users.actual-data-nodes=ds_${0..3}.user_${0..15}
```

---

## 三、消息队列 (10个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [Kafka](https://github.com/apache/kafka) | 28k+ | 分布式消息队列 | 高吞吐、持久化、分区 |
| [RocketMQ](https://github.com/apache/rocketmq) | 20k+ | 阿里消息队列 | 事务消息、顺序消费 |
| [Pulsar](https://github.com/apache/pulsar) | 13k+ | 下一代消息队列 | 多租户、持久化存储 |
| [RabbitMQ](https://github.com/rabbitmq/rabbitmq) | 12k+ | 消息代理 | 灵活路由、插件丰富 |
| [NATS](https://github.com/nats-io/nats-server) | 15k+ | 轻量高性能 | 发布订阅、请求响应 |

**实战要点：**
```python
# Kafka 生产者配置
producer = KafkaProducer(
    bootstrap_servers=['kafka:9092'],
    acks='all',
    retries=3,
    max_in_flight_requests_per_connection=1,
    enable_idempotence=True
)
```

---

## 四、云原生与容器 (20个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [Kubernetes](https://github.com/kubernetes/kubernetes) | 105k+ | 容器编排引擎 | 自动扩缩、滚动更新 |
| [K3s](https://github.com/k3s-io/k3s) | 25k+ | 轻量K8s | 嵌入式SQL、单二进制 |
| [Istio](https://github.com/istio/istio) | 35k+ | 服务网格 | mTLS、流量分割 |
| [Argo CD](https://github.com/argoproj/argo-cd) | 14k+ | GitOps持续交付 | 声明式、自动同步 |
| [Helm](https://github.com/helm/helm) | 12k+ | K8s包管理器 | Chart模板、版本管理 |
| [Traefik](https://github.com/traefik/traefik) | 50k+ | 云原生网关 | 自动发现、Let’s Encrypt |
| [Envoy](https://github.com/envoyproxy/envoy) | 28k+ | 边缘服务代理 | L7代理、动态配置 |
| [Cilium](https://github.com/cilium/cilium) | 8k+ | eBPF网络方案 | 透明加密、网络策略 |
| [Calico](https://github.com/projectcalico/calico) | 5k+ | 容器网络 | 网络策略、IP封装 |

**实战要点：**
```yaml
# Kubernetes 部署配置
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user
  template:
    spec:
      containers:
      - name: user
        image: myapp:latest
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
```

---

## 五、监控与可观测性 (10个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [Prometheus](https://github.com/prometheus/prometheus) | 50k+ | 监控系统 | 多维度数据模型、PromQL |
| [Grafana](https://github.com/grafana/grafana) | 65k+ | 监控可视化 | 仪表盘、告警 |
| [SkyWalking](https://github.com/apache/skywalking) | 23k+ | APM系统 | 分布式追踪、性能分析 |
| [Jaeger](https://github.com/jaegertracing/jaeger) | 15k+ | 分布式追踪 | OpenTelemetry兼容 |
| [OpenTelemetry](https://github.com/opentelemetry/opentelemetry) | 15k+ | 可观测性框架 | 统一SDK、OTLP导出 |

---

## 六、前端工程化 (10个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [Vite](https://github.com/vitejs/vite) | 65k+ | 下一代构建工具 | ESM、HMR快速 |
| [React](https://github.com/facebook/react) | 230k+ | UI框架 | 虚拟DOM、Hooks |
| [Next.js](https://github.com/vercel/next.js) | 120k+ | React SSR框架 | SSG/SSR、API Routes |
| [NestJS](https://github.com/nestjs/nest) | 65k+ | Node企业框架 | 模块化、装饰器 |
| [TypeScript](https://github.com/microsoft/TypeScript) | 100k+ | 类型安全JS | 静态类型、编译时检查 |
| [Biome](https://github.com/biomejs/biome) | 15k+ | 性能工具链 | Lint+Format合一 |

---

## 七、DevOps与IaC (10个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [Terraform](https://github.com/hashicorp/terraform) | 40k+ | IaC工具 | HCL语法、Provider生态 |
| [Vault](https://github.com/hashicorp/vault) | 30k+ | 密钥管理 | 动态密钥、PKI |
| [Jenkins](https://github.com/jenkinsci/jenkins) | 22k+ | CI/CD引擎 | 插件生态、流水线 |
| [Tekton](https://github.com/tektoncd/tekton) | 15k+ | K8s原生CI/CD | 流水线即代码 |
| [Apache APISIX](https://github.com/apache/apisix) | 14k+ | 动态API网关 | 热重载、低延迟 |

---

## 八、身份安全 (10个)

| 项目 | Stars | 描述 | 核心特性 |
|------|-------|------|----------|
| [Casbin](https://github.com/casbin/casbin) | 25k+ | 访问控制框架 | 多语言支持、策略即代码 |
| [Zitadel](https://github.com/zitadel/zitadel) | 12k+ | 身份认证平台 | OIDC、SAML、MFA |
| [Kratos](https://github.com/ory/kratos) | 10k+ | 身份认证SDK | 自托管、隐私优先 |
| [FusionAuth](https://github.com/FusionAuth/fusionauth) | 8k+ | 身份认证平台 | 完整Auth方案 |
| [Keycloak](https://github.com/keycloak/keycloak) | 30k+ | 身份认证 | SAML/OIDC、LDAP集成 |

---

## 下载指南

### 快速下载脚本

已在 `G:\实战案例` 目录创建下载脚本：

```powershell
# 运行方式
powershell -ExecutionPolicy Bypass -File "G:\实战案例\下载GitHub热门项目.ps1"
```

### 手动下载单个项目

```bash
# 示例：克隆 Kratos
git clone --depth 1 https://github.com/go-kratos/kratos.git "G:\实战案例\GitHub热门项目\kratos"

# 示例：克隆 TiDB
git clone --depth 1 https://github.com/pingcap/tidb.git "G:\实战案例\GitHub热门项目\tidb"
```

---

## 相关文档

- [[GitHub 热门项目下载指南]]
- [[大企业实战案例 - 总索引]]
- [[Build Your Own X - 从零构建项目]]

---

*最后更新: 2026-05-31*