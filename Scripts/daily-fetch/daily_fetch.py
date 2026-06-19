#!/usr/bin/env python3
"""
每日自动抓取脚本 - HackerNews + GitHub Trending + arXiv
写入 Obsidian vault 的 Inbox/ 目录
"""
import os
import sys
import time
import json
import re
import requests
import trafilatura
from datetime import datetime
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

VAULT = r"G:\Obsidian Vault"
INBOX = os.path.join(VAULT, "Inbox")
# 由 CLI 参数控制；缺省 = 今天
_TARGET_DATE = None
DIGEST_SIZE = 20
# 是否抓取原文（保留代码块/表格/链接）
FETCH_FULL_CONTENT = True
# 每个源最多抓全文的条数
CONTENT_TOP_N = 3
# 单条全文最大字符数（避免单文件过大）
CONTENT_MAX_CHARS = 4000
# 全文缓存（同一进程内 URL -> markdown）
_CONTENT_CACHE = {}
# 全局 scraper（带 Cloudflare 绕过）
try:
    import cloudscraper
    _SCRAPER = cloudscraper.create_scraper(browser={"browser": "chrome", "platform": "windows", "desktop": True})
except Exception:
    _SCRAPER = None

def _have_scraper():
    return _SCRAPER is not None


def get_today():
    return _TARGET_DATE or datetime.now().strftime("%Y-%m-%d")

def get_timestamp():
    return datetime.now().strftime("%Y-%m-%d %H:%M")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"



def set_target_date(d):
    """设置目标日期 (用于补抓历史日期)"""
    global _TARGET_DATE
    _TARGET_DATE = d


def _set_today():
    """根据 _TARGET_DATE 刷新 TODAY/TIMESTAMP 全局"""
    global TODAY, TIMESTAMP
    TODAY = get_today()
    TIMESTAMP = get_timestamp()


def fetch_full_content(url, timeout=10):
    """用 trafilatura 抓正文 markdown（保留代码块/表格/链接）。失败返回 None。
    优先用 cloudscraper 绕过 Cloudflare 验证，失败回退到 requests。"""
    if not url or not FETCH_FULL_CONTENT:
        return None
    if url in _CONTENT_CACHE:
        return _CONTENT_CACHE[url]

    # 1) cloudscraper 优先（能处理 Cloudflare challenge）
    try:
        r = _SCRAPER.get(url, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and len(r.text) > 200:
            md = trafilatura.extract(
                r.text,
                output_format="markdown",
                include_links=True,
                include_images=False,
                include_tables=True,
                include_formatting=True,
                favor_precision=True,
            )
            if md and len(md.strip()) >= 80:
                if len(md) > CONTENT_MAX_CHARS:
                    md = md[:CONTENT_MAX_CHARS] + f"\n\n...（截断，原文 {len(md)}+ 字符）"
                _CONTENT_CACHE[url] = md.strip()
                return _CONTENT_CACHE[url]
    except Exception:
        pass

    # 2) 回退到普通 requests
    try:
        r = requests.get(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"},
                         timeout=timeout, allow_redirects=True)
        if r.status_code != 200 or len(r.text) < 200:
            _CONTENT_CACHE[url] = None
            return None
        md = trafilatura.extract(
            r.text,
            output_format="markdown",
            include_links=True,
            include_images=False,
            include_tables=True,
            include_formatting=True,
            favor_precision=True,
        )
        if not md or len(md.strip()) < 80:
            _CONTENT_CACHE[url] = None
            return None
        if len(md) > CONTENT_MAX_CHARS:
            md = md[:CONTENT_MAX_CHARS] + f"\n\n...（截断，原文 {len(md)}+ 字符）"
        result = md.strip()
        _CONTENT_CACHE[url] = result
        return result
    except Exception:
        _CONTENT_CACHE[url] = None
        return None


def fetch_hn(limit=30):
    """HackerNews top stories"""
    try:
        r = requests.get(
            "https://hacker-news.firebaseio.com/v0/topstories.json",
            timeout=10,
        )
        ids = r.json()[:limit]
    except Exception as e:
        print(f"[HN] ids 失败: {e}")
        return []

    items = []
    for sid in ids:
        try:
            r = requests.get(
                f"https://hacker-news.firebaseio.com/v0/item/{sid}.json",
                timeout=8,
            )
            d = r.json()
            if d and d.get("title"):
                items.append({
                    "title": d.get("title", ""),
                    "url": d.get("url", f"https://news.ycombinator.com/item?id={sid}"),
                    "score": d.get("score", 0),
                    "by": d.get("by", ""),
                    "comments": d.get("descendants", 0),
                    "hn_id": sid,
                })
        except Exception as e:
            continue
    return items


def fetch_github_trending(limit=15):
    """GitHub Trending (高 star + 新近活跃) - via Search API"""
    from datetime import datetime, timedelta
    days_back = 30
    date_threshold = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    try:
        r = requests.get(
            "https://api.github.com/search/repositories",
            params={
                "q": f"created:>{date_threshold} stars:>200",
                "sort": "stars",
                "order": "desc",
                "per_page": limit,
            },
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": UA,
            },
            timeout=15,
        )
        if r.status_code != 200:
            print(f"[GH] API 失败: {r.status_code} {r.text[:200]}")
            return []
        data = r.json()
    except Exception as e:
        print(f"[GH] fetch 失败: {e}")
        return []

    items = []
    for it in data.get("items", [])[:limit]:
        items.append({
            "repo": it["full_name"],
            "name": it["full_name"],
            "desc": it.get("description") or "",
            "lang": it.get("language") or "",
            "stars": it.get("stargazers_count", 0),
            "forks": it.get("forks_count", 0),
            "url": it["html_url"],
            "topics": it.get("topics", []),
            "updated": it.get("updated_at", "")[:10],
        })
    return items


def fetch_hn_best(limit=15):
    """HackerNews Best Stories (高赞, 质量筛选)"""
    try:
        r = requests.get(
            "https://hacker-news.firebaseio.com/v0/beststories.json",
            timeout=10,
        )
        ids = r.json()[:limit]
    except Exception as e:
        print(f"[HN-Best] ids 失败: {e}")
        return []

    items = []
    for sid in ids:
        try:
            r = requests.get(
                f"https://hacker-news.firebaseio.com/v0/item/{sid}.json",
                timeout=8,
            )
            d = r.json()
            if d and d.get("title"):
                items.append({
                    "title": d.get("title", ""),
                    "url": d.get("url", f"https://news.ycombinator.com/item?id={sid}"),
                    "score": d.get("score", 0),
                    "by": d.get("by", ""),
                    "comments": d.get("descendants", 0),
                    "hn_id": sid,
                })
        except Exception as e:
            continue
    return items


def fetch_juejin(limit=15):
    """掘金热榜 (中文开发者社区)"""
    try:
        # 掘金公开 API - 综合热榜
        r = requests.get(
            "https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot",
            headers={"User-Agent": UA, "Referer": "https://juejin.cn/"},
            timeout=12,
        )
        if r.status_code != 200:
            print(f"[掘金] 状态 {r.status_code}")
            return []
        data = r.json()
    except Exception as e:
        print(f"[掘金] 失败: {e}")
        return []

    items = []
    for entry in (data.get("data") or [])[:limit]:
        content = entry.get("content") or {}
        cto = entry.get("content_counter") or {}
        author = entry.get("author") or {}
        items.append({
            "title": content.get("title", ""),
            "url": f"https://juejin.cn/post/{content.get('content_id', '')}",
            "author": author.get("name", ""),
            "hot": cto.get("hot_rank", 0),
            "views": cto.get("view", 0),
            "likes": cto.get("like", 0),
            "comments": cto.get("comment_count", 0),
        })
    return items


def fetch_devto(limit=15):
    """dev.to top articles (past day)"""
    try:
        r = requests.get(
            "https://dev.to/api/articles",
            params={"top": 1, "per_page": limit},
            headers={"User-Agent": UA},
            timeout=12,
        )
        if r.status_code != 200:
            print(f"[dev.to] 状态 {r.status_code}")
            return []
        data = r.json()
    except Exception as e:
        print(f"[dev.to] 失败: {e}")
        return []

    items = []
    for a in data[:limit]:
        items.append({
            "title": a.get("title", ""),
            "url": a.get("url", ""),
            "author": (a.get("user") or {}).get("name", ""),
            "tags": a.get("tag_list", []),
            "reactions": a.get("public_reactions_count", 0),
            "comments": a.get("comments_count", 0),
            "reading_time": a.get("reading_time_minutes", 0),
            "desc": a.get("description", "")[:200],
        })
    return items


def fetch_lobsters(limit=15):
    """Lobsters via RSS (策划型技术社区)"""
    try:
        r = requests.get(
            "https://lobste.rs/rss",
            headers={"User-Agent": UA},
            timeout=12,
        )
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.text)
    except Exception as e:
        print(f"[Lobsters] 失败: {e}")
        return []

    items = []
    for item in root.findall(".//item")[:limit]:
        title = item.find("title")
        link = item.find("link")
        desc = item.find("description")
        author = item.find(".//{http://purl.org/dc/elements/1.1/}creator")
        comments = item.find("{http://purl.org/rss/1.0/modules/slash/}comments")
        items.append({
            "title": title.text.strip() if title is not None else "",
            "url": link.text.strip() if link is not None else "",
            "author": author.text.strip() if author is not None else "",
            "desc": (desc.text or "")[:200].strip() if desc is not None else "",
            "comments": int(comments.text or 0) if comments is not None else 0,
        })
    return items


def fetch_arxiv(category="cs.AI", limit=20):
    """arXiv recent papers"""
    try:
        r = requests.get(
            "http://export.arxiv.org/api/query",
            params={
                "search_query": f"cat:{category}",
                "start": 0,
                "max_results": limit,
                "sortBy": "submittedDate",
                "sortOrder": "descending",
            },
            timeout=15,
        )
        xml_text = r.text
    except Exception as e:
        print(f"[arXiv] fetch 失败: {e}")
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    try:
        root = ET.fromstring(xml_text)
    except Exception as e:
        print(f"[arXiv] parse 失败: {e}")
        return []

    items = []
    for entry in root.findall("atom:entry", ns):
        title = entry.find("atom:title", ns)
        summary = entry.find("atom:summary", ns)
        link = entry.find("atom:id", ns)
        author = entry.find("atom:author/atom:name", ns)
        published = entry.find("atom:published", ns)
        items.append({
            "title": (title.text or "").strip().replace("\n", " ") if title is not None else "",
            "summary": (summary.text or "").strip()[:500] if summary is not None else "",
            "url": link.text.strip() if link is not None else "",
            "author": author.text.strip() if author is not None else "",
            "published": (published.text or "")[:10] if published is not None else "",
        })
    return items


def write_hn_best(items):
    if not items:
        return
    fp = os.path.join(INBOX, f"HN-Best-{TODAY}.md")
    lines = [
        "---", f"date: {TODAY}", f"timestamp: {TIMESTAMP}",
        "tags: [HackerNews, Best, 每日抓取, 抓取]",
        "source: hacker-news.firebaseio.com/beststories",
        f"count: {len(items)}", "---", "",
        f"# HackerNews Best (高赞) Top {len(items)} ({TODAY})", "",
        "## 思维导图", "", "```mermaid", "mindmap", "  root((HN Best))",
    ]
    for it in items[:15]:
        lines.append(f"    {it['title'][:25]}")
    lines += ["```", "", f"## 列表（{len(items)} 条）", ""]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {it['title']}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        lines.append(f"- **分数**: {it['score']} | **评论**: {it['comments']} | **作者**: {it['by']}")
        lines.append(f"- **HN**: https://news.ycombinator.com/item?id={it['hn_id']}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] HN-Best: {len(items)} items -> {fp}")


def write_juejin(items):
    if not items:
        return
    fp = os.path.join(INBOX, f"掘金热榜-{TODAY}.md")
    lines = [
        "---", f"date: {TODAY}", f"timestamp: {TIMESTAMP}",
        "tags: [掘金, 中文, 每日抓取, 抓取]",
        "source: juejin.cn", f"count: {len(items)}", "---", "",
        f"# 掘金热榜 Top {len(items)} ({TODAY})", "",
        "## 思维导图", "", "```mermaid", "mindmap", "  root((掘金热榜))",
    ]
    for it in items[:15]:
        lines.append(f"    {it['title'][:25]}")
    lines += ["```", "", f"## 列表（{len(items)} 条）", ""]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {it['title']}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        lines.append(f"- **作者**: {it['author']}")
        lines.append(f"- **热度**: {it['hot']} | **浏览**: {it['views']} | **点赞**: {it['likes']} | **评论**: {it['comments']}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] 掘金: {len(items)} items -> {fp}")


def write_devto(items):
    if not items:
        return
    fp = os.path.join(INBOX, f"dev.to-{TODAY}.md")
    lines = [
        "---", f"date: {TODAY}", f"timestamp: {TIMESTAMP}",
        "tags: [devto, 文章, 每日抓取, 抓取]",
        "source: dev.to", f"count: {len(items)}", "---", "",
        f"# dev.to Top {len(items)} ({TODAY})", "",
        "## 思维导图", "", "```mermaid", "mindmap", "  root((dev.to))",
    ]
    for it in items[:15]:
        lines.append(f"    {it['title'][:25]}")
    lines += ["```", "", f"## 列表（{len(items)} 条）", ""]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {it['title']}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        lines.append(f"- **作者**: {it['author']} | **阅读**: {it['reading_time']}min")
        lines.append(f"- **反应**: {it['reactions']} | **评论**: {it['comments']}")
        if it.get("tags"):
            tags = ", ".join(f"`{t}`" for t in it["tags"][:5])
            lines.append(f"- **标签**: {tags}")
        if it.get("desc"):
            lines.append(f"- **简介**: {it['desc']}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] dev.to: {len(items)} items -> {fp}")


def write_lobsters(items):
    if not items:
        return
    fp = os.path.join(INBOX, f"Lobsters-{TODAY}.md")
    lines = [
        "---", f"date: {TODAY}", f"timestamp: {TIMESTAMP}",
        "tags: [Lobsters, 策划, 每日抓取, 抓取]",
        "source: lobste.rs", f"count: {len(items)}", "---", "",
        f"# Lobsters Top {len(items)} ({TODAY})", "",
        "## 思维导图", "", "```mermaid", "mindmap", "  root((Lobsters))",
    ]
    for it in items[:15]:
        lines.append(f"    {it['title'][:25]}")
    lines += ["```", "", f"## 列表（{len(items)} 条）", ""]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {it['title']}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        lines.append(f"- **作者**: {it['author']} | **评论**: {it['comments']}")
        if it.get("desc"):
            lines.append(f"- **摘要**: {it['desc'][:200]}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] Lobsters: {len(items)} items -> {fp}")


def write_digest(all_sources):
    """每日 N 条精选 Digest (从各源按热度综合)"""
    pool = []
    for src, items in all_sources.items():
        for it in items:
            it2 = dict(it)
            it2["_src"] = src
            pool.append(it2)

    # 源内归一化: 每个源先把分数归一到 [0, 1]
    def raw(it):
        s = 0
        if it["_src"] in ("HN", "HN-Best"):
            s = it.get("score", 0) * 0.7 + it.get("comments", 0) * 0.3
        elif it["_src"] == "GitHub":
            s = it.get("stars", 0) * 0.8 + it.get("forks", 0) * 0.2
        elif it["_src"] == "掘金":
            s = it.get("hot", 0) * 0.6 + it.get("likes", 0) * 0.3 + it.get("comments", 0) * 0.1
        elif it["_src"] == "dev.to":
            s = it.get("reactions", 0) * 0.7 + it.get("comments", 0) * 0.3
        elif it["_src"] == "Lobsters":
            s = it.get("comments", 0) * 1.0
        elif it["_src"] == "arXiv":
            s = 50 + (10 if it.get("published") == TODAY else 0)
        elif it["_src"] in TECH_FEEDS:
# 技术深源：按发布时间新度给分（0天=130, 1周=123, 30天=100）
            from email.utils import parsedate_to_datetime
            pub = it.get("pub", "")
            try:
                dt = parsedate_to_datetime(pub).replace(tzinfo=None) if pub else None
                days = max(0, (datetime.now() - dt).days) if dt else 30
            except Exception:
                days = 30
            s = 100 + max(0, 30 - days)

        return s

    # 深源（arXiv + 8 个技术 RSS）每源顶部归一后获得加成，确保在 top 20 中有席位
    DEEP_SOURCES = {"arXiv"} | set(TECH_FEEDS.keys())
    # 同一源内做 min-max 归一化
    src_min_max = {}
    for src, items in all_sources.items():
        vals = [raw({**it, "_src": src}) for it in items]
        if not vals:
            continue
        lo, hi = min(vals), max(vals)
        src_min_max[src] = (lo, hi)

    def norm_score(it):
        lo, hi = src_min_max.get(it["_src"], (0, 1))
        if hi == lo:
            base = 0.5
        else:
            base = (raw(it) - lo) / (hi - lo)
        # 深源 +0.1，避免被 HN/GH 高分源挤出精选
        return base + (0.1 if it["_src"] in DEEP_SOURCES else 0)

    pool.sort(key=norm_score, reverse=True)
    topN = pool[:DIGEST_SIZE]

    fp = os.path.join(INBOX, f"每日精选-{TODAY}.md")
    lines = [
        "---", f"date: {TODAY}", f"timestamp: {TIMESTAMP}",
        "tags: [每日精选, Digest, 每日抓取]",
        f"count: {len(topN)}", "---", "",
        f"# 每日精选 {DIGEST_SIZE} 条 ({TODAY})", "",
"> 自动从 14 个数据源综合评分选出。每条都有原文链接 + 所属源。", "",
        "## 思维导图", "", "```mermaid", "mindmap", f"  root((今日 {DIGEST_SIZE} 选 {TODAY}))",
    ]
    for it in topN:
        title = (it.get("title") or it.get("name") or "untitled")[:30]
        lines.append(f"    {title}")
    lines += [
        "```", "", f"## 精选（{DIGEST_SIZE} 条）", "",
    ]
    for i, it in enumerate(topN, 1):
        title = it.get("title") or it.get("name") or "untitled"
        lines.append(f"### {i}. {title}")
        lines.append(f"- **源**: {it['_src']} | **归一化分**: {norm_score(it):.2f}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        if it["_src"] in ("HN", "HN-Best"):
            lines.append(f"- **HN**: {it['score']} 分 / {it['comments']} 评论")
        elif it["_src"] == "GitHub":
            lines.append(f"- **Star**: {it.get('stars', 0)} / {it.get('lang', '')}")
        elif it["_src"] == "掘金":
            lines.append(f"- **热度**: {it.get('hot', 0)} / {it.get('author', '')}")
        elif it["_src"] == "dev.to":
            lines.append(f"- **反应**: {it.get('reactions', 0)} / {it.get('author', '')}")
        elif it["_src"] == "Lobsters":
            lines.append(f"- **作者**: {it.get('author', '')}")
        elif it["_src"] == "arXiv":
            lines.append(f"- **作者**: {it.get('author', '')} | **日期**: {it.get('published', '')}")
        if it.get("desc"):
            lines.append(f"- **简介**: {it['desc'][:150]}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] 每日精选: {DIGEST_SIZE} -> {fp}")


def write_hn(items):
    if not items:
        return
    fp = os.path.join(INBOX, f"HN-{TODAY}.md")
    lines = [
        "---",
        f"date: {TODAY}",
        f"timestamp: {TIMESTAMP}",
        "tags: [HackerNews, 每日抓取, 抓取]",
        "source: hacker-news.firebaseio.com",
        f"count: {len(items)}",
        "---",
        "",
        f"# HackerNews 每日 Top {len(items)} ({TODAY})",
        "",
        "## 思维导图",
        "",
        "```mermaid",
        "mindmap",
        "  root((HN Top))",
    ]
    for it in items[:15]:
        lines.append(f"    {it['title'][:25]}")
    lines += [
        "```",
        "",
        f"## 列表（{len(items)} 条）",
        "",
    ]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {it['title']}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        lines.append(f"- **分数**: {it['score']} | **评论**: {it['comments']} | **作者**: {it['by']}")
        lines.append(f"- **HN 讨论**: https://news.ycombinator.com/item?id={it['hn_id']}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] HN: {len(items)} items -> {fp}")


def write_github(items):
    if not items:
        return
    fp = os.path.join(INBOX, f"GitHub-Trending-{TODAY}.md")
    lines = [
        "---",
        f"date: {TODAY}",
        f"timestamp: {TIMESTAMP}",
        "tags: [GitHub, Trending, 每日抓取, 抓取]",
        "source: github.com/trending",
        f"count: {len(items)}",
        "---",
        "",
        f"# GitHub Trending 每日 Top {len(items)} ({TODAY})",
        "",
        "## 思维导图",
        "",
        "```mermaid",
        "mindmap",
        "  root((GitHub Trending))",
    ]
    for it in items[:15]:
        lines.append(f"    {it['name'][:20]}")
    lines += [
        "```",
        "",
        f"## 列表（{len(items)} 条）",
        "",
    ]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {it['name']}")
        lines.append(f"- **仓库**: [{it['repo']}]({it['url']})")
        if it.get("desc"):
            lines.append(f"- **描述**: {it['desc']}")
        if it.get("lang"):
            lines.append(f"- **语言**: {it['lang']}")
        lines.append(f"- **Star**: {it.get('stars', 0)} | **Fork**: {it.get('forks', 0)}")
        lines.append(f"- **更新**: {it.get('updated', '')}")
        if it.get("topics"):
            topics = ", ".join(f"`{t}`" for t in it["topics"][:6])
            lines.append(f"- **Topic**: {topics}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] GitHub: {len(items)} items -> {fp}")


def write_arxiv(items):
    if not items:
        return
    fp = os.path.join(INBOX, f"arXiv-{TODAY}.md")
    lines = [
        "---",
        f"date: {TODAY}",
        f"timestamp: {TIMESTAMP}",
        "tags: [arXiv, 论文, 每日抓取, 抓取, AI]",
        "source: arxiv.org",
        f"count: {len(items)}",
        "---",
        "",
        f"# arXiv 每日最新论文 ({TODAY})",
        "",
        "## 思维导图",
        "",
        "```mermaid",
        "mindmap",
        "  root((arXiv))",
    ]
    for it in items[:15]:
        lines.append(f"    {it['title'][:25]}")
    lines += [
        "```",
        "",
        f"## 列表（{len(items)} 条）",
        "",
    ]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {it['title']}")
        lines.append(f"- **作者**: {it['author']}")
        lines.append(f"- **日期**: {it['published']}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        if it.get("summary"):
            lines.append(f"- **摘要**: {it['summary'][:300]}...")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] arXiv: {len(items)} items -> {fp}")


# ===================== 设计/UX 源 =====================
DESIGN_FEEDS = {
    "SmashingMag": {
        "url": "https://www.smashingmagazine.com/feed/",
        "label": "Smashing Magazine", "emoji": "🔥",
    },
    "Awwwards": {
        "url": "https://www.awwwards.com/feed/",
        "label": "Awwwards", "emoji": "🏆",
    },
    "UXCollective": {
        "url": "https://uxdesign.cc/feed",
        "label": "UX Collective", "emoji": "✏️",
    },
    "NNg": {
        "url": "https://www.nngroup.com/feed/rss/",
        "label": "Nielsen Norman Group", "emoji": "🔬",
    },
    "StripeDesign": {
        "url": "https://stripe.com/blog/feed.rss",
        "label": "Stripe Blog", "emoji": "💳",
    },
    "Material": {
        "url": "https://material.io/feed.xml",
        "label": "Material Design", "emoji": "🎨",
    },
}

# ===================== 技术深源（高技术含量） =====================
TECH_FEEDS = {
    "Cloudflare":   {"url": "https://blog.cloudflare.com/rss/",        "label": "Cloudflare Blog",         "emoji": "☁️"},
    "InfoQ-CN":     {"url": "https://www.infoq.cn/feed.xml",           "label": "InfoQ 中文站",            "emoji": "📰"},
    "Charity":      {"url": "https://charity.wtf/feed/",            "label": "Charity Majors (observability)", "emoji": "🛰️"},
    "Phoronix":     {"url": "https://www.phoronix.com/rss.php",        "label": "Phoronix",                "emoji": "⚙️"},
    "OpenAI":       {"url": "https://openai.com/blog/rss.xml",         "label": "OpenAI News",             "emoji": "🤖"},
    "DanLuu":       {"url": "https://danluu.com/atom.xml",             "label": "Dan Luu",                 "emoji": "🔍"},
    "LilianWeng":   {"url": "https://lilianweng.github.io/index.xml",  "label": "Lil'Log",                 "emoji": "🧪"},
    "LWN":          {"url": "https://lwn.net/headlines/rss",           "label": "LWN.net (Linux kernel)",  "emoji": "🐧"},

}


NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "dc": "http://purl.org/dc/elements/1.1/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}


def fetch_rss(name, cfg, limit=8, with_content=False, content_top_n=CONTENT_TOP_N):
    """通用 RSS 抓取（兼容 RSS 2.0 + Atom），按发布日期倒序取最新 limit 条
    with_content=True 时对前 content_top_n 条额外抓正文 markdown（保留代码块）"""
    try:
        r = requests.get(cfg["url"], headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8"}, timeout=20)
        if r.status_code != 200:
            print(f"[{name}] 状态 {r.status_code}")
            return []

        root = ET.fromstring(r.text)
    except Exception as e:
        print(f"[{name}] 失败: {e}")
        return []

    raw_items = []
    # RSS 2.0
    for item in root.findall(".//item"):
        t = item.find("title")
        if t is None or not (t.text or "").strip():
            continue
        link = item.find("link")
        pub = item.find("pubDate")
        desc = item.find("description")
        author = item.find(f".//{{{NS['dc']}}}creator")
        raw_items.append({
            "title": t.text.strip(),
            "url": (link.text or "").strip() if link is not None else "",
            "pub": (pub.text or "").strip() if pub is not None else "",
            "author": (author.text or "").strip() if author is not None else "",
            "desc": re.sub(r"<[^>]+>", "", (desc.text or ""))[:250].strip()
                    if desc is not None else "",
        })
    # Atom 兜底
    for entry in root.findall(".//atom:entry", NS):
        t = entry.find("atom:title", NS)
        if t is None or not (t.text or "").strip():
            continue
        link = entry.find("atom:link", NS)
        pub = entry.find("atom:published", NS) or entry.find("atom:updated", NS)
        author = entry.find("atom:author/atom:name", NS)
        summary = entry.find("atom:summary", NS) or entry.find("atom:content", NS)
        raw_items.append({
            "title": t.text.strip(),
            "url": (link.get("href", "") if link is not None else "").strip(),
            "pub": (pub.text or "").strip() if pub is not None else "",
            "author": (author.text or "").strip() if author is not None else "",
            "desc": re.sub(r"<[^>]+>", "", (summary.text or ""))[:250].strip()
                    if summary is not None else "",
        })

    # 按 pub 倒序（无 pub 的排后面）
    def pub_key(x):
        return x.get("pub") or ""
    raw_items.sort(key=pub_key, reverse=True)
    items = raw_items[:limit]

    # 抓正文 markdown（保留代码块/表格/链接）
    if with_content and FETCH_FULL_CONTENT:
        for i, it in enumerate(items):
            if i >= content_top_n:
                break
            if not it.get("url"):
                continue
            content = fetch_full_content(it["url"])
            if content:
                it["content"] = content
                print(f"  [{name}] +全文 {len(content)}字: {it['title'][:40]}")
            time.sleep(0.4)

    return items


def fetch_smashing(limit=8):  return fetch_rss("SmashingMag",  DESIGN_FEEDS["SmashingMag"],  limit, with_content=True, content_top_n=2)
def fetch_awwwards(limit=8):  return fetch_rss("Awwwards",     DESIGN_FEEDS["Awwwards"],     limit)
def fetch_ux(limit=8):        return fetch_rss("UXCollective", DESIGN_FEEDS["UXCollective"], limit, with_content=True, content_top_n=2)
def fetch_nng(limit=5):       return fetch_rss("NNg",          DESIGN_FEEDS["NNg"],          limit)
def fetch_stripe(limit=5):    return fetch_rss("StripeDesign", DESIGN_FEEDS["StripeDesign"], limit, with_content=True, content_top_n=2)
def fetch_material(limit=5):  return fetch_rss("Material",     DESIGN_FEEDS["Material"],     limit)

def fetch_cloudflare(limit=8):  return fetch_rss("Cloudflare",   TECH_FEEDS["Cloudflare"],   limit, with_content=True, content_top_n=3)
def fetch_infoq_cn(limit=8):    return fetch_rss("InfoQ-CN",     TECH_FEEDS["InfoQ-CN"],     limit, with_content=True, content_top_n=3)
def fetch_charity(limit=6):      return fetch_rss("Charity",      TECH_FEEDS["Charity"],      limit, with_content=True, content_top_n=2)
def fetch_phoronix(limit=6):    return fetch_rss("Phoronix",     TECH_FEEDS["Phoronix"],     limit, with_content=True, content_top_n=3)
def fetch_openai(limit=6):      return fetch_rss("OpenAI",       TECH_FEEDS["OpenAI"],       limit, with_content=True, content_top_n=2)
def fetch_danluu(limit=5):      return fetch_rss("DanLuu",       TECH_FEEDS["DanLuu"],       limit, with_content=True, content_top_n=2)
def fetch_lilian(limit=5):      return fetch_rss("LilianWeng",   TECH_FEEDS["LilianWeng"],   limit, with_content=True, content_top_n=2)
def fetch_lwn(limit=8):         return fetch_rss("LWN",          TECH_FEEDS["LWN"],          limit, with_content=True, content_top_n=3)



def _strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def write_rss_source(key, items, feeds_dict, default_tag="设计"):
    """通用 RSS 源写入 Inbox。feeds_dict 是 DESIGN_FEEDS 或 TECH_FEEDS。
    items 中如有 'content' 字段，会以 <details> 折叠块附加全文（保留代码）。"""
    if not items:
        return
    cfg = feeds_dict[key]
    fp = os.path.join(INBOX, f"{key}-{TODAY}.md")
    full_count = sum(1 for it in items if it.get("content"))
    lines = [
        "---", f"date: {TODAY}", f"timestamp: {TIMESTAMP}",
        f"tags: [{default_tag}, {cfg['label']}, 每日抓取, 抓取]",
        f"source: {cfg['url']}",
        f"count: {len(items)}",
        f"full_content: {full_count}",
        "---", "",
        f"# {cfg['emoji']} {cfg['label']} Top {len(items)} ({TODAY})", "",
        "## 思维导图", "", "```mermaid", "mindmap",
        f"  root(({cfg['label']}))",
    ]
    for it in items[:14]:
        lines.append(f"    {_strip_html(it['title'])[:25]}")
    lines += ["```", "", f"## 列表（{len(items)} 条，{full_count} 条含全文）", ""]
    for i, it in enumerate(items, 1):
        lines.append(f"### {i}. {_strip_html(it['title'])}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        if it.get("author"):
            lines.append(f"- **作者**: {it['author']}")
        if it.get("pub"):
            lines.append(f"- **发布**: {it['pub']}")
        if it.get("desc"):
            lines.append(f"- **简介**: {it['desc'][:220]}")
        if it.get("content"):
            lines.append("")
            lines.append(f"<details><summary>📄 全文（{len(it['content'])} 字符，点击展开）</summary>")
            lines.append("")
            lines.append(it["content"])
            lines.append("")
            lines.append("</details>")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] {cfg['label']}: {len(items)} 条 ({full_count} 含全文) -> {fp}")

def write_design(key, items):  return write_rss_source(key, items, DESIGN_FEEDS, default_tag="设计")
def write_tech(key, items):    return write_rss_source(key, items, TECH_FEEDS,    default_tag="技术")



def write_design_digest(all_design):
    """设计灵感精选：6 源按发布时间聚合"""
    if not all_design:
        return
    fp = os.path.join(INBOX, f"设计灵感-{TODAY}.md")
    pool = []
    for src, items in all_design.items():
        for it in items:
            pool.append({**it, "_src": src, "_label": DESIGN_FEEDS[src]["label"]})
    # 按发布时间倒序，取最近 25 条
    pool.sort(key=lambda x: x.get("pub", ""), reverse=True)
    pool = pool[:25]

    # 源分布统计
    dist = {k: len(v) for k, v in all_design.items()}

    lines = [
        "---", f"date: {TODAY}", f"timestamp: {TIMESTAMP}",
        "tags: [设计灵感, Digest, 每日抓取, 设计]",
        f"count: {len(pool)}", "---", "",
        f"# 🎨 设计灵感精选 {len(pool)} 条 ({TODAY})", "",
        "> 6 源聚合：Smashing Magazine · Awwwards · UX Collective · NN/g · Stripe Blog · Material Design",
        "",
        f"**源分布**: " + " · ".join(
            f"{DESIGN_FEEDS[k]['label']}={dist[k]}" for k in DESIGN_FEEDS if k in all_design
        ),
        "",
        "## 思维导图", "", "```mermaid", "mindmap",
        f"  root((设计灵感 {TODAY}))",
    ]
    for it in pool[:20]:
        lines.append(f"    {it['_label']}::{_strip_html(it['title'])[:22]}")
    lines += ["```", "", "## 精选", ""]
    for i, it in enumerate(pool, 1):
        lines.append(f"### {i}. [{it['_label']}] {_strip_html(it['title'])}")
        lines.append(f"- **链接**: [{it['url']}]({it['url']})")
        if it.get("author"):
            lines.append(f"- **作者**: {it['author']}")
        if it.get("pub"):
            lines.append(f"- **发布**: {it['pub']}")
        if it.get("desc"):
            lines.append(f"- **简介**: {it['desc'][:220]}")
        lines.append("")
    with open(fp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"  [OK] 设计灵感精选: {len(pool)} -> {fp}")


def main():
    global DIGEST_SIZE
    # CLI 解析
    import argparse
    parser = argparse.ArgumentParser(description="每日开发知识抓取")
    parser.add_argument("--date", help="目标日期 YYYY-MM-DD (缺省=今天)，用于补抓历史")
    parser.add_argument("--digest-size", type=int, default=20, help="精选条数 (缺省=20)")
    parser.add_argument("--no-digest", action="store_true", help="不生成精选 digest")
    args = parser.parse_args()

    if args.date:
        set_target_date(args.date)
    DIGEST_SIZE = args.digest_size

    # 初始化全局日期
    _set_today()

    os.makedirs(INBOX, exist_ok=True)
    print(f"=== {TIMESTAMP} 每日抓取开始 (date={TODAY}, digest={DIGEST_SIZE}) ===")
    print(f"Inbox: {INBOX}")

    all_sources = {}

    print("\n[1/7] HackerNews Top...")
    hn = fetch_hn(30)
    write_hn(hn)
    all_sources["HN"] = hn
    time.sleep(1)

    print("\n[2/7] HackerNews Best...")
    hn_b = fetch_hn_best(15)
    write_hn_best(hn_b)
    all_sources["HN-Best"] = hn_b
    time.sleep(1)

    print("\n[3/7] GitHub 高star新仓...")
    gh = fetch_github_trending(15)
    write_github(gh)
    all_sources["GitHub"] = gh
    time.sleep(1)

    print("\n[4/7] 掘金热榜...")
    jj = fetch_juejin(15)
    write_juejin(jj)
    all_sources["掘金"] = jj
    time.sleep(1)

    print("\n[5/7] dev.to Top...")
    dv = fetch_devto(15)
    write_devto(dv)
    all_sources["dev.to"] = dv
    time.sleep(1)

    print("\n[6/7] Lobsters...")
    lb = fetch_lobsters(15)
    write_lobsters(lb)
    all_sources["Lobsters"] = lb
    time.sleep(1)

    print("\n[7/13] arXiv cs.AI...")
    ax = fetch_arxiv("cs.AI", 20)
    write_arxiv(ax)
    all_sources["arXiv"] = ax
    time.sleep(1)

    # ============ 设计/UX 源 ============
    all_design = {}

    print("\n[8/13] Smashing Magazine...")
    sm = fetch_smashing(8)
    write_design("SmashingMag", sm)
    all_design["SmashingMag"] = sm
    time.sleep(1)

    print("\n[9/13] Awwwards...")
    aw = fetch_awwwards(8)
    write_design("Awwwards", aw)
    all_design["Awwwards"] = aw
    time.sleep(1)

    print("\n[10/13] UX Collective...")
    ux = fetch_ux(8)
    write_design("UXCollective", ux)
    all_design["UXCollective"] = ux
    time.sleep(1)

    print("\n[11/13] NN/g...")
    ng = fetch_nng(5)
    write_design("NNg", ng)
    all_design["NNg"] = ng
    time.sleep(1)

    print("\n[12/13] Stripe Blog...")
    st = fetch_stripe(5)
    write_design("StripeDesign", st)
    all_design["StripeDesign"] = st
    time.sleep(1)

    print("\n[13/21] Material Design...")
    md = fetch_material(5)
    write_design("Material", md)
    all_design["Material"] = md
    time.sleep(1)

    # ============ 技术深源（高技术含量）============
    print("\n[14/21] Cloudflare Blog...")
    cf = fetch_cloudflare(8)
    write_tech("Cloudflare", cf)
    all_sources["Cloudflare"] = cf
    time.sleep(1)

    print("\n[15/21] InfoQ 中文站...")
    iq = fetch_infoq_cn(8)
    write_tech("InfoQ-CN", iq)
    all_sources["InfoQ-CN"] = iq
    time.sleep(1)

    print("\n[16/21] Charity Majors (observability)...")
    cm = fetch_charity(6)
    write_tech("Charity", cm)
    all_sources["Charity"] = cm

    time.sleep(1)

    print("\n[17/21] Phoronix...")
    ph = fetch_phoronix(6)
    write_tech("Phoronix", ph)
    all_sources["Phoronix"] = ph
    time.sleep(1)

    print("\n[18/21] OpenAI News...")
    oa = fetch_openai(6)
    write_tech("OpenAI", oa)
    all_sources["OpenAI"] = oa
    time.sleep(1)

    print("\n[19/21] Dan Luu...")
    dl = fetch_danluu(5)
    write_tech("DanLuu", dl)
    all_sources["DanLuu"] = dl
    time.sleep(1)

    print("\n[20/21] Lilian Weng (Lil'Log)...")
    lw = fetch_lilian(5)
    write_tech("LilianWeng", lw)
    all_sources["LilianWeng"] = lw
    time.sleep(1)

    print("\n[21/21] LWN.net (Linux kernel)...")
    lwn = fetch_lwn(8)
    write_tech("LWN", lwn)
    all_sources["LWN"] = lwn


    # 综合精选 N 条（开发）
    if not args.no_digest:
        print(f"\n[*] 生成每日 {DIGEST_SIZE} 精选...")
        write_digest(all_sources)

    # 设计灵感精选
    if not args.no_digest:
        print("[*] 生成设计灵感精选...")
        write_design_digest(all_design)

    total = sum(len(v) for v in all_sources.values())
    total_design = sum(len(v) for v in all_design.values())


    print(f"\n=== 完成: 开发 {total} 条 + 设计 {total_design} 条 + 技术 {sum(len(all_sources[k]) for k in TECH_FEEDS if k in all_sources)} 条 ===")
    print(f"开发分布: HN={len(hn)} HN-Best={len(hn_b)} GH={len(gh)} "
          f"掘金={len(jj)} dev.to={len(dv)} Lobsters={len(lb)} arXiv={len(ax)}")
    print(f"技术分布: " + " ".join(
        f"{TECH_FEEDS[k]['label']}={len(all_sources.get(k, []))}" for k in TECH_FEEDS
    ))
    print(f"设计分布: " + " ".join(
        f"{DESIGN_FEEDS[k]['label']}={len(all_design.get(k, []))}" for k in DESIGN_FEEDS
    ))



if __name__ == "__main__":
    main()
