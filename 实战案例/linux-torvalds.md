# linux-torvalds - Linux 内核工程化配置与元数据快照

**GitHub**: torvalds/linux
**Star**: 185k+
**语言**: C / Rust / 工具链配置
**主题**: dotfile 配置矩阵 / 贡献者元数据
**适用场景**: 多语言 monorepo 工程化配置参考 / 内核贡献者治理 / 工具链标准化

---

## 第一段：基础范式

### 模式 1 - 12 个 dotfile 配置矩阵

**问题场景**：百万行 C 代码、30+ 架构、1.3 万+ 贡献者的 Linux 内核，如何让所有人不靠口头约定就产出风格一致的代码？

**解决方案**：仓库根目录的 12 个 dotfile 是工程纪律的"宪法"：.clang-format 统管 C 风格、.mailmap 归一化作者、.gitattributes 给非文本文件加 diff 驱动、.editorconfig 锁缩进、.rustfmt.toml / .clippy.toml 管 Rust、.cocciconfig 管语义补丁、.pylintrc 管 Python、.kunitconfig 管内核单测。

**关键参数**：
- .clang-format 25KB 定义 200+ 宏的折行规则
- .mailmap 57KB / 942 行合并同一作者多 email
- .gitignore 2.5KB 顶层 + 各子目录模式
- .gitattributes 给 dts / rs 配专属 diff 驱动

**最佳实践**：任何 monorepo 都该抄这 12 个 dotfile，3 天就能搭出 30 年沉淀的工程纪律。

### 模式 2 - .mailmap 作者归一化

**问题场景**：同一个作者在公司用 work@、个人用 gmail@、再加上 Linus 早期用 torvalds@transmeta.com，导致 `git shortlog -s` 出来 5 行重复。

**解决方案**：.mailmap 用 `Proper Name <commit@email.xx> <other@email.yy>` 格式做映射。`git log --use-mailmap`、`git shortlog` 都会自动消费。Linux 的 .mailmap 有 942 行，把 Linus 等核心维护者 30 年的 email 变更全归一。

**关键参数**：
- `<email2> <email1>` 最简形式
- `Name <email2> <email1>` 保留名字
- `Name <email2> Name2 <email1>` 重命名
- `git log --use-mailmap` / `git log --mailmap`

**最佳实践**：CI 里跑 `git log --use-mailmap --format='%ae' | sort -u` 验证归一化完整性。

### 模式 3 - .clang-format C 风格机器化

**问题场景**：内核 4 万提交/年，几十万行 C 代码要保持一致缩进，code review 耗在风格上太浪费。

**解决方案**：.clang-format 用 YAML 描述 BraceWrapping / IndentWidth / ColumnLimit / AlignConsecutiveMacros 等规则。`clang-format -i file.c` 一键重排。内核版规则对 #ifdef / 宏 / 长行有专门处理。

**关键参数**：
- IndentWidth: 8（Tab，K&R 风格）
- ColumnLimit: 100
- AlignConsecutiveMacros: true
- ContinuationIndentWidth: 8

**最佳实践**：PR 提交前 `git diff --name-only | xargs clang-format -i`，reviewer 只看逻辑不看风格。

### 模式 4 - CREDITS 贡献者永久纪念

**问题场景**：贡献者名单散在 30 年 commit 里无法一站式致谢，GPL 协议要求 attributions。

**解决方案**：CREDITS 文件 112KB，按字母排序记录 1.3 万+ 贡献者的"做什么"+"做多久"+"为何离开"。这是内核开发者的"族谱"，每个新贡献者都要被邀请追加。

**关键参数**：
- 文件大小 112KB
- 条目数 1.3 万+
- 顺序按姓名字母
- 字段 Name / email / 角色 / 起始/结束时间

**最佳实践**：每个季度由 maintainer 批量更新一次；新贡献者第一次合并后由 subsystem owner 引导加入。

### 模式 5 - .gitattributes 驱动专属 diff

**问题场景**：dts、Makefile、shell、Python、Rust 的 diff 在 GitHub 上默认高亮不合理，可读性差。

**解决方案**：.gitattributes 用 `*.dts diff=cpp`、`Makefile* diff=make`、`*.rs diff=rust` 等声明把文件类型映射到内置 diff 驱动。GitHub web 端和 `git log --stat` 都会用对应语法高亮。

**关键参数**：
- `* text=auto` 自动 CRLF/LF
- `*.dts diff=cpp`
- `*.rs diff=rust`
- `Documentation/ linguist-documentation`

**最佳实践**：把 .gitattributes 当作"给 GitHub 看的说明书"，结合 .gitignore 形成完整 Git 治理。

---

## 第二段：扩展范式

### 模式 6 - .editorconfig 跨编辑器统一

**问题场景**：VSCode、Vim、Emacs、IntelliJ 各有各的缩进规则，同一个项目里同一份文件被改来改去。

**解决方案**：.editorconfig 用 INI 格式声明 `root=true` / `indent_style=tab` / `indent_size=8` / `end_of_line=lf` / `charset=utf-8` / `insert_final_newline=true` / `trim_trailing_whitespace=true`。所有主流编辑器原生支持。

**关键参数**：
- `root = true`
- `[*]` 通用 + `[*.{c,h}]` 覆写
- `trim_trailing_whitespace = true`
- `max_line_length = off`

**最佳实践**：CI 加 EditorConfig-Check 步骤，PR 不合规直接 fail。

### 模式 7 - .rustfmt.toml 与 .clippy.toml

**问题场景**：内核从 6.1 开始引入 Rust，但 C 习惯深重的内核开发者写出来的 Rust 不像 Rust。

**解决方案**：.rustfmt.toml 控制缩进 / 链式调用 / import 排序。.clippy.toml 配置 clippy lint 等级（如 too_many_arguments / cognitive_complexity 阈值）。两者由 `cargo fmt` / `cargo clippy` 消费。

**关键参数**：
- `max_width = 100`
- `import_granularity = "Crate"`
- `cognitive_complexity_threshold = 30`
- `avoid-breaking-exported-api = true`

**最佳实践**：在内核里启用 `#[allow(clippy::needless_range_loop)]` 风格例外，让 Rust 也能沿用 C 的写法。

### 模式 8 - .cocciconfig 语义补丁引擎

**问题场景**：C 代码搜索替换比 AST 改写更安全，但 sed 又不识别 C 语法。Coccinelle 是内核自研的 C 语法级 diff 工具。

**解决方案**：.cocciconfig 是 Cocci 配置文件，定义 options（timeout / report_mode）。开发者写 .cocci 文件用 SmPL 语言描述模式（如 "替换 mutex_init(lock) 为 mutex_init(lock, flags)"），`make coccicheck` 自动扫描整个内核。

**关键参数**：
- `timeout = 200`
- `report_mode = (chain | context | org | report)`
- `coccinelle = /usr/bin/spatch`

**最佳实践**：批量重构时优先写 .cocci，比手改 PR + review 快 10 倍。

### 模式 9 - .get_maintainer.ignore 名单

**问题场景**：`scripts/get_maintainer.pl` 默认会把所有匹配的人加进抄送，导致核心维护者被淹没在低质量抄送里。

**解决方案**：.get_maintainer.ignore 列出"被忽略"的邮箱或子系统 grep 模式。脚本自动跳过，PR 抄送名单更精准。

**关键参数**：
- 黑名单 email / pattern
- 优先级 subsystem > maintainer > mailing list
- 默认抄送 LKML / linux-kernel@vger.kernel.org

**最佳实践**：小修小补类 PR 只抄送直接 reviewer，不要广播整个 subsystem。

### 模式 10 - .pylintrc 与 .kunitconfig

**问题场景**：内核里 Python 工具（perf 的 trace / bpftool 的 helper / dtc 包装）需要统一风格；内核单测需要最小配置。

**解决方案**：.pylintrc 是 Pylint 配置，控制 `disable=import-error,too-few-public-methods` 等。.kunitconfig 是 KUnit 内核单测框架的配置，写出要跑哪些 test suite。

**关键参数**：
- .pylintrc `max-line-length=100`, `disable=...`
- .kunitconfig `CONFIG_KUNIT=y`, `CONFIG_KUNIT_TEST=y`
- `make defconfig kunitconfig && make -j$(nproc)`

**最佳实践**：CI 跑 `python -m pylint scripts/` 和 `make kunit` 双覆盖。

---

## 第三段：进阶范式

### 模式 11 - monorepo 工程化配置契约

**问题场景**：企业 monorepo 几十种语言、几百个服务，要让所有团队共享工程纪律。

**解决方案**：抄 Linux 的 12 个 dotfile 矩阵：根目录 1 份 + 各语言/服务子目录 1 份覆写。.editorconfig + .clang-format + .rustfmt.toml 覆盖代码风格；.mailmap + CREDITS 治理贡献者；.gitattributes 控 GitHub 显示；.cocciconfig + .kunitconfig 把重构和测试流程化。

**关键参数**：
- 根级通用 + 子目录覆写
- CI 强制一致性检查
- PR 模板引用 dotfile
- README 链入配置说明

**最佳实践**：用 pre-commit hook 在本地提交前跑格式化，零成本守住底线。

### 模式 12 - 工具链消费链

**问题场景**：dotfile 写好没人用等于没写，如何让工具链自动消费？

**解决方案**：编辑器 / IDE 自动读取 .editorconfig；git 命令自动读 .mailmap / .gitattributes；clang-format -i 一行命令重排；Cocci CI 集成；KUnit 走 kernel CI 农场。Linux 专门有 tooling/ 子目录放工具链脚本。

**关键参数**：
- git 内置 .mailmap / .gitattributes
- clang-format .clang-format 自动发现
- pre-commit 框架 .pre-commit-config.yaml
- GitHub Actions .github/workflows/

**最佳实践**：把"格式化"和"lint"做成 GitHub Action 必跑，PR 状态必绿。

### 模式 13 - COPYING 与 LICENSE 元数据

**问题场景**：多许可证项目如何明确每个目录 / 文件的协议？仅靠 LICENSE 顶层文件不够。

**解决方案**：COPYING 是 GPL-2.0 全文。内核子目录还有 LICENSES/ 目录（preffered/preferred 两种命名）放 SPDX 协议短文（如 GPL-2.0.txt、BSD-3-Clause.txt）。`SPDX-License-Identifier: GPL-2.0` 注释直接挂在每个源文件头。

**关键参数**：
- COPYING 全文
- LICENSES/exceptions/
- SPDX 短标识符
- `reuse lint` 工具

**最佳实践**：新文件必须 `/* SPDX-License-Identifier: GPL-2.0 */`，CI 用 `reuse lint` 验证。

### 模式 14 - Documentation 文档入口

**问题场景**：百万行代码如何让新人快速找到入口？Documentation/ 是 Linux 的"门户"。

**解决方案**：Documentation/ 目录约 1 万页 sphinx 文档，admin-guide/ / driver-api/ / userspace-api/ / process/ 四大子目录。process/ 专门给贡献者看（howto / coding-style / submit-checklist / maintainer-handbook）。

**关键参数**：
- Sphinx + reStructuredText
- coding-style.rst Linux 编码规范
- process/submit-checklist.rst 合并前必检
- process/maintainer-handbook.rst

**最佳实践**：新子系统必须配 process/ 子页和 coding-style 自检清单。

### 模式 15 - MAINTAINERS 治理元数据

**问题场景**：1.3 万贡献者、300+ 子系统，谁负责哪块代码？PR 应该抄送谁？

**解决方案**：MAINTAINERS 文件是"代码即治理"的极致。每子系统一段，含 Maintainer / Reviewer / Mailing list / Web / SCM / Files（git 路径 glob）。`scripts/get_maintainer.pl <file>` 根据改动文件自动找负责人。

**关键参数**：
- 段 M / R / L / W / S / F
- F: drivers/net/ethernet/intel/
- L: netdev@vger.kernel.org
- T: git://git.kernel.org/...

**最佳实践**：改 MAINTAINERS 时用 `MAINTAINERS` patch + 自我标注，PR 自动化最严。

---

## 第四段：实战范式

### 模式 16 - 多语言 monorepo 复用模板

**问题场景**：AI 直播平台项目用 React + Go + Python + K8s YAML，如何继承 Linux 的工程纪律？

**解决方案**：在 monorepo 根目录放 12 个 dotfile，subtree 各自加 .editorconfig 覆写。前端用 .prettierrc + .eslintrc，后端用 .golangci.yml，Python 用 pyproject.toml。文档放 docs/ 用 mkdocs 编译。LICENSE 多协议时用 LICENSES/ + SPDX 头。

**关键参数**：
- 根 dotfile + 子目录覆写
- 前端 / 后端 / AI 各自 lint
- .pre-commit-config.yaml 触发
- CI 三段：format / lint / test

**最佳实践**：写一个 `scripts/format.sh` 一键跑全栈格式化，复用工具链。

### 模式 17 - 贡献者治理流程

**问题场景**：开源项目要怎么持续欢迎新人、致谢老人？

**解决方案**：CREDITS 模式 + .mailmap 模式 + Code of Conduct 模式。新人合并首 PR 后由 maintainer 引导加 CREDITS。定期（季度 / 年度）发 contributor-award。内部用 email 矩阵 + Slack 群双轨。

**关键参数**：
- CREDITS 月度维护
- CoC 文件引用 Contributor Covenant
- 新人导师制
- 年报致谢

**最佳实践**：第一次合并后 24 小时内由 subsystem owner 发感谢 PR，自动加入 CREDITS。

### 模式 18 - 工具链升级与废弃

**问题场景**：Linux 7.x 已弃用 .get_maintainer.ignore 改用内置机制；6.x 引入 .rustfmt.toml。如何平滑升级？

**解决方案**：每个 minor 版本 release notes 列出新增 / 废弃 dotfile。在 .github/workflows/ 跑 `tools/check-config.sh` 验证 dotfile 版本。重大变更走 deprecation period（一般 2 个 LTS）。

**关键参数**：
- release notes 索引 dotfile 变更
- CI 工具脚本验证
- deprecation period = 2 LTS
- 主线先灰度

**最佳实践**：把 dotfile 视作"软 API"，变动必须经过 deprecate → warn → remove 三阶段。

### 模式 19 - 文档即代码

**问题场景**：传统 README 写完就过期，配置变更没人同步文档。

**解决方案**：把 Documentation/ 当源码一样 CI 编译。Sphinx + ReadTheDocs 自动部署。文档引用 dotfile 路径必须经过 linkchecker 验证。code-of-conduct / contributing / security 三件套放仓库根。

**关键参数**：
- Sphinx / mkdocs / Docusaurus
- ReadTheDocs / GitHub Pages
- `mkdocs build --strict` 失败即阻断
- linkchecker / lychee

**最佳实践**：配置变更是文档变更的 trigger，PR 模板里勾选"是否需要同步文档"。

### 模式 20 - 元数据仓库的"可机读契约"

**问题场景**：12 个 dotfile 是给人看的，但 30+ 子系统治理要"机器也能消费"。

**解决方案**：把 dotfile 解析为 JSON Schema 或 Protobuf，CI 校验合法性。CodeQL 跑配置静态分析。OSSF Scorecard 评治理分。内部 dashboard 拉 dotfile 生成"工程健康度"指标。

**关键参数**：
- JSON Schema for .clang-format
- CodeQL 查询
- OSSF Scorecard
- 内部治理 dashboard

**最佳实践**：dotfile 改造为"可机读 + 可被工具消费"，让工程纪律真正自动化。
