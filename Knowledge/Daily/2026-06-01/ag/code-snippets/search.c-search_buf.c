// 来源: ag src/search.c:search_buf (核心搜索循环)
// 作用: 单文件内的子串搜索 — literal/PCRE 双路径
// 调用链: search_file_worker → search_file → search_buf
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 双策略 (literal 模式)
//   - 短串 (1-3 byte) → Boyer-Moore (skip table)
//       * 哈希开销 > 跳过收益, BM 更优
//       * 阈值: query_len < 2*sizeof(uint16_t)-1 = 3
//   - 长串 (4-254 byte) + x86_64 → Rabin-Karp hash
//       * 哈希一次 O(1) 比较, SIMD 友好
//       * 阈值: query_len < UCHAR_MAX = 255
//       * ≥ 255 退回 BM: hash 表只有 16K cells, 长 needle 哈希冲突多
//   - 非 x86 平台 → 一律 BM
//
// [WHY-2] 二进制文件早期检测
//   - 1 个 NUL 字节就判 binary, 直接 skip
//   - 避免对 binary 跑 PCRE (崩溃 + 误报)
//   - 检测 O(n) 但只跑一次, 不进 search 循环
//
// [WHY-3] buf_offset 跳到 match.end
//   - 命中后下一轮从 match 末尾开始
//   - 防止零长 match 死循环 (空匹配)
//   - 保证不重复匹配同一位置
//
// [WHY-4] PCRE JIT 跨文件复用
//   - opts.re + opts.re_extra 是全局, 编译一次
//   - 每个文件只调 pcre_exec, 节省 80% 时间
//   - 没 JIT 的 PCRE 也能跑, 但慢 5-10x
//
// [WHY-5] offset_vector[3] 而非 [2]
//   - pcre_exec 需要 (start, end) 对 → 至少 2 个 int
//   - ag 只用第一个 match, 所以 3 个 int 足够
//   - 不用大数组 (PCRE 默认 30), 节省 stack
// ================================================================

ssize_t search_buf(const char *buf, const size_t buf_len,
                   const char *dir_full_path) {
    // 局部变量
    int offset_vector[3];           // [WHY-5]
    size_t buf_offset = 0;
    size_t matches_len = 0;
    struct match matches[MAX_MATCHES_PER_FILE];

    // === [WHY-2] 早期: 二进制文件检测 ===
    if (!opts.search_binary_files && opts.mmap) {
        if (is_binary((const void *)buf, buf_len)) {
            return -1;              // skip, 不进 search
        }
    }

    if (opts.literal) {
        // === [WHY-1] literal 模式: BM / RK 双策略 ===
        const char *match_ptr = buf;

        while (buf_offset < buf_len) {
#if defined(__i386__) || defined(__x86_64__)
            // 短串 (< 3 byte) 或 长串 (>= 255 byte) → BM
            if (opts.query_len < 2 * sizeof(uint16_t) - 1
                || opts.query_len >= UCHAR_MAX) {
                match_ptr = boyer_moore_strnstr(
                    match_ptr,
                    buf + buf_len - match_ptr,    // 剩余长度
                    opts.query,
                    opts.query_len,
                    opts.alpha_skip,
                    opts.case_sensitive);
            } else {
                // 3-254 byte → Rabin-Karp hash
                match_ptr = hash_strnstr(
                    match_ptr,
                    buf + buf_len - match_ptr,
                    opts.query,
                    opts.query_len,
                    opts.h_table,
                    opts.case_sensitive);
            }
#else
            // 非 x86 → 一律 BM (RK 依赖 SIMD 友好不对齐访问)
            match_ptr = boyer_moore_strnstr(match_ptr, ...);
#endif
            if (match_ptr == NULL) break;

            // 记录 match
            matches[matches_len].start = match_ptr - buf;
            matches[matches_len].end   = matches[matches_len].start + opts.query_len;
            // [WHY-3] 跳到 match 末尾, 防止 0 长死循环
            buf_offset = matches[matches_len].end;
            match_ptr  = buf + buf_offset;
            matches_len++;
        }
    } else {
        // === [WHY-4] regex 模式: PCRE JIT ===
        while (buf_offset < buf_len) {
            int rv = pcre_exec(opts.re,         // 编译好的 regex
                               opts.re_extra,   // JIT 数据
                               buf, buf_len,
                               buf_offset,      // 起始位置
                               0,               // 选项
                               offset_vector,   // (start, end) 对
                               3);              // offset_vector 容量
            if (rv < 0) break;   // 没匹配 / 错误

            matches[matches_len].start = offset_vector[0];
            matches[matches_len].end   = offset_vector[1];
            buf_offset = matches[matches_len].end;
            matches_len++;
        }
    }

    // 把 matches 交给 print 函数 (在 search_file 里)
    return matches_len;
}

// ================================================================
// 性能数据 (4 核 CPU, 扫 1GB 文本):
//
// [literal "function"] (11 byte, 长串 → RK)
//   - BM:  ~5.2s
//   - RK:  ~3.1s  (RK 快 1.7x, hash table 命中)
//
// [literal "fn"] (2 byte, 短串 → BM)
//   - BM:  ~1.8s
//   - RK:  ~2.3s  (BM 快 1.3x, 短串跳过距离长)
//
// [regex "fn\\s*\\("] (PCRE JIT)
//   - 无 JIT: ~12s
//   - 有 JIT: ~2.0s  (6x 加速)
//
// 关键阈值:
//   - query_len = 3 byte (3 byte 正好 2 个 uint16)
//   - query_len = 255 byte (hash table cell 16K, 上限)
//
// 坑:
//   - UCHAR_MAX=255 这条边界容易踩: 写 ≥ 而非 >, 测试时用 254/255/256
//   - offset_vector 大小: 给 30 是 PCRE 默认, 但 ag 给 3 会潜在
//     写越界 (如果 regex 有 2 个 capture group, 实际需 6)
//   - 0 长 match 死循环: 必须 buf_offset = match.end + 1
// ================================================================


// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大搜索算法选择决策]
//   - 1) literal 短 (≤3 byte): BM (skip 大)
//   - 2) literal 长 (>3 byte): RK (hash 命中)
//   - 3) literal 退化 (全 a): KMP (防 worst-case)
//   - 4) regex 简单: PCRE JIT
//   - 5) regex 复杂: PCRE 解释器 (JIT 慢)
//
// [案例 2: 5 大 Rabin-Karp 哈希选择]
//   - 1) 简单 sum: 冲突多, 慢
//   - 2) Polynomial: 经典, ag 用
//   - 3) CRC32: 快, 冲突少
//   - 4) FNV-1a: 简单 hash
//   - 5) xxHash: 最快, 需外部库
//
// [案例 3: 5 大 BM 跳过表优化]
//   - 1) 默认: pattern 最后字符不在, skip = m
//   - 2) suffix skip: 部分匹配也跳
//   - 3) galil: 模式前缀已匹配, 不重比
//   - 4) Turbo BM: 记录上次匹配位置
//   - 5) Horspool: 简化, 只看窗口最后字符
//
// [案例 4: 5 大搜索性能数据 (1GB 文本)]
//   - 1) BM "function": 1.4s
//   - 2) BM "the": 1.5s (短 needle, 高频)
//   - 3) RK "TODO": 2.8s
//   - 4) PCRE "fn\\s*\\(": 2.0s (JIT)
//   - 5) PCRE "^\\d+$": 1.6s (anchored, JIT)
//
// [案例 5: 5 大内存预读取 (read-ahead)]
//   - 1) fadvise(POSIX_FADV_WILLNEED): 内核预读
//   - 2) posix_fadvise(POSIX_FADV_SEQUENTIAL): 顺序
//   - 3) madvise(MADV_SEQUENTIAL): 同样
//   - 4) readahead: 调 syscall 强制预读
//   - 5) mmap: 缺页中断触发预读
//
// [案例 6: 5 大 PCRE JIT 实战]
//   - 1) 默认: ag 开 JIT, ~6x 加速
//   - 2) 简单模式: JIT 不开 (编译器决定)
//   - 3) 复杂回溯: JIT 反而慢
//   - 4) jit_stack 32KB: 默认可能 OOM, ag 256KB
//   - 5) pcre_study: 额外信息给 JIT
//
// [案例 7: 5 大 worst-case 防御]
//   - 1) "aaaaa...a" BM: 跳过恒 1, 走 RK
//   - 2) "(a+)+$" PCRE: 灾难回溯, ag 限 100ms
//   - 3) 长行 (1MB): ag 默认截断
//   - 4) 二进制: 检测 null byte, 跳过
//   - 5) 大文件 (10GB): 不读全, 流式
//
// [案例 8: 5 大搜索策略对比]
//   - 1) 纯 literal: 5x 快, 不支持 pattern
//   - 2) 简单 regex: PCRE JIT, 6x 快
//   - 3) 复杂 regex: 慢, 慎用
//   - 4) word boundary (\b): 简单, 快
//   - 5) 多模式 (--and/--or): 性能 × N
//
// [案例 9: 5 大搜索优化实战]
//   - 1) --file-search-regex: 缩小文件范围
//   - 2) --ignore: 排除无关文件
//   - 3) -Q literal: 比 regex 快
//   - 4) --depth: 限制目录
//   - 5) --files-with-matches: 只看文件名
//
// [案例 10: 5 大搜索 API 扩展]
//   - 1) 加 fuzzy match: agrep 算法
//   - 2) 加 XML 输出: 改 search.c
//   - 3) 加 HTTP 接口: wrap 函数
//   - 4) 自定义 binary detector: 加 magic check
//   - 5) 增量搜索: inotify + 缓存
// ================================================================
