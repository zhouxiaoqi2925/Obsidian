# Nginx

## 一、前言

**定位**：高性能 HTTP 和反向代理服务器，也是 IMAP/POP3/SMTP 代理。由俄罗斯工程师 Igor Sysoev 于 2004 年发布，是 Web 基础设施的事实标准。

**核心价值**：
- **事件驱动异步**：单台 Nginx 可处理 5万+ 并发连接，远胜 Apache prefork 模式
- **多用途**：HTTP 服务器、反向代理、负载均衡、邮件代理、API 网关
- **配置灵活**：location / if / upstream / map / limit_req 等指令组合
- **生产级稳定性**：开源 20 年，互联网 30%+ 网站使用
- **生态完整**：OpenResty（Lua 扩展）、Tengine（阿里）、ModSecurity（WAF）

**五大特性**：
1. **事件驱动 + 异步非阻塞**：epoll/kqueue 多路复用，单进程数万连接
2. **多进程模型**：1 个 master + N 个 worker；worker 数量 = CPU 核数
3. **模块化架构**：core / http / mail / stream；动态模块加载
4. **配置热加载**：`nginx -s reload` 零停机重载
5. **高级负载均衡**：轮询、权重、IP Hash、least_conn、fair、url_hash

**与同类对比**：

| 维度 | Nginx | Apache | HAProxy | Envoy |
|---|---|---|---|---|
| 模型 | 事件驱动 | 多处理模块 | 事件驱动 | 多线程 |
| 并发 | 极高 | 中（prefork） | 极高 | 高 |
| 协议 | HTTP/L4/邮件 | HTTP | L4/L7 | L7 |
| 配置 | 简单 | 复杂 | 中等 | YAML |
| 扩展 | OpenResty | .htaccess | Lua | C++ filter |
| 适用 | 通用 Web | 老项目 | 纯 LB | Service Mesh |

## 二、架构思维导图

```mermaid
mindmap
  root((Nginx 架构))
    进程模型
      master
        主进程
        读取配置
        worker 管理
        升级
      worker
        工作进程
        CPU 核数
        处理连接
        无锁
      cache loader
        加载缓存
      cache manager
        缓存管理
    事件驱动
      epoll Linux
      kqueue BSD
      eventport Solaris
      异步非阻塞
      多路复用
    模块体系
      核心模块
        ngx_core
      HTTP 模块
        ngx_http
      Upstream
        ngx_http_upstream
      Mail
        ngx_mail
      Stream
        ngx_stream
      第三方
        OpenResty Lua
    HTTP 处理
      11 阶段
        POST_READ
        SERVER_REWRITE
        FIND_CONFIG
        REWRITE
        POST_REWRITE
        PREACCESS
        ACCESS
        POST_ACCESS
        PRECONTENT
        CONTENT
        LOG
      handler
      filter
    负载均衡
      轮询
        round-robin
      权重
        weight
      IP Hash
      least_conn
        最少连接
      fair
        响应时间
      url_hash
        一致性
      random
    反向代理
      proxy_pass
      upstream
      协议
        HTTP
        FastCGI
        uwsgi
        SCGI
        gRPC
        WebSocket
    缓存
      代理缓存
        proxy_cache
        路径
        层级
        失效
      FastCGI 缓存
      内存共享
        共享字典
        限流
    限流
      limit_req
        漏桶
      limit_conn
        连接数
      限流键
        $binary_remote_addr
        $server_name
    安全
      WAF
        ModSecurity
      HTTPS
        ssl
        协议配置
      限流防 CC
      IP 黑名单
        deny allow
    高可用
      keepalived
        VRRP
      双主热备
      上游健康
        health_check
        max_fails
        fail_timeout
    配置
      块结构
        http server location
        events
        stream
      变量
        内置变量
        自定义 map
        geo
      日志
        access_log
        error_log
        自定义 format
    高级
      限流限速
      灰度发布
        cookie
        header
        weight
      防盗链
        referer
      压缩
        gzip
        brotli
      静态资源
        expires
        etag
    OpenResty
      LuaJIT
      cosocket
      shared dict
      协程
      WAF 实时
      Kong APISIX
```

## 三、关键代码

### 1. 反向代理 + 负载均衡

```nginx
# /etc/nginx/nginx.conf

user nginx;
worker_processes auto;        # worker 数量 = CPU 核数
worker_rlimit_nofile 65535;   # 每个 worker 打开文件数

error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;   # 每个 worker 最大连接数
    use epoll;                 # Linux 用 epoll
    multi_accept on;           # 一次 accept 多个连接
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct=$upstream_connect_time '
                    'uht=$upstream_header_time urt=$upstream_response_time';

    access_log /var/log/nginx/access.log main;

    sendfile on;                 # 零拷贝 sendfile()
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    server_tokens off;           # 隐藏版本号

    # gzip 压缩
    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_vary on;

    # 上游：负载均衡池
    upstream backend_pool {
        # 策略
        # 1. 轮询（默认）
        # 2. least_conn（最少连接）
        # 3. ip_hash（会话保持）
        # 4. weight（权重）
        # 5. backup（备用）

        least_conn;

        server 10.0.1.10:8080 weight=5 max_fails=3 fail_timeout=30s;
        server 10.0.1.11:8080 weight=5 max_fails=3 fail_timeout=30s;
        server 10.0.1.12:8080 weight=3 max_fails=3 fail_timeout=30s;
        server 10.0.1.13:8080 weight=3 max_fails=3 fail_timeout=30s;

        # 主动健康检查（nginx-plus / openresty）
        # check interval=3000 rise=2 fall=3 timeout=1000;

        # 长连接池
        keepalive 32;            # 缓存 32 个空闲连接到上游
        keepalive_requests 100;  # 单连接最多 100 个请求
        keepalive_timeout 60s;
    }

    # 虚拟主机
    server {
        listen 80;
        server_name api.example.com;
        return 301 https://$server_name$request_uri;  # 强制 HTTPS
    }

    server {
        listen 443 ssl http2;
        server_name api.example.com;

        # SSL 配置
        ssl_certificate /etc/nginx/ssl/api.example.com.crt;
        ssl_certificate_key /etc/nginx/ssl/api.example.com.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 1d;

        # 反向代理
        location / {
            proxy_pass http://backend_pool;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # 超时
            proxy_connect_timeout 5s;
            proxy_send_timeout 30s;
            proxy_read_timeout 30s;

            # 重试
            proxy_next_upstream error timeout http_502 http_503;
            proxy_next_upstream_tries 2;

            # WebSocket
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

**解析**：
- **`keepalive 32`** 在 upstream 块：Nginx 主动维持到上游的空闲长连接池，避免每次重建 TCP
- **`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`**：追加真实客户端 IP
- **`least_conn`**：比 round-robin 更智能，把请求分给连接数最少的节点
- **WebSocket 升级**：`Upgrade` / `Connection` 头 + `proxy_http_version 1.1`

### 2. 限流与防 CC

```nginx
# 限流配置
http {
    # 1. 限流区域（共享内存）
    # zone=name:size（共享内存大小）
    # rate=Nr/m（每分钟 N 次）
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    server {
        listen 80;
        server_name api.example.com;

        # 全局连接数限制
        limit_conn conn_limit 20;     # 每 IP 最多 20 个连接

        location /api/ {
            # 漏桶算法：burst=20 排队，nodelay 不延迟立即处理
            limit_req zone=api_limit burst=20 nodelay;
            # 限流返回 503
            limit_req_status 503;

            proxy_pass http://backend_pool;
        }

        # 登录接口：更严格
        location /api/login {
            limit_req zone=login_limit burst=3 nodelay;
            proxy_pass http://backend_pool;
        }

        # 静态资源不限流
        location /static/ {
            root /var/www;
            expires 7d;
            add_header Cache-Control "public, max-age=604800";
        }
    }
}
```

**解析**：
- **漏桶算法**：`rate=10r/s burst=20 nodelay` 表示每秒 10 个请求基准，突发可到 20 个，立即处理
- **共享内存 zone**：多个 worker 共享限流计数（10m 共享内存可记录 8 万 IP）
- **不同接口不同策略**：登录限 5r/m，API 限 10r/s，静态资源不限

### 3. 代理缓存（重要性能优化）

```nginx
http {
    # 1. 缓存路径
    proxy_cache_path /var/cache/nginx/proxy
        levels=1:2                    # 目录层级：1层/2层哈希
        keys_zone=cache1:100m         # 共享内存 key 存储（100m 容纳 80 万 key）
        max_size=10g                  # 磁盘最大 10GB
        inactive=60m                  # 60 分钟未访问删除
        use_temp_path=off;            # 直接写缓存目录

    server {
        listen 80;
        server_name cdn.example.com;

        location / {
            proxy_pass http://backend_pool;
            proxy_cache cache1;
            proxy_cache_key "$scheme$request_method$host$request_uri";
            proxy_cache_valid 200 302 10m;   # 200/302 缓存 10 分钟
            proxy_cache_valid 404 1m;        # 404 缓存 1 分钟
            proxy_cache_valid any 5s;        # 其他 5 秒

            # 缓存条件
            proxy_cache_min_uses 1;          # 1 次访问即缓存
            proxy_cache_bypass $http_cache_control;  # 客户端 Cache-Control: no-cache 跳过缓存

            # 添加 X-Cache 头标识命中
            add_header X-Cache-Status $upstream_cache_status;

            # 强制响应头（可被同源覆盖）
            expires 1h;
        }
    }
}
```

**`$upstream_cache_status` 取值**：
- `HIT` / `BYPASS`（强制不缓存）
- `MISS` / `EXPIRED`（缓存过期）
- `STALE`（上游挂了，返回旧缓存）+ `UPDATING`（后台更新中）

**解析**：
- **共享内存 + 磁盘双层**：keys_zone 在内存（快速查找），实际文件在磁盘
- **`levels=1:2`** 哈希分布：避免单目录文件过多（Linux 单目录超过 10k 文件性能下降）
- **`proxy_cache_bypass`**：响应客户端 `Cache-Control: no-cache` 头，强制回源（CDN 场景）

### 4. 灰度发布（金丝雀）

```nginx
http {
    # 上游分组
    upstream prod_pool {
        server 10.0.1.10:8080;  # 稳定版
        server 10.0.1.11:8080;
    }

    upstream canary_pool {
        server 10.0.1.20:8080;  # 金丝雀版
    }

    # 用 map 根据 cookie/header 决定路由
    map $cookie_user_group $backend {
        default prod_pool;
        "canary" canary_pool;
    }

    map $http_x_canary $is_canary {
        default 0;
        "1" 1;
        "true" 1;
    }

    server {
        listen 80;
        server_name app.example.com;

        location / {
            # 1. 按 cookie 灰度
            proxy_pass http://$backend;

            # 2. 按 header 灰度
            # if ($is_canary) {
            #     proxy_pass http://canary_pool;
            # }

            # 3. 按权重灰度（用 split_clients）
            # split_clients "${remote_addr}${http_user_agent}" $variant {
            #     5% canary_pool;
            #     * prod_pool;
            # }
            # proxy_pass http://$variant;
        }
    }
}
```

**解析**：
- **cookie 灰度**：用户登录后服务端设置 `user_group=canary`，所有后续请求走金丝雀
- **header 灰度**：客户端主动加 `X-Canary: 1`，可绕过 Nginx 直接走金丝雀
- **split_clients 权重灰度**：基于 `remote_addr + user_agent` 一致性哈希，5% 流量进金丝雀（同一用户始终进同一版本）

### 5. HTTPS + HSTS + HTTP/2

```nginx
server {
    listen 443 ssl http2;
    http2_max_field_size 16k;
    http2_max_header_size 32k;

    server_name example.com;

    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;
    ssl_dhparam /etc/nginx/ssl/dhparam.pem;

    # TLS 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # HSTS（强制 HTTPS）
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'" always;
}

# HTTP 自动跳转 HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}
```

**解析**：
- **TLS 1.3 优先**：相比 TLS 1.2 握手从 2-RTT 降到 1-RTT，性能提升 30%
- **OCSP Stapling**：服务端代客户端验证证书状态，减少 TLS 握手延迟
- **HSTS preload**：提交到浏览器 preload list，强制 HTTPS
- **CSP 头**：XSS 防护，但配置要谨慎（容易 block 自己的 inline script）

## 四、核心洞察

1. **事件驱动是性能核心**：单 worker 单线程 + epoll，可处理上万并发；worker 数 = CPU 核数（避免上下文切换）。
2. **keepalive 是性能调优银弹**：Nginx → 上游的 keepalive 池避免每次重建 TCP；Nginx → 客户端的 keepalive 减少握手。
3. **11 阶段 HTTP 处理**：请求经过 POST_READ → SERVER_REWRITE → FIND_CONFIG → ... → LOG 多个阶段，每个阶段有独立模块；理解 11 阶段才能用好 rewrite/access 等指令。
4. **proxy_cache 是 CDN 的基础**：相同配置可商用 CDN 服务（Cloudflare、CloudFront 本质都是代理缓存）。
5. **限流是生产环境必修课**：漏桶 / 令牌桶 / 连接数限制，多种策略组合应对不同攻击。
6. **OpenResty 把 Nginx 变成应用服务器**：LuaJIT + cosocket（协程网络 IO） + shared dict，可实现实时 WAF、自定义鉴权、Kong/APISIX 都基于 OpenResty。
7. **Tengine vs Nginx**：Tengine 是阿里基于 Nginx 的分支，合并了动态模块、reuse_port、jemalloc 等；国内大厂常用。
8. **监控 `stub_status` 或 `vts`**：Nginx Plus 或 OpenResty 的 `vts` 模块可看实时 QPS、状态码分布、upstream 健康。

## 五、跨项目引用

- [./k8s.md](./k8s.md) — Nginx Ingress Controller 是 K8s 7 层路由标配
- [./traefik.md](./traefik.md) — Traefik 是云原生时代的反向代理，自动发现服务
- [./envoy.md](./envoy.md) — Envoy 是 Service Mesh 时代的反向代理
- [./haproxy.md](./haproxy.md) — HAProxy 专注 L4/L7 负载均衡
- [./openresty.md](./openresty.md) — OpenResty = Nginx + Lua，扩展到应用层
- [./konga.md](./konga.md) — Kong 是基于 OpenResty 的 API 网关
- [./redis.md](./redis.md) — Nginx + Redis 实现 LRU 缓存前置
- [../A-前端框架/next.js.md](../A-前端框架/next.js.md) — Next.js 反向代理到 Nginx

## 六、关键代码（续）

### 6. 静态文件服务与高效缓存

```nginx
http {
    # open_file_cache 缓存文件描述符、目录、大小、修改时间
    open_file_cache max=10000 inactive=20s;
    open_file_cache_valid 30s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    server {
        listen 80;
        server_name static.example.com;
        root /var/www/static;

        # 隐藏点开头的文件
        location ~ /\. {
            deny all;
        }

        # 长缓存：带 hash 文件名（webpack/vite 产物）
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable, max-age=31536000";
            add_header X-Content-Type-Options "nosniff" always;
            try_files $uri =404;
            access_log off;  # 静态不打日志，省 IO
        }

        # HTML 短缓存
        location ~* \.html$ {
            expires 5m;
            add_header Cache-Control "public, max-age=300";
        }

        # favicon
        location = /favicon.ico {
            log_not_found off;
            access_log off;
        }

        # robots.txt
        location = /robots.txt {
            allow all;
            log_not_found off;
            access_log off;
        }
    }
}
```

**解析**：
- **`immutable`**：告诉浏览器永不重新校验（适合 hash 文件名）
- **`access_log off`**：静态请求不打 access log，省磁盘 IO
- **`open_file_cache`**：缓存 fd 和元数据，避免每次 stat() 调用

### 7. Gzip + Brotli 双压缩

```nginx
http {
    # Gzip
    gzip on;
    gzip_min_length 1024;          # 小于 1KB 不压
    gzip_comp_level 6;              # 1-9，6 是性价比甜点
    gzip_vary on;
    gzip_proxied any;               # 任何响应都压
    gzip_disable "msie6";
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        application/vnd.ms-fontobject
        application/x-font-ttf
        font/opentype
        image/svg+xml
        image/x-icon;

    # Brotli（需要 nginx-plus 或 google/ngx_brotli 模块）
    brotli on;
    brotli_comp_level 6;
    brotli_min_length 1024;
    brotli_types text/plain text/css application/json application/javascript image/svg+xml;
    brotli_static on;  # 预压缩 .br 文件

    server {
        listen 80;
        location / {
            root /var/www/html;
        }
    }
}
```

**解析**：
- **Brotli 压缩率比 Gzip 高 15-20%**，但需客户端支持（Chrome/FF/Safari 近 5 年版本都支持）
- **`gzip_static on` + `brotli_static on`**：使用预压缩文件（`.gz` / `.br`），避免重复压缩
- **`gzip_min_length`**：小于 1KB 压缩收益小反而增 CPU

### 8. FastCGI 代理（PHP-FPM）

```nginx
http {
    upstream php_backend {
        server 127.0.0.1:9000 weight=1 max_fails=3 fail_timeout=30s;
        # 或 unix socket
        # server unix:/var/run/php-fpm.sock weight=1;
        keepalive 32;
    }

    # FastCGI 缓存
    fastcgi_cache_path /var/cache/nginx/fastcgi
        levels=1:2
        keys_zone=php_cache:50m
        max_size=5g
        inactive=60m
        use_temp_path=off;

    fastcgi_cache_key "$scheme$request_method$host$request_uri";

    server {
        listen 80;
        server_name php.example.com;
        root /var/www/php;
        index index.php;

        # 静态文件直接由 Nginx 处理
        location / {
            try_files $uri $uri/ /index.php$is_args$args;
        }

        # PHP 文件转 FastCGI
        location ~ \.php$ {
            try_files $uri =404;

            fastcgi_pass php_backend;
            fastcgi_index index.php;
            fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;

            include fastcgi_params;

            # FastCGI 缓存
            fastcgi_cache php_cache;
            fastcgi_cache_valid 200 301 302 10m;
            fastcgi_cache_valid 404 1m;
            fastcgi_cache_bypass $cookie_nocache $arg_nocache$arg_comment;
            fastcgi_no_cache $cookie_nocache $arg_nocache$arg_comment;
            add_header X-FastCGI-Cache $upstream_cache_status;

            # 超时
            fastcgi_connect_timeout 5s;
            fastcgi_send_timeout 30s;
            fastcgi_read_timeout 30s;
            fastcgi_buffer_size 16k;
            fastcgi_buffers 8 16k;

            # 安全
            fastcgi_hide_header "X-Powered-By";
        }

        # 禁止执行上传目录的 PHP
        location ~ ^/uploads/.*\.php$ {
            deny all;
        }
    }
}
```

**解析**：
- **`fastcgi_cache`**：WordPress/Laravel 等 PHP 应用可借此实现页面级缓存，QPS 提升 10x
- **`$upstream_cache_status`**：HIT/MISS/BYPASS/EXPIRED/STALE
- **PHP 上传目录禁 PHP 执行**：防止上传 WebShell

### 9. uWSGI 代理（Python / Django / Flask）

```nginx
http {
    upstream django {
        server 127.0.0.1:8001 weight=1;
        server 127.0.0.1:8002 weight=1;
        keepalive 32;
    }

    server {
        listen 80;
        server_name py.example.com;

        client_max_body_size 20M;  # Django 大文件上传

        location /static/ {
            alias /var/www/py/static/;
            expires 30d;
        }

        location /media/ {
            alias /var/www/py/media/;
        }

        location / {
            # 1. uwsgi_pass
            include uwsgi_params;
            uwsgi_pass django;
            uwsgi_read_timeout 30s;
            uwsgi_send_timeout 30s;

            # 2. 或 gunicorn 用 http_pass
            # proxy_pass http://django;
            # proxy_set_header Host $host;
            # proxy_set_header X-Real-IP $remote_addr;
            # proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            # proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

**uwsgi_params 关键参数**：
```
uwsgi_param QUERY_STRING $query_string;
uwsgi_param REQUEST_METHOD $request_method;
uwsgi_param CONTENT_TYPE $content_type;
uwsgi_param CONTENT_LENGTH $content_length;
uwsgi_param REQUEST_URI $request_uri;
uwsgi_param PATH_INFO $document_uri;
uwsgi_param SERVER_PROTOCOL $server_protocol;
uwsgi_param REMOTE_ADDR $remote_addr;
uwsgi_param REMOTE_PORT $remote_port;
uwsgi_param SERVER_PORT $server_port;
uwsgi_param SERVER_NAME $server_name;
```

### 10. Node.js 反向代理

```nginx
upstream nodejs {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name node.example.com;

    location / {
        proxy_pass http://nodejs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # Node 长连接 + SSE
        proxy_buffering off;          # SSE 需要立即 flush
        proxy_cache off;              # API 业务数据不缓存
        chunked_transfer_encoding on;

        # 超时
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态资源
    location /static/ {
        alias /var/www/node/public/;
        expires 30d;
    }
}
```

**SSE（Server-Sent Events）** 关键配置：
- `proxy_buffering off`：必须关闭，否则事件被缓冲
- `proxy_cache off`：SSE 是流式响应
- `chunked_transfer_encoding on`：分块传输

### 11. WebSocket 完整配置

```nginx
# WebSocket 是基于 HTTP 升级的长连接协议，需要正确处理 Upgrade/Connection 头
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream ws_backend {
    server 10.0.1.10:8080;
    server 10.0.1.11:8080;
    ip_hash;  # WebSocket 保持会话到同一节点
    keepalive 32;
}

server {
    listen 80;
    server_name ws.example.com;

    # WebSocket 路由
    location /socket.io/ {
        proxy_pass http://ws_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;  # 注意用 map 变量

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # WebSocket 超时要长
        proxy_read_timeout 3600s;     # 1 小时
        proxy_send_timeout 3600s;
        proxy_connect_timeout 5s;

        # 不缓存
        proxy_buffering off;
        proxy_cache off;

        # 禁用 keepalive 心跳检测
        proxy_set_header Keep-Alive "";
    }

    # 业务 HTTP API
    location /api/ {
        proxy_pass http://ws_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**WebSocket 关键点深度解析**：

第一，关于 `Upgrade` 头处理。客户端发起 WebSocket 连接时，会先发送一个普通的 HTTP 请求，在请求头中携带 `Upgrade: websocket` 和 `Connection: Upgrade` 字段。Nginx 在收到这样的请求后，必须将这两个头原样转发到上游服务器，否则上游无法识别这是一个 WebSocket 握手请求。我们的配置中使用了 `map` 指令将 `$http_upgrade` 变量映射到 `$connection_upgrade`，这样无论客户端是否发送了 `Upgrade` 头，都能正确处理。当 `$http_upgrade` 为空字符串时，Nginx 会将 `Connection` 头设为 `close`，这是普通 HTTP 短连接的行为；当 `$http_upgrade` 不为空时，会将 `Connection` 头设为 `upgrade`，表示这是协议升级请求。

第二，关于超时设置。WebSocket 是长连接协议，连接一旦建立，可以保持数小时甚至数天不中断。普通的 HTTP 代理超时设置（如 60 秒）会导致 WebSocket 连接在 60 秒后被 Nginx 主动断开。因此，必须将 `proxy_read_timeout` 和 `proxy_send_timeout` 设置为较大的值，比如 3600 秒（一小时）甚至更长。如果 WebSocket 应用有自己的心跳机制（如 ping/pong 帧），可以适当缩短超时时间。

第三，关于 `proxy_buffering off`。WebSocket 是双向流式通信，客户端发送的消息必须立即转发到上游服务器，上游服务器的响应也必须立即转发给客户端。如果启用了 `proxy_buffering`，Nginx 会先将响应缓存到内存中，达到一定大小后再一次性发送给客户端，这会严重影响实时性。禁用缓冲后，Nginx 会立即将数据原样转发，实现真正的实时通信。

第四，关于 `ip_hash` 负载均衡策略。WebSocket 连接建立后，客户端与服务器之间会保持长连接，传输期间会有大量数据交互。如果使用普通的轮询或最少连接策略，可能会出现某次新连接被分配到其他节点的情况，导致用户在聊天或游戏中突然掉线。使用 `ip_hash` 后，相同 IP 的所有请求都会路由到同一台后端服务器，保证会话的一致性。

第五，关于 `keepalive 32`。在 upstream 块中配置 `keepalive 32`，表示 Nginx 会在内存中维持最多 32 个到上游服务器的空闲长连接。当新的 WebSocket 连接建立时，Nginx 会从空闲连接池中取出一个连接复用，避免每次都进行 TCP 三次握手。这对于频繁建立短连接的应用（如聊天室的退出再进入）非常有效，可以显著降低延迟。

### 12. gRPC 代理

```nginx
http {
    # gRPC 需要 HTTP/2
    upstream grpc_backend {
        server 10.0.1.10:50051;
        server 10.0.1.11:50051;
        keepalive 32;
    }

    server {
        listen 80 http2;  # gRPC 必须 HTTP/2
        server_name grpc.example.com;

        # gRPC 路由
        location /helloworld.Greeter/ {
            grpc_pass grpc://grpc_backend;
            grpc_set_header Host $host;
            grpc_set_header X-Real-IP $remote_addr;
            grpc_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # gRPC 超时
            grpc_connect_timeout 5s;
            grpc_read_timeout 30s;
            grpc_send_timeout 30s;

            # 不缓存流
            grpc_buffering off;
        }

        # 监控端点（gRPC Health）
        location /grpc.health.v1.Health/ {
            grpc_pass grpc://grpc_backend;
            grpc_connect_timeout 1s;
            access_log off;
        }
    }
}
```

**gRPC 代理特殊说明**：

gRPC 是基于 HTTP/2 的高性能 RPC 框架，由 Google 开发。Nginx 通过 `grpc_pass` 指令（从 1.13.10 版本开始支持）可以将 gRPC 请求反向代理到上游 gRPC 服务器。gRPC 代理有几个特殊点需要特别注意。

第一，必须使用 HTTP/2。gRPC 协议强依赖 HTTP/2 的多路复用、流控、头部压缩等特性，HTTP/1.1 无法承载 gRPC。在 Nginx 中，需要在 `listen` 指令中加上 `http2` 参数，启用 HTTP/2 支持。

第二，`grpc_set_header` 与 `proxy_set_header` 的区别。gRPC 代理使用 `grpc_set_header` 指令设置头信息，而不是 `proxy_set_header`。两者的语法类似，但作用范围不同：`proxy_set_header` 用于普通 HTTP 代理，`grpc_set_header` 用于 gRPC 代理。

第三，`grpc_buffering off` 必须设置。gRPC 支持四种通信模式：一元调用、服务器流、客户端流、双向流。除了第一种，其他三种都是流式通信，必须禁用缓冲才能保证实时性。

第四，关于 TLS 加密。gRPC 流量通常包含敏感的 RPC 调用参数和返回值，建议在公网上使用 TLS 加密。Nginx 可以通过标准的 SSL 配置来终止 gRPC 的 TLS 连接。

### 13. CORS 跨域配置

```nginx
# CORS 跨域资源共享完整配置
map $http_origin $cors_origin {
    default "";
    "~^https://(www\.)?example\.com$" "$http_origin";
    "~^https://app\.example\.com$" "$http_origin";
    "~^http://localhost(:[0-9]+)?$" "$http_origin";
}

server {
    listen 80;
    server_name api.example.com;

    # 预检请求（OPTIONS）直接返回
    location / {
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin $cors_origin;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS";
            add_header Access-Control-Allow-Headers "Authorization, Content-Type, X-Requested-With, X-CSRF-Token";
            add_header Access-Control-Allow-Credentials "true";
            add_header Access-Control-Max-Age 86400;
            add_header Content-Length 0;
            add_header Content-Type "text/plain";
            return 204;  # 204 No Content
        }

        # 正常请求
        add_header Access-Control-Allow-Origin $cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Expose-Headers "X-Total-Count, X-Request-Id" always;

        proxy_pass http://backend_pool;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**CORS 配置深度解析**：

CORS（Cross-Origin Resource Sharing，跨域资源共享）是浏览器的一种安全机制，用于限制网页中的 JavaScript 跨域访问其他域的资源。当前端应用部署在一个域名下，后端 API 部署在另一个域名下时，就会触发 CORS 限制。Nginx 作为反向代理，可以统一处理 CORS 相关的头信息，避免后端应用重复处理。

第一，关于 `Access-Control-Allow-Origin` 头。这个头的值指定了允许访问资源的源（origin），即协议+域名+端口。常见的三种配置方式有：使用通配符 `*` 表示允许所有源（但不能携带 Cookie）、使用具体的源（最安全）、使用动态源（根据请求头动态返回）。我们的配置中使用了 `map` 指令动态返回，仅允许预先配置的几个源，这种方式最安全。

第二，关于 `Access-Control-Allow-Credentials`。这个头设置为 `true` 时，表示允许跨域请求携带 Cookie（如 session ID）。但是，启用此选项后，`Access-Control-Allow-Origin` 不能是通配符 `*`，必须是具体的源。同时，浏览器还要求 `Access-Control-Allow-Headers` 中不能包含通配符。

第三，关于预检请求（Preflight）。当跨域请求是"非简单请求"时（如使用 PUT/DELETE 方法、携带自定义头、Content-Type 是 application/json 等），浏览器会先发送一个 OPTIONS 请求到服务器，询问是否允许该跨域请求。这个 OPTIONS 请求就叫做预检请求。服务器必须正确响应预检请求，否则真正的请求不会发送。在 Nginx 中，我们通过 `if ($request_method = 'OPTIONS')` 来拦截预检请求，并返回适当的 CORS 头和 204 状态码。

第四，关于 `Access-Control-Max-Age`。这个头指定了预检请求的缓存时间，单位是秒。在这个时间内，浏览器不需要再次发送预检请求，直接发送真正的请求。设置合理的缓存时间（如 86400 秒 = 24 小时）可以减少预检请求的数量，提升性能。

第五，关于 `Access-Control-Expose-Headers`。默认情况下，浏览器只允许 JavaScript 访问 7 个标准的响应头（Cache-Control、Content-Language、Content-Type、Expires、Last-Modified、Pragma），其他自定义头需要通过 `Access-Control-Expose-Headers` 显式暴露。

### 14. 防盗链（Referer 校验）

```nginx
map $http_referer $is_valid_referer {
    default 0;
    "~^https://(www\.)?example\.com/" 1;
    "~^https://cdn\.example\.com/" 1;
    "" 1;  # 直接访问（无 Referer）
}

server {
    listen 80;
    server_name img.example.com;
    root /var/www/images;

    location ~* \.(jpg|jpeg|png|gif|webp|svg)$ {
        valid_referers none blocked server_names
                      *.example.com
                      example.com;

        if ($is_valid_referer = 0) {
            return 403;
        }

        # 也可返回占位图
        # rewrite ^/ /forbidden.jpg break;

        expires 30d;
        add_header Cache-Control "public";
    }
}
```

**防盗链配置深度解析**：

防盗链是指防止其他网站直接引用本站的图片、视频等静态资源，避免消耗服务器带宽和流量。Nginx 通过检查 HTTP 请求头中的 `Referer` 字段来实现防盗链，原理是：合法用户的浏览器在请求资源时会自动带上 `Referer` 头，标识请求来自哪个页面；而盗链网站通常会直接构造资源 URL，绕过来源页面。

第一，关于 `valid_referers` 指令。这个指令用于定义合法的 Referer 来源。它支持以下几种参数：`none` 表示无 Referer（如直接访问、书签、搜索引擎爬虫等），`blocked` 表示 Referer 被防火墙或代理删除（用 `Referer:` 或 `Referer: unknown` 表示），`server_names` 表示当前服务器的域名（可以有多个），还支持通配符和正则表达式。

第二，关于 `if` 指令的使用。`if` 在 Nginx 中是一个"邪恶"的指令，因为它的行为与直觉不符，可能导致各种难以调试的问题。但在这个场景下，它是检查 `valid_referers` 结果的唯一方式。如果 `$invalid_referer` 为空字符串，说明 Referer 是合法的；如果不为空，说明是盗链。

第三，关于性能影响。防盗链检查会消耗一定的 CPU 资源（主要是字符串匹配），对于图片服务器这种高并发场景，建议使用 `map` 指令将检查结果缓存到变量中，避免每次请求都执行完整的字符串比较。我们的配置中使用了 `map` 配合正则，将 Referer 检查结果预计算为 `$is_valid_referer` 变量，性能更优。

第四，关于爬虫和 SEO 防护。搜索引擎爬虫（如 Googlebot、Baiduspider）通常会带特定的 User-Agent，但 Referer 可能是空的或搜索引擎的域名。我们的配置中 `none` 参数允许无 Referer 的请求通过，这样爬虫可以正常抓取图片。如果不希望被搜索引擎索引，可以加上爬虫白名单或黑名单。

第五，关于 HTTPS 站点的盗链。如果站点启用了 HTTPS，那么合法的 Referer 也必须是 HTTPS 开头，HTTP 的 Referer 会被浏览器或中间代理修改为不安全的值。配置时需要注意协议匹配。
