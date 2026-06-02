# fastapi - 现代高性能 Python Web 框架

**GitHub**: fastapi/fastapi
**Star**: 78000+
**语言**: Python
**主题**: Web 框架 / ASGI / 类型驱动
**适用场景**: REST API / 微服务 / AI 模型服务 / 异步 IO 密集

---

## 第一段：基础范式（模式 1-5）

### 模式 1：类型注解驱动开发

**问题场景**：传统 Flask/Django 写 API 要手写文档 + 手动验证，参数错位引发运行时崩溃。

**解决方案**：FastAPI 用 Python type hints 声明路径参数 / query / body，Pydantic v2 自动验证 + 序列化。`def get_user(user_id: int)` 即文档即校验。

**关键参数**：
- `from pydantic import BaseModel`
- `def create_user(user: User):` 路径操作
- `Annotated[int, Path(ge=1)]` 约束
- `Query(default=10, ge=1, le=100)`

**最佳实践**：所有参数必带 type hint；Pydantic BaseModel 表达 body；用 `Annotated` 组合验证器。

### 模式 2：异步优先（async/await）

**问题场景**：Flask sync 跑 IO 阻塞 CPU 空闲；高并发撑不住。

**解决方案**：FastAPI 路由函数 `async def` 即异步，基于 ASGI（Starlette）+ asyncio event loop。同步函数自动 run in threadpool 隔离。

**关键参数**：
- `async def get_data(): await ...`
- `def blocking_call():` 同步自动线程池
- `BackgroundTasks` 后台任务
- `asyncio.gather` 并发

**最佳实践**：DB / HTTP IO 走 async；CPU 密集放 `run_in_threadpool`；不要混用 sync DB 库到 async 路径。

### 模式 3：OpenAPI 自动生成

**问题场景**：手写 API 文档与代码脱节，Swagger 配置繁琐。

**解决方案**：FastAPI 启动时自动扫所有路由生成 OpenAPI 3.1 schema；`/docs` 走 Swagger UI、`/redoc` 走 ReDoc。`response_model` 控制响应 schema。

**关键参数**：
- `app = FastAPI(title, version, description)`
- `@app.get('/users', response_model=list[User])`
- `/docs` Swagger UI
- `/redoc` ReDoc UI
- `openapi_tags` 分组

**最佳实践**：所有路由必 `response_model`；`tags` 分组；`summary`/`description` 自解释。

### 模式 4：依赖注入（Depends）

**问题场景**：DB session / 当前用户 / 配置等公共依赖散在每个 handler。

**解决方案**：`Depends(callable)` 函数装饰；FastAPI 解析依赖图自动注入；`yield` 模式支持 setup/teardown（DB session 关闭）。

**关键参数**：
- `def get_db(): db = SessionLocal(); try: yield db; finally: db.close()`
- `def get_user(token = Depends(get_token)): ...`
- `Depends(get_db, use_cache=True)`
- 类依赖 `class Common: def __init__(self, db=Depends(get_db))`

**最佳实践**：DB session / 鉴权 / 配置走 `Depends`；yield 模式管资源生命周期；类依赖组织多参数。

### 模式 5：Pydantic 模型与验证

**问题场景**：JSON 入参验证、字段裁剪、嵌套对象难处理。

**解决方案**：Pydantic v2 BaseModel 声明 schema，FastAPI 自动验证 + 错误时返回 422；`Field(min_length, max_length, regex)` 约束；`EmailStr` / `HttpUrl` / `conint` 内置。

**关键参数**：
- `class User(BaseModel): name: str; age: int = Field(ge=0, le=150)`
- `EmailStr` / `HttpUrl` / `UUID4`
- `model_config = ConfigDict(from_attributes=True)` ORM 模式
- `model_dump()` / `model_dump_json()` 序列化

**最佳实践**：所有 body 走 Pydantic；`Field` 配 `description` 写到 OpenAPI；`Optional[X] = None` 默认可选。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：路由与版本控制

**问题场景**：API 版本演进 / 路由分组 / 多文件组织。

**解决方案**：`APIRouter()` 子路由；`prefix` + `tags` + `dependencies`；`include_router(router, prefix='/v1')` 挂载。

**关键参数**：
- `router = APIRouter(prefix='/users', tags=['users'])`
- `@router.get('/')` 配 prefix
- `app.include_router(router, dependencies=[Depends(get_db)])`
- 多版本 `app.include_router(v1, prefix='/v1')` + `app.include_router(v2, prefix='/v2')`

**最佳实践**：按业务/版本拆 `APIRouter`；tags 分组；依赖挂路由器级别。

### 模式 7：异常处理

**问题场景**：异常 JSON 不统一 / HTTPException 散落 / 自定义错误码。

**解决方案**：`@app.exception_handler(ValueError)` 自定义处理；`HTTPException(status_code, detail)` 标准错；自定义 `exception_class` + handler。

**关键参数**：
- `from fastapi import HTTPException`
- `raise HTTPException(status_code=404, detail='not found')`
- `@app.exception_handler(StarletteHTTPException)`
- `add_exception_handler` 全局

**最佳实践**：自定义业务异常 + 全局 handler；统一 `{code, msg, data}` 结构；不要在 handler 内 raise。

### 模式 8：中间件与 CORS

**问题场景**：跨域 / 日志 / 限流 / 请求 ID。

**解决方案**：`@app.middleware('http')` 装饰；`CORSMiddleware` 内置；`BaseHTTPMiddleware` 自定义。

**关键参数**：
- `from fastapi.middleware.cors import CORSMiddleware`
- `app.add_middleware(CORSMiddleware, allow_origins=['https://app.com'])`
- `@app.middleware('http') async def add_request_id(request, call_next): ...`
- `GZipMiddleware` 压缩

**最佳实践**：CORS 显式 origin；中间件顺序注册（最后注册的最先执行）；自定义中间件必 `await call_next(request)`。

### 模式 9：数据库集成

**问题场景**：ORM 选择（SQLAlchemy / Tortoise / Piccolo / SQLModel）；session 管理。

**解决方案**：`SQLModel` 是 FastAPI 亲儿子（ORM + Pydantic 合一）；`SQLAlchemy 2.0` 配 `async_session`；`Tortoise ORM` 全异步；Depends 注入 session。

**关键参数**：
- `SQLAlchemy 2.0 async engine`
- `from sqlmodel import Field, Session, SQLModel, create_engine`
- `async with async_session() as s: yield s`
- Alembic 迁移

**最佳实践**：新项目 SQLModel 首选；Async 走 `create_async_engine`；Alembic 配 async 迁移。

### 模式 10：测试

**问题场景**：FastAPI 异步测试 / DB 依赖 / 鉴权 mock。

**解决方案**：`httpx.AsyncClient(app=app)` 异步请求；`pytest-asyncio` 跑 async fixture；`dependency_overrides` 替换 Depends。

**关键参数**：
- `async with AsyncClient(app=app, base_url='http://test') as ac:`
- `app.dependency_overrides[get_db] = lambda: test_db`
- `pytest-asyncio` + `pytest.fixture`
- `TestClient(app)` 同步（基于 starlette TestClient）

**最佳实践**：async 走 AsyncClient + pytest-asyncio；DB 走 SQLite in-memory；`dependency_overrides` 替换外部依赖。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：性能优化

**问题场景**：Pydantic v2 比 v1 快 5-50x 但仍有开销；uvicorn 单 worker 撑不住。

**解决方案**：uvicorn `workers=N` 多进程；`gunicorn -k uvicorn.workers.UvicornWorker`；`orjson` 替代 json；Pydantic v2 + `model_config = ConfigDict(...)`；中间件按耗时排序。

**关键参数**：
- `uvicorn app:app --workers 4 --loop uvloop --http httptools`
- `orjson.OPT_INDENT_2`
- `model_dump(mode='json')`
- `lru_cache` 配置

**最佳实践**：压测 `locust` / `wrk`；uvloop + httptools 加速；按需 `response_model_exclude_unset`。

### 模式 12：WebSocket

**问题场景**：实时双向通信（聊天 / 推送 / 协同编辑）。

**解决方案**：`@app.websocket('/ws')` 装饰；`websocket.accept()` / `receive_text()` / `send_text()`。`ConnectionManager` 管理多连接。

**关键参数**：
- `@app.websocket('/ws/{client_id}')`
- `await websocket.accept()` / `receive_text()` / `send_text()`
- 异常 `WebSocketDisconnect`
- 心跳 / 重连策略

**最佳实践**：连接管理走类封装；`try/except WebSocketDisconnect` 清理；身份验证在 query/header。

### 模式 13：GraphQL / gRPC

**问题场景**：REST 满足不了灵活查询 / 强类型 RPC。

**解决方案**：GraphQL 配 `strawberry-graphql`（FastAPI 集成最佳）；gRPC 配 `grpcio` / `betterproto`。FastAPI 不绑定协议，可做混合。

**关键参数**：
- `from strawberry.fastapi import GraphQLRouter`
- `graphql_app = GraphQLRouter(schema)`
- gRPC `grpc.aio.server()`
- 同时启 HTTP + gRPC

**最佳实践**：内部服务 gRPC；对外 API REST；GraphQL 适合 BFF 层。

### 模式 14：OAuth2 与鉴权

**问题场景**：JWT / OAuth2 / API Key 鉴权集成。

**解决方案**：`fastapi.security` 预置 `OAuth2PasswordBearer` / `OAuth2AuthorizationCodeBearer` / `APIKeyHeader` / `HTTPBearer`；`Security` 替代 `Depends`。

**关键参数**：
- `from fastapi.security import OAuth2PasswordBearer`
- `oauth2_scheme = OAuth2PasswordBearer(tokenUrl='token')`
- `Depends(oauth2_scheme)` 拿 token
- `Security(scopes=['me'])` 权限 scope

**最佳实践**：JWT 配 `python-jose`；密码哈希 `passlib[bcrypt]`；scope 走 `Security`。

### 模式 15：生产部署

**问题场景**：Docker 镜像 / K8s 部署 / 监控集成。

**解决方案**：`uvicorn` / `gunicorn` 多 worker；Dockerfile `python:3.12-slim` 多阶段构建；Sentry `sentry-sdk`；`prometheus-fastapi-instrumentator` 指标。

**关键参数**：
- `CMD ["gunicorn", "app:app", "-k", "uvicorn.workers.UvicornWorker", "-w", "4"]`
- Dockerfile `COPY` + `pip install --no-cache-dir`
- `/metrics` Prometheus 端点
- Sentry `sentry_sdk.init(dsn=...)`

**最佳实践**：uvicorn workers = CPU 核数；`--proxy-headers` 配 Nginx；监控 /health。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：项目结构

**问题场景**：FastAPI 单文件 500 行膨胀；业务分层。

**解决方案**：`app/` 主体；`api/v1/` 路由；`schemas/` Pydantic；`models/` ORM；`services/` 业务；`crud/` 数据；`core/` 配置；`deps.py` 公共依赖。

**关键参数**：
```
app/
  main.py
  api/v1/users.py
  schemas/user.py
  models/user.py
  services/user.py
  deps.py
  core/config.py
```

**最佳实践**：严格分层（router → service → crud → model）；core 配 `pydantic-settings`；测试镜像同样结构。

### 模式 17：AI / LLM 集成

**问题场景**：FastAPI 部署 LLM 推理服务（OpenAI / Claude / vLLM / Ollama）；流式响应。

**解决方案**：`StreamingResponse` + `async generator` 流式；`openai` / `anthropic` SDK；`vllm` / `ollama` 私有部署；SSE 协议（`text/event-stream`）。

**关键参数**：
- `from fastapi.responses import StreamingResponse`
- `async def generate(): yield 'data: ...\n\n'`
- `openai.AsyncClient(api_key=...)`
- SSE 头 `Content-Type: text/event-stream`

**最佳实践**：流式响应走 `StreamingResponse`；OpenAI SDK 用 async client；错误重试用 `tenacity`。

### 模式 18：可观测性

**问题场景**：FastAPI 服务的日志/链路追踪/指标。

**解决方案**：`loguru` 结构化日志；`OpenTelemetry` SDK 配 `opentelemetry-instrumentation-fastapi`；`prometheus-fastapi-instrumentator` 暴露 `/metrics`；Sentry 错误聚合。

**关键参数**：
- `FastAPIInstrumentor.instrument_app(app)`
- `Resource.create({SERVICE_NAME: ...})`
- OTLP exporter
- `sentry_sdk.init(traces_sample_rate=0.1)`

**最佳实践**：三件套 logging + tracing + metrics；`request_id` middleware；跨服务传 `traceparent`。

### 模式 19：与 Flask/Django 对比

**问题场景**：老项目 Flask 升级到 FastAPI 怎么迁？

**解决方案**：路由 + handler 几乎一对一；Flask 装饰器 `methods=['GET', 'POST']` → FastAPI 分开；Jinja2 模板 → FastAPI 也能用但重前端分离；Django ORM → SQLAlchemy 替换。

**关键参数**：
- Flask `@app.route('/users', methods=['GET'])` → FastAPI `@app.get('/users')`
- Flask `request.json` → FastAPI `user: User` Pydantic
- Flask `abort(404)` → FastAPI `raise HTTPException(404)`
- Flask `g` → FastAPI `Depends`

**最佳实践**：分阶段迁（API 层先迁、内部工具后迁）；共享 DB schema；鉴权用 OAuth2PasswordBearer。

### 模式 20：性能与极限

**问题场景**：FastAPI 在高 QPS 下表现？

**解决方案**：`uvicorn + uvloop + httptools` 配置下接近 Go 性能；同步函数走 threadpool；Pydantic v2 比 v1 50x 快；OpenAPI 生成有缓存。

**关键参数**：
- 简单 handler 20-30k req/s
- 含 Pydantic 验证 5-10k req/s
- 含 DB 1-3k req/s
- 同步 handler 自动 threadpool

**最佳实践**：压测找瓶颈（autocannon）；DB 走 async + 连接池；Pydantic 避免过度嵌套；Cython/或json 加速序列化。
