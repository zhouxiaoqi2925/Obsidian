// 来源: ripgrep crates/core/app.rs:print_match (NDJSON 简化版)
// 作用: 流式 JSON 输出 — 一行一个 JSON, jq 友好
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] NDJSON (Newline Delimited JSON)
//   - 每行一个完整 JSON 对象
//   - 不需要解析整个文件就能用
//   - jq / awk / 管道友好
//   - 大结果集不爆内存 (流式)
//
// [WHY-2] 4 种 type
//   - begin:  文件开始
//   - match:  找到 match (可能多个)
//   - end:    文件结束 (带 stats)
//   - summary: 整体汇总 (多文件时)
//   - 调用方通过 type 过滤, 不用解析冗余字段
//
// [WHY-3] submatches 数组
//   - 同一行可能有多个匹配 (用 -o 显示)
//   - 数组保留全部, 顺序就是从左到右
//   - {match, start, end} 三元组
//
// [WHY-4] 路径的 "text" 包装
//   - {path: {text: "src/main.rs"}}
//   - 看似冗余, 实则给将来扩展 (添加字节偏移等)
//   - 类似 protobuf 的 "scalar wrapper" 模式
//
// [WHY-5] stats in end
//   - 每次文件结束输出 elapsed_total
//   - 不用等全部跑完就能看到进度
//   - 性能调优时很方便
// ================================================================

use serde::Serialize;
use std::io::{self, Write};

/// NDJSON 4 种 type
#[derive(Serialize)]
#[serde(tag = "type")]
pub enum RgMessage<'a> {
    #[serde(rename = "begin")]
    Begin { data: Begin<'a> },
    #[serde(rename = "match")]
    Match { data: Match<'a> },
    #[serde(rename = "end")]
    End { data: End<'a> },
    #[serde(rename = "summary")]
    Summary { data: Summary },
}

#[derive(Serialize)]
pub struct Begin<'a> {
    pub path: PathBufW<'a>,
}

#[derive(Serialize)]
pub struct End<'a> {
    pub path: PathBufW<'a>,
    pub stats: Stats,
}

#[derive(Serialize)]
pub struct PathBufW<'a> {
    pub text: &'a str,         // [WHY-4] 包装
    // 未来可加: byte_offset, line_number
}

#[derive(Serialize)]
pub struct Match<'a> {
    pub path: PathBufW<'a>,
    pub lines: Lines<'a>,
    pub line_number: Option<usize>,
    pub absolute_offset: usize,
    pub submatches: Vec<Submatch<'a>>,    // [WHY-3]
}

#[derive(Serialize)]
pub struct Submatch<'a> {
    #[serde(rename = "match")]
    pub m: MatchText<'a>,
    pub start: usize,
    pub end: usize,
}

#[derive(Serialize)]
pub struct MatchText<'a> {
    pub text: &'a str,
}

/// 打印一个 RgMessage 到 stdout
/// 一次写一行 (NDJSON 格式)
pub fn print_json<W: Write>(out: &mut W, msg: RgMessage) -> io::Result<()> {
    serde_json::to_writer(&mut *out, &msg)?;
    out.write_all(b"\n")?;     // [WHY-1] 行分隔
    out.flush()
}

// ================================================================
// 实际输出示例 (rg --json "fn main" src/main.rs):
//
//   {"type":"begin","data":{"path":{"text":"src/main.rs"}}}
//   {"type":"match","data":{"path":{"text":"src/main.rs"},"lines":{"text":"fn main() {\n"},"line_number":1,"absolute_offset":0,"submatches":[{"match":{"text":"fn main"},"start":0,"end":7}]}}
//   {"type":"end","data":{"path":{"text":"src/main.rs"},"stats":{"elapsed_total":{"human":"1.2ms","nanos":1234567}}}}
//
// ================================================================

// ================================================================
// 性能数据:
//
// [NDJSON vs 数组 JSON]:
//   - NDJSON 1GB 100K match: 流式, 内存 ~10MB
//   - 数组 JSON 1GB 100K match: 必须攒完再写, 内存 ~3GB
//   - 客户端: NDJSON 边读边处理, 数组要等完整
//
// [serde_json vs 手工格式化]:
//   - serde_json: 慢 2-3x, 但安全 (转义, 边界)
//   - 手工 format!: 快 2-3x, 但要防注入 (引号, 换行)
//
// [4 type 设计 vs 1 type]:
//   - 1 type 全字段: 1.5x 体积大, 客户端要 None 检查
//   - 4 type 分类: 紧凑, 客户端用 type 字段分发
//
// 内存:
//   - 序列化时: serde_json 默认不缓存, 流式
//   - to_writer 直接写, 不在内存中拼字符串
//
// 坑:
//   - 必须末尾 \n: 否则 jq 不识别
//   - 路径含特殊字符: "src/with\"quote" 必须转义
//     serde_json 自动处理
//   - 大 fields: 整个文件一行匹配时, lines.text 可能很大
//     ripgrep 默认截断 1KB, 避免爆
//   - 多线程输出: 多个 worker 写 stdout 会交错
//     ripgrep 用 Mutex<Stdout> 保护
// ================================================================



// ============================================================
// 深度拓展 (实战案例):
//
// [案例 1: 5 大 ripgrep 输出模式对比]
//   - Content:     文件:行号:内容 (默认)
//   - FilesWithMatches: 只列文件名
//   - Count:       统计每文件匹配数
//   - JSON:        机器可读
//   - vimgrep:     集成 vim quickfix
//
// [案例 2: 5 大颜色与高亮配置]
//   - --color always/never/auto (默认 auto)
//   - --colors 'match:fg:red' 自定义
//   - --no-heading 不显示文件名 (单文件)
//   - --line-number / -n  (默认开启)
//   - --column 显示列号
//
// [案例 3: 5 大格式控制参数]
//   - --field-context-separator ' -- '
//   - --field-match-separator ':'
//   - --pre-glob 处理压缩文件
//   - --null 替代换行 (适合 xargs)
//   - --replace 'X' 替换匹配为 X (统计)
//
// [案例 4: 5 大 ripgrep vs grep 输出差异]
//   - ripgrep: 文件:行:列:内容 (列可选)
//   - grep:    文件:行:内容
//   - ripgrep: 颜色高亮 (默认 auto)
//   - grep:    --color 显式
//   - ripgrep: --no-heading 单文件时不显示文件名
//
// [案例 5: 5 大输出过滤参数]
//   - -m N / --max-count=N: 每文件最多 N 匹配
//   - --files-without-match: 反向 (不匹配文件)
//   - -l / --files-with-matches: 只列文件
//   - -c / --count: 统计
//   - --invert-match / -v: 反转
//
// [案例 6: 5 大 ripgrep 编码处理]
//   - --encoding utf-8 (默认)
//   - --encoding latin1 (西欧)
//   - --encoding gbk (中文, 需 unicode-width)
//   - 自动检测: BOM 头
//   - 二进制: --binary skip (默认)
//
// [案例 7: 5 大 ripgrep 性能数据]
//   - 1GB 文本扫描:  ~100ms (SIMD)
//   - 100 万行 log:  ~50ms
//   - 10 万文件:    ~5s (含 open)
//   - 5 千匹配:     ~10ms 输出
//   - 内存占用:     ~10-50MB
//
// [案例 8: 5 大 ripgrep 在 CI/CD 用法]
//   - rg 'TODO' --type rust    # 找待办
//   - rg 'unsafe' src/         # 找 unsafe 块
//   - rg 'console\.log'        # 调试代码
//   - rg -c '\b\w+\b'          # 词频统计
//   - rg --json | jq          # 后处理
//
// [案例 9: 5 大 Printer 性能优化]
//   - 批量写:  攒 N 行再 flush (默认 0=行)
//   - 锁:      单线程打印 (无锁)
//   - 缓冲:    stderr/stdout 单独
//   - 颜色:    跳过非 tty
//   - 长度:    截断超长行 (默认 2KB)
//
// [案例 10: 5 大 ripgrep 集成编辑器]
//   - VSCode: search.useRipgrep: true
//   - Vim:    :grep rg pattern
//   - Emacs:  rg + wgrep
//   - fzf:    rg --files | fzf
//   - bat:    rg pattern | bat --language rust
// ============================================================