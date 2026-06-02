# yt-dlp - 跨站点下载器的 RequestDirector 偏好注册表 + lazy extractor 代码生成 + JS Challenge 求解框架典范

**GitHub**: yt-dlp/yt-dlp
**Star**: ~100k+
**语言**: Python
**主题**: 视频下载、Extractor 抽象、JS Challenge 求解、ffmpeg 集成
**适用场景**: 视频采集、媒体处理、自动化运维、爬虫

## 第一段：基础范式

### 模式 1：Extractor 抽象与继承体系

**问题场景**：支持 1800+ 网站（YouTube/Bilibili/Vimeo/...），每个站格式不同——重复样板爆炸。

**解决方案**：`YoutubeDL` 是顶层协调器，`InfoExtractor`（IE）是基类。每站点一个 IE 子类（`YoutubeIE`/`BilibiliIE`），继承 `_VALID_URL`（URL 模式）+ `_real_extract(url)`（提取方法）+ `_TESTS`（测试用例）。`_search_regex`/`_download_json` 是工具方法。

**关键参数**：
- `InfoExtractor` 基类
- `_VALID_URL` 正则匹配
- `_real_extract(url)` 入口
- `_TESTS` 自测
- `_search_regex` 工具

**最佳实践**：每站点单 IE 子类；用 `_VALID_URL` 精确匹配；`_real_extract` 单方法入口；用 `_TESTS` 自带测试；继承通用方法（`_search_regex`/`_download_json`）；用 `_extract_from_template` 复用。

### 模式 2：InfoDict 统一数据格式

**问题场景**：每站点返回数据格式不同（YouTube 用 `title`/`duration`，Bilibili 用 `desc`/`length`）——下游难处理。

**解决方案**：`InfoDict` 是标准字典：`id`/`title`/`url`/`ext`/`duration`/`view_count`/`like_count`/`upload_date`/`uploader`/`thumbnails`/`formats` 等。`_real_extract` 返回 InfoDict（每视频可能多 format 列表）。

**关键参数**：
- 标准化字段
- `id`/`title`/`url`
- `formats: [{url, ext, height, tbr, ...}]`
- `thumbnails`
- 元数据

**最佳实践**：用 InfoDict 标准字段；`formats` 列表含所有清晰度；用 `_sort_formats` 排序；用 `thumbnails` 列表；用 `live_status`/`release_timestamp`；用 `epoch`/`release_date`；用 `_write_subtitles` 字幕。

### 模式 3：format 排序与选择（format selector）

**问题场景**：用户要 mp4 + 1080p + 30fps；或者 bestaudio；或者 worst —— 用 ffmpeg 合并？需要 format 智能选择。

**解决方案**：`format_sort`/`format_sort_force` 把 format 列表按字段排序（`res`/`fps`/`hdr`/`lang`/`quality`）。`format` 参数是 selector（`best[ext=mp4][height<=1080]`）。`YoutubeDL` 用 `process_info` 选 format + merge。

**关键参数**：
- `format: 'best'`
- `format: 'bestvideo+bestaudio'`
- `format: 'best[height<=720]'`
- `format_sort: ['res', 'fps']`
- `format_sort_force`

**最佳实践**：用 `-f 'bestvideo[ext=mp4]+bestaudio'`；用 `-S 'res:1080'` 排序；用 `--format-sort` 配；用 `best[ext=mp4]` 过滤；用 `--merge-output-format mp4`；用 `-F` 列 format。

### 模式 4：下载与重试机制

**问题场景**：网络下载失败（限流/超时/CDN 错误）——需要重试 + 进度条 + 分段。

**解决方案**：`YoutubeDL` 内部用 `FileDownloader`（`HttpFD`/`HlsFD`/`FfmpegFD`/`RtmpFD`/`MhtmlFD`），每个有 `_download`/`real_download`。`Retrying` 包重试（`Retries`/`FileAlloc`/`Fragment`）。`YoutubeDL._socket_timeout`/`_retries` 配。

**关键参数**：
- `FileDownloader` 多协议
- `HttpFD` HTTP/HTTPS
- `HlsFD` HLS/m3u8
- `FfmpegFD` m3u8/mpd
- `--retries`/`--fragment-retries`

**最佳实践**：HLS 用 `FfmpegFD`（最稳）；DASH 用 `FfmpegFD`；用 `--concurrent-fragments 4` 并行；用 `--retries infinite` 极端；用 `--limit-rate 1M` 限速；用 `--no-part` 禁 .part。

### 模式 5：ffmpeg 后处理

**问题场景**：下载的视频/音频要合并（mp4 + m4a）、转码（mkv → mp4）、嵌入字幕、剪辑。

**解决方案**：`ffmpeg`/`ffprobe` 是 PostProcessor 工具链。`YoutubeDL` 用 `FFmpegMergerPP`/`FFmpegVideoConvertorPP`/`FFmpegSubtitlesConvertorPP`/`MetadataParserPP` 等。`--merge-output-format mp4` 强制合并格式。`--recode-video` 转码。

**关键参数**：
- `FFmpegMergerPP` 合并
- `FFmpegVideoConvertorPP` 转码
- `FFmpegSubtitlesConvertorPP` 字幕
- `--postprocessor-args`
- `--recode-video`

**最佳实践**：用 `ffmpeg` 合并 video + audio；用 `--recode-video mp4` 兼容性；用 `--postprocessor-args '-c:v libx264'`；用 `--embed-subs` 嵌字幕；用 `--embed-thumbnail` 封面；用 `--xattrs` 元数据。

## 第二段：扩展范式

### 模式 6：RequestDirector 与 Header 偏好

**问题场景**：每站点有不同 headers 需求（YouTube 要 `Cookie`/`User-Agent`/`X-Youtube-Client-Name`，Bilibili 要 `Referer`/`Cookie`）——手动管理繁琐。

**解决方案**：`YoutubeDL` 内有 `_request_director`（`yt_dlp.networking.RequestDirector`），每个站 IE 设 `_REQUEST_HEADERS` 字典。`YoutubeDLParams` 配 `headers`/`cookies`/`proxy`/`source_address`。`_downloader._opener` 维护 HTTP opener。

**关键参数**：
- `_REQUEST_HEADERS` 字段
- `headers` 全局
- `cookies` from browser
- `proxy` 代理
- `source_address` IP

**最佳实践**：用 `--add-headers 'Referer:xxx'`；用 `--cookies-from-browser chrome`；用 `--proxy http://...`；用 `--source-address 1.2.3.4`；用 `-U` 更新 UA；用 `impersonate` 模拟浏览器 TLS。

### 模式 7：JS Challenge 求解（n/y/sig cipher）

**问题场景**：YouTube 等站点对视频签名加密（`signature` cipher），直接拿 URL 会被服务端拒绝——需要跑 JS 解密。

**解决方案**：`yt-dlp` 自带 `yt.solver`（基于 JavaScript runtime）：`_youtube_extract_player_response` 解析 player JS（`base.js`），提取 `sig`/`n` 解密函数。`NodeJS`/`QuickJS`/`Bun`/`Deno` 是 JS runtime 备选。`js_runtimes` 配。

**关键参数**：
- `yt.solver` 求解器
- `js_runtimes: { node: {...} }`
- `base.js` player
- `sig`/`n` cipher
- `NodeJS`/`QuickJS`

**最佳实践**：用 Node.js 配 `--js-runtimes node`；用 QuickJS 配 `--js-runtimes quickjs`；用 Bun 配 `--js-runtimes bun`；用 `--no-js-runtimes` 禁用；用 `--remote-components` 远程组件；用 `ejs:namespace` 自定义求解器。

### 模式 8：懒加载 Extractor 注入（Lazy Extractor）

**问题场景**：1800+ 站点全部 import 启动慢（10s+）——用到的才加载。

**解决方案**：`yt-dlp` 用 `lazy_extractors.py`（auto-generated）：所有 IE 类用 `__class_getitem__` 懒加载，运行时按 URL 匹配再 `import`。`extractor.gen` 工具生成。`LazyLoadMetaClass` 拦截 `__init_subclass__`。

**关键参数**：
- `LazyLoadMetaClass`
- `lazy_extractors` 模块
- `extractor.gen` 生成器
- 运行时 import
- 启动快

**最佳实践**：用 `lazy_extractors`（默认）；用 `--no-lazy-extractors` 禁用调试；运行 `python devscripts/make_lazy_extractors.py` 重新生成；用 `LazyLoadMetaClass` 拦截；按 URL 触发 import；监控启动时间。

### 模式 9：cookie 与身份验证

**问题场景**：会员视频/私人内容需要登录——手动复制 cookie 烦。

**解决方案**：`yt-dlp` 用 `cookies.txt` 解析 + `--cookies-from-browser`：直接读浏览器 cookie store（Chrome/Firefox/Safari/Edge/Brave/Opera/Vivaldi）。`--username`/`--password` 自动登录。`--video-password` 受密码保护视频。

**关键参数**：
- `--cookies <file>`
- `--cookies-from-browser chrome`
- `--username`/`--password`
- `--video-password`
- `cookiefile`

**最佳实践**：用 `--cookies-from-browser chrome` 读 Chrome cookie；用 `--cookies-from-browser firefox` 读 Firefox；用 `cookies.txt` 备份；用 `--username` 自动登录；用 `--netrc` 多账号；用 `--no-cookies` 禁用。

### 模式 10：SponsorBlock 与元数据裁剪

**问题场景**：YouTube 视频含广告/赞助/非音乐段——下载后要剪辑。

**解决方案**：`yt-dlp` 内置 SponsorBlock 集成：
- `--sponsorblock-mark all` 标记所有段
- `--sponsorblock-remove sponsor` 移除赞助
- `--sponsorblock-chapter-title` 章节标题
- `sponsorblock_api` 配服务端

**关键参数**：
- `--sponsorblock-mark`
- `--sponsorblock-remove`
- `sponsorblock-api`
- 段类型：`sponsor`/`intro`/`outro`/`selfpromo`
- 章节导出

**最佳实践**：用 `--sponsorblock-remove sponsor` 删赞助段；用 `--sponsorblock-mark all` 标所有；用 `--sponsorblock-chapter-title` 章节；用 `--sponsorblock-api https://...` 自托管；用 `embed-chapters` 嵌章节；用 `sponsorblock` API 服务。

## 第三段：进阶范式

### 模式 11：并发下载（concurrent fragments / async）

**问题场景**：HLS/DASH 分段下载（数百片段）——串行慢。

**解决方案**：`yt-dlp` 用 `concurrent_fragment_downloads`：
- `ThreadPoolExecutor` 并行
- `asyncio` 异步（`async_downloader`）
- `--concurrent-fragments N` 配
- `--downloader-args "asyncio:N=4"`

**关键参数**：
- `--concurrent-fragments 4`
- `asyncio` 异步
- `ThreadPoolExecutor`
- `aiohttp`/`httpx`
- 限速 `--limit-rate`

**最佳实践**：用 `--concurrent-fragments 4` 并行；用 `asyncio` 异步下载；用 `httpx` 替代 `requests`；用 `--limit-rate 5M` 限速；用 `--retries 5` 重试；监控并发数（避免封 IP）。

### 模式 12：CLI 参数与配置文件

**问题场景**：CLI 参数 100+——每次命令行写一遍烦。

**解决方案**：`yt-dlp` 用 `--config-location <path>` 读配置文件（INI 格式），节 `[yt-dlp]` 配。`--config` 用默认路径。`--ignore-config` 忽略。`XDG_CONFIG_HOME`/`.config/yt-dlp/config`。

**关键参数**：
- `--config-location`
- `--config`
- `--ignore-config`
- INI 格式
- 全局 vs 局部

**最佳实践**：用 `~/.config/yt-dlp/config` 配全局；用项目级 `.yt-dlp.conf`；用 `--config-location` 指定；用 `--ignore-config` 调试；用 `--no-config` 禁用；按用户/项目配。

### 模式 13：插件系统（Plugin）

**问题场景**：扩展下载/UI/规则——核心不装所有。

**解决方案**：`yt-dlp` 用 entry point `yt_dlp.plugins`：
- 自定义 IE（`from yt_dlp.extractor.common import InfoExtractor`）
- 自定义 PostProcessor
- 自定义 downloader
- 用 `pip install` 装

**关键参数**：
- `yt_dlp.plugins` entry point
- 自定义 IE
- 自定义 PP
- 自定义 downloader
- Python 包

**最佳实践**：用 `setuptools` `entry_points` 暴露；用 `importlib.metadata` 加载；用 `pyproject.toml` `[project.entry-points."yt_dlp.plugins"]`；用 `yt-dlp-gettext` i18n；用插件仓库参考；用 `ytdlp-plugins` 集合。

### 模式 14：网络栈与 TLS 指纹

**问题场景**：Cloudflare/YouTube 5s challenge 等用 TLS 指纹检测非浏览器——需要模拟。

**解决方案**：`yt-dlp` 用 `curl-cffi`（`impersonate` 参数）模拟浏览器 TLS 指纹：
- `--impersonate chrome`
- `--impersonate firefox`
- `--impersonate safari`
- 内部用 `curl_cffi.requests`

**关键参数**：
- `--impersonate`
- `chrome`/`firefox`/`safari`/`edge`
- TLS 指纹
- JA3/JA4
- `curl-cffi`

**最佳实践**：用 `--impersonate chrome` 抗 5s challenge；用 `--impersonate firefox` 备选；用 `--impersonate safari` iOS；用 `--impersonate edge` 备选；用 `--no-impersonate` 禁用；用 `tls13`/`alpn` 配；用 `pyfakeclient` 兜底。

### 模式 15：日志与调试

**问题场景**：下载失败不知道为什么——需要详细日志。

**解决方案**：`yt-dlp` 用 `logging` 标准库：
- `-v` 详细
- `-vv` 更详细
- `--print` 模板
- `--no-warnings` 静默
- `--log-to-file`

**关键参数**：
- `-v`/`-vv`/`-q`
- `--print`/`--print-to-file`
- `--no-warnings`
- `--log-to-file`
- `output_template`

**最佳实践**：用 `-v` 看下载；用 `--print '%(url)s'` 打印；用 `--print-to-file info.json` 存元数据；用 `--log-to-file log.txt`；用 `--no-warnings` 静默；用 `--console-title` 标题；用 `--progress` 进度条。

## 第四段：实战范式

### 模式 16：YouTube 单视频下载

**问题场景**：下载 YouTube 单视频最优格式。

**解决方案**：
```bash
yt-dlp -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]' --merge-output-format mp4 'https://www.youtube.com/watch?v=ID'
```

**关键参数**：
- `-f` format
- `--merge-output-format`
- `-o` 输出模板
- `--write-info-json` 元数据
- `--embed-subs`

**最佳实践**：用 `-f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best'` 兜底；用 `--merge-output-format mp4` 合并；用 `-o '%(title)s.%(ext)s'` 输出；用 `--write-info-json` 存元数据；用 `--embed-subs` 嵌字幕；用 `--embed-thumbnail` 封面；用 `--write-description` 描述。

### 模式 17：批量播放列表下载

**问题场景**：下载整个 YouTube/Bilibili 播放列表。

**解决方案**：
```bash
yt-dlp -o '%(playlist_index)s - %(title)s.%(ext)s' 'https://www.youtube.com/playlist?list=PLxxx'
```

**关键参数**：
- `--yes-playlist`
- `--no-playlist`
- `--playlist-items 1-10,20`
- `--playlist-start`/`--playlist-end`
- `playlist_index`

**最佳实践**：用 `--yes-playlist` 强制播放列表；用 `--playlist-items 1-10` 选集；用 `--playlist-reverse` 倒序；用 `--playlist-random` 随机；用 `--max-downloads 10` 限数；用 `-o '%(playlist_index)s - %(title)s.%(ext)s'` 命名。

### 模式 18：字幕与多语言

**问题场景**：下载视频带字幕（多语言）。

**解决方案**：
```bash
yt-dlp --write-subs --sub-langs en,zh-Hans --embed-subs 'URL'
```

**关键参数**：
- `--write-subs`
- `--write-auto-subs`
- `--sub-langs en,zh-Hans`
- `--embed-subs`
- `--sub-format`

**最佳实践**：用 `--write-subs` 写字幕；用 `--write-auto-subs` 自动生成；用 `--sub-langs en,zh-Hans` 多语言；用 `--embed-subs` 嵌字幕；用 `--sub-format vtt/ass/srt`；用 `--convert-subs srt` 转换；用 `all` 取全部。

### 模式 19：网络代理与反爬

**问题场景**：某些站点限 IP/限地区——需要代理。

**解决方案**：
- `--proxy http://proxy:port`
- `--proxy socks5://...`
- `--source-address 1.2.3.4` 指定出口
- `--geo-bypass` 绕过
- `--xff VIDEO` 伪造 IP

**关键参数**：
- `--proxy`
- `--proxy socks5`
- `--source-address`
- `--geo-bypass`
- `--xff`

**最佳实践**：用 `--proxy 'socks5://127.0.0.1:1080'` 走代理；用 `--source-address` 配出口；用 `--geo-bypass` 绕过；用 `--xff 'CN'` 伪造 IP；用 `--no-check-certificates` 跳过 TLS；用 `--prefer-insecure` HTTP；用 `rotate-proxy` 配。

### 模式 20：生态与 fork 对比

**问题场景**：`youtube-dl` vs `yt-dlp` vs `you-get` 怎么选。

**解决方案**：
- **youtube-dl**：老牌（2006+），社区大，维护慢（1500+ sites）
- **yt-dlp**：youtube-dl fork（2021+），更新快（1800+ sites），SponsorBlock、format 排序
- **you-get**：Python，UI 友好
- **lux**：Go，性能
- **annie**：Go，性能
- **cobalt**：API 风格

**关键参数**：
- 站点覆盖
- 更新频率
- SponsorBlock
- format 排序
- 性能

**最佳实践**：用 `yt-dlp`（推荐）；用 `youtube-dl` 兼容老脚本；用 `you-get` 简单 UI；用 `cobalt` API 风格；用 `lux`/`annie` 性能；用 `gallery-dl` 替代图片站；按场景选。

## 附：仓库元信息

| 字段 | 值 |
|------|----|
| 路径 | `G:\实战案例\GitHub顶尖项目\yt-dlp\` |
| 主语言 | Python |
| License | Unlicense |
| 解析时间 | 2026-06-02 |
| 核心模块 | `yt_dlp/YoutubeDL.py`、`yt_dlp/extractor/`、`yt_dlp/postprocessor/`、`yt_dlp/networking/` |
| 关键基础设施 | InfoExtractor、ffmpeg、curl-cffi、RequestDirector、SponsorBlock |
