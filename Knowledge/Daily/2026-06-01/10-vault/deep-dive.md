# Vault 深度专题分析

> 在 [[README|README.md]] 的 14 步框架基础上做专题深挖

## 专题 1：零信任架构的核心 — 动态凭证

### 静态密钥 vs 动态凭证
```
┌──────────────────────────────────────────┐
│         传统静态密钥                      │
│                                          │
│  .env: DB_PASSWORD=xxx                   │
│  ─────────────────────────                │
│  风险: 长期不变 / 多人共享 / 离职带不走    │
└──────────────────────────────────────────┘
                ↓ 替代方案
┌──────────────────────────────────────────┐
│         Vault 动态凭证                    │
│                                          │
│  1. App 请求: vault read db/creds/app    │
│  2. Vault: CREATE USER app_xyz; GRANT...  │
│  3. 返回: user=app_xyz, pass=随机强密码   │
│  4. TTL=1h: 自动 DROP USER               │
│  ─────────────────────────                │
│  收益: 短生命周期 + 可追溯 + 自动化       │
└──────────────────────────────────────────┘
```

### 动态凭证的 4 大优势
1. **泄露窗口短**: 1h 凭证 vs 1y 静态密码
2. **离职自动失效**: TTL 到点自动清理
3. **审计完整**: 谁什么时候拿过什么凭证
4. **零共享**: 每个 App/App-Instance 独立凭证

### 支持的后端
- **Database**: MySQL/Postgres/MSSQL/Oracle/MongoDB
- **AWS**: IAM User (短期 STS)
- **GCP**: Service Account Key
- **Azure**: Service Principal
- **OpenStack**: Domain
- **RabbitMQ**: User + vhost
- **PKI**: 短期 X.509 证书

---

## 专题 2：Barrier 加密 — 永不落明文

### 加密栈
```
物理存储 (S3 / Consul / Raft)
  ↓
AES-256-GCM 加密 (Barrier)
  ↓
Plaintext (Logical Backend 操作)
  ↓
应用层
```

### 关键特性
- **所有数据加密**: 包括 secret value, token, policy, audit header
- **根 key 不存磁盘**: 来自 unseal (Shamir 拆分) 或 KMS
- **GCM 模式**: 加密 + 认证, 防篡改
- **性能开销**: ~5% (现代 CPU 有 AES-NI 指令集)

### Storage 抽象
```go
type Physical interface {
    Get(ctx context.Context, key string) (*Entry, error)
    Put(ctx context.Context, entry *Entry) error
    Delete(ctx context.Context, key string) error
    List(ctx context.Context, prefix string) ([]string, error)
}
```
- 统一接口: File/Consul/S3/GCS/Azure/DynamoDB
- Barrier 装饰: 每个 backend 都被加密层包装

---

## 专题 3：Seal/Unseal — 启动期密钥保护

### 设计动机
> 如果 Vault 内存永远有 root key, 攻击者拿到内存 dump = 拿到所有 secret.

**解法**: 启动时默认 Sealed, 必须输入 unseal 才能解密存储.

### Shamir 秘密共享
- 把 master key 拆成 N 个 shard (e.g. 5)
- 任意 K 个 (e.g. 3) 即可还原
- 单人持有不够, 需要多人协作
- 适合物理安全场景 (5 个 key 锁在不同保险箱)

### Auto-Unseal (KMS)
```
Vault 启动
  ↓
调 AWS KMS Decrypt
  ↓
拿到 master key
  ↓
自动 unseal
```
- **云上场景**: 不需要人介入
- **KMS 托管**: AWS/GCP/Azure/AliCloud 都支持
- **trade-off**: 信任云厂商 KMS

### 紧急 Seal
```bash
vault operator seal
```
- 立即清空内存中的 root key
- 重启后变回 Sealed 状态
- 怀疑入侵时第一时间调用

---

## 专题 4：Token + Policy 体系

### Token 类型
| 类型 | 父 | TTL | 场景 |
|------|----|----|------|
| Root | 无 | 无 | 初始化 |
| Service | Root | 长 | 服务身份 |
| Batch | Service | 短 | CI/CD |
| Periodic | Service | 滑动 | 长任务 |

### Token 生命周期
```
CreateToken(policies, ttl, parent)
  → TokenStore 生成 ID (PIndex hash)
  → Storage 持久化 (Barrier 加密)
  → 返回 token (hvs.xxxx)
  → 客户端使用
  → TTL 到期 / Revoke
```

### Policy 范式 (HCL)
```hcl
# 只读某路径
path "secret/data/app/*" {
  capabilities = ["read"]
}

# 限定 secret 字段
path "transit/encrypt/myapp" {
  capabilities = ["update"]
  allowed_parameters = {
    plaintext = ["value"]
  }
}
```

### 鉴权流程
```
X-Vault-Token: hvs.xxx
  → TokenStore.lookup() (LRU 缓存)
  → 解析 policies
  → ACL 检查 (path 匹配)
  → 放行/拒绝
```

---

## 专题 5：5 段必读代码逐段详解

### 5.1 `request_handling.go:HandleRequest` — 请求主路径
**关键**: auth → policy → route → audit 完整生命周期
- 解析 token → 验证身份
- 应用 policy → 鉴权
- 路由到 backend → 执行业务
- 写 audit → 不可绕过

### 5.2 `seal.go:Sealed()` — Seal/Unseal 状态机
**关键**: 默认 Sealed, Sealed 状态只允许 /sys/unseal
- atomic.Bool: 无锁状态切换
- 紧急 Seal: 立即清 root key
- Auto-unseal: 调 KMS 解封

### 5.3 `auth.go:TokenStore.lookupInternal` — Token 验证 + LRU
**关键**: 95% 命中 LRU, 跳过 storage IO
- 缓存键: token ID
- TTL=60s: 撤销延迟最多 1 分钟
- 父 token 链验证

### 5.4 `dynamic_secrets.go:CreateUser` — 动态 DB 凭证
**关键**: 每次生成新用户, TTL 到点自动 revoke
- CSPRNG 强密码
- RevokeSweeper 定期清理
- 返回后 client 立即用, 过期即失效

### 5.5 `audit_broker.go:Broker.LogRequest` — 审计分发
**关键**: Broker 多目的地 + 同步 + fallback
- 多个 audit backend 同时记录
- 失败不阻塞请求
- 全失败时落 fallback 文件, 防丢

---

## 专题 6：性能调优矩阵

### 部署侧
```bash
# 高可用: 3 节点集群 (Raft)
vault operator init -n 3
# 性能: 5 节点提升读吞吐 (standby 处理读)

# Auto-unseal: 减少手动
storage "raft" {
  seal "awskms" { ... }
}
```

### 性能调优
```hcl
# file audit 性能: 异步 + 批量
audit "file" {
  path = "/var/log/vault"
  mode = "0755"
}

# telemetry: 监控慢请求
telemetry {
  prometheus_retention_time = "10m"
  enable_hostname_label = true
}
```

### Token 调优
```bash
# 长期服务: 用 periodic token
vault token create -policy=app -period=24h -type=service

# 短期 CI: 用 batch token (轻量, 不存 storage)
vault token create -policy=ci -ttl=10m -type=batch
```

### 关键调优
- **token 缓存**: LRU 默认就够, 除非 > 100k token
- **policy 数量**: 控制在 100 以内, 太多查 ACL 慢
- **audit 落异步**: 同步会拖慢请求 1-10ms

---

## 专题 7：故障排查

### F1：Vault Sealed
```bash
# 症状: "Vault is sealed"
# 排查:
# 1. 启动后未 unseal
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
# 2. Auto-unseal 失败
#    看日志, 检查 KMS 权限
# 3. 物理存储不可达
vault status  # HA 模式
```

### F2：Permission Denied
```bash
# 症状: 403 / "permission denied"
# 排查:
# 1. Token 是否有 policy
vault token capabilities <token> secret/data/app
# 2. policy 是否正确
vault policy read app
# 3. 路径是否对 (kv v1 vs v2 路径不同)
```

### F3：Lease/Token 异常
```bash
# 症状: token 突然失效
# 排查:
# 1. token TTL
vault token lookup <token>
# 2. 父 token 是否被 revoke
vault token lookup -accessor <accessor>
# 3. max_ttl 限制 (service token 上限)
```

### F4：动态凭证无法登录
```bash
# 症状: 拿到的 DB 凭证连不上
# 排查:
# 1. 角色配置
vault read database/roles/myapp
# 2. DB 连接是否正常
vault write database/reset/myapp
# 3. GRANT 是否生效
#    手动用拿到的 user/pass 试连
```

### F5：审计丢失
```bash
# 症状: 看不到 audit
# 排查:
# 1. audit backend 状态
vault audit list
# 2. 文件权限
ls -la /var/log/vault
# 3. 推 SIEM: 检查 syslog/socket 配置
```

---

## 专题 8：复用模式

### 模式 A：Barrier 加密
**场景**: 任何"敏感数据本地存储"系统
- AES-GCM 加密所有落盘数据
- 启动期密钥保护 (Seal/Unseal)
- KMS 集成 (Auto-Unseal)
- 物理安全 + 加密双保险

### 模式 B：Audit Broker
**场景**: 任何需要合规审计的服务
- 多目的地同步分发
- 失败降级 (fallback)
- 脱敏 (敏感字段 hash)
- 格式化器抽象 (JSON/JSONx)

### 模式 C：插件化 Backend
**场景**: 多云、多协议适配
- 统一 interface (Physical/Logical/Auth)
- 内置 + 自定义 plugin
- 进程隔离 (hashicorp/go-plugin)
- 错误隔离 (1 个 plugin 挂不影响其他)

### 模式 D：动态凭证
**场景**: 任何"短期访问凭证"系统
- 凭证即服务 (Just-in-Time)
- TTL 自动清理
- 撤销链 (parent → child)
- 绑定角色 (role + 权限模板)

### 模式 E：Token 缓存
**场景**: 高频鉴权服务
- LRU 内存缓存
- TTL trade-off 撤销延迟
- 缓存穿透保护 (不存在的 token 不缓存)

---

## 专题 9：实战部署

### HA 集群 (3 节点)
```
┌────────────────────────────────────┐
│  Load Balancer (TCP 8200)          │
└─────┬──────────┬──────────┬────────┘
      ↓          ↓          ↓
   vault-1   vault-2   vault-3
   (Active)  (Standby) (Standby)
      │          │          │
      └──────────┴──────────┘
              Raft 共识
              KMS 解封
```

### Kubernetes 集成
```yaml
# vault-agent injector: 边车自动注入 token
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    metadata:
      annotations:
        vault.hashicorp.com/agent-inject: "true"
        vault.hashicorp.com/role: "myapp"
        vault.hashicorp.com/agent-inject-secret-db.txt: "database/creds/myapp"
```

### Transit 加密即服务
```bash
# App 调 Vault 加密敏感字段, 不需要自己存密钥
vault write transit/encrypt/myapp plaintext=$(base64 <<< "card_number")
# 返回 ciphertext, 存 DB
# 解密时: vault write transit/decrypt/myapp ciphertext=...
```

### Auto-Unseal (AWS KMS)
```hcl
seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/vault-unseal"
}
storage "raft" {
  path = "/var/lib/vault/data"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = false
}
```

### 灾备 / DR
- **异地多活**: 跨 region Raft 集群 (网络延迟敏感)
- **冷备**: 定期 snapshot + 异地恢复
- **恢复演练**: 季度一次, 验证备份

---

## 专题 10：Vault 让我重新思考的 5 件事

1. **动态凭证 > 静态密钥**。凭证即服务, 短生命周期 + 可追溯 = 安全.
2. **永不落明文**。Barrier 加密 + Seal/Unseal 双保险, 物理安全也扛得住.
3. **审计 = 合规命脉**。SOC2/PCI/HIPAA 都需要, 不是可选项.
4. **插件化是基础设施必备**。多云多协议, 统一接口让生态繁荣.
5. **KMS 托管 = Auto-Unseal**。云时代不再用 Shamir 拆钥匙, 信任云厂商 KMS.

---

## 🔗 进一步阅读

- 源码: https://github.com/hashicorp/vault
- 文档: https://developer.hashicorp.com/vault
- 教程: https://learn.hashicorp.com/vault
- 实战书: 《Production-Ready Microservices》《Security Engineering》
- 标准: SOC 2, PCI DSS, HIPAA, GDPR
- 类似项目: Keywhiz (Square), Lyft Confidant, AWS Secrets Manager

---

## 专题 11：Vault vs AWS Secrets Manager / GCP Secret Manager — 4 维深度对比

### 自托管 vs SaaS 的本质
```
                ┌──────────────────────────────────────┐
                │       合规/部署模式选择              │
                └──────────┬───────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ↓              ↓              ↓
        自托管          云厂商托管         平台托管
        (Vault)        (AWS SM)         (K8s Secrets)
            │              │              │
   优势: 跨云/合规/插件  优势: 零运维     优势: K8s 原生
   劣势: 运维复杂       劣势: 云锁定     劣势: 只静态
```

### 16 项详细对比表
| 维度 | Vault | AWS SM | GCP SM | K8s Secrets | 优势方 |
|------|-------|--------|--------|-------------|--------|
| 部署 | 自托管 | AWS 托管 | GCP 托管 | K8s 集群 | 看场景 |
| 动态凭证 | ✅ DB/AWS/GCP | ✅ RDS | ✅ Cloud SQL | ❌ | **Vault** |
| 加密即服务 | ✅ transit | ❌ | ❌ | ❌ | **Vault** |
| 多云 | ✅ 任意云 | ❌ AWS | ❌ GCP | ✅ 任意 | **Vault** |
| 审计 | ✅ Broker 多 | ✅ CloudTrail | ✅ Cloud Audit | ⚠️ K8s log | **Vault** |
| HA 集群 | ✅ Raft | ✅ (AWS) | ✅ (GCP) | ✅ (etcd) | 平手 |
| 跨 region 复制 | ✅ 手动 | ✅ 自动 | ✅ 自动 | ❌ | **云原生** |
| 启动期保护 | ✅ Seal/Unseal | ❌ | ❌ | ❌ | **Vault** |
| K8s 集成 | ✅ vault-agent | ✅ CSI driver | ❌ | ✅ 原生 | 平手 |
| 轮转密钥 | ✅ | ✅ 自动 | ✅ 自动 | ❌ | **云厂商** |
| 跨账号/项目 | ✅ ACL | ✅ IAM | ✅ IAM | ✅ RBAC | 平手 |
| 性能 (1k QPS P99) | 1-5ms | 5-20ms | 5-20ms | 1-3ms | 平手 |
| 运维成本 | 中-高 | 低 | 低 | 低 | **云厂商** |
| License | BUSL | 商业 | 商业 | Apache-2.0 | **K8s** |
| 文档质量 | 极详 | 详 | 详 | 中等 | 平手 |
| 生态插件 | 7 类 200+ | 主要 AWS 服务 | 主要 GCP 服务 | K8s 工具 | **Vault** |

### 决策树: 选 Vault 还是 AWS SM?
```
合规要求自托管 (数据不出境 / 金融监管)?
  ├── 是 → Vault
  └── 否
        │
        业务在单一云上 (只 AWS 或只 GCP)?
        ├── 是 → 云厂商 SM (零运维)
        └── 否 (多云 / 混合云)
              │
              需要动态 DB 凭证 / 加密即服务?
              ├── 是 → Vault
              └── 否 → 云厂商 SM
              │
              已经有 K8s 集群 + 不需要动态凭证?
              ├── 是 → K8s Secrets (基础够用)
              └── 否 → Vault
```

### 何时用 Vault + 云厂商 SM 组合
- **跨云 K8s 集群**: Vault 统一管, 云厂商 SM 备份
- **混合云**: Vault on-prem + AWS SM for AWS 部分
- **多团队**: Vault 统一, 各团队按 namespace 隔离

---

## 专题 12：Barrier 加密的密码学深度

### AES-256-GCM 加密栈
```
明文 secret value
  ↓
生成随机 12 byte nonce (96 bit, GCM 推荐)
  ↓
AES-256-GCM(key, nonce, plaintext, aad)
  │
  ├── 输出: ciphertext + 16 byte auth tag
  └── aad (Additional Authenticated Data): path + namespace
  ↓
存储格式: nonce || ciphertext || auth_tag
```

### 关键安全属性
- **机密性**: AES-256, 128 bit 安全级别 (量子安全到 2030+)
- **完整性**: GCM auth tag 防篡改 (1 bit 改动 → tag 校验失败)
- **认证**: aad 绑定 path, 防止"把 A 路径的密文搬到 B 路径解"
- **前向安全**: 每次 encrypt 用新 nonce, 老密文泄露不影响新 secret

### key 派生 (HKDF)
```
root key (32 byte)
  ↓
HKDF-SHA256(salt=path-prefix, info=context)
  ↓
derived key (per-context)
  │
  ├── encryption key  (32 byte)
  └── HMAC key        (32 byte, 用于 HMAC-AEAD 变体)
```
- **每个 context 一个 key**: 即使一个 context 的 key 泄露, 别的 context 不影响
- **context**: path namespace, 例: `secret/data/app/*` 用一个派生 key

### 性能开销
| 操作 | 无加密 | AES-GCM 加密 | 开销 |
|------|--------|------------|------|
| Put 1KB | 0.1ms | 0.12ms | +20% (软件) |
| Put 1KB + AES-NI | 0.1ms | 0.105ms | +5% (硬件) |
| Get 1KB | 0.05ms | 0.06ms | +20% |

**关键**: AES-NI 指令集 (现代 CPU 内置) 把加密开销降到 5%, 老 CPU 用 ARMv8 crypto 扩展同理。

### 密码学反模式 (Vault 都规避了)
- ❌ ECB 模式: 相同明文 → 相同密文, 暴露模式
- ❌ CBC + 固定 IV: IV 冲突 → 严重安全洞
- ❌ 自制 hash: 用 SHA-256 直接加密, 慢且不安全
- ❌ 静态 key: 永不变更, 一旦泄露全完
- ✅ Vault: GCM + 随机 nonce + HKDF 派生 + KMS 轮转

---

## 专题 13：Token 体系的 4 类对比 + 撤销链

### 4 类 Token 全景
| 类型 | 父 | 存储 | TTL | 场景 | 撤销延迟 |
|------|----|----|-----|------|----------|
| **Root** | 无 | storage | 无限 | 初始化 | 即时 |
| **Service** | Root | storage | 长 (24h+) | 服务身份 | 60s (LRU 缓存) |
| **Batch** | 无 | 不存 (加密嵌入 token) | 短 (≤10min) | CI/CD | 即时 (无缓存) |
| **Periodic** | Service | storage | 滑动 (24h+renew) | 长任务 | 60s |

### Token 结构
```
hvs.CAESI...  (Service Token, 加密存 storage)
hvb.eyJ...    (Batch Token, 自含, 不存 storage)
```
- **Service Token**: 加密存储, 支持撤销, 可查 ancestor/children
- **Batch Token**: 不存, 客户端持有所有 claims, 性能 10x 但撤销弱

### 撤销链 (Revocation)
```
root (hvs.AAAA)
  ├── child service (hvs.BBBB, parent=A)
  │     ├── batch (hvb.1111, parent=B)
  │     └── batch (hvb.2222, parent=B)
  └── child service (hvs.CCCC, parent=A)
```
- **撤销 root**: B/C/1111/2222 全部失效
- **撤销 B**: 1111/2222 失效, A/C 还在
- **撤销 1111**: 只有 1111 失效

### 实现: 树形索引
```go
// TokenStore 维护 parent → children 索引
type TokenStore struct {
    parentIndex map[string][]string  // parent ID → children IDs
}

// Revoke: 广度优先遍历, 全部失效
func (ts *TokenStore) Revoke(ctx, id) error {
    visited := map[string]bool{}
    queue := []string{id}
    for len(queue) > 0 {
        cur := queue[0]; queue = queue[1:]
        if visited[cur] { continue }
        visited[cur] = true
        ts.deleteToken(cur)
        queue = append(queue, ts.parentIndex[cur]...)
    }
    return nil
}
```

### 撤销链 + LRU 缓存的一致性
- LRU 缓存 60s TTL, 撤销时主动 Purge 缓存项
- 撤销时 broadcast 到所有 standby 节点 (HA 模式)
- 60s 是经验值, 可通过 `--cache-time` 调

---

## 专题 14：可观测性 — metrics/log/trace 3 件套

### 内置 metrics (Prometheus 格式)
```
vault_core_unsealed                # 当前 unseal 状态 (0/1)
vault_token_store_num_tokens       # 当前 token 数
vault_audit_log_request_count       # audit 写次数 (按 backend)
vault_audit_log_response_count
vault_barrier_put_count             # barrier 加密 put 次数
vault_barrier_get_count
vault_runtime_mem_alloc_bytes       # Go runtime 内存
vault_runtime_num_goroutine         # goroutine 数
vault_runtime_gc_pause_seconds      # GC 暂停
vault_lease_count_lease_aggregation # 当前活跃 lease 数
```

### 配置
```hcl
telemetry {
  prometheus_retention_time = "10m"
  enable_hostname_label     = true
  disable_hostname          = false
  enable_service_registration = true  # 推到 consul, K8s 自动发现
}
```

### 关键告警规则
```yaml
# Vault 异常重启 (3 分钟内 > 3 次)
- alert: VaultFrequentRestart
  expr: changes(vault_core_unsealed[3m]) > 3

# Audit 全部 backend 失败 (合规危机)
- alert: VaultAuditAllFailed
  expr: vault_audit_log_response_count{status="error"} > 0 and vault_audit_log_request_count == vault_audit_log_response_count{status="error"}

# Seal 状态变化 (重启 unseal 流程)
- alert: VaultSealed
  expr: vault_core_unsealed == 0

# Token 数量爆炸 (可能泄露)
- alert: VaultTokenCountAnomaly
  expr: vault_token_store_num_tokens > 50000
```

### 日志
- Vault 自身: stdout (JSON 格式, 配置 `log_level`)
- Audit: 单独路径或 syslog (合规要求独立)
- 关联: 每个请求有 `request_id`, 所有 log 共享, ELK 关联

### 链路追踪
- Vault 1.9+ 支持 OpenTelemetry trace
- 配置 `telemetry.usage_gauge_period` + OTel collector
- trace 包含: HTTP 接收 → token lookup → ACL → backend → audit

---

## 专题 15：5 段代码段串起来的完整请求生命周期

### 端到端时序图
```
客户端  HTTP  net/http  HandleRequest  TokenStore  ACL  Router  Backend  Audit  物理存储
  │       │       │           │            │        │     │       │       │        │
  │ POST /v1/secret/data/myapp            │        │     │       │       │        │
  │ X-Vault-Token: hvs.xxx                │        │     │       │       │        │
  │------>│       │           │            │        │     │       │       │        │
  │       │──────>│           │            │        │     │       │       │        │
  │       │       │──(1) 解析 path, find mount           │       │       │        │
  │       │       │           │            │        │     │       │       │        │
  │       │       │──(2) lookup token ────>│        │     │       │       │        │
  │       │       │           │<───hit LRU─┤        │     │       │       │        │
  │       │       │           │            │        │     │       │       │        │
  │       │       │──(3) check sealed ────>│        │     │       │       │        │
  │       │       │           │            │        │     │       │       │        │
  │       │       │──(4) ACL check ─────────────────>│     │       │       │        │
  │       │       │           │            │        │ OK  │       │       │        │
  │       │       │           │            │        │     │       │       │        │
  │       │       │──(5) route to backend ──────────────>│       │       │        │
  │       │       │           │            │        │     │       │       │        │
  │       │       │           │            │        │     │──(6) get secret──>│
  │       │       │           │            │        │     │       │       │   解密封 |
  │       │       │           │            │        │     │       │       │<─(7) 密文 |
  │       │       │           │            │        │     │       │       │  加密   │
  │       │       │           │            │        │     │       │       │        │
  │       │       │           │            │        │     │<─(8) plaintext──│
  │       │       │           │            │        │     │       │       │        │
  │       │       │           │            │        │     │──(9) audit log ─>│
  │       │       │           │            │        │     │       │       │  写 file |
  │       │       │           │            │        │     │       │       │        │
  │       │       │<─(10) 200 OK + json───│        │     │       │       │        │
  │       │<──────│           │            │        │     │       │       │        │
  │<──────│       │           │            │        │     │       │       │        │
```

### 关键时延点 (P99)
| 步骤 | 操作 | 延迟 |
|------|------|------|
| 1-3 | net/http + 解析 | ~0.1ms |
| 4 | token lookup (LRU 命中) | ~0.05ms |
| 5 | sealed 检查 (atomic) | ~0.001ms |
| 6 | ACL check (10 policy) | ~0.05ms |
| 7 | route 匹配 | ~0.01ms |
| 8 | backend.HandleRequest | ~1-5ms (含 DB IO) |
| 9 | audit 写 (3 backend) | ~1-10ms |
| 10 | 响应序列化 | ~0.5ms |
| **总计** | | **~3-16ms P99** |

### 异常路径 (permission denied)
- 步骤 4 ACL check fail → 直接返 403, 跳到 audit 写 403 事件
- 不调 backend, 不读物理存储
- 异常路径比成功路径快 (~1-2ms P99)

### 异常路径 (sealed)
- HandleRequest 顶部检查 sealed
- Sealed=true 且非 /sys/unseal → 直接 503
- 不进 token lookup, 不进 ACL
- 最快路径 (~0.1ms)

---

## 专题 16：Vault 让我重新思考的 5 件事 (再版)

1. **零信任 = 凭证即服务**。传统思维"密码存哪儿"是错的, 应是"凭证何时签发, 何时撤销"。动态凭证 + 短 TTL = 攻破窗口 < 1h。
2. **永不落明文是底线**。即使物理盘被偷, Barrier 加密 + Seal 保护仍能扛住。`Barrier` 抽象让任何 storage backend 都自动加密。
3. **审计 = 合规命脉, 不是可选项**。SOC2/PCI/HIPAA 都要求完整审计, 不做就过不了审计。Broker 多目的地 + 失败降级 = 至少 1 个 backend 成功 = 合规可达。
4. **物理安全 + 加密 + KMS 信任模型**。三选一都不够, 要组合: 物理隔离 (Shamir) + 加密 (AES-GCM) + KMS 托管 (Auto-Unseal)。
5. **插件化是基础设施核心**。Vault 的 7 类 backend (Physical/Logical/Auth/Audit/Credential/UI/Seal) 全插件化, 这是它生态繁荣的根因。每个 backend 独立编译, 互不影响。

---

## 专题 17：反模式与教训 (跨 5 项目累积视角)

### 反模式 1: Root token 长期使用
- **症状**: 工程师图方便, root token 写到 .env, 团队共用
- **后果**: 拿到 root = 拿到所有 secret + 任意 policy + 任意 backend
- **正解**: init 完立刻 revoke root, 走 service token + policy

### 反模式 2: Policy 写成 `"*"`
- **症状**: `path "*" { capabilities = ["sudo"] }`
- **后果**: 等于没写, 任何路径任何操作都行
- **正解**: 按最小权限, path 精确到 `secret/data/app/*` + capability 限定到 `read`

### 反模式 3: Audit log 落被审计的盘
- **症状**: Vault 盘 + audit log 同盘
- **后果**: 入侵者拿到 root + audit 一起删, 无迹可查
- **正解**: audit 推到 syslog / SIEM / 异地存储, 单向链路

### 反模式 4: 把 Vault 当 K8s 替代品
- **症状**: 把所有 K8s ConfigMap 迁到 Vault, 但 K8s 自身需要的 bootstrap secret (etcd TLS) 也在 Vault
- **后果**: Vault 不可达 → K8s 启动不起来 → 死锁
- **正解**: Vault 是 secrets as a service, 不是配置中心, K8s 原生 config 该用 ConfigMap 还在 ConfigMap

### 反模式 5: 1 个 Vault 集群管 1 万个 App
- **症状**: 1 个 Vault, 100 个 namespace, 1000 个 policy, 10000 个 token
- **后果**: ACL 检查 P99 从 0.05ms 恶化到 5ms+, audit 同步写卡死
- **正解**: 按业务拆分多集群, 或 enterprise 版启用 namespace + 性能隔离

### 7 步走避坑
```
D1: 装 dev 模式, 试 KV/DB/Transit 三种后端
D2: 写 1 个 policy + 1 个 service token, 走通鉴权
D3: 启用 audit (file + syslog), 验证请求都记录
D4: 部署 HA 3 节点 + Auto-Unseal (KMS)
D5: 集成 K8s auth + vault-agent 边车注入
D6: 写 1 个动态 DB 凭证, 验证 TTL 自动清理
D7: 跑 chaos: 断 1 节点, 验证 standby 接管
```

---

## 专题 18：跨项目引用 (从 Vault 视角看其他项目)

### Vault ↔ etcd
- **共性**: 都用 Raft 共识, 都涉及加密存储 (etcd TDE 类似 Vault Barrier)
- **差异**: Vault 是 secrets 专用, etcd 是通用 KV
- **集成**: Vault storage backend 可用 etcd, 但生产推荐 Raft (性能好, 少一层)

### Vault ↔ K8s
- **集成**: vault-agent 边车注入 secret 到 pod env
- **模式**: ServiceAccount → K8s auth method → 拿 token → 读 secret
- **替代**: External Secrets Operator (ESO) 把 Vault secret 同步到 K8s Secret

### Vault ↔ Prometheus
- **可观测**: Vault 内置 Prom metrics, scrape 即可
- **告警**: Seal 状态 / audit 失败 / token 数异常
- **联动**: Prom alertmanager 触发 vault operator seal (紧急断电)

### Vault ↔ ripgrep
- **场景**: 搜 secret 文件, 找硬编码 API key
- **命令**: `ag "password\s*=\s*['\"]" src/ | ag -l`
- **进阶**: ripgrep --json 配合 SIEM, 实时告警

### Vault ↔ Go
- **语言**: Vault 100% Go 写
- **复用**: atomic.Bool / context.Context / sync.Pool 都是 Vault 关键模式
- **学习**: Vault 是 Go 工业级项目典范, 适合学项目组织

---

## 🔗 进一步阅读

- 源码: https://github.com/hashicorp/vault
- 文档: https://developer.hashicorp.com/vault
- 教程: https://learn.hashicorp.com/vault
- 实战书: 《Production-Ready Microservices》《Security Engineering》《Zero Trust Networks》
- 标准: SOC 2, PCI DSS, HIPAA, GDPR, FedRAMP
- 类似项目: Keywhiz (Square), Lyft Confidant, AWS Secrets Manager, GCP Secret Manager
- Vault 1.15+ 新特性: 命名空间 (multi-tenancy), PKI 引擎, 秘密引擎 v2, KV v2 改进
- `deep-dive.md` 专题 1-18 完整覆盖
- `cheatsheet.md` 单页速查 (300 行)
- `code-snippets/` 5 段必读代码 (120-157 行/段)

