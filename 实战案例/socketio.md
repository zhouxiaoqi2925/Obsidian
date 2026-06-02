# socketio - 11 包 monorepo + 4 泛型事件契约实时通信框架

**GitHub**: socketio/socket.io
**Star**: 61k+
**语言**: TypeScript
**主题**: realtime-framework / websocket / nodejs / typescript-strict
**适用场景**: 学习跨浏览器实时通信、协议双轨制兼容、4 泛型条件类型、Adapter 模式横扩

---

## 第一段：协议栈与抽象层 - 11 包分层

### 模式 1：Engine.IO 与 Socket.IO 严格分层

**问题场景**：实时通信框架经常把"传输"和"业务语义"耦合——换 WebTransport 要改 emit API 怎么办？用户希望"换底层不碰业务"。

**解决方案**：两层独立协议栈——Engine 只管"字节 + 心跳 + 升级"，Socket 只管"事件 + 命名空间 + 房间"，接口 4 事件 + 2 方法；可独立替换实现。

```ts
// Engine.IO 传输层（engine.io / engine.io-client）
// 4 事件 + 2 方法
interface EngineSocket {
  on(event: 'open' | 'message' | 'close' | 'error', listener): this
  on(event: 'packet', listener: (packet: Packet) => void): this
  send(message: string | ArrayBuffer | Blob | ArrayBufferView): void
  close(): void
}
// Socket.IO 业务层（socket.io / socket.io-client）
// 事件语义
interface ServerSideSocket<L, E, S, D> {
  emit<EK extends keyof E>(event: EK, ...args: E[EK] extends (...args: any) => any ? Parameters<E[EK]> : never[]): boolean
  on<LK extends keyof L>(event: LK, listener: L[LK]): this
  join(room: string): Promise<void> | void
  to(room: string): BroadcastOperator
}
// Engine.IO 处理物理层（WebSocket / polling / upgrade / ping/pong）
// Socket.IO 处理应用层（EVENT / ACK / BINARY_EVENT / CONNECT_ERROR）
// 协议版本 = EIO=4（Engine）+ v5（Socket）独立演进
```

**关键参数**：
- 接口 = 4 事件（open/data/error/close）+ 2 方法（send/close）
- 传输 = polling / websocket / webtransport 可选
- 协议 = EIO=4（Engine）+ v5（Socket）
- 优势 = 换 uWS 不碰语义层 / 换 msgpack-parser 不碰传输层
- 代价 = 两层握手 + 版本同步

**最佳实践**：实时通信按"传输 + 业务"分层（vs. 揉成一团）——独立演进 + 替换实现；Engine 与 Socket 各有自己的协议版本号；换传输层不影响业务代码（emit API 保持一致）；换业务 parser 不影响传输（msgpack / protobuf 替代 JSON）。

### 模式 2：Adapter 模式解耦广播

**问题场景**：`io.to('room').emit()` 单进程走 Map，多进程必须让所有节点同步房间状态——业务层不能感知差异；用户要"业务代码一次写，单进程/多进程都能跑"。

**解决方案**：`socket.io-adapter` 抽象 7 个方法——`InMemoryAdapter` / `ClusterAdapter` / `PostgresAdapter` 实现同一接口，业务层无感；4 必实现方法。

```ts
// socket.io-adapter 抽象
abstract class Adapter {
  rooms: Map<Room, Set<SocketId>>  // 正向
  sids: Map<SocketId, Set<Room>>   // 反向
  // 4 必实现方法
  abstract addAll(id: SocketId, rooms: Set<Room>): Promise<void>
  abstract delAll(id: SocketId): Promise<void>
  abstract broadcast(packet: any, opts: BroadcastOptions): Promise<void>
  abstract broadcastWithAck(packet: any, opts: BroadcastOptions, requestId: string): Promise<number>
  // 4 个 EventEmitter 信号
  // 'create-room' / 'join-room' / 'leave-room' / 'delete-room'
  // 4 种实现
  // - InMemoryAdapter（单进程）
  // - ClusterAdapter（node:cluster IPC）
  // - RedisAdapter（Pub/Sub 多机）
  // - PostgresAdapter（NOTIFY/LISTEN）
}
// 业务层无感调用
io.to('room-1').emit('foo', data)   // 跨进程代码不变
```

**关键参数**：
- 双 Map = `rooms: Map<Room, Set<SocketId>>` + `sids: Map<SocketId, Set<Room>>`
- 契约 = `addAll / delAll / broadcast / broadcastWithAck` 4 必实现
- 跨进程 = Redis Pub/Sub / Postgres LISTEN-NOTIFY / node:cluster IPC
- 优势 = 业务 `io.to('room').emit()` 代码跨单/多进程不变
- 性能 = 双 Map O(1) 正反向查

**最佳实践**：房间路由用 Adapter 模式（vs. 直接 Redis SET）——业务无感 + 4 种实现可切换；4 必实现方法是契约；EventEmitter 信号给业务埋点（监控房间数 / 事件追踪）；选型 = 单机 InMemory，集群 Cluster（同机），跨机 Redis。

### 模式 3：4 泛型条件类型事件契约

**问题场景**：纯 JS 框架拼错事件名 / 类型错——运行时才崩；IDE 看不到 `socket.emit('foo')` 的参数类型；大型项目事件名/参数类型全靠约定。

**解决方案**：`Server<ListenEvents, EmitEvents, ServerSideEvents, SocketData>` 4 泛型 + `StrictEventEmitter` 装饰原生 EventEmitter——编译期防止事件名/参数类型错；ack 推断用条件类型。

```ts
// 4 泛型事件契约
interface ServerToClientEvents {
  chat: (msg: { user: string; text: string; ts: number }) => void
  notify: (data: { type: 'info' | 'warn' | 'error'; text: string }) => void
}
interface ClientToServerEvents {
  'join-room': (room: string, ack: (success: boolean) => void) => void
  'send-msg': (msg: string) => void
  'send-msg-with-ack': (msg: string, ack: (res: { id: string }) => void) => void
}
interface InterServerEvents {
  ping: () => void
}
interface SocketData {
  userId: string
  role: 'admin' | 'user'
}
// 4 泛型
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer)
// 条件类型：EventNamesWithAck 识别 ack 事件
type EventNamesWithAck<Map extends Record<string, (...args: any) => any>> = {
  [K in keyof Map]: ReturnType<Map[K]> extends void ? never : K
}[keyof Map]
// socket.on('send-msg-with-ack', (msg, ack) => {})  // 自动推 ack
// socket.on('send-msg', (msg) => {})  // 没有 ack 参数
// tsd 测试类型推断
import { expectType, expectError } from 'tsd'
expectType<(msg: { user: string; text: string; ts: number }) => void>(io.emit.bind(io))
```

**关键参数**：
- 4 泛型 = Listen / Emit / ServerSide / SocketData
- 透传 = Server / Namespace / Socket / BroadcastOperator 四层一致
- ack 推断 = `EventNamesWithAck<Map>` 条件类型识别 ack 事件
- 工具 = `tsd` 跑类型推断断言
- 价值 = 大型团队编译期防线

**最佳实践**：纯 JS 框架上 TS 4 泛型（vs. any）——是 GraphQL/EventBus/Worker 池通用范本；4 泛型按"流向"切分（client→server / server→client / inter-server / socket data）；ack 用条件类型推断（return type = void vs 别的）；tsd 在 CI 跑类型断言。

### 模式 4：CSR Connection State Recovery

**问题场景**：HTTP polling 时代用户痛点——刷新页面就丢订阅；移动端切网聊天记录断档；重连后用户要重新 join 所有房间、重新订阅事件。

**解决方案**：CSR 模式——`previousSession` 透传到 Socket 构造，恢复 rooms + 重发 missedPackets，业务层无感；`skipMiddlewares` 跳过 auth middleware。

```ts
// CSR 配置
const io = new Server(httpServer, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,  // 2 分钟内可恢复
    skipMiddlewares: true                       // 跳过 auth（重连时）
  }
})
// 客户端：自动恢复
const socket = io({ reconnection: true })
// 用户刷新 → 新连接携带 previousSession
// → 服务端检查 pid → 找到缓存 → 重发 missed packets → 重新 join 房间
// 内部：skipMiddlewares 检查
if (skipMiddlewares && socket.recovered && client.conn.readyState === "open") {
  // 直接连接成功，跳过 auth middleware
  return this._doConnect(socket)
}
// 前提：adapter 必须实现 persistSession/restoreSession
// Redis adapter / Cluster adapter 都支持
```

**关键参数**：
- 开关 = `connectionStateRecovery: { maxDisconnectionDuration: 2*60*1000 }`
- 恢复 = `previousSession.rooms.forEach(room => this.join(room))`
- 重发 = `missedPackets.forEach(packet => this.packet({...}))`
- 跳过 = `if (skipMiddlewares && socket.recovered && client.conn.readyState === "open")`
- 前提 = adapter 必须实现 `persistSession/restoreSession`

**最佳实践**：长连接必开 CSR（vs. 业务自己实现 session 同步）——刷新不掉订阅 + missed packets 自动补；`maxDisconnectionDuration` 2 分钟经验值（移动网络切换典型时长）；`skipMiddlewares: true` 跳过 auth（重连不需要重新鉴权）；客户端 `reconnection: true` 默认开。

### 模式 5：BroadcastOperator 不可变链式

**问题场景**：`io.to('r1').except('r2').compress(true).timeout(1000).emit('ev', cb)` 链式过滤——多线程/多请求场景共享 flags 竞争；可变性导致"链中修改影响外部引用"。

**解决方案**：BroadcastOperator 每次链式返回**新对象**——`to(room)` 第一行 `const rooms = new Set(this.rooms)` 复制原 rooms；emit 时统一 apply flags。

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
- 不可变 = 每次 `.to/.except/.compress/.timeout` 返回新实例
- flags = rooms / except / flags / volatile
- ACK = 检测 args 最后一个是函数视为 ack
- 批量 = `io.timeout(1000).emit('ev', (err, resps) => ...)` 多节点聚合
- 优势 = 共享状态零竞争

**最佳实践**：链式过滤 API 用不可变模式（vs. mutable builder）——并发安全 + 调试可观察；每次链式调用 `new Set(...)` 复制（深浅按需）；emit 时统一 apply flags 给底层 adapter；ACK 检测看"最后一个参数是不是函数"。

---

## 第二段：命名空间与广播 - 心跳、动态 NSP、预编码

### 模式 6：协议 v3/v4 心跳方向反转

**问题场景**：Socket.IO v2 客户端（EIO=3 协议）"客户端主导心跳"，v4 改"服务端主导"——为什么？移动网络 NAT 切断频繁。

**解决方案**：v4 服务端主动发 ping 等 pong——保持 NAT 映射更稳定（服务端主动发包维持 NAT 防火墙洞）；早检测半死连接。

```ts
// 心跳方向按协议分支
slick.prototype.setupHeartbeat = function() {
  if (this.protocol === 3) {
    // v3：客户端主导
    // 客户端发 PING，服务端回 PONG
    this.socket.on('packet', (packet) => {
      if (packet.type === PacketType.PING) {
        this.sendPacket(PacketType.PONG)
      }
    })
  } else {
    // v4：服务端主导
    this.pingInterval = setInterval(() => {
      this.sendPacket(PacketType.PING)
      this.pingTimeout = setTimeout(() => {
        this.close()  // 20s 未回 PONG
      }, 20 * 1000)
    }, 25 * 1000)
  }
}
// 检测
if (this.protocol === 3) {
  this.resetPingTimeout()  // 客户端主导：重置计时
} else {
  this.schedulePing()      // 服务端主导：发 ping
}
```

**关键参数**：
- v3 = 客户端发 ping，服务端回 pong
- v4 = 服务端发 ping，客户端回 pong
- 间隔 = 25s ping / 20s pong timeout
- 检测 = `this.protocol === 3 ? resetPingTimeout() : schedulePing()`
- 工程理由 = NAT/防火墙侧连接稳定

**最佳实践**：长连接服务端主导心跳（vs. 客户端主导）——NAT 友好 + 早检测半死；v4 服务端主导解决 NAT 切断（服务端发包维持 NAT 洞）；ping interval 25s（NAT 60s idle 切线前必断）；pong timeout 20s 留 5s buffer。

### 模式 7：动态命名空间 ParentNamespace

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
// 内部实现
class ParentNamespace extends Namespace {
  createChild(name: string): Namespace {
    const nsp = super.createChild(name)
    nsp.fns = [...this.fns]      // 复制中间件
    nsp.listeners('connect').forEach(l => nsp.on('connect', l))  // 复制监听
    return nsp
  }
}
```

**关键参数**：
- 内部名 = `/_<count>` 避免与用户 namespace 冲突
- 中间件继承 = `createChild` 时复制父 `_fns`
- 监听继承 = `connection` 监听器复制
- 自动回收 = `cleanupEmptyChildNamespaces: true` 配置开关
- 跨 nsp 广播 = ParentBroadcastAdapter 遍历 children

**最佳实践**：动态业务频道用 ParentNamespace（vs. 预创建 N 个 nsp）——按需创建 + 跨频道广播；正则匹配路径自动创建子 nsp；中间件和 connection 监听继承父 nsp；`cleanupEmptyChildNamespaces: true` 避免内存泄漏；跨进程用 Redis adapter 同步子 nsp。

### 模式 8：预编码 WebSocket 帧优化

**问题场景**：聊天高 QPS 场景 CPU 瓶颈在"packet → JSON → ws 库 → frame" 多次序列化；单 socket 1000 msg/s 时 CPU 占 60%。

**解决方案**：adapter 直接生成 ws 帧（`wsPreEncodedFrame`），socket.io 调 `_sender.sendFrame` 跳过 ws 库内部 mask/分片组装；省 15-20% CPU。

```ts
// pre-encoded 路径
// 检查：满足条件才走预编码
if (canPreComputeFrame && encodedPackets.length === 1 && typeof encodedPackets[0] === 'string') {
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

### 模式 9：带超时的批量 ACK

**问题场景**：集群下广播给 N 个服务器的 M 个客户端——怎么聚合所有响应？超时怎么算？

**解决方案**：`io.timeout(1000).emit('ev', (err, resps) => ...)` 内部用 `expectedServerCount === actualServerCount && responses.length === expectedClientCount` 判定完整性；显式超时。

```ts
// 带超时的批量 ACK
const serverCount = io.of('/').sockets.size  // 集群节点数
// 客户端
socket.timeout(1000).emit('getUser', { id: 1 }, (err, response) => {
  if (err) {
    // 超时 / 网络错误
    console.error('ack timeout:', err)
  } else {
    // response 是聚合后的结果
    console.log('user:', response)
  }
})
// 服务端响应
socket.on('getUser', (data, ack) => {
  const user = db.findById(data.id)
  ack({ name: user.name, age: user.age })
})
// 协议：43[id, ...data] 多节点响应
// 完整性 = 期望服务器数 + 期望客户端数都达到
// 兜底 = 超时后 `err` 参数是 TimeoutError
// 场景 = 集群全节点健康检查
```

**关键参数**：
- 协议 = 431[42, "ack-reply"] 多节点响应
- 超时 = `io.timeout(ms)` 显式传
- 完整性 = 期望服务器数 + 期望客户端数都达到
- 场景 = 集群全节点健康检查
- 兜底 = 超时后 `err` 参数是 TimeoutError

**最佳实践**：集群批量操作走 `io.timeout(...).emit(...)` 聚合——天然支持多服务器 + 完整性判定；超时必须显式传（默认无超时）；ack 回调 err-first（错误 = TimeoutError / connection error）；集群健康检查是典型应用。

### 模式 10：协议双轨制（v3 兼容 v2）

**问题场景**：老业务 v2 客户端（EIO=3 协议）在线——强制升 v4 会让老客户端全断；企业客户要求平滑过渡。

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
// 适用 = 企业级框架老业务平滑升级
```

**关键参数**：
- 开关 = `allowEIO3: true` 接受老客户端
- ID 生成 = v3 用 `nspName#clientId` / v4 用 base64id
- 心跳 = v3 客户端主导 / v4 服务端主导
- 代价 = 核心路径写 if 分支增加心智负担
- 适用 = 企业级框架老业务平滑升级

**最佳实践**：企业级框架保留双协议分支（vs. 强制升）——平滑迁移 + 不激怒老用户；`allowEIO3: true` 是 v4 临时兼容开关（v5 移除）；id 格式按协议分支用 if 兜底；老的 v3 协议只接受只读，警告用户升级。

---

## 第三段：异步握手与状态机 - StrictEventEmitter 与 nextTick

### 模式 11：11 包 monorepo 拆分

**问题场景**：单包 socket.io 难演进；parser / engine / adapter 各自版本独立；用户想单独用 engine.io-client 而不引入 socket.io。

**解决方案**：npm workspaces 11 个子包——engine.io / engine.io-client / engine.io-parser / socket.io / socket.io-client / socket.io-parser / socket.io-adapter / 4 个 cluster-emitter / component-emitter；各自独立发版。

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
// 11 个子包
// engine.io / engine.io-client = 传输层
// engine.io-parser = Engine 帧编解码
// socket.io / socket.io-client = 业务层
// socket.io-parser = Socket 业务包编解码
// socket.io-adapter = 房间路由抽象
// socket.io-cluster-engine = node:cluster 引擎
// socket.io-component-emitter = 1KB EventEmitter
// CI：12 个 GitHub Actions workflow 独立发版
```

**关键参数**：
- 管理 = `npm workspaces` 11 个子包
- 独立性 = 每个子包 `package.json` + `tsconfig.json` + `test/`
- CI = 12 个 GitHub Actions workflow 每个子包独立
- 替代 = Lerna / Nx / Turborepo（项目用 npm 原生）
- 代价 = 版本同步成本 + lockfile 维护

**最佳实践**：大库用 npm workspaces monorepo（vs. 单包）——独立发版 + 子包可单独用；npm 原生 workspaces 够用（不必 Lerna）；子包间用 `workspace:*` 协议同步；CI 每个子包独立 workflow（失败定位快）；CHANGELOG 同步（lerna-changelog 自动化）。

### 模式 12：StrictEventEmitter 装饰原生 EE

**问题场景**：原生 Node EventEmitter 没有类型约束；想加"业务事件类型"又不破坏内部事件（connect/disconnect）；想保留原生 API 同时加类型。

**解决方案**：`StrictEventEmitter<ReservedEvents, UserEvents, ...>` 装饰模式——保留 `connect/disconnect` 内部事件 + 暴露业务事件类型；通过重写 on/emit/once/off 方法签名。

```ts
// StrictEventEmitter 装饰
class StrictEventEmitter<Reserved, User, Ack> implements EventEmitter {
  on<E extends keyof (Reserved & User)>(event: E, listener: (arg: any) => void): this {
    return super.on(event, listener) as any
  }
  emit<E extends keyof (Reserved & User)>(event: E, ...args: any[]): boolean {
    return super.emit(event, ...args) as any
  }
  // 一次性的 ack 监听
  once<E extends EventNamesWithAck<User>>(event: E, listener: AckListener): this
  // 普通事件
  once<E extends Exclude<keyof User, EventNamesWithAck<User>>>(event: E, listener: (...args: any[]) => void): this
}
// Server / Namespace / Socket / BroadcastOperator 四层都用这个装饰
// 编译期：socket.on('connect', () => {})  // connect 是内部事件，类型保留
// 编译期：socket.on('chat', (msg: string) => msg.toUpperCase())  // chat 是业务事件
// 价值：编译期防拼错 + 保留内部 API
```

**关键参数**：
- 装饰 = 继承 EventEmitter 重写 on/emit/once/off 类型签名
- 泛型 = 内部事件 + 业务事件 + ack 事件分离
- 透传 = Namespace / Socket / Server 统一类型
- 价值 = 编译期防拼错 + 保留内部 API
- 复用 = 任何"既要内部事件又要业务事件"对象可套

**最佳实践**：长生命周期对象用 StrictEventEmitter（vs. 裸 EE）——类型安全 + 内部/业务事件分离；3 泛型按"内部 / 业务 / ack"分类；继承 EE 而非自己实现（保留 v8 优化）；4 层类型透传（Server / Namespace / Socket / BroadcastOperator）。

### 模式 13：process.nextTick 包裹中间件回调

**问题场景**：中间件可能是异步（`use((s,n)=>db.query(...,n))`）——如果同步 _doConnect，回调在客户端已断开后才到达，会把"已死的 socket"挂到 sockets: Map；悬挂引用导致内存泄漏。

**解决方案**：`process.nextTick` 包裹中间件回调——把"连接成功/失败"判定推迟到所有可能的 microtask 之后；`conn.readyState !== "open"` 兜底清理。

```ts
// nextTick 包裹
async _createSocket(client, auth) {
  // 1. 先放 preConnectMap（连接未完成）
  this._preConnectSockets.set(client.id, client)
  // 2. 跑中间件
  try {
    await this.runMiddlewares(client, auth)
  } catch (err) {
    this._cleanup(client, err)
    return
  }
  // 3. nextTick 包裹连接
  process.nextTick(() => {
    // 此时所有 microtask 跑完，conn 状态稳定
    if (client.conn.readyState !== "open") {
      // 客户端在中间件期间断开了
      return this._cleanup(client)
    }
    this._doConnect(client)
  })
}
// 状态隔离
_preConnectSockets: Map<id, Client>  // 握手未完成
sockets: Map<id, Socket>            // 握手完成
// 流程 = await _createSocket → preConnectMap → middleware → nextTick(_doConnect) → sockets
```

**关键参数**：
- 包裹 = `process.nextTick(() => { if (conn.readyState !== "open") return cleanup(); ... })`
- 兜底 = `if (client.conn.readyState !== "open") return socket._cleanup()`
- 原因 = Express 的 next() 不需要担心 transport 已关闭
- 状态 = `_preConnectSockets: Map` + `sockets: Map` 双 Map 隔离
- 流程 = `await this._createSocket(client, auth)` → preConnectMap → middleware → doConnect

**最佳实践**：异步握手流程用 nextTick 包裹（vs. 同步 _doConnect）——避免悬挂引用；双 Map 隔离握手未完成 vs 已完成；`conn.readyState` 兜底（中间件期间连接可能已死）；`process.nextTick` 而非 `setImmediate`（更快）。

### 模式 14：cleanupEmptyChildNamespaces 配置即行为

**问题场景**：动态命名空间用完不删——内存泄漏；删错业务挂掉；用户懒得手动清理。

**解决方案**：monkey-patch `namespace._remove` 在最后一个 socket 离开时回收子 nsp——典型"配置即行为"设计；decorator 模式包原方法。

```ts
// 配置开关
const io = new Server(httpServer, {
  cleanupEmptyChildNamespaces: true   // 60s 内无 socket 自动清理
})
// 实现：decorator 替换 _remove
function installCleanup(nsp) {
  const originalRemove = nsp._remove.bind(nsp)
  nsp._remove = function(socket) {
    originalRemove(socket)
    // 最后一个 socket 离开时
    if (nsp.sockets.size === 0 && nsp.children?.size === 0) {
      setTimeout(() => {
        if (nsp.sockets.size === 0) {
          nsp.parent._remove(nsp)  // 60s 后真清
        }
      }, 60 * 1000)
    }
  }
}
```

**关键参数**：
- 开关 = `cleanupEmptyChildNamespaces: true`
- 实现 = decorator 模式替换 `_remove` 函数
- 触发 = 最后一个 socket 离开时
- 优势 = 默认你开了就是空 nsp 自动 GC
- 关闭 = 关了就一直留着

**最佳实践**：动态资源生命周期用配置开关（vs. 业务自己写 GC）——decorator 包原方法；60s 延迟（防抖，避免新连接频繁创建）；配置即行为（用户开/关决定 GC 是否跑）；适用于动态房间、临时频道、临时房间。

### 模式 15：协议测试套件 conformance test

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

## 第四段：生产实战 - 选型、4 泛型、复刻与演进

### 模式 16：选型 socket.io vs 原生 ws vs uWS vs Centrifugo

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
// socket.io:  易用 6.5/10 + 功能 9.2/10
// 裸 ws:      易用 3/10 + 功能 4/10 + 性能高
// uWS:        易用 7/10 + 功能 5/10（单核 100K+ 连接）
// Centrifugo: 易用 5/10 + 功能 8.5/10
// 商业:       Pusher/Ably 省运维 + 月费
// 位置 = 功能最强 + 学习曲线中等
```

**关键参数**：
- socket.io = 易用 6.5/10 + 功能 9.2/10
- 裸 ws = 易用 3/10 + 功能 4/10 + 性能高
- uWS = 易用 7/10 + 功能 5/10（单核 100K+ 连接）
- Centrifugo = 易用 5/10 + 功能 8.5/10
- 商业 = Pusher/Ably 省运维 + 月费
- 位置 = 功能最强 + 学习曲线中等

**最佳实践**：90% Web 实时应用选 socket.io（功能/易用平衡）；极致性能选 uWS；省运维选 SaaS；聊天 / 协作 / 直播 = socket.io；金融高频交易 = uWS；服务端推流 = Centrifugo；单向通知 = SSE。

### 模式 17：TypeScript 4 泛型实战

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

### 模式 18：7 天复刻 mini-socket.io 路线

**问题场景**：想理解 socket.io 11 包架构；想 7 天复刻 MVP；想要 teach-by-doing 练手。

**解决方案**：7 天 MVP——Day 1-2 Engine.io 长轮询 + WS 升级，Day 3-4 Namespace + Socket + Client，Day 5 parser v5 编解码，Day 6 InMemoryAdapter + Redis，Day 7 CSR。

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
- 复刻难度 = 核心 1500 行可讲清，全栈 5-7 天

**最佳实践**：复刻 mini-socket.io 先做 Engine + Namespace + Adapter——核心 1500 行 2 周能出可用品；放弃 4 泛型 + monorepo（生产级特性）；30+ examples 必带（chat / cluster-nginx / private-messaging）；Protocol Test Suite 是 3rd party 实现的硬保证。

### 模式 19：生产实战配置清单

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

### 模式 20：socket.io 演进历史与设计哲学

**问题场景**：socket.io 10 年演进——什么驱动 v1 → v2 → v3 → v4 的大版本变化？新项目怎么借鉴演进思路？

**解决方案**：历史回顾——v0.9 (2012) → v1 (2014 + rooms) → v2 (2017 + Engine.IO 3) → v3 (2020 + Engine.IO 4) → v4 (2022 + 协议 v5 + CSR)。

```bash
# 演进时间线
2010: socket.io v0.9 概念验证（LearnBoost 临时封装）
2014: socket.io v1 API 稳定（rooms / namespaces）
2017: socket.io v2 拆 engine.io（协议和 client 揉在一起难维护）
2020: socket.io v3 TS 重写（业内争议"重写之罪"还是"必由之路"）
2022: socket.io v4 协议 v5 + CSR（断网重连体验级提升）
2026: socket.io 4.8.x 主线（11 包 monorepo + 4 泛型）
# 设计哲学
# "先 API 稳定、再加新特性、最后性能优化"
```

**关键参数**：
- v0→v1 = API 稳定（LearnBoost 临时封装 → 公共 API）
- v1→v2 = 拆 engine.io（历史拐点，协议和 client 揉在一起难维护）
- v2→v3 = TS 重写（业内争议"重写之罪"还是"必由之路"）
- v3→v4 = 协议 v5 + CSR（断网重连体验级提升）
- 设计哲学 = "先 API 稳定、再加新特性、最后性能优化"

**最佳实践**：长生命周期框架按"先 API 稳定、再加新特性、最后性能优化"演进（vs. 一次性大重构）——用户平滑升级；TS 重写时机 = API 稳定 + 用户基数大 + 团队就绪（避免 v3 重写之罪）；CSR 是 10 年才等到的"破坏性新特性"（用户痛点累积）；演进文档（CHANGELOG + MIGRATION GUIDE）必带。

---

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\socketio\`
- 文件数：826（含 examples + docs）
- 大小：~60 MB
- License：MIT
- 状态：4.x 主线（socket.io@4.8.x）

**核心子包**：
- `engine.io` = 传输层（WS + polling）
- `engine.io-client` = 浏览器侧传输
- `socket.io` = 用户面（Server 入口）
- `socket.io-client` = 浏览器/Node 客户端
- `socket.io-parser` = 应用协议 v5
- `socket.io-adapter` = 广播抽象 + InMemory
- `socket.io-cluster-engine` = 跨进程 engine
- `socket.io-component-emitter` = 极简 EventEmitter

**3 核心洞察**：
1. 协议分层（Engine + Socket）= 实时通信的范式
2. 4 泛型条件类型 = 给纯 JS 框架上 TS 的最佳答案
3. Adapter 模式 = 集群扩展对业务透明

**1 反模式**：`_preConnectSockets` + `sockets` 双 Map——能用 state 字段 + 单一 Map 替代，但作者选择强隔离 state 是合理的 trade-off。

**3 立刻能用**：
1. `io.use((socket, next) => checkJwt(socket.handshake.auth.token, next))` 0 改造拿到鉴权
2. `io.to(`user:${userId}`).emit('notify', payload)` 一行定向推送
3. `io.timeout(2000).emit('ack-test', (err, resps) => ...)` 集群全节点健康检查
