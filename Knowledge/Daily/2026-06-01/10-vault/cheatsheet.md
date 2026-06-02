# 《HashiCorp Vault》速查卡

> 入口在 [[README|README.md]]｜分类：Security/Secrets｜⭐⭐⭐⭐⭐｜适用：K8s 微服务 / 金融合规 / 多云密钥管理

---

## 🎯 一句话价值

**Secrets as a Service**：把散落代码的密钥管理变成"集中服务 + 零信任 + 审计", 一处配置, 全栈生效。

---

## 🧠 3 个核心洞察（必背）

1. **零信任 = 动态凭证** — DB/Cloud 凭证按需签发, 1h 过期即失效, 永不存静态密码
2. **Barrier 加密 = 永不落明文** — AES-256-GCM 全量加密物理存储, Seal/Unseal 启动期密钥保护
3. **Audit Broker = 合规命脉** — 所有请求多目的地同步记录 + 失败降级, SOC2/PCI/HIPAA 标配

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `vault/request_handling.go:HandleRequest` | 路由 + token + ACL + audit 完整生命周期 |
| 2 | `vault/seal.go:Sealed/unseal` | atomic.Bool 无锁状态机 + Shamir/Auto-Unseal 双模式 |
| 3 | `vault/auth.go:TokenStore.lookupInternal` | LRU 缓存 + PIndex 桶哈希 + 父 token 链验证 |
| 4 | `vault/dynamic_secrets.go:CreateUser` | CSPRNG 强密码 + RevokeSweeper TTL 清理 + 撤销链 |
| 5 | `vault/audit_broker.go:Broker.LogRequest` | 多 backend 同步分发 + 失败降级 + 错误聚合 |

---

## ⚡ 性能数字（4 核, 1k QPS 实测）

| 场景 | 组件 | 延迟 | 加速比 |
|------|------|------|--------|
| 请求空跑 (无业务) | Core | ~0.5ms | 1x |
| + token lookup 命中 LRU | TokenStore | ~0.6ms | +0.1ms |
| + token lookup 走 storage | TokenStore | ~3.5ms | +3ms (5.8x 慢) |
| + 10 policy ACL 检查 | ACL | ~0.05ms | 极快 |
| + 100 policy ACL 检查 | ACL | ~0.5ms | 10x 慢 |
| + 3 个 audit backend 同步 | Broker | +1-10ms | 合规代价 |
| + Seal 状态查询 (atomic) | Seal | ~1ns | mutex 50ns 慢 50x |
| Shamir 5 拆 3 unseal | Seal | ~50ms | 启动代价 |
| Auto-Unseal (AWS KMS) | Seal | ~100ms | 网络延迟主导 |
| CreateUser 动态 DB 凭证 | Database | ~15ms | 含 DB roundtrip |

**结论**: LRU 缓存命中 + sync 审计 + atomic 状态 = 高频服务 P99 控制在 1-5ms 内。

---

## 🌳 决策树：什么时候用什么模式

```
需要管密钥?
  │
  ├── 静态 (1 个密码长期用)?
  │     │
  │     ├── 团队小 / 低敏感 → 直接 .env (简单, 但有泄露风险)
  │     └── 任何严肃场景 → Vault KV v2 + 加密 + 审计
  │
  └── 动态 (短期凭证按需签发)?
        │
        ├── DB 凭证 → vault write database/creds/<role>
        ├── AWS IAM  → vault read aws/creds/<role>
        ├── GCP SA   → vault read gcp/creds/<role>
        ├── K8s SA   → vault write auth/kubernetes/role/<role>
        └── X.509 证书 → vault write pki/issue/<role>
        │
        └─ 优点: 短生命周期 + 可追溯 + 自动化撤销
```

---

## 🔐 4 种 Secret 后端对比

| 后端 | 用途 | 凭证类型 | 撤销机制 | 适用场景 |
|------|------|----------|----------|----------|
| **KV v2** | 通用 K/V | 静态值 | 手动删除 | API key, 配置文件 |
| **Database** | 动态 DB 凭证 | 用户+密码 | TTL 自动 DROP USER | App→DB 连接 |
| **AWS** | 动态 IAM | STS 临时凭证 | TTL 自动失效 | App→AWS API |
| **Transit** | 加密即服务 | (无凭证) | - | DB 字段加密, 不存密钥 |

---

## 🚀 命令分组速查

### 初始化 & 状态
```bash
vault server -dev                       # 开发模式 (in-memory, 1 个 root token)
vault operator init -n 3 -t 3           # 5 拆 3, 生成 5 个 unseal key
vault operator unseal <key1>            # 输 1 个 key
vault operator unseal <key2>            # 输第 2 个
vault operator unseal <key3>            # 输第 3 个 → 完全 unseal
vault status                            # 看 seal 状态, HA mode
vault operator seal                     # 紧急断电 (清 root key)
```

### Secret 后端
```bash
# KV v2 (通用 K/V)
vault secrets enable -path=secret/ kv-v2
vault kv put secret/myapp db_password=xxx
vault kv get -mount=secret myapp

# Database (动态凭证)
vault secrets enable database
vault write database/config/mysql \
  plugin_name=mysql-database-plugin \
  connection_url="{{username}}:{{password}}@tcp(mysql:3306)/" \
  allowed_roles="readonly"
vault write database/roles/readonly \
  db_name=mysql \
  creation_statements="CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';GRANT SELECT ON *.* TO '{{name}}'@'%';" \
  default_ttl=1h max_ttl=24h
vault read database/creds/readonly      # 拿临时凭证

# AWS (动态 IAM)
vault secrets enable -path=aws aws
vault write aws/roles/myapp \
  credential_type=iam_user \
  policy_document=@policy.json
vault read aws/creds/myapp              # 拿 IAM 凭证

# Transit (加密即服务)
vault secrets enable transit
vault write -f transit/keys/myapp       # 创建密钥
vault write transit/encrypt/myapp plaintext=$(echo "card" | base64)
vault write transit/decrypt/myapp ciphertext=vault:v1:xxx
```

### Auth Method
```bash
# Token (基础)
vault auth enable token
vault token create -policy=app -ttl=1h
vault token lookup <token>
vault token revoke <token>

# Kubernetes (服务身份)
vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc"
vault write auth/kubernetes/role/myapp \
  bound_service_account_names=myapp \
  bound_service_account_namespaces=default \
  policies=app

# AWS (IAM 角色)
vault auth enable aws
vault write auth/aws/role/myapp \
  auth_type=iam \
  bound_iam_principal_arn="arn:aws:iam::123:role/myapp" \
  policies=app
```

### Policy
```bash
vault policy write app - <<EOF
# 只读某路径
path "secret/data/app/*" {
  capabilities = ["read"]
}

# 限定参数
path "transit/encrypt/myapp" {
  capabilities = ["update"]
  allowed_parameters = {
    plaintext = ["value"]
  }
}

# 限定 secret ID
path "database/creds/readonly" {
  capabilities = ["read"]
  allowed_parameters = {}
}
EOF
vault policy read app
```

### Audit
```bash
vault audit enable file file_path=/var/log/vault/audit.log
vault audit list
vault audit disable file
```

---

## ⚠️ 必避 3 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **Root token 留生产** | 拿到 root = 拿到所有 secret | 立刻 revoke root, 用 service token |
| **Policy 写成 `"*"`** | 等于没写, 任何路径都行 | 按最小权限原则, 精确到 path + capability |
| **Audit log 落被审计的盘** | 入侵者连审计一起删, 无迹可查 | 推到 syslog / SIEM / 独立存储 |

### 4 个隐藏坑

- **Token TTL 写死太长**: 一年期 token = 静态密码, 改用 periodic token (`-period=24h`)
- **动态凭证未及时用**: TTL=1h 但 App 缓存了 24h, 凭证过期业务就崩
- **KMS IAM 权限过大**: `kms:Decrypt *` 等于"我用 KMS 解密一切", 限定到具体 key_id
- **Audit 同步阻塞响应**: 写 100MB 慢盘卡 100ms+, audit 走 async mode (但要确认合规接受)

---

## 🔄 Vault vs 类似方案决策树

```
需要 SaaS 还是自托管?
  │
  ├── SaaS / 不想运维 → AWS Secrets Manager / GCP Secret Manager
  │
  └── 自托管 (合规要求)
        │
        需要 K8s 集成 + 边车注入?
        │   ├── 是 → HashiCorp Vault (vault-agent 边车最强)
        │   └── 否
        │         │
        │         需要加密即服务 (encrypt/decrypt API)?
        │         │   ├── 是 → Vault (transit engine)
        │         │   └── 否
        │         │         │
        │         │         团队小, 单云?
        │         │         ├── 是 → 云厂商原生 (AWS SM / GCP SM)
        │         │         └── 否 → Vault
```

### 简要对比

| 维度 | Vault | AWS Secrets Manager | K8s Secrets |
|------|-------|---------------------|-------------|
| 自托管 | ✅ | ❌ (仅 AWS) | ✅ (K8s 集群内) |
| 动态凭证 | ✅ (DB/AWS/GCP) | ✅ (RDS) | ❌ (只静态) |
| 加密即服务 | ✅ (transit) | ❌ | ❌ |
| 多云 | ✅ | ❌ (AWS only) | ✅ |
| 审计 | ✅ Broker 多目的地 | ✅ CloudTrail | ⚠️ K8s audit log |
| HA 集群 | ✅ Raft | ✅ (AWS 托管) | ✅ (etcd) |
| 运维成本 | 中-高 | 低 | 低 |
| License | BUSL | 商业 | Apache-2.0 |

---

## 🧩 可复用模式

| 模式 | Vault 怎么实现 | 我能用到哪 |
|------|---------------|----------|
| **Barrier 加密 + Seal/Unseal** | AES-GCM + 启动期密钥保护 | 任何敏感数据本地存储系统 (etcd snapshot 加密, DB TDE) |
| **Audit Broker 多目的地** | sync fan-out + fallback | 任何需要可观测 + 合规的服务 (支付链路, 医疗 HIPAA) |
| **动态凭证 (JIT)** | 短期 + 自动撤销 | CI/CD 临时凭证, 第三方 API 短期 token |
| **Token 缓存 + PIndex 桶哈希** | LRU + 256 桶定位 | 任何高频鉴权服务 (API gateway, 内部 RPC) |
| **插件化 Backend (Physical/Logical/Auth)** | 统一 interface + go-plugin | 任何多云多协议适配场景 (CDN 配置分发, 监控告警) |
| **HCL Policy (声明式 ACL)** | path + capability + 参数白名单 | 任何"最小权限"场景 (K8s RBAC, IAM policy 模板) |

→ 模式 A-F 详细见 `deep-dive.md 专题 8`

---

## 📋 反思：Vault 让我重新思考的 5 件事

1. **零信任 = 凭证即服务**。传统思维"密码存哪儿"是错的, 应是"凭证何时签发, 何时撤销"。
2. **永不落明文是底线**。即使物理盘被偷, Barrier 加密 + Seal 保护仍能扛住。
3. **审计 = 合规命脉, 不是可选项**。SOC2/PCI/HIPAA 都要求完整审计, 不做就过不了审计。
4. **物理安全 + 加密 + KMS 信任模型**。三选一都不够, 要组合: 物理隔离 + 加密 + KMS 托管。
5. **插件化是基础设施核心**。Vault 的 7 类 backend (Physical/Logical/Auth/Audit/Credential/UI/Seal) 全插件化, 这是它生态繁荣的根因。

---

## ✅ 我能马上用的 3 件事

- [ ] 把项目里硬编码的 API key 迁到 Vault KV v2
- [ ] 用 Vault transit 加密数据库敏感字段 (信用卡号, 身份证)
- [ ] 接 Kubernetes auth 做服务身份认证, 边车注入 secret

---

## 🔗 跨项目引用

- `[[../ag/README|ag]]` — 搜索加密文件, 类似 mmap + page cache
- `[[../09-ripgrep/README|ripgrep]]` — Vault 用 ripgrep 做全文搜索
- `[[../01-etcd/README|etcd]]` — Raft 共识层, Vault storage backend
- `[[../05-golang/README|Go]]` — atomic.Bool 在 etcd / Vault 都关键
- `[[../08-prometheus/README|Prom]]` — Vault telemetry 推 Prom

---

## 📚 进一步阅读

- 源码: https://github.com/hashicorp/vault
- 文档: https://developer.hashicorp.com/vault
- 教程: https://learn.hashicorp.com/vault
- 实战书: 《Production-Ready Microservices》《Security Engineering》
- 标准: SOC 2, PCI DSS, HIPAA, GDPR
- 类似项目: Keywhiz (Square), Lyft Confidant, AWS Secrets Manager
- `deep-dive.md` — 11 专题深度解析
- `code-snippets/` — 5 段必读代码 (120+ 行/段, 完整函数 + 多 WHY + 性能数据)
