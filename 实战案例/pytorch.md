# PyTorch - 动态图深度学习框架

**来源**：GitHub https://github.com/pytorch/pytorch
**创建时间**：2026-06-02

---

## 一、核心机制与张量模型

### 1. Tensor / Storage / TensorImpl 三层分离（Three-Layer Tensor Model）

**问题场景**：NumPy 数组 view 必须复制数据；PyTorch 的 `tensor[1:3, 2:4]` 必须零拷贝且自动跟踪 autograd。**Tensor（语义） / Storage（存储） / TensorImpl（元数据）三层分离**让"语义"和"存储"解耦——多 Tensor 共享同一 Storage 是视图、切片、转置的零成本前提。

**解决方案**：
```cpp
// c10/core/Tensor.h
class Tensor {
  c10::intrusive_ptr<TensorImpl> impl_;             // 16 字节值类型
public:
  const TensorImpl* unsafeGetTensorImpl() const { return impl_.get(); }
};

// c10/core/TensorImpl.h
struct TensorImpl {
  Storage storage_;                                  // 实际数据指针 + 大小
  TensorType type_;                                  // dtype, device
  std::vector<int64_t> sizes_;                       // shape
  std::vector<int64_t> strides_;                     // 步长
  c10::optional<AutogradMetaInterface> autograd_meta_;
  // ...
};
```
**关键参数**：

| 字段 | 用途 | 大小 |
|------|------|------|
| `storage_` | 实际数据 DataPtr | 1 个 |
| `sizes_` | 维度大小 | `ndim` |
| `strides_` | 每维步长 | `ndim` |
| `dtype` | 元素类型 | 1 |
| `device` | 设备 | 1 |
| `layout` | 内存布局 | Strided/Sparse |
| `autograd_meta` | 梯度元数据 | optional |

**最佳实践**：
1. ✅ 视图/切片/转置零拷贝——只改 TensorImpl 字段
2. ✅ `tensor[1:3, 2:4]` = 新 Tensor 共享 Storage
3. ✅ `tensor.t()` 转置也是 view
4. ✅ `tensor.contiguous()` 强制连续内存
5. ✅ 不要假设 stride 一定紧凑——要调 `.is_contiguous()`

### 2. autograd 动态计算图（Dynamic Autograd Graph）

**问题场景**：TensorFlow 1.x `tf.GradientTape` 是"后置记录"——先建图再算。PyTorch 走"动态图"——每次 op 自动创建 `Node` 记录依赖，`loss.backward()` 一次拓扑遍历反传梯度。**结果是：调试时直接 `pdb` 进去，逐步执行 + 看中间值**。

**解决方案**：
```cpp
// torch/csrc/autograd/function.h
struct Node {
  std::vector<edge> next_edges_;                     // 父节点列表
  std::uint64_t sequence_nr_;                        // op 序号
  std::string name_;
  // ...
  virtual variable_list apply(variable_list&& grads) = 0;
};

// 反向流程（torch.autograd.backward()）
// 1. 从 loss.grad_fn_ 出发，DFS / BFS 收集所有 Node
// 2. 拓扑排序：得到 backward 顺序
// 3. 对每个 Node 调 apply(grad_outputs) → 累积到 Tensor.autograd_meta_.grad_
```
**关键参数**：

| 概念 | 作用 |
|------|------|
| `Node` | 一次 op 的反向函数 |
| `next_edges` | 前向输入 → 反向输出映射 |
| `sequence_nr` | 拓扑排序次序 |
| `requires_grad` | 是否记录梯度 |
| `grad_fn` | 创建该 Tensor 的 Node |
| `is_leaf` | 叶子节点（用户创建） |

**最佳实践**：
1. ✅ `with torch.no_grad():` 推理/评估——不构建图，省 30% 内存
2. ✅ `tensor.detach()` 中断梯度流
3. ✅ `loss.backward()` 一次反传，retain_graph=True 多次反传
4. ✅ `tensor.retain_grad()` 叶子节点保留 grad
5. ✅ `torch.autograd.gradcheck()` 验证自定义 op

### 3. Dispatcher 算子路由中心（Operator Router）

**问题场景**：同一个 `tensor.add()` 在 CPU / CUDA / MPS / ROCm / XPU 都要有实现，在 float32 / float16 / bfloat16 / int8 都要工作。Python 端写 `if device == 'cuda': ...` 是噩梦。**Dispatcher** = 一个 op 多 kernel，按 DispatchKey 集合路由。

**解决方案**：
```cpp
// c10/core/Dispatcher.h
class TORCH_API OperatorHandle {
  c10::Schema schema_;
  std::array<KernelFunction, num_kernels()> kernels_;
public:
  template <typename... Args>
  Tensor call(Args&&... args) {
    auto& stack = ...;
    // 1. 拿 dispatch key set（从 Tensor 算）
    auto keys = ...;
    // 2. 选 kernel
    auto& kernel = pickKernel(keys);
    // 3. 调 kernel
    return kernel.call(stack);
  }
};

// 用法（ATen 端）
Tensor add(const Tensor& self, const Tensor& other, const Scalar& alpha) {
  return at::add(self, other, alpha);  // 调 dispatcher
}

// 注册（cpu 实现）
m.def("add(Tensor self, Tensor other, Scalar alpha=1) -> Tensor");
m.impl("add", torch::dispatch::DispatchKeySet(torch::DispatchKey::CPU).backend_kernel(),
       &add_cpu_kernel);
```
**关键参数**：

| DispatchKey | 用途 |
|-------------|------|
| `CPU` | CPU 后端 |
| `CUDA` | CUDA 后端 |
| `MPS` | Apple GPU |
| `ROCm` | AMD GPU |
| `XPU` | Intel GPU |
| `QuantizedCPU` | 量化 CPU |
| `SparseCPU` | Sparse CPU |
| `Meta` | Fake（形状） |
| `Autograd` | autograd 包装 |
| `Functionalize` | 函数式化包装 |
| `JIT` | TorchScript |
| `BackendSelect` | backend 选择 |
| `Lazy` | lazy 评估 |

**最佳实践**：
1. ✅ Python 端不写 if-else，让 dispatcher 路由
2. ✅ 注册 kernel 用 `m.impl("op_name", dispatch_keys, &func)`
3. ✅ Schema 由 codegen 生成（`tools/codegen/`）
4. ✅ 自定义 op 也走 dispatcher
5. ✅ Meta kernel 给 fake tensor（无数据但有 shape）走

### 4. DispatchKeySet 多维分发（Multi-Dim Dispatch）

**问题场景**：一个 Tensor 同时有 `{CUDA, Strided, float, autograd}` 多个 key，Dispatcher 找"最匹配"的 kernel。朴素的"按 key 查多维表"慢，**DispatchKeySet 用位图 + 优先级**——一次位操作找到匹配 kernel。

**解决方案**：
```cpp
// c10/core/DispatchKeySet.h
class DispatchKeySet {
  std::bitset<kNumDispatchKeys> keys_;               // 位图
public:
  bool has(DispatchKey k) const { return keys_[k]; }
  DispatchKeySet add(DispatchKey k) const;
  
  // 高层 API：取最高优先级 key
  DispatchKey highestPriority() const;
};

// 用法
DispatchKeySet key_set({
  DispatchKey::CUDA,           // 0b0000_0010
  DispatchKey::Strided,        // 0b0000_0100
  DispatchKey::Float,          // 0b0001_0000
  DispatchKey::Autograd,       // 0b0010_0000
});
```
**关键参数**：

| 操作 | 行为 |
|------|------|
| `add(key)` | 插入 key |
| `remove(key)` | 移除 key |
| `has(key)` | 检查 key |
| `highestPriority()` | 取最高优先级 |
| `iterator` | 遍历所有 key |
| 优先级 | `Autograd > Backend > Layout > dtype` |

**最佳实践**：
1. ✅ 高优先级 kernel（autograd）拦截底层 kernel
2. ✅ Meta kernel 优先级高——fake tensor 优先走 Meta
3. ✅ Functionalize 拦截所有算子做不可变包装
4. ✅ Backend 在中间——避免 backend 之间的 cross-call
5. ✅ dtype 优先级最低——dtype 转换走 cast kernel

### 5. THPVariable Python 包装（pybind11 Bridge）

**问题场景**：Python 端 `torch.Tensor` 是个对象，要调 C++ `c10::Tensor`。pybind11 把 C++ 类暴露成 Python 类，但**C++ ↔ Python 的引用计数 / 内存管理 / GIL 必须手动协调**。`THPVariable` 是 `c10::Tensor` 的 Python 包装。

**解决方案**：
```cpp
// torch/csrc/autograd/python_variable.h
struct THPVariable {
  PyObject_HEAD                                          // PyObject 头
  c10::Tensor cdata;                                     // 16 字节 tensor
};

// 创建
THPVariable* THPVariable_NewWithTensor(const c10::Tensor& tensor) {
  auto obj = (THPVariable*)THPVariable_Type.tp_alloc(&THPVariable_Type, 0);
  new (&obj->cdata) c10::Tensor(tensor);
  return obj;
}

// 释放（refcount 走 c10::intrusive_ptr）
void THPVariable_dealloc(THPVariable* self) {
  self->cdata.~Tensor();
  Py_TYPE(self)->tp_free(self);
}
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `cdata` | C++ Tensor 副本（16 字节） |
| `_grad_fn` | 指向 autograd Node（Python 端） |
| `_is_view` | 是否视图 |
| `_version` | 版本号（inplace 检查） |
| `data_ptr()` | 原始指针 |

**最佳实践**：
1. ✅ Python 端 tensor 是 `THPVariable` 包装
2. ✅ `.detach()` 切断 autograd 链
3. ✅ `tensor._version` 跟踪 inplace 变更
4. ✅ `tensor.data_ptr()` 拿原始指针（用于外部 C++ 库）
5. ✅ GIL 在 pybind 边界自动获取/释放

---

## 二、编译栈与后端架构

### 6. torch.compile 字节码级编译（Bytecode-level Tracing）

**问题场景**：JAX 的 `jit` 是"函数级"编译，PyTorch 想要同等能力但保持动态图灵活。**`torch.compile`** 用 Dynamo 拦截 Python 字节码，把 `def f(x): return x + 1` 转成 FX graph，再交 Inductor 编 Triton/C++。**40% 性能提升**且不改用户代码。

**解决方案**：
```python
# torch/_dynamo/eval_frame.py 字节码级 hook
import torch

@torch.compile
def f(x):
    return torch.relu(x @ x.T)

x = torch.randn(3, 3)
y = f(x)                                              # 第一次：tracing + 编译
y = f(x)                                              # 第二次：cache 命中

# 内部流程
# 1. CPython EvalFrame hook 拦截 f 的调用
# 2. Dynamo 把字节码流转成 FX Graph
# 3. AOTAutograd 拆前向/反向图
# 4. Inductor 把 FX Graph 编成 Triton / C++ kernel
# 5. 编译结果 cache 到 dynamo_cache
```
**关键参数**：

| 概念 | 作用 |
|------|------|
| `Dynamo` | 字节码 → FX Graph |
| `AOTAutograd` | 拆前向/反向图 |
| `Inductor` | FX Graph → Triton / C++ |
| `FX Graph` | PyTorch 内部 IR |
| `dynamo_cache` | 编译结果 cache |
| `compile(mode)` | `default` / `reduce-overhead` / `max-autotune` |
| `backend` | `inductor` / `eager` / `aot_eager` |

**最佳实践**：
1. ✅ `torch.compile(model)` 一行提速 30-50%
2. ✅ `mode="reduce-overhead"` 配 CUDA Graph 省开销
3. ✅ `mode="max-autotune"` 长跑训练用，找最优 kernel
4. ✅ `dynamic=True` 处理变长输入（NLP）
5. ✅ 失败的 op 标 `torch._dynamo.allow_in_graph` 跳过

### 7. Inductor Triton 代码生成（Triton Code Gen）

**问题场景**：传统手写 CUDA kernel 难维护、专家级。**Inductor** 把 FX graph 转成 Triton 代码（Python 方言的 GPU 编程），自动融合（fuse）小 op、自动调优。**比手写 CUDA 慢 10%，但比纯 Python 调度快 30x**。

**解决方案**：
```python
# torch._inductor 生成代码示例
@triton.jit
def fused_relu_mm_kernel(
    x_ptr, w_ptr, out_ptr,
    M, N, K,
    BLOCK_M: tl.constexpr, BLOCK_N: tl.constexpr, BLOCK_K: tl.constexpr,
):
    pid = tl.program_id(0)
    grid_m = tl.cdiv(M, BLOCK_M)
    grid_n = tl.cdiv(N, BLOCK_N)
    # ... 矩阵乘 + ReLU 融合
```

**关键参数**：

| 概念 | 作用 |
|------|------|
| `Triton` | Python 方言 GPU 编程 |
| `JIT` | runtime 编译 |
| `Kernel` | 一段 GPU 代码 |
| `Autotune` | 自动找最优 tile 大小 |
| `Coalesce` | 内存访问合并 |
| `Fuse` | 多 op 融合成单 kernel |

**最佳实践**：
1. ✅ `mode="max-autotune"` 让 Inductor 充分优化
2. ✅ 失败 op 加 `torch._inductor.config.fallback_random` 调试
3. ✅ `torch._inductor.config.triton.unique_kernel_names = True` 避免名字冲突
4. ✅ 看 `torch._dynamo.utils.compile_times()` 监控编译耗时
5. ✅ 配合 `torch.cuda.empty_cache()` 释放编译期内存

### 8. 后端实现：CPU / CUDA / MPS / ROCm / XPU（Multi-Backend）

**问题场景**：单一 backend 不能跨平台。**ATen native/** 是多 backend 实现目录——`native/cpu/` / `native/cuda/` / `native/mps/` / `native/rocm/` / `native/xpu/`。每个 op 都有 N 个 kernel，由 Dispatcher 选。

**解决方案**：
```cpp
// aten/src/ATen/native/native_functions.yaml
- func: add(Tensor self, Tensor other, Scalar alpha=1) -> Tensor
  dispatch:
    CPU: add_cpu
    CUDA: add_cuda
    MPS: add_mps
    QuantizedCPU: add_quantized_cpu
    Meta: add_meta

// 选 kernel 时
// Dispatcher 看 Tensor 的 DispatchKey 集合
// {CUDA, Strided, float, Autograd}
// 优先走 Autograd → CUDA → Strided → float
// 最后落到 add_cuda_kernel
```
**关键参数**：

| Backend | 硬件 | 头文件 |
|---------|------|--------|
| CPU | x86_64 / ARM | `aten/src/ATen/native/cpu/` |
| CUDA | NVIDIA GPU | `aten/src/ATen/native/cuda/` |
| MPS | Apple GPU | `aten/src/ATen/native/mps/` |
| ROCm | AMD GPU | `aten/src/ATen/native/rocm/` |
| XPU | Intel GPU | `aten/src/ATen/native/xpu/` |
| QuantizedCPU | 量化 CPU | `aten/src/ATen/native/quantized/cpu/` |
| Meta | fake tensor | `aten/src/ATen/native/meta/` |

**最佳实践**：
1. ✅ Meta kernel 提供"无数据有形状"实现——让 lazy graph 走通
2. ✅ CPU / CUDA / MPS 都有现成 kernel
3. ✅ 加新 backend 走 dispatcher 注册
4. ✅ 跨 backend 数据搬运用 `tensor.to(device)` 显式
5. ✅ `torch.backends.cuda.preferred_blas_library = "cublaslt"` 调 cuBLAS

### 9. 量化与稀疏（Quantization & Sparsity）

**问题场景**：模型部署时 fp32 → int8 可省 4x 内存 + 加速。PyTorch 量化分训练后量化（PTQ）、量化感知训练（QAT）、动态量化。**QInt8 / QUInt8 dtype + 独立 QuantizedCPU / QuantizedCUDA kernel**。

**解决方案**：
```python
import torch
from torch.ao.quantization import get_default_qconfig, quantize_dynamic

# 动态量化（lstm / linear）
model_int8 = quantize_dynamic(
    model, {nn.Linear, nn.LSTM}, dtype=torch.qint8
)

# 静态量化（CNN）
model.qconfig = get_default_qconfig('qnnpack')
torch.ao.quantization.prepare(model, inplace=True)
# 用校准数据喂几批
torch.ao.quantization.convert(model, inplace=True)
```
**关键参数**：

| 量化方案 | 用途 | 速度提升 |
|----------|------|----------|
| `dynamic` | lstm / linear | 2-4x |
| `static` (PTQ) | CNN 静态 | 2-4x |
| `static` (QAT) | CNN 训练感知 | 2-4x |
| `int8` | 大多数 | 2-4x |
| `int4` | GPTQ / AWQ | 4-8x |
| `fp16` | 推理 | 1.5-2x |
| `bf16` | 训练 | 1.5-2x |

**最佳实践**：
1. ✅ CNN 用静态量化（精度 + 速度平衡）
2. ✅ LSTM 用动态量化（无校准数据）
3. ✅ LLM 用 int4 量化（GPTQ / AWQ）
4. ✅ `torch.compile` 配合 int8 量化
5. ✅ `tensor.to(torch.float16)` 推理时省内存

### 10. 分布式训练：DDP / FSDP / DeepSpeed（DDP / FSDP / DeepSpeed）

**问题场景**：单卡装不下 70B 模型——必须多卡 / 多机并行。**DDP**（数据并行）/ **FSDP**（分片数据并行）/ **DeepSpeed**（集成 ZeRO）是三种主流方案。PyTorch 2.0+ 自带 FSDP v2 可训练 70B。

**解决方案**：
```python
# DDP - 简单数据并行
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP

dist.init_process_group("nccl")
model = DDP(model, device_ids=[local_rank])

# FSDP - 分片数据并行（70B 模型单机 8 卡）
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP

model = FSDP(model, sharding_strategy=ShardingStrategy.FULL_SHARD)

# FSDP v2（2.4+） - 简化 API
from torch.distributed.fsdp import fully_shard
model = fully_shard(model)  # 自动处理 wrap policy
```
**关键参数**：

| 维度 | DDP | FSDP | DeepSpeed |
|------|-----|------|-----------|
| 内存 | 重复全模型 | 分片 | ZeRO 灵活 |
| 通信 | AllReduce | AllGather + ReduceScatter | AllReduce + Reduce |
| 适用 | < 1B | 1B-70B+ | 70B+ |
| 速度 | 线性 | 90% 线性 | 90% 线性 |
| API 复杂度 | 低 | 中 | 中 |

**最佳实践**：
1. ✅ 单机 8 卡、模型 < 7B 用 DDP
2. ✅ 7B-70B 用 FSDP v2
3. ✅ 70B+ 用 DeepSpeed ZeRO-3
4. ✅ `torchrun --nproc_per_node=8` 启动
5. ✅ `BACKEND=nccl` 配 GPU 节点

---

## 三、性能优化与 GPU 编程

### 11. CUDA Stream 异步执行（Async Execution）

**问题场景**：CPU 调 `tensor.cuda()` 同步等 GPU 完成——整批卡死。**CUDA Stream** 让多个 kernel 并发执行；**`non_blocking=True`** 让 CPU/GPU 计算重叠。

**解决方案**：
```python
# 非阻塞拷贝
x = torch.randn(3, 3, device='cuda', pin_memory=False)  # CPU→GPU
# 等价于：
x = torch.empty(3, 3, device='cuda')
y_cpu = torch.randn(3, 3, pin_memory=True)  # pinned memory
x.copy_(y_cpu, non_blocking=True)  # CPU 不等 GPU 完成

# 多个 CUDA Stream
stream1 = torch.cuda.Stream()
stream2 = torch.cuda.Stream()

with torch.cuda.stream(stream1):
    a = compute_a()  # 在 stream1
with torch.cuda.stream(stream2):
    b = compute_b()  # 在 stream2
torch.cuda.current_stream().wait_stream(stream1)
torch.cuda.current_stream().wait_stream(stream2)
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `device` | 目标设备 |
| `non_blocking` | 异步拷贝 |
| `pin_memory` | 锁页内存（加速） |
| `Stream` | CUDA stream |
| `Event` | 同步事件 |
| `torch.cuda.synchronize()` | 强制同步 |

**最佳实践**：
1. ✅ `DataLoader(pin_memory=True)` + `non_blocking=True` 加速 3x
2. ✅ 多 stream 配多 GPU pipeline
3. ✅ `.item()` / `.cpu()` 触发同步——hot path 避免
4. ✅ `torch.cuda.synchronize()` 在 benchmark 必加
5. ✅ `torch.backends.cudnn.benchmark = True` 自动找最优 kernel

### 12. cuDNN 加速（cuDNN Backend）

**问题场景**：手写卷积 kernel 性能差。**cuDNN** 是 NVIDIA 官方库，自动调优卷积算法。PyTorch 集成 cuDNN 后，Conv2d / BatchNorm / LSTM 性能开箱 SOTA。

**解决方案**：
```python
# 启用 cuDNN benchmark
torch.backends.cudnn.benchmark = True         # 自动找最快算法
torch.backends.cudnn.deterministic = False     # 速度优先
torch.backends.cudnn.allow_tf32 = True         # 允许 TF32

# 用 cudnn.benchmark 时第一次会慢（找算法），后续快
x = torch.randn(16, 3, 224, 224, device='cuda')
conv = torch.nn.Conv2d(3, 64, 3).cuda()
y = conv(x)  # 第一次：调 cudnn.benchmark 找算法
y = conv(x)  # 第二次：直接跑最快算法
```
**关键参数**：

| 字段 | 用途 | 副作用 |
|------|------|--------|
| `benchmark` | 找最快算法 | 启动慢 |
| `deterministic` | 确定性 | 速度慢 5-10% |
| `allow_tf32` | TF32 加速 | 精度略降 |
| `benchmark_limit` | 限制测试数 | 启动更慢 |
| `heuristic_mode` | 算法选择模式 | - |

**最佳实践**：
1. ✅ 训练 `benchmark=True`
2. ✅ 复现实验 `deterministic=True`（关闭 benchmark）
3. ✅ A100+ 默认开 TF32
4. ✅ `cudnn.benchmark_limit = 10` 控制启动时间
5. ✅ `torch.backends.cuda.matmul.allow_tf32 = True`

### 13. 内存优化：pin_memory + memory_format（Memory Optimization）

**问题场景**：CPU → GPU 拷贝要"锁页内存"才能用 DMA，省 50% 拷贝时间。**`pin_memory=True`** + **`non_blocking=True`** = 异步拷贝。**`memory_format=torch.channels_last`** 优化 Conv2d。

**解决方案**：
```python
# DataLoader 优化
train_loader = DataLoader(
    dataset,
    batch_size=64,
    num_workers=4,        # 多 worker 预取
    pin_memory=True,      # 锁页内存
    persistent_workers=True,
)

# channels_last 优化（NCHW → NHWC，对 conv 更友好）
x = x.to(memory_format=torch.channels_last)
model = model.to(memory_format=torch.channels_last)

# 节省重复内存
torch.backends.cudnn.benchmark = True
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `pin_memory` | DataLoader 锁页 |
| `non_blocking` | 异步拷贝 |
| `num_workers` | DataLoader 多进程 |
| `prefetch_factor` | 预取批数 |
| `channels_last` | NHWC 内存格式 |
| `memory_format` | `torch.contiguous_format` / `channels_last` |

**最佳实践**：
1. ✅ `pin_memory=True` + `non_blocking=True` 是标配
2. ✅ `num_workers = os.cpu_count()` 看机器
3. ✅ CNN 配 `channels_last` 提 5-10%
4. ✅ `prefetch_factor=2` 多预取
5. ✅ `persistent_workers=True` 避免 worker 反复创建

### 14. Activation Checkpointing（Gradient Checkpointing）

**问题场景**：训练大模型时，激活值占 GPU 内存爆炸。**Activation Checkpointing** 只存部分激活，反向时重新计算，**省 60-80% 内存**。代价是 30% 多计算。

**解决方案**：
```python
from torch.utils.checkpoint import checkpoint

class MyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.layer1 = nn.Linear(1024, 1024)
        self.layer2 = nn.Linear(1024, 1024)
    
    def forward(self, x):
        # 默认存所有激活 → 内存大
        # 用 checkpoint 只存边界激活
        x = checkpoint(self.layer1, x, use_reentrant=False)
        x = checkpoint(self.layer2, x, use_reentrant=False)
        return x

# FSDP 配 checkpointing
from torch.distributed.algorithms._checkpoint.checkpoint_wrapper import checkpoint_wrapper
layer = checkpoint_wrapper(layer)  # 自动处理
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `use_reentrant` | 是否可重入（推荐 False） |
| `deterministic` | 确定性 |
| `chunk_size` | 分块大小 |
| `use_reentrant=True` | 旧 API，可能 OOM |

**最佳实践**：
1. ✅ 训练大模型（> 1B）用 checkpoint
2. ✅ `use_reentrant=False` 避免 autograd OOM
3. ✅ 配合 FSDP / DeepSpeed
4. ✅ 不要对所有层用——只对"内存大"层
5. ✅ `model.gradient_checkpointing_enable()` 配 HuggingFace

### 15. 混合精度训练（AMP）（Mixed Precision Training）

**问题场景**：fp32 训练慢、占内存；fp16 易溢出。**AMP**（自动混合精度）自动选 fp16 / fp32：大多数用 fp16，loss scaling 防溢出。**1.5-2x 加速、30-50% 省内存**。

**解决方案**：
```python
from torch.cuda.amp import autocast, GradScaler

scaler = GradScaler()

for x, y in train_loader:
    optimizer.zero_grad()
    
    with autocast():                                  # 自动 fp16
        y_pred = model(x)
        loss = criterion(y_pred, y)
    
    scaler.scale(loss).backward()                     # 缩放防溢出
    scaler.step(optimizer)                            # 还原更新
    scaler.update()

# 新版 API（PyTorch 2.0+）
with torch.autocast(device_type='cuda', dtype=torch.bfloat16):
    y_pred = model(x)
    loss = criterion(y_pred, y)
loss.backward()
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `dtype` | `torch.float16` / `torch.bfloat16` |
| `device_type` | `cuda` / `cpu` |
| `cache_enabled` | autocast cache |
| `init_scale` | loss scale 初始值 |
| `growth_factor` | 缩放步长 |
| `backoff_factor` | 缩放回退 |

**最佳实践**：
1. ✅ `bfloat16` 优先（A100+、H100）—— 不需要 loss scale
2. ✅ `float16` 配 `GradScaler`（V100 / T4）
3. ✅ CNN 配 `autocast` 提 1.5x
4. ✅ 不要手动 cast——让 autocast 决定
5. ✅ 配 `torch.compile(mode="reduce-overhead")`

---

## 四、工程实践与生态

### 16. nn.Module 网络层封装（nn.Module Pattern）

**问题场景**：用户要能"像搭积木"一样组合层——`Conv2d → BatchNorm → ReLU → Linear`。"Module 模式"：每个层都是 `nn.Module` 子类，`forward()` 定义前向。**PyTorch nn 是设计得最干净的 OOP API**。

**解决方案**：
```python
import torch.nn as nn

class MyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 64, 3, padding=1)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU()
        self.fc = nn.Linear(64 * 32 * 32, 10)
    
    def forward(self, x):
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.relu(x)
        x = x.flatten(1)
        x = self.fc(x)
        return x

model = MyModel()
# 自动找到所有子模块
for name, param in model.named_parameters():
    print(name, param.shape)
```
**关键参数**：

| 概念 | 作用 |
|------|------|
| `nn.Module` | 基类 |
| `__init__` | 定义子层 |
| `forward(x)` | 前向逻辑 |
| `parameters()` | 递归收集参数 |
| `state_dict()` | 序列化 |
| `train() / eval()` | 模式切换 |
| `to(device)` | 移动设备 |

**最佳实践**：
1. ✅ 子层 `nn.Conv2d` 直接 `self.x = nn.Conv2d(...)`
2. ✅ 容器 `nn.Sequential` 简化简单堆叠
3. ✅ 永远不重写 `__call__`——重写 `forward`
4. ✅ `model.eval()` 关闭 dropout / BN
5. ✅ `model.to(device)` + `tensor.to(device)` 配对

### 17. torch.optim 优化器（Optimizer Pattern）

**问题场景**：训练就是"反向传播 + 参数更新"。SGD / Adam / AdamW / LAMB / LARS 是常用优化器。`torch.optim` 统一封装：所有优化器继承 `Optimizer` 基类，有 `step()` / `zero_grad()` / `state_dict()`。

**解决方案**：
```python
import torch.optim as optim

model = MyModel()

# 多种优化器
optimizer = optim.SGD(model.parameters(), lr=0.01, momentum=0.9)
optimizer = optim.Adam(model.parameters(), lr=1e-3)
optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)

# 学习率调度
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=100)
scheduler = optim.lr_scheduler.OneCycleLR(optimizer, max_lr=0.1, total_steps=1000)

# 训练循环
for epoch in range(num_epochs):
    for x, y in train_loader:
        optimizer.zero_grad()
        loss = criterion(model(x), y)
        loss.backward()
        optimizer.step()
    scheduler.step()
```
**关键参数**：

| 优化器 | 关键参数 | 适用 |
|--------|----------|------|
| `SGD` | `lr, momentum, weight_decay` | CNN |
| `Adam` | `lr, betas, eps, weight_decay` | Transformer |
| `AdamW` | `lr, weight_decay` | LLM |
| `LAMB` | `lr, weight_decay` | 大 batch |
| `LARS` | `lr, momentum` | 分布式 |

**最佳实践**：
1. ✅ 训练前 `optimizer.zero_grad()`
2. ✅ LLM 用 `AdamW` + `weight_decay=0.01`
3. ✅ `CosineAnnealingLR` 收敛更稳
4. ✅ `OneCycleLR` 训得快
5. ✅ 保存 `optimizer.state_dict()` 断点续训

### 18. DataLoader 多进程加载（DataLoader Pipeline）

**问题场景**：训练时 GPU 等 CPU 加载数据——浪费算力。**DataLoader** 多 worker 预取 + `pin_memory` + 自动 batch。

**解决方案**：
```python
from torch.utils.data import DataLoader, Dataset

class MyDataset(Dataset):
    def __len__(self): return len(data)
    def __getitem__(self, idx):
        return transform(data[idx]), label

dataset = MyDataset()

train_loader = DataLoader(
    dataset,
    batch_size=64,
    shuffle=True,
    num_workers=4,                # 多进程
    pin_memory=True,              # 锁页内存
    prefetch_factor=2,            # 预取 2 批
    persistent_workers=True,      # 跨 epoch 复用
    drop_last=True,               # 最后一批不完整时丢
)
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `batch_size` | 批大小 |
| `shuffle` | 乱序 |
| `num_workers` | 多进程数 |
| `pin_memory` | 锁页内存 |
| `prefetch_factor` | 预取批数 |
| `persistent_workers` | 跨 epoch 复用 |
| `drop_last` | 丢最后不完整 batch |
| `collate_fn` | 批组合函数 |

**最佳实践**：
1. ✅ `num_workers = os.cpu_count() // 2` 起步
2. ✅ `pin_memory=True` 是标配
3. ✅ `persistent_workers=True` 减少 worker 创建
4. ✅ 加载逻辑放 `__getitem__` 而非 collate_fn
5. ✅ 大数据用 `IterableDataset`（流式）

### 19. 模型序列化与部署（Serialization）

**问题场景**：训练完的模型要保存 + 部署。PyTorch 多种序列化方案：`state_dict` / `torch.save` / `torch.export` / `TorchScript` / `ONNX`。**部署专用 export** 是 PyTorch 2.0+ 主推方案。

**解决方案**：
```python
# 1. state_dict 序列化（最常用）
torch.save(model.state_dict(), "model.pth")
model = MyModel()
model.load_state_dict(torch.load("model.pth"))

# 2. 完整保存（含 optimizer / scheduler）
torch.save({
    "model": model.state_dict(),
    "optimizer": optimizer.state_dict(),
    "epoch": epoch,
}, "checkpoint.pth")

# 3. torch.export（部署专用，PyTorch 2.0+）
from torch.export import export
exported = export(model, (sample_input,))
torch.export.save(exported, "model.pt2")

# 4. ONNX 导出
torch.onnx.export(model, sample_input, "model.onnx", opset_version=17)
```
**关键参数**：

| 序列化 | 用途 | 文件格式 |
|--------|------|----------|
| `state_dict` | 训练 | `.pth` / `.pt` |
| `torch.save` | 训练检查点 | `.pth` |
| `torch.export` | 部署 | `.pt2` |
| `TorchScript` | 部署（老） | `.pt` |
| `ONNX` | 跨框架 | `.onnx` |

**最佳实践**：
1. ✅ 训练用 `state_dict`（.pth）
2. ✅ 部署用 `torch.export`（.pt2）
3. ✅ 检查点存 `model + optimizer + epoch`
4. ✅ ONNX 跨平台（TF / TFLite / ONNX Runtime）
5. ✅ 不要 pickle 整个模型（依赖 pickle 协议）

### 20. 调试与 Profiling（Profiling Pipeline）

**问题场景**：训练慢在哪？前向、反向、优化器、数据加载？**PyTorch Profiler** 集成 Chrome Tracing，能看 GPU / CPU 协同时间线。

**解决方案**：
```python
from torch.profiler import profile, ProfilerActivity, record_function

with profile(
    activities=[ProfilerActivity.CPU, ProfilerActivity.CUDA],
    record_shapes=True,
    profile_memory=True,
    with_stack=True,
) as prof:
    for i, (x, y) in enumerate(train_loader):
        with record_function("data_load"):
            x, y = x.to('cuda'), y.to('cuda')
        with record_function("model_forward"):
            y_pred = model(x)
        with record_function("model_backward"):
            loss = criterion(y_pred, y)
            loss.backward()
        if i >= 10: break

# 打印统计
print(prof.key_averages().table(sort_by="cuda_time_total", row_limit=10))

# 导出 trace.json 给 Chrome
prof.export_chrome_trace("trace.json")
# 在 chrome://tracing 打开
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `activities` | `CPU` / `CUDA` |
| `record_shapes` | 记录 shape |
| `profile_memory` | 内存 |
| `with_stack` | Python 栈 |
| `record_function` | 自定义标签 |
| `Kineto` | 后台 profiler |

**最佳实践**：
1. ✅ `profile(activities=[CPU, CUDA])` 起步
2. ✅ `export_chrome_trace()` 导 trace.json
3. ✅ `chrome://tracing` 看 GPU/CPU 协同
4. ✅ `key_averages().table(sort_by="cuda_time_total")` 排前 10
5. ✅ 用 `torch.cuda.synchronize()` 保证 trace 完整

---

**标签**：#pytorch #Python #深度学习 #CUDA #动态图
**状态**：20/20 份详细内容
