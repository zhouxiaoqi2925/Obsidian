# socket.io-fresh - 四层协议栈 + Adapter 房间路由实时通信框架

**GitHub**: socketio/socket.io-fresh
**Star**: 60k+
**语言**: TypeScript (~98%) + 少量 JS
**主题**: realtime-framework / websocket / monorepo / event-driven
**适用场景**: 学习协议分层设计、Adapter 模式、CSR（连接状态恢复）、多命名空间/房间广播

---

## 第一段：协议分层 - 传输层与业务层分离

### 模式 1：Engine.IO + Socket.IO 协议分层

**问题场景**：WebSocket 在老代理/企业内网被拦；纯 WebSocket 没有降级、没有心跳、没有事件语义；用户要"装上能用、不用操心兼容性"。

**解决方案**：拆成两层——Engine.IO 只管"可靠字节流 + 心跳 + 升级"，Socket.IO 只管"事件 + 命名空间 + 房间"，接口 4 事件 + 2 方法；可独立演进。

```ts
// Engine.IO 传输层（engine.io）
// 4 事件 + 2 方法
interface Socket {
  on(event: 'open' | 'message' | 'close' | 'error', listener): this
  on(event: 'packet', listener: (packet: Packet) => void): this
  send(message: string | ArrayBuffer | Blob | ArrayBufferView): void
  close(): void
}
// Socket.IO 业务层（socket.io）
// 事件语义
interface ServerSideSocket {
  emit(event: 'message', data: any): boolean
  on(event: 'connect' | 'disconnect', listener): this
  join(room: string): Promise<void> | void
  to(room: string): BroadcastOperator
}
// Engine.IO 处理物理层（WebSocket / polling / upgrade / ping/pong）
// Socket.IO 处理应用层（EVENT / ACK / BINARY_EVENT / CONNECT_ERROR）
```

**关键参数**：
- 分层 = Engine 传输层独立 npm 包 + Socket 业务层独立 npm 包
- 接口 = 4 事件（open/data/error/close）+ 2 方法（send/close）
- 协议 = EIO=4 传输层 + v5 应用层
- 优势 = 换 uWebSockets.js 不碰语义层 / 换 msgpack-parser 不碰传输层
- 代价 = 双握手 + 版本同步成本

**最佳实践**：实时通信协议按"传输 + 业务"分层（vs. 揉成一团）——可独立演进 + 替换实现；传输层是"可靠字节流"，业务层是"事件语义"；分层让"换 WebTransport 不影响 socket.emit"；Protocol 数字版本解耦（EIO=4 / Socket v5）。

### 模式 2：Adapter 模式解耦房间路由

**问题场景**：`io.to("room-1").emit("foo")` 需要找出"哪些 socket 在 room-1"——单进程 Map，多进程必须让所有节点同步状态；怎么让业务代码不感知单/多进程？

**解决方案**：`socket.io-adapter` 抽象 7 个方法（addAll/delAll/broadcast/broadcastWithAck）——in-memory / redis / postgres / cluster IPC 4 种实现，业务层无感；事件化生命周期。

```ts
// socket.io-adapter 抽象
abstract class Adapter {
  rooms: Map<Room, Set<SocketId>>  // 正向
  sids: Map<SocketId, Set<Room>>    // 反向
  abstract addAll(id: SocketId, rooms: Set<Room>): Promise<void>
  abstract delAll(id: SocketId): Promise<void>
  abstract broadcast(packet: any, opts: BroadcastOptions): Promise<void>
  // 4 个 EventEmitter 信号
  // 'create-room' / 'join-room' / 'leave-room' / 'delete-room'
  // 4 种实现
  // - in-memory adapter（单进程）
  // - @socket.io/redis-adapter（多进程 Pub/Sub）
  // - @socket.io/postgres-adapter（NOTIFY/LISTEN）
  // - @socket.io/cluster-adapter（node:cluster IPC）
}
// 业务层无感调用
io.to('room-1').emit('foo', data)   // 跨进程代码不变
```

**关键参数**：
- 双 Map = `rooms: Map<Room, Set<SocketId>>` 正向 + `sids: Map<SocketId, Set<Room>>` 反向
- 生命周期 = `create-room / join-room / leave-room / delete-room` 4 EventEmitter 信号
- 横扩 = Redis Pub/Sub / Postgres LISTEN-NOTIFY / node:cluster IPC
- 优势 = 业务 `io.to(room).emit()` 代码跨单/多进程不变
- 风险 = 双 Map 一致性 bug 率比想象中高

**最佳实践**：房间路由用 Adapter 模式（vs. 直接 Redis SET）——事件化生命周期 + 可切换实现；双 Map（rooms + sids）正反向查询 O(1)；4 个 EventEmitter 信号给业务埋点（监控房间数 / 事件追踪）；4 种实现按场景选（单机 / 集群 / 跨数据中心）。

### 模式 3：CSR 连接状态恢复

**问题场景**：HTTP polling 时代用户痛点——刷新页面就丢订阅；移动端切网聊天记录断档；重连后用户要重新 join 所有房间、重新订阅事件。

**解决方案**：`sid + pid` 双 ID + 缓存 missed packets——pid 永不出现在 client 端，恢复时 sid 不变保持上层业务无感；缓存包按序号重发。

```ts
// CSR（Connection State Recovery）
const io = new Server(httpServer, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,  // 2 分钟内可恢复
    skipMiddlewares: true                       // 跳过 auth middleware（重连时）
  }
})
// 服务端：sid + pid
// - sid = 公开 socket.id
// - pid = 私有 session id（存 Redis，2 分钟过期）
// - missedPackets = 缓存发送包
// 客户端：自动恢复
const socket = io({ reconnection: true })
// 用户刷新 → 新连接携带 previousSession
// → 服务端检查 pid → 找到缓存 → 重发 missed packets → 重新 join 房间
```

**关键参数**：
- sid = socket.id（公开）
- pid = private session id（私密，只服务端用）
- 重连 = `previousSession` 透传到 Socket 构造
- 恢复 = `previousSession.rooms.forEach(room => this.join(room))`
- 重发 = `missedPackets.forEach(packet => this.packet({...}))`
- 开关 = 默认关，启用需 `connectionStateRecovery: {...}`

**最佳实践**：长连接重连用 CSR 模式（vs. 业务自己实现 session 同步）——sid 复用 + missed packets 重放；`maxDisconnectionDuration` 2 分钟经验值（移动网络切换典型时长）；`skipMiddlewares: true` 跳过 auth（重连不需要重新鉴权）；客户端自动恢复无需配置。

### 模式 4：BroadcastOperator 不可变链式

**问题场景**：`io.to("a").except("b").compress(true).emit("foo")` 链式过滤——多线程/多请求场景共享 flags 竞争；可变性导致"链中修改影响外部引用"。

**解决方案**：BroadcastOperator 每次链式返回**新对象**——`to(room)` 第一行 `new Set(this.rooms)` 复制原 rooms，emit 时统一 apply flags；并发安全。

```ts
// 不可变 BroadcastOperator
class BroadcastOperator {
  constructor(
    private readonly adapter: Adapter,
    private readonly rooms: Set<Room> = new Set(),
    private readonly except: Set<SocketId> = new Set(),
    private readonly flags: BroadcastFlags = {}
  ) {}
  to(room: Room): BroadcastOperator {
    // 复制原 rooms + 加入新 room
    const rooms = new Set(this.rooms)
    rooms.add(room)
    return new BroadcastOperator(this.adapter, rooms, this.except, this.flags)
  }
  except(socketId: SocketId): BroadcastOperator {
    const except = new Set(this.except)
    except.add(socketId)
    return new BroadcastOperator(this.adapter, this.rooms, except, this.flags)
  }
  compress(compress: boolean): BroadcastOperator {
    return new BroadcastOperator(this.adapter, this.rooms, this.except, { ...this.flags, compress })
  }
  timeout(timeout: number): BroadcastOperator {
    return new BroadcastOperator(this.adapter, this.rooms, this.except, { ...this.flags, timeout })
  }
  emit(ev: string, ...args: any[]): boolean {
    // ACK 检测：args 最后一个是函数
    const ack = typeof args[args.length - 1] === 'function' ? args.pop() : undefined
    const packet = { type: PacketType.EVENT, data: [ev, ...args] }
    return this.adapter.broadcast(packet, {
      rooms: this.rooms,
      except: this.except,
      flags: this.flags
    })
  }
}
```

**关键参数**：
- 不可变 = 每次 `.to/.except/.compress/.timeout` 返回新对象
- flags = rooms / except / flags / volatile
- ACK = `emit(ev, ...args)` 检测 args 最后一个是函数视为 ack
- 批量 = `io.timeout(1000).emit('ev', (err, resps) => ...)` 多节点聚合
- 优势 = 共享状态零竞争

**最佳实践**：链式过滤 API 用不可变模式（vs. mutable builder）——并发安全 + 调试可观察；每次链式调用 `new Set(...)` 复制（深浅按需）；emit 时统一 apply flags 给底层 adapter；ACK 检测看"最后一个参数是不是函数"。

### 模式 5：泛型事件契约

**问题场景**：纯 JS 框架拼错事件名运行时才发现；`socket.emit("foo")` 的参数类型在 IDE 里看不到；大型项目事件名/参数类型全靠约定。

**解决方案**：`Server<ListenEvents, EmitEvents, ServerSideEvents, SocketData>` 4 泛型 + `StrictEventEmitter` 装饰原生 EventEmitter——编译期防止事件名/参数类型错。

```ts
// 4 泛型事件契约
interface ServerToClientEvents {
  chat: (msg: { user: string; text: string }) => void
  notify: (data: { type: 'info' | 'warn' | 'error'; text: string }) => void
}
interface ClientToServerEvents {
  'join-room': (room: string) => void
  'send-msg': (msg: string) => void
}
interface InterServerEvents {
  ping: () => void
}
interface SocketData {
  userId: string
  role: 'admin' | 'user'
}
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer)
// 编译期类型检查
io.on('connection', (socket) => {
  socket.on('send-msg', (msg) => {
    // msg 推断为 string（来自 ClientToServerEvents）
    msg.toUpperCase()  // OK
    // msg * 2  // ❌ TS 报错
    io.emit('chat', { user: 'alice', text: msg })  // chat 必传 { user, text }
  })
})
// tsd 测试类型推断
// test/socket.test-d.ts
import { expectType } from 'tsd'
expectType<string>(msg)  // 编译期断言
```

**关键参数**：
- 4 泛型 = Listen / Emit / ServerSide / SocketData
- 透传 = Server / Namespace / Socket / BroadcastOperator 四层一致
- ack 推断 = `EventNamesWithAck<Map>` 条件类型识别 ack 事件
- 工具 = `tsd` 在 CI 跑类型推断断言
- 价值 = 大型团队协作编译期防线

**最佳实践**：纯 JS 框架上 TS 4 泛型（vs. any）——是 GraphQL/EventBus/Worker 池通用范本；4 泛型按"流向"切分（client→server / server→client / inter-server / socket data）；tsd 工具跑类型推断断言（避免 ts-only 类型 bug）；StrictEventEmitter 防止拼错事件名。

---

## 第二段：传输与协议 - 升级、心跳、ACK

### 模式 6：传输升级（polling → websocket）

**问题场景**：企业代理拦 WebSocket；纯 polling 又慢；用户初次连接卡 200ms；想要"先兼容再升级"。

**解决方案**：默认先 polling 兼容，异步 upgrade 到 WebSocket——期间所有 packet 缓存到 writeBuffer，升级完成后 flush 出去，应用层完全透明。

```ts
// Engine.IO 传输升级
// 1. HTTP GET /socket.io/?EIO=4&transport=polling
// 2. 客户端用 XHR 长轮询
// 3. 客户端发起 WebSocket upgrade：POST /socket.io/?EIO=4&transport=websocket
// 4. 服务端 handleUpgrade 触发 101 Switching Protocols
// 5. writeBuffer 中的 packet 立即 flush
class WebSocket extends Transport {
  upgrade() {
    this.socket.on('upgrade', () => {
      // 切到 ws
      this.transport = wsTransport
      // 缓存的包立即发出
      this.writeBuffer.forEach(packet => wsTransport.send(packet))
      this.writeBuffer = []
    })
  }
}
// 用户无感：业务代码一直是 io.emit('chat', msg)
```

**关键参数**：
- 升级 = handleUpgrade 触发 101 Switching Protocols
- 缓冲 = writeBuffer 缓存升级期 packet
- 顺序 = HTTP GET /socket.io/?EIO=4&transport=polling → 升级 → WS
- 优势 = 业务无感
- 备选 = WebTransport（QUIC/HTTP3，实验）

**最佳实践**：长连接默认 polling→ws 升级（vs. 强制 ws）——兼容 99% 网络环境；upgrade 期间 packet 缓存到 writeBuffer（不丢包）；WebTransport（QUIC/HTTP3）是 2026 备选（实验性）；CORS/WS 失败时 fallback polling（socket.io 自动）。

### 模式 7：动态命名空间（ParentNamespace）

**问题场景**：用户房间 id 动态（`/room-123`、`/room-456`）——预创建 N 个 namespace 浪费；正则匹配走 io 一次广播到所有匹配。

**解决方案**：`io.of(/^\/room-\d+$/)` 返回 ParentNamespace，emit 时 `forEach(nsp => nsp.emit(...))` fan-out 到所有匹配 nsp；自动回收空 nsp。

```ts
// 动态命名空间
const parent = io.of(/^\/room-\d+$/)
// 客户端连接 /room-123
const socket = io('/room-123')  // 自动匹配 ParentNamespace 并创建子 nsp
// 父 nsp 一次广播
parent.emit('announce', '系统通知')  // fan-out 到所有 /room-* nsp
// 子 nsp 监听（connection 继承父）
parent.on('connection', (socket) => {
  console.log('连接到子命名空间:', socket.nsp.name)
})
// 配置自动回收
const io = new Server(httpServer, {
  cleanupEmptyChildNamespaces: true   // 60s 内无 socket 自动清理
})
// 内部名 = '/_<count>' 避免与用户冲突
```

**关键参数**：
- 内部名 = `/_<count>` 避免与用户命名空间冲突
- 中间件继承 = `createChild` 时复制父 `_fns`
- 监听继承 = `connection` 监听器复制
- 自动回收 = `cleanupEmptyChildNamespaces` 配置开关
- 单进程 = 0 额外 RPC，跨节点用 Redis adapter

**最佳实践**：动态业务频道用 ParentNamespace（vs. 预创建 N 个 nsp）——按需创建 + 跨频道广播；正则匹配路径自动创建子 nsp；中间件和 connection 监听继承父 nsp；`cleanupEmptyChildNamespaces: true` 避免内存泄漏；跨进程用 Redis adapter 同步子 nsp。

### 模式 8：Pre-encoded WebSocket 帧优化

**问题场景**：聊天高 QPS 场景 CPU 瓶颈在"packet → JSON → ws 库 → frame" 多次序列化；单 socket 1000 msg/s 时 CPU 占 60%。

**解决方案**：adapter 直接生成 ws 帧（`wsPreEncodedFrame`），socket.io 调 `_sender.sendFrame` 跳过 ws 库内部 mask/分片组装；省 15-20% CPU。

```ts
// pre-encoded 路径
// 检查：满足条件才走预编码
if (encodedPackets.length === 1 && typeof encodedPackets[0] === 'string') {
  const packet = encodedPackets[0]
  // 直接调 ws 库生成 frame
  const frame = WebSocket.Sender.frame(packet, {
    mask: false,    // 服务端发，mask=false
    rsv1: false,
    opcode: 1       // text frame
  })
  // 跳过 socket.io 内部 _sender
  transport._socket.write(frame)
}
// 路径：adapter.broadcast → pre-encoded → transport.send（直接 ws.write）
// 不走：adapter.broadcast → _sender.sendPacket → _parser.encode → _sender.doWrite
```

**关键参数**：
- 检查 = `canPreComputeFrame && encodedPackets.length === 1 && typeof === "string"`
- 生成 = `WebSocket.Sender.frame(data, { mask: false, rsv1: false, opcode: 1 })`
- 路径 = adapter.broadcast → pre-encoded → transport.send
- 提升 = 15-20% CPU（高 QPS 聊天场景）
- 条件 = 单 packet 字符串编码

**最佳实践**：高 QPS 长连接走预编码路径（vs. 每次 JSON.stringify）——CPU 优化 20%；单 packet 字符串编码才走（多 packet / 二进制不走）；跳过 socket.io 内部 _sender（直接 ws 库 Sender.frame）；monitor 用 prom-client 验证 CPU 收益。

### 模式 9：心跳 + ping/pong 防止 NAT 切断

**问题场景**：NAT/防火墙 60s idle 切长连接；用户没业务消息时连接假死；服务端不知道客户端是 alive 还是 dead。

**解决方案**：Engine.IO 协议层 25s ping/pong 心跳（独立于应用层事件）——保持 NAT 映射 + 检测半死连接；ping 超时触发 close。

```ts
// Engine.IO 心跳
// 服务端 25s 发 PING (Engine Packet type 2)
// 客户端 20s 内必须回 PONG (type 3)
// 超时 → 触发 close → 客户端自动重连
// 协议层（独立于 socket.emit 业务事件）
class Socket {
  private pingInterval: NodeJS.Timeout
  private pingTimeout: NodeJS.Timeout
  setupHeartbeat() {
    this.pingInterval = setInterval(() => {
      this.sendPacket(PacketType.PING, { data: 'probe' })
      this.pingTimeout = setTimeout(() => {
        // pong timeout
        this.close()
      }, 20 * 1000)
    }, 25 * 1000)
  }
}
// 客户端响应
socket.on('packet', (packet) => {
  if (packet.type === PacketType.PING) {
    socket.sendPacket(PacketType.PONG)  // 立即响应
  }
})
```

**关键参数**：
- 间隔 = 25s ping / 20s pong timeout
- 协议 = Engine Packet type 2 (PING) / 3 (PONG)
- 心跳方向 = v3 客户端主导 / v4 服务端主导（NAT 友好）
- 协议层 = 不依赖应用层
- 兜底 = ping timeout 触发 close 事件

**最佳实践**：长连接 25s ping/pong（vs. 60s+）——NAT 留一半余量 + 早检测半死；服务端主导心跳（v4+）避免客户端被防火墙拦；ping timeout = 20s 留 5s buffer；应用层心跳不要与协议层重叠（浪费带宽）。

### 模式 10：ACK 协议（请求-响应匹配）

**问题场景**：TCP 是字节流不是消息队列；emit 出去的请求怎么对应回包；多次并发请求怎么不串？

**解决方案**：`emit('event', data, ackCallback)` 把 ack 挂到 `acks: Map<id, callback>`，服务端响应 `{id:42, data:...}` 客户端解包回调；单调递增 id 唯一标识。

```ts
// ACK 协议
// 客户端
socket.emit('getUser', { id: 1 }, (response) => {
  console.log('user:', response)  // 收到服务端回包
})
// 内部：分配 id
const id = ++this.ids
this.acks.set(id, ack)
const packet = { id, type: PacketType.ACK, data: [id, ...args] }
this.sendPacket(packet)
// 服务端
socket.on('getUser', (data, ack) => {
  const user = db.findById(data.id)
  ack(user)  // 触发客户端回调
})
// 协议：42["event", data] + 431[42, "ack-reply"]
// 超时 = socket.timeout(5000).emit('getUser', { id: 1 }, (err, res) => {...})
```

**关键参数**：
- ID = 自增 `this.ids`，单调不复用
- 数据结构 = `acks.set(nsp, ++this.ids, ack)`
- 超时 = `{timeout: 5000}` 显式传
- 协议 = 42["event", data] + 431[42, "ack-reply"]
- 复用 = 同一 packet 通道带 id，最大限度复用 payload

**最佳实践**：长连接请求-响应走 ack 协议（vs. 自开 RPC 通道）——复用 payload + 编译期类型；id 单调递增不复用（避免重连错乱）；`socket.timeout(5000)` 显式超时（默认无超时）；ack 回调最后一个参数是 function（不是 error-first）。

---

## 第三段：生态与工程实践 - monorepo、测试与示例

### 模式 11：协议 v3/v4 双轨制兼容

**问题场景**：老业务 v2 客户端（EIO=3 协议）在线，强制升 v4 会让老客户端全断；企业客户要求平滑过渡。

**解决方案**：`allowEIO3: true` + Socket 构造中 `if (client.conn.protocol === 3) this.id = nsp.name + '#' + client.id`——保留旧协议分支；id 格式按协议分支。

```ts
// 双协议支持
const io = new Server(httpServer, {
  allowEIO3: true,    // 接受老客户端
  // 内部：Socket.id 按协议生成
  // v3: '<nspName>#<clientId>' 字符串拼接
  // v4: base64id 8 字节
})
// 心跳方向按协议分支
// v3: 客户端主导（30s ping/pong）
// v4: 服务端主导（25s ping/pong）
// 协议层（Engine）做兼容，业务层无感
// 代价 = 核心路径 if 分支增加心智负担
```

**关键参数**：
- 开关 = `allowEIO3: true` 接受老客户端
- ID 生成 = v3 用 `nspName#clientId` / v4 用 base64id
- 心跳 = v3 客户端主导 / v4 服务端主导
- 代价 = 核心路径写 if 分支增加心智负担
- 适用 = 企业级框架老业务平滑升级

**最佳实践**：企业级框架保留双协议分支（vs. 强制升）——平滑迁移 + 不激怒老用户；`allowEIO3: true` 是 v4 临时兼容开关（v5 移除）；id 格式按协议分支用 if 兜底；老的 v3 协议只接受只读，警告用户升级。

### 模式 12：12 个子包 monorepo 拆分

**问题场景**：单包 socket.io 难演进；parser / engine / adapter 各自版本独立；用户想单独用 engine.io-client 而不引入 socket.io。

**解决方案**：npm workspaces 12 个子包——engine.io / engine.io-client / engine.io-parser / socket.io / socket.io-client / socket.io-parser / socket.io-adapter / 4 个 cluster-emitter / component-emitter；各自独立发版。

```json
// root package.json
{
  "workspaces": [
    "packages/engine.io",
    "packages/engine.io-client",
    "packages/engine.io-parser",
    "packages/socket.io",
    "packages/socket.io-client",
    "packages/socket.io-parser",
    "packages/socket.io-adapter",
    "packages/socket.io-cluster-engine",
    "packages/socket.io-component-emitter"
  ]
}
// 12 个子包
// engine.io / engine.io-client  = 传输层
// engine.io-parser = Engine 帧编解码
// socket.io / socket.io-client = 业务层
// socket.io-parser = Socket 业务包编解码
// socket.io-adapter = 房间路由抽象
// socket.io-cluster-engine = node:cluster 引擎
// socket.io-component-emitter = 1KB EventEmitter
// CI：12 个 GitHub Actions workflow 独立发版
```

**关键参数**：
- 管理 = `npm workspaces` 12 个子包
- 独立性 = 每个子包 `package.json` + `tsconfig.json` + `test/`
- CI = 12 个 GitHub Actions workflow 每个子包独立
- 替代 = Lerna / Nx / Turborepo（项目用 npm 原生）
- 代价 = 版本同步成本 + lockfile 维护

**最佳实践**：大库用 npm workspaces monorepo（vs. 单包）——独立发版 + 子包可单独用；npm 原生 workspaces 够用（不必 Lerna）；子包间用 `workspace:*` 协议同步；CI 每个子包独立 workflow（失败定位快）；CHANGELOG 同步（lerna-changelog 自动化）。

### 模式 13：ParentBroadcastAdapter 跨 nsp 广播

**问题场景**：`io.of(/^\/admin-/).emit('foo')` 跨多个匹配 nsp 广播——单 adapter 只能管单 nsp；自己遍历性能差。

**解决方案**：ParentNamespace 自带 `ParentBroadcastAdapter`——跳过单 nsp broadcast 改 `forEach(child => child.adapter.broadcast(...))`；fan-out 到所有 children。

```ts
// ParentBroadcastAdapter
class ParentBroadcastAdapter extends Adapter {
  broadcast(packet, opts) {
    // 跳过单 nsp broadcast
    return new Promise((resolve) => {
      const childPromises = []
      // 遍历 children
      for (const child of this.children.values()) {
        // 各自调 broadcast
        childPromises.push(child.adapter.broadcast(packet, opts))
      }
      Promise.all(childPromises).then(resolve)
    })
  }
}
// 跨进程：Redis adapter fan-out
// 单进程：0 RPC（直接内存 forEach）
// 适用：多租户 SaaS / 动态业务频道
```

**关键参数**：
- 重写 = ParentBroadcastAdapter 替换 `broadcast(packet, opts)` 方法
- fan-out = 遍历 children 各自调 broadcast
- 单进程 = 0 RPC
- 跨进程 = 走 Redis adapter fan-out
- 适用 = 多租户 / 动态业务频道

**最佳实践**：动态命名空间配 ParentBroadcastAdapter（vs. 自己遍历）——单 adapter 模式扩展到跨 nsp；自动继承 children 关系（无需手动 add）；跨进程走 Redis adapter 同步（不要自己实现 RPC）；监控 children 数量（避免内存爆炸）。

### 模式 14：30+ 集成示例（examples/）

**问题场景**：新手接入想看 Next.js / Nuxt / NestJS / React Native 怎么用——光看 API 文档不够；用户要"照抄就能跑"。

**解决方案**：examples/ 目录 30+ 集成示例——chat / white-board / cluster-nginx / private-messaging / WebTransport——是接入文档的延伸；覆盖主流框架 + 部署场景。

```bash
# examples/ 目录
chat/                    # 基础聊天
white-board/             # 协作白板（CRDT）
cluster-nginx/           # Nginx LB 集群
cluster-haproxy/         # HAProxy LB 集群
cluster-traefik/         # Traefik LB 集群
private-messaging/       # 端到端加密
webtransport/            # WebTransport 实验
nextjs-server/           # Next.js 服务端
nuxt3/                   # Nuxt 3
nestjs-gateway/          # NestJS 网关
react-native/            # RN 客户端
unity3d/                 # Unity 客户端
wechat-miniprogram/      # 微信小程序
// 30+ 示例覆盖：
// - 框架（Next / Nuxt / Nest / RN / Express / Passport）
// - 集群（3 种 LB）
// - 私有（端到端加密）
// - 协议（WebTransport 实验）
```

**关键参数**：
- 覆盖 = 30+ 框架（Next / Nuxt / Nest / RN / Express / Passport）
- 集群 = cluster-nginx / cluster-haproxy / cluster-traefik 三个 LB 示例
- 私有 = private-messaging（端到端加密聊天）
- 协议 = 包含 WebTransport 实验示例
- 价值 = 用户照抄就能跑

**最佳实践**：库必带 30+ 集成示例（vs. 单 README）——降低接入门槛 10x；每个示例必含 README（启动命令 + 端口 + 关键点）；集群示例给 nginx.conf / haproxy.cfg（运维直接抄）；示例要"可运行"（不是伪代码）。

### 模式 15：Protocol Test Suite 协议一致性

**问题场景**：第三方实现 socket.io 协议——没有标准测试套件验证兼容性；用户自实现客户端/服务端不放心。

**解决方案**：`docs/socket.io-protocol/v5-test-suite/` 是**完整可执行 W3C-style 测试规范**——任何想兼容 v5 协议的客户端/服务端都跑这套；硬保证 + 跨实现兼容。

```ts
// docs/socket.io-protocol/v5-test-suite/
// 形态：完整可执行 spec（W3C-style）
// 1. 协议握手测试
//    - CONNECT packet 格式
//    - 0{NSP} 编码（默认 nsp）
//    - 40{"sid":...} SIO 响应
// 2. 心跳测试
//    - 2 (PING) 客户端收到
//    - 3 (PONG) 响应
//    - ping timeout 触发 close
// 3. 事件测试
//    - 42["event", data] 编码
//    - 42["event", data, ack] 编码
// 4. ACK 测试
//    - 43[id, ...data] 编码
//    - 超时机制
// 5. 命名空间测试
//    - 40/admin nsp 切换
//    - 40/admin,{"token":"x"} 自定义数据
// 范围：跨语言 conformance test（Node + 浏览器 + Python + Go + Java）
```

**关键参数**：
- 位置 = `docs/*-protocol/v*-test-suite/`
- 形态 = 完整可执行 spec
- 范围 = 跨语言 conformance test（Node + 浏览器）
- 价值 = 协议和参考实现分离
- 协议 = IETF/MIT 风格（vs. 单纯 RFC doc）

**最佳实践**：协议层项目用 conformance test suite（vs. 单纯文档）——硬保证 + 跨实现兼容；W3C-style 测试可执行（不只是文档）；跨语言一致（Node + 浏览器 + Python）；3rd party 实现必跑 test suite 标"compatible"。

---

## 第四段：生产实战 - 选型、横扩与复刻

### 模式 16：选型 socket.io vs ws vs uWS vs Centrifugo

**问题场景**：实时通信框架选型——socket.io / 裸 ws / uWS / Centrifugo / SSE / 商业 SaaS？功能/性能/易用三维度。

**解决方案**：决策树——易用 + 功能强选 socket.io；极致性能选 uWS（手写协议）；托管省运维选 Pusher/Ably；服务端广播选 Centrifugo。

```ts
// 选型决策
function pickRealtime(requirement) {
  if (requirement.managed) return 'pusher/ably'  // 商业 SaaS 省运维
  if (requirement.performance === 'extreme') return 'uWebSockets.js'  // 单核 100K+ 连接
  if (requirement.broadcastHeavy) return 'centrifugo'  // 服务端广播优化
  if (requirement.simpleOneWay) return 'sse'  // 单向推送（HTTP）
  return 'socket.io'  // 90% Web 实时应用
}
// 性能对比
// socket.io:  易用 9/10 + 功能 9/10 + 性能 7/10
// 裸 ws:      易用 3/10 + 功能 4/10 + 性能 9/10
// uWS:        易用 4/10 + 功能 5/10 + 性能 10/10（单核 100K+ 连接）
// Centrifugo: 易用 5/10 + 功能 8.5/10 + 性能 8/10
// SSE:        易用 7/10 + 功能 3/10（单向）
// 商业:       Pusher/Ably 省运维 + 月费
```

**关键参数**：
- socket.io = 易用 9/10 + 功能 9/10 + 性能 7/10
- 裸 ws = 易用 3/10 + 功能 4/10 + 性能 9/10
- uWS = 易用 4/10 + 功能 5/10 + 性能 10/10（单核 100K+ 连接）
- Centrifugo = 易用 5/10 + 功能 8.5/10 + 性能 8/10
- SSE = 易用 7/10 + 功能 3/10（单向）
- 商业 = Pusher/Ably 省运维 + 月费

**最佳实践**：90% Web 实时应用选 socket.io（功能/易用平衡）；极致性能选 uWS；省运维选 SaaS；聊天 / 协作 / 直播 = socket.io；金融高频交易 = uWS；服务端推流 = Centrifugo；单向通知 = SSE。

### 模式 17：横扩方案 Redis vs Cluster Engine

**问题场景**：单进程 socket.io 撑不住 50K 连接——多机横扩选 Redis adapter 还是 Cluster Engine？性能/部署成本权衡。

**解决方案**：决策——零外部依赖用 Cluster Engine（node:cluster IPC，比 Redis 快 5-10x）；已有 Redis 基础设施用 socket.io-redis-streams-emitter；跨数据中心用 Redis。

```ts
// 选型决策
// 1. Cluster Engine（零外部依赖）
//    - node:cluster IPC（同机多核）
//    - Redis pub/sub 兜底（多机）
//    - 性能：IPC > Redis 单机 > Redis 跨机
// 2. Redis adapter
//    - 跨数据中心
//    - 已有 Redis 基础设施
//    - 性能：< Cluster Engine
// 3. Postgres adapter
//    - 已有 Postgres
//    - NOTIFY 通道
//    - 性能：< Redis
// 4. Kafka / NATS adapter
//    - 已有消息队列
//    - 大规模横扩
//    - 性能：高吞吐 + 持久化
// 配置
const io = new Server(httpServer, {
  adapter: createClusterEngine()   // 零外部依赖
})
// 或
const io = new Server(httpServer, {
  adapter: createRedisAdapter({ pubClient, subClient })
})
```

**关键参数**：
- Cluster Engine = node:cluster + Redis pub/sub 兜底
- Redis = 跨数据中心 + 已有基础设施
- Postgres = NOTIFY 通道
- 性能 = IPC > Redis 单机 > Redis 跨机
- 兜底 = Cluster Engine 断电用 Redis

**最佳实践**：横扩首选 Cluster Engine（IPC 零依赖）——比 Redis Pub/Sub 快 5-10x；同机多进程用 IPC（零网络开销）；跨机用 Redis；监控 adapter 延迟（prom-client + histogram）；Kafka/NATS 是大规模（百万级）横扩备选。

### 模式 18：生产实战配置清单

**问题场景**：socket.io 上生产——优雅停服、限流、链路追踪、健康检查怎么做？避免"上线即翻车"。

**解决方案**：实战清单——`io.disconnectSockets(true)` 主动断开 + `io.engine.clientsCount` 暴露 /healthz + `io.use` 注入 traceId + maxHttpBufferSize 默认 100KB；7 个必开项。

```ts
// 生产配置清单
const io = new Server(httpServer, {
  // 1. 启用 CSR（用户重连不丢订阅）
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  },
  // 2. 限制包大小（防 DoS）
  maxHttpBufferSize: 100 * 1024,  // 100KB
  // 3. 心跳配置
  pingInterval: 25000,
  pingTimeout: 20000,
  // 4. 优雅停服
  cors: { origin: ['https://app.example.com'] },
  // 5. 适配器
  adapter: createRedisAdapter({ ... })
})
// 6. 链路追踪
io.use((socket, next) => {
  const traceId = randomUUID()
  socket.data.traceId = traceId
  next()
})
// 7. 健康检查
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', clients: io.engine.clientsCount })
})
// 优雅停服
process.on('SIGTERM', async () => {
  await io.disconnectSockets(true)  // 主动断所有 socket
  await new Promise((resolve) => httpServer.close(resolve))
  process.exit(0)
})
```

**关键参数**：
- 热更新 = `io.adapter()` setter 替换 / `pm2 reload`
- 停服 = `io.disconnectSockets(true)` + `httpServer.close()`
- 限流 = maxHttpBufferSize（100KB）+ 应用层连接数限流
- 追踪 = `io.use((s, n) => { s.data.traceId = ...; n() })`
- 健康 = `io.engine.clientsCount` 暴露 /healthz
- 日志 = `DEBUG=socket.io:*` 启动

**最佳实践**：socket.io 生产必开 `connectionStateRecovery` + 优雅停服 + 自定义 /healthz；pm2 reload 触发 graceful shutdown；K8s preStop hook 给 30s 让 client 重连；prom-client 暴露 /metrics（clientsCount / eventsTotal）。

### 模式 19：TypeScript 4 泛型事件契约实战

**问题场景**：大型项目 socket.emit 事件名拼错 / 参数类型错——运行时才崩；新人接手不知事件协议；多人协作事件名冲突。

**解决方案**：定义 `Server<ListenEvents, EmitEvents, ServerSideEvents, SocketData>` 4 泛型 + IDE 自动补全 + 编译期防错；4 泛型按"流向"切分。

```ts
// 完整 4 泛型定义
interface ServerToClientEvents {
  chat: (msg: { user: string; text: string; ts: number }) => void
  notify: (data: { type: 'info' | 'warn' | 'error'; text: string }) => void
  'user-joined': (user: { id: string; name: string }) => void
}
interface ClientToServerEvents {
  'join-room': (room: string, ack: (success: boolean) => void) => void
  'send-msg': (msg: string, ack: (res: { id: string }) => void) => void
  'typing': (isTyping: boolean) => void
}
interface InterServerEvents {
  ping: () => void
}
interface SocketData {
  userId: string
  role: 'admin' | 'user'
  rooms: Set<string>
}
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer)
// 编译期类型检查
io.on('connection', (socket) => {
  // socket.data 推断为 SocketData
  console.log(socket.data.userId)
  socket.on('send-msg', (msg, ack) => {
    // msg 推断为 string
    // ack 推断为 (res: { id: string }) => void
    const id = randomUUID()
    io.emit('chat', { user: socket.data.userId, text: msg, ts: Date.now() })
    ack({ id })
  })
})
// tsd 测试
// test/types.test-d.ts
import { expectType, expectError } from 'tsd'
expectType<(msg: { user: string; text: string; ts: number }) => void>(io.emit.bind(io))
```

**关键参数**：
- 4 泛型 = Listen / Emit / ServerSide / SocketData
- 定义 = `interface ServerToClientEvents { chat: (msg: string) => void }`
- 透传 = Namespace / Socket / BroadcastOperator 三层一致
- 推断 = `socket.on('chat', (msg) => msg.toUpperCase())` 编译期推 string
- 工具 = `tsd` 在 test/*.test-d.ts 跑类型断言

**最佳实践**：TS 项目用 4 泛型 + tsd（vs. any）——编译期防线 + IDE 智能补全；4 泛型按流向切分（client→server / server→client / inter-server / socket data）；tsd 跑类型推断断言（避免 ts-only 类型 bug）；SocketData 存用户上下文（userId / role / rooms）。

### 模式 20：7 天复刻 mini-socket.io 路线

**问题场景**：想理解 socket.io 协议 + 传输 + 适配器三层架构；想 7 天复刻 MVP；想要 teach-by-doing 练手。

**解决方案**：7 天 MVP——Day 1-2 传输层（WebSocket + 心跳 + polling 升级），Day 3-4 业务层（Namespace + Socket + Client），Day 5 协议（parser v5 编解码），Day 6 InMemoryAdapter + Redis，Day 7 CSR + 测试。

```bash
# Day 1-2: 传输层
mkdir mini-sio && cd mini-sio
npm init -y
# src/engine.io.js
#   - 长轮询（HTTP GET /socket.io/?EIO=4&transport=polling）
#   - WS 升级（WebSocket Server）
#   - 25s ping/pong
#   - writeBuffer 缓存升级期包
# 测试：node src/engine.io.js + wscat -c ws://localhost:3000

# Day 3-4: 业务层
# src/socket.io.js
#   - class Namespace { sockets: Map, name }
#   - class Server { of(nsp), to(room), emit() }
#   - class Client { id, conn, nsp, data }
# 测试：io.of('/chat').to('room1').emit('msg', 'hello')

# Day 5: 协议（parser v5）
# src/parser.js
#   - 编码：42["event", data] / 431[42, "ack-reply"]
#   - 解码：split packet type + data
#   - BINARY_EVENT（5 字节 placeholder）
# 测试：parser.encode({ type: 2, data: ['event', 'hello'] })

# Day 6: Adapter
# src/adapter.js
#   - InMemoryAdapter（Map<Room, Set<SocketId>>）
#   - RedisAdapter（pub/sub 跨进程）
# 测试：两进程 io.to('room1').emit('msg')

# Day 7: CSR + 测试
# src/csr.js
#   - sid + pid + missedPackets
#   - previousSession 透传
# 测试：断网 2 分钟内重连，missedPackets 重发
```

**关键参数**：
- 核心 = 协议分层（Engine + Socket）
- 协议 = v5（EVENT / ACK / BINARY_EVENT / CONNECT）
- 房间 = 双 Map + Adapter
- 性能 = pre-encoded ws frame
- 复刻难度 = 核心 1500 行可讲清，全栈 5-7 天

**最佳实践**：复刻 mini-socket.io 先做 Engine + Namespace + Adapter——核心 1500 行 2 周能出可用品；放弃 4 泛型 + monorepo（生产级特性）；30+ examples 必带（chat / cluster-nginx / private-messaging）；Protocol Test Suite 是 3rd party 实现的硬保证。

---

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
