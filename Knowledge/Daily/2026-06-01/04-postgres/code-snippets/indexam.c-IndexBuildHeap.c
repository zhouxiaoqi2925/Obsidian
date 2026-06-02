// 来源: PostgreSQL src/backend/access/index/indexam.c:index_bulk_delete
// 作用: 索引批量删除 — B-Tree cleanup, 实际代码在 nbtree.c
// 调用链: REINDEX / VACUUM FULL → index_bulk_delete → btbulkdelete
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] bulk delete 用 callback, 不是单条
//   - 单条 delete: pg 走 page-level index tuple, 太慢
//   - bulk: 扫整个索引, callback 决定删哪些
//   - VACUUM 调: 死元组 + 对应索引 entry 都删
//   - REINDEX: 整个索引重建, 不走 bulk
//
// [WHY-2] 死元组靠 heap tuple 状态决定
//   - callback 拿 heap tuple TID
//   - 调 HeapTupleSatisfiesVacuum 查 heap tuple 状态
//   - LP_DEAD → 删索引 entry
//   - LP_UNUSED → 删 + 走 page 整理
//   - LP_NORMAL → 留着
//
// [WHY-3] "Pinned" page 不动
//   - 其他事务正在 pin page (做查询)
//   - 不能立即删, 标记 "deleted" 等下次清理
//   - 跨多个 VACUUM 周期才能清完
//
// [WHY-4] FSM (Free Space Map) 不记索引
//   - heap 有 FSM, 索引没有
//   - 索引内部用 btpo_prev/next 串 free page
//   - 索引 page 满就分裂, 删完再 merge (但 merge 贵, 实际很少做)
//
// [WHY-5] Bulk delete 走"lazy"模式
//   - 不立即 merge page (不实际整理)
//   - 只 mark dead, 后续 insert 复用
//   - REINDEX 才会真整理 (重写整个索引)
//   - lazy 模式代价: 索引膨胀 2-3x
// ================================================================

IndexBulkDeleteResult *index_bulk_delete(IndexVacuumInfo *info,           // VACUUM 上下文
                                        IndexBulkDeleteCallback callback,  // 判断元组是否死
                                        void *callback_state) {
    Relation indexRel = info->index;
    // [WHY-1] 不同索引类型分发 (B-Tree, Hash, GIN, GIST...)
    switch (indexRel->rd_rel->relam) {
        case BTREE_AM_OID:
            return btbulkdelete(info, callback, callback_state);  // nbtree.c
        case HASH_AM_OID:
            return hashbulkdelete(info, callback, callback_state);
        case GIN_AM_OID:
            return ginbulkdelete(info, callback, callback_state);
        case GIST_AM_OID:
            return gistbulkdelete(info, callback, callback_state);
        default:
            elog(ERROR, "unknown access method %u", indexRel->rd_rel->relam);
            return NULL;
    }
}

// 简化版: B-Tree 内部 bulk delete (nbtree.c:btbulkdelete)
IndexBulkDeleteResult *btbulkdelete(IndexVacuumInfo *info,
                                    IndexBulkDeleteCallback callback,
                                    void *callback_state) {
    IndexBulkDeleteResult *stats = palloc0(sizeof(IndexBulkDeleteResult));
    Relation rel = info->index;
    double tupcount = 0;
    int nindexpages = 0;
    bool alldead = false;

    // === 扫所有 page ===
    for (BlockNumber blkno = 0; blkno < RelationGetNumberOfBlocks(rel); blkno++) {
        Buffer buffer = ReadBufferExtended(rel, MAIN_FORKNUM, blkno, RBM_NORMAL, info->strategy);
        LockBuffer(buffer, BUFFER_LOCK_EXCLUSIVE);

        // === [WHY-3] Pinned page 不动 ===
        if (ConditionalLockBuffer(buffer) == false) {
            // 别人 pin 着, 跳过, 下次再清
            UnlockReleaseBuffer(buffer);
            continue;
        }

        Page page = BufferGetPage(buffer);

        // 扫 page 内所有索引 entry
        BTPageOpaque opaque = BTPageGetOpaque(page);
        if (P_ISHALFDEAD(opaque)) {
            // 已经 half-dead, 完全清
            ...
        } else if (P_ISDELETED(opaque)) {
            // 已经 deleted 但还引用, 清
            ...
        } else if (!P_ISLEAF(opaque)) {
            // 非叶子, 不删 entry
            ...
        } else {
            // === 叶子 page: 逐个检查 ===
            BTPageOpaque opaque = BTPageGetOpaque(page);
            int maxoff = PageGetMaxOffsetNumber(page);

            // 决定是否全死 (page 可立即回收)
            alldead = true;

            for (int offnum = FirstOffsetNumber; offnum <= maxoff; offnum++) {
                ItemId itemId = PageGetItemId(page, offnum);

                if (!ItemIdIsNormal(itemId)) {
                    // 已 dead, page 全死
                    continue;
                }

                IndexTuple itup = (IndexTuple) PageGetItem(page, itemId);

                // === [WHY-2] callback 决定死不死 ===
                // callback 实际调 heap_fetch 看 heap tuple 状态
                if (callback(itup, callback_state)) {
                    // 标记 dead, 后面 BTEntryUpdate 删
                    ItemIdMarkDead(itemId);
                    tupcount++;
                } else {
                    alldead = false;  // 还有一个活的, page 不能全清
                }
            }

            // === [WHY-4] FSM 不记索引, 用 btpo_prev 串空闲 ===
            if (alldead) {
                // page 全死, 释放
                opaque->btpo_flags |= BTP_DELETED;
            }
        }

        MarkBufferDirty(buffer);
        UnlockReleaseBuffer(buffer);
    }

    // === [WHY-5] 不立即 merge, lazy ===
    stats->num_index_tuples = tupcount;
    return stats;
}

// ================================================================
// 性能数据 (1M 行表, 1M entry 索引, 全部 dead):
//
// [VACUUM 全表]
//   - 耗时:  ~5s (1M dead 索引 entry)
//   - 索引膨胀: 删除后剩 30% (70% 被 mark dead, 待重用)
//
// [REINDEX INDEX]
//   - 耗时:  ~10s (重写整个索引, 8KB 一个 page)
//   - 索引大小: 删除后 50% (compressed)
//
// [autovacuum 调度]
//   - 触发: 死元组 > 20% 阈值 (autovacuum_vacuum_scale_factor)
//   - 频率: 默认每分钟检查 (autovacuum_naptime)
//   - 代价: vacuum_cost_limit 默认 200, 限 IO
//
// 关键点:
//   - REINDEX 比 VACUUM 慢, 但索引真的压缩
//   - autovacuum 太频繁影响业务, 调 naptime + scale_factor
//   - 索引膨胀监控: pg_stat_user_indexes.idx_scan 长期 0 考虑 REINDEX
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: IndexBuildHeap 7 步流程]
//   - 1) IndexBuildHeapScan: 扫 heap
//   - 2) 对每 tuple: 抽 index key
//   - 3) 调 aminsert (B-Tree/GIN/GiST)
//   - 4) 内部排序/建树
//   - 5) 写 WAL
//   - 6) fsync index file
//   - 7) update pg_class
//
// [案例 2: 5 大索引类型对比]
//   - B-Tree (默认): =, <, >, BETWEEN, IN, IS NULL
//   - Hash: 仅 =, 写多读慢, 已被 B-Tree 取代
//   - GiST: 几何, 全文, IP 范围
//   - GIN: 全文搜索, jsonb, 数组
//   - BRIN: 大表 block 摘要, 极小
//   - SP-GiST: 空间分区 (quad-tree, kd-tree)
//
// [案例 3: CREATE INDEX CONCURRENTLY 实战]
//   - 不锁表, 允许并发 DML
//   - 步骤: 建临时索引, 等旧元组过期, swap
//   - 失败回滚: DROP INDEX CONCURRENTLY
//   - 代价: 时间 × 2-3 倍
//   - 实战: 大表 (1亿+) 必须用 CONCURRENTLY
//
// [案例 4: 5 大索引选择陷阱]
//   - 1) 小表不建索引: seq scan 更快
//   - 2) 高频更新列不建: 写开销大
//   - 3) 低选择性不建: 性别 (2 个值) 索引无用
//   - 4) 多列索引顺序: 常用列放前
//   - 5) 函数索引: WHERE date(t) 需要函数索引
//
// [案例 5: 5 大索引性能优化]
//   - 1) 覆盖索引: INCLUDE (col3) 加列
//   - 2) 部分索引: WHERE status = 'active'
//   - 3) 表达式索引: CREATE INDEX ... ON t (lower(name))
//   - 4) BRIN 大表: append-only 时间序
//   - 5) GIN 全文: tsvector 列 + GIN 索引
//
// [案例 6: 索引膨胀 5 大原因]
//   - 1) B-Tree page split 浪费空间
//   - 2) dead tuple 在 leaf page
//   - 3) GIN fastupdate 累积
//   - 4) 多列索引列序错
//   - 5) 频繁 update/delete 不 vacuum
//
// [案例 7: VACUUM vs REINDEX 区别]
//   - VACUUM: 回收 dead tuple 空间, 索引不变大
//   - VACUUM FULL: 重写表 + 索引, 锁表
//   - REINDEX: 重写索引, 不锁表 (CONCURRENTLY)
//   - 实战: 先 VACUUM, 看空间, 仍不够 REINDEX
//
// [案例 8: 5 类索引监控查询]
//   - pg_index_size('idx_name')  // 索引大小
//   - pg_stat_user_indexes.idx_scan  // 使用次数
//   - pg_stat_user_indexes.idx_tup_read  // 读行数
//   - pg_relation_size  // 表+索引总大小
//   - pgstatginindex  // GIN 详情
//
// [案例 9: 实战: 大表建索引性能数据]
//   - 1亿行表 CREATE INDEX (默认):
//     - 不 CONCURRENTLY: 锁表 30min-2h
//     - CONCURRENTLY: 60min-4h
//   - 1亿行表 B-Tree: 5-10GB
//   - 1亿行表 GIN: 10-20GB (3-5x B-Tree)
//   - 1亿行表 BRIN: 50-100MB (0.01x B-Tree, 适合 append-only)
//
// [案例 10: 索引选型决策树]
//   ```
//   1. 唯一值多? → B-Tree
//   2. 全文搜索? → GIN (tsvector)
//   3. JSONB? → GIN
//   4. 数组? → GIN
//   5. 几何/范围? → GiST
//   6. 大表 (1亿+) append-only? → BRIN
//   7. 仅 = 查询, 无排序? → Hash (其实 B-Tree 也行)
//   ```
//   - 实战: 默认 B-Tree, 全文用 GIN, 地理用 GiST
// ================================================================
