# NestJS - TypeScript 全栈 IoC 装饰器框架

**GitHub**: nestjs/nest
**Star**: 70k+
**语言**: TypeScript
**主题**: nodejs、framework、typescript、microservice
**适用场景**: 中后台 API、GraphQL、微服务、WebSocket、长连接推送

---

## 一、基础范式

### 模式 1 · 装饰器 + 控制器（@Controller / @Get / @Post）

**问题场景**：Express 路由散落，难维护，TypeScript 体验差。

**解决方案**：NestJS 用装饰器组织路由：`@Controller('users') class UsersController { @Get(':id') getOne(@Param('id') id) {} }`，类即路由，方法即 handler，参数自动注入。

**关键参数**：
- `@Controller('prefix')`
- `@Get` / `@Post` / `@Put` / `@Delete`
- `@Param` / `@Body` / `@Query` / `@Headers`
- TypeScript first
- 0 路由配置

**最佳实践**：所有新项目用 NestJS 装饰器风格，告别 Express 路由散落。

### 模式 2 · 依赖注入（DI 容器 + Provider）

**问题场景**：Express 手写 new Service() 难测试，难替换。

**解决方案**：NestJS 内置 IoC 容器，`@Injectable() class UsersService {}` 声明 provider；`constructor(private readonly service: UsersService) {}` 自动注入；测试用 `Test.createTestingModule` 替换。

**关键参数**：
- `@Injectable()`
- 构造函数注入
- `Test.createTestingModule`
- `overrideProvider`
- 0 new

**最佳实践**：所有 NestJS 项目用构造函数注入，告别手写 new。

### 模式 3 · 模块（@Module）

**问题场景**：单文件太大，需要模块化（用户 / 订单 / 商品）。

**解决方案**：`@Module({ imports, controllers, providers, exports })` 装饰器声明模块；`imports: [TypeOrmModule.forFeature([User])]` 引入依赖模块；`exports: [UsersService]` 暴露给其他模块。

**关键参数**：
- `@Module`
- `imports` / `exports`
- `controllers` / `providers`
- `forFeature` / `forRoot`
- 模块边界

**最佳实践**：所有中大型 NestJS 项目用模块边界，DI 显式声明。

### 模式 4 · 中间件（Middleware / Interceptor / Guard / Pipe / Filter）

**问题场景**：横切关注点（日志 / 鉴权 / 验证 / 异常）难复用。

**解决方案**：NestJS 5 大横切：① Middleware（请求前，Express 风格）② Guard（路由守卫，鉴权）③ Interceptor（AOP，包装 handler）④ Pipe（参数转换 / 验证）⑤ ExceptionFilter（异常兜底）；`@UseGuards(AuthGuard)` 装饰器使用。

**关键参数**：
- `@UseGuards`
- `@UseInterceptors`
- `@UsePipes`
- 5 大横切
- 装饰器组合

**最佳实践**：所有横切用 5 大件，告别在 handler 内 `if (!user) throw`。

### 模式 5 · 异常处理（HttpException + ExceptionFilter）

**问题场景**：异常响应格式不统一，4xx / 5xx 难追踪。

**解决方案**：`throw new NotFoundException('User not found')` 抛 HTTP 异常；`@Catch(HttpException) class GlobalFilter implements ExceptionFilter` 全局兜底，统一响应格式。

**关键参数**：
- `NotFoundException`
- `BadRequestException`
- `@Catch`
- `ExceptionFilter`
- 全局 vs 局部

**最佳实践**：所有项目用内置 Exception + 全局 Filter，统一响应格式。

---

## 二、扩展范式

### 模式 6 · TypeORM / Prisma 数据库集成

**问题场景**：手写 SQL 字符串拼接不安全。

**解决方案**：`TypeOrmModule.forRoot({ type: 'postgres', entities, synchronize: true })` 配置；`@Entity() @PrimaryGeneratedColumn() @Column() class User {}` 定义实体；`@InjectRepository(User) private repo: Repository<User>` 注入。

**关键参数**：
- `TypeOrmModule.forRoot`
- `@Entity` / `@Column`
- `Repository<T>`
- 迁移 vs synchronize
- 0 SQL

**最佳实践**：所有 Node + DB 项目用 TypeORM / Prisma 集成。

### 模式 7 · GraphQL（code-first / schema-first）

**问题场景**：需要 GraphQL API。

**解决方案**：`@Resolver(() => User) class UserResolver { @Query(() => User) getUser(@Args('id') id: string) {} }` code-first；`GraphQLModule.forRoot({ autoSchemaFile: 'schema.gql' })` 自动生成 schema。

**关键参数**：
- `@Resolver` / `@Query` / `@Mutation`
- `code-first`
- `autoSchemaFile`
- `ObjectType` / `@Field`
- 0 schema 维护

**最佳实践**：所有 GraphQL 项目用 NestJS code-first，开发效率 10x。

### 模式 8 · 微服务（Redis / Kafka / RabbitMQ / NATS）

**问题场景**：需要分布式微服务通信。

**解决方案**：`@MessagePattern('user_created') @EventPattern('user_event')` 装饰器定义 handler；`ClientsModule.register([{ name: 'USER_SERVICE', transport: Transport.REDIS }])` 配置；TCP / Redis / NATS / Kafka / RabbitMQ / gRPC 6 种 transport。

**关键参数**：
- `@MessagePattern`
- `ClientsModule.register`
- 6 种 transport
- 请求 - 响应
- 事件驱动

**最佳实践**：所有微服务项目用 NestJS，平台无关 6 种 transport。

### 模式 9 · WebSocket（@WebSocketGateway）

**问题场景**：需要 WebSocket 长连接（聊天 / 通知）。

**解决方案**：`@WebSocketGateway() class ChatGateway implements OnGatewayConnection { @WebSocketServer() server: Server; @SubscribeMessage('msg') handleMessage() {} }` 装饰器风格 WebSocket；Socket.io / WS 原生支持。

**关键参数**：
- `@WebSocketGateway`
- `@SubscribeMessage`
- Socket.io
- `OnGatewayConnection`
- 命名空间

**最佳实践**：所有 WebSocket 项目用 NestJS Gateway，告别手写 ws。

### 模式 10 · 配置管理（@nestjs/config）

**问题场景**：环境变量散落，硬编码密码。

**解决方案**：`ConfigModule.forRoot({ isGlobal: true, load: [config] })` 全局配置；`@nestjs/config` + Joi / class-validator 验证；`ConfigService.get('DB_HOST')` 注入使用。

**关键参数**：
- `ConfigModule.forRoot`
- `.env` 文件
- Joi 验证
- 命名空间
- 全局 vs 模块

**最佳实践**：所有项目用 @nestjs/config + .env + 验证，告别硬编码。

---

## 三、进阶范式

### 模式 11 · 依赖注入高级（自定义 Provider / Scope）

**问题场景**：需要非类 provider（值 / 工厂 / 别名）或请求作用域。

**解决方案**：`{ provide: 'CONFIG', useValue: { apiKey: 'xxx' } }` 值；`useFactory: (config) => ({ ... })` 工厂；`useClass: MockService` 别名；`scope: Scope.REQUEST` 请求作用域。

**关键参数**：
- `useValue` / `useFactory` / `useClass`
- `Scope.DEFAULT` / `REQUEST` / `TRANSIENT`
- token 字符串
- 生命周期
- 灵活

**最佳实践**：所有需要 Mock / 配置 / 动态 provider 用自定义 Provider。

### 模式 12 · 自定义装饰器（@User / @Roles）

**问题场景**：需要在 handler 中取当前用户（来自 JWT），参数装饰器要写多次。

**解决方案**：`createParamDecorator((data, ctx) => ctx.switchToHttp().getRequest().user) export const CurrentUser = ...`；`@CurrentUser() user: User` 一行取用户。

**关键参数**：
- `createParamDecorator`
- `ExecutionContext`
- `switchToHttp()` / `switchToRpc()` / `switchToWs()`
- 复用
- 0 重复

**最佳实践**：所有常用参数（用户 / 角色 / IP）用自定义装饰器。

### 模式 13 · 拦截器（AOP 编程）

**问题场景**：需要在 handler 前后加逻辑（计时 / 缓存 / 转换）。

**解决方案**：`@Injectable() class TimingInterceptor implements NestInterceptor { intercept(ctx, next) { const start = Date.now(); return next.handle().pipe(tap(() => console.log(Date.now() - start))) } }` 装饰器 + RxJS。

**关键参数**：
- `NestInterceptor`
- `intercept(ctx, next)`
- `next.handle()` Observable
- `map` / `tap` / `catchError`
- AOP

**最佳实践**：所有横切（计时 / 缓存 / 日志）用 Interceptor + RxJS。

### 模式 14 · 测试（@nestjs/testing）

**问题场景**：依赖注入的代码难测试。

**解决方案**：`Test.createTestingModule({ providers: [UsersService, { provide: getRepositoryToken(User), useValue: mockRepo }] }).compile()` 创建测试模块；mock 替换 provider。

**关键参数**：
- `Test.createTestingModule`
- `overrideProvider`
- `getRepositoryToken`
- `compile()` / `get()`
- 完整 IoC 测试

**最佳实践**：所有 NestJS 项目用 @nestjs/testing + 真实 DI 测试。

### 模式 15 · CQRS（@nestjs/cqrs）

**问题场景**：复杂业务用 Service 太啰嗦，难审计。

**解决方案**：`@nestjs/cqrs` 模块分离命令（Command）和查询（Query）：`class CreateUserCommand {} class CreateUserHandler implements ICommandHandler<CreateUserCommand> {}`；EventSourcing 事件溯源。

**关键参数**：
- `Command` / `Query` / `Event`
- `ICommandHandler`
- `CommandBus` / `QueryBus`
- `EventBus`
- CQRS + EventSourcing

**最佳实践**：所有复杂业务用 CQRS + EventSourcing，审计 + 测试 10x。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 NestJS 项目。

**解决方案**：7 件套：① `nest new app` CLI 初始化 ② `AppModule` 根模块 ③ `ConfigModule` + `.env` ④ `TypeOrmModule` 数据库 ⑤ `UsersModule` 业务模块 ⑥ `AuthModule` + JWT ⑦ `GlobalExceptionFilter` 兜底。

**关键参数**：
- `nest new`
- AppModule
- ConfigModule
- TypeOrmModule
- UsersModule
- AuthModule
- ExceptionFilter

**最佳实践**：所有新项目用 7 件套 + NestJS CLI，10 分钟跑起来。

### 模式 17 · 部署到 Docker + PM2 / K8s

**问题场景**：NestJS 怎么部署。

**解决方案**：`node dist/main.js` 直接跑；`pm2 start dist/main.js -i max` 集群模式；Dockerfile 多阶段构建 `node:20-alpine`；K8s 配 `livenessProbe: /health`；`@nestjs/terminus` 健康检查。

**关键参数**：
- `node dist/main.js`
- PM2 集群
- Docker 多阶段
- K8s liveness
- 0 配置

**最佳实践**：所有 NestJS 生产用 Docker + PM2 / K8s 部署。

### 模式 18 · 性能优化 5 招

**问题场景**：NestJS 性能问题。

**解决方案**：5 招优化：① 启用 Fastify adapter（比 Express 快 2x）② `synchronize: false` 关闭自动同步 ③ Redis 缓存装饰器 `@CacheInterceptor` ④ Cluster 模式 ⑤ `@nestjs/terminus` 健康检查。

**关键参数**：
- Fastify
- `synchronize: false`
- 缓存
- Cluster
- 健康检查

**最佳实践**：5 招组合，NestJS 吞吐 10x。

### 模式 19 · 与 Express / Koa / Fastify / Spring 对比

**问题场景**：Node 框架选型。

**解决方案**：NestJS 定位「装饰器 + DI + 多平台」适合中大型；Express 定位「极简中间件」适合小型；Koa 定位「洋葱模型 async」适合中型；Fastify 定位「极致性能」适合高性能；Spring 定位「Java 同模式」适合 Java 转 Node。

**关键参数**：
- 学习曲线：Express < Koa < Fastify < NestJS
- 性能：Fastify > NestJS(Fastify) > NestJS(Express) > Koa > Express
- 生态：Express > NestJS > Koa > Fastify
- TS 体验：NestJS > Fastify > Koa > Express

**最佳实践**：中大型选 NestJS，小型选 Express，高性能选 Fastify。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork NestJS 做内部框架。

**解决方案**：7 天分 5 步：① Reflect metadata 实现装饰器 ② IoC 容器（注册 + 解析）③ 路由扫描 + 装饰器映射 ④ Middleware / Guard / Interceptor ⑤ ExceptionFilter。

**关键参数**：
- Day 1-2: Reflect
- Day 3: IoC
- Day 4: 路由
- Day 5: 横切
- Day 6-7: Exception

**最佳实践**：7 天复刻「极简 NestJS」，完整 NestJS 复刻需要 6 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\nestjs\nest\`
- **大小**: ~30 MB
- **总文件数**: 数百 TS 文件
- **关键 commit**: v10.x
- **作者**: Kamil Mysliwiec + 社区
- **许可**: MIT

## 一句话总结

NestJS 用「装饰器 + IoC DI + 模块化 + 5 大横切 + 6 种 transport」把 Node 后端开发做到 Spring 级别的工程化，是 TypeScript 全栈框架的事实标准。
