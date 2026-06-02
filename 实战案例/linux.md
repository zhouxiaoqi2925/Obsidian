# linux - 通用 Linux 命令手册：FD 一切皆文件 + fork/exec 进程模型 + systemd 服务管理

**GitHub**: torvalds/linux
**Star**: 185k+
**语言**: C / Shell / 工具链
**主题**: 操作系统 / 命令行 / Shell / 工具生态
**适用场景**: Linux 系统运维 / 服务器管理 / DevOps / 嵌入式开发 / 云原生

```
/usr/bin/         # 用户命令（ls/cd/cp/mv/grep）
/etc/             # 系统配置（systemd/network/sudoers）
/proc/<pid>/      # 进程信息（fd/status/maps）
/var/log/         # 日志（syslog/auth.log/journal）
/lib/systemd/     # systemd 单元（PID 1 总管）
```

## 第一段：基础范式

### 模式 1：文件描述符 + 一切皆文件

**问题场景**：进程要读写文件、socket、pipe、device，传统 API 每种资源一套接口。

**解决方案**：Linux 用 5 种文件描述符（FD）统一：0 stdin / 1 stdout / 2 stderr / 3+ 打开的文件/socket/pipe；`open() / read() / write() / close() / lseek()` 5 套系统调用统一操作；`/proc/<pid>/fd/` 看进程所有 FD；`lsof` 列出系统所有 FD。

**关键参数**：
- FD 0/1/2 标准
- `open/read/write/close`
- `/proc/<pid>/fd/`
- `lsof -p PID`
- ulimit FD 上限

**最佳实践**：进程 FD 泄漏 `lsof -p PID | wc -l` 监控；`ulimit -n 65535` 提高 FD 上限；网络服务用 `epoll` 而**不是** `select`；`strace -p PID -e trace=open,close` 跟踪 FD 操作。

---

### 模式 2：进程模型 fork + exec

**问题场景**：进程要"启动新程序"或者"复制自己"做并发，传统单进程难扩展。

**解决方案**：`fork()` 复制当前进程（COW 写时复制）；`execve()` 替换进程镜像；`clone()` 精细控制（线程）；`wait() / waitpid()` 父等子结束；`exit()` 退出 + `_exit()` 立即退出。组合 `fork+exec` 是 Unix 启动子进程标准范式。

**关键参数**：
- `fork()` 复制
- `execve()` 替换
- `clone()` 线程
- `wait/waitpid`
- 孤儿进程 / 僵尸进程

**最佳实践**：进程创建**总是** `fork+exec`；用 `posix_spawn` 替代 `fork+exec`（更安全）；`waitpid` 防僵尸；`prctl(PR_SET_PDEATHSIG)` 父死通知；线程用 `pthread_create` 而**不是** `clone`。

---

### 模式 3：信号机制（kill -9 的原理）

**问题场景**：进程要"通知其他进程"做某事（reload / 退出 / 调试）。

**解决方案**：64 种标准信号（SIGKILL/SIGTERM/SIGUSR1/SIGCHLD 等）；`kill -l` 列表；`kill -9 PID` 发 SIGKILL；进程 `signal()` / `sigaction()` 注册处理；`kill(pid, sig)` 系统调用发信号；`/proc/<pid>/status` 看挂起信号。信号是进程间异步通知机制。

**关键参数**：
- 64 标准信号
- `kill(pid, sig)`
- `signal / sigaction`
- 不可捕获信号 SIGKILL/SIGSTOP
- 实时信号 SIGRTMIN+

**最佳实践**：优雅退出**用** SIGTERM（让进程清理）**不要** SIGKILL（强杀丢数据）；reload 走 SIGUSR1（Nginx/Apache 标准）；子进程退出发 SIGCHLD；`trap '...' SIGTERM` 在 Shell 脚本里注册清理；调试用 `gdb handle SIGUSR1 nostop noprint`。

---

### 模式 4：管道 + 重定向（Pipe / Redirection）

**问题场景**：命令要"前一个输出给后一个输入"或者"输出到文件"。

**解决方案**：`|` 管道：前一个 stdout 给后一个 stdin；`>` 重定向 stdout 到文件；`<` 重定向 stdin 从文件；`>>` 追加；`2>&1` stderr 重定向到 stdout；`tee` 同时输出文件 + 屏幕；`xargs` 把 stdin 转命令行参数。Unix 哲学"小工具组合"。

**关键参数**：
- `|` 管道
- `>` / `<` 重定向
- `>>` 追加
- `2>&1` stderr
- `tee` 双路

**最佳实践**：`cmd 2>&1 | tee log.txt` 同时看 + 存；`xargs -I{} cmd {}` 占位符；`mkfifo` 命名管道；`/dev/stdin` / `/dev/stdout` 显式；Shell 脚本**总是** `set -euo pipefail` 严格模式。

---

### 模式 5：文件权限 + 用户组（rwx + chmod）

**问题场景**：多用户系统要"谁能读/写/执行"哪个文件。

**解决方案**：3 角色（user/group/other） × 3 权限（read/write/execute）= 9 位；`r=4 w=2 x=1` 数字模式；`chmod 755 file` rwxr-xr-x；`chown user:group file` 改属主；`umask 022` 默认权限；`SUID/SGID/Sticky` 3 特殊位。文件系统 ACL 细粒度。

**关键参数**：
- 3 × 3 权限位
- `rwx / 421`
- `chmod / chown`
- `umask`
- SUID/SGID

**最佳实践**：默认 `umask 027` 文件 640 / 目录 750；**不要**给文件 SUID root（安全漏洞）；Web 目录 `chmod -R 755` + 文件 `644`；`chattr +i file` 不可修改；`getfacl / setfacl` ACL 细粒度。

---

## 第二段：扩展范式

### 模式 6：包管理（apt / yum / dnf / pacman）

**问题场景**：Linux 装软件要从源码 make install，依赖地狱难维护。

**解决方案**：发行版自带包管理：Debian/Ubuntu `apt / dpkg`、CentOS/RHEL `yum / dnf / rpm`、Arch `pacman`、Alpine `apk`；`apt install nginx` 一行装；`apt update && apt upgrade` 升级；`apt-cache search` 搜；`.deb / .rpm` 包格式。仓库源 `/etc/apt/sources.list` 配。

**关键参数**：
- `apt` / `dnf` / `pacman`
- 仓库源
- 依赖解析
- `install/remove/update`
- 签名验证

**最佳实践**：装软件**总是**走包管理**不要**源码编译（升级难）；`apt update` 必在 install 前；`apt-mark hold package` 锁版本不升级；`/etc/apt/sources.list` 配清华/阿里源加速；容器用 `apk add --no-cache` 减小镜像。

---

### 模式 7：systemd 服务管理

**问题场景**：服务器要"开机自启 + 失败重启 + 日志收集 + 进程管理"。

**解决方案**：`systemd` 是 PID 1 进程总管：`.service` 单元文件描述服务（`ExecStart / Restart / User / Environment`）；`systemctl start/stop/enable/disable/status` 控制；`journalctl -u nginx` 看日志；`/etc/systemd/system/` 自定义；`systemd-run` 临时跑。替代 SysV init。

**关键参数**：
- `.service` 单元
- `systemctl start/enable`
- `journalctl`
- `ExecStart / Restart`
- `multi-user.target`

**最佳实践**：自写服务放 `/etc/systemd/system/myapp.service` + `systemctl daemon-reload` 重新加载；`Restart=always` 自动重启；`User=nobody` 不用 root；`EnvironmentFile=/etc/myapp.env` 配环境变量；`journalctl -u myapp -f` 跟日志。

---

### 模式 8：iptables / nftables 防火墙

**问题场景**：服务器要"允许 SSH / 拒绝其他 / 转发 80 到后端"。

**解决方案**：`iptables` / `nftables` 是 Linux 内核 netfilter 用户态：5 链（PREROUTING/INPUT/FORWARD/OUTPUT/POSTROUTING）；表 filter/nat/mangle/raw；`iptables -A INPUT -p tcp --dport 22 -j ACCEPT` 规则；`nft add rule` 新版。`ufw / firewalld` 简化封装。

**关键参数**：
- 5 链 + 5 表
- `ACCEPT/DROP/REJECT`
- `-A` 追加规则
- `-j` 跳转 target
- `ufw` 简化

**最佳实践**：服务器先 `ufw default deny incoming` + `ufw allow ssh/http/https` 显式开放；生产用 `nftables` 而**不是** `iptables`（更现代）；`iptables -L -n -v` 看规则命中数；`iptables-save > /etc/iptables.rules` 持久化；容器用 `iptables -t nat` 配端口映射。

---

### 模式 9：cron / systemd-timer 定时任务

**问题场景**：业务要"每天 3 点备份 / 每 5 分钟同步 / 每月清理日志"。

**解决方案**：`cron` 守护进程 + `crontab -e` 编辑；`分 时 日 月 周 命令` 5 字段；`0 3 * * * /backup.sh` 每天 3 点；`*/5 * * * *` 每 5 分钟；`@reboot` 启动时；`/etc/cron.d/` 系统级；日志 `/var/log/cron`。`systemd-timer` 替代方案支持依赖。

**关键参数**：
- 5 字段
- `crontab -e`
- `*/5` 步进
- `@reboot`
- `/var/log/cron`

**最佳实践**：脚本**总是** `set -euo pipefail` + 显式路径 `/usr/bin/python3`；`MAILTO=""` 不发邮件；`flock` 防并发；任务重于 1 分钟用 `systemd-timer`；`run-parts /etc/cron.daily` 跑目录脚本。

---

### 模式 10：SSH 远程登录 + 密钥认证

**问题场景**：服务器运维要"远程登录 + 执行命令 + 传文件"。

**解决方案**：`ssh user@host` 登录；`ssh-keygen -t ed25519` 生成密钥；`ssh-copy-id user@host` 推公钥；`~/.ssh/authorized_keys` 配公钥免密；`scp file user@host:/path` 传文件；`rsync -avz` 增量同步；`ssh -L 8080:localhost:80` 端口转发；`~/.ssh/config` 配别名。OpenSSH 套件。

**关键参数**：
- `ssh user@host`
- `ed25519` 密钥
- `ssh-copy-id`
- `~/.ssh/config`
- 端口转发

**最佳实践**：**永远**用 ed25519 密钥**不要** RSA（弱）；`ssh-keygen -t ed25519 -C "comment"`；`chmod 600 ~/.ssh/id_ed25519` 私钥权限；`~/.ssh/config` 配别名 `Host prod` 简化；`ssh -J jump host` 跳板机；2FA `google-authenticator`。

---

## 第三段：进阶范式

### 模式 11：进程监控 + 性能分析（top / htop / perf）

**问题场景**：CPU 飙高 / 内存泄漏 / IO 抖动，要定位是哪个进程 / 哪个函数。

**解决方案**：`top / htop` 实时看 CPU/内存；`ps aux` 静态看；`/proc/<pid>/status` 详细信息；`perf top -p PID` 采样热点函数；`strace -p PID` 跟踪系统调用；`ltrace` 库调用；`pidstat` 一段时间采样；`iotop` 看 IO；`vmstat 1` 看虚拟内存。`bpftrace` 高级工具。

**关键参数**：
- `top / htop`
- `ps aux`
- `perf top`
- `strace -p`
- `/proc/<pid>/`

**最佳实践**：CPU 高 `perf top` 抓函数；IO 慢 `iotop` 看进程；内存泄漏 `ps -o rss` 趋势；`htop` 比 top 直观；`pidstat -p PID 1` 周期采样；`perf record -g -F 99` + `perf report` 全栈火焰图。

---

### 模式 12：文件系统 + mount

**问题场景**：硬盘 / U 盘 / NFS / iSCSI 怎么挂载到目录使用。

**解决方案**：`mount /dev/sdb1 /mnt` 挂载；`umount /mnt` 卸载；`/etc/fstab` 配开机自动挂；`mount -t ext4 / xfs / nfs` 选文件系统；`mount -o ro / rw / noexec / nosuid` 挂载选项；`blkid` 看 UUID；`lsblk` 看块设备；`df -h` 看使用率；`du -sh` 看目录大小。

**关键参数**：
- `mount / umount`
- `/etc/fstab`
- ext4 / xfs / btrfs
- `mount -o` 选项
- `UUID` / `lsblk`

**最佳实践**：`/etc/fstab` 用 UUID 而**不是** `/dev/sda1`（设备名会变）；`mount -o noexec,nosuid` 不可执行 U 盘；`/mnt` / `/media` 临时挂；`mount --bind` 目录挂目录；`umount -l` 懒卸载；`fstrim` SSD 性能。

---

### 模式 13：网络配置（ip / ss / tcpdump）

**问题场景**：服务器要"配 IP / 路由 / DNS / 防火墙"和"诊断网络问题"。

**解决方案**：`ip addr / ip link / ip route` 配置网络（替代 ifconfig）；`ss -tunap` 看连接（替代 netstat）；`ip route add default via 192.168.1.1` 默认路由；`/etc/resolv.conf` 配 DNS；`tcpdump -i eth0 port 80` 抓包；`curl -v` 调试 HTTP；`dig / nslookup` DNS 查询；`mtr` 路由追踪。`netplan` 配网络（Ubuntu 18+）。

**关键参数**：
- `ip addr/route/link`
- `ss -tunap`
- `tcpdump`
- `netplan`
- `curl -v`

**最佳实践**：**用** `ip` 而**不是** `ifconfig`（已废弃）；`ss -tunap` 看连接更全；`tcpdump -w file.pcap` 存包给 Wireshark 离线分析；`mtr` 替代 `traceroute`；`netplan` YAML 配 Ubuntu；DNS 配 `/etc/resolv.conf nameserver 8.8.8.8`。

---

### 模式 14：用户管理 + sudo

**问题场景**：多用户系统要"权限隔离 + 受控提权"。

**解决方案**：`useradd / userdel / usermod` 增删改用户；`passwd user` 改密码；`groupadd` 加组；`/etc/passwd` 用户 + `/etc/shadow` 密码哈希；`sudo` 受控提权（`/etc/sudoers` 配规则）；`visudo` 安全编辑；`su - user` 切换用户；`last` 看登录历史；`/var/log/auth.log` 审计。

**关键参数**：
- `useradd / userdel`
- `/etc/passwd / shadow`
- `sudo / sudoers`
- `su -`
- `last / auth.log`

**最佳实践**：**不要**直接用 root，创建普通用户 + sudo 提权；`/etc/sudoers` 配 `user ALL=(ALL) NOPASSWD: ALL`；`visudo` 改 sudoers 防配置错；`sudo -l` 看权限；`chattr +i /etc/passwd` 防改；`fail2ban` 防 SSH 爆破。

---

### 模式 15：日志系统（journald / rsyslog / logrotate）

**问题场景**：业务要"日志收集 + 持久化 + 轮转 + 集中查询"。

**解决方案**：`journald`（systemd 自带）收集所有服务日志 `journalctl` 查询；`rsyslog` 传统 syslog 守护 `/var/log/`；`/etc/rsyslog.d/` 配规则；`logrotate` 日志轮转（`/etc/logrotate.d/`）；`logger "message"` 命令行打日志；`dmesg` 内核日志；`/var/log/syslog` 系统日志。

**关键参数**：
- `journalctl`
- `rsyslog`
- `logrotate`
- `/var/log/`
- `dmesg`

**最佳实践**：现代系统**用** `journalctl` 统一查询；`journalctl -u nginx -f` 跟 nginx 日志；`logrotate daily rotate 7 compress` 每天切 + 留 7 份 + 压缩；`dmesg -T` 看带时间戳内核日志；`/var/log/auth.log` 监控 SSH 失败；ELK / Loki 集中收集。

---

## 第四段：实战范式

### 模式 16：smoke test 10 行验证

**问题场景**：新装 Linux 服务器验证环境是否就位。

**解决方案**：10 行 smoke test 验证 5 件套：
```bash
uname -a && cat /etc/os-release && df -h | head -3 && \
free -h && nproc && ip addr | grep "inet " | head -3 && \
ss -tunap | head -3 && which curl git python3 && date
```
期望：内核版本、发行版、磁盘、内存、CPU 核数、IP、监听端口、命令、时区。

**关键参数**：
- 10 行核心验证
- `uname / os-release`
- `df / free / nproc`
- `ip / ss`
- 30s 可跑完

**最佳实践**：新机器**总是** 5-10 行 smoke test 验证"内核 + 发行版 + 资源 + 网络 + 工具"五件套；远程机器先 `ping` 再 `ssh`；CI 容器跑 smoke test 验环境；配 `MOTD` 登录显示。

---

### 模式 17：故障排查 Runbook

**问题场景**：线上服务挂了，运维要按步骤排查。

**解决方案**：Runbook 步骤：① `uptime` 负载；② `dmesg -T | tail -20` 内核 panic；③ `systemctl status myapp` 服务状态；④ `journalctl -u myapp -n 100 --no-pager` 日志；⑤ `ps aux | grep myapp` 进程；⑥ `ss -tunap | grep 8080` 端口；⑦ `curl localhost:8080/health` 健康检查；⑧ `iotop` / `iostat` IO；⑨ `free -h` 内存；⑩ `tcpdump` 抓包。

**关键参数**：
- 10 步 Runbook
- `uptime / dmesg`
- `systemctl / journalctl`
- `ps / ss / curl`
- `iotop / iostat`

**最佳实践**：Runbook 文档化放 wiki；告警触发**先**看监控指标（CPU/内存/IO/网络）；`journalctl -p err` 看错误日志；`strace -p PID` 跟踪卡住的进程；`perf record` 抓热点；`tcpdump -w` 抓包给 Wireshark 分析。

---

### 模式 18：加固 + CIS Benchmark

**问题场景**：服务器要过安全合规检查（金融/政府/医疗）。

**解决方案**：CIS Benchmark（Center for Internet Security）标准：① SSH 改端口 + 禁 root 登录 + 密钥认证 ② 防火墙启用 + 默认 deny ③ 密码策略 `minlen=14` ④ 日志审计 ⑤ 禁用不必要服务 ⑥ `sysctl` 加固（`net.ipv4.conf.all.rp_filter=1`）⑦ 文件权限 `chmod 600 /etc/shadow`。`lynis` 工具自动审计。

**关键参数**：
- CIS Benchmark
- SSH 加固
- 防火墙默认 deny
- 密码策略
- `lynis` 审计

**最佳实践**：用 `lynis audit system` 自动审计；`fail2ban` 防爆破；`aide` 入侵检测；`/etc/ssh/sshd_config` 配 `PermitRootLogin no`；`/etc/pam.d/common-password` 配密码强度；`sysctl -p /etc/sysctl.conf` 加载内核加固。

---

### 模式 19：vs FreeBSD / macOS / WSL 选型

**问题场景**：4 个 Unix-like 系统（Linux / FreeBSD / macOS / WSL）选哪个。

**解决方案**：Linux 主流服务器 + 桌面 + 嵌入式生态最丰富；FreeBSD 稳定 + ZFS + 许可证自由（生产 Netflix/WhatsApp）；macOS 桌面 + 开发者友好 + BSD 内核；WSL 2 Windows 跑 Linux 二进制 + IDE 集成。Linux 是服务器默认；macOS 是开发者默认；WSL 是 Windows 过渡。

**关键参数**：
- Linux 主流
- FreeBSD 稳定
- macOS 桌面
- WSL Windows
- BSD 内核 vs Linux 内核

**最佳实践**：服务器/容器/嵌入式**用** Linux（Ubuntu LTS / CentOS / RHEL）；macOS 适合开发者本地；FreeBSD 适合网络设备 + 学术；WSL 适合 Windows 用户过渡到 Linux；**不要**生产用桌面系统。

---

### 模式 20：7 天 Linux 基础学习

**问题场景**：开发者零基础想入门 Linux 命令行。

**解决方案**：7 天分 5 阶段：① Day 1-2 文件操作（ls/cd/cp/mv/rm）+ 权限（chmod/chown）+ vi 编辑器 ② Day 3 进程管理（ps/top/kill）+ 服务（systemctl）+ 日志（journalctl）③ Day 4 网络（ip/ss/curl/ssh）+ 包管理（apt/dnf）④ Day 5 Shell 脚本（bash/zsh + 变量 + 循环 + 函数 + 管道）。

**关键参数**：
- Day 1-2 文件 + 权限
- Day 3 进程 + 服务
- Day 4 网络 + 包
- Day 5 脚本
- 7 天基础

**最佳实践**：用 `man <cmd>` 看手册；装一台 Linux 虚拟机（VirtualBox）或 WSL；`oh-my-zsh` 配 Shell 美化；**每天**实操 2 小时；目标是能 SSH + 装包 + 写脚本 + 排查故障；适用任何"Linux 入门"。

---

## 关键代码段

```bash
# smoke test 10 行 - 验证 5 件套
uname -a && cat /etc/os-release && df -h | head -3 && \
free -h && nproc && ip addr | grep "inet " | head -3 && \
ss -tunap | head -3 && which curl git python3 && date

# systemd 自定义 service
# /etc/systemd/system/myapp.service
[Unit]
Description=MyApp
After=network.target

[Service]
Type=simple
User=nobody
EnvironmentFile=/etc/myapp.env
ExecStart=/usr/bin/python3 /opt/myapp/server.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target

# 防火墙默认 deny + 显式开放
ufw default deny incoming
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 必偷 3 件

1. **FD 一切皆文件 + fork/exec 进程模型**：5 种 FD 统一 socket/pipe/device；`fork+exec` 是 Unix 标准进程创建；`posix_spawn` 替代（更安全）；`epoll` 而**不是** `select`。
2. **systemd + journalctl + logrotate 三件套**：`.service` 单元文件配 `Restart=always` + `User=nobody`；`journalctl -u myapp -f` 跟日志；`logrotate daily rotate 7 compress` 自动切。
3. **信号机制 + SSH ed25519 密钥**：优雅退出**用** SIGTERM **不要** SIGKILL；reload 走 SIGUSR1；**永远**用 ed25519 而**不是** RSA；`~/.ssh/config` 配别名 + 跳板机。

## 必避 3 坑

1. **不要直接用 root 登录 SSH**——安全大忌；创建普通用户 + `sudo` 提权；`/etc/ssh/sshd_config` 配 `PermitRootLogin no`；`fail2ban` 防爆破。
2. **不要源码 make install 装软件**——升级难 + 依赖地狱；走包管理（apt/dnf/pacman）；`apt-mark hold package` 锁版本；容器用 `apk add --no-cache` 减体积。
3. **不要用 `ifconfig` / `netstat`**——已废弃；用 `ip addr / ip route` + `ss -tunap`；`tcpdump -w file.pcap` 存包给 Wireshark 离线分析。
