---
tags: [claude-skill, engineering, performance, optimization]
domain: engineering
source: claude-skills/engineering/skills/performance-profiler
version: 2.9.0
---

# performance-profiler

## 1. 元信息
- **仓库源**：claude-skills/engineering/skills/performance-profiler
- **路径**：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\performance-profiler`
- **版本**：2.9.0
- **分类**：Engineering > Performance
- **触发词**："Use when the user asks to profile code performance, identify bottlenecks, optimize slow queries, or improve response times"

## 2. 一句话定位
自动分析代码/系统的性能瓶颈，提供优化方案的 Skill。

## 3. 解决什么问题
- 不知道哪里慢（缺监控、缺 profile）
- 优化方向错误（凭直觉而不是数据）
- 优化后无法量化收益

## 4. 工作流（核心）

```
Step 1: 收集性能数据
  - CPU profile
  - Memory profile
  - Database slow query log
  - HTTP response time
  - Trace data

Step 2: 瓶颈识别
  - CPU 热点函数
  - 内存泄漏
  - N+1 查询
  - 锁竞争
  - IO 密集操作

Step 3: 根因分析
  - 是算法问题？
  - 是数据问题？
  - 是配置问题？
  - 是架构问题？

Step 4: 优化方案
  - 算法优化（O(n²) → O(n)）
  - 缓存策略
  - 索引优化
  - 并发优化
  - 架构调整

Step 5: 验证优化效果
  - before/after 对比
  - 量化指标（延迟、吞吐量、CPU、内存）
```

## 5. 源码解析

### 5.1 Python 工具脚本
- **performance_profiler.py** — 主分析器

### 5.2 参考文档
- **optimization-playbook.md** — 优化剧本
- **profiling-recipes.md** — Profiling 配方（不同语言的 profile 工具）

## 6. 支持的性能分析维度

| 维度 | 工具 | 用途 |
|------|------|------|
| CPU | py-spy, perf, Instruments | 找出 CPU 热点 |
| Memory | memray, valgrind, heaptrack | 找出内存泄漏/峰值 |
| Database | EXPLAIN ANALYZE, slow log | 慢查询 |
| Network | Wireshark, tcpdump | 网络瓶颈 |
| GC | GC log analysis | 垃圾回收问题 |
| Lock | jstack, py-spy dump | 锁竞争 |
| HTTP | APM (New Relic, Datadog) | 请求链路 |

## 7. 调用示例

### 示例 1：Python API 慢
```
用户：我的 FastAPI 接口 P99 延迟 5 秒，太慢

Claude（自动调用 performance-profiler）：
1. 收集数据：cProfile 输出、py-spy flame graph
2. 识别瓶颈：database query 占了 4.5 秒
3. 根因分析：N+1 查询（每个 item 一次 SELECT）
4. 优化方案：
   - 方案 A：用 JOIN 一次性查
   - 方案 B：用 selectinload 预加载
   - 方案 C：加缓存
5. 验证：实施后 P99 降到 200ms
```

### 示例 2：内存泄漏
```
用户：服务运行 24 小时后内存占用 8GB，肯定泄漏

Claude（自动调用）：
1. 收集数据：memray snapshot
2. 识别泄漏：某个 cache 没有 LRU 淘汰
3. 优化方案：加 maxsize + LRU
4. 验证：跑 48 小时内存稳定在 1GB
```

## 8. 与其它 Skill 的关系
- **前置**：`observability-designer`（需要先有监控数据）
- **配合**：`database-designer`（索引优化）、`chaos-engineering`（压测验证）
- **后置**：`slo-architect`（建立性能 SLO）

## 9. 注意事项
- 不要凭直觉优化，先 profile
- 优化前建立 baseline
- 优化后量化收益
- 注意 optimization vs observability 顺序

## 10. 来源链接
- GitHub: https://github.com/alirezarezvani/claude-skills
- 本地路径：`C:\Users\15389\claude-skills\claude-skills\engineering\skills\performance-profiler`
- SKILL.md: `SKILL.md`