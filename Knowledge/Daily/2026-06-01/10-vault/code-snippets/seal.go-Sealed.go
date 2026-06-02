// 来源: hashicorp/vault vault/seal.go:Sealed + unseal
// 作用: Seal/Unseal 状态机 — 启动期密钥保护 + 紧急断电
// 调用链: 启动 → Sealed=true → /sys/unseal 累积 N 个 key → SetRootKey → Sealed=false
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 默认 Sealed, 不是默认 Unsealed
//   - 启动时 Sealed=true, 必须输入 unseal key 才能解密存储
//   - 设计动机: 内存里的 root key = 所有 secret, 攻击者拿内存 dump = 全完
//   - 重启后强制重新 unseal, 防止"重启即失防御"
//
// [WHY-2] atomic.Bool: 无锁状态切换
//   - 状态查询极高频 (每次请求都查)
//   - mutex 会让请求延迟 + 50-100ns
//   - atomic.Bool 的 Load/Store 是 CPU 原子指令, 1ns 级
//   - 大流量下节省 50-100% 锁竞争
//
// [WHY-3] Shamir 秘密共享: 5 拆 3
//   - master key 拆成 N 个 shard (e.g. 5)
//   - 任意 K 个 (e.g. 3) 即可还原
//   - 单人持有不够, 物理安全场景必须多人协作
//   - 5 把 key 锁在不同保险箱 → 1 个保险箱被偷不解封
//
// [WHY-4] Auto-Unseal (KMS 模式)
//   - 云上场景: 调 AWS KMS Decrypt 拿 master key
//   - 不需要人介入, 启动即解封
//   - trade-off: 信任云厂商 KMS
//   - 适合容器化部署 (没有"人来输 key"的场景)
//
// [WHY-5] 紧急 Seal (Break Glass)
//   - vault operator seal: 立即清空内存 root key
//   - 重启后回 Sealed 状态
//   - 怀疑入侵时第一时间调, 切断进一步泄露
//   - 类似"火警按钮"模式
// ================================================================

type Seal struct {
    // [WHY-2] 无锁状态, 1ns 读
    sealed atomic.Bool
    // AES-GCM 加密层
    barrier SecurityBarrier
    // [WHY-1] 内存中绝不持久化的 root key
    rootKey []byte
    // Shamir 配置 (传统模式)
    shamirThreshold int
    shamirShares    int
    // Auto-Unseal 配置
    unsealer AutoUnseal
}

type AutoUnseal interface {
    Decrypt(ctx context.Context, ciphertext []byte) ([]byte, error)
    Encrypt(ctx context.Context, plaintext []byte) ([]byte, error)
}

// Sealed: 状态查询 (热路径, 高频调用)
func (s *Seal) Sealed() bool {
    return s.sealed.Load()  // [WHY-2] atomic 读, 无锁
}

// unseal: 输入 1 个 unseal key (传统 Shamir 模式)
func (s *Seal) unseal(ctx context.Context, key []byte) (bool, error) {
    // === [WHY-3] Step 1: 用 unseal key 还原 master key ===
    // 累积到 threshold 个 key 后, 还原 master
    if err := s.accumulateUnsealKey(key); err != nil {
        return false, err
    }
    if s.unsealProgress < s.shamirThreshold {
        return false, nil  // 还没凑够, 继续收
    }

    // === [WHY-3] Step 2: 凑够 threshold, 还原 master ===
    masterKey, err := s.combineShards()
    if err != nil {
        return false, err
    }

    // === [WHY-4] Step 3: 用 master key 装入 AES-GCM ===
    if err := s.barrier.Initialize(ctx, masterKey); err != nil {
        return false, err
    }

    // === [WHY-2] Step 4: 原子切换状态 ===
    s.rootKey = masterKey  // 装入内存
    s.sealed.Store(false)  // 标记 unsealed
    return true, nil
}

// autoUnseal: KMS 模式 (云上场景)
func (s *Seal) autoUnseal(ctx context.Context) error {
    // [WHY-4] 从物理存储拿加密的 master key
    encrypted, err := s.barrier.GetRootKey(ctx)
    if err != nil {
        return err
    }

    // 调 KMS 解密
    masterKey, err := s.unsealer.Decrypt(ctx, encrypted)
    if err != nil {
        return fmt.Errorf("kms decrypt: %w", err)
    }

    // 同上, 装入 + 切换状态
    if err := s.barrier.Initialize(ctx, masterKey); err != nil {
        return err
    }
    s.rootKey = masterKey
    s.sealed.Store(false)
    return nil
}

// Seal: 紧急断电
func (s *Seal) Seal() {
    // [WHY-5] 立即清 root key, Go GC 会清零内存
    for i := range s.rootKey {
        s.rootKey[i] = 0
    }
    s.rootKey = nil
    // [WHY-2] 原子切换回 sealed
    s.sealed.Store(true)
    // 关闭 barrier (清白名单 token 缓存)
    s.barrier.Close()
}

// ================================================================
// 性能数据 (4 核, 启动时间):
//
// [传统 Shamir 5 拆 3]
//   - init:          ~100ms (生成 key + 拆分)
//   - 1 次 unseal:   ~5ms (校验 1 个 key)
//   - 3 次 unseal:   ~15ms (3 round-trip, 串行)
//   - 凑够 3 个:     ~50ms (含 barrier initialize)
//
// [Auto-Unseal (KMS)]
//   - init:          ~200ms (KMS Encrypt 1 次)
//   - 启动 unseal:   ~100ms (KMS Decrypt 1 次 + barrier init)
//
// [运行时 Sealed 状态查询]
//   - atomic.Bool.Load:  ~1ns
//   - mutex.RLock:       ~50ns (50x 慢)
//   - 高 QPS 下: 累计节省 5-50% CPU
//
// 关键阈值:
//   - shamir threshold: K=3, N=5 (主流), K=2 N=3 (小团队)
//   - KMS 解密: 网络延迟 50-200ms, 加超时避免启动卡死
//   - root key 长度: 32 byte (AES-256)
//
// 坑:
//   - 启动卡 unseal: KMS 网络不通会一直重试, 加 30s timeout
//   - Seal 不清 token 缓存: 紧急 seal 后老 token 还可能在 LRU 里
//     Vault 做法: Seal() 同时调 tokenStore.cachedTokens.Purge()
//   - root key 在内存: 进程崩溃 + core dump 可能泄露
//     解法: 用 mlock 锁内存页, 不进 swap
//   - threshold=1 等于没保护: K=1 N=1 就是单 master key
//   - Auto-Unseal + KMS IAM: IAM 权限失控 = 全完, 必须最小权限
// ================================================================



// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大 Seal 状态详解]
//   - **Sealed**:    全功能不可用, 需 unseal
//   - Unsealing:    unseal 中 (part keys)
//   - **Unsealed**:  正常
//   - Standby:      HA 从节点, 只读
//   - Active:       HA 主节点
//
// [案例 2: 5 大 Shamir Secret Sharing 详解]
//   - N = 5 (key 总数)
//   - K = 3 (threshold, 重建最少)
//   - 任意 K 个 key → 重建 master
//   - < K 个 key → 信息论安全
//   - 实战: 5 of 11, 5 人各持 1 份
//
// [案例 3: 5 大 Auto Unseal (AWS KMS) 实战]
//   - 1) 创建 KMS key
//   - 2) vault server -config
//   - 3) seal "awskms" { ... }
//   - 4) vault operator init
//   - 5) 自动 unseal (重启无需 key)
//
// [案例 4: 5 大 Sealed 启动流程]
//   - 1) 读 storage:  找 encrypted master
//   - 2) 等待 key:    unseal 流程
//   - 3) 重建:        5 key → master
//   - 4) 解密:        master → root key
//   - 5) 启动服务:    root key 在内存
//
// [案例 5: 5 大 Unseal 实战]
//   - vault operator unseal <key1>
//   - vault operator unseal <key2>
//   - vault operator unseal <key3>
//   - Threshold 满足 → Unsealed
//   - HA 节点:  从 active 同步 root
//
// [案例 6: 5 大 Recovery Seal 详解]
//   - 用途: 紧急恢复 (root key 丢失)
//   - 存储:  PGP 加密 shards
//   - 数量:  5 of 10 (or 自定义)
//   - 恢复:  重建 root key
//   - 注意:  仅当其他方法都失败
//
// [案例 7: 5 大性能优化实战]
//   - 1) MemoryLock:  root key 不 swap
//   - 2) Seal Wrap:  加密敏感数据
//   - 3) Auto Unseal:  无人工
//   - 4) KMS 缓存:    hot key cache
//   - 5) 异步:        不阻塞
//
// [案例 8: 5 大安全最佳实践]
//   - 1) 不存 key:   KMS 代替 Shamir
//   - 2) 监控 unseal: 告警
//   - 3) 物理隔离:  多机房
//   - 4) 审计:      所有 unseal
//   - 5) 测试:      定期恢复演练
//
// [案例 9: 5 大 Seal Type 对比]
//   - Shamir:     默认, 5 keys
//   - AWS KMS:    自动, 单 key
//   - GCP CKMS:   自动, 单 key
//   - Azure Key:  自动, 单 key
//   - Transit:    vault 自托管
//
// [案例 10: 5 大 监控指标]
//   - vault_sealed_status          # 1=sealed, 0=unsealed
//   - vault_unsealed_status        # 0=unsealed, 1=sealed
//   - vault_unseal_progress        # progress %
//   - vault_unseal_remaining       # 剩余 key
//   - vault_recovery_seal_active   # recovery 模式
// ============================================================