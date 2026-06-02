// 来源: prometheus tsdb/head.go:Appender + headAppender.Add
// 作用: TSDB Head 写入入口 — 内存 + WAL 双写, fingerprint 去重
// 调用链: storage.Appender → Head.Appender → headAppender.Add → memSeries + WAL
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] TSDB Head 的双重写入策略
//   - 写入路径: 1) 写 WAL (Write-Ahead Log) → 2) 写 memSeries (内存)
//   - 为什么双写: WAL 保证 crash 恢复, 内存提供热数据查询
//   - 关键: 先 fsync WAL, 再改内存, 保证不丢数据
//   - 崩溃后: replay WAL 恢复 head, 然后 compact 到 block
//   - 类比: 关系数据库的 redo log, 但更精简 (只追加)
//
// [WHY-2] memSeries 哈希表 + fingerprint
//   - fingerprint = hash(labels) — 同一 label 集共享 series ID
//   - 结构: hash → memSeries (O(1) 查找)
//   - memSeries 内部: 环形 buffer (mmap'd) + chunks
//   - 高基数风险: 不同 label 组合 = 不同 series, 内存爆炸
//   - 经验值: 1M series ~ 几 GB 内存
//
// [WHY-3] WAL 文件结构 + 压缩
//   - 记录类型: RefSample (sample), RefSeries (series 创建), Tombstone
//   - 格式: varint 编码 + 类型前缀
//   - 压缩: 一组记录批量 fsync (默认 1s 或 4MB)
//   - 生命周期: 写入 → 切段 (默认 128MB) → 旧段保留直到 compact 完成
//   - replay: 从头读 WAL, 重建 memSeries
//
// [WHY-4] Series Ref 与锁粒度
//   - series ref = 全局自增 ID (uint64)
//   - 锁粒度: 整个 Head 1 个锁, 写操作串行化
//   - 优化: shard 锁 (按 fingerprint 取模), 高并发提升 5-10x
//   - 读取: 用 sync.RWMutex, 读并发, 写互斥
//   - Appender 批量: Add() 多次 + Commit() 一次 fsync, 减少系统调用
//
// [WHY-5] Head 的时间窗口 + 切块
//   - 默认 2h 内的数据在 Head
//   - 2h 后: compact 到 Block (磁盘不可变)
//   - 切块时机: append 时检查, head 时间跨度 > 2h 触发 compact
//   - 切块过程: 写新 head 实例, 旧 head 落盘
//   - 含义: 最近 2h 数据快 (内存 mmap), 历史数据压缩 (block)
// ================================================================

// === Head 主结构 ===
type Head struct {
    series  *stripeSeries        // 分片锁的 series 表
    wal     WAL                  // Write-Ahead Log
    appenderMu sync.Mutex        // append 锁
    chunkPool sync.Pool          // chunk 对象池
    minTime, maxTime int64       // head 时间范围
    lastSeriesID atomic.Uint64   // 全局 series ref
    // ... 省略 20+ 字段
}

// === Appender 工厂 ===
func (h *Head) Appender() storage.Appender {
    return &headAppender{
        head: h,
        // 收集待 commit 的 samples, 一次 fsync
        samples: make([]record.RefSample, 0, 1024),
    }
}

// === 实际写入 (简化) ===
func (a *headAppender) Add(
    ref storage.SeriesRef,
    lset labels.Labels,
    t int64,
    v float64,
) (storage.SeriesRef, error) {
    // [WHY-1] 1. 拿锁
    a.head.appenderMu.Lock()
    defer a.head.appenderMu.Unlock()

    // [WHY-2] 2. 算 fingerprint = hash(labels)
    fp := lset.Hash()

    // 3. 查 memSeries (O(1))
    s, created := a.head.series.getOrCreate(fp, lset, ...)

    if !created {
        // [WHY-3] 4. 写 WAL 记录 (新 series 创建)
        a.head.wal.Write([]record.RefSeries{{Ref: s.refID, Labels: lset}})
    }

    // [WHY-3] 5. 写 WAL sample 记录
    a.head.wal.Write([]record.RefSample{{Ref: s.refID, T: t, V: v}})

    // 6. 更新 memSeries (追加到 chunk)
    s.append(t, v)
    a.samples = append(a.samples, record.RefSample{Ref: s.refID, T: t, V: v})

    return s.refID, nil
}

// === Commit: 批量 fsync ===
func (a *headAppender) Commit() error {
    // 关键: Commit 触发 WAL fsync (确保落盘)
    return a.head.wal.WriteAndClose()
}

// === memSeries 内部 ===
type memSeries struct {
    refID    uint64
    lset     labels.Labels
    chunks   []memChunk          // 最近几个 chunk
    headChunk *memChunk          // 当前写入 chunk
    app   func(t int64, v float64)  // append 函数
    // ... 元数据
}

func (s *memSeries) append(t int64, v float64) {
    // 1. 检查 head chunk 是否满 (默认 120 sample)
    if s.headChunk == nil || s.headChunk.samples >= chunkSize {
        // 创建新 chunk
        s.headChunk = newMemChunk(...)
        s.chunks = append(s.chunks, s.headChunk)
    }
    // 2. Gorilla 压缩写入
    s.headChunk.app(t, v)
}

// === stripeSeries 分片锁 ===
type stripeSeries struct {
    size  uint64
    stripes []map[uint64]*memSeries
    locks   []sync.RWMutex
    hashSeed uint64
}

func (s *stripeSeries) getOrCreate(fp uint64, lset labels.Labels, ...) (*memSeries, bool) {
    idx := fp % s.size  // 取模
    s.locks[idx].Lock()
    defer s.locks[idx].Unlock()
    if existing, ok := s.stripes[idx][fp]; ok {
        return existing, false
    }
    // 创建
    s.lastID++
    s := &memSeries{refID: s.lastID, lset: lset}
    s.stripes[idx][fp] = s
    return s, true
}

// === WAL 写入 (简化) ===
type WAL struct {
    pages    *pagePool    // 内存 page 池
    segment  *Segment     // 当前段文件
    buf      []byte       // 写入缓冲
}

func (w *WAL) Write(recs []record.RefSample) error {
    // 1. 编码: varint(type) + varint(ref) + varint(t) + varint(v)
    for _, r := range recs {
        record.EncodeRefSample(w.buf, r)
    }
    // 2. 写入段文件
    w.segment.Write(w.buf)
    // 注: fsync 在 Commit 触发, 不每次都写盘
    return nil
}

// ================================================================
// 性能数据 (中等规模, 100 万 series, 15s scrape):
//
// [写入吞吐]
//   - 单 Appender.Add: ~5-10μs (含 hash + WAL encode)
//   - 批量 (1024 samples): ~1-2ms (摊销)
//   - fsync: ~1-5ms (取决于磁盘)
//   - 总写入: ~100K-500K samples/s
//
// [内存占用]
//   - 1M series × 100B (含元数据) = 100MB
//   - 环形 buffer (mmap 1GB): 全占
//   - WAL buffer: 4MB default
//   - 总: ~1.2GB (Prom 自身)
//
// [WAL 段大小]
//   - 默认 128MB / 段
//   - replay 速度: ~200MB/s (mmap 读)
//   - crash 恢复: 1GB WAL ~5s
//
// 关键配置:
//   - --storage.tsdb.wal-compression   # WAL 压缩 (zstd)
//   - --storage.tsdb.min-block-duration=2h
//   - --storage.tsdb.max-block-chunk-segment-size=512MB
//
// 坑:
//   - 高基数 label (user_id) → 内存爆, 用 histogram 替代
//   - WAL fsync 太频繁 → IO 瓶颈, 批量 commit
//   - 长时间未 compact → head 内存涨, 检查 --max-block-duration
//   - 写失败不重试 → 数据丢失, 用 remote_write 双写保险
//
// 监控:
//   - prometheus_tsdb_head_series        # head 中 series 数
//   - prometheus_tsdb_head_appends_total # append 计数
//   - prometheus_tsdb_wal_page_writes_total  # WAL 写入页数
//   - prometheus_tsdb_compaction_duration_seconds  # compact 耗时
// ================================================================



// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: Appender 5 大核心方法]
//   - Add(lset labels):     添加 1 个 sample
//   - AddFast(lset, ts, v): 优化路径, 跳过 dedup
//   - Commit():             批量提交 (原子)
//   - Rollback():           丢弃 pending
//   - Buffered():           查看 buffer 大小
//
// [案例 2: 5 大 Appender 类型对比]
//   - 1) StandardAppender:   通用, 写入最稳
//   - 2) *mmappedAppender:   mmap 共享, 多进程安全
//   - 3) *extensibleAppender:1.x 新, 写时无锁
//   - 4) *readyScratchAppender: 内存, 用于 replay
//   - 5) Stub: 单元测试用
//
// [案例 3: WAL + Head Append 流程详解]
//   - 1) client.Add() → series ref 查找 (mmap 索引)
//   - 2) 写 pending sample 到 mmap head
//   - 3) Commit() → 刷盘 (mmap sync)
//   - 4) 后台 compaction: head → block
//   - 5) 查询: 先查 head, 再查 blocks
//
// [案例 4: 5 大写入性能优化]
//   - 1) 批量 Add + 单次 Commit: 10x 提升
//   - 2) AddFast 跳过 dedup:  +30%
//   - 3) 并发写多 Series:    并行
//   - 4) 增大 chunk size:     减少 block 数
//   - 5) 用 Remote Write:     分摊到多个 TSDB
//
// [案例 5: Appender 错误处理 5 大陷阱]
//   - 1) series 未注册:      panic (要先 Create)
//   - 2) 重复 timestamp:     允许 (out-of-order)
//   - 3) 标签不一致:        panic (label set 不同)
//   - 4) 无效 label name:   启动校验失败
//   - 5) out-of-order:      默认 0 (关闭), 建议开
//
// [案例 6: 5 大 TSDB 索引设计细节]
//   - 1) symbols table:     label name/value → ID
//   - 2) series hash:       label set → series ref
//   - 3) postings list:     label value → series 列表
//   - 4) chunks:            (timestamp, value) 压缩块
//   - 5) mmap 共享:         进程间零拷贝
//
// [案例 7: Compaction 策略 5 大要点]
//   - 1) head → level 1:    head block 满 → 落盘
//   - 2) level N → N+1:     块数超阈值合并
//   - 3) 触发: 定期 + 写时
//   - 4) 资源: 限速 (--storage.tsdb.min-block-chunk-segment-size)
//   - 5) 影响: 压缩时读 + 写 性能降
//
// [案例 8: 5 大 Remote Write 实战]
//   - 1) 客户端: prometheus / vmagent / otel-collector
//   - 2) 协议: snappy + protobuf
//   - 3) 队列: 客户端缓冲, 防丢
//   - 4) 重试: 指数退避
//   - 5) 监控: 队列长度 + 发送延迟
//
// [案例 9: Appender 与 PromQL 关系]
//   - Add: 1 sample = (labels, timestamp, value)
//   - PromQL: sum(rate(metric[5m])) → 扫 series + chunks
//   - chunk 选择: time range → 命中 chunk list
//   - 索引: label matcher → postings list
//   - 优化: chunk 内 Gorilla 压缩, 解压快
//
// [案例 10: 5 大生产监控指标]
//   - prometheus_tsdb_head_series        # series 数
//   - prometheus_tsdb_head_samples_appended_total  # 总样本
//   - prometheus_tsdb_compactions_total  # 压缩次数
//   - prometheus_tsdb_wal_corruptions_total  # WAL 损坏
//   - prometheus_tsdb_out_of_order_samples_total  # OOO 样本
// ============================================================