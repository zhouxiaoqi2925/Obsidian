# pandas - Python 标签化数据分析工具箱

**GitHub**: pandas-dev/pandas
**Star**: 45k+
**语言**: Python + Cython + C
**主题**: 开源项目、data-analysis、NumFOCUS
**适用场景**: 数据科学、量化分析、ETL 工程、学术研究

---

## 一、基础范式

### 模式 1 · DataFrame + Series + Index 三件套

**问题场景**：R 语言的 `data.frame` 在 Python 缺位；NumPy ndarray 没有标签、不擅长异构列。

**解决方案**：pandas 提供 3 大核心抽象：DataFrame（二维带标签表格）/ Series（一维带标签数组）/ Index（标签 + 对齐），让「带标签的表格数据」成为 Python 一等公民。

**关键参数**：
- `pd.DataFrame(data, index, columns)` 构造
- `pd.Series(data, index)` 一维
- `pd.Index(['a', 'b'])` 标签
- `df.index` / `df.columns` 行列索引
- `df.dtypes` 字段类型

**最佳实践**：所有「带列名的异构数据」都走 DataFrame 而非 ndarray。

### 模式 2 · BlockManager 按 dtype 分块存储

**问题场景**：异构列（int / float / string）混存浪费内存，按列操作 O(n) 扫描。

**解决方案**：`pandas/core/internals/managers.py` BlockManager 把同 dtype 的列合并为 Block（连续内存），按 dtype 分块存；按列操作只需访问对应 Block，零拷贝切片。

**关键参数**：
- BlockManager 顶层
- Block by dtype
- BlockManager.reindex() 重索引
- Block.values ndarray
- 内部 NumpyBlock / DatetimeBlock / ObjectBlock

**最佳实践**：理解 BlockManager 才能理解 pandas 性能瓶颈，按 dtype 分块是核心。

### 模式 3 · 索引对齐（自动 join）

**问题场景**：手写 join 代码易错，索引不对齐数据错位。

**解决方案**：pandas 所有二元操作（`+` / `merge`）自动按索引对齐，左对齐缺失补 NaN，错误不抛。

**关键参数**：
- `a + b` 自动按索引对齐
- `df.add(b, fill_value=0)` 缺失值
- `pd.merge(df1, df2, on='key')` SQL 风格
- `df1.join(df2)` 索引 join
- 算术对齐 `+ - * /`

**最佳实践**：所有「两表关联」用 `pd.merge` 而非手写嵌套循环。

### 模式 4 · 缺失数据 NaN / NaT

**问题场景**：真实数据有缺失，numpy 难表达。

**解决方案**：pandas 引入 `NaN`（float）/ `NaT`（datetime）/ `pd.NA`（v1.0+ 通用缺失）三件套，`isna()` / `dropna()` / `fillna()` 三件套处理。

**关键参数**：
- `np.nan` 浮点缺失
- `pd.NaT` 时间缺失
- `pd.NA` 通用缺失
- `df.isna()` 检测
- `df.fillna(0)` 填充

**最佳实践**：时间序列缺失用 `pd.NaT`，数值缺失用 `np.nan`，v1.0+ 统一用 `pd.NA`。

### 模式 5 · CSV / Excel / SQL / Parquet IO

**问题场景**：数据分析第一步是读各种格式文件。

**解决方案**：pandas 提供 20+ IO 函数：`read_csv` / `read_excel` / `read_sql` / `read_parquet` / `read_json` / `read_html` / `read_pickle` / `read_feather` / `read_stata` / `read_sas`，对应 `to_*` 写出。

**关键参数**：
- `pd.read_csv(file)` 文本
- `pd.read_excel(file, sheet_name=0)` Excel
- `pd.read_sql(query, conn)` SQL
- `pd.read_parquet(file)` 列存
- `chunksize=10000` 流式

**最佳实践**：大数据集用 Parquet（列存 + 压缩），日志用 CSV，分析中间用 pickle。

---

## 二、扩展范式

### 模式 6 · Indexing 多轴选择

**问题场景**：手写 `df[mask]` 选择数据不规范。

**解决方案**：pandas 提供 `.loc[]`（标签）/ `.iloc[]`（位置）/ `.at[]`（单值）/ `.iat[]`（单值位置）/ `[]`（列选择）五种 indexing 方式，链式组合。

**关键参数**：
- `df.loc['row', 'col']` 标签
- `df.iloc[0, 1]` 位置
- `df.at['row', 'col']` 单值快
- `df.query('col > 5')` 表达式
- `df[mask]` 布尔 mask

**最佳实践**：能用 `.loc` 不用 `.iloc`（标签语义稳定），单值用 `.at` / `.iat` 提速 10x。

### 模式 7 · GroupBy split-apply-combine

**问题场景**：分组聚合 SQL-like 难写。

**解决方案**：`df.groupby('key').agg({'col1': 'sum', 'col2': 'mean'})` 一行搞定 split（按 key 分组）/ apply（每组聚合）/ combine（合并结果）三段式。

**关键参数**：
- `df.groupby('key')` 单键
- `df.groupby(['k1', 'k2'])` 多键
- `.agg({...})` 多聚合
- `.transform(lambda x: ...)` 不改 shape
- `.apply(custom_func)` 自定义

**最佳实践**：所有「分组 + 聚合」都用 `groupby` + `agg`，比手写循环快 100x。

### 模式 8 · Resample / Rolling / Expanding 时序

**问题场景**：时间序列分析需要重采样 + 滚动窗口。

**解决方案**：时序三件套：① `df.resample('D')` 按日重采样 ② `df.rolling(window=7).mean()` 7 日滚动 ③ `df.expanding().sum()` 累计。

**关键参数**：
- `resample('D' | 'H' | 'M')` 重采样
- `rolling(7).mean()` 滚动
- `expanding().sum()` 累计
- `shift(1)` 错位
- `diff()` 差分

**最佳实践**：金融时序 rolling + shift 是核心，所有指标都能用 5 行写完。

### 模式 9 · Pivot / Melt 长宽表转换

**问题场景**：宽表（透视表）vs 长表（key-value）转换麻烦。

**解决方案**：`df.pivot(index, columns, values)` 宽表化；`df.melt(id_vars, value_vars)` 长表化；`df.pivot_table(values, index, columns, aggfunc)` 带聚合的透视表。

**关键参数**：
- `pivot` 不聚合
- `pivot_table` 聚合
- `melt` 长表
- `stack` / `unstack` 索引层级
- `crosstab` 交叉表

**最佳实践**：所有 BI 报表生成用 `pivot_table`，ETL 反规范化用 `melt`。

### 模式 10 · Eval / Query 表达式引擎

**问题场景**：`df[(df.a > 5) & (df.b < 10)]` 链式括号难写。

**解决方案**：`df.query('a > 5 and b < 10')` 用表达式字符串；`df.eval('c = a + b')` 动态算列；内部用 Python AST 解析，NumExpr 后端加速 10x。

**关键参数**：
- `df.query(expr)` 过滤
- `df.eval(expr)` 计算
- `numexpr` 引擎
- 表达式语法
- 局部变量 `@var`

**最佳实践**：复杂过滤用 `query` 而非链式 mask，10x 提速 + 可读性提升。

---

## 三、进阶范式

### 模式 11 · Cython 加速 + Meson 迁移

**问题场景**：纯 Python 慢，关键路径需要 C 加速。

**解决方案**：早期 `.pyx` Cython 文件 + `setup.py` 编译；2025 迁移到 Meson + subprojects C++ 端口，构建更快 + ABI 稳定。

**关键参数**：
- `pandas/_libs/` Cython 编译产物
- `.so` / `.pyd` 动态库
- Meson 构建
- C++ subprojects
- Cython 3.0

**最佳实践**：性能关键路径用 Cython 包装而非手写 C。

### 模式 12 · ExtensionArray 扩展点

**问题场景**：自定义 dtype（如 Categorical / Sparse / Datetime with TZ）需要独立内存管理。

**解决方案**：`ExtensionArray` 是 pandas v0.24+ 引入的扩展点基类，`dtype` / `nbytes` / `isna` / `take` / `copy` 等 12+ 方法需实现。

**关键参数**：
- `ExtensionDType` 类型
- `ExtensionArray` 数据
- `arr._from_factorized(values)` 构造
- `arr.isna()` 缺失检测
- `register_extension_dtype()` 注册

**最佳实践**：自定义 dtype 实现 `ExtensionArray` 接口，自动接入所有 pandas 算子。

### 模式 13 · PyArrow backend（v2.0+）

**问题场景**：pandas 默认 NumPy backend 在大数据集内存翻倍。

**解决方案**：`pd.options.future.infer_string = True` 启用 PyArrow backend，string 数据用 Arrow 内存（30%+ 内存节省），`dtype_backend='pyarrow'` 显式启用。

**关键参数**：
- `dtype_backend='pyarrow'`
- Arrow 字符串
- 内存节省 30%
- Polars 兼容
- 默认开启

**最佳实践**：大数据集（>10GB）启用 PyArrow backend，内存节省 + 与 Polars/DuckDB 互操作。

### 模式 14 · MultiIndex 层级索引

**问题场景**：多维数据需要多层级索引。

**解决方案**：`pd.MultiIndex.from_tuples([('a', 1), ('a', 2)])` 创建多级索引；`df.set_index(['k1', 'k2'])` 升级；`df.unstack()` 透视。

**关键参数**：
- `MultiIndex.from_tuples`
- `df.set_index([...])`
- `df.stack() / unstack()`
- `df.swaplevel()`
- `df.xs(key, level=)` 跨级选择

**最佳实践**：能用 1 级索引解决不用 MultiIndex，2 级以上考虑转长表。

### 模式 15 · 与 NumPy / SciPy / scikit-learn 互操作

**问题场景**：数据需要在 pandas 和 NumPy / scikit-learn 之间转换。

**解决方案**：`df.values` 转 ndarray；`pd.Series(arr)` 转 Series；scikit-learn `fit(X, y)` 接受 `df.values`；`from sklearn.preprocessing import StandardScaler` 直接用。

**关键参数**：
- `df.values` ndarray
- `pd.DataFrame(arr, columns=...)` 反向
- sklearn `X = df[['f1', 'f2']].values`
- `pd.Series(sklearn_output)`
- `df.to_numpy()` v1.0+

**最佳实践**：ML pipeline 用 `df[['feature_cols']].values`，不要传整个 DataFrame。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：数据分析师第一周上手。

**解决方案**：7 件套：① `pd.read_csv` 读数据 ② `df.head()` 检视 ③ `df.describe()` 统计 ④ `df.isna().sum()` 缺失统计 ⑤ `df.dtypes` 类型 ⑥ `df.groupby().agg()` 聚合 ⑦ `df.to_parquet` 落盘。

**关键参数**：
- `read_csv` / `read_parquet` IO
- `head` / `info` / `describe` 检视
- `isna` 缺失
- `groupby` / `agg` 聚合
- `to_parquet` 落盘

**最佳实践**：所有分析任务都用 7 件套顺序上手，10 分钟摸清数据全貌。

### 模式 17 · 性能优化 5 招

**问题场景**：pandas 默认慢，大数据集卡顿。

**解决方案**：5 招优化：① 选合适 dtype（`category` 替 string）② 用 `query` / `eval` 替链式 mask ③ 用 `numpy.where` 替 `apply` ④ 矢量化 ⑤ 启用 PyArrow backend。

**关键参数**：
- `astype('category')` 分类
- `query` / `eval` 表达式
- `numpy.where` 矢量化
- `iterrows()` 慢 / `itertuples()` 快
- PyArrow backend

**最佳实践**：80% 性能问题在 `category` dtype + 向量化，剩下 20% 走 Polars / Dask。

### 模式 18 · 与 Polars / Dask / Spark 对比

**问题场景**：大数据集在 pandas 卡顿。

**解决方案**：pandas 适合 < 10GB 数据集；Polars（Rust 引擎 + Arrow）适合 10-100GB；Dask 适合 100GB-1TB；Spark 适合 > 1TB。

**关键参数**：
- 体积：pandas < 10GB / Polars < 100GB / Dask < 1TB / Spark > 1TB
- 性能：Polars > pandas > Dask > Spark
- 学习曲线：pandas < Polars < Dask < Spark
- 生态：pandas > Spark > Dask > Polars

**最佳实践**：MVP 用 pandas，过 10GB 切 Polars，分布式需求切 Dask/Spark。

### 模式 19 · 时间序列实战（金融 + 业务）

**问题场景**：金融 / 业务时序数据需要 resample + rolling + shift + diff。

**解决方案**：`df.set_index('date')` + `resample('D').agg()` + `rolling(7).mean()` + `shift(1)` 错位 + `pct_change()` 涨跌幅 + `diff()` 差分。

**关键参数**：
- `set_index('date')` 时间索引
- `resample('D')` 按日
- `rolling(7).mean()` 7 日均线
- `shift(1)` 滞后
- `pct_change()` 涨跌幅

**最佳实践**：所有时序分析用 `set_index` + `resample` + `rolling` 三件套。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：团队想 fork pandas 做内部数据工具。

**解决方案**：7 天分 6 步：① DataFrame/Series 包装 ndarray ② Index + 对齐 ③ CSV/Parquet IO ④ groupby 聚合 ⑤ join/merge ⑥ 缺失数据处理。

**关键参数**：
- Day 1-2: DataFrame + Index
- Day 3: 对齐 + IO
- Day 4: groupby
- Day 5: join/merge
- Day 6: 缺失
- Day 7: 文档

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 pandas 复刻需要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\pandas\`
- **大小**: ~350 MB
- **总文件数**: 1500+ Python 文件
- **关键 commit**: meson 迁移版本
- **团队**: pandas-dev org + 20 核心维护者
- **许可**: BSD-3-Clause

## 一句话总结

pandas 用「DataFrame + Series + Index」三件套 + BlockManager 分块存储 + 自动索引对齐，让 Python 拥有 R 语言的 data.frame 体验，是数据科学家的瑞士军刀。
