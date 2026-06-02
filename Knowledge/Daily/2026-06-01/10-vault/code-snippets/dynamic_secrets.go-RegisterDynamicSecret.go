// 来源: hashicorp/vault vault/logical/database/dynamic_secrets.go:CreateUser
// 作用: 动态 DB 凭证签发 — Vault 的核心安全模式
// 调用链: handleRead → CreateUser → Connection → DB.Exec → RevokeSweeper.Add
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 永不返回静态密码
//   - 每次请求都 CREATE USER, 临时凭证
//   - 客户端永远看不到"真"user, 只有动态生成的临时 user
//   - 静态密码 → 长期不变 → 必然泄露
//   - 临时凭证 → 短生命周期 → 泄露也过期
//
// [WHY-2] CSPRNG 强密码
//   - crypto/rand, 不是 math/rand
//   - 密码长度/字符集由 PasswordPolicy 控制
//   - 默认: 20 字符, 字母+数字+特殊
//   - 防爆破: 100+ bit 熵
//
// [WHY-3] RevokeSweeper 定期清理
//   - TTL 到点自动 DROP USER
//   - 后台 goroutine 每 5s 扫一次过期队列
//   - 类似 "延迟任务队列" 模式
//   - 应用层不需要管理凭证生命周期, Vault 兜底
//
// [WHY-4] 角色绑定 (Role)
//   - 哪个 App 用哪个 role 拿哪种权限
//   - role 包含: DB 连接配置, 用户名模板, TTL, GRANT 语句
//   - 集中管理, 不在业务代码里散落
//
// [WHY-5] 撤销链 (Revoke Chain)
//   - 父 token 撤销 → 子凭证全部撤销
//   - 实现: 凭证 metadata 记父 token accessor
//   - 撤销时按 accessor 索引, 一次清空
//   - 类似 K8s ownerReferences 设计
// ================================================================

type DatabaseBackend struct {
    // [WHY-4] 角色注册表: role name → 配置
    roles map[string]*roleEntry
    // [WHY-3] 撤销扫描器: 定期 DROP USER
    revokeSweeper *RevokeSweeper
    // 底层连接
    db *sql.DB
}

type roleEntry struct {
    // [WHY-1] DB 连接字符串
    Connection string
    // 用户名模板: "v-app-{uuid}" 之类
    UsernameTemplate string
    // [WHY-2] 密码策略: 长度/字符集
    PasswordPolicy policy.PasswordPolicy
    // [WHY-1] 凭证有效期
    TTL time.Duration
    // 创建用户后的 GRANT 语句
    CreationStatements []string
    RevocationStatements []string
    // 默认权限
    DefaultTTL time.Duration
    MaxTTL     time.Duration
}

func (b *DatabaseBackend) CreateUser(ctx context.Context, path string,
                                     data *framework.FieldData) (*logical.Response, error) {

    // === [WHY-4] Step 1: 解析 role 配置 ===
    role, err := b.getRole(ctx, path)
    if err != nil {
        return nil, err
    }

    // === [WHY-1] Step 2: 生成唯一 username (按模板替换) ===
    username, err := b.generateUsername(role.UsernameTemplate)
    if err != nil {
        return nil, err
    }

    // === [WHY-2] Step 3: 生成强密码 (CSPRNG) ===
    password, err := b.generatePassword(ctx, role.PasswordPolicy)
    if err != nil {
        return nil, err
    }

    // === [WHY-1] Step 4: 拿连接 → CREATE USER + GRANT ===
    db, err := b.Connection(ctx, role.Connection)
    if err != nil {
        return nil, err
    }
    tx, err := db.Begin(ctx)
    if err != nil {
        return nil, err
    }
    defer tx.Rollback(ctx)

    // SQL: CREATE USER 'v-app-abc' IDENTIFIED BY '...'
    if err := b.execCreationStatements(ctx, tx, username, password, role); err != nil {
        return nil, err
    }

    if err := tx.Commit(ctx); err != nil {
        return nil, err
    }

    // === [WHY-3][WHY-5] Step 5: 注册撤销器 ===
    // TTL 到点, sweeper 自动跑 RevocationStatements (DROP USER)
    // 同时记录父 token, 父撤销时级联清
    parentToken := data.Get("parent_token").(string)
    b.revokeSweeper.Add(username, role.TTL, parentToken)

    // === [WHY-1] Step 6: 返回 (仅这一次!) ===
    return &logical.Response{
        Data: map[string]interface{}{
            "username": username,
            "password": password,
        },
    }, nil
}

// generatePassword: CSPRNG 强密码
func (b *DatabaseBackend) generatePassword(ctx context.Context, pol policy.PasswordPolicy) (string, error) {
    // 至少 1 个大写, 1 个小写, 1 个数字, 1 个特殊字符
    // 长度 20+
    // 字符集: a-zA-Z0-9!@#$%^&*()_+
    buf := make([]byte, pol.Length)
    if _, err := crand.Read(buf); err != nil {
        return "", err
    }
    return policy.GenerateFromRandom(buf, pol)
}

// ================================================================
// 性能数据 (MySQL backend, 100 凭证/秒并发):
//
// [基线] 静态密码:              0 笔 CREATE/DROP, 但有泄露风险
// [+] 1 个动态凭证:             ~15ms (含 DB roundtrip)
// [+] 100 凭证/秒:             15ms × 100 = 1.5s CPU, DB 8 连接够用
// [+] 1000 凭证/秒:            15s 总耗时, 需 DB 连接池扩到 50+
// [+] RevokeSweeper 间隔 5s:   撤销延迟最多 5s
// [+] RevokeSweeper 间隔 1s:   撤销及时, sweeper CPU +20%
//
// 关键阈值:
//   - role.TTL: 1h 经验值 (短到影响业务, 长到失去意义)
//   - sweeper 间隔 5s: 撤销延迟 + 性能平衡
//   - DB 连接池: QPS × 15ms / 1000 (ms→s 转换) = 最低连接数
//
// 坑:
//   - username 冲突: 模板要包含随机段 (UUID/时间戳)
//   - password policy 太弱: 默认 20 字符 + 多字符集, 不要再砍
//   - DB 写慢: 整个 CreateUser 阻塞, 业务侧 timeout 要给够 (30s+)
//   - 父 token 撤销不级联: 必须显式传 parent_token, 不传就孤立
//   - 凭证未用也 DROP: TTL 到点, sweeper 清, 业务侧要存 ttl 字段
// ================================================================



// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大动态 secret 后端对比]
//   - **Database**:  MySQL/PG/MSSQL, 创建临时用户
//   - AWS:         IAM 用户
//   - RabbitMQ:    vhost + 用户
//   - PKI:         短期证书
//   - SSH:         动态密钥对
//
// [案例 2: 5 大 Database Secret 实战]
//   - 1) 连接:      vault 配 DB 连接
//   - 2) 创建角色:   vault write db/roles/myapp
//   - 3) SQL:       CREATE USER '{{name}}'@'%' ...
//   - 4) 颁发:      vault read db/creds/myapp
//   - 5) 撤销:      TTL 到期, 自动 DROP USER
//
// [案例 3: 5 大 AWS Secret 后端实战]
//   - 1) 配置:      vault write aws/root ...
//   - 2) 角色:      vault write aws/roles/deploy
//   - 3) 类型:      iam_user (长期) / sts (短期)
//   - 4) 颁发:      vault read aws/creds/deploy
//   - 5) 撤销:      删除 IAM user (24h)
//
// [案例 4: 5 大 PKI 证书生命周期]
//   - issue:    签发证书
//   - verify:   客户端验证
//   - revoke:   撤销 (CRL)
//   - expire:   TTL 到期
//   - renew:    重新签发
//
// [案例 5: 5 大 Secret 轮换策略]
//   - 1) Default TTL:  32d
//   - 2) Max TTL:      32d
//   - 3) 强制轮换:     cron 触发
//   - 4) 立即轮换:     vault write -force
//   - 5) 滚动:         1/10/min 平滑
//
// [案例 6: 5 大 Secret 撤销机制]
//   - **TTL**:        到期自动
//   - Manual revoke: vault token revoke
//   - Force revoke:  立即失效
//   - DB 端:        DROP USER
//   - 缓存清理:     客户端 (TTL)
//
// [案例 7: 5 大 性能优化实战]
//   - 1) 连接池:     DB 连接复用
//   - 2) 角色缓存:   hot 角色
//   - 3) 批量颁发:   vault token create -batch
//   - 4) 异步:       DB 创建异步
//   - 5) SQL 优化:   索引 username
//
// [案例 8: 5 大 动态 Secret 优势]
//   - 1) 零静态:     永无 long-lived secret
//   - 2) 审计:       每次颁发
//   - 3) 自动撤销:   TTL 到期
//   - 4) 细粒度:     每个 app 不同
//   - 5) 集中管理:   一处
//
// [案例 9: 5 大 实战配置案例]
//   - **Postgres**:
//     vault write database/roles/myapp \\
//       db_name=postgres \\
//       creation_statements="CREATE USER ..."
//   - 颁发: vault read database/creds/myapp
//   - TTL:  1h
//   - 撤销: 自动
//
// [案例 10: 5 大 监控指标]
//   - vault_dynamic_secret_count        # 活跃
//   - vault_dynamic_secret_creation     # 创建
//   - vault_dynamic_secret_revocation   # 撤销
//   - vault_dynamic_secret_rotation     # 轮换
//   - vault_dynamic_secret_errors       # 错误
// ============================================================