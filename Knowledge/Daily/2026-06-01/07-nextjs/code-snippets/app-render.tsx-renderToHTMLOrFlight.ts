// 来源: next.js packages/next/src/server/app-render/render-to-html-or-flight.tsx
// 作用: RSC 渲染入口 — Server Component 树 → RSC payload + HTML (并行流式)
// 调用链: pipeline → renderToHTMLOrFlight → renderFlight + renderHTML
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么需要"二阶段并行" render
//   - RSC payload: 给 client 解析 Server Component 树用 (Flight protocol)
//   - HTML: 给浏览器直接 render, 含 Client Component 占位
//   - 二者本质上是同一棵 React tree, 但输出格式不同
//   - 关键: 并行 render, 共享 React tree 上下文, 不重复构建
//   - 性能: TTFB 接近单 render 耗时, 不是二者之和
//
// [WHY-2] RSC payload 协议 — 自定义紧凑格式
//   - "$L1" → 引用 (类似 React.lazy 的 lazy ref)
//   - "$@1" → 数组 (标记 list 起点)
//   - "$1" → 普通对象 (含 type, props, key)
//   - "$F" → 函数 (Server Action 序列化)
//   - moduleMap 头部: 标识 client 组件 ID → 客户端 manifest
//   - 优势: 紧凑 (~2-3x 优于 JSON), 自描述, 支持流式
//
// [WHY-3] Streaming + Suspense 边界
//   - 每个 <Suspense> 边界: render 暂停, 边界内容异步完成后再 flush
//   - HTML 写完后, RSC 仍在流式补完 (穿 inline <script>)
//   - 客户端: 边收边 hydrate, 已就绪部分立即可交互
//   - 关键: TTFB 极快 (几十 ms), 体感"渐进显示"
//   - 注意: 不用 <Suspense> 包裹的 await → 阻塞整页
//
// [WHY-4] React tree 共享 vs 各自独立 render
//   - 早期: 同一 tree render 两次 (RSC + HTML), 浪费
//   - 现在: 共享 React tree 上下文, 但序列化阶段分开
//   - 实现: renderToReadableStream 同时输出 RSC 和 HTML
//   - 优化: 组件 children 只算一次, 结果两次编码
//   - 配合 React.cache() 去重: 同一数据 fetch 一次, RSC + HTML 共用
//
// [WHY-5] 错误边界与 fallback
//   - error.tsx: 自动包成 ErrorBoundary
//   - RSC render 错: 上抛到最近 error.tsx, 渲染 fallback
//   - HTML render 错: 同上, 但客户端可能拿到不完整 HTML
//   - 关键: error.tsx 必须是 Client Component (要 hooks)
//   - 调试: NODE_ENV=development 显示错误 overlay
// ================================================================

// === renderToHTMLOrFlight 主入口 (简化) ===
async function renderToHTMLOrFlight(
  req: IncomingMessage,
  res: ServerResponse,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
): Promise<RenderResult> {
  // [WHY-1] 1. 解析 App Router 树 (segment by segment)
  const { routeTree, searchParams, layoutSegments } = await resolveRouteTree(
    pagePath,
    query
  )

  // 2. 创建 Flight 上下文 (RSC payload 输出目标)
  const flightContext: FlightContext = {
    url: req.url,
    headers: req.headers,
    cookies: parseCookies(req),
    searchParams,
    // ...
  }

  // [WHY-1] 3. 并行启动 RSC + HTML render
  //    - 共享 React tree context (ComponentWork)
  //    - 但输出流分开
  const workStore = createWorkStore(renderOpts)

  // [WHY-4] 关键: 同一 tree, 两个 serializer
  const rscStream = renderFlight(flightContext, workStore)         // RSC payload
  const htmlStream = renderHTML(routeTree, workStore, rscStream)  // HTML + 嵌入 RSC

  // 4. 包装成 RenderResult (对外暴露 stream + metadata)
  return new RenderResult(htmlStream, rscStream, {
    cacheable: !workStore.isDynamic,
    revalidate: workStore.revalidate,
  })
}

// === renderFlight: Server Component 树 → RSC payload stream ===
function renderFlight(ctx: FlightContext, workStore: WorkStore): ReadableStream {
  return renderToReadableStream(
    // 1. 入口: 调用 page + layout
    <AppRouterContext.Provider value={ctx}>
      {renderAppTree(ctx.routeTree)}
    </AppRouterContext.Provider>,
    {
      // 2. 客户端组件 manifest
      moduleMap: ctx.componentMod.moduleMap,
      moduleLoading: ctx.moduleLoading,
      // 3. Server Action 注册表
      serverReferenceConfig: ctx.serverActions,
      // 4. 环境变量
      environmentName: ctx.environmentName,
      // 5. 遇到 Promise 的处理
      onError(err) { workStore.errors.push(err) },
    }
  )
}

// === renderAppTree: 递归渲染 app 树 ===
function renderAppTree(tree: FlightRouterState): React.ReactNode {
  // tree 是路由树, 每个 segment 一个组件
  return tree.reduce((acc, segment) => {
    const Component = segment.Component  // page 或 layout
    if (!Component) return acc

    // [WHY-3] 关键: 用 <Suspense> 包裹, 实现 streaming
    return (
      <Suspense key={segment.key} fallback={segment.loading || null}>
        <Component
          params={segment.params}
          searchParams={segment.searchParams}
        />
      </Suspense>
    )
  }, null)
}

// === renderHTML: HTML 渲染 (简化) ===
function renderHTML(
  routeTree: FlightRouterState,
  workStore: WorkStore,
  rscStream: ReadableStream,
): ReadableStream {
  // 1. 创建 server-side React tree (和 RSC 一样)
  // 2. 用 renderToString / renderToPipeableStream 编译成 HTML
  // 3. 在 <body> 末尾嵌入 <script>self.__next_f.push([1, rsc_payload])</script>
  return renderToPipeableStream(
    <AppRouterContext.Provider value={workStore.flightContext}>
      {renderAppTree(routeTree)}
    </AppRouterContext.Provider>,
    {
      onShellReady() {
        // shell (HTML head) ready, 可以 flush
        workStore.htmlShellReady = true
      },
      onAllReady() {
        // 所有 content ready
        workStore.htmlAllReady = true
      },
      onError(err) { workStore.errors.push(err) },
    }
  )
}

// === RSC payload 格式 (示例) ===
//  假设:
function Header() { return <h1>Title</h1> }
function Page() {
  return <div>
    <Header />
    <p>hello</p>
    <ClientButton />
  </div>
}

//  RSC payload 序列化结果 (简化):
const RSC_PAYLOAD_EXAMPLE = [
  '1:I["page.js",["app/page.tsx"],"Page"]',  // moduleMap: Client 组件 ref
  '2:["$","div",null,{"children":[',
  '3:["$","h1",null,{"children":"Title"}],',
  '4:["$","p",null,{"children":"hello"}],',
  '5:["$","$L1",null,{"onClick":"$F2"}]',  // $L1 = ref to ClientButton
  '6:"]}]',
  '7:0'  // 结束
]
// 含义:
//   $ = React element
//   $L1 = 引用 moduleMap 中第 1 个 (ClientButton)
//   $F2 = 引用 Server Action #2
//   数字 = 后续行号, 客户端按行号解析

// ================================================================
// 性能数据 (中等复杂页面, 1 个 RSC + 1 个 Client):
//
// [render 总耗时]
//   - renderFlight: 30-100ms (DB 查询 + Server Component 渲染)
//   - renderHTML:   20-80ms  (同步, 复用 RSC 树)
//   - 并行: 30-100ms (max, 不累加)
//   - 整体 TTFB: 50-200ms
//
// [RSC payload 大小]
//   - 简单页面 (1 Client):  ~2-5KB
//   - 中等 (5-10 组件):    ~10-30KB
//   - 复杂 (50 组件 + data): ~100-500KB
//   - 太大 (>1MB) → 流式断, 优化方案: data 只放 ref, 详情走 fetch
//
// [Streaming chunk 策略]
//   - <Suspense> 边界数: 5-15 个最佳 (过少: 失去渐进; 过多: chunk 太碎)
//   - 边界耗时常数: < 200ms (慢 IO 加 loading.tsx)
//
// 关键配置:
//   - generateStaticParams: 预渲染 dynamic 路由 (SSG)
//   - dynamicParams: true  → 允许 [id] 运行时解析
//   - dynamic = 'force-static' / 'force-dynamic' / 'auto'
//   - revalidate: 60 (ISR)
//
// 坑:
//   - Client Component 不能直接 import Server-only 库 (e.g. fs, db)
//   - Server Component 不能用 hooks (useState, useEffect)
//   - 序列化函数: 必须 'use server' 标记 (Server Action)
//   - Date / Map / Set 不能直接传给 Client (需要序列化)
//
// 调试:
//   - 看 RSC payload: view-source: URL + 搜 "self.__next_f"
//   - chunk 边界: <Suspense> 决定
//   - 错误: error.tsx / global-error.tsx
//   - 性能: chrome devtools → Network → 看 timing
// ================================================================
