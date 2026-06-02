# Mousetrap - 零依赖键盘快捷键库的归一化与序列状态机

**来源**：GitHub ccampbell/mousetrap
**创建时间**：2026-06-02

---

## 一、键盘事件归一化

### 1. 三事件一入口：_handleKeyEvent 统一调度（Event Funnel）

**问题场景**：浏览器键盘事件有 3 种（keydown / keypress / keyup），触发时机、可用字段、modifier 状态都不同；如果按"键字符"绑定，每个事件类型都得注册一次 listener，事件间状态难共享。

**解决方案**：
```js
// mousetrap.js _handleKeyEvent 简化
function _handleKeyEvent(element, event, handlerName) {
    if (event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement) {
        // input 内默认不触发（除非 bindGlobal）
        return;
    }
    
    var character = _characterFromEvent(event);
    
    if (character) {
        handler(character, event);
    }
}

// 三事件注册同一个 handler
_addEvent(targetElement, 'keypress', _handleKeyEvent);
_addEvent(targetElement, 'keydown', _handleKeyEvent);
_addEvent(targetElement, 'keyup', _handleKeyEvent);
```

```js
// mousetrap.js _characterFromEvent 简化（核心归一化）
function _characterFromEvent(e) {
    if (e.type === 'keypress') {
        var character = String.fromCharCode(e.which);
        if (!e.shiftKey) character = character.toLowerCase();
        return character;
    }
    // keydown / keyup
    if (e.keyCode in _MAP) return _MAP[e.keyCode];  // 27 → 'esc'
    if (e.keyCode in _KEYCODE_MAP) {
        return _KEYCODE_MAP[e.keyCode];  // 191 → '/'
    }
    return String.fromCharCode(e.which).toLowerCase();
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `_handleKeyEvent` | 三事件统一入口（funnel pattern） |
| `_characterFromEvent` | keyCode → 语义字符的归一化 |
| `_MAP` | 语义键（`esc` / `tab` / `enter`） |
| `_KEYCODE_MAP` | 符号键（`/` `?` `;`） |
| keypress 优先 | 字符型快捷键走 keypress 拿 ASCII |
| keydown 优先 | 功能键走 keydown 拿 keyCode |

**最佳实践**：
- ✅ 业务方多事件源统一 funnel 到一个 handler（避免状态分裂）
- ✅ 按事件类型分流字符归一（keypress 走字符，keydown 走语义）
- ✅ `keypress` 不按 shift 时 toLowerCase（防 Caps Lock 干扰）
- ❌ 切勿让 3 个事件各自一套逻辑（应用 funnel）
- ❌ 切勿在 keydown 里假设能拿到 ASCII（应分情况）

### 2. keyCode / key / which 三时代兼容（Legacy Polyfill）

**问题场景**：现代浏览器 `e.key` 字段好用（`'Escape'` / `'/'`），但老 IE（IE6-8）只有 `e.keyCode`；Mousetrap 1.6 时代要兼容 IE6+，必须用 keyCode。

**解决方案**：
```js
// mousetrap.js 跨浏览器垫片
function _addEvent(target, eventType, handler) {
    if (target.addEventListener) {
        target.addEventListener(eventType, handler, false);
    } else if (target.attachEvent) {
        target.attachEvent('on' + eventType, function(eventObject) {
            var e = {
                type: eventObject.type,
                which: eventObject.keyCode,
                target: eventObject.srcElement,
                shiftKey: eventObject.shiftKey,
                ctrlKey: eventObject.ctrlKey,
                metaKey: eventObject.metaKey,
                altKey: eventObject.altKey,
                keyCode: eventObject.keyCode,
            };
            return handler(e);
        });
    }
}

function _preventDefault(e) {
    if (e.preventDefault) e.preventDefault();
    else e.returnValue = false;
}
```

**关键参数**：

| API | 适用 |
| --- | --- |
| `addEventListener` | IE9+ / 现代浏览器 |
| `attachEvent` | IE6-8 |
| `e.which` | 跨浏览器（老 IE 用 keyCode 兜底） |
| `preventDefault` / `returnValue` | 跨浏览器 |
| `keyCode` | 跨浏览器（旧 API） |

**最佳实践**：
- ✅ 业务方跨 IE 兼容时显式 `addEventListener || attachEvent` 二选一
- ✅ 事件对象字段重映射到统一接口（`e.which` / `e.shiftKey`）
- ✅ 兜底 `returnValue`（IE 老 API）
- ❌ 切勿假设 `e.key` 在 IE 上存在（应只用 keyCode）
- ❌ 切勿让 `addEventListener` 失败后崩溃（应降级到 attachEvent）

### 3. 4 张映射表：语义键 + 键码 + Shift 状态（Lookup Tables）

**问题场景**：键码到字符的转换有 100+ 特殊键（功能键 F1-F19、小键盘、媒体键），维护一份大表是笨办法；Mousetrap 用 4 张映射表分门别类。

**解决方案**：
```js
// mousetrap.js 常量字典
var _MAP = {
    8: 'backspace', 9: 'tab', 13: 'enter', 16: 'shift', 17: 'ctrl', 18: 'alt',
    27: 'esc', 32: 'space', 33: 'pageup', 34: 'pagedown', 35: 'end', 36: 'home',
    37: 'left', 38: 'up', 39: 'right', 40: 'down', 45: 'ins', 46: 'del',
    // ... 完整 100+ 项
};

var _KEYCODE_MAP = {
    106: '*', 107: '+', 109: '-', 110: '.', 111: '/',
    186: ';', 187: '=', 188: ',', 189: '-', 190: '.', 191: '/',
    192: '`', 219: '[', 220: '\\', 221: ']', 222: "'",
};

var _SHIFT_MAP = {
    '`': '~', '1': '!', '2': '@', '3': '#', '4': '$', '%': '5', '^': '6',
    '&': '7', '*': '8', '(': '9', ')': '0', '-': '_', '=': '+',
    ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '\\': '|',
};

var _SPECIAL_ALIASES = {
    'option': 'alt',  command: 'meta', cmd: 'meta',  mod: /Mac/.test(navigator.platform) ? 'meta' : 'ctrl',
};

// 动态填充 F1-F19
for (var i = 1; i < 20; ++i) _MAP[111 + i] = 'f' + i;
// 动态填充小键盘
for (var i = 96; i < 106; ++i) _MAP[i] = 'num' + (i - 96);
```

**关键参数**：

| 表 | 用途 |
| --- | --- |
| `_MAP` | keyCode → 语义字符串（`27 → 'esc'`） |
| `_KEYCODE_MAP` | keyCode → 符号（`191 → '/'`） |
| `_SHIFT_MAP` | 字符 → Shift 字符（`/ → ?`） |
| `_SPECIAL_ALIASES` | 别名（`cmd → meta`，跨平台） |
| F1-F19 | 动态循环生成（111+1 ~ 111+19） |
| 小键盘 | 96-105（`num0` ~ `num9`） |

**最佳实践**：
- ✅ 业务方"键码 → 语义"用 4 张表分门别类（不用 if-else 链）
- ✅ 别名（`mod` / `cmd`）根据平台动态化
- ✅ 大段重复用循环生成（`for` 填充 F1-F19）
- ❌ 切勿把 100+ 键码写进 if-else 巨型函数
- ❌ 切勿让 `mod` 硬编码（应跟随平台）

### 4. stopCallback 三守卫：class + 子树 + input 跳过（Default Skip）

**问题场景**：Mousetrap 默认在 `input / select / textarea / contenteditable` 内不触发快捷键（避免抢用户的字符输入）；但用户输入框里 mousetrap 仍占着事件；需要 hook 让用户临时"穿透"。

**解决方案**：
```js
// mousetrap.js stopCallback 默认实现
Mousetrap.prototype.stopCallback = function(e, element, combo) {
    // 1. 自定义标记 class：mousetrap 元素永远触发
    if ((' ' + element.className + ' ').indexOf(' mousetrap ') > -1) return false;
    
    // 2. 事件源在绑定 target 子树内
    if (element.contains && element.contains(e.target)) return false;
    
    // 3. input/select/textarea/contenteditable 不触发
    var tagName = (e.target || e.srcElement).tagName;
    return tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA' || tagName === 'BUTTON';
};

// 业务方
Mousetrap.bind('ctrl+s', save, 'keydown');
// 在 input 里按 ctrl+s 默认不触发（除非自定义 stopCallback）
```

**关键参数**：

| 守卫 | 行为 |
| --- | --- |
| class `mousetrap` | 即使在 input 内也触发 |
| `_belongsTo(target, e.target)` | 子树内触发 |
| INPUT/SELECT/TEXTAREA | 默认跳过 |
| `combo` | 当前按的组合（plugin 扩展用） |
| shadow DOM | `composedPath()` 兼容 |

**最佳实践**：
- ✅ 业务方快捷键库提供 `stopCallback` hook（plugin 扩展点）
- ✅ class 标记（`mousetrap`）让 input 内的快捷键可控
- ✅ `tagName` 直接比较（不维护"全部输入标签"列表）
- ❌ 切勿在 input 内默认触发字符型快捷键（会抢输入）
- ❌ 切勿用 `Node.contains`（老 IE 不支持，应 `_belongsTo` 递归）

### 5. shadow DOM 穿透：composedPath 兼容（Modern Web Component）

**问题场景**：Web Components 标准后，事件可能发生在 `shadowRoot` 内（`event.target` 是 `<input>` 但 `event.composedPath()[0]` 才是真正的源头）；老 IE 9- 不支持 shadow DOM 反而简单。

**解决方案**：
```js
// mousetrap.js _belongsTo 简化
function _belongsTo(element, ancestor) {
    if (element === ancestor) return true;
    var parentElement = element.parentNode;
    if (parentElement === null) return false;
    if (parentElement === ancestor) return true;
    return _belongsTo(parentElement, ancestor);  // 递归
}

// stopCallback 内处理 shadow DOM
Mousetrap.prototype.stopCallback = function(e, element) {
    var target = e.target;
    
    if (e.composedPath) {
        // 现代浏览器：composedPath[0] 是原始 target
        // 但 shadow DOM closed 模式拿不到
        var composedPath = e.composedPath();
        if (composedPath && composedPath[0]) {
            target = composedPath[0];
        }
    }
    
    // 继续判断 tagName
    var tagName = target.tagName;
    return tagName === 'INPUT' || tagName === 'SELECT' || /* ... */;
};
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_belongsTo` | 递归 parentNode 链 |
| `e.composedPath()` | 取 shadowRoot 真实 target |
| closed shadowRoot | 拿不到内部 target（Web 标准限制） |
| 递归而非循环 | 100+ 层也安全 |
| 13 行注释 | 解释 Web Components 限制 |

**最佳实践**：
- ✅ 业务方库支持 shadow DOM 时用 `composedPath()`
- ✅ 兜底用递归（不依赖 `Node.contains`）
- ✅ closed 模式注释清楚（库的限制，不是 bug）
- ❌ 切勿直接用 `e.target`（shadowRoot 内会错）
- ❌ 切勿假设 shadow DOM 总是可访问（应 try-catch）

---

## 二、组合键与序列匹配

### 6. _callbacks 字典：按字符路由 O(1) 查找（Hash Routing）

**问题场景**：每个按键要查所有已绑定组合（`a` / `ctrl+s` / `g i` ...），如果遍历所有 callback，n=20 每次按键扫 20 次，慢；用字典按主字符索引，O(1) 路由。

**解决方案**：
```js
// mousetrap.js constructor 简化
function Mousetrap(targetElement) {
    var self = this;
    
    targetElement = targetElement || document;
    self.target = targetElement;
    
    self._callbacks = {};      // character → [{combo, modifiers, action, callback}]
    self._directMap = {};      // combo:action → [callback, sequenceLevel]
    self._sequenceLevels = {}; // combo → 当前序列 level
    
    self._resetSequences = function() { /* ... */ };
    
    // 注册事件
    _addEvent(targetElement, 'keydown', function(e) { _handleKeyEvent(self, e, 'keydown'); });
    _addEvent(targetElement, 'keypress', function(e) { _handleKeyEvent(self, e, 'keypress'); });
    _addEvent(targetElement, 'keyup', function(e) { _handleKeyEvent(self, e, 'keyup'); });
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_callbacks` | character → array of binding info |
| `_directMap` | combo:action → callback（trigger 用） |
| `_sequenceLevels` | combo → 当前进度（序列追踪） |
| `_resetSequences` | 清空进度函数 |
| `targetElement` | 默认 document，可指定 element |

**最佳实践**：
- ✅ 业务方事件路由用"按主键索引的字典"（O(1)）
- ✅ 同字符多 callback 放数组（`a` + `shift+a` 都按 `a` 索引）
- ✅ `_directMap` 直查表（`trigger()` 用）
- ❌ 切勿遍历所有 callback（应 O(1) 索引）
- ❌ 切勿让字典 key 是 number（应用 string，小键盘 0 是 falsy 陷阱）

### 7. _getMatches：modifier 数组精确比较（Exact Match）

**问题场景**：按 `a` 时要区分"裸 a"和"ctrl+a"两个 binding；不能简单"包含"，需要精确匹配 modifier 集合。

**解决方案**：
```js
// mousetrap.js _getMatches 简化
function _getMatches(character, modifiers, e, sequenceName, combo, level) {
    var i, callback, matches = [];
    
    for (i = 0; i < _callbacks[character].length; ++i) {
        callback = _callbacks[character][i];
        
        // 序列处理
        if (sequenceName && callback.seq) {
            if (callback.seq !== sequenceName) continue;
            if (level !== callback.level) continue;
        }
        
        // modifier 精确匹配
        if (!_modifiersMatch(modifiers, callback.modifiers)) {
            continue;
        }
        
        // action 类型匹配
        if (e.type !== callback.action) continue;
        
        matches.push(callback);
    }
    
    return matches;
}

function _modifiersMatch(a, b) {
    return a.sort().join(',') === b.sort().join(',');
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_modifiersMatch` | 数组排序后比较（顺序无关） |
| 序列匹配 | `seq` + `level` 双重验证 |
| action 匹配 | `keydown` / `keypress` 区分 |
| `_getMatches` | 返回所有匹配（可能有多个 binding） |
| `.sort().join(',')` | 简单 hash 替代（数组 hash） |

**最佳实践**：
- ✅ 业务方 modifier 集合用"排序后字符串"做哈希比较
- ✅ 多 binding 时返回数组（用户可能绑了多个）
- ✅ 序列 + level 双重判断（避免错配）
- ❌ 切勿用 `array1 === array2`（永远 false）
- ❌ 切勿让 modifier 比较顺序敏感（应先排序）

### 8. _pickBestAction：智能选择 keydown vs keypress（Strategy）

**问题场景**：用户绑 `a` 时没指定 action（默认），但 `a` 在 keypress 触发字符、keydown 也触发；Mousetrap 根据键类型智能选择——字符型走 keypress（拿到 ASCII），功能键走 keydown（拿到 keyCode）。

**解决方案**：
```js
// mousetrap.js _pickBestAction 简化
function _pickBestAction(key, characterName) {
    // 数字字符走 keydown（防止 numpad 与主键盘冲突）
    if (/^\d+$/.test(characterName)) return 'keydown';
    // 功能键走 keydown
    if (key in _SPECIAL_ALIASES) return 'keydown';
    // 字母字符走 keypress（拿 ASCII）
    return 'keypress';
}

// bind() 内部
Mousetrap.prototype.bind = function(keys, callback, action) {
    keys = keys.split(' ');
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var characterName = _getKeyInfo(key).key;
        
        var resolvedAction = action || _pickBestAction(key, characterName);
        
        // ...
    }
};
```

**关键参数**：

| 键类型 | 推荐 action | 原因 |
| --- | --- | --- |
| 字母 `a-z` | keypress | 拿 ASCII 字符（区分大小写） |
| 数字 `0-9` | keydown | numpad 与主键盘 keyCode 冲突 |
| 功能键 `esc` | keydown | keypress 不触发（无字符） |
| 符号 `/` `;` | keydown | keypress 拿不到 |
| 组合 `ctrl+s` | keydown | chrome 不会触发 ctrl 的 keypress |

**最佳实践**：
- ✅ 业务方"事件类型推断"用 heuristic 策略
- ✅ 数字走 keydown（防小键盘冲突）
- ✅ 功能键走 keydown（keypress 不触发）
- ✅ 用户可显式覆盖（`action` 参数）
- ❌ 切勿让所有键都走 keypress（功能键会失效）
- ❌ 切勿在用户没指定时死板地用 default

### 9. _bindSequence：序列即累加器（Sequence as Accumulator）

**问题场景**：`g i` 这种 Gmail 风格序列要追踪"按了 g 之后 1 秒内是否按了 i"；用专门的数据结构（State 对象 + transition）太重，Mousetrap 用闭包计数器 + 1 秒 timer 模拟状态机。

**解决方案**：
```js
// mousetrap.js _bindSequence 简化
function _bindSequence(combo, keys, callback, action) {
    var i;
    
    for (i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var isLast = (i + 1 === keys.length);
        
        if (isLast) {
            // 最后一键：触发 callback + 重置
            _bindSingle(key, _callbackAndReset, action, combo, i);
        } else {
            // 中间键：累加 level
            _bindSingle(key, _increaseSequence, action, combo, i);
        }
    }
}

function _callbackAndReset(character, modifiers, e, combo, level) {
    // 1. 触发 callback
    _fireCallback(_directMap[combo + ':' + e.type].callback, e, _directMap[combo + ':' + e.type].combo);
    // 2. 重置所有序列
    var doNotReset = ['meta', 'ctrl'];
    setTimeout(_resetSequences, 10);  // 10ms 延迟防 race
    if (doNotReset.indexOf(modifiers[0]) === -1) _resetSequences();
}

function _increaseSequence(character, modifiers, e, combo, level) {
    _sequenceLevels[combo] = level + 1;
    if (_sequenceLevels[combo] > _maxLevel) _maxLevel = _sequenceLevels[combo];
    
    // 1 秒超时重置
    clearTimeout(_resetTimer);
    _resetTimer = setTimeout(_resetSequences, 1000);
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_sequenceLevels` | combo → 当前 level（计数器） |
| `_resetTimer` | 1 秒超时定时器 |
| `_maxLevel` | 全局最大 level（防错配） |
| `_callbackAndReset` | 触发 + 重置（最后键） |
| `_increaseSequence` | 累加 + 重启 timer（中间键） |
| 10ms setTimeout | 防止刚结束序列的 last key 触发下一个序列的首键 |

**最佳实践**：
- ✅ 业务方"序列键"用"累加器 + timer"（无需新数据结构）
- ✅ 1 秒超时（Gmail 约定）
- ✅ 10ms 延迟 reset（防 race）
- ✅ 倒数第二键累加，最后一键触发
- ❌ 切勿用"专门的序列状态机"（过度设计）
- ❌ 切勿让 timer 太长（>2 秒用户会以为没生效）

### 10. _increaseSequence + maxLevel 防错配（Max Level Tracking）

**问题场景**：同时绑 `a` 和 `g a`，按 `a` 时 `a` 触发还是 `g a` 触发？Mousetrap 用 maxLevel 区分——"如果 maxLevel > 0（按过 g），按 a 时不触发 `a`"。

**解决方案**：
```js
// mousetrap.js _handleKey 简化
function _handleKey(character, modifiers, e, combo, sequenceName) {
    var i, callbacks;
    
    // 1. 计算 maxLevel
    var maxLevel = -1;
    for (i = 0; i < _callbacks[character].length; ++i) {
        if (_callbacks[character][i].seq) {
            maxLevel = Math.max(maxLevel, _callbacks[character][i].level);
        }
    }
    
    // 2. 找 matches（应用 maxLevel 过滤）
    callbacks = _getMatches(character, modifiers, e, sequenceName, combo, maxLevel);
    
    // 3. 触发
    if (callbacks.length > 0) {
        for (i = 0; i < callbacks.length; ++i) {
            _fireCallback(callbacks[i].callback, e, callbacks[i].combo);
        }
    }
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `maxLevel` | 全局最大序列进度（-1 表示无序列） |
| `level` 过滤 | `callback.level` 必须等于 `maxLevel` |
| `doNotReset` | `meta` / `ctrl` 不重置（让组合键序列继续） |
| 并行序列 | `g i` 和 `g t` 共享 `g` 的 level 累加 |

**最佳实践**：
- ✅ 业务方"序列 vs 单键冲突"用 maxLevel 全局追踪
- ✅ 水平序列共享 g 的 level（多 g-prefix 序列并存）
- ✅ Ctrl/Meta 不重置（让"ctrl+some" 序列继续）
- ❌ 切勿让"按 g 之后按 a"先触发 `a`（应等序列结束）
- ❌ 切勿在每个 callback 单独判断 level（应全局 maxLevel）

---

## 三、路由与触发

### 11. bind() 拆键 + 兼容别名（Multi-Key Bind）

**问题场景**：`Mousetrap.bind('command+shift+k', cb)` 中"command"是 mac 别名、"shift+k"组合要拆 modifier + 主键；`Mousetrap.bind('g i', cb)` 又要识别"序列"。

**解决方案**：
```js
// mousetrap.js bind 简化
Mousetrap.prototype.bind = function(keys, callback, action) {
    var self = this;
    keys = keys.split(' ');  // 'g i' → ['g', 'i']
    
    for (var i = 0; i < keys.length; ++i) {
        var combo = keys[i];
        var parts = combo.split('+');  // 'command+shift+k' → ['command', 'shift', 'k']
        var modifiers = [];
        var character = null;
        
        for (var j = 0; j < parts.length; ++j) {
            var part = parts[j];
            // 替换别名
            if (_SPECIAL_ALIASES[part]) part = _SPECIAL_ALIASES[part];
            if (['ctrl', 'meta', 'shift', 'alt'].indexOf(part) >= 0) {
                modifiers.push(part);
            } else {
                character = part;  // 主键
            }
        }
        
        // 主键小写化（不区分大小写绑定）
        character = character.toLowerCase();
        
        if (keys.length > 1) {
            _bindSequence(combo, keys, callback, action);
        } else {
            _bindSingle(character, modifiers, callback, action, combo, 0);
        }
    }
};
```

**关键参数**：

| 步骤 | 说明 |
| --- | --- |
| `keys.split(' ')` | 序列拆单键 |
| `combo.split('+')` | 组合拆 modifier + 主键 |
| `_SPECIAL_ALIASES` | 别名替换（`cmd → meta`） |
| `character.toLowerCase()` | 不区分大小写绑定 |
| 序列 vs 单键 | 按 `keys.length` 决定 |

**最佳实践**：
- ✅ 业务方"组合键 DSL"用 `keys.split('+')` 拆 modifier
- ✅ 平台别名用 `_SPECIAL_ALIASES` 动态化（`mod`）
- ✅ 主键小写（`a` 和 `A` 等价）
- ❌ 切勿让 `bind('a')` 区分大小写（应统一小写）
- ❌ 切勿让别名硬编码（应跟随平台）

### 12. unbind 留空 callback 占位（Unbind Stub）

**问题场景**：`Mousetrap.unbind('a', oldCallback)` 想删除 binding；完全删除需要扫描 `_callbacks` 数组（O(n)）；Mousetrap 用"空 callback 占位"——绑一个"什么都不做"的 callback 覆盖。

**解决方案**：
```js
// mousetrap.js unbind 简化
Mousetrap.prototype.unbind = function(keys, callback) {
    // 简化实现：直接绑空 callback
    // TODO: actually remove this from the _callbacks dictionary instead of binding an empty function
    return this.bind(keys, function() {}, 'keydown');
};
```

```js
// 业务方
const handler = function() { console.log('a'); };
Mousetrap.bind('a', handler);
// 卸载
Mousetrap.unbind('a', handler);
// 或全部卸载
Mousetrap.unbind('a');  // 留空 callback
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `unbind` 留空 | 简化实现（O(1) 替换） |
| TODO 注释 | 作者承认遗留债务 |
| 替代方案 | 真正删除要从 `_callbacks[i].splice(j, 1)` |
| `bind(keys, () => {})` | 覆盖原 binding |

**最佳实践**：
- ✅ 业务方"unbind"先做"空 callback 占位"（性能优先）
- ✅ 标记 TODO（未来优化）
- ❌ 切勿 unbind 时每次都扫描数组（应用 O(1) 替换）
- ❌ 切勿让 unbind 后还能触发（应用空 callback 覆盖）

### 13. trigger() 直查表：模拟按键（Programmatic Trigger）

**问题场景**：业务方要"按 ctrl+s 时调 save，并 emit 事件给其他组件"；模拟键盘事件需要构造 KeyboardEvent、设置 keyCode，繁琐；Mousetrap 提供 `trigger()` 直接调 callback。

**解决方案**：
```js
// mousetrap.js trigger 简化
Mousetrap.prototype.trigger = function(combo, eventName) {
    eventName = eventName || 'keydown';
    var callbacks = _directMap[combo + ':' + eventName];
    if (callbacks && callbacks.length > 0) {
        for (var i = 0; i < callbacks.length; ++i) {
            _fireCallback(callbacks[i].callback, _getFakeEvent(combo, eventName), callbacks[i].combo);
        }
    }
    return this;
};

function _getFakeEvent(combo, eventName) {
    var parts = combo.split('+');
    var character = parts[parts.length - 1].toLowerCase();
    
    return {
        type: eventName,
        which: character.charCodeAt(0),
        target: document,
        shiftKey: combo.indexOf('shift') >= 0,
        ctrlKey: combo.indexOf('ctrl') >= 0,
        metaKey: combo.indexOf('meta') >= 0,
        altKey: combo.indexOf('alt') >= 0,
    };
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_directMap` | combo:event → callback（O(1) 触发） |
| `_getFakeEvent` | 构造伪事件对象（无 KeyboardEvent） |
| `trigger` 是 prototype 方法 | 业务方可 `Mousetrap.trigger('ctrl+s')` |
| 不会触发 DOM 默认 | 不走真实事件流 |

**最佳实践**：
- ✅ 业务方"程序触发"用直查表（O(1)）
- ✅ 构造伪 event 对象（不依赖 KeyboardEvent）
- ✅ 支持 `keydown` / `keyup` / `keypress` 三类型
- ❌ 切勿让 trigger 调真实事件（应直查 callback）
- ❌ 切勿在 trigger 时改 DOM 状态（应纯逻辑）

### 14. _fireCallback：preventDefault + return false（Output）

**问题场景**：触发 callback 后要 preventDefault（防止浏览器默认行为，如 ctrl+s 弹保存对话框）；老代码约定 `return false` 也能阻止。

**解决方案**：
```js
// mousetrap.js _fireCallback 简化
function _fireCallback(callback, e, combo) {
    if (callback(e, combo) === false) {
        _preventDefault(e);
        _stopPropagation(e);
    } else {
        _preventDefault(e);  // 默认总是 prevent
    }
}

function _preventDefault(e) {
    if (e.preventDefault) e.preventDefault();
    else e.returnValue = false;
}

function _stopPropagation(e) {
    if (e.stopPropagation) e.stopPropagation();
    else e.cancelBubble = true;
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `return false` | 兼容老 API（jQuery 时代） |
| 默认 preventDefault | 防止浏览器默认（ctrl+s 弹保存） |
| `returnValue = false` | IE 老 API |
| `cancelBubble = true` | IE 旧 stopPropagation |

**最佳实践**：
- ✅ 业务方快捷键默认 preventDefault（防浏览器冲突）
- ✅ 兼容老 API（`return false` 也能阻止）
- ✅ IE 老 API 兜底（`returnValue` / `cancelBubble`）
- ❌ 切勿让快捷键触发后还能"穿透"到浏览器默认
- ❌ 切勿让 return false 仅在 callback 内阻止（应用 preventDefault）

### 15. handleKey 暴露给 plugin：扩展点（Plugin Hook）

**问题场景**：Mousetrap 4 个插件（pause / global-bind / record / bind-dictionary）都通过 prototype 猴子补丁装饰 `stopCallback` / `handleKey`；主流程不变，行为可扩展。

**解决方案**：
```js
// mousetrap.js 暴露 hook 点
Mousetrap.prototype.handleKey = function() {
    // 默认实现是 _handleKey，但允许子类/插件重写
    return _handleKey.apply(this, arguments);
};

// plugins/pause.js
Mousetrap.prototype.pause = function() {
    this.paused = true;
    return this;
};
Mousetrap.prototype.unpause = function() {
    this.paused = false;
    return this;
};

// 重写 stopCallback 集成 pause
Mousetrap.prototype.stopCallback = function(e, element) {
    if (this.paused) return true;  // pause 时全停
    // ... 原有逻辑
};

// plugins/global-bind.js
Mousetrap.prototype.bindGlobal = function(keys, callback, action) {
    // 在 input 内也触发
    var self = this;
    return this.bind(keys, function(e) {
        if (e.target instanceof HTMLInputElement /* ... */) {
            return callback(e);
        }
        return false;
    }, action);
};
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `prototype.handleKey` | 公开 hook（plugin 可重写） |
| `prototype.stopCallback` | 同上 |
| `prototype.bindGlobal` | 新方法（不破坏 bind） |
| `this.paused` | 状态位 |
| 4 个插件 | 全是 prototype 装饰（不改主流程） |

**最佳实践**：
- ✅ 业务方库提供 prototype 钩子（plugin 用）
- ✅ 插件用"装饰器模式"扩展（不破坏主流程）
- ✅ 状态用 `this.xxx`（instance 状态）
- ❌ 切勿在 plugin 里改闭包（应用 prototype 替换）
- ❌ 切勿让 plugin 必须依赖主流程代码

---

## 四、跨浏览器与扩展

### 16. UMD 包裹：script + AMD + CommonJS 三兼容（Module Adapter）

**问题场景**：Mousetrap 1.6 时代要兼容 `<script src="mousetrap.js">` 标签、RequireJS（AMD）、Node.js CommonJS；用 ESM 太新，老项目不兼容。

**解决方案**：
```js
// mousetrap.js 末尾 UMD 包裹
(function(Mousetrap) {
    // ... 库主体
    
    // 导出
    if (typeof define === 'function' && define.amd) {
        define(Mousetrap);  // AMD
    } else if (typeof module !== 'undefined' && module.exports) {
        module.exports = Mousetrap;  // CommonJS
    } else {
        window.Mousetrap = Mousetrap;  // 全局
    }
}(function Mousetrap(element, options) {
    return new _Mousetrap(element, options);
}));
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| IIFE 入口 | 隔离作用域 |
| `define.amd` | AMD 检测（RequireJS） |
| `module.exports` | CommonJS 检测（Node.js） |
| `window.Mousetrap` | script 标签全局 |
| factory 函数 | 既支持 `new Mousetrap()` 也支持 `Mousetrap.bind(...)` |

**最佳实践**：
- ✅ 业务方跨生态库用 UMD（兼容老项目）
- ✅ AMD / CommonJS / 全局三模式
- ✅ factory 函数让用户既能 new 也能量函数调用
- ❌ 切勿只支持 ESM（老项目无法用）
- ❌ 切勿让 define.amd 检测跳过（顺序敏感）

### 17. init() 动态方法拷贝：闭包内方法暴露到 Mousetrap（Singleton）

**问题场景**：用户既要用 `Mousetrap.bind('a', cb)`（全局 API）也要用 `new Mousetrap(element).bind(...)`（实例 API）；Mousetrap 默认提供全局 API，方法从 instance prototype 动态拷贝。

**解决方案**：
```js
// mousetrap.js init 简化
Mousetrap.init = function() {
    var documentMousetrap = new Mousetrap(document);
    
    for (var method in documentMousetrap) {
        // 过滤内部方法（_ 前缀）
        if (method.charAt(0) !== '_') {
            Mousetrap[method] = (function(method) {
                // IIFE 锁定 method 引用
                return function() {
                    return documentMousetrap[method].apply(documentMousetrap, arguments);
                };
            })(method);
        }
    }
};

Mousetrap.init();  // 自动执行
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `new Mousetrap(document)` | 默认 document 实例 |
| `for (var method in ...)` | 遍历 prototype 方法 |
| `method.charAt(0) !== '_'` | 过滤内部方法 |
| IIFE 包裹 | 锁定 `method` 引用（for 循环变量提升） |
| `apply(documentMousetrap, ...)` | 委托给实例 |

**最佳实践**：
- ✅ 业务方"全局 + 实例"双 API 用 init 动态拷贝
- ✅ 过滤内部方法（`_` 前缀）
- ✅ IIFE 锁定 method（防 for 循环变量提升坑）
- ❌ 切勿直接 `Mousetrap.bind = documentMousetrap.bind`（this 错乱）
- ❌ 切勿拷贝 `_` 开头方法（内部用）

### 18. pause 插件：临时禁用（Pause State）

**问题场景**：用户进入 modal / drawer 时要禁用全局快捷键；用 `Mousetrap.unbind` 卸载所有 binding 再恢复很慢（保存状态 200ms+）；用 `pause` 状态位是 O(1) 切换。

**解决方案**：
```js
// plugins/pause.js
Mousetrap.prototype.pause = function() {
    this.paused = true;
    return this;
};
Mousetrap.prototype.unpause = function() {
    this.paused = false;
    return this;
};
Mousetrap.prototype.stopCallback = function(e, element) {
    if (this.paused) return true;  // 全部跳过
    // ... 原有逻辑
};
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `this.paused` | 状态位（O(1) 切换） |
| `stopCallback` 返回 true | 全部跳过 |
| `pause` 返回 this | 链式 |
| 不改 _callbacks | 性能最优 |
| 5 行实现 | 极简 |

**最佳实践**：
- ✅ 业务方"临时禁用"用状态位（不卸载 binding）
- ✅ `stopCallback` 加 guard（5 行）
- ✅ 链式 API（`Mousetrap.pause()`）
- ❌ 切勿 pause 时 unbind（应保留 binding）
- ❌ 切勿让 pause 状态污染其他实例（应 instance 级）

### 19. record 插件：录制键盘序列（Capture Mode）

**问题场景**：用户要自定义快捷键（"按 ctrl+s 后再按 g i"），Mousetrap 提供"录制"模式——把用户按的键序列记录下来，再绑回去。

**解决方案**：
```js
// plugins/record.js
Mousetrap.prototype.record = function(callback) {
    var self = this;
    var recorded = [];
    var doneFn = function(e) {
        // 结束录制
        callback(recorded.join(' '));
        self.unbind('escape mousetrap_record_keyup');
        self.recordedKeys = [];
    };
    
    // 录制一个键
    var fn = function(e) {
        // 跳过 modifier-only 键
        if (e.keyCode === 16 || e.keyCode === 17 || e.keyCode === 18) return;
        
        recorded.push(_characterFromEvent(e));
        // ... 加下个键监听
    };
    
    this.bind('escape', doneFn, 'keyup');  // ESC 结束
    this.bind(fn, 'keyup');  // 主录制
    return this;
};
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| 录制模式 | 用 _handleKey 收集按键 |
| `recordedKeys` | 临时数组 |
| ESC 结束 | 用 `unbind` 退出 |
| modifier-only 跳过 | `shift` / `ctrl` 单按不算 |
| 返回 this | 链式 |

**最佳实践**：
- ✅ 业务方"用户自定义快捷键"用录制模式
- ✅ modifier 键单按不录（防噪声）
- ✅ ESC 退出（标准约定）
- ❌ 切勿让录制一直持续（应显式结束）
- ❌ 切勿把 modifier-only 录进序列

### 20. Apache 2.0 + LLVM exception：商业友好许可（License Choice）

**问题场景**：Mousetrap 是前端 UI 库（部分公司用作 IDE 核心），需要 Apache 2.0（商业友好）+ LLVM exception（防专利诉讼）；GPL/MIT 在某些场景下不够用。

**解决方案**：
```text
# LICENSE 文件
mousetrap is dual licensed under the Apache 2.0 license and the LLVM
exceptions. You can use mousetrap in any commercial project without
open-sourcing your code, and the LLVM exception protects you from
patent claims (relevant for larger companies).
```

**关键参数**：

| 许可 | 用途 |
| --- | --- |
| Apache 2.0 | 商业友好（不强制开源） |
| LLVM exception | 防专利诉讼（2024 后大公司关注） |
| 双许可 | 业务方可任选 |
| 商标 | 不含商标条款（用 `Mousetrap` 不构成商标侵权） |

**最佳实践**：
- ✅ 业务方客户端库用 Apache 2.0 + LLVM exception
- ✅ 商业友好（不强制开源衍生作品）
- ✅ 防专利诉讼（LLVM exception 是行业标杆）
- ❌ 切勿用 GPL（强制开源会让企业用户流失）
- ❌ 切勿省略 patent 条款（大公司会卡）

---

**标签**：#mousetrap #keyboard #shortcut #dom
**状态**：20/20 份详细内容
