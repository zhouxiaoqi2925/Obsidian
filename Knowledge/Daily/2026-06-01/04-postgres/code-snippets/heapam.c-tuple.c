// 来源: PostgreSQL src/backend/access/heap/heapam.c:heapgettup
// 作用: 堆表扫描 + MVCC 可见性判断 — 读路径核心
// 调用链: ExecSeqScan → heap_getnextslot → heapgettup → HeapTupleSatisfiesVisibility
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 顺序扫: 从当前 page 拿到就返回
//   - 不是直接扫全表, 是按 page 读
//   - 用 buffer pool 缓存 page, 命中就在内存
//   - buffer pin/unpin 决定共享
//
// [WHY-2] MVCC 可见性靠 snapshot
//   - HeapTupleSatisfiesMVCC 用 snapshot 的 xmin/xmax 列表
//   - 自己的 xact: cmin 决定可见, cmax 决定不可见
//   - 已提交 xact: 写入时间 < snapshot.xmin → 可见
//   - 未提交/回滚: xmax != Invalid → 不可见
//
// [WHY-3] follow_updates 决定走不走 HOT
//   - 跟 t_ctid 链, 走 update 的版本链
//   - 跟到底才决定可见性
//   - HOT 链纯堆内, 索引不用改
//   - 性能: 走到底可能很慢, 默认 follow_updates=false
//
// [WHY-4] 不返回死元组 (committed dead)
//   - dead tuple 占用空间
//   - vacuum 才会清
//   - 索引扫描能跳: index_getnext 走 visibility map 加速
//   - heap scan 没法跳, 是 vacuum 慢的根因
//
// [WHY-5] 跨 page 边界: pin + lock + relcache
//   - pin buffer 防 eviction
//   - heap_lock tuple 行级锁 (UPDATE/DELETE 锁定)
//   - 跨 page 时 pin 旧 page, unpin 后 pin 新 page
//   - relcache 缓存表元数据, 解析开销摊薄
// ================================================================

// heapgettup 简化版, 实际在 heapam.c:heapgettup_pg
bool heapgettup(Relation relation,           // 目标表
                Snapshot snapshot,            // MVCC snapshot
                HeapScanDesc scan,            // 扫描描述符 (cursor 位置等)
                ScanDirection direction,      // 前向 / 反向
                TupleTableSlot *slot) {
    // === [WHY-1] 顺序扫: 拿当前 page 的下一个 tuple ===
    HeapTuple tuple = &scan->rs_ctup;  // 复用, 不分配
    Buffer buffer = scan->rs_cbuf;     // 当前 page 的 buffer

    for (;;) {
        // pin 当前 page
        LockBuffer(buffer, BUFFER_LOCK_SHARE);
        Page page = BufferGetPage(buffer);
        int lines = PageGetMaxOffsetNumber(page);

        // 顺序扫 page 内所有 tuple
        for (int lineoff = scan->rs_cindex; lineoff <= lines; lineoff++) {
            ItemId itemId = PageGetItemId(page, lineoff);

            // 跳过空 slot (vacuum 释放空间但保留 ItemId)
            if (!ItemIdIsNormal(itemId)) continue;

            HeapTupleHeader tupleHeader = (HeapTupleHeader) PageGetItem(page, itemId);

            // === [WHY-2] MVCC 可见性判断 ===
            if (!HeapTupleSatisfiesVisibility(tupleHeader, snapshot, buffer)) {
                // 不可见, 继续
                // 注意: 仍然设到 slot 里, ExecQual 阶段会再判断
                // 这是 PG 早期决策: 一次扫能返回更多 tuple, 但浪费 IO
                continue;
            }

            // === [WHY-4] dead tuple 跳过 (committed dead) ===
            // 索引扫描靠 VM (visibility map) 跳, heap 扫没这优化
            // vacuum 解决死元组

            // === [WHY-3] 跟 update 链, 走 HOT ===
            // 实际代码: heap_hot_search_buffer 走 t_ctid 链
            if (scan->rs_follow_updates) {
                tupleHeader = heap_hot_search_buffer(tupleHeader, buffer, snapshot, ...);
            }

            // 找到可见的, 返回
            tuple->t_data = tupleHeader;
            tuple->t_len = ItemIdGetLength(itemId);
            tuple->t_self = ...;

            ExecStoreBufferHeapTuple(tuple, slot, buffer);

            scan->rs_cindex = lineoff + 1;  // 下一轮从下一行开始
            return true;
        }

        // === [WHY-5] 跨 page ===
        UnlockReleaseBuffer(buffer);
        scan->rs_cindex = 0;

        // 拿下一个 page
        buffer = heapgetpage(scan);
        if (!BufferIsValid(buffer)) {
            // 扫完了
            return false;
        }
        scan->rs_cbuf = buffer;
    }
}

// ================================================================
// 性能数据 (1M 行 顺序扫, 索引未建, 全表 1GB, 内存 8GB):
//
// [全表扫 SELECT * FROM t]
//   - 耗时:  ~1.5s (含 IO)
//   - 吞吐:  660k 行/s
//   - 缓存:  第一次扫完, 第二次 < 0.1s (全内存)
//
// [有 WHERE id = 1 (B-Tree 索引)]
//   - 耗时:  ~0.05ms (索引 + heap fetch, 命中)
//   - 索引:  4 层 B-Tree, 1 次 IO
//   - heap:  1 次 IO (数据 page)
//
// [有 WHERE id BETWEEN 1000 AND 2000 (范围)]
//   - 耗时:  ~0.5ms (索引顺序扫 + heap fetch 1000 次)
//   - 性能:  取决于返回行数, 顺序读占多数
//
// [MVCC 不可见 tuple 的影响]
//   - 顺序扫: 不返回但消耗 CPU (HeapTupleSatisfiesMVCC)
//   - vacuum 减少不可见: 全表 vacuum 后扫 2x 快
//   - autovacuum 调节: vacuum_cost_delay = 20 (默认)
//
// 关键点:
//   - heap scan 不可见 tuple 也要扫, vacuum 救命
//   - B-Tree 索引返回行数多时, 改用 bitmap heap scan
//   - snapshot 太旧, 事务链长, HeapTupleSatisfiesMVCC 慢
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: HeapTupleSatisfiesMVCC 5 大状态]
//   - HEAPTUPLE_LIVE: 可见, 返回
//   - HEAPTUPLE_DEAD: 已被删除, 跳过
//   - HEAPTUPLE_RECENTLY_DEAD: 刚死, 等 vacuum
//   - HEAPTUPLE_INSERT_IN_PROGRESS: 其他事务在插, 跳过
//   - HEAPTUPLE_DELETE_IN_PROGRESS: 其他事务在删, 跳过
//
// [案例 2: MVCC 多版本机制详解]
//   - xmin: 插入事务 id
//   - xmax: 删除/更新事务 id (0 = 未删)
//   - t_xmin < 当前事务 < t_xmax: 不可见
//   - Hint Bits: CachedVisibility + 标记, 加速
//   - 实战: 长事务会"饿死" vacuum, 因为 xid 一直活跃
//
// [案例 3: 5 类 Index Scan 路径]
//   - IndexScan: 单索引, fetch heap
//   - IndexOnlyScan: 索引覆盖, 不 fetch heap
//   - BitmapIndexScan → BitmapHeapScan: 多索引合并
//   - TidScan: ctid 直接定位
//   - SubqueryScan: 子查询
//
// [案例 4: VACUUM 5 大任务]
//   - 1) 清理死 tuple (释放 page 空间)
//   - 2) 冻结旧 xid (避免 wraparound)
//   - 3) 更新 FSM (Free Space Map)
//   - 4) 更新 VM (Visibility Map)
//   - 5) 更新统计 (pg_stat)
//
// [案例 5: Snapshot 过旧的 5 大症状]
//   - 1) HeapTupleSatisfiesMVCC 慢 (需遍历 procArray)
//   - 2) 索引扫描返回行多 (老版本)
//   - 3) heap scan 慢 (tombstone 比例高)
//   - 4) autovacuum worker 大量
//   - 5) 监控: pg_stat_user_tables.n_dead_tup
//
// [案例 6: pgstattuple 实战]
//   - SELECT * FROM pgstattuple('public.users');
//   - table_len, tuple_count, dead_tuple_count
//   - free_space, free_percent
//   - 实战: 死 tuple 比例 > 20% 手动 VACUUM
//
// [案例 7: 实战: 索引膨胀排查]
//   ```sql
//   -- 查索引膨胀
//   SELECT schemaname, tablename, indexname,
//          pg_size_pretty(pg_relation_size(indexname::regclass))
//   FROM pg_stat_user_indexes
//   WHERE idx_scan = 0  -- 长期没用
//   ORDER BY pg_relation_size(indexname::regclass) DESC;
//   ```
//   - REINDEX INDEX CONCURRENTLY idx_name;
//   - 监控: pg_relation_size / pg_relation_size(索引)
//
// [案例 8: 5 大死 tuple 杀手]
//   - 1) 频繁 UPDATE: update 是 delete+insert
//   - 2) 长事务: 阻塞 vacuum
//   - 3) 大量 DELETE: 留 tombstone
//   - 4) autovacuum 关闭
//   - 5) 临时表: 不 vacuum, 直接 drop
//
// [案例 9: Bitmap Heap Scan 5 大应用场景]
//   - 多条件 OR: 各条件走索引, bitmap OR
//   - 多条件 AND: 各条件走索引, bitmap AND
//   - 范围查询: btree 索引
//   - IN 列表: btree 索引
//   - 实战: 比 IndexScan 减少 random IO
//
// [案例 10: 监控 dead tuple 实战]
//   ```sql
//   -- top 10 死 tuple 表
//   SELECT schemaname, relname,
//          n_live_tup, n_dead_tup,
//          ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
//   FROM pg_stat_user_tables
//   WHERE n_dead_tup > 1000
//   ORDER BY n_dead_tup DESC LIMIT 10;
//   ```
//   - 实战: dead_pct > 20% 触发 vacuum
// ================================================================
