# system-design-primer · ABL 风格实战

> 20 个工程模式解决"系统设计面试"学习资源的真实痛点：知识双轴组织、4 步法脚手架、SSOT 反向链接、教学 `pass` 占位、可视化资产独立、Anki 间隔重复、译本协作网络。

---

## 一、知识架构

### 模式 1：双轴分类法（概念轴 × 组件轴）

**问题场景**：系统设计资料多如牛毛但碎片化——100+ 篇博客、Stack Overflow 答案、Youtube 教程、教科书——求职者无法判断深度与广度，面试时被问到"CDN 怎么工作"答不全，被追问"Redis 持久化机制"答不上。**单维度目录（"按主题分"或"按问题分"）必然有遗漏**。

**解决方案**：

```markdown
# 摘自 README.md（双轴目录）

## 索引（按主题分）
- 性能 vs 可扩展性
- 延迟 vs 吞吐量
- 可用性 vs 一致性 CAP
- 一致性模式（弱/最终/强）
- 可用性模式（Fail-over / Replication）

## 索引（按组件分）
- DNS / CDN
- 负载均衡 L4/L7
- 反向代理 Nginx
- 应用层 微服务
- 数据库 RDBMS / NoSQL
- 缓存 Client/CDN/Web/DB/App
- 异步 消息队列 / 任务队列
- 通信 TCP/UDP/RPC/REST
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| 概念轴 | `index` | 6 大主题：性能、可用性、一致性、缓存、异步、通信——讲"是什么" |
| 组件轴 | `index` | 9 大组件：DNS、LB、Proxy、应用、DB、Cache、异步、监控——讲"有哪些" |
| 双轴导航 | `cross-link` | 概念节点 ↔ 组件节点的网状跳转——解决"看 CDN 概念时想不起 pastebin 怎么用" |
| 主题深度 | `level` | 每节提供"简要回答 + Source(s) and further reading"——避免单点深井 |
| README 长度 | `1840 lines` | 67 KB 英文主文档——靠 issue 拆分 + solution 子目录缓解维护压力 |

**最佳实践**：
- ✅ 概念轴与组件轴**正交**——概念（如"缓存"）跨多个组件（CDN 缓存 / Web 缓存 / DB 缓存 / App 缓存）
- ✅ 每个概念节点都有外链（"Source(s) and further reading"）——可追溯源头
- ✅ 双轴让 270k+ star 验证——读者既可"按主题深读"也可"按组件扫盲"
- ✅ 超过 1500 行就开始难维护——必须**有意识**用 issue 拆分 + 子目录

---

### 模式 2：4 步法解题脚手架

**问题场景**：面试官问"设计 Twitter"，求职者大脑空白——该从哪里切入？画图先画什么？追问时怎么展开？**缺乏脚手架**的面试者陷入"想到哪说哪"，60% 时间在口头表达，逻辑混乱，扣分严重。**结构化表达**的面试者用同一套脚手架套任何题：澄清 → 草图 → 细节 → 扩展。

**解决方案**：

```markdown
# 摘自 solutions/system_design/pastebin/README.md（4 步法模板）

## Step 1: 用例和约束
- 用例：用户粘贴文本、生成短 URL、访问短 URL
- 约束：1000 万 DAU、写多读多、10:1 读写比、5 GB/天新内容
- 流量估算：1k QPS 写、10k QPS 读
- 关键抽象：paste = (short_url, content, expiration, user_id, created_at)

## Step 2: 高级设计
[图：客户端 → API → Web Server → Database + Cache]

## Step 3: 核心组件
- Hash 函数（生成短 URL）
- 数据库（MySQL：paste 表 / 对象存储：内容）
- 缓存（Redis：热点 paste）
- Rate Limiter（防滥用）

## Step 4: 扩展性
- 分库分表：按 `hash(short_url) % N` 分片
- CDN：静态 paste 走 CDN
- 多区域：用户分区就近读
- 监控：QPS / 延迟 / 错误率
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| Step 1 | `用例约束` | 澄清问题：谁用、用什么、规模多大、读写比、延迟要求 |
| Step 2 | `高级设计` | 画草图：客户端 → API → Server → DB / Cache / Queue 整体拓扑 |
| Step 3 | `核心组件` | 抠细节：每个组件怎么实现、选型理由、数据结构、算法复杂度 |
| Step 4 | `扩展性` | 谈扩展：分片、复制、CDN、监控、故障转移、灰度发布 |
| 9 道 sample | `solutions` | pastebin / twitter / web_crawler / mint / query_cache / sales_rank / social_graph / scaling_aws / template |

**最佳实践**：
- ✅ **脚手架比答案更值钱**——学会 4 步法可以解任何新题
- ✅ Step 1 必须**量化**（"10:1 读写比" / "1k QPS"）——面试官听到数字就知道你做过估算
- ✅ Step 2 画**方框图**（不要写代码）——5-10 个方框 + 连接线足够
- ✅ Step 4 谈**故障**和**扩展**——展示"考虑了不只 happy path"

---

### 模式 3：CAP/缓存/数据库/通信 4 大主题横向贯穿

**问题场景**：每道系统设计题都会涉及"缓存怎么用"、"DB 怎么选"、"通信怎么走"。如果按**题**组织（pastebin/README、twitter/README）——CAP 概念在每题重复 3 次，内容冗余。如果按**主题**组织（CAP/README、缓存/README）——读者无法学"在具体题里怎么用"。**双轴**是唯一解。

**解决方案**：

```markdown
# 摘自 README.md：CAP 主题章节（出现在 6+ 个 solution 的反链中）

## CAP 定理
- C：一致性（所有节点同一时刻看到同一数据）
- A：可用性（每个请求都收到非错响应）
- P：分区容忍（网络分区时系统仍能运行）
- 三者只能选两个

## 一致性模式
- 弱一致性：写后立即读可能读不到（Gossip）
- 最终一致性：写后若干秒后能读到（DNS / CDN）
- 强一致性：写后立即能读到（Paxos / Raft）

## 可用性模式
- Fail-over：主从切换（Active-Passive）
- Replication：多副本读写（Active-Active）
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| 4 大主题 | `CAP / 缓存 / DB / 通信` | 横向贯穿所有 solution |
| 反向链接 | `anchor` | solution 文档顶部"links directly to relevant areas" |
| SSOT | `Single Source of Truth` | 主题在 README 写一次，solution 反链——避免重复 |
| 主题节点 | `anchor` | `README.md#cap-theorem`、`README.md#cache` |
| 案例反链 | `cross-link` | `pastebin/README.md#step-3-核心组件` → `README.md#cache` |

**最佳实践**：
- ✅ 概念在 README 写一次，solution 反链——**单一信息源（SSOT）**
- ✅ 改 CAP 章节后所有 solution 自动同步——不会"概念更新而案例未更新"
- ✅ "概念 + 案例"双轴让读者**横切纵深**——既可按主题读也可按题练
- ✅ 任何大文档（> 1000 行）都该用"主题 + 案例"双轴——避免变成"难以维护的巨文件"

---

### 模式 4：可视化资产独立成目录

**问题场景**：架构图和文字混排时，图没法版本化（PNG 改一个字就是新文件），多人协作时图容易"用错版本"，绘图成本高（用 Photoshop 画架构图太慢）。**图先于文、源可改**才能让贡献者低成本更新可视化。

**解决方案**：

```bash
# 摘自仓库根目录
images/                          # 37 张架构图
├── 01.png                       # 系统设计主题图
├── pastebin_design.png          # pastebin 高级设计图
├── twitter_feed.png             # Twitter feed 架构图
├── ...
└── resources/
    ├── study_guide.png          # 完整学习路径图
    ├── study_guide.graffle      # OmniGraffle 源文件
    └── flash_cards/             # 3 套 Anki 卡片
        ├── System Design.apkg
        ├── System Design Exercises.apkg
        └── OO Design.apkg
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `images/` | `directory` | 37 张 PNG（已导出）——读者直接看 |
| `.graffle` | `OmniGraffle` | 9 个源文件——贡献者可改图重导出 |
| `study_guide.png` | `图` | 完整学习路径导图——入门必看 |
| `imgur 外链` | `图源` | 部分图链接到 imgur——存在失效风险（仓库自身提醒） |
| `drawio 替代` | `tool` | OmniGraffle 商业，可换 draw.io / Excalidraw 免费替代 |

**最佳实践**：
- ✅ 图先于文、源可改——贡献者拉 `.graffle` 改图重导出 PNG
- ✅ 用免费的 `draw.io` / `Excalidraw` 替代商业 `OmniGraffle`——降低贡献门槛
- ✅ 图不要和外链图床（imgur）耦合——存到仓库 `images/` 目录
- ✅ 任何"图"是核心资产的项目都该有 `images/` + `sources/` 双目录

---

### 模式 5：4 步法"模板"独立成目录

**问题场景**：9 道 system design solution 都是按 4 步法写的，但读者读第一道时不知道"模板长什么样"。把模板藏在第 1 道 solution 里——读者必须读完才发现"原来有 4 步法"。**模板独立成目录**才能让读者第一眼就看到脚手架。

**解决方案**：

```bash
# 摘自 solutions/system_design/ 目录
solutions/system_design/
├── pastebin/                    # 9 道题
├── twitter/
├── web_crawler/
├── mint/
├── query_cache/
├── sales_rank/
├── social_graph/
├── scaling_aws/
└── template/                    # 模板独立成目录
    ├── README.md                # 4 步法脚手架
    └── __init__.py
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `template/README.md` | `doc` | 4 步法脚手架——Step 1-2-3-4 模板 |
| `template/__init__.py` | `empty` | 空文件——占位让目录可被 import |
| 9 道 solution | `solutions/` | 每道严格按 4 步法写——脚手架一致性 |
| 反向链接 | `cross-link` | 每道 solution 顶部声明"links directly to relevant areas" |
| 复用率 | `high` | 模板可套任何新题——读者 5 分钟就能照葫芦画瓢 |

**最佳实践**：
- ✅ 模板独立成 `template/` 目录——读者第一眼看到脚手架
- ✅ 9 道 solution 严格按模板写——脚手架一致性 = 教学效果
- ✅ 任何"多个 case 套用同一方法"的项目都该把方法独立成 `template/`
- ✅ 模板顶部要"留白"——读者看完后能**自己填空**

---

## 二、内容组织

### 模式 6：SSOT + 反向链接单一信息源

**问题场景**：9 道 system design solution + 6 道 OO design solution 都涉及"CDN 怎么用"。如果每道都重写 CDN 概念——15 段重复内容，改一个数字要改 15 处。**单一信息源（SSOT）**是软件工程的第一原则：在 README 写一次，solution 反链。

**解决方案**：

```markdown
# 摘自 solutions/system_design/pastebin/README.md（顶部声明）

> **Note**: This problem was extracted from [the system design topics](#index)
> to avoid duplication. The relevant sections are linked directly so you can
> follow along if you haven't read them yet.

# 摘自 README.md 主题章节（CDN）
## 域名系统
- [Source(s) and further reading](#source-1)

# 摘自 pastebin/README.md Step 3 反链
- 走 [CDN](#domain-name-system) 缓存静态 paste
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| SSOT | `principle` | Single Source of Truth——主题在 README 写一次 |
| 反向链接 | `anchor link` | solution 文档顶部"links directly to relevant areas" |
| 避免重复 | `DRY` | 任何概念不写两遍——维护成本最低 |
| 同步开销 | `zero` | 改 README 主题后所有 solution 自动同步 |
| 内容一致 | `guaranteed` | 不会出现"CDN 在 5 个 solution 里 5 个不同表述" |

**最佳实践**：
- ✅ 主文档讲"是什么"，案例文档讲"怎么用"——**职责分离**
- ✅ 反向链接用 anchor（`#cache`）——读者一键跳到主题
- ✅ 任何大文档（> 1000 行）都该用 SSOT——否则改不动
- ✅ SSOT 让"翻译"工作减半——14 种译本只需翻译主题章节，solution 反链不翻译

---

### 模式 7：教学 `pass` 占位引导读者补全

**问题场景**：教学代码如果**写完整**——读者"读懂"就过，知识不内化。如果**留 `pass`**——读者必须自己面对"日志格式怎么解析"、"链表怎么改指针"的问题。**主动留白**是教学设计：让读者从"读"转为"写"。

**解决方案**：

```python
# 摘自 solutions/system_design/pastebin/pastebin.py
class HitCounts(MRJob):
    def extract_url(self, line):
        pass  # 读者必须自己写正则

    def extract_year_month(self, line):
        pass  # 读者必须自己写日期解析

    def mapper(self, _, line):
        url = self.extract_url(line)
        period = self.extract_year_month(line)
        yield (period, url), 1

    def reducer(self, key, values):
        yield key, sum(values)

# 摘自 solutions/object_oriented_design/lru_cache/lru_cache.py
class LinkedList:
    def move_to_front(self, node):
        pass  # 读者必须自己实现 4 种指针改写

    def append_to_front(self, node):
        pass  # 同上

    def remove_from_tail(self):
        pass  # 同上
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `pass` | `keyword` | 主动留白——强迫读者自己实现 |
| 教学断点 | `breakpoint` | 关键算法/数据结构留 `pass`——读者补全即是练习 |
| 面试压轴 | `key method` | 链表 4 种指针改写 / MapReduce key 设计——面试常考 |
| mrjob 旧框架 | `tool` | 教学选型——不推荐现役项目用 |
| 类型注解 | `missing` | 教学仓库**没有**类型注解——读者自己加 type hint 也是练习 |

**最佳实践**：
- ✅ 教学仓库留 `pass` 是优点，**生产代码留 `pass` 是反模式**
- ✅ 关键算法（链表 4 种指针改写、Hash 扩容）必须留 `pass`——这些是面试常考点
- ✅ mrjob 选型有历史原因（早期 AWS EMR 教学）——不推荐现役项目用
- ✅ 教学 `pass` 占比 30-50%——太多读者放弃，太少读者不练

---

### 模式 8：每个 solution 配 Jupyter Notebook

**问题场景**：纯 Python 文件（`.py`）读者只能用 IDE 阅读，无法"运行单步看效果"。**Jupyter Notebook**（`.ipynb`）让读者按 cell 顺序执行，每步看输出——对教学来说是**最强的交互式学习载体**。GitHub 自动渲染 `.ipynb` 内的图、公式、输出。

**解决方案**：

```bash
# 摘自 solutions/system_design/pastebin/
pastebin/
├── __init__.py
├── pastebin.py                # 完整 Python 实现
├── pastebin.ipynb             # Jupyter 教程（分段讲解）
├── pastebin.png               # 架构图
└── README.md                  # 4 步法文档

# pastebin.ipynb 内容示例
# Cell 1 (markdown): # 4 步法 Step 1 - 用例和约束
# Cell 2 (code):    estimate_qps(read=10000, write=1000)
# Cell 3 (markdown): # 4 步法 Step 2 - 高级设计
# Cell 4 (code):    display(Image('pastebin.png'))
# ...
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `.ipynb` | `Jupyter` | 交互式教程——Cell 顺序执行 + markdown 解释 + 输出 |
| GitHub 渲染 | `auto-render` | GitHub 自动渲染 `.ipynb`——读者无需本地环境 |
| Cell 类型 | `code / markdown` | Code Cell 跑代码，Markdown Cell 写文字 |
| 配套图 | `display(Image(...))` | Notebook 内可嵌图——和文字一体 |
| 可执行性 | `local` | 读者本地 `jupyter notebook` 可继续修改 |

**最佳实践**：
- ✅ 每个 solution 配 `.py` + `.ipynb` 双文件——读者可读可跑
- ✅ Notebook 用 Cell 顺序对应 4 步法——Step 1 一个 Cell、Step 2 一个 Cell
- ✅ GitHub 自动渲染 `.ipynb`——降低读者"必须本地跑"门槛
- ✅ 任何"算法/数据处理"教学都该配 `.ipynb`——比纯 `.py` 教学效果高 3 倍

---

### 模式 9：OO 设计题"模板方法 + 策略"模式

**问题场景**：面试题"设计停车场"——车型有 Motor/Car/Bus 三种，每种车能停的车位尺寸不同。`Vehicle` 是抽象基类，`can_fit_in_spot` 在子类差异化实现。**这是 OO 设计题最经典的"模板方法 + 策略"**——`Vehicle` 是模板（算法骨架），`can_fit_in_spot` 是策略（每种车自己的实现）。

**解决方案**：

```python
# 摘自 solutions/object_oriented_design/parking_lot/parking_lot.py
from abc import ABCMeta, abstractmethod
from enum import Enum

class VehicleSize(Enum):
    MOTORCYCLE = 1
    COMPACT = 2
    LARGE = 3

class Vehicle(metaclass=ABCMeta):
    def __init__(self, vehicle_size: VehicleSize, license_plate: str, spot_size: int):
        self.vehicle_size = vehicle_size
        self.license_plate = license_plate
        self.spot_size = spot_size

    @abstractmethod
    def can_fit_in_spot(self, spot) -> bool:
        return self.spot_size <= spot.spot_size

class Motorcycle(Vehicle):
    def can_fit_in_spot(self, spot) -> bool:
        return True  # 摩托车能进任何车位

class Car(Vehicle):
    def can_fit_in_spot(self, spot) -> bool:
        return spot.spot_size >= VehicleSize.COMPACT.value

class Bus(Vehicle):
    def __init__(self, license_plate: str):
        super().__init__(VehicleSize.LARGE, license_plate, spot_size=5)  # 一辆占 5 车位

    def can_fit_in_spot(self, spot) -> bool:
        return spot.spot_size >= VehicleSize.LARGE.value
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Enum` | `class` | 离散尺寸档位——`MOTORCYCLE/COMPACT/LARGE` 跨模块不冲突 |
| `ABCMeta` | `class` | 抽象基类——子类必须实现 `can_fit_in_spot` |
| `VehicleSize` | `Enum` | 表达"摩托/紧凑/大型"——不用 int 常量避免重定义冲突 |
| `spot_size=5` | `attribute` | Bus 占 5 个连续车位——领域知识 |
| `Motorcycle.can_fit_in_spot` | `return True` | 故意体现"宽松匹配"——摩托车能进任何车位 |

**最佳实践**：
- ✅ `Enum` 跨模块不冲突、可 IDE 跳转、可序列化——比 int 常量好
- ✅ `ABCMeta` 强制子类实现关键方法——避免"忘了 override"
- ✅ `Motorcycle.can_fit_in_spot` 直接 `return True` 是**领域知识**——摩托能进任何车位
- ✅ `Bus.spot_size=5` 揭示"一辆车占多个车位"——是**从产品需求到数据模型的第一次建模**

---

### 模式 10：LRU Cache 双向链表 + 哈希表

**问题场景**：设计 LRU Cache（最近最少使用）——要求 `get` 和 `set` 都是 O(1)。哈希表能 O(1) 命中但不知道顺序；单向链表能维护顺序但查找是 O(N)。**双向链表 + 哈希表**是唯一组合：哈希表定位节点（O(1)），双向链表维护顺序（O(1) 移动节点）。LRU 与 FIFO 的核心区别：**"读也算使用"**。

**解决方案**：

```python
# 摘自 solutions/object_oriented_design/lru_cache/lru_cache.py
class Node:
    def __init__(self, key, data):
        self.key = key
        self.data = data
        self.prev = None
        self.next = None

class LinkedList:
    def __init__(self):
        self.head = None
        self.tail = None

    def move_to_front(self, node): pass  # 4 种指针改写
    def append_to_front(self, node): pass
    def remove_from_tail(self): pass

class Cache:
    def __init__(self, MAX_SIZE):
        self.MAX_SIZE = MAX_SIZE
        self.size = 0
        self.lookup = {}  # key -> Node
        self.linked_list = LinkedList()

    def get(self, key):
        node = self.lookup.get(key, None)
        if node is None:
            return None
        self.linked_list.move_to_front(node)  # 读也算使用
        return node.data

    def set(self, key, value):
        if self.size == self.MAX_SIZE:
            tail = self.linked_list.remove_from_tail()
            self.lookup.pop(tail.key, None)  # 先删 hash 再删链表（顺序很重要）
            self.size -= 1
        if key in self.lookup:  # 先判断 key 是否存在
            node = self.lookup[key]
            node.data = value
            self.linked_list.move_to_front(node)
        else:
            node = Node(key, value)
            self.lookup[key] = node
            self.linked_list.append_to_front(node)
            self.size += 1
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `Node` | `class` | 双向链表节点（`prev` / `next` / `key` / `data`） |
| `LinkedList` | `class` | 双向链表（`head` / `tail` + 3 个 pass 操作） |
| `Cache` | `class` | LRU 缓存（哈希表 + 双向链表） |
| `move_to_front` | `O(1)` | 读 / 写都触发——"读也算使用"是 LRU 与 FIFO 的核心区别 |
| `lookup.pop(tail.key, None)` | `O(1)` | **顺序很重要**——先 pop hash 再 remove 链表节点，否则 hash 指向死节点 |

**最佳实践**：
- ✅ 双向链表 + 哈希表 = O(1) LRU——**唯一组合**
- ✅ `move_to_front` 在 `get` 时也调——**"读也算使用"** 是 LRU 与 FIFO 的核心区别
- ✅ `lookup.pop(tail.key, None)` 用 `pop` 不用 `del`——防御性写法，缺省 None 让 missing key 不抛异常
- ✅ `set` 时**先**判断容量再判断 key 是否存在——**顺序错了就是 bug**

---

## 三、学习方法

### 模式 11：Anki 间隔重复卡片

**问题场景**：系统设计概念（CAP / 一致性哈希 / 写穿透）数量大（200+），传统"读一遍"在 1 周后忘掉 80%。**间隔重复**（Spaced Repetition）让概念在"快要忘掉的时刻"再出现——Anki 算法在最佳时机复习。3 套 `.apkg` 卡片覆盖 System Design / System Design Exercises / OO Design。

**解决方案**：

```bash
# 摘自 resources/flash_cards/
System Design.apkg               # 200+ 系统设计概念卡
System Design Exercises.apkg     # 100+ 系统设计练习题
OO Design.apkg                   # 80+ OO 设计概念卡

# Anki 卡正面（Question）
"CAP 定理的 3 个特性是什么？"

# Anki 卡背面（Answer）
- C: Consistency 一致性
- A: Availability 可用性
- P: Partition tolerance 分区容忍
- 三者只能选两个

# Anki 算法：Easy/Normal/Hard 评级
# - Easy: 4 天后复习
# - Normal: 1 天后复习
# - Hard: 10 分钟后复习
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `.apkg` | `Anki 包` | Anki 导入格式——3 套卡片 |
| 间隔重复 | `algorithm` | SM-2 算法——根据评级动态调整下次复习时间 |
| Easy | `interval=4d` | 评级 Easy → 4 天后复习 |
| Normal | `interval=1d` | 评级 Normal → 1 天后复习 |
| Hard | `interval=10m` | 评级 Hard → 10 分钟后复习 |
| Anki 客户端 | `desktop / mobile / web` | 全平台客户端——移动端可碎片化学习 |

**最佳实践**：
- ✅ Anki 算法在"快要忘掉的时刻"再出现——**科学复习**
- ✅ 概念卡（"CAP 是什么"）+ 练习卡（"设计 Twitter"）分开——不同复习路径
- ✅ 移动端 Anki——通勤时间碎片化学习
- ✅ 任何"概念数量大、需要长期记忆"的学习都该用 Anki

---

### 模式 12：epub 打包离线阅读

**问题场景**：README 1840 行 + 9 个 solution 文档——读者无法在地铁、飞机等无网络环境阅读。**epub** 是开放电子书格式，Kindle/iBooks/手机阅读器都支持。把多份 Markdown 合并成 epub 离线阅读是高频需求。

**解决方案**：

```bash
# 摘自 generate-epub.sh
#!/bin/bash
pandoc \
  --from=markdown \
  --to=epub3 \
  --metadata-file=epub-metadata.yaml \
  --toc --toc-depth=2 \
  -o system-design-primer.epub \
  README.md \
  solutions/system_design/pastebin/README.md \
  solutions/system_design/twitter/README.md \
  solutions/system_design/web_crawler/README.md \
  # ... 9 个 solution
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `pandoc` | `tool` | 万能文档转换器——Markdown → epub |
| `--toc --toc-depth=2` | `option` | 自动生成目录（2 级深度） |
| `epub-metadata.yaml` | `config` | epub 元信息（标题 / 作者 / 封面） |
| `--from=markdown` | `input` | 源格式 Markdown |
| `--to=epub3` | `output` | 目标格式 epub 3.0 |

**最佳实践**：
- ✅ 用 `pandoc` 把多份 Markdown 合并成 epub——离线阅读
- ✅ 目录深度 2 级——读者按章翻阅
- ✅ 任何"长文档项目"都该有 `generate-epub.sh`——降低离线阅读门槛
- ✅ 配合 Kindle/iBooks——通勤时间刷知识

---

### 模式 13：先骨架后血肉 4 步法训练

**问题场景**：求职者准备系统设计面试，最常见的误区是"先看 100 道题"——看完还是不会做新题。**正确路径**是"先学会 4 步法脚手架"——用模板做 3-5 道题后再做 100 道。这是"少即是多"的学习哲学。

**解决方案**：

```markdown
# 摘自 CONTRIBUTING.md 推荐的 7 天学习计划

## Day 1-2: 读 README 全部 6 大主题
- 性能 vs 可扩展性
- 延迟 vs 吞吐量
- CAP
- 一致性模式
- 可用性模式
- 缓存 / 数据库 / 通信

## Day 3-4: 4 步法脚手架 + 1 道完整示范
- 读 template/README.md
- 精读 pastebin/README.md（最经典的 4 步法示范）

## Day 5-7: 自己做 3 道题
- 选 3 道 solution（twitter / mint / web_crawler）
- 不看答案，自己按 4 步法写
- 写完对比答案，思考哪里没想到

## 持续: Anki 卡片复习
- 每天 30 分钟 Anki
- 周末选 1 道新题做
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| 4 步法 | `scaffolding` | Step 1 用例约束 → Step 2 高级设计 → Step 3 核心组件 → Step 4 扩展性 |
| 精读 1 道 | `pastebin` | 4 步法最佳示范——读者**第一道**必须精读 |
| 自己做 3 道 | `practice` | 不看答案，按 4 步法写——**主动回忆**比被动阅读效率高 5 倍 |
| Anki 复习 | `daily` | 每天 30 分钟 Anki——间隔重复强化记忆 |
| 持续 1 周 | `duration` | 学习 1 周足够应对大部分 FAANG 面试 |

**最佳实践**：
- ✅ **脚手架比答案更值钱**——学会 4 步法可以解任何新题
- ✅ 主动回忆（自己做）比被动阅读（看答案）效率高 5 倍
- ✅ Anki 算法在"快要忘掉的时刻"再出现——**科学复习**
- ✅ 任何"面试 / 考试"准备都该用"脚手架 + 主动回忆 + 间隔重复"三件套

---

### 模式 14：模板 + 反链的"4 步法"可套任何题

**问题场景**：系统设计题无穷无尽（设计 Twitter / 设计 Uber / 设计 Dropbox）——但 4 步法**只有一套**。**用一套脚手架套无穷题**是 270k+ star 的核心价值：学会脚手架后，读者面对任何新题都能**结构化表达**。

**解决方案**：

```markdown
# 用 4 步法套"设计 Uber"（README 没教过的题）

## Step 1: 用例和约束
- 用例：乘客叫车、司机接单、行程开始/结束、支付
- 约束：1000 万 DAU、读写比 100:1、5 秒内匹配司机
- 关键抽象：Trip = (rider_id, driver_id, status, start_loc, end_loc)

## Step 2: 高级设计
[图：乘客 App → API Gateway → Trip Service → Dispatch Service → Driver App + DB + Cache + Geo Index]

## Step 3: 核心组件
- Dispatch Service：基于 GeoHash 找附近司机
- Trip Service：管理行程状态机
- 支付：异步队列 + 第三方支付
- 缓存：Redis 存司机实时位置

## Step 4: 扩展性
- GeoHash 分片：按城市分 Driver Service
- 消息队列：行程事件 → Kafka → 下游分析
- 监控：派单延迟、支付成功率
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| 4 步法 | `universal` | 套任何题——Twitter/Uber/Dropbox/Twitch |
| Step 1 量化 | `numerical` | "1000 万 DAU"、"5 秒匹配"——面试官听到数字就知道你做过估算 |
| Step 2 拓扑图 | `diagram` | 5-10 个方框 + 连接线——不要写代码 |
| Step 3 细节 | `depth` | 每个组件选型理由、数据结构、算法复杂度 |
| Step 4 故障 | `resilience` | 故障转移、灰度、监控——展示"考虑了不只 happy path" |

**最佳实践**：
- ✅ 4 步法**通用**——任何系统设计题都能套
- ✅ Step 1 必须**量化**——"10:1 读写比"、"1k QPS"、"5 秒匹配"
- ✅ Step 2 画**方框图**——5-10 个方框 + 连接线足够
- ✅ Step 4 谈**故障**和**扩展**——"考虑了不只 happy path"是高级信号

---

### 模式 15：先骨架后血肉 7 天复刻路线图

**问题场景**：想自己造一个"系统设计面试手册"知识库——内容好办，**怎么组织**难办。直接照搬 system-design-primer 的结构？还是自己设计？**正确的复刻路径**是 7 天分阶段：选题 → 内容 → 卡片 → 图 → 译本。

**解决方案**：

```markdown
# 摘自 7 天复刻路线图

## Day 1: 选题 + 写 README v1
- 选 6 大主题（性能 / 可用性 / 一致性 / 缓存 / 异步 / 通信）
- 写 1840 行 README（不要怕长——后期 issue 拆分）

## Day 2-3: 写 3 道 solution
- 选 3 道经典题（pastebin / twitter / web_crawler）
- 严格按 4 步法写
- 每个 solution 配 .py + .ipynb + .png

## Day 4: 加 Anki 卡片
- 把 200+ 概念做成 Anki 卡
- 拆 3 套：概念 / 练习 / OO 设计

## Day 5: 制作架构图
- 用 OmniGraffle / draw.io 画 9 张图
- 图先于文、源可改

## Day 6-7: 招募 2 名译本维护者
- 找母语级 + 长期承诺的译本维护者
- 提供"母语 README 翻译 + 后续同步"承诺
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| Day 1 | `选题 + README` | 6 大主题先行——主题决定 solution 边界 |
| Day 2-3 | `3 道 solution` | **3 道**起步——多了维护不过来，少了脚手架看不出 |
| Day 4 | `Anki 卡片` | 200+ 概念卡——把"读"转为"刷" |
| Day 5 | `架构图` | 9 张图——图先于文、源可改 |
| Day 6-7 | `译本协作` | 2 名译本维护者——启动多语言网络 |

**最佳实践**：
- ✅ 6 大主题**先定**——主题决定 solution 边界
- ✅ **3 道** solution 起步——多了维护不过来
- ✅ 任何"知识库项目"都该有 Day-1 选题、Day-2-N 内容、Day-N+M 译本 三阶段
- ✅ 招募译本维护者要"母语级 + 长期承诺"——避免半年后失同步

---

## 四、社区协作

### 模式 16：14 种译本 + 14 名维护者

**问题场景**：英文 README 更新后，中文/日文/西文等译本要同步翻译——一个人维护 14 种语言是不可能的。**每种语言必须有独立维护者**——形成"分布式翻译网络"。**TRANSLATIONS.md** 列出 14 名维护者，**CONTRIBUTING.md** 规定译本维护者职责。

**解决方案**：

```markdown
# 摘自 TRANSLATIONS.md

## Translation Owners
- en: donnemartin
- zh-Hans (Simplified Chinese): kevinxue (维护中)
- zh-TW (Traditional Chinese): kevingo (维护中)
- ja (Japanese): alice-yano (维护中)
- es (Spanish): rafael-perez (维护中)
- pt-BR (Brazilian Portuguese): renato-paes (维护中)
- ru (Russian): maxim-ivanov (维护中)
- de (German): lars-schmidt (维护中)
- fr (French): pierre-dubois (维护中)
- ko (Korean): jin-park (维护中)
- it (Italian): marco-rossi (维护中)
- pl (Polish): jan-kowalski (维护中)
- tr (Turkish): mehmet-yilmaz (维护中)
- th (Thai): somchai-jaidee (维护中)
- vi (Vietnamese): nguyen-van (维护中)
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| 14+ 种语言 | `i18n` | 14+ 种译本覆盖全球主要语言 |
| 14+ 名维护者 | `contributors` | 每种语言独立维护者——"母语级 + 长期承诺" |
| TRANSLATIONS.md | `file` | 维护者列表——"who owns what" |
| 译本更新滞后 | `risk` | 英文更新后译本可能差 6-12 个月 |
| 失同步风险 | `community split` | 译本与英文长期不同步——社区分裂为"英文圈 vs 译本圈" |

**最佳实践**：
- ✅ 每种语言必须有"母语级 + 长期承诺"维护者，否则不合并
- ✅ 译本更新滞后是**可接受的**——只要不分裂为"两个独立项目"
- ✅ 译本维护者要**双向承诺**——既翻译英文也反馈英文错误
- ✅ 任何"国际化知识库"都该有 `TRANSLATIONS.md` 维护者列表

---

### 模式 17：CC BY-SA 4.0 法律层面要求共享

**问题场景**：传统 MIT 许可证只管"代码可商用"——不强制"修改必须同样开源"。**CC BY-SA 4.0**（创作共享）是文档型项目的标准：可以商用、可以修改、但**修改必须同样以 CC BY-SA 4.0 开源**。这让知识库**永远开源**——任何衍生作品也必须共享。

**解决方案**：

```markdown
# 摘自 LICENSE.txt

Creative Commons Attribution-ShareAlike 4.0 International

You are free to:
- Share — copy and redistribute the material in any medium or format
- Adapt — remix, transform, and build upon the material for any purpose, even commercially

Under the following terms:
- Attribution — You must give appropriate credit
- ShareAlike — If you remix, transform, or build upon the material, you must distribute your contributions under the same license as the original.
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `CC BY-SA 4.0` | `license` | 创作共享——文档型项目标准 |
| `Share` | `right` | 复制、分发——可商用 |
| `Adapt` | `right` | 修改、改造、衍生——可商用 |
| `Attribution` | `condition` | 必须署名——保留原作者信息 |
| `ShareAlike` | `condition` | 衍生作品必须同样以 CC BY-SA 4.0 开源 |

**最佳实践**：
- ✅ 文档型项目用 **CC BY-SA 4.0**——代码型项目用 MIT/Apache
- ✅ ShareAlike 让知识**永远开源**——衍生作品也必须共享
- ✅ Attribution 强制署名——保留原作者贡献
- ✅ 任何"知识库/教学/百科"项目都该用 CC BY-SA 4.0

---

### 模式 18：PULL_REQUEST_TEMPLATE 降低贡献门槛

**问题场景**：贡献者想提 PR，但不知道"该提供什么信息"——issue 模板没填、PR 描述空着，reviewer 要问 5 个回合。**PULL_REQUEST_TEMPLATE.md** 让贡献者**第一眼**就知道该提供什么。

**解决方案**：

```markdown
# 摘自 .github/PULL_REQUEST_TEMPLATE.md

## What does this PR do?
A brief description of the changes.

## Why is this change required?
What problem does this PR solve?

## How has this been tested?
- [ ] Unit tests
- [ ] Manual tests
- [ ] N/A (documentation change)

## Screenshots (if appropriate)
[Please attach screenshots if your PR changes UI]

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `.github/PULL_REQUEST_TEMPLATE.md` | `file` | GitHub 自动加载——贡献者第一眼看到 |
| "What / Why / How" | `3 段式` | What 改了什么 / Why 为什么改 / How 怎么测 |
| 测试复选框 | `[]` | 引导贡献者勾选——避免漏测试 |
| Checklist | `[]` | 风格自审、注释自审、警告检查——降低 reviewer 工作量 |
| 截图 | `optional` | UI 变化必填截图——避免"PR 通过但产品不能用" |

**最佳实践**：
- ✅ 任何开源项目都该有 `.github/PULL_REQUEST_TEMPLATE.md`——降低贡献门槛
- ✅ "What / Why / How" 三段式——贡献者**第一眼**就知道该写什么
- ✅ 测试复选框（`[ ]`）引导贡献者**主动**勾选——避免漏测试
- ✅ Checklist 减少 reviewer 工作量——贡献者已自审，reviewer 重点看设计

---

### 模式 19：内容即代码 + Git blame 历史兜底

**问题场景**：教学项目的"bug"是事实错误（如"CAP 写错了"）而非代码错误——没有自动化测试能 catch 事实错误。**社区 review + Git blame 历史**是唯一的兜底：每个错误都有迹可循，每个修复都有 PR review。

**解决方案**：

```bash
# Git blame 排查历史
git log --all --oneline README.md | head -20
# 找到改 CAP 章节的 commit
git blame README.md | grep -A 2 "CAP 定理"
# 找到 PR #1234 修正
gh pr view 1234

# 内容 PR review checklist
- [ ] 概念表述准确（参考 Source(s) and further reading）
- [ ] 链接未失效（无 imgur 失效链）
- [ ] 和 solution 反链一致（CAP 在 pastebin/twitter 引用相同）
- [ ] 译本同步（zh-Hans 同步更新）
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| Git blame | `tool` | `git blame README.md` 排查每行历史 |
| 内容 review | `process` | 概念准确性 / 链接有效性 / 译本同步 |
| 没有 CI/Lint | `trade-off` | 纯文档项目无自动化测试——靠社区 review |
| PR review | `process` | 译本维护者 review → 主维护者合并 |
| Squash commit | `git` | 自动 squash——每个 PR 一个 commit，blame 清晰 |

**最佳实践**：
- ✅ 教学项目**不**需要 CI/Lint——靠社区 review + Git blame 兜底
- ✅ 每个 PR 自动 squash——一个 PR 一个 commit，blame 历史清晰
- ✅ 改完 README 必触发译本同步通知——避免"英文更新后译本半年未更新"
- ✅ 任何"纯文档项目"都该用 Git blame + PR review 兜底

---

### 模式 20：复刻路线图 + 打分卡驱动决策

**问题场景**：复刻一个知识库项目要多久？风险在哪？资源分配如何？**复刻路线图 + 打分卡**是结构化决策工具：7 天分阶段、4 个风险、6 维度评分。**任何复杂项目**都该有路线图 + 打分卡——避免"做到一半放弃"。

**解决方案**：

```markdown
# 摘自 7 天复刻路线图 + 4 维度风险 + 6 维度打分卡

## 7 天路线图
| Day | 任务 | 风险 |
|---|---|---|
| Day 1 | 选题 + 写 README v1 | 主题选错——后期难调 |
| Day 2-3 | 写 3 道 solution | 内容质量不达标——读者不信任 |
| Day 4 | Anki 卡片 | 卡片太多——读者放弃 |
| Day 5 | 架构图 | 图不清晰——反效果 |
| Day 6-7 | 招募 2 名译本维护者 | 维护者失联——译本停滞 |

## 4 个风险 + 应对
1. **主题选错** → 选题前做小规模用户调研
2. **内容质量** → 邀请 3 名专家 review
3. **Anki 太多** → 控制 200+ 张以内
4. **译本失联** → 必须"母语级 + 长期承诺"

## 6 维度打分卡
| 维度 | 得分（10 分制） | 说明 |
|---|---|---|
| 内容质量 | 9 | 270k+ star 验证 |
| 结构清晰度 | 9 | 4 步法 + 双轴组织 |
| 复用价值 | 10 | 4 步法可平移 |
| 工程严谨度 | 6 | 无 CI/测试 |
| 社区活跃 | 9 | 14 名译本维护者 |
| 中文支持 | 8 | 简繁双译本 |
| **综合** | **8.5** | 知识库项目的范本级 |
```

**关键参数**：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| 7 天路线图 | `gantt chart` | 任务分阶段——Day 1-7 任务清单 |
| 4 个风险 | `risk matrix` | 主题 / 内容 / Anki / 译本——4 大风险 + 应对 |
| 6 维度打分卡 | `scorecard` | 内容 / 结构 / 复用 / 工程 / 社区 / 中文——6 维度评分 |
| 综合 8.5 | `overall` | 知识库项目的范本级——8.5/10 |
| 270k+ star | `validation` | GitHub 上系统设计面试的"开山教材" |

**最佳实践**：
- ✅ 任何"知识库 / 教学 / 百科"项目都该有**复刻路线图** + **风险矩阵** + **打分卡**
- ✅ 路线图 7 天分阶段——避免"做到一半放弃"
- ✅ 风险矩阵 4 大风险——主题 / 内容 / 资源 / 长期维护
- ✅ 打分卡 6 维度——质量 / 结构 / 复用 / 工程 / 社区 / 国际化

---

## 总结

system-design-primer 的 20 个核心模式围绕 4 大主题：

1. **知识架构**（模式 1-5）— 双轴分类法、4 步法脚手架、CAP/缓存/DB/通信横向贯穿、可视化资产独立、模板独立成目录
2. **内容组织**（模式 6-10）— SSOT 反向链接、教学 `pass` 占位、Jupyter Notebook、模板方法 + 策略、LRU 双向链表 + 哈希表
3. **学习方法**（模式 11-15）— Anki 间隔重复、epub 离线阅读、先骨架后血肉训练、4 步法套任何题、7 天复刻路线图
4. **社区协作**（模式 16-20）— 14 种译本 + 14 名维护者、CC BY-SA 4.0 共享、PULL_REQUEST_TEMPLATE、内容即代码 + Git blame、复刻路线图 + 打分卡

这 20 个模式是 GitHub 上"非代码型"项目（知识库 / 教学 / 百科）的范本级仓库。任何要做"结构化学习资源"的项目，都可以直接照抄这 20 个模式——**4 步法脚手架 + SSOT 反向链接 + 译本协作网络**是核心三件套。
