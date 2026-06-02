# laravel · ABL 模式速查（Amazon Builders' Library Style）

> Laravel 是 Taylor Otwell 维护的 PHP 全栈 Web 框架，官方骨架 `laravel/laravel`（当前 v13.8.0）是"开箱即用"的应用模板。本文按"问题场景 → 解决方案 → 关键参数 → 最佳实践"格式整理 20 个核心模式。

---

## 一、核心原理：bootstrap/app.php 引导流

### 模式 1：`Application::configure` fluent builder（解决"目录瘦身 + 单入口"）

**问题场景**：Laravel 10 之前有 4 个 Kernel 入口（HTTP/Console/Exceptions/Route），新用户面对 `app/Http/Kernel.php` 里的 `protected $middleware = [...]` 数组不知怎么扩展。11.x 之后所有配置收敛到 `bootstrap/app.php` 一个文件。

**解决方案代码**：

```php
// bootstrap/app.php
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->web(append: [
            \App\Http\Middleware\VerifyCsrfToken::class,
        ]);
        $middleware->alias([
            'subscribed' => \App\Http\Middleware\CheckSubscription::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->dontReport(\App\Exceptions\BenignException::class);
        $exceptions->render(function (\Throwable $e, $request) {
            return response()->view('errors.500', [], 500);
        });
    })->create();
```

**关键参数表**：

| 名称 | 作用 | 默认值 |
|------|------|--------|
| `basePath` | 项目根目录 | `dirname(__DIR__)` |
| `withRouting` | 路由配置 | web/commands/api |
| `web` | Web 路由文件 | `routes/web.php` |
| `commands` | CLI 路由 | `routes/console.php` |
| `health` | 健康检查 | `/up` |
| `withMiddleware` | 中间件配置 | append/prepend/alias |
| `withExceptions` | 异常配置 | report/render |

**最佳实践**：
- ✅ Laravel 11+ 新项目**不要**手动创建 `app/Http/Kernel.php`——所有配置走 `bootstrap/app.php`。
- ✅ `health: '/up'` 是 k8s/容器平台健康检查路径——**必须**保留。
- ✅ 中间件 alias 用 kebab-case 命名（`subscribed`），路由里 `->middleware('subscribed')`。
- ✅ `dontReport` 列表放"已知业务异常"——Sentry 等监控不会刷屏。
- ✅ `render` 闭包最后接 `production` 环境统一返回 JSON/HTML。

---

### 模式 2：`artisan` CLI + Symfony Console（解决"命令行入口统一"）

**问题场景**：PHP CLI 工具链没统一标准，每个框架自己造。Laravel 用 Symfony Console 组件 + `artisan` 二进制。

**解决方案代码**：

```php
// artisan
#!/usr/bin/env php
<?php
use Symfony\Component\Console\Input\ArgvInput;
define('LARAVEL_START', microtime(true));
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$status = $app->handleCommand(new ArgvInput);
exit($status);
// 业务命令
namespace App\Console\Commands;
use Illuminate\Console\Command;
class SendReports extends Command
{
    protected $signature = 'reports:send {--queue=}';
    public function handle(): int
    {
        $this->info('Sending...');
        return self::SUCCESS;
    }
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `protected $signature` | 命令签名 | `name:action {arg} {--opt=}` |
| `handle()` | 主逻辑 | 返回 int 退出码 |
| `SUCCESS/FAILURE` | 标准退出码 | 常量 |
| `info()/error()/line()` | 输出 | 颜色 + 状态 |
| `new ArgvInput` | CLI 参数解析 | Symfony |
| `handleCommand` | 框架入口 | 返回 int |

**最佳实践**：
- ✅ 命令类放 `app/Console/Commands/`，框架自动注册。
- ✅ `artisan list` 看所有命令，`artisan list --raw` 完整签名。
- ✅ 长任务用 `WithoutOverlapping` 中间件防并发。
- ✅ `return self::FAILURE` 让 CI 脚本识别失败。
- ✅ `protected $hidden = true` 隐藏命令不显示在 list。

---

### 模式 3：Eloquent ORM + ActiveRecord（解决"SQL 写在 Model 里"）

**问题场景**：业务要"查 user 拿订单"链式调用，不写 SQL。Laravel 用 Eloquent ORM 提供 ActiveRecord 风格。

**解决方案代码**：

```php
// app/Models/User.php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
class User extends Model
{
    protected $fillable = ['name', 'email'];  // mass assign 白名单
    protected $casts = ['email_verified_at' => 'datetime'];
    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }
}
// 使用
$user = User::find(1);
$posts = $user->posts()->where('status', 'published')->get();
// 关联预加载（N+1 杀手）
$users = User::with('posts.comments')->get();
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `$fillable` | mass assign 白名单 | 防 SQL 注入 |
| `$guarded` | 黑名单 | 反义 |
| `$casts` | 类型转换 | `'json_field' => 'array'` |
| `$hidden` | JSON 隐藏字段 | 密码 |
| `hasMany` | 一对多 | 返回 HasMany |
| `belongsTo` | 反向 | 外键在子表 |
| `with()` | 预加载 | 防 N+1 |

**最佳实践**：
- ✅ `$fillable` 比 `$guarded` 安全——明确列出允许字段。
- ✅ `User::with('posts')` 预加载避免 N+1 查询。
- ✅ `firstOrCreate(['email' => $email], ['name' => $name])` upsert。
- ✅ `Chunk(100, fn($users) => ...)` 处理万级数据不爆内存。
- ✅ 软删除 `use SoftDeletes` 加 `deleted_at` 字段，业务**不**真删。

---

### 模式 4：Blade 模板 + 组件（解决"前后端耦合"）

**问题场景**：业务写 HTML+PHP 混排容易 XSS 漏洞。Laravel 用 Blade 模板 + `{{ }}` 自动转义。

**解决方案代码**：

```php
// resources/views/welcome.blade.php
@extends('layouts.app')
@section('content')
    <h1>{{ $title }}</h1>
    @foreach ($users as $user)
        <p>{{ $user->name }}</p>
    @endforeach
    @auth
        <a href="/logout">Logout</a>
    @endauth
@endsection
// 组件：resources/views/components/alert.blade.php
<div class="alert alert-{{ $type }}">
    {{ $slot }}
</div>
// 使用
<x-alert type="success">操作成功</x-alert>
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `@extends/section/yield` | 布局继承 | 主-子模板 |
| `{{ $var }}` | 自动转义 | 防 XSS |
| `{!! $var !!}` | 不转义 | **危险** |
| `@if/@foreach/@for` | 控制流 | Blade 指令 |
| `@auth/@guest` | 认证状态 | 中间件需 `auth` |
| `<x-alert>` | 组件 | 类名 kebab |
| `@csrf` | CSRF token | form 内必备 |

**最佳实践**：
- ✅ 永远用 `{{ }}`，**绝不**用 `{!! !!}` 除非内容已 sanitize。
- ✅ 复杂逻辑提到 ViewModel / Livewire，**不要**写在模板里。
- ✅ 静态缓存用 `@cache('key', 60)` 指令（Vite + Redis 配合）。
- ✅ `<x-alert>` 组件替代 `@include`——后者无法传 slot。
- ✅ `@csrf` 在 form 必填，否则 POST 403。

---

### 模式 5：Service Container + IoC（解决"依赖注入自动解析"）

**问题场景**：业务类构造函数要注入数据库/日志/缓存，手动 new 一坨。Laravel 用 IoC 容器自动解析。

**解决方案代码**：

```php
// app/Providers/AppServiceProvider.php
namespace App\Providers;
use Illuminate\Support\ServiceProvider;
use App\Services\PaymentGateway;
class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(PaymentGateway::class, StripeGateway::class);
        $this->app->singleton(Cache::class, RedisCache::class);
    }
}
// 自动注入
class OrderController extends Controller
{
    public function __construct(
        protected PaymentGateway $payments,
        protected Cache $cache,
    ) {}
    public function store(Request $request)
    {
        $charge = $this->payments->charge($request->amount);
        return response()->json(['id' => $charge->id]);
    }
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `bind(abstract, concrete)` | 每次新建 | 无状态服务 |
| `singleton(abstract, concrete)` | 单例 | 池/连接 |
| `instance(key, obj)` | 注入已存在对象 |  |
| `bindMethod` | 绑定方法 |  |
| `tag(abstract, tags)` | 标签 | 批量获取 |
| `extend(abstract, fn)` | 装饰 | AOP |

**最佳实践**：
- ✅ 无状态服务用 `bind`，有状态（DB 连接/池）用 `singleton`。
- ✅ 构造函数类型提示自动注入，**不要**手动 `app()->make()`。
- ✅ 接口绑定到实现：`bind(PaymentGateway::class, StripeGateway::class)`。
- ✅ `app()->bind(...)` 在 ServiceProvider 的 `register()`，**不要**在 `boot()`。
- ✅ 测试时 `app()->instance(...)` 替换 mock。

---

## 二、架构设计：路由、控制器、请求响应

### 模式 6：`routes/web.php` + Resource Controller（解决"CRUD 一行写完"）

**问题场景**：业务要"User 表的增删改查 7 个路由"手写枯燥。Laravel 用 `Route::resource` 一行生成。

**解决方案代码**：

```php
// routes/web.php
use App\Http\Controllers\UserController;
Route::resource('users', UserController::class);
// 生成 7 个路由
// GET    /users              index
// GET    /users/create       create
// POST   /users              store
// GET    /users/{user}       show
// GET    /users/{user}/edit  edit
// PUT    /users/{user}       update
// DELETE /users/{user}       destroy
// 限制：Route::resource('users', UserController::class)->only(['index', 'show']);
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `Route::resource` | 7 个标准路由 | RESTful |
| `->only([...])` | 限制 | 减少暴露 |
| `->except([...])` | 排除 |  |
| `->parameters([...])` | 参数名 | 默认 `user` |
| `Route::apiResource` | 5 个（无 create/edit） | API |
| `Route::shallow()` | 嵌套路由 | 子资源不带父 ID |

**最佳实践**：
- ✅ API 路由用 `Route::apiResource` 跳过 create/edit（返回 HTML 表单）。
- ✅ `Route::resource` 会自动加 `->where('user', '[0-9]+')` 正则吗？**不会**，手动 `->whereAlphaNumeric('user')`。
- ✅ 嵌套资源 `Route::resource('users.posts', PostController::class)`——父 ID 必传。
- ✅ `shallow()` 嵌套后 `posts/{post}` 不带 user——减少 URL 长度。
- ✅ 想加额外动作：`Route::get('users/export', [UserController::class, 'export'])`。

---

### 模式 7：FormRequest 验证（解决"校验逻辑和控制器解耦"）

**问题场景**：业务要"创建订单时校验字段"，写在 Controller 又胖又难测。Laravel 用 FormRequest 类单独承载。

**解决方案代码**：

```php
// app/Http/Requests/StoreOrderRequest.php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool { return $this->user()->can('create', Order::class); }
    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100'],
            'address' => ['required', 'string', 'max:500'],
        ];
    }
}
// Controller
public function store(StoreOrderRequest $request)
{
    $order = Order::create($request->validated());
    return response()->json($order, 201);
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `rules()` | 校验规则 | 数组 |
| `authorize()` | 权限 | 默认 true |
| `messages()` | 自定义错误消息 |  |
| `attributes()` | 字段名 | 错误消息用 |
| `validated()` | 取校验后数据 | 排除额外字段 |
| `failedValidation` | 校验失败抛错 | 422 |

**最佳实践**：
- ✅ `rules()` 返回数组，**不**要在 `prepareForValidation` 里改原数据。
- ✅ `Rule::unique('users')->ignore($this->user->id)` 排除自己。
- ✅ `authorize()` 调 Policy——集中权限点。
- ✅ 自定义规则：`php artisan make:rule ValidPhone`。
- ✅ `validated()` 只取校验过的字段——防 mass assign 漏洞。

---

### 模式 8：API Resource + Transformer（解决"JSON 字段过滤"）

**问题场景**：业务要"返回 user 但隐藏 password/email_verified_at"。直接 `Model::all()` 会泄露字段。

**解决方案代码**：

```php
// app/Http/Resources/UserResource.php
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;
class UserResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->when(!$request->user()?->isAdmin(), $this->email),
            'created_at' => $this->created_at->toIso8601String(),
            'posts' => PostResource::collection($this->whenLoaded('posts')),
        ];
    }
}
// Controller
return UserResource::collection(User::paginate());
// 单个：return new UserResource($user);
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `toArray($request)` | 序列化 | 返回 array |
| `$this->when()` | 条件字段 | false 隐藏 |
| `$this->whenLoaded()` | 关联预加载后才有 | 404 if not loaded |
| `JsonResource::collection` | 列表 | 自动包 `data` |
| `additional()` | 元数据 |  |
| `withResponse()` | 自定义 status |  |

**最佳实践**：
- ✅ Resource 类放 `app/Http/Resources/`——自动发现。
- ✅ `whenLoaded('posts')` 防 N+1——关联未加载返回 404。
- ✅ 日期用 `toIso8601String()` 给前端 JS 解析。
- ✅ Resource 是**只读**——POST 用 Request 而**不是** Resource。
- ✅ 改全局包：`JsonResource::wrap('data')` 或 `->withoutWrapping()`。

---

### 模式 9：Middleware 洋葱链（解决"请求/响应双向处理"）

**问题场景**：鉴权、CORS、日志、限流横切关注点需要"请求前/响应后"对称处理。

**解决方案代码**：

```php
// app/Http/Middleware/CheckApiToken.php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
class CheckApiToken
{
    public function handle(Request $request, Closure $next)
    {
        if (!$request->bearerToken()) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }
        // 请求前
        $response = $next($request);
        // 响应后
        $response->headers->set('X-Token-Used', '1');
        return $response;
    }
}
// 路由用法
Route::middleware(['auth', 'subscribed'])->group(function () {
    Route::get('/premium', ...);
});
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `handle($request, $next)` | 主逻辑 | 必填 |
| `$next($request)` | 下一个 | 必须返回 |
| Termiable | 响应后 | 旧版机制 |
| `->terminate()` | 收尾 | 单独方法 |
| 优先级 | 数组顺序 |  |
| alias | 'auth'/'subscribed' |  |

**最佳实践**：
- ✅ 中间件**总是**在 `$next` 前后各一段——洋葱模型。
- ✅ 全局中间件在 `bootstrap/app.php` 的 `withMiddleware` 注册。
- ✅ 异步任务/长连接用 `terminate()` 收尾（响应后才跑）。
- ✅ `Illuminate\Auth\Middleware\Authenticate` 是默认 auth。
- ✅ 顺序敏感：cors 在 auth 之前。

---

### 模式 10：Jobs + Queue 异步任务（解决"邮件发送阻塞 HTTP 响应"）

**问题场景**：用户下单要发邮件+短信+同步库存，HTTP 响应要 5s+。Laravel 把耗时操作推 Queue。

**解决方案代码**：

```php
// app/Jobs/SendOrderEmail.php
namespace App\Jobs;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
class SendOrderEmail implements ShouldQueue
{
    use Dispatchable;
    public function __construct(public Order $order) {}
    public function handle(): void
    {
        Mail::to($this->order->user)->send(new OrderShipped($this->order));
    }
}
// 派发
SendOrderEmail::dispatch($order);
// 延迟
SendOrderEmail::dispatch($order)->delay(now()->addMinutes(10));
// 链式
SendOrderEmail::dispatch($order)->chain([
    new UpdateInventory($order),
    new NotifyWarehouse($order),
]);
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `implements ShouldQueue` | 异步 | 默认 sync |
| `dispatch($job)` | 派发 | 立即或延迟 |
| `tries` | 重试次数 | 默认 1 |
| `backoff` | 重试间隔 | 数组或秒数 |
| `timeout` | 单次超时 | 秒 |
| `failed()` | 失败回调 |  |
| `chain` | 链式 | 顺序执行 |

**最佳实践**：
- ✅ `ShouldQueue` 接口让 Job 异步——**不**实现是 sync。
- ✅ 重试用 `public int $tries = 3; public int $backoff = [10, 30, 60];`。
- ✅ 失败回调 `failed(Throwable $e)` 写监控告警。
- ✅ `Bus::batch([...])` 批量任务 + 部分失败处理。
- ✅ 队列 worker：`php artisan queue:work --tries=3`。

---

## 三、性能优化：缓存、查询与构建

### 模式 11：Cache 多驱动（解决"读多写少场景加速"）

**问题场景**：业务配置/页面片段读多写少，每次 DB 查询慢。Laravel 用 Cache facade 抽象多驱动。

**解决方案代码**：

```php
use Illuminate\Support\Facades\Cache;
// 简单存
Cache::put('key', 'value', 600);  // 10 分钟
Cache::remember('users:all', 600, fn() => User::all());
// 永久
Cache::forever('config', $config);
// 原子操作
Cache::lock('import')->block(10, fn() => doImport());
// 标记批量失效
Cache::tags(['users'])->put('user:1', $user, 600);
Cache::tags(['users'])->flush();
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `put/get` | 简单 KV | 字符串/对象 |
| `remember` | 读穿透 | 缓存优先 |
| `add` | 存在则失败 | 锁 |
| `forever` | 永久 | 直到手动 forget |
| `lock()` | 分布式锁 | 防并发 |
| `tags()` | 分组 | Redis 专属 |
| 驱动 | file/redis/memcached | .env 配 |

**最佳实践**：
- ✅ `Cache::remember('key', 600, fn() => DB::table(...)->get())` 一行写穿透。
- ✅ `Cache::lock('import')->block(10, fn() => doImport())` 防止并发导入。
- ✅ Redis tags 比 file 驱动强 10x（支持批量失效）。
- ✅ 缓存键用 `prefix:resource:id` 格式（`user:1`）——易管理。
- ✅ `php artisan cache:clear` 清空——**生产**慎用。

---

### 模式 12：Database Migrations（解决"DB schema 版本化"）

**问题场景**：DB schema 在 dev/staging/prod 同步靠手动 `mysqldump`，出错频繁。

**解决方案代码**：

```php
// database/migrations/2026_05_25_000000_create_users_table.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamps();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
// 命令
// php artisan make:migration create_orders_table
// php artisan migrate
// php artisan migrate:rollback --step=1
// php artisan migrate:fresh  // 危险：清空重跑
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `up()` | 升级 | 必填 |
| `down()` | 回滚 | 必填 |
| `Schema::create` | 建表 |  |
| `Blueprint` | 列定义 | fluent |
| `timestamps` | created_at/updated_at |  |
| `softDeletes` | deleted_at |  |
| `migrate:fresh` | 重建 | **生产**禁用 |

**最佳实践**：
- ✅ 迁移文件名带时间戳——`2026_05_25_create_users_table` 顺序敏感。
- ✅ `up()` 和 `down()` 都要写——回滚可逆。
- ✅ 加字段用 `php artisan make:migration add_status_to_users` 增量改。
- ✅ 生产**绝不用** `migrate:fresh`——用 `migrate:rollback` + `migrate`。
- ✅ 复杂 schema 变更：建新表 → 双写 → 切流量 → 删旧表（4 步法）。

---

### 模式 13：Vite + Tailwind 4 资源构建（解决"前后端构建工具统一"）

**问题场景**：Laravel 之前用 Laravel Mix（webpack），配置复杂。11.x 切到 Vite + Tailwind 4。

**解决方案代码**：

```js
// vite.config.js
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js'],
            refresh: true,
        }),
    ],
});
// resources/css/app.css
@import "tailwindcss";
@source "../views";
// 命令
// npm run dev
// npm run build
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `laravel-vite-plugin` | 集成 | npm |
| `input` | 入口 | 多入口 |
| `refresh: true` | HMR | 开发热更新 |
| `@vite(['resources/css/app.css'])` | 模板引入 | Blade |
| `npm run build` | 生产构建 | 静态资源 |
| `manifest.json` | 入口映射 | 自动生成 |

**最佳实践**：
- ✅ `npm run dev` 起 Vite 监听——`php artisan serve` 跑 PHP。
- ✅ `npm run build` 后部署 `public/build/` 目录。
- ✅ Tailwind 4 零配置：`@import "tailwindcss"` 一行。
- ✅ Vite 5+ 比 Mix 快 5-10x（HMR 即时）。
- ✅ 生产**不要**用 `dev` 模式——必须 build。

---

### 模式 14：Eager Loading 防 N+1（解决"100 个用户 101 次查询"）

**问题场景**：循环 100 个用户，每个 user 查 posts，是 1 + 100 = 101 次查询。

**解决方案代码**：

```php
// 差：N+1
$users = User::all();
foreach ($users as $user) {
    echo $user->posts->count();  // 每用户 1 次查询
}
// 好：预加载
$users = User::with('posts')->get();
foreach ($users as $user) {
    echo $user->posts->count();  // 0 次（已加载）
}
// 嵌套
$users = User::with('posts.comments')->get();
// 条件预加载
User::with(['posts' => fn($q) => $q->where('status', 'published')])->get();
// 防止懒加载（开发期）
Model::preventLazyLoading(!app()->isProduction());
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `with()` | 预加载 | 1 + 1 查询 |
| `load()` | 已查后预加载 | `$user->load('posts')` |
| `withCount()` | 计数 | 不加载数据 |
| `lazyEagerLoad` | 防 N+1 | 全局 |
| `preventLazyLoading` | 抛错 | dev 环境 |
| `$with` Model 属性 | 总是预加载 | 默认关联 |

**最佳实践**：
- ✅ `User::with('posts.comments')` 嵌套预加载。
- ✅ `User::withCount('posts')->get()` 只要计数。
- ✅ `Model::preventLazyLoading(!$isProduction)` 生产前默认开。
- ✅ API Resource `whenLoaded()` 配合——未预加载不返回。
- ✅ `$with = ['posts']` Model 属性——总是预加载（小心 N+1 反向）。

---

### 模式 15：`php artisan optimize` 缓存（解决"每次请求 50+ 文件 require"）

**问题场景**：Laravel 启动要 `bootstrap/cache/services.php` 等几十个文件，IO 延迟高。

**解决方案代码**：

```php
// 部署流程
composer install --no-dev --optimize-autoloader
php artisan config:cache     // config/*.php → 单文件
php artisan route:cache      // routes/*.php → 单文件
php artisan view:cache       // Blade → 编译后 PHP
php artisan event:cache      // EventServiceProvider
// 部署结束一行
php artisan optimize
// 清缓存（开发期）
php artisan optimize:clear
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `config:cache` | 配置缓存 | 单文件 |
| `route:cache` | 路由缓存 | 不支持闭包 |
| `view:cache` | 视图预编译 | Blade → PHP |
| `event:cache` | 事件缓存 | 反射缓存 |
| `optimize` | 一键全跑 | CI/CD 用 |
| `optimize:clear` | 一键清空 | 部署后回滚 |

**最佳实践**：
- ✅ **生产**必跑 `php artisan optimize`——延迟降 30-50%。
- ✅ 路由有闭包不能用 `route:cache`——改成 Controller 方法。
- ✅ 开发**不要**开缓存——改代码不生效要 `optimize:clear`。
- ✅ CI/CD 步骤：`composer install` → `optimize` → 重启 PHP-FPM。
- ✅ 监控 `bootstrap/cache/*.php` 文件 mtime——部署时间戳。

---

## 四、可靠性与生态：测试、监控与治理

### 模式 16：PHPUnit + Feature/Unit 分离（解决"测试金字塔"）

**问题场景**：业务混写单元和功能测试，慢且难定位。Laravel 分 `tests/Feature` 和 `tests/Unit`。

**解决方案代码**：

```php
// tests/Feature/UserRegistrationTest.php
namespace Tests\Feature;
use Tests\TestCase;
class UserRegistrationTest extends TestCase
{
    public function test_user_can_register(): void
    {
        $response = $this->post('/register', [
            'name' => 'John',
            'email' => 'john@example.com',
            'password' => 'password',
        ]);
        $response->assertStatus(302);
        $this->assertDatabaseHas('users', ['email' => 'john@example.com']);
    }
}
// tests/Unit/OrderTotalTest.php
class OrderTotalTest extends TestCase
{
    public function test_total_with_tax(): void
    {
        $order = new Order(['subtotal' => 100]);
        $this->assertEquals(113, $order->totalWithTax(0.13));
    }
}
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `tests/Feature` | HTTP 集成 | 慢但全面 |
| `tests/Unit` | 纯逻辑 | 快 |
| `$this->post()` | 模拟 POST |  |
| `assertStatus(302)` | 状态码 |  |
| `assertDatabaseHas` | DB 断言 | SQLite 内存 |
| `RefreshDatabase` | 每次清库 | 隔离 |
| `actingAs($user)` | 模拟登录 |  |

**最佳实践**：
- ✅ Feature 测试用 SQLite 内存库——比 MySQL 快 10x。
- ✅ 慢的外部 API 用 `Http::fake()` 拦截。
- ✅ `RefreshDatabase` trait 隔离每次测试。
- ✅ CI 跑 `php artisan test --parallel`（PHPUnit 10+）。
- ✅ Pest 替代 PHPUnit：`pestphp.com`——链式断言更简洁。

---

### 模式 17：Horizon + Queue 监控（解决"异步任务无可见性"）

**问题场景**：业务派发 1000 个 Job 到队列，怎么知道哪些失败、卡在哪个 worker？

**解决方案代码**：

```php
// config/horizon.php
return [
    'environments' => [
        'production' => [
            'supervisor-default' => [
                'connection' => 'redis',
                'queue' => ['default'],
                'balance' => 'auto',
                'maxProcesses' => 10,
                'minProcesses' => 1,
            ],
        ],
    ],
];
// 命令
// php artisan horizon
// php artisan horizon:terminate
// 访问 /horizon 看 dashboard
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `queue:work` | 单进程 worker | 简单 |
| `horizon` | 多进程 supervisor | Redis 专属 |
| `balance` | auto/simple | 负载均衡 |
| `maxProcesses` | 进程数 |  |
| `maxTime` | 进程最大运行 | 防内存泄漏 |
| `memory` | 内存限制 | 超限自动重启 |
| `wait` | 空闲时退出时间 |  |

**最佳实践**：
- ✅ 生产**用 Horizon 不用 queue:work**——多进程 + 监控面板。
- ✅ `balanceMaxShift` + `balanceCooldown` 配置负载均衡。
- ✅ `tries=3` + `backoff=[10,30,60]` 失败重试。
- ✅ Supervisor 进程崩溃自动重启：`supervisor` + `horizon.conf`。
- ✅ 监控 `horizon:status` cron 每分钟——挂了告警。

---

### 模式 18：Forge / Vapor 商业部署（解决"PHP-FPM 调优运维"）

**问题场景**：自建 PHP-FPM + Nginx 集群要做版本升级、SSL 自动续期、监控告警，运维成本高。Laravel 官方有 **Laravel Forge**（传统服务器）和 **Vapor**（serverless）。

**解决方案代码**：

```php
// Forge 提供
// - DigitalOcean / Linode / AWS EC2 一键 provision
// - Let's Encrypt 自动 SSL
// - 推送 GitHub 自动部署
// - 监控告警集成

// Vapor（Laravel Serverless）
// vapor.yml
id: 12345
name: my-app
environments:
    production:
        memory: 1024
        cli-memory: 512
        queue: true
        database: my-app-db
        cache: my-app-cache
// vapor deploy production
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| Forge | 传统 VPS 自动化 | 月费 |
| Vapor | AWS Lambda 部署 | 按请求计费 |
| Envoyer | 零停机部署 | 配合 Forge |
| Nova | Admin 后台 | 月费 |
| Pulse | 性能监控 |  |
| Breeze | 认证脚手架 | 免费 |
| Jetstream | 高级脚手架 | 含 Livewire |

**最佳实践**：
- ✅ 小团队用 Forge 起步——比 K8s 简单 10x。
- ✅ 大流量或无服务器场景用 Vapor——按需计费省 80%。
- ✅ Nova 写 Admin 后台比自建快 5x。
- ✅ Pulse 监控 SQL/Queue 慢查询——免费自托管。
- ✅ Breeze/Jetstream 替代 `php artisan make:auth`（已废弃）。

---

### 模式 19：Laravel 11/12 精简目录（解决"老项目升级难"）

**问题场景**：Laravel 10 有 `app/Http/Kernel.php`、`app/Console/Kernel.php`、`app/Providers/RouteServiceProvider.php`、`app/Exceptions/Handler.php` 4 个 Kernel 入口。11.x 全部下沉到 `bootstrap/app.php`。

**解决方案代码**：

```php
// Laravel 10 之前
// app/Http/Kernel.php
class Kernel extends HttpKernel
{
    protected $middleware = [
        \App\Http\Middleware\TrustProxies::class,
        \Illuminate\Http\Middleware\HandleCors::class,
    ];
    protected $middlewareGroups = [
        'web' => [...],
        'api' => [...],
    ];
    protected $middlewareAliases = [
        'auth' => \App\Http\Middleware\Authenticate::class,
    ];
}
// Laravel 11+
// bootstrap/app.php
return Application::configure(basePath: dirname(__DIR__))
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->web(append: [...]);
        $middleware->alias(['auth' => Authenticate::class]);
    })->create();
```

**关键参数表**：

| 版本 | 主要变化 | 备注 |
|------|----------|------|
| 8.x | 引入 Vite 替代 Mix |  |
| 9.x | 引入 Symfony 6 | PHP 8+ |
| 10.x | Laravel Pennant 特性开关 |  |
| 11.x | 砍 4 个 Kernel | 目录瘦身 |
| 12.x | 引入 Reverb WebSocket |  |
| 13.x | PHP 8.3+ 强制 | 当前 |

**最佳实践**：
- ✅ 新项目用 12.x/13.x——**不要**学老 Kernel 结构。
- ✅ 老项目升级用 Laravel Shift（付费）——自动化迁移。
- ✅ `bootstrap/app.php` 是**单文件**——找配置不用翻 4 处。
- ✅ `php artisan make:middleware` 仍生成 `app/Http/Middleware/`。
- ✅ 升级前看 UPGRADE.md——每版本都有破坏性变更清单。

---

### 模式 20：测试覆盖率 + CI 矩阵（解决"多 PHP 版本兼容"）

**问题场景**：业务代码要在 PHP 8.3/8.4/8.5 三版本 + Laravel 11/12/13 矩阵下测。Laravel 骨架自带 `.github/workflows/tests.yml`。

**解决方案代码**：

```yaml
# .github/workflows/tests.yml
name: Tests
on: [push, pull_request]
jobs:
    test:
        runs-on: ubuntu-latest
        strategy:
            matrix:
                php: ['8.3', '8.4', '8.5']
                dependency-version: [prefer-lowest, prefer-stable]
        steps:
            - uses: actions/checkout@v4
            - uses: shivammathur/setup-php@v2
              with:
                  php-version: ${{ matrix.php }}
                  coverage: xdebug
            - run: composer require "laravel/framework:^${{ matrix.dependency }}"
            - run: php artisan test --coverage-clover=coverage.xml
            - uses: codecov/codecov-action@v3
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `matrix.php` | PHP 版本矩阵 | 8.3/8.4/8.5 |
| `dependency-version` | prefer-lowest/stable | 包兼容 |
| `coverage-clover` | 覆盖率报告 | XML |
| `codecov-action` | 覆盖率上传 |  |
| `parallel` | 并行测试 |  |
| `fail-fast: false` | 失败继续 | 看全矩阵 |
| `pull_request` | PR 触发 |  |

**最佳实践**：
- ✅ Laravel 骨架 CI 矩阵默认 3 PHP 版本——直接用。
- ✅ `prefer-lowest` 测最低依赖版本——抓错版本不兼容。
- ✅ `xdebug` 覆盖率只 CI 装——本地不要。
- ✅ 并行 `php artisan test --parallel`——4 核 4x 加速。
- ✅ Codecov/Scrutinizer 覆盖率徽章放 README。

---

## 参考

- Laravel 官方：https://laravel.com/
- 骨架仓库：`laravel/laravel` v13.8.0
- 框架仓库：`laravel/framework`
- License：MIT
- 商业生态：Forge / Vapor / Nova / Pulse / Envoyer
- 文档：https://laravel.com/docs
