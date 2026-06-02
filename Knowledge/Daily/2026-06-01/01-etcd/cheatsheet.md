# 《etcd》速查卡

> 入口在 [[README|README.md]]｜分类：Distributed｜⭐⭐⭐⭐⭐｜适用：K8s/配置中心/分布式锁/服务发现

---

## 🎯 一句话价值

**Raft 共识算法的最工业级 Go 实现** — 任何需要"集群一致 + 强一致 + Watch 通知"的场景都绕不开它。

---

## 🧠 3 个核心洞察（必背）

1. **状态机 = 消息处理函数**：`Step(msg)` 统一所有状态转移, 本地/远端/选举/提案都走同一入口
2. **可测试性 = 时间可控**：累加计数器 + fake clock, 整个项目找不到 `time.NewTicker(electionTimeout)`
3. **持久化分层**：WAL（顺序写）+ BoltDB（MVCC 查）双引擎, 各司其职

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `raft/raft.go:tickElection` | 累加器 + 随机 timeout 防 split vote, 0 goroutine 泄露 |
| 2 | `raft/raft.go:Step` | 消息驱动状态机, term 集中处理, 可重放 |
| 3 | `raft/node.go:run` | 5 通道 select, ready/advance 协调 producer/consumer |
| 4 | `etcdserver/server.go:run` | apply 循环, snapshot+entries 同处, 单线程保一致 |
| 5 | `mvcc/kvstore_txn.go:Txn` | Compare-Then-Act, 读视图无锁, 批写 1 fsync |

---

## ⚡ 性能数字（4 核 8G, 1k keys 基准）

| 场景 | 工具 | 延迟/吞吐 | 说明 |
|------|------|----------|------|
| 单 Put (1KB) | etcd v3.5 | 2-5ms P99 | 含 Raft 复制 |
| 批 Put (100 keys) | etcd v3.5 | 5-15ms P99 | 1 fsync 摊 100 op |
| Range 1 key | etcd v3.5 | 0.5-2ms P99 | local read |
| Txn CAS | etcd v3.5 | 3-8ms P99 | readview + batch |
| 1000 watch | etcd v3.5 | 5-20ms 推送 | notify 路径 |
| BoltDB 写 | 内部 | ~10k entries/s | 单 apply 线程 |
| 启动 (100K keys) | etcd v3.5 | ~5-15s | WAL replay + bolt open |
| 选举恢复 | etcd v3.5 | 100-1000ms | electionTimeout 决定 |

**结论**: apply 单线程是瓶颈, v3.5+ 引入并发 apply 提升 3-5x。

---

## 🌳 算法决策树

```
需要分布式一致?
  │
  ├── 强一致 (Linearizable)
  │     │
  │     ├── K8s 元数据 / 配置中心 / 分布式锁
  │     │     └── ✅ etcd (或 ZK, Consul)
  │     │
  │     └── 业务能容忍过期? → 用 lease + readIndex 优化
  │
  ├── 最终一致 (AP)
  │     └── Cassandra / DynamoDB (别用 etcd)
  │
  └── 弱一致 (Cache)
        └── Redis / Memcached (也别用 etcd)
```

### 何时不用 etcd

- **大文件存储**: 8MB 限制 (`--max-request-bytes`), 不要塞图片
- **高并发写**: 单 apply 线程 ~10k/s, 超 10k TPS 难
- **弱一致可接受**: 浪费, 用 Redis 即可
- **跨地域强一致**: RTT 太大 (100ms+), 选 Spanner / CockroachDB

---

## 🚀 命令分组速查

### 基础操作
```bash
etcdctl put foo bar              # 写
etcdctl get foo                  # 读
etcdctl get foo --rev=1234       # 历史读 (MVCC)
etcdctl del foo                  # 删
etcdctl watch foo                # 监听
etcdctl txn -i                   # 事务 (交互式)
```

### 集群管理
```bash
etcdctl member list              # 集群成员
etcdctl endpoint status          # 节点状态 (leader, raft index)
etcdctl endpoint health          # 健康检查
etcdctl alarm list               # 告警 (quota 超限)
etcdctl snapshot save /tmp/snap.db  # 备份
etcdctl snapshot restore         # 恢复
```

### 性能 / 调试
```bash
etcdctl check perf               # 性能基线测试
etcdctl defrag                   # 碎片整理 (释放空间)
etcdctl compact $rev             # 压缩到指定 rev
etcdctl --debug put foo bar      # 调试模式 (输出 raft 细节)
etcdctl status -w table          # 表格输出
```

### 运维必看
```bash
etcdctl auth enable              # 开启认证
etcdctl user add root            # 加用户
etcdctl role grant-permission    # 授权
etcdctl --endpoints=$EP alarm disarm  # 消警 (quota 超限后)
```

---

## 🔐 4 类安全配置

| 配置 | 场景 | 风险 |
|------|------|------|
| `--cert-file + --key-file` | 客户端 mTLS | 低 (标配) |
| `--client-cert-auth` | 强制双向 TLS | 中 (证书管理) |
| `--auth-token jwt` | 启用 RBAC | 中 (token 轮转) |
| `--encryption-provider-config` | 静态加密 (KMS) | 低 (KMS 依赖) |

---

## ⚠️ 必避 3 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **db quota 超限** | `database space exceeded` alarm | `compact + defrag`, 调 `--quota-backend-bytes` |
| **WAL 损坏** | `wal: file type bad` | 备份后删 WAL, replay 恢复 |
| **脑裂** (罕见) | 两个 leader | 检查网络分区, 多数派恢复 |

### 4 个隐藏坑

- **Lease TTL 写死**: 业务应周期性 keepalive (`--lease=0` 永不失效是错的)
- **Watch 慢消费者**: etcd 不会主动断开, 内存累积 → 必须用 streaming + ctx cancel
- **大 value (1MB+)**: 单 key 大, 影响 snapshot + 广播带宽, 拆小
- **Range revision 错位**: 读历史版本时, rev 必须 < compact rev, 否则出错

---

## 🔄 etcd vs 类似方案决策树

```
需要强一致 KV + Watch?
  │
  ├── 业务规模 < 1GB + 跨语言客户端
  │     ├── K8s 集成 (最常见) → etcd
  │     ├── Java/JVM 重 → Consul (生态更全)
  │     └── 极致读性能 → ZK (Netty 框架)
  │
  ├── 业务规模 > 1GB (e.g. 配置中心)
  │     └── 考虑 Consul + PostgreSQL 后端
  │
  ├── 跨地域强一致
  │     └── CockroachDB / Spanner (别用 etcd)
  │
  └── 临时数据, 弱一致
        └── Redis / Hazelcast
```

### 简要对比

| 维度 | etcd | ZK | Consul |
|------|------|-----|--------|
| 共识算法 | Raft | ZAB (Raft 变体) | Raft |
| 客户端语言 | Go (gRPC) | Java 为主 | Go (HTTP/DNS) |
| Watch | gRPC streaming | 一次性 + 需重连 | Long polling |
| K8s 集成 | ✅ 官方 | ❌ | ⚠️ |
| 性能 (单 Put) | 2-5ms | 5-15ms | 3-10ms |
| 运维成本 | 中 (etcdctl + 备份) | 高 (zkServer.sh) | 中 |

---

## 🧩 可复用模式

| 模式 | etcd 怎么实现 | 我能用到哪 |
|------|--------------|----------|
| **消息驱动状态机** | `Step(msg)` 统一入口 | 任何业务状态机 (订单/审批/CI) |
| **时间累加 + Fake clock** | `electionElapsed++` | 任何定时器 (限流窗口/超时重试) |
| **WAL + 状态机分离** | WAL fsync + apply | 支付/消息队列/审计 |
| **批写 + 1 fsync** | BatchTx.Commit() | 数据库 bulk insert, 批量发送 |
| **Compare-Then-Act** | mvccpb.Txn | 分布式锁/CAS/版本控制 |
| **5 通道 select 主循环** | propc/tickc/readyc/advancec/done | 高并发 IO 多路复用 |

→ 模式 A-F 详细见 `deep-dive.md 专题 6`

---

## 📋 反思：etcd 让我重新思考的 5 件事

1. **可测试性 = 时间可控**。Ticker 在单测里极难测, 累加器 + fake clock 一行搞定。
2. **消息驱动 = 状态机可重放**。线上问题可以录消息流到本地重放调试 (jepsen)。
3. **WAL 永不删**。删 WAL 等于丢数据, 宁可多磁盘也不丢。
4. **奇数节点**。3 / 5 / 7, 容忍度每 2 跳一档, 偶数节点纯属浪费。
5. **Linearizable vs Serializable**。读性能差 10x, 业务能容忍就上 Serializable (--read-mode=serializable)。

---

## ⚠️ 7 必避陷阱速查表

| # | 坑 | 症状 | 解法 |
|---|----|------|------|
| 1 | **db quota 超限** | `database space exceeded` alarm | `compact + defrag`, 调 `--quota-backend-bytes=8G` |
| 2 | **WAL 损坏** | `wal: file type bad` 启动失败 | 备份后删 WAL, replay 恢复 |
| 3 | **脑裂 (罕见)** | 两个 leader | 检查网络分区, 多数派恢复 |
| 4 | **Lease TTL 写死** | 业务挂时锁不释放 | `lease keepalive`, `--lease=0` 永不失效是错的 |
| 5 | **Watch 慢消费者** | 内存累积 → OOM | 必用 streaming + ctx cancel, 不要 Range 一次性 |
| 6 | **大 value (1MB+)** | snapshot + 广播带宽爆炸 | 拆小, 或用对象存储 + 存 url |
| 7 | **Range revision 错位** | `mvcc: required revision is a compaction` | rev 必须 < compact rev, 读历史用 stream |

### 4 个生产必调参数

```bash
--election-timeout=1000        # 默认 1000ms, K8s 跨 AZ 必调到 1500ms
--heartbeat-interval=100       # 默认 100ms, 保持 1:10 比例
--snapshot-count=10000         # 10 万 entries 太频繁, 调到 10 万
--max-request-bytes=1048576    # 1MB 默认, 不要调到 32MB+ 会卡
```

---

## 🔬 关键监控指标 (PromQL)

```promql
# 1. Leader 切换频率 (集群不稳的标志)
rate(etcd_server_leader_changes_seen_total[5m])

# 2. fsync 延迟 (磁盘卡)
histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m]))

# 3. Proposal 提交延迟 (Raft 慢)
histogram_quantile(0.99, rate(etcd_server_proposal_commit_total_duration_seconds_bucket[5m]))

# 4. 慢 Apply (apply 线程卡)
rate(etcd_server_apply_duration_seconds_sum[5m]) / rate(etcd_server_apply_duration_seconds_count[5m])

# 5. Watch 落后 (慢消费者)
max(etcd_debugger_mvcc_watch_stream_total)

# 6. DB size
etcd_mvcc_db_total_size_in_bytes / 1024 / 1024   # MB

# 7. 活跃 gRPC 连接
etcd_server_grpc_active_streams
```


---

## ✅ 我能马上用的 3 件事

- [ ] 把项目里某个状态机改成 `Step(msg)` 消息驱动模式
- [ ] 用累加时间 + fake clock 写可测试定时器
- [ ] 引入 WAL 模式做重要操作审计 (订单/支付)

---

## 🔗 跨项目引用

- `[[../02-redis/README|Redis]]` — AP vs CP 对照 (etcd CP, Redis 弱一致)
- `[[../05-golang/README|Go]]` — channel select 范式, 来自 etcd 启发
- `[[../03-kubernetes/README|K8s]]` — K8s 用 etcd 做元数据存储, apiserver 是 etcd 的"客户端"
- `[[../10-vault/README|Vault]]` — Vault 物理存储后端可用 etcd
- `[[../08-prometheus/README|Prom]]` — 抓 etcd /metrics 做监控

---

## 📚 进一步阅读

- 源码: https://github.com/etcd-io/etcd
- 论文: 《In Search of an Understandable Consensus Algorithm》(Raft, 2014)
- 文档: https://etcd.io/docs/
- 实战书: 《etcd 实战课》(极客时间), 《Kubernetes 源码剖析》
- 监控: `etcd_disk_wal_fsync_duration_seconds`, `etcd_server_leader_changes_seen_total`
- `deep-dive.md` — 11+ 专题深度解析
- `code-snippets/` — 5 段必读代码 (80-140 行/段, 完整函数 + 多 WHY + 性能数据)
