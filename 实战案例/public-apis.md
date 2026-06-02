# Public-APIs - 社区驱动 API 索引

**来源**：GitHub https://github.com/public-apis/public-apis
**创建时间**：2026-06-02

---

## 一、核心机制与 SSOT 哲学

### 1. Markdown 即数据库（SSOT in README）

**问题场景**：当一份"数据资产"结构化但低频变更时（< 2000 行、PR < 50/天），用 SQLite + 后端服务是过度工程。GitHub + Markdown + 校验器是更优解：零部署、零备份、PR 即审计。public-apis 用 1962 行 README.md 承载 53 个分类、1400+ API，全部由社区 PR 维护。

**解决方案**：
```markdown
## Index
- [Animals](#animals)
- [Anime](#anime)
- [Anti-Malware](#anti-malware)
- ...

### Animals
| API | Description | Auth | HTTPS | CORS |
|---|---|---|---|---|
| Cat Facts | Daily cat facts | No | Yes | Yes |
| Dog API | Dogs by breed | apiKey | Yes | Yes |
| Petfinder | Adoption | OAuth | Yes | Yes |
| Zoo Animals | Random zoo animal | No | Yes | No |

> Each category must have at least 3 entries. (rule enforced by `format.py`)
```
**关键参数**：

| 字段 | 取值 | 规则 |
|------|------|------|
| `API` | string | 字母序，禁尾缀 "API" |
| `Description` | ≤100 字符 | 首大写、末非标点 |
| `Auth` | `No` / `apiKey` / `OAuth` / `X-Mashape-Key` / `User-Agent` | 5 选 1 |
| `HTTPS` | `Yes` / `No` | 2 选 1 |
| `CORS` | `Yes` / `No` / `Unknown` | 3 选 1 |

**最佳实践**：
1. ✅ 数据量 < 2000 行时优先 Markdown + GitHub
2. ✅ 单一 README 既做文档也做数据库 = SSOT
3. ✅ 分类用 `###` 标题 + 锚定，Index 自动生成
4. ✅ 表格列宽由 `CONTRIBUTING.md` 写死，校验器机械化
5. ✅ 商业 API 单独 `## ` 二级标题，不掺入分类主表

### 2. 纯函数 + CLI 校验器（Pure Validator）

**问题场景**：用 pytest/click 重型框架，5 个 pip 包就能撑起全流程的 4 语言协同校验，引入 click 反而是负担。`format.py` 和 `links.py` 都接受字符串/文件、返回错误列表，**无副作用、无 I/O 状态、无全局变量**——既能 `python xxx.py` 跑全量，也能被 unittest 测，还能被 shell 通过 stdout 文本协议集成。

**解决方案**：
```python
# scripts/validate/format.py 模式
ALLOWED_KEYS = {
    "auth": {"No", "apiKey", "OAuth", "X-Mashape-Key", "User-Agent"},
    "https": {"Yes", "No"},
    "cors": {"Yes", "No", "Unknown"},
}

def check_file_format(file_path: str) -> list[str]:
    """返回错误列表，空列表 = 通过。"""
    errors = []
    with open(file_path) as f:
        content = f.read()
    categories = get_categories_content(content)
    for category, body in categories.items():
        errors += check_alphabetical_order(body)
        errors += check_min_entries(body, min_count=3)
        for entry in body:
            errors += check_entry(entry)
    return errors
```
**关键参数**：

| 函数 | 输入 | 输出 | 错误码 |
|------|------|------|--------|
| `check_alphabetical_order(body)` | 分类条目 | 错误列表 | `L001/L002` |
| `check_min_entries(body, 3)` | 分类条目 | 错误列表 | `L003` |
| `check_entry(entry)` | 单条 API | 错误列表 | `L004-L010` |
| `check_title(title)` | API 名称 | 错误列表 | 禁 "API" 后缀 |
| `check_description(desc)` | 描述 | 错误列表 | 长度+大写+末位 |
| `check_file_format(file)` | README | 错误列表 | 编排 |

**最佳实践**：
1. ✅ 校验器永远是"返回错误列表"而不是"raise"——便于聚合
2. ✅ 错误信息带行号 (`L003`) 方便 PR 维护者 grep
3. ✅ 模块级常量定义所有"取值集合"——加新 Auth 只改 1 处
4. ✅ 拒绝框架——5 个 requests 家族包足够
5. ✅ 单元测试用 fake_contents + subTest 跑标点符号全部组合

### 3. PR 增量校验 + 全量巡检（Diff + Full Scan）

**问题场景**：1.4k 链接串行 GET 探活需要 8-12 小时。PR 提交时只查 PR additions（新增的链接）节省 CI 时间；cron 时跑全量避免漏网。**双轨制 = 速度 + 完整性**。

**解决方案**：
```bash
# scripts/github_pull_request.sh
PR_NUMBER=$1
DUMMY_SCHEME=""                                     # 占位避免 diff 自身被当成新链
DIFF_URL="https://patch-diff.githubusercontent.com/raw/${REPO}/pull/${PR_NUMBER}.diff"

curl -sL "$DIFF_URL" > diff.txt
cat diff.txt | egrep "^\+" > additions.txt          # 只取 + 开头的行

# 把 additions.txt 喂给 links.py
python links.py README.md --input_additions=additions.txt
```
**关键参数**：

| CI 触发 | 跑什么 | 耗时 | 失败处理 |
|---------|--------|------|----------|
| `push` | `format.py` + `links.py -odlc` | < 30s | 阻 PR |
| `pull_request` | `github_pull_request.sh` + `links.py PR additions` | 1-5min | 阻 PR |
| `cron 0 0 * * *` | `links.py` 全量 1.4k 链接 | 8-12h | 开 issue |
| `unittest` | `python -m unittest discover tests/` | < 5s | 阻 PR |

**最佳实践**：
1. ✅ PR 校验只查 additions（`+` 开头行），忽略上下文
2. ✅ Cron 全量 8-12h 跑得起，串行 + 25s timeout 避免卡死
3. ✅ 引入 aiohttp + 100 并发可降到 1h，但增加依赖
4. ✅ Cloudflare 拦截走"放过"分支，SSL/CNT 错误判死链
5. ✅ cron 时区要明示 `cron: 0 0 * * *` 走 UTC + 文档说明

### 4. PR 模板 = 机器可读合同（PR Checkbox Contract）

**问题场景**：14 条 PR 守则（CONTRIBUTING.md）靠人脑记忆 100% 不可行。`PULL_REQUEST_TEMPLATE.md` 的 9 个 checkbox 把守则机器化：**贡献者自查 + CI 复核**，把 maintainer 从"机械审"解放到"业务审"。

**解决方案**：
```markdown
<!-- PULL_REQUEST_TEMPLATE.md -->
- [ ] My submission is formatted according to CONTRIBUTING.md
- [ ] My submission is ordered alphabetically within the category
- [ ] My submission has at least 3 entries in each category
- [ ] My submission doesn't end with the suffix "API"
- [ ] My submission has a description ≤ 100 characters
- [ ] My submission has one of the 5 allowed `Auth` values
- [ ] My submission uses one of the 2 allowed `HTTPS` values
- [ ] My submission has a working HTTPS URL
- [ ] All checks pass (format.py + links.py)

> Tip: `python scripts/validate/format.py README.md` checks the first 6.
```
**关键参数**：

| Checkbox | 对应守则 | 自动校验 |
|----------|----------|----------|
| 格式化 | CONTRIBUTING.md §1 | `format.py` |
| 字母序 | CONTRIBUTING.md §2 | `check_alphabetical_order` |
| 最少 3 条 | CONTRIBUTING.md §3 | `min_entries_per_category` |
| 禁 "API" 后缀 | CONTRIBUTING.md §4 | `check_title` |
| 描述 ≤100 字符 | CONTRIBUTING.md §5 | `check_description` |
| Auth 白名单 | CONTRIBUTING.md §6 | `check_entry` |
| HTTPS 白名单 | CONTRIBUTING.md §7 | `check_entry` |
| URL 存活 | CONTRIBUTING.md §8 | `links.py` |
| 全部 CI 通过 | - | Actions 退出码 |

**最佳实践**：
1. ✅ 软规则（"请按字母排序"）硬化为复选框
2. ✅ 每个 checkbox 对应一条 CONTRIBUTING 守则
3. ✅ Tip 行告诉贡献者本地怎么自检
4. ✅ Issue 模板一句话引导"开 issue 前先考虑开 PR"
5. ✅ maintainer 只看业务，不看格式

### 5. Issue 反向引导（Issue → PR Funnel）

**问题场景**：贡献者发现少了一条 API，开 issue 描述"建议加 X API"——其实直接 PR 更快。**Issue 模板"反向引导"**：用一句话把"建议加"类 issue 转化为"开 PR 吧"。

**解决方案**：
```markdown
<!-- ISSUE_TEMPLATE.md -->
# Notice
**If you are opening an issue to suggest adding a new entry,
please consider opening a pull request instead!**

See [CONTRIBUTING.md](../blob/master/CONTRIBUTING.md) for details.
```
**关键参数**：

| Issue 类型 | 模板引导 | 期望行为 |
|-----------|----------|----------|
| 建议加 API | "开 PR 吧" | 90% 转化 PR |
| 报告死链 | 描述 + URL | maintainer 跟进 |
| 商业合作 | 邮件 | 跳过 GitHub |
| 投诉 | 描述 + 重现 | maintainer 处理 |

**最佳实践**：
1. ✅ Issue 模板第一行就是"反向引导"——把建议类 issue 转化为 PR
2. ✅ 真正出 bug 才走 Issue 流程
3. ✅ 模板用粗体反差点缀，醒目
4. ✅ 链接直接到 CONTRIBUTING.md 减少歧义
5. ✅ Sponsor 类沟通走邮件，不要走 Issue（避免公开讨论）

---

## 二、校验器与链接层

### 6. format.py - 字段白名单约束（Whitelist Fields）

**问题场景**：贡献者乱填字段——`Auth` 列写 "Yes" / "Token" / "Bearer" / "free" 等 20 种值，下游脚本解析崩溃。**白名单约束 = 强制做选择题不做填空题**，字段值必须从固定集合选。

**解决方案**：
```python
# scripts/validate/format.py 约束即常量
auth_keys = ["No", "apiKey", "OAuth", "X-Mashape-Key", "User-Agent"]
https_keys = ["Yes", "No"]
cors_keys = ["Yes", "No", "Unknown"]
max_description_length = 100

def check_entry(entry: str) -> list[str]:
    errors = []
    fields = entry.split("|")
    if len(fields) < 5:                                # 必须 5 列
        errors.append(f"(L004) missing fields: {entry}")
        return errors
    api, desc, auth, https, cors = [f.strip() for f in fields[:5]]
    if auth not in auth_keys:                          # 白名单
        errors.append(f"(L005) invalid auth: {auth}")
    if https not in https_keys:
        errors.append(f"(L006) invalid https: {https}")
    if cors not in cors_keys:
        errors.append(f"(L007) invalid cors: {cors}")
    if len(desc) > max_description_length:
        errors.append(f"(L008) description too long: {len(desc)}")
    return errors
```
**关键参数**：

| 字段 | 合法值 | 数量 |
|------|--------|------|
| `Auth` | No, apiKey, OAuth, X-Mashape-Key, User-Agent | 5 |
| `HTTPS` | Yes, No | 2 |
| `CORS` | Yes, No, Unknown | 3 |
| `Description` | 任意文本 | ≤100 字符 |

**最佳实践**：
1. ✅ 白名单 = 模块级常量，加新值只改 1 处
2. ✅ 字段数量固定 5 列，少列直接 `L004`
3. ✅ 错误码 `(L005)` 4 位编号 + 简短描述
4. ✅ CONTRIBUTING.md 必须同步更新字段白名单
5. ✅ "Unknown" 是 CORS 的逃生口——确实不明的标 Unknown

### 7. format.py - 字母序 + 最少条目（Alphabetical + Min Count）

**问题场景**：1400 条 API 不按字母排，根本没法查找。新分类只加 1 条就开分类 = 分类碎片化。**两条简单规则**：每个分类按 API 名字母排序；新分类至少 3 条。

**解决方案**：
```python
# scripts/validate/format.py
def check_alphabetical_order(body: list[str]) -> list[str]:
    errors = []
    sorted_titles = sorted([entry.split("|")[0].strip() for entry in body])
    actual_titles = [entry.split("|")[0].strip() for entry in body]
    if actual_titles != sorted_titles:
        errors.append("(L001) entries not in alphabetical order")
    return errors

def check_min_entries(body: list[str], min_count: int = 3) -> list[str]:
    if len(body) < min_count:
        return [f"(L003) category has {len(body)} entries, need {min_count}"]
    return []
```
**关键参数**：

| 规则 | 实现 | 错误码 |
|------|------|--------|
| 字母序 | `sorted() != list` | `L001` |
| 大小写 | `title.upper()` 后比 | `L001` 包含 |
| 数字前缀 | 数字 < 字母 | 默认按字符序 |
| 最少 3 条 | `len(body) < 3` | `L003` |

**最佳实践**：
1. ✅ `sorted(api_list) != api_list` 是最简判序
2. ✅ 忽略大小写用 `title.upper()` 排序
3. ✅ `min_count=3` 防止"分类碎片化"——1-2 条不算分类
4. ✅ 大写字母前小写字母顺序敏感（先 sort 再 .upper）
5. ✅ 排序错时只报"not in alphabetical order"，不强制重排（人工判断边界情况）

### 8. links.py - URL 提取与正则（URL Extraction）

**问题场景**：从 200KB Markdown 提取所有 URL —— `http(s)://` + `www.` + 裸域 + 路径 + 参数 + 锚点的全部组合。一个能扛 99% 真实场景的 URL 正则是 100+ 字符的"专家级正则"。

**解决方案**：
```python
# scripts/validate/links.py
import re

# RFC 3986 简化版，匹配 http(s) + 域 + 路径 + 参数 + 锚点
URL_REGEX = re.compile(
    r"(?:(?:https?|ftp):\/\/)?"
    r"(?:\w+\.)+\w+"                                  # www.example.com
    r"(?:\/[^\s\)\]\}\,\'\"\<\>]*)?",                  # /path/to
    re.IGNORECASE
)

def find_links_in_text(text: str) -> list[str]:
    """提取 Markdown 文本中的所有 URL，保留唯一性。"""
    links = URL_REGEX.findall(text)
    return list(dict.fromkeys(links))                  # 保序去重
```
**关键参数**：

| 字段 | 用途 |
|------|------|
| `protocol` | `http` / `https` / `ftp` |
| `subdomain` | `www.` / `api.` / `v2.` |
| `domain` | `example.com` |
| `path` | `/v1/users` |
| `query` | `?key=xxx` |
| `fragment` | `#section` |

**最佳实践**：
1. ✅ 100+ 字符正则覆盖 99% 真实场景
2. ✅ `dict.fromkeys()` 保序去重——避免 `set` 丢顺序
3. ✅ 失败时宽容——只 match，不验证格式
4. ✅ 引用 RFC 3986 简化版，注释说明简化点
5. ✅ 测试用 `find_links_in_text("https://api.x.com")` 跑全部 scheme

### 9. links.py - 重复检测（Duplicate Detection）

**问题场景**：PR 贡献者不小心把同一条 API 加 2 次（复制粘贴错误），或同 URL 被两个不同 API 名引用（合法但要确认）。**重复检测**是数据一致性的基础防线。

**解决方案**：
```python
# scripts/validate/links.py
def check_duplicate_links(links: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    duplicates = []
    for link in links:
        seen[link] = seen.get(link, 0) + 1
        if seen[link] == 2:                            # 第二次发现才报
            duplicates.append(link)
    return duplicates
```
**关键参数**：

| 模式 | 行为 | 用途 |
|------|------|------|
| `seen[link] == 1` | 第一次出现 | 不报 |
| `seen[link] == 2` | 第二次出现 | 报"重复" |
| `seen[link] == N` | 第三次及以上 | 不重复报（避免 [A,A,A] 报 2 次） |

**最佳实践**：
1. ✅ 用 `dict[link] = count` 而非 `set`——因为要返回"哪些是重复的"
2. ✅ 第一次发现重复才报——避免 [A,A,A] 报 2 次
3. ✅ 重复时返回 link 列表（可读），不是计数（不友好）
4. ✅ 大小写不敏感——`Seen[LINK] == 1` 当作同 URL
5. ✅ 配合 `-odlc` CLI flag 让 PR 快速跑（only_duplicate_links_checker）

### 10. links.py - Cloudflare 鉴别（CF Detection）

**问题场景**：cron 全量 GET 探活时碰到 Cloudflare 拦截（403/503）——把"我在检查浏览器"误判为死链。**Cloudflare 鉴别**把 CF 拦截**不当作死链**，避免开大量"误报 issue"。

**解决方案**：
```python
# scripts/validate/links.py 18 个 CF 特征字符串
CLOUDFLARE_MARKERS = [
    "cloudflare", "cf-ray", "attention required",
    "checking your browser", "please complete the security check",
    "cf-chl-bypass", "cf_clearance", "challenge-form",
    "ray id:", "your request has been blocked",
    "403 forbidden", "503 service temporarily unavailable",
    "browser verification", "ddos protection by cloudflare",
    "enable javascript", "human verification",
    "ddos-guard", "ddos protection by",
]

def has_cloudflare_protection(body: str) -> bool:
    body_lower = body.lower()
    return any(marker in body_lower for marker in CLOUDFLARE_MARKERS)

# 主流程
def check_if_link_is_working(url: str) -> str:
    try:
        resp = requests.get(url, headers=fake_user_agent(), timeout=25)
        if resp.status_code in (403, 503) and has_cloudflare_protection(resp.text):
            return "OK (Cloudflare)"                       # 放过
        if resp.status_code >= 400:
            return f"ERR:HTTP:{resp.status_code}: {url}"
        return "OK"
    except requests.exceptions.SSLError:
        return f"ERR:SSL: {url}"
    except requests.exceptions.ConnectionError:
        return f"ERR:CNT: {url}"
    except requests.exceptions.Timeout:
        return f"ERR:TMO: {url}"
    # ...
```
**关键参数**：

| HTTP 状态 | 行为 | 错误码 |
|-----------|------|--------|
| 200-399 | OK | - |
| 403 + CF 标记 | OK (Cloudflare) | - |
| 403 无 CF | ERR:HTTP:403 | ERR |
| 404 | ERR:HTTP:404 | ERR |
| 500-599 | ERR:HTTP:5xx | ERR |
| SSL error | ERR:SSL | ERR |
| Connection | ERR:CNT | ERR |
| Timeout | ERR:TMO | ERR |
| TooManyRedirects | ERR:TMR | ERR |
| RequestException | ERR:UKN | ERR |

**最佳实践**：
1. ✅ 18 个 CF 特征字符串是经验值——CF 改文案必须改代码
2. ✅ 403 + CF 标记 = 放过，避免误报
3. ✅ 6 类错误前缀码方便 grep
4. ✅ `fake_user_agent()` 轮换 4 个真实 UA——避免被默认 UA 拒
5. ✅ `timeout=25` 硬上限防止 CI 卡死

---

## 三、链接层与 CI 编排

### 11. fake_user_agent 轮换（UA Rotation）

**问题场景**：很多 API 网关（Cloudflare/Mod_security/Cloudfront）默认拒绝 Python `requests` 默认 UA `"python-requests/2.x"`。**轮换真实浏览器 UA** 是低成本的反反爬手段。

**解决方案**：
```python
# scripts/validate/links.py
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
]

def fake_user_agent() -> dict:
    return {"User-Agent": random.choice(USER_AGENTS)}
```
**关键参数**：

| 浏览器 | 操作系统 | 占比 |
|--------|----------|------|
| Chrome | Windows | 33% |
| Safari | macOS | 33% |
| Firefox | Linux | 17% |
| Edge | Windows | 17% |

**最佳实践**：
1. ✅ 用真实 UA 而非"python-requests/2.x"——通过大部分 CF 拦截
2. ✅ 4 个 UA 轮换避免被识别
3. ✅ 注释清楚："some hosting services block not-whitelisted UA"
4. ✅ 定期更新 UA 版本号——UA 太老反被识破
5. ✅ 考虑 `Accept-Language: en-US,en;q=0.9` 等真实 header

### 12. check_if_link_is_working 异常枚举（Exception Enumeration）

**问题场景**：网络异常类型多样（SSL/CNT/TMO/TMR/UKN），不同异常对应不同"修复路径"——SSL 是证书过期、CNT 是 DNS 失败、TMO 是慢服务器、TMR 是循环重定向。**显式枚举每种异常 + 错误前缀码**让维护者能 grep 错误来源。

**解决方案**：
```python
# scripts/validate/links.py
def check_if_link_is_working(url: str) -> str:
    try:
        resp = requests.get(
            url,
            headers=fake_user_agent(),
            timeout=25,
            allow_redirects=True,
        )
        if resp.status_code < 400:
            return f"OK"
        if has_cloudflare_protection(resp.text):
            return f"OK (Cloudflare)"
        return f"ERR:HTTP:{resp.status_code}: {url}"
    except requests.exceptions.SSLError as e:
        return f"ERR:SSL: {url}"                        # 证书问题
    except requests.exceptions.ConnectionError as e:
        return f"ERR:CNT: {url}"                        # DNS / connection refused
    except requests.exceptions.Timeout as e:
        return f"ERR:TMO: {url}"                        # 慢服务器
    except requests.exceptions.TooManyRedirects as e:
        return f"ERR:TMR: {url}"                        # 重定向循环
    except requests.exceptions.RequestException as e:
        return f"ERR:UKN: {url}: {e}"                   # 兜底
```
**关键参数**：

| 错误码 | 含义 | 典型原因 | 修复路径 |
|--------|------|----------|----------|
| `ERR:SSL` | SSL 错误 | 证书过期 / 自签 | API 提供方改 |
| `ERR:CNT` | 连接错误 | DNS 失败 / 端口关 | API 提供方改 |
| `ERR:TMO` | 超时 | 服务器慢 | API 提供方改 |
| `ERR:TMR` | 重定向 | 循环 | API 提供方改 |
| `ERR:UKN` | 未知 | 其他 | 人工查 |
| `ERR:HTTP:404` | 404 | URL 错 | 贡献者改 |
| `ERR:HTTP:5xx` | 5xx | 服务挂 | API 提供方改 |

**最佳实践**：
1. ✅ 每种异常一个 `ERR:XX:` 前缀码
2. ✅ `ERR:UKN` 兜底——但要把原始异常 e 也记上
3. ✅ 不要用 `except Exception`——会吞掉 KeyboardInterrupt
4. ✅ 错误信息包含 URL——便于定位
5. ✅ 6 类前缀码 + 维护者 grep = 快速归类

### 13. github_pull_request.sh 胶水（Diff Glue）

**问题场景**：CI 自动化需要"拉 PR diff → 抽 additions → 喂给 links.py"。**bash + curl + grep = 3 行胶水**比写一个 Go/Python 工具简单 10 倍。

**解决方案**：
```bash
#!/usr/bin/env bash
# scripts/github_pull_request.sh
set -e
PR_NUMBER=$1
REPO="public-apis/public-apis"

# 1. 拉 PR diff
DUMMY_SCHEME="https"                                  # 占位
DIFF_URL="https://patch-diff.githubusercontent.com/raw/${REPO}/pull/${PR_NUMBER}.diff"
curl -sL "$DIFF_URL" > diff.txt

# 2. 只抽 + 开头的行
cat diff.txt | egrep "^\+" > additions.txt

# 3. 喂给 links.py
python scripts/validate/links.py README.md --input_additions=additions.txt
```
**关键参数**：

| 命令 | 行为 |
|------|------|
| `curl -sL` | 静默 + 跟重定向 |
| `egrep "^\+"` | 只取新增行 |
| `DUMMY_SCHEME` | 注释："Trick the URL validator" |
| `--input_additions` | links.py CLI 参数 |

**最佳实践**：
1. ✅ 胶水用 bash + curl + grep，不引 Python 库
2. ✅ `set -e` 任何失败立即退
3. ✅ DUMMY_SCHEME 注释清楚——避免后人困惑
4. ✅ 抽 + 行而不是整 diff——PR 范围最小化
5. ✅ `patch-diff.githubusercontent.com` 是 PR diff 公共 endpoint

### 14. CONTRIBUTING.md 14 条守则（Soft Rules）

**问题场景**：14 条 PR 守则全部写在 CONTRIBUTING.md，校验器自动机械执行 + 模板 checkbox 自查 + maintainer 业务审。**软规则**靠"人 + 工具 + 流程"三层兜底。

**解决方案**：
```markdown
# CONTRIBUTING.md 关键条款
1. Submissions are ordered alphabetically within their category
2. Each category has at least 3 entries
3. The Description should not exceed 100 characters
4. The Auth field must be one of: No, apiKey, OAuth, X-Mashape-Key, User-Agent
5. The HTTPS field must be Yes or No
6. The CORS field must be Yes, No, or Unknown
7. Don't add the suffix "API" to titles
8. Capitalize the first letter of descriptions
9. Use lowercase for the rest of descriptions
10. Don't add trailing punctuation to descriptions
11. Use squash commits for merging
12. One PR = one category
13. Don't add paid APIs (unless sponsored)
14. The link must be HTTPS
```
**关键参数**：

| 守则 | 自动化 | 工具 |
|------|--------|------|
| 字母序 | ✅ | `check_alphabetical_order` |
| ≥3 条 | ✅ | `min_entries_per_category` |
| 描述 ≤100 | ✅ | `check_description` |
| Auth 白名单 | ✅ | `check_entry` |
| HTTPS 白名单 | ✅ | `check_entry` |
| CORS 白名单 | ✅ | `check_entry` |
| 禁 "API" 后缀 | ✅ | `check_title` |
| 大写规则 | ✅ | `check_description` |
| squash commit | ❌ | maintainer 审 |
| 单 PR 单分类 | ❌ | maintainer 审 |
| 禁付费 API | ❌ | maintainer 审 |
| HTTPS URL | ✅ | `links.py` 探活 |

**最佳实践**：
1. ✅ 14 条守则中 8 条能自动化，6 条要 maintainer 审
2. ✅ 自动化那 8 条写进 PR 模板 checkbox
3. ✅ 软规则硬化为硬错误——但保留 maintainer 例外权
4. ✅ CONTRIBUTING.md 是合同，跟 PR 模板一一对应
5. ✅ "Don't add paid APIs" 走业务审，不强行自动化

### 15. unittest 单元测试（Test Coverage）

**问题场景**：校验器改了算法后，怎么保证没破坏 1400 条已通过的 API？**unittest + subTest 跑标点符号全部组合**覆盖核心规约，比 pytest/click 重型框架轻 10 倍。

**解决方案**：
```python
# scripts/tests/test_validate_format.py
import unittest
from validate.format import check_description

class TestDescription(unittest.TestCase):
    def test_max_length(self):
        for length in [99, 100, 101]:
            with self.subTest(length=length):
                desc = "x" * length
                if length > 100:
                    self.assertNotEqual(check_description(desc), [])
                else:
                    self.assertEqual(check_description(desc), [])

    def test_punctuation(self):
        for punct in [".", ",", "!", "?", ";", ":", "-", "..."]:
            with self.subTest(punct=punct):
                desc = f"Description ending with {punct}"
                if punct in PUNCT_END:
                    self.assertNotEqual(check_description(desc), [])

# 跑测试
# python -m unittest discover tests/ --verbose
```
**关键参数**：

| 测试 | 覆盖 | 用例数 |
|------|------|--------|
| `check_alphabetical_order` | 正常+乱序 | 2+ |
| `check_min_entries` | < 3 / =3 / >3 | 3+ |
| `check_entry` | 5 字段全+缺字段 | 10+ |
| `check_description` | 长度+大写+末位标点 | 33+（标点全组合） |
| `check_title` | 后缀 "API" | 2+ |
| `find_links_in_text` | http/https/ftp/裸域 | 5+ |
| `check_duplicate_links` | 无重复/有重复 | 2+ |

**最佳实践**：
1. ✅ `subTest` 跑全部标点符号组合——穷举场景
2. ✅ `fake_contents` 模拟 README 段——不依赖真实文件
3. ✅ unittest 框架足够——拒绝 pytest
4. ✅ 跑 `python -m unittest discover tests/` 在 CI
5. ✅ 测试覆盖率对 8 个核心函数全覆盖

---

## 四、CI 编排与社区治理

### 16. test_of_push_and_pull.yml（Push CI）

**问题场景**：贡献者 push 后 30 分钟才知 PR 失败——体验差。`test_of_push_and_pull.yml` 在 push 触发时跑 `format.py` + `links.py -odlc`（只查重复），30s 内反馈。

**解决方案**：
```yaml
# .github/workflows/test_of_push_and_pull.yml
name: test_of_push_and_pull
on:
  push:
    branches: [master]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r scripts/requirements.txt
      # 1. 格式校验（30s 内）
      - run: python scripts/validate/format.py README.md
      # 2. 重复检测（1min 内）
      - run: python scripts/validate/links.py README.md -odlc
      # 3. PR 增量链接校验（1-5min）
      - name: Check PR diff links
        if: github.event_name == 'pull_request'
        run: bash scripts/github_pull_request.sh ${{ github.event.number }}
      # 4. 单元测试
      - run: python -m unittest discover scripts/tests/ --verbose
```
**关键参数**：

| 步骤 | 触发 | 耗时 | 失败处理 |
|------|------|------|----------|
| format.py | push + PR | < 30s | 阻 PR |
| links.py -odlc | push + PR | < 1min | 阻 PR |
| PR diff links | 仅 PR | 1-5min | 阻 PR |
| unittest | push + PR | < 5s | 阻 PR |

**最佳实践**：
1. ✅ `push: master` + `pull_request` 双触发
2. ✅ format.py 必须 30s 内反馈
3. ✅ PR 增量校验用 github_pull_request.sh
4. ✅ unittest 在 push + PR 都跑
5. ✅ 失败用 `exit 1` 阻 PR

### 17. validate_links.yml 全量巡检（Cron CI）

**问题场景**：push 时只查 PR additions，可能漏网（PR 改的是格式不涉及新 URL，old URL 突然死了）。**每日 0:00 UTC cron 跑全量 1.4k 链接**是兜底。

**解决方案**：
```yaml
# .github/workflows/validate_links.yml
name: validate_links
on:
  schedule:
    - cron: '0 0 * * *'                                # 每天 UTC 0:00
  workflow_dispatch:                                    # 手动触发

jobs:
  full-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r scripts/requirements.txt
      - name: Full link check
        run: python scripts/validate/links.py README.md > link_report.txt
      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: link_report
          path: link_report.txt
      - name: Open issue on failures
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('link_report.txt', 'utf8');
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Daily link check: ${new Date().toISOString().split('T')[0]}`,
              body: report.substring(0, 60000)
            });
```
**关键参数**：

| 触发 | 行为 | 用途 |
|------|------|------|
| `cron: '0 0 * * *'` | 每日 UTC 0:00 | 兜底 |
| `workflow_dispatch` | 手动触发 | 调试 |
| `if: failure()` | 失败开 issue | 自愈起点 |
| `artifact: 30d` | 报告保留 | 历史追踪 |

**最佳实践**：
1. ✅ `cron: 0 0 * * *` UTC——文档说明时区
2. ✅ `workflow_dispatch` 手动触发方便调试
3. ✅ 失败自动开 issue——把"反馈"机制化
4. ✅ artifact 保留 30d 报告——可查历史
5. ✅ 8-12h 串行 = 接受代价，不引 aiohttp 增依赖

### 18. test_of_validate_package.yml（Unit Test CI）

**问题场景**：校验器改了核心算法（加新 Auth 值、改白名单），怎么保证 unittest 通过？**专门的 unittest CI workflow** 是"包级质量门"。

**解决方案**：
```yaml
# .github/workflows/test_of_validate_package.yml
name: test_of_validate_package
on:
  push:
    paths:
      - 'scripts/validate/**'
      - 'scripts/tests/**'
  pull_request:
    paths:
      - 'scripts/validate/**'
      - 'scripts/tests/**'

jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r scripts/requirements.txt
      - run: python -m unittest discover scripts/tests/ --verbose
```
**关键参数**：

| 触发 | 行为 |
|------|------|
| `paths: scripts/validate/**` | 校验器变了就跑 |
| `paths: scripts/tests/**` | 测试变了就跑 |
| `pull_request` | PR 必跑 |

**最佳实践**：
1. ✅ `paths` 过滤——只跑相关 trigger
2. ✅ `discover scripts/tests/` 自动发现
3. ✅ `--verbose` 打印每个测试用例
4. ✅ Python 多版本测试（3.8/3.9/3.10/3.11/3.12）
5. ✅ 失败阻 PR 合并

### 19. 商业赞助与边界（APILayer Sponsorship）

**问题场景**：开源项目要活下去要钱，但商业赞助容易破坏"非营销工具"的立场。**APILayer 模式**：首页 9 个自营 API + 顶部 logo + 底部 m3o logo，**所有赞助都不掺入分类主表**。

**解决方案**：
```markdown
<!-- README.md 顶部独立 section -->
## Top 9 Free APIs
| API | Description | Auth | HTTPS | CORS |
|---|---|---|---|---|
| APILayer 1 | ... | apiKey | Yes | Unknown |
| ... |

> These are sponsored listings. They appear at the top of README 
> but are not part of the [Index](#index) categories.

<!-- README.md 底部独立 footer -->
## Sponsors
- [APILayer](https://apilayer.com) - sponsor since 2020
- [m3o](https://m3o.com) - sponsor since 2022

<!-- 资源目录 -->
.github/assets/sponsors_logo/
├── m3o_logo_black.png
├── m3o_logo_white.png
└── cs1586-APILayerLogoUpdate2022.png   <!-- 2022 协商结果 -->
```
**关键参数**：

| 位置 | 内容 | 商业性 |
|------|------|--------|
| README 顶部 | APILayer 9 个自营 API | 赞助位 |
| 顶部 logo | APILayer logo | 赞助位 |
| 分类主表 | 53 个分类 | 纯社区 |
| 底部 footer | 2 个赞助商 logo | 友好支持 |
| 赞助 logo 目录 | `assets/sponsors_logo/` | 物理隔离 |

**最佳实践**：
1. ✅ 赞助商 API 独立 `## ` 二级标题，不掺入分类
2. ✅ 赞助 logo 在 `assets/sponsors_logo/` 子目录独立文件
3. ✅ 跟踪参数 `utm_source=Github&utm_medium=Referral&utm_campaign=Public-apis-repo` 标识来源
4. ✅ License 假定每个 API 链接的版权属于各提供方
5. ✅ 商业合作走邮件，Issue 模板引导"开 PR 不要开 issue"

### 20. 仓库治理与可持续性（Long-term Sustainability）

**问题场景**：5+ 年稳定运营的 320k star 仓库怎么避免 maintainer burn out？**轻量治理 = CONTRIBUTING 守则 + PR checkbox + 自动校验 + 赞助商 + Issue 漏斗**。

**解决方案**：
```markdown
# .github/CODEOWNERS（隐式，没显式但 maintainer 是 GitHub Org）
# 关键 PR 通知 + Triage 流程

# PR 流程
1. 贡献者 fork + 编辑 README.md
2. 本地跑 `python scripts/validate/format.py README.md` 自检
3. push + 开 PR
4. CI 跑 4 个 workflow
5. PR 模板 9 checkbox 自查
6. maintainer 业务审
7. squash commit 合并

# 5 年持续运营的关键
- CONTRIBUTING.md 不频繁变（稳定性）
- 校验器自动机械执行（maintainer 解放）
- 9 checkbox 把守则硬化（贡献者自查）
- cron 全量巡检（自愈）
- Issue 漏斗反向引导（建议加 API → PR）
- APILayer 赞助（钱）
```
**关键参数**：

| 治理维度 | 实现 | 周期 |
|----------|------|------|
| 守则 | CONTRIBUTING.md | 季度审视 |
| 自动化 | format.py + links.py | 持续 |
| 自查 | PR 9 checkbox | 持续 |
| 巡检 | cron 0 0 * * * | 每日 |
| 漏斗 | Issue 模板一句话 | 持续 |
| 赞助 | APILayer / m3o | 年度续约 |
| License | MIT (c) 2022 public-apis | 一次性 |

**最佳实践**：
1. ✅ CONTRIBUTING.md 极简——14 条守则 5 年不变
2. ✅ 校验器跑 CI 4 个 workflow——maintainer 只看业务
3. ✅ Issue 漏斗反向引导——把"建议加 API"转 PR
4. ✅ APILayer 赞助模式可借鉴——首页位换资金
5. ✅ License 假定每条 API 链接的版权属于各提供方——项目只"索引"不"分发"

---

**标签**：#public-apis #Markdown #Python #curated-list #社区驱动
**状态**：20/20 份详细内容
