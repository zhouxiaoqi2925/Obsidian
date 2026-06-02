// 来源: prometheus web/web.go:API.queryHandler + query_range
// 作用: HTTP API 入口 — /api/v1/query /api/v1/query_range
// 调用链: HTTP → router → handler → queryEngine → JSON
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] RESTful API 设计的 4 个核心
//   - /api/v1/query        即时查询: 单时间点
//   - /api/v1/query_range  范围查询: time series, 用于画图
//   - /api/v1/series       查 series 列表 (按 label)
//   - /api/v1/labels        查 label 列表
//   - /api/v1/metadata     series 元数据 (unit, help)
//   - 优势: 简单, 任何 HTTP client 都能用
//
// [WHY-2] query vs query_range 的本质差异
//   - query: 单时间点 → Vector
//     - 用途: 当前 dashboard 数值
//     - 示例: GET /api/v1/query?query=up&time=1700000000
//   - query_range: 时间范围 + step → Matrix
//     - 用途: 折线图
//     - 示例: GET /api/v1/query_range?query=rate(x[5m])&start=...&end=...&step=15s
//     - 返回: (end-start)/step + 1 个数据点
//   - 关键: range query 是多个 instant query 串行
//
// [WHY-3] 限流 + Timeout + 错误码
//   - 限流: connection limit, query queue (--query.max-concurrency)
//   - Timeout: --query.timeout=2m, 超过取消 query
//   - 错误码:
//     - 400 Bad Request: 参数错
//     - 422 Unprocessable Entity: query 语法错
//     - 503 Service Unavailable: Prom 关闭中
//     - 504 Gateway Timeout: query 超时
//   - 关键: timeout 触发 ctx.Cancel, 客户端可感知
//
// [WHY-4] 响应格式 + 序列化
//   - 通用格式:
//     {
//       "status": "success" | "error",
//       "data": { "resultType": "vector", "result": [...] },
//       "errorType": "...",
//       "error": "..."
//     }
//   - 优势: 客户端解析简单, JSON 跨语言
//   - 性能: 单 query 响应 ~ 几 KB, 大 query range ~ 几 MB
//   - 优化: stream 响应 (text/event-stream), 减少延迟
//
// [WHY-5] Federation + Remote 协议
//   - Federation: 跨 Prom 联邦 (Prom 拉 Prom)
//     - 通过 /federate 端点
//     - 选 series: match[]={__name__="..."}
//   - Remote Read/Write: 客户端与远端 TSDB 通信
//     - Remote Write: Prom 主动推给远端 (Thanos/Mimir)
//     - Remote Read: 客户端主动从远端拉
//   - 关键: 联邦 + remote write = 横向扩展 + 长期存储
// ================================================================

// === API 主结构 ===
type API struct {
    queryEngine  *promql.Engine
    storage      storage.Storage
    // ... 配置
}

// === queryHandler 即时查询 (核心, 简化) ===
func (h *API) queryHandler(w http.ResponseWriter, r *http.Request) {
    // [WHY-3] 1. 解析参数
    params := r.URL.Query()
    query := params.Get("query")
    if query == "" {
        respondError(w, &apiError{
            typ: badData,
            err: errors.New("query parameter is required"),
        }, http.StatusBadRequest)
        return
    }

    // 1.1 解析时间 (默认 now)
    t, err := parseTime(params.Get("time"))
    if err != nil {
        respondError(w, &apiError{typ: badData, err: err}, http.StatusBadRequest)
        return
    }

    // 1.2 timeout
    timeout := h.queryEngine.Timeout()
    if t := params.Get("timeout"); t != "" {
        d, err := parseDuration(t)
        if err == nil { timeout = d }
    }

    // 2. 创建 query (ctx with timeout)
    ctx, cancel := context.WithTimeout(r.Context(), timeout)
    defer cancel()

    q, err := h.queryEngine.NewInstantQuery(ctx, h.storage, nil, query, t)
    if err != nil {
        respondError(w, &apiError{typ: badData, err: err}, http.StatusBadRequest)
        return
    }
    defer q.Close()

    // 3. 执行
    res := q.Exec(ctx)
    if res.Err != nil {
        // [WHY-3] 不同错误返回不同 HTTP code
        switch res.Err.(type) {
        case promql.ErrQueryCanceled:
            respondError(w, &apiError{typ: canceled, err: res.Err}, http.StatusServiceUnavailable)
        case promql.ErrQueryTimeout:
            respondError(w, &apiError{typ: timeout, err: res.Err}, http.StatusServiceUnavailable)
        default:
            respondError(w, &apiError{typ: internal, err: res.Err}, http.StatusInternalServerError)
        }
        return
    }

    // [WHY-4] 4. 序列化为 JSON 响应
    respondJSON(w, &queryData{
        ResultType: res.Value.Type(),
        Result:     res.Value,
    })
}

// === query_range 范围查询 (核心, 简化) ===
func (h *API) queryRangeHandler(w http.ResponseWriter, r *http.Request) {
    // 1. 解析参数
    params := r.URL.Query()
    query := params.Get("query")
    start, _ := parseTime(params.Get("start"))
    end, _ := parseTime(params.Get("end"))
    step, _ := parseDuration(params.Get("step"))

    // 1.1 step 校验
    if step <= 0 {
        respondError(w, &apiError{typ: badData, err: errors.New("step must be > 0")}, http.StatusBadRequest)
        return
    }

    // 1.2 限制最多 11k 数据点 (11000 = 11000/15s = 1.9d)
    if end.Sub(start)/step > 11000 {
        respondError(w, &apiError{...}, http.StatusBadRequest)
        return
    }

    // 2. 创建 query
    q, err := h.queryEngine.NewRangeQuery(ctx, h.storage, nil, query, start, end, step)
    if err != nil { ... }

    // 3. 执行
    res := q.Exec(ctx)

    // 4. 响应: Matrix 类型 (含 series + 每 series 多 sample)
    respondJSON(w, &queryData{
        ResultType: res.Value.Type(),  // "matrix"
        Result:     res.Value,         // [{metric: {...}, values: [[t, v], ...]}, ...]
    })
}

// === Federation 端点 ===
// GET /federate?match[]={__name__="up"}&match[]={__name__="node_cpu"}
func (h *API) federate(w http.ResponseWriter, r *http.Request) {
    // 1. 解析 match[] selectors
    matches := r.URL.Query()["match[]"]
    if len(matches) == 0 {
        http.Error(w, "match[] parameter required", http.StatusBadRequest)
        return
    }

    // 2. 创建 federation query
    q, err := h.queryEngine.NewInstantQuery(ctx, h.storage, nil, matches[0], time.Now())
    // ...

    // 3. 文本协议输出 (not JSON)
    //    # HELP up 1 if up, 0 if down
    //    # TYPE up gauge
    //    up{instance="server1"} 1 1700000000000
    //    up{instance="server2"} 0 1700000000000
    enc := expfmt.NewEncoder(w, expfmt.FmtText)
    for _, sample := range res.Value {
        enc.Encode(sample.Metric, sample.V, sample.T)
    }
}

// === 错误响应 ===
type apiError struct {
    typ errorType
    err error
}

func respondError(w http.ResponseWriter, apiErr *apiError, code int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    json.NewEncoder(w).Encode(map[string]any{
        "status":    "error",
        "errorType": apiErr.typ.String(),
        "error":     apiErr.err.Error(),
    })
}

// === 成功响应 ===
type queryData struct {
    ResultType parser.ValueType  // "vector" | "matrix" | "scalar"
    Result     parser.Value
}

func respondJSON(w http.ResponseWriter, data *queryData) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]any{
        "status": "success",
        "data":   data,
    })
}

// ================================================================
// 性能数据 (1M series, 8 核):
//
// [query (即时)]
//   - 简单 (up): ~10ms
//   - 中等 (rate): ~50-200ms
//   - 复杂 (10+ 嵌套): ~500ms-2s
//
// [query_range (范围)]
//   - 1h × 15s step = 240 点: ~50-200ms
//   - 1d × 1m step = 1440 点: ~200-800ms
//   - 30d × 1h step = 720 点: ~500ms-2s
//
// [Federation]
//   - 1k series: ~50ms
//   - 100k series: ~1-5s
//   - 输出大小: 80-150 bytes/series
//
// 关键配置:
//   - --web.enable-lifecycle       # POST /-/reload 热重载
//   - --web.enable-remote-write-receiver  # 接收 remote write
//   - --web.concurrency.limits=20  # HTTP 并发
//   - --query.timeout=2m
//
// 错误码速查:
//   - 400: 参数错 (空 query, step 错)
//   - 422: PromQL 语法错
//   - 503: Prom 启动中 / 关闭中
//   - 504: query 超时
//
// 客户端示例 (curl):
//   # 即时查询
//   curl 'http://prom:9090/api/v1/query?query=up'
//
//   # 范围查询 (画图)
//   curl 'http://prom:9090/api/v1/query_range?query=rate(http_requests_total[5m])&start=2024-01-01T00:00:00Z&end=2024-01-01T01:00:00Z&step=15s'
//
//   # 联邦
//   curl 'http://prom:9090/federate?match[]={__name__="up"}'
//
// 监控自身:
//   - prometheus_http_requests_total{handler="/api/v1/query"}
//   - prometheus_http_request_duration_seconds
//   - up{job="prometheus"}  # Prom 自身是否健康
// ================================================================
