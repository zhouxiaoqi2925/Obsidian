// 来源: Redis src/networking.c
// 作用: 从客户端 fd 读数据 + 拼包 + 解析 + 入队命令
// 调用链: epoll 唤醒 → readQueryFromClient → processInputBuffer → processCommand
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么是 EAGAIN 即停
//   - 非阻塞 fd: read() 返回 EAGAIN/WSAEWOULDBLOCK = 数据未到
//   - 不应阻塞等: Redis 单线程, 阻塞就饿死其他 client
//   - 触发条件: tcp 缓冲区空了, 下次 epoll 唤醒时再读
//
// [WHY-2] querybuf 动态扩张
//   - 初始大小: PROTO_IOBUF_LEN = 16KB
//   - 不够: 翻倍扩 (sdsMakeRoomFor)
//   - 解析完: 不立即清空, 可能 pipelined 多个命令
//
// [WHY-3] 为什么是 inline + multi-bulk 双协议
//   - inline: "PING\r\n" → 简单 telnet
//   - multi-bulk: "*2\r\n$3\r\nGET\r\n$3\r\nfoo\r\n" → 二进制安全
//   - redis-cli 默认 multi-bulk, telnet 是 inline
//   - inline 简单但有 \0 风险, multi-bulk 是绝对主流
//
// [WHY-4] 拼包与解析
//   - 网络: read() 不保证 1 次拿到完整请求
//   - 解析: sdsrange + 切行, 直到 querybuf 完整
//   - 解析完整命令才入队 processCommand
//   - 半包: 等下次 read 补齐
//
// [WHY-5] 为什么 read 后立即处理 (而不是下次 loop)
//   - epoll 唤醒说明有数据
//   - 不缓存 = 减少内存 + 减少延迟
//   - pipeline 客户端一次发多命令: 循环解析 + 立即执行
// ================================================================

void readQueryFromClient(connection *conn) {
    client *c = connGetPrivateData(conn);
    int nread, readlen;

    // === 限制大小: 防 OOM ===
    // 单 client querybuf 上限 1GB, 超过强制断开
    if (c->querybuf_peak > server.max_querybuf_len) {
        sdsfree(c->querybuf);
        c->querybuf = sdsempty();
        c->querybuf_peak = 0;
        return;  // 主动断开
    }

    readlen = PROTO_IOBUF_LEN;  // 16KB
    // 如果上次扩容 querybuf 已用, 优先填满 querybuf
    if (c->querybuf_len + readlen > sdsalloc(c->querybuf)) {
        // 扩容 (SDS 模式, 翻倍)
        c->querybuf = sdsMakeRoomFor(c->querybuf, readlen);
    }

    // === [WHY-1] 非阻塞 read ===
    nread = connRead(conn, c->querybuf + c->querybuf_len, readlen);
    if (nread == -1) {
        // [WHY-1] EAGAIN: 等下次 epoll 唤醒
        if (errno == EAGAIN || errno == EWOULDBLOCK) return;

        // 真错误: 客户端断开
        freeClientAsync(c);
        return;
    }
    if (c->flags & CLIENT_MASTER) {
        // 主从复制连接, 单独处理 (从 client 角度看是 master 发来同步数据)
        ...
    }

    sdsIncrLen(c->querybuf, nread);
    c->querybuf_peak = max(c->querybuf_peak, sdslen(c->querybuf));
    c->last_interaction = server.unixtime;

    // === [WHY-3] [WHY-4] 解析 querybuf, 抽命令 ===
    if (c->reqtype == PROTO_REQ_INLINE) {
        // inline: 按 \r\n 切行
        if (processInlineBuffer(c) != C_OK) break;
    } else {
        // multi-bulk: 按 RESP 协议
        if (processMultibulkBuffer(c) != C_OK) break;
    }

    // 解析完: 多个完整命令在 c->argv 数组
    // 注意: processCommand 是在 querybuf 抽到完整命令时调用
    if (c->argv_len == 0) {
        // 还在等更多数据, break 等待
        return;
    }

    // === [WHY-5] 立即处理 (pipeline) ===
    //   - 多个命令, 一次处理完
    //   - 单线程: 按顺序执行, 不会交错
    //   - 全部执行完, 才返回
    processCommand(c);
}

// === Multi-bulk 解析: 1 抽 1 个命令 ===
int processMultibulkBuffer(client *c) {
    char *newline = NULL;
    long pos = 0;
    int ok;
    long long argc;
    char *qbuf = c->querybuf;
    size_t qblen = sdslen(qbuf);

    while (1) {
        // 1. 找首行 "*N" (参数个数)
        if (c->multibulklen == 0) {
            newline = strchr(qbuf + pos, '\r');
            if (newline == NULL) return C_OK;  // 半包
            // 校验格式: *<digits>\r\n
            ...
            c->multibulklen = atoi(qbuf + pos + 1);  // 解析 N
            pos = newline - qbuf + 2;  // 跳过 \r\n
        }

        // 2. 读 N 个 "$<len>\r\n<data>\r\n" 块
        while (c->multibulklen) {
            if (c->bulklen == -1) {
                // 读 "$<len>" 长度
                newline = strchr(qbuf + pos, '\r');
                if (newline == NULL) return C_OK;
                ...
                c->bulklen = atoi(qbuf + pos + 1);
                pos = newline - qbuf + 2;
            }
            // 读 <len> 字节数据 + \r\n
            if (sdslen(qbuf) - pos < (size_t)(c->bulklen + 2)) {
                return C_OK;  // 半包
            }
            // 完整了: 加到 argv
            c->argv[c->argc++] = createStringObject(qbuf + pos, c->bulklen);
            pos += c->bulklen + 2;
            c->bulklen = -1;
            c->multibulklen--;
        }

        // 3. 完整命令就绪
        ok = processCommand(c);
        if (!ok) return C_ERR;

        // 清空 argv 准备下一轮
        c->argc = 0;
        c->argv_len_sum = 0;

        // 4. 修剪 querybuf (已处理部分)
        if (pos > 0) {
            sdsrange(c->querybuf, pos, -1);
            pos = 0;
        }
    }
}

// ================================================================
// 性能数据 (1 客户端 pipeline 100 个 SET 1KB):
//
// [网络读取]
//   - 100 命令 × 20 字节请求 + 1KB 响应 = 100KB
//   - 1 次 read 可能拿 4-16KB (受 TCP 窗口限制)
//   - 100KB 要 6-25 次 read 系统调用
//
// [协议解析]
//   - 100 命令: 100 次 processCommand 调用
//   - 解析开销: < 0.1ms (1000w 命令/s 解析速度)
//
// [执行延迟]
//   - pipeline 总延迟: 100 命令 × 0.1ms = 10ms
//   - vs 非 pipeline (RTT 0.5ms × 100 = 50ms): 5x 加速
//
// 关键点:
// ================================================================
// 深度拓展: RESP3 协议 + IO 多线程 + 慢客户端防御
//
// [RESP vs RESP3 协议对比 (Redis 6.0+)]
//   - RESP (1): 5 种类型 (* $ + - :), 二进制不安全 (binary 用 $ 长度前缀)
//   - RESP3: 12 种类型, 支持 Map, Set, Double, Boolean, 错误类型
//   - 默认 RESP, 客户端 HELLO 3 切 RESP3
//   - redis-cli 默认 RESP
//
// [为什么 readQueryFromClient 用 EAGAIN 即停]
//   - 非阻塞 fd: read 立即返回
//   - 0 字节: 客户端正常关闭 (FIN)
//   - -1 + EAGAIN: 数据未到, 等下次 epoll 唤醒
//   - -1 + ECONNRESET: 客户端异常断开
//   - 单线程: 不允许阻塞 read, 否则其他 client 饿死
//
// [pipeline 的本质]
//   - 1 个 RTT, 多个命令: 客户端发 100 命令, 1 次 write
//   - 服务端: 1 次 readQueryFromClient 拿 100KB querybuf
//   - 解析: 100 次 processCommand
//   - 响应: 1 个 writeReplyToClient 写 100KB
//   - 收益: 100 个命令 / 1 个 RTT = 100x 加速
//
// [为什么限制 querybuf_peak = 1GB]
//   - 防御: 恶意客户端发巨型 query, 撑爆内存
//   - max_querybuf_len 默认 1GB
//   - 触发: free client, 关闭连接
//   - 实战: 监控 client_biggest_input_buf
//
// [主从复制的 readQueryFromClient 特殊路径]
//   - c->flags & CLIENT_MASTER: 是从节点收到 master 数据
//   - 不是真命令, 是 RDB / 命令流
//   - 单独处理: readSyncBulkPayload (RDB) / 命令缓冲
//   - 这就是为什么一个 client 既能"收命令"又能"收同步"
//
// [半包 + 拼包的设计]
//   - 半包: querybuf 不够 1 个完整命令, 等下次
//   - 拼包: querybuf 多个完整命令, 循环处理
//   - 临界: pos 指针 + multibulklen 计数
//   - 解析完: sdsrange 修剪 (避免 querybuf 无限增长)
//
// [实战: redis-cli 的内部优化]
//   - 输出模式: --no-raw (普通) / --raw (原始) / --csv (CSV)
//   - 大 key 风险: redis-cli --bigkeys (用 SCAN 扫)
//   - 慢命令: redis-cli --latency-history (持续采样)
//
// [跟 netty / muduo 的对比]
//   - netty: Java NIO 框架, 1 个 boss + N worker
//   - muduo: C++ Reactor 模式, 跟 Redis 类似
//   - Redis: 单线程 + epoll, 代码极简
//   - 选择: 业务简单用 Redis 模型, 高吞吐用 netty 模型
//
// [监控关键指标]
//   - instantaneous_input_kbps / instantaneous_output_kbps  // 实时流量
//   - total_connections_received  // 总连接数
//   - rejected_connections  // 拒绝的连接 (maxclients)
//   - client_longest_output_list  // 输出队列最长 client
//
// ================================================================
//   - readlen 默认 16KB, 大请求会多轮 read
//   - querybuf 不限大小? 否, max_querybuf_len 兜底 (默认 1GB)
//   - inline 模式仅 telnet 兼容, 实际都是 multi-bulk
// ================================================================
