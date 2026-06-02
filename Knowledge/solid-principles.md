---
title: SOLID设计原则
date: 2026-05-31
tags: [设计原则, SOLID, 面向对象]
---

# SOLID 设计原则

## 概述

SOLID 是面向对象设计（OOD）的 5 大原则，由软件工程师 Robert C. Martin 提出。遵循这些原则可以让代码保持**可扩展、可迭代、可维护、无bug**。

## SOLID 速记表

| 字母 | 原则 | 一句话说明 |
|------|------|-----------|
| **S** | 单一职责原则 | 一个类只做一件事 |
| **O** | 开闭原则 | 对扩展开放，对修改关闭 |
| **L** | 里氏替换原则 | 子类可以替换父类 |
| **I** | 接口隔离原则 | 接口要小而专 |
| **D** | 依赖反转原则 | 依赖抽象而非具体 |

---

## S - 单一职责原则 (Single-Responsibility Principle)

### 核心思想

> 一个类应该只有一个改变的原因。

### 案例

```python
# ❌ 违反：类同时负责用户数据和文件保存
class User:
    def get_name(self): ...
    def save_to_file(self): ...  # 职责过多

# ✅ 遵守：职责分离
class User:
    def get_name(self): ...

class UserRepository:
    def save(self, user): ...
    def load(self, user_id): ...
```

### 好处
- 易于理解
- 易于测试
- 降低耦合
- 便于维护

---

## O - 开闭原则 (Open-Closed Principle)

### 核心思想

> 软件实体应该对扩展开放，对修改关闭。

### 案例

```python
# ❌ 违反：添加新形状需修改计算器
class AreaCalculator:
    def calculate(self, shape):
        if shape.type == "circle":
            return 3.14 * shape.radius ** 2
        elif shape.type == "rectangle":
            return shape.width * shape.height
        # 添加新形状 → 修改这里

# ✅ 遵守：扩展新形状无需修改计算器
class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...

class Circle(Shape):
    def area(self) -> float: ...

class Rectangle(Shape):
    def area(self) -> float: ...

class AreaCalculator:
    def calculate(self, shape: Shape):
        return shape.area()  # 无论什么形状都能处理
```

### 好处
- 新功能无需修改已有代码
- 降低引入bug的风险
- 提高代码复用性

---

## L - 里氏替换原则 (Liskov Substitution Principle)

### 核心思想

> 子类对象可以替换父类对象，而不影响程序的正确性。

### 原则要求

子类必须满足：
1. **前置条件**不加强 — 子类不能要求比父类更严格
2. **后置条件**不削弱 — 子类不能提供比父类更少保证
3. **不变式**保持 — 子类必须保持父类的不变式

### 案例

```python
# ❌ 违反：子类改变了父类的行为
class Bird:
    def fly(self):
        return "Flying"

class Penguin(Bird):
    def fly(self):
        raise Exception("Penguins cannot fly")  # 违反替换原则

# ✅ 遵守：重新设计
class Bird(ABC):
    pass

class FlyingBird(Bird):
    def fly(self): ...

class NonFlyingBird(Bird):
    pass

class Penguin(NonFlyingBird):
    pass
```

### 好处
- 代码一致性
- 多态正确运行
- 易于理解继承关系

---

## I - 接口隔离原则 (Interface Segregation Principle)

### 核心思想

> 客户端不应该依赖它不需要的接口。

### 原则

接口应该小而专，不要大而全。

### 案例

```python
# ❌ 违反：巨型接口
class Machine(ABC):
    @abstractmethod
    def print(self): ...
    @abstractmethod
    def scan(self): ...
    @abstractmethod
    def fax(self): ...

class SimplePrinter(Machine):
    def print(self): ...  # 必须实现不需要的方法
    def scan(self): ...   # ❌
    def fax(self): ...   # ❌

# ✅ 遵守：拆分为小接口
class Printer(ABC):
    @abstractmethod
    def print(self): ...

class Scanner(ABC):
    @abstractmethod
    def scan(self): ...

class Fax(ABC):
    @abstractmethod
    def fax(self): ...

class SimplePrinter(Printer):
    def print(self): ...  # 只实现需要的
```

### 好处
- 减少不必要依赖
- 提高代码灵活性
- 降低耦合度

---

## D - 依赖反转原则 (Dependency Inversion Principle)

### 核心思想

1. 高层模块不应该依赖低层模块
2. 两者都应该依赖抽象
3. 抽象不应该依赖细节，细节应该依赖抽象

### 案例

```python
# ❌ 违反：高层依赖低层实现
class OrderService:
    def __init__(self):
        self.db = MySQLDatabase()  # 直接依赖具体类

# ✅ 遵守：依赖抽象
class Database(ABC):
    @abstractmethod
    def save(self, data): ...

class OrderService:
    def __init__(self, db: Database):  # 依赖抽象
        self.db = db

# 具体实现
class MySQLDatabase(Database):
    def save(self, data): ...

class PostgreSQLDatabase(Database):
    def save(self, data): ...

# 切换实现无需修改 OrderService
order_service = OrderService(PostgreSQLDatabase())
```

### 依赖注入 (Dependency Injection)

依赖反转通常通过依赖注入实现：

| 方式 | 说明 |
|------|------|
| 构造函数注入 | 通过构造函数传入依赖 |
| Setter注入 | 通过setter方法传入依赖 |
| 接口注入 | 通过接口方法传入依赖 |

### 好处
- 便于单元测试（可注入mock）
- 降低模块间耦合
- 提高代码灵活性
- 支持插件架构

---

## SOLID 实践检查清单

```markdown
### 单一职责 (S)
- [ ] 类是否只有一个改变原因？
- [ ] 方法是否过于庞大？
- [ ] 是否有类承担了太多职责？

### 开闭 (O)
- [ ] 添加新功能是否需要修改已有代码？
- [ ] 是否可以通过继承/组合扩展？
- [ ] 是否使用了策略模式/模板方法？

### 里氏替换 (L)
- [ ] 子类是否保持了父类的行为？
- [ ] 是否有方法被override导致行为改变？
- [ ] 继承关系是否合理？

### 接口隔离 (I)
- [ ] 接口是否过于庞大？
- [ ] 实现类是否实现了不需要的方法？
- [ ] 是否需要拆分接口？

### 依赖反转 (D)
- [ ] 是否依赖具体类而非抽象？
- [ ] 是否使用了依赖注入？
- [ ] 高层是否依赖于低层？
```

## 相关文档

- [[架构模式对比]] - 架构模式与设计原则的关系
- [[软件架构导论]] - 基础概念