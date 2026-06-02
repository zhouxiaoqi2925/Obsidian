// 来源: next.js packages/next/src/client/components/app-router.tsx
// 作用: App Router 客户端状态机 — 接收 RSC payload + 协调导航/缓存/预取
// 调用链: SSR HTML hydrate → AppRouter → FlightRoot → children
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么需要客户端 Router 状态机
//   - SSR 输出的是 HTML + 初始 RSC payload (内嵌在 <script>)
//   - 后续导航 (Link/back/forward) 不能再走整页 reload
//   - 必须有一个 client-side 状态机, 持有:
//     1. current tree (路由树快照)
//     2. cache (data cache, dedupe fetch)
//     3. prefetch cache (hover 时预取)
//   - 类比: 就像 SPA router (react-router), 但叠加了 RSC 流式增量
//
// [WHY-2] 双树结构 (RSC tree + Client Component tree)
//   - RSC tree: 从 server 来的, 描述"哪些位置应该渲染什么"
//   - Client tree: 在 client 跑的, 持有 hooks/state
//   - 关键: RSC tree 是"指令", 不是真组件; FlightRoot 解析后渲染
//   - 客户端只 hydrate 标了 'use client' 的节点, 其它保持 server-rendered HTML
//
// [WHY-3] useReducer 状态机 — 11 种 ACTION 类型
//   - ACTION_NAVIGATE: 路由切换 (push/replace)
//   - ACTION_RESTORE: 浏览器 back/forward (popstate)
//   - ACTION_REFRESH: 强制刷新当前路由
//   - ACTION_PREFETCH: 预取路由 (link hover)
//   - ACTION_SERVER_ACTION: Server Action 提交
//   - ACTION_HMR: 开发模式热更新
//   - 状态字段: tree, cache, prefetchCache, pendingPush, ...
//   - 关键: 所有导航都走同一个 reducer, 行为可预测
//
// [WHY-4] Link prefetch 的智能策略
//   - viewport 内: 自动 prefetch (低优先级)
//   - hover: 高优先级 prefetch
//   - 预取结果进 prefetchCache (LRU, 默认 30s)
//   - 二次访问: 命中 cache → 立即渲染 (无 network)
//   - 移动端: 默认关闭 viewport prefetch (省流量)
//   - 优化: 用 IntersectionObserver 懒触发
//
// [WHY-5] streaming + 渐进 hydrate
//   - 收到 partial RSC payload → 立刻渲染已就绪部分
//   - <Suspense> 边界触发 loading.tsx fallback
//   - 客户端组件 hydrate 也按"已渲染"顺序
//   - 体感: 用户先看到 shell, 慢内容"渐入"
//   - 关键优化: 不等所有数据 ready 就开始 paint
// ================================================================

// === AppRouter 状态类型 ===
type AppRouterState = {
  tree: FlightRouterState          // 当前路由树
  cache: CacheNode                  // 客户端组件 cache (按 segment)
  prefetchCache: Map<string, PrefetchResponse>  // 预取 cache
  pushRef: { pendingPush: boolean; mpaNavigation: boolean }
  focusAndScrollRef: { apply: boolean; onlyHashChange: boolean }
  canonicalUrl: string | null
  nextUrl: string | null
}

// === 11 种 ACTION 类型 ===
const ACTION_NAVIGATE = 'navigate'         // 路由切换
const ACTION_RESTORE = 'restore'           // back/forward 恢复
const ACTION_REFRESH = 'refresh'           // 当前路由刷新
const ACTION_PREFETCH = 'prefetch'         // 预取
const ACTION_SERVER_ACTION = 'server-action'  // Server Action
const ACTION_HMR = 'hmr'                   // 热更新
const ACTION_FAST_REFRESH = 'fast-refresh' // 组件级 HMR
const ACTION_NAVIGATE_BACK = 'navigate-back'
const ACTION_NAVIGATE_FORWARD = 'navigate-forward'
const ACTION_BEFORE_HISTORY = 'before-history'
const ACTION_AFTER_HISTORY = 'after-history'

// === AppRouter 主组件 ===
function AppRouter({ initialTree, initialHead, initialCanonicalUrl }: AppRouterProps) {
  const [{ tree, cache, prefetchCache, pushRef }, dispatch] = useReducer(
    appRouterReducer,
    {
      tree: initialTree,
      cache: createInitialCacheNode(initialTree),
      prefetchCache: new Map(),
      pushRef: { pendingPush: false, mpaNavigation: false },
    }
  )

  // [WHY-3] 1. pathname 变化 → 派发 NAVIGATE
  const pathname = usePathname()
  useEffect(() => {
    dispatch({ type: ACTION_NAVIGATE, url: pathname, ... })
  }, [pathname])

  // [WHY-3] 2. 监听浏览器 back/forward
  useEffect(() => {
    const onPopState = (ev: PopStateEvent) => {
      dispatch({ type: ACTION_RESTORE, url: ev.state?.url })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // [WHY-4] 3. IntersectionObserver 自动 prefetch viewport 内 Link
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const link = entry.target as HTMLAnchorElement
          const href = link.href
          // 低优先级 prefetch
          prefetch(href, 'low')
        }
      }
    }, { rootMargin: '200px' })  // 提前 200px 触发

    document.querySelectorAll('a[href]').forEach(a => observer.observe(a))
    return () => observer.disconnect()
  }, [pathname])

  // [WHY-5] 4. 渲染 — FlightRoot 解析 RSC tree → 客户端树
  return (
    <FlightRoot
      tree={tree}
      cache={cache}
      nextUrl={pathname}
      dispatch={dispatch}
    >
      {/* 渲染当前路由的 children */}
      {cache.parallelRoutes?.default?.map((child) => (
        <Slot key={child.key} child={child} />
      ))}
    </FlightRoot>
  )
}

// === appRouterReducer 核心逻辑 (简化) ===
function appRouterReducer(state: AppRouterState, action: Action): AppRouterState {
  switch (action.type) {
    case ACTION_NAVIGATE: {
      const { url, isPush, navigateType } = action
      // 1. 查 prefetchCache
      const cached = state.prefetchCache.get(url)
      if (cached) {
        // 命中 → 立刻切到新 tree, 取消 network
        return applyRouterStateFromCache(state, cached)
      }
      // 2. 未命中 → 发起 RSC 请求 (流式)
      const response = fetchServerResponse(url)
      // 这里会持续 dispatch ACTION_SERVER_PATCH 增量更新
      return startTransition(() => applyRouterStateFromFetch(state, response))
    }
    case ACTION_PREFETCH: {
      // 异步 prefetch, 结果存 prefetchCache
      return prefetchInBackground(state, action.url, action.kind)
    }
    case ACTION_SERVER_ACTION: {
      // Server Action: POST 到 server, 收到 RSC payload 后应用
      return handleServerAction(state, action.actionId, action.payload)
    }
    // ... 其它 action 类似
  }
}

// === FlightRoot — RSC tree → React tree ===
function FlightRoot({ tree, cache, children }: FlightRootProps) {
  // 解析 RSC tree, 把 server component ref 转成 client tree
  // 关键: 复用 SSR HTML, 只 hydrate 'use client' 边界
  return useMemo(() => (
    <CacheNodeContext.Provider value={cache}>
      {children}
    </CacheNodeContext.Provider>
  ), [cache, children])
}

// ================================================================
// 性能数据 (medium site, 100 个路由):
//
// [首次加载]
//   - SSR HTML 渲染: ~200ms
//   - hydrate 完成: ~500ms (TTI)
//   - 客户端 JS bundle: ~100KB (vs Pages Router 500KB)
//
// [客户端导航 (Link)]
//   - prefetch 命中: ~10ms (cache hit)
//   - prefetch miss + cache miss: ~100-300ms (RTT)
//   - 整页 reload: ~1-3s (相比传统 SPA 快 5-10x)
//
// [back/forward]
//   - bfcache 命中: 0ms (浏览器原生)
//   - 走 dispatch + cache: ~50ms
//
// 关键阈值:
//   - prefetchCache: 默认 30s TTL, LRU
//   - tree 深度: 嵌套 layout 不要超 5 层 (影响 patch 性能)
//   - cache node: 1000 路由以内安全, 再多需 partition
//
// 坑:
//   - 'use client' 边界切错 → 整页 hydrate, 失去 RSC 优势
//   - 大量 'use client' + 状态 → tree patch 慢
//   - RSC payload 太大 (>1MB) → 流式断开, 检查 size budget
//   - window/window.localStorage 访问 → 必须在 useEffect 内
//
// 监控:
//   - next:route_change: 路由切换耗时
//   - next:fetch: RSC 请求耗时
//   - next:hydrate: hydrate 耗时
//   - next:revalidate: ISR revalidate 耗时
// ================================================================
