# Prometheus 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：时序数据库设计要点

### 时序数据的特征
- **写多读少**：99% 是写
- **时间戳有序**：append-only
- **最近热老冷**：1 周内查的多, 1 月后查的少
- **高基数风险**：labels 组合爆炸 (e.g. user_id)

### 设计原则
1. **按时间分块**：每块 2h, 旧块只读
2. **稀疏索引**：labels → series dict, 快速查
3. **压缩算法**：Gorilla (Facebook), delta-of-delta + XOR
4. **下采样**：原始 1s, 5m avg, 1h avg（看时间范围）

### Gorilla 压缩
```
时间戳: delta-of-delta (DOD)
  t1: 1300
  t2: 1302 → delta=2
  t3: 1303 → DOD=1
  t4: 1304 → DOD=1 (小, 用 1 bit 编码)
  t5: 1320 → DOD=16 (大, 用 27 bit 编码)
值: XOR
  v1 = 13.0
  v2 = 13.5 → XOR=15
  v3 = 13.5 → XOR=0 (全 0, 用 1 bit 编码)
```
- 16 bytes/sample → 1.37 bytes/sample (12x 压缩)

---

## 专题 2：TSDB 内部 — Head + Block

### 两层存储
```
                     ┌──────────────────┐
   write → Appender  │      Head        │  ← 内存 + WAL
                     │  (最近 2h 数据)  │
                     └────────┬─────────┘
                              │
                          compact
                              ↓
                     ┌──────────────────┐
                     │     Block        │  ← 磁盘, 不可变
                     │  (旧数据压缩)     │
                     └──────────────────┘
```

### Head 内部
- memSeries: hash(label) → series
- samples: ring buffer (mmap'd)
- postings: label index (倒排)
- WAL: 所有 append 持久化, crash 后 replay

### Block 目录结构
```
01HXXX/
├── chunks/         # 数据
│   ├── 000001      # 16KB chunk 文件
│   └── 000002
├── index           # 倒排索引 + series dict
├── meta.json       # 元数据 (min/max time, labels)
└── tombstones      # 软删除标记
```

### 关键设计
- **每个 block 不可变**：简化并发, 适合 mmap
- **index 在 block 内**：查询时 mmap 内存查
- **merged blocks**：2h blocks + 6h blocks + 24h blocks
  - 1 周内的查 6h blocks (细)
  - 1 月内的查 24h blocks (粗)

---

## 专题 3：PromQL 解析与执行

### 4 步执行
```
"rate(http_requests_total[5m])"
   ↓ Parse
AST (Selector + FunctionCall)
   ↓ Analyze
逻辑表达式 + 类型检查
   ↓ Optimize
谓词下推, 常量折叠
   ↓ Exec
算子执行 (vector evaluator)
```

### 关键算子
| 算子 | 例子 | 作用 |
|------|------|------|
| `rate()` | rate(x[5m]) | 增函数速率 |
| `increase()` | increase(x[1h]) | 增量 |
| `histogram_quantile()` | ... 0.95 | 分位数 |
| `sum by (label)` | ... | 聚合 |
| `<`, `>` | ... | 比较 |
| `and`, `or`, `unless` | ... | 集合运算 |

### 向量化执行
- 一次处理一批 sample (e.g. 8192)
- 减少函数调用开销
- 适合 L2 cache 命中

### 一致性哈希分片
- 多 Prom 实例: 按 series 拆
- `cortex` / `mimir` 拓展
- 单实例: 在内存里分片 (engine shards)

---

## 专题 4：拉模型 + 服务发现

### 为什么是拉 (Pull) 不是推 (Push)
| 维度 | 拉 | 推 |
|------|----|----|
| 失败检测 | 没数据 = 服务挂了 | 不知道 |
| 配置变更 | 改 Prom config | 改所有 client |
| 多机房 | 一个 Prom 拉多机房 | 每个机房推中心 |
| 监控 | Prom 自己暴露指标 | client 也要监控 |

### 服务发现方式
- **静态配置**：`static_configs`
- **file_sd**：`file_sd_configs` (读 JSON/YAML)
- **DNS**：`dns_sd_configs`
- **Consul**：`consul_sd_configs`
- **Kubernetes**：`kubernetes_sd_configs`
- **EC2/GCE**：`ec2_sd_configs`

### K8s SD 流程
1. 调 K8s API List Pods/Endpoints
2. 过滤有 prom 注解的
3. 给每个目标生成 scrape config
4. 周期 relabel

### 实战
```yaml
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_ip]
        target_label: __address__
        replacement: ${1}:9100
```

---

## 专题 5：5 段必读代码逐段详解

### 5.1 `head.go:Appender` — 写入口
**关键**：fingerprint + WAL + memSeries
- label hash: 同一 label 集共享 series
- 写前 WAL, 写后内存
- crash 后 replay WAL 恢复

### 5.2 `engine.go:NewInstantQuery` — 即时查询
**关键**：parse → optimize → lazy exec
- 语法树: Selector/FunctionCall
- lazy: 实际执行在 q.Exec
- Vector selector: 按 label 查 series, 抽时间点

### 5.3 `db.go:Compact` — block 合并
**关键**：多个不可变 block → 一个大 block
- 后台异步, 不阻塞写
- index + samples 合并
- 完成后切元数据

### 5.4 `manager.go:Update` — 告警规则
**关键**：rules → group → eval loop
- group 共享 query 窗口
- 状态机: inactive → pending → firing
- for 持续时间才真发

### 5.5 `web.go:QueryAPI` — 远程查询
**关键**：RESTful + timeout + 限流
- /api/v1/query (即时)
- /api/v1/query_range (范围)
- /api/v1/series, /api/v1/labels, /api/v1/metadata

---

## 专题 6：性能调优

### 抓取
```yaml
global:
  scrape_interval: 15s       # 默认 1m
  scrape_timeout: 10s
  evaluation_interval: 15s   # 规则评估
```

### 存储
```bash
--storage.tsdb.path=/prometheus
--storage.tsdb.retention.time=30d   # 数据保留
--storage.tsdb.retention.size=50GB
--storage.tsdb.wal-compression      # WAL 压缩
--storage.tsdb.min-block-duration=2h
--storage.tsdb.max-block-duration=24h
```

### 查询
```yaml
--query.timeout=2m
--query.max-concurrency=20
```

### 限流
- 客户端: queue (远端写), retry
- 服务端: connection limit, query queue

### 关键调优
- 高基数 label: 避免 (e.g. user_id, email)
- recording rule: 热点查询预计算
- remote_write: 远端存储 + 降采样

---

## 专题 7：故障排查

### F1：数据丢失
```bash
# 症状: 某段数据没了
# 排查:
# 1. scrape target 是否 down
prometheus targets
# 2. 调小 scrape_interval
# 3. WAL 损坏
promtool tsdb analyze
# 4. retention 太久
```

### F2：查询超时
```bash
# 症状: "query timed out"
# 排查:
# 1. 减少高基数 series
count by (__name__)({__name__=~".+"})
# 2. 简化 query (避免 Cartesian)
# 3. 加 recording rule
# 4. 调 --query.timeout
```

### F3：告警风暴
```bash
# 症状: 几千个 alert 同时触发
# 排查:
# 1. alertmanager 路由
# 2. for 时长
# 3. group_by, group_wait, group_interval
# 4. inhibit_rule 抑制
```

### F4：磁盘满
```bash
# 症状: "no space left"
# 应急:
# 1. 减 retention
--storage.tsdb.retention.time=7d
# 2. 删除老 block
rm -rf data/01HXXX
# 3. 长期: remote_write 远端
```

### F5：Prom 自身 OOM
```yaml
# 症状: prom OOM Killed
# 排查:
# 1. series 太多
prometheus_tsdb_head_series
# 2. label 基数爆炸
# 3. 调高 ulimit
ulimit -n 65536
```

---

## 专题 8：复用模式

### 模式 A：拉模型 + 服务发现
**场景**：任何"被监控对象动态变化"系统
- 服务发现 + 心跳
- 自动重连
- 失败即发现

### 模式 B：WAL + 后台 compact
**场景**：写多读少存储
- 写 WAL (append-only)
- 后台合并 block
- 不可变 + mmap

### 模式 C：PromQL 向量化
**场景**：流式聚合查询
- 一次处理一批
- 减少函数调用
- Cache 友好

### 模式 D：Recording Rule
**场景**：热点查询
- 提前算
- 存为新 series
- 查询时只查预计算结果

---

## 专题 9：实战部署

### 单实例
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

### HA 2 实例
```
┌──────────┐    ┌──────────┐
│ Prom-A   │    │ Prom-B   │
│ (active) │    │ (standby)│
└────┬─────┘    └────┬─────┘
     │               │
   AlertManager    AlertManager
     同步              同步
```
- 用 `--web.enable-lifecycle` 支持热重载

### Remote Write（生产推荐）
```
Prom → remote_write → Thanos/Cortex/Mimir
                  → S3/GCS/Azure
```
- 长期存储
- 跨 Prom 联邦
- 多租户

### K8s 部署
```yaml
# prometheus-operator (Helm)
# 自动 ServiceMonitor, Alertmanager, Grafana
# scrape K8s API 自动发现
```

---

## 专题 10：Prometheus 让我重新思考的 5 件事

1. **拉 > 推**。在监控领域, 拉是更优解。
2. **不可变 block = 简化并发**。TSDB 设计的精髓。
3. **压缩是数据库的命脉**。Gorilla 把时序压到 1.37 字节/样本。
4. **PromQL = 向量化时序 SQL**。不是普通 SQL, 思路不同。
5. **Recording Rule = 数据库的物化视图**。热点查询预计算。


---

## 专题 11：TSDB 深入 — 从 WAL 到 Block 的完整数据流

### 数据流总览
```
应用 expose /metrics
   ↓
Prom scrape (HTTP GET, 15s)
   ↓
Appender.Add(series, t, v)
   ↓
  ┌─ 1. WAL.Write()  → 持久化, fsync
  ├─ 2. memSeries.append(t, v) → 内存 ring buffer
  └─ 3. update min/max time, postings 索引
   ↓
后台 (每 2h) Compact:
  Head → cut block (不可变, 写盘)
  → 合并相邻 2h blocks → 6h blocks
  → 再合并 → 24h blocks
   ↓
查询时: mmap 索引 + 二分找 chunk → 解压 → 返回
```

### WAL 文件结构
```
01HXXX/wal/
├── 00000000   # 128MB 滚动
├── 00000001
└── checkpoint.000123
    ├── 000123
    └── 000124
```
- 单条 record: `(series_ref, labels, samples...)`
- 每条带 CRC32 校验
- 启动时 replay WAL 重建 memSeries (慢!) → checkpoint 加速
- checkpoint 周期: `--storage.tsdb.checkpoint-interval=5m`

### Head 内存 ring buffer
- 2h 数据 (1k active series × 480 sample × 16B) = ~7MB
- ring buffer 满了 → 切 block, 内存释放
- 实测 1k series × 15s scrape × 2h = 480 sample/series, ~2MB

### Block 目录完整结构
```
01HXX0/  (2h block, ~50MB 原始)
├── chunks/         # Gorilla 压缩 sample
│   ├── 000001      # 16KB chunk 文件 (head + chunks)
│   └── 000002      # 实际每个 ~16KB-1MB
├── index           # 倒排索引 + series dict (mmap)
├── meta.json       # ulid, minTime, maxTime, labels
└── tombstones      # 软删除标记 (compaction 时再物理删)

01HXX0/index (mmap):
┌────────────────────────────────────────┐
│ Series (sort by labels)                │
│  series_1 → chunk_refs[chunk_1, ...]   │
│  series_2 → chunk_refs[...]            │
│ Label Index (posting lists)            │
│  label="status"=500 → [series_5, ...]  │
│  label="job"=api → [series_1, ...]     │
│ Label Names: ["status", "job", ...]    │
└────────────────────────────────────────┘
```

### Compact 阈值策略
| 持续时长 | 触发条件 | 频率 |
|---------|---------|------|
| 2h | Head 满 | 1 次/2h |
| 6h | 3 个 2h block | ~1 次/6h |
| 24h | 4 个 6h block | ~1 次/天 |
| ... | 继续合并 | ... |

### 关键调优
- `--storage.tsdb.min-block-duration=2h` 调大 → 减少 compact 频率
- `--storage.tsdb.max-block-duration=24h` 调大 → 减少 block 数
- `--storage.tsdb.wal-compression` 启用 → WAL 体积减半

---

## 专题 12：PromQL 算子详解 — 6 大类全展开

### 算子分类

#### A. Selector (选择器)
- Vector Selector: 拿某时刻的 series
  - `up` → 当前所有 up series
  - `up{job="api"}` → 过滤 label
  - `up{job!~"test.*"}` → 排除 label
- Matrix Selector: 拿时间范围
  - `up[5m]` → 5m 内所有 sample

#### B. Function (函数, 50+ 个)
| 类别 | 函数 | 用途 |
|------|------|------|
| 速率 | `rate()`, `irate()`, `idelta()` | 计算每秒速率 |
| 增量 | `increase()`, `delta()` | 时间范围增量 |
| 预测 | `predict_linear()`, `deriv()` | 趋势外推 |
| 数学 | `abs()`, `log2()`, `exp()`, `sqrt()` | 数学运算 |
| 时间 | `time()`, `minute()`, `hour()` | 时间处理 |
| 排序 | `topk()`, `bottomk()`, `quantile()` | 排序选择 |
| Histogram | `histogram_quantile()` | 分位数计算 |
| Counter 重置 | `resets()`, `changes()` | 检测重启 |
| 缺失 | `absent()`, `absent_over_time()` | 缺失检测 |

#### C. Aggregate (聚合)
- `sum`, `min`, `max`, `avg`, `group`, `stddev`, `stdvar`, `count`, `count_values`, `topk`, `bottomk`, `quantile`
- 修饰符: `by (label1, label2)` / `without (label1)`
- 例子: `sum by (status) (rate(http_requests_total[5m]))`

#### D. Binary Operator (二元运算)
- 算术: `+`, `-`, `*`, `/`, `%`, `^`
- 比较: `==`, `!=`, `>`, `>=`, `<`, `<=`
- 逻辑: `and`, `or`, `unless`
- 注意: 集合运算要求 series label 集一致 (除 `on()`, `ignoring()`)

#### E. 算子优先级
```
^           (幂, 最高)
*, /, %, atan2
+, -
==, !=, <=, <, >=, >
and, unless
or          (最低)
```

#### F. 算子向量化
- 一次处理 8192 sample (scanner buffer size)
- 内存连续, L2 cache 命中
- rate() 实现: 双指针滑动窗口

### 关键查询模式

#### 模式 1: RED (Rate / Errors / Duration)
```promql
# Rate (每秒请求数)
sum by (service) (rate(http_requests_total[5m]))

# Errors (5xx 比例)
sum by (service) (rate(http_requests_total{status=~"5.."}[5m]))
/ sum by (service) (rate(http_requests_total[5m]))

# Duration (P95 延迟)
histogram_quantile(0.95,
  sum by (le, service) (rate(http_req_duration_seconds_bucket[5m])))
```

#### 模式 2: USE (Utilization / Saturation / Errors)
- 资源视角 (CPU/内存/磁盘/网络)
- `node_cpu_seconds_total{mode!="idle"}` / count = CPU 利用率

#### 模式 3: 4 黄金信号
- Latency: histogram_quantile
- Traffic: rate
- Errors: rate{status=~"5.."} / rate
- Saturation: predict_linear

---

## 专题 13：服务发现机制深度

### 6 种 SD 方式对比

| 方式 | 配置 | 适用 | 频率 |
|------|------|------|------|
| static | 写死 targets | 测试 / 小集群 | 启动加载 |
| file | 读 JSON/YAML 文件 | 配合 CMDB | 文件更新 |
| dns | DNS A 记录 | 内部 DNS | scrape 周期 |
| consul | Consul API | HashiCorp 栈 | Consul 同步 |
| kubernetes | K8s API | K8s 集群 | K8s watch |
| ec2/gce | 云 API | AWS/GCP | scrape 周期 |

### K8s SD 完整流程
```
Prometheus Operator
   ↓
1. 调 K8s API: List Pods / Services / Endpoints
   ↓
2. 过滤: ServiceMonitor selector
   ↓
3. Relabel (元数据 → label):
   - __meta_kubernetes_pod_label_app → app
   - __meta_kubernetes_pod_ip → __address__:9100
   - __meta_kubernetes_namespace → namespace
   ↓
4. 周期 re-list (默认 5m)
   ↓
5. 生成 scrape target
```

### Relabel 实战 (6 步)
```yaml
relabel_configs:
  # 1. 过滤 (keep/drop)
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: true

  # 2. 重命名
  - source_labels: [__meta_kubernetes_pod_label_app]
    target_label: app

  # 3. 替换 (regex replace)
  - source_labels: [__meta_kubernetes_pod_ip]
    target_label: __address__
    replacement: ${1}:9100

  # 4. 哈希分片 (联邦场景)
  - source_labels: [__address__]
    modulus: 4
    target_label: __tmp_hash
    action: hashmod

  # 5. 标签删除
  - regex: __meta_kubernetes_pod_label_(.+)
    action: labeldrop

  # 6. 标签映射
  - source_labels: [__meta_kubernetes_pod_phase]
    regex: (Failed|Pending)
    target_label: __tmp_phase
    replacement: '${1}'
    action: replace
```

### 文件 SD 实战 (CMDB 场景)
```json
// /etc/prometheus/targets.json (动态生成)
[
  {
    "targets": ["10.0.1.5:9100", "10.0.1.6:9100"],
    "labels": {"job": "node", "env": "prod"}
  },
  {
    "targets": ["10.0.2.5:9100"],
    "labels": {"job": "api", "env": "staging"}
  }
]
```
```yaml
scrape_configs:
  - job_name: 'file_sd'
    file_sd_configs:
      - files: ['/etc/prometheus/targets/*.json']
        refresh_interval: 30s
```

---

## 专题 14：Recording Rule + Alert Rule 深入

### Recording Rule 工作流
```
yaml 定义规则 (e.g. service:http_requests:rate5m)
   ↓
Manager.Update 周期评估 (default 15s)
   ↓
执行 PromQL, 结果写入新 series
   ↓
新 series 可被查询 / 二次 rule 引用
   ↓
Grafana 用 recording series 加速 dashboard
```

### 实战例子
```yaml
groups:
  - name: api_slos
    interval: 30s
    rules:
      # Level 1: 原始速率
      - record: api:http_requests:rate5m
        expr: sum by (service, status) (rate(http_requests_total[5m]))

      # Level 2: 错误率
      - record: api:http_request_errors:ratio5m
        expr: |
          sum by (service) (rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum by (service) (rate(http_requests_total[5m]))

      # Level 3: P95 延迟
      - record: api:http_request_duration:p95_5m
        expr: |
          histogram_quantile(0.95,
            sum by (le, service) (rate(http_req_duration_seconds_bucket[5m])))
```

### Alert Rule + 状态机
```
inactive (无 alert)
   ↓ 条件首次满足
pending (条件满足, 计时中)
   ↓ for 持续时间到
firing (发送告警)
   ↓ 条件不再满足
inactive
```

### 告警实战
```yaml
groups:
  - name: alerts
    rules:
      - alert: HighErrorRate
        expr: api:http_request_errors:ratio5m > 0.05
        for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "{{ $labels.service }} 错误率过高"
          description: "错误率 {{ $value | humanizePercentage }}"
          runbook_url: "https://wiki/runbook/HighErrorRate"
```

### 关键调优
- **避免 Cartesian 爆炸**: `metric_a * metric_b` 当 label 不一致时产生笛卡尔积
- **rule 命名规范**: `level:metric:operations` (e.g. `job:http_requests:rate5m`)
- **rule group 共享窗口**: 同 group 的 rule 共享 query 窗口, 减少 I/O
- **避免循环**: A 引用 B, B 引用 A
- **promtool check rules** 必跑 CI

---

## 专题 15：联邦 (Federation) + Remote Write 架构

### 联邦 (Federation) 模式
```
┌────────────┐  ┌────────────┐
│ Prom-A (边缘)│  │ Prom-B (边缘)│   # 每个 K8s 集群 / 区域
│ 1M series  │  │ 1M series  │
└──────┬─────┘  └──────┬─────┘
       │ /federate      │
       │                │
       └────────┬───────┘
                ↓
         ┌────────────┐
         │ Prom-Center │   # 中心, 只看聚合
         │ 100k series │
         └────────────┘
                ↓
              Grafana
```

### 联邦配置
```yaml
# Prom-Center
scrape_configs:
  - job_name: 'federate'
    honor_labels: true        # 关键: 保留原 label
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job=~"kubernetes-.*"}'
        - '{__name__=~"job:.*"}'    # 只拉预计算 (recording rule)
        - '{__name__=~".*:p95.*"}'
    static_configs:
      - targets: ['prom-a:9090', 'prom-b:9090']
```

### Remote Write 模式 (生产推荐)
```
┌────────────┐
│ Prom       │ ──remote_write──→ ┌────────────┐
│ (1M series)│                  │ Thanos     │ → S3/GCS
└────────────┘                  │ Receiver   │   长期存储
                                └────────────┘
                                     ↓
                                ┌────────────┐
                                │ Thanos     │ → Grafana
                                │ Query      │
                                └────────────┘
```

### Remote Write 完整配置
```yaml
remote_write:
  - url: http://thanos-receive:19291/api/v1/receive

    # 写前过滤 (减少存储成本)
    write_relabel_configs:
      - source_labels: [__name__]
        regex: 'go_gc_.*|process_.*'
        action: drop

    # 队列配置 (防 OOM)
    queue_config:
      capacity: 10000
      max_samples_per_send: 2000
      batch_send_deadline: 5s
      min_shards: 1
      max_shards: 200
      retry_on_http_429: true

    # 压缩 (snappy 默认)
    compression: snappy
```

### Federation vs Remote Write 对比
| 维度 | Federation | Remote Write |
|------|-----------|--------------|
| 数据流 | 中心拉边缘 | 边缘推中心 |
| 实时性 | 取决于 scrape 周期 | 秒级 |
| 数据完整性 | 中心看到的是子 Prom 的 view | 全部数据 |
| 适用 | 跨区域聚合 | 长期存储 + 全局视图 |
| 成本 | 中心要存 | 远端对象存储 |

---

## 专题 16：跨项目引用 + 反模式 + 7 天复刻 + 2024-2026 里程碑

### 跨项目引用
- `[[../01-etcd/README|etcd]]` — Cortex/Mimir 用 etcd 做租约锁 (HA + 选主)
- `[[../02-redis/README|Redis]]` — Redis exporter, `redis_exporter` Go 客户端
- `[[../03-kubernetes/README|k8s]]` — K8s SD 模式, prometheus-operator
- `[[../04-postgres/README|postgres]]` — postgres_exporter + pg_stat_statements
- `[[../05-golang/README|Go]]` — `prometheus/client_golang` 是最成熟的 Go metrics 库
- `[[../06-vllm/README|vLLM]]` — vLLM 暴露 GPU 指标 (KV cache 利用率)
- `[[../09-ripgrep/README|ripgrep]]` — PromQL 也用正则, ripgrep 思想同源

### 5 必避反模式

1. **Pushgateway 滥用** — 服务常态 push, 退化为 push 模式
   ```yaml
   # ❌ 长生命周期服务用 Pushgateway
   # ✅ 长生命周期: /metrics + Pull
   # ✅ 短任务 (CronJob): Pushgateway OK
   ```

2. **高基数 label** — `user_id`, `email`, `request_id` 导致 series 爆炸
   ```promql
   # ❌ http_requests_total{user_id="12345"}  → 1M series
   # ✅ http_requests_total{user_tier="gold"}  → 10 series
   ```

3. **scrape_interval 1s** — 1k target × 1s = 86.4M scrape/day, Prom CPU 100%
   ```yaml
   # ❌ scrape_interval: 1s
   # ✅ scrape_interval: 15s (默认) 或 5s (热点)
   ```

4. **忘记 retention** — 磁盘满, Prom 启动失败
   ```bash
   # ❌ 不设 retention
   # ✅ retention.time=15d + retention.size=50GB 双保险
   ```

5. **告警无 group_by** — 1 个 K8s node 挂了 → 100 个 pod alert
   ```yaml
   # alertmanager.yml
   route:
     group_by: [cluster, alertname]
     group_wait: 30s
     group_interval: 5m
   ```

### 7 天复刻路线 (mini-TSDB)
```
D1: 跑通 Prom + node_exporter + Grafana (3 板斧)
D2: 写 PromQL, 看几个 dashboard (RED + USE)
D3: 调 --storage.tsdb.* 参数, 看 compact 行为
D4: 写 Recording Rule + Alert Rule
D5: 配 ServiceMonitor (K8s SD) + AlertManager
D6: 配 Remote Write → Thanos/Mimir (可选)
D7: 用 promtool check + 压测, 调优
```

### 2024-2026 里程碑
- **2024**: Prom 2.50+ 引入 UTF-8 label (突破 label value 限制)
- **2024**: Mimir GA (Cortex 继任者, 性能 10x)
- **2025**: Prom 3.0 LTS (UI 重写, PromQL 完全开源)
- **2025**: OpenTelemetry metrics → Prom 互操作完善
- **2026**: eBPF-based metric (零侵入采集, 取代部分 exporter)
- **未来**: AI-driven alerting (智能阈值 + 异常检测)

### "如果重来一次"
- **早用 recording rule**: 别在 Grafana 里每次都算
- **早设 retention**: 磁盘满一次就知道
- **早接 alertmanager**: Prom 自带 alert 弱, 必接
- **晚用 federation**: 优先 remote_write, federation 太脆弱
- **必开 wal-compression**: 节省一半磁盘
- **必接 pushgateway**: 短任务必备
- **必用 ServiceMonitor**: K8s 时代标配
- **必监控 Prom 自己**: 用 Prom 监控 Prom (meta-monitoring)

---

## 🔗 进一步阅读 (续)

- 官方博客：https://prometheus.io/blog/
- 中文社区：https://github.com/prometheus/prometheus/issues
- 实战：https://github.com/cortexproject/cortex
- 进阶：https://github.com/grafana/mimir
- 配套：https://github.com/thanos-io/thanos
- 监控 Prom 自身：https://github.com/prometheus/prometheus/wiki/Default-ports
- 异常检测：https://github.com/AICoE/prometheus-anomaly-detector


---

## 🔗 进一步阅读

- 源码：https://github.com/prometheus/prometheus
- 文档：https://prometheus.io/docs/
- TSDB 论文：https://fabxc.org/tsdb/
- 联邦：https://prometheus.io/docs/prometheus/latest/federation/
- 实战书：《Prometheus 实战》《云原生监控》《可观测性工程》
