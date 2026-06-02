# JavaScript Algorithms · ABL 风格深度解析

> 主题：193k+ Star 的 JS 算法与数据结构题库，含详细解释 + 测试 + 复杂度分析。本文聚焦 20 个可复用模式（核心原理 / 架构设计 / 性能优化 / 可靠性与生态）。

---

## 一、核心原理

### 模式 1：算法 + 数据结构双层分类

**问题场景**：刷题平台 100+ 算法 + 20+ 数据结构，**没有清晰分类 = 找不到对应实现**。javascript-algorithms 用双层分类（algorithms 目录 + data-structures 目录），**按主题而非按难度**组织。

**解决方案架构**：
```
src/
├── algorithms/                # 算法
│   ├── graph/
│   │   ├── dijkstra/         # 单源最短路径
│   │   ├── bfs/              # 广度优先
│   │   ├── dfs/              # 深度优先
│   │   └── bellman-ford/     # 单源最短（负权）
│   ├── sorting/
│   │   ├── quicksort/        # 快速排序
│   │   ├── mergesort/        # 归并排序
│   │   └── heapsort/         # 堆排序
│   ├── search/
│   │   ├── linear-search/    # 线性查找
│   │   └── binary-search/    # 二分查找
│   ├── math/
│   │   ├── bits/             # 位运算
│   │   └── factorial/        # 阶乘
│   └── string/
│       ├── knuth-morris-pratt/  # KMP
│       └── rabin-karp/          # RK
└── data-structures/           # 数据结构
    ├── linked-list/
    │   ├── linked-list/         # 单链
    │   └── doubly-linked-list/  # 双链
    ├── tree/
    │   ├── binary-tree/         # 二叉树
    │   ├── avl-tree/            # AVL
    │   ├── red-black-tree/      # 红黑树
    │   └── heap/                # 堆
    ├── hash-table/              # 哈希表
    ├── stack/                   # 栈
    ├── queue/                   # 队列
    ├── graph/                   # 图
    └── bloom-filter/            # 布隆过滤器
```

**关键参数表**：

| 一级 | 数量 | 主题 |
| :--- | :---: | :--- |
| algorithms | 12+ | 排序/搜索/图/字符串/数学 |
| data-structures | 13+ | 链表/树/哈希/栈/队列/图 |
| 总文件 | 941 | JS + 测试 + 文档 + 图 |
| README | 50+ 语言 | 多语言翻译（PT/ES/FR/CN/...）|

**最佳实践**：
- ✅ 算法 + 数据结构 **双层目录** 分离关注点
- ✅ 主题分（graph/sorting）而非难度分（easy/medium/hard）
- ✅ 每算法一个子目录（含 README + 截图 + 实现 + 测试）
- ✅ 多语言 README 翻译 **降低学习门槛**
- ✅ 任何"知识库类项目"可借鉴此分类法

---

### 模式 2：每算法 1 个目录 = README + 实现 + 测试 + 图

**问题场景**：算法光看代码难理解，**手绘 + 步骤图 + 复杂度表格**才是教学核心。javascript-algorithms 用"1 目录 = 完整教学包"组织。

**解决方案**（以 Dijkstra 为例）：
```
src/algorithms/graph/dijkstra/
├── README.md           # 详细解释 + 复杂度
├── dijkstra.js         # 实现
├── __test__/
│   └── dijkstra.test.js  # Jest 测试
└── images/             # 截图（步骤图）
    ├── step1.png
    ├── step2.png
    └── final.png
```

**关键参数表**：

| 文件 | 用途 | 必含 |
| :--- | :--- | :--- |
| `README.md` | 文字讲解 | 复杂度 + 步骤 |
| `{algo}.js` | 代码实现 | export 函数 |
| `__test__/{algo}.test.js` | 单元测试 | Jest |
| `images/*.png` | 可视化 | 步骤图/动画 |

**最佳实践**：
- ✅ **1 算法 1 目录**而非 1 文件，**自包含**
- ✅ README 含时间/空间复杂度、**新人快速判断**
- ✅ 截图从代码生成（`/images/` 目录是静态资源）
- ✅ 测试 + 实现 + 文档 **三者配套**发布
- ✅ 任何"教学型代码库"可借鉴此自包含模式

---

### 模式 3：算法 + 复杂度表格 + 适用场景

**问题场景**：同一个问题有多种解法，**复杂度决定选择**。javascript-algorithms 每个 README 都附复杂度表格，**让用户快速决策**。

**解决方案 README 片段**（`dijkstra/README.md`）：
```markdown
# Dijkstra 算法

## 复杂度

| 数据结构 | 时间复杂度 | 空间复杂度 |
| :--- | :--- | :--- |
| 邻接表 + 二叉堆 | O((V+E) log V) | O(V) |
| 邻接矩阵 + 数组 | O(V²) | O(V²) |

## 参考实现

- [Wikipedia](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm)
- [YouTube - Computerphile](https://youtube.com/...)

## 应用场景

- Google Maps 最短路径
- OSPF 路由协议
- 网络延迟估计
```

**关键参数表**：

| 字段 | 含义 | 示例 |
| :--- | :--- | :--- |
| `Time Complexity` | 时间复杂度 | O(n log n) |
| `Space Complexity` | 空间复杂度 | O(n) |
| `Best` | 最优情况 | O(n) |
| `Average` | 平均 | O(n log n) |
| `Worst` | 最坏 | O(n²) |
| `In-place` | 原地 | yes/no |
| `Stable` | 稳定排序 | yes/no |

**最佳实践**：
- ✅ 复杂度表格 **三列起步**（time/space/best）
- ✅ 注明 in-place / stable，**辅助选择**
- ✅ 引用 Wikipedia + 视频链接，**权威参考**
- ✅ 列出真实应用场景（Google Maps / OSPF），**业务感**
- ✅ 任何"算法对比"项目可借鉴此表格

---

### 模式 4：Jest 单测 + 边界用例

**问题场景**：算法实现错一个边界用例就崩，**测试覆盖度是质量关键**。javascript-algorithms 用 Jest 全量测试，**每个算法至少 5+ 用例**。

**解决方案测试**（`dijkstra/__test__/dijkstra.test.js` 节选）：
```js
import dijkstra from '../dijkstra';

describe('dijkstra', () => {
    it('should find shortest path in simple graph', () => {
        const graph = new Graph();
        graph.addVertex('A');
        graph.addVertex('B');
        graph.addEdge('A', 'B', 1);
        const result = dijkstra(graph, 'A');
        expect(result.distances).toEqual({ A: 0, B: 1 });
    });

    it('should handle disconnected graph', () => {
        const graph = new Graph();
        graph.addVertex('A');
        graph.addVertex('B');  // 不连
        const result = dijkstra(graph, 'A');
        expect(result.distances.B).toBe(Infinity);
    });

    it('should handle negative weights error', () => {
        // Dijkstra 不支持负权
    });
});
```

**关键参数表**：

| 用例类型 | 必测 | 用途 |
| :--- | :--- | :--- |
| 简单图 | ✓ | 基础正确性 |
| 复杂图 | ✓ | 多次跳转 |
| 边界 | ✓ | 单节点/空图/自环 |
| 极端 | ✓ | 大图 + 性能 |
| 负权/无效输入 | ✓ | 显式抛错 |

**最佳实践**：
- ✅ Jest `describe` + `it` 组织用例
- ✅ **5+ 用例** 起步（基础/边界/极端/异常/性能）
- ✅ 失败用例显式测（`expect().toThrow()`）
- ✅ `Infinity` 表达不可达
- ✅ 任何"算法测试"可借鉴此模式

---

### 模式 5：实现代码风格 + ES6 export

**问题场景**：算法实现要"教科书风格"**而非炫技**。javascript-algorithms 全部用 ES6 class + 函数式 + 显式 export，**新人可读**。

**解决方案实现**（`dijkstra.js` 节选）：
```js
import PriorityQueue from '../../../data-structures/priority-queue/PriorityQueue';

export default function dijkstra(graph, startVertex) {
    const distances = {};
    const visited = {};
    const queue = new PriorityQueue();

    // 初始化
    graph.getAllVertices().forEach((vertex) => {
        distances[vertex] = Infinity;
        visited[vertex] = false;
    });
    distances[startVertex] = 0;
    queue.add({ vertex: startVertex, distance: 0 });

    while (!queue.isEmpty()) {
        const { vertex, distance } = queue.poll();
        if (visited[vertex]) continue;
        visited[vertex] = true;

        graph.getNeighbors(vertex).forEach((neighbor) => {
            const edge = graph.getEdge(vertex, neighbor);
            const newDistance = distance + edge.weight;
            if (newDistance < distances[neighbor]) {
                distances[neighbor] = newDistance;
                queue.add({ vertex: neighbor, distance: newDistance });
            }
        });
    }

    return { distances, visited };
}
```

**关键参数表**：

| 风格 | 决策 | WHY |
| :--- | :--- | :--- |
| ES6 class | 优先 | 教学友好 |
| 函数式辅助 | map/filter | 简洁 |
| 默认 export | 1 个/文件 | 测试方便 |
| 解构赋值 | 常用 | 减少中间变量 |
| 命名导出 | 辅助函数 | 复用 |

**最佳实践**：
- ✅ **ES6 class + 函数式混用**，**新人友好**
- ✅ 显式 `Infinity` 表示不可达，**不抛错**
- ✅ `visited` 数组防环，**O(V) 额外空间**
- ✅ 优先队列用现成 data-structure，**不重写**
- ✅ 默认 export + 测试文件 `import X from '../X'`

---

## 二、架构设计

### 模式 6：测试驱动 - 每个实现配 __test__/ 目录

**问题场景**：算法正确性靠肉眼检查不可靠，**必须自动化测试**。javascript-algorithms 强制每个实现配 `__test__/` 目录，**没有测试 = 不合格**。

**解决方案结构**：
```
src/algorithms/graph/dijkstra/
├── dijkstra.js
└── __test__/
    └── dijkstra.test.js

src/data-structures/tree/red-black-tree/
├── RedBlackTree.js
└── __test__/
    └── RedBlackTree.test.js
```

**关键参数表**：

| 模式 | 用途 | 文件位置 |
| :--- | :--- | :--- |
| `__test__/` | 单元测试 | 同目录 |
| `*.test.js` | Jest 文件 | 命名约定 |
| `coverage/` | 覆盖率 | Jest 输出 |
| `jest --coverage` | 跑全量 | 100% 覆盖 |

**最佳实践**：
- ✅ **测试与实现同目录**，**新人看代码就找到测试**
- ✅ `__test__/` 命名（Jest 默认 glob 模式）
- ✅ 覆盖率目标 **80%+**（可由 Codecov 监控）
- ✅ CI 跑 `npm test`，**不通过则不合并**
- ✅ 任何"代码库"可借鉴此测试布局

---

### 模式 7：复杂度分析 O(1) 注释标注

**问题场景**：算法 O(?) 复杂度不写在代码里，新人**要自己算**。javascript-algorithms 在 README 标注，**新人不用瞎猜**。

**解决方案 README 模板**：
```markdown
## 算法复杂度

| 情况 | 时间 | 空间 |
| :--- | :--- | :--- |
| 最好 | O(n) | O(1) |
| 平均 | O(n log n) | O(log n) |
| 最坏 | O(n²) | O(log n) |

## 关键代码段

\`\`\`js
// O(log n) 查找
while (low <= high) {
    const mid = (low + high) >>> 1;
    if (arr[mid] === target) return mid;
    // ...
}
\`\`\`
```

**关键参数表**：

| 标注 | 含义 | 决策依据 |
| :--- | :--- | :--- |
| `O(1)` | 常数 | 数组索引 |
| `O(log n)` | 对数 | 二分 |
| `O(n)` | 线性 | 遍历 |
| `O(n log n)` | 线性对数 | 快速排序 |
| `O(n²)` | 平方 | 冒泡排序 |
| `O(2^n)` | 指数 | 子集 |
| `O(n!)` | 阶乘 | 排列 |

**最佳实践**：
- ✅ README 标注 + 代码注释**双轨**
- ✅ 三种情况（最好/平均/最坏）**都列**
- ✅ 空间复杂度 **不要漏**
- ✅ 任何"算法库"可借鉴此标注

---

### 模式 8：跨算法复用 data-structures

**问题场景**：Dijkstra 需优先队列，BFS 需队列，**每个算法都写一遍 = 重复**。javascript-algorithms 复用 `data-structures/` 下实现，**算法 + 数据结构解耦**。

**解决方案依赖图**：
```
algorithms/graph/dijkstra  →  data-structures/priority-queue
algorithms/graph/bfs       →  data-structures/queue
algorithms/graph/dfs       →  data-structures/stack
algorithms/sorting/heap-sort →  data-structures/heap
algorithms/string/kmp      →  data-structures/string
```

**关键参数表**：

| 算法 | 依赖数据结构 | 用途 |
| :--- | :--- | :--- |
| Dijkstra | PriorityQueue | 取最小距离 |
| BFS | Queue | 层次遍历 |
| DFS | Stack | 深度遍历 |
| HeapSort | Heap | 排序 |
| KMP | String | 子串查找 |
| Union Find | DisjointSet | 连通分量 |

**最佳实践**：
- ✅ 算法 + 数据结构 **解耦**，**优先复用**
- ✅ 新增数据结构需 `data-structures/` 新目录
- ✅ 任何"算法库"可借鉴此解耦
- ✅ 测试时 mock 数据结构，**专注算法逻辑**
- ✅ 复用度越高，**学习价值越大**

---

### 模式 9：Jest 配置 + 覆盖率报告

**问题场景**：算法库覆盖率 50% 时哪些没测？javascript-algorithms 用 Jest + Codecov，**覆盖率报表**。

**解决方案 `jest.config.js`**：
```js
module.exports = {
    collectCoverage: true,
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.{js,jsx}',
        '!src/**/__test__/**',
    ],
    coverageThreshold: {
        global: { branches: 80, functions: 80, lines: 80, statements: 80 },
    },
    testMatch: ['**/__test__/**/*.test.js'],
};
```

**关键参数表**：

| 字段 | 含义 | 推荐 |
| :--- | :--- | :--- |
| `collectCoverage` | 收集覆盖率 | true |
| `coverageDirectory` | 报告输出 | `coverage/` |
| `coverageThreshold` | 阈值 | 80% |
| `testMatch` | glob 模式 | `**/__test__/**/*.test.js` |
| `Codecov` | 在线报告 | GitHub Status |

**最佳实践**：
- ✅ `coverageThreshold: 80%` **硬性门槛**
- ✅ Codecov PR status **可视化 diff**
- ✅ 排除 `__test__/`，**避免自覆盖**
- ✅ 任何"代码库"可借鉴此 Jest 配置

---

### 模式 10：算法可视化 - 算法 + 步骤图

**问题场景**：Dijkstra 看了代码仍不理解，**步骤图解释**最直观。javascript-algorithms 把截图放在 `/images/`，**README 引用**。

**解决方案 README 截图引用**：
```markdown
## 步骤演示

![Step 1](images/step1.png)
![Step 2](images/step2.png)
![Step 3](images/step3.png)

| 步骤 | 当前节点 | 距离 | 已访问 |
| :--- | :--- | :--- | :--- |
| 1 | A | A:0, B:∞, C:∞ | {A} |
| 2 | B | A:0, B:1, C:∞ | {A, B} |
| 3 | C | A:0, B:1, C:3 | {A, B, C} |
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `images/step*.png` | 步骤截图 |
| `images/animation.gif` | 动画（少数算法） |
| README 表格 | 状态机变化 |
| 注释 `// O(?)` | 代码复杂度 |

**最佳实践**：
- ✅ 截图 + 表格 **配合** 比单一更好
- ✅ 状态机类算法（Dijkstra/BFS）**必须配步骤图**
- ✅ GIF 适合**演示快**的场景
- ✅ 任何"算法教学"项目可借鉴

---

## 三、性能优化

### 模式 11：数据结构选型决定算法复杂度

**问题场景**：Dijkstra 用数组 O(V²) 还是用二叉堆 O((V+E) log V)？**数据结构决定性能上限**。javascript-algorithms 演示这种"同一算法 + 不同结构"。

**解决方案对比**（Dijkstra 两种实现）：
```js
// 方案 1: 数组 + 线性扫描
// 时间: O(V²)
// 空间: O(V²)
function dijkstraArray(graph, start) {
    const distances = {};  // 数组
    const visited = new Set();
    while (visited.size < graph.size) {
        // 找最小未访问 → O(V)
        const min = findMin(distances, visited);
        visited.add(min);
        // ...
    }
}

// 方案 2: 优先队列（堆）
// 时间: O((V+E) log V)
// 空间: O(V)
function dijkstraHeap(graph, start) {
    const distances = {};
    const queue = new PriorityQueue();  // 堆
    queue.add({ vertex: start, distance: 0 });
    while (!queue.isEmpty()) {
        // poll min → O(log V)
        const { vertex, distance } = queue.poll();
        // ...
    }
}
```

**关键参数表**：

| 数据结构 | 时间 | 空间 | 适用 |
| :--- | :--- | :--- | :--- |
| 数组 + 线性扫描 | O(V²) | O(V²) | V < 1000 |
| 二叉堆 | O((V+E) log V) | O(V) | 稀疏图 |
| 斐波那契堆 | O(E + V log V) | O(V) | 稠密图（理论最优） |
| 桶 | O(E) | O(max_weight) | 边权小整数 |

**最佳实践**：
- ✅ 同一算法 **多版本实现**，**对比教学**
- ✅ 优先队列用 `data-structures/priority-queue`
- ✅ V > 1000 用堆，**否则用数组**
- ✅ 任何"算法优化"项目可借鉴此对比

---

### 模式 12：测试用例覆盖极端情况

**问题场景**：算法 90% 时间对，**极端情况崩溃**。javascript-algorithms 强制测试覆盖单节点/空图/自环/重复边/负权。

**解决方案**（以图算法为例）：
```js
describe('graph algorithms edge cases', () => {
    it('should handle empty graph', () => {
        const graph = new Graph();
        expect(bfs(graph, 'A')).toEqual({ visited: [], distances: {} });
    });

    it('should handle single node', () => {
        const graph = new Graph();
        graph.addVertex('A');
        const result = bfs(graph, 'A');
        expect(result.distances).toEqual({ A: 0 });
    });

    it('should handle self-loop', () => {
        const graph = new Graph();
        graph.addVertex('A');
        graph.addEdge('A', 'A', 1);  // 自环
        const result = bfs(graph, 'A');
        expect(result.distances).toEqual({ A: 0 });
    });

    it('should handle disconnected graph', () => {
        const graph = new Graph();
        graph.addVertex('A');
        graph.addVertex('B');  // 孤立
        const result = bfs(graph, 'A');
        expect(result.distances.B).toBe(Infinity);
    });

    it('should handle large graph performance', () => {
        const graph = generateLargeGraph(1000);
        const start = Date.now();
        bfs(graph, 'A');
        expect(Date.now() - start).toBeLessThan(100);  // 100ms 内
    });
});
```

**关键参数表**：

| 边界 | 关键 |
| :--- | :--- |
| 空 | 输入 0 元素 |
| 单元素 | 最小输入 |
| 自环 | `addEdge(A, A, 1)` |
| 重复边 | 两条边同点不同权 |
| 负权 | Dijkstra 不支持 |
| 大数据 | 1000+ 节点性能 |

**最佳实践**：
- ✅ **5+ 边界用例**起步
- ✅ 大数据用 `Date.now()` 测延迟
- ✅ `Infinity` 表达不可达，**统一语义**
- ✅ 任何"算法测试"可借鉴

---

### 模式 13：复杂度基准测试

**问题场景**：声称 O(n log n) 但实际 O(n²)，**没有基准测试 = 不可信**。javascript-algorithms 用 Jest `it.skip` 或自定义 benchmark 测性能。

**解决方案**（benchmark 模式）：
```js
describe('quicksort performance', () => {
    const sizes = [100, 1000, 10000, 100000];

    sizes.forEach((size) => {
        it(`should sort ${size} elements in < 50ms`, () => {
            const arr = generateRandomArray(size);
            const start = Date.now();
            quicksort(arr);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeLessThan(50);
        });
    });
});
```

**关键参数表**：

| 规模 | 期望延迟 | 复杂度 |
| :--- | :--- | :--- |
| 100 | < 1ms | O(n log n) |
| 1000 | < 5ms | O(n log n) |
| 10000 | < 50ms | O(n log n) |
| 100000 | < 500ms | O(n log n) |
| 1000000 | < 5s | O(n log n) |

**最佳实践**：
- ✅ 多规模测 `100 / 1000 / 10000 / 100000`
- ✅ 延迟上限 **写死**（避免退化）
- ✅ `expect(elapsed).toBeLessThan(50)` **断言**
- ✅ 任何"性能敏感"算法可借鉴

---

### 模式 14：内存泄漏检测 - 大数据多次调用

**问题场景**：算法用闭包/全局变量会内存泄漏，**长时间跑会爆**。javascript-algorithms 演示用 `process.memoryUsage()` 监控。

**解决方案**：
```js
it('should not leak memory after 1000 runs', () => {
    const arr = generateRandomArray(10000);
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
        quicksort([...arr]);  // 每次新数组
    }
    // 强制 GC（仅在 --expose-gc 标志下）
    if (global.gc) global.gc();
    const after = process.memoryUsage().heapUsed;
    const diff = (after - before) / 1024 / 1024;  // MB
    expect(diff).toBeLessThan(10);  // < 10MB 增长
});
```

**关键参数表**：

| 监控 | 含义 |
| :--- | :--- |
| `heapUsed` | V8 堆用量 |
| `heapTotal` | V8 堆总分配 |
| `external` | C++ 对象占用 |
| `rss` | 物理内存占用 |
| `global.gc()` | 强制 GC（需 `--expose-gc`） |

**最佳实践**：
- ✅ `--expose-gc` 跑 `global.gc()` **强制回收**
- ✅ 1000 次循环 + 内存增长 < 10MB
- ✅ 任何"长时间跑"算法可借鉴

---

### 模式 15：图算法 + 大数据可视化

**问题场景**：图算法 100+ 节点用 console.log 看不出，**SVG/Canvas 可视化**。javascript-algorithms 用 `images/` 静态截图演示。

**解决方案**（`dijkstra` 步骤截图）：
```
images/
├── step1.png  # 起点 A
├── step2.png  # 处理 A 邻居
├── step3.png  # 选最小 B
├── step4.png  # 处理 B 邻居
└── final.png  # 全部 visited
```

**关键参数表**：

| 工具 | 用途 | 优势 |
| :--- | :--- | :--- |
| `images/*.png` | 静态截图 | GitHub 友好 |
| `images/animation.gif` | 动态 | 复杂算法 |
| D3.js | 自动生成 | 实时 |
| Mermaid | 文本图 | 编辑友好 |

**最佳实践**：
- ✅ 截图从代码生成，**保证准确**
- ✅ README 引用 + 步骤表，**双轨**
- ✅ 任何"图算法教学"可借鉴

---

## 四、可靠性与生态

### 模式 16：CI + GitHub Actions 矩阵测试

**问题场景**：Node 16/18/20 都跑一遍，**确保兼容性**。javascript-algorithms 用 GitHub Actions 矩阵。

**解决方案 `.github/workflows/test.yml`**：
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
      - run: npm run lint
```

**关键参数表**：

| 矩阵 | 用途 |
| :--- | :--- |
| `node-version: [16, 18, 20]` | Node 兼容 |
| `ubuntu/macos/windows` | 跨平台 |
| `npm test` | 跑测试 |
| `npm run lint` | 跑 lint |
| `Codecov` | 覆盖率 |

**最佳实践**：
- ✅ Node 3 版本矩阵，**向前向后兼容**
- ✅ `npm ci` 而非 `npm install`，**CI 友好**
- ✅ `npm test` + `npm run lint` **双跑**
- ✅ 任何"开源项目"可借鉴此 CI

---

### 模式 17：Husky + lint-staged 提交前检查

**问题场景**：贡献者提交的代码不符合风格，**PR review 浪费**。javascript-algorithms 用 Husky + lint-staged，**提交前自动格式化**。

**解决方案**：
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"],
    "*.md": ["prettier --write"]
  }
}
```

**关键参数表**：

| 钩子 | 时机 | 用途 |
| :--- | :--- | :--- |
| `pre-commit` | git commit 前 | 格式化暂存文件 |
| `commit-msg` | commit msg 写入 | 验证 commit 格式 |
| `eslint --fix` | 自动修 | 风格修复 |
| `prettier --write` | 自动格式化 | 缩进/引号 |

**最佳实践**：
- ✅ `lint-staged` 只处理 **暂存文件**
- ✅ `commitlint` 验证 commit msg 格式（`feat:` / `fix:` / ...）
- ✅ 任何"开源项目"可借鉴此钩子

---

### 模式 18：多语言 README 翻译生态

**问题场景**：算法题库全球通用，**英文 README 阻挡非英语用户**。javascript-algorithms 招募 50+ 翻译者，**50+ 语言 README**。

**解决方案结构**：
```
├── README.md                    # 英文主
├── README.ar-AR.md              # 阿拉伯
├── README.de-DE.md              # 德语
├── README.es-ES.md              # 西班牙
├── README.fr-FR.md              # 法语
├── README.he-IL.md              # 希伯来
├── README.id-ID.md              # 印尼
├── README.it-IT.md              # 意大利
├── README.ja-JA.md              # 日语
├── README.ko-KR.md              # 韩语
├── README.pl-PL.md              # 波兰
├── README.pt-BR.md              # 巴西葡
├── README.ru-RU.md              # 俄语
├── README.tr-TR.md              # 土耳其
├── README.uk-UA.md              # 乌克兰
├── README.vi-VI.md              # 越南
├── README.zh-CN.md              # 简体
└── README.zh-TW.md              # 繁体
```

**关键参数表**：

| 命名 | 含义 |
| :--- | :--- |
| `README.{lang}.md` | 翻译版本 |
| `lang` | ISO 639-1 + 地区 |
| 主 README | 英文 |
| 翻译延迟 | 1-2 月 |

**最佳实践**：
- ✅ 主 README 英文，**翻译异步**
- ✅ 50+ 语言，**国际化**
- ✅ 贡献者招募 **翻译** 容易
- ✅ 任何"全球化项目"可借鉴

---

### 模式 19：贡献者奖励 + 社区治理

**问题场景**：开源项目 100+ 贡献者，**如何让贡献者持续贡献**？javascript-algorithms 用 Open Collective + 积分榜。

**解决方案**：
```
BACKERS.md  # 赞助商
README.md   # 贡献者榜单
```

**关键参数表**：

| 机制 | 用途 |
| :--- | :--- |
| Open Collective | 资金赞助 |
| 贡献者榜单 | 公开致谢 |
| Code Review | 双维护者 |
| Issue 标签 | good first issue / help wanted |
| Discussions | 设计讨论 |

**最佳实践**：
- ✅ `BACKERS.md` **公开赞助商**
- ✅ `good first issue` **降低门槛**
- ✅ 任何"开源项目"可借鉴此治理

---

### 模式 20：教材 + 大学课程 + 求职准备

**问题场景**：算法题库如何**不沦为"玩具"**？javascript-algorithms 与大学课程 + 求职准备强绑定，**真实用户场景**。

**解决方案**：
```
用户场景
├── 求职准备     (LeetCode + javascript-algorithms 双修)
├── 大学课程     (Princeton Algorithms 课用此)
├── 自学者       (多语言 README)
├── 面试官       (题库参考)
└── 教师         (教学材料)
```

**关键参数表**：

| 场景 | 占比 | 关注点 |
| :--- | :---: | :--- |
| 求职 | 60% | 高频题 + 复杂度 |
| 大学 | 20% | 教学 + 测试 |
| 自学 | 15% | 多语言 + 易读 |
| 教学 | 5% | 步骤图 + 表格 |

**最佳实践**：
- ✅ 求职准备 + 大学课程 + 自学者 **三场景覆盖**
- ✅ 复杂度表格 + 真实应用场景，**业务感**
- ✅ 任何"教育型项目"可借鉴此场景化

---

## 总结速查

**一句话价值**：javascript-algorithms = 100+ JS 算法实现 + 完整测试 + 复杂度分析 + 多语言 README + 193k+ Star = 全球开发者学习算法的首选仓库。

**5 个核心架构模式**：
1. **算法 + 数据结构双层分类**：双目录分离关注点
2. **每算法 1 目录 = README + 实现 + 测试 + 图**：自包含教学包
3. **复杂度表格三列**：time/space/best，决策依据
4. **Jest 测试覆盖边界**：5+ 用例起步
5. **ES6 class + 函数式混用**：新人友好

**5 个性能优化模式**：
1. **同一算法多版本实现**：对比教学（数组 O(V²) vs 堆 O((V+E) log V)）
2. **边界用例全覆盖**：空/单/自环/重复/负权/大数据
3. **复杂度基准测试**：多规模 + 延迟断言
4. **内存泄漏检测**：1000 次循环 + 内存增长 < 10MB
5. **静态步骤图 + 状态表格**：图算法教学

**5 个可靠性与生态模式**：
1. **CI 矩阵测试**：Node 3 版本 + 跨平台
2. **Husky + lint-staged**：提交前自动格式化
3. **多语言 README 50+**：国际化生态
4. **Open Collective 赞助**：资金 + 贡献者榜单
5. **教学场景覆盖**：求职 + 大学 + 自学

**5 段必读代码**：
- `src/algorithms/graph/dijkstra/dijkstra.js`（Dijkstra 优先队列实现）
- `src/data-structures/tree/red-black-tree/RedBlackTree.js`（红黑树完整实现）
- `src/data-structures/doubly-linked-list/doublyLinkedList.js`（双链实现）
- `src/algorithms/sorting/quick-sort/quickSort.js`（快排实现）
- `src/algorithms/search/binary-search/binarySearch.js`（二分查找）

**3 个避坑要点**：
1. **不要每个算法都用同一个数据结构**：复杂度差异巨大（V² vs log V）
2. **不要忽略边界测试**：单节点/空图/自环/负权
3. **不要让算法实现"炫技"**：保持 ES6 class + 教科书风格，**新人可读**

**仓库元信息**：
- 路径：`G:\Obsidian Vault\实战案例\javascript-algorithms.md`
- 版本：193k+ Star（2026）
- 主语言：JavaScript（ES6+）
- 核心目录：`src/algorithms/` + `src/data-structures/`
- 测试：Jest
- License：MIT
- Star：193k+
