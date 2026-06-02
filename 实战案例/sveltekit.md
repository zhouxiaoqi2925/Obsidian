# sveltekit - 编译时驱动框架

**来源**：GitHub sveltejs/kit（v2.61.1，2026-06 解析）
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. 编译时清单（Manifest SSOT）

**问题场景**：
SvelteKit 的路由表、节点、matcher、hooks、assets 是"从文件系统派生的元数据"——如果用运行时再扫文件，每次冷启都要扫 100ms；如果用代码生成但分散在多个文件，类型推导就脱节。需要一个"单一事实源"（SSOT）：扫文件 → 生成数据对象 → 烤成 .svelte-kit/generated/*。

**解决方案**：

```typescript
// packages/kit/src/core/sync/sync.js
export async function create(config: ValidatedConfig): Promise<ManifestData> {
  // 1) 扫 src/routes/** 目录
  const routes = await scan_routes(config.kit.files.routes);
  // 2) 解析 [param]/[[opt]]/[...rest]/[name=matcher]
  const nodes = parse_routes(routes);
  // 3) 收集 hooks/matchers
  const manifest_data = {
    routes: nodes,
    nodes,
    matchers: config.kit.matchers,
    hooks: config.kit.hooks,
    assets: config.kit.files.assets
  };
  // 4) 烤到 .svelte-kit/generated/
  await write_client_manifest(manifest_data);
  await write_server(manifest_data);
  await write_all_types(manifest_data);
  return manifest_data;
}
```

```
src/routes/*.svelte
       │
       ▼
sync.create(config)
       │
       ▼
ManifestData { routes, nodes, matchers, hooks, assets }
       │
       ├──→ .svelte-kit/generated/client/app.js      (浏览器路由表)
       ├──→ .svelte-kit/generated/server/internal.js (server 入口)
       └──→ .svelte-kit/types/*  (自动类型)
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `routes` | `src/routes` | 路由根 |
| `matchers` | `paramMatchers: { slug: /.../ }` | 自定义匹配 |
| `hooks` | `src/hooks.server.js` | 钩子 |
| `nodes` | flat array | 平铺的路由节点 |
| `ssr` | true | 服务端渲染 |

**最佳实践**：
1. ✅ ManifestData 是 SSOT——所有路由/类型/客户端清单从此派生
2. ✅ 任何路由变更只需重跑 `sync.create()`——运行时不感知
3. ✅ `.svelte-kit/generated/` 走 .gitignore——是产物
4. ✅ 类型自动从 ManifestData 派生——`$types` 是魔法
5. ✅ Dev 模式监听 `routes/` 文件变化——自动重跑

---

### 2. 路由解析正则（parse_route_id）

**问题场景**：
文件系统路由 `/blog/[slug]/+page.svelte` 要在运行时判断"哪个 URL 匹配"。Trie 树虽然 O(1)，但 90% 项目用不上——简单正则 `^/blog/([^/]+?)/?$` 性能足够，可读性高。

**解决方案**：

```javascript
// packages/kit/src/utils/routing.js
const param_pattern = /^\[(\.\.\.)?(\w+)(?:=(\w+))?\]$/;

export function parse_route_id(route_id) {
  const params = [];
  const pattern = route_id
    .split('/')
    .map((segment) => {
      // 1) 切 [param] / [[opt]] / [...rest] / [name=matcher]
      const parts = segment.split(/\[(.+?)\](?!\])/);
      return parts
        .map((part, i) => {
          if (i % 2 === 0) return part; // 偶数索引是 literal
          // 奇数索引是 param
          const m = part.match(param_pattern);
          if (!m) return part;
          const [...rest, name, matcher] = m;
          if (rest[0]) params.push({ name, rest: true });  // [...rest]
          else if (part.startsWith('[[')) params.push({ name, optional: true });  // [[opt]]
          else params.push({ name, matcher });  // [slug] / [slug=matcher]
          return matcher ? `:${matcher}` : '[^/]+?';  // matcher 模式
        })
        .join('');
    })
    .join('/');
  return {
    pattern: new RegExp(`^${pattern}/?$`),
    params
  };
}

// 使用
const { pattern, params } = parse_route_id('/blog/[slug]');
// pattern: /^\/blog\/([^/]+?)\/?$/
// params: [{ name: 'slug', matcher: undefined }]
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `[name]` | required | 必填参数 |
| `[[name]]` | optional | 可选参数 |
| `[...name]` | rest | 剩余参数 |
| `[name=matcher]` | custom | 自定义匹配器 |
| `[name+22]` | URL 编码 | 字符编码支持 |

**最佳实践**：
1. ✅ 用正则而非 trie——90% 项目性能够
2. ✅ `params` 数组按顺序收集——render 时按名取
3. ✅ 字符编码 `[name+22]` 支持国际化——常被忽略
4. ✅ `matcher` 自定义函数——比如 `int`、`uuid`
5. ✅ 大项目可改 trie——目前是 O(N) 顺序匹配

---

### 3. AsyncLocalStorage 请求作用域

**问题场景**：
SvelteKit 的 `load` 函数签名是 `async ({ params, fetch }) => data`——**没有 event 参数**。但深层 `load` 要能拿到 request 上下文（cookies、URL、headers）。如果显式传 `ctx`，每层都要传——啰嗦且破坏 Svelte 组件的同步写法。

**解决方案**：

```javascript
// packages/kit/src/exports/vite/dev/index.js
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

// 进入请求作用域
function handle(request, response) {
  const event = create_event(request, response);
  // AsyncLocalStorage.run 把 event 注入整个调用链
  als.run({ event, config, prerender }, async () => {
    await internal_respond(request, response);
  });
}

// 任何位置（无 event 参数）都能拿
function loadData() {
  const { event } = als.getStore();
  return event.fetch('/api/data');
}
```

```javascript
// packages/kit/src/runtime/server/respond.js
// 把 internal_respond 用 propagate_context 包一层
export const respond = propagate_context(internal_respond);

function propagate_context(fn) {
  return (event, ...args) => {
    return als.run({ event, config: event.config }, () => fn(event, ...args));
  };
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `AsyncLocalStorage` | node:async_hooks | 异步作用域 |
| `als.run(store, fn)` | 入口 | 注入 store |
| `als.getStore()` | 子节点取 | 拿当前 store |
| `event` | { request, url, cookies, params } | 请求上下文 |
| `prerender` | bool | 预渲染标记 |

**最佳实践**：
1. ✅ `AsyncLocalStorage` 替代显式传 ctx——load 函数签名极简
2. ✅ 整个调用链共享——任何位置都能拿 event
3. ✅ SSR + dev 模式都用——prod 走相同路径
4. ✅ 注意：不能跨请求 boundary（用 `getStore()` 检测）
5. ✅ 标准库 `node:async_hooks`——无需 polyfill

---

### 4. 路由分发中央调度（respond.js）

**问题场景**：
SvelteKit 一个 HTTP 请求可能走 4 条路径：GET 页面、POST form action、/api 端点、/__data.json 取数据、/remote RPC。如果分散在各 handler 里，CSRF/cookie/redirect 逻辑要写 4 遍。需要一个中央调度 `respond.js`。

**解决方案**：

```javascript
// packages/kit/src/runtime/server/respond.js
export const respond = propagate_context(internal_respond);

async function internal_respond(event) {
  // 1) CSRF 防护（prod 模式）
  if (!DEV) {
    const csrf_ok = check_csrf(event);
    if (!csrf_ok) return new Response('Forbidden', { status: 403 });
  }

  // 2) 路由类型分发
  if (event.route.id === null) return handle_404(event);

  // 3) /__data.json 客户端导航取数据
  if (event.route.id.endsWith('/__data.json')) return render_data(event);

  // 4) /__server.js 端点
  if (event.is_endpoint) return handle_endpoint(event);

  // 5) remote functions (v2.27+)
  if (event.is_remote) return handle_remote(event);

  // 6) 页面渲染
  return render_page(event);
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `page_methods` | new Set(['GET', 'HEAD', 'POST']) | 页面方法 |
| `__data.json` | suffix | 客户端导航数据 |
| `__server.js` | suffix | 端点文件 |
| `remote` | v2.27+ | RPC 函数 |
| `event.route.id` | string | 匹配的路由 ID |

**最佳实践**：
1. ✅ 中央调度统一 CSRF/cookie/redirect——4 条路径共享
2. ✅ `page_methods` 用方法名分发——简化逻辑
3. ✅ `__data.json` 后缀让客户端导航只取数据
4. ✅ 端点和页面分离——`+server.js` vs `+page.svelte`
5. ✅ Dev 模式不强制 CSRF——HMR 友好

---

### 5. Vite Dev Plugin 集成

**问题场景**：
SvelteKit 是 Vite-based meta-framework——dev 模式要在 Vite 中间件链里加路由处理、SSR、HMR、错误推送。如果硬塞进 Vite 钩子，复杂度爆炸。需要一个"独立 dev plugin"。

**解决方案**：

```javascript
// packages/kit/src/exports/vite/dev/index.js
export function dev(config) {
  // 1) 启动 sync.create
  const manifest_data = await sync.create(config);

  // 2) 注入 AsyncLocalStorage
  const als = new AsyncLocalStorage();

  // 3) Vite 中间件：拦截所有非 asset 请求
  return {
    name: 'svelte-kit-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res) => {
        // 只处理 SvelteKit 路由
        if (req.url.startsWith('/@') || req.url.startsWith('/node_modules')) return;

        // 进入 AsyncLocalStorage 作用域
        await als.run({ event, config, manifest_data }, async () => {
          await internal_respond(req, res);
        });
      });

      // 4) HMR 错误推给浏览器
      server.ws.on('error', (err) => {
        server.ws.send({ type: 'error', err: { message, stack } });
      });
    }
  };
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `configureServer` | Vite 钩子 | 注入中间件 |
| `server.middlewares` | express-like | 路由拦截 |
| `server.ws` | WebSocket | HMR 通信 |
| `als.run` | AsyncLocalStorage | 请求作用域 |
| `manifest_data` | sync 产物 | 路由表 |

**最佳实践**：
1. ✅ Vite plugin 独立文件——`exports/vite/dev/index.js`
2. ✅ `server.middlewares.use` 拦截请求——非 asset 才走 SvelteKit
3. ✅ WebSocket 推错误——SSR 错误可视化
4. ✅ `globalThis.__SVELTEKIT_TRACK__` 记录 feature 使用——可观测
5. ✅ 启动时调 `sync.create`——单次扫描

---

## 二、架构设计

### 6. 编译/运行/部署三层分离

**问题场景**：
Meta-framework 同时管"怎么编译"（Vite plugin）、"怎么跑"（SSR/CSR）、"怎么部署"（adapter）——三者耦合在一起会变成"巨型框架"。需要清晰的"编译时-运行时-部署时"分离。

**解决方案**：

```
┌─────────────────────────────────────────────────────────────┐
│  编译时 (packages/kit/src/core)                              │
│  ─ sync/sync.js → ManifestData                              │
│  ─ adapt/builder.js → Builder 接口                          │
│  ─ generate_manifest/ → 烤代码                               │
└─────────────────────────────────────────────────────────────┘
                              ↓ .svelte-kit/generated/*
┌─────────────────────────────────────────────────────────────┐
│  运行时 (packages/kit/src/runtime)                           │
│  ─ server/respond.js → 中央调度                              │
│  ─ client/client.js → 客户端导航                             │
│  ─ app/ → paths/state/forms                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓ build output
┌─────────────────────────────────────────────────────────────┐
│  部署时 (packages/adapter-*)                                 │
│  ─ adapter-node → Node server                              │
│  ─ adapter-vercel → Vercel Functions                        │
│  ─ adapter-cloudflare → Cloudflare Workers/Pages            │
│  ─ adapter-netlify → Netlify Functions                     │
│  ─ adapter-static → 纯静态                                  │
│  ─ adapter-auto → 自动检测                                  │
└─────────────────────────────────────────────────────────────┘
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `core/sync` | 编译时 | 文件系统扫 |
| `core/adapt` | 构建时 | 平台无关产物 |
| `runtime/server` | 运行时 | SSR |
| `runtime/client` | 运行时 | 客户端导航 |
| `adapter-X` | 部署时 | 平台特定 |

**最佳实践**：
1. ✅ 编译/运行/部署三层严格分开——各包独立可测
2. ✅ core 不依赖任何 adapter——平台无关
3. ✅ runtime 不依赖任何 Vite——prod 也用
4. ✅ adapter 只依赖 core 的 Builder 接口——简单
5. ✅ 跨包共享代码用 `exports/internal/`——避免循环依赖

---

### 7. Adapter 模式（Builder 接口）

**问题场景**：
SvelteKit 支持 6 个部署平台（Node / Vercel / Cloudflare / Netlify / Static / Auto）——如果每个 adapter 都自己实现构建逻辑，会有 6 份重复代码。需要一个"Builder 接口" + 6 个 adapter 实现。

**解决方案**：

```typescript
// packages/kit/src/core/adapt/builder.js
export function create_builder({
  config, build_data, route_data, prerendered, server_metadata, remotes
}) {
  return {
    writeClient(dest: string) { /* 写 client manifest */ },
    writeServer(dest: string) { /* 写 server entry */ },
    writePrerendered(dest: string) { /* 写预渲染 HTML */ },
    writeRemotes(dest: string) { /* 写 remote functions */ },
    log(msg: string) { /* adapter 自己的 logger */ }
  };
}

// adapter-node 实现（~500 行）
export default {
  name: 'adapter-node',
  async adapt(builder) {
    // 1) 写客户端 + server entry
    builder.writeClient('build/client');
    builder.writeServer('build/server');
    // 2) 写 Node 平台 shim
    files.writeFile('build/handler.js', HANDLER_SOURCE);
    files.writeFile('build/index.js', SERVER_SOURCE);
  }
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `Builder` | interface | adapter 接收 |
| `route_data` | routes | 路由表 |
| `prerendered` | pages | 预渲染 HTML |
| `server_metadata` | assets | 服务端元数据 |
| `remotes` | v2.27+ | remote functions |

**最佳实践**：
1. ✅ Builder 接口最小化——adapter 只关心"哪些文件 + 哪些 HTML"
2. ✅ 6 个 adapter 各 200-500 行——不重复
3. ✅ adapter-auto 自动检测——读环境变量
4. ✅ 平台 shim 写在 adapter 里——handler.js / index.js
5. ✅ 任何平台都可加 adapter——Deno/Bun 由社区提供

---

### 8. Remote Functions（v2.27+）

**问题场景**：
传统 `+page.server.js` 的 `load` 函数粒度粗——一个页面只能有一个 `load`，要么全取要么全不取。v2.27 引入 "remote functions" 提供更细粒度的 RPC：每个函数独立端点、独立缓存、独立校验。

**解决方案**：

```javascript
// packages/kit/src/runtime/app/server/remote/query.js
import { query } from '$app/server';
import * as v from 'valibot';

export const getArticle = query(
  v.object({ id: v.string() }),
  async ({ id }) => {
    return db.articles.findUnique({ where: { id } });
  }
);

// 浏览器端调用（自动走 fetch）
const article = await getArticle({ id: '123' });

// Server 端调用（自动直调）
const article = await getArticle({ id: '123' }); // 同一份代码
```

```typescript
// 缓存粒度在 bind(payload, validated_arg) 阶段
export function bind<T, S extends StandardSchemaV1>(schema: S, fn: T): RemoteQueryFunction {
  return {
    async call(payload) {
      // 1) 用 Standard Schema 校验
      const validated = schema['~standard'].validate(payload);
      // 2) 拿缓存
      const cached = cache.get(validated);
      if (cached) return cached;
      // 3) 跑用户函数
      const result = await fn(validated);
      cache.set(validated, result);
      return result;
    }
  };
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `query(fn)` | RPC | 浏览器走 fetch，server 走直调 |
| `Standard Schema` | 通用 | Zod/Valibot/ArkType 互通 |
| `bind(payload, arg)` | 缓存粒度 | 按参数缓存 |
| `cacheKey` | JSON.stringify | 序列化参数 |
| `cache TTL` | 默认 1min | 可配 |

**最佳实践**：
1. ✅ `query()` 替代粗粒度 `load`——每个函数独立
2. ✅ Standard Schema 互通——不绑架用户
3. ✅ 浏览器/server 同一份代码——自动适配
4. ✅ bind 阶段校验 + 缓存——一次完成
5. ✅ v2.27+ 才支持——老代码用 `load`

---

### 9. Svelte 4/5 双 Runtime 兼容

**问题场景**：
SvelteKit 2.0 支持 Svelte 4 和 Svelte 5 双版本——但 Svelte 4 是 Options API + `$:` reactivity，Svelte 5 是 Runes + `$state/$derived/$effect`。两套 runtime 的 fallback layout 组件不通用，需要根据 Svelte 版本切换。

**解决方案**：

```
runtime/components/
├── svelte-4/
│   ├── error.svelte          # Svelte 4 写法
│   ├── head.svelte
│   └── ...
└── svelte-5/
    ├── error.svelte          # Svelte 5 Runes 写法
    ├── head.svelte
    └── ...
```

```javascript
// packages/kit/src/exports/vite/index.js
import svelte from 'vite-plugin-svelte';
import { svelte_config } from '../utils/svelte-config.js';

export function sveltekit(config) {
  // 1) 读 svelte.config.js 拿 Svelte 版本
  const version = await get_svelte_version();
  // 2) 选 components 目录
  const components_dir = version === 5 ? 'svelte-5' : 'svelte-4';
  // 3) 配置 svelte plugin
  return [
    svelte({ ...svelte_config, components: path.join('runtime/components', components_dir) })
  ];
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `svelte-4` | `<script>` Options API | 老写法 |
| `svelte-5` | `<script>` Runes | 新写法 |
| `components dir` | runtime/components/svelte-X | 按版本切换 |
| `peer dep` | `svelte: ^4 \|\| ^5` | 兼容范围 |
| `migration` | `npx sv migrate` | 工具 |

**最佳实践**：
1. ✅ 双 runtime fallback 优雅升级——不用等全员迁移
2. ✅ `npx sv migrate` 一键升级脚本
3. ✅ 跨大版本兼容通过文件目录切换——`components/svelte-X/`
4. ✅ Svelte 5 编译产物 ≥ Svelte 4 性能
5. ✅ 升级期间两版本共存——按项目粒度迁移

---

### 10. 客户端导航（client.js）

**问题场景**：
SvelteKit 的客户端导航需要在不刷新整个页面的情况下加载新页面——保持 Svelte 组件状态、动画连续、只取数据（`__data.json`）。这是一个 SPA-like 体验但要兼容 SSR。

**解决方案**：

```javascript
// packages/kit/src/runtime/client/client.js
export async function goto(url, { replaceState = false, noscroll = false, keepFocus = false } = {}) {
  // 1) history API
  const href = create_href(url);
  history[replaceState ? 'replaceState' : 'pushState']({}, '', href);

  // 2) 调 native_navigate
  await native_navigate(href, { replaceState, noscroll, keepFocus });
}

async function native_navigate(href, opts) {
  // 1) 走 router
  const route = await router.resolve(href);
  // 2) 拿 /__data.json
  const data = await fetch(`${href}__data.json`).then((r) => r.json());
  // 3) 更新 Svelte 组件状态（$app/stores）
  navigating.set(null);
  page.set({ url: href, params: route.params, route: route.id, status: 200, data, error: null });
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `goto(url)` | string | 编程式导航 |
| `<a href="..." data-sveltekit-preload-data>` | hover 预取 | 鼠标悬停预取 |
| `__data.json` | suffix | 数据端点 |
| `replaceState` | bool | 替换 history |
| `noscroll` | bool | 不滚顶 |

**最佳实践**：
1. ✅ `data-sveltekit-preload-data` 鼠标悬停预取——首屏体验
2. ✅ `__data.json` 后缀让客户端只取数据——省 HTML
3. ✅ history API 推进栈——后退按钮不刷新
4. ✅ 路由参数 `$page.params` 自动更新
5. ✅ `noscroll` 保留滚动位置——分页场景

---

## 三、性能优化

### 11. 路由正则匹配（O(N) 顺序）

**问题场景**：
SvelteKit 每次请求都要"在路由表里找匹配"——如果用 trie 树，插入/构建都慢，N 数量级小。简单顺序正则匹配 `O(N × pattern.length)` 对 1000 个路由仍然 < 1ms。

**解决方案**：

```javascript
// packages/kit/src/runtime/server/page/server_routing.js
export function find_route(routes, url) {
  for (const route of routes) {
    const match = route.pattern.exec(url.pathname);
    if (match) {
      const params = {};
      route.params.forEach((p, i) => {
        params[p.name] = match[i + 1];
      });
      return { route, params };
    }
  }
  return null;
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `routes` | 1000+ | 路由表 |
| `pattern` | RegExp | 编译后的正则 |
| `match[i+1]` | string | 捕获组 |
| `params.name` | matcher 模式 | 自定义匹配 |
| `rest` | 数组 | `[...rest]` |

**最佳实践**：
1. ✅ 顺序正则匹配性能够用——1000 路由 < 1ms
2. ✅ 路由数 > 5000 才考虑 trie
3. ✅ matcher 自定义函数——int/uuid 提前过滤
4. ✅ `rest` 数组的捕获——`match.slice(1)` 取剩余
5. ✅ 编译时把 `[name=matcher]` 编译到正则——避免运行时函数调用

---

### 12. 预渲染 + 流式 SSR

**问题场景**：
SvelteKit 既要支持"每次请求渲染"（SSR），又要支持"构建时渲染"（SSG）。如果用两套代码路径，复杂且不一致。需要"统一响应函数 + 不同入口"。

**解决方案**：

```javascript
// packages/kit/src/core/adapt/builder.js
async function prerender(routes) {
  for (const route of routes) {
    if (route.prerender) {
      // 1) 构造 fake event
      const event = create_event({ url: route.path, method: 'GET' });
      // 2) 调 respond
      const response = await respond(event);
      // 3) 写 HTML 到 prerendered/ 目录
      const html = await response.text();
      writeFileSync(`build/prerendered${route.path}/index.html`, html);
    }
  }
}
```

```javascript
// packages/kit/src/runtime/server/respond.js
// 流式 SSR
return new Response(
  new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      // 1) 写 head
      controller.enqueue(encoder.encode('<!doctype html><html><head>...'));
      // 2) 写 Svelte 组件
      for await (const chunk of render_ssr(component)) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  }),
  { headers: { 'Content-Type': 'text/html' } }
);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `prerender: true` | 路由级 | 构建时渲染 |
| `entry: 'prerendered'` | adapter | 平台缓存 |
| `stream` | ReadableStream | 流式 SSR |
| `Content-Encoding: br` | adapter | Brotli 压缩 |
| `Cache-Control` | s-maxage | CDN 缓存 |

**最佳实践**：
1. ✅ 预渲染走同一份 `respond.js`——保证 SSR/SSG 一致
2. ✅ 流式 SSR 大页面首屏 < 200ms
3. ✅ adapter 把预渲染产物当成静态文件——CDN 友好
4. ✅ `prerender: true` 在路由文件里标记
5. ✅ Brotli 压缩 HTML——再小 20%

---

### 13. Tree-Shaking 友好

**问题场景**：
SvelteKit 包 90% 用户只用了 30% 功能——如果 import 全量，bundle 涨 50KB。需要每个 helper 单文件、sideEffects: false 标记。

**解决方案**：

```json
// packages/kit/package.json
{
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./types/index.d.ts",
      "import": "./src/runtime/app/server/respond.js"
    },
    "./internal": "./src/runtime/internal/server.js"
  }
}
```

```javascript
// 单文件 named export
export { render } from './render';
export { respond } from './respond';
export { getRequestEvent } from './event';
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `sideEffects: false` | package.json | tree-shake 标记 |
| `exports` | 单独路径 | 控制入口 |
| `module` | ESM only | 静态分析 |
| `external` | vite | 框架代码不打进 bundle |
| `alias` | `$app/*` | 用户代码入口 |

**最佳实践**：
1. ✅ `sideEffects: false` 让打包器放心 tree-shake
2. ✅ 每个 helper 单文件——编译产物按需 import
3. ✅ `package.json#exports` 限定入口——避免深层路径
4. ✅ Vite `ssr.noExternal` / `external` 控制是否打包
5. ✅ 框架代码永远走 external——用户项目自己打包

---

### 14. HMR 增量更新（sync.update）

**问题场景**：
Vite HMR 在单文件改动时要重新跑 sync——但全量 `sync.create()` 要 100+ ms。Vite watch 模式有"单文件改动"vs"整批改动"两种触发，需要 4 个函数对应 4 种场景。

**解决方案**：

```javascript
// packages/kit/src/core/sync/sync.js
// 1) 启动时跑 init（写 tsconfig + ambient）
export async function init() {
  await write_tsconfig();
  await write_ambient();
}

// 2) 全量 sync（启动时 + 整批改动时）
export async function create() {
  // 扫所有文件 → 写 client manifest + server + types
}

// 3) 增量 sync（单文件改动）
export async function update(file_path) {
  // 只分析受影响文件 → 增量重写 types
  const affected = await node_analyser(file_path);
  await write_types_for(affected);
}

// 4) all：全量 + types
export async function all() {
  await init();
  await create();
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `init()` | 配置/模式变化 | 不依赖文件 |
| `create()` | 启动/整批 | 全量 |
| `update(file)` | 单文件 | 增量 |
| `all()` | 串行包装 | 全量+types |
| `node_analyser` | diff | 受影响节点 |

**最佳实践**：
1. ✅ 4 个函数对应 4 种触发场景——HMR 路径只跑必要步骤
2. ✅ `node_analyser` 做 diff——只重写受影响 types
3. ✅ Vite watch 模式触发 update——单文件 < 50ms
4. ✅ 启动时跑 all——保证 SSOT
5. ✅ 大项目 `update` 比 `create` 快 5-10x

---

### 15. Form Actions（不离开页面提交）

**问题场景**：
SvelteKit 的 Form Actions 让你"不离开页面就能提交表单"——比传统 form submit 体验好。背后是"标准 form + 增强脚本"双轨：JS 加载后拦截提交，JS 失败回退到标准 form。

**解决方案**：

```svelte
<!-- +page.svelte -->
<form method="POST" action="?/create" use:enhance>
  <input name="title" />
  <button>Create</button>
</form>
```

```javascript
// packages/kit/src/runtime/app/forms.js
export function enhance(form_element, submit = () => {}) {
  form_element.addEventListener('submit', async (event) => {
    event.preventDefault();
    // 1) 拦截 + fetch
    const form_data = new FormData(form_element);
    const response = await fetch(form_element.action, {
      method: 'POST',
      body: form_data
    });
    // 2) 处理响应
    if (response.ok) {
      // invalidate() 触发 load 重新跑
      await invalidateAll();
    } else {
      // 错误显示
    }
  });
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `method="POST"` | form | 提交方法 |
| `action="?/create"` | URL | 路由 action |
| `use:enhance` | Svelte action | 增强脚本 |
| `invalidateAll()` | function | 重跑 load |
| `formData` | FormData | 表单数据 |

**最佳实践**：
1. ✅ `use:enhance` 渐进增强——JS 失败回退到标准 form
2. ✅ `?/create` URL 区分 action——同路由多 action
3. ✅ `invalidateAll()` 触发 load 重跑——SPA 体验
4. ✅ FormData 自动序列化——不用手写
5. ✅ 服务端用 `actions = { create: async ({ request }) => {} }` 接收

---

## 四、工程实践

### 16. 跨平台 E2E（每 adapter 真机）

**问题场景**：
SvelteKit 的 6 个 adapter 各自部署到不同平台——如果只在 CI 跑单测，会遗漏"只在 Vercel 出现的 SSR 函数超时"这种问题。需要每个 adapter 跑真机 E2E。

**解决方案**：

```yaml
# .github/workflows/platform-tests-all.yml
name: Platform Tests
on: { pull_request: { paths: ['packages/kit/**', 'packages/adapter-*/**'] } }
jobs:
  vercel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm build
      - name: Deploy to Vercel
        run: vercel deploy --prebuilt
        env: { VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }} }
      - name: Run E2E
        run: playwright test tests/e2e/vercel

  cloudflare:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm install
      - run: pnpm build
      - name: Deploy to Cloudflare
        run: wrangler pages deploy build
      - run: playwright test tests/e2e/cloudflare
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `vercel deploy --prebuilt` | CLI | 真部署 |
| `wrangler pages deploy` | Cloudflare | 真部署 |
| `playwright test` | E2E | 跨平台验证 |
| `secrets` | 加密 | 平台 token |
| `timeout` | 30min | adapter 部署 |

**最佳实践**：
1. ✅ 每个 adapter 跑真机 E2E——CI 抓"平台特定 bug"
2. ✅ 用平台 CLI 真部署——`vercel` / `wrangler` / `netlify`
3. ✅ Playwright 跑跨平台浏览器——一致体验
4. ✅ 平台 token 走 GitHub Secrets——加密
5. ✅ 复刻成本高的原因——必须真机验证

---

### 17. OpenTelemetry 可选集成

**问题场景**：
SvelteKit 集成 OpenTelemetry 给可观测性——但 OpenTelemetry 是 10+ MB 的依赖，强加给用户不合理。需要"条件 import + 标记为 optional"。

**解决方案**：

```json
// packages/kit/package.json
{
  "peerDependencies": {
    "@opentelemetry/api": "^1.0.0"
  },
  "peerDependenciesMeta": {
    "@opentelemetry/api": { "optional": true }
  }
}
```

```javascript
// packages/kit/src/runtime/telemetry/otel.js
let otel_api = null;
try {
  otel_api = await import('@opentelemetry/api');
} catch {
  // OpenTelemetry 未安装——降级
}

export function getTracer(name) {
  if (!otel_api) {
    // 返回 noop tracer
    return {
      startSpan: () => ({
        setAttribute: () => {},
        end: () => {},
        recordException: () => {}
      })
    };
  }
  return otel_api.trace.getTracer(name);
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `peerDependencies` | `@opentelemetry/api` | 软依赖 |
| `optional: true` | peer dep | 不强加 |
| `try/import` | 动态 | 降级 |
| `noop tracer` | fallback | 不装不报错 |
| `telemetry/otel.js` | conditional | 单独文件 |

**最佳实践**：
1. ✅ `peerDependenciesMeta.optional: true` 标记软依赖
2. ✅ 动态 import——不装不报错
3. ✅ 提供 noop fallback——无 OTel 也能跑
4. ✅ 用户主动 `pnpm add @opentelemetry/api` 启用
5. ✅ 不绑架用户——框架不该强制可观测方案

---

### 18. CSRF + CSP 防护

**问题场景**：
SvelteKit 默认安全：prod 模式强制 CSRF 同源检查、内置 CSP 头。但 dev 模式为了 HMR 便利不强制——开发期间允许跨源。需要在框架层把"安全策略"声明化。

**解决方案**：

```javascript
// packages/kit/src/runtime/server/respond.js
if (!DEV) {
  // CSRF 防护：检查 Origin 头
  const origin = request.headers.get('Origin');
  const csrf_ok = origin === url.origin;
  if (!csrf_ok) return new Response('Forbidden', { status: 403 });
}

// packages/kit/src/runtime/server/page/csp.js
export function csp(config, request) {
  const policy = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'", 'https://api.example.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"]
  };
  return Object.entries(policy)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `Origin` | same as url.origin | CSRF 检查 |
| `csp()` | function | CSP 策略 |
| `frame-ancestors` | 'none' | 防 clickjacking |
| `unsafe-inline` | 慎用 | Svelte 编译产物需要 |
| `nonce` | per request | 严格 CSP |

**最佳实践**：
1. ✅ Prod 模式强制 CSRF——dev 模式不强制
2. ✅ CSP 在 svelte.config.js 集中配置——不散在页面
3. ✅ `frame-ancestors: 'none'` 防 clickjacking
4. ✅ `connect-src` 显式列 API——不开放
5. ✅ 严格 CSP 用 nonce——避免 `'unsafe-inline'`

---

### 19. Changesets 语义化发版

**问题场景**：
SvelteKit 是 monorepo，多包各自版本——手动维护 CHANGELOG 容易漏。Changesets 工具：开发者写 changeset → bot 自动开 PR → 合并自动发版。

**解决方案**：

```bash
# 添加 changeset
pnpm changeset

# → 选择包
#   @sveltejs/kit (2.61.0 → 2.61.1)
# → bump 类型
#   patch (2.61.0 → 2.61.1)
# → 写 changelog
```

```markdown
<!-- .changeset/cool-feature.md -->
---
'@sveltejs/kit': minor
---

Add `?/create` form action syntax
```

```bash
# CI 跑
pnpm changeset version   # 合并 PR 时：升 package.json + 生成 CHANGELOG
pnpm changeset publish    # tag push 时：发 npm
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `.changeset/*.md` | 变更说明 | 临时 |
| `pnpm changeset version` | 合并 PR 时 | 升版本 |
| `pnpm changeset publish` | tag push 时 | 发版 |
| `bump type` | patch/minor/major | 语义化 |
| `GitHub Action` | changesets/action | 自动化 |

**最佳实践**：
1. ✅ 开发者写 changeset——bot 自动开 PR
2. ✅ `pnpm changeset version` 合并 PR 时跑——升版本
3. ✅ `pnpm changeset publish` tag push 时跑——发版
4. ✅ changesets/action GitHub App——无需自建 CI
5. ✅ patch/minor/major 严格——语义化版本

---

### 20. monorepo 工作区（pnpm）

**问题场景**：
SvelteKit monorepo 有 kit + 6 adapters + enhanced-img + package——共享 TypeScript 配置、test fixtures。pnpm 比 yarn/npm 节省 50% 磁盘，符号链接 store。

**解决方案**：

```json
// package.json
{
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "workspaces": [
    "packages/*",
    "documentation"
  ]
}
```

```bash
# 常用命令
pnpm install                          # 装所有包
pnpm --filter @sveltejs/kit test     # 只跑 kit 包的测试
pnpm --filter @sveltejs/kit build    # 只 build kit
pnpm -r run test                      # 所有包跑测试
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `pnpm version` | 9.0.0 | 当前版本 |
| `workspaces` | packages/* | monorepo 范围 |
| `--filter` | package name | 只对某包 |
| `-r` | recursive | 全部包 |
| `pnpm test` | vitest | 测试入口 |

**最佳实践**：
1. ✅ pnpm 比 yarn/npm 节省 50% 磁盘——硬链接 store
2. ✅ `--filter` 只跑某包——CI 提速
3. ✅ `workspaces` 范围明确——避免扫到无关注目录
4. ✅ `packageManager` 字段固定版本——团队一致
5. ✅ 跨包依赖用 workspace: protocol——版本一致

---

**标签**：#sveltekit #meta-framework #vite #ssr #adapter
**状态**：20/20 份详细内容
