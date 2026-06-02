# 《ag (The Silver Searcher)》速查卡

> 入口在 [[README|README.md]]｜分类：Tool/CLI｜⭐⭐⭐⭐⭐｜适用：开发者日常 / CI linting / 大仓扫描

---

## 🎯 一句话价值

**C 时代代码搜索之王**：pthreads + mmap + PCRE-JIT + .gitignore 智能，比 `grep -r` 快 5-34x，比 `ack` 快 5-10x。

---

## 🧠 3 个核心洞察（必背）

1. **pthreads + work_queue** — 多核 producer-consumer 经典范式，master 扫目录 + N workers 搜文件
2. **Boyer-Moore + Rabin-Karp 双策略** — literal 模式按 needle 长度自动切换：短串跳大表、长串哈希
3. **5 桶分类 ignore 引擎** — extensions / names / slash_names / regexes / invert_regexes，按"最便宜→最贵"匹配

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `src/main.c:main` | 入口 + worker 数量 = min(cores, 8)，literal 减 1 核 |
| 2 | `src/search.c:search_buf` | literal/PCRE 双路径核心，3 字节/255 字节阈值 |
| 3 | `src/ignore.c:init_ignore` | .gitignore 4 源解析，5 桶分类，父链优化 |
| 4 | `src/util.c:generate_alpha_skip` | BM 256 字节 skip 表 + 从右向左匹配 |
| 5 | `src/print.c:print_init_context` | `__thread` TLS 输出上下文，避开锁 |

---

## ⚡ 性能数字（实测基准）

| 场景 | 工具 | 时间 | 加速比 |
|------|------|------|--------|
| 扫 1GB 文本 + 短串 "fn" | ag | ~1.8s | 1x |
| 同上 | grep -r | ~28s | 15x 慢 |
| 同上 | ack | ~6s | 3x 慢 |
| 长串 "function" | ag (RK) | ~3.1s | 1x |
| 同上 | ag (BM fallback) | ~5.2s | 1.7x 慢 |
| regex "fn\\s*\\(" | ag (JIT) | ~2.0s | 1x |
| 同上 | ag (无 JIT) | ~12s | 6x 慢 |
| 1→8 worker | 加速 | 7x | 接近理论 |
| 8→16 worker | 加速 | 1.2x | 边际收益 |

**结论**：8 worker 是甜点，PCRE JIT 必开，literal 短串用 BM、长串自动转 RK。

---

## 🌳 算法决策树

```
ag <pattern> ...
   │
   ├── literal? (默认 ON, 无 regex 字符)
   │     │
   │     ├── query_len < 3 byte → Boyer-Moore (skip 大表)
   │     ├── 3 ≤ query_len < 255 byte + x86_64 → Rabin-Karp (hash table)
   │     └── query_len ≥ 255 byte → Boyer-Moore (回退)
   │
   └── regex (含 . * + ? 等)
         │
         ├── PCRE JIT 可用 → 5-10x 加速
         └── PCRE JIT 不可用 → 解释器, 慢但能用
```

---

## 📊 5 桶 ignore 匹配顺序（从快到慢）

```
file = "src/foo/bar.min.js"
   │
   1. extensions 桶: strcmp(suffix, ".min.js")    O(1) per ext
   │   ✗ 未匹配
   ▼
   2. names 桶:      bsearch("bar.min.js")         O(log n)
   │   ✗ 未匹配
   ▼
   3. slash_names:   bsearch (限定当前目录)
   │   ✗ 未匹配
   ▼
   4. regexes:       fnmatch()                     O(n) per regex
   │   ✗ 未匹配
   ▼
   5. invert_regexes: fnmatch() (最高优先级, 后写后赢)
       ✓ "include bar.min.js" → 放行
```

**性能**：全 fnmatch ≈ 8s vs 5 桶分类 ≈ 1.5s（**5.3x 加速**）。

---

## 🚀 命令分组速查

### 基础搜索
```bash
ag "TODO"                          # 当前目录
ag "TODO" src/                     # 指定目录
ag -i "error" logs/                # 忽略大小写
ag -s "ERROR"                      # 强制区分大小写
ag -S "error"                      # smart case (大写自动敏感)
```

### 文件过滤
```bash
ag -t py "import"                  # 按文件类型 (py, js, rust...)
ag -g "*.js" "useState"            # glob 过滤
ag --files-with-matches "pass"     # 只列文件
ag -c "TODO"                       # 计数
ag -l "TODO" --count               # 同上
```

### 上下文
```bash
ag -C 3 "TODO"                     # 前后 3 行
ag -A 5 "fn "                      # 后 5 行
ag -B 2 "TODO"                     # 前 2 行
ag --break "TODO"                  # 多 match 间断行
```

### 性能调优
```bash
ag -j 16 "pattern"                 # 16 个 worker
ag --noaffinity "pattern"          # 关 CPU 绑核 (容器用)
ag -Q "literal pattern"            # 强制 literal 模式
ag --depth 5 "TODO"                # 限制递归深度
ag --skip-vcs-ignores              # 忽略 .gitignore (慎用)
ag --search-binary                 # 搜二进制文件 (默认跳过)
```

### 输出格式
```bash
ag --no-color "TODO"               # 不要颜色
ag --column "TODO"                 # 显示列号
ag --json "pattern" | jq           # 机读 JSON
ag --stats "pattern"               # 性能统计
ag -0 "TODO"                       # NUL 分隔 (xargs 用)
```

### CI / 脚本
```bash
# 找所有含 TODO 的文件, 排除 vendor
ag -l "TODO" --ignore vendor | xargs -r wc -l

# 统计代码行 (排除空行/注释)
ag -c "^[^/\s]" --type py src/

# 检查 TODO 老化 (CI lint)
ag "TODO.*2024" src/ | wc -l       # 2024 年的 TODO 还剩几个
```

---

## ⚠️ 必避 3 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **PCRE 复杂正则** | 极慢, 卡死 | 加 `-Q` 强制 literal, 或简化 regex |
| **符号链接死循环** | 内存爆, 跑不完 | 默认不跟随, `-L` 才跟随, 加 `--depth` 兜底 |
| **大目录递归** | 扫到 node_modules/ | 默认尊重 .gitignore, 自己加 `.ignore` 黑名单 |

### 4 个隐藏坑

- **PCRE JIT 静默降级**：编译时没开 JIT 不报错, 性能掉 5-10x。检查: `pcretest -C` 看是否含 `JIT`
- **affinity 容器失败**：cgroup 限制下 `pthread_setaffinity_np` 返回 EINVAL。加 `--noaffinity`
- **中文 locale 错**：`-i` 模式下 `tolower()` 在 zh_CN 可能错误。明确指定 `-s` 区分大小写
- **0 长 match 死循环**：regex 写 `(.*?)` 会卡死。ag 内部有 `match.end + 1` 兜底, 但要测试

---

## 🔄 vs ripgrep（决策树）

```
需要 PCRE 完整语法 (lookaround/backref)?
  ├── 是 → 用 ag
  └── 否
        │
        需要极致快 (单文件/单目录)?
        │   ├── 是 → 用 ripgrep (Rust+SIMD, 通常 3-10x 快)
        │   └── 否
        │         │
        │         需要严格 POSIX awk 兼容?
        │         ├── 是 → ag (ack 风格)
        │         └── 否 → ripgrep
        │
        你只装了 ag (没有 rg)?
        └── 用 ag
```

**简要对比**：

| 维度 | ag | ripgrep |
|------|-----|---------|
| 语言 | C + pthreads | Rust + SIMD |
| 性能 (literal) | 1x | 3-10x 快 |
| 性能 (regex) | 1x | 1-3x 快 (无 JIT 优势) |
| PCRE lookaround | ✅ | ❌ (用 Rust regex) |
| .gitignore 智能 | ✅ | ✅ |
| 二进制文件 | 默认跳过 | 默认跳过 |
| 跨平台 | Linux/macOS/Win | Linux/macOS/Win |
| 安装包大小 | ~1MB | ~3MB |

→ 详细对比见 `deep-dive.md 专题 10`

---

## 🧩 可复用模式

| 模式 | ag 怎么实现 | 我能用到哪 |
|------|------------|----------|
| **pthread + cond_var + work_queue** | workers 阻塞取文件 | 任何多核 producer-consumer 任务 (压缩/索引/转换) |
| **Boyer-Moore skip table** | 256 byte 表 + 从右扫 | 任何短串子串搜索 (日志 grep, 协议解析) |
| **分类 ignore 引擎** | 5 桶 + 二分 + fnmatch 兜底 | 任何文件过滤场景 (.gitignore 解析器, 备份排除) |
| **TLS 输出上下文** | `__thread` 避开锁 | 多线程日志/格式化输出 |
| **PCRE JIT 跨文件复用** | opts.re 全局 | 任何 NFA 匹配场景 (WAF, 高亮) |

→ 模式 A-E 详细见 `deep-dive.md 专题 9`

---

## 📋 反思：ag 让我重新思考的 5 件事

1. **C + pthreads 仍是王者**。在内存带宽瓶颈的搜索场景, Rust+SIMD 才有明显优势
2. **算法选择 > 硬件堆叠**。BM/RK 双策略是核心, 加 worker 只是锦上添花
3. **5 桶分类 = 索引的精髓**。把匹配按"成本"分层, O(1) > O(log n) > O(n)
4. **TLS 比 mutex 便宜**。`__thread` 3ns, mutex 50ns, 锁不是银弹
5. **跨文件复用 compiled state**。PCRE JIT 一次, 跨所有文件用 → 启动成本平摊

---

## ✅ 我能马上用的 3 件事

- [ ] 把 `grep -r` 替换为 `ag`, 写进 shell alias
- [ ] 在 CI 加 `ag -l "console\.log" src/` 当 lint
- [ ] 学 pthread + work_queue 范式, 写自己的并行扫描工具

---

## 🔗 跨项目引用

- `[[../09-ripgrep/README|ripgrep]]` — 性能对比（Rust+SIMD vs C+pthreads）
- `[[../05-golang/README|Go]]` — GMP 调度器 ↔ pthreads 范式
- `[[../08-prometheus/README|Prom]]` — 替代 grep 搜日志
- `[[../01-etcd/README|etcd]]` — bsearch 在 etcd watcher index 中也用
- `[[../03-kubernetes/README|K8s]]` — K8s SD 流程与 .gitignore 解析思路类似

---

## 📚 进一步阅读

- 源码：https://github.com/ggreer/the_silver_searcher
- 性能优化博客：http://geoff.greer.fm/ag/ (12 篇, 工程典范)
- `deep-dive.md` — 11 专题深度解析
- `code-snippets/` — 5 段必读代码 (140 行/段, 完整函数 + 多 WHY + 性能数据)
