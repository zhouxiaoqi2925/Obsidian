# WordPress - 钩子驱动CMS

**来源**：GitHub WordPress/WordPress (~20k stars)
**创建时间**：2026-06-02

---

## 一、引导与核心（Bootstrap & Core）

### 1. 5 层入口链（Layered Entry Guards）

**问题场景**：WordPress 要跑在 2003 年的共享主机、2010 年的 VPS、2025 年的 K8s——任何层 fail 都可能让用户看到白屏。WP 用 5 层入口链，**每层 1 个 guard**，"层层防 fail"。

**解决方案**：
```php
// 1. index.php - 18 行
define( 'WP_USE_THEMES', true );
require __DIR__ . '/wp-blog-header.php';

// 2. wp-blog-header.php - 22 行
if ( ! isset( $wp_did_header ) ) {
    $wp_did_header = true;
    require_once __DIR__ . '/wp-load.php';
    wp();
    require_once ABSPATH . WPINC . '/template-loader.php';
}

// 3. wp-load.php - 106 行
define( 'ABSPATH', __DIR__ . '/' );
require_once ABSPATH . 'wp-config.php';      // 配置存在性 guard
require_once ABSPATH . WPINC . '/load.php';   // 早期错误处理
require_once ABSPATH . WPINC . '/class-wp-hook.php';
// ...
wp_set_wpdb_vars();

// 4. wp-settings.php - 794 行（手动 require 链）
wp_initial_constants();
wp_check_php_mysql_versions();
wp_fix_server_vars();
wp_debug_mode();
wp_register_fatal_error_handler();
// ... 100+ require

// 5. 内核启动
wp();  // 触发 WP 主流程
```

**关键参数**：

| 入口文件 | 行数 | 职责 |
|---|---|---|
| `index.php` | 18 | 浏览器入口（gzip/前端） |
| `wp-blog-header.php` | 22 | 防重入 `$wp_did_header` |
| `wp-load.php` | 106 | 加载 config + WP 类 |
| `wp-settings.php` | 794 | 100+ 手动 require |
| `wp-config.php` | - | 数据库/密钥配置（运行时） |

**最佳实践**：
1. ✅ **不要跳过**任何一层——每层都有 guard 价值
2. ✅ `$wp_did_header` 防止 wp-blog-header 重复 require
3. ✅ `wp-config.php` 不在仓库——避免密钥泄露
4. ✅ 调试可设置 `WP_DEBUG_LOG` + `WP_DEBUG_DISPLAY`——日志到 `wp-content/debug.log`
5. ✅ 5 层哲学比 Laravel "1 个 public/index.php" 更"老主机友好"

### 2. wp-settings.php 794 行手动 require 链

**问题场景**：Composer 的 autoloader 要 build step，老 FTP 部署没有 build。WP 2026 年仍**不用 Composer**——`wp-settings.php` 794 行手写 `require` 链，加载 100+ 核心文件。

**解决方案**：
```php
// wp-settings.php 关键片段
// L1-50: 早期常量 + 错误处理
define( 'WPINC', 'wp-includes' );
require ABSPATH . WPINC . '/load.php';
require ABSPATH . WPINC . '/class-wp-error.php';
require ABSPATH . WPINC . '/class-wp-paused-extensions-storage.php';
require ABSPATH . WPINC . '/class-wp-exception.php';

// L51-150: 兼容性 + 早期 hook
require ABSPATH . WPINC . '/compat.php';
require ABSPATH . WPINC . '/functions.php';
require ABSPATH . WPINC . '/class-wp-hook.php';
require ABSPATH . WPINC . '/class-wp-hooks.php';
require ABSPATH . WPINC . '/plugin.php';

// L151-300: 核心类
require ABSPATH . WPINC . '/class-wpdb.php';
require ABSPATH . WPINC . '/class-wp-query.php';
require ABSPATH . WPINC . '/class-wp-post.php';
require ABSPATH . WPINC . '/class-wp-user.php';
require ABSPATH . WPINC . '/class-wp-taxonomy.php';

// L301-794: 主题/插件/ABSPATH
wp_set_theme_vars();
wp_load_default_textdomain( 'default' );
// ...
$GLOBALS['wp'] = new WP();  // 创建主 WP 对象
```

**关键参数**：

| 阶段 | 行数 | 加载内容 |
|---|---|---|
| 早期常量 | 1-50 | WPINC、ABSPATH、错误处理 |
| 兼容性 | 51-100 | compat.php、functions.php |
| 核心类 | 100-300 | wpdb、WP_Query、WP_Post |
| 主题/插件 | 300-600 | 主题初始化、插件注册 |
| WP 主对象 | 600-794 | `new WP()` |

**最佳实践**：
1. ✅ **不要为"性能"裁剪 require**——FTW（First Time Wp-load）后即缓存 opcache
2. ✅ `SHORTINIT` 短路（`wp-settings.php:169`）——只加载到 L10n 之前
3. ✅ 改 require 顺序会影响 hook 时机——必须严格保持
4. ✅ 用 OPcache 加速——500ms 首请求 → 50ms 后续
5. ✅ SHORTINIT 适用场景：WP-CLI、REST API serverless、cron 极简启动

### 3. SHORTINIT 短路加载（轻量级 WP）

**问题场景**：某些场景（WP-CLI、serverless、cron）不需要完整 WP——WP-CLI 只需要 user management，serverless 只需要 REST。**SHORTINIT** 让 `wp-load.php` 只加载 L10n 之前，**启动时间 < 100ms**。

**解决方案**：
```php
// wp-load.php
if ( defined( 'SHORTINIT' ) && SHORTINIT ) {
    // 极简加载
    require ABSPATH . WPINC . '/load.php';
    require ABSPATH . WPINC . '/class-wp-hook.php';
    require ABSPATH . WPINC . '/class-wp-error.php';
    require ABSPATH . WPINC . '/formatting.php';
    require ABSPATH . WPINC . '/l10n.php';
    require ABSPATH . WPINC . '/option.php';
    // 故意不加载：wpdb、WP_Query、plugin API
    return;
}
// 否则：完整 wp-settings 链
```

```php
// 用法：WP-CLI 极简启动
define( 'SHORTINIT', true );
require __DIR__ . '/wp-load.php';
// 内存占用 ~ 5MB（vs 完整 WP ~ 50MB）
// 启动时间 < 100ms
```

**关键参数**：

| 加载阶段 | 标准 | SHORTINIT |
|---|---|---|
| load.php | ✅ | ✅ |
| class-wp-hook.php | ✅ | ✅ |
| l10n.php | ✅ | ✅ |
| class-wpdb.php | ✅ | ❌ |
| WP_Query | ✅ | ❌ |
| plugin.php | ✅ | ❌ |
| theme.php | ✅ | ❌ |

**最佳实践**：
1. ✅ SHORTINIT 内存 < 10MB（vs 50MB 完整 WP）
2. ✅ 用于 WP-CLI `--skip-plugins` 等极简场景
3. ✅ 用于 serverless（AWS Lambda、Vercel Edge）
4. ✅ 用 `wp_load_translations_early()` 提前加载翻译
5. ✅ **不要在 SHORTINIT 下访问 wpdb**——会 fatal

### 4. WP_Hook 迭代器（递归事件总线）

**问题场景**：钩子系统要支持**递归调用**——A 钩子触发 B 钩子又加新钩子 C 钩子。WP 用 `WP_Hook implements Iterator` 让钩子数组**在迭代中安全增删**。

**解决方案**：
```php
// wp-includes/class-wp-hook.php
final class WP_Hook implements Iterator, ArrayAccess {
    public $callbacks = array();           // [priority][unique_id] => {function, accepted_args}
    protected $priorities = array();       // 排序后的优先级键
    private $iterations = array();         // 正在迭代的优先级数组
    private $nesting_level = 0;            // 递归层级

    public function add_filter(
        $hook_name, $callback, $priority, $accepted_args
    ) {
        $idx = _wp_filter_build_unique_id( $hook_name, $callback, $priority );
        $this->callbacks[ $priority ][ $idx ] = compact( 'callback', 'accepted_args' );
        unset( $this->resorted );  // 标记需重排
    }

    public function do_action( $args ) {
        $this->nesting_level++;
        $this->iterations[] = array_keys( $this->callbacks );
        // 迭代当前优先级
        if ( ! empty( $this->callbacks[ $priority ] ) ) {
            foreach ( $this->callbacks[ $priority ] as $id => $cb ) {
                call_user_func_array( $cb['callback'], $args );
            }
        }
        $this->nesting_level--;
        if ( 0 === $this->nesting_level ) {
            $this->resort_active_iterations();  // 处理迭代中新增的 hook
        }
    }
}
```

**关键参数**：

| 字段 | 作用 |
|---|---|
| `$callbacks[priority][unique_id]` | 二维数组：优先级 + 唯一 ID |
| `$priorities` | 排序后的优先级键（升序） |
| `$iterations` | 正在迭代的优先级数组（用于恢复） |
| `$nesting_level` | 递归层级（0 时重排） |
| `$resorted` | bool 标记，触发重排 |

**最佳实践**：
1. ✅ `add_action('init', $cb, 10)` 优先级 10 默认
2. ✅ 用 `did_action('init')` 检查钩子是否已触发
3. ✅ `remove_action()` 时机**必须早于**钩子触发
4. ✅ 钩子回调避免**无限递归**——会爆栈
5. ✅ `apply_filters_ref_array` 传引用数组——性能优于 `apply_filters`

### 5. add_action / add_filter 全局函数 API

**问题场景**：50000+ 插件需要"在 WP 关键节点插入逻辑"——但 WP 没有"中央调度器"。`add_action / add_filter` 是 18 年沉淀的**伪 OOP 事件总线 API**，所有功能挂到全局 `$wp_filter` 数组。

**解决方案**：
```php
// 插件开发典型用法
add_action( 'init', 'my_plugin_init' );
add_action( 'save_post', 'my_save_post', 10, 2 );  // 2 个参数
add_filter( 'the_content', 'my_filter_content' );

function my_plugin_init() {
    register_post_type( 'product', array(
        'public' => true,
        'labels' => array( 'name' => 'Products' )
    ) );
}

function my_filter_content( $content ) {
    return $content . '<p>感谢阅读！</p>';
}

// 全局钩子数组
global $wp_filter;
$wp_filter['init']->callbacks[10]['my_plugin_init'] = array(
    'function'      => 'my_plugin_init',
    'accepted_args' => 0
);
```

**关键参数**：

| API | 用途 | 返回值 |
|---|---|---|
| `add_action($hook, $cb, $priority, $args)` | 注册动作钩子 | `$priority` (int) |
| `add_filter($hook, $cb, $priority, $args)` | 注册过滤钩子 | `$priority` (int) |
| `do_action($hook, $args)` | 触发动作 | void |
| `apply_filters($hook, $value, $args)` | 触发过滤 | 修改后的值 |
| `remove_action($hook, $cb, $priority)` | 移除动作 | bool |
| `has_action($hook, $cb)` | 检查动作存在 | bool/priority |
| `did_action($hook)` | 检查动作触发次数 | int |

**最佳实践**：
1. ✅ 钩子回调函数名**用前缀**（`myplugin_init`）防冲突
2. ✅ 优先级默认 10——10 之前是"早期"，20+ 是"晚期"
3. ✅ 接收参数数量用第 4 个参数（`accepted_args`）
4. ✅ 不用 OOP namespace 包装——保持向后兼容
5. ✅ `did_action('init')` 防止 init 钩子内重复执行

## 二、数据库与查询（Data Layer）

### 6. wpdb 4154 行 DB 抽象（不迁 PDO）

**问题场景**：PHP 5.2 / MySQL 3.23 时代要写 DB 抽象层，但当时 PDO 还没普及。WP 基于 2003 年 ezSQL 写了 `wpdb` 类（4154 行），至今不迁 PDO——**为了兼容 18 年的老主机**。

**解决方案**：
```php
// wp-includes/class-wpdb.php
class wpdb {
    public $show_errors = false;
    public $last_error = '';
    public $num_queries = 0;          // 性能计数
    public $queries = array();         // SAVEQUERIES 模式下记录
    public $insert_id = 0;             // 最后插入 ID
    public $rows_affected = 0;
    public $last_result;
    public $col_info = array();
    public $dbuser, $dbpassword, $dbname, $dbhost, $dbcharset, $dbcollate;
    protected $dbh;                    // mysqli 句柄
    protected $result;                 // mysqli_result
    protected $is_mysql = null;

    public function prepare( $sql, ...$args ) {
        // 用 %s / %d / %f 占位符模拟 prepared statement
        // 注意：这不是真 prepared，是字符串 escape
        $sql = str_replace( "'%s'", '%s', $sql );
        $query = $this->add_placeholder_escape( $query );
        return @vsprintf( $query, $args );
    }

    public function query( $sql ) {
        $this->num_queries++;
        // ... 实际执行
    }
}

// 用法
global $wpdb;
$wpdb->query( $wpdb->prepare( "DELETE FROM $wpdb->posts WHERE ID = %d", $id ) );
$posts = $wpdb->get_results( "SELECT * FROM $wpdb->posts WHERE post_status = %s", 'publish' );
```

**关键参数**：

| 占位符 | 用途 | 实际替换 |
|---|---|---|
| `%s` | string | `addslashes($value)` |
| `%d` | integer | `(int)$value` |
| `%f` | float | `(float)$value` |
| `%%` | literal % | `%` |
| `%i` (5.3+) | identifier (table/field) | escape backtick |

**最佳实践**：
1. ✅ **永远**用 `$wpdb->prepare()`——不要拼 SQL
2. ✅ `%s` 占位符加引号：`"WHERE name = %s"`
3. ✅ `db.php` drop-in 替换 wpdb（如 Postgres 兼容）
4. ✅ `SAVEQUERIES` 常量打开慢查询日志
5. ✅ 表名用 `$wpdb->posts`（不是 `wp_posts`）——支持自定义表前缀

### 7. WP_Query 主循环（The Loop）

**问题场景**：WP 主题要"按条件取文章列表 + 循环渲染"——所有主题都需要"主循环"。`WP_Query` 类（5114 行）封装 SQL 构造 + 结果集 + 循环状态机。

**解决方案**：
```php
// 主题的 index.php 标准循环
if ( have_posts() ) :
    while ( have_posts() ) : the_post();
        ?>
        <article>
            <h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
            <div class="excerpt"><?php the_excerpt(); ?></div>
        </article>
        <?php
    endwhile;
else :
    echo '<p>暂无内容</p>';
endif;

// 自定义查询
$custom = new WP_Query( array(
    'post_type'      => 'product',
    'posts_per_page' => 10,
    'meta_key'       => 'price',
    'orderby'        => 'meta_value_num',
    'order'          => 'ASC',
    'tax_query'      => array(
        array(
            'taxonomy' => 'product_cat',
            'field'    => 'slug',
            'terms'    => 'electronics',
        ),
    ),
) );

while ( $custom->have_posts() ) {
    $custom->the_post();
    // ...
}
wp_reset_postdata();
```

**关键参数**：

| 参数 | 用途 | 默认 |
|---|---|---|
| `post_type` | 文章类型 | `post` |
| `posts_per_page` | 每页数量 | `get_option('posts_per_page')` |
| `orderby` | 排序字段 | `date` |
| `order` | 升降序 | `DESC` |
| `meta_query` | 自定义字段过滤 | - |
| `tax_query` | 分类法过滤 | - |
| `paged` | 分页 | 1 |

**最佳实践**：
1. ✅ **不要**用 `query_posts()`——它改全局 state
2. ✅ 改全局循环用 `pre_get_posts` 钩子
3. ✅ 自定义查询用 `WP_Query` + `wp_reset_postdata()`
4. ✅ `no_found_rows=true` 优化无分页查询
5. ✅ `fields=ids` 只取 ID——减少内存

### 8. 模板加载器（Template Hierarchy）

**问题场景**：用户访问 `/2026/01/post-slug/`——WP 怎么知道渲染 `single.php` 还是 `page.php`？**Template Hierarchy** 按"匹配规则"逐级找模板，**主题作者只放存在的模板**。

**解决方案**：
```php
// wp-includes/template-loader.php 简化
function template_loader() {
    if ( is_404() && $template = get_404_template() ) : /*...*/;
    elseif ( is_search() && $template = get_search_template() ) : /*...*/;
    elseif ( is_front_page() && $template = get_front_page_template() ) : /*...*/;
    elseif ( is_home() && $template = get_home_template() ) : /*...*/;
    elseif ( is_post_type_archive() && $template = get_post_type_archive_template() ) : /*...*/;
    elseif ( is_tax() && $template = get_taxonomy_template() ) : /*...*/;
    elseif ( is_attachment() && $template = get_attachment_template() ) : /*...*/;
    elseif ( is_single() && $template = get_single_template() ) : /*...*/;
    elseif ( is_page() && $template = get_page_template() ) : /*...*/;
    elseif ( is_singular() && $template = get_singular_template() ) : /*...*/;
    elseif ( is_category() && $template = get_category_template() ) : /*...*/;
    elseif ( is_tag() && $template = get_tag_template() ) : /*...*/;
    elseif ( is_author() && $template = get_author_template() ) : /*...*/;
    elseif ( is_date() && $template = get_date_template() ) : /*...*/;
    elseif ( is_archive() && $template = get_archive_template() ) : /*...*/;
    else :
        $template = get_index_template();
    endif;
    if ( $template = apply_filters( 'template_include', $template ) ) {
        include $template;
    }
}
```

**关键参数**：

| 页面 | 主题模板查找顺序 |
|---|---|
| 首页 | `front-page.php` → `home.php` → `index.php` |
| 单文章 | `single-{post_type}.php` → `single.php` → `singular.php` → `index.php` |
| 页面 | `{custom-template}.php` → `page-{slug}.php` → `page-{id}.php` → `page.php` → `singular.php` → `index.php` |
| 分类 | `category-{slug}.php` → `category-{id}.php` → `category.php` → `archive.php` → `index.php` |
| 标签 | `tag-{slug}.php` → `tag-{id}.php` → `tag.php` → `archive.php` → `index.php` |
| 自定义分类法 | `taxonomy-{tax}-{term}.php` → `taxonomy-{tax}.php` → `taxonomy.php` → `archive.php` → `index.php` |
| 作者 | `author-{nicename}.php` → `author-{id}.php` → `author.php` → `archive.php` → `index.php` |
| 404 | `404.php` → `index.php` |

**最佳实践**：
1. ✅ 主题**永远**带 `index.php`——是 fallback
2. ✅ 用 `get_template_part('content', 'page')` 复用模板片段
3. ✅ 模板**只放 HTML/最小 PHP**——逻辑放 functions.php
4. ✅ 子主题覆盖父主题模板——`child-theme/style.css: Template: parent`
5. ✅ `template_include` 钩子可改写整个加载流程

### 9. 自定义文章类型与分类法（CPT + Taxonomies）

**问题场景**：客户要"产品 / 团队成员 / 案例研究"——WP 默认只有 post 和 page。**CPT（Custom Post Type）+ Taxonomies** 让用户扩展内容模型而不动核心。

**解决方案**：
```php
// 注册自定义文章类型
add_action( 'init', 'register_product_post_type' );
function register_product_post_type() {
    register_post_type( 'product', array(
        'labels' => array(
            'name'          => 'Products',
            'singular_name' => 'Product',
            'add_new_item'  => '添加新产品',
        ),
        'public'      => true,
        'has_archive' => true,
        'menu_icon'   => 'dashicons-cart',
        'supports'    => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields' ),
        'rewrite'     => array( 'slug' => 'products' ),
        'show_in_rest' => true,  // Gutenberg + REST API
    ) );
}

// 注册自定义分类法
register_taxonomy( 'product_cat', 'product', array(
    'labels' => array( 'name' => 'Product Categories' ),
    'hierarchical' => true,  // 类似 category
    'show_in_rest' => true,
    'rewrite'      => array( 'slug' => 'product-category' ),
) );

// 用法：meta_query + tax_query
$products = new WP_Query( array(
    'post_type'  => 'product',
    'tax_query'  => array(
        array(
            'taxonomy' => 'product_cat',
            'field'    => 'slug',
            'terms'    => 'electronics',
        ),
    ),
    'meta_query' => array(
        array(
            'key'     => 'price',
            'value'   => 100,
            'type'    => 'NUMERIC',
            'compare' => '<=',
        ),
    ),
) );
```

**关键参数**：

| 字段 | 用途 |
|---|---|
| `public` | 后台可编辑 + 前台可访问 |
| `has_archive` | 有 archive 页（`/products/`） |
| `supports` | 启用字段（title/editor/thumbnail 等） |
| `show_in_rest` | 暴露给 REST + Gutenberg |
| `hierarchical` | taxonomy 是否层级（如 category） |
| `rewrite.slug` | URL slug |

**最佳实践**：
1. ✅ `show_in_rest: true`——Gutenberg + REST 友好
2. ✅ `has_archive: true` 启用 archive 页
3. ✅ `capability_type` 字段细粒度权限
4. ✅ 注册 hook 用 `init`，**不要用** `wp_loaded`
5. ✅ 改 `supports` 必 flush_rewrite_rules——访问 Settings > Permalinks

### 10. wp_options 键值存储（核心配置中心）

**问题场景**：WP 全局配置（siteurl、blogname、active_plugins、rewrite_rules）都要存数据库。**`wp_options` 表**是键值存储——autoload 字段决定是否随每次查询加载。

**解决方案**：
```sql
-- wp_options 表结构
CREATE TABLE wp_options (
    option_id    bigint(20) unsigned AUTO_INCREMENT PRIMARY KEY,
    option_name  varchar(191) NOT NULL,
    option_value longtext NOT NULL,
    autoload     varchar(20) NOT NULL DEFAULT 'yes'
);
```

```php
// 增删改查
add_option( 'my_plugin_setting', 'default', '', 'yes' );
$value = get_option( 'my_plugin_setting', 'default' );
update_option( 'my_plugin_setting', 'new_value' );
delete_option( 'my_plugin_setting' );

// 高级：序列化数据
$settings = array(
    'api_key' => 'xxx',
    'enabled' => true,
);
update_option( 'my_plugin', $settings );
$saved = get_option( 'my_plugin' );
// $saved = ['api_key' => 'xxx', 'enabled' => true];
```

**关键参数**：

| 字段 | 用途 |
|---|---|
| `option_id` | 自增主键 |
| `option_name` | 唯一键 |
| `option_value` | longtext（可序列化） |
| `autoload` | `yes`/`no`/`on`/`off`/`auto` |

**最佳实践**：
1. ✅ 设置项**永远**用 `wp_options`——不要建新表
2. ✅ `autoload='yes'` 的选项**会被一次查询加载**——避免太多
3. ✅ 大数据用 `autoload='no'`（按需加载）
4. ✅ `pre_set_option_xxx` 钩子拦截更新
5. ✅ 用 `register_setting()` API（WP Settings API）——自动 nonce

## 三、扩展与生态（Extensibility）

### 11. 插件机制（plugins / mu-plugins / drop-ins）

**问题场景**：WP 18 年沉淀了 50000+ 插件——这些插件**怎么被发现？怎么加载？**WP 用 3 级插件系统：

**解决方案**：
```php
// 1. 普通插件（wp-content/plugins/）
// 插件目录结构
wp-content/plugins/my-plugin/
├── my-plugin.php        // 插件主文件（有插件头）
├── readme.txt
├── includes/
│   ├── class-my-plugin.php
│   └── class-my-settings.php
└── assets/
    ├── style.css
    └── script.js

// 插件头
<?php
/*
Plugin Name: My Plugin
Plugin URI: https://example.com
Description: 描述
Version: 1.0.0
Author: Your Name
License: GPL v2+
*/

// 2. mu-plugins（必须用，wp-content/mu-plugins/）
// 自动激活，不显示在插件列表
// 用于公司内部插件（不能被禁用）

// 3. drop-ins（wp-content/）
// 替换 WP 核心文件：
//   - db.php（替换 wpdb）
//   - advanced-cache.php（替换 WP-Cache）
//   - object-cache.php（替换对象缓存）
//   - maintenance.php（维护模式）
//   - sunrise.php（多站点）
```

**关键参数**：

| 类型 | 位置 | 激活 | 优先级 |
|---|---|---|---|
| 普通插件 | `wp-content/plugins/` | 后台手动 | 中 |
| must-use 插件 | `wp-content/mu-plugins/` | **自动** | 高（先于普通） |
| drop-ins | `wp-content/` | 替换核心 | 最高 |

**最佳实践**：
1. ✅ **核心业务插件**用 mu-plugins——防客户禁用
2. ✅ `db.php` drop-in 替换 wpdb——支持 MySQL 外部数据源
3. ✅ `object-cache.php` drop-in 接 Memcached/Redis
4. ✅ `maintenance.php` 维护模式——503 期间显示
5. ✅ 插件**不要直接 require**——用 `plugin_dir_path(__FILE__)`

### 12. 主题系统（Themes & Child Themes）

**问题场景**：用户想"改样式不丢升级"——直接改 `wp-content/themes/twentytwentyfour/`，下次升级会丢失。**Child Theme** 让用户继承父主题 + 覆盖文件。

**解决方案**：
```css
/* wp-content/themes/my-child-theme/style.css */
@import url("../twentytwentyfour/style.css");  /* 继承父主题 */

body {
    background: #f0f0f0;
}
```

```php
<!-- wp-content/themes/my-child-theme/functions.php -->
<?php
// 子主题 functions.php 在父主题之后加载
// 可重写父主题函数
add_action( 'wp_enqueue_scripts', 'child_enqueue_styles' );
function child_enqueue_styles() {
    wp_enqueue_style( 'parent-style', get_template_directory_uri() . '/style.css' );
    wp_enqueue_style( 'child-style', get_stylesheet_uri() );
}
```

**关键参数**：

| 字段 | 文件 | 必填 |
|---|---|---|
| `Theme Name` | style.css | ✅ |
| `Template` | style.css | ✅ 子主题必填 |
| `Version` | style.css | - |
| `Text Domain` | style.css | - i18n |

**最佳实践**：
1. ✅ **永远**用 child theme 改主题——不要直接改父主题
2. ✅ `Template: twentytwentyfour` 在 style.css 头部
3. ✅ 子主题 `functions.php` 在父主题**之后**加载
4. ✅ 用 `get_template_directory()` 拿父主题路径
5. ✅ 用 `get_stylesheet_directory()` 拿子主题路径

### 13. 块编辑器（Gutenberg / Block API）

**问题场景**：WYSIWYG 编辑器让非技术用户也能编辑页面——但 TinyMCE/CKEditor 都有扩展难题。**Gutenberg（Block Editor）**用 React 块系统，2018 年 WP 5.0 引入，2025 年成主流。

**解决方案**：
```js
// wp-content/plugins/my-plugin/blocks/my-block/index.js
import { registerBlockType } from '@wordpress/blocks';
import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

registerBlockType( 'my-plugin/my-block', {
    apiVersion: 3,
    title: __( 'My Block', 'my-plugin' ),
    icon: 'smiley',
    category: 'design',
    attributes: {
        title: { type: 'string', default: '' },
    },
    edit: ( { attributes, setAttributes } ) => {
        const blockProps = useBlockProps();
        return (
            <div { ...blockProps }>
                <input
                    value={ attributes.title }
                    onChange={ ( e ) => setAttributes( { title: e.target.value } ) }
                />
            </div>
        );
    },
    save: ( { attributes } ) => {
        return <div { ...useBlockProps.save() }><h2>{ attributes.title }</h2></div>;
    },
} );
```

```php
// 注册块（PHP 端）
add_action( 'init', 'register_my_block' );
function register_my_block() {
    register_block_type( __DIR__ . '/build/my-block' );
}
```

**关键参数**：

| 概念 | 用途 |
|---|---|
| `registerBlockType` | JS API 注册块 |
| `attributes` | 块属性（持久化到 HTML） |
| `edit` | 编辑器内 UI |
| `save` | 输出到前端的 HTML |
| `InnerBlocks` | 嵌套子块 |
| `apiVersion: 3` | 新 API 版本（推荐） |

**最佳实践**：
1. ✅ 用 `wp-scripts`（`@wordpress/scripts`）构建
2. ✅ `attributes` 是块数据的"持久化"——`save` 输出 HTML
3. ✅ `InnerBlocks` 嵌套——容器块
4. ✅ Server-side rendering（`render_callback`）——动态内容
5. ✅ `block.json` 元数据文件——声明块配置

### 14. REST API（57 文件）

**问题场景**：移动端、第三方应用要读 WP 内容——传统 RSS 不够。**WP REST API** 把所有内容暴露成 JSON 端点（`/wp-json/wp/v2/posts`），2016 年 WP 4.4 引入核心。

**解决方案**：
```php
// 注册自定义端点
add_action( 'rest_api_init', 'register_my_endpoint' );
function register_my_endpoint() {
    register_rest_route( 'my-plugin/v1', '/products', array(
        'methods'             => 'GET',
        'callback'            => 'get_products',
        'permission_callback' => function() {
            return current_user_can( 'read' );
        },
        'args' => array(
            'category' => array(
                'required' => false,
                'type'     => 'string',
            ),
        ),
    ) );
}

function get_products( WP_REST_Request $request ) {
    $category = $request->get_param( 'category' );
    $posts = get_posts( array(
        'post_type'   => 'product',
        'tax_query'   => array(
            array(
                'taxonomy' => 'product_cat',
                'field'    => 'slug',
                'terms'    => $category,
            ),
        ),
    ) );
    return rest_ensure_response( $posts );
}

// 用法
// GET /wp-json/my-plugin/v1/products?category=electronics
```

**关键参数**：

| 端点 | 用途 |
|---|---|
| `/wp/v2/posts` | 文章列表 |
| `/wp/v2/posts/{id}` | 单文章 |
| `/wp/v2/pages` | 页面 |
| `/wp/v2/users` | 用户 |
| `/wp/v2/media` | 媒体 |
| `/wp/v2/categories` | 分类 |
| `/wp/v2/tags` | 标签 |
| `/wp/v2/comments` | 评论 |
| `/wp/v2/settings` | 设置（仅管理员） |

**最佳实践**：
1. ✅ **永远**用 `permission_callback`——默认是 `__return_true`
2. ✅ 用 `register_rest_field()` 扩展现有端点字段
3. ✅ `sanitize_callback` 验证输入
4. ✅ Authentication 用 Application Passwords（WP 5.6+）
5. ✅ CORS 用 `rest_pre_serve_request` 钩子

### 15. 国际化（i18n / l10n / pomo）

**问题场景**：WP 用户覆盖全球——菜单/按钮/提示必须翻译。**i18n** 框架用 `_e()` / `__()` / `_x()` 函数包裹字符串，**pomo** 工具提取并生成 `.mo` 文件。

**解决方案**：
```php
// 包裹字符串
_e( 'Hello, World!', 'my-plugin' );
echo __( 'Welcome, %s', 'my-plugin' );  // sprintf 用法
echo _x( 'Post', 'noun', 'my-plugin' );  // context 区分
echo _n( '%s item', '%s items', $count, 'my-plugin' );  // 复数

// 提取：wp i18n make-pot . languages/my-plugin.pot
// 生成 .po 文件：msginit
// 编译 .mo：msgfmt

// 运行时加载
add_action( 'init', 'load_textdomain' );
function load_textdomain() {
    load_plugin_textdomain(
        'my-plugin',
        false,
        dirname( plugin_basename( __FILE__ ) ) . '/languages'
    );
}

// wp-content/plugins/my-plugin/languages/
//   my-plugin-zh_CN.po  (文本)
//   my-plugin-zh_CN.mo  (编译后，二进制)
```

**关键参数**：

| 函数 | 用途 | 是否输出 |
|---|---|---|
| `__($s, $d)` | 翻译 | 返回字符串 |
| `_e($s, $d)` | 翻译 | echo |
| `_x($s, $c, $d)` | 带 context | 返回 |
| `_ex($s, $c, $d)` | 带 context | echo |
| `_n($s, $p, $n, $d)` | 复数 | 返回 |
| `_nx($s, $p, $n, $c, $d)` | 复数+context | 返回 |
| `esc_html__` | 转义后翻译 | 返回（HTML 安全） |
| `esc_html_e` | 转义后翻译 | echo（HTML 安全） |
| `esc_attr__` | 属性值翻译 | 返回（属性安全） |

**最佳实践**：
1. ✅ **永远**用 `_e` / `__` 包裹用户可见字符串
2. ✅ Text Domain = 插件 slug，**不要用** "default"
3. ✅ `wp i18n make-pot` 自动提取所有可翻译字符串
4. ✅ 复数用 `_n`——不要自己 `if ($n != 1)`
5. ✅ HTML 字符串用 `esc_html__`——防 XSS

## 四、可靠性与生态（Reliability & Ecosystem）

### 16. Recovery Mode 自救模式（5.2+）

**问题场景**：插件抛 fatal，WP 不会白屏——它进入 **Recovery Mode**，**暂停出问题的插件**，给管理员发邮件一键恢复链接。这是 WP 5.2 引入的"软件自我救生"设计。

**解决方案**：
```php
// wp-includes/class-wp-recovery-mode.php
class WP_Recovery_Mode {
    public function initialize() {
        add_filter( 'wp_fatal_error_handler_enabled', '__return_true' );
    }

    public function handle_error( $error ) {
        // 1. 找到出错的扩展（plugin/theme）
        $extension = $this->get_extension_for_error( $error );
        if ( ! $extension ) {
            return;
        }

        // 2. 暂停该扩展
        $paused = $this->pause_extension( $extension );

        // 3. 发送邮件给管理员
        $this->send_recovery_email( $extension, $error );

        // 4. 渲染恢复页面
        $this->render_recovery_page( $extension );
    }

    public function pause_extension( $extension ) {
        $storage = new WP_Paused_Extensions_Storage();
        $paused = $storage->get_paused_extensions();
        $paused[ $extension['type'] ][] = $extension['slug'];
        $storage->save_paused_extensions( $paused );
        return true;
    }
}
```

**关键参数**：

| 触发 | 行为 |
|---|---|
| 插件 fatal | 暂停该插件 + 发邮件 |
| 主题 fatal | 暂停该主题 + 回退到 default theme |
| 多个扩展错误 | 按顺序逐一暂停 |
| 管理员访问 | URL 加 `?recovery_key=xxx` 验证 |

**最佳实践**：
1. ✅ 写插件**永远**包 try-catch——避免触发 Recovery Mode
2. ✅ 主题 `functions.php` 错误**会暂停主题**——谨慎写
3. ✅ 邮件模板可在主题里 override
4. ✅ `paused_extensions` 表存暂停列表
5. ✅ `WP_DISABLE_FATAL_ERROR_HANDLER` 关闭（开发用）

### 17. capabilities 权限系统（细粒度 RBAC）

**问题场景**：WP 默认只有 admin/editor/author 几个角色，但企业站要"产品经理"角色。**capabilities 系统**用**能力（cap）**而非"角色"做权限——细粒度可扩展。

**解决方案**：
```php
// 添加自定义角色
add_role( 'product_manager', '产品经理', array(
    'read'              => true,
    'edit_posts'        => true,
    'edit_products'     => true,    // 自定义 cap
    'publish_products'  => true,
    'delete_products'   => true,
) );

// 给已有角色加 cap
$role = get_role( 'editor' );
$role->add_cap( 'edit_products' );

// 检查权限
if ( current_user_can( 'edit_products' ) ) {
    // 显示编辑按钮
}

// meta_cap 映射
add_filter( 'map_meta_cap', 'product_meta_cap', 10, 4 );
function product_meta_cap( $caps, $cap, $user_id, $args ) {
    if ( 'edit_product' === $cap ) {
        $post = get_post( $args[0] );
        if ( $post->post_author == $user_id ) {
            return array( 'edit_published_posts' );
        }
    }
    return $caps;
}
```

**关键参数**：

| 角色 | 能力 |
|---|---|
| Administrator | 全部（含 install_plugins、manage_options） |
| Editor | edit_posts/publish_posts/edit_others_posts |
| Author | edit_posts/publish_posts（仅自己） |
| Contributor | edit_posts（不发布） |
| Subscriber | read |

**最佳实践**：
1. ✅ **永远用 cap 检查**——`current_user_can('cap')` 而非 `if ($role == 'admin')`
2. ✅ CPT 注册时用 `capability_type` 自定义 cap
3. ✅ `map_meta_cap` 钩子做"作者检查"（只能改自己文章）
4. ✅ 不用 `add_role()` 在主题里——主题禁用会丢
5. ✅ 插件**不要**直接 `add_role()`——用 `register_activation_hook`

### 18. WP-CLI 命令行工具

**问题场景**：管理 100+ WP 站点的运维——`wp-admin` 后台太慢。**WP-CLI** 提供命令行操作（`wp post create`、`wp db export`），运维自动化必备。

**解决方案**：
```bash
# 安装 WP-CLI
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar
mv wp-cli.phar /usr/local/bin/wp

# 常用命令
wp core download --version=6.5
wp config create --dbname=wp --dbuser=root --dbpass=xxx
wp core install --url=example.com --title="My Site" --admin_user=admin --admin_password=xxx --admin_email=admin@example.com
wp post create --post_type=post --post_title='Hello' --post_status=publish
wp post list --post_type=product --meta_key=price --meta_compare='<' --meta_value=100
wp user create bob bob@example.com --role=editor
wp plugin install woocommerce --activate
wp db export backup-$(date +%F).sql
wp db import backup.sql
wp search-replace 'http://old.com' 'https://new.com' --dry-run
wp cron event run my_cron_hook
wp transient delete --all
```

**关键参数**：

| 命令组 | 用途 |
|---|---|
| `wp core` | 核心（下载/安装/版本） |
| `wp post` | 文章 CRUD |
| `wp user` | 用户 CRUD |
| `wp plugin` | 插件（安装/激活/删除） |
| `wp theme` | 主题（安装/激活） |
| `wp db` | 数据库（导出/导入/查询） |
| `wp search-replace` | 站内链接替换 |
| `wp cron` | 定时任务 |
| `wp transient` | 临时缓存 |
| `wp option` | 选项 CRUD |

**最佳实践**：
1. ✅ 生产环境用 `wp search-replace` 改域名——**不要直接改 DB**
2. ✅ `wp db export` 定期备份——加 cron
3. ✅ 写自定义命令：扩展 WP-CLI（`WP_CLI::add_command`）
4. ✅ `wp --allow-root` 在 root 下需要允许
5. ✅ `wp eval` 单行执行 PHP——调试神器

### 19. Cron 系统（wp-cron.php）

**问题场景**：定时发布文章、清理临时数据、发邮件——这些不需要 Linux cron，**wp-cron.php** 提供"伪 cron"：每次访问触发"该跑的 cron"。

**解决方案**：
```php
// 注册 cron
add_action( 'my_hourly_event', 'do_hourly_stuff' );
if ( ! wp_next_scheduled( 'my_hourly_event' ) ) {
    wp_schedule_event( time(), 'hourly', 'my_hourly_event' );
}

function do_hourly_stuff() {
    // 清理临时数据
    $expired = get_posts( array(
        'post_type'   => 'transient',
        'post_status' => 'trash',
        'date_query'  => array(
            array( 'before' => '1 day ago' ),
        ),
    ) );
    foreach ( $expired as $t ) {
        wp_delete_post( $t->ID, true );
    }
}

// 清理 cron
$timestamp = wp_next_scheduled( 'my_hourly_event' );
wp_unschedule_event( $timestamp, 'my_hourly_event' );
```

```bash
# 手动触发 wp-cron
wp cron event list
wp cron event run my_hourly_event
wp cron event schedule my_hourly_event

# 禁用 WP 伪 cron（生产）
define( 'DISABLE_WP_CRON', true );
# 用系统 cron 触发
* * * * * curl https://example.com/wp-cron.php > /dev/null 2>&1
```

**关键参数**：

| 调度 | 名称 | 间隔 |
|---|---|---|
| 每小时 | `hourly` | `HOUR_IN_SECONDS` |
| 每天 | `daily` | `DAY_IN_SECONDS` |
| 每周 | `weekly` | `WEEK_IN_SECONDS` |
| 自定义 | `add_filter('cron_schedules', ...)` | 自定义秒数 |

**最佳实践**：
1. ✅ **生产环境**禁用 WP-Cron + 用系统 cron（`DISABLE_WP_CRON`）
2. ✅ 高流量站 wp-cron.php 压力大——必须外移
3. ✅ `wp_schedule_single_event` 单次定时（不重复）
4. ✅ `wp_next_scheduled` 防止重复注册
5. ✅ `cron_schedules` 钩子加自定义间隔（如每 5 分钟）

### 20. PHPUnit 测试与 GitHub Actions

**问题场景**：WP 插件在 1000 万站点跑——bug 影响巨大。WP 维护一个 **WP-CLI 测试套件**（`wp scaffold plugin-tests`）+ GitHub Actions CI 模板。

**解决方案**：
```bash
# 1. 安装 WP 测试库
wp scaffold plugin-tests my-plugin
# 自动生成：
#   - tests/
#   - .github/workflows/
#   - phpunit.xml.dist
#   - bin/install-wp-tests.sh

# 2. 跑测试
./vendor/bin/phpunit

# 3. 单测示例
namespace Tests;

use WP_UnitTestCase;

class MyPluginTest extends WP_UnitTestCase {
    public function test_post_creation() {
        $post_id = $this->factory->post->create( array(
            'post_title' => 'Test Post',
        ) );
        $this->assertGreaterThan( 0, $post_id );
    }
}
```

```yaml
# .github/workflows/phpunit.yml
name: PHPUnit
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        php: ['7.4', '8.0', '8.1', '8.2']
        wp: ['6.4', '6.5', 'latest']
    steps:
      - uses: actions/checkout@v3
      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
      - name: Install WP
        run: bash bin/install-wp-tests.sh wordpress_test root '' localhost ${{ matrix.wp }}
      - run: composer install
      - run: ./vendor/bin/phpunit
```

**关键参数**：

| 测试 | 工具 | 覆盖 |
|---|---|---|
| 单元测试 | PHPUnit + WP_UnitTestCase | 逻辑函数 |
| 集成测试 | tests/phpunit/integration | DB / API |
| 端到端 | wp-env (Docker) | 浏览器流程 |
| 静态分析 | PHPStan / PHPCS | 类型 + 风格 |
| E2E | Playwright + wp-env | 关键路径 |

**最佳实践**：
1. ✅ `factory->post->create()` 简化测试数据
2. ✅ `setUp()` / `tearDown()` 清理——避免测试污染
3. ✅ 多 PHP + 多 WP 矩阵测试——兼容性保证
4. ✅ **永远**用 `WP_UnitTestCase` 而非 `PHPUnit\Framework\TestCase`——它会引导 WP
5. ✅ `wp-env` Docker 化——团队统一环境

**标签**：#WordPress #CMS #PHP #钩子 #插件
**状态**：20/20 份详细内容
