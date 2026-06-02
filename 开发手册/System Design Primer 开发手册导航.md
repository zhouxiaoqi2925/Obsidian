---
created: '2026-05-31'
source: github.com/donnemartin/system-design-primer
tags:
  - system-design
  - 系统设计
title: System Design Primer 开发手册导航
---
# System Design Primer 知识库

**来源**：https://github.com/donnemartin/system-design-primer
**整理时间**：2026-05-31
**数量**：20份核心知识

---

## 目录

| # | 知识主题 |
|---|----------|
| 1 | [[SDP - 系统设计基础概念]] |
| 2 | [[SDP - 性能可扩展性]] |
| 3 | [[SDP - 延迟与吞吐量]] |
| 4 | [[SDP - 可用性模式]] |
| 5 | [[SDP - 一致性模式]] |

---

## 一、系统设计基础 (20份)

### 第一章：理论基础

1. **系统设计基础概念**
   - 什么是系统设计
   - 设计目标：扩展性、可用性、可靠性
   - 客户端-服务器模型

2. **性能与可扩展性**
   - 吞吐量 vs 延迟
   - 水平扩展 vs 垂直扩展
   - 负载均衡策略

3. **CAP定理**
   - 一致性(Consistency)
   - 可用性(Availability)
   - 分区容错(Partition Tolerance)
   - 实际应用选择

4. **ACID vs BASE**
   - ACID 特性
   - BASE 特性
   - 何时使用哪种

### 第二章：性能指标

5. **延迟与吞吐量**
   - 延迟定义与优化
   - 吞吐量定义与优化
   - P50/P95/P99 延迟

6. **SLA/SLO/SLI**
   - SLA 定义
   - SLO 设置
   - SLI 监控

7. **高可用设计**
   - 单点故障消除
   - 冗余设计
   - 故障转移策略

8. **负载均衡**
   - L4/L7 负载均衡
   - 轮询/最少连接/IP哈希
   - 健康检查策略

### 第三章：数据库

9. **SQL vs NoSQL**
   - SQL 特性与适用场景
   - NoSQL 类型：KV/文档/列/图
   - 选型决策树

10. **数据库复制**
    - 主从复制
    - 主主复制
    - 复制延迟处理

11. **数据库分片**
    - 水平分片策略
    - 垂直分片策略
    - 分片键选择

12. **索引优化**
    - B-Tree 索引
    - 哈希索引
    - 复合索引设计

13. **事务管理**
    - 事务隔离级别
    - 分布式事务
    - 两阶段提交

### 第四章：缓存

14. **缓存策略**
    - Cache Aside
    - Read Through
    - Write Through/Write Behind

15. **缓存类型**
    - 内存缓存
    - 分布式缓存
    - CDN 边缘缓存

16. **缓存失效**
    - LRU/LFU/FIFO
    - TTL 设置
    - 缓存穿透/击穿/雪崩

### 第五章：消息队列

17. **消息队列基础**
    - 发布/订阅模型
    - 消息持久化
    - 顺序保证

18. **Kafka 架构**
    - 分区与副本
    - 偏移量管理
    - 性能优化

19. **RabbitMQ 架构**
    - Exchange 类型
    - 队列与绑定
    - 死信队列

20. **队列选择指南**
    - Kafka vs RabbitMQ
    - 使用场景对比
    - 性能特性对比

---

## 二、案例分析 (将后续整理)

- 设计 Twitter
- 设计 Facebook News Feed
- 设计 URL Shortener
- 设计 Chat System
- 设计 Rate Limiter

---

**标签**：#system-design #system-design-primer #系统设计
**状态**：20/20 份
**待续**：案例分析 10份
