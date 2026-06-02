# etcd 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：共识算法本质 — 为什么 Raft 能"达成一致"

### CAP 三角的选择
```
        CAP 三角
        C 一致性
       /│\
      / │ \
     /  │  \
    /   │   \
   A可用性 ─── P分区容忍
```
etcd 选择 **CP**：网络分区时拒绝写入，绝不返回脏数据。这和 ZK 一致，与 Dynamo/Cassandra (AP) 相反。

### 一致性的三层含义
| 层级 | 含义 | etcd 实现 |
|------|------|-----------|
| **Linearizability** | 一旦写成功，后续读必看见 | Raft 提交后 apply |
| **Sequential** | 全局有序 | LogIndex 单调 |
| **Causal** | 因果有序 | Watch revision 单调 |

### Quorum 公式
- 写入需要 ⌊N/2⌋+1 节点 ACK
- 3 节点：2 票
- 5 节点：3 票
- 5 节点能容忍 2 节点故障（多数派还剩 3）
- **奇数节点**：避免 split vote + 少 1 个节点成本

---

## 专题 2：Raft 状态机详解

### 状态转移图
```
                  超时/更高term
        ┌──────────────────────────┐
        ↓                          │
   ┌─────────┐   超时    ┌─────────────┐
   │Follower │──────────→│ Candidate   │
   └─────────┘           └─────────────┘
        ↑                       │
        │ 收到 AppendEntries     │ 拿到多数票
        │ 来自新 Leader          ↓
        │                  ┌─────────┐
        └──────────────────│ Leader  │
            发现更高 term   └─────────┘
```

### 关键时序：一次 Put 请求的生命周期
```
Client → etcdserver.Propose()
   ↓
raft.Node.Step({Type: MsgProp, Data: put_req})
   ↓
raft.tick() (主循环) → raft.appendEntry()
   ↓
raft.bcastAppend() — 给所有 follower 发 MsgApp
   ↓
follower 收到 MsgApp → 持久化 → 回 MsgAppResp
   ↓
leader 收到多数派 MsgAppResp → 推进 commitIndex
   ↓
raft.readyLoop 收到 commit 推进 → etcdserver applyEntries
   ↓
BoltDB 写入 → watch 触发 → client 收到响应
```

### 选举细节
- **随机 electionTimeout**（150-300ms）：防 split vote
- **PreVote**（v3.4+）：分区恢复的节点不会乱拉票
- **Leadership transfer**：leader 主动交权（用于 rolling upgrade）

---

## 专题 3：5 段必读代码逐段详解

### 3.1 `raft/raft.go:tickElection` — 时间累加的可测试性
**关键**：`electionElapsed++` 而非 `time.Ticker`
- 单测可注入 fake clock: `r.electionElapsed = 299; tick(); expect becomeCandidate()`
- 不需要 goroutine，没有泄露问题
- 整个项目找不到 `time.NewTicker(electionTimeout)`，全用累加

### 3.2 `raft/raft.go:Step` — 消息驱动状态机
**关键**：所有状态转移都走 `Step(m)` 一入口
- 本地 `MsgHup`（用户触发的选举）和远端 `MsgVote`（别的节点发的）都走它
- **好处**：状态机可序列化，可重放，单测覆盖
- **副作用**：term 处理必须在 switch 头部做一次

### 3.3 `raft/node.go:run` — 主循环的 5 通道
**关键**：select 多路复用
- `propc`：客户端提议
- `tickc`：时钟
- `readyc`：通知 etcdserver
- `advancec`：etcdserver 反馈
- `done`：退出

### 3.4 `etcdserver/server.go:run` — apply 循环
**关键**：单线程 apply 保证状态机一致性
- `applyWaitC` 是 buffered channel: 避免 raft 阻塞
- snapshot + entries 在同一处应用

### 3.5 `mvcc/kvstore_txn.go:Txn` — MVCC 事务
**关键**：compare-then-act + 批写
- `compare`：在 readview 上无锁读
- `then/else`：选一支后批写到 BatchTx
- `Commit()` 一次 fsync，N 个 op 落盘
- `notify(rev)` 触发 watch 事件

---

## 专题 4：性能调优参数矩阵

### 写性能瓶颈
| 参数 | 默认 | 调优方向 | 代价 |
|------|------|----------|------|
| `--quota-backend-bytes` | 2GB | 8GB | 多用磁盘 |
| `--max-request-bytes` | 1.5MB | 调到业务峰值 | 单请求变大 |
| `--election-timeout` | 1000ms | 调小（更快恢复） | 易 split vote |
| `--heartbeat-interval` | 100ms | 调小（更快感知） | 带宽↑ |
| `--snapshot-count` | 100000 | 调大（少做 snap） | 启动慢 |
| `--max-snapshots` | 5 | 调大（防丢 snap） | 磁盘 |
| `--max-wals` | 5 | 调大 | 磁盘 |

### 读性能优化
- **Linearizable Read**（默认）：要 round-trip leader 确认权威
- **Serializable Read**（`--read-mode=serializable`）：本地读，性能 10x，但允许过期
- 业务能容忍过期就用 serializable

### 监控关键指标
```
etcd_disk_wal_fsync_duration_seconds   # WAL fsync 延迟, P99 < 10ms
etcd_disk_backend_commit_duration_seconds  # BoltDB 提交延迟
etcd_server_leader_changes_seen_total  # 频繁 leader 切换 = 异常
etcd_mvcc_db_total_size_in_bytes       # db 容量
etcd_network_peer_round_trip_time_seconds  # 节点间延迟
```

---

## 专题 5：故障模式 + 应急处理

### F1：节点启动失败
**症状**：`etcd: failed to publish member`
**原因**：advertise URL 被防火墙挡 / DNS 解析不一致
**应急**：
```bash
# 1. 检查监听
ss -tlnp | grep 2380
# 2. 检查 advertise
etcdctl member list
# 3. 必要时改用 IP
--listen-peer-urls http://10.0.0.1:2380
--initial-advertise-peer-urls http://10.0.0.1:2380
```

### F2：db quota 超限
**症状**：`etcdserver: mvcc: database space exceeded`
**应急**：
```bash
# 1. 立即压缩
etcdctl compact $(etcdctl endpoint status --write-out=json | jq '.[] | .Status.leader' | head -1)
# 2. 碎片整理
etcdctl defrag
# 3. 长期方案: 调 quota-backend-bytes + 自动 compact
etcdctl --endpoints=$EP alarm disarm  # 必须先消警
```

### F3：脑裂
**症状**：两个 leader 同时存在（极罕见）
**检测**：`etcdctl endpoint status` 看 leader 字段
**应急**：
```bash
# 1. 隔离少数派 (网络层面)
# 2. 重启多数派 (强制选主)
# 3. 多数派恢复后, 少数派会自动 join
```

### F4：WAL 损坏
**症状**：`wal: file type bad`
**应急**：
```bash
# 1. 备份
cp -r data/member/wal data/member/wal.bak
# 2. 删 WAL 强制 replay
rm data/member/wal/0.tmp
# 3. 重启 — etcd 会从 snapshot + 剩余 WAL 恢复
```

### F5：性能抖动
**症状**：P99 延迟突然升高
**诊断 4 步**：
1. `etcdctl endpoint status` 看 leader/raft index
2. 查 `etcd_disk_wal_fsync_duration_seconds` 是否 > 50ms
3. 查 `go_memstats_gc_cpu_fraction` 看 GC 压力
4. 查 `etcd_network_peer_round_trip_time_seconds` 看跨节点延迟

---

## 专题 6：复用模式 + 代码模板

### 模式 A：消息驱动状态机
**场景**：订单状态机、审批流、CI 任务
```go
type State int
const (
    StateInit State = iota
    StateRunning
    StateDone
    StateFailed
)
type Msg struct {
    Type string
    Data any
    Term int  // 借鉴 Raft
}
type Machine struct {
    state State
    term  int
}
func (m *Machine) Step(msg Msg) error {
    if msg.Term > m.term {
        m.term = msg.Term
        // 降级到初始态
    }
    switch m.state {
    case StateInit:
        return m.stepInit(msg)
    case StateRunning:
        return m.stepRunning(msg)
    }
    return nil
}
```

### 模式 B：时间累加 + Fake clock
**场景**：业务定时器、限流窗口
```go
type Timer struct {
    elapsed int
    timeout int
    onFire  func()
}
func (t *Timer) Tick() {
    t.elapsed++
    if t.elapsed >= t.timeout {
        t.elapsed = 0
        t.onFire()
    }
}
// 测试: t.elapsed = 99; t.Tick(); expect fired
```

### 模式 C：WAL + 状态机分离
**场景**：支付订单、消息队列
```go
// 1. 写 WAL (顺序 fsync)
wal.Write(entry)
// 2. 状态机应用
stateMachine.Apply(entry)
// 3. 反馈客户端
// crash 后: replay WAL 重建
```

### 模式 D：批写 + 一次 fsync
**场景**：批量落盘、批量发送
```go
tx := db.Batch()
for _, op := range ops {
    tx.Apply(op)
}
tx.Commit()  // 一次 fsync, 不管里面 100 个 op
```

---

## 专题 7：实战部署拓扑

### 单区域 3 节点（基础）
```
┌──────────────┐
│   Region-A   │
│  ┌──┐┌──┐┌──┐│
│  │N1││N2││N3││
│  └─┬┘└┬┘└┬┘│
│    └──┴──┘  │
│  同一可用区  │
└──────────────┘
```
**适用**：开发/测试、小型生产
**风险**：单区域故障 = 全挂

### 跨可用区 5 节点（生产推荐）
```
┌──────────────────────┐
│   Region-A           │
│ ┌──────┐ ┌──────┐   │
│ │ N1   │ │ N2   │   │
│ │ Leader││Follow│   │
│ └──────┘ └──────┘   │
├──────────────────────┤
│   Region-B           │
│ ┌──────┐ ┌──────┐   │
│ │ N3   │ │ N4   │   │
│ │Follow│ │Follow│   │
│ └──────┘ └──────┘   │
├──────────────────────┤
│   Region-C (Tiebreak)│
│ ┌──────┐             │
│ │ N5   │             │
│ │Follow│             │
│ └──────┘             │
└──────────────────────┘
```
**奇数节点** + **跨 AZ 分布** + **Tiebreaker 防 split vote**

### 混合云 / 边缘
- **S3 备份**：etcdctl snapshot save → S3
- **K8s addon**：用 StatefulSet + PVC
- **监控**：Prometheus 抓 etcd /metrics
- **告警**：`etcd_server_leader_changes_seen_total > 5/min`

---

## 专题 8：etcd 让我重新思考的 5 件事

1. **可测试性 = 时间可控**。Ticker 在单测里极难测，累加器 + fake clock 一行搞定。
2. **消息驱动 = 状态机可重放**。线上问题可以录消息流到本地重放调试。
3. **WAL 永不删**。删 WAL 等于丢数据，宁可多磁盘也不丢。
4. **奇数节点**。3 / 5 / 7，容忍度每 2 跳一档。
5. **Linearizable vs Serializable**。读性能差 10x，但业务能容忍就上 Serializable。

---

## 专题 9：Raft vs Paxos — 5 维深度对比

### 本质区别
| 维度 | Paxos | Raft |
|------|-------|------|
| 论文 | 《The Part-Time Parliament》(Lamport, 1998) | 《In Search of an Understandable Consensus Algorithm》(Ongaro, 2014) |
| 可理解性 | 极难 (出了 6+ 变体) | 易懂 (状态机 + 角色) |
| 工业实现 | Chubby (Google), Megastore | etcd, Consul, TiKV, CockroachDB |
| 性能 | 等价 (Lamport 自己证明) | 等价 (都是 quorum-based) |
| 学习曲线 | 数月 | 数天 |

### 为什么 etcd 选 Raft
- **可理解性 > 理论优雅**: 工程团队要的是能 debug 的代码, 不是能发 paper 的算法
- **Decompose**: Raft 把 leader 选举 / log 复制 / 安全性 分三块, 各自独立
- **现实测试**: jepsen 库支持 Raft 故障注入, 验证简单

### Raft 的 3 个子问题
```
Raft = Leader Election + Log Replication + Safety
       ↓                   ↓                  ↓
   选一个 leader      log 复制到多数派    状态机 + 选举限制
   (随机 timeout)     (AppendEntries)    (election restriction)
```

### Multi-Raft (TiKV 实现)
- 单 Raft 集群上限 ~10GB, log 太长会卡
- TiKV 把数据按 range 拆, 每个 range 一个 Raft 组
- N 个 Raft 组并行, 吞吐 × N
- **代价**: 跨 range 事务变 2PC

---

## 专题 10：WAL 设计与 BoltDB 协同

### 双引擎架构
```
                    写路径
client.Put(key, val)
        │
        ├─→ raft log (WAL, append-only)
        │     ↓ 多数派 ACK
        ├─→ etcdserver.apply (单线程)
        │     ↓ BatchTx
        └─→ BoltDB (mmap + B+tree)
              ↓
         rev++ → notify watch
```

### WAL 文件结构
```
data/member/wal/
├── 0000000000000001-000000000000001c.wal  # segment 1 (8MB 默认)
├── 000000000000001d-0000000000000038.wal  # segment 2
└── 0000000000000039-0000000000000054.wal  # 当前
```
- 每条 entry: 8 字节 crc + 4 字节 length + data
- segment 满了就 rotate
- 启动时从最后 snapshot + 后续 WAL replay

### BoltDB 文件结构
```
data/member/snap/db
├── meta (current rev, conf state)
└── key-value (B+tree by key)
    └── value = (key, value, version, rev, lease)
```
- mmap 整个文件, 读 = 内存 B+tree 查
- 写 = BatchTx 写 page + 1 fsync

### 为什么是两层
| 操作 | WAL | BoltDB | 理由 |
|------|-----|--------|------|
| 写 | append | BatchTx (延迟) | 持久化 + 高吞吐 |
| 读 | (无) | mmap B+tree | 读路径快 |
| snapshot | 截断 | 序列化 | 启动加速 |
| replay | 全扫 | 跳过 (用 snap) | 启动加速 |

---

## 专题 11：etcd v3.5 架构演进

### 重要里程碑
| 版本 | 关键变化 | 性能影响 |
|------|----------|----------|
| v3.0 (2016) | gRPC 替代 HTTP/JSON, MVCC 重写 | 10x 写, 100x 读 |
| v3.2 (2017) | Lease + Watch streaming | watch 推送 ms 级 |
| v3.3 (2018) | gRPC proxy, non-blocking apply | 集群规模 5k+ keys |
| v3.4 (2019) | PreVote, learner 节点 | 防 split vote, 非投票副本 |
| v3.5 (2021) | concurrent apply, TLA+ 验证 | 写 3-5x |
| v3.6 (待发) | etcd GRPC API 治理 | 长尾延迟改善 |

### v3.5 并发 apply 详解
**问题**: apply 单线程, 8 核机器只用 1 核
**解决**: 哈希 mod → N 个 apply 线程
```
entry.Data → fnv32a(key) % N → apply_thread[N]
```
**限制**:
- 必须保证同 key 在同线程 (避免锁)
- 跨 key 事务被 hash 冲突打断, 重试

### PreVote 防 split vote 实战
- 节点网络分区 5 分钟, term=100
- 恢复后立刻变 candidate, term=101
- 旧 leader term=50, 收到 MsgVote(term=101)
- 旧 leader stepDown, 新 leader 上台
- 但新 leader log 太旧 → 数据覆盖!
- **PreVote 解决**: 先发 MsgPreVote(term=100+1) 询问, 多数派同意才真正 term++

---

## 专题 12：Watch 机制深度

### Watch 生命周期
```
client.Watch(ctx, "foo")
        │
        ├─→ server 创建 watcher (id, revision)
        ├─→ 客户端拉取历史 (revision → current)
        ├─→ 后续事件流式推送
        └─→ ctx 取消 → server 清理
```

### 事件队列 (Event Queue)
- 每个 watcher 一个 buffered channel (默认 1024)
- 满了: 阻塞 notify 路径, 影响主写
- 解决: 客户端必须及时消费

### MVCC 触发
```go
// apply 完一条 entry
s.notify(rev)
        │
        ├─→ 遍历所有 watcher
        │     ├─→ watch.key 匹配?
        │     │     ├─→ 是 → 推 event 到 channel
        │     │     └─→ 否 → skip
        │     └─→ watch.rev <= rev? 否则 skip
        └─→ 慢 watcher: 记入 metrics
```

### Watch 性能
| 场景 | 延迟 | 备注 |
|------|------|------|
| 1 watcher, 1 event | 1-5ms | 主要 fsync 时间 |
| 100 watchers, 1 event | 5-20ms | 1 推 N |
| 1000 watchers, 100 events/s | 50-200ms | 队列调度开销 |
| 10000 watchers | 1-5s | 考虑分片 |

---

## 专题 13：Lease 与 KeepAlive

### Lease 是什么
- 短期租约: TTL 到期自动删除所有关联 key
- 客户端周期性 keepalive 续约
- 用途: 分布式锁 / 服务发现 / 临时数据

### 实现
```
lease.grant(id, TTL=60s)
        │
        ├─→ LeaseQueue 加入, exp=now+60s
        ├─→ Put(key, val, lease=id)
        │     └─→ BoltDB: key→lease_id
        └─→ 后台 RevokeSweeper:
              - 定时 (1s) 扫 LeaseQueue
              - 已过期 → 调 Revoke → 删除 key → 触发 watch
```

### 实战 4 模式
| 模式 | 用法 | 注意 |
|------|------|------|
| 服务注册 | lease + put, keepalive 3s | 客户端崩 → 自动注销 |
| 分布式锁 | lease=10s, 锁 + 续约 | TTL 远 < 业务处理时间 |
| 心跳 | lease + put TTL=5s | 比业务超时短 |
| 一次性任务 | lease=60s, put, 不续约 | 60s 后自动清理 |

---

## 专题 14：etcd 在 K8s 中的角色

### K8s 架构
```
   kubectl / API client
        ↓ HTTP/gRPC
   kube-apiserver  ← 唯一 etcd 客户端
        ↓
   etcd cluster (3 节点)
```
- 任何 K8s 资源变化 → apiserver → etcd Put
- 任何 watch (pod/deploy 列表) → apiserver → etcd Watch
- apiserver 是 etcd 的"前端", 做了 schema 验证

### 性能指标 (K8s 规模)
| 集群规模 | 节点数 | 资源数 | etcd 集群配置 |
|---------|--------|--------|--------------|
| 小 | < 100 | < 10k objects | 1 个 etcd (开发) |
| 中 | 100-1000 | 10k-100k | 3 节点 SSD |
| 大 | 1000-5000 | 100k-500k | 5 节点 NVMe, 8GB mem |
| 巨型 | > 5000 | > 500k | 分层 apiserver + 多 etcd |

### K8s 的痛点
- **1MB 单 key 限制**: K8s 资源大了超限, 需 `--max-request-bytes=2MB`
- **apply 单线程**: K8s 1000 节点下, apiserver 排队 etcd apply
- **Watch 风暴**: 1000+ 客户端 watch pod, etcd 推送慢

---

## 专题 15：故障排查决策树

### 写入失败
```
etcdctl put 失败
  │
  ├── "etcdserver: request is too large" → key/value 超 1.5MB
  │
  ├── "etcdserver: mvcc: database space exceeded" → quota 超
  │     └─→ compact + defrag + 调 quota
  │
  ├── "context deadline exceeded" → 写慢 (apply 排队)
  │     └─→ 看 etcd_server_proposals_failed_total
  │
  └── "no leader" → 集群无 majority
        └─→ 多数派重启, 强制选主
```

### 选举频繁
```
etcdctl endpoint status 显示 leader_id 经常变
  │
  ├── 检查 etcd_network_peer_round_trip_time_seconds
  │     └── > 100ms → 网络抖动
  │
  ├── 检查 etcd_disk_wal_fsync_duration_seconds
  │     └── > 50ms → 磁盘 IO 慢
  │
  ├── 检查 GC 压力
  │     └── go_memstats_gc_cpu_fraction > 0.1
  │
  └── 调 election-timeout (1000ms → 2000ms)
```

### 读延迟高
```
读 P99 > 10ms
  │
  ├── 看是否开了 Linearizable Read (默认)
  │     └─→ 改 --read-mode=serializable (10x 加速)
  │
  ├── 看 BoltDB 是否 mmap 完 (大 db)
  │     └─→ 重启后第一次读慢, 预热
  │
  └── 看 Range 数量
        └─→ 一次 Range 拉 1000 key 比 1 key 慢, 分页
```

---

## 专题 16：etcd vs ZK vs Consul 16 维深度对比

| 维度 | etcd | ZK | Consul |
|------|------|-----|--------|
| 共识算法 | Raft | ZAB | Raft |
| 客户端 SDK | Go (官方), 多语言 | Java/C | Go, HTTP/DNS |
| Watch 模型 | gRPC streaming | 一次性, 需重连 | Long polling |
| 临时节点 (Lease) | ✅ (TTL) | ✅ (Ephemeral) | ✅ (Session) |
| 数据模型 | KV flat | 树 (ZNode) | KV + Service |
| 事务 | ✅ Compare-Then-Act | ✅ Multi-op | ❌ |
| ACL | ✅ (RBAC) | ✅ (Digest) | ✅ (Token) |
| 多集群 | ❌ (需自己 sync) | ❌ | ✅ (Federation) |
| K8s 集成 | ✅ 官方 | ❌ | ⚠️ 部分 |
| 服务发现 | ❌ (需自己实现) | ❌ | ✅ (原生) |
| 健康检查 | ❌ | ❌ | ✅ |
| 性能 (单 Put) | 2-5ms | 5-15ms | 3-10ms |
| 运维 | 中 (etcdctl) | 难 (zkServer.sh) | 中 (consul CLI) |
| 文档 | 详尽 | 一般 | 良好 |
| 生态 | K8s/容器 | Hadoop/Dubbo | 微服务 |
| 协议 | gRPC/HTTP | 自定义 (Jute) | HTTP/DNS/gRPC |

---

## 专题 17：etcd 让我重新思考的 5 件事 (再版)

1. **可测试性 = 时间可控**。任何有 ticker 的代码都该用累加器改造。
2. **消息驱动 = 可重放 = 可调试**。录 log + jepsen 测, 分布式 bug 终结者。
3. **WAL + 状态机 = 持久化的不二法门**。Redis AOF、PG WAL 都是同思路。
4. **奇数节点 = 多数派最优**。3 节点 vs 4 节点, 同样容 1 故障, 成本相同但 3 更简洁。
5. **CP vs AP 永远要选**。别试图做"两边都强"的中间方案, Paxos/Raft 就是为 CP 设计的。

---

## 专题 18：7 步避坑 + 5 个反模式

### 7 步避坑
1. **生产必开 `--quota-backend-bytes=8GB`**
2. **生产必开 `--auto-compaction-mode=periodic --auto-compaction-retention=8h`**
3. **生产必开 `--cert-file + --key-file + --client-cert-auth`** (mTLS)
4. **生产禁用 `--debug`** (性能开销)
5. **生产调 `--election-timeout=1000ms` + `--heartbeat-interval=100ms`** (K8s 推荐)
6. **监控必须看 `etcd_disk_wal_fsync_duration_seconds` P99 < 10ms**
7. **定期 `etcdctl compact + defrag`** (db 空间 50%+ 占用时)

### 5 个反模式
1. **把 etcd 当 DB 用** → 应为配置/元数据, 不是业务数据
2. **单 key 存大 value (1MB+)** → 拆成多个 key
3. **频繁 compact** → 影响 watch 历史回溯
4. **不监控 quorum 健康** → 2/3 节点死都不知道
5. **同一集群混 K8s + 业务** → 干扰严重, 分开

---

## 专题 19：跨项目引用

- `[[../10-vault/README|Vault]]` — Vault storage backend 可用 etcd
- `[[../02-redis/README|Redis]]` — AP vs CP 对照
- `[[../05-golang/README|Go]]` — channel select 范式来源
- `[[../03-kubernetes/README|K8s]]` — K8s 元数据存储
- `[[../09-ripgrep/README|ripgrep]]` — 同样 Rust 重写经典, etcd 选 Go
- `[[../ag/README|ag]]` — 等价的"ag vs rg" vs "etcd vs ZK"

---



---

## 🔗 进一步阅读

- 论文：《In Search of an Understandable Consensus Algorithm》(Raft)
- 文档：https://etcd.io/docs/
- 源码：https://github.com/etcd-io/etcd
- K8s 集成：`pkg/kubelet/.../etcd.go`
- 实战书：《etcd 实战课》(极客时间)
