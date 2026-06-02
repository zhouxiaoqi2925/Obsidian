# jhipster - 全栈应用代码生成器

**GitHub**: jhipster/generator-jhipster
**Star**: 22k+
**语言**: TypeScript
**主题**: code-generator / yeoman / blueprint / jdl-dsl / spring-boot
**适用场景**: Spring Boot 后端 + Angular/React/Vue 前端全栈脚手架 / 企业级应用生成

---

## 第一段：基础范式

### 模式 1 - Yeoman Generator 5 阶段生命周期

**问题场景**：代码生成器要按固定顺序"问用户 → 加载配置 → 写文件 → 装依赖"，框架定 lifecycle、业务填内容才能让 50+ generator 协作。JHipster 基于 Yeoman，每个 generator 5 阶段。

**解决方案**：`generators/app/generator.ts` 继承 `BaseApplicationGenerator`。`get [BaseApplicationGenerator.INITIALIZING]()` 返 `asInitializingTaskGroup({ validateNode, checkForNewJHVersion, validate })`。`get [BaseApplicationGenerator.PROMPTING]()` 返 `asPromptingTaskGroup({ askForApplicationType, askForModuleName })`。`get [BaseApplicationGenerator.WRITING]()` 返 `asWritingTaskGroup({ writeFiles, customizeFiles })`。

**关键参数**：
- `initializing` 加载状态 + 检查版本 + 读 `.yo-rc.json`
- `prompting` 问用户（inquirer）
- `configuring` 合并 config + 修默认值
- `writing` 写文件（template 渲染）
- `install` 装依赖（npm/yarn/mvn）

**最佳实践**：框架定 lifecycle + 业务填内容是代码生成器范本；5 阶段分明单阶段可测；用 `asInitializingTaskGroup` 把多个 task 串成一个组；任何"代码生成器 / scaffolding"项目可借鉴；blueprint 可 hook 任意阶段。

### 模式 2 - Blueprint 协议（composeWithBlueprints + delegateTasksToBlueprint）

**问题场景**：JHipster 团队无法覆盖所有企业需求；用户要 fork 主仓库又失去升级能力。Blueprint 协议让外部团队替换任意 generator、覆盖任意 task，不需要 fork 主仓库。这是"开源核心 + 商业扩展"的标准范式。

**解决方案**：`generators/app/generator.ts` 的 `beforeQueue()` 走 `await this.composeWithBlueprints()` + `await this.dependsOnBootstrap('app')`。`get [BaseApplicationGenerator.INITIALIZING]()` 返 `delegateTasksToBlueprint(() => this.initializing)`。Blueprint 注入方式：`package.json` 标 `"jhipster-blueprint": true` + `"generators": { "app": "generators/app/index.js" }`。

**关键参数**：
- `composeWithBlueprints` 加载外部 blueprint
- `delegateTasksToBlueprint` 委托 task
- `jhipster-blueprint: true` package.json 标记
- `blueprint` 命令装 blueprint

**最佳实践**：开源核心 + 商业扩展是健康生态模式；blueprint 可覆盖任意 task 无需 fork；任何"产品 + 扩展"项目可借鉴；blueprint 注入用 package.json 约定；主项目与 blueprint 独立发版。

### 模式 3 - JDL 自研 DSL

**问题场景**：手动 `jhipster entity` 一次次回答问题慢 + 易错。JDL（JHipster Domain Language）自研 DSL 一次性描述所有 entity + 关系 + 选项。JDL 是纯文本，可 git diff、可 code review。

**解决方案**：`test.jdl` 范例：`entity Customer { firstName String required maxlength(50), lastName String required maxlength(50), email String required unique maxlength(100) }`。`entity Order { orderDate ZonedDateTime required, status OrderStatus required }`。`enum OrderStatus { PENDING, CONFIRMED, SHIPPED, DELIVERED }`。`relationship OneToMany { Customer{orders} to Order{customer} }`。`paginate Customer with pagination(20)` + `service Customer with serviceClass`。

**关键参数**：
- `entity` 实体声明
- `relationship` 关系（OneToMany/ManyToOne/OneToOne/ManyToMany）
- `enum` 枚举类型
- `paginate` 分页策略
- `service` service 层策略

**最佳实践**：DSL 把业务模型提到代码之上；纯文本 → git diff + code review 友好；任何"领域建模"项目可借鉴；JDL Studio 在线编辑器实时校验；批量生成比手动快 100 倍。

### 模式 4 - Task Group 组合

**问题场景**：每个 generator 阶段有 3-10 个 task，手动串行执行易遗漏 + 难调试。JHipster 用 task group 把多个 task 包装成一个 group，Yeoman 按顺序执行。

**解决方案**：`generators/common/task-type-inference.ts` 的 `asInitializingTaskGroup(tasks: Record<string, TaskFunction>): TaskFunction` = `Object.entries(tasks).reduce((chain, [name, fn]) => async () => { await chain(); await fn(); }, async () => {})`。Task 名 → 自动推断类型（反射魔法）。`dependsOnBootstrap` bootstrap 依赖。

**关键参数**：
- `asInitializingTaskGroup` 包装 initializing tasks
- `asPromptingTaskGroup` 包装 prompting tasks
- `asWritingTaskGroup` 包装 writing tasks
- `delegateTasksToBlueprint` 委托给 blueprint
- Task 名自动推断类型

**最佳实践**：Task Group 模式比"裸 chain"更声明式；Blueprint 协议让 task 可重写；任何"workflow engine / pipeline"项目可借鉴；Task 名自动推断类型是反射魔法；调试时可单 task 跑。

### 模式 5 - 3 个泛型分离（CommonEntity / CommonApplication / CommonConfig）

**问题场景**：JHipster 把"项目元数据"类型化避免字符串拼接，但多 frontend（Angular/React/Vue）+ 多 build tool（Maven/Gradle）+ 多 db 组合爆炸。3 个泛型分离 entity 集合 / app 配置 / config 键。

**解决方案**：`class AppGenerator extends BaseApplicationGenerator<CommonEntity, CommonApplication, CommonConfig>`。`get application(): CommonApplication` 返 `{ baseName: 'myApp', packageName: 'com.example', authenticationType: 'jwt' }`。`CommonEntity` entity 集合类型 `{name, fields, relationships}`。`CommonApplication` app 配置。`CommonConfig` config 键枚举。

**关键参数**：
- `CommonEntity` entity 集合类型
- `CommonApplication` app 配置
- `CommonConfig` config 键枚举
- `BASE_NAME` / `PACKAGE_NAME` config 键
- `as const` 让 enum 字面量类型安全

**最佳实践**：3 泛型分离避免组合爆炸；类型化 config key 减少拼写错误；任何"多配置 + 多维度"项目可借鉴；`as InitializingTaskGroup` 配合泛型推断；`as const` 让 enum 字面量类型安全。

---

## 第二段：扩展范式

### 模式 6 - CLI 启动管线（cli.ts → program.ts → runJHipster）

**问题场景**：JHipster CLI 启动要：Node 版本检查 → 命令注册 → Yeoman 环境构建 → 子命令路由。3 层职责分明才能让扩展点稳定。

**解决方案**：`cli/cli.ts` 节选：`import semver from 'semver'` + `import {packageJson}` + `import {runJHipster}` + `const currentNodeVersion = process.versions.node`。`if (!process.argv.includes('--skip-checks') && !semver.satisfies(currentNodeVersion, minimumNodeVersion)) { logger.fatal(...) }`。`export default runJHipster().catch(done)`。3 层：cli.ts（35 行）+ program.ts（100+ 行）+ runJHipster。

**关键参数**：
- `cli.ts` Node 版本检查 + 启动 35 行
- `program.ts` 命令注册 100+ 行
- `runJHipster` 启动 Yeoman Env 主调度
- `--skip-checks` 跳过 CI
- `unhandledRejection` 兜底

**最佳实践**：Node 版本 fast-fail 避免跑 10 分钟后才发现 ESM 失败；`runJHipster().catch(done)` Promise 链统一处理；`unhandledRejection` 兜底；任何"CLI 工具"项目可借鉴；跳过检查 `--skip-checks` 留给 CI。

### 模式 7 - Command 注册中心

**问题场景**：JHipster 50+ 子命令（`app` / `entity` / `spring-boot` / `angular` / `k8s` / `docker` / `ci-cd` / `jdl`），手写 if-else 不行。Yeoman 命令注册中心 + blueprint 协议让命令可扩展。

**解决方案**：`cli/program.ts` 的 `BuildCommands` 类型：`program: () => 'jhipster' | 'jhipster:*'` + `commands: Record<string, Command>` + `envBuilder?: () => Promise<Environment>` + `env?: (env: Environment) => Environment`。`commands` 对象：`app: {generatorName: 'app', help: 'Generate a JHipster application'}` + `entity: {generatorName: 'entity', help: 'Generate entities from a JDL file'}` + `kubernetes: {generatorName: 'kubernetes', help: 'Generate K8s manifests'}`。blueprint 可注入新命令。

**关键参数**：
- `app` 生成项目骨架
- `entity` 单个 entity 交互式
- `jdl` 从 JDL 批量生成
- `kubernetes` K8s manifest
- `ci-cd` CI/CD 配置
- `docker` Docker 配置

**最佳实践**：命令注册中心比 if-else 可维护；每个命令挂 `generatorName` 链 Yeoman；blueprint 可注入新命令；任何"CLI + 多子命令"项目可借鉴；`printJHipsterLogo()` 加 CLI 美学。

### 模式 8 - Entity Generator + CRUD 模板渲染

**问题场景**：Entity 是 JHipster 核心——一个 entity = 多个文件（后端 entity/repo/service/controller/前端 list/edit/form）。Entity generator 自动生成全套 CRUD 文件。

**解决方案**：`generators/entity/prompts.ts` 的 `askForMicroserviceJson: PromptingTask`。`id: 'microservice'` + `prompt: async (ctx: any): Promise<void> => { if (ctx.applicationConfiguration.microserviceName) { ctx.microserviceName = ctx.applicationConfiguration.microserviceName } }`。DB 类型到字段类型映射：SQL = BIG_DECIMAL/BOOLEAN/DOUBLE/INTEGER/LONG/STRING/UUID；MongoDB = STRING/INTEGER/BOOLEAN/INSTANT/BINARY/OBJECT_ID。

**关键参数**：
- SQL BIG_DECIMAL/BOOLEAN/DOUBLE/INTEGER/LONG/STRING/UUID
- MongoDB STRING/INTEGER/BOOLEAN/INSTANT/BINARY
- Cassandra UUID/STRING/INTEGER/BIG_DECIMAL
- 通用 ENUM/LOCAL_DATE/ZONED_DATE_TIME

**最佳实践**：一个 entity → 完整 CRUD 全套；DB 类型 → 字段类型映射；任何"CRUD 代码生成"项目可借鉴；单 entity 模式（`jhipster entity`）+ 批量模式（`jhipster jdl`）；`.yo-rc.json` 跨多次运行保持状态。

### 模式 9 - .yo-rc.json 状态文件

**问题场景**：JHipster 一次生成 30+ 个文件，用户分多次跑（先 app，后加 entity）。`.yo-rc.json` 记录所有 generator 的 config，跨多次运行保持状态。

**解决方案**：`.yo-rc.json` 范例：`{ "generator-jhipster": { "applicationType": "monolith", "baseName": "myApp", "packageName": "com.example.myapp", "authenticationType": "jwt", "databaseType": "sql", "prodDatabaseType": "postgresql", "clientFramework": "angular" } }`。`applicationType` = monolith/microservice/gateway。`authenticationType` = jwt/oauth2/session。`databaseType` = sql/mongodb/cassandra/...。

**关键参数**：
- `applicationType` monolith/microservice/gateway
- `baseName` 项目名
- `packageName` Java 包名
- `authenticationType` jwt/oauth2/session
- `databaseType` sql/mongodb/cassandra/...

**最佳实践**：`.yo-rc.json` 是 Yeoman 状态惯例；跨多次运行保持避免重复回答；blueprint 可读写 `.yo-rc.json` 共享 state；任何"长流程 + 多次交互"项目可借鉴；JHipster 所有 generator 共享这一份。

### 模式 10 - Spring Boot Generator + 50+ 后端模板

**问题场景**：Spring Boot 项目从 0 到 dev server 要 50+ 文件（Application.java / Entity / Repository / Service / Controller / config / pom.xml / application.yml）。Spring Boot generator 自动渲染全部。

**解决方案**：`generators/spring-boot/files.ts` 的 `writeFiles`：`this.writeFile('pom.xml', template('pom.xml.ejs'))` + `this.writeFile('src/main/java/{package}/Application.java', template('Application.java.ejs'))` + `this.writeFile('src/main/java/{package}/domain/{entity}.java', template('Entity.java.ejs'))` + `this.writeFile('src/main/java/{package}/repository/{Entity}Repository.java', template('Repository.java.ejs'))` + `this.writeFile('src/main/java/{package}/web/rest/{Entity}Resource.java', template('Resource.java.ejs'))`。EJS / Handlebars 模板 + 变量插值。

**关键参数**：
- `pom.xml` Maven 依赖
- `Application.java` Spring Boot 启动
- `{Entity}.java` 实体
- `{Entity}Repository.java` JPA Repository
- `{Entity}Service.java` 业务逻辑
- `{Entity}Resource.java` REST Controller
- `application.yml` 配置

**最佳实践**：单 generator 渲染 50+ 文件；EJS / Handlebars 模板 + 变量插值；任何"企业脚手架"项目可借鉴；模板按职责分目录；Spring Boot 3 + Java 21 是当前基线。

---

## 第三段：进阶范式

### 模式 11 - Template 编译缓存

**问题场景**：生成 30+ 文件 = 30+ 模板渲染，每个模板编译 5ms × 30 = 150ms。JHipster 用 EJS 模板对象缓存，一次编译 + 多次渲染。

**解决方案**：`generators/server/files.ts` 的 `template(name: string)`：`const templateCache = new Map<string, ejs.TemplateFunction>()` + `if (templateCache.has(name)) return templateCache.get(name)!` + `const path = join(TEMPLATES_DIR, name)` + `const source = readFileSync(path, 'utf-8')` + `const compiled = ejs.compile(source, {filename: path})` + `templateCache.set(name, compiled)`。缓存失效：mtime 变化。

**关键参数**：
- `templateCache` 模板对象 Map
- `ejs.compile` 编译模板
- 缓存 key 文件路径
- 缓存失效 mtime 监听
- 启动延迟 < 50ms

**最佳实践**：模板对象缓存比每次 parse 快 10x；任何"模板渲染密集"项目可借鉴；EJS / Handlebars 都支持此模式；大模板（>1KB）收益更明显；配合 mtime 失效保证正确性。

### 模式 12 - JDL Parser 流式处理

**问题场景**：大 JDL 文件（1000+ entity）一次性 parse 内存爆。JDL parser 用 lexer + parser + converter 三阶段流式处理。

**解决方案**：`lib/jdl/readers/jdl-reader.ts` 的 `JDLReader`：`static readFile(file: string): JDLObject { const content = readFileSync(file, 'utf-8'); const lexed = JDLTokenizer.tokenize(content); const parsed = JDLParser.parse(lexed); return JDLConverter.convertFromJDLToJDLObject(parsed) }`。`readFiles(files: string[]): JDLObject` reduce + `mergeJDLObjects` 合并多个 JDL。

**关键参数**：
- `JDLTokenizer` 词法分析（流式）
- `JDLParser` 语法分析（recursive descent）
- `JDLConverter` AST → JDLObject
- `mergeJDLObjects` 多 JDL 合并
- 错误信息带行号 + 列号

**最佳实践**：lexer + parser + converter 三段式；流式处理避免一次性加载；任何"DSL / 自研语法"项目可借鉴；JDL Studio 在线预览实时校验；错误信息要带行号 + 列号。

### 模式 13 - Worker 并行 Generator

**问题场景**：app generator + entity generator + k8s generator + docker generator 串行跑 5 分钟。Yeoman 5+ 支持 generator 并行/串行声明，独立 generator 并行跑省 50%。

**解决方案**：`generators/app/generator.ts` 的 `beforeQueue()`：`await this.composeWithBlueprints()` + `await this.dependsOnBootstrap('app')` + `await Promise.all([this.composeWith('docker', {force: false}), this.composeWith('ci-cd', {force: false})])`。`composeWith` 串行，`composeWith + Promise.all` 并行。共享 state 的不能并行。

**关键参数**：
- `composeWith` 串行触发
- `composeWith + Promise.all` 并行触发
- `dependsOnBootstrap` bootstrap 依赖
- 限制共享 state 不能并行
- 任务粒度不能太细

**最佳实践**：独立 generator 可并行；任何"task pipeline"项目可借鉴；共享 state 必串行；任务粒度不能太细；调试时强制串行。

### 模式 14 - Sample 集成测试 + 16 矩阵每日构建

**问题场景**：4 frontend × 4 db × 2 build tool = 32 组合，JHipster 团队 16 矩阵每日构建。保证新 generator 改动不破坏任意组合的生成项目能跑。

**解决方案**：`test-integration/` 目录结构：`samples/app-angular-postgresql-maven/` + `samples/app-angular-mysql-gradle/` + `samples/app-react-mongodb-maven/` + `samples/app-vue-cassandra-gradle/` + `matrix.sh` 跑 16 矩阵 + `run_all.sh` 全部跑。CI 跑 + nightly 跑 + SonarQube 静态分析。

**关键参数**：
- Frontend Angular / React / Vue / 无
- Database PostgreSQL / MySQL / MongoDB / MariaDB
- Build tool Maven / Gradle
- Auth JWT / OAuth2 / Session

**最佳实践**：16 矩阵每日构建 = 多维度兼容性保障；任何"多配置组合"项目可借鉴；Sample 项目要能真实启动（不只是生成）；CI 跑 + nightly 跑；SonarQube 跑静态分析。

### 模式 15 - JHipster IDE 插件

**问题场景**：JHipster 在终端跑，用户要切到 IDE 看生成项目。JHipster IDE 插件把 generator 入口搬到 IDE：IntelliJ + VSCode 集成。

**解决方案**：IDE 插件集成点：菜单项 Generate JHipster + JDL 编辑器（语法高亮 + 校验）+ Blueprint 检测 + `.yo-rc.json` 可视化编辑 + 生成后自动打开项目。IntelliJ JHipster UML Plugin：UML → JDL 转换。VSCode JHipster Extension：JDL 语法高亮 + 跑命令。JDL Studio jdl-studio.netlify.app 在线编辑器。

**关键参数**：
- IntelliJ JHipster UML Plugin
- VSCode JHipster Extension
- JDL Studio jdl-studio.netlify.app
- 自动检测 blueprint + .yo-rc.json

**最佳实践**：IDE 插件降低用户切换成本；JDL 语法高亮 + 校验是核心；任何"DSL 工具"项目可借鉴 IDE 集成；JDL Studio 在线版免装；自动检测 blueprint + `.yo-rc.json`。

---

## 第四段：实战范式

### 模式 16 - SonarQube 质量门禁

**问题场景**：JHipster 22k+ Star 是企业级项目，质量问题会被放大。JHipster 用 SonarQube 质量门禁：覆盖率 80%+、零 blocker 漏洞、零 code smell。

**解决方案**：`sonar-project.properties`：`sonar.projectKey=jhipster` + `sonar.organization=jhipster` + `sonar.sources=generators,cli,lib` + `sonar.tests=__tests__,test` + `sonar.javascript.lcov.reportPaths=coverage/lcov.info` + `sonar.qualitygate.wait=true`。指标：覆盖率 80%+ / 重复代码 <3% / 复杂度平均 5 以下 / Blocker 漏洞 0 / Code smell <50。

**关键参数**：
- 覆盖率 80%+
- 重复代码 <3%
- 复杂度 平均 5 以下
- Blocker 漏洞 0
- Code smell <50

**最佳实践**：质量门禁 = 强制基线；任何"严肃开源"项目可借鉴；SonarQube 比 Codecov 维度更全；配合 PR review 人工 review；SonarCloud 免费版够用。

### 模式 17 - JDL Studio 在线 DSL 编辑器

**问题场景**：用户写 JDL 没 IDE 插件就没语法高亮 + 实时校验。JDL Studio 是在线 Web 编辑器：左侧写 JDL，右侧实时预览生成的 entity 模型。

**解决方案**：JDL Studio 架构：Monaco Editor（VSCode 同款）+ JDL 词法分析（前端 ANTLR）+ 实时校验 + 预览 entity 表 + 导入 `.yo-rc.json` + 导出 JDL 文件 + 分享 URL 带 hash。语法高亮 JDL 关键字 + 类型 + 实时校验语法 + 关系合法性 + 导入/导出 `.yo-rc.json` ↔ JDL。

**关键参数**：
- Monaco Editor VSCode 同款
- 实时校验语法 + 关系合法性
- entity 预览表格可视化
- 导入/导出 .yo-rc.json ↔ JDL
- 分享 URL 带 hash

**最佳实践**：在线 DSL 编辑器 = 零装门槛；Monaco Editor（VSCode 同款内核）；任何"DSL 工具"项目可借鉴；实时校验提升用户效率；分享 URL 便于协作。

### 模式 18 - JHipster Limited 商业支持

**问题场景**：JHipster 是 Apache 2.0 协议免费，但企业用户要 SLA 保障 + 培训。JHipster Limited 商业模式：订阅 + 培训 + 商业支持。开源 + 商业并存的标准范式。

**解决方案**：开源（Apache 2.0）：主仓库 jhipster/generator-jhipster + 22k+ Star + 社区贡献。商业（JHipster Limited）：订阅（技术支持）+ 培训（Workshop）+ 咨询（架构设计）+ 企业 Blueprint + Premium 模板。商业服务反哺开源。Open Collective 透明资金。

**关键参数**：
- 订阅 优先 issue 响应 + 24h SLA
- 培训 2-5 天 Workshop
- 咨询 架构 + 性能 + 安全
- Blueprint 企业定制 generator

**最佳实践**：开源核心 + 商业服务 = 健康生态；任何"开源 + 商业"项目可借鉴；商业服务反哺开源开发；Open Collective 透明资金；培训 + 咨询是稳定收入。

### 模式 19 - K8s + Docker + CI/CD Generator 全套 DevOps

**问题场景**：生成 Spring Boot 项目后，用户还要自己写 Dockerfile / k8s manifest / GitHub Actions。JHipster 的 `docker` / `kubernetes` / `ci-cd` generator 一次性输出全套 DevOps 配置。

**解决方案**：`generators/docker/files.ts` 的 `writeFiles`：`this.writeFile('Dockerfile', template('Dockerfile.ejs'))` + `this.writeFile('docker-compose.yml', template('docker-compose.yml.ejs'))` + `this.writeFile('docker-compose.prod.yml', template('docker-compose.prod.yml.ejs'))` + `this.writeFile('.dockerignore', '.git\nnode_modules\ntarget\n')` + `this.writeFile('sonar.yml', template('sonar.yml.ejs'))`。

**关键参数**：
- `docker` Dockerfile + docker-compose.yml
- `kubernetes` K8s manifest (Deployment/Service/Ingress)
- `ci-cd` GitHub Actions / GitLab CI / Jenkins
- `heroku` heroku.yml + Procfile
- `aws` CloudFormation template

**最佳实践**：DevOps 配置也是代码 → 模板化；一个项目 → 一份完整 DevOps 配置；任何"脚手架"项目可借鉴；多 CI 平台支持（GitHub Actions / GitLab / Jenkins）；配合 JHipster Registry 服务发现。

### 模式 20 - JHipster 治理 + RFC + Gitter 社区

**问题场景**：22k+ Star 的全栈生成器，多 frontend + 多 db + 多 build tool 复杂度高，需要健康治理。JHipster 核心团队 10+ 维护者 + RFC 流程 + Gitter 社区。

**解决方案**：治理：Julien Dubois 创始人 + 核心团队（10+ 维护者，跨公司志愿者）+ Open Collective 赞助 + Apache 2.0 协议。流程：RFC（GitHub Discussions rfc 标签）+ TSC 评审 + good first issue（新手友好）+ Bug Bash（社区活动）。沟通：Gitter + Stack Overflow + GitHub Issues + Twitter @jhipster。

**关键参数**：
- 维护者 10+
- Star 22k+
- 月下载 3 万
- License Apache 2.0
- 主仓库 jhipster/generator-jhipster

**最佳实践**：跨公司核心团队 = 抗单点；RFC 流程让大变更先讨论；`good first issue` 降低贡献门槛；任何"开源大项目"可借鉴此治理；多渠道沟通 Gitter + Stack Overflow + GitHub。
