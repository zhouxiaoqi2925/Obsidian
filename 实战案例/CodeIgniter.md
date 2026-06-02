# CodeIgniter - 极简PHP框架

**来源**：GitHub bcit-ci/CodeIgniter (18k+ stars)
**创建时间**：2026-06-02

---

## 一、核心机制（Core Mechanics）

### 1. 单例注册表（Registry + `&` Reference）

**问题场景**：PHP 4 时代没有 namespace、没有 PSR-11 Container，但框架又需要 18 个核心类（Router/Loader/Input/Output/Database/Session…）在任意位置复用同一实例。手写 Container 太重，全局变量又难管理。CodeIgniter 用 5 行代码实现了一个"伪 DI 容器"。

**解决方案**：
```php
// system/core/Common.php
function &load_class($class, $directory = 'libraries', $param = NULL)
{
    static $_classes = array();

    // 已加载则直接返回引用
    if (isset($_classes[$class]))
    {
        return $_classes[$class];
    }

    // 探测候选路径
    $name = FALSE;
    foreach (array(APPPATH, BASEPATH) as $path)
    {
        if (file_exists($path.$directory.'/'.$class.'.php'))
        {
            $name = 'CI_'.$class;
            if (class_exists($name, FALSE) === FALSE)
            {
                require_once($path.$directory.'/'.$class.'.php');
            }
            break;
        }
    }

    // 关键：& 引用赋值，保证所有调用方拿到同一对象
    $_classes[$class] = isset($param)
        ? new $name($param)
        : new $name();

    return $_classes[$class];
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| `$class` | 字符串类名 | 不带前缀，自动加 `CI_` |
| `$directory` | `libraries` / `core` / `helpers` | 决定在哪找类文件 |
| `$param` | `NULL` | 构造参数，多数核心类忽略 |
| `static $_classes` | 全局静态 | 进程内单例，跨请求隔离 |

**最佳实践**：
1. ✅ 不要在用户态用 `new CI_Db()`——永远走 `load_class` 才能共享连接
2. ✅ `&` 引用赋值是关键，去掉 `&` 会导致单例失败（PHP 5+ 默认对象传引用，但显式 `&` 文档化意图）
3. ✅ 测试时要重置 `$_classes` 数组，否则 mock 不生效
4. ✅ `load_class` 的 fallback 顺序：先 `APPPATH`（用户覆盖），后 `BASEPATH`（系统核心）
5. ✅ CI4 改用 `Container` + PSR-11，但 CI3 的 Registry 仍可借鉴到 2000 行内的微型框架

### 2. 前控制器生命周期（CodeIgniter.php 510行编排）

**问题场景**：CI3 启动 18 个核心类的顺序是有讲究的——Output 必须在 Input 之前加载（让缓存可提前 `exit`）、Router 必须在 Hooks 之后（让用户能改路由）、Config 必须最先（被所有类读取）。这 510 行不能乱。

**解决方案**：
```php
// system/core/CodeIgniter.php 核心加载顺序
$BM  =& load_class('Benchmark', 'core');
$CFG =& load_class('Config', 'core');
$EXT =& load_class('Hooks', 'core');
$UNI =& load_class('Utf8', 'core');
$URI =& load_class('URI', 'core');
$RTR =& load_class('Router', 'core');
$OUT =& load_class('Output', 'core');   // ← 关键：Output 在 Input 前
$SEC =& load_class('Security', 'core'); // Input 依赖 Security
$IN  =& load_class('Input', 'core');
$LANG =& load_class('Lang', 'core');

// 钩子：可在此改变所有后续行为
$EXT->call_hook('pre_system');

// 缓存命中检查（在 Input 前就 exit）
if ($EXT->call_hook('cache_override') === FALSE
    && $OUT->_display_cache($CFG, $URI) === TRUE)
{
    exit;
}

// 钩子：可在此替换 Controller
$EXT->call_hook('pre_controller');
$class  = $RTR->fetch_class();
$method = $RTR->fetch_method();
$CI = new $class();
call_user_func_array(array(&$CI, $method), array_slice($URI->rsegments, 2));
$OUT->_display();
```

**关键参数**：

| 钩子点 | 触发时机 | 典型用途 |
|---|---|---|
| `pre_system` | 系统初始化后、缓存检查前 | 强制 HTTPS、全局过滤 |
| `pre_controller` | Controller 实例化前 | 权限校验、A/B 测试路由 |
| `post_controller_constructor` | Controller 构造后、方法前 | DI 注入、横切关注点 |
| `post_controller` | 方法执行后 | 日志、性能上报 |
| `display_override` | `_display()` 渲染前 | 主题切换、模板替换 |
| `cache_override` | 缓存判断时 | 自定义缓存后端 |
| `post_system` | 最终输出后 | 请求结束清理 |

**最佳实践**：
1. ✅ 5 个核心类（BM/CFG/EXT/UNI/URI）的顺序不能变——它们是其他类的前置依赖
2. ✅ Output 在 Input 之前是设计精髓：缓存命中时跳过 Security/Input 加载
3. ✅ `pre_controller` 是改写 controller 行为的最佳钩子（比 middleware 早 8 年）
4. ✅ 用 `display_override` 钩子集成第三方模板引擎（Smarty/Twig）
5. ✅ 不要在 `pre_system` 里做耗时 IO（会拖慢所有请求）

### 3. ENVIRONMENT 双层配置（12-Factor早期实现）

**问题场景**：开发、测试、生产环境的数据库密码、API Key、SMTP 主机都不同，但代码只有一套。最朴素的做法是 `if (ENV == 'production')` 散落在各配置里，CI3 用 **目录级双层覆盖** 实现"零运行时分支"。

**解决方案**：
```php
// application/config/database.php
$db['default'] = array(
    'dsn'      => '',
    'hostname' => 'localhost',
    'username' => 'root',
    'password' => '',
    'database' => 'myapp_dev',
    'dbdriver' => 'mysqli',
    'db_debug' => TRUE,
);

// application/config/production/database.php  ← 自动覆盖
$db['default'] = array(
    'hostname' => 'db.prod.internal',
    'username' => 'app_writer',
    'password' => getenv('DB_PASSWORD'),  // 从环境变量取
    'database' => 'myapp_prod',
    'dbdriver' => 'mysqli',
    'db_debug' => FALSE,                   // 生产关 debug
    'cache_on' => TRUE,
    'cachedir' => '/var/cache/ci/',
);
```

加载逻辑（在 `CodeIgniter.php` 和 `Router.php` 都用）：
```php
// 双层覆盖
if (file_exists(APPPATH.'config/'.$argv[1].'/database.php')) {
    include(APPPATH.'config/'.$argv[1].'/database.php');
}
if (file_exists(APPPATH.'config/database.php')) {
    include(APPPATH.'config/database.php');
}
```

**关键参数**：

| 环境常量 | 来源 | 覆盖范围 |
|---|---|---|
| `ENVIRONMENT` | `index.php` 中 `define('ENVIRONMENT', $_SERVER['CI_ENV'])` | 全局 |
| `$assign_to_config` | `index.php` 数组 | 启动时一次性覆盖 |
| `config/ENVIRONMENT/*.php` | 目录 | 任何 config 都可以有环境版 |
| `.env` | getenv() / dotenv | 密钥不进 git |

**最佳实践**：
1. ✅ 用 `index.php` 顶部定义 `ENVIRONMENT`，不要在 `config.php` 里再判断
2. ✅ `config/production/` 只放"与默认不同的字段"，避免重复定义
3. ✅ 数据库密码永远从 `getenv()` 取，不要写死在 config 文件
4. ✅ 关键配置（如 `encryption_key`）可通过 `$assign_to_config` 覆盖
5. ✅ CI3 的双层覆盖比 Laravel 的 `.env` 早 8 年，比 Symfony 的 parameters 早 10 年

### 4. Hook 系统（AOP 早期实现）

**问题场景**：框架核心代码（Router/Security/Output）不应被业务逻辑改写，但用户又要插入"权限校验"、"日志记录"、"性能监控"等横切关注点。CI3 用 7 个固定钩子点 + `call_hook()` 函数实现"不改源码就能织入逻辑"。

**解决方案**：
```php
// application/config/hooks.php
$hook['post_controller_constructor'] = array(
    'class'    => 'MyAuth',
    'function' => 'checkPermission',
    'filename' => 'MyAuth.php',
    'filepath' => 'hooks',
    'params'   => array('admin')
);

$hook['display_override'] = array(
    'class'    => 'MyTemplate',
    'function' => 'renderSmarty',
    'filename' => 'MyTemplate.php',
    'filepath' => 'hooks'
);

// system/core/Hooks.php 核心实现
public function call_hook($which = '')
{
    if ( ! isset($this->hooks[$which])) {
        return FALSE;
    }
    foreach ($this->hooks[$which] as $val) {
        // 动态加载 hook 类
        $this->_load_hook($val);
        $val['class'] = new $val['class']();
        $val['function'] = (string) $val['function'];
        call_user_func_array(array($val['class'], $val['function']), $val['params']);
    }
    return TRUE;
}
```

**关键参数**：

| 钩子字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `class` | string | 是 | 包含钩子方法的类名 |
| `function` | string | 是 | 要调用的方法名 |
| `filename` | string | 是 | 类文件名 |
| `filepath` | string | 是 | 相对 `APPPATH` 的子目录 |
| `params` | array | 否 | 传给方法的参数数组 |
| `filename` 重复 | string | 否 | 多个钩子可在同文件 |

**最佳实践**：
1. ✅ `post_controller_constructor` 适合做权限校验（Controller 构造完但方法未跑）
2. ✅ `display_override` 适合集成 Smarty/Twig（不改 Output 类源码）
3. ✅ `cache_override` 适合对接 Redis 替代文件缓存
4. ✅ 钩子类要保持无状态（请求结束后静态属性不会清理）
5. ✅ 不要在 `pre_system` 里 `load->library()`——彼时 Loader 还没初始化
6. ✅ 钩子失败用 `exit()` 阻止请求继续（不抛异常，CI3 早期没 try-catch 概念）

### 5. compat 兼容垫片（mbstring/hash/password/standard）

**问题场景**：CI3 要兼容 PHP 5.4.8 - 8.x，但 `password_hash()` 是 PHP 5.5+、`hash_pbkdf2()` 是 PHP 5.5+、`mb_strlen()` 在某些发行版可能缺失。CI3 用 4 个 compat 文件**渐进式回退**。

**解决方案**：
```php
// system/core/compat/password.php
if ( ! function_exists('password_hash')) {
    function password_hash($password, $algo = 1, $options = array()) {
        // 用 crypt() 自实现 bcrypt
        $cost = isset($options['cost']) ? (int) $options['cost'] : 10;
        $salt = isset($options['salt']) ? $options['salt'] : _password_generate_salt();
        $len = 22;
        if (function_exists('openssl_random_pseudo_bytes')) {
            $salt = base64_encode(openssl_random_pseudo_bytes($len));
        }
        $hash = crypt($password, sprintf('$2y$%02d$%s$', $cost, $salt));
        return $hash;
    }
}

// system/core/compat/mbstring.php
if ( ! function_exists('mb_strlen')) {
    function mb_strlen($str, $encoding = NULL) {
        return strlen($str);  // 兜底用 byte 长度
    }
}
```

**关键参数**：

| 垫片文件 | 覆盖的 PHP 函数 | 最低支持版本 |
|---|---|---|
| `compat/mbstring.php` | mb_strlen/mb_substr/mb_strpos | PHP 4.0.6+ |
| `compat/hash.php` | hash/hash_hmac/hash_pbkdf2 | PHP 5.1.2+ |
| `compat/password.php` | password_hash/password_verify | PHP 5.5+ |
| `compat/standard.php` | array_replace/array_fill_keys | PHP 5.0+ |

**最佳实践**：
1. ✅ `password_hash` 缺时用 `crypt()` 兜底，但要保证 `$2y$` 模式（不是 `$2a$`，后者有已知漏洞）
2. ✅ 升级 PHP 8 后这些 compat 文件**自动失效**（`function_exists` 返回 true）
3. ✅ 不要修改 compat 文件——升级 CI3 时会被覆盖，应该写在自己 hooks 里
4. ✅ 用 `password_hash($pwd, PASSWORD_BCRYPT, ['cost' => 12])` 而非 `md5()`（CI3 默认 cost=10，可调高）
5. ✅ `hash_pbkdf2` 缺时不要用 `hash_hmac` 替代（前者有迭代计数，抗暴力破解更强）

## 二、架构与扩展（Architecture & Extension）

### 6. subclass_prefix 软继承（MY_Controller 扩展机制）

**问题场景**：用户要在 `CI_Controller` 基础上加通用方法（如鉴权、CMS 钩子），但又不能改 `system/core/CodeIgniter.php` 源码（升级会被覆盖）。PHP 5.2 之前没有 namespace，CI3 用 **字符串前缀** 让用户态类"软继承"核心类。

**解决方案**：
```php
// application/config/config.php
$config['subclass_prefix'] = 'MY_';

// application/core/MY_Controller.php
class MY_Controller extends CI_Controller {
    public function __construct() {
        parent::__construct();
        $this->load->library('auth');
        if (!$this->auth->check()) {
            show_404();
        }
    }
}

// application/core/MY_Input.php
class MY_Input extends CI_Input {
    public function _sanitize_globals() {
        // 覆盖父类方法，添加自定义过滤
        parent::_sanitize_globals();
        // 额外清理 XSS
    }
}

// Loader.php 查找顺序
protected function _load_class($class, $params = NULL, $object_name = NULL) {
    $subclass = $this->_config->item('subclass_prefix') . $class;
    if (file_exists(APPPATH.'core/'.$subclass.'.php')) {
        $name = $subclass;  // ← 优先用 MY_Controller
    } else {
        $name = 'CI_'.$class;
    }
    // ...
}
```

**关键参数**：

| 配置项 | 默认值 | 用途 |
|---|---|---|
| `subclass_prefix` | `MY_` | 软继承前缀 |
| `application/core/` | - | MY_Controller/MY_Model 放这里 |
| `application/libraries/` | - | MY_Loader/MY_Log 放这里 |
| `application/config/` | - | MY_Router 配置覆盖 |

**最佳实践**：
1. ✅ 用 `MY_Controller` 做"基类控制器"——所有业务 Controller 继承它，统一鉴权/数据初始化
2. ✅ `subclass_prefix` 改短（如 `App_`）可减少类名长度，但要避免和第三方库冲突
3. ✅ `MY_Input`/`MY_Output` 覆盖前先 `parent::method()`，避免丢失父类逻辑
4. ✅ 升级 CI3 时，`MY_*` 文件**不会**被覆盖（它们在 `application/`，不在 `system/`）
5. ✅ CI4 抛弃了 `subclass_prefix`，改用 namespace + 依赖注入，更现代但不再兼容 CI3 心智

### 7. Router URI dashes 转换（SEO 友好 URL）

**问题场景**：URL 想用 `my-controller/method-name`（连字符，SEO 友好），但 PHP 类名不支持连字符，文件名也最好用下划线。CI3 用 `translate_uri_dashes` 配置**自动转换**。

**解决方案**：
```php
// application/config/config.php
$config['translate_uri_dashes'] = FALSE;  // 默认关闭

// 开启后，URL /my-controller 会被自动路由到 My_controller 类
// application/controllers/My_controller.php
class My_controller extends CI_Controller {
    public function index() { ... }
    public function my_method() { ... }
}

// Router.php 关键代码
protected function _validate_request($segments) {
    $c = count($segments);
    $directory_override = $this->directory;

    // 转换连字符 → 下划线
    if ($this->translate_uri_dashes === TRUE) {
        $segments[0] = str_replace('-', '_', $segments[0]);
        if (isset($segments[1])) {
            $segments[1] = str_replace('-', '_', $segments[1]);
        }
    }

    // 类名首字母大写（CI3 类名约定）
    $segments[0] = ucfirst($segments[0]);
    // ...
}
```

**关键参数**：

| 配置 | 默认值 | 行为 |
|---|---|---|
| `translate_uri_dashes` | `FALSE` | TRUE 时连字符转下划线 |
| `url_suffix` | `''` | URL 追加后缀（如 `.html`） |
| `permitted_uri_chars` | `a-z 0-9~%.:_\-` | URI 合法字符白名单 |
| `route['(.*)']` | - | 通配路由规则 |

**最佳实践**：
1. ✅ 开启 `translate_uri_dashes` 后，URL 用 `my-page`、类名用 `My_page`（首字母大写）
2. ✅ 用 `routes.php` 配 `route['admin/(:any)'] = 'admin/dashboard/$1'` 做伪静态
3. ✅ 路由用正则 `(:num)` 限制参数为数字，避免注入
4. ✅ CI3 不支持方法名带连字符，需要的话用 `_remap()` 方法拦截
5. ✅ 路由优先级：`routes.php` 规则 > 默认 `controller/method` 解析

### 8. Loader 视图路径与主题（_ci_view_paths）

**问题场景**：多租户 SaaS 要切换主题皮肤（默认主题/admin 主题/客户主题），框架应该支持**多视图目录查找**——优先找 `application/views/`，找不到就到 `system/views/`，再找不到就到 `themes/admin/views/`。CI3 用 `_ci_view_paths` 数组实现"主题目录"。

**解决方案**：
```php
// system/core/Loader.php
protected $_ci_view_paths = array(VIEWPATH => TRUE);

public function add_package_path($path, $view_cascade = TRUE) {
    $path = rtrim($path, '/').'/';
    $this->_ci_view_paths = array($path => $view_cascade) + $this->_ci_view_paths;
}

public function view($view, $vars = array(), $return = FALSE) {
    // 遍历所有视图目录查找
    foreach ($this->_ci_view_paths as $path => $cascade) {
        $file = $path.'views/'.$view.'.php';
        if (file_exists($file)) {
            return $this->_ci_load(array(
                '_ci_path' => $file,
                '_ci_vars' => $vars,
                '_ci_return' => $return
            ));
        }
    }
    show_error('View file not found: '.$view);
}

// 使用：添加 admin 主题
$this->load->add_package_path(APPPATH.'third_party/admin_theme/');
$this->load->view('header');  // 优先到 admin_theme/views/header.php
```

**关键参数**：

| 路径 | 优先级 | 用途 |
|---|---|---|
| `APPPATH.'views/'` | 1 | 用户态视图（最高优先） |
| `$theme_path.'views/'` | 2 | 动态添加的主题 |
| `BASEPATH.'views/'` | 3 | 框架内置视图（如 404 页） |
| `$cascade` | TRUE/FALSE | TRUE 时找不到继续往下找 |

**最佳实践**：
1. ✅ 用 `add_package_path()` 在 Controller 构造里切换主题（如 `$this->load->add_package_path('themes/admin/')`）
2. ✅ `_ci_view_paths` 数组顺序决定查找优先级，用 `+` 加前面是高优先
3. ✅ `$cascade=FALSE` 时只查当前主题，不 fallback（性能稍好）
4. ✅ 视图文件只放 PHP+HTML，不要写业务逻辑（保持 MVC 分层）
5. ✅ CI3 的主题机制比 Laravel 的 `view: share` 早 10 年，但不如 Blade 组件化

### 9. Database 10 种驱动（Strategy 模式）

**问题场景**：CI3 承诺"一套代码切换 MySQL/PostgreSQL/SQLite/SQL Server/Oracle/Cubrid"——但每种数据库的 SQL 语法、连接方式、escape 规则都不同。CI3 用 **抽象基类 `DB_driver`** + **10 个具体驱动** 解决。

**解决方案**：
```php
// system/database/DB_driver.php 抽象基类
abstract class CI_DB_driver {
    public $conn_id = FALSE;
    public $database;  // 适配器名（mysqli/pdo/pgsql...）
    protected $_protect_identifiers = TRUE;

    abstract public function db_connect();         // 子类实现
    abstract public function _escape_str($str);    // SQL escape
    abstract protected function _list_tables($prefix_limit);
    abstract protected function _insert_batch($final, $constraints);

    // 通用方法（所有数据库共享）
    public function query($sql, $binds = FALSE, $return_object = TRUE) {
        // ...
    }
    public function get($table, $limit = NULL, $offset = NULL) { ... }
    public function insert($table, $set) { ... }
}

// system/database/drivers/mysqli/mysqli_driver.php
class CI_DB_mysqli_driver extends CI_DB_driver {
    public function db_connect() {
        return @new mysqli(
            $this->hostname, $this->username, $this->password,
            $this->database, $this->port, $this->socket
        );
    }
    public function _escape_str($str) {
        return $str = $this->conn_id->real_escape_string($str);
    }
}

// 切换数据库
$db['default']['dbdriver'] = 'mysqli';   // 或 pdo / pgsql / sqlite3
```

**关键参数**：

| 驱动 | 适用 | 性能 | 扩展支持 |
|---|---|---|---|
| `mysqli` | MySQL 5.0+ | 快 | 原生函数 |
| `pdo` | 任意 PDO 支持 | 中 | 跨数据库 |
| `pgsql` | PostgreSQL 9+ | 快 | 原生函数 |
| `sqlite3` | 嵌入式 | 极快（单机） | 单文件 |
| `sqlsrv` | MS SQL Server | 中 | Windows 优化 |
| `oci8` | Oracle 10g+ | 中 | 企业级 |
| `cubrid` | CUBRID | 中 | 韩国市场 |
| `ibase` | Firebird | 慢 | 嵌入式 |

**最佳实践**：
1. ✅ 默认用 `mysqli`（不是 `mysql`，已废弃）
2. ✅ 用 `pdo` 驱动可以连接 SQL Server/Oracle，但失去各数据库原生优化
3. ✅ 数据库连接信息（`hostname`/`username`/`password`）用 ENVIRONMENT 双层覆盖
4. ✅ 读写分离：定义 `$db['read']` 和 `$db['write']` 两组配置，框架自动选
5. ✅ 不要在 Controller 里直接写 `$this->db->query('SELECT * FROM users')`——用 Query Builder 防注入
6. ✅ `$this->db->escape()` 包裹所有用户输入，不要靠 `mysqli_real_escape_string`

### 10. Session 5 种存储（Decorator 模式）

**问题场景**：PHP 原生 `$_SESSION` 依赖文件系统，多服务器部署会丢失会话。CI3 抽象出 `Session_driver` 接口，支持 file/database/memcached/redis/cookie 5 种后端，业务代码无需关心底层。

**解决方案**：
```php
// application/config/config.php
$config['sess_driver'] = 'redis';
$config['sess_cookie_name'] = 'ci_session';
$config['sess_expiration'] = 7200;        // 2 小时
$config['sess_save_path'] = 'tcp://127.0.0.1:6379';
$config['sess_match_ip'] = FALSE;         // CDN 场景关掉
$config['sess_time_to_update'] = 300;     // 5 分钟更新一次 session_id

// system/libraries/Session/Session_driver.php 抽象
abstract class CI_Session_driver {
    public abstract function open($save_path, $name);
    public abstract function close();
    public abstract function read($session_id);
    public abstract function write($session_id, $session_data);
    public abstract function destroy($session_id);
    public abstract function gc($maxlifetime);

    public function __call($method, $params) { /* 转发到 driver */ }
}

// system/libraries/Session/drivers/Session_redis_driver.php
class CI_Session_redis_driver extends CI_Session_driver {
    public function open($save_path, $name) {
        $this->_redis = new Redis();
        $this->_redis->connect($this->_config['save_path']);
        return TRUE;
    }
    public function write($session_id, $session_data) {
        $this->_redis->setex($session_id, $this->_config['expiration'], $session_data);
    }
}

// 使用
$this->session->set_userdata('user_id', 123);
$user_id = $this->session->userdata('user_id');
$this->session->sess_destroy();
```

**关键参数**：

| 配置 | 默认 | 用途 |
|---|---|---|
| `sess_driver` | `files` | file/database/memcached/redis/cookie |
| `sess_cookie_name` | `ci_session` | cookie 名 |
| `sess_expiration` | 7200 | 过期秒数 |
| `sess_save_path` | NULL | 数据库表名 / Redis 地址 |
| `sess_match_ip` | FALSE | TRUE 时 IP 变化强制重新登录 |
| `sess_time_to_update` | 300 | session_id 重新生成间隔 |

**最佳实践**：
1. ✅ 生产用 `redis` 或 `memcached`，多服务器部署共享会话
2. ✅ `sess_match_ip=TRUE` 适合内部系统（更安全），CDN 场景必须 FALSE
3. ✅ 不要把敏感数据（如密码）存 session——只存 user_id，从数据库查
4. ✅ 启用 `sess_time_to_update` 防止 session fixation 攻击
5. ✅ `sess_destroy()` 退出时调用，清服务器端和 cookie

## 三、性能与缓存（Performance & Caching）

### 11. Output 早 exit 缓存（_display_cache 性能金矿）

**问题场景**：80% 的 Web 流量集中在 20% 的页面（首页、列表页、详情页）。每次请求都跑 Controller + Model + View + Database 浪费 CPU。CI3 的 Output 类**在 Input 类之前**初始化，能在路由前命中缓存就 `exit`——零业务代码执行。

**解决方案**：
```php
// application/config/config.php
$config['cache_path'] = APPPATH.'cache/';
$config['cache_query_string'] = FALSE;

// 在 Controller 方法里手动开启缓存
class Article extends CI_Controller {
    public function view($id) {
        $this->output->cache(60);  // 缓存 60 分钟
        $data['article'] = $this->article_model->find($id);
        $this->load->view('article/view', $data);
    }
}

// system/core/Output.php 关键代码
public function _display_cache(&$CFG, &$URI) {
    if ($this->_cache_expiration = $this->_get_cache($CFG, $URI)) {
        // 命中缓存：直接 echo 缓存文件，零业务代码
        $this->_display($this->_cache_expiration);
        return TRUE;
    }
    return FALSE;
}

// CodeIgniter.php 中的早退
if ($EXT->call_hook('cache_override') === FALSE
    && $OUT->_display_cache($CFG, $URI) === TRUE)
{
    exit;  // ← 跳过 Security/Input/Lang/Controller/View
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| `$config['cache_path']` | `APPPATH.'cache/'` | 缓存文件目录 |
| `$this->output->cache(n)` | 60 (分钟) | 缓存时长 |
| URI 段 | - | 缓存键由 URI 段拼接 |
| `cache_query_string` | FALSE | TRUE 时 query string 影响缓存键 |
| `$cache['active']` | TRUE | 全局开关 |

**最佳实践**：
1. ✅ 静态页面（首页/帮助页）开 60 分钟缓存，命中率 90%+ 时 QPS 翻 5-10 倍
2. ✅ 动态页面用 `cache_query_string=TRUE` 区分不同 query 参数
3. ✅ 缓存文件加 `.htaccess Deny from all` 防止直接访问
4. ✅ 缓存更新：删除 `application/cache/` 对应文件即可，框架自动重建
5. ✅ 千万级 QPS 网站可以加 Redis cache 替换文件缓存（用 `cache_override` 钩子）
6. ✅ CI3 的早 exit 缓存比 Symfony 的 ESI 早 5 年，比 Varnish 反代简单 10 倍

### 12. Query Builder 查询构造（Active Record）

**问题场景**：直接写 `$this->db->query('SELECT * FROM users WHERE id = '.$id)` 有 SQL 注入风险。CI3 提供 **Query Builder**（Active Record 模式）——用链式方法自动 escape。

**解决方案**：
```php
// 简单查询
$query = $this->db->get_where('users', array('id' => $id), 1);
$row = $query->row();

// 链式查询
$query = $this->db
    ->select('id, name, email')
    ->from('users')
    ->where('status', 'active')
    ->where('age >', 18)
    ->like('name', $keyword, 'both')     // %keyword%
    ->order_by('created_at', 'DESC')
    ->limit(10, 20)                       // LIMIT 20, 10
    ->get();

// 复杂 JOIN
$query = $this->db
    ->select('orders.*, users.name')
    ->from('orders')
    ->join('users', 'users.id = orders.user_id', 'left')
    ->where('orders.status', 'paid')
    ->get();

// 插入
$this->db->insert('users', array(
    'name'  => $name,
    'email' => $email,
    'created_at' => date('Y-m-d H:i:s'),
));
$insert_id = $this->db->insert_id();

// 更新
$this->db->where('id', $id);
$this->db->update('users', array('name' => $new_name));

// 事务
$this->db->trans_start();
$this->db->insert('orders', $order);
$this->db->update('inventory', $inventory);
$this->db->trans_complete();
if ($this->db->trans_status() === FALSE) {
    log_message('error', 'Transaction failed');
}
```

**关键参数**：

| 方法 | 返回 | 说明 |
|---|---|---|
| `select()` | $this | 选字段 |
| `from()` | $this | 表名 |
| `where()` | $this | 条件（自动 escape） |
| `like()` | $this | LIKE 查询 |
| `order_by()` | $this | 排序 |
| `limit()` | $this | 限制行数 |
| `join()` | $this | JOIN（left/right/outer） |
| `get()` | query | 执行 SELECT |
| `insert()` | bool | 插入 |
| `update()` | bool | 更新 |
| `delete()` | bool | 删除 |
| `count_all_results()` | int | 计数 |

**最佳实践**：
1. ✅ 永远用 Query Builder，不要拼字符串 SQL
2. ✅ 链式方法顺序：`select → from → join → where → order_by → limit → get`
3. ✅ `where('id', NULL, FALSE)` 第三个参数 FALSE 关闭 escape（极危险，慎用）
4. ✅ 用 `$this->db->last_query()` 调试生成的 SQL
5. ✅ 复杂统计用 `select_sum()`/`select_avg()`/`select_max()`，框架自动转 SQL 函数
6. ✅ 事务用 `trans_start/trans_complete` 自动 commit/rollback，错误时 `trans_status() === FALSE`

### 13. Cache 5 种驱动（统一缓存抽象）

**问题场景**：业务代码要缓存多种数据（DB 查询结果、API 响应、HTML 片段、Session），不同数据适合不同后端（Redis 存 session、文件存 HTML、APCu 存查询结果）。CI3 提供 `Cache` 库统一抽象，5 种驱动可切换。

**解决方案**：
```php
// application/config/config.php
$config['cache_path'] = APPPATH.'cache/';
$config['cache_driver'] = 'file';  // file/apcu/memcached/redis/wincache

// 写入缓存
$this->cache->save('user_profile_123', $profile, 300);  // 5 分钟

// 读取缓存
$profile = $this->cache->get('user_profile_123');
if ($profile === FALSE) {
    $profile = $this->user_model->find(123);
    $this->cache->save('user_profile_123', $profile, 300);
}

// 删除缓存
$this->cache->delete('user_profile_123');

// 清空所有
$this->cache->clean();

// system/libraries/Cache/Cache.php 抽象
abstract class CI_Cache_driver {
    protected $_cache_path;
    public abstract function get($id);
    public abstract function save($id, $data, $ttl = 60);
    public abstract function delete($id);
    public abstract function clean();
    public abstract function cache_info();
    public abstract function get_metadata($id);
    public abstract function is_supported();
}

// 驱动选择
class CI_Cache_file extends CI_Cache_driver { ... }       // 文件
class CI_Cache_apc extends CI_Cache_driver { ... }        // APCu (CLI 不支持)
class CI_Cache_memcached extends CI_Cache_driver { ... }  // Memcached
class CI_Cache_redis extends CI_Cache_driver { ... }      // Redis (CI3.1+)
class CI_Cache_wincache extends CI_Cache_driver { ... }   // Windows
```

**关键参数**：

| 驱动 | 适用场景 | 性能 | 限制 |
|---|---|---|---|
| `file` | 共享主机/小流量 | 中 | 多服务器不同步 |
| `apcu` | 单机 PHP-FPM | 极快 | CLI 不支持 |
| `memcached` | 多机共享 | 快 | 内存有限 |
| `redis` | 多机+持久化 | 快 | 需要 Redis 服务 |
| `wincache` | Windows + IIS | 快 | 仅 Windows |

**最佳实践**：
1. ✅ 默认 `file`，小流量够用；流量 > 100 QPS 换 `redis`
2. ✅ Cache key 用 `prefix:id` 命名（如 `user:123`），方便批量清理
3. ✅ 缓存 HTML 片段用 `file`（序列化开销大），缓存 PHP 数组用 `redis`（性能好）
4. ✅ 用 `$this->cache->is_supported()` 检测驱动是否可用（如 APCu 在 CLI 不支持）
5. ✅ TTL 不要超过业务允许的最大延迟——缓存是延迟一致性，不是实时一致性
6. ✅ 用 `cache_info()` 查看命中率，命中率 < 50% 考虑关掉缓存

### 14. Benchmark 类性能监控（埋点 + 内存峰值）

**问题场景**：慢查询在哪一行？哪段代码耗时？CI3 的 Benchmark 类提供 `mark()` 埋点和 `elapsed_time()` 取差值，还能记录内存峰值和总耗时。生产环境接 APM（New Relic/SkyWalking）时直接读这些数据。

**解决方案**：
```php
// 自动埋点（CodeIgniter.php 中）
$BM->mark('total_execution_time_start');
$BM->mark('loading_time:_base_classes_start');
// ...
$BM->mark('loading_time:_base_classes_end');
$BM->mark('controller_execution_time_( '.$class.' / '.$method.' )_start');
// ... controller 业务 ...
$BM->mark('controller_execution_time_( '.$class.' / '.$method.' )_end');

// 在 Controller 里手动埋点
class Report extends CI_Controller {
    public function generate() {
        $this->benchmark->mark('db_query_start');
        $data = $this->db->get_where('reports', ['year' => 2026])->result();
        $this->benchmark->mark('db_query_end');

        $this->benchmark->mark('render_start');
        $this->load->view('report', $data);
        $this->benchmark->mark('render_end');
    }
}

// 在 view 里显示耗时
echo "DB 耗时: ".$this->benchmark->elapsed_time('db_query_start', 'db_query_end');
echo "渲染耗时: ".$this->benchmark->elapsed_time('render_start', 'render_end');
echo "总耗时: ".$this->benchmark->elapsed_time('total_execution_time_start', 'total_execution_time_end');
echo "内存峰值: ".$this->benchmark->memory_usage();
```

**关键参数**：

| 方法 | 返回 | 说明 |
|---|---|---|
| `mark($name)` | void | 打点（同一名字会重置） |
| `elapsed_time($p1, $p2, $decimals=4)` | string | 两点间耗时（秒） |
| `memory_usage()` | string | 内存峰值（MB） |
| `get_all_mark_values()` | array | 所有点列表 |
| `$config['log_threshold']` | 0-4 | 日志级别（0=全关，4=全开） |

**最佳实践**：
1. ✅ 关键路径打点（DB 调用、第三方 API、模板渲染）——但不要每个方法都打（噪声太大）
2. ✅ `log_threshold=4` 配合 `error_reporting(E_ALL)` 在开发环境开全日志
3. ✅ 生产环境把 `log_threshold=1` 只记录 ERROR，DEBUG 日志关掉
4. ✅ 用 `memory_usage()` 监控是否有内存泄漏（同一接口连续两次请求对比）
5. ✅ 配合 `hooks/post_controller` 把 benchmark 数据上报到 APM
6. ✅ 慢请求（> 1s）单独发邮件/Slack 告警

### 15. 数据库读写分离（多组连接配置）

**问题场景**：电商网站的 80% 请求是读（浏览商品），20% 是写（下单/支付）。如果读写都打主库，主库压力大、副库闲置。CI3 3.0+ 支持**多组 DB 配置 + 自动选库**。

**解决方案**：
```php
// application/config/database.php
$db['default'] = array(
    'dsn'      => '',
    'hostname' => 'db-master.internal',
    'username' => 'app_writer',
    'password' => getenv('DB_MASTER_PASS'),
    'database' => 'shop',
    'dbdriver' => 'mysqli',
    'db_debug' => FALSE,
);

$db['read'] = array(
    'hostname' => 'db-replica-1.internal, db-replica-2.internal',
    'username' => 'app_reader',
    'password' => getenv('DB_READER_PASS'),
    'database' => 'shop',
    'dbdriver' => 'mysqli',
    'pconnect' => TRUE,            // 长连接
    'cache_on' => TRUE,            // Query 缓存
    'cachedir' => '/var/cache/ci/',
);

$db['write'] = $db['default'];     // 写用主库

// 切换连接组
$this->db = $this->load->database('read', TRUE);   // 强制读
$this->db->where('product_id', $id);
$data = $this->db->get('products')->row();

// 写仍用默认
$this->db->insert('orders', $order_data);

// 多从库负载均衡
$active_group = 'default';
$query_builder = TRUE;
$db['read']['hostname'] = 'db-r1.internal, db-r2.internal, db-r3.internal';
// 框架自动随机选一个
```

**关键参数**：

| 配置键 | 类型 | 说明 |
|---|---|---|
| `hostname` | string | 单个或逗号分隔多个（多从库 LB） |
| `pconnect` | bool | TRUE 用长连接（pconnect） |
| `cache_on` | bool | TRUE 启用 Query 结果缓存 |
| `cachedir` | string | 缓存目录 |
| `stricton` | bool | TRUE 强制事务 |
| `char_set` / `dbcollat` | string | 字符集（默认 utf8/utf8_general_ci） |

**最佳实践**：
1. ✅ 主库专写、副库专读——主库 `hostname=db-master`、副库 `hostname=db-replica`
2. ✅ 用 `$this->load->database('read', TRUE)` 显式切到读库，避免误写
3. ✅ 多副库用逗号分隔 `db-r1, db-r2, db-r3`——框架随机选
4. ✅ 写后立即读的场景要小心主从延迟（订单提交后立刻查列表可能查不到）
5. ✅ 长连接 `pconnect=TRUE` 减少握手开销，但要监控连接数
6. ✅ 监控主从复制延迟（`SHOW SLAVE STATUS`），延迟 > 1s 报警

## 四、可靠性与生态（Reliability & Ecosystem）

### 16. CSRF/XSS 防护（Security 类 + form_helper）

**问题场景**：表单提交可能被跨站请求伪造（CSRF），用户输入的 HTML 可能包含 `<script>` 跨站脚本（XSS）。CI3 把防护内置到 `Security` 类 + `form_helper`，无需第三方库。

**解决方案**：
```php
// application/config/config.php
$config['csrf_protection'] = TRUE;
$config['csrf_token_name'] = 'csrf_test_name';
$config['csrf_cookie_name'] = 'csrf_cookie_name';
$config['csrf_expire'] = 7200;     // 2 小时
$config['csrf_regenerate'] = TRUE; // 每次提交重新生成 token
$config['global_xss_filtering'] = FALSE;  // CI3 默认关闭（性能），按需开

// 自动注入 CSRF token 到表单（form_helper）
echo form_open('user/login');
// 输出：<form method="post" action="...">
// 隐藏字段 csrf_test_name 自动生成

// 或者手动：
echo '<input type="hidden" name="'.$this->security->get_csrf_token_name().'" value="'.$this->security->get_csrf_hash().'">';

// 验证 CSRF（自动发生）
// Security 类在 Input 初始化时自动验证 POST 请求的 token
// 失败抛出 show_404()

// XSS 过滤
$name = $this->input->post('name', TRUE);  // TRUE 启用 XSS 过滤
// 等价于：
$name = $this->security->xss_clean($this->input->post('name'));

// 输出转义（推荐在 View 里）
echo html_escape($user_input);  // form_helper 函数
```

**关键参数**：

| 配置 | 默认 | 用途 |
|---|---|---|
| `csrf_protection` | FALSE | TRUE 启用 CSRF 防护 |
| `csrf_token_name` | `csrf_test_name` | token 字段名 |
| `csrf_cookie_name` | `csrf_cookie_name` | cookie 名 |
| `csrf_expire` | 7200 | token 过期（秒） |
| `csrf_regenerate` | TRUE | 提交后重新生成 |
| `global_xss_filtering` | FALSE | 全局 XSS 过滤（CI3 默认关） |

**最佳实践**：
1. ✅ 所有 POST/PUT/DELETE 表单开 CSRF，GET 表单不开
2. ✅ AJAX 请求 CSRF：把 token 放到 `X-CSRF-Token` header（前端用 cookie 读取）
3. ✅ `global_xss_filtering=TRUE` 拖慢性能（每个输入都过滤），推荐在 View 里 `html_escape()`
4. ✅ 富文本编辑器（UEditor/KindEditor）输出的 HTML 要用 HTMLPurifier 单独过滤，CI3 的 `xss_clean` 偏弱
5. ✅ `csrf_regenerate=TRUE` 防止 token 复用（更安全），但多 tab 提交会失败——可关闭
6. ✅ `form_open()` 自动注入 CSRF token，不要手写 `<form>` 标签

### 17. PHPUnit 测试矩阵（GitHub Actions 7 库 × 8 PHP 版本）

**问题场景**：CI3 要兼容 PHP 5.4.8 - 8.x 7 个数据库驱动。如果手动测，56 种组合爆肝。CI3 用 **GitHub Actions 矩阵**自动跑全组合。

**解决方案**：
```yaml
# .github/workflows/test-phpunit.yml
name: PHPUnit
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        php: ['5.6', '7.0', '7.1', '7.2', '7.3', '7.4', '8.0', '8.1']
        db: [mysql, mysqli, pdo, postgres, sqlite, sqlsrv, oci8]
        services:
          mysql:
            image: mysql:5.7
            env:
              MYSQL_ROOT_PASSWORD: rootpw
          postgres:
            image: postgres:13
            env:
              POSTGRES_PASSWORD: rootpw
    steps:
      - uses: actions/checkout@v2
      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          extensions: ${{ matrix.db }}, mbstring, json
      - run: composer install --prefer-dist
      - run: vendor/bin/phpunit -c tests/phpunit.xml
        env:
          DB_DRIVER: ${{ matrix.db }}
```

测试目录结构：
```
tests/
├── codeigniter/
│   ├── core/
│   │   ├── CodeIgniter_test.php
│   │   ├── Router_test.php
│   │   └── ...
│   ├── database/
│   │   └── DB_query_builder_test.php
│   ├── libraries/
│   │   ├── Session_test.php
│   │   └── ...
│   └── helpers/
│       └── url_helper_test.php
├── mocks/
│   ├── libraries/
│   │   └── session.php
│   └── ...
└── phpunit.xml
```

**关键参数**：

| 测试类型 | 工具 | 覆盖度 |
|---|---|---|
| 单元测试 | PHPUnit 8.5+ | ~60% 行覆盖 |
| 集成测试 | tests/codeigniter/ | 18 个核心类 |
| 静态分析 | ❌（无 PHPStan） | — |
| Lint | ❌（无 PHP-CS-Fixer） | — |
| CI 矩阵 | 7 PHP × 7 DB = 49 组合 | — |
| 性能 | ❌（无 benchmark） | — |

**最佳实践**：
1. ✅ 改 PR 前本地跑 `vendor/bin/phpunit -c tests/phpunit.xml`，不要等 CI
2. ✅ 写测试用 mocks（`tests/mocks/`），不要真连数据库
3. ✅ 新加核心类必须写 `core/MyClass_test.php`（CI3 强制约定）
4. ✅ CI 矩阵故意保留 PHP 5.6——政府/教育行业大量遗留系统
5. ✅ 数据库驱动用 Docker service 跑（不用 Travis 旧镜像）
6. ✅ `fail-fast: false` 让矩阵全跑完，不因一个失败跳过后续

### 18. 错误处理三件套（set_error_handler + 异常 + 关闭）

**问题场景**：PHP 默认错误是直接 echo 到屏幕（开发友好，生产致命）。CI3 用 **3 套钩子**把所有错误统一转成 `Exceptions::show_error()` 渲染 HTML 错误页。

**解决方案**：
```php
// system/core/CodeIgniter.php
set_error_handler('_error_handler');
set_exception_handler('_exception_handler');
register_shutdown_function('_shutdown_handler');

// system/core/Common.php
function _error_handler($severity, $message, $filepath, $line) {
    $is_error = (((E_ERROR | E_PARSE | E_COMPILE_ERROR | E_CORE_ERROR | E_USER_ERROR) & $severity) === $severity);

    if (($severity & error_reporting()) !== $severity) {
        return;  // 被 error_reporting() 屏蔽
    }

    if ($is_error) {
        exit;  // 致命错误直接退出
    }

    throw new ErrorException($message, 0, $severity, $filepath, $line);
}

function _exception_handler($exception) {
    // 记录日志
    log_message('error', $exception->getMessage());
    // 渲染友好错误页
    set_status_header(500);
    require APPPATH.'views/errors/html/error_exception.php';
}

function _shutdown_handler() {
    $error = error_get_last();
    if ($error !== NULL && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR])) {
        _exception_handler(new ErrorException(
            $error['message'], 0, $error['type'], $error['file'], $error['line']
        ));
    }
}

// 在 Controller 里抛错
class User extends CI_Controller {
    public function login() {
        if (!$user = $this->user_model->find($id)) {
            show_404();                // 404 页面
        }
        if (!$this->auth->check_password($user, $pwd)) {
            show_error('密码错误', 403);  // 任意状态码
        }
    }
}
```

**关键参数**：

| 钩子 | 触发 | 用途 |
|---|---|---|
| `set_error_handler` | PHP 错误（Notice/Warning/Fatal） | 转 ErrorException |
| `set_exception_handler` | 未捕获的异常 | 渲染 HTML 错误页 |
| `register_shutdown_function` | 请求结束 | 捕获 fatal 错误（handler 抓不到） |
| `log_threshold` | 0-4 | 日志记录级别 |
| `ENVIRONMENT=production` | - | 不显示错误堆栈 |

**最佳实践**：
1. ✅ 生产环境 `ENVIRONMENT=production` + `log_threshold=1`，错误堆栈不暴露
2. ✅ 开发环境 `ENVIRONMENT=development` + `log_threshold=4`，记录所有日志
3. ✅ `show_404()`、`show_error()` 是 CI3 推荐错误抛出方式，比 `throw` 更友好
4. ✅ `log_message('error', $msg)` 记录到 `application/logs/log-YYYY-MM-DD.php`
5. ✅ 严重错误（500）单独通知（Slack/邮件），不要等用户报告
6. ✅ `_shutdown_handler` 是救命的——很多 fatal 错误只有它能抓（如内存耗尽）

### 19. Email 库（SMTP/Sendmail/Mail 三模式）

**问题场景**：PHP `mail()` 函数依赖系统 sendmail，配置复杂。CI3 抽象出 `Email` 库，支持 SMTP/Sendmail/Mail 三种协议 + HTML 邮件 + 附件 + 批量发送。

**解决方案**：
```php
// application/config/email.php
$config['protocol']     = 'smtp';
$config['smtp_host']    = 'ssl://smtp.gmail.com';
$config['smtp_user']    = 'noreply@myapp.com';
$config['smtp_pass']    = getenv('SMTP_PASSWORD');
$config['smtp_port']    = 465;
$config['smtp_timeout'] = 30;
$config['smtp_crypto']  = 'ssl';
$config['charset']      = 'utf-8';
$config['mailtype']     = 'html';
$config['wordwrap']     = TRUE;
$config['wrapchars']    = 76;

// 发送邮件
$this->load->library('email');
$this->email->from('noreply@myapp.com', 'MyApp');
$this->email->to($user_email);
$this->email->subject('欢迎注册 MyApp');
$this->email->message('<h1>欢迎 '.$username.'</h1><p>点击链接激活：<a href="'.$url.'">'.$url.'</a></p>');
$this->email->attach('/path/to/invoice.pdf');  // 附件

if (!$this->email->send()) {
    log_message('error', $this->email->print_debugger());
    show_error('邮件发送失败');
}

// 批量发送（CC/BCC）
$this->email->bcc(array('admin1@x.com', 'admin2@y.com'));
$this->email->send();

// 调试（开发环境）
echo $this->email->print_debugger(array('headers', 'subject', 'body'));
```

**关键参数**：

| 配置 | 默认 | 用途 |
|---|---|---|
| `protocol` | `mail` | mail/smtp/sendmail |
| `smtp_host` | - | SMTP 服务器地址 |
| `smtp_port` | 25 | SMTP 端口（587/465/25） |
| `smtp_crypto` | - | tls/ssl（加密） |
| `smtp_user`/`smtp_pass` | - | SMTP 认证 |
| `mailtype` | `text` | text/html |
| `charset` | `utf-8` | 邮件编码 |
| `wordwrap` | FALSE | TRUE 自动换行（76 字符） |
| `validate` | FALSE | TRUE 检查 email 地址格式 |

**最佳实践**：
1. ✅ 生产用 `smtp` + `smtp_crypto=ssl`，不要用 PHP `mail()`（依赖系统 sendmail）
2. ✅ Gmail 强制要求 `smtp_crypto=ssl` + `smtp_port=465`
3. ✅ 用 `getenv('SMTP_PASS')` 从环境变量取密码，不要写死
4. ✅ `mailtype=html` 时，HTML 内容要用 `htmlspecialchars` 包裹变量防注入
5. ✅ 大批量邮件（> 100 封）用队列（Redis/RabbitMQ），不要直接 `send()`（同步阻塞）
6. ✅ 邮件发送失败要重试（最多 3 次）——SMTP 服务器偶发超时
7. ✅ `wordwrap=TRUE` 防止长 URL 换行打乱格式

### 20. Migration 数据库迁移（版本化 schema 演进）

**问题场景**：开发、测试、生产环境的数据库 schema 经常不一致（开发加了字段，生产忘了同步）。CI3 的 `Migration` 库提供**版本化迁移**——每次 schema 变化写一个文件，按版本号顺序执行。

**解决方案**：
```php
// application/config/migration.php
$config['migration_enabled'] = TRUE;
$config['migration_path'] = APPPATH.'migrations/';
$config['migration_version'] = 5;  // 当前生产版本
$config['migration_table'] = 'migrations';

// application/migrations/001_create_users.php
defined('BASEPATH') OR exit('No direct script access allowed');
class Migration_Create_users extends CI_Migration {
    public function up() {
        $this->dbforge->add_field(array(
            'id' => array('type' => 'INT', 'constraint' => 11, 'auto_increment' => TRUE),
            'name' => array('type' => 'VARCHAR', 'constraint' => 100),
            'email' => array('type' => 'VARCHAR', 'constraint' => 100, 'unique' => TRUE),
            'created_at' => array('type' => 'DATETIME', 'null' => FALSE),
        ));
        $this->dbforge->add_key('id', TRUE);
        $this->dbforge->create_table('users');
    }
    public function down() {
        $this->dbforge->drop_table('users');
    }
}

// application/migrations/002_add_user_avatar.php
class Migration_Add_user_avatar extends CI_Migration {
    public function up() {
        $this->dbforge->add_column('users', array(
            'avatar' => array('type' => 'VARCHAR', 'constraint' => 255, 'null' => TRUE),
        ));
    }
    public function down() {
        $this->dbforge->drop_column('users', 'avatar');
    }
}

// 命令行执行迁移
// php index.php migrate
// php index.php migrate/version/3  // 迁移到指定版本
// php index.php migrate/rollback   // 回滚一步
```

**关键参数**：

| 配置 | 默认 | 用途 |
|---|---|---|
| `migration_enabled` | FALSE | TRUE 启用 |
| `migration_path` | `migrations/` | 迁移文件目录 |
| `migration_version` | 0 | 起始版本号 |
| `migration_table` | `migrations` | 记录迁移历史的表 |
| `migration_type` | `timestamp` | timestamp/sequential（CI3.1+ 推荐 sequential） |
| 文件名前缀 | 三位数字 | `001_*`/`002_*` 或 `2026_01_01_*` |

**最佳实践**：
1. ✅ 一个文件只做一次 schema 变化（创建表/加字段/加索引分开）
2. ✅ `up()` 和 `down()` 都要写——回滚测试比正向迁移更重要
3. ✅ 加字段用 `add_column` 不用 `query('ALTER TABLE')`——dbforge 跨数据库兼容
4. ✅ 大表 ALTER（> 100 万行）要在维护窗口跑，CI3 不支持在线 DDL
5. ✅ 生产环境先备份数据库再跑 `migrate`（CI3 迁移不可逆，除非有备份）
6. ✅ 用 `sequential` 命名（`001_*`）而不是 `timestamp`（`2026_*`）——sequential 简单易读
7. ✅ CI/CD 流水线集成 `migrate`：deploy 脚本前先 `php index.php migrate`

**标签**：#CodeIgniter #PHP #Web框架 #MVC
**状态**：20/20 份详细内容
