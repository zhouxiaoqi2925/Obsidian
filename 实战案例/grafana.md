# Grafana - 可视化平台设计模式

**来源**：基于公开知识补充
**创建时间**：2026-06-02

---

## 一、核心机制与多数据源原理

### 1. 数据源抽象层（Datasource Plugin Pattern）

**问题场景**：Grafana 需要同时支持 Prometheus、Elasticsearch、InfluxDB、MySQL、CloudWatch 等数十种后端。每种后端有自己独特的查询语言（PromQL、Lucene、InfluxQL、SQL）、连接协议和元数据格式。如果在核心代码里硬编码每种数据源，会导致 N 个数据源 = N 个分支，核心代码膨胀且无法扩展。

**解决方案**：
```go
// 数据源接口定义（pkg/setting/setting.go + public/app/features/datasources/settings.ts）
type DatasourceHandler interface {
    // 元数据：告诉 Grafana 这个数据源支持什么
    GetMetadata() DatasourceMetadata
    // 健康检查：UI 上能显示绿色/红色
    CheckHealth(ctx context.Context) (*CheckHealthResult, error)
    // 核心：把面板的查询转换成数据源能理解的请求
    QueryData(ctx context.Context, req *QueryDataRequest) (*QueryDataResponse, error)
    // 订阅：长时间运行的流式数据
    SubscribeStream(ctx context.Context, req *StreamRequest) (<-chan *StreamPacket, error)
}

// 数据源注册中心
var DatasourceRegistry = make(map[string]DatasourceHandlerFactory)

func RegisterDatasource(pluginID string, factory DatasourceHandlerFactory) {
    DatasourceRegistry[pluginID] = factory
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Timeout | 30s-60s | 单次查询超时 |
| MaxSeries | 1000-10000 | 单次查询最大返回序列数 |
| QueryInterval | 1s-30s | 查询时间步进 |
| HTTP Keep-Alive | 30s | 复用连接池 |

**最佳实践**：
1. ✅ 数据源全部以独立 Plugin 形式运行（主仓 100+ 内置，生态 200+），核心代码不感知具体实现
2. ✅ 接口粒度要小：Query/CheckHealth/SubscribeStream 三个方法就够，不要把 cache、auth 写进接口
3. ✅ 数据源以 sidecar 进程加载（Grafana Plugin SDK），崩溃不影响主进程
4. ✅ 元数据声明 `metrics: true / logs: true / traces: true / annotations: true`，前端按能力渲染不同 UI

### 2. 查询转换与响应标准化（Query-to-Frame Pipeline）

**问题场景**：不同数据源返回的数据形态千差万别（Prometheus 返回矩阵、ES 返回 hits、SQL 返回 rows），但前端图表组件（折线、柱状、表格）需要统一的"数据帧"结构（DataFrame = 字段数组）。如何让 N 种数据源格式归一化为一种数据帧？

**解决方案**：
```go
// pkg/services/dataframe/frame.go（基于公开知识补充）
type Frame struct {
    Name   string
    RefID  string        // 关联到查询的 refId（A/B/C）
    Fields []*Field      // 每个字段是一列
    Meta   *FrameMeta
}

type Field struct {
    Name   string
    Type   FieldType     // TIME / NUMBER / STRING / BOOLEAN
    Values *Vector       // 列式存储，APEX 比 []interface{} 节省 60% 内存
    Config *FieldConfig  // 颜色、单位、显示格式
}

// 数据源只需实现一个转换器
type DataResponseParser interface {
    ParseResponse(body []byte) ([]*Frame, error)
}

// 内置转换器示例
var Parsers = map[string]DataResponseParser{
    "prometheus":   PrometheusParser{},
    "graphite":     GraphiteParser{},
    "elasticsearch": ElasticsearchParser{},
    "mysql":        SQLParser{},
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Vector capacity | 初始 256，按 2x 增长 | 减少 realloc |
| FieldConfig 单位 | 100+ 内置 | time/s/bytes/percent |
| DisplayMode | Auto / Label / Value | 表格列显示策略 |
| Decimals | null = 自适应 | 小数位显示 |

**最佳实践**：
1. ✅ DataFrame 必须是列式存储（`arrow.Vector`），不要用 `map[string][]interface{}`，否则 10 万数据点 OOM
2. ✅ 每个 Field 必须有 Type，没有 Type 的字段前端无法渲染
3. ✅ 转换器要做到"无损"：原始数据精度、单位、标签都要进 Meta，不能丢
4. ✅ 多查询（A/B/C）时用 RefID 关联，转换后用 `Join` 字段做跨查询合并

### 3. 时间序列对齐（Time Series Alignment）

**问题场景**：用户在面板里画两条线——一条来自 Prometheus（10s 步进），一条来自 CloudWatch（1min 步进）。直接画图会出现 X 轴不对齐、阶梯错位。需要在查询结果中插入缺失时间点并做插值。

**解决方案**：
```python
# 算法伪代码（基于公开知识补充）
def align_time_series(frames, step_ms, fill_null_as="null"):
    """
    frames: List[Frame] 多个数据源的查询结果
    step_ms: 对齐时间步进（如 10000 = 10s）
    fill_null_as: "null" / "zero" / "previous"
    """
    # 1. 找到全局时间范围
    t_min = min(f.fields[0].values[0] for f in frames)
    t_max = max(f.fields[0].values[-1] for f in frames)
    
    # 2. 生成统一时间轴
    aligned_t = range(t_min, t_max, step_ms)
    
    # 3. 对每个 frame 做时间对齐
    aligned = []
    for f in frames:
        # 3.1 建立时间→值的索引
        index = {t: v for t, v in zip(f.fields[0].values, f.fields[1].values)}
        # 3.2 按 aligned_t 填充
        new_values = []
        for t in aligned_t:
            if t in index:
                new_values.append(index[t])
            else:
                new_values.append(fill(fill_null_as, index, t))
        aligned.append(Frame(time=aligned_t, value=new_values))
    
    return aligned
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| step | 10s / 30s / 1m | 时间步进 |
| fill_null | null / 0 / previous | 缺失点填充策略 |
| maxPoints | 1500 | 超过此值则下采样 |

**最佳实践**：
1. ✅ 对齐步进由"面板宽度 / 像素密度"反推，不要硬编码 10s
2. ✅ 客户端对齐优于服务端，能减少 50% 网络流量
3. ✅ 对齐后必须做"标签匹配"（legend format），否则同名 metric 来自不同 instance 会画到一条线
4. ✅ step 过小时（< 1s）考虑启用 LTTB（Largest Triangle Three Buckets）下采样

### 4. 仪表盘 JSON 模型（Dashboard JSON Schema）

**问题场景**：仪表盘需要可序列化、可 diff、可版本控制、可导入导出。设计一个稳定的 JSON Schema 是关键。错误的 Schema 一旦发布，社区几千个仪表盘全要重写。

**解决方案**：
```json
// 一个典型的仪表盘 JSON（基于公开知识补充）
{
  "id": null,
  "uid": "prometheus-cpu",
  "title": "Production CPU",
  "tags": ["production", "cpu"],
  "timezone": "browser",
  "schemaVersion": 38,
  "version": 12,
  "refresh": "30s",
  "time": { "from": "now-6h", "to": "now" },
  "templating": {
    "list": [
      {
        "name": "instance",
        "type": "query",
        "datasource": "Prometheus",
        "query": "label_values(node_cpu_seconds_total, instance)",
        "refresh": 2
      }
    ]
  },
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "CPU Usage",
      "gridPos": { "x": 0, "y": 0, "w": 24, "h": 8 },
      "targets": [
        {
          "refId": "A",
          "datasource": "Prometheus",
          "expr": "100 - (avg(rate(node_cpu_seconds_total{mode='idle', instance=~\"$instance\"}[5m])) * 100)"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "percent",
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 70 },
              { "color": "red", "value": 90 }
            ]
          }
        }
      }
    }
  ]
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| schemaVersion | 自动迁移 | 升级时强制升级 |
| gridPos | 24 列网格 | w/h 必须是 1-24 整数 |
| refresh | 5s / 10s / 30s / 1m / 5m / 15m / 30m / 1h / 2h / 1d |
| refId | A-Z | 一个 panel 最多 26 个查询 |

**最佳实践**：
1. ✅ JSON 顶层必须有 schemaVersion，升级时用 migration function 把旧版本平迁
2. ✅ 不要让用户直接编辑 JSON（用 UI 操作 + Provisioning 自动化），防止社区出现大量野生 schema
3. ✅ `templating` 命名空间（变量）必须支持嵌套（`$instance` → `$dc` → `$env`），否则动态面板做不出来
4. ✅ Panel 的 gridPos 必须严格 24 列对齐（`x + w <= 24`），否则移动端布局会乱

### 5. 面板插件与渲染层（Panel Plugin Architecture）

**问题场景**：图表库有几十种（折线、柱状、饼图、热力图、火焰图、统计、表格、地图），每种有自己的 React 组件 + 字段映射 + 交互。核心代码不可能内嵌所有图表，必须插件化。

**解决方案**：
```typescript
// public/app/features/panel/panel.ts（基于公开知识补充）
export interface PanelPlugin<TOptions = any, TFieldConfig = any> {
    id: string;
    type: string;            // 'timeseries' | 'stat' | 'table' | 'heatmap' ...
    component: React.ComponentType<PanelProps<TOptions, TFieldConfig>>;
    editor: React.ComponentType<PanelEditorProps<TOptions>>;
    defaults: TOptions;
    fieldConfigDefaults?: FieldConfigDefaults<TFieldConfig>;
    
    // 核心钩子：把数据源返回的 DataFrame 转换成本图表能用的 series
    transformData?: (
        frames: DataFrame[],
        options: TOptions,
        fieldConfig: TFieldConfig
    ) => PanelData;
}

// 注册
const registry = new Map<string, PanelPlugin>();
export function registerPanel<T>(plugin: PanelPlugin<T>) {
    registry.set(plugin.id, plugin);
}

// 内置 25+ panel plugins
registerPanel({
    id: 'timeseries',
    type: 'timeseries',
    component: TimeSeriesPanel,
    editor: TimeSeriesEditor,
    defaults: {
        drawStyle: 'line',
        lineInterpolation: 'linear',
        fillOpacity: 10,
        showPoints: 'auto',
    }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| drawStyle | line / bars / points | 折线/柱/点 |
| lineWidth | 1-4 | 像素 |
| fillOpacity | 0-100 | 填充透明度 |
| showPoints | auto / always / never | 节点显示策略 |
| gradientMode | none / opacity / hue | 渐变方向 |

**最佳实践**：
1. ✅ Panel 组件必须接 `PanelProps` 类型，不允许直接拿 globalStore，否则无法预览
2. ✅ Editor 组件用 Form 表单 + FieldConfigField，配置项自动持久化到 JSON
3. ✅ 必须有 defaults，缺失时降级而非崩溃
4. ✅ 性能：DataFrame > 10K 点时，图表必须开启 Canvas / WebGL（uPlot / echarts / FlameGraph），不要用 SVG

## 二、架构设计与模块分层

### 6. 前端后端分离的 GWP 架构（Go + Web + Plugin）

**问题场景**：Grafana 主程序是 Go，但前端 80% 是 TypeScript/React。还需要支持 Lua 脚本（数据源脚本化）、纯二进制 Plugin（CGo）。整个进程是多语言多进程的复合体。

**解决方案**：
```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Redux + RxJS)                             │
│  ├── panels/    (25+ chart libs)                            │
│  ├── datasources/ (UI: query editor)                        │
│  └── explore/  (ad-hoc query)                               │
└──────────────────────┬──────────────────────────────────────┘
                       │ JSON / WebSocket
┌──────────────────────┴──────────────────────────────────────┐
│  Go Backend (grafana/grafana)                               │
│  ├── pkg/api/      (HTTP handlers, 200+ routes)            │
│  ├── pkg/services/ (business logic, 50+ services)          │
│  ├── pkg/infra/    (db, cache, fsnotify, tracer)            │
│  └── pkg/plugins/  (plugin loader, sandbox)                 │
│                                                              │
│  Plugin processes (sidecar, gRPC/HTTP)                      │
│  ├── Prometheus datasource (Go)                             │
│  ├── Elasticsearch datasource (Go)                          │
│  └── Custom panels (TS in browser)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ SQL / Prometheus Query
┌──────────────────────┴──────────────────────────────────────┐
│  Storage                                                    │
│  ├── SQLite / MySQL / Postgres  (用户/仪表盘/告警状态)      │
│  ├── Prometheus / ES / InfluxDB (时序数据)                  │
│  └── S3 / Azure Blob          (provisioning 备份)           │
└─────────────────────────────────────────────────────────────┘
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| API base path | `/api/v1` | 版本化 |
| 静态资源 | `/public/build/` | 打包后 |
| WebSocket 路径 | `/api/live` | 流式数据 |
| Plugin 协议 | gRPC + flatbuffers | sidecar 通信 |

**最佳实践**：
1. ✅ 前后端用 `/api/v1` 而不是 `/api`，老版本可平滑迁移
2. ✅ Plugin 必须以 sidecar 进程跑（`os/exec`），主进程崩溃不影响插件
3. ✅ Go 后端不写业务逻辑以外的 React 集成代码（避免前后端状态不一致）
4. ✅ 所有 ID 用 UUID（前端生成）而非自增（后端生成），方便分布式/导入导出

### 7. 插件签名与安全沙箱（Plugin Signing & Sandbox）

**问题场景**：Grafana 允许第三方插件（数据源/面板/应用），但任意插件 = 任意 RCE。一个恶意插件可以读取 `/etc/passwd`、执行系统命令、注入后门。如何在不放弃生态的同时保证安全？

**解决方案**：
```go
// pkg/plugins/pluginloader.go（基于公开知识补充）
type PluginSignature struct {
    Signature  string `json:"signature"`
    SignedBy   string `json:"signed_by"`
    Expiration int64  `json:"expiration"`
    Type       string `json:"type"`  // "private" / "community" / "commercial"
}

// 签名验证
func (l *PluginLoader) VerifySignature(pluginPath string) error {
    // 1. 读取 MANIFEST
    manifest, err := os.ReadFile(filepath.Join(pluginPath, "MANIFEST.txt"))
    if err != nil { return err }
    
    // 2. 解码签名
    var sig PluginSignature
    if err := base64.StdEncoding.DecodeString(sigBase64, &sig); err != nil {
        return ErrInvalidSignature
    }
    
    // 3. 验证公钥链
    pubKey, err := l.keychain.GetPublicKey(sig.SignedBy)
    if err != nil { return ErrUnknownSigner }
    
    // 4. 验证签名
    if !ed25519.Verify(pubKey, manifest, sig.Signature) {
        return ErrSignatureMismatch
    }
    
    // 5. 验证过期
    if time.Now().Unix() > sig.Expiration {
        return ErrSignatureExpired
    }
    return nil
}

// 沙箱：限制文件系统/网络
func (l *PluginLoader) SetupSandbox(plugin Plugin) error {
    // Linux: seccomp + namespaces
    // macOS: sandbox-exec
    // Windows: AppContainer
    return l.sandbox.Apply(plugin, SandboxProfile{
        AllowedPaths: []string{plugin.DataPath()},
        DeniedSyscalls: []string{"execve", "fork"},
    })
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 签名算法 | ed25519 | 256 位 |
| 签名过期 | 1-3 年 | 强制续签 |
| 沙箱级别 | strict / permissive | strict = seccomp+namespace |

**最佳实践**：
1. ✅ 默认允许 `private`（自签名）+ `community`（Grafana Labs 签），企业版额外允许 `commercial`
2. ✅ 启动时验证签名，运行中不验证（避免热加载性能损耗）
3. ✅ 沙箱白名单而非黑名单，未列出的 syscall 全部拒绝
4. ✅ 提供 `allow_loading_unsigned_plugins` 配置项给内网私有插件，但默认 false

### 8. 告警引擎与状态机（Alert Engine State Machine）

**问题场景**：告警规则会持续评估"表达式是否触发"，状态有 `Normal / Pending / Alerting / NoData / Error`。状态转换要原子化（多个评估器并发时不能 race），阈值判断要快（每秒数千规则）。

**解决方案**：
```go
// pkg/services/ngalert/eval/eval.go（基于公开知识补充）
type AlertState int

const (
    StateNormal   AlertState = iota
    StatePending             // 触发但未到 for 持续时间
    StateAlerting            // 已触发，发送通知
    StateNoData              // 无数据
    StateError               // 查询失败
)

type AlertRule struct {
    ID        int64
    OrgID     int64
    Title     string
    Condition string  // 表达式: C = A > 80
    For       time.Duration  // 持续时间 5m
    Annotations map[string]string
    Labels      map[string]string
}

// 状态机
func (e *Engine) Evaluate(rule AlertRule, results []EvalResult) {
    current := e.getState(rule.ID)
    next := e.computeState(rule, results)
    
    // 状态转换图
    switch {
    case current == StateNormal && next == StateAlerting:
        // 进入 Pending，for 计时
        e.setState(rule.ID, StatePending, time.Now())
    case current == StatePending && next == StateAlerting:
        if time.Since(e.getStartTime(rule.ID)) > rule.For {
            e.setState(rule.ID, StateAlerting, time.Now())
            e.notify(rule, results)  // 触发通知
        }
    case next == StateNormal:
        e.setState(rule.ID, StateNormal, time.Now())
        e.resolve(rule)
    }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 评估间隔 | 10s / 30s / 1m / 5m | 规则执行频率 |
| For 持续时间 | 0s / 1m / 5m | 防抖动 |
| 并发评估 | 100 / 1000 | 协程数 |
| 通知重试 | 3-5 次 | 指数退避 |

**最佳实践**：
1. ✅ 状态转换用乐观锁（version 字段）而非悲观锁，QPS 可达 10K+
2. ✅ Pending 阶段不发送通知，只 Alerting 时发，避免抖动期误报
3. ✅ 告警规则编译成表达式树（AST），避免每轮重新解析
4. ✅ 用 `inhibit_rules` / `silence_rules` 抑制重复告警（典型：一个机房断电触发 100 告警）

### 9. 用户/组织/团队的多租户模型（RBAC + Org）

**问题场景**：Grafana 面向企业售卖（OSS 也支持），一个实例要服务多组织（公司）、多团队（业务线）、多角色（Admin / Editor / Viewer）。权限粒度要做到"用户 A 在组织 B 的仪表盘 C 上有 Read 权限"。

**解决方案**：
```sql
-- 数据库 schema（基于公开知识补充）
CREATE TABLE org (
    id BIGINT PRIMARY KEY,
    name VARCHAR(255),
    address VARCHAR(255),
    created TIMESTAMP
);

CREATE TABLE user (
    id BIGINT PRIMARY KEY,
    login VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE,
    is_admin BOOLEAN,  -- 超级管理员（看所有 org）
    salt VARCHAR(50),
    rands VARCHAR(50),
    password_hash VARCHAR(255)
);

CREATE TABLE org_user (
    id BIGINT PRIMARY KEY,
    org_id BIGINT REFERENCES org(id),
    user_id BIGINT REFERENCES user(id),
    role VARCHAR(20)  -- 'Admin' / 'Editor' / 'Viewer'
);

CREATE TABLE dashboard (
    id BIGINT PRIMARY KEY,
    org_id BIGINT REFERENCES org(id),
    folder_id BIGINT,
    title VARCHAR(255),
    data JSON,  -- 完整仪表盘 JSON
    created_by BIGINT,
    created TIMESTAMP,
    updated TIMESTAMP,
    version INT
);

CREATE TABLE dashboard_acl (
    id BIGINT PRIMARY KEY,
    dashboard_id BIGINT REFERENCES dashboard(id),
    user_id BIGINT,        -- NULL = 团队级
    team_id BIGINT,
    role VARCHAR(20)        -- 'Admin' / 'Editor' / 'Viewer'
);

CREATE TABLE team (
    id BIGINT PRIMARY KEY,
    org_id BIGINT,
    name VARCHAR(255)
);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 角色 | Admin / Editor / Viewer | 三级 |
| 团队大小 | 100 用户 | 单个团队 |
| Dashboard 数量 | 100K+ | 单 org |
| 用户数 | 50K+ | 单实例企业部署 |

**最佳实践**：
1. ✅ 权限以 Org 为隔离单位，跨 Org 不可见（即使是 super admin 也需切上下文）
2. ✅ Dashboard 单独打 ACL 覆盖 team 权限，支持"分享给特定用户"
3. ✅ 默认 Dashboard 继承 Folder 权限，避免逐个配置
4. ✅ 用户名/邮箱唯一，但 SSO 用户允许 email 冲突（用 ExternalAuthUser 关联）

### 10. 配置注入与 Provisioning（Config + Provisioning）

**问题场景**：企业部署 50+ Grafana 实例时，手动 UI 配置面板/数据源/告警规则既低效又易出错。需要"基础设施即代码"——把 Grafana 配置当成代码管理（GitOps）。

**解决方案**：
```yaml
# conf/provisioning/datasources/prometheus.yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: "5s"
      queryTimeout: "60s"
      httpMethod: "POST"
    secureJsonData:
      basicAuthPassword: "${PROM_PASSWORD}"

# conf/provisioning/dashboards/cluster.yaml
apiVersion: 1

providers:
  - name: 'cluster-dashboards'
    orgId: 1
    folder: 'Cluster'
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards/cluster
      foldersFromFilesStructure: true
```

```go
// 启动时扫描 provisioning 目录（基于公开知识补充）
func (s *ProvisioningService) Run(ctx context.Context) error {
    for {
        select {
        case <-ctx.Done():
            return nil
        case <-time.After(10 * time.Second):
            // 扫描 datasources/, dashboards/, alerting/, notifiers/
            if err := s.scanDatasources(); err != nil {
                log.Error("scan datasources failed", "err", err)
            }
            if err := s.scanDashboards(); err != nil {
                log.Error("scan dashboards failed", "err", err)
            }
        }
    }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| updateIntervalSeconds | 10-300 | 文件扫描频率 |
| disableDeletion | true/false | 是否允许 UI 删除 |
| foldersFromFilesStructure | true | 文件夹结构即文件夹 |

**最佳实践**：
1. ✅ 所有 Datasource 走 provisioning，避免 UI 手点；`editable: false` 防覆盖
2. ✅ Dashboard JSON 放在 Git 仓库，Grafana 启动时自动拉取（`/var/lib/grafana/dashboards` 挂卷）
3. ✅ Secret 用 `${ENV}` 占位符，运行时从环境变量注入
4. ✅ 配合 ArgoCD/Flux 做 GitOps，配置变更全可审计

## 三、性能与渲染优化

### 11. 实时数据流与 WebSocket（Live Streaming）

**问题场景**：仪表盘刷新 5s 一次，每次 1MB 数据。100 个用户看仪表盘 = 100 × 12 req/min × 1MB = 1.2GB/min。这是巨大的带宽浪费。如何推送"增量数据"而不是"全量拉取"？

**解决方案**：
```go
// pkg/services/live/live.go（基于公开知识补充）
type LiveChannel struct {
    ID       string
    Scope    string  // 'grafana' / 'ds' / 'plugin'
    OrgID    int64
    Users    map[int64]chan *Message  // 每个用户一个 channel
}

func (s *LiveService) Subscribe(channel string, userID int64) (<-chan *Message, error) {
    ch := make(chan *Message, 100)  // 缓冲 100 条
    s.channels[channel].Users[userID] = ch
    return ch, nil
}

func (s *LiveService) Publish(channel string, msg *Message) error {
    for userID, ch := range s.channels[channel].Users {
        select {
        case ch <- msg:
        default:
            // 缓冲满，丢弃（用户跟不上）
            metrics.LiveChannelDropped.WithLabelValues(channel, "buffer_full").Inc()
            // 同时断开这个用户的连接
            delete(s.channels[channel].Users, userID)
        }
    }
    return nil
}

// 客户端 WebSocket
// ws://grafana:3000/api/live/ws
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| WebSocket ping | 30s | 心跳 |
| 缓冲大小 | 100 条 | 客户端缓冲 |
| 压缩 | permessage-deflate | 减少 70% 流量 |
| 重连退避 | 1s, 2s, 4s, 8s, max 30s | 指数退避 |

**最佳实践**：
1. ✅ 客户端订阅前先 Query 一次初始数据，之后 WebSocket 推增量
2. ✅ 缓冲满时不要阻塞推送端，丢弃并断连（避免 OOM）
3. ✅ 用 permessage-deflate 压缩，单连接可达 100KB/s
4. ✅ 多 Grafana 实例时，Live 状态走 Redis Pub/Sub 而不是本地内存

### 12. 客户端缓存与查询去重（Query Caching）

**问题场景**：50 个 panel 共享一个数据源查询，相同 PromQL 重复执行 50 次。500 panel 的 dashboard 会让后端 Prometheus 直接 OOM。如何在客户端/服务端层面做查询去重？

**解决方案**：
```go
// pkg/infra/cache/cache.go（基于公开知识补充）
type QueryCache struct {
    ttl    time.Duration
    memCache *ristretto.Cache
}

type QueryCacheKey struct {
    DatasourceUID string
    Query         string
    TimeRange     TimeRange
    MaxDataPoints int
    IntervalMs    int64
}

func (c *QueryCache) Get(key QueryCacheKey) (*QueryResponse, bool) {
    h := hashKey(key)
    if v, found := c.memCache.Get(h); found {
        metrics.QueryCacheHit.WithLabelValues(key.DatasourceUID).Inc()
        return v.(*QueryResponse), true
    }
    metrics.QueryCacheMiss.WithLabelValues(key.DatasourceUID).Inc()
    return nil, false
}

func (c *QueryCache) Set(key QueryCacheKey, resp *QueryResponse) {
    c.memCache.SetWithTTL(
        hashKey(key),
        resp,
        1,
        c.ttl,
    )
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| TTL | 60s | 缓存过期时间 |
| 容量 | 100MB / 1GB | 内存限制 |
| 命中率 | > 60% | 期望值 |
| EvictionPolicy | LFU | 优于 LRU |

**最佳实践**：
1. ✅ 缓存 Key 必须含 Datasource + Query + TimeRange + Step，缺一不可
2. ✅ 启用 QueryCaching 后，500 panel 的 dashboard 请求量降到 50-100
3. ✅ 用户切时间范围时主动清空缓存
4. ✅ 用 Ristretto（Go 的高性能 LFU 缓存）而非 sync.Map

### 13. 大数据量下采样（Downsampling with LTTB）

**问题场景**：用户看"过去 30 天"数据，原始 30 × 86400 = 260 万个点。直接画图浏览器卡死。需要下采样到 ~1000 点但保留趋势。

**解决方案**：
```go
// pkg/infra/algorithm/lttb.go（基于公开知识补充）
// LTTB = Largest Triangle Three Buckets
// 保留视觉特征的最快下采样算法，O(n)
func LTTB(data []Point, threshold int) []Point {
    if threshold >= len(data) || threshold <= 2 {
        return data
    }
    
    sampled := make([]Point, 0, threshold)
    sampled = append(sampled, data[0])  // 第一个点必保留
    
    bucketSize := float64(len(data)-2) / float64(threshold-2)
    a := 0  // 上一个采样点索引
    
    for i := 0; i < threshold-2; i++ {
        // 计算下一个 bucket 的平均点（用于三角形面积）
        avgRangeStart := int(float64(i+1) * bucketSize) + 1
        avgRangeEnd := int(float64(i+2) * bucketSize) + 1
        if avgRangeEnd >= len(data) {
            avgRangeEnd = len(data) - 1
        }
        
        avgX, avgY := averagePoint(data[avgRangeStart:avgRangeEnd])
        
        // 在当前 bucket 找最大三角形面积的点
        rangeStart := int(float64(i) * bucketSize) + 1
        rangeEnd := int(float64(i+1) * bucketSize) + 1
        
        maxArea := -1.0
        maxIdx := rangeStart
        for j := rangeStart; j < rangeEnd; j++ {
            area := triangleArea(
                data[a].X, data[a].Y,
                data[j].X, data[j].Y,
                avgX, avgY,
            )
            if area > maxArea {
                maxArea = area
                maxIdx = j
            }
        }
        sampled = append(sampled, data[maxIdx])
        a = maxIdx
    }
    
    sampled = append(sampled, data[len(data)-1])  // 最后一个点必保留
    return sampled
}

func triangleArea(ax, ay, bx, by, cx, cy float64) float64 {
    return math.Abs((ax-cx)*(by-cy) - (bx-cx)*(ay-cy)) / 2
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| threshold | 1000-2000 | 目标点数 |
| bucketSize | n/threshold | 自动计算 |
| 时间复杂度 | O(n) | 单次扫描 |

**最佳实践**：
1. ✅ 前端用 LTTB 之前，先让数据源做 step 1m 聚合（带宽减 60 倍）
2. ✅ LTTB 比简单"每 N 个点取 1 个"保留更多尖峰
3. ✅ 始终保留第一个和最后一个点（保证起止准确）
4. ✅ 客户端下采样不要超过 5000 点，否则浏览器渲染掉帧

### 14. 表格虚拟滚动与 Canvas 渲染（Virtualization）

**问题场景**：仪表盘里"Table"面板展示 100K 行日志。直接渲染 100K 个 `<tr>` = 浏览器卡 30 秒。需要虚拟滚动 + Canvas 渲染。

**解决方案**：
```typescript
// public/app/features/table/TablePanel.tsx（基于公开知识补充）
import { FixedSizeList } from 'react-window';

export const TablePanel: FC<PanelProps> = ({ data, options }) => {
    const rows = data.series[0]?.fields.find(f => f.type === FieldType.string)?.values;
    const height = 800;
    const rowHeight = 30;
    
    return (
        <AutoSizer>
            {({ width, height }) => (
                <FixedSizeList
                    height={height}
                    width={width}
                    itemSize={rowHeight}
                    itemCount={rows?.length || 0}
                    overscanCount={10}
                >
                    {({ index, style }) => (
                        <div style={style}>
                            {/* 只渲染可见行 + overscan */}
                            {rows.get(index)}
                        </div>
                    )}
                </FixedSizeList>
            )}
        </AutoSizer>
    );
};

// 大数据量时用 Canvas 渲染
class CanvasTable {
    private ctx: CanvasRenderingContext2D;
    
    render(rows: any[], scrollTop: number) {
        const startIdx = Math.floor(scrollTop / this.rowHeight);
        const endIdx = startIdx + Math.ceil(this.height / this.rowHeight);
        
        // 只画可见的行
        for (let i = startIdx; i <= endIdx; i++) {
            const y = i * this.rowHeight - scrollTop;
            this.ctx.fillText(rows[i].col1, 10, y);
            this.ctx.fillText(rows[i].col2, 200, y);
            this.ctx.fillText(rows[i].col3, 400, y);
        }
    }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| rowHeight | 24-32 | 固定行高 |
| overscanCount | 5-10 | 预渲染行数 |
| 列数 | < 50 | 超出滚动 |
| 行数 | < 1M | 超出分页 |

**最佳实践**：
1. ✅ 用 react-window / react-virtual 库而非自己实现，bug 少
2. ✅ 表格宽度自适应用 AutoSizer，不要硬编码像素
3. ✅ 列固定（前 N 列）用 position: sticky + z-index，避免横向滚动时错乱
4. ✅ 数据量 > 100K 时用 Canvas（react-canvas / regl），DOM 性能到顶

### 15. 面板懒加载与代码分割（Lazy Loading）

**问题场景**：Grafana 有 25+ 内置 panel 插件 + 几百个第三方 panel。每个 panel 完整 import 到主 bundle，bundle size 突破 50MB，首屏加载 30 秒。需要按需加载。

**解决方案**：
```typescript
// public/app/features/panel/registry.ts（基于公开知识补充）
import { lazy, Suspense } from 'react';

// 异步加载 panel
const TimeSeriesPanel = lazy(() => import('./timeseries/TimeSeriesPanel'));
const BarChartPanel = lazy(() => import('./barchart/BarChartPanel'));
const HeatmapPanel = lazy(() => import('./heatmap/HeatmapPanel'));
const FlameGraphPanel = lazy(() => import('./flamegraph/FlameGraphPanel'));

// 动态注册
const panelRegistry = new Map<string, () => Promise<{ default: PanelPlugin }>>();

panelRegistry.set('timeseries', () => import('./timeseries'));
panelRegistry.set('barchart', () => import('./barchart'));
panelRegistry.set('heatmap', () => import('./heatmap'));

// 渲染时按需加载
const PanelRenderer: FC<{ type: string }> = ({ type }) => {
    const [Plugin, setPlugin] = useState<PanelPlugin | null>(null);
    
    useEffect(() => {
        panelRegistry.get(type)?.().then(m => setPlugin(m.default));
    }, [type]);
    
    if (!Plugin) return <LoadingPanel />;
    return <Plugin.component {...props} />;
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| chunk size | < 200KB | 单个 panel 目标 |
| 首屏 panel | 1-3 个 | 预加载 |
| 缓存策略 | browser cache | 长期有效 |
| 预加载策略 | hover 触发 | 用户停留时后台拉 |

**最佳实践**：
1. ✅ 每个 Panel 单独成 chunk，主 bundle 不超过 1MB
2. ✅ Webpack splitChunks + dynamic import 配合，避免重复打包
3. ✅ 加载时显示骨架屏（skeleton），不要 spinner
4. ✅ 关键 panel（timeseries / stat）走 HTTP/2 push 或 `<link rel="preload">` 预取

## 四、可靠性与生态工程

### 16. 数据库迁移与版本管理（Schema Migration）

**问题场景**：Grafana 支持 SQLite / MySQL / Postgres 三种后端。Schema 变更必须跨这三种数据库保持一致。手动 SQL 脚本容易出 bug，升级时还会面临"老数据要不要 migrate"的问题。

**解决方案**：
```go
// pkg/services/sqlstore/migrator/migrator.go（基于公开知识补充）
type Migration struct {
    Id            string
    Description   string
    Up            func(tx *sql.Tx) error  // 升级
    Down          func(tx *sql.Tx) error  // 回滚
}

type Migrator struct {
    db        *sql.DB
    dialect   Dialect  // mysql/postgres/sqlite
    migrations []Migration
    log       log.Logger
}

func (m *Migrator) Run() error {
    // 1. 读取当前已执行的 migration
    executed, err := m.getExecutedMigrations()
    if err != nil { return err }
    
    // 2. 按顺序执行未执行的
    for _, mig := range m.migrations {
        if _, ok := executed[mig.Id]; ok {
            continue
        }
        
        // 3. 在事务中执行
        tx, err := m.db.Begin()
        if err != nil { return err }
        
        if err := mig.Up(tx); err != nil {
            tx.Rollback()
            return fmt.Errorf("migration %s failed: %w", mig.Id, err)
        }
        
        // 4. 记录已执行
        if _, err := tx.Exec(
            "INSERT INTO migration_log (id, performed_at) VALUES (?, ?)",
            mig.Id, time.Now(),
        ); err != nil {
            tx.Rollback()
            return err
        }
        
        if err := tx.Commit(); err != nil {
            return err
        }
        m.log.Info("migration applied", "id", mig.Id)
    }
    return nil
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Migration ID | 数字 | 顺序执行 |
| 跨方言 | 3 套 | sqlite/mysql/pg |
| 事务 | required | 每步独立 |
| 失败回滚 | 自动 | 启动时检测 |

**最佳实践**：
1. ✅ Migration 不可逆就不写 Down 函数（Drop Column 写警告注释）
2. ✅ 启动时检测"脏数据库"（migration_log 与 schema 不一致），立即拒绝启动
3. ✅ 大表 ALTER TABLE 用 `pt-online-schema-change` / `pg_repack` 避免锁表
4. ✅ 每个 migration 都附"性能测试"（1000 万行数据下执行时间）

### 17. 链接追踪与可观测性（Tracing）

**问题场景**：用户报告"仪表盘加载很慢"，但 Go 后端有几百个 handler、几十个 service、20+ 数据源。问题出在哪一段代码？CPU 90% 在 JSON 序列化？还是数据源 HTTP 慢？

**解决方案**：
```go
// pkg/infra/tracing/tracing.go（基于公开知识补充）
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
)

var tracer = otel.Tracer("grafana")

// HTTP handler 中
func (hs *HTTPServer) handleQueryData(c *models.ReqContext) {
    ctx, span := tracer.Start(c.Req.Context(), "queryData.handler",
        trace.WithAttributes(
            attribute.String("datasource", c.Params("uid")),
            attribute.String("query.expr", c.Query("expr")),
            attribute.Int("query.range", c.QueryInt("range")),
        ),
    )
    defer span.End()
    
    // 子 span: 数据源查询
    ctx, dsSpan := tracer.Start(ctx, "datasource.query")
    result, err := hs.DataService.Query(ctx, req)
    dsSpan.End()
    
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return
    }
    
    // 子 span: 转换
    ctx, transformSpan := tracer.Start(ctx, "transform.frame")
    frames := transformToFrames(result)
    transformSpan.End()
    
    c.JSON(200, frames)
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 采样率 | 0.1 (生产) | 不全采 |
| Exporter | OTLP / Jaeger / Tempo | 多种后端 |
| Span 属性 | 10-20 | 不超 |
| Batch | 512 / 5s | 批量发送 |

**最佳实践**：
1. ✅ 关键路径必须打 span：HTTP → DataSource → Backend → Transform → Response
2. ✅ Span 属性包含业务上下文（datasource.uid、user.id、org.id），便于按维度过滤
3. ✅ 错误必须 `RecordError` + `SetStatus(codes.Error)`，否则链路分析看不到
4. ✅ 用 Tail-based sampling：保留错误和慢请求，正常请求抽样 1%

### 18. 单元测试与端到端测试（Testing Strategy）

**问题场景**：Grafana 涉及 Go + TypeScript + SQL + 数据源集成，任何一层改动都可能破坏其他层。需要"分层测试"——单测验证逻辑、集成测验证接口、端到端验证真实流程。

**解决方案**：
```go
// 单元测试：pkg/services/alerting/alerting_test.go（基于公开知识补充）
func TestEvaluateAlertState(t *testing.T) {
    tests := []struct{
        name     string
        current  AlertState
        next     AlertState
        forTime  time.Duration
        elapsed  time.Duration
        want     AlertState
    }{
        {"normal_to_alerting_immediate", StateNormal, StateAlerting, 0, 0, StatePending},
        {"pending_to_alerting_after_for", StatePending, StateAlerting, 5*time.Minute, 6*time.Minute, StateAlerting},
        {"pending_to_normal_resets", StatePending, StateNormal, 5*time.Minute, 1*time.Minute, StateNormal},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            engine := &Engine{now: func() time.Time { return time.Unix(0, 0).Add(tt.elapsed) }}
            got := engine.EvaluateState(tt.current, tt.next, tt.forTime, AlertRule{})
            if got != tt.want {
                t.Errorf("got %v, want %v", got, tt.want)
            }
        })
    }
}

// 端到端测试：e2e/dashboards-suite.ts
describe('Dashboard smoke test', () => {
    let grafana: Grafana;
    
    beforeAll(async () => {
        grafana = await createGrafana({
            datasources: [testDataSource({ type: 'testdata' })],
        });
    });
    
    it('should load dashboard with panels', async () => {
        const page = await grafana.newPage();
        await page.goto('/d/test-dashboard');
        
        // 等待所有 panel 加载完成
        await page.waitForFunction(() => {
            const panels = document.querySelectorAll('[data-testid^="panel-"]');
            return Array.from(panels).every(p => !p.querySelector('.panel-loading'));
        }, { timeout: 30000 });
        
        const panels = await page.$$('[data-testid^="panel-"]');
        expect(panels.length).toBe(3);
    });
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 单测覆盖率 | > 70% | 关键包 > 90% |
| 端到端测试 | 50+ 场景 | 关键用户路径 |
| Cypress 并发 | 5 | CI 并行 |
| Mock 框架 | testify/mock | Go |

**最佳实践**：
1. ✅ Go 单测 70% 覆盖率起，关键包（alerting / datasources / auth）90%+
2. ✅ TypeScript 用 Jest + Testing Library，覆盖率 60%+
3. ✅ 端到端用 Cypress，每个 PR 跑 smoke（10 个核心场景）
4. ✅ 测试用 SQLite（默认）跑得最快，MySQL/PG 跑 nightly 兼容测试

### 19. 部署模式与高可用（Deployment Patterns）

**问题场景**：企业用 Grafana 监控几千个服务、一个实例挂了不可接受。如何部署才能高可用？是否需要 LB？是否需要共享数据库？无状态还是带状态？

**解决方案**：
```
高可用部署架构（基于公开知识补充）

                ┌────────────────────┐
                │   Load Balancer    │
                │   (Nginx / AWS ELB)│
                └──────────┬─────────┘
                           │ Round Robin / Sticky Session
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │Grafana 1│        │Grafana 2│        │Grafana 3│
   │  :3000  │        │  :3000  │        │  :3000  │
   └────┬────┘        └────┬────┘        └────┬────┘
        └──────────────────┼──────────────────┘
                           ▼
                ┌────────────────────┐
                │   MySQL / Postgres │  元数据（用户/仪表盘/告警）
                │   (主从或集群)      │
                └──────────┬─────────┘
                           │
                ┌──────────┴─────────┐
                ▼                    ▼
   ┌────────────────────┐  ┌────────────────────┐
   │   S3 / 共享存储     │  │   Redis Cluster    │
   │  (Provisioning)    │  │  (Cache / Pub/Sub) │
   └────────────────────┘  └────────────────────┘
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 副本数 | 3+ | HA 最低要求 |
| LB 算法 | Round Robin | 无状态 |
| Session | Sticky 可选 | 告警静默页 |
| 数据库 | MySQL/PG | 元数据 |
| 共享存储 | S3 / NFS | Provisioning |

**最佳实践**：
1. ✅ Grafana 实例必须无状态：所有状态进 DB / Redis / S3，本地只放临时缓存
2. ✅ 数据库做主从（写主读从），跨可用区部署
3. ✅ Session 数据放 Redis 而非内存，多实例共享
4. ✅ 监控 Grafana 自身（"吃狗粮"）：用 Prometheus 抓 Grafana /metrics
5. ✅ 滚动更新：实例先标记 unhealthy → LB 踢掉 → 启新版本 → 健康检查通过 → 接入流量

### 20. 插件生态与开发者体验（Plugin Ecosystem）

**问题场景**：Grafana 的"长尾数据源/面板"不能都由官方维护。生态是关键——第三方开发者必须能快速开发、发布、被发现、获得收益。如何建立健康的插件市场？

**解决方案**：
```
插件开发生命周期（基于公开知识补充）

┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│  开发          │    │  签名          │    │  发布          │
│  ─ npm create  │ →  │  ─ grafana-    │ →  │  ─ grafana-cli │
│    @grafana/   │    │    plugin sign │    │    plugin      │
│    scaffold    │    │  ─ 私钥签名     │    │    install     │
│  ─ TypeScript  │    │  ─ 上传证书     │    │  ─ Grafana     │
│    + React     │    │                │    │    Cloud       │
└────────────────┘    └────────────────┘    └────────────────┘
        │                                            │
        │                                            ▼
        │                                   ┌────────────────┐
        │                                   │  发现与变现    │
        │                                   │  ─ grafana.com │
        │                                   │  ─ 安装统计     │
        │                                   │  ─ 商业认证     │
        │                                   │  ─ 价格分级     │
        │                                   └────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│  工具链                                                  │
│  ─ @grafana/toolkit: build/test/package                │
│  ─ @grafana/data: 共享类型                              │
│  ─ @grafana/runtime: React hooks / services            │
│  ─ @grafana/ui: 50+ 共享组件                            │
│  ─ @grafana/e2e: 测试工具                              │
└────────────────────────────────────────────────────────┘
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 插件数 | 600+ | grafana.com/plugins |
| 安装量 | 100M+ | 累计 |
| 包大小 | < 50MB | 单插件 |
| 启动时间 | < 500ms | 插件加载 |

**最佳实践**：
1. ✅ 提供 `@grafana/create-plugin` 脚手架，30 秒生成完整插件（含 CI/Docker）
2. ✅ 公开 `@grafana/data` 类型定义，第三方 IDE 智能提示
3. ✅ 社区插件必须签名才能在生产加载（避免恶意代码）
4. ✅ Grafana Cloud 提供"按使用付费"商业插件托管，开发者获得 70% 收入分成
5. ✅ 插件市场有"安装量 / 评分 / 更新频率"三维筛选，避免低质插件泛滥

---

**标签**：#grafana #可视化 #时序数据
**状态**：20/20 份详细内容
