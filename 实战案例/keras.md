# keras · ABL 模式速查（Amazon Builders' Library Style）

> Keras 3 是 Google + 社区维护的多后端深度学习框架，统一 JAX / TensorFlow / PyTorch / OpenVINO / NumPy 五种运行时。本文按"问题场景 → 解决方案 → 关键参数 → 最佳实践"格式整理 20 个跨后端架构与训练循环模式。

---

## 一、核心原理：多后端抽象与算子分派

### 模式 1：Backend 路由表（解决"同一套 API 跑在不同后端"）

**问题场景**：研究员用 JAX 做研究，部署时想切到 TensorFlow Serving；学生写完作业想在 Kaggle 的 PyTorch 环境跑同一份代码。框架无法在 import 期之后切换后端，否则变量类型、算子语义会断裂。

**解决方案代码**：

```python
# keras/src/backend/__init__.py
from keras.src.backend.config import backend

if backend() == "torch":
    # When using the torch backend, torch needs to be imported first,
    # otherwise it will segfault upon import.
    import torch

from keras.src.api_export import keras_export
from keras.src.backend.common.dtypes import result_type
from keras.src.backend.common.keras_tensor import KerasTensor

if backend() == "tensorflow":
    from keras.src.backend.tensorflow import *  # noqa: F403
    from keras.src.backend.tensorflow.core import Variable as BackendVariable
elif backend() == "jax":
    from keras.src.backend.jax import *
    ...
elif backend() == "numpy":
    from keras.src.backend.numpy import *

class Variable(BackendVariable):
    pass
```

**关键参数表**：

| 名称 | 作用 | 默认值 |
|------|------|--------|
| `KERAS_BACKEND` | 环境变量指定后端 | `"tensorflow"` |
| `~/.keras/keras.json` | 持久化的后端配置 | 后端启动时加载 |
| `set_backend(name)` | 运行时改后端（仅 import 前有效） | 无 |
| `backend()` | 读取当前后端名 | 字符串 |
| `result_type(*tensors)` | 跨后端的 dtype 提升 | 跟 NumPy |

**最佳实践**：
- ✅ 在 import keras 之前 `os.environ["KERAS_BACKEND"] = "jax"`，否则首次 import 后无法切换。
- ✅ 写自定义后端函数时遵守 `keras/src/backend/common/` 抽象的同名同语义约定。
- ✅ 不要在 Layer/Model 子类里直接 `import jax.numpy`——一旦用户切到 torch 会段错误。
- ✅ 部署前用 `keras.config.backend()` 确认当前后端。
- ✅ `Variable` 是空类包装器，只为 `keras_export` 重新挂上统一入口。

---

### 模式 2：`__new__` 工厂（让 `Model(inputs, outputs)` 与 `class MyModel(Model)` 同口）

**问题场景**：Functional API 适合生产部署（可 `.get_config()` 序列化），Subclass API 适合研究（写起来像 PyTorch）。如果强制用户选一个，初学门槛高且代码改写成本大。

**解决方案代码**：

```python
# keras/src/models/model.py
@keras_export(["keras.Model", "keras.models.Model"])
class Model(Trainer, base_trainer.Trainer, Layer):
    def __new__(cls, *args, **kwargs):
        if functional_init_arguments(args, kwargs) and cls == Model:
            from keras.src.models.functional import Functional
            return Functional.__new__(Functional, *args, **kwargs)
        return typing.cast(cls, super().__new__(cls))

    def __init__(self, *args, **kwargs):
        Trainer.__init__(self)
        from keras.src.models import functional
        if functional_init_arguments(args, kwargs):
            inject_functional_model_class(self.__class__)
            functional.Functional.__init__(self, *args, **kwargs)
        else:
            Layer.__init__(self, *args, **kwargs)
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `functional_init_arguments` | 探测 `inputs`/`outputs` 是否含 `KerasTensor` | 决定走 Functional 还是普通 Model |
| `inject_functional_model_class` | 装饰子类，把 `_is_layer`/`_init_call_chain` 等私有方法合并 | 仅 Functional 子类化路径触发 |
| `Layer.__init__` | 走 Operation 基类初始化 | 走动态图路径 |
| `Functional.__init__` | 构建静态图 | 可 `save()` / `get_config()` |

**最佳实践**：
- ✅ 写新模型时先选 Functional，序列化能力是免费的。
- ✅ 子类化 `Model` 时 `call()` 必须显式实现，否则触发 `NotImplementedError`。
- ✅ 不要在 `__init__` 里建权重——Keras 会延后到第一次 `call()` 时调 `build()`。
- ✅ `cls == Model` 是关键短路：用户子类化时让 MRO 自然走 Layer 路径。
- ✅ `Trainer, base_trainer.Trainer, Layer` 三父类 MRO 由 C3 线性化保证，最先调 `Layer.add_weight`。

---

### 模式 3：Operation 四态路由（解决"同一个 Layer 既能建图又能 eager"）

**问题场景**：训练时用户希望 `model(x)` 立刻出结果做交互式调试；导出时希望 `model(x)` 走静态图给编译器做优化。同一调用入口不能两套实现，否则代码不统一。

**解决方案代码**：

```python
# keras/src/ops/operation.py
@keras_export("keras.Operation")
class Operation(KerasSaveable):
    def __init__(self, name=None):
        if name is None:
            name = auto_name(self.__class__.__name__)
        self._inbound_nodes = []
        self._outbound_nodes = []

    def __call__(self, *args, **kwargs):
        if any_symbolic_tensors(args, kwargs):
            call_fn = self.symbolic_call
        elif getattr(self, "_remat_mode", None) is not None:
            call_fn = self.remat_call
        elif getattr(self, "quantization_mode", None) is not None:
            call_fn = self.quantized_call
        else:
            call_fn = self.call
        return call_fn(*args, **kwargs)

    def symbolic_call(self, *args, **kwargs):
        outputs = self.compute_output_spec(*args, **kwargs)
        Node(operation=self, call_args=args, call_kwargs=kwargs, outputs=outputs)
        return outputs
```

**关键参数表**：

| 名称 | 作用 | 命中条件 |
|------|------|----------|
| `any_symbolic_tensors` | 检查入参是否含 `KerasTensor` | Functional/图重建路径 |
| `_remat_mode` | JAX 重新物化标记 | `jax.remat` 包裹 |
| `quantization_mode` | 量化模式 | `model.quantize(...)` 后 |
| `symbolic_call` | 建图（返回 KerasTensor） | 命中 1 |
| `call` | eager（返回真实张量） | 默认 |

**最佳实践**：
- ✅ 调试时设 `model.run_eagerly = True` 跳过 `symbolic_call`。
- ✅ 写自定义 Layer 时只重写 `call()`，**不要**碰 `symbolic_call`——后者由 Operation 内部处理。
- ✅ 量化训练前先跑 1 个 warmup 步骤建立 `quantization_mode`。
- ✅ `KerasTensor` 仅携带 shape + dtype，不带值——序列化最理想。
- ✅ `Node` 把自己挂到 `_inbound_nodes/_outbound_nodes` 上形成 DAG，是拓扑遍历的依据。

---

### 模式 4：自动 Config 捕获（让 `save()` 能力"白送"）

**问题场景**：每个 Layer 重写 `get_config()` 是 Keras 2 时代的痛点。研究员写新层只要写 5 行 `__init__` 就能用，序列化不该是负担。

**解决方案代码**：

```python
# keras/src/operation.py 自动配置捕获
def _check_supported_config_arg(obj, key, value):
    supported_types = (str, int, float, bool, type(None))
    if not isinstance(value, supported_types):
        raise ValueError(
            f"Unsupported config arg `{key}` of type {type(value).__name__}. "
            f"Override `get_config()` to serialize this argument."
        )

def get_config(self):
    # 用 inspect 抓 __init__ 签名
    sig = inspect.signature(self.__init__)
    bound = sig.bind_partial(self._build_shapes_dict or {}, **self._kwargs)
    config = {"name": self.name, **bound.arguments}
    return config
```

**关键参数表**：

| 名称 | 作用 | 触发点 |
|------|------|--------|
| `_build_shapes_dict` | build 时入参 | `build_wrapper` 写入 |
| `sig.bind_partial` | 软绑定 | 容忍缺参 |
| `supported_types` | 可自动序列化类型 | str/int/float/bool/None |
| `get_config()` | 序列化为 dict | `model.save()` 时调用 |
| `from_config(config)` | 反序列化 | `model = Model.from_config(...)` |

**最佳实践**：
- ✅ Layer 构造参数只放基础类型（units/activation/rate），把 `initializer`/`regularizer` 留到 build。
- ✅ 自定义 Layer 要么遵守 `__init__` 纯参数签名，要么显式重写 `get_config`。
- ✅ `model.save("x.keras")` 走自动配置 + zip 打包，零样板。
- ✅ 不存 callable（如 Python 函数）进 `__init__`——它会触发类型检查报错。
- ✅ 序列化 Optimizer 时用 `optimizer.get_config()`，**不是** `pickle.dumps`。

---

### 模式 5：`build_wrapper` 装饰（解决"build() 里加 name_scope"）

**问题场景**：用户写 `build(self, input_shape)` 时只关心权重形状。name_scope 嵌套、shape 记录、状态锁定这些横切关注点不应污染业务代码。

**解决方案代码**：

```python
# keras/src/layers/layer.py
class Layer(BackendLayer, Operation):
    def __new__(cls, *args, **kwargs):
        obj = super().__new__(cls, *args, **kwargs)
        original_build_method = obj.build

        @wraps(original_build_method)
        def build_wrapper(*args, **kwargs):
            with obj._open_name_scope():
                obj._path = current_path()
                original_build_method(*args, **kwargs)
            signature = inspect.signature(original_build_method)
            obj._build_shapes_dict = signature.bind(*args, **kwargs).arguments
            obj.built = True
            obj._post_build()
            obj._lock_state()

        obj.build = build_wrapper
        return obj
```

**关键参数表**：

| 名称 | 作用 | 触发时机 |
|------|------|----------|
| `obj._path` | 层全路径（`model/dense_1`） | build 时记录 |
| `obj._build_shapes_dict` | build 入参（供序列化） | build 时记录 |
| `obj.built` | 是否已完成 build | 第一次 `call()` 触发 |
| `obj._lock_state()` | 锁定不允许 `add_weight` | build 之后 |
| `current_path()` | 嵌套层路径 | name scope 栈维护 |

**最佳实践**：
- ✅ 重写 `build` 时**只**写 `self.w = self.add_weight(...)`，别加额外副作用。
- ✅ 想确认 build 完没：`assert model.built` 比看 `len(model.weights) > 0` 更稳。
- ✅ Sharding 策略依赖 `_path` 唯一性，**不要**手动改 `name`。
- ✅ `_lock_state()` 后 `add_weight` 抛错——这正是它要的（防 fit 中漏权重）。
- ✅ 装饰器模式比 metaclass 便宜：MRO 不被扰乱，普通 IDE 跳转无障碍。

---

## 二、架构设计：变量、训练循环与数据适配

### 模式 6：`Variable` + `StatelessScope`（解决"JAX 函数式变量共享"）

**问题场景**：JAX 函数式 API 不允许在函数内修改全局状态，但优化器更新参数本质是 in-place mutation。两套范式打架时，Keras 用"作用域内允许修改"来桥接。

**解决方案代码**：

```python
# keras/src/backend/jax/core.py
class Variable:
    def __init__(self, initializer, shape, dtype=None, name=None):
        self._value = initializer(shape, dtype)
        self._trainable = True

    def assign(self, value):
        # 在 StatelessScope 内允许直接覆盖
        from keras.src.backend.common.stateless_scope import in_stateless_scope
        if in_stateless_scope():
            self._value = value
        else:
            raise ValueError("Use `variable.assign(value)` inside a stateless scope.")

    @property
    def value(self):
        return self._value
```

**关键参数表**：

| 名称 | 作用 | 跨后端语义 |
|------|------|------------|
| `initializer(shape, dtype)` | 工厂 | jax/tf/torch/numpy 各家实现 |
| `Variable.assign(value)` | 写入 | 必须在 StatelessScope 里 |
| `in_stateless_scope()` | 探测 | 仅 jax backend 严格 |
| `value` 属性 | 读取 | 总是返回张量 |
| `trainable` | 是否被 optimizer 更新 | 冻结层设 False |

**最佳实践**：
- ✅ 写自定义训练循环时用 `backend.StatelessScope()` 包裹参数更新。
- ✅ 评估时手动 `for layer in model.layers: layer.trainable = False`。
- ✅ 变量共享用 `backend.Variable` 而**不是** Python 全局变量。
- ✅ 从 `tf.Variable` 迁移到 `keras.Variable`：后者跨后端可序列化。
- ✅ 不要混用 `state.value` 和 `state.numpy()`——后者只对 numpy/torch 后端有效。

---

### 模式 7：`Trainer` 基类 + 后端 Mixin（解决"5 个后端写 5 套 fit 循环"）

**问题场景**：fit/evaluate/predict 流程在 5 个后端几乎一致（迭代数据集 → 算 loss → 反向传播 → 优化器 step → 指标更新），但底层算子（`grad/optimizer_step/optimizer_assign`）每个后端不同。如果基类一把梭，难以优化；如果每个后端复制整套 Trainer，bug 同步噩梦。

**解决方案代码**：

```python
# keras/src/trainers/trainer.py
class Trainer:
    def __init__(self):
        self._lock = False
        self._run_eagerly = False
        self._jit_compile = None
        self.compiled = False
        self.steps_per_execution = 1

    def compile(self, optimizer="rmsprop", loss=None, *,
                jit_compile="auto", steps_per_execution=1):
        optimizer = optimizers.get(optimizer)
        if (self.dtype_policy.name == "mixed_float16"
            and not isinstance(optimizer, LossScaleOptimizer)):
            optimizer = LossScaleOptimizer(optimizer, name="loss_scale_optimizer")
        self.optimizer = optimizer
        if jit_compile == "auto":
            jit_compile = False if self._run_eagerly else True
        self._jit_compile = jit_compile
        self._compile_metrics(loss)
```

**关键参数表**：

| 名称 | 作用 | 默认值 |
|------|------|--------|
| `optimizer` | 优化器 | `"rmsprop"` |
| `loss` | 损失函数 | `None` |
| `jit_compile` | 是否走 XLA/JIT | `"auto"` → `True` |
| `steps_per_execution` | 每次 `model._run_step` 累积步数 | `1` |
| `LossScaleOptimizer` | 混合精度包装器 | 仅 `mixed_float16` |
| `dtype_policy` | dtype 策略 | `"float32"` |

**最佳实践**：
- ✅ `compile()` 是必需的，没 compile 就 `model.fit()` 抛 `ValueError`。
- ✅ `jit_compile=True` 在 jax/tf 后端有效，torch/numpy 无效（自动 no-op）。
- ✅ `steps_per_execution > 1` 减少 Python 调度开销，但 debug 时设回 1。
- ✅ 混合精度先看硬件支持：A100/V100/RTX 30+ 才有效。
- ✅ 自定义 `compute_loss` 时签名要带 `training` 参数，否则 Trainer 找不到。

---

### 模式 8：LossScaleOptimizer 包装（解决"fp16 梯度下溢"）

**问题场景**：混合精度训练用 fp16 存权重/梯度，但小梯度（如 `1e-8`）会下溢成 0。Optimizer 算出的 `update = lr * grad` 也是 0，模型再也不收敛。

**解决方案代码**：

```python
# keras/src/optimizers/loss_scale_optimizer.py
class LossScaleOptimizer(Optimizer):
    def __init__(self, inner_optimizer, initial_scale=2**15,
                 dynamic_growth_steps=2000):
        super().__init__(learning_rate=inner_optimizer.learning_rate)
        self.inner_optimizer = inner_optimizer
        self._scale = initial_scale
        self._growth_steps = dynamic_growth_steps
        self._current_step = 0

    def apply_gradients(self, grads_and_vars):
        scaled = [(g * self._scale, v) for g, v in grads_and_vars]
        self.inner_optimizer.apply_gradients(scaled)
        self._maybe_adjust_scale()

    def _maybe_adjust_scale(self):
        if self._no_nan_recently():
            self._current_step += 1
            if self._current_step >= self._growth_steps:
                self._scale *= 2
                self._current_step = 0
        else:
            self._scale /= 2
            self._current_step = 0
            self._skip_update()
```

**关键参数表**：

| 名称 | 作用 | 默认值 |
|------|------|--------|
| `inner_optimizer` | 被包装的优化器 | 必填 |
| `initial_scale` | 初始缩放因子 | `2**15 = 32768` |
| `dynamic_growth_steps` | 多少步无 NaN 后翻倍 | `2000` |
| `_scale` | 当前缩放因子 | 动态调整 |
| `_no_nan_recently()` | 检查是否有 NaN/Inf | 自定义实现 |

**最佳实践**：
- ✅ 混精度训练无需手动包装——`compile()` 检测到 `dtype_policy="mixed_float16"` 自动包。
- ✅ `initial_scale` 调小（如 2**8）可缓解早期 loss 爆炸，但收敛变慢。
- ✅ 自定义优化器继承 `LossScaleOptimizer` 而不是 `Optimizer` 也能享受混精。
- ✅ 监控 `optimizer._scale` 指标写入 TensorBoard，缩放因子稳定时训练才稳。
- ✅ jax 后端的混精度用 `jax.lax.cond` 自动管理，不需要 `LossScaleOptimizer`。

---

### 模式 9：Data Adapter 7 选 1（解决"tf.data / numpy / generator / torch loader 各自写"）

**问题场景**：用户数据可能来自 `tf.data.Dataset`、`numpy.array`、Python 生成器、`torch.utils.data.DataLoader`、`pandas.DataFrame`、音频文件列表。Trainer 不该被迫支持 7 套遍历协议。

**解决方案代码**：

```python
# keras/src/trainers/data_adapters/__init__.py
DATA_ADAPTERS = [
    "keras.src.trainers.data_adapters.tensorflow_dataset_adapter.TensorFlowDatasetAdapter",
    "keras.src.trainers.data_adapters.pytorch_data_adapter.TorchDataAdapter",
    "keras.src.trainers.data_adapters.numpy_adapter.NumpyAdapter",
    "keras.src.trainers.data_adapters.generator_adapter.GeneratorAdapter",
    "keras.src.trainers.data_adapters.array_slicing_adapter.ArraySlicingAdapter",
    "keras.src.trainers.data_adapters.py_dataset_adapter.PyDatasetAdapter",
]

def get_data_adapter(x, y=None, sample_weight=None, batch_size=None, steps_per_epoch=None):
    for adapter_path in DATA_ADAPTERS:
        adapter = importlib.import_module(adapter_path)
        if adapter.can_handle(x, y):
            return adapter(x, y, sample_weight, batch_size, steps_per_epoch)
    raise ValueError(f"Could not find a data adapter for inputs: {x}")
```

**关键参数表**：

| 名称 | 作用 | 触发条件 |
|------|------|----------|
| `TensorFlowDatasetAdapter` | tf.data | `isinstance(x, tf.data.Dataset)` |
| `TorchDataAdapter` | torch DataLoader | `isinstance(x, torch.utils.data.DataLoader)` |
| `NumpyAdapter` | 单 numpy 数组 | `isinstance(x, np.ndarray)` |
| `GeneratorAdapter` | Python 生成器 | `inspect.isgenerator(x)` |
| `ArraySlicingAdapter` | 字典/列表混排 | `isinstance(x, (dict, list))` |
| `PyDatasetAdapter` | keras.utils.Sequence | `isinstance(x, keras.utils.PyDataset)` |
| `can_handle(x, y)` | 探测函数 | 每个 Adapter 自带 |

**最佳实践**：
- ✅ `tf.data.Dataset` 最高效（自动 prefetch/shuffle），大数据集优先用。
- ✅ 写自定义数据流时继承 `keras.utils.PyDataset` 而不是 `torch.Dataset`——跨后端。
- ✅ `batch_size` 在 Adapter 层处理，无需手动 reshape。
- ✅ Generator 写训练时**必须** yield (`x`, `y`) 而不是 `x, y` 列表（无限流）。
- ✅ `PyDataset` 的 `__len__` 返回步数而非样本数——影响 `steps_per_epoch`。

---

### 模式 10：Callback 钩子协议（解决"训练过程 18 种回调各自实现"）

**问题场景**：早停、模型检查点、学习率调度、TensorBoard、SWA、Mixup、混淆矩阵……每个 callback 都需要在 epoch 开头/结尾、batch 开头/结尾插入逻辑。

**解决方案代码**：

```python
# keras/src/callbacks/callback.py
class Callback:
    def on_batch_begin(self, batch, logs=None): pass
    def on_batch_end(self, batch, logs=None): pass
    def on_epoch_begin(self, epoch, logs=None): pass
    def on_epoch_end(self, epoch, logs=None): pass
    def on_train_begin(self, logs=None): pass
    def on_train_end(self, logs=None): pass
    def on_test_begin(self, logs=None): pass
    def on_test_end(self, logs=None): pass
    def on_predict_begin(self, logs=None): pass
    def on_predict_end(self, logs=None): pass

class ModelCheckpoint(Callback):
    def on_epoch_end(self, epoch, logs=None):
        if self.monitor_op(logs[self.monitor], self.best):
            self.best = logs[self.monitor]
            self.model.save(self.filepath)
```

**关键参数表**：

| 钩子 | 触发时机 | logs 内容 |
|------|----------|-----------|
| `on_train_begin` | 训练开始 | `{}` |
| `on_epoch_begin` | 每 epoch 开始 | `{}` |
| `on_batch_begin` | 每 batch 开始 | `{}` |
| `on_batch_end` | 每 batch 结束 | `{loss, metric1, ...}` |
| `on_epoch_end` | 每 epoch 结束 | `{val_loss, val_acc, ...}` |
| `on_train_end` | 训练结束 | `{loss, val_loss, ...}` |
| `on_test_*` | 评估阶段 | `{}` |
| `on_predict_*` | 推理阶段 | `{}` |

**最佳实践**：
- ✅ 写自定义 callback 时**只**重写你需要的钩子，其他 `pass` 即可。
- ✅ `on_batch_end` 改 self.model 状态会污染下一 batch（不建议）。
- ✅ `EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True)` 是黄金组合。
- ✅ `ModelCheckpoint` 用 `save_best_only=True` 避免磁盘爆炸。
- ✅ `ReduceLROnPlateau` 监控 `val_loss` 不用 `loss`（训练 loss 持续下降会触发假阴性）。

---

## 三、性能优化：编译、缓存与并行

### 模式 11：`jit_compile` 自动 XLA（解决"Python 调度开销占总耗时 30%"）

**问题场景**：每个 batch 的 Python 调用开销（`for layer in model.layers: layer(x)`）占总耗时的 10-30%，特别是小模型。JAX/TF 提供 XLA 把整段模型编译成单一图。

**解决方案代码**：

```python
# keras/src/trainers/trainer.py 编译逻辑
if jit_compile == "auto":
    if run_eagerly:
        jit_compile = False
    else:
        # JAX 总是 JIT；TF 看是否支持；torch/numpy 忽略
        jit_compile = backend() in ("jax", "tensorflow")

# 实际调用
def _run_step(self, data):
    @tf.function(jit_compile=self._jit_compile)  # or jax.jit
    def step(data):
        return self.compute_loss_and_updates(data)
    return step(data)
```

**关键参数表**：

| 名称 | 作用 | 性能影响 |
|------|------|----------|
| `jit_compile=True` | 强制 XLA | 小模型加速 2-5x |
| `jit_compile=False` | eager | 调试友好，慢 |
| `jit_compile="auto"` | 按后端判断 | 推荐默认 |
| `steps_per_execution=10` | 一次 XLA 跑 10 步 | 减少 Python 调用 |
| `input_signature` | 静态 shape | 避免 re-trace |

**最佳实践**：
- ✅ jax 后端**总是** jit_compile=True，不要 eager（除非调试）。
- ✅ `steps_per_execution=10` 比 `=1` 快 5-10%（Python 调度消除）。
- ✅ 变长输入用 `tf.function(input_signature=[...])` 显式指定 shape 防 re-trace。
- ✅ 混精 + jit_compile 是双重加速前提，缺一效率打折。
- ✅ 调试时 `tf.config.optimizer.set_jit(False)` 关闭全局 JIT。

---

### 模式 12：`add_weight` 延迟分配（解决"未 build 的层不能序列化"）

**问题场景**：研究员喜欢在 `__init__` 里只写 `self.units = 32`，把权重创建留到 `build(input_shape)`。Keras 必须保证 build 之前的 `model.weights` 是空列表、build 之后是真实张量，且两态可序列化。

**解决方案代码**：

```python
# keras/src/layers/layer.py
class Layer(BackendLayer, Operation):
    def add_weight(self, shape=None, initializer=None, ...):
        if not self.built:
            raise ValueError(
                "Cannot add weight before layer is built. "
                "Build the layer via `__call__` first."
            )
        backend_var = backend.Variable(
            initializer=initializer, shape=shape, dtype=self.variable_dtype
        )
        self._track_variable(backend_var)
        return backend_var

    def _open_name_scope(self):
        # name scope 用于变量命名 + checkpoint
        return backend.name_scope(self.name + "/")
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `shape` | 权重形状 | tuple/list |
| `initializer` | 工厂 | `"glorot_uniform"` 或 callable |
| `variable_dtype` | 实际 dtype | 跟 layer dtype_policy |
| `_track_variable` | 加入 trainable/non-trainable 列表 | 内部用 |
| `built` | bool | build 后变 True |

**最佳实践**：
- ✅ 自定义层**永远**在 `build` 里 `self.w = self.add_weight(...)`，**不要**在 `__init__`。
- ✅ `initializer="glorot_uniform"` 是默认，无需显式写。
- ✅ `add_weight(shape=..., trainable=False)` 加进统计量（如 running mean）。
- ✅ 想冻结某层：`layer.trainable = False`，**不是**手动 `w.assign(w * 0)`。
- ✅ 调用前确认 `model.built == True`，否则会触发 build 副作用。

---

### 模式 13：Optimizer 状态 + Variable 共享（解决"Adam m/v 跟权重一起保存"）

**问题场景**：恢复训练时不仅要加载模型权重，还要加载 Adam 的 `m`（一阶矩）和 `v`（二阶矩）。如果它们各自保存，文件管理复杂；如果拆开序列化，加载逻辑脆弱。

**解决方案代码**：

```python
# keras/src/optimizers/adam.py
class Adam(Optimizer):
    def __init__(self, learning_rate=0.001, beta_1=0.9, beta_2=0.999,
                 epsilon=1e-7, amsgrad=False):
        super().__init__(learning_rate=learning_rate)
        self.beta_1 = beta_1
        self.beta_2 = beta_2
        self.epsilon = epsilon
        self.amsgrad = amsgrad
        self._m = []  # 一阶矩
        self._v = []  # 二阶矩

    def build(self, variables):
        # 每个变量配对创建 m/v
        for v in variables:
            self._m.append(backend.zeros_like(v))
            self._v.append(backend.zeros_like(v))
        if self.amsgrad:
            self._vhat = [backend.zeros_like(v) for v in variables]
```

**关键参数表**：

| 名称 | 作用 | 推荐值 |
|------|------|--------|
| `learning_rate` | 学习率 | `1e-3` |
| `beta_1` | 一阶衰减 | `0.9` |
| `beta_2` | 二阶衰减 | `0.999` |
| `epsilon` | 数值稳定项 | `1e-7` |
| `amsgrad` | AMSGrad 变种 | `False` |
| `clipnorm` | 梯度范数裁剪 | `None` 或 `1.0` |
| `clipvalue` | 元素裁剪 | `None` 或 `0.5` |

**最佳实践**：
- ✅ 保存检查点用 `model.save("x.keras")` 一并存模型 + optimizer + metrics。
- ✅ `clipnorm=1.0` 防 GAN 训练崩溃（梯度爆炸）。
- ✅ AdamW 是更现代的选择：`keras.optimizers.AdamW(weight_decay=1e-4)`。
- ✅ Lion 优化器（`keras.optimizers.Lion`）内存省 50%（不需要 v），但收敛曲线不同。
- ✅ 学习率调度不要用 `lr = 0.1 ** epoch`（指数），用 `cosine_decay` 更平滑。

---

### 模式 14：分布式训练 + Sharding 策略（解决"单机 8 卡扩展"）

**问题场景**：多 GPU/TPU 训练要解决"梯度同步"和"模型分片"两个问题。Keras 3 把 JAX 的 `sharding` 概念提到 `keras.distribution` 层，跨后端统一。

**解决方案代码**：

```python
# keras/src/distribution/__init__.py
def set_distribution(distribution):
    keras_global_state.set_global_attribute("distribution", distribution)

# 使用
distribution = keras.distribution.DataParallel(
    device_mesh=keras.distribution.DeviceMesh(
        shape=(1, 8), axis_names=["batch", "model"]
    )
)
keras.distribution.set_distribution(distribution)
model = model.distribute()
```

**关键参数表**：

| 名称 | 作用 | 适用后端 |
|------|------|----------|
| `DataParallel` | 数据并行（每卡完整模型） | jax / tf / torch |
| `ModelParallel` | 模型分片（每卡部分层） | jax / tf |
| `DeviceMesh` | 物理拓扑 | 字符串 axis |
| `LayoutMap` | 变量 → 设备映射 | jax 专属 |
| `model.distribute()` | 应用 distribution 策略 | 须在 build 前调 |

**最佳实践**：
- ✅ DataParallel 是默认起点，模型放不下了再考虑 ModelParallel。
- ✅ `device_mesh` 的 axis_name 要跟 `LayoutMap` 字符串一致。
- ✅ jax 后端用 `with mesh:` context 切设备。
- ✅ `model.distribute()` 调用后 `_distribution` 属性永久绑定，重新加载模型也要重设。
- ✅ TPU pod 训练必须用 jax + ModelParallel，TF DataParallel 在 TPU 上效率低。

---

### 模式 15：混合精度 + Loss Scaling（解决"fp16 训练不稳定"）

**问题场景**：现代 GPU（A100/V100/RTX 30+）的 fp16 算力是 fp32 的 2-8 倍。但 fp16 数值范围窄，小梯度会下溢到 0，模型无法收敛。

**解决方案代码**：

```python
# keras/src/mixed_precision/dtype_policy.py
def set_dtype_policy(policy):
    if isinstance(policy, str):
        policy = dtype_policy(policy)
    keras_global_state.set_global_attribute("dtype_policy", policy)

# 使用
keras.mixed_precision.set_dtype_policy("mixed_float16")
model = MyModel()
model.compile(optimizer="adam", loss="sparse_categorical_crossentropy")
# 自动 wrap LossScaleOptimizer
```

**关键参数表**：

| 名称 | 作用 | 适用 |
|------|------|------|
| `"float32"` | 全 fp32 | 默认 |
| `"mixed_float16"` | 计算 fp16，变量 fp32 | GPU 训练 |
| `"mixed_bfloat16"` | 计算 fp16，变量 bf16 | TPU/新 GPU |
| `"float16"` | 全 fp16 | 推理 |
| `loss_scale` | 缩放因子 | mixed_float16 专属 |
| `dtype_policy` | 当前策略 | 读 `keras.config.dtype_policy()` |

**最佳实践**：
- ✅ 推理也用 `mixed_float16` 加速，比纯 fp16 安全（变量仍 fp32）。
- ✅ TPU 必须用 `mixed_bfloat16`（TPU 硬件不支持 fp16）。
- ✅ 自定义 `compute_loss` 务必在内部 cast 回 fp32（避免 loss 算到 fp16）。
- ✅ `policy.name` 监控写入 TensorBoard，确认设置生效。
- ✅ `mixed_float16` 在 ResNet-50 上 30 epoch 比 fp32 快 1.5x，A100 上接近 2x。

---

## 四、可靠性与生态：序列化、监控与治理

### 模式 16：`.keras` 文件结构（解决"h5/pyckle 各家格式分裂"）

**问题场景**：Keras 2 时代 `model.h5`（HDF5）和 `model.json` + `weights.h5` 两种格式让用户头大。HDF5 库本身难装、加密弱、对 dtype 支持不全。

**解决方案代码**：

```python
# keras/src/saving/saving_lib.py
def save_model(model, filepath):
    with zipfile.ZipFile(filepath, "a") as zf:
        zf.writestr("config.json", json.dumps(model.get_config()))
        zf.writestr("metadata.json", json.dumps({"keras_version": keras.__version__}))
        for layer in model.layers:
            weights_path = f"weights/{layer.path}.npy"
            np.save(zf.open(weights_path), layer.weights)
        if model.optimizer:
            zf.writestr("optimizer.json", json.dumps(model.optimizer.get_config()))
            for var in model.optimizer.variables:
                np.save(zf.open(f"optimizer/{var.path}.npy"), var)
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `config.json` | 模型架构 | JSON 字符串 |
| `metadata.json` | 版本信息 | `keras_version` |
| `weights/{path}.npy` | 权重文件 | numpy 数组 |
| `optimizer.json` | 优化器配置 | 同上 |
| `architecture.txt` | ASCII 图 | 调试用 |
| `save_format` | `"keras"` 或 `"h5"` | 默认 `"keras"` |

**最佳实践**：
- ✅ 默认用 `model.save("x.keras")`，不写后缀名 Keras 也会推断。
- ✅ h5 格式仅在迁移老模型时用：`save_format="h5"`。
- ✅ `.keras` 文件是 zip，可 `unzip -l x.keras` 看内部结构。
- ✅ `tf.saved_model` 仍是部署到 TF Serving 的标准，Keras 模型可 `export()` 转 SavedModel。
- ✅ PyTorch 加载：先 `model = keras.models.load_model("x.keras")`，再手动遍历权重迁移。

---

### 模式 17：Metrics State + 跨 epoch 累积（解决"SparseCategoricalAccuracy 跨 batch 累加"）

**问题场景**：每个 metric 在每 batch 算一次结果（如 `acc = correct / total`），但 epoch 结束时要的是"整个 epoch 的均值"。简单的 `mean(batch_results)` 对正确率等不是数学均值。

**解决方案代码**：

```python
# keras/src/metrics/base_metric.py
class Metric(Layer):
    def __init__(self, name=None):
        super().__init__(name=name)
        self._metrics_dict = {}  # 中间状态

    def update_state(self, y_true, y_pred, sample_weight=None):
        # 子类实现：累加器
        return self._update_state(y_true, y_pred, sample_weight)

    def result(self):
        # 子类实现：从累加器计算结果
        return self._result()

    def reset_state(self):
        # 每 epoch 开始清空
        for v in self._metrics_dict.values():
            v.assign(backend.zeros_like(v))

class SparseCategoricalAccuracy(MeanMetricWrapper):
    def __init__(self, name="sparse_categorical_accuracy"):
        super().__init__(sparse_categorical_accuracy, name=name)
```

**关键参数表**：

| 名称 | 作用 | 何时调 |
|------|------|--------|
| `update_state` | 单 batch 更新 | Trainer 自动调 |
| `result()` | 当前累积值 | 调用于 `logs` |
| `reset_state` | 清零 | epoch 开始 |
| `sample_weight` | 样本权重 | 可选 |
| `MeanMetricWrapper` | 自动包装 `mean` | 通用基类 |
| `dtype` | 累积精度 | 跟 layer 一样 |

**最佳实践**：
- ✅ 自定义 metric 时只重写 `update_state` 和 `result`，**不要**管 `reset_state`。
- ✅ `Mean` 用在 `loss`（本身就是均值），`Accuracy` 用在正确率。
- ✅ `AUC` 需要 `from_logits=True` 当 y_pred 是 softmax 前输出。
- ✅ `compile(metrics=[my_metric])` 时 `my_metric` 实例每次 epoch 复用。
- ✅ 训练中想加新指标：必须重新 `compile()`，否则 logs 里不出现。

---

### 模式 18：`Layer` 嵌套 + 路径名（解决"sharding/checkpoint 按路径取"）

**问题场景**：JAX pjit 的分区编译需要每个变量知道自己分到哪块设备。最自然的方式是按"层路径"映射：dense_1 放 GPU 0，dense_2 放 GPU 1。

**解决方案代码**：

```python
# keras/src/layers/layer.py
class Layer(BackendLayer, Operation):
    def _open_name_scope(self):
        # 推入 name stack
        backend.name_scope_stack.push(self.name)
        return backend.name_scope(self.name + "/")

    def __setattr__(self, name, value):
        if isinstance(value, Layer):
            # 子层自动挂到当前 path
            value._parent_path = current_path() + [self.name]
        super().__setattr__(name, value)

# 使用 LayoutMap
layout_map = keras.distribution.LayoutMap(device_mesh)
layout_map["dense_1.*"] = ["model"]
layout_map["dense_2.*"] = ["model", "data"]
keras.distribution.set_distribution(
    ModelParallel(device_mesh, layout_map)
)
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `_path` | 当前层路径 | list of str |
| `name_scope_stack` | 全局栈 | backend 维护 |
| `LayoutMap` | 路径 → 设备映射 | jax 后端 |
| `device_mesh` | 设备拓扑 | `[(1, 8)]` 等 |
| `_parent_path` | 父层路径 | 自动维护 |
| `current_path()` | 读栈 | 名字加 `/` 分隔 |

**最佳实践**：
- ✅ 写大模型时按"按层分片"思维组织（如 Transformer block 整体分到一卡）。
- ✅ `name` 冲突会导致 `auto_name` 加 `_1`/`_2` 后缀，路径仍稳定。
- ✅ `LayoutMap["dense.*"]` 用通配匹配层名。
- ✅ 检查点按 path 索引，加载时路径必须一致（改模型结构要重新训练）。
- ✅ 调试时 `print(layer._path)` 确认嵌套结构。

---

### 模式 19：API 自动生成（解决"keras.applications / keras.layers 双名空间"）

**问题场景**：Keras 有 `keras.layers.Dense`、`keras.applications.ResNet50`、`keras.optimizers.Adam` 等几十个入口，手动维护 `__init__.py` 会漏。

**解决方案代码**：

```python
# api_gen.py
import os, inspect, keras_export

def collect_apis():
    api_registry = {}
    for module in os.listdir("keras/src"):
        if module.startswith("_"):
            continue
        for cls_name, cls in inspect.getmembers(__import__(f"keras.src.{module}")):
            if hasattr(cls, "_keras_api_names"):
                for name in cls._keras_api_names:
                    api_registry[name] = cls
    return api_registry

def write_api(registry):
    with open("keras/api/__init__.py", "w") as f:
        for name in sorted(registry):
            cls = registry[name]
            f.write(f"from {cls.__module__} import {cls.__name__} as {name.split('.')[-1]}\n")

# 触发
if __name__ == "__main__":
    write_api(collect_apis())
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `_keras_api_names` | 用 `keras_export` 装饰后挂的属性 | 列表 |
| `api_gen.py` | CI 自动跑 | 生成 `keras/api/__init__.py` |
| `keras_export(["keras.X", "keras.layers.X"])` | 一物多挂 | 双名空间 |
| `pip_build.py` | 打包前再跑一次 | 防漏 |
| `__version__` | 版本号 | `_keras_version` |

**最佳实践**：
- ✅ 自定义层加 `@keras_export("keras.layers.MyLayer")` 才有官方命名。
- ✅ CI 跑 `api_gen.py` 检查导出表和实际注册是否一致。
- ✅ `_tf_keras` 子包是 `tf.keras` 兼容垫片，不参与 api_gen。
- ✅ `pip install keras` 后导入 `keras.applications` 才会触发子包 import——延迟加载。
- ✅ 自定义后端不要 export 到顶层 `keras.*`，会污染官方命名空间。

---

### 模式 20：多后端回归测试矩阵（解决"tf 修 bug 把 jax 跑挂"）

**问题场景**：Keras 在 5 个后端 + 5 个 Python 版本 + 多个 OS 上跑。任何一处的 `tf.zeros_like` 调用语法都可能在 jax 端不工作。需要在 CI 跑全矩阵才能确保 release 质量。

**解决方案代码**：

```python
# integration_tests/ 运行所有后端
import subprocess, sys

BACKENDS = ["tensorflow", "jax", "torch"]
PYTHONS = ["3.10", "3.11", "3.12"]
OSES = ["ubuntu-latest", "macos-latest", "windows-latest"]

def run_matrix():
    failures = []
    for py in PYTHONS:
        for backend in BACKENDS:
            for os_ in OSES:
                env = os.environ.copy()
                env["KERAS_BACKEND"] = backend
                env["PYTHON"] = py
                result = subprocess.run(
                    ["pytest", "integration_tests/", "-x"],
                    env=env, capture_output=True
                )
                if result.returncode != 0:
                    failures.append((py, backend, os_, result.stderr))
    return failures
```

**关键参数表**：

| 名称 | 作用 | 备注 |
|------|------|------|
| `KERAS_BACKEND` | 环境变量切后端 | 必须 import 前设 |
| `pytest -x` | 失败即停 | CI 默认 |
| `integration_tests/` | 跨后端真实模型测试 | MNIST/ResNet/Transformer |
| `benchmarks/` | 性能回归 | `layer_benchmark` 等 |
| `nightly` | 每晚跑 | GitHub Actions schedule |
| `tpu_tests` | TPU 专属 | google-internal |

**最佳实践**：
- ✅ 提 PR 时 CI 自动跑 5×3×3 = 45 个矩阵，本地只测一个后端（默认 jax 或 torch）。
- ✅ `benchmarks/keras_vs_torch_ctl.py` 监控后端性能回归。
- ✅ jax 后端的 `jit_compile` bug 难复现，优先看 jax tests 日志。
- ✅ 跨后端代码用 `backend.function` 包装，**不要**直接 `jax.jit`/`tf.function`。
- ✅ 笔记本上跑测试 `pytest -k "not slow"`，慢的留给 CI。

---

## 参考

- Keras 3 官方文档：https://keras.io/api/
- 源代码：`keras/src/`
- 5 后端测试矩阵：`.github/workflows/` 多个 yaml
- François Chollet 创立的 Google 团队维护，~600 contributors
- License：Apache-2.0
