# jq - 命令行 JSON 处理器（JSON 世界的 sed/awk）

**GitHub**: jqlang/jq
**Star**: 32k+
**语言**: C
**主题**: json-processor / dsl / stack-vm / bison-parser / libjq
**适用场景**: 命令行 JSON 处理 / DSL 数据转换 / 嵌入式 C 库

---

## 第一段：基础范式

### 模式 1 - jv 16 字节胖指针

**问题场景**：JSON 值类型有 7 种（null/false/true/number/string/array/object）+ INVALID。用裸 struct 浪费内存，用指针追堆内存 GC 重。jq 的 `jv` 16 字节胖指针把"小值内联、大值指针化"做到极致。

**解决方案**：`src/jv.h:34-43` 定义 `typedef struct { unsigned char kind_flags; unsigned char pad_; unsigned short offset; int size; union { struct jv_refcnt* ptr; double number; } u; } jv`。`kind_flags` = kind（4 bit）+ flags（4 bit）。`size` 数组/对象长度。`u.number` 数字内联 `double`。`u.ptr` 大值堆指针带 refcnt。4 个 const 全局（NULL/INVALID/FALSE/TRUE）直接内联。

**关键参数**：
- `kind_flags` 4 bit kind + 4 bit flags
- `size` 数组/对象长度
- `u.number` 数字内联 double
- `u.ptr` 大值堆指针带 refcnt
- 4 const 全局 NULL/INVALID/FALSE/TRUE

**最佳实践**：小值内联 + 大值指针化兼顾性能与表达力；16 字节在 64-bit 上对齐友好；任何"C 写 JSON-like 值类型"项目可借鉴；4 个 const 全局省一次 indirection；`kind` 拆 4 bit 留 4 bit 给 flags 避免冗余字段。

### 模式 2 - 不可变值 + 引用计数 + COW

**问题场景**：DSL 风格 `.a.b.c | ...` 需要多次引用同一值。可变值容易"别处修改"，GC 重。jq 用不可变值 + 引用计数 + COW：`jv_array_append` 不修改原值，refcount + 1 后返回新根节点。

**解决方案**：`src/jv.c` 的 `jv_array_append(jv array, jv element)`：`if (jv_get_refcnt(array) > 1) { jv old = array; array = jv_copy(array); jv_free(old) }` + `array->u.ptr->array_data[array->size++] = element` + `return array`。COW：refcount > 1 时深拷贝。`jv_free` 转移所有权，无需 GC。

**关键参数**：
- 不可变 修改返回新值
- 引用计数 共享子树
- COW refcount > 1 时深拷贝
- 值语义 `jv_free` 转移所有权

**最佳实践**：不可变 + 引用计数是 C 写 DSL 的黄金模式；任何"DSL + 值类型"项目可借鉴；共享子树省内存 + 拷贝省 CPU；所有权靠"消费/产出"约定；漏 free / 重复 free 是 CVE 风险（v1.8.1 CVE-2025-49014）。

### 模式 3 - X-macro 指令表

**问题场景**：VM 要维护 30+ 操作码（LOADK/CALL_JQ/RET/...），enum + 名字表 + flags 表 + 堆栈 in/out 表 4 套数据。手动维护易漂移。jq 用 X-macro：`#define OP(name, imm, in, out)` + `#define OP(...) +1` 双重包含，同时生成 enum / 计数 / flags / in-out。

**解决方案**：`src/opcode_list.h` 定义 `OP(LOADK, true, 0, 1)` 加载常量 + `OP(CALL_JQ, true, 1, 1)` 调用 jq 函数 + `OP(RET, false, 1, 0)` 返回 + `OP(JUMP, true, 0, 0)` 跳转 + `OP(FORK, true, 0, 0)` 流式分叉 + `OP(DUP, false, 1, 2)` 复制栈顶。`src/bytecode.h` 用 `#define OP(name, imm, in, out) name,` 包含 opcode_list.h 后 `#undef OP` + `NUM_OPCODES`。

**关键参数**：
- `OP(name, imm, in, out)` X-macro 定义
- `imm` 是否带立即数
- `in` 栈入口数
- `out` 栈出口数
- 编译器检查长度 +1 累加

**最佳实践**：X-macro 一源多用零维护成本加新指令；任何"枚举 + 元数据表"项目可借鉴；编译器能检查长度（`+1` 累加）；IDE 跳转混乱是 trade-off；配合 bison 生成的 location 类型。

### 模式 4 - bison + flex + %locations

**问题场景**：jq DSL 语法含 `,` `|` `[]` `{}` `.` 字符串插值 `\(...)` 等。手写 parser 易错，没源码位置错误信息差。jq 用 flex（lexer）+ bison（parser）+ `%locations` 自动给 AST 节点打行列号。

**解决方案**：`src/parser.y:12-27` 用 `%code requires { #include "locfile.h"; struct lexer_param; #define YYLTYPE location; #define YYLLOC_DEFAULT(Loc, Rhs, N) ... }` + `%locations` + `%define parse.error verbose` + `%define api.pure`。5 个 start condition 区分字符串/插值/注释。配合 `parse.error verbose` 给出可读错误。

**关键参数**：
- `%locations` 每个 AST 节点带行列号
- `parse.error verbose` 语法错误带 token 上下文
- `api.pure` 纯函数 parser（reentrant）
- `YYLTYPE location` 自定义 location 类型

**最佳实践**：bison + flex 是 C 写 DSL 的标准组合；`%locations` 让运行时错误精确到行号 + 列号；任何"DSL 工具"项目可借鉴；5 个 start condition 区分字符串/插值/注释；配合 `parse.error verbose` 给出可读错误。

### 模式 5 - 闭包捕获编译期解决（block_bind 三态绑定）

**问题场景**：DSL 有闭包（如 `def add(f): f | f; add(.+1)`），闭包捕获自由变量在 C 里手写 GC 难。jq 把闭包捕获退化为编译期常量：每个 inst 三态（未绑定 / 定义者 / 使用者），编译期 `block_bind(def, body)` 一次性链好。

**解决方案**：`src/compile.c:23-65` 的 `struct inst { struct inst* next, *prev; opcode op; struct inst* bound_by; char* symbol; int any_unbound, referenced }`。`void block_bind(block def, block body, int any_reserved)` 遍历 body 找同名未绑定 symbol，链到 def 中同名 symbol 的 inst。三态：`bound_by = NULL`（未绑定）/ `bound_by = self`（定义者）/ `bound_by = other`（使用者）。

**关键参数**：
- `bound_by = NULL` 未绑定自由变量
- `bound_by = self` 当前 inst 是定义者
- `bound_by = other` 当前 inst 是使用者
- `make_closure` level/idx 双层寻址
- `ARG_NEWCLOSURE` 区分新建/传递闭包

**最佳实践**：闭包捕获在编译期解决运行时只查表；任何"DSL + 闭包"项目可借鉴；配合 `make_closure` 的 `level/idx` 双层寻址；静态 nested bytecode + level 偏移；用 `ARG_NEWCLOSURE` 区分新建/传递闭包。

---

## 第二段：扩展范式

### 模式 6 - 栈机 VM + 负偏移栈指针

**问题场景**：VM 解释器要快速跑字节码。寄存器机实现复杂，AST 解释器慢。jq 用栈机 + 负偏移栈指针：`stack_ptr` 是 `int`（mem_end 偏移），`bound -= size` 单次移指针 O(1)。

**解决方案**：`src/exec_stack.h:50-78` 的 `typedef int stack_ptr`（负整数，相对 mem_end 的偏移）+ `static void* stack_block(struct stack* s, stack_ptr p) { return (void*)(s->mem_end + p) }` + `static stack_ptr stack_push(struct stack* s, size_t size) { s->bound = (char*)s->bound - size; return (stack_ptr)(s->bound - s->mem_end) }`。`src/execute.c:53-71` 定义 `struct frame { struct bytecode* bc; stack_ptr env; stack_ptr retdata; uint16_t* retaddr; union frame_entry entries[] }` + `union frame_entry { struct closure closure; jv localvar }`。

**关键参数**：
- `stack_ptr` int 负偏移
- `frame` 字节码 + 闭包 + 局部变量
- `union frame_entry` 闭包/var 共享内存
- `env` 父 frame 索引
- `make_closure` 闭包创建/传递

**最佳实践**：栈机比 AST 解释器快 5-10×；负偏移栈指针调试时打印数值稳定；`union frame_entry` 闭包/var 共享内存；任何"DSL + 解释器"项目可借鉴；`bound -= size` O(1) 分配。

### 模式 7 - forkpoint NFA + 6 字段快照

**问题场景**：jq 是多值 DSL——`,` 输出多个，`.[]` 迭代产生多次输出。AST 求值器要维护树复杂。jq 用 NFA 风格 forkpoint：6 字段快照实现 backtracking，比 AST 简单一个数量级。

**解决方案**：`src/execute.c:194-200` 的 `struct forkpoint { stack_ptr saved_data_stack, saved_curr_frame; int path_len, subexp_nest; jv value_at_path; uint16_t* return_address }`。6 字段快照 = 完整执行状态。empty 早退 + backtracking 兼顾。

**关键参数**：
- `saved_data_stack` 数据栈位置
- `saved_curr_frame` 当前 frame 位置
- `path_len` 路径深度
- `subexp_nest` 嵌套层数
- `value_at_path` 当前路径值
- `return_address` 返回地址

**最佳实践**：NFA forkpoint 是"流式多值 DSL"的金标准；比维护 AST 树求值器简单一个数量级；任何"多输出 + 回溯"项目可借鉴；6 字段快照 = 完整执行状态；empty 早退 + backtracking 兼顾。

### 模式 8 - 模块系统 import/include + $ORIGIN

**问题场景**：jq DSL 要复用 helper 函数，内联长代码不可维护。jq 提供 `import` + `include` + `-L` 路径，类似 ES Modules。循环 import 会死锁，嵌入到其它可执行文件时路径解析要 $ORIGIN。

**解决方案**：`src/linker.c:23-35` 的 `struct lib_entry { char *name; block def; int loading }`。循环检测：`if (entry->loading) { fprintf(stderr, "jq: error: cycle detected while loading %s\n", entry->name); return jv_invalid_with_msg(jv_string("import cycle")) }` + `entry->loading = 1` + `block def = load_module(entry->name)` + `entry->loading = 0`。`src/linker.c:72-77` 的 `$ORIGIN` 解析：`expanded_elt = jv_string_fmt("%s/%s", jv_string_value(jq_origin), jv_string_value(path) + sizeof("$ORIGIN/") - 1)`。

**关键参数**：
- `import` 模块导入（命名空间隔离）
- `include` 内联模块（共享命名空间）
- `-L` 搜索路径
- `$ORIGIN` 可执行文件所在目录
- `loading` flag 循环检测

**最佳实践**：`$ORIGIN` 仿 ELF 动态链接器嵌入友好；`loading` flag 防止循环 import；任何"DSL + 模块系统"项目可借鉴；`import` vs `include` 区分命名空间；`-L` 路径搜索仿 ES Modules。

### 模式 9 - 多态加法（null+x=x / array+array=concat / object+object=merge）

**问题场景**：JSON 不同类型相加语义不同（`null + 1 = 1`，`array + array = concat`，`object + object = merge`）。严格类型检查会让 DSL 难用。jq 实现 JSON 风格多态加法：C switch 按 kind 分发。

**解决方案**：`src/builtin.c:84-106` 的 `jv binop_plus(jv a, jv b)`：`if (jv_get_kind(a) == JV_KIND_NULL) { jv_free(a); return b }`（null + x = x）+ `if (jv_get_kind(b) == JV_KIND_NULL) { jv_free(b); return a }` + 数字相加 + 字符串 concat + 数组 concat + 对象 merge。错误用 `type_error2(a, b, "cannot be added")` 返 `jv_invalid` 带消息。

**关键参数**：
- `null` + any = any
- `number` + `number` = number
- `string` + `string` = concat
- `array` + `array` = concat
- `object` + `object` = merge
- 类型不匹配 jv_invalid 带消息

**最佳实践**：JSON 风格多态让 DSL 自然；任何"DSL + 运算符重载"项目可借鉴；错误用 `jv_invalid_with_msg` 包装；`null` 吸收语义（JS 风格）简化逻辑；类型不匹配时带消息的 invalid 优于抛异常。

### 模式 10 - JV_KIND_INVALID 错误值

**问题场景**：DSL 要 `try/catch` 错误处理，单独 error channel 复杂。jq 把 `INVALID` 设计成 first-class kind：错误值带消息流过栈，`try/catch` 直接捕获。

**解决方案**：`src/jv.c:148-160` 的 `struct jvp_invalid { jv_refcnt refcnt; jv errmsg }` + `jv jv_invalid_with_msg(jv msg) { jv x = {JV_KIND_INVALID, 0, 0, 0, .u.ptr = make_refcnt(struct jvp_invalid)}; ((struct jvp_invalid*)x.u.ptr)->errmsg = msg; return x }`。`JVP_FLAGS_INVALID_MSG` 区分裸/带消息 invalid。优势：错误跟着值走无需单独 channel。

**关键参数**：
- `JV_KIND_INVALID` 错误值的独立 kind
- `jvp_invalid` 带 refcnt + errmsg
- `JVP_FLAGS_INVALID_MSG` 区分裸/带消息
- 错误跟着值走无需 channel

**最佳实践**：错误值 first-class 简化错误处理；任何"DSL + try/catch"项目可借鉴；错误消息带 refcnt 避免悬空指针；配合 `try/catch` DSL 关键字；调试时栈上全是 invalid 难区分是真错还是控制流（trade-off）。

---

## 第三段：进阶范式

### 模式 11 - 模板编译缓存（EJS/builtin.jq 一次编译多次渲染）

**问题场景**：内置函数 `builtin.jq` 是 200+ 函数用 DSL 实现，每个 test 启动都 parse 一次。jq 把 builtin.jq 编译结果缓存到 bytecode，启动 0 延迟。

**解决方案**：`src/builtin.c` 的 `static struct bytecode* builtins = NULL` + `void jq_init_builtins(struct jq_state* jq) { if (!builtins) { builtins = jq_compile(jq, builtin_jq_source) } jq->builtins = builtins }`。首次调用编译 + 缓存，后续调用直接复用。启动延迟 < 50ms。

**关键参数**：
- `builtin.jq` 200+ 内置函数
- `builtins` 全局编译后 bytecode
- 首次调用编译 + 缓存
- 后续调用直接复用
- C 函数 cfunctions[] 注册表

**最佳实践**：builtin 一次编译 + 多次复用；任何"DSL + 内置函数"项目可借鉴；C 函数用 `cfunctions[]` 注册表；DSL 函数用 `builtin.jq` 编译；启动延迟 < 50ms。

### 模式 12 - reduce 状态变量改写（v1.8 提速 30%）

**问题场景**：`reduce .[] as $x (0; . + $x)` 这种 reduce 内部 state 变量在 v1.7 是闭包捕获，每次迭代重新解析闭包。v1.8 把 state 变量改写为局部变量（`LOADVN/STOREN` 指令），闭包开销消失。

**解决方案**：`src/compile.c` v1.8 改写：v1.7 之前 reduce 闭包捕获 state 每次迭代重新查找；v1.8 state 改写为局部变量 `case REDUCE: { block body = inst->subfn; gen_op(LOADVN, state_idx); gen_call(body); gen_op(STOREN, state_idx) }`。`LOADVN idx` 加载局部变量到栈，`STOREN idx` 栈顶存到局部变量。收益：reduce 提速 30%。

**关键参数**：
- `LOADVN idx` 加载局部变量到栈
- `STOREN idx` 栈顶存到局部变量
- `state_idx` 状态变量索引
- 收益 reduce 提速 30%
- 编译期分析闭包捕获次数

**最佳实践**：闭包 → 局部变量是性能优化高招；任何"DSL + 闭包"项目可借鉴；编译期分析闭包捕获次数；状态变量改写为 `LOADVN/STOREN` 指令；配合 benchmark 验证。

### 模式 13 - 流式解析（JV_PARSE_STREAMING + --stream）

**问题场景**：GB 级 JSON 文件一次性解析内存爆。jq 提供 `--stream` 走增量解析器：`[event, path, value]` 三元组逐个吐出，内存占用 O(depth) 而非 O(size)。

**解决方案**：`src/jv_parse.c` 的 `typedef struct { int event; jv path; jv value; } jv_stream_event` + `jv_stream_event jv_parse_stream_next(struct jv_parser* p)` 增量解析每个 token 触发事件。`--stream` 增量解析（GB 级 JSON）+ `--seq` 切 application/json-seq（多文档流）。

**关键参数**：
- `--stream` 增量解析 GB 级 JSON
- `--seq` 切 application/json-seq
- 内存占用 O(depth) 而非 O(size)
- 适用大文件 + 流式处理

**最佳实践**：增量解析处理 GB 级 JSON；任何"JSON 流式工具"项目可借鉴；配合 `tail -f | jq --stream` 监控日志；`--seq` 切 application/json-seq（多文档流）；内存友好 = 大数据场景关键。

### 模式 14 - valgrind + asan + tsan + scanbuild 四道防线

**问题场景**：C 项目内存泄漏 + UAF + race condition 是 CVE 重灾区。jq CI 跑 valgrind（内存泄漏）+ asan/tsan（未初始化/数据竞争）+ scanbuild（静态分析）四道防线。

**解决方案**：`.github/workflows/valgrind.yml`：`on: [push, pull_request]` + `runs-on: ubuntu-latest` + `steps: uses: actions/checkout@v4` + `run: ./configure` + `run: make -j8` + `run: valgrind --error-exitcode=1 --leak-check=full --show-leak-kinds=all ./jq . < tests/sample.json`。v1.8.1 4 月修复了 CVE-2025-49014（UAF）。配合 fuzz harness 找边界。

**关键参数**：
- `valgrind` 内存泄漏 + UAF
- `asan` AddressSanitizer 堆/栈/全局
- `tsan` ThreadSanitizer 数据竞争
- `scanbuild` Clang static analyzer

**最佳实践**：valgrind + asan + tsan + scanbuild 是 C 项目标配；任何"严肃 C 开源"项目可借鉴；v1.8.1 4 月修复了 CVE-2025-49014（UAF）；配合 fuzz harness 找边界；CI 强制绿才能 merge。

### 模式 15 - 6 个 Fuzz Harness 喂 OSS-Fuzz

**问题场景**：JSON parser + DSL parser 容易被恶意输入搞挂。jq 提供 6 个 fuzz harness：`jq_fuzz_compile.c` / `jq_fuzz_execute.cpp` / `jq_fuzz_parse.c` / `jq_fuzz_load_file.c` / `jq_fuzz_parse_stream.c` / `jq_fuzz_parse_extended.c`，全部喂 OSS-Fuzz 持续 fuzzing。

**解决方案**：`tests/jq_fuzz_compile.c` 的 `int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size) { char* src = strndup((const char*)data, size); struct jq_state* jq = jq_init(); struct bytecode* bc = jq_compile(jq, src); if (bc) jq_bytecode_free(bc); jq_teardown(&jq); free(src); return 0 }`。OSS-Fuzz 持续 fuzzing 24/7。配合 ASan/MSan/UBSan 编译。

**关键参数**：
- `jq_fuzz_compile.c` 编译期
- `jq_fuzz_execute.cpp` 执行期 C++ wrapper
- `jq_fuzz_parse.c` JSON 解析
- `jq_fuzz_load_file.c` 文件加载
- `jq_fuzz_parse_stream.c` 流式解析
- `jq_fuzz_parse_extended.c` 扩展解析

**最佳实践**：6 个 fuzz harness 覆盖多个面；任何"parser + interpreter"项目可借鉴；OSS-Fuzz 持续 fuzzing 24/7；配合 ASan/MSan/UBSan 编译；CVE 响应快（v1.8.1 4 月修复）。

---

## 第四段：实战范式

### 模式 16 - libjq 嵌入式 API

**问题场景**：jq 不只是 CLI，还是可嵌入 C 库（gojq / pyjq / node-jq / jq.wasm 都基于 libjq）。libjq 公开 API：`jq_init` / `jq_compile` / `jq_start` / `jq_next` / `jq_teardown` + 3 个 callback（`error_cb` / `debug_cb` / `stderr_cb`）。

**解决方案**：`src/jq.h` 公开 API：`typedef void (*jq_msg_cb)(void*, jv)` + `struct jq_state` + `struct jq_state* jq_init(void)` + `void jq_teardown(struct jq_state**)` + `struct bytecode* jq_compile(struct jq_state*, const char*)` + `void jq_start(struct jq_state*, jv)` + `jv jq_next(struct jq_state*)` + `void jq_halt(struct jq_state*, int, const char*)` + `void jq_set_error_cb(struct jq_state*, jq_msg_cb, void*)` + `void jq_set_debug_cb(...)` + `void jq_set_stderr_cb(...)`。

**关键参数**：
- `jq_init` 创建 state
- `jq_compile` 编译 DSL
- `jq_start` 设输入
- `jq_next` 跑一次（迭代器模式）
- `jq_teardown` 释放
- 3 callback 错误/调试/stderr

**最佳实践**：CLI + 库双形态是工具类项目标准；任何"工具类"项目可借鉴；迭代器模式（`jq_next`）便于嵌入；callback 注入比 stderr 灵活；配合 `jq_halt` 优雅退出。

### 模式 17 - gojq + pyjq + node-jq + jq.wasm 多语言绑定

**问题场景**：不同语言用户要 JSON 处理，学 jq DSL 成本高。jq 生态提供多语言绑定：gojq（Go 纯重写）/ pyjq（Python 绑定）/ node-jq（Node 绑定）/ jq.wasm（WebAssembly）。

**解决方案**：生态布局：CLI（`jq` 二进制）+ libjq（C 库）+ gojq（Go 纯重写无 C 依赖）+ pyjq（C 绑定 libjq）+ node-jq（进程调用）+ jq.wasm（浏览器跑）。gojq 完整重写（无 C 依赖）是"摆脱 C 依赖"范例。

**关键参数**：
- `gojq` 完整重写（无 C 依赖）
- `pyjq` C 绑定（libjq）
- `node-jq` 进程调用
- `jq.wasm` 浏览器跑
- 各绑定独立版本避免锁定

**最佳实践**：libjq + 多语言绑定扩大受众；gojq 用纯 Go 重写是"摆脱 C 依赖"范例；任何"工具类"项目可借鉴；WASM 让浏览器跑相同 DSL；各绑定独立版本避免版本锁定。

### 模式 18 - manual + tutorial + FAQ + Discord 完整文档

**问题场景**：DSL 学习曲线陡，纯 API 文档不够。jq 文档站 4 件套：manual（完整参考）/ tutorial（手把手教）/ FAQ（常见问题）/ Discord（实时答疑）。

**解决方案**：`docs/` 目录结构：`docs/manual/` 完整 API 参考 + `docs/tutorial/` 30 分钟上手 + `docs/FAQ.md` 常见问题（null vs missing）+ `docs/content/` jqlang.org 静态站。manual 200+ 内置函数 + 语法，tutorial 30 分钟可上手，FAQ 收录真实社区问题，Discord 实时答疑降低 issue 数量。

**关键参数**：
- `manual` 200+ 内置函数 + 语法
- `tutorial` 30 分钟手把手
- `FAQ` 常见陷阱 null vs missing
- `Discord` 实时答疑

**最佳实践**：4 件套文档是 DSL 项目标配；任何"DSL 项目"可借鉴；tutorial 30 分钟可上手；FAQ 收录真实社区问题；Discord 实时答疑降低 issue 数量。

### 模式 19 - NEWS.md 详细变更日志 + GPG 签名

**问题场景**：v1.5 → v1.6 → v1.7 → v1.8 → v1.8.1 多次升级，breaking change 用户要看到。jq 维护详细 NEWS.md 列出每次变更 + GPG 签名确保 release 真实性。

**解决方案**：`NEWS.md` 节选：`# jq 1.8.1 (2025-04-14)` + `## Bug fixes` + `- Fix heap-use-after-free in jv_object_merge_recursive (CVE-2025-49014)` + `- Fix stack overflow in oniguruma regex (GHSA-f946-j5j2-4w5m)` + `# jq 1.8 (2024-09-13)` + `## Performance` + `- reduce state variable optimization (30% speedup)` + `- SLSA provenance attestation for releases`。28+ 平台二进制覆盖主流 OS。

**关键参数**：
- `NEWS.md` 详细变更日志
- `sig/` GPG 签名目录
- 28+ 平台二进制 Linux/macOS/Windows/BSD
- Docker ghcr.io/jqlang/jq
- Homebrew/apt/dnf 全平台

**最佳实践**：NEWS.md 详细变更是尊重用户；GPG 签名确保 release 真实性；任何"严肃开源"项目可借鉴；CVE 修复要写明 ID；28+ 平台二进制覆盖主流 OS。

### 模式 20 - jqlang 基金会治理

**问题场景**：32k+ Star 是事实标准，治理要中立 + 长期。jq 用 jqlang 基金会 + 核心团队 + GitHub Discussions RFC + Discord 社区。

**解决方案**：治理：jqlang 基金会 + 维护者 @itchyny（主要）+ @wader + 原作者 @stedolan（偶尔参与）+ 社区驱动。流程：GitHub Discussions RFC + NEWS.md 强制 breaking change + AUTHORS 列出贡献者 + KEYS 公开 GPG 公钥。沟通：Discord（discord.gg/yg6yjNmgAC）+ Stack Overflow `jq` tag + GitHub Wiki + Twitter。

**关键参数**：
- Star 32k+
- 维护者 2-3（itchyny/wader）
- License MIT
- 主仓库 jqlang/jq
- Discord 活跃
- 贡献者 200+

**最佳实践**：基金会 + 核心团队 = 中立 + 长期；RFC 流程让大变更先讨论；任何"DSL 大项目"可借鉴；Discord 实时答疑降低 issue 数量；NEWS.md 强制 breaking change 记录。
