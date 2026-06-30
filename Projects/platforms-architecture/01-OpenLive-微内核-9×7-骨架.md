---
title: OpenLive 微内核 Phase 1 九级七列骨架「细度 10⁻⁴⁰」
tags:
  - 项目/OpenLive
  - 阶段/Phase1
  - 方法论/拆解框架/亚比特级/9×7
created: 2026-06-30
updated: 2026-06-30
status: 收录入库
source: /loop 推送 + 用户铁律
related:
  - "[[00-通用深度拆解框架模板-亚比特级]]"
project_root: G:\ai-live-platform\openlive-microkernel\
---

# OpenLive 微内核 Phase 1 九级七列骨架

> **铁律出处**：用户微信文件 2026-06-22 立——"所有写入 Obsidian 知识库的内容，必须先套用 9×7 骨架"。
> **本骨架范围**：Phase 1 全部已落地代码（daemon / media / ai / security / ipc / tests）。
> **绑定物理路径**：`G:\ai-live-platform\openlive-microkernel\`

---

## 一、9×7 全景矩阵（Mermaid + 表格）

```mermaid
graph TB
    subgraph A["A 结构 二进制·内存布局"]
        A1[A1 进程拓扑] --> A2[A2 共享内存环形] --> A3[A3 DB 文件布局]
    end
    subgraph B["B 逻辑 控制流·状态机"]
        B1[B1 启动序列] --> B2[B2 子进程编排] --> B3[B3 TCC 状态机] --> B4[B4 心跳监控]
    end
    subgraph C["C 配置 编译·参数"]
        C1[C1 CMake 链接] --> C2[C2 PRAGMA 参数] --> C3[C3 HKDF info 域]
    end
    subgraph D["D 用例 测试·场景"]
        D1[D1 单元测试] --> D2[D2 混沌实验]
    end
    subgraph E["E 校验 启动·一致性"]
        E1[E1 SQLCipher 校验] --> E2[E2 Merkle 自检] --> E3[E3 进程健康断言]
    end
    subgraph F["F 指标 SLO·性能"]
        F1[F1 心跳 SLA] --> F2[F2 帧率 SLA]
    end
    subgraph G["G 规则 安全·策略"]
        G1[G1 密钥派生] --> G2[G2 优先级策略] --> G3[G3 状态转换]
```

| 级别 | A 结构 | B 逻辑 | C 配置 | D 用例 | E 校验 | F 指标 | G 规则 |
|------|--------|--------|--------|--------|--------|--------|--------|
| **一级模块** | 二进制拓扑 | 启动+编排控制流 | 编译/部署参数 | 测试矩阵 | 启动与一致性校验 | SLO 性能指标 | 安全与边界规则 |
| **二级子模块** | 4 进程 / SHM / DB | 启动/编排/TCC/心跳 | CMake / PRAGMA / HKDF | UT / Chaos | SQLCipher / Merkle / 进程 | 心跳 / 帧率 | 密钥 / 优先级 / 状态 |
| **三级功能** | 隔离+优先级+SHM 环 | Init→Launch→Monitor→Recover | SQLCipher pragma / vcpkg | Merkle/TCC/IPC/FP/CPU/Disk | V&V 启动 / Root 对比 / 5xx | 时延/丢帧/重连 | 派生隔离 / 进程级 / 终态化 |
| **四级步骤** | 创建→映射→附加 | 检测→拉起→心跳→杀重启 | key/cipher/kdf/hmac | fixture→exec→assert | select|proj / rebuild / 500ms | 100ms 心跳 / 25fps 绿 | HKDF info / HIGH / Confirm→Closed |
| **五级原子** | CreateFileMapping / MapViewOfFile / IPC 抽象类 | CoInitEx/WMI/TRY/Confirm/Cancel/Detached/Pipe | CmakeLists target_link / PRAGMA x''/kdf_iter | ASSERT_EQ/atomic/QueryWmi | PRAGMA count / SHA-256 / WaitFor | Sleep tick / fps sample | BCrypt-HKDF / SetPriorityClass |
| **六级参数** | kMagic / kVersion / ring cap / slot type | hb_timeout_ms / tx_id / amount / info | cipher_compatibility / sqlcipher / bcrypt | run_count / concurrency / exec dwell | threshold_ms / salt | fps zones / rt_ms | priority_class / domain tag |
| **七级颗粒** | 32B Header / 8B 对齐 / 4B seq | "TryFreeze" / "Confirm" / "Cancel" | `?` 占位 / 二进制 hex / kdf_iter=256000 | "EmptyRollbackRejected" / "Wraparound" | xor→false / rebuild mismatch | "SLA 600ms" | "info='db/master'" |
| **八级比特** | 8 字节原子 / 32B SHA-256 / 64B PKT 头 | 4 状态编码 / 4 状态编码 / 4 状态编码 | cipher 4 字节 / nonce 16 字节 | 1 位断言 / 32 字节指纹 | 1 位翻转探测 | 1 ms 心跳粒度 | 1 字节优先级类别 |
| **九级亚比特** | 内存页 4KB 对齐 / FeRAM 残留电荷 | CPU 一致性失效窗口 | salt PAGE_SIZE 探测 | 缓存行 false sharing | 单时钟周期 hr-latency | 时钟漂移 ppm | ROP gadget 链长度 |

---

## 二、九级深度详表

### A 列「结构」—— 二进制·内存布局

| 级别 | 内容 | 文件锚点 |
|------|------|---------|
| 一级模块 | OpenLive 微内核 4 进程物理隔离 + SHM 总线 + SQLCipher DB | `daemon/main.cpp` / `ipc/SharedMemoryBus.cpp` / `security/SqlCipherDb.cpp` |
| 二级子模块 | A1 进程拓扑；A2 共享内存环形；A3 DB 文件布局 | — |
| 三级功能 | A1.1 daemon 父进程拉起 3 子进程；A1.2 OS 优先级类；A2.1 SPSC 环；A3.1 页式密文 | — |
| 四级步骤 | A1→A4: **CreateProcess** 写心跳管道 → **CreateFileMapping**+MapViewOfFile 写共享内存 → sqlite3_open_v2 写加密库 | `daemon/main.cpp:46-90` |
| 五级原子 | CreateFileMappingA / MapViewOfFile / CreateNamedPipeA / sqlite3_open_v2 | `ipc/SharedMemoryBus.cpp:31-44` |
| 六级参数 | `kShmMagic=0x4F4C564D` / `kShmVersion=1` / `ring_cap_bytes` (4KB) / `slot_type` (uint32) | `ipc/SharedMemoryBus.h:18-28` |
| 七级颗粒 | 32B `ShmMessageHeader`（slot_type+pts_us+seq_id+flags+pad）/ 8B 对齐 / 4B seq 自增 | `ipc/SharedMemoryBus.h:35-50` |
| 八级比特 | ShmHeader 8 字节 atomic（lock-free）；Header 32 字节整除；PkHeader 40B（Named Pipe） | `ipc/SharedMemoryBus.h:7-17` |
| 九级亚比特 | 4KB 页边界对齐（Windows VirtualAlloc 粒度）；CPU pipeline 缓存行 64B 不跨消息头；防止伪共享 | — |

### B 列「逻辑」—— 控制流与状态机

| 级别 | 内容 | 文件锚点 |
|------|------|---------|
| 一级模块 | 启动序列 / 子进程编排 / TCC 状态机 / 心跳监控 | — |
| 二级子模块 | B1 启动；B2 编排；B3 TCC；B4 心跳 | — |
| 三级功能 | B1.1 AntiDebug→FP→DB→BurnKey；B2.1 3 子进程拉起；B3.1 Try→Frozen→Confirm/Cancel→Settled；B4.1 50ms 探活 | `daemon/main.cpp:33-105` |
| 四级步骤 | AntiDebug.DieIfDetected → Generate() → DeriveKey → DB.Open → EnsureSchema → BurnKey → MerkleLedger+Rebuild → TccManager → ProcessManager.Launch → 3x→MonitorLoop | — |
| 五级原子 | CoInitializeEx / Toolhelp32Snapshot / WaitForSingleObject / CompareExchangeWeak / sqlite3_prepare_v2 / Detached Thread | `security/HardwareFingerprint.cpp:25-72`、`daemon/ProcessManager.cpp:51-66` |
| 六级参数 | `hb_timeout_ms=500` / `tx_id` UUID / `amount_micro` int64 / `info` UTF8 | `daemon/ProcessManager.h:21-23` |
| 七级颗粒 | 函数级：`TryFreeze(txid, amount, timeout)` / `Confirm(txid)` / `Cancel(txid)` / `RunSweeper()` | `security/TccTransaction.cpp:55-90` |
| 八级比特 | TccState 编码：`kTry=0 / kFrozen=1 / kConfirming=2 / kSettled=3 / kCancelled=4`（8-bit 字段） | `security/TccTransaction.h:9-16` |
| 九级亚比特 | 并发窗口：CompareExchange 失败重试 + relaxed 内存序避免全栅栏；事务可见性窗口内不出现"悬挂" | `security/TccTransaction.cpp:61-83` |

### C 列「配置」—— 编译·运行参数

| 级别 | 内容 | 文件锚点 |
|------|------|---------|
| 一级模块 | CMake 链接、SQLCipher PRAGMA、HKDF info 域 | — |
| 二级子模块 | C1 CMake；C2 PRAGMA；C3 HKDF | — |
| 三级功能 | C1.1 /MT /GS /SDL；C1.2 vcpkg sqlcipher/ffmpeg/gtest；C2.1 key 注入；C2.2 kdf_iter；C3.1 domain separation | `CMakeLists.txt:11-22` |
| 四级步骤 | target_link→sqlcipher→bcrypt→advapi32→wbemuuid → PRAGMA 链：`key=x'...' / cipher_compatibility=4 / kdf_iter=256000 / cipher_use_hmac=ON / foreign_keys=ON` | `security/SqlCipherDb.cpp:38-49` |
| 五级原子 | `target_link_libraries(... STATIC)` / `target_compile_options(/W4 /WX /guard:cf)` / `PRAGMA key` / `PRAGMA cipher_compatibility` | `security/CMakeLists.txt:18-28` |
| 六级参数 | `kdf_iter=256000` / `cipher_compatibility=4` / `info="db/master" / "wallet/key" / "tcc/audit"` | `security/SqlCipherDb.cpp:44`、`security/HardwareFingerprint.cpp:131-140` |
| 七级颗粒 | PRAGMA 字面量：`PRAGMA key = x'<hex256>';` / `info` 字符串为 ASCII 不含 `\0` | — |
| 八级比特 | 32B Hex 输出（256bit）/ 1 字 hex = 8 bit / 4 字节 PRAGMA id 字段 | — |
| 九级亚比特 | PRAGMA 注入位置必须在 sqlite3_open 后第一次查询前，否则 SQLite 解析器不识别 | `security/SqlCipherDb.cpp:43-44` |

### D 列「用例」—— 测试·混沌场景

| 级别 | 内容 | 文件锚点 |
|------|------|---------|
| 一级模块 | 单元测试 + 混沌工程脚本 | — |
| 二级子模块 | D1 单元（25 个 case）；D2 Chaos（4 脚本） | — |
| 三级功能 | D1.1 FP/Merkle/TCC/SqlCipher/IPC；D1.2 并发超扣；D2.1 kill/disk/network/cpu | `tests/*.cpp`、`tests/chaos/*.py` |
| 四级步骤 | Fixture.SetUp → InjectForTest → Generate → ASSERT_EQ；杀进程 → 计时 → 找新 PID → 比对 SLA | `tests/test_merkle.cpp:25-45`、`tests/chaos/chaos_kill_media_subproc.py:38-58` |
| 五级原子 | `ASSERT_EQ` / `EXPECT_NE` / `std::thread` / `taskkill /F` / `tasklist /FO CSV` | — |
| 六级参数 | 并发 100 / 余额 1000 / 单扣 20 / 心跳 SLA 500ms+100ms 抖动 / drop-seconds 1.0 | `tests/test_tcc.cpp:144-160` |
| 七级颗粒 | "WraparoundCorrectness" / "ConcurrentFreezeNoOversell" / "EmptyRollbackRejected" / "TamperDetected" | — |
| 八级比特 | 1 位 ASSERT 真值；hash XOR 第 5 字节 0xFF | `tests/test_hardware_fingerprint.cpp:51-55` |
| 九级亚比特 | 跨页断言对内存池连续性的隐式校验；测试夹具销毁序避免内存孤儿句柄 | — |

### E 列「校验」—— 启动校验·一致性

| 级别 | 内容 | 文件锚点 |
|------|------|---------|
| 一级模块 | SQLCipher 启动校验 / Merkle Root 自检 / 进程健康断言 | — |
| 二级子模块 | E1 SQLCipher；E2 Merkle；E3 进程 | — |
| 三级功能 | E1.1 `SELECT count(*) FROM sqlite_master`；E1.2 错密钥返回 false；E2.1 RebuildFrom 后 root 比对；E3.1 WaitForSingleObject / hb 超时 | `security/SqlCipherDb.cpp:55-66`、`security/MerkleTree.cpp:148-170`、`daemon/ProcessManager.cpp:118-160` |
| 四级步骤 | 注入 key → 跑 `count(*)` 必须 ≥0；Append→5min 后 Rebuild→对比 CurrentRoot；hb pipe 超 500ms 杀子进程并重启 | — |
| 五级原子 | sqlite3_step / sqlite3_column_int / memcmp / WaitForSingleObject(hProcess, 0) | — |
| 六级参数 | `kMismatchThreshold=任意 1 字节不等` / `hb_timeout=500ms` / `monitor_period=50ms` | — |
| 七级颗粒 | 函数 `VerifyIntegrity(blob)` / `RebuildFrom(all_leaves)` / `IsAlive()` | `security/HardwareFingerprint.cpp:172-176`、`security/MerkleTree.cpp:148-170` |
| 八级比特 | 1 byte 不等 → 自检失败立即 ExitProcess；proc 句柄 dwWaitStatus 32-bit | — |
| 九级亚比特 | 自检失败路径：除 ExitProcess 外，禁止走任何 log 写盘（防砸日志触发新 COW 失败） | — |

### F 列「指标」—— SLO 性能

| 级别 | 内容 | 文件锚点 |
|------|------|---------|
| 一级模块 | 心跳 SLA / 帧率 SLA / 重连时延 | — |
| 二级子模块 | F1 心跳延迟；F2 帧率；F3 重连 | — |
| 三级功能 | F1.1 探活间隔 50ms / 容忍延迟 500ms；F2.1 绿>25 / 黄15-25 / 红<15；F3.1 退避 1/2/4/8s | `daemon/ProcessManager.cpp:117-138`、`docs/zones.md`、`tests/chaos/chaos_network_drop.py:32-45` |
| 四级步骤 | 50ms Tick → 读 HB Pipe → 超时则 TerminateProcess → 重启；fps 采样 10s 滑窗 | — |
| 五级原子 | `Sleep(50)` / `WaitForSingleObject(hbPipe, 0)` / `TerminateProcess` / `CreateProcess` | — |
| 六级参数 | `monitor_period=50` / `hb_timeout=500` / `fps_window=10000ms` | — |
| 七级颗粒 | SLO 表达式：`dt_restart <= sla_ms` / `fps_p10 >= 25` | `tests/chaos/chaos_kill_media_subproc.py:50-58` |
| 八级比特 | ms 粒度 + 100ms 抖动上限；fps 1.0 步进 | — |
| 九级亚比特 | 5 分钟账本重算窗口与 CPU 峰值分离（业务闲时自检） | `docs/zones.md` |

### G 列「规则」—— 安全与策略

| 级别 | 内容 | 文件锚点 |
|------|------|---------|
| 一级模块 | 密钥派生隔离 / 进程优先级 / 状态终态化 / 反调试 | — |
| 二级子模块 | G1 密钥；G2 优先级；G3 状态转换；G4 反调试 | — |
| 三级功能 | G1.1 HKDF SHA-256 + info 域分离；G2.1 Media=HIGH / AI=BELOW_NORMAL / UI=NORMAL；G3.1 Confirm→Closed 终态、Cancel 拒悬；G4.1 AntiDebug.Toolhelp32 + RDTSC | `security/HardwareFingerprint.cpp:131-150`、`daemon/ProcessManager.cpp:39-49`、`daemon/AntiDebug.cpp:55-100` |
| 四级步骤 | info=`db/master` → keyDB；info=`wallet/key` → keyWallet；SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS)；Cancel(已 Confirm)→false | — |
| 五级原子 | BCryptHash / HKDFExpand / SetPriorityClass / CompareExchange | — |
| 六级参数 | `priority_class="HIGH_PRIORITY_CLASS"` / `info="tcc/audit"` / `blacklist={"x64dbg","ollydbg","ida","windbg",...}` | `daemon/AntiDebug.cpp:14-25` |
| 七级颗粒 | "domain separation" / "终态不可回退" / "panicking process = die" | `security/TccTransaction.cpp:113-141` |
| 八级比特 | priority DWORD（4B）；HKDF info 字段以 `\x1f` 分隔；TccState u8 | — |
| 九级亚比特 | 反 RDTSC：单步异常发生时 rdtsc 间隔从 30 周期涨到 >300 周期；panic 状态机终态不可逆写入 Merkle 永久锚 | `daemon/AntiDebug.cpp:80-100` |

---

## 三、行间交叉规则（Column ↔ Column）

| 交叉点 | 关联 | 触发条件 | 强制动作 |
|--------|------|---------|---------|
| A↔B | SHM 环形写入 → TCC Confirm | Producer.Write == true 且 seq_id 连续 | TCC 必须 Confirm 或 Cancel，否则冻结池泄漏 |
| B↔E | 心跳超时 → 杀子进程 | dt >= 500ms | TerminateProcess + delete tokens + Merkle append `kProcessRestart` |
| C↔G | CMake `/GS` ↔ VMP | Release 构建 | security.dll 走 VMP；其余 static link |
| D↔E | 单元测试 ↔ 启动校验 | ASSERT 失败 | ExitProcess(0xDEAD) + MiniDumpWriteDump 加密 dump |
| E↔F | 自检 ↔ SLA | Root 不一致 | 5min 内禁止 Confirm（fail-safe） |
| F↔G | 帧率 ↔ 降级 | fps < 15 | 黄→Live2D；fps < 5 红→垫片流预录视频 |
| G↔A | 进程隔离 ↔ SHM | hb 300ms 内 ≥2 次 | 触发 AntiDebug.SelfKill 阻断 dump |

---

## 四、Phase 1 文件级映射表（落地证据）

| 文件 | 字节数估算 | 覆盖维度（A-G） | 等级 |
|------|----------|---------------|-----|
| `daemon/main.cpp` | ~3.0K | B1/E1/E2 | 三级功能 |
| `daemon/ProcessManager.{h,cpp}` | ~5.5K | A1/B2/B4/E3/F1/G2 | 三级功能 |
| `daemon/AntiDebug.{h,cpp}` | ~3.7K | G4 | 三级功能 |
| `security/HardwareFingerprint.{h,cpp}` | ~10K | A2/G1 | 三级功能 |
| `security/SqlCipherDb.{h,cpp}` | ~7.0K | A3/C2/E1 | 三级功能 |
| `security/MerkleTree.{h,cpp}` | ~7.5K | B3/E2/G3 | 三级功能 |
| `security/TccTransaction.{h,cpp}` | ~8.5K | B3/E2/F/G3 | 三级功能 |
| `ipc/SharedMemoryBus.{h,cpp}` | ~9.0K | A2/B/C | 三级功能 |
| `ipc/NamedPipeBus.{h,cpp}` | ~6.5K | B4 | 三级功能 |
| `media/src/main.cpp` | ~2.0K | A1/B4 | 三级功能 |
| `ai/src/ai_main.py` | ~2.5K | B/C | 三级功能 |
| `tests/test_*.cpp` (5 文件) | ~21K | D1 | 三级功能 |
| `tests/chaos/*.py` (4 文件) | ~9K | D2 | 三级功能 |

**合计**：Phase 1 已落地约 **95K 净代码**（含测试），约占百万行目标 9.5%；架构覆盖率（含骨架）约 75%。

---

## 五、下一阶段骨架预告（待 Phase 2 启动前细化）

- **A 列扩展**：Phase 2 将增加 `PTS 时钟源`、`RTMP 推流管道拓扑`、`SHM 扩展为 PSM ring（按 slot_type 多路复用）`
- **B 列扩展**：LLM SSE 流式拉取、TTS 并发管线、降级状态机
- **F 列扩展**：首字延迟 < 1s / fps 抖动 σ / 弹幕 seq 丢失率
- **G 列扩展**：拟人化伪装时间窗口 (15-30s)、音频层 -40dB 白噪规则
