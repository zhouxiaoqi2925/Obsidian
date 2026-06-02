# spring-boot - 事件总线分发 + Property<T> + Layer 切片的构建工具链

> spring-boot 本地镜像仅含 build 工具链（build-plugin / buildSrc / buildpack），主框架 jar 需从 Maven Central 拉取。核心是 5 个 PluginApplicationAction 监听 Java/Kotlin/War 插件事件，BootJar 重写归档生成 BOOT-INF/classes+lib+layers.idx 三件套，Buildpack 对接 Cloud Native Buildpacks——是"开箱即用"承诺的工程实现。

## 一、构建插件架构

### 模式 1 · SpringBootPlugin 事件总线分派

**问题场景**：用户可能只 apply 了 Java，也可能同时 apply 了 Kotlin 与 War——每种场景需要的 task 都不一样，命令式 if-else 难维护。

**解决方案**：SpringBootPlugin 不直接干活，注册一组 `PluginApplicationAction` 监听各类底层插件的 `withPlugin("java" | "kotlin" | "war")` 事件。

```groovy
// build-plugin/spring-boot-gradle-plugin/src/main/groovy/.../SpringBootPlugin.groovy
class SpringBootPlugin implements Plugin<Project> {
    @Override
    void apply(Project project) {
        // 6 个 Action 监听不同底层插件
        new JavaPluginAction().execute(project)
        new KotlinPluginAction().execute(project)
        new WarPluginAction().execute(project)
        new ApplicationPluginAction().execute(project)
        new DependencyManagementPluginAction().execute(project)
        new NativeImagePluginAction().execute(project)
    }
}

class JavaPluginAction implements PluginApplicationAction {
    @Override
    Class<? extends Plugin<?>> getPluginClass() { return JavaPlugin }
    @Override
    void execute(Project project) {
        // 用 withPlugin 监听，比 pluginManager.hasPlugin 强（异步安全）
        project.pluginManager.withPlugin("java") {
            // 改写 jar 任务为 BootJar
            def jarTask = project.tasks.named("jar")
            def bootJar = project.tasks.register("bootJar", BootJar)
            bootJar.configure { it.classifier = "boot" }
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 门面 | `SpringBootPlugin.apply(project)` 只注册不干活 |
| Action | `JavaPluginAction` / `KotlinPluginAction` / `WarPluginAction` 6 个 |
| 监听 | `getPluginManager().withPlugin("java")` 回调 |
| 触发 | 底层插件加载完成 → Action.execute(project) |
| 优势 | 声明性注册 + 零侵入用户构建脚本 |
| 解耦 | 按"何时被 apply"解耦"做什么" |

**最佳实践**：
- 构建工具插件用事件总线分发（vs. 命令式 if-else）——按"何时被 apply"解耦"做什么"
- `withPlugin` 比 `hasPlugin` 强——异步安全不依赖初始化时序
- 每个 Action 一个文件——避免 1500+ 行的 SpringBootPlugin
- Action 内部仍可拆 `classifyJarTask / configureBuildTask / configureBootRunTask` 多个方法

### 模式 2 · Property<T> Lazy API 字段

**问题场景**：插件字段如果用裸 `String` / `int`——配置阶段就要读取，破坏 Gradle Configuration Cache；多模块项目配置时间从 30s 变成几分钟。

**解决方案**：`SpringBootExtension` 内部几乎所有字段都是 `Property<T>` 而不是裸 `T`——配合 Gradle 8 Configuration Cache 增量执行。

```groovy
// build-plugin/.../dsl/SpringBootExtension.groovy
class SpringBootExtension {
    private final Property<String> mainClass
    private final Property<String> springProfilesActive

    SpringBootExtension(Project project) {
        this.mainClass = project.objects.property(String)
        this.springProfilesActive = project.objects.property(String)
    }

    Property<String> getMainClass() { return mainClass }
    Property<String> getSpringProfilesActive() { return springProfilesActive }
}

// DSL
springBoot {
    mainClass.set("com.example.Application")  // 链式配置
    springProfilesActive.set("prod")
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 声明 | `Property<String> mainClass = project.getObjects().property(String.class)` |
| 读 | `mainClass.get()` 执行阶段才读（lazy） |
| 优势 | 多模块配置时间 30s → 5s（Configuration Cache 命中） |
| 透传 | `SpringBootExtension` / `BootBuildImage` DSL 全部 Property |
| 时代 | Gradle 5+ 引入，3.x 全面迁移 |
| 链式 | `.set("...")` / `.convention("...")` / `.finalizeValueOnRead()` |

**最佳实践**：
- Gradle 插件字段用 `Property<T>`（vs. 裸值）——支持 Configuration Cache + 增量构建
- 必加 `finalizeValueOnRead()`——配置阶段锁定避免运行时变更
- 必加 `@Input` / `@Internal` 注解——让 Task 知道怎么序列化
- 配置缓存开启：`org.gradle.unsafe.configuration-cache=true` 性能提升 5-10x

### 模式 3 · BootJar 重写归档 + layers.idx

**问题场景**：Spring Boot 可执行 jar 需要 `BOOT-INF/classes + BOOT-INF/lib + BOOT-INF/layers.idx` 三件套——普通 jar 任务不够用。

**解决方案**：`BootJar extends Jar`——复用 Gradle Jar 任务基础设施（manifest、签名、增量），只重写归档流程 + 加 layer 切片。

```groovy
// tasks/bundling/BootJar.groovy
@DisableCachingByDefault(because = "Not worth caching")
abstract class BootJar extends Jar implements BootArchive {
    @Override
    void copy() {
        // 1. 标准的 BOOT-INF/classes 复制
        into("BOOT-INF/classes") {
            from sourceSets.main.output
        }
        // 2. 依赖复制到 BOOT-INF/lib
        into("BOOT-INF/lib") {
            from configurations.runtimeClasspath
        }
        // 3. 生成 layers.idx
        into("BOOT-INF") {
            from { generateLayersIdx() }
        }
        // 4. manifest
        manifest {
            attributes("Main-Class": "org.springframework.boot.loader.launch.JarLauncher")
            attributes("Start-Class": extension.mainClass.get())
        }
        super.copy()
    }

    private File generateLayersIdx() {
        // 5 个 layer: dependencies / spring-boot-loader / snapshot-dependencies / application
        def idx = new File(temporaryDir, "layers.idx")
        idx.text = """
            - "dependencies":
              - "BOOT-INF/lib/dependency-1.jar"
              - "BOOT-INF/lib/dependency-2.jar"
            - "spring-boot-loader":
              - "org/springframework/boot/loader/"
            - "snapshot-dependencies":
              - "BOOT-INF/lib/snapshot-1.jar"
            - "application":
              - "BOOT-INF/classes/"
        """
        idx
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 继承 | `BootJar extends Jar implements BootArchive` |
| 三件套 | `BOOT-INF/classes/` / `BOOT-INF/lib/` / `BOOT-INF/layers.idx` |
| 启动器 | `META-INF/MANIFEST.MF` 的 `Main-Class: JarLauncher` |
| layers | 5 个 layer（dependencies / spring-boot-loader / snapshot-dependencies / application） |
| 缓存 | `@DisableCachingByDefault(because = "Not worth caching")` |
| 复用 | 复用 Jar 任务的 manifest、签名、增量 |

**最佳实践**：
- 可执行 jar 继承 Jar 任务（vs. 重新实现 Task）——复用基础设施 + 只重写归档
- `@DisableCachingByDefault` 必带 `because`——给后人评估的线索
- layers.idx 必加——Buildpack 读取后生成高效镜像
- `classifier = "boot"` 与普通 jar 共存——方便 IDE 调试

### 模式 4 · PluginApplicationAction 监听底层插件

**问题场景**：Spring Boot 插件要兼容 Java / Kotlin / Scala / Groovy 4 种 JVM 语言——单一实现难写。

**解决方案**：每个语言一个 `PluginApplicationAction`（`getPluginClass()` 返回底层插件 Class）——`JavaPluginAction` 改 Jar 任务 + `KotlinPluginAction` 改 Kotlin 编译。

```groovy
// PluginApplicationAction.groovy
interface PluginApplicationAction {
    Class<? extends Plugin<?>> getPluginClass()
    void execute(Project project)
}

// JavaPluginAction.groovy
class JavaPluginAction implements PluginApplicationAction {
    @Override
    Class<? extends Plugin<?>> getPluginClass() { return JavaPlugin }
    @Override
    void execute(Project project) {
        project.pluginManager.withPlugin(JavaPlugin) {
            // 注册 bootJar
            project.tasks.register("bootJar", BootJar)
            // 替换 jar 任务为 BootJar 的依赖
            project.tasks.named("jar").configure { jar ->
                jar.dependsOn("bootJar")
            }
        }
    }
}

// KotlinPluginAction.groovy
class KotlinPluginAction implements PluginApplicationAction {
    @Override
    Class<? extends Plugin<?>> getPluginClass() { return KotlinPlatformJvmPlugin }
    @Override
    void execute(Project project) {
        // 改 Kotlin 编译，附加 Spring AOT 处理器
        project.pluginManager.withPlugin("org.jetbrains.kotlin.jvm") {
            // ...
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 接口 | `PluginApplicationAction { getPluginClass(); execute(project) }` |
| 6 个 Action | Java / Kotlin / War / Application / DependencyManagement / NativeImage |
| 触发 | `getPluginManager().withPlugin(action.getPluginClass().getName())` |
| 隔离 | 每种语言独立 Action，互不干扰 |
| 复用 | 任何"多语言构建"场景可套 |
| 顺序 | Application 在 Java 之后（依赖 Java 任务） |

**最佳实践**：
- 构建工具多语言支持用 Action 队列（vs. if-else）——按语言解耦 + 可扩展
- `getPluginClass()` 返回 Class 不用字符串——编译期安全
- `withPlugin` 的 lambda 内部用 `register("bootJar", BootJar)`——lazy 注册
- 加新语言只需加一个 Action——主类 SpringBootPlugin 不变

### 模式 5 · BootBuildImage + Buildpack 平台

**问题场景**：用户想 `gradle bootBuildImage` 直接生成 OCI 镜像——手写 Dockerfile 难维护。

**解决方案**：`BootBuildImage` 任务调 `spring-boot-buildpack-platform` 库——对接 Cloud Native Buildpacks 标准。

```groovy
// tasks/bundling/BootBuildImage.groovy
abstract class BootBuildImage extends DefaultTask {
    @Internal abstract DirectoryProperty getWorkingDir()
    @Input abstract Property<String> getImageName()
    @Input abstract Property<String> getBuilder()
    @Input abstract Property<Boolean> getCacheDisabled()
    @Input abstract Property<Boolean> getCleanCache()

    @TaskAction
    void buildImage() {
        // 1. 解析 BOOT-INF/layers.idx
        def layersIdx = resolveLayersIdx()
        // 2. 调 spring-boot-buildpack-platform
        def platform = new BuildpackPlatform(workingDir.get().asFile)
        def client = new DockerImageClient()
        // 3. 执行 pack CLI 协议
        def buildRequest = BuildRequest.builder()
            .imageName(imageName.get())
            .builder(builder.get())
            .lifecycleVersion("0.15.0")
            .layers(layersIdx)
            .cleanCache(cleanCache.get())
            .build()
        client.build(buildRequest)
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 任务 | `gradle bootBuildImage` 生成 OCI 镜像 |
| 平台 | Cloud Native Buildpacks（CNB）标准 |
| 库 | `spring-boot-buildpack-platform` 客户端 |
| 流程 | 解析 layers.idx → 调 pack CLI → 生成镜像 |
| 缓存 | 按 layer 最大化 Docker 缓存命中率 |
| builder | `paketobuildpacks/builder-jammy-base` 默认 |
| 镜像名 | `docker.io/library/myapp:0.0.1-SNAPSHOT` |

**最佳实践**：
- 镜像生成用 CNB Buildpack（vs. 手写 Dockerfile）——layer 切片 + 标准平台
- 改 builder：`builder = "paketobuildpacks/builder-jammy-java-tiny"` 更小镜像
- `cleanCache = true` 仅在 CI 用——本地开发保留缓存
- 镜像 tag 用 `project.version`——版本一致
- 用 `runImage` 显式指定——避免 builder 默认值变化

## 二、归档与构建优化

### 模式 6 · ResolveMainClassName 策略链

**问题场景**：主类查找有 4 种策略——`MainClassGuessStrategy / JarManifestMainClass / GradleStartScript / InferredApplication`——按序尝试。

**解决方案**：`ResolveMainClassName` 策略模式——4 个策略按序尝试，第一个命中即返回。

```groovy
// tasks/bundling/ResolveMainClassName.groovy
class ResolveMainClassName {
    private final List<MainClassLookupStrategy> strategies = []
    private final Project project

    ResolveMainClassName(Project project) {
        this.project = project
        // 4 个策略按序
        strategies << new MainClassGuessStrategy()
        strategies << new JarManifestMainClass()
        strategies << new GradleStartScript()
        strategies << new InferredApplication()
    }

    String resolveMainClassName() {
        for (strategy in strategies) {
            def mainClass = strategy.getMainClassName(project)
            if (mainClass) return mainClass
        }
        throw new GradleException("Main class name not found")
    }
}

interface MainClassLookupStrategy {
    String getMainClassName(Project project)
}

// MainClassGuessStrategy：@SpringBootApplication 注解扫描
class MainClassGuessStrategy implements MainClassLookupStrategy {
    @Override
    String getMainClassName(Project project) {
        // 扫描 sourceSets.main.java 找 @SpringBootApplication
        def sourceFiles = project.sourceSets.main.allJava.srcDirs.collect { new File(it) }
        for (srcDir in sourceFiles) {
            def className = findAnnotatedClass(srcDir)
            if (className) return className
        }
        return null
    }
}
```

**关键参数**：

| 策略 | 顺序 | 说明 |
|------|------|------|
| `MainClassGuessStrategy` | 1 | `@SpringBootApplication` 注解扫描 |
| `JarManifestMainClass` | 2 | manifest 的 `Start-Class` 属性 |
| `GradleStartScript` | 3 | `application` 插件的 start script |
| `InferredApplication` | 4 | 文件名猜 `Application.java` |
| 返回 | — | 第一个非空结果 |
| 兜底 | — | 报错 "Main class name not found" |
| 配置 | — | 用户可在 build.gradle 显式指定 `mainClass.set("...")` 跳过 |

**最佳实践**：
- 主类查找用策略链（vs. 单一硬编码）——按序尝试 + 可扩展新策略
- 用户显式配置优先于所有策略——`extension.mainClass.set("...")`
- 策略实现接口化——单测只需 mock 策略
- 自定义策略实现 `MainClassLookupStrategy` 即可插入
- 找不到时给出所有尝试过的策略——调试友好

### 模式 7 · JavaPluginAction 单独抽出

**问题场景**：`JavaPlugin` 的 `jar` 任务必须被复写为 Spring Boot 可执行 jar 格式——需要拿 `JavaPluginExtension` / `SourceSetContainer` / `Jar` 十几个对象——全塞进 SpringBootPlugin 会膨胀到 1500+ 行。

**解决方案**：拆出去——`JavaPluginAction.execute(project)` 只关心 Java 场景，每种语言一个 Action。

```groovy
// JavaPluginAction.groovy 100-200 行
class JavaPluginAction implements PluginApplicationAction {
    @Override
    Class<? extends Plugin<?>> getPluginClass() { return JavaPlugin }

    @Override
    void execute(Project project) {
        project.pluginManager.withPlugin(JavaPlugin) {
            def extension = project.extensions.getByType(SpringBootExtension)
            def jarTask = project.tasks.named("jar")
            def resolvedMainClass = new ResolveMainClassName(project)
            def bootJar = project.tasks.register("bootJar", BootJar) { task ->
                task.group = "build"
                task.description = "Assembles a fat executable jar"
                task.mainClass.set(extension.mainClass)
                task.classifier = "boot"
            }
            project.tasks.named("build").configure { it.dependsOn(bootJar) }
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 拆 | `JavaPluginAction` / `KotlinPluginAction` / `WarPluginAction` 各 100-200 行 |
| 关注 | Java 场景只做"找到用户 jar 任务 + 接到 build 任务" |
| 入口 | `classifyJarTask(project); configureBuildTask(project); configureBootRunTask(project)` |
| 优势 | 类不膨胀 + 单元测试简单 |
| 替代 | 大 `SpringBootPlugin` 单一类（1500+ 行） |
| 协调 | 多个 Action 通过 `project` 共享状态（Property/Extension） |

**最佳实践**：
- 构建插件按场景拆 Action（vs. 单一门面）——关注点分离 + 可测试
- Action 不超过 200 行——超出再拆 helper 方法
- Action 间通过 Project 共享状态（Property/Extension）——避免多 Action 互相调用
- 单测可 mock Project——无需启动 Gradle
- 命名 `XxxPluginAction` + `execute(project)`——统一接口

### 模式 8 · @DisableCachingByDefault 性能调优反例

**问题场景**：Gradle 看到 `BootJar extends Jar` 按理应用构建缓存——但实际缓存 BootJar 比重新打包更慢（缓存 key 计算比打包耗时）。

**解决方案**：`@DisableCachingByDefault(because = "Not worth caching")` 显式禁用——注解里写明技术债。

```groovy
@DisableCachingByDefault(because = "Not worth caching")
abstract class BootJar extends Jar implements BootArchive {
    // ...
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 注解 | `@DisableCachingByDefault` |
| 原因 | `because = "Not worth caching"` 写在注解里 |
| 适用 | 用户 jar 体积极小（< 1MB）时合理 |
| 风险 | 大型应用是性能反优化 |
| 实践 | 少见的"在注解里写技术债"实践 |
| 决策 | 是否有 benchmark 证据？ |

**最佳实践**：
- 禁用 Gradle 缓存必须写 `because`（vs. 默默禁用）——给未来读者评估是否重新启用
- 默认启用——除非有 benchmark 证明禁用更快
- `because` 写技术原因 + 重新评估条件——后人能复测
- 避免"反优化"——A 项目的优化可能是 B 项目的反优化
- 写入 `docs/performance.md`——长留存技术决策

### 模式 9 · Layer 切片算法（Docker 缓存优化）

**问题场景**：Docker 镜像层一旦代码变更全重建——依赖层浪费缓存。

**解决方案**：`BootJar` 归档时按依赖类型分 5 个 layer（`dependencies / spring-boot-loader / snapshot-dependencies / application`），写入 `BOOT-INF/layers.idx`——Buildpack 读取后决定镜像层序。

```
BOOT-INF/layers.idx
- "dependencies":
  - "BOOT-INF/lib/tomcat-embed-core-10.1.0.jar"
  - "BOOT-INF/lib/spring-core-6.1.0.jar"
  ...
- "spring-boot-loader":
  - "org/springframework/boot/loader/"
- "snapshot-dependencies":
  - "BOOT-INF/lib/dependency-snapshot-1.jar"
- "application":
  - "BOOT-INF/classes/"
  - "BOOT-INF/classpath.idx"
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 5 layer | dependencies / spring-boot-loader / snapshot-dependencies / application |
| 索引 | `BOOT-INF/layers.idx` 纯文本 |
| 工具 | Buildpack 读取后按 layer 分镜像 |
| 命中率 | application 层代码变更不影响上面 layer |
| 入口 | `BootJar` 归档时按依赖类型分组 |
| 自定义 | 用户可加 layer 到 `extension.layers` |

**最佳实践**：
- 可执行 jar 必带 layers.idx（vs. 单层 jar）——最大化 Docker 缓存命中率 95%+
- 改 layer 顺序：把"易变"放最后（application 已经在最后）
- 自定义 layer：`layers = ["my-layer"]` + `into("BOOT-INF/classes/my-layer") { from "..." }`
- 不写 layers.idx 用 Buildpack——Buildpack 会自动按 jar 字母序分（命中率低）
- CI 必看镜像层 hash 变化——业务代码层变化不应影响 dependencies 层

### 模式 10 · Antora 文档源 + adoc

**问题场景**：Java 项目 README 用 Markdown 不够——Spring 生态用 AsciiDoctor + Antora 多版本文档站。

**解决方案**：`antora/` 目录 = Antora 文档站点配置，`*.adoc` 源文件——多版本 + 多组件文档站。

```yaml
# antora-playbook.yml
site:
  title: Spring Boot Reference
  url: https://docs.spring.io/spring-boot

content:
  sources:
    - url: ./spring-boot-project
      branches: [3.4.x, 3.3.x, 3.2.x]  # 多版本
      start_path: spring-boot-project/src/main/asciidoc
    - url: ./spring-boot-actuator
      branches: [3.4.x]
      start_path: spring-boot-actuator/src/main/asciidoc

ui:
  bundle:
    url: https://github.com/spring-projects/spring-docs-ui
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| Antora | 文档站生成器 |
| 源 | `*.adoc` AsciiDoctor 格式 |
| 组件 | 多个 spring-boot-* 组件共享 |
| 版本 | 多版本分支支持 |
| 部署 | `antora-playbook.yml` 配置 |
| 输出 | 静态 HTML 多版本文档站 |

**最佳实践**：
- Java 库用 AsciiDoctor + Antora（vs. Markdown）——Java 生态标配 + 多版本支持
- adoc 支持 callout、表格、include、link——比 Markdown 强
- Antora 多版本自动建 sitemap——SEO 友好
- `docs.spring.io/spring-boot` 是 Spring 官方主推
- CI 跑 Antora 校验 build——PR 检查链接 broken

## 三、配置与测试体系

### 模式 11 · buildSrc 共享 checkstyle 规则

**问题场景**：spring-boot 子项目很多——每个 build.gradle 写一遍 checkstyle 配置重复 100 次。

**解决方案**：`buildSrc/` 目录 = 编译时辅助——`src/main/java` 写 checkstyle 配置 + 约定插件，所有子项目复用。

```
buildSrc/
├── build.gradle
├── settings.gradle
└── src/
    ├── main/
    │   ├── java/
    │   │   └── org/springframework/boot/build/  # 自定义插件
    │   │       ├── SpringBootCheckstylePlugin.groovy
    │   │       └── Conventions.groovy
    │   └── resources/
    │       └── checkstyle.xml
    └── test/
        └── java/...
```

```groovy
// buildSrc/src/main/groovy/.../SpringBootCheckstylePlugin.groovy
class SpringBootCheckstylePlugin implements Plugin<Project> {
    @Override
    void apply(Project project) {
        project.plugins.apply("checkstyle")
        project.checkstyle {
            configFile = rootProject.file("src/checkstyle/checkstyle.xml")
            ignoreFailures = false
            showViolations = true
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 路径 | `buildSrc/src/main/java` |
| 内容 | checkstyle.xml 统一代码风格 |
| 复用 | 所有 build-plugin/* 子项目 |
| 替代 | 每个 build.gradle 写一遍（重复 100 次） |
| 编译时 | `buildSrc` 单独编译一次 |
| 插件 | 自定义约定插件（如 `SpringBootCheckstylePlugin`） |

**最佳实践**：
- 多子项目用 buildSrc 共享配置（vs. 重复配置）——编译时统一 + DRY
- buildSrc 必加 checkstyle 自定义插件——避免每个子项目重复配置
- `rootProject.file(...)` 路径——根项目相对路径
- 自定义约定插件（Convention Plugin）——子项目一行 `apply plugin: '...'` 复用
- 不要在 buildSrc 放业务代码——只放工具/约定

### 模式 12 · 三层测试金字塔

**问题场景**：Spring Boot 插件要测纯逻辑（unit）+ Gradle 集成（intTest）+ 真实 Buildpack 容器（dockerTest）——3 个层级。

**解决方案**：`src/test/java`（JUnit 5 + AssertJ + Mockito）+ `src/intTest/java`（Gradle TestKit）+ `src/dockerTest/java`（Testcontainers）。

```groovy
// 1. unit test (src/test/groovy)
class ResolveMainClassNameTest {
    @Test
    void "MainClassGuessStrategy finds @SpringBootApplication"() {
        def project = ProjectBuilder.builder().build()
        def strategy = new MainClassGuessStrategy()
        // 用 mock source set
        def result = strategy.getMainClassName(project)
        assert result == "com.example.Application"
    }
}

// 2. intTest (src/intTest/groovy) 用 TestKit
class BootJarIntTest {
    @Test
    void "bootJar produces executable jar"() {
        def result = GradleRunner.create()
            .withProjectDir(testProjectDir)
            .withArguments("bootJar")
            .build()
        assert result.output.contains("BUILD SUCCESSFUL")
        assert new File(testProjectDir, "build/libs/test-0.0.1-BOOT.jar").exists()
    }
}

// 3. dockerTest (src/dockerTest/groovy) 用 Testcontainers
class BootBuildImageDockerTest {
    @Test
    void "bootBuildImage produces OCI image"() {
        def container = new GenericContainer("docker:24-dind")
        // 真实 Buildpack 构建
        // ...
    }
}
```

**关键参数**：

| 层级 | 范围 | 工具 | 频率 |
|------|------|------|------|
| unit | 纯逻辑（单类/单方法） | JUnit 5 + AssertJ + Mockito | 每次 commit |
| intTest | Gradle 集成 | Gradle TestKit | 每次 PR |
| dockerTest | 真实 Buildpack 容器 | Testcontainers | 每日/版本 |
| 叠加 | 编译期 + 早期 + 中期 + 末期 | — | — |
| 速度 | unit < 1s / intTest < 30s / dockerTest < 5min | — | — |

**最佳实践**：
- 构建插件必带三层测试（vs. 只 unit）——覆盖从逻辑到真实容器的全链路
- unit 测试用 `ProjectBuilder.builder().build()`——不启动 Gradle daemon
- intTest 用 `GradleRunner.create()`——真实 Gradle 流程
- dockerTest 用 `@Tag("docker")` 隔离——CI 才跑
- intTest 必在 CI 跑——本机慢可跳过

### 模式 13 · Spring Boot Loader 三层跳转

**问题场景**：`java -jar myapp.jar` 直接跑——业务类 + 依赖在 jar 内需要特殊加载器。

**解决方案**：`META-INF/MANIFEST.MF` 的 `Main-Class: org.springframework.boot.loader.launch.JarLauncher`——JarLauncher 打开自己的 manifest → 读 `Start-Class` → `LaunchedURLClassLoader` 从 `BOOT-INF/lib/*.jar` 加载业务类。

```
JVM 启动
   ↓
Main-Class: org.springframework.boot.loader.launch.JarLauncher
   ↓
JarLauncher.main()
   ↓
读自己的 MANIFEST.MF 找 Start-Class
   ↓
LaunchedURLClassLoader
   ├── BOOT-INF/classes/  (业务 class)
   └── BOOT-INF/lib/*.jar  (内嵌依赖)
   ↓
Start-Class: com.example.Application.main()
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 跳转 | JVM → JarLauncher → Start-Class → 业务类 |
| 加载器 | `LaunchedURLClassLoader` 从内嵌 jar 加载 |
| manifest | `Main-Class: JarLauncher` + `Start-Class: 业务类` |
| 内嵌 | `BOOT-INF/lib/*.jar` 不需要解压 |
| 路径 | `spring-boot-loader` jar 提供 loader 类（主框架） |
| WarLoader | 对应 War 归档的 WarLauncher |
| PropertiesLauncher | 外置配置启动器（云原生场景） |

**最佳实践**：
- 可执行 jar 用自定义 ClassLoader（vs. 业务手动 -cp）——内嵌 jar 透明加载
- `Start-Class` 必填——否则 JarLauncher 找不到业务类
- `Main-Class: JarLauncher` 固定——不要改
- 调试可换 `Main-Class` 改回业务类——本地 IDE 方便
- 大 jar (>100MB) 启动慢——考虑 `PropertiesLauncher` + 外部化

### 模式 14 · TaskName 字符串常量反例

**问题场景**：`BOOT_JAR_TASK_NAME = "bootJar"` 这种公开常量会与用户自定义 task 冲突——业务写 `tasks.create("bootJar")` 报错。

**解决方案**：应该改成 `TaskName` 枚举或 `NameValidator`——避免与用户自定义 task 冲突。

```groovy
// 反例：公开字符串常量
public static final String BOOT_JAR_TASK_NAME = "bootJar"

// 正确：枚举
enum TaskName {
    BOOT_JAR("bootJar"),
    BOOT_WAR("bootWar"),
    BOOT_BUILD_IMAGE("bootBuildImage"),
    BOOT_RUN("bootRun")

    final String name
    TaskName(String name) { this.name = name }
}

// 校验器
class TaskNameValidator {
    static void validate(String taskName, Project project) {
        if (project.tasks.findByName(taskName)) {
            throw new GradleException("Task '${taskName}' already exists")
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 反例 | `public static final String BOOT_JAR_TASK_NAME = "bootJar"` |
| 问题 | 用户 `tasks.create("bootJar")` 冲突 |
| 替代 | 枚举 `TaskName.BOOT_JAR` + `NameValidator` 校验 |
| 实践 | 公开 API 字符串常量要校验 |
| 风险 | 内部字符串与用户命名空间交叉 |
| 重构 | v4 之前是字符串，v4 改枚举 |

**最佳实践**：
- 插件公开 API 用枚举（vs. 字符串常量）——避免与用户命名冲突 + 类型安全
- 内部实现用字符串无所谓——只在公开 API 严格
- 公开字符串必加 `NameValidator`——运行时检测冲突
- enum + factory method 是最佳实践——`TaskName.BOOT_JAR.toString()`
- 文档必标注"内部 API"vs"公开 API"——给用户清晰预期

### 模式 15 · 跨构建系统统一（Maven/Gradle/Ant）

**问题场景**：用户有 Maven 项目 / Gradle 项目 / 老 Ant 项目——3 套构建系统都要支持 Spring Boot。

**解决方案**：3 个插件并列——`spring-boot-gradle-plugin` / `spring-boot-maven-plugin` / `spring-boot-antlib`（遗留）——同一 jar 格式保证字节等价。

```
build-plugin/
├── spring-boot-gradle-plugin/   # Gradle 入口（主战场）
├── spring-boot-maven-plugin/    # Maven 端镜像
└── spring-boot-antlib/          # Ant 兼容层（遗留）
```

**关键参数**：

| 系统 | 插件 | 状态 |
|------|------|------|
| Gradle | `spring-boot-gradle-plugin` | 主战场（活跃开发） |
| Maven | `spring-boot-maven-plugin` | 镜像（功能对齐） |
| Ant | `spring-boot-antlib` | 兼容层（遗留） |
| 字节等价 | `gradle bootJar` 与 `mvn package` 产出字节等价 | 关键 |
| 测试 | 三套各自 TestKit 验证字节一致 | CI 必跑 |

**最佳实践**：
- 跨构建系统支持 3 套插件（vs. 只支持 Gradle）——老 Maven 项目平滑升级
- 字节等价是硬指标——同一源码用 Gradle 和 Maven 产 jar 字节级一致
- 共享 BOOT-INF 格式——Maven/Gradle 都按同一格式打包
- Ant 兼容层可标 deprecated——但不能删除（遗留项目依赖）
- 跨插件测试用同一 fixture——验证等价性

## 四、生态与实战

### 模式 16 · 选型：Spring Boot vs Quarkus vs Micronaut vs Helidon

**问题场景**：Java 应用框架选型——Spring Boot / Quarkus / Micronaut / Helidon / 裸 Maven Shade？

**解决方案**：决策树——生态最广 + 文档最全选 Spring Boot；云原生 + GraalVM 选 Quarkus；轻量级 DI 选 Micronaut；Oracle 系选 Helidon。

```
决策树：
  GraalVM 原生镜像？
    ├── 是 → Quarkus（最佳支持）
    │       └── Micronaut（次选）
    └── 否 → 业务复杂度？
              ├── 简单 (<10 entity) → 裸 Maven Shade
              ├── 中等 → Micronaut
              └── 复杂 → Spring Boot
```

**关键参数**：

| 框架 | 复杂度 | 生态 | 启动时间 | 内存 |
|------|--------|------|----------|------|
| Spring Boot | 7/10 | 9.5/10 | 1.5s | 200MB |
| Quarkus | 8/10 | 5/10 | 0.5s | 50MB |
| Micronaut | 7/10 | 4/10 | 0.8s | 80MB |
| Helidon | 6/10 | 3/10 | 0.5s | 60MB |
| 裸 Maven Shade | 3/10 | 7/10 | 5s+ | 300MB |
| 决策 | 业务 + 团队 + 云原生 | — | — | — |

**最佳实践**：
- 90% Java 应用选 Spring Boot（生态 + 文档 + 人才）——K8s + 微服务首选
- GraalVM 原生镜像选 Quarkus——启动快 + 内存省
- 编译时 DI 选 Micronaut——启动快 + 编译期检查
- Oracle 系（Helidon SE/MP）——Oracle 客户选
- 简单脚本用 Maven Shade——但失去大量生态

### 模式 17 · 7 天复刻 mini-spring-boot-build 路线

**问题场景**：想理解 Spring Boot 插件事件总线 + Lazy Provider + Layer 切片；想 7 天复刻 MVP。

**解决方案**：7 天 MVP——Day 1 克隆 + 阅读 build.gradle，Day 2 读 SpringBootPlugin + 6 Action，Day 3 写最小 BootJar，Day 4 实现 ResolveMainClassName 策略链，Day 5 加 layers.idx 生成，Day 6 TestKit 集成测试，Day 7 Buildpack 对接。

```
Day1: 克隆 + 阅读 build.gradle
      - git clone https://github.com/spring-projects/spring-boot
      - 看 build-plugin/ 目录结构
Day2: 读 SpringBootPlugin + 6 个 Action
      - SpringBootPlugin.apply 是门面
      - 6 Action 各负责一个底层插件
Day3: 写一个最小 BootJar（只重写归档）
      - extends Jar
      - into("BOOT-INF/classes") + into("BOOT-INF/lib")
      - manifest Main-Class: JarLauncher
Day4: 实现 ResolveMainClassName 策略链
      - 4 个策略
      - 按序尝试
Day5: 加 layers.idx 生成
      - 5 个 layer
      - BOOT-INF/layers.idx 文件
Day6: 写 TestKit 集成测试
      - src/intTest
      - 验证 bootJar 产出
Day7: 写 Buildpack 对接（只生成 layers.idx）
      - BootBuildImage 任务
      - spring-boot-buildpack-platform 调 pack
```

**关键参数**：

| Day | 模块 | 行数 |
|-----|------|------|
| 1 | clone + 读 build.gradle | — |
| 2 | 读 SpringBootPlugin + Action | — |
| 3 | 最小 BootJar | 200 |
| 4 | ResolveMainClassName 策略链 | 150 |
| 5 | layers.idx 生成 | 100 |
| 6 | TestKit 集成测试 | 300 |
| 7 | Buildpack 对接 | 250 |
| 总 | — | ~1000 行 |

**最佳实践**：
- 复刻 mini-spring-boot-build 先做 SpringBootPlugin + BootJar——核心 1000 行 2 周能出可用品
- Day 3 别跳——extends Jar 是关键
- Day 5 layers.idx 是镜像层优化核心
- Day 6 TestKit 必加——单测不够
- Day 7 Buildpack 跳过能省 50% 工作量——先做 layers.idx

### 模式 18 · 镜像层优化实战

**问题场景**：Spring Boot 镜像 200MB+，每次代码变更全重建——Docker 缓存命中率低。

**解决方案**：Buildpack 生成的镜像自动按 BOOT-INF/layers.idx 切片——依赖变更时只重建对应层，命中率 95%+。

```bash
# 生成镜像
$ gradle bootBuildImage

# 镜像层结构（按 layers.idx 切）
$ docker history myapp:0.0.1-SNAPSHOT
IMAGE          CREATED         SIZE
sha256:def     2 minutes ago   5MB      # application 层（业务 class）
sha256:abc     5 minutes ago   20MB     # snapshot-dependencies
sha256:789     1 hour ago      50MB     # dependencies
sha256:456     1 hour ago      10MB     # spring-boot-loader
sha256:123     2 hours ago     80MB     # base image
```

**关键参数**：

| 字段 | 说明 |
|------|------|
| 工具 | Cloud Native Buildpacks |
| 输入 | `BOOT-INF/layers.idx` 5 layer 索引 |
| 输出 | OCI 镜像分层 |
| 命中率 | application 层代码变更不影响 dependencies 层 |
| 流程 | `gradle bootBuildImage` 一键生成 |
| 替代 | 手写 Dockerfile（难维护） |
| builder | `paketobuildpacks/builder-jammy-java-tiny` 50MB base |

**最佳实践**：
- Spring Boot 镜像必走 Buildpack（vs. 手写 Dockerfile）——layer 切片 + 95% 缓存命中
- 改 builder：`builder = "paketobuildpacks/builder-jammy-java-tiny"` 更小
- CI 用 `cleanCache = true`——避免陈旧缓存
- 监控镜像层 hash——业务代码层变化不应影响 dependencies 层
- 镜像大小 200MB+ 是常态——GC、GC 日志、debug symbols 占空间

### 模式 19 · 3 大可复用模式

**问题场景**：构建工具插件项目通用模式有哪些？值得复用什么？

**解决方案**：3 件必偷——① `PluginApplicationAction` 接口 + `getPluginClass()` 返回底层插件 Class；② `Property<T>` 全量使用配合 Gradle Configuration Cache；③ `BOOT-INF/classes + BOOT-INF/lib + BOOT-INF/layers.idx` 三件套归档。

```groovy
// 模式 1: PluginApplicationAction 接口
interface PluginApplicationAction {
    Class<? extends Plugin<?>> getPluginClass()
    void execute(Project project)
}

// 模式 2: Property<T> 字段
abstract class MyExtension {
    abstract Property<String> getMainClass()
    abstract Property<Integer> getPort()
}

// 模式 3: 三件套归档
abstract class MyFatJar extends Jar {
    @Override
    void copy() {
        into("META-INF/classes") { from sourceSets.main.output }
        into("META-INF/lib") { from configurations.runtimeClasspath }
        into("META-INF") { from { generateLayersIdx() } }
        super.copy()
    }
}
```

**关键参数**：

| 模式 | 接口/类 | 适用 | 收益 |
|------|----------|------|------|
| Action 模式 | `getPluginClass()` + `execute(project)` | 多语言构建 | 解耦 + 扩展 |
| Property 模式 | `project.getObjects().property(String.class)` | Gradle 5+ 插件 | 性能 + 配置缓存 |
| 三件套归档 | `BOOT-INF/classes/` + `lib/` + `layers.idx` | 可执行 jar | Docker 缓存 + 启动 |
| 适用 | 任何 Gradle 插件项目 | — | 性能 + 扩展性 + 缓存 |

**最佳实践**：
- 构建工具插件抄 3 件套（Action + Property + 三件套归档）——立竿见影
- Action 模式：避免命令式 if-else 嵌套
- Property 模式：避免配置缓存不命中
- 三件套归档：避免 Docker 缓存失效
- 组合使用：1+1+1 > 3

### 模式 20 · Spring Boot 演进历史与设计哲学

**问题场景**：Spring Boot 2014-2026 演进——什么驱动 1.x → 2.x → 3.x → 4.x 大版本变化？

**解决方案**：历史回顾——1.x (2014 起步) → 2.x (2018 Spring 5 + WebFlux) → 2.3 (2020 Buildpacks) → 3.x (2022 Jakarta EE + Java 17) → 3.4 (2024 虚拟线程) → 4.x (2026 路线)。

```
时间线：
2014  1.0  起步，@SpringBootApplication 注解
2015  1.3  起步 actuator
2017  1.5  起步 WebFlux
2018  2.0  Spring 5 + WebFlux 转正
2019  2.2  Java 13 baseline
2020  2.3  Buildpacks 支持
      2.4  配置文件拆分
2021  2.5  Java 16 baseline
2022  3.0  Jakarta EE + Java 17 baseline（重大破坏性升级）
      3.1  GraalVM AOT 雏形
2023  3.2  AOT 转正
2024  3.4  虚拟线程（Loom）
      3.5  JDK 21 baseline
2026  4.0  路线：JDK 25 + Jakarta EE 11
```

**关键参数**：

| 版本 | 关键变化 | 驱动 |
|------|----------|------|
| 1.x (2014) | 起步 | 简化 Spring 配置 |
| 2.0 (2018) | Spring 5 + WebFlux | 响应式 |
| 2.3 (2020) | Buildpacks | 云原生 |
| 3.0 (2022) | Jakarta EE + Java 17 | Oracle 授权变化 + LTS |
| 3.2 (2023) | AOT 雏形 | GraalVM |
| 3.4 (2024) | 虚拟线程 | Project Loom |
| 4.0 (2026 路线) | JDK 25 + Jakarta EE 11 | 下一代 |
| 关键哲学 | "先 API 稳定、再加新特性、最后性能优化" | 用户平滑升级 |

**最佳实践**：
- 长生命周期框架按"先 API 稳定、再加新特性、最后性能优化"演进（vs. 一次性大重构）——用户平滑升级
- 大版本重写要"分两版"——3.0 + 3.x 共存期 24+ 月
- LTS baseline 是硬规则——Java 17/21/25 是 3.x/4.x 的硬性要求
- 重大升级要破坏性（3.0 Jakarta）——但提前 1 年公告
- 演进历史要写进 release-notes.md——给后来人参考
- 每年 2 个小版本（.0 + .x）——稳定节奏

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
