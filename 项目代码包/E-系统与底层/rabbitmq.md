---
title: RabbitMQ
tags: [消息队列, AMQP, 企业级, 路由, 微服务]
---

# RabbitMQ

## 前言

**定位**：开源消息代理服务器，2007 年由 Rabbit Technologies 发布（现属 VMware/Broadcom）至今是 AMQP 协议的事实标准，企业级业务消息队列首选，遵循 Erlang/OTP 平台。

**核心价值**：
- AMQP 0-9-1 协议标准：跨语言、跨平台互操作
- 丰富路由：Direct/Topic/Fanout/Headers 多种 Exchange
- 可靠性：发布确认、持久化、死信队列
- 集群与镜像：原生支持高可用

**五大特性**：
1. **Exchange 路由**：4 种类型 + 自定义路由规则
2. **可靠性**：Publisher Confirm + Consumer Ack + 持久化
3. **死信队列（DLX）**：处理失败消息
4. **集群**：原生集群 + 镜像队列
5. **管理界面**：内置 Web UI，REST API

**对比表**：

| 维度 | RabbitMQ | Kafka | Redis Pub/Sub | ActiveMQ | RocketMQ |
|---|---|---|---|---|---|
| 协议 | AMQP | 自定义 | Redis | AMQP/STOMP | 自定义 |
| 路由 | 极丰富 | 简单 | 简单 | 中等 | 中等 |
| 延迟 | μs 级 | ms 级 | μs 级 | ms 级 | ms 级 |
| 持久化 | ✅ | ✅ | ❌ | ✅ | ✅ |
| 消息回溯 | ❌ | ✅ | ❌ | ⚠️ | ⚠️ |
| 适合 | 业务消息 | 大数据流 | 轻量广播 | 老牌 | 阿里系 |

## 思维导图

```mermaid
mindmap
  root((RabbitMQ))
    核心
      Broker
      Exchange
      Queue
      Binding
      Message
    Exchange
      Direct
        routing key
      Topic
        通配符
      Fanout
        广播
      Headers
        属性
    Queue
      经典
      仲裁
      流
    可靠性
      持久化
      确认
        publisher
        consumer
      事务
      死信
        DLX
    集群
      普通
      镜像
      Federation
    协议
      AMQP 0-9-1
      MQTT
      STOMP
    工具
      Management UI
      CLI
      监控
    应用场景
      微服务
      异步任务
      RPC
      削峰
      通知
```

## 关键代码

### 一、基础操作

```bash
# 启动
rabbitmq-server                    # 前台
rabbitmq-server -detached          # 后台
systemctl start rabbitmq-server

# 查看状态
rabbitmqctl status
rabbitmqctl cluster_status

# 用户管理
rabbitmqctl add_user alice secret
rabbitmqctl set_user_tags alice administrator
rabbitmqctl set_permissions -p / alice ".*" ".*" ".*"

# 启用管理插件
rabbitmq-plugins enable rabbitmq_management
# Web UI: http://localhost:15672
# 默认 guest:guest 只能 localhost 登录
```

### 二、Node.js (amqplib)

```javascript
const amqp = require('amqplib')

async function main() {
  const connection = await amqp.connect('amqp://alice:secret@localhost:5672')
  const channel = await connection.createChannel()

  // 声明队列
  await channel.assertQueue('task-queue', {
    durable: true,                  // 持久化
    arguments: {
      'x-message-ttl': 60000,       // 60s 后过期
      'x-max-priority': 10
    }
  })

  // 发布消息
  channel.sendToQueue('task-queue',
    Buffer.from(JSON.stringify({ task: 'send-email' })),
    {
      persistent: true,             // 持久化
      contentType: 'application/json',
      messageId: '1',
      timestamp: Date.now()
    }
  )

  // 消费消息
  channel.consume('task-queue', async (msg) => {
    if (msg) {
      const data = JSON.parse(msg.content.toString())
      console.log('Received:', data)

      // 业务处理
      try {
        await processTask(data)
        channel.ack(msg)            // 确认
      } catch (err) {
        channel.nack(msg, false, true)  // 重试
      }
    }
  })
}
```

### 三、Python (pika)

```python
import pika
import json

# 连接
connection = pika.BlockingConnection(
    pika.ConnectionParameters(
        host='localhost',
        credentials=pika.PlainCredentials('alice', 'secret')
    )
)
channel = connection.channel()

# 声明队列
channel.queue_declare(queue='task-queue', durable=True)

# 发布
channel.basic_publish(
    exchange='',
    routing_key='task-queue',
    body=json.dumps({'task': 'send-email'}),
    properties=pika.BasicProperties(
        delivery_mode=2,            # 持久化
        content_type='application/json',
        priority=5
    )
)

# 消费（手动 ack）
def callback(ch, method, properties, body):
    data = json.loads(body)
    print(f"Received: {data}")
    ch.basic_ack(delivery_tag=method.delivery_tag)

channel.basic_qos(prefetch_count=10)   # 限流
channel.basic_consume(queue='task-queue', on_message_callback=callback)

channel.start_consuming()
```

### 四、Exchange 路由

```javascript
// Direct Exchange（精确匹配）
await channel.assertExchange('direct-exchange', 'direct', { durable: true })
await channel.assertQueue('q.email', { durable: true })
await channel.assertQueue('q.sms', { durable: true })

await channel.bindQueue('q.email', 'direct-exchange', 'email')
await channel.bindQueue('q.sms', 'direct-exchange', 'sms')

channel.publish('direct-exchange', 'email', Buffer.from('email body'))
channel.publish('direct-exchange', 'sms', Buffer.from('sms body'))

// Topic Exchange（通配符）
await channel.assertExchange('topic-exchange', 'topic', { durable: true })
// * 匹配一个单词，# 匹配多个
await channel.bindQueue('q.weather', 'topic-exchange', 'weather.*')
await channel.bindQueue('q.weather.cn', 'topic-exchange', 'weather.cn.*')

channel.publish('topic-exchange', 'weather.cn.beijing',
  Buffer.from('北京天气'))
channel.publish('topic-exchange', 'weather.us.nyc',
  Buffer.from('NYC weather'))

// Fanout Exchange（广播）
await channel.assertExchange('fanout-exchange', 'fanout', { durable: true })
await channel.bindQueue('q.logs-1', 'fanout-exchange', '')
await channel.bindQueue('q.logs-2', 'fanout-exchange', '')

channel.publish('fanout-exchange', '', Buffer.from('system log'))
// q.logs-1 和 q.logs-2 都会收到
```

### 五、可靠性

```javascript
// Publisher Confirm（发布确认）
await channel.confirmSelect()

channel.publish('exchange', 'key', Buffer.from('msg'), { persistent: true })
channel.waitForConfirms()
  .then(() => console.log('All confirmed'))
  .catch(err => console.error('Failed:', err))

// Consumer Ack
channel.consume('queue', async (msg) => {
  try {
    await process(msg)
    channel.ack(msg)                  // 成功
  } catch (err) {
    if (msg.properties.headers['x-retry-count'] < 3) {
      // 重投
      channel.nack(msg, false, false)  // 不重回队列
      channel.sendToQueue('retry-queue', msg.content, {
        headers: { 'x-retry-count': msg.properties.headers['x-retry-count'] + 1 }
      })
    } else {
      channel.nack(msg, false, false)  // 进入死信
    }
  }
})

// 持久化
await channel.assertQueue('important', { durable: true })
channel.publish('exchange', 'key', Buffer.from('msg'), { persistent: true })
```

### 六、死信队列

```javascript
// 主队列配置死信
await channel.assertQueue('main-queue', {
  durable: true,
  arguments: {
    'x-dead-letter-exchange': 'dlx',
    'x-dead-letter-routing-key': 'dead',
    'x-message-ttl': 60000
  }
})

// 死信交换机和队列
await channel.assertExchange('dlx', 'direct', { durable: true })
await channel.assertQueue('dead-queue', { durable: true })
await channel.bindQueue('dead-queue', 'dlx', 'dead')

// 死信触发条件：
// 1. 消息被 reject/nack 且 requeue=false
// 2. 消息 TTL 过期
// 3. 队列长度超限
```

### 七、延迟队列

```javascript
// 方案 1：TTL + DLX
await channel.assertQueue('wait-queue', {
  durable: true,
  arguments: {
    'x-message-ttl': 30000,          // 30s
    'x-dead-letter-exchange': 'process-exchange',
    'x-dead-letter-routing-key': 'process'
  }
})
await channel.assertExchange('process-exchange', 'direct', { durable: true })
await channel.assertQueue('process-queue', { durable: true })
await channel.bindQueue('process-queue', 'process-exchange', 'process')

// 发布到 wait-queue，30s 后自动到 process-queue
channel.sendToQueue('wait-queue', Buffer.from('delayed msg'))

// 方案 2：rabbitmq-delayed-message-exchange 插件
// rabbitmq-plugins enable rabbitmq_delayed_message_exchange
await channel.assertExchange('delayed-exchange', 'x-delayed-message', {
  durable: true,
  arguments: { 'x-delayed-type': 'direct' }
})
channel.publish('delayed-exchange', 'key', Buffer.from('msg'), {
  headers: { 'x-delay': 30000 }     // 30s
})
```

### 八、集群

```bash
# 节点 1（作为种子）
rabbitmq-server -detached
rabbitmqctl stop_app
rabbitmqctl reset
rabbitmqctl start_app

# 节点 2 加入
rabbitmq-server -detached
rabbitmqctl stop_app
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app

# 节点 3 加入
rabbitmq-server -detached
rabbitmqctl stop_app
rabbitmqctl join_cluster rabbit@node1
rabbitmqctl start_app

# 集群状态
rabbitmqctl cluster_status

# 镜像队列（HA）
rabbitmqctl set_policy ha-all "^ha\." '{"ha-mode":"all","ha-sync-mode":"automatic"}'
```

### 九、Spring AMQP 集成

```java
// application.yml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: alice
    password: secret
    publisher-confirm-type: correlated
    publisher-returns: true
    listener:
      simple:
        acknowledge-mode: manual
        prefetch: 10
        retry:
          enabled: true
          max-attempts: 3
          initial-interval: 1000
```

```java
// 配置
@Configuration
public class RabbitConfig {
    @Bean
    public Queue taskQueue() {
        return QueueBuilder.durable("task-queue")
            .deadLetterExchange("dlx")
            .deadLetterRoutingKey("dead")
            .build();
    }

    @Bean
    public DirectExchange taskExchange() {
        return new DirectExchange("task-exchange");
    }

    @Bean
    public Binding taskBinding(Queue taskQueue, DirectExchange taskExchange) {
        return BindingBuilder.bind(taskQueue).to(taskExchange).with("task");
    }
}

// 生产者
@Service
public class TaskProducer {
    @Autowired
    private RabbitTemplate rabbitTemplate;

    public void send(Task task) {
        rabbitTemplate.convertAndSend("task-exchange", "task", task);
    }
}

// 消费者
@Component
public class TaskConsumer {
    @RabbitListener(queues = "task-queue")
    public void handle(Task task, Channel channel,
                       @Header(AmqpHeaders.DELIVERY_TAG) long tag) throws IOException {
        try {
            process(task);
            channel.basicAck(tag, false);
        } catch (Exception e) {
            channel.basicNack(tag, false, true);
        }
    }
}
```

### 十、监控

```bash
# 启用管理插件
rabbitmq-plugins enable rabbitmq_management
rabbitmq-plugins enable rabbitmq_prometheus

# Prometheus 指标
curl http://localhost:15692/metrics

# 关键指标
# rabbitmq_queue_messages_ready
# rabbitmq_queue_messages_unacknowledged
# rabbitmq_queue_consumers
# rabbitmq_channel_messages_published_total

# 告警规则（PromQL）
# 消息堆积：rabbitmq_queue_messages_ready > 10000
# 消费者掉线：rabbitmq_queue_consumers == 0
```

## 核心洞察

- **RabbitMQ 的 AMQP 是协议标准**：vs Kafka 自定义协议
- **RabbitMQ 的"Exchange 路由"是核心价值**：4 种类型 + 自定义灵活
- **RabbitMQ 的"消息确认"是可靠性的关键**：publisher confirm + consumer ack
- **RabbitMQ 的"死信队列"是失败处理的标准模式**：TTL + nack + 队列满
- **RabbitMQ 的"延迟队列"用 TTL+DLX 实现**：或用 delayed-message 插件
- **RabbitMQ 的"镜像队列"是 HA 方案**：所有节点同步复制
- **RabbitMQ 在 Erlang/OTP 上构建**：天生高并发、低延迟
- **RabbitMQ 的 Streams（3.9+）** 挑战 Kafka：可重放、持久化
- **RabbitMQ 的"限流"靠 prefetch**：消费者处理能力控制
- **RabbitMQ 的"优先级队列"**：高优先级消息先消费
- **RabbitMQ 的"管理界面"是亮点**：15672 端口的 Web UI
- **RabbitMQ 的"集群脑裂"问题**：网络分区时需要 careful 策略

## 跨项目引用

- **[[linux]]**：RabbitMQ 跑在 Linux 上
- **[[docker]]**：RabbitMQ 官方 Docker 镜像
- **[[kubernetes]]**：K8s 上部署 RabbitMQ Cluster Operator
- **[[kafka]]**：Kafka 是 RabbitMQ 的"流式"竞品
- **[[redis]]**：Redis Stream 是轻量替代
- **[[postgresql]]** / **[[mysql]]**：用 Debezium CDC 到 RabbitMQ
- **[[spring boot]]**：Spring AMQP 是 Java 集成首选
- **[[celery]]**：Python Celery 用 RabbitMQ 做 broker
- **[[bull]]**：Node.js Bull/BullMQ 用 RabbitMQ/Redis
- **[[prometheus]]** + **[[rabbitmq_exporter]]**：RabbitMQ 监控
- **[[amqp]]**：AMQP 协议标准
- **[[nats]]**：NATS 是新一代云原生消息系统
