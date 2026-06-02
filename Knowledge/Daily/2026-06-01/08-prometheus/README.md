---
tags: [open-source, deep-dive, monitoring, go, observability]
type: open-source-analysis
created: 2026-06-01
project_name: "prometheus"
project_url: "https://github.com/prometheus/prometheus"
language: "Go"
license: "Apache-2.0"
stars: 57000
parsed_date: 2026-06-01
category: "DevOps"
status: "completed"
steps_completed: "14/14"
---

# 开源项目深度解析｜Prometheus

> 云原生监控的事实标准：Pull 模型 + PromQL + 时序数据库 + 告警

## 项目元信息

| 字段 | 值 |
|------|-----|
| 项目名 | Prometheus |
| 仓库 URL | https://github.com/prometheus/prometheus |
| 主语言 | Go |
| License | Apache-2.0 |
| Stars | 57k+ |
| Last commit | 活跃（持续发版） |
| 解析难度 | ⭐⭐⭐⭐⭐ |
| 状态 | 14/14 完成 |

## 进度追踪
- [x] 0. 解析前准备
- [x] 1. 开发计划书
- [x] 2. 项目框架
- [x] 3. 项目画像
- [x] 4. 架构设计
- [x] 5. 代码深度解析
- [x] 6. 运行机制
- [x] 7. 演进历史
- [x] 8. 质量保障
- [x] 9. 生态依赖
- [x] 10. 生产实践
- [x] 11. 社区文化
- [x] 12. 教训总结
- [x] 13. 学习卡片

---

## 0. 解析前的 5 个准备

**[点状解析]**：克隆仓库、跑通本地实例、抓几个 metric 看 PromQL。

```bash
git clone https://github.com/prometheus/prometheus.git
cd prometheus
make build
./prometheus --config.file=documentation/examples/prometheus.yml
# → http://localhost:9090
```

**5 问清单**：
1. 解决什么问题？→ 容器时代的 metrics 采集 + 查询 + 告警
2. 为什么 Pull 而不是 Push？→ 集中控制、健康可观察
3. 核心数据流？→ scrape → TSDB → PromQL → alerting
4. 骨架文件？→ `scrape/`, `storage/`, `rules/`, `web/`
5. 最容易踩的坑？→ cardinality 爆炸、recording rule 缺失、retention 设置

---

## 1. 开发计划书（Charter）

| 字段 | 内容 |
|------|------|
| 项目名 | Prometheus |
| 一句话定位 | 云原生监控 + 告警系统，Pull 模型 + PromQL + TSDB |
| 核心问题 | 动态环境下的 metrics 采集、查询、告警 |
| 目标用户 | SRE、运维、平台工程 |
| 商业模式 | CNCF 毕业，开源（部分公司提供商业版） |
| 关键里程碑 | v1.0（2016）→ v2.0（2017 TSDB 重写）→ 当前 |
| 团队规模 | 50+ 维护者 |
| 当前状态 | 云原生监控事实标准 |
| 复刻难度 | ⭐⭐⭐⭐⭐⭐ |

---

## 2. 项目框架（Skeleton）

```
prometheus/
├── cmd/
│   ├── prometheus/              # 主程序
│   ├── promtool/                # 配置检查 + 调试
│   └── rule_unit_test/
├── scrape/                      # 抓取 ⭐
│   ├── scrape.go               # 抓取调度
│   ├── manager.go              # 抓取管理
│   └── target.go               # Target 抽象
├── storage/                     # 存储 ⭐
│   ├── tsdb/                   # TSDB 实现 ⭐⭐
│   │   ├── head.go             # 内存块
│   │   ├── block.go            # 磁盘块
│   │   ├── compact.go          # 压缩
│   │   ├── wal.go              # WAL
│   │   └── index/              # 倒排索引
│   └── remote/                 # 远程读写
├── rules/                       # 告警规则 + Recording Rule
│   ├── manager.go
│   └── rulefmt.go
├── web/                         # HTTP API + UI ⭐
│   ├── api/
│   │   └── v1/
│   ├── ui/                      # 静态前端
│   └── web.go
├── promql/                      # PromQL 引擎 ⭐⭐
│   ├── engine.go
│   ├── parser/
│   ├── functions/
│   └── ast/
├── discovery/                   # 服务发现
│   ├── kubernetes/
│   ├── consul/
│   └── dns/
├── notifier/                    # Alertmanager 通知
├── retrieval/                   # 旧版（已弃用）
├── relabel/                     # Relabel 配置
├── model/                       # 数据模型
├── util/                        # 工具
├── config/                      # 配置加载
├── labels/                      # Label 操作
└── expfmt/                      # 文本格式解析
```

**关键入口**：`cmd/prometheus/main.go` → `web.New()` → 启动 HTTP server

---

## 3. 项目画像（Profile）

| 维度 | 数据 | 含义 |
|------|------|------|
| 总代码行 | ~80 万 | 大型项目 |
| 主语言占比 | Go 95%+ | 纯 Go |
| 贡献者 | 1000+ | 强社区 |
| 月均提交 | 100+ | 活跃 |
| 直接依赖 | ~80 | 适中 |

---

## 4. 架构设计（Architecture）

```
┌──────────────────────────────────────────────┐
│           Prometheus Server                   │
│                                                │
│  ┌────────────────────────────────────────┐  │
│  │ Scrape Manager                          │  │
│  │  - 周期拉取 targets                      │  │
│  │  - HTTP GET /metrics                    │  │
│  └─────────────┬──────────────────────────┘  │
│                ↓                              │
│  ┌────────────────────────────────────────┐  │
│  │ TSDB (Time Series Database)             │  │
│  │  - Head (内存 + WAL)                    │  │
│  │  - Block (磁盘, 2h 一块)                │  │
│  │  - Compactor (压缩)                     │  │
│  │  - Retention (清理)                     │  │
│  └─────────────┬──────────────────────────┘  │
│                ↓                              │
│  ┌────────────────────────────────────────┐  │
│  │ PromQL Engine                           │  │
│  │  - 解析 → AST → 执行                    │  │
│  │  - 函数 + 聚合                          │  │
│  └─────────────┬──────────────────────────┘  │
│                ↓                              │
│  ┌────────────────────────────────────────┐  │
│  │ Rules Manager                           │  │
│  │  - Recording rules                      │  │
│  │  - Alerting rules                       │  │
│  └─────────────┬──────────────────────────┘  │
│                ↓                              │
│  ┌────────────────────────────────────────┐  │
│  │ Notifier → Alertmanager                 │  │
│  └────────────────────────────────────────┘  │
│                                                │
│  ┌────────────────────────────────────────┐  │
│  │ Web UI + API                            │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
        ↑                          ↓
   Pull /metrics              Push Gateway
   from targets               (短期 jobs)
```

**4+1 视图**：

### 4.3.1 逻辑视图
- `ScrapeManager`：抓取调度
- `TSDB`：时序存储
- `Engine`：PromQL 执行
- `Manager`：规则评估
- `Notifier`：告警发送

### 4.3.2 进程视图
- 1 个 prometheus 主进程
- 多 goroutine：scrape / rule eval / compact / query
- 启动时初始化 TSDB
- 配置文件热加载

### 4.3.3 部署视图
```
┌────────────────────────────────────┐
│  Prometheus Cluster                │
│  ┌──────────────────────────┐      │
│  │ Prometheus (单实例)       │      │
│  │  /metrics scrape          │      │
│  │  TSDB on disk            │      │
│  └──────────────────────────┘      │
│  ┌──────────────────────────┐      │
│  │ Alertmanager (高可用)     │      │
│  │  路由 / 分组 / 抑制       │      │
│  └──────────────────────────┘      │
└────────────────────────────────────┘
       ↓                ↓
   Various          Targets
   Grafana          (Apps/K8s)
```

### 关键设计决策（ADR）

**ADR-001：为什么 Pull 而不是 Push？**
- 状态：采纳
- 背景：传统 Nagios/Zabbix 是 push
- 决策：prometheus 主动拉取
- 理由：target 变化可立即感知、健康状态可知、简化 client
- 代价：动态环境需要服务发现
- 例外：Pushgateway 处理短命 jobs

**ADR-002：为什么自研 TSDB？**
- 状态：采纳
- 背景：通用 DB 难以处理高基数时序
- 决策：专用 TSDB
- 理由：极致压缩（8 bytes/sample）、范围查询优化
- 关键设计：块 + 倒排索引 + 压缩

**ADR-003：为什么 Label-based 数据模型？**
- 状态：采纳
- 背景：传统 metrics 是单维度时间序列
- 决策：多维 label → `{name, labels} → value`
- 理由：灵活查询、动态聚合
- 代价：高基数问题

---

## 5. 代码深度解析（带 WHY）⭐ 重点

### 5.1 骨架代码定位

```bash
# 最核心的文件
storage/tsdb/head.go               # Head 实现
storage/tsdb/block.go              # 磁盘块
promql/engine.go                   # PromQL 执行器
scrape/scrape.go                   # 抓取
rules/manager.go                   # 规则评估
```

### 5.2 核心文件分析

#### 文件：`storage/tsdb/head.go`（TSDB 内存部分）

**职责（What）**：管理最近 2 小时的 samples（默认 block duration），提供写入 + 实时查询。

**关键结构**：
```go
type Head struct {
    series          map[uint64]*memSeries  // series 索引
    symbols          map[string]struct{}    // 字符串去重
    postings         *index.Postings        // 倒排索引
    wal              *wal.WAL               // 写前日志
    appendPool       sync.Pool              // 写入池
}
```

**核心写入路径**：
```go
func (h *Head) Appender() Appender {
    return h.appenderPool.Get().(*headAppender)
}

func (a *headAppender) Add(...) {
    // 1. 计算 series ID（hash of labels）
    // 2. 查/建 series
    // 3. 写入 sample（mmap 区域）
    // 4. 写 WAL
}
```

**为什么这样写（WHY）❗**
- Symbol 表去重：label 字符串 → uint32 → 省内存
- Series 用 hash 索引：O(1) 查找
- mmap 存 sample：零拷贝查询
- WAL 持久化：崩溃可恢复
- 借鉴：所有需要"高基数 + 高速写入"的系统

**可优化点**：
- 高基数下 postings 内存爆炸
- Head 太大会影响查询

#### 文件：`promql/engine.go`（PromQL 执行器）

**关键流程**：
```go
func (ng *Engine) NewInstantQuery(...) (Query, error) {
    // 1. 解析 PromQL → AST
    // 2. 优化（常量折叠、谓词下推）
    // 3. 选择执行模式（instant / range）
    // 4. 从 TSDB 读取数据
    // 5. 执行向量运算
    // 6. 应用函数 + 聚合
}
```

**为什么这样写**：
- 解析器独立 → 易于测试
- 优化器分离 → 后续可加 CBO
- 并行查询 → 多个 series 并行算

#### 文件：`scrape/scrape.go`（抓取核心）

**关键逻辑**：
```go
func (s *scrapeLoop) scrape(deadline) {
    // 1. 选 target
    // 2. HTTP GET /metrics
    // 3. 解析 text format
    // 4. 应用 relabel
    // 5. 写入 TSDB
}
```

**为什么这样写**：
- 抓取周期可配：高频 vs 低频
- 超时 + 重试：避免慢 target 拖累
- Relabel 在 client 端：减少存储

---

## 6. 运行机制（Bring It Up）

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

rule_files:
  - "rules/*.yml"
```

```bash
./prometheus --config.file=prometheus.yml
# → http://localhost:9090
```

**Smoke test**：
```bash
# 查最近 5 分钟 rate
curl 'http://localhost:9090/api/v1/query?query=rate(prometheus_tsdb_head_series[5m])'

# 表达式浏览器
# http://localhost:9090/graph
# 输入：up
```

**关键命令**：
- `promtool check config prometheus.yml`：配置验证
- `promtool query instant 'up'`：命令行查询
- `promtool test rules rules.yml`：规则单测

**资源占用**（100 万 active series）：
- 内存：~2GB
- 磁盘：~10GB/天（未压缩）
- CPU：~2 core
- 启动：~3s

---

## 7. 演进历史（Time Travel）

| 阶段 | 时间 | 关键事件 | 学到的事 |
|------|------|----------|----------|
| 2012 | 灵感 | Google Borgmon 论文 | 监控数据模型 |
| 2015 | v0.x | SoundCloud 开源 | 早期设计 |
| 2016 | v1.0 | 第一个稳定版 | 基础功能完成 |
| 2017 | v2.0 | TSDB 重写 | 自研时序存储 |
| 2018 | v2.x | CNCF 毕业 | 标准化 |
| 2019 | v2.13 | Remote Read/Write 稳定 | 多 Prometheus 联邦 |
| 2020 | v2.20 | Exemplars | 链接到 traces |
| 2021 | v2.30 | Agent Mode | 资源受限场景 |
| 2023 | v2.45 | UTF-8 标签 | 多语言支持 |
| 2024+ | 当前 | 持续优化 | 性能 + 体验 |

**灵魂人物**：
- Julius Volz（创始）
- Björn Rabenstein（核心）
- Fabian Reinartz（TSDB 重写）

---

## 8. 质量保障

| 维度 | 数据 |
|------|------|
| 单测覆盖 | 75%+ |
| 集成测试 | test/ 大量场景 |
| E2E | prombench 压测 |
| CI | GitHub Actions + CircleCI |
| Lint | golangci-lint |
| 性能 | prombench 对比 v1/v2 |
| 模糊测试 | go-fuzz 覆盖 parser |

**独特实践**：
- prombench：模拟 100 万 series 的压测
- 反向兼容测试：跨版本导入
- 规则测试：`promtool test rules`

---

## 9. 生态依赖

| 依赖 | 用途 | 风险 |
|------|------|------|
| `google.golang.org/grpc` | Remote 通信 | 低 |
| `github.com/prometheus/client_golang` | Go client | 低 |
| `github.com/prometheus/common` | 公共库 | 低 |
| `github.com/cespare/xxhash` | label hash | 低 |
| `github.com/golang/snappy` | 块压缩 | 低 |

**License**：Apache-2.0 → 商用友好

**生态**：
- `prometheus/client_golang`：Go 客户端
- `prometheus/node_exporter`：主机指标
- `alertmanager`：告警路由
- `grafana`：可视化
- `thanos` / `cortex` / `mimir`：长期存储

---

## 10. 生产实践

| 实践 | Prometheus 怎么做 | 我能不能抄 |
|------|-------------------|------------|
| 高可用 | 双实例 + 分片 | ✅ |
| 长期存储 | Thanos/Cortex/Mimir | ✅ |
| 服务发现 | K8s SD | ✅ |
| Recording Rule | 预聚合 | ✅ |
| 告警 | Alertmanager | ✅ |
| 仪表盘 | Grafana | ✅ |
| Exemplars | 关联 traces | ✅ |
| Pushgateway | 短命 jobs | ✅ |
| Exporter | 标准化 | ✅ |

**生产必看**：
- 监控 Prometheus 自己：up 指标 + 自身 metrics
- 警惕高基数 label（user_id, request_id 慎用）
- Recording rule 必备：避免查原始数据
- 磁盘 IO 性能关键：用 SSD

---

## 11. 社区文化

| 维度 | 数据 | 含义 |
|------|------|------|
| 治理 | CNCF 毕业 | 中立 |
| 维护者 | 10 核心 | 集中 |
| RFC | GitHub Issues | 透明 |
| 沟通 | Slack + GitHub | 活跃 |
| 大会 | PromCon | 每年 |

---

## 12. 教训总结

### 12.1 必偷的 3 件事
1. **Pull 模型**：可观察性 + 健康检测
2. **专用 TSDB**：高基数场景必须自研
3. **多维 label**：现代监控标配

### 12.2 必避的 3 个坑
1. **高基数 label**：OOM 元凶
2. **没有 recording rule**：查询慢 + 重复计算
3. **磁盘满不告警**：监控自己！

### 12.3 7 天复刻路线
```
D1: 跑起来 + 抓自己 /metrics
D2: 读 TSDB head + block
D3: 读 PromQL engine
D4: 读 scrape loop
D5: 写 exporter（采集某 app 指标）
D6: 写 mini-TSDB（只支持 sum）
D7: 写博客
```

### 12.4 打分（5/5/5/5/5）

---

## 13. 学习卡片

### 《Prometheus》学习卡片

#### 一句话价值
> **云原生监控的事实标准**，Pull + PromQL + TSDB 三位一体。

#### 3 个核心洞察
1. **Pull > Push**：中心化视角 + 健康可观察
2. **专用 TSDB**：高基数时序的极致优化
3. **Label 是核心**：动态查询的基础

#### 5 段必读代码
1. `storage/tsdb/head.go:Appender` — 写入路径
2. `promql/engine.go:NewInstantQuery` — 查询执行
3. `scrape/scrape.go:scrape` — 抓取循环
4. `rules/manager.go:Eval` — 规则评估
5. `model/metric.go` — 数据模型

#### 1 个反模式
- 早期 v1 用 LevelDB → 性能差 → v2 自研 TSDB

#### 1 个可复用模式
- **专用时序存储** → 任何 metrics/logs 系统

#### 我能马上用的 3 件事
1. [ ] 给自己项目加 Prometheus exporter
2. [ ] 写 recording rule 优化查询
3. [ ] 监控 Prometheus 自身

---

## 🏷️ 标签

`#开源项目` `#深度解析` `#Prometheus` `#监控` `#TSDB` `#PromQL` `#Go` `#云原生`

## 🔗 关联笔记

- [[开源项目深度解析体系]]
- [[每日开源项目抓取任务]]
- [[etcd-深度解析]]
- [[Kubernetes-深度解析]]
