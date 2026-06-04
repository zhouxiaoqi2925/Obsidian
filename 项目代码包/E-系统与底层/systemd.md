---
title: systemd
tags: [Linux, 初始化, 服务管理, Unit, 进程]
---

# systemd

## 前言

**定位**：现代 Linux 系统和服务管理器，2010 年由 Lennart Poettering 发布至今是事实上的 Linux init 系统，主流发行版（Ubuntu/Debian/CentOS/RHEL/Fedora）默认采用，统一了启动、守护进程、日志、设备等管理。

**核心价值**：
- 并行启动：按依赖并行启动服务，加速开机
- 服务管理：标准化 Unit 文件
- 统一日志：journald 集中日志
- 设备管理：udev + systemd

**五大特性**：
1. **Unit 系统**：12 种 Unit 类型统一管理
2. **依赖解析**：基于依赖关系并行启动
3. **cgroups 集成**：进程资源隔离
4. **journald 日志**：二进制索引日志
5. **Socket 激活**：按需启动服务

**对比表**：

| 维度 | systemd | SysVinit | Upstart | OpenRC | runit |
|---|---|---|---|---|---|
| 并行启动 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 依赖管理 | 自动 | 手工 | 配置 | 配置 | 配置 |
| 日志 | journald | syslog | syslog | syslog | syslog |
| 配置文件 | .service | init.d 脚本 | .conf | .sh | ./run |
| 主流 | ✅ | ❌ 历史 | ⚠️ Ubuntu 旧版 | Gentoo | Void |

## 思维导图

```mermaid
mindmap
  root((systemd))
    核心
      Unit
      Target
      Service
      Timer
      Socket
    Unit 类型
      service
      socket
      target
      timer
      mount
      path
      device
      swap
      scope
      slice
    命令
      systemctl
      journalctl
      systemd-analyze
      hostnamectl
      loginctl
    服务
      Type
        simple
        forking
        oneshot
        notify
      Restart
      User
      Environment
    资源控制
      cgroups
      CPU
      Memory
      IO
    日志
      journald
      journalctl
      过滤
    目标
      multi-user
      graphical
      rescue
      emergency
    分析
      启动时间
      关键链
      失败排查
    应用
      服务守护
      定时任务
      设备挂载
      资源限制
```

## 关键代码

### 一、基础命令

```bash
# 服务管理
systemctl start nginx              # 启动
systemctl stop nginx               # 停止
systemctl restart nginx            # 重启
systemctl reload nginx             # 重载配置
systemctl status nginx             # 状态

# 开机启动
systemctl enable nginx             # 启用
systemctl disable nginx            # 禁用
systemctl is-enabled nginx         # 查询
systemctl enable --now nginx       # 启用并启动

# 列出服务
systemctl list-units --type=service
systemctl list-units --state=running
systemctl list-unit-files --type=service

# 系统状态
systemctl status                   # 系统总览
systemctl list-dependencies nginx  # 依赖关系
systemctl show nginx               # 详细属性

# 系统控制
systemctl reboot                   # 重启
systemctl poweroff                 # 关机
systemctl suspend                  # 挂起
systemctl hibernate                # 休眠
systemctl default                  # 切回默认 target
```

### 二、Unit 文件

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application Server
Documentation=https://example.com/docs
After=network-online.target
Wants=network-online.target
Requires=postgresql.service redis.service
Before=nginx.service

[Service]
# 进程类型
Type=notify                              # notify/simple/forking/oneshot/dbus/idle

# 启动命令
ExecStartPre=/usr/bin/mysqld --check    # 启动前
ExecStart=/usr/bin/myapp --config=/etc/myapp/config.yml
ExecStartPost=/bin/echo "Started"        # 启动后
ExecReload=/bin/kill -HUP $MAINPID      # 重载命令
ExecStop=/bin/kill -TERM $MAINPID       # 停止命令
ExecStopPost=/usr/bin/cleanup.sh        # 停止后

# 进程管理
Restart=on-failure                       # no/on-success/on-failure/on-abnormal/always
RestartSec=5s
TimeoutStartSec=60s
TimeoutStopSec=30s

# 工作目录
WorkingDirectory=/var/lib/myapp

# 环境变量
Environment=NODE_ENV=production
Environment=DB_HOST=db.example.com
EnvironmentFile=/etc/myapp/env

# 用户
User=myapp
Group=myapp

# 资源限制
LimitNOFILE=65536
LimitNPROC=4096
CPUQuota=200%
MemoryMax=2G

# 安全性
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/var/lib/myapp
ReadWritePaths=/var/lib/myapp/data
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
SystemCallArchitectures=native

# 退出码
SuccessExitStatus=0 1
RestartPreventExitStatus=4

[Install]
WantedBy=multi-user.target
```

```bash
# 重新加载
systemctl daemon-reload

# 启用并启动
systemctl enable --now myapp

# 查看
systemctl status myapp

# 编辑
systemctl edit myapp                  # 创建 override
systemctl edit --full myapp           # 完整编辑
```

### 三、Service Type

```ini
# Type=simple（默认）
# 启动命令在前台运行，systemd 立即认为服务启动
[Service]
Type=simple
ExecStart=/usr/bin/python3 /app/server.py

# Type=forking
# 启动命令 fork 后台进程
[Service]
Type=forking
PIDFile=/run/myapp.pid
ExecStart=/usr/bin/myapp --daemon

# Type=oneshot
# 执行一次后退出（用于初始化）
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/init-db.sh

# Type=notify
# 进程通过 sd_notify 通知 systemd 已就绪
[Service]
Type=notify
ExecStart=/usr/bin/myapp
NotifyAccess=main

# Type=dbus
# 通过 D-Bus 通知
[Service]
Type=dbus
BusName=org.example.myapp
ExecStart=/usr/bin/myapp
```

### 四、Timer 定时任务

```ini
# /etc/systemd/system/backup.service
[Unit]
Description=Daily Backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
User=backup
```

```ini
# /etc/systemd/system/backup.timer
[Unit]
Description=Daily Backup Timer

[Timer]
# 每天 2 点
OnCalendar=*-*-* 02:00:00

# 启动后 5 分钟（替代 @reboot）
OnBootSec=5min

# 启动后 1 小时
OnUnitActiveSec=1h

# 单位
# OnCalendar=*-*-* 02:00:00    # 每天 2 点
# OnCalendar=Mon..Fri 09:00     # 工作日 9 点
# OnCalendar=hourly             # 每小时
# OnCalendar=daily              # 每天
# OnCalendar=weekly             # 每周
# OnCalendar=*:0/15             # 每 15 分钟

Persistent=true           # 错过的执行会在开机后补上

[Install]
WantedBy=timers.target
```

```bash
# 启用
systemctl enable --now backup.timer

# 列出 timers
systemctl list-timers --all
systemctl list-timers --all --no-pager

# 查看
systemctl status backup.timer
```

### 五、Socket 激活

```ini
# /etc/systemd/system/myapp.socket
[Unit]
Description=My App Socket

[Socket]
ListenStream=0.0.0.0:8080
# ListenStream=/run/myapp.sock
# Accept=yes                    # 每个连接一个进程

[Install]
WantedBy=sockets.target
```

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My App

[Service]
ExecStart=/usr/bin/myapp
User=myapp

# 不需要 WantedBy（socket 触发）
```

```bash
# socket 触发 service 启动
systemctl start myapp.socket
```

### 六、日志（journald）

```bash
# 查看日志
journalctl                          # 全部
journalctl -u nginx                 # 指定服务
journalctl -u nginx -f              # 跟踪
journalctl -u nginx --since today   # 今天
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx --since "2026-06-01" --until "2026-06-04"
journalctl -p err                   # 错误级别
journalctl -p warning..err          # 范围
journalctl -b                       # 启动后
journalctl -b -1                    # 上一启动
journalctl --list-boots             # 列出启动
journalctl _PID=1234                # 按 PID
journalctl _UID=1000                # 按 UID
journalctl -k                       # 内核日志
journalctl -o json-pretty           # JSON 输出

# 清理
journalctl --vacuum-time=7d         # 保留 7 天
journalctl --vacuum-size=1G         # 保留 1G
journalctl --vacuum-files=10        # 保留 10 个文件
journalctl --rotate                # 立即轮转

# 磁盘占用
journalctl --disk-usage
```

```bash
# /etc/systemd/journald.conf
[Journal]
Storage=persistent                 # persistent/volatile/auto
SystemMaxUse=2G
SystemKeepFree=1G
SystemMaxFileSize=200M
MaxRetentionSec=1month
ForwardToSyslog=no
ForwardToWall=no
```

```bash
# 永久日志配置
mkdir -p /var/log/journal
systemctl restart systemd-journald

# 实时查看 + 过滤
journalctl -u nginx -f | grep "error"
```

### 七、依赖与启动顺序

```ini
[Unit]
# Wants: 弱依赖（失败不影响启动）
Wants=network-online.target

# Requires: 强依赖（失败导致本服务失败）
Requires=postgresql.service

# BindsTo: 强绑定（依赖服务停止，本服务也停）
BindsTo=redis.service

# PartOf: 部分依赖
PartOf=postgresql.service

# After: 启动顺序（在...之后）
After=network.target postgresql.service

# Before: 启动顺序（在...之前）
Before=nginx.service

# Conflicts: 冲突（不能同时启动）
Conflicts=myapp-old.service

# Condition: 条件
ConditionPathExists=/etc/myapp/config.yml
ConditionFileNotEmpty=/etc/myapp/secret
```

```bash
# 启动分析
systemd-analyze                     # 总启动时间
systemd-analyze blame               # 每个服务耗时
systemd-analyze critical-chain      # 关键链
systemd-analyze plot > boot.svg     # 启动图
systemd-analyze verify              # 检查 Unit 文件
```

### 八、资源控制（cgroups）

```ini
[Service]
# CPU
CPUQuota=200%                        # 最多 2 核
CPUWeight=100
CPUAccounting=yes

# 内存
MemoryMax=2G
MemoryHigh=1G                       # 软限制
MemorySwapMax=512M
MemoryAccounting=yes

# IO
IOWeight=100
IOReadBandwidthMax=/dev/sda 100M
IOWriteBandwidthMax=/dev/sda 50M
IOAccounting=yes

# 任务
TasksMax=4096

# Slice
Slice=myapp.slice
```

```ini
# /etc/systemd/system/myapp.slice
[Unit]
Description=MyApp Slice

[Slice]
CPUQuota=400%
MemoryMax=4G
```

```bash
# 查看资源使用
systemd-cgtop                        # 实时 top
systemctl status myapp               # 包含资源
systemd-cgls                         # 树形
```

### 九、模板与实例

```ini
# /etc/systemd/system/myapp@.service
[Unit]
Description=My App Instance %i

[Service]
ExecStart=/usr/bin/myapp --id=%i --port=8080
Environment=INSTANCE=%i
```

```bash
# 启动多个实例
systemctl start myapp@1
systemctl start myapp@2
systemctl start myapp@3

# 模板语法
# %n 完整名
# %i 实例名
# %p 前缀名
# %u 用户名
# %U 用户 UID
# %h 用户 home
# %t 运行目录
```

### 十、Target 与运行级别

```bash
# 列出 targets
systemctl list-units --type=target

# 查看当前 target
systemctl get-default
systemctl set-default multi-user.target

# 切换 target
systemctl isolate multi-user.target    # 切到多用户
systemctl isolate graphical.target     # 切到图形
systemctl isolate rescue.target        # 进入救援模式
```

```ini
# 常见 target
# poweroff.target       关机
# rescue.target         救援 shell
# multi-user.target     多用户命令行
# graphical.target      图形界面
# reboot.target         重启
# emergency.target      紧急模式（最简系统）
```

```ini
# 自定义 target
# /etc/systemd/system/mygroup.target
[Unit]
Description=My Service Group
Requires=myapp.service worker.service
After=myapp.service worker.service
```

### 十一、User 级别服务

```bash
# 用户级 systemd
systemctl --user start myapp
systemctl --user enable myapp
systemctl --user list-units

# 配置目录
# ~/.config/systemd/user/myapp.service
```

```ini
# ~/.config/systemd/user/myapp.service
[Unit]
Description=My User App

[Service]
ExecStart=/home/alice/bin/myapp
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
# 用户级服务在登录后启动（默认会停）
# 启用 lingering（即使未登录也运行）
loginctl enable-linger alice
```

### 十二、调试与故障排查

```bash
# 检查 Unit 文件
systemd-analyze verify /etc/systemd/system/myapp.service

# 详细日志
systemctl status myapp -l --no-pager
journalctl -u myapp -n 100 --no-pager

# 强制重启
systemctl reset-failed myapp
systemctl start myapp

# 调试模式
SYSTEMD_LOG_LEVEL=debug systemctl start myapp

# 跟踪进程
systemctl show myapp -p MainPID
strace -p <pid>

# 单元文件测试
systemd-run --unit=test -- /bin/echo hello
journalctl -u test
systemctl stop test
```

```bash
# 常见错误排查
# 1. ExecStart 路径错误
#    → systemctl status myapp 显示 "Failed at step EXEC"
# 2. 权限不足
#    → User= 字段设为 nobody
# 3. 依赖未启动
#    → systemctl list-dependencies myapp
# 4. cgroup 限制
#    → systemd-cgtop 看资源
# 5. 环境变量缺失
#    → EnvironmentFile 路径
# 6. 端口占用
#    → ss -tlnp | grep 8080
```

## 核心洞察

- **systemd 的"Unit 统一"是核心抽象**：12 种类型一套管理
- **systemd 的"并行启动"加速开机**：vs SysVinit 串行
- **systemd 的"依赖解析"自动化**：vs 手工写启动顺序
- **systemd 的"cgroups 集成"是资源控制**：原生支持
- **systemd 的"journald"是日志统一**：二进制索引易查询
- **systemd 的"Socket 激活"是按需启动**：节省资源
- **systemd 的"Timer"是定时任务**：替代 cron
- **systemd 的"OnFailure"是自动恢复**：服务挂了自动重启
- **systemd 的"环境变量"是配置标准化**：EnvironmentFile
- **systemd 的"Slice"是资源分组**：父子资源继承
- **systemd 在"嵌入式"场景被批评**：占用大、复杂
- **systemd 的"systemctl edit"是 override 机制**：不修改原文件
- **systemd 的"瞬态 Unit"是临时服务**：systemd-run
- **systemd 的"target"是虚拟服务组**：multi-user/graphical
- **systemd 的"blame"是性能分析工具**：找出慢服务
- **systemd 是 Linux 主流 init**：取代 SysVinit 已是事实

## 跨项目引用

- **[[linux]]**：systemd 是 Linux 主流 init
- **[[docker]]**：Docker 容器内用 systemd 或替代
- **[[kubernetes]]**：K8s 节点用 systemd 管理 kubelet
- **[[nginx]]**：Nginx 在 systemd 下管理
- **[[postgresql]]** / **[[mysql]]**：数据库在 systemd 下管理
- **[[redis]]** / **[[rabbitmq]]** / **[[kafka]]**：服务在 systemd 下管理
- **[[prometheus]]**：node_exporter 由 systemd 启动
- **[[grafana]]**：Grafana 在 systemd 下管理
- **[[ansible]]**：Ansible 用 systemd 模块
- **[[ssh]]**：sshd 是 systemd 服务
- **[[cron]]**：systemd Timer 替代 cron
- **[[bash]]**：bash 脚本在 systemd Unit 中运行
- **[[cgroups]]**：systemd 集成 cgroups
- **[[journald]]**：journald 是 systemd 日志组件
- **[[udev]]**：udev 是 systemd 设备管理
- **[[pid 1]]**：systemd 是 PID 1
