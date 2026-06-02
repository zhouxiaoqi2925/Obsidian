# Ruby on Rails · 架构与工程实践精要

> Rails 是"约定大于配置"哲学的开山鼻祖，定义了一代人心中"web 框架该有的样子"。本笔记从 Amazon Builders' Library 视角剖析其 6+1 子 gem 模型、Arel/Relation 惰性求值、ActionPack 三层 MVC 链路，聚焦 20 个工程模式与决策。

---

## 一、核心机制与框架哲学

### 模式 1：Convention over Configuration（约定大于配置）

**问题场景**：传统 Web 框架（Java EE、Spring）要求开发者为每个表、每个字段、每个 URL 显式写 XML/YAML 配置。简单 CRUD 80% 的代码是"声明这个字段映射到那个列"——配置淹没业务。

**解决方案代码**：

```ruby
# 一个 Ruby 类就完成：表名推断 + 字段映射 + 关联 + 时间戳
class User < ApplicationRecord
  has_many :posts
  validates :email, presence: true, uniqueness: true
end

# ActiveRecord 自动识别：
# - 表名：users（类名复数下划线）
# - 主键：id
# - 时间戳列：created_at, updated_at
# - 外键：user_id（关联 posts 表）
# - 关联类名：Post（通过 posts 推断）
```

**关键参数表**：

| 约定 | 默认值 | 覆盖方式 |
|---|---|---|
| 表名 | 类名复数下划线（`User` → `users`） | `self.table_name = 'my_users'` |
| 主键 | `id` | `self.primary_key = 'uuid'` |
| 时间戳列 | `created_at` / `updated_at` | `self.record_timestamps = false` |
| 外键 | `<association>_id` | `foreign_key: 'author_id'` |
| 关联类名 | 单数化关联名 | `class_name: 'Article'` |
| 时间格式 | `2024-01-15 10:30:00 UTC` | `self.time_zone_aware_attributes = true` |

**最佳实践列表**：
- 80% 的项目用默认约定即可——只有"遗留数据库"或"特殊命名"才需要 override
- 重命名表用 `self.table_name` 而非加 migration——约定优先，特殊化其次
- 测试时用 `users(:one)` factory 而非 `User.create`——约定驱动 fixture
- 跨数据库表 join 时显式指定 `class_name` 和 `foreign_key`——避免歧义

### 模式 2：6+1 子 gem 模型（解耦复用）

**问题场景**：早期框架（如 Java Spring）把"ORM、模板、路由、邮件"全塞一个 jar，开发者无法选其中一部分用。而 Sinatra、Hanami 等轻量框架又需要"ORM"但不想带"整个 Rails"。

**解决方案代码**：

```ruby
# Gemfile: 只用 ActiveRecord 而不带 Rails
gem 'activerecord', '~> 8.0'
require 'active_record'

ActiveRecord::Base.establish_connection(adapter: 'sqlite3', database: ':memory:')

# 现在可以用 User.find(1) 而不需要 rails new
# 这就是 ActiveRecord 独立 gem 的威力
```

**关键参数表**：

| 子 gem | 职责 | 独立用途 |
|---|---|---|
| `activesupport` | Ruby 扩展、工具库 | 任何项目用 `try` / `present?` / `HashWithIndifferentAccess` |
| `activemodel` | 非 AR 的 Model 抽象（验证、回调） | 单独使用 validations / callbacks |
| `activerecord` | ORM 主体 | Sinatra / Hanami 单独集成 |
| `actionpack` | 路由 + Controller | 单独做 JSON API |
| `actionview` | ERB / Haml 模板 | Sinatra 单独用 |
| `activejob` | 后台任务抽象 | 单独配合 Sidekiq |
| `actionmailer` | 邮件发送 | 任何发邮件场景 |
| `actioncable` | WebSocket 抽象 | 任何实时应用 |
| `activestorage` | 文件上传（S3/GCS/Azure） | 任何上传场景 |
| `actionmailbox` | 收件箱路由 | 任何邮件接收场景 |
| `actiontext` | 富文本（Trix 编辑器） | 任何富文本场景 |

**最佳实践列表**：
- 用 `gem 'activerecord'` 单独集成 OR 库到非 Rails 项目——避免"框架绑架"
- 子 gem 独立版本号——可以 AR 升 8.0 而 actionpack 留 7.x
- 维护者按子 gem 拆分——新人只需理解一个 gem 的代码
- 测试隔离——子 gem 各自一套 Minitest，互不干扰

### 模式 3：DSL Builder 模式（routes.rb 4 行定义 7 端点）

**问题场景**：传统框架用 `@GetMapping("/users/{id}")` 注解或 XML 配置，URL 模板与 controller 方法名是"两份事实"。改 URL 必须改两处。

**解决方案代码**：

```ruby
# config/routes.rb
Rails.application.routes.draw do
  resources :users do
    resources :posts
  end
end

# 一行 resources :users 自动生成 7 个 REST 端点：
# GET    /users           users#index
# POST   /users           users#create
# GET    /users/new       users#new
# GET    /users/:id/edit  users#edit
# GET    /users/:id       users#show
# PATCH  /users/:id       users#update
# DELETE /users/:id       users#destroy
# 加上命名路由：user_path(@user), new_user_path, edit_user_path(@user) 等
```

**关键参数表**：

| DSL 方法 | 作用 | 生成的 helper |
|---|---|---|
| `resources :users` | 7 个 REST 路由 | `users_path` / `user_path(id)` 等 |
| `resource :profile` | 单数资源（无 :id） | `profile_path` |
| `namespace :admin` | 路径前缀 + 命名空间 | `admin_users_path` |
| `scope path: 'api/v1'` | 路径前缀无命名空间 | 保留 controller 名字 |
| `concern :commentable` | 抽出公用路由 | `resources :posts, concerns: :commentable` |
| `mount Sidekiq::Web => '/sidekiq'` | 挂载 Rack 应用 | Rack app |

**最佳实践列表**：
- `resources` 是 7 端点一气呵成——`only: [:index, :show]` 减少不必要路由
- `concern` 抽出多资源公用的嵌套关系（如 :commentable / :taggable）
- `namespace` 与 `scope` 区别：前者影响 controller 命名空间，后者只改路径
- 永远不要写 `match`——用 `get`/`post`/`patch`/`delete` 显式声明
- 路由用 `bin/rails routes` 反查——比读 routes.rb 找

### 模式 4：元编程与 method_missing（动态方法生成）

**问题场景**：传统 ORM 用 `findByName('x')` 这种硬编码方法，而 ActiveRecord 用 `where(name: 'x')`——开发者希望"字段名改了，调用代码自动适配"。

**解决方案代码**：

```ruby
# activerecord/lib/active_record/dynamic_matchers.rb
def respond_to_missing?(name, include_private = false)
  matchers.find { |pattern| name =~ pattern }.present? || super
end

def method_missing(name, *arguments, &block)
  matchers.each do |pattern|
    if name =~ pattern
      # find_by_name_and_age('x', 30) → where(name: 'x', age: 30).take
      return self.class.send(:find_by_dynamic_matchers, name, *arguments) { ... }
    end
  end
  super
end

# 用法：动态生成的方法
User.find_by_name('Alice')          # SELECT * FROM users WHERE name = 'Alice' LIMIT 1
User.find_by_email_and_role('a@b', 'admin')  # 多字段链
User.where_not(status: 'deleted')  # 自动生成 scope
```

**关键参数表**：

| 调用 | 内部翻译 | 性能开销 |
|---|---|---|
| `find_by_name(x)` | `where(name: x).take` | 1 次方法查找 |
| `find_by_name_and_age(x, y)` | `where(name: x, age: y).take` | 1 次方法查找 |
| `order_by_name` | `order(name: :asc)` | 1 次方法查找 |
| `where_not(x: y)` | `where.not(x: y)` | 1 次方法查找 |

**最佳实践列表**：
- 字段名变化时所有动态方法自动失效——IDE 跳转可能跳错，靠测试保障
- `respond_to_missing?` 必须配套——否则 `respond_to?(:find_by_name)` 返回 false
- 性能敏感场景用 `where` 显式调用——method_missing 有 ~10x 性能损失
- `bin/rails runner "User.methods.grep(/^find_by_/)"` 列出所有动态方法

### 模式 5：Railties 应用拼装（CLI + 钩子）

**问题场景**：框架是"通用"，应用是"具体"——如何在启动时把 10 个子 gem 按应用需求拼装？需要一套"初始化钩子"机制让每个 gem 在适当阶段做配置。

**解决方案代码**：

```ruby
# railties/lib/rails/application.rb
class Application
  class Configuration
    # 初始化钩子：每个子 gem 在此处注册自己的初始化逻辑
    def initialize_before(hook_name, &block)
      initializer(hook_name, before: :load_config_initializers, &block)
    end

    # 6 大钩子阶段：
    # 1. before_configuration
    # 2. before_eager_load
    # 3. after_initialize
    # 4. to_prepare
    # 5. after_eager_load
    # 6. finisher_hook
  end
end

# 子 gem 注册初始化器（每个 gem 都有一个 railtie.rb）
# activerecord/lib/active_record/railtie.rb
class Railtie
  initializer "active_record.initialize_timezone" do
    ActiveRecord::Base.time_zone_aware_attributes = true
  end

  initializer "active_record.set_reloader_hooks" do
    reloader = Rails.application.reloader
    reloader.to_run { ... }
    reloader.to_complete { ... }
  end
end

# config/application.rb 加载顺序：
require 'rails/all'  # 一次性加载 11 个子 gem 的 railtie
Bundler.require(*Rails.groups)  # 加载业务 gem
```

**关键参数表**：

| 钩子 | 时机 | 典型用途 |
|---|---|---|
| `before_configuration` | 加载 `config/application.rb` 前 | 设置环境变量 |
| `before_initialize` | 框架初始化前 | monkey patch |
| `to_prepare` | 每次请求前（dev 模式 eager reload） | 清理常量缓存 |
| `after_initialize` | 框架初始化后 | 注册回调、启动后台线程 |
| `finisher_hook` | 启动完成 | 启动 ActionCable server、文件监视器 |

**最佳实践列表**：
- 自定义配置放在 `config/initializers/` 下——每个文件一个 initializer
- `to_prepare` 钩子是 dev 模式 reload 的关键——业务清理代码必须放这里
- 用 `Rails.application.config` 访问配置对象——避免全局变量
- `bin/rails initializers` 列出所有初始化器及其执行顺序

---

## 二、ActiveRecord 与 ORM 层

### 模式 6：Relation 链式惰性求值

**问题场景**：传统 ORM `User.where(x).order(y).limit(10)` 立即执行 SQL，多次调用浪费。ActiveRecord 用 `Relation` 对象延迟到 `to_a`/`each`/`count` 时一次性编译。

**解决方案代码**：

```ruby
# activerecord/lib/active_record/relation.rb
class Relation
  def where(opts = :chain, **rest)
    return self if opts == :chain  # 链式调用优化：直接 spawn
    spawn.tap { |r| r.where_clause += opts }
  end

  def order(*args)
    spawn.tap { |r| r.order_clause += args }
  end

  def limit(n)
    spawn.tap { |r| r.limit_value = n }
  end

  def spawn
    self.class.new(@klass, values: @values.dup, ...).tap { |r| ... }  # 返回新对象
  end
end

# 用法：链式不执行
relation = User.where(active: true).order(:name).limit(10)
# 这时还是 Relation 对象，没有 SQL 执行

# 终端触发：
relation.to_a    # 此时编译 SQL: SELECT * FROM users WHERE active = TRUE ORDER BY name LIMIT 10
relation.count   # 编译另一条: SELECT COUNT(*) FROM users WHERE active = TRUE
```

**关键参数表**：

| 方法 | 是否触发 SQL | 触发哪条 SQL |
|---|---|---|
| `where` / `order` / `limit` / `offset` | 否 | 累积到 values |
| `joins` / `includes` / `preload` | 否 | 累积到 values |
| `to_a` / `each` / `map` | 是 | 完整 SELECT |
| `count` / `sum` / `maximum` | 是 | 聚合函数 |
| `exists?` / `any?` / `none?` | 是 | LIMIT 1 / COUNT 1 |
| `first` / `last` / `take` | 是 | LIMIT 1 + ORDER |
| `find(id)` | 是 | WHERE id = ? |

**最佳实践列表**：
- `User.where(...)` 是惰性的——多次 chain 不执行，链式组合完全自由
- `spawn` 返回新 Relation——保证 `where` 不污染原 relation（不可变链）
- 用 `to_sql` 调试：`User.where(x).to_sql` 打印即将执行的 SQL
- `merge` 用于合并两个 Relation——共享 conditions / order
- 终端方法（`to_a` / `count`）触发 SQL——避免在 view 层调用导致 N+1

### 模式 7：Arel SQL 构造器（AST 编译）

**问题场景**：传统 ORM 用字符串拼接 SQL（`"SELECT * FROM users WHERE age > #{age}"`），有注入风险且数据库方言难处理。Arel 把 SQL 表达为 AST（抽象语法树），由 visitor 翻译为方言。

**解决方案代码**：

```ruby
# activerecord/lib/active_record/relation/query_methods.rb
def build_arel
  arel = klass.unscoped.arel_table  # 拿到表 AST
  arel = arel.where(build_where_clause)  # 累积 WHERE
  arel = arel.order(build_order_clause)  # 累积 ORDER BY
  arel = arel.take(build_limit) if limit_value  # 累积 LIMIT
  arel
end

# Arel 节点
users_table = User.arel_table
condition = users_table[:age].gt(18).and(users_table[:active].eq(true))
# 编译为: WHERE "users"."age" > 18 AND "users"."active" = TRUE
```

**关键参数表**：

| Arel 节点 | SQL 表达 | 例子 |
|---|---|---|
| `users_table[:age]` | 列引用 | `"users"."age"` |
| `.gt(18)` / `.lt(18)` | `> 18` / `< 18` | 大于小于 |
| `.eq(x)` / `.not_eq(x)` | `= x` / `!= x` | 等于不等 |
| `.in([1,2,3])` | `IN (1, 2, 3)` | 包含 |
| `.matches('%a%')` | `LIKE '%a%'` | 模糊匹配 |
| `.and(other)` / `.or(other)` | `AND` / `OR` | 复合条件 |

**最佳实践列表**：
- Arel 自动防注入——所有值都用绑定变量，不用字符串拼接
- Arel 是内部 API——业务代码用 `where` / `update_all`，不要直接 `arel`
- 数据库方言由 Arel visitor 处理——同一份 Arel 在 PG/MySQL/SQLite 输出不同 SQL
- `where("name LIKE ?", "%#{x}%")` 用绑定变量——`where("name LIKE '%#{x}%'")` 注入风险

### 模式 8：适配器模式（数据库方言抽象）

**问题场景**：ActiveRecord 要支持 5+ 数据库（PostgreSQL、MySQL、SQLite、Trilogy、Abstra），每种数据库的 SQL 方言、数据类型、事务隔离级别都不同。需要把"通用 SQL 概念"映射到"具体数据库方言"。

**解决方案代码**：

```ruby
# activerecord/lib/active_record/connection_adapters/abstract_adapter.rb
class AbstractAdapter
  def select_all(sql, name = nil, binds = [])
    # 通用协议：子类必须实现
  end

  def begin_db_transaction
    # 默认实现，子类可 override
  end
end

# 具体适配器：postgresql_adapter.rb
class PostgreSQLAdapter < AbstractAdapter
  def exec_query(sql, name = 'SQL', binds = [], prepare: false)
    with_connection do |conn|
      # PostgreSQL 特有：参数化用 $1, $2...
      stmt = conn.prepare(sql)
      result = stmt.exec(binds.map { |b| b.value })
      ActiveRecord::Result.new(result.fields, result.values)
    end
  end

  def supports_index_sort_order?  # PG 支持
    true
  end
end

# 用法：connection_handler 选 adapter
ActiveRecord::Base.establish_connection(
  adapter: 'postgresql',
  host: 'localhost',
  database: 'mydb',
)
```

**关键参数表**：

| 数据库 | adapter 名 | gem 依赖 |
|---|---|---|
| PostgreSQL | `postgresql` | `pg` |
| MySQL | `mysql2` / `trilogy` | `mysql2` / `trilogy` |
| SQLite | `sqlite3` | `sqlite3` |
| 抽象层 | `abstract` | 测试用 |

`config/database.yml` 多数据库配置：

```yaml
production:
  adapter: postgresql
  primary:
    database: myapp
  replica:
    database: myapp
    replica: true  # 标记为只读副本
```

**最佳实践列表**：
- 业务代码永远用通用 API（`where` / `find`）——不直接调 `connection.execute`
- `trilogy` 是 7.1+ 默认 MySQL 适配器——比 `mysql2` 更快
- PG 特有类型（`hstore` / `jsonb` / `array`）需在 model 显式声明——不靠约定
- 多数据库（primary + replica + analytics）在 7.1+ 是 first-class——用 `connects_to`

### 模式 9：Migration 版本化 Schema

**问题场景**：团队协作时 schema 变更（加列、建索引）需要顺序记录、回滚、合并——传统 SQL 脚本无法追溯"谁、什么时候、改了什么"。

**解决方案代码**：

```ruby
# db/migrate/20240115000000_add_email_to_users.rb
class AddEmailToUsers < ActiveRecord::Migration[8.0]
  def change
    # change 方法：Rails 自动判断 up/down
    add_column :users, :email, :string
    add_index :users, :email, unique: true

    # 不可逆操作用 up/down 显式
    # def up
    #   execute "ALTER TABLE users ADD COLUMN ..."
    # end
    # def down
    #   execute "ALTER TABLE users DROP COLUMN ..."
    # end
  end
end

# 运行
bin/rails db:migrate         # 应用所有未执行的 migration
bin/rails db:rollback STEP=1 # 回滚最近一个
bin/rails db:migrate:status  # 查看状态：up / down
```

**关键参数表**：

| 迁移方法 | 用途 | 是否可逆 |
|---|---|---|
| `add_column` / `remove_column` | 加/删列 | 是 |
| `add_index` / `remove_index` | 加/删索引 | 是 |
| `add_reference` / `remove_reference` | 加/删外键列 | 是 |
| `create_table` / `drop_table` | 建/删表 | 是 |
| `execute "SQL"` | 原生 SQL | 否（需显式 up/down） |
| `change_column` | 修改列 | 视操作而定 |
| `add_check_constraint` | 加 CHECK 约束 | 是 |

`schema_migrations` 表：记录已执行 migration 版本号

**最佳实践列表**：
- 永远不要改已 merge 的 migration——新加一个 migration
- `change` 方法优先——让 Rails 自动 reverse；不可逆用 `up` / `down`
- `db/schema.rb` 是当前 schema 的"权威快照"——`db:migrate` 不会重跑已应用的
- 团队 dev 环境用 `db:reset` 重置；CI 用 `db:test:prepare` 准备测试库
- 大表加列用 `add_column ... :default, then: :background_migration` 避免锁表

### 模式 10：关联与 N+1 查询防护

**问题场景**：视图层遍历 `user.posts` 时，如果每条 post 都触发一次 SQL 查询，100 个用户就是 101 次 SQL。N+1 是 ORM 性能头号杀手。

**解决方案代码**：

```ruby
# has_many 关联定义
class User < ApplicationRecord
  has_many :posts
  has_many :comments, through: :posts
end

# 危险：触发 N+1
User.all.each { |u| puts u.posts.size }  # 1 + N 次 SQL

# 解决：includes 预加载
User.includes(:posts).each { |u| puts u.posts.size }
# SQL 1: SELECT * FROM users
# SQL 2: SELECT * FROM posts WHERE user_id IN (1,2,3,...)

# preload vs eager_load 区别：
User.preload(:posts)        # 2 条 SQL（IN 查询）
User.eager_load(:posts)     # 1 条 SQL（LEFT JOIN，可过滤 posts）
User.includes(:posts)       # Rails 自动选：能 IN 就 IN，否则 JOIN
```

**关键参数表**：

| 方法 | SQL 策略 | 适用场景 |
|---|---|---|
| `preload` | 2 条独立 SQL + IN | 简单关联，无过滤 |
| `eager_load` | 1 条 LEFT JOIN | 需要 `where('posts.x = ?')` 过滤 |
| `includes` | Rails 自动选 | 默认选择 |
| `references` | 强制 JOIN | `includes(:posts).where(posts: {x: 1})` |

`strict_loading` 模式（7.0+）：

```ruby
User.strict_loading.includes(:posts)  # 强制预加载，禁止 lazy 触发 N+1
```

**最佳实践列表**：
- 默认开 `config.active_record.strict_loading_by_default = true`——所有查询 strict
- 视图层用 `bullet` gem 检测 N+1——CI 失败 = 阻断 merge
- `includes` 嵌套层级不超过 2 层——`includes(:posts, :posts => :comments)` 即可，3 层会爆
- 多态关联（`has_many :images, as: :imageable`）必须 `preload`——`eager_load` SQL 复杂
- 计数用 `counter_cache`——避免每次 `posts.size` 都 SQL

---

## 三、ActionPack 与请求响应链路

### 模式 11：Rack 中间件栈（洋葱模型）

**问题场景**：Web 框架需要"日志、Cookie、Session、CSRF、CORS"等横切关注点。传统做法是把这些逻辑写死在 framework 内部，无法按需开关。

**解决方案代码**：

```ruby
# config/application.rb
config.middleware.use Rack::Attack              # 限流
config.middleware.insert_before 0, Rack::Cors  # 最先执行的 CORS
config.middleware.delete ActionDispatch::Cookies  # 不需要 Cookie？

# 完整中间件栈（默认顺序，从外向内）：
# 1. ActionDispatch::HostAuthorization   # 域名白名单
# 2. Rack::Sendfile                      # 静态文件
# 3. ActionDispatch::Static              # public/
# 4. ActionDispatch::Executor            # dev reload
# 5. ActiveSupport::Cache::Strategy::LocalCache::Middleware  # 内存缓存
# 6. Rack::Runtime                       # X-Runtime header
# 7. Rack::MethodOverride                # _method=patch 转 PATCH
# 8. ActionDispatch::RequestId           # X-Request-Id
# 9. ActionDispatch::RemoteIp            # 真实 IP
# 10. Sprockets::Middleware / Propshaft  # 静态资源管道
# 11. ActionDispatch::Callbacks          # before/after callback
# 12. ActionDispatch::Cookies            # Cookie 解析
# 13. ActionDispatch::Session::CookieStore  # Session 存储
# 14. ActionDispatch::Flash              # flash 消息
# 15. Rack::Head                         # HEAD 请求
# 16. Rack::ConditionalGet               # ETag / 304
# 17. Rack::ETag                         # ETag
# 18. ActionDispatch::PermissionsPolicy  # 权限策略头
# 19. ActionDispatch::Csp                # CSP
# 20. ActionDispatch::Reloader           # dev 模式代码 reload
# 21. ActionDispatch::RequestDebugger    # dev debug 页
# 22. ActionDispatch::ShowExceptions     # 异常处理
# 23. ActionDispatch::DebugExceptions    # dev 异常页
# 24. ActionDispatch::ActionableExceptions  # 自定义异常
# 25. ActionDispatch::Callbacks          # 路由前 callback
# 26. ActionDispatch::Cookies            # 响应 Set-Cookie
# 27. ActionDispatch::ContentSecurityPolicy::Middleware
# 28. ActionDispatch::PermissionsPolicyMiddleware
# 29. ActionDispatch::ReferrerPolicy
# 30. Rails::Rack::Logger                # 请求日志
# 31. ActionDispatch::RequestId          # X-Request-Id 注入日志
# 32. ActionDispatch::RemoteIp
# 33. Rails::EngineController            # mount
# 34. ActionDispatch::Routing            # 路由 dispatch
# 35. ...user middleware...
```

**关键参数表**：

| 操作 | 用途 | 例子 |
|---|---|---|
| `use` | 在末尾追加 | `config.middleware.use MyMW` |
| `insert_before` | 在某个 MW 前插入 | `config.middleware.insert_before 0, Cors` |
| `insert_after` | 在某个 MW 后插入 | `config.middleware.insert_after Cookies, MyMW` |
| `delete` | 移除某个 MW | `config.middleware.delete Cookies` |
| `move_before` / `move_after` | 移动 | `config.middleware.move_before Cookies, MyMW` |
| `swap` | 替换 | `config.middleware.swap Cookies, MyCookies` |

**最佳实践列表**：
- 用 `bin/rails middleware` 列出当前栈——比读配置清楚
- 自定义中间件按"横切关注点"维度思考——日志/认证/CORS/限流
- 不要在中间件里写业务逻辑——保持 middleware 通用
- `bin/rails middleware | grep Cookie` 调试 cookie 处理
- 中间件位置很重要——`insert_before 0, MyMW` 最先执行

### 模式 12：Routing DSL（RESTful 资源）

**问题场景**：URL 与 controller 方法需要"双向"——既要从 URL 找到 action，也要从 action 生成 URL。传统框架把 URL 模板硬编码在 controller 注解里，URL 变了 action 没变，导致断链。

**解决方案代码**：

```ruby
# config/routes.rb
Rails.application.routes.draw do
  root 'home#index'

  # 命名空间：/api/v1/...
  namespace :api do
    namespace :v1 do
      resources :users do
        member do
          post :ban   # POST /api/v1/users/:id/ban
        end
        collection do
          get :search # GET /api/v1/users/search
        end
      end
    end
  end

  # 嵌套：/users/:user_id/posts/:id
  resources :users do
    resources :posts, only: [:index, :show, :create]
  end

  # 约束：HTTP method + 路径参数
  get 'posts/:id', to: 'posts#show', constraints: { id: /\d+/ }

  # 显式自定义
  get 'login', to: 'sessions#new', as: :login
end

# 命名路由 helper 自动生成：
api_v1_user_path(@user)     # /api/v1/users/42
api_v1_user_url(@user)      # http://localhost:3000/api/v1/users/42
```

**关键参数表**：

| DSL | URL 模式 | 例子 |
|---|---|---|
| `get '/users', to: 'users#index'` | 一对一 | `users_path` |
| `resources :users` | 7 端点 | `users_path` / `user_path(id)` |
| `resource :profile` | 单数（无 :id） | `profile_path` |
| `namespace :admin` | 路径 + controller 命名空间 | `admin_users_path` |
| `scope path: 'v1', module: 'api'` | 路径前缀 + 命名空间 | 保留 controller 名字 |
| `mount Blorgh::Engine => '/blorgh'` | 挂载引擎 | Rack app |

**最佳实践列表**：
- 默认用 `resources`——4 行定义 7 端点 + URL helper
- `only:` / `except:` 显式声明路由——避免暴露 `destroy` 给不必要的地方
- `constraints: { id: /\d+/ }` 防止字符串 ID 误路由
- API 用 `namespace :api { namespace :v1 }` 路径版本化——URL 稳定
- 自定义路由用 `as: :xxx` 定义 helper——比 `url_for(controller:..., action:...)` 易读

### 模式 13：Controller 生命周期（before_action 钩子）

**问题场景**：每个 action 都需要"加载用户、鉴权、限流"等前置检查——传统做法是每个 action 头部复制粘贴，违反 DRY。

**解决方案代码**：

```ruby
class UsersController < ApplicationController
  before_action :authenticate_user!         # 全部 action
  before_action :load_user, only: [:show, :edit, :update, :destroy]
  before_action :authorize_admin!, only: [:destroy]
  after_action  :log_action
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found

  def show
    # @user 已由 load_user 设置
  end

  def destroy
    @user.destroy
    redirect_to users_path, notice: 'Deleted'
  end

  private

  def load_user
    @user = User.find(params[:id])
  end

  def authorize_admin!
    raise Forbidden unless current_user.admin?
  end
end
```

**关键参数表**：

| 钩子 | 时机 | 用途 |
|---|---|---|
| `before_action` | action 执行前 | 鉴权、加载资源、限流 |
| `after_action` | action 执行后 | 日志、清理、响应包装 |
| `around_action` | action 包裹 | 计时、事务 |
| `rescue_from` | 异常处理 | 统一错误响应 |

作用域：
- `before_action :xxx` — 所有 action
- `before_action :xxx, only: [...]` — 限定 action
- `before_action :xxx, except: [...]` — 排除
- `before_action :xxx, if: :condition_method` — 条件

**最佳实践列表**：
- `before_action` 顺序敏感——鉴权先于加载资源
- `current_user` 在 `ApplicationController` 中定义为 helper_method——view 层也能用
- `rescue_from` 在父类定义——子类继承，所有 controller 都有统一错误处理
- 用 `prepend_before_action` 把鉴权钩子推到最前——避免被其他 before_action 跳过
- `after_action` 不要写慢逻辑——会拖慢响应

### 模式 14：ActionView ERB 编译（模板 → Ruby 代码）

**问题场景**：模板引擎需要在"易写"（HTML+ERB）和"高性能"（编译为 Ruby 代码）之间平衡。早期 ERB 运行时解析慢，Rails 编译为 Ruby 后再 `eval`。

**解决方案代码**：

```erb
<%# app/views/users/show.html.erb %>
<h1><%= @user.name %></h1>
<% if @user.posts.any? %>
  <ul>
  <% @user.posts.each do |post| %>
    <li><%= link_to post.title, post %></li>
  <% end %>
  </ul>
<% end %>
```

编译为（缓存到 `tmp/cache/`）：

```ruby
# 编译产物（伪代码）
@output_buffer = output_buffer || ActionView::OutputBuffer.new
@output_buffer.append = '<h1>'
@output_buffer.append = ERB::Util.html_escape(@user.name)  # 自动转义
@output_buffer.append = '</h1>'
if @user.posts.any?
  @output_buffer.append = '<ul>'
  @user.posts.each do |post|
    @output_buffer.append = '<li>'
    @output_buffer.append = ERB::Util.html_escape(link_to(post.title, post))
    @output_buffer.append = '</li>'
  end
  @output_buffer.append = '</ul>'
end
@output_buffer.to_s
```

**关键参数表**：

| 模板类型 | handler | 用途 |
|---|---|---|
| `.html.erb` | `ERB` | 默认 HTML 模板 |
| `.html.haml` | `Haml` | 缩进式语法 |
| `.html.slim` | `Slim` | 极简语法 |
| `.json.jbuilder` | `Jbuilder` | JSON 输出 |
| `.text.erb` | `ERB` | 纯文本 |
| `.xml.builder` | `Builder` | XML 输出 |

**最佳实践列表**：
- 模板里用 `link_to` / `form_with` / `text_field` helper——而不是手写 `<a href>`
- `link_to(@user.name, @user)` 自动生成 `<a href="/users/42">name</a>`——URL helper 永远对
- `<%= %>` 自动 HTML 转义；`<%== %>` 原文输出（XSS 风险）——避免
- 局部模板（`_form.html.erb`）用 `render 'form', user: @user` 复用
- `cache 'key' do ... end` 缓存模板片段——5x 性能提升

### 模式 15：Strong Parameters（白名单防护）

**问题场景**：传统 Rails model 用 `attr_accessible` 白名单——把"允许批量赋值的字段"写在 model 层。但 model 知道"哪些字段可被外部修改"是反模式（model 应该只管数据）。

**解决方案代码**：

```ruby
class UsersController < ApplicationController
  def create
    # 旧 API（v3.2 之前）：User.new(params[:user])  # 危险
    # 新 API（v4+）：必须显式 permit
    @user = User.new(user_params)
    if @user.save
      redirect_to @user
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def user_params
    params.require(:user).permit(:name, :email, :role)  # 白名单
  end
end

# 嵌套参数也支持
def post_params
  params.require(:post).permit(:title, :body, tags: [], comments: [:body, :author_id])
end
```

**关键参数表**：

| `permit` 形式 | 含义 |
|---|---|
| `permit(:name)` | 标量字段 |
| `permit(tags: [])` | 数组字段 |
| `permit(comments: [:body])` | 嵌套对象字段 |
| `permit(:avatar_blob_id)` | ActiveStorage 关联 |
| `permit!` | 全部允许（**危险**） |

**最佳实践列表**：
- 永远用 Strong Parameters——`params.permit(...)` 在 controller 层
- 不要 `permit!`——`MassAssignment` 漏洞就是这个引起的
- 嵌套参数显式 `permit(tags: [], comments: [...])`——避免深层参数意外通过
- 关联 ID 用 `permit(user_ids: [])` 显式声明——不声明则被过滤
- `params.require(:user)` 缺失时抛 `ActionController::ParameterMissing`——友好 400 响应

---

## 四、工程实践与现代演进

### 模式 16：Hotwire（Turbo + Stimulus）前后端融合

**问题场景**：传统 SPA（React/Vue）需要"前后端分离 + API + 状态管理"，但 80% 的页面是"列表 + 表单 + 详情"，不需要 SPA。Hotwire 用 HTML over the wire 思路减少 JS。

**解决方案代码**：

```erb
<%# app/views/posts/index.html.erb %>
<%= turbo_frame_tag "posts" do %>
  <%= render @posts %>
  <%= link_to "Next", posts_path(page: @next_page), data: { turbo_frame: "posts" } %>
<% end %>

<%# app/views/posts/_post.html.erb %>
<article id="<%= dom_id(post) %>">
  <h3><%= post.title %></h3>
  <%= link_to "View", post, data: { turbo_frame: "_top" } %>
</article>
```

```javascript
// app/javascript/controllers/hello_controller.js
import { Controller } from "@hotwired/stimulus"
export default class extends Controller {
  static targets = [ "name", "output" ]
  greet() { this.outputTarget.textContent = `Hello, ${this.nameTarget.value}!` }
}
```

**关键参数表**：

| Hotwire 子库 | 职责 | 用途 |
|---|---|---|
| `Turbo Drive` | 拦截链接 + 表单，整页替换 | 默认开启，所有链接自动加速 |
| `Turbo Frames` | 局部页面片段更新 | "下一页"列表、表单内嵌 |
| `Turbo Streams` | WebSocket 推送 DOM 变更 | 实时通知、协同编辑 |
| `Stimulus` | 渐进增强的 JS 控制器 | 表单验证、模态框、动画 |

**最佳实践列表**：
- Hotwire 是 7.0+ 默认——`rails new` 自动包含
- `turbo_frame_tag` 包裹"会局部更新的区域"——服务端返回 HTML 片段
- Stimulus 用于"必须有 JS 的交互"——表单提交、复制按钮等
- 大型 SPA 不适合 Hotwire——继续用 React/Vue
- Turbo Streams + ActionCable 组合实现实时推送——零额外前端代码

### 模式 17：importmap（告别 Node）

**问题场景**：Rails 6 默认用 Webpacker 管 JS——开发者必须装 Node/Yarn/webpack，构建链臃肿。Rails 7 用 importmap + ESM，让浏览器原生处理 `<script type="module">`。

**解决方案代码**：

```ruby
# config/importmap.rb
pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js", preload: true
pin "@hotwired/stimulus", to: "stimulus.min.js", preload: true
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js", preload: true
pin_all_from "app/javascript/controllers", under: "controllers"
```

```erb
<%# app/views/layouts/application.html.erb %>
<%= javascript_importmap_tags %>
<%# 编译为: <script type="importmap">{...}</script><script type="module">import "application"</script> %>
```

```json
// config/importmap.json
{
  "imports": {
    "application": "/assets/application-abc123.js",
    "@hotwired/turbo-rails": "/assets/turbo.min-xyz789.js"
  }
}
```

**关键参数表**：

| 资产管道 | 引入版本 | 用途 |
|---|---|---|
| Sprockets | 经典 | 编译 CSS / JS / 图片 |
| Webpacker | 6.0 | JS 模块化（已弃用） |
| importmap + Propshaft | 7.0+ / 8.0+ | 浏览器原生 ESM |

**最佳实践列表**：
- `rails new` 默认 importmap + Propshaft——告别 Node
- 第三方 JS 用 `pin "package-name", to: "cdn-url"` 引入——npm install 可选
- 业务 JS 放 `app/javascript/`——按 controller 组织
- 复杂场景仍可 `jsbundling-rails` 引入 esbuild/Vite——importmap 不强制
- Propshaft 是 8.0 默认静态资源管道——比 Sprockets 简单，无 digest 默认

### 模式 18：ActionCable（WebSocket 抽象）

**问题场景**：实时功能（聊天、通知、协同）需要 WebSocket 持久连接。但 WebSocket 协议复杂（鉴权、断线重连、订阅管理），业务代码不想关心。

**解决方案代码**：

```ruby
# app/channels/chat_channel.rb
class ChatChannel < ApplicationCable::Channel
  def subscribed
    stream_from "chat_#{params[:room_id]}"
  end

  def speak(data)
    ActionCable.server.broadcast("chat_#{params[:room_id]}", {
      user: current_user.name,
      body: data['body'],
      time: Time.current,
    })
  end
end

# app/jobs/chat_broadcast_job.rb
class ChatBroadcastJob < ApplicationJob
  queue_as :default
  def perform(message)
    ActionCable.server.broadcast("chat_#{message.room_id}", message)
  end
end
```

```javascript
// app/javascript/channels/chat_channel.js
import consumer from "./consumer"
consumer.subscriptions.create({ channel: "ChatChannel", room_id: 1 }, {
  received(data) { this.appendLine(data) },
  speak(body) { return this.perform('speak', { body }) }
})
```

**关键参数表**：

| 适配器 | 用途 | 例子 |
|---|---|---|
| `async` (默认) | 进程内 pub/sub | dev / 单机 |
| `redis` | Redis pub/sub | 多进程 / 多机 |
| `postgresql` | PG LISTEN/NOTIFY | 已用 PG 基础设施 |
| `solid_cable` | 8.0+ 数据库 pub/sub | 零依赖 |

**最佳实践列表**：
- `stream_from "chat_#{room_id}"` 用模板字符串做频道——订阅粒度细
- 业务逻辑放 `perform` 调用的 Job——频道方法应薄
- 鉴权在 `subscribed` 钩子——`reject` 拒绝订阅
- 生产用 `redis` 或 `solid_cable`——`async` 适配器进程间不通
- 8.0+ 默认 Solid Cable——用数据库当 pub/sub 后端，零依赖

### 模式 19：ActiveStorage 与 ActionText（资产与富文本）

**问题场景**：图片上传 + 富文本编辑是 SaaS 产品刚需——但每个项目都重新实现"上传到 S3 + 生成缩略图 + URL 签名"是浪费。

**解决方案代码**：

```ruby
# ActiveStorage：用户头像上传
class User < ApplicationRecord
  has_one_attached :avatar
end

# View
<%= image_tag @user.avatar.variant(resize: "200x200") %>

# Controller
def update
  @user.avatar.attach(params[:user][:avatar])
  # 自动上传到 config/storage.yml 配置的 S3 / GCS / Azure
end
```

```ruby
# ActionText：富文本（Trix 编辑器）
class Post < ApplicationRecord
  has_rich_text :content
end

# View
<%= form_with model: @post do |f| %>
  <%= f.rich_text_area :content %>
<% end %>

<%= @post.content %>  # 自动渲染富文本 + 嵌入图片
```

**关键参数表**：

| 服务 | 适配器 | 配置项 |
|---|---|---|
| S3 | `amazon` | `access_key_id` / `secret_access_key` / `region` / `bucket` |
| GCS | `google` | `credentials` / `project` / `bucket` |
| Azure | `microsoft` | `storage_account_name` / `storage_access_key` / `container` |
| 本地 | `local` | `service: Disk` |
| 镜像 | `mirror` | 主 + 备服务 |

**最佳实践列表**：
- `has_one_attached` 单文件；`has_many_attached` 多文件——自动建表
- 用 `variant(resize: "200x200")` 生成缩略图——自动 lazy + 缓存
- 大文件用 `direct_upload: true` 走前端直传——避免服务器中转
- `config/storage.yml` 区分 development（local）+ production（amazon）——不同环境
- ActionText 自动存 Trix 编辑器内容 + 嵌入图——用 `has_rich_text` 一行启用

### 模式 20：Solid Queue / Solid Cache / Solid Cable（数据库作基础设施）

**问题场景**：传统 Rails 部署需要 Sidekiq（Redis）、Redis Cache、Redis Pub/Sub——基础设施多、运维复杂。Rails 8.0 用 PostgreSQL/MySQL/SQLite 当这些基础设施后端，零依赖。

**解决方案代码**：

```ruby
# Gemfile (Rails 8 默认)
gem 'solid_queue'   # 数据库作队列
gem 'solid_cache'   # 数据库作缓存
gem 'solid_cable'   # 数据库作 WebSocket pub/sub
```

```ruby
# config/database.yml
production:
  primary:
    database: myapp_primary
  queue:
    database: myapp_queue    # Solid Queue 专用库
  cache:
    database: myapp_cache    # Solid Cache 专用库
  cable:
    database: myapp_cable    # Solid Cable 专用库
```

```ruby
# ActiveJob 仍然用同一个 API——后端自动选 Solid Queue
class MyJob < ApplicationJob
  queue_as :default
  def perform(args)
    # ...
  end
end

MyJob.perform_later(args)  # 入 Solid Queue 队
```

**关键参数表**：

| 组件 | 替代传统 | 优势 |
|---|---|---|
| `solid_queue` | Sidekiq + Redis | 零 Redis 依赖，事务一致性 |
| `solid_cache` | Redis / Memcached | 复用数据库备份、监控 |
| `solid_cable` | Redis pub/sub | 零 Redis 依赖 |

数据库连接池（默认）：
- `pool: 5` for primary
- `pool: 5` for queue
- 独立库 = 独立连接池 = 互不干扰

**最佳实践列表**：
- 8.0+ `rails new` 默认带 Solid 系列——无需额外配置
- Solid Queue 事务一致性：`User.transaction { User.create!; MyJob.perform_later }`——Job 与 DB 事务原子
- Solid Cache 用单独库——避免主库 IO 压力
- 单机或小团队用 Solid 足够；大流量（10k+ req/s）切回 Redis
- 监控用 Rails 8 新增的 `mission_control` gem——Job / Cable / Cache 状态面板

---

## 附：仓库元信息

- **路径**：`G:\实战案例\GitHub顶尖项目\rails\`
- **大小**：约 638MB（含 git 历史）
- **总文件**：~14000
- **子 gem**：11 个（activesupport/activemodel/activerecord/actionpack/actionview/activejob/actionmailer/actioncable/activestorage/actionmailbox/actiontext + railties）
- **锁定 commit**：v8.0（2024+）
- **学习入口**：先读 `activesupport` core_ext → `activerecord` Relation / Arel → `actionpack` routing → `actionview` ERB handler → `railties` application 拼装

## 一句话总结

Rails 用 6+1 子 gem 模型 + Arel/Relation 惰性求值 + Convention over Configuration 三大支柱，定义了"web 框架该有的样子"。核心洞察：把"通用框架"拆成可独立 gem 发布的子包，让 ActiveRecord 可被 Sinatra 单独复用；用 DSL Builder 让 routes.rb 4 行定义 7 端点；用元编程让字段名变化时所有查询自动适配；8.0 用 Solid Queue/Cache/Cable 让数据库当基础设施后端，告别 Sidekiq + Redis 运维负担。
