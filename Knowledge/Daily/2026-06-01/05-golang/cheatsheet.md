# 《Go 语言》速查卡

> 入口在 [[README|README.md]]｜分类：Language/Compiler｜⭐⭐⭐⭐⭐⭐｜适用：服务端 / 云原生 / 高并发服务

---

## 🎯 一句话价值

**工业级语言工程的典范**：自举编译器 + 极简 runtime + 强大生态，1 个 G 2KB 栈可起百万个。

---

## 🧠 3 个核心洞察（必背）

1. **GMP 调度** — G/M/P 三层模型 + work stealing + handoff，1 个 G ~50ns 切换
2. **三色 + 混合写屏障** — 并发 GC 正确性，STW < 500μs，1.22+ < 200μs
3. **编译时逃逸分析** — 60-80% 栈分配，零 GC 压力，配合 sync.Pool 复用对象

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `runtime/proc.go:schedule` | GMP 4 步找 G（LRQ/GRQ/steal/netpoll）+ 61 魔数防饥饿 |
| 2 | `runtime/chan.go:hchan` | 环形缓冲 + sudog 同步交接（memcpy 50ns）+ 锁粒度 = chan |
| 3 | `runtime/mgc/mark.go:gcDrain` | 三色标记 + 混合写屏障 + GC assist 平摊 CPU |
| 4 | `cmd/compile/internal/escape/escape.go` | 跨函数 flow analysis + 5 大逃逸场景 + 标量替换 |
| 5 | `runtime/panic.go:deferproc` | 1.14+ open-coded defer 零开销 + panic 串行 unwind |

---

## ⚡ 性能数字（8 核, 100w goroutine 实测）

| 场景 | 指标 | 数值 | 对比 |
|------|------|------|------|
| G 调度（LRQ 命中） | 延迟 | ~10-50ns | OS 线程 1-10μs (100x 慢) |
| G 调度（work steal） | 延迟 | ~500ns | 跨 P 通信 |
| G 切换上下文 | 时间 | ~50-100ns | 线程 1-10μs |
| Channel 同步交接 | 延迟 | ~80ns | 含 memcpy |
| Channel 缓冲 send | 延迟 | ~50ns | 锁开销 |
| GC STW（1.22+） | 暂停 | ~50-200μs | Java ~1-10ms (50x 慢) |
| GC 吞吐（1.20+） | CPU 占比 | ~25% | Java ~30% |
| 写屏障开销（混合） | 写性能损失 | 2-3% | Dijkstra 5-10% |
| 分配 mcache hit | 时间 | ~30ns | malloc 100ns |
| 1.14+ open-coded defer | 开销 | ~0ns | 1.13 之前 50-200ns |
| 逃逸分析收益 | 加速 | 5-10x | 标量替换 + 锁消除 |

**结论**：栈分配 + LRQ 命中 + 同步 channel + open-coded defer = Go 性能黄金组合。

---

## 🌳 调度决策树

```
goroutine 调度
  │
  ├── 任务在 P 本地 LRQ → 无锁，10-50ns
  │
  ├── 任务在全局 GRQ → 抢锁，100ns（每 61 次调度）
  │
  ├── 任务在其他 P LRQ → work steal（4 次尝试），500ns
  │
  ├── 任务在 netpoll → epoll ready，1-5μs
  │
  └── 全无 → park 当前 M（睡眠，等唤醒）
```

### 内存分配路径

```
Goroutine new(T)
  ↓
mcache (P 本地, 无锁)          ← 30ns（hit）
  ↓ 拿不到
mcentral (全局, 按 size class) ← 100ns
  ↓ 拿不到
mheap (堆, span 管理)           ← 1μs
  ↓ 不够
OS (mmap)                       ← 1-10μs
```

---

## 🚀 命令分组速查

### 编译 & 运行
```bash
go run main.go                  # 编译 + 运行
go build -o app .               # 编译成二进制
go build -gcflags='-m' main.go  # 看逃逸分析
go build -gcflags='-m -m'       # 详细逃逸
go build -ldflags="-s -w"       # 去掉符号表（更小）
go build -tags=jsoniter         # 编译标签
go env -w GOPROXY=https://goproxy.cn,direct  # 国内代理
```

### 测试 & 基准
```bash
go test ./...                   # 跑所有测试
go test -race ./...             # 开启 data race 检测
go test -bench=. -benchmem      # 跑基准
go test -bench=. -cpuprofile=cpu.prof -memprofile=mem.prof  # 出 profile
go test -cover ./...            # 覆盖率
go test -count=1 -run=TestX     # 强制重跑（忽略缓存）
```

### 调试 & 性能
```bash
go tool pprof cpu.prof                 # 启动 pprof 交互
go tool trace trace.out                # 启动 trace 可视化
go tool pprof -http=:8080 cpu.prof     # web UI

# pprof 交互命令
(pprof) top10                          # top 10 热点
(pprof) list funcName                  # 看函数源码级热点
(pprof) web                            # 打开浏览器看调用图
(pprof) callgrind                      # 输出 callgrind 格式

# 远程 pprof (生产环境)
import _ "net/http/pprof"              # 启用 :6060/debug/pprof
curl http://localhost:6060/debug/pprof/heap > heap.prof
go tool pprof heap.prof
```

### 格式化 & 静态检查
```bash
gofmt -w .                             # 格式化
go vet ./...                           # 静态检查
goimports -w .                         # 自动 import
golangci-lint run                      # 集成 lint
staticcheck ./...                      # 高级静态分析
```

### 运行时调试
```bash
GODEBUG=gctrace=1 ./app                # GC 日志
GODEBUG=schedtrace=1000 ./app          # 调度统计（每秒）
GODEBUG=scheddetail=1 ./app            # 详细调度
GODEBUG=asyncpreemptoff=1 ./app        # 关闭异步抢占
GODEBUG=opencodedefer=1 ./app          # 强制 open-coded defer
GOMAXPROCS=8 ./app                     # 限制 P 数量
GOGC=200 ./app                         # GC 触发比例（200%）
GOMEMLIMIT=8GiB ./app                  # 软内存上限（1.22+）
```

### 模块管理
```bash
go mod init                            # 初始化
go mod tidy                            # 整理依赖
go mod download                        # 下载依赖
go get -u pkg                          # 更新依赖
go mod vendor                          # 复制依赖到 vendor/
go list -m all                          # 列出所有依赖
```

---

## 📊 GMP 模型对比表

| 模型 | G 数 | M 数 | P 数 | 优势 | 劣势 |
|------|------|------|------|------|------|
| 1:1 (线程=协程) | 1 | 1 | 1 | 简单 | 创建 1MB 栈贵，1k 协程 = 1GB |
| M:N (协程) | N | M | 0 | 轻量 | 调度复杂，runtime 大 |
| **GMP (Go)** | N | M | =CPU | 多核 + 轻量 + 调度快 | 学习曲线 |
| 协程 async/await (Rust/JS) | N | =CPU | 隐式 | 无锁 | 单线程模型 |

---

## ⚠️ 必避 6 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **goroutine 泄漏** | goroutine 数持续增长 | 用 ctx.Done() 退出, pprof goroutine 找 stuck |
| **defer 在循环** | 累积到函数结束 (1.13 之前) | 提取函数 / 1.14+ open-coded 优化 |
| **slice 共享底层数组** | append 意外覆盖 | 显式 copy() / 用 full slice expr [l:r:c] |
| **interface{} 装箱** | int/string 装箱到堆 | 避免频繁 interface{} / 用泛型 |
| **Map 并发读写** | fatal: concurrent map read and map write | 用 sync.Map / 加锁 |
| **channel 死锁** | all goroutines are asleep | 调 chan 时检查 send/recv 对称 |

### 4 个隐藏坑

- **GOMAXPROCS = CPU×2**：增加调度抖动，应等于 NumCPU
- **time.After 内存泄漏**：在循环内调 time.After，每次创建 Timer 不 GC
- **defer 内 recover 仅捕获当前 goroutine**：跨 goroutine 不生效
- **sync.Mutex 不可重入**：嵌套加锁死锁，用 golang.org/x/sync/semaphore

---

## 🔄 Go vs 其他语言并发模型

| 维度 | Go goroutine | Java Thread | Rust tokio | Node.js event loop |
|------|-------------|-------------|------------|---------------------|
| 栈 | 2KB 起始，动态增长 | 1MB 固定 | 无栈 (state machine) | 无栈 |
| 创建 | 1μs | 10μs | 1μs | 0 (event) |
| 切换 | 50-100ns | 1-10μs | 0 (work stealing) | 0 |
| 1k 并发 | 2MB | 1GB | 几百 KB | 几 MB |
| 调度 | 抢占（1.14+） | OS 抢占 | 协作 | 单线程 |
| 多核 | ✅ | ✅ | ✅ | ❌（worker_threads）|
| 同步原语 | channel | synchronized/BlockingQueue | channel (mpsc) | Promise/async |

---

## 🧩 可复用模式

| 模式 | Go 怎么实现 | 我能用到哪 |
|------|------------|----------|
| **GMP + work stealing** | M 抢 P 的 LRQ 一半 | 任何多核任务调度 (Node.js worker pool) |
| **channel 同步交接** | sudog memcpy + goready | 任何 1:1 任务交接 (actor 模型) |
| **混合写屏障 GC** | 插入 + 删除屏障组合 | 任何需要低延迟 GC 的系统 |
| **逃逸分析** | 编译时 data flow | 任何 RAII 语言（C++/Rust）都该学 |
| **ctx.Done() 链式取消** | context.WithCancel/Timeout | 任何需要超时/取消的系统（HTTP/gRPC）|
| **errgroup 并发** | 第一个 err cancel 所有 | 任何 fan-out + 错误传播 |
| **sync.Pool 复用** | Get/Put 池 | 任何频繁分配/GC 压力场景 |

→ 模式 A-G 详细见 `deep-dive.md 专题 8/14`

---

## 📋 反思：Go 让我重新思考的 5 件事

1. **少即是好**。新特性是负债，克制是财富（25 关键字 vs Rust 60+）。
2. **GC 不一定要手动管理**。1.22+ 的 GC 在延迟 + 吞吐已经够用。
3. **goroutine = 廉价并发**。1 协程 2KB 栈，可以起百万个。
4. **可读性 > 巧妙性**。Rob Pike 反对任何"聪明"代码。
5. **gofmt 解决风格之争**。没 lint 战，没 code review 扯皮。

---

## ✅ 我能马上用的 3 件事

- [ ] 用 pprof 分析自己项目 goroutine 泄漏
- [ ] 开启 `-gcflags='-m'` 看逃逸报告，改掉能改的
- [ ] 用 errgroup + context 替换 wg.Wait()

---

## 🔗 跨项目引用

- `[[../01-etcd/README|etcd]]` — Go 实现，raft + bbolt + wal
- `[[../03-kubernetes/README|k8s]]` — Go 实现，client-go + informer + workqueue
- `[[../04-postgres/README|postgres]]` — C 实现，但接口类似（lib/pq/pgx）
- `[[../08-prometheus/README|prom]]` — Go 实现，scrape + TSDB
- `[[../10-vault/README|vault]]` — Go 实现，atomic.Bool 大量使用

---

## 📚 进一步阅读

- 源码: https://github.com/golang/go
- 文档: https://go.dev/doc/
- 调度: https://go.dev/s/ismmkeynote
- GC: https://go.dev/blog/ismmkeynote
- 内存模型: https://go.dev/ref/mem
- 实战书: 《Go 语言圣经》《Go 语言高级编程》《Concurrency in Go》
- 规范: https://google.github.io/styleguide/go/
- `deep-dive.md` — 16 专题深度解析
- `code-snippets/` — 5 段必读代码 (140-280 行/段, 完整函数 + 5 WHY + 性能数据)
