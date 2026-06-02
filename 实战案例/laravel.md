# laravel - PHP 全栈 Web 框架：11.x 引导式单入口 + Eloquent + Blade

**GitHub**: laravel/laravel
**Star**: 80k+
**语言**: PHP 8.3+
**主题**: fullstack/mvc/orm/queue/blade
**适用场景**: PHP Web 应用 / SaaS / API 后端 / 快速 MVP / 企业后台

```
bootstrap/app.php   # 11.x 单文件引导（4 Kernel 收敛）
app/Models/         # Eloquent ORM
app/Http/Controllers/
app/Console/Commands/
resources/views/    # Blade 模板
routes/web.php + routes/api.php
database/migrations/
config/             # 配置（config:cache 单文件）
```

## 第一段：基础范式

### 模式 1：`Application::configure` 流式引导（单入口收敛）

**问题场景**：Laravel 10 之前有 4 个 Kernel 入口（HTTP/Console/Exceptions/Route），新用户面对 `app/Http/Kernel.php` 里的 `protected $middleware` 数组不知怎么扩展。11.x 之后所有配置收敛到 `bootstrap/app.php` 一个文件。

**解决方案**：`bootstrap/app.php` 用 `Application::configure(basePath: dirname(__DIR__))` 返 fluent builder，链式 `->withRouting()->withMiddleware()->withExceptions()->create()` 配齐 4 大关注点；`health: '/up'` 留容器平台探针。

**关键参数**：
- `basePath` 项目根
- `withRouting(web/commands/health)` 路由
- `withMiddleware(append/alias)` 中间件
- `withExceptions(dontReport/render)` 异常
- `create()` 终端产出

**最佳实践**：Laravel 11+ 新项目**不要**手动建 `app/Http/Kernel.php`；`health: '/up'` 是 k8s/容器平台**必须**保留的探针；中间件 alias 用 kebab-case（`subscribed`）；`dontReport` 列表放"已知业务异常"防 Sentry 刷屏。

---

### 模式 2：`artisan` CLI + Symfony Console

**问题场景**：PHP CLI 工具链没统一标准，每个框架自己造。Laravel 用 Symfony Console 组件 + `artisan` 二进制做统一入口。

**解决方案**：`artisan` 文件 `#!/usr/bin/env php` 启 `LARAVEL_START` 微秒计时 + `require vendor/autoload.php` + `$app = require_once bootstrap/app.php` + `$status = $app->handleCommand(new ArgvInput)` 走 Symfony Console 调度；业务命令继承 `Illuminate\Console\Command` 配 `protected $signature = 'reports:send {--queue=}'`。

**关键参数**：
- `$signature` 命令签名 DSL
- `handle()` 主逻辑返回 int
- `SUCCESS/FAILURE` 标准退出码
- `info()/error()/line()` 彩色输出
- `new ArgvInput` Symfony 解析

**最佳实践**：命令类放 `app/Console/Commands/` 框架自动注册；`artisan list --raw` 看完整签名；长任务加 `WithoutOverlapping` 防并发；`return self::FAILURE` 让 CI 识别失败。

---

### 模式 3：Eloquent ORM + ActiveRecord

**问题场景**：业务要"查 user 拿订单"链式调用，不写 SQL。Laravel 用 Eloquent ORM 提供 ActiveRecord 风格。

**解决方案**：`User extends Model` 用 `$fillable` mass assign 白名单 + `$casts` 类型转换；`hasMany/hasOne/belongsTo/belongsToMany` 4 关联；`with('posts.comments')` 嵌套预加载；`firstOrCreate(['email'=>$e], ['name'=>$n])` upsert。
```php
class User extends Model {
    protected $fillable = ['name', 'email'];  // mass assign 白名单
    protected $casts = ['email_verified_at' => 'datetime'];
    public function posts() { return $this->hasMany(Post::class); }
}
$user = User::with('posts.comments')->find(1);
```

**关键参数**：
- `$fillable` 白名单
- `$guarded` 黑名单
- `$casts` 类型转换
- `$hidden` JSON 隐藏
- `with()` 预加载防 N+1

**最佳实践**：`$fillable` 比 `$guarded` 安全；`User::with('posts.comments')` 嵌套预加载；`Chunk(100, fn() => ...)` 处理万级数据不爆内存；软删除 `use SoftDeletes` 加 `deleted_at` 业务**不**真删。

---

### 模式 4：Blade 模板 + 组件

**问题场景**：业务写 HTML+PHP 混排容易 XSS 漏洞。Laravel 用 Blade 模板 + `{{ }}` 自动转义。

**解决方案**：`@extends('layouts.app')` 布局继承 + `@section('content') ... @endsection` 子模板；`{{ $var }}` 自动 HTML escape；`<x-alert type="success">操作成功</x-alert>` 组件 + slot；`@csrf` form 内必填。

**关键参数**：
- `@extends/section/yield` 布局
- `{{ }}` 自动转义
- `{!! !!}` 不转义（**危险**）
- `@if/@foreach/@for` 控制流
- `<x-alert>` 组件
- `@csrf` 防 CSRF

**最佳实践**：永远用 `{{ }}`，**绝不**用 `{!! !!}` 除非内容已 sanitize；复杂逻辑提到 ViewModel / Livewire 不写在模板；`<x-alert>` 组件替代 `@include`（后者无法传 slot）；`@csrf` 缺则 POST 403。

---

### 模式 5：Service Container + IoC 自动注入

**问题场景**：业务类构造函数要注入数据库/日志/缓存，手动 new 一坨。Laravel 用 IoC 容器自动解析。

**解决方案**：`AppServiceProvider` 的 `register()` 里 `$this->app->bind(PaymentGateway::class, StripeGateway::class)` 绑接口到实现；`singleton(Cache::class, RedisCache::class)` 单例化池/连接；控制器构造函数类型提示自动注入，**不要**手动 `app()->make()`。

**关键参数**：
- `bind(abstract, concrete)` 每次新建
- `singleton(abstract, concrete)` 单例
- `instance(key, obj)` 注入已存在
- `extend(abstract, fn)` 装饰 AOP
- 构造函数类型提示

**最佳实践**：无状态服务用 `bind`；有状态（DB 连接/池）用 `singleton`；接口绑实现 `bind(PaymentGateway::class, StripeGateway::class)`；`app()->bind(...)` 在 `register()` 而**不是** `boot()`；测试时 `app()->instance(...)` 替换 mock。

---

## 第二段：扩展范式

### 模式 6：`Route::resource` 一行 7 路由

**问题场景**：业务要"User 表的增删改查 7 个路由"手写枯燥。Laravel 用 `Route::resource` 一行生成。

**解决方案**：`Route::resource('users', UserController::class)` 自动生成 `index/create/store/show/edit/update/destroy` 7 路由；`->only([...])` 限制、`->except([...])` 排除；`Route::apiResource` 跳过 create/edit 走纯 API；`Route::shallow()` 嵌套不带父 ID。

**关键参数**：
- `Route::resource` 7 路由
- `->only()` / `->except()`
- `->parameters()` 参数名
- `Route::apiResource` 5 路由
- `Route::shallow()` 嵌套

**最佳实践**：API 路由用 `Route::apiResource` 跳过 create/edit；嵌套资源 `Route::resource('users.posts', PostController::class)` 父 ID 必传；`shallow()` 嵌套后 `posts/{post}` 不带 user 减 URL 长度；想加额外动作 `Route::get('users/export', [UserController::class, 'export'])`。

---

### 模式 7：FormRequest 验证（校验和控制器解耦）

**问题场景**：业务要"创建订单时校验字段"，写在 Controller 又胖又难测。Laravel 用 FormRequest 类单独承载。

**解决方案**：`StoreOrderRequest extends FormRequest` 重写 `rules()` 返 `['product_id' => 'required|integer|exists:products,id', ...]` + `authorize()` 调 Policy；控制器方法签名 `store(StoreOrderRequest $request)` 自动校验失败抛 422；`$request->validated()` 只取校验过字段。

**关键参数**：
- `rules()` 校验规则数组
- `authorize()` 权限
- `messages()` 自定义错误
- `validated()` 排除额外字段
- `Rule::unique()->ignore()` 排除自己

**最佳实践**：`rules()` 返数组**不**在 `prepareForValidation` 改原数据；`Rule::unique('users')->ignore($this->user->id)` 排除自己；`authorize()` 调 Policy 集中权限；`validated()` 只取校验过字段防 mass assign 漏洞。

---

### 模式 8：API Resource + Transformer

**问题场景**：业务要"返回 user 但隐藏 password/email_verified_at"。直接 `Model::all()` 会泄露字段。

**解决方案**：`UserResource extends JsonResource` 重写 `toArray($request)` 显式列出字段；`$this->when(!$request->user()?->isAdmin(), $this->email)` 条件字段；`$this->whenLoaded('posts')` 关联预加载后才有；控制器 `return UserResource::collection(User::paginate())`。

**关键参数**：
- `toArray($request)` 序列化
- `$this->when()` 条件
- `$this->whenLoaded()` 关联
- `JsonResource::collection` 列表
- `additional()` 元数据

**最佳实践**：Resource 放 `app/Http/Resources/` 自动发现；`whenLoaded('posts')` 防 N+1 关联未加载返回 404；日期 `toIso8601String()` 给前端 JS 解析；Resource 是**只读** POST 用 Request 而**不是** Resource；改全局包 `JsonResource::wrap('data')` 或 `withoutWrapping()`。

---

### 模式 9：Middleware 洋葱链

**问题场景**：鉴权、CORS、日志、限流横切关注点需要"请求前/响应后"对称处理。

**解决方案**：`CheckApiToken` 中间件 `handle(Request $request, Closure $next)` 在 `$next` 前后各一段逻辑；全局中间件在 `bootstrap/app.php` 的 `withMiddleware` 注册；alias 用 `Route::middleware(['auth', 'subscribed'])` 链式；`terminate($req, $res)` 收尾异步任务。

**关键参数**：
- `handle($request, $next)` 主逻辑
- `$next($request)` 下一个
- `terminate()` 收尾
- `withMiddleware(append/alias)` 注册
- 顺序敏感

**最佳实践**：中间件**总是**在 `$next` 前后各一段（洋葱模型）；全局中间件在 `bootstrap/app.php` 的 `withMiddleware` 注册；异步任务/长连接用 `terminate()` 收尾（响应后才跑）；顺序敏感：CORS 在 auth 之前。

---

### 模式 10：Jobs + Queue 异步任务

**问题场景**：用户下单要发邮件+短信+同步库存，HTTP 响应要 5s+。Laravel 把耗时操作推 Queue。

**解决方案**：`SendOrderEmail implements ShouldQueue` + `use Dispatchable` 派发；`SendOrderEmail::dispatch($order)` 立即派发；`->delay(now()->addMinutes(10))` 延迟；`->chain([new UpdateInventory, ...])` 链式；`public int $tries = 3; public int $backoff = [10, 30, 60]` 重试。

**关键参数**：
- `implements ShouldQueue` 异步
- `dispatch($job)` 派发
- `tries` 重试次数
- `backoff` 重试间隔
- `failed()` 失败回调
- `chain` 链式顺序

**最佳实践**：`ShouldQueue` 接口让 Job 异步**不**实现是 sync；重试 `public int $tries = 3; public int $backoff = [10, 30, 60]`；`failed(Throwable $e)` 写监控告警；`Bus::batch([...])` 批量任务 + 部分失败；worker `php artisan queue:work --tries=3`。

---

## 第三段：进阶范式

### 模式 11：Cache 多驱动 + 标签批量失效

**问题场景**：业务配置/页面片段读多写少，每次 DB 查询慢。Laravel 用 Cache facade 抽象多驱动。

**解决方案**：`Cache::remember('users:all', 600, fn() => User::all())` 写穿透；`Cache::lock('import')->block(10, fn() => doImport())` 分布式锁防并发；`Cache::tags(['users'])->put('user:1', $user, 600)` + `Cache::tags(['users'])->flush()` 批量失效（Redis 专属）。

**关键参数**：
- `put/get` 简单 KV
- `remember` 读穿透
- `forever` 永久
- `lock()` 分布式锁
- `tags()` 分组失效
- 驱动 file/redis/memcached

**最佳实践**：`Cache::remember('key', 600, fn() => DB::table(...)->get())` 一行写穿透；`Cache::lock('import')->block(10, ...)` 防止并发导入；Redis tags 比 file 强 10x 支持批量失效；键 `prefix:resource:id`（`user:1`）易管理；`php artisan cache:clear` 生产**慎用**。

---

### 模式 12：Database Migrations（DB schema 版本化）

**问题场景**：DB schema 在 dev/staging/prod 同步靠手动 `mysqldump`，出错频繁。

**解决方案**：迁移类 `extends Migration` 重写 `up()` 升 + `down()` 降；`Schema::create('users', function (Blueprint $table) { $table->id(); $table->string('email')->unique(); ... })`；`php artisan make:migration create_orders_table` 命令生成；`migrate:rollback --step=1` 回滚。

**关键参数**：
- `up()` 升级必填
- `down()` 回滚必填
- `Schema::create` 建表
- `Blueprint` 列定义 fluent
- `timestamps` / `softDeletes`
- `migrate:fresh` 重建（**生产禁用**）

**最佳实践**：迁移文件名带时间戳 `2026_05_25_create_users_table` 顺序敏感；`up()` 和 `down()` 都要写回滚可逆；加字段用 `make:migration add_status_to_users` 增量改；生产**绝不用** `migrate:fresh` 用 `rollback` + `migrate`；复杂 schema 变更：建新表 → 双写 → 切流量 → 删旧表（4 步法）。

---

### 模式 13：Vite + Tailwind 4 资源构建

**问题场景**：Laravel 之前用 Laravel Mix（webpack），配置复杂。11.x 切到 Vite + Tailwind 4。

**解决方案**：`vite.config.js` 配 `laravel({ input: ['resources/css/app.css', 'resources/js/app.js'], refresh: true })`；CSS `@import "tailwindcss"; @source "../views";` 零配置；`npm run dev` 起 Vite 监听 + `php artisan serve` 跑 PHP；`npm run build` 部署 `public/build/`。

**关键参数**：
- `laravel-vite-plugin` 集成
- `input` 入口多文件
- `refresh: true` HMR
- `@vite(['resources/css/app.css'])` 模板引入
- `npm run build` 生产构建

**最佳实践**：`npm run dev` 起 Vite 监听 + `php artisan serve` 跑 PHP；`npm run build` 部署 `public/build/`；Tailwind 4 零配置 `@import "tailwindcss"` 一行；Vite 5+ 比 Mix 快 5-10x（HMR 即时）；生产**不要**用 `dev` 模式必须 build。

---

### 模式 14：Eager Loading 防 N+1

**问题场景**：循环 100 个用户，每个 user 查 posts，是 1 + 100 = 101 次查询。

**解决方案**：`User::with('posts.comments')->get()` 嵌套预加载；`$user->load('posts')` 已查后追加预加载；`User::withCount('posts')->get()` 只要计数；`User::with(['posts' => fn($q) => $q->where('status', 'published')])->get()` 条件预加载；`Model::preventLazyLoading(!app()->isProduction())` 开发期抛错。

**关键参数**：
- `with()` 预加载
- `load()` 已查后预加载
- `withCount()` 计数
- `preventLazyLoading` 抛错
- `$with` Model 默认预加载

**最佳实践**：`User::with('posts.comments')` 嵌套预加载；`User::withCount('posts')->get()` 只要计数；`Model::preventLazyLoading(!$isProduction)` 生产前默认开；API Resource `whenLoaded()` 配合未预加载不返回；`$with = ['posts']` Model 属性**小心** N+1 反向。

---

### 模式 15：`php artisan optimize` 缓存（IO 延迟降 30-50%）

**问题场景**：Laravel 启动要 `bootstrap/cache/services.php` 等几十个文件，IO 延迟高。

**解决方案**：`composer install --no-dev --optimize-autoloader` + `php artisan config:cache`（配置单文件）+ `route:cache`（路由单文件）+ `view:cache`（Blade 编译）+ `event:cache`（EventServiceProvider 反射）；部署一行 `php artisan optimize` 一键全跑；`optimize:clear` 一键清空。

**关键参数**：
- `config:cache` 配置缓存
- `route:cache` 路由缓存（不支持闭包）
- `view:cache` 视图预编译
- `event:cache` 事件缓存
- `optimize` 一键全跑
- `optimize:clear` 一键清空

**最佳实践**：**生产**必跑 `php artisan optimize` 延迟降 30-50%；路由有闭包**不能**用 `route:cache` 改成 Controller 方法；开发**不要**开缓存改代码不生效要 `optimize:clear`；CI/CD `composer install` → `optimize` → 重启 PHP-FPM；监控 `bootstrap/cache/*.php` mtime 部署时间戳。

---

## 第四段：实战范式

### 模式 16：PHPUnit + Feature/Unit 分离

**问题场景**：业务混写单元和功能测试，慢且难定位。Laravel 分 `tests/Feature` 和 `tests/Unit`。

**解决方案**：`tests/Feature/UserRegistrationTest extends TestCase` 用 `$this->post('/register', [...])` 模拟 POST + `assertStatus(302)` + `assertDatabaseHas('users', ['email' => 'john@example.com'])`；`tests/Unit/OrderTotalTest` 纯逻辑快；`RefreshDatabase` trait 隔离每次测试清库；`actingAs($user)` 模拟登录。

**关键参数**：
- `tests/Feature` HTTP 集成
- `tests/Unit` 纯逻辑
- `$this->post()` 模拟 POST
- `assertStatus/assertDatabaseHas`
- `RefreshDatabase` 隔离
- `actingAs($user)` 模拟登录

**最佳实践**：Feature 测试用 SQLite 内存库比 MySQL 快 10x；慢的外部 API 用 `Http::fake()` 拦截；`RefreshDatabase` trait 隔离每次测试；CI 跑 `php artisan test --parallel`（PHPUnit 10+）；Pest 替代 PHPUnit 链式断言更简洁。

---

### 模式 17：Horizon + Queue 监控

**问题场景**：业务派发 1000 个 Job 到队列，怎么知道哪些失败、卡在哪个 worker？

**解决方案**：`config/horizon.php` 配 `environments.production.supervisor-default` 含 `connection: redis` + `queue: ['default']` + `balance: auto` + `maxProcesses: 10` + `minProcesses: 1`；`php artisan horizon` 跑多进程 supervisor；`/horizon` dashboard 监控；`horizon:terminate` 优雅停服。

**关键参数**：
- `horizon` 多进程 supervisor
- `balance: auto` 负载均衡
- `maxProcesses` 进程数
- `maxTime` 进程最大运行
- `memory` 内存限制
- `wait` 空闲退出时间

**最佳实践**：生产**用 Horizon 不用 queue:work** 多进程 + 监控面板；`balanceMaxShift` + `balanceCooldown` 配负载均衡；`tries=3` + `backoff=[10,30,60]` 失败重试；Supervisor 进程崩溃自动重启 `supervisor` + `horizon.conf`；`horizon:status` cron 每分钟挂了告警。

---

### 模式 18：Forge / Vapor 商业部署

**问题场景**：自建 PHP-FPM + Nginx 集群要做版本升级、SSL 自动续期、监控告警，运维成本高。Laravel 官方有 **Laravel Forge**（传统服务器）和 **Vapor**（serverless）。

**解决方案**：Forge 提供 DigitalOcean/Linode/AWS EC2 一键 provision + Let's Encrypt 自动 SSL + 推送 GitHub 自动部署 + 监控告警；Vapor 是 AWS Lambda 部署 + `vapor.yml` 配置 `memory: 1024 / cli-memory: 512 / queue: true / database: my-app-db / cache: my-app-cache` + `vapor deploy production` 一键发布。

**关键参数**：
- Forge 传统 VPS 自动化
- Vapor AWS Lambda 按请求
- Envoyer 零停机部署
- Nova Admin 后台
- Pulse 性能监控
- Breeze/Jetstream 认证脚手架

**最佳实践**：小团队用 Forge 起步比 K8s 简单 10x；大流量用 Vapor 按需计费省 80%；Nova 写 Admin 后台比自建快 5x；Pulse 监控 SQL/Queue 慢查询免费自托管；Breeze/Jetstream 替代 `make:auth`（已废弃）。

---

### 模式 19：Laravel 11/12 精简目录

**问题场景**：Laravel 10 有 4 个 Kernel 入口（`app/Http/Kernel.php` / `app/Console/Kernel.php` / `app/Providers/RouteServiceProvider.php` / `app/Exceptions/Handler.php`）。11.x 全部下沉到 `bootstrap/app.php`。

**解决方案**：`bootstrap/app.php` 用 `Application::configure()->withMiddleware(function (Middleware $middleware) { $middleware->web(append: [...]); $middleware->alias(['auth' => Authenticate::class]); })->create()` 链式配齐；老项目升级用 Laravel Shift（付费）自动化迁移；`make:middleware` 仍生成 `app/Http/Middleware/`。

**关键参数**：
- 11.x 砍 4 个 Kernel
- 12.x 引入 Reverb WebSocket
- 13.x PHP 8.3+ 强制
- `bootstrap/app.php` 单文件
- `php artisan make:middleware`

**最佳实践**：新项目用 12.x/13.x **不要**学老 Kernel 结构；老项目升级用 Laravel Shift 自动化迁移；`bootstrap/app.php` 是**单文件**找配置不用翻 4 处；`make:middleware` 仍生成 `app/Http/Middleware/`；升级前看 UPGRADE.md 每版本都有破坏性变更清单。

---

### 模式 20：测试覆盖率 + CI 矩阵（多 PHP 版本兼容）

**问题场景**：业务代码要在 PHP 8.3/8.4/8.5 三版本 + Laravel 11/12/13 矩阵下测。Laravel 骨架自带 `.github/workflows/tests.yml`。

**解决方案**：`.github/workflows/tests.yml` 配 `matrix.php: ['8.3', '8.4', '8.5']` + `matrix.dependency-version: [prefer-lowest, prefer-stable]`；`shivammathur/setup-php@v2` 装 PHP + xdebug 覆盖率；`php artisan test --coverage-clover=coverage.xml` 写报告；`codecov/codecov-action@v3` 上传；`fail-fast: false` 失败继续看全矩阵。

**关键参数**：
- `matrix.php` PHP 版本矩阵
- `dependency-version` 最低/稳定
- `coverage-clover` 覆盖率 XML
- `codecov-action` 覆盖率上传
- `parallel` 并行测试
- `fail-fast: false` 失败继续

**最佳实践**：Laravel 骨架 CI 矩阵默认 3 PHP 版本直接用；`prefer-lowest` 测最低依赖版本抓错版本不兼容；`xdebug` 覆盖率只 CI 装本地不要；并行 `php artisan test --parallel` 4 核 4x 加速；Codecov/Scrutinizer 覆盖率徽章放 README。

---

## 关键代码段

```php
// bootstrap/app.php — 11.x 单入口
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',  // k8s 探针
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->web(append: [VerifyCsrfToken::class]);
        $middleware->alias(['subscribed' => EnsureSubscribed::class]);
    })
    ->create();

// Eloquent + Resource
$user = User::with('posts.comments')->find(1);
return UserResource::collection(User::paginate());
```

## 必偷 3 件

1. **`Application::configure` 流式单入口**：11.x 砍 4 个 Kernel 收敛到 `bootstrap/app.php` 一个文件；链式 4 大关注点；`health: '/up'` 必留容器探针。
2. **Service Container + IoC 构造注入**：`bind/singleton/instance/extend` 4 件套；接口绑实现 + 装饰 AOP；测试 mock `app()->instance()`。
3. **Eloquent + FormRequest + API Resource 三件套**：mass assign `$fillable` + 校验下沉 FormRequest + Resource 显式字段防泄露。

## 必避 3 坑

1. **不要用 `{!! $var !!}`**——XSS 漏洞；永远 `{{ }}` 自动转义。
2. **不要循环里 `User::find($id)`**——N+1 性能问题；用 `with('posts.comments')` 预加载。
3. **不要在生产 `migrate:fresh`**——删表清数据；用 `rollback --step=1` + `migrate` 增量。
