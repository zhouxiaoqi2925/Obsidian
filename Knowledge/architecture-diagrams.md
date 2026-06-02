---
title: 架构图模板库
tags: [架构图, Mermaid, 模板]
date: 2026-06-01
---

# 架构图模板库

> 复制即用，覆盖 90% 技术架构图

## 1. 微服务架构

```mermaid
graph TB
    User([用户])
    LB[负载均衡]
    GW[API Gateway]
    
    subgraph Services
        S1[用户服务]
        S2[订单服务]
        S3[商品服务]
        S4[支付服务]
    end
    
    DB1[(用户库)]
    DB2[(订单库)]
    DB3[(商品库)]
    DB4[(支付库)]
    
    MQ{{Kafka}}
    
    User --> LB --> GW
    GW --> S1 & S2 & S3 & S4
    S1 --> DB1
    S2 --> DB2
    S3 --> DB3
    S4 --> DB4
    S2 --> MQ
    MQ --> S4
```

## 2. 分层架构 (N-tier)

```mermaid
graph LR
    UI[表现层<br/>React/Vue]
    BL[业务层<br/>Service]
    AL[应用层<br/>Use Case]
    DL[数据层<br/>Repository]
    DB[(数据库)]
    
    UI --> BL
    BL --> AL
    AL --> DL
    DL --> DB
```

## 3. 事件驱动

```mermaid
graph LR
    P[生产者] -->|发布事件| EB{{事件总线}}
    EB -->|订阅| C1[消费者1]
    EB -->|订阅| C2[消费者2]
    EB -->|订阅| C3[消费者3]
```

## 4. CI/CD 流水线

```mermaid
graph LR
    Dev[开发] -->|git push| Repo[(代码仓库)]
    Repo --> CI[CI 构建]
    CI --> Test[自动化测试]
    Test --> Image[镜像构建]
    Image --> Reg[(镜像仓库)]
    Reg --> CD[CD 部署]
    CD --> Prod[生产环境]
```

## 5. K8s 部署架构

```mermaid
graph TB
    subgraph K8s Cluster
        subgraph Pod1
            C1[Container 1]
        end
        subgraph Pod2
            C2[Container 2]
        end
        subgraph Pod3
            C3[Container 3]
        end
        SVC[Service]
        ING[Ingress]
    end
    
    ING --> SVC
    SVC --> C1 & C2 & C3
```

## 6. 分布式追踪

```mermaid
sequenceDiagram
    participant U as 用户
    participant GW as API Gateway
    participant A as 服务A
    participant B as 服务B
    participant T as Trace 系统
    
    U->>GW: 请求
    GW->>T: 开始 Span
    GW->>A: 调用
    A->>T: 子 Span
    A->>B: 调用
    B->>T: 子 Span
    B-->>A: 响应
    A-->>GW: 响应
    GW-->>U: 响应
```

## 7. 数据库分库分表

```mermaid
graph TB
    App[应用层]
    
    subgraph Shard0
        T0[user_0]
    end
    subgraph Shard1
        T1[user_1]
    end
    subgraph Shard2
        T2[user_2]
    end
    
    App -->|uid%3=0| T0
    App -->|uid%3=1| T1
    App -->|uid%3=2| T2
```

## 8. 缓存架构

```mermaid
graph LR
    A[应用] -->|1. 查缓存| C[(Redis)]
    C -->|miss| DB[(MySQL)]
    DB -->|2. 写回| C
    C -->|3. 返回| A
```

## 9. 消息队列解耦

```mermaid
graph LR
    P[订单服务] -->|发送消息| Q{{RabbitMQ}}
    Q --> S1[库存服务]
    Q --> S2[支付服务]
    Q --> S3[物流服务]
```

## 10. 微服务调用链

```mermaid
graph TB
    A[订单服务] -->|HTTP| B[支付服务]
    A -->|gRPC| C[库存服务]
    A -->|HTTP| D[用户服务]
    C -->|事件| E{{消息队列}}
    E --> F[数据分析]
```

## 使用方式

1. 复制任意代码块到 Obsidian
2. 用 \`\`\`mermaid 包裹
3. 实时渲染图表
4. 修改节点/边即可定制

## 相关链接

- [[Knowledge/architecture-patterns|架构模式对比]]
- [[Knowledge/architecture-tools|架构建模工具]]
- [[Knowledge/excalidraw-mermaid-guide|Excalidraw + Mermaid 指南]]
