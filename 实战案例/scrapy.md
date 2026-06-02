# scrapy - Twisted + asyncio 双栈 Python 异步爬虫框架

**GitHub**: scrapy/scrapy
**Star**: 54k+
**语言**: Python / Twisted / asyncio
**主题**: web-scraping-framework / async / twisted / production-crawler
**适用场景**: 学习 Twisted→asyncio 迁移、Middleware 链设计、整站抓取架构、持久化去重

---

## 第一段：基础范式

### 模式 1：Twisted→asyncio 渐进迁移

**问题场景**：Twisted Deferred 难学、async/await 是 Python 3.5+ 标配；老项目绑 Twisted 难换。

**解决方案**：scrapy 用 5 年（2015-2020）走完迁移——1.5 加 asyncio 支持（双栈共存）、2.0 移除 Python 2、2.6 HTTP/2、2.11 asyncio 默认、2.14 全 async API。

**关键参数**：
- 1.5 = asyncio 支持（保留 Twisted 默认）
- 2.0 = 移除 Python 2 兼容代码
- 2.6 = HTTP/2 支持
- 2.11 = asyncio 默认 reactor
- 2.14 = `start_async` / `stop_async` / `close_async` 全异步

**最佳实践**：异步库迁移用"共存 → 默认 → 唯一"三步走——强制升级会激怒老用户，逐步切换比 big-bang 重写更稳。

### 模式 2：ExecutionEngine 调度核心

**问题场景**：爬虫的"抓取 → 解析 → 入库"循环怎么调度？怎么把 spider / downloader / scheduler / pipeline 串起来？

**解决方案**：`scrapy/core/engine.py` 的 ExecutionEngine 是 14 年长出的核心——`open_spider / start / schedule / download / response / spider_idle / close_spider` 7 状态机。

**关键参数**：
- 7 状态 = open → schedule → download → response → spider_idle → close
- 心跳 = `_spider_idle` 回调决定继续 / 停止
- 中间件链 = `process_request` / `process_response` / `process_exception`
- 并发控制 = `CONCURRENT_REQUESTS` + `CONCURRENT_REQUESTS_PER_DOMAIN`
- 持久化 = `JOBDIR` 断点续爬

**最佳实践**：长生命周期框架的核心是"状态机 + 事件回调"——别用 if-else 堆逻辑，让状态显式转换。

### 模式 3：Downloader Middleware 链

**问题场景**：30+ 横切关注点（retry / redirect / cookies / proxy / cache / robotstxt）——怎么组织才能不污染核心代码？

**解决方案**：30+ Downloader Middleware 链式——`process_request` / `process_response` / `process_exception` 3 个钩子，开发者可通过 `DOWNLOADER_MIDDLEWARES` dict 启停/排序。

**关键参数**：
- 链式 = `settings.getwithbase('DOWNLOADER_MIDDLEWARES')` 排序
- 优先级 = 数字小先执行（默认 500）
- 返回值 = `None` 继续 / `Response` 短路 / `Request` 重试 / `raise IgnoreRequest` 跳过
- 自定义 = 写 `process_request(self, request, spider)` 即可
- 顺序敏感 = cookies 在 redirect 之前

**最佳实践**：横切关注点用 middleware 链实现（vs. 继承）——按数字排序、可插拔、不污染核心。

### 模式 4：DupeFilter 持久化去重

**问题场景**：整站抓取 URL 千万级——内存去重爆、崩溃后重启重复抓。

**解决方案**：`scrapy/dupefilters.py` RFPDupeFilter——默认用 `set()` 内存去重，2.0+ 支持 `RFPDupeFilter` 持久化到 SQLite（通过 `JOBDIR`）。

**关键参数**：
- 默认 = Python set（O(1) hash）
- 持久化 = SQLite（`from_crawler` 钩子）
- 指纹 = `request_fingerprint(request)` = sha1(method + url + body + headers)
- 跨爬虫 = `DUPEFILTER_DEBUG = True` 输出日志
- 自定义 = 继承 `BaseDupeFilter` 实现 `request_seen` / `open` / `close`

**最佳实践**：去重要带指纹（vs. 整 URL）——同一 URL 的不同 query 参数可能代表不同内容。

### 模式 5：Spider + Selector 声明式 DSL

**问题场景**：爬虫逻辑（解析 + 跟 URL）怎么组织才清晰？怎么让业务开发只关注"怎么解析"，不关注"怎么调度"？

**解决方案**：`Spider` 子类 + `Selector`（CSS / XPath）——`parse` 方法 yield Request / Item，框架负责调度。

**关键参数**：
- `name` = 唯一标识
- `start_urls` = 入口 URL 列表
- `parse(response)` = 解析入口，yield Request / Item
- `allowed_domains` = offsite 中间件过滤
- `rules` = CrawlSpider 自动跟链接（LinkExtractor）
- Selector = `response.css('h1::text').get()` / `response.xpath('//h1/text()').get()`

**最佳实践**：爬虫业务用 Spider + Selector DSL 写——框架处理调度、去重、限流，业务只关注解析。

---

## 第二段：扩展范式

### 模式 6：Item Pipeline 数据后处理

**问题场景**：抓到的 Item 需要清洗（去 HTML / 标准化日期 / 翻译字段） + 入库（MongoDB / PostgreSQL / S3）——怎么组织？

**解决方案**：`Item Pipeline` 链——`process_item(self, item, spider)` 顺序执行，可丢弃 / 修改 / 抛出 DropItem。

**关键参数**：
- 链式 = `ITEM_PIPELINES` dict 排序（数字小先）
- 返回 = `Item` 继续 / `raise DropItem` 丢弃
- 入库 = 末尾 pipeline 写数据库
- 清洗 = 中间 pipeline 去 HTML / 标准化
- 异常 = `from_crawler(cls, crawler)` 初始化

**最佳实践**：数据处理用 Pipeline 链（vs. 在 spider 里写）——关注点分离（解析 / 清洗 / 入库）。

### 模式 7：Extension 扩展点

**问题场景**：框架统计 / 日志 / telnet / memusage / 关闭理由——这些"非业务"功能放哪？

**解决方案**：`Extension` 抽象——`from_crawler(cls, crawler)` + `item_scraped` / `spider_closed` 等事件钩子。

**关键参数**：
- 20+ extension = corestats / logstats / telnet / memusage / closespider / throttle
- 事件 = `item_scraped(item, response, spider)` / `spider_idle(spider)`
- 启停 = `EXTENSIONS` dict 排序
- 自定义 = 继承 `BaseExtension` 实现钩子
- 关闭 = `CloseSpider` 异常触发优雅停止

**最佳实践**：框架的"非业务"功能用 Extension 抽象（vs. 混入核心）——用户按需启停，不污染主路径。

### 模式 8：FEEDS 多格式导出

**问题场景**：抓取结果导出 JSON / JSONL / CSV / XML——怎么支持多格式且不污染 spider？

**解决方案**：`FEEDS` 设置 + FeedExporter——`FEEDS = {'output.json': {'format': 'json', 'overwrite': True}}` 集中配置。

**关键参数**：
- 格式 = json / jsonl / csv / xml / pickle / marshal
- 输出 = 本地文件 / S3 / FTP / SFTP（`URI` + `STORAGE`）
- 配置 = `overwrite` / `append` / `item_filter` / `fields`
- 触发 = 抓取结束 / 周期 / 手动 close_spider
- 性能 = 异步 IO + 缓冲

**最佳实践**：导出数据用 FEEDS 设置（vs. 写 pipeline）——格式无关，业务 pipeline 只管数据处理。

### 模式 9：robots.txt 与 crawl politeness

**问题场景**：整站抓取触发反爬 / 法律问题——怎么尊重 robots.txt + 降低服务器压力？

**解决方案**：`RobotsTxtMiddleware` + `AutoThrottle`——读 robots.txt 控制爬取节流（并发 / 延迟 / 自动调速）。

**关键参数**：
- robots.txt = 强制遵守（`ROBOTSTXT_OBEY = True`）
- 下载延迟 = `DOWNLOAD_DELAY = 1` 秒
- AutoThrottle = `AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0` 动态调速
- 域名限流 = `CONCURRENT_REQUESTS_PER_DOMAIN = 8`
- 错误响应 = 遇到 429 自动 backoff

**最佳实践**：爬虫必装 robots.txt + AutoThrottle——商业抓取（电商情报）尊重规则避免法律风险。

### 模式 10：Scrapy Cloud 与水平扩展

**问题场景**：单机爬到瓶颈（CPU / 网络 / 存储）——怎么水平扩展？

**解决方案**：Scrapy Cloud（Zyte 商业）——提交 spider + 资源（CPU / 内存）即可，平台负责调度 / 去重 / 监控。

**关键参数**：
- 提交 = `shub deploy`
- 资源 = 选 1x / 4x / 8x 计算单元
- 存储 = 云端 S3 / 自有 S3
- 监控 = 抓取速度 / 错误率 / Item 计数
- 替代 = 自建 K8s + scrapy-redis（共享队列）

**最佳实践**：商业项目用 Scrapy Cloud 起步，量大后自建 K8s + scrapy-redis——避免过早重造轮子。

---

## 第三段：进阶范式

### 模式 11：scrapy-redis 分布式

**问题场景**：单机抓 100 万 URL 太慢——怎么多机分摊？

**解决方案**：scrapy-redis——把 Scheduler / DupeFilter / Item Pipeline 替换为 Redis 后端，多机共享队列 + 指纹 + 结果。

**关键参数**：
- Scheduler = Redis Sorted Set（score = 优先级）
- DupeFilter = Redis Set（O(1) 指纹）
- Pipeline = Redis List / Pub-Sub
- 启动 = `scrapy runspider` 多机并行
- 监控 = Redis 队列长度 / Item 计数

**最佳实践**：分布式爬虫用 Redis 共享队列 + 指纹——比自研协调服务简单 10x，运维成本低。

### 模式 12：HTTP/2 支持

**问题场景**：单连接并发 HTTP/1.1 触发反爬（head-of-line blocking）——HTTP/2 多路复用更隐蔽。

**解决方案**：2.6+ 集成 `scrapy-http2`——基于 `h2` 库，配置 `DOWNLOAD_HANDLERS` 启用。

**关键参数**：
- 协议 = `https://` 走 HTTP/2
- 配置 = `scrapy.utils.http2.H2DownloadHandler`
- 限制 = 反代需支持（Cloudflare / Akamai 默认支持）
- 性能 = 单连接多路复用，减少指纹
- 风险 = 旧版 CDN 不支持

**最佳实践**：现代爬虫优先 HTTP/2——减少连接数 + 降低被反爬识别概率。

### 模式 13：Spider Contracts 测试

**问题场景**：spider 改一行可能坏整条抓取链——怎么自动化测试？

**解决方案**：`spider contracts` 装饰器——`@contracts(bounces='OK')` 等契约定义，spider 跑通即测试通过。

**关键参数**：
- 内置契约 = `returns` / `scrapes` / `bounces` / `follows`
- 自定义 = `scrapy.contracts.defaults` 子类
- 触发 = `check` 命令
- 持续集成 = `scrapy check spider_name`
- 优势 = 不需要 mock，spider 真实跑一遍

**最佳实践**：spider 关键路径加 contracts——一行装饰器确保业务回归，CI 自动跑。

### 模式 14：Scrapy-Redis vs Frontera

**问题场景**：scrapy-redis 用 Redis 集中队列，瓶颈在 Redis IO；Frontera 分布式更彻底但配置复杂。

**解决方案**：选型决策——中等规模（10 台以内）用 scrapy-redis，简单稳定；大规模（百台）用 Frontera（基于 Kafka / ZeroMQ）。

**关键参数**：
- scrapy-redis = Redis 共享队列
- Frontera = Kafka 队列 + 独立 frontier / crawler / storage 服务
- 性能 = Frontera 高吞吐 / scrapy-redis 低延迟
- 运维 = scrapy-redis 简单 / Frontera 复杂
- 适用 = scrapy-redis < 10M URL / Frontera > 10M URL

**最佳实践**：分布式爬虫 80% 用 scrapy-redis 就够，过早选 Frontera 是过度工程。

### 模式 15：关闭理由（Close Reasons）

**问题场景**：spider 跑完 / 触限 / 出错——怎么知道为什么停？

**解决方案**：`CloseSpider` 异常 + `closespider` extension——`raise CloseSpider('finished')` 触发优雅停止，reason 写入 stats。

**关键参数**：
- 触发 = `CloseSpider(reason)` 异常 / 阈值（item count / time / error count）
- 输出 = `stats.spider_exited/closespider_<reason>`
- 监控 = Scrapy Cloud 仪表盘
- 自定义 = `closespider_settings` 改阈值
- 调试 = 日志 `Spider closed: finished`

**最佳实践**：spider 关闭必带 reason——日志 + 监控能快速定位异常停止 / 正常完成。

---

## 第四段：实战范式

### 模式 16：Scrapy vs BeautifulSoup + requests

**问题场景**：小项目（千级 URL）用 BeautifulSoup + requests 简单，大项目（百万级）怎么办？

**解决方案**：规模决策——<10k URL 用 requests + BS4（简单）；10k-1M 用 Scrapy（异步 + 去重 + 限流内置）；>1M 用 Scrapy + 分布式（scrapy-redis / Frontera）。

**关键参数**：
- requests + BS4 = 同步、简单、慢
- Scrapy = 异步、内置中间件、可扩展
- Scrapy 分布式 = 多机 + Redis / Kafka
- 上手 = requests 5 分钟 / Scrapy 1 小时
- 适用 = 抓一次 / 长期监控 / 整站爬取

**最佳实践**：10k URL 阈值是分水岭——以下 requests，以上 Scrapy。

### 模式 17：Splash / Playwright 渲染

**问题场景**：JS 渲染页面（React SPA）——requests 拿到空壳 HTML，Scrapy 默认只处理静态。

**解决方案**：集成 Splash（Scrapy 官方）/ Playwright（推荐）——Splash 是 HTTP 代理 + JS 引擎，Playwright 是真实 Chromium 自动化。

**关键参数**：
- Splash = `scrapy-splash`，HTTP API 调用
- Playwright = `scrapy-playwright`，`meta={'playwright': True}`
- 性能 = Splash 快但功能弱 / Playwright 慢但 100% 真实
- 反爬 = Playwright stealth 模式
- 成本 = Playwright 吃 CPU

**最佳实践**：简单 JS 用 Splash，复杂 SPA 用 Playwright——按真实需求选择，不盲目上 Playwright。

### 模式 18：指纹伪装与反爬对抗

**问题场景**：电商 / 票务网站 WAF 检测爬虫——IP 限频 + User-Agent 黑白 + 浏览器指纹。

**解决方案**：`scrapy-fake-useragent` + 代理池 + 浏览器指纹随机化——`AUTOTHROTTLE` + 中间件替换 UA + Cookies。

**关键参数**：
- UA 池 = `scrapy-fake-useragent` 随机
- 代理 = `scrapy-rotating-proxies` 失效检测
- 指纹 = `playwright-stealth` 隐藏 webdriver
- 节流 = `DOWNLOAD_DELAY = random.uniform(1, 3)`
- 反检测 = Headless Chrome + 真实 Chrome Profile

**最佳实践**：反爬对抗 3 件套——UA 池 + 代理池 + 节流；不要硬刚 WAF，伪装成正常用户。

### 模式 19：数据入湖 / 入仓

**问题场景**：Scrapy 抓到的数据怎么进数据湖（S3 / GCS）/ 数据仓库（BigQuery / Snowflake）？

**解决方案**：`FEEDS` 配置 + 商业 scrapy-cloudwatch——输出到 S3 + Athena 查询；或 pipeline 写 BigQuery / Snowflake。

**关键参数**：
- S3 = `FEEDS = {'s3://bucket/output.json': {'format': 'json'}}`
- BigQuery = `scrapy-bigquery` pipeline
- Snowflake = `snowflake-connector-python` 自定义 pipeline
- Iceberg = `pyarrow` 写 Parquet
- 监控 = AWS Glue / Databricks

**最佳实践**：数据入湖用 FEEDS 直接写 S3——比写本地再上传简单 5x，零中间环节。

### 模式 20：7 天复刻 mini-scrapy 路线

**问题场景**：想理解 Scrapy 架构但 625 文件读不完；想做 mini-scrapy 玩具练手。

**解决方案**：7 天 MVP——Day 1-2 核心引擎（执行循环），Day 3 中间件链，Day 4 Spider + Selector，Day 5 Pipeline，Day 6 FEEDS 导出，Day 7 JOBDIR 持久化。

**关键参数**：
- 核心 = ExecutionEngine 7 状态机
- 协议 = `Request` / `Response` / `Item` 3 数据结构
- 中间件 = 链式钩子
- 复用 = 30+ middleware 不需自己写
- 复刻难度 = 核心 200 行可讲清楚，全栈要 5-7 天

**最佳实践**：复刻 mini-scrapy 先做 ExecutionEngine + Spider + Selector——核心循环 300 行，2 周能出可用品。

---

## 附录：5 段必读代码

1. `scrapy/core/engine.py` — ExecutionEngine 7 状态机（14 年长出的核心）
2. `scrapy/core/downloader/middleware.py` — MiddlewareManager（链式钩子管理）
3. `scrapy/dupefilters.py` — RFPDupeFilter 指纹 + 持久化去重
4. `scrapy/extensions/feedexport.py` — FEEDS 多格式导出（S3 / FTP / 本地）
5. `scrapy/core/scraper.py` — Scraper（Item Pipeline 链 + Spider 回调）

## 一句话总结

scrapy = Twisted→asyncio 5 年渐进迁移 + ExecutionEngine 7 状态机调度 + 30+ Middleware 链式可插拔 + RFPDupeFilter 指纹去重 + JOBDIR 断点续爬，把"生产级爬虫"做到 14 年长盛不衰，Zyte 商业化 + scrapy-redis 分布式 + HTTP/2 + JS 渲染全栈覆盖。
