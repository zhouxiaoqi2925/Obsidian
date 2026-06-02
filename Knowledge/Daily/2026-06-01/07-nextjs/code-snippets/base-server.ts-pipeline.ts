// 来源: next.js packages/next/src/server/base-server.ts
// 作用: 请求 pipeline — 路由匹配 + 路由参数 + RSC render dispatch
// 调用链: handleRequest → pipeline → renderToHTMLOrFlight → sendPayload
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] pipeline 的核心职责
//   - 把 HTTP request 转成 React tree (RSC + HTML)
//   - 4 个阶段: match → 准备 → render → send
//   - 每个阶段可独立测试 + 替换
//   - 关键: streaming, 每个阶段产物可增量 flush
//   - 类比: 中间件模式 (express), 但 Next 把 render 当一等公民
//
// [WHY-2] 路由匹配 (match) 的算法
//   - 输入: URL + 路由树 (来自 app/ 或 pages/)
//   - 输出: 匹配的 page.tsx + dynamic params + 元数据
//   - 复杂度: O(深度) — 沿路径遍历, 每个 segment 一个决策
//   - 静态参数: 预编译时知道 ([slug] 候选值)
//   - 动态参数: 运行时解析 ([id] 实际值)
//   - catch-all: [...slug] 匹配多段
//   - 优化: 路由表预编译, 1 次 hash lookup 替代遍历
//
// [WHY-3] RSC 渲染的双产物
//   - 产物 1: HTML (浏览器直接 render)
//   - 产物 2: RSC payload (客户端 FlightRoot 解析用)
//   - 关键: 二者并行 render, 不是先后
//   - 优势: HTML 先出 (TTFB 快), RSC 慢 IO 完后再 flush
//   - 写入: HTML 嵌 inline <script>self.__next_f.push([1, ...])</script>
//   - 客户端: 读 self.__next_f 解析 RSC, hydrate 对应位置
//
// [WHY-4] 缓存层 (4 级) 在 pipeline 中的位置
//   - L1 HTTP cache: pipeline 之前 (CDN/浏览器层)
//   - L2 Data cache: render 中 (RSC fetch 走)
//   - L3 Full Route Cache: render 之后 (HTML + RSC 都缓存)
//   - L4 Router Cache: client 端
//   - 命中后: 跳过 render, 直接 send
//   - 失效: revalidateTag / revalidatePath
//
// [WHY-5] sendPayload 的流式策略
//   - HTML 分块写, 每 chunk 后 flush TCP
//   - 浏览器: 边收边 parse, 边显示 (progressive rendering)
//   - 慢 IO (DB/外部 API) 完一块, flush 一块 (Streaming SSR)
//   - 性能: TTFB 50-200ms (vs 整页 1-3s)
//   - 坑: flush 太频繁 → 系统调用多, 反而慢
//   - 优化: 每个 <Suspense> 边界一个 chunk, 平衡粒度
// ================================================================

// === pipeline 主函数 (简化) ===
async function pipeline(
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: UrlWithParsedQuery,
  onError?: (err: Error) => void
): Promise<void> {
  // [WHY-1] 1. 准备阶段: 解析 + 匹配 + 取数据
  const match = await this.matchRoutes({
    pathname: parsedUrl.pathname || '/',
    query: parsedUrl.query,
    headers: req.headers,
  })

  if (!match) {
    return this.render404(req, res, parsedUrl)
  }

  // [WHY-2] 2. 路由参数提取
  const { page, params, routeModule, components } = match

  // [WHY-4] 3. 检查 L3 (Full Route Cache)
  const cachedHtml = await this.getRouteCacheEntry(req, match)
  if (cachedHtml && !this.isRevalidating(match)) {
    // 命中 → 直接 send, 跳过 render
    res.setHeader('X-Nextjs-Cache', 'HIT')
    return this.sendPayload(res, cachedHtml)
  }

  // 4. 并行: RSC payload + HTML render
  //   - RSC: 走 server component tree, 返回二进制流
  //   - HTML: 把 RSC tree + client placeholders 编译成 HTML
  const renderContext: RenderContext = {
    req,
    res,
    page,
    params,
    query: parsedUrl.query,
    components,
    // ... 几十个字段
  }

  try {
    const result = await this.renderToHTMLOrFlight(renderContext)

    // [WHY-4] 5. L3 缓存写入 (异步, 不阻塞 send)
    if (result.cacheable) {
      this.setRouteCacheEntry(req, match, result)
    }

    // [WHY-5] 6. 流式发送
    await this.sendPayload(res, result)
  } catch (err) {
    onError?.(err as Error)
    await this.renderErrorToHTML(err as Error, req, res, parsedUrl)
  }
}

// === matchRoutes: URL → 路由模块 (简化) ===
async function matchRoutes({ pathname, query, headers }: MatchArgs): Promise<Match | null> {
  // 1. 静态路由 (SSG) — 编译时生成 manifest
  const staticMatch = STATIC_ROUTE_MANIFEST[pathname]
  if (staticMatch) return staticMatch

  // 2. 动态路由 — 遍历路由树
  for (const route of this.appRouter.routes) {
    const m = matchRoute(route, pathname)
    if (m) {
      return {
        page: route.page,
        params: m.params,
        components: route.components,
        routeModule: route,
        isDynamic: route.isDynamic,
      }
    }
  }
  return null
}

// === 路由匹配算法 ===
function matchRoute(route: Route, pathname: string): { params: Record<string, string> } | null {
  const routeParts = route.pathname.split('/')
  const urlParts = pathname.split('/')
  if (routeParts.length !== urlParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < routeParts.length; i++) {
    const rp = routeParts[i]
    const up = urlParts[i]
    if (rp.startsWith('[') && rp.endsWith(']')) {
      // [param] 动态段
      const name = rp.slice(1, -1).replace('...', '')  // [...slug] → slug
      params[name] = decodeURIComponent(up)
    } else if (rp.startsWith('@')) {
      // @slot 平行路由
      continue
    } else if (rp !== up) {
      return null  // 静态段不匹配
    }
  }
  return { params }
}

// === renderToHTMLOrFlight: 双产物 render (简化) ===
async function renderToHTMLOrFlight(ctx: RenderContext): Promise<RenderResult> {
  // 1. 创建 Flight 上下文
  const flightContext: FlightContext = {
    url: ctx.req.url,
    headers: ctx.req.headers,
    // ...
  }

  // 2. 并行:
  //    a) 渲染 RSC payload (Server Component tree → stream)
  //    b) 渲染 HTML (RSC + Client placeholders → HTML stream)
  const [rscStream, htmlStream] = await Promise.all([
    this.renderFlight(flightContext),
    this.renderHTML(ctx, flightContext),
  ])

  // 3. 合并: HTML 里嵌 RSC payload via <script>
  return new RenderResult(htmlStream, rscStream)
}

// === sendPayload: 流式写入响应 ===
async function sendPayload(res: ServerResponse, result: RenderResult) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // ... 其它 headers (Cache-Control, ETag)

  // 1. 先写 HTML head (含 <script>self.__next_f)
  const reader = result.htmlStream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    // 写入 TCP, 自动 flush
    if (!res.write(value)) {
      await new Promise(resolve => res.once('drain', resolve))
    }
  }
  res.end()
}

// ================================================================
// 性能数据 (e-commerce site, 1000 商品页):
//
// [首次渲染 (cold)]
//   - 路由匹配: ~1-5ms
//   - RSC render: ~50-200ms (DB + Server Component)
//   - HTML render: ~30-100ms
//   - send payload: ~10-50ms
//   - 总: ~100-350ms (TTFB)
//
// [缓存命中 (L3)]
//   - 路由匹配: ~1ms
//   - cache lookup: ~1-5ms
//   - send payload: ~5-20ms
//   - 总: ~10-30ms (TTFB, 10x 快)
//
// [Streaming chunk 时机]
//   - HTML head: 0-50ms (首字节)
//   - <Suspense> 边界 1: 50-200ms (可能含 await)
//   - <Suspense> 边界 2: 200-500ms
//   - 完整结束: 500-2000ms
//
// 关键配置:
//   - 路由深度: 不要超 5 层 (layout 嵌套)
//   - dynamic params: 太多会让路由表大, 编译慢
//   - catch-all [...slug]: 慎用, 容易匹配过头
//
// 坑:
//   - 路由匹配和 RSC render 强耦合, debug 时难定位
//   - cache key 包含 headers/cookies, 缓存命中率低
//   - 慢 IO 不加 <Suspense> → 失去 streaming 优势
//   - 路由参数含特殊字符 (/) 需要 URL encode
//
// 监控:
//   - req res 延迟 (TTFB, full response)
//   - cache hit ratio (X-Nextjs-Cache header)
//   - RSC render 耗时
//   - send payload chunk 数 / 总大小
// ================================================================
