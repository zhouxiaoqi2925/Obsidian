# ag · the_silver_searcher 架构与模式解析

> ag 是一个 12k+ Star 的 C 代码搜索工具，哲学是"用 OS 内核能力 + 经典算法 + 预编译 + 二分查"四件套把搜索推到极致。本文用 ABL 视角拆解其并发模型、字符串算法、内存 I/O 与平台兼容四大领域，覆盖 8 核封顶、PCRE JIT 复用、5 桶分桶、mmap+madvise、pledge 系统调用白名单等 20 个可复用模式。

## 1. 并发与线程模型

### 模式 1：8 核封顶 + literal 减 1 核的"反摩尔"决策

**问题场景**：CPU 核数越来越多，新人往往认为"线程 = 核数 = 最优"。但在 literal 字符串搜索这种 memory-bound 场景，CPU 越多 cache miss 越严重，**8 核以上反而退化**。

**解决方案代码**：
```c
// src/main.c:84-93
int workers_len = num_cores < 8 ? num_cores : 8;
if (opts.literal) {
    workers_len--;   // literal 搜索是 memory-bound，留一核给主线程打印
}
```

**关键参数表**：
| 模式 | 决策 | 阈值 | 实测理由 |
|:---|:---|:---|:---|
| 默认线程数 | `min(num_cores, 8)` | 8 核封顶 | cache miss 拐点 |
| literal 模式 | `workers_len--` | 减 1 核 | 主线程独占一核做 print |
| regex 模式 | `num_cores` 全部 | 不减 | CPU-bound 可用满 |
| 用户覆盖 | `--workers N` | 强制 | 给高级用户微调空间 |

**最佳实践**：
- **不要把线程数 = CPU 核数**当默认——内存带宽型任务要封顶
- literal 模式让主线程专做 `print_*`，避免 worker 抢 stdout 锁
- 用 `num_cores` 之前必须 `#ifdef HAVE_SYSCONF` 优雅降级
- 用户 CLI 加 `--workers` 显式覆盖，但默认必须保守
- 决策依据写进 commit message 或博客，不要只放 PR 描述

---

### 模式 2：Producer-Consumer + pthread cond 唤醒

**问题场景**：主线程枚举目录（I/O 密集）+ worker 线程搜索（CPU 密集）天然解耦，但简单轮询 `work_queue` 浪费 CPU，盲等待也浪费 IO 带宽。

**解决方案代码**：
```c
// src/main.c:200-203 —— 主线程"投递完"信号
pthread_mutex_lock(&work_queue_mtx);
done_adding_files = TRUE;
pthread_cond_broadcast(&files_ready);  // 唤醒所有等待的 worker

// src/worker.c 中 worker 等待
pthread_mutex_lock(&work_queue_mtx);
while (work_queue == NULL && !done_adding_files) {
    pthread_cond_wait(&files_ready, &work_queue_mtx);
}
```

**关键参数表**：
| 元素 | 选择 | 替代方案 | 取舍 |
|:---|:---|:---|:---|
| 队列结构 | 链表 | ring buffer | 链表实现简单，吞吐足够 |
| 同步原语 | `pthread_mutex` + `pthread_cond` | 信号量 | 锁+cond 更易表达"广播" |
| 唤醒策略 | `broadcast` 一次性唤醒所有 | `signal` 唤醒一个 | 全部 worker 抢活，避免饥饿 |
| 退出信号 | `done_adding_files` flag | poison pill | flag 更易诊断，poison pill 内存敏感 |

**最佳实践**：
- 教科书级 Producer-Consumer：mutex 保护队列，cond 阻塞等待
- 用 `broadcast` 而非 `signal` 一次性唤醒全部 worker，避免"先醒的抢光活"
- 主线程在 `pthread_join` 前**必须**先 `cond_broadcast` —— 否则死锁
- 加 `done_adding_files` flag 区分"队列空"与"队列无新活"
- wait 循环条件用 `while` 而非 `if`——防伪唤醒

---

### 模式 3：CPU 亲和绑核与优雅降级

**问题场景**：worker 线程被 OS 调度到不同核上时，cache line 在核间跳动的"乒乓成本"可达 20%。HPC 项目的标准做法是 `pthread_setaffinity_np`，但这在 macOS/Solaris 上不存在。

**解决方案代码**：
```c
// src/main.c:155-176
#if defined(HAVE_PTHREAD_SETAFFINITY_NP) && (defined(USE_CPU_SET) || defined(HAVE_SYS_CPUSET_H))
    if (opts.use_thread_affinity) {
        CPU_ZERO(&cpu_set);
        CPU_SET(i % num_cores, &cpu_set);
        pthread_setaffinity_np(workers[i].thread, sizeof(cpu_set), &cpu_set);
    }
#endif
```

**关键参数表**：
| 平台 | CPU 亲和 API | 头文件 | ag 兼容方式 |
|:---|:---|:---|:---|
| Linux | `pthread_setaffinity_np` | `<sched.h>` | `CPU_ZERO` + `CPU_SET` |
| macOS | `thread_policy_set` | `<mach/thread_policy.h>` | 不支持，log "No CPU affinity support" |
| FreeBSD | `cpuset_setaffinity` | `<sys/cpuset.h>` | `CPU_SET`（不同 cpuset 类型） |
| Windows | `SetThreadAffinityMask` | `<windows.h>` | 编译时 `#ifdef _WIN32` |
| OpenBSD | 无 | — | 自动跳过，log 后继续 |

**最佳实践**：
- 核心库调用都用 `#ifdef HAVE_*` 检测，**无**则 log 而**不**崩
- 绑核按 `i % num_cores` 轮转，避免"前 N 个核跑满、后 N 个空转"
- macOS 的 `thread_policy_set` 用法完全不同，**别硬抄**——直接放弃
- 用户加 `--no-affinity` 关闭亲和，给容器/CI 环境逃生口
- 写 commit 时记录"加了哪些平台的优雅降级测试"

---

### 模式 4：worker pool 跨平台条件编译

**问题场景**：Linux 写好的 pthread 代码在 Windows 跑不起来。ag 的策略是**统一用 pthread** + MinGW/MSYS2 移植，避免 fork 一份 Windows 专用实现。

**解决方案代码**：
```c
// src/worker.h
typedef struct {
    pthread_t thread;
    int id;
    int core;            // CPU 亲和核
} worker_t;

extern worker_t *workers;
extern int workers_len;

// src/worker.c —— 唯一一处跨平台条件编译
#ifdef _WIN32
    #include <pthread.h>  // MinGW 提供
#endif
```

**关键参数表**：
| 平台 | pthread 来源 | 编译器 | 备注 |
|:---|:---|:---|:---|
| Linux | glibc | gcc/clang | 原始支持 |
| macOS | 系统 pthread | clang | 苹果有内部线程池 |
| FreeBSD | libthr | clang | 与 POSIX 兼容 |
| Windows | MinGW pthread | mingw-w64 | `winpthreads` 库 |
| MSYS2 | MSYS2 pthread | gcc | 通过 pacman 安装 |

**最佳实践**：
- 用 **pthread** 而非 native API（`CreateThread`）——一份代码 5 平台
- Windows 走 MinGW/MSYS2 而非 MSVC——避免 ABI 差异
- 关键的 `pthread_t` 包装成 `worker_t` struct，**禁止**裸用 pthread 类型散落代码
- 跨平台代码 100% 走 `m4/ax_pthread.m4` autoconf 宏检测，**禁止** `__linux__` hardcode
- CI 矩阵必须覆盖 4+ 平台，否则 `#ifdef` 不可信

---

### 模式 5：SIGINT 优雅退出 + pthread_join 收尸

**问题场景**：用户按 Ctrl-C，主线程如果直接 `exit()`，worker 正在 `pcre_exec` 中间会留下脏数据、临时文件、未释放的 mmap。

**解决方案代码**：
```c
// src/main.c 信号处理
static volatile sig_atomic_t interrupted = 0;
static void sigint_handler(int sig) { interrupted = 1; }

int main(int argc, char **argv) {
    signal(SIGINT, sigint_handler);
    // ...
    for (i = 0; i < workers_len; i++) {
        pthread_join(workers[i].thread, NULL);  // 阻塞等待
    }
    cleanup_options(&opts);
    return !opts.match_found;
}
```

**关键参数表**：
| 退出路径 | 行为 | 资源释放 |
|:---|:---|:---|
| 正常完成 | 全部 worker join + 释放 mmap | `cleanup_options` |
| SIGINT | worker 轮询 `interrupted` flag 后退出 | join 仍会回收 |
| OOM | `die()` → `abort()`，**不**释放 | 进程退出，OS 收尸 |
| PCRE 错误 | `die()` 打错误信息 | 进程退出 |

**最佳实践**：
- 用 `volatile sig_atomic_t` 而非 `int` —— 信号 handler 安全
- worker 内部**必须**轮询 `interrupted` flag，否则 Ctrl-C 不响应
- 退出码语义化：`0` = 找到匹配，`1` = 没找到，`2` = 错误（与 grep 一致）
- 任何 `die()` 路径都用 `abort()`，让 coredump 留证据
- `cleanup_options` 必须幂等——多次调用不能 double free

---

## 2. 字符串与模式匹配

### 模式 6：literal 模式三档算法分派

**问题场景**：literal 字符串搜索不是"一个算法通吃"——超短串、超长串、中等长度串各对应不同最优算法。ag 把"按 query 长度分派"做到极致。

**解决方案代码**：
```c
// src/search.c:60-74
#if defined(__i386__) || defined(__x86_64__)
    if ((size_t)opts.query_len < 2 * sizeof(uint16_t) - 1
        || opts.query_len >= UCHAR_MAX) {
        // < 3 字节 或 >= 255 字节 → boyer_moore
        match_ptr = boyer_moore_strnstr(...);
    } else {
        // 3~254 字节 且 x86/x64 → hash_strnstr
        match_ptr = hash_strnstr(...);
    }
#else
    // 非 x86 → 全部走 boyer_moore
    match_ptr = boyer_moore_strnstr(...);
#endif
```

**关键参数表**：
| query 长度 | x86/x64 路径 | 非 x86 路径 | 算法 |
|:---|:---|:---|:---|
| < 3 字节 | boyer_moore | boyer_moore | 短串跳表退化 → BM |
| 3~254 字节 | hash_strnstr | boyer_moore | 64KB hash + Rabin-Karp |
| ≥ 255 字节 | boyer_moore | boyer_moore | 超过 uint8_t 容量上限 |
| 任意长度 | 都不适配 | 都不适配 | — |

**最佳实践**：
- 分派决策**全部**以 `query_len` 为键，避免运行时检测
- `2*sizeof(uint16_t)-1 = 3` 字节是经验值，hash 表的 65536 槽中 1 槽命中
- `UCHAR_MAX=255` 是 `uint8_t` 容量上限，超过要换更大类型
- x86 路径依赖非对齐访问（memcpy+cast），ARM/MIPS 上可能 SIGBUS
- 算法选择写入 `__builtin_expect` 分支预测，hot path 直通

---

### 模式 7：Boyer-Moore 跳表的两张表

**问题场景**：经典 BM 算法只用一张"坏字符表"，遇到局部大量重复字符（如空格、换行）退化为 O(N×M)。ag 用 **alpha-skip + find-skip 双表**处理这种场景。

**解决方案代码**：
```c
// src/util.c:69-86
void generate_skip_table(const char *find, size_t f_len, 
                         size_t *alpha_skip, size_t *find_skip) {
    size_t i;
    for (i = 0; i < UCHAR_MAX; i++) {
        alpha_skip[i] = f_len;  // 默认：找不到则跳过整个模式
    }
    for (i = 0; i < f_len - 1; i++) {
        alpha_skip[(unsigned char)find[i]] = f_len - i - 1;
        find_skip[i] = f_len;   // find-skip 表
    }
    // 后缀规则
    for (i = f_len - 1; i > 0; i--) {
        if (strncmp(find, find + i, f_len - i) == 0) {
            for (size_t j = 0; j < f_len - i; j++) {
                find_skip[j] = f_len - i;
            }
            break;
        }
    }
}
```

**关键参数表**：
| 表 | 维度 | 含义 | 默认值 |
|:---|:---|:---|:---|
| `alpha_skip` | `UCHAR_MAX=256` | 坏字符位移 | `f_len`（模式长度） |
| `find_skip` | `f_len` | 好后缀位移 | `f_len` |
| 二者关系 | — | 取较小值作为最终跳数 | — |

**最佳实践**：
- alpha-skip 表用 `UCHAR_MAX` 而非 `UCHAR_MAX+1`——留 1 字节给 EOF
- 预计算 1 次，跨 N 个文件复用——`search_buf` 入口只查表
- 跳数取两张表**最小值**——防 BM 退化到 O(N×M)
- 大小写不敏感时**预生成** 65536 个组合（见模式 8）
- 跳表用 `size_t` 而非 `int`——支持 > 2GB 文件

---

### 模式 8：hash_strnstr 的 64KB hash 表

**问题场景**：BM 在"短串+大文本"场景下常数因子不小。Rabin-Karp 的"hash 滚动"更适合"模式长度 3~254、x86 平台"的中等场景。

**解决方案代码**：
```c
// src/util.c:160-184 —— 大小写折叠预计算
void generate_hash(const char *find, size_t f_len, 
                   uint8_t *h_table, int case_sensitive) {
    for (i = f_len - sizeof(uint16_t); i >= 0; i--) {
        for (caps_set = 0; caps_set < (1 << sizeof(uint16_t)); caps_set++) {
            word_t word;
            memcpy(&word.as_chars, find + i, sizeof(uint16_t));
            int cap_index;
            for (cap_index = 0; caps_set >> cap_index; cap_index++) {
                if ((caps_set >> cap_index) & 1)
                    word.as_chars[cap_index] -= 'a' - 'A';
            }
            // 把 word 的每种大小写组合登记到 h_table
        }
    }
}
```

**关键参数表**：
| 元素 | 大小 | 含义 |
|:---|:---|:---|
| `h_table` | 64KB | 256×256 = 65536 种 2 字节组合 |
| `sizeof(uint16_t)` | 2 字节 | 单次哈希的窗口大小 |
| 大小写组合 | 2^16 = 65536 | 16 位掩码遍历所有大小写 |
| 生成 vs 查表 | 生成 O(2^16) | 查表 O(1) |

**最佳实践**：
- 64KB 表**预生成**在 query compile 阶段，**不**进搜索热路径
- 大小写折叠生成时一次到位，搜索时 0 开销
- 限定 x86/x64 是因为 memcpy+cast 依赖非对齐访问
- `caps_set` 用 16 位掩码遍历——比递归/动态规划简单
- 表格大小与 `sizeof(uint16_t)` 强耦合——改 4 字节就翻 4GB

---

### 模式 9：PCRE JIT + pcre_study 跨文件复用

**问题场景**：同一 regex 跨 N 个文件匹配时，PCRE 内部状态机构建占 90%+ 时间。`pcre_study()` 预编译 + JIT 一次性付出，N 次匹配摊销。

**解决方案代码**：
```c
// src/main.c:66-72, 143
#ifdef USE_PCRE_JIT
int has_jit = 0;
pcre_config(PCRE_CONFIG_JIT, &has_jit);
if (has_jit) {
    study_opts |= PCRE_STUDY_JIT_COMPILE;
}
#endif
compile_study(&opts.re, &opts.re_extra, opts.query, pcre_opts, study_opts);

// src/search.c —— 跨文件复用
pcre_exec(opts.re, opts.re_extra, buf, buf_len, 0, 0, ovector, OVECCOUNT);
```

**关键参数表**：
| 阶段 | 动作 | 时间成本 | 复用 |
|:---|:---|:---|:---|
| `pcre_compile` | query → NFA/DFA | 数十 ms | 1 次 |
| `pcre_study` | 提取锚点 + JIT 编译 | 数十 ms | 1 次 |
| `pcre_exec` | 输入匹配 | μs/次 | N 次 |
| 跨文件 | 同一 `re_extra` 复用 | 0 | N × 文件数 |

**最佳实践**：
- `pcre_study` 必须配 `PCRE_STUDY_JIT_COMPILE`——JIT 比纯 study 快 5-10x
- `pcre_exec` 的 `ovector` 是栈分配，不要 `malloc`
- `re_extra` 用 `pcre_free_study` 释放——`free(opts.re_extra)` 内存泄漏
- PCRE 10+ 才稳定支持 JIT，PCRE 8 有 bug——autoconf 检测
- regex 模式不适用 mmap 大文件策略——pcre_exec 仍需 mmap 后再传

---

### 模式 10：5 桶 ignore 模式分桶

**问题场景**：`.gitignore` 实际行数 80% 是 `*.xxx` 后缀，5% 是 `!xxx` 反向，5% 是字面名，剩下 10% 是 fnmatch。直接走 btree 或 hash 是杀鸡用牛刀。

**解决方案代码**：
```c
// src/ignore.c:122-152
if (is_fnmatch(pattern)) {
    if (pattern[0] == '*' && pattern[1] == '.' && strchr(pattern + 2, '.')
        && !is_fnmatch(pattern + 2)) {
        patterns_p = &(ig->extensions);     // 桶 1: *.xxx 后缀
    } else if (pattern[0] == '/') {
        patterns_p = &(ig->slash_regexes);  // 桶 2: / 开头 fnmatch
    } else if (pattern[0] == '!') {
        patterns_p = &(ig->invert_regexes); // 桶 3: ! 反向
    } else {
        patterns_p = &(ig->regexes);        // 桶 4: 普通 fnmatch
    }
} else {
    if (pattern[0] == '/') {
        patterns_p = &(ig->slash_names);    // 桶 5a: / 开头字面
    } else {
        patterns_p = &(ig->names);          // 桶 5b: 普通字面
    }
}
```

**关键参数表**：
| 桶 | 命中条件 | 匹配算法 | 复杂度 |
|:---|:---|:---|:---|
| `extensions` | `*.xxx` 单层 | strcmp 后缀 | O(1) |
| `slash_regexes` | `/xxx` fnmatch | fnmatch 根路径 | O(N) |
| `invert_regexes` | `!xxx` | 反向规则 | O(N) |
| `regexes` | 其他 fnmatch | fnmatch 全路径 | O(N) |
| `slash_names` | `/xxx` 字面 | binary_search | O(log N) |
| `names` | 普通字面 | binary_search | O(log N) |

**最佳实践**：
- **特化** 高频桶（`*.xxx` = 80%）直接 O(1)，跳过 binary search
- 桶选择**不**用 hash 决定——`strchr(pattern + 2, '.')` 一行就够
- binary_search 前确保数组**有序**——`add_ignore_pattern` 用插入排序
- 5 桶不是过度设计——每个桶都是"语法糖层"独立优化
- 用户加 `.ignore`（自定义）走同一套桶，**不**重写分发逻辑

---

## 3. 内存与 I/O

### 模式 11：mmap + madvise SEQUENTIAL 顺序读

**问题场景**：`read()` 系统调用要 2 次拷贝（内核→用户、内核态→用户态），对 1GB 大文件不友好。`mmap` 一次映射，page fault 按需加载，**用户态零拷贝**。

**解决方案代码**：
```c
// src/search.c:365
#if HAVE_MADVISE
    madvise(buf, f_len, MADV_SEQUENTIAL);
#endif
```

**关键参数表**：
| 系统调用 | 平台 | 行为 | 优势 |
|:---|:---|:---|:---|
| `mmap` | Linux/macOS/BSD | 文件→虚拟地址映射 | 零拷贝 |
| `madvise(MADV_SEQUENTIAL)` | Linux | 提示顺序读 | 激进预读 |
| `madvise(MADV_WILLNEED)` | Linux | 提示会用到 | 触发预读 |
| `madvise(MADV_DONTNEED)` | Linux | 提示不再用 | 立即释放 page cache |
| `MapViewOfFile` | Windows | 等价 mmap | 跨平台统一接口 |

**最佳实践**：
- `madvise(SEQUENTIAL)` **必须**有 `#ifdef HAVE_MADVISE`——macOS 早期没有
- mmap 失败 fall back 到 `malloc + read()`，**不**让程序崩
- `mprotect` 加 PROT_NONE 可省内存——`ag --debug` 时用
- mmap 大小用 `f_len` 而非 `f_size`——后者受限于 `off_t`
- mmap 后**不**能 `write()`——只读场景，警告并退出

---

### 模式 12：插入排序 + binary search 的"懒得上 btree"决策

**问题场景**：标准答案应该用 btree 或 hash 来索引 ignore patterns。但 btree 引入 ~500 行代码，hash 引入 hash 冲突处理——对**几十~几百个 pattern** 的真实场景是杀鸡用牛刀。

**解决方案代码**：
```c
// src/ignore.c:155-167 —— 插入排序保持有序
void add_ignore_pattern(ignores *ig, const char *pattern) {
    int i;
    for (i = ig->names_len; i > 0 && strcmp(ig->names[i-1], pattern) > 0; i--) {
        ig->names[i] = ig->names[i-1];   // 大元素后移
    }
    ig->names[i] = pattern;              // 插入
    ig->names_len++;
}

// binary_search 路由
static int binary_search(const char *needle, const char **haystack, 
                         int start, int end) {
    while (start < end) {
        int mid = (start + end) / 2;
        int cmp = strcmp(needle, haystack[mid]);
        if (cmp == 0) return mid;
        if (cmp < 0) end = mid;
        else start = mid + 1;
    }
    return -1;
}
```

**关键参数表**：
| N (pattern 数) | 插入排序 | btree | hash |
|:---|:---|:---|:---|
| < 100 | O(N²) 仍 < 1ms | O(log N) 但常数大 | O(1) 但冲突处理复杂 |
| 100~1000 | 5-10ms | O(log N) ≈ 1ms | 接近 |
| > 1000 | 100ms+ 退化 | 仍 O(log N) | 接近 |
| 真实场景 | .gitignore 几十~几百行 | — | — |

**最佳实践**：
- **根据数据规模选算法**——N=100 不用 btree 是常识
- 插入排序在**已部分有序**时是 O(N)，不要无脑喷
- binary search 必须先 `sort`——ag 启动时一次性排好
- "我是懒得上 btree"——这种诚实注释比假大空的设计描述更有价值
- 性能瓶颈在 `path_ignore_search`（10-15% CPU）——优化先做桶特化，再考虑 btree

---

### 模式 13：自实现 scandir 与 d_reclen 内存池

**问题场景**：`scandir(3)` 跨平台不一致（glibc 有，macOS 有但签名不同），`readdir_r` 已 deprecated。ag 自实现 `ag_scandir`，且处理 `struct dirent` 的变长 filename。

**解决方案代码**：
```c
// src/scandir.c:7-77
int ag_scandir(const char *dirname, struct dirent ***namelist, 
               filter_fp filter, void *baton) {
    int names_len = 32;        // 初始 32 槽
    int results_len = 0;
    names = malloc(sizeof(struct dirent *) * names_len);
    while ((entry = readdir(dirp)) != NULL) {
        if ((*filter)(dirname, entry, baton) == FALSE) continue;
        if (results_len >= names_len) {
            names_len *= 2;    // 满则倍增
            names = realloc(names, sizeof(struct dirent *) * names_len);
        }
        d = malloc(entry->d_reclen);  // 按 dirent 实际大小分配
        memcpy(d, entry, entry->d_reclen);  // 完整复制
        names[results_len] = d;
    }
}
```

**关键参数表**：
| 元素 | 大小 | 含义 |
|:---|:---|:---|
| 初始槽位 | 32 | 99% 目录 0-32 元素够用 |
| 倍增策略 | 32→64→128→256 | amortized O(1) realloc |
| `d_reclen` | 变长 | glibc `struct dirent` 末尾 filename 长度 |
| `memcpy(reclen)` | 完整复制 | 防长文件名截断 |

**最佳实践**：
- 32 起步是经验值——99% 目录少于 32 元素，避免 0 元素也 malloc 1MB
- 倍增策略用 `* 2` 而非 `+N`——amortized O(1) realloc
- `d_reclen` 是 glibc 的"小技巧"——`sizeof(struct dirent)` 会截断长文件名
- 自实现 scandir 跨平台一致——不用 `#ifdef` 处理 macOS/Linux 差异
- 释放时遍历 `free(d)` + `free(names)`，**不**用 `closedir` 自动释放

---

### 模式 14：TOCTOU 防护的两步 stat

**问题场景**：先 `stat` 看是不是 stdout 重定向目标，再 `open`，但 `open` 和 `fstat` 之间文件可能被换（TOCTOU = Time Of Check to Time Of Use）。攻击场景：恶意用户在搜索期间替换 `mypasswd` 软链接。

**解决方案代码**：
```c
// src/search.c:294-304
// repeating stat check with file handle to prevent TOCTOU issue
rv = fstat(fd, &statbuf);
if (rv == -1) {
    close(fd);
    return;
}
// ... 用 statbuf.st_ino 判重
```

**关键参数表**：
| 步骤 | 调用 | 检查什么 | TOCTOU 风险 |
|:---|:---|:---|:---|
| 1 | `stat(path, &stat1)` | inode/类型 | 是 |
| 2 | `open(path, O_RDONLY)` | 文件句柄 | — |
| 3 | `fstat(fd, &stat2)` | 句柄上的 inode | 缩小到 0 |

**最佳实践**：
- **永远**用 `fstat(fd)` 而非 `stat(path)` 做权限/类型检查
- 比较 `stat1.st_ino == stat2.st_ino` 检测 swap
- 用 `open(path, O_NOFOLLOW)` 拒绝软链接——彻底防 TOCTOU
- `O_RDONLY` + `fstat` 比 `read` + 自己解析 stat 简单
- CLI 工具的 TOCTOU 风险**远低于**服务器，但仍要防——养成习惯

---

### 模式 15：ag_malloc 包装与 OOM 死透

**问题场景**：C 项目 OOM 行为不一致——`malloc` 返回 NULL，但调用者经常忘记检查，触发段错误。ag 用 `ag_malloc` 包装，OOM 直接 `die()` 退出。

**解决方案代码**：
```c
// src/util.c
void *ag_malloc(size_t size) {
    void *ptr = malloc(size);
    if (ptr == NULL) {
        die("Unable to allocate memory: %s", strerror(errno));
        /* NOTREACHED */
    }
    return ptr;
}

void *ag_realloc(void *ptr, size_t size) {
    void *new_ptr = realloc(ptr, size);
    if (new_ptr == NULL) {
        die("Unable to reallocate memory: %s", strerror(errno));
    }
    return new_ptr;
}
```

**关键参数表**：
| 包装 | 输入 | 失败行为 | 退出码 |
|:---|:---|:---|:---|
| `ag_malloc` | size | `die()` + abort | 2（错误） |
| `ag_calloc` | count, size | 同上 | 2 |
| `ag_realloc` | ptr, size | 同上 | 2 |
| `ag_strdup` | str | 同上 | 2 |
| 普通 `malloc` | 任何 | 不允许出现 | 编译期 grep 检查 |

**最佳实践**：
- **所有** `malloc` 调用必须走 `ag_malloc`，裸 `malloc` 走 grep + 编译器告警
- `die()` 用 `abort()` 而非 `exit(2)`——保留 coredump
- `die()` 打印 `errno` + `__FILE__` + `__LINE__`——诊断信息
- 用 `xmalloc` 前缀（来自 GNU coreutils）也是合法选择
- OOM 时**不**尝试 partial cleanup——进程死了，OS 收尸

---

## 4. 平台兼容与生态

### 模式 16：pledge(2) 系统调用白名单

**问题场景**：代码漏洞可能让攻击者利用多余的系统调用（如 `execve`）。OpenBSD 的 `pledge(2)` 提供"按生命周期缩攻击面"——启动时 5 类，搜索后降到 2 类。

**解决方案代码**：
```c
// src/main.c:46-50, 179-183
#ifdef HAVE_PLEDGE
    if (pledge("stdio rpath proc exec", NULL) == -1) {
        die("pledge: %s", strerror(errno));
    }
#endif

// 进入搜索循环后再 pledge 一次
#ifdef HAVE_PLEDGE
    if (pledge("stdio rpath", NULL) == -1) {
        die("pledge (post-init): %s", strerror(errno));
    }
#endif
```

**关键参数表**：
| 阶段 | pledge 类别 | 允许 syscall | 拒绝 syscall |
|:---|:---|:---|:---|
| 启动期 | `stdio rpath proc exec` | read/write/open/execve | mount/ioctl/reboot |
| 搜索期 | `stdio rpath` | read/open | execve/proc |

**最佳实践**：
- 用 `#ifdef HAVE_PLEDGE`——只 OpenBSD 支持，**不**试图 macOS 等价物
- 启动期比搜索期多 `proc exec`——`pcre_study` 可能 fork 一些子进程
- 攻击面缩到 2-5 个 syscall 后，**任何**未声明的 syscall 调用都会 EPERM
- pledge 失败 `die()` 而非 `warn()`——降级会扩大攻击面
- 注释里写明每个类别的依据，**便于**审计

---

### 模式 17：autoconf + ax_pthread.m4 跨平台检测

**问题场景**：pthread 库在不同平台位置不同——Linux glibc 自带、FreeBSD 单独的 libthr、macOS 系统库。autoconf 提供 `AX_PTHREAD` 宏自动探测。

**解决方案代码**：
```m4
# m4/ax_pthread.m4 —— 第三方 m4 宏
AC_DEFUN([AX_PTHREAD], [
    AX_PTHREAD([$1],[],[AC_MSG_ERROR([pthread required])])
    LIBS="$PTHREAD_LIBS $LIBS"
    CFLAGS="$CFLAGS $PTHREAD_CFLAGS"
    CC="$PTHREAD_CC"
])

# configure.ac
AX_PTHREAD
AC_CHECK_LIB([pcre], [pcre_compile], [], [AC_MSG_ERROR([libpcre required])])
AC_CHECK_LIB([z], [inflateInit], [], [AC_MSG_WARN([zlib not found, no .gz support])])
```

**关键参数表**：
| 平台 | pthread 库 | 链接 flag | 编译 flag |
|:---|:---|:---|:---|
| Linux | glibc 内置 | `-lpthread` | 无 |
| macOS | 系统库 | 无 | 无 |
| FreeBSD | libthr | `-lpthread` | 无 |
| OpenBSD | libpthread | `-lpthread` | 无 |
| Solaris | libpthread | `-lpthread` | `-D_REENTRANT` |
| Windows | winpthreads (MinGW) | `-lpthread` | 无 |

**最佳实践**：
- 永远用 `AX_PTHREAD` 而非手写 `AC_CHECK_LIB(pthread, ...)`——后者漏 `-D_REENTRANT`
- autoconf 输出到 `config.h`，**禁止**用 `#ifdef __linux__` hardcode
- 可选库用 `AC_CHECK_LIB(..., ..., [], [AC_MSG_WARN])`——警告而非失败
- `m4/ax_pthread.m4` 来自 GNU Autoconf Archive——`build.sh` 自动 `autoreconf -i`
- 生成的 `configure` 脚本**提交到 git**——用户不需要 autoconf 也能编译

---

### 模式 18：PGO 引导脚本 pgo.sh

**问题场景**：PGO（Profile-Guided Optimization）需要"先 profile、再编译"两步，但开发者常常觉得麻烦。ag 提供 `pgo.sh` 一键搞定，10-20% 性能提升无脑拿。

**解决方案代码**：
```bash
#!/bin/bash
# pgo.sh
set -e

# Step 1: 用 -pg 编译，启用 profiling
make clean
CFLAGS="-pg" LDFLAGS="-pg" ./configure
make -j4

# Step 2: 用真实 workload 跑一遍，生成 gmon.out
./ag --noaffinity "TODO" /usr/include /usr/lib > /dev/null
./ag --noaffinity "the" /usr/include > /dev/null
./ag --noaffinity "(int)" /usr/include > /dev/null

# Step 3: 用 gmon.out 数据重新编译（去掉 -pg，加 -fprofile-use）
make clean
CFLAGS="-fprofile-use" LDFLAGS="-fprofile-use" ./configure
make -j4

echo "PGO build complete. Binary at ./ag"
```

**关键参数表**：
| 阶段 | 编译 flag | 运行时产物 | 性能 |
|:---|:---|:---|:---|
| 普通 | `-O2` | 无 | 1.0x（基线） |
| PGO 第一次 | `-pg` | `gmon.out` | 0.95x（profiling 开销） |
| PGO 第二次 | `-fprofile-use` | 无 | 1.10-1.20x（10-20% 提升） |

**最佳实践**：
- PGO 提交流程：`pgo.sh` 一次跑完 3 步，**不**留半成品给用户
- profile 工作量要"真实"——ag 跑 `ag TODO /usr/include` 而非 `ag foo .`
- PGO 第一次编出来的 binary 必须**带 -pg**——否则不生成 `gmon.out`
- 第二次编译用 `-fprofile-use` 而非 `-fprofile-generate`——读取而非生成
- 文档明确说"PGO 是可选的，release 走 PGO，dev 走普通"——避免每次编译都 2x 慢

---

### 模式 19：跨平台 #ifdef 优雅降级

**问题场景**：Linux 专属 API（`madvise`）、macOS 专属 API（`thread_policy_set`）、OpenBSD 专属 API（`pledge`）——多平台必须用 `#ifdef HAVE_*` 检测 + 优雅降级，**不能** hardcode 平台宏。

**解决方案代码**：
```c
// src/main.c
#ifdef HAVE_MADVISE
    madvise(buf, f_len, MADV_SEQUENTIAL);
#endif

#ifdef HAVE_PLEDGE
    if (pledge("stdio rpath", NULL) == -1) die(...);
#endif

#if defined(HAVE_PTHREAD_SETAFFINITY_NP) && (defined(USE_CPU_SET) || defined(HAVE_SYS_CPUSET_H))
    pthread_setaffinity_np(workers[i].thread, sizeof(cpu_set), &cpu_set);
#else
    log_debug("No CPU affinity support.");
#endif
```

**关键参数表**：
| 平台宏 | 用途 | ag 用法 |
|:---|:---|:---|
| `HAVE_MADVISE` | 检测 madvise(2) | `#ifdef HAVE_MADVISE` |
| `HAVE_PLEDGE` | 检测 pledge(2) | `#ifdef HAVE_PLEDGE` |
| `HAVE_PTHREAD_SETAFFINITY_NP` | 检测 CPU 亲和 | `#if defined(...)` |
| `__linux__` | Linux 平台 | **禁止**使用（autoconf 已提供） |
| `_WIN32` | Windows 平台 | 唯一允许的 hardcode |
| `__APPLE__` | macOS 平台 | **禁止**使用 |

**最佳实践**：
- **永远**用 `HAVE_*` autoconf 检测，**绝不**用 `__linux__` / `__APPLE__` 平台宏
- 优雅降级时**打印日志**而非静默——"No CPU affinity support" 提示用户
- 关键代码路径用 `#if defined(HAVE_A) && defined(HAVE_B)` 多条件
- 平台专属代码放 `.c` 末尾的 `#ifdef _WIN32` 块——主代码清晰
- 提交 PR 时**必须**说明"我加了哪些平台的构建验证"

---

### 模式 20：自实现 scandir 跨平台统一接口

**问题场景**：`scandir(3)` 在 glibc 和 macOS 上签名不同（`select` 回调不同），`readdir_r` 已被 POSIX 标记 deprecated。ag 用自实现 `ag_scandir` 抹平差异。

**解决方案代码**：
```c
// src/scandir.h
typedef int (*filter_fp)(const char *dirname, const struct dirent *entry, void *baton);

int ag_scandir(const char *dirname, struct dirent ***namelist,
               filter_fp filter, void *baton);
```

**关键参数表**：
| 函数 | 平台 | 签名 | 线程安全 |
|:---|:---|:---|:---|
| `scandir(3)` glibc | Linux | `int (*filter)(const struct dirent *)` | 否（readdir 不安全） |
| `scandir(3)` macOS | macOS | 同上 | 否 |
| `readdir_r` | 所有 | `int readdir_r(DIR *, struct dirent *, struct dirent **)` | 已被弃用 |
| `ag_scandir` | ag 内部 | `int (*filter)(const char *, const struct dirent *, void *)` | 内部用 mutex |

**最佳实践**：
- 自实现 scandir 是**降低认知成本**——一个签名 5 平台
- `baton` 参数让 filter 访问上下文，避免全局变量
- 跨线程调用 scandir 时加 mutex——`readdir(3)` 不是线程安全
- 内存分配失败 fall back 到部分结果 + 警告，**不**静默截断
- 文档化"ag_scandir 与 scandir 的差异"——避免用户混淆

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库路径 | `github.com/ggreer/the_silver_searcher` |
| 协议 | Apache License 2.0 |
| 总文件 | 96（src 23 + tests 51 + doc 3 + m4 1 + 顶层 17） |
| 主语言 | C（gnu89） |
| 平台 | Linux / macOS / FreeBSD / OpenBSD / NetBSD / Windows (MinGW + MSYS2) |
| 依赖 | libpcre / pthread / zlib / liblzma / autoconf |
| 性能基线 | 比 ack 快 5-34×（作者实测） |
| PGO 提升 | 10-20% 额外 |
| 商用安全 | ✅（Apache 2.0 + BSD/BSD-2 依赖，无 GPL 传染） |
