// 来源: prometheus promql/engine.go:Engine.NewInstantQuery
// 作用: PromQL 即时查询入口 — parse → analyze → optimize → exec
// 调用链: NewInstantQuery → query.Exec → eval → VectorSelector
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] PromQL 4 阶段流水线
//   - 1. Parse: 字符串 → AST (抽象语法树)
//     - Lexer 分词, Parser 递归下降
//     - 输出: *Expr (Selectors / FunctionCall / AggregateExpr / BinaryExpr)
//   - 2. Analyze: 语义分析
//     - 校验函数参数类型
//     - 校验 label 名合法
//     - 注入隐式 context (lookback delta, eval time)
//   - 3. Optimize: 优化
//     - 谓词下推 (label match 提前)
//     - 常量折叠 (1+1 → 2)
//     - 公共子表达式消除
//   - 4. Exec: 懒执行
//     - 调用 query.Exec(ctx) 才真正算
//     - 返回 *Vector / *Matrix / *Scalar
//
// [WHY-2] 懒执行的工程意义
//   - 解析时只生成 plan, 不算数据
//   - 真用时 (Exec) 才查 TSDB, 走算子
//   - 关键: timeout 通过 ctx 控制, 取消时停止所有算子
//   - 优势: 解析快 (μs), 可以预热/缓存 plan
//   - QueryTracker 跟踪所有 active query, OOM 时取消最大
//
// [WHY-3] 一致性哈希分片 (concurrency)
//   - 大查询: 按 series 拆, 多 goroutine 并行
//   - 实现: 每个 query 一个 engine.shard, 走 series hash 取模
//   - 关键: 避免 1 个大 query 阻塞所有 query
//   - 配置: --query.max-concurrency=20 (默认)
//   - 实际: 100k series 的 query, 8 核拆 8 个分片, 5x 加速
//
// [WHY-4] QueryTracker + 慢查询保护
//   - 每个 query 注册到 Tracker (插入活跃列表)
//   - 周期 GC: 取消超过 timeout 的 query
//   - 主动取消: 用 ctx.Cancel, 传播到所有算子
//   - OOM 保护: 限制 max samples in memory (默认 50M)
//   - 慢查询日志: query log, 找热点
//
// [WHY-5] 算子 (Operator) 模型
//   - VectorSelector: 按 label 匹配 series, 在某时间点取值
//   - MatrixSelector: 同上, 但取时间范围
//   - FunctionCall: 调内置函数 (rate, increase, histogram_quantile)
//   - AggregateExpr: sum by, avg by, count without
//   - BinaryExpr: +, -, *, /, >, <, and, or
//   - 关键: 算子可组合, 表达式 → 算子树 → 递归执行
// ================================================================

// === Engine 主结构 (简化) ===
type Engine struct {
    logger      *slog.Logger
    metrics     *engineMetrics
    timeout     time.Duration
    lookbackDelta time.Duration
    maxSamples  int           // 单 query 内存限制
    activeQueriesTracker *QueryTracker
    // ... 分片相关
}

// === NewInstantQuery 即时查询 (核心, 简化) ===
func (ng *Engine) NewInstantQuery(
    ctx context.Context,
    q storage.Queryable,
    opts QueryOpts,
    qs string,
    ts time.Time,  // 评估时间点
) (Query, error) {
    // [WHY-1] 1. Parse: 字符串 → AST
    expr, err := ParseExpr(qs)
    if err != nil {
        return nil, fmt.Errorf("parse error: %w", err)
    }

    // 2. Analyze: 语义分析 + 类型检查
    if err := ng.analyzeAndValidate(expr); err != nil {
        return nil, err
    }

    // 3. Optimize: 谓词下推 + 常量折叠
    optimized := ng.optimize(expr)

    // [WHY-2] 4. 生成 query 对象 (懒执行)
    qry := &query{
        stmt:    optimized,
        ts:      ts,
        querier: q,
        opts:    opts,
        engine:  ng,
        cancel:  func() {},  // 占位
    }

    // [WHY-4] 5. 注册到 active query tracker
    ctx, cancel := context.WithTimeout(ctx, ng.timeout)
    qry.cancel = cancel
    ng.activeQueriesTracker.Insert(qry)

    return qry, nil
}

// === query.Exec: 懒执行入口 ===
func (q *query) Exec(ctx context.Context) *Result {
    defer q.cancel()  // 执行完取消 ctx

    // [WHY-1] 入口: 启动 evaluator
    evaluator := q.evaluator()
    val, err := evaluator.Eval(ctx, q.ts)
    if err != nil {
        return &Result{Err: err}
    }

    return &Result{Value: val, ...}
}

// === 关键算子: VectorSelector ===
type VectorSelector struct {
    metricName string
    labelMatchers []*labels.Matcher
    offset time.Duration
    // ...
}

func (s *VectorSelector) Eval(ctx context.Context, ts int64) (Vector, error) {
    // [WHY-5] 1. 查 TSDB: 按 label matcher 找 series
    series, err := s.storage.Select(s.labelMatchers, ts)
    if err != nil { return nil, err }

    // 2. 每个 series 取最接近 ts 的 sample
    vec := make(Vector, 0, len(series))
    for _, s := range series {
        sample := s.getSampleAt(ts)  // 二分查找最近的
        if sample != nil {
            vec = append(vec, &Sample{
                Metric: s.lset,
                T:      sample.t,
                V:      sample.v,
            })
        }
    }
    return vec, nil
}

// === 关键算子: rate 函数 (rate(x[5m]) → 求导数) ===
type functionCall struct {
    funcName string
    args     []Expr
}

func (fc *functionCall) Eval(ctx context.Context, ts int64) (Vector, error) {
    // 1. 先算参数: matrix
    matrixArg, err := fc.args[0].Eval(ctx, ts)
    if err != nil { return nil, err }

    // 2. 应用 rate 公式
    //    rate = (last - first) / (last.t - first.t)
    vec := make(Vector, 0, len(matrixArg))
    for _, ss := range matrixArg {
        if len(ss) < 2 { continue }
        first, last := ss[0], ss[len(ss)-1]
        dur := float64(last.t - first.t) / 1000  // ms → s
        rate := (last.v - first.v) / dur
        vec = append(vec, &Sample{
            Metric: ss.Metric,
            T:      ts,
            V:      rate,
        })
    }
    return vec, nil
}

// === 关键算子: AggregateExpr (sum by (label)) ===
type AggregateExpr struct {
    op       string         // sum, avg, count, min, max
    grouping []string       // 聚合维度
    expr     Expr
}

func (a *AggregateExpr) Eval(ctx context.Context, ts int64) (Vector, error) {
    // 1. 算子表达式
    inner, err := a.expr.Eval(ctx, ts)
    if err != nil { return nil, err }

    // 2. 按 grouping 聚合
    groups := make(map[uint64]*groupedAggregation)
    for _, sample := range inner {
        key := a.groupKey(sample.Metric)
        if _, ok := groups[key]; !ok {
            groups[key] = &groupedAggregation{
                labels: a.dropLabels(sample.Metric, a.grouping),
                values: []float64{},
            }
        }
        groups[key].values = append(groups[key].values, sample.V)
    }

    // 3. 应用聚合函数
    vec := make(Vector, 0, len(groups))
    for _, g := range groups {
        vec = append(vec, &Sample{
            Metric: g.labels,
            T:      ts,
            V:      aggregate(a.op, g.values),
        })
    }
    return vec, nil
}

// === QueryTracker 活跃查询管理 ===
type QueryTracker struct {
    mu      sync.Mutex
    queries map[uint64]*query
    max     int  // 内存中最大 sample 数
}

func (t *QueryTracker) Insert(q *query) {
    t.mu.Lock()
    defer t.mu.Unlock()
    t.queries[q.qid] = q
}

func (t *QueryTracker) Delete(qid uint64) {
    t.mu.Lock()
    defer t.mu.Unlock()
    delete(t.queries, qid)
}

// 周期 GC: 取消超时或内存超限的
func (t *QueryTracker) GC() {
    for _, q := range t.queries {
        if q.isStale() {
            q.cancel()  // 取消 ctx
            t.Delete(q.qid)
        }
    }
}

// ================================================================
// 性能数据 (中等规模, 1M series, 8 核):
//
// [Parse 耗时]
//   - 简单: < 100μs (rate(x[5m]))
//   - 中等: 1-5ms (sum by + 嵌套函数)
//   - 复杂: 10-50ms (10+ 函数嵌套)
//
// [Exec 耗时]
//   - 1k series × 1h range: ~10ms
//   - 100k series × 1h range: ~1s
//   - 1M series × 1d range: ~30s (会 timeout)
//
// [并发]
//   - 默认 --query.max-concurrency=20
//   - 实际: 8 核分 8 分片, 4-8x 加速
//
// 关键配置:
//   - --query.timeout=2m
//   - --query.max-concurrency=20
//   - --query.max-samples=50000000
//
// 坑:
//   - Cartesian product (无 label 关联) → series 爆炸
//     解决: 加 on() 关联 label
//   - rate() 在 counter 重置时不准 → 用 increase()
//   - histogram_quantile() 需要 le label → 检查 bucket 完整
//   - record rule 缺失 → 实时算很慢
//
// 慢查询 debug:
//   - prometheus_engine_query_duration_seconds  # query 耗时
//   - 启动 --web.enable-lifecycle + Prometheus UI
//     Graph → 看查询计划
//   - promtool query analyze 'expr'  # 看算子链
//
// PromQL 速查:
//   rate(x[5m])             # 增函数速率
//   increase(x[1h])         # 增量
//   irate(x[1m])            # 瞬时速率 (更准)
//   sum by (label) (x)      # 按 label 聚合
//   histogram_quantile(0.95, sum by (le) (rate(x[5m])))  # P95
// ================================================================
