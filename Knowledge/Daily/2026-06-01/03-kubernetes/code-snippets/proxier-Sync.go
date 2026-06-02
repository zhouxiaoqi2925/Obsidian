// 来源: kubernetes pkg/proxy/iptables/proxier.go
// 作用: kube-proxy iptables 同步 — 把 Service 翻译成 iptables 规则
// 调用链: Sync (周期) → 算期望状态 → diff → iptables-restore 原子替换
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] 为什么用 iptables 而非 LVS/IPVS 早期
//   - iptables: 内置, 通用, 但规则多时慢 (O(n) 匹配)
//   - IPVS: 内核 hash, 性能好 (5k+ Service 也能扛), 但需额外模块
//   - K8s 默认 iptables, IPVS 是 feature gate
//   - 选 iptables 是兼容性, IPVS 是性能
//
// [WHY-2] 为什么是全量重建 + diff
//   - 全量重建: 每次 sync 重写所有规则, 代码简单, 状态机清晰
//   - diff: 与当前内核 iptables diff, 只下发差异
//   - 全量: 数千 Service 也只 100ms 内
//   - diff: 避免 service 变更触发整表 reload
//
// [WHY-3] 链结构 (3 层 KUBE-* chains)
//   - PREROUTING → KUBE-SERVICES (顶层, 按 ClusterIP:port 匹配)
//     - KUBE-SVC-xxx (负载均衡到 endpoint, 随机权重)
//       - KUBE-SEP-xxx1 / KUBE-SEP-xxx2 (DNAT 到具体 pod IP:port)
//   - 层级 = 责任分离, 改 service 不影响其他
//   - iptables -m statistic --mode random --prob X 选 endpoint
//
// [WHY-4] 随机选 endpoint
//   - iptables -m statistic --mode random --prob N
//   - 多个 KUBE-SEP-xxx, 概率 1/N 选 1 个
//   - 简单负载均衡, 无需额外探测
//   - 问题: 不感知后端健康 (e.g. pod 死了还在转发)
//     → K8s 1.13+ 用 readiness 探针摘 endpoint
//
// [WHY-5] 周期 sync (1s 或更长)
//   - informer watch Service / Endpoint 变更
//   - 变更触发增量 sync
//   - 周期 sync 兜底: 漏事件 + 状态恢复
//   - 同步代价: 100ms - 1s, 业务流量同时转发
// ================================================================

func (proxier *Proxier) Sync() error {
    // === 1. 算期望状态 (从 informer 拿 Service/Endpoint) ===
    serviceMap := proxier.serviceMap
    endpointsMap := proxier.endpointsMap

    // === 2. 与当前 iptables 规则 diff, 算差异 ===
    proxier.iptablesData.Reset()
    // 2.1 写 KUBE-SERVICES (顶层)
    proxier.writeIptablesRules(proxier.iptablesData, ...)
    // 2.2 写各 KUBE-SVC-* (每个 service)
    for svcName, svc := range serviceMap {
        proxier.writeIptablesService(svcName, svc, ...)
    }
    // 2.3 写各 KUBE-SEP-* (每个 endpoint)
    for epKey, ep := range endpointsMap {
        proxier.writeIptablesEndpoint(epKey, ep, ...)
    }

    // === 3. 原子替换 (iptables-restore) ===
    // - iptables-save 导出当前, iptables-restore 替换
    // - 整个过程 < 100ms, 业务无感
    // - 失败回滚: 老规则还在, 不会丢包
    return iptables.RestoreAll(proxier.iptablesData.Bytes())
}

// === 3 层 KUBE-* chains 实际规则示例 ===
// KUBE-SERVICES chain:
//   -A KUBE-SERVICES -d 10.96.0.1/32 -p tcp --dport 443 -j KUBE-SVC-NOTYETREALIZED
//   -A KUBE-SERVICES -d 10.96.10.10/32 -p tcp --dport 80 -j KUBE-SVC-XXXX
//
// KUBE-SVC-XXXX chain (负载均衡):
//   -A KUBE-SVC-XXXX -m statistic --mode random --prob 0.5 -j KUBE-SEP-AAA
//   -A KUBE-SVC-XXXX -m statistic --mode random --prob 1.0 -j KUBE-SEP-BBB  (剩余 50%)
//
// KUBE-SEP-AAA chain (DNAT 到 pod):
//   -A KUBE-SEP-AAA -p tcp -j DNAT --to-destination 10.244.1.5:8080
//   -A KUBE-SEP-BBB -p tcp -j DNAT --to-destination 10.244.2.3:8080

// === 为什么不是 1 个 chain 包含所有规则 ===
// - 1 个 chain: 100w 规则匹配 = 慢, 任何变更触发全表 reload
// - 3 层: KUBE-SERVICES (1k) → KUBE-SVC (1k) → KUBE-SEP (1k)
//   - 内核 O(层级数 × 平均匹配) 实际 O(logN) 跳表式匹配
//   - 改 1 个 service, 只重写 KUBE-SVC-XXXX + KUBE-SEP-AAA/BBB, 不动其他

// === IPVS 模式 (5k+ Service 性能更好) ===
// - 用 ipvsadm 创建 LVS 规则 (hash 匹配)
// - 内核级负载均衡, O(1) 选 endpoint
// - 调优: --proxy-mode=ipvs

// ================================================================
// 性能数据 (5000 Service, 10000 Endpoint, iptables 模式):
//
// [Sync 总耗时]
//   - 算期望状态: 50-100ms
//   - 写 iptables rules: 50-100ms (生成字符串)
//   - iptables-restore: 100-500ms (内核加载)
//   - 总: 200-700ms / sync
//
// [单包转发性能]
//   - iptables 模式: 5k Service 时, P99 +0.5ms (内核链匹配)
//   - IPVS 模式: 5k Service 时, P99 +0.1ms (hash 查表)
//
// [内存占用]
//   - iptables rules: 5w 条 × 200B = 10MB
//   - 内核 netfilter state: 50MB-200MB
//
// 关键点:
//   - readiness 探针失效 → endpoint 摘除 → 流量摘除
//   - session affinity: iptables recent module, 客户端 IP hash
//   - externalTrafficPolicy: Local/Cluster (避免 SNAT 跨节点)
//   - 1.18+ TopologyAwareHints: 拓扑感知流量分发
// ================================================================



// ================================================================
// 深度拓展 (实战案例):
//
// [案例 1: iptables vs IPVS 模式对比]
//   - iptables (默认): 链式规则, 5k service 性能下降
//     - O(n) 规则匹配, 1w service 延迟 5ms+
//     - 优点: 简单, 兼容老内核
//   - IPVS (1.11+ GA): 哈希表 + 多种算法
//     - rr / lc / dh / sh / sed / nq
//     - O(1) 匹配, 5w+ service 性能稳定
//     - 缺点: 需要加载 ip_vs 内核模块
//   - 实战: 1k+ service 集群开 IPVS
//
// [案例 2: kube-proxy 5 大工作模式]
//   - userspace: 1.0 前, 性能差, 已废弃
//   - iptables: 1.1+ 默认, 链式规则
//   - ipvs: 1.11+ GA, 推荐
//   - kernelspace (Windows): Windows 专属
//   - nftables: 1.30+ alpha, 替代 iptables
//
// [案例 3: iptables 规则 5 类链]
//   - KUBE-SERVICES: clusterIP 入口
//   - KUBE-NODEPORTS: nodePort 入口
//   - KUBE-EXTERNAL-SERVICES: externalIP
//   - KUBE-PORTALS: 旧版
//   - KUBE-FORWARD: 转发链
//   - 数量: 1 service = ~10 rules, 1k service = 1w+ rules
//
// [案例 4: IPVS 调优实战]
//   ```
//   # kube-proxy config
//   mode: ipvs
//   ipvs:
//     scheduler: rr
//     minSyncPeriod: 1s
//     syncPeriod: 30s
//   ```
//   - scheduler: rr (默认), 还可以 lc, dh, sh, sed, nq
//   - syncPeriod: 30s 兜底同步
//   - ipvs 后端: dummy 设备 kube-ipvs0
//
// [案例 5: externalTrafficPolicy 实战]
//   - Cluster (默认): SNAT 跨节点, 流量可走任意节点
//   - Local: 不 SNAT, 流量只走本地 Pod, 保客户端 IP
//   - 代价: Local 模式负载不均 (节点无 Pod 时 drop)
//   - 实战: 需保源 IP 用 Local, 否则 Cluster
//
// [案例 6: SessionAffinity 实战]
//   - service.spec.sessionAffinity: ClientIP
//   - iptables: recent module 跟踪, 默认 10800s (3h)
//   - IPVS: persistence 模板, --persistent-net
//   - 监控: kube_proxy_networkprogramming_duration_seconds
//
// [案例 7: 性能数据 (1k service, 5k pods)]
//   - iptables Sync 周期: 5-30s
//   - iptables 规则数: 1k × 10 = 1w
//   - IPVS Sync 周期: 1s
//   - IPVS 虚拟服务: 1k
//   - 同步延迟: iptables P99 = 1s, IPVS P99 = 100ms
//
// [案例 8: 监控与告警]
//   - kube_proxy_sync_proxy_rules_duration_seconds
//   - kube_proxy_iptables_rules (总数)
//   - kube_proxy_ipvs_connections
//   - 关键: sync_duration P99 > 5s 就要告警
//   - 关键: 节点 iptables 规则数 > 1w 性能下降
//
// [案例 9: 实战: iptables 规则调试]
//   ```bash
//   # 看 service 规则
//   iptables-save | grep KUBE-SERVICES | head
//   # 查 1 个 service
//   iptables -t nat -L KUBE-SERVICES | grep <clusterIP>
//   # 计数
//   iptables-save | wc -l  # 总规则数
//   ```
//
// [案例 10: eBPF 模式 (Cilium 替代)]
//   - Cilium 用 eBPF 替代 kube-proxy
//   - 优势: O(1) 哈希查找, 跨节点负载均衡, 网络策略
//   - 代价: 内核版本要求 4.19+, 调试复杂
//   - 实战: 大集群 (>5k node) 推荐 Cilium
// ================================================================
