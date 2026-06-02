# PHP - Web 解释型语言源码

**GitHub**: php/php-src
**Star**: 38k+
**语言**: C
**主题**: interpreter、php、c、web、jit
**适用场景**: Web 后端、内容管理、电商网站、API 服务

---

## 一、基础范式

### 模式 1 · Zend 引擎 + 字节码执行

**问题场景**：纯解释执行 PHP 太慢，每次都重新解析源码。

**解决方案**：PHP 4+ 引入 Zend 引擎，把 PHP 源码编译为 opcode（字节码），再由 Zend Executor 执行；PHP 8+ 引入 JIT（即时编译）为热点代码生成机器码，性能提升 2-3x。

**关键参数**：
- `Zend/zend_compile.c` 编译
- `Zend/zend_execute.c` 执行
- `Zend/zend_opcode.c` opcode 定义
- `opcache` 缓存 opcode
- PHP 8 JIT 编译

**最佳实践**：所有 PHP 项目都启用 opcache，PHP 8+ 用 JIT 提升 CPU 密集任务性能。

### 模式 2 · SAPI（Server API）抽象

**问题场景**：PHP 要同时支持 Apache / Nginx / CLI / FPM 多种运行环境。

**解决方案**：PHP 用 SAPI（Server API）抽象层，`Zend SAPI` 是接口，`cli` / `cgi` / `fpm-fcgi` / `apache2handler` / `embed` 是 5+ 实现。

**关键参数**：
- `sapi/cli/cli.c` CLI
- `sapi/fpm/` FPM
- `sapi/cgi/cgi_main.c` CGI
- `sapi/apache2handler/` Apache
- `sapi/embed/` 嵌入式

**最佳实践**：Nginx + PHP-FPM 是生产首选，性能 + 隔离最佳。

### 模式 3 · 扩展机制（zend_module）

**问题场景**：需要给 PHP 加新函数 / 类 / 常量（如 Redis 扩展）。

**解决方案**：PHP 提供 Zend Extension API，`zend_module_entry` 结构体注册扩展，`PHP_FUNCTION(php_redis_connect)` 宏声明函数；编译为 `.so` 动态库，`php.ini` 加载。

**关键参数**：
- `zend_module_entry` 结构体
- `PHP_FUNCTION(func_name)` 宏
- `ZEND_BEGIN_ARG_WITH_RETURN_TYPE` 参数
- `php.ini` extension
- Zephir / 编译为 C

**最佳实践**：所有性能关键扩展都用 C 写，Zephir 是 PHP 自身的 C 翻译器。

### 模式 4 · 内存管理（ZendMM）

**问题场景**：长跑 PHP-FPM 进程内存泄漏，频繁分配释放慢。

**解决方案**：Zend Memory Manager（ZendMM）实现内存池，预先分配大块内存（chunk），小分配走 bin slot，避免系统调用；`zend_mm_heap` 跟踪每个请求。

**关键参数**：
- ZendMM chunk 2MB
- bin slot 小分配
- `emalloc` / `efree` 替代 malloc / free
- `zend_mm_heap` 堆
- GC `gc_collect_cycles()`

**最佳实践**：所有 PHP 扩展都用 emalloc / efree，PHP-FPM 配置 `pm.max_requests` 周期性重启防泄漏。

### 模式 5 · 类型系统（v8.x 重写）

**问题场景**：PHP 弱类型难调试，性能优化难。

**解决方案**：PHP 7+ 引入严格类型（`declare(strict_types=1)`）+ 标量类型声明（`int` / `string` / `float` / `bool`）+ 返回类型；PHP 8+ 引入联合类型 + never + readonly + match 表达式。

**关键参数**：
- `declare(strict_types=1)` 严格
- 标量类型 `int` / `string`
- 返回类型 `: void`
- 联合类型 `int|string`
- readonly 修饰符

**最佳实践**：所有新项目 `declare(strict_types=1)`，提升性能 + 类型安全。

---

## 二、扩展范式

### 模式 6 · OPcache 字节码缓存

**问题场景**：每次请求都重新编译 PHP 慢。

**解决方案**：OPcache 扩展把编译后的 opcode 缓存在共享内存，下次请求直接读取，省去编译开销；默认 PHP 5.5+ 内置。

**关键参数**：
- `opcache.enable=1` 启用
- `opcache.memory_consumption=128` MB
- `opcache.max_accelerated_files=10000`
- `opcache.validate_timestamps=1` 调试
- `opcache.jit_buffer_size=64M` JIT

**最佳实践**：所有 PHP-FPM 项目都启用 opcache，性能提升 2-3x。

### 模式 7 · FPM（FastCGI Process Manager）

**问题场景**：传统 mod_php 嵌入 Apache 性能差，无法独立扩展。

**解决方案**：PHP-FPM 是 FastCGI 进程管理器，主进程管理 worker pool（dynamic / static / ondemand 模式），Nginx 通过 FastCGI 协议通信。

**关键参数**：
- `pm = dynamic`
- `pm.max_children = 50`
- `pm.start_servers = 5`
- `pm.min_spare_servers = 5`
- `pm.max_spare_servers = 35`

**最佳实践**：Nginx + PHP-FPM 标配，pm.max_children = CPU 核数 * 2。

### 模式 8 · JIT 编译器（PHP 8+）

**问题场景**：CPU 密集型 PHP 性能差（图像处理 / ML）。

**解决方案**：PHP 8.0 引入实验性 JIT，PHP 8.2+ 稳定；JIT 把热点 opcode 编译为机器码，通过 `opcache.jit` 配置：`tracing` / `function` / `off` 三档。

**关键参数**：
- `opcache.jit=tracing`
- `opcache.jit_buffer_size=64M`
- PHP 8.2 稳定
- 2-3x 性能
- tracing 模式最激进

**最佳实践**：所有 CPU 密集任务开 tracing JIT，节省 50% 时间。

### 模式 9 · Composer + PSR 标准

**问题场景**：PHP 包管理混乱，无标准。

**解决方案**：Composer 是 PHP 官方包管理器，PSR-1 / PSR-4 / PSR-12 是 PHP Framework Interop Group 制定的代码标准；所有现代框架（Laravel / Symfony / Slim）都遵循。

**关键参数**：
- `composer require vendor/pkg`
- PSR-4 自动加载
- `composer.json` 描述
- Packagist 仓库
- SemVer 版本

**最佳实践**：所有 PHP 项目用 Composer + PSR-4 autoloader。

### 模式 10 · Xdebug + 调试生态

**问题场景**：PHP 调试困难，无断点。

**解决方案**：Xdebug 扩展提供断点 / 堆栈跟踪 / 性能分析；PHP 8+ 用 `phpdbg` 轻量调试器；`blackfire` / `Tideways` APM 工具生产级性能分析。

**关键参数**：
- `xdebug.mode=develop` 开发
- `xdebug.start_with_request=yes`
- 断点 / 堆栈
- 性能分析
- APM 集成

**最佳实践**：开发环境开 Xdebug，生产环境用 Tideways / blackfire。

---

## 三、进阶范式

### 模式 11 · 数组实现（HashTable）

**问题场景**：PHP 数组既当 list 又当 dict，实现复杂。

**解决方案**：PHP 数组底层是 HashTable（`zend_array`），同时支持顺序索引和字符串键，packed array 优化（连续整数键）；`Bucket` 结构体存值。

**关键参数**：
- `zend_array` HashTable
- `Bucket` 桶
- packed array
- 双指针
- 8 字节 hash

**最佳实践**：所有 PHP 数组操作都是 HashTable 性能，整数键比字符串键快 30%。

### 模式 12 · 引用计数 + GC

**问题场景**：循环引用导致内存泄漏。

**解决方案**：PHP 用引用计数（`zval.value.refcount`）+ 周期 GC（`gc_collect_cycles()`），数组 / 对象引用计数 +1 为 0 时释放；周期 GC 异步回收循环引用。

**关键参数**：
- `zval` 结构
- `refcount` 引用计数
- `zend_gc` 周期
- `gc_collect_cycles()`
- `gc_disable()`

**最佳实践**：避免循环引用，用 `unset()` 主动释放，PHP-FPM 重启兜底。

### 模式 13 · Swoole / Workerman 协程

**问题场景**：传统 PHP-FPM 同步阻塞，并发能力弱。

**解决方案**：Swoole 用 C 扩展给 PHP 加协程（`go()` / `chan` / `co::run`），单进程支撑 10 万并发；Workerman 是 PHP 实现的协程框架。

**关键参数**：
- Swoole 协程
- `go()` 启动
- `chan` Channel
- `co::run()`
- 单进程 10 万并发

**最佳实践**：高并发服务用 Swoole / Workerman，性能比 PHP-FPM 高 10x。

### 模式 14 · Fiber 协程（PHP 8.1+）

**问题场景**：需要原生协程支持。

**解决方案**：PHP 8.1 引入 Fiber 协程原语，`Fiber::suspend()` / `Fiber::resume()` 切换执行流；`Revolt` / `Amp` 事件循环基于 Fiber。

**关键参数**：
- `new Fiber(callable)`
- `$fiber->resume()` 恢复
- `$fiber->suspend()` 挂起
- PHP 8.1+
- Revolt / Amp

**最佳实践**：所有现代异步框架基于 Fiber + Revolt。

### 模式 15 · Fibers + Fibers Stack

**问题场景**：协程栈切换成本高。

**解决方案**：PHP 8.1 Fiber 用独立 C stack（默认 1MB），每次 resume / suspend 切换栈；大量协程时按需调小 stack 节省内存。

**关键参数**：
- C stack 切换
- 默认 1MB
- 1000+ 协程
- `Fiber::this()` 当前协程
- 调度器

**最佳实践**：所有 async PHP 框架都用 Fiber + 调度器。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 PHP 项目。

**解决方案**：7 件套：① `composer.json` 依赖 ② `public/index.php` 入口 ③ `src/` 业务代码 ④ `config/` 配置 ⑤ `routes/` 路由 ⑥ `vendor/` 依赖目录 ⑦ `Dockerfile` 容器化。

**关键参数**：
- `composer init` 初始化
- `composer require`
- PSR-4 autoloader
- `php -S localhost:8000` dev server
- `php-fpm` 生产

**最佳实践**：所有 PHP 项目用 Composer + PSR-4 标准化目录。

### 模式 17 · Nginx + PHP-FPM 部署

**问题场景**：PHP 怎么部署到生产。

**解决方案**：Nginx 反向代理到 PHP-FPM，`fastcgi_pass unix:/var/run/php-fpm.sock`；PHP-FPM 配置 pool（dynamic / ondemand）；Docker 多阶段构建。

**关键参数**：
- Nginx 配置
- `fastcgi_pass`
- `pm = dynamic`
- `pm.max_children`
- Docker 多阶段

**最佳实践**：所有生产 PHP 都用 Nginx + PHP-FPM + Docker。

### 模式 18 · 性能优化 7 招

**问题场景**：PHP 性能瓶颈。

**解决方案**：7 招优化：① 启用 opcache ② 启用 JIT（PHP 8+） ③ 用 Swoole / Workerman 协程 ④ Composer autoloader 优化 `composer dump-autoload -o` ⑤ 关闭 xdebug ⑥ 启用 PHP 8 预加载 ⑦ 数据库连接池。

**关键参数**：
- opcache
- JIT
- Swoole
- `composer dump-autoload -o`
- 预加载

**最佳实践**：5 招组合，PHP 性能提升 5-10x。

### 模式 19 · 与 Python / Node.js / Go 对比

**问题场景**：后端语言选型在 PHP / Python / Node.js / Go 之间。

**解决方案**：PHP 定位「Web 快速开发 + WordPress / Laravel 生态」适合中小 Web；Python 定位「Django / Flask + 数据科学」适合 ML / Web；Node.js 定位「前后端同语言 + 高并发」适合实时；Go 定位「系统级 + 高性能 + 静态类型」适合微服务。

**关键参数**：
- 性能：Go > Node.js > PHP(JIT) > Python
- Web 生态：PHP > Python > Node.js > Go
- 学习曲线：PHP < Python < Node.js < Go
- 并发：Go > Node.js > Python > PHP(FPM)

**最佳实践**：Web MVP 选 PHP / Laravel，ML 选 Python，实时 API 选 Node.js / Go。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork PHP 做内部脚本语言。

**解决方案**：7 天分 6 步：① Lexer 词法分析 ② Parser 语法分析（recursive descent） ③ AST 抽象语法树 ④ Tree-walking interpreter ⑤ 字节码编译 ⑥ 简单 JIT。

**关键参数**：
- Day 1: Lexer
- Day 2-3: Parser + AST
- Day 4: Tree-walking
- Day 5: Bytecode
- Day 6: JIT
- Day 7: 文档

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 PHP 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\php-src\`
- **大小**: ~200 MB
- **总文件数**: 数千 C 文件
- **关键 commit**: PHP 8.x（稳定）
- **团队**: PHP 核心团队 + 社区
- **许可**: PHP-3.01

## 一句话总结

PHP 用「Zend 引擎 + 字节码执行 + OPcache 缓存 + PHP 8 JIT」让脚本语言也能跑出接近静态语言的性能，是全球 75% Web 站点的事实运行时。
