// 来源: prometheus tsdb/db.go:DB.Compact
// 作用: TSDB block 合并 — 把多个小 block 合并成大 block, 提升查询效率
// 调用链: Compact 循环 → selectBlocksToCompact → compactBlocks → reloadBlocks
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么需要合并 block
//   - 问题: 2h 一个 block, 1 周 = 84 个 block, 1 月 = 360 个 block
//   - 后果: 查询要开 84 个文件, 索引散落, 扫描慢
//   - 解决: 合并成大 block (6h / 24h / 长保留期)
//   - 效果: 100 个 block 合并 1 个, 查询时间降 5-10x
//   - 类比: 数据库的 merge / 物化视图刷新
//
// [WHY-2] 合并策略 (垂直 + 水平)
//   - 垂直合并: 相同时间范围, 不同 series 分布 → 合并
//     e.g. block-A 1000 series, block-B 2000 series → block-C 3000 series
//   - 水平合并: 时间相邻, 相同 series 分布 → 合并
//     e.g. block-A 0:00-2:00, block-B 2:00-4:00 → block-C 0:00-4:00
//   - 混合: 多个 block 时间 + series 都重叠
//   - 关键: 1+2+3 级合并 (2h→6h→24h)
//
// [WHY-3] 不可变 block 的并发安全
//   - block 合并后, 旧 block 标记删除, 新 block 出现
//   - 查询: 内存索引 + 磁盘 mmap, 不写
//   - 写入: 只写 head (最近 2h), 不直接写 block
//   - 含义: block 合并不阻塞查询/写入, 完美并发
//   - 优化: 合并后台异步, 默认 1 个并发, 资源够可加
//
// [WHY-4] 合并过程 (3 阶段)
//   - 1. selectBlocksToCompact: 选候选 block
//     - 找最小时间范围的 + 同源 (vertical/horizontal)
//   - 2. compactBlocks: 实际合并
//     - 合并 index (series dict + postings)
//     - 合并 samples (按 series 顺序, 时间排序)
//     - 写新 chunk 文件
//     - 写完 fsync
//   - 3. reloadBlocks: 切元数据
//     - 标记新 block 为永久
//     - 删旧 block 标记 (延迟删除, 防 concurrent crash)
//
// [WHY-5] 选择策略 + 阈值
//   - 触发条件: block 数 > N, 或超过时间窗口
//   - 默认阈值: min-block=2h, max-block=24h
//   - 1h blocks: 临时, 2h 满了就合并成 2h block
//   - 2h blocks: 6 个合成 1 个 12h block
//   - 12h blocks: 2 个合成 1 个 24h block
//   - 优化: 高 IO 时段 (白天) 不合并, 晚上合并
// ================================================================

// === DB 主结构 (简化) ===
type DB struct {
    dir       string                  // 数据目录
    blocks    []*Block                // 当前所有 block
    head      *Head                   // 最近 head
    compactc  chan struct{}           // 触发合并的信号
    // ... 元数据
}

// === Compact 主循环 (简化) ===
func (db *DB) Compact(ctx context.Context) error {
    // [WHY-5] 持续 loop, 直到没 block 可合并
    for {
        // 1. 选要合并的 block
        blocks := db.selectBlocksToCompact()
        if len(blocks) == 0 {
            return nil  // 没可合并的, 退出
        }

        // [WHY-3] 2. 合并 (后台异步, 不阻塞查询/写入)
        uid, err := db.compactBlocks(blocks, nil, nil, ...)
        if err != nil {
            return err
        }

        // [WHY-4] 3. 切元数据: 标记新 block, 删旧 block
        if err := db.reloadBlocks(); err != nil {
            return err
        }

        // 4. 触发下一轮 (可能还有可合并)
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-db.compactc:
        default:
        }
    }
}

// === 选 block 策略 (简化) ===
func (db *DB) selectBlocksToCompact() []*Block {
    if len(db.blocks) == 0 { return nil }

    // [WHY-2] 1. 找最旧的 block
    oldest := db.blocks[0]

    // 2. 找同源 (overlap) 的 block
    var selected []*Block
    for _, b := range db.blocks {
        if isCompactable(b, oldest) {
            selected = append(selected, b)
        }
        if len(selected) >= maxBlockToMerge {  // 默认 4
            break
        }
    }

    return selected
}

// === 判断两个 block 是否可合并 ===
func isCompactable(a, b *Block) bool {
    // 垂直: 相同时间范围
    if a.MinTime() == b.MinTime() && a.MaxTime() == b.MaxTime() {
        return true
    }
    // 水平: 时间重叠或相邻
    if a.MaxTime() >= b.MinTime() && b.MaxTime() >= a.MinTime() {
        return true
    }
    return false
}

// === 实际合并: compactBlocks (简化) ===
func (db *DB) compactBlocks(blocks []*Block, ...) (ulid.ULID, error) {
    // [WHY-4] 1. 创建临时输出目录
    uid := ulid.MustNew(ulid.Timestamp(time.Now()), nil)
    dir := filepath.Join(db.dir, uid.String())
    os.MkdirAll(dir, 0o755)

    // 2. 打开所有输入 block
    closers := make([]io.Closer, 0, len(blocks))
    readers := make([]chunkReader, 0, len(blocks))
    for _, b := range blocks {
        r, c, err := b.chunks()
        if err != nil { return ulid.ULID{}, err }
        readers = append(readers, r)
        closers = append(closers, c)
    }

    // 3. 合并 index + samples
    //    - Index 合并: series dict + postings (倒排索引)
    //    - Samples 合并: 按 series 顺序遍历, 时间排序写入
    indexw, err := newIndexWriter(path.Join(dir, "index"))
    if err != nil { return ulid.ULID{}, err }

    chunkw := newChunkWriter(dir)
    for {
        // 3.1 合并器: 从所有 block 拿下一个 series
        merged := mergeSeries(readers)
        if merged == nil { break }

        // 3.2 写新 series meta 到 index
        indexw.writeSeries(merged.lset, merged.ref, ...)

        // 3.3 合并 samples, 写新 chunk
        mergedSamples := mergeSamples(merged.iterators)
        chunkw.writeChunks(merged.ref, mergedSamples)
    }

    // 4. 写 meta.json + fsync
    meta := &BlockMeta{
        ULID:       uid,
        MinTime:    minTime,
        MaxTime:    maxTime,
        // ... stats
    }
    writeMetaFile(dir, meta)

    return uid, nil
}

// === reloadBlocks: 切元数据 ===
func (db *DB) reloadBlocks() error {
    // [WHY-4] 1. 扫目录, 找所有 block
    blocks, err := loadBlocks(db.dir)
    if err != nil { return err }

    // 2. 切到新 block 列表
    db.mtx.Lock()
    oldBlocks := db.blocks
    db.blocks = blocks
    db.mtx.Unlock()

    // 3. 标记旧 block 软删除 (等下个周期才真删)
    for _, b := range oldBlocks {
        if !containsBlock(blocks, b) {
            // 加入待删队列
            db.tombstones = append(db.tombstones, b)
        }
    }
    return nil
}

// === Block 目录结构 ===
//
// 01HXX0/
// ├── chunks/                    # 数据文件
// │   ├── 000001                # 16KB-512KB chunk 文件
// │   └── 000002
// ├── index                      # 倒排索引 + series dict
// ├── meta.json                  # 元数据
// │   {
// │     "ulid": "01HXX0...",
// │     "minTime": 1700000000000,
// │     "maxTime": 1700007200000,
// │     "stats": {
// │       "numSamples": 1000000,
// │       "numSeries": 5000
// │     },
// │     "compaction": {
// │       "level": 2,
// │       "sources": ["01HXX1", "01HXX2"]
// │     }
// │   }
// └── tombstones                # 软删除记录 (id, intervals)

// ================================================================
// 性能数据 (中等规模, 1M series, 1d 数据):
//
// [Compact 速度]
//   - 1 个 2h block (1GB): ~10-30s 合并
//   - 6 个 2h → 1 个 12h block: ~1-3min
//   - 2 个 12h → 1 个 24h block: ~3-10min
//
// [资源占用]
//   - CPU: 1-2 核 (解压 + 合并 + 重压)
//   - 内存: 1-2GB (合并时缓冲)
//   - 磁盘 IO: 100-500MB/s (读 + 写)
//
// [默认阈值]
//   - min-block-duration: 2h
//   - max-block-duration: 24h
//   - retention: 15d (默认)
//
// 关键配置:
//   - --storage.tsdb.min-block-duration=2h
//   - --storage.tsdb.max-block-duration=24h
//   - --storage.tsdb.max-concurrent-compactions=2
//
// 坑:
//   - compact 太频繁 → IO 高, 业务受影响
//   - compact 太少 → block 多, 查询慢
//   - corrupt block → compact 失败, 启动卡住
//   - 磁盘满 → compact 写失败, 数据丢失
//
// 监控:
//   - prometheus_tsdb_compactions_total       # 合并总数
//   - prometheus_tsdb_compaction_duration_seconds  # 合并耗时
//   - prometheus_tsdb_blocks_loaded          # 当前 block 数
//   - prometheus_tsdb_head_series            # head series
//   - du -sh /prometheus                      # 磁盘总占用
// ================================================================
