# NumPy

## 一、前言

**定位**：Python 生态的**科学计算基础库**，2005 年由 Travis Oliphant 在 Numeric 基础上重写，2006 年合并 Numarray。是几乎所有数据/AI 库（pandas / SciPy / PyTorch / TensorFlow）的依赖。

**核心价值**：
- **N 维数组对象** `ndarray`：比 Python list 快 50-100 倍
- **向量化运算**：避免 Python 循环，C 级别性能
- **广播机制**：不同 shape 数组自动扩展维度
- **线性代数**：矩阵运算、SVD、特征分解
- **生态基石**：pandas / SciPy / scikit-learn / PyTorch 都基于 NumPy

**五大特性**：
1. **ndarray**：C 连续内存的 N 维数组，支持 dtype 强类型
2. **向量化**：`a + b` / `a * b` 直接对整数组操作
3. **广播**：shape 兼容的数组自动扩展维度
4. **索引切片**：布尔索引、花式索引、多维切片
5. **线性代数**：`np.linalg` 模块覆盖 BLAS/LAPACK

**性能对比**（100万元素加法）：

| 方式 | 耗时 | 加速比 |
|---|---|---|
| Python list | 50ms | 1x |
| NumPy 向量化 | 0.5ms | 100x |
| Numba JIT | 0.3ms | 150x |
| C 循环 | 0.1ms | 500x |

## 二、架构思维导图

```mermaid
mindmap
  root((NumPy 架构))
    核心对象
      ndarray
        N 维数组
        dtype 数据类型
        shape 形状
        strides 步长
        ndim 维度
        size 元素数
        itemsize 单元素字节
        nbytes 总字节
        data 内存指针
      dtype
        int8/16/32/64
        uint8/16/32/64
        float16/32/64
        complex64/128
        bool
        object
        string unicode
        datetime64
    创建
      array
        从 list
      zeros ones empty
      full
      arange
      linspace
      logspace
      eye identity
      diag
      zeros_like
        ones_like
      random
        rand randn
        randint
        choice
        seed
    形状
      reshape
      flatten
      ravel
      transpose T
      swapaxes
      moveaxis
      broadcast_to
      expand_dims
      squeeze
    索引
      基础
        a[i]
        a[i][j]
        a[i, j]
      切片
        a[1:5]
        a[:, 1]
      布尔
        a[a > 0]
      花式
        a[[1,3,5]]
      高级
        np.ix_
        np.take
        np.compress
    数学
      基础
        + - * /
        // %
        **
      三角
        sin cos tan
        arcsin
      指数对数
        exp log
        log2 log10
      聚合
        sum mean std
        min max
        argmin argmax
        cumsum cumprod
      四舍五入
        floor ceil
        round
      线性代数
        np.linalg
        dot matmul
        inv det
        eig svd
        solve lstsq
        norm
    广播
      规则
        维度对齐
        size 1 扩展
        缺失维度补1
      兼容
        (3,4)+(4,)→(3,4)
        (3,1)+(1,4)→(3,4)
    文件
      loadtxt
      genfromtxt
      savetxt
      load
        .npy .npz
      fromfile
    高级
      内存布局
        C contiguous
        F contiguous
      视图 vs 副本
        视图共享内存
        副本独立
      structured array
        异构字段
      masked array
        缺失值
      ufunc
        自定义 C 函数
    性能
      向量化
      内存连续
      dtype 选择
      避免复制
      out 参数
      einsum
        爱因斯坦求和
    生态
      pandas
      SciPy
      scikit-learn
      PyTorch
      TensorFlow
      Matplotlib
```

## 三、关键代码

### 1. ndarray 基础

```python
import numpy as np

# 1. 创建
a = np.array([1, 2, 3, 4, 5])              # 1D
b = np.array([[1, 2], [3, 4]])             # 2D
c = np.zeros((3, 4))                        # 全 0
d = np.ones((2, 3, 4), dtype=np.float32)   # 全 1
e = np.empty((3, 3))                        # 未初始化（最快）
f = np.full((2, 2), 7)                      # 填充
g = np.arange(0, 10, 2)                     # [0, 2, 4, 6, 8]
h = np.linspace(0, 1, 5)                    # [0, 0.25, 0.5, 0.75, 1]
i = np.eye(3)                               # 单位矩阵
j = np.random.randn(2, 3)                   # 正态分布
k = np.random.randint(0, 10, (3, 4))        # 随机整数

# 2. 属性
print(a.shape)         # (5,)
print(a.dtype)         # int64
print(a.ndim)          # 1
print(a.size)          # 5
print(a.itemsize)      # 8
print(a.nbytes)        # 40
print(a.strides)       # (8,)

# 3. 改变形状
arr = np.arange(12)
print(arr.reshape(3, 4))        # → (3, 4)
print(arr.reshape(3, -1))       # -1 自动推断
print(arr.ravel())              # 展平，返回视图
print(arr.flatten())            # 展平，返回副本
arr.shape = (3, 4)              # 直接修改
arr.resize((2, 6))              # 原地改变大小

# 4. 转置
mat = np.arange(6).reshape(2, 3)
print(mat.T)                    # (3, 2)
print(mat.transpose(1, 0))      # 等价

# 5. 类型转换
arr = np.array([1, 2, 3])
arr_float = arr.astype(np.float32)  # 显式转换
print(arr_float.dtype)
```

**解析**：
- **dtype 强类型**：比 Python list 节省 10 倍内存（int64 8 字节 vs list 28 字节）
- **`.reshape` vs `.resize`**：reshape 返回新数组，resize 原地修改
- **`.ravel` vs `.flatten`**：ravel 视图（共享内存），flatten 副本（独立）
- **`.astype()`** 默认复制；想避免复制可用 `.view()`

### 2. 索引与切片

```python
arr = np.arange(10) ** 2
# array([0, 1, 4, 9, 16, 25, 36, 49, 64, 81])

# 1. 基础索引
print(arr[0])              # 0
print(arr[-1])             # 81
print(arr[2:5])            # [4, 9, 16]

# 2. 布尔索引
mask = arr > 50
print(arr[mask])           # [64, 81]
print(arr[arr % 2 == 0])  # [0, 4, 16, 36, 64]

# 3. 花式索引
print(arr[[0, 3, 5]])      # [0, 9, 25]

# 4. 多维
mat = np.arange(12).reshape(3, 4)
print(mat[1, 2])           # 第 2 行第 3 列 = 6
print(mat[:, 1])           # 第 2 列
print(mat[1:3, 1:3])       # 子矩阵
print(mat[[0, 2], :])      # 第 0、2 行
print(mat[[0, 1], [0, 3]]) # (0,0) (1,3)

# 5. np.where 条件选择
arr = np.array([1, -2, 3, -4, 5])
result = np.where(arr > 0, arr, 0)  # 负数置 0
print(result)  # [1 0 3 0 5]

# 6. 高级索引：ix_ 网格
a = np.array([1, 2, 3])
b = np.array([10, 20, 30])
print(a[np.ix_([0, 1, 2], [0, 1, 2])])  # 笛卡尔积索引
```

**解析**：
- **布尔索引是 NumPy 杀手锏**：`arr[arr > 0]` 一行完成 Python 循环 5 行才能做的事
- **花式索引**用整数数组选择任意位置
- **`.ix_()`** 把 1D 索引转成网格索引

### 3. 广播机制

```python
# 1. 标量广播
a = np.array([1, 2, 3])
print(a + 10)  # [11, 12, 13]

# 2. 1D 广播到 2D
A = np.ones((3, 4))
b = np.array([1, 2, 3, 4])  # shape (4,)
print(A + b)
# [[2, 3, 4, 5],
#  [2, 3, 4, 5],
#  [2, 3, 4, 5]]

# 3. 列向量广播
A = np.ones((3, 4))
b = np.array([[1], [2], [3]])  # shape (3, 1)
print(A + b)
# [[2, 2, 2, 2],
#  [3, 3, 3, 3],
#  [4, 4, 4, 4]]

# 4. 两个数组广播
a = np.array([1, 2, 3])      # (3,)  → (1, 3)
b = np.array([[10], [20]])   # (2, 1) → (2, 1)
print(a + b)
# [[11, 12, 13],
#  [21, 22, 23]]

# 5. 显式广播
a = np.array([1, 2, 3])
b = np.broadcast_to(a[:, None], (3, 4))  # (3, 1) → (3, 4)
print(b)

# 6. 不兼容
try:
    a = np.ones((3, 4))
    b = np.ones((3,))  # shape (3,)
    a + b  # ValueError
except ValueError as e:
    print(e)
```

**广播规则**：
1. 从右往左对齐维度
2. 维度 size 为 1 的可扩展为任意 size
3. 维度缺失的视为 size 1
4. 都不匹配则报错

### 4. 线性代数

```python
# 1. 矩阵乘法
A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
print(A @ B)                          # 矩阵乘法
print(np.dot(A, B))                   # 等价
print(np.matmul(A, B))                # 等价

# 2. 矩阵分解
A = np.random.randn(3, 3)
A_sym = A @ A.T                       # 对称矩阵

# 特征分解
eigvals, eigvecs = np.linalg.eig(A_sym)
print('特征值:', eigvals)
print('特征向量:', eigvecs)

# SVD
U, S, Vt = np.linalg.svd(A)
print('奇异值:', S)

# 3. 解线性方程组
# A x = b
A = np.array([[3, 1], [1, 2]])
b = np.array([9, 8])
x = np.linalg.solve(A, b)
print('解:', x)  # [2, 3]
# 验证
print(A @ x)  # [9, 8]

# 4. 最小二乘
x = np.array([1, 2, 3, 4, 5])
y = np.array([2.1, 3.9, 6.1, 7.8, 10.2])
A = np.vstack([x, np.ones(len(x))]).T
m, c = np.linalg.lstsq(A, y, rcond=None)[0]
print(f'y = {m:.2f}x + {c:.2f}')

# 5. 求逆与行列式
A = np.array([[1, 2], [3, 4]])
print('逆矩阵:\n', np.linalg.inv(A))
print('行列式:', np.linalg.det(A))

# 6. 范数
x = np.array([3, 4])
print('L2 范数:', np.linalg.norm(x))  # 5
print('L1 范数:', np.linalg.norm(x, ord=1))  # 7
```

**解析**：
- **`@` 操作符** 是 Python 3.5+ 推荐的矩阵乘法
- **`np.linalg.solve`** 比 `inv(A) @ b` 数值稳定（不要显式求逆再乘）
- **SVD** 是降维/推荐系统/图像压缩的核心
- **最小二乘** 是线性回归的数学基础

### 5. 向量化与性能

```python
import time

# 1. 循环 vs 向量化
n = 10_000_000
a = np.random.randn(n)
b = np.random.randn(n)

# Python 循环
start = time.time()
c = []
for i in range(n):
    c.append(a[i] + b[i])
print(f'Python 循环: {time.time() - start:.2f}s')

# NumPy 向量化
start = time.time()
c = a + b
print(f'NumPy 向量化: {time.time() - start:.2f}s')

# 2. 通用函数（ufunc）
arr = np.arange(10)
print(np.sqrt(arr))         # 元素级开方
print(np.exp(arr))          # 元素级 exp
print(np.sin(arr))          # 元素级 sin

# 3. 聚合（沿轴）
mat = np.arange(12).reshape(3, 4)
print(mat.sum())            # 全和
print(mat.sum(axis=0))      # 每列求和
print(mat.sum(axis=1))      # 每行求和

# 4. einsum：爱因斯坦求和
# 'ij,jk->ik' = A @ B
A = np.random.randn(3, 4)
B = np.random.randn(4, 5)
C = np.einsum('ij,jk->ik', A, B)
print(np.allclose(C, A @ B))  # True

# 'bij,bjk->bik' = batch 矩阵乘
A = np.random.randn(2, 3, 4)
B = np.random.randn(2, 4, 5)
C = np.einsum('bij,bjk->bik', A, B)

# 5. out 参数（避免分配）
result = np.empty_like(a)
np.add(a, b, out=result)  # 不创建新数组
```

**解析**：
- **向量化是 NumPy 性能核心**：100 万元素操作 0.5ms vs Python 循环 50ms
- **ufunc 是 C 级别函数**：所有基础数学函数都用 C 实现，速度极快
- **einsum** 表达力强且高效，是深度学习框架（PyTorch）的核心操作
- **`.out=`** 参数避免分配新数组，节省内存 + 提升性能

## 四、核心洞察

1. **NumPy 是 Python 数据科学的"汇编"**：所有高级库（pandas/PyTorch）底层都走 NumPy；理解 NumPy 才能理解生态。
2. **向量化思维是关键**：避免 Python 循环，思考"对整数组做什么"而非"对每个元素做什么"。
3. **连续内存是性能基础**：C order / F order 影响缓存命中率；reshape / transpose 都要考虑内存布局。
4. **dtype 选择影响性能与精度**：`int8` 比 `int64` 省 8 倍内存；`float32` 训练比 `float64` 快 2-4 倍（精度足够）。
5. **广播是 NumPy 范式魔法**：避免 `.reshape` 和显式复制，代码更简洁、更高效。
6. **视图 vs 副本容易踩坑**：`.view()` 共享内存（修改互相影响），`.copy()` 独立；新手常因误解导致 bug。
7. **einsum 表达力惊人**：比 @ / matmul 灵活，深度学习框架核心操作；熟练使用能写出非常简洁的高维运算。
8. **NumPy 性能上限**：纯 Python 包装，C 实现的 ufunc 才是性能来源；想突破可用 Numba / Cython / C 扩展。

## 五、跨项目引用

- [./pandas.md](./pandas.md) — pandas 在 NumPy 之上加了表格抽象
- [./pytorch.md](./pytorch.md) — PyTorch Tensor 与 NumPy 互操作（`.numpy()` / `torch.from_numpy()`）
- [./tensorflow.md](./tensorflow.md) — TF Tensor 底层走 NumPy-like 实现
- [./scikit-learn.md](./scikit-learn.md) — sklearn 输入都是 NumPy 数组
- [./scipy.md](./scipy.md) — SciPy 基于 NumPy 提供科学计算（优化、信号、统计）
- [./matplotlib.md](./matplotlib.md) — Matplotlib 用 NumPy 数组作数据源
- [./transformers.md](./transformers.md) — Transformers 内部表示是 NumPy/Torch tensor
- [./langchain.md](./langchain.md) — LangChain Embeddings 返回 NumPy 数组
