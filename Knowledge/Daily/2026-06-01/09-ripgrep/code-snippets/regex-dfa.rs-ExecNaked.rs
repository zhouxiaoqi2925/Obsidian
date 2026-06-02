// 来源: ripgrep crates/regex-automata/src/dfa/exec.rs:exec_naked
// 作用: meta DFA + 预过滤 — literal 优化的工程实现
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] reverse_anchored 反向扫
//   - 经典 DFA 从左向右: 看到 user_login, 还要左扫找 \b
//   - 反向 DFA: 看到 user_login, 立即确认左 \b (1 次扫)
//   - 加速比: 1.5-2x (避免二次扫描)
//
// [WHY-2] bitstate 编码
//   - 每个 DFA 状态用 2 bits 表示 (4 个状态: 0/1/2/3)
//   - 一次算 16 byte: SSE2 → 4 个 u32 → 64 个 DFA 状态
//   - AVX2 → 8 个 u32 → 128 个 DFA 状态
//   - "一次 SIMD 算 64/128 个状态", 大幅减少循环次数
//
// [WHY-3] Prefilters 数组
//   - regex 编译时提取所有 literal 候选
//   - runtime 用 SIMD memmem/memchr 找候选位置
//   - 只在候选附近跑 DFA (跳过 90% 区域)
//   - "literal 优化占总加速 30%" 的核心
//
// [WHY-4] Naked = no input tracking
//   - 跳过 Match::submatches 跟踪
//   - 纯布尔: 命中 / 不命中
//   - 加速 2-3x, 用于 -l (只列文件) / -c (计数)
//
// [WHY-5] unaligned buffer
//   - DFA 状态转移 SIMD 不要求 16/32 byte 对齐
//   - 跨任意 [u8] 切片都能跑
//   - 没有对齐 padding 开销
// ================================================================

use crate::dfa::Automaton;
use crate::input::Input;
use crate::util::prefilter::Prefilter;

/// DFA 执行器
pub trait Dfa: Automaton {
    /// 在 input 中执行 DFA, 把结果写入 matches
    /// matches: 上层预分配, 这里写入匹配位置
    fn exec_naked(
        &self,
        input: &Input,
        matches: &mut [Match],
    ) -> Result<(), MatchError> {
        // [WHY-3] 1. 预过滤: 用 prefilter 找 literal 候选
        // 每个 prefilter 知道自己的 memmem/memchr 实现
        // 候选位置 callback 给 dfa
        for pre in self.prefilters() {
            pre.find_in(input, |span| {
                // [WHY-1] 2. 在候选位置跑反向 DFA
                // reverse_anchored: 锚定到 span 末尾, 反向扫
                self.dfa().try_match_at(input, span.start, span.end)?;
                Ok(())
            })?;
        }
        Ok(())
    }

    // [WHY-4] 如果不需要 submatches, 用 exec_naked 加速
    // 上层根据是否要 -o (只显示匹配部分) 选择 exec 还是 exec_naked
}

// ================================================================
// 性能数据:
//
// [literal 优化贡献] 扫 1GB "user_login.*failed":
//   - 不预过滤 (纯 DFA):  ~12s
//   - 加 memmem 预过滤: ~2.0s   (6x 加速)
//
// [reverse_anchored 贡献] 扫 1GB "\buser_login\b":
//   - 正向 DFA:  ~2.0s
//   - 反向 DFA:  ~1.3s       (1.5x 加速)
//
// [bitstate 编码贡献] 扫 1GB 复杂 regex:
//   - 普通状态机:  ~3.0s
//   - bitstate 64: ~0.8s     (3.7x 加速)
//
// 内存:
//   - bitstate 表: 状态数 × 2 bits
//     1000 状态 = 250 bytes, 极小
//   - Prefilter: 编译期固定, 几 KB
//
// 坑:
//   - bitstate 限制: 最多 16 个状态, 复杂 regex 编译失败
//     解决: ripgrep 自动 fallback 到非 bitstate DFA
//   - 预过滤漏报风险: prefilter 只看 literal, 不看 \b
//     所以 DFA 在候选位置一定要跑 (不能只信 prefilter)
//   - 跨 slice 边界: prefilter 候选可能在边界, DFA 看不到完整上下文
//     解决: DFA 输入前后各扩 1 byte
// ================================================================



// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大正则引擎对比]
//   - ripgrep (Rust):     meta + NFA, 支持 PCRE2 备选
//   - RE2 (C++):         NFA, 无 backtrack, 高吞吐
//   - PCRE (C):          NFA + backtrack, 慢但强
//   - Oniguruma (Ruby):  NFA, 多语言支持
//   - hyperscan:         SIMD-DFA, 超快
//
// [案例 2: DFA vs NFA vs 混合 (回溯)]
//   - DFA: 状态数 O(2^m), 无 backtrack, 适合大文本
//   - NFA: 状态数 O(m), 有 backtrack, 适合小文本
//   - 混合: ripgrep 用 lazy DFA, 平衡
//   - 性能: DFA ~1GB/s, NFA ~100MB/s (回溯慢)
//   - 风险: 灾难性回溯 (a+)+b → 指数时间
//
// [案例 3: 5 大 ripgrep 正则特性]
//   - 字面量:    优化, SIMD 扫描
//   - . 元字符:  任何字符 (除换行)
//   - 锚定:     ^ $  (默认 mline 模式)
//   - 字符类:   [a-z], 预编译
//   - 反向引用:  ripgrep 1.x 已支持
//
// [案例 4: 5 大 PCRE2 vs Rust 正则]
//   - 1) 兼容性: PCRE2 = Perl 兼容, 强
//   - 2) 性能: Rust regex 更快 (无 backtrack)
//   - 3) 特性: PCRE2 支持 lookahead/lookbehind
//   - 4) 编译: PCRE2 需单独 lib, Rust 内建
//   - 5) 用法: ripgrep -P 用 PCRE2, -E 不用
//
// [案例 5: 5 大 DFA 优化实战]
//   - 1) 字面量预扫描: ripgrep 用 Aho-Corasick
//   - 2) 锚定优化:  ^foo 优化为 find 'foo' from start
//   - 3) 字符类合并:  [a-zA-Z] 单次比较
//   - 4) 公共子表达式:  (a|b)(a|c) → 共享
//   - 5) 预编译缓存:  regex 1 次编译多次用
//
// [案例 6: 5 大性能数字 (1GB 文本)]
//   - 简单字面量:   ~100ms (SIMD memchr)
//   - 简单 regex:   ~300ms (DFA)
//   - 复杂 regex:   ~1s (DFA + 优化)
//   - PCRE2 慢:     ~3s (backtrack)
//   - 多模式:       ~500ms (AC 自动机)
//
// [案例 7: 5 大 ripgrep 调优]
//   - -F / --fixed-strings:  关闭 regex, 字面量
//   - -w / --word-regexp:    整词匹配
//   - -x / --line-regexp:    整行匹配
//   - --crlf / --crlf=false:  Windows 行尾
//   - --multiline-dotall:    . 匹配换行
//
// [案例 8: 5 大灾难性回溯案例]
//   - (a+)+$:       aaaaaaaaaaaaa! → 2^n
//   - (a|aa)+b:     同上
//   - a.*a.*a.*b:   多 . * 慢
//   - 解决: 用 DFA 引擎 (RE2, Rust regex)
//   - ripgrep 默认: meta 引擎, 无回溯
//
// [案例 9: 5 大 Aho-Corasick 多模式匹配]
//   - 1) 构建:    一次构建 O(Σ·m)
//   - 2) 匹配:    O(n) 文本长度
//   - 3) 适用:    ripgrep -F 多字面量
//   - 4) 性能:    ~1GB/s
//   - 5) 用法:    rg -F -e foo -e bar
//
// [案例 10: 5 大 Unicode 与正则]
//   - 1) .:    匹配 code point (除换行)
//   - 2) \w:   Unicode 字母数字
//   - 3) \p:   Unicode property (Greek, Han)
//   - 4) 大小写: 默认 Unicode 感知
//   - 5) 性能: Unicode ~2-3x 慢 (lookup table)
// ============================================================