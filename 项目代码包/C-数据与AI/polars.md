# Polars

## 一、前言

Polars 是 Rust 内核的超高性能 DataFrame 库，2020 年由 Ritchie Vink 创立，灵感来自 Apache Arrow 内存格式、内存列式设计与 Rust 的零成本抽象。它作为 Python 库（PyO3 绑定）和 Rust 库（同名 crate `polars`）双形态分发，目标是提供比 Pandas 快 5-30 倍的数据处理速度，同时保持 Pythonic 的链式 API。截至 2025 年，Polars GitHub 3 万+ Star、PyPI 月下载量超过 5000 万次，成为 Pandas 性能瓶颈场景的首选替代品，被 Hugging Face、Polygon.io、b2bwave、Bain & Company、阿里、快手、字节等公司广泛采用。

Polars 的核心价值在于"Rust 内核 + 内存列式 + 惰性查询优化 + 多线程并行"。① Rust 内核——所有计算密集型操作在 Rust 中执行，零 GIL、零 GC、内存安全、SIMD 自动向量化；② 内存列式（Apache Arrow）——所有数据以 Arrow 列式格式存储，连续内存、零拷贝跨语言、CPU 缓存友好；③ 惰性查询优化器——`pl.LazyFrame` 构建逻辑查询计划，Query Optimizer 自动做 predicate pushdown、projection pushdown、slice pushdown、join 优化，比手写代码快 10x；④ 多线程并行——基于 Rayon 库自动用满所有 CPU 核，单机性能等同 Dask 多机；⑤ 流式处理——支持 out-of-core 处理大于内存的数据（`pl.scan_*` + `sink_*`）。

Polars 的关键能力包括：① Series / DataFrame / LazyFrame 三层 API；② IO 高速：CSV/Parquet/JSON/Excel/IPC/Avro/Delta/数据库/Cloud Storage；③ 表达式 API（Expression API）：`pl.col("a").filter(...).sum()`；④ 窗口函数（Window Functions）：`pl.col("a").rolling_mean(7).over("user")`；⑤ 字符串访问器（`.str.*`）：100+ 字符串函数；⑥ 时间序列（`.dt.*`）：时区、滚动、重采样；⑦ Lazy 模式与 Query Optimizer；⑧ 多核并行 + SIMD；⑨ 内存高效（categorical/duration/decimal 等丰富类型）；⑩ 与 Arrow/Pandas/Numpy/CSV/Parquet 互转。

Polars 与其他 DataFrame 库对比：

| 库 | 内核 | 性能 | 分布式 | 学习曲线 |
|------|------|------|--------|----------|
| Polars | Rust | 5-30x Pandas | 弱（单机为主）+ Polars Cloud | 中等（Expression API 需适应） |
| Pandas | C/Python | 1x 基准 | 弱（需 Modin/Dask） | 低（最熟悉） |
| Dask DataFrame | Python | 1-3x Pandas | 强（多机集群） | 中等（API 类似 Pandas） |
| cuDF | C++/CUDA | 10-100x Pandas | 弱（单 GPU） | 中等（API 类似 Pandas） |
| Vaex | C++ | 3-10x Pandas | 弱 | 低（API 类似 Pandas） |
| DuckDB | C++（OLAP） | 5-20x Pandas | 弱（单节点嵌入） | 低（SQL 风格） |
| Spark DataFrame | JVM/Scala | 比 Pandas 慢（Python 端） | 强（多机） | 高（理解 Spark 模型） |
| Modin | Dask/Ray | 1-5x Pandas | 中等 | 极低（drop-in 替换） |

Polars 的核心应用场景：① GB 级数据分析（Pandas 跑 30s 的 groupby，Polars 1-3s）；② ETL 流水线（CSV → 清洗 → Parquet 流水线）；③ 时序金融数据处理（tick 数据、k 线、滚动指标）；④ 数据科学 EDA（10x 加速交互式探索）；⑤ 中等规模 ML 特征工程（`to_dummies` / `pipe` / 配合 sklearn）；⑥ 报表 / 仪表盘（`group_by().agg()` 高效聚合）；⑦ 单机替代 Spark（DuckDB/Polars 让"小数据用本地引擎"成为新范式）；⑧ 数据校验（`schema` 严格、错误信息友好）。

Polars 5 大核心特性：① Rust 内核 + Apache Arrow 内存布局（5-30x Pandas 性能）；② 表达式 API（`pl.col().over().rolling()` 链式组合，类 SQL 语义）；③ Lazy 模式 + 查询优化器（Predicate/Projection/Slice Pushdown）；④ 多核并行 + SIMD（基于 Rayon + Arrow-Compiler）；⑤ Apache Arrow 零拷贝跨语言（PySpark/DuckDB/R 互通）。

## 二、架构思维导图

```mermaid
mindmap
  root((Polars))
    核心结构
      Series
        一列数据
        强类型
        dtype
      DataFrame
        表格
        eager 模式
      LazyFrame
        惰性查询
        Query Optimizer
      Schema
        字段类型
        严格校验
    表达式 API
      pl.col
        选择列
      算子
        filter select
        with_columns
        group_by
        sort
      聚合
        sum mean
        median std
        first last
        n_unique
      窗口
        over
        rolling
        group_by_dynamic
      字符串
        str.contains
        str.replace
        str.extract
      时间
        dt.year month
        dt.round
        dt.truncate
        dt.timezone
      列表
        list
        list.eval
        list.gather
      结构体
        struct
        struct.field
    模式
      Eager
        立即执行
        立即返回
      Lazy
        惰性构建
        优化
        collect
    Query Optimizer
      Predicate Pushdown
        filter 下推
        IO 阶段执行
      Projection Pushdown
        select 下推
        仅读必要列
      Slice Pushdown
        limit 下推
      Constant Folding
        常量合并
      简化
        算子简化
        表达式合并
      Join 优化
        hash join
        sort merge
    内存
      Apache Arrow
        列式布局
        连续内存
        SIMD
        零拷贝
      ChunkedArray
        多块列
      缓冲池
        Arrow Buffer
      零拷贝
        Arrow
        Python
    类型
      Numeric
        Int8 Int16
        Int32 Int64
        UInt8 UInt64
        Float32 Float64
      时间
        Date Time
        Datetime Duration
      文本
        Utf8 String
        Categorical
      嵌套
        List
        Array
        Struct
      缺失
        null
        NaN
    IO
      CSV
        scan_csv
        sink_csv
      Parquet
        scan_parquet
        sink_parquet
        compression
      JSON
        read_json
        ndjson
      IPC Feather
        zero copy
        Polars 内部格式
      Excel
        read_excel
      数据库
        pl.read_database
        SQLAlchemy
      云存储
        S3 GCS Azure
        scan_parquet s3
      Delta Lake
        scan_delta
        sink_delta
    并行
      多线程
        Rayon
        CPU 核
      SIMD
        AVX2 AVX512
        自动向量化
      流式
        out-of-core
        sink 写盘
    性能
      编译
        release 模式
        LTO
      内存
        categorical
        减少字符串复制
      流式
        scan + sink
        不装内存
    生态集成
      Pandas
        from_pandas
        to_pandas
      NumPy
        from_numpy
        to_numpy
      PyArrow
        from_arrow
        to_arrow
      DuckDB
        SQL 互转
      PySpark
        Polars on Spark
        桥接
      Hugging Face
        datasets
      Great Expectations
        数据验证
    生态
      polars-cloud
        分布式
      ConnectorX
        数据库加速
      plotly
        集成
      Altair
        Vega-Lite
    实战
      EDA
        describe
        group_by
        sort describe
      ETL
        read transform
        write
      特征工程
        with_columns
        to_dummies
        scaling
      时序
        rolling mean
        group_by_dynamic
        asof join
      报表
        pivot
        group_by agg
        to_dict
```

## 三、关键代码

### 3.1 Eager 模式：DataFrame 基础

```python
# 文件：polars/dataframe/frame.py
import polars as pl
import numpy as np
import pandas as pd

# ──────── 创建 DataFrame ────────
df = pl.DataFrame({
    "name":   ["Alice", "Bob", "Charlie", "Diana", "Eve"],
    "age":    [25, 30, 35, 28, 22],
    "salary": [70000, 85000, 95000, 72000, 58000],
    "city":   ["NY", "SF", "LA", "NY", "SF"],
    "join_date": ["2020-01-15", "2019-06-20", "2021-03-10", "2022-11-05", "2018-09-12"],
})

# 从 NumPy / Pandas 转换
pdf = pd.DataFrame({"a": [1, 2, 3], "b": [4, 5, 6]})
df = pl.from_pandas(pdf)
arr = np.random.rand(100, 4)
df = pl.from_numpy(arr, schema=["a", "b", "c", "d"])

# Schema 严格校验
print(df.schema)
# Schema([('name', String), ('age', Int64), ...])

# ──────── 基础操作 ────────
print(df.head(3))                                   # 前 3 行
print(df.describe())                                # 统计概览
print(df.shape, df.height, df.width)                # 形状
print(df.columns, df.dtypes)                        # 列名 / 类型
print(df.null_count())                              # 各列缺失值

# ──────── 选择列 ────────
print(df.select(["name", "age"]))                   # 多列
print(df.select(pl.col("name"), pl.col("age")))     # 表达式形式
print(df.select(pl.col("age") * 2))                 # 计算列
print(df.select(pl.col("^.*_date$")))               # 正则匹配列名

# ──────── 过滤 ────────
print(df.filter(pl.col("age") > 25))
print(df.filter((pl.col("age") > 25) & (pl.col("city") == "NY")))
print(df.filter(pl.col("name").is_in(["Alice", "Bob"])))

# ──────── 增加 / 修改列 ────────
df2 = df.with_columns(
    (pl.col("salary") / 12).alias("monthly_salary"),  # 派生列
    pl.col("name").str.to_uppercase().alias("name_upper"),
    pl.lit("US").alias("country"),                     # 常量列
)
# 多列同时
df3 = df.with_columns(
    pl.col("age").cast(pl.Float32),                    # 类型转换
    pl.col("salary").rank().alias("salary_rank"),
    pl.col("name").str.len_bytes().alias("name_len"),
)
```

### 3.2 Group By + 聚合 + 窗口函数

```python
# 文件：polars/lazyframe/group_by.py
import polars as pl
import numpy as np

orders = pl.DataFrame({
    "order_id": range(1, 11),
    "user_id":  [1, 2, 1, 3, 2, 3, 1, 2, 3, 1],
    "category": ["A", "B", "A", "A", "B", "C", "C", "A", "B", "A"],
    "amount":   [10, 20, 15, 30, 25, 50, 12, 18, 22, 35],
    "status":   ["paid", "paid", "refund", "paid", "paid",
                 "paid", "refund", "paid", "paid", "paid"],
    "ts": pl.datetime_range(
        start=pl.datetime(2024, 1, 1),
        end=pl.datetime(2024, 1, 10),
        interval="1d",
    ),
})

# ──────── group_by 聚合 ────────
# 单聚合
print(orders.group_by("user_id").agg(pl.col("amount").sum()))

# 多聚合
result = orders.group_by("category").agg(
    pl.col("amount").sum().alias("total"),
    pl.col("amount").mean().alias("avg"),
    pl.col("amount").max().alias("max"),
    pl.col("order_id").count().alias("count"),
    (pl.col("status") == "paid").sum().alias("paid_count"),
)
print(result)

# 多分组键
result = orders.group_by(["user_id", "category"]).agg(
    pl.col("amount").sum()
)

# ──────── 窗口函数：over ────────
# 每个用户的所有订单都带"该用户的总金额"
df = orders.with_columns(
    pl.col("amount").sum().over("user_id").alias("user_total"),
    pl.col("amount").rank().over("user_id", "category").alias("rank_in_cat"),
    (pl.col("amount") / pl.col("amount").sum().over("user_id")).alias("amount_ratio"),
)
print(df.select(["user_id", "amount", "user_total", "amount_ratio"]))

# ──────── 滚动窗口 ────────
df = orders.sort("ts").with_columns(
    pl.col("amount").rolling_mean(window_size=3).alias("rolling_avg_3"),
    pl.col("amount").rolling_sum(window_size=7, min_periods=1).alias("rolling_sum_7"),
    pl.col("amount").shift(1).alias("prev_amount"),         # 滞后一阶
    pl.col("amount").diff().alias("amount_diff"),            # 一阶差分
)

# ──────── 时间序列：动态分组 ────────
# 按周聚合
weekly = (
    orders
    .sort("ts")
    .group_by_dynamic("ts", every="1w", period="1w", closed="left")
    .agg(
        pl.col("amount").sum(),
        pl.col("user_id").n_unique().alias("unique_users"),
    )
)
print(weekly)
```

### 3.3 Lazy 模式：Query Optimizer 威力

```python
# 文件：polars/lazyframe/frame.py
import polars as pl

# ──────── 读取大数据（惰性） ────────
# scan_* 不读取数据，只构建查询计划
# 实际读取发生在 .collect() 时
lf = pl.scan_parquet("data.parquet", n_rows=10_000_000)   # 1000 万行
lf = pl.scan_csv("data-*.csv")                            # 多个文件

# ──────── 构建查询 ────────
query = (
    lf
    .filter(pl.col("status") == "paid")                   # 1. 过滤
    .filter(pl.col("amount") > 10)                        # 2. 多过滤
    .select([                                             # 3. 选列
        "user_id", "category", "amount", "ts",
    ])
    .with_columns(                                        # 4. 派生
        (pl.col("amount") * 0.9).alias("discounted"),
        pl.col("ts").dt.year().alias("year"),
    ])
    .group_by(["user_id", "year"])                        # 5. 分组
    .agg(
        pl.col("amount").sum().alias("total"),
        pl.col("discounted").mean().alias("avg_disc"),
    )
    .sort("total", descending=True)                       # 6. 排序
    .limit(100)                                           # 7. 限制
)

# ──────── 查看查询计划（优化器的工作） ────────
print(query.explain())                                    # 人类可读
print(query.explain(optimized=True))                     # 优化后
print(query.show_graph(optimized=True))                   # 图形化（需要 mermaid）

# ──────── 执行 ────────
result = query.collect()                                  # 触发执行
print(result)

# 流式执行（out-of-core，处理 > 内存的数据）
query.sink_parquet("output.parquet")                      # 直接写盘

# ──────── Lazy vs Eager 性能对比 ────────
# Lazy 的优化器会做：
# 1. Predicate Pushdown: filter 下推到 IO 层（只读需要的行）
# 2. Projection Pushdown: select 下推到 IO 层（只读需要的列）
# 3. Slice Pushdown: limit 下推到 IO 层（提前停止）
# 4. 算子合并: 连续 filter 合并
# 5. Constant Folding: 常量表达式预计算

# ──────── 复杂查询：Join + AsOf Join ────────
# 等值 join
users = pl.DataFrame({"user_id": [1, 2, 3], "name": ["A", "B", "C"]})
result = orders.join(users, on="user_id", how="left")
# join 策略自动选择（hash / sort merge / broadcast）

# AsOf join（时间序列：找到最近时刻的值）
# 订单 join 该时刻最新的汇率
result = orders.join_asof(
    rates,                                                # 汇率历史
    left_on="ts", right_on="ts",
    strategy="backward",                                  # 向后找最近
)
```

### 3.4 IO 性能 + 实战

```python
# 文件：polars/io / polars/sql
import polars as pl
import pyarrow as pa
import pandas as pd

# ──────── 高速 IO ────────
# Parquet：列式压缩，最佳默认
df = pl.read_parquet("data.parquet")
# 指定列（减少 IO）
df = pl.read_parquet("data.parquet", columns=["user_id", "amount"])
# 分区读取（分区剪枝）
df = pl.read_parquet("data/", hive_partitioning=True)

# CSV：自动类型推断
df = pl.read_csv("data.csv", dtypes={"user_id": pl.Int32})
# 自定义 schema
df = pl.read_csv(
    "data.csv",
    schema_overrides={"id": pl.Int64, "name": pl.Utf8, "amount": pl.Float64},
    null_values=["NA", "NULL", ""],
    try_parse_dates=True,
)

# NDJSON / JSON Lines
df = pl.read_ndjson("data.jsonl")

# 写入：比 Pandas 快 5-10x
df.write_parquet("out.parquet", compression="snappy", compression_level=3)
df.write_csv("out.csv")
df.write_ndjson("out.jsonl")
df.write_database("table_name", connection=uri, if_exists="replace")

# ──────── 数据库：ConnectorX 加速 ────────
# pip install connectorx
df = pl.read_database_uri(
    "SELECT * FROM orders WHERE ts > '2024-01-01'",
    "postgresql://user:pwd@host:5432/db",
)

# ──────── 与 Arrow / Pandas 互转（零拷贝） ────────
# Arrow Table → Polars（零拷贝）
arrow_tbl = pa.table({"a": [1, 2, 3], "b": [4, 5, 6]})
df = pl.from_arrow(arrow_tbl)
arrow_tbl_back = df.to_arrow()                            # 零拷贝回

# Pandas → Polars
df = pl.from_pandas(pdf)
# 注意：pl.DataFrame.to_pandas() 可能会复制（如果类型不匹配）

# ──────── 类型转换 + 性能优化 ────────
df = pl.DataFrame({
    "id": pl.arange(0, 1_000_000, dtype=pl.Int32, eager=True),  # 节省 50% 内存
    "category": pl.Series(["A", "B", "C"] * 333_333).cast(pl.Categorical),
    "value": pl.Series(np.random.rand(1_000_000), dtype=pl.Float32),
})
print(df.estimated_size("mb"), "MB")                      # 估算内存

# Categorical：把字符串列编码为整数（基数小时节省大量内存）
df = df.with_columns(pl.col("category").cast(pl.Categorical))
print(df.estimated_size("mb"), "MB (after categorical)")

# ──────── SQL 接口 ────────
# Polars 支持 SQL！
result = df.sql("""
    SELECT category, AVG(value) as avg_val, COUNT(*) as n
    FROM self
    WHERE id > 1000
    GROUP BY category
    ORDER BY avg_val DESC
""")
print(result)
# 注：self 引用当前 LazyFrame

# ──────── 与 sklearn / PyTorch 集成 ────────
import numpy as np

# 转 numpy（特征工程后送模型）
X = df.select(pl.col("value"), pl.col("id")).to_numpy()

# 配合 sklearn pipeline
from sklearn.preprocessing import StandardScaler
# 简单方式：df.to_numpy() → np 数组
# 推荐方式：保持 pl.DataFrame，只在最后 .to_numpy() 转换

# 与 PyTorch 配合
import torch
from torch.utils.data import DataLoader, TensorDataset
X_tensor = torch.from_numpy(df["value"].to_numpy()).float()
y_tensor = torch.from_numpy(df["id"].to_numpy()).float()
ds = TensorDataset(X_tensor, y_tensor)
loader = DataLoader(ds, batch_size=64, shuffle=True)
```

## 四、核心洞察

- **Rust + Arrow 是 Polars 性能的双重底座**：Rust 提供零成本抽象、内存安全、SIMD 自动向量化（LLVM 自动生成 AVX2/AVX-512 指令）；Apache Arrow 提供列式内存布局、CPU 缓存友好、零拷贝跨语言（Python/R/Java/JS）。两者结合让 Polars 在单核就比 Pandas 快 5-10x，多核并行后 10-30x。这是 Pandas（Python 循环 + NumPy C 扩展）永远追不上的架构差异。

- **LazyFrame + Query Optimizer 是杀手锏**：Eager 模式（`pl.DataFrame`）类似 Pandas，立即执行；Lazy 模式（`pl.LazyFrame`）构建逻辑查询计划，调用 `.collect()` 时 Query Optimizer 自动做：① Predicate Pushdown（filter 下推到 IO 层，只读需要的行）；② Projection Pushdown（select 下推到 IO 层，只读需要的列）；③ Slice Pushdown（limit 下推到 IO 层，提前停止）；④ Constant Folding（常量预计算）；⑤ 算子融合（连续 filter 合并）。10 行 Lazy 代码比 50 行手写 Eager 代码快 5-10x。

- **Expression API 是 Polars 的"灵魂"**：`pl.col("a").filter(x > 0).sum().over("user_id")` 链式表达，把"先选列 → 再过滤 → 再聚合 → 再分组"组合成一个表达式，无中间变量。SQL 用户立刻能上手：`SUM(IF(x>0, a, 0))` 等价于 `pl.col("a").filter(pl.col("x") > 0).sum()`。窗口函数 `.over()` 是 Polars 比 Pandas 优雅的关键——无需先 groupby 再 merge 回原表。

- **Polars vs Pandas 的 API 哲学差异**：Pandas 是"操作导向"（`df["a"] = df["a"] * 2` 修改 DataFrame）；Polars 是"表达式导向"（`df.with_columns(pl.col("a") * 2)` 返回新 DataFrame，原始不变）。前者像 R 风格的 mutate，后者像 SQL 风格的 SELECT。Polars 的不可变 + 表达式让 Query Optimizer 有更多优化空间。

- **类型系统严格且丰富**：Polars 的 Schema 在创建时就校验，每列有强类型（Int8/16/32/64、Float32/64、Utf8、Categorical、Date、Datetime、Duration、List、Struct、Array、Binary、Decimal、Object）。类型不匹配会立即报错，避免 Pandas 的"object 列"陷阱。`pl.Int8/16/32` + `pl.Categorical` 可节省 50-80% 内存，是大数据处理的关键。

- **多线程并行是默认行为**：`pl.read_csv(...)` / `pl.scan_csv(...).collect()` 自动用满所有 CPU 核，无需设置 `n_jobs`。基于 Rayon 库的 work-stealing 调度器保证负载均衡。`PL_NUM_THREADS=4` 环境变量控制线程数。单机 Polars = 等价 Dask 多机（数据量适中时）。

- **流式处理支持 out-of-core**：`pl.scan_*`（CSV / Parquet / IPC / Delta）只构建查询计划，不读取数据；`query.sink_*`（Parquet / CSV / IPC）逐块写盘。配合即可处理 > 内存的数据（100GB+ 单机处理），无需 Spark/Dask 集群。`streaming=True` 模式在 `.collect()` 启用逐块执行。

- **生态与互操作性极佳**：① `polars.from_arrow/to_arrow` 零拷贝对接 PyArrow / DuckDB / PySpark；② `polars.from_pandas/to_pandas` 兼容 Pandas 生态；③ `df.sql("SELECT ...")` 直接执行 SQL（Polars 内部维护 SQL 方言）；④ Hugging Face Datasets 内部已部分采用 Polars 加速；⑤ `ConnectorX` 让 Polars 直连 PostgreSQL/MySQL/Snowflake/BigQuery，速度比 `pd.read_sql` 快 5-10x。

- **Polars vs Dask vs Spark 的取舍**：① 单机 GB 级数据 → Polars 最快；② 集群 TB 级数据 → Spark 最稳；③ Python 数据科学中等规模 → Polars 单机 + Dask 备选；④ Polars Cloud（2024+）补齐分布式能力但仍早期。新项目默认 Polars + Parquet，集群规模才上 Spark。

- **学习曲线与未来**：Polars API 与 SQL 高度同构，SQL 用户零成本上手；Pandas 用户需适应"表达式+Lazy"思维但 1-2 天可上手。`polars` Rust crate 让你能在 Rust 生态中用同一 API（也可通过 `pyo3-polars` 把 Polars 暴露给 Rust 服务）。Hugging Face、Pydantic、Logfire 等都把 Polars 作为一等公民。Polars 是 Python 数据栈"现代化"的代表。

## 五、跨项目引用

- **[NumPy 基础](./numpy.md)**：Polars 内部用 Arrow 替代 NumPy ndarray，`.to_numpy()` 零拷贝转 NumPy 给 Scikit-learn/PyTorch。`pl.Series` 强类型对应 `np.ndarray` 弱类型，Polars 的 Categorical/Date/Datetime/Decimal 比 NumPy 更丰富。NumPy 算子在 Polars 中可通过 `pl.col("x").map_batches(lambda x: np.sin(x))` 接入。

- **[Pandas 数据分析](./pandas.md)**：Polars 是 Pandas 的"性能增强版"，API 高度对应（`pl.read_csv` vs `pd.read_csv`，`group_by` vs `groupby`）。Pandas 迁 Polars 主要改动：① `df["a"]` → `df.select(pl.col("a"))`；② `df[df["a"] > 0]` → `df.filter(pl.col("a") > 0)`；③ `df.assign(b=...)` → `df.with_columns(b=...)`；④ `inplace=True` 全部去掉。两者可用 `pl.from_pandas / df.to_pandas()` 互转。

- **[Dask 分布式计算](./dask.md)**：Polars 与 Dask 是"单机高性能 vs 分布式"的两端。GB 级数据用 Polars 单机即可（多核 + SIMD），TB 级数据用 Dask + Polars：`dask.dataframe.map_partitions(lambda pdf: pl.from_pandas(pdf).lazy().filter(...).collect().to_pandas())` 在每个 Dask partition 内跑 Polars 加速。Polars Cloud 是未来，但目前 Dask 仍更稳。

- **[Scikit-learn 机器学习](./scikit-learn.md)**：Polars 处理完数据后用 `df.to_numpy()` 喂 Scikit-learn。`pl.LazyFrame` + Query Optimizer 让特征工程（`with_columns` + `group_by` + `rolling`）极快。`from sklearn.preprocessing import StandardScaler; X = StandardScaler().fit_transform(df.select(pl.col("value")).to_numpy())`。

- **[PyTorch 训练](./pytorch.md)**：Polars 输出的 `numpy.ndarray` 配合 `torch.from_numpy().float()` 直接给 DataLoader。`polars` 还在实验性提供 `pl.col("x").to_torch()` 简化转换。Polars 处理 > 100GB 训练数据用 `scan_parquet().sink_parquet()` 流式过滤，给 PyTorch 数据加载层减负。

- **[Ollama / Llama 模型训练](./llama.md)**：LLM 数据预处理的最佳搭档是 Polars。`pl.scan_parquet("data-*.parquet")` → `.filter(pl.col("text").str.len_bytes() > 100)` → `.with_columns(pl.col("text").map_batches(tokenize_fn))` → `.sink_parquet("processed/")` 处理 100GB 文本数据。Polars 多核 + Lazy 让数据处理从天缩短到小时。

- **[PySpark 大数据]**：PySpark（Spark DataFrame API for Python）适合 TB-PB 集群规模；Polars 适合 GB-TB 单机规模。`Polars on Spark` 桥接让两个生态互通。Spark 3.5+ 提供 Pandas API（`ps.DataFrame`）由 PyArrow + Pandas 加速，但性能仍不及 Polars。AWS Athena、Google BigQuery（无服务器 OLAP）是另一类分布式 SQL 引擎，与 Polars 互补。

- **[DuckDB 嵌入式 OLAP]**：Polars 与 DuckDB 是"Python 端高性能 DataFrame"的两大明星。DuckDB 是 PostgreSQL 兼容的嵌入式 OLAP 引擎（用 SQL），Polars 是 DataFrame 库（用 API）。两者通过 Arrow 零拷贝互通（`polars.from_arrow(duckdb_result.fetch_arrow_table())`）。DBA 倾向 DuckDB（SQL 友好），Python 工程师倾向 Polars（API 优雅）。新项目常组合：Polars 处理流程 + DuckDB 处理一次性复杂分析查询。
