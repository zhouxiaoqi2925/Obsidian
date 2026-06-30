---
title: OpenLive Phase 3.3 多媒体编解码 TS 层 九级七列骨架
tags:
  - 项目/OpenLive
  - 阶段/Phase3.3
  - 方法论/拆解框架/亚比特级/9×7
  - 模块/多媒体/编解码
created: 2026-06-30
updated: 2026-06-30
status: 收录入库
related:
  - "[[07-OpenLive-Phase3.2-蓝图节点注册表-MVP落地证明-9×7-骨架]]"
  - "[[04-OpenLive-Phase3-端侧生态-9×7-骨架]]"
  - "[[00-通用深度拆解框架模板-亚比特级]]"
project_root: G:\ai-live-platform\openlive-microkernel\ui-tools\multimedia\
---

# OpenLive Phase 3.3 多媒体编解码 TS 层 9×7 骨架

> **铁律出处**："每一步必须先输出 9 级 × 7 列骨架，再写代码。"
> **本篇范围**：A3 多媒体编辑器-编解码子层的 TypeScript 抽象骨架（MVP 切片）。
> **绑定路径**：`G:\ai-live-platform\openlive-microkernel\ui-tools\multimedia\codec\` + `filter\` + `mux\`
> **接续 MVP**：Timeline.ts(时间线)+ Playhead.ts(播放头) 已落，本期给它们装上「Packet/Frame/Encoder/Muxer/Filter」底座。
> **真 C++ N-API / FFI 绑定**：本期不实现，留 Phase 3.4 通过 `@openlive/codec-native` 子包。

---

## 一、9×7 全景矩阵

```mermaid
graph TB
    subgraph A["A 结构"]
        A1[A1 Packet 结构] --> A2[A2 VideoFrame/AudioFrame] --> A3[A3 Muxer 包结构]
    end
    subgraph B["B 逻辑"]
        B1[B1 编码器调度] --> B2[B2 PTS 对齐] --> B3[B3 滤镜链] --> B4[B4 复用封装]
    end
    subgraph C["C 配置"]
        C1[C1 编码参数] --> C2[C2 PTS 起点]
    end
    subgraph D["D 用例"]
        D1[D1 编/解闭环] --> D2[D2 滤镜抖动]
    end
    subgraph E["E 校验"]
        E1[E1 帧边界] --> E2[E2 PTS 单调]
    end
    subgraph F["F 指标"]
        F1[F1 编码 fps] --> F2[F2 复用 bitrate] --> F3[F3 滤镜耗时]
    end
    subgraph G["G 规则"]
        G1[G1 关键帧间隔] --> G2[G2 采样率合规] --> G3[G3 PTS 漂移阈值]
    end
```

| 级别 | A 结构 | B 逻辑 | C 配置 | D 用例 | E 校验 | F 指标 | G 规则 |
|------|--------|--------|--------|--------|--------|--------|--------|
| 一级模块 | Packet/Frame/Muxer | 编码/PTS/滤镜/复用 | 编码参数/PTS 起点 | 编解闭环/抖动 | 帧边界/PTS 单调 | fps/bitrate/耗时 | GOP/采样/漂移 |
| 二级子模块 | 3 类型 | 4 阶段 | 2 类配置 | 2 测试套 | 2 类校验 | 3 大指标 | 3 类规则 |
| 三级功能 | {pts,dts,data,isKey} | encode→align→filter→mux | {bitrate,gop} | encode→decode→mux | assertBounds | histogram | 1s GOP / 48kHz |
| 四级步骤 | alloc→fill→emit | open→send→recv→close | parseJson→merge | inject→encode→verify | monotonic test | bin=16ms | ifg=24 |
| 五级原子 | VideoFrame factory | VideoEncoderImpl | EncoderParams | jest | assertMonotonic | fpsCounter | GopPolicy |
| 六级参数 | width=1280 | timeoutMs=1000 | bitrate=2000k | 25+ cases | ±1 frame | bins=[16,33,50]ms | gop=60 |
| 七级颗粒 | 'video/H264' | 'pts_align()' | 'bitrate=2000k' | 'encode_decode_loop' | 'pts strictly inc' | 'fps_min=25' | 'gopFrames=60' |
| 八级比特 | u32 ptsUs | u8 codecId | u32 bitrate | u16 cases | i64 driftUs | u64 bins | u16 gop |
| 九级亚比特 | PTS 重置 atomic | GIL 释放边界 | bitrate 抖动边界 | 卡方显著 | 亚毫秒漂移 | 卡方分布 | GOP 边界帧关键标志 |

---

## 二、九级深度详表

### A 列「结构」—— Packet / VideoFrame / AudioFrame / Muxer

| 级别 | 内容 |
|------|------|
| **一级** | 4 类核心数据结构 |
| **二级** | A1 Packet（编码后）；A2 VideoFrame/AudioFrame（编码前）；A3 Muxer 输出片段 |
| **三级** | A1.1 {ptsUs, dtsUs, codec, isKey, data}；A2.1 {width/height/pts/data}；A3.1 {trackId, packets[]} |
| **四级** | `new Packet({ptsUs,dtsUs,codec,isKey,data})` → `new VideoFrame({width,height,pts,data})` → `muxer.append(packet)` |
| **五级** | TS class + frozen + 只读 |
| **六级** | Packet.data ≤ 1MB / Frame.data ≤ 8MB / Muxer buffer ≤ 64MB |
| **七级** | codec: 'video/H264' \| 'audio/AAC' \| 'video/H265' |
| **八级** | u32 ptsUs / u32 size / u8 isKey |
| **九级** | BigInt 备份以防 32-bit 溢出到 71min；零拷贝视图（Uint8Array slice） |

### B 列「逻辑」—— 编码 / PTS / 滤镜 / 复用

| 级别 | 内容 |
|------|------|
| **一级** | 4 阶段管线 |
| **二级** | B1 编码器调度；B2 PTS 对齐；B3 滤镜链；B4 复用封装 |
| **三级** | B1.1 video/audio 双轨并发；B2.1 audio-clock 主导；B3.1 filter graph；B4.1 FLV/HLS/MP4 |
| **四级** | frame → encoder → packet → align → filter → mux → output |
| **五级** | VideoEncoder.encode / ptsAlign / FilterChain.apply / Muxer.append |
| **六级** | encode timeout=1s / drift ≤ 20ms / filter chain depth ≤ 16 / mux append 1MB max |
| **七级** | 函数：`encodeAndAlign()` / `applyFilterChain()` / `muxAndWrite()` |
| **八级** | u32 durMs / u32 driftUs |
| **九级** | 异步不持锁；queueMicrotask 边界；CPython 同类边界 1ms |

### C 列「配置」—— 编码参数 / PTS 起点

| 级别 | 内容 |
|------|------|
| **一级** | 运行时可调参数 |
| **二级** | C1 编码参数；C2 PTS 起点与时间基 |
| **三级** | C1.1 {bitrate, gop, profile}；C2.1 {startUs, timebase=1_000_000} |
| **四级** | load config/codec.json → merge → freeze |
| **五级** | TS Object.freeze + JSON schema |
| **六级** | bitrate ≥ 100k / gop ≥ 1 / timebase=1_000_000 |
| **七级** | JSON key 'video': {bitrate, gop} |
| **八级** | u32 bitrate / u32 timebase |
| **九级** | 配置签名校验防伪注入；变更触发热加载回调 |

### D 列「用例」—— 编解闭环 / 滤镜抖动

| 级别 | 内容 |
|------|------|
| **一级** | 单测 + 抖动测试 |
| **二级** | D1 编/解闭环；D2 滤镜抖动 50ms |
| **三级** | D1.1 VideoEncoder encode → MockDecoder decode → 数据一致；D2.1 抖动 burst 50ms |
| **四级** | jest describe/it |
| **五级** | jest.useFakeTimers / Promise.all |
| **六级** | 25+ 用例 / 抖动 50ms × 100 帧 |
| **七级** | 用例名：`encode_decode_loop_pure` |
| **八级** | u16 cases |
| **九级** | 单帧 + 异步 IO 双堆栈抖动敏感度 |

### E 列「校验」—— 帧边界 / PTS 单调

| 级别 | 内容 |
|------|------|
| **一级** | 2 类断言 |
| **二级** | E1 帧边界；E2 PTS 单调 |
| **三级** | E1.1 width/height/data.length 一致；E2.1 pts 严格递增 |
| **四级** | assertFrame / assertMonotonic |
| **五级** | `if (data.length !== width*height*3/2) throw` / `assert pts[i] < pts[i+1]` |
| **六级** | pts driftUs ≤ 20ms |
| **七级** | 函数：`assertFrame()` / `assertMonotonic()` |
| **八级** | u32 size / i64 driftUs |
| **九级** | 单帧 ≤ 33ms 抖动；亚毫秒误差测试 |

### F 列「指标」—— fps / bitrate / 耗时

| 级别 | 内容 |
|------|------|
| **一级** | 3 大指标 |
| **二级** | F1 编码 fps；F2 复用 bitrate；F3 滤镜耗时 |
| **三级** | F1.1 ≥ 25 fps；F2.1 实际与配置差 ≤ ±10%；F3.1 p99 ≤ 5ms |
| **四级** | 滑动窗口 fps / 累计 byte / 滤波耗时 |
| **五级** | `fpsCounter.tick()` / `byteCounter.add(size)` |
| **六级** | bins=[16,33,50,100]ms / 5s window |
| **七级** | 指标名：`encode_fps`，`mux_bitrate`，`filter_duration_ms` |
| **八级** | u32 ms / u32 byte |
| **九级** | 卡方检验 fps 抖动；样本边界 |

### G 列「规则」—— GOP / 采样率 / PTS 漂移

| 级别 | 内容 |
|------|------|
| **一级** | 3 类硬规则 |
| **二级** | G1 关键帧间隔；G2 采样率合规；G3 PTS 漂移阈值 |
| **三级** | G1.1 每 60 帧必须 1 关键帧；G2.1 audio 16/24/48kHz；G3.1 漂移 > 20ms 即告警 |
| **四级** | GopPolicy.insertKeyframe / SampleRateValidator / DriftMonitor |
| **五级** | `if (i % 60 === 0) isKey=true` / `[8000,16000,24000,48000].includes(hz)` |
| **六级** | gopFrames=60 / allowedHz=4 种 / driftUs=20000 |
| **七级** | 函数：`shouldInsertKeyframe()` / `isValidSampleRate()` |
| **八级** | u16 gop / u8 codec |
| **九级** | GOP 边界帧 IDR 标识；采样率非法即拒绝；漂移亚毫秒监控 |

---

## 三、行间交叉规则

| 关联 | 触发 | 强制 |
|------|------|------|
| A Packet ↔ B PTS | 编码器产 Packet 必填 ptsUs | ptsUs 必须单调递增，否则 align() 自动重排 |
| B Encoder ↔ C Params | 编码器初始化 params 必须冻结 | 参数变更需 reopen 编码器 |
| B PTS ↔ E 单调 | 校验器在输出端 assertMonotonic | 失败抛 `PtsDriftError` |
| D 抖动 ↔ F fps | 50ms 突发测试 | fpsCounter 必须能容忍突发而不报错 |
| F bitrate ↔ C Params | 实际 bitrate 偏差 ≤ ±10% | 偏差大触发告警，但不阻断 |
| G GOP ↔ A Packet | 每 60 帧至少 1 isKey | GOP 边界自动插入关键帧 |
| G 采样率 ↔ B Encoder | 非法采样率直接拒 | encoder 构造抛 `InvalidSampleRateError` |

---

## 四、目标代码增量（预估净行数 MVP 切片）

| 模块 | 文件数 | 净行数 | 覆盖率 |
|------|-------|--------|--------|
| `codec/Packet.ts` | 1 | 80 | n/a |
| `codec/VideoFrame.ts` | 1 | 100 | n/a |
| `codec/AudioFrame.ts` | 1 | 90 | n/a |
| `codec/CodecId.ts` | 1 | 60 | n/a |
| `codec/EncoderParams.ts` | 1 | 120 | n/a |
| `codec/VideoEncoder.ts`（接口 + MockH264 实现） | 2 | 280 | ≥ 90% |
| `codec/AudioEncoder.ts`（接口 + MockAAC 实现） | 2 | 260 | ≥ 90% |
| `mux/Muxer.ts`（接口 + MockFLV 实现） | 2 | 240 | ≥ 85% |
| `filter/FilterChain.ts` | 1 | 220 | ≥ 90% |
| `filter/filters/NoiseFloor.ts`（音频白噪） | 1 | 120 | n/a |
| `filter/filters/PixelJitter.ts`（视频 1px 抖动） | 1 | 120 | n/a |
| `rules/GopPolicy.ts` | 1 | 100 | ≥ 95% |
| `rules/SampleRateValidator.ts` | 1 | 80 | ≥ 95% |
| `rules/DriftMonitor.ts` | 1 | 140 | ≥ 90% |
| `metrics/CodecMetrics.ts` | 1 | 180 | n/a |
| `_index.ts` | 1 | 50 | n/a |
| 测试 7 文件 | 7 | 1200 | — |
| **合计** | **~22** | **~3440** | — |

---

## 五、与 Phase 1+2+3 既有模块的不变性

| 不变性 | 含义 | 本期体现 |
|--------|------|---------|
| F | UI 工具零 Node API | 所有编解码接口为纯 TS 类；Mock 实现不依赖 fs/child_process |
| G | 日志 PII 脱敏 + traceId | Encoder/Muxer 接受 ctx.traceId；metrics.emit 接 Logger |
| I | DAG 拓扑 | 滤镜链 = 顺序 DAG（拓扑唯一），FilterChain 内部 assertTopology |
| K | 时间线 PTS 单调 | DriftMonitor 与 Timeline 共享 PTS 起算点 |
| L | UI 工具禁止引入 React/Vue | 返回 DOM-safe 数据结构 |
| Q (新) | Packet/Frame 不可变 | `Object.freeze` + readonly fields |
| R (新) | 编码参数冻结 | EncoderParams 一旦传 encoder 不得修改 |
| S (新) | 滤镜链上限 | FilterChain 深度 ≤ 16，防死循环 |

---

## 六、本期 MVP 范围声明

**不做**：真 FFmpeg/WebCodecs 绑定（MVP 用 Mock；Phase 3.4 通过 N-API 子包 @openlive/codec-native 接入）、HLS/HDS 等长链接协议、多音轨混音、GPU 加速滤镜
**做**：完整 TS 数据契约 + 接口骨架 + Mock 实现 + 完整单测，预算约 3440 行

---

## 七、验收标准

1. ✅ Packet / VideoFrame / AudioFrame 数据契约冻结，setter 抛错
2. ✅ VideoEncoder/AudioEncoder 接口严格；Mock 实现 producePacket 输出合法 Packet
3. ✅ Muxer.append 维护 PTS 单调；非法 Packet 抛错
4. ✅ FilterChain.applyFilter 顺序执行；链深 ≤ 16 校验
5. ✅ NoiseFloor + PixelJitter 两个基础滤镜实现与单测
6. ✅ GopPolicy 每 60 帧强制 1 关键帧；SampleRateValidator 仅允许 4 种采样率；DriftMonitor 漂移 > 20ms 告警
7. ✅ CodecMetrics emit fps / bitrate / duration 三个指标
8. ✅ 覆盖率：Encoder ≥ 90% / Muxer ≥ 85% / Filter ≥ 90% / Rules ≥ 95%

---

## 八、MVP 落地后预计产出文档

落地完成后将写 `09-OpenLive-Phase3.3-多媒体编解码TS层-MVP落地证明-9×7-骨架.md` 验证闭环。