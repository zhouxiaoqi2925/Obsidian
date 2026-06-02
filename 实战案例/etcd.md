# etcd - 强一致分布式 KV 存储

**GitHub**: etcd-io/etcd
**Star**: 48k+
**语言**: Go
**主题**: 分布式 KV / Raft / 一致性
**适用场景**: K8s 控制面 / 服务发现 / 配置中心 / 分布式锁

---

## 第一段：基础范式（模式 1-5）

### 模式 1：Raft 一致性协议

**问题场景**：多节点 KV 同步难——Paxos 难实现，Zab 绑死 ZK 协议栈；需要通用强一致库。

**解决方案**：etcd 用 Raft 算法包（`raft/` 目录）+ bbolt 状态机，对外暴露 KV。Raft 把一致性拆成 leader election + log replication + safety 三段。

**关键参数**：
- `election timeout` 默认 1s 随机 1-2s
- `heartbeat interval` 100ms
- `snapshot threshold` 控制日志压缩
- `quorum = N/2 + 1`

**最佳实践**：集群规模 3/5/7 奇数节点；2N+1 节点数 = N 容忍故障；RTT < 100ms 才能跑。

### 模式 2：KV 数据模型与 revision

**问题场景**：分布式 KV 需要"全序"和"事务"语义，但单机 KV 做不到。

**解决方案**：etcd 用 bbolt（B+ 树）存数据，每个写操作单调递增 `revision`（64-bit），前缀区间查询带 `Range`。事务用 mini-transaction 比较目标版本后再写。

**关键参数**：
- `revision` 全局单调递增
- `mod_revision` / `create_revision` / `version` 四元组
- `Range` 请求支持 `range_end`
- `Txn` 支持 compare + succeed/failure 分支

**最佳实践**：用 `mod_revision` 做乐观锁；事务用 `compare([...])` 验目标版本再 `put`。

### 模式 3：Watch 机制

**问题场景**：客户端需要实时感知 KV 变更；轮询耗资源 + 延迟大。

**解决方案**：etcd v3 watch 走 gRPC streaming + revision bookmark，server 推增量事件。客户端 `WatchRequest{start_revision}` 支持断点续传。

**关键参数**：
- `start_revision` 断点续传
- `progress_notify` 心跳
- `filter` 过滤事件
- `watch_id` 多路复用

**最佳实践**：客户端重连后用最近 `revision + 1` 续传；长时间不消费触发服务端 close；限流防 OOM。

### 模式 4：Lease 租约

**问题场景**：需要 key 自动过期 / 服务注册 TTL 失效 / 临时锁。

**解决方案**：Lease 抽象（64-bit ID），关联 key 自动过期；`KeepAlive` 续约。批量 key 可绑同一 lease。

**关键参数**：
- `LeaseGrant` 创建租约
- `LeaseKeepAlive` 续约（stream）
- `LeaseRevoke` 主动撤销
- `TTL` 过期秒数

**最佳实践**：服务注册用 lease TTL = 30s + KeepAlive 5s；key 绑 lease 自动清理。

### 模式 5：gRPC API 与 v2/v3

**问题场景**：HTTP/JSON 性能弱，二进制协议门槛高。

**解决方案**：v3 用 gRPC + protobuf（`rpc.proto`）；v2 兼容 HTTP/JSON。etcd 客户端支持 v2/v3 自动协商。

**关键参数**：
- v3 `127.0.0.1:2379` gRPC
- v2 `127.0.0.1:4001` HTTP
- `etcdctl --endpoints=` 多端点
- `compact` / `defrag` 运维命令

**最佳实践**：新项目走 v3 gRPC；v2 仅过渡用；v2/v3 数据不互通。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：WAL 与 Snapshot

**问题场景**：节点重启数据丢失 / 内存状态与磁盘状态对不齐 / 慢节点追不上 leader。

**解决方案**：所有写先写 WAL（Write Ahead Log）落盘；周期性 snapshot 到 `snap` 文件；新节点或慢节点走 `InstallSnapshot` RPC 拿全量。

**关键参数**：
- WAL 64MB segment 轮转
- `--snapshot-count` 默认 100000
- `--max-snapshots` / `--max-wals` 保留
- `compact` 物理压缩

**最佳实践**：生产 `--quota-backend-bytes` 限 8GB 防爆；定期 `defrag` 提性能。

### 模式 7：MVCC 与事务

**问题场景**：读写冲突 / 写写竞争 / 事务隔离。

**解决方案**：etcd v3 用 MVCC，每个 key 维护 version 链；事务 `Txn` 支持 `compare(mod_revision) → put` 原子操作。

**关键参数**：
- `Compare.value` / `Compare.mod_revision` / `Compare.version`
- `Txn.when = [...]` 条件数组
- `Txn.then / else` 操作数组
- `Range.mode: SERIALIZABLE | LINEARIZABLE`

**最佳实践**：分布式锁用 `compare-and-swap`；leader 选举用 `put with lease`。

### 模式 8：Auth 与 RBAC

**问题场景**：多租户共享 etcd 集群；权限隔离。

**解决方案**：`auth enable` 启 RBAC；`root` / 普通 user 配 role + permission（key prefix 范围 + 读/写/读写）。

**关键参数**：
- `auth enable` 启
- `user add` / `user grant-role`
- `role add` / `role grant-permission`
- 权限 `{key, range_end, perm: read|write|readwrite}`

**最佳实践**：生产必开 auth；TLS 必开（`--cert-file` / `--key-file`）。

### 模式 9：TLS 与安全

**问题场景**：集群通信 / 客户端通信明文被嗅探。

**解决方案**：双向 mTLS（client + server + peer 三套证书）；`--auto-tls` 配 cfssl 生成测试证书；生产用 `cfssl` 正式 CA。

**关键参数**：
- `--cert-file` / `--key-file` server
- `--client-cert-auth` 强制客户端证书
- `--trusted-ca-file` CA
- `--peer-cert-file` / `--peer-key-file` 节点间

**最佳实践**：生产必须 mTLS；证书用 1 年短周期；K8s 集成用 `kube-apiserver` 自动轮换。

### 模式 10：性能调优

**问题场景**：高并发写延迟高 / 磁盘 IO 瓶颈 / fsync 阻塞。

**解决方案**：调整 `--election-interval` / `--heartbeat-interval`；`--max-request-bytes` 限大请求；`--quota-backend-bytes` 限存储；后端 bbolt 走 mmap。

**关键参数**：
- `--election-interval=100ms`
- `--heartbeat-interval=10ms`
- `--max-request-bytes=1.5MB`
- 监控 `disk_wal_fsync_duration_seconds`

**最佳实践**：高写场景用 SSD + ext4/xfs；监控 `backend_commit_duration` 超过 25ms 扩容。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：Learner 节点（非投票成员）

**问题场景**：跨地域多活 / 灾备从节点；不希望影响 quorum。

**解决方案**：Raft learner（pre-vote + demote/promote）允许节点同步但不参与投票；v3.4+ 支持。

**关键参数**：
- `--initial-cluster` 配 learner
- `member add --learner`
- `member promote` 转 voter
- 异步同步不阻塞

**最佳实践**：跨地域复制用 learner 同步 + 异步 promote；灾备 RPO 取决于 learner 同步延迟。

### 模式 12：Backend 存储与磁盘

**问题场景**：bbolt 单文件膨胀 / 写放大 / 备份恢复慢。

**解决方案**：bbolt 单文件 mmap；`etcdctl snapshot save/ restore` 备份恢复；`defrag` 重建文件；`compact` 物理删除历史版本。

**关键参数**：
- `bolt` 默认后端
- `--quota-backend-bytes=8GB`
- `compact` / `defrag` 子命令
- `snapshot save` 全量

**最佳实践**：每晚 cron `compact 0` + `defrag`；`quota` 满了就告警；离线备份 `snapshot save`。

### 模式 13：多集群与代理

**问题场景**：客户端需要聚合查询多 etcd / 跨 region 灾备。

**解决方案**：grpc-proxy（`etcd grpc-proxy`）聚合多集群；客户端 connect proxy 看视图一致。`DNS SRV` 记录自动发现集群端点。

**关键参数**：
- `--listen-addr` proxy
- `--endpoints` 多 etcd
- `dns+srv://` 端点格式
- K8s 走 `etcd-endpoints` configmap

**最佳实践**：跨 region 走 proxy；客户端只配 proxy 地址；proxy 自身需高可用。

### 模式 14：运维与监控

**问题场景**：集群出问题不告警 / 性能瓶颈难定位。

**解决方案**：`/metrics` Prometheus 端点；关键指标 `etcd_server_has_leader` / `etcd_disk_wal_fsync_duration_seconds` / `etcd_mvcc_db_total_size_in_bytes`；Grafana 模板。

**关键参数**：
- `--listen-metrics-urls` 启指标
- `--enable-prometheus` 旧版
- `wal_fsync` / `backend_commit` 关键 SLO
- `leader_elections_total` 告警

**最佳实践**：5 个核心指标告警：no leader、wal_fsync > 10ms、proposal_failed、db_size、heartbeat 延迟。

### 模式 15：客户端与一致性

**问题场景**：客户端读从 leader 还是 follower；读到旧值。

**解决方案**：`WithRequireLeader` / `Serializable` 选项；`MinLinearizableRead` 强制 leader；followers 读可走 `--read-replicate` 同步；多版本读不阻塞写。

**关键参数**：
- `clientv3.Config{DialTimeout: 5s, Endpoints: []string{...}}`
- `clientv3.WithRequireLeader(ctx)`
- `WithRev(rev)` 历史快照读
- `concurrency.NewSession` 分布式并发原语

**最佳实践**：敏感读必 `WithRequireLeader`；非敏感走 follower 提并发；`WithRev` 走 MVCC 历史。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：选举与脑裂

**问题场景**：网络分区导致双 leader；旧 leader 复活后 commit 覆盖新数据。

**解决方案**：Raft term 机制：旧 leader 见更高 term 自动 step down；commit 规则需多数派 ack；`Check Quorum` 失联超阈值自降。

**关键参数**：
- `--election-interval` + `--heartbeat-interval` 比 = 10:1
- `PreVote` 防分区恢复时扰动
- `CheckQuorum` 自检
- 多数派原则

**最佳实践**：Pre-Vote + CheckQuorum 双保险；监控 `leader_elections_total` 频繁告警查网络。

### 模式 17：K8s 集成

**问题场景**：K8s 集群的"大脑"必须用 etcd；etcd 故障 K8s 全瘫。

**解决方案**：K8s `kube-apiserver` 直接连 etcd；`etcd-member` `etcd-operator`（v3 之前）/ `etcd-defrag` cron job / `etcd-backup-restore` Operator。

**关键参数**：
- `etcd-servers=https://127.0.0.1:2379`
- `etcd-cafile` / `etcd-certfile` / `etcd-keyfile`
- `etcd-compaction-interval` 5min
- K8s 1.30+ 推 `etcd-defrag-controller`

**最佳实践**：K8s 节点 ≤ 5000 时 etcd 3 节点够；定期 `snapshot save` + `etcdctl snapshot restore` 演练。

### 模式 18：备份与恢复

**问题场景**：数据误删 / 集群全挂 / 跨环境迁移。

**解决方案**：`etcdctl snapshot save` 全量备份；`snapshot restore` 恢复新集群；K8s 走 `etcd-backup-restore` 工具；定期演练。

**关键参数**：
- `etcdctl snapshot save backup.db`
- `snapshot restore --name=node1 --initial-cluster=...`
- `etcdctl backup`（v3.2 之前）
- 加密备份 `etcdutl snapshot --encrypt`

**最佳实践**：每 6 小时全量 + 加密上传 S3；恢复演练每季度 1 次；保留 30/90/365 多档。

### 模式 19：客户端重试与负载均衡

**问题场景**：节点切换 / 网络瞬断 / 端点失效。

**解决方案**：`grpc-keepalive` + `grpc-timeout`；客户端 ep 自动发现（DNS SRV / 静态列表）；重试 with backoff + jitter。

**关键参数**：
- `--dial-timeout=5s`
- `--keepalive-time=2s --keepalive-timeout=6s`
- 客户端 endpoint pool 自动刷新
- gRPC retry policy

**最佳实践**：客户端用 `endpoints` 多端点 + balancer；服务端 `MaxConcurrentStreams` 限并发；网络 RTT > 50ms 必查。

### 模式 20：测试与混沌工程

**问题场景**：Raft 边界条件难测 / 网络分区难模拟 / 写丢失难发现。

**解决方案**：`etcd` 仓库 `tests/` 集成测试 + linearizability 验证（`go-fail` 注入）；chaos-mesh 注入网络分区；Jepsen 第三方验证。

**关键参数**：
- `etcd/tests/integration/`
- `go-fail` 注入故障
- `jepsen.etcd` 框架
- `linearizability-check`

**最佳实践**：CI 跑 `make test` + `go-fail` 注入；生产前 Jepsen 验证一致性；K8s 上 chaos-mesh 演练。
