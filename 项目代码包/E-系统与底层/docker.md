---
title: Docker
tags: [容器, 容器化, DevOps, 云原生, 镜像]
---

# Docker

## 前言

**定位**：容器化运行时的事实标准，2013 年由 Solomon Hykes 在 dotCloud 发布至今彻底改变了应用交付方式，从"运行我的机器"到"构建一次到处运行"，与 Kubernetes 共同构成云原生基石。

**核心价值**：
- 容器比 VM 轻量：秒级启动、MB 级镜像
- 镜像不可变：开发/测试/生产环境一致
- 声明式 Dockerfile：基础设施即代码
- 生态丰富：Docker Hub 数百万镜像

**五大特性**：
1. **镜像（Image）**：分层只读文件系统，union FS 复用
2. **容器（Container）**：镜像的运行实例，有独立进程/网络/文件系统
3. **Dockerfile**：声明式构建镜像的脚本
4. **Docker Compose**：多容器编排（单机）
5. **Docker Hub / Registry**：镜像仓库

**对比表**：

| 维度 | Docker | Podman | containerd | LXC | VM (KVM) |
|---|---|---|---|---|---|
| 守护进程 | 有 (dockerd) | 无（fork-exec） | 有 | 无 | 有 (libvirt) |
| 镜像 | ✅ Docker Hub | ✅ OCI 兼容 | ✅ OCI 兼容 | ⚠️ 模板 | ❌ |
| 隔离 | 内核 namespace | 内核 namespace | 委托 runtime | 内核 namespace | Hypervisor |
| 启动 | 秒级 | 秒级 | 秒级 | 秒级 | 分钟级 |
| 适合 | 开发/CI | Rootless 场景 | K8s 节点 | 系统容器 | 强隔离 |

## 思维导图

```mermaid
mindmap
  root((Docker))
    核心
      镜像
        分层
        UnionFS
      容器
        进程
        隔离
      仓库
        Registry
        Hub
    命令
      docker run
      docker build
      docker pull
      docker push
      docker exec
      docker logs
    Dockerfile
      FROM
      RUN
      COPY
      CMD
      ENTRYPOINT
      ENV
      ARG
    镜像
      分层
        缓存
      multi-stage
        减小体积
      tag
        latest
      registry
        Docker Hub
        Harbor
        ECR
    网络
      bridge
        默认
      host
        直通
      none
        隔离
      overlay
        跨主机
      macvlan
        VLAN
    存储
      volume
        持久化
      bind mount
        主机目录
      tmpfs
        内存
    Compose
      YAML
      服务
      网络
      卷
      多容器
    编排
      Swarm
        内置
      Kubernetes
        主流
    工具
      docker compose
        v2 内置
      docker context
      docker buildx
        多平台
      dive
        镜像分析
    生态
      Hub
      Desktop
      Scout
        安全扫描
    应用场景
      开发环境
      CI/CD
      微服务
      Serverless
```

## 关键代码

### 一、镜像操作

```bash
# 拉取镜像
docker pull nginx:latest
docker pull nginx:1.25-alpine
docker pull ubuntu:22.04

# 查看镜像
docker images
docker image ls
docker history nginx:latest        # 分层信息
docker inspect nginx:latest        # 详细元数据

# 删除镜像
docker rmi nginx:latest
docker image prune                 # 删除悬空镜像
docker image prune -a              # 删除所有未使用

# 镜像标签
docker tag myapp:v1 myregistry.com/myapp:v1
docker push myregistry.com/myapp:v1

# 镜像导入导出
docker save -o nginx.tar nginx:latest
docker load -i nginx.tar
```

### 二、容器操作

```bash
# 运行容器
docker run -d --name web -p 8080:80 nginx:latest
# -d: 后台
# --name: 容器名
# -p: 端口映射 host:container
# -e: 环境变量
# -v: 挂载卷
# --restart: 重启策略

docker run -it --rm ubuntu:22.04 bash
# -i: 交互
# -t: TTY
# --rm: 退出后删除

# 容器管理
docker ps                          # 运行中
docker ps -a                       # 全部
docker stop web                    # 优雅停止
docker start web                   # 启动
docker restart web
docker rm web                      # 删除（需先 stop）
docker rm -f web                   # 强制

# 进入容器
docker exec -it web bash           # 进入运行中容器
docker exec -u root -it web bash   # 切换 root
docker attach web                  # 附加到主进程

# 查看日志
docker logs web
docker logs -f --tail 100 web      # 跟踪最后 100 行
docker logs --since "1h" web       # 最近 1 小时

# 查看资源
docker stats                       # 实时
docker stats web
docker top web                     # 进程
docker port web                    # 端口映射

# 文件传输
docker cp file.txt web:/tmp/
docker cp web:/tmp/file.txt ./
```

### 三、Dockerfile

```dockerfile
# 多阶段构建示例
# ---- 构建阶段 ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM nginx:1.25-alpine
LABEL maintainer="alice@example.com"
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

```dockerfile
# 指令详解
FROM ubuntu:22.04                  # 基础镜像
RUN apt-get update && \
    apt-get install -y curl        # 构建时执行
WORKDIR /app                       # 工作目录
COPY . .                           # 复制文件
ADD https://example.com/file.tar.gz /tmp/  # URL/解压
ENV NODE_ENV=production            # 环境变量
ARG VERSION=latest                 # 构建参数
EXPOSE 8080                        # 声明端口
VOLUME /data                       # 挂载点
USER app                           # 切换用户
ENTRYPOINT ["python", "app.py"]    # 入口（不可覆盖）
CMD ["--port", "8080"]             # 默认参数（可覆盖）
```

```bash
# 构建
docker build -t myapp:v1 .
docker build -t myapp:v1 -f Dockerfile.prod .
docker build -t myapp:v1 --build-arg VERSION=1.2.0 .

# 多平台构建（buildx）
docker buildx create --use --name multi
docker buildx build --platform linux/amd64,linux/arm64 -t myapp:v1 --push .
```

### 四、卷与持久化

```bash
# 创建 volume
docker volume create mydata
docker volume ls
docker volume inspect mydata
docker volume rm mydata
docker volume prune

# 使用 volume
docker run -d -v mydata:/data nginx
# 或
docker run -d --mount source=mydata,target=/data nginx

# bind mount（主机目录）
docker run -d -v /host/path:/container/path nginx
docker run -d -v $(pwd):/app -w /app node:20 npm start

# tmpfs（内存）
docker run -d --tmpfs /tmp nginx

# 共享卷
docker run -d --volumes-from containerA nginx
```

### 五、网络

```bash
# 默认 bridge 网络
docker run -d --name web -p 8080:80 nginx
# 容器间通过 --link 通信（旧）

# 自定义网络
docker network create mynet
docker network create --driver bridge mynet
docker network ls
docker network inspect mynet

# 容器加入网络
docker run -d --name db --network mynet postgres
docker run -d --name web --network mynet -p 8080:80 nginx
# 同一网络内可用容器名通信：web → db:5432

# host 网络（无隔离）
docker run -d --network host nginx
# 容器直接用主机端口

# 端口管理
docker run -d -p 8080:80 nginx              # 主机:容器
docker run -d -p 127.0.0.1:8080:80 nginx    # 绑定 IP
docker run -d -p 8080-8090:8080-8090 nginx  # 端口范围
docker run -d -P nginx                      # 暴露所有 EXPOSE
```

### 六、Docker Compose

```yaml
# docker-compose.yml
version: "3.9"

services:
  web:
    build: ./web
    image: myapp/web:v1
    ports:
      - "8080:80"
    environment:
      - NODE_ENV=production
      - DB_HOST=db
    depends_on:
      - db
    volumes:
      - web-data:/app/uploads
    restart: unless-stopped
    networks:
      - backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: secret
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - backend

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - backend

volumes:
  web-data:
  db-data:
  redis-data:

networks:
  backend:
    driver: bridge
```

```bash
# Compose 命令
docker compose up -d              # 启动
docker compose down               # 停止
docker compose ps                 # 状态
docker compose logs -f web        # 日志
docker compose exec web bash      # 进入
docker compose build              # 构建
docker compose pull               # 拉取镜像
docker compose restart web
docker compose config             # 验证 YAML
```

### 七、镜像优化

```dockerfile
# 1. 选用小基础镜像
FROM node:20-alpine               # ~50MB
# vs FROM node:20                  # ~900MB

# 2. 多阶段构建
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o myapp

FROM alpine:3.19
COPY --from=builder /app/myapp /usr/local/bin/
ENTRYPOINT ["myapp"]

# 3. 层缓存优化（不常变的先 COPY）
COPY package*.json ./
RUN npm ci
COPY . .                          # 源码改动不影响 npm ci 缓存

# 4. 合并 RUN
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl vim git && \
    rm -rf /var/lib/apt/lists/*   # 清理 apt 缓存

# 5. .dockerignore
# .dockerignore
node_modules
.git
*.log
.env
.DS_Store
```

### 八、安全最佳实践

```bash
# 1. 不要用 root 运行
docker run -u 1000:1000 myapp

# 2. 只读文件系统
docker run --read-only --tmpfs /tmp myapp

# 3. 限制资源
docker run -m 512m --cpus=0.5 --pids-limit=100 myapp

# 4. 镜像扫描
docker scout cves myapp:v1
docker scan myapp:v1

# 5. 最小权限
docker run --cap-drop ALL --cap-add NET_BIND_SERVICE myapp
docker run --security-opt no-new-privileges myapp

# 6. 用官方/受信任镜像
docker pull nginx:1.25-alpine      # 官方
docker pull bitnami/postgresql     # 商业公司维护
```

## 核心洞察

- **Docker 革命性在"镜像"概念**：把环境封装成不可变工件，告别"在我机器上能跑"
- **Docker 镜像分层是核心创新**：每层是文件 diff，多镜像共享基础层，节省存储
- **Docker 的 namespace + cgroup 实现隔离**：复用宿主机内核，性能损失 <5%
- **Dockerfile 最佳实践是"小而精"**：每层做一件事，复用缓存，最终阶段干净
- **Multi-stage build 是关键技巧**：构建环境 vs 运行环境分离，镜像缩 10x
- **Docker Compose 适合单机多容器**：开发环境首选，K8s 接管生产
- **Docker 不是 VM**：容器共享内核，启动秒级、密度高
- **Docker 在 Mac/Windows 上是 VM 内运行**：底层是 LinuxKit VM
- **Docker Hub 是 C 位**：超百万公开镜像，但需注意安全扫描
- **Docker 在 K8s 时代的角色变化**：K8s 用 containerd/CRI-O，Docker Engine 退居 CLI
- **OCI 标准统一容器生态**：image-spec / runtime-spec 让 Podman / containerd 兼容 Docker 镜像
- **Docker 与 Wasm 集成（2023+）**：runwasi 让容器跑 Wasm，与传统容器并存

## 跨项目引用

- **[[kubernetes]]**：K8s 编排 Docker 容器（实际用 containerd/CRI-O）
- **[[linux]]**：Docker 基于 Linux namespace + cgroup
- **[[nginx]]**：Docker 部署 Nginx 极常见
- **[[postgresql]]** / **[[mysql]]** / **[[redis]]**：数据库都打 Docker 镜像
- **[[git]]**：CI/CD 中 Docker 与 Git 强绑定
- **[[github actions]]** / **[[jenkins]]**：CI 平台用 Docker 跑构建
- **[[prometheus]]** / **[[grafana]]**：用 Docker 部署监控栈
- **[[terraform]]** / **[[ansible]]**：基础设施即代码与容器编排
- **[[grpc]]**：容器间通信用 gRPC
- **[[docker compose]]**：Compose 是 Docker 官方多容器编排
- **[[podman]]**：Podman 是 Docker 的无守护进程替代
- **[[containerd]]**：K8s 实际使用的容器运行时

## 深入：Docker 镜像分层与 UnionFS

### 分层原理

Docker 镜像本质是**有顺序的只读文件系统层**的集合，底层依赖 UnionFS（联合文件系统）如 AUFS、Overlay2、btrfs、devicemapper。当容器运行时，Docker 在镜像层之上添加一个**薄可写层**（thin writable layer），容器内所有修改都写入该层，镜像本身保持不变。

**典型镜像结构**（以 Node.js 应用为例）：

```
Layer 5 (top, writable):  容器运行时层     ~  0 KB
Layer 4:  CMD ["node","app.js"]            ~  0 B
Layer 3:  COPY . .                         ~  5 MB
Layer 2:  RUN npm ci                        ~ 120 MB
Layer 1:  COPY package*.json ./            ~  2 KB
Layer 0 (base): node:20-alpine              ~ 50 MB
```

**关键事实**：

- 每一层在构建时生成唯一的 **SHA256 摘要**，作为缓存键
- 上游层未变则下游层可复用，缓存命中极大加速构建
- `docker history <image>` 显示每层大小和创建命令
- 多个镜像共享 base 层（pull / build 节省磁盘与网络）
- 容器删除时，可写层随之销毁；未持久化数据丢失
- `COPY` / `ADD` / `RUN` 创建新层；其他元数据指令（`ENV`、`LABEL`、`EXPOSE`）不创建独立层而是写入镜像配置 JSON

### 层缓存机制

构建器维护一个本地**层缓存**（Linux：`/var/lib/docker/buildkit/cache`；旧版：`/var/lib/docker/overlay2`），命中规则：

1. 比较当前指令与缓存中同一位置的指令字符串（v1 builder）
2. 比较该指令及其父层 SHA（BuildKit 严格模式）
3. 命中则跳过执行，复用上次结果

**失效最常见原因**：

- 文件内容变化（如 `COPY . .`）
- 时间戳变化（用 `--no-cache` 强制、`-mtime` 排除）
- 环境变量（`ENV`）修改
- 父层变化（base 镜像更新）
- `RUN` 命令字符串变化（即便等价也会失效）

**实战技巧**：把"不常变"的层放在前面：

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./   # 依赖文件单独 COPY
RUN npm ci --omit=dev                    # 单独一层，安装慢
COPY . .                                 # 源码 COPY，最后一层
RUN npm run build
```

源码变化只导致最后一两层失效，npm 依赖层继续命中缓存。

### UnionFS 选型

Docker 主流存储驱动对比（Linux）：

| 驱动 | 适用内核 | 优点 | 缺点 |
|---|---|---|---|
| **overlay2** | 4.0+ | 现代、稳定、Docker 默认 | 无显著缺点 |
| **btrfs** | 3.16+ | 快照、CoW | 需要 btrfs 文件系统 |
| **devicemapper** | RHEL 旧版 | 块级 | 已弃用 |
| **aufs** | Ubuntu 旧版 | 历史悠久 | 内核未合并，需 patch |
| **zfs** | 支持 | 快照、压缩 | 内存占用较高 |

配置存储驱动（`/etc/docker/daemon.json`）：

```json
{
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ]
}
```

Docker Desktop for Mac / Windows 实际上跑在轻量 LinuxKit VM 里，通过 virtiofs 实现 host 与 VM 之间的文件共享——这是 Mac 上 bind mount 性能曾长期糟糕的根因。Docker Desktop 4.x 引入 **virtiofs** 显著提升 bind mount IO。

## 深入：基础镜像选型（alpine / slim / distroless）

### 三大流派对比

| 镜像 | 大小 | 包管理 | C 库 | 兼容性 | 安全 | 适用 |
|---|---|---|---|---|---|---|
| `ubuntu:22.04` | ~70 MB | apt | glibc | 100% | 中 | 开发、通用 |
| `debian:bookworm-slim` | ~25 MB | apt | glibc | 99% | 中 | 主流生产 |
| `alpine:3.19` | ~5 MB | apk | musl | 95% | 高 | 极小体积 |
| `gcr.io/distroless/*` | ~20 MB | 无 | glibc | 100% | 极高 | 生产强化 |
| `scratch` | 0 MB | 无 | 自带 | 需静态编译 | 极高 | Go、Rust |

### Alpine 的坑

`alpine` 用 **musl libc** 而非 **glibc**，常导致：

- 预编译二进制（如 Node.js 官方、Chromium、原生扩展）找不到正确 glibc
- DNS 解析在 musl 下行为不同（`go` 1.20+ 修复了部分）
- Python 轮子（pandas、numpy）需 musl 版本
- Node.js 原生模块（bcrypt、sharp、canvas）需 musl 编译
- 时区数据、locale、tzdata 缺失，需 `apk add tzdata`

**应对**：

- Node 务必用 `node:20-alpine`，**不要**用 `node:20` 强行 `apk add`
- Go 用 `golang:1.21-alpine` 编译 + `alpine` 运行；或 `scratch` 完全静态
- Python 用 `python:3.12-alpine` + `apk add --no-cache gcc musl-dev` 装构建依赖
- 若依赖复杂、稳定性优先，选 `debian:bookworm-slim` 或 `gcr.io/distroless`

### Distroless 实战

Google 的 `gcr.io/distroless/*` 镜像仅包含**运行时必需**：CA 证书、tzdata、glibc、libssl 等，**无 shell、无包管理器、无 bash**。攻击面大幅减小。

```dockerfile
# Go 应用 distroless 构建
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/app .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/app /app
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app"]
```

镜像体积 ~10 MB，无 shell 即使被入侵也难以横向移动。

### 镜像瘦身清单

1. **多阶段构建**：构建期 1.5 GB → 运行期 15 MB（Go 典型）
2. **Alpine / distroless**：换 base 镜像
3. **清理 apt 缓存**：`rm -rf /var/lib/apt/lists/*`
4. **合并 RUN**：每条 `RUN` 是一层，合并减少层数和元数据
5. **`.dockerignore`**：阻止无关文件进 build context
6. **Dive 分析**：`dive myapp:v1` 看每层大小，找出"意外大文件"
7. **压缩优化**：用 `docker-slim`、`docker-squash`（慎用，会丢层信息）
8. **JLink / UPX**（Java / Go）：压缩二进制
9. **剥离符号**：`go build -ldflags="-s -w"`、Rust `strip`
10. **避免 COPY 大文件**：日志、二进制产物、`.git` 务必忽略

## 深入：Dockerfile 指令逐条精讲

### FROM

- 必须是**第一条**指令
- 任何镜像都依赖 base，`scratch` 表示空 base（仅静态二进制）
- `AS <alias>` 命名阶段，供后续 `COPY --from=<alias>`
- 可被 `ARG` 提前定义（Docker 17.05+）：

```dockerfile
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS base
```

- 多 base 镜像管理推荐用 **Dockerfile 多文档模式**或 **Bake**

### RUN

- 镜像构建时执行，结果写入新层
- **总是用数组形式**（exec 形式），避免 shell 字符串注入
- 合并命令用 `&&`，清理用 `;` 或 `&&`：

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        curl=7.88.1-10 \
        ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -r requirements.txt
```

- `--no-install-recommends` 省体积
- 固定版本号（`curl=7.88.1-10`）保证可复现

### COPY vs ADD

| 特性 | COPY | ADD |
|---|---|---|
| 复制本地文件 | ✅ | ✅ |
| 远程 URL | ❌ | ✅（不推荐，应改用 curl） |
| 自动解压 tar | ❌ | ✅（仅本地 tar.gz） |
| 推荐 | ✅ | 仅在确实需要时用 |

**最佳实践**：永远用 `COPY`，把"下载/解压"显式写出来更可控：

```dockerfile
# 错误
ADD https://example.com/big.tar.gz /tmp/

# 正确
RUN curl -fsSL https://example.com/big.tar.gz -o /tmp/big.tar.gz \
 && tar -xzf /tmp/big.tar.gz -C /opt \
 && rm /tmp/big.tar.gz
```

### WORKDIR

- 设置**后续指令的工作目录**
- 不存在会自动创建（**`RUN mkdir` 不需要**）
- 多次使用是相对路径
- 推荐**显式绝对路径**：

```dockerfile
WORKDIR /app
WORKDIR /src         # 现在是 /app/src
RUN pwd              # /app/src
```

### USER

- 切换运行用户（UID:GID）
- 强烈推荐**非 root**：

```dockerfile
RUN addgroup -g 1001 -S app && adduser -S -u 1001 -G app app
USER app
```

或在 `docker run -u 1000:1000` 覆盖。

- 数字 UID 优于用户名（避免镜像传输时丢用户映射）

### ENV vs ARG

| 类型 | 作用域 | 持久性 | 可见于镜像 |
|---|---|---|---|
| `ARG` | 构建时 | 不进镜像，运行时不可见 | 否 |
| `ENV` | 构建时 + 运行时 | 进镜像 | 是（`docker inspect`） |

- **构建参数**（`--build-arg`）→ `ARG`
- **运行时配置**（环境变量）→ `ENV`
- 敏感信息**不要用 `ENV` 存密码**！用 **Docker secrets**（Swarm）、**BuildKit secrets**、**运行时挂载**、**Vault / KMS**

```dockerfile
ARG VERSION=latest
ARG SECRET_TOKEN   # 不要保留到镜像
ENV APP_VERSION=$VERSION
ENV PATH=/app/bin:$PATH
```

### ENTRYPOINT vs CMD

- **CMD**：默认参数，可被 `docker run <image> <args>` 覆盖
- **ENTRYPOINT**：主命令，不会被覆盖（除非加 `--entrypoint`）

**exec 形式**（推荐）：`["executable", "arg1"]`
**shell 形式**（避免）：`command arg1`（实际是 `/bin/sh -c "command arg1"`，信号处理不友好）

**两种组合**：

```dockerfile
# 模式 1：固定命令 + 可变参数
ENTRYPOINT ["python", "app.py"]
CMD ["--port", "8080"]       # docker run myapp --port 9090

# 模式 2：shell 脚本包装
COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
CMD ["default-arg"]
```

**Signal 陷阱**：shell 形式下 PID 1 是 `sh`，不转发 SIGTERM，容器不会优雅关闭。**用 exec 形式或 `exec` 命令**：

```bash
#!/bin/bash
exec python app.py "$@"
```

### EXPOSE / VOLUME

- `EXPOSE 80`：仅**声明**，不实际发布；只是镜像元数据
- `docker run -p 8080:80` 才真正映射
- `VOLUME /data`：声明匿名卷挂载点（无值则为匿名卷）

```dockerfile
EXPOSE 8080
VOLUME ["/var/lib/app/data"]
```

**陷阱**：`VOLUME` 之后的指令对该路径的修改会被丢弃！

```dockerfile
VOLUME /data
RUN touch /data/marker   # 看似写入，实际被 VOLUME 后的初始化覆盖
```

**正确做法**：先 `RUN` 准备数据，再 `VOLUME`。

### HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:8080/health || exit 1
```

- `--start-period`：容器启动后等待时间（避免慢启动误判）
- `--interval`：检测间隔
- `--timeout`：单次超时
- `--retries`：连续失败次数判定 unhealthy
- 不支持 shell 形式（`&&` 等），需用 `bash -c`：

```dockerfile
HEALTHCHECK CMD bash -c 'curl -fsS http://localhost:8080/health | grep ok || exit 1'
```

状态值：`starting` → `healthy` / `unhealthy`。`docker ps` 显式 `STATUS` 列。

### LABEL / STOPSIGNAL

- `LABEL` 元数据，便于搜索、过滤：

```dockerfile
LABEL org.opencontainers.image.title="myapp" \
      org.opencontainers.image.version="1.2.0" \
      org.opencontainers.image.source="https://github.com/me/myapp"
```

- `STOPSIGNAL SIGTERM`：自定义停止信号。`exec` 形式下默认 `SIGTERM`，但 `nginx`、`postgres` 等建议显式声明

### ONBUILD

- 子镜像构建时触发（`ONBUILD RUN npm install`），已被弃用，少用

## 深入：多阶段构建（Multi-stage Builds）

### 模式 1：构建/运行分离（Go）

```dockerfile
# syntax=docker/dockerfile:1.7
ARG GO_VERSION=1.22
FROM golang:${GO_VERSION}-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/app .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/app /app
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app"]
```

- `CGO_ENABLED=0` 静态链接，配合 `scratch` 或 `distroless/static`
- `-trimpath` 去掉文件路径避免泄露源码
- `-ldflags="-s -w"` 去掉符号表
- 大小：~10 MB（vs 完整镜像 800 MB）

### 模式 2：多阶段复用层

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM deps AS builder
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
USER node
CMD ["node", "dist/main.js"]
```

**关键**：`deps` 阶段给 `builder` 共享 `node_modules`，无需重复 `npm ci`。

### 模式 3：多产物分发

```dockerfile
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN make build-linux && make build-darwin && make build-windows

FROM scratch AS linux
COPY --from=builder /src/bin/myapp-linux /myapp

FROM scratch AS darwin-amd64
COPY --from=builder /src/bin/myapp-darwin /myapp

FROM scratch AS windows
COPY --from=builder /src/bin/myapp.exe /myapp.exe
```

构建时 `docker build --target linux .` 选择产物。

### 模式 4：测试阶段

```dockerfile
FROM builder AS test
RUN go test ./...
```

CI 中可先 `--target test` 跑测试，再 `--target runtime` 出生产镜像。

### BuildKit 高级特性

启用 BuildKit（Docker 23.0+ 默认开启）：

```bash
DOCKER_BUILDKIT=1 docker build .
```

**特性 1：并行构建**——独立阶段并发执行。

**特性 2：缓存挂载**：

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm run build
```

- 缓存 `npm` 目录，跨构建复用
- 比传统 `RUN npm cache clean` 激进：缓存可跨 RUN 复用

**特性 3：构建密钥**（推荐）：

```dockerfile
RUN --mount=type=secret,id=github_token \
    curl -H "Authorization: token $(cat /run/secrets/github_token)" https://api.github.com/...
```

```bash
docker build --secret id=github_token,src=$HOME/.github_token .
```

密钥**不会**写入镜像层，比 `--build-arg` 安全得多。

**特性 4：SSH 转发**：

```dockerfile
RUN --mount=type=ssh \
    git clone git@github.com:me/private-repo.git /src
```

```bash
docker build --ssh default .
```

**特性 5：Bake（HCL/JSON 编排）**——`docker buildx bake`：

```hcl
# docker-bake.hcl
target "app" {
  dockerfile = "Dockerfile"
  context = "."
  tags = ["myapp:${TAG}"]
  platforms = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=registry,ref=myapp:cache"]
  cache-to = ["type=registry,ref=myapp:cache,mode=max"]
}
```

一次性构建多镜像多平台。

**特性 6：SBOM 与 provenance**（Docker 23+）：

```bash
docker buildx build --provenance=true --sbom=true -t myapp:v1 .
```

镜像内嵌 SLSA provenance 与 SPDX SBOM。

## 深入：.dockerignore 详解

`.dockerignore` 与 `.gitignore` 语法相似（`!` 反向、`#` 注释、`*` 通配），但作用于**构建上下文**：

```
# 版本控制
.git
.gitignore
.gitattributes

# 依赖
node_modules
**/node_modules
venv
__pycache__
*.pyc
**/__pycache__/

# 构建产物
dist
build
target
*.exe
*.dll
*.so
*.dylib
coverage

# IDE
.vscode
.idea
*.swp
*.swo
.DS_Store
Thumbs.db

# 日志和临时
*.log
*.tmp
.cache
.turbo
.next
.nuxt

# 环境配置
.env
.env.*
!.env.example

# Docker
Dockerfile
.dockerignore
docker-compose*.yml

# 文档
README.md
docs
CHANGELOG.md
```

**为什么重要**：

- `COPY . .` 会扫整个 context，文件越多构建越慢
- 大文件（`node_modules`、`.git`）传进 daemon 浪费几秒到几分钟
- **安全**：避免 `.env`、`.git/config` 误进镜像（即使你不用，攻击者可读 `docker history`）
- 调试：`docker build --no-cache --progress=plain .` 看实际 context

**调试工具**：

```bash
docker buildx build --print=manifest .     # 看 context 大小
tar -czf - -T .dockerignore | wc -c        # 估算 context 体积
```

## 深入：ENTRYPOINT 包装脚本

很多应用启动前需要做：等待 DB、迁移、加载配置。`entrypoint.sh` 是常见模式：

```bash
#!/bin/sh
set -e

# 等待依赖
echo "Waiting for postgres..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT"; do
  echo "still waiting..."
  sleep 2
done

# 数据库迁移
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running migrations..."
  alembic upgrade head
fi

# 日志
echo "Starting app on port ${PORT:-8080}"

# exec 替换 shell 进程，让 app 收到 SIGTERM
exec "$@"
```

```dockerfile
COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["entrypoint.sh"]
CMD ["python", "app.py"]
```

**注意 `tini`**：处理僵尸进程、信号转发：

```dockerfile
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "app.js"]
```

Docker 23+ 通过 `init: true`（Compose）或 `--init` 自动加 tini。

## 深入：Docker Compose 完全指南

### 核心概念

- **services**：容器定义
- **networks**：网络（默认所有 service 加入 `default` 网络）
- **volumes**：命名卷或 bind mount
- **configs / secrets**：Swarm 模式下的配置注入
- **profiles**：可选服务分组（`--profile dev`）

### 完整示例：典型 Web 应用

```yaml
# compose.yaml (Compose v2+)
name: myapp

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_ENV=production
    image: myapp/web:${TAG:-latest}
    ports:
      - "8080:8080"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://app:secret@db:5432/myapp
      REDIS_URL: redis://cache:6379/0
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    volumes:
      - app-uploads:/app/uploads
      - ./config:/app/config:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
    networks:
      - frontend
      - backend

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: myapp
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  cache:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - backend

  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - web
    networks:
      - frontend

volumes:
  db-data:
  redis-data:
  app-uploads:
    driver: local
    driver_opts:
      type: nfs
      o: addr=10.0.0.1,rw
      device: ":/exports/app-uploads"

networks:
  frontend:
  backend:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: br-backend
```

### Compose 常用模式

**1. 多环境 profile**：

```yaml
services:
  app:
    profiles: ["default"]
  app-debug:
    profiles: ["dev"]
    extends:
      service: app
    command: ["python", "-m", "pdb", "app.py"]
    ports:
      - "5678:5678"
```

```bash
docker compose --profile dev up -d
```

**2. 继承（extends）**：

```yaml
services:
  base:
    image: nginx:alpine
    environment:
      TZ: Asia/Shanghai

  web:
    extends: { service: base }
    ports: ["8080:80"]

  api:
    extends: { service: base }
    command: ["nginx", "-c", "/etc/nginx/api.conf"]
```

**3. .env 文件**：

```
# .env
TAG=v1.2.3
DB_PASSWORD=topsecret
```

Compose 自动加载同目录 `.env`。`${VAR:-default}` 支持默认值。

**4. 模板变量**：

```yaml
services:
  app:
    image: myapp:${TAG:-latest}
    ports:
      - "${PORT:-8080}:8080"
```

**5. depends_on 等待策略**：

```yaml
depends_on:
  db:
    condition: service_healthy   # 等 healthy 状态
  cache:
    condition: service_started
```

仅 v2 支持。

**6. 共享配置（merge）**：

```yaml
# compose.override.yml 自动叠加
services:
  web:
    volumes:
      - ./src:/app/src   # 覆盖默认
```

**7. 健康检查 + restart 联动**：

```yaml
services:
  app:
    restart: on-failure:5
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost/health"]
      interval: 5s
      retries: 3
```

unhealthy 时 Docker 不会自动重启，需结合外部 orchestrator 或脚本。

### Compose v1 vs v2

| 项 | Compose v1（python） | Compose v2（Go） |
|---|---|---|
| 命令 | `docker-compose` | `docker compose` |
| 性能 | 慢 | 快 5-10x |
| 维护 | 已弃用（2023） | 活跃 |
| 兼容性 | YAML 1.x | YAML 2.x |

迁移：

```bash
docker compose -f docker-compose.yml convert > compose.yaml
```

或直接修改：去掉 `version:` 字段（v2 隐式即可），合并 `links` 到 `networks`，`depends_on` 改用 `condition`。

### Compose 与生产

Compose 适合开发与单机部署，**不适合 K8s 场景**。生产多机用：

- **Swarm**（Docker 原生）
- **Kubernetes**（主流）
- **Nomad**（HashiCorp）

把 Compose 转 K8s：

- `kompose convert -f docker-compose.yml -o k8s.yaml`
- 手动用 Helm chart 重建

## 深入：网络模型

### 驱动类型

| 驱动 | 作用域 | 特点 | 用途 |
|---|---|---|---|
| `bridge` | 单机 | 默认、容器间互通 | 开发、小型部署 |
| `host` | 单机 | 容器共享主机网络栈 | 高性能、低延迟 |
| `none` | 单机 | 仅有 loopback | 离线任务、CI |
| `overlay` | 多机 | 跨主机 VXLAN | Swarm / K8s |
| `macvlan` | 单机 | 容器有独立 MAC | 传统网络、监控 |
| `ipvlan` | 单机 | 共享 MAC、独立 IP | 公有云 |
| `custom` | 第三方 | CNI 插件 | Calico / Flannel |

### 自定义 bridge 最佳实践

```bash
# 创建带子网的自定义网络
docker network create \
  --driver bridge \
  --subnet 172.20.0.0/16 \
  --ip-range 172.20.240.0/20 \
  --gateway 172.20.0.1 \
  --opt com.docker.network.bridge.name=docker-mynet \
  mynet

# 容器加入
docker run -d --name web --network mynet nginx
docker run -d --name db --network mynet postgres

# DNS 自动解析容器名（自定义网络才有，默认 bridge 需 --link）
docker exec web nslookup db
```

**为什么不推荐默认 bridge**：

- 容器名不解析（需 `--link`，已弃用）
- 缺少可配置子网
- 没有自定义网关、MTU

### Host 网络

```bash
docker run -d --network host --name perf-test myapp
```

- 容器直接用主机 IP + 端口，**无端口映射**
- 性能最高（无 NAT 损耗）
- 适合：监控 agent、负载均衡器、高性能网络服务
- 缺点：端口冲突、容器间无网络隔离

### Overlay 网络（多机）

```bash
docker swarm init
docker network create --driver overlay --attachable my-overlay
```

```bash
# 节点 B 加入 swarm
docker swarm join --token <token> <manager-ip>:2377

# 跨主机容器互联
docker service create --network my-overlay --name web nginx
```

底层 VXLAN 隧道，K8s 用类似原理（Calico / Flannel / Cilium）。

### Macvlan / IPvlan

```bash
docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 my-macvlan
```

容器在物理网络中是**独立设备**，可被路由器、DHCP 服务器发现。适用于需要容器以"独立主机"身份出现的场景（旧版 VMware 镜像、监控设备仿真）。

### 端口暴露与端口范围

```yaml
# compose.yaml
services:
  app:
    ports:
      - "80:80"                    # 主机:容器
      - "9000-9100:9000-9100"      # 端口范围
      - "127.0.0.1:3306:3306"      # 绑定 IP
      - "8080:80/tcp"              # 协议
      - "8080:80/udp"
      - mode: host                 # 主机网络
        target: 80
        published: "8080"
```

### 容器内 DNS

```yaml
services:
  app:
    dns:
      - 8.8.8.8
      - 1.1.1.1
    dns_search:
      - example.com
    dns_opt:
      - use-vc
```

或 `docker run --dns 8.8.8.8 --dns-search example.com`。

### 流量控制（TC）

Linux `tc` 工具可在容器 veth 接口上做限速：

```bash
# 限速 1Mbps
docker exec web tc qdisc add dev eth0 root tbf rate 1mbit burst 32kbit latency 400ms
```

Compose 内置 `network_mode: service:web` 让多个容器共享网络命名空间（sidecar 模式）。

## 深入：存储与卷

### 三种挂载对比

| 类型 | 路径位置 | 性能 | 持久性 | 共享 |
|---|---|---|---|---|
| **Volume** | `/var/lib/docker/volumes/` | 高 | ✅ 容器删除仍在 | ✅ 跨容器 |
| **Bind mount** | 主机任意路径 | 高 | ✅ 与主机一致 | ✅ 跨容器 |
| **tmpfs** | 内存 | 最高 | ❌ 重启丢失 | ❌ |

### Volume 详解

```bash
docker volume create --driver local \
  --opt type=nfs \
  --opt o=addr=10.0.0.1,rw \
  --opt device=:/exports/data \
  nfs-volume

docker run -v nfs-volume:/data nginx
```

**Volume drivers**：local、nfs、rexray、convoy、cloud（aws/ gce/ azure）。

### Bind mount

```bash
docker run -v $(pwd):/app:ro -w /app node:20 npm test
```

`:ro` 只读，防止容器意外修改主机文件。

**开发工作流**：

```yaml
# compose.yaml
services:
  app:
    volumes:
      - ./:/app                       # 源码
      - /app/node_modules             # 容器内路径，匿名卷，保留依赖
      - /app/.next                    # 缓存
    command: npm run dev
```

`:/app/node_modules` 是**空挂载**，覆盖 bind mount，防止主机覆盖容器内的 `node_modules`。

### tmpfs 内存盘

```bash
docker run --tmpfs /tmp:rw,size=64m myapp
```

敏感信息（token、临时密钥）放在 tmpfs，不进镜像、不进磁盘。

### 数据备份与恢复

```bash
# 备份
docker run --rm \
  -v mydata:/source:ro \
  -v $(pwd):/backup \
  alpine tar -czf /backup/mydata-$(date +%F).tar.gz -C /source .

# 恢复
docker run --rm \
  -v mydata:/target \
  -v $(pwd):/backup \
  alpine tar -xzf /backup/mydata-2026-06-04.tar.gz -C /target
```

### 跨主机卷

- **NFS** / **CIFS**：最简单
- **GlusterFS / CephFS**：分布式
- **云存储**：AWS EFS、Azure Files、GCP Filestore
- **RexRay**：云无关的统一驱动
- **Longhorn**（K8s）、**OpenEBS**：云原生块存储

## 深入：资源限制

### CPU

```bash
docker run --cpus=1.5 myapp           # 最多 1.5 CPU
docker run --cpuset-cpus="0,1" myapp  # 限定 CPU 0 和 1
docker run --cpu-shares=512 myapp     # 相对权重（默认 1024）
```

Compose：

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: "1.5"
        reservations:
          cpus: "0.5"
```

### 内存

```bash
docker run -m 512m myapp                 # 硬限制
docker run --memory-reservation 256m     # 软预留
docker run --memory-swap 1g              # 总内存 + swap
docker run --oom-kill-disable myapp      # 禁止 OOM killer
docker run --oom-score-adj 500           # OOM 优先级
```

### 磁盘 IO

```bash
docker run --device-read-bps /dev/sda:1mb   # 读带宽
docker run --device-write-bps /dev/sda:1mb  # 写带宽
docker run --device-read-iops /dev/sda:1000 # 读 IOPS
```

### PIDs

```bash
docker run --pids-limit 100 myapp   # 限制进程数
```

### ulimits

```bash
docker run --ulimit nofile=65535:65535 myapp
docker run --ulimit nproc=2048 myapp
```

### 监控

```bash
docker stats                # 实时 CPU/内存/网络
docker stats --no-stream    # 一次性快照
docker system df            # 镜像/卷/构建缓存占用
docker system events        # 事件流
```

## 深入：日志系统

### 默认 json-file 驱动

```bash
docker logs web
docker logs -f --tail 100 --since 10m web
```

```json
# /var/lib/docker/containers/<id>/<id>-json.log
{"log":"Hello\n","stream":"stdout","time":"2026-06-04T..."}
```

### 限制日志大小

```yaml
# compose.yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

或 daemon 全局：`/etc/docker/daemon.json`：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

### 集中式日志驱动

| 驱动 | 用途 | 配置 |
|---|---|---|
| `json-file` | 本地 | 默认 |
| `syslog` | rsyslog | `syslog-address=tcp://...` |
| `journald` | systemd | 无参数 |
| `gelf` | Graylog | `gelf-address=udp://...` |
| `fluentd` | Fluentd | `fluentd-address=...` |
| `splunk` | Splunk | `splunk-token=...` |
| `awslogs` | CloudWatch | `awslogs-region=us-east-1` |
| `gcplogs` | GCP Logging | `gcp-project=...` |
| `logentries` | Logentries | token |

```bash
docker run --log-driver=gcplogs \
  --log-opt gcp-project=my-proj \
  --log-opt labels=env \
  myapp
```

### 日志最佳实践

- 应用输出 **JSON** 日志（Loki / ELK 友好）
- 用结构化字段（`level=error service=api`）而非纯文本
- stdout / stderr 都输出（json-file 区分 stream）
- 避免 `docker logs` 解析——接 sidecar 转发（Fluent Bit）
- 日志量大时用 `/dev/null` 抑制镜像内日志

## 深入：Dockerfile 优化（高级）

### 缓存优化的 6 大规则

1. **层合并**：单 `RUN` 多命令
2. **依赖前置**：`package.json` 单独 COPY，先 `npm ci`
3. **避免复制整个 context**：`.dockerignore`
4. **固定 base tag**：`node:20-alpine` 而非 `node:latest`
5. **利用 BuildKit 缓存挂载**：`--mount=type=cache`
6. **多阶段共享层**：`AS deps` 命名复用

### 实战：Python 应用极致优化

```dockerfile
# syntax=docker/dockerfile:1.7
ARG PYTHON_VERSION=3.12

FROM python:${PYTHON_VERSION}-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

FROM base AS deps
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=bind,source=requirements.txt,target=requirements.txt \
    pip install -r requirements.txt

FROM deps AS builder
COPY . .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -e . && \
    python -m compileall app

FROM base AS runtime
RUN groupadd -g 1001 -r app && useradd -u 1001 -r -g app app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /app /app
USER app
EXPOSE 8000
ENTRYPOINT ["python", "-m", "app.main"]
```

### 实战：Node.js 极简

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

FROM deps AS builder
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### 实战：Java + JLink

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /src
COPY . .
RUN ./mvnw -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine AS runtime
COPY --from=builder /src/target/app.jar /app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

JLink 可裁剪 JDK 模块到 50 MB：

```dockerfile
RUN jlink \
  --module-path "$JAVA_HOME/jmods" \
  --add-modules java.base,java.logging,java.sql,java.naming \
  --strip-debug --no-man-pages \
  --output /opt/jre-min
```

### 实战：Rust 静态二进制

```dockerfile
FROM rust:1.78 AS builder
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main(){}" > src/main.rs && \
    cargo build --release && \
    rm -rf src target/release/deps/myapp*
COPY src ./src
RUN cargo build --release --locked

FROM scratch
COPY --from=builder /src/target/release/myapp /myapp
USER 1001:1001
ENTRYPOINT ["/myapp"]
```

镜像 < 5 MB。
