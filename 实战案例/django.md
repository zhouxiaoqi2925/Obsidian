# django · 模式解析

> Django 是 BSD 3-Clause 协议下的高级 Python Web 框架，由 Django Software Foundation 维护。本文按 ABL 模式风格，从源码中提炼 20 条可复用的工程模式，配套问题场景、解决方案、关键参数与最佳实践。所有事实均来自 V3 源笔记 `G:\Obsidian Vault\实战案例\django.md` 与 Django 5.2.x 公开 API。

**来源**：`G:\Obsidian Vault\实战案例\django.md`（V3 改写）
**创建时间**：2026-06-02

---

## 一、核心机制

Django 的"骨架能力"是其它所有模式的根：它用 Python 元类、描述符、双重检查锁、惰性求值把 Web 框架的复杂度藏到对象生命周期里。

### 模式 1：元类驱动的 ORM 模型声明

**问题场景**

开发者写 `class User(models.Model):` 时，希望字段（`CharField`、`ForeignKey`）在类声明结束时自动注册到 `_meta`，自动生成 `DoesNotExist` 异常子类、自动挂上 `objects = Manager()`。如果用手写 `__init__` 收集字段，ORM 框架要写几百行模板代码，且无法拦截 `Meta`、抽象基类、继承等场景。

**解决方案**

`django/db/models/base.py:ModelBase`（`type` 的子类）重写 `__new__`，在类创建时把 `Field` 实例（带 `contribute_to_class` 方法）从 `attrs` 中剥离，由 `add_to_class("_meta", Options(meta, app_label))` 反向挂载到类对象。

```python
class ModelBase(type):
    def __new__(cls, name, bases, attrs, **kwargs):
        super_new = super().__new__
        parents = [b for b in bases if isinstance(b, ModelBase)]
        if not parents:
            return super_new(cls, name, bases, attrs)  # Model 自身跳过
        contributable_attrs = {}
        for obj_name, obj in attrs.items():
            if _has_contribute_to_class(obj):
                contributable_attrs[obj_name] = obj
            else:
                new_attrs[obj_name] = obj
        new_class = super_new(cls, name, bases, new_attrs, **kwargs)
        new_class.add_to_class("_meta", Options(meta, app_label))
        if not abstract:
            new_class.add_to_class("DoesNotExist", subclass_exception(...))
            new_class.add_to_class("MultipleObjectsReturned", subclass_exception(...))
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `parents = [b for b in bases if isinstance(b, ModelBase)]` | 区分"声明 Model 自身"与"用户继承 Model" | 第一次 `class Model: ...` 触发时 `parents` 为空 |
| `contributable_attrs` | 收集 `Field` 等带 `contribute_to_class` 的对象 | 字段、Manager、Meta 都属此类 |
| `abstract` | 抽象基类不创建 `_meta.app_label` | 避免污染 `apps.registry` |
| `subclass_exception(...)` | 动态生成 `DoesNotExist`、`MultipleObjectsReturned` | 让 `except User.DoesNotExist` 指向具体类 |

**最佳实践**

- 用 `class Meta: abstract = True` 写抽象基类，**不创建表、不污染 `apps` 注册表**。
- 自定义字段时实现 `contribute_to_class(cls, name)`，让字段反向修改宿主类（Django 内部 `ForeignKey` 用此挂载 `+` 描述符）。
- 不要在 `ModelBase` 钩子里做"重操作"（网络/IO），`__new__` 在 import 阶段同步执行，会拖慢启动。
- IDE 跳转失效、pylint 类型推断错误是**已知代价**，用 `django-stubs` 缓解。

### 模式 2：Manager + QuerySet 双类懒求值

**问题场景**

ORM 调用链 `User.objects.filter(age__gt=18).exclude(name="x").order_by("id")[:10]` 必须**只发一条 SQL**，且数据库路由、HPA hints、强制只读等"切面"要能拦截入口。如果只用一个 `Model.objects` 表达所有操作，会让"入口"和"链式构造器"耦合。

**解决方案**

Django 拆成两个类：`Manager` 是入口（暴露 `all()`/`filter()`/`get()` 等 API），`QuerySet` 是惰性链。每次 `Manager` 方法返回**新 `QuerySet` 实例**（不触发 SQL），仅在 `len(qs)`、`for x in qs`、`list(qs)`、`bool(qs)`、`qs[i]` 时通过 `compiler.execute_sql()` 触发 SQL。

```python
class QuerySet:
    def __init__(self, model=None, query=None, using=None, hints=None):
        self.model = model
        self._db = using
        self._hints = hints or {}
        self.query = query or sql.Query(self.model)
        self._result_cache = None
        self._iterable_class = ModelIterable
        self._fetch_all = False

    def filter(self, *args, **kwargs):
        return self._filter_or_exclude(False, args, kwargs)

    def _fetch_all(self):
        if self._result_cache is None:
            self._result_cache = list(self._iterable_class(self))
        if self._prefetch_related_lookups and not self._prefetch_done:
            self._prefetch_related_lookups()
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `query = sql.Query(self.model)` | 累积 `WHERE`/`ORDER BY`/`LIMIT` 的内部表示 | 不可 pickle、不可哈希 |
| `_result_cache` | 一旦触发 SQL 就缓存结果 | 重复遍历不重复打 DB |
| `_hints` | 传 `{'db': 'replica'}` 等强制路由 | `Manager.db_manager(db).all()` |
| `_fetch_all` | 关闭增量 fetch，整批取 | 默认 False |

**最佳实践**

- 自定义链式方法时继承 `QuerySet`，再 `MyQuerySet.as_manager()` 装回 Model（见 `manager.py:Manager.from_queryset`）。
- 调试时用 `qs.query.__str__()` 拿最终 SQL，**不要用 `print(qs)`**（会触发 SQL）。
- 长事务里 `len(qs)` 会发 SQL，循环里**显式 `list(qs)` 一次性物化**。
- `qs.exists()` 比 `bool(qs)` 更快：Django 会翻译成 `SELECT 1 ... LIMIT 1`。

### 模式 3：Apps 注册中心的双重检查锁

**问题场景**

Django 有 5+ 个内置 app、用户项目有 10+ 个 app，每个 app 的 `models.py` 在启动时必须被加载。`WSGIHandler` 在多线程（gunicorn pre-fork 前的 import 阶段、runserver autoreload）下并发调用 `populate()` 会导致 Model 半注册状态；`from app.models import User` 早于 `populate()` 还会抛 `AppRegistryNotReady`。

**解决方案**

`django/apps/registry.py:Apps.populate` 用**双重检查 + `threading.RLock`** 保证只 populate 一次；用 `_pending_operations` 队列缓存"使用方先于定义方"的回调，`ready_event = threading.Event()` 给启动器一个"等所有 Model 就绪"的同步原语。

```python
def populate(self, installed_apps=None):
    if self.ready:
        return
    with self._lock:                           # RLock：可重入
        if self.ready:
            return
        if self.loading:
            raise RuntimeError("populate() isn't reentrant")
        self.loading = True
        ...
        for app_config in ...:
            app_config.import_models()
        self.apps_ready = self.models_ready = self.ready = True
        self.ready_event.set()                 # 唤醒等待者
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `_lock` | `threading.RLock()` | 重入避免 `populate` 内部回调死锁 |
| `loading` | 防重入标志 | 抛 `RuntimeError` 而非静默 |
| `_pending_operations` | 收集 "lazy_model_operation" 回调 | `signals.py` 早于 `models.py` 加载时用 |
| `ready_event` | `threading.Event()` | `apps.ready.wait(timeout=10)` |

**最佳实践**

- 第三方插件用 `lazy_model_operation(when_model_is_ready, callback)` 注册"等 User 就绪后再连信号"。
- 测试启动慢时用 `apps.ready_event.wait(timeout=30)` 显式等就绪。
- 不要在 `__init__.py` 里直接 import Model，**改用 `apps.get_model('app.User')`** 避免循环 import。
- 启动失败时检查 `loading = True` 但 `ready = False` 的悬挂状态。

### 模式 4：中间件洋葱模型 + sync/async 双向桥

**问题场景**

Web 框架要给"鉴权、CSRF、Session、GZip"等横切关注点留插入点。装饰器/AOP 写法要么改业务代码、要么让中间件顺序变成"隐式配置"。同时，WSGI（同步）和 ASGI（异步）下同一份中间件**应该只写一遍**——否则维护成本翻倍。

**解决方案**

`django/core/handlers/base.py:load_middleware` 反向遍历 `settings.MIDDLEWARE`，把每个中间件包成 `handler = mw(handler)`，递归嵌套实现洋葱模型。`adapt_method_mode` 用 `asgiref.sync.async_to_sync` / `sync_to_async` 双向桥接，按 `is_async + method_is_async` 四象限决定是否需要桥。

```python
get_response = self._get_response_async if is_async else self._get_response
handler = convert_exception_to_response(get_response)
handler_is_async = is_async
for middleware_path in reversed(settings.MIDDLEWARE):
    middleware = import_string(middleware_path)
    middleware_can_sync = getattr(middleware, "sync_capable", True)
    middleware_can_async = getattr(middleware, "async_capable", False)
    ...
    adapted_handler = self.adapt_method_mode(
        middleware_is_async, handler, handler_is_async,
        debug=settings.DEBUG, name="middleware %s" % middleware_path,
    )
    mw_instance = middleware(adapted_handler)
    handler = convert_exception_to_response(mw_instance)
    handler_is_async = middleware_is_async
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `reversed(settings.MIDDLEWARE)` | 反向遍历 → 写入顺序即执行顺序 | `['A','B','C']` → `A→B→C→view` |
| `convert_exception_to_response` | 把异常转 500 响应 | 任何一层抛异常都被外层捕获 |
| `sync_capable` / `async_capable` | 中间件声明"我不支持 X 模式" | 缺一即抛 `RuntimeError` |
| `adapt_method_mode` | 按 4 象限决定是否桥接 | 详见 `asgiref/sync.py` |

**最佳实践**

- 写中间件**必须 return `HttpResponse`**（哪怕 `process_view` 里 None 也算 bug），无日志静默吞请求。
- 声明 `async_capable = True` 让你的中间件能跑在 ASGI 下，否则只跑 WSGI。
- ORM 调用放在中间件里要 `sync_to_async(thread_sensitive=True)`，避免事件循环切线程丢连接。
- 中间件顺序按"洋葱由外到内"写：Security → Session → CSRF → Auth → View。

### 模式 5：URL 路由的递归 + 正则匹配

**问题场景**

Web 框架要把 `/users/<int:id>/posts/<slug:title>/` 映射到视图函数。路由要支持嵌套 `include()`、动态类型转换（`<int:id>` 转 int）、反向解析（`reverse('user-detail', id=1)`），还要在 404 时给出"试过的路径"用于调试。

**解决方案**

`django/urls/resolvers.py:URLResolver` 用 `RegexPattern.match` 逐层剥洋葱；`@functools.cache` 装饰 `get_resolver` 让 URL 配置只编译一次；`LocaleRegexDescriptor` 描述符按 `LANGUAGE_CODE` 懒编译正则。

```python
class URLResolver:
    def resolve(self, path):
        path = str(path)
        tried = []
        match = self.pattern.match(path)
        if match:
            new_path = match.group(0) if not self._is_endpoint else match.string
            for pattern in self.url_patterns:
                try:
                    sub_match = pattern.resolve(new_path)
                except Resolver404 as exc:
                    ...
                else:
                    if sub_match:
                        return ResolverMatch(...)
                tried.append([pattern])
        raise Resolver404({"tried": tried, "path": new_path})
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `pattern.match(path)` | 顶层正则（通常 `''`） | 嵌套 `include()` 递归剥 |
| `tried` | 收集所有试过的 pattern | 404 页面回显 |
| `@functools.cache get_resolver` | 单进程内 URL 编译一次 | 进程重启才失效 |
| `LocaleRegexDescriptor` | 按 `LANGUAGE_CODE` 缓存正则 | 100+ 语言不重复编译 |

**最佳实践**

- 用 `path('users/<int:id>/', ...)` 替代 `re_path(r'^users/(\d+)/$', ...)`，**类型转换由 `converters.py` 统一管**。
- 路由命名要稳定，`reverse('app:user_detail', kwargs={'id': 1})` 是双向契约，避免硬编码 URL。
- 10k+ 路由的项目里正则会变慢，5.x 引入的 `path()` 转换器可缓解。
- 调试 404 看响应体里的 `tried` 字段，立刻知道哪条 pattern 漏配。

---

## 二、架构设计

Django 的子系统拆分是"约定优于配置"的工程化落地：8 个内聚子系统，外部只暴露函数式 API。

### 模式 6：8 子系统的内聚拆分

**问题场景**

框架代码写到 7000+ 文件时，按"层"拆分（model 层 / view 层 / template 层）会让单个文件 5000+ 行不可读。Django 团队选择按"子系统"拆：每个子系统是纯 Python 包，对外只暴露函数式 API。

**解决方案**

Django 把代码拆成 8 个内聚子系统：`handlers`（WSGI/ASGI）、`urls`（路由）、`views`（视图）、`template`（模板）、`db/models`（ORM）、`forms`（表单）、`contrib/admin`（后台）、`apps`（应用注册）。每个子系统的 `__init__.py` 只做聚合导出，业务逻辑下沉到子包。

**关键参数**

| 子系统 | 入口文件 | 职责 |
| --- | --- | --- |
| `handlers` | `django/core/handlers/{wsgi,asgi}.py` | WSGI/ASGI 入口 |
| `urls` | `django/urls/resolvers.py:URLResolver` | URL 解析 |
| `template` | `django/template/engine.py:Engine` | 模板容器 |
| `db/models` | `django/db/models/base.py:ModelBase` | ORM |
| `forms` | `django/forms/forms.py:Form` | 表单 |
| `contrib/admin` | `django/contrib/admin/sites.py:AdminSite` | 后台 |
| `apps` | `django/apps/registry.py:Apps` | 应用注册 |
| `http` | `django/http/request.py:HttpRequest` | 请求/响应 |

**最佳实践**

- 模仿 Django 子系统拆分做自己的"模块边界"，**用 `__init__.py` 聚合导出**，业务下沉到子包。
- 子系统之间**只用公开 API 互调**（`from django.db import models`），不跨包 import 内部模块。
- 新增子系统时先写 `__init__.py` 文档字符串定"对外契约"，再写实现。
- 大型 monorepo 借鉴：`pkg/sub_a/`、`pkg/sub_b/`，每个子包有独立 `tests/`。

### 模式 7：模板引擎 Lexer → Parser → Node 管线

**问题场景**

模板语言（`{{ var }}`、`{% if %}`、`{% for %}`）要支持嵌套、自定义标签、上下文查找。一次性正则解析会丢失错误位置；分词后立即执行又无法做 AST 优化。Django 团队选了三阶段管线。

**解决方案**

`django/template/__init__.py` 把模板处理拆成 `Lexer`（分词）→ `Parser`（建 AST 树）→ `Node`（执行）。每个 Node 知道自己 `render(context)` 时做什么；`Engine` 容器管理 `Loader`（文件加载）、`dirs`（搜索路径）、`context_processors`（上下文注入）。

**关键参数**

| 阶段 | 输入 | 输出 | 关键 API |
| --- | --- | --- | --- |
| `Lexer` | 模板字符串 | token 流 | `tokenize()` |
| `Parser` | token 流 | `Node` 树 | `parse()` |
| `Node` | 上下文 `Context` | 渲染字符串 | `Node.render(context)` |
| `Engine` | 配置 | 模板集合 | `Engine.get_template(name)` |

**最佳实践**

- 自定义标签时继承 `template.Library` + `@register.tag`，把"分词"与"渲染"分两步写。
- `{% include %}` 嵌套会**重新走三阶段管线**，开销大，热点路径考虑 `{% cache %}`。
- `sandbox=False` 是默认，**别在生产模板里开 `{% load %}` 注入**——容易 XSS。
- 用 `Engine.get_default()` 拿单例，自定义 `Engine` 实例要手动 `engines.append`。

### 模式 8：双类 ORM 的"入口 + 构造器"分离

**问题场景**

`User.objects.filter(...)` 这样的链式 API 需要：(1) 一个稳定入口（数据库路由、HPA hints、强制只读），(2) 一个**可链式累积条件**的构造器。两者职责不同，强行合一会让"入口方法"和"链式方法"混淆。

**解决方案**

`Manager` 是"入口点"：暴露 `all()` / `filter()` / `get()` 等顶层 API，负责数据库路由（`router.db_for_read`）、HPA hints、强制只读等"切面"。`QuerySet` 是"惰性构造器"：每次 `.filter()` 只把条件塞进 `self.query`，**不触发 SQL**；只有 `len(qs)` / `for x in qs` 才触发 `compiler.execute_sql()`。

**关键参数**

| 类 | 职责 | 触发 SQL 的方法 |
| --- | --- | --- |
| `Manager` | 入口 + 切面 | 调底层 QuerySet 的同名方法 |
| `QuerySet` | 链式累积 | `__iter__` / `__len__` / `__bool__` / `__getitem__` |
| `compiler.SQLCompiler` | SQL 生成 | `execute_sql()` |
| `Manager.from_queryset` | 把自定义 QuerySet 装回 Model | 工厂方法 |

**最佳实践**

- 自定义链式方法写 `MyQuerySet(QuerySet)`，再 `MyQuerySet.as_manager()` 装回 Model。
- 切面需求（强制只读、HPA 路由）写在 `Manager` 子类里，**不要污染 QuerySet**。
- 调试 N+1 用 `django.db.reset_queries()` + `settings.DEBUG=True` 拿 SQL 日志。
- 异步视图用 `auser.objects.all()` 调起异步 QuerySet（Django 5.2 起稳定）。

### 模式 9：注册中心 + lazy_model_operation 插件解耦

**问题场景**

Django 生态有 1000+ 第三方 app（DRF、django-allauth、django-celery-beat）。这些 app 的 `signals.py` 经常需要 `post_save.connect(handler, sender=User)`，而 `User` 还没 import 完。强行要求"先 import Model 再连信号"会让插件系统写起来很痛苦。

**解决方案**

`django.apps.registry.Apps` 提供 `_pending_operations` 队列：插件用 `lazy_model_operation(when_model_is_ready, lambda: ...)` 注册回调，等 `populate()` 完成后由 `do_pending_operations()` 统一执行。这让"使用方先于定义方"成为可能。

```python
# 第三方 app 的 signals.py
from django.db.models.signals import post_save
from django.apps import apps

def _connect():
    User = apps.get_model('auth', 'User')
    post_save.connect(_on_user_save, sender=User)

apps.lazy_model_operation('connect_user_signal', _connect)
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `apps.populate(installed)` | 触发所有 app 的 `import_models` | 完成后 `ready=True` |
| `apps.lazy_model_operation(name, fn)` | 注册延迟回调 | `do_pending_operations` 时执行 |
| `apps.get_model('app_label', 'ModelName')` | 字符串拿 Model | 避免循环 import |
| `ready_event.set()` | 通知 `apps.ready.wait()` | 给启动器同步点 |

**最佳实践**

- 第三方 app 的 `signals.py` **永远用 `lazy_model_operation` 包装**，不直接 import 用户 Model。
- 自己项目里也用 `apps.get_model` 而非 `from app.models import X`，**避免冷启动崩溃**。
- 测试时显式 `apps.ready_event.wait(timeout=10)`，避免时序竞态。
- `INSTALLED_APPS` 用 `AppConfig` 子类路径（如 `myapp.apps.MyAppConfig`），不用模块路径，方便加 `ready()` 钩子。

### 模式 10：模板 `{% extends %}` 继承 + 块覆盖

**问题场景**

网站有 100+ 页面，90% 共享"页头/页脚/导航栏"，只有中间 20% 不一样。每个页面复制全 HTML 会让改导航变成噩梦。模板继承要支持"父模板定义块、子模板覆盖块"，且层级可嵌套。

**解决方案**

Django 模板用 `{% extends "base.html" %}` 声明父模板，子模板用 `{% block content %}...{% endblock %}` 覆盖父模板的同名块。父模板的同名块可保留默认内容（`{{ block.super }}`），子模板不重写就继承默认。

```html
<!-- base.html -->
<html>
<head>{% block head %}<title>{% block title %}Default{% endblock %}</title>{% endblock %}</head>
<body>{% block content %}{% endblock %}</body>
</html>

<!-- page.html -->
{% extends "base.html" %}
{% block title %}My Page{% endblock %}
{% block content %}<h1>{{ page.title }}</h1>{% endblock %}
```

**关键参数**

| 标签 | 作用 | 备注 |
| --- | --- | --- |
| `{% extends "base.html" %}` | 声明父模板 | 子模板**第一行** |
| `{% block name %}...{% endblock %}` | 定义可覆盖块 | 名字在同一模板内唯一 |
| `{{ block.super }}` | 渲染父模板同名块 | 链式覆盖用 |
| `{% include "partial.html" %}` | 嵌入子模板 | 不继承上下文块 |

**最佳实践**

- 父模板只放"骨架 HTML"（`<html>` / `<head>` / `<body>`），子模板只放"内容块"。
- 块名用下划线前缀表示私有（`{% block _sidebar %}`），**别依赖**。
- 嵌套层级 ≤ 3 层，超过会让调试痛苦（错误堆栈难定位）。
- 用 `{% include "partials/nav.html" %}` 复用片段，**别为复用搞继承层级**。

---

## 三、性能优化

Django 在 ORM 性能、模板渲染、惰性求值上有 20 年沉淀的模式。

### 模式 11：QuerySet 惰性求值 + `_result_cache`

**问题场景**

复杂业务链经常写 `qs1.filter(...).exclude(...).annotate(...).order_by(...)[:10]`。如果每一步都打 SQL，N 步就是 N+1 次查询。开发者希望能"先描述要什么、最后才查"。

**解决方案**

Django `QuerySet` 链式方法**全部不触发 SQL**，只修改 `self.query`。`__iter__` / `__len__` / `__bool__` / `__getitem__` 触发时调用 `compiler.execute_sql()`，结果存到 `self._result_cache`；后续遍历直接复用缓存。

```python
qs = User.objects.filter(age__gt=18)         # 不触发 SQL
qs = qs.exclude(name="admin")                  # 不触发 SQL
qs = qs.select_related("profile")              # 不触发 SQL
users = list(qs[:10])                          # 触发 1 条 SELECT，存 _result_cache
print(len(qs))                                 # 命中 _result_cache，不重查
for u in qs:                                   # 命中 _result_cache
    print(u.name)
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `self.query` | 累积 `WHERE` / `ORDER BY` / `LIMIT` | `qs.query.__str__()` 拿 SQL |
| `_result_cache` | 首次 SQL 后缓存 | 重复 `iter` 不重查 |
| `select_related` | JOIN 预取外键 | 1 条 SQL 替代 N+1 |
| `prefetch_related` | 单独查询再 IN 拼接 | M2M / 反向 FK 用 |

**最佳实践**

- 模板里 `{% for x in qs %}` 会**触发 SQL** 且**每页都重查**——考虑在 view 里 `list(qs)` 物化。
- 用 `qs.iterator(chunk_size=1000)` 流式遍历大结果集，**避免一次性吃光内存**。
- `qs.exists()` 翻译成 `SELECT 1 ... LIMIT 1`，比 `len(qs) > 0` 快。
- `len(qs)` 会物化**整个结果集**才数行，**大表用 `qs.count()`**。

### 模式 12：N+1 查询的 `select_related` / `prefetch_related`

**问题场景**

模板里 `{{ post.author.name }}` 触发"每篇文章一次 JOIN 作者查询"——100 篇文章就是 101 条 SQL。开发者希望能"一次性把关联对象也取出来"。

**解决方案**

`select_related(*fields)` 在主 SQL 里 JOIN 外键，**1 条 SQL 替代 N+1**，适用 ForeignKey、OneToOneField。`prefetch_related(*fields)` 单独查询再 `IN` 拼接，适用 M2M、反向 FK、GenericForeignKey。

```python
# N+1
for post in Post.objects.all():
    print(post.author.name)        # 每条 post 一次 SELECT

# 优化后：1 条 JOIN
for post in Post.objects.select_related("author"):
    print(post.author.name)        # 0 次额外查询

# M2M：1 条主查询 + 1 条关联查询
for post in Post.objects.prefetch_related("tags"):
    for tag in post.tags.all():
        print(tag.name)            # 0 次额外查询
```

**关键参数**

| 方法 | 适用 | 实现 | 内存 |
| --- | --- | --- | --- |
| `select_related` | FK / OneToOne | SQL JOIN | 不增加 Python 对象 |
| `prefetch_related` | M2M / 反向 FK | Python 端拼接 | 关联对象驻留内存 |
| `Prefetch("tags", queryset=Tag.objects.filter(...))` | 预取时再过滤 | 同上 | 同上 |
| `only("id", "title")` / `defer("body")` | 字段裁剪 | SQL 列裁剪 | 减少网络/反序列化 |

**最佳实践**

- DRF 序列化器经常踩 N+1，**在 `get_queryset()` 里 `select_related` 关联字段**。
- 大 M2M 用 `prefetch_related(Prefetch("tags", queryset=Tag.objects.only("id", "name")))` 裁列。
- `select_related` 链最多 3 层 JOIN，超过用 `prefetch_related` 拆开。
- 调试开 `settings.DEBUG=True` + `django.db.reset_queries()`，在 view 末尾 `print(len(connection.queries))`。

### 模式 13：模板渲染的 `cached_property` + 懒加载

**问题场景**

模板渲染时，`{{ request.user.profile.avatar_url }}` 这样的链式查找每渲染一次都要走 5 层 `__getattr__`，1000 行模板就是 5000 次字典查找。开发者希望能"算一次就缓存"。

**解决方案**

Django 用 `cached_property`（来自 `django.utils.functional`）实现"首次计算后缓存到 `__dict__`"。模板引擎在解析时已把 `{{ var }}` 编译成 `resolve(var)` 表达式，**只在第一次解析链时触发查找**。

```python
class cached_property:
    def __init__(self, func):
        self.func = func
        self.name = func.__name__
        self.attname = f"_cached_{func.__name__}"

    def __get__(self, instance, cls=None):
        if instance is None:
            return self
        value = self.func(instance)
        instance.__dict__[self.attname] = value
        return value
```

**关键参数**

| 场景 | 用法 | 收益 |
| --- | --- | --- |
| Model 字段反向引用 | `User.posts` 用 `cached_property` 缓存 | 同一 request 多次访问不重查 |
| 模板上下文 processor | `django.contrib.auth.context_processors.auth` | `request.user` 注入模板 |
| 模板 `{% with %}` | 局部变量 | 复杂表达式只算一次 |
| `@functools.lru_cache` | 无状态函数缓存 | 适合"纯函数" |

**最佳实践**

- 模板里写 `{% with profile=object.profile %}{{ profile.name }}{% endwith %}` 缓存中间值。
- Model 的"反向 FK 列表"用 `@cached_property` 包装，**配合 `prefetch_related` 用**避免 N+1。
- `cached_property` 在 `del obj.attr` 时**不会失效**，需要手动 `obj.__dict__.pop("attname")`。
- 进程内缓存（`lru_cache`）**不跨进程**，多 worker 下要换 Redis。

### 模式 14：连接池与 `CONN_MAX_AGE` 长连接

**问题场景**

每次请求都新建数据库连接，TCP 握手 + TLS 握手 + Postgres 启动进程要 30-100ms。100 RPS 就是 10 秒纯握手开销。开发者希望能"复用连接"。

**解决方案**

Django 用 `CONN_MAX_AGE` 设置连接最大存活秒数。每个 `connection` 对象在 `request_finished` 信号时若没超过 `CONN_MAX_AGE` 就**不关闭**，下次请求复用。`CONN_MAX_AGE = None` 表示"每次都关闭"（默认，安全但慢），`CONN_MAX_AGE = 0` 是同义。

```python
# settings.py
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "mydb",
        "CONN_MAX_AGE": 600,      # 10 分钟长连接
    }
}

# 信号钩子（默认已注册）
def close_old_connections(**kwargs):
    for conn in connections.all():
        conn.close_if_unusable_or_obsolete()

request_started.connect(close_old_connections)
request_finished.connect(close_old_connections)
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `CONN_MAX_AGE` | 连接最大存活秒 | 默认 None（每次关） |
| `close_if_unusable_or_obsolete` | 检查事务状态 + 寿命 | 不可用就关 |
| `connections.all()` | 拿所有数据库连接 | 多 DB 场景 |
| `async_` 下 `connection.close_async()` | 异步连接关闭 | Django 4.1+ |

**最佳实践**

- 生产设 `CONN_MAX_AGE = 600`（10 分钟），比"每次都建"快 5-10 倍。
- 用 PgBouncer 在 Django 外做连接池，**Django 端**仍设 `CONN_MAX_AGE` 让 socket 复用。
- 事务中出错用 `transaction.atomic()` 的**嵌套 context manager**，异常会回滚但连接保留。
- 跨进程时 `connection.psycopg2_connection` 不能 pickle，**别在 Celery 里直接传**。

### 模式 15：ORM 编译器的 `compiler.execute_sql` 批量优化

**问题场景**

ORM 一条 `qs.filter(...).update(x=1)` 应该翻译成 `UPDATE ... WHERE ...` 一次执行，而不是 `SELECT + 循环 UPDATE`。开发者希望能"在 SQL 层批量做"。

**解决方案**

Django `QuerySet.update()` / `delete()` 直接走 `SQLUpdateCompiler` / `SQLDeleteCompiler`，**跳过 SELECT**，返回影响行数。`bulk_create(objs, batch_size=100)` 翻译成 `INSERT ... VALUES (...)` 批量插入。

```python
# 单条更新：1 条 UPDATE
User.objects.filter(last_login__lt=one_year_ago).update(is_active=False)

# 批量插入：1 条 INSERT（多 VALUES）
Tag.objects.bulk_create([Tag(name=f"t{i}") for i in range(1000)], batch_size=500)

# 批量更新：1 条 UPDATE
User.objects.filter(id__in=[1, 2, 3]).update(last_login=now())
```

**关键参数**

| 方法 | 绕过 | 返回 |
| --- | --- | --- |
| `qs.update(**fields)` | SELECT | 影响行数 int |
| `qs.delete()` | SELECT | `(total, {table: count})` |
| `Model.objects.bulk_create(objs)` | 单条 INSERT | `objs` 列表（无 pk 回填除非指定） |
| `bulk_update(objs, fields)` | 多次 UPDATE | 影响行数 |
| `F("field") + 1` | 原生 `field = field + 1` | 避免 race |

**最佳实践**

- 大批量更新用 `qs.update()`，**别 `for x in qs: x.save()`**（N+1 + 信号开销）。
- 插入时 `bulk_create` 加 `batch_size=500` 防单条 SQL 过长被 DB 拒。
- `update()` **不发信号**（`post_save` 不触发），需要信号时用 `for ... save()` 或显式 `signals.send`。
- 跨进程原子操作要 `F("counter") + 1`，避免 `read-modify-write` 竞态。

---

## 四、可靠性与生态

Django 在测试、CI、生态、20 年向后兼容上的工程经验。

### 模式 16：`RemovedInXXWarning` 体系的 2 大版本过渡

**问题场景**

Django 5.0 删了 `django.utils.encoding.smart_text` 等老 API，但生态有 10 万+ 第三方包。一次性删除会让 80% 升级者代码崩。开发者希望能"提前 2 个版本警告，给生态迁移时间"。

**解决方案**

Django 团队用 `RemovedInDjango50Warning`、`RemovedInDjango60Warning`、`RemovedInDjango70Warning`（名字按"移除的版本号"）分级弃用。`DeprecationWarning` 是 Python 内置基类，Django 自己的 `RemovedInXXWarning` 是子类，会在文档 + `django.utils.deprecation` 模块集中导出。

```python
# django/utils/deprecation.py
class RemovedInDjango70Warning(PendingDeprecationWarning):
    pass

# 旧 API 标记
from django.utils.deprecation import RemovedInDjango70Warning
import warnings

def smart_text(s, encoding="utf-8"):
    warnings.warn(
        "smart_text() is deprecated. Use force_str() instead.",
        RemovedInDjango70Warning,
        stacklevel=2,
    )
    return s.encode(encoding).decode(encoding) if isinstance(s, bytes) else str(s)
```

**关键参数**

| 警告类 | 父类 | 触发版本 | 默认可见 |
| --- | --- | --- | --- |
| `RemovedInDjango50Warning` | `DeprecationWarning` | 已删 | 否（生产默认隐藏） |
| `RemovedInDjango60Warning` | `DeprecationWarning` | Django 6.0 删 | 否 |
| `RemovedInDjango70Warning` | `PendingDeprecationWarning` | Django 7.0 删 | 否 |
| `RemovedInNextVersionWarning` | `DeprecationWarning` | 下一个大版本 | 否 |

**最佳实践**

- 项目里设 `python -W default` 跑测试，**主动暴露** `RemovedInXXWarning`，提前 2 大版本修。
- 第三方包用 `PendingDeprecationWarning`（"未来会删"）比 `DeprecationWarning`（"现在已弃用"）温和。
- 写自己的 deprecation 时 `warnings.warn(..., stacklevel=2)`，**让警告指向调用方**而不是库内部。
- 大版本前 6 个月在 release notes 列"会被删的 API"，给生态 1-2 个 LTS 周期迁移。

### 模式 17：30 万行测试 + `runtests.py` 自定义 runner

**问题场景**

Django 自身代码 7000+ 文件、API 上千个。任何小改动都可能回归。开发者需要"高密度、能跑全栈、跨数据库" 的测试基础设施。

**解决方案**

Django 把测试代码放在 `tests/` 目录（30 万行），按模块分 ~50 个子目录（如 `tests/model_fields/`、`tests/admin_views/`）。`runtests.py` 自定义 runner 支持 `--keepdb`（不重建库）、`--parallel`（多进程）、`--tag`（跑指定标签）。CI 矩阵 `Py3.10-3.13 × SQLite/Postgres/MySQL/Oracle` 跑全组合。

```bash
# 跑 ORM 测试 + PostgreSQL 后端 + 保留测试库
python tests/runtests.py model_fields backends.postgres --keepdb --verbosity=2

# 跑带 slow 标签的测试
python tests/runtests.py --tag=slow

# 跑 model_fields 全部
python tests/runtests.py model_fields
```

**关键参数**

| 参数 | 作用 | 备注 |
| --- | --- | --- |
| `--keepdb` | 跑完不 drop test database | 加速反复跑 |
| `--parallel N` | 分 N 个进程跑 | CI 加速 |
| `--tag=...` | 只跑指定标签 | `@tag("slow")` 装饰 |
| `--verbosity=0..3` | 日志详细度 | 0=静默，3=全 SQL |
| `DATABASES` 切换 | 同一测试跑多个后端 | CI 矩阵 |
| `coverage.py` | 覆盖率报告 | CI 必传 90%+ |

**最佳实践**

- 模仿 Django 拆 `tests/` 子目录按模块组织，**别一个大 `tests.py` 5000 行**。
- ORM 测试继承 `django.test.TestCase`（自带事务回滚），**别用 `TransactionTestCase`**（慢且不自动回滚）。
- Selenium/E2E 测试用 `@tag("selenium")` 标，慢测试单跑。
- CI 上 `python -m coverage run --source=django tests/runtests.py` 拿覆盖率。

### 模式 18：CI 矩阵 + Postgres/PostGIS 专项

**问题场景**

Django 支持 5 个数据库（Postgres/MySQL/SQLite/Oracle/MariaDB），5 个 Python 版本（3.10-3.13），加 PostGIS 扩展。任何 release 必须保证全组合绿。开发者需要"并行、快速、容错"的 CI。

**解决方案**

GitHub Actions 用 `strategy.matrix` 跑 `python_version × database × extras` 笛卡尔积；Postgres/PostGIS 单独 workflow（耗时更长，用 `services: postgres` 起容器）；selenium 跑浏览器 E2E；docs 编译 RST。

```yaml
# .github/workflows/tests.yml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        python-version: ["3.10", "3.11", "3.12", "3.13"]
        db: [sqlite, postgres, mysql, oracle]
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: django
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
      - run: pip install -e .[bcrypt,argon2]
      - run: python tests/runtests.py --verbosity=2
```

**关键参数**

| CI Job | 耗时 | 触发 |
| --- | --- | --- |
| `linters.yml` | 1 min | ruff + black + isort |
| `tests.yml` | 20-40 min | python_matrix × sqlite/postgres/mysql |
| `postgres.yml` | 10 min | 单跑 postgres 复杂场景 |
| `postgis.yml` | 15 min | GIS 扩展相关 |
| `oracle.yml` | 30 min | 闭源 DB，单独 |
| `selenium.yml` | 20 min | 浏览器 E2E |
| `docs.yml` | 5 min | RST → HTML |

**最佳实践**

- 模仿 Django CI 把 lint / test / docs 拆成**独立 workflow**，lint 失败立即反馈，不等测试。
- `fail-fast: false` 让矩阵全跑完，**别让一个 DB 失败掩盖另一个**。
- 服务用 `services:` 容器起，**别 `apt-get install` 装**（缓存差）。
- 闭源 DB（Oracle）用 GitHub-hosted runner + 厂商镜像，**别在自建 runner 上跑**。

### 模式 19：生态分层（DRF / Wagtail / django-celery-beat）

**问题场景**

Django 核心只做 Web 框架（ORM、视图、模板），不直接做 REST API / CMS / 定时任务。生态里 DRF 做 API、Wagtail 做 CMS、django-celery-beat 做定时——这些包互不耦合，但都"挂在 `INSTALLED_APPS` 上"。

**解决方案**

Django 生态分 3 层：(1) **核心**（`django.contrib.auth`、`django.contrib.admin`、`django.contrib.sessions`），(2) **Django 官方包**（`django-rest-framework`、`channels`、`django-debug-toolbar`，部分官方维护），(3) **社区包**（Wagtail、django-allauth、django-celery-beat）。每层用 `AppConfig.ready()` 钩子接入。

```python
# settings.py
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.sessions",
    "django.contrib.contenttypes",
    "rest_framework",                          # API 层
    "rest_framework.authtoken",
    "wagtail.contrib.forms",                   # CMS 层
    "wagtail.sites",
    "django_celery_beat",                      # 定时任务
    "allauth",                                 # 第三方登录
    "allauth.account",
    "myapp.apps.MyAppConfig",                  # 业务 app
]
```

**关键参数**

| 层 | 例子 | 维护方 |
| --- | --- | --- |
| 核心 | `django.contrib.auth` | Django Core |
| 官方包 | `rest_framework`、`channels` | Django Team（部分） |
| 社区包 | `wagtail`、`django-allauth` | 社区 + DSF 赞助 |
| 业务 | `myapp` | 自己 |

**最佳实践**

- 用 `django-debug-toolbar` 调试 SQL 慢查询，**别在生产开**（拖慢 30%+）。
- 大项目用 DRF + SimpleJWT 鉴权，**别自己写 Token 中间件**。
- CMS 需求直接上 Wagtail，**别从头撸一个**（30 万行 Django 代码 + 10 年 CMS 沉淀）。
- Celery 任务用 `django-celery-beat` 存 cron 到 DB，**别用 crontab + command**（无法在 admin 看）。

### 模式 20：20 年向后兼容与社区治理

**问题场景**

Django 1.0 始于 2008 年，5.2.x 仍在 2025-2026 维护。任何"破坏性变更"都会让 100 万+ 旧项目升级困难。开发者需要"严格不破坏 + 慢节奏"治理。

**解决方案**

Django 团队坚持：(1) 每次大版本前 6 个月发"会删什么"公告，(2) 任何 PR 必须 2 位 committer + 全 CI 绿，(3) `triage rotation` 每两周换一人分 issue，(4) RFC 走 Django Forum + DEP（Django Enhancement Proposal）流程，(5) `RemovedInXXWarning` 给生态 2 大版本缓冲。

```text
RFC 流程：
1. Django Forum "proposals" 版块提出想法
2. 邮件列表 + Forum 讨论 2-4 周
3. GitHub PR 草案 + DEP 编号
4. 2 位 committer 同意 + CI 绿 + docs 更新
5. 合并入 main → 2 个大版本后才删
```

**关键参数**

| 治理维度 | 做法 | 收益 |
| --- | --- | --- |
| **Triage rotation** | 每 2 周 1 位 committer 分类 issue | 每月 200+ issue 关闭 |
| **RFC 流程** | Forum → 邮件 → PR → 合并 | 变更前充分讨论 |
| **`RemovedInXXWarning`** | 2 大版本过渡期 | 生态有时间迁移 |
| **Django Forum** | 替代旧 Google Group | 8000+ 在线 |
| **Discord** | 实时沟通 | 8000+ 在线 |
| **Tidelift** | 商业支持 | 企业用户付费 |
| **DSF 董事会** | 治理 + 财务 | 非营利基金会 |

**最佳实践**

- 自己项目也写"RFC 文档"放在 `docs/rfcs/`，重大变更前 2 周公示。
- 删 API 前先 `DeprecatedWarning` 1-2 个版本，**别 break 用户的代码**。
- 用 GitHub Issue + Label 体系做 triage（`bug` / `enhancement` / `needs-triage` / `good-first-issue`）。
- 商业支持（如 Django 的 Tidelift）让"维护开源"也能挣到钱，**避免 committer 全职去大厂**。

---

## 附：20 模式速查表

| # | 模式 | 关键文件 | 收益 |
| --- | --- | --- | --- |
| 1 | 元类驱动 ORM | `django/db/models/base.py:ModelBase` | 类声明即建表元数据 |
| 2 | Manager + QuerySet 双类 | `django/db/models/query.py:QuerySet` | 链式 + 懒求值 |
| 3 | Apps 双重检查锁 | `django/apps/registry.py:Apps` | 多线程启动安全 |
| 4 | 中间件洋葱 + 双向桥 | `django/core/handlers/base.py` | 一份代码跑 sync/async |
| 5 | URL 递归 + 正则 | `django/urls/resolvers.py` | 嵌套 include + 双向解析 |
| 6 | 8 子系统内聚拆分 | `django/{core,urls,db,...}` | 7000+ 文件可读 |
| 7 | 模板三阶段管线 | `django/template/{base,engine}.py` | 嵌套 + 自定义标签 |
| 8 | 入口 + 构造器分离 | `django/db/models/manager.py` | 切面与链式解耦 |
| 9 | lazy_model_operation 插件 | `django/apps/registry.py` | 插件先于 Model import |
| 10 | 模板继承 + 块覆盖 | `{% extends %}` / `{% block %}` | 页面骨架复用 |
| 11 | QuerySet 惰性 + 缓存 | `QuerySet._result_cache` | N 步只 1 条 SQL |
| 12 | N+1 优化 | `select_related` / `prefetch_related` | 1+1 → 1 条 SQL |
| 13 | cached_property 懒加载 | `django/utils/functional.py` | 模板反复访问不重算 |
| 14 | CONN_MAX_AGE 长连接 | `django/db/backends/base/base.py` | TCP 握手省 5-10x |
| 15 | 批量 update / bulk_create | `SQLUpdateCompiler` | 跳过 SELECT 直发 SQL |
| 16 | RemovedInXXWarning 体系 | `django/utils/deprecation.py` | 2 大版本缓冲 |
| 17 | 30 万行测试 + runtests.py | `tests/runtests.py` | 90%+ 覆盖率 |
| 18 | CI 矩阵 + 专项 | `.github/workflows/*.yml` | 5 DB × 5 Py 全绿 |
| 19 | 生态分层（DRF/Wagtail） | `INSTALLED_APPS` | 核心薄、生态厚 |
| 20 | 20 年向后兼容 | 治理 + RFC 流程 | 1.x 项目仍能升 5.x |

---

## 参考资料

- `G:\Obsidian Vault\实战案例\django.md`（V3 源笔记）
- Django 5.2 官方文档：https://docs.djangoproject.com/en/5.2/
- Django 源码：https://github.com/django/django
- DSF 治理：https://www.djangoproject.com/foundation/
- Django Forum：https://forum.djangoproject.com/
