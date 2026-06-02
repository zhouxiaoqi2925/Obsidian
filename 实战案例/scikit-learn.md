# scikit-learn - Python 机器学习事实标准与 Estimator 协议教科书

**GitHub**: scikit-learn/scikit-learn
**Star**: 62k+
**语言**: Python (~70%) / Cython / C++
**主题**: machine-learning / estimator-api / fit-predict-transform / pipeline
**适用场景**: 学习统一 ML API 设计、Mixin 模式、Pipeline 组合、Cython 性能优化、保守技术选型

> scikit-learn 是一套统一 estimator 接口 + 一致参数命名 + 严密输入检查的经典 ML 库，INRIA + 1000+ 贡献者维护。它定义 ML 编程模型——`fit / predict / transform` 三件套 + Pipeline / ColumnTransformer 组合 + 严密的输入检查，让"用别人算法像用自己写的一样"成为现实。

## 第一段：基础范式（模式 1-5）

### 模式 1 · fit / predict / transform 三件套

**问题场景**：ML 算法 30+ 种（线性回归 / 随机森林 / KMeans / PCA），每种 API 不一样——`train()` / `learn()` / `fit()` / `compute()` 五花八门；Pipeline / GridSearch 难统一。

**解决方案**：fit / predict / transform 三件套——`fit(X, y)` 训练（监督学习有 y，无监督可 None），`predict(X)` 监督学习预测，`transform(X)` 特征工程变换，`fit_transform(X, y)` 一气呵成。

**关键参数**：
- `fit(X, y=None)` = 训练入口，所有 estimator 必有
- `predict(X)` = 监督学习预测（Classifier / Regressor）
- `transform(X)` = 特征变换（Scaler / Encoder / Selector）
- `fit_transform(X, y)` = 链式调用，常在 Pipeline 内部用
- 混合能力 = `clone(estimator)` 深拷贝（GridSearch 用）

**最佳实践**：库设计 API 时强制 1-2 个核心方法 + 一致命名（fit/predict/transform）——让 Pipeline / GridSearch 等元能力通用化。

### 模式 2 · Mixin 模式组合能力

**问题场景**：每个分类器要实现 `score()` 方法（accuracy）、`fit()`、`predict()`——重复代码多；想给所有分类器加新能力（如 `predict_proba`）困难。

**解决方案**：Mixin 模式——`ClassifierMixin` / `RegressorMixin` / `TransformerMixin` 各提供默认实现，BaseEstimator 提参数协议，组合 = 完整类。

**关键参数**：
- 根 = `BaseEstimator`（`get_params` / `set_params`）
- Mixin = `ClassifierMixin`（`score` 默认 accuracy）
- 组合 = `class LogisticRegression(ClassifierMixin, BaseEstimator)`
- 不重复 = `score` 一次写，所有分类器受益
- 新能力 = 改 Mixin 一次，全网生效

**最佳实践**：库设计能力复用走 Mixin 模式（vs. 继承）——避免菱形继承，能力可叠加。

### 模式 3 · 集中输入检查

**问题场景**：用户喂 Pandas DataFrame / 稀疏矩阵 / 字符串标签 / NaN / inf——30+ estimator 各自报错信息不一致；用户记 API 差异崩溃。

**解决方案**：`sklearn/utils/validation.py` 的 `check_array` / `check_X_y` 集中检查——所有 estimator `fit` 前必调，错误信息一致。

**关键参数**：
- 5 步检查 = 类型 → 转 ndarray → dtype → finite → shape
- `accept_sparse` = 接受 csr / csc / coo
- `dtype='numeric'` = 自动转 float64
- `force_all_finite=True` = 拒绝 NaN / inf
- 一致错误 = "Found X with feature name ..., expected ..."

**最佳实践**：库的统一错误信息是用户体验核心——所有 API 入口前调 `check_array` / `validate_X_y`。

### 模式 4 · Pipeline 链式组合

**问题场景**：ML 工作流是"预处理 → 特征选择 → 模型 → 后处理"——每步单独跑、传 ndarray 易错；想用 GridSearch 调"预处理参数"难。

**解决方案**：`Pipeline([('scaler', StandardScaler()), ('clf', LogisticRegression())])`——把多步当一个 estimator，可直接喂 GridSearchCV。

**关键参数**：
- 步骤命名 = 元组列表（`name, estimator`）
- 中间传递 = `step.transform(X)` 传给下一步
- `clf__lr__C=0.1` = Pipeline 嵌套设参
- `fit(X, y)` = 顺序调每步 fit + transform
- `predict(X)` = 顺序调每步 transform + 最后 predict

**最佳实践**：ML 工作流必须用 Pipeline 串起来——避免"中间 ndarray 拷贝 + 难嵌套调参"两个大坑。

### 模式 5 · ColumnTransformer 异构列

**问题场景**：Pandas DataFrame 异构（数值 + 类别 + 文本），sklearn 早期只能"全数值"或"全类别"——异构列拆开处理难。

**解决方案**：`ColumnTransformer([('num', StandardScaler(), [0,1]), ('cat', OneHotEncoder(), [2,3])])` ——每列单独 transformer，Pipeline 一部分。

**关键参数**：
- 列选择 = 列索引 / 列名 / 函数
- remainder = 'drop' / 'passthrough'（未指定列处理）
- sparse_threshold = 默认 0.3（稀疏矩阵切换）
- n_jobs = 并行 transform
- 集成 = `Pipeline([('ct', ColumnTransformer(...)), ('clf', ...)])`

**最佳实践**：异构数据预处理必用 ColumnTransformer——按列分流，避免手动 `df[['num']].values` + `df[['cat']].values` 拆来拆去。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · BaseEstimator 深拷贝参数

**问题场景**：Pipeline 嵌套 GridSearch 调参——`clf__lr__C=0.1` 这种嵌套键怎么 set/get？

**解决方案**：`BaseEstimator.get_params(deep=True)` 递归遍历——子 estimator 也调 get_params，键前缀 = `父__子`。

```python
def get_params(self, deep=True):
    out = dict()
    for key in self._get_param_names():
        value = getattr(self, key)
        if deep and hasattr(value, 'get_params'):
            deep_items = value.get_params().items()
            out.update((key + '__' + k, val) for k, val in deep_items)
        out[key] = value
    return out
```

**关键参数**：
- 深拷贝 = `deep=True` 递归
- 双下划线分隔 = `clf__lr__C`
- `set_params(**params)` = 反向设置
- 用例 = `GridSearchCV(Pipeline(...), {'clf__C': [0.1, 1, 10]})`
- 约束 = 参数必须是 `__init__` 显式声明（`self.attr = value`）

**最佳实践**：所有 estimator `__init__` 显式声明参数（不要 `*args` / `**kwargs`）——GridSearch 依赖此协议。

### 模式 7 · HistGradientBoosting 分桶加速

**问题场景**：传统 GradientBoosting 每棵树要遍历每个样本找分裂点——O(n) 慢；LightGBM / XGBoost 用分桶（binning）快 10 倍。

**解决方案**：`HistGradientBoosting` 借鉴 LightGBM——连续特征分桶成 256 bin，每 bin 一个直方图，分裂时只查 bin，O(n) 变 O(bin)。

**关键参数**：
- 分桶 = 256 bin（可调 max_bins）
- 直方图 = 每 bin 一个累积梯度 + 计数
- 决策树分裂 = 选 bin 边界，O(bin) 而非 O(n)
- 速度 = 提升 10x，逼近 XGBoost
- 0.22+ 稳定 = 替代 `GradientBoostingClassifier`

**最佳实践**：中等数据（10k-1M 行）用 HistGradientBoosting——比 XGBoost 简单（无外部依赖）、比传统 GBDT 快 10x。

### 模式 8 · Cross Validation 拆分

**问题场景**：单次 train_test_split 不稳定，模型评估有方差；K-fold CV 给稳定估计但实现各异。

**解决方案**：`sklearn/model_selection/_split.py` 提供 KFold / StratifiedKFold / TimeSeriesSplit / GroupKFold——统一接口喂给 `cross_val_score`。

**关键参数**：
- KFold = 标准 K 折（n_splits=5 默认）
- StratifiedKFold = 分类任务保类别比例
- TimeSeriesSplit = 时序数据（不 shuffle）
- GroupKFold = 同组样本不跨折
- `cross_val_score` = 跑 K 折 + 聚合分数

**最佳实践**：分类必用 StratifiedKFold、时序必用 TimeSeriesSplit——K-fold 默认仅适用回归。

### 模式 9 · _loss 独立 Cython 损失函数

**问题场景**：LinearRegression / SGD / HistGB 各自实现 loss 函数——重复且难统一性能优化。

**解决方案**：`sklearn/_loss/` 独立 Cython 损失库——Loss 类独立于算法，多个 estimator 复用同一实现。

**关键参数**：
- 独立 = `sklearn/_loss/loss.py`（基类 + 子类）
- 优化 = Cython + OpenMP 并行
- 复用 = LinearRegression / HuberRegressor / SGD 都用同一 Loss
- 灵活性 = 用户可传自定义 loss
- 速度 = Cython 比纯 Python 快 20-50x

**最佳实践**：库代码把"算法 + 损失"解耦——损失函数集中维护，算法按需选。

### 模式 10 · Estimator Checks 统一测试

**问题场景**：用户实现自己的 estimator（继承 BaseEstimator）——怎么验证"符合协议"？

**解决方案**：`estimator_checks.py` 跑统一测试——所有子类化 BaseEstimator 的类都跑"协议测试"（fit/predict/clone/get_params/set_params 一致性）。

**关键参数**：
- 协议测试 = 30+ 检查项
- 自动跑 = `check_estimator(MyEstimator)` 返回 pytest 测试
- 复用 = scikit-learn-contrib 项目都用此模式
- 一致性 = 新 estimator 必须通过才能入库
- 库例 = `xgboost` / `lightgbm` / `imblearn` 都按此规范

**最佳实践**：库设计时为"插件作者"提供统一测试套件——保证生态一致 + 减少重复 review。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · Array API 跨后端

**问题场景**：sklearn 历史上绑 NumPy，CuPy / PyTorch / JAX 后端要重写——分布式 GPU 训练难。

**解决方案**：1.5+ 引入 Array API——`array_api` 命名空间抽象，统一 numpy / cupy / torch backend。

**关键参数**：
- 抽象层 = `sklearn.utils.array_api`
- 转换 = `X = np.asarray(X)` 一致入口
- 后端 = numpy（默认） / cupy（GPU） / torch
- 限制 = 部分算法不支持（依赖稀疏）
- 性能 = CuPy 后端在 GPU 上 5-20x

**最佳实践**：新代码走 Array API 抽象——未来 GPU / TPU 后端零成本切换。

### 模式 12 · TargetEncoder 监督编码

**问题场景**：OneHotEncoder 把类别列变稀疏矩阵（10k 类别 = 10k 列）；高基数类别（城市、产品 ID）维度爆炸。

**解决方案**：1.5+ TargetEncoder——用目标变量 y 的均值编码类别列（带 smoothing 避免过拟合），单列输出。

**关键参数**：
- 编码 = `mean(y[category == c])`
- 平滑 = `smoothing=10.0`（贝叶斯先验）
- CV 编码 = 训练用 K-fold 防泄漏
- 优势 = 单列 vs OneHot 的 N 列
- 适用 = 高基数类别（k>100）

**最佳实践**：高基数类别特征用 TargetEncoder——一列替代 N 列，配合 smoothing 防过拟合。

### 模式 13 · StackingClassifier 多层堆叠

**问题场景**：单一模型性能瓶颈；多个模型简单投票（VotingClassifier）平均——但不同模型擅长不同样本。

**解决方案**：`StackingClassifier([('rf', RandomForest()), ('gb', HistGB()), ('meta', LogisticRegression())])`——第一层多模型预测，第二层用预测结果当特征训练元模型。

**关键参数**：
- 第一层 = 多 estimator 并行
- 第二层 = `final_estimator`（默认 LogisticRegression）
- 训练 = `fit(X, y)` 内部 K-fold 防泄漏
- 预测 = 第一层 predict → 第二层 predict
- 风险 = 容易过拟合（两层参数都要调）

**最佳实践**：竞赛冲分用 StackingClassifier——比单一模型 1-3% 提升，代价是训练时间 2-3x。

### 模式 14 · Cython + OpenMP 性能

**问题场景**：纯 Python 实现 KMeans / PCA 慢 10-50x；想用 C 扩展但维护成本高。

**解决方案**：Cython 写性能热点（`_kmeans.pyx` / `_cdfast.pyx`），Python 写高层逻辑；OpenMP 并行 for 循环。

**关键参数**：
- Cython = Python 超集 + C 类型声明
- 类型 = `cdef double x`（vs. `x: float`）
- 编译 = `meson + ninja`（2024+ 替代 setup.py）
- 并行 = `prange` + `# pragma omp parallel`
- 性能 = 20-50x 提升

**最佳实践**：Python 库性能热点用 Cython——比纯 Python 快 20-50x，比 C 扩展易维护 5x。

### 模式 15 · fit_transform 数据泄漏陷阱

**问题场景**：用户在 train+test 上都 `fit_transform(StandardScaler, ...)`——test 数据信息泄漏到训练，模型评估虚高。

**解决方案**：Pipeline 默认行为——`Pipeline.fit(X_train, y_train)` 时各步 fit_transform(X_train)；`Pipeline.predict(X_test)` 时各步 transform(X_test)。

**关键参数**：
- 正确 = `pipe.fit(X_train)` 后 `pipe.predict(X_test)`
- 错误 = `scaler.fit_transform(X_train)` + `scaler.fit_transform(X_test)`（泄漏）
- 解决 = 用 Pipeline 自动隔离
- 反例 = 训练集 fit + 验证集 transform（vs. fit_transform）

**最佳实践**：永远用 Pipeline 串起预处理——fit_transform 自动只在 train 上跑，test 走 transform。

## 第四段：实战范式（模式 16-20）

### 模式 16 · HistGradientBoosting vs LightGBM

**问题场景**：GBDT 选 sklearn HistGB（无外部依赖） / LightGBM（更快 + 类别特征） / XGBoost（生态最广）哪个？

**解决方案**：轻量项目用 HistGB（集成 scikit-learn 一致性），竞赛 / 性能敏感用 LightGBM（直方图 + 类别特征 + early stopping），生态需求用 XGBoost。

**关键参数**：
- HistGB = `HistGradientBoostingClassifier(max_iter=100)` 内置
- LightGBM = `pip install lightgbm` + `lgb.LGBMClassifier()`
- 速度 = LightGBM ≈ XGBoost > HistGB > GBDT
- 类别特征 = LightGBM 原生 / XGBoost 1.6+ / HistGB 需编码
- 集成 = sklearn API 兼容 HistGB，LightGBM 需 sklearn API 包装

**最佳实践**：生产项目优先 HistGB（无外部依赖 + sklearn 生态一致）；Kaggle 优先 LightGBM（速度 + 早停）。

### 模式 17 · HalvingGridSearchCV 加速

**问题场景**：GridSearchCV 暴力搜 1000 组合，跑一周；预算有限（一天）。

**解决方案**：`HalvingGridSearchCV` 渐进减半——先用少资源（少量样本 + 少量迭代）筛一半，再用多资源验证。

**关键参数**：
- 资源 = 样本数 / 迭代次数 / 树的数量
- 减半策略 = 每轮资源翻倍、组合数减半
- 加速 = 3-10x
- 终结 = 最少 1 个组合留到最后一轮
- 替代 = `RandomizedSearchCV`（随机采样）

**最佳实践**：大参数空间用 HalvingGridSearchCV——比 GridSearchCV 快 3-10x，结果质量接近。

### 模式 18 · imblearn 类别不平衡

**问题场景**：欺诈检测 100:1 比例——直接训练模型把全部预测为正类（反类）就达 99% accuracy，但完全没用。

**解决方案**：imblearn 库（sklearn-contrib）——SMOTE / RandomOverSampler / BalancedRandomForest 处理不平衡。

**关键参数**：
- SMOTE = 合成少数类（KNN 插值）
- RandomOverSampler = 随机复制少数类
- BalancedRandomForest = 类权重内置
- Pipeline = `Pipeline([('smote', SMOTE()), ('clf', RandomForest())])`
- 评估 = 不看 accuracy，看 f1 / roc_auc / pr_auc

**最佳实践**：不平衡数据用 SMOTE + Pipeline——f1 提升 5-15%，accuracy 反而下降（好事）。

### 模式 19 · sklearn-contrib 插件生态

**问题场景**：sklearn 团队保守，新算法（XGBoost / LightGBM / imblearn）合不进主仓；社区想分享 estimator。

**解决方案**：`scikit-learn-contrib` 组织——`xgboost` / `lightgbm` / `imblearn` / `category-encoders` / `scikit-optimize` 等都按 sklearn 协议（继承 BaseEstimator + fit/predict）写。

**关键参数**：
- 协议 = 继承 BaseEstimator + 4 个方法（fit/predict/transform/fit_transform）
- 测试 = 跑 `check_estimator` 通过
- 文档 = 同样 docstring 风格
- 维护 = 各 repo 独立，sklearn 团队不背书

**最佳实践**：做 sklearn 兼容库必跑 `check_estimator`——保证 Pipeline / GridSearch 直接能用。

### 模式 20 · 7 天复刻 mini-sklearn 路线

**问题场景**：想理解 sklearn 架构但 8000 文件读不完；想写个 mini-sklearn 练手。

**解决方案**：7 天 MVP——Day 1 BaseEstimator + Mixin，Day 2 LinearRegression，Day 3 KNN，Day 4 Pipeline，Day 5 GridSearchCV，Day 6 cross_val_score，Day 7 集成测试。

```
Day 1: BaseEstimator + ClassifierMixin + check_array
Day 2: LinearRegression + fit/predict/score
Day 3: KNN + predict_proba
Day 4: Pipeline + ColumnTransformer
Day 5: GridSearchCV + HalvingGridSearchCV
Day 6: cross_val_score + KFold + StratifiedKFold
Day 7: estimator_checks 统一测试
```

**关键参数**：
- 核心 = BaseEstimator + 3 件套协议
- Mixin = ClassifierMixin 提供 score 默认
- Pipeline = 链式 transform + 最终 estimator
- 测试 = `check_estimator` 跑所有子类
- 复刻难度 = 协议简单，30+ 算法实现量大

**最佳实践**：复刻 mini-sklearn 先做"BaseEstimator + LinearRegression + Pipeline"——核心协议 200 行能讲清楚。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\scikit-learn\`
- 文件数：~8000
- License：BSD-3-Clause
- 状态：1.6（2025-01）

**核心模块**：
- `base.py` = BaseEstimator + 30+ Mixin
- `pipeline.py` = Pipeline + FeatureUnion
- `model_selection/` = KFold / GridSearchCV / cross_val_score
- `preprocessing/` = StandardScaler / OneHotEncoder / ColumnTransformer
- `ensemble/_hist_gradient_boosting.py` = HistGB 主算法
- `cluster/_kmeans.py` = K-Means 主算法
- `_loss/` = Cython 损失函数库

**3 核心洞察**：
1. fit / predict / transform 三件套 = ML 库接口统一范式
2. Mixin + 集中输入检查 = 用户体验零差异
3. Pipeline + ColumnTransformer = ML 工作流可组合

**1 反模式**：在 train+test 上都 `fit_transform`——数据泄漏导致评估虚高。

**3 立刻能用**：
1. `cross_val_score(clf, X, y, cv=StratifiedKFold(5))` 分类任务标配
2. `Pipeline([('scaler', StandardScaler()), ('clf', LogisticRegression())])` 自动防泄漏
3. `HalvingGridSearchCV` 替代 `GridSearchCV` 加速 3-10x
