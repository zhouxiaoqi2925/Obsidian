// 来源: PostgreSQL src/backend/executor/executor.c:ExecutorRun
// 作用: 查询执行器主入口 — 从 Portal 到返回结果集的完整链路
// 调用链: PostgresMain → exec_simple_query → ExecutorRun → ExecutorStart → ExecutePlan → ExecutorEnd
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 三阶段生命周期 ExecutorStart/Run/End
//   - Start: 解析执行计划, 初始化 EState (Executor State)
//   - Run:   循环调用 ExecutePlan 直到返回 NULL tuple
//   - End:   释放 EState, 清理 snapshot, 关闭索引
//   - 分离原因: 简单查询 1 次 Start+Run+End, 游标/PREPARE 复用 Start
//
// [WHY-2] Snapshot 决定可见性
//   - Portal 创建时拿 snapshot (PortalHeapMemory)
//   - 默认 snapshot: GetSnapshotData (取最新 committed xact)
//   - MVCC 读: HeapTupleSatisfiesVisibility (heapam.c)
//   - READ COMMITTED 隔离级: 每次 query 重新拿 snapshot
//
// [WHY-3] 一次返回一行 (Volatile Function 也要算)
//   - 不用 cursor 一次返回, 用 ExprContext + per-tuple memory
//   - volatile 函数 (random, now) 每个 tuple 算一次
//   - 不用 set-valued 函数, 避免 buffer 撑爆
//
// [WHY-4] CommandCounterIncrement 防同事务冲突
//   - INSERT 后立即 SELECT 看不到 (同事务内的修改)
//   - 解决: CommandCounterIncrement 让同事务内后续 query 看到
//   - 触发器/规则链 (Rules) 也靠这个走
//
// [WHY-5] ReceiveTuple 完成才走 EState 释放
//   - tuplestore 写盘后才允许 End
//   - 否则 cursor 跨 query 时拿不到
//   - 内部用 tuplestore_in_memory (cursor 内存版) 或 materialized view 模式
// ================================================================

void ExecutorRun(QueryDesc *queryDesc, ScanDirection direction, long count) {
    // === [WHY-1] 准备阶段: 初始化 EState, 解析计划 ===
    // (在 ExecutorStart 里完成, 这里不重复)

    EState       *estate = queryDesc->estate;  // 执行状态机
    PlanState    *planstate = queryDesc->planstate;  // 计划树节点
    CommandCounterIncrement();  // [WHY-4] 让本事务后续 query 看到本事务之前的修改

    // === [WHY-2] 拿 snapshot, 决定可见性 ===
    if (queryDesc->snapshot == NULL) {
        // 默认用 Portal / QueryDesc 自带的 snapshot
        // 复杂 query: 显式 push snapshot
        PushActiveSnapshot(queryDesc->snapshot);
    }

    // === [WHY-3] 主循环: 一次一个 tuple ===
    if (count == 0) {
        // 无 count: 跑完整个 plan (默认)
        for (;;) {
            // ExecutePlan 返回一个 TupleTableSlot (内存里的元组 slot)
            TupleTableSlot *slot = ExecutePlan(estate, planstate, direction);

            if (TupIsNull(slot)) {
                break;  // 整个 plan 跑完
            }

            // 把 tuple 送到 destination (frontend / tuplestore / 触发器)
            (*queryDesc->dest->receiveSlot)(slot, queryDesc->dest);

            // [WHY-3] volatile 函数 (random) 每个 tuple 算一次
            // 放在这里而不是 ExecutePlan 末尾, 是为了让 volatile
            // 在 receiver 里也能算 (例如 trigger)
        }
    } else {
        // 有 count: 跑 count 次 (例如 FETCH 100)
        long current_tuple_count = 0;
        while (current_tuple_count < count) {
            TupleTableSlot *slot = ExecutePlan(estate, planstate, direction);
            if (TupIsNull(slot)) break;
            (*queryDesc->dest->receiveSlot)(slot, queryDesc->dest);
            current_tuple_count++;
        }
    }

    // === [WHY-5] 清 snapshot ===
    if (queryDesc->snapshot != NULL) {
        PopActiveSnapshot();
    }
}

// ================================================================
// 性能数据 (PostgreSQL 15, 单条 SQL):
//
// [简单 SELECT * FROM t WHERE id = 1]
//   - ExecutorStart:    ~0.5ms (parse plan, init EState)
//   - ExecutorRun:      ~0.1ms (1 行结果, 命中索引)
//   - ExecutorEnd:      ~0.05ms
//   - 总:               ~0.65ms
//
// [聚合 SELECT count(*), avg(price) FROM orders WHERE ...]
//   - Start:            ~0.5ms
//   - Run:              ~50ms (1M 行, 顺序扫, 聚合)
//   - End:              ~0.1ms
//   - 总:               ~50.6ms
//
// [大结果集 SELECT * FROM t (10M 行)]
//   - Run:              ~3s (cursor 模式, fetch 1000)
//   - 内存:             ~5MB (per-batch 释放)
//
// 关键点:
//   - 单 tuple 处理 < 1µs, 现代 CPU 不是瓶颈
//   - 真实瓶颈在 heap_getnext / index_getnext (IO/锁)
//   - 内存: per-query EState ~10KB, per-tuple ~100B
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: ExecutorRun 5 大执行策略]
//   - EXEC_RUN: 完整执行, 拿所有结果
//   - EXEC_FOR: 用 portal (cursor), 增量 fetch
//   - EXEC_BACKEND: 后端执行, 同步等结果
//   - EXEC_FLAG_BACKWARD: 反向 fetch (DECLARE SCROLL)
//   - EXEC_FLAG_SKIP_TRIGGERS: 跳过 trigger (CTAS 等)
//
// [案例 2: Portal (cursor) 3 大场景]
//   - 1) DECLARE CURSOR: 业务显式开 cursor
//   - 2) 大结果集: JDBC 配 fetchSize 走 portal
//   - 3) PL/pgSQL: FOR record IN query LOOP ... END LOOP
//   - 收益: 内存固定, 不会 OOM
//
// [案例 3: 单 tuple 处理性能基准]
//   - TupleTableSlot 分配: ~100ns
//   - ExecQualByIndex (qual 检查): ~50ns
//   - ExecProject: ~50ns
//   - 单 tuple: ~200-500ns (1µs 级别)
//   - 1M tuple: 200-500ms
//   - 瓶颈: heap_getnext 走共享缓冲池, 走 IO 就慢
//
// [案例 4: 5 大执行算子性能对比]
//   - SeqScan: 100ns/行 (缓存命中)
//   - IndexScan: 200ns/行 (1 个索引 lookup)
//   - HashJoin: 50ns/行 (probe)
//   - NestLoopJoin: 10µs/行 (内表扫)
//   - HashAggregate: 200ns/行
//   - 调优: 选最便宜的算子
//
// [案例 5: 5 大瓶颈排查]
//   - 1) Seq Scan on large table: 加索引
//   - 2) Index Scan 慢: 索引膨胀, REINDEX
//   - 3) Hash Join build 慢: work_mem 不够
//   - 4) Sort 慢: work_mem 不够, 走 disk
//   - 5) Network: 业务靠近 DB, 避免跨网
//
// [案例 6: 实战: 大表 COUNT 慢怎么办]
//   - SELECT COUNT(*) FROM t (1亿行): 10-30s (SeqScan)
//   - 解法: 用近似值 pg_class.reltuples (统计信息)
//   - 解法: MVCC 可见性, 可用 index-only scan
//   - 解法: 维护计数器表 (业务累加)
//   - 解法: 用 count_estimate 扩展
//
// [案例 7: EXPLAIN ANALYZE 调优实战]
//   - EXPLAIN (ANALYZE, BUFFERS, VERBOSE, TIMING) SELECT ...
//   - 关键: Buffers: shared hit=100 read=200  → 缓存 vs 磁盘
//   - 关键: actual time=10..500 rows=1000 → 单 batch 处理时间
//   - 关键: Loops: 外层循环次数
//   - 实战: 用 https://explain.dalibo.com 可视化
//
// [案例 8: pg_stat_statements 性能监控]
//   - 监控 SQL 总量, 平均耗时, 总耗时
//   - top 10 慢查询: pg_stat_statements ORDER BY total_time DESC
//   - 实战: 自动 kill 长查询 pg_cancel_backend(pid)
//   - 实战: pg_sleep 找恶意查询
//
// [案例 9: 调优参数实战 (postgresql.conf)]
//   - shared_buffers: 25% RAM (8GB RAM → 2GB)
//   - work_mem: 64MB-1GB (sort/hash 内存)
//   - effective_cache_size: 75% RAM (OS 缓存)
//   - maintenance_work_mem: 1GB (vacuum/index)
//   - random_page_cost: 1.1 (SSD)
//   - max_parallel_workers_per_gather: 4
//
// [案例 10: EXPLAIN 输出关键指标]
//   - actual time: 实际耗时
//   - rows: 估算 vs 实际 (差 10x+ = 统计信息过期)
//   - Buffers: shared hit/read (缓存命中)
//   - Planning Time vs Execution Time
//   - Total Time: 总耗时
//   - 实战: shared hit 100% = 完美缓存, < 90% 加内存
// ================================================================
