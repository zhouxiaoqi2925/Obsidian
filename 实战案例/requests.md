# requests - "HTTP for Humans" 的 Python 生态标杆 HTTP 客户端

**GitHub**: psf/requests
**Star**: 53k+
**语言**: Python
**主题**: HTTP 客户端 / urllib3 包装 / Adapter 可插拔
**适用场景**: Python 同步阻塞 HTTP 调用、爬虫/自动化/SDK 二次封装、AI 平台后端；非并发场景

---

## 第一段：核心抽象与 API 设计

### 模式 1：模块函数 + Session 双层 API

**问题场景**：Python 标准库 `urllib` / `urllib2` 难用——query string 拼接、form 编码、cookie 管理、auth header 拼接全要手写；新手写"调一个 GET"要 30 行。

**解决方案**：requests 提供 7 个动词函数（`get/post/put/delete/...`）做"开箱即用"的薄封装，底层走 `Session` 复用连接池。

```python
import requests
# 模块级函数：临时用，不复用连接
r = requests.get('https://api.github.com/user', auth=('u', 'p'))

# Session：复用连接池/headers/cookies/hooks
with requests.Session() as s:
    s.headers['Authorization'] = 'Bearer ...'
    for url in urls:
        r = s.get(url)  # 同一 TCP 连接复用
```

**关键参数**：
- 7 个动词：`get/post/put/patch/delete/head/options`
- `head()` 强制 `allow_redirects=False`（RFC 建议）
- 模块函数内部用 `with sessions.Session() as s:` 包裹（确保 socket 关闭）
- Session 是状态容器（headers/cookies/auth/hooks/adapters 跨请求复用）

**最佳实践**：生产代码必须 `s = requests.Session()` 复用连接；模块级 `requests.get()` 性能是 Session 的 1/3；`with Session() as s:` 保证 socket 释放。

### 模式 2：三段式对象（Request → PreparedRequest → Response）

**问题场景**：直接传一个 dict 跑全程，URL/headers/body 准备过程不可见、不可重放、不可测试。

**解决方案**：requests 把请求生命周期拆成 3 个值对象：
- `Request`：用户输入（method/url/headers/data）
- `PreparedRequest`：即将发送的快照（cookie 合并、auth 注入、body 编码完）
- `Response`：服务端返回

```python
req = requests.Request('POST', 'https://api.example.com/users',
                       json={'name': 'Alice'}, headers={'X-Trace': 'abc'})
prepared = s.prepare_request(req)   # 用户输入 → 准备发送的快照
print(prepared.headers)              # 看到最终 headers（含 auth/cookies/UA）
print(prepared.body)                 # 看到最终 body（json 编码完）
r = s.send(prepared)                 # 真正发出去
print(r.history)                     # 重定向历史
```

**关键参数**：
- `Request(method, url, **kwargs)` 仅用户意图
- `prepare_request()` 合并 session defaults（headers/cookies/auth）
- `PreparedRequest.prepare()` 内部走 `prepare_method/url/headers/cookies/body/auth/hooks` 7 步
- `Response` 含 `history` / `elapsed` / `request`（反向引用）

**最佳实践**：测试时 mock `PreparedRequest` 而非 `Request`（最接近真实发送）；用 `s.prepare_request(req)` 调试 headers 合并逻辑。

### 模式 3：URL 预处理的 7 道防线

**问题场景**：用户传脏 URL（中文域名、缺 scheme、`*.example.com` 通配符、空格未编码）直接抛 `LocationParseError` 或发送出错。

**解决方案**：`PreparedRequest.prepare_url` 7 道防线：放行 `mailto:` / 拒绝缺 scheme / 拒绝空 host / IDNA 编码中文域名 / 拒绝通配符 / 拼 netloc / 补裸域 `/` / `requote_uri` 重编码。

```python
# models.py:481-561 prepare_url 简化
if ":" in url and not url.lower().startswith("http"):
    self.url = url; return  # 1. 放过非 HTTP 协议
scheme, auth, host, port, path, query, fragment = parse_url(url)
if not scheme: raise MissingSchema(...)        # 2. 缺 scheme 不替你猜
if not host: raise InvalidURL(...)
if not unicode_is_ascii(host):
    host = self._get_idna_encoded_host(host)   # 3. 中文域名 IDNA
elif host.startswith(("*", ".")):
    raise InvalidURL("URL has an invalid label.")  # 4. 通配符非法
```

**关键参数**：
- `parse_url` 来自 urllib3（复用 RFC 3986 解析器比自己写安全）
- IDNA 编码：`中文.cn` → `xn--fiqs8s.cn`
- `requote_uri` 防止 `GET /a b` 把空格发出去
- 通配符只在 SNI/Host 头合法，不能在 URL

**最佳实践**：所有 URL 验证让 requests 去做（防御性编程）；不要在调用方拼 URL 后再"清洗"——直接传原始 URL 让 `prepare_url` 处理。

### 模式 4：Adapter 前缀挂载

**问题场景**：aiohttp 只能走 asyncio，httpx 切换 transport 要重写代码；如何在同一 Session 混用不同 transport（`http://` / `https://` / `s3://` / `mock://`）？

**解决方案**：`Session.get_adapter(url)` 用**最长前缀匹配**把 URL 路由到对应 Adapter。`s.mount('https://api.', MyAdapter())` 局部覆写，无需 if-else。

```python
from requests.adapters import HTTPAdapter
class MyRetryAdapter(HTTPAdapter):
    def send(self, request, **kwargs):
        return super().send(request, timeout=60, **kwargs)
s = requests.Session()
s.mount('https://api.github.com/', MyRetryAdapter(pool_connections=10))
s.mount('https://', HTTPAdapter(max_retries=3))
# 任何 https:// 开头的请求 → MyRetryAdapter
# 其他 https:// → HTTPAdapter(max_retries=3)
```

**关键参数**：
- `BaseAdapter` 抽象（`send(request) -> Response`）
- `HTTPAdapter`（urllib3 实现）+ `SOCKSProxyManager`（可选）
- `mount(prefix, adapter)` 注册路由
- `get_adapter` 用 `for prefix, adapter in self.adapters.items(): if url.lower().startswith(prefix.lower()): return adapter`

**最佳实践**：长前缀 mount 必须在短前缀之后（顺序依赖）；测试时用 `s.mount('http://', MockAdapter())` 拦截所有请求；不要在 production 混用 `s.mount('https://', ...)` 和 `s.mount('https://api.', ...)` 顺序错乱。

### 模式 5：异常重翻译（urllib3 → requests 领域异常）

**问题场景**：urllib3 把所有错误塞进 `MaxRetryError`，用户必须 `except urllib3.MaxRetryError as e: if isinstance(e.reason, ConnectTimeoutError): ...`，层级深、API 不友好。

**解决方案**：`HTTPAdapter.send` 用 `isinstance(e.reason, ...)` 把扁平异常重新分类成 requests 领域异常（`ConnectionError` / `ConnectTimeout` / `ProxyError` / `SSLError`），并挂上 `request=request` 字段。

```python
# adapters.py:710-746
try:
    resp = conn.urlopen(method=..., url=..., body=..., headers=...,
        redirect=False, assert_same_host=False, preload_content=False,
        decode_content=False, retries=self.max_retries, timeout=..., chunked=...)
except (ProtocolError, OSError) as err:
    raise ConnectionError(err, request=request)
except MaxRetryError as e:
    if isinstance(e.reason, ConnectTimeoutError): raise ConnectTimeout(e, request=request)
    if isinstance(e.reason, _ProxyError): raise ProxyError(e, request=request)
    if isinstance(e.reason, _SSLError): raise SSLError(e, request=request)
    raise ConnectionError(e, request=request)
```

**关键参数**：
- 异常树根：`RequestException` → `IOError` / `ConnectionError` / `Timeout` / `HTTPError` / `TooManyRedirects`
- `preload_content=False` + `decode_content=False` 让 `iter_content()` 流式工作
- 每个异常携带 `request=request` 字段（`e.request.url` 可读）

**最佳实践**：用户代码 `except requests.exceptions.ConnectionError` 而非 `except urllib3.MaxRetryError`；`preload_content=False` 是流式下载的前提（关闭后内容不会全量加载）。

---

## 第二段：鉴权、Cookie 与扩展点

### 模式 6：HTTPBasicAuth 简单鉴权

**问题场景**：REST API 用 Basic Auth（`Authorization: Basic base64(user:pass)`），手写 base64 + header 拼接烦，且拼错容易泄露密码。

**解决方案**：`HTTPBasicAuth(username, password)` 实现 `AuthBase.__call__(r)`：在 `prepare_auth` 阶段自动注入 `Authorization` header。

```python
from requests.auth import HTTPBasicAuth, HTTPDigestAuth
# 方式 1：元组（内部等价）
r = requests.get('https://api.example.com', auth=('user', 'pass'))
# 方式 2：显式类（可继承自定义）
r = requests.get('https://api.example.com', auth=HTTPBasicAuth('user', 'pass'))
# 方式 3：Session 默认
s = requests.Session(); s.auth = HTTPBasicAuth('user', 'pass')
```

**关键参数**：
- `AuthBase` 抽象基类，定义 `__call__(r) -> r` 接口
- `HTTPBasicAuth`：base64 编码 `user:pass`
- `HTTPDigestAuth`：MD5/SHA-256 摘要握手（状态机）
- Session 的 `auth` 字段是 default，request 的 `auth` 字段会覆盖

**最佳实践**：HTTPS + Basic 才安全（HTTP 上 Basic 等于明文）；自定义鉴权继承 `AuthBase` 实现 `__call__`；不要在 URL 里塞 `user:pass@`（requests 会报 InvalidURL）。

### 模式 7：HTTPDigestAuth 状态机（threading.local）

**问题场景**：HTTP Digest 鉴权有状态——服务器发 nonce，客户端回 `nc=00000001`，nonce 用过就废；多线程下 nonce 计数器要独立。

**解决方案**：`HTTPDigestAuth` 把 `last_nonce` / `nonce_count` / `chal` / `num_401_calls` 存到 `threading.local()`，每线程独立。401 后 `seek()` body 位置 + 复用连接重发。

```python
# auth.py:124-355
self._thread_local = threading.local()
def init_per_thread_state(self):
    if not hasattr(self._thread_local, "init"):
        self._thread_local.init = True
        self._thread_local.last_nonce = ""
        self._thread_local.nonce_count = 0
        self._thread_local.num_401_calls = 1
def handle_401(self, r, **kwargs):
    if not 400 <= r.status_code < 500: return r  # 仅 401 重试
    if (seek := getattr(r.request.body, "seek", None)) is not None:
        seek(self._thread_local.pos)            # 流式 body seek 回原位
    r.content                                     # 消费响应 → 释放连接到池
    prep = r.request.copy()
    prep.headers["Authorization"] = self.build_digest_header(...)
    _r = r.connection.send(prep, **kwargs)       # 复用连接
    _r.history.append(r)
    return _r
```

**关键参数**：
- `threading.local()` 解决多线程 nonce 计数独立
- `seek(self._thread_local.pos)` 流式 body 必备（文件上传 401 后重发）
- `r.content` 消费 socket → 释放到连接池（省一次 TCP 握手）
- `num_401_calls` 限制重试次数（防 nonce 永续循环）

**最佳实践**：支持重试的 HTTP 客户端**必须**在发送前 `body.tell()` 记位置，401 后 `body.seek()` 回原位；用 `r.connection.send(prep)` 复用连接而非 `s.send(prep)`。

### 模式 8：Cookie Jar（http.cookiejar 包装）

**问题场景**：浏览器 Set-Cookie 头要自动存、下次请求自动带；跨域名 cookie 隔离；JSESSIONID 这种服务端 session cookie 怎么管理？

**解决方案**：`RequestsCookieJar` 包装 stdlib `http.cookiejar.CookieJar`，每个 Session 实例挂一个。请求前 `merge_cookies` 把 jar 里的 cookie 合并到 headers，响应后 `extract_cookies_to_jar` 把 Set-Cookie 写回。

```python
s = requests.Session()
s.cookies.set('pref', 'dark_mode', domain='example.com', path='/')
r = s.get('https://example.com/')           # 自动带 Cookie: pref=dark_mode
print(s.cookies.get('pref'))                # 'dark_mode'（服务器可能追加其他 cookie）
# 跨域：每个 host 独立 jar（http.cookiejar 默认行为）
```

**关键参数**：
- `RequestsCookieJar` = `http.cookiejar.CookieJar` 扩展（支持 dict-like 访问）
- `extract_cookies_to_jar(jar, request, response)` 解析 Set-Cookie
- `merge_cookies(jar_cookies, request)` 注入到 request headers
- cookie 持久化：自己 pickle `s.cookies` 或用 `requests.cookies.RequestsCookieJar()`

**最佳实践**：用 `s.cookies.set(name, value, domain=..., path=...)` 而非 `s.headers['Cookie']`（自动处理多 cookie 拼接）；跨域登录用 `s.cookies.update(jar_from_other_session)`。

### 模式 9：Hooks 事件分发

**问题场景**：想给所有响应加指标（Prometheus counter）、结构化日志、慢请求警告，复制粘贴到每个调用点违反 DRY。

**解决方案**：`Session.hooks` 是 dict，key 是事件名（`response`），value 是 callback 列表。`dispatch_hook('response', hooks, response, request=...)` 在 `send` 末尾调用。

```python
def log_resp(response, *args, **kwargs):
    print(f'[{response.status_code}] {response.request.url} {response.elapsed.total_seconds():.3f}s')
    return response   # 必须 return（可替换为新 response）
s = requests.Session()
s.hooks['response'].append(log_resp)
# 多个 hook 按顺序执行
s.hooks['response'].append(prom_counter_inc)  # 指标
s.hooks['response'].append(slow_request_warn)  # 慢请求告警
```

**关键参数**：
- hook 签名：`hook(response, *args, **kwargs)` 或 `hook(request, **kwargs)`
- `dispatch_hook(key, hooks, hook_data, **kwargs)` 内部实现
- hook 可修改/替换 hook_data（return 新对象）
- 错误不影响其他 hook（try/catch 包裹）

**最佳实践**：用 `response.elapsed.total_seconds()` 算耗时；hook 里抛错不会中断主流程；用 `requests-requests_logger` / 自定义 hook 做结构化日志。

### 模式 10：Merge Setting（None = 删除）

**问题场景**：Session 默认有 `X-Auth: abc`，单次请求想"临时去掉"（传 `headers=None` 会让某 key 消失），如何表达"删除"语义？

**解决方案**：`merge_setting` 三层合并（request 覆盖 session，非 dict 取 request，None 当删除）。`merged` 里 value 是 `None` 的 key 直接 `del`。

```python
# sessions.py:76-105
def merge_setting(request_setting, session_setting, dict_class=OrderedDict):
    if session_setting is None: return request_setting
    if request_setting is None: return session_setting
    if not (isinstance(session_setting, Mapping) and isinstance(request_setting, Mapping)):
        return request_setting  # 非 dict（如 verify=True）request 覆盖
    merged = dict_class(to_key_val_list(session_setting))
    merged.update(to_key_val_list(request_setting))
    none_keys = [k for (k, v) in merged.items() if v is None]
    for key in none_keys: del merged[key]
    return merged
# 用法
s.headers['X-Auth'] = 'abc'
s.get(url, headers={'X-Auth': None})  # 单次请求不带 X-Auth
```

**关键参数**：
- `None` 不是缺失，是"删除信号"
- `dict` 类型走 merge，非 dict（如 `verify=True`）直接 request 覆盖
- 用 `OrderedDict` 保持 header 顺序（HTTP/1.1 性能）
- 三个参数：`request_setting` / `session_setting` / `dict_class`

**最佳实践**：用 `headers={'X-Auth': None}` 而非 `del s.headers['X-Auth']`（后者影响后续请求）；`None = 删除` 是 werkzeug/fastapi 通用约定。

---

## 第三段：传输层与连接管理

### 模式 11：HTTPAdapter 包装 urllib3

**问题场景**：自己实现 socket 层要写 TLS、连接池、retry、SOCKS——重复造轮子且安全审计噩梦。

**解决方案**：`HTTPAdapter` 持有 `urllib3.PoolManager`，把 requests 的 `Request` 翻译成 urllib3 的 `urlopen(method, url, body, headers, ...)` 调用，把 urllib3 的 `HTTPResponse` 翻译回 `requests.Response`。

```python
# adapters.py 核心逻辑
class HTTPAdapter(BaseAdapter):
    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        self.poolmanager = PoolManager(num_pools=connections, maxsize=maxsize, block=block, **pool_kwargs)
    def send(self, request, stream=False, timeout=None, verify=True, cert=None, proxies=None):
        conn = self.get_connection(request.url, proxies)   # urllib3 proxy-aware connection
        resp = conn.urlopen(method=..., body=..., headers=..., retries=self.max_retries, timeout=..., ...)
        return self.build_response(request, resp)
```

**关键参数**：
- `poolmanager = PoolManager(num_pools=N, maxsize=M)` 连接池
- `block=True` 连接池满时阻塞（默认 False 抛 `ConnectionError`）
- `HTTPAdapter` 默认 `pool_connections=10` / `pool_maxsize=10`
- 自定义 SSLContext 通过 `pool_kwargs['ssl_context']` 传入

**最佳实践**：用 `HTTPAdapter(pool_connections=100, pool_maxsize=100)` 给高并发场景；不要自己实现 TLS，依赖 urllib3/certifi 更新；HTTPS 证书校验失败用 `verify='/path/to/ca-bundle'` 自定义 CA。

### 模式 12：重定向（Generator + yield_requests）

**问题场景**：30 次重定向链如果用 for 循环递归会一次性吃光 30 个响应；用户想 `r.history` 看到全部中间响应；如何既流式又可控？

**解决方案**：`Session.resolve_redirects` 是生成器，`yield` 每个 `Response`；`yield_requests=True` 时 yield `PreparedRequest`（让 `r.next()` 拿到下一个 prep），否则 yield `Response`。

```python
# sessions.py:186
def resolve_redirects(self, resp, req, stream=False, timeout=None, verify=True, cert=None, proxies=None, yield_requests=False, **adapter_kwargs):
    gen = self.resolve_redirects(..., yield_requests=True)
    history = [resp for resp in gen]    # 收集所有
# r.next() 内部
def next(self):
    return next(self._content.__iter__()) if self._content_consumed else None
# 实际是：r._next = next(self.resolve_redirects(..., yield_requests=True))
```

**关键参数**：
- 最大重定向次数：30（`MAX_REDIRECTS` 常量）
- 重定向保留 method：301/302 + POST 默认变 GET（RFC 7231）
- cookie 跨域：`extract_cookies_to_jar` 在每次 redirect 时执行
- `allow_redirects=False` 跳过（HEAD 强制）

**最佳实践**：用 `r.history` 看重定向链（每步 Response）；登录后 follow redirect 拿最终页面；不要手动实现 follow redirect（边界条件太多）。

### 模式 13：urllib3 Retry 错误重试

**问题场景**：网络瞬断（DNS 抖动、TCP RST）导致一次失败，业务想要 3 次重试 + 指数退避；requests 默认不重试。

**解决方案**：`HTTPAdapter(max_retries=Retry(total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503]))` 把 urllib3 的 `Retry` 传给 `urlopen` 的 `retries` 参数。

```python
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
retry = Retry(
    total=3,                        # 总次数
    backoff_factor=0.5,             # 退避：{0, 0.5, 1, 2, 4, 8...} 秒
    status_forcelist=[500, 502, 503, 504],  # 这些状态码触发重试
    allowed_methods=['GET', 'POST'],  # 允许重试的方法
    raise_on_status=False,
)
s = requests.Session()
s.mount('https://', HTTPAdapter(max_retries=retry))
```

**关键参数**：
- `total`：总重试次数
- `backoff_factor`：指数退避基数（0 → 0.5s, 1 → 1s, 2 → 2s）
- `status_forcelist`：哪些 HTTP 状态码触发重试
- `allowed_methods`：默认 `['HEAD', 'GET', 'OPTIONS']`（POST 不安全）
- `respect_retry_after_header`：是否遵守服务端 `Retry-After`

**最佳实践**：GET 重试 3 次 + 指数退避；POST 默认不重试（防重复扣款）；读 `Retry-After` header（避免被服务器限流）。

### 模式 14：代理与 SOCKS

**问题场景**：内网穿透要 HTTP 代理；科学上网要 SOCKS5；不同 URL 走不同代理。

**解决方案**：`proxies={'http': 'http://proxy:8080', 'https': 'socks5://user:pass@proxy:1080'}` 字典。SOCKS5 需要 `pip install requests[socks]`（PySocks 是可选依赖，v2.32 拆分）。

```python
# HTTP 代理
r = requests.get(url, proxies={'http': 'http://proxy:8080', 'https': 'http://proxy:8080'})
# SOCKS5
r = requests.get(url, proxies={'https': 'socks5://user:pass@proxy:1080'})
# Session 默认
s = requests.Session()
s.proxies = {'http': 'http://proxy:8080'}
# 环境变量
# HTTP_PROXY=http://proxy:8080 HTTPS_PROXY=http://proxy:8080 python script.py
```

**关键参数**：
- 4 个 env：`HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`（逗号分隔列表）
- `NO_PROXY=localhost,127.0.0.1,.internal.com` 排除列表
- SOCKS5 比 HTTP 代理快（不需要 CONNECT 隧道）
- v2.32 起 PySocks 是可选依赖（`pip install requests[socks]`）

**最佳实践**：用 env var 而非硬编码代理（CI/dev/prod 切换）；SOCKS5 配 `user:pass` 走认证；`NO_PROXY` 必须包含 `localhost`。

### 模式 15：流式下载 + chunked transfer

**问题场景**：下载 1GB 文件，全量加载到内存 OOM；想边下载边写盘；如何获取传输进度？

**解决方案**：`stream=True` 让 `urllib3` 用 `preload_content=False`；`r.iter_content(chunk_size=8192)` 是生成器，每次 yield 一个 chunk。

```python
r = requests.get('https://example.com/big.zip', stream=True)
r.raise_for_status()
with open('big.zip', 'wb') as f:
    for chunk in r.iter_content(chunk_size=8192):
        if chunk:                # filter out keep-alive newlines
            f.write(chunk)
            # 进度：print(f'\r{f.tell() / 1024 / 1024:.1f} MB', end='')
# iter_lines() 按行迭代（文本流）
# r.raw 是 urllib3 HTTPResponse（流式 socket）
```

**关键参数**：
- `stream=True`：只下载 headers，不下载 body
- `iter_content(chunk_size=8192)`：byte 流
- `iter_lines()`：行流（文本）
- `r.raw`：原始 urllib3 响应（`r.raw.read(8192)`）
- 完成后必须 `r.close()` 释放连接回池

**最佳实践**：所有大文件下载必加 `stream=True`；用 `chunk_size=8192`（HTTP 推荐值）；下载完后 `r.close()` 或 `with requests.get(..., stream=True) as r:`。

---

## 第四段：生产实践与生态

### 模式 16：超时（connect vs read tuple）

**问题场景**：网络慢/服务端 hang，请求卡死；想区分"连接超时"和"读超时"分别报警。

**解决方案**：`timeout=(3.05, 27)` 元组第一个是 connect timeout，第二个是 read timeout。`None` 表示无限等待（**绝不推荐**）。

```python
# 单值（connect 和 read 同）
r = requests.get(url, timeout=5)             # 5 秒
# tuple（分开）
r = requests.get(url, timeout=(3.05, 27))    # connect 3.05s, read 27s
# None（绝不推荐——会无限等）
r = requests.get(url, timeout=None)
```

**关键参数**：
- `timeout` 影响 `urllib3.urlopen(timeout=...)`
- 推荐 connect timeout > 1s（防 DNS 抖动假阳性）
- read timeout 视业务（API 调用 5-30s，大文件 300s+）
- 抛 `requests.exceptions.Timeout`（继承自 `RequestException`）

**最佳实践**：生产代码 timeout **必填**（不要 None）；`connect=3.05s, read=27s` 是 Twilio 推荐值（3.05 略大于 3 秒的 TCP 重传窗口）；加 hook 在 timeout 时记录 `request.url` 方便排查。

### 模式 17：Session 配置热更新

**问题场景**：登录后拿到 token，要"之后所有请求都带 Authorization"；业务想"运行时换 baseURL"。

**解决方案**：`Session.headers` / `Session.cookies` / `Session.auth` 都是可变 dict/list，运行时改下次请求生效（`merge_setting` 重新跑一遍）。

```python
s = requests.Session()
s.headers.update({'User-Agent': 'my-app/1.0'})
# 登录后注入 token
s.headers['Authorization'] = f'Bearer {token}'
# 改 baseURL
s.headers['Host'] = 'api.v2.example.com'
# 临时去 auth（None = 删除）
s.get(url, headers={'Authorization': None})
# 关 SSL 校验（仅 dev）
s.verify = False
```

**关键参数**：
- `Session.headers`：`CaseInsensitiveDict`（HTTP header 大小写不敏感）
- `Session.cookies`：`RequestsCookieJar`（跨请求持久）
- `Session.verify`：SSL 证书校验（默认 `True`）
- `Session.cert`：客户端证书路径（mTLS）

**最佳实践**：登录后用 `s.headers['Authorization'] = ...` 而非每个请求都传；dev 环境 `s.verify = False` 配警告忽略；用 `s.headers.update({...})` 一次性加多个。

### 模式 18：测试体系（pytest + httpbin + trustme）

**问题场景**：测试 HTTP 客户端要 mock server、生成自签证书、覆盖 TLS 过期/mTLS/正常三种场景。

**解决方案**：requests 仓库用 pytest + pytest-httpbin（httpbin 集成）+ trustme（自签证书）+ certs/ 目录（expired/mtls/valid 三套）。每个 PR 跑多 Python 版本 + pyright strict + ruff。

```bash
# 装测试依赖
pip install -e ".[socks]"
pip install -r requirements-dev.txt
# 跑测试
pytest tests/ -x -v
pytest --cov=requests
# typecheck（pyright strict）
pyright src/requests
# lint
ruff check .
# 文档 doctest
pytest --doctest-modules src/requests
```

**关键参数**：
- pytest + pytest-xdist（并行）
- pytest-httpbin：httpbin 集成
- trustme：自签证书生成
- certs/ 目录：expired / mtls / valid 三套
- pyright strict：v2.34 起所有 public API 有 inline 类型
- CI matrix：lint（ruff）/ typecheck（pyright）/ run-tests / zizmor（GitHub Actions 安全扫描）/ publish

**最佳实践**：mock 用 `responses` / `requests-mock`（不是 unittest.mock patch）；自签证书用 trustme 生成（不写死）；CI 跑多个 Python 版本（3.10 ~ 3.15）。

### 模式 19：mock 与录播（responses / vcrpy）

**问题场景**：单元测试不想真发 HTTP（CI 跑慢、依赖外网、不可重复）；集成测试想"用真实 server 跑一次，录制下来回放"。

**解决方案**：
- **responses**：装饰器模式 mock 任意 URL，DSL 简单
- **vcrpy**：录制真实 HTTP 流量到 YAML（cassette），下次从 cassette 读
- **requests-mock**：pytest fixture 风格

```python
# responses 写法
import responses, requests
@responses.activate
def test_user():
    responses.add(responses.GET, 'https://api.github.com/user',
                  json={'login': 'octocat'}, status=200)
    r = requests.get('https://api.github.com/user')
    assert r.json()['login'] == 'octocat'

# vcrpy 写法（先录后放）
import vcr
@vcr.use_cassette('fixtures/user.yaml')
def test_user():
    r = requests.get('https://api.example.com/user')  # 首次走网络，之后走 cassette
    assert r.status_code == 200
```

**关键参数**：
- `responses.activate` 装饰器：拦截 requests 发出的所有请求
- `vcr.use_cassette(path)`：录到 YAML/JSON
- `match_querystring` / `match_headers`：精确匹配
- 重放模式：`record_mode='none'`（仅重放）/`'once'`（录一次）

**最佳实践**：单元测试用 `responses`（DSL 简单）；集成测试用 `vcrpy`（真实流量录制）；CI 用 `record_mode='none'` 强制不联网。

### 模式 20：同类对比与选型（urllib / httpx / aiohttp）

**问题场景**：requests / httpx / aiohttp / urllib3 选谁？同步 vs 异步怎么权衡？

**解决方案**：
- **urllib (stdlib)**：能跑但难用（query string、auth、cookie 全手写），99% 场景不要用
- **requests**：同步、阻塞、易用，统治 Python 生态 15 年；非并发场景默认选
- **httpx**：sync + async 同一 API（基于 httpcore）；新项目默认
- **aiohttp**：仅 async，并发性能好；复杂但生态强
- **urllib3**：底层库，requests 依赖它；不直接用

```python
# requests 同步（默认）
r = requests.get(url)
# httpx sync（同 API，可平滑迁移）
r = httpx.get(url)
# httpx async
async with httpx.AsyncClient() as client:
    r = await client.get(url)
# aiohttp（async-only）
async with aiohttp.ClientSession() as session:
    async with session.get(url) as r:
        text = await r.text()
```

**关键参数**：
- requests：同步阻塞，session 复用，API ★★★★★
- httpx：sync + async 双模，HTTP/2 支持，API ★★★★☆
- aiohttp：仅 async，并发性能 ★★★★★，API ★★★☆☆
- 性能（并发）：aiohttp/httpx > requests
- 生态：requests > httpx > aiohttp

**最佳实践**：脚本/SDK 二次封装用 requests（生态好）；新项目考虑 httpx（async-ready）；高并发爬虫用 aiohttp；不要混用（一个项目只一个 HTTP 客户端）。

---

## 附录：5 段必读代码

1. `src/requests/api.py:67-71` — `with sessions.Session() as s:` 包裹模块函数（连接管理 + 易用性）
2. `src/requests/sessions.py:870-879` — `get_adapter()` 前缀循环（传输路由 7 行）
3. `src/requests/adapters.py:710-746` — `HTTPAdapter.send` 异常重翻译（`isinstance(e.reason, ...)`）
4. `src/requests/models.py:481-561` — `PreparedRequest.prepare_url` 7 道 URL 防线
5. `src/requests/auth.py:273-319` — `HTTPDigestAuth.handle_401` 状态机（`seek()/content/copy()/send()`）

## 一句话总结

requests = 模块函数 + Session 双层 API + Adapter 前缀路由 + 异常重翻译，3500 行核心 + urllib3 抽象，把"Python 调 HTTP"变成 7 个动词 + 一个 Session 状态机；200+ release 的沉淀让它成为 Python 生态事实标准，新项目可考虑 httpx（async-ready），但 requests 的 `Session/Adapter/Hooks` 三扩展点设计是所有 HTTP SDK 必偷的范式。
