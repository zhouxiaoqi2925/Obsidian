# nestjs-nest - TypeScript 全栈 IoC 装饰器框架

**GitHub**: https://github.com/nestjs/nest
**Star**: 70k+
**语言**: TypeScript
**主题**: Node.js 框架 / IoC / 装饰器 / 微服务
**适用场景**: 中后台 API、GraphQL、微服务、WebSocket、长连接推送

## 第一段：基础范式

### 模式 1: 装饰器 + 反射元数据驱动
**问题场景**：传统 Node.js 路由/中间件靠手动 `app.get('/user', handler)` 注册，应用一复杂就成面条代码。
**解决方案**：NestJS 用 @Controller、@Get、@Injectable 装饰器把"路由+依赖"声明在类上。底层 reflect-metadata 把"什么类、什么方法、依赖谁"写进 Reflect.metadata，运行时由 Scanner 扫描所有模块，注入器根据元数据自动装配。
**关键参数**：
- @Module() / @Controller() / @Injectable()：三大声明装饰器
- reflect-metadata：polyfill，全局 Reflect.metadata
- @Inject(TOKEN)：自定义 Provider 标识
- @SetMetadata('roles', ['admin'])：自定义元数据
**最佳实践**：每个 class 一律 `@Injectable()`，避免动态 new，便于测试和 AOP。

### 模式 2: IoC 容器与依赖注入
**问题场景**：服务 A 依赖 B，B 又依赖 C，手动 new 链冗长且难测。
**解决方案**：Nest 的 injector 用"令牌 → 实例"映射管理所有 Provider。scope 默认 SINGLETON，REQUEST scope 每次请求新建。`getInstanceByToken` 递归构建依赖树。Provider 可以是 class、value、factory 三种。
**关键参数**：
- Provider 四种：useClass / useValue / useFactory / useExisting
- 作用域：DEFAULT / REQUEST / TRANSIENT
- Optional：@Optional() 允许无依赖
- 自装配：`providers: [Service]` 自动实例化
**最佳实践**：依赖永远走接口（abstract class），不上层不 new 业务类。

### 模式 3: 模块 Module 边界与懒加载
**问题场景**：项目大了后所有类堆在一个 module 里，启动慢、循环依赖多。
**解决方案**：@Module() 声明 imports / controllers / providers / exports。Module 是"逻辑包"，可单独启动也可被 import。LazyModuleLoader 在第一次访问时按需加载，节省启动时间。
**关键参数**：
- imports / exports：模块依赖图
- providers 私有 / exports 公开
- @Global()：全模块共享单例
- LazyModuleLoader#load：按需加载
**最佳实践**：按业务域切分模块（UserModule / OrderModule），避免单 module 200+ provider。

### 模式 4: 请求管道 Pipeline
**问题场景**：每个 controller 要重复写鉴权、参数校验、异常处理、响应转换。
**解决方案**：Nest 设计 5 段式请求管道：Middleware → Guard → Interceptor (pre) → Pipe → Handler → Interceptor (post) → ExceptionFilter。每一段都是可插拔的 DI 单元。
**关键参数**：
- Middleware：req/res 直接改写
- Guard：canActivate 返回 boolean
- Interceptor：AOP 包裹（rxjs）
- Pipe：参数转换（class-validator）
- ExceptionFilter：异常到 HTTP 响应
**最佳实践**：权限用 Guard，格式用 Pipe，日志/计时用 Interceptor，5xx 兜底用 Filter。

### 模式 5: 平台抽象 HTTP/WebSocket/Microservice
**问题场景**：Express / Fastify / Socket.io / Kafka / gRPC 各自一套 API，业务逻辑要复用。
**解决方案**：Nest 设计 INestApplication + 多个 platform adapter（platform-express、platform-fastify、platform-socket.io、platform-microservices）。业务代码只调 HttpAdapter，统一编译成对应实现。
**关键参数**：
- NestFactory.create(AppModule, express | fastify)
- 通用：app.use(cookieParser())
- MicroserviceOptions：transport: TCP / REDIS / NATS / KAFKA / GRPC
- Hybrid app：同时支持 HTTP + WebSocket
**最佳实践**：高吞吐服务用 fastify adapter，QPS 可从 1.5 万提到 4 万。

## 第二段：扩展范式

### 模式 6: Express / Fastify 双 adapter
**问题场景**：Express 生态成熟但性能一般；Fastify 性能强但生态小。
**解决方案**：Nest 把路由、req/res 抽象成 HttpServer / AbstractHttpAdapter。Express 和 Fastify 各自实现：platform-express 的 ExpressAdapter 把 req/res 包成 http.IncomingMessage / ServerResponse；platform-fastify 的 FastifyAdapter 用 reply.send / request 桥接。
**关键参数**：
- NestExpressApplication：extend express 实例
- NestFastifyApplication：extend fastify 实例
- 性能差：Fastify 比 Express 吞吐高 2-3 倍
- 迁移成本：装饰器层无感
**最佳实践**：新项目默认 Fastify；老项目用 Express + 无痛升级。

### 模式 7: 微服务传输层 Transport
**问题场景**：单体 Nest 应用拆微服务后，进程间通信（TCP/HTTP/Redis/NATS/Kafka/gRPC）难以统一。
**解决方案**：@nestjs/microservices 抽象 ClientProxy / Server，开发者写 @MessagePattern('sum') handler，框架按 transport 把请求路由到指定 handler。内置 transport：TCP、REDIS、NATS、KAFKA、GRPC、RMQ。
**关键参数**：
- transport: Transport.TCP / REDIS / NATS / KAFKA / GRPC
- @MessagePattern / @EventPattern
- 客户端：ClientProxy.send('cmd', payload)
- 序列化：JSON / Avro / Protobuf
**最佳实践**：跨服务调用先发 'event' 再 send 'cmd'，避免硬耦合。

### 模式 8: GraphQL 代码优先与模式优先
**问题场景**：RESTful 接口在复杂业务里不够用，GraphQL 客户端需要灵活查询。
**解决方案**：@nestjs/graphql 支持 code-first（@ObjectType() + @Resolver()）和 schema-first（写 .graphql）。Apollo Server 4 是默认引擎，TypeGraphQL 风格与装饰器深度集成。
**关键参数**：
- @ObjectType() / @Field()
- @Resolver(() => User)
- @Query / @Mutation / @Subscription
- DataLoader 防 N+1
**最佳实践**：code-first 适合 TS 强类型团队；schema-first 适合前端主导。

### 模式 9: WebSocket Gateway
**问题场景**：聊天、直播、推送等长连接业务，用 polling 太浪费。
**解决方案**：@WebSocketGateway 装饰器声明 Gateway，@SubscribeMessage('event') 声明订阅，@WebSocketServer 注入 server 实例。基于 socket.io 或 ws，框架统一事件分发。
**关键参数**：
- transport: socket.io / ws
- namespace：路径隔离
- WsException：自定义异常
- Gateway + Microservice 组合
**最佳实践**：用 namespace 做多房间隔离，广播用 server.to(room).emit。

### 模式 10: 配置与生命周期
**问题场景**：配置散落代码里、启动/关闭钩子难统一。
**解决方案**：@nestjs/config 加载 .env 与远程配置（Consul、Vault）。onModuleInit / onApplicationBootstrap / onModuleDestroy / beforeApplicationShutdown / onApplicationShutdown 5 个生命周期钩子。
**关键参数**：
- ConfigModule.forRoot({ isGlobal: true })
- Joi / class-validator schema 校验
- 钩子顺序：init → bootstrap → shutdown
- 优雅停机：响应 SIGTERM
**最佳实践**：DB 连接、Redis、队列消费者都在 onModuleInit 建，在 destroy 优雅关。

## 第三段：进阶范式

### 模式 11: 拦截器与 AOP
**问题场景**：每个 handler 重复写"日志→计时→缓存→响应映射"。
**解决方案**：Interceptor 用 rxjs 的 tap / map / catchError 包装整个请求流。NestInterceptor.nest.intercept(ctx, next) 返回 Observable。常用：LoggingInterceptor、CacheInterceptor、TimeoutInterceptor、TransformInterceptor。
**关键参数**：
- @UseInterceptors(Class)
- 全局：app.useGlobalInterceptors(new Class())
- 响应映射：map(data => ({ data, status: 'ok' }))
- 缓存：tap 命中即短路
**最佳实践**：跨切关注（监控/审计）用 Interceptor，权限用 Guard，参数用 Pipe，5xx 用 Filter。

### 模式 12: 守卫与权限模型
**问题场景**：RBAC、ABAC 权限控制要落到接口上，复杂多角色。
**解决方案**：CanActivate.guard.canActivate(ctx) 返回 boolean | Promise | Observable。AuthGuard 是基础，RolesGuard 配合 @Roles('admin') Reflector 自定义元数据。@nestjs/passport 集成 JWT、OAuth2、API Key。
**关键参数**：
- @UseGuards(AuthGuard, RolesGuard)
- @SetMetadata('roles', ['admin'])
- Reflector.get('roles', ctx.getHandler())
- 自定义 PassportStrategy
**最佳实践**：Guard 只做"通过/不通过"，失败抛 ForbiddenException，不要直接 res.send。

### 模式 13: 管道与 class-validator
**问题场景**：DTO 校验重复、@Min @Max 注解散在代码里。
**解决方案**：class-validator + class-transformer 组合，DTO 类加 @IsString @IsInt @Min 装饰器，全局 ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }) 拦截所有 handler 参数。
**关键参数**：
- @IsEmail() / @IsOptional() / @Min(0) / @Max(100)
- whitelist: true 剥离未知字段
- forbidNonWhitelisted: 拒绝未知字段
- transform: true 自动 plainToClass
**最佳实践**：入参 DTO 永远走 ValidationPipe，DB 实体不进 controller。

### 模式 14: 测试与 Mock
**问题场景**：依赖多难写单测，e2e 慢且脆。
**解决方案**：@nestjs/testing 提供 Test.createTestingModule，覆盖 Provider 即可单测。e2e 用 supertest 跑真实 HTTP。Mocking 用 jest.spyOn / 替换 useValue。
**关键参数**：
- Test.createTestingModule({ providers: [{ provide: X, useValue: mock }] })
- overrideProvider / overrideGuard / overrideInterceptor
- e2e：supertest(app.getHttpServer())
- Jest 的 jest.fn() / mockResolvedValue
**最佳实践**：覆盖率盯 branch > 80%，e2e 只跑关键路径（登录 / 支付 / 下单）。

### 模式 15: Monorepo 与 lerna/nx
**问题场景**：微服务拆成多个 npm 包后，发布、依赖、构建全乱。
**解决方案**：Nest 官方 nestjs/nest 用 lerna 维护 14+ 包。社区更推 Nx + nest 插件（@nx/nest）做 monorepo。lerna 5+ 改用 workspace protocol，Nx 提供 task graph 和 cache。
**关键参数**：
- packages/ 子目录即子包
- tsconfig.base.json 共享
- Nx：`nx run-many --target=build`
- cache：本地 + CI 远程 cache
**最佳实践**：大团队用 Nx，按业务切 library（libs/users / libs/orders）。

## 第四段：实战范式

### 模式 16: 启动一个真实 REST 服务
**问题场景**：从 0 搭一个生产级 Nest 服务要 30 分钟？
**解决方案**：nest new app-name → nest g resource users → 装 @nestjs/config class-validator class-transformer → main.ts 启用 ValidationPipe、Prefix、Swagger。整套不超过 5 分钟。
**关键参数**：
- nest new / nest generate
- @nestjs/swagger 自动 OpenAPI
- helmet 启用安全头
- throttler 限流
**最佳实践**：首次启动必装 helmet、throttler、cors 三件套。

### 模式 17: 数据库集成（TypeORM / Prisma / MikroORM）
**问题场景**：ORM 选型影响整体架构。
**解决方案**：官方支持 TypeORM（@nestjs/typeorm，装饰器风格）、Prisma（独立 schema.prisma，类型更强）、MikroORM（ID 映射，性能优）。TypeORM 适合快速起步，Prisma 适合类型严格。
**关键参数**：
- TypeOrmModule.forRoot({ type: 'postgres', entities: [...] })
- Repository 注入：@InjectRepository(User)
- Prisma：PrismaClient 注入，schema.prisma 单独管理
- Migration / synchronize
**最佳实践**：生产 disable synchronize，用 migration 文件管理 schema。

### 模式 18: 部署与 Docker
**问题场景**：怎么把 Nest 部署到 Docker / K8s？
**解决方案**：多阶段 Dockerfile：builder 阶段跑 `npm run build`，runtime 阶段用 distroless / node:20-alpine 跑 `node dist/main.js`。K8s 配 readiness / liveness 探针走 /health。
**关键参数**：
- 多阶段：node:20-alpine → builder → runtime
- ENV PORT=3000
- CMD ["node", "dist/main.js"]
- liveness: /health
- 优雅停机：SIGTERM 信号
**最佳实践**：CPU/内存 limit 给 70% 实际峰值，留 30% 给 burst。

### 模式 19: 监控与可观测性
**问题场景**：上线后如何快速定位慢请求、内存泄漏、错误率？
**解决方案**：集成 OpenTelemetry（@opentelemetry/sdk-node），把 trace 注入到 Logger、Interceptor、HTTP。Prometheus 抓 /metrics，Jaeger / Tempo 看 trace，Grafana 画图。
**关键参数**：
- @opentelemetry/api tracer
- @willsoto/nestjs-prometheus
- LoggerInterceptor 自动记录 status + latency
- Pino 日志库（结构化）
**最佳实践**：trace_id 注入 response header，方便用户复现。

### 模式 20: AI / 直播平台中的 Nest 应用
**问题场景**：AI 直播平台要支持实时音视频（WebRTC/SRT）、弹幕推送、商品挂车，怎么整合？
**解决方案**：Nest 部署三个服务：api-server（HTTP/GraphQL）、realtime-server（WebSocket Gateway + Redis Adapter 横向扩展）、ai-server（Python 微服务通过 gRPC 互调）。统一走 @nestjs/microservices。
**关键参数**：
- realtime-server：socket.io + redis adapter
- AI 推理：Python gRPC，Nest 调 .proto
- 商品挂车：REST + GraphQL 双协议
- 弹幕：BFF 聚合 + WebSocket 推流
**最佳实践**：高实时部分用 Fastify adapter + Redis pub/sub，吞吐比 Express + 内存广播高 5 倍。
