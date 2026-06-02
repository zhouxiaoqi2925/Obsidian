# scrapy - Twisted + asyncio 双栈 Python 异步爬虫框架

**GitHub**: scrapy/scrapy
**Star**: 54k+
**语言**: Python / Twisted / asyncio
**主题**: web-scraping-framework / async / twisted / production-crawler
**适用场景**: 学习 Twisted→asyncio 迁移、Middleware 链设计、整站抓取架构、持久化去重

---

## 第一段：核心引擎与协议

### 模式 1：Twisted→asyncio 渐进迁移（5 年 3 阶段）

**问题场景**：Twisted Deferred 难学、async/await 是 Python 3.5+ 标配；老项目绑 Twisted 难换。强制升级会激怒老用户，big-bang 重写风险大。

**解决方案**：scrapy 用 5 年（2015-2020）走完迁移——1.5 加 asyncio 支持（双栈共存）、2.0 移除 Python 2、2.6 HTTP/2、2.11 asyncio 默认、2.14 全 async API。3 阶段："共存 → 默认 → 唯一"。

```python
# v1.5（2018）：asyncio 双栈共存
# 默认 Twisted；可配置 asyncio
import scrapy
# Twisted 模式（默认）
yield scrapy.Request(url)                       # 返回 Deferred

# asyncio 模式（开启）
# settings.py: TWISTED_REACTOR = 'twisted.internet.asyncioreactor.AsyncioSelectorReactor'
# 内部 asyncio 适配，外部 API 不变

# v2.11（2024）：asyncio 默认
# 2.11+ scrapy 默认 asyncio reactor
# 用户不感知，框架内部切换

# v2.14（2025）：全 async API
from scrapy import Spider
class MySpider(Spider):
    async def parse(self, response):             # 现在是 async
        async for item in self.parse_async(response):
            yield item
    async def start_async(self):                # 新增 start_async
        ...
    async def stop_async(self):                 # 新增 stop_async
        ...
```

**关键参数**：
- v1.5 = asyncio 支持（保留 Twisted 默认）
- v2.0 = 移除 Python 2 兼容代码
- v2.6 = HTTP/2 支持
- v2.11 = asyncio 默认 reactor
- v2.14 = `start_async` / `stop_async` / `close_async` 全异步
- 迁移窗口 = 5 年（2018→2023）覆盖 scrapy 1.5 → 2.11

**最佳实践**：异步库迁移用"共存 → 默认 → 唯一"三步走——强制升级会激怒老用户，逐步切换比 big-bang 重写更稳；每个 major 版本只做一步，留 1-2 年窗口；保留旧 API 弃用警告（`DeprecationWarning`）。

### 模式 2：ExecutionEngine 7 状态机调度核心

**问题场景**：爬虫的"抓取 → 解析 → 入库"循环怎么调度？怎么把 spider / downloader / scheduler / pipeline 串起来？if-else 堆逻辑容易失控。

**解决方案**：`scrapy/core/engine.py` 的 ExecutionEngine 是 14 年长出的核心——`open_spider / start / schedule / download / response / spider_idle / close_spider` 7 状态机。状态显式转换。

```python
# scrapy/core/engine.py（简化）
class ExecutionEngine:
    def __init__(self, crawler, spider_closed_callback):
        self.crawler = crawler
        self.slot = None                    # 当前爬虫 slot
        self.scheduler = None
        self.downloader = None
        self.scraper = None
        # 7 状态
        self._spider_idle = False

    async def open_spider(self, spider, start_requests, close_if_idle=True):
        """open：初始化 scheduler / downloader / spider slot"""
        self.slot = Slot(start_requests, close_if_idle)
        self.scheduler = self.crawler.engine.scheduler
        await self.scheduler.open(spider)
        await self.downloader.open(spider)
        await self.scraper.open_spider(spider)
        # ... 状态 → open

    async def schedule(self, request, spider):
        """schedule：进 scheduler 队列"""
        await self.scheduler.enqueue_request(request)

    async def download(self, request, spider):
        """download：调 downloader 中间件链"""
        async for result in self.downloader.fetch(request, spider):
            if isinstance(result, Response):
                await self._handle_downloader_output(result, request, spider)
            elif isinstance(result, Request):
                await self.schedule(result, spider)

    async def _handle_downloader_output(self, response, request, spider):
        """response：response → scraper → spider parse → yield Item/Request"""
        if self.slot is None:
            return                          # 已被关闭
        await self.scraper.enqueue_scrape(response, request, spider)

    async def spider_idle(self, spider):
        """spider_idle：心跳，决定继续/停止"""
        if not self._spider_idle:
            return                          # 去重
        if self.slot.close_if_idle:
            await self._spider_idle_after_close(spider)

    async def close_spider(self, spider, reason='finished'):
        """close：清理资源 + 写 stats"""
        await self.scheduler.close(spider)
        await self.downloader.close(spider)
        await self.scraper.close_spider(spider)
        self.crawler.stats.set_value('spider_exited/close_reason', reason)
```

**关键参数**：
- 7 状态 = open → schedule → download → response → spider_idle → close
- 心跳 = `_spider_idle` 回调决定继续 / 停止
- 中间件链 = `process_request` / `process_response` / `process_exception`
- 并发控制 = `CONCURRENT_REQUESTS` + `CONCURRENT_REQUESTS_PER_DOMAIN`
- 持久化 = `JOBDIR` 断点续爬
- 状态转换 = 显式 await / 异常触发 close_spider

**最佳实践**：长生命周期框架的核心是"状态机 + 事件回调"——别用 if-else 堆逻辑，让状态显式转换；7 状态足够覆盖爬虫全生命周期；`spider_idle` 心跳判断"是否还有未完成请求"决定继续 / 停止。

### 模式 3：Downloader Middleware 链

**问题场景**：30+ 横切关注点（retry / redirect / cookies / proxy / cache / robotstxt）——怎么组织才能不污染核心代码？继承会爆炸。

**解决方案**：30+ Downloader Middleware 链式——`process_request` / `process_response` / `process_exception` 3 个钩子，开发者可通过 `DOWNLOADER_MIDDLEWARES` dict 启停/排序。数字小先执行。

```python
# settings.py
DOWNLOADER_MIDDLEWARES = {
    'scrapy.downloadermiddlewares.retry.RetryMiddleware': 500,
    'scrapy.downloadermiddlewares.redirect.RedirectMiddleware': 600,
    'scrapy.downloadermiddlewares.cookies.CookiesMiddleware': 700,
    'scrapy.downloadermiddlewares.useragent.UserAgentMiddleware': 400,
    'myproject.middlewares.CustomProxyMiddleware': 750,    # 自定义
    # 数字小先执行；None 禁用
}

# 自定义 middleware
class CustomProxyMiddleware:
    def __init__(self, proxy_pool):
        self.proxy_pool = proxy_pool

    @classmethod
    def from_crawler(cls, crawler):
        return cls(crawler.settings.getlist('PROXY_POOL'))

    def process_request(self, request, spider):
        """request 前处理：None 继续 / Response 短路 / Request 重试 / raise IgnoreRequest 跳过"""
        request.meta['proxy'] = random.choice(self.proxy_pool)
        return None                         # 继续后续 middleware

    def process_response(self, request, response, spider):
        """response 后处理：返回 Response / Request"""
        if response.status in (403, 429):
            return request.replace(dont_filter=True)   # 重试
        return response

    def process_exception(self, request, exception, spider):
        """异常处理：返回 Response / Request / None"""
        return request.replace(dont_filter=True)        # 失败重试
```

**关键参数**：
- 链式 = `settings.getwithbase('DOWNLOADER_MIDDLEWARES')` 排序
- 优先级 = 数字小先执行（默认 500）
- 返回值 = `None` 继续 / `Response` 短路 / `Request` 重试 / `raise IgnoreRequest` 跳过
- 自定义 = 写 `process_request(self, request, spider)` 即可
- 顺序敏感 = cookies 在 redirect 之前
- 工厂方法 = `from_crawler(cls, crawler)` 注入 settings

**最佳实践**：横切关注点用 middleware 链实现（vs. 继承）——按数字排序、可插拔、不污染核心；自定义 middleware 必加 `from_crawler` 工厂方法；顺序敏感（cookies 在 redirect 之前，user-agent 在 cookies 之前）。

### 模式 4：DupeFilter 持久化去重

**问题场景**：整站抓取 URL 千万级——内存去重爆、崩溃后重启重复抓。同一 URL 的不同 query 参数可能代表不同内容。

**解决方案**：`scrapy/dupefilters.py` RFPDupeFilter——默认用 `set()` 内存去重，2.0+ 支持 `RFPDupeFilter` 持久化到 SQLite（通过 `JOBDIR`）。指纹 = sha1(method + url + body + headers)。

```python
# scrapy/dupefilters.py
from scrapy.dupefilters import RFPDupeFilter

class RFPDupeFilter:
    """持久化去重（默认 SQLite 内存）"""
    def __init__(self, path=None, debug=False):
        self.file = None
        self.fingerprints = set()           # 内存 set（O(1) hash）
        self.logdupes = debug
        self.path = path                    # JOBDIR 路径

    @classmethod
    def from_settings(cls, settings):
        debug = settings.getbool('DUPEFILTER_DEBUG')
        return cls(job_dir(settings), debug)

    def request_seen(self, request):
        """检查请求是否已抓"""
        fp = self.request_fingerprint(request)
        if fp in self.fingerprints:
            return True
        self.fingerprints.add(fp)
        return False

    def request_fingerprint(self, request):
        """计算请求指纹"""
        fp = hashlib.sha1()
        fp.update(request.method.encode())
        fp.update(canonicalize_url(request.url).encode())
        fp.update(request.body or b'')
        return fp.hexdigest()

    def open(self, spider):                # 加载持久化指纹
        if self.path:
            self.file = open(os.path.join(self.path, 'requests.seen'), 'a+')
            self.file.seek(0)
            self.fingerprints = set(x.strip() for x in self.file)

    def close(self, reason):                # 写回持久化
        if self.file:
            self.file.close()

# 自定义去重（按内容而非 URL）
class ContentHashDupeFilter(RFPDupeFilter):
    def request_fingerprint(self, request):
        # 抓取时记录内容 hash，下次相同 hash 跳过
        if 'content_hash' in request.meta:
            return request.meta['content_hash']
        return super().request_fingerprint(request)
```

**关键参数**：
- 默认 = Python set（O(1) hash）
- 持久化 = SQLite（`from_crawler` 钩子）
- 指纹 = `request_fingerprint(request)` = sha1(method + url + body + headers)
- 跨爬虫 = `DUPEFILTER_DEBUG = True` 输出日志
- 自定义 = 继承 `BaseDupeFilter` 实现 `request_seen` / `open` / `close`
- JOBDIR = 启用持久化（断点续爬）

**最佳实践**：去重要带指纹（vs. 整 URL）——同一 URL 的不同 query 参数可能代表不同内容；`JOBDIR` 启用持久化，崩溃后重启不重复抓；自定义去重继承 `BaseDupeFilter`（按 content_hash 而非 URL）。

### 模式 5：Spider + Selector 声明式 DSL

**问题场景**：爬虫逻辑（解析 + 跟 URL）怎么组织才清晰？怎么让业务开发只关注"怎么解析"，不关注"怎么调度"？

**解决方案**：`Spider` 子类 + `Selector`（CSS / XPath）——`parse` 方法 yield Request / Item，框架负责调度。`CrawlSpider` 用 `rules` 自动跟链接。

```python
import scrapy
from scrapy.spiders import CrawlSpider, Rule
from scrapy.linkextractors import LinkExtractor

class QuoteSpider(scrapy.Spider):
    """普通 Spider"""
    name = 'quotes'
    start_urls = ['http://quotes.toscrape.com']
    allowed_domains = ['quotes.toscrape.com']

    def parse(self, response):
        # 解析
        for quote in response.css('div.quote'):
            yield {
                'text': quote.css('span.text::text').get(),
                'author': quote.css('small.author::text').get(),
            }
        # 跟链接
        next_page = response.css('li.next a::attr(href)').get()
        if next_page:
            yield response.follow(next_page, self.parse)

class QuotesCrawlSpider(CrawlSpider):
    """自动跟链接 Spider"""
    name = 'quotes_crawl'
    start_urls = ['http://quotes.toscrape.com']
    rules = (
        Rule(LinkExtractor(allow=r'/page/\d+'), callback='parse_item', follow=True),
        Rule(LinkExtractor(allow=r'/author/'), callback='parse_author'),
    )

    def parse_item(self, response):
        # 自动处理每个匹配页面
        yield {'url': response.url, 'title': response.css('h1::text').get()}
```

**关键参数**：
- `name` = 唯一标识
- `start_urls` = 入口 URL 列表
- `parse(response)` = 解析入口，yield Request / Item
- `allowed_domains` = offsite 中间件过滤
- `rules` = CrawlSpider 自动跟链接（LinkExtractor）
- Selector = `response.css('h1::text').get()` / `response.xpath('//h1/text()').get()`
- `response.follow(url, callback)` = 自动拼接 URL 跟链

**最佳实践**：爬虫业务用 Spider + Selector DSL 写——框架处理调度、去重、限流，业务只关注解析；CSS 选择器优先（vs. XPath，可读性更好）；`allowed_domains` 限制防 offsite 抓取；CrawlSpider 自动跟链适用"列表 + 详情"场景。

---

## 第二段：数据处理与扩展

### 模式 6：Item Pipeline 数据后处理

**问题场景**：抓到的 Item 需要清洗（去 HTML / 标准化日期 / 翻译字段） + 入库（MongoDB / PostgreSQL / S3）——怎么组织？把清洗写在 spider 里污染业务。

**解决方案**：`Item Pipeline` 链——`process_item(self, item, spider)` 顺序执行，可丢弃 / 修改 / 抛出 DropItem。`ITEM_PIPELINES` dict 排序（数字小先）。

```python
# settings.py
ITEM_PIPELINES = {
    'myproject.pipelines.CleanHtmlPipeline': 100,         # 清洗
    'myproject.pipelines.DeduplicationPipeline': 200,    # 去重
    'myproject.pipelines.MongoDBPipeline': 900,          # 入库
}

# pipelines.py
from itemadapter import ItemAdapter
from scrapy.exceptions import DropItem

class CleanHtmlPipeline:
    """清洗 HTML 标签"""
    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        if adapter.get('description'):
            adapter['description'] = re.sub(r'<[^>]+>', '', adapter['description'])
        return adapter.item

class DeduplicationPipeline:
    """基于内容 hash 去重"""
    def __init__(self):
        self.seen = set()
    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        content_hash = hashlib.md5(str(adapter.get('title', '')).encode()).hexdigest()
        if content_hash in self.seen:
            raise DropItem(f"Duplicate: {adapter.get('title')}")
        self.seen.add(content_hash)
        return item

class MongoDBPipeline:
    """入库 MongoDB"""
    def __init__(self, mongo_uri, mongo_db):
        self.mongo_uri = mongo_uri
        self.mongo_db = mongo_db
    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            mongo_uri=crawler.settings.get('MONGO_URI'),
            mongo_db=crawler.settings.get('MONGO_DATABASE', 'items')
        )
    def open_spider(self, spider):
        self.client = pymongo.MongoClient(self.mongo_uri)
        self.db = self.client[self.mongo_db]
    def close_spider(self, spider):
        self.client.close()
    def process_item(self, item, spider):
        self.db[spider.name].insert_one(ItemAdapter(item).asdict())
        return item
```

**关键参数**：
- 链式 = `ITEM_PIPELINES` dict 排序（数字小先）
- 返回 = `Item` 继续 / `raise DropItem` 丢弃
- 入库 = 末尾 pipeline 写数据库
- 清洗 = 中间 pipeline 去 HTML / 标准化
- 异常 = `from_crawler(cls, crawler)` 初始化
- `itemadapter` = 统一 dict / Item / dataclass 输入

**最佳实践**：数据处理用 Pipeline 链（vs. 在 spider 里写）——关注点分离（解析 / 清洗 / 入库）；用 `itemadapter` 兼容 dict / Item / dataclass；`DropItem` 显式丢弃（不静默）；`from_crawler` 工厂方法注入 settings。

### 模式 7：Extension 扩展点

**问题场景**：框架统计 / 日志 / telnet / memusage / 关闭理由——这些"非业务"功能放哪？混入核心污染主路径。

**解决方案**：`Extension` 抽象——`from_crawler(cls, crawler)` + `item_scraped` / `spider_closed` 等事件钩子。20+ 内置 extension。

```python
from scrapy import signals

class ItemCountExtension:
    """统计抓取 item 数量"""
    def __init__(self, stats):
        self.stats = stats
        self.count = 0

    @classmethod
    def from_crawler(cls, crawler):
        ext = cls(crawler.stats)
        # 订阅事件
        crawler.signals.connect(ext.item_scraped, signal=signals.item_scraped)
        crawler.signals.connect(ext.spider_closed, signal=signals.spider_closed)
        return ext

    def item_scraped(self, item, response, spider):
        self.count += 1
        self.stats.inc_value('item_scraped/count')

    def spider_closed(self, spider, reason):
        spider.logger.info(f"Spider closed: {self.count} items scraped")

# settings.py
EXTENSIONS = {
    'scrapy.extensions.corestats.CoreStats': 0,           # 核心统计
    'scrapy.extensions.logstats.LogStats': 0,             # 周期日志
    'scrapy.extensions.telnet.TelnetConsole': 0,          # 调试 telnet
    'scrapy.extensions.memusage.MemoryUsage': 0,          # 内存监控
    'scrapy.extensions.closespider.CloseSpider': 0,       # 关闭理由
    'myproject.extensions.ItemCountExtension': 100,      # 自定义
}
```

**关键参数**：
- 20+ extension = corestats / logstats / telnet / memusage / closespider / throttle
- 事件 = `item_scraped(item, response, spider)` / `spider_idle(spider)` / `spider_closed(spider, reason)`
- 启停 = `EXTENSIONS` dict 排序
- 自定义 = 继承 `BaseExtension` 实现钩子
- 关闭 = `CloseSpider` 异常触发优雅停止
- 信号 = `scrapy.signals.item_scraped` 等

**最佳实践**：框架的"非业务"功能用 Extension 抽象（vs. 混入核心）——用户按需启停，不污染主路径；用 signals 订阅事件而非直接 hook；自定义 Extension 必加 `from_crawler` 工厂方法。

### 模式 8：FEEDS 多格式导出

**问题场景**：抓取结果导出 JSON / JSONL / CSV / XML——怎么支持多格式且不污染 spider？每个 spider 自己写 export 重复代码。

**解决方案**：`FEEDS` 设置 + FeedExporter——`FEEDS = {'output.json': {'format': 'json', 'overwrite': True}}` 集中配置。支持 S3 / FTP / SFTP 远程存储。

```python
# settings.py
FEEDS = {
    'output/%(name)s/%(time)s.json': {
        'format': 'json',                  # json / jsonl / csv / xml / pickle / marshal
        'encoding': 'utf-8',
        'overwrite': True,                 # 覆盖 / append
        'item_filter': 'myproject.filters.MyFilter',  # 过滤 item
        'fields': ['title', 'price', 'url'],  # 限定字段
    },
    's3://my-bucket/scrapy/%(name)s.jsonl': {
        'format': 'jsonl',                 # JSON Lines
        'overwrite': False,                # 追加
        's3': {'access_key': '...', 'secret_key': '...'},
    },
    'ftp://user:pass@ftp.example.com/output.csv': {
        'format': 'csv',
        'fields': ['title', 'price'],
    },
}
```

**关键参数**：
- 格式 = json / jsonl / csv / xml / pickle / marshal
- 输出 = 本地文件 / S3 / FTP / SFTP（`URI` + `STORAGE`）
- 配置 = `overwrite` / `append` / `item_filter` / `fields`
- 触发 = 抓取结束 / 周期 / 手动 close_spider
- 性能 = 异步 IO + 缓冲
- 占位符 = `%(name)s` / `%(time)s` / `%(item_id)s`

**最佳实践**：导出数据用 FEEDS 设置（vs. 写 pipeline）——格式无关，业务 pipeline 只管数据处理；远程 S3 / FTP 用 URI scheme 直接配；多输出用占位符 `%(time)s` 区分。

### 模式 9：robots.txt 与 crawl politeness

**问题场景**：整站抓取触发反爬 / 法律问题——怎么尊重 robots.txt + 降低服务器压力？商业抓取（电商情报）规则风险高。

**解决方案**：`RobotsTxtMiddleware` + `AutoThrottle`——读 robots.txt 控制爬取节流（并发 / 延迟 / 自动调速）。遇 429 自动 backoff。

```python
# settings.py
ROBOTSTXT_OBEY = True                              # 强制遵守
ROBOTSTXT_USER_AGENT = 'MyBot/1.0'

# 节流
DOWNLOAD_DELAY = 1.0                              # 每个域名下载延迟 1s
CONCURRENT_REQUESTS_PER_DOMAIN = 8                 # 每域最多 8 并发
AUTOTHROTTLE_ENABLED = True                        # 启用 AutoThrottle
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0              # 目标并发（自动调）
AUTOTHROTTLE_START_DELAY = 1.0                     # 初始延迟
AUTOTHROTTLE_MAX_DELAY = 60.0                      # 最大延迟

# 错误响应 backoff
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [429, 500, 502, 503, 504, 408]  # 触发重试
```

**关键参数**：
- robots.txt = 强制遵守（`ROBOTSTXT_OBEY = True`）
- 下载延迟 = `DOWNLOAD_DELAY = 1` 秒
- AutoThrottle = `AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0` 动态调速
- 域名限流 = `CONCURRENT_REQUESTS_PER_DOMAIN = 8`
- 错误响应 = 遇到 429 自动 backoff
- 风险提示 = 商业抓取必须遵守 robots.txt

**最佳实践**：爬虫必装 robots.txt + AutoThrottle——商业抓取（电商情报）尊重规则避免法律风险；`DOWNLOAD_DELAY` 起步设 1s；启用 `AUTOTHROTTLE` 自适应服务器响应；`RETRY_HTTP_CODES` 包含 429 / 5xx。

### 模式 10：Scrapy Cloud 与水平扩展

**问题场景**：单机爬到瓶颈（CPU / 网络 / 存储）——怎么水平扩展？自建 K8s 成本高。

**解决方案**：Scrapy Cloud（Zyte 商业）——提交 spider + 资源（CPU / 内存）即可，平台负责调度 / 去重 / 监控。商业起步，量大自建。

```bash
# 安装 shub
pip install shub
# 登录
shub login
# 初始化项目
shub project init
# 配置项目
# scrapy.cfg:
[deploy]
project = 12345
# 部署
shub deploy
# 跑 spider
shub schedule spider_name
# 看监控
shub jobs
shub stats
```

**关键参数**：
- 提交 = `shub deploy`
- 资源 = 选 1x / 4x / 8x 计算单元
- 存储 = 云端 S3 / 自有 S3
- 监控 = 抓取速度 / 错误率 / Item 计数
- 替代 = 自建 K8s + scrapy-redis（共享队列）
- 计费 = 按计算单元小时

**最佳实践**：商业项目用 Scrapy Cloud 起步，量大后自建 K8s + scrapy-redis——避免过早重造轮子；10 万 URL 以下用 Cloud 划算；100 万 URL 以上自建 K8s 节省成本。

---

## 第三段：分布式与生产化

### 模式 11：scrapy-redis 分布式

**问题场景**：单机抓 100 万 URL 太慢——怎么多机分摊？自研协调服务复杂。

**解决方案**：scrapy-redis——把 Scheduler / DupeFilter / Item Pipeline 替换为 Redis 后端，多机共享队列 + 指纹 + 结果。简单稳定，运维成本低。

```python
# settings.py
SCHEDULER = "scrapy_redis.scheduler.Scheduler"
DUPEFILTER_CLASS = "scrapy_redis.dupefilter.RFPDupeFilter"
ITEM_PIPELINES = {
    'scrapy_redis.pipelines.RedisPipeline': 300,
}
REDIS_HOST = 'redis.example.com'
REDIS_PORT = 6379
REDIS_DB = 0
# 队列
SCHEDULER_QUEUE_CLASS = 'scrapy_redis.queue.PriorityQueue'   # 优先级队列
# 持久化
SCHEDULER_PERSIST = True                                      # 关闭后队列保留
SCHEDULER_FLUSH_ON_START = False                              # 启动不清空

# 启动多机（每机执行）
scrapy crawl my_spider
# 监控队列
redis-cli LLEN myspider:requests
```

**关键参数**：
- Scheduler = Redis Sorted Set（score = 优先级）
- DupeFilter = Redis Set（O(1) 指纹）
- Pipeline = Redis List / Pub-Sub
- 启动 = `scrapy runspider` 多机并行
- 监控 = Redis 队列长度 / Item 计数
- 持久化 = `SCHEDULER_PERSIST = True`

**最佳实践**：分布式爬虫用 Redis 共享队列 + 指纹——比自研协调服务简单 10x，运维成本低；`SCHEDULER_PERSIST = True` 断点续爬；监控 Redis 队列长度（`LLEN` 命令）观察进度；多机同时跑同一 spider 即可分布。

### 模式 12：HTTP/2 支持

**问题场景**：单连接并发 HTTP/1.1 触发反爬（head-of-line blocking）——HTTP/2 多路复用更隐蔽。频繁开 TCP 连接易被识别。

**解决方案**：2.6+ 集成 `scrapy-http2`——基于 `h2` 库，配置 `DOWNLOAD_HANDLERS` 启用。单连接多路复用。

```python
# settings.py
DOWNLOAD_HANDLERS = {
    'https': 'scrapy.core.downloader.handlers.http2.H2DownloadHandler',
    'http': 'scrapy.core.downloader.handlers.http11.HTTP11DownloadHandler',
}
# HTTP/2 特定设置
H2_POOL_SIZE = 100                       # 连接池大小
H2_POOL_KEEPALIVE = 60                   # 空闲连接存活秒
H2_DISCARD_MAX_TIMEOUT = 60              # 单请求最大超时
```

**关键参数**：
- 协议 = `https://` 走 HTTP/2
- 配置 = `scrapy.utils.http2.H2DownloadHandler`
- 限制 = 反代需支持（Cloudflare / Akamai 默认支持）
- 性能 = 单连接多路复用，减少指纹
- 风险 = 旧版 CDN 不支持
- 优势 = 减少 TCP 连接数 + 降低被反爬识别

**最佳实践**：现代爬虫优先 HTTP/2——减少连接数 + 降低被反爬识别概率；CDN / 反代必须支持 HTTP/2（Cloudflare / Akamai 默认支持）；HTTPS 站点才走 HTTP/2。

### 模式 13：Spider Contracts 测试

**问题场景**：spider 改一行可能坏整条抓取链——怎么自动化测试？真实爬一遍慢、mock 不全。

**解决方案**：`spider contracts` 装饰器——`@contracts(bounces='OK')` 等契约定义，spider 跑通即测试通过。`scrapy check` 命令触发。

```python
from scrapy.contracts import contracts
from scrapy.spiders import CrawlSpider

@contracts(
    returns='Item',                                    # 必须返回 Item
    scrapes={
        'title': 'My expected title',                  # 字段值断言
        'price': lambda v: v > 0,                      # 复杂断言
    },
    bounces='OK',                                      # 必须有 redirect / 404
    follows=r'/page/\d+',                              # 必须跟的 URL
)
class MySpider(CrawlSpider):
    name = 'my_spider'
    start_urls = ['http://example.com']

    def parse_item(self, response):
        yield {'title': response.css('h1::text').get(), 'price': 100}

# 跑测试
# scrapy check my_spider
# → 自动跑 spider，验证契约
# → 不需要 mock，spider 真实跑一遍
```

**关键参数**：
- 内置契约 = `returns` / `scrapes` / `bounces` / `follows`
- 自定义 = `scrapy.contracts.defaults` 子类
- 触发 = `check` 命令
- 持续集成 = `scrapy check spider_name`
- 优势 = 不需要 mock，spider 真实跑一遍
- 风险 = 跑测试要联网（真实抓取）

**最佳实践**：spider 关键路径加 contracts——一行装饰器确保业务回归，CI 自动跑；用 `scrapes` 字段断言代替手写测试；CI 跑 `scrapy check` 验证（联网环境）。

### 模式 14：Scrapy-Redis vs Frontera 选型

**问题场景**：scrapy-redis 用 Redis 集中队列，瓶颈在 Redis IO；Frontera 分布式更彻底但配置复杂。怎么选？

**解决方案**：选型决策——中等规模（10 台以内）用 scrapy-redis，简单稳定；大规模（百台）用 Frontera（基于 Kafka / ZeroMQ）。

```python
# scrapy-redis 模式
# 适用：< 10M URL / < 10 机器 / 简单运维
REDIS_HOST = 'redis.example.com'
SCHEDULER = "scrapy_redis.scheduler.Scheduler"

# Frontera 模式
# 适用：> 10M URL / > 10 机器 / 高吞吐
# 架构：Kafka 队列 + 独立 frontier / crawler / storage 服务
# scrapy-crawl-frontier 配置
SPIDER_MIDDLEWARES = {
    'scrapy_crawl_frontier.middlewares.SeedScheduler': 900,
    'scrapy_crawl_frontier.middlewares.SchedulerMiddleware': 900,
}
FRONTIER_SETTINGS = 'frontera_settings.py'
```

**关键参数**：
- scrapy-redis = Redis 共享队列
- Frontera = Kafka 队列 + 独立 frontier / crawler / storage 服务
- 性能 = Frontera 高吞吐 / scrapy-redis 低延迟
- 运维 = scrapy-redis 简单 / Frontera 复杂
- 适用 = scrapy-redis < 10M URL / Frontera > 10M URL

**最佳实践**：分布式爬虫 80% 用 scrapy-redis 就够，过早选 Frontera 是过度工程；先 scrapy-redis 跑起来，瓶颈明显再迁 Frontera；Frontera 适合 100+ 台机器 / 10M+ URL 场景。

### 模式 15：关闭理由（Close Reasons）

**问题场景**：spider 跑完 / 触限 / 出错——怎么知道为什么停？日志缺关键信息调试崩溃。

**解决方案**：`CloseSpider` 异常 + `closespider` extension——`raise CloseSpider('finished')` 触发优雅停止，reason 写入 stats。

```python
from scrapy.exceptions import CloseSpider

class MySpider(scrapy.Spider):
    name = 'my_spider'
    def parse(self, response):
        for item in self.parse_items(response):
            yield item
        if self.should_stop(response):
            raise CloseSpider('max_pages_reached')
        if self.no_more_results(response):
            raise CloseSpider('finished')

# settings.py
CLOSESPIDER_TIMEOUT = 3600                # 1 小时超时
CLOSESPIDER_ITEMCOUNT = 10000            # 1 万 item 停
CLOSESPIDER_ERRORCOUNT = 100             # 100 错误停
CLOSESPIDER_PAGECOUNT = 1000             # 1000 页停

# 输出
# stats.spider_exited/closespider_timeout
# stats.spider_exited/closespider_itemcount
# stats.spider_exited/closespider_finished

# 自定义关闭条件
class MyCustomCloseExtension:
    @classmethod
    def from_crawler(cls, crawler):
        ext = cls()
        crawler.signals.connect(ext.spider_idle, signal=signals.spider_idle)
        return ext
    def spider_idle(self, spider):
        if spider.crawler.stats.get_value('item_scraped/count', 0) > 5000:
            raise CloseSpider('custom_threshold')
```

**关键参数**：
- 触发 = `CloseSpider(reason)` 异常 / 阈值（item count / time / error count）
- 输出 = `stats.spider_exited/closespider_<reason>`
- 监控 = Scrapy Cloud 仪表盘
- 自定义 = `closespider_settings` 改阈值
- 调试 = 日志 `Spider closed: finished`

**最佳实践**：spider 关闭必带 reason——日志 + 监控能快速定位异常停止 / 正常完成；用 `closespider_*` 设置硬阈值（item count / time / error count）防失控；自定义关闭条件抛 `CloseSpider(reason)`。

---

## 第四段：JS 渲染与反爬

### 模式 16：Scrapy vs BeautifulSoup + requests 选型

**问题场景**：小项目（千级 URL）用 BeautifulSoup + requests 简单，大项目（百万级）怎么办？性能 / 复杂度 / 可维护性怎么权衡？

**解决方案**：规模决策——<10k URL 用 requests + BS4（简单）；10k-1M 用 Scrapy（异步 + 去重 + 限流内置）；>1M 用 Scrapy + 分布式（scrapy-redis / Frontera）。

```python
# < 10k URL：requests + BS4
import requests
from bs4 import BeautifulSoup
response = requests.get(url)
soup = BeautifulSoup(response.text, 'html.parser')
for item in soup.select('.item'):
    print(item.get_text())
# 优势：简单、5 分钟上手
# 劣势：同步、慢、无限流

# 10k-1M URL：Scrapy
import scrapy
class MySpider(scrapy.Spider):
    name = 'my'
    start_urls = ['http://example.com']
    def parse(self, response):
        for item in response.css('.item'):
            yield {'title': item.css('h2::text').get()}
# 优势：异步、内置中间件、可扩展

# > 1M URL：Scrapy + 分布式
# scrapy-redis 共享队列 / Frontera + Kafka
```

**关键参数**：
- requests + BS4 = 同步、简单、慢
- Scrapy = 异步、内置中间件、可扩展
- Scrapy 分布式 = 多机 + Redis / Kafka
- 上手 = requests 5 分钟 / Scrapy 1 小时
- 适用 = 抓一次 / 长期监控 / 整站爬取
- 阈值 = 10k URL（分水岭）

**最佳实践**：10k URL 阈值是分水岭——以下 requests，以上 Scrapy；Scrapy 项目必加中间件（robots.txt / AutoThrottle / retry）；100 万 URL 起步直接 scrapy-redis 分布式。

### 模式 17：Splash / Playwright JS 渲染

**问题场景**：JS 渲染页面（React SPA）——requests 拿到空壳 HTML，Scrapy 默认只处理静态。SPA 内容动态加载。

**解决方案**：集成 Splash（Scrapy 官方）/ Playwright（推荐）——Splash 是 HTTP 代理 + JS 引擎，Playwright 是真实 Chromium 自动化。

```python
# Splash 模式（HTTP 代理）
# settings.py
SPLASH_URL = 'http://localhost:8050'
DOWNLOADER_MIDDLEWARES = {
    'scrapy_splash.SplashCookiesMiddleware': 723,
    'scrapy_splash.SplashMiddleware': 725,
    'scrapy.downloadermiddlewares.httpcompression.HttpCompressionMiddleware': 810,
}
SPIDER_MIDDLEWARES = {'scrapy_splash.SplashDeduplicateArgsMiddleware': 100}
# 用法
yield scrapy.Request(url, self.parse, meta={'splash': {'args': {'wait': 1.0}}})

# Playwright 模式（真实浏览器，推荐）
# settings.py
DOWNLOAD_HANDLERS = {
    'http': 'scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler',
    'https': 'scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler',
}
# 用法
yield scrapy.Request(url, self.parse, meta={
    'playwright': True,
    'playwright_include_page': True,  # 拿 page 对象
    'playwright_page_methods': [
        PageMethod('wait_for_selector', '.loaded'),
        PageMethod('evaluate', 'window.scrollTo(0, document.body.scrollHeight)'),
    ],
})
```

**关键参数**：
- Splash = `scrapy-splash`，HTTP API 调用
- Playwright = `scrapy-playwright`，`meta={'playwright': True}`
- 性能 = Splash 快但功能弱 / Playwright 慢但 100% 真实
- 反爬 = Playwright stealth 模式
- 成本 = Playwright 吃 CPU
- 推荐 = 现代项目优先 Playwright

**最佳实践**：简单 JS 用 Splash，复杂 SPA 用 Playwright——按真实需求选择，不盲目上 Playwright；Playwright 加 `playwright-stealth` 隐藏 webdriver；CPU 不足时回退 Splash。

### 模式 18：指纹伪装与反爬对抗

**问题场景**：电商 / 票务网站 WAF 检测爬虫——IP 限频 + User-Agent 黑白 + 浏览器指纹。硬刚 WAF 不可持续。

**解决方案**：`scrapy-fake-useragent` + 代理池 + 浏览器指纹随机化——`AUTOTHROTTLE` + 中间件替换 UA + Cookies。伪装成正常用户。

```python
# settings.py
# 1. UA 池
USER_AGENT_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ...',
    # ... 100+ 真实 UA
]
DOWNLOADER_MIDDLEWARES = {
    'scrapy.downloadermiddlewares.useragent.UserAgentMiddleware': None,
    'scrapy_fake_useragent.middleware.RandomUserAgentMiddleware': 400,
}

# 2. 代理池
ROTATING_PROXY_LIST = [
    'proxy1.com:8000',
    'proxy2.com:8000',
]
DOWNLOADER_MIDDLEWARES = {
    'rotating_proxies.middlewares.RotatingProxyMiddleware': 610,
    'rotating_proxies.middlewares.BanDetectionMiddleware': 620,
}

# 3. 节流
DOWNLOAD_DELAY = random.uniform(1, 3)    # 随机延迟
AUTOTHROTTLE_ENABLED = True

# 4. 浏览器指纹
# playwright-stealth
from playwright_stealth import stealth_async
async with async_playwright() as p:
    browser = await p.chromium.launch()
    page = await browser.new_page()
    await stealth_async(page)              # 隐藏 webdriver
```

**关键参数**：
- UA 池 = `scrapy-fake-useragent` 随机
- 代理 = `scrapy-rotating-proxies` 失效检测
- 指纹 = `playwright-stealth` 隐藏 webdriver
- 节流 = `DOWNLOAD_DELAY = random.uniform(1, 3)`
- 反检测 = Headless Chrome + 真实 Chrome Profile
- 法律风险 = 商业抓取需评估合规

**最佳实践**：反爬对抗 3 件套——UA 池 + 代理池 + 节流；不要硬刚 WAF，伪装成正常用户；商业抓取前评估合规（robots.txt + ToS）；IP 限频时优先降速而非加 IP。

### 模式 19：数据入湖 / 入仓

**问题场景**：Scrapy 抓到的数据怎么进数据湖（S3 / GCS）/ 数据仓库（BigQuery / Snowflake）？写本地再上传慢、零中间环节。

**解决方案**：`FEEDS` 配置 + 商业 scrapy-cloudwatch——输出到 S3 + Athena 查询；或 pipeline 写 BigQuery / Snowflake。

```python
# settings.py
# 1. S3 直传（推荐）
FEEDS = {
    's3://my-bucket/scrapy/%(name)s/%(time)s.json': {
        'format': 'json',
        'overwrite': True,
        's3': {'access_key': '...', 'secret_key': '...', 'region': 'us-east-1'},
    },
}

# 2. BigQuery 入仓（pipeline 方式）
from google.cloud import bigquery
class BigQueryPipeline:
    def open_spider(self, spider):
        self.client = bigquery.Client()
        self.table = self.client.get_table('project.dataset.items')
    def process_item(self, item, spider):
        self.client.insert_rows_json(self.table, [dict(item)])
        return item

# 3. Iceberg / Parquet（数据湖）
import pyarrow as pa
import pyarrow.parquet as pq
class ParquetPipeline:
    def process_item(self, item, spider):
        # 批量写 Parquet
        ...

# 4. 监控
# AWS Glue / Databricks / Snowflake 查询
```

**关键参数**：
- S3 = `FEEDS = {'s3://bucket/output.json': {'format': 'json'}}`
- BigQuery = `scrapy-bigquery` pipeline
- Snowflake = `snowflake-connector-python` 自定义 pipeline
- Iceberg = `pyarrow` 写 Parquet
- 监控 = AWS Glue / Databricks
- 格式 = JSONL 流式（每行 1 record）

**最佳实践**：数据入湖用 FEEDS 直接写 S3——比写本地再上传简单 5x，零中间环节；批量入仓用 pipeline 写 BigQuery / Snowflake；Iceberg / Parquet 做数据湖分层；监控队列长度 + 错误率。

### 模式 20：7 天复刻 mini-scrapy 路线

**问题场景**：想理解 Scrapy 架构但 625 文件读不完；想做 mini-scrapy 玩具练手。直接读源码迷失在细节。

**解决方案**：7 天 MVP——Day 1-2 核心引擎（执行循环），Day 3 中间件链，Day 4 Spider + Selector，Day 5 Pipeline，Day 6 FEEDS 导出，Day 7 JOBDIR 持久化。

```bash
# Day 1-2: ExecutionEngine（核心循环）
day1/
├── engine.py            # 7 状态机（open/schedule/download/response/spider_idle/close）
├── scheduler.py         # 队列（set/queue）
└── tests/

# Day 3: Downloader Middleware
day3/
├── middleware.py        # 链式钩子
└── tests/

# Day 4: Spider + Selector
day4/
├── spider.py            # base Spider
├── selector.py          # CSS / XPath
├── crawlspider.py       # 规则自动跟链
└── tests/

# Day 5: Item Pipeline
day5/
├── item.py              # Item / Field
├── pipelines.py         # process_item 链
└── tests/

# Day 6: FEEDS 导出
day6/
├── exporter.py          # JSON/CSV/XML
├── feed.py              # 远程 S3/FTP
└── tests/

# Day 7: JOBDIR 持久化
day7/
├── dupefilter.py        # 持久化指纹
├── jobdir.py            # 队列 + 指纹 + stats
└── tests/
```

**关键参数**：
- 核心 = ExecutionEngine 7 状态机
- 协议 = `Request` / `Response` / `Item` 3 数据结构
- 中间件 = 链式钩子
- 复用 = 30+ middleware 不需自己写
- 复刻难度 = 核心 200 行可讲清楚，全栈要 5-7 天
- 关键决策 = Day 1-2 必须做对（核心循环决定后续）

**最佳实践**：复刻 mini-scrapy 先做 ExecutionEngine + Spider + Selector——核心循环 300 行，2 周能出可用品；复用成熟库（parsel / requests）不重写；3 数据结构（Request / Response / Item）定协议。

---

## 附录：5 段必读代码

1. `scrapy/core/engine.py` — ExecutionEngine 7 状态机（14 年长出的核心）
2. `scrapy/core/downloader/middleware.py` — MiddlewareManager（链式钩子管理）
3. `scrapy/dupefilters.py` — RFPDupeFilter 指纹 + 持久化去重
4. `scrapy/extensions/feedexport.py` — FEEDS 多格式导出（S3 / FTP / 本地）
5. `scrapy/core/scraper.py` — Scraper（Item Pipeline 链 + Spider 回调）

## 一句话总结

scrapy = Twisted→asyncio 5 年渐进迁移 + ExecutionEngine 7 状态机调度 + 30+ Middleware 链式可插拔 + RFPDupeFilter 指纹去重 + JOBDIR 断点续爬，把"生产级爬虫"做到 14 年长盛不衰，Zyte 商业化 + scrapy-redis 分布式 + HTTP/2 + JS 渲染全栈覆盖；最值得偷的是"7 状态机调度核心 + 链式 Middleware"——ExecutionEngine 7 状态（open/schedule/download/response/spider_idle/close）让爬虫全生命周期显式可控，30+ Middleware 通过 `DOWNLOADER_MIDDLEWARES` dict 按数字排序链式执行，把横切关注点（retry/redirect/cookies/proxy/robotstxt）做成可插拔插件而不污染核心。
