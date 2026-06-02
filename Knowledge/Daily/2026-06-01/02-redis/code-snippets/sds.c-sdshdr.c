// 来源: Redis src/sds.c + sds.h
// 作用: Simple Dynamic String — Redis 自定义字符串类型
// 调用链: createStringObject → sdsnewlen → sdsalloc
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么不用 C 字符串
//   - C 字符串: 长度 O(n) (strlen 一次), 不能含 \0
//   - SDS: 长度 O(1) (sdslen 一条指令), 二进制安全 (\0 当数据)
//   - 网络协议需要含 \0 的 binary 数据, C 字符串无法处理
//
// [WHY-2] 5 种 header 选型 (sdshdr5/8/16/32/64)
//   - 不同长度用不同 header, 节省内存
//   - sdshdr5: 1 字节 flags + 1 字节 len (最大 31 字节, 无 alloc)
//   - sdshdr8: 1B flags + 1B alloc + 1B len + 1B pad (最大 255B)
//   - sdshdr16/32/64: 类似, 字段宽度不同
//   - 节省: 一个 1MB 字符串, 比 naive struct 节省 8-12 字节
//
// [WHY-3] 预分配 (alloc) + 惰性释放
//   - append 翻倍: alloc >= len + addlen → alloc *= 2
//   - 短串预分配: alloc = len + addlen (避免大 alloc 浪费)
//   - trim 时, 不真释放 alloc, 只改 len → 后续 append 不用再 malloc
//
// [WHY-4] 为什么是"前向指针 + 头部"
//   - SDS 头在低地址, 字符串在头部之后
//   - 用户拿到 buf 指针, 仍能直接当 C 字符串用
//   - sdslen(s) = *(uint8_t*)(s - 1) (O(1) 取长度)
//
// [WHY-5] flags 字段
//   - 低 3 位: 类型 (sdshdr5/8/16/32/64)
//   - 1: 用 sdshdr5, 字段为 flags/len 合并
//   - 2/3/4/5: 用 sdshdr8/16/32/64, 字段为 type/alloc/len
// ================================================================

// === SDS 头部结构 (以 sdshdr8 为例) ===
struct __attribute__((__packed__)) sdshdr8 {
    uint8_t len;       // 实际字符串长度
    uint8_t alloc;     // 已分配 buf 长度 (>= len)
    unsigned char flags; // 低 3 位 = 类型, 高 5 位未用
    char buf[];        // 柔性数组: 实际字符串内容
};

// === 创建 SDS: 关键路径 ===
sds sdsnewlen(const void *init, size_t initlen) {
    void *sh;  // sds header 指针
    sds s;     // sds 字符串指针 (= sh + header_size)

    // 1. 选 sds 类型
    char type = sdsReqType(initlen);

    // 2. 分配: header + initlen + 1 (\0 终止符)
    //    +1 是为了 buf[strlen(buf)] = \0, 兼容 C 字符串函数
    sh = s_malloc_usable(sizeof(struct sdshdr##type) + initlen + 1, &usable);
    if (sh == NULL) return NULL;

    // 3. 初始化 header
    s = (char*)sh + sdsHdrSize(type);  // [WHY-4] 指针后移
    s[-1] = type;  // flags 在 s[-1] 位置
    sdsSetLen(s, initlen);
    sdsSetAlloc(s, usable - sdsHdrSize(type) - 1);  // 实际可用 alloc

    // 4. 拷贝初始数据
    if (init && initlen)
        memcpy(s, init, initlen);
    s[initlen] = '\0';  // [WHY-1] C 字符串兼容

    return s;
}

// === 扩容 (append) ===
sds sdsMakeRoomFor(sds s, size_t addlen) {
    void *sh;
    size_t len = sdslen(s);
    size_t cur = sdsalloc(s);
    size_t newlen;

    // 已够: 直接返回
    if (len + addlen <= cur) return s;

    // [WHY-3] 预分配策略
    newlen = len + addlen;
    if (newlen < SDS_MAX_PREALLOC)  // 默认 1024*1024 = 1MB
        newlen *= 2;
    else
        newlen += SDS_MAX_PREALLOC;

    // 重新分配 (可能换类型: sdshdr8 → sdshdr16)
    sh = s_realloc_usable(sdsAllocPtr(s), newlen + sdsHdrSize(sdsType(s)) + 1, &usable);
    if (sh == NULL) return NULL;

    s = sh + sdsHdrSize(sdsType(s));
    sdsSetAlloc(s, usable - sdsHdrSize(sdsType(s)) - 1);
    return s;
}

// === 取长度 (O(1)) ===
// 为什么能 O(1): header 在 buf 之前, sdslen(s) 直接读 s[-1] 处的 flags + 跳到对应字段
static inline size_t sdslen(const sds s) {
    // 通过 flags 选 header 类型
    unsigned char flags = s[-1];
    switch(flags & SDS_TYPE_MASK) {
        case SDS_TYPE_5: return SDS_TYPE_5_LEN(flags);
        case SDS_TYPE_8: return ((struct sdshdr8*)((s) - sizeof(struct sdshdr8)))->len;
        // ... 其他类型类似
    }
    return 0;
}

// ================================================================
// 性能数据:
//
// [内存节省]
//   - 1KB 字符串: sdshdr8 4 字节 header (1B 类型即可, len<32 用 hdr5)
//   - 100MB 字符串: sdshdr64 24 字节 header
//   - vs naive struct: 节省 8-16 字节 / 字符串
//   - 100w 字符串: 节省 8-16MB
//
// [append 性能]
//   - < alloc: 直接 memcpy, 无 malloc
//   - 翻倍扩: 1 次 realloc, O(n) 拷贝
//   - 短串: 几乎零开销 (alloc = len + addlen, 1 次分配)
//
// ================================================================
// 深度拓展: SDS 演进历史 + 内存对齐 + 跨语言对比
//
// [SDS 5 种类型的内存对齐 (packed struct)]
//   - sdshdr5: len(5 bits) + flags(3 bits) = 1 byte
//   - sdshdr8: len(1) + alloc(1) + flags(1) + 1 byte padding = 4 bytes
//   - sdshdr16: len(2) + alloc(2) + flags(1) + 1 byte padding = 6 bytes
//   - sdshdr32: len(4) + alloc(4) + flags(1) + 3 bytes padding = 12 bytes
//   - sdshdr64: len(8) + alloc(8) + flags(1) + 7 bytes padding = 24 bytes
//   - 关键: __attribute__((packed)) 紧凑布局, 零 padding
//
// [类型升级的临界点]
//   - sdshdr5: 0-31 字节
//   - sdshdr8: 32-255 字节
//   - sdshdr16: 256-65535 字节 (64KB)
//   - sdshdr32: 64KB - 4GB
//   - sdshdr64: 4GB - 16EB
//   - 升档: append 时 sdsMakeRoomFor 检测, 重新 malloc
//
// [为什么 SDS 是"前向指针"]
//   - 用户拿到 buf 指针, 不需要 header 信息
//   - sdslen(s) = s[-1] 处的 flags + 跳字段
//   - 兼容 C 字符串函数 (strcmp, strcpy 直接用)
//   - 缺点: header 损坏 sdslen 误读 (但 sdstrim 等 API 校验)
//
// [预分配策略: < 1MB 翻倍, >= 1MB 加 1MB]
//   - 短串: 翻倍扩容, 减少 realloc 次数
//   - 长串: 每次 +1MB, 避免翻倍浪费
//   - SDS_MAX_PREALLOC = 1024 * 1024 = 1MB
//   - 实战: 大 value 多次 append, 1MB 步进合理
//
// [为什么 trim 不真释放 alloc]
//   - "惰性释放": alloc 留着用, 下次 append 不 malloc
//   - sdsRemoveFreeSpace(s): 真释放 (缩到 len)
//   - 实战: 大量 trim 场景, 内存虚高, 调 sdsRemoveFreeSpace
//
// [SDS vs std::string vs Go string]
//   - std::string: C++ 标准, SSO (短串优化), 含 SSO buf
//   - Go string: 不可变, len + ptr 两字段 (8+8 字节)
//   - Java String: char[] + offset + count + hash
//   - Redis SDS: 5 种 header, 按需选, 内存最优
//
// [SDS 用在哪]
//   - 几乎所有 Redis 字符串: keys, values, AOF buf, querybuf, 错误信息
//   - 1 个 key = 1 个 SDS (key) + 1 个 SDS (value, hash 结构)
//   - 100w keys ≈ 200w SDS, header 开销 5-10MB
//
// [坑: sds 与 robj 转换]
//   - robj (Redis Object) 包装 SDS, 用于通用对象
//   - createStringObject: SDS → robj (encoding + ptr)
//   - getDecodedObject: robj → SDS (用于返回)
//   - 实战: 写 C 扩展, 注意 refcount
//
// [监控: SDS 内存占比]
//   - INFO memory: used_memory = sum(SDS, dict, robj, ...)
//   - 用 redis-rdb-tools 离线分析 rdb 看 SDS 分布
//   - 实战: 大 key 多数是 SDS 过大
//
// ================================================================
// 坑:
//   - sdsfree(s) 只释放 buf, header 顺带释放
//   - 长度字段溢出: 字符串 > 4GB 用 sdshdr64, 否则 type 升档
//   - 不释放 alloc (trim 后), 长生命周期字符串内存会偏高
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 类 SDS 类型详解]
//   - sdshdr5: < 32 字节, len 和 alloc 在 flags (1B)
//   - sdshdr8: < 256 字节, 1B len/alloc
//   - sdshdr16: < 64KB, 2B len/alloc
//   - sdshdr32: < 4GB, 4B len/alloc
//   - sdshdr64: < 16EB, 8B len/alloc
//   - 自动升级: 字符串增长超过当前 header 上限, 整体迁移
//   - 内存对齐: packed struct 减少 header 占内存
//
// [案例 2: 类型升级的临界值]
//   - 32B → 升 sdshdr16: 节省 1B header
//   - 256B → 升 sdshdr32: 节省 2B
//   - 4GB → 升 sdshdr64: 节省 4B
//   - 实际: 99% 字符串 < 256B, sdshdr8 最常用
//
// [案例 3: 前向指针设计 (sdsMakeRoomFor)]
//   - 扩 2x: 新 alloc = max(len + addlen) * 2
//   - 拷贝: memmove (不 memmove 因有 overlap 风险)
//   - 关键: header 不动, 只改 buf 指针
//   - 兼容: 任何 SDS 函数都用 sds指针 (buf 起始)
//
// [案例 4: 分配策略: < 1MB 翻倍, >= 1MB +1MB]
//   - 经验值: 字符串多在 1KB-100KB, 翻倍够用
//   - 大字符串: 翻倍浪费内存, 改为 +1MB
//   - 源码: sdsMakeRoomFor
//
// [案例 5: 为什么 trim 不释放 alloc]
//   - sdsRemoveFreeSpace 真正缩 alloc
//   - sdsTrim 只是 len = alloc, 留着空间
//   - 原因: 频繁 trim/append 抖动
//   - 实战: 大 key trim 后内存高, 手动调 sdsRemoveFreeSpace
//
// [案例 6: 对比 std::string / Go string / Java String]
//   - C++ std::string: SSO (小字符串优化), 24B 栈内
//   - Go string: 16B 只读结构 (ptr+len), 不可变
//   - Java String: char[] + 编码标记, 不可变
//   - Redis SDS: 可变 + header + alloc, 函数式 API
//   - 优势: SDS 可原地改, C string 改要 realloc
//
// [案例 7: 哪些地方用 SDS]
//   - 所有 String 类型 value
//   - Hash/List/Set/ZSet 的成员
//   - AOF/RDB 序列化
//   - 慢查询日志 (slowlog)
//   - 客户端命令缓冲 (querybuf)
//
// [案例 8: robj (Redis Object) 包装 SDS 的坑]
//   - robj.ptr 指向 SDS, robj.type = OBJ_STRING
//   - 共享对象: robj 0/1/Redis 常用值共享, SDS 在 refcount > 1 时只读
//   - 修改共享对象: incrRefCount 后再改
//   - embstr vs raw: < 44B 走 embstr (SDS+robj 1 次分配)
//
// [案例 9: SDS 性能监控实战]
//   - 监控: INFO memory used_memory_rss / used_memory
//   - 比值: rss/used = 1.0 紧凑, > 1.5 碎片多
//   - 大 key 排查: redis-cli --bigkeys
//   - 内存碎片: activedefrag yes (4.0+)
//
// [案例 10: SDS API 实战]
//   ```c
//   sds s = sdsnew("hello");        // 创建
//   s = sdscat(s, " world");        // 追加
//   s = sdsMakeRoomFor(s, 1000);   // 预分配
//   sdsfree(s);                     // 释放
//   size_t len = sdslen(s);         // 长度
//   size_t alloc = sdsalloc(s);     // 分配空间
//   s = sdsRemoveFreeSpace(s);      // 缩 alloc
//   ```
// ================================================================
