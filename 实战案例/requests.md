# Requests - HTTP for Humans（Python 生态标杆 HTTP 客户端）

**GitHub**: psf/requests
**Star**: 53k+
**语言**: Python
**主题**: http、python、api、client
**适用场景**: Python HTTP 调用、API 客户端、爬虫、简单 Web 服务

---

## 一、基础范式

### 模式 1 · requests.get / post / put / delete 四件套

**问题场景**：Python 标准库 urllib 用法啰嗦（URL 拼接 / 参数编码 / 异常处理）。

**解决方案**：requests 提供一行调用：`r = requests.get(url, params={...}, headers={...})` / `r = requests.post(url, data={...})` / `r = requests.put(...)` / `r = requests.delete(...)`。

**关键参数**：
- `requests.get`
- `requests.post`
- `requests.put` / `delete`
- params / headers
- 一行调用

**最佳实践**：所有 Python HTTP 调用用 requests，告别 urllib。

### 模式 2 · Session 对象 + 连接池

**问题场景**：多次请求同一 host 慢（每次新建 TCP 连接）。

**解决方案**：`session = requests.Session()` 创建会话对象，自动维护 `HTTPAdapter` 连接池（`urllib3`）；同 host 复用 TCP 连接。

**关键参数**：
- `requests.Session()`
- 连接池
- Cookie 持久化
- `HTTPAdapter`
- 性能提升 10x

**最佳实践**：所有多次请求用 Session，告别每次新建连接。

### 模式 3 · Response 对象

**问题场景**：需要方便地取响应内容 / 状态码 / 头。

**解决方案**：`r = requests.get(url)` 返回 `Response` 对象；`r.status_code` / `r.text` / `r.json()` / `r.content` / `r.headers` / `r.cookies` / `r.encoding`。

**关键参数**：
- `r.status_code`
- `r.text` / `r.content`
- `r.json()`
- `r.headers`
- `r.cookies`

**最佳实践**：所有 HTTP 响应统一用 Response 对象，告别手写解析。

### 模式 4 · JSON 请求与响应

**问题场景**：现代 API 全是 JSON，手动序列化反序列化麻烦。

**解决方案**：`r = requests.post(url, json={...})` 自动 JSON encode；`r.json()` 自动 JSON decode；headers 自动设 `Content-Type: application/json`。

**关键参数**：
- `json=` 参数
- 自动 Content-Type
- `r.json()` 反序列化
- 0 配置
- 现代 API

**最佳实践**：所有 JSON API 用 `json=` 参数，告别手写 json.dumps/loads。

### 模式 5 · 超时与异常（Timeout / ConnectionError / HTTPError）

**问题场景**：网络异常不捕获，应用卡死或崩溃。

**解决方案**：`requests.get(url, timeout=5)` 5 秒超时；`r.raise_for_status()` 4xx/5xx 抛 `HTTPError`；异常类 `ConnectionError` / `Timeout` / `RequestException`。

**关键参数**：
- `timeout=5`
- `raise_for_status()`
- 异常类层次
- 优雅降级
- 0 卡死

**最佳实践**：所有生产 requests 调用都加 timeout + try/except。

---

## 二、扩展范式

### 模式 6 · 文件上传（multipart/form-data）

**问题场景**：需要上传文件到服务端。

**解决方案**：`files = {'file': open('a.png', 'rb')}; requests.post(url, files=files)` 自动 multipart；`files = {'file': ('filename.png', content, 'image/png')}` 显式。

**关键参数**：
- `files=` 参数
- multipart
- 文件句柄
- `Content-Type`
- 0 配置

**最佳实践**：所有文件上传用 `files=`，告别手写 multipart。

### 模式 7 · 流式下载（stream=True + iter_content）

**问题场景**：下载大文件（GB 级）一次性读入内存爆。

**解决方案**：`r = requests.get(url, stream=True)` 不立即下载；`for chunk in r.iter_content(chunk_size=8192): f.write(chunk)` 流式写入。

**关键参数**：
- `stream=True`
- `iter_content`
- chunk_size
- 大文件
- 0 内存压力

**最佳实践**：所有 > 100MB 下载用 stream + iter_content。

### 模式 8 · 代理与 SSL

**问题场景**：需要通过代理 / 自定义证书访问 API。

**解决方案**：`requests.get(url, proxies={'http': 'http://proxy:8080', 'https': 'https://proxy:8080'})` 代理；`verify='/path/to/ca-bundle.crt'` 自定义 CA；`cert=('/path/client.crt', '/path/client.key')` 双向认证。

**关键参数**：
- `proxies=`
- `verify=`
- `cert=`
- 自定义 CA
- 双向认证

**最佳实践**：所有企业内网 / 自签名证书场景用 verify / cert 参数。

### 模式 9 · 身份认证（Basic / Digest / OAuth）

**问题场景**：需要 HTTP 认证（Basic / Digest / Bearer）。

**解决方案**：`requests.get(url, auth=HTTPBasicAuth('user', 'pass'))` Basic；`auth=HTTPDigestAuth(...)` Digest；`headers={'Authorization': 'Bearer xxx'}` Bearer。

**关键参数**：
- `auth=`
- `HTTPBasicAuth`
- `HTTPDigestAuth`
- Bearer Token
- 0 配置

**最佳实践**：所有需要认证的 API 用 auth 参数或 Authorization 头。

### 模式 10 · Hooks（请求 / 响应钩子）

**问题场景**：需要在每个请求前后加通用逻辑（日志 / 重试 / 认证）。

**解决方案**：`hooks={'response': [log_hook, retry_hook]}` 注册响应钩子；钩子签名 `(r, *args, **kwargs) -> r`，可改 r 后返回。

**关键参数**：
- `hooks=`
- response hook
- request hook
- 多钩子链
- 0 样板

**最佳实践**：所有「跨请求通用逻辑」用 hooks（日志 / 监控 / 鉴权）。

---

## 三、进阶范式

### 模式 11 · 自定义 Transport Adapter

**问题场景**：需要自定义 HTTP 行为（重试 / 限流 / 监控）。

**解决方案**：继承 `HTTPAdapter`，重写 `send()` 方法；`session.mount('https://', MyAdapter())` 挂载到 URL 前缀。

**关键参数**：
- `HTTPAdapter`
- `send` 方法
- `session.mount`
- URL 前缀匹配
- 完整控制

**最佳实践**：所有复杂 HTTP 行为用自定义 Adapter（限流 / 重试 / 熔断）。

### 模式 12 · 重试机制（urllib3.Retry + HTTPAdapter）

**问题场景**：网络抖动需要自动重试。

**解决方案**：`urllib3.util.retry.Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])` 配置重试；`session.mount('https://', HTTPAdapter(max_retries=retry))` 应用。

**关键参数**：
- `Retry(total=3)`
- `backoff_factor`
- `status_forcelist`
- 指数退避
- 自动重试

**最佳实践**：所有生产 API 调用配 Retry，节省 80% 网络抖动问题。

### 模式 13 · 异步 requests（requests-async / aiohttp）

**问题场景**：同步 requests 阻塞，爬虫 / 高并发慢。

**解决方案**：`aiohttp.ClientSession` 替代 requests 提供 async/await；`requests-async` 同步 API 异步实现；`httpx` 同步 + 异步双 API。

**关键参数**：
- `aiohttp`
- `async/await`
- `httpx` 同步 + 异步
- 高并发
- 0 阻塞

**最佳实践**：所有高并发爬虫 / API 客户端用 aiohttp / httpx。

### 模式 14 · Requests Cache

**问题场景**：重复请求相同 URL 浪费带宽 + 慢。

**解决方案**：`requests-cache` 库 `requests_cache.install_cache('cache')` 自动缓存 GET 响应到 SQLite；`expire_after=3600` 1 小时过期。

**关键参数**：
- `requests-cache`
- `install_cache`
- SQLite 后端
- `expire_after`
- 0 配置

**最佳实践**：所有读多写少 API 用 requests-cache，节省 90% 带宽。

### 模式 15 · Requests Mock（responses / requests-mock）

**问题场景**：单元测试需要 mock HTTP 响应。

**解决方案**：`responses` 库 `@responses.activate` 装饰器 + `responses.add(responses.GET, url, json={...}, status=200)` 注册 mock；调用 requests 命中 mock。

**关键参数**：
- `responses`
- `@responses.activate`
- mock 注册
- 单元测试
- 0 网络

**最佳实践**：所有 requests 测试用 `responses` 库，0 真实网络。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：从零搭 Python HTTP 客户端。

**解决方案**：7 件套：① `requests` 安装 ② `Session` 会话 ③ `timeout` 参数 ④ `try/except` 异常 ⑤ `r.raise_for_status()` 断言 ⑥ `r.json()` 解析 ⑦ log 日志。

**关键参数**：
- requests
- Session
- timeout
- try/except
- raise_for_status
- r.json
- logging

**最佳实践**：所有新项目用 7 件套，5 分钟跑起来。

### 模式 17 · 重试 + 退避 + 熔断（生产级）

**问题场景**：生产 API 客户端需要企业级稳定性。

**解决方案**：`tenacity` 库 `@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))` 装饰 + `urllib3.Retry` + 熔断（手写或 `pybreaker`）。

**关键参数**：
- `tenacity`
- `@retry`
- 指数退避
- 熔断
- 异常处理

**最佳实践**：所有生产 API 客户端用 tenacity + urllib3.Retry + 熔断。

### 模式 18 · 性能优化 5 招

**问题场景**：requests 性能瓶颈。

**解决方案**：5 招优化：① Session 连接池 ② HTTPAdapter 增加 `pool_connections` / `pool_maxsize` ③ `requests-cache` 缓存 ④ `httpx` 异步 ⑤ `grequests` 并发（基于 gevent）。

**关键参数**：
- Session
- pool_connections
- cache
- httpx
- 并发

**最佳实践**：5 招组合，requests 吞吐提升 10x。

### 模式 19 · 与 urllib3 / httpx / aiohttp 对比

**问题场景**：Python HTTP 客户端选型。

**解决方案**：requests 定位「同步 API + 最流行」适合大多数；urllib3 定位「底层连接池」适合库作者；httpx 定位「同步 + 异步双 API + HTTP/2」适合现代；aiohttp 定位「纯异步」适合高并发。

**关键参数**：
- 学习曲线：requests < urllib3 < httpx < aiohttp
- 性能：aiohttp > httpx > requests > urllib3
- 生态：requests > urllib3 > aiohttp > httpx
- 同步/异步：httpx 双 / aiohttp 异 / requests 同

**最佳实践**：默认选 requests，异步选 httpx / aiohttp。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork requests 做 HTTP 库。

**解决方案**：7 天分 5 步：① `urllib3` 连接池 ② `Request` / `PreparedRequest` 对象 ③ `Response` 对象 ④ `Session` 持久化 ⑤ 4 个 HTTP 方法。

**关键参数**：
- Day 1-2: urllib3
- Day 3: Request
- Day 4: Response
- Day 5: Session
- Day 6-7: methods

**最佳实践**：7 天复刻「极简 requests」，完整 requests 复刻需要 2 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\requests\`
- **大小**: ~5 MB
- **总文件数**: 数十 Python 文件
- **关键 commit**: v2.32.x
- **作者**: Kenneth Reitz + 社区
- **许可**: Apache-2.0

## 一句话总结

Requests 用「HTTP for Humans」哲学 + Session 连接池 + Response 对象 + 异常体系把 Python HTTP 调用做到极致简洁，是 Python 生态 HTTP 客户端的事实标准（年下载 30 亿+ 次）。
