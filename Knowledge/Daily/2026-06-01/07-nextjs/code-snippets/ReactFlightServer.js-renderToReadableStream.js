// 来源: react react-server-dom-webpack src/ReactFlightServer.js
// 作用: 把 Server Component 树序列化为 RSC payload (ReadableStream)
// 调用链: renderToReadableStream → processModelChunk → emitModel
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么需要自定义序列化协议
//   - JSON 太大: 50KB 的 React tree → ~200KB JSON (含 type 字符串)
//   - JSON 不支持流式: 必须整个对象就绪才能 stringify
//   - JSON 不支持引用去重: 同一对象多次序列化, 浪费
//   - 替代: 自定义紧凑格式 (行分隔, $ 前缀, 模块 ID 引用)
//   - 性能: 同 tree ~30-50KB (比 JSON 小 3-5x)
//
// [WHY-2] 协议格式 (行分隔 + $ 标记)
//   - 行格式: "<id>:<chunk>"
//   - $ = React element 标记
//   - $L<id> = 引用 (lazy ref, 客户端 manifest 查 module)
//   - $@<id> = 数组 (list 起点)
//   - $<id> = 普通对象 (含 type, props, key)
//   - $F<id> = 函数引用 (Server Action)
//   - 数字 id: 客户端用按行号解析, 0 = 结束
//   - 优势: 支持流式 (一行一解析), 自描述, 紧凑
//
// [WHY-3] 客户端组件 manifest (moduleMap)
//   - 头部写入: client 组件 ID → webpackChunkName + modulePath
//   - 客户端收到: 按 ID 查 manifest, 动态 import 组件
//   - 关键: client 不用 import 整个组件库, 按需加载
//   - 安全: server 控制哪些组件可 client 渲染
//   - 注意: server-only 组件绝不能进 moduleMap
//
// [WHY-4] Promise + 流式输出的协同
//   - React Server Component: await 拿数据
//   - serializer: 遇 Promise, 标记占位, 等待 resolved 后再 emit
//   - 关键: 已 ready 部分立即 flush, 不等所有 Promise
//   - 客户端: 占位 <Suspense> fallback, 收到真值后替换
//   - 优化: 多个独立 Promise 并行 await, 一起 resolve 后再写
//   - 性能: TTFB 50ms (vs 整页 1s+)
//
// [WHY-5] 错误处理 + 安全边界
//   - onError: render 中出错, 上抛, 不污染 stream
//   - 序列化前 sanitize: 防止泄漏 server-only 数据
//   - client 可拿到的字段: 仅 props 显式传, 不递归
//   - 敏感数据 (e.g. password): 标 'use server' 不进 RSC payload
//   - 日志: 序列化错误打 server log, 不暴露给 client
// ================================================================

// === renderToReadableStream 入口 (简化) ===
function renderToReadableStream(
  model: ReactClientObject,         // Server Component 树根
  webpackMap: ServerReferenceMap,   // client 组件 manifest
  moduleLoading: ModuleLoading,     // 客户端 module 加载策略
  options: RenderOptions = {},
): ReadableStream {
  // 1. 创建 Request 状态机
  const request: Request = createRequest(
    model,
    webpackMap,
    moduleLoading,
    options.onError,
    options.identifierPrefix,
  )

  // 2. 返回 ReadableStream, start() 启动序列化
  return new ReadableStream({
    type: 'bytes',  // 字节流
    start(controller) {
      // 关联 controller 到 request
      startFlowing(request, controller)
    },
    pull(controller) {
      // 客户端拉数据时推进
      startFlowing(request, controller)
    },
    cancel(reason) {
      // 客户端取消
      abort(request, reason)
    },
  })
}

// === startFlowing: 核心序列化循环 (简化) ===
function startFlowing(request: Request, controller: ReadableStreamDefaultController): void {
  // 1. 先写 moduleMap 头 (client 组件清单)
  if (!request.moduleMapWritten) {
    const moduleMapHeader = emitModuleMap(request)
    controller.enqueue(stringToChunk(moduleMapHeader))
    request.moduleMapWritten = true
  }

  // 2. 序列化 model 树
  request.pendingChunks++  // 占位 +1, 完 -1

  // 2.1 入口 model
  const rootSegment = request.segments.get(0)
  emitModelChunk(request, rootSegment, model, ...)
  flushCompletedTrees(request, controller)

  // 2.2 推进: 处理 resolved Promise + 嵌套 children
  processQueue(request, controller)

  // 3. 流关闭
  if (request.completed) {
    controller.close()
  }
}

// === emitModelChunk: 单个节点序列化 (简化) ===
function emitModelChunk(
  request: Request,
  parent: Segment,
  value: any,
  parentObj: any,
  key: string,
): void {
  // 1. 基本类型 → 直接写
  if (typeof value === 'string') {
    writeChunk(request, parent, JSON.stringify(value))  // "hello"
    return
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    writeChunk(request, parent, JSON.stringify(value))
    return
  }
  if (value === null || value === undefined) {
    writeChunk(request, parent, 'null')
    return
  }

  // 2. Promise → 占位 + 等 resolved
  if (typeof value.then === 'function') {
    const newSegment = createPendingSegment(request, parent)
    parent.chunks.push(newSegment)
    value.then(
      (resolved) => {
        // resolved 后回填
        newSegment.status = RESOLVED
        newSegment.value = resolved
        processQueue(request)  // 触发 emit
      },
      (rejected) => {
        newSegment.status = REJECTED
        newSegment.reason = rejected
      }
    )
    return
  }

  // 3. 数组 → $@<id>
  if (Array.isArray(value)) {
    writeChunk(request, parent, `$@${parent.id}`)
    value.forEach((item, i) => {
      emitModelChunk(request, parent, item, value, i)
    })
    return
  }

  // 4. React Element → $<id>
  if (value.$$typeof === REACT_ELEMENT_TYPE) {
    writeChunk(request, parent, `$${parent.id}`)
    // 写 type, key, props
    emitModelChunk(request, parent, value.type, value, 'type')
    emitModelChunk(request, parent, value.key, value, 'key')
    if (value.props) {
      for (const propKey in value.props) {
        if (propKey === 'children') continue
        emitModelChunk(request, parent, value.props[propKey], value.props, propKey)
      }
    }
    // children 单独处理 (递归)
    const children = value.props?.children
    if (children !== undefined) {
      emitModelChunk(request, parent, children, value.props, 'children')
    }
    return
  }

  // 5. Client Component ref → $L<moduleId>
  if (isClientReference(value)) {
    const moduleId = request.webpackMap[value]
    writeChunk(request, parent, `$L${moduleId}`)
    return
  }

  // 6. Server Action → $F<id>
  if (isServerReference(value)) {
    const actionId = getServerReferenceId(value)
    writeChunk(request, parent, `$F${actionId}`)
    return
  }

  // 7. 普通对象 → 序列化字段
  if (typeof value === 'object') {
    writeChunk(request, parent, `$${parent.id}`)
    for (const objKey in value) {
      emitModelChunk(request, parent, value[objKey], value, objKey)
    }
  }
}

// === processQueue: 推进所有 pending segments ===
function processQueue(request: Request, controller?: ReadableStreamDefaultController): void {
  // 1. 处理 resolved segment
  for (const segment of request.segments.values()) {
    if (segment.status === RESOLVED) {
      // 递归 emit 真正数据
      emitModelChunk(request, segment.parent, segment.value, ...)
    }
  }

  // 2. 推进流
  if (controller) {
    flushCompletedTrees(request, controller)
  }
}

// === 实际 RSC payload 例子 ===
//  输入:
const EXAMPLE_MODEL = (
  <html>
    <body>
      <h1>Title</h1>
      <p>Hello {userName}</p>
      <ClientButton onClick={handleClick} />
    </body>
  </html>
)

//  输出 (RSC payload):
const EXAMPLE_RSC = `
1:I["page.js",["webpack"],"ClientButton"]  // moduleMap entry
2:["$","html",null,{"children":[
3:  ["$","body",null,{"children":[
4:    ["$","h1",null,{"children":"Title"}],
5:    ["$","p",null,{"children":["Hello","World"]}],
6:    ["$","$L1",null,{"onClick":"$F2"}]
7:  ]}]
8:]}]
9:0  // 结束
`
//  客户端解析:
//    1 = 拿到 moduleMap [ClientButton]
//    2 = $ = element, html, props.children 数组
//    3-7 = 递归展开
//    6 = $L1 = 引用 moduleMap[1] = ClientButton, $F2 = server action ref
//    9 = 0 = 结束

// ================================================================
// 性能数据 (中等 Server Component 树, 1 个 await, 5 个 Client):
//
// [序列化大小]
//   - 简单: 2-5KB (1-2 个 Client ref)
//   - 中等: 10-30KB (5-10 个 Client + props)
//   - 复杂: 100-500KB (data-rich, 50+ 节点)
//   - 极限: 1MB+ (需考虑分页 / 减少数据下传)
//
// [序列化耗时]
//   - walk 树: 1-5ms (小) / 10-30ms (中) / 50-200ms (复杂)
//   - gzip 后: 再省 50-70%
//   - 字节流: 不需等整树, 边走边写
//
// [流式延迟]
//   - 第一个 chunk (含 moduleMap): 5-20ms
//   - shell 元素 (no await): 立即
//   - await Promise 后: 50-500ms
//   - 整体收完: 100-1000ms
//
// 关键优化:
//   - React.cache() 去重 fetch (同请求内多次调, 只 1 次 IO)
//   - 序列化只发 ref, 不发大对象 (e.g. 不发整张表, 发 ID list)
//   - gzip: 自定义协议比 JSON 更友好, 重复字符串易压
//   - HTTP/2 头压缩: 配合 push
//
// 坑:
//   - 循环引用: 序列化为 [Circular] (JSON 同样会)
//   - 不可序列化值 (Date, RegExp, Function): 转字符串或标 'use server'
//   - 大对象 (>100KB): 客户端卡, 优化: pagination / streaming
//   - 序列化错误: try/catch 包裹, onError 上抛
//
// 调试:
//   - view-source: URL → 搜 "self.__next_f"
//   - 复制 payload → 客户端 console 模拟解析
//   - 字段对不上: 写 console.log 在 server 端 emitModelChunk
// ================================================================
