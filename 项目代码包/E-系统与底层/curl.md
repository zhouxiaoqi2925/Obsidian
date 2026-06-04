---
title: curl
tags: [命令行, HTTP, 调试, API, 网络工具]
---

# curl

## 前言

**定位**：命令行传输工具之王，1996 年由 Daniel Stenberg 创建至今是 HTTP/FTP/SMTP 等协议调试的事实标准，每个开发者机器上的瑞士军刀，与 wget 并称命令行下载双雄，但 curl 支持 20+ 协议远超 wget。

**核心价值**：
- 协议全覆盖：HTTP/HTTPS/FTP/SFTP/SMTP/IMAP 等
- 调试利器：详细输出、TLS 跟踪、HTTP/2 解析
- 自动化：脚本友好、支持 cookie/header/auth
- 高性能：连接复用、并行、限速

**五大特性**：
1. **协议丰富**：DICT/FILE/FTP/FTPS/GOPHER/HTTP/HTTPS/IMAP/IMAPS/LDAP/LDAPS/MQTT/POP3/POP3S/RTSP/SMB/SMTP/SMTPS/SFTP/TELNET/TFTP
2. **详细调试**：-v 显示握手、-I 只看 header、--trace 全包捕获
3. **灵活认证**：Basic/Bearer/Digest/NTLM/OAuth
4. **传输控制**：限速、并发、断点续传
5. **管道组合**：与 jq/grep/sed 协作

**对比表**：

| 维度 | curl | wget | httpie | Postman | fetch (Node) |
|---|---|---|---|---|---|
| 协议 | 20+ | HTTP/FTP | HTTP | HTTP | HTTP |
| 调试 | -v 极详细 | 中 | 彩色 | GUI | 中 |
| 脚本 | ✅ | ✅ | ✅ | ❌ | ✅ |
| 并发 | ❌（需 xargs） | ❌ | ❌ | ❌ | ❌ |
| 适合 | 全场景 | 简单下载 | 调试 | GUI 测试 | Node 项目 |

## 思维导图

```mermaid
mindmap
  root((curl))
    核心
      URL
      Method
      Header
      Body
      Cookie
    请求方法
      GET
      POST
      PUT
      DELETE
      PATCH
      HEAD
      OPTIONS
    协议
      HTTP
      HTTPS
      FTP
      SFTP
      SMTP
      LDAP
    认证
      Basic
      Bearer
      Digest
      NTLM
      OAuth
    调试
      -v
      -I
      --trace
      --trace-ascii
      -w
    数据
      JSON
      Form
      Multipart
      Binary
      Stream
    高级
      并发
      限速
      重试
      断点续传
      代理
    工具协作
      jq
      xargs
      parallel
      ffmpeg
```

## 关键代码

### 一、基础请求

```bash
# GET
curl https://api.github.com
curl https://api.example.com/users/123

# 详细输出（握手过程）
curl -v https://example.com

# 只看响应头
curl -I https://example.com
curl -sI https://example.com            # 静默模式

# 输出到文件
curl -o file.html https://example.com
curl -O https://example.com/file.zip   # 保留远程文件名

# 跟随重定向
curl -L https://example.com

# 静默 + 显示进度条
curl -s -o /dev/null -w "%{http_code}\n" https://example.com

# 显示 HTTP 状态码
curl -s -o /dev/null -w "%{http_code}" https://example.com
echo ""

# 写自定义格式
curl -w "HTTP: %{http_code}\nTime: %{time_total}s\nSize: %{size_download}\n" \
  -o /dev/null -s https://example.com
```

### 二、HTTP 方法与 Body

```bash
# POST JSON
curl -X POST https://api.example.com/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","age":30}'

# POST 表单
curl -X POST https://api.example.com/login \
  -d "username=alice&password=secret"

# 从文件读取 body
curl -X POST https://api.example.com/upload \
  -H "Content-Type: application/json" \
  -d @data.json

# PUT
curl -X PUT https://api.example.com/users/123 \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'

# PATCH
curl -X PATCH https://api.example.com/users/123 \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com"}'

# DELETE
curl -X DELETE https://api.example.com/users/123

# HEAD
curl -I https://example.com

# OPTIONS（看 CORS）
curl -X OPTIONS https://api.example.com/users \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -i
```

### 三、Header 与 Cookie

```bash
# 自定义 Header
curl https://api.example.com \
  -H "User-Agent: MyApp/1.0" \
  -H "Accept: application/json" \
  -H "X-Request-ID: 123"

# 多个 Header
curl https://api.example.com \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant: acme"

# User-Agent
curl -A "Mozilla/5.0" https://example.com

# Referer
curl -e "https://google.com" https://example.com

# Cookie
curl https://example.com -b "session=abc123"
curl https://example.com -b cookies.txt -c cookies.txt

# 保存响应 cookie
curl -c cookies.txt https://example.com/login -d "user=alice&pass=secret"

# 使用 cookie 文件
curl -b cookies.txt https://example.com/dashboard

# 发送多个 cookie
curl -b "session=abc; theme=dark" https://example.com
```

### 四、认证

```bash
# Basic Auth
curl -u alice:secret https://api.example.com
curl -u alice https://api.example.com       # 交互输入密码

# Bearer Token
curl -H "Authorization: Bearer $TOKEN" https://api.example.com

# Digest
curl --digest -u alice:secret https://api.example.com

# NTLM（Windows 域）
curl --ntlm -u alice:secret https://api.example.com

# OAuth 2.0
TOKEN=$(curl -X POST https://auth.example.com/oauth/token \
  -d "grant_type=client_credentials&client_id=$ID&client_secret=$SECRET" \
  | jq -r '.access_token')

curl -H "Authorization: Bearer $TOKEN" https://api.example.com

# AWS Sig v4（需 aws-cli）
curl --aws-sigv4 "aws:amz:us-east-1:s3" --user "ACCESS:SECRET" \
  https://my-bucket.s3.amazonaws.com/file.txt
```

### 五、文件上传

```bash
# 单文件上传
curl -F "file=@photo.jpg" https://api.example.com/upload

# 多文件
curl -F "file1=@a.jpg" -F "file2=@b.jpg" https://api.example.com/upload

# 指定 filename 和 type
curl -F "avatar=@photo.jpg;type=image/jpeg;filename=myphoto.jpg" \
  https://api.example.com/upload

# 上传二进制流
curl --data-binary @file.bin https://api.example.com/upload

# 上传 + 其他字段
curl -F "file=@data.csv" -F "description=Monthly report" \
  https://api.example.com/upload

# S3 上传
curl -X PUT https://my-bucket.s3.amazonaws.com/file.txt \
  --data-binary @local.txt \
  -H "Content-Type: text/plain"

# FTP 上传
curl -T file.zip ftp://ftp.example.com/ --user user:pass

# SFTP
curl -T file.txt sftp://user@host/path/ --key ~/.ssh/id_rsa
```

### 六、下载与断点续传

```bash
# 断点续传
curl -C - -O https://example.com/large-file.zip

# 限速（每秒 100KB）
curl --limit-rate 100k -O https://example.com/file.zip

# 显示进度条
curl -# -O https://example.com/file.zip

# 静默下载（脚本中）
curl -sSL -o file.tar.gz https://example.com/file.tar.gz

# 分块下载（多连接）
# curl 单连接，需 aria2c 或 axel 多连接
# curl 配合 parallel 工具实现并发
parallel -j 4 curl -O ::: https://example.com/file{1..4}.zip

# 下载整个目录（递归）
curl -u user:pass ftp://ftp.example.com/dir/ --output-dir ./local/

# 重试
curl --retry 3 --retry-delay 2 https://example.com

# 超时
curl --connect-timeout 5 --max-time 30 https://example.com
```

### 七、SSL/TLS 调试

```bash
# 显示证书
curl -vI https://example.com 2>&1 | grep -i "subject\|issuer\|expire"

# 指定证书
curl --cacert ca.pem https://api.example.com
curl --cacert /etc/ssl/certs/ca-certificates.crt https://api.example.com

# 客户端证书（mTLS）
curl --cert client.pem --key client-key.pem https://api.example.com

# 跳过证书验证（不推荐）
curl -k https://self-signed.example.com

# 指定 TLS 版本
curl --tlsv1.2 https://example.com
curl --tlsv1.3 https://example.com

# 指定密码套件
curl --tls-max 1.3 --ciphersuites TLS_AES_256_GCM_SHA384 https://example.com

# SSL 握手过程
curl -v --trace-ascii /tmp/ssl.log https://example.com

# 检查 OCSP Stapling
curl -vI https://example.com 2>&1 | grep -i "OCSP\|stapling"
```

### 八、代理

```bash
# HTTP 代理
curl -x http://proxy.example.com:8080 https://api.example.com

# SOCKS5 代理
curl --proxy socks5://user:pass@proxy:1080 https://api.example.com

# SOCKS5h（域名解析在代理端）
curl --proxy socks5h://proxy:1080 https://internal.example.com

# 代理认证
curl -x http://user:pass@proxy:8080 https://api.example.com

# 系统代理（env）
export http_proxy=http://proxy:8080
export https_proxy=http://proxy:8080
curl https://api.example.com

# no_proxy 排除
export no_proxy=localhost,127.0.0.1,.internal

# 代理中的代理
curl -x http://proxy1:8080 --proxy-user user:pass \
  -L --proxy http://proxy2:8080 https://example.com
```

### 九、输出格式

```bash
# 静默（无进度条）
curl -s https://example.com

# 输出到 stderr（body 到 stdout）
curl -s -o /dev/null -w "%{http_code}" https://example.com

# 自定义输出格式
curl -w '\n
URL:         %{url}
HTTP Code:   %{http_code}
DNS Time:    %{time_namelookup}s
Connect:     %{time_connect}s
TLS:         %{time_appconnect}s
TTFB:        %{time_starttransfer}s
Total:       %{time_total}s
Size:        %{size_download} bytes
Speed:       %{speed_download} B/s
Remote IP:   %{remote_ip}
' \
  -o /dev/null -s https://example.com

# 保存格式到文件
curl -w "%{json}\n" -o /dev/null -s https://example.com

# 进度条到 stderr
curl -# -O https://example.com/file.zip
```

```bash
# 与 jq 配合
curl -s https://api.github.com/users/octocat | jq '.login, .id, .public_repos'

# 提取字段
curl -s https://api.example.com | jq -r '.data[] | "\(.id): \(.name)"'

# 提取并保存
curl -s https://api.example.com | jq '.items[]' > items.json
```

### 十、并发与并行

```bash
# 单连接（curl 本身）
# 使用 xargs 并发
cat urls.txt | xargs -n 1 -P 10 curl -O

# GNU parallel
parallel -j 10 curl -O ::: https://example.com/file{1..100}.jpg

# 多个 URL
curl -O https://example.com/a.zip -O https://example.com/b.zip

# URL 范围
curl https://example.com/file[1-100].jpg -O

# 批量 API 调用
for id in 1 2 3 4 5; do
  curl -s "https://api.example.com/users/$id" &
done
wait

# 异步请求
curl --parallel --parallel-max 10 \
  -O https://a.com/1.zip \
  -O https://b.com/2.zip \
  -O https://c.com/3.zip

# 压测（轻量）
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{http_code} %{time_total}\n" https://example.com &
done
wait
```

### 十一、连接复用与性能

```bash
# 启用 HTTP keepalive
curl --keepalive-time 60 https://api.example.com

# 多个请求复用连接（curl 7.66+）
curl --next https://a.com https://b.com https://c.com

# HTTP/2
curl --http2 https://example.com

# HTTP/3（需要 curl + quiche）
curl --http3 https://example.com

# 压缩
curl --compressed https://example.com

# 连接池大小
curl --max-time 30 --connect-timeout 5 \
  --keepalive-time 60 \
  https://api.example.com

# 多次相同请求的连接复用
for i in {1..10}; do
  curl -s https://api.example.com/data?page=$i
done
# 注：每个 curl 进程独立，需 curl --next 或 libcurl
```

### 十二、高级调试

```bash
# 完整 trace
curl --trace-ascii /tmp/full.log https://example.com
curl --trace /tmp/full.log https://example.com    # 二进制 trace

# 只看请求头
curl -v -s -o /dev/null https://example.com 2>&1 | grep "^>"

# 只看响应头
curl -v -s -o /dev/null https://example.com 2>&1 | grep "^<"

# TLS 详细信息
curl -v -s -o /dev/null https://example.com 2>&1 | grep -i "ssl\|tls\|verify"

# 模拟慢速客户端
curl --limit-rate 1k https://example.com

# 模拟超时
curl --max-time 0.001 https://example.com

# 模拟大文件下载（部分）
curl -r 0-99 https://example.com/file.zip  # 只取前 100 字节

# 完整模拟浏览器请求
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.5" \
  -H "Accept-Encoding: gzip, deflate, br" \
  -H "Connection: keep-alive" \
  -H "Upgrade-Insecure-Requests: 1" \
  -L https://example.com

# 看完整握手
curl -v --trace-ascii /dev/stdout https://example.com 2>&1 | head -50
```

### 十三、协议测试

```bash
# FTP
curl ftp://ftp.example.com/file.zip --user user:pass
curl -T file.zip ftp://ftp.example.com/ --user user:pass

# SMTP（发送邮件）
curl smtp://smtp.example.com --mail-from alice@example.com \
  --mail-rcpt bob@example.com \
  -T email.txt
# email.txt 内容：
# From: alice@example.com
# To: bob@example.com
# Subject: Test
#
# Hello!

# IMAP（取邮件）
curl imap://imap.example.com --user user:pass

# LDAP 查询
curl ldap://ldap.example.com/dc=example,dc=com

# MQTT
curl mqtt://broker.example.com/topic -d "message"

# SMB / CIFS
curl smb://server/share/file.txt --user user:pass

# WebSocket（基础）
curl --include \
  --no-buffer \
  --header "Connection: Upgrade" \
  --header "Upgrade: websocket" \
  --header "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  --header "Sec-WebSocket-Version: 13" \
  http://example.com/ws
```

### 十四、gRPC 与 HTTP/2

```bash
# HTTP/2 测试
curl --http2 -v https://example.com 2>&1 | grep "h2"

# HTTP/2 优先级
curl --http2-prior-knowledge https://example.com

# gRPC（需 grpcurl）
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext -d '{"id": 1}' localhost:50051 UserService/GetUser

# 模拟 gRPC 请求
curl -X POST http://localhost:50051/UserService/GetUser \
  -H "Content-Type: application/grpc" \
  -H "TE: trailers" \
  --data-binary $'\x00\x00\x00\x00\x05\x0a\x03\x31\x32\x33' \
  -v
# 数据格式：5 字节 header (1:压缩, 4:长度) + protobuf payload
```

### 十五、配置文件

```bash
# ~/.curlrc
# 默认选项
--compressed
--keepalive-time 60
--max-time 30
-s
-S                            # 显示错误

# 多个配置
curl -K ~/.curlrc https://example.com
curl --config ~/.curlrc https://example.com

# 项目级 .curlrc
cd /path/to/project
curl -K .curlrc https://api.example.com
```

```bash
# ~/.curlrc 示例
# 默认 User-Agent
-user-agent = "MyApp/1.0"

# 默认 header
-header = "Accept: application/json"
-header = "X-Client: curl-script"

# 默认 follow
-location

# 默认压缩
-compressed

# 显示错误
-show-error

# 静默
-silent
```

### 十六、常见用例

```bash
# 1. 测试 API 端点
curl -X POST https://api.example.com/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret"}'

# 2. 健康检查
curl -f -s -o /dev/null -w "%{http_code}\n" https://api.example.com/health
# -f 在 4xx/5xx 时返回非零

# 3. 检查 DNS 解析时间
curl -w "DNS: %{time_namelookup}\n" -o /dev/null -s https://example.com

# 4. 测速
curl -o /dev/null -w "Speed: %{speed_download} B/s\n" https://example.com/bigfile

# 5. JSON 格式化（jq 配合）
curl -s https://api.example.com | jq .

# 6. Webhook 测试
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"test","timestamp":1234567890}'

# 7. 跨域预检
curl -X OPTIONS https://api.example.com/users \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -i

# 8. 监控 API 可用性
while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" https://api.example.com)
  echo "$(date) HTTP $code"
  sleep 60
done

# 9. 下载 GitHub Release
curl -L -o release.tar.gz \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/owner/repo/tarball/main

# 10. 检查 Web 服务是否启动
until curl -f -s http://localhost:8080/health > /dev/null; do
  echo "Waiting for service..."
  sleep 1
done
echo "Service is up!"
```

## 核心洞察

- **curl 是命令行 HTTP 客户端的事实标准**：每个开发者都用
- **curl 的"协议丰富"是核心价值**：20+ 协议统一接口
- **curl 的"-v"是调试利器**：完整握手过程
- **curl 的"JSON"测试是 API 调试基础**：RESTful API 第一步
- **curl 的"Cookie 文件"模拟登录**：-c 保存 -b 发送
- **curl 的"mTLS"是服务网格基础**：--cert --key
- **curl 的"代理"是企业网络必备**：HTTP/SOCKS5
- **curl 的"输出格式"是脚本关键**：-w 自定义 metrics
- **curl 的"并发"靠外部工具**：xargs/parallel，不是 curl 本身
- **curl 的"断点续传"是大文件必备**：-C -
- **curl 的"限速"是测试限流场景**：--limit-rate
- **curl 的"重试"是稳定性保障**：--retry --retry-delay
- **curl 的"压缩"是带宽优化**：--compressed
- **curl 的"HTTP/2"是现代协议**：--http2
- **curl 的"trace"是排错终极工具**：--trace-ascii 全包
- **curl 与"jq"是黄金组合**：JSON 处理管道
- **curl 的"~/.curlrc"是默认配置**：减少重复参数
- **curl 的"健康检查"是 CI 标配**：-f -s 脚本化
- **curl 的"-w"格式化输出是 SLA 监控**：time_total/size_download
- **curl 的"多 URL"是一个进程多请求**：--next 复用连接

## 跨项目引用

- **[[http]]**：HTTP 协议调试基础
- **[[https]]**：HTTPS/SSL/TLS 测试
- **[[http2]]** / **[[http3]]**：HTTP/2 HTTP/3 测试
- **[[rest]]**：RESTful API 测试
- **[[graphql]]**：GraphQL API 测试
- **[[grpc]]**：gRPC 接口测试（grpcurl）
- **[[websocket]]**：WebSocket 握手测试
- **[[jwt]]**：JWT 认证调用
- **[[oauth]]**：OAuth 2.0 token 获取
- **[[nginx]]**：Nginx 代理后端测试
- **[[dns]]**：DNS 解析时间测试
- **[[tls]]**：TLS 握手验证
- **[[mtls]]**：双向 TLS 客户端证书
- **[[jq]]**：JSON 处理组合
- **[[bash]]**：Shell 脚本自动化
- **[[linux]]**：Linux 必备命令
- **[[wget]]**：wget 是 curl 替代
- **[[postman]]**：Postman GUI 替代
- **[[prometheus]]**：blackbox_exporter 内部用 curl 类逻辑
- **[[git]]**：git http transport 类似 curl
- **[[docker]]**：Docker HEALTHCHECK 用 curl
- **[[kubernetes]]**：K8s liveness/readiness 探针用 curl
