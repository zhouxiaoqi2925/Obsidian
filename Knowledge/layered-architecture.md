---
title: 分层架构实践
date: 2026-05-31
tags: [分层架构, N-tier, 架构模式]
---

# 分层架构实践

## 什么是分层架构

分层架构（Layered / N-tier）将应用分为多个**职责分明的层级**，每层只与相邻层通信。这是最广泛使用的企业应用架构模式。

## 经典四层结构

```
┌─────────────────────────────┐
│     表现层 (Presentation)    │  ← 用户界面、API接口
├─────────────────────────────┤
│       业务层 (Business)      │  ← 核心业务逻辑
├─────────────────────────────┤
│      应用层 (Application)    │  ← 服务编排、事务
├─────────────────────────────┤
│       数据层 (Data)           │  ← 数据持久化、存储
└─────────────────────────────┘
```

### 各层职责

| 层级 | 职责 | 包含内容 |
|------|------|----------|
| **表现层** | 用户交互 | UI组件、API接口、视图渲染 |
| **业务层** | 核心逻辑 | 业务规则、计算逻辑、验证 |
| **应用层** | 流程编排 | 工作流、事务管理、服务协调 |
| **数据层** | 数据存储 | 数据库、缓存、文件系统 |

## 分层原则

### 1. 依赖规则

```
表现层 → 业务层 → 应用层 → 数据层
   ↑         ↑         ↑         ↑
   │         │         │         │
   └─────────┴─────────┴─────────┘
        仅能访问相邻的下一层
```

### 2. 职责分离

每层只关注自己的职责：
- **表现层**：不包含业务逻辑
- **业务层**：不关心数据如何存储
- **数据层**：不关心业务规则

### 3. 数据封装

层间通过**接口/契约**通信，不直接访问其他层的数据结构。

## 实践示例：电商系统

### 表现层 (Presentation)

```typescript
// API 控制器
class OrderController {
    constructor(private orderService: OrderService) {}

    // GET /orders
    async getOrders(req: Request, res: Response) {
        const orders = await this.orderService.getOrdersByUser(req.userId);
        res.json(orders);
    }

    // POST /orders
    async createOrder(req: Request, res: Response) {
        const order = await this.orderService.createOrder(req.body);
        res.status(201).json(order);
    }
}
```

### 业务层 (Business)

```typescript
// 业务逻辑
class OrderService {
    async createOrder(orderDto: CreateOrderDto): Promise<Order> {
        // 业务规则验证
        if (!this.validateOrderItems(orderDto.items)) {
            throw new ValidationError('Invalid order items');
        }

        // 计算总价
        const totalPrice = this.calculateTotalPrice(orderDto.items);

        // 创建订单
        return this.orderRepository.create({
            ...orderDto,
            totalPrice,
            status: 'pending'
        });
    }

    private calculateTotalPrice(items: OrderItem[]): number {
        return items.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);
    }

    private validateOrderItems(items: OrderItem[]): boolean {
        return items.length > 0 && items.every(item => item.quantity > 0);
    }
}
```

### 数据层 (Data)

```typescript
// 仓储模式
interface OrderRepository {
    create(order: Order): Promise<Order>;
    findById(id: string): Promise<Order | null>;
    findByUserId(userId: string): Promise<Order[]>;
}

class SQLOrderRepository implements OrderRepository {
    constructor(private db: Database) {}

    async create(order: Order): Promise<Order> {
        const sql = 'INSERT INTO orders (...) VALUES (...)';
        return this.db.execute(sql, order);
    }
}
```

## 分层的好处

### 开发效率
- ✅ 分工明确，各层可并行开发
- ✅ 新人容易上手（只需理解一层）
- ✅ 代码结构清晰

### 测试性
- ✅ 每层可独立测试
- ✅ 可以 mock 上下层依赖
- ✅ 便于单元测试和集成测试

### 可维护性
- ✅ 修改一层不影响其他层
- ✅ 便于定位问题
- ✅ 技术升级可针对单层

### 可扩展性
- ✅ 可以替换某一层的实现（如换数据库）
- ✅ 便于添加新功能

## 分层的挑战

### 常见问题

| 问题 | 描述 | 解决方案 |
|------|------|----------|
| **分层过深** | 层数过多，性能开销 | 合并相邻职责相似的层 |
| **贫血模型** | 业务层只是过程调用 | 引入领域模型 |
| **领域逻辑泄漏** | 业务逻辑分散在各层 | 引入领域驱动设计(DDD) |
| **循环依赖** | 层间相互依赖 | 重构依赖方向 |

### 反模式

```typescript
// ❌ 反模式：在表现层写业务逻辑
class OrderController {
    async createOrder(req, res) {
        // 不应该在控制器里计算
        const total = req.body.items.reduce((sum, item) => {
            return sum + item.price * item.quantity;
        }, 0);
        // 保存到数据库...
    }
}

// ❌ 反模式：在数据层写业务逻辑
class OrderMapper {
    toEntity(row) {
        // 不应该在这里转换业务对象
        if (row.status === 'pending') {
            return new PendingOrder();  // 业务逻辑泄漏
        }
    }
}
```

## 分层 vs 其他架构

| 对比项 | 分层架构 | 微服务 | 事件驱动 |
|--------|----------|--------|----------|
| 复杂度 | 中 | 高 | 中高 |
| 扩展方式 | 垂直扩展 | 水平扩展 | 组件扩展 |
| 团队要求 | 中 | 高 | 中 |
| 适用场景 | 企业应用 | 大型系统 | 高交互系统 |
| 部署 | 单体/整体 | 独立服务 | 事件处理链 |

## 选择分层架构的场景

推荐使用分层架构：
- 🏢 企业后台系统
- 🛒 电商平台
- 📊 管理信息系统
- 📱 移动应用后端

谨慎使用分层架构：
- 🚀 需要极致性能的系统
- 🔄 需要快速横向扩展
- 🧩 微服务更合适的场景

## 相关文档

- [[架构模式对比]] - 5种架构模式对比
- [[SOLID设计原则]] - 设计原则
- [[软件架构导论]] - 基础概念