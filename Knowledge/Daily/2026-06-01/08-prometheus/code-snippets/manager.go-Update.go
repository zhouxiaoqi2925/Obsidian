// 来源: prometheus rules/manager.go:Manager.Update + Group.eval
// 作用: 告警规则评估 — 周期算 expr, 触发 alert 状态机
// 调用链: Update → Group → rules → Eval → state machine → notify
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 规则分组 (Group) 的工程意义
//   - 多个 rule 可放一个 group
//   - group 共享 evaluation_interval, 一次拉起
//   - 优势: 1 次 query 复用, 减少 PromQL 解析
//   - 实践: 按业务模块分组 (e.g. kubernetes, database)
//   - 关键: 同一 group 内的 rule 评估窗口对齐, 数据一致
//
// [WHY-2] 3 状态机 (inactive → pending → firing)
//   - inactive:  表达式不匹配, 之前也没触发
//   - pending:   表达式匹配, 但 for 时长未到
//   - firing:    表达式匹配, for 时长已到, 真发 alert
//   - 关键: pending 状态作为去抖, 避免误报
//   - 状态转换: inactive → pending → firing → (inactive)
//   - 优化: for: 1m 减少抖动, 30s 快速响应
//
// [WHY-3] 评估时机 + 窗口对齐
//   - 评估间隔: --evaluation_interval=15s (默认 1m)
//   - 评估时机: 对齐到 0s/15s/30s/45s (window aligned)
//   - 窗口对齐的好处: 多个 Prom 实例同步, 联邦时序一致
//   - 优化: 用 recording rule 预计算热点表达式
//
// [WHY-4] Group 内的并发 + 顺序
//   - 同一 group 内: 顺序执行 rules (避免 query 竞态)
//   - 不同 group: 并行 (多 goroutine)
//   - 评估窗口: group 共享 1 个 query 时间
//   - 错误: 1 个 rule 错, 其它 rule 继续 (errgroup 思想)
//
// [WHY-5] 通知路径 + 集成
//   - 触发后: 发到 AlertManager (gRPC)
//   - AlertManager: 路由 (按 label) + 分组 + 去重 + 抑制
//   - 最终: 发到 Slack / PagerDuty / Email / Webhook
//   - 关键: Prom 算 alert, AM 决定发到哪
//   - 重试: AM 端重试 (网络断), Prom 不重试
// ================================================================

// === Manager 主结构 (简化) ===
type Manager struct {
    opts     *ManagerOptions
    groups   map[string]*Group              // group name → group
    mtx      sync.RWMutex
    notify   func(...Notifier)              // 通知回调
    // ...
}

// === Update 加载规则文件 (核心, 简化) ===
func (m *Manager) Update(
    interval time.Duration,
    files []string,
    externalLabels labels.Labels,
    externalURL string,
) error {
    // 1. 解析所有规则文件
    var newGroups []*Group
    for _, f := range files {
        groups, errs := rulefmt.ParseFile(f)
        if len(errs) > 0 { return fmt.Errorf("parse error: %v", errs) }
        newGroups = append(newGroups, parseGroups(groups, ...)...)
    }

    // 2. Diff 新旧 group
    m.mtx.Lock()
    defer m.mtx.Unlock()

    // 3. 同步 group (新增 + 更新 + 删除)
    for _, newG := range newGroups {
        oldG, ok := m.groups[newG.name]
        if !ok {
            // 3.1 新建 group
            g := NewGroup(...)
            m.groups[g.name] = g
            // 启动 group 的 eval 协程
            go g.run(m.opts.Context)
        } else {
            // 3.2 更新已存在的 group
            oldG.Update(newG.rules)
        }
    }

    // 4. 删除多余的 group
    for name, g := range m.groups {
        if !containsGroup(newGroups, name) {
            g.stop()
            delete(m.groups, name)
        }
    }

    return nil
}

// === Group 结构 ===
type Group struct {
    name        string
    file        string
    interval    time.Duration              // 评估间隔
    rules       []Rule                     // group 内所有规则
    seriesInGR  []labels.Labels            // recording rule 输出
    evalIterationFunc  func()              // 评估函数
    shouldRestore bool                     // 启动时是否恢复状态
    // ...
}

// === Group.run 评估循环 (核心, 简化) ===
func (g *Group) run(ctx context.Context) {
    defer g.terminate()

    // 1. 启动时恢复上次状态 (从 disk)
    if g.shouldRestore {
        g.restore()
    }

    // 2. 对齐到评估窗口 (e.g. 0s/15s/30s/45s)
    g.evalIterationFunc = func() {
        // 2.1 评估所有 rule
        for _, rule := range g.rules {
            select {
            case <-ctx.Done():
                return
            default:
            }
            rule.Eval(ctx, time.Now(), g.interval, g.opts)
        }
    }

    // 3. 周期 eval
    ticker := time.NewTicker(g.interval)
    defer ticker.Stop()
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            g.evalIterationFunc()
        }
    }
}

// === AlertingRule.Eval 状态机 (核心, 简化) ===
func (r *AlertingRule) Eval(ctx context.Context, ts time.Time, ...) {
    // 1. 算表达式
    query, err := r.queryEngine.NewInstantQuery(ctx, r.storage, nil, r.expr.String(), ts)
    if err != nil { return }
    res := query.Exec(ctx)
    if res.Err != nil { return }

    vec, ok := res.Value.(promql.Vector)
    if !ok { return }

    // 2. 当前激活的 alerts
    activeAlerts := make(map[uint64]*Alert)
    for _, sample := range vec {
        // 2.1 每个 sample 创建一个 alert
        h := r.holdDuration
        alert := &Alert{
            Labels:      r.labels.FromSample(sample),
            Annotations: r.annotations,
            Value:       sample.V,
            ActiveAt:    ts,
            FiredAt:     ts,  // 默认当前时间
            // ...
        }
        activeAlerts[alert.Labels.Hash()] = alert
    }

    // 3. 状态机: 对每个 active alert, 决定状态
    for _, alert := range activeAlerts {
        existing, ok := r.active[alert.Labels.Hash()]
        if !ok {
            // 3.1 新触发: inactive → pending
            alert.State = StatePending
            alert.ActiveAt = ts.Add(r.holdDuration)  // for 之后 firing
        } else {
            // 3.2 已存在: 检查是否升级到 firing
            if existing.State == StatePending && ts.After(existing.ActiveAt) {
                // for 时长到了, 升级
                alert.State = StateFiring
                alert.FiredAt = ts
            } else {
                // 保持当前状态
                alert.State = existing.State
            }
        }
    }

    // 4. 删除消失的 alert
    for hash, existing := range r.active {
        if _, ok := activeAlerts[hash]; !ok {
            // 表达式不再匹配, inactive
            existing.State = StateInactive
            // 通知: 恢复
            m.notify(...)
        }
    }

    // 5. 更新 active map
    r.active = activeAlerts

    // 6. 通知 AlertManager (仅 firing 状态)
    firingAlerts := []*Alert{}
    for _, alert := range r.active {
        if alert.State == StateFiring {
            firingAlerts = append(firingAlerts, alert)
        }
    }
    if len(firingAlerts) > 0 {
        m.sendAlerts(ctx, ts, firingAlerts)
    }
}

// === RecordingRule.Eval 预计算 (简化) ===
func (r *RecordingRule) Eval(ctx context.Context, ts time.Time, ...) {
    // 1. 算表达式
    // ... 同上

    // 2. 写回 TSDB (作为新 series)
    for _, sample := range res.Value {
        ref, _ := app.Add(0, sample.Metric, ts.UnixMilli(), sample.V)
        _ = ref
    }
    app.Commit()
}

// === 规则文件示例 (YAML) ===
//
// groups:
//   - name: kubernetes_alerts
//     interval: 30s
//     rules:
//       # Recording rule (预计算)
//       - record: job:http_requests:rate5m
//         expr: sum by (job) (rate(http_requests_total[5m]))
//
//       # Alerting rule
//       - alert: HighErrorRate
//         expr: |
//           sum(rate(http_requests_total{status=~"5.."}[5m]))
//             /
//           sum(rate(http_requests_total[5m]))
//             > 0.05
//         for: 5m                     # 持续 5min 才触发
//         labels:
//           severity: critical
//         annotations:
//           summary: "High error rate on {{ $labels.instance }}"
//           description: "Error rate is {{ $value | humanizePercentage }}"

// ================================================================
// 性能数据 (1M series, 100 rules):
//
// [评估耗时]
//   - 1 个简单 rule: ~10-50ms
//   - 100 rules (同 group): ~1-5s
//   - 1000 rules: ~10-50s (考虑分组)
//
// [状态机开销]
//   - 1 个 alert 状态转换: ~10μs
//   - 1000 alerts 状态评估: ~10ms
//
// [通知路径]
//   - Prom → AlertManager (gRPC): ~1-5ms
//   - AM 路由 + 去重: ~10-50ms
//   - AM → Slack/PagerDuty: ~50-200ms
//
// 关键配置:
//   - --evaluation_interval=15s
//   - 规则文件: --rules.alert.rule-file
//   - 通知: --alertmanager.url=http://am:9093
//
// 坑:
//   - rule 太多 (1000+) → eval 超过 interval, 堆积
//   - for: 0s → 抖动大, 误报
//   - for: 30m → 慢响应, 故障 30min 才发
//   - recording rule 太细 → 写入放大, TSDB 压力大
//   - AM 路由错 → 告警风暴
//
// 监控:
//   - prometheus_rule_evaluation_duration_seconds
//   - prometheus_rule_evaluations_total
//   - prometheus_rule_group_iterations_total
//   - prometheus_notifications_dropped_total  # 通知失败
//   - up{job="alertmanager"}                   # AM 自身
//
// 实战:
//   - 业务模块 → 1 个 group
//   - 关键 alert: for: 1-5m
//   - 记录用 recording rule 预计算
//   - AM 路由: 按 severity + team
// ================================================================
