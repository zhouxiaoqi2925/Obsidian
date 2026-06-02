# nestjs-official - NestJS v11 周期增量测试快照

**GitHub**: https://github.com/nestjs/nest
**Star**: 70k+
**语言**: TypeScript
**主题**: Node.js 框架 / 增量测试 / v11 周期
**适用场景**: 同一仓库不同 commit 对比、测试驱动开发参考、回归验证

## 第一段：基础范式

### 模式 1: 同源仓库多时间点快照
**问题场景**：开发时常常需要"两个 commit 之间到底变了什么"，但 git log 又把过程态全暴露，难以做"基线对比"。
**解决方案**：nestjs-official 是 nestjs-nest 仓库 v11.1.10 的另一个时间点快照，与 nestjs-nest 100% 同源（同一远程、同一 commit hash），唯一区别是本地多了一个 `validate-module-keys.util.spec.ts` 测试文件。这种"delta snapshot"模式可作为对比基线。
**关键参数**：
- 远程仓库：https://github.com/nestjs/nest
- 锁定版本：v11.1.10
- 增量文件：1 个 spec 文件
- 配套主文件：validate-module-keys.util.ts（已存在）
**最佳实践**：在大项目里维护"v10-baseline / v11-snapshot / main"三个常驻分支，方便回归对比。

### 模式 2: validateModuleKeys 工具函数
**问题场景**：NestJS Module 的元数据 imports / controllers / providers / exports 都是对象数组，键名拼错（如 import 写成 imports）只在运行时才发现。
**解决方案**：`packages/common/utils/validate-module-keys.util.ts` 导出 `validateModuleKeys(rawModule)`，在 Scanner 实例化模块前对 `rawModule` 顶层键做白名单校验，发现非法键抛 `InvalidModuleException`，错误信息明确指出"哪个字段不是合法 module key"。
**关键参数**：
- 合法键：imports / controllers / providers / exports
- 自定义字段：把用户数据挂 globalThis? 不行
- 错误抛出：InvalidModuleException
- 触发时机：ModuleFactory.create()
**最佳实践**：框架层用 validateXxx 工具守门，比下游类型错误早一个堆栈。

### 模式 3: 配套 spec 测试
**问题场景**：工具函数加上去后，怎么证明它真的报错而不是 silent pass？
**解决方案**：`validate-module-keys.util.spec.ts` 写 4 类用例：合法键全过、非法键抛异常、嵌套对象深检、错误信息包含字段名。Jest `it / expect().toThrow(InvalidModuleException)`。
**关键参数**：
- 用例数：~6 条
- 覆盖：合法 / 非法 / 嵌套 / 错误信息
- jest.config.js 配 ts-jest
- `npm run test:unit`
**最佳实践**：工具函数 100% 单测覆盖；每次重构跑一次回归。

### 模式 4: 测试金字塔
**问题场景**：测试金字塔顶层 e2e 慢、中间集成测试脆，单元测试往往被忽略。
**解决方案**：Nest 官方同时维护 unit（packages/*/test/）、integration（integration/）、e2e（e2e/）三层。validateModuleKeys 这种纯函数走 unit；涉及 DI 容器的走 integration；走 HTTP 的走 e2e。
**关键参数**：
- unit：纯函数 + 工具类
- integration：模块装配 + Provider
- e2e：完整 HTTP + DB
- 覆盖率：unit > 80%
**最佳实践**：CI 三段独立并行，unit 必须 30s 内出结果。

### 模式 5: jest 配置与 ts-jest
**问题场景**：TypeScript 项目直接跑 jest 会因 .ts 编译失败。
**解决方案**：jest.config.js 用 ts-jest preset，testMatch 指定 `**/*.spec.ts`，setupFilesAfterEach 加载 reflect-metadata。`npm run test:cov` 输出 lcov 上传 codecov。
**关键参数**：
- preset: ts-jest
- testEnvironment: node
- roots: ['packages']
- coverageThreshold: { global: { lines: 80 } }
**最佳实践**：jest 配置和 tsconfig 分清职责，jest 只管运行，tsc 只管类型。

## 第二段：扩展范式

### 模式 6: 增量 commit 的可追溯性
**问题场景**：NestJS 一次 PR 改 100 文件，代码 review 看不完。
**解决方案**：单文件 PR（仅 +1 spec）让 reviewer 30 秒理解意图，CC 简化（仅维护者 + 1 同行）。Linus 内核有"single purpose patch"传统，NestJS 这种"工具函数 + 测试"的同 commit 也符合。
**关键参数**：
- 单 commit / 单 file
- reviewer 数量小
- 描述里写明"测试 validateModuleKeys 工具"
- 对应 issue 链接
**最佳实践**：PR 描述写"WHY this change"，而不是"WHAT changed"。

### 模式 7: 工具函数 spec 模板
**问题场景**：每个 util 写 spec 都要重新想"测什么"，团队风格不一。
**解决方案**：Nest 风格 spec 模板：describe(name) → describe('合法输入')/describe('非法输入')/describe('边界') → 多个 it。每个 it 一行 expect，错误信息自描述。
**关键参数**：
- 命名：被测文件名.spec.ts
- describe 三段：合法 / 非法 / 边界
- 一行一个断言
- 错误信息含 input 和 expected
**最佳实践**：util 测试先于实现写（TDD），先 red 后 green。

### 模式 8: 错误信息工程
**问题场景**：抛 `throw new Error('invalid')` 是反人类，IDE 点不到错在哪。
**解决方案**：`InvalidModuleException` 继承自 Nest 框架异常基类，错误信息带字段路径（`Module key "controllerss" is not allowed`），还指引合法 key 列表。
**关键参数**：
- 自定义异常继承 BuiltInException
- 错误信息含字段名 + 合法值
- 框架层 vs 业务层异常分离
- `getErrorMessage()` 标准化
**最佳实践**：错误信息三段式：What happened / Why / How to fix。

### 模式 9: 反射元数据 + 工具校验
**问题场景**：运行时元数据可能脏、可能缺、可能拼错，单靠 TS 编译期不够。
**解决方案**：reflect-metadata 写入的设计时元数据 + validateModuleKeys 校验运行期键名 + 自定义 Guard 校验权限元数据。形成"TS 编译 → TS 类型 → 运行时校验"三道防线。
**关键参数**：
- TS 编译：类型
- Reflect.metadata：装饰器键
- validateModuleKeys：模块键
- @SetMetadata：自定义元数据
**最佳实践**：不要相信任何"前端已经校验过了"，后端一定要再校验。

### 模式 10: v11 周期特性对齐
**问题场景**：v11 相对 v10 引入了多少破坏性变更？文档没明示。
**解决方案**：diff nestjs-nest（v10）vs nestjs-official（v11.1.10）即可看到：standalone application、GraphQL Federation、SQL 模板等。validate-module-keys.spec.ts 属于"小修小补"档。
**关键参数**：
- v10 → v11 breaking changes
- standalone：bootstrap 简化
- GraphQL Federation 2
- SQL：typeorm / kysely 支持
**最佳实践**：升 v11 前先看 MIGRATION.md 与 BREAKING CHANGES 章节。

## 第三段：进阶范式

### 模式 11: 快照回归测试
**问题场景**：UI / 序列化输出改了，单元测试不一定能发现。
**解决方案**：jest.toMatchSnapshot() 把对象 / 字符串序列化到 .snap 文件，下次跑自动 diff。CI 失败说明输出变了，人工 review 是否预期。Nest 在 Swagger 输出、metadata 反射结果等地方用。
**关键参数**：
- `expect(x).toMatchSnapshot()`
- 第一次：写入 .snap
- 后续：自动 diff
- `jest --updateSnapshot` 接受变更
**最佳实践**：快照要小而具体，dump 整个 HTML 风险高。

### 模式 12: Mock 与 Spy 的边界
**问题场景**：写单测时到底 mock 到什么粒度？
**解决方案**：Nest 风格：util 层不 mock（纯函数）、service 层 mock 掉 repository / external HTTP、controller 层只测管道。spy 用 jest.spyOn(obj, 'method').mockReturnValue()。
**关键参数**：
- mock 粒度：跨层边界
- spy 监视：调用次数 + 参数
- `jest.fn().mockResolvedValue`
- `verifyAndRestore` 清理
**最佳实践**：不要 mock 你要测的代码。

### 模式 13: 覆盖率与门禁
**问题场景**：覆盖率 100% 也不代表测得好，但完全没门禁又没底线。
**解决方案**：jest --coverage 设门槛：lines 80%、branches 75%、functions 80%、statements 80%。CI 卡点 < 门槛即失败。新代码要求 90% 覆盖（codecov patch flag）。
**关键参数**：
- global threshold
- patch threshold (新代码)
- lcov / html 报告
- codecov.io / coveralls
**最佳实践**：覆盖率是健康度信号，不是 KPI。

### 模式 14: 端到端 e2e 与 supertest
**问题场景**：HTTP 全栈测试要启动真实服务。
**解决方案**：e2e/setup.ts 用 `Test.createTestingModule().compile()` 拿到 NestApplication，app.init() 后用 supertest(app.getHttpServer()).get('/users') 发请求。结束后 app.close() 清理。
**关键参数**：
- supertest(app.getHttpServer())
- beforeAll / afterAll
- 关掉真实 DB，用 testcontainers
- 跑用例 < 30s
**最佳实践**：e2e 跑在独立 CI job，失败后保留 trace。

### 模式 15: 持续集成三段式
**问题场景**：单 CI 跑 lint+unit+integration+e2e 太慢。
**解决方案**：拆三个 job：fast（lint + unit 2 分钟）、slow（integration 10 分钟）、e2e（5 分钟）。PR 阶段跑 fast，merge 后跑 slow，夜间跑 e2e。Nest 仓库用 GitHub Actions + 自托管 runner。
**关键参数**：
- fast / slow / e2e 三段
- PR 触发 fast
- push main 触发 fast + slow
- schedule 触发 e2e
**最佳实践**：CI 缓存 node_modules + nx cache，单次 install < 30s。

## 第四段：实战范式

### 模式 16: 工具函数先测后写
**问题场景**：开发 validateModuleKeys 这种小工具，怎么保证一次写对？
**解决方案**：先写 spec（红），再写实现（绿），再重构。Nest 内部 commit history 大多是 spec 与 util 同 commit 提交。这种"spec 先于 util"的项目，落地测试覆盖近乎 100%。
**关键参数**：
- red → green → refactor
- 一 commit 一对
- `it('should throw on invalid key')`
- jest watch 模式
**最佳实践**：开启 jest --watch，单测循环 < 1s。

### 模式 17: 写一个真实的 validateModuleKeys
**问题场景**：从 0 实现 validateModuleKeys 函数。
**解决方案**：函数接收 `rawModule: any`，对 `Object.keys(rawModule)` 与合法白名单 `['imports','controllers','providers','exports']` 做差集。若差集非空，抛 `InvalidModuleException(\`Module has invalid keys: ${invalid.join(', ')}\`)`。
**关键参数**：
- 合法白名单：ALLOWED_KEYS
- 抛 BuiltInException 子类
- 错误信息含字段名
- 嵌套模块递归
**最佳实践**：把 ALLOWED_KEYS 抽成 const，spec 引用之防漂移。

### 模式 18: 集成到 Module 工厂
**问题场景**：validateModuleKeys 写好后何时调用？
**解决方案**：在 `InternalCoreModule.create()` 阶段，扫描到 Module 装饰器元数据后，对 `moduleCls` 实例化前的 rawModule 字典调一次。失败立即抛错，启动期就崩溃。
**关键参数**：
- 钩子位置：ModuleFactory 入口
- 错误抛出：启动期
- 配合 StrictMode
- dev 模式 warn / prod 模式 throw
**最佳实践**：模块层错误在启动期就崩，比运行时崩好 100 倍。

### 模式 19: 错误信息本地化
**问题场景**：海外业务要英文日志 + 中文错误提示。
**解决方案**：异常类接受 locale 参数，`InvalidModuleException('xxx', 'zh-CN')` 返回中文 message。或者用 i18n 包做 lookup。Nest 本身错误默认英文，业务层包一层。
**关键参数**：
- i18n 模块
- locale 参数透传
- 默认英文
- 业务层 wrap
**最佳实践**：用户面向业务异常用本地化；面向开发者用英文。

### 模式 20: NestJS 在 AI 直播平台的实战集成
**问题场景**：AI 直播平台后端 API（商品挂车、直播间信息、用户管理、订单）用什么技术栈？
**解决方案**：NestJS + Fastify adapter + Prisma + PostgreSQL + Redis + Socket.io Gateway。validateModuleKeys 这种内部工具未来可以做"插件市场"——第三方 module 上传前过自检。
**关键参数**：
- nest new ai-live-api
- @nestjs/platform-fastify
- Prisma + PostgreSQL
- @nestjs/websockets 推弹幕
- @nestjs/throttler 限流
**最佳实践**：API 层用 Nest + Fastify，实时层用 Nest + Socket.io，AI 推理层用 Python gRPC，Nest 客户端调 .proto 即可。
