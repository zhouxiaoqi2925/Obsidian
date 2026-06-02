---
created: '2026-05-31'
source: aws.amazon.com/builders-library
tags:
  - amazon
  - aws
  - 分布式系统
title: ABL-分布式系统设计模式
---
# ABL-分布式系统设计模式

**来源**：Amazon Builders' Library
**创建时间**：2026-05-31

---

## 一、核心模式

### 1. 避免重试风暴 (Avoiding Retry Storms)

**问题场景**：
当服务出现短暂故障时，大量客户端同时重试会导致：
- 服务端负载再次飙升
- 故障时间延长
- 形成级联失败

**解决方案**：

```python
import random
import asyncio

class RetryPolicy:
    def __init__(self, base_delay=1, max_delay=60, jitter=True):
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter
    
    async def wait(self, attempt):
        # 指数退避
        delay = min(self.base_delay * (2 ** attempt), self.max_delay)
        
        # 抖动（防止雷群效应）
        if self.jitter:
            delay = delay * (0.5 + random.random() * 0.5)
        
        await asyncio.sleep(delay)
```

**关键参数**：
| 参数 | 推荐值 | 说明 |
|------|--------|------|
| base_delay | 100-500ms | 基础延迟 |
| max_delay | 30-60s | 最大延迟 |
| jitter | true | 必须启用 |
| max_attempts | 3-5 | 最大重试次数 |

**最佳实践**：
1. ✅ 总是添加 jitter
2. ✅ 设置最大重试次数
3. ✅ 熔断器配合使用
4. ✅ 区分可重试/不可重试错误

---

### 2. 断路器模式 (Circuit Breaker)

**状态机**：
```
        ┌─────────────────────────────────┐
        │                                 │
        ▼                                 │
    ┌──────┐  失败阈值   ┌────────┐  恢复检测   ┌──────────┐
───▶│Closed│───────────▶│ Open   │───────────▶│Half-Open │
    └──────┘             └────────┘             └──────────┘
        ▲                                              │
        │         成功阈值                              │
        └──────────────────────────────────────────────┘
```

**实现代码**：

```python
class CircuitBreaker:
    def __init__(self, failure_threshold=5, recovery_timeout=60):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time = None
        self.state = "closed"
    
    async def call(self, func, *args, **kwargs):
        if self.state == "open":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "half-open"
            else:
                raise CircuitOpenException()
        
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
    
    def _on_success(self):
        self.failure_count = 0
        self.state = "closed"
    
    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = "open"
```

**配置建议**：
| 参数 | 开发环境 | 生产环境 |
|------|----------|----------|
| failure_threshold | 3 | 10-20 |
| recovery_timeout | 30s | 60s |
| half_open_attempts | 1 | 3 |

---

### 3. 幂等性设计 (Idempotency)

**为什么重要**：
- 网络重试导致重复请求
- 客户端超时后重试
- 异步处理重复消息

**实现方式**：

#### 方式一：Token 模式
```python
import uuid

async def process_payment(request_id: str, idempotency_key: str):
    # 检查是否已处理
    cache_key = f"idempotent:{idempotency_key}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # 业务处理
    result = await payment_service.charge(request_id)
    
    # 缓存结果
    await redis.setex(cache_key, 86400, json.dumps(result))
    return result
```

#### 方式二：数据库唯一约束
```sql
INSERT INTO orders (idempotency_key, amount, status)
VALUES ('key_123', 100, 'completed')
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING *;
```

**幂等操作分类**：
| 操作类型 | 推荐方式 |
|----------|----------|
| 支付 | Token + 数据库唯一键 |
| 订单创建 | 数据库唯一键 |
| 状态更新 | 版本号/时间戳 |
| 删除操作 | 软删除 |

---

### 4. 舱壁隔离 (Bulkhead)

**目的**：防止故障蔓延，保护核心服务

**实现方式**：

```python
from concurrent.futures import ThreadPoolExecutor
from queue import Queue

class Bulkhead:
    def __init__(self, max_concurrent: int, max_queue_size: int):
        self.executor = ThreadPoolExecutor(max_workers=max_concurrent)
        self.queue = Queue(maxsize=max_queue_size)
    
    async def execute(self, task, *args):
        future = self.executor.submit(task, *args)
        return await asyncio.wrap_future(future)

# 使用示例
payment_bulkhead = Bulkhead(max_concurrent=10, max_queue_size=100)
inventory_bulkhead = Bulkhead(max_concurrent=20, max_queue_size=200)
```

**线程池 vs 信号量**：
| 隔离方式 | 适用场景 | 资源控制 |
|----------|----------|----------|
| 线程池隔离 | I/O 密集型 | 线程数 |
| 信号量隔离 | 轻量级操作 | 并发数 |

---

### 5. 限流策略 (Rate Limiting)

**算法选择**：

#### Token Bucket
```python
import time

class TokenBucket:
    def __init__(self, rate: float, capacity: int):
        self.rate = rate  # 每秒补充的 token 数
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.time()
    
    def consume(self, tokens=1) -> bool:
        now = time.time()
        elapsed = now - self.last_update
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_update = now
        
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False
```

#### Sliding Window
```python
from collections import deque

class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = deque()
    
    def is_allowed(self) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        
        # 清理过期请求
        while self.requests and self.requests[0] < cutoff:
            self.requests.popleft()
        
        if len(self.requests) < self.max_requests:
            self.requests.append(now)
            return True
        return False
```

**限流维度**：
| 维度 | 说明 | 示例 |
|------|------|------|
| IP | 单一 IP 请求量 | 100/min |
| User | 单一用户请求量 | 1000/hour |
| API Key | 单一 API Key | 10000/day |
| Global | 全局请求量 | 100000/min |

---

## 二、架构模式

### 6. 事件驱动架构

**核心概念**：
```
┌─────────┐      ┌─────────┐      ┌─────────┐
│ Service │ ──▶ │  Event  │ ──▶ │ Service │
│   A     │      │  Bus    │      │   B     │
└─────────┘      └─────────┘      └─────────┘
```

**事件结构设计**：
```python
from dataclasses import dataclass
from datetime import datetime
import json

@dataclass
class Event:
    event_id: str
    event_type: str
    source: str
    timestamp: datetime
    data: dict
    metadata: dict
    
    def to_json(self):
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "source": self.source,
            "timestamp": self.timestamp.isoformat(),
            "data": self.data,
            "metadata": self.metadata
        }
```

---

### 7. Saga 分布式事务

**补偿事务模式**：

```python
class OrderSaga:
    async def execute(self, order: Order):
        steps = [
            ("reserve_inventory", self.reserve_inventory, self.cancel_inventory),
            ("create_order", self.create_order, self.cancel_order),
            ("process_payment", self.process_payment, self.refund_payment),
            ("ship_order", self.ship_order, self.cancel_shipment),
        ]
        
        completed = []
        for step_name, do_action, compensate_action in steps:
            try:
                result = await do_action(order)
                completed.append((step_name, result, compensate_action))
            except Exception as e:
                # 补偿已完成的步骤
                await self.rollback(completed)
                raise SagaExecutionError(f"Step {step_name} failed: {e}")
    
    async def rollback(self, completed):
        for step_name, result, compensate in reversed(completed):
            try:
                await compensate(result)
            except Exception as e:
                # 记录补偿失败，供后续处理
                await log_compensation_failure(step_name, e)
```

---

### 8. CQRS 模式

**命令查询分离**：
```
写入路径：                      读取路径：
┌─────────┐                  ┌─────────┐
│Command  │ ──▶ Event ──▶ │  Event   │
│ Handler │                  │  Store   │
└─────────┘                  └─────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │  Read Models    │
                              │  (针对性优化)   │
                              └─────────────────┘
```

---

### 9. 蓝绿部署

**切换流程**：
```
阶段1：蓝绿共存
┌────────────┐    100%流量     ┌────────────┐
│   Blue     │ ◀────────────── │   Green    │
│ (当前版本) │                 │ (新版本)    │
└────────────┘                 └────────────┘
      ↑ 10%流量
      └────────────

阶段2：切换完成
┌────────────┐                 ┌────────────┐
│   Blue     │                 │   Green    │
│ (旧版本)   │                 │ (新版本)   │
│  (保留)    │                 │  100%流量  │
└────────────┘                 └────────────┘
```

---

### 10. 金丝雀发布

**流量分配策略**：
```yaml
canary:
  traffic_percentage: 5  # 5% 流量到新版本
  metrics:
    - name: error_rate
      threshold: 1%
    - name: latency_p99
      threshold: 500ms
  auto_rollback:
    enabled: true
    trigger_on_fail: 3  # 连续3次失败自动回滚
```

---

## 三、性能模式

### 11. 读写分离

**实现架构**：
```
        ┌────────────┐
        │   Writer   │
        │  (主库)    │
        └──────┬─────┘
               │ 同步
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌───────┐ ┌───────┐ ┌───────┐
│Read 1 │ │Read 2 │ │Read 3 │
│(从库) │ │(从库) │ │(从库) │
└───────┘ └───────┘ └───────┘
```

**路由策略**：
```python
class ReadReplicaRouter:
    def __init__(self, writer, readers):
        self.writer = writer
        self.readers = readers
        self.current = 0
    
    async def execute_read(self, query):
        # 轮询选择读库
        reader = self.readers[self.current]
        self.current = (self.current + 1) % len(self.readers)
        return await reader.execute(query)
    
    async def execute_write(self, query):
        return await self.writer.execute(query)
```

---

### 12. 缓存模式

**Cache-Aside**：
```python
async def get_user(user_id):
    # 1. 先查缓存
    cache_key = f"user:{user_id}"
    cached = await redis.get(cache_key)
    if cached:
        return User.from_json(cached)
    
    # 2. 缓存未命中，查数据库
    user = await db.get_user(user_id)
    
    # 3. 写入缓存
    await redis.setex(cache_key, 3600, user.to_json())
    return user
```

**Write-Through**：
```python
async def update_user(user_id, data):
    # 同步更新缓存和数据库
    user = await db.update_user(user_id, data)
    await redis.set(f"user:{user_id}", user.to_json())
    return user
```

---

### 13. 分片策略

**哈希分片**：
```python
def get_shard(user_id, num_shards=16):
    return hash(user_id) % num_shards
```

**一致性哈希**：
```python
import hashlib

class ConsistentHash:
    def __init__(self, replicas=100):
        self.replicas = replicas
        self.ring = {}
        self.sorted_keys = []
    
    def add_node(self, node):
        for i in range(self.replicas):
            key = hash(f"{node}:{i}")
            self.ring[key] = node
            self.sorted_keys.append(key)
        self.sorted_keys.sort()
    
    def get_node(self, key):
        if not self.ring:
            return None
        
        hash_key = hashlib.md5(str(key).encode()).digest()
        hash_key_int = int.from_bytes(hash_key[:4], 'big')
        
        idx = bisect_left(self.sorted_keys, hash_key_int)
        if idx == len(self.sorted_keys):
            idx = 0
        
        return self.ring[self.sorted_keys[idx]]
```

---

### 14. 批量处理

**批处理模式**：
```python
class BatchProcessor:
    def __init__(self, batch_size=100, flush_interval=1.0):
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.buffer = []
        self.last_flush = time.time()
    
    async def add(self, item):
        self.buffer.append(item)
        
        if len(self.buffer) >= self.batch_size:
            await self.flush()
        elif time.time() - self.last_flush >= self.flush_interval:
            await self.flush()
    
    async def flush(self):
        if not self.buffer:
            return
        
        batch = self.buffer
        self.buffer = []
        self.last_flush = time.time()
        
        await self.process_batch(batch)
```

---

### 15. 异步处理

**队列模式**：
```python
async def process_async(task_type, payload):
    message = {
        "task_id": str(uuid.uuid4()),
        "task_type": task_type,
        "payload": payload,
        "created_at": datetime.utcnow().isoformat()
    }
    
    await queue.send_message(
        QueueUrl=os.getenv("TASK_QUEUE"),
        MessageBody=json.dumps(message)
    )
    
    return message["task_id"]  # 返回任务ID供查询
```

---

## 四、可靠性模式

### 16. 健康检查

**分层健康检查**：
```python
async def health_check():
    results = {
        "elb": await check_elb(),
        "application": await check_app(),
        "database": await check_database(),
        "cache": await check_redis(),
        "external": await check_external_services()
    }
    
    all_healthy = all(results.values())
    worst_status = "healthy" if all_healthy else "degraded"
    
    return {
        "status": worst_status,
        "checks": results,
        "timestamp": datetime.utcnow().isoformat()
    }
```

---

### 17. Graceful Shutdown

**实现**：
```python
import signal
import asyncio

class GracefulShutdown:
    def __init__(self, app):
        self.app = app
        self.shutdown_event = asyncio.Event()
    
    async def start(self):
        signal.signal(signal.SIGTERM, self.handle_signal)
        signal.signal(signal.SIGINT, self.handle_signal)
        
        await self.app.start()
        
        try:
            await self.shutdown_event.wait()
        finally:
            await self.shutdown()
    
    async def shutdown(self):
        # 1. 停止接收新请求
        await self.app.stop_accepting()
        
        # 2. 等待现有请求完成
        await self.app.wait_pending(max_wait=30)
        
        # 3. 关闭数据库连接
        await self.db.close()
        
        # 4. 清理资源
        await self.cleanup()
```

---

### 18. 监控告警

**关键指标**：
| 类别 | 指标 | 告警阈值 |
|------|------|----------|
| 延迟 | P99 Latency | > 500ms |
| 错误 | Error Rate | > 1% |
| 饱和度 | CPU Usage | > 80% |
| 可用性 | Success Rate | < 99.9% |

---

### 19. 降级策略

**功能降级**：
```python
async def get_recommendations(user_id, allow_expensive=True):
    try:
        if allow_expensive:
            return await expensive_ml_model.predict(user_id)
    except MLServiceUnavailable:
        pass
    
    # 降级到简单规则
    return await simple_rules.get_recommendations(user_id)
```

**数据降级**：
```python
async def get_product_details(product_id):
    try:
        # 优先完整数据
        return await product_service.get_full_details(product_id)
    except Timeout:
        # 降级到缓存数据
        return await product_cache.get(product_id)
    except CacheMiss:
        # 最终降级到基础数据
        return await product_db.get_basic(product_id)
```

---

### 20. 迁移策略

**Strangler Fig 模式**：
```
阶段1：代理转发
┌─────┐      ┌────────┐      ┌─────────┐
│Client│ ──▶ │ Proxy  │ ──▶ │ Legacy  │
└─────┘      │        │      │ Service │
             └────────┘      └─────────┘
                     │
                     ▼
              ┌────────────┐
              │  New       │
              │  Service   │
              │  (空)      │
              └────────────┘

阶段2：渐进迁移
┌─────┐      ┌────────┐
│Client│ ──▶ │ Proxy  │
└─────┘      │        │
             └────────┘
              │      │
              ▼      ▼
      ┌─────────┐ ┌────────────┐
      │ Legacy  │ │   New      │
      │ Service │ │  Service   │
      └─────────┘ └────────────┘

阶段3：完全迁移
┌─────┐      ┌────────┐      ┌────────────┐
│Client│ ──▶ │ Proxy  │ ──▶ │   New      │
└─────┘      │        │      │  Service   │
             └────────┘      └────────────┘
```

---

**标签**：#amazon #aws #分布式系统 #设计模式
**状态**：20/20 份详细内容
