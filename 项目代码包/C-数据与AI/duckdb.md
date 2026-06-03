# DuckDB

## 一、前言

DuckDB 是进程内（in-process）的嵌入式 OLAP 数据库，被誉为"分析型 SQLite"，由 Centrum Wiskunde & Informatica（CWI，阿姆斯特丹数学与计算机科学研究所）的 Mark Raasveldt 和 Hannes Mühleisen 于 2019 年开始开发，2020 年首次发布 v0.1.0，2024 年发布 v1.0 稳定版。它把"PostgreSQL 的分析能力 + SQLite 的零部署体验"结合在 5MB 的单一可执行文件中——直接 `pip install duckdb` 即可在 Python 中使用，无服务器、无配置、无运维。截至 2025 年，DuckDB GitHub 2.4 万+ Star、PyPI 月下载量超过 3000 万次，被 Apache Arrow、Polars、Ibis、dbt、Streamlit、LangChain、ClickHouse、Pandas、Snowflake 等项目深度集成，是单机分析查询的新范式。

DuckDB 的核心价值在于"嵌入式 OLAP + 进程内 + SQL 兼容 + Arrow 原生"。① 嵌入式 OLAP——`import duckdb` 立即获得完整分析型 SQL 引擎（窗口函数、CTE、PIVOT/UNPIVOT、ASOF JOIN、SAMPLE），不需启动服务器；② 进程内执行——库与应用程序同进程，无网络通信、无服务开销，比 Presto/ClickHouse/Snowflake 快 10-100x；③ SQL 兼容——支持 PostgreSQL 95% 语法（含窗口函数、聚合、JOIN、CTE、JSON/SQL/MACRO），SQL 用户零学习成本；④ Arrow 原生——零拷贝读写 Apache Arrow 数据，与 Polars、PySpark、Pandas、R 互通；⑤ 单机 + 横向扩展——单机极致性能（10GB CSV 秒级聚合），通过 DuckLake 扩展到集群。

DuckDB 的关键能力包括：① 完整 SQL 方言（PostgreSQL 兼容 + 分析扩展）；② 列式存储 + 向量化执行（向量化引擎批量处理 + SIMD）；③ 嵌入式（无服务、库、CLI）；④ 多数据源读取（CSV / Parquet / JSON / Arrow / PostgreSQL / SQLite / MySQL / DuckLake）；⑤ 数据写入（Parquet / CSV / Arrow / Database）；⑥ 事务 ACID；⑦ 窗口函数、CTE、视图、宏、PIVOT；⑧ Python C API 集成（Polars / Pandas / PyArrow / NumPy）；⑨ R / Java / Node.js / Rust / Go 客户端；⑩ 扩展性（httpfs、postgres_scanner、sqlite_scanner、iceberg、delta）。

DuckDB 与其他 OLAP 数据库/查询引擎的对比：

| 工具 | 定位 | 优势 | 局限 |
|------|------|------|------|
| DuckDB | 嵌入式 OLAP | 零部署、SQL 标准、Arrow 原生、单机极致 | 单节点、并发写入弱、需 Python/R 内调用 |
| SQLite | 嵌入式 OLTP | 标准、零部署、嵌入式之王 | 事务型、列分析能力弱 |
| PostgreSQL | 通用 RDBMS | 完整 SQL、事务、扩展强 | 启动重、嵌入式不友好、列分析需扩展 |
| ClickHouse | 分布式 OLAP | 列式、极致压缩、PB 级 | 需部署运维、单节点 100GB+ 体验差 |
| Apache Doris / StarRocks | MPP 分布式 OLAP | 高吞吐、湖仓一体 | 运维复杂、需集群 |
| Snowflake / BigQuery | 云数仓 | 无服务器、PB 级、生态 | 商业、贵、不能本地 |
| Presto / Trino | 分布式 SQL 引擎 | 跨数据源查询、联邦 | 启动重、延迟高 |
| Polars | DataFrame 库 | Rust 极致、API 优雅、Arrow | 非 SQL、Python 绑定为主 |

DuckDB 的核心应用场景：① 一次性大规模分析查询（10GB-1TB CSV/Parquet 数据）；② 嵌入式 BI 报表（Jupyter / Streamlit / Gradio 内置 DuckDB 加速查询）；③ 数据转换 ETL（read_csv → filter → group by → write_parquet）；④ 跨数据源联邦查询（PostgreSQL + Parquet + S3 JOIN）；⑤ 数据科学（替代 SQLite 做特征存储、模型缓存）；⑥ Polars/Pandas 性能加速（`df.sql("SELECT ...")` 接口）；⑦ 数据验证 / 测试（in-memory，CI 环境无需启动 PG）；⑧ 替代 pandas 慢的 SQL-style 操作（groupby/join）。

DuckDB 5 大核心特性：① 嵌入式零部署（`pip install duckdb` 5MB 一键完成）；② 完整 SQL 99% 兼容（PostgreSQL 方言 + 分析扩展 + 高级类型）；③ 列式向量化执行（CPU 缓存友好 + SIMD）；④ Apache Arrow 原生集成（Polars/Pandas/PySpark 零拷贝）；⑤ 跨数据源（CSV/Parquet/JSON/Arrow/PG/S3/GCS/HTTP 单表查询 + 联邦 JOIN）。

## 二、架构思维导图

```mermaid
mindmap
  root((DuckDB))
    核心概念
      in-process
        嵌入式
        无服务
      columnar
        列式存储
      vectorized
        向量化执行
      OLAP
        分析优化
      ACID
        事务
        MVCC
    安装
      Python
        pip install
      CLI
        duckdb binary
      R
        duckdb R 包
      Node.js
        duckdb Node
      Java JDBC
      Rust crates
    SQL 方言
      DDL
        CREATE TABLE
        CREATE VIEW
        CREATE MACRO
      DML
        SELECT INSERT
        UPDATE DELETE
      CTE
        WITH
        RECURSIVE
      窗口
        OVER
        PARTITION BY
        ROWS RANGE
      集合
        UNION INTERSECT
        EXCEPT
      分析
        PIVOT UNPIVOT
        SAMPLE
        QUALIFY
      JSON
        json 函数
        json 路径
    优化器
      向量化
        SIMD
        批处理
      表达式
        投影下推
        谓词下推
      连接
        hash join
        sort merge
        nested loop
        asof join
      统计
        cost based
        采样统计
    数据源
      CSV
        read_csv
        auto detect
      Parquet
        read_parquet
        hive 分区
      JSON
        read_json
        read_json_auto
      Arrow
        零拷贝
      数据库
        postgres_scanner
        sqlite_scanner
        mysql_scanner
      云
        s3 gcs
        httpfs
        azure
      Delta
        delta extension
      Iceberg
        iceberg
    写入
      Parquet
        COPY TO
        compression
      CSV
        COPY TO
      Arrow
        直接导出
      Database
        ATTACH
        CREATE TABLE AS
    扩展
      httpfs
        S3 GCS HTTP
      postgres
        PG 联邦
      sqlite
        SQLite 读
      iceberg
        湖仓
      delta
        Delta Lake
      mysql
      aws
        S3 凭证
      spatial
        地理空间
      fulltext
        全文搜索
      json
    类型
      基本
        INTEGER BIGINT
        DOUBLE VARCHAR
        BOOLEAN
        DATE TIMESTAMP
        UUID
        DECIMAL
        INTERVAL
      嵌套
        LIST
        STRUCT
        MAP
        UNION
      特殊
        BLOB
        JSON
        BITSTRING
    Python API
      duckdb.connect
        内存库
        文件库
      execute
        SQL 执行
      read_csv
        读 CSV
      read_parquet
      from_df
        Pandas
      from_arrow
        零拷贝
      pl.from_dask
        Dask
      sql
        Polars
    CLI
      duckdb my.db
        REPL
        .tables .schema
        .mode
      .read script.sql
      .output file
    联邦查询
      ATTACH postgres
        pg_federated
      ATTACH sqlite
      ATTACH mysql
      跨源 JOIN
        pg + parquet + csv
    性能
      列存压缩
        Bitpacking
        Dictionary
        RLE
        Delta
      物化
        视图
        CTE 物化
      并行
        多核
    生态
      Polars
        df.sql
        共享 Arrow
      Pandas
        from_df to_df
      PyArrow
        零拷贝
      dbt
        dbt-duckdb
      Streamlit
        st.connections
      LangChain
        SQLDatabase
      MLflow
        评估
      Ibis
        统一 API
```

## 三、关键代码

### 3.1 入门：嵌入式数据库

```python
# 文件：duckdb/__init__.py
import duckdb

# ──────── 连接方式 ────────
# 1. 内存数据库（最常见）
con = duckdb.connect()                              # 等价 ":memory:"

# 2. 持久化数据库
con = duckdb.connect("my.db")                       # 持久化到文件
con = duckdb.connect("/path/to/data.duckdb")

# 3. 默认连接（无 con 变量）
duckdb.execute("CREATE TABLE t AS SELECT 1 AS a")   # 默认 :memory:
result = duckdb.execute("SELECT * FROM t").fetchall()

# ──────── 直接读 CSV/Parquet/JSON ────────
# 无需建表，直接查文件
result = duckdb.sql("""
    SELECT category, COUNT(*) as n, AVG(amount) as avg_amt
    FROM 'data.csv'                                 -- 单引号：文件路径
    WHERE amount > 100
    GROUP BY category
""").df()
print(result)

# 多文件 / glob
result = duckdb.sql("""
    SELECT * FROM read_parquet('data-*.parquet')
    WHERE year = 2024
""").df()

# S3 / GCS（需 httpfs 扩展）
duckdb.sql("INSTALL httpfs; LOAD httpfs;")
duckdb.sql("SET s3_region='us-west-2';")
result = duckdb.sql("SELECT * FROM 's3://bucket/data/*.parquet'").df()

# ──────── 类型推断与 schema ────────
duckdb.sql("DESCRIBE SELECT * FROM 'data.csv'")    # 推断 schema
duckdb.sql("SELECT * FROM 'data.csv' LIMIT 0")     # 看列名
```

### 3.2 SQL 完整能力 + 分析扩展

```python
# 文件：duckdb/__init__.py
import duckdb
import pandas as pd
import pyarrow as pa

# ──────── 创建表 + 插入 ────────
con = duckdb.connect("analytics.db")

con.execute("""
    CREATE TABLE orders (
        order_id    BIGINT,
        user_id     INTEGER,
        category    VARCHAR,
        amount      DECIMAL(10, 2),
        status      VARCHAR,
        created_at  TIMESTAMP,
        metadata    JSON
    )
""")

# 批量插入
con.execute("""
    INSERT INTO orders
    SELECT
        i AS order_id,
        (i % 1000) AS user_id,
        CASE i % 3 WHEN 0 THEN 'A' WHEN 1 THEN 'B' ELSE 'C' END AS category,
        (random() * 1000)::DECIMAL(10, 2) AS amount,
        CASE WHEN random() < 0.9 THEN 'paid' ELSE 'refund' END AS status,
        TIMESTAMP '2024-01-01' + INTERVAL (i) HOUR AS created_at,
        json_object('key', i, 'val', random()) AS metadata
    FROM range(1, 100001) t(i)
""")

# ──────── 窗口函数 ────────
result = con.execute("""
    SELECT
        order_id, user_id, category, amount,
        SUM(amount) OVER (PARTITION BY user_id ORDER BY created_at) AS cumulative_amt,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS user_rank,
        LAG(amount) OVER (PARTITION BY category ORDER BY created_at) AS prev_in_cat
    FROM orders
    WHERE status = 'paid'
    ORDER BY user_id, created_at
    LIMIT 10
""").df()

# ──────── CTE + 递归 ────────
result = con.execute("""
    WITH daily_agg AS (
        SELECT
            DATE_TRUNC('day', created_at) AS day,
            category,
            SUM(amount) AS total_amt
        FROM orders
        GROUP BY 1, 2
    ),
    ranked AS (
        SELECT *, RANK() OVER (PARTITION BY day ORDER BY total_amt DESC) AS rnk
        FROM daily_agg
    )
    SELECT * FROM ranked WHERE rnk <= 3
""").df()

# ──────── PIVOT / UNPIVOT ────────
# 宽表 ↔ 长表
pivot = con.execute("""
    PIVOT orders
    ON category
    USING SUM(amount)
    GROUP BY user_id
""").df()
print(pivot.head())

# SAMPLE
sample = con.execute("""
    SELECT * FROM orders USING SAMPLE 1%             -- 1% 采样
""").df()

# QUALIFY（对窗口函数结果过滤）
qualified = con.execute("""
    SELECT user_id, amount,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) AS rn
    FROM orders
    QUALIFY rn = 1                                   -- 选每个 user 最大单
""").df()

# ──────── ASOF JOIN（金融时序） ────────
# 订单 join 当时的汇率
con.execute("""
    CREATE TABLE fx_rates (
        ts TIMESTAMP,
        usd_cny DECIMAL(10, 6)
    )
""")
# 假设已有数据
result = con.execute("""
    SELECT o.order_id, o.amount, f.usd_cny,
           o.amount * f.usd_cny AS amount_cny
    FROM orders o
    ASOF JOIN fx_rates f ON o.created_at = f.ts       -- 找最近时刻
    LIMIT 5
""").df()
```

### 3.3 Python 互操作：Arrow / Pandas / Polars / NumPy

```python
# 文件：duckdb/__init__.py
import duckdb
import pandas as pd
import polars as pl
import pyarrow as pa
import numpy as np

# ──────── Pandas 互转 ────────
pdf = pd.DataFrame({
    "user_id": [1, 2, 3, 4, 5],
    "amount": [100, 200, 300, 400, 500],
})
con = duckdb.connect()

# Pandas → DuckDB
con.execute("CREATE TABLE t AS SELECT * FROM pdf")   # 直接查询 Pandas

# DuckDB → Pandas
result = con.execute("SELECT * FROM pdf WHERE amount > 200").df()
print(type(result))                                  # pandas.DataFrame

# ──────── Arrow 零拷贝 ────────
arrow_tbl = pa.table({"a": [1, 2, 3], "b": ["x", "y", "z"]})

# Arrow → DuckDB（零拷贝）
con.execute("CREATE TABLE arrow_t AS SELECT * FROM arrow_tbl")
result = con.execute("SELECT * FROM arrow_t").arrow()  # 零拷贝回 Arrow

# ──────── Polars 互转 ────────
df_pl = pl.DataFrame({"x": [1, 2, 3], "y": ["a", "b", "c"]})

# Polars → DuckDB（零拷贝）
result = duckdb.execute("SELECT * FROM df_pl WHERE x > 1").pl()
print(type(result))                                  # polars.DataFrame

# DuckDB → Polars
result_df = duckdb.sql("""
    SELECT * FROM read_parquet('data.parquet')
    WHERE amount > 100
""").pl()

# ──────── 视图（自动推断） ────────
# Pandas DataFrame 可作为"视图"直接查询
df = pd.read_csv("data.csv")
result = duckdb.execute("SELECT * FROM df LIMIT 10").df()

# Polars DataFrame 同样
result = duckdb.execute("SELECT * FROM df_pl WHERE x > 1").pl()

# ──────── 注册自定义函数 ────────
def my_sum(a, b):
    return a + b

con.create_function("my_sum", my_sum)
result = con.execute("SELECT my_sum(1, 2) AS s").fetchone()  # 3

# 向量化（接受 numpy 数组）
def numpy_mul(arr, factor):
    return arr * factor

con.create_function("numpy_mul", numpy_mul, [duckdb.typing.DOUBLE, duckdb.typing.DOUBLE], duckdb.typing.DOUBLE)
result = con.execute("SELECT numpy_mul(2.5, 3.0) AS r").fetchone()  # 7.5

# ──────── 直接查询 NumPy ────────
arr = np.arange(10)
result = duckdb.execute("SELECT * FROM arr WHERE arr > 5").fetchall()
```

### 3.4 联邦查询 + 扩展 + 实战

```python
# 文件：duckdb/__init__.py
import duckdb
import pandas as pd

# ──────── 联邦查询：跨数据源 JOIN ────────
con = duckdb.connect()

# ATTACH 一个 PostgreSQL
con.execute("""
    INSTALL postgres_scanner;
    LOAD postgres_scanner;
""")
con.execute("""
    ATTACH 'postgresql://user:pwd@localhost:5432/sales' AS pg_db (
        TYPE postgres,
        READ_ONLY
    )
""")

# ATTACH 一个 SQLite
con.execute("""
    INSTALL sqlite_scanner;
    LOAD sqlite_scanner;
    ATTACH 'legacy.db' AS sqlite_db (TYPE sqlite, READ_ONLY)
""")

# 三表 JOIN：PG + Parquet + SQLite
result = con.execute("""
    SELECT
        p.product_id, p.name,
        s.quantity,
        l.last_modified
    FROM pg_db.public.products p
    JOIN read_parquet('sales_2024.parquet') s ON p.product_id = s.product_id
    LEFT JOIN sqlite_db.legacy l ON p.product_id = l.id
    WHERE s.sale_date >= DATE '2024-01-01'
""").df()

# ──────── 写入多格式 ────────
# 写 Parquet
con.execute("""
    COPY (SELECT * FROM orders WHERE year = 2024)
    TO 'orders_2024.parquet' (FORMAT PARQUET, COMPRESSION 'snappy')
""")

# 写分区 Parquet
con.execute("""
    COPY (SELECT * FROM orders)
    TO 'orders_partitioned' (FORMAT PARQUET, PARTITION_BY (year, month))
""")

# 写 CSV
con.execute("""
    COPY (SELECT * FROM orders LIMIT 1000)
    TO 'orders_sample.csv' (FORMAT CSV, HEADER, DELIMITER ',')
""")

# ──────── 物化视图 + 宏 ────────
# 宏（类似函数）
con.execute("""
    CREATE MACRO clean_amount(x) AS COALESCE(x, 0)
""")
result = con.execute("SELECT clean_amount(NULL)").fetchone()  # 0

# 视图
con.execute("""
    CREATE VIEW top_users AS
    SELECT user_id, SUM(amount) AS total
    FROM orders
    WHERE status = 'paid'
    GROUP BY user_id
    HAVING total > 10000
""")
result = con.execute("SELECT * FROM top_users LIMIT 10").df()

# 物化视图（v1.0+ 实验性）
# con.execute("CREATE MATERIALIZED VIEW daily_summary AS ...")

# ──────── 实战：CSV → 清洗 → Parquet ────────
# 一行命令处理 100GB CSV 数据
con.execute("""
    INSTALL httpfs;
    LOAD httpfs;
""")

# 流式处理（不占内存）
con.execute("""
    SET memory_limit = '8GB';
    SET threads = 8;
    SET temp_directory = '/tmp/duckdb_temp';
""")

# 直接读 + 转换 + 写
con.execute("""
    COPY (
        SELECT
            order_id,
            user_id,
            UPPER(TRIM(category)) AS category,
            CAST(amount AS DECIMAL(10, 2)) AS amount,
            status,
            CAST(created_at AS TIMESTAMP) AS created_at
        FROM read_csv('raw_data.csv',
                      header=true,
                      delim=',',
                      columns={'order_id': 'BIGINT',
                               'user_id': 'INTEGER',
                               'category': 'VARCHAR',
                               'amount': 'VARCHAR',
                               'status': 'VARCHAR',
                               'created_at': 'VARCHAR'},
                      null_padding=true,
                      ignore_errors=true)
        WHERE order_id IS NOT NULL
    ) TO 'cleaned_data.parquet' (FORMAT PARQUET, COMPRESSION 'zstd')
""")
```

## 四、核心洞察

- **"嵌入式 OLAP"是 DuckDB 的独特定位**：传统 OLAP（ClickHouse / Snowflake / BigQuery）需要部署集群、运维服务器、付费用，对单机数据科学分析太重；传统嵌入式（SQLite）是 OLTP，对分析查询慢。DuckDB 填补中间地带——"SQLite 的零部署 + ClickHouse 的分析性能"。`pip install duckdb` 5MB，5 秒开始用，10GB 数据秒级聚合。

- **列式 + 向量化执行是性能核心**：DuckDB 把数据按列存储（连续内存、CPU 缓存友好），查询时按列向量化处理（每批 1024-2048 行，SIMD 加速）。对比 SQLite 的"逐行火山模型"（Row-by-Row Volcano），DuckDB 在分析查询上快 10-100x。这种"列存 + 向量化"是 ClickHouse/Apache Arrow/Polars 的共同选择，是现代 OLAP 的事实标准。

- **Apache Arrow 是 DuckDB 的"共同语言"**：DuckDB、Polars、Pandas 2.x、PySpark、Ibis、Streamlit 全部走 Apache Arrow 内存格式。`duckdb.sql("...").arrow()` 是零拷贝的 Arrow Table，可直接喂 Polars（`pl.from_arrow(tbl)`）、PyTorch（`torch.from_numpy(tbl.column("x").to_numpy())`）、PySpark（`spark.createDataFrame(tbl.to_pandas())`）。这种"一站式数据互转"是 DuckDB 在数据科学栈流行的关键。

- **PostgreSQL 兼容性带来免费开发者体验**：DuckDB SQL 95% 兼容 PostgreSQL（窗口函数、CTE、JSON 路径、类型），SQL 用户零学习成本。差异仅在 5%：① 不支持事务/并发写（OLAP 数据库）；② 部分 PG 扩展（PostGIS、自定义类型）；③ 一些 PG 特定函数（pg_*）。这意味着你"用 PostgreSQL 的知识 + DuckDB 的速度"。

- **联邦查询让数据孤岛消失**：`ATTACH 'postgresql://...' AS pg_db` 一行让 DuckDB 直接查询 PostgreSQL；`ATTACH 'sqlite.db'` 读 SQLite；`httpfs` 读 S3/GCS Parquet；`read_csv/read_parquet/read_json` 读文件。然后在 SQL 中跨源 JOIN：PG + Parquet + SQLite + S3 一次查询。无需 ETL、无需数据复制、无需"一站式数据仓库"。

- **DBA 视角 vs 数据科学家视角**：DBA 关注"集群、复制、HA、监控、权限、备份"；数据科学家关注"零部署、SQL 友好、Arrow 互通、单文件可携带"。DuckDB 是数据科学家的"个人数仓"——单文件 db 即分析库、嵌入式 + Python/R 集成 + SQL + Arrow。生产环境用 Snowflake/BigQuery/ClickHouse；开发/分析用 DuckDB。

- **Polars 与 DuckDB 互补**：Polars 是 DataFrame 库（Rust 内核，API 优雅，单机极致性能）；DuckDB 是 SQL 引擎（嵌入式，标准 SQL，联邦查询）。两者通过 Arrow 零拷贝互通：`pl.from_dask_dataframe(...)` → `duckdb.sql("SELECT * FROM df_pl").pl()`。一个项目 Polars 跑流程 + DuckDB 跑复杂查询是黄金组合。

- **Macroeconomics of Analytical SQL**：传统做法"把数据导入 PG/CH/Snowflake → 写 SQL → 导出结果"链路长、成本高、延迟大。DuckDB 把"导入 → SQL → 导出"收敛到 1 个 Python 进程内：① 无网络通信；② Arrow 零拷贝；③ 100GB 数据在 64GB 内存机器上跑得动（外存计算）。这对数据科学/探索性分析是颠覆性改变。

- **dbt-duckdb 改变数仓开发**：dbt（data build tool）让分析师用 SQL + Jinja 模板构建数据流水线。`dbt-duckdb` adapter 让 dbt 跑在本地 DuckDB 上——`dbt run` 在笔记本上跑数据建模，输出到本地 Parquet，无需 Snowflake/BigQuery。这让"个人级数据仓库"成为新范式：`dbt + DuckDB + Git` = 个人/小团队数仓的 CI/CD。

- **局限与未来**：① 单节点（虽然极强），大规模需要 ClickHouse/Snowflake；② 并发写入弱（多读少写场景 OK）；③ OLTP 能力弱（不要用它做应用后端）；④ 嵌入式 → 没有 HTTP 服务（生产化需用外部服务）。DuckDB 团队 2024 推出 DuckLake 扩展（基于对象存储的多节点架构）补齐分布式短板，未来可期。

## 五、跨项目引用

- **[Polars 替代](./polars.md)**：Polars 与 DuckDB 是"Python 端高性能数据分析"的双星。Polars 是 DataFrame 库（API 风格），DuckDB 是 SQL 引擎（SQL 风格）。两者通过 Arrow 零拷贝互通：`duckdb.execute("SELECT * FROM df_pl").pl()`。生产组合：Polars 处理 ETL 流水线 + DuckDB 跑复杂 SQL 分析 + 一起输出 Arrow 给下游。

- **[Pandas 数据分析](./pandas.md)**：DuckDB 是 Pandas 慢 SQL-style 操作的"加速器"。`df.groupby('col').agg({'val': 'mean'})` 在 10GB 数据上慢，改为 `duckdb.sql("SELECT col, AVG(val) FROM df GROUP BY col").df()` 快 10-100x。`pip install duckdb` + `import duckdb` 即可嵌入到任何 Pandas 工作流。

- **[NumPy 基础](./numpy.md)**：DuckDB 接受 NumPy 数组作为"视图"——`duckdb.execute("SELECT * FROM np_arr WHERE np_arr > 5").fetchall()`。`fetch_np()` 直接转 NumPy 数组。NumPy 算子用 `con.create_function("numpy_op", np_op)` 注册到 DuckDB。

- **[PostgreSQL 关系数据库](./postgres.md)**：DuckDB 是 PostgreSQL 的"分析快路径"——同样的 SQL 语法、同样的窗口函数、同样的 CTE，DuckDB 在分析查询上快 5-100x。`dbt + DuckDB` 替代 `dbt + PostgreSQL` 是新趋势：开发用 DuckDB（本地、零运维），生产用 PostgreSQL/ClickHouse。

- **[Spark 大数据]**：Spark 是"分布式 DataFrame + SQL"；DuckDB 是"嵌入式 DataFrame + SQL"。两者通过 Arrow 互通。GB-TB 数据用 DuckDB + Polars 单机搞定，TB-PB 才用 Spark。Spark + DuckDB 组合也有：Spark 跑 ETL → DuckDB 跑分析 → Arrow 零拷贝转。

- **[Jupyter Notebook](./jupyter.md)**：DuckDB + Jupyter 是数据探索黄金组合。`%load_ext duckdb` 魔法命令 + `%%sql` 单元格直接执行 SQL，结果显示为 DataFrame/Arrow。`%sql SELECT * FROM 'data.csv' LIMIT 10` 几行出结果。Streamlit 集成 `st.connections.duckdb` 也让 DuckDB 在 BI 仪表盘场景极为便利。

- **[Ollama / Llama 模型训练](./llama.md)**：LLM 数据预处理流水线常用 DuckDB 做"快速 SQL 查询"——`SELECT * FROM read_parquet('raw/*.parquet') WHERE text_length > 100` 几秒过滤 1TB 文本；`SELECT category, COUNT(*) FROM embeddings.parquet GROUP BY category` 几秒出统计。DuckDB 比 PySpark 轻量百倍，比 Pandas 快 10-100x。

- **[ClickHouse / Snowflake / BigQuery]**：这三者都是分布式云原生 OLAP 数据库，DuckDB 嵌入式定位相反。开发/分析用 DuckDB（零部署、零成本、本地）；生产/服务化用 ClickHouse（自建集群）/ Snowflake（云数仓）/ BigQuery（无服务器）。同一份 SQL 在不同引擎上的迁移成本几乎为零（标准 SQL）。
