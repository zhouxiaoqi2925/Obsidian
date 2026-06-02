# Moment.js - 日期时间库的注册表与 DIP 架构

**来源**：GitHub moment/moment
**创建时间**：2026-06-02

---

## 一、解析与归一化：7 种输入统一化

### 1. 14 行核心：hooks 闭包与 setHookCallback（IoC 极简）

**问题场景**：moment.js 入口要同时支持 `moment()` / `moment.utc()` / `moment.unix()` / `moment.parseZone()`，但 `createLocal` 函数要 import `Moment` 构造函数，而 `Moment` 又在 import `hooks`——典型循环依赖；用 CommonJS 旧方案 `require()` 互相延迟能破解，但 ES module 时代没有等价物。

**解决方案**：
```js
// src/lib/utils/hooks.js（14 行核心）
export { hooks, setHookCallback };
var hookCallback;
function hooks() {
    return hookCallback.apply(null, arguments);
}
function setHookCallback(callback) {
    hookCallback = callback;
}
```

```js
// src/moment.js 入口
import { hooks, setHookCallback } from './lib/utils/hooks.js';
import { createLocal } from './lib/create/local.js';
import { createUTC } from './lib/create/utc.js';
// ...
setHookCallback(createLocal);  // 关键：所有 import 完成后才注入

moment.utc = function() { setHookCallback(createUTC); var r = hooks.apply(null, arguments); setHookCallback(createLocal); return r; };
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `hookCallback` | 模块级闭包变量，指向当前"moment() 实际执行函数" |
| `setHookCallback(fn)` | 注入新实现，1 行 IoC |
| `hooks()` 调度 | 永远 `apply(null, arguments)` 转发 |
| 暂时切换 | utc / unix 用"先切后恢复"模式避免污染全局 |

**最佳实践**：
- ✅ 业务方任何"多入口共享实现"都用"闭包 + setter"（避免继承 + factory 复杂）
- ✅ 入口文件最后一行 `setHookCallback(defaultImpl)` 显式注入
- ✅ 临时切换用"保存-替换-恢复"模式（栈式）
- ❌ 切勿在 hooks.js 里 import 业务模块（破坏零依赖）
- ❌ 切勿让 hookCallback 默认是 null（要保证 `hooks()` 总能调）

### 2. 输入归一化层：7 种输入 → config 对象（Normalization）

**问题场景**：moment() 调用要同时接受 string / number / Date / Array / Object / Moment 实例 / undefined；每个 from-X 解析器都有边界条件（如 `['2023','1','1']` vs `['2023-1-1']`）；如果 main 函数里写 7 个 if/else，代码 500 行起步。

**解决方案**：
```js
// src/lib/create/from-anything.js
export function fromAnything(config) {
    if (isMoment(config)) {
        return new Moment(checkOverflow(config));
    }
    if (isDate(config)) {
        return fromDate(createUTCOrLocal(config));
    }
    if (isArray(config)) {
        config._isArray = true;
        return fromArray(config);
    }
    if (isObject(config)) {
        return fromObject(config);
    }
    if (isNumber(config) || isString(config)) {
        return fromStringOrArray(config);
    }
    return new Moment(createInvalid());
}
```

```js
// src/lib/create/local.js createLocal 简化
export function createLocal(config) {
    return fromAnything(createConfig(config));
}

function createConfig(config) {
    var res = { _i: config };  // _i = input
    res._f = config._fmt;       // _f = format
    res._l = config._locale;
    res._isUTC = false;
    res._strict = false;
    return res;
}
```

**关键参数**：

| 字段 | 含义 |
| --- | --- |
| `_i` | input（原始输入） |
| `_f` | format（format 字符串） |
| `_l` | locale（locale 对象） |
| `_isUTC` | 是否 UTC 模式 |
| `_strict` | 严格模式（未匹配 token 报错） |
| `_isArray` | 标记 array 走特殊路径 |

**最佳实践**：
- ✅ 业务方多类型输入函数都用"config 对象归一化"模式（5+ 类型也清晰）
- ✅ `_xxx` 私有字段前缀（外部可读，内部修改自由）
- ✅ `isMoment / isDate / isArray / isObject` 8 个 type guard 集中放 `utils/is-xxx.js`
- ❌ 切勿在 fromAnything 写 type switch（应 if 链，简单可读）
- ❌ 切勿让 config 字段超过 10 个（应拆对象）

### 3. Moment 构造函数：双保险 NaN（Defensive Construction）

**问题场景**：Date 构造里 `new Date(undefined)` 返回 `Invalid Date` 但不抛错；moment 内部存 Date，`_d.getTime()` 在 NaN 时返回 NaN，传播到 `add` / `format` 会引发更多 NaN。

**解决方案**：
```js
// src/lib/moment/constructor.js 第 61-74 行
export function Moment(config) {
    copyConfig(this, config);
    this._d = new Date(config._d != null ? config._d.getTime() : NaN);
    if (!this.isValid()) {
        this._d = new Date(NaN);  // 双保险：显式置 NaN
    }
    if (updateInProgress === false) {  // 防递归
        updateInProgress = true;
        hooks.updateOffset(this);
        updateInProgress = false;
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `copyConfig(this, config)` | 浅拷贝 _i / _f / _l / _isUTC 到 this |
| `_d` | 唯一 Date 引用，外部操作都通过 `valueOf()` 转 |
| `isValid()` | 检查 NaN / 边界值 |
| `updateInProgress` | 模块级 boolean 防止 updateOffset 递归构造 |
| `hooks.updateOffset` | 全局钩子，UTC/local 切换时调 |

**最佳实践**：
- ✅ 业务方"可能无效"对象都用"显式 NaN"（不要用 `null` 表示无效）
- ✅ `isValid()` 是必备公开 API
- ✅ 递归用模块级 boolean 信号量（最简实现）
- ❌ 切勿让构造函数副作用复杂（应 push 到 hooks 里）
- ❌ 切勿在 `Moment()` 里加 try-catch（应让错误显式抛出）

### 4. from-string 主循环：token 逐个匹配（Token-by-Token Parse）

**问题场景**：解析 `'2023-04-15 14:30:00'` 用 format `'YYYY-MM-DD HH:mm:ss'` 时，要保证 token 顺序匹配、剩余字符记录、严格模式单独处理；用单一正则匹配 12 个 token 太脆弱。

**解决方案**：
```js
// src/lib/create/from-string-and-format.js 主循环
for (i = 0; i < tokenLen; i++) {
    token = tokens[i];
    parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
    if (parsedInput) {
        skipped = string.substr(0, string.indexOf(parsedInput));
        if (skipped.length > 0) {
            getParsingFlags(config).unusedInput.push(skipped);
        }
        string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
        totalParsedInputLength += parsedInput.length;
    }
    if (formatTokenFunctions[token]) {
        if (parsedInput) {
            getParsingFlags(config).empty = false;
        } else {
            getParsingFlags(config).unusedTokens.push(token);
        }
        addTimeToArrayFromToken(token, parsedInput, config);
    } else if (config._strict && !parsedInput) {
        getParsingFlags(config).unusedTokens.push(token);
    }
}
charsLeftOver = stringLength - totalParsedInputLength;
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `getParseRegexForToken` | 按 token 查 regex 注册表 |
| `getParsingFlags(config)` | 返回 `unusedInput` / `unusedTokens` / `charsLeftOver` / `empty` |
| `addTimeToArrayFromToken` | 把解析值写入 config._a 数组（Y/M/D/h/m/s/ms） |
| `charsLeftOver` | 字符串剩余长度（O(1) 算） |
| `_strict` | 严格模式开关 |

**最佳实践**：
- ✅ 业务方 DSL 解析都用"token 注册表 + 逐 token 循环"模式
- ✅ `unusedInput` / `unusedTokens` / `charsLeftOver` 三数组全收集
- ✅ `invalidAt()` 方法基于 flags 报告第一个错误位置
- ❌ 切勿用"一个大正则"（难扩展、难报错）
- ❌ 切勿让解析失败抛异常（应返回 invalid object）

### 5. invalidAt 错误位置：3 个 flag 数组（Error Reporting）

**问题场景**：解析失败时（`moment('2023-13-99', 'YYYY-MM-DD')`），用户要"知道错在哪"；用 throw 简单，但用户更希望对象仍可用、`isValid()` 返回 false、`invalidAt()` 报位置。

**解决方案**：
```js
// src/lib/create/parsing-flags.js
export function getParsingFlags(config) {
    if (config._pf == null) {
        config._pf = {
            empty: false,
            unusedTokens: [],
            unusedInput: [],
            overflow: -2,
            charsLeftOver: 0,
            nullInput: false,
            invalidMonth: null,
            invalidFormat: false,
            userInvalidated: false,
            iso: false,
            parsedDateParts: [],
            meridiem: null,
            rfc2822: false,
            weekdayMismatch: false,
        };
    }
    return config._pf;
}

// moment 实例方法
proto.invalidAt = function () {
    return this._pf.overflow;
};
// 返回 0 = 输入含无效 token, 1 = 月份, 2 = 日, 3 = 时, 4 = 分, 5 = 秒, 6 = 毫秒
```

**关键参数**：

| flag | 含义 |
| --- | --- |
| `unusedTokens` | 没用上的 token 列表 |
| `unusedInput` | 没用上的字符串段 |
| `charsLeftOver` | 剩余字符数 |
| `overflow` | 错误代码（-2 没错误，0-6 具体位置） |
| `invalidMonth` | 月份值（0-11） |
| `weekdayMismatch` | weekday 与日期不匹配 |

**最佳实践**：
- ✅ 业务方"软错误"对象用 flag 字段记录（不抛异常）
- ✅ `invalidAt()` 返回数字代码（比错误字符串好处理）
- ✅ `getParsingFlags(config)` 惰性初始化（不在 config 构造时创建）
- ❌ 切勿抛异常（破坏链式调用）
- ❌ 切勿让 flag 字段散落（应集中在 `_pf` 子对象）

---

## 二、格式化与解析：注册表驱动

### 6. addFormatToken 一行注册 3 变体（Tri-Variant Registration）

**问题场景**：format token `'M'` / `'MM'` / `'Mo'` 都是月份，但分别表示"1-12 数字"、"01-12 两位补零"、"1st 序数后缀"；3 个独立 if/else 写 200+ 行，新增 era 时代码爆炸。

**解决方案**：
```js
// src/lib/format/format.js
export function addFormatToken(token, padded, ordinal, callback) {
    var func = callback;
    if (typeof callback === 'string') {
        func = function () { return this[callback](); };
    }
    if (token) {
        formatTokenFunctions[token] = func;
    }
    if (padded) {
        formatTokenFunctions[padded[0]] = function () {
            return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
        };
    }
    if (ordinal) {
        formatTokenFunctions[ordinal] = function () {
            return this.localeData().ordinal(func.apply(this, arguments), token);
        };
    }
}

// 用例：注册月份
addFormatToken('M', ['MM', 2, 'M'], 'Mo', function () { return this.month(); });
// 自动产出：'M' 'MM' 'Mo' 三个 token
```

**关键参数**：

| 参数 | 含义 |
| --- | --- |
| `token` | 裸 token（如 `'M'`） |
| `padded` | `[paddedToken, length, strict]` 补零变体 |
| `ordinal` | 序数后缀 token（如 `'Mo'`） |
| `callback` | 函数或方法名字符串（惰性绑定） |
| `formatTokenFunctions` | 全局注册表（token → func） |

**最佳实践**：
- ✅ 业务方"格式 + 变体"注册用单次 add 模式（避免 3 个注册函数）
- ✅ `callback` 支持字符串（`this[callback]()`）做惰性绑定
- ✅ `func.apply(this, arguments)` 复用计算结果（性能优化）
- ❌ 切勿让注册表是 class 实例（应模块级闭包，单例）
- ❌ 切勿在 callback 里 throw（应返回错误代码）

### 7. format/parse 镜像对称注册表（Symmetric Registry）

**问题场景**：format 路径有 `addFormatToken`，parse 路径需要 `addRegexToken` + `addParseToken` 两表（regex 提取 + 回调转换）；增加新单位（era）时如果三表分离要改 3 处。

**解决方案**：
```js
// src/lib/parse/regex.js
export function addRegexToken(token, regex, strictRegex) {
    if (token) {
        tokens[token] = { re: regex, strict: strictRegex };
    }
}

// src/lib/parse/token.js
export function addParseToken(token, callback) {
    if (token) {
        tokens[token] = callback;
    }
}

// src/lib/units/month.js
import { addFormatToken } from '../format/format.js';
import { addRegexToken } from '../parse/regex.js';
import { addParseToken } from '../parse/token.js';

addFormatToken('M', ['MM', 2, 'M'], 'Mo', monthGetter);
addRegexToken('M', /^[0-9]*$/, /^M$/);
addParseToken(['M', 'MM', 'Mo'], function (input, array, config, token) {
    array[MONTH] = toInt(input) - 1;
    // ...
});
```

**关键参数**：

| 注册表 | 用途 |
| --- | --- |
| `formatTokenFunctions` | token → format 回调 |
| `parseTokens` (regex) | token → 正则 |
| `parseTokens` (callback) | token → 解析回调 |
| `addRegexToken` / `addParseToken` | 两个独立 API |
| 镜像对称 | format 和 parse 注册在同一个单位文件 |

**最佳实践**：
- ✅ 业务方"输入/输出"对称用"同文件三注册表"模式
- ✅ 新增单位改 1 个文件（而不是 3 个）
- ✅ format/parse API 名称对称（`addFormatToken` / `addParseToken`）
- ❌ 切勿让 format 和 parse 散落到不同目录
- ❌ 切勿在 parse 阶段复用 format callback（职责不同）

### 8. zero-fill 数字补零：长度可配置（Number Padding）

**问题场景**：format `'MM'` 要把 `1` 补成 `'01'`，`'DD'` 把 `1` 补成 `'01'`，但 `'SSS'` 毫秒要补成 3 位 `'001'`；通用 zeroFill 函数要支持任意目标长度。

**解决方案**：
```js
// src/lib/utils/zero-fill.js
export default function zeroFill(number, targetLength, forceSign) {
    var absNumber = '' + Math.abs(number),
        zerosToFill = targetLength - absNumber.length,
        sign = number < 0 ? '-' : '';
    if (zerosToFill > 0) {
        if (sign) {
            return sign + ('0'.repeat(zerosToFill) + absNumber);
        }
        if (forceSign) {
            return '+' + ('0'.repeat(zerosToFill) + absNumber);
        }
        return '0'.repeat(zerosToFill) + absNumber;
    }
    return sign + absNumber;
}

// 用例
zeroFill(1, 2)         // "01"
zeroFill(1, 3)         // "001"
zeroFill(1, 2, true)   // "+01"
zeroFill(-5, 3)        // "-005"
```

**关键参数**：

| 参数 | 含义 |
| --- | --- |
| `number` | 要补零的数字 |
| `targetLength` | 目标字符串长度 |
| `forceSign` | true 时强制加 `+` 号（年用） |
| 负数处理 | sign 单独保留，避免 `'-0xx'` |

**最佳实践**：
- ✅ 业务方数字格式化用 single zeroFill 工具（避免 5 个变体函数）
- ✅ `forceSign` 参数控制正负号
- ✅ `String.prototype.repeat` 性能优于循环拼接
- ❌ 切勿用 `('00' + x).slice(-2)` hack（无法支持任意长度）
- ❌ 切勿对负数做 `'00' + -5` 拼接（会得 `'00-5'`）

### 9. format 主循环：token 替换 + escape（Template Replacement）

**问题场景**：`moment().format('YYYY-MM-DD [at] HH:mm')` 中 `[at]` 是字面量（用 `[]` 转义）；token 替换 + escape 处理 + locale-aware 顺序的代码容易 200+ 行。

**解决方案**：
```js
// src/lib/format/format.js 主循环
export function formatMoment(m, formatString) {
    if (!m.isValid()) return '[Invalid Date]';
    
    var expandedFormat = expandFormat(formatString, m.localeData());
    // 展开 ISO / 长格式到基础 token
    
    return expandedFormat.replace(/\[([^\]]+)\]|YYYY|YY|MMMM|MMM|MM|Mo|M|DD|D|do|dd|d|.../g, function (match) {
        if (match[0] === '[') {
            return match.slice(1, -1);  // 字面量
        }
        var func = formatTokenFunctions[match];
        if (func) {
            return func.call(m, match);  // token
        }
        return match;  // 未识别（保留原文）
    });
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `expandFormat` | 把 `'L'` 展开成 `'MM/DD/YYYY'`（locale aware） |
| `\[...\]` | 字面量转义 |
| formatTokenFunctions | token 查表（已注册） |
| 未识别 | 原样保留（向后兼容） |
| Invalid Date | `isValid() == false` 返回固定字符串 |

**最佳实践**：
- ✅ 业务方 template 用"token + escape"模式（不要全 escape）
- ✅ 字面量用 `[]` 包（最易读）
- ✅ 未识别 token 保留原文（避免 "format 失败导致输出空"）
- ❌ 切勿在 format 里抛错（应降级为字面量）
- ❌ 切勿在替换循环里做复杂操作（应 pre-compute）

### 10. isValid 与 overflow 校验（Validation）

**问题场景**：parse 完成后要校验 day 1-31 / month 0-11 / hour 0-23 / 24-hour overflow / weekday mismatch；如果只 `new Date(...)` 不校验，`2023-02-30` 会被 silently 转为 `2023-03-02`。

**解决方案**：
```js
// src/lib/valid/valid.js
export function isValid(m) {
    var _a = m._a;
    if (_a) {
        // 边界检查
        if (_a[MONTH] < 0 || _a[MONTH] > 11) return false;
        if (_a[DATE] < 1 || _a[DATE] > daysInMonth(_a[YEAR], _a[MONTH])) return false;
        if (_a[HOUR] < 0 || _a[HOUR] > 23) return false;
        if (_a[MINUTE] < 0 || _a[MINUTE] > 59) return false;
        if (_a[SECOND] < 0 || _a[SECOND] > 59) return false;
        if (_a[MILLISECOND] < 0 || _a[MILLISECOND] > 999) return false;
    }
    var mFormat = m._f;
    if (mFormat) {
        // weekday mismatch 检查
        if (mFormat.match(/\[.*[deDE].*\]/)) {
            if (mFormat.match(/d/)) {
                if (!weekdayMismatch(m)) return false;
            }
        }
    }
    return !isNaN(m._d.valueOf());
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_a` | 解析结果数组 `[Y, M, D, h, m, s, ms]` |
| `daysInMonth(year, month)` | 闰年/平年考虑 |
| weekday mismatch | 如 format `'dddd'` 说 "Monday" 但日期是 Tuesday |
| 24:00:00 | 严格模式不允许 |
| NaN 兜底 | `isNaN(_d.valueOf())` |

**最佳实践**：
- ✅ 业务方"字段范围"校验用 `_a[INDEX]` 数组模式（O(1) 查表）
- ✅ `daysInMonth` 单独 util（闰年/平年考虑）
- ✅ weekday mismatch 单独校验（用 `format` token 推测期望 weekday）
- ❌ 切勿在 parse 阶段抛错（应 parse 完再校验）
- ❌ 切勿让 isValid 跳过 `isNaN(_d)` 检查

---

## 三、locale 国际化与继承

### 11. locale 继承链：en-GB → en → baseConfig（Chain Inheritance）

**问题场景**：123 个 locale 大多基于英语（en-GB / en-ie / en-au / en-nz），每个都写完整翻译太冗余（en.js 就有 200 行）；需要"父 locale 继承 + 子 locale 覆盖"模式。

**解决方案**：
```js
// src/lib/locale/locale.js
function loadLocale(name) {
    var oldLocale = getSetGlobalLocale();
    var locale = new Locale(name);
    if (locale.name !== oldLocale) {
        getSetGlobalLocale(oldLocale);
    }
    return locale;
}

export function getSetGlobalLocale(locale) {
    if (locale) {
        var l = normalizeLocaleName(locale);
        if (locales[l]) return locales[l].name;
        var parts = l.toLowerCase().split('-');
        parts[0] = parts[0].toLowerCase();
        // 尝试父 locale
        var parent = loadLocale(parts[0]);
        if (parent) {
            locales[l] = new Locale(l, parent);
            return locales[l].name;
        }
    }
    return _globalLocale;
}

// src/lib/locale/en.js 注册根 locale
export default {
    parentLocale: null,
    months: ['January', ...],
    monthsShort: ['Jan', ...],
    weekdays: ['Sunday', ...],
    weekdaysShort: ['Sun', ...],
    weekdaysMin: ['Su', ...],
    meridiemParse: /[ap]\.?m?\.?/i,
    ordinal: function (n) { return n; },
    // ...
};
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `parentLocale` | 父 locale 引用（链式继承） |
| `loadLocale(name)` | 加载 / 创建 locale |
| `normalizeLocaleName` | 规范化（大小写、连字符） |
| `getSetGlobalLocale` | 同时是 getter 和 setter（重载） |
| 123 locale | 预制语言包 |

**最佳实践**：
- ✅ 业务方多语言用"链式继承"模式（`en-GB → en → base`）
- ✅ get/set 重载（`getSetGlobalLocale(value?)`）
- ✅ locale 加载后缓存到 `locales[name]`
- ❌ 切勿让 123 locale 都写完整（应继承）
- ❌ 切勿在 locale 里写计算逻辑（应是纯数据）

### 12. 123 locale 静态打包：体积 vs 加载（Bundle Tradeoff）

**问题场景**：123 locale 总大小 75KB（minified）；用户实际只用一个（en-US）；按需动态加载 locale 又引入异步 + 网络请求；moment 选择"全部静态打包"，是简单性 vs 体积的妥协。

**解决方案**：
```js
// src/lib/locale/locales.js
import './af.js';
import './ar.js';
import './ar-dz.js';
import './ar-kw.js';
// ... 123 个 import

// 业务方 3 种用法
// 1. 单 locale (16KB)
import moment from 'moment';
moment.locale('zh-cn');

// 2. 全 locales (75KB)
import moment from 'moment/min/moment-with-locales';

// 3. 按需 (运行时)
import 'moment/locale/zh-cn';
```

**关键参数**：

| bundle | 大小 | 用途 |
| --- | --- | --- |
| `moment.min.js` | 16KB | 默认（en only） |
| `moment-with-locales.min.js` | 75KB | 全 locale |
| `locale/zh-cn.js` | 1-2KB | 按需加载 |
| `locales.min.js` | 60KB | locale 单独 chunk |

**最佳实践**：
- ✅ 业务方按 locale 用量选 bundle（中文用户才加载 zh-cn）
- ✅ 静态打包优先级：核心 1 个 locale（en）+ 按需
- ✅ Webpack `IgnorePlugin` 排除未用 locale
- ❌ 切勿让用户必须加载 75KB 完整包
- ❌ 切勿在 SSR 端动态 import locale（首屏延迟）

### 13. 序数 ordinal：locale 数据 + 函数（Pluralization/Ordinal）

**问题场景**：英文 1st / 2nd / 3rd / 4th，'Mo' format token 要返回 "1st" / "2nd" / "3rd"；但不同语言序数规则不同（中文没序数后缀）；locale ordinal 应该是函数不是字符串。

**解决方案**：
```js
// src/lib/locale/en.js
export default {
    // ...
    ordinal: function (number) {
        var b = number % 10,
            o = number % 100;
        if (o >= 11 && o <= 13) return number + 'th';
        switch (b) {
            case 1: return number + 'st';
            case 2: return number + 'nd';
            case 3: return number + 'rd';
            default: return number + 'th';
        }
    },
};

// src/lib/locale/zh-cn.js
export default {
    // ...
    ordinal: function (number) { return number + '日'; },  // 中文
};

// format 调用
moment.locale('en');
moment(3, 'M').format('Mo');  // "3rd"
moment.locale('zh-cn');
moment(3, 'M').format('Mo');  // "3日"
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `ordinal(n)` | 函数（不是字符串），locale 定制 |
| 11-13 特殊 | 英文 11th / 12th / 13th（不是 11st / 12nd / 13rd） |
| modulo 10 | 1st/2nd/3rd 基础规则 |
| 中文 | `n + '日'`（无序数概念） |

**最佳实践**：
- ✅ 业务方 ordinal/pluralize 用 locale 函数（不是字符串模板）
- ✅ 规则写函数里（不写数据表里）
- ✅ 11-13 特殊规则用区间判断
- ❌ 切勿把 ordinal 写成 if-else 大链
- ❌ 切勿假设所有语言都有 ordinal（中文就没）

### 14. relativeTime 相对时间：阈值 + locale 数据（Relative Format）

**问题场景**：`moment().fromNow()` 返回 "2 hours ago" / "in 3 days"；阈值和文案都 locale 决定（中文 "2小时前" / "3天后"）；en 用 "a few seconds" 但 ar 用不同的短语。

**解决方案**：
```js
// src/lib/locale/en.js
export default {
    relativeTime: {
        future: 'in %s',
        past: '%s ago',
        s: 'a few seconds',
        ss: '%d seconds',
        m: 'a minute',
        mm: '%d minutes',
        h: 'an hour',
        hh: '%d hours',
        d: 'a day',
        dd: '%d days',
        w: 'a week',
        ww: '%d weeks',
        M: 'a month',
        MM: '%d months',
        y: 'a year',
        yy: '%d years',
    },
    relativeTimeThreshold: {
        ss: 44,    // < 44s 显示 "a few seconds"
        s: 45,     // 45-89s 显示秒数
        m: 45,     // 45-89min 显示分钟
        h: 22,     // 22-36h 显示小时
        d: 26,     // 26-364d 显示天
        w: null,   // 周阈值
        M: 11,     // 11-22 月 显示年
    },
};
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `relativeTime` | 文案 + 模板（`%s` / `%d`） |
| `relativeTimeThreshold` | 单位切换阈值（`ss: 44`） |
| `future` / `past` | 未来 / 过去的前后缀 |
| `s` / `ss` / `m` / `mm` | 单数 / 复数区分 |
| 阈值算法 | 选最大阈值单位 |

**最佳实践**：
- ✅ 业务方相对时间用 threshold（44s 内的 "a few seconds" 体验更好）
- ✅ future/past 模板分开（避免重复写）
- ✅ `ss / s` 区分单复数（英文需要）
- ❌ 切勿用"动态拼接" `n + ' hours ago'`（应用模板）
- ❌ 切勿让阈值过密（应 < 7 个单位）

### 15. 23 个单位文件：按时间单位集中代码（File-per-Unit）

**问题场景**：moment 支持 23 个时间单位（year / month / day / hour / minute / second / millisecond / week / isoWeek / day-of-week / day-of-year / era / quarter / week-year / iso-week-year / decade / century / ...）；每个单位都有 getter / setter / addFormatToken / addRegexToken / addParseToken / relativeTime，10+ 方法。

**解决方案**：
```js
// src/lib/units/month.js 简化
import { MONTH } from './constants.js';
import { addFormatToken } from '../format/format.js';
import { addRegexToken } from '../parse/regex.js';
import { addParseToken } from '../parse/token.js';

addFormatToken('M', ['MM', 2, 'M'], 'Mo', function () {
    return this.month();
});

addRegexToken('M', /^[0-9]*$/, /^M$/);

addParseToken(['M', 'MM'], function (input, array, config) {
    array[MONTH] = toInt(input) - 1;
});

addParseToken('Mo', function (input, array, config) {
    var match = (config._locale.ordinalParse || /^\d+(?:st|nd|rd|th)/).exec(input);
    array[MONTH] = toInt(match[0]) - 1;
});

// 同样的目录还有 year.js / day.js / hour.js / ...
```

**关键参数**：

| 单位 | 文件 | constants.js 索引 |
| --- | --- | --- |
| year | `year.js` | `YEAR=0` |
| month | `month.js` | `MONTH=1` |
| date | `date.js` | `DATE=2` |
| hour | `hour.js` | `HOUR=3` |
| minute | `minute.js` | `MINUTE=4` |
| second | `second.js` | `SECOND=5` |
| millisecond | `millisecond.js` | `MILLISECOND=6` |
| week | `week.js` | `WEEK=7` |
| isoWeek | `iso-week.js` | `ISO_WEEK=8` |
| day-of-week | `day-of-week.js` | `DAY_OF_WEEK=9` |

**最佳实践**：
- ✅ 业务方多单位（货币 / 时间 / 文件大小）按单位拆文件
- ✅ `constants.js` 集中索引（避免魔法数字）
- ✅ 每个单位文件集中 format + regex + parse 三注册
- ❌ 切勿让一个单位文件超过 200 行（拆子文件）
- ❌ 切勿让单位文件互相 import（应都 import constants）

---

## 四、Duration 与时区

### 16. Duration 3 维表示：months + days + milliseconds（Calendar vs Clock）

**问题场景**：`moment.duration(2, 'months')` 不能简单用毫秒表示——2 个月可能 59-62 天不等，跨夏令时还要 +/- 1 小时；如果 Duration 用单一 ms 字段，加减法出现"日历错位"。

**解决方案**：
```js
// src/lib/duration/create.js
function positiveMomentsDifference(base, other) {
    var res = {};
    res.months = other.month() - base.month() + (other.year() - base.year()) * 12;
    if (base.clone().add(res.months, 'M').isAfter(other)) {
        --res.months;  // 月末不对齐时减 1
    }
    res.milliseconds = +other - +base.clone().add(res.months, 'M');
    return res;
}

export function createDuration(input, value, unit, model, isUTC) {
    var config = {};
    if (model === true) {
        // 内部：直接给 months/days/milliseconds
        config._months = input.months || 0;
        config._days = input.days || 0;
        config._milliseconds = input.milliseconds || 0;
    } else {
        // 外部：number + unit 转换
        config._months = value === 'month' || unit === 'M' ? input : 0;
        // ...
    }
    return new Duration(config);
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_months` | 日历级单位（28-31 天） |
| `_days` | 日历级单位（可与 _months 合并） |
| `_milliseconds` | 钟表级单位（ms-s-min-h） |
| 反向校验 | `isAfter` 检测月末是否对齐 |
| `valueOf()` | 累加转毫秒（仅作 fallback） |

**最佳实践**：
- ✅ 业务方"日历级 + 钟表级"双单位分开存（避免 DST/闰年错误）
- ✅ 内部表示 vs 外部输入分开（`model: true` flag）
- ✅ 反向校验处理月末不对齐
- ❌ 切勿用单一 `totalMs` 表示时间段
- ❌ 切勿在 Duration 里加 try-catch（应让 NaN 传播）

### 17. add/subtract 链式 API：mutable 设计（Chaining Mutability）

**问题场景**：链式 `moment().add(1, 'day').subtract(2, 'hour')` 是 moment 的招牌 API；但 Immutable vs Mutable 是核心决策——Immutable 安全但难用（要 .clone()），Mutable 简单但有副作用。

**解决方案**：
```js
// src/lib/moment/add-subtract.js
export function addSubtract(mom, duration, isAdding, updateOffset) {
    var milliseconds = duration._milliseconds,
        days = absRound(duration._days),
        months = absRound(duration._months);

    if (!mom.isValid()) return;

    updateOffset = updateOffset == null ? true : updateOffset;

    if (months) {
        setMonth(mom, get(mom, 'Month') + months * isAdding);
    }
    if (days) {
        set$1(mom, 'Date', get(mom, 'Date') + days * isAdding);
    }
    if (milliseconds) {
        mom._d.setTime(mom._d.valueOf() + milliseconds * isAdding);
    }
    if (updateOffset) {
        hooks.updateOffset(mom, days || months);
    }
}

proto.add = function (val, unit) {
    return addSubtract(this, createDuration(val, unit), 1, false);
};

proto.subtract = function (val, unit) {
    return addSubtract(this, createDuration(val, unit), -1, false);
};
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `isAdding` | +1 / -1 标志 |
| `updateOffset` | true 时更新时区偏移 |
| `absRound` | 绝对值取整（处理负数） |
| 链式 | `return this` 即可链式 |
| `setMonth` | 单独 util（处理月末越界） |

**最佳实践**：
- ✅ 业务方"内部状态频繁改"用 mutable（加 .clone() 备份）
- ✅ 链式 API 只需 `return this`
- ✅ +1/-1 用 `isAdding` 标志（避免重复代码）
- ❌ 切勿让 mutable API 隐藏深拷贝（用户不知道何时改）
- ❌ 切勿在 add 里抛错（应静默更新到 NaN）

### 18. diff 计算：月/日/毫秒 三段（Multi-Unit Diff）

**问题场景**：`moment(a).diff(b, 'months')` 要返回"几个月差"，但 1 个月可能 28-31 天；如果直接除以 30.4 天，会有 1-2 天误差。

**解决方案**：
```js
// src/lib/moment/diff.js
export function diff(mom, input, units, wantTrunc) {
    var otherMom = makeMom(input);
    var zoneDiff = (mom.utcOffset() - otherMom.utcOffset()) * 60000;
    var wholeMonthDiff = (otherMom.year() - mom.year()) * 12 + (otherMom.month() - mom.month());
    var anchor = wantTrunc ? makeMom(otherMom).startOf('day') : makeMom(otherMom);
    var diff = mom - anchor - zoneDiff;
    var monthDiff = wholeMonthDiff - (wantTrunc && anchor.diff(zoneDiff) / monthLength);

    function month() { return monthDiff; }
    function day() { return diff / 86400000; }
    function hour() { return diff / 3600000; }
    // ...
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `wholeMonthDiff` | 总月数（year × 12 + month） |
| `zoneDiff` | 时区差（毫秒） |
| `anchor` | 对齐点（startOf 减少误差） |
| `wantTrunc` | 是否截断（向下取整） |
| 36xx 时分秒 | 累加 ms 差 |

**最佳实践**：
- ✅ 业务方"跨单位 diff"先粗后细（先算月，再算日/时）
- ✅ 时区差用 `utcOffset() * 60000` 修正
- ✅ `startOf('day')` 是 anchor（消除 hour/min 噪声）
- ❌ 切勿用"除以 30.4 天"近似（误差大）
- ❌ 切勿在 diff 里改原对象（应新建）

### 19. timezone / offset：仅 offset 不含 IANA（Limitation）

**问题场景**：moment 2.x 内核只支持 UTC offset（如 `+08:00`），不内置 IANA 时区数据库（如 `Asia/Shanghai`）；要支持完整 IANA 时区需要 moment-timezone 插件（+47KB）。

**解决方案**：
```js
// src/lib/units/offset.js
export function getSetOffset(input, keepLocalTime, keepMinutes) {
    var offset = this._offset || 0,
        localAdjust;
    if (input != null) {
        if (typeof input === 'string') {
            input = parseTwoDigitOffset(input);
        }
        if (Math.abs(input) < 16) {
            input = input * 60;  // 0-15 hours → minutes
        }
        if (!this._isUTC && keepLocalTime) {
            localAdjust = getTimezoneOffset(this);
            this._d.setTime(this._d.valueOf() - localAdjust * 60000);
        }
        this._offset = input;
        this._isUTC = true;
        if (keepMinutes) {
            addSubtract(this, createDuration(input, 'minutes'), 1, false);
        }
    } else {
        return this._isUTC ? offset : getTimezoneOffset(this);
    }
    return this;
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `_offset` | 当前 offset（分钟） |
| `keepLocalTime` | 改 offset 时保持 wall clock |
| `keepMinutes` | 同时加 minute 偏移 |
| `parseTwoDigitOffset('+08')` | 转分钟 |
| 0-15 | 小时范围（0-900 分钟） |

**最佳实践**：
- ✅ 业务方"offset only"库保留 minimal API（IANA 数据库是另一个库）
- ✅ `keepLocalTime` 选项保留 wall clock 一致
- ✅ `_isUTC` flag 决定 offset 处理路径
- ❌ 切勿把 IANA 时区数据库塞进核心（+47KB 太多）
- ❌ 切勿假设 `parseTwoDigitOffset` 处理所有格式

### 20. isSame / isBefore / isAfter：3 元组比较（Compare API）

**问题场景**：moment 提供 6 个比较 API（`isSame / isBefore / isAfter / isSameOrBefore / isSameOrAfter / isBetween`）；如果各写各的，逻辑重复；如果统一核心，要支持 granularity（按 day / month / year 比较）。

**解决方案**：
```js
// src/lib/moment/compare.js
export function isAfter(mom, input, units) {
    var ms = makeAs(input, mom);
    if (units) {
        return mom.isAfter(makeAs(input, mom).startOf(units ? 'day' : units), units);
    }
    return ms < mom._d.valueOf();
}

export function isBefore(mom, input, units) {
    return isAfter(mom, input, units, true);
}

export function isSame(mom, input, units) {
    var iMs = makeAs(input, mom).valueOf();
    var ms = mom._d.valueOf();
    if (units) {
        return absRound((ms - iMs) / max(2, 1e3 / 2)) < 2;
    }
    return ms === iMs;
}

export function isSameOrAfter(mom, input, units) {
    return isSame(mom, input, units) || isAfter(mom, input, units);
}

export function isSameOrBefore(mom, input, units) {
    return isSame(mom, input, units) || isBefore(mom, input, units);
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `makeAs(input, mom)` | 把任意输入转成 moment（与 this 同 offset） |
| `units` | `'day' / 'month' / 'year'` 粒度 |
| `startOf(units)` | 对齐到粒度（消除时分秒） |
| `< ms` / `> ms` / `=== ms` | 实际比较 |
| `< 2 ms` | 单位对齐后的容差（夏令时边缘） |

**最佳实践**：
- ✅ 业务方时间比较都提供"粒度"参数（不是单纯毫秒）
- ✅ `startOf(unit)` 消除时分秒噪声
- ✅ 6 个比较 API 共享 makeAs + startOf 内部
- ❌ 切勿用 `===` 直接比较 moment（应用 `.valueOf()`）
- ❌ 切勿在 isSame 里忽略 units（应支持 day-level 比较）

---

**标签**：#moment #datetime #i18n #javascript
**状态**：20/20 份详细内容
