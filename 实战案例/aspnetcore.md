# aspnetcore - 跨平台 Web 框架的中间件管道与 DFA 路由设计

**GitHub**: dotnet/aspnetcore
**Star**: 36k+
**语言**: C# (98%) + TypeScript + F# + C++
**主题**: Web 框架 / 中间件 / DFA 路由 / 源生成器 / 池化
**适用场景**: .NET Web 后端、微服务、gRPC、Blazor、Minimal API、Native AOT

## 第一段：基础范式

### 模式 1：中间件反向 for 循环的"俄罗斯套娃"

**问题场景**：用户写 `app.Use(A).Use(B).Use(C)`，期望请求先经 A → B → C → handler。如果用正向 for 循环包装，请求会按 C → B → A 顺序执行——直接反了。

**解决方案**：`ApplicationBuilder.Build()` 用反向 for 循环 `for (var c = _components.Count - 1; c >= 0; c--)` 把后注册的中间件包成内层。`Func<RequestDelegate, RequestDelegate>` 的契约：每个组件把"下一个 RequestDelegate"作为入参返回"自己包装后的"。从最内层默认 404 委托开始，向外逐层包。
```csharp
public RequestDelegate Build() {
    RequestDelegate app = context => {
        var endpoint = context.GetEndpoint();
        if (endpoint?.RequestDelegate != null)
            throw new InvalidOperationException("endpoint reached end of pipeline without UseEndpoints");
        if (!context.Response.HasStarted) context.Response.StatusCode = 404;
        return Task.CompletedTask;
    };
    for (var c = _components.Count - 1; c >= 0; c--)
        app = _components[c](app);
    return app;
}
```

**关键参数**：
- 反向 for 循环是 `Func<RequestDelegate, RequestDelegate>` 契约的物理原因
- 默认 404 委托先检查 `endpoint` 是否有 RequestDelegate 但没被 UseEndpoints 执行——"用户忘注册路由"诊断
- `context.Items[RequestUnhandledKey] = true;` 让上层可识别 "pipeline 未命中" 写 `RequestNotHandled` 指标
- 管道末尾是 `RequestDelegate`，未匹配则 404

**最佳实践**：用反向循环包装中间件——保证注册顺序即执行顺序；默认 404 委托带诊断——"未注册路由"立即可发现；`context.Items` 做中间件间匿名通道——请求结束自动清空。

---

### 模式 2：Feature Collection 模式解耦 Server 与 HttpContext

**问题场景**：Kestrel / IIS / HttpSys / TestServer 是不同的 HTTP 服务器实现。HttpContext 直接 `public IHttpRequestFeature Request` 继承接口？——加新 feature 要改 HttpContext，破坏所有 Server。

**解决方案**：把"接口 + 实现"解耦到 `IFeatureCollection` 字典——Server 实现一组 Feature（`IHttpRequestFeature` / `IHttpResponseFeature`），Middleware 只依赖 Feature 接口，可在任意 Server / Mock 之间替换。
```csharp
public interface IHttpRequestFeature {
    Stream Body { get; set; }
    IHeaderDictionary Headers { get; set; }
    string Method { get; set; }
    string Path { get; set; }
    string QueryString { get; set; }
}
```

**关键参数**：
- `IFeatureCollection` 字典：按 Type 索引
- `IHttpRequestFeature` / `IHttpResponseFeature` / `IHttpResponseBodyFeature`
- Server 协议层实现 Feature 接口
- Middleware 通过 `context.Features.Get<IHttpRequestFeature>()` 拿
- Kestrel / IIS / HttpSys / TestServer 全部可替换

**最佳实践**：用 Feature Collection 解耦 Server 与框架——加新 feature 不破坏 HttpContext；Middleware 通过 `Features.Get<>()` 拿实现——可独立 mock；Type 索引字典——O(1) 查找。

---

### 模式 3：HttpContext 池化（DefaultHttpContextFactory + ObjectPool）

**问题场景**：高并发下每请求 `new HttpContext()` —— GC 压力、内存碎片、对象头浪费。Kestrel 知道会反复接收请求，希望复用同一个 `Context` 对象。

**解决方案**：`DefaultHttpContextFactory` 用 `ObjectPool<DefaultHttpContext>` 复用——`Initialize(features)` 复用，`Uninitialize()` 归还。`HostingApplication` 通过 `IHostContextContainer<Context>` 与 Kestrel 握手，让 Kestrel 注入 `Context` 引用复用。
```csharp
public class DefaultHttpContextFactory : IHttpContextFactory {
    private readonly ObjectPool<DefaultHttpContext> _httpContextPool;
    public HttpContext Create(IFeatureCollection featureCollection) {
        var httpContext = _httpContextPool.Get();
        httpContext.Initialize(featureCollection);
        return httpContext;
    }
    public void Dispose(HttpContext httpContext) {
        // ...清理 Items / Headers
        _httpContextPool.Return((DefaultHttpContext)httpContext);
    }
}
```

**关键参数**：
- `ObjectPool<DefaultHttpContext>` 池化
- `Initialize(features)` / `Uninitialize()` 生命周期
- `_active` 字段——WinDbg dump 看 `false` 知道已归还
- Kestrel 注入 `IHostContextContainer<Context>` 与 Hosting 握手
- `context.HttpContext = null` 清空防 IHttpContextAccessor 漏引用

**最佳实践**：高 QPS Web 框架必须池化 HttpContext——避免每请求 GC；用 `IHostContextContainer` 握手——Server 协议层与 Hosting 层可独立池化；`_active` 调试字段——纯为可观测性存在，不参与业务逻辑。

---

### 模式 4：RequestDelegate 作为工作单元

**问题场景**：从 Kestrel 到 Endpoint 的每一步——鉴权、路由、CORS、Handler——如果用"具体类"串联，加新中间件要改框架代码。Mock 测试困难。

**解决方案**：用 `RequestDelegate = Func<HttpContext, Task>` 做工作单元——`await next()` 把控制权传给内层。中间件、Tracing、单元测试、Mock 都基于此——"everything is a middleware"。
```csharp
public delegate Task RequestDelegate(HttpContext context);
public interface IMiddleware {
    Task InvokeAsync(HttpContext context, RequestDelegate next);
}
```

**关键参数**：
- `RequestDelegate = Func<HttpContext, Task>` 函数指针
- `await next()` 把控制权传给内层
- 路由、鉴权、CORS、静态文件、Session 全部是中间件
- 单元测试可独立调用 RequestDelegate
- Tracing 拦截 `RequestDelegate` 调用

**最佳实践**：用 RequestDelegate 链式组合——单元测试友好；任何处理环节可表达为 RequestDelegate——无类继承负担；`await next()` 是控制流——支持短路（CORS 拒绝）。

---

### 模式 5：Endpoint Routing 两段式

**问题场景**：`UseRouting` / `UseEndpoints` 合并成一个中间件？——`[Authorize]` 必须在 endpoint 已知后跑，但又必须在 `UseEndpoints` 之前。一段式无法表达。

**解决方案**：`UseRouting()` 只解析 URL 写入 `HttpContext.GetEndpoint()`；`UseEndpoints()` 才执行 `endpoint.RequestDelegate`。分离的好处：CORS / Auth / Authorization 可以在端点已知后做"短路 / 改写"。
```csharp
app.UseRouting();  // 解析 URL → HttpContext.SetEndpoint()
app.UseAuthentication();
app.UseAuthorization();  // 用 endpoint.Metadata 做授权决策
app.UseEndpoints(e => e.MapControllers());  // 真正执行 endpoint.RequestDelegate
```

**关键参数**：
- `UseRouting()` 解析 URL → `HttpContext.SetEndpoint()`
- `UseEndpoints()` 执行 `endpoint.RequestDelegate`
- `endpoint.Metadata` 携带 `[Authorize]` / `[EnableCors]` 等 attribute
- CORS / Auth / Antiforgery 在端点已知后做检查
- 缺中间件会抛"missing middleware"——fail-fast

**最佳实践**：用两段式路由——把"匹配"和"执行"分离；CORS / Auth 放在中间——能基于 endpoint metadata 决策；缺中间件要 fail-fast——比沉默 401 强。

---

## 第二段：扩展范式

### 模式 6：WebApplication 三合一（IHost + IApplicationBuilder + IEndpointRouteBuilder）

**问题场景**：.NET 5 之前用户得分别 `Host.CreateDefaultBuilder()` + `WebHost.Configure()` + `RouteBuilder` + 串 DI——3 个 API、3 个生命周期。

**解决方案**：.NET 6+ `WebApplication` 同时实现 `IHost + IApplicationBuilder + IEndpointRouteBuilder`——一个对象统一托管、构建、路由。用户 `var app = WebApplication.Create()` 一行起步。
```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();
```

**关键参数**：
- `WebApplication` 同时实现 3 个接口
- `WebApplicationBuilder` 配置 services + 中间件
- 统一配置 + 统一生命周期
- `IHostBuilder` / `IWebHostBuilder` 内部用 `IHost` 包装
- 隐藏了 5+ 年累积的 3 套 API

**最佳实践**：用 3-in-1 顶层对象统一构建——降低用户认知成本；`WebApplicationBuilder` 集中配置——避免 services / middleware 散落；隐藏历史 API 包袱——`IHostBuilder` / `IWebHostBuilder` 在内部兼容。

---

### 模式 7：UseMiddlewareExtensions 强类型中间件

**问题场景**：传统 `app.Use(async (ctx, next) => { ... })` lambda 中间件——类型不友好，没法注入服务，闭包难测试。

**解决方案**：用 `IMiddleware` 接口 + `UseMiddleware<T>()` 强类型扩展——DI 容器激活中间件、`InvokeAsync(HttpContext, RequestDelegate)` 签名清晰、支持构造函数注入。
```csharp
public interface IMiddleware {
    Task InvokeAsync(HttpContext context, RequestDelegate next);
}
public class MyMiddleware : IMiddleware {
    public MyMiddleware(ILogger<MyMiddleware> logger) { ... }
    public async Task InvokeAsync(HttpContext context, RequestDelegate next) {
        // 业务
        await next(context);
    }
}
// 注册
app.UseMiddleware<MyMiddleware>();
```

**关键参数**：
- `IMiddleware` 接口 + `InvokeAsync(HttpContext, RequestDelegate)` 签名
- DI 容器激活中间件
- 构造函数注入 services
- 单元测试可独立 new
- 闭包 vs 类的取舍

**最佳实践**：业务中间件用 `IMiddleware` 接口 + DI——可注入可测试；lambda 中间件只用于"一次性"场景——DI 不友好；用 `UseMiddleware<T>()` 扩展方法——统一注册方式。

---

### 模式 8：DefaultHttpContext._active 调试标志

**问题场景**：HttpContext 池化后，如果意外持有一个 Uninitialize 过的 HttpContext，访问 `Request.Body` 拿到看似正常的对象实际全是脏数据。生产环境难定位"为什么这个用户请求看到上次的 headers"。

**解决方案**：在 `DefaultHttpContext` 加内部 `bool _active` 字段——在 `Initialize` 设 true、`Uninitialize` 设 false。WinDbg dump 一看 `_active == false` 就知道该上下文已归还。**这个字段永不参与业务逻辑**，纯粹为可观测性而存在。
```csharp
internal bool _active;  // WinDbg dump only, https://github.com/dotnet/aspnetcore/issues/29709
public void Initialize(IFeatureCollection features) { _active = true; }
public void Uninitialize() { _active = false; }
```

**关键参数**：
- `internal bool _active`——WinDbg dump 标志
- 不参与业务逻辑
- 池化对象在 `Dispose` 归还时设 false
- WinDbg dump 看 false → 已归还
- issue #29709 解释这个字段来源

**最佳实践**：池化对象必须加 `_active` 标志——WinDbg dump 可观测；内部 `internal` 字段——不暴露 API；不参与业务逻辑——纯调试用。

---

### 模式 9：DFA 路由 + IL Emit Trie

**问题场景**：传统 `RouteCollection` 路由匹配——正则匹配 100+ endpoint 慢 10 倍，每次请求哈希 + 桶扫描。

**解决方案**：用 `DfaMatcher` + `ILEmitTrieFactory`——启动期把所有 endpoint 编译成"按段长分组 + IL 注入的字典查找"，运行时只做 O(length) 字符串比较，比 `TreeRouter` 快 5 倍。
```csharp
// 启动期编译
var trie = ILEmitTrieFactory.Create(defaultDestination, exitDestination, entries, vectorize: null);
// 运行期直接调 IL 生成的委托
int dest = trie(path, 0, path.Length);
```

**关键参数**：
- `DfaMatcher.MatchAsync`——434 行核心匹配
- `stackalloc PathSegment[_maxSegmentCount]` 栈分配 0 GC
- `[SkipLocalsInit]` JIT 不清零栈
- `ref readonly var candidate = ref candidates[0]` 避免 struct 复制
- `ILEmitTrieFactory` 同一长度 entry emit uint64 比较循环
- 50%+ 真实请求单候选 fast path

**最佳实践**：路由匹配启动期 emit IL——运行时 0 反射 0 哈希；栈分配 path segment——避免小数组 GC；`ref readonly` 取大 struct——避免复制；50%+ 真实场景单候选 fast path。

---

### 模式 10：Source Generator 替代反射（RequestDelegateGenerator）

**问题场景**：`RequestDelegateFactory` 用 Expression Tree 编译 lambda——启动期 `Expression.Compile()` 慢、AOT 场景报 trim 警告、Expression Tree 难调试。

**解决方案**：.NET 6+ `RequestDelegateGenerator`（Roslyn `IIncrementalGenerator`）在编译期把 `MapGet("/a", (int id) => ...)` 直接 emit 强类型 `RequestDelegate` IL——比 Expression Tree 快 2-3 倍、AOT 友好、零启动期反射。
```csharp
[Generator]
public sealed partial class RequestDelegateGenerator : IIncrementalGenerator {
    public void Initialize(IncrementalGeneratorInitializationContext context) {
        var endpoints = context.SyntaxProvider.CreateSyntaxProvider(
            predicate: IsEndpointInvocation, transform: TransformEndpoint);
        // ... 6 个 Collect() + Combine 增量生成
    }
}
```

**关键参数**：
- `IIncrementalGenerator`——Roslyn 增量源生成器
- 4 个 `Collect()` + `Combine`——增量化不重生成
- `MapGet` / `MapPost` 等直接 emit IL
- 启动期零反射
- AOT trim 友好
- 强类型 binding——编译期查类型

**最佳实践**：高频 API 用源生成器——AOT 友好 + 启动期零反射；用 `IIncrementalGenerator` 增量生成——避免全量重生成；预反射 helper 方法为 `static readonly`——避免运行时反射查找。

---

## 第三段：进阶范式

### 模式 11：CopyOnWriteDictionary + 浅克隆

**问题场景**：`ApplicationBuilder.New()` 克隆——中间件列表不复制（子树只增加新组件），properties 浅拷贝即可。深拷贝浪费时间。

**解决方案**：用 `CopyOnWriteDictionary` 做 properties 浅克隆——`New()` 内部只复制顶层引用，子 builder 是"包出子树"用。
```csharp
public IApplicationBuilder New() {
    return new ApplicationBuilder(this);  // 浅克隆 properties
}
```

**关键参数**：
- 浅克隆 properties——中间件列表不复制
- 子 builder 只增加新 `_components`
- `CopyOnWriteDictionary` 写时复制
- 适合"子树中间件"模式
- 比深克隆快 10x

**最佳实践**：用浅克隆 + CopyOnWrite 替代深克隆——子 builder 节省内存；中间件列表按需增加——不要预先复制；浅克隆用 `new` 构造——简单可靠。

---

### 模式 12：FeatureReferences 缓存避免哈希

**问题场景**：每个 `IFeature` 在 FeatureCollection 里按 Type 索引的字典访问——O(1) 但每次哈希。Request / Response / Items 高频访问，哈希 100 万次/秒浪费。

**解决方案**：用 `FeatureReferences<FeatureInterfaces>` 结构体——把每个常用 Feature 缓存到 bit 标记 + 对象引用，命中已缓存则直接返回。让 Request/Response/Items 访问接近直接字段。
```csharp
private FeatureReferences<FeatureInterfaces> _features;
// 第一次访问时缓存，后续直接读字段
```

**关键参数**：
- `FeatureReferences<FeatureInterfaces>` 缓存结构
- bit 标记 + 对象引用
- 命中已缓存直接返回
- Request/Response/Items 访问接近字段速度
- 1 个结构体挂 10+ Feature 缓存

**最佳实践**：高频访问的 Feature 用引用缓存——避免每次哈希；bit 标记表示"已缓存"——快速判空；结构体存储——避免额外对象分配。

---

### 模式 13：HostingApplication Bridge（Kestrel ↔ Pipeline）

**问题场景**：Kestrel 在 `dotnet/runtime`，Hosting 在 `dotnet/aspnetcore`。两个独立仓库如何桥接？——IHttpApplication<TContext> 抽象。

**解决方案**：`HostingApplication : IHttpApplication<Context>` 桥接 Kestrel 和 Pipeline——`CreateContext` 创建/复用 HttpContext，`ProcessRequestAsync` 调 `_application(context.HttpContext!)`，`DisposeContext` 归还到池。
```csharp
public Task ProcessRequestAsync(Context context) => _application(context.HttpContext!);
public void DisposeContext(Context context, Exception? exception) {
    _diagnostics.RequestEnd(context.HttpContext!, exception, context);
    _defaultHttpContextFactory?.Dispose((DefaultHttpContext)context.HttpContext!);
    context.Reset();
}
```

**关键参数**：
- `IHttpApplication<Context>` 抽象
- `CreateContext` / `ProcessRequestAsync` / `DisposeContext` 三段
- `_application` 是 `RequestDelegate` 管道入口
- `context.Reset()` 把 Context 放回池
- `_diagnostics.RequestEnd` 记录 RequestEnd 指标

**最佳实践**：用 IHttpApplication 抽象桥接 Server 和 Pipeline——可独立替换 Server；`CreateContext` / `ProcessRequestAsync` / `DisposeContext` 三段生命周期——清晰；`_diagnostics` 抽 trace——可插拔。

---

### 模式 14：IHostContextContainer 池化握手信号

**问题场景**：Kestrel 知道会反复接收 HTTP 请求，希望复用同一个 Context 对象。HostingApplication 不知道 Kestrel 是否支持池化——每次 new 浪费。

**解决方案**：Kestrel 在 `IFeatureCollection` 偷偷塞一个 `IHostContextContainer<Context>`——让 HostingApplication 复用同一 Context。`if (contextFeatures is IHostContextContainer<Context> container)` 是 Server 协议层与 Hosting 层的握手信号。
```csharp
if (contextFeatures is IHostContextContainer<Context> container) {
    hostContext = container.HostContext ?? new Context();
    container.HostContext = hostContext;
}
```

**关键参数**：
- `IHostContextContainer<Context>` 接口
- Kestrel 实现接口塞到 FeatureCollection
- Hosting 检测到 → 复用 Context
- "我支持池化" 的握手信号
- 避免每请求 new Context

**最佳实践**：用接口握手替代强耦合——Server 协议层与 Hosting 层可独立；Server 实现接口塞 FeatureCollection——透明握手；Hosting 检测接口——支持池化才走复用路径。

---

### 模式 15：Minimal API 强类型 Binding

**问题场景**：传统 MVC Controller 每个 endpoint 一个 class + method——80% 业务简单 CRUD 也要写完整 class。

**解决方案**：Minimal API `app.MapGet("/a", (int id) => ...)` 一行 endpoint——参数自动 binding、返回值自动序列化。配合 `RequestDelegateGenerator` 在编译期 emit 强类型 RequestDelegate。
```csharp
app.MapGet("/users/{id:int}", (int id, IDb db) => db.Users.Find(id));
app.MapPost("/users", (User user) => Results.Created($"/users/{user.Id}", user));
```

**关键参数**：
- `MapGet` / `MapPost` / `MapPut` / `MapDelete` 直接注册
- 参数自动 binding——query / route / body
- 返回值自动 JSON 序列化
- `[FromQuery]` / `[FromRoute]` / `[FromBody]` 显式声明
- 强类型 binding——编译期查类型
- 配合 RDG 源生成器零反射

**最佳实践**：简单 CRUD 用 Minimal API——10x 代码量优势；参数 binding 用强类型——编译期查类型；返回 `Results.Created` 静态方法——无需 new Response；配合源生成器——AOT 友好。

---

## 第四段：实战范式

### 模式 16：Blazor Server/WASM/Auto 三模式

**问题场景**：传统 SPA（React/Vue）+ Web API——前端独立部署、后端 API 独立部署、双重 CI/CD、首屏白屏。

**解决方案**：Blazor 三模式——Server（SignalR 长连接、SSR）、WebAssembly（浏览器跑 .NET）、Auto（首屏 SSR + 后台 WASM 切换）。同一套 Razor 组件代码。
```
Blazor Server:  Razor → SignalR → 浏览器
Blazor WASM:    Razor → WASM → 浏览器（首次下载大）
Blazor Auto:    Razor → SSR 首屏 → 后台 WASM 接管
```

**关键参数**：
- `Components/` 子目录三套实现
- Razor 编译为 .NET 类
- SignalR 双向通信
- WASM 首次下载 5-10 MB
- Auto 模式免白屏
- 共享 `Components/Endpoints` 层

**最佳实践**：强交互用 Blazor Server——首屏快但占用服务器；离线应用用 Blazor WASM——首次慢但 0 服务器；不确定用 Blazor Auto——首屏 SSR + 后台 WASM。

---

### 模式 17：gRPC + JSON Transcoding

**问题场景**：gRPC 强类型契约 + 高性能，但浏览器不支持。REST/JSON 浏览器友好但弱类型。维护两套 API 痛苦。

**解决方案**：.NET 7+ gRPC JSON Transcoding——同一份 proto 既支持 gRPC 调用又支持 REST/JSON。proto annotation `[json_name="..."]` 描述 JSON 字段。
```protobuf
service UserService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = { get: "/v1/users/{id}" };
  }
}
```

**关键参数**：
- 单一 proto 文件
- `google.api.http` 注解 REST 路径
- `[json_name="..."]` 注解 JSON 字段
- 浏览器走 REST/JSON
- 微服务间走 gRPC
- 单一真相源

**最佳实践**：API 同时支持 gRPC 和 REST/JSON——一份 proto 两种调用；`google.api.http` 注解 REST 映射——proto 描述完整；浏览器侧用 REST/JSON——微服务间用 gRPC。

---

### 模式 18：Native AOT 编译

**问题场景**：.NET 传统 JIT 启动慢（几百 ms）、内存占用大（几十 MB）、容器镜像大（200MB+）。Serverless 场景首屏 latency 关键。

**解决方案**：.NET 8+ Native AOT 编译——C# 直接编译为 native 二进制，无 JIT、启动 < 50ms、内存 < 10MB、镜像 < 50MB。源生成器 + trim 警告是基础。
```bash
dotnet publish -c Release -r linux-x64 -p:PublishAot=true
# 输出 ~30MB 二进制
```

**关键参数**：
- 启动 < 50ms
- 内存 < 10MB
- 镜像 < 50MB
- 无 JIT
- 源生成器必须
- trim warning 必须清
- 不支持反射

**最佳实践**：Serverless 用 Native AOT——首屏 latency 关键；不写反射——改用源生成器；清 trim warning——避免运行时 NotSupportedException。

---

### 模式 19：OpenAPI Source Generator

**问题场景**：手写 OpenAPI yaml 维护两套（API + 文档）容易漂移；运行时反射生成 OpenAPI 启动慢、AOT 不友好。

**解决方案**：.NET 9+ OpenAPI Source Generator——编译期扫描 `MapGet` / `MapPost` / Controller 方法签名生成 OpenAPI yaml。AOT 友好、零启动期反射、文档与代码同源。
```csharp
builder.Services.AddOpenApi();  // 源生成器自动生成 OpenAPI yaml
```

**关键参数**：
- 编译期扫描 endpoint
- 零启动期反射
- AOT 友好
- 自动跟踪 type schema
- 文档与代码同源
- 支持 .NET 9+ 源生成器

**最佳实践**：用 OpenAPI 源生成器——文档与代码同源；编译期生成——AOT 友好；不写手写 yaml——避免漂移。

---

### 模式 20：Hot Reload + .NET Aspire

**问题场景**：改一行 C# 代码要重启进程——5-10 秒中断开发流。改前端资源（CSS/JS）也要全页刷新。

**解决方案**：Hot Reload（.NET 6+）——`dotnet watch` 监听 .cs 变更后增量编译，应用运行时通过 MetadataUpdateHandler 热更新方法体，不重启进程。.NET Aspire（.NET 8+）——分布式应用编排 + Service Discovery + 容器化本地开发。
```bash
dotnet watch
# 改 .cs 文件 → 自动热更新
```

**关键参数**：
- `dotnet watch` 监听文件变更
- MetadataUpdateHandler 热更新方法体
- 不重启进程
- 支持 C# 代码 / Razor 视图
- 状态保留
- .NET Aspire：AppHost + 多个 microservices
- Service Discovery 集成

**最佳实践**：开发用 `dotnet watch`——避免 5 秒重启；微服务本地开发用 .NET Aspire——一栈全容器化 + Service Discovery；保留应用状态——不中断用户操作。

---

## 附：仓库元信息

| 字段 | 值 |
|:---|:---|
| 仓库 | `github.com/dotnet/aspnetcore` |
| 协议 | MIT |
| 总 C# 源文件 | 7 754 |
| 主语言 | C#（98%）+ TypeScript + F# + C++ |
| 治理 | .NET 基金会 + Microsoft |
| 子项目数 | 260+ |
| 源生成器 | 4（RDG / OpenApi / ResultsOfTGenerator / Analyzers） |
| NuGet 包 | 200+（`Microsoft.AspNetCore.*`） |
| 关键依赖 | .NET 运行时 / Kestrel（runtime） / EF Core（efcore） / Razor 编译器（razor） |
| 关键里程碑 | 2014 立项 → 2016 .NET Core 1.0 → 2020 .NET 5 统一 → 2021 .NET 6 Minimal API → 2023 .NET 8 Native AOT → 2024 .NET 9 OpenAPI SG |
| 团队 | Microsoft 50+ 核心工程师 + 1000+ 贡献者 |
