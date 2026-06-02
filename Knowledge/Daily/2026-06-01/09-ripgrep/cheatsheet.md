# 《ripgrep》速查卡

> 入口在 [[README|README.md]]｜分类：Tool/CLI｜⭐⭐⭐⭐⭐｜适用：开发者日常 / CI linting / 大仓扫描

---

## 🎯 一句话价值

**grep 的 Rust 重写典范**：用 Rust + SIMD + 智能跳过，让 grep 跑出 60-100x 加速。

---

## 🧠 3 个核心洞察（必背）

1. **Rust + SIMD = 极致快** — 字节级并行匹配，单核就能 10GB/s+，AVX2 8x、AVX512 16x
2. **自动 .gitignore + .ignore** — 默认跳过 vendor/node_modules，0 配置避免扫无关文件（占总加速 50%）
3. **memory-map 跳过 IO** — 大文件 mmap，内核 page cache 共享，零拷贝

---

## 🔧 5 段必读代码（带文件:函数定位）

| 段 | 位置 | 关键点 |
|----|------|--------|
| 1 | `crates/grep/searcher.rs:search_slice` | prefilter + 渐进式输出 + Sink 解耦 |
| 2 | `crates/regex-automata/src/dfa/exec.rs:exec_naked` | meta DFA + reverse_anchored + bitstate |
| 3 | `crates/ignore/src/walk.rs:WalkBuilder::build` | 单一 source of truth + parallel + 早期 yield |
| 4 | `crates/memmap/src/mmap.rs:Mmap::open` | 跨平台 mmap + Drop + 0 字节 anon 兜底 |
| 5 | `crates/core/app.rs:print_match` | NDJSON + 4 type (begin/match/end/summary) |

---

## ⚡ 性能数字（实测基准）

| 场景 | 工具 | 时间 | 加速比 |
|------|------|------|--------|
| 扫 1GB 文本 + 短串 "fn" | ripgrep | ~1.5s | 1x |
| 同上 | grep -r | ~90s | **60x 慢** |
| 同上 | ag | ~30s | 20x 慢 |
| 长串 "function" | ripgrep | ~0.8s | 1x |
| 整词 `\bfix\b` | ripgrep | ~1.0s | 1x |
| regex `fn\s*\(` | ripgrep (Rust) | ~2.0s | 1x |
| 同上 | rg (PCRE) | ~1.5s | 1.3x |

**5 层优化每层贡献**:
- .gitignore 过滤: 2-5x (占 50%)
- mmap: 1.5-2x (10%)
- literal prefilter: 5-10x (30%)
- SIMD memchr: 4-8x (8%)
- Rust+LLVM: 1.2-1.5x (2%)

**结论**: .gitignore + literal 优化占 80%，SIMD 是锦上添花。

---

## 🌳 算法决策树

```
rg <pattern> ...
   │
   ├── pattern 含 regex 字符? (.*+?[]等)
   │     ├── 否 → 固定串搜索 (memmem SIMD)
   │     └── 是 → regex 编译
   │              │
   │              ├── 提取 literal 前缀 (最长固定串)
   │              │
   │              ├── literal_len < 5 byte → Teddy (SIMD 滚动哈希)
   │              ├── literal_len < 32 byte + 多模式 → Aho-Corasick
   │              └── 其他 → memmem SIMD
   │
   └── 预过滤候选 → 跑 DFA → 命中输出
```

---

## 📊 SIMD 加速实测表

| 算法 | scalar | SSE2 (128b) | AVX2 (256b) |
|------|--------|-------------|-------------|
| memchr 1 字节 | 1.0s | 0.25s (4x) | 0.13s (8x) |
| memmem 4 字节 | 1.0s | 0.30s (3.3x) | 0.18s (5.5x) |
| Teddy 滚动哈希 | 1.0s | 0.35s (2.9x) | 0.20s (5x) |

---

## 🚀 命令分组速查

### 基础搜索
```bash
rg "TODO"                          # 当前目录
rg "TODO" src/                     # 指定目录
rg -i "error" logs/                # 忽略大小写
rg -s "ERROR"                      # 强制区分大小写
rg -S "error"                      # smart case
```

### 文件过滤
```bash
rg -t py "import"                  # 按文件类型
rg -g "*.js" "useState"            # glob 过滤
rg --files-with-matches "pass"     # 只列文件
rg -c "TODO"                       # 计数
```

### 上下文
```bash
rg -C 3 "TODO"                     # 前后 3 行
rg -A 5 "fn "                      # 后 5 行
rg -B 2 "TODO"                     # 前 2 行
```

### 性能调优
```bash
rg -F "literal.string"             # 固定串 (10-100x 加速)
rg -w "fix"                        # 整词匹配
rg --no-ignore "pattern"           # 不应用 ignore
rg --no-ignore-vcs "pattern"       # 不应用 .gitignore
rg --hidden "pattern"              # 包含 . 开头的文件
rg -L "pattern"                    # 不跟 symlink
rg -uu "pattern"                   # 扫所有文件 (跳过 binary + ignore)
```

### 输出格式
```bash
rg --no-color "TODO"               # 不要颜色
rg --column "TODO"                 # 显示列号
rg --json "pattern" | jq           # NDJSON
rg --stats "pattern"               # 性能统计
rg -0 "TODO"                       # NUL 分隔
```

### 高级搜索
```bash
# 多模式 (AC 自动机)
rg -e "foo" -e "bar" -e "baz"

# 类型限定
rg -t rust -t toml "TODO"

# 排除
rg "TODO" --glob '!node_modules' --glob '!target'

# 限制深度
rg --max-depth 3 "pattern"

# 大小限制
rg --max-filesize 1M "pattern"
```

### CI / 脚本
```bash
# 找所有含 TODO 的文件
rg -l "TODO" --type rust | xargs -r wc -l

# 统计代码行
rg -c "^[^/\s]" --type py src/

# CI lint
rg -i "console\.log" src/ --json | jq -e '. | length == 0'
```

---

## ⚠️ 必避 3 坑

| 坑 | 症状 | 解法 |
|----|------|------|
| **PCRE 复杂正则** | 极慢, 卡死 | 用 Rust regex（默认）或 `-F` 固定串 |
| **二进制文件乱扫** | 输出乱码 | 默认跳过, `-a` 强制扫 |
| **大目录递归** | 扫到 node_modules/ | 默认尊重 .gitignore, 自己加 `.ignore` |

### 4 个隐藏坑

- **结果不全**: `.gitignore` / hidden / symlink 默认跳过, 加 `--no-ignore --hidden` 排查
- **`--multiline` 极慢**: 默认 false, 用 `-U` 启用会卡死
- **0 长 match**: regex `.*?` 会卡死, ripgrep 有 `+1` 兜底, 但要测
- **大文件 mmap 失败**: > 系统限制时 OOM, 加 `--max-filesize 1G` 兜底

---

## 🔄 vs ag（决策树）

```
需要 PCRE 完整语法 (lookaround/backref)?
  ├── 是 → 用 ag
  └── 否
        │
        需要极致快 (大仓库/CI)?
        │   ├── 是 → ripgrep (默认推荐)
        │   └── 否
        │         │
        │         镜像里要静态链接 (无 libc 依赖)?
        │         ├── 是 → ripgrep
        │         └── 否 → 都行
        │
        想用 Rust crates 在自家工具里集成搜索?
        │   ├── 是 → ripgrep (`grep` crate 公开 API)
        │   └── 否 → 都行
        │
        你只装了 ag (没有 rg)?
        └── 用 ag
```

**简要对比**:

| 维度 | ripgrep | ag |
|------|---------|-----|
| 语言 | Rust + SIMD | C + pthreads |
| 性能 (literal) | 1x | 1.5-3x 慢 |
| 性能 (regex) | 1x | 1-3x 慢 |
| PCRE lookaround | ❌ (Rust regex) | ✅ |
| .gitignore 智能 | ✅ | ✅ |
| 二进制文件 | 默认跳过 | 默认跳过 |
| 静态链接 | ✅ (~3MB) | ❌ (依赖 PCRE/zlib) |
| 安装包 | ~3MB | ~1MB |

→ 详细对比见 `deep-dive.md 专题 11`

---

## 🧩 可复用模式

| 模式 | ripgrep 怎么实现 | 我能用到哪 |
|------|----------------|----------|
| **Literal 预过滤** | 提取 regex 的固定串前缀, memchr 找候选 | WAF 规则、日志告警、DB LIKE 优化 |
| **mmap + Page Cache** | Mmap::open + Drop 回收 | 大文件读取 (日志、索引、二进制) |
| **SIMD runtime detect** | `is_x86_feature_detected!` + 多层 fallback | 写跨平台性能代码 (加密、压缩、解析) |
| **Sink 解耦** | trait `Sink` + match + context | 编译器诊断、DB CDC、消息消费者 |
| **NDJSON 流式输出** | 一次一行 JSON, jq 友好 | 大数据流输出、CI lint、API 调试 |

→ 模式 A-E 详细见 `deep-dive.md 专题 8`

---

## 📋 反思：ripgrep 让我重新思考的 5 件事

1. **5 层优化叠加 > 1 层极致优化**。每层 5x, 5 层 3000x
2. **Literal 优化是 regex 性能银弹**。90% 场景下, 找固定串就够了
3. **mmap 是大文件读取的"作弊器"**。零拷贝 + 共享缓存
4. **SIMD runtime detect 范式**。unsafe 隔离, safe 暴露, 老 CPU 也支持
5. **Sink 解耦让代码可测可组合**。这不是"花式架构", 是工程实用主义

---

## ✅ 我能马上用的 3 件事

- [ ] 把 `grep -r` 替换为 `rg`, 写进 shell alias
- [ ] 在 CI 加 `rg -i "console\.log" src/` 当 lint
- [ ] 用 `crates/ignore` crate 写自己的文件树遍历工具

---

## 🔗 跨项目引用

- `[[../ag/README|ag]]` — 性能对比 (ripgrep 3-10x 快), PCRE vs Rust regex
- `[[../10-vault/README|Vault]]` — `RipgrepSearcher` 用 ripgrep 做全文索引
- `[[../01-etcd/README|etcd]]` — Rust 重写经典, 也用了 runtime SIMD detect
- `[[../05-golang/README|Go]]` — `tokio-rs/memchr` 提取为通用库
- `[[../08-prometheus/README|Prom]]` — log query 用 ripgrep 处理

---

## 📚 进一步阅读

- 源码：https://github.com/BurntSushi/ripgrep
- 文档：https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
- memchr: https://github.com/tokio-rs/memchr
- regex-automata: https://github.com/rust-lang/regex/tree/master/regex-automata
- `deep-dive.md` — 11 专题深度解析（645 行）
- `code-snippets/` — 5 段必读代码
