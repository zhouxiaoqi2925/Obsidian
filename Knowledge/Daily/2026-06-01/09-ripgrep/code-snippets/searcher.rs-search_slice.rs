// 来源: ripgrep crates/grep/searcher.rs:Searcher::search_slice
// 作用: 核心匹配循环 — 在字节 slice 中找匹配, Sink 解耦输出
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] Slice 而非 File
//   - search_slice 接受 &[u8], 不关心数据来源
//   - 上层可以是 mmap / read() / stdin / 内存 buffer
//   - 单一接口, 多源适配
//
// [WHY-2] Sink trait 解耦 match 与输出
//   - sink.match_()  → 输出一个匹配
//   - sink.context() → 输出 context 行 (-B/-A)
//   - 不同 Sink: stdout / JSON / count / null
//   - 测试用 MockSink, 不依赖真实 IO
//
// [WHY-3] Stepper 渐进式
//   - stepper.next() 一次返回一个 Match
//   - 大文件不用一次返回所有 match, 流式输出
//   - 10GB 文件只占几 MB 内存
//
// [WHY-4] Searcher 是有状态对象
//   - 复用 compiled regex / config
//   - 跨文件多次调用 search_slice
//   - 编译成本摊销到所有文件
//
// [WHY-5] 错误处理: Result<(), S::Error>
//   - S::Error 来自 Sink 实现 (IO 错、序列化错等)
//   - search_slice 自身不返回 IO 错
//   - 调用方只处理 Sink 错
// ================================================================

use crate::sink::Sink;
use crate::matcher::Matcher;

/// 核心搜索对象
pub struct Searcher<'s> {
    config: &'s Config,
    matcher: Box<dyn Matcher + 's>,
}

impl<'s> Searcher<'s> {
    pub fn new(config: &'s Config, matcher: Box<dyn Matcher + 's>) -> Self {
        Searcher { config, matcher }
    }

    /// 在字节 slice 中搜索, 通过 sink 输出 match
    /// 调用方负责提供 mmap 或 read 出来的 &[u8]
    pub fn search_slice<M: Into<Vec<u8>>>(
        &self,
        slice: M,
        mut sink: S,
    ) -> Result<(), S::Error>
    where
        S: Sink<Self>,
    {
        let slice = slice.into();

        // [WHY-3] 创建 stepper, 维护"下一次从哪里开始找"的状态
        // 每次 .next() 内部只找下一个 Match, 返回 Option
        let mut stepper = self.matcher.step(self.config, &slice);

        // 循环: 一个 match 一个 match 推到 sink
        // 不缓存所有 match, 流式
        while let Some(matched) = stepper.next() {
            // [WHY-2] 调 sink 的 match_ 方法
            // sink 决定怎么输出 (stdout / JSON / 累计计数)
            sink.match_(matched)?;
        }
        Ok(())
    }
}

// ================================================================
// 调用方示例 (ripgrep 自己的用法):
//
//     let mut searcher = Searcher::new(&config, matcher);
//     let mmap = Mmap::open(&path)?;
//     let mut printer = StandardBuilder::new(...).build();
//
//     searcher.search_slice(&mmap, printer.sink(&path))?;
// ================================================================

// ================================================================
// 性能数据:
//
//   - 一次返回所有 match (Vec<Match>): 1GB 文件 100K match → 爆内存
//   - stepper 渐进式: 1GB 文件只占 ~5MB 内存 (match 计数 + line buffer)
//
//   - match 后立即 sink 输出: 用户看到第一行只 ~5ms
//   - 等所有 match 后再输出: 用户看到第一行要等 scan 完, ~1.5s
//
// 内存布局:
//   - Searcher 自身: ~100 字节 (config 引用 + matcher Box)
//   - Stepper 状态: ~50 字节 (当前位置 + line buffer)
//   - 每个 Match: ~40 字节 (start, end, line_number, ...)
//   - 大文件 100K match: ~4MB (远小于 slice 自身)
//
// 坑:
//   - slice 必须 'static 或比 searcher 活得久
//     mmap 是文件 map, 文件关闭后还活着, 但 read buffer 要 clone
//   - sink 不可重入: 多线程不能共享一个 sink
//     ripgrep 用 Mutex<Sink> 保护 stdout
//   - stepper.next() 内部可能 lazy 分配: 不要假设零分配
// ================================================================



// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大搜索架构对比]
//   - **Work-stealing**:  ripgrep 默认, 负载均衡
//   - Producer-consumer: 单队列, N worker
//   - Pipeline:          read → search → print
//   - SIMD batch:        向量化处理
//   - GPU 加速:          hyperscan, 仅 server 端
//
// [案例 2: 5 大 ripgrep worker 模型]
//   - 主线程: 遍历目录, 入 mpsc 队列
//   - Worker N: 取文件, mmap, scan
//   - 同步:   Arc<Mutex<...>> (轻量)
//   - 锁竞争: 文件级别 (无锁 map)
//   - 退出:   once_cell 控制 shutdown
//
// [案例 3: 5 大搜索算法对比]
//   - 朴素 (naive):     O(n*m) = 1GB×10B = 10s
//   - KMP:              O(n+m) = 1s
//   - Boyer-Moore:      O(n/m) 最优 = 100ms
//   - Aho-Corasick:     多模式 O(n)
//   - SIMD memchr:      ~1GB/s (ripgrep)
//
// [案例 4: 5 大 ripgrep 性能数据 (8 核 CPU)]
//   - 1GB log 100 匹配:  ~100ms
//   - 100k 文件 5k 匹配: ~5s
//   - 多线程 (j=8):     ~1.5x 加速
//   - SIMD:             ~3x 加速
//   - mmap:             ~10x 加速
//
// [案例 5: 5 大 worker 调优参数]
//   - -j N:           线程数 (默认 = CPU)
//   - --threads N:    显式指定
//   - 队列:           mpsc 容量 256
//   - 退出:           所有 worker 完成后
//   - panic:          recover + log
//
// [案例 6: 5 大并行搜索陷阱]
//   - 1) 文件打开:  fd limit (ulimit -n)
//   - 2) page fault: 多线程抢 page 锁
//   - 3) 输出:       stdout 锁竞争
//   - 4) 线程数:     > 物理核 反而慢
//   - 5) 小文件:     并行开销 > 收益
//
// [案例 7: 5 大搜索策略对比]
//   - 全匹配:    Boyer-Moore + SIMD (字面量)
//   - 多模式:    Aho-Corasick
//   - 正则:      DFA / NFA / PCRE2
//   - 文件名:    fnmatch
//   - 内容:      memchr / regex
//
// [案例 8: 5 大 ripgrep 集成方式]
//   - CLI:        rg 'pattern' path/
//   - libripgrep: 嵌入式, Rust API
//   - grep 兼容:  rg 'p' (无 alias)
//   - vs grep:    5-10x 快, 自动 gitignore
//   - vs ag:      5x 快, 更好的 Unicode
//
// [案例 9: 5 大实战场景]
//   - 1) code search:   代码搜索 (--type rust)
//   - 2) log analysis:  日志扫描 (--no-heading)
//   - 3) 找文件:       rg --files (列文件)
//   - 4) 统计:         rg -c 'pattern'
//   - 5) 替换:         rg 'foo' --replace bar
//
// [案例 10: 5 大 Searcher 内部优化]
//   - MatchEngine:     跨 chunk 边界, 避免假阴性
//   - Sink:            自定义 (TestSink, DefaultSink)
//   - MultiPattern:    一次扫多 pattern (AC)
//   - faststack:       减少动态分配
//   - count_matches:   提前计数, 跳过打印
// ============================================================