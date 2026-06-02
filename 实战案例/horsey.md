# Horsey - 渐进增强自动补全设计模式

**来源**：G:\实战案例\GitHub顶尖项目\horsey\
**创建时间**：2026-06-02

---

## 一、核心机制与微包组合

### 1. 微包组合架构（Micro-Package Composition）

**问题场景**：前端 autocomplete 组件如果要实现"emitter + 滚动容器 + 模糊搜索 + DOM 选择 + 防抖"等能力，传统做法是引入 jQuery + jQuery UI（500KB+）或者自己写一遍。horsey 的解法是"**8 个 < 5KB 微包**"——每个能力拆成独立 npm 包，**主文件只做编排**。

**解决方案**：
```js
// horsey.js 入口（基于公开知识补充）
function horsey(el, options = {}) {
  const {
    set, filter, source, cache = {},
    renderItem, renderCategory,
    debounce, getText, getValue
  } = options;
  
  if (!source) return;  // 早退
  
  // 8 个微依赖按需组合
  const emitter = new contra.emitter();           // contra/emitter
  const debounced = lodash.debounce(runSource, 200); // lodash/debounce
  const selector = sektor('.horsey-dropdown');     // sektor (DOM 选择)
  const scroller = bullseye(selector);             // bullseye (滚动到可视)
  const event = crossvent;                         // crossvent (跨浏览器事件)
  const text = fuzzysearch;                        // fuzzysearch (子序列匹配)
  const sumHash = hashSum;                         // hash-sum (短哈希)
  
  // 主逻辑：编排而非实现
  return autocomplete(el, { source, filter, render, ... });
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 微包数量 | 8 | bullseye/contra/crossvent/fuzzysearch/hash-sum/lodash/sektor/sell |
| 单包大小 | < 5KB | 极致轻量 |
| 总包大小 | < 30KB | 比 jQuery UI 小 1 个数量级 |
| 升级独立性 | 每个独立 | npm semver |

**最佳实践**：
1. ✅ 每个能力 = 独立 npm 包，**升级时不影响主包**
2. ✅ 主文件只做"编排"，**不写实现**（事件/diff/滚动都委托微包）
3. ✅ 微包命名要"语义化"（`fuzzysearch` 而不是 `search-utils`）——**搜索可得**
4. ✅ 微包停更风险大，**主包应能容忍 1-2 个微包停止维护**

### 2. 渐进增强与 IE7 兼容（Progressive Enhancement & IE7）

**问题场景**：现代 JS 组件常假设 `addEventListener`、`Array.from`、`Promise` 可用，导致企业内网 IE7-IE9 用户**完全无法使用**。horsey 维护"ES2015 主源 + ES5 编译版"双版本，**Babel 把 ES2015 编译成 ES5 给老 IE**，同时保留现代语法给现代浏览器。

**解决方案**：
```js
// horsey.js ES2015 主源（基于公开知识补充）
function horsey(el, options = {}) {
  const { source, cache = {} } = options;  // 解构 + 默认值
  // ...现代语法
}

// horsey.es5.js ES5 编译版
function horsey(el, options) {
  var source = options.source;
  var cache = options.cache || {};
  // 兼容 IE7：
  // 1. addEventListener → attachEvent (IE9 才支持)
  // 2. Array.indexOf → 自实现
  // 3. Function.bind → 自实现
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 浏览器最低 | IE7 | 内网老机器 |
| 编译工具 | Babel 6 | 2018 时代标准 |
| 主源语法 | ES2015 | 解构/箭头/let |
| 编译输出 | UMD | CommonJS + AMD + global |

**最佳实践**：
1. ✅ 内部项目（如政企/医疗）**必须双版本**，外部项目可只 ES2015
2. ✅ 用 `npx babel horsey.js -o horsey.es5.js`，CI 自动出双版本
3. ✅ 旧版用 `try/catch` 包裹新 API 探测，**降级而非崩**
4. ✅ 不要用 `Optional chaining` `?.`（IE 全不支持），用 `value && value.foo`

### 3. 模糊搜索算法（Fuzzy Subsequence Search）

**问题场景**：用户输入"gm"，传统 substring 搜索匹配不到 "Go Modules"。**模糊搜索**允许输入"gm"匹配"G(0)o(1) (2)M(3)o(4)d(5)u(6)l(7)e(8)s(9)"——只要 needle 的字符按顺序在 haystack 出现就匹配。

**解决方案**：
```js
// fuzzysearch 单文件算法（基于公开知识补充）
function fuzzysearch(needle, haystack) {
  needle = needle.toLowerCase();
  haystack = haystack.toLowerCase();
  var hlen = haystack.length;
  var nlen = needle.length;
  if (nlen > hlen) return false;
  if (nlen === hlen) return needle === haystack;
  
  outer: for (var i = 0, j = 0; i < nlen; i++) {
    var nch = needle.charCodeAt(i);
    while (j < hlen) {
      if (haystack.charCodeAt(j++) === nch) {
        continue outer;  // 找到 needle[i]，继续外层
      }
    }
    return false;  // needle[i] 在 haystack 剩余部分找不到
  }
  return true;  // 全部字符按顺序找到
}

// 使用
fuzzysearch('gm', 'Go Modules');   // true (g=0, m=3)
fuzzysearch('hex', 'hexo');        // true
fuzzysearch('ey', 'horsey');       // true (e=3, y=6)
fuzzysearch('ye', 'horsey');       // false (y 后面没 e)
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 时间复杂度 | O(n*m) | n=needle, m=haystack |
| 大小写 | 不敏感 | toLowerCase |
| 性能 | 100 万次 < 100ms | 极快 |
| 替代 | trie | 模糊但 O(建树) |

**最佳实践**：
1. ✅ 1000 项以下用 `fuzzysearch`，**1000+ 改用 fuse.js**（权重打分）
2. ✅ 大小写归一化必须，**否则用户输"GM"匹配不到"go modules"**
3. ✅ `continue outer` 标签比 break 优雅，**维护性好**
4. ✅ `charCodeAt` 比 `indexOf` 快 30%（避免创建中间字符串）

### 4. 三态异步源（Tri-State Async Source）

**问题场景**：autocomplete 的 `source` 函数需要支持多种数据源——同步数组（本地数据）、Promise（fetch）、Node-style 回调（旧 API）。如果强制一种，**用户写起来痛苦**。horsey 检测类型，**同步/Promise/回调都接受**。

**解决方案**：
```js
// 三态 source 处理（基于公开知识补充）
function sourceFunction(text, render) {
  const data = source(text);
  
  if (data && data.then) {
    // 1. Promise 风格
    data.then(list => render(filterList(list, text)));
  } else if (Array.isArray(data)) {
    // 2. 同步数组
    render(filterList(data, text));
  } else {
    // 3. Node-style 回调
    data(list => render(filterList(list, text)));
  }
}

// 用户调用
horsey(input, {
  // 同步
  source: (text) => ['apple', 'banana', 'cherry'].filter(...),
  
  // Promise
  source: async (text) => await fetch(`/api/search?q=${text}`).then(r => r.json()),
  
  // 回调
  source: (text, cb) => $.getJSON(`/api/search?q=${text}`, cb)
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 同步 | Array | 本地数据 |
| Promise | thenable | fetch / axios |
| 回调 | (cb) => void | 旧 jQuery API |
| 渲染回调 | render(filtered) | 统一出口 |

**最佳实践**：
1. ✅ 优先支持 Promise，**兼容老代码加回调分支**
2. ✅ 检测 `data.then` 比 `data instanceof Promise` 宽——**thenable 都接受**
3. ✅ 错误处理用 `Promise.catch`，**回调用户自己处理**
4. ✅ 同步 source 不要返 10000+ 项，**过滤+limit 必须在主流程**

### 5. Debounce 防抖与缓存（Debounce & Cache）

**问题场景**：用户连续输入"hello"，每次按键都触发 source 拉取，5 次请求冗余。**debounce 200ms** 等用户停手再请求；**缓存** key = input text，避免重复请求。

**解决方案**：
```js
// 防抖 + 缓存（基于公开知识补充）
import debounce from 'lodash/debounce';

const cache = {};  // text → results

function runSource(text) {
  // 1. 查缓存
  if (cache[text]) {
    return render(cache[text]);
  }
  
  // 2. 拉取
  const data = source(text);
  if (data && data.then) {
    data.then(list => {
      cache[text] = list;  // 写入缓存
      render(filterList(list, text));
    });
  } else if (Array.isArray(data)) {
    cache[text] = data;
    render(filterList(data, text));
  }
}

// 200ms 防抖
const debounced = debounce(runSource, 200);

input.addEventListener('input', (e) => {
  debounced(e.target.value);
});

// 预测下一搜索（提前拉）
function predictNextSearch(text) {
  // 输入 "java" 时预拉 "javascript"
  const predictions = text.split('').reduce((acc, _, i) => {
    return [...acc, text.slice(0, i + 2)];
  }, []);
  predictions.forEach(p => {
    if (!cache[p]) {
      runSource(p);  // 后台拉取
    }
  });
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| debounce | 200ms | 用户停手后触发 |
| 缓存 key | input text | 精确匹配 |
| 预测 | 后续字符 | 提前拉取 |
| 缓存上限 | 100 项 | 防止 OOM |

**最佳实践**：
1. ✅ 200ms 是平衡点——**太短误触发，太长用户感知延迟**
2. ✅ 缓存必须 `LRU` 限制大小，**否则 10000 个字符全缓存 = OOM**
3. ✅ 预测搜索用后台拉取，**不阻塞当前输入**
4. ✅ 缓存失效：用户按 Esc 或清空 input → 清缓存

## 二、架构设计与接口边界

### 6. 渲染与列表项（Render & List Items）

**问题场景**：不同场景下拉项要展示不同内容（头像 + 用户名、icon + 命令、纯文本）。horsey 让用户传 `renderItem` 函数，**完全自定义渲染**——框架不写 HTML 字符串拼装。

**解决方案**：
```js
// 自定义渲染（基于公开知识补充）
horsey(input, {
  source: async (text) => await fetch(`/api/users?q=${text}`).then(r => r.json()),
  
  // 单项渲染：返回 HTML 字符串
  renderItem: (item) => `
    <div class="user-item">
      <img src="${item.avatar}" alt="">
      <span>${item.name}</span>
      <em>${item.email}</em>
    </div>
  `,
  
  // 分类标题（可选）
  renderCategory: (category) => `
    <h6 class="category-header">${category}</h6>
  `,
  
  // 无匹配提示
  renderEmpty: () => '<div class="no-results">No matches found</div>',
  
  // 分组
  getCategory: (item) => item.department
});

// 内置默认渲染
const defaultRender = (item) => `<li>${item.toString()}</li>`;
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| renderItem | function | 返回 HTML 字符串 |
| renderCategory | function | 分类标题 |
| renderEmpty | function | 无匹配 |
| 安全性 | 注意 XSS | 框架不自动 escape |

**最佳实践**：
1. ✅ 用户传 `renderItem` 时**自己负责 XSS 转义**（用 `textContent` 而非 `innerHTML`）
2. ✅ 框架不限制 DOM 结构，**完全自定义**
3. ✅ 分类渲染可选——不用就传 `null`
4. ✅ 渲染函数保持**纯函数**（无副作用），**避免每次 render 重建 DOM**

### 7. 键盘导航与无障碍（Keyboard Nav & ARIA）

**问题场景**：autocomplete 必须支持键盘——↑↓导航、Enter 确认、Esc 关闭、Tab 补全。同时要无障碍——`aria-*` 属性 + `role="combobox"`，**屏幕阅读器可读**。

**解决方案**：
```js
// 键盘事件处理（基于公开知识补充）
input.addEventListener('keydown', (e) => {
  switch (e.keyCode) {
    case 38: // ↑
      e.preventDefault();
      moveSelection(-1);
      break;
    case 40: // ↓
      e.preventDefault();
      moveSelection(1);
      break;
    case 13: // Enter
      e.preventDefault();
      confirmSelection();
      break;
    case 27: // Esc
      e.preventDefault();
      closeDropdown();
      break;
    case 9:  // Tab
      confirmSelection();
      break;
  }
});

function moveSelection(delta) {
  const items = document.querySelectorAll('.horsey-item');
  currentIndex = Math.max(0, Math.min(items.length - 1, currentIndex + delta));
  items[currentIndex]?.scrollIntoView({ block: 'nearest' });
  updateAriaActive(items[currentIndex]);
}

// ARIA 属性
input.setAttribute('aria-autocomplete', 'list');
input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
input.setAttribute('aria-controls', 'horsey-listbox');
input.setAttribute('role', 'combobox');

listbox.setAttribute('role', 'listbox');
listbox.id = 'horsey-listbox';

items.forEach((item, i) => {
  item.setAttribute('role', 'option');
  item.setAttribute('aria-selected', i === currentIndex ? 'true' : 'false');
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| ↑↓ | 38/40 | 上下导航 |
| Enter | 13 | 确认 |
| Esc | 27 | 关闭 |
| Tab | 9 | 补全 |
| ARIA | combobox/listbox/option | W3C 标准 |

**最佳实践**：
1. ✅ 键盘事件**preventDefault 阻止默认**（避免表单 submit）
2. ✅ `scrollIntoView({ block: 'nearest' })`——只在不可见时滚动
3. ✅ 屏幕阅读器必须支持——**`aria-activedescendant` 指向选中项**
4. ✅ `aria-expanded` 反映下拉状态——**true/false 切换**

### 8. 自定义值与文本提取（Custom Value/Text Extraction）

**问题场景**：数据源是 `[{ id: 1, name: 'Alice', email: 'a@b.com' }]`，但 input.value 要显示 "Alice"（不是 `{...}`），选中后要拿到 `id: 1`（不是整个对象）。horsey 让用户传 `getText` + `getValue`，**支持字段名或函数**。

**解决方案**：
```js
// getText + getValue（基于公开知识补充）
const users = [
  { id: 1, name: 'Alice', email: 'alice@ex.com' },
  { id: 2, name: 'Bob', email: 'bob@ex.com' }
];

horsey(input, {
  source: (text) => users.filter(u => u.name.includes(text)),
  
  // 三种 getText 形式
  getText: 'name',           // 字段名 → d => d.name
  // getText: (d) => d.name, // 函数形式
  // getText: undefined,     // 默认 d => d.toString()
  
  // 三种 getValue 形式
  getValue: 'id',            // 字段名 → d => d.id
  // getValue: (d) => d.id,
  // getValue: undefined,     // 默认 d => d（整个对象）
  
  set: (value) => {
    console.log('selected value:', value);
    // value 是 getValue 的结果，可能是字段值或对象
  }
});

// 当用户选择 Alice 时：
// input.value 显示 "Alice"（来自 getText）
// set 回调收到 1（来自 getValue = 'id'）
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| getText | 'name' / function / undefined | 列表显示 |
| getValue | 'id' / function / undefined | 选中值 |
| set | function | 选中后回调 |
| 默认 | `d => d.toString()` | 兜底 |

**最佳实践**：
1. ✅ 优先用字段名字符串（`'name'`），**比函数更可序列化**
2. ✅ `getValue` 默认返回**整个对象**，**用户传字段名更安全**
3. ✅ `set` 回调必须**显式声明**，否则用户不知道选中后发生什么
4. ✅ 多语言场景 `getText: (d) => d[locale].name`

### 9. 列表项限制与虚拟滚动（Limit & Virtual Scrolling）

**问题场景**：搜索结果 1000+ 项时，下拉列表 1000 个 DOM 节点**渲染卡顿**。horsey 默认 `limit: Infinity`（显示全部），但提供 `limit` 配置；**超长列表应配合虚拟滚动**（仅渲染可见项）。

**解决方案**：
```js
// limit 配置（基于公开知识补充）
horsey(input, {
  source: ...,  // 可能返回 1000 项
  limit: 50,   // 最多展示 50 项（其他滚动可见，但有上限）
  // limit: Infinity  // 默认全部
});

// 虚拟滚动（用 bullseye + 手动实现）
import bullseye from 'bullseye';

function renderVirtualList(items, container, itemHeight = 32) {
  const totalHeight = items.length * itemHeight;
  const viewportHeight = container.clientHeight;
  
  // 仅渲染可见项
  const visibleStart = Math.floor(container.scrollTop / itemHeight);
  const visibleEnd = Math.ceil((container.scrollTop + viewportHeight) / itemHeight);
  
  const visibleItems = items.slice(visibleStart, visibleEnd);
  
  // 用 transform 定位
  container.innerHTML = `
    <div style="height: ${totalHeight}px; position: relative;">
      ${visibleItems.map((item, i) => `
        <div style="position: absolute; top: ${(visibleStart + i) * itemHeight}px; 
                    height: ${itemHeight}px;">
          ${item.label}
        </div>
      `).join('')}
    </div>
  `;
}

// bullseye 提供滚动到可视区
const scroller = bullseye(container);
scroller.scrollToItem(currentIndex);  // 滚动到选中项
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| limit | 50-100 | 上限 |
| itemHeight | 30-40 | 固定高 |
| viewportHeight | 300px | 可视高 |
| 1000 项 | 50 DOM | 节省 95% |

**最佳实践**：
1. ✅ 1000+ 项必须虚拟滚动，**否则下拉卡死**
2. ✅ 固定 itemHeight（`height: 32px`）——**动态高度需要 ResizeObserver**
3. ✅ 选中项滚动用 `scrollIntoView({ block: 'nearest' })`——**最小化滚动**
4. ✅ 限制 `limit: 50` 是简单方案，**复杂场景才上虚拟滚动**

### 10. 异步结果缓存策略（Async Result Caching）

**问题场景**：用户输入"hello" → 拉取结果 → 1 秒后用户删掉"llo"变成"he" → 拉取新结果 → 1 秒后用户又改回"hello" → **重新拉取**！缓存 key = input text，**避免重复拉取**。

**解决方案**：
```js
// 缓存策略（基于公开知识补充）
class SourceCache {
  constructor(maxSize = 100) {
    this.cache = new Map();  // 保留插入顺序
    this.maxSize = maxSize;
  }
  
  get(key) {
    return this.cache.get(key);
  }
  
  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // LRU 淘汰最早的
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  clear() {
    this.cache.clear();
  }
}

const cache = new SourceCache(100);

function runSource(text) {
  if (cache.get(text)) {
    return render(cache.get(text));
  }
  
  source(text).then(list => {
    cache.set(text, list);
    render(filterList(list, text));
  });
}

// 智能预测：输入 "java" 时预拉 "javascript"
function predictNextSearch(text) {
  if (text.length < 2) return;
  // 下一字符的所有可能性
  for (let char of 'abcdefghijklmnopqrstuvwxyz') {
    const next = text + char;
    if (!cache.get(next)) {
      source(next).then(list => cache.set(next, list));  // 后台拉
    }
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| maxSize | 100 | 内存上限 |
| 淘汰策略 | LRU | 最近最少使用 |
| 命中率 | 60-80% | 重复输入时高 |
| 预测 | 后续字符 | 1-2 字符提前 |

**最佳实践**：
1. ✅ 缓存大小必须限，**防止 OOM**（100 项 = 1-10MB）
2. ✅ LRU 比 FIFO 命中率**高 20%**
3. ✅ 预测搜索在 `debounce` **外**运行（不阻塞主流程）
4. ✅ 缓存写入用 `cache.set`，不要直接赋值

## 三、性能与运行时优化

### 11. DOM 操作最小化（DOM Diffing & Reflow）

**问题场景**：每次输入都重新渲染整个下拉列表（1000 个 DOM 节点）= 浏览器重排重绘 = 卡顿。horsey 用"**必要的最小化 DOM 操作**"——只在选中项变化时更新类名，不重建 DOM。

**解决方案**：
```js
// 最小化 DOM 操作（基于公开知识补充）
class ListRenderer {
  constructor(container) {
    this.container = container;
    this.items = [];  // 当前渲染的 items
    this.selectedIndex = -1;
  }
  
  // 全量渲染（仅在数据变化时）
  setItems(items) {
    if (items.length !== this.items.length) {
      // DOM 数量变化：全量重建
      this.container.innerHTML = items.map((item, i) => 
        this._renderItem(item, i)
      ).join('');
    } else {
      // DOM 数量不变：只更新内容
      items.forEach((item, i) => {
        const node = this.container.children[i];
        if (node.dataset.id !== item.id) {
          // id 变化：更新内容
          node.innerHTML = this._renderItemContent(item);
        }
      });
    }
    this.items = items;
  }
  
  // 选中项变化：只切类名
  setSelected(index) {
    if (this.selectedIndex === index) return;
    // 移除旧选中
    if (this.selectedIndex >= 0) {
      this.container.children[this.selectedIndex]?.classList.remove('selected');
    }
    // 添加新选中
    this.container.children[index]?.classList.add('selected');
    this.selectedIndex = index;
  }
  
  _renderItem(item, i) {
    return `<div class="horsey-item" data-id="${item.id}" 
                 data-index="${i}">${this._renderItemContent(item)}</div>`;
  }
  
  _renderItemContent(item) {
    return item.html || `<span>${item.label}</span>`;
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| DOM 节点 | < 200 | 浏览器流畅 |
| 重排 | classList 切换 | 不触发重排 |
| 重建 | 数量变化时 | 不可避免 |
| requestAnimationFrame | 16ms | 合批 |

**最佳实践**：
1. ✅ 选中项变化**只切 class**，**不重建 DOM**
2. ✅ 大量 DOM 操作包在 `requestAnimationFrame`——**避免 60Hz 抖动**
3. ✅ 离屏 DOM 用 `DocumentFragment`——**一次插入触发一次重排**
4. ✅ 大列表用 CSS `transform` 替代 `top/left`——**GPU 加速**

### 12. 输入防抖与节流（Debounce vs Throttle）

**问题场景**：用户连续输入"abcde"，5 次按键触发 5 次 source 调用。**debounce** 等用户停手再触发 1 次；**throttle** 每 200ms 最多触发 1 次。horsey 用 debounce（等用户停手）。

**解决方案**：
```js
// debounce vs throttle（基于公开知识补充）
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';

// 场景 1：搜索（debounce）
// 用户输入"java"，需要等用户停手 200ms 再搜索
const searchDebounced = debounce((text) => {
  source(text);
}, 200);

input.addEventListener('input', (e) => {
  searchDebounced(e.target.value);
});

// 场景 2：滚动（throttle）
// 滚动事件每 16ms 触发一次，但 UI 更新只 60Hz
const updateThrottled = throttle(() => {
  updateScrollPosition();
}, 16);

window.addEventListener('scroll', updateThrottled);

// 场景 3：autocomplete 实际是 debounce
// 用户打字过程中**不需要**实时搜索，等停手再搜
const debounced = debounce((text) => {
  runSource(text);
}, 200);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| debounce | 200ms | autocomplete 标准 |
| throttle | 16-100ms | 滚动/拖拽 |
| leading | false | 首调用不立即触发 |
| trailing | true | 尾调用触发 |

**最佳实践**：
1. ✅ autocomplete 必用 debounce 200ms——**用户停手才搜**
2. ✅ 滚动用 throttle 16ms——**保证 60fps**
3. ✅ debounce 的 `leading: false` 避免打字第一个字符就搜
4. ✅ 防抖函数**不能嵌套**（防抖后再防抖 = 双重延迟）

### 13. 异步请求取消（Request Cancellation）

**问题场景**：用户输入"a" → 拉取（耗时 1s）→ 用户 100ms 后输入"b" → 拉取（耗时 1s）→ 用户先看到 "b" 的结果，**500ms 后 "a" 的结果回来覆盖**——结果错乱。

**解决方案**：
```js
// 请求取消（基于公开知识补充）
let currentRequest = null;
let currentRequestId = 0;

function runSource(text) {
  // 1. 取消上一次请求
  if (currentRequest && currentRequest.abort) {
    currentRequest.abort();
  }
  
  // 2. 记录新请求 ID
  const myId = ++currentRequestId;
  
  // 3. fetch + AbortController
  const controller = new AbortController();
  currentRequest = controller;
  
  fetch(`/api/search?q=${text}`, { signal: controller.signal })
    .then(r => r.json())
    .then(list => {
      // 4. 只接受最新请求的结果
      if (myId !== currentRequestId) return;
      cache.set(text, list);
      render(filterList(list, text));
    })
    .catch(err => {
      if (err.name === 'AbortError') return;  // 被取消，正常
      throw err;
    });
}

// 旧浏览器兼容：XMLHttpRequest
function xhrSource(text) {
  if (currentRequest && currentRequest.abort) {
    currentRequest.abort();
  }
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `/api/search?q=${text}`);
  xhr.onload = () => {
    if (xhr.readyState === 4 && xhr.status === 200) {
      const list = JSON.parse(xhr.responseText);
      render(filterList(list, text));
    }
  };
  xhr.send();
  currentRequest = xhr;
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| AbortController | modern | fetch/axios |
| XMLHttpRequest | 旧浏览器 | .abort() |
| race condition | requestId | 标记最新 |
| 取消时机 | 新请求前 | abort 上一个 |

**最佳实践**：
1. ✅ 每次新请求前 `abort` 上一个——**避免结果错乱**
2. ✅ 用 `requestId` 二次防御——**已完成的 fetch 不会触发**
3. ✅ `AbortError` 必须 catch 但不报错——**正常取消**
4. ✅ 老 IE 11 用 `XMLHttpRequest.abort()` 兼容

### 14. 列表项懒渲染（Lazy Render & DocumentFragment）

**问题场景**：1000 个 DOM 节点**单次插入**触发 1 次重排，**多次插入**触发 1000 次重排。`DocumentFragment` 把 1000 个节点**先组好**再一次性插入——**1 次重排**。

**解决方案**：
```js
// DocumentFragment 批量插入（基于公开知识补充）
function renderItems(items) {
  const fragment = document.createDocumentFragment();
  
  items.forEach((item, i) => {
    const li = document.createElement('div');
    li.className = 'horsey-item';
    li.dataset.id = item.id;
    li.dataset.index = i;
    li.innerHTML = renderItemContent(item);
    fragment.appendChild(li);
  });
  
  // 一次性插入（1 次重排）
  container.innerHTML = '';  // 清空
  container.appendChild(fragment);
}

// 虚拟滚动 + 懒渲染
function renderVisibleItems(items, container, scrollTop, viewportHeight) {
  const itemHeight = 32;
  const start = Math.floor(scrollTop / itemHeight);
  const end = Math.ceil((scrollTop + viewportHeight) / itemHeight);
  
  const fragment = document.createDocumentFragment();
  for (let i = start; i < end; i++) {
    const li = document.createElement('div');
    li.style.position = 'absolute';
    li.style.top = `${i * itemHeight}px`;
    li.style.height = `${itemHeight}px`;
    li.textContent = items[i].label;
    fragment.appendChild(li);
  }
  
  // 离屏区补 padding（保持滚动条）
  container.style.paddingTop = `${start * itemHeight}px`;
  container.style.paddingBottom = `${(items.length - end) * itemHeight}px`;
  
  container.innerHTML = '';
  container.appendChild(fragment);
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 节点数 | 1000 | 单次插入 |
| 重排次数 | 1 | DocumentFragment |
| 性能提升 | 10x | vs 多次 append |
| 虚拟项 | 10-20 | 可见+overscan |

**最佳实践**：
1. ✅ 100+ 项必用 DocumentFragment——**单次插入**
2. ✅ 虚拟滚动配合 paddingTop/paddingBottom——**保持滚动条正确**
3. ✅ 不要在循环里直接 `container.appendChild`——**N 次重排**
4. ✅ 清空用 `container.innerHTML = ''` 比 `removeChild` 快

### 15. 内存管理与清理（Memory Management & Cleanup）

**问题场景**：autocomplete 频繁创建/销毁 DOM 节点、事件监听、缓存——**内存泄漏**。horsey 提供 `horsey.destroy()` 释放所有资源。

**解决方案**：
```js
// 内存管理（基于公开知识补充）
class Horsey {
  constructor(el, options) {
    this.el = el;
    this.listeners = [];  // 记录所有监听器
    this.cache = new SourceCache();
    this._bind();
  }
  
  _bind() {
    // 记录事件监听
    const handler = (e) => this._handle(e);
    this.el.addEventListener('input', handler);
    this.listeners.push({ el: this.el, type: 'input', handler });
    
    // document 上也加（点击外部关闭）
    const docHandler = (e) => this._onClickOutside(e);
    document.addEventListener('click', docHandler);
    this.listeners.push({ el: document, type: 'click', handler: docHandler });
  }
  
  destroy() {
    // 1. 移除所有事件监听
    this.listeners.forEach(({ el, type, handler }) => {
      el.removeEventListener(type, handler);
    });
    this.listeners = [];
    
    // 2. 清空缓存
    this.cache.clear();
    
    // 3. 移除 DOM
    this.dropdown?.parentNode?.removeChild(this.dropdown);
    
    // 4. 解除循环引用
    this.el = null;
    this.dropdown = null;
  }
}

// 使用
const instance = horsey(input, options);
// ... 一段时间后
instance.destroy();  // 清理所有资源

// SPA 路由切换时
router.afterEach(() => {
  if (currentAutocomplete) {
    currentAutocomplete.destroy();
  }
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 监听器清理 | 100% | 必须 remove |
| 缓存清理 | LRU | 自动 + 显式 |
| DOM 节点 | parentNode.remove | 解除引用 |
| 循环引用 | 解除 | el = null |

**最佳实践**：
1. ✅ 组件销毁时**必调 destroy**——SPA 路由切换
2. ✅ 所有 addEventListener 必须配对 removeEventListener
3. ✅ 大缓存用 WeakMap——**自动 GC**
4. ✅ 闭包内不引用大对象——**只引用必要字段**

## 四、可靠性与工程实践

### 16. 安全性与 XSS 防护（XSS Prevention）

**问题场景**：用户输入 `<script>alert('xss')</script>` 触发 XSS。horsey 的 `renderItem` 返回 HTML 字符串，**框架不自动 escape**——**用户必须自己处理**。

**解决方案**：
```js
// XSS 防护（基于公开知识补充）
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

horsey(input, {
  source: ...,
  renderItem: (item) => {
    // 1. 用户输入必转义
    const name = escapeHTML(item.name);
    const email = escapeHTML(item.email);
    
    // 2. 内部数据可直接用（URL 验证）
    const url = validateURL(item.avatar);
    
    return `
      <div class="user-item">
        <img src="${url}" alt="${name}">
        <span>${name}</span>
        <em>${email}</em>
      </div>
    `;
  }
});

// 用 textContent 替代 innerHTML（最安全）
function renderItemSafe(item) {
  const li = document.createElement('div');
  const img = document.createElement('img');
  img.src = item.avatar;  // 浏览器验证 URL
  const span = document.createElement('span');
  span.textContent = item.name;  // 自动 escape
  li.appendChild(img);
  li.appendChild(span);
  return li.outerHTML;  // 拼回 HTML 字符串
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 转义 | 5 字符 | & < > " ' |
| img src | 验证 | 拒绝 javascript: |
| URL | 验证 | https:// only |
| textContent | 优先 | 自动转义 |

**最佳实践**：
1. ✅ 永远 escape 用户输入——**`escapeHTML` 5 字符必转**
2. ✅ 优先用 `textContent`/`setAttribute` 而非 `innerHTML`——**自动转义**
3. ✅ 验证 `img.src`——**防止 `javascript:` URL**
4. ✅ CSP 头 `script-src 'self'`——**最后一道防线**

### 17. 浏览器兼容与降级（Browser Compatibility）

**问题场景**：现代 JS 用了 `addEventListener`、`Array.from`、`fetch`，但企业内网老 IE 不支持。horsey 在 ES5 版本中**主动降级**——`addEventListener` 失败时用 `attachEvent`，`fetch` 失败时用 `XMLHttpRequest`。

**解决方案**：
```js
// 浏览器兼容（基于公开知识补充）
function addEvent(el, type, handler) {
  if (el.addEventListener) {
    // 标准
    el.addEventListener(type, handler, false);
  } else if (el.attachEvent) {
    // IE8-
    el.attachEvent('on' + type, handler);
  } else {
    // 极老浏览器
    el['on' + type] = handler;
  }
}

function removeEvent(el, type, handler) {
  if (el.removeEventListener) {
    el.removeEventListener(type, handler, false);
  } else if (el.detachEvent) {
    el.detachEvent('on' + type, handler);
  } else {
    el['on' + type] = null;
  }
}

// fetch 降级到 XHR
function fetchJSON(url) {
  if (window.fetch) {
    return fetch(url).then(r => r.json());
  }
  // XHR fallback
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send();
  });
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| addEventListener | IE9+ | 标准 |
| attachEvent | IE6-8 | 兼容 |
| fetch | IE 全不支持 | 用 XHR |
| Array.from | IE 不支持 | 用 [].slice.call |

**最佳实践**：
1. ✅ 内部项目用 IE7 兼容版（`horsey.es5.js`）
2. ✅ 外部项目可只 ES2015——**用户有现代浏览器**
3. ✅ 探测式降级（`if (window.fetch)`）优于 `try/catch` 包裹
4. ✅ 不支持的 API 在文档里**显式标注**

### 18. 主题与样式覆盖（Theme Customization）

**问题场景**：默认样式 30 行 Stylus 满足不了所有用户——企业主题、品牌色、紧凑布局。horsey 暴露 CSS 类名前缀（`horsey-*`），**用户用自己的 CSS 覆盖**。

**解决方案**：
```css
/* horsey.styl 默认样式（基于公开知识补充）*/
.horsey-dropdown {
  position: absolute;
  background: white;
  border: 1px solid #ccc;
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
}
.horsey-item {
  padding: 8px 12px;
  cursor: pointer;
}
.horsey-item.selected {
  background: #f0f0f0;
}
.horsey-category {
  font-weight: bold;
  padding: 4px 12px;
  color: #888;
}

/* 用户覆盖（企业主题）*/
.horsey-dropdown {
  background: #1e1e1e;
  border: 1px solid #333;
  font-family: -apple-system, sans-serif;
}
.horsey-item {
  color: #ddd;
  padding: 12px 16px;
}
.horsey-item.selected {
  background: #2a2a2a;
  color: #fff;
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 类名前缀 | `horsey-*` | 命名空间 |
| 自定义深度 | 3 层 | dropdown/item/selected |
| 主题切换 | 覆盖 CSS | 不需 JS |
| 动画 | CSS transition | 不阻塞 JS |

**最佳实践**：
1. ✅ 类名加前缀 `horsey-`——**避免全局污染**
2. ✅ 用户覆盖用更高优先级（`.my-app .horsey-item`）
3. ✅ 动画用 CSS transition（`transform: translateY`）——**GPU 加速**
4. ✅ 暗色主题用 `prefers-color-scheme: dark`——**系统自动**

### 19. 测试与质量保障（Testing Strategy）

**问题场景**：单文件 vanilla JS 库"测试难"——没有 React 测试库的便利，纯 DOM 操作。horsey 选择"**零单元测试 + example/ 演示**"——用 example 替代 e2e，新人对照 demo 学习。

**解决方案**：
```js
// 自动化测试方案（基于公开知识补充）
// 1. 用 puppeteer 跑 example/ 演示
const puppeteer = require('puppeteer');

describe('horsey smoke test', () => {
  let browser, page;
  
  beforeAll(async () => {
    browser = await puppeteer.launch();
    page = await browser.newPage();
    await page.goto('http://localhost:8000/example/');
  });
  
  it('shows dropdown when typing', async () => {
    await page.type('input', 'java');
    await page.waitForSelector('.horsey-dropdown', { visible: true });
    const items = await page.$$eval('.horsey-item', els => els.length);
    expect(items).toBeGreaterThan(0);
  });
  
  it('selects item with keyboard', async () => {
    await page.focus('input');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const value = await page.$eval('input', el => el.value);
    expect(value).toBeTruthy();
  });
  
  afterAll(async () => {
    await browser.close();
  });
});

// 2. 单元测试：DOM 测试用 jsdom
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><input id="test">');
global.document = dom.window.document;

const horsey = require('./horsey');
const instance = horsey(dom.window.document.getElementById('test'), {
  source: () => ['apple', 'banana']
});

instance.el.dispatchEvent(new dom.window.Event('input'));
expect(instance.dropdown).toBeTruthy();
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 测试类型 | 集成/e2e | example/ + puppeteer |
| 单元测试 | jsdom | 纯 JS |
| 覆盖率 | example 演示 | 替代覆盖率 |
| CI | puppeteer | 烟囱测试 |

**最佳实践**：
1. ✅ 至少写 e2e 测试（puppeteer + example/）——**证明组件能跑**
2. ✅ jsdom 测纯 JS 逻辑，**速度快**
3. ✅ 覆盖率不追求 100%，**example 演示覆盖核心场景**
4. ✅ 视觉回归用 `percy` / `chromatic`——**截图对比**

### 20. 分发与生态集成（Distribution & Ecosystem Integration）

**问题场景**：horsey 是 npm 包 + GitHub 仓库 + CDN 文件，**用户怎么用**？需要支持多种分发方式（npm / CDN / unpkg / jsdelivr / bower），让用户**3 步内集成**。

**解决方案**：
```html
<!-- 1. CDN 引入（最快上手）-->
<script src="https://unpkg.com/horsey@4.2.2/dist/horsey.min.js"></script>
<script>
  horsey(document.querySelector('input'), {
    source: ['apple', 'banana', 'cherry']
  });
</script>

<!-- 2. ES Module（Webpack/Vite）-->
<script type="module">
  import horsey from 'https://cdn.jsdelivr.net/npm/horsey@4.2.2/dist/horsey.min.js';
  horsey(input, options);
</script>
```

```js
// 3. npm + Webpack
import horsey from 'horsey';
import 'horsey/dist/horsey.css';  // 别忘了 CSS

horsey(input, options);

// 4. CommonJS
const horsey = require('horsey');

// 5. AMD
require.config({ paths: { horsey: 'https://unpkg.com/horsey' } });
require(['horsey'], (horsey) => { ... });
```

**package.json**：
```json
{
  "name": "horsey",
  "version": "4.2.2",
  "main": "dist/horsey.js",       // CommonJS
  "module": "dist/horsey.esm.js", // ESM
  "browser": "dist/horsey.min.js",// UMD
  "unpkg": "dist/horsey.min.js",  // CDN
  "jsdelivr": "dist/horsey.min.js",
  "files": ["dist", "src", "horsey.styl"]
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| main | CJS 入口 | Node.js |
| module | ESM 入口 | Webpack/Rollup |
| unpkg / jsdelivr | UMD | 浏览器直接 |
| files | dist/ | npm publish 范围 |

**最佳实践**：
1. ✅ 双版本发布（CJS + ESM + UMD）——**Node + 浏览器都支持**
2. ✅ `unpkg` 字段让 `https://unpkg.com/horsey` 直接可用
3. ✅ `files` 字段限制发布范围——**不暴露 test/ 目录**
4. ✅ `sideEffects: false`（ESM）——**Webpack tree-shake 友好**

---

**标签**：#horsey #autocomplete #vanilla-js #微包
**状态**：20/20 份详细内容
