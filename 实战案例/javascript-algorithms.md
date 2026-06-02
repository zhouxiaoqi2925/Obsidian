# javascript-algorithms - JavaScript 算法与数据结构学习库

**GitHub**: trekhleb/javascript-algorithms
**Star**: 193k+
**语言**: JavaScript
**主题**: 算法 / 数据结构 / 教育
**适用场景**: 刷题准备、面试突击、教学辅助、复杂度对照

## 一、基础范式

### 模式 1：算法 + 数据结构双层分类

**问题场景**：仓库收录 100+ 算法 + 20+ 数据结构，如果没有清晰分类，开发者找不到对应实现。混在一个目录里既难检索又难维护。

**解决方案**：采用 algorithms/ 与 data-structures/ 双层目录，按主题分（graph/sorting/search/string/math）而非按难度分（easy/medium/hard）。每算法一个子目录，含 README、实现、测试、步骤图。

```
src/
├── algorithms/        # 算法
│   ├── graph/         # dijkstra/bfs/dfs/bellman-ford
│   ├── sorting/       # quicksort/mergesort/heapsort
│   └── search/        # linear-search/binary-search
└── data-structures/   # 链表/树/哈希/栈/队列/图/布隆
```

**关键参数**：
- 一级分类 = 2 个（algorithms + data-structures）
- 二级主题 = 12+ 算法 + 13+ 数据结构
- 每算法目录 = 4 文件（README/实现/测试/图）
- 50+ 语言 README 翻译

**最佳实践**：知识库型项目用"主题分"代替"难度分"；每条目自包含可独立阅读；多语言翻译降低非英语用户门槛。

### 模式 2：每算法独立目录 = 教学包

**问题场景**：算法光看代码难理解，需要手绘步骤图 + 复杂度表格 + 文字解释才能讲清。传统 README 在仓库根，所有算法挤在一起，新人迷失。

**解决方案**：每算法 1 目录，4 文件配套：README.md（文字+复杂度）、{algo}.js（实现）、__test__/{algo}.test.js（Jest 测试）、images/*.png（步骤截图）。

**关键参数**：
- 目录结构自包含
- README 必含：复杂度表 + 参考链接 + 应用场景
- 测试文件命名 = `__test__/Xxx.test.js`（Jest 默认 glob）
- 图片放子目录 `images/`

**最佳实践**：教学型代码库一律用"1 主题 1 目录"；README 写复杂度让新人秒判断；测试与实现同目录便于覆盖验证。

### 模式 3：复杂度表格 + 适用场景三件套

**问题场景**：同一问题有多解法（如 Dijkstra 数组版 O(V²) vs 堆版 O((V+E)log V)），没有复杂度对比用户无法选择。

**解决方案**：每个 README 标配三件套——复杂度表（time/space/best/worst）+ 适用场景（Google Maps/OSPF）+ 外部参考（Wikipedia + 视频链接）。

| 数据结构 | 时间 | 空间 | 适用 |
| :--- | :--- | :--- | :--- |
| 邻接表 + 二叉堆 | O((V+E)log V) | O(V) | 稀疏图 |
| 邻接矩阵 + 数组 | O(V²) | O(V²) | 稠密图 |
| 桶 | O(E) | O(max_w) | 边权小整数 |

**关键参数**：
- 复杂度 3 情况（最好/平均/最坏）
- 额外标注 in-place + stable
- 真实业务场景（OSPF/Google Maps）建立业务感

**最佳实践**：每个算法 README 强制带复杂度表 + 业务场景；新人 5 秒判断"该用哪个版本"。

### 模式 4：Jest 单测 + 边界用例 5 件套

**问题场景**：算法 90% 时间正确但极端情况崩，单测覆盖度是质量关键。

**解决方案**：Jest `describe` + `it` 组织，每个算法至少 5 用例：基础正确性 + 复杂多跳转 + 边界（空/单/自环/重复）+ 极端（大数据 1000+）+ 异常（负权/无效输入抛错）。

**关键参数**：
- 测试组织 = `describe('algo', () => { it('case', ...) })`
- 边界用例 = 空/单节点/自环/重复边/负权
- 大数据 = 1000+ 节点 + `Date.now()` 性能断言
- 不可达 = `Infinity` 统一语义

**最佳实践**：算法测试 5 用例起步；`Infinity` 表达不可达；`expect(elapsed).toBeLessThan(50)` 写死性能上限。

### 模式 5：ES6 class + 函数式 + 默认 export 教科书风

**问题场景**：算法实现要"教科书风格"而非炫技，新人能直接读懂。`function + class` 混用、`let/const` 严格区分、`Infinity` 显式表达不可达。

**解决方案**：ES6 class 优先（教学友好）+ 函数式 map/filter 辅助 + 默认 export（1 个/文件）+ 解构赋值减少中间变量。优先复用 data-structures 目录下的 PriorityQueue/Stack/Queue。

**关键参数**：
- 风格 = ES6 class + 函数式混用
- export = default 1 个/文件
- 不可达 = `Infinity` 不抛错
- 复用 = 优先从 `data-structures/` 引入

**最佳实践**：算法实现"教科书风格"优先于"性能压榨"；新人 1 分钟读懂 > 老手 0.1s 跑得快。

## 二、扩展范式

### 模式 6：测试驱动 - 强制 `__test__/` 同目录

**问题场景**：算法正确性靠肉眼不可靠，必须自动化。但全局 tests/ 目录让"找测试"成本高。

**解决方案**：每个实现配 `__test__/` 同目录子目录，Jest 默认 glob `**/__test__/**/*.test.js` 自动发现；`jest --coverage` 收集覆盖率；Codecov PR status 可视化。

**关键参数**：
- 测试位置 = 同目录 `__test__/`
- 命名约定 = `*.test.js`
- 覆盖率门槛 = 80% 四项（branches/functions/lines/statements）
- CI = `npm test` 跑全量

**最佳实践**：测试与实现同目录——"看代码就找测试"；`coverageThreshold: 80%` 写死门槛；Codecov PR 状态可视化。

### 模式 7：README 复杂度注释 + 代码 `// O(?)` 双轨

**问题场景**：算法 O(?) 复杂度不写在代码里，新人读完代码还要自己算。README 与代码脱节。

**解决方案**：README 复杂度表格 + 代码关键段 `// O(log n) 查找` 注释双轨。三种情况（最好/平均/最坏）都列；空间复杂度不漏。

**关键参数**：
- O(1) = 常数（数组索引）
- O(log n) = 对数（二分）
- O(n) = 线性（遍历）
- O(n log n) = 线性对数（快排）
- O(n²) = 平方（冒泡）

**最佳实践**：README 表格 + 代码注释双轨；新人"两处都能查到"；任何"算法库"可借鉴此标注规范。

### 模式 8：算法 ↔ 数据结构解耦 + 复用

**问题场景**：Dijkstra 需优先队列、BFS 需队列、HeapSort 需堆，每个算法都写一遍 = 重复且不一致。

**解决方案**：算法从 `data-structures/` import 复用：Dijkstra→PriorityQueue、BFS→Queue、DFS→Stack、HeapSort→Heap。算法 + 数据结构解耦，便于测试时 mock 数据结构专注算法逻辑。

```
algorithms/graph/dijkstra  →  data-structures/priority-queue
algorithms/graph/bfs       →  data-structures/queue
algorithms/graph/dfs       →  data-structures/stack
algorithms/sorting/heap-sort → data-structures/heap
```

**关键参数**：
- 算法依赖 = data-structures 子目录
- 复用度 = 学习价值核心指标
- 新增数据结构 = 新建 `data-structures/X/` 目录

**最佳实践**：算法 + 数据结构彻底解耦；测试时 mock 数据结构专注算法；任何"算法库"应分层。

### 模式 9：Jest + Codecov 覆盖率报表

**问题场景**：覆盖率 50% 时哪些没测？靠人眼看不可持续。

**解决方案**：`jest.config.js` 设 `collectCoverage: true` + `coverageThreshold: { global: 80 }` 四项；`collectCoverageFrom` 排除 `__test__/`；Codecov 在线报告 + GitHub PR status。

**关键参数**：
- `collectCoverage: true` 开启
- `coverageDirectory: 'coverage'` 报告目录
- `coverageThreshold.global: 80%` 四项
- `testMatch: '**/__test__/**/*.test.js'`
- Codecov = GitHub Status 集成

**最佳实践**：`coverageThreshold: 80%` 硬门槛；Codecov PR 状态可视化 diff；排除 `__test__/` 避免自覆盖。

### 模式 10：算法可视化 - 静态截图 + 状态表

**问题场景**：Dijkstra 看了代码仍不理解，步骤图解释最直观。动态 GIF 难以维护。

**解决方案**：每算法目录下 `images/step{N}.png` 静态截图 + README 引用 + 状态表格（步骤/当前节点/距离/已访问）。

**关键参数**：
- 截图 = `images/step*.png`
- 状态表 = 步骤/当前节点/距离/已访问 4 列
- 引用方式 = `![Step 1](images/step1.png)`

**最佳实践**：状态机类算法（Dijkstra/BFS）必配步骤图；截图从代码生成保证准确；README 引用 + 状态表双轨。

## 三、进阶范式

### 模式 11：同一算法多版本实现 + 对比教学

**问题场景**：Dijkstra 数组版 O(V²) vs 堆版 O((V+E)log V) 怎么选？光讲理论不够直观。

**解决方案**：同一算法提供多版本实现（如 `dijkstraArray` + `dijkstraHeap`），README 列出复杂度对比；让用户根据 V/E 规模选实现。

**关键参数**：
- 数组版 = V < 1000 简单图
- 二叉堆版 = 稀疏图（V 大 E 少）
- 斐波那契堆 = 稠密图理论最优
- 桶 = 边权小整数

**最佳实践**：同一算法多版本实现，对比教学；V > 1000 用堆，否则用数组；性能敏感场景按规模选实现。

### 模式 12：边界用例全覆盖 - 5+ 用例起步

**问题场景**：算法 90% 时间对，10% 极端崩。空图/单节点/自环/重复边/负权，缺一就崩。

**解决方案**：强制 5+ 边界用例：空（0 元素）+ 单元素（最小输入）+ 自环（addEdge A A 1）+ 重复边（两不同权）+ 负权（Dijkstra 显式抛错）+ 大数据 1000+ 性能。

**关键参数**：
- 边界 = 空/单/自环/重复/负权/大数据
- 性能断言 = `expect(elapsed).toBeLessThan(100)`
- 不可达 = `Infinity` 统一语义
- 大图 = 1000+ 节点 + 100ms 上限

**最佳实践**：5+ 边界用例起步；大数据 `Date.now()` 测延迟；`Infinity` 表达不可达统一语义。

### 模式 13：复杂度基准测试 - 多规模 + 延迟断言

**问题场景**：声称 O(n log n) 但实际 O(n²)，没有基准测试 = 不可信。

**解决方案**：Jest `forEach size` 多规模（100/1000/10000/100000/1000000）+ `expect(elapsed).toBeLessThan(N)` 延迟上限；多次跑取平均避免 GC 抖动。

**关键参数**：
- 规模 = 100/1k/10k/100k/1M
- 延迟上限 = 1ms/5ms/50ms/500ms/5s
- 断言 = `toBeLessThan`
- 取平均 = `Benchmark.realtime` / 多次取中位数

**最佳实践**：多规模测 `100/1k/10k/100k`；延迟上限写死防退化；性能敏感算法必加基准。

### 模式 14：内存泄漏检测 - 1000 次循环 + heapUsed

**问题场景**：算法用闭包/全局变量会内存泄漏，长时间跑会爆。

**解决方案**：`process.memoryUsage().heapUsed` 监控 V8 堆；1000 次循环 + `[...arr]` 每次新数组；`--expose-gc` 标志下 `global.gc()` 强制回收；内存增长 < 10MB 断言。

**关键参数**：
- `heapUsed` = V8 堆用量
- `heapTotal` = V8 堆总分配
- `external` = C++ 对象占用
- `global.gc()` = 强制 GC（需 `--expose-gc`）
- 1000 次 + < 10MB 增长

**最佳实践**：`--expose-gc` 跑 `global.gc()` 强制回收；1000 次循环 + 内存增长 < 10MB；长时间跑算法必加内存测试。

### 模式 15：图算法 + 静态可视化

**问题场景**：图算法 100+ 节点用 console.log 看不出来，SVG/Canvas 动态可视化难以维护。

**解决方案**：`images/step{N}.png` 静态截图 + README 引用 + 状态表。截图从代码生成保证准确；少数复杂算法用 `animation.gif`。

**关键参数**：
- 静态截图 = `images/step*.png`
- 状态表 = 步骤/当前节点/距离/已访问
- 复杂算法 = GIF 动画
- 工具 = D3.js / Mermaid 辅助

**最佳实践**：图算法静态截图 + 状态表双轨；截图从代码生成保证准确；GIF 留给少数复杂算法。

## 四、实战范式

### 模式 16：CI 矩阵测试 - Node 3 版本 × 跨平台

**问题场景**：Node 16/18/20 都跑一遍，确保兼容性。

**解决方案**：GitHub Actions 矩阵 `node-version: [16.x, 18.x, 20.x]` + `ubuntu/macos/windows` 跨平台；`npm ci`（而非 install）+ `npm test` + `npm run lint` 双跑。

**关键参数**：
- Node 矩阵 = 16/18/20 三个版本
- 平台 = ubuntu/macos/windows
- `npm ci` 而非 `npm install`（CI 友好）
- `npm test` + `npm run lint` 双跑
- Codecov = 覆盖率报告

**最佳实践**：Node 3 版本矩阵 + 跨平台；`npm ci` 锁定 lockfile；`test` + `lint` 双跑；任何开源项目可借鉴此 CI 配置。

### 模式 17：Husky + lint-staged 提交前检查

**问题场景**：贡献者代码不符合风格，PR review 浪费时间。

**解决方案**：Husky + lint-staged + commitlint 三件套：`pre-commit` 跑 `eslint --fix` + `prettier --write`；`commit-msg` 验证格式（`feat:` / `fix:` / `chore:`）。

**关键参数**：
- `pre-commit` 钩子 = `lint-staged`
- `commit-msg` 钩子 = `commitlint -E HUSKY_GIT_PARAMS`
- lint-staged = `*.js` 跑 eslint + prettier
- commit 格式 = `<type>(<scope>): <subject>`

**最佳实践**：`lint-staged` 只处理暂存文件；`commitlint` 验证 commit msg 格式；任何"开源项目"可借鉴此提交前检查。

### 模式 18：多语言 README 翻译生态

**问题场景**：算法题库全球通用，英文 README 阻挡非英语用户。

**解决方案**：`README.{lang}.md` 命名（`zh-CN`/`ja-JA`/`pt-BR`/`es-ES` 等 50+ 语言）+ 主 README 英文 + 翻译异步（1-2 月延迟）+ 贡献者招募翻译容易。

**关键参数**：
- 命名 = `README.{ISO-639-1}-{region}.md`
- 数量 = 50+ 语言
- 主 README = 英文
- 翻译延迟 = 1-2 月
- 招募 = good first issue 翻译任务

**最佳实践**：主 README 英文 + 50+ 翻译；翻译任务 `good first issue` 招募；任何"全球化项目"可借鉴此国际化。

### 模式 19：贡献者奖励 + Open Collective 赞助

**问题场景**：100+ 贡献者如何让其持续贡献？靠荣誉感不够。

**解决方案**：Open Collective 资金赞助 + 贡献者榜单 README 公开致谢 + 双维护者 Code Review + `good first issue` / `help wanted` 标签降低门槛 + GitHub Discussions 设计讨论。

**关键参数**：
- Open Collective = 资金赞助
- 贡献者榜单 = 公开致谢
- Code Review = 双维护者
- 标签 = `good first issue` / `help wanted`
- Discussions = 设计讨论

**最佳实践**：`BACKERS.md` 公开赞助商；`good first issue` 降低门槛；任何"开源项目"可借鉴此治理模式。

### 模式 20：教材 + 大学课程 + 求职准备场景化

**问题场景**：算法题库如何不沦为"玩具"？必须绑真实用户场景。

**解决方案**：覆盖 3 大场景——求职准备（60% 高频题 + 复杂度）+ 大学课程（20% Princeton Algorithms 课用）+ 自学者（15% 多语言 + 易读）+ 教学（5% 步骤图 + 表格）。

**关键参数**：
- 求职 = 60%（高频题 + 复杂度）
- 大学 = 20%（教学 + 测试）
- 自学 = 15%（多语言 + 易读）
- 教学 = 5%（步骤图 + 表格）

**最佳实践**：求职 + 大学 + 自学三场景覆盖；复杂度表格 + 真实应用场景建立业务感；任何"教育型项目"应场景化定位。

## 总结速查

**一句话价值**：javascript-algorithms = 100+ JS 算法实现 + 完整测试 + 复杂度分析 + 50+ 语言 README + 193k+ Star。

**5 核心架构模式**：双层分类（主题分）/ 1 算法 1 目录（自包含教学包）/ 复杂度表（time/space/best 三件套）/ Jest 5+ 用例边界覆盖 / ES6 class + 函数式教科书风。

**5 进阶模式**：测试驱动 `__test__/` 同目录 / README+代码复杂度双轨 / 算法↔数据结构解耦 / Jest+Codecov 覆盖率 / 静态截图+状态表可视化。

**5 实战模式**：同一算法多版本对比 / 5+ 边界用例全覆盖 / 多规模延迟基准 / 1000 次循环内存检测 / CI 矩阵 Node 3 版本 + Husky 提交前检查 + 50+ 多语言 + Open Collective + 场景化。

**5 段必读代码**：
- `src/algorithms/graph/dijkstra/dijkstra.js`（Dijkstra 优先队列）
- `src/data-structures/tree/red-black-tree/RedBlackTree.js`（红黑树完整实现）
- `src/data-structures/doubly-linked-list/doublyLinkedList.js`（双链）
- `src/algorithms/sorting/quick-sort/quickSort.js`（快排）
- `src/algorithms/search/binary-search/binarySearch.js`（二分）

**3 避坑要点**：
1. 不要每个算法都用同一数据结构（复杂度差异巨大）
2. 不要忽略边界测试（空/单/自环/负权）
3. 不要让算法"炫技"（保持 ES6 class + 教科书风）

**仓库元信息**：193k+ Star（2026）；JavaScript（ES6+）；Jest 测试；MIT；核心目录 `src/algorithms/` + `src/data-structures/`。
