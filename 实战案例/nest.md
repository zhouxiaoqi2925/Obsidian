# Nest - 渐进式 Node.js 后端框架

**GitHub**: nestjs/nest
**Star**: 71.6k
**语言**: TypeScript
**主题**: web-framework、nestjs、dependency-injection、ioc、microservices
**适用场景**: 中大型后端、BFF、微服务、GraphQL 网关、跨传输协议系统

---

## 一、基础范式

### 模式 1 · 装饰器 + Metadata 驱动的 DI 容器

**问题场景**：Express/Koa 只给 HTTP 路由不给 OOP 模块边界，手动管理依赖关系在大型项目失控。

**解决方案**：Nest 用 `reflect-metadata` 把 TypeScript 装饰器（`@Injectable` / `@Module` / `@Controller`）转成运行时的依赖图，`packages/core/injector/injector.ts`（1307 行）按图实例化。

**关键参数**：
- `@Injectable()` 标记可注入类
- `@Module({ providers, controllers, imports, exports })` 模块边界
- constructor 参数类型作为注入 token
- 自定义 token 用 `@Inject('TOKEN')`
- 反射元数据存 `Reflect.defineMetadata`

**最佳实践**：所有跨切关注（数据库连接、配置中心、日志服务）都用 `@Injectable()` 包装，constructor 注入而非 import。

### 模式 2 · 4 件套洋葱圈（Guards → Pipes → Interceptors → ExceptionFilters）

**问题场景**：权限验证、参数转换、日志记录、异常处理散落各处，难以复用。

**解决方案**：Nest 4 件套按洋葱圈顺序嵌套：Guards 鉴权 → Pipes 转换/校验 → Interceptors 拦截 → ExceptionFilters 兜底，每件套用 `@UseGuards` / `@UsePipes` 装饰器声明。

**关键参数**：
- `CanActivate.guard` 鉴权
- `PipeTransform.transform` 参数转换
- `Interceptor.intercept` 拦截（基于 RxJS）
- `@Catch(HttpException)` 异常过滤
- 全局/控制器/方法三层作用域

**最佳实践**：跨切关注都用 4 件套表达，不要在 controller 内写 try/catch + 中间件。

### 模式 3 · Module 边界 + 循环依赖 ForwardRef

**问题场景**：模块间相互引用导致循环依赖，无法启动。

**解决方案**：Nest 用 `forwardRef(() => OtherModule)` 让两个 Module 互引，运行时延迟到第一次实例化时解析；`@Inject(forwardRef(() => Service))` 在构造器里也支持。

**关键参数**：
- `forwardRef(() => XxxModule)` 包装函数
- 构造器内 `private readonly svc: Inject(forwardRef(() => XxxService))`
- 字符串 token 也支持 forwardRef
- 必须配对使用
- 启动时延迟解析

**最佳实践**：能用 EventEmitter 解耦的循环依赖不要用 forwardRef，forwardRef 是最后手段。

### 模式 4 · 平台无关 HTTP 适配

**问题场景**：Express 和 Fastify API 不同，切换框架要重写启动代码。

**解决方案**：`platform-express` / `platform-fastify` 两个独立 npm 包提供 `NestFactory.create(AppModule, new ExpressAdapter())` 统一入口，业务代码完全一致。

**关键参数**：
- `platform-express` 适配 Express
- `platform-fastify` 适配 Fastify
- 同一份 Controller 代码
- `ExpressAdapter` / `FastifyAdapter`
- 切换只改 main.ts

**最佳实践**：新项目从 Fastify 起手（性能 +40%），老项目 Express 维持现状，业务代码不变。

### 模式 5 · Scope.Default / Request / Transient

**问题场景**：单例服务在多租户场景下状态污染；请求级数据需要每次新建。

**解决方案**：`@Injectable({ scope: Scope.DEFAULT | REQUEST | TRANSIENT })` 三档作用域，REQUEST 作用域在每个 HTTP 请求内单例，TRANSIENT 每次注入都新建。

**关键参数**：
- `Scope.DEFAULT` 单例
- `Scope.REQUEST` 每请求单例
- `Scope.TRANSIENT` 每次注入新建
- REQUEST 作用域可注入 `REQUEST` 对象
- 性能：DEFAULT > REQUEST > TRANSIENT

**最佳实践**：默认 DEFAULT 够用，REQUEST 仅用于多租户隔离，TRANSIENT 仅用于工具服务。

---

## 二、扩展范式

### 模式 6 · 9 种传输协议 Microservices

**问题场景**：Kafka/NATS/Redis/MQTT/gRPC/TCP/RMQ 等 9 种消息中间件 API 不同。

**解决方案**：`@nestjs/microservices` 提供统一 `ClientProxy` 抽象，`ClientsModule.register([{ name: 'KAFKA_SERVICE', transport: Transport.KAFKA }])` 即可声明 9 种 client。

**关键参数**：
- `Transport.KAFKA` / `REDIS` / `NATS` / `MQTT` / `GRPC` / `TCP` / `RMQ`
- `@MessagePattern('topic')` 订阅
- `client.send('topic', payload)` 发送
- `client.emit('event', payload)` 事件
- `@EventPattern('event')` 订阅事件

**最佳实践**：跨服务通信用 NATS（轻量），事件流用 Kafka，IoT 用 MQTT，团队 RPC 用 gRPC。

### 模式 7 · GraphQL Code-First / Schema-First

**问题场景**：GraphQL 业务复杂，schema 和 resolver 容易脱节。

**解决方案**：Nest GraphQL 提供 code-first（`@ObjectType()` 装饰类）和 schema-first（SDL 文件）两套方案，`@Resolver(() => User)` 把 resolver 关联到 type。

**关键参数**：
- `@ObjectType()` / `@Field()` code-first
- SDL 文件 schema-first
- `@Resolver(() => User)` 关联
- `@Query` / `@Mutation` 装饰器
- `@Args()` 参数注入

**最佳实践**：新项目用 code-first（TS 类型 + 自动 SDL），老项目 SDL 维持。

### 模式 8 · WebSocket Gateway

**问题场景**：WebSocket 业务分散在 socket.io / ws / native 中。

**解决方案**：`@WebSocketGateway()` 装饰器统一入口，`@SubscribeMessage('event')` 处理消息，`@WebSocketServer()` 注入原生 server。

**关键参数**：
- `platform-socket.io` / `platform-ws`
- `@WebSocketGateway({ cors: { origin: '*' } })` 配置
- `@SubscribeMessage('msg')` 订阅
- `@WebSocketServer() server` 注入
- `@ConnectedSocket() client` 注入连接

**最佳实践**：新项目 socket.io（生态丰富），物联网项目 ws（轻量）。

### 模式 9 · ConfigModule + Joi 校验

**问题场景**：环境变量散落 `process.env.X`，缺类型 + 缺默认值。

**解决方案**：`@nestjs/config` 统一读 `.env`，`Joi` schema 校验 + `validationSchema: Joi.object({...})` 启动时 fail-fast。

**关键参数**：
- `ConfigModule.forRoot({ isGlobal: true })` 全局可用
- `ConfigService.get('KEY')` 强类型
- Joi schema 校验
- 命名空间 `ConfigModule.forFeature(...)`
- 启动时 fail-fast

**最佳实践**：所有 env 都走 ConfigModule + Joi，启动时校验而非运行时崩溃。

### 模式 10 · TypeORM / Prisma / Mongoose 集成

**问题场景**：ORM 不同，Repository 模式不统一。

**解决方案**：Nest 提供 9 个 Database 包（`@nestjs/typeorm` / `@nestjs/prisma` / `@nestjs/mongoose`），统一 `Repository<Entity>` / `Model<Document>` 注入。

**关键参数**：
- `@nestjs/typeorm` SQL
- `@nestjs/prisma` Schema 优先
- `@nestjs/mongoose` MongoDB
- `@InjectRepository(Entity)` 注入
- Active Record vs Data Mapper

**最佳实践**：新项目 Prisma（类型最强），老项目 TypeORM（生态丰富），MongoDB 项目 Mongoose。

---

## 三、进阶范式

### 模式 11 · GraphInspector + SerializedGraph 调试

**问题场景**：复杂 Module 图（30+ Module、100+ Provider）启动失败时，错误信息无法定位循环依赖。

**解决方案**：v10+ 引入 `GraphInspector` + `SerializedGraph`，把 DI 图序列化为 JSON 节点树，提供 `InspectorService.insertBreakpoint(node)` 调试断点。

**关键参数**：
- `GraphInspector` 监听 DI 图
- `SerializedGraph` 节点/边 JSON
- `Module Opaque Key` 标识 Module
- 启动时打印图快照
- 循环依赖可视化

**最佳实践**：超过 20 个 Module 必须用 GraphInspector 看图，调试时间节省 50%。

### 模式 12 · Lerna Monorepo + 9 包拆分

**问题场景**：Nest 是个生态，单包无法管理 core/common/platform-express/platform-fastify/microservices/websockets/testing/config 等 9 个独立子包。

**解决方案**：Lerna monorepo 9 包独立发版，`packages/core` 不依赖 `packages/common` 之外的任何 runtime 包。

**关键参数**：
- Lerna + npm workspaces
- 9 个独立 npm 包
- 独立 version 独立 changelog
- 顶层 `package.json` 是 devDependencies 中心
- 集成测试 `integration/` 端到端

**最佳实践**：框架层按「能力维度」拆 monorepo 子包（core/common/platform），按「传输协议」拆 microservices 子包。

### 模式 13 · Testing Module + 自定义 token

**问题场景**：单元测试需要替换真实 Repository 为 mock。

**解决方案**：`Test.createTestingModule({ providers: [{ provide: getRepositoryToken(Entity), useValue: mockRepo }] }).compile()` 一行覆盖。

**关键参数**：
- `Test.createTestingModule()`
- `overrideProvider(token).useValue(mock)`
- `getRepositoryToken(Entity)` SQL
- `getModelToken(Document)` MongoDB
- `.compile()` 拿到 TestingModule

**最佳实践**：单测覆盖率 100% Controller + 80% Service，覆盖 Repository 边界。

### 模式 14 · Lifecycle Hooks 7 件套

**问题场景**：模块/服务需要「启动时连数据库、停止时关连接、模块销毁时清理」等生命周期。

**解决方案**：`OnModuleInit` / `OnApplicationBootstrap` / `OnModuleDestroy` / `beforeApplicationShutdown` / `OnApplicationShutdown` 5 个接口按顺序触发。

**关键参数**：
- `OnModuleInit` 模块初始化后
- `OnApplicationBootstrap` 应用启动后
- `OnModuleDestroy` 模块销毁前
- `beforeApplicationShutdown` 应用停止前
- `OnApplicationShutdown` 进程退出前

**最佳实践**：数据库连接/Redis 连接/队列消费者都走 OnModuleInit / OnApplicationShutdown 注册。

### 模式 15 · @nestjs/event-emitter 事件总线

**问题场景**：业务事件（如订单创建）需要跨服务广播，但不想用消息队列的复杂度。

**解决方案**：`@nestjs/event-emitter` 提供进程内事件总线，`emit('order.created', payload)` + `@OnEvent('order.created')` 一行订阅。

**关键参数**：
- `EventEmitterModule.forRoot()` 全局
- `@OnEvent('event.name')` 装饰器
- `emitter.emit('event', payload)` 同步
- 异步监听器可返回 Promise
- wildcards 支持

**最佳实践**：进程内解耦用 event-emitter，跨服务才用 Microservices。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：新项目从零搭 Nest 工程。

**解决方案**：`nest new app` 生成 7 件套：main.ts（bootstrap） / app.module.ts（root） / app.controller.ts / app.service.ts / main.ts 配置 ConfigModule / Pipe 全局 ValidationPipe / Filter 全局 HttpExceptionFilter。

**关键参数**：
- `app.useGlobalPipes(new ValidationPipe())`
- `app.useGlobalFilters(new HttpExceptionFilter())`
- `app.enableCors()`
- `app.setGlobalPrefix('api')`
- `NestFactory.create(AppModule)`

**最佳实践**：所有项目都用 7 件套模板，10 分钟生成可运行项目。

### 模式 17 · 4 件套最佳实践

**问题场景**：Guard / Pipe / Interceptor / Filter 不知道何时用哪个。

**解决方案**：Guard 做权限/角色/Premium 会员；Pipe 做参数类型转换/校验（class-validator）；Interceptor 做日志/缓存/超时/重试；Filter 做统一异常响应。

**关键参数**：
- `JwtAuthGuard` 全局
- `ValidationPipe` + `class-validator` + `class-transformer`
- `LoggingInterceptor` 记录耗时
- `AllExceptionsFilter` 统一 JSON 错误
- 顺序：Guard > Pipe > Interceptor > Handler

**最佳实践**：跨切关注不写在业务代码里，全部走 4 件套。

### 模式 18 · Docker + K8s 部署

**问题场景**：Nest 单容器/多容器/K8s 部署差异大。

**解决方案**：`Dockerfile` 多阶段构建（builder + runtime），`@nestjs/terminus` 健康检查 + K8s liveness/readiness/startup probe。

**关键参数**：
- 多阶段 Dockerfile
- terminus HealthCheck
- K8s liveness/readiness/startup
- 环境变量 ConfigModule
- SIGTERM 优雅停服

**最佳实践**：所有 Nest 项目都上 K8s + terminus，优雅停服 30 秒硬超时。

### 模式 19 · 与 Express / Fastify / Koa / Hapi 对比

**问题场景**：选型在 Nest / Express / Fastify / Koa / Hapi 之间。

**解决方案**：Nest 定位「企业级后端 + 强模块边界 + 跨传输」，适合中大型团队；Express 定位「极简 + 灵活」，适合小项目；Fastify 定位「性能 + schema」，适合高并发 API；Koa 定位「中间件洋葱」，适合高度定制。

**关键参数**：
- 学习曲线：Koa < Express < Fastify < Nest
- 模块化：Nest > Fastify > Express > Koa
- 性能：Fastify > Nest(Fastify) > Nest(Express) > Express
- 生态：Nest ≈ Express > Fastify > Koa

**最佳实践**：中大型项目用 Nest(Fastify)，MVP 用 Express，高性能 API 用 Fastify。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：团队想 fork Nest 做内部精简框架。

**解决方案**：7 天分 5 步：① 装饰器 + reflect-metadata 注入 ② Module 边界 + DI 容器 ③ 4 件套基础实现（Guard/Pipe/Interceptor/Filter） ④ Express 平台适配 ⑤ Microservices Transport 抽象。

**关键参数**：
- Day 1: 装饰器
- Day 2: DI 容器
- Day 3: 4 件套
- Day 4: Express 适配
- Day 5: Microservices
- Day 6-7: 文档 + 灰度

**最佳实践**：7 天只能做「最小可跑内核」，完整 Nest 复刻需要 3 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\nest\`
- **大小**: ~10 MB
- **总文件数**: 9 个 npm 包 + 集成测试
- **关键 commit**: v11.1.10
- **作者**: Kamil Myśliwiec + Trilon 团队
- **许可**: MIT

## 一句话总结

Nest 把 Angular 的装饰器 + DI 体验搬进 Node.js，用 4 件套（Guards/Pipes/Interceptors/Filters）+ Module 边界 + 9 种传输协议统一了「中大型后端」的工程范式，是 Node 生态唯一一个把「架构」做成开箱即用的框架。
