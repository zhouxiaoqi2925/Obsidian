# jQuery · ABL 风格深度解析

> 主题：John Resig 2006 年创立的 DOM 操作 + AJAX + 异步 + 动画的"瑞士军刀"前端库，统治 Web 前端 15 年，至今仍被 70%+ 顶级网站 CDN 引用。JavaScript + 构造函数 + new 双形态 + jQuery.fn.init 多态分派 + Callbacks 状态机 + Deferred Promise 兼容 + Data 内部总线 + Sizzle 选择器引擎 + ESM 4.0 迁移。本文聚焦 20 个可复用模式（核心原理 / 架构设计 / 性能优化 / 可靠性与生态）。

---

## 一、核心原理

### 模式 1：jQuery.fn.init 多态分派 - 7 种入参一个函数

**问题场景**：`$()` 这个函数要同时承担"选择器 / DOM 节点包装 / HTML 字符串解析 / ready 回调"四重语义。**工厂函数 vs new 类**两难——工厂无 new 优雅但丢 instanceof，new 类需要用户写 `new $()`。jQuery 用 `jQuery.fn.init` 一个函数 7 种入形态，根据 `nodeType` / `typeof` / 正则匹配分流。

**解决方案代码**（`src/core/init.js:18-122` 节选）：
```js
init = jQuery.fn.init = function(selector, context, root) {
  // HANDLE: $(""), null, undefined, false
  if (!selector) return this;

  // Method init() is like calling jQuery methods
  if (typeof selector === "string") {
    if (selector[0] === "<" && selector[selector.length - 1] === ">" && selector.length >= 3) {
      // Assume that strings that start and end with <> are HTML and skip the regex check
      match = [null, selector, null];
    } else {
      match = rquickExpr.exec(selector);
    }

    // Match html or make sure no context is specified for #id
    if (match && (match[1] || !context)) {
      // HANDLE: $(html) -> $(array)
      if (match[1]) {
        context = context instanceof jQuery ? context[0] : context;
        // Option to run scripts is true for back-compat
        jQuery.merge(this, jQuery.parseHTML(match[1], context && context.nodeType ? context.ownerDocument || context : document, true));
        // HANDLE: $(html, props)
        if (rsingleTag.test(match[1]) && jQuery.isPlainObject(context)) {
          for (match in context) {
            if (jQuery.isFunction(this[match])) this[match](context[match]);
            else this.attr(match, context[match]);
          }
          return this;
        }
        return jQuery.merge(this, []);
      }
      // HANDLE: $(#id)
      } else {
        elem = document.getElementById(match[2]);
        if (elem) {
          this[0] = elem;
          this.length = 1;
        }
        return this;
      }
    }
    // HANDLE: $(expr, $(...))
  } else if (!context || context.jquery) {
    return (context || root).find(selector);
    // HANDLE: $(DOMElement)
  } else if (selector.nodeType) {
    this[0] = selector;
    this.length = 1;
    return this;
    // HANDLE: $(function) - Shortcut for document ready
  } else if (jQuery.isFunction(selector)) {
    return root.ready !== undefined ? root.ready(selector) : selector(jQuery);
  }
  return jQuery.makeArray(selector, this);
};
```

**关键参数表**：

| 入参类型 | 处理路径 |
| :--- | :--- |
| `null/undefined/false/""` | 立即返回空 jQuery |
| `string + HTML`（`<...>`）| `parseHTML` + `merge` |
| `string + #id` | `getElementById` |
| `string + selector` | Sizzle / qSA 委托 |
| `DOMElement` | `this[0] = elem` 直接挂 |
| `function` | ready 回调队列 |
| `array-like` | `makeArray` 归一化 |

**最佳实践**：
- ✅ **多态集中在 init** 切面好改，**但 cyclomatic complexity > 20**
- ✅ `rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/` 单一正则区分 HTML vs #id
- ✅ `this[match]( context[match] )` "先当方法、失败当属性"优雅降级
- ✅ 任何"工具函数 + 多入参形态"项目可借鉴
- ✅ Trade-off：可维护性 vs 单一入口

---

### 模式 2：构造函数 + new 双形态 - init.prototype = jQuery.fn

**问题场景**：`$("div")` 既要像函数（无 new）又要像类（链式 API）。**工厂函数丢 instanceof**，**new 类需用户写 `new $()`**。jQuery 用 `new jQuery.fn.init()` + `init.prototype = jQuery.fn` 让两条路共用同一 prototype。

**解决方案代码**（`src/core.js` 节选）：
```js
// init 函数既能当工厂（无 new）又能当构造器
init = jQuery.fn.init = function(selector, context, root) { /* ... */ };

// 关键一行：让 init 实例的原型 = jQuery.fn
init.prototype = jQuery.fn;
// 等价于：new jQuery.fn.init(selector) instanceof jQuery === true
//         jQuery.fn.init(selector) instanceof jQuery === true
```

**关键参数表**：

| 写法 | 等价性 |
| :--- | :--- |
| `$("div")` | `jQuery("div")` = `jQuery.fn.init("div")` |
| `new $.fn.init("div")` | 与 `$("div")` 实例完全相同 |
| `instanceof jQuery` | true（共享 prototype）|
| `instanceof jQuery.fn.init` | true |

**最佳实践**：
- ✅ **构造函数 + 工厂双形态** = 用户友好
- ✅ **共享 prototype** = 省去 `if (!(this instanceof jQuery))` 守卫
- ✅ 2007 年 jQuery 取代 Prototype.js 的关键设计
- ✅ 任何"工具库 + 链式 API"项目可借鉴
- ✅ Trade-off：新人难理解"为什么没 new"

---

### 模式 3：$.extend 双语义 - 深浅拷贝 + 防 __proto__ 污染

**问题场景**：插件生态的基石是 `$.extend` 把对象方法合并到 jQuery / jQuery.fn。**深浅拷贝**用同一函数实现，`this` 切换语义（`$.extend` 静态 / `$.fn.extend` 实例）。2018 年 prototype pollution CVE 证明必须**显式过滤 `__proto__`**。

**解决方案代码**（`src/core.js:115-185` 节选）：
```js
jQuery.extend = jQuery.fn.extend = function() {
  var options, name, src, copy, copyIsArray, clone,
      target = arguments[0] || {}, i = 1, length = arguments.length, deep = false;

  // Handle a deep copy situation
  if (typeof target === "boolean") {
    deep = target;
    target = arguments[i] || {};
    i++;
  }

  // Handle case when target is a string or something (possible in deep copy)
  if (typeof target !== "object" && !jQuery.isFunction(target)) {
    target = {};
  }

  // Extend jQuery itself if only one argument is passed
  if (i === length) {
    target = this;
    i--;
  }

  for (; i < length; i++) {
    // Only deal with non-null/undefined values
    if ((options = arguments[i]) != null) {
      // Extend the base object
      for (name in options) {
        src = target[name];
        copy = options[name];

        // Prevent Object.prototype pollution
        if (name === "__proto__" || target === copy) continue;  // CVE-2019-11358 修复

        // Prevent never-ending loop
        if (target === copy) continue;

        // Recurse if we're merging plain objects or arrays
        if (deep && copy && (jQuery.isPlainObject(copy) || (copyIsArray = Array.isArray(copy)))) {
          // ...
        } else if (copy !== undefined) {
          target[name] = copy;
        }
      }
    }
  }
  return target;
};
```

**关键参数表**：

| 参数 | 含义 |
| :--- | :--- |
| `target = arguments[0]` | 目标对象（首个参数）|
| `deep = false` | 是否深拷贝 |
| `this` | 单参数时 = `jQuery`（静态）/ `jQuery.fn`（实例）|
| `__proto__` 守卫 | CVE-2019-11358 修复（3.4.0+）|

**最佳实践**：
- ✅ **双语义（this 切换）** 是 jQuery 插件生态基石
- ✅ **必须防 `__proto__` 污染**（**3 行代码**）
- ✅ 任何"对象合并 / 插件 mixin"项目可借鉴
- ✅ 深浅拷贝用同一函数（**参数重载**）
- ✅ `target === copy` 防自引用死循环

---

### 模式 4：Callbacks 状态机 - 6 变量 + 4 flag 自由组合

**问题场景**：2010 年前没有 EventEmitter，**事件订阅 + 一次性 + memory（已 fire 后注册立即重放）** 各种 flag 组合。**if/else 链 4 flag = 16 组合**不可维护。jQuery 用 6 变量 + 4 boolean flag 笛卡尔积实现，**支持"once memory unique stopOnFalse"任意组合**。

**解决方案代码**（`src/callbacks.js:36-200` 节选）：
```js
function Callbacks(options) {
  // Convert options from String-form to Object-form
  options = typeof options === "string" ? createOptions(options) : { ...options };

  // Flag to fire once
  firing = false,
  // Flag to be immutable
  locked = false,
  // Actual callback list
  list = [],
  // Stack of pending calls
  queue = [],
  // Current index of position being iterated
  firingIndex = -1,
  // Fire callbacks from memory
  memory = options.memory && !options.once ? new FiringState() : undefined;
}

function fire(args) {
  // ...单次 fire 完整实现
  if (list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false && options.stopOnFalse) {
    // 中断传播（事件冒泡拦截）
  }
}
```

**关键参数表**：

| flag | 行为 |
| :--- | :--- |
| `once` | fire 一次后清空 list |
| `memory` | fire 后注册立即用最新 args 重放 |
| `unique` | 同 fn 多次 add 只保留一个 |
| `stopOnFalse` | callback `return false` 中断 fire |

**最佳实践**：
- ✅ **6 变量 + 4 flag 自由组合** = 16 种行为
- ✅ **memory 模式**：Deferred `done().then()` 链式基础
- ✅ 任何"可订阅对象"（EventBus/PubSub/Observer）可借鉴
- ✅ 30 行实现工业级 PubSub
- ✅ `=== false` 是有意的（**`return 0` 不中断**）

---

### 模式 5：Deferred + tuples 数组 - 表格驱动代替 if/else

**问题场景**：Deferred 三态（resolve/reject/notify）三 callbacks，**9 个状态 if/else 链难维护**。jQuery 用 `tuples` 数组配置：`[ "notify", "progress", callbacks("memory"), ... ]`，**调用时只用 `tuple[4]` 通用调度**。

**解决方案代码**（`src/deferred.js:43-56` 节选）：
```js
tuples = [
  // Action, add listener, callbacks list, final state, index, [state]
  ["resolve", "done", jQuery.Callbacks("once memory"), resolved = true, 0],
  ["reject", "fail", jQuery.Callbacks("once memory"), rejected = true, 1],
  ["notify", "progress", jQuery.Callbacks("memory")]
];

// then() 用 tuple[4] 通用调度
then: function(onFulfilled, onRejected, onProgress) {
  var maxDepth = -1;
  function deferredFunc() {
    // 用 tuple[4]（参数 index）取对应 handler
    var fn = onFulfilled;  // tuple[4] === 0
    if (maxDepth === 1) fn = deferred.then = function() { return deferred; };
    if (fn) fn.apply(this, arguments);
  }
  // ...3 个 addCallback 调用
  for (var i = 0; i < tuples.length; i++) {
    tuples[i][2].add(deferredFunc);  // tuple[2] = callbacks list
  }
  return deferred.promise();
}
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `[action, addListener, callbacks, finalState, index]` | tuple 6 字段 |
| `tuple[4]` | 状态索引（0=resolve / 1=reject / 2=notify）|
| `tuple[2]` | callbacks 列表 |
| `maxDepth` | then 链最大深度 |

**最佳实践**：
- ✅ **以表驱动代替分支** 是 jQuery 内部核心范式
- ✅ 任何"多状态机 + 多回调"项目可借鉴
- ✅ tuple 化让 `then()` 用同一函数调度
- ✅ Deferred 完整 Promises/A+ 2.3.3
- ✅ thenable 桥接（`if (typeof then === "function")`）

---

## 二、架构设计

### 模式 6：Sizzle 选择器引擎 - rquickExpr 快速路径 + 退化为 qSA

**问题场景**：CSS 选择器在 2006 年 IE6/7 没有 `querySelectorAll`，**Sizzle 引擎自实现**选择器。4.0 当排除 selector 模块时，`selector-native.js` 仅用 `querySelectorAll` 加一层 wrapper。**快速路径** 覆盖 80%+ 真实选择器调用。

**解决方案代码**（`src/selector.js:108-140` 节选）：
```js
rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+)|\.([\w-]+))$/;

// 快速路径
var rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;
if ((match = rquickExpr.exec(selector))) {
  // 1) #id → getElementById（最快）
  // 2) HTML 字符串 → parseHTML
}
```

**关键参数表**：

| 选择器形态 | 处理路径 |
| :--- | :--- |
| `#id` | `document.getElementById` |
| `.class` / `tag` | 原生 `querySelectorAll` |
| 复杂选择器 | Sizzle 编译路径 |
| jQuery 扩展伪类（`:eq()`/`:has()`）| Sizzle 自实现 |
| selector-native 模式 | 仅 qSA wrapper（**丢 jQuery 伪类**）|

**最佳实践**：
- ✅ **快速路径** + 慢速路径（**80/20 法则**）
- ✅ selector-native 模式进一步缩小体积
- ✅ 任何"高频调用 + 多形态入参"项目可借鉴
- ✅ Sizzle 引擎单独抽出（**jQuery 之外的库也用**）
- ✅ Andrew Dupont 的 scope 限定术让 Sizzle 性能稳赢原生 qSA

---

### 模式 7：Data 内部总线 - expando + camelCase + dual namespace

**问题场景**：DOM 节点要挂私有数据，**用 expando 命名空间防冲突**。所有子系统（event / manipulation / effects / queue）通过 `dataPriv` / `dataUser` 读写，**单一真相源 + 命名空间分离**让模块解耦。

**解决方案代码**（`src/data/Data.js` 节选）：
```js
function Data() {
  this.expando = jQuery.expando + Data.uid++;
}

dataPriv = new Data();    // 内部数据（jQuery 私有）
dataUser = new Data();    // 用户数据（$elem.data()）

function dataAttr(elem, key, value) {
  // 所有 key 强制转 camelCase
  if (data === "string") cache[ camelCase( data ) ] = value;
}

// 设置 expando 为 non-enumerable
Object.defineProperty(elem, expando, {
  value: { ... },
  enumerable: false,  // for...in 不会泄露
  configurable: true,  // 可被 delete
});
```

**关键参数表**：

| 命名空间 | 用途 |
| :--- | :--- |
| `dataPriv` | jQuery 内部数据（event handle / queue / ...）|
| `dataUser` | 用户数据（`$elem.data("key")`）|
| `expando = "jQuery" + uid` | DOM 节点唯一标识 |
| `camelCase` | key 归一化（**`foo-bar` ↔ `fooBar`**）|

**最佳实践**：
- ✅ **Data 系统是 jQuery 内部"公交系统"**
- ✅ **dual namespace** 区分内部/用户数据
- ✅ `enumerable: false` 防 for...in 泄露
- ✅ `configurable: true` 允许 delete
- ✅ 任何"DOM 私有数据"项目可借鉴

---

### 模式 8：Event 系统 - eventHandle 统一收口 + 委托分发

**问题场景**：原生 addEventListener 一个 type 一个 listener，**jQuery 想"按 selector 委托"必须统一收口再分发**。`on()` 4 层参数重载：`(types, fn)` / `(types, data, fn)` / `(types, selector, fn)` / `(types, selector, data, fn)` / `(types-Object, ...)`。所有分支收敛到 `jQuery.event.add()`。

**解决方案代码**（`src/event.js:24-83` 节选）：
```js
on: function(types, selector, data, fn) {
  return on(this, types, selector, data, fn);
}

function on(elem, types, selector, data, fn, one) {
  // 4 层参数重载分发
  if (typeof types === "object") {
    // (types-Object, selector, fn)
    return elem.on(types, selector, data);
  }
  if (data == null && fn == null) {
    // (types, fn)
    fn = selector;
    data = selector = undefined;
  } else if (fn == null) {
    if (typeof selector === "string") {
      // (types, selector, fn)
      fn = data;
      data = undefined;
    } else {
      // (types, data, fn)
      fn = data;
      data = selector;
      selector = undefined;
    }
  }

  // 一次性 one()
  if (one === 1) {
    origFn = fn;
    fn = function() {
      jQuery().off(elem);  // 自动 off
      if (origFn) return origFn.apply(this, arguments);
    };
    fn.guid = origFn.guid || (origFn.guid = jQuery.guid++);
  }

  // 委托
  if (selector) {
    return elem.on(types, selector, fn);  // 递归
  }
  // 直接绑定
  return jQuery.event.add(this, types, fn, data);
}

// eventHandle 统一收口
elemData.handle = eventHandle = function(e) {
  // ...统一处理
};
```

**关键参数表**：

| 参数组合 | 含义 |
| :--- | :--- |
| `(types, fn)` | 普通事件 |
| `(types, data, fn)` | 带数据 |
| `(types, selector, fn)` | 委托（子元素 selector）|
| `(types, selector, data, fn)` | 委托 + 数据 |
| `(types-Object, ...)` | 多事件对象 |

**最佳实践**：
- ✅ **4 层参数重载** 用递归 / 条件收敛
- ✅ **eventHandle 统一收口** = 委托分发基础
- ✅ `one = 1` 自动 off（`fn.guid = origFn.guid`）
- ✅ 命名空间（`.off(".namespace")` 一键解绑）
- ✅ 任何"事件系统"项目可借鉴

---

### 模式 模式 9：AJAX 框架 - Strategy + Chain of Responsibility

**问题场景**：AJAX 4 种 transport（xhr / script / jsonp / binary），**prefilters（请求前处理）+ transports（请求传输）+ converters（响应转换）** 三层链式调用。jQuery 用**注册表 + 链式调度**实现可扩展 AJAX。

**解决方案代码**（`src/ajax.js` 节选）：
```js
// Prefilter 注册
jQuery.ajaxPrefilter("script", function(s) { /* ... */ });

// Transport 注册
jQuery.ajaxTransport("script", function(s) { return { send: ..., abort: ... }; });

// Converter 注册
jQuery.ajaxConvert["text script"] = function(s) { return ...; };

// 调度
transport = inspectPrefiltersOrTransports(prefilters, s, options, jqXHR);
if (!transport) return reject();
transport = inspectPrefiltersOrTransports(transports, s, options, jqXHR);
```

**关键参数表**：

| 层 | 用途 |
| :--- | :--- |
| `ajaxPrefilter` | 请求前修改 options |
| `ajaxTransport` | 实际发送请求 |
| `ajaxConvert` | 响应转换（text→json 等）|
| 4 transport | xhr / script / jsonp / binary |
| 7 datatype | `*`/`text`/`html`/`xml`/`json`/`jsonp`/`script` |

**最佳实践**：
- ✅ **Strategy + Chain of Responsibility** 是 AJAX 框架范本
- ✅ 注册表 + 链式调度可扩展
- ✅ 任何"多 transport + 多 converter"项目可借鉴
- ✅ prefilter 改 options，transport 发请求，converter 改响应
- ✅ 配合 Promise 化 `jqXHR` 链式

---

### 模式 10：factory 模式 + ESM 双轨 - 5 个 entry

**问题场景**：jQuery 不只能在浏览器跑，**还要在 Node / Web Worker / Extension Service Worker 跑**（无 `window` 全局）。`--factory` 构建产出一个 `factory(window)` 函数让 jQuery 在无 window 场景可用。`package.json` 的 `exports` 字段定义 5 个 entry 兼容 3 种消费场景。

**解决方案**（`package.json` exports 节选）：
```json
{
  "exports": {
    ".": {
      "node": "./dist-module/jquery.node.js",
      "module": "./dist-module/jquery.modern.js",
      "import": "./dist-module/jquery.js",
      "default": "./dist/jquery.js"
    },
    "./slim": { ... },
    "./factory": { ... },
    "./factory-slim": { ... },
    "./src/*.js": "./src/*.js"
  }
}
```

**关键参数表**：

| entry | 用途 |
| :--- | :--- |
| `.` | 主入口（浏览器 / Node）|
| `.slim` | 不含 ajax/effects |
| `.factory` | 工厂模式（无 window 依赖）|
| `.factory-slim` | 工厂 + 精简 |
| `./src/*.js` | 源码路径（bundler 用）|

**最佳实践**：
- ✅ **5 个 entry 兼容 3 种消费场景**（Node CJS / bundler / 浏览器）
- ✅ factory 模式让 jQuery 在无 window 跑
- ✅ 任何"工具库 + 多环境"项目可借鉴
- ✅ ESM 迁移保留双轨（**不破坏老用户**）
- ✅ slim 版本省 6KB（**无 ajax/effects**）

---

## 三、性能优化

### 模式 11：Sizzle vs qSA - 1.5x 慢换取扩展性

**问题场景**：原生 `querySelectorAll` 极快，**Sizzle 引擎自实现 1.5x 慢**。WHY：jQuery 扩展伪类（`:eq()`/`:has()`）+ scope 限定 + context 链，**qSA 做不到**。jQuery 4.0 提供 selector-native 模式**省 5KB 体积**。

**解决方案**（`selector-native.js` 节选）：
```js
// 仅当 build 时排除 selector 模块
jQuery.find = function(selector, context, results, seed) {
  // 直接走原生 qSA
  var elem, match;

  results = results || [];
  context = context || document;

  if (!selector || typeof selector !== "string") {
    return results;
  }

  // 仅支持原生 CSS 3 选择器
  // 不支持 :eq() / :has() / :lt() 等 jQuery 扩展
  // ...
  context.querySelectorAll(selector);
  return results;
};
```

**关键参数表**：

| 模式 | 体积 | 性能 | 扩展性 |
| :--- | :--- | :--- | :--- |
| 完整 Sizzle | 35KB | 1.5x qSA | `:eq()` `:has()` 等 |
| selector-native | 30KB | = qSA | **仅 CSS 3** |

**最佳实践**：
- ✅ **体积 vs 扩展性** 是 jQuery 4.0 的 trade-off
- ✅ 80% 用户用 CSS 3 选择器够用
- ✅ 任何"工具库 + 体积敏感"项目可借鉴
- ✅ `rquickExpr.exec()` 80% 走快速路径
- ✅ Andrew Dupont 的 scope 限定术让 Sizzle 稳赢 qSA

---

### 模式 模式 12：rsingleTag 正则 - HTML 字符串快速识别

**问题场景**：`$("<div>")` 字符串要快速识别为 HTML 字符串。**朴素 includes/startsWith 多次调用慢**。jQuery 用 `rsingleTag = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i` 单一正则识别单标签。

**解决方案代码**（`src/core/init.js:76-88` 节选）：
```js
if (rsingleTag.test(match[1]) && jQuery.isPlainObject(context)) {
  // $(html, props) → props 当方法或属性绑定
  for (match in context) {
    // 优雅降级：先当方法，失败当属性
    if (jQuery.isFunction(this[match])) {
      this[match](context[match]);
    } else {
      this.attr(match, context[match]);
    }
  }
  return this;
}
```

**关键参数表**：

| 概念 | 含义 |
| :--- | :--- |
| `rquickExpr` | 快速识别 #id / HTML |
| `rsingleTag` | 识别单标签 HTML 字符串 |
| `isPlainObject` | 区分 plain object / DOM |
| 优雅降级 | 方法失败时当属性 |

**最佳实践**：
- ✅ **单标签 vs 多标签** 区分（性能 + 语义）
- ✅ **`$("<div>", { on: { click: fn } })`** 自动绑定事件
- ✅ 任何"HTML 字符串 + 配置"项目可借鉴
- ✅ 方法 / 属性优雅降级
- ✅ 正则 + typeof 组合比 if-else 链快

---

### 模式 13：cheerio / jsdom 跑 Node 单测 - 22 模块 QUnit

**问题场景**：纯 DOM 库在 Node 跑测试需要 DOM 模拟。jQuery 用 **jsdom**（lightweight）+ **QUnit**（自有测试框架）跑 22 模块单测。`browserstack-dispatch.yml` 拉起真实浏览器矩阵（IE11/Edge/Chrome/Firefox/Safari）。

**解决方案配置**（`package.json` scripts 节选）：
```json
{
  "scripts": {
    "test": "npm run build:all && npm run lint && npm run test:jsdom && npm run test:browserless && npm run test:browser && npm run test:esm && npm run test:slim && npm run test:no-deprecated && npm run test:selector-native",
    "test:jsdom": "qunit test/unit/ --jsdom",
    "test:browser": "node test/node_smoke_tests/runner.js"
  }
}
```

**关键参数表**：

| 测试类型 | 工具 | 数量 |
| :--- | :--- | :--- |
| Unit | QUnit | 22 模块 200-500 case |
| Browser | BrowserStack 真实 IE11-Edge-Chrome-FF-Safari | 矩阵 |
| jsdom | QUnit + jsdom | 1 套 |
| Promises/A+ | `@mgol/promises-aplus-tests` 2.1.2 | 872 case |
| Bundler | Webpack/Rollup smoke | 1 套 |
| CSP | TrustedHTML 安全测试 | 1 套 |

**最佳实践**：
- ✅ **jsdom + QUnit** 是 DOM 库 Node 测试标准
- ✅ 22 模块**单测 + 真实浏览器矩阵**双轨
- ✅ 任何"前端库"项目可借鉴
- ✅ `lint` 先行（`__proto__` 守卫检测）
- ✅ Promises/A+ 合规是**第三方背书**

---

### 模式 14：build:all 输出 4 变体 - main/slim/factory/factory-slim

**问题场景**：用户场景多样（CDN 浏览器 / bundler / Node / 体积敏感）。**单 build 输出不够**。jQuery 用 `npm run build:all` 输出 4 变体（main / slim + esm / umd），用户按需选。

**解决方案结构**（build 产物）：
```
dist/
├── jquery.js                  # main + UMD
├── jquery.min.js              # main + UMD + minify
├── jquery.slim.js             # main - ajax - effects
├── jquery.slim.min.js
├── jquery.factory.js          # 工厂模式 + UMD
├── jquery.factory.min.js
├── jquery.factory.slim.js
└── jquery.factory.slim.min.js

dist-module/
├── jquery.js                  # ESM 主入口
├── jquery.modern.js           # ESM 现代浏览器
└── jquery.node.js             # ESM Node
```

**关键参数表**：

| 变体 | 体积 | 用途 |
| :--- | :--- | :--- |
| main | ~30KB | CDN 浏览器 |
| slim | ~24KB | 不需 ajax/effects |
| factory | 同 main | 无 window 环境 |
| factory-slim | 同 slim | 无 window + 精简 |

**最佳实践**：
- ✅ **4 变体** 覆盖所有用户场景
- ✅ 任何"前端库 + 多环境"项目可借鉴
- ✅ slim 比 main 省 6KB
- ✅ factory-slim 跑 Web Worker / Extension
- ✅ Rollup 输出 ESM + UMD 双轨

---

### 模式 15：jQuery.error + exceptionHook - 全局异常捕获

**问题场景**：用户回调里抛错不能传播到全局。jQuery 提供 `jQuery.error(msg)` + `Deferred.exceptionHook` 钩子，1.6+ 默认绑 `console.error`。

**解决方案代码**（`src/core.js:195-197` 节选）：
```js
jQuery.error = function(msg) {
  throw new Error(msg);
};
```

```js
// src/deferred/exceptionHook.js
deferred.exceptionHook = function(error, stack) {
  // 默认绑 console.error
  if (window.console && console.error) {
    console.error(error);
  }
};
```

**关键参数表**：

| 错误处理 | 用途 |
| :--- | :--- |
| `jQuery.error(msg)` | 主动抛错（带行号）|
| `Deferred.exceptionHook` | 异步回调异常钩子 |
| `console.error` | 兜底输出 |
| `deferred.catch()` | Promises/A+ 标准 catch |

**最佳实践**：
- ✅ **`exceptionHook` 钩子** 让宿主注入自定义错误处理
- ✅ 1.6+ 默认绑 `console.error` 避免静默失败
- ✅ 任何"异步框架"项目可借鉴
- ✅ 配合 Promises/A+ `catch()`
- ✅ `jQuery.error(msg)` 抛 Error 而非字符串

---

## 四、可靠性与生态

### 模式 16：__proto__ 防污染 - CVE-2019-11358 修复 3 行代码

**问题场景**：2018 年 prototype pollution CVE 揭示 `$.extend` 没防 `__proto__`。**恶意 JSON `{"__proto__": {"isAdmin": true}}` 污染所有对象**。jQuery 3.4.0 加 3 行代码修复。

**解决方案代码**（`src/core.js:153` 节选）：
```js
for (name in options) {
  src = target[name];
  copy = options[name];

  // Prevent Object.prototype pollution (CVE-2019-11358)
  if (name === "__proto__" || target === copy) continue;
  // ... 后续合并逻辑
}
```

**关键参数表**：

| 字段 | 含义 |
| :--- | :--- |
| `name === "__proto__"` | 跳过 `__proto__` key |
| `target === copy` | 防自引用死循环 |
| CVE | CVE-2019-11358 |
| 修复版本 | 3.4.0+ |

**最佳实践**：
- ✅ **3 行代码** 防 prototype pollution
- ✅ 任何"深 merge / extend"项目**必须**加这 3 行
- ✅ 同时防 `constructor.prototype`（额外保险）
- ✅ 配合 ESLint 规则检测残留
- ✅ OWASP 2021 Top 10 收录

---

### 模式 17：Promises/A+ 2.1.2 合规 - 872 case 全过

**问题场景**：jQuery 1.5 Deferred 是"Promise 雏形"，**3.x 起完整 Promises/A+ 2.3.3**。官方 `@mgol/promises-aplus-tests@2.1.2-mgol.2` 套件 872 case 全部通过，**第三方背书**。

**解决方案**（`test/promises_aplus_adapters/` 节选）：
```js
// jQuery Deferred → A+ 适配器
module.exports = {
  resolved: function(value) { return jQuery.Deferred().resolve(value).promise(); },
  rejected: function(reason) { return jQuery.Deferred().reject(reason).promise(); },
  deferred: function() {
    var d = jQuery.Deferred();
    return {
      promise: d.promise(),
      resolve: d.resolve,
      reject: d.reject,
    };
  }
};
```

**关键参数表**：

| A+ 要求 | jQuery Deferred 实现 |
| :--- | :--- |
| 2.1 Promise 状态 | pending / resolved / rejected |
| 2.2 then 方法 | `.then(onFulfilled, onRejected)` |
| 2.3 thenable 桥接 | `adoptValue` + `thenable` 检测 |
| 2.3.3.3.4.1 忽略 post-resolution 异常 | `maxDepth` 计数器 |

**最佳实践**：
- ✅ **Promises/A+ 合规是** 第三方背书
- ✅ 任何"自研 Promise"项目可借鉴
- ✅ 872 case 官方测试**全过**
- ✅ thenable 桥接（`if (typeof then === "function")`）
- ✅ `maxDepth` 实现 2.3.3.3.4.1

---

### 模式 18：noConflict() 模式 - 不强制挂 window

**问题场景**：jQuery 1.0 默认 `window.jQuery = window.$ = jQuery`，**与同页 Prototype.js / Zepto 冲突**。`$.noConflict()` 让用户拿回 `$` 控制权。

**解决方案代码**（`src/exports/global.js` 节选）：
```js
noConflict = function(deep) {
  if (window.$ === jQuery) window.$ = _$;  // 还原旧 $
  if (deep && window.jQuery === jQuery) window.jQuery = _jQuery;  // deep 模式还原 jQuery
  return jQuery;  // 返回 jQuery 用于重新赋值
};
```

**关键参数表**：

| 参数 | 含义 |
| :--- | :--- |
| 默认 | `window.$ = window.jQuery = jQuery` |
| `noConflict()` | 仅让出 `$` |
| `noConflict(true)` | 让出 `$` + `jQuery` |

**最佳实践**：
- ✅ **`noConflict()`** 是多库共存标准
- ✅ 任何"工具库 + 挂全局"项目可借鉴
- ✅ 默认挂全局可选（如 es-module-shims）
- ✅ `_$` / `_jQuery` 暂存旧引用
- ✅ `deep` 参数让出更彻底

---

### 模式 19：OpenJS Foundation 治理 - HeroDevs NES + 月度会议

**问题场景**：20 年老项目，**长期维护**需要中立 + 资金。OpenJS Foundation 托管 + HeroDevs NES（Never-Ending Support）商业支持 + 月度公开会议。

**解决方案**（治理结构）：
```
治理
├── OpenJS Foundation Cross-Project Council
├── jQuery Team 自治（10+ 维护者）
├── timmywil/dependabot/arthurvr/gibson042/sgrove
└── 商业支持：HeroDevs NES

流程
├── commitplease 强制 [Component] description
├── 30 天无活动 issue 自动 lock
├── Bot 维护依赖
└── 月度公开会议（meetings.jquery.org）

沟通
├── Matrix #jquery_meeting:gitter.im
├── GitHub Issues
├── Trac 老 issue 索引
└── 论坛 contrib.jquery.org
```

**关键参数表**：

| 维度 | 数据 |
| :--- | :--- |
| Star | 59k+ |
| 维护者 | 10+ |
| License | MIT |
| 主仓库 | jquery/jquery |
| 月下载 | npm 数千万 |
| WordPress | 默认捆绑（**~30% 全网**）|

**最佳实践**：
- ✅ **OpenJS Foundation 托管** = 中立 + 长期
- ✅ **HeroDevs NES** 商业支持反哺开源
- ✅ `commitplease` 强制 commit 格式
- ✅ 任何"20 年长寿"项目可借鉴
- ✅ 月度公开会议透明治理

---

### 模式 20：CDN + SRI hash + CSP 兼容 - 4 件套发布

**问题场景**：jQuery 通过 CDN 加速（jsDelivr/unpkg/Google CDN），**SRI hash 校验防篡改**，**CSP nonce 透传**保证 inline script 可控。4 件套（CDN + SRI + CSP + TrustedHTML）保证生产安全。

**解决方案**（发布 4 件套）：
```html
<!-- 1. CDN 加速 -->
<script src="https://code.jquery.com/jquery-4.0.0.min.js"
        integrity="sha384-...SRI hash..."   <!-- 2. SRI 校验 -->
        crossorigin="anonymous"></script>

<!-- 3. CSP nonce 兼容（4.0 DOMEval 支持 nonce 透传） -->
<meta http-equiv="Content-Security-Policy"
      content="script-src 'self' 'nonce-{nonce}' https://code.jquery.com">

<!-- 4. TrustedHTML 字符串支持（4.0） -->
<script>jQuery.trustedHTMLPolicy.createHTML(...)</script>
```

**关键参数表**：

| 4 件套 | 用途 |
| :--- | :--- |
| CDN 加速 | jsDelivr/unpkg/Google CDN mirror |
| SRI hash | `<script integrity="sha384-...">` 校验 |
| CSP nonce | `DOMEval` 支持 nonce 透传 |
| TrustedHTML | 4.0 起 Trusted Types 兼容 |

**最佳实践**：
- ✅ **CDN + SRI + CSP + TrustedHTML** 4 件套
- ✅ 任何"前端库发布"项目可借鉴
- ✅ SRI hash 必须在发布时计算
- ✅ `DOMEval` 4.0 支持 nonce 透传
- ✅ Trusted Types 防 XSS

---

## 总结速查

**一句话价值**：jQuery = 29000 行 JavaScript + 20 年浏览器兼容 + 构造函数 + new 双形态 + Callbacks 状态机 + Deferred Promise + Data 内部总线 + 4 件套发布 = 59k+ Star 统治 Web 前端 15 年的"瑞士军刀"。

**5 个核心架构模式**：
1. **jQuery.fn.init 多态分派**：7 种入参一个函数，`init.prototype = jQuery.fn` 共享 prototype
2. **$.extend 双语义**：深浅拷贝 + 防 `__proto__` 污染
3. **Callbacks 6 变量 + 4 flag**：once / memory / unique / stopOnFalse 自由组合
4. **Deferred tuples 数组**：表格驱动代替 if/else 调度
5. **Data 内部总线 + dual namespace**：dataPriv / dataUser 单一真相源

**5 个性能优化模式**：
1. **Sizzle rquickExpr 快速路径**：80% 选择器走原生 qSA
2. **rsingleTag 单标签正则**：HTML 字符串快速识别
3. **jsdom + QUnit Node 单测**：22 模块 QUnit
4. **build:all 4 变体**：main / slim / factory / factory-slim
5. **jQuery.error + exceptionHook**：全局异常捕获

**5 个可靠性与生态模式**：
1. **`__proto__` 防污染**：CVE-2019-11358 3 行修复
2. **Promises/A+ 2.1.2 合规**：872 case 全过
3. **noConflict() 不强制挂 window**：多库共存
4. **OpenJS Foundation 治理**：HeroDevs NES + 月度会议
5. **CDN + SRI + CSP + TrustedHTML 4 件套发布**

**5 段必读代码（按学习顺序）**：
- `src/core/init.js:18-122`（7 种入参的 init 分派器）
- `src/core.js:115-185`（`$.extend` 深浅拷贝 + 防 `__proto__`）
- `src/callbacks.js:36-200`（Callbacks 状态机 4 flag）
- `src/deferred.js:43-200`（Deferred 完整 Promises/A+）
- `src/data/Data.js:6-150`（Data 系统 + expando uuid）

**3 个避坑要点**：
1. **不要把"重载分派"塞进 init**（123 行 7 种入参，cyclomatic complexity > 20）
2. **不要把正则散落到 100+ 个 var 目录**（维护成本高）
3. **不要让 `window.jQuery` 静默挂载**（用 `$.install(window)` 显式调用）

**仓库元信息**：
- 路径：`G:\Obsidian Vault\实战案例\jquery.md`
- 版本：v4.0.0
- 主语言：JavaScript（4.0 起 ESM）
- 核心入口：`src/jquery.js`（39 行 facade）
- 关键模块：`core` / `selector` / `event` / `ajax` / `deferred` / `callbacks` / `data`
- License：MIT
- Star：59k+
