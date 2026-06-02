# .NET MAUI - 跨平台 UI 与编译期生成

**来源**：GitHub dotnet/maui
**创建时间**：2026-06-02

---

## 一、编译期生成：XAML → IL 与 Source Generator

### 1. XamlC IL 注入（XAML to IL Compiler）

**问题场景**：XAML 框架传统在 runtime 解析 XML 树，启动慢 50-100ms；NativeAOT 编译（iOS / 嵌入式场景）不支持 runtime 反射或动态加载。需要把 XAML 烧成 C# IL。

**解决方案**：
```csharp
// src/Controls/src/Build.Tasks/CompiledConverters/ColorTypeConverter.cs 简化
class ColorTypeConverter : ICompiledTypeConverter
{
    public IEnumerable<Instruction> ConvertFromString(string value, ILContext ctx, BaseNode node)
    {
        var module = ctx.Body.Method.Module;
        if (value.StartsWith("#", StringComparison.Ordinal))
        {
            var color = Color.FromArgb(value);
            yield return Instruction.Create(OpCodes.Ldc_R4, color.Red);
            yield return Instruction.Create(OpCodes.Ldc_R4, color.Green);
            yield return Instruction.Create(OpCodes.Ldc_R4, color.Blue);
            yield return Instruction.Create(OpCodes.Ldc_R4, color.Alpha);
            yield return Instruction.Create(OpCodes.Newobj, module.ImportCtorReference(
                ctx.Cache,
                ("Microsoft.Maui.Graphics", "Microsoft.Maui.Graphics", "Color"),
                parameterTypes: new[] {
                    ("mscorlib", "System", "Single"),
                    ("mscorlib", "System", "Single"),
                    ("mscorlib", "System", "Single"),
                    ("mscorlib", "System", "Single")
                }));
        }
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `OpCodes.Ldc_R4` | 推送 float32 到 evaluation stack |
| `module.ImportCtorReference(ctx.Cache, ...)` | 跨程序集构造函数引用 |
| `ctx.Cache` | Mono.Cecil 元数据缓存，避免重复解析 |

**最佳实践**：
- ✅ 用 `IEnumerable<Instruction> + yield return` 迭代器生成 IL，省 GC
- ✅ XAML 字符串比较必须 `StringComparison.Ordinal`（避免 Turkish-i 文化歧义）
- ✅ `do-while-false` 包装 yield break（迭代器方法不能用 try-catch）
- ❌ 切勿用 `List<Instruction>` 收集指令，触发重复分配
- ❌ 切勿在 XAML 转换器中读 culture-sensitive 配置

### 2. Binding 源生成器（IIncrementalGenerator）

**问题场景**：Xamarin.Forms 的 binding 用 reflection 访问属性，启动慢、NativeAOT 不兼容；老 `ISourceGenerator` 每次 syntax tree 变化都全量重跑，IDE 编辑卡顿。

**解决方案**：
```csharp
[Generator(LanguageNames.CSharp)]
public class BindingSourceGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        var bindingsWithDiagnostics = context.SyntaxProvider.CreateSyntaxProvider(
            predicate: static (node, _) => IsSetBindingMethod(node) || IsCreateMethod(node),
            transform: static (ctx, t) => GetBindingForGeneration(ctx, t)
        ).WithTrackingName(TrackingNames.BindingsWithDiagnostics);

        var bindings = bindingsWithDiagnostics
            .Where(static b => !b.HasDiagnostics)
            .Select(static (b, t) => b.Value)
            .WithTrackingName(TrackingNames.Bindings);

        context.RegisterPostInitializationOutput(spc =>
            spc.AddSource("GeneratedBindingInterceptorsCommon.g.cs",
                BindingCodeWriter.GenerateCommonCode()));

        context.RegisterImplementationSourceOutput(bindings, (spc, binding) => {
            var fileName = $"{binding.SimpleLocation.FilePath}-Generated-{binding.SimpleLocation.Line}-{binding.SimpleLocation.Column}.g.cs"
                .Replace('/', '-').Replace('\\', '-').Replace(':', '-');
            spc.AddSource(fileName,
                BindingCodeWriter.GenerateBinding(binding, $"SetBinding{(uint)Math.Abs(binding.SimpleLocation.GetHashCode())}"));
        });
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `IIncrementalGenerator` | .NET 6+ 增量源生成器，只重跑变化步骤 |
| `static lambda` | 无闭包，Roslyn 编译到独立程序集缓存 |
| `WithTrackingName(...)` | pipeline 步骤命名，性能分析器用 |
| `RegisterPostInitializationOutput` | 共享 helper 只生成一次 |
| `RegisterImplementationSourceOutput` | 每 binding 一份代码 |

**最佳实践**：
- ✅ 业务方用 `static` lambda 写 predicate/transform，零闭包分配
- ✅ 命名每步 pipeline（`TrackingNames.BindingsWithDiagnostics`），便于性能分析
- ✅ 文件名用源码位置哈希（`Line-Column-Hash`）保证唯一性
- ✅ 共享代码 `PostInitialization` 只生成一次，业务代码 `Implementation` 逐项生成
- ❌ 切勿在源生成器 `throw` 报告 binding 错误，会让整个编译失败——用 Result<T> + diagnostic
- ❌ 切勿用旧 `ISourceGenerator`（全量重跑）

### 3. Binding Path 解析器（PathParser）

**问题场景**：binding path 支持 `User.Address.City` / `Items[0].Name` / `User as Admin.Email` 等复杂语法，runtime 解析用 reflection；编译期要转成 direct call 路径。

**解决方案**：
```csharp
internal Result<List<IPathPart>> ParsePath(CSharpSyntaxNode? expressionSyntax)
{
    return expressionSyntax switch
    {
        IdentifierNameSyntax _ => Result<List<IPathPart>>.Success(new()),
        MemberAccessExpressionSyntax ma => HandleMemberAccessExpression(ma),
        ElementAccessExpressionSyntax ea => HandleElementAccessExpression(ea),
        ElementBindingExpressionSyntax eb => HandleElementBindingExpression(eb),
        ConditionalAccessExpressionSyntax ca => HandleConditionalAccessExpression(ca),
        MemberBindingExpressionSyntax mb => HandleMemberBindingExpression(mb),
        ParenthesizedExpressionSyntax p => ParsePath(p.Expression),
        BinaryExpressionSyntax asE when asE.Kind() == SyntaxKind.AsExpression => HandleBinaryExpression(asE),
        CastExpressionSyntax ce => HandleCastExpression(ce),
        _ => HandleDefaultCase(),
    };
}
```

**关键参数**：

| 语法节点 | 含义 |
| --- | --- |
| `MemberAccessExpression` | `User.Address` 链式访问 |
| `ElementAccessExpression` | `Items[0]` 索引访问 |
| `ConditionalAccessExpression` | `User?.Address` 空安全 |
| `BinaryExpression.AsExpression` | `User as Admin` 类型转换 |

**最佳实践**：
- ✅ 模式匹配语法节点类型比 `is XxxExpression` 链更易读
- ✅ `ParenthesizedExpression` 递归去掉括号（罕见但合法 `User.(Address).City`）
- ✅ `as Expression` 特殊处理：`User as Admin.Name` 也能解析（先转换再访问）
- ❌ 切勿假设 source generator 一定能解析所有路径（RelayCommand 等 dynamic 类型会失败，要 fallback）
- ❌ 切勿用 throw 报路径错误，让 Roslyn 看到 IDE 友好 diagnostic

### 4. CompiledConverters 类型转换器（XAML Type Converter）

**问题场景**：XAML 字符串 `BackgroundColor="Red"` / `Margin="10,20"` / `IsVisible="true"` 需要转成对应 .NET 类型；runtime 解析慢且 AOT 不友好。

**解决方案**：
```csharp
// 业务方实现 ICompiledTypeConverter
public class ThicknessTypeConverter : ICompiledTypeConverter
{
    public IEnumerable<Instruction> ConvertFromString(string value, ILContext ctx, BaseNode node)
    {
        // "10,20" → new Thickness(10, 20)
        var parts = value.Split(',');
        yield return Instruction.Create(OpCodes.Ldc_R4, float.Parse(parts[0]));
        yield return Instruction.Create(OpCodes.Ldc_R4, float.Parse(parts[1]));
        yield return Instruction.Create(OpCodes.Newobj, ctx.Cache.ImportCtor(
            typeof(Thickness), typeof(float), typeof(float)));
    }
}

// 注册
TypeConverterRegistry.Register<Thickness, ThicknessTypeConverter>();
```

**关键参数**：

| 转换器 | 输入 | 输出 |
| --- | --- | --- |
| `ColorTypeConverter` | `"Red"` / `"#FF0000"` | `Color` 结构体 |
| `ThicknessTypeConverter` | `"10,20"` | `Thickness(10, 20)` |
| `EnumTypeConverter` | `"Stretch"` | `Stretch.Fill` |
| `BoolTypeConverter` | `"true"` | `true` |

**最佳实践**：
- ✅ 业务方自定义 XAML 属性时提供 `ICompiledTypeConverter`，避免 runtime 解析
- ✅ 字符串解析用 `StringComparison.Ordinal` 避免文化歧义
- ✅ 处理 HTML/CSS 与 .NET 命名差异（`lightgrey` vs `lightgray`）
- ❌ 切勿让 XAML 字符串解析依赖当前 culture
- ❌ 切勿在转换器中抛 `NotImplementedException`（会让 XamlC 整体失败）

### 5. UnsafeAccessor 私有访问（NativeAOT Compatible）

**问题场景**：binding 路径需要访问 ViewModel 私有属性，传统方式用 reflection 调 `PropertyInfo.GetValue`；NativeAOT 没有 metadata，runtime 反射崩。

**解决方案**：
```csharp
// 业务方 ViewModel
public partial class UserViewModel
{
    private string _name;  // 私有字段
    public string Name
    {
        get => _name;
        set => _name = value;
    }
}

// 源生成器生成 UnsafeAccessor
[System.Runtime.CompilerServices.UnsafeAccessor(System.Runtime.CompilerServices.UnsafeAccessorKind.Field)]
static extern ref string GetNameField(UserViewModel instance);

class GeneratedBindingInterceptor
{
    public static object? Get(UserViewModel vm)
        => GetNameField(vm);  // 直接拿 ref，无反射
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `UnsafeAccessorKind.Field` | 访问私有字段 |
| `UnsafeAccessorKind.Method` | 访问私有方法 |
| `UnsafeAccessorKind.Constructor` | 访问私有构造函数 |

**最佳实践**：
- ✅ NativeAOT 项目用 `UnsafeAccessor` 替代反射
- ✅ 源生成器检测 private field 访问需求，自动 emit UnsafeAccessor stub
- ✅ AOT 编译后无 metadata 也能跑（无 reflection）
- ❌ 切勿在 AOT 项目中用 `PropertyInfo.GetValue`
- ❌ 切勿混淆 `UnsafeAccessorKind.Field` 和 `Method`（签名前缀不同）

---

## 二、Handler 模式：跨平台 control 抽象

### 6. IViewHandler 与 PlatformView（Handler Pattern）

**问题场景**：Xamarin.Forms 的 `Renderer` 模式用继承 + override，加新平台必须新建子类；4 平台（iOS/Android/Mac/Win）每加一个 control 都要写 4 个 renderer。

**解决方案**：
```csharp
// MAUI 抽象
public interface IViewHandler : IElementHandler
{
    object PlatformView { get; }  // iOS UIView / Android View / ...
    Microsoft.Maui.IView VirtualView { get; }  // MAUI 抽象 control
    IMauiContext Context { get; }
}

// Button handler 注册
public class ButtonHandler : ViewHandler<IButton, object>
{
    public ButtonHandler() : base(Mapper) { }
}

// iOS 平台实现
public class ButtonHandler : ViewHandler<IButton, UIButton>
{
    protected override UIButton CreatePlatformView() => new UIButton();
    protected override void ConnectHandler(UIButton platformView)
    {
        platformView.TouchUpInside += OnTouchUpInside;
        base.ConnectHandler(platformView);
    }
}
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `PlatformView` | native control 实例（iOS UIButton 等） |
| `VirtualView` | MAUI 抽象 control（IButton） |
| `Mapper` | 属性映射表 |
| `IMauiContext` | 平台上下文（service provider） |

**最佳实践**：
- ✅ 业务方扩展新平台时实现 `IViewHandler` 而非继承
- ✅ `ConnectHandler` 注册事件，`DisconnectHandler` 解绑避免泄漏
- ✅ 通过 `Mapper.AppendToMapping` 替换默认行为
- ❌ 切勿在 `ConnectHandler` 中 new 大对象
- ❌ 切勿忘记 `DisconnectHandler` 解绑 platformView 事件

### 7. Handler Mapper 属性映射（Mapper Pattern）

**问题场景**：MAUI 抽象 `IButton.Text` 变化时，4 平台要分别同步到 `UIButton.TitleLabel.Text` / `Button.Text` / ...，override 链式分发慢且难扩展。

**解决方案**：
```csharp
// 业务方注册
Mapper.AppendToMapping(nameof(IButton.Text), (handler, view) =>
{
    if (handler.PlatformView is UIButton native)
        native.SetTitle(view.Text, UIControlState.Normal);
});

// 替换默认映射
Mapper.PrependToMapping(nameof(IButton.Text), (handler, view) => {
    // 完全自定义
});
```

**关键参数**：

| 方法 | 行为 |
| --- | --- |
| `Mapper.AppendToMapping` | 追加到默认映射之后 |
| `Mapper.PrependToMapping` | 在默认映射之前（可拦截） |
| `Mapper.ModifyMapping` | 替换默认映射 |

**最佳实践**：
- ✅ 业务方扩展属性映射用 `AppendToMapping`，不动默认行为
- ✅ 平台特定优化用 `PrependToMapping`（如安卓 ripple 效果）
- ✅ 跨平台代码不要直接 `PlatformView.X = Y`，要走 Mapper
- ❌ 切勿在 `ConnectHandler` 内重写所有映射（性能问题）
- ❌ 切勿 Mapper 中读可变全局状态

### 8. MAUI Essentials 与跨平台 API（Essentials）

**问题场景**：每个平台都有 `Preferences` / `SecureStorage` / `FileSystem` / `Geolocation` / `Connectivity` 等系统 API，4 平台重复实现 4 遍。

**解决方案**：
```csharp
// MAUI Essentials 提供统一 API
public partial class Preferences
{
    public static string Get(string key, string defaultValue)
        => Microsoft.Maui.Storage.Preferences.Default.Get(key, defaultValue);
}

// iOS 实现
public partial class Preferences
{
    static IPlatformApplication _platformApplication;
    public static void Set(string key, string value)
    {
        // NSUserDefaults
        NSUserDefaults.StandardUserDefaults.SetString(value, key);
    }
}
```

**关键参数**：

| API | 跨平台实现 |
| --- | --- |
| `Preferences` | NSUserDefaults / SharedPreferences / AppSettings |
| `SecureStorage` | Keychain / EncryptedSharedPreferences / DPAPI |
| `FileSystem.AppDataDirectory` | 平台特定 app data 路径 |
| `Geolocation` | CoreLocation / LocationManager / WinRT |
| `Connectivity` | NWPathMonitor / ConnectivityManager / WinRT |

**最佳实践**：
- ✅ 业务方只用 `Preferences.Set/Get`，不直接调平台 API
- ✅ `SecureStorage` 存敏感数据，平台会加密（Keychain/DPAPI）
- ✅ 业务方可以通过 `DeviceInfo.Platform` 区分平台做 fallback
- ❌ 切勿在 `Preferences` 存大量数据（NSUserDefaults 同步写入慢）
- ❌ 切勿跨平台混用平台 API（破坏跨平台性）

### 9. Essentials.AI 与 .NET 9 AI 抽象（AI Cross-Platform）

**问题场景**：.NET 9 引入 AI 抽象层（`Microsoft.Extensions.AI`），但不同平台（iOS / Android / Windows）调用本地 LLM（Core ML / MediaPipe / ONNX Runtime）的 API 差异巨大。

**解决方案**：
```csharp
// 业务方使用
public class MyViewModel
{
    readonly IChatClient _chat;
    public MyViewModel(IChatClient chat) => _chat = chat;

    public async Task<string> Ask(string q)
        => await _chat.CompleteAsync(q);
}

// 平台特定
#if IOS
services.AddSingleton<IChatClient, AppleIntelligenceChatClient>();
#elif ANDROID
services.AddSingleton<IChatClient, MediaPipeChatClient>();
#elif WINDOWS
services.AddSingleton<IChatClient, OnnxRuntimeChatClient>();
#endif
```

**关键参数**：

| 平台 | LLM 运行时 |
| --- | --- |
| iOS 18+ | Apple Intelligence / Core ML |
| Android | MediaPipe / LiteRT |
| Windows | ONNX Runtime / Phi Silica |

**最佳实践**：
- ✅ 业务方代码只用 `IChatClient`，不感知平台
- ✅ DI 注入平台特定实现
- ✅ 模型下载走平台商店（App Store / Play Store），不走业务方 bundle
- ❌ 切勿在跨平台代码中 `#if IOS` 调 Apple Intelligence
- ❌ 切勿把 LLM 模型打进 MAUI app 包（体积 1GB+）

### 10. BlazorWebView 与 Razor 混合（Hybrid）

**问题场景**：业务方已有 Blazor 组件（Web 前端），想嵌入 MAUI 原生 app；不重写为 XAML。

**解决方案**：
```xml
<!-- MainPage.xaml -->
<ContentPage xmlns:blazor="clr-namespace:Microsoft.AspNetCore.Components.WebView.Maui;assembly=Microsoft.AspNetCore.Components.WebView.Maui">
    <blazor:BlazorWebView HostPage="wwwroot/index.html" Services="{StaticResource services}">
        <blazor:BlazorWebView.RootComponents>
            <blazor:RootComponent Selector="#app" ComponentType="{x:Type pages:Counter}" />
        </blazor:BlazorWebView.RootComponents>
    </blazor:BlazorWebView>
</ContentPage>
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `HostPage` | 入口 HTML 文件 |
| `RootComponents` | Blazor 根组件 |
| `Services` | DI 容器 |
| `wwwroot/` | 静态资源目录 |

**最佳实践**：
- ✅ 业务方 Blazor 组件直接嵌入 MAUI，复用率 100%
- ✅ 共享 Razor class library 在 MAUI + Blazor Server/WASM 间复用
- ✅ native 控件（地图、相机）用 `JSInterop` 调 MAUI Handler
- ❌ 切勿在 BlazorWebView 内做高频 DOM 更新（WebView overhead）
- ❌ 切勿让 Blazor app 直接访问文件系统（走 MAUI Essentials）

---

## 三、性能与 AOT：让跨平台 app 启动 < 500ms

### 11. NativeAOT 编译配置（AOT Compilation）

**问题场景**：iOS / Android 现代 .NET 推 NativeAOT 编译（无 JIT），启动 < 200ms；MAUI 必须 AOT 友好（不依赖 runtime emit、reflection、动态加载）。

**解决方案**：
```xml
<!-- MyMauiApp.csproj -->
<PropertyGroup>
  <PublishAot>true</PublishAot>
  <StripSymbols>true</StripSymbols>
  <IlcOptimizationPreference>Size</IlcOptimizationPreference>
  <InvariantGlobalization>true</InvariantGlobalization>  <!-- 省 ICU 库 5MB -->
  <UseInterpreter>false</UseInterpreter>  <!-- 关闭 IL 解释器 -->
</PropertyGroup>
```

**关键参数**：

| 字段 | 推荐 | 说明 |
| --- | --- | --- |
| `PublishAot` | `true` | 启用 NativeAOT |
| `StripSymbols` | `true` | 裁剪符号 |
| `InvariantGlobalization` | `true` | 减少 ICU 库 5MB |
| `IlcOptimizationPreference` | `Size` / `Speed` | 优化目标 |
| `TrimmerSingleWarn` | `false` | 关闭 trimmer 单 warn 模式 |

**最佳实践**：
- ✅ iOS release 必须 AOT 编译（App Store 审核）
- ✅ Android release 推 AOT，启动 200ms 内
- ✅ `InvariantGlobalization` 减少 5MB 体积（业务方无多语言需求时）
- ❌ 切勿在 AOT 项目用 `Reflection.Emit`（BannedSymbols.txt 禁止）
- ❌ 切勿在 AOT 项目用 `Assembly.LoadFrom`（动态加载 AOT 不支持）

### 12. Startup Tracing 与 R2R（Ready To Run）

**问题场景**：AOT 编译慢（10+ 分钟），开发期间想快速冷启动；R2R 预编译 .NET IL 到 native，但只覆盖部分方法。

**解决方案**：
```xml
<PropertyGroup>
  <PublishReadyToRun>true</PublishReadyToRun>  <!-- R2R 编译 -->
  <PublishReadyToRunComposite>true</PublishReadyToRunComposite>  <!-- 多架构合并 -->
  <PublishAot Condition="'$(Configuration)' == 'Release'">true</PublishAot>
  <PublishAot Condition="'$(Configuration)' == 'Debug'">false</PublishAot>
</PropertyGroup>
```

**关键参数**：

| 模式 | 启动 | 包体积 | 编译时间 |
| --- | --- | --- | --- |
| JIT | 1500ms | 小 | 0s |
| R2R | 800ms | 中（+30%） | 60s |
| NativeAOT | 200ms | 小 | 600s |

**最佳实践**：
- ✅ Debug 用 JIT 快编译，Release 用 AOT 优启动
- ✅ 业务方既要快启动又要快发布，用 R2R 中间方案
- ✅ Startup Tracing 让 AOT 编译器知道反射调用路径
- ❌ 切勿 Debug 模式也开 AOT（编译 10 分钟改一行代码）
- ❌ 切勿混用 R2R 和 AOT（互斥）

### 13. ILRepack 合并 DLL（Assembly Merging）

**问题场景**：MAUI app 默认 50+ DLL，4 平台包体积都偏大；ILRepack 合并到单 DLL 减少包体积 40%。

**解决方案**：
```xml
<!-- eng/Directory.Build.props -->
<PropertyGroup>
  <IlrepackEnabled>true</IlrepackEnabled>
  <IlrepackExclude Assemblies="$(IlrepackExclude);System.*;Microsoft.Maui.*" />
</PropertyGroup>

<!-- 自定义 ILRepack target -->
<Target Name="MergeAssemblies" AfterTargets="Build">
  <Exec Command="$(ILRepack) /out:MauiMerged.dll $(AssemblyName).dll $(ReferenceAssemblies)" />
</Target>
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `IlrepackEnabled` | 是否启用合并 |
| `IlrepackExclude` | 排除程序集（避免 System.* 被合并） |
| `IlrepackInternalize` | 是否把 internal API 改为 private |

**最佳实践**：
- ✅ Library 项目不开 ILRepack（破坏多版本并存）
- ✅ App 项目开 ILRepack 减少包体积
- ✅ 排除 `System.*` 和 `Microsoft.Maui.*` 避免破坏 framework
- ❌ 切勿在 ILRepack 后做 reflection（合并后类型名可能变）
- ❌ 切勿对 NuGet 库做 ILRepack（违反 .NET 库规范）

### 14. BannedSymbols.txt 强约束（Banned APIs）

**问题场景**：MAUI 要 AOT 兼容，禁用 `System.Reflection.Emit` / `Assembly.LoadFrom` 等反射 API；但 .NET 库大量用反射，第三方贡献者容易引入。

**解决方案**：
```text
# eng/BannedSymbols.txt
T:System.Reflection.Assembly.LoadFrom;Use Assembly.Load instead
T:System.Reflection.Emit.AssemblyBuilder;AOT not supported
T:System.Runtime.Serialization.Formatters.Binary;Security risk, obsolete
P:System.DateTime.Now;Use DateTime.UtcNow
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `T:FullyQualifiedName` | 禁用类型 |
| `P:FullyQualifiedName` | 禁用属性 |
| `M:FullyQualifiedName` | 禁用方法 |
| `;备注` | 替代方案说明 |

**最佳实践**：
- ✅ CI 跑 BannedSymbols.txt 检查，违规 build fail
- ✅ 注释给出替代方案（`Use X instead`）
- ✅ 提交 PR 前用 `grep -r Reflection.Emit src/` 自检
- ❌ 切勿在 BannedSymbols 加 `System.Reflection`（太宽，连合法 reflection 也禁）
- ❌ 切勿频繁改 BannedSymbols（破坏第三方贡献者 PR）

### 15. XamlSourceGen 双引擎过渡（Hybrid Compilation）

**问题场景**：.NET 9 之前 XamlC 是 MSBuild Task（重、慢），.NET 9 引入纯 Roslyn Source Generator 替代部分功能；过渡期需双引擎并存。

**解决方案**：
```xml
<!-- MyMauiApp.csproj -->
<PropertyGroup>
  <MauiEnableXamlCBindingWithSourceCompilation>true</MauiEnableXamlCBindingWithSourceCompilation>
  <MauiXamlCEnabled>true</MauiXamlCEnabled>
  <MauiXamlSourceGenEnabled>true</MauiXamlSourceGenEnabled>
</PropertyGroup>
```

**关键参数**：

| 引擎 | 启动 | IDE 反馈 |
| --- | --- | --- |
| XamlC（MSBuild Task） | 快 | 慢（编辑后要 build） |
| XamlSourceGen（Roslyn SG） | 稍慢 | 快（实时生成） |

**最佳实践**：
- ✅ 新项目开双引擎，IDE 体验 + 启动速度都最优
- ✅ 老项目渐进式迁移，先开 XamlSourceGen，再关 XamlC
- ❌ 切勿在 build 慢的机器上只开 XamlC（IDE 卡顿）
- ❌ 切勿混用两个引擎的 generated 目录（冲突）

---

## 四、可靠性与工程化：CI、跨平台测试、设备 farm

### 16. Helix 分布式测试矩阵（Device Farm）

**问题场景**：MAUI 跑 iOS / Android / Mac / Windows，单元测试无法覆盖所有平台；需要分布式设备 farm。

**解决方案**：
```yaml
# .github/workflows/helix.yml
name: Helix
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: ./build.sh -test -testDevices  # 上传到 Helix
      # Helix 自动分配 4 平台设备池执行
```

**关键参数**：

| 平台 | 设备 |
| --- | --- |
| iOS | iPhone 15 / iOS 18 / iPad Pro |
| Android | Pixel 8 / Android 14 |
| macOS | Mac mini M2 / macOS 15 |
| Windows | Surface Pro / Windows 11 |

**最佳实践**：
- ✅ CI 跑 Helix 覆盖真实设备，单元测试只跑 PC 模拟器
- ✅ 关键 PR（影响 control 渲染）必须过 Helix
- ✅ 用 `Helix.workItem.create()` API 写自定义测试 case
- ❌ 切勿跳过 Helix 通过 PR（设备 bug 进 release）
- ❌ 切勿 Helix 测试超时（10 分钟硬限）

### 17. Arcade SDK 工程化（Build Infrastructure）

**问题场景**：.NET 官方仓库（runtime / aspnetcore / maui）100+ 贡献者，需统一 build 流程；Arcade SDK 提供 Cake 脚本 + Directory.Build.props 模板。

**解决方案**：
```csharp
// build.cake
Task("Build")
    .IsDependentOn("Restore")
    .Does(() => {
    var msbuild = MakeAbsolute(File("./.dotnet/sdk/dotnet.exe"));
    DotNetBuild("./Microsoft.Maui.sln", new DotNetBuildSettings {
        MSBuildSettings = msbuildSettings
    });
});

Task("Test").IsDependentOn("Build").Does(() => {
    DotNetTest("./Microsoft.Maui.sln");
});

Task("Default").IsDependentOn("Test");
RunTarget("Default");
```

**关键参数**：

| 任务 | 职责 |
| --- | --- |
| `Restore` | nuget restore |
| `Build` | 编译所有 TFM |
| `Test` | 跑 xUnit |
| `Pack` | 生成 NuGet 包 |
| `Publish` | 上传到 Helix / Azure |

**最佳实践**：
- ✅ 业务方 monorepo 借鉴 Arcade SDK（`eng/` 目录 + `build.cake`）
- ✅ `Directory.Build.props` 集中所有项目的 MSBuild 公共属性
- ✅ `-bootstrap` 拉 Arcade SDK 一次性 setup
- ❌ 切勿自定义 `eng/`（Arcade SDK 已统一）
- ❌ 切勿绕过 Cake 直接调 MSBuild（破坏跨平台）

### 18. 多 TFM 包发布（Multi-Targeting）

**问题场景**：MAUI 同时支持 net10.0-android / net10.0-ios / net10.0-maccatalyst / net10.0-windows，单 TFM 包无法满足。

**解决方案**：
```xml
<!-- Microsoft.Maui.Controls.csproj -->
<PropertyGroup>
  <TargetFrameworks>net10.0;net10.0-android;net10.0-ios;net10.0-maccatalyst;net10.0-windows10.0.19041.0</TargetFrameworks>
  <MSBuild.Sdk.Extras Version="3.0.44" />
</PropertyGroup>

<ItemGroup>
  <Compile Remove="PlatformSpecific\iOS\**\*.cs" />
  <Compile Include="PlatformSpecific\iOS\**\*.cs" Condition="$(TargetFramework.Contains('-ios'))" />
</ItemGroup>
```

**关键参数**：

| TFM | 平台 |
| --- | --- |
| `net10.0-android` | Android API 30+ |
| `net10.0-ios` | iOS 14+ |
| `net10.0-maccatalyst` | Mac Catalyst 14+ |
| `net10.0-windows10.0.19041.0` | Windows 10+ |

**最佳实践**：
- ✅ 业务方跨平台库用 `MSBuild.Sdk.Extras` 多 TFM
- ✅ 平台特定代码用 `Condition` Include（`iOS\**` 只对 `-ios` 编译）
- ✅ 共享代码放 `PlatformSpecific\Shared\`，平台代码放 `PlatformSpecific\iOS\` 等
- ❌ 切勿单 TFM 包发多平台（NuGet 限制）
- ❌ 切勿 hardcode `Path.DirectorySeparatorChar`（用 `Path.Combine`）

### 19. 平台特定代码隔离（Platform-Specific Code）

**问题场景**：业务方要在 iOS 用 Apple Pay、Android 用 Google Pay、Windows 用 Microsoft Pay；共享代码 + 平台代码必须清晰隔离。

**解决方案**：
```csharp
// 共享接口
public interface IPaymentService
{
    Task<bool> PayAsync(decimal amount);
}

// iOS 实现
public class ApplePayService : IPaymentService
{
    public async Task<bool> PayAsync(decimal amount)
    {
        var request = new PKPaymentRequest();
        // PKPayment API...
        return await Task.FromResult(true);
    }
}

// Windows 实现
public class MicrosoftPayService : IPaymentService
{
    public async Task<bool> PayAsync(decimal amount)
    {
        var request = new PaymentRequest();
        // WinRT API...
        return await Task.FromResult(true);
    }
}
```

**关键参数**：

| 平台 | 文件路径 | 支付 SDK |
| --- | --- | --- |
| iOS | `Platforms/iOS/ApplePayService.cs` | PassKit |
| Android | `Platforms/Android/GooglePayService.cs` | Google Pay API |
| Windows | `Platforms/Windows/MicrosoftPayService.cs` | WinRT Payments |

**最佳实践**：
- ✅ 业务方用 `IPaymentService` 接口，DI 注入平台实现
- ✅ 文件放 `Platforms/<Platform>/`，IDE 自动识别
- ✅ 用 partial class 共享接口签名（`partial class PaymentService`）
- ❌ 切勿在共享代码中 `#if IOS`
- ❌ 切勿让平台代码污染 `MainPage.xaml.cs`（隔离到 Services）

### 20. 兼容层与 Xamarin.Forms 迁移（Compatibility）

**问题场景**：存量 Xamarin.Forms 项目（10万+ line）要升级 MAUI；直接重写成本太高。MAUI 提供 `Compatibility` 兼容层。

**解决方案**：
```csharp
// 老项目升级
using Xamarin.Forms.Compatibility;  // 保留旧 API
using Microsoft.Maui.Controls;       // 新 API

[assembly: EnableXamlCBindingWithSourceCompilation]
[assembly: UseCompatibilityRenderers]  // 启用 Renderer 兼容
```

**关键参数**：

| 字段 | 说明 |
| --- | --- |
| `UseCompatibilityRenderers` | 用老 Renderer 模式 |
| `EnableXamlCBindingWithSourceCompilation` | 启用 XamlC + SourceGen 双引擎 |
| `LegacyRenderers` | 老 renderer 列表 |
| `Material` | Material Design 主题 |

**最佳实践**：
- ✅ 升级时开 `UseCompatibilityRenderers`，渐进式切 Handler
- ✅ 旧 Render 项目用 `Microsoft.Maui.Controls.Compatibility` namespace
- ✅ 新代码用 Handler 模式，老代码继续 Renderer
- ❌ 切勿一步到位废弃 Renderer（破坏老项目）
- ❌ 切勿混用 `Xamarin.Forms` 和 `Microsoft.Maui` 类型

---

**标签**：#maui #dotnet #cross-platform #xaml
**状态**：20/20 份详细内容
