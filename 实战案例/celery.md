# celery - Python 分布式任务队列，消息中间件 + 异步 RPC + Canvas 工作流

**GitHub**: celery/celery
**Star**: 26k+
**语言**: Python
**主题**: distributed-task-queue/python/消息中间件/任务调度/异步 RPC
**适用场景**: Python Web 后端（Django/Flask/FastAPI）异步任务、AI 推理异步化、数据管道、SaaS 后台任务

## 第一段：基础范式

### 模式 1：协议抽象外包给 Kombu（Producer/Consumer/Exchange/Queue 四件套）

**问题场景**：消息中间件演进太快，RabbitMQ/Redis/SQS/Kafka 各自一套 API。
**解决方案**：Kombu 把差异收敛成 Producer/Consumer/Exchange/Queue 四件套，Celery 自身只关心"消息结构与回调"，通过 app.amqp.AMQP 胶水层对接。
**关键参数**：
- Kombu 统一 AMQP/Redis/SQS
- app.amqp.AMQP 是胶水层
- Celery 不直接碰 broker 协议
- 切换 broker 零代码改动
**最佳实践**：把"易变层"（协议）外包给专门库，自己只做稳定业务逻辑。

### 模式 2：AsynPool 替代 multiprocessing.Pool

**问题场景**：原生 multiprocessing.Pool 在 GIL 释放瞬间因主线程 block 让子进程拿不到任务；同步 IO 不支持 eventlet/gevent。
**解决方案**：自研 AsynPool（基于 billiard fork 过的 multiprocessing），用 select.poll + 共享 fd + inbox/outbox 协议，父进程无锁分发任务。
**关键参数**：
- asynpool.py 1387 行
- poll + 共享 fd 零拷贝
- inbox/outbox 协议
- 比原生 pool 性能翻倍
- 含 _billiard C 扩展
**最佳实践**：标准库不够用时 fork 一份定制；性能瓶颈要敢于自研。

### 模式 3：PendingConfiguration 双阶段初始化

**问题场景**：Python 装饰器 import-time 求值，无法保证先 config_from_object 还是先 from mytasks import *。
**解决方案**：所有 @app.task 装饰器写入延迟到 finalize()，装饰器调用只入 deque 暂存，finalize() 时批量 apply。
**关键参数**：
- app.config_from_object 之前/之后顺序无关
- deque 暂存所有配置写入
- finalize() 统一 apply
- AttributeDictMixin 代理对象
**最佳实践**：装饰器模式必须用"双阶段"解决 import 顺序问题。

### 模式 4：Canvas 描述符（chain/group/chord/signature）

**问题场景**：分布式任务如何组合成有向无环图？
**解决方案**：Signature 是不可变 RPC 描述符，chain/group/chord 把多个 Signature 复合成 DAG，靠 chord_unlock 任务自动回调。
**关键参数**：
- canvas.py 2443 行
- chain/group/chord/chunks/signature 五种原语
- Signature 不可变
- chord_unlock 自动 callback
- 可序列化跨进程
**最佳实践**：用"不可变描述符"建模 RPC；可序列化是分布式的前提。

### 模式 5：信号总线（30+ Signal 全局 Observer）

**问题场景**：用户/中间件/可观测平台如何零侵入插入生命周期？
**解决方案**：celery/signals.py 155 行定义 30+ Signal，覆盖 task/worker/lifecycle，dispatcher 是 Observer 模式实现。
**关键参数**：
- 30+ 信号覆盖全生命周期
- task_prerun/task_postrun/task_success/task_failure
- worker_init/shutdown、heartbeat_sent
- 用户/中间件零侵入
- blinker 风格
**最佳实践**：用 Observer 信号总线代替"回调链"；可观测性是平台级能力。

## 第二段：扩展范式

### 模式 6：35+ Result Backend 适配器

**问题场景**：任务结果要存哪里？Redis/DB/S3/Cassandra/MongoDB/ElasticSearch/CosmosDB/Consul/ArangoDB？
**解决方案**：celery/backends/ 下 35+ 适配器，统一接口 BaseBackend，每种后端实现 store/load/expire。
**关键参数**：
- backends/ 35+ 文件
- 统一 BaseBackend 接口
- requirements/ 可选 extras 按需安装
- 一致序列化协议
- 任务结果可存任何地方
**最佳实践**：把"存储后端"做成可插拔适配器；不要硬编码到 Redis。

### 模式 7：Bootstep 启动管线（DAG 抽象）

**问题场景**：Worker 启动要按什么顺序初始化？哪个阶段先 / 后？
**解决方案**：celery/bootsteps.py 416 行实现启动图（DAG）抽象，每个 Bootstep 有 start/stop/stop_after/requires 字段。
**关键参数**：
- DAG 而非线性启动
- start/stop/stop_after/requires
- 装配 blueprint 到 WorkController
- 单元可独立测试
- 启动失败按 DAG 倒序清理
**最佳实践**：用 DAG 描述启动顺序；倒序清理是失败时的不变量。

### 模式 8：Celery 5 套并发后端（prefork/eventlet/gevent/solo/thread）

**问题场景**：CPU 密集 vs IO 密集 vs 协程 vs 同步，如何选并发？
**解决方案**：celery/concurrency/ 下 5 套实现，统一接口 BasePool，每种用不同并发模型。
**关键参数**：
- prefork: 多进程 + 共享 fd
- eventlet/gevent: 协程
- solo: 单进程（调试）
- thread: 多线程
- -P 参数切换
**最佳实践**：并发模型要"可插拔"；用户按场景选而不是被锁死。

### 模式 9：Beat 调度器（cron-like 定时）

**问题场景**：定时任务如何不依赖外部 cron？
**解决方案**：celery/beat.py 内置调度器，读 beat_schedule 配置，按 schedule 触发 send_task。
**关键参数**：
- schedules.py schedule/crontab/solar/timedelta
- beat_schedule 配置
- 启动时加载 + 周期 tick
- 分布式锁保证单 Beat 实例
- schedule entry 模型
**最佳实践**：库内嵌调度器减少外部依赖；分布式锁防重复执行。

### 模式 10：Control Pidbox 远程控制

**问题场景**：如何在不重启 worker 的情况下动态调整并发数 / 限流？
**解决方案**：Control Pidbox 通过专用队列 broadcast 远程命令（rate_limit/autoscale/revoke/ping/stats），worker 收到执行。
**关键参数**：
- 专用 queue
- broadcast 模式
- rate_limit/revoke/stats 命令
- 不需要重启 worker
- celery control 命令
**最佳实践**：远程控制 = 专用队列 + broadcast；动态调参必备。

## 第三段：进阶范式

### 模式 11：序列化协议（pickle/json/yaml/msgpack）

**问题场景**：任务参数如何安全跨进程序列化？
**解决方案**：utils/serialization.py 支持 4 种协议，register 后切换，pickle 支持自定义编码器。
**关键参数**：
- 4 种协议：pickle/json/yaml/msgpack
- register 机制
- content_type / content_encoding
- 反序列化安全边界
- 自定义 encoder
**最佳实践**：序列化协议可注册；别只支持 JSON，否则复杂对象失败。

### 模式 12：billiard C 扩展 + 跨平台调试

**问题场景**：multiprocessing 跨平台不一致（Windows 不支持 fork）？
**解决方案**：billiard fork 过的 multiprocessing 加 Windows 兼容 + C 扩展加速，asynpool.py 1387 行是其核心实现。
**关键参数**：
- billiard 是 Celery 维护的 multiprocessing fork
- Windows 兼容（spawn 而非 fork）
- C 扩展加速
- 跨平台一致 API
- 调试成本高
**最佳实践**：fork 标准库解决"平台差异"；接受维护成本。

### 模式 13：安全加固（SSL + 序列化白名单）

**问题场景**：任务反序列化被攻击？AMQP 通信被窃听？
**解决方案**：celery/security/ 实现 SSL + 序列化白名单，只允许注册过的类型被反序列化。
**关键参数**：
- SSL 加密 broker 通信
- serializer 接受类型白名单
- registry 验证
- 防 RCE 攻击
- security/ 完整模块
**最佳实践**：反序列化是高危操作；白名单比黑名单安全 10 倍。

### 模式 14：5.6 recovery 机制（acks_late + visibility timeout）

**问题场景**：worker 崩溃后任务丢失？长时间运行任务被重复消费？
**解决方案**：acks_late 模式让任务 ack 推迟到执行完成 + visibility timeout 防重复消费，5.6 重点强化。
**关键参数**：
- acks_late=True 延迟 ack
- visibility timeout 防止中途崩溃被重新投递
- task_reject_on_worker_lost 配置
- recovery 5.6 重点
- 与 Quorum 队列配合
**最佳实践**：ack 时机 = 任务完成时；visibility timeout 防"重复消费"。

### 模式 15：Helm Chart + Docker 部署模板

**问题场景**：Celery worker/beat 在 K8s 怎么部署？
**解决方案**：helm-chart/ 提供 worker/beat/flower 三套 Chart，docker/ 提供官方 Dockerfile + docker-compose.yml。
**关键参数**：
- helm-chart/ 三套 Chart
- Docker 镜像
- docker-compose.yml 本地起
- K8s deployment + service
- 3 个角色：worker/beat/flower
**最佳实践**：库作者要发 helm chart；降低用户部署门槛。

## 第四段：实战范式

### 模式 16：t/unit + t/integration + t/smoke 三层测试

**问题场景**：分布式系统测试怎么组织？
**解决方案**：tests 分三层——t/unit（无 IO 单元）+ t/integration（用真 broker/backend）+ t/smoke（端到端冒烟）。
**关键参数**：
- 三层测试金字塔
- t/unit 快（无 IO）
- t/integration 慢（真 Redis/RabbitMQ）
- t/smoke 端到端
- pytest 驱动
- GitHub Actions 跑全套
**最佳实践**：分布式系统测试必须分层；纯单元测试覆盖不到集成 bug。

### 模式 17：configuration_from_object + Namespace 配置树

**问题场景**：Celery 配置 100+ 项，如何管理？
**解决方案**：app.config_from_object 加载 Python 配置，defaults.py 用几十个 Namespace 组成树形默认，broker_url/result_backend 是入口。
**关键参数**：
- defaults.py 嵌套 Namespace
- broker_url / result_backend 入口
- task_acks_late / task_reject_on_worker_lost 等
- conf.update 运行时改
- conf[key] 代理对象
**最佳实践**：用 Namespace 树形组织配置；新配置项有"位置感"。

### 模式 18：errback/rollback/retry 任务回调链

**问题场景**：任务失败如何自动重试？业务如何注入错误处理？
**解决方案**：@app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True) + on_failure/on_success/on_retry 钩子。
**关键参数**：
- autoretry_for 异常类型白名单
- retry_backoff 指数退避
- retry_kwargs 限制次数
- errback 错误回调
- on_failure 钩子
**最佳实践**：重试是任务级关注点；用装饰器参数声明而不是写在函数体里。

### 模式 19：Flower 监控面板 + Prometheus exporter

**问题场景**：worker 队列长度 / 任务执行时长 / 失败率如何可视化？
**解决方案**：Flower 是 Celery 官方 Web 监控，配合 prometheus_client 输出 metrics。
**关键参数**：
- Flower Web UI
- 实时任务/worker 状态
- Prometheus 指标
- celery_exporter
- 告警阈值
**最佳实践**：库作者要发监控工具；可观测性是生产级必备。

### 模式 20：5.6 migration 工具链（kombu/celery version 检测）

**问题场景**：Celery 升级时如何检测老配置不兼容？
**解决方案**：celery upgrade 命令检查 broker 兼容性 + 配置迁移脚本 + deprecation 警告。
**关键参数**：
- celery upgrade 子命令
- broker 兼容性检查
- 配置 deprecation 警告
- 5.5→5.6 迁移指南
- 旧 config 自动替换
**最佳实践**：库要发"升级工具"；不要只让用户看 changelog。

## 关键代码段

```python
# celery/app/base.py — Celery 门面
class Celery:
    def __init__(self, main=None, loader=None, backend=None,
                 amqp=None, events=None, fixups=None, config=None,
                 autodiscover_tasks=None, namespace=None):
        self._pending = deque()  # PendingConfiguration
        self.tasks = self._tasks = self._register_task_map()

    def task(self, *args, **opts):
        # 装饰器：写入 _pending，finalize() 时统一 apply
        def inner_create_task_cls(shared_last=True):
            ...
        return inner_create_task_cls

# celery/canvas.py — Signature 不可变
class Signature(Dict):
    def __or__(self, other):
        # chain 语法糖：t1 | t2 = chain(t1, t2)
        return chain(self, other)
```

## 必偷 3 件

1. **协议层完全外包给 Kombu**：把 AMQP/Redis/SQS 的差异收敛在一个依赖，自身只关心消息结构与回调。
2. **AsynPool 替代 multiprocessing.Pool**：用 select.poll + 共享 fd 把"投递任务"做成零拷贝+非阻塞。
3. **PendingConfiguration 双阶段初始化**：所有 @app.task 装饰器写入延迟到 finalize()，保证 import 顺序无关。

## 必避 3 坑

1. **不要用 `multiprocessing.Pool`**：GIL 释放瞬间主线程 block，子进程拿不到任务。
2. **不要在装饰器里立刻 `app.conf.update`**：Python 装饰器 import-time 求值，配置可能还没加载。
3. **不要用 pickle 反序列化不可信数据**：RCE 风险，5.x 默认白名单只接受基础类型。
