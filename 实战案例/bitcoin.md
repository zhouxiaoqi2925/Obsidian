# bitcoin - 比特币全节点参考实现，10 万亿美元网络的"代码即规范"工程

**GitHub**: bitcoin/bitcoin
**Star**: 85k+
**语言**: C++20
**主题**: 区块链/P2P/共识/UTXO/SHA-256/secp256k1
**适用场景**: 学习工业级 C++ 长期演化项目；理解 P2P 网络+共识+钱包三层架构；研究分布式系统不变量

## 第一段：基础范式

### 模式 1：5 层洋葱分层（kernel → node → wallet → qt → ipc）

**问题场景**：百万行 C++ 项目里，"共识规则"和"状态机"混在一起，导致任何修改都要小心硬分叉风险。
**解决方案**：物理分层 + 独立编译单元。kernel/ 是无状态纯函数，node/ 是有状态机，wallet/ 是私域，qt/ 是 GUI，ipc/ 是多进程通信。v22 之后已发布 libbitcoinkernel.so 单独链接。
**关键参数**：
- kernel/ 17 个 .cpp，consensus/ 包含 tx_check/tx_verify/merkle 纯函数
- node/ 包含 mempool/blockstorage/peerman/txdownloadman
- ipc/ 用 libmultiprocess + CapnProto 跨进程通信
- wallet/ 用 BerkeleyDB/SQLite 私域存储
**最佳实践**：把"无状态纯函数"和"有全局状态的状态机"分目录+分链接单元；任何规则引擎/编译器项目都该照抄。

### 模式 2：cs_main 全局锁 + Clang Thread Safety Analysis

**问题场景**：百万行 C++ 高并发代码，靠运行时 TryLock 调试数据竞争，bug 留到 prod。
**解决方案**：粗粒度 cs_main（RecursiveMutex）+ 编译期 EXCLUSIVE_LOCKS_REQUIRED 注解。Clang TSA 在编译时告诉你"这里没拿锁就访问了被保护变量"。
**关键参数**：
- src/sync.h 暴露 AnnotatedMixin/UniqueLock/AssertLockHeld 宏
- 所有"破坏链状态"的入口必须拿 cs_main
- 编译器级别拦截 80% 数据竞争
- GlobalMutex 类型别名标注"全局 mutex 特殊处理"
**最佳实践**：粗粒度锁+编译期校验 > 细粒度锁+运行时校验；接受吞吐换可读性。

### 模式 3：共识纯函数化（consensus/ 全是无状态）

**问题场景**：共识规则改了就是硬分叉，团队需要"快速回放 bug 修复"。
**解决方案**：consensus/ 下 tx_check.cpp/tx_verify.cpp/merkle.cpp 全部是纯函数，输入 Tx/Block，输出 bool + TxValidationState。
**关键参数**：
- 无外部依赖，可独立 fuzz
- 形式化验证可行
- 2020 CVE-2018-17144 修复（inflation bug）靠此分层快速回放
- 与 validation.cpp 物理隔离
**最佳实践**：把"规则定义"从"状态机"剥离，让规则能被独立测试、fuzz、形式化验证。

### 模式 4：UTXO 模型 + LevelDB/RocksDB 双存储

**问题场景**：账户模型扩容困难，余额计算要扫全表。
**解决方案**：UTXO（未花费交易输出）模型，每笔交易显式消费 inputs + 创建 outputs，状态 = 集合。
**关键参数**：
- LevelDB 存 block index（链状态）
- RocksDB 存 UTXO set（~10GB）
- validation.cpp 处理 ConnectBlock/DisconnectBlock
- CoinStatsView 提供快速余额统计
**最佳实践**：用"显式状态机"代替"隐式余额计算"，让状态变更可审计、可回滚。

### 模式 5：P2P 网络 + 隐私路由（addrman + Tor/I2P）

**问题场景**：比特币节点全网可达，但单节点需要保护隐私。
**解决方案**：addrman 管理地址簿 + 严格 IP 分类 + 内置 Tor/I2P 支持 + GetLocal 按网络接口分层。
**关键参数**：
- net.cpp 4000+ 行，AddAddrFetch/GetListenPort/GetLocal
- DNS seeds 引导（seed.bitcoin.sipa.be）
- banman 维护黑名单
- headerssync 加速 IBD
**最佳实践**：P2P 节点默认开 Tor/I2P，地址簿分层管理避免泄露拓扑。

## 第二段：扩展范式

### 模式 6：脚本解释器 + BIP62/66/146 严格校验

**问题场景**：脚本签名有"负零"、DER 编码不一致、可锻性等历史坑。
**解决方案**：script/interpreter.cpp 2000+ 行实现 CastToBool/IsValidSignatureEncoding/IsLowDERSignature，每条规则都有 BIP 编号锁定。
**关键参数**：
- CastToBool({0x00, 0x80}) 必须返回 false（BIP62 负零）
- IsValidSignatureEncoding 拒绝 length 字段不一致的 DER
- IsLowDERSignature 强制 S ≤ 阶的一半（BIP146 防可锻）
- 全用自带 secp256k1，不用 OpenSSL
**最佳实践**：拒绝任何"看起来对但有 corner case"的实现；每条规则都对应一个 BIP 编号 + 测试用例。

### 模式 7：确定性 fuzz（libFuzzer + AFL + 200+ 目标）

**问题场景**：二进制 P2P 协议易被恶意输入攻击，单元测试覆盖不全。
**解决方案**：test/fuzz/ 下 200+ fuzz 目标，配合 FuzzedDataProvider 把 RPC 调用随机化，每个 PR 跑 24h fuzz 才允许合并。
**关键参数**：
- libFuzzer + AFL 双引擎
- 200+ fuzz 目标覆盖序列化/解析/共识
- 持续集成跑 24h
- corpus 用真实链数据
**最佳实践**：用 fuzz 替代"想到的边界 case"；fuzz 时间越长覆盖率越高。

### 模式 8：mempool + TxGraph 替代 mapNextTx

**问题场景**：祖先/后代查询 O(N) 扫整张 mempool，高峰 30k+ 交易时卡顿。
**解决方案**：v28 起 mempool 用 TxGraph 维护 cluster-local DAG，GetAncestors 平均 O(1)，trim 用堆而非全扫。
**关键参数**：
- txmempool.cpp UpdateTransactionsFromBlock 重写数据平面
- cluster 限制（防止单笔大交易阻塞）
- API 不变，内部实现替换
- 编译期 graph 验证
**最佳实践**：小改动+大收益；重写数据平面时保持 API 兼容。

### 模式 9：写盘策略 50-70min constexpr 区间

**问题场景**：全网节点同步写盘导致 IBD 流量尖刺。
**解决方案**：DATABASE_WRITE_INTERVAL_MIN{50min}/MAX{70min}，随机化避免 cohort 同步。
**关键参数**：
- 注释明示"防止网络随时间同步成 cohort"
- 10 万亿美元网络的运维常识
- 编译期 constexpr 锁死
- 配合 leveldb write batch
**最佳实践**：分布式系统的"集体行为"靠随机化去同步化。

### 模式 10：BIP 流程（文本编号提案 + 多实现互操作）

**问题场景**：协议升级靠"在公司 Confluence 写 RFC"难以被外部实现采纳。
**解决方案**：BIP（Bitcoin Improvement Proposal）流程——任何变更写 BIP，编号 1-500+，bip-0039/bip-0032/bip-0340 等成为行业标准。
**关键参数**：
- 仓库 bitcoin/bips 公开
- 状态：Draft/Proposed/Final/Replaced
- 多实现互操作测试
- 治理靠开发者共识而非投票
**最佳实践**：任何协议升级（TLS/QUIC/HTTP/3）都该用"文本编号提案 + 多实现互操作"流程。

## 第三段：进阶范式

### 模式 11：libbitcoinkernel.so + libmultiprocess 进程隔离

**问题场景**：钱包进程被攻击 = 私钥泄露；GUI 进程崩溃 = 节点下线。
**解决方案**：v26 起 libmultiprocess + CapnProto 落地，bitcoin-qt 可独立进程跑，钱包进程可远程。
**关键参数**：
- IPC 走 CapnProto（比 JSON 快 10x）
- libbitcoinkernel.so 单独发布
- wallet 进程可独立升级
- 攻击面物理隔离
**最佳实践**：把"高权限模块"（钱包）和"网络模块"（节点）拆成独立进程。

### 模式 12：Clang IWYU + Thread Safety + Tidy 三件套

**问题场景**：C++ 头文件依赖混乱，include 顺序导致编译慢，潜在未声明依赖。
**解决方案**：强制 IWYU（Include What You Use）+ Clang-Tidy + Thread Safety Analysis，编译期 1 分钟跑全量。
**关键参数**：
- CI 跑 IWYU 校验
- Clang-Tidy 检查未使用 include
- TSA 注解强制锁规则
- 全量 < 1 分钟
**最佳实践**：C++ 项目必须配 IWYU + Clang-Tidy，把头文件依赖变成显式契约。

### 模式 13：CAPnProto + Boost + Qt6 + SQLite/BerkeleyDB 依赖组合

**问题场景**：如何选 C++ 后端依赖？
**解决方案**：Boost（标准库补全）+ libevent（事件循环）+ Qt6（GUI）+ SQLite/BerkeleyDB（钱包）+ CapnProto（IPC）+ secp256k1（加密）。
**关键参数**：
- 全部 BSD/MIT/CC0，无 GPL 污染
- 拒绝 OpenSSL 共识路径（历史 bug）
- Boost 1.81+ 是基线
- 子模块方式集成
**最佳实践**：选依赖要拒绝任何有"政治风险"的协议（GPL/AGPL）。

### 模式 14：deterministic builds（gitian + docker）

**问题场景**：多人编译产物哈希不一致，供应链被劫持风险。
**解决方案**：gitian-builder + docker，多人编译产物哈希一致。
**关键参数**：
- 固定 toolchain 版本
- 固定时间戳（SOURCE_DATE_EPOCH）
- 多人交叉验证哈希
- 用于 release 签名
**最佳实践**：C/C++/Rust 项目都该做 deterministic builds，让 release 哈希可被外部验证。

### 模式 15：6 个月 PR review 节奏

**问题场景**：仓促合并导致硬分叉风险。
**解决方案**：Bitcoin Core 的 review 节奏是 6-12 个月，PR 必须可拆 + 测试必须写 + 文档必须更新。
**关键参数**：
- PR_TEMPLATE.md 要求测试计划 + Backport 标签
- 600+ 贡献者分布式审查
- 共识变更需 1 年 review + 6 个月激活窗口
- 6 个月合并 = 质量保障
**最佳实践**：用"慢节奏"过滤"急躁合并"；重要项目宁可慢不可错。

## 第四段：实战范式

### 模式 16：regtest 5 分钟启动 + 0 美元回归测试

**问题场景**：测试网太慢、mainnet 风险大、mock 又不真实。
**解决方案**：regtest 模式 1 分钟启动，bitcoin-cli 创世 + 挖矿 + 验证一条龙。
**关键参数**：
```bash
echo "regtest=1" > ~/.bitcoin/bitcoin.conf
bitcoind -daemon=0 -printtoconsole
bitcoin-cli -regtest createwallet test
bitcoin-cli -regtest generatetoaddress 1 $(bitcoin-cli -regtest getnewaddress)
```
**最佳实践**：任何状态机系统都该有"regtest 模式"；1 秒出块，5 分钟跑完端到端。

### 模式 17：JSON-RPC + ZMQ 通知 + REST 三件套

**问题场景**：钱包/区块/交易事件如何推给外部订阅者？
**解决方案**：JSON-RPC（同步查询）+ ZMQ（pubhashblock/pubrawtx 推送）+ REST（轻客户端）。
**关键参数**：
- ZMQ 端口独立配置
- pubhashblock 推送区块哈希
- pubrawtx 推送原始交易
- 外部 Esplora/Sparrow 订阅
**最佳实践**：同步查询用 RPC，事件推送用 Pub/Sub，二者分工。

### 模式 18：Pruning 模式 + UTXO 全量

**问题场景**：全节点要 1TB SSD，普通用户门槛高。
**解决方案**：prune=N 模式只保留最近 N MB 区块，UTXO 永远全量。
**关键参数**：
- prune=550（最小模式）省 99% 空间
- UTXO set ~10GB 不可裁
- 老区块可重新从 P2P 下载
- 适合 SPV-like 场景
**最佳实践**：分层存储——热数据全量、冷数据可裁。

### 模式 19：USDT Tracepoint + 严格 constexpr

**问题场景**：线上问题难追，缺少低开销探针。
**解决方案**：TRACEPOINT_SEMAPHORE(net, closed_connection) 是 USDT-style 探针，热路径开销 <1ns，可被 bpftrace/eBPF 抓取。
**关键参数**：
- 每个时间窗口都是 constexpr auto XXX{50min}
- 每个新功能都加 TRACEPOINT_SEMAPHORE
- 探针对热路径无影响
- 10 年后回看代码仍能秒级追问题
**最佳实践**：用"常量锁定运维策略"+ "探针无侵入追踪"。

### 模式 20：16 年 + 0 次硬分叉因代码 bug

**问题场景**：百万行 C++ 改一行就是分叉。
**解决方案**：共识破坏 = 软分叉 = 死。每个共识改动都有 6-12 个月 review，2018 漏洞被静默修复未上线。
**关键参数**：
- 注释里大量写"THIS IS CONSENSUS-CRITICAL"
- 改一个字节 = 6 千万美元市值节点都得改
- 接收 bug 报告 → 静默修复 → 60 天后公开
- 16 年 + 5 万 commit + 0 硬分叉事故
**最佳实践**：用"协议破坏 = 灾难"反向约束变更节奏。

## 关键代码段

```cpp
// src/sync.h:128-149 — 锁的"宪法"
class AnnotatedMixin {
    Mutex m_mutex;
public:
    UniqueLock lock() EXCLUSIVE_LOCK_FUNCTION(m_mutex) {
        return UniqueLock(m_mutex);
    }
};

// src/script/interpreter.cpp:46-59 — CastToBool 负零判断
bool CastToBool(const std::vector<unsigned char>& vch) {
    for (int i = 0; i < vch.size(); i++) {
        if (vch[i] != 0) {
            if (i == vch.size() - 1 && vch[i] == 0x80) return false; // 负零
            return true;
        }
    }
    return false;
}
```

## 必偷 3 件

1. **Clang Thread Safety Analysis 注解全套**（`EXCLUSIVE_LOCKS_REQUIRED` / `LOCKS_EXCLUDED` / `AssertLockHeld`）：任何 C++ 高并发项目应立刻照抄，编译期消除 80% 数据竞争。
2. **`kernel/ 与 node/ 物理分层**：把"无状态纯函数"和"有全局状态的状态机"分目录+分链接单元。哪怕你的项目不是区块链，规则引擎/编译器也用得上。
3. **Tracepoint 探针 + 严格 constexpr 常量**：每个时间窗口都是 `constexpr auto XXX{50min}`，每个新功能都加 `TRACEPOINT_SEMAPHORE`。10 年后回看代码，依然能秒级追问题。

## 必避 3 坑

1. **6401 行的 god file**（`validation.cpp`）：从第一行就拒绝；超过 1000 行就该考虑拆。
2. **全局 `RecursiveMutex`**：能拆就拆；拆不动也要让 `cs_main` 命名曝光在所有函数签名上。
3. **"MIT + 600 贡献者"当挡箭牌**：Bitcoin Core 的 review 节奏是 6-12 个月，我们没有这个预算。
