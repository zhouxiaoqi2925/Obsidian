---
title: Linux
tags: [操作系统, 内核, 服务器, 命令行, 基础设施]
---

# Linux

## 前言

**定位**：开源类 Unix 操作系统内核，1991 年由 Linus Torvalds 发布至今是服务器、嵌入式、超级计算机、移动端（Android）的事实标准，全球 100% 超级计算机和 96%+ 公有云工作负载运行在 Linux 上。

**核心价值**：
- 真正的多用户、多任务、多线程操作系统
- 一切皆文件：统一的设备/进程/套接字抽象
- 强大的命令行：shell + 工具链组合（管道哲学）
- 开源、稳定、安全：内核模块化设计，长期维护

**五大特性**：
1. **内核架构**：宏内核 + 可加载模块（LKM），单内核性能高
2. **文件系统**：ext4 / xfs / btrfs / zfs，多种选择适配场景
3. **进程管理**：fork/exec、cgroup、namespace 容器基础
4. **网络栈**：TCP/IP 完整实现，netfilter 防火墙，eBPF 可编程
5. **权限模型**：POSIX ACL、SELinux/AppArmor、Capabilities 细粒度控制

**对比表**：

| 维度 | Linux | Windows | macOS | FreeBSD | Android |
|---|---|---|---|---|---|
| 内核 | 宏内核 | 混合内核 | XNU (混合) | 微内核 | Linux |
| 许可证 | GPL | 专有 | APSL/商业 | BSD | GPL |
| 包管理 | apt/yum/pacman | 无/winget | brew | pkg | apk |
| 服务器份额 | 96%+ | 3% | <1% | <1% | N/A |
| 适合 | 服务器/云 | 桌面/企业 | 创意/开发 | 网络设备 | 移动端 |

## 思维导图

```mermaid
mindmap
  root((Linux))
    内核
      进程调度
        CFS
        实时
      内存管理
        虚拟内存
        页缓存
        OOM
      文件系统
        VFS
        ext4 xfs
        btrfs zfs
      网络栈
        TCP/IP
        netfilter
        eBPF
      设备驱动
        模块
        udev
    发行版
      Debian系
        Ubuntu
        Mint
      Red Hat系
        CentOS
        Fedora
        RHEL
      Arch系
        Arch
        Manjaro
      SUSE
        openSUSE
      国产
        Deepin
        UOS
    命令行
      Shell
        bash zsh
        fish
      工具
        grep awk
        sed find
        xargs
      文本
        vim nano
        less cat
      文本处理
        sort uniq
        cut paste
        jq
    系统管理
      用户
        useradd
        sudo
      服务
        systemd
        systemctl
      进程
        ps top
        htop
      性能
        iostat
        vmstat
        sar
    网络
      配置
        ip nmcli
        netplan
      防火墙
        iptables
        nftables
        ufw
      远程
        ssh scp
        rsync
    安全
      权限
        rwx
        ACL
      能力
        capabilities
      SELinux
        MAC
      AppArmor
    容器基础
      namespace
        隔离
      cgroup
        限制
      overlayfs
        分层
    应用场景
      服务器
        Web DB
      云原生
        K8s
      嵌入式
        IoT
      超级计算
        HPC
      桌面
        开发
```

## 关键代码

### 一、文件与目录操作

```bash
# 目录操作
pwd                      # 当前目录
cd /path/to/dir          # 切换目录
ls -la                   # 详细列表（含隐藏文件）
ls -lh                   # 人类可读大小
mkdir -p a/b/c           # 递归创建
rmdir dir                # 删除空目录
rm -rf dir               # 强制递归删除（危险）

# 文件操作
touch file.txt           # 创建空文件/更新时间戳
cp src.txt dst.txt       # 复制
cp -r src/ dst/          # 递归复制目录
mv old.txt new.txt       # 重命名/移动
rm file.txt              # 删除文件
ln -s target linkname    # 软链接
ln target linkname       # 硬链接

# 查看文件
cat file.txt             # 全部输出
less file.txt            # 分页查看（q 退出）
head -n 10 file.txt      # 前 10 行
tail -n 10 file.txt      # 后 10 行
tail -f /var/log/syslog  # 实时跟踪日志

# 查找文件
find / -name "*.log"     # 按名字
find / -size +100M       # 按大小
find / -mtime -7         # 7 天内修改
locate nginx.conf        # 快速查找（需要 updatedb）
```

### 二、文本处理三剑客

```bash
# grep - 文本过滤
grep "error" log.txt                # 包含 error
grep -i "error" log.txt             # 忽略大小写
grep -r "TODO" src/                 # 递归目录
grep -n "function" file.js          # 显示行号
grep -E "^\d{3,}$" file.txt         # 正则
grep -v "debug" log.txt             # 反向（不含）
ps aux | grep nginx                 # 管道组合

# sed - 流编辑器
sed 's/old/new/g' file.txt          # 替换
sed -i 's/old/new/g' file.txt       # 原地修改
sed -n '10,20p' file.txt            # 打印 10-20 行
sed '/^$/d' file.txt                # 删除空行
sed 's/^\(.\)/\U\1/' file.txt       # 首字母大写

# awk - 文本分析
awk '{print $1}' file.txt           # 打印第一列
awk -F: '{print $1}' /etc/passwd    # 指定分隔符
awk '$3 > 100' file.txt             # 条件过滤
awk '{sum+=$1} END {print sum}' f   # 求和
awk 'NR==5' file.txt               # 第 5 行
```

### 三、权限管理

```bash
# 查看权限
ls -l file.txt
# -rw-r--r-- 1 user group 1024 Jan 1 12:00 file.txt
#  第一个字符：文件类型（- 普通文件，d 目录，l 链接）
#  后面 9 个字符：owner/group/others 的 rwx

# 数字模式 chmod
chmod 755 file.sh       # rwxr-xr-x
chmod 644 file.txt      # rw-r--r--
chmod 600 id_rsa        # rw------- (SSH 私钥必须)

# 符号模式 chmod
chmod u+x file.sh       # 用户加执行
chmod g-w file.txt      # 组去掉写
chmod o=r file.txt      # 其他只读
chmod a+r file.txt      # 所有人加读

# chown 改变所有者
chown user:group file.txt
chown -R www:www /var/www/

# sudo 提权
sudo apt update
sudo -i                  # 进入 root shell
sudo !!                  # 上一条命令加 sudo

# ACL 细粒度
setfacl -m u:alice:rwx file.txt
getfacl file.txt
```

### 四、进程管理

```bash
# 查看进程
ps aux                   # 静态快照
ps aux | grep nginx      # 过滤
top                      # 动态（q 退出）
htop                     # 增强版（需安装）

# 进程状态
# S - Sleeping
# R - Running
# D - Uninterruptible sleep
# Z - Zombie
# T - Stopped
# I - Idle (内核线程)

# 启动/停止
./script.sh &            # 后台运行
nohup ./script.sh &      # 退出终端不杀
nohup ./script.sh > out.log 2>&1 &

# 信号
kill PID                 # SIGTERM (优雅退出)
kill -9 PID              # SIGKILL (强制)
kill -HUP PID            # SIGHUP (重载配置)
pkill nginx              # 按名字杀
pkill -f "python app"    # 按命令行

# systemd 服务
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo systemctl enable nginx     # 开机启动
sudo systemctl status nginx
sudo journalctl -u nginx -f     # 跟踪日志

# 查看资源
free -h                  # 内存
df -h                    # 磁盘
du -sh /path             # 目录大小
iostat -x 1              # IO 统计
vmstat 1                 # 虚拟内存
```

### 五、网络配置与诊断

```bash
# IP 配置（iproute2 替代 ifconfig）
ip addr                  # 查看 IP
ip addr add 192.168.1.100/24 dev eth0
ip link set eth0 up
ip route                 # 路由表
ip route add default via 192.168.1.1

# DNS
cat /etc/resolv.conf
nslookup example.com
dig example.com
host example.com

# 网络诊断
ping -c 4 example.com
traceroute example.com
mtr example.com          # 实时路由追踪
curl -I https://example.com
wget https://example.com/file.zip

# 端口监听
ss -tlnp                 # 监听端口
ss -tnp 'sport = :80'    # 80 端口连接
netstat -tlnp            # 旧命令
lsof -i :8080            # 谁在用 8080

# 抓包
sudo tcpdump -i eth0 port 80
sudo tcpdump -i any -w capture.pcap
```

### 六、SSH 与远程

```bash
# 连接
ssh user@host
ssh user@host -p 2222            # 自定义端口
ssh -i ~/.ssh/id_rsa user@host   # 指定密钥

# 密钥认证
ssh-keygen -t ed25519 -C "alice@work"
ssh-copy-id user@host            # 推送公钥

# 配置文件 ~/.ssh/config
Host myserver
    HostName 192.168.1.100
    User alice
    Port 2222
    IdentityFile ~/.ssh/id_ed25519

# 端口转发
ssh -L 8080:localhost:80 user@host       # 本地转发
ssh -R 8080:localhost:80 user@host       # 远程转发
ssh -D 1080 user@host                    # 动态（SOCKS 代理）

# 传输文件
scp file.txt user@host:/path/
scp -r dir/ user@host:/path/
rsync -avz --progress src/ user@host:dst/
```

### 七、用户与组

```bash
# 用户管理
sudo useradd -m -s /bin/bash alice  # -m 创建 home
sudo passwd alice                    # 设置密码
sudo usermod -aG sudo alice          # 加入 sudo 组
sudo userdel -r alice                # 删除用户及 home

# 组管理
sudo groupadd developers
sudo gpasswd -a alice developers     # 用户加组
groups alice                          # 查看用户组

# 切换用户
su - alice                           # 切换到 alice（带环境）
sudo -u www-data bash                # 以特定用户运行

# 用户信息
id alice                             # uid/gid
whoami                               # 当前用户
who                                  # 登录用户
w                                    # 登录用户及活动
last                                 # 登录历史
```

### 八、systemd 深入

```bash
# 服务文件 /etc/systemd/system/myapp.service
[Unit]
Description=My Web Application
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/node /opt/myapp/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/etc/myapp/env

[Install]
WantedBy=multi-user.target
```

```bash
# 重新加载
sudo systemctl daemon-reload
sudo systemctl enable --now myapp

# 日志
sudo journalctl -u myapp -n 100     # 最后 100 行
sudo journalctl -u myapp --since "1 hour ago"
sudo journalctl -u myapp -f          # 实时跟踪
sudo journalctl -p err -b            # 本次启动的错误
```

### 九、性能监控

```bash
# CPU
top -bn1 | head -20
ps -eo pid,ppid,cmd,%cpu,%mem --sort=-%cpu | head

# 内存
free -h
cat /proc/meminfo

# 磁盘 IO
iostat -xz 1
iotop                  # 进程级 IO

# 网络
iftop                  # 网络带宽
nethogs                # 进程级网络

# 综合
vmstat 1 5
mpstat -P ALL 1
sar -u 1 5             # CPU 历史
sar -r 1 5             # 内存历史

# 火焰图（perf）
sudo perf record -F 99 -p PID -g -- sleep 30
sudo perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

## 核心洞察

- **Linux 的设计哲学是"小而美"的工具组合**：grep、sed、awk、find 单独简单，组合无敌
- **Linux 一切皆文件**：设备、进程、网络套接字都映射为文件，统一 API
- **Linux 管道（pipe）是其灵魂**：`cmd1 | cmd2 | cmd3` 组合出无限可能
- **POSIX 标准是 Linux 的契约**：遵循 POSIX 的程序可在任何 Unix 系统运行
- **Linux 内核的 cgroup + namespace 是容器基石**：Docker / K8s 都基于此
- **Linux 的 VFS 抽象统一了文件系统**：ext4、xfs、btrfs、nfs、procfs 都是 VFS 节点
- **systemd 取代了 SysV init**：并行启动、依赖管理、按需激活
- **Linux 的 eBPF 是革命性的**：让内核可编程，无侵入追踪/网络/安全
- **Linux 的发行版多样性是双刃剑**：选择多但碎片化（Snap/Flatpak/AppImage 试图统一）
- **Linux 的"稳定"≠"老"**：LTS 内核支持 5-6 年，企业级首选
- **Linux 的 SELinux/AppArmor 是 MAC**：超越传统 DAC 的强制访问控制
- **Linux 服务器绝大多数跑在 x86_64 + systemd + ext4/xfs**：CentOS/Ubuntu 是主力

## 跨项目引用

- **[[docker]]**：Docker 容器基于 Linux namespace + cgroup
- **[[kubernetes]]**：K8s 编排 Linux 容器
- **[[git]]**：Git 是 Linus Torvalds 为管理 Linux 内核代码而创造
- **[[nginx]]**：Nginx 跑在 Linux 上
- **[[redis]]**：Redis 主要部署在 Linux
- **[[postgresql]]** / **[[mysql]]** / **[[mongodb]]**：数据库都首选 Linux 部署
- **[[ssh]]**：SSH 是 Linux 远程管理的标准
- **[[systemd]]**：现代 Linux 服务的统一管理
- **[[prometheus]]** / **[[grafana]]**：Linux 监控的事实标准
- **[[ansible]]** / **[[terraform]]**：Linux 自动化运维
- **[[curl]]**：Linux 命令行 HTTP 工具
- **[[vim]]** / **[[neovim]]**：Linux 编辑器王者
