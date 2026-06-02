# spring-boot - 事件总线分发 + Property<T> + Layer 切片的构建工具链

**GitHub**: spring-projects/spring-boot
**Star**: 76k+
**语言**: Java (主) + Groovy (Gradle DSL) + AsciiDoc + Kotlin
**主题**: java-framework / build-tool / gradle-plugin / cloud-native-buildpacks
**适用场景**: 学习 Gradle 插件事件总线分发、Property<T> Lazy API、BootJar 归档、Layer 切片算法

> spring-boot 本地镜像仅含 build 工具链（build-plugin / buildSrc / buildpack），主框架 jar 需从 Maven Central 拉取。核心是 5 个 PluginApplicationAction 监听 Java/Kotlin/War 插件事件，BootJar 重写归档生成 BOOT-INF/classes+lib+layers.idx 三件套，Buildpack 对接 Cloud Native Buildpacks——是"开箱即用"承诺的工程实现。

## 第一段：基础范式（模式 1-5）

### 模式 1 · SpringBootPlugin 事件总线分派

**问题场景**：用户可能只 apply 了 Java，也可能同时 apply 了 Kotlin 与 War——每种场景需要的 task 都不一样，命令式 if-else 难维护。

**解决方案**：SpringBootPlugin 不直接干活，注册一组 `PluginApplicationAction` 监听各类底层插件的 `withPlugin("java" | "kotlin" | "war")` 事件。

**关键参数**：
- 门面 = `SpringBootPlugin.apply(project)` 只注册
- Action = `JavaPluginAction / KotlinPluginAction / WarPluginAction` 6 个
- 监听 = `getPluginManager().withPlugin("java")` 回调
- 触发 = 底层插件加载完成 → Action.execute(project)
- 优势 = 声明性注册 + 零侵入用户构建脚本

**最佳实践**：构建工具插件用事件总线分发（vs. 命令式 if-else）——按"何时被 apply"解耦"做什么"。

### 模式 2 · Property<T> Lazy API 字段

**问题场景**：插件字段如果用裸 `String` / `int`——配置阶段就要读取，破坏 Gradle Configuration Cache；多模块项目配置时间从 30s 变成几分钟。

**解决方案**：`SpringBootExtension` 内部几乎所有字段都是 `Property<T>` 而不是裸 `T`——配合 Gradle 8 Configuration Cache 增量执行。

**关键参数**：
- 声明 = `Property<String> mainClass = project.getObjects().property(String.class)`
- 读 = `mainClass.get()` 执行阶段才读
- 优势 = 多模块配置时间 30s → 5s
- 透传 = `SpringBootExtension` / `BootBuildImage` DSL 全部 Property
- 时代 = Gradle 5+ 引入，3.x 全面迁移

**最佳实践**：Gradle 插件字段用 `Property<T>`（vs. 裸值）——支持 Configuration Cache + 增量构建。

### 模式 3 · BootJar 重写归档 + layers.idx

**问题场景**：Spring Boot 可执行 jar 需要 `BOOT-INF/classes + BOOT-INF/lib + BOOT-INF/layers.idx` 三件套——普通 jar 任务不够用。

**解决方案**：`BootJar extends Jar`——复用 Gradle Jar 任务基础设施（manifest、签名、增量），只重写归档流程 + 加 layer 切片。

**关键参数**：
- 继承 = `BootJar extends Jar implements BootArchive`
- 三件套 = `BOOT-INF/classes/` / `BOOT-INF/lib/` / `BOOT-INF/layers.idx`
- 启动器 = `META-INF/MANIFEST.MF` 的 `Main-Class: JarLauncher`
- layers = 5 个 layer（dependencies / spring-boot-loader / snapshot-dependencies / application）
- 缓存 = `@DisableCachingByDefault(because = "Not worth caching")`

**最佳实践**：可执行 jar 继承 Jar 任务（vs. 重新实现 Task）——复用基础设施 + 只重写归档。

### 模式 4 · PluginApplicationAction 监听底层插件

**问题场景**：Spring Boot 插件要兼容 Java / Kotlin / Scala / Groovy 4 种 JVM 语言——单一实现难写。

**解决方案**：每个语言一个 `PluginApplicationAction`（`getPluginClass()` 返回底层插件 Class）——`JavaPluginAction` 改 Jar 任务 + `KotlinPluginAction` 改 Kotlin 编译。

**关键参数**：
- 接口 = `PluginApplicationAction { getPluginClass(); execute(project) }`
- 6 个 = Java / Kotlin / War / Application / DependencyManagementPlugin / NativeImage
- 触发 = `getPluginManager().withPlugin(action.getPluginClass().getName())`
- 隔离 = 每种语言独立 Action，互不干扰
- 复用 = 任何"多语言构建"场景可套

**最佳实践**：构建工具多语言支持用 Action 队列（vs. if-else）——按语言解耦 + 可扩展。

### 模式 5 · BootBuildImage + Buildpack 平台

**问题场景**：用户想 `gradle bootBuildImage` 直接生成 OCI 镜像——手写 Dockerfile 难维护。

**解决方案**：`BootBuildImage` 任务调 `spring-boot-buildpack-platform` 库——对接 Cloud Native Buildpacks 标准。

**关键参数**：
- 任务 = `gradle bootBuildImage` 生成 OCI 镜像
- 平台 = Cloud Native Buildpacks（CNB）标准
- 库 = `spring-boot-buildpack-platform` 客户端
- 流程 = 解析 layers.idx → 调 pack CLI → 生成镜像
- 缓存 = 按 layer 最大化 Docker 缓存命中率

**最佳实践**：镜像生成用 CNB Buildpack（vs. 手写 Dockerfile）——layer 切片 + 标准平台。

## 第二段：扩展范式（模式 6-10）

### 模式 6 · ResolveMainClassName 策略链

**问题场景**：主类查找有 4 种策略——`MainClassGuessStrategy / JarManifestMainClass / GradleStartScript / InferredApplication`——按序尝试。

**解决方案**：`ResolveMainClassName` 策略模式——4 个策略按序尝试，第一个命中即返回。

**关键参数**：
- 策略 = MainClassGuessStrategy / JarManifestMainClass / GradleStartScript / InferredApplication
- 顺序 = 注解 / manifest / start script / 推断
- 返回 = 第一个非空结果
- 兜底 = 报错 "Main class name not found"
- 配置 = 用户可在 build.gradle 显式指定 mainClass 跳过

**最佳实践**：主类查找用策略链（vs. 单一硬编码）——按序尝试 + 可扩展新策略。

### 模式 7 · JavaPluginAction 单独抽出

**问题场景**：`JavaPlugin` 的 `jar` 任务必须被复写为 Spring Boot 可执行 jar 格式——需要拿 `JavaPluginExtension` / `SourceSetContainer` / `Jar` 十几个对象——全塞进 SpringBootPlugin 会膨胀到 1500+ 行。

**解决方案**：拆出去——`JavaPluginAction.execute(project)` 只关心 Java 场景，每种语言一个 Action。

**关键参数**：
- 拆 = JavaPluginAction / KotlinPluginAction / WarPluginAction 各 100-200 行
- 关注 = Java 场景只做"找到用户 jar 任务 + 接到 build 任务"
- 入口 = `classifyJarTask(project); configureBuildTask(project); ...`
- 优势 = 类不膨胀 + 单元测试简单
- 替代 = 大 `SpringBootPlugin` 单一类（1500+ 行）

**最佳实践**：构建插件按场景拆 Action（vs. 单一门面）——关注点分离 + 可测试。

### 模式 8 · @DisableCachingByDefault 性能调优反例

**问题场景**：Gradle 看到 `BootJar extends Jar` 按理应用构建缓存——但实际缓存 BootJar 比重新打包更慢（缓存 key 计算比打包耗时）。

**解决方案**：`@DisableCachingByDefault(because = "Not worth caching")` 显式禁用——注解里写明技术债。

**关键参数**：
- 注解 = `@DisableCachingByDefault`
- 原因 = `because = "Not worth caching"` 写在注解里
- 适用 = 用户 jar 体积极小（< 1MB）时合理
- 风险 = 大型应用是性能反优化
- 实践 = 少见的"在注解里写技术债"实践

**最佳实践**：禁用 Gradle 缓存必须写 `because`（vs. 默默禁用）——给未来读者评估是否重新启用。

### 模式 9 · Layer 切片算法（Docker 缓存优化）

**问题场景**：Docker 镜像层一旦代码变更全重建——依赖层浪费缓存。

**解决方案**：`BootJar` 归档时按依赖类型分 5 个 layer（`dependencies / spring-boot-loader / snapshot-dependencies / application`），写入 `BOOT-INF/layers.idx`——Buildpack 读取后决定镜像层序。

**关键参数**：
- 5 layer = dependencies / spring-boot-loader / snapshot-dependencies / application
- 索引 = `BOOT-INF/layers.idx` 纯文本
- 工具 = Buildpack 读取后按 layer 分镜像
- 命中率 = application 层代码变更不影响上面 layer
- 入口 = `BootJar` 归档时按依赖类型分组

**最佳实践**：可执行 jar 必带 layers.idx（vs. 单层 jar）——最大化 Docker 缓存命中率 95%+。

### 模式 10 · Antora 文档源 + adoc

**问题场景**：Java 项目 README 用 Markdown 不够——Spring 生态用 AsciiDoctor + Antora 多版本文档站。

**解决方案**：`antora/` 目录 = Antora 文档站点配置，`*.adoc` 源文件——多版本 + 多组件文档站。

**关键参数**：
- Antora = 文档站生成器
- 源 = `*.adoc` AsciiDoctor 格式
- 组件 = 多个 spring-boot-* 组件共享
- 版本 = 多版本分支支持
- 部署 = `antora-playbook.yml` 配置

**最佳实践**：Java 库用 AsciiDoctor + Antora（vs. Markdown）——Java 生态标配 + 多版本支持。

## 第三段：进阶范式（模式 11-15）

### 模式 11 · buildSrc 共享 checkstyle 规则

**问题场景**：spring-boot 子项目很多——每个 build.gradle 写一遍 checkstyle 配置重复 100 次。

**解决方案**：`buildSrc/` 目录 = 编译时辅助——`src/main/java` 写 checkstyle 配置 + 约定插件，所有子项目复用。

**关键参数**：
- 路径 = `buildSrc/src/main/java`
- 内容 = checkstyle.xml 统一代码风格
- 复用 = 所有 build-plugin/* 子项目
- 替代 = 每个 build.gradle 写一遍（重复 100 次）
- 编译时 = `buildSrc` 单独编译一次

**最佳实践**：多子项目用 buildSrc 共享配置（vs. 重复配置）——编译时统一 + DRY。

### 模式 12 · 三层测试金字塔

**问题场景**：Spring Boot 插件要测纯逻辑（unit）+ Gradle 集成（intTest）+ 真实 Buildpack 容器（dockerTest）——3 个层级。

**解决方案**：`src/test/java`（JUnit 5 + AssertJ + Mockito）+ `src/intTest/java`（Gradle TestKit）+ `src/dockerTest/java`（Testcontainers）。

**关键参数**：
- unit = JUnit 5 + AssertJ + Mockito
- intTest = Gradle TestKit 模拟真实 build.gradle
- dockerTest = Testcontainers 跑真实 Buildpack 容器
- 叠加 = 编译期挡低级错误 + 早期挡逻辑 + 中期挡契约 + 末期挡环境
- 工具 = `TestKit` / `Testcontainers`

**最佳实践**：构建插件必带三层测试（vs. 只 unit）——覆盖从逻辑到真实容器的全链路。

### 模式 13 · Spring Boot Loader 三层跳转

**问题场景**：`java -jar myapp.jar` 直接跑——业务类 + 依赖在 jar 内需要特殊加载器。

**解决方案**：`META-INF/MANIFEST.MF` 的 `Main-Class: org.springframework.boot.loader.launch.JarLauncher`——JarLauncher 打开自己的 manifest → 读 `Start-Class` → `LaunchedURLClassLoader` 从 `BOOT-INF/lib/*.jar` 加载业务类。

**关键参数**：
- 跳转 = JVM → JarLauncher → Start-Class → 业务类
- 加载器 = `LaunchedURLClassLoader` 从内嵌 jar 加载
- manifest = `Main-Class: JarLauncher` + `Start-Class: 业务类`
- 内嵌 = `BOOT-INF/lib/*.jar` 不需要解压
- 路径 = `spring-boot-loader` jar 提供 loader 类（主框架）

**最佳实践**：可执行 jar 用自定义 ClassLoader（vs. 业务手动 -cp）——内嵌 jar 透明加载。

### 模式 14 · TaskName 字符串常量反例

**问题场景**：`BOOT_JAR_TASK_NAME = "bootJar"` 这种公开常量会与用户自定义 task 冲突——业务写 `tasks.create("bootJar")` 报错。

**解决方案**：应该改成 `TaskName` 枚举或 `NameValidator`——避免与用户自定义 task 冲突。

**关键参数**：
- 反例 = `public static final String BOOT_JAR_TASK_NAME = "bootJar"`
- 问题 = 用户 `tasks.create("bootJar")` 冲突
- 替代 = 枚举 `TaskName.BOOT_JAR` + `NameValidator` 校验
- 实践 = 公开 API 字符串常量要校验
- 风险 = 内部字符串与用户命名空间交叉

**最佳实践**：插件公开 API 用枚举（vs. 字符串常量）——避免与用户命名冲突 + 类型安全。

### 模式 15 · 跨构建系统统一（Maven/Gradle/Ant）

**问题场景**：用户有 Maven 项目 / Gradle 项目 / 老 Ant 项目——3 套构建系统都要支持 Spring Boot。

**解决方案**：3 个插件并列——`spring-boot-gradle-plugin` / `spring-boot-maven-plugin` / `spring-boot-antlib`（遗留）——同一 jar 格式保证字节等价。

**关键参数**：
- Gradle = `spring-boot-gradle-plugin` 主战场
- Maven = `spring-boot-maven-plugin` 镜像
- Ant = `spring-boot-antlib` 兼容层
- 字节等价 = `gradle bootJar` 与 `mvn package` 产出字节等价
- 状态 = Ant 遗留 / Gradle 主流 / Maven 必备

**最佳实践**：跨构建系统支持 3 套插件（vs. 只支持 Gradle）——老 Maven 项目平滑升级。

## 第四段：实战范式（模式 16-20）

### 模式 16 · 选型：Spring Boot vs Quarkus vs Micronaut vs Helidon

**问题场景**：Java 应用框架选型——Spring Boot / Quarkus / Micronaut / Helidon / 裸 Maven Shade？

**解决方案**：决策树——生态最广 + 文档最全选 Spring Boot；云原生 + GraalVM 选 Quarkus；轻量级 DI 选 Micronaut；Oracle 系选 Helidon。

**关键参数**：
- Spring Boot = 复杂度 7/10 + 生态 9.5/10
- Quarkus = 复杂度 8/10 + 生态 5/10（GraalVM 原生）
- Micronaut = 复杂度 7/10 + 生态 4/10（编译时 DI）
- Helidon = 复杂度 6/10 + 生态 3/10
- 裸 Maven Shade = 复杂度 3/10 + 生态 7/10
- 决策 = 业务复杂度 + 团队熟悉度 + 云原生需求

**最佳实践**：90% Java 应用选 Spring Boot（生态 + 文档 + 人才）；GraalVM 原生选 Quarkus；编译时 DI 选 Micronaut。

### 模式 17 · 7 天复刻 mini-spring-boot-build 路线

**问题场景**：想理解 Spring Boot 插件事件总线 + Lazy Provider + Layer 切片；想 7 天复刻 MVP。

**解决方案**：7 天 MVP——Day 1 克隆 + 阅读 build.gradle，Day 2 读 SpringBootPlugin + 6 Action，Day 3 写最小 BootJar，Day 4 实现 ResolveMainClassName 策略链，Day 5 加 layers.idx 生成，Day 6 TestKit 集成测试，Day 7 Buildpack 对接。

```
Day1: 克隆 + 阅读 build.gradle
Day2: 读 SpringBootPlugin + 6 个 Action
Day3: 写一个最小 BootJar（只重写归档）
Day4: 实现 ResolveMainClassName 策略链
Day5: 加 layers.idx 生成
Day6: 写 TestKit 集成测试
Day7: 写 Buildpack 对接（只生成 layers.idx）
```

**关键参数**：
- 核心 = SpringBootPlugin 事件总线 + BootJar 归档
- 字段 = Property<T> 全量使用
- 切片 = layers.idx 5 个 layer
- 复刻难度 = 核心 1000 行可讲清

**最佳实践**：复刻 mini-spring-boot-build 先做 SpringBootPlugin + BootJar——核心 1000 行 2 周能出可用品。

### 模式 18 · 镜像层优化实战

**问题场景**：Spring Boot 镜像 200MB+，每次代码变更全重建——Docker 缓存命中率低。

**解决方案**：Buildpack 生成的镜像自动按 BOOT-INF/layers.idx 切片——依赖变更时只重建对应层，命中率 95%+。

**关键参数**：
- 工具 = Cloud Native Buildpacks
- 输入 = `BOOT-INF/layers.idx` 5 layer 索引
- 输出 = OCI 镜像分层
- 命中率 = application 层代码变更不影响 dependencies 层
- 流程 = `gradle bootBuildImage` 一键生成
- 替代 = 手写 Dockerfile（难维护）

**最佳实践**：Spring Boot 镜像必走 Buildpack（vs. 手写 Dockerfile）——layer 切片 + 95% 缓存命中。

### 模式 19 · 3 大可复用模式

**问题场景**：构建工具插件项目通用模式有哪些？值得复用什么？

**解决方案**：3 件必偷——① `PluginApplicationAction` 接口 + `getPluginClass()` 返回底层插件 Class；② `Property<T>` 全量使用配合 Gradle Configuration Cache；③ `BOOT-INF/classes + BOOT-INF/lib + BOOT-INF/layers.idx` 三件套归档。

**关键参数**：
- Action 模式 = `getPluginClass()` + `execute(project)` 接口
- Property 模式 = `project.getObjects().property(String.class)` Lazy API
- 三件套 = `BOOT-INF/classes/` + `BOOT-INF/lib/` + `BOOT-INF/layers.idx`
- 适用 = 任何 Gradle 插件项目
- 收益 = 性能 + 扩展性 + 缓存

**最佳实践**：构建工具插件抄 3 件套（Action + Property + 三件套归档）——立竿见影。

### 模式 20 · Spring Boot 演进历史与设计哲学

**问题场景**：Spring Boot 2014-2026 演进——什么驱动 1.x → 2.x → 3.x → 4.x 大版本变化？

**解决方案**：历史回顾——1.x (2014 起步) → 2.x (2018 Spring 5 + WebFlux) → 2.3 (2020 Buildpacks) → 3.x (2022 Jakarta EE + Java 17) → 3.4 (2024 虚拟线程) → 4.x (2026 路线)。

**关键参数**：
- 1.x (2014) = 起步
- 2.0 (2018) = Spring 5 + WebFlux
- 2.3 (2020) = Buildpacks 支持
- 3.0 (2022) = Jakarta EE + Java 17 baseline
- 3.2 (2023) = AOT 雏形
- 3.4 (2024) = 虚拟线程
- 4.0 (2026 路线) = 下一站

**最佳实践**：长生命周期框架按"先 API 稳定、再加新特性、最后性能优化"演进（vs. 一次性大重构）——用户平滑升级。

## 项目速查

**仓库元信息**：
- 路径：`G:\实战案例\GitHub顶尖项目\spring-boot\`
- 大小：201 MB
- Java 文件数：748
- License：Apache-2.0
- 状态：3.5.x/4.x 主线（README 提及 JDK 25）

**核心子项目**：
- `build-plugin/spring-boot-gradle-plugin/` = Gradle 入口（主战场）
  - `plugin/` = 6 个 PluginApplicationAction + SpringBootPlugin
  - `dsl/` = SpringBootExtension DSL
  - `tasks/bundling/` = BootJar / BootWar / BootBuildImage
  - `tasks/run/` = BootRun / BootTestRun
- `build-plugin/spring-boot-maven-plugin/` = Maven 端镜像
- `build-plugin/spring-boot-antlib/` = Ant 兼容层（遗留）
- `buildSrc/` = 编译时辅助（checkstyle）
- `buildpack/spring-boot-buildpack-platform/` = CNB 平台客户端

**3 核心洞察**：
1. 插件不应该写命令式逻辑——用事件总线 `withPlugin("xxx")` 注册回调
2. `Property<T>` 是 Gradle 5+ 后所有字段的正确类型——裸值破坏 Configuration Cache
3. 可执行 Jar 的三件套（classes + lib + layers.idx）= Docker 缓存优化的物质基础

**1 反模式**：`@DisableCachingByDefault(because = "Not worth caching")`——除非有 benchmark 证据，否则不要禁用 Gradle 缓存。

**1 可复用模式**：`PluginApplicationAction` 接口 + `getPluginClass()` 返回底层插件 Class——任何"多语言构建"场景可套。

**3 立刻能用**：
1. Gradle 插件字段 `String mainClass` → `Property<String> mainClass`
2. 命令式 `if (project.plugins.hasPlugin("java"))` → `pluginManager.withPlugin("java") { ... }`
3. 自定义 Jar 任务加 `BOOT-INF/classes/` + `BOOT-INF/lib/` 双目录归档
