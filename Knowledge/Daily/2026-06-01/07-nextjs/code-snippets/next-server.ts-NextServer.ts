// 来源: next.js packages/next/src/server/next-server.ts
// 作用: NextServer 启动入口 — HTTP server + middleware + 路由 + render
// 调用链: createServer → prepare() → getRequestHandler() → pipeline
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] NextServer 的分层设计
//   - 顶层: HTTP server (Node http / Edge runtime / Worker)
//   - 中间层: middleware 链 (Edge function, 改 req/res)
//   - 业务层: router (Pages 或 App) → render
//   - 底层: 编译产物 (dev: webpack/turbopack / prod: .next/server)
//   - 抽象: 同一套接口支持 dev/prod/edge 多种运行时
//
// [WHY-2] 为什么需要 middleware 层
//   - 在路由匹配前执行, 可改 req (URL, headers, cookies) 或 res (rewrite, redirect)
//   - 用 Edge runtime 跑, 几 ms 启动, 部署到全球
//   - 典型场景: A/B 测试, 鉴权, geo-routing, A/B 灰度
//   - 注意: middleware 不能做重操作 (限 25ms / 4MB response)
//   - 与后端 BFF 不同: middleware 是请求级别, BFF 是业务聚合
//
// [WHY-3] dev vs prod 模式差异
//   - dev: 启动 webpack/turbopack watch, HMR, 错误覆盖, on-demand compile
//   - prod: 加载 .next/server 编译产物, 静态文件直接 read, 0 编译开销
//   - 关键: dev 慢 (首次编译 5-30s), prod 快 (ms 级响应)
//   - 优化: dev 用 turbopack (Rust 实现, 10x 快于 webpack)
//
// [WHY-4] Edge Runtime 的边界
//   - 限制: 不能用 Node API (fs, child_process, native modules)
//   - 支持: Web Standard API (fetch, Request, Response, URL, crypto)
//   - 优势: 冷启动 ~5ms, 部署到全球 200+ 节点
//   - 场景: middleware, RSC with edge, 静态化高的页面
//   - 不能用: 任何依赖 Node 生态的库 (e.g. sharp image 在 edge 需要 WASM 版)
//
// [WHY-5] 缓存层次 (4 级)
//   - L1: HTTP cache (CDN, 浏览器) — Cache-Control, s-maxage
//   - L2: Next.js data cache (RSC fetch) — in-memory + disk
//   - L3: Full Route Cache (App Router) — 整个路由的 HTML 缓存
//   - L4: Router Cache (client) — 客户端 prefetch
//   - 命中优先级: L1 > L2 > L3 > L4
//   - 失效: revalidateTag / revalidatePath / 部署
// ================================================================

// === NextServer 核心类 (简化) ===
class NextServer {
  private nextConfig: NextConfig
  private router: Router
  private hotReloader: HotReloader | null
  private serverOptions: ServerOptions

  constructor(options: ServerOptions) {
    this.serverOptions = options
    this.hotReloader = null
  }

  // [WHY-1] 启动准备: 加载配置 + 初始化路由 + 启动 dev 编译
  async prepare(): Promise<void> {
    // 1. 加载 next.config.js
    this.nextConfig = await loadConfig(
      this.serverOptions.conf,
      this.serverOptions.dir,
      this.serverOptions.dev
    )

    // 2. 校验 experimental / 标准化选项
    this.nextConfig = await normalizeConfig(this.nextConfig)

    // 3. 创建路由 (Pages 或 App Router)
    this.router = await this.createRouter()

    // 4. dev 模式: 启动 HMR + 错误覆盖 + on-demand compile
    if (this.serverOptions.dev) {
      this.hotReloader = new HotReloader(this.serverOptions.dir, {
        pagesDir: this.serverOptions.pagesDir,
        appDir: this.serverOptions.appDir,
        previewProps: this.serverOptions.previewProps,
      })
      await this.hotReloader.start()
    }
  }

  // [WHY-1] 拿到 request handler, 给 http.Server 用
  async getRequestHandler(): Promise<(req: IncomingMessage, res: ServerResponse) => Promise<void>> {
    // 提前准备: 图片优化、压缩、缓存
    const { compression, etag, onError } = this.getServerOptions()
    return async (req, res) => {
      try {
        // 1. 解析 URL
        const parsedUrl = parseUrl(req.url || '/')

        // [WHY-2] 2. middleware 链 (Edge runtime)
        await this.runMiddleware(req, res, parsedUrl)
        if (res.writableEnded) return  // middleware 提前响应

        // 3. 路由匹配 + render
        await this.router.execute(req, res, parsedUrl)
      } catch (err) {
        this.renderError(err, req, res, parsedUrl)
      }
    }
  }

  // [WHY-2] middleware 链执行
  private async runMiddleware(req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery) {
    const middleware = this.getMiddleware()
    if (!middleware) return

    // Edge runtime: 用 V8 isolate 跑, 限 25ms / 4MB
    const result = await middleware({
      request: new NextRequest(req),
      // 关键: 返回 NextResponse 可改 headers/redirect/rewrite
    })

    if (result.headers) {
      // 复制 response headers 到 Node res
      for (const [key, value] of result.headers.entries()) {
        res.setHeader(key, value)
      }
    }
    if (result.cookies) {
      // set-cookies
    }
    if (result.body) {
      res.end(await result.text())
    }
  }

  // [WHY-3] dev 模式 HMR 启动
  private async setupDevHotReloader() {
    if (!this.hotReloader) return
    // 启动 webpack/turbopack watch
    await this.hotReloader.start()
    // 暴露 ws 端口, client 端连接拿 HMR 更新
  }

  // [WHY-5] 缓存策略: 静态资源 + 路由 HTML
  private getServerOptions() {
    return {
      compression: this.nextConfig.compress,
      etag: this.nextConfig.generateEtags,
      // ...
    }
  }

  // === createRouter: 选 Pages 或 App ===
  private async createRouter(): Promise<Router> {
    const { appDir, pagesDir, runtime } = this.serverOptions
    if (appDir) {
      // App Router (新, 推荐)
      return new AppRouteRouteHandler({ ... })
    }
    if (pagesDir) {
      // Pages Router (legacy, 兼容)
      return new PagesRouteHandler({ ... })
    }
    throw new Error('No app dir or pages dir found')
  }

  // === 静态资源服务 ===
  getStaticPaths() { /* 列出 SSG 预渲染的路径 */ }
  getBuildId() { /* 编译 hash, 缓存打破用 */ }
  // ... 几十个方法
}

// === NextRequest: 包装 Node IncomingMessage 为 Web Standard ===
class NextRequest extends Request {
  // 标准 fetch API 兼容
  // + Next 扩展: cookies, geo, ip
  constructor(nodeReq: IncomingMessage) {
    super(`http://${nodeReq.headers.host}${nodeReq.url}`, {
      method: nodeReq.method,
      headers: nodeReq.headers as any,
    })
  }
}

// ================================================================
// 性能数据 (production, 中型 SaaS 应用):
//
// [冷启动]
//   - Node server: ~200-500ms (启动模块加载)
//   - Edge runtime: ~5-20ms (V8 isolate)
//
// [请求处理]
//   - 静态资源 (cached): ~1-5ms (CDN 直接返)
//   - SSG 页面: ~5-20ms (Node res)
//   - SSR 页面: ~50-200ms (render + RSC)
//   - RSC with Edge: ~20-100ms
//
// [middleware]
//   - 平均: 5-15ms (Edge 节点)
//   - 限制: 25ms 软上限, 4MB response
//
// 关键配置:
//   - next.config.js:
//     compress: true           # gzip
//     generateEtags: true      # 304 协商缓存
//     poweredByHeader: false   # 去掉 X-Powered-By
//
//   - 环境:
//     NEXT_RUNTIME: 'nodejs' | 'edge'
//     PORT: 3000
//     HOSTNAME: 0.0.0.0
//
// 坑:
//   - middleware 超过 25ms 会被警告
//   - 静态资源 import 必须放 public/ 或 <Image> 组件
//   - 自定义 server.js 会失去 ISR / 部分优化
//   - Edge runtime 不能用 fs, 用 fetch 拿数据
//
// 监控:
//   - 启动时间: process.uptime()
//   - 请求延迟: response-time header
//   - 中间件: console.time('middleware')
//   - Vercel: 部署后看 runtime logs
// ================================================================
