# Hexo - 静态站点生成器设计模式

**来源**：G:\实战案例\GitHub顶尖项目\hexo\
**创建时间**：2026-06-02

---

## 一、核心机制与扩展点系统

### 1. 12 维度正交扩展点（Twelve Orthogonal Extension Points）

**问题场景**：静态站点生成器需要支持 1000+ 插件（搜索、SEO、压缩、代码高亮、自定义标签、部署），如果把所有插件都塞到同一个 hook 数组里，**插件作者难以定位"我应该挂在哪个阶段"**。hexo 的解法是 12 个独立扩展点（Console / Deployer / Filter / Generator / Helper / Highlight / Injector / Migrator / Processor / Renderer / Tag），每个都是独立 class，**插件作者按需求挂在对应维度**。

**解决方案**：
```ts
// lib/hexo/index.ts 第 30-60 行（基于公开知识补充）
import {
  Console, Deployer, Filter, Generator, Helper,
  Highlight, Injector, Migrator, Processor,
  Renderer, Tag
} from '../extend';

class Hexo {
  public extend: {
    console: Console;     // CLI 命令
    deployer: Deployer;   // 部署（git / s3 / vercel）
    filter: Filter;       // 中间过滤
    generator: Generator; // 生成页面
    helper: Helper;       // 模板 helper
    highlight: Highlight; // 代码高亮
    injector: Injector;   // 注入 HTML head/body
    migrator: Migrator;   // 数据迁移
    processor: Processor; // 文件处理
    renderer: Renderer;   // 渲染器注册
    tag: Tag;             // 自定义标签
  };

  constructor(base: string, args?: ArgsType) {
    this.extend = {
      console: new Console(this),
      deployer: new Deployer(this),
      filter: new Filter(),
      generator: new Generator(),
      // ...
    };
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 扩展点数 | 12 | Console/Filter/Generator/... |
| 插件定位 | 单一维度 | 一个插件挂一个 extend |
| 优先级 | priority 数字 | 决定执行顺序 |
| ctx 注入 | this | 访问 hexo 主类能力 |

**最佳实践**：
1. ✅ 插件 = 单纯调用 extend API，**不和 hexo 主类直接耦合**
2. ✅ 优先用 `extend.processor` 处理"新文件类型"（如 .mdx），其次 `extend.filter` 改 Markdown
3. ✅ `extend.generator` 是 hexo 唯一"输出静态文件"的合法渠道，禁止插件直接 `fs.writeFileSync`
4. ✅ `extend.injector` 仅用于注入 CSS/JS（vendor 资源），**不注入正文内容**

### 2. 类型化 Filter 钩子（Typed Filter Hooks）

**问题场景**：Filter 钩子在 hexo 中多达 30+ 种（`before_post_render` / `after_post_render` / `before_generate` / `after_render` / ...），每种的入参类型不同。JavaScript 时代开发者靠"约定 + 文档"记忆，TypeScript 化后用联合类型 `FilterType` 强约束——**编辑器能补全、能编译报错**。

**解决方案**：
```ts
// lib/extend/filter.ts（基于公开知识补充）
class Filter {
  register<T extends keyof FilterType>(
    type: T,
    fn: FilterType[T],
    priority?: number
  ): void;
  
  exec<T extends keyof FilterType>(
    type: T,
    data: any,
    options?: any
  ): Promise<any>;
  
  execSync<T extends keyof FilterType>(...): void;
}

// FilterType 定义（节选）
interface FilterType {
  // 渲染前
  before_post_render: (data: PostData, locals: Locals) => Promise<PostData>;
  // 渲染后
  after_post_render: (content: string, data: PostData) => Promise<string>;
  // 生成前
  before_generate: (data: GeneratorData) => Promise<GeneratorData>;
  // 输出 HTML 前
  after_render: (html: string, data: { name: string }) => Promise<string>;
  // 静态文件后
  after_clean: (data: any) => Promise<void>;
}

// 插件使用：完全类型化
hexo.extend.filter.register('before_post_render', (data, locals) => {
  // data 是 PostData，IDE 知道有哪些字段
  if (data.title.startsWith('草稿:')) {
    data.title = data.title.slice(3);
  }
  return data;
}, 10);  // priority 数字
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| type | 30+ 钩子 | before_post_render / ... |
| priority | 0-100 | 数字越小越先执行 |
| exec | async | 异步串联 |
| execSync | 同步 | 仅个别钩子支持 |

**最佳实践**：
1. ✅ `before_post_render` 改文章元数据（title/tags/categories），不改正文
2. ✅ `after_post_render` 改 Markdown → HTML 的字符串，**不要回写 db**
3. ✅ `after_render` 改最终 HTML（注入代码、压缩、CDN 替换）
4. ✅ 多 filter 用 `priority` 显式控制顺序，**不依赖隐式加载顺序**

### 3. Warehouse 内存数据库（In-Memory ORM）

**问题场景**：hexo 在 build 阶段需要"查询文章/分类/标签"，但用户没有数据库——文章就是 `_posts/` 目录下的 Markdown 文件。**用真实数据库太重、用纯 JSON 难查询、用文件 IO 太慢**。`warehouse` 提供"类 mongoose 的内存 ORM"——build 期间存内存，结束后写 `db.json` 序列化。

**解决方案**：
```ts
// lib/models/post.ts（基于公开知识补充）
import warehouse from 'warehouse';

export default function(ctx: Hexo): Schema {
  return ctx.model('Post', new warehouse.Schema({
    id: { type: String, default: '' },
    title: { type: String, required: true },
    date: { type: Date, default: Date.now },
    updated: { type: Date, default: Date.now },
    comments: { type: Boolean, default: true },
    layout: { type: String, default: 'post' },
    content: { type: String, default: '' },
    excerpt: { type: String, default: '' },
    // ...
    tags: { type: Array, default: [] },
    categories: { type: Array, default: [] }
  }));
}

// 业务代码：类 MongoDB API
const posts = await hexo.model('Post').insert({
  title: 'Hello',
  content: '...',
  tags: ['hexo', 'tutorial']
});

const post = await hexo.model('Post').findOne({ id: 'hello' });
const drafts = await hexo.model('Post').find({ published: false });
await hexo.model('Post').updateOne(
  { id: 'hello' },
  { $set: { title: 'New title' } }
);
await hexo.model('Post').remove({ id: 'hello' });

// build 结束后序列化
await hexo.save();  // 写入 db.json
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Schema type | String/Number/Date/Boolean/Array | 8 种基础类型 |
| 持久化 | db.json | build 末尾写盘 |
| watch 模式 | 实时更新 | 监听 fs 变化 |
| API 风格 | mongoose-like | insert/find/update/remove |

**最佳实践**：
1. ✅ 插件统一用 `hexo.model('Post')` 访问数据，**不要直接读 db.json**
2. ✅ `db.json` 是 build 产物，**不要手动编辑**——hexo 启动会重建
3. ✅ watch 模式下 hexo 自动 diff 内存数据库，**增量更新**
4. ✅ warehouse 是 hexo 独家，**不要替换成 lowdb / lokijs**——生态不兼容

### 4. hexo-fs 流式文件 IO（Streaming File I/O）

**问题场景**：hexo 处理几千个 Markdown 文件时，如果用 `fs.readFileSync` 一次性读 500MB，**Node 进程 OOM**。`hexo-fs` 提供 bluebird 化的 Promise 文件 API + 大文件自动检测，**对大文件自动切流式**。

**解决方案**：
```ts
// hexo-fs（基于公开知识补充）
import { readFile, writeFile, exists, listDir } from 'hexo-fs';

// 小文件：直接返回字符串
const content = await readFile('source/_posts/hello.md', { encoding: 'utf8' });

// 大文件：自动流式（> 256KB 切流）
const big = await readFile('source/asset.zip');  // 返回 Buffer

// 检查存在
const hasFile = await exists('source/_posts/hello.md');

// 列表（递归）
const files = await listDir('source/_posts/');
// ['hello.md', 'world.md', ...]

// 写文件
await writeFile('public/index.html', html, { encoding: 'utf8' });

// 复制目录
import { copyDir } from 'hexo-fs';
await copyDir('themes/landscape/source/', 'public/');

// 大文件：流式复制
import { createReadStream, createWriteStream, pipeline } from 'node:fs';
pipeline(
  createReadStream('source/big.zip'),
  createWriteStream('public/big.zip'),
  (err) => { if (err) throw err; }
);
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 自动流阈值 | 256KB | 超过走流式 |
| encoding | 'utf8' / 'binary' / null | 默认 utf8 |
| 缓存 | cache: true | 内存缓存 |
| 并发 | 100+ | bluebird.map 并发 |

**最佳实践**：
1. ✅ 1000+ 文章用 `bluebird.map` 并发处理，不要 for 串行
2. ✅ 大文件（图片/视频）走流式，不要 readFile 一次性读
3. ✅ 写文件用 `writeFile(..., { encoding: 'utf8' })` 显式编码
4. ✅ 备份 `themes/` 时 `copyDir`，**不要 cp 命令**（Windows 兼容性）

### 5. Processor 文件处理管道（File Processing Pipeline）

**问题场景**：hexo 处理 `source/` 目录时，要识别 Markdown → Post、HTML → Page、图片 → Asset。**每种文件类型走不同处理路径**，但 hexo 不能写 5 个 if/else——需要"按文件类型注册处理器"。

**解决方案**：
```ts
// lib/extend/processor.ts（基于公开知识补充）
class Processor {
  register(
    pattern: string | RegExp,
    fn: (file: File) => Promise<void>
  ): void;
}

// 内置 processor
hexo.extend.processor.register(/\.md$/, async (file) => {
  // 解析 front-matter + Markdown → 写入 Post model
  const data = parseFrontMatter(file.content);
  await hexo.model('Post').insert(data);
});

hexo.extend.processor.register(/\.html$/, async (file) => {
  // HTML → Page
});

hexo.extend.processor.register(/\.(png|jpg|jpeg|webp)$/, async (file) => {
  // 图片 → Asset
  await hexo.model('Asset').insert({
    path: file.path,
    data: file.content
  });
});

// 第三方插件
hexo.extend.processor.register(/\.mdx$/, async (file) => {
  // MDX 文件
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| pattern | regex / glob | 文件名匹配 |
| fn | async (file) => void | 处理器 |
| file.path | 相对路径 | source/_posts/hello.md |
| file.content | Buffer | 文件内容 |

**最佳实践**：
1. ✅ 第三方文件类型（.mdx / .ipynb）走 `extend.processor`，**不要塞进 hexo 核心**
2. ✅ processor 内部只能修改 `hexo.model`，**不能写 `public/`**（生成由 generator 负责）
3. ✅ processor 是 build 早期阶段，**Markdown 还没 render**
4. ✅ 一个插件可注册多个 pattern——分类处理更清晰

## 二、架构设计与模块分层

### 6. Hexo 主类与生命周期（Core Class & Lifecycle）

**问题场景**：SSG 框架的执行流程是"**读源文件 → 处理 → 渲染 → 写静态文件**"，但 hexo 把它细化为 5 个阶段：`init()` → `load()` → `process()` → `generate()` → `deploy()`。每阶段职责单一，**可以独立扩展**。

**解决方案**：
```ts
// lib/hexo/index.ts 核心方法（基于公开知识补充）
class Hexo {
  // 1. 初始化：读 _config.yml、加载 theme、加载插件
  async init(): Promise<void> {
    await this.loadConfig();
    await this.loadTheme();
    await this.loadPlugins();
    this.extend.console.list();  // 注册所有 CLI
  }

  // 2. 加载：读 _posts/_drafts/_data/ → warehouse
  async load(): Promise<void> {
    await this.source.process();
    // 触发 processor: markdown → post, image → asset
  }

  // 3. 处理：watch 模式监听文件变化
  watch(): Promise<void> {
    chokidar.watch('source/**/*', { ignoreInitial: true })
      .on('change', async (path) => {
        await this.source.process(path);  // 增量处理
        await this.generate();
      });
  }

  // 4. 生成：执行 generator → 写 public/
  async generate(options?: { routeCache?: boolean }): Promise<void> {
    this.locals = await this._buildLocals();
    for (const generator of this.extend.generator.list()) {
      await generator(this.locals);
    }
    // 生成器调用 fs.writeFile 写 public/
  }

  // 5. 部署：deployer 插件
  async deploy(): Promise<void> {
    for (const deployer of this.extend.deployer.list()) {
      await deployer();
    }
  }
}

// CLI 入口
program
  .command('generate')
  .alias('g')
  .action(async () => {
    const hexo = new Hexo(process.cwd(), {});
    await hexo.init();
    await hexo.load();
    await hexo.generate();
    process.exit(0);
  });
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| init | 1-3s | 读配置 + 加载插件 |
| load | 1-10s | 处理 1000+ 文件 |
| generate | 1-30s | 写 static files |
| watch | 持续 | 文件变化触发重 build |
| deploy | 5-30s | git push / s3 upload |

**最佳实践**：
1. ✅ `init()` 只做"准备"（配置/插件），**不读源文件**——`load()` 才读
2. ✅ `watch()` 监听 `source/` 和 `themes/`，变化时增量重 build
3. ✅ `generate()` 默认全量，`--incremental` 走 cache（用 `routeCache` 标记哪些路由未变）
4. ✅ `deploy()` 不在主类内做，**只调度 deployer 插件**

### 7. 主题系统与配置合并（Theme System & Config Merging）

**问题场景**：hexo 用户要切换主题（next / fluid / landscape），每个主题自带 `_config.yml`。**主站配置 + 主题配置**如何合并？主题模板如何访问主站数据？

**解决方案**：
```ts
// 主题加载（基于公开知识补充）
class Theme {
  private viewCache: WeakMap<...>;
  
  async load(): Promise<void> {
    // 1. 加载主站 _config.yml
    const mainConfig = yaml.load('_config.yml');
    
    // 2. 加载主题 _config.yml
    const themeConfig = yaml.load(`themes/${mainConfig.theme}/_config.yml`);
    
    // 3. 合并：主站覆盖主题
    this.config = Hoek.applyToDefaults(themeConfig, mainConfig);
    
    // 4. 加载主题的 view 文件
    this.views = await this._loadViews('themes/landscape/layout/');
  }
  
  // 模板渲染
  async render(view: string, locals: any): Promise<string> {
    // 用 nunjucks/ejs 渲染主题模板
    return nunjucks.render(view, {
      ...locals,
      config: this.config,  // 主题配置
      theme: this.config,    // 兼容旧版本
    });
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 主题目录 | `themes/[name]/` | 约定 |
| 配置优先级 | 主站 > 主题 | 主站覆盖 |
| 模板引擎 | swig / nunjucks | hexo 默认 |
| 视图缓存 | WeakMap | 路由级缓存 |

**最佳实践**：
1. ✅ 主题配置用 `theme.*` 访问（`{{ theme.color }}`），主站配置用 `site.*` 访问
2. ✅ 主题只定义"结构 + 默认配置"，**业务配置（标题/作者）放主站**
3. ✅ 主题切换只需改主站 `_config.yml` 的 `theme: next` 一行，**不动文件**
4. ✅ 模板继承：layout.swig 引用 `{{ body }}` 子模板——hexo 自动注入

### 8. 模板引擎与 Locals 注入（Template Engine & Locals Injection）

**问题场景**：hexo 模板需要访问"全部文章、分类、标签、配置、主题"——不可能每个模板都传 50 个参数。**locals 模式**：hexo 在 generate 时构建完整的 `locals` 对象，模板里直接 `{{ site.title }}` 访问。

**解决方案**：
```ts
// lib/hexo/locals.ts（基于公开知识补充）
async function buildLocals(hexo: Hexo): Promise<Locals> {
  const posts = await hexo.model('Post').find({ published: true });
  const pages = await hexo.model('Page').find();
  const categories = await hexo.model('Category').find();
  const tags = await hexo.model('Tag').find();
  const archives = groupByYearMonth(posts);
  
  return {
    // 全局
    site: hexo.config,
    config: hexo.config,
    theme: hexo.theme.config,
    url: hexo.config.url,
    
    // 路径辅助
    url_for: (path: string) => resolveUrl(hexo.config.url, path),
    full_url_for: (path: string) => withCDN(path),
    
    // 数据集合
    posts: paginate(posts, 10),
    pages,
    categories,
    tags,
    archives,
    
    // 时间辅助
    date: (date: Date, format: string) => formatDate(date, format),
    
    // 当前页（generator 注入）
    page: { current: 1, total: 10, ... },
  };
}

// 模板中使用
// themes/landscape/layout/index.swig
<h1>{{ site.title }}</h1>
{% for post in posts %}
  <a href="{{ url_for(post.path) }}">{{ post.title }}</a>
{% endfor %}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| site / config | 全局 | hexo 主配置 |
| theme | 全局 | 主题配置 |
| posts / pages | 当前分页 | generator 注入 |
| url_for | 函数 | 路径解析 |

**最佳实践**：
1. ✅ 模板内禁止调函数（如 `posts.length`），用 `{{ count(posts) }}` helper
2. ✅ `url_for('/about')` 自动转 `https://blog.com/about`，**禁止硬编码 baseUrl**
3. ✅ `site.posts` 慎用，**数据大时分页渲染**（用 `paginator(posts, perPage=10)`）
4. ✅ 自定义 helper 用 `extend.helper.register('myHelper', fn)`，模板里 `{{ myHelper(x) }}`

### 9. 路由与静态文件生成（Router & Static File Generation）

**问题场景**：generator 插件要"为每篇文章生成一个 HTML 文件"——但 `public/` 目录结构由谁决定？URL 怎么映射？hexo 用 `Route` 对象数组（每个 = path + data），generate 阶段统一渲染输出。

**解决方案**：
```ts
// generator 注册（基于公开知识补充）
hexo.extend.generator.register('post', async (locals) => {
  const posts = locals.posts.toArray();
  return posts.map(post => ({
    path: `posts/${post.slug}/`,        // public 目录路径
    layout: ['post'],                    // 用 layout/post.swig 渲染
    data: { post, ...locals },           // 模板数据
  }));
});

hexo.extend.generator.register('archive', async (locals) => {
  return {
    path: 'archives/',
    layout: ['archive'],
    data: { ...locals }
  };
});

hexo.extend.generator.register('feed', async (locals) => {
  const xml = await renderRSS(locals.posts);
  return {
    path: 'atom.xml',                    // 不渲染模板，直接写文件
    data: xml,
  };
});

// hexo 内部 generate 阶段
async function generate(routes: Route[]) {
  for (const route of routes) {
    if (route.layout) {
      // 用模板渲染
      const html = await theme.render(route.layout[0], route.data);
      await writeFile(publicPath(route.path) + 'index.html', html);
    } else {
      // 直接写文件
      await writeFile(publicPath(route.path), route.data);
    }
  }
}
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Route.path | 相对 public/ | 必填 |
| Route.layout | 模板名数组 | 可选 |
| Route.data | 模板变量 | 必填 |
| 输出 | public/ | 静态目录 |

**最佳实践**：
1. ✅ URL 路径必须以 `/` 结尾（如 `posts/hello/`），hexo 自动生成 `index.html`
2. ✅ generator 是**唯一**合法写 `public/` 的渠道，processor 不写
3. ✅ 大量路由用 `Route` 数组，**用 stream 写入**（不缓存 HTML）
4. ✅ 静态资源（CSS/JS/图片）放 `theme/source/`，hexo 自动复制到 `public/`

### 10. CLI 与 Console 扩展（CLI & Console Extension）

**问题场景**：hexo 命令行要支持 `hexo new / generate / deploy / server / clean / ...`，**用户也想加自定义命令**（如 `hexo publish`）。hexo 提供 `extend.console.register()` 让插件声明自己的 CLI。

**解决方案**：
```ts
// 第三方插件：hexo-word-count（基于公开知识补充）
hexo.extend.console.register('wordcount', 'Display word count', {
  options: [
    { name: '-w, --write', desc: 'Write counts to front-matter' }
  ]
}, async function(args) {
  const posts = await this.model('Post').find();
  let total = 0;
  for (const post of posts) {
    const count = countWords(post.content);
    total += count;
    if (args.w) {
      await this.model('Post').updateOne(
        { _id: post._id },
        { $set: { wordcount: count } }
      );
    }
  }
  console.log(`Total words: ${total}`);
});

// 用户调用
// $ hexo wordcount
// $ hexo wordcount --write
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| name | 'wordcount' | 命令名 |
| desc | 描述 | 帮助文本 |
| options | 数组 | 命令行参数 |
| fn | async function | 执行体 |

**最佳实践**：
1. ✅ CLI 命令注册到 `extend.console`，**不要重写 bin/hexo**
2. ✅ `args` 自动解析 `--key value` / `--flag`，用 commander/yargs
3. ✅ 内部用 `this.model(...)` / `this.theme.config`——`this` 是 `Hexo` 实例
4. ✅ 错误必须 `throw`，hexo 捕获后输出 stack 并退出码非 0

## 三、性能与构建优化

### 11. 增量构建与 Route Cache（Incremental Build with Route Cache）

**问题场景**：hexo 博客 5000+ 文章，全量 build 30 秒。**用户改一篇文章就要等 30 秒**？用 `WeakMap` 做路由级缓存——未变的路由复用上次的 HTML，**只重渲染变化部分**。

**解决方案**：
```ts
// 增量构建（基于公开知识补充）
class RouteCache {
  private cache = new WeakMap<Route, string>();
  private lastModified = new WeakMap<Route, number>();
  
  get(route: Route): string | null {
    return this.cache.get(route) || null;
  }
  
  set(route: Route, html: string, modified: number) {
    this.cache.set(route, html);
    this.lastModified.set(route, modified);
  }
  
  isStale(route: Route, currentModified: number): boolean {
    const last = this.lastModified.get(route);
    return !last || last < currentModified;
  }
}

// generate 阶段
async function generate(hexo: Hexo, { routeCache }: { routeCache?: RouteCache }) {
  for (const route of routes) {
    const modified = getModifiedTime(route);  // 文章 mtime
    
    if (routeCache && !routeCache.isStale(route, modified)) {
      // 命中缓存：直接写旧 HTML
      const html = routeCache.get(route);
      await writeFile(route.path, html);
    } else {
      // 未命中：渲染 + 缓存
      const html = await render(route);
      routeCache?.set(route, html, modified);
      await writeFile(route.path, html);
    }
  }
}

// CLI 调用
$ hexo generate --incremental
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| cache key | Route 对象 | WeakMap 自动 GC |
| modified | mtime | 路由依赖文件 |
| 命中率 | 80%+ | 大型博客 |
| 加速比 | 5-10x | 30s → 3s |

**最佳实践**：
1. ✅ watch 模式默认开启增量，**首次 build 必须全量**
2. ✅ 缓存 key 用 Route 对象，**内存自动回收**
3. ✅ 主题 / 配置变更 → 缓存失效（清空 routeCache）
4. ✅ 改模板不重 build 文章——模板是**渲染期**参与，缓存的是渲染结果

### 12. 并发处理与 Promise 池（Concurrent Processing with Bluebird）

**问题场景**：hexo 处理 1000+ Markdown 文件时，串行 `for` 循环要 60 秒。**改成 `Promise.all` 又会撑爆文件描述符**。hexo 用 bluebird 的 `Promise.map` 加并发限制（如 50 并发），**平衡速度与资源**。

**解决方案**：
```ts
import Bluebird from 'bluebird';

// 不限并发：可能 OOM
const results = await Promise.all(
  files.map(f => processFile(f))
);

// 限制并发：50 个一组
const results = await Bluebird.map(files, async (f) => {
  return processFile(f);
}, { concurrency: 50 });

// 更精细：分批
const results = await Bluebird.map(
  Bluebird.resolve(files),
  processFile,
  { concurrency: 50 }
);

// 错误聚合（allSettled 风格）
const results = await Bluebird.mapSettled(files, processFile);
const errors = results.filter(r => r.isRejected());
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| concurrency | 50 | 默认 50 |
| 性能（5000 文章） | 30s → 5s | 提速 6x |
| 内存峰值 | 50 个文件 | 限制 |

**最佳实践**：
1. ✅ 默认 `concurrency: 50`——文件 IO 友好
2. ✅ 不要 `Promise.all` 大数组，**必须限制并发**
3. ✅ 用 `mapSettled` 收集错误，**不因单文件失败中断**
4. ✅ watch 模式无需高并发（增量只有 1-10 个文件）

### 13. 缓存模板编译结果（Template Compilation Cache）

**问题场景**：hexo 用 nunjucks / swig 渲染模板，每个 template 第一次编译要 100ms。如果同一模板用 100 次（如 `pagination.swig`），**重复编译浪费 10 秒**。缓存编译后的函数——**第二次用直接调函数**。

**解决方案**：
```ts
// nunjucks 模板缓存（基于公开知识补充）
import nunjucks from 'nunjucks';

const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader('themes/landscape/layout/'),
  {
    autoescape: false,
    noCache: false,  // 启用模板缓存
    throwOnUndefined: false,
  }
);

// 第一次：编译 + 渲染
const html = env.render('post.swig', { post, site });

// 第二次：缓存的模板直接渲染，跳过编译
// 耗时 100ms → 5ms

// watch 模式：模板文件变化自动失效缓存
chokidar.watch('themes/landscape/layout/**/*.swig')
  .on('change', (path) => {
    env.loaders[0].emit('update', path);
  });

// 自定义 helper 也可缓存
const cachedHelper = Bluebird.method((input) => {
  return expensiveComputation(input);
});
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 模板缓存 | auto | 框架默认 |
| 缓存粒度 | 模板文件 | 单 swig 缓存 |
| 失效触发 | mtime | 文件变化 |
| 加速比 | 20x | 100ms → 5ms |

**最佳实践**：
1. ✅ 模板缓存默认开启，**禁止关闭**（除非开发）
2. ✅ watch 模式必须**自动失效**模板缓存（用 mtime 比对）
3. ✅ Helper 函数本身可缓存（`server.method` 风格），但模板里的 `{{ helper(x) }}` 每次都调
4. ✅ 主题切换清空所有模板缓存

### 14. 大型博客分页与归档（Pagination & Archives for Large Blogs）

**问题场景**：5000 篇文章如果在一个 HTML 里列出，**HTML 文件 50MB**——浏览器打开卡死。必须分页。hexo 的 `pagination` helper 把 `posts` 切成多页，每页 10 篇。

**解决方案**：
```ts
// 分页（基于公开知识补充）
hexo.extend.generator.register('index', async (locals) => {
  const perPage = hexo.config.per_page || 10;
  const posts = locals.posts.toArray();
  
  return pagination(posts, {
    perPage,
    layout: ['index'],
    data: { ...locals },
    // 每页生成路径
    path: (i) => i === 1 ? '' : `page/${i}/`,
  });
});

// pagination 内部实现
function pagination(items, { perPage, path, layout, data }) {
  const total = Math.ceil(items.length / perPage);
  const routes = [];
  for (let i = 0; i < total; i++) {
    const slice = items.slice(i * perPage, (i + 1) * perPage);
    routes.push({
      path: typeof path === 'function' ? path(i + 1) : path + `${i + 1}/`,
      layout,
      data: {
        ...data,
        page: { 
          current: i + 1, 
          total, 
          perPage,
          posts: slice,
        },
      },
    });
  }
  return routes;
}

// 模板里访问分页
// themes/landscape/layout/index.swig
{% for post in page.posts %}
  <article>{{ post.title }}</article>
{% endfor %}
<nav class="pagination">
  {% if page.current > 1 %}
    <a href="{{ url_for(page.current - 1 === 1 ? '/' : '/page/' + (page.current - 1) + '/') }}">Prev</a>
  {% endif %}
  Page {{ page.current }} / {{ page.total }}
  {% if page.current < page.total %}
    <a href="/page/{{ page.current + 1 }}/">Next</a>
  {% endif %}
</nav>
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| per_page | 10 | 每页文章数 |
| total | n/perPage | 总页数 |
| path | /page/N/ | URL 模式 |
| 性能 | 5000 → 500 页 | HTML 10x 减小 |

**最佳实践**：
1. ✅ perPage = 10 是平衡点（10-20 合理）
2. ✅ 第 1 页用 `/`，第 2+ 用 `/page/2/`，**SEO 友好**
3. ✅ 归档（archive）独立 generator，按年/月分组
4. ✅ 分类/标签页也分页，否则单页 > 200 文章会慢

### 15. CDN 与静态资源处理（CDN & Static Asset Processing）

**问题场景**：hexo 默认所有资源在 `public/`，部署到 GitHub Pages 时，**所有资源同源**。但用户想用 CDN（如 jsdelivr / unpkg / 七牛云）。hexo 提供 `url_for` + CDN 配置，**自动替换资源 URL**。

**解决方案**:
```yaml
# _config.yml
url: https://blog.example.com
cdn:
  enable: true
  base: https://cdn.jsdelivr.net/gh/user/repo@latest/
  # 或者：
  base: https://my-cdn.example.com/
```

```ts
// 静态资源处理（基于公开知识补充）
import { url_for, full_url_for } from 'hexo-util';

// 模板里
<link rel="stylesheet" href="{{ url_for('/css/style.css') }}">
// 默认：https://blog.example.com/css/style.css
// 开启 CDN：https://cdn.jsdelivr.net/gh/user/repo@latest/css/style.css

// 资源指纹
hexo.extend.filter.register('after_render:css', (css) => {
  // 加 hash 后缀，强制浏览器更新
  return css.replace(/url\(["']?\/assets\/(.*?)["']?\)/g, (match, file) => {
    return `url("https://cdn.example.com/assets/${file}?v=${hash(file)}")`;
  });
});

// 压缩 CSS / JS（生产 build）
const cleanCSS = require('gulp-clean-css');
const uglify = require('gulp-uglify');
// gulp pipeline 压缩 public/css/*.css, public/js/*.js
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| CDN base | https://cdn.../ | 协议必须 https |
| cache busting | ?v=hash | 文件指纹 |
| 压缩 | clean-css / terser | 生产启用 |
| 资源 hash | sha256 前 8 位 | 足够 |

**最佳实践**：
1. ✅ 静态资源**全部走 CDN**，主站不存资源
2. ✅ 加文件 hash `style.css?v=abc123`——浏览器主动更新
3. ✅ 主题 `source/` 里的 CSS/JS 自动复制到 `public/`，**不要手动放**
4. ✅ 第三方库（prism / highlight / 字体）走 CDN，**别打 bundle**

## 四、可靠性与生态工程

### 16. 数据迁移与导入（Migration from Other Platforms）

**问题场景**：用户从 Jekyll / WordPress / Hugo / Notion 迁到 hexo，**几 MB 的旧内容如何导入**？hexo 用 `extend.migrator.register()` 抽象迁移器，**每个平台一个插件**。

**解决方案**：
```ts
// hexo-migrator-wordpress（基于公开知识补充）
hexo.extend.migrator.register('wordpress', async function(args) {
  // 1. 下载 WordPress XML 导出
  const xml = await downloadFile(args.xml);
  
  // 2. 解析 XML → 文章数组
  const items = parseWordPressXML(xml);
  
  // 3. 转 hexo Markdown
  for (const item of items) {
    const md = `---
title: ${item.title}
date: ${item.date}
tags:
${item.tags.map(t => `  - ${t}`).join('\n')}
---

${item.content}
`;
    
    // 4. 写入 _posts/
    const slug = item.slug || slugify(item.title);
    await writeFile(`source/_posts/${slug}.md`, md);
  }
  
  console.log(`Migrated ${items.length} posts from WordPress`);
});

// 用户调用
// $ npm install hexo-migrator-wordpress
// $ hexo migrate wordpress https://blog.com/wp-export.xml
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 注册名 | 'wordpress' | 平台名 |
| args | 用户传入 | 源 URL / 文件 |
| 输出 | _posts/*.md | hexo 格式 |
| 进度 | console.log | 用户可见 |

**最佳实践**：
1. ✅ 迁移器写入 `source/_posts/`，**不动主题/配置**
2. ✅ 必须保留 front-matter（title/date/tags）——hexo 解析依赖
3. ✅ 错误单条容错——一篇失败不中断整批
4. ✅ 干跑模式 `hexo migrate <name> --dry-run`，只统计不写盘

### 17. Deployer 部署插件（Deployer Plugin for Git/S3/Vercel）

**问题场景**：hexo 静态生成后要部署到 GitHub Pages / S3 / Vercel / Netlify。**每种部署目标一个插件**——`hexo-deployer-git`（git push）/ `hexo-deployer-heroku` / `hexo-deployer-rsync` / `hexo-deployer-aliyun-oss`。

**解决方案**：
```ts
// hexo-deployer-git（基于公开知识补充）
hexo.extend.deployer.register('git', async function(args) {
  const repo = args.repo;  // git@github.com:user/repo.git
  const branch = args.branch || 'gh-pages';
  const message = args.message || `Site updated: ${new Date().toISOString()}`;
  
  // 1. 在 public/ 内做 git 操作
  const cwd = this.public_dir;
  
  // 2. 如果不是 git 仓库，初始化
  if (!await exists(`${cwd}/.git`)) {
    await exec('git init', { cwd });
    await exec(`git checkout -b ${branch}`, { cwd });
  }
  
  // 3. add + commit + push
  await exec('git add -A', { cwd });
  await exec(`git commit -m "${message}"`, { cwd });
  await exec(`git push -f ${repo} ${branch}`, { cwd });
  
  console.log('Deployed to', repo);
});

// 用户配置
// _config.yml
deploy:
  type: git
  repo: https://github.com/user/blog
  branch: gh-pages
  message: "Auto deploy from hexo"

// $ hexo deploy
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| type | 'git' / 's3' / 'rsync' | 部署目标 |
| repo | URL | 目标仓库 |
| branch | 'gh-pages' | git 分支 |
| message | 自动时间戳 | commit 信息 |

**最佳实践**：
1. ✅ `public/` 必须是 git 仓库（hexo deploy 自动 init）
2. ✅ `git push -f` 强推（覆盖远端历史）——博客不需要历史
3. ✅ CI 用 GitHub Actions：push 源码 → Actions 跑 `hexo deploy` → 推 gh-pages
4. ✅ 部署失败时保留 `public/` 现场，不要自动清理

### 18. 主题市场与插件生态（Theme Marketplace & Plugin Ecosystem）

**问题场景**：hexo 自身只提供"5 分钟建博客"骨架，**外观和功能靠主题/插件**。300+ 主题 + 1000+ 插件如何分发？hexo 用 npm 命名空间 `hexo-theme-*` / `hexo-extend-*` / `hexo-tag-*` / `hexo-renderer-*`——**npm 本身就是市场**。

**解决方案**:
```bash
# 安装主题
$ npm install hexo-theme-next
# 安装插件
$ npm install hexo-wordcount
$ npm install hexo-renderer-pug

# _config.yml
theme: next
plugins:
  - hexo-wordcount
  - hexo-renderer-pug
  - hexo-algoliasearch
```

```ts
// 主题包结构（基于公开知识补充）
hexo-theme-next/
├── package.json
├── _config.yml           # 主题配置
├── layout/               # swig 模板
│   ├── index.swig
│   ├── _partial/
│   └── _macro/
├── source/               # CSS/JS/字体（自动复制到 public/）
│   ├── css/
│   ├── js/
│   └── fonts/
├── scripts/              # 主题"插件"（注册 extend）
│   ├── index.js          # 主入口
│   ├── filters.js        # register filter
│   └── helpers.js        # register helper
└── README.md
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| 主题命名 | hexo-theme-* | npm 强制 |
| 插件命名 | hexo-extend-* | 可选 |
| 渲染器 | hexo-renderer-* | 注册新文件类型 |
| 标签 | hexo-tag-* | 自定义 {%tag%} |

**最佳实践**：
1. ✅ 主题/插件用 npm 分发，**自带版本管理**
2. ✅ 主题用 `scripts/` 注入 hook，**不修改 hexo 主代码**
3. ✅ 主题 README 必须含"预览图 + 配置项 + 兼容性"
4. ✅ 主题自带 `_config.yml` 默认值——用户主站配置覆盖

### 19. 错误处理与友好提示（Error Handling & User-Friendly Messages）

**问题场景**：hexo 是命令行工具，**用户看到 stack trace 就懵了**。常见错误（Markdown 语法错 / front-matter 缺字段 / 模板不渲染）需要"友好提示 + 修复建议"。

**解决方案**：
```ts
// 错误处理（基于公开知识补充）
import chalk from 'picocolors';

class HexoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = 'HexoError';
  }
}

// 抛出友好错误
function parseFrontMatter(content: string): FrontMatter {
  try {
    return yaml.load(content);
  } catch (err) {
    throw new HexoError(
      `Failed to parse front-matter in ${content.filename}`,
      'FRONT_MATTER_INVALID',
      `Check the YAML syntax. The front-matter should be:\n---\ntitle: ...\n---`
    );
  }
}

// CLI 输出（基于公开知识补充）
function handleError(err: Error) {
  if (err instanceof HexoError) {
    console.error(chalk.red(`[${err.code}] ${err.message}`));
    if (err.suggestion) {
      console.error(chalk.yellow('Suggestion:'));
      console.error(err.suggestion);
    }
  } else {
    console.error(chalk.red(err.stack || err.message));
  }
  process.exit(1);
}

// 常见错误码
const ErrorCodes = {
  CONFIG_INVALID: '001',
  THEME_NOT_FOUND: '002',
  PLUGIN_LOAD_FAILED: '003',
  TEMPLATE_RENDER_ERROR: '004',
  POST_FILE_NOT_FOUND: '005',
};
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| error code | 3 位数字 | 用户搜索 |
| suggestion | 修复步骤 | 直接可复制 |
| 颜色 | red/yellow | 终端友好 |
| exit code | 1 | CI 失败 |

**最佳实践**：
1. ✅ 错误必须有**错误码**（如 `THEME_NOT_FOUND`），用户可搜索
2. ✅ 建议必须**可操作**（"运行 npm install hexo-theme-next"），不是空话
3. ✅ 内部错误（DB/IO）保留 stack，**但开头一句话说人话**
4. ✅ 友好的进度条 `hexo g [====================] 500/500 posts`

### 20. CI/CD 与持续部署（CI/CD & Continuous Deployment）

**问题场景**：hexo 博客更新流程是"git push 源码 → 触发 CI → 跑 hexo deploy → 部署到 GitHub Pages"。**如何在 GitHub Actions 实现**？

**解决方案**：
```yaml
# .github/workflows/deploy.yml（基于公开知识补充）
name: Deploy hexo to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npx hexo generate
        env:
          HEXO_DEPLOYER_TYPE: git

      - name: Deploy
        run: |
          git config --global user.name "GitHub Actions"
          git config --global user.email "actions@github.com"
          npx hexo deploy

      - name: Archive public
        uses: actions/upload-artifact@v4
        with:
          name: public
          path: public/
          retention-days: 7
```

**多环境部署**：
```yaml
# 部署到 Vercel
- name: Deploy to Vercel
  uses: amondnet/vercel-action@v25
  with:
    vercel-token: ${{ secrets.VERCEL_TOKEN }}
    vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
    vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
    working-directory: public  # 部署静态目录
```

**关键参数**：

| 参数 | 推荐值 | 说明 |
|---|---|---|
| Node 版本 | 20 | LTS |
| 触发 | push / manual | 自动化 |
| 缓存 | npm + .cache | 加速 |
| artifact | public/ | 调试 |

**最佳实践**：
1. ✅ `npm ci` 比 `npm install` 快 + 锁版本，**CI 必用**
2. ✅ Cache Node modules——`actions/setup-node@v4` + `cache: 'npm'`
3. ✅ 部署到 Vercel/Netlify 不需要 `hexo deploy`——直接传 `public/` 目录
4. ✅ 失败时上传 `public/` artifact——方便回滚调试
5. ✅ 文章草稿用 `publish: true` 推送触发发布，**草稿不触发**

---

**标签**：#hexo #ssg #nodejs #typescript
**状态**：20/20 份详细内容
