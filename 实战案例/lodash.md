# lodash - 工业级 JavaScript 工具库

**GitHub**: lodash/lodash
**Star**: 60k+
**语言**: JavaScript (ES5/ES6)
**主题**: utility / functional / immutable / fp / array
**适用场景**: 老项目浏览器兼容 / 工具函数库 / 函数式编程 / 跨环境工具 / lodash 替代品演进

---

## 第一段：基础范式

### 模式 1 - `runInContext` + 内部变量

**问题场景**：lodash 全局污染严重，不同版本 lodash 共存时 `_.each` 行为不一致。

**解决方案**：`runInContext(context)` 是 lodash 的核心：传入 `root`（默认 `globalThis`）返回新的 lodash 实例；lodash 内部所有 `_` 都是参数 `lodash` 而**不是**全局引用；`_.runInContext({ ... })` 可换 root；`lodash/fp` 是 runInContext 关闭可变方法的版本。

**关键参数**：
- `runInContext(context)`
- `root` 全局对象
- 闭包封装
- `lodash` 参数
- `context` 注入

**最佳实践**：理解 lodash 源码从 `runInContext` 起步；多版本 lodash 用 `lodash/noConflict`；`lodash/fp` 适合函数式；**不要** monkey-patch `_` 走 `runInContext` 创建沙箱。

### 模式 2 - LodashWrapper + LazyWrapper 双链

**问题场景**：业务要 `.map().filter().take(5).value()` 链式调用，提前终止避免遍历完。

**解决方案**：`LodashWrapper` 包装值 + 链式；`LazyWrapper` 包装迭代器 + 延迟求值；`chain()` 启链；`_(arr).map(...).filter(...).value()` 触发；`LodashWrapper` 走 eager 模式（每次都遍历），`LazyWrapper` 走 lazy 模式（合并迭代器一次性跑）；`commit()` 转换 lazy → eager。

**关键参数**：
- `chain()` 启链
- LodashWrapper eager
- LazyWrapper lazy
- `value()` 触发
- `commit()` 转换

**最佳实践**：100 万数据**用** `_(arr).filter().map().take(5).value()` 延迟求值；简单 1 万数据 eager 即可；`.commit()` 后链式停止 lazy；理解 `LazyWrapper` 走 `baseLodash` 合并迭代器。

### 模式 3 - bitmask 特性位运算

**问题场景**：函数行为有多种开关（uncurry / rearg / placeholder / partial），传对象参数太重。

**解决方案**：`Lodash` 用 bitmask 编码特性：`CURRY_FLAG = 1` / `PARTIAL_FLAG = 32` / `ARY_FLAG = 128` / `REARG_FLAG = 256` 等；`wrapperToString = (name, bitmask) => name + (bitmask ? '...' : '')` 输出可读签名；`baseLodash()` 创建新 wrapper 时按 bitmask 决定开启特性。

**关键参数**：
- bitmask 位运算
- `CURRY_FLAG = 1`
- `PARTIAL_FLAG = 32`
- `ARY_FLAG = 128`
- 特性组合

**最佳实践**：理解 lodash 函数签名 `_.curry(fn, arity)` 的 bitmask；`mixin` 注入自定义方法走 bitmask 控行为；位运算快但难读，配合 `wrapperToString` 加可读字符串。

### 模式 4 - `getIteratee` 参数适配

**问题场景**：`_.map(users, 'name')` 支持 4 种参数（函数 / 属性名字符串 / 属性数组 / 对象）业务用法多样。

**解决方案**：`getIteratee(callback, thisArg, default)` 内部适配：① 函数 → 调 ② 字符串 'name' → 返属性访问 ③ 数组 ['a','b'] → 返复合访问 ④ 对象 → 返 `matches` 谓词；统一所有函数（`map / filter / find`）调用；`baseClone` 配合 deepCopy。

**关键参数**：
- `getIteratee`
- 函数/字符串/数组/对象
- `thisArg` 绑定
- `default` 默认
- `baseMatches`

**最佳实践**：写工具库仿 lodash 用 `getIteratee` 适配多种参数；`_.filter(users, {active: true})` 走 matches；`_.map(users, 'profile.name')` 走属性链；`_.filter(arr, x => x > 5)` 走函数。

### 模式 5 - HOT 路径 WeakMap 缓存

**问题场景**：`_.isPlainObject` 每次都跑 `Object.prototype.toString.call` + 原型链遍历，性能差。

**解决方案**：lodash 用 `WeakMap` 缓存"对象 → 是否 plain object"结果：`cacheHas(cache, key)` 查；`baseIsPlainObject` 计算；首次计算后存 cache；GC 自动回收不会内存泄漏。`isArguments / isArray / isFunction` 等热路径都走 WeakMap 缓存。

**关键参数**：
- WeakMap 缓存
- `cacheHas` 查
- `baseIsPlainObject`
- 自动 GC
- HOT 路径

**最佳实践**：写工具库热路径用 `Map` 缓存；`WeakMap` 防泄漏（key 是对象时）；**不要**给短命数据用 `Map` 缓存（命中率低）；lodash 内部 `isPlainObject` 100x 加速来自 WeakMap。

---

## 第二段：扩展范式

### 模式 6 - FP 变体（lodash/fp）

**问题场景**：业务要"函数式编程（自动柯里化 + 不可变 + 数据后置）"，但默认 lodash 是"方法链 + 可变 + 数据前置"。

**解决方案**：`lodash/fp` 是独立子包：① 自动柯里化（`fp.map(fn, list)` 也可 `fp.map(fn)(list)`）② 数据后置（`fp.map(fn, list)` 而非 `fp.map(list, fn)`）③ 不可变（不写原数组）④ 不可变（`fp.uniq` 返回新数组）；`fp` 是 `lodash` 的"`runInContext` 重配置"。

**关键参数**：
- `lodash/fp` 子包
- 自动柯里化
- 数据后置
- 不可变
- `runInContext` 配置

**最佳实践**：函数式项目**用** `lodash/fp` 而**不是** `lodash`；`fp.compose(f, g, h)` = `f(g(h(x))` 链式；`fp.curry` 自动柯里化；与 `RxJS` 配合好；新项目可考虑 `ramda` 更纯函数式。

### 模式 7 - mixin 注入业务方法

**问题场景**：业务要"给 lodash 加业务方法"（`_.formatDate(date)` / `_.toCNY(num)`），全局污染。

**解决方案**：`_.mixin(object, [options])` 注入方法到 lodash 原型；`_.mixin({ capitalize: string => ... }, { chain: false })`；`chain: false` 不走链式；`_.runInContext().mixin(...)` 沙箱；新方法自动出现在 `_.` / `_.prototype` 上。

**关键参数**：
- `_.mixin(obj, opts)`
- `chain: false` 不链式
- `_.prototype` 注入
- 沙箱 mixin
- 业务工具

**最佳实践**：业务工具包 `_.mixin(myMethods, { chain: false })` 注入；`chain: false` 防污染链式 API；不推荐 monkey-patch；monorepo 用 `runInContext` 隔离；`lodash-webpack-plugin` 摇树掉未用方法。

### 模式 8 - baseDifference + Set 优化

**问题场景**：`_.difference(arr1, arr2)` 比较两数组差异，O(n*m) 太慢。

**解决方案**：`baseDifference(array, values, iteratee, comparator)` 内部走 `Set`：① 把 values 转 Set O(m) ② 遍历 array 查 Set O(n) 总体 O(n+m)；`iteratee` 走属性提取；`comparator` 自定义比较；`_#difference` 是 internal 函数。

**关键参数**：
- `baseDifference`
- Set 优化
- O(n+m)
- `iteratee` 提取
- `comparator`

**最佳实践**：100 万数据**用** `_.difference` 而**不是**手写嵌套循环；`_.differenceBy(a, b, 'id')` 走 iteratee；自定义比较 `_.differenceWith(a, b, _.isEqual)`；新版 V8 Set 已经够快。

### 模式 9 - UMD / CJS / AMD / ESM 4 格式打包

**问题场景**：lodash 要在 Node（CJS）、浏览器（script 标签）、RequireJS（AMD）、现代打包器（ESM）4 种环境跑。

**解决方案**：lodash 输出 4 格式：① UMD 兼容所有（`function(root, factory) { ... }`）② CJS `module.exports = _` ③ AMD `define(['exports'], factory)` ④ ESM `export default _`；`lodash/lodash.min.js` 浏览器版本；`package.json` 配 `main: lodash.js / module: lodash.js / browser: lodash.min.js`。

**关键参数**：
- UMD 通用
- CJS Node
- AMD RequireJS
- ESM 现代
- `main / module / browser`

**最佳实践**：现代项目用 ESM `import _ from 'lodash-es'`；Node 用 CJS `const _ = require('lodash')`；浏览器 script 标签用 UMD；`lodash-es` 子包 ESM 友好；`lodash-webpack-plugin` 摇树减体积。

### 模式 10 - `setData` + WeakMap 私有数据

**问题场景**：lodash wrapper 要"存内部状态"（chain 状态、Lazy 迭代器）但又不能污染值。

**解决方案**：`setData(target, data)` + `getData(target)` 走 `WeakMap`：`lodash._cacheId = new WeakMap()`；`wrapper.__data__ = data` 隐式存数据；不污染值本身；GC 友好（target 回收时数据回收）。所有 wrapper 操作都走 `setData` 存内部状态。

**关键参数**：
- `setData / getData`
- WeakMap 存储
- `wrapper.__data__`
- 不污染值
- GC 友好

**最佳实践**：写库时**用** WeakMap 存私有数据；**不要**给对象加 `__xxx__` 属性（污染 + 序列化问题）；理解 lodash wrapper 数据流；TypeScript 项目要避开 `WeakMap` 类型推断。

---

## 第三段：进阶范式

### 模式 11 - Lazy chain + 迭代器合并

**问题场景**：`_(arr).filter().map().take(5)` 默认 eager（每步都跑），百万数据慢。

**解决方案**：`LazyWrapper` 维护一个迭代器数组；每步操作（`filter / map / take`）生成新的 generator 函数；`value()` 触发时合并所有迭代器一次跑完；`thru` 自定义中间步骤；`commit()` 转换 LazyWrapper → LodashWrapper eager 模式。性能提升 5-10x。

**关键参数**：
- `LazyWrapper`
- 迭代器合并
- `thru` 中间
- `commit()` 转 eager
- 5-10x 性能

**最佳实践**：百万数据**用** lazy chain；`_(users).filter(active).map(toJSON).take(10).value()`；debug 时 `commit()` 转 eager 看每步；`baseLodash` 合并迭代器；理解 `thru` 自定义。

### 模式 12 - `baseCreate` + 原型继承

**问题场景**：lodash `_.create(prototype, properties)` 创建对象，老 IE 不支持 `Object.create`。

**解决方案**：`baseCreate(proto)` 走 `Object.create(proto)`（有）或构造空函数 + `F.prototype = proto; return new F();`（无）；lodash 4.x 内部所有对象创建走 `baseCreate`；`_.create({a: 1}, {b: {value: 2}})` 创建原型对象 + properties descriptors。

**关键参数**：
- `baseCreate(proto)`
- `Object.create` 现代
- 兼容老 IE
- 构造空函数
- properties 描述符

**最佳实践**：现代项目用 `Object.create` 而**不是** `_.create`；理解 lodash 内部走 `baseCreate` 优化；IE 11 兼容走 polyfill；`_.create` 适合写库内部。

### 模式 13 - Unicode word / 正则优化

**问题场景**：`_.words('héllo wörld')` 拆单词默认 `\b\w+\b` 漏 Unicode 字符（é ö）。

**解决方案**：`_.words` 用 `reUnicodeWord = RegExp([...])` 包含 Unicode 属性：`[A-Za-z0-9_\\u00C0-\\u00FF\\u0100-\\u017F...]`；`reHasUnicodeWord = /[a-z][A-Z]?|` `驼峰拆分；`_.deburr('déjà vu')` 转 ASCII。lodash 4.x 全面 Unicode 化。

**关键参数**：
- Unicode word
- `reUnicodeWord`
- `reHasUnicodeWord`
- `deburr`
- 国际化

**最佳实践**：处理多语言**用** `_.words` 而**不是**手写正则；`_.deburr` 转 ASCII 友好；`_.kebabCase('fooBar')` 转 `foo-bar` 兼容 Unicode；正则预编译避免运行时编译。

### 模式 14 - CVE 安全修复

**问题场景**：lodash 历史上有多个 CVE（Command Injection / Prototype Pollution / ReDoS）。

**解决方案**：典型 CVE：① `_.template` 服务端模板注入（CVE-2019-10744）② `_.zipObjectDeep` 原型污染（CVE-2020-8203）③ `_.set / _.setWith` 原型污染（CVE-2020-28500）④ `_.toNumber / _.trim` ReDoS。lodash 4.17.21 全部修复。

**关键参数**：
- CVE 列表
- `_.template` 注入
- 原型污染
- ReDoS
- 4.17.21 修复

**最佳实践**：**总是**用最新版 lodash 4.17.21+；服务端模板用 `_.template` 配 strict mode；**不要**用 `_.set(obj, '__proto__.foo', 1)` 防止原型污染；监控 `npm audit` 告警；考虑迁移到 `lodash-es` + ESM。

### 模式 15 - 摇树优化 + `lodash-webpack-plugin`

**问题场景**：lodash 全量引入 70KB+，只用了几个函数浪费。

**解决方案**：`lodash-webpack-plugin` 替换 `import _ from 'lodash'` 为按需引用 `import _ from 'lodash/map'; import _ from 'lodash/filter'; ...`；`lodash-es` ESM 友好摇树；`babel-plugin-lodash` Babel 改 import；`rollup-plugin-lodash` Rollup 改；`unusedFiles` webpack unused 标记；可减 90% 体积。

**关键参数**：
- `lodash-webpack-plugin`
- `lodash-es` ESM
- `babel-plugin-lodash`
- `rollup-plugin-lodash`
- 70KB → 5KB

**最佳实践**：现代项目**用** `lodash-es` + ESM 摇树；`import { map, filter } from 'lodash-es'`；`lodash-webpack-plugin` 配置 `shorthands: true / except: ['chain']`；`/cloneDeep / /get` 单独子模块；体积 < 5KB。

---

## 第四段：实战范式

### 模式 16 - smoke test 5 行验证

**问题场景**：装好 lodash 验证核心方法是否可用。

**解决方案**：5 行 smoke test：```js const _ = require('lodash'); const arr = _.range(10); console.log(_.chain(arr).filter(x => x % 2 === 0).map(x => x * x).take(3).value()); console.log(_.uniq([1,1,2,3,3])); console.log(_.get({a:{b:{c:1}}}, 'a.b.c')); console.log(_.debounce(() => console.log('hi'), 100)); ``` 期望：`[0, 4, 16]` / `[1, 2, 3]` / `1` / debounce 函数。

**关键参数**：
- 5 行核心验证
- `chain + filter + map + take`
- `uniq / get / debounce`
- 10s 可跑完
- 链式 + 工具 + 防抖

**最佳实践**：新装 lodash 用 5-10 行 smoke test 验证"chain + uniq + get + debounce"四件套；测试常用 API 就位；TypeScript 项目配 `@types/lodash`。

### 模式 17 - 安全使用 + 替代品

**问题场景**：lodash 太重或历史 CVE 风险，业务想找替代品。

**解决方案**：替代品对比：① `lodash-es` ESM 摇树 ② `ramda` 纯函数式 + 自动柯里化 ③ `date-fns` 日期工具（替代 `_.now / _.debounce`） ④ `rxjs` 响应式（替代 `_.debounce / _.throttle`） ⑤ 原生 ES2019+ 覆盖 70% 场景（`Object.keys / Array.from / Promise.all`） ⑥ Node 内置 `util.promisify / events`。原生优先 + 按需 lodash 子模块。

**关键参数**：
- `lodash-es` ESM
- `ramda` FP
- `date-fns` 日期
- `rxjs` 响应式
- 原生 ES2019+

**最佳实践**：新项目**用**原生 ES2019+ + 按需 lodash 子模块；`Object.fromEntries / Array.flat / Promise.allSettled` 替代部分；老项目保留 lodash 4.17.21+；`ramda` 适合纯函数式；`date-fns` 比 `moment` 优。

### 模式 18 - 性能基准对比

**问题场景**：业务想知道 lodash vs 原生 vs 替代品性能差多少。

**解决方案**：`benchmark.js` + `jsperf.com` 测；`_.cloneDeep` 100x 比 `JSON.parse(JSON.stringify(obj))` 快（深度 + 类型保留）；`_.uniq` 比 `Array.from(new Set(arr))` 稍慢（多了 chain 支持）；`_.get(obj, 'a.b.c', default)` 比 `obj?.a?.b?.c ?? default` 慢（但能处理字符串路径）；`_.debounce` 比手写定时器功能多（leading/trailing/maxWait）。

**关键参数**：
- `benchmark.js`
- `jsperf.com`
- `_.cloneDeep` 100x
- `_.uniq` Set
- `_.debounce` 完整

**最佳实践**：性能敏感代码用原生 API；通用代码用 lodash 提升可读性；`_.cloneDeep` 处理 Date/Map/Set 必用；`_.debounce` 完整功能比手写好；项目关键路径**用** benchmark 验证。

### 模式 19 - 与 RxJS / Ramda 选型

**问题场景**：业务选 lodash / Ramda / RxJS 中的一个或多个。

**解决方案**：lodash 通用工具 + 链式 + FP 变体；Ramda 纯函数式 + 自动柯里化 + 数据后置（适合学术/纯函数式）；RxJS 响应式 + 流式 + Observable（适合事件流/异步）。lodash 适合 90% 业务；Ramda 适合纯 FP；RxJS 适合事件流。

**关键参数**：
- lodash 通用
- Ramda FP
- RxJS 响应式
- 数据前置 vs 后置
- Observable vs Promise

**最佳实践**：**默认** lodash（生态 + 文档 + 性能平衡）；纯函数式项目用 Ramda（自动柯里化 + 数据后置）；事件流/异步用 RxJS（debounceTime / switchMap）；3 者可共存（`lodash` + `rxjs` 常用组合）。

### 模式 20 - 7 天复刻 mini-lodash

**问题场景**：学习用，想搭一个简化版 lodash 理解核心。

**解决方案**：7 天分 5 步：① Day 1-2 100 个核心方法（array 30 + object 20 + string 20 + math 15 + util 15）② Day 3 chain + LodashWrapper 链式 ③ Day 4 LazyWrapper + 迭代器合并 ④ Day 5 lodash/fp 自动柯里化 + 数据后置。

**关键参数**：
- Day 1-2 100 方法
- Day 3 chain
- Day 4 lazy
- Day 5 fp
- 7 天最小可用

**最佳实践**：复刻 lodash 先求"最小可跑内核"再迭代；7 天只够做 60% 场景的精简版；**完整 300 方法 + chain + lazy + fp + 100% 测试需要 3 个月+**；适用任何"工具库学习"。
