# remix - Web 标准之上的可组合 TypeScript 工具集

**GitHub**: remix-run/remix
**Star**: 32k
**语言**: TypeScript
**主题**: Web Standards / Fetch API / 多运行时 / 可组合
**适用场景**: 全栈 Web 应用，需要 Node/Bun/Deno/Cloudflare Workers 跨运行时、偏好 Web 标准、不想被框架绑架

---

## 第一段：基础范式

### 模式 1：Web Standards 优先

**问题场景**：Node Express、Cloudflare Workers、Deno、Bun 各自有不同的 API（req/res 形态、stream 实现），同一份代码跑 4 个 runtime 适配成本爆炸。

**解决方案**：Remix 3 抛弃 framework-specific API，全部基于 Web 标准：`fetch` / `Request` / `Response` / `ReadableStream` / `crypto` / `URL`。这些 API 在所有现代 runtime 都是一等公民。

**关键参数**：
- `Request` / `Response` 而非 `req` / `res`
- `ReadableStream` 处理流式数据
- `URL` / `URLPattern` 路由匹配
- `crypto.subtle` 加密
- `Headers` 替代 `res.setHeader`

**最佳实践**：写代码时假设只在浏览器跑，再补 Node API；不写 Express/Koa 中间件。

### 模式 2：fetch-router 路由核心

**问题场景**：Express router 是字符串路径匹配，无类型；Next.js App Router 文件名即路由，耦合文件结构。

**解决方案**：`fetch-router` 把路由定义成纯函数：`router.get('/users/:id', handler)`。`handler` 接收 `Request` 返回 `Response`，类型化 `params` 通过 `route-pattern` 推导。

**关键参数**：
- `router.get/post/put/delete(path, handler)`
- `handler: (context) => Response | Promise<Response>`
- `context.params` 类型化（`route-pattern` 推导）
- `router.mount('/api', subRouter)` 嵌套
- middleware 用 onion 模型包裹

**最佳实践**：handler 只关心"输入 Request、输出 Response"；不读 Node 的 `req.body`，用 `await request.json()`。

### 模式 3：route-pattern 类型化 URL

**问题场景**：手写 `/users/:id/posts/:postId` 路由时，`params.id` / `params.postId` 类型是 any；TS 推断不到。

**解决方案**：`route-pattern` 把 URL pattern 编译成 typed matcher：`buildRoute('/users/:id')` 返回的 matcher 调用 `.match(url)` 时，`params.id` 是 `string`（不是 any）。

**关键参数**：
- 编译时类型推导（vs 运行时 reflection）
- 支持 `*` wildcard / `:param` named / `{a,b,c}` optional
- 性能：编译一次后匹配是 O(n) 字符串扫描
- 与 fetch-router 集成

**最佳实践**：URL pattern 集中管理（`routes.ts`），复用 matcher；不要散落各处。

### 模式 4：data-table 类型化 SQL

**问题场景**：手写 SQL 字符串拼参数（SQL injection 风险），ORM（Drizzle/Prisma）又锁定特定 DB，TS 推导弱。

**解决方案**：`data-table` 把 SQL DSL 化为 TS builder：`db.selectFrom('users').select(['id', 'name']).where('id', '=', 1)`。编译期推导返回 row 类型，运行时编译为 prepared statement。

**关键参数**：
- SQL DSL：`selectFrom / insertInto / update / delete`
- 编译期类型：row 字段类型从 schema 推导
- 支持 SQLite / PostgreSQL / MySQL
- 自定义 SQL 方言 adapter

**最佳实践**：所有 DB 访问走 data-table（编译期安全 + 跨 DB）；不要写 raw SQL 字符串。

### 模式 5：ui runtime 自研 reconciler

**问题场景**：React 太重，Remix 3 想摆脱 React 依赖；自研 UI runtime 但不想写 7000 行 Fiber 协调器。

**解决方案**：`ui` 包提供轻量自研 reconciler，模板字符串语法（`<div>Hello {name}</div>`），事件系统 + state 响应式。比 React 简单 10x，bundle 小 90%。

**关键参数**：
- 模板字符串：`<button on:click={handler}>...</button>`
- 状态：`signal` 响应式（SolidJS 风格）
- 渲染：SSR（renderToString / renderToReadableStream）+ 客户端 hydrate
- 事件冒泡遵循 DOM 规范

**最佳实践**：小型应用直接用 `ui` runtime；大型应用仍可走 React（Remix 仍兼容）。

---

## 第二段：扩展范式

### 模式 6：node-fetch-server 适配

**问题场景**：Node.js 早期没有 `fetch` API（v17+ 才有稳定），Express handler 是 `(req, res)`，如何把 `(Request) => Response` 的 fetch 风格 handler 跑在 Express 上？

**解决方案**：`node-fetch-server` 提供双向 adapter：把 Express middleware 适配为 fetch handler，或把 fetch handler 适配为 Express middleware。

**关键参数**：
- `createNodeAdapter(fetchHandler)`：返回 Express middleware
- `createFetchHandler(expressHandler)`：反向
- 内部把 `req` 包装成 `Request` / `res` 包装成 `Response`
- 处理 streaming body

**最佳实践**：新 handler 写 fetch 风格；老 Express 代码通过 adapter 渐进迁移。

### 模式 7：form-data-parser / multipart-parser

**问题场景**：浏览器 `FormData` 上传文件，服务端要解析 multipart/form-data；Node 没有内置解析器。

**解决方案**：`form-data-parser` + `multipart-parser` 提供流式解析：`request.formData()` 直接返回 `FormData` 对象（Web 标准），底层是 C 写的解析器（性能 vs Node 内置 formidable）。

**关键参数**：
- `await request.formData()` 标准 API
- 流式：边接收边解析，不占内存
- 大文件支持（>1GB）
- 与 fetch-router handler 集成

**最佳实践**：所有文件上传走 formData；不要自己写 multipart 解析（边界条件太多）。

### 模式 8：auth / session / csrf 套件

**问题场景**：登录态管理、CSRF 防护、cookie 签名、session 存储，每个项目都要重写一遍。

**解决方案**：`auth` + `session` + `csrf` 三个包提供：
- `session`：基于 cookie 的 session，签名防篡改
- `auth`：抽象 OAuth/Email/Password 登录流程
- `csrf`：双 cookie 模式 CSRF token

**关键参数**：
- `session.sign(secret)` 生成签名 cookie
- `auth.strategy('github', { clientId, clientSecret })` OAuth
- `csrf.token(request)` 生成 + 校验

**最佳实践**：直接用 session 套件（不要手写 cookie 签名）；CSRF 必加（防跨站攻击）。

### 模式 9：headers / cookie 工具

**问题场景**：写 `Set-Cookie` header 时，要拼字符串 + URL 编码 + 各种属性（HttpOnly、Secure、SameSite），手写易错。

**解决方案**：`headers` + `cookie` 包提供 typed builders：
- `cookie.set('session', 'abc', { httpOnly: true, secure: true, maxAge: 3600 })`
- `cookie.get(headers, 'session')` 解析
- 自动 URL 编码 + 属性序列化

**关键参数**：
- 7 个 cookie 属性完整支持
- 与 Web `Headers` API 兼容
- 解析浏览器发送的 Cookie header
- 类型化返回值

**最佳实践**：所有 cookie 操作走 `cookie` 包；不要拼字符串。

### 模式 10：cors / cop（cross-origin policy）

**问题场景**：浏览器跨域请求需 CORS headers；不同 origin 不同策略；如何用 fetch handler 表达？

**解决方案**：`cors` 包提供 middleware：`cors({ origin: ['https://app.com'], credentials: true })` 注入 CORS headers。`cop`（Cross-Origin Policy）处理更细粒度策略（COEP/COOP/CORP）。

**关键参数**：
- `origin`：允许的 origin（string / function / array / true）
- `methods`：允许的 HTTP 方法
- `credentials`：是否允许带 cookie
- 预检请求自动处理

**最佳实践**：dev 环境 `origin: true`；prod 限定白名单。

---

## 第三段：进阶范式

### 模式 11：40+ 包的 monorepo 设计

**问题场景**：单一 npm 包越做越大（200+ 文件），独立升级/单独引用困难；用户只想用 router，不想拖整个 framework。

**解决方案**：Remix 3 monorepo 拆 40+ 个独立 npm 包，每个做一件事：
- `fetch-router` / `route-pattern` / `node-fetch-server`
- `form-data-parser` / `multipart-parser`
- `data-table` / `auth` / `session` / `csrf` / `cors`
- `ui` / `html`
- `remix`：聚合包（re-export 所有子包）

**关键参数**：
- pnpm workspace + catalog 协议（统一 TS 版本）
- 每个包独立 `package.json` + `tsconfig.build.json`
- `tsconfig.build.json` 只 emit `lib/**` 排除 `*.test.ts`
- 自研 `scripts/codegen` 自动化生成各包

**最佳实践**：默认用 `remix` 聚合包；要极简 bundle 时按需 import 子包。

### 模式 12：oxlint + 自研 codegen

**问题场景**：ESLint 慢（10s+ 跑全 monorepo），pre-commit hook 慢到开发者绕过；多个包共享代码需要 codegen。

**解决方案**：
- **oxlint**：Rust 编写的 linter，速度比 ESLint 快 50-100x
- **自定义 codegen**：`scripts/codegen.ts` 读 schema 生成 typed builders
- **Prettier**：统一格式化
- **changesets**：版本管理（每个包独立 semver）

**关键参数**：
- oxlint 配置在根 `.oxlintrc.json`
- codegen 跑 `pnpm codegen` 自动生成
- changeset 写 `.changeset/xxx.md`
- CI 跑 oxlint + typecheck + tests

**最佳实践**：lint 任务必跑 <1s，否则开发者会绕；用 oxlint 替代 ESLint。

### 模式 13：跨运行时（Node/Bun/Deno/Workers）

**问题场景**：Node 适合长任务，Bun 适合性能敏感，Deno 适合安全沙箱，Cloudflare Workers 适合边缘计算。同份代码跨 runtime 是关键。

**解决方案**：
- 仅用 Web 标准 API（fetch/Request/Response/Streams/crypto/URL）
- Runtime-specific 代码走 `node:*` / `bun:*` / `deno:*` 子包（可选）
- 跑 `pnpm test:node` / `pnpm test:bun` / `pnpm test:deno` / `pnpm test:workers` 验证

**关键参数**：
- 100% Web 标准代码无需 runtime 检测
- 边缘场景（DNS、文件系统）用 runtime-specific polyfill
- 性能差异：Bun > Node（V8 JIT）> Deno（启动快）> Workers（冷启动慢）

**最佳实践**：默认写 Web 标准代码；要性能上 Bun，要沙箱用 Deno，要边缘上 Workers。

### 模式 14：SSR 与 Streaming

**问题场景**：传统 SSR 一次性返回完整 HTML，大页面 TTFB 长；React 18 streaming SSR 复杂。

**解决方案**：`ui` runtime 自带 streaming SSR：`renderToReadableStream(component)` 返回 `ReadableStream`，边渲染边发送，用户更早看到内容。

**关键参数**：
- `renderToReadableStream(component)` 返回 stream
- Suspense 边界触发流式 chunk
- `await response.text()` 收集完整 HTML
- 与 fetch-router 集成：`new Response(stream, { headers: 'text/html' })`

**最佳实践**：大页面必用 streaming SSR；首屏 TTFB 从 500ms 降到 50ms。

### 模式 15：测试矩阵（4 个 runtime × 多个包）

**问题场景**：单一 runtime 测试不能保证跨 runtime 兼容；矩阵测试 CI 时间爆炸。

**解决方案**：
- 每个包独立 `*.test.ts`（vitest）
- CI 矩阵：Node 20 / Bun / Deno / Workers（miniflare）
- 共享测试 fixture，避免重复
- 关键包（fetch-router、data-table）跨所有 runtime 测
- 边缘包（ui、auth）只在 Node + 1 个 runtime 测

**关键参数**：
- Vitest 配置 `test.matrix` 字段
- miniflare 模拟 Cloudflare Workers
- 关键路径覆盖率 >80%
- E2E：playground 跨包联调

**最佳实践**：跨 runtime 关键包 100% 测；边缘包减负。

---

## 第四段：实战范式

### 模式 16：从 Remix v2 迁移到 v3

**问题场景**：项目跑 Remix v2（React + Vite + Express），是否值得迁到 v3（Web Standards + 40 包）？

**解决方案**：
- 评估：是否需要跨 runtime？是否愿意脱离 React？
- 不迁：v2 长期支持，足够用
- 部分迁：用 v3 的 `fetch-router` / `data-table` 子包替代部分基础设施
- 完整迁：3 个月重写，前端用 `ui` runtime（学 SolidJS）

**关键参数**：
- 迁移成本：3-6 人月（中等项目）
- 收益：bundle -60%、跨 runtime、LLM 友好
- 风险：v3 仍 active dev，breaking change 频率高
- 备份：保留 v2 LTS 分支

**最佳实践**：观望到 v3 GA（2026 目标）再迁；新项目直接 v3 起步。

### 模式 17：项目结构

**问题场景**：Remix v3 给了 40+ 包，从零开始如何组织代码？

**解决方案**：
```
src/
  routes/        # fetch-router 路由定义
    api/         # API 路由
    pages/       # 页面路由
  data/          # data-table schema + queries
  lib/           # 业务逻辑
  components/    # ui runtime 组件
  server.ts      # 启动入口
```

**关键参数**：
- 路由用 fetch-router 集中定义
- schema 放 `data/schema.ts`
- 业务逻辑放 `lib/`，不依赖 ui/fetch
- 入口 `server.ts`：装配 middleware + 启动

**最佳实践**：业务逻辑与 UI 解耦（lib/ 不知道 ui 的存在）；data schema 是 SSOT。

### 模式 18：性能与可扩展性

**问题场景**：上 100w 用户后，Remix 3 框架本身的性能瓶颈在哪？哪些设计决策影响扩展性？

**解决方案**：
- **fetch-router**：纯函数路由，O(1) 匹配（编译过的 pattern）
- **data-table**：prepared statement 缓存 + connection pool
- **ui runtime**：自研 reconciler 极简，无 VDOM 开销
- **streaming SSR**：边渲染边发，TTFB <100ms

**关键参数**：
- 100w 用户：需配 connection pool（pgBouncer）
- 边缘计算：Workers 跑 fetch-router + data-table
- 缓存：data-table query cache + CDN
- 监控：runtime-specific metrics

**最佳实践**：先 profiling 再优化；不要在 10w 用户时过度设计。

### 模式 19：与现代框架对比

**问题场景**：Remix 3 vs Next.js 15 / Astro / Hono / SvelteKit，选谁？

**解决方案**：
- **Next.js**：成熟生态、React、Vercel 优化；适合需要"开箱即用"的全栈
- **Astro**：岛屿架构、极佳 SEO；适合内容站
- **Hono**：极致轻量、Cloudflare Workers 优先；适合边缘 API
- **Remix 3**：跨 runtime、Web 标准、不锁定 React；适合"想要控制"的全栈
- **SvelteKit**：编译期优化、bundle 小；适合前端优先的全栈

**关键参数**：
- Next.js：react-server-components 成熟
- Hono：handler 极简（<10 行 server）
- Remix 3：40+ 包灵活组合
- 选型标准：runtime 要求 + 框架锁定 + bundle 要求 + 团队熟悉度

**最佳实践**：不要为"新潮"放弃生态；选能让团队 3 个月内交付的。

### 模式 20：未来演进

**问题场景**：Remix 3 还有哪些未稳定特性？哪些方向值得关注？

**解决方案**：
- 2025 Q3：fetch-router v1 稳定
- 2025 Q4：data-table v1 稳定
- 2026 Q1：ui runtime GA + 模板
- 2026 Q2：remix-the-web 完整发布
- 长期：与 View Transitions / Web Components 集成

**关键参数**：
- 关注 `remix-the-web` 仓库（40+ 包）
- 加入 Discord 社区
- 关注 Remix Conf 年会
- 不要等 GA 再学（社区先行）

**最佳实践**：2026 上半年是 Remix 3 走向成熟的关键期；提前评估 → 试点项目 → 决定是否铺开。

---

## 附录：5 段必读代码

1. `packages/fetch-router/src/lib/router.ts` — 路由核心（method + pattern 匹配 + middleware 链）
2. `packages/route-pattern/src/lib/pattern.ts` — 类型化 URL 模式（编译期 params 推导）
3. `packages/data-table/src/lib/database.ts` — 类型化 SQL builder（compile to prepared statement）
4. `packages/ui/src/runtime/reconciler.ts` — 自研轻量 reconciler（<2000 行）
5. `packages/node-fetch-server/src/lib/adapter.ts` — Node ↔ Web Request 双向 adapter

## 一句话总结

Remix 3 = Web Standards API（fetch/Request/Response/Streams）+ 40+ 个可组合 TypeScript 包 + 跨 4 个 runtime（Node/Bun/Deno/Workers），抛弃 React/Vite 锁定，把"Web 全栈"还给开发者。
