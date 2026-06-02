# coding-interview-university - 8 个月自学 CS 学习清单：从新手到大厂工程师

**GitHub**: jwasham/coding-interview-university
**Star**: 320k+
**语言**: Markdown
**主题**: 学习路线/计算机基础/算法/数据结构/系统设计/面试准备
**适用场景**: 自学 CS 转码工程师、非科班想进大厂、面试 FLAG/BAT 准备、计算机基础补课

## 第一段：基础范式

### 模式 1：README.md 138KB 单文件学习清单

**问题场景**：自学 CS 不知道"学什么 + 顺序 + 深度 + 资源"——网上 1000+ 路线图碎片化、过时、不完整。

**解决方案**：用 138KB / 2022 行 README.md 单一文件——把"计算机本科核心课程"压缩成可执行 TODO 列表。`extras/cheat sheets/` 配 10 个离线 PDF。30+ 翻译版 fork。
```
README.md                    138KB / 2022 行
programming-language-resources.md  113 行
extras/cheat sheets/         10 个 PDF
translations/                30+ 语言
```

**关键参数**：
- 138KB / 2022 行单文件
- 30+ 语言翻译版
- 10 个离线 PDF 速查
- 8 个月学习周期
- 30+ 算法/数据结构主题

**最佳实践**：学习路线优先单文件 README——避免 docs/ 碎片化；30+ 翻译版 fork——网络效应；离线 PDF 速查——随时复习；自上而下主题组织——从 Big-O 到系统设计；项目方"亲历者"——John Washam 自学入职 Amazon。

---

### 模式 2：主题按"难度递进"组织而非"代码规模"

**问题场景**：学习清单如何排？按"页数"还是按"重要性"？新手看不懂"分布式系统"怎么办？

**解决方案**：按"难度递进"组织——Big-O → 数据结构三件套 → 树 → 排序 → 图 → 高级主题（DP/Recursion/Networking/系统设计）。**前半是"如何写代码"，后半是"如何设计系统"**。
```
Week 1-2:   Big-O + 复杂度
Week 3-4:   数据结构 (Array/LinkedList/Stack/Queue/Hash)
Week 5-6:   树 + 排序
Week 7-8:   图 + 算法
Week 9-12:  高级主题 (DP/Recursion/Networking/SQL/系统设计)
Week 13-16: 综合 + 刷题 + 模拟面试
```

**关键参数**：
- 16 周总时长
- 难度递进而非规模
- 前半基础数据结构
- 后半系统设计
- 1-5 年工程师成长路径

**最佳实践**：学习清单按"难度递进"组织；新手从 Big-O 入门；算法 → 数据结构 → 系统设计；每周有明确产出；与"代码行数"无关——与"心智模型建立"有关；亲历者经验比教科书好。

---

### 模式 3：每个主题给 3-7 个资源链接

**问题场景**：网上资源太多（书 / 课 / 视频 / 博客）——选哪个？选错了浪费 1 周。

**解决方案**：每个主题给 3-7 个资源链接——书（如 CLRS）+ 在线课（如 Coursera）+ 视频（如 MIT OCW）+ 练习（如 LeetCode）。**作者亲测 + 难度标记**。
```
主题: Hash Table
- 书: CLRS Chapter 11
- 课: MIT 6.006 Lecture 8
- 视频: William Fiset YouTube
- 练习: LeetCode #1 #49 #128
- 难度: 中
- 时长: 3-5 天
```

**关键参数**：
- 3-7 个资源
- 多形式（书/课/视频/练习）
- 难度标记
- 时长估算
- 作者亲测

**最佳实践**：每个主题给 3-7 个资源——避免单点失败；多形式——视觉/听觉/动手不同学习风格；难度 + 时长标记——可预期；作者亲测——质量背书；不要追求"完整"——追求"够用"。

---

### 模式 4：Topic of Study 主目录（L97-141）

**问题场景**：138KB 文档用户如何快速定位？

**解决方案**：用 `Topics of Study` 主目录（L97-141）——30+ 主题分章节，每章有 anchor 链接。**TOC 是大文档的生命线**。
```
## Topics of Study
- Algorithmic complexity / Big-O
- Data Structures
  - Arrays
  - Linked Lists
  - Stack / Queue
  - Hash Table
- Trees
- Sorting
- Graphs
- Even More Knowledge
  - Recursion
  - Dynamic Programming
  - Object-Oriented Programming
  - Design Patterns
  - Networks
  - System Design
```

**关键参数**：
- L97-141 主目录
- 30+ 主题
- anchor 链接
- 章节 + 子章节
- 跳转直达

**最佳实践**：大文档必带 TOC——138KB 必备；anchor 链接——GitHub 友好；30+ 主题分层——可定位；"Even More Knowledge"是"杂项"——真实学习路径有"边角料"；TOC 是知识工程的索引。

---

### 模式 5：编程语言附录 + 6 主流语言

**问题场景**：算法练习用什么语言？C/C++/Python/Java/Go/JS/Rust 选哪个？

**解决方案**：`programming-language-resources.md` 113 行——6 主流语言 + 算法书 + 在线课 + IDE。**作者建议 C/C++/Java 入门，但 Python 也能**。
```
C/C++   → K&R + C++ Primer
Python  → 官方教程 + LeetCode
Java    → Effective Java
Go      → The Go Programming Language
JavaScript  → You Don't Know JS
Rust    → The Rust Book
```

**关键参数**：
- 113 行附录
- 6 主流语言
- 书 + 在线课 + IDE
- 难度分级
- 作者亲测

**最佳实践**：学习清单要给"语言选型指南"——避免新手卡在选语言；6 主流语言覆盖 95% 工程师；推荐 C/C++/Java 入门——基础扎实；Python 上手快但底层不够；附录独立文件——可分离。

---

## 第二段：扩展范式

### 模式 6：Big-O 为何放第一课？

**问题场景**：自学 CS 第一课学什么？直接学"算法"还是"复杂度"？

**解决方案**：Big-O 放第一课（L574-597）——所有后续算法/数据结构都用 Big-O 描述。**作者理由：所有面试都问复杂度，不会就跪**。
```
Week 1-2: Big-O
- 时间复杂度 O(1) / O(log n) / O(n) / O(n log n) / O(n^2) / O(2^n)
- 空间复杂度
- 大 O / 大 Ω / 大 Θ
- 摊销分析（amortized）
- 练习：bigocheatsheet.pdf
```

**关键参数**：
- L574-597 Big-O
- 第一课位置
- 时间 + 空间复杂度
- 大 O / Ω / Θ
- 摊销分析

**最佳实践**：第一课放 Big-O——所有后续依赖；复杂度比"算法本身"重要——面试必问；摊销分析高级主题——HashTable 必备；`bigocheatsheet.pdf` 离线速查——复习友好；工程视角 > 数学视角。

---

### 模式 7：数据结构三件套 Array / LinkedList / Hash

**问题场景**：数据结构先学哪个？Tree / Graph 太抽象。

**解决方案**：从"线性三件套"入门——Array（连续内存） / LinkedList（指针） / Hash Table（哈希函数）。**5-7 天掌握基础 + 练习**。
```
Week 3-4: 数据结构基础
- Array（变长数组 / 摊销 O(1) 扩容）
- LinkedList（单链 / 双链 / 循环）
- Stack（栈）
- Queue（队列）
- Hash Table（哈希冲突 / 链地址 / 开放定址）
```

**关键参数**：
- 5 数据结构
- 1-2 周时长
- 数组扩容公式
- 哈希冲突
- 链地址 vs 开放定址

**最佳实践**：数据结构从"线性"入门——避免 Tree/Graph 吓退新手；数组扩容公式——工程细节；哈希冲突两种解法——面试高频；每结构 5-7 天——可消化学完；CLRS 章节+练习配套——理论+实战。

---

### 模式 8：Trees 章节作为"非线性"起点

**问题场景**：非线性数据结构第一课？Graph 太复杂。

**解决方案**：Trees 章节（L765-843）作为"非线性"起点——Binary Tree / BST / Heap / B-Tree / Red-Black Tree。**比 Graph 简单 50% 但足够展现"非线性"思维**。
```
Week 5-6: Trees
- Binary Tree
- Binary Search Tree (BST)
- Heap
- B-Tree
- Red-Black Tree
- Trie（前缀树）
- 遍历：前序 / 中序 / 后序 / 层序
```

**关键参数**：
- L765-843 Trees
- 6+ 树型
- 4 遍历方式
- 1-2 周时长
- 应用场景（数据库 B-Tree / OS 调度 Heap）

**最佳实践**：非线性第一课选 Trees——比 Graph 简单；B-Tree 联系数据库——真实工程；遍历方式 4 种——必须背熟；红黑树高级主题——可放最后；Trie 实用——搜索引擎/自动补全；每个树有"应用场景"——避免空学。

---

### 模式 9：Sorting 章节（10+ 算法对比）

**问题场景**：排序算法 10+ 种，学哪些？快排 / 归并 / 堆排 / 桶排 / 基数排序？

**解决方案**：Sorting 章节（L845-929）系统化对比 10+ 排序——Bubble / Selection / Insertion / Merge / Quick / Heap / Counting / Radix / Bucket。**时间/空间/稳定性三维对比**。
```
排序对比表
- Bubble: O(n^2) / O(1) / 稳定
- Quick: O(n log n) 平均 / O(log n) / 不稳定
- Merge: O(n log n) / O(n) / 稳定
- Heap: O(n log n) / O(1) / 不稳定
- Counting: O(n+k) / O(k) / 稳定
```

**关键参数**：
- L845-929 Sorting
- 10+ 算法
- 时间/空间/稳定
- 对比表
- 应用场景

**最佳实践**：Sorting 系统对比——避免零散学习；三维对比（时间/空间/稳定）——面试必问；Quick/Merge/Heap 必背——面试高频；Counting/Radix 了解——特殊场景；排序是"算法思维"的练习场。

---

### 模式 10：Graphs 章节 + BFS/DFS/Dijkstra

**问题场景**：图算法是面试难点？BFS / DFS / 最短路 / 最小生成树？

**解决方案**：Graphs 章节（L931-992）——图表示（邻接表 / 邻接矩阵） / BFS / DFS / Dijkstra / Bellman-Ford / Kruskal / Prim / 拓扑排序。**4-5 经典算法必背**。
```
Week 7-8: Graphs
- 表示：邻接表 / 邻接矩阵
- 遍历：BFS / DFS
- 最短路：Dijkstra / Bellman-Ford
- 最小生成树：Kruskal / Prim
- 拓扑排序
- 应用：地图导航 / 社交网络 / 任务调度
```

**关键参数**：
- L931-992 Graphs
- 2 表示法
- 4 经典算法
- 4-5 应用场景
- 2-3 周时长

**最佳实践**：Graphs 是面试难点——重点投入；4 经典算法必背——BFS/DFS/Dijkstra/Kruskal；表示法 2 种——空间 vs 时间 trade-off；应用场景——地图/社交/调度；图论是高级算法基础。

---

## 第三段：进阶范式

### 模式 11：Even More Knowledge 杂项 + Recursion

**问题场景**：算法之后学什么？DP 怎么入门？系统设计怎么学？

**解决方案**：`Even More Knowledge` 章节（L994-1099）涵盖 Recursion / DP / OOP / Design Patterns / Networks / 系统设计 / OS 杂项。**真实学习路径有"边角料"**。
```
L994-1099 Even More Knowledge
- Recursion
- Dynamic Programming
- Object-Oriented Programming
- Design Patterns
- Networks (HTTP/TCP/UDP)
- System Design
- Operating Systems
- Databases (SQL/NoSQL)
- Cache
- Security
```

**关键参数**：
- L994-1099 杂项
- 10+ 主题
- 从 Recursion 到 Security
- 真实学习路径
- 1-3 周时长

**最佳实践**：学习清单要"杂项"——真实学习路径不是干净的；Recursion → DP 是渐进——DP 入门难；OOP / Design Patterns 必学——工程基础；Networking / OS 是面试常问——系统基础；`Even More Knowledge` 名字坦诚——不是全部必备。

---

### 模式 12：8 个月时长 + 每天 8-12 小时

**问题场景**：自学 CS 要多久？3 个月速成靠谱吗？

**解决方案**：8 个月时长 + 每天 8-12 小时全职自学（作者 John Washam 亲历）——**全职投入才能完成**。**非全职建议 12-18 个月**。
```
Time Commitment
- 作者: 8 个月 / 每天 8-12 小时
- 入门到 FLAG 面试
- 30+ 主题
- 100+ 算法练习
- 5-10 模拟面试
```

**关键参数**：
- 8 个月全职
- 每天 8-12 小时
- 100+ 算法练习
- 5-10 模拟面试
- 30+ 主题

**最佳实践**：学习清单要给"时间预期"——避免不切实际；全职 vs 业余——路径不同；8 个月是亲历——可信度高；每天 8-12 小时——非兼职可成；模拟面试 5-10 场——面试能力独立训练；时长诚实 = 可执行。

---

### 模式 13：刷题资源（LeetCode / HackerRank / Project Euler）

**问题场景**：算法练习在哪？LeetCode 2000+ 题做哪些？

**解决方案**：CIU 推荐 5 刷题平台——LeetCode（结构化） / HackerRank（语言基础） / Project Euler（数学） / Codility（面试） / InterviewBit（印度式）。**LeetCode Top 100 + LintCode 是核心**。
```
刷题平台
- LeetCode: Top 100 Interview Questions（必做）
- HackerRank: 语言基础
- Project Euler: 数学
- Codility: 面试模拟
- InterviewBit: 系统化
```

**关键参数**：
- 5 刷题平台
- LeetCode Top 100 核心
- 100-300 题目标
- 难度分级
- 分类练习

**最佳实践**：刷题平台多元化——避免单点失败；LeetCode Top 100 必做——面试高频；HackerRank 练语言基础——底层补强；Project Euler 练数学思维——加分项；目标 100-300 题——非越多越好；分类练习 > 随机刷题。

---

### 模式 14：模拟面试 5-10 场 + Pramp

**问题场景**：算法刷够了，面试却挂？表达 + 沟通 = 50% 评分。

**解决方案**：模拟面试 5-10 场——Pramp（免费） / Interviewing.io（付费） / 朋友互相。**真实面试 = 算法 + 表达 + 沟通**。
```
模拟面试
- Pramp: 免费
- Interviewing.io: 付费
- 朋友 mock: 双向
- 5-10 场
- 真实题目 + 真实压力
```

**关键参数**：
- Pramp 免费
- 5-10 场
- 真实题目
- 表达训练
- 双向反馈

**最佳实践**：模拟面试 5-10 场——面试能力独立训练；Pramp 免费起步——降低门槛；真实题目 + 真实压力——才能成长；表达 + 沟通 = 50% 评分——非纯算法；朋友 mock 双向——教也是学；面试是技能非天赋。

---

### 模式 15：系统设计入门 + 4 主题

**问题场景**：senior 岗要"系统设计"——画架构图 + trade-off 分析？

**解决方案**：系统设计 4 主题——Scalability / Sharding / Caching / Load Balancing。**配合 `system-design.pdf` 速查 + Grokking the System Design Interview 课**。
```
系统设计 4 主题
- Scalability（水平扩展 / 垂直扩展）
- Sharding（分库分表）
- Caching（Redis / Memcached）
- Load Balancing（L4 / L7 / DNS）
- 资源: system-design.pdf + Grokking SD
```

**关键参数**：
- 4 主题
- 水平/垂直扩展
- 分库分表
- L4/L7 LB
- system-design.pdf

**最佳实践**：系统设计是 senior 必备——4 主题入门；Grokking SD 课——系统化学习；`system-design.pdf` 速查——面试前 1 周过；画图能力——比口述更清晰；trade-off 分析——比"标准答案"重要。

---

## 第四段：实战范式

### 模式 16：30+ 语言翻译版（cn/tw/ja/ko/de/fr）

**问题场景**：非英语母语者如何读这份清单？翻译质量？

**解决方案**：30+ 语言翻译版 fork——`translations/` 目录下分语言文件夹。**翻译者社区自治 + PR 反哺**。
```
translations/
├── cn/    # 简体中文
├── tw/    # 繁体
├── ja/    # 日文
├── ko/    # 韩文
├── de/    # 德文
├── fr/    # 法文
├── es/    # 西班牙文
└── ... 24+ 语言
```

**关键参数**：
- 30+ 语言
- translations/ 目录
- Fork → 翻译 → PR
- 社区自治
- 网络效应

**最佳实践**：知识库要 30+ 翻译版——网络效应；fork → 翻译 → PR 流水线——降低贡献门槛；社区自治——主仓不被翻译拖死；30+ 语言覆盖 80% 开发者；非翻译者也能贡献——提 issue/纠错。

---

### 模式 17：编程语言资源独立附录

**问题场景**：CIU 主清单是英文，但读者语言不同？附录是单文件还是分文件？

**解决方案**：`programming-language-resources.md` 113 行独立附录——C/C++/Python/Java/Go/JS/Rust 6 主流语言 + 算法资源。**附录独立可维护**。
```
programming-language-resources.md (113 行)
- C
- C++
- Python
- Java
- Go
- JavaScript
- Rust
- 每语言：书 + 课 + IDE
```

**关键参数**：
- 113 行独立附录
- 6 主流语言
- 书 + 课 + IDE
- 独立可维护
- 翻译同步

**最佳实践**：附录独立文件——避免主清单膨胀；6 主流语言覆盖 95%；每语言给"书+课+IDE"——完整学习路径；翻译时附录同步——保持一致；附录是"可选读"——主清单必备。

---

### 模式 18：cheat sheets 离线 PDF（10 个）

**问题场景**：学习时如何快速查"Big-O 表" / "STL" / "Git"？

**解决方案**：`extras/cheat sheets/` 10 个离线 PDF——`bigocheatsheet.pdf` / `bits-cheat-sheet.pdf` / `STL Quick Reference 1.29.pdf` / `git-cheat-sheet-education.pdf` / `system-design.pdf`。**离线可打印**。
```
extras/cheat sheets/
- bigocheatsheet.pdf
- bits-cheat-sheet.pdf
- C Reference Card (ANSI) 2.2.pdf
- Cpp_reference.pdf
- STL Quick Reference 1.29.pdf
- python-cheat-sheet-v1.pdf
- Java Fundamentals Cheatsheet.pdf
- git-cheat-sheet-education.pdf
- Coding Interview Python Language Essentials.pdf
- system-design.pdf
```

**关键参数**：
- 10 个 PDF
- 离线可打印
- Big-O / STL / Git
- 系统设计
- 复习友好

**最佳实践**：学习清单配 PDF 速查——离线友好；10 个 PDF 覆盖核心主题；Big-O / STL / Git 高频速查；系统设计 PDF——senior 必备；`extras/` 目录独立——不污染主清单。

---

### 模式 19：项目方 John Washam 亲历背景

**问题场景**：学习清单作者权威性？"为什么听你的"？

**解决方案**：作者 John Washam 2016 自学 8 个月入职 Amazon 期间整理——**亲历者**。README 顶部写"My plan to go from web developer to software engineer at a large tech company"。**个人故事背书**。
```
About the author:
- 2016: 决定转行
- 2016-2017: 8 个月全职自学 CIU
- 2017: 入职 Amazon
- 2019: CIU 突破 100k stars
- 2024: 持续更新至 2026 版
```

**关键参数**：
- John Washam
- 2016 自学
- 2017 入职 Amazon
- 个人故事背书
- 持续更新

**最佳实践**：学习清单要有"作者背景"——可信度；亲历者 > 教科书——实战派；个人故事——README 顶部"why"；持续更新——多年仍在维护；30+ 主题 + 100k stars——社区验证。

---

### 模式 20：MIT/CC 协议 + 0 商业模式

**问题场景**：学习清单如何许可？商业化？

**解决方案**：MIT/CC-BY-SA-4.0 协议——免费 + 翻译允许 + 衍生允许。**纯开源 + 0 商业模式**。OpenCollective 可赞助作者。
```
License:    MIT + CC-BY-SA-4.0
商业模式:   纯开源 + OpenCollective 赞助
Status:     稳定维护
Stars:      320k+
Forks:      100k+
```

**关键参数**：
- MIT + CC-BY-SA-4.0
- 翻译 + 衍生允许
- OpenCollective 赞助
- 0 商业模式
- 320k stars

**最佳实践**：学习清单用 CC 协议——翻译友好；纯开源 + 0 商业化——专注内容；OpenCollective 赞助——透明；MIT + CC 双协议——内容 + 代码分别许可；项目方长尾价值——多年仍在用。

---

## 关键代码段

```markdown
# README.md:97-141 — Topics of Study
## Topics of Study
- Algorithmic complexity / Big-O
- Data Structures
  - Arrays
  - Linked Lists
  - Stack
  - Queue
  - Hash Table
- Trees
- Sorting
- Graphs
- Even More Knowledge
  - Recursion
  - Dynamic Programming
  - OOP
  - Design Patterns
  - Networks
  - System Design

# L574-597 — Big-O 章节
## Algorithmic complexity / Big-O
- Big-O notation
- Time complexity
- Space complexity
- Big Omega / Big Theta
- Amortized analysis
- 练习: bigocheatsheet.pdf
```

## 必偷 3 件

1. **138KB 单文件 README 而非 docs/**：学习清单优先单文件；TOC 跳转 + 翻译 fork 友好。
2. **难度递进而非代码规模**：Big-O → 线性结构 → 树 → 排序 → 图 → 系统设计；亲历者路径。
3. **30+ 翻译版 + 10 个 PDF 速查**：翻译 fork 是网络效应；PDF 离线可打印；多语言 = 全球读者。

## 必避 3 坑

1. **不要追求"完整"**——CIU 选 30+ 主题，非全部本科课程；"够用"比"完整"重要。
2. **不要省略"时间预期"**——8 个月全职必须诚实告知；非全职 12-18 个月；避免误导。
3. **不要忽视模拟面试**——算法刷够了面试仍挂；表达 + 沟通 = 50% 评分；Pramp 5-10 场必备。
