# tidb

> TiDB 是 MySQL 兼容的分布式 HTAP 数据库：Placement Driver（PD 调度）+ TiKV（KV 存储）+ TiDB（SQL 层）三层分离 + Raft 副本组 + MVCC。本篇把 38k+ star 的分布式数据库设计哲学拆成 20 个 Pattern，涵盖 4 大主题：核心机制、架构设计、性能优化、工程实践。

## 核心机制

### 模式 1：PD / TiKV / TiDB 三层分离架构

**问题场景**：传统数据库把存储、计算、调度耦合在单进程。扩展时只能 scale-up（升级硬件），无法 scale-out（加机器）。云原生时代需要按层独立扩缩容。

**解决方案**：

```
┌─────────────────────────────────────┐
│ TiDB Server (SQL 层)               │  无状态，可任意水平扩展
│ - 解析 SQL                         │
│ - 优化器（成本估算 + 计划生成）     │
│ - 执行器（点查 / 批处理）           │
└──────────────┬──────────────────────┘
               │ gRPC
┌──────────────▼──────────────────────┐
│ Placement Driver (PD 调度层)        │  全局调度 + TSO 时间戳
│ - Region 调度                      │
│ - 负载均衡                          │
│ - 全局单调递增时间戳                │
└──────────────┬──────────────────────┘
               │ gRPC
┌──────────────▼──────────────────────┐
│ TiKV (分布式 KV 存储)              │  有状态，Raft 副本组
│ - RocksDB (LSM 树)                 │
│ - MVCC                              │
│ - Raft 共识                         │
└─────────────────────────────────────┘
```

**关键参数**：

| 组件 | 状态 | 副本数 | 扩展性 |
|------|------|--------|--------|
| TiDB Server | 无状态 | N | 水平扩展（加机器） |
| PD | 有状态（单 leader + 2 follower） | 3 | 垂直 + 水平 |
| TiKV | 有状态（Region 分片） | 3 副本 | 水平扩展（加节点） |

**最佳实践**：

- ✅ 计算/存储/调度三层分离——可独立扩缩容
- ✅ SQL 层无状态——可任意重启、滚动升级
- ✅ 调度层独立——Region 调度与 SQL 执行解耦
- ✅ 存储层有状态——用 Raft 保证副本一致性
- ❌ 避免把 TSO 时间戳塞进 TiDB——会破坏全局单调性

### 模式 2：MySQL 协议兼容降低迁移门槛

**问题场景**：MySQL 是 OLTP 之王，存量应用数量巨大。TiDB 要进入市场，必须让"MySQL 客户端 + 驱动 + ORM"全部无缝对接，自己造协议等于自绝于生态。

**解决方案**：

```go
// tidb 启动 MySQL 监听
listener, _ := net.Listen("tcp", ":4000")
for {
    conn, _ := listener.Accept()
    go session.newConn(conn).Run()  // MySQL handshake
}

// 协议解析
handshakeV10 := []byte{
    0x0a,                  // protocol version
    '5', '7', '.', '2', 0, // server version
    ...
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 默认端口 | 4000 |
| 协议版本 | MySQL 5.7 / 8.0 |
| 认证 | mysql_native_password / caching_sha2_password |
| 字符集 | utf8mb4 / latin1 / binary |

**最佳实践**：

- ✅ 协议级兼容——MySQL CLI / JDBC / MyBatis / GORM 全部直连
- ✅ 慢查询日志、EXPLAIN、SHOW PROCESSLIST 全部对齐 MySQL
- ✅ 用 `pt-online-schema-change` / `gh-ost` 测 DDL 兼容性
- ✅ 维护"MySQL 不兼容清单"——主动告知用户差异
- ❌ 避免在协议层"加强"——破坏兼容性

### 模式 3：全局单调递增 TSO（Timestamp Oracle）保证事务顺序

**问题场景**：分布式事务需要全局一致的时间戳，用于 MVCC 版本号、事务隔离、乐观锁。单机 `time.Now()` 不可行——多机时钟漂移，事务顺序错乱。

**解决方案**：

```go
// PD 分配 TSO
func (t *tsoOracle) getTimestamp(ctx context.Context, count uint64) (uint64, error) {
    // PD leader 持有逻辑时钟
    // 物理部分：当前毫秒时间戳（47 bit）
    // 逻辑部分：同毫秒内的自增序号（18 bit）
    return t.alloc(timestampOracle.physicalTime(), count)
}

// 客户端用法
ts, _ := pdClient.GetTS(ctx)
txn.SetStartTS(ts)  // 事务开始时间戳
```

**关键参数**：

| 字段 | 位 | 含义 |
|------|----|------|
| physical | 47 bit | 毫秒时间戳（约 2^47 ms = 4.4 亿年） |
| logical | 18 bit | 同毫秒内的自增序号（最大 26 万/毫秒） |

**最佳实践**：

- ✅ TSO 由单点 PD leader 分配——避免分布式协调
- ✅ 物理 + 逻辑双部分——支持高并发（毫秒内 26 万次）
- ✅ 用 64 位整数——便于传输与比较
- ✅ 客户端缓存 TSO 批量——减少 RPC 次数
- ❌ 避免依赖 NTP 校时——物理时钟不要求绝对准确，只要求单调

### 模式 4：MVCC 多版本并发控制

**问题场景**：传统 2PL 锁并发度低，读写互斥。MVCC 让读写不冲突：读历史版本、写新版本，最后合并。SnapShot Isolation 级别下读永远不被写阻塞。

**解决方案**：

```go
// TiKV 中 key 的编码
// key = table_prefix{table_id}_record_prefix{row_id} -> value
// version = start_ts (uint64)

// 写入
txn := store.Begin()
txn.Set([]byte("user:1"), []byte(`{"name":"alice"}`))
txn.Commit(ctx)  // commit_ts = PD.GetTS()

// 读取（指定 snapshot ts）
snapshot := store.GetSnapshot(commit_ts)
val, _ := snapshot.Get(ctx, []byte("user:1"))  // 读 <= commit_ts 的版本
```

**关键参数**：

| 版本字段 | 说明 |
|---------|------|
| start_ts | 事务开始时间戳（唯一 ID） |
| commit_ts | 事务提交时间戳 |
| key | 数据键 |
| value | 数据值 |

**最佳实践**：

- ✅ 写入路径带 start_ts / commit_ts——双时间戳
- ✅ 读 snapshot 不阻塞写——并发度高
- ✅ 旧版本异步 GC——避免无限膨胀
- ✅ 用 `txn.SetStartTS(ts)` 控制事务起始时间——支持历史查询
- ❌ 避免 MVCC 字段混入 value——会让 GC 复杂化

### 模式 5：Raft 副本组实现强一致性

**问题场景**：单机故障会导致数据丢失。多副本需要"过半写入"才返回成功，保证 RPO=0（不丢数据）。Raft 把一致性 + Leader 选举 + 日志复制统一算法。

**解决方案**：

```go
// TiKV 启动 Raft group
raftGroup, _ := raft.NewRawNode(&raft.Config{
    ID:               regionID,           // 1, 2, 3 ...
    ElectionTimeout:  10 * time.Second,    // 选举超时
    HeartbeatTimeout: 1 * time.Second,     // 心跳
    Storage:          raftStorage,
    Applied:          appliedIndex,
    ...,
})
// 提议写入
raftGroup.Propose(ctx, data)
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| ElectionTimeout | 选举超时（10s） |
| HeartbeatTimeout | 心跳间隔（1s） |
| 副本数 | 默认 3 |
| 半写入 | 2/3 成功即提交 |

**最佳实践**：

- ✅ 默认 3 副本——单节点故障不丢数据
- ✅ ElectionTimeout > HeartbeatTimeout × 2——避免误判
- ✅ 用 `raft-rs` 而非自研——协议稳定性高于一切
- ✅ Leader 选举优先级 + PreVote——避免脑裂
- ❌ 避免 5 副本——成本翻倍、收益递减

## 架构设计

### 模式 6：Region 分片 + 范围分片策略

**问题场景**：单机存储有上限。要支持 PB 级数据，必须把数据切分到多台机器。Hash 分片难支持范围扫描；Range 分片天然适配 SQL 索引。

**解决方案**：

```go
// Region 定义
type Region struct {
    ID          uint64
    StartKey    []byte
    EndKey      []byte
    Peers       []*PeerMeta  // 副本列表
    Leader      uint64
    RegionEpoch Epoch
}

// 范围：[a, m), [m, z)
```

**关键参数**：

| 字段 | 默认 | 说明 |
|------|------|------|
| Region 大小 | 96 MB | 切分阈值 |
| Region 数量 | 单集群万级 | 调度粒度 |
| 切分触发 | Region > 96MB | 自动 split |

**最佳实践**：

- ✅ 用 Range 分片而非 Hash——支持范围扫描
- ✅ Region 大小控制在 100MB 内——调度灵活
- ✅ 热 Region 自动拆分——避免热点
- ✅ 用 PD 调度器均衡——避免单 Region 瓶颈
- ❌ 避免 Region 过小（< 10MB）——元数据开销大于数据

### 模式 7：SQL 优化器（Cost-Based Optimizer）

**问题场景**：同一条 SQL 可能有几十种执行计划（如 JOIN 顺序、索引选择），不同计划性能差 1000 倍。需要基于成本的优化器选最优计划。

**解决方案**：

```go
// pkg/planner/core
func (p *PhysicalPlan) optimize() {
    // 1. 解析 SQL → AST
    // 2. 逻辑优化（谓词下推、列裁剪、子查询解关联）
    // 3. 物理优化（JOIN 顺序、索引选择、聚合策略）
    // 4. 代价估算（行数、IO、CPU）
    return min(cost) plan
}
```

**关键参数**：

| 优化阶段 | 技巧 |
|---------|------|
| 逻辑优化 | 谓词下推、列裁剪、Subquery Unnesting |
| 物理优化 | JOIN 顺序、Index Hint、Hash Join vs Merge Join |
| 代价模型 | 行数估算、IO/CPU 代价 |

**最佳实践**：

- ✅ 收集统计信息（analyze table）——优化器依赖
- ✅ 用 EXPLAIN ANALYZE 验证计划——执行期统计反推
- ✅ 维护 Cardinality Estimation 模型——基于直方图
- ✅ 给优化器调试开关——`tidb_enable_cascades_planner`
- ❌ 避免让优化器过载（> 100 表 JOIN）——超时

### 模式 8：Percolator 分布式事务模型

**问题场景**：传统 2PC 协调者单点 + 同步阻塞。Google Percolator 用 MVCC + Primary Key 锁实现分布式事务，延迟低、可水平扩展。

**解决方案**：

```go
// 2PC 实现
// Prewrite 阶段
txn.Lock(primaryKey)        // 锁住 Primary
txn.Write(primaryKey, data)  // 写 Primary
txn.Write(secondKeys, data)  // 写 Secondaries

// Commit 阶段
pd.GetTS() -> commitTS
txn.Write(primaryKey, {commitTS})  // 原子标记
// 异步清理 Secondaries
```

**关键参数**：

| 阶段 | 操作 | 失败恢复 |
|------|------|---------|
| Prewrite | 锁 + 写 Primary + 写 Secondaries | 锁超时回滚 |
| Commit | 写 Primary 提交标记 | 异步扫尾 |
| Get | 读 Primary 提交标记 | 重试读 |

**最佳实践**：

- ✅ Primary Key 选访问频繁的 key——决定 commit 延迟
- ✅ 事务大小控制在 1000 行内——减少锁竞争
- ✅ 客户端重试 + 幂等——处理写冲突
- ✅ 用 TSO 排序——保证可串行化
- ❌ 避免在事务内做长耗时 RPC——锁持有时间爆炸

### 模式 9：TiDB Server 无状态化支持 K8s 调度

**问题场景**：传统数据库的 SQL 层与存储层绑定在同一进程，K8s 部署困难（StatefulSet + 复杂调度）。无状态 SQL 层才能用 Deployment。

**解决方案**：

```yaml
# TiDB Server Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tidb
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: tidb
        image: pingcap/tidb:v7.0
        ports:
        - containerPort: 4000
        - containerPort: 10080
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 4000 | MySQL 协议端口 |
| 10080 | HTTP 状态/Metrics |
| TiDB | 无状态（K8s Deployment） |
| TiKV | 有状态（K8s StatefulSet） |
| PD | 有状态（K8s StatefulSet） |

**最佳实践**：

- ✅ SQL 层用 K8s Deployment——滚动升级零停机
- ✅ PD/TiKV 用 StatefulSet——稳定网络标识
- ✅ 用 TiDB Operator 自动化运维——TiDBGroup CRD
- ✅ SQL 层用 HPA 自动扩缩——按 QPS 弹性
- ❌ 避免把 PD 部署成无状态——TSO 单点切换会丢时间戳

### 模式 10：Coprocessor 下推计算到 TiKV

**问题场景**：把 1 亿行数据从 TiKV 拉到 TiDB 过滤会拖垮网络。理想是"在 TiKV 端过滤，只返回 100 行结果"——这就是 Coprocessor 下推。

**解决方案**：

```go
// TiDB 端构造 Coprocessor 请求
req := &coprocessor.Request{
    Tp:      kv.ReqTypeSelect,
    StartTs: readTS,
    Data:    encodedPlan,  // 序列化后的执行计划
    Ranges:  []*coprocessor.KeyRange{{Start: startKey, End: endKey}},
}
resp, _ := tikvClient.SendCopReq(ctx, req, timeout)
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| Range | 扫表范围 |
| Plan | 执行计划（下推部分） |
| Result | 流式返回 |

**最佳实践**：

- ✅ 过滤条件下推——减少数据传输
- ✅ 聚合下推（COUNT/SUM/MAX）——减少网络 IO
- ✅ Join 下推到 TiKV（小表）——避免 shuffle
- ✅ Coprocessor Task 拆分——并行执行
- ❌ 避免下推包含用户函数的表达式——执行器不支持

## 性能优化

### 模式 11：RocksDB LSM 树 + Compaction 策略

**问题场景**：B+ 树随机写放大严重（每次写都要更新多层页）。LSM 把随机写转顺序写（追加到 MemTable + 刷盘 SST），写吞吐高 10x+。

**解决方案**：

```go
// TiKV 内部使用 RocksDB
opts := &rocksdb.Options{
    WriteBufferSize:           64 * 1024 * 1024,  // 64MB MemTable
    MaxWriteBufferNumber:      5,                  // MemTable 数量
    MinWriteBufferNumberToMerge: 2,
    Level0FileNumCompactionTrigger: 4,
    NumLevels: 7,
}
```

**关键参数**：

| 参数 | 默认 | 调优 |
|------|------|------|
| MemTable | 64MB | 越大写越快、读越慢 |
| Compaction | level/universal | universal 写放大小 |
| Block Cache | 总内存 30% | 越大读越快 |

**最佳实践**：

- ✅ 写多读少用 universal compaction——写放大最小
- ✅ 读多写少用 level compaction——读放大最小
- ✅ 限制 compaction 带宽（rate limiter）——避免影响前台
- ✅ 监控 stall time——超过 5% 要调参
- ❌ 避免 Block Cache 设太大——挤压 Page Cache

### 模式 12：Region Cache 减少 PD 请求

**问题场景**：每个 KV 请求都要查 PD 找 Region Leader？PD 压力爆炸。需要客户端缓存 Region 信息。

**解决方案**：

```go
// TiDB 维护 Region Cache
type RegionCache struct {
    mu      sync.RWMutex
    regions map[RegionKey][]*Region
}

func (c *RegionCache) LocateKey(bo *Backoffer, key []byte) (*Region, error) {
    if r := c.searchCache(key); r != nil {
        return r, nil  // 命中缓存
    }
    r, _ := pdClient.GetRegion(bo, key)  // 未命中查 PD
    c.mu.Lock()
    c.regions[r.RegionKey()] = append(c.regions[r.RegionKey()], r)
    c.mu.Unlock()
    return r, nil
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 缓存粒度 | Region 范围 |
| 失效机制 | Region Epoch 变化时清 |
| 预热 | 启动时按主键 range 预热 |

**最佳实践**：

- ✅ 客户端缓存 Region——PD 压力下降 100x
- ✅ Region Epoch 变化时清缓存——防止脏读
- ✅ 异步后台刷新——不影响前台
- ✅ 用 LRU 淘汰冷 Region——内存可控
- ❌ 避免缓存无 epoch——Region 切片后旧缓存指向新 region

### 模式 13：TiFlash 列存引擎支持 HTAP 实时分析

**问题场景**：传统 OLTP 走 TiKV（行存），OLAP 需要列存加速。TiFlash 是 TiDB 的列存副本——同一份 Raft 数据，行列双引擎。

**解决方案**：

```sql
-- 主从副本（行存 + 列存）
ALTER TABLE orders SET TIFLASH REPLICA 2;

-- 自动选择
SELECT COUNT(*) FROM orders WHERE price > 100;  -- TiFlash
SELECT * FROM orders WHERE id = 12345;          -- TiKV
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 副本数 | 默认 0（不开 TiFlash） |
| 同步延迟 | Raft Learner，跟随主 |
| 自动选择 | 优化器基于 cost 选 |

**最佳实践**：

- ✅ OLTP + 实时分析——避免 ETL 延迟
- ✅ TiFlash 用 Raft Learner——非投票副本，不影响写入
- ✅ 让优化器自动选择——避免硬编码
- ✅ 大表列裁剪——只读必要列
- ❌ 避免在 TiFlash 上做高频点查——延迟高于 TiKV

### 模式 14：Batch 消息合并 + 流水线提升吞吐

**问题场景**：10 万次 RPC 串行调用延迟高。批量合并 + 流水线把 10 万次压成 1000 次。

**解决方案**：

```go
// TiKV gRPC client batch
type batchCommandsClient struct {
    batched      sync.Map
    batchSize    int
    flushTimeout time.Duration
}

func (c *batchCommandsClient) send(cmd *Request) {
    c.batched.Store(cmd.GetSeq(), cmd)
    if c.batched.Length() >= c.batchSize {
        c.flush()
    }
}

func (c *batchCommandsClient) flush() {
    reqs := [][]*Request{}
    c.batched.Range(func(_, v) { reqs = append(reqs, v.(*Request)) })
    c.stream.Send(reqs)  // 一次发多个
}
```

**关键参数**：

| 字段 | 默认 | 调优 |
|------|------|------|
| batchSize | 64 | 越大延迟越高、吞吐越高 |
| flushTimeout | 1ms | 越大延迟越高 |

**最佳实践**：

- ✅ 高并发场景用 batch——吞吐提升 5-10x
- ✅ flushTimeout 控制在 1-5ms——避免等待太久
- ✅ 区分读/写 batch——读可异步、写需同步
- ✅ 监控 batch ratio——低于 30% 要排查
- ❌ 避免在 batch 中混长任务——长尾效应

### 模式 15：Raft Log Compact + Snapshot 控制日志膨胀

**问题场景**：Raft 日志持续追加，新节点加入 / 老节点追数据需要快照。日志太大会导致 Apply 慢、存储浪费。

**解决方案**：

```go
// 定期触发 Snapshot
func (r *raftWorker) maybeTriggerSnapshot() {
    appliedIdx := r.raftStorage.AppliedIndex()
    if appliedIdx - r.lastSnapshotIdx < r.snapshotInterval {
        return
    }
    snapshot, _ := kvStore.CreateSnapshot(appliedIdx)
    r.raftStorage.ApplySnapshot(snapshot)
    r.lastSnapshotIdx = appliedIdx
}
```

**关键参数**：

| 字段 | 默认 | 说明 |
|------|------|------|
| snapshotInterval | 10000 entries | 触发间隔 |
| snapshotSize | 100MB | 触发大小 |

**最佳实践**：

- ✅ Snapshot 按 entries 数触发——避免日志无限增长
- ✅ Snapshot 异步生成——不影响前台写入
- ✅ Snapshot 存储在共享存储（S3/NFS）——新节点直接拉
- ✅ 用 `raft snapshot` 子命令手动触发——排查用
- ❌ 避免 Snapshot 太频繁——生成本身有 IO 开销

## 工程实践

### 模式 16：Go + Bazel 单仓多模块构建

**问题场景**：TiDB / TiKV / PD 三个组件相互依赖，传统 `go build` 无法共享缓存。重复编译 30+ 分钟。

**解决方案**：

```bash
# Bazel 构建
bazel build //cmd/tidb-server:tidb-server
bazel build //cmd/tikv-server:tikv-server
bazel build //cmd/pd-server:pd-server

# 增量构建（命中远端缓存）
bazel build //pkg/...   # 仅重建改动的包
```

**关键参数**：

| 工具 | 作用 |
|------|------|
| Bazel | 增量构建 + 远端缓存 |
| `go.mod` | 依赖管理 |
| `BUILD.bazel` | Bazel 规则 |
| `.bazelversion` | 版本锁定 |

**最佳实践**：

- ✅ 用 Bazel 而非裸 go build——CI 提速 10x
- ✅ 远端缓存（S3/GCS）——团队成员共享构建结果
- ✅ 拆分多个 BUILD 文件——按包粒度
- ✅ 用 `bazel test //...` 运行所有测试——统一入口
- ❌ 避免 Go vendor + Bazel 混用——路径冲突

### 模式 17：分层监控 Metrics（PD/TiKV/TiDB 各暴露 Prometheus）

**问题场景**：分布式系统定位慢查询/慢 Region 难。要能从 SQL → Region → TiKV 全链路追踪。

**解决方案**：

```go
// PD 暴露 metrics
import "github.com/prometheus/client_golang/prometheus"

var regionHeartbeatCounter = prometheus.NewCounter(prometheus.CounterOpts{
    Name: "pd_region_heartbeat_total",
    Help: "Total number of region heartbeats.",
})

func handleRegionHeartbeat(...) {
    regionHeartbeatCounter.Inc()
    ...
}
```

**关键参数**：

| 组件 | 关键 Metrics |
|------|-------------|
| TiDB | `tidb_session_duration_seconds` |
| TiKV | `tikv_grpc_msg_duration_seconds` |
| PD | `pd_region_heartbeat_total` |
| TiFlash | `tiflash_storage_write_count` |

**最佳实践**：

- ✅ 用 Prometheus 客户端库——标准协议
- ✅ 给 hot path 加 Histogram——分布数据
- ✅ 区分 Counter/Gauge/Histogram/Summary
- ✅ Grafana Dashboard 内置（dashboard.json）
- ❌ 避免 metrics 名重复——多实例会冲突

### 模式 18：OpenTelemetry 全链路追踪

**问题场景**：单条 SQL 涉及 TiDB + PD + TiKV × N 副本，问题难以定位。需要 trace ID 串联所有 RPC。

**解决方案**：

```go
// TiDB 端开启 trace
import "go.opentelemetry.io/otel"

tracer := otel.Tracer("tidb")
ctx, span := tracer.Start(ctx, "ExecuteSQL",
    trace.WithAttributes(
        attribute.String("db.statement", sql),
    ),
)
defer span.End()

// gRPC 透传 trace 头
md, _ := metadata.FromOutgoingContext(ctx)
trace.SpanContextFromContext(ctx)
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| TraceID | 全局唯一请求 ID |
| SpanID | 单跳 ID |
| ParentSpanID | 上游 SpanID |
| Attributes | 标签（SQL、Region、TSO） |

**最佳实践**：

- ✅ 用 OpenTelemetry SDK——跨语言标准
- ✅ gRPC 自动 inject trace headers——零侵入
- ✅ 把 TraceID 写进慢查询日志——用户可关联
- ✅ 在 Grafana Tempo / Jaeger 查看——可视化链路
- ❌ 避免 trace 全量开——100% 采样影响性能

### 模式 19：Online DDL + `tidb-lightning` 批量导入

**问题场景**：传统 MySQL ALTER TABLE 锁表 30 分钟。TiDB 用 Online DDL 让 DDL 不阻塞读写。TB 级数据导入用 lightning 工具。

**解决方案**：

```sql
-- Online DDL（TiDB）
ALTER TABLE orders ADD COLUMN tags JSON DEFAULT NULL;  -- 异步执行，不锁表
ADMIN SHOW DDL JOBS;  -- 查看 DDL 进度
```

```bash
# tidb-lightning 导入
./tidb-lightning -config tidb-lightning.toml
# 配置 backend = "local" / "tidb" / "file"
# 配置 checkpoint 断点续传
```

**关键参数**：

| 特性 | 工具 |
|------|------|
| Online DDL | TiDB 原生（async） |
| 批量导入 | tidb-lightning（1TB/h） |
| 数据导出 | dumpling |
| 备份恢复 | BR (Backup & Restore) |

**最佳实践**：

- ✅ DDL 默认走 async 模式——不阻塞读写
- ✅ 大表导入用 lightning——比 INSERT 快 100x
- ✅ 导入前关闭 GC（`SET GLOBAL tidb_gc_life_time = '720h'`）——避免误删
- ✅ 用 BR 做全量/增量备份——支持 PITR
- ❌ 避免在导入期间做 DDL——会冲突

### 模式 20：TiDB Operator K8s 自动化运维

**问题场景**：分布式数据库在 K8s 上部署复杂（StatefulSet + ConfigMap + Service + PVC），手工维护成本高。需要 Operator 抽象。

**解决方案**：

```yaml
# TiDBCluster CR
apiVersion: pingcap.com/v1alpha1
kind: TiDBCluster
metadata:
  name: basic
spec:
  version: v7.5.0
  pd:
    baseImage: pingcap/pd
    replicas: 3
    requests:
      storage: "10Gi"
  tikv:
    baseImage: pingcap/tikv
    replicas: 3
    requests:
      storage: "100Gi"
  tidb:
    baseImage: pingcap/tidb
    replicas: 2
```

**关键参数**：

| 资源 | 用途 |
|------|------|
| TiDBCluster | 顶层 CRD |
| TiDBGroup | 多集群（联邦） |
| TidbMonitor | Grafana + Prometheus |
| BackupSchedule | 定时备份 |

**最佳实践**：

- ✅ TiDB Operator 把运维知识沉淀在 CRD——降低上手门槛
- ✅ 用 Helm Chart 部署 Operator——K8s 生态标准
- ✅ 配合 TidbMonitor 自动采集 Metrics——开箱即用
- ✅ Backup CRD 定时备份到 S3——PITR 基础
- ❌ 避免绕开 Operator 手改 StatefulSet——会与 Operator 状态冲突

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `tidb-master.zip`（已镜像） |
| 主语言 | Go |
| License | Apache 2.0 |
| 总文件 | 8858 |
| 核心目录 | `pkg/executor`, `pkg/expression`, `pkg/ddl`, `pkg/planner/core` |

## 一句话总结

TiDB 的精髓在 PD/TiKV/TiDB 三层分离（独立扩缩容） + Percolator 分布式事务（MVCC + Primary Key） + Raft 副本组（强一致） + Coprocessor 下推（减少网络 IO）四件套——任何"分布式 + 强一致 + SQL 兼容"项目都适用。MySQL 协议 + Online DDL + TiDB Operator 三件生态基础设施让生产部署像单机 MySQL 一样简单。
