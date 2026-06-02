# NestJS 官方文档 - NestJS v11 增量快照与官方推荐用法

**GitHub**: nestjs/nest
**Star**: 70k+
**语言**: TypeScript
**主题**: 官方文档、v11 增量、API 参考
**适用场景**: NestJS API 参考、版本升级指南、最佳实践

---

## 一、基础范式

### 模式 1 · v11 控制器装饰器（@Controller + @HttpCode）

**问题场景**：v10 → v11 装饰器默认值变化（`@Post` 默认 201 → 204）。

**解决方案**：v11 显式 `@HttpCode(201)` 装饰器 + 自定义响应；`@Header('Cache-Control', 'none')` 装饰器设响应头；`@Redirect()` 装饰器声明重定向。

**关键参数**：
- `@HttpCode(201)`
- `@Header()`
- `@Redirect()`
- 装饰器声明式
- 0 if/else

**最佳实践**：所有 v11 项目显式装饰器，避免默认值变化导致回归。

### 模式 2 · Request / Response 注入

**问题场景**：需要访问底层 Express / Fastify 对象。

**解决方案**：`@Req() req: Request` / `@Res() res: Response` 注入原生对象（不推荐，破坏 Nest 抽象）；推荐 `@Req() req: Request` + `req.user` 由 Guard / Interceptor 设置。

**关键参数**：
- `@Req()` / `@Res()`
- `@Next()` 不推荐
- `passthrough: true`
- 原生 vs 抽象
- 0 强绑

**最佳实践**：所有项目用 Nest 抽象（@Body / @Query / 自定义装饰器），不用 @Res。

### 模式 3 · 异步控制器（async / await）

**问题场景**：handler 是异步操作（DB / API）。

**解决方案**：handler 返回 Promise，`async findAll(): Promise<User[]> { return this.userService.findAll() }`；Nest 自动 await；异常自动捕获。

**关键参数**：
- `async` handler
- Promise 返回
- 自动 await
- 异常自动捕获
- 0 callback

**最佳实践**：所有 handler 都用 async / await，告别 Promise 链。

### 模式 4 · 路由通配（@Get('ab*cd')）

**问题场景**：需要匹配一组路由（`/ab*cd`）。

**解决方案**：路由通配符 `*` 任意字符；`?` 单字符；`@Get('users/*')` 匹配 `/users/xxx`；Fastify 风格路径参数。

**关键参数**：
- `*` 任意
- `?` 单字符
- 通配路由
- 0 多个
- 灵活

**最佳实践**：所有 RESTful 场景用 `@Get(':id')` 动态参数。

### 模式 5 · 状态码（默认 vs 显式）

**问题场景**：@Post 默认 201 / 204？v11 行为变了。

**解决方案**：v11+ `@Post` 默认 201（创建成功）；`@HttpCode(200)` 显式覆盖；`@HttpCode(204)` 无内容；DELETE 通常 204。

**关键参数**：
- `@Post` 默认 201
- `@HttpCode(200)`
- `@HttpCode(204)`
- 显式 vs 默认
- RESTful 语义

**最佳实践**：所有 API 显式 @HttpCode，RESTful 语义清晰。

---

## 二、扩展范式

### 模式 6 · 子域路由（@Controller({ host: ':tenant.example.com' }))

**问题场景**：多租户系统需要按子域名路由（`tenant1.api.com` / `tenant2.api.com`）。

**解决方案**：`@Controller({ host: ':tenant.api.com' }) class TenantController { @Get() getData(@HostParam('tenant') tenant: string) {} }` 基于 host 路由。

**关键参数**：
- `host` 配置
- `@HostParam`
- 多租户
- 子域名
- 0 手动

**最佳实践**：所有 SaaS 项目用 host 路由做多租户。

### 模式 7 · 负载均衡（@nestjs/load-balancer）

**问题场景**：微服务需要客户端负载均衡。

**解决方案**：`@nestjs/load-balancer` 包，`ClientsModule.register([{ name: 'SERVICE', transport: Transport.TCP, options: { host: 'service', port: 3000 }, balancer: 'round-robin' }])` 配多个实例。

**关键参数**：
- `@nestjs/load-balancer`
- round-robin
- 多个实例
- 客户端负载均衡
- 0 服务端

**最佳实践**：所有微服务用客户端负载均衡，弹性 10x。

### 模式 8 · Pino Logger 集成

**问题场景**：NestJS 默认 Logger 简单，生产需要结构化日志。

**解决方案**：`nestjs-pino` 集成 Pino，`LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL || 'info' } })`；`req.log.info({ userId }, 'login')` 注入式日志。

**关键参数**：
- `nestjs-pino`
- `LoggerModule`
- Pino 核心
- 注入 logger
- 0 配置

**最佳实践**：所有生产 NestJS 用 nestjs-pino + Pino，结构化日志 10x。

### 模式 9 · Swagger / OpenAPI 自动生成

**问题场景**：手写 API 文档不一致。

**解决方案**：`@nestjs/swagger` 集成，`SwaggerModule.setup('api', app, document)`；`@ApiProperty()` 描述 DTO；`@ApiOperation({ summary: 'Get user' })` 描述 endpoint；自动生成 OpenAPI JSON。

**关键参数**：
- `@nestjs/swagger`
- `SwaggerModule.setup`
- `@ApiProperty`
- `@ApiOperation`
- 0 手写

**最佳实践**：所有项目用 @nestjs/swagger 自动文档，API 文档零成本。

### 模式 10 · 健康检查（@nestjs/terminus）

**问题场景**：K8s / 负载均衡需要健康检查端点。

**解决方案**：`@nestjs/terminus` + `HealthModule` + `HealthController` + `HealthCheck()`；`@HealthCheck() @Get() check() { return this.health.check([() => this.db.pingCheck('db')]) }`；`/health` 端点。

**关键参数**：
- `@nestjs/terminus`
- `HealthCheck`
- `pingCheck`
- K8s 集成
- 0 自定义

**最佳实践**：所有 NestJS 项目用 terminus + K8s livenessProbe。

---

## 三、进阶范式

### 模式 11 · 微服务 Hybrid App（HTTP + Microservice）

**问题场景**：同一个 NestJS 实例需要同时监听 HTTP 和微服务。

**解决方案**：`app.connectMicroservice<MicroserviceOptions>({ transport: Transport.REDIS, options: { ... } })`；`app.startAllMicroservices()` + `app.listen(3000)`；HTTP + RPC 同时工作。

**关键参数**：
- `connectMicroservice`
- `startAllMicroservices`
- Hybrid App
- 多协议
- 0 分项目

**最佳实践**：所有需要 HTTP + 微服务的项目用 Hybrid App，部署简单 10x。

### 模式 12 · 动态模块（forRoot / forFeature / forRootAsync）

**问题场景**：模块需要接收配置参数。

**解决方案**：`static forRoot(options: DatabaseOptions): DynamicModule { return { module: DatabaseModule, providers: [{ provide: 'OPTIONS', useValue: options }], exports: ['OPTIONS'] } }`；`forRootAsync` 异步工厂。

**关键参数**：
- `DynamicModule`
- `forRoot` / `forFeature`
- `forRootAsync`
- 异步工厂
- 配置注入

**最佳实践**：所有可复用模块用 DynamicModule 接收配置。

### 模式 13 · Scope（REQUEST / TRANSIENT）

**问题场景**：某些 provider 需要请求作用域（每个请求新实例）。

**解决方案**：`@Injectable({ scope: Scope.REQUEST })` 声明请求作用域；`Scope.TRANSIENT` 瞬态（每次注入新实例）；`Scope.DEFAULT` 单例默认。

**关键参数**：
- `Scope.REQUEST`
- `Scope.TRANSIENT`
- 生命周期
- 性能 vs 隔离
- 谨慎使用

**最佳实践**：REQUEST Scope 慎用，会破坏单例性能。

### 模式 14 · Lifecycle Hooks（OnModuleInit / OnApplicationBootstrap）

**问题场景**：模块启动时需要初始化（连接池 / 缓存预热）。

**解决方案**：`implements OnModuleInit { onModuleInit() { this.cache.warmup() } }` 生命周期钩子；`OnApplicationBootstrap` / `OnModuleDestroy` / `beforeApplicationShutdown` / `OnApplicationShutdown` 5 个钩子。

**关键参数**：
- `OnModuleInit`
- `OnApplicationBootstrap`
- `OnModuleDestroy`
- 启动 / 关闭
- 0 全局

**最佳实践**：所有启动初始化用 `OnApplicationBootstrap`，关闭清理用 `OnModuleDestroy`。

### 模式 15 · Mapped Types（PartialType / PickType / OmitType）

**问题场景**：DTO 变体（Create / Update / Query）字段大量重复。

**解决方案**：`class UpdateUserDto extends PartialType(CreateUserDto) {}` 全字段可选；`PickType(CreateUserDto, ['name'])` 选字段；`OmitType` / `IntersectionType`。

**关键参数**：
- `PartialType`
- `PickType` / `OmitType`
- `IntersectionType`
- DTO 复用
- 0 重复

**最佳实践**：所有 DTO 变体用 Mapped Types，减少 80% 样板。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：v11 全新项目从零起步。

**解决方案**：7 件套：① `nest new app --strict` 严格模式 ② `ConfigModule.forRoot({ isGlobal: true })` ③ `TypeOrmModule.forRoot` ④ `TerminusModule` 健康检查 ⑤ `LoggerModule` Pino ⑥ `SwaggerModule.setup` ⑦ `GlobalExceptionFilter`。

**关键参数**：
- `nest new`
- ConfigModule
- TypeOrmModule
- TerminusModule
- LoggerModule
- SwaggerModule
- ExceptionFilter

**最佳实践**：所有 v11 项目用 7 件套 + 严格模式。

### 模式 17 · v10 → v11 升级

**问题场景**：现有项目升级 NestJS v10 → v11。

**解决方案**：`npx @nestjs/upgrade` 工具；`npm install @nestjs/common@latest @nestjs/core@latest`；changelog 阅读 breaking changes（`@Post` 默认值、依赖升级）。

**关键参数**：
- `@nestjs/upgrade`
- 升级工具
- changelog
- 依赖升级
- 测试回归

**最佳实践**：所有 v10 项目用 upgrade 工具升级，5 分钟完成。

### 模式 18 · 性能优化 5 招

**问题场景**：v11 性能调优。

**解决方案**：5 招优化：① Fastify adapter ② `Logger` 改为 nestjs-pino ③ `synchronize: false` ④ Redis 缓存 ⑤ Cluster 模式 + 多进程。

**关键参数**：
- Fastify
- Pino
- synchronize: false
- 缓存
- Cluster

**最佳实践**：5 招组合，NestJS v11 性能 10x。

### 模式 19 · 文档驱动的开发模式

**问题场景**：文档与代码脱节，API 契约混乱。

**解决方案**：先写 Swagger 注解 → DTO 类型 → handler；OpenAPI JSON / YAML 作为契约，前后端并行开发；`/api-json` 端点生成 SDK。

**关键参数**：
- Swagger first
- DTO 类型
- OpenAPI 契约
- 自动 SDK
- 0 文档腐烂

**最佳实践**：所有 API 项目用 Swagger first + 文档驱动，前后端协作 10x。

### 模式 20 · 7 天复刻 NestJS 子集

**问题场景**：想做内部简化版框架（不依赖 NestJS 全部生态）。

**解决方案**：7 天分 5 步：① Reflect metadata + 装饰器 ② 极简 IoC 容器 ③ 路由扫描 ④ Module 注册 ⑤ Middleware / Guard / Interceptor 钩子。

**关键参数**：
- Day 1-2: Reflect
- Day 3: IoC
- Day 4: 路由
- Day 5: Module
- Day 6-7: 横切

**最佳实践**：7 天复刻「NestJS 80%」，完整 v11 复刻需要 6 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\nestjs\nest\`
- **大小**: ~30 MB
- **总文件数**: 数百 TS 文件
- **关键 commit**: v11.x
- **作者**: Kamil Mysliwiec + 社区
- **许可**: MIT

## 一句话总结

NestJS v11 用「@HttpCode 显式 + 子域路由 + Pino 日志 + Swagger 自动 + Hybrid App + Dynamic Module」让 TypeScript 后端工程化达到 Spring 级别，是 Node 生态最像 Spring 的全栈框架。
