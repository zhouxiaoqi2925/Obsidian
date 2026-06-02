# expressjs - Express 框架（仓库组织视角）

**GitHub**: expressjs/expressjs.com / expressjs/express
**Star**: 65000+
**语言**: JavaScript
**主题**: Web 框架 / Node.js / 文档治理
**适用场景**: 学习 expressjs 组织治理 / 文档规范 / 多仓库协作

---

## 第一段：基础范式（模式 1-5）

### 模式 1：组织仓库与 monorepo 风格

**问题场景**：Express 框架本体 + 文档站 + 子模块（body-parser/cookie-parser/session/multer 等）散在多 repo，协调麻烦。

**解决方案**：expressjs 组织统一管理 `express` / `expressjs.com` / 各 `*-parser` 子项目，独立发版独立 changelog。`express` 仓作为主仓聚合常用中间件依赖。

**关键参数**：
- `expressjs/express` 框架主仓
- `expressjs.com` 文档
- `pillarjs/*` HTTP utility 集合
- `jshttp/*` 微件库（cookie/etag/qs）

**最佳实践**：学习"组织治理"——独立发版、独立 CHANGELOG、统一 issues 模板；不要 monorepo 强行合并。

### 模式 2：核心依赖拆分哲学

**问题场景**：Express 自身要 200+ 中间件入口，框架本体依赖膨胀。

**解决方案**：每个中间件独立 npm 包（`body-parser` / `cookie-parser` / `morgan` / `serve-static` / `compression` / `cors`），按需引入。Express 自身只保留核心 router / request / response / application。

**关键参数**：
- `jshttp/cookie` / `jshttp/etag` / `jshttp/qs`
- `pillarjs/finalhandler`
- `pillarjs/router`
- `body-parser` 等可选

**最佳实践**：按需装中间件；不用的别装；锁版本到 `^1.0.0` 系列（v4 生态稳定）。

### 模式 3：lib 目录结构

**问题场景**：框架代码组织混乱，新人上手难。

**解决方案**：`lib/express.js` 主入口；`lib/application.js` App 类；`lib/request.js` / `lib/response.js` / `lib/router/`。每个文件单一职责。

**关键参数**：
- `lib/express.js` 工厂
- `lib/application.js` App
- `lib/router/` 路由子系统
- `lib/middleware/` 内置中间件

**最佳实践**：读源码从 `lib/express.js` 入口追；`lib/router/route.js` 是路由核心。

### 模式 4：测试组织

**问题场景**：Node 框架跨 Node 版本测试；CI 矩阵复杂。

**解决方案**：`test/` 目录用 `mocha` + `should.js`；CI 矩阵 `node: 14, 16, 18, 20, 22`；supertest 跑 HTTP。`Makefile` 统一构建。

**关键参数**：
- `test/app.head.js` 头部测试
- `test/app.routes.js` 路由
- `test/req.*.js` / `test/res.*.js` API 覆盖
- `make test` 跑全部

**最佳实践**：CI 必跨 Node 版本；`make test-ci` 含覆盖率；本地 `npm test` 跑当前 Node。

### 模式 5：文档站（expressjs.com）

**问题场景**：框架文档要持续更新，英文/多语言协调难。

**解决方案**：`expressjs.com` 独立仓库 + `gh-pages` 部署；Jekyll 或自定义静态生成；i18n 子目录 `en/` `zh-cn/` `ja/` `es/`。PR 流程独立。

**关键参数**：
- `_includes/` `_layouts/`
- `en/guide/` 指南
- `en/4x/api.md` API 参考
- `zh-cn/` 中文版

**最佳实践**：文档与代码同仓但独立发版；i18n 走 community PR；API 文档从 JSDoc 自动生成。

---

## 第二段：扩展范式（模式 6-10）

### 模式 6：贡献者与治理

**问题场景**：开源框架治理：谁有权 merge？RFC 流程？Code of Conduct。

**解决方案**：expressjs 组织有 TSC（Technical Steering Committee）；`COLLABORATOR.md` 列出 committer；`CONTRIBUTING.md` 写 PR 流程；issue 模板 / 标签体系。

**关键参数**：
- `TSC` 治理
- `Collaborators` 列表
- `Code of Conduct`
- `ROADMAP.md`

**最佳实践**：学习 expressjs 治理——明确 TSC、清晰流程、文档先行；不卡贡献者入门。

### 模式 7：版本与发布

**问题场景**：v4 → v5 升级踩坑；半年/季度发版节奏。

**解决方案**：v4 (2014) 到 v5 (2024) 长期支持；SemVer 严格；CHANGELOG.md 详尽；migration guide 配套。`npm dist-tag` 标 latest/next/beta。

**关键参数**：
- `v4.x` LTS 长期
- `v5.x` 当前
- `next` 标签试用
- `beta` 标签公测

**最佳实践**：升级前看 migration guide；锁定大版本；用 `npm-check-updates` 工具。

### 模式 8：徽章与 CI

**问题场景**：仓库首页看不到 CI 状态 / 覆盖率 / 漏洞。

**解决方案**：README 顶部加 GitHub Actions 徽章 / Coveralls 覆盖率 / David DM / Snyk 漏洞扫描。

**关键参数**：
- `[![Build Status](...)](...)`
- `[![Coverage Status](...)](...)`
- `[![Known Vulnerabilities](...)](...)`
- `[![js-standard-style](...)](...)`

**最佳实践**：README 顶部 3 个徽章内：CI 状态 / 版本 / 许可证；详细徽章在底部。

### 模式 9：CI 工作流

**问题场景**：Express 跨 Node 版本测试；Linux + macOS + Windows 矩阵。

**解决方案**：`.github/workflows/ci.yml` matrix 跨 `ubuntu-latest / macos-latest / windows-latest` + `node-version: [14, 16, 18, 20, 22]`；lint / test / build 三阶段。

**关键参数**：
- `runs-on: ${{ matrix.os }}`
- `node-version: ${{ matrix.node }}`
- `npm ci` 装包
- `npm run lint && npm test`

**最佳实践**：CI 必 lint + test + build；超时 30min；缓存 `~/.npm`。

### 模式 10：安全策略

**问题场景**：开源项目被白帽报告漏洞，私下披露。

**解决方案**：`SECURITY.md` 写明漏洞报告邮箱 / Discord / HackerOne；72h 响应承诺；不发未修复公告前细节。

**关键参数**：
- `SECURITY.md`
- `security@expressjs.com`
- HackerOne 集成
- 修复后 CVE / GHSA 公告

**最佳实践**：所有公开仓库都加 SECURITY.md；不公开 issue 讨论漏洞；定期 npm audit。

---

## 第三段：进阶范式（模式 11-15）

### 模式 11：历史与传承

**问题场景**：Express 2010 由 TJ Holowaychuk 首发，2014 移交 StrongLoop / 2015 移交 Node.js 基金会。

**解决方案**：仓库历史保留；维护者轮换；MIT 许可证不变；社区驱动。多组织接力 `pillarjs/finalhandler` 等子项目。

**关键参数**：
- `History.md` 老 changelog
- 维护者轮换记录
- LICENSE 始终 MIT
- `pillarjs` 转移子项目

**最佳实践**：尊重原作者贡献；不强行 rebrand；维护者轮换是开源长寿关键。

### 模式 12：与 Koa / Fastify 关系

**问题场景**：Express 的"继任者"Koa（同一作者 TJ）2013 发布；Fastify 2016 发布更激进。

**解决方案**：Express 继续维护 v4/v5 兼容生态；Koa 走 async/await 极简；Fastify 走 schema-first 高性能。三者非互斥，按场景选。

**关键参数**：
- Express 4.x 生态最大
- Koa 2.x async-first
- Fastify 4.x 性能优先
- 互不兼容 API 风格

**最佳实践**：Express 学概念/生态；高 QPS 选 Fastify；微服务 Express 仍主流。

### 模式 13：Roadmap 与 RFC

**问题场景**：v5 计划 2024 落地，async/await 原生支持、错误处理改进、HTTP/2 期待。

**解决方案**：`ROADMAP.md` 列版本计划；GitHub Discussions / Issue 标签 `rfc` 走 RFC 流程；`expressjs/discussions` 集中讨论。

**关键参数**：
- `ROADMAP.md`
- `rfc-*` issue 标签
- Discussions 区分类
- 投票 / TSC 决策

**最佳实践**：关注 Express 5 release notes；新特性走 RFC；迁移前看 migration guide。

### 模式 14：性能基准与生态

**问题场景**：Express vs Koa vs Fastify 真实性能差异。

**解决方案**：`nodebench` / `autocannon` 跑基准；Fastify 接近 Hapi 但 API 简单。Express 单核 5k-10k req/s，cluster 后线性扩展。

**关键参数**：
- `wrk -t4 -c100 -d30s`
- `autocannon -c 100 -d 30 http://localhost:3000/`
- `node --prof` profile
- 0x 火焰图

**最佳实践**：生产 Express cluster 8+ worker；中间件按耗时排序；高 QPS 切 Fastify。

### 模式 15：扩展生态

**问题场景**：Express 中间件生态爆炸式增长，质量参差。

**解决方案**：`expressjs` 组织 `pillarjs` / `jshttp` / `body-parser` 系列官方维护；社区优质中间件（`passport` / `helmet` / `cors` / `morgan` / `winston` / `pino` / `joi` / `zod`）。

**关键参数**：
- 官方 50+ 中间件
- 社区 1000+ 中间件
- 维护频率看 commit
- 替代品多

**最佳实践**：优选 expressjs 官方包；社区包看 commit 频率 + 下载量 + CVE。

---

## 第四段：实战范式（模式 16-20）

### 模式 16：迁移到 v5

**问题场景**：v4 升级 v5 行为差异；新特性（async 原生）怎么用。

**解决方案**：v5 默认支持 async/await（不再需要 `express-async-errors`）；`req.params` parser 行为变化；`res.send` 不再默认 200；移除弃用 API。

**关键参数**：
- `npm install express@5`
- `app.get('/', async (req, res) => { ... })` 原生 async
- `res.redirect()` 默认 302
- Path matching 严格化

**最佳实践**：先在测试环境升 v5；跑 `npm outdated` + 测全部中间件；分阶段切流量。

### 模式 17：生产案例

**问题场景**：哪些大公司在用 Express？

**解决方案**：MySpace / PayPal / IBM / Mozilla / Uber / Twitter 部分服务、Netflix 部分、Yandex。Express 适合中小流量 + 快速迭代场景。

**关键参数**：
- 中小到中等流量 < 50k QPS
- 微服务单体都行
- 内部工具首选
- 5k+ 公司使用

**最佳实践**：Express 适合 0-100k QPS 业务；高 QPS 选 Fastify/Go；超大规模 Java/Go。

### 模式 18：故障排查

**问题场景**：Express 进程内存暴涨 / 事件循环卡 / CPU 100%。

**解决方案**：`--inspect` + Chrome DevTools；`clinic.js doctor` 火焰图；`0x` profile；`node --heap-prof` heap dump；Sentry 错误聚合。

**关键参数**：
- `node --inspect app.js`
- `clinic doctor -- node app.js`
- `0x --output profile.log -- node app.js`
- `node --heap-prof app.js`

**最佳实践**：先看 `process.memoryUsage()` + `os.loadavg()`；再 `clinic` 火焰图；最后 heap dump。

### 模式 19：学习路径

**问题场景**：Node 开发者学 Express 路线。

**解决方案**：先学 Node `http` 模块 → 理解 middleware → Express 基础 → 中间件生态 → TypeScript 改造 → 性能调优。配套源码读 `lib/router/route.js` / `lib/application.js`。

**关键参数**：
- Node `http.createServer` 起步
- Express 基础 + 路由
- 中间件组合
- 数据库集成
- 部署运维

**最佳实践**：动手写个 mini-express（300 行）理解 middleware；读官方 `lib/router/` 源码；做 TodoMVC 实战。

### 模式 20：未来趋势

**问题场景**：Express 还值得学吗？会不会被取代？

**解决方案**：Express 仍是 Node 生态入门首选；Fastify 是性能首选；Hono / Elysia（边缘计算）兴起。Express 5 已 async-first 与时俱进。Express 6 路线图：内置 HTTP/2、更强 TypeScript。

**关键参数**：
- Express 5 async 原生
- Express 6 HTTP/2 计划
- Hono 边缘运行时
- NestJS 仍是工程化首选

**最佳实践**：新项目 Express 5 + TypeScript OK；边缘场景选 Hono；性能选 Fastify；企业级 NestJS。
