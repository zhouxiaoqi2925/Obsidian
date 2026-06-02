# linux-kernel - 主流开源操作系统内核

**GitHub**: torvalds/linux
**Star**: 185k+
**语言**: C / Assembly / Rust
**主题**: 内核 / 操作系统 / 调度器 / 内存管理
**适用场景**: 操作系统教学 / 驱动开发 / 内核裁剪定制 / 内核模块开发

---

## 第一段：基础范式

### 模式 1 - monorepo + 子系统维护者（maintainer）模型

**问题场景**：内核既要管 CPU、内存、进程，又要支持几十种架构和上百种文件系统，单一项目如何在不分裂的前提下组织这些差异巨大的子系统？

**解决方案**：Linux 采用 monorepo + 子系统维护者（maintainer）模型。每个子系统（sched/mm/fs/net/drivers）有独立 maintainer 和 subsystem tree，整体通过 Linus 的 master 分支合并。这种"分散开发、集中集成"的方式让 5 万名贡献者可以并行工作。

**关键参数**：
- 约 30 个核心子系统
- 约 300 名 subsystem maintainer
- 每个 release cycle 约 2 周 merge window + 7-8 周 rc
- 约 90 天一个稳定版本

**最佳实践**：新功能优先在子系统分支开发并经过 -next 树，再向 Linus 提 PR；**不要**直接往 master 推。

### 模式 2 - Kbuild 多目标交叉编译

**问题场景**：同一份源码要编译成 x86、ARM、RISC-V、MIPS 等十几种架构的内核镜像，传统 Makefile 难以表达多平台差异。

**解决方案**：Kbuild 是 Linux 自研的 Makefile 框架，在顶层 Makefile 中通过 `ARCH` / `CROSS_COMPILE` / `KBUILD_OUTPUT` 三个变量切换编译目标。子目录的 Makefile 通过 `obj-y/m` 声明要编译的 object。配置阶段先生成 `.config`，再递归构建。

**关键参数**：
- `ARCH` 目标架构（x86 / arm64 / riscv）
- `CROSS_COMPILE` 交叉工具链前缀
- `KBUILD_OUTPUT` 编译产物输出目录
- `defconfig` 各架构默认配置

**最佳实践**：使用 `make ARCH=arm64 CROSS_COMPILE=aarch64-linux-gnu- defconfig && make -j$(nproc)` 一键出镜像。

### 模式 3 - Kconfig 树形依赖解析

**问题场景**：内核数以千计的配置选项（CONFIG_*），有些互斥、有些依赖、有些只在特定架构下可用，如何保证配置合法性？

**解决方案**：Kconfig 用声明式语法描述选项的依赖、提示、默认值。配置工具（oldconfig / menuconfig / defconfig）解析后生成 `.config`，再由 `autoconf.h` 暴露给 C 代码。`select` 表示强制启用，`depends on` 表示前置条件，`imply` 表示弱推荐。

**关键参数**：
- `CONFIG_*` 编译期宏
- `depends on` / `select` / `imply`
- `defconfig` / `savedefconfig`
- `make menuconfig` TUI 入口

**最佳实践**：发布定制镜像前用 `make savedefconfig` 抽出最小 defconfig，便于复现构建。

### 模式 4 - 进程调度器与 CFS

**问题场景**：在多任务混合负载下，如何公平、高效地分配 CPU 时间给成千上万个进程？

**解决方案**：CFS（Completely Fair Scheduler）用红黑树按虚拟运行时间 vruntime 排序任务，最小 vruntime 任务优先运行。`sched_entity` 嵌入 `task_struct`，`cfs_rq` 管理就绪队列。实时任务（SCHED_FIFO/SCHED_RR）走单独的 rt_rq，停机任务走 stop_rq。调度类 `sched_class` 支持扩展（如 EEVDF 在 6.6 引入）。

**关键参数**：
- vruntime 虚拟时间
- `sched_latency_ns` 调度周期
- `min_granularity_ns` 单任务最短执行
- nice -20..+19 映射权重表

**最佳实践**：对延迟敏感任务用 `chrt` 调成 SCHED_RR；CPU 密集型用默认 SCHED_NORMAL 即可。

### 模式 5 - VFS 虚拟文件系统抽象

**问题场景**：应用层通过 open/read/write 就能访问 ext4/xfs/proc/sysfs/cgroup 等差异巨大的存储介质，背后的统一接口是什么？

**解决方案**：VFS 定义 file / inode / dentry / super_block 四个核心数据结构，所有具体文件系统实现对应的 `file_system_type` 和 `super_operations`。`open()` 通过 `path_lookup` 找到 dentry 和 inode，再调用 `inode->i_fop->open`。

**关键参数**：
- file 进程级打开实例
- inode 文件元数据 + 操作集
- dentry 目录项缓存
- super_block 文件系统级元数据

**最佳实践**：自定义文件系统时优先基于 FUSE 或现有 fs 实现继承 VFS，避免从零写 `super_operations`。

---

## 第二段：扩展范式

### 模式 6 - 内存管理 MM 与页分配器

**问题场景**：物理内存有限、虚拟地址巨大，如何高效分配页、回收页、换出页？

**解决方案**：MM 子系统以 page frame 为单位管理物理内存。`alloc_pages` 通过伙伴系统（buddy allocator）按 order 2^n 分配连续页。小块请求走 SLAB/SLUB 分配器。kswapd 在后台回收 inactive 页面，LRU 链表区分 file cache 与 anon memory。

**关键参数**：
- order 分配阶
- GFP flags 分配标志
- watermark min/low/high
- NUMA node 多节点亲和性

**最佳实践**：驱动中分配内存用 `GFP_ATOMIC` 不能睡眠；文件路径用 `GFP_KERNEL` 但必须能 reenter。

### 模式 7 - 中断处理上下半部

**问题场景**：硬件中断需要尽快响应，但处理逻辑可能很耗时、可能睡眠，如何平衡？

**解决方案**：Linux 把中断处理拆为 top half（hardirq，硬中断，关中断执行）和 bottom half（tasklet / softirq / workqueue / threaded IRQ）。网络收包典型路径：NIC 中断到软中断 `NET_RX_SOFTIRQ` 再到 ksoftirqd 内核线程继续处理。

**关键参数**：
- `request_irq` / `devm_request_threaded_irq`
- `IRQF_SHARED` 共享中断线
- softirq vec HI/TIMER/NET_TX/NET_RX
- workqueue 可睡眠延迟工作

**最佳实践**：中断处理只做最必要的事（ack、写 ring），把耗时逻辑丢到 workqueue 或 NAPI poll。

### 模式 8 - 设备模型与 sysfs

**问题场景**：上层（udev、systemd、power management）需要以统一方式发现、枚举、配置设备。

**解决方案**：内核设备模型核心是 kobject/kset/ktype 三角。device_driver / bus / class 都基于它。sysfs 在 `/sys` 挂载，把 kobject 树暴露为文件和目录。`/sys/bus/pci/devices/0000:00:1f.0` 是典型路径。

**关键参数**：
- kobject 引用计数 + sysfs 入口
- bus_type match / probe 回调
- device_driver probe / remove / suspend / resume
- class 高层抽象

**最佳实践**：写驱动时用 `device_create_file` 暴露自定义属性，方便用户态调试与配置。

### 模式 9 - 网络协议栈分层

**问题场景**：从 socket() 系统调用到 NIC 发送数据包，路径长、协议多，如何保持高吞吐？

**解决方案**：协议栈分 socket 层 / 传输层（TCP/UDP） / 网络层（IP） / 邻居层 / 链路层 / 设备层。数据包以 sk_buff（struct sk_buff）为载体在层间流转，每个协议处理时用 `skb_push/skb_pull` 调整指针。

**关键参数**：
- sk_buff 核心数据结构
- netdev_queue 每队列独立 qdisc
- qdisc 排队规则（fq_codel/bfq/mq）
- RPS/RFS 多核收包分发

**最佳实践**：高吞吐服务器用 `tc qdisc replace dev eth0 root fq`，开启 RPS 分散软中断。

### 模式 10 - 锁与同步原语

**问题场景**：SMP 多核 + 进程抢占 + 中断嵌套，内核里同一份数据可能被多上下文访问。

**解决方案**：内核提供 spinlock（忙等、短临界区）、mutex（可睡眠、长临界区）、rwlock/rcu（读写并发优化）、seqlock（写多读少、读者优先）、atomic_t（计数器 + 位操作）。RCU 是 Linux 标志性原语，读者无锁、写者复制后切换。

**关键参数**：
- `preempt_count` 内核抢占计数
- `local_irq_disable` / `save` 关中断
- `smp_mb` / `smp_rmb` / `smp_wmb` 内存屏障
- RCU grace period 宽限期

**最佳实践**：读多写少用 RCU；持有锁时不调度、不睡眠；中断上下文永远用 `spinlock_irqsave`。

---

## 第三段：进阶范式

### 模式 11 - RCU 与无锁读

**问题场景**：读端路径极热（如 dcache、网络路由表），传统 rwlock 的原子操作在多核下成为瓶颈。

**解决方案**：RCU 读者直接访问对象指针，退出时调用 `rcu_read_unlock()` 即视为离开读临界区。写者拷贝新对象、原子切换指针、等待所有 CPU 经历一次 context switch 后释放旧对象（`call_rcu`）。`synchronize_rcu()` 阻塞等待宽限期。

**关键参数**：
- `rcu_read_lock` / `rcu_read_unlock` 读者
- `rcu_assign_pointer` 发布指针
- `rcu_dereference` 读者解引用
- `call_rcu` 延迟回收

**最佳实践**：RCU 保护的链表增加节点用 `list_add_rcu`，遍历用 `list_for_each_entry_rcu`。

### 模式 12 - cgroup v2 资源隔离

**问题场景**：容器时代需要把 CPU、内存、IO、pid 等资源按组隔离与限制。

**解决方案**：cgroup v2 统一层级，每种资源是一个 controller（cpu/memory/io/pids/freezer）。每个 cgroup 在 `/sys/fs/cgroup/` 下有目录，通过文件配置。`cpu.max` / `memory.max` / `io.max` 三个关键文件控制上限。

**关键参数**：
- `cpu.weight` 相对权重（1..10000）
- `cpu.max` quota/period 硬上限
- `memory.max` 硬上限触发回收
- `io.max` bfq/throttling 限制

**最佳实践**：容器运行时（runc、containerd）默认把所有进程放进 cgroup，K8s 配额直接落到 cpu.max。

### 模式 13 - eBPF 与可编程数据通路

**问题场景**：如何在不修改内核源码、不重启的前提下，动态插入网络、安全、跟踪逻辑？

**解决方案**：eBPF 程序由 verifier 验证后 JIT 编译为原生码，挂在指定 hook（kprobe / tracepoint / XDP / tc / socket）上。BPF map 提供内核用户态共享数据。`bpf()` 系统调用统一管理。

**关键参数**：
- prog type XDP/TC/kprobe/tracepoint/LSM
- BPF_MAP_TYPE_HASH/ARRAY/LRU_HASH/RINGBUF
- `bpf_get_prandom_u32` / `bpf_redirect` 辅助
- BTF / CO-RE 跨内核版本兼容

**最佳实践**：网络性能优化首选 XDP，能在驱动收包前就做丢包 / 重定向，比 iptables 早一个数量级。

### 模式 14 - 文件系统特性横向对比

**问题场景**：ext4、xfs、btrfs、f2fs、zfs 怎么选？

**解决方案**：ext4 通用稳；xfs 大文件/大文件系统性能好；btrfs 支持 CoW / 快照 / subvolume；f2fs 专为闪存设计；zfs 企业级带端到端校验。选型看 workload：通用服务器 ext4/xfs；容器镜像 btrfs 快照；移动设备/嵌入式 f2fs。

**关键参数**：
- journal / log 日志模式
- CoW 写时复制
- subvolume / dataset 独立命名空间
- TRIM/discard SSD 性能

**最佳实践**：SSD 一定要 `mount -o discard` 或周期性 fstrim。

### 模式 15 - 实时性改造 PREEMPT_RT

**问题场景**：工业控制、机器人、音频场景需要微秒级延迟，普通内核 spinlock 持锁时间太长。

**解决方案**：PREEMPT_RT 补丁把几乎所有 spinlock 替换为可睡眠的 rt_mutex，让临界区可抢占。同时把中断处理线程化（threaded IRQ）。这使最大延迟从毫秒级降到 50-100 微秒。

**关键参数**：
- `preempt=full` 启动参数
- `threadirqs` 所有中断走线程
- `isolcpus` 隔离核做实时任务
- `nohz_full` 隔离核关闭 tick

**最佳实践**：实时任务用 `chrt -f 99` 启动，并绑核到 isolcpus 的 CPU。

---

## 第四段：实战范式

### 模式 16 - 自定义字符设备驱动

**问题场景**：需要把 FPGA / 板级外设暴露为 `/dev/mydev` 给用户态读/写。

**解决方案**：实现 `file_operations`（open / read / write / ioctl / release）。注册 `misc_device` 或 `alloc_chrdev_region` + `cdev_add`。在 probe 里 `request_irq` / `ioremap` / 初始化硬件。release 里反向释放。

**关键参数**：
- `register_chrdev_region` vs `alloc_chrdev_region`
- `copy_to_user` / `copy_from_user`
- ioctl 编号 `_IOR` / `_IOW` / `_IOWR` 宏
- `request_mem_region` / `ioremap`

**最佳实践**：用 `devm_*` 系列管理资源（ioremap、request_irq），driver remove 自动释放，杜绝泄漏。

### 模式 17 - 内核模块加载与参数

**问题场景**：调试时希望动态加载 .ko 注入新功能，并通过参数调参。

**解决方案**：`insmod xxx.ko` 加载，`rmmod xxx` 卸载。`module_param(name, type, perm)` 声明可调参数，`module_param_array` 支持数组。`MODULE_LICENSE("GPL")` 必需，否则某些 GPL-only 符号无法使用。

**关键参数**：
- `insmod` / `modprobe` 加载
- `lsmod` 列出已加载
- `modinfo` 查看参数与依赖
- `/sys/module/xxx/parameters/` 运行时改参

**最佳实践**：在 Makefile 中用 `obj-m += mymod.o` 单独构建模块，避免污染主内核。

### 模式 18 - 调试工具箱

**问题场景**：内核 bug 难复现、难定位，需要一套调试兵器库。

**解决方案**：printk + 动态日志级别（pr_debug / dev_dbg）做日志；KASAN 检测越界/UAF；kmemleak 查泄漏；perf 做采样热点；ftrace / bpftrace 跟踪函数调用；crash 之后 kdump + crash 工具分析 vmcore。

**关键参数**：
- printk 日志级别 0 emerg..7 debug
- `sysctl kernel.printk` 控制输出级别
- `perf record -g -F 999` 99% 采样
- `bpftrace -e 'kprobe:vfs_read { @[comm] = count(); }'`

**最佳实践**：线上机器开 lockdep 和 `ftrace=function_graph`，问题复现后立即抓取栈。

### 模式 19 - 性能分析与调优

**问题场景**：CPU 飙高、IO 抖动、内存压力，怎么定位瓶颈？

**解决方案**：CPU 维度用 `perf top` / off-cpu 分析（bcc 的 offcputime）。内存用 `/proc/meminfo` / `/proc/slabinfo` / `smem -t`。IO 用 `iostat -xz 1` / `biolatency-bpfcc`。网络用 `ss -s` / bcc 的 tcplife。

**关键参数**：
- `%util` / `await` 磁盘饱和度
- PSI（Pressure Stall Info）压力指标
- runqueue depth `sysctl block/nr_requests`
- TCP backlog `net.core.somaxconn`

**最佳实践**：先用 `uptime` 加 `dmesg -T` 看 OOM/panic，再用 perf + bpftrace 抓热点。

### 模式 20 - 升级与 LTS 选择

**问题场景**：服务器跑什么版本最稳？什么时候升？

**解决方案**：LTS（Long Term Support）分支维护 6 年（如 6.6 LTS 至 2026 年 12 月）。stable 分支每 90 天出新点版本。新硬件和新特性（如 EEVDF、MTE）只在主线，bugfix 才会 backport。

**关键参数**：
- LTS 维护期通常 6 年
- stable 点版本每 90 天一个
- -rc 候选每周一个
- 关键 bug backport 到 stable

**最佳实践**：生产环境用 LTS 子版本（如 6.6.30），每季度小升一次；新硬件驱动问题等稳定半年再上生产。
