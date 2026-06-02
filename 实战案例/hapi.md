# Hapi - 企业级 Node 框架设计模式

**来源**：G:\实战案例\GitHub顶尖项目\hapi\
**创建时间**：2026-06-02

---

## 一、核心机制与生命周期

### 1. Realm 插件隔离模型（Realm Isolation Pattern）

**问题场景**：Express 框架的中间件共享一个 app 对象，第三方插件通过 `app.use(middleware)` 串到同一根链上。当多个插件都装饰 `app.db`、`app.cache` 时命名冲突不可避免，企业级应用"插件污染全局"成了通病。hapi 的解法是给每个插件一个独立 `realm`——独立的命名空间，独立的扩展点注册区，但共享底层 core。

**解决方案**：
```js
// lib/server.js 第 36-70 行（基于公开知识补充）
internals.Server = class {
    constructor(core, name, parent) {
        this._core = core;  // 共享 core（路由表、cache、events）

        this.realm = {
            _extensions: {
                onPreAuth: new Ext('onPreAuth', core),
                onCredentials: new Ext('onCredentials', core),
                onPostAuth: new Ext('onPostAuth', core),
                onPreHandler: new Ext('onPreHandler', core),
                onPostHandler: new Ext('onPostHandler', core),
                onPreResponse: new Ext('onPreResponse', core),
                onPostResponse: new Ext('onPostResponse', core)
            },
            modifiers: { route: {} },
            parent: parent ? parent.realm : null,
            plugin: name,
            pluginOptions: {},
            plugins: {},
            _rules: null,
            settings: { bind: undefined, files: { relativeTo: undefined } },
            validator: null
        };
    }

    _clone(name) {
        return new internals.Server(this._core, name, this);
    }
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| realm.parent | null 或父 realm | 跨 realm 引用 |
| _extensions | 7 个 Ext 实例 | 每个生命周期一个 |
| plugins | `{}` | 跨插件数据存储 |
| settings.bind | undefined | 装饰绑定 |

**最佳实践**：
1. ✅ 插件用 `server.decorate('toolkit', 'db', dbInstance)` 装饰时，**只在自身 realm 可见**
2. ✅ 跨 realm 引用必须显式 `server.dependency('pluginB')` 声明，构建依赖图
3. ✅ 永远不要直接 mutate `server.realm.parent.plugins`，所有跨 realm 数据走 `server.plugins.<name>`
4. ✅ Realm 嵌套支持父子继承，子 realm 装饰只对自身及子 realm 可见

### 2. 7 阶段扩展点代替中间件（Extension Points over Middleware）

**问题场景**：Express 中间件是"链式 + 顺序敏感"——必须按 `app.use(auth, validation, handler)` 的顺序注册，调整顺序就破坏功能。hapi 用 7 个扩展点代替中间件链：按生命周期阶段注册，**顺序无关**。

**解决方案**：
```js
// lib/ext.js（基于公开知识补充）
// 7 个扩展点（生命周期阶段）
const EXT_EVENTS = [
    'onRequest',         // 收到请求、路由解析前
    'onPreAuth',         // 认证前
    'onCredentials',     // 凭据验证
    'onPostAuth',        // 认证后
    'onPreHandler',      // handler 之前
    'onPostHandler',     // handler 之后
    'onPreResponse',     // 响应前（可改写）
    'onPostResponse'     // 响应后（仅可观察）
];

class Ext {
    constructor(type, core) {
        this.type = type;
        this.core = core;
        this.handlers = [];  // 同一 type 的扩展点
    }

    // 注册扩展点
    add(handler) {
        this.handlers.push(handler);
    }

    // 串联执行
    invoke(request, h) {
        return this.handlers.reduce(async (chain, handler) => {
            await chain;
            return handler(request, h);  // 同步或返回 Promise
        }, Promise.resolve());
    }
}

// 插件注册扩展点
exports.plugin = {
    name: 'rate-limit',
    register: (server, options) => {
        server.ext('onPreAuth', async (request, h) => {
            if (await isRateLimited(request)) {
                throw Boom.tooManyRequests('Rate limit exceeded');
            }
            return h.continue;  // 显式继续生命周期
        });
    }
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| ext type | 7 种之一 | onRequest / onPreAuth / ... |
| return | h.continue / response | 必须显式 |
| async/await | required | hapi 17+ 强制 |
| 异常 | throw Boom.* | 短路生命周期 |

**最佳实践**：
1. ✅ 插件之间**不依赖执行顺序**——每个扩展点独立，按 type 串行，type 间不串
2. ✅ 必须 `return h.continue` 或 `return h.response(...)`，不显式返回就 throw
3. ✅ 认证失败 throw `Boom.unauthorized()`，handler 不可达，但 onPreResponse 仍可改写
4. ✅ 业务逻辑优先 `onPreHandler`（路由级）或 `pre` 配置（路由内），ext 留给横切

### 3. 配置驱动路由（Configuration-Driven Routing）

**问题场景**：Express 路由是 `app.get('/', handler)`，路由表分散在代码各部分，无法整体导出、静态分析、可视化。hapi 把路由表统一为 JSON 结构 `{ method, path, options, handler }`，可序列化、可 diff、可文档化。

**解决方案**：
```js
// 单个路由声明
server.route({
    method: 'POST',
    path: '/api/users/{id}',
    options: {
        description: 'Update a user',
        tags: ['api', 'user'],
        validate: {
            params: { id: Joi.number().integer().required() },
            payload: {
                name: Joi.string().min(1).max(100),
                email: Joi.string().email()
            }
        },
        auth: 'jwt',
        pre: [
            { method: 'loadUser', assign: 'user' },  // 预处理器
            { method: 'checkOwnership' }
        ],
        handler: async (request, h) => {
            const user = request.pre.user;
            return await db.user.update(user);
        }
    }
});

// 批量从 JSON 加载
const routes = require('./routes.json');
server.route(routes);

// 自动生成 Swagger
const inert = require('@hapi/inert');
const vision = require('@hapi/vision');
const hapiSwagger = require('hapi-swagger');

await server.register([inert, vision, {
    plugin: hapiSwagger,
    options: { info: { title: 'User API', version: '1.0' } }
}]);
// 访问 /documentation 查看自动生成的 API 文档
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| method | GET/POST/PUT/DELETE/PATCH/OPTIONS/* | 支持通配 |
| path | `/users/{id}` | 参数花括号 |
| options.validate | Joi schema | 入参校验 |
| options.auth | 'jwt' / 'session' / strategy | 认证策略 |
| options.pre | `[{ method, assign }]` | 预处理器链 |
| options.description | 字符串 | 自动生成文档 |

**最佳实践**：
1. ✅ 路由表必须 JSON 化（导出为 `routes.json`），CI 用 JSON Schema 校验
2. ✅ `validate` 用 Joi（hapi 官方）而非手写校验，错误返回 `400 Bad Request`
3. ✅ `pre` 替代传统"中间件"——每个路由的预处理器在 handler 前完成
4. ✅ `options.description` + `options.tags` 直接生成 Swagger，无需维护两套文档

### 4. Server.clone() 模式（Server Cloning for Plugin Isolation）

**问题场景**：每个插件需要独立命名空间，但又不希望每个插件都创建完整 server（路由、cache、events 都得重建）。`server.clone()` 创建"轻量子 server"——共享底层 core，但 realm 独立。

**解决方案**：
```js
// lib/server.js（基于公开知识补充）
internals.Server = class {
    constructor(core, name, parent) {
        this._core = core;  // 所有 clone 共享同一个 core
        this.realm = { /* 独立 realm */ };
        // ...
    }

    _clone(name) {
        return new internals.Server(this._core, name, this);
    }
};

// 插件 register 时自动 clone
exports.register = function (server, options) {
    // 这里的 server 已经是 server.clone() 后的子 server
    // 注册路由、扩展点只对当前 plugin 可见
    server.route({ method: 'GET', path: '/plugin-route', handler: ... });
    server.ext('onPreAuth', fn);
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| name | string | 插件名（用于错误定位） |
| parent | parent realm | 引用父 realm |
| 共享资源 | core.events, core.routes, core.cache | 共享 |
| 隔离资源 | realm.plugins, realm.settings, realm.extensions | 隔离 |

**最佳实践**：
1. ✅ 插件逻辑在 `register` 函数内运行，**不要缓存 server 引用**——hapi 内部会处理多 realm
2. ✅ 用 `server.dependency(['plugin-a', 'plugin-b'])` 声明依赖，构建正确的初始化顺序
3. ✅ 共享数据走 `server.expose('key', value)`，**子 plugin 可通过 `server.plugins['parent-plugin'].key` 访问**
4. ✅ Clone 是浅层——`_core` 引用相同，**修改 core 的字段会影响所有 plugin**，要避免

### 5. Hapi-shot 注入式测试（In-Memory HTTP Testing）

**问题场景**：HTTP 框架的测试通常启真 server + 端口 + 真实 HTTP，CI 跑 1000 个测试要 30 分钟。hapi 用 `@hapi/shot` 实现"注入式测试"——把 HTTP 请求作为函数参数传入，直接得到响应对象，**无需启 server、无网络 IO**。

**解决方案**：
```js
// @hapi/shot 注入式测试（基于公开知识补充）
const Shot = require('@hapi/shot');
const Hapi = require('@hapi/hapi');

describe('GET /api/users', () => {
    let server;
    
    beforeEach(async () => {
        server = Hapi.server();
        server.route({
            method: 'GET',
            path: '/api/users/{id}',
            handler: (request) => ({ id: request.params.id, name: 'Alice' })
        });
    });

    it('returns user data', async () => {
        // 注入式：直接构造请求，零网络 IO
        const response = await server.inject({
            method: 'GET',
            url: '/api/users/42'
        });
        
        // 完整 HTTP 响应对象
        expect(response.statusCode).toBe(200);
        expect(response.result).toEqual({ id: 42, name: 'Alice' });
        expect(response.headers['content-type']).toMatch(/json/);
    });

    it('handles POST with payload', async () => {
        const response = await server.inject({
            method: 'POST',
            url: '/api/users',
            payload: { name: 'Bob', email: 'bob@example.com' }
        });
        
        expect(response.statusCode).toBe(201);
    });
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| inject 耗时 | < 5ms | 单次 |
| 测试 200+ 套件 | < 30s | hapi 实际数据 |
| 模拟内容 | 完整 HTTP req/res | headers / payload / auth |
| CI 资源 | 0 端口 | 无需开端口 |

**最佳实践**：
1. ✅ hapi 的 200+ 单元测试在 30s 内跑完，**全靠 `inject` 无网络 IO**
2. ✅ 路由 handler 测试用 `inject`，端到端测试才启真 server
3. ✅ payload 可传 string / object / stream，模拟各种内容类型
4. ✅ Auth 测试用 `credentials` 字段模拟已认证用户，跳过真实登录

## 二、架构设计与模块分层

### 6. lib/core.js 核心实现（2000+ 行的中央协调器）

**问题场景**：HTTP 框架有 50+ 关注点（路由、auth、cache、validation、events、compression、cors...）。如果每个都做成中间件挂在 server 上，会形成"中间件地狱"。hapi 把所有非插件化能力集中到 `lib/core.js`（2000+ 行），通过 `internals.Core` 单例协调。

**解决方案**：
```js
// lib/core.js 关键结构（基于公开知识补充）
class Core {
    constructor() {
        // 1. 路由表
        this.routes = new Router();
        
        // 2. 事件总线
        this.events = new Podium('core');
        
        // 3. 认证
        this.auth = new Auth(this);
        
        // 4. 缓存
        this.cache = new Catbox(this);
        
        // 5. 验证
        this.validation = new Validation(this);
        
        // 6. 安全（CORS / XSS / CSP）
        this.security = new Security(this);
        
        // 7. 压缩
        this.compression = new Compression(this);
        
        // 8. Handler 工厂
        this.handlers = new Handlers(this);
        
        // 9. 方法注册
        this.methods = new Methods(this);
    }

    // 7 阶段扩展点串联执行
    async _lifecycle(request) {
        await this.ext.onRequest.invoke(request);
        await this.ext.onPreAuth.invoke(request);
        await this._authenticate(request);
        await this.ext.onCredentials.invoke(request);
        await this.ext.onPostAuth.invoke(request);
        await this._validate(request);
        await this.ext.onPreHandler.invoke(request);
        const response = await this._handler(request);
        await this.ext.onPostHandler.invoke(request);
        await this.ext.onPreResponse.invoke(request);
        return response;
    }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Core 实例 | 全局唯一 | 单例 |
| 子能力数 | 9+ | auth/cache/validation/... |
| 生命周期阶段 | 9 | 7 ext + auth + validate |

**最佳实践**：
1. ✅ Core 单例是性能关键——所有 plugin 共享，避免重复创建
2. ✅ Core 不做具体业务，只协调；业务在 plugin 内
3. ✅ 加新能力（如 metrics）就走 plugin，不要直接改 Core
4. ✅ `_lifecycle` 是 9 阶段串联，新 ext 必须能"短路"或"继续"

### 7. @hapi/* 19+ 子包 Monorepo（Modular Subpackage Architecture）

**问题场景**：Hapi 主包（lib/）只有 21 个文件，但功能极全（auth/cache/cors/compression/validation/...）。如果都打包进主包，bundle size 50MB+，普通应用只用到 20% 功能却要 100% 加载。hapi 把每个能力拆成独立 npm 包。

**解决方案**：
```json
// package.json（基于公开知识补充）
{
  "name": "@hapi/hapi",
  "version": "21.4.9",
  "dependencies": {
    "@hapi/hoek": "^11.0.0",      // 工具集
    "@hapi/topo": "^5.0.0",       // 拓扑排序（依赖图）
    "@hapi/shot": "^5.0.0",       // 注入式测试
    "@hapi/catbox": "^11.0.0",    // 缓存（memory/redis/mongo）
    "@hapi/podium": "^4.0.0",     // 事件总线
    "@hapi/statehood": "^7.0.0",   // cookie/session
    "@hapi/ammo": "^5.0.0",       // 限流
    "@hapi/bounce": "^2.0.0",     // 错误边界
    "@hapi/boom": "^10.0.0",      // HTTP 错误
    "@hapi/accept": "^5.0.0",     // 内容协商
    "@hapi/call": "^8.0.0",       // 链式调用
    "@hapi/heavy": "^7.0.0",      // 负载信息
    "@hapi/mimos": "^6.0.0",      // MIME 协商
    "@hapi/somever": "^4.0.0",    // 语义版本
    "@hapi/subtext": "^7.0.0",    // payload 解析
    "@hapi/teamwork": "^4.0.0",   // 异步并发
    "@hapi/wreck": "^17.0.0",     // HTTP 客户端
    "@hapi/iron": "^6.0.0",       // 加密 cookie
    "@hapi/cryptiles": "^5.0.0"   // 加密工具
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 子包总数 | 19+ | @hapi/* scope |
| 主包大小 | < 100KB | lib/ + 必需子包 |
| 协同依赖 | 无循环 | 拓扑排序保证 |
| 独立版本 | 各自 | semver 独立 |

**最佳实践**：
1. ✅ 19 个子包**无循环依赖**——用 `@hapi/topo` 拓扑排序保证加载顺序
2. ✅ 第三方可单独 install `@hapi/hoek`、`@hapi/boom`——不必 install hapi 主包
3. ✅ 子包自己可 semver 升级，hapi 主包锁版本号在 `dependencies`
4. ✅ 2020 年从 `hapi` 改 `@hapi/hapi`——npm scope 隔离生态，避免与第三方 `hapi-*` 冲突

### 8. @hapi/catbox 多级缓存（Pluggable Multi-Backend Cache）

**问题场景**：HTTP 框架需要缓存（路由、session、限流、查询结果），但不同场景需要不同后端（内存/Redis/MongoDB）。如果硬编码 Redis，单元测试要启 Redis CI 就崩；如果都做内存，多实例不共享。catbox 抽象出"缓存策略 + 缓存后端"两层。

**解决方案**：
```js
// @hapi/catbox（基于公开知识补充）
const Catbox = require('@hapi/catbox');
const CatboxMemory = require('@hapi/catbox-memory');
const CatboxRedis = require('@hapi/catbox-redis');

// 缓存策略：CachePolicy（业务）
class UserPolicy extends Catbox.Policy {
    constructor() {
        super('user',  // 段名
              1000 * 60 * 10,  // TTL: 10 分钟
              ['id'],  // 唯一键字段
              { id: 'string' });
    }
}

// 缓存后端：Client（存储）
const memoryClient = new CatboxMemory.Client({ maxSize: 1000 });
const redisClient = new CatboxRedis.Client({ host: '127.0.0.1', port: 6379 });

// 注入到 hapi
const server = Hapi.server({
    cache: {
        provider: memoryClient,  // 测试用内存
        // provider: redisClient,  // 生产用 Redis
    }
});

// 业务使用
const policy = new UserPolicy();
const key = { id: '42' };

// Get
const cached = await policy.get(key);
if (cached) {
    return cached;
}

// Set
await policy.set(key, { name: 'Alice', email: 'a@b.com' }, 600);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| TTL | 60s-1h | 业务相关性 |
| Segment | 'user' / 'session' / 'rate-limit' | 命名空间 |
| 后端 | memory/redis/mongo | 可插拔 |
| LRU 大小 | 1000-100000 | 内存上限 |

**最佳实践**：
1. ✅ 单元测试用 `CatboxMemory`，生产用 `CatboxRedis`，**代码不变，只换 Provider**
2. ✅ TTL 不要 > 1h，否则缓存陈旧成本高
3. ✅ 段名（segment）必须全局唯一，避免 key 冲突
4. ✅ Redis 不可用时 catbox 自动降级为 miss，**不会 throw**

### 9. @hapi/boom 错误对象（HTTP Error Factory）

**问题场景**：HTTP handler 里 `throw new Error('Unauthorized')` 不知道状态码、不知道响应格式，错误处理代码 if/else 一堆。hapi 用 `boom` 把 HTTP 错误封装成对象，**自动序列化为 JSON 响应**。

**解决方案**：
```js
// @hapi/boom（基于公开知识补充）
const Boom = require('@hapi/boom');

// 标准 HTTP 错误
throw Boom.badRequest('Invalid email');           // 400
throw Boom.unauthorized('Invalid credentials');    // 401
throw Boom.paymentRequired('Quota exceeded');      // 402
throw Boom.forbidden('No permission');             // 403
throw Boom.notFound('User not found');             // 404
throw Boom.conflict('Email already exists');       // 409
throw Boom.tooManyRequests('Rate limit exceeded'); // 429
throw Boom.internal('Database error');             // 500
throw Boom.badImplementation('Bug in code');       // 500
throw Boom.gatewayTimeout('Upstream timeout');     // 504

// 自定义错误
throw new Boom('Email is required', {
    statusCode: 400,
    data: { field: 'email' },  // 附加数据
});

// 响应格式（自动 JSON）
{
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Invalid email format"
}

// hapi handler 中 catch
try {
    await db.user.find(id);
} catch (err) {
    throw Boom.boomify(err, { statusCode: 500, message: 'DB error' });
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| statusCode | 400-599 | HTTP 状态 |
| error | 'Bad Request' | 短名 |
| message | '详细原因' | 详细 |
| data | 附加字段 | 业务数据 |

**最佳实践**：
1. ✅ 永远 `throw Boom.*`，不要 `throw new Error(...)`——Boom 有 statusCode 字段
2. ✅ 业务校验失败用 `Boom.badRequest(data: { field })`，前端可按字段提示
3. ✅ 第三方错误（DB/Redis）`Boom.boomify(err, { statusCode: 500 })` 包装
4. ✅ onPreResponse 阶段可改写 Boom 错误响应（隐藏内部 message，统一格式）

### 10. @hapi/podium 事件总线（Strongly-Typed Event Emitter）

**问题场景**：Node.js 原生 `EventEmitter` 类型不安全（`emit('foo', data)` 时 data 形状无约束），监听器异常会 throw 冒泡到主流程。podium 提供"强类型事件"——`emitter.registerEvent({ name, channels, shared })` 先声明事件形状，再 emit/listen。

**解决方案**：
```js
// @hapi/podium（基于公开知识补充）
const Podium = require('@hapi/podium');

const emitter = new Podium('my-app');

// 强类型事件声明
emitter.registerEvent({
    name: 'user-created',
    channels: ['web', 'mobile', 'api'],  // 命名空间
    shared: true                          // 多 listener 共享同一份数据
});

emitter.registerEvent({
    name: 'request-error',
    channels: ['plugin-a', 'plugin-b'],
    shared: false
});

// 监听
emitter.on('user-created', (data, flags) => {
    console.log(`user created: ${data.name}`);
});

emitter.on({ name: 'user-created', channels: 'web' }, (data) => {
    // 只监听 web 渠道
});

// 触发（必须带 channel）
emitter.emit({
    name: 'user-created',
    channel: 'web',
    data: { name: 'Alice', email: 'a@b.com' }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| event name | 'user-created' | 必须先 registerEvent |
| channels | string[] | 命名空间 |
| shared | true/false | 是否每 listener 一份数据 |
| listener count | 1000+ | 单事件支持 |

**最佳实践**：
1. ✅ 事件必须先 `registerEvent`，**类型不安全直接 throw**
2. ✅ 监听器用 `try/catch` 包裹，podium 会 catch 但记录 error
3. ✅ `shared: true` 用于"广播"（多监听器都收到同一份 data），false 用于"独占"
4. ✅ 用 channel 而非多 event 名——一个 event 多 channel 比 5 个 event 好维护

## 三、性能与运行时优化

### 11. Hoek.applyToDefaults 配置合并（Deep Defaults Application）

**问题场景**：路由 options 默认值要"深合并"——`{ validate: { payload: { strict: false } } }` 默认值要应用到用户传的 `{ validate: { params: ... } }`，不能粗暴 `Object.assign`。`@hapi/hoek.applyToDefaults` 是 hapi 配置系统的核心。

**解决方案**：
```js
// @hapi/hoek（基于公开知识补充）
const Hoek = require('@hapi/hoek');

// 路由默认值
const routeDefaults = {
    json: { 
        space: 0,
        replacer: null,
        suffix: false
    },
    validate: {
        payload: { 
            parse: true,
            allow: 'application/json',
            maxBytes: 1024 * 1024
        },
        query: false,
        params: false
    },
    response: {
        emptyStatusCode: 200
    }
};

// 用户传的 options
const userOptions = {
    json: { space: 2 },  // 改 space，其他保留
    validate: { 
        params: { id: Joi.number() }  // 加 params，原 payload 保留
    }
};

// 深合并（用户覆盖默认）
const merged = Hoek.applyToDefaults(routeDefaults, userOptions);
// 结果：
// {
//   json: { space: 2, replacer: null, suffix: false },  // space 被覆盖
//   validate: {
//     payload: { parse: true, allow: '...', maxBytes: 1048576 },  // 原 payload 保留
//     query: false,
//     params: { id: Joi.number() }
//   },
//   response: { emptyStatusCode: 200 }
// }
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| defaults | 必填 | 默认值对象 |
| options | 必填 | 用户传入 |
| 数组 | 替换 | 不合并数组 |
| 嵌套对象 | 深合并 | 一层层递归 |

**最佳实践**：
1. ✅ hapi 所有配置合并都用 `applyToDefaults`，**保持默认值的"防御性"**
2. ✅ 函数/正则/Date 等不可深合并——按值覆盖
3. ✅ 数组是"替换"而非"合并"——`applyToDefaults({a:[1,2]}, {a:[3]})` → `{a:[3]}`
4. ✅ `null` 表示"清空"——`applyToDefaults({a:{b:1}}, {a:null})` → `{a:null}`

### 12. 异步预处理器链（Pre-handler Pipeline）

**问题场景**：handler 执行前需要做多步准备（加载用户、查权限、查配置）。如果都写在 handler 里，handler 臃肿；如果用"中间件"扩展到 5+ 阶段，又回归 Express 老路。hapi 的解法是"路由级 pre 链"——每个路由独立声明 pre 列表。

**解决方案**：
```js
// 路由级 pre（基于公开知识补充）
server.route({
    method: 'GET',
    path: '/api/orders/{id}',
    options: {
        // pre 数组：按顺序执行，assign 的值挂到 request.pre
        pre: [
            {
                method: async (request) => {
                    return await db.user.find(request.auth.credentials.id);
                },
                assign: 'currentUser'  // 存到 request.pre.currentUser
            },
            {
                method: async (request, h) => {
                    const order = await db.order.find(request.params.id);
                    if (!order) throw Boom.notFound('Order not found');
                    return order;
                },
                assign: 'order'
            },
            {
                method: async (request) => {
                    if (request.pre.order.userId !== request.pre.currentUser.id) {
                        throw Boom.forbidden('Not your order');
                    }
                    return true;
                },
                assign: 'authorized'
            }
        ],
        handler: async (request, h) => {
            // pre 全部成功后才到这里
            return { order: request.pre.order, user: request.pre.currentUser };
        }
    }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| pre 数组 | 1-10 步 | 多了拆 handler |
| method | async (request, h) => any | 异步函数 |
| assign | string | 存到 request.pre.<name> |
| 失败 | throw Boom.* | 短路 |

**最佳实践**：
1. ✅ pre 超过 3 步就考虑拆成"子路由 + 子 handler"——链太长难调试
2. ✅ 失败必须 `throw Boom.*`，让 onPreResponse 接管错误响应
3. ✅ pre 函数是 `(request, h)`，h 可用 `h.context` 共享状态
4. ✅ `method` 引用预定义方法：`server.method('loadUser', fn, { cache: { expiresIn: 600 } })`——hapi 自动缓存

### 13. Server Methods 与自动缓存（Methods with Built-in Cache）

**问题场景**：handler 里要调 `loadUser(id)`，调 100 次只有 1 次真正查 DB（其他 99 次缓存命中）。但每个 handler 都自己写缓存逻辑太冗余。hapi 提供 `server.method()` 注册可缓存方法，**hapi 自动加缓存**。

**解决方案**：
```js
// server.method 注册（基于公开知识补充）
server.method('loadUser', async (id) => {
    return await db.user.find(id);
}, {
    cache: {
        expiresIn: 10 * 60 * 1000,  // 10 分钟
        generateTimeout: 3000        // 缓存生成超时
    }
});

server.method('checkPermission', async (userId, resource) => {
    return await db.acl.check(userId, resource);
}, {
    cache: {
        expiresIn: 60 * 1000,  // 1 分钟
        // 共享缓存：多 server 共享一份
        shared: true
    }
});

// 在 pre 中引用
server.route({
    options: {
        pre: [
            { method: 'loadUser', assign: 'user' },  // 字符串引用方法名
            { method: 'checkPermission(user.id, $1)', assign: 'can' }  // 模板字符串
        ]
    }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| expiresIn | 60s-30m | 缓存 TTL |
| generateTimeout | 3s | 缓存重建超时 |
| shared | true | 多实例共享（需 catbox redis） |
| staleIn | 5m | 旧值返回前的容错期 |

**最佳实践**：
1. ✅ 频繁查询 + 极少变化的数据用 `server.method` + cache（用户信息、配置、字典）
2. ✅ `shared: true` 用于多 hapi 实例部署（用 catbox-redis 后端）
3. ✅ cache miss 时如果上游慢，给 `generateTimeout` 防止请求堆积
4. ✅ 模板字符串 `method(arg1, $1)` 引用参数——`$1` 是 request.params 第一个

### 14. 限流与防滥用（Rate Limiting with @hapi/ammo）

**问题场景**：API 要防滥用——同 IP 每秒最多 100 请求，否则 429。传统实现写一个 middleware 维护 in-memory map，但多实例不共享。hapi 用 `@hapi/ratelimit` 插件 + `@hapi/ammo` 算法，**支持 Redis 共享**。

**解决方案**：
```js
// @hapi/ratelimit（基于公开知识补充）
const RateLimit = require('@hapi/ratelimit');

await server.register({
    plugin: RateLimit,
    options: {
        // 用 catbox 客户端（内存/Redis 可选）
        redis: {
            host: '127.0.0.1',
            port: 6379
        },
        // 全局限流
        global: {
            limit: 1000,            // 1000 请求
            window: 60 * 1000,      // 1 分钟窗口
            message: 'Too many requests'
        },
        // 路由级限流
        userAttribute: 'ip',  // 按 IP 维度
        // 跳过健康检查
        skipOnError: false,
        // 错误回调
        errorResponseBuilder: (request, h) => {
            return h.response({
                statusCode: 429,
                error: 'Too Many Requests',
                message: `Rate limit exceeded, retry in ${request.rateLimit.reset}`
            }).code(429);
        }
    }
});

// 路由级覆盖
server.route({
    path: '/api/login',
    method: 'POST',
    options: {
        plugins: {
            'hapi-rate-limit': {
                enabled: true,
                limit: 5,        // 登录接口 5 次/分钟
                window: 60 * 1000
            }
        }
    },
    handler: ...
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| limit | 100-1000 | 窗口内最大请求数 |
| window | 60 * 1000 | 1 分钟 |
| userAttribute | 'ip' / 'userId' | 限流维度 |
| 存储 | Redis | 多实例共享 |

**最佳实践**：
1. ✅ 全局限流防 DDoS，**路由级限流防业务滥用**（登录 5/min、搜索 10/min）
2. ✅ 维度用 `userAttribute: 'ip'`（未登录）或 `userAttribute: 'userId'`（已登录）
3. ✅ Redis 不可用时 `skipOnError: false` 返回 503——**不能让攻击者打挂 Redis 就无限刷**
4. ✅ 暴露 `X-RateLimit-Remaining` 响应头给客户端，**让客户端主动减速**

### 15. 压缩与静态文件服务（Compression + Static Files）

**问题场景**：JSON 响应 1MB 太大，gzip 后 200KB。静态文件（前端 SPA、文档）需要正确处理 MIME、缓存头、ETag、Range 请求。hapi 把这些做成可配置项 + 独立插件。

**解决方案**：
```js
// 压缩（基于公开知识补充）
const server = Hapi.server({
    port: 3000,
    compression: {
        // 白名单：只对 JSON/HTML 压缩
        test: (request) => {
            const ct = request.headers['content-type'] || '';
            return /json|text|html/.test(ct);
        }
    }
});

// 静态文件
const inert = require('@hapi/inert');
await server.register(inert);

server.route({
    method: 'GET',
    path: '/static/{param*}',
    options: {
        // inert 文件路由
        files: {
            relativeTo: Path.join(__dirname, 'public'),
            etagMethod: 'sha256',  // 强 ETag
            lookupCompressed: true  // 自动 .gz
        }
    },
    handler: {
        directory: {
            path: '.',
            redirectToSlash: true,
            index: ['index.html']
        }
    }
});

// 范围请求（视频/大文件）
server.route({
    method: 'GET',
    path: '/videos/{name}',
    handler: {
        file: function (request) {
            return 'video.mp4';
        }
    }
});
// 客户端发 Range: bytes=0-1023 → 返回 206 Partial Content
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| compression test | 白名单 MIME | 节省 CPU |
| ETag | sha256 | 强一致性 |
| Cache-Control | max-age=31536000 | 静态文件 1 年 |
| Range | bytes=N-M | 断点续传 |

**最佳实践**：
1. ✅ 压缩只对 `text/json/html` 启用，**图片/视频不压**（已压过，浪费 CPU）
2. ✅ ETag 用 sha256（强）而非 inode（弱）——CDN 友好
3. ✅ 静态文件加 `Cache-Control: public, max-age=31536000, immutable`，**1 年不重验证**
4. ✅ 大文件用 `Range` 支持，**断点续传 + 视频随机 seek**

## 四、可靠性与工程实践

### 16. 自动文档生成（API Documentation via Routes JSON）

**问题场景**：手写 API 文档容易和代码脱节——文档说支持 `?limit=10`，实际不接。hapi 用路由 JSON 自动生成 Swagger/OpenAPI，**代码即文档**。

**解决方案**：
```js
// 路由带文档（基于公开知识补充）
server.route({
    method: 'POST',
    path: '/api/users',
    options: {
        description: 'Create a new user',
        notes: 'Requires admin role',
        tags: ['api', 'user'],
        validate: {
            payload: Joi.object({
                name: Joi.string().required().description('User name'),
                email: Joi.string().email().required().description('User email'),
                age: Joi.number().integer().min(0).max(150)
            })
        }
    },
    handler: ...
});

// 注册 swagger 插件
const hapiSwagger = require('hapi-swagger');
const inert = require('@hapi/inert');
const vision = require('@hapi/vision');

await server.register([
    inert, vision,
    {
        plugin: hapiSwagger,
        options: {
            info: { title: 'User API', version: '1.0.0' },
            schemes: ['https'],
            documentationPath: '/docs',
            jsonPath: '/swagger.json'
        }
    }
]);

// 访问：
//   https://app.com/docs        → Swagger UI
//   https://app.com/swagger.json → 机器可读 OpenAPI
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| description | 1-2 句 | 接口功能 |
| notes | 详细 | 注意事项 |
| tags | ['api', 'user'] | 分类 |
| Joi description | 字段说明 | 出现在 docs |

**最佳实践**：
1. ✅ 路由的 `validate` 用 Joi schema——hapi 验证同时生成文档
2. ✅ 字段加 `.description('...')`——直接进入 Swagger 字段说明
3. ✅ `tags` 是过滤维度——`api-public` / `api-admin` / `api-internal`
4. ✅ `swagger.json` 路径用机器消费（如 SDK 生成），`/docs` 路径用浏览器

### 17. 请求日志与请求 ID（Logging & Correlation）

**问题场景**：生产环境出问题时，需要看每个请求的处理路径、耗时、状态。hapi 用 `server.events` + `request.id` 自动记录，每个请求可关联到日志、metrics、trace。

**解决方案**：
```js
// 请求事件订阅（基于公开知识补充）
server.events.on('request', (request, event, tags) => {
    // event 可能是 '内部事件'（hapi 内部 emit）
    // event 也可能是 '外部事件'（handler emit）
    
    if (event.error) {
        // 错误请求
        logger.error({
            request_id: request.id,
            method: request.method,
            path: request.path,
            err: event.error,
            ms: request.info.responded - request.info.received
        }, 'request error');
    } else if (event.channel === 'app' && tags.received) {
        // 请求开始
        logger.info({ 
            request_id: request.id, 
            method: request.method, 
            path: request.path 
        }, 'request received');
    }
});

// 自定义事件（业务埋点）
server.events.on({ name: 'request', channels: 'app' }, (request, event) => {
    if (event.tags && event.tags.audit) {
        // 审计日志
        auditLog.write({
            request_id: request.id,
            user_id: request.auth.credentials?.id,
            action: event.data.action,
            resource: event.data.resource
        });
    }
});

// handler 内 emit
server.route({
    method: 'POST',
    path: '/api/users',
    handler: async (request, h) => {
        const user = await db.user.create(request.payload);
        // 业务事件
        request.server.events.emit({ name: 'request', channel: 'app', tags: { audit: true } }, request, {
            action: 'user.create',
            resource: `user:${user.id}`
        });
        return user;
    }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| request.id | UUID | 全链路 ID |
| request.info.received | ms 时间戳 | 请求开始 |
| request.info.responded | ms 时间戳 | 响应结束 |
| event.tags | { name: value } | 事件标签 |

**最佳实践**：
1. ✅ request.id 用 UUID v4，前端可在 header `X-Request-ID` 传入，hapi 沿用
2. ✅ `request-server-events` 集中订阅，**不直接 logger.log**
3. ✅ 业务事件用 `channel: 'app'` + `tags: { audit: true }` 区分
4. ✅ 错误必须 `tags: ['error']` 或 `event.error` 字段，否则埋点失效

### 18. 优雅停服与信号处理（Graceful Shutdown）

**问题场景**：K8s 滚动更新时，旧 Pod 收到 SIGTERM，要"停止接收新请求 + 等在途请求完成 + 关闭数据库连接"，否则 in-flight 请求被中断，用户看到 502。hapi 提供 `server.stop()` 协调这个流程。

**解决方案**：
```js
// 优雅停服（基于公开知识补充）
const shutdown = async (signal) => {
    console.log(`Received ${signal}, starting graceful shutdown...`);
    
    // 1. 停止接收新请求（关闭 listener）
    // 2. 等待 in-flight 请求完成（默认 5s 超时）
    try {
        await server.stop({ timeout: 30 * 1000 });
        console.log('All connections closed, server stopped');
        
        // 3. 关闭数据库连接
        await db.close();
        console.log('Database connections closed');
        
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// onPostStop 钩子：清理资源
server.ext('onPostStop', async (server) => {
    // 关闭 cache 连接
    await server.cache.connection?.client?.quit?.();
    
    // 关闭 Redis（如果用）
    if (redisClient) {
        await redisClient.quit();
    }
    
    // 关闭 DB
    await db.close();
});

// 拒绝新请求（health check 先失败）
server.ext('onPreStart', async (server, h) => {
    // 注册 health route
    server.route({
        method: 'GET',
        path: '/health',
        handler: (request) => {
            if (server.info.started && !server.info.shutting) {
                return { status: 'ok' };
            }
            return h.response({ status: 'shutting-down' }).code(503);
        }
    });
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| timeout | 30s | in-flight 等待上限 |
| signal | SIGTERM / SIGINT | K8s 默认 SIGTERM |
| process.exit | 0 / 1 | 0 = 成功 |
| onPostStop | 清理 | 关闭所有外部连接 |

**最佳实践**：
1. ✅ 必须监听 SIGTERM（K8s）和 SIGINT（Ctrl+C）
2. ✅ 等待超时设 30s——超过此值强杀，避免 K8s 卡滚动更新
3. ✅ 关闭顺序：先 `server.stop`（停止 listener），再关 DB/cache
4. ✅ K8s 配合 readiness probe——`/health` 失败 → 流量被踢 → 然后再 SIGTERM

### 19. CORS 与安全头（CORS & Security Headers）

**问题场景**：浏览器跨域请求需要 CORS 头；XSS 需要 CSP；点击劫持需要 X-Frame-Options。hapi 用 `server.options.security` + `server.options.cors` 一站式配置。

**解决方案**：
```js
// CORS + 安全配置（基于公开知识补充）
const server = Hapi.server({
    port: 3000,
    router: {
        stripTrailingSlash: true
    },
    // CORS
    cors: {
        origin: ['https://app.example.com', 'https://admin.example.com'],
        credentials: true,  // 允许 cookie
        headers: ['Authorization', 'Content-Type', 'X-Request-ID'],
        exposedHeaders: ['X-RateLimit-Remaining'],
        maxAge: 600  // 预检缓存
    },
    // 安全头
    security: {
        xframe: 'sameorigin',           // X-Frame-Options: SAMEORIGIN
        xss: true,                      // X-XSS-Protection: 1; mode=block
        noOpen: true,                   // X-Download-Options: noopen
        noSniff: true,                  // X-Content-Type-Options: nosniff
        referrer: 'no-referrer',        // Referrer-Policy
        hsts: {
            maxAge: 31536000,           // HSTS 1 年
            includeSubDomains: true,
            preload: true
        },
        // CSP
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'https://api.example.com']
            }
        },
        // 禁用
        xPoweredBy: false
    }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| CORS origin | 白名单 | 不要 `*` |
| credentials | true | 需配合 origin 白名单 |
| HSTS maxAge | 1 年 | 强制 HTTPS |
| CSP | self + 必要例外 | 防 XSS |

**最佳实践**：
1. ✅ CORS `origin` 必须是白名单数组，**不要 `*` + credentials**（浏览器会拒）
2. ✅ HSTS preload 后无法撤回，**确认 HTTPS 永久化再 preload**
3. ✅ CSP `script-src 'self' 'unsafe-inline'` 是常见妥协——严格应 nonce/hash
4. ✅ `X-Powered-By` 必关，**减少攻击面（不暴露 hapi 身份）**

### 20. 生产部署与多实例水平扩展（Production Deployment & HA）

**问题场景**：单实例 hapi 在流量大时挂掉。需要多实例 + 负载均衡 + 共享会话/限流 + 监控告警。如何部署才能高可用？

**解决方案**：
```yaml
# Kubernetes 部署（基于公开知识补充）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hapi-app
spec:
  replicas: 3
  selector:
    matchLabels: { app: hapi-app }
  template:
    metadata:
      labels: { app: hapi-app }
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: hapi
        image: myorg/hapi-app:v21.4.9
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: REDIS_HOST
          valueFrom:
            configMapKeyRef: { name: hapi-config, key: redis-host }
        - name: DB_URL
          valueFrom:
            secretKeyRef: { name: hapi-secrets, key: db-url }
        livenessProbe:
          httpGet: { path: /health/live, port: 3000 }
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet: { path: /health/ready, port: 3000 }
          initialDelaySeconds: 5
          periodSeconds: 5
        lifecycle:
          preStop:
            exec:
              command: ["sh", "-c", "sleep 15"]  # 等待 LB 踢出
        resources:
          requests: { cpu: 100m, memory: 256Mi }
          limits:   { cpu: 1000m, memory: 1Gi }

---
apiVersion: v1
kind: Service
metadata:
  name: hapi-app
spec:
  type: ClusterIP
  selector: { app: hapi-app }
  ports:
  - port: 80
    targetPort: 3000
```

**多实例必做**：
```js
// 1. 共享 session（用 Redis 而非内存）
const server = Hapi.server({
    cache: { provider: redisClient },  // catbox-redis
    state: {
        cookie: {
            password: process.env.COOKIE_PASSWORD,  // 32 字节 base64
            isSecure: true,
            ttl: 7 * 24 * 60 * 60 * 1000  // 7 天
        }
    }
});

// 2. 限流用 Redis（多实例共享）
const RateLimit = require('@hapi/ratelimit');
await server.register({
    plugin: RateLimit,
    options: {
        redis: { host: process.env.REDIS_HOST, port: 6379 }
    }
});

// 3. 健康检查
server.route({
    method: 'GET',
    path: '/health/ready',
    handler: async (request, h) => {
        // 探测依赖：DB / Redis / 外部 API
        try {
            await db.ping();
            await redisClient.ping();
            return { status: 'ready' };
        } catch (err) {
            return h.response({ status: 'unready', err: err.message }).code(503);
        }
    }
});

// 4. 优雅停服
process.on('SIGTERM', async () => {
    await server.stop({ timeout: 30 * 1000 });
    await db.close();
    process.exit(0);
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| replicas | 3+ | HA 最低 |
| livenessProbe | /health/live | 10s 间隔 |
| readinessProbe | /health/ready | 5s 间隔 |
| preStop sleep | 15s | 等 LB 摘流 |

**最佳实践**：
1. ✅ 多实例必须**无状态**——session/cache/限流都走 Redis，**禁止内存**
2. ✅ readiness probe 探测外部依赖（DB/Redis），不健康就 503
3. ✅ preStop `sleep 15`——给 LB 摘流时间，避免 K8s 滚动更新 502
4. ✅ 监控 `hapi_*` metrics（request/sec、p99 latency、error rate）—— 配套 Prometheus + Grafana
5. ✅ 用 `@hapi/nes`（WebSocket）或 `@hapi/poop`（SSE）做实时推送——多实例需 sticky session

---

**标签**：#hapi #web-framework #nodejs
**状态**：20/20 份详细内容
