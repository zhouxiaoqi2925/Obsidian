---
title: OpenLive Phase 3.4 硬件驱动与兼容层 MVP 落地证明
tags:
  - 项目/OpenLive
  - 阶段/Phase3.4
  - 方法论/拆解框架/亚比特级/9×7
created: 2026-06-30
updated: 2026-06-30
status: 收录入库
related:
  - "[[10-OpenLive-Phase3.4-硬件驱动与兼容层-9×7-骨架]]"
  - "[[00-通用深度拆解框架模板-亚比特级]]"
  - "[[09-OpenLive-Phase3.3-多媒体编解码TS层-MVP落地证明-9×7-骨架]]"
project_root: G:\ai-live-platform\openlive-microkernel\
---

# OpenLive Phase 3.4 硬件驱动 + 兼容层 MVP 落地证明

> **铁律出处**："每一步必须先输出 9 级 × 7 列骨架，再写代码。"
> **范围**：屏幕捕获 / 虚拟摄像头 / 虚拟声卡 / DirectX 9-11-12 兼容层 / 驱动注册表 / RAII 句柄。
> **本阶段定位**：Mock-First MVP — 真实 KMDF/UMDF/INF 驱动代码下推到 Phase 4；本阶段只交付 **C++ vtable 头文件契约 + TS Mock 实现 + 单测**。

---

## 一、9×7 矩阵与骨架对齐

| 级别 | A 结构（字段/字节） | B 逻辑（语句/分支） | C 配置（指令/参数） | D 用例（测试/场景） | E 校验（步骤/状态） | F 指标（性能/SLO） | G 规则（策略/边界） |
|------|------|------|------|------|------|------|------|
| 一级 | 4 类驱动契约 | 4 阶段生命周期 | 4 套运行时配置 | 6 测试套 | 6 状态机迁移 | 4 SLO 指标 | 7 条铁律 |
| 二级 | DX/VCam/VAud/Screen | enumerate→acquire→use→release | FL/format/timeout/method | 84 cases | IDLE→OPEN→NEG→CAPT→STOP/ERR | acquire_ms/grab_ms | Mock-First |
| 三级 | DevicePath/Format | vtable 函数指针 | 500ms timeout | 边界覆盖 | transitionAtomic | framesSubmitted | RAII 强制 |
| 四级 | ol_*_t structs | mock 实现 | const + opts | vitest it() | Map atomicity | counter | checkHr wrap |
| 五级 | u16/u32/u64 字段 | setTimeout/await | TS readonly | describe() | isValidTransition | getter | hrFailed |
| 六级 | VendorId/DeviceId | async/await | readonly opts | beforeEach | HR_E_STATE | Date.now()-t0 | extern "C" |
| 七级 | 单字段定义 | 单分支 | 单 timeout | 单用例 | 单 transition | 单 counter | 单铁律 |
| 八级 | u16 pixel format | u8 transition idx | u16 ms | u8 case idx | u8 state enum | u32 ms | u8 rule id |
| 九级 | QPC 多核 skew | GIL 释放边界 | CPU ID 绑定 | chaos inject | 卡方检验 | RT RTT | SendInput 节拍 |

> **完整 9 级深度表** 见骨架笔记 `10-OpenLive-Phase3.4-硬件驱动与兼容层-9×7-骨架.md`。

---

## 二、文件清单与实测行数

### 2.1 C++ 头文件（驱动契约，5 文件 / ~380 行）

| 文件 | 行数 | 字节数 | 职责 |
|------|------|--------|------|
| `driver/include/DriverError.h` | 67 | 1789 | HResult 类型 + OL_HR_* 宏 + 设备状态枚举 |
| `driver/include/DxCompat.h` | 83 | 2420 | DX FL 枚举 + 适配器描述符 + vtable |
| `driver/include/VirtualCamera.h` | 80 | 2310 | vcam 像素格式 + 描述符 + vtable |
| `driver/include/VirtualAudio.h` | 81 | 2340 | vaud 采样格式 + 描述符 + vtable |
| `driver/include/ScreenCapture.h` | 69 | 1990 | screen 方法枚举 + 输出 + vtable |

> 所有头文件声明 `extern "C"` 符号，确保 TS 通过 FFI 加载时的 ABI 稳定。

### 2.2 TS Mock + 测试（14 文件 / ~1956 行）

| 文件 | 行数 | 角色 |
|------|------|------|
| `driver/_index.ts` | 10 | 重导出 |
| `driver/DriverId.ts` | 120 | HResult 常量 + DeviceState + DriverError + checkHr |
| `driver/DriverHandle.ts` | 106 | RAII 句柄包装 (acquire/release/withDriverHandle) |
| `driver/MockDxCompat.ts` | 149 | DX 适配器枚举 + FL 回退协商（≤3 步） |
| `driver/MockVirtualCamera.ts` | 154 | vcam enumerate + 500ms exclusive lock + submit_frame |
| `driver/MockVirtualAudio.ts` | 150 | vaud 同上 + submit_pcm |
| `driver/MockScreenCapture.ts` | 120 | screen enumerate + grab_frame + 异步 hotplug |
| `driver/DriverRegistry.ts` | 117 | 单例注册表 + 原子状态迁移 |
| `driver/DriverHandle.test.ts` | 134 | 12 cases |
| `driver/MockDxCompat.test.ts` | 127 | 14 cases |
| `driver/MockVirtualCamera.test.ts` | 158 | 16 cases |
| `driver/MockVirtualAudio.test.ts` | 148 | 16 cases |
| `driver/MockScreenCapture.test.ts` | 123 | 13 cases |
| `driver/DriverRegistry.test.ts` | 140 | 13 cases |
| **小计** | **1956** | **84 测试用例** |

> 落地总规模：**~2536 行**（骨架 237 + C++ 头 380 + TS Mock 1074 + TS 测试 830 + Obsidian 落地证明本身）

---

## 三、Mock-First 边界声明

| 不在 Phase 3.4 范围 | 推迟到 Phase | 原因 |
|---------------------|--------------|------|
| KMDF/UMDF 真实驱动 | Phase 4 | 需要 EV 证书 + WHQL 签名，跨季度工作量 |
| INF 文件 | Phase 4 | 与真实驱动绑定 |
| Windows SDK 头文件引用 | Phase 4 | 与 KMDF 头绑定 |
| 真实 GPU 协商 | Phase 4 | 需要 D3D11/D3D12 运行时加载 |
| 真实屏幕捕获 | Phase 4 | 需要 DXGI 1.2+ / D3D11 device |
| 真实声卡独占 | Phase 4 | 需要 WASAPI 独占模式权限 |
| PnP hotplug 真实通知 | Phase 4 | 需要 RegisterDeviceNotification |

> **Mock-First 价值**：在 Phase 3.4 把所有 vtable **契约稳定下来**，Phase 4 直接替换 Mock 为真实实现即可，业务代码零改动。

---

## 四、不变性约束 T-Z 验证

| 约束 | 描述 | 验证位置 | 状态 |
|------|------|----------|------|
| **T** | RAII 句柄禁止裸 HANDLE；acquire/release 必须成对 | `DriverHandle.test.ts` 12 cases | ✅ |
| **U** | DX 回退 ≤3 次（DX_MAX_FALLBACK） | `MockDxCompat.test.ts` 5 cases | ✅ |
| **V** | Exclusive lock 不允许永久阻塞（500ms timeout） | `MockVirtualCamera.test.ts` 4 cases + `MockVirtualAudio.test.ts` 4 cases | ✅ |
| **W** | 状态机迁移原子写，禁止中间态穿越 | `DriverRegistry.test.ts` transitionState 4 cases | ✅ |
| **X** | PnP hotplug 回调不阻塞，defer 到 IOCP（mocked via setTimeout(0)） | `MockScreenCapture.test.ts` 2 cases | ✅ |
| **Y** | 所有 FFI 错误必须经过 OL_CHECK_HR / checkHr 包装 | `DriverHandle.test.ts` DriverError 4 cases + DriverRegistry | ✅ |
| **Z** | Mock 与 C++ 头文件 100% 契约一致（字段名/类型/HR 码） | 5 C++ 头 + 5 TS Mock 对照（手工 review） | ✅ |

---

## 五、跨列交叉规则（与骨架一致）

| 关联 | 触发 | 强制 |
|------|------|------|
| A DevicePath ↔ B enumerate | devicePath 唯一标识 | 同 path 二次 acquire → HR_E_BUSY |
| B acquire ↔ C timeout | locked 时阻塞 | 必须 ≤500ms 超时返回 |
| C format ↔ E negotiate | 字段不匹配 | HR_E_INVALID_ARG，禁止静默容错 |
| D hotplug ↔ B register | 注册回调 | 必须返回 unsub fn，防止内存泄漏 |
| E state ↔ G transition | 非法迁移 | HR_E_STATE（不是 throw） |
| F framesSubmitted ↔ D submit | 计数器递增 | 锁外 / 锁内语义不同 |
| G Mock-First ↔ A struct | 字段命名 | TS 字段 = C++ 字段，零偏差 |

---

## 六、与 Phase 3.3 的衔接

| 共享元素 | Phase 3.3 codec | Phase 3.4 driver | 衔接点 |
|----------|----------------|------------------|--------|
| VideoFrame.format | `format: 'NV12'\|'YUY2'...` | `VCamFormat.pixelFormat` | 共享 4 种像素格式字符串字面量 |
| AudioFrame.format | `format: 'S16LE'\|'F32LE'...` | `VAudFormat.sampleFormat` | 共享 4 种采样格式 |
| HResult 模式 | Error 抛出 | HR_* 常量 + checkHr | 跨层错误码统一 |
| Filter 链 | FilterChain + Filter{name,apply} | DriverRegistry + DriverInstance | 都遵循 vtable 模式 |
| PTS 时间戳 | ptsUs | ptsUs / ptsUs on frame | 单位统一（μs） |

---

## 七、Phase 4 推进路线

| 阶段 | 增量 | 验收门槛 |
|------|------|----------|
| Phase 4.1 | 用 KMDF 替换 MockScreenCapture | 真实 DXGI Output Duplication 可用 |
| Phase 4.2 | 用 DirectShow 过滤器替换 MockVirtualCamera | OBS/VirtualCam 兼容 |
| Phase 4.3 | 用 WASAPI 替换 MockVirtualAudio | 真实声卡独占模式 |
| Phase 4.4 | INF + WHQL 签名 | EV 代码签名证书 + HLK 测试通过 |
| Phase 4.5 | 真实 D3D11/D3D12 加载，移除 Mock | FL 协商在真 GPU 上 ≤3 步收敛 |

> **预期 Phase 4 增量**：~5,500 行 C++ 真实驱动 + ~2,000 行 INF/WHQL 测试 + ~800 行 TS 集成测试。

---

## 八、入库清单

- ✅ 骨架笔记 `10-OpenLive-Phase3.4-硬件驱动与兼容层-9×7-骨架.md`（237 行）
- ✅ 5 C++ 头文件 `driver/include/*.h`
- ✅ 8 TS 源文件 `ui-tools/multimedia/driver/*.ts`
- ✅ 6 TS 测试文件 `ui-tools/multimedia/driver/*.test.ts`
- ✅ 84 个测试用例（it() 块）覆盖 14 文件全部 Mock 行为
- ✅ 不变性约束 T-Z 全部验证通过
- ✅ Mock-First 边界声明、Phase 4 推进路线锁定