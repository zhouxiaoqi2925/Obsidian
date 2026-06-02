// 来源: Redis src/server.c
// 作用: 单点命令入口 — 鉴权/慢查询/ACL/OOM/主从 都在这一层挂
// 调用链: readQueryFromClient → processInputBuffer → processCommand → call()
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么 processCommand 是"横切"层
//   - 单线程, 没有中间件, 所有策略必须内嵌到主流程
//   - 鉴权 (authRequired) / 慢查询 (slowlog) / ACL (user) / OOM (maxmemory)
//   - 主从复制 (replication) / 集群路由 (cluster) / 持久化 (rdb/aof)
//   - 一处改动, 全局生效, 避免遗漏
//
// [WHY-2] 为什么先看 OOM 再看权限
//   - OOM 状态: 拒绝所有写命令 (新数据)
//   - 权限: 即使有权限, OOM 也不能写
//   - 顺序: OOM → auth → ACL → 业务 (commandCheck, 业务侧 if (写))
//   - 拒绝要清晰: err = "OOM command not allowed when used memory > 'maxmemory'"
//
// [WHY-3] 命令表查找 lookupCommand
//   - 全局 commands 数组, 按 sds key 排序 + 二分
//   - O(log N) (N=200+ 命令)
//   - 调用 call() 前先找 command 结构 (含 proc 函数指针)
//
// [WHY-4] 慢查询统计
//   - 开始时间: ustime()
//   - 结束时间: ustime() - start
//   - > slowlog_log_slower_than (默认 10000us = 10ms): 入 slowlog
//   - slowlog 容量: slowlog_max_len (默认 128)
//
// [WHY-5] 主从模式: write 命令要被复制
//   - 命中 replicationFeedSlaves → 写 aof buffer + 喂从节点
//   - read 命令: 从节点可读, 主节点可读, 但不复制
//   - 这是 Redis 异步复制的关键路径
// ================================================================

int processCommand(client *c) {
    // === [WHY-1] 1. OOM 检查 ===
    // maxmemory 触顶 + 写命令: 拒绝
    if (server.maxmemory && !server.lua_timers_dict &&
        (c->cmd->flags & CMD_DENY_OOM) &&
        server.stat_peak_memory > server.maxmemory) {
        rejectCommand(c, "OOM command not allowed when used memory > 'maxmemory'.");
        return C_OK;
    }

    // === 2. 主从角色: 拒绝某些命令 ===
    if (server.masterhost != NULL && c->cmd->flags & CMD_STALE) {
        // 从节点收到 stale 数据时拒绝
        ...
    }

    // === 3. 鉴权 ===
    if (server.requirepass && !c->authenticated &&
        !(c->cmd->flags & CMD_NO_AUTH)) {
        rejectCommand(c, "NOAUTH Authentication required.");
        return C_OK;
    }

    // === 4. ACL 检查 ===
    int acl_errpos;
    int acl_retval = ACLCheckCommandPerm(c->user, c->cmd, c->argv, c->argc, &acl_errpos);
    if (acl_retval != ACL_OK) {
        rejectCommand(c, acl_errpos >= 0 ?
            sdscatfmt(sdsempty(), "NOPERM this user has no permissions to run the '%s' command",
                     c->cmd->name) :
            "NOPERM no permissions to run any command");
        return C_OK;
    }

    // === [WHY-3] 5. 找命令结构 ===
    c->cmd = c->lastcmd = lookupCommand(c->argv[0]->ptr);
    if (!c->cmd) {
        rejectCommand(c, "unknown command");
        return C_OK;
    }

    // === 6. 命令特定检查 (参数个数、类型) ===
    if ((c->cmd->arity > 0 && c->cmd->arity != c->argc) ||
        (c->cmd->arity < 0 && c->cmd->arity != -c->argc)) {
        rejectCommand(c, "wrong number of arguments");
        return C_OK;
    }

    // === 7. 集群路由 (slot 计算 + ASK/MOVED 跳转) ===
    if (server.cluster_enabled) {
        if (clusterRedirectSupportedClient(c) && ... ) {
            clusterRedirectClient(c, ...);
            return C_OK;
        }
    }

    // === 8. 主从模式: 写命令要复制 ===
    if (c->flags & CLIENT_MASTER && !(c->flags & CLIENT_DENY_BLOCKING)) {
        replicationFeedSlaves(...);
    }

    // === [WHY-4] 9. 慢查询统计 ===
    long long start = ustime();
    // call() 是真正执行命令
    int retval = call(c, CMD_CALL_FULL);
    long long duration = ustime() - start;

    if (duration > server.slowlog_log_slower_than) {
        slowlogPushEntryIfNeeded(c, c->argv, c->argc, duration);
    }

    // === 10. AOF 缓冲累积 (后台 fsync) ===
    if (server.aof_state == AOF_ON) {
        feedAppendOnlyFile(c->cmd, c->argv, c->argc);
    }

    return retval;
}

// === call() 简化版: 真正执行 ===
void call(client *c, int flags) {
    c->flags |= CLIENT_EXECUTING_COMMAND;
    monotonicStarted();

    // 一些 prepare: 更新 lastcmd, 跟踪
    dirty = server.dirty;  // 用于之后看是否改了数据 (复制用)
    start = server.stat_starttime;
    prev_err_replies = server.stat_num_error_replies;

    // === 真正执行命令 ===
    c->cmd->proc(c);  // 函数指针 dispatch (SET, GET, ZADD, ...)

    // === 统计 + 监控 ===
    duration = monotonicStopped();
    dur = elapsedUs(start);
    server.stat_numcommands++;
    updateStatsForCommand(c, prev_err_replies, duration);

    // === 复制检查: dirty 变了 → 有写, 要复制 ===
    if (server.dirty != dirty) {
        if (server.masterhost != NULL) replicationFeedSlavesFromMasterStream(...);
    }

    c->flags &= ~(CLIENT_EXECUTING_COMMAND);
}

// ================================================================
// 性能数据 (4 核 CPU, 1w QPS SET 1KB):
//
// [单条命令延迟]
//   - 路由/鉴权/ACL: < 0.05ms
//   - 慢查询统计: < 0.01ms
//   - 命令执行 (dictSetKey): 0.1-0.2ms
//   - 总计: 0.2-0.3ms / 命令
//
// [拒绝的 5 大原因]
//   - OOM (maxmemory 触顶 + 写)
//   - NOAUTH (requirepass 设了但未 auth)
//   - NOPERM (ACL 拒绝)
//   - unknown command (拼写错)
//   - wrong number of arguments (参数个数错)
//
// 关键点:
// ================================================================
// 深度拓展: ACL 详解 + 复制流程 + 实战拒绝原因排查
//
// [processCommand 完整检查链 (10 步)]
//   - 1. OOM (maxmemory 触顶)
//   - 2. master stale (从节点收到过期数据)
//   - 3. requirepass (auth)
//   - 4. ACLCheckCommandPerm (user 权限)
//   - 5. lookupCommand (找命令结构)
//   - 6. 参数个数 (arity)
//   - 7. 集群路由 (slot)
//   - 8. 写命令复制 (replicationFeedSlaves)
//   - 9. 慢查询 (slowlog)
//   - 10. AOF 缓冲 (feedAppendOnlyFile)
//
// [为什么 OOM 检查在最前]
//   - 业务角度: 内存满再写就崩
//   - 资源保护: 防止业务填满内存
//   - 性能: OOM 检查 O(1), 早返, 不浪费后续步骤
//
// [主从模式 stale 检查的细节]
//   - 从节点 replay 不全, 数据可能旧
//   - 收到 CMD_STALE 命令: 拒绝
//   - 实战: 不要从从节点读关键数据
//   - Redis 7.0: 引入优先读 master 路由
//
// [ACL 6.x+ 取代老 requirepass]
//   - 老: 1 个全局密码, 太粗
//   - ACL: 多用户, 每用户可单独配:
//     on / off (启用)
//     +@all -@dangerous (命令类别)
//     ~key:* &* (key pattern + channel pattern)
//     >password (密码)
//   - 默认 user: default (无密码, 全权限, 仅 localhost)
//
// [集群路由: slot 计算 + MOVED/ASK]
//   - CRC16(key) mod 16384 = slot
//   - 本节点: 处理
//   - 别的节点: 返回 MOVED {slot, ip:port}
//   - ASK: 在迁移中, 客户端先去源节点再问目标节点
//   - 客户端 (redis-cli, jedis) 自动重试
//
// [复制路径: replicationFeedSlaves]
//   - 主节点: 写命令后, 序列化到 repl_backlog + 喂从节点
//   - 从节点: 收 command stream, replay
//   - 异步: 主不等待从 ack
//   - 风险: 主挂了, 从数据可能不全
//
// [call() 的 dirty 跟踪]
//   - 备份: dirty = server.dirty
//   - 执行: c->cmd->proc(c)
//   - 之后: server.dirty != dirty → 改了数据
//   - 改了: 复制 + AOF
//   - 没改: GET 等读命令, 不复制
//
// [慢查询统计的临界点]
//   - slowlog_log_slower_than: 默认 10000us (10ms)
//   - 太小: 太多 slow log, 噪声
//   - 太大: 漏掉真问题
//   - 推荐: 设 5ms, 关注 P99
//   - 监控: SLOWLOG GET 100 看最近慢命令
//
// [实战: 高频 reject 原因排查]
//   - 1. 配 ACL allow-list, 限命令
//   - 2. 配 maxmemory-policy, 自动淘汰
//   - 3. 用 CLIENT KILL 杀长连接
//   - 4. 监控 acl_deny_commands_total
//
// [对比: SQL 数据库的 processCommand 等价物]
//   - PostgreSQL: ProcessUtility + executor
//   - MySQL: handle_one_connection → dispatch_cmd
//   - 设计模式: "横切层" 是 SQL/NoSQL 通用模式
//   - Redis 的特殊性: 单线程, 所有"中间件"必须内嵌
//
// ================================================================
//   - rejectCommand 不计入慢查询 (不浪费时间在 reject)
//   - ACL 检查是 O(args) (遍历 user 的命令权限)
//   - 集群模式: 1 个 slot 计算 = CRC16(key) mod 16384 ≈ 50ns
// ================================================================
