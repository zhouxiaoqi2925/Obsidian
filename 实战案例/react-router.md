# React Router · 架构与工程实践精要

> React Router v7 是多策略 React 路由——从最小化的 `<BrowserRouter>` 库到完整的 Vite 框架 (Framework Mode) 再到 RSC 运行时，五种模式共用同一份 `lib/router/router.ts` 状态机。本笔记从 Amazon Builders' Library 视角剖析其设计模式与决策。

---

## 一、核心机制与路由哲学

### 模式 1：5 种模式共用单一状态机

**问题场景**：React Router v6 是纯库（`<BrowserRouter>`），Remix 是完整框架（loader/action/SSR），RSC 是新运行时。三者用户群体不同、API 不同，但底层"URL → 渲染"的状态机是一样的。如果分三份实现，会导致：(1) 维护成本翻倍；(2) bug 修复不同步；(3) 用户在库和框架间迁移困难。

**解决方案代码**：

```typescript
// packages/react-router/lib/router/router.ts:1400+ 核心状态机
export function createRouter(init: RouterInit): Router {
  return {
    state: {
      historyAction: "POP",
      location: createLocation(init.history.location),
      matches: null,
      loaderData: {},
      actionData: null,
      errors: null,
      // ... 12+ 字段
    },
    // 状态转换：导航开始 → loader 跑 → revalidate → 渲染
    dispatch({ type, ...args }) {
      switch (type) {
        case "NAVIGATE": handleNavigation(); break;
        case "LOADER": handleLoaderAction(); break;
        case "REVALIDATE": handleRevalidate(); break;
        case "ACTION": handleAction(); break;
        // ...
      }
    },
  };
}

// 5 种模式共用此状态机：
// 模式 1 (Declarative): <BrowserRouter><Routes>...</Routes></BrowserRouter>  ← 库用法
// 模式 2 (Data): createBrowserRouter([...])  + 自己 loaders       ← 数据路由
// 模式 3 (Framework): 路由作为文件 + 自动 loader/action            ← Vite 框架
// 模式 4 (RSC):    createRouter + 配合 React Server Components
// 模式 5 (Server): server-runtime + handler                    ← SSR 渲染
```

**关键参数表**：

| 模式 | 包 | 入口 | 适用 |
|---|---|---|---|
| Declarative | `react-router` | `<BrowserRouter>` | 简单 SPA，< 5 路由 |
| Data | `react-router` | `createBrowserRouter` | 复杂 SPA，需 loader/action |
| Framework | `react-router` + `@react-router/dev` | Vite 插件 + 文件路由 | 完整 SSR/RSC 应用 |
| RSC | `react-router/lib/rsc` | `unstable_Router` | React Server Components |
| Server | `react-router/lib/server-runtime` | `createRequestHandler` | 部署到 Node/Workers/Express |

**最佳实践列表**：
- 小项目用 Declarative 模式——零配置，3 行启动
- 中型项目用 Data 模式——loader/action 集中数据流
- 大型 SSR/RSC 项目用 Framework 模式——Vite + 文件路由 + 类型生成
- 5 种模式共享 7,659 行状态机——升级时不用担心不兼容
- 库迁移到框架：`createBrowserRouter` 替换为文件路由——业务代码零改动

### 模式 2：数据驱动的路由（loader/action 模型）

**问题场景**：传统 SPA 路由（v5 之前）只关心"渲染什么组件"，数据获取在 useEffect 里写，导致"瀑布流"（父组件先 mount → 子组件再 mount → 子组件再发起请求）。Remix 引入"loader"——路由级数据依赖，并行获取。

**解决方案代码**：

```typescript
// Data 模式：路由配置含 loader/action
const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    loader: async () => {
      return { user: await getCurrentUser() };
    },
    children: [
      {
        path: "projects",
        Component: Projects,
        loader: async ({ params }) => {
          return { projects: await fetchProjects(params) };
        },
        action: async ({ request }) => {
          // 表单提交
          const formData = await request.formData();
          return createProject(formData);
        },
      },
    ],
  },
]);

// 组件
function Projects() {
  const { projects } = useLoaderData() as { projects: Project[] };
  const submit = useSubmit();
  return (
    <Form method="post" onSubmit={(e) => submit(e.currentTarget)}>
      <input name="title" />
      <button type="submit">Create</button>
    </Form>
  );
}
```

**关键参数表**：

| API | 时机 | 用途 |
|---|---|---|
| `loader` | 进入路由前 | 预取数据 |
| `action` | Form 提交 | 变更数据 |
| `useLoaderData()` | 组件读取 loader 结果 | 渲染 |
| `useActionData()` | 组件读取 action 结果 | 错误/反馈 |
| `useNavigation()` | 导航进行中 | pending UI |
| `useFetcher()` | 不导航的数据请求 | 后台提交 |
| `Form` | 渐进增强表单 | 禁用 JS 也能用 |

**最佳实践列表**：
- 路由级 loader 比组件 useEffect 提前——首屏零瀑布
- Form 替代 fetch + onSubmit——禁用 JS 也能 work
- `useFetcher` 用于"非导航数据请求"——投票、点赞、搜索
- `action` 失败抛 Response / 返回 error——自动 errorElement
- 类型化 loader：用 `useLoaderData<typeof loader>()` 拿强类型

### 模式 3：Single Fetch 重新定义数据流

**问题场景**：传统 loader 模式每次导航都重跑所有 loader，并行 fetch 但每次都新建请求/响应。RR v7 引入 Single Fetch——一次导航合并所有 loader 数据为单一 RSC 兼容流。

**解决方案代码**：

```typescript
// 旧（v6）：每次导航触发多个独立 fetch
// /dashboard   →  fetch /data/dashboard?_routes=root
// /dashboard/profile → fetch /data/profile?_routes=profile

// 新（v7 Single Fetch）：
// 一次导航合并所有 loader 数据为单一 turbo-stream 响应
import { unstable_data } from "react-router";

export async function loader({ request }: Route.LoaderArgs) {
  // 自动 await 后并行组合为单一响应
  const user = await getUser();
  const projects = await getProjects();
  return { user, projects };
  // ↑ 多个 loader 合并为 single .data 响应
}

// 客户端 useLoaderData() 自动从单次响应中取数据
function Dashboard() {
  const { user, projects } = useLoaderData() as { user: User; projects: Project[] };
  // 单次 navigation 一次性拿到所有数据
}
```

**关键参数表**：

| 维度 | 旧 (v6) | 新 (v7 Single Fetch) |
|---|---|---|
| 导航请求数 | N（每路由一个） | 1（合并） |
| 数据格式 | JSON | turbo-stream |
| 序列化 | 简单类型 | Date / Map / Set |
| 缓存 | per-loader | 全局 keyed by URL |
| 性能 | 中 | 5-10x 提升 |

**最佳实践列表**：
- Single Fetch 默认开启——无需配置
- 自定义 fetcher 配合：`useFetcher({ key: "search" })` 跨组件共享
- 旧项目升级 v6→v7 时数据格式变化——用 `unstable_data` 兼容
- 性能：一次请求拿到全部 loader 数据——减少 HTTP 往返

### 模式 4：渐进增强（Progressive Enhancement）

**问题场景**：传统 SPA 必须 JS 加载完才能用——禁用 JS 就白屏。Remix 哲学：HTML + Form 是基本盘，JS 是增强。即使禁用 JS，路由导航、Form 提交也能工作。

**解决方案代码**：

```jsx
// Framework 模式：路由文件定义
// app/routes/projects.tsx
import { Form, useLoaderData } from "react-router";
import type { Route } from "./+types/projects";

export async function loader({ request }: Route.LoaderArgs) {
  return { projects: await fetchProjects() };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  await createProject(formData);
  return redirect("/projects");
}

export default function Projects({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <>
      {/* 禁用 JS 时：Form 走原生 HTML POST */}
      {/* 启用 JS 时：拦截 + 单页导航 */}
      <Form method="post">
        <input name="title" />
        <button type="submit">Create</button>
      </Form>
      <ul>{loaderData.projects.map(p => <li key={p.id}>{p.title}</li>)}</ul>
    </>
  );
}
```

**关键参数表**：

| 场景 | 禁用 JS | 启用 JS |
|---|---|---|
| `<a href="/x">` | 整页导航 | 单页导航 |
| `<Form>` | HTML POST 提交 | fetch + 单页更新 |
| `useFetcher` | 不工作 | 后台请求 |
| `useNavigation` | 不工作 | pending 状态 |

**最佳实践列表**：
- 所有跳转用 `<Link>` 而非 `<a>`——自动 SPA
- 表单用 `<Form method="post">`——禁用 JS 也能提交
- 表单校验可在 action 内做——禁用 JS 仍生效
- 渐进增强 = "JS 是 bonus，不是必须"——SEO 友好
- 反模式：依赖 `useEffect` 触发数据请求——破坏渐进增强

### 模式 5：状态机驱动的导航 (Router State Machine)

**问题场景**：路由系统需要处理 20+ 状态（idle / loading / submitting / revalidating / errored 等），传统命令式 if-else 分支会指数级膨胀。RR v7 用显式状态机——12 状态 + 15+ 转换 + 单一 `dispatch()`。

**解决方案代码**：

```typescript
// packages/react-router/lib/router/router.ts 核心 dispatch
function dispatch(action: RouterAction): void {
  const newState = reduceState(state, action);
  // 状态转换
  switch (action.type) {
    case "NAVIGATE":
      // 1. 设置 loading
      state.navigation.state = "loading";
      // 2. 跑所有 match 的 loader（并行）
      Promise.all(matches.map(m => m.loader()))
        .then(data => {
          state.loaderData = data;
          state.navigation.state = "idle";
        });
      break;
    case "SUBMIT":
      state.navigation.state = "submitting";
      // 跑 action → 重新验证 loaders
      action()
        .then(() => revalidate())
        .then(() => state.navigation.state = "idle");
      break;
    case "REVALIDATE":
      // 重新跑 loaders（不重置 state）
      Promise.all(matches.map(m => m.loader()))
        .then(data => Object.assign(state.loaderData, data));
      break;
  }
}

// useNavigation() 读当前 state
function useNavigation() {
  const state = useRouterState();
  return state.navigation;  // { state: "loading" | "submitting" | "idle", location: ... }
}
```

**关键参数表**：

| state.navigation.state | 含义 | 触发 |
|---|---|---|
| `idle` | 空闲 | 初始 / 完成 |
| `loading` | 加载数据中 | navigate / revalidate |
| `submitting` | 提交中 | action 执行中 |

| state 类型 | 字段 |
|---|---|
| `location` | 当前 URL |
| `matches` | 匹配路由 + params |
| `loaderData` | 各路由 loader 结果 |
| `actionData` | 上一 action 结果 |
| `errors` | 上次 error |
| `navigation` | 当前导航状态 |

**最佳实践列表**：
- 理解状态机就理解了 RR——所有 useXxx hook 都在订阅 state
- 用 `useNavigation()` 判断是否 loading——比 useState 更精确
- `useRevalidator()` 手动触发 revalidate——清除缓存
- 状态机是集中式——避免散落 useState + useEffect 组合
- 库用户读 `router.ts` 7,659 行就够——其他包都是适配层

---

## 二、状态机与匹配算法

### 模式 6：路由匹配（ranked 排序 + 参数化）

**问题场景**：路由 `/users/:id/posts/:postId` 和 `/users/:id/edit` 需要区分——前者匹配 `edit` 不是 postId。RR 用"ranked routes"——按"特异性"排序，最具体的路由优先匹配。

**解决方案代码**：

```typescript
// packages/react-router/lib/router/utils.ts:matchRoutes
interface Route {
  path?: string;
  index?: boolean;
  children?: Route[];
  caseSensitive?: boolean;
}

function matchRoutes(routes: Route[], location: string): { route: Route; params: Params }[] {
  const matcher = compileRoutes(routes);  // 编译为正则
  return matcher(location);  // 返回所有匹配路由（按特异性排序）
}

// 例：路由配置
const routes = [
  { path: "/users/:id", Component: UserLayout,
    children: [
      { path: "edit", Component: UserEdit },         // rank: 3
      { path: "posts/:postId", Component: PostDetail }, // rank: 2
      { index: true, Component: UserHome },          // rank: 1
    ],
  },
];

// 访问 /users/42/edit
// matches:
// [
//   { route: UserLayout, params: { id: "42" } },
//   { route: UserEdit, params: { id: "42" } },
// ]
// 不匹配 UserHome（index 路径为 /users/:id 不是 /users/:id/edit）
```

**关键参数表**：

| 路径模式 | 含义 | 例 |
|---|---|---|
| `:param` | 单段参数 | `/users/:id` 匹配 `/users/42` |
| `*` | 通配 | `/files/*` 匹配 `/files/a/b/c` |
| `*splat` | 命名通配 | `/files/*path` 拿 `params.path = "a/b/c"` |
| `(group)` | 不参与 URL | `/projects/(marketing)/about` = `/projects/about` |
| `?` | 可选段 | `/users{/:id}/profile` |

**最佳实践列表**：
- 静态段优于参数段——rank 高，匹配优先
- `*` 通配放最后——catch-all 兜底
- `useParams<typeof route.params>()` 强类型参数
- `index: true` 表示"父级路径下的默认子"——`/users/:id` 默认渲染
- 用 `displayName` 给路由命名——调试时清晰

### 模式 7：History 抽象（push / replace / pop）

**问题场景**：路由需要操作浏览器 history（push / replace / back），但 SPA 又要拦截原生前进/后退。RR v7 抽象 `History` 接口——5 种 history 实现（BrowserRouter / HashRouter / MemoryRouter / ServerRouter / RemixServer）。

**解决方案代码**：

```typescript
// packages/react-router/lib/router/history.ts:816
interface History {
  location: Location;
  action: Action;  // "POP" | "PUSH" | "REPLACE"
  listen({ action, location }: Listener): () => void;
  navigate(to: string, { replace, state }?: { replace?: boolean; state?: any }): void;
  go(delta: number): void;
  createHref(to: string): string;
  destroy?(): void;  // SSR 清理
}

// BrowserRouter 用 history API
function createBrowserHistory(): History {
  let listeners: Listener[] = [];
  return {
    location: { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash, state: window.history.state, key: "default" },
    action: "POP",
    listen(listener) {
      listeners.push(listener);
      return () => listeners = listeners.filter(l => l !== listener);
    },
    navigate(to, { replace = false, state = null } = {}) {
      // 调用 history.pushState / replaceState
      if (replace) window.history.replaceState(state, "", to);
      else window.history.pushState(state, "", to);
      // 通知 listeners
      listeners.forEach(l => l({ action: replace ? "REPLACE" : "PUSH", location: this.location }));
    },
    // ...
  };
}
```

**关键参数表**：

| History 类型 | URL 形式 | 适用 |
|---|---|---|
| BrowserRouter | `/users/42` | 普通 Web SPA |
| HashRouter | `/#/users/42` | 无 server 控制（静态托管） |
| MemoryRouter | 内存 | 测试、React Native |
| ServerRouter | 服务端 | SSR 渲染 |
| RemixServer | 服务端 | Remix/Framework 模式 SSR |

**最佳实践列表**：
- SPA 用 BrowserRouter——URL 干净，SEO 友好
- 静态站点（GitHub Pages）用 HashRouter——不需要 server 路由
- 测试用 MemoryRouter——可控 location
- 监听 `popstate` 处理浏览器前进/后退——RR 自动处理
- SSR 用 ServerRouter——不依赖 `window`

### 模式 8：嵌套路由（Outlet 渲染）

**问题场景**：父路由（Layout）需要包住子路由内容，React 树中如何"挖洞"？RR 用 `<Outlet />`——子路由占位组件。

**解决方案代码**：

```jsx
// 路由配置
const routes = [
  {
    path: "/",
    Component: RootLayout,  // 父：含 <Outlet />
    children: [
      { index: true, Component: Home },
      { path: "about", Component: About },
    ],
  },
];

function RootLayout() {
  return (
    <div>
      <nav>...</nav>
      {/* 子路由在这里渲染 */}
      <Outlet />  // ← Home 或 About 在这里
    </div>
  );
}

// 数据流：loader 在所有匹配路由上并行跑
// /        →  RootLayout loader + Home loader (并行)
// /about   →  RootLayout loader + About loader (并行)
```

**关键参数表**：

| 嵌套模式 | 用途 |
|---|---|
| `<Outlet />` 默认 | 渲染子路由 |
| `<Outlet context={{ ... }} />` | 传上下文给子 |
| `useOutletContext()` | 子路由读上下文 |
| `useOutlet()` | 子路由拿父 outlet（不常用） |

**最佳实践列表**：
- 嵌套路由用 `useMatches()` 拿所有匹配——`flatten` 数据流
- `<Outlet />` 替代手写 `{children}`——RR 自动处理
- 父 loader 早于子 loader 跑——共享数据父级获取
- 错误边界用 `errorElement`——子路由抛错不毁掉父
- 文件路由 `route.tsx` 嵌套——按目录结构

### 模式 9：File-based 路由（fs-routes）

**问题场景**：手写路由表（5+ 层嵌套时维护痛苦），社区期待"约定优于配置"——文件路径即 URL 路径。Next.js 13+ App Router / Remix 都用此模式。

**解决方案代码**：

```
app/
├── root.tsx              // /
├── routes/
│   ├── home.tsx          // /home
│   ├── about.tsx         // /about
│   ├── users.$id.tsx     // /users/:id
│   ├── users.$id.edit.tsx// /users/:id/edit
│   ├── users.$id._index.tsx // /users/:id (index)
│   ├── api.projects.tsx  // /api/projects
│   └── $.tsx             // * (catch-all)
```

```typescript
// 自动生成的 routes.ts
import { type RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

export default flatRoutes() satisfies RouteConfig;
```

**关键参数表**：

| 文件命名 | URL | 含义 |
|---|---|---|
| `routes/home.tsx` | `/home` | 静态段 |
| `routes/users.$id.tsx` | `/users/:id` | `$id` → 参数 |
| `routes/users.$id.edit.tsx` | `/users/:id/edit` | 嵌套路径 |
| `routes/_index.tsx` | `/` | 根 index |
| `routes/$.tsx` | `*` | catch-all |
| `routes/users.tsx` + `users._index.tsx` | `/users` 和 `/users` index | layout + index |
| `routes/(group)/about.tsx` | `/about` | `(group)` 不参与 URL |

**最佳实践列表**：
- 用 `flatRoutes`（默认）——扁平文件，路径即 URL
- 复杂嵌套用 `route()` 显式配置——混合约定
- `routes.ts` 集中导出——避免散落 `import`
- 文件路由 + Framework 模式——零路由配置
- `$param` 命名参数，`_index` 表 index，`_layout` 表 layout

### 模式 10：懒加载（lazy route discovery）

**问题场景**：大型应用 100+ 路由，首屏不需要全部代码——需要"按路由分 chunk"。RR v7 用 `route.lazy` 字段——首次匹配时再加载该路由模块。

**解决方案代码**：

```typescript
// 路由懒加载
const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      {
        path: "dashboard",
        // 首次匹配时再加载
        lazy: async () => {
          const { Component, loader, action } = await import("./routes/dashboard");
          return { Component, loader, action };
        },
      },
    ],
  },
]);

// Vite 自动分 chunk：
// chunk-dashboard.js（按需加载）
// main.js（首屏）
```

**关键参数表**：

| 加载策略 | 触发时机 | chunk 大小 |
|---|---|---|
| 路由 lazy | 首次匹配 | 小（按路由分） |
| 组件 lazy (`React.lazy`) | 首次渲染 | 中 |
| 预加载 (`<link rel="prefetch">`) | 鼠标 hover | 提前 |

**最佳实践列表**：
- 路由级 lazy 优于组件级——chunk 边界清晰
- 配合 `useRouteLoaderData('routeId')` 跨路由访问数据
- prefetch 提速：在导航 `<Link>` 加 `prefetch="intent"`
- SSR 配合 lazy 需 `HydrationScript` 预注入
- 反模式：所有路由都 eager import——首屏 chunk 巨大

---

## 三、框架模式与 SSR 渲染

### 模式 11：Vite 插件（Framework Mode 核心）

**问题场景**：传统 RR 是库——开发者手写 webpack/rollup 配置集成 SSR。v7 引入官方 Vite 插件——`react-router/dev` 把路由、SSR、TypeScript 类型生成、build 全部集成。

**解决方案代码**：

```typescript
// vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
});

// 开发模式：Vite dev server 跑 SSR
// 生产模式：Vite build 产出 client + server bundle
```

```bash
# CLI
npx react-router dev      # 开发模式（HMR + SSR）
npx react-router build    # 生产构建
npx react-router typegen  # 生成路由类型
npx react-router preview  # 预览 build
```

**关键参数表**：

| 插件职责 | 做什么 |
|---|---|
| 路由发现 | 扫描 `app/routes/`，生成路由表 |
| 类型生成 | 为每条路由生成 `+types/route-name.d.ts` |
| 资源管道 | CSS / image / font |
| HMR | 修改路由文件热重载 |
| Build | 拆 client + server bundle |
| 适配器 | 与 Node/Cloudflare/Express 集成 |

**最佳实践列表**：
- Vite 插件是 Framework 模式入口——必装
- `typegen` 在 CI 阶段跑——确保类型同步
- 配合 `tsconfigPaths` 插件——`~/` 路径别名
- 升级：Vite 升级前查 react-router 兼容矩阵
- 反模式：手动管理 `routes.ts` 写死——失去 file-based 自动发现

### 模式 12：TypeGen 类型生成

**问题场景**：RR 的 loader/action/Component props 是动态的——`useLoaderData()` 返回 any，业务代码丢失类型。TypeScript 5+ 的"生成类型"模式（remix 的 `+types/`）让 RR 在 build 时为每条路由生成 `Route.LoaderArgs` / `Route.ComponentProps`。

**解决方案代码**：

```typescript
// app/routes/users.$id.tsx
import type { Route } from "./+types/users.$id";

export async function loader({ params }: Route.LoaderArgs) {
  return { user: await fetchUser(params.id) };
  // params.id 强类型 string
}

export default function UserDetail({ loaderData }: Route.ComponentProps) {
  return <h1>{loaderData.user.name}</h1>;
  // loaderData.user 强类型
}

// 自动生成的 +types/users.$id.d.ts
declare module "./+types/users.$id" {
  export namespace Route {
    type LoaderArgs = { params: { id: string }; request: Request };
    type ComponentProps = { loaderData: { user: User } };
  }
}
```

**关键参数表**：

| 类型 | 来源 | 用途 |
|---|---|---|
| `Route.LoaderArgs` | 路由文件 loader | loader 函数参数 |
| `Route.ActionArgs` | 路由文件 action | action 函数参数 |
| `Route.ComponentProps` | 路由文件 default export | 组件 props |
| `Route.MetaArgs` | meta 函数 | meta 函数参数 |
| `Route.MetaFunction` | meta 类型 | 头信息生成 |

**最佳实践列表**：
- 启用 `typegen` 后——`useLoaderData` 不再需要泛型
- CI 加 `react-router typegen && tsc --noEmit`——确保类型同步
- 自定义类型：导出 `Route.LoaderArgs['params']` 复用
- 配合 Zod / Valibot：loader return 强校验
- 旧项目迁移：先 typegen，再逐步加类型

### 模式 13：5 种 Server 适配器

**问题场景**：应用部署目标多样（Node 20 / Cloudflare Workers / Vercel / Deno / Bun / Express），每种 runtime API 略不同。RR 抽象 5 种 adapter——同一份路由代码跨 runtime 部署。

**解决方案代码**：

```typescript
// Node 自带 server
import { createRequestHandler } from "react-router";
import express from "express";

const app = express();
app.all("*", createRequestHandler({
  build: () => import("./build/server/index.js"),
  mode: "production",
}));
app.listen(3000);

// Cloudflare Workers
import { createRequestHandler } from "react-router";
export default {
  fetch: createRequestHandler({
    build: () => import("./build/server/index.js"),
    mode: "production",
  }),
};

// Express 风格
app.use("/build", express.static("build/client"));
app.use(express.static("build/client/assets"));
app.all("*", createRequestHandler({ build }));
```

**关键参数表**：

| Adapter | 入口 | 部署 |
|---|---|---|
| `@react-router/serve` | CLI `react-router-serve` | 极简 Node |
| `@react-router/node` | Node HTTP | Node 20+ |
| `@react-router/express` | Express middleware | Express |
| `@react-router/cloudflare` | Workers fetch | Cloudflare |
| `@react-router/architect` | SAM 模板 | AWS Lambda |

**最佳实践列表**：
- 开发用 `react-router dev`——HMR
- 生产选适配器：Node 用 `node` adapter，Vercel 用 `vercel` adapter
- 静态资产在 adapter 之前 `express.static` 暴露
- 适配器只换 build target——业务代码不变
- Vercel/Netlify 适配器自动转边缘函数

### 模式 14：流式 SSR（Streaming Response）

**问题场景**：传统 SSR 等所有 loader 跑完才返回 HTML——TTFB 高（数据库慢时 1s+）。RR v7 默认流式 SSR——loader 完成后立即 flush HTML 片段，Suspense 边界降级为占位符。

**解决方案代码**：

```typescript
// renderToPipeableStream 流式返回
import { renderToReadableStream } from "react-dom/server";
import { createRequestHandler } from "react-router";

async function handler(request: Request) {
  const stream = await renderToReadableStream(
    <ServerRouter url={request.url} />,
    {
      bootstrapScripts: ["/assets/entry.client.js"],
      onShellReady() {
        // shell 就绪，shell 是静态部分（不依赖 loader 数据）
        // 立即 flush 出去
      },
      onAllReady() {
        // 全部 loader 完成，整个 HTML ready
      },
    }
  );
  return new Response(stream, { headers: { "Content-Type": "text/html" } });
}
```

```jsx
// Suspense 边界
function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<Skeleton />}>
        <Await resolve={dataPromise}>
          {(data) => <Chart data={data} />}
        </Await>
      </Suspense>
    </div>
  );
}
```

**关键参数表**：

| 阶段 | 时机 | 客户端行为 |
|---|---|---|
| Shell | render 开始即可（无 await） | 立即渲染 |
| Stream chunks | 每个 Suspense resolve | 渐进 hydrate |
| All ready | 所有 loader 完成 | 全部 hydrate |

**最佳实践列表**：
- 用 `<Await resolve={promise}>` 配合 Suspense——显示 fallback
- 关键数据（首屏标题）放 loader 早——shell 即可显示
- 慢数据（图表面板）放 lazy loader——独立 Suspense
- 反模式：所有数据一个 Suspense——首屏等所有 loader
- Cloudflare Workers 友好——流式响应支持 streaming

### 模式 15：RSC 支持（React Server Components）

**问题场景**：传统 SSR 把组件代码发到 client——即使组件无交互，也占 bundle。RSC 区分"server 组件"（不发到 client）和"client 组件"——bundle 体积减半。RR v7 提供 RSC runtime。

**解决方案代码**：

```jsx
// app/root.tsx
import { unstable_Router } from "react-router";
import { renderToReadableStream } from "react-server-dom-render/server";

// RSC runtime 渲染
const stream = renderToReadableStream(
  <unstable_Router url={request.url} routes={routes} />,
  { bootstrapScripts: ["/assets/entry.client.js"] }
);

// 服务端组件（不发送到 client）
async function UserHeader() {
  const user = await getUser();
  return <h1>Hello, {user.name}</h1>;
}

// 客户端组件
("use client");
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**关键参数表**：

| 概念 | Server 组件 | Client 组件 |
|---|---|---|
| 渲染时机 | 仅 server | server + client |
| bundle | 不发到 client | 发到 client |
| useState | ❌ | ✅ |
| 数据库访问 | ✅ | ❌ |
| 文件标记 | 默认 | `"use client"` |

**最佳实践列表**：
- 默认组件就是 server 组件——无 `"use client"` 标记
- 仅交互组件用 `"use client"`——包越小越好
- 数据获取放 server 组件——告别 useEffect fetch
- server/client 边界要清晰——传 props 需可序列化
- 配合 streaming + Suspense——首屏 RSC 渲染

---

## 四、工程实践与生态

### 模式 16：Middlewares（请求/响应拦截）

**问题场景**：应用需要"鉴权、日志、限流、CORS"等横切关注点，传统做法是在每个 loader 里复制粘贴。RR v7 引入中间件（类似 Express）——请求到达 loader 之前/之后执行。

**解决方案代码**：

```typescript
// app/middleware/auth.ts
import { redirect } from "react-router";

export async function authMiddleware({ request, params }, next) {
  const user = await getCurrentUser(request);
  if (!user) {
    // 未登录 → 重定向到登录
    throw redirect("/login");
  }
  // 注入 user 到 context
  return next({
    context: { user },
  });
}

// 在路由使用
export const unstable_middleware = [authMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  // context.user 由 authMiddleware 注入
  return { profile: await getProfile(context.user.id) };
}
```

**关键参数表**：

| Middleware 位置 | 用途 |
|---|---|
| `unstable_middleware` | 路由级中间件 |
| `unstable_middleware` (root) | 全局中间件 |
| 顺序 | 文件声明顺序 = 执行顺序 |

**最佳实践列表**：
- 中间件放横切关注点——鉴权、日志、限流
- `context` 传值——loader/action 共享
- throw `redirect()` / `json()`——中断请求
- `next()` 调用链继续——返回 Response 即终止
- 中间件与 loader 共享 `context` 类型——`Route.LoaderArgs['context']`

### 模式 17：表单与并发数据（useFetcher / useNavigation）

**问题场景**：UI 需要"提交表单不导航"、"提交中显示 spinner"、"失败显示错误"——传统 onSubmit + fetch 写得很啰嗦。RR 提供 `useFetcher`（后台提交）+ `useNavigation`（导航状态）。

**解决方案代码**：

```jsx
// useFetcher：非导航数据请求
function LikeButton({ postId }: { postId: string }) {
  const fetcher = useFetcher();
  // 提交中：fetcher.state
  // 数据：fetcher.data
  // 错误：fetcher.data?.error
  return (
    <fetcher.Form method="post" action={`/posts/${postId}/like`}>
      <button type="submit" disabled={fetcher.state !== "idle"}>
        {fetcher.state === "submitting" ? "..." : "Like"}
      </button>
    </fetcher.Form>
  );
}

// useNavigation：导航进行中
function GlobalPendingIndicator() {
  const navigation = useNavigation();
  const isPending = navigation.state === "loading";
  return isPending ? <div className="spinner" /> : null;
}

// 跨组件共享 fetcher
function VoteWidget() {
  const fetcher = useFetcher({ key: "vote-42" });
  // 其他组件用 key="vote-42" 也拿到同一 fetcher
  // 共享 state + data
}
```

**关键参数表**：

| 状态 | 含义 | 用途 |
|---|---|---|
| `idle` | 空闲 | 默认 |
| `loading` | 加载中 | 显示 spinner |
| `submitting` | 提交中 | 禁用按钮 |
| `fetcher.data` | 上次结果 | 显示反馈 |
| `fetcher.formData` | 当前提交中数据 | optimistic UI |

**最佳实践列表**：
- 不导航的请求用 `useFetcher`——避免污染 history
- 跨组件共享 fetcher 用 `key`——同步状态
- Optimistic UI：`fetcher.formData` 渲染"已选中"状态
- `useNavigation()` 读全局——顶栏 spinner
- 反模式：fetch + useState 拼——RR 已经管了

### 模式 18：数据重新验证（Revalidation）

**问题场景**：用户从 `/posts` 提交新建后跳转到 `/posts`——列表可能没刷新（用缓存）。RR 自动 revalidate——任何 mutation 后重跑当前路由的 loader。

**解决方案代码**：

```typescript
// Framework 模式默认行为：
// 1. 用户在 /posts 提交 action
// 2. action 返回 redirect 或 null
// 3. RR 自动 revalidate：重跑 /posts 的 loader
// 4. UI 拿到最新数据

// 自定义 revalidate
function useRefresh() {
  const revalidator = useRevalidator();
  return () => revalidator.revalidate();  // 手动触发
}

// 配置 revalidate 策略
export async function shouldRevalidate({ currentUrl, nextUrl }) {
  // 默认：URL 变就 revalidate
  // 自定义：只在 searchParams 变时
  return currentUrl.pathname === nextUrl.pathname;
}
```

**关键参数表**：

| 触发 | 时机 | 行为 |
|---|---|---|
| `action` 后 | mutation | 自动 revalidate 当前路由 |
| `redirect` 后 | 导航 | 自动 revalidate 目标路由 |
| `useRevalidator` | 手动 | 强制 revalidate |
| `shouldRevalidate` | 路由级 | 自定义条件 |

**最佳实践列表**：
- 默认依赖自动 revalidate——业务无需手写
- 大数据集配 `shouldRevalidate` 避免不必要重跑
- `useRevalidator()` 刷新按钮——手动触发
- 性能：`Single Fetch` 让 revalidate 一次请求拿全部
- 反模式：mutation 后手动 `fetch().then(setData)`——重复造轮子

### 模式 19：错误边界（ErrorBoundary / errorElement）

**问题场景**：loader/action 抛错时，整个应用崩溃。需要"路由级错误边界"——子路由错不毁掉父级。

**解决方案代码**：

```typescript
// app/root.tsx
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <html>
      <body>
        <h1>Something went wrong</h1>
        <pre>{error.message}</pre>
      </body>
    </html>
  );
}

// app/routes/users.$id.tsx 路由级错误边界
export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <h1>User not found ({error.status})</h1>;
  }
  return <h1>Unexpected error</h1>;
}

// 抛错
export async function loader({ params }) {
  const user = await fetchUser(params.id);
  if (!user) throw new Response("Not Found", { status: 404 });
  // ↑ 抛 Response → errorElement 收到
  return { user };
}
```

**关键参数表**：

| 错误类型 | 触发 | ErrorBoundary 拿到 |
|---|---|---|
| `throw new Response(...)` | loader/action | `RouteErrorResponse` |
| `throw new Error(...)` | 任意 | `Error` |
| Render 错误 | 组件 render | `Error` |
| 网络错 | fetch | `TypeError` |

**最佳实践列表**：
- 每个关键路由配 `ErrorBoundary`——错误不传染
- 抛 `Response` 而非 `Error`——errorElement 能识别 404/500
- 顶层 `ErrorBoundary` 在 `root.tsx`——兜底
- Sentry / Bugsnag 集成：用 `useEffect` 上报
- 错误 UI 与正常 UI 风格保持一致——别破坏布局

### 模式 20：部署与 CI/CD

**问题场景**：RR v7 框架模式产物是 client + server 双 bundle，部署目标多样（Node / Cloudflare / Vercel / Netlify / Fly.io），需要 CI/CD 模板化。

**解决方案代码**：

```yaml
# GitHub Actions 部署到 Cloudflare
name: Deploy
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx react-router typegen
      - run: npx react-router build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

```bash
# 本地开发
npx react-router dev

# 生产构建
npx react-router build
# 产物：
# build/client/   # 静态资源（HTML / JS / CSS）
# build/server/   # SSR runtime

# 启动（Node adapter）
node ./build/server/index.js

# 启动（Cloudflare）
wrangler deploy
```

**关键参数表**：

| 部署目标 | Adapter | 产物 |
|---|---|---|
| Node 20+ | `@react-router/node` | Express app |
| Cloudflare Workers | `@react-router/cloudflare` | Workers script |
| Vercel | `@vercel/react-router` | Serverless |
| Netlify | `@netlify/react-router` | Functions |
| Deno | `@deno/react-router` | Deno deploy |

**最佳实践列表**：
- CI 跑 `typegen && tsc`——确保类型同步
- 静态资产用 CDN（Vercel / Netlify）自动加速
- 缓存策略：`loader` 加 `Cache-Control` 头
- 数据库连接：在 `request handler` 创建，避免冷启动
- 反模式：直接把 node_modules 进 git——用 `npm ci`

---

## 附：仓库元信息

- **路径**：`G:\实战案例\GitHub顶尖项目\react-router\`
- **大小**：约 195MB（含 .git，不计 node_modules）
- **总文件**：1,511 目录 + 505 .ts 源文件
- **核心包**：`react-router`（库 + 状态机）+ `@react-router/dev`（Vite 插件）+ 5 个 server adapter
- **状态机入口**：`packages/react-router/lib/router/router.ts:1400+` 的 `createRouter()`（7,659 行）
- **锁定 commit**：HEAD `6c944f2`（v7.16.0，2026 Q1）
- **学习入口**：先读 `lib/router/router.ts`（状态机）→ `lib/router/utils.ts`（路由匹配）→ `lib/router/history.ts`（history 抽象）→ `lib/dom/ssr/server.tsx`（SSR）→ `packages/react-router-dev/vite/plugin.ts`（Vite 插件）

## 一句话总结

React Router v7 用"5 种模式共用单一 7,659 行状态机"重新定义多策略路由——从最小化库到完整 Vite 框架，再到 RSC 运行时，全部基于同一份 router 状态机。核心洞察：用 loader/action 模型把数据流从 useEffect 提升到路由层，配合 Single Fetch 一次请求合并所有 loader 数据；用状态机统一 12+ 路由状态，避免命令式 if-else 爆炸；用 Vite 插件 + File-based 路由让"约定优于配置"成为默认；用 RSC 让 server 组件不发到 client，bundle 体积减半。
