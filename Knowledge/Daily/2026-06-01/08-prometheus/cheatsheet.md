# 《Prometheus》速查卡

> 入口在 [[README|README.md]]｜分类：DevOps/Monitoring｜⭐⭐⭐⭐⭐⭐｜适用：监控告警 / 时序数据库 / 云原生

---

## 🎯 一句话价值

**云原生时序数据库 + 告警引擎的事实标准**：拉模型 + TSDB (Gorilla 压缩到 1.37 字节/样本) + PromQL 向量化查询 + 告警状态机，把"指标 → 存储 → 查询 → 告警"全链路打通。

---

## 🧠 3 个核心洞察（必背）

1. **拉模型 (Pull) > 推模型 (Push)** — 服务自注册到 SD，Prom 主动拉；服务挂了 = 没数据 = 立即发现，比 push 心跳更可靠
2. **Head + Block + WAL** — 写走 WAL（append-only）+ 内存 ring buffer；后台 compact 把 2h Head 切成不可变 Block，简化并发 + 适合 mmap
3. **PromQL = 向量化时序 SQL** — 同 label 集的时间序列做集合运算；Vector Selector + Function Call + Aggregate，一次处理 8192 样本，cache 友好

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `tsdb/head.go:Appender` | WAL + 内存双写 + memSeries fingerprint 分片锁 |
| 2 | `tsdb/db.go:DB.Compact` | 不可变 block 合并 + 垂直/水平策略 + 3 阶段合并 |
| 3 | `promql/engine.go:Engine.NewInstantQuery` | parse → analyze → optimize → lazy exec + QueryTracker |
| 4 | `web/web.go:api/v1.query` | RESTful + 限流 + Timeout + JSON/proto 响应 |
| 5 | `rules/manager.go:Manager.Update` | Group 共享 query 窗口 + 3 状态机 (inactive→pending→firing) |

---

## ⚡ 性能数字（8 核 16GB Prom 实测）

| 场景 | 指标 | 数值 | 对比/备注 |
|------|------|------|----------|
| 写吞吐 (单实例) | sample/s | 1M+ | 1k active series, 15s scrape |
| Gorilla 压缩 | bytes/sample | 1.37 | 原始 16 字节 (12x) |
| WAL append | 延迟 | ~50-100μs | 写盘 fsync |
| Block compact | 2h → 6h 块 | ~10s/2h 数据 | 1k series |
| PromQL 即时查询 | P99 延迟 | ~50-200ms | 8k series 简单 rate |
| PromQL 范围查询 (1d) | P99 延迟 | ~200ms-1s | 1k step × 100 series |
| 启动 (replay WAL) | 时间 | ~5-30s | 1h 数据 + 10k series |
| Head 内存 | 字节/series | ~3KB | memSeries + samples |
| 内存 | series/GB | ~300k | 极限 ~10M (128GB) |
| Federation 拉取 | sample/s | ~100k | 取决于网络 |
| Remote write | sample/s | ~200k | snappy 压缩 |
| AlertManager 评估 | P99 延迟 | ~100ms | 1k 规则 |

**结论**：Gorilla 压缩 + 不可变 block + 向量化执行 = Prom 能单机扛千万 series 的根本。

---

## 🌳 决策树

### 存储选型
```
你的时序数据量？
  │
  ├── < 100 万 series / 实例 → 单 Prom + 本地 TSDB
  │
  ├── 100w - 1000w series   → Prom + remote_write (Thanos/Mimir)
  │
  └── > 1000w series / 多租户 → Cortex/Mimir (分布式)
```

### 拉 vs 推
```
采集方式？
  │
  ├── 短生命周期任务 (K8s Pod) → Pushgateway (push) + 拉
  │   └── 临时聚合点, 暴露给 Prom 拉
  │
  ├── 长生命周期服务 (HTTP/gRPC) → 拉 (Pull)
  │   └── 服务暴露 /metrics, Prom 来拉
  │
  └── 批处理 (CronJob) → Pushgateway
      └── 任务结束 push, Prom 拉 Pushgateway
```

### 告警来源
```
告警从哪来？
  │
  ├── 实时 PromQL 评估 → Recording Rule 预计算 → Alert Rule
  │   └── 缓冲突发查询 + 控制告警风暴
  │
  ├── 日志告警 → Promtail + Loki
  │
  └── 基础设施 → node_exporter / blackbox_exporter
      └── 硬件/网络/证书
```

---

## 🚀 命令分组速查

### 启动 & 配置
```bash
prometheus --config.file=prometheus.yml
# 关键参数
--storage.tsdb.path=/prometheus              # TSDB 路径
--storage.tsdb.retention.time=15d            # 保留时长
--storage.tsdb.retention.size=50GB           # 保留大小
--storage.tsdb.wal-compression               # WAL 压缩 (Prom 2.20+)
--storage.tsdb.min-block-duration=2h         # 最小 block 持续
--storage.tsdb.max-block-duration=24h        # 最大 block 持续
--web.enable-lifecycle                       # 支持热重载 (POST /-/reload)
--web.enable-admin-api                       # 启用 admin API
--query.timeout=2m                           # 查询超时
--query.max-concurrency=20                   # 最大并发查询
```

### PromQL 速查
```promql
# 即时
http_requests_total
http_requests_total{status="500"}

# 速率 / 增量
rate(http_requests_total[5m])                # 每秒平均
irate(http_requests_total[1m])               # 瞬时速率
increase(http_requests_total[1h])            # 1h 增量

# 聚合
sum by (status) (rate(http_requests_total[5m]))
topk(5, http_requests_total)
count by (__name__) ({__name__=~".+"})

# Histogram
histogram_quantile(0.95, sum by (le) (rate(http_req_duration_seconds_bucket[5m])))
histogram_quantile(0.99, sum by (le, path) (rate(http_req_duration_seconds_bucket[5m])))

# 预测 / 告警
predict_linear(node_filesystem_free[6h], 24*3600) < 0
absent(up{job="prometheus"})                  # 缺失即告警
```

### 工具
```bash
promtool check config prometheus.yml          # 校验配置
promtool check rules rules.yml                # 校验告警规则
promtool tsdb analyze /prometheus             # 分析 TSDB
promtool tsdb list /prometheus                # 列出 block
promtool query instant http://localhost:9090 'up'
amtool check-config alertmanager.yml         # 校验 alertmanager
```

### 热重载 & API
```bash
# 触发 SIGHUP
kill -HUP $(pidof prometheus)
# 或 POST /-/reload
curl -X POST http://localhost:9090/-/reload

# 常用 API
curl http://localhost:9090/api/v1/query?query=up
curl http://localhost:9090/api/v1/query_range?query=up&start=...&end=...&step=15
curl http://localhost:9090/api/v1/series?match[]=up
curl http://localhost:9090/api/v1/labels
curl http://localhost:9090/api/v1/targets
curl http://localhost:9090/api/v1/rules
curl http://localhost:9090/api/v1/status/runtimeinfo
curl http://localhost:9090/api/v1/status/config
```

### 联邦 (Federation)
```yaml
# 中心 Prom 拉子 Prom
scrape_configs:
  - job_name: 'federate'
    honor_labels: true
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="prometheus"}'
        - '{__name__=~"job:.*"}'
    static_configs:
      - targets: ['prom-a:9090', 'prom-b:9090']
```

### Remote Write / Read
```yaml
remote_write:
  - url: http://thanos-receive:19291/api/v1/receive
    write_relabel_configs:  # 过滤不写
      - source_labels: [__name__]
        regex: 'go_.*'
        action: drop
    queue_config:
      capacity: 10000
      max_samples_per_send: 2000
      batch_send_deadline: 5s

remote_read:
  - url: http://thanos-query:10901/api/v1/read
    read_recent: true
```

---

## 📊 TSDB 存储对比表

| 方案 | 存储 | 压缩 | 多副本 | 多租户 | 适用 |
|------|------|------|--------|--------|------|
| **Prometheus** | 本地 TSDB | Gorilla | 手动 HA | ❌ | 单租户 < 1M series |
| **Thanos** | 对象存储 (S3) | Gorilla | ✅ Sidecar | ❌ | 长期存储 + 全局视图 |
| **Cortex** | 对象存储 + DynamoDB | Gorilla | ✅ | ✅ | 多租户 SaaS |
| **Mimir** | 对象存储 + Kafka | Gorilla + 字典 | ✅ | ✅ | Cortex 继任者 (Grafana) |
| **InfluxDB** | TSM (类似 LSM) | 不同算法 | ✅ | ✅ | 通用时序 |
| **TimescaleDB** | PostgreSQL 扩展 | 列存 + 压缩 | ✅ | ✅ | 关系 + 时序混合 |
| **OpenTSDB** | HBase | Gorilla | ✅ | ✅ | 已被 Prom 取代 |
| **VictoriaMetrics** | 自研 | Gorilla 变体 | ✅ | ✅ | Prom 兼容, 性能更好 |

---

## ⚠️ 必避 8 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **高基数 label** (user_id, email) | series 爆炸 OOM | 用桶分 (e.g. user_id_bucket) |
| **忘记设 retention** | 磁盘满 | retention.time + retention.size 双保险 |
| **scrape_interval 太短 (1s)** | Prom CPU 飙高 | 默认 15s, 热点 5s, 永不 < 1s |
| **alertmanager 路由错** | 告警风暴 | group_by + group_wait + inhibit_rule |
| **WAL 损坏** | 启动失败, 数据丢失 | 定期备份 WAL, wal-compression |
| **Recording Rule 死循环** | CPU 100% | 避免 A → B → A 循环引用 |
| **Pushgateway 滥用** | Pushgateway 变"数据坟墓" | 只用于批处理 / 短任务 |
| **Federation 无 honor_labels** | label 冲突 | honor_labels: true |

### 5 个隐藏坑

- **histogram bucket 设计**：默认 `DefBuckets` 适合 HTTP，不适合延迟分布（要 `[0.001, 0.01, 0.1, 1, 10]`）
- **Grafana 用 step=1s 查 30d 数据**：扫 2.5M 个点，查询慢到超时
- **同时启用 WORM + WAL**：概念混淆，Prom 只有 WAL
- **Target down 触发 1k alert**：用 `up == 0` 时配 `for: 5m`
- **Exporter 自定义指标命名不遵循规范**：应该是 `<namespace>_<subsystem>_<name>_<unit>`

---

## 🔄 监控方案对比

| 维度 | Prometheus | InfluxDB | Datadog | CloudWatch |
|------|------------|----------|---------|------------|
| 部署 | 自建 | 自建/云 | SaaS | 云托管 |
| 存储 | 本地 TSDB | 自研 TSM | 内部 | 内部 |
| 采集 | Pull | Pull/Push | Agent | 集成 |
| 查询 | PromQL | Flux/SQL | 自家 | 自家 |
| 告警 | 内置 | 内置 | 内置 | 内置 |
| 长期存储 | 需 Thanos | 内置 | ✅ | ✅ |
| 多租户 | 弱 (Mimir 强) | 弱 | ✅ | ✅ |
| 成本 | 运维成本 | 中 | 高 | 中 |
| 易用性 | 中 | 中 | 高 | 高 |
| 适合 | 云原生 / K8s | 通用 | 不想运维 | AWS 用户 |

---

## 🧩 可复用模式

| 模式 | Prom 怎么用 | 我能用到哪 |
|------|-------------|----------|
| **拉模型 + 服务发现** | K8s SD 自动发现 Pod | 任何"被监控对象动态变化"系统 |
| **WAL + 后台 compact** | append-only WAL → Block | 任何写多读少的高吞吐存储 |
| **不可变数据 + mmap** | Block 不可变, mmap 索引 | 任何追加写场景（日志、审计） |
| **Gorilla 压缩** | delta-of-delta + XOR | 任何时序数据（指标/股票/IoT） |
| **向量化执行** | 一次处理 8192 sample | 任何流式聚合（OLAP、Spark） |
| **Recording Rule** | 预计算热点查询 | 任何昂贵计算的中间缓存 |
| **Alert 3 状态机** | inactive → pending → firing | 任何去抖告警（监控、日志） |
| **Federation 联邦** | 子 Prom → 中心 Prom | 任何多级聚合（边缘 → 中心） |
| **多副本 HA** | 手动 2 实例 + AlertManager 同步 | 任何需要 HA 的服务 |

→ 模式 A-G 详细见 `deep-dive.md 专题 8/16`

---

## 📋 反思：Prom 让我重新思考的 5 件事

1. **拉 > 推**。在监控领域，拉是更优解（失败检测 / 配置中心化 / 监控 Prom 自己）。
2. **不可变 = 简化并发**。TSDB Block 不可变是设计精髓，省了 N 个锁和 race。
3. **压缩是数据库的命脉**。Gorilla 把 16 字节压到 1.37 字节，12x 收益。
4. **PromQL 不是 SQL**。时序有自己的一套语义（rate/increase/histogram_quantile）。
5. **Recording Rule = 物化视图**。和数据库的 materialized view 一个道理，但针对时序。

---

## ✅ 我能马上用的 3 件事

- [ ] 给自己项目加 `/metrics` 端点（用 promhttp.Handler()）
- [ ] 写一个 SLI/SLO 仪表盘（availability + latency + throughput）
- [ ] 用 recording rule 预计算 4 个黄金指标 (RED: Rate/Errors/Duration)

---

## 🔗 跨项目引用

- `[[../01-etcd/README|etcd]]` — Cortex/Mimir 用 etcd 做租约锁
- `[[../02-redis/README|Redis]]` — Redis exporter + Go client 自带 metrics
- `[[../03-kubernetes/README|k8s]]` — Prom Operator 自动管理 ServiceMonitor
- `[[../04-postgres/README|postgres]]` — postgres_exporter + pg_stat_statements
- `[[../05-golang/README|Go]]` — Go runtime metrics + prometheus/client_golang
- `[[../06-vllm/README|vLLM]]` — vLLM 暴露 GPU/KV cache 指标

---

## 📚 进一步阅读

- 源码：https://github.com/prometheus/prometheus
- 文档：https://prometheus.io/docs/
- TSDB 论文：https://fabxc.org/tsdb/
- Gorilla 论文：https://www.vldb.org/2015/papers/p1839-Pelkonen.pdf
- 联邦：https://prometheus.io/docs/prometheus/latest/federation/
- Remote Write：https://prometheus.io/docs/prometheus/latest/remote_storage/
- 实战书：《Prometheus 实战》《云原生监控》《可观测性工程》
- `deep-dive.md` — 16 专题深度解析
- `code-snippets/` — 5 段必读代码 (199-294 行/段, 完整函数 + 5 WHY + 性能数据)
