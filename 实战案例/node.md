# Node.js - V8 + libuv 事件循环 JS 运行时

**GitHub**: nodejs/node
**Star**: 110k+
**语言**: C++ / JavaScript
**主题**: runtime、v8、libuv、event-loop
**适用场景**: 后端服务、CLI 工具、构建工具、HTTP 服务器

---

## 一、基础范式

### 模式 1 · V8 引擎 + libuv 事件循环

**问题场景**：浏览器外跑 JS 需要 runtime。

**解决方案**：Node.js = V8 引擎（执行 JS）+ libuv（事件循环 + 异步 I/O）+ C++ 绑定（系统调用）；单线程 + 异步非阻塞。

**关键参数**：
- V8 JIT
- libuv
- 事件循环
- 单线程
- 100K 并发

**最佳实践**：所有 I/O 密集后端用 Node.js 事件循环模型。

### 模式 2 · CommonJS 模块（require / module.exports）

**问题场景**：浏览器无模块系统，Node 端需要。

**解决方案**：CommonJS 规范 `const fs = require('fs')` / `module.exports = { foo: 'bar' }`；`__dirname` / `__filename` 全局变量；同步加载。

**关键参数**：
- `require()`
- `module.exports`
- `__dirname`
- 同步加载
- 缓存机制

**最佳实践**：所有 Node 老项目用 CommonJS，新项目可选 ESM。

### 模式 3 · ES Modules（import / export）

**问题场景**：现代 JS 用 ES Modules，Node 需要支持。

**解决方案**：`import fs from 'fs'` / `export const foo = 'bar'`；`.mjs` 扩展名或 `package.json` `"type": "module"`；异步加载。

**关键参数**：
- `import` / `export`
- `.mjs` / `"type": "module"`
- 静态分析
- Tree Shaking
- 现代

**最佳实践**：所有新项目用 ES Modules，与前端统一。

### 模式 4 · 内置模块（fs / http / path / url）

**问题场景**：需要操作系统能力（文件 / 网络 / 路径）。

**解决方案**：Node.js 内置 30+ 核心模块：`fs`（文件）/ `http` / `https` / `path` / `url` / `os` / `crypto` / `stream` / `events` / `util` / `child_process` / `cluster` / `worker_threads` / `buffer` 等。

**关键参数**：
- 30+ 核心模块
- `fs` / `http` / `path`
- 0 安装
- 内置 API
- 稳定

**最佳实践**：所有项目优先用内置模块，减少依赖。

### 模式 5 · npm 包管理（package.json + node_modules）

**问题场景**：需要管理项目依赖。

**解决方案**：`package.json` 声明依赖（`dependencies` / `devDependencies`），`npm install` 安装到 `node_modules`；`npm run <script>` 执行 scripts；npm / yarn / pnpm 三种客户端。

**关键参数**：
- `package.json`
- `node_modules/`
- `npm install`
- pnpm 推荐
- scripts

**最佳实践**：所有项目用 pnpm（速度快 + 磁盘省），monorepo 必选。

---

## 二、扩展范式

### 模式 6 · Streams 流（可读 / 可写 / 转换 / 双工）

**问题场景**：大文件（GB 级）一次性读入内存爆。

**解决方案**：`fs.createReadStream('file.txt')` 可读流；`fs.createWriteStream('out.txt')` 可写流；`stream.pipeline()` 管道传输；`Readable.from()` 转换。

**关键参数**：
- Readable / Writable
- Transform / Duplex
- `pipe()` / `pipeline()`
- 背压处理
- 0 内存压力

**最佳实践**：所有 > 100MB 文件操作用 Stream。

### 模式 7 · EventEmitter 事件驱动

**问题场景**：需要发布订阅模式。

**解决方案**：`const EventEmitter = require('events')` / `class MyEmitter extends EventEmitter {}`；`emitter.on('event', listener)` / `emitter.emit('event', data)`；Node.js 内部大量使用（`http.Server` / `fs.ReadStream`）。

**关键参数**：
- `extends EventEmitter`
- `on` / `emit`
- `once` / `off`
- 同步执行
- 0 依赖

**最佳实践**：所有需要解耦的组件用 EventEmitter，告别回调嵌套。

### 模式 8 · Child Process（spawn / exec / fork）

**问题场景**：需要跑子进程（系统命令 / 脚本）。

**解决方案**：`child_process.spawn('ls', ['-l'])` 启动子进程；`exec` 缓冲输出；`fork` Node 进程 + IPC；`execFile` 替代 exec 防注入。

**关键参数**：
- `spawn` / `exec` / `fork`
- IPC 通信
- stdin / stdout
- 错误处理
- 0 阻塞

**最佳实践**：所有调用系统命令用 spawn/execFile，告别 exec 注入。

### 模式 9 · Cluster 模式（多进程）

**问题场景**：单线程 Node 利用不了多核。

**解决方案**：`cluster.fork()` 多 worker 进程共享 server port；`cluster.isMaster` 区分主从；PM2 / `node --cluster` 简化。

**关键参数**：
- `cluster.fork()`
- 主从模式
- 共享 port
- PM2 推荐
- 多核利用

**最佳实践**：所有生产 Node 用 Cluster / PM2 模式，CPU 利用率 100%。

### 模式 10 · Worker Threads（CPU 密集）

**问题场景**：CPU 密集任务（图像处理 / 加密）阻塞主线程。

**解决方案**：`new Worker('./worker.js')` 启动 worker 线程；`worker.postMessage()` / `worker.on('message', ...)` 通信；`SharedArrayBuffer` 共享内存；`Atomics` 同步。

**关键参数**：
- `new Worker`
- `postMessage`
- `SharedArrayBuffer`
- `Atomics`
- 0 阻塞

**最佳实践**：所有 CPU 密集任务用 Worker Threads，主线程零阻塞。

---

## 三、进阶范式

### 模式 11 · AsyncLocalStorage（请求级上下文）

**问题场景**：跨多个异步调用传递请求 ID（不显式传参）。

**解决方案**：`const als = new AsyncLocalStorage()`；`als.run(store, () => { ... })` 创建上下文；`als.getStore()` 在任意异步链路取回。

**关键参数**：
- `AsyncLocalStorage`
- `als.run()`
- 异步穿透
- 0 显式传参
- 16.x 稳定

**最佳实践**：所有需要 traceId / userId 透传的项目用 AsyncLocalStorage。

### 模式 12 · Buffer / TypedArray 二进制

**问题场景**：处理二进制数据（图片 / 协议 / 文件）。

**解决方案**：`Buffer.from('hello')` 创建 buffer；`Buffer.alloc(1024)` 分配；`Uint8Array` / `DataView` 视图；Node 16+ 推荐 `Buffer` 用 `Uint8Array` 替代。

**关键参数**：
- `Buffer.from` / `Buffer.alloc`
- `Uint8Array`
- `DataView`
- 二进制处理
- 性能优

**最佳实践**：所有二进制处理用 Buffer，新项目考虑 Uint8Array。

### 模式 13 · 自定义 Loader（ESM）

**问题场景**：需要从特殊源加载 ES Module（HTTP / 数据库 / 配置）。

**解决方案**：`--experimental-loader ./loader.mjs` 注册自定义 loader；`resolve` / `load` / `globalPreload` 钩子；`node --import` 预加载。

**关键参数**：
- `--experimental-loader`
- 3 钩子
- 自定义源
- 0 同步
- 实验性

**最佳实践**：所有需要动态 ESM 加载的项目用自定义 loader。

### 模式 14 · Test Runner（node:test）

**问题场景**：需要测试框架。

**解决方案**：`node --test` 内置 test runner；`import { test } from 'node:test'`；`test('name', async (t) => { await t.test('nested') })`；`assert` 模块断言；TAP 输出。

**关键参数**：
- `node:test`
- 内置
- TAP 输出
- 并行 / 串行
- 0 依赖

**最佳实践**：所有新 Node 项目用 node:test，0 第三方测试依赖。

### 模式 15 · Node 性能优化（--inspect / Clinic.js）

**问题场景**：Node 应用性能瓶颈难定位。

**解决方案**：`node --inspect app.js` Chrome DevTools 调试；`clinic.js doctor` 火焰图；`node --prof` 性能分析；`autocannon` 压测；`0x` 火焰图。

**关键参数**：
- `--inspect`
- `clinic.js`
- `--prof`
- `autocannon`
- 0 配置

**最佳实践**：所有 Node 项目配 --inspect + clinic.js，调试效率 10x。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Node.js 项目。

**解决方案**：7 件套：① `package.json` + `"type": "module"` ② `src/index.js` 入口 ③ `src/routes/` 业务 ④ `.env` + dotenv ⑤ `node --watch` 开发 ⑥ `pm2 start` 生产 ⑦ `node --test` 测试。

**关键参数**：
- package.json
- ESM
- 入口
- 路由
- .env
- watch
- pm2
- test

**最佳实践**：所有新项目用 7 件套 + ESM，5 分钟跑起来。

### 模式 17 · 部署到 Docker + PM2 / K8s

**问题场景**：Node.js 怎么部署。

**解决方案**：Docker 多阶段 `node:20-alpine` + `npm ci --only=prod`；PM2 集群 `pm2 start dist/index.js -i max`；K8s `livenessProbe: /health`；Nginx 反向代理。

**关键参数**：
- node:20-alpine
- 多阶段
- PM2 集群
- K8s liveness
- 0 配置

**最佳实践**：所有 Node 生产用 Docker + PM2 / K8s。

### 模式 18 · 性能优化 7 招

**问题场景**：Node.js 性能瓶颈。

**解决方案**：7 招优化：① Cluster / PM2 多核 ② Worker Threads CPU 密集 ③ Stream 处理大文件 ④ `node --max-old-space-size=8192` 堆 ⑤ Fastify / uWebSockets.js 替代 Express ⑥ Redis 缓存 ⑦ 启用 `http2`。

**关键参数**：
- Cluster
- Worker
- Stream
- 堆大小
- Fastify
- Redis
- HTTP/2

**最佳实践**：7 招组合，Node 性能 10x。

### 模式 19 · 与 Deno / Bun 对比

**问题场景**：JS runtime 选型。

**解决方案**：Node.js 定位「生态最大 + 成熟稳定」适合生产；Deno 定位「安全默认 + TS 原生 + ESM only」适合现代；Bun 定位「Drop-in 替代 + 极致速度 + 内置 SQLite」适合新项目。

**关键参数**：
- 生态：Node.js > Deno > Bun
- 速度：Bun > Deno > Node.js
- TS 原生：Deno > Bun > Node.js
- 安全：Deno > Bun > Node.js

**最佳实践**：生产用 Node.js，新项目可试 Bun，TS first 选 Deno。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想做内部 JS runtime。

**解决方案**：7 天分 5 步：① V8 嵌入 + JS 执行 ② libuv 事件循环 ③ fs / http 内置模块 ④ require 加载器 ⑤ npm 集成。

**关键参数**：
- Day 1-2: V8 嵌入
- Day 3: libuv
- Day 4: 内置模块
- Day 5: require
- Day 6-7: npm

**最佳实践**：7 天复刻「极简 runtime」，完整 Node 复刻需要 2 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\nodejs\node\`
- **大小**: ~500 MB
- **总文件数**: 数千 C++ / JS 文件
- **关键 commit**: v22.x（最新 LTS）
- **团队**: Node.js 基金会 + 社区
- **许可**: MIT

## 一句话总结

Node.js 用「V8 引擎 + libuv 事件循环 + CommonJS/ESM 双模块 + 内置 30+ 核心模块 + npm 生态」让 JS 走出浏览器成为后端事实标准 runtime，全球 2000 万+ 开发者使用。
