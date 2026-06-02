# node - V8 + libuv 事件循环 JS 运行时

**GitHub**: https://github.com/nodejs/node
**Star**: 110k+
**语言**: C++ / JavaScript
**主题**: JS 运行时 / 异步 I/O / V8 引擎
**适用场景**: API 后端、CLI 工具、前端工具链、Serverless 函数

## 第一段：基础范式

### 模式 1: 单线程事件循环
**问题场景**：传统多线程 server 进程/线程模型上下文切换成本高，连接数一上来就崩。
**解决方案**：Node.js 主线程跑 V8 解释器 + libuv 事件循环，所有 I/O 通过 libuv 注册到 OS 事件多路复用（epoll/kqueue/IOCP）。主线程单线执行 JS，回调队列顺序触发。
**关键参数**：
- 主线程：1 个 V8 isolate + main loop
- worker 池：默认 4 线程
- 事件循环阶段：timers / pending callbacks / idle / poll / check / close
- microtask 队列：process.nextTick / Promise
**最佳实践**：CPU 密集任务用 worker_threads 切走，不要阻塞主循环。

### 模式 2: V8 引擎集成
**问题场景**：要把 V8 当 JS 解释器嵌入，但 V8 设计为浏览器嵌入式，缺 IO、缺系统调用。
**解决方案**：Node 在 C++ 层继承 V8 isolate，调用 v8::Context、v8::Function 等 API 编译运行 JS。Node 暴露 fs/net/dns 等系统 API 给 JS，由 C++ binding 桥接。
**关键参数**：
- v8::Isolate：JS 沙箱
- v8::Context：变量作用域
- v8::Local / Persistent：handle
- v8::FunctionTemplate：暴露 C++ 函数
**最佳实践**：写 native addon 用 N-API（napi-rs），跨 Node 版本兼容。

### 模式 3: libuv 异步 I/O
**问题场景**：跨平台异步 I/O（Linux epoll、macOS kqueue、Windows IOCP）抽象。
**解决方案**：libuv 把 epoll/kqueue/IOCP 统一为 uv_loop_t 事件循环。Node 主循环跑 uv_run，文件 I/O 用线程池（uv_queue_work），网络 I/O 用 OS 事件通知。
**关键参数**：
- uv_loop_t：事件循环
- uv_handle_t：句柄基类
- uv_req_t：请求基类
- UV_RUN_DEFAULT / ONCE / NOWAIT
**最佳实践**：监控 `eventLoopUtilization`（v22+）指标，发现主线程被卡顿。

### 模式 4: 模块系统 CommonJS / ESM
**问题场景**：浏览器没有模块系统，Node 一开始用 CommonJS（require/module.exports），ES2015 后又引入了 ESM（import/export），两套怎么共存？
**解决方案**：Node 支持 .cjs（CommonJS）、.mjs（ESM）、.js（按 package.json 的 type 字段决定）。CJS 是同步加载 + 缓存，ESM 是异步 + 静态分析 + 树摇。
**关键参数**：
- require() / module.exports：CJS
- import / export：ESM
- package.json "type": "module"
- 互操作：cjs 加载 esm 用 dynamic import()
**最佳实践**：新项目用 ESM，type=module；老项目 CJS 渐进迁移。

### 模式 5: worker_threads 多线程
**问题场景**：主线程单 CPU，要跑 CPU 密集计算（图像处理、加密）怎么办？
**解决方案**：Node 10+ 引入 worker_threads，每个 worker 独立 V8 isolate + 事件循环，主线程通过 MessagePort / SharedArrayBuffer / Atomics 通信。比 cluster（多进程）轻量。
**关键参数**：
- new Worker(filename)
- workerData / parentPort.postMessage
- SharedArrayBuffer：零拷贝共享内存
- Atomics：原子操作
**最佳实践**：CPU 密集型（hash、AI 推理）用 worker_threads；网络并行用 cluster。

## 第二段：扩展范式

### 模式 6: 进程模型与 cluster
**问题场景**：单进程单线程如何利用多核？
**解决方案**：cluster 模块 fork 多个子进程共享 server socket。PM2 / Node --cluster-mode 帮你做负载均衡。K8s 场景下用 K8s Service 替代 cluster。
**关键参数**：
- cluster.fork()
- 主从模式：master 派发 / worker 处理
- IPC：process.send / child.on('message')
- 反向代理：nginx / envoy
**最佳实践**：容器时代 cluster 已被 K8s 取代，倾向单进程 + 弹性扩缩。

### 模式 7: 异步流程控制
**问题场景**：回调地狱（callback hell）怎么治理？
**解决方案**：从 callback → Promise → async/await 三阶段演进。util.promisify 把回调函数转 Promise。async/await 配 try/catch 写同步风格。
**关键参数**：
- Promise：pending / fulfilled / rejected
- async function：返回 Promise
- await：暂停点
- Promise.all / race / allSettled
**最佳实践**：所有 IO 全部 await，禁止混用 raw callback（除特殊 API）。

### 模式 8: Stream 与背压
**问题场景**：大文件传输（GB 级别）怎么避免内存爆炸？
**解决方案**：Node 内置 4 种 Stream：Readable / Writable / Duplex / Transform。pipe() 串联 stream，自动管理背压（pause/resume）。
**关键参数**：
- highWaterMark：默认 16KB
- pipe / pipeline
- 流事件：data / end / error / drain
- `pipeline()`：自动清理
**最佳实践**：永远用 `pipeline()` 而非手写 pipe，自动处理错误传播和清理。

### 模式 9: Buffer 与二进制
**问题场景**：处理图片、协议、加密等二进制数据。
**解决方案**：Node Buffer 是 V8 堆外分配的 Uint8Array，零拷贝。`Buffer.from(arrayBuffer)` 共享内存，`Buffer.alloc(size)` 申请新内存。
**关键参数**：
- Buffer.alloc / from / concat
- toString('utf8' / 'hex' / 'base64')
- Node 12+ 默认支持 BigInt 与 ArrayBuffer
- 安全：alloc 初始化 from 共享
**最佳实践**：永远 Buffer.alloc() 不用 new Buffer()（已弃用）。

### 模式 10: N-API 与 native addon
**问题场景**：跨语言集成（Rust/C++ 高性能模块）。
**解决方案**：N-API 是 C 稳定的 ABI，跨 Node 版本兼容。napi-rs（Rust）/ node-addon-api（C++）是主流工具。编译为 .node 文件由 process.dlopen 加载。
**关键参数**：
- napi_create_function
- napi_get_cb_info
- napi_threadsafe_function
- node-gyp build / cmake-js
**最佳实践**：性能关键路径用 Rust 写 addon，通过 N-API 暴露给 JS。

## 第三段：进阶范式

### 模式 11: 事件循环阶段与 microtask
**问题场景**：setTimeout 回调与 Promise.then 哪个先跑？
**解决方案**：事件循环分 6 阶段：timers → pending callbacks → idle,prepare → poll → check → close。每个阶段跑完清空 microtask 队列（process.nextTick > Promise.then）。setTimeout 进入 timers 阶段。
**关键参数**：
- 阶段：timers / poll / check
- microtask：nextTick / Promise
- setImmediate vs setTimeout(0)：setImmediate 在 check 阶段
- process.nextTick：microtask 最优先
**最佳实践**：避免 nextTick 递归（会卡死主循环），用 setImmediate 替代。

### 模式 12: 性能监控与诊断
**问题场景**：线上 Node 服务怎么快速定位慢、漏、错？
**解决方案**：内置 `node:perf_hooks` 暴露 PerformanceObserver、histogram、eventLoopUtilization。`node --inspect` 启动 Chrome DevTools。`clinic.js` 火焰图工具。`v8.writeHeapSnapshot()` 抓内存。
**关键参数**：
- PerformanceObserver：监听 'measure' / 'event' / 'gc'
- async_hooks：跟踪异步资源
- --inspect-brk：断点启动
- v8.getHeapStatistics()
**最佳实践**：把 perf_hooks 数据暴露为 Prometheus 指标。

### 模式 13: 内存管理与 GC
**问题场景**：Node 内存泄漏（监听器没卸、定时器没清、闭包持有）怎么排查？
**解决方案**：V8 GC 分 major / minor / incremental，Node 暴露 `process.memoryUsage()`。`--max-old-space-size=4096` 调老生代。`--expose-gc` 手动触发 GC。
**关键参数**：
- rss / heapTotal / heapUsed / external
- --max-old-space-size
- --max-semi-space-size
- heap snapshot
**最佳实践**：用 memwatch-next / heapdump 在内存飙升时自动 dump heap。

### 模式 14: 安全与 CWE
**问题场景**：Node 服务常见安全漏洞：原型链污染、依赖注入、命令注入、ReDoS、SSRF。
**解决方案**：npm audit 扫依赖；eslint-plugin-security 静态扫；用 `node --frozen-intrinsics` 冻结全局；用 `child_process.execFile` 替代 `exec` 防命令注入。
**关键参数**：
- npm audit --production
- eslint-plugin-security
- helmet / csurf / express-rate-limit
- DOMPurify / sanitize-html
**最佳实践**：CI 跑 `npm audit --audit-level=high` 卡点。

### 模式 15: HTTP/2 与 HTTP/3
**问题场景**：HTTP/1.1 队头阻塞、多路复用缺。
**解决方案**：Node 8+ 内置 http2 模块，支持多路复用、流优先级、服务端推送。HTTP/3 基于 QUIC 由 quiche 等库支持。
**关键参数**：
- http2.createServer
- stream: 1 connection 多 stream
- ALPN：协商协议
- 推送：stream.pushStream()
**最佳实践**：高并发 API 用 http2，K8s 入口由 nginx 终结 http2。

## 第四段：实战范式

### 模式 16: 写一个 Express/Fastify 服务
**问题场景**：搭一个 5 分钟能起来的 REST API。
**解决方案**：npm init -y → npm i express → 写 app.js → 监听 3000 端口。或 Fastify（性能高 2 倍）。TS 项目用 ts-node-dev / tsx。
**关键参数**：
- express() / fastify()
- app.use(middleware)
- app.listen(port, callback)
- helmet / cors / morgan
**最佳实践**：高吞吐选 Fastify，开发速度选 Express。

### 模式 17: TypeScript + tsc 编译
**问题场景**：JS 项目升级 TS，享受类型安全。
**解决方案**：tsconfig.json 配 strict: true、target: ES2022、module: NodeNext、moduleResolution: NodeNext。tsc 编译输出到 dist。tsx 替代 ts-node。
**关键参数**：
- strict: true
- target: ES2022
- module: NodeNext
- types: ["node"]
**最佳实践**：开启 strict 和 noUncheckedIndexedAccess，把类型 bug 消灭在编译期。

### 模式 18: 部署与 PM2
**问题场景**：线上 Node 怎么零停机部署？
**解决方案**：PM2 进程守护 + 集群模式：`pm2 start dist/main.js -i max`。Docker 多阶段：builder 跑 npm run build，runtime 用 node:20-alpine + dist 目录。K8s 用 Deployment + readinessProbe。
**关键参数**：
- pm2 ecosystem.config.js
- `pm2 reload`：零停机
- Docker: node:20-alpine
- K8s: readinessProbe / livenessProbe
**最佳实践**：CPU 密集服务用 PM2 cluster；网络密集用 K8s HPA。

### 模式 19: Node 在 AI 直播平台
**问题场景**：AI 直播平台后端用 Node 做什么？
**解决方案**：Node 跑 BFF 层（API 聚合、WebSocket 弹幕、用户认证）。AI 推理走 Python gRPC。Node 端用 Prisma 操作 PostgreSQL，用 Redis 做会话和限流，用 BullMQ 跑异步任务。
**关键参数**：
- @nestjs/core / Fastify adapter
- @prisma/client
- ioredis
- bullmq
- socket.io 推流
**最佳实践**：Node 单实例 < 2 GB 内存；CPU 任务用 worker_threads；AI 任务走 gRPC。

### 模式 20: 监控与日志
**问题场景**：Node 上线后怎么观测？
**解决方案**：Pino 结构化日志（5 倍快于 winston）。OpenTelemetry trace。Prometheus 抓 `nodejs_eventloop_lag_seconds`。Sentry 抓异常。Grafana 画图。
**关键参数**：
- pino + pino-pretty
- @opentelemetry/sdk-node
- prom-client
- @sentry/node
**最佳实践**：所有日志带 trace_id，方便关联。
