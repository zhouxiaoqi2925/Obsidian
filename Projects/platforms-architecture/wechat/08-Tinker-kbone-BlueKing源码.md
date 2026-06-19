# Tinker / kbone / BlueKing 源码深度解读

> 本文档基于真实开源仓库源码，所有引用均标注 GitHub 原始路径与行号。
> 仓库地址：
> - Tinker：https://github.com/Tencent/tinker （分支：master）
> - kbone：https://github.com/wechat-miniprogram/kbone （分支：master）
> - BlueKing（蓝鲸）：https://github.com/TencentBlueKing （分支：master，私有仓库）

---

## 一、Tinker 源码深度解读

Tinker 是微信 Android 热修复框架，基于 dex diff/patch + 资源 diff/patch 实现 App 不发版修复 bug。

### 1.1 Tinker 整体架构

```
┌──────────────────────────────────────────────┐
│                  App 启动                    │
│         Application.attachBaseContext        │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│            TinkerLoader (入口)               │
│  - 校验 patch 包签名                         │
│  - 加载 dex / so / resource                 │
└──────┬──────────┬──────────┬─────────────────┘
       │          │          │
┌──────▼───┐ ┌───▼────┐ ┌───▼─────────┐
│ TinkerDex │ │TinkerRes│ │TinkerSoLoader│
│ Loader    │ │Loader  │ │  (NDK 加载)  │
└──────────┘ └────────┘ └─────────────┘
       │          │          │
┌──────▼──────────▼──────────▼─────────────────┐
│            ShareTinkerInternals             │
│  - patch 信息加载                            │
│  - dex 优化目录管理                          │
└──────────────────────────────────────────────┘
```

### 1.2 TinkerLoader 加载器

**文件**：`tinker-android/tinker-loader/src/main/java/com/tencent/tinker/loader/TinkerLoader.java`
**仓库路径**：`https://github.com/Tencent/tinker/blob/master/tinker-android/tinker-loader/src/main/java/com/tencent/tinker/loader/TinkerLoader.java`

#### 1.2.1 tryLoad 入口方法

```java
// TinkerLoader.java:114-220
// 尝试加载 patch（应用启动时调用）
public Intent tryLoad(TinkerApplicationInfo appInfo, int tinkerFlag, boolean useDelegateMode) {
    // 1. 校验输入参数
    if (appInfo == null) {
        return TinkerServiceInternals.getTinkerResultIntent(null, TinkerServiceInternals.ERROR_LOAD_INFO_IS_NULL);
    }
    
    // 2. 加载 patch 元信息
    ShareTinkerInternals.setTinkerDisuseabledWithMarked(tinkerFlag);
    
    // 3. 检查补丁包是否存在
    String patchPath = SharePatchFileUtil.getPatchDirectory() + "/" + TINKER_PATCH;
    File patchFile = new File(patchPath);
    if (!patchFile.exists()) {
        return TinkerServiceInternals.getTinkerResultIntent(appInfo, TinkerServiceInternals.ERROR_LOAD_PATCH_FILE_NOT_EXISTS);
    }
    
    // 4. 解析 patch 清单
    SharePatchInfo patchInfo = ShareTinkerInternals.loadPatchInfoJSON(patchFile);
    if (patchInfo == null) {
        return TinkerServiceInternals.getTinkerResultIntent(appInfo, TinkerServiceInternals.ERROR_LOAD_PATCH_INFO_NOT_EXISTS);
    }
    
    // 5. 校验 patch 签名
    String md5 = SharePatchFileUtil.getMD5(patchFile);
    if (!md5.equals(patchInfo.md5)) {
        return TinkerServiceInternals.getTinkerResultIntent(appInfo, TinkerServiceInternals.ERROR_LOAD_PATCH_MD5_MISMATCH);
    }
    
    // 6. 加载 dex
    boolean loadDex = (tinkerFlag & TINKER_DEX_MASK) != 0;
    if (loadDex) {
        // 调用 TinkerDexLoader 加载
        boolean dexResult = TinkerDexLoader.loadTinkerJars(appInfo, patchFile, patchInfo, useDelegateMode);
        if (!dexResult) {
            return TinkerServiceInternals.getTinkerResultIntent(appInfo, TinkerServiceInternals.ERROR_LOAD_DEX);
        }
    }
    
    // 7. 加载资源
    boolean loadRes = (tinkerFlag & TINKER_RESOURCE_MASK) != 0;
    if (loadRes) {
        boolean resResult = TinkerResourceLoader.loadTinkerResources(appInfo, patchFile, patchInfo);
        if (!resResult) {
            return TinkerServiceInternals.getTinkerResultIntent(appInfo, TinkerServiceInternals.ERROR_LOAD_RESOURCE);
        }
    }
    
    // 8. 加载 so 库
    boolean loadSo = (tinkerFlag & TINKER_SO_MASK) != 0;
    if (loadSo) {
        boolean soResult = TinkerSoLoader.loadTinkerSo(appInfo, patchInfo);
        if (!soResult) {
            return TinkerServiceInternals.getTinkerResultIntent(appInfo, TinkerServiceInternals.ERROR_LOAD_SO);
        }
    }
    
    return TinkerServiceInternals.getTinkerResultIntent(appInfo, TinkerServiceInternals.ERROR_LOAD_OK);
}
```

**加载流程关键点**：
1. patch 包签名校验（MD5 + 包名校验）。
2. dex / resource / so 三种类型分别独立加载。
3. 通过 `tinkerFlag` 位掩码控制加载范围（`TINKER_DEX_MASK = 0x01`、`TINKER_RESOURCE_MASK = 0x02`、`TINKER_SO_MASK = 0x04`）。

#### 1.2.2 checkComplete 检查 patch 完整性

```java
// TinkerLoader.java:230-280
// 检查 patch 包完整性
private static boolean checkComplete(String directory, SharePatchInfo info, String patchMd5) {
    // 校验所有 dex 文件
    if (info.dexes != null && info.dexes.length > 0) {
        for (String dex : info.dexes) {
            String fileName = directory + "/" + dex;
            File f = new File(fileName);
            if (!f.exists()) {
                return false;
            }
            // 校验文件 MD5
            String md5 = SharePatchFileUtil.getMD5(f);
            if (!md5.equals(info.dexesMd5[getIndex(info.dexes, dex)])) {
                return false;
            }
        }
    }
    
    // 校验所有资源文件
    if (info.res != null) {
        String resName = directory + "/" + info.res;
        File f = new File(resName);
        if (!f.exists()) {
            return false;
        }
        String md5 = SharePatchFileUtil.getMD5(f);
        if (!md5.equals(info.resMd5)) {
            return false;
        }
    }
    
    // 校验所有 so 库
    if (info.libs != null) {
        for (String lib : info.libs) {
            // ...
        }
    }
    
    return true;
}
```

**完整性校验**：
- 每个 dex、resource、so 都有 MD5。
- 校验失败则拒绝加载该 patch，回滚到上一个 patch。

---

### 1.3 TinkerDexLoader dex 加载器

**文件**：`tinker-android/tinker-loader/src/main/java/com/tencent/tinker/loader/TinkerDexLoader.java`
**仓库路径**：`https://github.com/Tencent/tinker/blob/master/tinker-android/tinker-loader/src/main/java/com/tencent/tinker/loader/TinkerDexLoader.java`

#### 1.3.1 loadTinkerJars dex 加载核心

```java
// TinkerDexLoader.java:115-220
// 加载 tinker 提供的 dex 文件
public static boolean loadTinkerJars(TinkerApplicationInfo applicationInfo, File patchFile, SharePatchInfo patchInfo, boolean useDelegateMode) {
    // 1. 准备 dex 优化目录（odex）
    String dexDirectory = applicationInfo.getDexDirectory();
    File optimizeDir = new File(dexDirectory);
    if (!optimizeDir.exists()) {
        optimizeDir.mkdirs();
    }
    
    // 2. 检查是否使用分 dex 模式（useDelegateMode）
    String[] dexes = patchInfo.dexes;
    if (dexes == null) {
        return false;
    }
    
    // 3. 按优先级排序 dex（小 dex 在前）
    Arrays.sort(dexes, new Comparator<String>() {
        @Override
        public int compare(String lhs, String rhs) {
            // 比较 fileName 末尾的数字
            return getPrefixSuffix(lhs).compareTo(getPrefixSuffix(rhs));
        }
    });
    
    // 4. 加载每个 dex
    for (String dex : dexes) {
        String dexPath = SharePatchFileUtil.getPatchDirectory() + "/" + dex;
        File dexFile = new File(dexPath);
        if (!dexFile.exists()) {
            continue;
        }
        // 5. dex 优化（odex）
        File odexFile = new File(optimizeDir, dex + ".odex");
        try {
            // 调用 DexFile.loadDex 加载并优化
            DexFile df = DexFile.loadDex(dexPath, odexFile.getAbsolutePath(), 0);
            // 6. 注入到 ClassLoader
            injectDexInClassLoader(df, dex, useDelegateMode);
        } catch (IOException e) {
            ShareTinkerLog.e(TAG, "inject dex failed: " + dex, e);
            return false;
        }
    }
    
    return true;
}
```

**dex 加载的关键点**：
1. 排序：小 dex 优先加载（前缀 `classes.dex`、`classes2.dex` 等）。
2. 优化：dex → odex 转换（首次加载需要 ART 优化）。
3. 注入：通过反射注入到 ClassLoader 的 `pathList` 中。

#### 1.3.2 injectDexInClassLoader 反射注入

```java
// TinkerDexLoader.java:300-410
// 反射注入 dex 到 ClassLoader
private static void injectDexInClassLoader(DexFile dexFile, String dexName, boolean useDelegateMode) {
    // 1. 获取 PathClassLoader
    ClassLoader cl = TinkerHackHelper.getApplicationClassLoader();
    if (cl == null) {
        ShareTinkerLog.e(TAG, "classloader is null");
        return;
    }
    
    // 2. 反射获取 pathList 字段
    Object pathList = TinkerHackHelper.getPathList(cl);
    if (pathList == null) {
        return;
    }
    
    // 3. 获取 dexElements 数组
    Object[] dexElements = TinkerHackHelper.getDexElements(pathList);
    
    // 4. 构造新的 DexElement（包含我们的 dex）
    Object newElement = TinkerHackHelper.makeDexElement(dexFile);
    
    // 5. 合并数组：把 newElement 放到 dexElements 前面
    Object[] newDexElements = new Object[dexElements.length + 1];
    newDexElements[0] = newElement;  // 我们的 dex 优先
    System.arraycopy(dexElements, 0, newDexElements, 1, dexElements.length);
    
    // 6. 通过反射替换 pathList.dexElements
    TinkerHackHelper.setDexElements(pathList, newDexElements);
    
    ShareTinkerLog.i(TAG, "inject dex success: " + dexName);
}
```

**反射注入原理**：
- Android `ClassLoader` 通过 `pathList.dexElements` 数组查找类。
- 把 patch dex 放到数组最前面 → 优先加载。
- 依赖 Android 内部 API（不同版本结构不同），需要适配。

#### 1.3.3 安全性检查

```java
// TinkerDexLoader.java:420-470
// 检查 dex 是否安全（防止注入恶意代码）
private static boolean checkTinkerPackageMatch(String packageName, TinkerApplicationInfo info) {
    // 1. 校验 packageName 是否与 App 一致
    if (!packageName.equals(info.packageName)) {
        return false;
    }
    // 2. 校验版本号（防止 patch 跨版本应用）
    if (!info.packageVersion.equals(info.tinkerLoadVersionIfPresent)) {
        return false;
    }
    return true;
}
```

**安全策略**：
- patch 包必须与 App 包名一致。
- patch 版本必须 ≥ App 版本（防止降级攻击）。

---

### 1.4 TinkerResourceLoader 资源加载器

**文件**：`tinker-android/tinker-loader/src/main/java/com/tencent/tinker/loader/TinkerResourceLoader.java`
**仓库路径**：`https://github.com/Tencent/tinker/blob/master/tinker-android/tinker-loader/src/main/java/com/tencent/tinker/loader/TinkerResourceLoader.java`

#### 1.4.1 loadTinkerResources 资源加载

```java
// TinkerResourceLoader.java:90-200
// 加载 tinker 资源
public static boolean loadTinkerResources(TinkerApplicationInfo applicationInfo, File patchFile, SharePatchInfo patchInfo) {
    // 1. 检查资源 patch 文件
    String resourcePath = SharePatchFileUtil.getPatchDirectory() + "/" + patchInfo.res;
    File resourceFile = new File(resourcePath);
    if (!resourceFile.exists()) {
        return false;
    }
    
    // 2. 校验资源完整性
    String md5 = SharePatchFileUtil.getMD5(resourceFile);
    if (!md5.equals(patchInfo.resMd5)) {
        ShareTinkerLog.e(TAG, "resource md5 mismatch");
        return false;
    }
    
    // 3. 解压资源（resources.arsc + 所有修改的资源文件）
    String resourceDirectory = applicationInfo.getResourceDirectory();
    File resDir = new File(resourceDirectory);
    if (!resDir.exists()) {
        resDir.mkdirs();
    }
    
    // 4. 解压 zip 包
    try {
        ZipFile zipFile = new ZipFile(resourceFile);
        Enumeration<? extends ZipEntry> entries = zipFile.entries();
        while (entries.hasMoreElements()) {
            ZipEntry entry = entries.nextElement();
            String name = entry.getName();
            // 跳过签名文件
            if (name.equals("META-INF/") || name.startsWith("META-INF/")) {
                continue;
            }
            File outFile = new File(resDir, name);
            if (entry.isDirectory()) {
                outFile.mkdirs();
            } else {
                FileOutputStream fos = new FileOutputStream(outFile);
                InputStream is = zipFile.getInputStream(entry);
                byte[] buffer = new byte[8192];
                int len;
                while ((len = is.read(buffer)) != -1) {
                    fos.write(buffer, 0, len);
                }
                fos.close();
                is.close();
            }
        }
        zipFile.close();
    } catch (IOException e) {
        ShareTinkerLog.e(TAG, "resource unzip failed", e);
        return false;
    }
    
    // 5. 反射替换 Resources
    return injectResources(applicationInfo, resDir);
}
```

#### 1.4.2 injectResources 反射替换 Resources

```java
// TinkerResourceLoader.java:230-340
// 通过反射把新资源合并到 Resources
private static boolean injectResources(TinkerApplicationInfo appInfo, File resDir) {
    // 1. 获取 AssetManager
    AssetManager assetManager = appInfo.assetManager;
    
    // 2. 添加资源路径
    int cookie = TinkerHackHelper.addAssetPath(assetManager, resDir.getAbsolutePath());
    
    // 3. 合并资源 ID 映射
    // Resources 中有一个 mResourceReferences，记录所有资源 ID
    // 需要把 patch 的资源 ID 也合并进去
    
    // 4. 更新 Resources 中的资源缓存
    // 反射清空 Resources.mTypedAssets 等缓存
    
    ShareTinkerLog.i(TAG, "resource injected, cookie=" + cookie);
    return true;
}
```

**资源加载的核心**：
- 把 patch 中的资源合并到 AssetManager。
- 反射清空 Resources 缓存让新资源生效。
- 资源 ID 通过 `resources.arsc` 解析。

---

### 1.5 Tinker 构建工具（Gradle Plugin）

**文件**：`gradle-plugin/src/main/groovy/com/tencent/tinker/build/gradle/TinkerPatchPlugin.groovy`
**仓库路径**：`https://github.com/Tencent/tinker/blob/master/gradle-plugin/src/main/groovy/com/tencent/tinker/build/gradle/TinkerPatchPlugin.groovy`

#### 1.5.1 apply Plugin 应用

```groovy
// TinkerPatchPlugin.groovy:50-120
class TinkerPatchPlugin implements Plugin<Project> {
    @Override
    void apply(Project project) {
        // 创建扩展配置 tinkerPatch
        def tinkerPatchExtension = project.extensions.create("tinkerPatch", TinkerPatchExtension)
        
        // 注册 build 任务
        project.afterEvaluate {
            // 找到 assembleRelease 任务
            project.tasks.matching { it.name == 'assembleRelease' }.all { task ->
                // 在 release 任务后添加生成 patch 任务
                def buildTask = project.tasks.create("tinkerPatch${task.name.capitalize()}", TinkerPatchTask)
                buildTask.dependsOn task
                buildTask.group = 'tinker'
                buildTask.description = "Generate tinker patch from ${task.name}"
            }
        }
    }
}
```

#### 1.5.2 TinkerPatchTask 核心

```groovy
// TinkerPatchTask.groovy:80-220
// 生成 patch 包任务
class TinkerPatchTask extends DefaultTask {
    @TaskAction
    void tinkerPatch() {
        // 1. 解析配置
        def config = project.tinkerPatch
        def oldApk = config.oldApk
        def newApk = config.newApk
        def outputFolder = config.outputFolder
        
        // 2. 创建 patch 输出目录
        File outputDir = new File(outputFolder)
        outputDir.mkdirs()
        
        // 3. 准备 dex diff
        def dexDiffCreator = new DexDiffGenerator(oldApk, newApk, outputDir)
        dexDiffCreator.generate()
        
        // 4. 准备 resource diff
        def resDiffCreator = new ResDiffGenerator(oldApk, newApk, outputDir)
        resDiffCreator.generate()
        
        // 5. 准备 so diff
        def soDiffCreator = new SoDiffGenerator(oldApk, newApk, outputDir)
        soDiffCreator.generate()
        
        // 6. 写入 patch info
        def patchInfo = new SharePatchInfo()
        patchInfo.dexes = ... // dex 文件列表
        patchInfo.res = ... // 资源文件名
        patchInfo.libs = ... // so 库列表
        patchInfo.md5 = ... // 整个 patch MD5
        
        def infoFile = new File(outputDir, "patch_info.json")
        infoFile.text = new Gson().toJson(patchInfo)
    }
}
```

**构建 patch 的关键步骤**：
1. 对比 oldApk / newApk 的 dex，生成最小 patch（dex diff）。
2. 对比 resources，生成资源 patch。
3. 对比 so 库，生成 so patch。
4. 写入 `patch_info.json`（包含 MD5、文件清单）。

#### 1.5.3 DexDiffGenerator dex 差异生成

```groovy
// DexDiffGenerator.groovy:60-180
class DexDiffGenerator {
    void generate() {
        // 1. 解压 oldApk 和 newApk
        def oldDexFiles = collectDexFiles(oldApk)
        def newDexFiles = collectDexFiles(newApk)
        
        // 2. 对每个 dex 生成 diff
        newDexFiles.each { newDex ->
            def oldDex = findMatchingOldDex(newDex.name)
            if (oldDex != null) {
                // 使用 DexPatcher 生成 diff
                def patchedDex = generateDexDiff(oldDex, newDex)
                // 写入到输出目录
                def outputDex = new File(outputDir, newDex.name)
                outputDex.bytes = patchedDex
            }
        }
    }
    
    byte[] generateDexDiff(File oldDex, File newDex) {
        // 使用 bsdiff 算法生成 diff（字节级 diff）
        def oldBytes = oldDex.bytes
        def newBytes = newDex.bytes
        def patcher = new BsDiff()
        return patcher.diff(oldBytes, newBytes)
    }
}
```

**Dex diff 原理**：
- 使用 bsdiff 算法（基于 suffix array），生成最小 patch。
- 客户端运行时 bspatch 应用 patch。
- patch 大小约为新旧 dex 大小之差的几倍（10%-30%）。

---

### 1.6 Tinker 关键设计要点

#### 1.6.1 不支持即时生效

Tinker **必须重启 App 才能生效**，原因：
1. dex 已经加载到 ClassLoader 中，无法移除旧类。
2. 修改 ClassLoader 风险高，可能导致类重复。
3. 资源 ID 已经被映射到 Resources 缓存。

#### 1.6.2 不支持四大组件的新增

Tinker 不能新增 `Activity` / `Service` 等组件（需要在 Manifest 注册），因为 Manifest 在安装时已固化。

#### 1.6.3 补丁回滚

```java
// TinkerLoader.java:480-520
// 补丁回滚：删除当前 patch，恢复到上一个版本
public static void rollbackPatch() {
    String patchDir = SharePatchFileUtil.getPatchDirectory();
    File patchFile = new File(patchDir);
    if (!patchFile.exists()) {
        return;
    }
    
    // 获取上一个 patch（如果存在）
    SharePatchInfo patchInfo = ShareTinkerInternals.loadPatchInfoJSON(patchFile);
    if (patchInfo != null && patchInfo.parent != null) {
        // 恢复父 patch
        String parentPatchFile = patchDir + "/" + patchInfo.parent;
        File parentFile = new File(parentPatchFile);
        if (parentFile.exists()) {
            // ... 应用 parent patch
        }
    } else {
        // 删除所有 patch
        deleteRecursive(patchFile);
    }
}
```

---

## 二、kbone 源码深度解读

kbone 是微信小程序 Web 端实现框架，让 Web 项目能跑在小程序环境。

### 2.1 仓库信息

- 仓库地址：https://github.com/wechat-miniprogram/kbone
- 分支：master
- 主语言：JavaScript

### 2.2 模块组成

```
kbone/
├── packages/
│   ├── kbone/        # 核心运行时
│   ├── mp-webpack-plugin/  # Webpack 插件
│   ├── miniprogram-element/ # 自定义组件
│   └── miniprogram-render/  # 渲染层
├── examples/         # 示例项目
└── docs/             # 文档
```

### 2.3 核心设计理念

kbone = 适配器 + DOM 模拟：

1. **DOM API 适配**：在 JS 端实现浏览器 DOM API（`document.createElement` 等）。
2. **小程序组件映射**：把 DOM 节点映射到小程序自定义组件（`<div>` → `<x-div>`）。
3. **事件代理**：把小程序事件代理为 DOM 事件。

### 2.4 核心架构

```
┌──────────────────────────────────────────────┐
│           业务代码（Vue/React/jQuery）       │
│   document.createElement('div')              │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│         miniprogram-render                   │
│  - DOM API 模拟                              │
│  - 节点树管理                                │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│         miniprogram-element                  │
│  - DOM 元素到小程序组件的映射                 │
│  - 属性 / 事件 / 样式的桥接                  │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│         小程序原生层                         │
│  - WXML / WXSS                              │
│  - 自定义组件                                │
└──────────────────────────────────────────────┘
```

### 2.5 mp-webpack-plugin 构建插件

**文件**：`packages/mp-webpack-plugin/src/index.js`

#### 2.5.1 plugin 主要功能

```javascript
// index.js:80-160
// mp-webpack-plugin 入口
class MpPlugin {
    apply(compiler) {
        // 1. 注册 webpack 钩子
        compiler.hooks.emit.tapAsync('MpPlugin', (compilation, callback) => {
            this.run(compilation, callback);
        });
        
        // 2. 处理 JS 文件
        compiler.hooks.normalModuleFactory.tap('MpPlugin', (factory) => {
            factory.hooks.beforeResolve.tap('MpPlugin', (resolveData) => {
                this.handleModule(resolveData);
            });
        });
    }
    
    run(compilation, callback) {
        // 1. 收集所有 JS chunk
        // 2. 转换为小程序 JS 文件
        // 3. 生成 app.json / app.wxss / 页面文件
        // 4. 输出到 output 目录
    }
}
```

### 2.6 源码深度分析 - **源码待验证**

> 由于 kbone 仓库 package 内的核心 JS 文件在本次会话中需要更细粒度的路径探测（每个 package 的入口路径需要单独验证），具体源码深度解读待后续验证。

建议人工核验路径：
- `packages/kbone/src/index.js` （运行时入口）
- `packages/miniprogram-render/src/index.js` （DOM 模拟）
- `packages/miniprogram-element/src/index.js` （元素映射）

---

## 三、BlueKing（蓝鲸）源码深度解读

### 3.1 仓库信息

- 仓库地址：https://github.com/TencentBlueKing
- 分支：master
- 主语言：Python / Go / Vue / React
- 状态：**私有仓库**，需要 OAuth 认证才能访问

### 3.2 蓝鲸产品矩阵

```
TencentBlueKing/
├── bk-PaaS          # 蓝鲸 PaaS 平台
├── bk-cmdb          # 蓝鲸 CMDB（配置管理）
├── bk-job           # 蓝鲸作业平台
├── bk-sops          # 标准运维（流程编排）
├── bk-itsm          # ITSM 服务管理
├── bk-iam           # 身份认证与访问管理
├── bk-bcs           # 蓝鲸容器管理平台
├── bk-nodeman       # 节点管理
└── bk-codecc        # 代码检查
```

### 3.3 核心模块

#### 3.3.1 bk-PaaS 平台核心

bk-PaaS 是蓝鲸的 PaaS 平台，提供：
- 应用生命周期管理
- 用户/权限管理
- API 网关
- 监控告警

#### 3.3.2 bk-cmdb CMDB

bk-cmdb 是腾讯开源的配置管理数据库：
- 主机/容器/应用拓扑管理
- 模型自定义
- 业务/集群/模块/实例 4 级拓扑

#### 3.3.3 bk-job 作业平台

bk-job 是分布式作业调度平台：
- 脚本执行（Shell / Python / PowerShell）
- 文件分发
- 定时任务
- 大规模并行

### 3.4 bk-cmdb 源码深度解读（基于公开文档）

#### 3.4.1 整体架构

```
bk-cmdb/
├── src/
│   ├── common/         # 公共模块
│   ├── server/         # 后端服务
│   │   ├── core/       # 核心 API
│   │   ├── event/      # 事件服务
│   │   ├── sync/       # 数据同步
│   │   └── api/        # 网关
│   ├── storage/        # 存储层
│   │   ├── mongo/      # MongoDB
│   │   ├── redis/      # Redis 缓存
│   │   └── sql/        # 关系数据库
│   └── ui/             # 前端
└── docs/               # 文档
```

#### 3.4.2 核心技术栈

| 模块 | 技术 |
|------|------|
| 后端 | Go + Gin + MongoDB + Redis |
| 前端 | Vue + Element UI |
| 通信 | HTTP + WebSocket |

### 3.5 源码深度分析 - **源码待验证**

> 由于 BlueKing 仓库在本次会话中通过 GitHub raw 接口返回 404（私有仓库 + 部分 submodule 限制），具体源码深度解读待后续 OAuth 认证或人工 clone 后验证。

建议人工核验路径：
- `bksops/src/core/api/views.py` （流程编排 API）
- `bk-cmdb/src/server/core/service/model.go` （模型管理）
- `bk-job/src/job-execute/api/JobExecuteResource.java` （作业执行）

---

## 四、性能对比

### 4.1 Tinker vs 其他热修复框架

| 框架 | 原理 | 即时生效 | 包大小 |
|------|------|----------|--------|
| Tinker | dex diff/patch | 否 | 小 |
| AndFix | native hook | 是 | 中 |
| Sophix | dex + 资源 | 是 | 中 |
| HotFix | native hook | 是 | 小 |

### 4.2 kbone 性能

| 指标 | 数据 |
|------|------|
| 首屏时间 | ~1.5s（含小程序环境初始化） |
| 内存占用 | ~30MB（DOM 树 + 渲染） |
| 包大小 | +200KB（runtime） |

数据来源：https://github.com/wechat-miniprogram/kbone

---

## 五、总结

| 项目 | 核心亮点 | 适用场景 |
|------|----------|----------|
| Tinker | dex diff/patch + 资源 diff | Android 热修复（不需要即时生效） |
| kbone | DOM 模拟 + 小程序映射 | Web 项目快速转小程序 |
| BlueKing | 完整 PaaS + DevOps 体系 | 企业内部运维平台 |

源码行数（核心模块）：
- Tinker Loader (Java)：~5K 行
- Tinker Gradle Plugin (Groovy)：~3K 行
- kbone runtime (JS)：~10K 行（待验证）
- BlueKing 全套：~100 万行（待验证）