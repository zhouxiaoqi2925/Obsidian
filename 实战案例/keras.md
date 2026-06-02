# keras - 多后端深度学习统一 API

**GitHub**: keras-team/keras
**Star**: 63k+
**语言**: Python
**主题**: 深度学习 / 多后端 / JAX / TensorFlow / PyTorch / OpenVINO
**适用场景**: 神经网络研究 / 多后端模型 / 教学 / 跨框架部署

---

## 第一段：基础范式

### 模式 1 - Backend 路由表（5 后端同套 API）

**问题场景**：研究员用 JAX 做研究，部署时想切到 TensorFlow Serving；同一份代码要在 5 个后端跑（JAX / TF / PyTorch / OpenVINO / NumPy）。import 期之后切换后端会断。

**解决方案**：`keras/src/backend/__init__.py` 在 import 期按 `KERAS_BACKEND` 环境变量分发到 `tensorflow` / `jax` / `torch` / `numpy` 任一实现；`set_backend(name)` 仅 import 前有效；`backend()` 读当前后端名。

**关键参数**：
- `KERAS_BACKEND` 环境变量
- `~/.keras/keras.json` 持久配置
- `set_backend(name)` 运行时切换
- `backend()` 当前后端字符串
- `result_type(*tensors)` 跨后端 dtype 提升

**最佳实践**：在 import keras 之前 `os.environ["KERAS_BACKEND"] = "jax"`；写自定义后端函数遵守 `keras/src/backend/common/` 抽象；不要在 Layer 子类里直接 `import jax.numpy`；任何"跨运行时"项目可借鉴此范式。

### 模式 2 - `__new__` 工厂（Functional/Subclass 同口）

**问题场景**：Functional API 适合生产部署（可 `get_config` 序列化），Subclass API 适合研究。强制二选一门槛高。

**解决方案**：`Model.__new__` 探测入参：含 `KerasTensor` 走 Functional 路径（构造 DAG），否则走 Layer 子类化路径。`inject_functional_model_class` 装饰子类合并私有方法。

**关键参数**：
- `functional_init_arguments` 探测 `inputs`/`outputs`
- `inject_functional_model_class` 合并私有方法
- `Layer.__init__` 动态图路径
- `Functional.__init__` 静态图路径
- `cls == Model` 短路保护

**最佳实践**：先选 Functional（序列化能力免费）；子类化 `Model` 时 `call()` 必显式实现；不要在 `__init__` 里建权重（Keras 延后到 `build()`）；任何"双形态 API"项目可借鉴 `__new__` 工厂范式。

### 模式 3 - Operation 四态路由（建图 vs eager）

**问题场景**：训练时 `model(x)` 立刻出结果做交互式调试；导出时走静态图给编译器优化。同一入口不能两套实现。

**解决方案**：`Operation.__call__` 检查入参：`any_symbolic_tensors` → `symbolic_call` 建图；`_remat_mode` → `remat_call`；`quantization_mode` → `quantized_call`；否则 `call` eager。返回 `KerasTensor` 或真实张量。

**关键参数**：
- `any_symbolic_tensors` 探测入参
- `symbolic_call` 建图返回 KerasTensor
- `_remat_mode` JAX 重新物化
- `quantization_mode` 量化
- `Node` 拓扑 DAG

**最佳实践**：调试时 `model.run_eagerly = True` 跳过 `symbolic_call`；写自定义 Layer 只重写 `call()`，**不要**碰 `symbolic_call`；`KerasTensor` 仅携带 shape + dtype 序列化友好；任何"动态/静态双模"项目可借鉴此范式。

### 模式 4 - 自动 Config 捕获（序列化白送）

**问题场景**：每个 Layer 重写 `get_config()` 是 Keras 2 时代痛点。研究员写 5 行 `__init__` 就能用，序列化不该是负担。

**解决方案**：`get_config` 用 `inspect.signature` 抓 `__init__` 签名，`sig.bind_partial` 软绑定 `self._kwargs`；`supported_types = (str, int, float, bool, None)` 强制基础类型；非基础类型抛错要求用户重写。

**关键参数**：
- `_build_shapes_dict` build 时入参
- `sig.bind_partial` 软绑定
- `supported_types` 白名单
- `get_config()` 序列化为 dict
- `from_config(config)` 反序列化

**最佳实践**：Layer 构造参数只放基础类型（units/activation/rate），把 `initializer`/`regularizer` 留到 `build`；自定义 Layer 要么遵守 `__init__` 纯参数签名，要么显式重写 `get_config`；不存 callable（会触发类型检查报错）；任何"零样板序列化"项目可借鉴此范式。

### 模式 5 - `build_wrapper` 装饰（横切关注点解耦）

**问题场景**：用户写 `build(self, input_shape)` 只关心权重形状。name_scope 嵌套、shape 记录、状态锁定是横切关注点，不应污染业务代码。

**解决方案**：`Layer.__new__` 装饰 `build` 方法：`build_wrapper` 用 `obj._open_name_scope()` 包装、`inspect.signature` 抓 shape 入参、`obj._lock_state()` 锁定后续 `add_weight`。

**关键参数**：
- `obj._path` 层全路径 `model/dense_1`
- `obj._build_shapes_dict` build 入参
- `obj.built` 是否 build
- `obj._lock_state()` 锁 add_weight
- `current_path()` 嵌套层路径

**最佳实践**：重写 `build` 时**只**写 `self.w = self.add_weight(...)` 别加副作用；`assert model.built` 比 `len(model.weights) > 0` 稳；Sharding 策略依赖 `_path` 唯一性**不要**手动改 `name`；任何"装饰横切"项目可借鉴此范式。

---

## 第二段：扩展范式

### 模式 6 - `Variable` + `StatelessScope`（JAX 函数式桥接）

**问题场景**：JAX 函数式 API 不允许在函数内修改全局状态，但优化器更新参数本质是 in-place mutation。两套范式打架。

**解决方案**：`backend.Variable` 包装各后端原生 Variable；`assign` 方法在 `StatelessScope` 内允许直接覆盖，scope 外抛错；`in_stateless_scope()` 探测当前上下文。

**关键参数**：
- `Variable(initializer, shape, dtype)` 工厂
- `Variable.assign(value)` 写入
- `in_stateless_scope()` 探测
- `value` 属性读取
- `trainable` 冻结层设 False

**最佳实践**：写自定义训练循环用 `backend.StatelessScope()` 包裹参数更新；评估时手动 `for layer in model.layers: layer.trainable = False`；变量共享用 `backend.Variable` 而**不是** Python 全局变量；任何"函数式/命令式桥接"项目可借鉴此范式。

### 模式 7 - `Trainer` 基类 + 后端 Mixin（5 后端 1 套 fit）

**问题场景**：fit/evaluate/predict 在 5 个后端几乎一致，但底层算子（`grad/optimizer_step/optimizer_assign`）每个后端不同。基类一把梭难优化；每个后端复制整套 Trainer bug 同步噩梦。

**解决方案**：`Trainer.__init__` 存 `_lock` / `_run_eagerly` / `_jit_compile` / `compiled` / `steps_per_execution` 5 状态；`compile` 检查 dtype_policy 自动包装 `LossScaleOptimizer`。

**关键参数**：
- `optimizer` 字符串或实例
- `jit_compile` "auto" → True
- `steps_per_execution=1` Python 调度粒度
- `LossScaleOptimizer` 混精包装
- `dtype_policy` "float32" 默认

**最佳实践**：`compile()` 是必需的，没 compile 调 `model.fit()` 抛错；`jit_compile=True` 在 jax/tf 有效，torch/numpy 无效；`steps_per_execution > 1` 减少 Python 调度；混精先看硬件支持；任何"多后端统一基类"项目可借鉴此范式。

### 模式 8 - LossScaleOptimizer 包装（fp16 梯度下溢）

**问题场景**：混合精度 fp16 存权重/梯度，但小梯度（如 `1e-8`）会下溢成 0。`update = lr * grad` 也是 0，模型不收敛。

**解决方案**：`LossScaleOptimizer` 包装内层 optimizer：`apply_gradients` 缩放 `g * scale`、调内层、`_maybe_adjust_scale` 动态调因子；`_no_nan_recently` 检查 NaN/Inf，连续 2000 步无 NaN 翻倍，有 NaN 减半 + `_skip_update`。

**关键参数**：
- `inner_optimizer` 必填
- `initial_scale=2**15` 32768
- `dynamic_growth_steps=2000`
- `_scale` 当前缩放因子
- `_no_nan_recently()` 检查

**最佳实践**：混精训练无需手动包装，`compile()` 检测到 `mixed_float16` 自动包；`initial_scale` 调小（如 `2**8`）可缓解早期 loss 爆炸；监控 `optimizer._scale` 写入 TensorBoard；jax 后端用 `jax.lax.cond` 不需要 `LossScaleOptimizer`；任何"数值缩放"项目可借鉴此范式。

### 模式 9 - Data Adapter 7 选 1（多源数据归一）

**问题场景**：用户数据可能来自 `tf.data.Dataset` / `numpy.array` / Python 生成器 / `torch.utils.data.DataLoader` / `pandas.DataFrame` / 音频列表。Trainer 不应支持 7 套遍历协议。

**解决方案**：`DATA_ADAPTERS` 列表 7 个 adapter 类；`get_data_adapter(x, y)` 循环 import 探测 `can_handle(x, y)`；首个匹配的 adapter 处理。

**关键参数**：
- `TensorFlowDatasetAdapter` tf.data
- `TorchDataAdapter` torch DataLoader
- `NumpyAdapter` 单 numpy
- `GeneratorAdapter` Python 生成器
- `ArraySlicingAdapter` 字典/列表
- `PyDatasetAdapter` `keras.utils.Sequence`
- `can_handle(x, y)` 探测函数

**最佳实践**：`tf.data.Dataset` 最高效（自动 prefetch/shuffle）；写自定义数据流继承 `keras.utils.PyDataset` 而**不是** `torch.Dataset`（跨后端）；Generator **必须** yield `x, y` 无限流；`PyDataset.__len__` 返回步数；任何"多源数据归一"项目可借鉴此范式。

### 模式 10 - Callback 钩子协议（训练 18 钩子）

**问题场景**：早停、检查点、LR 调度、TensorBoard、SWA、Mixup、混淆矩阵每个都要 epoch 开头/结尾、batch 开头/结尾插入逻辑。

**解决方案**：`Callback` 基类定义 10 钩子：`on_train_begin/end` + `on_epoch_begin/end` + `on_batch_begin/end` + `on_test_*/on_predict_*`；`logs` 参数累积 `{loss, metric, ...}`；子类只重写需要的钩子。

**关键参数**：
- `on_train_begin` 训练开始
- `on_epoch_end` 每 epoch 结束
- `on_batch_end` 每 batch 结束 logs
- `on_test_*` 评估
- `on_predict_*` 推理

**最佳实践**：写自定义 callback 时**只**重写需要的钩子；`on_batch_end` 改 `self.model` 状态会污染下一 batch（不建议）；`EarlyStopping(monitor="val_loss", patience=10, restore_best_weights=True)` 黄金组合；`ReduceLROnPlateau` 监控 `val_loss` 不用 `loss`；任何"生命周期钩子"项目可借鉴此范式。

---

## 第三段：进阶范式

### 模式 11 - `jit_compile` 自动 XLA（Python 调度开销 30%）

**问题场景**：每个 batch 的 Python 调用开销（`for layer in model.layers: layer(x)`）占总耗时 10-30%，特别是小模型。

**解决方案**：`compile` 时 `jit_compile="auto"` 判后端：JAX 总是 JIT；TF 看是否支持；torch/numpy 忽略。`@tf.function(jit_compile=True)` 包裹 `step`；`steps_per_execution=10` 累积跑 10 步消除 Python 调度。

**关键参数**：
- `jit_compile=True` 强制 XLA
- `jit_compile="auto"` 按后端判断
- `steps_per_execution=10` 累积步数
- `input_signature` 静态 shape 防 re-trace
- `tf.config.optimizer.set_jit(False)` 全局关

**最佳实践**：jax 后端**总是** `jit_compile=True`；`steps_per_execution=10` 比 `=1` 快 5-10%；变长输入用 `tf.function(input_signature=[...])` 显式指定；混精 + jit_compile 是双重加速前提；任何"图编译"项目可借鉴此范式。

### 模式 12 - `add_weight` 延迟分配（未 build 不可序列化）

**问题场景**：研究员喜欢 `__init__` 只写 `self.units = 32`，权重创建留到 `build(input_shape)`。Keras 必须保证 build 之前 `model.weights` 空、build 之后真实张量，且两态可序列化。

**解决方案**：`add_weight` 检查 `self.built`，未 build 抛错；`backend.Variable(initializer, shape, dtype)` 创建；`_track_variable` 加入 trainable/non-trainable 列表；`_open_name_scope` 用 backend name_scope。

**关键参数**：
- `shape` tuple/list
- `initializer` 字符串或 callable
- `variable_dtype` 跟 dtype_policy
- `_track_variable` 加入跟踪
- `built` bool

**最佳实践**：自定义层**永远**在 `build` 里 `self.w = self.add_weight(...)`；`add_weight(shape=..., trainable=False)` 加统计量（如 running mean）；冻结某层 `layer.trainable = False`；调用前 `assert model.built`；任何"延迟初始化"项目可借鉴此范式。

### 模式 13 - Optimizer 状态 + Variable 共享（Adam m/v 跟权重一起存）

**问题场景**：恢复训练时要加载模型权重 + Adam `m`（一阶矩）+ `v`（二阶矩）。各自保存文件管理复杂；拆开序列化加载逻辑脆弱。

**解决方案**：`Adam.__init__` 存 `self._m = []` / `self._v = []`；`build(variables)` 为每个变量配对创建 `backend.zeros_like(v)`；`amsgrad=True` 时加 `_vhat`；`save` 走 `model.save("x.keras")` 自动打包。

**关键参数**：
- `learning_rate=1e-3` 默认
- `beta_1=0.9` / `beta_2=0.999`
- `epsilon=1e-7` 数值稳定
- `amsgrad=False` AMSGrad 变种
- `clipnorm=1.0` 梯度范数裁剪

**最佳实践**：保存检查点用 `model.save("x.keras")` 一并打包；`clipnorm=1.0` 防 GAN 训练崩溃；`AdamW` 更现代 `weight_decay=1e-4`；`Lion` 优化器内存省 50%（不需要 v）；学习率调度用 `cosine_decay` 更平滑；任何"带状态优化器"项目可借鉴此范式。

### 模式 14 - 分布式 + Sharding 策略（单机 8 卡扩）

**问题场景**：多 GPU/TPU 训练要解决"梯度同步"和"模型分片"。Keras 3 把 JAX 的 `sharding` 提到 `keras.distribution` 层跨后端统一。

**解决方案**：`keras.distribution.set_distribution(distribution)` 全局设置；`DataParallel(device_mesh)` 数据并行每卡完整模型；`ModelParallel` 模型分片每卡部分层；`LayoutMap` 路径 → 设备映射（jax 专属）。

**关键参数**：
- `DataParallel` 数据并行
- `ModelParallel` 模型分片
- `DeviceMesh` 物理拓扑 axis_names
- `LayoutMap` 变量 → 设备
- `model.distribute()` 应用策略

**最佳实践**：DataParallel 默认起点，模型放不下再 ModelParallel；`device_mesh` axis_name 跟 `LayoutMap` 字符串一致；jax 后端用 `with mesh:` context 切设备；`model.distribute()` 后 `_distribution` 永久绑定；TPU pod 必须 jax + ModelParallel；任何"分布式训练"项目可借鉴此范式。

### 模式 15 - 混合精度 + Loss Scaling（fp16 训练不稳）

**问题场景**：现代 GPU fp16 算力是 fp32 的 2-8 倍。但 fp16 数值范围窄，小梯度下溢到 0 不收敛。

**解决方案**：`keras.mixed_precision.set_dtype_policy("mixed_float16")` 设策略；`compile` 自动包装 `LossScaleOptimizer`；4 策略：`float32` / `mixed_float16` / `mixed_bfloat16` / `float16`（推理）。

**关键参数**：
- `"float32"` 默认全 fp32
- `"mixed_float16"` 计算 fp16 变量 fp32
- `"mixed_bfloat16"` 计算 fp16 变量 bf16
- `"float16"` 全 fp16 推理
- `loss_scale` 缩放因子 mixed 专属

**最佳实践**：推理也用 `mixed_float16` 加速比纯 fp16 安全；TPU 必须 `mixed_bfloat16`（硬件不支持 fp16）；自定义 `compute_loss` 内部 cast 回 fp32；`policy.name` 监控写入 TensorBoard；ResNet-50 `mixed_float16` 比 fp32 快 1.5x；任何"数值精度策略"项目可借鉴此范式。

---

## 第四段：实战范式

### 模式 16 - `.keras` 文件结构（h5/pyckle 分裂统一）

**问题场景**：Keras 2 时代 `model.h5`（HDF5）+ `model.json + weights.h5` 两种格式用户头大。HDF5 库难装、加密弱、dtype 支持不全。

**解决方案**：`save_model` 用 `zipfile.ZipFile` 写 zip 包：根目录 `config.json`（架构）+ `metadata.json`（`keras_version`）；`weights/{layer.path}.npy` numpy 数组；`optimizer.json` + `optimizer/{var.path}.npy`。

**关键参数**：
- `config.json` 模型架构
- `metadata.json` keras_version
- `weights/{path}.npy` 权重
- `optimizer.json` 优化器配置
- `architecture.txt` ASCII 图
- `save_format` "keras" 或 "h5"

**最佳实践**：默认 `model.save("x.keras")`；h5 格式仅迁移老模型用 `save_format="h5"`；`.keras` 是 zip 可 `unzip -l x.keras` 看内部；`tf.saved_model` 仍是部署 TF Serving 标准；PyTorch 加载先 `keras.models.load_model` 再遍历权重迁移；任何"统一序列化格式"项目可借鉴此范式。

### 模式 17 - Metrics State + 跨 epoch 累积（SparseCategoricalAccuracy）

**问题场景**：每个 metric 在每 batch 算一次结果（如 `acc = correct / total`），但 epoch 结束要整个 epoch 均值。简单 `mean(batch_results)` 对正确率不是数学均值。

**解决方案**：`Metric(Layer)` 基类用 `_metrics_dict: dict` 存累加器；`update_state(y_true, y_pred, sample_weight)` 子类实现累加；`result()` 子类实现从累加器计算；`reset_state()` epoch 开始清零。

**关键参数**：
- `update_state` 单 batch 更新
- `result()` 当前累积值
- `reset_state` 清零
- `sample_weight` 样本权重
- `MeanMetricWrapper` 自动包装 mean
- `dtype` 累积精度

**最佳实践**：自定义 metric 只重写 `update_state` 和 `result` **不要**管 `reset_state`；`Mean` 用在 `loss`（本身就是均值），`Accuracy` 用在正确率；`AUC` 需要 `from_logits=True` 当 y_pred 是 softmax 前输出；`compile(metrics=[my_metric])` 实例每次 epoch 复用；任何"有状态指标"项目可借鉴此范式。

### 模式 18 - `Layer` 嵌套 + 路径名（sharding/checkpoint 按路径取）

**问题场景**：JAX pjit 的分区编译需要每个变量知道自己分到哪块设备。最自然按"层路径"映射：`dense_1` 放 GPU 0，`dense_2` 放 GPU 1。

**解决方案**：`Layer._open_name_scope` 推 `backend.name_scope_stack`；`__setattr__` 检查 `isinstance(value, Layer)` 自动设 `_parent_path`；`LayoutMap["dense_1.*"]` 通配匹配层名到设备。

**关键参数**：
- `_path` 当前层路径 list
- `name_scope_stack` 全局栈
- `LayoutMap` 路径 → 设备
- `device_mesh` 设备拓扑
- `_parent_path` 父层路径
- `current_path()` 读栈

**最佳实践**：写大模型按"按层分片"思维组织（Transformer block 整体一卡）；`name` 冲突 `auto_name` 加 `_1`/`_2` 后缀路径仍稳定；`LayoutMap["dense.*"]` 通配；checkpoint 按 path 索引加载时路径必须一致（改模型结构要重新训练）；任何"嵌套命名空间"项目可借鉴此范式。

### 模式 19 - API 自动生成（双名空间统一）

**问题场景**：Keras 有 `keras.layers.Dense` / `keras.applications.ResNet50` / `keras.optimizers.Adam` 几十个入口，手动维护 `__init__.py` 会漏。

**解决方案**：`api_gen.py` 遍历 `keras/src` 子包 + `inspect.getmembers` 找带 `_keras_api_names` 属性的类；`keras_export(["keras.X", "keras.layers.X"])` 一物多挂；CI 跑 `api_gen.py` 检查导出表与实际注册一致。

**关键参数**：
- `_keras_api_names` `keras_export` 装饰挂的属性
- `api_gen.py` CI 自动跑
- `keras_export(["keras.X", ...])` 双挂
- `pip_build.py` 打包前再跑
- `_keras_version` 版本号

**最佳实践**：自定义层加 `@keras_export("keras.layers.MyLayer")` 才有官方命名；CI 跑 `api_gen.py` 检查；`_tf_keras` 子包是 `tf.keras` 兼容垫片不参与 api_gen；`pip install keras` 后导入 `keras.applications` 才触发子包 import 延迟加载；任何"双名空间 API"项目可借鉴此范式。

### 模式 20 - 多后端回归矩阵（5×3×3 = 45 组合）

**问题场景**：Keras 在 5 个后端 + 5 Python 版本 + 多个 OS 跑。任何一处 `tf.zeros_like` 在 jax 端可能不工作。CI 跑全矩阵确保 release 质量。

**解决方案**：`integration_tests/` + `BACKENDS = ["tensorflow", "jax", "torch"]` + `PYTHONS = ["3.10", "3.11", "3.12"]` + `OSES = ["ubuntu-latest", "macos-latest", "windows-latest"]`；三重 for 循环 `subprocess.run("pytest integration_tests/ -x", env=KERAS_BACKEND=...)`。

**关键参数**：
- `KERAS_BACKEND` 环境变量切后端
- `pytest -x` 失败即停
- `integration_tests/` 跨后端真实模型
- `benchmarks/` 性能回归
- `nightly` GitHub Actions schedule
- `tpu_tests` google-internal

**最佳实践**：提 PR 时 CI 自动跑 5×3×3=45 矩阵，本地只测一个后端；`benchmarks/keras_vs_torch_ctl.py` 监控后端性能回归；jax 后端 `jit_compile` bug 难复现优先看 jax tests 日志；跨后端代码用 `backend.function` 包装**不要**直接 `jax.jit`/`tf.function`；任何"跨后端测试矩阵"项目可借鉴此范式。
