// 来源: PostgreSQL src/backend/access/heap/heapam.c:heap_insert
// 作用: 堆表插入 — MVCC 写入链路 (xmin + WAL + FSM 复用)
// 调用链: ExecInsert → heap_insert → XLogInsert → heap_page_is_visible
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] xmin/xmax 标记事务可见性
//   - xmin = 当前 xid (谁插入)
//   - xmax = 0 (未删除) 或 后续删除者的 xid
//   - HeapTupleSatisfiesMVCC 用这两个判断读时可见
//   - 决定读不阻塞写的关键
//
// [WHY-2] WAL 必须先记再写 page
//   - 先 XLogInsert (记 redo log)
//   - 再 PageSetItem (写数据 page)
//   - crash 后: REDO 恢复数据
//   - 顺序不能反, 反了 crash 恢复会丢数据
//
// [WHY-3] FSM (Free Space Map) 找有空位的 page
//   - 不是 append-only, 大表不能全塞最后
//   - FSM 记录每个 page 的空闲空间
//   - 找 page 策略: FSM 一级 + hash 二级 + 同 page 复用
//
// [WHY-4] 整 page 不写 FPI (Full Page Image) 加速
//   - 第一次改 page 必须写 FPI (8KB 全量)
//   - 之后改只写 delta
//   - checkpoint 后 FPI 必须再来一次
//   - 代价: 8KB 写放大, 但 crash 恢复 0 失
//
// [WHY-5] HOT (Heap-Only Tuples) 优化 update
//   - UPDATE 在同 page 内, 不建新索引项
//   - 减少 WAL + 索引膨胀
//   - 条件: 新行能在同 page, 索引列没变
//   - 通过 t_ctid 串成"版本链"
// ================================================================

Oid heap_insert(Relation relation,         // 目标表
                HeapTuple tup,               // 待插入元组
                CommandId cid,               // 命令 ID (同事务内可见性)
                int options,                 // 标志位
                BulkInsertState bistate) {   // 批量插入状态 (COPY 用)
    // === [WHY-1] 分配 xid, 标记 tuple 归属 ===
    TransactionId xid = GetCurrentTransactionId();

    // xmin 写进 tuple header (t_data->t_choice.t_heap.t_xmin)
    HeapTupleHeaderSetXmin(tup->t_data, xid);
    HeapTupleHeaderSetCmin(tup->t_data, cid);
    HeapTupleHeaderSetXmax(tup->t_data, InvalidTransactionId);  // [WHY-1] 标记未删除
    tup->t_data->t_infomask |= HEAP_XMAX_INVALID;  // xmax 无效, 加速可见性判断

    // === [WHY-3] FSM 找有空位的 page ===
    // bulk insert: 用 bistate 缓存目标 page
    // 单行: RelationGetTargetPage
    Buffer buffer = RelationGetBufferForTuple(relation, tup->t_len, bistate);

    // === [WHY-2] 先写 WAL, 再写 page ===
    // WAL 包含: 表 oid, page 号, tuple 内容, xid
    // FPI 在 checkpoint 后的第一次修改, 写全 8KB
    if (RelationNeedsWAL(relation)) {
        xl_heap_insert xlrec;
        xlrec.offnum = ItemPointerGetOffsetNumber(&tup->t_self);
        xlrec.t_infomask2 = tup->t_data->t_infomask2;
        xlrec.t_infomask = tup->t_data->t_infomask;

        // XLogInsert 关键: 写完才返回
        XLogBeginInsert();
        XLogRegisterData((char *) &xlrec, SizeOfHeapInsert);
        XLogRegisterData((char *) tup->t_data, tup->t_len);
        // 拿到 LSN (Log Sequence Number), 写到 page 里
        recptr = XLogInsert(RM_HEAP_ID, info, rdata, 1);
        recptr = recptr;  // 编译时抑制
        // === [WHY-4] 第一次插入记 LSN, checkpoint 后第一次记 FPI ===
        PageSetLSN(page, recptr);
    }

    // === 写 page ===
    // 计算 tuple 在 page 内的 offset
    int offnum = PageAddItem(page, (Item) tup->t_data, tup->t_len, ...);
    ItemPointerSet(&tup->t_self, BufferGetBlockNumber(buffer), offnum);

    // 标记 page dirty, 触发 bgwriter
    MarkBufferDirty(buffer);

    // 释放 buffer pin
    UnlockReleaseBuffer(buffer);

    return HeapTupleGetOid(tup);
}

// ================================================================
// 性能数据 (机械盘, 1k 行单 INSERT, 单表无索引):
//
// [单行 INSERT INTO t VALUES (...)]
//   - 耗时:  ~0.3ms (含 fsync)
//   - WAL:   ~50 bytes/行
//   - 索引:  0 (无索引)
//
// [批量 COPY 1M 行]
//   - 耗时:  ~2s (500k 行/s, 不含 fsync)
//   - 耗时:  ~3s (含 fsync)
//   - WAL:   ~50 bytes/行
//
// [WAL 写入, 同步模式 (synchronous_commit=on)]
//   - 单事务 commit: 等 fsync 完成, ~5-10ms (机械盘)
//   - SSD: 0.5-1ms
//   - NVMe: 0.1-0.5ms
//
// [HOT update 优化]
//   - 走 HOT 条件: 索引列未变 + 同 page 有空位
//   - 加速:    2-3x (无索引项插入)
//   - 索引:    0 (不写索引)
//
// 关键点:
//   - 单 INSERT 慢是 fsync, 不是 CPU
//   - COPY 比 INSERT 快 50-100x (少 fsync, bulk FSM)
//   - WAL 是所有性能问题的根因 (顺序写, 慢)
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: heap_insert 7 步流程详解]
//   - 1) heap_insert: 入口
//   - 2) RelationGetBufferForTuple: 找 page (FSM)
//   - 3) heap_form_tuple: 构造 HeapTuple
//   - 4) raw_heap_insert: 写 page, 不写索引
//   - 5) heap_xlog_insert: 写 WAL
//   - 6) insert索引项: 逐个索引 insert (B-Tree, GIN, ...)
//   - 7) CacheInvalidateHeapTuple: 失效 cache
//
// [案例 2: 5 大性能调优实战]
//   - 1) UNLOGGED 表: 不写 WAL, 5-10x 快 (日志/临时数据)
//   - 2) COPY 替代 INSERT: 50-100x 快 (bulk)
//   - 3) 批量 INSERT: 1000-10000/批 (round trip 减少)
//   - 4) 关 trigger: 临时 ALTER TABLE ... DISABLE TRIGGER
//   - 5) 关索引: 先插入, 后建索引 (比逐行写索引快)
//
// [案例 3: WAL (Write-Ahead Log) 关键点]
//   - 写 page 前先写 WAL
//   - crash recovery: replay WAL
//   - 同步: fsync WAL (wal_sync_method)
//   - 性能: WAL 顺序写, 比 page 写快 100x
//   - 调优: synchronous_commit = off (牺牲持久性换性能)
//
// [案例 4: TOAST (大字段) 实战]
//   - 默认 > 2KB 字段压缩/外存
//   - storage: PLAIN / EXTENDED / EXTERNAL / MAIN
//   - 实战: 大文本/JSON 用 EXTERNAL (不压缩, 加速读)
//   - 监控: pg_column_size, pg_total_relation_size
//
// [案例 5: 5 类 heap page 状态]
//   - FREE: 完全空闲
//   - LIVE: 正常 tuple
//   - DEAD: 已删除, 待 vacuum
//   - REDIRECT: HOT update chain
//   - UNUSED: 头部保留区
//   - 监控: pg_freespace, pgstattuple
//
// [案例 6: HOT (Heap-Only Tuples) 实战]
//   - update 不改索引列 → 不写索引, 链式 update
//   - 收益: 减少 WAL + 索引写, 5-10x 快
//   - 限制: 1 page 内, 1 个 update chain
//   - 调优: fillfactor=80 (留 20% 给 HOT)
//
// [案例 7: Index 写入策略]
//   - B-Tree: 1 次 insert 1 次 split, buffer 满才写盘
//   - GIN: 批量写 (fastupdate), 周期 merge
//   - BRIN: 块摘要, 极小, 适合大表
//   - Hash: 桶分裂, 写多读少
//   - GiST: 树分裂, 复杂数据
//
// [案例 8: 实战: 1 亿行表批量 insert 性能]
//   - 单 INSERT: 10h+ (round trip 1ms × 1亿)
//   - COPY (批 1w): 1-2h (顺序写, 1 row/fsync)
//   - COPY (无索引): 30min (先建索引, 后 copy)
//   - 实战: drop index → COPY → create index CONCURRENTLY
//
// [案例 9: pg_stat_user_tables 监控 insert]
//   - n_tup_ins: 累计插入
//   - n_live_tup: 活 tuple
//   - n_dead_tup: 死 tuple (待 vacuum)
//   - autovacuum_count: vacuum 次数
//   - 实战: 死 tuple / 活 tuple > 0.2 触发 vacuum
//
// [案例 10: 实战: heap 写入 vs SSD 性能数据]
//   - 顺序写 WAL: 1GB/s (SSD), 200MB/s (HDD)
//   - 随机写 page: 100MB/s (NVMe), 10MB/s (HDD)
//   - 单 INSERT: ~1ms (含 fsync 0.5ms)
//   - 批量: ~50µs/行
//   - 实战: WAL 单独放 SSD, page 数据放 SSD
// ================================================================
