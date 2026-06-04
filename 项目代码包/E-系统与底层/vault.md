---
title: HashiCorp Vault
tags: [密钥管理, 安全, Secrets, 加密, 零信任]
---

# HashiCorp Vault

## 前言

**定位**：开源密钥管理和数据保护平台，2015 年由 HashiCorp 发布至今是云原生密钥管理的事实标准，与 AWS KMS/Azure Key Vault/Consul 构成 Secret 管理体系，处理过 100 万亿+ secrets 请求。

**核心价值**：
- 集中存储：所有密钥一处管理
- 动态密钥：按需生成 DB/云访问密钥
- 加密服务：即用即加密（Encryption as a Service）
- 审计：详细访问日志

**五大特性**：
1. **KV Store**：版本化键值存储
2. **动态密钥**：DB/AWS/SSH 临时凭据
3. **租约（Lease）**：自动过期回收
4. **策略（Policy）**：ACL 细粒度控制
5. **Audit Log**：完整访问记录

**对比表**：

| 维度 | Vault | AWS KMS | Azure Key Vault | Bitnami Sealed Secrets |
|---|---|---|---|---|
| 自托管 | ✅ | ❌ | ❌ | ✅ |
| 动态密钥 | ✅ | ⚠️ | ⚠️ | ❌ |
| 多云 | ✅ | AWS | Azure | ✅ |
| 复杂度 | 高 | 中 | 中 | 低 |
| 适合 | 多云/合规 | AWS 纯 | Azure 纯 | K8s 简单场景 |

## 思维导图

```mermaid
mindmap
  root((HashiCorp Vault))
    核心
      Secret
      Token
      Policy
      Lease
      Audit
    存储后端
      Consul
      Raft(集成)
      S3
      GCS
      Azure
      etcd
    Secret 引擎
      KV
      Database
      AWS
      PKI
      SSH
      Transit
      TOTP
    认证
      Token
      AppRole
      Kubernetes
      AWS
      LDAP
      Userpass
    策略
      ACL
      path
      capabilities
    动态密钥
      数据库
      AWS IAM
      GCP IAM
    Transit
      加密
      解密
      签名
    HA
      Raft
      Performance HA
      Disaster Recovery
    应用
      微服务
      K8s
      CI/CD
      数据库
    企业
      HCP Vault
      命名空间
      治理
```

## 关键代码

### 一、安装与启动

```bash
# 二进制
wget https://releases.hashicorp.com/vault/1.15.0/vault_1.15.0_linux_amd64.zip
unzip vault_1.15.0_linux_amd64.zip
sudo mv vault /usr/local/bin/

# 验证
vault --version

# 开发模式（内存存储）
vault server -dev
# Root Token: hvs.xxxxx

# 生产模式（需配置文件）
vault server -config=config.hcl
```

```hcl
# config.hcl
storage "raft" {
  path = "/vault/data"
  node_id = "node1"
}

listener "tcp" {
  address = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_cert_file = "/vault/tls/tls.crt"
  tls_key_file = "/vault/tls/tls.key"
}

api_addr = "https://vault.example.com:8200"
cluster_addr = "https://vault.example.com:8201"

ui = true

log_level = "info"
```

```bash
# 初始化（生产）
vault operator init
# 打印 5 个 unseal key + 1 个 root token
# 必须存好！

# 解封
vault operator unseal <key1>
vault operator unseal <key2>
vault operator unseal <key3>
```

### 二、KV 密钥存储

```bash
# 启用 KV
vault secrets enable -path=secret kv-v2

# 写入
vault kv put secret/myapp/config \
  db_host=db.example.com \
  db_user=admin \
  db_password=s3cret

# 读取
vault kv get secret/myapp/config
vault kv get -format=json secret/myapp/config

# 部分读取
vault kv get -field=db_password secret/myapp/config

# 列表
vault kv list secret/myapp

# 版本
vault kv get -version=2 secret/myapp/config

# 删除（软删除）
vault kv delete secret/myapp/config

# 销毁（不可恢复）
vault kv destroy -versions=2 secret/myapp/config

# 元数据
vault kv metadata get secret/myapp/config
```

```bash
# HTTP API
curl -H "X-Vault-Token: $VAULT_TOKEN" \
  http://localhost:8200/v1/secret/data/myapp/config
```

### 三、动态数据库凭据

```bash
# 启用数据库
vault secrets enable database

# 配置 PostgreSQL 连接
vault write database/config/mydb \
  plugin_name=postgresql-database-plugin \
  allowed_roles="readonly,readwrite" \
  connection_url="postgresql://{{username}}:{{password}}@db.example.com:5432/mydb" \
  username="vaultadmin" \
  password="adminpass"

# 创建角色
vault write database/roles/readonly \
  db_name=mydb \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" \
  max_ttl="24h"

# 获取动态凭据
vault read database/creds/readonly
# Key                Value
# ---                -----
# lease_id           database/creds/readonly/xxxxx
# lease_duration     1h
# lease_renewable    true
# password           A1a-xxxxxxxx
# username           v-token-readonly-xxxxx
```

```bash
# 续约
vault lease renew database/creds/readout/xxxxx

# 撤销（删除用户）
vault lease revoke database/creds/readonly/xxxxx
```

### 四、AWS 动态 IAM 凭据

```bash
# 启用 AWS
vault secrets enable aws

# 配置根凭据
vault write aws/config/root \
  access_key=$AWS_ACCESS_KEY \
  secret_key=$AWS_SECRET_KEY \
  region=us-east-1

# 角色
vault write aws/roles/my-app \
  credential_type=iam_user \
  policy_document=-<<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*"
    }
  ]
}
EOF

# 获取凭据
vault read aws/creds/my-app
```

### 五、Transit 加密即服务

```bash
# 启用 Transit
vault secrets enable transit

# 创建加密密钥
vault write -f transit/keys/myapp-data

# 加密
vault write transit/encrypt/myapp-data \
  plaintext=$(echo "secret message" | base64)
# 输出 ciphertext

# 解密
vault write transit/decrypt/myapp-data \
  ciphertext="vault:v1:xxxxx"

# 重新加密（轮转）
vault write transit/rewrap/myapp-data \
  ciphertext="vault:v1:xxxxx"

# 数据密钥包装（用于 envelope encryption）
vault write transit/wrap/myapp-data \
  plaintext=$(echo "DEK" | base64)
```

```python
# 应用代码调用 Transit
import hvac

client = hvac.Client(url='http://localhost:8200', token=VAULT_TOKEN)

# 加密
result = client.secrets.transit.encrypt_data(
    name='myapp-data',
    plaintext=base64.b64encode('secret'.encode()).decode()
)
ciphertext = result['data']['ciphertext']

# 解密
plaintext_b64 = client.secrets.transit.decrypt_data(
    name='myapp-data',
    ciphertext=ciphertext
)['data']['plaintext']
plaintext = base64.b64decode(plaintext_b64).decode()
```

### 六、策略（ACL）

```hcl
# policy-readonly.hcl
path "secret/data/myapp/*" {
  capabilities = ["read", "list"]
}

path "secret/metadata/myapp/*" {
  capabilities = ["list"]
}

# 禁止读取其他路径
path "secret/data/other/*" {
  capabilities = ["deny"]
}

# 动态数据库凭据
path "database/creds/readonly" {
  capabilities = ["read"]
}
```

```bash
# 应用策略
vault policy write readonly policy-readonly.hcl

# 关联到 token
vault token create -policy=readonly -ttl=1h

# 关联到 AppRole
vault write auth/approle/role/my-app \
  token_policies="readonly" \
  token_ttl=1h \
  token_max_ttl=4h
```

### 七、AppRole 认证

```bash
# 启用 AppRole
vault auth enable approle

# 创建角色
vault write auth/approle/role/my-app \
  token_policies="myapp-policy" \
  secret_id_ttl=24h \
  token_ttl=1h \
  token_max_ttl=4h

# 获取 role_id（明文）
vault read auth/approle/role/my-app/role-id

# 获取 secret_id（一次性）
vault write -f auth/approle/role/my-app/secret-id

# 应用使用
vault write auth/approle/login \
  role_id="xxxxx" \
  secret_id="yyyyy"
# 返回 client_token
```

```python
# 应用代码（Python hvac）
import hvac

client = hvac.Client(url='http://localhost:8200')

# 登录
response = client.auth.approle.login(
    role_id=os.environ['VAULT_ROLE_ID'],
    secret_id=os.environ['VAULT_SECRET_ID']
)
client.token = response['auth']['client_token']

# 读取密钥
secret = client.secrets.kv.v2.read_secret_version(
    path='myapp/config',
    mount_point='secret'
)
db_password = secret['data']['data']['db_password']
```

### 八、Kubernetes 认证

```bash
# 启用 K8s 认证
vault auth enable kubernetes

# 配置 K8s
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc"

# 创建角色
vault write auth/kubernetes/role/my-app \
  bound_service_account_names=my-app \
  bound_service_account_namespaces=production \
  policies=myapp-policy \
  ttl=1h

# 应用：使用 ServiceAccount 登录
```

```yaml
# application-deployment.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  namespace: production
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      serviceAccountName: my-app
      containers:
        - name: my-app
          image: my-app:1.0
          env:
            - name: VAULT_ADDR
              value: http://vault:8200
```

```python
# 应用：使用 K8s ServiceAccount Token 登录
import hvac

with open('/var/run/secrets/kubernetes.io/serviceaccount/token') as f:
    jwt = f.read()

client = hvac.Client(url='http://vault:8200')
response = client.auth.kubernetes.login(
    role='my-app',
    jwt=jwt
)
client.token = response['auth']['client_token']
```

```bash
# Vault Agent Sidecar 注入
# Vault Agent 自动登录并写入 secret 到文件
```

```hcl
# agent.hcl
auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role = "my-app"
    }
  }

  sink "file" {
    config = {
      path = "/home/vault/.token"
    }
  }
}

template {
  source = "/home/vault/template"
  destination = "/etc/secrets/db-creds"
}
```

### 九、审计日志

```bash
# 启用文件审计
vault audit enable file file_path=/vault/logs/audit.log

# 启用 syslog
vault audit enable syslog tag="vault"

# 查看审计设备
vault audit list

# 日志格式（JSON）
# {
#   "type": "request",
#   "time": "2026-06-04T...",
#   "path": "secret/data/myapp/config",
#   "operation": "read",
#   "client_token": "hvs.xxxxx",
#   "accessor": "xxxxx",
#   "policies": ["myapp-policy"]
# }
```

```bash
# 解析审计日志
cat audit.log | jq 'select(.path == "secret/data/myapp/config")'

# 告警异常访问
cat audit.log | jq 'select(.operation == "update" and .path | contains("aws"))' | \
  curl -X POST -d @- $SLACK_WEBHOOK
```

### 十、HA 与备份

```hcl
# HA 配置（Raft 集成存储）
storage "raft" {
  path = "/vault/data"
  node_id = "node1"

  retry_join {
    leader_api_addr = "https://node2.vault:8200"
    leader_ca_cert_file = "/vault/tls/ca.crt"
  }
  retry_join {
    leader_api_addr = "https://node3.vault:8200"
    leader_ca_cert_file = "/vault/tls/ca.crt"
  }
}

listener "tcp" {
  address = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"

  tls_cert_file = "/vault/tls/tls.crt"
  tls_key_file = "/vault/tls/tls.key"
}
```

```bash
# 初始化 HA 集群
vault operator init

# 加入集群（新节点）
vault operator raft join https://node1.vault:8200

# 查看集群
vault operator raft list-peers

# 备份 Raft 数据
vault operator raft snapshot save /backup/snapshot.bin

# 恢复
vault operator raft snapshot restore /backup/snapshot.bin
```

## 核心洞察

- **Vault 的"动态密钥"是核心创新**：vs 静态密钥泄露
- **Vault 的"租约（Lease）"是自动回收**：过期自动销毁
- **Vault 的"Transit"是加密即服务**：应用不直接接触密钥
- **Vault 的"策略（Policy）"是 ACL**：细粒度控制
- **Vault 的"AppRole"是服务认证**：取代长期 token
- **Vault 的"K8s 认证"是云原生集成**：ServiceAccount 登录
- **Vault 的"审计日志"是合规基础**：SOX/PCI/HIPAA
- **Vault 的"HA"用 Raft 共识**：3 节点起步
- **Vault 的"企业版"增加命名空间**：多租户隔离
- **Vault 与"Kubernetes"深度集成**：Vault Agent Sidecar
- **Vault 在"零信任"架构中是核心**：Never Trust, Always Verify
- **Vault 的"性能 HA"是读写分离**：主写从读
- **Vault 的"DR 复制"是灾备**：Performance Replication
- **Vault 的"开发模式"是测试利器**：dev server 内存存储

## 跨项目引用

- **[[linux]]**：Vault 跑在 Linux 上
- **[[docker]]**：Vault 官方 Docker 镜像
- **[[kubernetes]]**：K8s 认证 + Vault Agent
- **[[terraform]]**：Terraform 用 Vault 存敏感变量
- **[[ansible]]**：Ansible 从 Vault 读取密码
- **[[jenkins]]**：Jenkins 从 Vault 拉 secrets
- **[[github actions]]**：GitHub Actions OIDC + Vault
- **[[aws kms]]**：AWS KMS 是云厂商方案
- **[[consul]]**：Consul 可作 Vault 后端
- **[[etcd]]**：etcd 可作 Vault 后端
- **[[postgresql]]** / **[[mysql]]**：Vault 生成 DB 动态凭据
- **[[redis]]** / **[[rabbitmq]]**：Vault 存 Redis/RabbitMQ 密码
- **[[nginx]]**：Vault 动态生成 SSL 证书
- **[[pki]]**：Vault 内置 PKI 引擎
- **[[hashicorp]]**：HashiCorp 公司产品系列
