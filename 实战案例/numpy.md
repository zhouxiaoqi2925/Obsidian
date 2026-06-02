# NumPy - Python 科学计算的基石库

**GitHub**: numpy/numpy
**Star**: 29k+
**语言**: C (核心) + Python + Cython
**主题**: python、scientific-computing、c、cython、ndarray
**适用场景**: 数据科学、机器学习、信号处理、科学研究的高性能数值计算

---

## 一、基础范式

### 模式 1 · ndarray 内存布局（C 连续 vs Fortran 连续）

**问题场景**：Python list 存异构数据慢，NumPy 需要同构数据连续内存以利用 SIMD 和缓存。

**解决方案**：`ndarray` 在 `numpy/_core/src/multiarray/` 用 C 实现，C 连续（row-major，最后一维最快）默认；Fortran 连续（column-major）通过 `order='F'` 指定；内存用 `data` 指针 + `strides` 步长数组表达，零拷贝切片。

**关键参数**：
- `arr.shape` 形状元组
- `arr.strides` 步长字节
- `arr.flags['C_CONTIGUOUS']` 判断
- `arr.data` 内存指针
- `arr.itemsize * arr.strides` = 内存布局

**最佳实践**：默认 C 连续够用；BLAS/LAPACK 调用需要 Fortran 连续；RNN/LSTM 内部矩阵乘用 Fortran 连续快 2x。

### 模式 2 · ufunc 通用函数 + 广播

**问题场景**：`for i in range(len(a)): b[i] = a[i] + 1` 比 C 慢 100 倍。

**解决方案**：`ufunc` (universal function) 是 NumPy 的核心抽象，`numpy.add(a, b)` 走 C 循环 + SIMD + 缓存优化；`broadcasting` 让不同 shape 数组自动对齐（`(3,4) + (4,)` → `(3,4)`）。

**关键参数**：
- `np.add` / `np.subtract` / `np.multiply` 100+ ufunc
- `np.frompyfunc` 自定义 ufunc
- `np.vectorize` Python 函数包装
- `a + b` 走 `__add__` → ufunc
- 广播规则：右对齐 + dim=1 扩展

**最佳实践**：所有向量化运算都用 ufunc 而非 Python 循环，性能提升 10-100x。

### 模式 3 · dtype 类型系统

**问题场景**：Python 动态类型不适合科学计算，需要静态类型优化。

**解决方案**：`dtype` 描述数组元素类型（int8/16/32/64, float16/32/64, complex64/128），存储在 ndarray 头部，决定内存布局和 SIMD 指令选择；v2.0 重写 dtype 系统用 DType API。

**关键参数**：
- `np.dtype('float32')`
- `np.dtype([('x', 'f4'), ('y', 'f4')])` 结构化
- `arr.astype('int32')` 类型转换
- `dtype.itemsize` 字节
- v2.0 DType API

**最佳实践**：ML 推理用 float32（够用 + 快 2x），训练用 float16/bfloat16（节省显存），金融用 float64（精度）。

### 模式 4 · 切片 vs 视图 vs 拷贝

**问题场景**：误用拷贝导致内存翻倍；误用视图导致意外修改原数据。

**解决方案**：`a[1:3]` 返回 view（共享内存，零拷贝）；`a[1:3].copy()` 返回独立拷贝；`a[[1,2,3]]` 走 fancy indexing 返回拷贝；`np.shares_memory(a, b)` 判断。

**关键参数**：
- `a[1:3]` view
- `a[1:3].copy()` copy
- `a[[1,2]]` fancy index copy
- `a[mask]` boolean mask copy
- `arr.base is None` 是否独立

**最佳实践**：默认用 view，遇到「修改切片影响原数据」bug 时再显式 copy。

### 模式 5 · 矩阵运算 + BLAS/LAPACK 链接

**问题场景**：手写矩阵乘性能差。

**解决方案**：NumPy 在 `numpy/_core/src/multiarray/` 用 C 实现 dot / matmul，内部走 BLAS/LAPACK（CBLAS 库）；OpenBLAS / Intel MKL / Apple Accelerate 三个后端，自动发现并链接。

**关键参数**：
- `np.dot(a, b)` 矩阵乘
- `a @ b` Python 3.5+ 运算符
- `np.linalg.inv` / `np.linalg.svd` LAPACK
- OpenBLAS 多线程
- MKL 单线程更快

**最佳实践**：科学计算部署用 MKL（Intel CPU），Apple Silicon 用 Accelerate，服务器用 OpenBLAS 多线程。

---

## 二、扩展范式

### 模式 6 · 随机数（np.random + Generator API）

**问题场景**：`np.random.seed()` 单一全局状态，v1.17+ 重构为 Generator API。

**解决方案**：`np.random.default_rng(seed)` 创建设备无关的 Generator 对象；`rng.normal(0, 1, 1000)` 生成样本；`rng.integers(0, 100, size=10)` 整数；`rng.choice(a, size=10, replace=False)` 采样。

**关键参数**：
- `default_rng(42)` 种子
- `rng.normal()` / `rng.uniform()` 分布
- `rng.integers()` 整数
- `rng.choice()` 采样
- `rng.permutation()` 排列

**最佳实践**：新代码统一用 `default_rng()`，放弃 `np.random.seed()` 全局状态。

### 模式 7 · 线性代数（np.linalg）

**问题场景**：特征值、奇异值分解、Cholesky 分解等数学运算。

**解决方案**：`np.linalg` 模块包装 LAPACK Fortran 库，提供 30+ 函数：inv / pinv / det / eig / eigh / svd / qr / cholesky / lstsq / norm / solve。

**关键参数**：
- `np.linalg.inv(A)` 求逆
- `np.linalg.eig(A)` 特征值
- `np.linalg.svd(A)` 奇异值
- `np.linalg.cholesky(A)` Cholesky
- `np.linalg.norm(a)` 范数

**最佳实践**：线性代数调用走 np.linalg 而非 scipy.linalg（更轻量）。

### 模式 8 · FFT（np.fft）

**问题场景**：信号处理、卷积、频谱分析需要快速傅里叶变换。

**解决方案**：`np.fft` 模块包装 FFTPACK C 库，提供 fft / ifft / fft2 / fftn / rfft / irfft / fftfreq / ifftshift 一维和高维 FFT。

**关键参数**：
- `np.fft.fft(x)` 一维 FFT
- `np.fft.fft2(x)` 二维 FFT
- `np.fft.rfft(x)` 实数 FFT
- `np.fft.fftfreq(n, d=1.0)` 频率
- `np.fft.ifft(x)` 逆 FFT

**最佳实践**：实数信号用 rfft 节省一半内存；卷积用 FFT 加速 O(n log n)。

### 模式 9 · 结构化数组 + 记录数组

**问题场景**：异构列（id/name/age）用 ndarray 表达麻烦。

**解决方案**：`np.dtype([('id', 'i4'), ('name', 'U32'), ('age', 'i4')])` 定义结构化类型；`np.rec.fromrecords()` 创建记录数组；字段访问 `rec['name']` 或 `rec.name`。

**关键参数**：
- 结构化 dtype
- 字段命名
- `np.recarray` 子类
- 视图模式
- 排序 `np.sort(rec, order='age')`

**最佳实践**：简单异构数据用结构化数组，复杂数据用 pandas DataFrame。

### 模式 10 · Cython 加速 numpy 边界

**问题场景**：自定义算法在 Python 循环里慢。

**解决方案**：用 Cython 写 `.pyx` 文件，typed memoryview 访问 ndarray 数据；`cimport numpy as cnp` 静态类型；`@cython.boundscheck(False)` 关闭边界检查。

**关键参数**：
- `cimport numpy as cnp`
- `cnp.ndarray[float, ndim=2]`
- typed memoryview
- 编译 `.pyx` → `.so`
- 10-100x 加速

**最佳实践**：性能关键算法用 Cython 包装 numpy 数组，比纯 Python 快 50-100x。

---

## 三、进阶范式

### 模式 11 · Meson 构建系统替代 setuptools

**问题场景**：setuptools 编译 C 扩展慢且脆弱，跨平台困难。

**解决方案**：v1.26+ NumPy 迁移到 Meson 构建系统，`meson.build` + `meson.options` 描述编译选项，`spin build` / `spin test` 命令封装。

**关键参数**：
- `meson.build` 顶层
- `meson.options` 编译选项
- `spin build` / `spin test`
- 跨平台 Windows/Linux/macOS
- vendored-meson 内嵌

**最佳实践**：C 扩展库都用 Meson，构建速度比 setuptools 快 5x。

### 模式 12 · SIMD 抽象层（numpy/_core/src/simd）

**问题场景**：不同 CPU 支持不同 SIMD 指令（SSE/AVX/AVX512/NEON），手动选择复杂。

**解决方案**：`numpy/_core/src/simd/simd.h` 提供 SIMD 抽象层，`simd::float32` 跨平台类型，编译时根据 CPU 自动选择 SSE4.2 / AVX2 / AVX512 / NEON。

**关键参数**：
- `simd.h` 抽象层
- SIMD 4 字节向量
- 编译时选择
- 跨平台 SSE/AVX/NEON
- 30+ 指令

**最佳实践**：性能关键库都用 SIMD 抽象层，跨平台 + 性能两手抓。

### 模式 13 · ufunc Dispatching + umath 子系统

**问题场景**：NumPy + SciPy + pandas 各自定义 dtype 类型，ufunc 怎么 dispatch 到正确实现？

**解决方案**：`numpy/_core/code_generators/umath_dispatching/` 模板系统，ufunc 根据 dtype 走 NEP-50 协议，array_api + DType API 让第三方扩展注册自定义实现。

**关键参数**：
- NEP-50 协议
- `__array_function__` dispatch
- `__array_ufunc__` dispatch
- DType API
- PyTorch 0.4+ / CuPy / JAX 互操作

**最佳实践**：扩展 dtype 时实现 `__array_ufunc__` + `__array_function__`，无缝集成 SciPy/pandas。

### 模式 14 · 内存对齐 + Cache 友好

**问题场景**：ndarray 运算内存带宽瓶颈。

**解决方案**：对齐 64 字节（SSE 16 / AVX 32 / AVX512 64）；`arr.flags['ALIGNED']` 判断；`np.empty(64).ctypes.data` 分配对齐；非对齐数据 SIMD 退化为标量。

**关键参数**：
- 64 字节对齐
- C_CONTIGUOUS 连续
- L1/L2 缓存行
- `np.copyto` 直接内存拷贝
- `arr.tolist()` 转 Python list

**最佳实践**：避免 `arr.T`（产生 view）和 `arr.flatten()`（拷贝）的混合，性能差 5x。

### 模式 15 · Array API 标准 + DType API

**问题场景**：NumPy / CuPy / PyTorch / JAX 各自 API 不一致。

**解决方案**：Python Array API 标准（2022 公布）定义统一 API；NumPy 2.0 实现 `numpy.array_api` 兼容子集；DType API 让第三方注册新类型。

**关键参数**：
- Array API 标准
- `numpy.array_api` 子模块
- DType API
- NEP-47 / NEP-50
- v2.0 标志

**最佳实践**：新代码用 `np.array_api` 命名空间，未来跨库迁移无痛。

---

## 四、实战范式

### 模式 16 · 5 类常用函数速查

**问题场景**：NumPy 600+ 函数，临时查文档耗时。

**解决方案**：5 类速查：① 数组创建（empty/zeros/ones/arange/linspace/eye）② 数组操作（reshape/transpose/flatten/concatenate/stack）③ 数学（sum/mean/std/max/min/argmax）④ 线性代数（dot/matmul/inv/eig/svd）⑤ 随机（default_rng/normal/uniform/integers/choice）。

**关键参数**：
- `np.zeros((3,4))` 创建
- `a.reshape(2,6)` 变形
- `np.sum(a, axis=0)` 沿轴求和
- `np.linalg.inv(A)` 求逆
- `rng.normal(0, 1, 100)` 采样

**最佳实践**：速查 5 类覆盖 90% 场景，剩下的 10% 查官方文档。

### 模式 17 · 与 pandas / SciPy / scikit-learn / PyTorch 协作

**问题场景**：NumPy 是底层，pandas / SciPy / scikit-learn / PyTorch 各自封装。

**解决方案**：DataFrame.values 转 ndarray；ndarray 转 torch.tensor 用 `torch.from_numpy(np_arr)`（共享内存！）；scipy.sparse 与 ndarray 互转；sklearn 接受 ndarray 也返回 ndarray。

**关键参数**：
- `df.values` ndarray
- `torch.from_numpy(arr)` 共享
- `sparse.csr_matrix(arr)` 稀疏
- `X_train, y_train = ...`
- `model.predict(X_test)`

**最佳实践**：PyTorch 训练用 `from_numpy` 共享内存，避免 CPU→GPU 重复拷贝。

### 模式 18 · 性能优化 7 招

**问题场景**：Python 慢，NumPy 也要 7 招优化。

**解决方案**：7 招：① 向量化（用 ufunc 替循环）② contiguous（C 连续）③ float32 而非 float64 ④ in-place 操作（`+=`）⑤ 避免 reshape 链 ⑥ 用 BLAS 链接 MKL ⑦ 预分配大数组而非 concat。

**关键参数**：
- `a += 1` 而非 `a = a + 1`
- `np.dot` 而非手写
- `a.ravel()` 而非 `a.flatten()`
- 预分配 `np.empty(N)`
- SIMD 自动

**最佳实践**：80% 性能问题在向量化 + 连续内存，剩下 20% 走 Cython/Numba。

### 模式 19 · 与 MATLAB / R / Julia 对比

**问题场景**：科学计算选型在 NumPy / MATLAB / R / Julia 之间。

**解决方案**：NumPy 定位「Python 生态基础库」，适合与 sklearn / pytorch 集成；MATLAB 定位「工科教学 + 商业工具箱」，适合信号处理；R 定位「统计学家 + 学术」，适合贝叶斯；Julia 定位「科学计算原生快」，适合 HPC。

**关键参数**：
- 性能：Julia > NumPy(MKL) > MATLAB > R
- 生态：NumPy > R > MATLAB > Julia
- 学习曲线：NumPy ≈ MATLAB < R < Julia
- 商业：MATLAB > Julia > NumPy > R

**最佳实践**：机器学习/深度学习选 NumPy，统计选 R，工程选 MATLAB，HPC 选 Julia。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：从零写一个简化版 ndarray。

**解决方案**：7 天分 6 步：① C 结构体 ndarray（data/strides/shape/dtype）② Python 包装 PyArrayObject ③ 内存分配 + 引用计数 ④ ufunc 模板（C 循环）⑤ 广播规则 ⑥ 切片 view + copy。

**关键参数**：
- Day 1: C 结构体
- Day 2: Python 包装
- Day 3: 内存管理
- Day 4: ufunc
- Day 5: 广播
- Day 6: 切片
- Day 7: 文档

**最佳实践**：7 天只能做「够用 80% 场景」的 ndarray，SIMD + BLAS + 完整 dtype 系统要 1 年+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\numpy\`
- **大小**: ~50 MB
- **总文件数**: 数千 C/Python/Cython 文件
- **关键 commit**: v2.x（最大变更 dtype 系统重写）
- **团队**: NumPy Steering Council + 数十位 maintainer
- **许可**: BSD-3-Clause

## 一句话总结

NumPy 用 25 万行 C/Python/Cython 把「ndarray + ufunc + 广播 + dtype」做到极致，是 Python 数据科学生态（pandas / SciPy / scikit-learn / PyTorch）的运行时基石，所有向量化计算都通过 ufunc 调用 SIMD 加速。
