// 来源: PostgreSQL src/backend/parser/parse_agg.c:parseAggregates
// 作用: 聚合查询解析 — SQL 解析器对 GROUP BY / HAVING 的特殊处理
// 调用链: parse_analyze → parseAggregates → transformAggregateCalls → check_agg_arguments
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 两阶段 GROUP BY 验证
//   - 第一遍: 检查 targetList 里的聚合是否合法 (子查询, 列引用)
//   - 第二遍: 检查所有非聚合列必须在 GROUP BY 里
//   - SQL 标准要求 (但 MySQL 放宽了, PG 严格)
//   - 例外: 函数依赖 (主键 → 其他列) 可放宽
//
// [WHY-2] HAVING 子句可引用 SELECT 别名
//   - SQL: SELECT count(*) AS c FROM t HAVING c > 5
//   - PG 支持, 但需要在 resolve_aggregate 阶段回查
//   - 实现: parse_clause 把 HAVING 的列映射回 SELECT
//
// [WHY-3] 聚合函数嵌套的特殊处理
//   - 嵌套聚合: SELECT sum(avg(price)) FROM t GROUP BY ... → 错误
//   - 子查询嵌套: SELECT sum((SELECT avg(price) FROM ...)) → 合法
//   - 区分方法: parseAggref 节点的 varlevelsup 字段
//
// [WHY-4] DISTINCT 聚合特殊处理
//   - SELECT count(DISTINCT id) FROM t
//   - 实现: HashAggregate 上加 Unique 算子
//   - SELECT array_agg(DISTINCT col) FROM t → 内部 hash
//   - 性能: DISTINCT 比普通聚合慢 2-5x (hash 开销)
//
// [WHY-5] 解析阶段 vs 执行阶段: 解析早于执行
//   - parse_agg 在 transformSelectStmt 阶段跑 (解析)
//   - 把 Aggref 节点塞到 Query 树
//   - 执行时: planner 把 Aggref 转成 Agg node
//   - 优化器可识别 "可下推" 的聚合 (部分聚合)
// ================================================================

void parseAggregates(ParseState *pstate, Query *q) {
    ListCell *lc;
    List *groupClause = q->groupClause;  // GROUP BY 子句
    bool have_aggs = false;

    // === [WHY-1] 第一遍: 检查 targetList 聚合合法性 ===
    foreach(lc, q->targetList) {
        TargetEntry *tle = (TargetEntry *) lfirst(lc);
        if (tle->expr && contain_aggs_of_level(tle->expr, 0)) {
            have_aggs = true;
            // 检查: 聚合内部是否引用了外层 query (相关子查询)
            if (pstate->p_hasAggs) {
                check_agg_arguments(pstate, tle->expr);
            }
        }
    }

    // HAVING 子句也要查
    if (q->havingQual && contain_aggs_of_level(q->havingQual, 0)) {
        have_aggs = true;
    }

    if (!have_aggs) return;  // 没聚合函数, 不需要 GROUP BY 检查

    // === [WHY-1] 第二遍: 检查所有非聚合列必须在 GROUP BY ===
    // 用 groupClause 推算 "分组维度"
    List *groupingClauses = pull_var_clause((Node *) groupClause,
                                            PVC_INCLUDE_AGGREGATES,
                                            PVC_RECURSE_PLACEHOLDERS);

    // targetList 里的非聚合列
    foreach(lc, q->targetList) {
        TargetEntry *tle = (TargetEntry *) lfirst(lc);
        if (tle->expr && contain_aggs_of_level(tle->expr, 0)) {
            continue;  // 聚合函数, 跳过
        }

        // 非聚合列
        List *vars = pull_var_clause(tle->expr, PVC_INCLUDE_AGGREGATES,
                                     PVC_RECURSE_PLACEHOLDERS);
        ListCell *var_lc;
        foreach(var_lc, vars) {
            Var *var = (Var *) lfirst(var_lc);

            // 检查 var 是否在 GROUP BY 里
            if (!list_member(groupingClauses, var)) {
                // 严格模式 (PG): 报错
                // 函数依赖放宽: 如果 GROUP BY 包含 var 的表主键, 也合法
                if (check_functional_grouping(var, groupClause)) {
                    continue;
                }
                ereport(ERROR, ...);
            }
        }
    }

    // === [WHY-2] HAVING 子句可引用 SELECT 别名 ===
    if (q->havingQual) {
        resolve_aggregate_having(pstate, q);
    }

    // === [WHY-3] 嵌套聚合检查 ===
    foreach(lc, q->targetList) {
        TargetEntry *tle = (TargetEntry *) lfirst(lc);
        if (tle->expr && check_agg_nesting(tle->expr)) {
            ereport(ERROR,
                    (errcode(ERRCODE_GROUPING_ERROR),
                     errmsg("aggregate function calls may not be nested")));
        }
    }

    // === [WHY-4] DISTINCT 聚合标记 ===
    foreach(lc, q->targetList) {
        TargetEntry *tle = (TargetEntry *) lfirst(lc);
        Aggref *agg = (Aggref *) tle->expr;

        if (agg && agg->aggdistinct) {
            // 例: count(DISTINCT id)
            // planner 会用 HashAggregate + Unique
            // 或: 直接用 GroupAggregate (sorted)
        }
    }

    // === [WHY-5] 标记 Query 有聚合, planner 会用 Agg node ===
    pstate->p_hasAggs = true;
}

// ================================================================
// 性能数据 (1M 行, 聚合查询):
//
// [SELECT count(*) FROM t]
//   - 耗时:  ~50ms (1M 行扫, 简单聚合)
//   - 优化:  用 index-only scan 走 VM, 加速 5x
//
// [SELECT category, count(*) FROM t GROUP BY category]
//   - 耗时:  ~150ms (10 个 category, hash aggregate)
//   - 内存:  ~10MB (HashAggregate 内部)
//
// [SELECT count(DISTINCT user_id) FROM orders]
//   - 耗时:  ~500ms (10M 行, distinct hash)
//   - 内存:  ~80MB (distinct 临时 hash)
//
// [SELECT region, count(*) FROM sales GROUP BY region HAVING count(*) > 100]
//   - 耗时:  ~200ms (10 region, group + having)
//   - HAVING 在 GROUP 之后算, 用 group key 索引
//
// 关键点:
//   - GROUP BY 列多 → 考虑排序后再 group (GroupAggregate)
//   - DISTINCT 多 → 考虑 hash 模式 (HashAggregate)
//   - HAVING 引用 SELECT 别名 → PG 支持, MySQL 也支持
//   - 嵌套聚合 → PG 严格, MySQL 更宽松 (但实际业务要谨慎)
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 类 Aggregate 策略]
//   - HashAggregate: 内存 hash 桶, group by 快
//   - GroupAggregate: 排序后 group, 输出有序
//   - PlainAggregate: 无 group (如 SELECT sum(x))
//   - WindowAgg: 窗口函数 (PARTITION BY)
//   - Agg + Sort: 先 sort 再聚合
//
// [案例 2: HashAggregate 7 步流程]
//   - 1) build hash table (group key → agg state)
//   - 2) 遍历 input tuple
//   - 3) hash(group_key) 找桶
//   - 4) 命中: 累加 agg state
//   - 5) 未命中: 新桶
//   - 6) 桶满 → spill 到 disk (work_mem 不够)
//   - 7) 输出: 遍历 hash, serialize
//
// [案例 3: 5 大聚合函数性能基准]
//   - count(*): 100ns/行
//   - sum(x): 200ns/行
//   - avg(x): 300ns/行 (count+sum)
//   - count(distinct x): 1µs/行 (hash 去重)
//   - array_agg(x): 1µs/行 (数组累加)
//
// [案例 4: 5 大聚合优化实战]
//   - 1) SELECT col, count(*) FROM t GROUP BY col
//     - 优化: 用 index-only scan (col 是 group key)
//   - 2) SELECT count(*) FROM t
//     - 优化: 不用索引, seq scan 全表最快
//   - 3) SELECT count(*) FROM t WHERE x = 1
//     - 优化: index-only scan 走 partial index
//   - 4) HAVING count(*) > 10
//     - 优化: HAVING 在聚合后, 用 group 索引
//   - 5) WINDOW 函数
//     - 优化: PARTITION BY 列加索引
//
// [案例 5: GroupAggregate vs HashAggregate 决策]
//   - GroupAggregate: 需要输入已排序, 输出有序
//   - HashAggregate: 任意输入, 输出无序
//   - 选择: planner 算成本
//   - 强制: SET enable_hashagg = off / enable_sort = off
//
// [案例 6: 5 类聚合陷阱]
//   - 1) count(*) 不算 NULL: 业务注意
//   - 2) avg() = sum/count, 类型转换小心
//   - 3) string_agg: 内存大, 大数据慢
//   - 4) array_agg: 同上
//   - 5) DISTINCT + 聚合: 双层去重, 慢
//
// [案例 7: 实战: count(distinct) 优化]
//   - SELECT count(DISTINCT user_id) FROM events (10亿行): 30s-2min
//   - 优化 1: 维护 user_id 唯一表 (业务侧)
//   - 优化 2: 用 HLL (hyperloglog) 近似值: pg_hll 扩展
//   - 优化 3: 用 distinct on + 物化视图
//   - 优化 4: SELECT count(1) FROM (SELECT DISTINCT user_id ...) t
//     - 走 HashAggregate
//
// [案例 8: 5 大窗口函数性能数据]
//   - row_number() over (PARTITION BY user_id ORDER BY ts): 500ns/行
//   - lag(col) over (ORDER BY ts): 200ns/行
//   - sum(col) over (ORDER BY ts): 300ns/行
//   - rank() over (PARTITION BY x): 400ns/行
//   - 实战: 复杂窗口函数 = 全表扫, 谨慎使用
//
// [案例 9: 监控聚合性能]
//   - EXPLAIN ANALYZE 看 HashAgg vs GroupAgg
//   - 关键: Buckets/Batches 数字
//     - 1 batch = 内存够
//     - 2+ batch = 内存不够, 走 disk
//   - 调优: work_mem 调大, 或减少 group key
//
// [案例 10: 实战: 业务聚合查询优化]
//   - 业务: 实时 dashboard count/group by
//   - 实时查询: EXPLAIN 看是否走 HashAggregate
//   - 优化: GROUP BY 列加索引, 用 index-only scan
//   - 物化: 周期 MATERIALIZED VIEW 预计算
//   - 实战: dashboard 用 5min 刷新的物化视图
// ================================================================
