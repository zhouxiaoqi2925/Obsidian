# strapi - 容器化 CMS

**来源**：GitHub strapi/strapi（v5.46.1，HEAD `a419c32`）
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. 容器化服务注册（Container）

**问题场景**：
Strapi 内部 60+ 服务（db、auth、plugins、document-service、permissions、logger、request-context）需要在不同上下文（dev/test/prod）下被替换、懒加载、测试时 mock。直接 import 会产生循环依赖；用工厂函数又没有"显式声明依赖图"的能力。

**解决方案**：

```typescript
// packages/core/core/src/container.ts
export class Container {
  private registrations = new Map<string, () => unknown>();

  add<T>(name: string, factory: () => T): this {
    this.registrations.set(name, factory as () => unknown);
    return this;
  }

  get<T>(name: string, ...args: unknown[]): T {
    const factory = this.registrations.get(name);
    if (!factory) throw new Error(`Service "${name}" not registered`);
    return factory() as T; // 第一次 get 才执行 factory（懒求值）
  }

  extend(name: string, overrideFactory: (current: any) => any): this {
    const prev = this.registrations.get(name);
    this.registrations.set(name, () => overrideFactory(prev?.()));
    return this;
  }
}

// Strapi 主类
class Strapi extends Container {
  get db() { return this.get('db'); }
  get plugins() { return this.get('plugins'); }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `registration` | factory function | 懒求值 |
| `extend` | 装饰旧 factory | 适合覆盖默认 |
| `args` | 未真正使用 | 注释自承 TODO |
| `Container extends` | Strapi 主类 | 60+ getter 全部代理 |

**最佳实践**：
1. ✅ 工厂函数而非类构造——支持懒求值
2. ✅ `extend()` 包装旧 factory——测试可注入 mock
3. ✅ Strapi 主类暴露 60+ getter——IDE 提示完整
4. ✅ Service Locator 反模式——getter 链太长时画依赖图
5. ✅ `Container.get(name, args)` 的 `args` 占位是技术债——单例/工厂语义不清

---

### 2. 文档服务（Document Service）

**问题场景**：
v4 的 EntityService 把 draft/publish、i18n、components、relations 散落在 controller 各处——横切逻辑改一处就要扫 200+ 文件。v5 需要一个"统一工厂 + 中间件注入"的方式把横向能力收拢。

**解决方案**：

```typescript
// packages/core/core/src/services/document-service/index.ts
function createDocumentService(strapi: Strapi) {
  return new Proxy({}, {
    get: (_, uid: string) => {
      // 每次访问 uid 都返回一个 documents 工厂
      return middlewares.wrapObject(
        {
          findMany: (params) => repository.findMany(uid, params),
          findOne: (params) => repository.findOne(uid, params),
          create: (params) => repository.create(uid, params),
          update: (params) => repository.update(uid, params),
          delete: (params) => repository.delete(uid, params),
          publish: (params) => repository.publish(uid, params),
          unpublish: (params) => repository.unpublish(uid, params),
          count: (params) => repository.count(uid, params),
        },
        { strapi, uid, action: '<auto>' }
      );
    }
  });
}

// 使用
await strapi.documents('api::article.article').findMany({
  status: 'draft',  // Draft & Publish 走 middleware
  locale: 'en'      // i18n 走 middleware
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `uid` | 'api::article.article' | content type 唯一 id |
| `status` | 'draft' / 'published' | Draft & Publish |
| `locale` | 'en' / 'zh' | i18n |
| `fields` | ['title', 'body'] | 字段投影 |
| `populate` | ['author', 'category'] | 关系填充 |

**最佳实践**：
1. ✅ 横向能力（draft/i18n/relations）统一收进 Document Service
2. ✅ `strapi.documents(uid).findMany({ status, locale })` 显式声明
3. ✅ 不要再用 v4 的 `strapi.entityService.findMany(...)`——已弃用
4. ✅ `populate` 用 `['*']` 慎用——N+1 风险
5. ✅ Document Service 走 middleware-manager，不写 controller 复写

---

### 3. 三方对比 Schema 同步（3-way diff）

**问题场景**：
用户改 JSON schema 就期望数据库表自动变——但只在"DB 当前状态"和"用户新 schema"之间 diff 会误删"用户没声明但 DB 已有"的表（比如手加的索引）。需要在"DB / 上次 sync 状态 / 用户新 schema"三方之间做三方对比。

**解决方案**：

```typescript
// packages/core/database/src/schema/index.ts
class SchemaProvider {
  async syncSchema() {
    // 1) 读三个 schema
    const databaseSchema = await this.dbInspector.getSchema();  // DB 实际
    const storedSchema = await this.schemaStorage.read();       // strapi 上次的认知
    const userSchema = this.schema;                              // 用户最新改的

    // 2) 三方 diff
    const { status, diff } = await this.schemaDiff.diff({
      previousSchema: storedSchema?.schema,
      databaseSchema,
      userSchema
    });

    if (status === 'UNCHANGED') return;
    if (status === 'CHANGED') {
      // 3) 落库
      await this.builder.updateSchema(diff);
      // 4) 把"当前认知"写到 strapi_database_schema 表
      await this.schemaStorage.write(userSchema);
    }
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `databaseSchema` | dbInspector | 真实 DB |
| `storedSchema` | strapi_database_schema 表 | 上次 sync 状态 |
| `userSchema` | bootstrap 时加载 | 用户最新 |
| `status` | UNCHANGED / CHANGED | diff 结果 |
| `diff.actions` | createTable/alterColumn/drop | 落到 SQL |

**最佳实践**：
1. ✅ 3-way diff 是"声明式 schema 同步"工程化的甜蜜点
2. ✅ strapi_database_schema 表存在连接 DB 内——保证下次启动能恢复
3. ✅ 自研成本极高——新项目优先用 Prisma Migrate / Drizzle Kit / Atlas
4. ✅ `syncSchema` 在 bootstrap 阶段跑——不要在请求处理时跑
5. ✅ 大表改列要先 backfill——schema sync 不替你做数据迁移

---

### 4. 权限引擎（Permission Engine）

**问题场景**：
Strapi 的 RBAC 不仅是"角色 → 权限"映射，还要支持 content type 粒度（如 `api::article.article.find`）、field 粒度（如隐藏 password 字段）、condition（`published` 才返回）。需要一个规则引擎把这些"维度"收拢到一个 `can(ability, ctx)` 接口。

**解决方案**：

```typescript
// packages/core/core/src/services/permissions/engine.ts
const { AbilityBuilder, createAbility } = require('@casl/ability');

async function generateUserAbility(user, ctx) {
  const { can, build } = new AbilityBuilder(createAbility);
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { id: user.role.id } });
  for (const action of role.actions) {
    if (matchesContext(action, ctx)) can(action.action, action.subject);
  }
  // field 粒度：fields 模式
  return build({
    detectSubjectType: (object) => object.uid ?? object.__type
  });
}

// 控制器内
const ability = await generateUserAbility(user, ctx.state);
if (ability.cannot('read', 'api::article.article')) {
  return ctx.forbidden('Insufficient permissions');
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `action` | 'read' / 'create' / 'update' / 'delete' / 'publish' | 5 个标准 |
| `subject` | 'api::article.article' | content type |
| `fields` | ['title', 'body'] | 字段投影 |
| `conditions` | { status: 'published' } | 条件 |
| `role` | Public / Authenticated / Custom | 角色 |

**最佳实践**：
1. ✅ 用 `@casl/ability` 做规则引擎——别自己写
2. ✅ `ability.can('action', 'subject')` 比 if/else 链易读
3. ✅ Public 角色权限默认 deny——除非显式开
4. ✅ field 粒度在 `fields` 数组——不在 `conditions` 字符串
5. ✅ Admin 权限和 API 权限是两套——别混

---

### 5. 进程分裂（cluster primary/worker）

**问题场景**：
`develop` 模式要做 TS 编译、admin build、文件监听、DB 初始化——这些都很慢。如果放在一个进程里，每次文件改动 HMR 都要把整个 Strapi 重启，admin build 抖动会反映到 dev server。需要"主进程管 build、子进程管运行"的 cluster 模式。

**解决方案**：

```typescript
// packages/core/strapi/src/node/develop.ts
import cluster from 'node:cluster';

if (cluster.isPrimary) {
  // 主进程：TS 编译 + admin build
  await checkDependencies();
  await cleanDist();
  await tsUtils.compile({ ignoreDiagnostics: true });
  await buildAdmin();
  // fork worker
  cluster.fork();
  cluster.on('message', (worker, msg) => {
    if (msg === 'reload') {
      // worker 触发 reload → primary 重编 TS + kill worker + fork
      tsUtils.compile().then(() => worker.kill());
    } else if (msg === 'killed') {
      cluster.fork(); // 自动重启
    }
  });
} else {
  // worker 进程：实际跑 Strapi
  const strapi = await createStrapi({ appDir, distDir }).load();
  await strapi.start();
  // 文件变化 → 发 IPC reload
  watcher.on('change', () => process.send('reload'));
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `cluster.isPrimary` | 条件分支 | 主/子进程 |
| `tsUtils.compile` | ignoreDiagnostics: true | 开发期不阻塞 |
| `IPC message` | 'reload' / 'killed' / 'stop' | 协议 |
| `cluster.fork()` | 自动重启 | worker 死了就 fork |
| `lazy require` | '@strapi/typescript-utils' | primary 不加载 |

**最佳实践**：
1. ✅ 主进程只管 build，子进程只管 run——职责清晰
2. ✅ IPC 协议 'reload' / 'killed' / 'stop'——三件套
3. ✅ `lazy<T>('@strapi/typescript-utils')` 避免 primary 加载重模块
4. ✅ `ignoreDiagnostics: true` 在 dev 阶段——错误日志兜底
5. ✅ 干净退出比 hot-swap 简单——worker 死了就 fork

---

## 二、架构设计

### 6. 插件五元组协议（Plugin Protocol）

**问题场景**：
60+ 内部插件、100+ 社区插件、上千个用户的 extension/ 目录扩展——如果每个插件都有自己的注册方式，生态会碎片化。需要一个"五元组协议"（register/bootstrap/destroy/config/routes/controllers/services/contentTypes）让插件有可预期的形状。

**解决方案**：

```typescript
// packages/core/core/src/loaders/plugins/index.ts
type Plugin = {
  register({ strapi }: { strapi: Strapi }): void | Promise<void>;
  bootstrap({ strapi }: { strapi: Strapi }): void | Promise<void>;
  destroy({ strapi }: { strapi: Strapi }): void | Promise<void>;
  config: { default: any; validator: (config: any) => any };
  routes: Route[];
  controllers: Record<string, Controller>;
  services: Record<string, Service>;
  contentTypes: Record<string, ContentType>;
};

const defaultPlugin: Plugin = {
  register() {}, bootstrap() {}, destroy() {}
};

// 用户态扩展：extensions/<plugin>/src/...
// 加载时先读 extensions，再 merge 到原 plugin
const userExtension = require('/path/to/extensions/users-permissions');
const merged = deepMerge(defaultPlugin, userExtension);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `register` | 注册 content type / 字段 | 早期 |
| `bootstrap` | 初始化 DB / 启 cron | 晚期 |
| `destroy` | 释放资源 | 优雅停 |
| `extensions/` | 用户态覆盖 | 不改源码 |
| `config.validator` | yup / zod | 校验 |

**最佳实践**：
1. ✅ Plugin = 五元组协议——register/bootstrap/destroy/config/routes/controllers/services/contentTypes
2. ✅ `extensions/<plugin>/` 目录允许用户态覆盖——不改源码
3. ✅ register 和 bootstrap 严格分开——register 阶段注册 schema，bootstrap 阶段 DB 同步
4. ✅ `config.validator` 用 yup/zod——错误信息友好
5. ✅ destroy 必须实现——优雅停服时释放资源

---

### 7. Response 语义方法（koa 装饰）

**问题场景**：
Strapi controller 作者写 `ctx.body = { error: 'not found' }` 容易出错：状态码忘设、错误格式不统一、前端机读 details 字段缺失。需要一个"框架批量注入"的方式让 `ctx.notFound()` / `ctx.forbidden()` 等语义方法开箱即用。

**解决方案**：

```typescript
// packages/core/core/src/services/server/koa.ts:72
import statuses from 'statuses';
import createError from 'http-errors';
import delegator from 'delegates';

statuses.codes
  .filter((code) => code >= 400 && code < 600)
  .forEach((code) => {
    const name = statuses(code); // 'Not Found'
    const camelCasedName = camelCase(name); // 'notFound'
    app.response[camelCasedName] = function (message = name, details = {}) {
      const httpError = createError(code, message, { details });
      const { status, body } = formatHttpError(httpError);
      this.status = status;
      this.body = body;
    };
    delegator.method(camelCasedName); // 投到 ctx.response 上
  });

// 使用
ctx.notFound('User not found', { userId: 123 });
ctx.forbidden('Permission denied', { requiredRole: 'admin' });
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `statuses.codes` | [400..599] | 标准 HTTP 状态 |
| `camelCase` | 'notFound' | 风格统一 |
| `http-errors` | createError | 标准化错误 |
| `delegates` | method() | 投到 ctx |
| `formatHttpError` | { status, body } | 统一格式 |

**最佳实践**：
1. ✅ 用 `statuses` 枚举批量生成语义方法——别手写 200 行
2. ✅ `delegates.method()` 把方法投到 ctx.response——省 `ctx.response.notFound()`
3. ✅ `details` 字段给前端机读——前端能按 schema 解析
4. ✅ controller 永远用 `ctx.notFound()` 而非 `ctx.status = 404`
5. ✅ 错误格式集中——前端只写一套错误处理

---

### 8. 对象反射中间件（wrapObject）

**问题场景**：
Document Service 不是一个 HTTP 路由——是 N 个方法（find/create/update/delete/publish）× M 个 content type 的二维空间。如果让每个 content type 写一个 controller 复写所有方法，关系/draft/i18n 的横切逻辑会爆炸。需要"对所有方法注入横切关注点"。

**解决方案**：

```typescript
// packages/core/core/src/services/document-service/middlewares/middleware-manager.ts
class MiddlewareManager {
  private middlewares: Middleware[] = [];

  use(mw: Middleware) {
    this.middlewares.push(mw);
    return this;
  }

  wrapObject(obj: Record<string, Function>, ctx: any) {
    const wrapped: Record<string, Function> = {};
    for (const [key, fn] of Object.entries(obj)) {
      wrapped[key] = this.wrap(fn, { ...ctx, action: key });
    }
    return wrapped;
  }

  wrap(fn: Function, ctx: any) {
    return async (...args: any[]) => {
      // 中间件链
      let idx = 0;
      const next = async () => {
        if (idx >= this.middlewares.length) return fn(...args);
        const mw = this.middlewares[idx++];
        return mw({ ...ctx, args }, next);
      };
      return next();
    };
  }
}

// 中间件
const draftFilterMw = ({ action, args }, next) => {
  if (action === 'findMany' || action === 'findOne') {
    args.filters = { ...args.filters, status: 'draft' };
  }
  return next();
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `wrap` | koa-compose 风格 | 串联中间件 |
| `ctx.action` | 'findMany' | 当前方法名 |
| `ctx.args` | [...callArgs] | 方法参数 |
| `next()` | 显式 await | 洋葱模型 |
| `use()` | 注册顺序敏感 | 先注册先跑 |

**最佳实践**：
1. ✅ 用 `wrapObject` 反射遍历方法——比 AOP 框架更轻
2. ✅ `ctx.action` 让中间件知道当前是 find 还是 create
3. ✅ `args` 是可变引用——中间件可改参数
4. ✅ 用 `koa-compose` 实现 `next()` 链——别手写
5. ✅ 中间件注册顺序敏感——先注册先跑

---

### 9. 配置提供器（Config Provider）

**问题场景**：
Strapi 配置有 4 层：默认（default.js）、环境（env=production.js）、项目（config/）、插件（plugin config）。环境变量要压倒文件。需要一个"按优先级合并"的 Config Provider。

**解决方案**：

```typescript
// packages/core/utils/src/config-provider.ts
function createConfigProvider(internalConfig: any, strapi: Strapi) {
  return new Proxy({}, {
    get(_, key: string) {
      // 1) 查 strapi.config 静态配置
      if (strapi.config.has(key)) return strapi.config.get(key);
      // 2) 查环境变量（strapi_<KEY>）
      const envKey = `strapi_${camelCase(key)}`;
      if (process.env[envKey]) return parseEnv(process.env[envKey]);
      // 3) 查内部默认
      return internalConfig[key];
    }
  });
}

// 使用
strapi.config.get('server.port', 1337);
strapi.config.get('database.connection.host');
strapi.config.get('admin.url'); // env: STRAPI_ADMIN_URL
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `internalConfig` | default.js | 最低优先级 |
| `strapi.config` | config/ | 用户配 |
| `env var` | STRAPI_<KEY> | 最高优先级 |
| `camelCase` | adminUrl → ADMIN_URL | 命名转换 |
| `parseEnv` | JSON.parse | 数组/对象 |

**最佳实践**：
1. ✅ 4 层优先级：default → env → config → env var
2. ✅ 环境变量前缀 `strapi_`——避免和别的服务冲突
3. ✅ 数组/对象用 JSON 序列化在 env var 里
4. ✅ 用 Proxy 而不是 get(key)——IDE 提示完整
5. ✅ 永远不要直接 `process.env.X` 读配置——用 config provider

---

### 10. 工厂三件套（createCoreController/Service/Router）

**问题场景**：
Strapi 的 controller/service/router 要给每个 content type 生成默认实现（`find` / `findOne` / `create` / `update` / `delete`），用户只需 override 自己关心的方法。但 TS 泛型要保住"用户 override 的方法签名不丢"。

**解决方案**：

```typescript
// packages/core/utils/src/factories.ts
export function createCoreController(uid, cfg = {}) {
  const { factory = defaultControllerFactory } = cfg;
  const base = factory(uid, cfg);
  // 用户的 controller
  const userCtrl = cfg({ strapi }).(uid, cfg) || {};
  // 兜底：用户没 override 就用 base
  return Object.setPrototypeOf(userCtrl, base);
}

function defaultControllerFactory(uid, { strapi }) {
  return {
    async find(ctx) {
      const data = await strapi.documents(uid).findMany(ctx.query);
      return { data, meta: { pagination: ... } };
    },
    async findOne(ctx) {
      const data = await strapi.documents(uid).findOne({ ...ctx.params });
      return { data };
    },
    async create(ctx) {
      const data = await strapi.documents(uid).create({ data: ctx.request.body });
      return ctx.created({ data });
    },
    // ... update / delete
  };
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `uid` | 'api::article.article' | content type |
| `factory` | defaultControllerFactory | 默认实现 |
| `setPrototypeOf` | user → base | 兜底方法 |
| `symbols.CustomController` | 标记 | 防止无限循环 |
| `return userCtrl` | undefined 兜底 | TS 友好 |

**最佳实践**：
1. ✅ 用 `Object.setPrototypeOf` 兜底 base 方法——用户不写也有默认
2. ✅ 工厂返回的不是类——是普通对象，便于 TS 推断
3. ✅ `symbols.CustomController` 探测防止"自己套自己"循环
4. ✅ 用户只需 override 自己关心的方法——其他用默认
5. ✅ 泛型 `<TUID extends UID.Schema>` 让 args 类型完整

---

## 三、性能优化

### 11. 懒加载（lazy require）

**问题场景**：
`@strapi/typescript-utils` 是开发期重模块（500KB+），但 `develop` 命令在 cluster primary 阶段不需要它——只用 worker 阶段。如果 static import 把它打包进 primary，primary 启动从 200ms 变 2s。需要"按需懒加载"。

**解决方案**：

```typescript
// packages/core/strapi/src/node/develop.ts
const tsUtils = lazy<typeof import('@strapi/typescript-utils')>('@strapi/typescript-utils');
// 1) 第一次调用 tsUtils() 时才 require
// 2) TS 类型完整，运行时按需加载

function lazy<T>(modulePath: string): () => T {
  let cached: T | null = null;
  return () => {
    if (!cached) cached = require(modulePath) as T;
    return cached;
  };
}

// 使用
const outDir = tsUtils().resolveOutDirSync(this.dirs.app.root);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `lazy<T>()` | 闭包 | 单次缓存 |
| `modulePath` | '@strapi/typescript-utils' | 字符串路径 |
| `cached` | null | 第一次 require |
| `cluster primary` | 不调用 tsUtils() | 启动不付钱 |
| `cluster worker` | 调用 tsUtils() | 实际使用 |

**最佳实践**：
1. ✅ 注释显式表达"为进程分裂而优化启动时间"
2. ✅ `require` 而非 `import`——避开静态打包
3. ✅ `lazy<T>` 闭包 + cached——单次加载
4. ✅ 主进程不调 lazy 闭包——零成本
5. ✅ TS 类型完整——`lazy<typeof import('...')>()` 注解

---

### 12. 装饰链缓存（memoize）

**问题场景**：
同一个 controller 装饰链会被多次构造（`compose-endpoint.ts` 把 middleware + policies + controller 串成 routeHandler）。如果每次都重做，1k routes 启动从 100ms 变 10s。需要 memoize 缓存。

**解决方案**：

```typescript
// packages/core/core/src/services/server/compose-endpoint.ts
import memoize from 'memoize-one';

const buildHandler = memoize((middlewares, policies, controller) => {
  // 1) 把 policies 包成 middleware
  const wrapped = policies.map(p => async (ctx, next) => {
    const result = await p(ctx, { strapi });
    if (!result) return ctx.unauthorized('Policy failed');
    return next();
  });
  // 2) 串成 koa-compose
  return compose([...middlewares, ...wrapped, controller]);
}, ([m1, p1, c1], [m2, p2, c2]) => {
  // 自定义 equality：只比引用不深比
  return m1 === m2 && p1 === p2 && c1 === c2;
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `memoize-one` | LRU size=1 | 默认就够 |
| `equality` | 引用比 | 不深比 |
| `buildHandler` | (mw, policy, ctrl) => handler | 闭包 |
| `koa-compose` | 中间件串联 | 标准库 |
| `cacheHitRate` | 监控 | 命中率 < 50% 说明 key 不稳 |

**最佳实践**：
1. ✅ `memoize-one` 引用比——不要深比
2. ✅ 装饰链构造 O(N) → O(1)——1k routes 启动提速 5x
3. ✅ 自定义 equality 防止"middleware 数组引用变了但内容相同"误判
4. ✅ 单元测试要清 cache——避免测试相互污染
5. ✅ 监控 cacheHitRate——命中率 < 50% 说明 key 不稳

---

### 13. 数据库 Schema Diff 优化

**问题场景**：
3-way diff 在大项目（100+ content type）上首次跑要 30+ 秒——要把 DB schema 拉出来（A）、读 strapi_database_schema（B）、读用户 schema（C），三方对比。如果每次启动都全量 diff，启动体验差。

**解决方案**：

```typescript
// packages/core/database/src/schema/index.ts
class SchemaProvider {
  private schemaCache: CachedSchema | null = null;

  async syncSchema(force = false) {
    if (!force && this.schemaCache && !this.hasUserSchemaChanged()) {
      return; // 命中缓存，跳过 diff
    }
    // ... 三方 diff
    this.schemaCache = { databaseSchema, userSchema, timestamp: Date.now() };
  }

  private hasUserSchemaChanged(): boolean {
    // 比对用户 schema 文件的 mtime
    const lastMtime = this.schemaCache?.userSchemaMtime;
    const currentMtime = this.getUserSchemaMtime();
    return currentMtime > (lastMtime || 0);
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `force` | false | 命中缓存跳过 |
| `schemaCache` | { ts, mtime } | 状态 |
| `userSchemaMtime` | file stat | 变更检测 |
| `diff.cache` | 进程级 | 内存即可 |
| `bootstrap` | dev 阶段跑 | prod 阶段不跑 |

**最佳实践**：
1. ✅ mtime 检测用户 schema 变化——O(1) 跳过 diff
2. ✅ 进程级 cache——不要持久化（strapi_database_schema 表已持久化）
3. ✅ dev 阶段跑 syncSchema——prod 用 migration 工具
4. ✅ `force=true` 调试用——绕过缓存
5. ✅ 大项目（> 50 content type）考虑分批 diff

---

### 14. TypeScript 编译优化（ignoreDiagnostics）

**问题场景**：
dev 阶段 TS 编译 + admin build + DB 初始化加起来要 30+ 秒。TS 编译严格模式遇到 schema 错误就 throw——阻塞后续步骤。开发期"先让服务跑起来，错误日志兜底"更友好。

**解决方案**：

```typescript
// packages/core/strapi/src/node/develop.ts
await tsUtils.compile({
  ignoreDiagnostics: true,  // 不阻塞
  // ...
});

// 单独的错误监听
chokidar.watch(configDir).on('change', (path) => {
  if (path.endsWith('.ts')) {
    tsUtils.compile().catch((err) => {
      strapi.log.error('TS compile failed', err);
      // 不重启 worker——用户自己改
    });
  }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `ignoreDiagnostics` | true | 不抛错 |
| `compile target` | esnext | 不降级 |
| `outDir` | dist/ | 用户态产物 |
| `incremental` | true | 二次编译 < 5s |
| `tsBuildInfoFile` | .tsbuildinfo | 增量缓存 |

**最佳实践**：
1. ✅ dev 阶段 `ignoreDiagnostics: true`——错误不阻塞
2. ✅ 用 `tsc --incremental` + `.tsbuildinfo` 缓存——二次编译 < 5s
3. ✅ chokidar 监听 .ts 变化——单独跑 compile，不重启 worker
4. ✅ prod 阶段 `ignoreDiagnostics: false`——CI 严格
5. ✅ `outDir` 固定为 `dist/`——Strapi 假设路径不变

---

### 15. Admin Bundle Size 检查

**问题场景**：
Strapi Admin 是 SPA，bundle size 涨 100KB 就影响首屏。1300+ 贡献者每天合 PR 容易把 bundle 撑大——需要 CI 主动检查。

**解决方案**：

```yaml
# .github/workflows/adminBundleSize.yml
- name: Check admin bundle size
  run: |
    yarn build
    SIZE=$(du -k dist/build/*.js | awk '{print $1}')
    THRESHOLD=2000
    if [ $SIZE -gt $THRESHOLD ]; then
      echo "::error::Admin bundle too large: ${SIZE}KB > ${THRESHOLD}KB"
      exit 1
    fi
```

```javascript
// .size-limit.js
module.exports = [
  {
    name: 'admin JS',
    path: 'dist/build/admin.js',
    limit: '2 MB',
  },
  {
    name: 'runtime chunk',
    path: 'dist/build/runtime.js',
    limit: '100 KB',
  },
];
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `admin JS` | 2 MB | 主包 |
| `runtime chunk` | 100 KB | webpack runtime |
| `vendor chunk` | 800 KB | 第三方 |
| `gzip` | 600 KB | 压缩后 |
| `warn/error` | 5%/10% 超阈值 | size-limit 提示 |

**最佳实践**：
1. ✅ `size-limit` 配 `warn` 和 `error` 两档——增量监控
2. ✅ CI 跑 bundle size check——PR 超阈值阻塞
3. ✅ Admin 用 Vite 或 Webpack5 code splitting——按路由分 chunk
4. ✅ `lodash` 用 `lodash-es` 按需 import——别全量
5. ✅ 第三方富文本/图表用 dynamic import——首屏不加载

---

## 四、工程实践

### 16. CLI 编排（commander + cluster）

**问题场景**：
Strapi CLI 暴露 7+ 命令（develop / start / build / console / generate / ts:generate-types / transfer），每个命令有不同的 ts 编译、admin build、cluster 行为。需要 commander.js + 子命令模式统一管理。

**解决方案**：

```typescript
// packages/core/strapi/src/cli/index.ts
import { Command } from 'commander';
import develop from './commands/develop';
import start from './commands/start';
import build from './commands/build';
import console_ from './commands/console';
import generate from './commands/generate';
import transfer from './commands/transfer';

const program = new Command();
program
  .name('strapi')
  .version(require('../package.json').version);

program.addCommand(develop);
program.addCommand(start);
program.addCommand(build);
program.addCommand(console_);
program.addCommand(generate);
program.addCommand(transfer);

program.parseAsync(process.argv);

// 单个命令：packages/core/strapi/src/cli/commands/develop.ts
export default new Command('develop')
  .description('Start a development server')
  .option('-d, --debug', 'Enable debug mode')
  .option('--no-build', 'Skip admin build')
  .action(async (options) => {
    await runDevelop(options);
  });
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `program.name` | 'strapi' | CLI 名字 |
| `addCommand` | 子命令 | 7+ 个 |
| `--no-build` | 跳过 | admin build |
| `--debug` | verbose | 日志详细 |
| `parseAsync` | Promise | 异步命令 |

**最佳实践**：
1. ✅ 每个子命令单独文件——`commands/<name>.ts`
2. ✅ `--no-build` 这种布尔开关用 `program.option('--no-build')`
3. ✅ `parseAsync` 跑 Promise action——同步/异步统一
4. ✅ 共享 options 抽到 `commands/_shared.ts`——避免重复
5. ✅ `STRAPI_LOG_LEVEL=debug` 环境变量——比 CLI flag 友好

---

### 17. TypeScript 严格模式

**问题场景**：
Strapi 内部 60+ 包、上千文件，TS 严格模式能提前发现 80% 错误。但 `strict` 还不够——`any` 滥用会让类型失效。需要 `strict + noUncheckedIndexedAccess + 自定义 ESLint` 三件套。

**解决方案**：

```json
// packages/core/strapi/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true
  }
}
```

```json
// .eslintrc
{
  "extends": ["@strapi/eslint-config"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/consistent-type-imports": "error"
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `strict` | true | 严格模式 |
| `noUncheckedIndexedAccess` | true | arr[0] 类型为 T \| undefined |
| `exactOptionalPropertyTypes` | true | 可选字段不能赋值 undefined |
| `noImplicitOverride` | true | 强制 override 关键字 |
| `useUnknownInCatchVariables` | true | catch err 是 unknown |

**最佳实践**：
1. ✅ `strict + noUncheckedIndexedAccess` 双开——`arr[0]` 必须是 `T | undefined`
2. ✅ ESLint 禁 `any`——`@typescript-eslint/no-explicit-any: error`
3. ✅ `consistent-type-imports` 强制 `import type`——不引入运行时
4. ✅ `exactOptionalPropertyTypes` 严格区分 `{x?: T}` vs `{x: T \| undefined}`
5. ✅ CI 跑 `tsc --noEmit`——类型错误阻塞 merge

---

### 18. 多数据库适配（Knex dialect）

**问题场景**：
Strapi 支持 4 个 DB（SQLite / PostgreSQL / MySQL / MariaDB），schema 同步、迁移、查询都得跨方言。Knex 提供 query builder 抽象，但 schema 同步的 dialect 差异要自己包。

**解决方案**：

```typescript
// packages/core/database/src/dialects/index.ts
import sqlite from './sqlite';
import postgres from './postgres';
import mysql from './mysql';
import mariadb from './mariadb';

const dialects = {
  sqlite, postgres, mysql, mariadb
};

function getDialect(client: string) {
  return dialects[client] || dialects.sqlite;
}

// packages/core/database/src/dialects/postgres/schema-inspector.ts
async function getSchema(knex: Knex) {
  const tables = await knex
    .select('table_name')
    .from('information_schema.tables')
    .where('table_schema', 'public');
  return Promise.all(tables.map((t) => getTableSchema(knex, t.table_name)));
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `client` | 'pg' / 'mysql2' / 'sqlite3' / 'mysql' | knex client |
| `connection` | { host, port, user, password, database } | 标准 |
| `pool` | { min: 2, max: 10 } | 适配 RDS |
| `schema` | 'public' | pg 默认 schema |
| `timezone` | 'UTC' | 跨时区一致 |

**最佳实践**：
1. ✅ Knex `client` 用 'pg' / 'mysql2' / 'sqlite3'——别用 'pg-native'
2. ✅ `pool: { min, max }` 必须配——RDS 连接上限默认 100
3. ✅ `timezone: 'UTC'` 强制——避免应用/MySQL 时区漂移
4. ✅ `information_schema` 查表结构——跨方言
5. ✅ CI 跑 pg + mysql + sqlite 三套测试——nightly 跑 mariadb

---

### 19. EE 商业切断

**问题场景**：
Strapi 开源 CE + 商业 EE 是双轨制：SSO、审计日志、AI 配额在 EE，OSS 用户拉不到这部分代码也跑得起来。需要"运行时检测 license → 启用/禁用功能"——但 EE 代码不能直接进 OSS 包。

**解决方案**：

```typescript
// packages/core/core/src/ee/license.ts
class LicenseChecker {
  private features = new Set<string>();

  async check(licenseKey?: string) {
    if (!licenseKey) {
      // OSS 模式：只启用 core 特性
      this.features.add('audit-logs'); // 基础版也有
      this.features.add('rest-api');
      return;
    }
    // EE 模式：调远端验证
    const response = await fetch('https://license.strapi.io/verify', {
      method: 'POST',
      body: JSON.stringify({ key: licenseKey })
    });
    const { features, expiresAt } = await response.json();
    if (new Date(expiresAt) < new Date()) throw new Error('License expired');
    features.forEach((f) => this.features.add(f));
  }

  has(feature: string) {
    return this.features.has(feature);
  }
}

// 使用
if (strapi.ee.has('sso')) {
  // 启用 SSO
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `licenseKey` | STRAPI_LICENSE | env var |
| `expiresAt` | ISO date | 过期检测 |
| `features` | array | 启用的功能 |
| `node-machine-id` | 服务器指纹 | 绑定 |
| `verify` | license.strapi.io | 远端验证 |

**最佳实践**：
1. ✅ EE 代码不进 OSS 包——通过 npm private registry
2. ✅ 运行时 license check——`strapi.ee.has('feature')` 决定功能开关
3. ✅ license 过期抛错——服务拒绝启动
4. ✅ `node-machine-id` 绑定机器——防 license 共享
5. ✅ OSS 用户拉不到 EE 代码也跑得起来——核心功能不受影响

---

### 20. MCP 协议接入

**问题场景**：
2025 年起，AI agent（Claude/Cursor）需要直接消费 Strapi 的 action——比如"用自然语言创建一个 Article"。需要 MCP（Model Context Protocol）让 Strapi 暴露标准接口给 AI。

**解决方案**：

```typescript
// packages/core/core/src/services/mcp/index.ts
import { McpServer } from '@modelcontextprotocol/sdk';

function createMcpServer(strapi: Strapi) {
  const server = new McpServer({ name: 'strapi', version: '5.0.0' });
  // 把每个 content type 暴露为 MCP tool
  for (const [uid, contentType] of Object.entries(strapi.contentTypes)) {
    server.tool(`create_${uid}`, {
      description: `Create a new ${uid} document`,
      inputSchema: z.object({
        data: z.record(z.any()),
        status: z.enum(['draft', 'published']).default('draft')
      })
    }, async (args) => {
      const result = await strapi.documents(uid).create(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    });
  }
  return server;
}

// 启动 MCP server
const mcp = createMcpServer(strapi);
mcp.listen(3001);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `McpServer` | @modelcontextprotocol/sdk | 官方 SDK |
| `name/version` | strapi/5.0.0 | 标识 |
| `tool` | `create_<uid>` | 每个 content type |
| `inputSchema` | zod | 校验 |
| `listen` | 3001 | stdio / HTTP |

**最佳实践**：
1. ✅ 用 zod 定义 `inputSchema`——类型完整
2. ✅ 每个 content type 自动暴露为 tool——AI 自动发现
3. ✅ 走 stdio 而非 HTTP——Claude/Cursor 集成方便
4. ✅ auth 走 Strapi 的 API token——复用权限
5. ✅ `McpCapabilityRegistry` 控制哪些 action 暴露给 AI——防越权

---

**标签**：#strapi #headless-cms #nodejs #koa #knex
**状态**：20/20 份详细内容
