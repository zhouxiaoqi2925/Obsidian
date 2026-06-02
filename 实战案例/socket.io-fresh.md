# socket.io-fresh - 四层协议栈 + Adapter 房间路由实时通信框架

**GitHub**: socketio/socket.io-fresh
**Star**: 60k+
**语言**: TypeScript (~98%) + 少量 JS
**主题**: realtime-framework / websocket / monorepo / event-driven
**适用场景**: 学习协议分层设计、Adapter 模式、CSR（连接状态恢复）、多命名空间/房间广播

> socket.io 是 Node.js 实时双向事件通信的事实标准。12 个子包构成四层协议栈（物理 → 传输 → 协议 → 业务），用 Adapter 抽象解耦房间路由、用 CSR 模式解耦重连体验、用不可变 BroadcastOperator 解耦 flags 共享——5 行代码就能跑起 chat/协作/直播/IoT 仪表盘。

## 第一段：基础范式（模式 1-5）

### 模式 1 · Engine.IO + Socket.IO 协议分层

**问题场景**：WebSocket 在老代理/企业内网被拦；纯 WebSocket 没有降级、没有心跳、没有事件语义。

**解决方案**：拆成两层——Engine.IO 只管"可靠字节流 + 心跳 + 升级"，Socket.IO 只管"事件 + 命名空间 + 房间"，接口 4 事件 + 2 方法。

**关键参数**：
- 分层 = Engine 传输层独立 npm 包 + Socket 业务层独立 npm 包
- 接口 = 4 事件（open/data/error/close）+ 2 方法（send/close）
- 协议 = EIO=4 传输层 + v5 应用层
- 优势 = 换 uWebSockets.js 不碰语义层 / 换 msgpack-parser 不碰传输层
- 代价 = 双握手 + 版本同步成本

**最佳实践**：实时通信协议按"传输 + 业务"分层（vs. 揉成一团）——可独立演进 + 替换实现。

### 模式 2 · Adapter 模式解耦房间路由

**问题场景**：`io.to("room-1").emit("foo")` 需要找出"哪些 socket 在 room-1"——单进程 Map，多进程必须让所有节点同步状态。

**解决方案**：`socket.io-adapter` 抽象 7 个方法（addAll/delAll/broadcast/broadcastWithAck）——in-memory / redis / postgres / cluster IPC 4 种实现，业务层无感。

**关键参数**：
- 双 Map = `rooms: Map<Room, Set<SocketId>>` 正向 + `sids: Map<SocketId, Set<Room>>` 反向
- 生命周期 = `create-room / join-room / leave-room / delete-room` 4 EventEmitter 信号
- 横扩 = Redis Pub/Sub / Postgres LISTEN-NOTIFY / node:cluster IPC
- 优势 = 业务 `io.to(room).emit()` 代码跨单/多进程不变
- 风险 = 双 Map 一致性 bug 率比想象中高

**最佳实践**：房间路由用 Adapter 模式（vs. 直接 Redis SET）——事件化生命周期 + 可切换实现。

### 模式 3 · CSR 连接状态恢复

**问题场景**：HTTP polling 时代用户痛点——刷新页面就丢订阅；移动端切网聊天记录断档。

**解决方案**：`sid + pid` 双 ID + 缓存 missed packets——pid 永不出现在 client 端，恢复时 sid 不变保持上层业务无感。

**关键参数**：
- sid = socket.id（公开）
- pid = private session id（私密，只服务端用）
- 重连 = `previousSession` 透传到 Socket 构造
- 恢复 = `previousSession.rooms.forEach(room => this.join(room))`
- 重发 = `missedPackets.forEach(packet => this.packet({...}))`
- 开关 = 默认关，启用需 `connectionStateRecovery: {...}`

**最佳实践**：长连接重连用 CSR 模式（vs. 业务自己实现 session 同步）——sid 复用 + missed packets 重放。

### 模式 4 · BroadcastOperator 不可变链式

**问题场景**：`io.to("a").except("b").compress(true).emit("foo")` 链式过滤——多线程/多请求场景共享 flags 竞争。

**解决方案**：BroadcastOperator 每次链式返回**新对象**——`to(room)` 第一行 `new Set(this.rooms)` 复制原 rooms，emit 时统一 apply flags。

**关键参数**：
- 不可变 = 每次 `.to/.except/.compress/.timeout` 返回新对象
- flags = rooms / except / flags / volatile
- ACK = `emit(ev, ...args)` 检测 args 最后一个是函数视为 ack
- 批量 = `io.timeout(1000).emit('ev', (err, resps) => ...)` 多节点聚合
- 优势 = 共享状态零竞争

**最佳实践**：链式过滤 API 用不可变模式（vs. mutable builder）——并发安全 + 调试可观察。

### 模式 5 · 泛型事件契约

**问题场景**：纯 JS 框架拼错事件名运行时才发现；`socket.emit("foo")` 的参数类型在 IDE 里看不到。

**解决方案**：`Server<ListenEvents, EmitEvents, ServerSideEvents, SocketData>` 4 泛型 + `StrictEventEmitter` 装饰原生 EventEmitter——编译期防止事件名/参数类型错。

**关键参数**：
- 4 泛型 = Listen / Emit / ServerSide / SocketData
- 透传 = Server / Namespace / Socket / BroadcastOperator 四层一致
- ack 推断 = `EventNamesWithAck<Map>` 条件类型识别 ack 事件
- 工具 = `tsd` 在 CI 跑类型推断断言
- 价值 = 大型团队协作编译期防线

**最佳实践**：纯 JS 框架上 TS 4 泛型（vs. any）——是 GraphQL/EventBus/Worker 池通用范本。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · 传输升级（polling → websocket）

**问题场景**：企业代理拦 WebSocket；纯 polling 又慢。

**解决方案**：默认先 polling 兼容，异步 upgrade 到 WebSocket——期间所有 packet 缓存到 writeBuffer，升级完成后 flush 出去，应用层完全透明。

**关键参数**：
- 升级 = handleUpgrade 触发 101 Switching Protocols
- 缓冲 = writeBuffer 缓存升级期 packet
- 顺序 = HTTP GET /socket.io/?EIO=4&transport=polling → 升级 → WS
- 优势 = 业务无感
- 备选 = WebTransport（QUIC/HTTP3，实验）

**最佳实践**：长连接默认 polling→ws 升级（vs. 强制 ws）——兼容 99% 网络环境。

### 模式 7 · 动态命名空间（ParentNamespace）

**问题场景**：用户房间 id 动态（`/room-123`、`/room-456`）——预创建 N 个 namespace 浪费；正则匹配走 io 一次广播到所有匹配。

**解决方案**：`io.of(/^\/room-\d+$/)` 返回 ParentNamespace，emit 时 `forEach(nsp => nsp.emit(...))` fan-out 到所有匹配 nsp。

**关键参数**：
- 内部名 = `/_<count>` 避免与用户命名空间冲突
- 中间件继承 = `createChild` 时复制父 `_fns`
- 监听继承 = `connection` 监听器复制
- 自动回收 = `cleanupEmptyChildNamespaces` 配置开关
- 单进程 = 0 额外 RPC，跨节点用 Redis adapter

**最佳实践**：动态业务频道用 ParentNamespace（vs. 预创建 N 个 nsp）——按需创建 + 跨频道广播。

### 模式 8 · Pre-encoded WebSocket 帧优化

**问题场景**：聊天高 QPS 场景 CPU 瓶颈在"packet → JSON → ws 库 → frame" 多次序列化。

**解决方案**：adapter 直接生成 ws 帧（`wsPreEncodedFrame`），socket.io 调 `_sender.sendFrame` 跳过 ws 库内部 mask/分片组装。

**关键参数**：
- 检查 = `canPreComputeFrame && encodedPackets.length === 1 && typeof === "string"`
- 生成 = `WebSocket.Sender.frame(data, { mask: false, rsv1: false, opcode: 1 })`
- 路径 = adapter.broadcast → pre-encoded → transport.send
- 提升 = 15-20% CPU（高 QPS 聊天场景）
- 条件 = 单 packet 字符串编码

**最佳实践**：高 QPS 长连接走预编码路径（vs. 每次 JSON.stringify）——CPU 优化 20%。

### 模式 9 · 心跳 + ping/pong 防止 NAT 切断

**问题场景**：NAT/防火墙 60s idle 切长连接；用户没业务消息时连接假死。

**解决方案**：Engine.IO 协议层 25s ping/pong 心跳（独立于应用层事件）——保持 NAT 映射 + 检测半死连接。

**关键参数**：
- 间隔 = 25s ping / 20s pong timeout
- 协议 = Engine Packet type 2 (PING) / 3 (PONG)
- 心跳方向 = v3 客户端主导 / v4 服务端主导（NAT 友好）
- 协议层 = 不依赖应用层
- 兜底 = ping timeout 触发 close 事件

**最佳实践**：长连接 25s ping/pong（vs. 60s+）——NAT 留一半余量 + 早检测半死。

### 模式 10 · ACK 协议（请求-响应匹配）

**问题场景**：TCP 是字节流不是消息队列；emit 出去的请求怎么对应回包。

**解决方案**：`emit('event', data, ackCallback)` 把 ack 挂到 `acks: Map<id, callback>`，服务端响应 `{id:42, data:...}` 客户端解包回调。

**关键参数**：
- ID = 自增 `this.ids`，单调不复用
- 数据结构 = `acks.set(nsp, ++this.ids, ack)`
- 超时 = `{timeout: 5000}` 显式传
- 协议 = 42["event", data] + 431[42, "ack-reply"]
- 复用 = 同一 packet 通道带 id，最大限度复用 payload

**最佳实践**：长连接请求-响应走 ack 协议（vs. 自开 RPC 通道）——复用 payload + 编译期类型。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · 协议 v3/v4 双轨制兼容

**问题场景**：老业务 v2 客户端（EIO=3 协议）在线，强制升 v4 会让老客户端全断。

**解决方案**：`allowEIO3: true` + Socket 构造中 `if (client.conn.protocol === 3) this.id = nsp.name + '#' + client.id`——保留旧协议分支。

**关键参数**：
- 开关 = `allowEIO3: true` 接受老客户端
- ID 生成 = v3 用 `nspName#clientId` / v4 用 base64id
- 心跳 = v3 客户端主导 / v4 服务端主导
- 代价 = 核心路径写 if 分支增加心智负担
- 适用 = 企业级框架老业务平滑升级

**最佳实践**：企业级框架保留双协议分支（vs. 强制升）——平滑迁移 + 不激怒老用户。

### 模式 12 · 12 个子包 monorepo 拆分

**问题场景**：单包 socket.io 难演进；parser / engine / adapter 各自版本独立。

**解决方案**：npm workspaces 12 个子包——engine.io / engine.io-client / engine.io-parser / socket.io / socket.io-client / socket.io-parser / socket.io-adapter / 4 个 cluster-emitter / component-emitter。

**关键参数**：
- 管理 = `npm workspaces` 12 个子包
- 独立性 = 每个子包 `package.json` + `tsconfig.json` + `test/`
- CI = 12 个 GitHub Actions workflow 每个子包独立
- 替代 = Lerna / Nx / Turborepo（项目用 npm 原生）
- 代价 = 版本同步成本 + lockfile 维护

**最佳实践**：大库用 npm workspaces monorepo（vs. 单包）——独立发版 + 子包可单独用。

### 模式 13 · ParentBroadcastAdapter 跨 nsp 广播

**问题场景**：`io.of(/^\/admin-/).emit('foo')` 跨多个匹配 nsp 广播——单 adapter 只能管单 nsp。

**解决方案**：ParentNamespace 自带 `ParentBroadcastAdapter`——跳过单 nsp broadcast 改 `forEach(child => child.adapter.broadcast(...))`。

**关键参数**：
- 重写 = ParentBroadcastAdapter 替换 `broadcast(packet, opts)` 方法
- fan-out = 遍历 children 各自调 broadcast
- 单进程 = 0 RPC
- 跨进程 = 走 Redis adapter fan-out
- 适用 = 多租户 / 动态业务频道

**最佳实践**：动态命名空间配 ParentBroadcastAdapter（vs. 自己遍历）——单 adapter 模式扩展到跨 nsp。

### 模式 14 · 30+ 集成示例（examples/）

**问题场景**：新手接入想看 Next.js / Nuxt / NestJS / React Native 怎么用——光看 API 文档不够。

**解决方案**：examples/ 目录 30+ 集成示例——chat / white-board / cluster-nginx / private-messaging / WebTransport——是接入文档的延伸。

**关键参数**：
- 覆盖 = 30+ 框架（Next / Nuxt / Nest / RN / Express / Passport）
- 集群 = cluster-nginx / cluster-haproxy / cluster-traefik 三个 LB 示例
- 私有 = private-messaging（端到端加密聊天）
- 协议 = 包含 WebTransport 实验示例
- 价值 = 用户照抄就能跑

**最佳实践**：库必带 30+ 集成示例（vs. 单 README）——降低接入门槛 10x。

### 模式 15 · Protocol Test Suite 协议一致性

**问题场景**：第三方实现 socket.io 协议——没有标准测试套件验证兼容性。

**解决方案**：`docs/socket.io-protocol/v5-test-suite/` 是**完整可执行 W3C-style 测试规范**——任何想兼容 v5 协议的客户端/服务端都跑这套。

**关键参数**：
- 位置 = `docs/*-protocol/v*-test-suite/`
- 形态 = 完整可执行 spec
- 范围 = 跨语言 conformance test（Node + 浏览器）
- 价值 = 协议和参考实现分离
- 协议 = IETF/MIT 风格（vs. 单纯 RFC doc）

**最佳实践**：协议层项目用 conformance test suite（vs. 单纯文档）——硬保证 + 跨实现兼容。

## 第四段：实战范式（模式 16-20）

### 模式 16 · 选型：socket.io vs ws vs uWebSockets.js vs Centrifugo

**问题场景**：实时通信框架选型——socket.io / 裸 ws / uWS / Centrifugo / SSE / 商业 SaaS？

**解决方案**：决策树——易用 + 功能强选 socket.io；极致性能选 uWS（手写协议）；托管省运维选 Pusher/Ably；服务端广播选 Centrifugo。

**关键参数**：
- socket.io = 易用 9/10 + 功能 9/10 + 性能 7/10
- 裸 ws = 易用 3/10 + 功能 4/10 + 性能 9/10
- uWS = 易用 4/10 + 功能 5/10 + 性能 10/10（单核 100K+ 连接）
- Centrifugo = 易用 5/10 + 功能 8.5/10 + 性能 8/10
- SSE = 易用 7/10 + 功能 3/10（单向）
- 商业 = Pusher/Ably 省运维 + 月费

**最佳实践**：90% Web 实时应用选 socket.io（功能/易用平衡）；极致性能选 uWS；省运维选 SaaS。

### 模式 17 · 横扩方案：Redis vs Cluster Engine

**问题场景**：单进程 socket.io 撑不住 50K 连接——多机横扩选 Redis adapter 还是 Cluster Engine？

**解决方案**：决策——零外部依赖用 Cluster Engine（node:cluster IPC，比 Redis 快 5-10x）；已有 Redis 基础设施用 socket.io-redis-streams-emitter。

**关键参数**：
- Cluster Engine = node:cluster + Redis pub/sub 兜底
- Redis = 跨数据中心 + 已有基础设施
- Postgres = NOTIFY 通道
- 性能 = IPC > Redis 单机 > Redis 跨机
- 兜底 = Cluster Engine 断电用 Redis

**最佳实践**：横扩首选 Cluster Engine（IPC 零依赖）——比 Redis Pub/Sub 快 5-10x。

### 模式 18 · 生产实战配置

**问题场景**：socket.io 上生产——优雅停服、限流、链路追踪、健康检查怎么做？

**解决方案**：实战清单——`io.disconnectSockets(true)` 主动断开 + `io.engine.clientsCount` 暴露 /healthz + `io.use` 注入 traceId + maxHttpBufferSize 默认 100KB。

**关键参数**：
- 热更新 = `io.adapter()` setter 替换 / `pm2 reload`
- 停服 = `io.disconnectSockets(true)` + `httpServer.close()`
- 限流 = maxHttpBufferSize（100KB）+ 应用层连接数限流
- 追踪 = `io.use((s, n) => { s.data.traceId = ...; n() })`
- 健康 = `io.engine.clientsCount` 暴露 /healthz
- 日志 = `DEBUG=socket.io:*` 启动

**最佳实践**：socket.io 生产必开 `connectionStateRecovery` + 优雅停服 + 自定义 /healthz。

### 模式 19 · TypeScript 4 泛型事件契约实战

**问题场景**：大型项目 socket.emit 事件名拼错 / 参数类型错——运行时才崩。

**解决方案**：定义 `Server<ListenEvents, EmitEvents, ServerSideEvents, SocketData>` 4 泛型 + IDE 自动补全 + 编译期防错。

**关键参数**：
- 4 泛型 = Listen / Emit / ServerSide / SocketData
- 定义 = `interface ServerToClientEvents { chat: (msg: string) => void }`
- 透传 = Namespace / Socket / BroadcastOperator 三层一致
- 推断 = `socket.on('chat', (msg) => msg.toUpperCase())` 编译期推 string
- 工具 = `tsd` 在 test/*.test-d.ts 跑类型断言

**最佳实践**：TS 项目用 4 泛型 + tsd（vs. any）——编译期防线 + IDE 智能补全。

### 模式 20 · 7 天复刻 mini-socket.io 路线

**问题场景**：想理解 socket.io 协议 + 传输 + 适配器三层架构；想 7 天复刻 MVP。

**解决方案**：7 天 MVP——Day 1-2 传输层（WebSocket + 心跳 + polling 升级），Day 3-4 业务层（Namespace + Socket + Client），Day 5 协议（parser v5 编解码），Day 6 InMemoryAdapter + Redis，Day 7 CSR + 测试。

```
Day1-2: Engine.io 长轮询 + WS 升级 + 25s ping/pong
Day3-4: Socket + Namespace + Client 多命名空间
Day5:   socket.io-parser v5 EVENT/ACK/BINARY_EVENT 编解码
Day6:   InMemoryAdapter + Redis Pub/Sub 适配器
Day7:   Connection State Recovery（sid + pid + missedPackets）
```

**关键参数**：
- 核心 = 协议分层（Engine + Socket）
- 协议 = v5（EVENT / ACK / BINARY_EVENT / CONNECT）
- 房间 = 双 Map + Adapter
- 性能 = pre-encoded ws frame
- 复刻难度 = 核心 1500 行可讲清，全栈 5-7 天

**最佳实践**：复刻 mini-socket.io 先做 Engine + Namespace + Adapter——核心 1500 行 2 周能出可用品。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\socket.io-fresh\`
- 文件数：~826（含 examples + docs）
- License：MIT
- 状态：4.x 主线（socket.io@4.8.x）

**核心子包**：
- `engine.io` = 服务端传输层
- `engine.io-client` = 浏览器/Node 客户端传输
- `engine.io-parser` = Engine 帧编解码
- `socket.io` = 服务端业务层
- `socket.io-client` = 浏览器/Node 客户端
- `socket.io-parser` = Socket.IO 业务包编解码
- `socket.io-adapter` = 房间路由抽象
- `socket.io-cluster-engine` = node:cluster / Redis 引擎
- `socket.io-component-emitter` = 1KB EventEmitter

**3 核心洞察**：
1. 协议分层（Engine + Socket）= 实时通信的范式
2. Adapter 模式 = 房间路由跨单/多进程的关键
3. CSR（sid + pid） = 刷新页面不掉订阅的杀手锏

**1 反模式**：依赖单一维护者项目——选 socket.io 这种 core 团队 4+ 人 + 商业赞助的更稳。

**3 立刻能用**：
1. `connectionStateRecovery: { maxDisconnectionDuration: 2*60*1000 }` 启用 CSR
2. `io.to(`user:${id}`).emit('notify', payload)` 一行定向推送
3. `io.timeout(2000).emit('ack-test', (err, resps) => ...)` 集群全节点健康检查
