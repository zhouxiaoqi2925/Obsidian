# Pandas

## 一、前言

Pandas（Python Data Analysis Library）是 Python 生态中最核心的结构化数据分析库，由 Wes McKinney 于 2008 年在 AQR 资本管理公司开始开发，2009 年开源，2015 年被 NumFOCUS 赞助。它构建在 NumPy 之上，提供两种核心数据结构：**Series**（一维带标签数组）和 **DataFrame**（二维带标签表格），让 Python 拥有与 R data.frame、SAS、SQL 相当的表格数据处理能力。Pandas 的核心价值在于：用统一的、链式表达友好的 API 把"加载→清洗→切片→聚合→透视→时间序列→导出"完整数据链路收敛到同一个对象上，配合成熟的 IO 生态（CSV/Parquet/Excel/SQL/JSON/HTML/SAS）成为数据科学、量化金融、ETL、报表生成的"事实标准"。

Pandas 的关键能力包括：① 智能对齐——多个 Series/DataFrame 运算时自动按 Index 对齐，缺失值用 NaN 填充；② 分组聚合（groupby-aggregate-transform-filter）实现 split-apply-combine 范式；③ 透视表（pivot_table/crosstab/melt/stack）实现长宽表转换；④ 时间序列（DatetimeIndex/Resample/Timezone/rolling）一站式处理；⑤ 高性能 IO（Parquet/Feather/Arrow 零拷贝、CSV 块读取）；⑥ 与 NumPy/Scikit-learn/Matplotlib/SQLAlchemy/Arrow 生态无缝衔接。Pandas 2.x 起引入 PyArrow 与 dtype_backend='pyarrow' 选项，显著降低内存占用并加速字符串与缺失值处理；Pandas 3.0 进一步移除后备 NumPy 行为、默认 PyArrow 字符串，使整个体系向 Arrow 靠拢。

Pandas 与其他工具的对比：

| 工具 | 定位 | 优势 | 局限 |
|------|------|------|------|
| Pandas | 单机内存表格分析 | API 成熟、生态完整、文档丰富 | 大数据规模受限（GB 级需换 Polars/Dask/Spark） |
| Polars | Rust 内核的高性能 DataFrame | 速度 5-10x、并行执行、内存更省 | API 较新、Python 生态稍弱 |
| Dask | 分布式 Pandas 兼容 | 横向扩展、惰性图、熟悉的 API | 复杂算子性能比 Spark 差 |
| Spark | 分布式大数据 | TB/PB 规模、生态成熟 | 启动开销大、不适合小数据 |
| R dplyr | tidyverse 风格管道 | 语法优雅、统计建模紧密 | Python 生态融合弱 |
| SQL | 关系数据库 | 事务、ACID、长期沉淀 | 复杂分析表达式受限 |

Pandas 的核心应用场景：① 金融量化（时序数据清洗、因子分析、回测）；② 业务报表（Excel/CSV 加工、跨表合并）；③ 数据科学（EDA、特征工程、模型输入）；④ ETL（数据清洗、字段映射、校验）；⑤ Web 后端（API 入参出参、日志聚合）。

Pandas 5 大核心特性：① Series + DataFrame 双结构，统一处理一维与二维数据；② Index 智能对齐，跨表运算无脑 join；③ GroupBy + agg/transform/apply 实现 split-apply-combine；④ 时间序列（重采样/滚动窗口/时区）开箱即用；⑤ 与 NumPy/Scikit-learn/Matplotlib/SQLAlchemy 无缝衔接。

## 二、架构思维导图

```mermaid
mindmap
  root((Pandas))
    数据结构
      Series
        一维带标签
        Index values
        dtype
      DataFrame
        二维表格
        行索引 Index
        列索引 Columns
        BlockManager
      Index 类型
        RangeIndex
        Int64Index
        DatetimeIndex
        MultiIndex
        PeriodIndex
        CategoricalIndex
      Panel 三维 已废弃
    IO 体系
      文本
        read_csv to_csv
        read_json to_json
        read_html
      二进制
        read_parquet to_parquet
        read_feather to_feather
        read_pickle
        read_hdf to_hdf
      数据库
        read_sql to_sql
        read_sql_query
        SQLAlchemy
      Excel
        read_excel to_excel
        openpyxl xlsxwriter
    数据清洗
      缺失值
        isna notna
        dropna fillna
        interpolate
      重复值
        duplicated drop_duplicates
      类型转换
        astype
        to_numeric
        to_datetime
        to_timedelta
        convert_dtypes
      字符串
        str 访问器
        正则
        切片
    选择与切片
      位置
        iloc
      标签
        loc
      布尔
        mask where
        query
      字段
        df[col]
        df.col
    分组聚合
      groupby
        split
        apply
        combine
      聚合
        agg aggregate
        transform
        filter
        apply
      自定义
        aggfunc
        named agg
    透视与重塑
      pivot_table
      pivot
      melt
      stack unstack
      explode
      crosstab
    时间序列
      DatetimeIndex
      resample
        时间桶
        OHLC
      rolling
        移动平均
        滚动统计
      shift diff
      tz_localize
      tz_convert
      asfreq
    计算
      算术
        add sub mul
        自动对齐
      统计
        describe
        mean std var
        quantile
      相关
        corr cov
      累计
        cumsum cumprod
    性能优化
      dtype
        category
        int8/16/32
        pyarrow
      向量化
        避免循环
        np.where
        np.select
      query eval
        numexpr
      链式
        pipe
        assign
      Cython Numba
        pd.read_csv
        engine c
```

## 三、关键代码

### 3.1 核心数据结构：Series + DataFrame

```python
# 文件：pandas/core/frame.py / pandas/core/series.py
import numpy as np
import pandas as pd

# ──────── Series：一维带标签数组 ────────
s = pd.Series(
    data=[1, 3, 5, np.nan, 6, 8],        # 值
    index=["a", "b", "c", "d", "e", "f"],  # 标签
    dtype="float64",
    name="temperatures",
)
print(s)
# a    1.0
# b    3.0
# c    5.0
# d    NaN
# e    6.0
# f    8.0
print(s.index, s.values, s.dtype)

# ──────── DataFrame：二维表格 ────────
df = pd.DataFrame(
    {
        "name": ["Alice", "Bob", "Charlie", "Diana"],
        "age":  [25, 30, 35, 28],
        "city": ["NY", "SF", "LA", "NY"],
        "salary": [70000, 85000, 95000, 72000],
    },
    index=["emp1", "emp2", "emp3", "emp4"],  # 自定义行索引
)
print(df)
#          name  age city  salary
# emp1    Alice   25   NY   70000
# emp2      Bob   30   SF   85000
# emp3  Charlie   35   LA   95000
# emp4    Diana   28   NY   72000

# ──────── 智能对齐：不同索引的算术运算 ────────
s1 = pd.Series([1, 2, 3], index=["a", "b", "c"])
s2 = pd.Series([10, 20, 30], index=["b", "c", "d"])
print(s1 + s2)
# a     NaN   ← 自动对齐，缺失值用 NaN
# b    12.0
# c    23.0
# d     NaN

# ──────── describe：快速统计概览 ────────
print(df.describe(include="all"))
# 一键给出 count/mean/std/min/25%/50%/75%/max
# + top/freq（字符串列）
```

### 3.2 数据清洗：缺失值、重复、类型转换

```python
# 文件：pandas/core/frame.py / pandas/core/generic.py
import pandas as pd
import numpy as np

raw = pd.DataFrame({
    "id":   [1, 2, 2, 3, 4, 4, 4, 5],
    "name": ["A", "B", "B", None, "E", "E", None, "H"],
    "age":  [25, np.nan, 30, 35, 40, 40, 45, np.nan],
    "ts":   ["2024-01-01", "2024-01-02", "2024-01-02",
             "2024-01-03", "2024-01-04", "2024-01-04",
             "2024-01-05", "2024-01-06"],
})

# ──────── 缺失值：isna / dropna / fillna ────────
print(raw.isna().sum())
# id      0
# name    2
# age     2
# ts      0

# 删除任一列为空的行
clean = raw.dropna(subset=["name", "age"], how="any")

# 数值列用均值填充
clean = raw.copy()
clean["age"] = clean["age"].fillna(clean["age"].median())

# 字符串列用 "UNKNOWN" 填充
clean["name"] = clean["name"].fillna("UNKNOWN")

# ──────── 重复值：duplicated / drop_duplicates ────────
print(raw.duplicated(subset=["id"]).sum())  # 重复 ID 数
dedup = raw.drop_duplicates(subset=["id"], keep="last")
# keep: 'first' / 'last' / False(全删)

# ──────── 类型转换：astype / to_datetime / to_numeric ────────
df = raw.copy()
df["ts"] = pd.to_datetime(df["ts"])              # object → datetime64
df["age"] = pd.to_numeric(df["age"], errors="coerce")  # 失败置 NaN
df["id"]   = df["id"].astype("int32")            # 节省内存

# Categorical 节省内存（基数小的字符串列）
df["name"] = df["name"].astype("category")
print(df.memory_usage(deep=True))

# ──────── 字符串访问器：str.* ────────
df["email"] = ["a@gmail.com", "B@YAHOO.com", "c@hotmail.com",
               None, "e@163.com", "f@gmail.com", None, "h@qq.com"]
df["domain"] = df["email"].str.lower().str.split("@").str[-1]
# Series.str.lower / split / contains / replace / extract
```

### 3.3 分组聚合与透视表

```python
# 文件：pandas/core/groupby/generic.py / pandas/core/reshape/pivot.py
import pandas as pd
import numpy as np

orders = pd.DataFrame({
    "order_id": range(1, 11),
    "user_id":  [1, 2, 1, 3, 2, 3, 1, 2, 3, 1],
    "category": ["A", "B", "A", "A", "B", "C", "C", "A", "B", "A"],
    "amount":   [10, 20, 15, 30, 25, 50, 12, 18, 22, 35],
    "status":   ["paid", "paid", "refund", "paid", "paid",
                 "paid", "refund", "paid", "paid", "paid"],
})

# ──────── groupby：split-apply-combine ────────
# 单聚合函数
print(orders.groupby("user_id")["amount"].sum())
# user_id
# 1    72
# 2    63
# 3   102

# 多聚合函数
print(orders.groupby("category")["amount"].agg(["sum", "mean", "count"]))
#           sum  mean  count
# category
# A          108  21.6      5
# B           67  22.3      3
# C           62  31.0      2

# 命名聚合（pandas 0.25+）—— 字段名清晰可读
result = orders.groupby("user_id").agg(
    total=("amount", "sum"),
    avg=("amount", "mean"),
    n_orders=("order_id", "count"),
    paid_ratio=("status", lambda s: (s == "paid").mean()),
)
print(result)

# ──────── transform：分组内标准化 ────────
orders["amount_zscore"] = orders.groupby("category")["amount"].transform(
    lambda x: (x - x.mean()) / x.std()
)
# 每个订单的金额在自身类别内做 z-score

# ──────── filter：按组过滤 ────────
big_users = orders.groupby("user_id").filter(
    lambda g: g["amount"].sum() > 70
)

# ──────── 透视表：pivot_table ────────
pivot = orders.pivot_table(
    index="user_id",
    columns="category",
    values="amount",
    aggfunc="sum",   # 默认 'mean'
    fill_value=0,    # 缺失值填 0
    margins=True,    # 添加 All 行/列
)
print(pivot)

# ──────── melt：宽表 → 长表 ────────
wide = pd.DataFrame({
    "user": ["A", "B"],
    "Q1":   [100, 200],
    "Q2":   [150, 250],
    "Q3":   [120, 180],
})
long = wide.melt(
    id_vars="user",
    var_name="quarter",
    value_name="revenue",
)
```

### 3.4 时间序列与高性能 IO

```python
# 文件：pandas/core/indexes/timeseries.py / pandas/io/parquet.py
import pandas as pd
import numpy as np

# ──────── 时间戳索引 ────────
ts = pd.date_range("2024-01-01", periods=365, freq="D")
df = pd.DataFrame({
    "value": np.random.randn(365).cumsum() + 100,
    "category": np.random.choice(["A", "B", "C"], 365),
}, index=ts)

# 切片：按时间筛选
print(df["2024-03":"2024-04"])
print(df.loc["2024-06-15":"2024-06-20"])

# ──────── 重采样：resample ────────
monthly = df.resample("M").agg(
    avg=("value", "mean"),
    max=("value", "max"),
    min=("value", "min"),
    sum=("value", "sum"),
)
ohlc = df["value"].resample("W").ohlc()  # 金融 OHLC 桶

# ──────── 滚动窗口 ────────
df["ma7"]    = df["value"].rolling(window=7).mean()
df["std30"]  = df["value"].rolling(window=30).std()
df["ewm"]    = df["value"].ewm(span=20).mean()   # 指数加权

# ──────── 时区处理 ────────
ts_utc = pd.date_range("2024-01-01", periods=3, freq="H", tz="UTC")
ts_sh  = ts_utc.tz_convert("Asia/Shanghai")
# tz_localize 给无时区索引添加时区
# tz_convert 转换时区

# ──────── 高性能 IO：Parquet ────────
# 写入：Parquet 列式压缩，适合大表
df.to_parquet("data.parquet", engine="pyarrow", compression="snappy")

# 读取：仅取需要的列，加速 5-10x
cols = ["value", "category"]
df2 = pd.read_parquet("data.parquet", columns=cols)

# 分区（目录式 Parquet）
df.to_parquet("data/year=2024/month=01/data.parquet")

# ──────── SQL 集成：read_sql / to_sql ────────
import sqlalchemy as sa
engine = sa.create_engine("postgresql://user:pwd@localhost/db")
df = pd.read_sql("SELECT * FROM orders WHERE created_at > :dt",
                 engine, params={"dt": "2024-01-01"})
df.to_sql("orders_backup", engine, if_exists="replace", index=False)

# ──────── 链式分析与 query / eval ────────
result = (
    df
    .query("category == 'A' and value > 100")
    .assign(
        log_value=lambda d: np.log(d["value"]),
        high=lambda d: d["value"] > d["value"].median(),
    )
    .sort_values("value", ascending=False)
    .head(10)
)
```

## 四、核心洞察

- **Index 是一切**：Pandas 把 Index 提升为一等公民——Series 和 DataFrame 的每一行每一列都有标签，运算时自动按 Index 对齐。这一设计借鉴自 R 的 `data.frame` 和 SQL 的"按主键 join"，让数据操作从"位置思维"（NumPy）转向"语义思维"（按业务键）。理解 Index 才能真正用好 Pandas。

- **BlockManager 内存布局**：DataFrame 在底层把同 dtype 的列合并到一个 Block（一段连续 NumPy 数组），跨列按 Block 寻址。这意味着对单列做向量化操作时与 NumPy 几乎零开销，混合 dtype 操作时会有跨 Block 拷贝。Pandas 2.x 引入 PyArrow backend 进一步把字符串/缺失值交给 Arrow 的列式内存，统一跨语言（Python/R/Java/JS）。

- **避免 apply 循环**：很多 Pandas 新手会用 `df.iterrows()` 或 `df.apply(lambda ...)` 逐行处理，这会触发 Python 解释器循环，比 NumPy 向量化慢 10-100x。原则是：能用 NumPy/Pandas 内置向量化算子就用，不能就拆字段 `np.where` / `np.select` / `np.log`，再不行才用 Cython/Numba。`pd.eval()` 和 `df.query()` 内部用 numexpr，可在多列表达式上拿到 C 级性能。

- **groupby = split-apply-combine**：L19 Hadley Wickham 提出的经典范式。`groupby()` 本身只是惰性创建 GroupBy 对象，真正的 split 在迭代或聚合时发生。理解 `agg`（返回聚合值）、`transform`（返回与原表同 shape 的值）、`filter`（按组丢弃）、`apply`（灵活但慢）的差异，是写高效分组代码的关键。

- **缺失值 NaN ≠ None**：Pandas 中缺失值用 NaN（IEEE 754 浮点）表示，整数列的缺失值会强制升级为 float64。Pandas 2.0+ 引入 pd.NA（标量缺失值）统一处理 int/str/bool 的缺失语义，但仍要小心算术运算和比较时的特殊行为：`None == None` 是 True，但 `NaN == NaN` 是 False，`None != None` 是 False，但 `NaN != NaN` 是 True。

- **时间序列优势在金融/IoT**：Pandas 对时间序列的支持（`DatetimeIndex` / `PeriodIndex` / `resample` / `rolling` / `tz_convert` / `asfreq` / `shift`）远超其他库，这也是它在量化金融领域不可替代的原因。`df.resample('M').ohlc()` 一行拿到月度 OHLC 桶，`df.rolling(20).corr(df2)` 直接算滚动相关系数。

- **内存与性能的权衡**：Pandas 在内存中操作，所有数据必须装进 RAM。① 降 dtype（int64→int8/category/pyarrow string）可省 50-90% 内存；② Parquet 列式压缩比 CSV 小 5-10x、读快 5-10x；③ `chunksize` 分块读取避免 OOM；④ 真正大数据换 Polars/Dask/Spark。`df.memory_usage(deep=True)` 是必备自检。

- **生态位与替代品**：Pandas 适合 GB 级、单机的快速分析；同等数据规模下 Polars 速度更快（Rust 内核 + Apache Arrow + 多线程）、Dask 可扩展到集群；超大规模上 Spark/Flink 仍是唯一选择。但 Pandas 的 API 沉淀、教程生态、库兼容性（Scikit-learn/Matplotlib/Statsmodels 全部认它）短期不会被替代，新项目可以 Polars 起步、老项目继续 Pandas。

## 五、跨项目引用

- **[NumPy 基础](./numpy.md)**：Pandas 的 Series.values 就是 ndarray，DataFrame 的 Block 内部是 ndarray。理解 NumPy 的向量化、广播、dtype 体系是高效使用 Pandas 的前提；Pandas 缺失值 NaN 直接复用 NumPy 的 `np.nan`。

- **[PyTorch 训练](./pytorch.md)**：模型训练前的特征工程大量用 Pandas：从 `pd.read_csv` 读数据 → `df.groupby` 做特征 → `df.to_numpy()` 或 `from pandas import DataFrame → torch.utils.data.TensorDataset` 喂入模型。`DataLoader` 也可与 `pd.read_csv(chunksize=...)` 组合流式读取。

- **[Scikit-learn 机器学习](./scikit-learn.md)**：`sklearn` 接受 `DataFrame` 直接训练（特征名保留在 `feature_names_in_`），`train_test_split` 接受 DataFrame 与 Series 配套拆分。`df.corr()` 输出的相关矩阵可直接喂给 `feature_selection`；`pd.get_dummies` 配合 `ColumnTransformer` 完成类别特征独热编码。

- **[LangChain LLM 应用](./langchain.md)**：RAG 阶段常用 `pandas.read_csv` 加载结构化知识，`DataFrame.iterrows()` 构造文档列表喂给 `Document`；评估阶段用 `DataFrame` 记录 prompt/model/score 三列做批量对比与可视化。

- **[Matplotlib/Plotly 可视化]**：Pandas 的 `df.plot()` / `df.plot.scatter()` / `df.hist()` 直接绑到 Matplotlib，`df.plot.bar()` / `df.plot.pie()` / `df.boxplot()` 几行出图；Plotly Express 的 `px.scatter(df, x=..., y=..., color=...)` 同样吃 DataFrame。

- **[Polars 高性能替代]**：Rust 内核、Apache Arrow 内存布局、惰性查询优化器、并行执行——Polars 性能 5-10x 于 Pandas，API 接近（`pl.DataFrame` / `pl.col` / `group_by`），正快速渗透。Pandas 2.x 的 PyArrow backend 与 copy-on-write 优化正是对 Polars 压力的回应。

- **[PostgreSQL 关系数据库](./postgres.md)**：`pd.read_sql` / `to_sql` 通过 SQLAlchemy 与 PG 互通；PG 12+ 的 `COPY` 协议让 `df.to_sql` 大批量插入可达 10w 行/秒。Pandas 不擅长 join/事务/索引，正好与 SQL 互补：Pandas 拉数 + 内存分析 + 写回 OLAP/数据仓库。

- **[Apache Arrow 跨语言]**：Pandas 2.x 默认支持 PyArrow backend（`dtype_backend="pyarrow"`），使 DataFrame 零拷贝对接 Arrow 表，进而与 PySpark/Polars/DuckDB/R/Python/Rust 无缝共享内存。
