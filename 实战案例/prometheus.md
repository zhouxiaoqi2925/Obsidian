# Prometheus - 云原生时序监控

**来源**：GitHub https://github.com/prometheus/prometheus
**创建时间**：2026-06-02

---

## 一、核心机制与监控哲学

### 1. Pull 模型与反向服务发现（Pull + SD + Relabel）

**问题场景**：微服务数量爆炸时，传统 push-then-script 模式（Zabbix/Nagios）无法应对动态 target —— 每次服务扩缩容都要改监控配置。Prometheus 反过来：监控方主动拉，业务方暴露 `/metrics` 即可，target 列表由服务发现（SD）自动同步。**主动权在监控方，业务方零侵入**。

**解决方案**：
```go
// discovery/manager.go 核心循环
func (m *Manager) Main() {
    for {
        select {
        case <-m.ctx.Done():
            return
        case allTargets := <-m.syncCh:                  // 无缓冲，producer 必等 consumer
            m.targets = m.unifyTargets(allTargets)      // 合并 30+ provider
            m.reload()
        case <-m.triggerSend:                            // 容量 1 的合并写
            // 5s 内多次 reload 只触发一次 syncCh
        }
    }
}

// scrape/scrape.go 每 15s 拉一次
func (sp *scrapePool) sync(t map[uint64]*target) {
    for _, tgt := range t {
        sp.startScrapeLoop(tgt, ...)                    // 启动 per-target goroutine
    }
}
```
**关键参数**：

| 配置 | 默认 | 说明 |
|------|------|------|
| `scrape_interval` | 15s | 拉取频率 |
| `scrape_timeout` | 10s | 单次超时 |
| `scrape_timestamp_tolerance` | 2ms | 时间戳对齐容差（issue #7846） |
| `relabel_configs` | - | label 重写，可在拉取前 drop/replace |
| `metric_relabel_configs` | - | 拉取后落 TSDB 前重写 |
| `max_concurrent_evals` | 20 | rules/queries 评估并发硬限 |

**最佳实践**：
1. ✅ 业务方只暴露 `/metrics`，监控方控制节奏 —— 业务方重启不需要通知监控方
2. ✅ 配合 K8s ServiceMonitor CRD，target 自动发现 pod
3. ✅ `relabel_configs` 在 SD 后、scrape 前执行，可 drop 无关 label
4. ✅ 内网/边缘不可拉取时，配套 `Pushgateway` 或 `remote_write` push
5. ✅ 时间戳对齐 2ms 容差让 chunkenc delta-of-delta 编码省 30%+ 磁盘

### 2. 指标命名与标签模型（Metric Name & Labels）

**问题场景**：监控数据本质是"时间戳 + 名字 + 多维标签 + 值"，但怎么命名？怎么打标签才能既支持 PromQL 聚合又不爆 series 数？Prometheus 的命名约定（`snake_case` + `_total/_bucket/_sum` 后缀）和 label 模型是它生态稳定 10 年的根基。

**解决方案**：
```go
// model/metric.go 核心结构
type LabelName string
type LabelValue string
type Metric string

// 一个 metric + 一组 label 唯一确定一条 time series
type Labels []*Label

// 命名规范（client_golang）
httpRequestsTotal.WithLabelValues("GET", "/api/users", "200").Inc()
// → 序列名: http_requests_total{method="GET",path="/api/users",status="200"}

// Histogram 客户端
httpRequestDurationSeconds.WithLabelValues("GET", "/api/users").
    Observe(0.234)
// → _bucket{le="0.1"} _bucket{le="0.5"} _sum _count
```
**关键参数**：

| 命名后缀 | 类型 | 说明 |
|----------|------|------|
| `_total` | Counter | 累计计数（可 inc/dec） |
| `_count` / `_sum` / `_bucket` | Histogram/Summary | histogram 自动生成 |
| 单位 | - | 必填在名字里（如 `_seconds` / `_bytes`） |
| `le` | histogram label | bucket 上界 |
| `job` / `instance` | 自动加 | SD 自动注入 |
| `__name__` | 隐藏 label | 序列名本身 |

**最佳实践**：
1. ✅ 指标名 snake_case + 单位（`http_request_duration_seconds`）
2. ✅ 标签值高基数（userId/orderId）禁止 —— 会爆 series
3. ✅ Counter 必加 `_total` 后缀，Histogram 加 `_seconds`/`_bytes` 单位
4. ✅ 标签值数量 ≤ 10 个，超过用 trace/log 替代
5. ✅ 业务方埋点用 `client_golang`，自动处理 promhttp 中间件

### 3. PromQL 表达式模型（PromQL Engine）

**问题场景**：监控数据要"被算"才能成为告警/看板，简单的"求和/平均"不够 —— SRE 需要"过去 5 分钟 P99 延迟比上周同期增长 50%"这种复合查询。PromQL 是函数式 DSL，引擎是 stateless 求值器，被 web API 和 rules.Manager 共享调用，**避免"双引擎跑出不一致"的经典 bug**。

**解决方案**：
```go
// promql/engine.go 评估入口
func (e *Engine) NewInstantQuery(ctx context.Context, q storage.Queryable, ...) (Query, error) {
    // 1. parse: text → AST
    expr, err = parser.ParseExpr(qs)
    // 2. compile: AST → 算子（vectorSelector, binaryExpr, call）
    opts, err = e.newEvalCtx(ctx, q, t, ...)
    // 3. eval: 拉 TSDB 样本 → 算 → 输出 Vector
    result, err := expr.Eval(ctx, opts)
    return result, nil
}

// 调用方
result := engine.NewInstantQuery(ctx, queryable, opts, "rate(http_requests_total[5m])", time.Now())
v, _ := result.Exec(context.Background())
// v.Type() == parser.ValueVector
```
**关键参数**：

| 函数 | 用途 | 例子 |
|------|------|------|
| `rate(m[5m])` | Counter 每秒速率 | `rate(http_requests_total[5m])` |
| `irate(m[5m])` | 瞬时速率 | 用最后两个点 |
| `increase(m[5m])` | 增长量 | 自带 counter reset 处理 |
| `histogram_quantile(0.99, ...)` | P99 | 配 `rate(bucket[5m])` |
| `predict_linear(m[1h], 4*3600)` | 线性预测 | 磁盘告警 |
| `sum by (job) (...)` | 按 label 聚合 | 按 job 求和 |
| `time()` | 当前时间 | 常配 `vector(time())` |

**最佳实践**：
1. ✅ 优先用 `rate` 而非 `irate` —— 长窗口更平滑
2. ✅ Histogram P99 必须用 `histogram_quantile(0.99, rate(bucket[5m]))`
3. ✅ `sum by` 比 `sum without` 显式，可读性更好
4. ✅ 查询超 30s 加 `step` 拉低采样率
5. ✅ `lookbackDelta` 默认 5m，给 scrape 抖动留容差

### 4. 4 大核心接口（Appendable/Queryable/Discoverer/Query）

**问题场景**：监控系统的模块数量爆炸（scrape / rules / storage / notifier / web / discovery），如果各模块直接 import 对方类型，编译图就是一团乱麻。Prometheus 收敛在 4 个 interface 上：**所有跨模块通信都走这 4 个接口**。这就是它能解耦到 30+ SD provider 仍能协作的关键。

**解决方案**：
```go
// storage/storage.go 4 个核心 interface
type Appendable interface {
    Appender(context.Context) (Appender, error)
}

type Queryable interface {
    Querier(mint, maxt int64) (Querier, error)
}

type Query interface {
    Exec(ctx context.Context) (Value, error)
    Close() error
    Statement() Statement
}

// discovery/discovery.go
type Discoverer interface {
    Run(ctx context.Context, up chan<- []*targetgroup.Group)
    Updates() <-chan []*targetgroup.Group       // 实际形态
}
```
**关键参数**：

| Interface | 实现方 | 消费方 |
|-----------|--------|--------|
| `Appendable` | TSDB, Remote Write | scrape.Manager |
| `Queryable` | TSDB, Remote Read | PromQL, web API |
| `Discoverer` | K8s, EC2, Consul | discovery.Manager |
| `Query` | PromQL engine | web, rules |

**最佳实践**：
1. ✅ 自定义 exporter 实现 `prometheus.Collector` 接口即可
2. ✅ 自定义 SD provider 实现 `discovery.Discoverer`
3. ✅ 自定义 storage backend 实现 `Appendable` + `Queryable`
4. ✅ 接口边界就是测试边界 —— `util/teststorage.New()` 是 mock 工厂
5. ✅ 不要 import 具体类型，跨模块用 interface

### 5. 单机 TSDB 自治（Local Autonomy）

**问题场景**：传统监控数据库追求分布式（InfluxDB Enterprise、TimescaleDB），复杂度高、运维难。Prometheus 反其道：单机 TSDB + 多实例联邦。**单机性能优先，跨集群走联邦/remote_write**。这是它在小团队也能落地的根本原因。

**解决方案**：
```go
// tsdb/db.go TSDB 接口
type DB interface {
    storage.Appendable
    storage.Queryable
    Admin
    Compact(ctx context.Context)                         // 后台压缩
    Snapshot(dir string) error                            // 全量备份
    Close() error
}

// 启动即开
func Open(dir string, l log.Logger, rngs []int64, ...) (*DB, error) {
    db, err := open(dir, l, rngs, opts)
    db.head.metrics = db.head.metrics // mmap 全开
    go db.monitorAndCompact()         // 后台压缩
    return db, nil
}
```
**关键参数**：

| 配置 | 默认 | 用途 |
|------|------|------|
| `tsdb.path` | `./data` | 数据目录 |
| `tsdb.retention.time` | 15d | 时间保留 |
| `tsdb.retention.size` | - | 大小保留（先到先触发） |
| `tsdb.min-block-duration` | 2h | 最小 block 周期 |
| `tsdb.max-block-duration` | 36h | 最大 block 周期 |
| `tsdb.wal-compression` | true | WAL 用 zstd 压缩 |
| `storage.tsdb.no-lockfile` | false | 关闭 lockfile（K8s 中常见） |

**最佳实践**：
1. ✅ 单机磁盘 IOPS 是瓶颈 —— NVMe + 短 block 周期
2. ✅ `retention.size` 在大集群优先于 `retention.time`
3. ✅ `wal-compression` 启用 —— 30%+ 磁盘节省
4. ✅ K8s 里 mount emptyDir + 关闭 lockfile
5. ✅ 跨实例用 `thanos sidecar` 或 `remote_write` —— 不要直接共享 TSDB 目录

---

## 二、采集管线与发现层

### 6. scrape 协议与文本解析（Scrape Protocol）

**问题场景**：Prometheus 怎么从 `/metrics` 拉数据？自家 exposition 格式（key value pair）有 4 种：简单型、带 label、Histogram、Summary。`textparse/` 子包专门做"流式 + 零拷贝"解析，避免 5MB metric 文件全读内存。

**解决方案**：
```go
// scrape/scrape.go 拉取 + 解析
func (s *scrapeLoop) scrapeAndReport() {
    contentType, body, err = s.fetcher.fetch(s.ctx, s.client)
    p, _ = textparse.New(body, contentType, s.honorLabels, ...)
    for {
        var (
            et textparse.Entry
            m  client_model.Metric
        )
        et, err = p.Next()                              // 流式拉 token
        switch et {
        case textparse.EntryType:
            // 解析 # TYPE foo counter
        case textparse.EntrySeries:
            m, _ = p.Metric()                            // 拿 name + labels
            v, _ = p.Value()                             // 拿 timestamp + value
            app.Append(ref, v.l, v.t, v.v)               // 写入 Appender
        }
    }
    app.Commit()
}
```
**关键参数**：

| Content-Type | 含义 | 解析器 |
|--------------|------|--------|
| `text/plain; version=0.0.4` | 旧版格式 | `textparse.New` 自动判 |
| `application/openmetrics-text; version=1.0.0` | 新版（带 _created, exemplars） | 同上 |
| Content-Encoding: gzip | 启用压缩 | `snappy/gzip` 透明解压 |
| `_created` 系列 | 指标创建时间 | 2.x+ 支持 |
| `exemplar` | 关联 trace id | OpenTelemetry 集成点 |

**最佳实践**：
1. ✅ 业务方用 `client_golang` 暴露，自动按 OpenMetrics 规范
2. ✅ 启用 gzip 压缩 —— 文本 metrics 压缩比 5x-10x
3. ✅ `_total` 计数器必须 `Inc()`，别用 gauge 模拟
4. ✅ 大集群用 `relabel_configs` 在拉取前 drop 无关 label
5. ✅ `textparse` 流式解析可处理 1GB+ 单文件

### 7. 服务发现适配器（30+ SD Providers）

**问题场景**：target 列表从哪来？K8s pod / EC2 instance / Consul service / file / dns / azure / gcp —— 每种云/平台一套。Prometheus 把 30+ provider 做成"注册表"，通过 `plugins/minimum.go` 的 `import _ "..."` 副作用一次性引入。

**解决方案**：
```go
// discovery/registry.go 注册表
var Providers = map[string]func(l log.Logger) (discovery.Discoverer, error){
    "file":           func(l log.Logger) (discovery.Discoverer, error) { return file.New(l, conf) },
    "kubernetes":     func(l log.Logger) (discovery.Discoverer, error) { return kubernetes.New(l, conf) },
    "ec2":            func(l log.Logger) (discovery.Discoverer, error) { return ec2.New(l, conf) },
    "consul":         func(l log.Logger) (discovery.Discoverer, error) { return consul.New(l, conf) },
    "gce":            func(l log.Logger) (discovery.Discoverer, error) { return gce.New(l, conf) },
    // ... 30+
}

// discovery/manager.go 启动所有 provider
func (m *Manager) StartProviders(ctx) {
    for name, prov := range m.providers {
        go m.runProvider(ctx, name, prov)
    }
}
```
**关键参数**：

| Provider | 触发频率 | 输出 label |
|----------|----------|------------|
| `kubernetes` | 30s | `pod`, `namespace`, `service`, `node` |
| `ec2` | 60s | `instance_id`, `availability_zone`, `private_ip` |
| `consul` | 30s | `service`, `datacenter`, `tag_*` |
| `gce` | 60s | `instance_id`, `zone`, `machine_type` |
| `file` | on change | 自定义 |
| `dns` | 30s | 解析 SRV 记录 |
| `azure` | 60s | `vm_name`, `resource_group` |

**最佳实践**：
1. ✅ K8s 用 `kubernetes_sd_configs: {role: endpoints}` 抓 service 端口
2. ✅ `relabel_configs` 替换 label，避免高基数（pod IP）
3. ✅ `refresh_interval` 设 ≥ 30s，避免打爆云 API
4. ✅ 自定义 SD 实现 `discovery.Discoverer` 接口
5. ✅ `file_sd` 在 staging 环境最稳，免去对接云 API

### 8. oklog/run Actor 启动模型

**问题场景**：7 个独立子系统（scrape / rules / tsdb / notifier / web / discovery / promql）需要统一生命周期管理 —— 任一子系统崩溃，整个进程跟着退；接 SIGHUP 要平滑重启。`oklog/run` 把每个子系统注册成 actor，统一处理 cancel + restart。

**解决方案**：
```go
// cmd/prometheus/main.go 2245 行的 main
func main() {
    g := run.Group{}
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // SIGHUP → cancel all actors
    g.Add(func() error {
        return handleSIGHUP(...)
    }, func(error) {})

    // 7 个子系统各自一个 actor
    g.Add(func() error { return discoveryManager.Run() },    cancel)
    g.Add(func() error { return scrapeManager.Run() },       cancel)
    g.Add(func() error { return rulesManager.Run() },        cancel)
    g.Add(func() error { return tsdbDB.Open() },             cancel)
    g.Add(func() error { return notifierManager.Run() },     cancel)
    g.Add(func() error { return webHandler.Run() },          cancel)
    g.Add(func() error { return tracing.Run() },             cancel)

    g.Run()  // 任一 actor 退出，整组退出
}
```
**关键参数**：

| 概念 | 实现 | 作用 |
|------|------|------|
| Actor | `g.Add(actor, interrupt)` | 启动 + 取消的成对函数 |
| 优雅窗口 | `interrupt func(error)` | 给 actor 30s 清理 |
| SIGHUP | `handleSIGHUP` reload | 重载 config，不退进程 |
| TERM | 全 cancel | 30s 优雅窗口 |
| 启动顺序 | 注册顺序 | 依赖前向（web 依赖 tsdb） |
| Restart | 第三方实现 | 进程内自愈（需 K8s 配合） |

**最佳实践**：
1. ✅ 抄 `oklog/run` 到任何长跑服务 —— 比 errgroup 优雅
2. ✅ `triggerSend chan struct{} cap=1` 实现"5s 合并写"
3. ✅ SIGHUP 处理配置热加载，TERM 处理优雅退出
4. ✅ 任一 actor 退出整组退出 —— "all-or-nothing" 模式
5. ✅ 业务方埋点要支持 `lazy` 注册（避免启动阻塞）

### 9. Relabel 与 Drop 机制（Relabel Pipeline）

**问题场景**：SD 拉来的 target 可能有几千个 label、几万 series，但实际业务只关心其中 10% —— 不 drop 就会爆 series 数、爆存储、爆查询性能。`relabel_configs` 在 scrape 前后各一次：scrape 前过滤 target，scrape 后过滤 metric。

**解决方案**：
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # 1. 保留 running 的 pod
      - source_labels: [__meta_kubernetes_pod_phase]
        action: keep
        regex: Running
      # 2. 注入 job label
      - target_label: job
        replacement: kubernetes-pods
      # 3. 重写 label name
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app
        action: replace
    metric_relabel_configs:
      # drop 高基数 label
      - source_labels: [__name__]
        regex: 'go_gc_.*'
        action: drop
```
**关键参数**：

| Action | 行为 | 典型用法 |
|--------|------|----------|
| `keep` | regex 匹配保留 | 过滤特定 namespace |
| `drop` | regex 匹配丢弃 | 过滤 staging |
| `replace` | 重写 label | 注入 `job` |
| `labelmap` | 按 regex 重命名 | `__meta_*` → 自定义 |
| `labeldrop` | 按 name drop | drop 高基数 |
| `labelkeep` | 按 name keep | 只保留关键 |
| `hashmod` | N 取模分片 | 联邦拆分 |

**最佳实践**：
1. ✅ `relabel_configs` 在 scrape 前执行，可 drop target
2. ✅ `metric_relabel_configs` 在 scrape 后执行，可 drop metric
3. ✅ 用 `keep` 比 `drop` 安全 —— 新指标默认不被收
4. ✅ `labelmap` 配合 `__meta_kubernetes_*` 把 SD 元数据转 label
5. ✅ `hashmod` 在大规模联邦拆分时有用 —— `hashmod(__name__, 3) = 0/1/2`

### 10. 通知与 Alertmanager 集成（Notifier → Alertmanager）

**问题场景**：Prometheus 评估出"告警 firing"后，怎么送到运维的手机/钉钉/Slack？Prometheus 不直接送——它通过 HTTP 推给独立的 Alertmanager 集群（去重、抑制、静默、路由）。**两个进程解耦，告警链路可独立扩容**。

**解决方案**：
```go
// notifier/notifier.go 推送
func (n *Manager) Send(alerts []*Alert) {
    n.mtx.RLock()
    sends := n.sendAlerts(alerts)
    n.mtx.RUnlock()

    for _, send := range sends {
        // 异步 + 重试
        go func(alerts []*Alert, url string) {
            for attempt := 0; attempt < n.opts.AlertRetryCount; attempt++ {
                if n.sendOne(alerts, url) == nil { return }
                time.Sleep(/* 退避 */)
            }
        }(send.alerts, send.url)
    }
}

// Alertmanager API 协议
POST /api/v1/alerts
Content-Type: application/json
[{
  "labels": {"alertname": "HighErrorRate", "severity": "critical"},
  "annotations": {"summary": "..."},
  "startsAt": "2026-06-02T00:00:00Z",
  "generatorURL": "http://prometheus:9090/graph?..."
}]
```
**关键参数**：

| 字段 | 必填 | 用途 |
|------|------|------|
| `alertmanager` 配置 | 是 | Alertmanager URL 列表 |
| `alerts` body | 是 | 推送 alert 数组 |
| `AlertRetryCount` | 3 | 重试次数 |
| `AlertRetryInterval` | 1m | 重试间隔 |
| `AlertmanagerTimeout` | 10s | HTTP 超时 |
| `Severity` label | 推荐 | 路由维度 |
| `GeneratorURL` | 自动 | 跳回 Prometheus 详情 |

**最佳实践**：
1. ✅ Alertmanager 必须独立部署 —— 多副本 HA
2. ✅ 用 `severity` label 区分 critical / warning
3. ✅ `for: 5m` 让告警持续 5m 才发，避免抖动
4. ✅ 配套 `inhibit_rules` —— critical 抑制 warning
5. ✅ `silence` 走维护窗口 —— 通过 Alertmanager API 配

---

## 三、TSDB 与性能优化

### 11. 时序块存储（TSDB Chunk Encoding）

**问题场景**：每秒 1 万 sample × 1000 series × 30 天 = 2592 亿 sample，纯 row-store 写盘成本爆炸。Prometheus 自研 TSDB：mmap 块文件 + delta-of-delta 编码 + Gorilla 浮点压缩，单 sample 1.3 byte 压到极致。

**解决方案**：
```go
// tsdb/chunkenc/chunk.go
type Chunk interface {
    Bytes() []byte
    Encoding() Encoding
    Appender() (Appender, error)
    Iterator(Iterator) Iterator
}

// tsdb/chunkenc/varbit.go XOR 编码
func (c *XORChunk) Appender() (Appender, error) {
    return &xorAppender{
        b: c.b,
        t: c.t,
        v: c.v,
    }, nil
}
func (a *xorAppender) Append(t int64, v float64) {
    if a.num == 15 {                              // 每 16 个 sample 压缩
        a.lead = t
        a.t = 0                                  // reset
    }
    // 1. delta-of-delta 编码 timestamp
    a.t <<= 1
    delta := t - a.lead
    dod := delta - a.prevDelta
    a.prevDelta = delta
    // 2. XOR 编码 value
    vBits := math.Float64bits(v)
    if vBits != a.prevValue {
        // 用 leading/trailing zeros 压缩
    }
}
```
**关键参数**：

| 编码 | 类型 | 压缩率 | 适用 |
|------|------|--------|------|
| `XOR` (Gorilla) | float64 | 1.3 byte/sample | 大多数 gauge |
| `Delta` | int64 | 1-2 byte/sample | 计数器、单调序列 |
| `Histogram` | bucket | N/A | 2.x native histogram |
| `FloatHistogram` | sparse | 100-200 byte/series | NHCB |

**最佳实践**：
1. ✅ Gauge 用 `XOR` 编码 —— Gorilla 压缩最好
2. ✅ Counter 单调增长用 `Delta` 编码
3. ✅ 短 scrape 间隔（15s）vs 长（1m） —— 压缩率随密度增加
4. ✅ `chunkRange` 默认 2h，过短压缩率差，过长查询慢
5. ✅ `mmap` 块文件全开 —— 性能比 mmap 部分开启高 30%

### 12. Head 内存层与 stripe lock（Head In-Memory Layer）

**问题场景**：scrape 路径高频写 TSDB，单 lock 必成瓶颈。`tsdb/head.go` 用 stripe-lock（按 hash 分桶）替代大锁，**32 路 stripe 把 series insert 冲突降到 1/32**。OOO（out-of-order）isolation 跟正常 isolation 并行不悖。

**解决方案**：
```go
// tsdb/head.go Head 结构
type Head struct {
    numSeries        atomic.Uint64                   // 原子计数
    series           *stripeSeries                    // 分桶锁
    postings         *index.MemPostings
    iso              *isolation                       // 按时序 isolation
    oooIso           *oooIsolation                    // 乱序 isolation
    chunkRange       atomic.Int64
    wal              *wlog.WAL
}

// tsdb/head_series.go stripe 锁
type stripeSeries struct {
    stripeSize int
    stripes    []seriesStripe
}
func (s *stripeSeries) getOrCreate(hash uint64, lset labels.Labels) *memSeries {
    i := hash & uint64(s.stripeSize-1)               // 32 stripe → i 取低 5 bit
    s.stripes[i].seriesLock.Lock()
    defer s.stripes[i].seriesLock.Unlock()
    return s.stripes[i].series[hash]
}
```
**关键参数**：

| 概念 | 默认 | 作用 |
|------|------|------|
| `stripe_size` | 2^14 = 16384 | series stripe 桶数 |
| `chunk_range` | 2h | head chunk 切分周期 |
| `max_ooo_samples` | 10 | 允许的最大乱序点数 |
| `WAL_replay_concurrency` | GOMAXPROCS | 启动期并发回放 |
| `iso` | 单锁 | 按时序 append |
| `oooIso` | 单锁 | 乱序 append |

**最佳实践**：
1. ✅ 32 stripe 是 CPU 核数 ≥ 32 时的甜点 —— 32 以下 16 stripe
2. ✅ OOO 容忍网络抖动 —— 老版本不允许 OOO
3. ✅ WAL replay 并发度绑 GOMAXPROCS —— 启动期最贵操作
4. ✅ 不要在 head 满之前手动 Compact —— 让后台跑
5. ✅ `iso` 跟 `oooIso` 并行不悖 —— 写入路径分两条

### 13. WAL 回放与崩溃恢复（WAL Replay）

**问题场景**：进程崩溃或重启时，head 在内存的 series 全部丢失，scrape 间隔内 sample 全部蒸发。WAL（Write-Ahead Log）把每条 append 先序列化到盘，启动时回放。**这是 Prometheus 启动慢（30s-2min）的根本原因**。

**解决方案**：
```go
// tsdb/wlog/wlog.go WAL 结构
type WAL struct {
    records [][]byte                                  // 内存缓冲
    size    int                                       // 字节数
    files   []*File                                   // 多个 segment file
    page    *page                                    // mmap 当前页
    cur     *File                                    // 当前 append file
}

// 启动回放
func (w *WAL) NextSegment() (io.ReadCloser, error) {
    segments, err := ioutil.ReadDir(w.dir)
    for i := w.nextSegment; i < len(segments); i++ {
        f, _ := os.Open(filepath.Join(w.dir, segments[i].Name()))
        // 串行读 segment + parse + re-apply to Head
    }
    return nil
}
```
**关键参数**：

| 配置 | 默认 | 作用 |
|------|------|------|
| `WAL_segment_size` | 128MB | 单个 segment 上限 |
| `WAL_replay_concurrency` | GOMAXPROCS | 回放并发 |
| `WAL_compression` | true | 启用 zstd |
| `WAL_truncate_frequency` | 2h | checkpoint 后 truncate |
| `Checkpoint` | 触发 | 内存 → 持久化 block |
| `replay` 速度 | 50MB/s | 单核读盘速度 |

**最佳实践**：
1. ✅ 启动回放是 I/O bound —— NVMe 比 SSD 快 3x
2. ✅ `WAL_compression` 启用 —— 30%+ 磁盘节省
3. ✅ `WAL_truncate_frequency` 调短（30m）让回放更快
4. ✅ `truncate` 走 checkpoint，崩溃也只丢 truncate 之后的
5. ✅ K8s 里 mount emptyDir + 关 lockfile + 用 SIGHUP 优雅重启

### 14. Remote Write v2 协议（Remote Storage v2）

**问题场景**：单机 TSDB 撑不住 10k target × 30d 数据量，必须外发到 Thanos/Cortex/Mimir。v1 协议用 Protobuf + snappy，每 sample 一个对象，CPU 贵、字节大。v2 协议引入符号表 + zstd + 原生 histogram，**字节节省 50%+，CPU 节省 30%+**。

**解决方案**：
```go
// storage/remote/writev2.go v2 协议
type WriteRequest struct {
    Symbols []string                                    // 全局符号表
    Timeseries []TimeSeries
}
type TimeSeries struct {
    LabelsRefs []uint32                                 // 引用符号表
    Exemplars []Exemplar
    Histograms []HistogramPB
    Samples   []Sample
}

// 写：本地 + remote 扇出
func (f *Fanout) Appender(ctx context.Context) storage.Appender {
    primary := f.primary.Appender(ctx)                 // 本地 TSDB
    secondaries := make([]storage.Appender, len(f.secondaries))
    for i, s := range f.secondaries {
        secondaries[i] = s.Appender(ctx)               // remote Write
    }
    return &fanoutAppender{primary, secondaries}
}
// fanoutAppender.Commit 同时 commit 所有 appender
```
**关键参数**：

| 字段 | 用途 | v1 vs v2 |
|------|------|----------|
| `symbols` | label name/value 全局表 | v2 引入，去重 |
| `LabelsRefs` | 引用符号表 uint32 | v2 引入 |
| `zstd` 压缩 | 请求压缩 | v2 强制 |
| `exemplar` | 关联 trace id | v2 原生 |
| `native histogram` | NHCB | v2 原生 |
| `CreatedTimestamp` | 指标创建时间 | v2 原生 |

**最佳实践**：
1. ✅ v2 协议走 `zstd` 压缩 + 符号表 —— 50% 带宽节省
2. ✅ `remote_write` 配合 Mimir / Cortex 跨集群
3. ✅ `queue_config` 调并发 + 批大小（1000 series/批）
4. ✅ `retry_on_http_429` 必须开 —— 防止 receiver 满
5. ✅ `metadata_config` 开启 —— 让 receiver 知道 metric metadata

### 15. 性能基准（Prombench）

**问题场景**：500+ 贡献者每周 50+ PR，性能退化 5% 就足以让 scrape 路径崩溃。Prometheus 用 Prombench 跨 PR 性能对比：**任何 scrape/query 退化 >5% 直接红 ❌**。

**解决方案**：
```bash
# prombench 跑基准
prombench \
  --benchmark=scrape \
  --target-count=10000 \
  --scrape-interval=15s \
  --duration=1h \
  --output=bench.json

# benchstat 对比
benchstat before.txt after.txt
# name        old time/op    new time/op    delta
# scrape       1.23ms ± 2%   1.18ms ± 1%  -4.07%
```
**关键参数**：

| 指标 | 阈值 | 工具 |
|------|------|------|
| scrape 耗时 | 退化 < 5% | Prombench |
| query P99 | 退化 < 10% | Prombench |
| 内存峰值 | 退化 < 5% | Prombench |
| CPU 使用 | 退化 < 5% | Prombench |
| TSDB 磁盘 | 持平 | `du -sh data/` |
| WAL replay | 持平 | 启动时间监控 |

**最佳实践**：
1. ✅ CI 跑 Prombench 子集，PR 阻断性能退化
2. ✅ `benchstat` 必须给 ± 误差（不是裸 mean）
3. ✅ 真实流量 vs 合成 —— 真实更准，合成更快
4. ✅ Profile with `pprof` —— CPU/heap/trace/goroutine
5. ✅ 性能基线每季度更新 —— 老硬件/老版本淘汰

---

## 四、可靠性与生态

### 16. 配置热加载（SIGHUP + Web Reload）

**问题场景**：监控配置变更（新增 scrape job、调 interval）要重启进程？—— 1h 历史数据丢失 + 30s 启动窗口。Prometheus 支持 SIGHUP + HTTP `/-/reload` 触发热加载，所有子系统按顺序重载。

**解决方案**：
```go
// cmd/prometheus/main.go SIGHUP
func handleSIGHUP(...) error {
    for {
        sig := <-sighup
        if sig == syscall.SIGHUP {
            // 1. 重读 config.yaml
            conf, err := config.LoadFile(*configFile)
            // 2. 通知每个 subsystem reload
            discoveryManager.ApplyConfig(conf.DiscoveryConfigs)
            scrapeManager.ApplyConfig(conf.ScrapeConfigs)
            rulesManager.ApplyConfig(conf.RuleFiles)
            notifierManager.ApplyConfig(conf.AlertingConfig)
            // 3. tsdb 不需要 reload（path 不变）
        }
    }
}

// HTTP 触发（需 --web.enable-lifecycle）
// POST /-/reload
```
**关键参数**：

| 触发 | 行为 | 用途 |
|------|------|------|
| SIGHUP | 全部重载 | 操作系统级 |
| `/-/reload` HTTP | 全部重载（需 `--web.enable-lifecycle`） | API 级 |
| 配置文件变更 | 检测 mtime 自动触发 | 文件 watcher |
| `--web.enable-lifecycle` | false | 必须显式开 |
| 优雅窗口 | 30s | 各 subsystem 完成 reload |

**最佳实践**：
1. ✅ `--web.enable-lifecycle` 必开 —— K8s 配 Reloader
2. ✅ SIGHUP 不重置 tsdb（path 不变）—— 数据无丢失
3. ✅ Reload 不会重复 scrape —— 沿用已有 target loop
4. ✅ 用 `promtool check config prometheus.yml` 提前验证
5. ✅ 配合 `config-reloader` 监听 configmap 变化 → 触发 HTTP reload

### 17. 健康检查与优雅停服（Liveness + Drain）

**问题场景**：K8s 滚动升级时，Prometheus 进程被 SIGTERM 立刻退出 —— 当前 scrape 失败、head 数据丢失、连接未断。**健康检查 + 优雅停服** 是 cloud-native 项目标配。

**解决方案**：
```go
// web/web.go 健康检查
func (h *Handler) Healthy(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)                     // 200 = 进程活
}
func (h *Handler) Ready(w http.ResponseWriter, r *http.Request) {
    if h.db.Closed() { http.Error(w, "TSDB closed", 503); return }
    w.WriteHeader(http.StatusOK)                     // 200 = 准备好服务
}

// 优雅停服
func (h *Handler) Shutdown(ctx context.Context) {
    // 1. 关闭 listener，停止接新请求
    // 2. 等待 in-flight 完成
    // 3. 关闭 tsdb（trigger Checkpoint + WAL truncate）
    h.db.Close()
    // 4. notifier 等待 alert 全部送出
    h.notifier.Stop()
}
```
**关键参数**：

| 端点 | 行为 | K8s 用途 |
|------|------|----------|
| `/-/healthy` | 进程活 | livenessProbe |
| `/-/ready` | TSDB ready | readinessProbe |
| `/-/reload` | 配置热加载 | lifecycle pre-stop |
| `/-/quit` | 优雅退出 | lifecycle pre-stop |
| `/-/metrics` | 自家 metrics | Prometheus 自监控 |

**最佳实践**：
1. ✅ `livenessProbe: /-/healthy` —— 进程死就重启
2. ✅ `readinessProbe: /-/ready` —— 没准备好不接流量
3. ✅ `preStop: POST /-/quit` —— 30s 优雅窗口
4. ✅ `terminationGracePeriodSeconds: 60` —— 30s 兜底
5. ✅ K8s `PrometheusRule` CRD 跟 SIGHUP 配合

### 18. OpenTelemetry 集成（OTLP Translator）

**问题场景**：业界标准向 OpenTelemetry 倾斜（trace + metric + log 三位一体），Prometheus 必须接纳 OTLP 协议，否则会被生态孤立。`storage/remote/otlptranslator/` 做 OTLP ↔ Prometheus 双向翻译。

**解决方案**：
```go
// storage/remote/otlptranslator/labels.go
func OtelMetricNameToPrometheusName(name string) string {
    // OTel: http.server.duration
    // Prom: http_server_duration_seconds
    out := otelMetricPrometheusRe.ReplaceAllString(name, "_${1}_")
    out = strings.TrimPrefix(out, "_")
    out = strings.TrimSuffix(out, "_")
    if !hasUnitSuffix(name) {
        out = out + "_units"
    }
    return out
}

// 接收 OTLP
func ConvertMetrics(rm pmetric.ResourceMetrics) (prompb.Metrics, error) {
    var out prompb.Metrics
    for _, sm := range rm.ScopeMetrics {
        for _, m := range sm.Metrics {
            ts, _ := convertMetric(m)
            out = append(out, ts...)
        }
    }
    return out, nil
}
```
**关键参数**：

| 转换 | 方向 | 关键函数 |
|------|------|----------|
| Metric Name | OTel dot → Prom underscore | `OtelMetricNameToPrometheusName` |
| Unit | 必填单位 | 自动加 `_seconds`/`_bytes` 后缀 |
| Histogram | OTel exponential → Prom bucket | 损失精度 |
| Exemplar | OTel exemplar → Prom | 1:1 保留 |
| Resource attributes | OTel `service.name` → Prom label | 自动转换 |
| Native Histogram | OTel NHCB → Prom NHCB | 1:1 |

**最佳实践**：
1. ✅ 业务方埋点优先 OpenTelemetry SDK
2. ✅ Prom 端开 `otlptranslator` 接收 OTLP
3. ✅ 命名约定走 OTel semantic conventions
4. ✅ exemplar 关联 trace_id 双向跳转
5. ✅ Native Histogram 走 3.x 协议 —— 精度无损

### 19. 规则评估（Rules Manager）

**问题场景**：监控的"硬约束"需要"自动执行"：磁盘 80% 告警、P99 延迟 > 1s 告警、CPU 预测 4h 内 OOM 告警 —— 都不可能靠人眼盯。Rules Manager 每 1m 评估所有 rule（recording / alerting），把结果存 TSDB 或送 Alertmanager。

**解决方案**：
```go
// rules/manager.go 评估循环
func (m *Manager) Update(interval time.Duration, files []string, ...) {
    groups, errs := m.LoadGroups(...)
    for _, g := range groups {
        g.interval = interval
        g.EvalTimestamp = nil
        go m.runGroup(g)                              // 每 group 一个 goroutine
    }
}

func (g *Group) runSingleRound(ctx context.Context, ts time.Time) {
    for _, rule := range g.Rules() {
        // alerting rule → notifier
        // recording rule → TSDB
        _, err := rule.Eval(ctx, ts, g.opts.QueryFunc, g.opts.ExternalLabels, g.opts.Limits)
        if err != nil { /* 告警 evaluation failed */ }
    }
}
```
**关键参数**：

| Rule | 行为 | 例子 |
|------|------|------|
| `recording` | 评估 → 写入 TSDB | `record: job:http_requests:rate5m` |
| `alerting` | 评估 → 送 Alertmanager | `alert: HighErrorRate expr: rate(...) > 0.5` |
| `for: 5m` | 持续 5m 才发 | 防抖 |
| `keep_firing_for: 5m` | 告警消失 5m 内仍发 | 防止抖动 |
| `labels.severity` | 路由 | Alertmanager 路由 |
| `annotations.summary` | 告警描述 | 富文本 |

**最佳实践**：
1. ✅ Recording rule 预计算 —— 查询性能提升 10x
2. ✅ Alert rule 加 `for: 5m` 防抖
3. ✅ `keep_firing_for: 5m` 处理 0/1 切换抖动
4. ✅ 用 `promtool test rules test.yml` 写规则单测
5. ✅ Alert rule 配 `severity` label，让 Alertmanager 路由

### 20. 联邦与跨集群（Federation）

**问题场景**：单个 Prometheus 实例只能扛几千 target。跨数据中心、跨环境（prod/staging/dev）汇总时，必须有"中心对中心"的查询能力。Federation 让上层 Prometheus 拉下层 Prometheus 的特定 metric（`/federate`）。

**解决方案**：
```yaml
# 上层 Prometheus 配置
scrape_configs:
  - job_name: 'federate'
    honor_labels: true                               # 保留下层 label
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="prometheus"}'                       # 只拉 job=prometheus
        - '{__name__=~"job:.*"}'                     # 只拉 recording rule
    static_configs:
      - targets:
        - 'prometheus-region-a:9090'
        - 'prometheus-region-b:9090'
        - 'prometheus-region-c:9090'
```
**关键参数**：

| 端点 | 行为 | 用途 |
|------|------|------|
| `/federate` | 拉指定 series | 跨 Prometheus 汇总 |
| `match[]` | PromQL selector | 过滤 |
| `honor_labels: true` | 保留下层 label | 避免冲突 |
| `thanos sidecar` | 长期存储 + 跨集群查询 | 替代 federation |
| `remote_write` | 推送模式 | 比 federation 稳 |
| `remote_read` | 反向查询 | 极少用 |

**最佳实践**：
1. ✅ Federation 用 `honor_labels: true` —— 避免 label 冲突
2. ✅ 拉 recording rule 结果比拉原始 series 高效 100x
3. ✅ 跨数据中心用 `thanos sidecar` 或 `remote_write` 更稳
4. ✅ 联邦层级 ≤ 3 层 —— 太深难以维护
5. ✅ `cortex/mimir` 替代 federation 用于大规模

---

**标签**：#prometheus #Go #监控告警 #时序数据库 #云原生
**状态**：20/20 份详细内容
