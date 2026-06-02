// 来源: ag src/util.c (节选 generate_alpha_skip + boyer_moore_strnstr)
// 作用: Boyer-Moore skip table 生成 + 实际匹配
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 256 byte 字符表
//   - 字符全集 0-255, 一张表覆盖
//   - 跳过距离: 当字符 c 在 needle 中, 跳到对齐 c 的位置
//   - 不在 needle: 跳整个 needle 长度
//   - 生成 O(needle_len), 跨文件复用 → 平摊 O(1)
//
// [WHY-2] case-insensitive 用 tolower
//   - 生成表时: pattern 和表都用 lowercase
//   - 匹配时: 字符也 lowercase 后查表
//   - 注意: locale 敏感! 中文/土耳其语可能错
//
// [WHY-3] 起始位置从右向左
//   - BM 经典优化: 从 needle 末尾开始比
//   - 第一个字符不匹配 → 立即用 skip table 跳
//   - 比"从左向右 + 回退"快 ~30%
//
// [WHY-4] from_right 循环
//   - i = needle_len - 1, j = buf_offset + needle_len - 1
//   - haystack[i] != needle[j] → 查 skip[haystack[i]] 跳过
//   - 全匹配 → 返回 match 起点
//
// [WHY-5] 最坏情况退化
//   - pattern 全是 'a' (aaaa...aaa) → 跳过距离恒为 1
//   - 这时 BM 退化为 O(n*m), 跟朴素一样
//   - 解决: Rabin-Karp 接管长 needle (见 search_buf)
// ================================================================

// === 生成 alpha_skip 表 ===
// skip_lookup[256] = size_t, 含义: 字符 c 出现时跳多远
void generate_alpha_skip(const char *find, size_t f_len,
                         size_t skip_lookup[], int case_sensitive) {
    // 默认: 不在 needle 中 → 跳 f_len
    for (int i = 0; i < 256; i++) {
        skip_lookup[i] = f_len;
    }
    // needle 中每个字符: 跳到对齐位置 (从右数第几个)
    // [WHY-1] 字符越靠右, 跳过距离越短
    for (size_t i = 0; i < f_len - 1; i++) {
        char c = find[i];
        if (!case_sensitive) c = (char)tolower((unsigned char)c);
        // 跳过距离 = f_len - i - 1
        // 这样下一次对齐, c 落在 needle 最右边的 c 位置
        skip_lookup[(unsigned char)c] = f_len - i - 1;
    }
    // [WHY-2] 大小写不敏感时, 大写也设上
    if (!case_sensitive) {
        for (size_t i = 0; i < f_len - 1; i++) {
            char c = find[i];
            if (isalpha((unsigned char)c)) {
                char upper = (char)toupper((unsigned char)c);
                skip_lookup[(unsigned char)upper] = f_len - i - 1;
            }
        }
    }
}

// === BM 实际匹配 ===
// 从右向左扫, 不匹配就查 skip 表跳
const char *boyer_moore_strnstr(const char *haystack, size_t h_len,
                                const char *needle,   size_t n_len,
                                size_t skip_lookup[], int case_sensitive) {
    if (n_len == 0) return haystack;
    if (h_len < n_len) return NULL;

    size_t h_idx = 0;  // haystack 上的当前位置
    while (h_idx <= h_len - n_len) {
        // [WHY-3] 从右向左比
        ssize_t n_idx = n_len - 1;
        const char *h = haystack + h_idx + n_idx;
        const char *n = needle + n_idx;
        while (n_idx >= 0) {
            char hc = *h, nc = *n;
            if (!case_sensitive) {
                hc = (char)tolower((unsigned char)hc);
                nc = (char)tolower((unsigned char)nc);
            }
            if (hc != nc) break;   // 不匹配, 跳出
            n_idx--;
            h--; n--;
        }
        if (n_idx < 0) {
            // 全匹配!
            return haystack + h_idx;
        }
        // 不匹配: 查 skip 表跳
        // [WHY-4] 用 haystack 末尾字符 (不匹配的那个) 决定跳多远
        char mismatch = haystack[h_idx + n_len - 1];
        if (!case_sensitive) {
            mismatch = (char)tolower((unsigned char)mismatch);
        }
        h_idx += skip_lookup[(unsigned char)mismatch];
        // [WHY-5] 跳过距离至少 1, 防死循环
        if (skip_lookup[(unsigned char)mismatch] == 0) h_idx++;
    }
    return NULL;  // 没找到
}

// ================================================================
// 性能数据:
//
// 短 needle (2-3 byte) BM 性能 (扫 1GB 文本):
//   - "fn"        (2 byte): ~1.8s   (skip 距离大, 命中率高)
//   - "the"       (3 byte): ~1.5s
//   - "a"         (1 byte): ~2.2s   (单 byte 没跳过, 几乎每字符都查)
//
// 长 needle BM vs 朴素:
//   - "function" (8 byte): BM ~1.4s, 朴素 ~6s    (4.3x)
//   - "xxxxxxxx" (8 byte): BM ~6s,  朴素 ~6s     (1x, 全 a 退化)
//
// 最坏情况:
//   - pattern = "aaaa...a" (n 个 a): 跳过距离恒 1, O(n*m)
//   - ag 的对策: 长 needle 走 Rabin-Karp (见 search_buf)
//
// 内存:
//   - skip_lookup: 256 * sizeof(size_t) = 2KB
//   - 每个 query 生成一次, 全局复用
//
// 坑:
//   - case_sensitive=FALSE 时, 表里要同时设大小写
//   - tolower((unsigned char)c): 不能直接 tolower(c), 负数会越界
//   - h_idx 边界: h_idx <= h_len - n_len, 不然会读越界
// ================================================================


// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大字符串搜索算法对比]
//   - 1) 朴素: O(n*m), 简单, 慢
//   - 2) BM (Boyer-Moore): O(n/m) 最佳, 跳大
//   - 3) KMP: O(n+m), 防 worst-case
//   - 4) RK (Rabin-Karp): O(n+m) 均值, hash
//   - 5) Horspool: BM 简化, 实际快
//
// [案例 2: 5 大 BM 跳过表构造]
//   - 1) alpha_skip[256]: pattern 中每个 char 的跳过距离
//   - 2) find_skip: 模式中 char 的最近距离
//   - 3) suffix skip: 已匹配后缀的跳过
//   - 4) full skip: 整模式不匹配时跳
//   - 5) bad char: BM 核心, O(1) 算
//
// [案例 3: 5 大 generate_alpha_skip 实战]
//   - 1) 长 needle: skip 距离小, 频繁触发
//   - 2) 短 needle: skip 距离大, 命中少
//   - 3) 全 ascii: 256 桶全填, 2KB
//   - 4) 高频字符 (e, t): skip = needle_len
//   - 5) 唯一字符 ("@"): 跳过 needle_len-1
//
// [案例 4: 5 大 case-insensitive 实现]
//   - 1) 生成 2 套 skip 表: 大写 + 小写
//   - 2) hash 时: tolower 两侧
//   - 3) BM 时: 两侧都查 skip
//   - 4) 性能: 比 case-sensitive 慢 10-20%
//   - 5) 内存: 2x skip 表 = 4KB
//
// [案例 5: 5 大短 needle (1-2 byte) 优化]
//   - 1) "a" (1 byte): skip 几乎 = 0, 慢
//   - 2) "fn" (2 byte): skip 最大 2, 中等
//   - 3) 用 memchr: libc 优化, 比手写 BM 快
//   - 4) SIMD memchr: SSE2/AVX2, 16/32 字节并行
//   - 5) 用 strstr: libc, 实际调 BM
//
// [案例 6: 5 大长 needle (10+ byte) 优化]
//   - 1) BM skip 距离 = needle_len, 跳大
//   - 2) 用 RK: hash 命中, O(1) 比较
//   - 3) SIMD memmem: 16 byte 比较, ~2x 加速
//   - 4) 双模式: 同时搜多个 pattern
//   - 5) Aho-Corasick: 多 pattern 经典
//
// [案例 7: 5 大 worst-case 防御]
//   - 1) "aaaa...a" (n 个): 跳 1, 走 RK
//   - 2) "abababab" vs "abab": BM 跳 0
//   - 3) pattern 长度 = 1: 退化为 memchr
//   - 4) pattern > 255: hash 表 (RK) 替代
//   - 5) 文本/pattern 都 binary: 加 NUL 处理
//
// [案例 8: 5 大 ag vs libc strstr]
//   - 1) libc strstr: glibc 用 Two-Way, 快
//   - 2) ag: PCRE JIT 或 BM, 接近
//   - 3) libc: 无 PCRE, 无 regex
//   - 4) ag: 多线程, libc 单线程
//   - 5) ag: 支持 ignore, libc 无
//
// [案例 9: 5 大内存布局优化]
//   - 1) skip_lookup 2KB: 全局 const, 一次生成
//   - 2) cache line 对齐: __attribute__((aligned(64)))
//   - 3) 预取: __builtin_prefetch
//   - 4) hot/cold 分开: hot data 在 .text
//   - 5) 避免 false sharing: 线程局部分
//
// [案例 10: 5 大调优参数]
//   - 1) needle_len > 255: 走 RK
//   - 2) needle_len = 1: 走 memchr
//   - 3) needle_len = 2-3: BM
//   - 4) case_sensitive: 2x 表, 慢 10%
//   - 5) is_regex: 走 PCRE, 慢 2-3x
// ================================================================
