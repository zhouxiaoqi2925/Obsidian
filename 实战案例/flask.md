# flask - Python 微框架事实标准

**GitHub**: pallets/flask
**Star**: 68000+
**语言**: Python
**主题**: Web 框架 / WSGI / 微框架
**适用场景**: 小到中型 API / 内部工具 / 教学 / 快速原型

---

## 第一段：基础范式（模式 1-5）

### 模式 1：微框架哲学

**问题场景**：Django 全家桶过重，小项目不想引入 ORM/Admin/Auth 一堆；裸 WSGI 又太低层。

**解决方案**：Flask 只保留核心：路由 + 请求上下文 + 模板引擎（Jinja2）+ WSGI 适配（Werkzeug）。其他（ORM、表单、登录）通过扩展按需装。

**关键参数**：
- `from flask import Flask, request, jsonify`
- `app = Flask(__name__)`
- `app.route('/')` 装饰器
- `app.config['SECRET_KEY'] = 'x'` 配置

**最佳实践**：小项目纯 Flask + 几个扩展；中型项目 Flask + SQLAlchemy + Flask-Login；大项目换 Django/FastAPI。

### 模式 2：路由系统

**问题场景**：URL 与函数映射 / 路径参数 / HTTP 方法分发。

**解决方案**：`@app.route('/users/<int:id>', methods=['GET'])` 装饰器；`<int:id>` 类型转换；`methods=['GET', 'POST']` 多方法。`url_for('user', id=1)` 反向生成。

**关键参数**：
- `<int:id>` / `<string:name>` / `<path:subpath>` / `<uuid:uid>` 转换器
- `methods=['GET', 'POST']`
- `endpoint='user_detail'` 命名端点
- `defaults={'page': 1}` 默认值

**最佳实践**：路由放 `app/` 目录；Blueprint 拆模块；URL 用 kebab-case。

### 模式 3：请求/响应与上下文

**问题场景**：在函数内访问 request / session 等全局对象；g 对象跨函数传数据。

**解决方案**：Flask 维护应用上下文 + 请求上下文；`request.form` / `request.args` / `request.json` / `request.files` / `request.cookies` / `g.user`。

**关键参数**：
- `request.args.get('name')` GET 参数
- `request.form['name']` POST 表单
- `request.json` JSON body
- `request.headers` 头
- `g` 当前请求全局对象

**最佳实践**：用 `flask.g` 存请求级数据（DB session / current user）；用 `before_request` 注入。

### 模式 4：模板引擎（Jinja2）

**问题场景**：服务端渲染 HTML / 模板继承 / 转义防 XSS。

**解决方案**：Flask 默认 Jinja2；`{{ var }}` 转义输出；`{% for %}` / `{% if %}` 控制；`{% extends "base.html" %}` 继承。

**关键参数**：
- `render_template('index.html', name='x')`
- `{{ name | safe }}` 不转义
- `{% include 'sidebar.html' %}`
- 宏 `{% macro field(name) %}...{% endmacro %}`

**最佳实践**：模板转义防 XSS；`autoescape` 默认开；宏复用片段。

### 模式 5：蓝图（Blueprint）

**问题场景**：单 `app.py` 几百行膨胀；多模块拆开。

**解决方案**：`Blueprint('user', __name__, url_prefix='/users')` 蓝图为子应用；`app.register_blueprint(user_bp)` 注册。

**关键参数**：
- `bp = Blueprint('user', __name__, url_prefix='/users')`
- `@bp.route('/')`
- `app.register_blueprint(bp)`
- `bp.before_request`
- 嵌套 `app.register_blueprint(bp, url_prefix='/api')`

**最佳实践**：按业务模块拆 Blueprint；公用工具放 `app/utils/`；入口 `app/__init__.py` 用 `create_app` 工厂模式。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：应用工厂（create_app）

**问题场景**：单实例 Flask 难做多环境配置（dev/test/prod）；测试时多实例冲突。

**解决方案**：`def create_app(config_name='dev')` 工厂模式；`app.config.from_object(config[config_name])` 加载配置；`db.init_app(app)` 多 init。

**关键参数**：
- `def create_app(): app = Flask(__name__); db.init_app(app); return app`
- `app.config.from_object('config.DevConfig')`
- `app.config.from_envvar('APP_SETTINGS')`
- `os.environ.get('FLASK_ENV')` 环境

**最佳实践**：所有项目用 create_app；config 字典分环境；测试用不同实例。

### 模式 7：扩展（Extension）

**问题场景**：登录、ORM、邮件、缓存、管理后台按需引入；不想全塞进框架。

**解决方案**：`Flask-SQLAlchemy` / `Flask-Login` / `Flask-Migrate` / `Flask-Mail` / `Flask-Caching` / `Flask-Admin` 等扩展，遵循 `init_app(app)` 工厂模式。

**关键参数**：
- `from flask_sqlalchemy import SQLAlchemy; db = SQLAlchemy()`
- `db.init_app(app)`
- `class User(db.Model): id = db.Column(db.Integer, primary_key=True)`
- `Flask-Login` 配 `login_user(user)`

**最佳实践**：扩展用 factory 模式；少装，按需；扩展生态有 1000+ 可选。

### 模式 8：请求钩子

**问题场景**：鉴权 / 日志 / 性能计时在每个请求前/后统一处理。

**解决方案**：`@app.before_request` / `@app.after_request` / `@app.teardown_request` 钩子；`@app.errorhandler(404)` 错误处理。

**关键参数**：
- `@app.before_request def auth(): ...`
- `@app.after_request def add_header(resp): resp.headers['X-Foo'] = '1'; return resp`
- `@app.errorhandler(404)`
- `@app.context_processor` 注入模板变量

**最佳实践**：`before_request` 做认证；`teardown_request` 关闭 DB session；`errorhandler` 配 JSON 响应。

### 模式 9：表单与文件上传

**问题场景**：表单验证 / CSRF / 文件上传。

**解决方案**：`Flask-WTF` 配 WTForms；`form.validate_on_submit()` 验证；CSRF 自动；`request.files['file']` 上传；`UPLOAD_FOLDER` + `MAX_CONTENT_LENGTH`。

**关键参数**：
- `class LoginForm(FlaskForm): username = StringField('User', validators=[DataRequired()])`
- `form.validate_on_submit()`
- `request.files['x'].save(path)`
- `MAX_CONTENT_LENGTH = 16 * 1024 * 1024`

**最佳实践**：所有表单 WTForms 验证；文件大小限制；上传目录不可执行。

### 模式 10：会话与 Cookie

**问题场景**：登录状态保持 / 用户偏好 / Flash 消息。

**解决方案**：Flask `session` 基于签名 Cookie；`SECRET_KEY` 必须；`session['user_id'] = u.id`；`session.permanent = True` 长会话；`flash('msg', 'category')` Flash 消息。

**关键参数**：
- `from flask import session, flash`
- `app.config['SECRET_KEY']`
- `app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)`
- `flash('Success', 'success')`
- `SESSION_COOKIE_SECURE = True` HTTPS-only

**最佳实践**：SECRET_KEY 走 env；SESSION_COOKIE_SECURE + HTTPONLY；Flash 消息必带 category。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：REST API 与 JSON

**问题场景**：Flask 也能写 API，但 JSON 序列化、错误处理要规范。

**解决方案**：`jsonify(data)` 自动 JSON；`abort(404)` + `errorhandler(404)` JSON 响应；`Flask-RESTful` / `flask-restx` 资源化。

**关键参数**：
- `from flask import jsonify, abort`
- `return jsonify({'code': 0, 'data': data})`
- `abort(400, 'Bad request')`
- `class UserAPI(MethodView): def get(self, id): ...`

**最佳实践**：所有 API 返回 `{code, msg, data}` 结构；统一错误处理；用 Flask-RESTful 资源化。

### 模式 12：数据库集成

**问题场景**：SQLAlchemy 集成 / 迁移 / 多对多关系。

**解决方案**：`Flask-SQLAlchemy` ORM 集成；`Flask-Migrate` 走 Alembic；`db.relationship` / `db.ForeignKey` 关系。

**关键参数**：
- `class User(db.Model): __tablename__ = 'users'`
- `db.session.add(user); db.session.commit()`
- `Flask-Migrate` 配 `migrate = Migrate(app, db)`
- `flask db init/migrate/upgrade`

**最佳实践**：所有项目 SQLAlchemy + Alembic 迁移；连接池配 `SQLALCHEMY_POOL_SIZE`。

### 模式 13：异步支持（Flask 2.0+）

**问题场景**：Flask 同步阻塞 IO，高并发撑不住；想用 async。

**解决方案**：Flask 2.0+ 支持 `async def` 视图（与 Quart 兼容）；但 Flask 本身仍是 WSGI 同步框架。`flask[async]` 装 `asgiref`。

**关键参数**：
- `@app.route('/') async def index(): await asyncio.sleep(0.1); return 'hi'`
- `app = Flask(__name__); app.config['async_mode'] = 'asgiref'`
- `pip install asgiref`

**最佳实践**：高 QPS 选 FastAPI；Flask async 适合 IO 密集但流量不大；sync 走线程池。

### 模式 14：测试

**问题场景**：Flask 视图 / 表单 / 路由测；mock 外部依赖。

**解决方案**：`app.test_client()` 跑 HTTP；`pytest-flask` fixture；`unittest.mock` 替换依赖。

**关键参数**：
- `client = app.test_client()`
- `client.get('/api/users')` / `client.post('/api', json={...})`
- `app.config['TESTING'] = True`
- `pytest --cov=app`

**最佳实践**：view 100% 覆盖；mock 外部 API；CI 必 `pytest --cov`。

### 模式 15：部署

**问题场景**：Flask dev server 不安全 / 慢；生产部署方案。

**解决方案**：`gunicorn -w 4 'app:create_app()'` 多 worker；Nginx 反代；Docker `python:3.12-slim` 镜像；uvicorn（async）。

**关键参数**：
- `gunicorn -w 4 -b 0.0.0.0:8000 'app:create_app()'`
- `gunicorn -k uvicorn.workers.UvicornWorker` async
- Nginx `proxy_pass http://127.0.0.1:8000;`
- `Dockerfile` 多阶段

**最佳实践**：生产必 gunicorn + nginx；`--workers = (2 * CPU) + 1`；`--max-requests` 防内存泄漏。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：项目结构

**问题场景**：单文件 500 行；分层混乱。

**解决方案**：`app/__init__.py` 工厂；`app/models/` ORM；`app/views/` 蓝图；`app/templates/` + `app/static/`；`app/utils/` + `app/extensions.py` + `config.py`。

**关键参数**：
```
app/
  __init__.py  # create_app
  models/
  views/
  templates/
  static/
  utils/
  extensions.py  # db, login_manager
config.py
migrations/
tests/
```

**最佳实践**：严格分层；测试镜像同样结构；`extensions.py` 放单例对象。

### 模式 17：性能与缓存

**问题场景**：DB 查询慢 / 重复计算 / 高频 API。

**解决方案**：`Flask-Caching` 配 Redis / Memcached；`@cache.cached(timeout=60)` 装饰；`query.filter_by(id=u.id).first()` 缓存；SQLAlchemy `lazy='select'` 关系。

**关键参数**：
- `from flask_caching import Cache; cache = Cache(app, config={'CACHE_TYPE': 'Redis'})`
- `@cache.cached(timeout=60)`
- `db.session.query(User).options(joinedload(User.posts))` 避免 N+1
- `lru_cache` 函数级

**最佳实践**：Redis 缓存热点；查询走 `joinedload`；SQL 慢查询监控。

### 模式 18：安全加固

**问题场景**：XSS / CSRF / SQL 注入 / Cookie 泄露。

**解决方案**：`Flask-WTF` CSRF 保护；Jinja2 自动转义；`Talisman` 安全头（`SESSION_COOKIE_SECURE` / `SESSION_COOKIE_HTTPONLY` / CSP）；SQLAlchemy ORM 防 SQL 注入。

**关键参数**：
- `from flask_wtf.csrf import CSRFProtect; csrf = CSRFProtect(app)`
- `from flask_talisman import Talisman; Talisman(app)`
- `SESSION_COOKIE_SECURE = True`
- CSP 头

**最佳实践**：必开 CSRF；HTTPS-only cookie；ORM 参数化查询；定期 `pip-audit`。

### 模式 19：监控与日志

**问题场景**：请求日志 / 错误聚合 / 性能监控。

**解决方案**：`flask-logs` 或 `logging.config.dictConfig`；`Sentry SDK`；`prometheus-flask-exporter` 暴露指标；`gunicorn` 配 `access log`。

**关键参数**：
- `logging.config.dictConfig(LOGGING_CONFIG)`
- `Sentry.init(dsn=...)` + `from sentry_sdk.integrations.flask import FlaskIntegration`
- `prometheus_flask_exporter.PrometheusMetrics(app)`
- `gunicorn --access-logfile -` JSON 格式

**最佳实践**：JSON 结构化日志；Sentry 配 release；`/metrics` 暴露给 Prometheus。

### 模式 20：迁移到 FastAPI

**问题场景**：Flask 老项目要 async / 类型 / OpenAPI 怎么办？

**解决方案**：路由 + handler 几乎一对一；Flask 装饰器 → FastAPI 装饰器；`request.json` → Pydantic；`session` → Depends / JWT。Flask 1.x → FastAPI 渐进迁移。

**关键参数**：
- Flask `@app.route('/users/<int:id>')` → FastAPI `@app.get('/users/{id}')`
- `request.json` → `user: User` Pydantic
- `session` → JWT
- `abort(404)` → `raise HTTPException(404)`

**最佳实践**：API 层先迁；DB 共享；鉴权换 OAuth2PasswordBearer；前端不变。
