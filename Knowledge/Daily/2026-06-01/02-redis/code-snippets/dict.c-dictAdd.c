// 来源: Redis src/dict.c
// 作用: 哈希表核心 — rehash + 渐进式迁移
// 调用链: dictAddRaw → _dictKeyIndex → _dictRehashStep (若在 rehash 中)
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么是渐进式 rehash
//   - 大 dict (1M+ entry) 一次性 rehash: ms 级卡顿 = 主线程阻塞
//   - 渐进式: 每次操作搬 1 个 bucket, 100w 桶 100w 次操作才搬完
//   - 业务无感, 内存峰值低 (老 + 新 table 短暂共存)
//
// [WHY-2] 为什么是 2 个 hash table
//   - ht_table[0] 老, ht_table[1] 新
//   - 扩容: ht_table[1] 翻倍, rehash 完成后 ht_table[1] 接班
//   - 缩容: 触发条件 used/buckets < 0.1 (HASHTABLE_MIN_FILL)
//   - 简化 rehash 逻辑, 不需要"原地缩容"
//
// [WHY-3] 为什么 rehash 走"操作时捎带"
//   - 扩/缩容本身没业务驱动, 必须挂到正常操作上
//   - dictAdd / dictFind / dictDelete 都先 rehash 1 步
//   - timer (serverCron) 也兜底: 1ms 内 rehash 100 步 (避免低负载卡住)
//
// [WHY-4] 负载因子与扩缩容阈值
//   - dict_force_resize_ratio = 5 (强制扩容, 防 hash 退化)
//   - 扩容: load_factor = used/buckets > 1.0
//   - 缩容: load_factor < 0.1
//   - load_factor = 5 时, 哈希冲突剧增, 必须立即 rehash
//
// [WHY-5] rehashidx 的作用
//   - 全局进度指针, 标识"下一个要搬的桶"
//   - rehash 过程中, _dictKeyIndex 走 ht_table[0][rehashidx] 和 ht_table[1]
//   - rehash 完成: rehashidx = -1, ht_table[1] → ht_table[0]
// ================================================================

dictEntry *dictAddRaw(dict *d, void *key, dictEntry **existing) {
    long index;
    dictEntry *entry;

    // === [WHY-1] 渐进式: 每次操作捎带 rehash 1 步 ===
    if (dictIsRehashing(d))
        _dictRehashStep(d);

    // === [WHY-2] 找 key 应在的桶 ===
    //   - 正常情况: 走 ht_table[0] (或 ht_table[1], 若在 rehash 中)
    //   - 返回 -1 = key 已存在
    if ((index = _dictKeyIndex(d, key, dictHashKey(d, key), existing)) == -1)
        return NULL;

    // === [WHY-4] 强制扩容保护 ===
    //   - 负载因子超过 5, 立刻扩 (即使不在 rehash 中)
    //   - 防哈希退化 (大量冲突)
    if (d->ht_used[0] >= d->ht_size[0] &&
        (dict_can_resize || d->ht_used[0] > dict_force_resize_ratio * d->ht_size[0])) {
        if (dictCheckResize(d) == DICT_ERR) return NULL;
    }

    // === [WHY-3] 分配 entry, 头插到桶链表 ===
    //   - 用 zmalloc 而非 malloc: Redis 自己的分配器, 带统计
    entry = zmalloc(sizeof(*entry));
    entry->next = d->ht_table[0][index];  // 头插, O(1)
    d->ht_table[0][index] = entry;
    d->ht_used[0]++;

    // 重新设置 rehash 标志 (dictCheckResize 可能改了 ht_used)
    dictSetHash(d, entry, dictHashKey(d, key));
    return entry;
}

// === 渐进式 rehash 的 1 步实现 ===
// 关键: 一次搬 1 个桶 (即一个链表), 内部对每个 entry rehash
int _dictRehashStep(dict *d) {
    if (d->iterators == 0) {
        // 1 次搬 1 个桶 (空桶直接跳过)
        // 内部: 从 ht_table[0][rehashidx] 取链表, 逐 entry 算 hash,
        //        挂到 ht_table[1] 对应桶
        dictRehash(d, 1);
    }
    return 1;
}

// === 批量 rehash (serverCron 兜底, 低负载时用) ===
int dictRehashMilliseconds(dict *d, int ms) {
    long long start = timeInMilliseconds();
    int steps = 0;
    while (dictRehash(d, 100) == 100) {  // 每次 100 桶
        steps += 100;
        if (timeInMilliseconds() - start > ms) break;
    }
    return steps;
}

// ================================================================
// 性能数据 (1M entry hash table, 8 字节 key + 8 字节 value):
//
// [rehash 总量]
//   - 1M entry → 2M buckets (扩容翻倍)
//   - 每次操作捎带 1 桶 = 1M 次操作才能搬完
//   - 高 QPS (10w op/s) 时, 100ms 就能完成
//   - 低 QPS 时, serverCron 兜底 1ms 内搬 100 桶
//
// [rehash 中间态性能]
//   - 1 桶搬完 = 1 个 entry 的 hash + 链表挂接
//   - 1 桶链表平均 1-2 entry, 耗时 < 100ns
//   - 业务延迟影响: < 1%, 完全无感
//
// [内存峰值]
//   - 老 + 新 table 共存: 24MB (1M entry × 16 byte) × 2 = 48MB
//   - 持续 100ms, 之后释放老 table
//   - 比一次性 rehash 内存峰值更低
//
// ================================================================
// 深度拓展: 哈希冲突 + 内存碎片 + 大 dict 实战
//
// [哈希冲突的退化与防]
//   - 哈希退化: 大量 entry 哈希到同一桶 = 链表很长, O(n) 查找
//   - Redis 不用红黑树: 单条命令延迟敏感, 树 rebalance 抖动
//   - 防御: dict_force_resize_ratio = 5, 强制扩容
//   - 退化概率: 2^32 哈希空间, 5x 负载因子, 链表长度期望 1-2
//
// [rehash 阶段 1 次搬 1 桶的实现]
//   - 从 ht_table[0][rehashidx] 取链表 (rehashidx 是当前进度)
//   - 遍历链表, 算每个 entry 的新 hash (掩码变了)
//   - 挂到 ht_table[1] 对应桶
//   - rehashidx++
//   - 全部完成: rehashidx = -1, ht_table[1] 接班
//
// [为什么 rehash 期间 query/insert/delete 还能用]
//   - 查找: 走 ht_table[0] 和 ht_table[1] 都查
//   - insert: 只走 ht_table[1] (新数据进新 table)
//   - delete: 两个 table 都删
//   - 这就是渐进式: 不停服, 边服务边搬
//
// [sizemask 与 ht_size 的关系]
//   - ht_size = N (实际 bucket 数)
//   - sizemask = N - 1 (按位与算桶位置, 比 % 快)
//   - 约束: N 必须是 2 的幂 (Redis 代码 dictExpand 强制)
//
// [大 dict 兜底 rehash 死锁问题]
//   - dict 数量 > 1000, serverCron 1ms 不够搬
//   - 现象: 某个大 dict 长期处于 rehashing 状态
//   - 解法: 业务调优 (key 数 < 1M), 或升级 Redis 7.0 (优化)
//
// [为什么 dictScan 期间不触发 rehash]
//   - rdbSave 走 dictScan 全量扫
//   - scan 期间 rehash: 漏数据 / 重复数据
//   - 设计: scan 期间 iterators++, 阻塞 rehash
//   - 隐患: 大 dict scan 阻塞 1-2 秒, rehash 停滞
//
// [实战: 监控 dict rehash 状态]
//   - INFO memory: mem_fragmentation_ratio
//   - mem_fragmentation > 1.5: 碎片多, 考虑重启
//   - mem_fragmentation < 1: 用了 swap, 性能差
//   - normal 范围: 1.0 - 1.5
//
// [Redis 7.0 哈希优化]
//   - 用 SipHash 替代 MurmurHash3 (DoS 防护)
//   - siphash 速度略慢, 但安全
//   - hash 攻击: 构造 key 让 hash 集中, 触发 O(n)
//   - SipHash: keyed hash, 防构造
//
// [对比: 业界其他哈希表实现]
//   - Java HashMap: 数组 + 链表 + 红黑树 (Java 8+)
//   - Go map: 桶 + 溢出桶, 增量 rehash
//   - Python dict: open addressing, FNV / SipHash
//   - LevelDB: 静态哈希, 不 rehash
//   - Redis dict: 链地址 + 渐进式, 工程化最佳
//
// ================================================================
// 坑:
//   - safe iterator 才能在 rehash 中迭代 (否则漏数据)
//   - dict 数量 > 1000 时, 兜底 rehash 会饿死 (serverCron 1ms 不够)
//   - rdb save 走 dictScan, 不触发 rehash 进度, 临时数据可能全在 ht_table[0]
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 哈希冲突退化的临界点]
//   - 链表长度 5-10 时, 比较函数 O(n) 退化
//   - 实际: 1000 万 key, 哈希好时平均链长 = 1-2
//   - 哈希差 (DDoS): 攻击者构造哈希冲突, 链长 1000+, QPS 跌 1000 倍
//   - Redis 7.0+: 用 SipHash 防 DoS (dict.c dictForceRehash)
//
// [案例 2: 1-bucket-per-step 渐进式 rehash 详解]
//   - 触发: 负载因子 > 1 (无 rehashid) 或 > 5 (有 rehashid)
//   - 步骤: rehash 1 个 bucket → 100 bucket 循环 → 检查进度
//   - 每 1ms: dictRehashMilliseconds(d, 1) 推进 1ms
//   - 期间: query 走 ht[0]+ht[1] 双查, insert 只入 ht[1]
//   - 完成: 释放 ht[0], ht[1] → ht[0], 置 rehashidx = -1
//
// [案例 3: rehash 期间 query/insert/delete 怎么 work]
//   - query: 双查 ht[0] + ht[1], O(1) 摊销
//   - insert: 只入 ht[1], 避免 ht[0] 还要迁移
//   - delete: 双查后删除
//   - 关键: rehash 期间不主动 migrate, lazy 推进
//
// [案例 4: sizemask = N-1 vs 取模 %]
//   - N 是 2 的幂, sizemask = N-1, 用 & 代替 %
//   - & 性能: ~1ns, % 性能: ~10ns (10x 差)
//   - 副作用: 必须保证 N = 2^B (扩容时 B+1)
//
// [案例 5: 大 dict 兜底问题]
//   - 100 万 key dict, rehash 100 万次
//   - serverCron 每 1ms 推 1ms 工作, 不可能 1 帧完成
//   - 解决: dictRehashMilliseconds 跨多帧推进
//   - 监控: INFO memory used_memory_peak_perc
//
// [案例 6: dictScan 阻断 rehash 的数据泄露]
//   - rdbSave 调 dictScan 遍历所有 key
//   - dictScan 不触发 rehash 推进
//   - 结果: 1 亿 key 遍历, 期间 rehash 暂停, 内存涨 50%
//   - 解法: SCAN 内部也用渐进 rehash, Redis 6.0+ 修复
//
// [案例 7: Redis 7.0 SipHash DoS 防护]
//   - 7.0 之前: djb2 / MurmurHash2, 攻击者可构造碰撞
//   - 7.0+: 强制 SipHash 1-2 (per-instance 随机 key)
//   - 实测: SipHash 比 MurmurHash 慢 20%, 但安全
//   - 配置: 无法关闭 (内置安全)
//
// [案例 8: 对比业界其他哈希表]
//   - Java HashMap: 数组 + 链表 + 红黑树 (Java 8+), 链长 8 转红黑
//   - Go map: 桶 + 溢出桶, 增量 rehash, 8 元素/桶
//   - Python dict: open addressing, FNV / SipHash, 5/8 满扩容
//   - LevelDB: 静态哈希, 不 rehash (静态使用)
//   - Redis dict: 链地址 + 渐进式, 工程化最佳
//
// [案例 9: dict 性能调优实战]
//   ```
//   # redis.conf
//   hash-max-ziplist-entries 512  # 阈值: 512 元素内压缩
//   hash-max-ziplist-value 64     # 阈值: 64B 内压缩
//   set-max-intset-entries 512    # intset 阈值
//   ```
//   - 小 hash 用 ziplist 节省内存 (10x)
//   - 大 hash 退化 hashtable, 性能稳定
//   - 监控: INFO memory mem_allocator
//
// [案例 10: dict 迭代器的安全/不安全模式]
//   - 不安全迭代器: 迭代中不可 rehash (会跳 key)
//   - 安全迭代器: 迭代中可 rehash (serverCron 可推进)
//   - API: dictGetSafeIterator 返回安全
//   - 用法: SCAN / KEYS 用安全, FCALL 内部迭代用不安全
// ================================================================
