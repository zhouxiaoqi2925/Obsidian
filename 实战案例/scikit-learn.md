# scikit-learn - Python 机器学习事实标准与 Estimator 协议教科书

**GitHub**: scikit-learn/scikit-learn
**Star**: 62k+
**语言**: Python (~70%) / Cython / C++
**主题**: machine-learning / estimator-api / fit-predict-transform / pipeline
**适用场景**: 学习统一 ML API 设计、Mixin 模式、Pipeline 组合、Cython 性能优化、保守技术选型

---

## 第一段：Estimator 协议与设计基石

### 模式 1：fit / predict / transform 三件套

**问题场景**：ML 算法 30+ 种（线性回归 / 随机森林 / KMeans / PCA），每种 API 不一样——`train()` / `learn()` / `fit()` / `compute()` 五花八门；Pipeline / GridSearch 难统一。生态分裂让用户每学一个库就要重学 API。

**解决方案**：fit / predict / transform 三件套——`fit(X, y)` 训练（监督学习有 y，无监督可 None），`predict(X)` 监督学习预测，`transform(X)` 特征工程变换，`fit_transform(X, y)` 一气呵成。所有 estimator 必走此协议。

```python
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA

# 监督学习（fit + predict）
clf = LogisticRegression()
clf.fit(X_train, y_train)
y_pred = clf.predict(X_test)

# 特征工程（fit + transform）
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)  # 关键：test 走 transform 而非 fit_transform

# 无监督学习（fit + predict 无 y）
kmeans = KMeans(n_clusters=3)
kmeans.fit(X)                                # 无 y
labels = kmeans.predict(X)                    # predict 不需要 y
# 或 fit_transform
pca = PCA(n_components=2)
X_2d = pca.fit_transform(X)                   # fit + transform
```

**关键参数**：
- `fit(X, y=None)` = 训练入口，所有 estimator 必有
- `predict(X)` = 监督学习预测（Classifier / Regressor）
- `transform(X)` = 特征变换（Scaler / Encoder / Selector）
- `fit_transform(X, y)` = 链式调用，常在 Pipeline 内部用
- `fit_predict(X)` = 无监督学习合一（KMeans / SpectralClustering）
- `clone(estimator)` = 深拷贝（GridSearch 用，防状态污染）
- 状态保存 = `fit()` 后 `self.` 保存训练参数（`self.coef_` / `self.classes_`）

**最佳实践**：库设计 API 时强制 1-2 个核心方法 + 一致命名（fit / predict / transform）——让 Pipeline / GridSearch 等元能力通用化；所有 estimator 必有 `fit` 方法；test 集永远走 `transform` 不走 `fit_transform`（防数据泄漏）。

### 模式 2：Mixin 模式组合能力

**问题场景**：每个分类器要实现 `score()` 方法（accuracy）、`fit()`、`predict()`——重复代码多；想给所有分类器加新能力（如 `predict_proba`）困难。菱形继承复杂。

**解决方案**：Mixin 模式——`ClassifierMixin` / `RegressorMixin` / `TransformerMixin` 各提供默认实现，`BaseEstimator` 提参数协议，组合 = 完整类。能力可叠加，无菱形继承。

```python
# sklearn/base.py
class BaseEstimator:
    """所有 estimator 基类：参数协议"""
    def get_params(self, deep=True):
        return {k: v for k, v in self.__dict__.items() if not k.endswith('_')}
    def set_params(self, **params):
        for k, v in params.items():
            setattr(self, k, v)
        return self

class ClassifierMixin:
    """所有分类器 Mixin：默认 score = accuracy"""
    def score(self, X, y, sample_weight=None):
        from sklearn.metrics import accuracy_score
        return accuracy_score(y, self.predict(X), sample_weight=sample_weight)

class TransformerMixin:
    """所有 transformer Mixin：默认 fit_transform = fit + transform"""
    def fit_transform(self, X, y=None, **fit_params):
        if y is None:
            return self.fit(X, **fit_params).transform(X)
        else:
            return self.fit(X, y, **fit_params).transform(X)

# 组合：完整分类器只需写 fit + predict
class LogisticRegression(ClassifierMixin, BaseEstimator):
    def __init__(self, C=1.0):
        self.C = C
    def fit(self, X, y):
        # 训练逻辑
        return self
    def predict(self, X):
        # 预测逻辑
        return self._predict_internal(X)
    # score 方法自动继承（accuracy）
```

**关键参数**：
- 根 = `BaseEstimator`（`get_params` / `set_params`）
- Mixin = `ClassifierMixin`（`score` 默认 accuracy）
- 组合 = `class LogisticRegression(ClassifierMixin, BaseEstimator)`
- 不重复 = `score` 一次写，所有分类器受益
- 新能力 = 改 Mixin 一次，全网生效
- MRO 顺序 = Mixin 在 BaseEstimator 前（Mixin 用 BaseEstimator 能力）

**最佳实践**：库设计能力复用走 Mixin 模式（vs. 继承）——避免菱形继承，能力可叠加；新能力加 Mixin 而非改基类（向后兼容）；Mixin 命名以 `Mixin` 结尾（标识用途）。

### 模式 3：集中输入检查 check_array

**问题场景**：用户喂 Pandas DataFrame / 稀疏矩阵 / 字符串标签 / NaN / inf——30+ estimator 各自报错信息不一致；用户记 API 差异崩溃。`TypeError: float() argument must be a string...` 不可读。

**解决方案**：`sklearn/utils/validation.py` 的 `check_array` / `check_X_y` 集中检查——所有 estimator `fit` 前必调，错误信息一致。5 步检查：类型 → 转 ndarray → dtype → finite → shape。

```python
# sklearn/utils/validation.py
from sklearn.utils.validation import check_array, check_X_y

class MyClassifier(ClassifierMixin, BaseEstimator):
    def fit(self, X, y):
        # 集中检查入口
        X, y = check_X_y(
            X, y,
            accept_sparse=True,           # 接受 csr/csc/coo
            dtype='numeric',              # 自动转 float64
            force_all_finite=True,        # 拒绝 NaN/inf
            ensure_2d=True,               # 必须 2D
            allow_nd=False,
        )
        # 此处 X 是干净的 ndarray，y 是 1D 标签
        self.classes_ = np.unique(y)
        # ... 训练逻辑
        return self

    def predict(self, X):
        X = check_array(X, accept_sparse=True)   # 预测时也检查
        return self._predict_internal(X)
```

**关键参数**：
- 5 步检查 = 类型 → 转 ndarray → dtype → finite → shape
- `accept_sparse` = 接受 csr / csc / coo（`False` / `True` / `'csr'`）
- `dtype='numeric'` = 自动转 float64
- `force_all_finite=True` = 拒绝 NaN / inf（设 `False` 允许）
- `ensure_2d=True` = 必须 2D（`False` 允许 1D）
- `estimator=` 参数 = 错误信息含 estimator 名
- 一致错误 = "Found X with feature name ..., expected ..."

**最佳实践**：库的统一错误信息是用户体验核心——所有 API 入口前调 `check_array` / `check_X_y`；用 `estimator=` 参数让错误信息含具体 estimator 名；接受稀疏矩阵时设 `accept_sparse=True` 兼容 scipy.sparse。

### 模式 4：Pipeline 链式组合

**问题场景**：ML 工作流是"预处理 → 特征选择 → 模型 → 后处理"——每步单独跑、传 ndarray 易错；想用 GridSearch 调"预处理参数"难；用户手动串联导致数据泄漏。

**解决方案**：`Pipeline([('scaler', StandardScaler()), ('clf', LogisticRegression())])`——把多步当一个 estimator，可直接喂 GridSearchCV。自动隔离 fit/transform 防数据泄漏。

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV

# 串成 Pipeline
pipe = Pipeline([
    ('scaler', StandardScaler()),        # 步骤 1：标准化
    ('pca', PCA(n_components=10)),       # 步骤 2：降维
    ('clf', LogisticRegression()),       # 步骤 3：分类
])

# 直接用（自动 fit 顺序、predict 顺序）
pipe.fit(X_train, y_train)
y_pred = pipe.predict(X_test)

# 嵌套调参（双下划线分隔）
param_grid = {
    'pca__n_components': [5, 10, 20],
    'clf__C': [0.1, 1.0, 10.0],
}
grid = GridSearchCV(pipe, param_grid, cv=5)
grid.fit(X_train, y_train)
print(grid.best_params_)  # {'pca__n_components': 10, 'clf__C': 1.0}
```

**关键参数**：
- 步骤命名 = 元组列表（`name, estimator`）
- 中间传递 = `step.transform(X)` 传给下一步
- `clf__lr__C=0.1` = Pipeline 嵌套设参（`__` 分隔）
- `fit(X, y)` = 顺序调每步 fit + transform
- `predict(X)` = 顺序调每步 transform + 最后 predict
- `memory=` = 缓存 transform 结果（避免重复计算）
- 最后一步必须 = Classifier / Regressor（能 predict）

**最佳实践**：ML 工作流必须用 Pipeline 串起来——避免"中间 ndarray 拷贝 + 难嵌套调参"两个大坑；Pipeline 内部自动隔离 fit（只在 train 上 fit_transform）和 predict（test 只 transform）防数据泄漏；用 `memory='./cache'` 缓存 Pipeline 步提速。

### 模式 5：ColumnTransformer 异构列

**问题场景**：Pandas DataFrame 异构（数值 + 类别 + 文本），sklearn 早期只能"全数值"或"全类别"——异构列拆开处理难。手动 `df[['num']].values` + `df[['cat']].values` 拆来拆去。

**解决方案**：`ColumnTransformer([('num', StandardScaler(), [0,1]), ('cat', OneHotEncoder(), [2,3])])` ——每列单独 transformer，Pipeline 一部分。`remainder` 控制未指定列，`sparse_threshold` 控制稀疏。

```python
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.pipeline import Pipeline
import pandas as pd

df = pd.DataFrame({
    'age': [25, 30, 35],                  # 数值
    'income': [50000, 60000, 70000],      # 数值
    'city': ['NYC', 'LA', 'Chicago'],     # 类别
    'gender': ['M', 'F', 'M'],            # 类别
})

# 异构列分别处理
preprocessor = ColumnTransformer(
    transformers=[
        ('num', StandardScaler(), ['age', 'income']),            # 数值列
        ('cat', OneHotEncoder(handle_unknown='ignore'), ['city', 'gender']),  # 类别列
    ],
    remainder='drop',                       # 未指定列 = drop（'passthrough' 保留）
    sparse_threshold=0.3,                   # 稀疏矩阵切换阈值
)

# 嵌入 Pipeline
pipe = Pipeline([
    ('preprocessor', preprocessor),
    ('clf', LogisticRegression()),
])
pipe.fit(df, y)
```

**关键参数**：
- 列选择 = 列索引 `[0,1]` / 列名 `['age']` / 函数 `lambda x: x > 0`
- `remainder` = `'drop'`（丢弃）/ `'passthrough'`（保留）
- `sparse_threshold` = 默认 0.3（稀疏矩阵切换）
- `n_jobs` = 并行 transform
- 集成 = `Pipeline([('ct', ColumnTransformer(...)), ('clf', ...)])`
- `verbose_feature_names_out=False` = 输出列名简化

**最佳实践**：异构数据预处理必用 ColumnTransformer——按列分流，避免手动 `df[['num']].values` + `df[['cat']].values` 拆来拆去；列名优先于列索引（DataFrame 列名稳定）；`remainder='passthrough'` 保留未指定列（如目标 leak 风险评估）。

---

## 第二段：核心实现与性能优化

### 模式 6：BaseEstimator 深拷贝参数协议

**问题场景**：Pipeline 嵌套 GridSearch 调参——`clf__lr__C=0.1` 这种嵌套键怎么 set/get？子类化 estimator 时参数管理混乱。

**解决方案**：`BaseEstimator.get_params(deep=True)` 递归遍历——子 estimator 也调 get_params，键前缀 = `父__子`。`set_params(**params)` 反向设置。

```python
from sklearn.base import BaseEstimator

class MyEstimator(BaseEstimator):
    def __init__(self, lr=None, n_iter=100):
        # 关键：__init__ 必须显式存参数为 self.attr
        self.lr = lr                       # 子 estimator
        self.n_iter = n_iter

    def get_params(self, deep=True):
        params = {'lr': self.lr, 'n_iter': self.n_iter}
        if deep and hasattr(self.lr, 'get_params'):
            # 递归拿子 estimator 参数
            sub_params = self.lr.get_params(deep=True)
            params.update({f'lr__{k}': v for k, v in sub_params.items()})
        return params

    def set_params(self, **params):
        for k, v in params.items():
            if '__' in k:
                # 嵌套设置：lr__C=0.1 → self.lr.C=0.1
                attr, sub = k.split('__', 1)
                getattr(self, attr).set_params(**{sub: v})
            else:
                setattr(self, k, v)
        return self
```

**关键参数**：
- 深拷贝 = `deep=True` 递归遍历子 estimator
- 双下划线分隔 = `clf__lr__C`（父步骤 + 子步骤 + 参数）
- `set_params(**params)` = 反向设置（支持嵌套）
- 用例 = `GridSearchCV(Pipeline(...), {'clf__C': [0.1, 1, 10]})`
- 约束 = 参数必须是 `__init__` 显式声明（`self.attr = value`）
- 严禁 = `*args` / `**kwargs` 接收（GridSearch 无法发现参数）

**最佳实践**：所有 estimator `__init__` 显式声明参数（不要 `*args` / `**kwargs`）——GridSearch 依赖此协议；子 estimator 走 `set_params` 递归设置；用 `clone()` 深拷贝 estimator 防 GridSearch 状态污染。

### 模式 7：HistGradientBoosting 分桶加速

**问题场景**：传统 GradientBoosting 每棵树要遍历每个样本找分裂点——O(n) 慢；LightGBM / XGBoost 用分桶（binning）快 10 倍。sklearn 早期 GBDT 性能不可用。

**解决方案**：`HistGradientBoosting` 借鉴 LightGBM——连续特征分桶成 256 bin，每 bin 一个直方图，分裂时只查 bin，O(n) 变 O(bin)。`max_bins=255` 可调。

```python
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.datasets import make_classification
import time

X, y = make_classification(n_samples=100_000, n_features=50, random_state=42)

# 传统 GBDT（慢）
from sklearn.ensemble import GradientBoostingClassifier
start = time.time()
gb = GradientBoostingClassifier(n_estimators=100, max_depth=5)
gb.fit(X, y)
print(f"GBDT: {time.time() - start:.2f}s")        # 50s+

# HistGB（快 10x）
start = time.time()
hgb = HistGradientBoostingClassifier(max_iter=100, max_depth=5, max_bins=255)
hgb.fit(X, y)
print(f"HistGB: {time.time() - start:.2f}s")      # 5s
```

**关键参数**：
- 分桶 = `max_bins=255` 默认（2-255）
- 直方图 = 每 bin 一个累积梯度 + 计数
- 决策树分裂 = 选 bin 边界，O(bin) 而非 O(n)
- `max_iter` = 树数量（`n_estimators` 别名）
- 速度 = 提升 10x，逼近 XGBoost
- 0.22+ 稳定 = 替代 `GradientBoostingClassifier`

**最佳实践**：中等数据（10k-1M 行）用 HistGradientBoosting——比 XGBoost 简单（无外部依赖）、比传统 GBDT 快 10x；`max_bins=255` 默认够用（小数据集可降到 64）；`early_stopping=True` 自动停训练。

### 模式 8：Cross Validation 拆分

**问题场景**：单次 train_test_split 不稳定，模型评估有方差；K-fold CV 给稳定估计但实现各异。分类 / 回归 / 时序 / 分组数据需要不同拆分。

**解决方案**：`sklearn/model_selection/_split.py` 提供 KFold / StratifiedKFold / TimeSeriesSplit / GroupKFold——统一接口喂给 `cross_val_score`。`n_splits=5` 默认。

```python
from sklearn.model_selection import (
    KFold, StratifiedKFold, TimeSeriesSplit, GroupKFold,
    cross_val_score,
)
from sklearn.linear_model import LogisticRegression

# 1. 标准 K-fold（回归）
kfold = KFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(LogisticRegression(), X, y, cv=kfold, scoring='accuracy')
print(f"Mean: {scores.mean():.3f} ± {scores.std():.3f}")

# 2. 分层 K-fold（分类保类别比例）
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(LogisticRegression(), X, y, cv=skf)

# 3. 时序拆分（不 shuffle，时间递增）
tscv = TimeSeriesSplit(n_splits=5)
for train_idx, val_idx in tscv.split(X):
    X_train, X_val = X[train_idx], X[val_idx]

# 4. 组 K-fold（同组样本不跨折）
gkf = GroupKFold(n_splits=5)
scores = cross_val_score(
    LogisticRegression(), X, y, groups=patient_ids, cv=gkf
)
```

**关键参数**：
- `KFold` = 标准 K 折（`n_splits=5` 默认）
- `StratifiedKFold` = 分类任务保类别比例（推荐分类默认）
- `TimeSeriesSplit` = 时序数据（不 shuffle，时间递增）
- `GroupKFold` = 同组样本不跨折（医学/用户数据）
- `cross_val_score` = 跑 K 折 + 聚合分数
- `shuffle=True` = 洗牌（默认 False，时序必须 False）
- `random_state=42` = 可复现

**最佳实践**：分类必用 StratifiedKFold、时序必用 TimeSeriesSplit——K-fold 默认仅适用回归；`shuffle=True` + `random_state=42` 保证可复现；用 `cross_validate` 拿多个指标（vs `cross_val_score` 单指标）。

### 模式 9：_loss 独立 Cython 损失函数库

**问题场景**：LinearRegression / SGD / HistGB 各自实现 loss 函数——重复且难统一性能优化；想换 loss 要改多个 estimator。

**解决方案**：`sklearn/_loss/` 独立 Cython 损失库——Loss 类独立于算法，多个 estimator 复用同一实现。Loss 子类化基类，定义 `grad` / `hess` /`loss` 三个 Cython 方法。

```python
# sklearn/_loss/loss.py（基类）
class Loss:
    """Loss 函数基类（Cython 优化）"""
    def loss(self, y_true, raw_pred, sample_weight=None):
        # 计算损失值
        ...
    def gradient(self, y_true, raw_pred, sample_weight=None):
        # 一阶导
        ...
    def hessian(self, y_true, raw_pred, sample_weight=None):
        # 二阶导（GBDT 用）
        ...

class SquaredError(Loss):
    """最小二乘损失"""
    def loss(self, y_true, raw_pred, sample_weight=None):
        return ((y_true - raw_pred) ** 2).mean()
    def gradient(self, y_true, raw_pred, sample_weight=None):
        return 2 * (raw_pred - y_true)
    def hessian(self, y_true, raw_pred, sample_weight=None):
        return np.full_like(y_true, 2.0)

# LinearRegression / HuberRegressor / SGD 复用
class LinearRegression(BaseEstimator, RegressorMixin):
    def fit(self, X, y):
        loss = SquaredError()
        grad = loss.gradient(y, X @ self.coef_, sample_weight=sample_weight)
        # ... 复用同一 loss 实现
```

**关键参数**：
- 独立 = `sklearn/_loss/loss.py`（基类 + 子类）
- 优化 = Cython + OpenMP 并行
- 复用 = LinearRegression / HuberRegressor / SGD 都用同一 Loss
- 灵活性 = 用户可传自定义 loss
- 速度 = Cython 比纯 Python 快 20-50x
- 损失类型 = SquaredError / AbsoluteError / Huber / LogLoss / HalfBinomialLoss

**最佳实践**：库代码把"算法 + 损失"解耦——损失函数集中维护，算法按需选；自定义 loss 继承 `BaseLoss` 实现 `loss` / `grad` / `hess` 三方法；Loss 类用 Cython 实现保证性能。

### 模式 10：Estimator Checks 统一测试套件

**问题场景**：用户实现自己的 estimator（继承 BaseEstimator）——怎么验证"符合协议"？第三方库（XGBoost / LightGBM / imblearn）如何保证和 sklearn 兼容？

**解决方案**：`estimator_checks.py` 跑统一测试——所有子类化 BaseEstimator 的类都跑"协议测试"（fit / predict / clone / get_params / set_params 一致性）。`check_estimator(MyEstimator)` 返回 pytest 测试。

```python
# sklearn/utils/estimator_checks.py
from sklearn.utils.estimator_checks import check_estimator
import pytest

# 自动生成 30+ 测试项
def test_my_estimator_compliance():
    return check_estimator(MyCustomClassifier())

# 30+ 检查项包括：
# - get_params / set_params 一致性
# - clone 后等价
# - fit 后 predict 一致性
# - 必为 2D 数组输入检查
# - sparse 矩阵支持
# - DataFrame 列名支持
# - classes_ 属性存在（分类器）
# - feature_importances_ 属性存在（树模型）
# ...

# 第三方库用此测试保证兼容
# xgboost: XGBClassifier 通过 check_estimator
# lightgbm: LGBMClassifier 通过 check_estimator
# imblearn: SMOTE / BalancedRandomForest 通过 check_estimator
```

**关键参数**：
- 协议测试 = 30+ 检查项（`check_estimator`）
- 自动跑 = `check_estimator(MyEstimator)` 返回 pytest 测试
- 复用 = scikit-learn-contrib 项目都用此模式
- 一致性 = 新 estimator 必须通过才能入库
- 库例 = `xgboost` / `lightgbm` / `imblearn` 都按此规范
- 检查项 = `check_classifiers_predictions` / `check_transformers` / `check_pipeline_consistency`

**最佳实践**：库设计时为"插件作者"提供统一测试套件——保证生态一致 + 减少重复 review；新 estimator 入库前必跑 `check_estimator`；第三方 sklearn 兼容库必跑 `check_estimator` 验证。

---

## 第三段：现代算法与高级用法

### 模式 11：Array API 跨后端（numpy / cupy / torch）

**问题场景**：sklearn 历史上绑 NumPy，CuPy / PyTorch / JAX 后端要重写——分布式 GPU 训练难。GPU 上 NumPy 不可用。

**解决方案**：1.5+ 引入 Array API——`array_api` 命名空间抽象，统一 numpy / cupy / torch backend。`np.asarray(X)` 一致入口转换。CuPy 后端在 GPU 上 5-20x 加速。

```python
# sklearn/utils/array_api.py（抽象层）
import numpy as np
from sklearn.utils.array_api import get_namespace

# 检测输入是 numpy 还是 cupy，返回对应命名空间
def my_function(X):
    xp, _ = get_namespace(X)              # 返回 (cupy, ...) 或 (numpy, ...)
    return xp.mean(X, axis=0)             # 用 xp 调用，自动适配后端

# 用法：numpy（默认）
import numpy as np
X_np = np.random.rand(100, 5)
result = my_function(X_np)                 # 内部用 numpy

# 用法：cupy（GPU）
import cupy as cp
X_cp = cp.random.rand(100, 5)
result = my_function(X_cp)                 # 内部用 cupy（GPU 加速）
```

**关键参数**：
- 抽象层 = `sklearn.utils.array_api`
- 转换 = `X = np.asarray(X)` 一致入口
- 后端 = numpy（默认） / cupy（GPU） / torch
- 限制 = 部分算法不支持（依赖稀疏）
- 性能 = CuPy 后端在 GPU 上 5-20x
- `get_namespace(X)` = 返回对应后端的 `xp` 模块

**最佳实践**：新代码走 Array API 抽象——未来 GPU / TPU 后端零成本切换；避免硬编码 `import numpy as np`，改用 `get_namespace(X)` 拿 `xp`；不依赖 numpy 特有 API（如 `np.matrix`）。

### 模式 12：TargetEncoder 监督编码（高基数类别）

**问题场景**：OneHotEncoder 把类别列变稀疏矩阵（10k 类别 = 10k 列）；高基数类别（城市、产品 ID）维度爆炸。OneHot 难训 + 难推理。

**解决方案**：1.5+ TargetEncoder——用目标变量 y 的均值编码类别列（带 smoothing 避免过拟合），单列输出。`smoothing=10.0` 贝叶斯先验，CV 编码防泄漏。

```python
from sklearn.preprocessing import TargetEncoder
import numpy as np

# 高基数类别
X = np.array([['NYC'], ['LA'], ['NYC'], ['Chicago'], ['LA']] * 20)
y = np.random.rand(100)

# 传统 OneHot（10k 类别 = 10k 列）
from sklearn.preprocessing import OneHotEncoder
oh = OneHotEncoder(handle_unknown='ignore')
X_oh = oh.fit_transform(X)                 # (100, 3) 稀疏

# TargetEncoder（单列输出）
te = TargetEncoder(smooth=10.0, target_type='binary')
X_te = te.fit_transform(X, y)             # (100, 1) 稠密
# 内部：encoding = (count*category_mean + smooth*global_mean) / (count + smooth)
```

**关键参数**：
- 编码 = `mean(y[category == c])` 类别均值
- 平滑 = `smooth=10.0`（贝叶斯先验，0=无平滑）
- `target_type` = `'binary'` / `'continuous'` / `'multiclass'`
- CV 编码 = 训练用 K-fold 防泄漏（`cv=5`）
- 优势 = 单列 vs OneHot 的 N 列
- 适用 = 高基数类别（k>100）
- 风险 = 数据泄漏（必须 CV 编码）

**最佳实践**：高基数类别特征用 TargetEncoder——一列替代 N 列，配合 smoothing 防过拟合；训练用 CV 编码（`fit_transform` 内部 K-fold）防数据泄漏；与 OneHot 组合用（高基数用 TE、低基数用 OHE）。

### 模式 13：StackingClassifier 多层堆叠

**问题场景**：单一模型性能瓶颈；多个模型简单投票（VotingClassifier）平均——但不同模型擅长不同样本。竞赛冲分场景。

**解决方案**：`StackingClassifier([('rf', RandomForest()), ('gb', HistGB()), ('meta', LogisticRegression())])`——第一层多模型预测，第二层用预测结果当特征训练元模型。K-fold 防泄漏。

```python
from sklearn.ensemble import StackingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.model_selection import train_test_split

# 三层模型 + 元模型
estimators = [
    ('rf', RandomForestClassifier(n_estimators=100)),
    ('gb', HistGradientBoostingClassifier(max_iter=100)),
    ('svm', SVC(probability=True)),
]
stack = StackingClassifier(
    estimators=estimators,
    final_estimator=LogisticRegression(),  # 元模型
    cv=5,                                  # K-fold 防泄漏
    passthrough=False,                     # 是否把原 X 也喂给元模型
)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
stack.fit(X_train, y_train)
print(f"Accuracy: {stack.score(X_test, y_test):.3f}")
```

**关键参数**：
- 第一层 = 多 estimator 并行（`estimators` 列表）
- 第二层 = `final_estimator`（默认 LogisticRegression）
- 训练 = `fit(X, y)` 内部 K-fold 防泄漏
- 预测 = 第一层 predict → 第二层 predict
- `passthrough=False` = 是否把原 X 也喂给元模型
- `cv=5` = 内部 K-fold 数
- 风险 = 容易过拟合（两层参数都要调）

**最佳实践**：竞赛冲分用 StackingClassifier——比单一模型 1-3% 提升，代价是训练时间 2-3x；用不同性质的模型（树 + 线性 + KNN）做第一层；元模型用简单模型（LR）避免过拟合；用 `passthrough=False` 默认即可。

### 模式 14：Cython + OpenMP 性能优化

**问题场景**：纯 Python 实现 KMeans / PCA 慢 10-50x；想用 C 扩展但维护成本高。NumPy 广播有时也不够用。

**解决方案**：Cython 写性能热点（`_kmeans.pyx` / `_cdfast.pyx`），Python 写高层逻辑；OpenMP 并行 for 循环。`meson + ninja` 替代 setup.py（2024+）。

```python
# sklearn/cluster/_kmeans.pyx（Cython 性能热点）
# cython: boundscheck=False, wraparound=False, cdivision=True
# distutils: language = c
import numpy as np
cimport numpy as cnp
from cython.parallel import prange

def _kmeans_single_lloyd(cnp.ndarray[double, ndim=2, mode='c'] X,
                          cnp.ndarray[double, ndim=2, mode='c'] centers,
                          int max_iter=300):
    """Lloyd 算法（Cython + OpenMP 并行）"""
    cdef int n_samples = X.shape[0]
    cdef int n_features = X.shape[1]
    cdef int n_clusters = centers.shape[0]
    cdef double[:] distances = np.zeros(n_samples)
    cdef int[:] labels = np.zeros(n_samples, dtype=np.int32)
    cdef int i, j, k, label
    cdef double min_dist, dist
    
    for iteration in range(max_iter):
        # 分配样本到最近中心（OpenMP 并行）
        for i in prange(n_samples, nogil=True, schedule='static'):
            min_dist = np.inf
            label = 0
            for j in range(n_clusters):
                dist = 0.0
                for k in range(n_features):
                    dist += (X[i, k] - centers[j, k]) ** 2
                if dist < min_dist:
                    min_dist = dist
                    label = j
            labels[i] = label
            distances[i] = min_dist
        # ... 更新中心
    return np.asarray(labels), np.asarray(distances)
```

**关键参数**：
- Cython = Python 超集 + C 类型声明
- 类型 = `cdef double x`（vs. `x: float`）
- 编译 = `meson + ninja`（2024+ 替代 setup.py）
- 并行 = `prange` + `# pragma omp parallel`
- `nogil=True` = 释放 GIL 允许多线程
- 性能 = 20-50x 提升

**最佳实践**：Python 库性能热点用 Cython——比纯 Python 快 20-50x，比 C 扩展易维护 5x；用 `cdef` 声明 C 类型；循环加 `prange` OpenMP 并行；用 `nogil=True` 释放 GIL。

### 模式 15：fit_transform 数据泄漏陷阱

**问题场景**：用户在 train+test 上都 `fit_transform(StandardScaler, ...)`——test 数据信息泄漏到训练，模型评估虚高。这是 ML 最常见错误。

**解决方案**：Pipeline 默认行为——`Pipeline.fit(X_train, y_train)` 时各步 `fit_transform(X_train)`；`Pipeline.predict(X_test)` 时各步 `transform(X_test)`。自动隔离。

```python
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# 错误：数据泄漏（test 信息进 fit）
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)   # fit + transform
X_test_scaled = scaler.fit_transform(X_test)    # 又 fit！test 信息泄露到 train 评估
# 结果：模型评估虚高（生产环境表现差）

# 正确：fit 只在 train 上跑
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)   # fit + transform
X_test_scaled = scaler.transform(X_test)         # 仅 transform（用 train 算的 mean/std）

# 最佳：自动隔离（Pipeline）
from sklearn.pipeline import Pipeline
pipe = Pipeline([('scaler', StandardScaler()), ('clf', LogisticRegression())])
pipe.fit(X_train, y_train)         # scaler.fit_transform(X_train) + clf.fit(...)
pipe.predict(X_test)               # scaler.transform(X_test) + clf.predict(...)
# 内部完全隔离，绝不泄漏
```

**关键参数**：
- 正确 = `pipe.fit(X_train)` 后 `pipe.predict(X_test)`（自动隔离）
- 错误 = `scaler.fit_transform(X_train)` + `scaler.fit_transform(X_test)`（泄漏）
- 解决 = 用 Pipeline 自动隔离
- 反例 = 训练集 fit + 验证集 transform（vs. fit_transform）
- 隐患 = 验证集 fit_transform 用 test 集的均值/方差 → 评估虚高

**最佳实践**：永远用 Pipeline 串起预处理——fit_transform 自动只在 train 上跑，test 走 transform；手动调 `fit_transform` 时只在 train 上调，test 调 `transform`；写单测验证无泄漏（用 assert 检查 `scaler.mean_` 在 transform 后不变）。

---

## 第四段：生态选型与扩展

### 模式 16：HistGradientBoosting vs LightGBM vs XGBoost

**问题场景**：GBDT 选 sklearn HistGB（无外部依赖） / LightGBM（更快 + 类别特征） / XGBoost（生态最广）哪个？性能 / 易用性 / 生态 / 类别特征支持如何权衡？

**解决方案**：轻量项目用 HistGB（集成 scikit-learn 一致性），竞赛 / 性能敏感用 LightGBM（直方图 + 类别特征 + early stopping），生态需求用 XGBoost。

```python
# 三种 GBDT 对比
from sklearn.ensemble import HistGradientBoostingClassifier
import lightgbm as lgb
import xgboost as xgb

# 1. sklearn HistGB（无外部依赖，API 一致）
hgb = HistGradientBoostingClassifier(max_iter=100, max_depth=5)
hgb.fit(X_train, y_train)
# 优势：sklearn 原生，Pipeline / GridSearch 直接用

# 2. LightGBM（最快，类别特征原生支持）
lgb_clf = lgb.LGBMClassifier(n_estimators=100, learning_rate=0.05, num_leaves=31)
lgb_clf.fit(X_train, y_train, categorical_feature=['city', 'gender'])
# 优势：直方图 + 类别特征 + early stopping

# 3. XGBoost（生态最广，GPU 训练）
xgb_clf = xgb.XGBClassifier(n_estimators=100, learning_rate=0.05, tree_method='hist', device='cuda')
xgb_clf.fit(X_train, y_train)
# 优势：GPU 训练 + 工业级调参与监控
```

**关键参数**：
- HistGB = `HistGradientBoostingClassifier(max_iter=100)` 内置
- LightGBM = `pip install lightgbm` + `lgb.LGBMClassifier()`
- XGBoost = `pip install xgboost` + `xgb.XGBClassifier()`
- 速度 = LightGBM ≈ XGBoost > HistGB > GBDT
- 类别特征 = LightGBM 原生 / XGBoost 1.6+ / HistGB 需编码
- 集成 = sklearn API 兼容 HistGB，LightGBM / XGBoost 需 sklearn API 包装

**最佳实践**：生产项目优先 HistGB（无外部依赖 + sklearn 生态一致）；Kaggle 优先 LightGBM（速度 + 早停 + 类别特征）；XGBoost 用于 GPU 训练或工业级监控；用 `sklearn-api` 包装 LightGBM / XGBoost 以便 Pipeline。

### 模式 17：HalvingGridSearchCV 加速搜索

**问题场景**：GridSearchCV 暴力搜 1000 组合，跑一周；预算有限（一天）。传统 GridSearch 资源平均分配，无效组合浪费。

**解决方案**：`HalvingGridSearchCV` 渐进减半——先用少资源（少量样本 + 少量迭代）筛一半，再用多资源验证。3-10x 加速。

```python
from sklearn.experimental import enable_halving_search_cv
from sklearn.model_selection import HalvingGridSearchCV
from sklearn.ensemble import HistGradientBoostingClassifier

# 大参数空间
param_grid = {
    'learning_rate': [0.01, 0.05, 0.1, 0.2],
    'max_depth': [3, 5, 7, 10],
    'max_iter': [50, 100, 200, 500],
    'max_bins': [64, 128, 255],
}  # 4*4*4*3 = 192 组合

# Halving：先 12 组合 × 50 样本 → 6 组合 × 100 → 3 组合 × 200 → 1.5 → 1
halving = HalvingGridSearchCV(
    estimator=HistGradientBoostingClassifier(),
    param_grid=param_grid,
    factor=2,                                # 每轮减半
    resource='n_samples',                    # 资源 = 样本数
    max_resources=1000,                      # 最大样本数
    min_resources=100,                       # 最小样本数
    cv=3,
    random_state=42,
)
halving.fit(X, y)
print(halving.best_params_)                  # 仅跑了部分组合但找到最优
```

**关键参数**：
- 资源 = 样本数 / 迭代次数 / 树的数量
- `factor=2` = 每轮资源翻倍、组合数减半
- 加速 = 3-10x
- 终结 = 最少 1 个组合留到最后一轮
- 替代 = `RandomizedSearchCV`（随机采样，无资源调度）
- `resource='n_samples'` / `'n_iterations'` 资源维度

**最佳实践**：大参数空间用 HalvingGridSearchCV——比 GridSearchCV 快 3-10x，结果质量接近；`factor=2` 默认够用，`factor=3` 更激进；`min_resources='exhaust'` 自动选最小资源；超 1000 组合考虑 `RandomizedSearchCV`。

### 模式 18：imblearn 类别不平衡处理

**问题场景**：欺诈检测 100:1 比例——直接训练模型把全部预测为正类（反类）就达 99% accuracy，但完全没用。accuracy 在不平衡数据上无意义。

**解决方案**：imblearn 库（sklearn-contrib）——SMOTE / RandomOverSampler / BalancedRandomForest 处理不平衡。Pipeline 内嵌 SMOTE 防泄漏。

```python
# imblearn 兼容 sklearn API
from imblearn.over_sampling import SMOTE
from imblearn.under_sampling import RandomUnderSampler
from imblearn.ensemble import BalancedRandomForestClassifier
from imblearn.pipeline import Pipeline  # imblearn 的 Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, roc_auc_score

# 1. SMOTE：合成少数类
pipe_smote = Pipeline([
    ('scaler', StandardScaler()),
    ('smote', SMOTE(sampling_strategy=0.5, random_state=42)),  # 1:2 比例
    ('clf', LogisticRegression()),
])
pipe_smote.fit(X_train, y_train)
y_pred = pipe_smote.predict(X_test)
print(f"F1: {f1_score(y_test, y_pred):.3f}")    # 0.65（vs 0.05 之前）

# 2. BalancedRandomForest：内置类权重
brf = BalancedRandomForestClassifier(n_estimators=100, random_state=42)
brf.fit(X_train, y_train)

# 3. 评估指标
y_proba = pipe_smote.predict_proba(X_test)[:, 1]
print(f"ROC AUC: {roc_auc_score(y_test, y_proba):.3f}")  # 0.92
```

**关键参数**：
- `SMOTE` = 合成少数类（KNN 插值）
- `RandomOverSampler` = 随机复制少数类
- `BalancedRandomForest` = 类权重内置
- `RandomUnderSampler` = 随机欠采样多数类
- Pipeline = `Pipeline([('smote', SMOTE()), ('clf', RandomForest())])`
- 评估 = 不看 accuracy，看 f1 / roc_auc / pr_auc

**最佳实践**：不平衡数据用 SMOTE + Pipeline——f1 提升 5-15%，accuracy 反而下降（好事）；用 imblearn 的 Pipeline 而非 sklearn 的（imblearn 步骤支持 resample）；必看 ROC AUC / PR AUC 而非 accuracy。

### 模式 19：sklearn-contrib 插件生态

**问题场景**：sklearn 团队保守，新算法（XGBoost / LightGBM / imblearn）合不进主仓；社区想分享 estimator 又想保持兼容。

**解决方案**：`scikit-learn-contrib` 组织——`xgboost` / `lightgbm` / `imblearn` / `category-encoders` / `scikit-optimize` 等都按 sklearn 协议（继承 BaseEstimator + fit/predict）写。`check_estimator` 验证。

```python
# scikit-learn-contrib 项目列表
# 1. imblearn（imbalanced-learn）= SMOTE / UnderSampling / BalancedRF
# 2. category-encoders = TargetEncoder / CatBoostEncoder / WOEEncoder
# 3. scikit-optimize = BayesSearchCV / forest_minimize
# 4. hdbscan = HDBSCAN 聚类
# 5. boruta-py = Boruta 特征选择
# 6. scikit-image = 图像特征
# 7. scikit-learn-extra = 扩展算法（KernelPCA / IsolationForest）

# 第三方库用 sklearn 协议
# xgboost.XGBClassifier 继承 BaseEstimator + ClassifierMixin
# 通过 check_estimator 验证 → 可直接用 sklearn Pipeline / GridSearch
import xgboost as xgb
xgb_clf = xgb.XGBClassifier(n_estimators=100)   # sklearn 兼容
from sklearn.model_selection import GridSearchCV
grid = GridSearchCV(xgb_clf, {'n_estimators': [50, 100, 200]}, cv=5)
grid.fit(X_train, y_train)
```

**关键参数**：
- 协议 = 继承 BaseEstimator + 4 个方法（fit / predict / transform / fit_transform）
- 测试 = 跑 `check_estimator` 通过
- 文档 = 同样 docstring 风格
- 维护 = 各 repo 独立，sklearn 团队不背书
- 项目数 = 15+（imblearn / category-encoders / scikit-optimize / hdbscan 等）

**最佳实践**：做 sklearn 兼容库必跑 `check_estimator`——保证 Pipeline / GridSearch 直接能用；用 `BaseEstimator` + 适当 Mixin（`ClassifierMixin`）；docstring 用 sklearn 风格（Parameters / Returns / Examples 三段）。

### 模式 20：7 天复刻 mini-sklearn 路线

**问题场景**：想理解 sklearn 架构但 8000 文件读不完；想写个 mini-sklearn 练手。直接读源码迷失在细节。

**解决方案**：7 天 MVP——Day 1 BaseEstimator + Mixin，Day 2 LinearRegression，Day 3 KNN，Day 4 Pipeline，Day 5 GridSearchCV，Day 6 cross_val_score，Day 7 集成测试。

```bash
# Day 1: BaseEstimator + 3 Mixin（100 行）
day1/
├── base.py          # BaseEstimator + 3 Mixin
└── tests/test_base.py

# Day 2: LinearRegression（200 行）
day2/
├── linear_model.py  # OLS + 梯度下降
└── tests/

# Day 3: KNeighborsClassifier（150 行）
day3/
├── neighbors.py
└── tests/

# Day 4: Pipeline（150 行）
day4/
├── pipeline.py      # fit/predict 链式
└── tests/

# Day 5: GridSearchCV（200 行）
day5/
├── model_selection.py
└── tests/

# Day 6: cross_val_score（100 行）
day6/
├── model_selection.py  # KFold + cross_val_score
└── tests/

# Day 7: check_estimator 集成测试（100 行）
day7/
├── utils/estimator_checks.py
└── tests/test_all_estimators.py
```

**关键参数**：
- 核心 = BaseEstimator + 3 件套协议
- Mixin = ClassifierMixin 提供 score 默认
- Pipeline = 链式 transform + 最终 estimator
- 测试 = `check_estimator` 跑所有子类
- 复刻难度 = 协议简单，30+ 算法实现量大
- 关键决策 = 第一天必须做对（协议层决定后续）

**最佳实践**：复刻 mini-sklearn 先做"BaseEstimator + LinearRegression + Pipeline"——核心协议 200 行能讲清楚；所有 estimator 必跑 `check_estimator` 验证协议一致；用 30+ estimator 验证 Pipeline / GridSearch 通用性。

---

## 附录：5 段必读代码

1. `sklearn/base.py` — BaseEstimator + 30+ Mixin（参数协议核心）
2. `sklearn/pipeline.py` — Pipeline + FeatureUnion（链式组合）
3. `sklearn/model_selection/_split.py` — KFold / StratifiedKFold / TimeSeriesSplit
4. `sklearn/ensemble/_hist_gradient_boosting.py` — HistGB 主算法（256 bin 直方图）
5. `sklearn/_loss/loss.py` — 独立 Cython 损失函数库

## 一句话总结

scikit-learn = fit / predict / transform 三件套 + Mixin 能力组合 + 集中输入检查 + Pipeline 链式 + Cython/OpenMP 性能 + BaseEstimator 协议，把"30+ ML 算法"做到 API 完全一致，让 Pipeline / GridSearch / cross_val_score 等元能力对所有算法通用，是 Python ML 生态的事实标准；最值得偷的是"统一 Estimator 协议 + Mixin 能力组合"——所有算法遵守 fit/predict 协议，Mixin 模式让 score/transform 能力叠加，第三方库（XGBoost/LightGBM/imblearn）通过 `check_estimator` 测试即与 sklearn 生态无缝集成。
