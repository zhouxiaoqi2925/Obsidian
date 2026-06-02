# socketio-client - Engine.IO 抽象 + Manager 单例 + backo2 抖动重连实时客户端

> socket.io-client 是浏览器/Node 实时双向事件通信的事实标准客户端。已合并入 socket.io monorepo（packages/socket.io-client）。4 层栈（用户 → Socket → Manager → Engine.IO）藏起"穿透代理 + 二进制流 + 自动重连 + ACK 编号 + 命名空间多路复用"——背后最被低估的宝藏是 6 行实现的 backo2 抖动指数退避。

## 一、协议与抽象层

### 模式 1 · Engine.IO 传输降级（polling → websocket）

**问题场景**：浏览器 WebSocket 不能跨域穿透老代理；移动端切 WiFi/4G 长连接断了怎么不感知。

**解决方案**：transports 数组 `['polling', 'websocket']`——先 XHR polling 让老代理/防火墙放行（HTTP 80/443 几乎不挡），再 upgrade 到 WebSocket。

```ts
import { io } from "socket.io-client";

const socket = io("https://api.example.com", {
  transports: ["polling", "websocket"],
  upgrade: true,             // 默认 true，polling 成功后自动升级
  upgradeTimeout: 10000,     // 升级协商超时
  rememberUpgrade: false,    // 切换后是否记住 transport
  forceBase64: false,        // 兼容老代理不支持 binary
});
```

**关键参数**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `transports` | `['polling','websocket']` | 降级顺序数组，先 polling 再 ws |
| `upgrade` | `true` | 升级协商是否开启 |
| `upgradeTimeout` | `10000` ms | upgrade 协商超时（IE/慢代理保护） |
| `rememberUpgrade` | `false` | 断线重连是否保留 ws |
| `forceBase64` | `false` | 强制 base64 编码（穿透老代理） |

**最佳实践**：
- 长连接默认 polling→ws 升级（vs. 强制 ws）——兼容 99% 网络环境
- 政企/金融/老代理场景额外加 `forceBase64: true`
- `upgradeTimeout` 留 10s 余量防慢代理卡死握手
- 移动端 H5 必带 polling 兜底——4G/3G 切网 WS 极易断

### 模式 2 · Manager 单例 + Socket 多路复用

**问题场景**：浏览器对单域名同时连接数有限（HTTP/1.1 下 6 个）——多页面/多业务怎么共享一个底层连接？

**解决方案**：`io(url)` 多次调用默认返回同一 Manager（用 `managers[uri]` 全局 map），多个 `socket.of('/chat')` 共享一个底层连接。

```ts
// 业务 A
const chatSocket = io("https://api.example.com").of("/chat");

// 业务 B
const notifySocket = io("https://api.example.com").of("/notify");

// 业务 C
const orderSocket = io("https://api.example.com").of("/orders");

// 三个 socket 共享一个底层 Engine.IO 连接
// HTTP/1.1 浏览器只占一个连接池位
```

**关键参数**：

| 概念 | 机制 | 优势 |
|------|------|------|
| 单例 | `managers[uri]` 全局 map 复用 | 浏览器 HMR 不会创建 N 个独立连接 |
| 多路 | 单 Manager = 1 底层连接 + N 个 Socket 命名空间 | 节省 HTTP/1.1 6 连接上限 |
| 协议 | 单连接上虚拟出 N 个命名空间 | server 端用 `of('/chat')` 对接 |
| 强制新 | `io(url, { forceNew: true })` | 显式禁用单例（多账号） |
| 多 host | `io(urlA)` vs `io(urlB)` | 不同 host 各自 Manager |

**最佳实践**：
- 浏览器场景按 host+path 复用底层连接（vs. 每个业务一个连接）——节省连接池 6 倍
- 多账号/多租户必须 `forceNew: true`——避免被前一个用户态污染
- Manager 销毁 `manager.close()` 关闭整个底层连接
- HMR 热重载注意 `managers` map 累积——生产用 production build

### 模式 3 · ACK 编号 + 超时机制

**问题场景**：TCP 是字节流不是消息队列；emit 出去的请求怎么对应回包；默认永不超时业务永远不 reject。

**解决方案**：`emit('event', data, ackCallback)` 把 ack 挂到 `acks: Map<id, callback>`，服务端响应 `{id:42, data:...}` 客户端解包回调；显式 `{timeout: 5000}` 必传。

```ts
// 客户端
socket.timeout(5000).emit("order:create", { sku: "A1" }, (err, orderId) => {
  if (err) {
    // 超时 / 失败
    console.error(err);
    return;
  }
  console.log("order id:", orderId);
});

// 或者 promise 风格
socket.emitWithAck("order:query", { id: 42 })
  .then((data) => console.log(data))
  .catch((err) => console.error(err));
```

**关键参数**：

| 字段 | 值 | 说明 |
|------|------|------|
| ID 生成 | 自增 `this.ids` | 单调不复用，断连重置 |
| 数据结构 | `acks.set(nsp, ++this.ids, ack)` | Map<命名空间, id, callback> |
| 超时 | `{timeout: 5000}` | 0 = 永不超时（业务永远不 reject） |
| 协议帧 | `42["event", data]` + `431[42,"ack-reply"]` | engine.io v4 packet 编码 |
| 超时错误 | `Error('timeout')` 注入 callback 首参 | 不抛异常，回调判 err |
| v5 实验 | `socket.emitWithAck()` | Promise 化 ack |

**最佳实践**：
- 长连接请求-响应走 ack 协议（vs. 自开 RPC 通道）——复用 payload + 显式超时
- 每个 emit 都必传 `timeout`——默认 0 永不超时是地雷
- ack callback 第一参数一定是 `err`——v4 协议强制
- server 端用 `socket.timeout(5000).emit(...)` 同样适用

### 模式 4 · backo2 抖动指数退避

**问题场景**：移动端切网/地铁进隧道服务端几秒到几十秒才恢复——固定 sleep 雪崩式重连把后端打死。

**解决方案**：`backo2` 算法——6 行实现带抖动的指数退避，参数 `min/max/randomizationFactor` 三件套。

```ts
// backo2.ts 核心实现（6 行）
export class Backoff {
  private ms = this.min;
  constructor(
    private min = 1000,
    private max = 5000,
    private factor = 2,
    private jitter = 0.5
  ) {}
  next(): number {
    const ms = this.ms * this.factor + this.jitter * this.ms * Math.random();
    this.ms = Math.min(this.ms * this.factor, this.max);
    return ms;
  }
  reset() { this.ms = this.min; }
}
```

**关键参数**：

| 字段 | 默认 | 说明 |
|------|------|------|
| `min` | 1000 ms | 退避起点 |
| `max` | 5000 ms | 退避上限 |
| `factor` | 2 | 指数因子（每次翻倍） |
| `jitter` | 0.5 | 抖动幅度 ±50% |
| `reset()` | — | 重连成功后立刻重置 |
| 算法 | `delay = min(maxDelay, randomizationFactor*delay)` | 防雪崩核心 |

**最佳实践**：
- 长连接重连必带抖动（vs. 固定 1s/2s/4s）——避免雪崩把后端打死
- 移动端 `jitter: 0.5` 起步——切网 1k 并发同毫秒回连会撞
- 成功后必须 `reset()`——否则下次重连继承上次 ms
- 抄 backo2 给 WebRTC/MQTT/gRPC 都适用

### 模式 5 · Engine.IO 6 包类型 + 25s 心跳

**问题场景**：Engine.IO 包类型 6 种（OPEN/MESSAGE/CLOSE/PING/PONG/UPGRADE）——为什么心跳在协议层而非应用层？

**解决方案**：ping/pong 是协议层心跳（25s ping / 20s pong timeout）——不依赖应用层事件，避免 NAT 60s idle 切断。

```ts
// 客户端配置
const socket = io("https://api.example.com", {
  pingInterval: 25000,    // 服务端 ping 间隔 25s
  pingTimeout: 20000,     // pong 超时 20s
});

// 6 种 Engine.IO Packet type
enum PacketType {
  OPEN = 0,     // 握手
  CLOSE = 1,    // 关闭
  PING = 2,     // 心跳 ping
  PONG = 3,     // 心跳 pong
  MESSAGE = 4,  // 业务消息
  UPGRADE = 5,  // 传输升级
  NOOP = 6,     // 探测
}
```

**关键参数**：

| 类型 | 编码 | 触发 | 说明 |
|------|------|------|------|
| OPEN | 0 | 握手 | 带 sid/upgrade 等元信息 |
| CLOSE | 1 | 关闭 | 双向 close |
| PING | 2 | 服务端 | 25s 间隔 |
| PONG | 3 | 客户端 | 收到 ping 即回 |
| MESSAGE | 4 | 业务 | socket.io-parser 编码 |
| UPGRADE | 5 | 传输升级 | polling→ws 切换 |
| NOOP | 6 | 探测 | 心跳空包 |

**最佳实践**：
- 长连接 25s ping/pong（vs. 60s+）——NAT 留一半余量 + 早检测半死
- 服务端 `pingInterval` 改小——`pingTimeout` 留 1.5x 余量
- 半死连接靠 `pingTimeout` 检测——应用层 60s 早过了
- 自定义协议可抄这 6 种包类型——ping/pong 是核心

## 二、扩展与协议

### 模式 6 · io() Facade 外观模式

**问题场景**：`io(url).emit('event', data)` 一句话调用——背后 Manager/Socket/Engine 三层怎么藏起来？

**解决方案**：`io()` 外观模式——内部 lookup 单例 → create Manager → open Engine → 返回 Socket 实例。

```ts
// 公开入口 lib/index.ts
import { Manager } from "./manager";
import { Socket } from "./socket";

const managers: Record<string, Manager> = {};

export function io(
  uri?: string | Partial<ManagerOptions>,
  opts?: Partial<ManagerOptions>
): Socket {
  // 多态：io(url, opts) / io(opts) / io() / io(socket)
  if (typeof uri === "object" && !(uri as any)._socket) opts = uri as any;
  opts = opts || {};
  uri = uri || (typeof location !== "undefined" ? location.origin : "");
  const url = resolveURL(uri, opts.path || "/socket.io");

  let manager: Manager = managers[url];
  if (!manager) {
    manager = new Manager(url, opts);
    managers[url] = manager;
  }
  return manager.socket(opts.forceNew ? undefined : "/");
}

export { io as default };
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 入口 | `lib/index.ts` 默认导出 `io()` |
| lookup | `managers[uri]` 全局 map 复用 |
| 多态 | `io(url, opts)` / `io(opts)` / `io()` / `io(Socket)` 多种签名 |
| 推断 | 不传 url 从 `<script>` data-* 属性推断 |
| SSR 风险 | Node 场景推断 `location.origin` 不存在 |
| forceNew | `{ forceNew: true }` 禁用单例 |

**最佳实践**：
- SDK 入口用 Facade 外观（vs. 暴露 Manager/Socket）——一行调用藏三层
- SSR/Node 场景必须显式传 `url`——不要依赖 `location` 推断
- 多账号登录用 `forceNew: true`——避免被前账号污染
- 自定义协议 SDK 必用同样 Facade——一行 `connect(url)` 藏 5 层

### 模式 7 · 二进制 + Parser 编解码

**问题场景**：v3 之后二进制数据（Buffer/ArrayBuffer/Blob）——JSON 字符串直接发会爆，BLOB 又被某些代理截断。

**解决方案**：socket.io-parser 拆成"含 binary 走 BINARY_EVENT/BINARY_ACK 二进制帧，纯文本走 EVENT/ACK 文本帧"——two-track。

```ts
import { Encoder, Decoder, PacketType } from "socket.io-parser";

const encoder = new Encoder();
const packets = encoder.encode({
  type: PacketType.EVENT,
  data: ["user:avatar", { id: 1, avatar: arrayBufferOrBuffer }],
  nsp: "/",
});
// 输出: ['51-["user:avatar",{"id":1,"_placeholder":true,"num":0}]', arrayBuffer]

// 服务端解析
const decoder = new Decoder();
decoder.on("decoded", (packet) => {
  // 还原二进制
  packet.data[1].avatar = attachments.shift();
});
```

**关键参数**：

| 类型 | 编码 | 用途 |
|------|------|------|
| `EVENT` (2) | 文本帧 | 普通 JSON 消息 |
| `ACK` (3) | 文本帧 | ack 响应 |
| `BINARY_EVENT` (5) | 文本+二进制 | 含 Buffer/ArrayBuffer |
| `BINARY_ACK` (6) | 文本+二进制 | 含二进制的 ack |
| `CONNECT` (0) | 文本 | nsp 连接 |
| `DISCONNECT` (1) | 文本 | nsp 断开 |
| 占位符 | `_placeholder:true, num:N` | 标记后续 N 个 binary |

**最佳实践**：
- 实时通信 binary + 文本分两轨（vs. 都 JSON 编码）——性能 + 兼容性双赢
- 大图/音频/视频走 BINARY_EVENT（vs. base64 字符串）——省 33% 体积
- 客户端用 `hasBinary(obj)` 检查——自动选帧类型
- 协议 v5 RFC 在草拟——可能把 binary 单独抽 BINARY 类

### 模式 8 · open() 防重入

**问题场景**：`open()` 被多次调用——会并发开 5 个连接把客户端/服务端都拖垮。

**解决方案**：`_connecting` 标志位简单防重入——首次进入置 true，后续调用直接挡。

```ts
// Manager.open 核心
open(callback?: (err?: Error) => void): void {
  if (this._connecting) return;  // 守卫：二次调用直接挡
  this._connecting = true;
  this._timer && clearTimeout(this._timer);
  this._timer = setTimeout(() => {
    this._connecting = false;
    this.emit("connect_error", new Error("timeout"));
  }, this.opts.timeout);
  
  this.engine.open();
  this.engine.once("open", () => {
    this._connecting = false;
    this.engine.write("open", JSON.stringify({
      sid: this.engine.id,
      upgrades: ["websocket"],
      pingInterval: this.opts.pingInterval,
      pingTimeout: this.opts.pingTimeout,
    }));
    callback?.();
  });
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 标志 | `this._connecting = true` 入口置位 |
| 守卫 | `if (!this._connecting)` 直接挡 |
| 重置 | open 成功/失败/超时后重置 |
| 超时 | 兜底 `setTimeout` 强制重置（防卡死） |
| 状态机 | 简单 boolean（vs. 完整 state class） |
| 替代 | RxJS/EventEmitter 完整状态机（overkill） |

**最佳实践**：
- 连接入口加防重入标志（vs. 期望调用方自己控制）——5 行代码避免 5 个并发连接
- 必带超时兜底——`_connecting=true` 卡死会导致所有后续 open 静默失败
- destroy/close 时也重置——避免组件重 mount 后无法重连
- 大型 SDK 都该用同样模式——HTTP/RPC/WS 入口统一

### 模式 9 · 多格式打包 + TS 声明

**问题场景**：浏览器 + Node + SSR + 打包器 4 个场景——SDK 怎么全场景通吃？

**解决方案**：package.json 4 个字段——`main` (CJS) / `module` (ESM) / `types` (TS) / `exports` (Node 解析)，打包器自动选。

```json
{
  "name": "socket.io-client",
  "version": "4.7.5",
  "main": "./dist/socket.io.cjs",
  "module": "./build/esm/index.js",
  "types": "./build/esm/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./build/esm/index.d.ts",
        "default": "./build/esm/index.js"
      },
      "require": {
        "types": "./build/cjs/index.d.ts",
        "default": "./build/cjs/index.js"
      }
    },
    "./dist/socket.io.js": "./dist/socket.io.js"
  },
  "files": ["dist", "build", "README.md"]
}
```

**关键参数**：

| 字段 | 场景 | 体积 |
|------|------|------|
| `main` | CJS 入口（Node CJS） | ~80KB |
| `module` | ESM 入口（Webpack/Vite） | ~80KB |
| `types` | `.d.ts` TS 声明 | — |
| `exports` | Node 12+ 解析 map | — |
| UMD `dist/socket.io.js` | 浏览器 `<script>` 标签 | ~120KB |
| gzip | — | ~20KB |

**最佳实践**：
- SDK 必带 4 字段打包（vs. 只发 CJS）——浏览器+Node+SSR+打包器全场景通吃
- `exports` 优先于 `main`/`module`——Node 12+ 严格按 exports 解析
- 浏览器 `<script>` 用 UMD——挂全局 `io`
- 体积控制：tree-shaking + 不发 sourcemap 到 npm

### 模式 10 · socket.io-client 与 socket.io server 协议一致性

**问题场景**：socket.io-client 必须配 socket.io server——纯 ws 互通场景要绕开。

**解决方案**：客户端和服务端共享 socket.io-parser 协议——任何 socket.io 兼容 server 都能用，反之亦然。

```ts
// 客户端
const client = io("https://server-a.example.com");  // 协议 v4
const client2 = io("https://server-b.example.com"); // 协议 v4

// 协议矩阵
// engine.io-parser v4 + socket.io-parser v4 = socket.io 协议 v4
// engine.io-parser v3 + socket.io-parser v3 = socket.io 协议 v3
// v3 与 v4 不兼容
```

**关键参数**：

| 协议 | 说明 | 兼容 |
|------|------|------|
| `socket.io-parser v5` | 应用层（EVENT/ACK/BINARY_*） | 应用层 |
| `engine.io-parser v4` | 传输层（OPEN/PING/PONG/...） | 传输层 |
| 跨语言 | 任何 socket.io 服务端都能用 | 任何实现 |
| 互通 | 纯 ws 不支持 | 必须走 Engine.IO 协议 |
| 同生态 | `socket.io-redis-adapter` / `socket.io-emitter` / `socket.io-sticky` | 横向扩展 |
| 跨语言 server | `python-socketio` / `go-socket.io` / `java-socket.io` | 全部兼容 |

**最佳实践**：
- 实时通信选型必看客户端/服务端协议（vs. 只看客户端）——避免"客户端好但服务端要重写"
- 多语言栈优先选有官方多语言 SDK 的协议——socket.io 8+ 语言
- 纯 ws 互通场景选 `ws` + 自定义协议——别硬套 socket.io
- 服务端集群用 `socket.io-redis-adapter`——跨节点广播

## 三、握手与重连机制

### 模式 11 · 全局副作用：io() 不传 url

**问题场景**：`<script src="socket.io.js">` 一行接入——url 从哪来？SSR/Node 怎么兼容？

**解决方案**：io() 不传 url 不报错，从 `<script>` 标签 data-* 属性推断（`io.src` / `io.url`）——一行接入 + Web 简单使用。

```html
<!-- 浏览器一行接入 -->
<script src="https://cdn.example.com/socket.io/socket.io.js"
        data-io-src="https://api.example.com"
        data-io-path="/socket.io"></script>
<script>
  // 不用传 url，自动从 data-io-src 推断
  const socket = io();
  socket.on("connect", () => console.log("connected:", socket.id));
</script>
```

**关键参数**：

| 字段 | 兜底 | 风险 |
|------|------|------|
| `data-io-src` | url 推断 | 浏览器专属 |
| `data-io-path` | path 推断 | 默认 `/socket.io` |
| SSR/Node | 不存在 `document` | 推断失败 |
| 老项目 | `<script>` 一行 | Web 简单使用 |
| 替代 | `io(url, opts)` 显式 | Node 必用 |
| 推断兜底 | `location.origin` | 文件协议下退到 `localhost` |

**最佳实践**：
- 浏览器 SDK 用 data-* 属性兜底（vs. 强制 url）——一行 `<script>` 接入降低门槛
- SSR/Node 必传 url——`document` 缺失
- 多个 socket.io 实例不依赖 data-*——传 opts 显式
- v3+ 已经废弃 data-* 推断——新代码用 `io(url)` 显式

### 模式 12 · 同步 ACK 注册历史包袱

**问题场景**：`emit` 同步把回调 push 进 `acks` map——业务异步传 ack 函数会丢。

**解决方案**：ACK 必须在 emit 调用时同步注册——引擎层无法异步捕获 callback 引用。

```ts
// 正确：同步传 ack
socket.emit("event", data, (ack) => {
  console.log(ack);
});

// 错误：异步传 ack，引用丢失
const ack = async () => { /* ... */ };
socket.emit("event", data);  // 不会注册 ack
socket.emit("event", data, ack);  // 必须和 emit 同一行

// v5 实验：Promise 化
const ack = await socket.emitWithAck("event", data);
```

**关键参数**：

| 行为 | 说明 |
|------|------|
| 同步 | `const ack = args.pop() instanceof Function` 立即捕获 |
| 异步 | 不支持（callback 引用丢失） |
| 替代 | 返回 Promise / await 模式（v5 RFC） |
| 风险 | 业务异步生成 callback 会失败 |
| 兜底 | `socket.emitWithAck('event', data)` v5 实验 |
| 类型 | `Socket<...>` 泛型约束 ack 签名 |

**最佳实践**：
- 长连接 ACK 设计必看是否支持同步注册（vs. 假设可以异步）——历史包袱会卡业务
- v5 之前必用 callback 风格——Promise 是实验
- 复杂业务用 `socket.timeout(5000).emit` 替代 `Promise.race` 兜底
- server 端强制 ack timeout 必传——客户端忘了传不报错

### 模式 13 · Engine.IO 客户端传输抽象

**问题场景**：用户配置 `transports: ['polling', 'websocket']` 数组——选哪个？失败怎么办？

**解决方案**：Engine 类做 4 件事——选 transport（polling→ws upgrade）/ 心跳 25s / 解析 6 种包类型 / 暴露 4 事件给上层。

```ts
abstract class Transport {
  abstract open();
  abstract close();
  abstract send(packets: Packet[]);
  abstract onPacket(packet: Packet);
  // 暴露 4 事件给上层
  on("open", () => {});     // 连接成功
  on("message", (data) => {}); // 业务消息
  on("close", (reason) => {}); // 连接关闭
  on("packet", (packet) => {}); // 原始包（升级用）
  on("error", (err) => {});     // 错误
  on("drain", () => {});        // polling buffer 排空
}
```

**关键参数**：

| 模块 | 职责 | 接口 |
|------|------|------|
| 选择 | `createTransport(name)` | 按 name 实例化 Polling/WS |
| 升级 | 异步 polling→ws | 协商 sid/upgrade |
| 心跳 | 25s ping/20s pong | 超时触发 close |
| 解析 | 6 种 Engine Packet | type 字段 |
| 事件 | `on('open'/'message'/'close'/'packet')` | 4 核心 |
| 心跳+升级 | 协议层 | 透明给应用层 |

**最佳实践**：
- 传输层抽象按 4 件事分（vs. 大泥球）——选 transport / 心跳 / 解析 / 事件暴露分离
- 业务层只读 `on('message')`——不用关心是 ws 还是 polling
- 自定义传输继承 `Transport` 基类——`send/onPacket` 必实现
- 升级失败要降级回 polling——不能直接 close

### 模式 14 · 协议一致性 conformance test

**问题场景**：socket.io 客户端 v4.7.x + 服务端 v4.5.x 协议版本号对不上——兼容性谁保证？

**解决方案**：`docs/socket.io-protocol/v*-test-suite/` 跨语言 conformance test——任何想兼容 v5 协议的客户端/服务端都跑这套。

```
test-suite/
├── index.js          # 测试运行器
├── parse.js          # 解析器测试
├── connect.js        # 握手测试
├── send.js           # 发送测试
├── poll.js           # 长轮询测试
├── ws.js             # websocket 测试
├── close.js          # 关闭测试
└── README.md         # 协议说明
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 位置 | `docs/*-protocol/v*-test-suite/` |
| 形态 | 完整可执行 spec |
| 范围 | 跨语言 conformance test |
| 价值 | 协议和参考实现分离 |
| 测试 | Node + 浏览器 wdio |
| v5 | 草拟中，2025-2026 落地 |
| 跨语言 | `python-socketio` / `go-socket.io` 都跑 |

**最佳实践**：
- 协议层项目用 conformance test suite（vs. 单纯文档）——硬保证 + 跨实现兼容
- 任何自研 socket.io 兼容实现都必跑 test suite——避免协议错位
- test suite 是规范"机器可读"形式——比文档更可信
- v5 协议变更前必先更新 test suite——spec-driven development

### 模式 15 · 重连雪崩测试 + backo2 抖动因子

**问题场景**：每版本发布前 k6/wrk 模拟 1k 并发 client——重连雪崩测试专门验证 backo2 抖动因子。

**解决方案**：性能基准 + 雪崩测试——`test/load/` 模拟 1k 并发 client 测每秒消息吞吐、p99 延迟 + 重连雪崩测试。

```js
// test/load/avalanche.js
import { io } from "socket.io-client";

const N = 1000;
const clients = Array.from({ length: N }, () =>
  io("http://localhost:3000", {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
  })
);

// 1k 客户端断网后恢复，验证不同毫秒重连
// 监控每秒请求峰值（应该被 jitter 摊平到 1k 客户端 * 1/(max-min) ≈ 200/s）
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 工具 | k6 / wrk / autocannon |
| 场景 | 1k 并发 client 同时断网重连 |
| 指标 | 每秒消息吞吐 + p99 延迟 |
| 验证 | 抖动因子是否生效（避免同毫秒重连） |
| 频率 | 每版本发布前 |
| 监控 | 服务端连接数峰值 / 内存 / CPU |

**最佳实践**：
- 长连接项目必带重连雪崩测试（vs. 只测单连接）——backo2 抖动因子是核心防线
- 雪崩测试看"重连请求峰值"——不带 jitter 会瞬间打满服务端
- jitter 0.5 是行业标准——再大延迟高，再小雪崩
- 生产事故复盘常因"忘了带 jitter"——必带

## 四、生产实战

### 模式 16 · 选型：socket.io-client vs Centrifugo SDK vs Ably vs SSE

**问题场景**：实时通信 SDK 选型——socket.io-client / Centrifugo SDK / Ably / SSE / 商业 Pusher？

**解决方案**：决策树——功能强 + 易用选 socket.io-client（必须配自家 server）；托管省运维选 Ably；服务端广播选 Centrifugo；单向推送选 SSE。

```ts
// 对比矩阵
const decision = {
  "socket.io-client": {
    ease: 8.5,        // 易用
    feature: 8,       // 功能
    ops: 5,           // 运维（自建 server）
    cost: 9,          // 成本（开源）
    lock: "high",     // 必须配自家 server
  },
  "Centrifugo SDK": {
    ease: 7,
    feature: 7,
    ops: 8,           // 独立服务
    cost: 9,
    lock: "medium",   // 多种 server
  },
  "Ably": {
    ease: 9,
    feature: 8.5,
    ops: 9,           // 托管
    cost: 4,          // 商业
    lock: "low",
  },
  "SSE": {
    ease: 7,
    feature: 3,       // 单向
    ops: 8,
    cost: 10,
    lock: "low",
  },
};
```

**关键参数**：

| SDK | 易用 | 功能 | 运维 | 成本 | 锁 |
|------|------|------|------|------|------|
| socket.io-client | 8.5 | 8 | 中 | 开源 | 高（必须配自家 server） |
| Centrifugo SDK | 7 | 7 | 独立服务 | 开源 | 中 |
| Ably | 9 | 8.5 | 托管 | 商业 | 低 |
| Pusher | 9 | 7 | 托管 | 商业 | 低 |
| SSE | 7 | 3（单向） | 简单 | 免费 | 无 |
| 纯 ws | 5 | 自定义 | 自己 | 免费 | 无 |

**最佳实践**：
- 90% Web 实时应用选 socket.io-client（功能/易用平衡）；省运维选 Ably；单向选 SSE
- 服务端已有 Go/Python/Node 自研能力选 socket.io-client——多语言 SDK 都有
- 多端大并发 + 不想运维选 Ably/Pusher——月费换 SLA
- 单向推送（通知/进度）选 SSE——浏览器原生支持
- 跨节点广播选 Centrifugo——独立服务不耦合业务

### 模式 17 · 7 天复刻 mini-socket.io-client 路线

**问题场景**：想理解 socket.io-client 4 层架构；想 7 天复刻 MVP。

**解决方案**：7 天 MVP——Day 1 Engine.IO 6 包类型，Day 2 XHR long-polling，Day 3 25s ping/pong，Day 4 backo2 抖动重连，Day 5 parser EVENT/ACK 编解码，Day 6 Manager 单例 + Socket 多路，Day 7 TS 声明 + ESM/CJS/UMD 打包。

```
Day1: Engine.IO OPEN/MESSAGE/CLOSE/PING/PONG/UPGRADE 6 包类型
      - 实现 PacketType enum
      - 解析 packet 编码（v4 协议）
Day2: XHR long-polling 最小可用
      - fetch 阻塞读取
      - send 队列 + buffer
Day3: 25s ping/pong 防止 NAT 掐
      - setInterval 25s
      - pong timeout 20s
Day4: backo2 退避 + 抖动（防雪崩）
      - 6 行实现
      - 重连后 reset
Day5: socket.io-parser EVENT/ACK 编解码
      - JSON 序列化
      - ack 编号 + map
Day6: Manager 单例 + Socket 多路复用
      - managers[uri] 全局 map
      - nsp 多 Socket
Day7: TS 声明 + ESM/CJS/UMD 打包
      - package.json 4 字段
      - rollup / tsup
```

**关键参数**：

| Day | 模块 | 行数 |
|-----|------|------|
| 1 | Engine.IO 6 包类型 | 200 |
| 2 | XHR long-polling | 300 |
| 3 | 25s ping/pong | 100 |
| 4 | backo2 抖动重连 | 50 |
| 5 | parser EVENT/ACK | 200 |
| 6 | Manager + Socket | 400 |
| 7 | TS + 多格式打包 | 150 |
| 总 | — | ~1400 行 |

**最佳实践**：
- 复刻 mini-socket.io-client 先做 Engine.IO + backo2——核心 1000 行 2 周能出可用品
- Day 4 别跳——backo2 是必装安全件
- Day 5 协议层先行——E2E 一致性靠它
- Day 6 Manager 单例是浏览器的关键——HTTP/1.1 6 连接上限
- Day 7 多格式打包必做——4 字段覆盖 4 场景

### 模式 18 · backoff 算法通用化

**问题场景**：MQTT / WebRTC / gRPC-stream / 长轮询——所有长连接项目都需要防雪崩重连。

**解决方案**：抄 backo2 抽出来——任何长连接项目都该用，参数 `min/max/randomizationFactor` 三件套。

```ts
// 通用 Backoff（任何长连接项目可复用）
export class Backoff {
  private ms = this.min;
  constructor(
    public min = 1000,
    public max = 5000,
    public factor = 2,
    public jitter = 0.5
  ) {}
  next(): number {
    const ms = this.ms * this.factor + this.jitter * this.ms * Math.random();
    this.ms = Math.min(this.ms * this.factor, this.max);
    return ms;
  }
  reset() { this.ms = this.min; }
}
```

**关键参数**：

| 字段 | 默认 | 说明 |
|------|------|------|
| `min` | 1000 ms | 退避起点 |
| `max` | 5000 ms | 退避上限 |
| `factor` | 2 | 指数因子 |
| `jitter` | 0.5 | 抖动幅度 |
| `reset()` | — | 重连成功调 |
| 复用 | MQTT / WebRTC / gRPC / 长轮询 / IndexedDB | — |
| 价值 | 6 行代码挡雪崩 | — |

**最佳实践**：
- 长连接项目必带 backoff 抖动（vs. 固定 sleep）——抄 backo2 是行业标准
- MQTT `mqtt.js` 自带同款算法
- WebRTC ICE 重连用同样逻辑
- gRPC stream 重试用同样逻辑
- 任何自研长连接 SDK 都该抄

### 模式 19 · 生产实战配置

**问题场景**：socket.io-client 上生产——断网重连、限流、链路追踪、健康检查怎么做？

**解决方案**：实战清单——断网重连业务要重发"我当前状态"（不依赖服务端保留）+ `engine.id` 作为 traceparent + `connect_error` 上报监控。

```ts
import { io } from "socket.io-client";

const socket = io("https://api.example.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,
  timeout: 10000,           // 握手超时
  auth: (cb) => {            // 动态鉴权
    cb({ token: getToken() });
  },
});

// 1. 业务重发状态
socket.on("connect", () => {
  socket.emit("client:resync", clientLocalState);
});

// 2. engine.id 作为 traceparent
socket.io.engine.on("open", () => {
  const traceparent = `00-${socket.io.engine.id}-${spanId}-01`;
  // 上报
});

// 3. connect_error 上报监控
socket.on("connect_error", (err) => {
  Sentry.captureException(err, {
    tags: { socket_url: socket.io.uri },
  });
});

// 4. 限流（应用层）
let messageCount = 0;
socket.onAny(() => {
  if (++messageCount > 1000) {
    socket.disconnect();
  }
});
```

**关键参数**：

| 维度 | 配置 | 说明 |
|------|------|------|
| 重连 | 业务重发状态 | server volatile/中间件处理 |
| 限流 | 应用层自己做 | 库不提供 |
| 追踪 | `engine.id` | 连接唯一 id 作为 traceparent 一部分 |
| 健康 | `connect_error` | 上报监控（Sentry/Datadog） |
| 日志 | `socket.io-client-logger` | 中间件（社区） |
| 集群 | server 端 | `socket.io-redis-adapter` |
| 鉴权 | `auth: (cb) => cb({ token })` | 动态 token |
| SSL | `secure: true` / `rejectUnauthorized` | 自签证书 |

**最佳实践**：
- socket.io-client 生产必带 `{ timeout: ... }` + 重连后业务重发状态——比依赖服务端保留简单 10x
- `engine.id` 是免费链路追踪 ID——不用白不用
- `connect_error` 必上报监控——99% 连接失败都靠它发现
- 限流必加——单连接每秒 10k 消息能把客户端打爆
- 集群必用 redis-adapter——多节点广播

### 模式 20 · socket.io-client 演进历史与设计哲学

**问题场景**：socket.io-client 14 年演进（2010-2024）——什么驱动 v0→v1→v2→v3→v4？

**解决方案**：历史回顾——v0.9 LearnBoost 原型 → v1.0 独立 socket.io → v2 Engine.IO 拆出 → v3 TS 重写 → v4 鉴权+类型 → 2022 合并 monorepo。

```
时间线：
2010  v0.9  LearnBoost（Guillermo Rauch）原型，朴素 WS 封装
2011  v1.0  独立 socket.io 品牌，namespace 概念
2014  v1.x  socket.io 流行，配合 Express/Redis
2016  v2.0  Engine.IO 拆出（传输层和应用层解耦）
2017  v2.x  binary 支持
2019  v3.0  TypeScript 重写（业内争议）
2020  v3.1  强制 ESM 实验
2021  v4.0  鉴权 + 类型 + StrictEventEmitter
2022      合并入 socket.io monorepo
2023  v4.7  4 字段打包 / exports
2024  v4.7  active LTS
2025  v5    RFC（草拟）
```

**关键参数**：

| 阶段 | 关键变化 | 驱动 |
|------|----------|------|
| v0→v1 | LearnBoost 临时封装 → 公共 API | 社区反馈 |
| v1→v2 | 拆 engine.io（协议和 client 揉在一起难维护） | 工程化 |
| v2→v3 | TS 重写（业内争议"重写之罪"还是"必由之路"） | 类型安全 |
| v3→v4 | 鉴权 + 类型 | 安全性 |
| 2022 | 合并 monorepo | parser/engine.io/socket.io 三方同步版本 |
| v5 | 2025-2026 | RFC 草拟 |
| 关键 | "先稳定 API，再加特性，最后优化" | 哲学 |

**最佳实践**：
- 长生命周期客户端按"先 API 稳定、再加新特性、最后性能优化"演进（vs. 一次性大重构）——用户平滑升级
- 大版本重写要"分两版"——v3/v4 共存期 12+ 月
- monorepo 化是规模化的必由之路——多包同步发布
- RFC 公开化是社区协议的标准做法——v5 草拟公开
- 演进历史要写进 CHANGELOG——给后来人参考

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\socketio-client\`
- 状态：legacy 仓库已 archieve，活跃代码在 `https://github.com/socketio/socket.io` 的 `packages/socket.io-client/`
- Star：60k+（monorepo 整体）
- License：MIT

**核心模块**（monorepo 内）：
- `lib/index.ts` = 公开入口 `io(url, opts)` 默认导出
- `lib/socket.ts` = 单个命名空间的事件订阅/发送，含 ACK
- `lib/manager.ts` = 单 Manager = 一个底层连接 + 多 Socket 命名空间
- `lib/on.ts` = 公共 onAny / offAny 事件路由
- `lib/parent-namespace.ts` = `/` 父命名空间，child 共享一个传输
- `lib/contrib/backo2.ts` = 抖动指数退避
- `node_modules/engine.io-client` = Engine.IO 传输层

**3 核心洞察**：
1. 网络层永远会被破坏：polling 看似低效却救场；25s 心跳是为 NAT 而非应用
2. 重连的杀手锏是抖动而非延迟：`backo2` 抖动解决雪崩
3. 单连接多路复用是浏览器的唯一选择：Manager 模式直接 copy

**1 反模式**：ACK 回调必须同步注册（历史包袱）——无法异步传 ack 是引擎层限制。

**1 可复用模式**：`backo2` 类——任何长连接项目的"防雪崩"标配，6 行实现。

**3 立刻能用**：
1. 抄 `backo2` 给你的 WebRTC/MQTT 项目加抖动重连
2. 抄 Manager 单例思路给 IndexedDB/WebSQL 做"按 key 复用连接"封装
3. 抄 `Engine.IO` 6 种包类型给你的私有协议加 ping/pong 心跳 + 二进制通道
