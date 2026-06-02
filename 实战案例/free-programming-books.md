# free-programming-books - 免费编程书籍大全资源仓库

**GitHub**: EbookFoundation/free-programming-books
**Star**: 350k+
**语言**: Markdown
**主题**: 资源列表 / 社区编辑 / 公开课
**适用场景**: 编程学习者找免费电子书、播客、在线课、动手教程

---

## 第一段：基础范式

### 模式 1 - 纯 Markdown 仓库结构

**问题场景**：资源列表项目（如 awesome-xxx）用二进制、PDF、DOCX 难维护，且涉版权风险；用代码仓库易 fork、PR、版本管理。

**解决方案**：本项目主体是一个 `books.md`（按语言分类的免费书列表），每条目 `- [书名](URL) - 作者`，无 PDF/DOCX 资产，链接指向外部原始地址。零版权争议 + 零仓库体积。

**关键参数**：
- 主文件 `books.md`（3 万+ 行）
- 子分类 `books/*.md`（中文 / 葡萄牙语 / 西班牙语 / 俄语等）
- 配置文件 `_config.yml`（Jekyll GitHub Pages）
- 协议文件 `LICENSE`（Apache-2.0，仅对仓库元数据）

**最佳实践**：资源列表类项目坚持"无资产、纯链接"原则；分类按语言 / 主题 / 难度三维度切分；定期跑链接检查脚本（`scripts/check_links.py`）防止死链。

### 模式 2 - 社区驱动的编辑流程

**问题场景**：350k+ star 的资源列表靠 1 个维护者必然跟不上更新，需要"任何人可贡献"。

**解决方案**：标准 GitHub Flow — Fork → Branch → 修改 → PR → CI 验证链接 → Maintainer 审核 → merge。`.github/CONTRIBUTING.md` 详细写明规范（书名格式、是否收费、URL 验证）。

**关键参数**：
- 6000+ contributors
- PR 平均审核时间 < 24h
- CI 跑 `linkspector` 死链检测 + `languagetool` 拼写检查
- 标签机器人（`github-actions[bot]`）自动打标

**最佳实践**：项目健康靠"低门槛贡献 + 自动化验证"；CONTRIBUTING.md 写明 3 件事 — 接受什么、拒绝什么、怎么写 PR；CI 跑所有 PR 验证才能 merge。

### 模式 3 - 多语言站点（i18n）

**问题场景**：全球开发者用不同母语，本地化资源列表要支持 10+ 语言。

**解决方案**：Jekyll 多语言插件 + `books/{lang}/` 子目录。`books.md` 是英文主版，`books/zh.md` 是中文版，每种语言独立 PR。

**关键参数**：
- 30+ 语言版本
- 主语言英文（`books.md`）
- 同步策略：英文更新触发 bot 提醒各语言翻译者
- `_data/languages.yml` 维护语言列表

**最佳实践**：开源文档 i18n 优先建"主语言 + 关键 3 语言"，不要一上来铺 30 语言（维护成本爆炸）；同步策略用 weekly bot 通知而非强制同步（翻译者节奏不同）。

### 模式 4 - 链接质量保证（Dead Link）

**问题场景**：资源列表 80% 价值在链接，URL 失效（网站关闭、改版、迁移）就直接废掉。

**解决方案**：CI 跑 `linkspector` + `lychee` 检查所有链接 HTTP 状态码，定期人工 + 自动化重审查。

**关键参数**：
- `lychee --offline` 本地 DNS 解析
- `--max-redirects 5 --timeout 20`
- 失败链接打 PR 提醒
- 每周一 GitHub Action 跑全量链接检查

**最佳实践**：资源列表类项目必备 link checker；CI 失败 50% 是链接失效，要区分"网站永久关闭"和"临时 503"；用 archive.org 备份镜像替代死链。

### 模式 5 - LICENSE 边界

**问题场景**：项目用 Apache-2.0，但链接到的书可能有自己的版权（"免费"≠"公有领域"）。

**解决方案**：明确 README 声明 — 仓库内容（分类、描述）走 Apache-2.0；链接到的资源遵循各自所有者的协议。"免费"界定 = 永久免费 + 不需注册 + 合法下载。

**关键参数**：
- `LICENSE` 文件 Apache-2.0
- README 写 "Free" 的严格定义
- `CONTRIBUTING.md` 写"拒绝盗版 PDF"
- 不镜像任何 PDF 到仓库

**最佳实践**：资源聚合类项目必区分"本仓库协议" vs "链接资源协议"；贡献前确认资源确为作者/出版方免费发布；遇到版权争议 PR 立刻关闭。

---

## 第二段：扩展范式

### 模式 6 - 子分类目录设计

**问题场景**：单一 `books.md` 10 万行维护不动（编辑器卡、PR diff 巨大）。

**解决方案**：按语言拆分子目录 `books/zh.md / books/es.md / books/ru.md`，主 `books.md` 存英文。子目录可独立 PR，独立 review。

**关键参数**：
- `books/zh.md` 中文
- `books/pt-BR.md` 巴西葡语
- `books/en-US.md` 美国英语
- 主仓 `README.md` 总览

**最佳实践**：单文件 > 1 万行考虑拆分子文件；子文件命名用 ISO 语言代码（`zh-CN` / `pt-BR`）；README 顶部放总目录索引。

### 模式 7 - 持续集成（CI/CD）

**问题场景**：350k+ star 仓库每周 100+ PR，手工验证格式、链接、拼写不可能。

**解决方案**：GitHub Actions 多 job：
1. `link-checker`：lychee 检查所有 markdown 链接
2. `spelling`：codespell 拼写
3. `lint`：markdownlint 格式
4. `language-detection`：检测未声明语言
5. `duplicate-check`：防止重复链接

**关键参数**：
- `.github/workflows/*.yml` 5+ 个 workflow
- 大文件拆分 lint 跑（避免 OOM）
- `concurrency` 限制同时跑 1 个
- 失败 PR 评论具体行号

**最佳实践**：资源列表类项目 CI 必跑"链接 + 拼写 + 重复"三件套；PR 模板 `.github/PULL_REQUEST_TEMPLATE.md` 写明贡献清单；状态检查全绿才允许 merge。

### 模式 8 - 元数据丰富化

**问题场景**：基础列表 `- [书名](URL)` 缺少关键信息（作者、出版年、难度、时长）。

**解决方案**：增强格式 `- [书名](URL) - 作者 (年份, 难度：⭐⭐)`。贡献者在提交时填完整元数据。

**关键参数**：
- 字段：书名 / URL / 作者 / 年份 / 难度 / 主题
- 难度 1-5 ⭐
- 主题标签（python / web / devops...）

**最佳实践**：列表类项目必加"主键 + 分类"两字段（书名 + 主题）；元数据是 SEO 友好的；CI 可验证"必填字段非空"。

### 模式 9 - 离线备份策略

**问题场景**：外部链接失效 = 资源消失。需要"自托管备份"。

**解决方案**：archive.org 自动爬取 + 仓库 README 鼓励 "Bookmark in archive.org"；CI 检查关键链接是否有 archive.org 备份。

**关键参数**：
- `https://web.archive.org/web/*/URL` 通配
- 自动化 `archive-bot` PR
- README 教贡献者"提交前先 archive.org 保存"

**最佳实践**：关键资源 1) 自己下载本地 2) 推 archive.org 3) 写主仓库；备份是 anti-fragile 设计。

### 模式 10 - 标签与主题分类

**问题场景**：用户找"AI 入门书"需要在 3 万行列表里搜索。

**解决方案**：每条目加主题标签 `[AI]` / `[入门]` / `[英文]`，CI 生成 `_data/tags.yml`，网站用 tag 过滤。

**关键参数**：
- 主题：AI / Web / DevOps / Mobile / Database...
- 难度：入门 / 进阶 / 专家
- 语言：英语 / 中文 / 西语...

**最佳实践**：标签系统设计原则 — 互斥（每资源只贴 1-2 个核心 tag）、扁平（不要 3 层嵌套）、可枚举（CI 能列全）。

---

## 第三段：进阶范式

### 模式 11 - 自动化提交机器人

**问题场景**：发现新书后人工提交慢，催办流程不高效。

**解决方案**：GitHub Actions + API 监听 rss / 出版社 newsletter，自动提 PR。

**关键参数**：
- `actions/labeler` 自动打 `new-book` 标签
- 监听 `oreilly.com/feed/free` 等免费书 RSS
- 自动检测 `https://github.com/.../free-ebook-day` 模式

**最佳实践**：自动化提 PR 是辅助，主仓 review 还是人工；机器人 PR 单独打 `automated` 标签；避免 spam 一次性提 50 个 PR 引发 reviewer 疲劳。

### 模式 12 - 社区治理

**问题场景**：仓库大到一定规模，maintainer 1-2 人处理不过来。

**解决方案**：分层治理：
- `OWNERS` 文件列主维护者（merge 权限）
- `MAINTAINERS.md` 列常规贡献者（标签 / 关闭 issue 权限）
- 各语种 `OWNERS` 子维护者（merge 本语言 PR）

**关键参数**：
- `CODEOWNERS` GitHub 自动 assign
- 子目录 owner 机制
- `TRIAGE-ROLES` GitHub 新角色

**最佳实践**：大仓库主 owner 5-10 人；子语言子 owner 2-3 人；新贡献者通过"前 5 个 PR 全审核"建立信任；设 `good first issue` 标签吸新血。

### 模式 13 - 跨仓库引用

**问题场景**：awesome 系列有 N 个（`awesome-python` / `awesome-go` / `awesome-rust`），跨仓库引用难。

**解决方案**：互链机制 — `free-programming-books` README 顶部列相关 awesome 列表，awesome 列表底部列 `free-programming-books`。

**关键参数**：
- README "Related Projects" 章节
- 不复制内容只互链（避免维护双份）
- awesome-list 标记 `awesome` badge

**最佳实践**：同类项目互链不互抄；联盟式生态（awesome 系列互相引流）；每个 awesome 列表底部固定位置放相关 awesome 链接。

### 模式 14 - 搜索与发现

**问题场景**：3 万行 markdown 文件原生搜索体验差（GitHub search 慢、不支持模糊）。

**解决方案**：
- GitHub 内置 search（按 path / language 过滤）
- 部署的 `https://ebookfoundation.github.io/free-programming-books/` 用 lunr.js 索引
- 第三方工具 `https://www.ossbooks.org/` 镜像搜索

**关键参数**：
- lunr 索引字段：title / author / category
- 模糊搜索 + 自动补全
- 高级搜索语法 `category:python level:beginner`

**最佳实践**：大列表项目考虑外接 Algolia / Meilisearch 全文搜索；本地用 ripgrep `rg -i 'python' books.md`；避免在仓库内建前端工程（加重维护）。

### 模式 15 - 数据导出与 API

**问题场景**：开发者想用编程方式消费这个列表（自己构建"今日推荐书"网站）。

**解决方案**：第三方工具定期拉 markdown → 转换 JSON / SQLite，发布到 npm / github pages。

**关键参数**：
- `free-programming-books.json`（社区维护）
- `books.sqlite`（聚合数据库）
- `https://api.ossbooks.org/v1/books?lang=zh`

**最佳实践**：纯 markdown 不易消费，社区可派生 JSON 镜像；不要主仓加 API（增重维护）；有需求时鼓励派生项目（`free-programming-books-api`）。

---

## 第四段：实战范式

### 模式 16 - 贡献者入职路径

**问题场景**：新人不知怎么贡献（提交格式、哪些书可加）。

**解决方案**：
- `CONTRIBUTING.md` 详细文档
- `good first issue` 标签
- 审核员友好评论（引导而非指责）
- 5 个 PR 后解锁更多权限

**关键参数**：
- 平均首次 PR 响应时间 < 24h
- 评论引导格式（而非 `LGTM`）
- Discord / Slack 社区（部分 OSS）

**最佳实践**：每个 OSS 项目应该有"新人友好"的 1 个入口文档（CONTRIBUTING.md）；第一次 PR 体验决定贡献者去留。

### 模式 17 - 反垃圾与质量

**问题场景**：OSS 大仓库必引来 spam PR（推广自家书 / 链接农场）。

**解决方案**：
- `github-actions[bot]` 自动跑 link quality check
- 维护者人工 review
- Spam PR 标记 `invalid` + 锁定 issue
- `TRIAGE` 角色快速关闭 spam

**关键参数**：
- 黑名单域名列表（spammy hosting）
- PR 模板强制填"为什么这本书值得收录"
- 重复链接检查脚本

**最佳实践**：大仓库 50% PR 是 spam；CI 过滤 80%，人工 review 20%；保护 maintainer 精力是项目长寿关键。

### 模式 18 - 国际化协作

**问题场景**：翻译者来自不同国家，时区不同步，沟通成本高。

**解决方案**：
- 全异步（GitHub PR + 评论）
- 周会（公开 zoom 录屏）
- 文档英文化（让非英语母语者能参与）
- BOT 翻译提醒（英文 PR 触发时 @ 各语言 owner）

**关键参数**：
- 主语言：英语
- 文档：英文 + 部分中文
- 沟通：GitHub Discussions（非实时）
- 工具：`weblate` 协作翻译（部分子项目用）

**最佳实践**：异步为主 + 同步为辅；时区友好（公开会议录屏 + 字幕）；bot 提醒而不是私聊催办。

### 模式 19 - 治理与决策

**问题场景**：项目重大决策（接受哪种语言版本 / 移到 GitHub Org / 加新分类）需要共识。

**解决方案**：
- `GOVERNANCE.md` 公开治理文档
- 公开 RFC（GitHub Discussions → Issue → PR）
- 维护者投票（多数同意）
- 创始人有最终决定权（如 2 票僵局）

**关键参数**：
- 维护者名单 `MAINTAINERS.md`
- 决策日志 `docs/decisions/`
- 投票通过率 2/3

**最佳实践**：治理透明 → 决策可追溯 → 减少争吵；公开 RFC 比私下讨论好；多数同意 + 创始人兜底。

### 模式 20 - 长期可持续性

**问题场景**：OSS 项目 3-5 年后 maintainer 倦怠，PR 堆积，无人回应。

**解决方案**：
- 培养接班人（每个 owner 至少 1 个 co-owner）
- 模块化权限（子目录 owner）
- 定期清理（关闭超 6 月未回复 issue）
- 项目转移（如个人 → Foundation）

**关键参数**：
- 6 月未活动 PR 自动关闭
- 季度健康度报告
- Foundation 接管机制（EbookFoundation）

**最佳实践**：每个 OSS maintainer 都要有"退出计划"；把项目养到 3-5 年后能自运行（不依赖个人）才算成功；商业公司接手（GitHub → Foundation）可延长寿命。
