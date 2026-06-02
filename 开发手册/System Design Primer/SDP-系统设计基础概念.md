---
created: '2026-05-31'
source: github.com/donnemartin/system-design-primer
tags:
  - system-design
  - 系统设计
  - 基础概念
title: SDP-系统设计基础概念
---
# SDP-系统设计基础概念

**来源**：System Design Primer
**创建时间**：2026-05-31

---

## 一、CAP 定理与 BASE 模型

### 1. CAP 定理

**定义**：分布式系统无法同时满足以下三个特性：
- **Consistency（一致性）**：所有节点看到相同的数据
- **Availability（可用性）**：每个请求都能获得响应
- **Partition Tolerance（分区容错）**：系统容忍网络分区

**三种组合**：
```
CP 系统（一致性 + 分区容错）：
- 放弃可用性
- 适用于：银行系统、分布式数据库

AP 系统（可用性 + 分区容错）：
- 放弃强一致性
- 适用于：社交媒体、CDN、DNS

CA 系统（一致性 + 可用性）：
- 不存在，因为必须容忍网络分区
```

**实际选择**：
| 场景 | 选择 | 说明 |
|------|------|------|
| 金融交易 | CP | 必须保证一致性 |
| 社交媒体 | AP | 允许最终一致 |
| DNS | AP | 高可用优先 |
| 分布式数据库 | CP/AP | 根据场景选择 |

---

### 2. BASE 模型

**定义**： Eventually Consistent 的替代方案
- **Basically Available**：基本可用
- **Soft state**：软状态/柔性状态
- **Eventually Consistent**：最终一致

**与 ACID 对比**：
| 特性 | ACID | BASE |
|------|------|------|
| 一致性 | 强一致 | 最终一致 |
| 可用性 | 牺牲可用性 | 保证基本可用 |
| 隔离性 | 严格隔离 | 弱隔离 |
| 事务 | 原子性保证 | 最终一致 |

**适用场景**：
- 高可用系统
- 大规模分布式系统
- NoSQL 数据库
- 实时性要求不高的场景

---

## 二、性能指标

### 3. 延迟与吞吐量

**延迟指标**：
```python
import time
from typing import List

class LatencyAnalyzer:
    @staticmethod
    def percentile(data: List[float], p: float) -> float:
        """计算 P50/P95/P99/P999"""
        sorted_data = sorted(data)
        index = int(len(sorted_data) * p / 100)
        return sorted_data[min(index, len(sorted_data) - 1)]
    
    @staticmethod
    def analyze(latencies: List[float]):
        return {
            "p50": LatencyAnalyzer.percentile(latencies, 50),
            "p95": LatencyAnalyzer.percentile(latencies, 95),
            "p99": LatencyAnalyzer.percentile(latencies, 99),
            "p999": LatencyAnalyzer.percentile(latencies, 99.9),
            "avg": sum(latencies) / len(latencies),
            "max": max(latencies)
        }
```

**吞吐量指标**：
| 指标 | 单位 | 说明 |
|------|------|------|
| QPS | queries/second | 每秒查询数 |
| TPS | transactions/second | 每秒事务数 |
| RPS | requests/second | 每秒请求数 |
| IOPS | operations/second | 每秒I/O操作数 |

**延迟 vs 吞吐量关系**：
```
吞吐量（TPS）与延迟（Latency）关系：

TPS = 1000 / Latency(ms)

Latency    TPS (每秒事务数)
10ms      100
100ms     10
1ms       1000
0.1ms     10000
```

---

### 4. SLA/SLO/SLI

**定义层级**：
```
SLA (Service Level Agreement) - 面向客户的承诺
  │
  ├── SLO (Service Level Objective) - 内部目标
  │     │
  │     └── SLI (Service Level Indicator) - 实际指标
  │           │
  │           └── 监控数据收集
```

**示例**：
```yaml
# SLA: 月度可用性 99.9%
SLO: 每日可用性 99.95%
SLI: 
  - 每分钟检查服务可用性
  - 持续时间超过 10s 判定为不可用
  - 成功率 = 成功请求 / 总请求
```

**Error Budget 计算**：
```python
import datetime

def calculate_error_budget(slo: float, period_days: int):
    """
    99.9% SLA 每月 Error Budget：
    - 允许的 downtime = 43.8 分钟/月
    - 允许的错误请求 = 0.1%
    """
    total_minutes = period_days * 24 * 60
    allowed_downtime = total_minutes * (1 - slo)
    return {
        "allowed_downtime_minutes": allowed_downtime,
        "allowed_downtime_seconds": allowed_downtime * 60,
        "error_budget_percent": (1 - slo) * 100
    }

# 计算示例
budget = calculate_error_budget(0.999, 30)
# {'allowed_downtime_minutes': 43.8, ...}
```

---

### 5. 可用性模式

**高可用架构设计**：
```
                    ┌─────────────┐
                    │   Load     │
                    │  Balancer  │
                    └─────┬─────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │ Server1 │      │ Server2 │      │ Server3 │
    │   AZ1   │      │   AZ2   │      │   AZ3   │
    └────┬────┘      └────┬────┘      └────┬────┘
         │                │                │
         └────────────────┼────────────────┘
                          │
              ┌───────────┴───────────┐
              │                       │
         ┌────▼────┐            ┌────▼────┐
         │Primary DB│            │Replica DB│
         │   AZ1   │◀── 复制 ──▶│   AZ2   │
         └─────────┘            └─────────┘
```

**可用性计算**：
```python
def availability_of_series(components: List[float]) -> float:
    """串联系统可用性 = 各组件可用性乘积"""
    result = 1.0
    for comp in components:
        result *= comp
    return result

def availability_of_parallel(components: List[float]) -> float:
    """并联系统可用性 = 1 - 各组件不可用概率乘积"""
    result = 1.0
    for comp in components:
        result *= (1 - comp)
    return 1 - result

# 示例：3个AZ，每个99.9%
# 并联系统可用性 = 1 - (0.001)³ = 99.999999%
```

---

### 6. 负载均衡算法

**常用算法**：
```python
from abc import ABC, abstractmethod
from typing import List
import random

class LoadBalancer(ABC):
    @abstractmethod
    def select(self, servers: List) -> str:
        pass

class RoundRobin(LoadBalancer):
    def __init__(self):
        self.current = 0
    
    def select(self, servers: List) -> str:
        if not servers:
            raise ValueError("No servers available")
        server = servers[self.current]
        self.current = (self.current + 1) % len(servers)
        return server

class LeastConnections(LoadBalancer):
    def __init__(self):
        self.connections = {}  # {server: connection_count}
    
    def select(self, servers: List) -> str:
        if not servers:
            raise ValueError("No servers available")
        
        # 选择连接数最少的服务器
        return min(servers, key=lambda s: self.connections.get(s, 0))

class WeightedRoundRobin(LoadBalancer):
    def __init__(self, weights: dict):
        self.weights = weights
        self.current = 0
    
    def select(self, servers: List) -> str:
        # 根据权重选择
        total_weight = sum(self.weights.get(s, 1) for s in servers)
        rand = random.randint(1, total_weight)
        
        cumsum = 0
        for server in servers:
            cumsum += self.weights.get(server, 1)
            if rand <= cumsum:
                return server
        return servers[-1]

class ConsistentHash(LoadBalancer):
    def __init__(self, nodes: List[str], replicas=100):
        self.ring = {}
        self.sorted_keys = []
        for node in nodes:
            for i in range(replicas):
                key = hash(f"{node}:{i}")
                self.ring[key] = node
                self.sorted_keys.append(key)
        self.sorted_keys.sort()
    
    def select(self, key: str) -> str:
        if not self.ring:
            return None
        hash_key = hash(key)
        idx = bisect_left(self.sorted_keys, hash_key)
        return self.ring[self.sorted_keys[idx % len(self.sorted_keys)]]
```

---

## 三、数据库设计

### 7. SQL vs NoSQL 选型

**SQL 适用场景**：
- 结构化数据
- 强一致性要求
- 复杂查询
- 事务支持

**NoSQL 类型与场景**：
| 类型 | 代表产品 | 适用场景 |
|------|----------|----------|
| Key-Value | Redis, DynamoDB | 缓存、会话、简单数据 |
| Document | MongoDB | JSON 数据、内容管理 |
| Column | Cassandra | 时序数据、大量写入 |
| Graph | Neo4j | 社交图谱、推荐 |

**选型决策树**：
```
需要强一致性？ ──是──▶ 选择 SQL / 分布式 NewSQL
    │
    └──否──▶ 数据结构复杂？ ──是──▶ Document (MongoDB)
                │
                └──否──▶ 需要横向扩展？ ──是──▶ Key-Value / Column
                              │
                              └──否──▶ 选择 SQL
```

---

### 8. 数据库复制

**主从复制**：
```python
# MySQL 主从复制原理
class Replication:
    """
    1. 主库记录 binlog (binary log)
    2. 从库 IO 线程连接主库，请求 binlog
    3. 主库 dump 线程发送 binlog 给从库
    4. 从库 IO 线程接收，写入 relay log
    5. 从库 SQL 线程读取 relay log，执行 SQL
    """
    
    async def replicate(self, master_url: str, slave_id: str):
        await slave.connect(master_url)
        await slave.start_replication(slave_id)
        
        # 监控延迟
        while True:
            delay = await slave.getReplicationDelay()
            if delay > MAX_ALLOWED_DELAY:
                await alert(f"Replication lag: {delay}s")
            await asyncio.sleep(CHECK_INTERVAL)
```

**延迟处理策略**：
```python
# 读己之所写
async def read_after_write(user_id, key):
    # 写操作后立即读取走主库
    if await was_recently_written(key):
        return await primary_db.get(key)
    return await replica_db.get(key)
```

---

### 9. 数据库分片

**分片策略**：
```python
# 基于用户ID哈希分片
def shard_by_user_id(user_id: str, num_shards: int = 16) -> int:
    return hash(user_id) % num_shards

# 基于地域分片
def shard_by_region(user_id: str) -> str:
    user = await get_user(user_id)
    return REGION_SHARD_MAP[user.region]

# 基于时间分片
def shard_by_time(created_at: datetime) -> str:
    year_month = created_at.strftime("%Y%m")
    return f"shard_{year_month}"

# 查表法分片
SHARD_MAP = {
    range(0, 10000): "shard_0",
    range(10000, 50000): "shard_1",
    range(50000, 100000): "shard_2",
}

def shard_by_range(user_id: int) -> str:
    for r, shard in SHARD_MAP.items():
        if user_id in r:
            return shard
    return "shard_default"
```

**跨分片查询**：
```python
async def aggregate_query(shards: List, query: str):
    """ Scatter-Gather 查询 """
    results = await asyncio.gather(*[
        shard.query(query) for shard in shards
    ])
    
    # 合并结果
    return merge_results(results)
```

---

### 10. 索引设计

**B-Tree 索引**：
```sql
-- 单列索引
CREATE INDEX idx_user_id ON orders(user_id);

-- 复合索引 (最左前缀原则)
CREATE INDEX idx_user_status ON orders(user_id, status);

-- 覆盖索引 (避免回表)
CREATE INDEX idx_user_covered ON orders(user_id, status, amount);

-- 查询示例
SELECT user_id, status, amount  -- 只需索引内数据
FROM orders
WHERE user_id = 123;  -- 可用覆盖索引
```

**索引设计原则**：
| 原则 | 说明 | 示例 |
|------|------|------|
| 选择性高 | 唯一索引 > 高基数列 | email > status |
| 左前缀 | 复合索引从左到右使用 | (a,b,c) 仅支持 a,a+b,a+b+c |
| 覆盖索引 | 包含查询所需全部列 | 减少回表 |
| 控制数量 | 单表索引不超过5个 | 写性能影响 |

---

## 四、缓存策略

### 11. 缓存模式

**Cache-Aside (旁路缓存)**：
```python
async def get_item(item_id):
    cache_key = f"item:{item_id}"
    
    # 1. 先查缓存
    item = await redis.get(cache_key)
    if item:
        return json.loads(item)
    
    # 2. 缓存未命中，查数据库
    item = await db.query("SELECT * FROM items WHERE id = %s", item_id)
    
    # 3. 写入缓存 (TTL=1小时)
    await redis.setex(cache_key, 3600, json.dumps(item))
    
    return item

async def update_item(item_id, data):
    # 1. 更新数据库
    await db.execute("UPDATE items SET ... WHERE id = %s", item_id, data)
    
    # 2. 删除缓存 (而不是更新)
    await redis.delete(f"item:{item_id}")
    # 原因：删除比更新更安全，避免并发导致数据不一致
```

**Read-Through**：
```python
class ReadThroughCache:
    async def get(self, key, loader_func, ttl=3600):
        # 1. 先查缓存
        cached = await self.cache.get(key)
        if cached:
            return cached
        
        # 2. 缓存未命中，调用 loader 加载
        data = await loader_func(key)
        
        # 3. 写入缓存
        await self.cache.setex(key, ttl, data)
        return data
```

**Write-Through / Write-Behind**：
```python
class WriteBehindCache:
    async def write(self, key, data):
        # 同步写入缓存
        await self.cache.set(key, data)
        
        # 异步写入数据库
        await self.write_queue.put(("write", key, data))
    
    async def flush_queue(self):
        while True:
            op, key, data = await self.write_queue.get()
            if op == "write":
                await self.db.execute("UPDATE ...", key, data)
            elif op == "delete":
                await self.db.execute("DELETE FROM ...", key)
```

---

### 12. 缓存失效处理

**三大问题与解决方案**：

#### 缓存穿透
```python
# 问题：查询不存在的数据，每次都打到数据库
# 解决：布隆过滤器 / 缓存空值

async def get_item_with_bloom(item_id):
    cache_key = f"item:{item_id}"
    
    # 布隆过滤器检查
    if not bloom_filter.might_contain(item_id):
        return None  # 必定不存在，直接返回
    
    item = await redis.get(cache_key)
    if item == "NULL":  # 缓存空值
        return None
    
    # ... 正常查询逻辑
```

#### 缓存击穿
```python
# 问题：热点key过期瞬间，大量请求打到数据库
# 解决：互斥锁 / 永不过期 + 异步更新

import asyncio

async def get_item_with_mutex(item_id):
    cache_key = f"item:{item_id}"
    item = await redis.get(cache_key)
    
    if item:
        return json.loads(item)
    
    # 获取锁
    lock_key = f"lock:{cache_key}"
    lock = redis.lock(lock_key, timeout=10)
    
    if lock.acquire(blocking=True):
        try:
            # 双重检查
            item = await redis.get(cache_key)
            if item:
                return json.loads(item)
            
            # 加载数据
            item = await db.get_item(item_id)
            await redis.setex(cache_key, 3600, json.dumps(item))
            return item
        finally:
            lock.release()
```

#### 缓存雪崩
```python
# 问题：大量缓存同时过期 / Redis 宕机
# 解决：随机TTL / 多级缓存 / Redis 高可用

# 1. 随机过期时间
ttl = BASE_TTL + random.randint(0, RANDOM_TTL)

# 2. 多级缓存
L1_CACHE_TTL = 60      # 本地缓存
L2_CACHE_TTL = 3600    # Redis
L3_CACHE_TTL = None    # 数据库

# 3. 熔断降级
async def get_with_fallback(item_id):
    try:
        return await redis.get(item_id)
    except RedisUnavailable:
        return await db.get_item(item_id)  # 回退到数据库
```

---

### 13. LRU/LFU/FIFO

**LRU 实现**：
```python
from collections import OrderedDict

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()
    
    def get(self, key):
        if key not in self.cache:
            return None
        self.cache.move_to_end(key)
        return self.cache[key]
    
    def put(self, key, value):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)  # 删除最旧的
```

**LFU 实现**：
```python
import heapq

class LFUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = {}  # key -> (freq, value)
        self.freq_map = {}  # freq -> set of keys
        self.min_freq = 0
    
    def get(self, key):
        if key not in self.cache:
            return None
        
        freq, _ = self.cache[key]
        freq += 1
        
        # 从旧频率集合移除
        self.freq_map[freq - 1].remove(key)
        if not self.freq_map[freq - 1]:
            del self.freq_map[freq - 1]
            if self.min_freq == freq - 1:
                self.min_freq = freq
        
        # 加入新频率集合
        if freq not in self.freq_map:
            self.freq_map[freq] = set()
        self.freq_map[freq].add(key)
        
        self.cache[key] = (freq, self.cache[key][1])
        return self.cache[key][1]
    
    def put(self, key, value):
        if self.capacity == 0:
            return
        
        if key in self.cache:
            self.get(key)  # 更新频率
            self.cache[key] = (self.cache[key][0], value)
            return
        
        if len(self.cache) >= self.capacity:
            # 淘汰最小频率的key
            min_freq = min(self.freq_map.keys())
            evict_key = self.freq_map[min_freq].pop()
            if not self.freq_map[min_freq]:
                del self.freq_map[min_freq]
            del self.cache[evict_key]
        
        self.cache[key] = (1, value)
        self.freq_map[1] = {key}
        self.min_freq = 1
```

---

## 五、消息队列

### 14. 消息队列模式

**发布/订阅模式**：
```python
class PubSub:
    def __init__(self):
        self.subscribers = {}  # topic -> [callback list]
    
    def subscribe(self, topic: str, callback):
        if topic not in self.subscribers:
            self.subscribers[topic] = []
        self.subscribers[topic].append(callback)
    
    async def publish(self, topic: str, message):
        if topic in self.subscribers:
            for callback in self.subscribers[topic]:
                await callback(message)
```

**点对点模式**：
```python
async def send_message(queue, message):
    await queue.send(MessageBody=json.dumps(message))

async def receive_message(queue):
    response = await queue.receive_message(
        WaitTimeSeconds=5,
        MaxNumberOfMessages=1
    )
    return response['Messages'][0] if response['Messages'] else None

async def delete_message(queue, receipt_handle):
    await queue.delete_message(ReceiptHandle=receipt_handle)
```

---

### 15. Kafka 架构

**核心概念**：
```
Topic (主题)
  │
  ├── Partition 0 ──▶ Offset 0, 1, 2, 3...
  ├── Partition 1 ──▶ Offset 0, 1, 2...
  └── Partition 2 ──▶ Offset 0, 1, 2...
  
Producer ──▶ 分区策略 ──▶ Broker 存储
Consumer ──▶ 消费者组 ──▶ 负载均衡
```

**生产消息**：
```python
from confluent_kafka import Producer, Consumer

class KafkaProducer:
    def __init__(self, bootstrap_servers):
        self.producer = Producer({
            'bootstrap.servers': bootstrap_servers,
            'acks': 'all',  # 所有副本确认
            'retries': 3,
            'retry.backoff.ms': 100
        })
    
    def delivery_report(self, err, msg):
        if err:
            print(f"Delivery failed: {err}")
        else:
            print(f"Delivered to {msg.topic()} [{msg.partition()}]")
    
    def send(self, topic, key, value):
        self.producer.produce(
            topic=topic,
            key=key.encode(),
            value=value.encode(),
            callback=self.delivery_report
        )
        self.producer.flush()
```

**消费消息**：
```python
class KafkaConsumer:
    def __init__(self, bootstrap_servers, group_id, topic):
        self.consumer = Consumer({
            'bootstrap.servers': bootstrap_servers,
            'group.id': group_id,
            'auto.offset.reset': 'earliest'
        })
        self.consumer.subscribe([topic])
    
    async def consume(self):
        while True:
            msg = self.consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                print(f"Error: {msg.error()}")
                continue
            
            # 处理消息
            yield {
                'topic': msg.topic(),
                'partition': msg.partition(),
                'offset': msg.offset(),
                'key': msg.key().decode(),
                'value': msg.value().decode()
            }
```

---

### 16. RabbitMQ 架构

**Exchange 类型**：
```python
# Direct Exchange - 精确匹配
exchange_declare(exchange='direct_ex', type='direct')
queue_bind(queue='queue1', exchange='direct_ex', routing_key='order.created')

# Fanout Exchange - 广播所有
exchange_declare(exchange='fanout_ex', type='fanout')
queue_bind(queue='queue1', exchange='fanout_ex')
queue_bind(queue='queue2', exchange='fanout_ex')

# Topic Exchange - 通配符匹配
exchange_declare(exchange='topic_ex', type='topic')
queue_bind(queue='queue1', exchange='topic_ex', routing_key='order.*')
queue_bind(queue='queue2', exchange='topic_ex', routing_key='order.created.*')

# Headers Exchange - 属性匹配
exchange_declare(exchange='headers_ex', type='headers')
queue_bind(queue='queue1', exchange='headers_ex', 
           arguments={'x-match': 'all', 'format': 'json', 'type': 'order'})
```

**死信队列**：
```python
# 配置死信队列
args = {
    'x-dead-letter-exchange': 'dlx_exchange',
    'x-dead-letter-routing-key': 'dlx_queue',
    'x-message-ttl': 86400000  # 24小时过期
}

queue_declare(queue='main_queue', durable=True, arguments=args)

# 死信消费者
@async_worker.subscribe(queue='dlx_queue')
async def handle_dead_letter(message):
    # 分析死信原因
    reason = message.headers.get('x-death')
    original_msg = message.body
    await process_failure(original_msg, reason)
```

---

## 六、实战案例

### 17. 设计 Twitter Feed

**需求分析**：
- 读取：用户首页展示，关注用户的推文流
- 写入：发布推文，推送给所有关注者
- 规模：3亿用户，每天5亿推文

**推特方案**：
```
用户发布推文：
┌─────────┐    ┌──────────┐    ┌──────────┐
│ Post    │───▶│ 写入     │───▶│ Fanout   │
│ Tweet   │    │ Timeline │    │ Service  │──▶ 推送至 1000 个粉丝的 Timeline
└─────────┘    └──────────┘    └──────────┘

用户读取 Feed：
┌─────────┐    ┌──────────┐    ┌──────────────┐
│ Request │───▶│ Merge    │◀──▶│ Timeline     │
│ Feed    │    │ Service  │    │ Cache        │
└─────────┘    └──────────┘    └──────────────┘
```

**混合方案**：
- 普通用户（少量粉丝）：Fanout-on-Write
- VIP 用户（百万粉丝）：Fanout-on-Read + Pull
- 缓存策略：Timeline 缓存 7 天

---

### 18. 设计 URL Shortener

**核心 API**：
```
POST /shorten
Request: { "url": "https://example.com/very/long/url" }
Response: { "short_url": "http://short.ly/abc123" }

GET /{short_code}
Response: Redirect to original URL
```

**存储设计**：
```python
# 哈希编码
def encode_url(url, hash_func=hashlib.md5):
    hash_value = hash_func(url.encode()).hexdigest()[:8]
    return base62_encode(int(hash_value, 16))

def base62_encode(num):
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    result = []
    while num > 0:
        result.append(chars[num % 62])
        num //= 62
    return ''.join(reversed(result)) or chars[0]
```

**扩展问题**：
| 问题 | 解决方案 |
|------|----------|
| 哈希冲突 | 冲突后添加后缀 |
| 顺序预测 | 随机编码，不用自增 |
| 热点 URL | 多级缓存 |
| 高写入 | 分库分表 |
| 数据持久化 | 定期快照 + WAL |

---

### 19. 设计 Chat System

**消息流**：
```
用户 A 发送消息：
┌──────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐
│Client│───▶│ WebSocket│───▶│ Chat    │───▶│ Message  │
│   A  │    │ Gateway  │    │ Service │    │  Store   │
└──────┘    └──────────┘    └─────────┘    └──────────┘
                                        │
                                        ▼
                                    ┌─────────┐
                                    │ Fanout │
                                    │ Service│───▶ 用户 B 在线 → 推送
                                    └─────────┘
                                                      │
                                                      ▼
                                                 用户 B 离线 → 消息队列 → 离线推送

```

**消息同步**：
```python
class MessageSync:
    async def sync_to_device(self, user_id, device_id, cursor):
        # 获取离线消息
        messages = await db.get_messages_since(user_id, cursor)
        
        # 按设备分发
        for msg in messages:
            await push_to_device(device_id, msg)
        
        # 返回新的 cursor
        return messages[-1].id if messages else cursor
```

---

### 20. 设计 Rate Limiter

**滑动窗口算法**：
```python
import time
from collections import deque

class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = deque()  # [(timestamp, count), ...]
    
    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds
        
        # 清理过期的请求
        while self.requests and self.requests[0][0] < window_start:
            self.requests.popleft()
        
        # 检查限制
        total_requests = sum(count for _, count in self.requests)
        
        if total_requests < self.max_requests:
            self.requests.append((now, 1))
            return True
        
        return False
```

**分布式限流**：
```python
# Redis + Lua 实现
LUA_SCRIPT = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('GET', key)

if current and tonumber(current) >= limit then
    return 0
end

local count = redis.call('INCR', key)
if count == 1 then
    redis.call('EXPIRE', key, window)
end

if count > limit then
    return 0
end

return 1
"""

async def is_allowed(redis, key, limit, window):
    result = await redis.eval(LUA_SCRIPT, 1, key, limit, window)
    return result == 1
```

---

**标签**：#system-design-primer #系统设计 #cap #缓存 #消息队列
**状态**：20/20 份详细内容
