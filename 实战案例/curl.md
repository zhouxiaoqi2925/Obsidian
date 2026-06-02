# curl - 工业级网络传输

**来源**：G:\实战案例\GitHub顶尖项目\curl\
**创建时间**：2026-06-02

---

## 一、核心机制

### 1. URL 状态机解析（URL State Machine）

**问题场景**：curl 需要支持 26+ 种协议（HTTP、FTP、SFTP、SMTP、IMAP、POP3、WebSocket、MQTT、GOPHER、RTMP…），每种协议的 URL 语法都有细微差别（userinfo 位置、端口默认值、转义规则）。如果用正则或字符串 split 解析，必然走进 if/else 地狱，且难以处理 RFC 3986 的"相对 URL 解析"和"片段标识符（fragment）"的剥离问题。30 年前 curl 起步时只有 httpget，协议爆炸后必须有一个统一的 URL 解析内核。

**解决方案**：
```c
/* lib/url.c::parseurlandfillconn() 核心循环（C 风格伪代码） */
typedef enum {
  UWR_INIT, UWR_SCHEME, UWR_HOST, UWR_PORT,
  UWR_PATH, UWR_QUERY, UWR_FRAGMENT, UWR_DONE
} URLWRState;

static CURLcode parseurlandfillconn(struct Curl_easy *data,
                                     char *url) {
  URLWRState state = UWR_INIT;
  char *p = url;
  while(state != UWR_DONE && *p) {
    switch(state) {
    case UWR_INIT:
      if(ISALPHA(*p)) state = UWR_SCHEME;
      else FAIL(CURLE_URL_MALFORMAT);
      break;
    case UWR_SCHEME:
      /* "://" 出现 → 进入 host */
      if(match(p, "://")) { p += 3; state = UWR_HOST; }
      break;
    case UWR_HOST:
      /* 解析 [ipv6]:port 形态 */
      if(*p == '[') parse_ipv6_brackets(...);
      if(*p == ':') { port = parse_port(p+1); state = UWR_PATH; }
      break;
    case UWR_PATH:
      /* fragment 在这里是 # 后丢弃 */
      if(*p == '#') { p = end_of_str; state = UWR_DONE; }
      break;
    }
    p++;
  }
  return CURLE_OK;
}
```
`lib/url.c` 3060 行维护的就是这台状态机，外加 RFC 3986 百分号编码、`punycode` IDN、IPv6 zone id、userinfo base64 等所有边角。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| URL 最大长度 | 8192 字节（默认 buffer） | 过长会动态扩容 |
| 状态机深度 | ≤ 8 | URLRFC 实际只有 scheme→authority→path→query→fragment |
| IDN 编码 | punycode | curl 默认开 `CURLOPT_IDN` |
| 协议白名单 | 编译期 `--with-{http,ftp,ssh}` | 不在白名单直接拒 |
| 路径字符 | RFC 3986 unreserved + 3 个保留子集 | 超出走 percent-encoding |

**最佳实践**：
1. ✅ 用状态机替代正则：状态机可单步调试、可静态验证（每个字符只走一条路径）
2. ✅ fragment 必须在解析阶段就剥离：fragment 永远不应该发到服务器（curl 在 UWR_PATH 状态就 `*p = 0` 截断）
3. ✅ 协议相关字段（端口默认值、userinfo 位置）下沉到 `urldata.h` 的 `Curl_handler[]` 表
4. ✅ 错误用 `CURLcode` 枚举（100+ 错误码），不靠 errno：errno 在多线程下不安全
5. ✅ 解析失败立即释放 `Curl_easy`，不留半结构半残骸

### 2. Easy/Multi 双层句柄抽象（Dual-Handle Abstraction）

**问题场景**：初学者用 libcurl 最常问"easy 和 multi 是什么关系"。答案是：easy = 一个 HTTP 传输的同步句柄，multi = 多个 easy 的事件循环容器。设计两层句柄是为了让"同步阻塞"和"异步多路"在 API 层完全分离 —— 同步用户只看到 `curl_easy_perform`，异步用户只看到 `curl_multi_perform`，互不污染。30 年演进中 libcurl 加了 100+ 协议、13+ TLS 后端，但 easy/multi 这对核心 API 从未动过。

**解决方案**：
```c
/* lib/easy.c + lib/multi.c 的协作模型（伪代码） */
struct Curl_easy {
  uint32_t magic;        /* 0xc0dedbad 防 UAF */
  struct Curl_multi *multi;  /* 可选：加入 multi 才赋值 */
  struct UserDefined set;    /* 300+ curl_easy_setopt 选项 */
  struct DynamicStatic cfg;
  struct UrlState state;
  /* ... 200+ 字段 */
};

struct Curl_multi {
  uint32_t magic;        /* 0x000bab1e */
  Curl_uint32_bset process, pending, dirty, msgsent;  /* 4 个位图 */
  struct Curl_easy *admin;  /* multi 自身的内部 easy */
  Curl_llist easy;        /* 已加入的 easy 链表 */
  Curl_hash conncache;    /* 连接池 */
};

/* 同步用户路径 */
CURL *h = curl_easy_init();
curl_easy_setopt(h, CURLOPT_URL, "https://api.example.com");
curl_easy_perform(h);   /* 内部封装成 mini multi，串行等结果 */
curl_easy_cleanup(h);

/* 异步用户路径 */
CURLM *m = curl_multi_init();
curl_multi_add_handle(m, h);
do {
  curl_multi_wait(m, NULL, 0, 1000, &numfds);
  curl_multi_perform(m, &running);
  /* 读消息 → 取结果 */
} while(running > 0);
```
`curl_easy_perform` 内部其实就是开一个临时 multi handle 跑一次 `curl_multi_perform`，再加同步等待 —— 这种"同步是异步的特例"设计让两条 API 共享 100% 引擎代码。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Easy handle 池 | 业务并发数 × 1.2 | 多余 20% 留给重试 |
| Multi 并发上限 | 512（位图容量） | 超过需 multi-pool 多实例 |
| magic 值 | easy: 0xc0dedbad / multi: 0x000bab1e | 调试用魔法数，release 不检查 |
| CURLOPT_MAXCONNECTS | ≥ 实际并发数 | 连接池大小 |
| admin handle | 1 个/multi | multi 自身用，标记 `internal=TRUE` |

**最佳实践**：
1. ✅ easy handle 不跨线程共享：所有 `curl_easy_*` 必须在同一线程（除非配 TLS provider mutex）
2. ✅ multi handle 可跨线程调用：但同一时刻只能一个线程调 `curl_multi_perform`，其他线程调 `curl_multi_add_handle/remove`
3. ✅ 短生命周期场景用 easy（脚本、单次请求）；高并发场景用 multi（Crawler、Fan-out）
4. ✅ `curl_easy_cleanup` 前确认无 `CURLOPT_PRIVATE` 指针泄漏：cleanup 不会自动 free 用户数据
5. ✅ 用 `CURLOPT_PRIVATE` 关联业务对象 + `CURLMOPT_TIMERFUNCTION` 注入超时

### 3. MSTATE 多状态机驱动（Multi State Machine）

**问题场景**：multi 接口要管理 512 个并发 transfer，每个 transfer 又要经过"建连 → TLS 握手 → 发送请求 → 收响应头 → 收 body → 关闭"5+ 步。如果用标志位（`connecting / sending / receiving`），散落赋值会漏清理；用回调嵌套又太深。curl 用一个 15 状态的 enum + 集中 `mstate()` 函数，让所有状态变更必经单一通道，DEBUGBUILD 还能附 `__LINE__` 便于调试。

**解决方案**：
```c
/* lib/multi.c::mstate() 状态机唯一入口（精简） */
typedef enum {
  MSTATE_INIT, MSTATE_PENDING, MSTATE_SETUP,
  MSTATE_CONNECT, MSTATE_CONNECTING, MSTATE_PROTOCONNECT,
  MSTATE_DO, MSTATE_DOING, MSTATE_DOING_MORE,
  MSTATE_DID, MSTATE_PERFORMING, MSTATE_RATELIMITING,
  MSTATE_DONE, MSTATE_COMPLETED, MSTATE_MSGSENT, MSTATE_LAST
} CURLMstate;

/* 状态进入时一次性调用 */
static const init_multistate_func finit[MSTATE_LAST] = {
  NULL, NULL, NULL,
  Curl_init_CONNECT,   /* CONNECT 触发连接初始化 */
  NULL, NULL, NULL, NULL, NULL, NULL,
  before_perform,     /* DID 触发性能统计 */
  NULL, NULL, NULL, init_completed, NULL
};

static void mstate(struct Curl_easy *data, CURLMstate state
#ifdef DEBUGBUILD
                   , int lineno
#endif
) {
  CURLMstate oldstate = data->mstate;
  data->mstate = state;
  /* 1) 调用进入钩子 */
  if(finit[state] && state != oldstate)
    finit[state](data);
  /* 2) 位图操作：加入 process / 离开 pending */
  if(state == MSTATE_PENDING)
    Curl_uint32_bset_add(&data->multi->pending, data->midx);
  else
    Curl_uint32_bset_remove(&data->multi->pending, data->midx);
  /* 3) 通知观察者（应用层 curl_multi_info_read 拿消息） */
  if(state == MSTATE_DONE || state == MSTATE_COMPLETED)
    Curl_multi_mark_dirty(data);
}

/* release 用 */
#define multistate(x, y) mstate(x, y)
/* debug 用，记录状态切换的代码行号 */
#define multistate(x, y) mstate(x, y, __LINE__)
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 状态数 | 15 | MSTATE_LAST 决定位图宽度 |
| 位图容量 | 512（`CURL_XFER_TABLE_SIZE`） | O(1) 找空闲槽 |
| 状态切换耗时 | < 1µs | release build 关闭 DEBUGBUILD 提性能 |
| 状态机栈深度 | 0（无嵌套） | 状态切换是平移，不是 push/pop |
| debug 开关 | DEBUGBUILD 宏 | 编译期决定是否带行号 |

**最佳实践**：
1. ✅ 状态变更永远走 `multistate()` 宏：不要 `data->mstate = X` 散落赋值
2. ✅ 进入新状态时做一次性 init（`finit[]` 表）：比如 CONNECT 状态触发 `Curl_init_CONNECT`
3. ✅ DEBUGBUILD 注入 `__LINE__`：UAF 或状态错乱时直接看是哪个文件哪一行
4. ✅ 位图代替链表：O(1) 找空闲槽 + L1 cache 友好
5. ✅ 状态退出时清理：MSTATE_COMPLETED 调用 `init_completed` 关连接、回池

### 4. Magic Number UAF 防御（Magic Number Guard）

**问题场景**：C 语言没有 RAII，pointer 释放后还能继续 deref 是 UAF（use-after-free）。多线程 + 长生命周期的 multi handle 上，某个 easy handle 可能在被另一个线程 free 后仍被传进 `curl_easy_perform`，结果直接段错误。valgrind / ASan 能在事后抓到，但生产环境没这些工具。curl 的解法是在每个 handle 第一个字段放一个"魔法数"，debug build 立即 assert，release build 零开销。

**解决方案**：
```c
/* include/curl/curl.h + lib/urldata.h */
#define CURLEASY_MAGIC_NUMBER  0xc0dedbad
#define CURL_MULTI_HANDLE      0x000bab1e

struct Curl_easy {
  uint32_t magic;  /* 第一个字段！ */
  /* ... 200+ 字段 */
};

struct Curl_multi {
  uint32_t magic;
  /* ... */
};

/* debug 模式：每个 API 入口断言 */
CURLcode curl_easy_perform(CURL *easy) {
  struct Curl_easy *data = (struct Curl_easy *)easy;
  DEBUGASSERT(data->magic == CURLEASY_MAGIC_NUMBER);
  /* ... */
}

/* 释放时主动清零 */
void Curl_close(struct Curl_easy **pdata) {
  struct Curl_easy *data = *pdata;
  DEBUGASSERT(data->magic == CURLEASY_MAGIC_NUMBER);
  /* 释放所有内部资源 */
  data->magic = 0;  /* ← 关键：灭灯后再让 ptr 失效 */
  free(data);
  *pdata = NULL;
}
```
魔法数 0xc0dedbad（"code dead BAD" 倒读）和 0x000bab1e（"able"，好记）都是看一遍忘不掉的。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Easy magic | 0xc0dedbad | 0xC 0x0D 0xED 0xBA D，编码感 |
| Multi magic | 0x000bab1e | 0x000B AB1E，吃不下 |
| 字段位置 | struct 第 0 字段 | UAF 时第一字节就错 |
| Release 行为 | 全部跳过 | 零开销 |
| Debug 行为 | assert + abort | 立即崩溃，便于抓现场 |

**最佳实践**：
1. ✅ 魔法数放在 struct 第 0 个字段：UAF 误用时第一字节就坏，命中率高
2. ✅ release 关闭、debug 开启：release build 性能零损失
3. ✅ 选有"语义"的魔法数：0xDEADBEEF 这种俗套的不如 0xc0dedbad 有"BAD 倒读"含义
4. ✅ 释放后清零：debug 时 `data->magic = 0`，下次 UAF 触发断言而不是段错误（段错误堆栈可能不友好）
5. ✅ 配套 type-safe wrapper（C++）：提供 `EasyHandle` RAII 类，构造检查 magic、析构 reset
6. ✅ 不要用类型转换绕过：魔法数就是放弃类型安全的代价，要明确告知团队

### 5. 多协议策略表（Protocol Strategy Table）

**问题场景**：curl 要支持 26+ 协议，每种协议有不同的"默认端口、连接方式、是否需要 TLS 后端、是否支持 userinfo"。如果写 26 个 `if(scheme=="http") ... else if(scheme=="https") ...`，加一个新协议要翻几十个地方。curl 把"协议相关的元数据 + 协议处理函数"集中到 `urldata.h` 的 `Curl_handler[]` 数组，每个协议一项，新增协议只改一处。

**解决方案**：
```c
/* include/curl/curl.h + lib/url.c */
struct Curl_handler {
  const char *name;             /* "HTTP", "HTTPS", "FTP" ... */
  unsigned int scheme_port;     /* 默认端口 CURL_DEFAULT_PORT 表示 80 */
  unsigned int flags;           /* PROTOPT_SSL | PROTOPT_NEEDSPWD ... */
  CURLcode (*setup_connection)(...);   /* 连接前钩子 */
  CURLcode (*connect_it)(...);        /* 协议级连接 */
  int (*do_it)(...);                  /* 业务逻辑（发请求） */
  int (*done)(...);                   /* 业务收尾（读响应） */
  int (*disconnect)(...);             /* 断开连接 */
  /* ... */
};

static const struct Curl_handler protocols[] = {
  {"http",  CURL_DEFAULT_HTTP_PORT, PROTOPT_NONE,
   Curl_http_setup_conn, Curl_http_connect, Curl_http, Curl_http_done,
   Curl_http_disconnect, ...},
  {"https", CURL_DEFAULT_HTTPS_PORT,
   PROTOPT_SSL | PROTOPT_CONN,  /* ← 标记需要 TLS */
   Curl_http_setup_conn, Curl_http_connect, Curl_http, Curl_http_done,
   Curl_http_disconnect, ...},
  {"ftp",   CURL_DEFAULT_FTP_PORT, PROTOPT_NEEDSPWD,
   Curl_ftp_setup_conn, Curl_ftp_connect, Curl_ftp, Curl_ftp_done,
   Curl_ftp_disconnect, ...},
  {"mqtt",  1883, PROTOPT_NOURLQUERY, ...},
  /* ... 26+ 项 */
};

/* 解析完 URL 后查表 */
const struct Curl_handler *p = Curl_parsethis(&data, ...);
data->req.p.http = p;  /* 之后业务逻辑都走 p->do_it */
```
`PROTOPT_SSL` 标志位让协议自动联动 TLS 后端；`PROTOPT_NEEDSPWD` 标志位让工具层自动启用密码输入。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 协议表项数 | 26+ | 每个协议一项 |
| 标志位 PROTOPT_* | 7 种 | SSL / NEEDSPWD / CONN / NOURLQUERY / ... |
| 函数指针 | 6-8 个/项 | setup / connect / do / done / disconnect |
| 协议名格式 | 大写 | "HTTP", "HTTPS"，方便字符串比对 |
| 编译期裁剪 | `--with-{http,ftp,ssh}` | 不在白名单的协议编译期排除 |

**最佳实践**：
1. ✅ 协议元数据 + 协议逻辑分离：元数据进 `Curl_handler` 表，逻辑进独立 `.c` 文件
2. ✅ 标志位驱动横切关注点：PROTOPT_SSL 自动联动 TLS，PROTOPT_NEEDSPWD 自动开密码输入
3. ✅ 新协议 = 新文件 + 表里加一行：不要在 `url.c` 加 if/else
4. ✅ 默认端口放表里：HTTP→80、HTTPS→443、FTP→21，新协议别忘了
5. ✅ 用 `PROTOPT_*` 位图：扩展新属性不用改 struct 签名

## 二、架构设计

### 6. Connection Filter 链（Connection Filter Chain）

**问题场景**：libcurl 8+ 之前，连接层是"socket + 一堆函数指针 + if(scheme==HTTPS)"散落在 `connectdata` 结构里。加 HTTP/3 时发现要处理 QUIC、加 SOCKS 代理时要处理 CONNECT、加 Happy Eyeballs 时要并行起 IPv4/IPv6 —— 旧的 if/else 已经无法承载。libcurl 8 重构成"连接过滤器链"：每个过滤器做一件事（TLS、代理、Happy Eyeballs、HTTP 版本），用链表堆叠，加新特性只需写一个新过滤器。

**解决方案**：
```c
/* lib/cfilters.c + lib/cf-*.c */
struct Curl_cfilter {
  const struct Curl_cftype *cft;  /* 虚函数表 */
  void *ctx;                       /* 自身状态 */
  struct Curl_cfilter *next;       /* 下一级 */
  BIT(connected);
  BIT(shutdown);
};

struct Curl_cftype {
  const char *name;                /* "cf-socket", "cf-h2-proxy" ... */
  CURLcode (*do_connect)(struct Curl_cfilter *cf, struct Curl_easy *data);
  CURLcode (*do_send)(struct Curl_cfilter *cf, ...);
  CURLcode (*do_recv)(struct Curl_cfilter *cf, ...);
  CURLcode (*do_do_shutdown)(struct Curl_cfilter *cf, ...);
  bool (*has_data_pending)(struct Curl_cfilter *cf, ...);
  CURLcode (*keep_alive)(struct Curl_cfilter *cf, ...);
  /* ... */
};

/* 实际链路（应用 → 网络） */
APP[curl_easy_perform]
  → cf-https-connect  (HTTPS CONNECT 代理隧道)
  → cf-happy-eyeballs (IPv4/IPv6 赛马)
  → cf-socket         (原始 TCP/UDP)
  → cf-h2-proxy       (HTTP/2 代理)
  → cf-h2 / cf-h3     (应用协议)
  → NET
```

每个过滤器提供 6+ 个虚函数；新增协议/代理只需写一个 `cf-*.c`。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 链表深度 | ≤ 7 | 太多层调试难 |
| 虚函数 | 6-8 个 | connect/send/recv/shutdown/keep_alive/has_data_pending |
| shutdown 方向 | 外→内 | 从应用端先关，再到 socket |
| 错误传递 | CURLcode 透传 | 底层错误一路冒泡到应用层 |
| 协议升级 | cf-socket 装饰 | Happy Eyeballs 是装饰器模式 |

**最佳实践**：
1. ✅ 过滤器实现统一接口（`Curl_cftype`）：不要每个 cf 自己一套 API
2. ✅ shutdown 沿链从外到内：先关应用层再关 socket，避免"半关"
3. ✅ pollset 沿链累加：每个 cf 把自己的 fd 加进 poll 集合
4. ✅ 新协议/代理 = 写个 `cf-*.c` + 在表里注册：不要改 `connectdata`
5. ✅ `ctx` 字段保存过滤器自身状态：避免全局变量污染
6. ✅ 用 `connected` / `shutdown` 标志位跟踪状态：避免重复 connect / 漏 shutdown

### 7. TLS 后端抽象层（TLS Backend Abstraction）

**问题场景**：不同部署环境要不同 TLS 实现：Linux 装 OpenSSL、嵌入式装 mbedTLS、Windows 用 Schannel、苹果用 SecureTransport、Rust 生态用 Rustls。每种实现 API 都不一样（`SSL_CTX_new` vs `mbedtls_ssl_init` vs `SslCreateContext`）。如果业务代码直接调某一家的 API，移植就崩。curl 在 `lib/vtls/` 下做了统一抽象 —— 所有 TLS 后端都实现 `Curl_ssl` 虚表，OpenSSL/GnuTLS/wolfSSL/mbedTLS/Schannel/Rustls/BearSSL/SecureTransport 13 家平起平坐。

**解决方案**：
```c
/* lib/vtls/vtls.c + lib/vtls/openssl.c 等 */
struct Curl_ssl {
  const char *name;                       /* "OpenSSL", "GnuTLS" ... */
  CURLcode (*init)(void);                 /* 全局 init */
  void (*cleanup)(void);
  CURLcode (*create_ssl_data)(...);       /* 创建 SSL handle */
  CURLcode (*connect_nonblocking)(...);   /* 非阻塞握手 */
  CURLcode (*recv)(...);                  /* 走 TLS 通道读 */
  CURLcode (*send)(...);                  /* 走 TLS 通道写 */
  size_t (*primary_checksum_length)(...); /* 证书摘要 */
  /* ... 30+ 虚函数 */
};

/* 全局单例：编译期选定，运行时不变 */
const struct Curl_ssl *Curl_ssl = &Curl_ssl_openssl;  /* 默认 OpenSSL */
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 后端数 | 13+ | OpenSSL / GnuTLS / wolfSSL / mbedTLS / Schannel / SecureTransport / BearSSL / Rustls / ... |
| 编译期选择 | `--with-{openssl,gnutls,wolfssl,...}` | 互斥，默认 OpenSSL |
| 虚函数 | 30+ | init / cleanup / connect / recv / send / cert_verify / ... |
| 证书校验 | 统一走 `Curl_ssl_verify_host` | 屏蔽各后端 API 差异 |
| SNI 默认 | 开启 | 匹配请求的 host |

**最佳实践**：
1. ✅ 选 TLS 后端看目标平台：Linux→OpenSSL、Windows→Schannel、嵌入式→mbedTLS/Rustls
2. ✅ 不要直接调后端 API：业务代码永远走 `Curl_ssl->xxx` 虚函数
3. ✅ 证书链校验交给 TLS 后端：curl 不重复实现 PKI 校验
4. ✅ ECH（加密 SNI）2024+ 默认开启：依赖后端支持（OpenSSL 3.2+、Rustls 0.22+）
5. ✅ 失败时回退到明文 HTTP/2 协议：避免硬失败
6. ✅ 弱加密（RC4、3DES）在 `ssl.c` 集中禁：避免散落各后端处理

### 8. 工具层 / 库层分离（Tool / Lib Separation）

**问题场景**：curl 既是单文件可执行（`curl` CLI），也是可嵌入 C 库（libcurl）。如果业务代码和 CLI 代码混在一起，改命令行选项就要重新编库，库的 ABI 兼容性会崩。curl 把 `src/`（CLI）和 `lib/`（库）严格隔离：CLI 解析命令行、调用 libcurl API、格式化输出；库只提供 C API，不依赖任何 CLI 概念。`src/tool_*.c` 42 个文件全靠 libcurl，不许反向依赖。

**解决方案**：
```
src/  (42 个 tool_*.c)
  tool_main.c       main()
  tool_operate.c    2528 行的操作主循环
  tool_getparam.c   100KB 命令行解析
  tool_cb_*.c       各种 libcurl 回调桥

lib/  (190+ 个 .c) — 仅供 libcurl 嵌入方使用
  url.c             easy handle 生命周期
  transfer.c        数据收发
  multi.c           事件循环
  setopt.c          300+ 选项入口
  vtls/             TLS 后端
  vquic/            QUIC 后端
  vssh/             SSH 后端
  cf-*.c            连接过滤器
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 库源文件数 | 190+ | 持续增长 |
| 工具源文件数 | 42 | tool_*.c |
| 库头文件 | curl/curl.h | 唯一公开 API |
| 工具源文件最大 | tool_getparam.c 106KB | 命令行解析 |
| 库源文件最大 | openss.c 178KB | OpenSSL 后端适配 |

**最佳实践**：
1. ✅ 库层不引入 CLI 概念：库不知道什么是"终端"、"进度条"
2. ✅ 工具层 100% 走 libcurl API：工具不调 `socket()`、`SSL_CTX_new()` 等底层 API
3. ✅ 头文件分层：`curl/curl.h`（公开） + `urldata.h`（库内部）
4. ✅ 工具层可以引入新回调：比如 `tool_cb_*.c` 桥接 `CURLOPT_WRITEFUNCTION`
5. ✅ 库版本号（LIBCURL_VERSION）独立于 CLI 版本号：嵌入方能锁定库版本

### 9. 协议模块化（Protocol Modularization）

**问题场景**：26+ 协议各自独立（HTTP/1.1、HTTP/2、HTTP/3、FTP、SFTP、SMTP、IMAP、POP3、MQTT、WebSocket、RTMP、GOPHER…）。如果所有协议代码塞进 `protocol.c` 一个文件，5 万行起步，新人改一行崩溃。curl 的解法是"每协议一个目录/文件族"：`http.c` / `http2.c` / `http3.c` / `ftp.c` / `imap.c` / `smtp.c` / `pop3.c` / `mqtt.c` / `ws.c` / `ssh.c`……加新协议只动一个目录。

**解决方案**：
```c
/* 协议模块的统一挂载点 */
struct Curl_handler protocols[] = {
  /* HTTP 家族共享 http.c */
  {"HTTP",  CURL_DEFAULT_HTTP_PORT,  PROTOPT_NONE,
   Curl_http_setup_conn, Curl_http_connect, Curl_http_do,
   Curl_http_done, Curl_http_disconnect},
  {"HTTPS", CURL_DEFAULT_HTTPS_PORT, PROTOPT_SSL | PROTOPT_CONN,
   Curl_http_setup_conn, Curl_http_connect, Curl_http_do,
   Curl_http_done, Curl_http_disconnect},
  /* FTP 家族走 ftp.c */
  {"FTP",   21, PROTOPT_NEEDSPWD,
   Curl_ftp_setup_conn, Curl_ftp_connect, Curl_ftp_do,
   Curl_ftp_done, Curl_ftp_disconnect},
  {"FTPS",  21, PROTOPT_SSL | PROTOPT_NEEDSPWD,
   Curl_ftp_setup_conn, Curl_ftp_connect, Curl_ftp_do,
   Curl_ftp_done, Curl_ftp_disconnect},
  /* 等等 */
};
```
每个协议模块只实现 `setup_connection / connect_it / do_it / done / disconnect` 5 个钩子，HTTP 和 HTTPS 共享 `Curl_http_*` 实现，TLS 后端通过 `PROTOPT_SSL` 标志位自动联动。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 协议数 | 26+ | 仍在增长（MQTT 2022 加入） |
| HTTP 家族 | HTTP/1.1 + HTTP/2 + HTTP/3 | 共享 `Curl_http_*` 业务逻辑 |
| SMTP/POP3/IMAP 家族 | 邮件协议 | 共享 SASL 认证 |
| SSH/SCP/SFTP 家族 | vssh/ | 共享 libssh2 后端 |
| QUIC 家族 | vquic/ | 多后端 nghttp3/ngtcp2/msquic |

**最佳实践**：
1. ✅ 每协议一个文件族：`http.c` / `ftp.c` / `mqtt.c` 等
2. ✅ HTTP/1.1、HTTP/2、HTTP/3 共享业务逻辑：只换协议解析器
3. ✅ TLS 通过 `PROTOPT_SSL` 标志位联动：不要每个协议自己处理 SSL
4. ✅ 协议模块对外只暴露 5 个钩子：setup/connect/do/done/disconnect
5. ✅ 新协议编译期可裁剪：`--with-mqtt`、`--with-gopher`
6. ✅ 协议模块不直接调 socket：所有 IO 走 connection filter

### 10. setopt 路由表（setopt Routing）

**问题场景**：libcurl 有 300+ `CURLOPT_*` 选项（超时、header、cookie、proxy、TLS 版本、HTTP 方法、回调、限速……）。如果 `curl_easy_setopt` 写成一个 300 分支的 switch，加一个新选项要重新编全库。curl 的解法是用 C99 的"designated initializer 数组"做路由表 —— 选项 ID → 处理函数，O(1) 查表 + 可静态校验。

**解决方案**：
```c
/* lib/setopt.c */
struct compare {
  const char *name;       /* 调试用名 */
  CURLoption id;          /* CURLOPT_* 数值 */
  unsigned int param;     /* 参数类型：STRING / LONG / OBJECT / OFF_T */
  CURLcode (*set)(struct Curl_easy *data, unsigned int param, va_list ap);
};

static const struct compare setopts[] = {
  {"CURLOPT_URL",             CURLOPT_URL,             STRING,
   setstropt_string},
  {"CURLOPT_TIMEOUT",         CURLOPT_TIMEOUT,         LONG,
   setstropt_long},
  {"CURLOPT_WRITEFUNCTION",   CURLOPT_WRITEFUNCTION,   FUNCTION,
   setstropt_func},
  {"CURLOPT_HTTPHEADER",      CURLOPT_HTTPHEADER,      OBJECT,
   setstropt_obj},
  /* ... 300+ 项 ... */
};

CURLcode curl_easy_setopt(CURL *easy, CURLoption tag, ...) {
  va_list ap;
  va_start(ap, tag);
  /* 查表 */
  for(i = 0; setopts[i].id; i++) {
    if(setopts[i].id == tag) {
      CURLcode rc = setopts[i].set((struct Curl_easy *)easy, setopts[i].param, ap);
      va_end(ap);
      return rc;
    }
  }
  va_end(ap);
  return CURLE_UNKNOWN_OPTION;
}
```
新增选项 = 在表里加一行 + 写一个 setter 函数。300+ 选项集中管理，便于文档生成（curl-config）。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 选项数 | 300+ | 持续增长 |
| 参数类型 | 6 种 | STRING / LONG / OBJECT / FUNCTION / OFF_T / BLOB |
| 表查询 | 线性扫描 | O(N) 但 N=300，缓存友好 |
| 性能 | ~50ns/次 | 实际瓶颈不在 setopt |
| 错误码 | CURLE_UNKNOWN_OPTION | 选项未知时返回 |

**最佳实践**：
1. ✅ 用表 + 函数指针替代 switch：扩展性 + 静态校验
2. ✅ 选项 ID 用 enum 连续：方便 binary search（curl 用了线性，足够用）
3. ✅ 参数类型字段化：setter 内部用 `va_arg(ap, type)` 强转
4. ✅ 未知选项返回明确错误：CURLE_UNKNOWN_OPTION
5. ✅ 文档自动生成：`curl-config --feature` 列出所有支持的选项
6. ✅ 选项 setter 内做范围校验：负超时、超大 buffer 立即拒

## 三、性能优化

### 11. 限速 stutter 早退（Rate-Limit Stutter）

**问题场景**：用户用 `CURLOPT_MAX_RECV_SPEED_LARGE` 限速（比如下载到磁盘，避免打满 IO），如果 curl 一直读 socket 会瞬间超速。简单做法是"读 1 字节"省速，但 syscall 开销大、CPU 飙升。curl 8+ 的 stutter 策略是：发现配额用完时直接 `break` 退出 transfer 循环，让出 CPU 给 `curl_multi_perform`，等配额恢复再继续。stutter 牺牲一点平滑度换 CPU 效率。

**解决方案**：
```c
/* lib/transfer.c::sendrecv_dl() */
if(bytestoread && Curl_rlimit_active(&data->progress.dl.rlimit)) {
  curl_off_t dl_avail = Curl_rlimit_avail(
    &data->progress.dl.rlimit, Curl_pgrs_now(data));
  if(dl_avail <= 0) {
    rate_limited = TRUE;
    break;  /* ← 关键：宁可 stutter 也不能超过配额 */
  }
  if(dl_avail < (curl_off_t)bytestoread)
    bytestoread = (size_t)dl_avail;
}
/* ... 实际 recv() 调用 ... */
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 限速精度 | ~5% 偏差 | 实时调整 vs 平滑度权衡 |
| stutter 频率 | 100ms 级 | 1 个 stutter 周期 |
| 配额检查时机 | 每次 recv 前 | 而不是定时器 |
| 配对选项 | MAX_RECV_SPEED_LARGE / MAX_SEND_SPEED_LARGE | 收/发独立限速 |
| 单位 | bytes/sec | 大数值用 OFF_T |

**最佳实践**：
1. ✅ 配额用完 `break` 出去，不 sleep：让 `curl_multi_perform` 重新调度
2. ✅ 限速和"读 1 字节"二选一：限速更适合批下载，1 字节读适合流控
3. ✅ 配 `progress_meter` 显示带宽：限速时不要让用户以为"下载卡死"
4. ✅ 应用层也用 `CURLOPT_LOW_SPEED_TIME` / `CURLOPT_LOW_SPEED_LIMIT`：超时保护
5. ✅ 多个 transfer 共用 multi 时限速独立：每个 easy 限速配置独立

### 12. maxloops=10 让出（maxloops Yield）

**问题场景**：单次 `curl_easy_perform` 内部循环读 socket，如果连接正常但应用不收数据，会无限循环占用 CPU。直接 `sleep(1)` 会卡住其他 transfer 的调度；用 `select/poll` 等 IO 又可能错失可读事件。curl 的解法是"maxloops=10"：单次 perform 最多读 10 次就让出，10 次内没读完下次 `curl_multi_perform` 再来。

**解决方案**：
```c
/* lib/transfer.c::sendrecv_dl() */
int maxloops = 10;  /* 写死 */
do {
  /* ... 限速检查 ... */
  /* ... EAGAIN 处理 ... */
  result = Curl_read(conn, sockindex, buf, bytestoread, &nread);
  /* ... 写 buffer / 回调 ... */
  maxloops--;
} while(maxloops > 0);
/* 让出 CPU 给 multi */
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| maxloops | 10 | 写死常量 |
| 单次 read 大小 | 16KB | 16 * 1024，H2 chunk size |
| 退出条件 | 读完 / EAGAIN / 限速 / maxloops=0 | 4 个 |
| 让出粒度 | 10 次 recv() | 1-10ms 级 |

**最佳实践**：
1. ✅ 让出比 sleep 优先：maxloops=0 自然让出，其他 transfer 立刻得到调度
2. ✅ 写死 10 而不是配置：避免用户调到 1 导致性能下降
3. ✅ multiplexed 协议不受 maxloops 限制：HTTP/2 一次 read 拿一帧，OS buffer 满
4. ✅ EAGAIN 立即退出：不要 retry
5. ✅ 配合 `CURLOPT_BUFFERSIZE` 调大 buffer：减少 syscall 次数

### 13. H2 窗口调参（H2 Window Tuning）

**问题场景**：HTTP/2 流控用"窗口"控制两端发送速率。窗口大 = 单流可缓存更多数据 = 高吞吐；窗口小 = 进度条准、内存省。curl 的解法是"故意小初始窗口（64KB），但允许服务端推到 10MB 流窗口 + 100MB 连接窗口"：进度条诚实地"in flight 64KB"，高吞吐时不掉链子。

**解决方案**：
```c
/* lib/http2.c */
#define H2_CHUNK_SIZE              (16 * 1024)         /* 16KB */
#define H2_CONN_WINDOW_SIZE        (10 * 1024 * 1024)  /* 10MB */
#define H2_STREAM_WINDOW_SIZE_MAX  (10 * 1024 * 1024)  /* 10MB */
#define H2_STREAM_WINDOW_SIZE_INITIAL (64 * 1024)       /* 64KB - 故意小 */
/* 巨型连接窗口：解决 #10988 流被暂停时连接配额被卡 */
#define HTTP2_HUGE_WINDOW_SIZE     (100 * H2_STREAM_WINDOW_SIZE_MAX)
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Chunk size | 16KB | 单次读 16KB |
| Conn window | 10MB | 连接级窗口 |
| Stream window max | 10MB | 单流最大 |
| Stream window initial | 64KB | 故意小，进度条诚实 |
| Huge window | 100 × stream_max | 防流暂停僵死 |

**最佳实践**：
1. ✅ 初始窗口小一点：进度条要诚实
2. ✅ 连接窗口远大于流窗口之和：避免流暂停卡住整连接
3. ✅ SETTINGS 帧在 `populate_settings()` 里集中设置
4. ✅ 推送默认关闭：`CURLOPT_PUSH_CALLBACK` 用户注册才开
5. ✅ HTTP/3 类似但用 QUIC 流控：libcurl 8.0+ 内置
6. ✅ 调参要看 issue 跟踪：H2 window 调参常因实际场景 bug 反向调整

### 14. Happy Eyeballs 并行连接（Happy Eyeballs）

**问题场景**：客户端拿到 dual-stack A+AAAA 记录时，传统做法是"先 IPv6，失败回退 IPv4"，IPv6 不可达时用户体验差。Happy Eyeballs 协议（RFC 6555）建议同时起两个连接，IPv6 先跑 250ms，超时就 IPv4 接上。curl 的 `cf-happy-eyeballs` 过滤器实现了完整协议。

**解决方案**：
```c
/* lib/cf-happy-eyeballs.c 简化 */
struct eyeballs {
  struct Curl_cfilter *cf_4;
  struct Curl_cfilter *cf_6;
  CURLcode result_4, result_6;
  bool winner;
};

/* 同时启动 */
cf_happy_eyeballs_connect(...) {
  cf_4 = cf_socket_create(AF_INET);
  cf_6 = cf_socket_create(AF_INET6);
  cf_4->do_connect(cf_4, data);  /* 异步 */
  cf_6->do_connect(cf_6, data);
  /* 等 250ms 后优先看 IPv6 */
  schedule_timer(250ms);
}
/* 250ms 后 IPv6 还没连上 → 推 IPv4 上来 */
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 启动间隔 | 0ms | 同时发起 |
| IPv6 等待 | 250ms | RFC 6555 默认 |
| 失败重试 | 2 次 | IPv6 失败再起 IPv4 |
| DNS 解析 | c-ares 异步 | gethostbyname 同步版不支持 |
| 系统支持 | RFC 6555 全平台 | Linux/macOS/Win/iOS/Android |

**最佳实践**：
1. ✅ 同时发起 IPv4 + IPv6：不要"先试 v6，失败回 v4"
2. ✅ 250ms 窗口期：长到 v6 正常连上，短到用户不察觉
3. ✅ 用 c-ares 异步 DNS：避免 gethostbyname 阻塞事件循环
4. ✅ 选最先 connect() 成功的：不是最先 DNS 解析的
5. ✅ `CURLOPT_IPRESOLVE` 让用户选 v4/v6 双栈：默认 `CURL_IPRESOLVE_WHATEVER`
6. ✅ 失败重试 2 次：网络瞬时抖动不至于整连接失败

### 15. 连接池 + 多路复用（Connection Pool & Multiplexing）

**问题场景**：短连接每次请求都建 TCP + TLS，3 次握手 + TLS 握手 100ms+ 延迟。高并发爬虫会瞬间打满 fd。curl 在 `Curl_hash conncache` 里维护连接池：相同 host+port+protocol+TLS 复用一个 socket；HTTP/2 直接在一个 TCP 上多路复用所有 stream。

**解决方案**：
```c
/* lib/multi.c + lib/url.c */
struct Curl_hash conncache;  /* hash<host:port+protocol+tls, conn> */

/* 多路：HTTP/2 同 host 多个 transfer 复用 1 个 TCP */
curl_easy_setopt(h1, CURLOPT_URL, "https://api.example.com/a");
curl_easy_setopt(h2, CURLOPT_URL, "https://api.example.com/b");
curl_easy_setopt(h3, CURLOPT_URL, "https://api.example.com/c");
curl_multi_add_handle(m, h1);
curl_multi_add_handle(m, h2);
curl_multi_add_handle(m, h3);
/* 内部：3 个 transfer 复用 1 个 TCP，多路发请求 */
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 连接池容量 | `CURLOPT_MAXCONNECTS` ≥ 并发数 | 默认 5 |
| 空闲超时 | `CURLOPT_CONNECTTIMEOUT` | 默认 300s |
| DNS 缓存 | `CURLOPT_DNS_CACHE_TIMEOUT` | 默认 60s |
| 多路协议 | HTTP/2、HTTP/3 | HTTP/1.1 不支持 |
| 哈希 key | scheme + host + port + TLS+ALPN | 唯一标识一个连接 |

**最佳实践**：
1. ✅ 高并发用 multi：multi handle 共享连接池
2. ✅ `CURLOPT_MAXCONNECTS` 调大：避免连接被驱逐
3. ✅ HTTP/2 多路复用：同 host 多 transfer 几乎零开销
4. ✅ 短生命周期 easy 不复用：每请求一个 easy 反而开更多连接
5. ✅ `CURLOPT_DNS_LOCAL_IP4/6` 注入本地 DNS 解析：测试环境很方便
6. ✅ 监控 `CURLINFO_NUM_CONNECTS`：连接建立次数，越少越好

## 四、可靠性与生态

### 16. CI 多平台矩阵（Multi-Platform CI Matrix）

**问题场景**：curl 支持 30+ 操作系统（Linux/BSD/macOS/Windows/Amiga/VMS/Haiku…），13+ TLS 后端，5+ 编译器（gcc/clang/msvc/intel/IBM XL）。如果只在一台机器跑测试，1/5 平台的 bug 永远发现不了。curl 在 CircleCI + GitHub Actions + AppVeyor + Azure Pipelines 上跑完整矩阵：每个 PR 自动触发 N×M×K 个 job。

**解决方案**：
```yaml
# .github/workflows/ci.yml（节选）
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        tls: [openssl, gnutls, wolfssl, mbedtls, rustls, schannel]
        compiler: [gcc, clang, msvc]
        exclude:
          - os: windows-latest
            tls: gnutls
    steps:
      - uses: actions/checkout@v4
      - name: build
        run: ./buildconf && ./configure --with-${{ matrix.tls }} && make -j4
      - name: test
        run: make test-nonflaky
```
单 PR 跑 30+ job 是常态，3-5 分钟内出结果。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 操作系统 | 30+ | Linux/BSD/macOS/Win/Amiga/VMS/Haiku/... |
| TLS 后端 | 13+ | OpenSSL/GnuTLS/wolfSSL/mbedTLS/Schannel/Rustls/... |
| 编译器 | 5+ | gcc/clang/msvc/intel/IBM XL |
| Job 数 | 30+ | 每 PR |
| 失败容忍 | fail-fast: false | 一个平台失败不掩盖其他 |

**最佳实践**：
1. ✅ 全平台矩阵：发现只在一平台出现的 bug
2. ✅ fail-fast: false：避免一个平台失败掩盖其他
3. ✅ 编译警告 = 错误：`-Werror` 强制新代码符合风格
4. ✅ nightly build：master 分支每日构建
5. ✅ AppVeyor 跑 Windows：GitHub Actions 之前 Windows build 能力弱
6. ✅ 测试结果上传到 dash：CI dashboard 跟踪 flaky test

### 17. OSS-Fuzz 模糊测试（Fuzz Testing）

**问题场景**：网络协议解析器是 fuzz 的高危区 —— 攻击者构造畸形 HTTP header 就能让 parser OOM 或 segfault。curl 把 libcurl 的核心函数（`curl_easy_setopt`、`curl_url_set`、`curl_multi_add_handle`）做 fuzz target，提交给 OSS-Fuzz 持续模糊化，2017+ 累计发现 100+ 严重漏洞。

**解决方案**：
```c
/* tests/fuzz/curl_fuzzer.cc（伪代码） */
extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size) {
  CURL *easy = curl_easy_init();
  /* 用 fuzz 输入构造 URL + 选项 */
  curl_easy_setopt(easy, CURLOPT_URL, parse_url_from_fuzz(data, size));
  /* 触发核心解析路径 */
  curl_easy_perform(easy);  /* 期望返回 CURLE_OK 或 CURLE_*，不崩 */
  curl_easy_cleanup(easy);
  return 0;
}
```
OSS-Fuzz 每周跑 10 亿+ 随机输入；发现 crash 立即通知 maintainer。

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Fuzz target 数 | 10+ | `curl_fuzzer`、`curl_fuzzer_http`、`curl_fuzzer_https`... |
| 输入来源 | OSS-Fuzz corpus + 字典 | 协议关键字、状态码、header 名 |
| 发现 bug 数 | 100+ (2017+) | 历史累积 |
| 集成 | OSS-Fuzz 公开项目 | 自动 weekly 跑 |
| 配套工具 | AFL、libFuzzer、honggfuzz | 多 fuzzer 引擎 |

**最佳实践**：
1. ✅ 持续 fuzz 而非一次性：OSS-Fuzz weekly 跑比人工 review 全
2. ✅ 公开 fuzz target：让社区参与
3. ✅ Fuzz coverage 跟踪：哪些代码被覆盖、哪些没
4. ✅ 字典 + 协议 grammar：HTTP 关键字、状态码、header 名
5. ✅ crash 报告 + repro：发现 bug 立即要求提供 reproducer
6. ✅ 集成到 PR check：新代码没 fuzz 通过不允许合并

### 18. Magic Debug-Only 守卫（Debug-Only Magic Guard）

**问题场景**：C 项目用 `assert` 太多 release 关闭后失去 UAF 防御；用 `if(magic != X) abort()` 又污染性能。curl 用 `DEBUGASSERT` 宏 + DEBUGBUILD 编译期开关：debug 全开，release 全关。

**解决方案**：
```c
/* lib/curl_setup.h */
#ifdef DEBUGBUILD
#define DEBUGASSERT(x) assert(x)
#else
#define DEBUGASSERT(x) ((void)(x))  /* release 完全不检查 */
#endif

/* urldata.h + multi.c */
#define CURLEASY_MAGIC_NUMBER  0xc0dedbad
#define CURL_MULTI_HANDLE      0x000bab1e

/* 每次 API 入口检查 */
CURLcode curl_easy_perform(CURL *easy) {
  struct Curl_easy *data = (struct Curl_easy *)easy;
  DEBUGASSERT(data->magic == CURLEASY_MAGIC_NUMBER);
  /* ... */
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 编译期开关 | DEBUGBUILD 宏 | CMake 自动设置 |
| Magic 值 | 0xc0dedbad / 0x000bab1e | 花式编码感 |
| Release 行为 | 完全跳过 | 零开销 |
| Debug 行为 | assert + abort | 立即崩溃 |
| 检查点 | 每个 API 入口 + 内部关键路径 | ~50 处 |

**最佳实践**：
1. ✅ DEBUGBUILD 完全开启：测试覆盖率 = 100% 走检查路径
2. ✅ release 完全关闭：性能零损失
3. ✅ Magic 值放在 struct 第 0 字段：UAF 第一字节命中
4. ✅ 用 C99 宏不是 #if：方便 IDE 跳读
5. ✅ 配套 SIGABRT 处理器：自动 dump core + 输出 magic
6. ✅ 不要滥用：UAF / 类型擦除外少用 magic，会让代码难读

### 19. CVE 披露流程（CVE Disclosure Process）

**问题场景**：curl 被全球数十亿设备使用，任何一个 RCE 漏洞都影响巨大。需要标准化披露流程：发现漏洞 → 私下通知 maintainer → 90 天修复 → 公告日 + 同发 CVE。curl 有专门的 `security@curl.se` 邮箱、`docs/security.html` 公告页、OpenSSL 类似的"credit 列表"。

**解决方案**：
```c
/* 漏洞响应流程（基于 curl.se 公开页面） */
/* 1. 漏洞发现者发邮件到 security@curl.se */
/* 2. maintainer 24h 内确认 + 拉修复 branch */
/* 3. 私下通知 OpenBSD、Debian、Red Hat 等下游 */
/* 4. 修复 commit 合并到 master，标记为待发布 */
/* 5. 90 天（或更短）后发布新版本 + 公告 */
/* 6. 公告页列出 CVE 编号、影响版本、credit */
/* 7. 同时更新 libcurl 文档中 SECURITY.md */
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 报告邮箱 | security@curl.se | 公开 |
| 响应时限 | 24h 确认 | 一周内修复 |
| 公告页 | https://curl.se/docs/security.html | 公开 |
| 公告周期 | 季度 + 紧急 | 不定期 |
| CVE 编号 | MITRE 分配 | 累计 100+ CVE |
| Credit | 公开 | `<reporter>` 名字 |

**最佳实践**：
1. ✅ 专用邮箱 + 公告页：避免公开 issue 暴露未修复漏洞
2. ✅ 90 天 deadline：给 maintainer 足够时间，也防烂尾
3. ✅ 私下游通知大发行版：避免 0-day 窗口
4. ✅ 公告页集中历史漏洞：用户能自查是否受影响
5. ✅ Security audit 每年：第三方审计
6. ✅ 配套漏洞奖励：部分通过 HackerOne / OpenSSF 发放

### 20. 30 年向后兼容（30-Year Backward Compatibility）

**问题场景**：curl 1996 年诞生时只有 `-d`、`-o` 等 10 个短选项。30 年后命令行解析器 `tool_getparam.c` 涨到 106KB，每个短选项都对应一段历史。删除 `-d` 必有一批脚本崩；修改 `curl_easy_setopt` 行为必有一批程序崩。curl 30 年如一日地"加新选项、新协议，但旧 API 不变"。

**解决方案**：
```c
/* lib/url.c 保留所有 v1.0 行为 */
/* lib/setopt.c 保留所有 v4 行为 */
/* src/tool_getparam.c 保留 1997 年的 -d / -o / -O / -I */
struct LongShort {
  const char *letter;   /* 'd' */
  const char *lname;    /* "data" */
  unsigned int optnum;  /* ARG_xxx */
};
static const struct LongShort aliases[] = {
  {'d', "data",         ARG_DATA},      /* 1997 至今 */
  {'o', "output",       ARG_OUTPUT},    /* 1997 至今 */
  {'O', "remote-name",  ARG_REMOTE_NAME}, /* 1998 至今 */
  {'I', "head",         ARG_HEAD},      /* 2000 至今 */
  /* ... 200+ 项 */
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| ABI 兼容 | libcurl v4 至今 | 25 年不破坏 |
| 短选项 | 200+ | 1997 至今保留 |
| 协议新增 | 26+ | 不删旧的 |
| TLS 后端 | 13+ | 编译期可选 |
| 新行为 | 新选项 | 不修改老选项语义 |

**最佳实践**：
1. ✅ 改行为 = 加新选项：旧选项语义永远不变
2. ✅ 弃用 = 警告 + 文档：`-X` 弃用 2 年后才真删
3. ✅ API 加法不加法：函数签名向后兼容
4. ✅ 短选项保留 1997：脚本依赖
5. ✅ libcurl ABI version：每版本号 1.0 段 + 0.0 段（patch 兼容）
6. ✅ Changelog 详尽：每版本每个变更都有 commit 链接

---

**标签**：#curl #网络协议 #C #libcurl #分布式 #状态机
**状态**：20/20 份详细内容
