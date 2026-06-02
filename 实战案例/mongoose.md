# Mongoose - MongoDB ODM 的 Schema/Model/Document 三层架构

**来源**：GitHub Automattic/mongoose
**创建时间**：2026-06-02

---

## 一、Schema 与 SchemaType：编译期生成代码

### 1. Schema 编译入口：递归 add() + paths 字典（Tree Compile）

**问题场景**：`new Schema({ name: String, tags: [String] })` 这种"嵌套结构 + 类型数组 + 嵌套 Schema"语法要让 ODM 层自动生成 getter/setter/validator/serializer；如果在运行时靠反射遍历，写时性能差且难调试。

**解决方案**：
```js
// lib/schema.js
class Schema {
    constructor(obj, options) {
        this.paths = {};      // name → SchemaType
        this.subpaths = {};   // dotted path → SubdocPath
        this.virtuals = {};   // 虚拟字段
        this.aliases = {};    // 字段别名
        // ...
        this.add(obj);        // 编译入口
        this.callQueue = [];  // 启动期钩子队列
        this._applyAdapters(); // mongoose 9 简化 driver 抽象
    }
    
    add(obj, prefix) {
        prefix = prefix || '';
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            this._addSinglePath(prefix + key, val);
        }
    }
    
    _addSinglePath(path, type, options) {
        // 数组 [String] → SubdocPath
        if (Array.isArray(type)) {
            return this._addSubdoc(path, type, options);
        }
        // POJO { type: String, default: 'x' } → 直接拿 type
        if (isPOJO(type) && type.type != null) {
            return this._addSinglePath(path, type.type, type);
        }
        // String/Number/Date → 查找 SchemaType
        const SchemaType = this._getSchemaType(type);
        this.paths[path] = new SchemaType(path, options);
    }
}
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `paths` | path 字符串 → SchemaType 实例 |
| `subpaths` | dotted path 拆分（`a.b.c`） |
| `virtuals` | 计算字段（不存 DB） |
| `aliases` | 字段重命名（`firstName` → `name`） |
| `addAutoId` | 自动注入 `_id: ObjectId` |
| `_applyAdapters` | 9.x 简化 driver 抽象 |

**最佳实践**：
- ✅ 业务方"DSL → 类定义"用"递归 compile + 字典"模式
- ✅ 路径拆分用 dotted path（`a.b.c`）支持任意嵌套
- ✅ 数组 vs POJO 单独分支（语法糖解析）
- ❌ 切勿在运行时遍历字段做校验（应 compile 时装 setter）
- ❌ 切勿让 paths 是数组（应用 dict 字典）

### 2. 12 个 SchemaType：cast 钩子可热替换（Type Strategy）

**问题场景**：`{ name: String, age: Number, birthday: Date, profile: { bio: String } }` 中每个字段需要不同 cast（字符串、数字、日期、嵌套文档）；如果用 if-else 分发，类型新增要改 50 处。

**解决方案**：
```js
// lib/schema/SchemaType.js
class SchemaType {
    constructor(path, options, instance) {
        this.path = path;
        this.instance = instance;
        this.options = options;
        this.defaultValue = undefined;
        this.validators = [];
        // ...
    }
    
    cast(val) {
        throw new Error('Subclass must override');
    }
    
    static get(name) {
        return SchemaType[name.toLowerCase()];
    }
}

// lib/schema/string.js
class SchemaString extends SchemaType {
    cast(val) {
        if (typeof val !== 'undefined' && typeof val !== 'string') {
            return String(val);
        }
        return val;
    }
    
    enum(values, message) {
        // 加枚举 validator
        this.validators.push({
            validator: v => values.includes(v),
            message: message || 'enum failure',
        });
        return this;
    }
    
    match(regex, message) {
        this.validators.push({
            validator: v => v == null || regex.test(v),
            message: message || 'match failure',
        });
        return this;
    }
}

// 注册到 Mongoose
SchemaTypes.String = SchemaString;
```

**关键参数**：

| SchemaType | cast 行为 |
| --- | --- |
| `String` | 强制 toString |
| `Number` | parseFloat（NaN 拒绝） |
| `Date` | new Date(v) |
| `Buffer` | new Buffer.from(v) |
| `ObjectId` | `Types.ObjectId(v)` |
| `Boolean` | `'true' / 'false' / 0 / 1` 兼容 |
| `Array` | SubdocPath 包装 |
| `Map` | ES Map 包装 |
| `Decimal128` | BSON decimal |
| `Mixed` | 不 cast（任意类型） |

**最佳实践**：
- ✅ 业务方"多类型字段"用 base SchemaType + 子类 cast 模式
- ✅ `cast` 是 Strategy 模式（可热替换 `mongoose.Schema.Types.String.cast = v => v.toUpperCase()`）
- ✅ `enum / match / min / max` 链式注册 validator
- ❌ 切勿让一个 SchemaType 走 if-else（应子类重写 cast）
- ❌ 切勿把 cast 写死（应支持用户覆盖）

### 3. compile.js：defineKey 装 getter/setter（Code Generation）

**问题场景**：`{ name: String }` 定义后，Document 实例要能在写时触发校验、标记 `$isModified`、cast 转换；如果每次访问都遍历 schema，装了 100 字段就是 O(100)。

**解决方案**：
```js
// lib/helpers/document/compile.js
function compile(tree, proto, prefix, options) {
    prefix = prefix || '';
    for (const key of Object.keys(tree)) {
        const limb = tree[key];
        const path = prefix + key;
        if (!limb[typeKey] || isPOJO(limb.type)) {
            // 嵌套对象：递归
            compile(limb.type, proto, path + '.', options);
        } else {
            defineKey(path, limb, proto, prefix, options);
        }
    }
}

function defineKey(path, schemaType, proto, prefix, options) {
    const useGetOptions = prefix ? Object.freeze({}) : noDottedPathGetOptions;
    
    Object.defineProperty(proto, path, {
        get: function() {
            return this.$get(path, useGetOptions);
        },
        set: function(val) {
            this.$set(path, val);
        },
        configurable: true,
    });
}

const noDottedPathGetOptions = Object.freeze({});
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `Object.defineProperty` | 在 Document.prototype 装 getter/setter |
| `useGetOptions` | frozen 空对象（避免每次创建新对象） |
| `this.$get / $set` | 内部统一访问入口 |
| `nested type` | 递归 compile（dotted path） |
| `Symbol` for InternalCache | 隔离内部状态 |

**最佳实践**：
- ✅ 业务方"动态代理"用 `Object.defineProperty` 编译期装好
- ✅ `Object.freeze({})` 共享 frozen options（GC 优化）
- ✅ 嵌套路径用 dotted path（`a.b.c`）
- ✅ 校验在 `$set` 入口统一触发
- ❌ 切勿在 getter 里遍历 schema（应 compile 时装好）
- ❌ 切勿用 Proxy（性能比 defineProperty 慢 5-10x）

### 4. Symbol 隔离内部状态：20+ 私有标记（Symbol-Based Privacy）

**问题场景**：Document 实例上需要存 `$__`、`$isNew`、`$isModified` 等内部状态，20+ 个字段；如果用 `$` 前缀字符串（`$__` / `$$populated`），用户字段名相同时会冲突。

**解决方案**：
```js
// lib/symbols.js
const symbols = {
    documentSchema: Symbol('mongoose#Document#schema'),
    documentArrayAtomics: Symbol('mongoose#DocumentArray#atomics'),
    scopeSymbol: Symbol('mongoose#Document#scope'),
    schemaMixedSymbol: Symbol('mongoose#schema_mixed'),
    populatedSymbol: Symbol('mongoose#Document#populated'),
    arrayParentSymbol: Symbol('mongoose#ArrayParent'),
    trustedSymbol: Symbol('mongoose#trusted'),
    builtInMiddleware: Symbol('mongoose#builtInMiddleware'),
    // ... 20+ 个
};

class Document {
    $__schema = symbols.documentSchema;
    $__atomics = symbols.documentArrayAtomics;
    $isNew = true;
    $isModified = function(path) { /* ... */ };
}

// 用户字段可自由叫 schema / scope / populated（不会冲突）
```

**关键参数**：

| Symbol | 用途 |
| --- | --- |
| `documentSchema` | doc 持有 schema 引用 |
| `arrayAtomicsSymbol` | 数组原子操作状态 |
| `scopeSymbol` | 子文档父引用 |
| `trustedSymbol` | sanitizeFilter 白名单 |
| `builtInMiddleware` | 标记内置中间件 |

**最佳实践**：
- ✅ 业务方"内部状态 vs 用户字段"用 Symbol 隔离
- ✅ Symbol 全局导出（`mongoose.symbols`）方便外部访问
- ✅ 20+ Symbol 集中放 `symbols.js`
- ❌ 切勿用 `$` 前缀字符串（用户可能用 `$$$`）
- ❌ 切勿把 Symbol 直接挂到 document（应通过 $__ 内部 cache）

### 5. Mongoose 9 多实例隔离：每个实例独立 Schema（Multi-Tenant）

**问题场景**：Mongoose 9.x 之前所有 model 共享全局 schema；多租户场景下，租户 A 改 schema 会影响租户 B（即使代码里看起来"独立"）。

**解决方案**：
```js
// lib/mongoose.js 9.x
class Mongoose {
    constructor() {
        this.Schema = class extends MongooseSchema {
            // 每个 Mongoose 实例的 Schema 互不影响
        };
        this.models = {};
        this.connections = [];
        this.options = { ... };
    }
    
    model(name, schema) {
        if (!this.models[name]) {
            const Model = this._createModel(name, schema);
            this.models[name] = Model;
        }
        return this.models[name];
    }
}

// 业务方
const tenantAMongoose = new Mongoose();
const tenantBMongoose = new Mongoose();
// 两边 schema 互不污染
const aSchema = new tenantAMongoose.Schema({ tenant: 'A' });
const bSchema = new tenantBMongoose.Schema({ tenant: 'B' });
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `this.Schema` | 每个 Mongoose 实例的 Schema 子类 |
| `this.models` | 局部 model 注册表 |
| `this.connections` | 局部 connection 池 |
| `mongoose.SchemaTypes` | 共享（不复制） |
| `Symbol.for('mongoose:default')` | 标记默认实例 |

**最佳实践**：
- ✅ 业务方多租户 SaaS 用"多 Mongoose 实例"
- ✅ Schema 子类化（每个 Mongoose 的 Schema 互不影响）
- ✅ Symbol.for 区分默认/用户实例
- ❌ 切勿在多租户间共享 model（会污染）
- ❌ 切勿用 `mongoose.set` 做租户切换（应新建 Mongoose）

---

## 二、Document 代理与中间件

### 6. Object.defineProperty 字段代理：write-time cast（O(1) Access）

**问题场景**：Document 实例每个字段都要支持 `user.name = 'foo'` 时触发 cast 转换、validator 校验、标记 `$isModified`；如果用 Object.defineProperty 在每个 instance 上装，10 万 instance = 100 万次 defineProperty，慢。

**解决方案**：
```js
// lib/document.js
class Document {
    constructor(obj, fields, skipId) {
        this.$__ = new InternalCache();
        this.$__.strictMode = this.$__schema.options.strict;
        // 一次性 $set
        if (obj) this.$set(obj, undefined, { defaults: true });
    }
    
    $set(path, val, options) {
        if (typeof path === 'object') {
            // 批量赋值
            for (const k of Object.keys(path)) {
                this.$set(k, path[k], options);
            }
            return this;
        }
        // 单字段赋值：cast + 校验 + 标记
        const schemaType = this.$__schema.path(path);
        if (schemaType) {
            val = schemaType.applySetters(val, this, options);
        }
        this.$__activePaths.modify(path);
        return this;
    }
    
    $get(path, options) {
        // 从 $__.data 拿
        return this.$__.data[path];
    }
}

// 关键：getter/setter 装在 prototype（共享）
// lib/helpers/document/compile.js defineKey
Object.defineProperty(Document.prototype, 'name', {
    get() { return this.$get('name'); },
    set(v) { this.$set('name', v); },
});
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `this.$__` | InternalCache 实例（存 $isNew / $isModified / data） |
| `applySetters` | cast 链：用户 cast → default → validator |
| `activePaths.modify(path)` | 记录被修改的 path |
| `Object.defineProperty` | 装在 prototype（10 万实例共享） |
| `$__.data` | 实际数据存这里（不直接挂到 this） |

**最佳实践**：
- ✅ 业务方"动态字段类"用 prototype 装 getter/setter（10 万 instance 不卡）
- ✅ 数据存 $__.data（避免与用户字段冲突）
- ✅ 写时 cast + 标记（懒校验）
- ❌ 切勿在每个 instance 上 defineProperty（应 prototype）
- ❌ 切勿让 `$set` 同步抛错（应累积到 `save` 阶段）

### 7. Kareem 中间件：pre/post + unshift 顺序控制（Hook Pipeline）

**问题场景**：保存文档前要校验、自动更新时间戳、populate 关联、写审计日志；用户在 model 上注册 pre/post hook 链，需要保证"子文档先于父文档"等顺序。

**解决方案**：
```js
// node_modules/kareem/index.js
class Kareem {
    constructor() {
        this._pres = new Map();
        this._posts = new Map();
    }
    
    pre(hookName, name, fn, options) {
        // hookName: 'save' / 'validate' / 'remove' / 'updateOne' / 'find'
        // name: hook 名（null = 匿名）
        // fn: async function
        // options: { unshift: true }  // 关键：插入队首
    }
    
    post(hookName, name, fn) {
        // ...
    }
    
    execPre(hookName, ...args) {
        return this._walkSeries(this._pres.get(hookName) || [], ...args);
    }
    
    execPost(hookName, ...args) {
        return this._walkSeries(this._posts.get(hookName) || [], ...args);
    }
}

// 业务方
UserSchema.pre('save', function() {
    this.updatedAt = new Date();
    return Promise.resolve();
}, { unshift: true });  // 队首

UserSchema.post('save', function(doc) {
    auditLog.record(doc);
});
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `pre(hookName, fn)` | 注册前置钩子（按顺序执行） |
| `post(hookName, fn)` | 注册后置钩子 |
| `unshift: true` | 插队首（用于"子文档优先"等） |
| `Kareem` 实例 | 每个 Schema 持一份 |
| 错误处理 | pre 抛错中断；post 异步错误累积 |

**最佳实践**：
- ✅ 业务方钩子链用 Kareem 风格（hookName + unshift）
- ✅ pre 抛错中断后续（cascade error）
- ✅ post 收 doc 而不是 args（更直观）
- ✅ `unshift` 用于"基础设施 hook"（如子文档优先）
- ❌ 切勿让 hook 同步阻塞 > 100ms（应 async）
- ❌ 切勿在 pre 里改 `$isNew`（会污染其他 hook）

### 8. saveSubdocs 中间件：unshift 让子文档先保存（Subdoc Ordering）

**问题场景**：父子文档嵌套保存时，必须先 save 子文档拿到 `_id`，再 save 父文档关联 `parent_id`；否则会得到孤儿子文档。

**解决方案**：
```js
// lib/plugins/saveSubdocs.js
function saveSubdocsPreSave(done) {
    const subdocs = this.$__getAllSubdocs();
    return subdocs.map(subdoc => subdoc.$isNew ? subdoc.save() : null);
}

Schema.pre('save', false, saveSubdocsPreSave, null, { unshift: true });
//                  ^^^^ ^^^^                         ^^^^
//                  hookName传false 第二个false = 匿名  队首
```

```js
// 用户 hook
UserSchema.pre('save', function() {
    // 用户 hook 永远在 saveSubdocs 之后
    this.fullName = `${this.firstName} ${this.lastName}`;
});
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `pre('save', false, fn, null, { unshift: true })` | 队首插 |
| `false` 第二个参数 | 匿名 hook（不指定 name） |
| `$__getAllSubdocs()` | 取出所有嵌套子文档 |
| `subdoc.save()` | 同步触发子文档 pre + post |
| 错误传播 | 任一子文档失败 → 父 pre 失败 |

**最佳实践**：
- ✅ 业务方"子实体先持久化"用 unshift 模式
- ✅ 内置 plugin 用 `builtInMiddleware` Symbol 标记（用户 removeAllListeners 不影响）
- ✅ 父 hook 链自然依赖子文档已就位
- ❌ 切勿在子文档未保存时访问 subdoc._id
- ❌ 切勿让 unshift hook 抛错（影响所有后续 hook）

### 9. discriminator 多态：同一 Collection 不同 Schema（Inheritance）

**问题场景**：单 Collection 存"员工 / 经理 / 实习生"等不同形态文档，schema 不同但都派生自 Person；用 discriminator 共享基类钩子，子类扩展字段。

**解决方案**：
```js
// lib/model.js
class Model {
    discriminator(name, schema) {
        // 创建子 Model
        const SubModel = function SubModel(doc, fields) {
            Model.call(this, doc, fields);
        };
        SubModel.prototype = Object.create(Model.prototype);
        SubModel.prototype.$__schema = mergeSchemas(this.schema, schema);
        SubModel.baseModelName = this.modelName;
        SubModel.modelName = name;
        
        // 标记 __t 字段
        SubModel.schema.virtuals.__t = {
            get() { return name; },
        };
        return this.model(name, SubModel.schema);
    }
}

// 业务方
const Person = mongoose.model('Person', new Schema({ name: String }));
const Employee = Person.discriminator('Employee', new Schema({ salary: Number }));
const Manager = Person.discriminator('Manager', new Schema({ team: [String] }));
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `__t` 字段 | MongoDB 文档内多态标记 |
| 共享 collection | Employee + Manager 存同一 collection |
| 独立 schema | 每个 discriminator 有自己的 schema |
| 继承 hooks | 子自动获得 pre/post |
| `baseModelName` | 反查基类 |

**最佳实践**：
- ✅ 业务方"同表多型"用 discriminator（`__t` 字段）
- ✅ 子 Model 继承父 hooks
- ✅ 子 Model 可独立添加字段
- ❌ 切勿让 discriminator schema 完全独立（应共享 _id 范围）
- ❌ 切勿在 discriminator 上加 `versionKey`（冲突）

### 10. sanitizeFilter 防 NoSQL 注入：trustedSymbol 白名单（Injection Defense）

**问题场景**：`Model.find(req.body)` 直接把用户输入当查询条件，攻击者可构造 `{ $ne: null }` 绕过登录；需要在驱动层之前过滤 `$`-key。

**解决方案**：
```js
// lib/helpers/query/sanitizeFilter.js
function sanitizeFilter(filter) {
    if (!isPOJO(filter)) return filter;
    
    for (const key of Object.keys(filter)) {
        const value = filter[key];
        if (key[0] === '$' && !ALLOWED_TOP_LEVEL_OPERATORS.has(key)) {
            // 顶层 $ 运算符拒绝
            delete filter[key];
        } else if (isPOJO(value)) {
            if (value.$where || value.$expr || value.$text) {
                // 危险运算符拒绝
                delete filter[key];
                continue;
            }
            for (const subKey of Object.keys(value)) {
                if (subKey[0] === '$' && !trustedSymbol in value) {
                    // $ 字段必须 trusted
                    filter[key] = { $eq: value };
                    break;
                }
            }
        }
    }
    return filter;
}

// 业务方白名单
const safeInput = mongoose.trusted({ $ne: null });  // 标记 trusted
Model.find(safeInput);  // 跳过 sanitize
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `trustedSymbol` | Symbol 标记白名单 |
| `ALLOWED_TOP_LEVEL_OPERATORS` | 允许的 $ 顶层运算符 |
| `$where / $expr / $text` | 高危运算符（执行 JS） |
| 自动 sanitize | 默认开启（mongoose 7+） |
| `mongoose.trusted(v)` | 标记可信 |

**最佳实践**：
- ✅ 业务方所有 user input → find 前都过 sanitize
- ✅ 高危运算符（`$where / $expr`）默认禁
- ✅ `mongoose.trusted()` 显式白名单
- ❌ 切勿直接 `Model.find(req.body)`（XSS 风险）
- ❌ 切勿在 production 关 sanitize

---

## 三、Model 与 Query 抽象

### 11. Model 双角色：静态工厂 + 实例方法（Static + Instance）

**问题场景**：mongoose 既要 `Model.find()` 静态查询，又要 `doc.save()` 实例方法；Model 构造函数继承 Document，所有方法挂 prototype，但 Model 自身又是构造函数。

**解决方案**：
```js
// lib/model.js
class Model {
    constructor(doc, fields) {
        Document.call(this, doc, fields);
    }
    
    // 静态方法（通过 .apply() 隐式调用）
    static find(filter, projection, options) {
        const m = new Model(undefined, undefined, false);
        return m.$where(filter).find(projection, options);
    }
    
    static findOne(filter, projection, options) {
        return this.find(filter, projection, options).then(arr => arr[0] || null);
    }
    
    static create(docs) {
        // 触发 validate + save
    }
    
    // 实例方法
    save(options) {
        return this.$__save(options);
    }
    
    deleteOne(options) {
        return this.$__deleteOne(options);
    }
}

// Model 继承 Document
Model.prototype = Object.create(Document.prototype);
Model.prototype.constructor = Model;
Model.prototype.$__model = Model;
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `Model.find` | 静态查询，返回 Query（链式） |
| `Model.create` | 静态创建 + save |
| `doc.save` | 实例方法（返回 Promise） |
| `Model.prototype = Object.create(Document.prototype)` | 原型链 |
| `discriminators` | 子 Model 复用基类 |

**最佳实践**：
- ✅ 业务方"集合操作 + 文档操作"都用单一 Model（静态/实例双角色）
- ✅ `find` 返回 Query（链式 API）
- ✅ `create` 触发 validate + save 钩子链
- ❌ 切勿让 Model 静态方法返回 doc（应返回 Query）
- ❌ 切勿在 doc.save 里改 schema 引用（全局污染）

### 12. Query 继承 mquery：链式 + thunk 映射（Chainable + Lazy）

**问题场景**：mongoose 的 query 链式 API（`Model.find().where().gt().lt().populate().lean()`）和回调式（exec cb）要并存；用 mixin 难以扩展，用继承最简。

**解决方案**：
```js
// lib/query.js
class Query {
    constructor(op, args, options, callback) {
        mquery.call(this, options);
        this.op = op;            // 'find' / 'findOne' / 'updateOne' ...
        this._args = args;
        this._hooks = new Kareem();
        this._mongooseOptions = {};
    }
    
    find(filter) {
        this.op = 'find';
        this._filters = this.castQuery(filter);
        return this;
    }
    
    where(path, val) {
        return this.find({ [path]: val });
    }
    
    populate(path, select, model) {
        this._mongooseOptions.populate = this._mongooseOptions.populate || [];
        this._mongooseOptions.populate.push({ path, select, model });
        return this;
    }
    
    exec(callback) {
        // 通过 opToThunk 映射表分发
        const thunk = opToThunk.get(this.op);
        return this._hooks.execPre('aggregate', this)  // 钩子
            .then(() => thunk.call(this, ...this._args))
            .then(result => this._hooks.execPost(this.op, this, [result]))
            .then(result => {
                if (callback) callback(null, result);
                return result;
            });
    }
}

Query.prototype = new mquery();
const opToThunk = new Map([
    ['find', function() { return this._find(); }],
    ['findOne', function() { return this._findOne(); }],
    ['updateOne', function() { return this._updateOne(); }],
    ['countDocuments', function() { return this._countDocuments(); }],
    // ...
]);
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `mquery.call(this)` | 复用 mquery 的链式 API（`where/gt/lt`） |
| `opToThunk` Map | op 名 → thunk 函数（反射调用） |
| `_hooks.execPre/Post` | 钩子串联 |
| `populate` | 关联加载（`$lookup`） |
| `.lean()` | 返回 POJO（不装 Mongoose 代理） |

**最佳实践**：
- ✅ 业务方"链式 API"用继承而非 mixin（更清晰）
- ✅ 操作分发用 Map（O(1) 扩展）
- ✅ 钩子链放 execPre/Post（统一）
- ❌ 切勿在 Query 里调同步 IO（应 exec 后异步）
- ❌ 切勿让 mquery 调 mongoose 业务（应 Query 包装）

### 13. Connection 状态机：4 状态 + 心跳侦测（State Machine）

**问题场景**：MongoDB 连接状态复杂（disconnected / connected / connecting / disconnecting），需要 emit 事件；serverless 场景下"假连接"（连接池在但 server 端已死）需要心跳侦测。

**解决方案**：
```js
// lib/connection.js
class Connection extends EventEmitter {
    constructor(base) {
        super();
        this._readyState = STATES.disconnected;  // 0
        this._lastHeartbeatAt = null;
        this.heartbeatFrequencyMS = 10000;  // 10s
        
        Object.defineProperty(this, 'readyState', {
            get: function() {
                // 心跳侦测：假断开保护
                if (this._readyState === STATES.connected &&
                    this._lastHeartbeatAt != null &&
                    Date.now() - this._lastHeartbeatAt >= this.heartbeatFrequencyMS * 2) {
                    return STATES.disconnected;  // 假装断开
                }
                return this._readyState;
            },
        });
    }
    
    openUri(uri, options) {
        this._readyState = STATES.connecting;  // 2
        this.emit('connecting');
        
        return MongoClient.connect(uri, options)
            .then(client => {
                this.client = client;
                this._readyState = STATES.connected;  // 1
                this._lastHeartbeatAt = Date.now();
                this.emit('connected');
            })
            .catch(err => {
                this._readyState = STATES.disconnected;
                this.emit('error', err);
            });
    }
}
```

**关键参数**：

| 状态 | 值 | 含义 |
| --- | --- | --- |
| `disconnected` | 0 | 未连接 |
| `connected` | 1 | 已连接 |
| `connecting` | 2 | 连接中 |
| `disconnecting` | 3 | 断开中 |
| `_lastHeartbeatAt` | 时间戳 | 心跳记录 |
| `heartbeatFrequencyMS * 2` | 20s | 心跳超时（假断开） |

**最佳实践**：
- ✅ 业务方长连接用 4 状态机 + 事件
- ✅ serverless 场景用心跳侦测兜底（防 Lambda 假死）
- ✅ `Object.defineProperty` 暴露 readyState getter
- ❌ 切勿在 readyState == 1 时直接 trust（应读 getter）
- ❌ 切勿让 connection 不 emit 'error'（会冒泡到 unhandledRejection）

### 14. populate 关联加载：N+1 查询 vs $lookup（Relation Loading）

**问题场景**：Document 存 `parent: ObjectId`，加载文档时用户要看到完整 parent 详情；如果用客户端循环 `findById`，N 个文档 = N+1 次查询；用 MongoDB 4+ `$lookup` 是单次聚合。

**解决方案**：
```js
// lib/model.js
Model.populate(docs, options) {
    // 1. 收集所有 populate paths
    // 2. 提取 ObjectId 集合
    // 3. 一次性 batch find
    // 4. 替换回 docs
    
    // 现代版本：自动用 $lookup（server 端 join）
    if (this.db.config.autoLookup) {
        return this.aggregate([
            { $match: { _id: docs.map(d => d._id) } },
            { $lookup: { from: 'parents', localField: 'parent', foreignField: '_id', as: 'parentDoc' } },
        ]);
    }
}

// 业务方
const users = await User.find().populate('parent');
// users[0].parent 是完整 Parent 文档（不是 ObjectId）
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `populate(path)` | 关联路径（单或多） |
| `populate('path', 'name email')` | 选择字段 |
| `populate({ path, populate: 'sub' })` | 嵌套 populate |
| `$lookup` | server 端 join（性能优） |
| `lean + populate` | POJO 模式（更快） |

**最佳实践**：
- ✅ 业务方"关联加载"用 populate（封装 N+1）
- ✅ 大结果集用 `$lookup`（一次聚合）
- ✅ 小数据集用客户端循环（更灵活）
- ❌ 切勿在循环里 populate（应用 pre hook 批处理）
- ❌ 切勿让 populate 超过 5 层（性能灾难）

### 15. save 生命周期：pre-validate → validate → pre-save → save → post-save（Lifecycle）

**问题场景**：保存文档要经过"默认值应用 → 验证 → 转换 → 写 DB → 触发关联"；每步都有 pre/post 钩子，需要清晰的调用顺序。

**解决方案**：
```js
// lib/model.js
Model.prototype.$__save = async function(options) {
    // 1. 触发 validate 钩子链
    await this.$__schema.s.hooks.execPre('validate', this);
    await this.validate();
    await this.$__schema.s.hooks.execPost('validate', this);
    
    // 2. 应用 defaults（更新未设字段）
    this.$__applyDefaults();
    
    // 3. 触发 save 钩子链
    await this.$__schema.s.hooks.execPre('save', this);
    
    // 4. 写 DB
    const result = await this.collection.updateOne(
        { _id: this._id },
        { $set: this.toObject({ depopulate: true }) },
        { upsert: true }
    );
    
    // 5. 触发 post
    await this.$__schema.s.hooks.execPost('save', this, [this]);
    
    return this;
};
```

**关键参数**：

| 阶段 | 钩子 | 失败行为 |
| --- | --- | --- |
| 1. validate | pre-validate / post-validate | 抛 ValidationError |
| 2. defaults | （无钩子） | 静默 |
| 3. save | pre-save / post-save | 抛 DBError |
| 4. write | MongoDB `updateOne` | 网络错重试 |
| 5. post | post-save | 异步错误累积 |

**最佳实践**：
- ✅ 业务方 ORM 钩子用"pre/post 对"分阶段
- ✅ 校验在写入前（早期失败）
- ✅ post 钩子用于"通知/审计"（不影响主流程）
- ❌ 切勿在 validate 里写 DB（应 save 阶段）
- ❌ 切勿让 pre-save 抛 ValidationError（应 post-validate）

---

## 四、性能与生态

### 16. lean 模式：跳过 Proxy 化（Performance Bypass）

**问题场景**：Document 实例有 5700 行逻辑（getter/setter/cast/validator），纯查询场景（如 API 返回 JSON）不需要这些；如果返回 Proxy 化对象，序列化慢 5-10x。

**解决方案**：
```js
// lib/query.js
Query.prototype.lean = function(v) {
    this._mongooseOptions.lean = v !== false;
    return this;
};

Query.prototype._find = async function() {
    const docs = await this.collection.find(this._filters).toArray();
    if (this._mongooseOptions.lean) {
        return docs;  // 直接返回 POJO
    }
    // Hydrate：POJO → Document 实例
    return docs.map(d => this.model.hydrate(d));
};

// 业务方
const users = await User.find().lean();  // POJO 数组
const usersAsDocs = await User.find();   // Document 数组
```

**关键参数**：

| 模式 | 性能 | 支持方法 |
| --- | --- | --- |
| 默认 | 慢（10x 内存） | save / $set / $isModified |
| `.lean()` | 快（POJO） | 只读访问 |
| `.lean({ virtuals: true })` | 中 | 包含虚拟字段 |
| `.lean({ getters: true })` | 中 | 走 getter 转换 |

**最佳实践**：
- ✅ 业务方纯查询（API 返回）都用 `.lean()`
- ✅ API 序列化场景禁用 Proxy
- ✅ Hydrate 只在需要时做
- ❌ 切勿在 `.lean()` 结果上调 `.save()`（会崩）
- ❌ 切勿让默认 API 性能差（应提供 lean 转义）

### 17. Aggregate 聚合管道：$lookup 链式（Pipeline）

**问题场景**：复杂业务（"近 30 天活跃用户的订单，按月分组"）用 find + JS 聚合慢；如果支持 MongoDB 4+ `$lookup` / `$facet` / `$bucket` 等聚合阶段，可一次查询搞定。

**解决方案**：
```js
// lib/model.js
Model.aggregate(pipeline) {
    // 1. 包装 mongodb.Aggregate
    // 2. 加 mongoose 中间件钩子
    // 3. 支持 $lookup 自动 populate
    
    const agg = new Aggregate(pipeline, this);
    
    // mongoose 9.x：populate 用 $lookup 而非客户端循环
    agg.append({ $lookup: {
        from: 'parents',
        localField: 'parent',
        foreignField: '_id',
        as: 'parentDoc',
    }});
    
    return agg;
}

// 业务方
const stats = await Order.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    { $group: { _id: { $month: '$createdAt' }, total: { $sum: '$amount' } } },
    { $sort: { _id: 1 } },
]);
```

**关键参数**：

| 阶段 | 用途 |
| --- | --- |
| `$match` | 过滤 |
| `$group` | 聚合（$sum / $avg / $push） |
| `$lookup` | 关联（替代客户端循环） |
| `$facet` | 多面聚合（一次查多维度） |
| `$bucket` | 桶分组（histogram） |

**最佳实践**：
- ✅ 业务方复杂查询优先用 aggregate（push down to DB）
- ✅ 关联场景用 `$lookup`（避免 N+1）
- ✅ mongoose 9.x `populate` 内部用 `$lookup` 透明化
- ❌ 切勿在 aggregate 阶段做 JS 计算（应 $project）
- ❌ 切勿让 aggregate pipeline 超过 50 阶段（DB 性能）

### 18. 索引管理：autoIndex + Compound（Index Auto-Mgmt）

**问题场景**：Schema 定义索引（`{ email: { unique: true } }`），mongoose 默认会 `createIndex`；但 production 部署在 serverless / 多副本时，每个副本都建索引会触发 MongoDB 锁。

**解决方案**：
```js
// lib/schema.js
const UserSchema = new Schema({
    email: { type: String, unique: true, index: true },
    name: String,
    age: Number,
});

UserSchema.index({ name: 1, age: -1 });  // 复合索引
UserSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });  // TTL

// 生产配置
mongoose.set('autoIndex', false);  // 启动时禁止建索引

// 手动建（运维脚本）
await User.syncIndexes();
```

**关键参数**：

| 选项 | 用途 |
| --- | --- |
| `unique: true` | 唯一索引 |
| `index: true` | 普通索引 |
| `sparse: true` | 稀疏索引（null 不算重） |
| `expireAfterSeconds` | TTL 索引 |
| `autoIndex` | 启动时自动建索引 |

**最佳实践**：
- ✅ 业务方 production 关闭 `autoIndex`（运维单独建）
- ✅ 用 `syncIndexes()` 手动同步
- ✅ 复合索引用 `schema.index({ a: 1, b: -1 })`
- ❌ 切勿让每个 serverless 实例都 `createIndex`（会锁）
- ❌ 切勿用 JS 唯一性校验（应 DB 层 unique）

### 19. AsyncLocalStorage 跨 async 边界：session 注入（Context Propagation）

**问题场景**：Mongoose 9.x 开启 `transactionAsyncLocalStorage` 后，事务开始时 `session` 注入到 AsyncLocalStorage；任何 `await` 内部都能拿到 session（无需显式传参）。

**解决方案**：
```js
// lib/mongoose.js
const { AsyncLocalStorage } = require('async_hooks');
mongoose.set('transactionAsyncLocalStorage', true);

class Mongoose {
    startSession() {
        return new Session(this);
    }
    
    withSession(session, fn) {
        return this.als.run({ session }, fn);  // 注入 ctx
    }
}

// lib/model.js
Model.prototype.save = function() {
    const session = this.$__.session || Mongoose.als.getStore()?.session;
    return this.collection.updateOne(filter, update, { session });
};

// 业务方
const session = await mongoose.startSession();
await mongoose.withSession(session, async () => {
    const u = new User({ name: 'foo' });
    await u.save();  // 自动用 session（无需显式传）
    await Order.create({ user: u._id });  // 也自动用
});
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `AsyncLocalStorage` | Node.js 16+ 内置 |
| `als.run(ctx, fn)` | 启动时设 ctx |
| `als.getStore()` | await 内部取 ctx |
| `transactionAsyncLocalStorage` | 开关（默认 false） |
| `session` | 事务会话 |

**最佳实践**：
- ✅ 业务方"上下文跨 await"用 AsyncLocalStorage（替代手动传）
- ✅ 显式开关（默认 off，不影响性能）
- ✅ `withSession(session, fn)` 显式作用域
- ❌ 切勿在 transaction 外用 session（应 `withTransaction` 包裹）
- ❌ 切勿假设 `getStore()` 不为 null（用 `?.`）

### 20. mongodb-memory-server 集成测试：临时实例（Test Infra）

**问题场景**：CI / 本地测试需要 MongoDB 实例，但 production 库和测试库不能混用；用 docker 拉起慢且需要 daemon；mongoose 集成测试用 `mongodb-memory-server` 启动临时进程。

**解决方案**：
```js
// test/setup.js
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

before(async () => {
    mongoServer = await MongoMemoryServer.create({
        binary: { version: '7.0.0' },
        instance: { port: 27017, dbName: 'test' },
    });
    await mongoose.connect(mongoServer.getUri());
});

after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

// test/user.test.js
describe('User model', () => {
    it('saves and retrieves', async () => {
        const u = new User({ name: 'foo' });
        await u.save();
        const found = await User.findOne({ name: 'foo' });
        assert(found._id.equals(u._id));
    });
});
```

**关键参数**：

| 字段 | 用途 |
| --- | --- |
| `MongoMemoryServer.create()` | 下载 mongod 二进制（首次慢） |
| `binary.version` | 锁定 MongoDB 版本 |
| `mongoServer.getUri()` | 拿 `mongodb://127.0.0.1:xxxxx` |
| `mongoose.disconnect()` | 关闭连接 |
| `mongoServer.stop()` | 杀进程 + 删数据 |

**最佳实践**：
- ✅ 业务方集成测试用 `mongodb-memory-server`（无外部依赖）
- ✅ `before / after` 钩子启动 + 销毁
- ✅ 锁定 MongoDB 版本（CI 一致性）
- ❌ 切勿让测试在 production DB 上跑（应隔离）
- ❌ 切勿忘了 `mongoServer.stop()`（进程泄漏）

---

**标签**：#mongoose #mongodb #odm #nodejs
**状态**：20/20 份详细内容
