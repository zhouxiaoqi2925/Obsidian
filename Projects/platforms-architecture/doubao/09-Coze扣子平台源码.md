# 09 — Coze / 扣子 Agent 平台源码深度解读

> 基于真实抓取的 GitHub 源码（`cloudwego/eino` v0.8.x、 `coze-dev/coze-studio` 主干），逐行注释核心实现。所有文件路径相对于被 clone 的仓库根目录。

---

## 0. 前置：技术栈全景

Coze Studio（扣子开发平台）后端是 Go 微服务，前端 React+TypeScript，整体基于 **DDD（领域驱动设计）** + **Eino 编排框架** + **FlowGram 画布引擎** + **Hertz HTTP 框架**。我们重点剖析其核心：

| 组件 | 仓库 | 作用 |
|------|------|------|
| Eino（编排核心） | github.com/cloudwego/eino | Lambda/Chain/Graph/ToolsNode/ReAct |
| FlowGram（画布） | github.com/bytedance/flowgram.ai | 可视化工作流画布 |
| Hertz（HTTP） | github.com/cloudwego/hertz | 高性能 Go HTTP 框架 |
| Coze Studio（平台） | github.com/coze-dev/coze-studio | Agent/Workflow/Knowledge 整合 |

`coze-studio/README.zh_CN.md:131-133` 原文致谢：

> 感谢 [Eino](https://github.com/cloudwego/eino) 框架团队 - 为 Coze Studio 的智能体和工作流运行时、模型抽象封装、知识库索引构建和检索提供了强大的支持
> 感谢 [FlowGram](https://github.com/bytedance/flowgram.ai) 团队 - 为 Coze Studio 的工作流画布编辑页提供了高质量的流程搭建引擎
> 感谢 [Hertz](https://github.com/cloudwego/hertz) 团队 - 高性能、强扩展性的 Go HTTP 框架，用于构建微服务

下文按"编排器核心 → Chain → Graph → Tool → ReAct → Coze Agent 集成"逐层展开。

---

## 1. Eino 整体架构（README.zh_CN.md:1-200）

### 1.1 项目定位

Eino 是 CloudWeGo（字节跳动 Go 生态）开源的 **LLM 应用开发框架**，灵感来自 LangChain 与 Google ADK，但严格遵循 Go 惯例（接口+组合+泛型）。

源码：`/tmp/eino/README.zh_CN.md:13-25`

```markdown
[Eino['aino](README.md) | 中文](README.md) | 中文

# 简介

**Eino['aino]** 是一个 Go 语言的 LLM 应用开发框架，借鉴了 LangChain、Google ADK 等开源项目，按照 Go 的惯例设计。

Eino 提供：
- **[组件](https://github.com/cloudwego/eino-ext)**：`ChatModel`、`Tool`、`Retriever`、`ChatTemplate` 等可复用模块，官方实现覆盖 OpenAI、Ollama 等
- **智能体开发套件（ADK）**：支持工具调用、多智能体协同、上下文管理、中断/恢复等人机交互，以及开箱即用的智能体模式
- **编排**：把组件组装成图或工作流，既能独立运行，也能作为工具给智能体调用
- **[示例](https://github.com/cloudwego/eino-examples)**：常见模式和实际场景的可运行代码
```

**关键设计**：
- **三层架构**：`components`（原子）→ `compose`（编排）→ `flow/agent`（高层模式）
- **范型优先**：用 Go 1.18+ 泛型做端到端类型安全
- **流式是一等公民**：`StreamReader[T]` / `Pipe[T]` / `MergeNamedStreamReaders` 贯穿整个框架

### 1.2 快速上手：ChatModelAgent

源码：`/tmp/eino/README.zh_CN.md:33-52`

```go
chatModel, _ := openai.NewChatModel(ctx, &openai.ChatModelConfig{
    Model:  "gpt-4o",
    APIKey: os.Getenv("OPENAI_API_KEY"),
})

agent, _ := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
    Model: chatModel,
})

runner := adk.NewRunner(ctx, adk.RunnerConfig{Agent: agent})
iter := runner.Query(ctx, "Hello, who are you?")
for {
    event, ok := iter.Next()
    if !ok {
        break
    }
    fmt.Println(event.Message.Content)
}
```

**逐行解释**：
- `openai.NewChatModel` 创建一个 `model.BaseChatModel` 实现（位于 eino-ext 仓库）
- `adk.NewChatModelAgent` 包装模型为可调用的 Agent（ADK = Agent Development Kit）
- `adk.NewRunner` 提供可流式查询的运行器
- `iter.Next()` 迭代 AgentEvent（不是裸 Message，因为 Agent 还要产出工具调用、中断等事件）

加工具的最小代码（同 56-65 行）：

```go
agent, _ := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
    Model: chatModel,
    ToolsConfig: adk.ToolsConfig{
        ToolsNodeConfig: compose.ToolsNodeConfig{
            Tools: []tool.BaseTool{weatherTool, calculatorTool},
        },
    },
})
```

智能体内部自动处理 **ReAct 循环**，自己判断什么时候调工具、什么时候回复。

### 1.3 编排入口：Graph

源码：`/tmp/eino/README.zh_CN.md:99-111`

```go
graph := compose.NewGraph[*Input, *Output]()
graph.AddLambdaNode("validate", validateFn)
graph.AddChatModelNode("generate", chatModel)
graph.AddLambdaNode("format", formatFn)

graph.AddEdge(compose.START, "validate")
graph.AddEdge("validate", "generate")
graph.AddEdge("generate", "format")
graph.AddEdge("format", compose.END)

runnable, _ := graph.Compile(ctx)
result, _ := runnable.Invoke(ctx, input)
```

**架构优势**：
- 节点可以是 Lambda（任意函数）、ChatModel、Retriever、Indexer、ToolsNode、子 Graph、子 Chain
- 边分两种：`controlEdge`（控制流）+ `dataEdge`（数据依赖），框架在编译期检查类型兼容性
- 编译后产出 `Runnable[I, O]`，统一支持 `Invoke/Stream/Collect/Transform` 四种范式

### 1.4 主要特性（README.zh_CN.md:132-156）

| 特性 | 说明 |
|------|------|
| 组件生态 | 抽象 ChatModel/Tool/Retriever/Embedding，官方实现覆盖 OpenAI/Claude/Gemini/Ark/Ollama/Elasticsearch |
| 流式处理 | 编排中自动拼接/装箱/合并/复制，组件只需实现有业务意义的流式范式 |
| 回调切面 | OnStart/OnEnd/OnError/OnStartWithStreamInput/OnEndWithStreamOutput 五个固定切点 |
| 中断/恢复 | 任何智能体或工具都能暂停等待人工输入，从检查点恢复 |

---

## 2. compose 包核心：编排器三件套

源码：`/tmp/eino/compose/`

### 2.1 Lambda 范型四种类型

源码：`/tmp/eino/compose/types_lambda.go:26-54`

```go
// Invoke is the type of the invokable lambda function.
type Invoke[I, O, TOption any] func(ctx context.Context, input I, opts ...TOption) (output O, err error)

// Stream is the type of the streamable lambda function.
type Stream[I, O, TOption any] func(ctx context.Context,
    input I, opts ...TOption) (output *schema.StreamReader[O], err error)

// Collect is the type of the collectable lambda function.
type Collect[I, O, TOption any] func(ctx context.Context,
    input *schema.StreamReader[I], opts ...TOption) (output O, err error)

// Transform is the type of the transformable lambda function.
type Transform[I, O, TOption any] func(ctx context.Context,
    input *schema.StreamReader[I], opts ...TOption) (output *schema.StreamReader[O], err error)
```

**设计精髓**：四种范式对应"普通/流式/收集/转换"四种流形（stream paradigm），框架在编排时根据上下游节点的流形做**自动转换**。比如上游 Stream + 下游 Invoke，框架自动 Collect。

### 2.2 Lambda 结构 + LambdaOpt

源码：`/tmp/eino/compose/types_lambda.go:64-95`

```go
// Lambda is the node that wraps the user provided lambda function.
// It can be used as a node in Graph or Chain (include Parallel and Branch).
// Create a Lambda by using AnyLambda/InvokableLambda/StreamableLambda/CollectableLambda/TransformableLambda.
type Lambda struct {
    executor *composableRunnable
}

type lambdaOpts struct {
    // same as executorMeta.isComponentCallbackEnabled
    // indicates whether the executable lambda user provided could execute the callback aspect itself.
    enableComponentCallback bool

    // for AnyLambda, the value comes from the user's explicit config
    componentImplType string
}

type LambdaOpt func(o *lambdaOpts)

// WithLambdaCallbackEnable enables the callback aspect of the lambda function.
func WithLambdaCallbackEnable(y bool) LambdaOpt {
    return func(o *lambdaOpts) {
        o.enableComponentCallback = y
    }
}

// WithLambdaType sets the type of the lambda function.
func WithLambdaType(t string) LambdaOpt {
    return func(o *lambdaOpts) {
        o.componentImplType = t
    }
}
```

**注释要点**：
- `Lambda` 仅含一个 `composableRunnable`，所有行为通过 executor 链
- `enableComponentCallback`：如果用户的 lambda 自己处理回调（极少见），框架不再注入
- `componentImplType`：用于链路追踪和指标打点（类似 OTEL 的 component name）

### 2.3 工厂方法：InvokableLambda / StreamableLambda / CollectableLambda / TransformableLambda

源码：`/tmp/eino/compose/types_lambda.go:99-160`

```go
// InvokableLambdaWithOption creates a Lambda with invokable lambda function and options.
func InvokableLambdaWithOption[I, O, TOption any](i Invoke[I, O, TOption], opts ...LambdaOpt) *Lambda {
    return anyLambda(i, nil, nil, nil, opts...)
}

// InvokableLambda creates a Lambda with invokable lambda function without options.
func InvokableLambda[I, O any](i InvokeWOOpt[I, O], opts ...LambdaOpt) *Lambda {
    f := func(ctx context.Context, input I, opts_ ...unreachableOption) (output O, err error) {
        return i(ctx, input)
    }
    return anyLambda(f, nil, nil, nil, opts...)
}

// StreamableLambdaWithOption creates a Lambda with streamable lambda function and options.
func StreamableLambdaWithOption[I, O, TOption any](s Stream[I, O, TOption], opts ...LambdaOpt) *Lambda {
    return anyLambda(nil, s, nil, nil, opts...)
}

func StreamableLambda[I, O any](s StreamWOOpt[I, O], opts ...LambdaOpt) *Lambda {
    f := func(ctx context.Context, input I, opts_ ...unreachableOption) (
        output *schema.StreamReader[O], err error) {
        return s(ctx, input)
    }
    return anyLambda(nil, f, nil, nil, opts...)
}

func CollectableLambda[I, O any](c CollectWOOpt[I, O], opts ...LambdaOpt) *Lambda {
    f := func(ctx context.Context, input *schema.StreamReader[I],
        opts_ ...unreachableOption) (output O, err error) {
        return c(ctx, input)
    }
    return anyLambda(nil, nil, f, nil, opts...)
}
```

**技巧**：`unreachableOption` 是私有类型（types_lambda.go:97），占位参数，用来**阻止用户传 `TOption`**（编译期保证不可达）。这是 Go 范型 API 设计中经典的"类型级参数约束"技巧。

### 2.4 AnyLambda：混合流形

源码：`/tmp/eino/compose/types_lambda.go:162-201`

```go
// AnyLambda creates a Lambda with any lambda function.
// you can only implement one or more of the four lambda functions, and the rest use nil.
func AnyLambda[I, O, TOption any](i Invoke[I, O, TOption], s Stream[I, O, TOption],
c Collect[I, O, TOption], t Transform[I, O, TOption], opts ...LambdaOpt) (*Lambda, error) {

    if i == nil && s == nil && c == nil && t == nil {
        return nil, fmt.Errorf("needs to have at least one of four lambda types: invoke/stream/collect/transform, got none")
    }

    return anyLambda(i, s, c, t, opts...), nil
}

func anyLambda[I, O, TOption any](i Invoke[I, O, TOption], s Stream[I, O, TOption],
c Collect[I, O, TOption], t Transform[I, O, TOption], opts ...LambdaOpt) *Lambda {

    opt := getLambdaOpt(opts...)

    executor := runnableLambda(i, s, c, t,
        !opt.enableComponentCallback,
    )
    executor.meta = &executorMeta{
        component:                  ComponentOfLambda,
        isComponentCallbackEnabled: opt.enableComponentCallback,
        componentImplType:          opt.componentImplType,
    }

    return &Lambda{
        executor: executor,
    }
}
```

**为什么四种 lambda 可选**？因为框架在编排时可能需要把同一节点接到不同流形的上下游。如果同时实现 Invoke 和 Stream，框架能选择最合适的范式；只实现 Invoke 也能工作（但流式转非流式会有额外开销）。

### 2.5 实用 Lambda：ToList / MessageParser

源码：`/tmp/eino/compose/types_lambda.go:215-265`

```go
// ToList creates a Lambda that converts input I to a []I.
// It's useful when you want to convert a single input to a list of inputs.
func ToList[I any](opts ...LambdaOpt) *Lambda {
    i := func(ctx context.Context, input I, opts_ ...unreachableOption) (output []I, err error) {
        return []I{input}, nil
    }

    f := func(ctx context.Context, inputS *schema.StreamReader[I], opts_ ...unreachableOption) (outputS *schema.StreamReader[[]I], err error) {
        return schema.StreamReaderWithConvert(inputS, func(i I) ([]I, error) {
            return []I{i}, nil
        }), nil
    }

    return anyLambda(i, nil, nil, f, opts...)
}

// MessageParser creates a lambda that parses a message into an object T, usually used after a chatmodel.
func MessageParser[T any](p schema.MessageParser[T], opts ...LambdaOpt) *Lambda {
    i := func(ctx context.Context, input *schema.Message, opts_ ...unreachableOption) (output T, err error) {
        return p.Parse(ctx, input)
    }

    opts = append([]LambdaOpt{WithLambdaType("MessageParse")}, opts...)

    return anyLambda(i, nil, nil, nil, opts...)
}
```

**场景**：
- `ToList[*schema.Message]`：chatModel 输出 `*Message`，但下游需要 `[]*Message`（如 ToolsNode）时使用
- `MessageParser[T]`：chatModel 输出 JSON 字符串，自动反序列化为结构体

---

## 3. Chain：流式链式 API

源码：`/tmp/eino/compose/chain.go`

### 3.1 Chain 类型与 NewChain

源码：`/tmp/eino/compose/chain.go:37-82`

```go
// NewChain create a chain with input/output type.
func NewChain[I, O any](opts ...NewGraphOption) *Chain[I, O] {
    ch := &Chain[I, O]{
        gg: NewGraph[I, O](opts...),
    }
    ch.gg.cmp = ComponentOfChain
    return ch
}

// Chain is a chain of components.
// Chain nodes can be parallel / branch / sequence components.
// Chain is designed to be used in a builder pattern (should Compile() before use).
// And the interface is `Chain style`, you can use it like: `chain.AppendXX(...).AppendXX(...)`
type Chain[I, O any] struct {
    err error

    gg *Graph[I, O]

    nodeIdx int

    preNodeKeys []string

    hasEnd bool
}

// ErrChainCompiled is returned when attempting to modify a chain after it has been compiled
var ErrChainCompiled = errors.New("chain has been compiled, cannot be modified")
```

**设计**：Chain 本质是 Graph 的语法糖，强制节点按追加顺序线性串联。Builder 模式 + 泛型确保编译期类型安全。

### 3.2 编译：Compile + addEndIfNeeded

源码：`/tmp/eino/compose/chain.go:88-163`

```go
// implements AnyGraph.
func (c *Chain[I, O]) compile(ctx context.Context, option *graphCompileOptions) (*composableRunnable, error) {
    if err := c.addEndIfNeeded(); err != nil {
        return nil, err
    }
    return c.gg.compile(ctx, option)
}

// addEndIfNeeded add END edge of the chain/graph.
// only run once when compiling.
func (c *Chain[I, O]) addEndIfNeeded() error {
    if c.hasEnd {
        return nil
    }
    if c.err != nil {
        return c.err
    }
    if len(c.preNodeKeys) == 0 {
        return fmt.Errorf("pre node keys not set, number of nodes in chain= %d", len(c.gg.nodes))
    }
    for _, nodeKey := range c.preNodeKeys {
        err := c.gg.AddEdge(nodeKey, END)
        if err != nil {
            return err
        }
    }
    c.hasEnd = true
    return nil
}

// Compile to a Runnable.
func (c *Chain[I, O]) Compile(ctx context.Context, opts ...GraphCompileOption) (Runnable[I, O], error) {
    if err := c.addEndIfNeeded(); err != nil {
        return nil, err
    }
    return c.gg.Compile(ctx, opts...)
}
```

**关键点**：
- Chain 编译时自动把最后一个节点的 preNodeKeys 全部连到 END
- `preNodeKeys` 跟踪所有"末端节点"（分支、并行都可能产生多个末端）
- `c.err` 累积构建期错误（避免 builder 模式中途错误无法反馈）

### 3.3 AppendChatModel / AppendChatTemplate / AppendToolsNode

源码：`/tmp/eino/compose/chain.go:165-228`

```go
// AppendChatModel add a ChatModel node to the chain.
func (c *Chain[I, O]) AppendChatModel(node model.BaseChatModel, opts ...GraphAddNodeOpt) *Chain[I, O] {
    gNode, options := toChatModelNode(node, opts...)
    c.addNode(gNode, options)
    return c
}

// AppendAgenticModel add a agentic.Model node to the chain.
func (c *Chain[I, O]) AppendAgenticModel(node model.AgenticModel, opts ...GraphAddNodeOpt) *Chain[I, O] {
    gNode, options := toAgenticModelNode(node, opts...)
    c.addNode(gNode, options)
    return c
}

// AppendChatTemplate add a ChatTemplate node to the chain.
func (c *Chain[I, O]) AppendChatTemplate(node prompt.ChatTemplate, opts ...GraphAddNodeOpt) *Chain[I, O] {
    gNode, options := toChatTemplateNode(node, opts...)
    c.addNode(gNode, options)
    return c
}

// AppendToolsNode add a ToolsNode node to the chain.
func (c *Chain[I, O]) AppendToolsNode(node *ToolsNode, opts ...GraphAddNodeOpt) *Chain[I, O] {
    gNode, options := toToolsNode(node, opts...)
    c.addNode(gNode, options)
    return c
}
```

**每个 `toXXXNode`**：把领域组件转换为 `graphNode` 包装（携带元数据 + 端点方法）。这是典型的 Adapter 模式。

### 3.4 AppendBranch：条件分支

源码：`/tmp/eino/compose/chain.go:333-447`

```go
// AppendBranch add a conditional branch to chain.
// Each branch within the ChainBranch can be an AnyGraph.
// All branches should either lead to END, or converge to another node within the Chain.
func (c *Chain[I, O]) AppendBranch(b *ChainBranch) *Chain[I, O] {
    if b == nil {
        c.reportError(fmt.Errorf("append branch invalid, branch is nil"))
        return c
    }
    if b.err != nil {
        c.reportError(fmt.Errorf("append branch error: %w", b.err))
        return c
    }
    if len(b.key2BranchNode) == 0 {
        c.reportError(fmt.Errorf("append branch invalid, nodeList is empty"))
        return c
    }
    if len(b.key2BranchNode) == 1 {
        c.reportError(fmt.Errorf("append branch invalid, nodeList length = 1"))
        return c
    }

    var startNode string
    if len(c.preNodeKeys) == 0 { // branch appended directly to START
        startNode = START
    } else if len(c.preNodeKeys) == 1 {
        startNode = c.preNodeKeys[0]
    } else {
        c.reportError(fmt.Errorf("append branch invalid, multiple previous nodes: %v ", c.preNodeKeys))
        return c
    }

    prefix := c.nextNodeKey()
    key2NodeKey := make(map[string]string, len(b.key2BranchNode))

    for key := range b.key2BranchNode {
        node := b.key2BranchNode[key]

        var nodeKey string
        if node.Second != nil && node.Second.nodeOptions != nil && node.Second.nodeOptions.nodeKey != "" {
            nodeKey = node.Second.nodeOptions.nodeKey
        } else {
            nodeKey = fmt.Sprintf("%s_branch_%s", prefix, key)
        }

        if err := c.gg.addNode(nodeKey, node.First, node.Second); err != nil {
            c.reportError(fmt.Errorf("add branch node[%s] to chain failed: %w", nodeKey, err))
            return c
        }

        key2NodeKey[key] = nodeKey
    }

    gBranch := *b.internalBranch
    // ... 把 key 映射为 nodeKey，挂到 Graph 上
    if err := c.gg.AddBranch(startNode, &gBranch); err != nil {
        c.reportError(fmt.Errorf("chain append branch failed: %w", err))
        return c
    }
    c.preNodeKeys = gmap.Values(key2NodeKey)
    return c
}
```

**关键逻辑**：
- Branch 只能紧跟**单一前驱节点**（防止多源分支）
- 每个分支成为独立 node，所有末端节点都成为新的 `preNodeKeys`
- 错误累积到 `c.err`，下次 Append 时一并返回（fail-fast）

---

## 4. Graph：通用有向图

源码：`/tmp/eino/compose/graph.go`

### 4.1 START / END 常量 + runType

源码：`/tmp/eino/compose/graph.go:36-55`

```go
// START is the start node of the graph. You can add your first edge with START.
const START = "start"

// END is the end node of the graph. You can add your last edge with END.
const END = "end"

type graphRunType string

const (
    // runTypePregel is a running mode of the graph that is suitable for large-scale graph processing tasks. Can have cycles in graph. Compatible with NodeTriggerType.AnyPredecessor.
    runTypePregel graphRunType = "Pregel"
    // runTypeDAG is a running mode of the graph that represents the graph as a directed acyclic graph, suitable for tasks that can be represented as a directed acyclic graph. Compatible with NodeTriggerType.AllPredecessor.
    runTypeDAG graphRunType = "DAG"
)
```

**两种运行模式**：
- **Pregel**：超步（superstep）调度，支持环，任意前驱触发即可执行（来自 Google Pregel 论文）
- **DAG**：拓扑序执行，所有前驱就绪才执行

### 4.2 graph 核心结构

源码：`/tmp/eino/compose/graph.go:57-89`

```go
type graph struct {
    nodes        map[string]*graphNode
    controlEdges map[string][]string
    dataEdges    map[string][]string
    branches     map[string][]*GraphBranch
    startNodes   []string
    endNodes     []string

    toValidateMap map[string][]struct {
        endNode  string
        mappings []*FieldMapping
    }

    stateType      reflect.Type
    stateGenerator func(ctx context.Context) any
    newOpts        []NewGraphOption

    expectedInputType, expectedOutputType reflect.Type

    *genericHelper

    fieldMappingRecords map[string][]*FieldMapping

    buildError error

    cmp component

    compiled bool

    handlerOnEdges   map[string]map[string][]handlerPair
    handlerPreNode   map[string][]handlerPair
    handlerPreBranch map[string][][]handlerPair
}
```

**字段分组**：
- **拓扑**：`nodes` / `controlEdges` / `dataEdges` / `branches` / `startNodes` / `endNodes`
- **状态**：`stateType` / `stateGenerator`（可被节点共享的全局 state）
- **类型检查**：`expectedInputType` / `expectedOutputType` + `toValidateMap`（字段映射规则）
- **AOP 切面**：三个 handler map

### 4.3 边添加：addEdgeWithMappings

源码：`/tmp/eino/compose/graph.go:232-294`

```go
func (g *graph) addEdgeWithMappings(startNode, endNode string, noControl bool, noData bool, mappings ...*FieldMapping) (err error) {
    if g.buildError != nil {
        return g.buildError
    }
    if g.compiled {
        return ErrGraphCompiled
    }

    if noControl && noData {
        return fmt.Errorf("edge[%s]-[%s] cannot be both noDirectDependency and noDataFlow", startNode, endNode)
    }

    defer func() {
        if err != nil {
            g.buildError = err
        }
    }()
    if startNode == END {
        return errors.New("END cannot be a start node")
    }
    if endNode == START {
        return errors.New("START cannot be an end node")
    }

    if _, ok := g.nodes[startNode]; !ok && startNode != START {
        return fmt.Errorf("edge start node '%s' needs to be added to graph first", startNode)
    }
    if _, ok := g.nodes[endNode]; !ok && endNode != END {
        return fmt.Errorf("edge end node '%s' needs to be added to graph first", endNode)
    }

    if !noControl {
        for i := range g.controlEdges[startNode] {
            if g.controlEdges[startNode][i] == endNode {
                return fmt.Errorf("control edge[%s]-[%s] have been added yet", startNode, endNode)
            }
        }

        g.controlEdges[startNode] = append(g.controlEdges[startNode], endNode)
        if startNode == START {
            g.startNodes = append(g.startNodes, endNode)
        }
        if endNode == END {
            g.endNodes = append(g.endNodes, startNode)
        }
    }
    if !noData {
        for i := range g.dataEdges[startNode] {
            if g.dataEdges[startNode][i] == endNode {
                return fmt.Errorf("data edge[%s]-[%s] have been added yet", startNode, endNode)
            }
        }

        g.addToValidateMap(startNode, endNode, mappings)
        err = g.updateToValidateMap()
        if err != nil {
            return err
        }
        g.dataEdges[startNode] = append(g.dataEdges[startNode], endNode)
    }
    return nil
}
```

**精妙之处**：
- 边分两种：`controlEdge`（仅控制流）+ `dataEdge`（带数据依赖 + FieldMapping）
- `addToValidateMap`：将边上的字段映射规则登记到 toValidateMap，后续 `updateToValidateMap` 用反射检查上下游类型兼容性
- 错误通过 `defer` 写入 `g.buildError`，下一个 API 调用立即返回，避免错误状态污染

### 4.4 AddChatModelNode / AddToolsNode / AddRetrieverNode

源码：`/tmp/eino/compose/graph.go:296-399`（节选）

```go
// AddChatModelNode add node that implements model.BaseChatModel.
func (g *graph) AddChatModelNode(key string, node model.BaseChatModel, opts ...GraphAddNodeOpt) error {
    gNode, options := toChatModelNode(node, opts...)
    return g.addNode(key, gNode, options)
}

// AddRetrieverNode adds a node that implements retriever.Retriever.
func (g *graph) AddRetrieverNode(key string, node retriever.Retriever, opts ...GraphAddNodeOpt) error {
    gNode, options := toRetrieverNode(node, opts...)
    return g.addNode(key, gNode, options)
}

// AddIndexerNode adds a node that implements indexer.Indexer.
func (g *graph) AddIndexerNode(key string, node indexer.Indexer, opts ...GraphAddNodeOpt) error {
    gNode, options := toIndexerNode(node, opts...)
    return g.addNode(key, gNode, options)
}

// AddToolsNode adds a node that implements ToolsNode.
func (g *graph) AddToolsNode(key string, node *ToolsNode, opts ...GraphAddNodeOpt) error {
    gNode, options := toToolsNode(node, opts...)
    return g.addNode(key, gNode, options)
}
```

每个 `toXXXNode` 是个工厂，把"业务组件"转成 `graphNode`（包含 component 元数据 + Invoke/Stream/Collect/Transform 四个端点 + 输入输出反射类型）。

---

## 5. Branch 条件路由

源码：`/tmp/eino/compose/branch.go`

### 5.1 GraphBranch 四种条件函数类型

源码：`/tmp/eino/compose/branch.go:28-50`

```go
// GraphBranchCondition is the condition type for the branch.
type GraphBranchCondition[T any] func(ctx context.Context, in T) (endNode string, err error)

// StreamGraphBranchCondition is the condition type for the stream branch.
type StreamGraphBranchCondition[T any] func(ctx context.Context, in *schema.StreamReader[T]) (endNode string, err error)

// GraphMultiBranchCondition is the condition type for the multi choice branch.
type GraphMultiBranchCondition[T any] func(ctx context.Context, in T) (endNode map[string]bool, err error)

// StreamGraphMultiBranchCondition is the condition type for the stream multi choice branch.
type StreamGraphMultiBranchCondition[T any] func(ctx context.Context, in *schema.StreamReader[T]) (endNodes map[string]bool, err error)

// GraphBranch is the branch type for the graph.
type GraphBranch struct {
    invoke    func(ctx context.Context, input any) (output []string, err error)
    collect   func(ctx context.Context, input streamReader) (output []string, err error)
    inputType reflect.Type
    *genericHelper
    endNodes   map[string]bool
    idx        int // used to distinguish branches in parallel
    noDataFlow bool
}
```

**Multi-Branch**：单输入可触发多个下游节点（fan-out），用于并行执行多个分支。

### 5.2 NewGraphMultiBranch：多选分支

源码：`/tmp/eino/compose/branch.go:87-107`

```go
// NewGraphMultiBranch creates a branch for graphs where a condition selects
// multiple end nodes; only keys present in endNodes are allowed.
func NewGraphMultiBranch[T any](condition GraphMultiBranchCondition[T], endNodes map[string]bool) *GraphBranch {
    condRun := func(ctx context.Context, in T, opts ...any) ([]string, error) {
        ends, err := condition(ctx, in)
        if err != nil {
            return nil, err
        }
        ret := make([]string, 0, len(ends))
        for end := range ends {
            if !endNodes[end] {
                return nil, fmt.Errorf("branch invocation returns unintended end node: %s", end)
            }
            ret = append(ret, end)
        }

        return ret, nil
    }

    return newGraphBranch(newRunnablePacker(condRun, nil, nil, nil, false), endNodes)
}
```

**校验**：`condition` 返回的 end 节点必须在 `endNodes` 白名单内，防止用户配置错误把数据路由到未知节点。

### 5.3 StreamGraphBranch（流式分支）

源码：`/tmp/eino/compose/branch.go:109-130`

```go
// NewStreamGraphMultiBranch creates a streaming branch where a condition on
// the input stream selects multiple end nodes.
func NewStreamGraphMultiBranch[T any](condition StreamGraphMultiBranchCondition[T],
    endNodes map[string]bool) *GraphBranch {

    condRun := func(ctx context.Context, in *schema.StreamReader[T], opts ...any) ([]string, error) {
        ends, err := condition(ctx, in)
        if err != nil {
            return nil, err
        }

        ret := make([]string, 0, len(ends))
        for end := range ends {
            // ...
            ret = append(ret, end)
        }
        // ...
    }
    // ...
}
```

流式分支：用户可以在 `StreamReader` 上做 peek（窥视第一个 chunk 决定路由），但用完后必须 `Close()`，避免下游 reader 失效。Coze 在 ReAct 中大量使用此模式。

---

## 6. ToolsNode：Function Calling 核心

源码：`/tmp/eino/compose/tool_node.go`

### 6.1 ToolsNode 结构

源码：`/tmp/eino/compose/tool_node.go:71-128`

```go
// ToolsNode represents a node capable of executing tools within a graph.
// The Graph Node interface is defined as follows:
//
//  Invoke(ctx context.Context, input *schema.Message, opts ...ToolsNodeOption) ([]*schema.Message, error)
//  Stream(ctx context.Context, input *schema.Message, opts ...ToolsNodeOption) (*schema.StreamReader[[]*schema.Message], error)
//
// Input: An AssistantMessage containing ToolCalls
// Output: An array of ToolMessage where the order of elements corresponds to the order of ToolCalls in the input
type ToolsNode struct {
    tuple                             *toolsTuple
    tools                             []tool.BaseTool
    unknownToolHandler                func(ctx context.Context, name, input string) (string, error)
    executeSequentially               bool
    toolArgumentsHandler              func(ctx context.Context, name, input string) (string, error)
    toolCallMiddlewares               []InvokableToolMiddleware
    streamToolCallMiddlewares         []StreamableToolMiddleware
    enhancedToolCallMiddlewares       []EnhancedInvokableToolMiddleware
    enhancedStreamToolCallMiddlewares []EnhancedStreamableToolMiddleware
    toolAliasConfigs                  map[string]ToolAliasConfig
}

// ToolInput represents the input parameters for a tool call execution.
type ToolInput struct {
    Name       string
    Arguments  string
    CallID     string
    CallOptions []tool.Option
}

type ToolOutput struct {
    Result string
}

type StreamToolOutput struct {
    Result *schema.StreamReader[string]
}
```

**输入**：`AssistantMessage` 含 `ToolCalls` 字段
**输出**：`[]*Message` 顺序对应 ToolCall，每个是 `ToolMessage`

### 6.2 ToolsNodeConfig

源码：`/tmp/eino/compose/tool_node.go:200-228`

```go
type ToolsNodeConfig struct {
    Tools []tool.BaseTool

    // UnknownToolsHandler handles calls to tools that don't exist.
    UnknownToolsHandler func(ctx context.Context, name, input string) (string, error)

    // ExecuteSequentially determines whether tool calls should be executed sequentially (in order) or in parallel.
    ExecuteSequentially bool

    // ToolArgumentsHandler allows handling of tool arguments before execution.
    ToolArgumentsHandler func(ctx context.Context, name, arguments string) (string, error)

    ToolCallMiddlewares []ToolMiddleware
}
```

### 6.3 NewToolNode：工厂方法

源码：`/tmp/eino/compose/tool_node.go:231-284`

```go
func NewToolNode(ctx context.Context, conf *ToolsNodeConfig) (*ToolsNode, error) {
    var middlewares []InvokableToolMiddleware
    var streamMiddlewares []StreamableToolMiddleware
    var enhancedInvokableMiddlewares []EnhancedInvokableToolMiddleware
    var enhancedStreamableMiddlewares []EnhancedStreamableToolMiddleware

    for _, m := range conf.ToolCallMiddlewares {
        if m.Invokable != nil {
            middlewares = append(middlewares, m.Invokable)
        }
        if m.Streamable != nil {
            streamMiddlewares = append(streamMiddlewares, streamMiddlewares...)
        }
        if m.EnhancedInvokable != nil {
            enhancedInvokableMiddlewares = append(enhancedInvokableMiddlewares, m.EnhancedInvokable)
        }
        if m.EnhancedStreamable != nil {
            enhancedStreamableMiddlewares = append(enhancedStreamableMiddlewares, m.EnhancedStreamable)
        }
    }

    params := convToolsParams{
        tools:        conf.Tools,
        aliasConfigs: conf.ToolAliases,
    }
    params.middlewares.invokable = middlewares
    params.middlewares.streamable = streamMiddlewares
    params.middlewares.enhancedInvokable = enhancedInvokableMiddlewares
    params.middlewares.enhancedStreamable = enhancedStreamableMiddlewares
    tuple, err := convTools(ctx, params)
    if err != nil {
        return nil, err
    }

    return &ToolsNode{
        tuple:                             tuple,
        tools:                             conf.Tools,
        unknownToolHandler:                conf.UnknownToolsHandler,
        executeSequentially:               conf.ExecuteSequentially,
        toolArgumentsHandler:              conf.ToolArgumentsHandler,
        toolCallMiddlewares:               middlewares,
        streamToolCallMiddlewares:         streamMiddlewares,
        enhancedToolCallMiddlewares:       enhancedInvokableMiddlewares,
        enhancedStreamToolCallMiddlewares: enhancedStreamableMiddlewares,
        toolAliasConfigs:                  conf.ToolAliases,
    }, nil
}
```

**Middleware 切面**：
- `Invokable`：同步工具的中间件
- `Streamable`：流式工具的中间件
- `EnhancedInvokable`：多模态结果（图像/音频/文件）中间件
- `EnhancedStreamable`：流式多模态中间件

### 6.4 Alias 重写：remapArgs

源码：`/tmp/eino/compose/tool_node.go:332-369`

```go
// remapArgs replaces alias keys in the JSON arguments string with canonical keys.
func remapArgs(args string, aliasMap map[string]string) (string, error) {
    if len(aliasMap) == 0 {
        return args, nil
    }

    trimmed := strings.TrimSpace(args)
    if trimmed == "" || trimmed[0] != '{' {
        return args, nil
    }

    var m map[string]json.RawMessage
    if err := sonic.Unmarshal([]byte(args), &m); err != nil {
        return args, nil
    }

    changed := false
    for alias, canonical := range aliasMap {
        if v, ok := m[alias]; ok {
            // Only replace if canonical key doesn't exist.
            if _, exists := m[canonical]; !exists {
                m[canonical] = v
                delete(m, alias)
                changed = true
            }
        }
    }

    if !changed {
        return args, nil
    }
    b, err := sonic.Marshal(m)
    return string(b), err
}
```

**关键细节**：
- 用 `sonic`（字节开源 JSON 库）做高性能编解码
- **Alias 优先于 canonical**：如果两者都存在，alias 保留为"未知字段"传递
- 容错：解析失败就原样返回（不破坏原 args）

---

## 7. ReAct Agent：经典 ReAct 模式

源码：`/tmp/eino/flow/agent/react/react.go`

### 7.1 状态与中间件

源码：`/tmp/eino/flow/agent/react/react.go:29-65`

```go
type toolResultSender func(toolName, callID, result string)

type enhancedToolResultSender func(toolName, callID string, result *schema.ToolResult)
type streamToolResultSender func(toolName, callID string, resultStream *schema.StreamReader[string])
type enhancedStreamToolResultSender func(toolName, callID string, resultStream *schema.StreamReader[*schema.ToolResult])

type toolResultSenders struct {
    sender       toolResultSender
    streamSender streamToolResultSender

    enhancedResultSender           enhancedToolResultSender
    enhancedStreamToolResultSender enhancedStreamToolResultSender
}

type state struct {
    Messages                 []*schema.Message
    ReturnDirectlyToolCallID string
}

func init() {
    schema.RegisterName[*state]("_eino_react_state")
}
```

**`ReturnDirectlyToolCallID`**：当 Agent 调到"返回直接结果"的工具时，跳过后续 ChatModel 调用，直接把结果作为最终输出。

### 7.2 toolResultCollectorMiddleware：工具结果回调

源码：`/tmp/eino/flow/agent/react/react.go:65-125`

```go
func newToolResultCollectorMiddleware() compose.ToolMiddleware {
    return compose.ToolMiddleware{
        Invokable: func(next compose.InvokableToolEndpoint) compose.InvokableToolEndpoint {
            return func(ctx context.Context, input *compose.ToolInput) (*compose.ToolOutput, error) {
                senders := getToolResultSendersFromCtx(ctx)
                output, err := next(ctx, input)
                if err != nil {
                    return nil, err
                }
                if senders != nil && senders.sender != nil {
                    senders.sender(input.Name, input.CallID, output.Result)
                }
                return output, nil
            }
        },
        Streamable: func(next compose.StreamableToolEndpoint) compose.StreamableToolEndpoint {
            return func(ctx context.Context, input *compose.ToolInput) (*compose.StreamToolOutput, error) {
                senders := getToolResultSendersFromCtx(ctx)
                output, err := next(ctx, input)
                if err != nil {
                    return nil, err
                }
                if senders != nil && senders.streamSender != nil {
                    streams := output.Result.Copy(2)
                    senders.streamSender(input.Name, input.CallID, streams[0])
                    output.Result = streams[1]
                }
                return output, nil
            }
        },
        EnhancedInvokable: /* ... */,
        EnhancedStreamable: /* ... */,
    }
}
```

**Stream 复制**：用 `streams := output.Result.Copy(2)` 把流分叉成两份，一份给 sender（外部消费者，可观测性），一份继续走 Next 链。

### 7.3 AgentConfig

源码：`/tmp/eino/flow/agent/react/react.go:135-190`

```go
type AgentConfig struct {
    // ToolCallingModel is the chat model to be used for handling user messages with tool calling capability.
    ToolCallingModel model.ToolCallingChatModel

    // Deprecated: Use ToolCallingModel instead.
    Model model.ChatModel

    // ToolsConfig is the config for tools node.
    ToolsConfig compose.ToolsNodeConfig

    MessageModifier MessageModifier

    // MessageRewriter modifies message in the state, before the ChatModel is called.
    MessageRewriter MessageModifier

    // MaxStep.
    // default 12 of steps in pregel (node num + 10).
    MaxStep int `json:"max_step"`

    // Tools that will make agent return directly when the tool is called.
    ToolReturnDirectly map[string]struct{}

    // StreamToolCallChecker is a function to determine whether the model's streaming output contains tool calls.
    StreamToolCallChecker func(ctx context.Context, modelOutput *schema.StreamReader[*schema.Message]) (bool, error)

    GraphName     string
    ModelNodeName string
    ToolsNodeName string
}
```

**StreamToolCallChecker 必要性**：不同模型流式输出工具调用的方式不同：
- OpenAI：直接输出 `ToolCalls`
- Claude：先输出文本，再输出 ToolCalls
- 默认 `firstChunkStreamToolCallChecker` 只检查第一个 chunk（Coze 默认实现可看 7.4）

### 7.4 firstChunkStreamToolCallChecker

源码：`/tmp/eino/flow/agent/react/react.go:218-240`

```go
func firstChunkStreamToolCallChecker(_ context.Context, sr *schema.StreamReader[*schema.Message]) (bool, error) {
    defer sr.Close()

    for {
        msg, err := sr.Recv()
        if err == io.EOF {
            return false, nil
        }
        if err != nil {
            return false, err
        }

        if len(msg.ToolCalls) > 0 {
            return true, nil
        }

        if len(msg.Content) == 0 { // skip empty chunks at the front
            continue
        }

        return false, nil
    }
}
```

**Coze 等价实现**：在自己仓库里覆写此函数，扫描所有 chunk 找到 `tool_use` 块才返回 true（适用于 Claude）。

### 7.5 SetReturnDirectly：工具内主动结束

源码：`/tmp/eino/flow/agent/react/react.go:249-259`

```go
// SetReturnDirectly is a helper function that can be called within a tool's execution.
// It signals the ReAct agent to stop further processing and return the result of the current tool call directly.
func SetReturnDirectly(ctx context.Context) error {
    return compose.ProcessState(ctx, func(ctx context.Context, s *state) error {
        s.ReturnDirectlyToolCallID = compose.GetToolCallID(ctx)
        return nil
    })
}
```

**使用场景**：工具自己判断"我已经是最终答案了"，调用 `SetReturnDirectly(ctx)`，Agent 跳过 ChatModel，直接把工具结果作为最终输出。

### 7.6 NewAgent：核心装配

源码：`/tmp/eino/flow/agent/react/react.go:279-397`

```go
func NewAgent(ctx context.Context, config *AgentConfig) (_ *Agent, err error) {
    var (
        chatModel       model.BaseChatModel
        toolsNode       *compose.ToolsNode
        toolInfos       []*schema.ToolInfo
        toolCallChecker = config.StreamToolCallChecker
        messageModifier = config.MessageModifier
    )

    // ... 名字默认值

    if toolCallChecker == nil {
        toolCallChecker = firstChunkStreamToolCallChecker
    }

    if toolInfos, err = genToolInfos(ctx, config.ToolsConfig); err != nil {
        return nil, err
    }

    if chatModel, err = agent.ChatModelWithTools(config.Model, config.ToolCallingModel, toolInfos); err != nil {
        return nil, err
    }

    config.ToolsConfig.ToolCallMiddlewares = append(
        []compose.ToolMiddleware{newToolResultCollectorMiddleware()},
        config.ToolsConfig.ToolCallMiddlewares...,
    )

    if toolsNode, err = compose.NewToolNode(ctx, &config.ToolsConfig); err != nil {
        return nil, err
    }

    graph := compose.NewGraph[[]*schema.Message, *schema.Message](compose.WithGenLocalState(func(ctx context.Context) *state {
        return &state{Messages: make([]*schema.Message, 0, config.MaxStep+1)}
    }))

    modelPreHandle := func(ctx context.Context, input []*schema.Message, state *state) ([]*schema.Message, error) {
        state.Messages = append(state.Messages, input...)

        if config.MessageRewriter != nil {
            state.Messages = config.MessageRewriter(ctx, state.Messages)
        }

        if messageModifier == nil {
            return state.Messages, nil
        }

        modifiedInput := make([]*schema.Message, len(state.Messages))
        copy(modifiedInput, state.Messages)
        return messageModifier(ctx, modifiedInput), nil
    }

    if err = graph.AddChatModelNode(nodeKeyModel, chatModel, compose.WithStatePreHandler(modelPreHandle), compose.WithNodeName(modelNodeName)); err != nil {
        return nil, err
    }

    if err = graph.AddEdge(compose.START, nodeKeyModel); err != nil {
        return nil, err
    }

    toolsNodePreHandle := func(ctx context.Context, input *schema.Message, state *state) (*schema.Message, error) {
        if input == nil {
            return state.Messages[len(state.Messages)-1], nil // used for rerun interrupt resume
        }
        state.Messages = append(state.Messages, input)
        state.ReturnDirectlyToolCallID = getReturnDirectlyToolCallID(input, config.ToolReturnDirectly)
        return input, nil
    }
    if err = graph.AddToolsNode(nodeKeyTools, toolsNode, compose.WithStatePreHandler(toolsNodePreHandle), compose.WithNodeName(toolsNodeName)); err != nil {
        return nil, err
    }

    modelPostBranchCondition := func(ctx context.Context, sr *schema.StreamReader[*schema.Message]) (endNode string, err error) {
        if isToolCall, err := toolCallChecker(ctx, sr); err != nil {
            return "", err
        } else if isToolCall {
            return nodeKeyTools, nil
        }
        return compose.END, nil
    }

    if err = graph.AddBranch(nodeKeyModel, compose.NewStreamGraphBranch(modelPostBranchCondition, map[string]bool{nodeKeyTools: true, compose.END: true})); err != nil {
        return nil, err
    }

    if err = buildReturnDirectly(graph); err != nil {
        return nil, err
    }

    compileOpts := []compose.GraphCompileOption{compose.WithMaxRunSteps(config.MaxStep), compose.WithNodeTriggerMode(compose.AnyPredecessor), compose.WithGraphName(graphName)}
    runnable, err := graph.Compile(ctx, compileOpts...)
    if err != nil {
        return nil, err
    }

    return &Agent{
        runnable:         runnable,
        graph:            graph,
        graphAddNodeOpts: []compose.GraphAddNodeOpt{compose.WithGraphCompileOptions(compileOpts...)},
    }, nil
}
```

**核心图结构**：
```
START → [ChatModel] → (if tool_call?) → [Tools] → (if returnDirectly?) → [direct_return] → END
                       (else)            ↓                               ↓
                        END              [ChatModel] ←──────────────────┘
```

### 7.7 buildReturnDirectly：return-direct 通路

源码：`/tmp/eino/flow/agent/react/react.go:399-449`

```go
func buildReturnDirectly(graph *compose.Graph[[]*schema.Message, *schema.Message]) (err error) {
    directReturn := func(ctx context.Context, msgs *schema.StreamReader[[]*schema.Message]) (*schema.StreamReader[*schema.Message], error) {
        return schema.StreamReaderWithConvert(msgs, func(msgs []*schema.Message) (*schema.Message, error) {
            var msg *schema.Message
            err = compose.ProcessState[*state](ctx, func(_ context.Context, state *state) error {
                for i := range msgs {
                    if msgs[i] != nil && msgs[i].ToolCallID == state.ReturnDirectlyToolCallID {
                        msg = msgs[i]
                        return nil
                    }
                }
                return nil
            })
            if err != nil {
                return nil, err
            }
            if msg == nil {
                return nil, schema.ErrNoValue
            }
            return msg, nil
        }), nil
    }

    nodeKeyDirectReturn := "direct_return"
    if err = graph.AddLambdaNode(nodeKeyDirectReturn, compose.TransformableLambda(directReturn)); err != nil {
        return err
    }

    // this branch checks if the tool called should return directly. It either leads to END or back to ChatModel
    err = graph.AddBranch(nodeKeyTools, compose.NewStreamGraphBranch(func(ctx context.Context, msgsStream *schema.StreamReader[[]*schema.Message]) (endNode string, err error) {
        msgsStream.Close()

        err = compose.ProcessState[*state](ctx, func(_ context.Context, state *state) error {
            if len(state.ReturnDirectlyToolCallID) > 0 {
                endNode = nodeKeyDirectReturn
            } else {
                endNode = nodeKeyModel
            }
            return nil
        })
        if err != nil {
            return "", err
        }
        return endNode, nil
    }, map[string]bool{nodeKeyModel: true, nodeKeyDirectReturn: true}))
    if err != nil {
        return err
    }

    return graph.AddEdge(nodeKeyDirectReturn, compose.END)
}
```

**机制**：从 Tools 节点出来后，用 Branch 检查 `state.ReturnDirectlyToolCallID`：如果非空，走 direct_return → END；否则回到 ChatModel 继续循环。

---

## 8. ADK 状态机（eino 主线最新版）

源码：`/tmp/eino/adk/react.go`

### 8.1 typedState 泛型状态

源码：`/tmp/eino/adk/react.go:35-65`

```go
type typedState[M MessageType] struct {
    Messages []M
    Extra    map[string]any

    // ToolInfos contains the tool definitions passed to the model via model.WithTools.
    // Managed by the framework and modifiable by BeforeModelRewriteState handlers.
    ToolInfos []*schema.ToolInfo

    // DeferredToolInfos contains tool definitions for server-side deferred retrieval,
    // passed to the model via model.WithDeferredTools. Nil when not in use.
    DeferredToolInfos []*schema.ToolInfo

    // Internal fields below - do not access directly.
    HasReturnDirectly        bool
    ReturnDirectlyToolCallID string
    ToolGenActions           map[string]*AgentAction
    AgentName                string
    RemainingIterations      int
    ReturnDirectlyEvent      *TypedAgentEvent[M]
    RetryAttempt             int
    ToolMsgIDs               map[string]map[string]string // toolName → callID → eino message ID
}

type State = typedState[*schema.Message]
type agenticState = typedState[*schema.AgenticMessage]
```

**设计**：
- 同一份状态机同时支持 `*schema.Message` 和 `*schema.AgenticMessage`（泛型 M）
- `Extra map[string]any`：自定义上下文，业务可塞 KV
- `ToolInfos` 字段：模型感知工具集（动态修改 → 影响下一轮模型调用）
- `ToolMsgIDs`：用于客户端 UI 把"工具结果"映射回模型消息

### 8.2 Checkpoint 兼容：双 epoch 注册

源码：`/tmp/eino/adk/react.go:67-104`

```go
const (
    stateGobNameV07 = "_eino_adk_react_state"

    // stateGobNameV080 is a v0.8.0-v0.8.3-only alias used after byte-patching
    // raw checkpoint bytes in preprocessADKCheckpoint.
    // It must stay the same byte length as stateGobNameV07 so the length-prefixed
    // gob string in the stream remains valid.
    stateGobNameV080 = "_eino_adk_state_v080_"
)

func init() {
    // Checkpoint compatibility notes:
    // - ADK/compose checkpoints are gob-encoded and may store state behind `any`, so gob relies on
    //   an on-wire type name to choose a local Go type.
    // - Gob allows only one local Go type per name, and it treats "struct wire" and "GobEncoder wire"
    //   as incompatible even if the name matches.

    // This file maintains 2 epochs of *State decoding:
    // - v0.7.* and current: "_eino_adk_react_state" + struct wire → decode into *State directly.
    // - v0.8.0-v0.8.3: "_eino_adk_react_state" + GobEncoder wire → byte-patched to stateGobNameV080,
    //   decode into stateV080 and migrate.
    schema.RegisterName[*State](stateGobNameV07)
    schema.RegisterName[*stateV080](stateGobNameV080)

    schema.RegisterName[*typedState[*schema.AgenticMessage]]("_eino_adk_agentic_state")
    schema.RegisterName[*TypedAgentEvent[*schema.AgenticMessage]]("_eino_adk_agentic_event")

    // backward compatibility when decoding checkpoints created by v0.8.0 - v0.8.3
    gob.Register(&AgentEvent{})
    gob.Register(0)

    schema.RegisterName[*TypedAgentInput[*schema.AgenticMessage]]("_eino_adk_agentic_agent_input")
    schema.RegisterName[*typedAgentEventWrapper[*schema.AgenticMessage]]("_eino_adk_agentic_event_wrapper")
    schema.RegisterName[*[]*typedAgentEventWrapper[*schema.AgenticMessage]]("_eino_adk_agentic_event_wrapper_slice")
    schema.RegisterName[*reactInput]("_eino_adk_react_input")
    schema.RegisterName[*agenticReactInput]("_eino_adk_agentic_react_input")
}
```

**这是非常工业级的做法**：
- gob 序列化的 type name 长度必须**保持一致**（否则流式 prefix 错位）
- 用 `preprocessADKCheckpoint` 在反序列化前**字节替换** type name
- 跨 2 个大版本（0.7.x → 0.8.4+）的 checkpoint 兼容

---

## 9. schema 包：Message + StreamReader

源码：`/tmp/eino/schema/`

### 9.1 角色 + FormatType

源码：`/tmp/eino/schema/message.go:96-130`

```go
// FormatType used by MessageTemplate.Format
type FormatType uint8

const (
    // FString Supported by pyfmt(github.com/slongfield/pyfmt), which is an implementation of https://peps.python.org/pep-3101/.
    FString FormatType = 0
    // GoTemplate https://pkg.go.dev/text/template.
    GoTemplate FormatType = 1
    // Jinja2 Supported by gonja(github.com/nikolalohinski/gonja), which is a implementation of https://jinja.palletsprojects.com/en/3.1.x/templates/.
    Jinja2 FormatType = 2
)

// RoleType is the type of the role of a message.
type RoleType string

const (
    Assistant RoleType = "assistant"
    User      RoleType = "user"
    System    RoleType = "system"
    Tool      RoleType = "tool"
)

// FunctionCall is the function call in a message.
type FunctionCall struct {
    Name      string `json:"name,omitempty"`
    Arguments string `json:"arguments,omitempty"`
}
```

**三模板引擎**：FString（Python 风格）/ GoTemplate / Jinja2（Python web 框架风格），都用 Go 库实现，无 CGO。

### 9.2 Stream 流式核心

源码：`/tmp/eino/schema/stream.go:32-100`

```go
var ErrNoValue = errors.New("no value")

var ErrRecvAfterClosed = errors.New("recv after stream closed")

// SourceEOF represents an EOF error from a specific source stream.
type SourceEOF struct {
    sourceName string
}

func (e *SourceEOF) Error() string {
    return fmt.Sprintf("EOF from source stream: %s", e.sourceName)
}

func GetSourceName(err error) (string, bool) {
    var sErr *SourceEOF
    if errors.As(err, &sErr) {
        return sErr.sourceName, true
    }
    return "", false
}

// Pipe creates a new stream with the given capacity that represented with StreamWriter and StreamReader.
func Pipe[T any](cap int) (*StreamReader[T], *StreamWriter[T]) {
    stm := newStream[T](cap)
    return stm.asReader(), &StreamWriter[T]{stm: stm}
}
```

**SourceEOF**：多源合并流中，`Recv` 返回的 io.EOF 仅代表其中一个源结束，其他源还在输出。通过 `errors.As` 提取源头名。

---

## 10. Coze Studio 集成：基于 Eino 的实际应用

源码：`/tmp/coze-studio/backend/`

### 10.1 AgentRunner：Coze 的单 Agent 运行时

源码：`/tmp/coze-studio/backend/domain/agent/singleagent/internal/agentflow/agent_flow_runner.go:40-130`

```go
type AgentState struct {
    Messages                 []*schema.Message
    UserInput                *schema.Message
    ReturnDirectlyToolCallID string
}

type AgentRequest struct {
    UserID  string
    Input   *schema.Message
    History []*schema.Message

    Identity *singleagent.AgentIdentity

    ResumeInfo   *singleagent.InterruptInfo
    PreCallTools []*agentrun.ToolsRetriever
    Variables    map[string]string
}

type AgentRunner struct {
    runner            compose.Runnable[*AgentRequest, *schema.Message]
    requireCheckpoint bool

    returnDirectlyTools map[string]struct{}
    containWfTool       bool
    modelInfo           *modelmgr.Model
}

func (r *AgentRunner) StreamExecute(ctx context.Context, req *AgentRequest) (
    sr *schema.StreamReader[*entity.AgentEvent], err error,
) {
    executeID := uuid.New()

    hdl, sr, sw := newReplyCallback(ctx, executeID.String(), r.returnDirectlyTools)

    var composeOpts []compose.Option
    var pipeMsgOpt compose.Option
    var workflowMsgSr *schema.StreamReader[*crossworkflow.WorkflowMessage]
    var workflowMsgCloser func()
    if r.containWfTool {
        cfReq := crossworkflow.ExecuteConfig{
            AgentID:      &req.Identity.AgentID,
            ConnectorUID: req.UserID,
            ConnectorID:  req.Identity.ConnectorID,
            BizType:      crossworkflow.BizTypeAgent,
        }
        if req.Identity.IsDraft {
            cfReq.Mode = crossworkflow.ExecuteModeDebug
        } else {
            cfReq.Mode = crossworkflow.ExecuteModeRelease
        }
        wfConfig := crossworkflow.DefaultSVC().WithExecuteConfig(cfReq)
        composeOpts = append(composeOpts, wfConfig)
        pipeMsgOpt, workflowMsgSr, workflowMsgCloser = crossworkflow.DefaultSVC().WithMessagePipe()
        composeOpts = append(composeOpts, pipeMsgOpt)
    }

    composeOpts = append(composeOpts, compose.WithCallbacks(hdl))
    _ = compose.RegisterSerializableType[*AgentState]("agent_state")
    if r.requireCheckpoint {
        defaultCheckPointID := executeID.String()
        if req.ResumeInfo != nil {
            resumeInfo := req.ResumeInfo
            if resumeInfo.InterruptType != singleagent.InterruptEventType_OauthPlugin {
                defaultCheckPointID = resumeInfo.InterruptID
                opts := crossworkflow.DefaultSVC().WithResumeToolWorkflow(resumeInfo.AllWfInterruptData[resumeInfo.ToolCallID], req.Input.Content, resumeInfo.AllWfInterruptData)
                composeOpts = append(composeOpts, opts)
            }
        }
        composeOpts = append(composeOpts, compose.WithCheckPointID(defaultCheckPointID))
    }
    if r.containWfTool && workflowMsgSr != nil {
        safego.Go(ctx, func() {
            r.processWfMidAnswerStream(ctx, sw, workflowMsgSr)
        })
    }
    safego.Go(ctx, func() {
        defer func() {
            if pe := recover(); pe != nil {
                logs.CtxErrorf(ctx, "[AgentRunner] StreamExecute recover, err: %v", pe)
            }
        }()
        // ... 调用 runner.Stream
    })
    // ...
}
```

**核心集成点**：
- `runner compose.Runnable[*AgentRequest, *schema.Message]`：Coze 包装 Eino 的 Runnable，**输入从 `[]Message` 变成 `*AgentRequest`**（带身份、历史、变量、检查点信息）
- `compose.WithCallbacks(hdl)`：Coze 自定义回调，把 Eino 事件翻译成 AgentEvent 推到客户端
- `compose.WithCheckPointID`：开启检查点（用于 HITL 中断/恢复）
- `crossworkflow.DefaultSVC().WithMessagePipe()`：如果 Agent 含工作流工具，启动消息管道把工作流中间答案插到 Agent 流里

### 10.2 Workflow：Coze 的工作流运行时

源码：`/tmp/coze-studio/backend/domain/workflow/internal/compose/workflow.go:37-100`

```go
type workflow = compose.Workflow[map[string]any, map[string]any]

type Workflow struct { // TODO: too many fields in this struct, cut them down to the absolutely essentials
    *workflow
    hierarchy         map[vo.NodeKey]vo.NodeKey
    connections       []*schema.Connection
    requireCheckpoint bool
    entry             *compose.WorkflowNode
    inner             bool
    fromNode          bool // this workflow is constructed from a single node, without Entry or Exit nodes
    streamRun         bool
    Runner            compose.Runnable[map[string]any, map[string]any]
    input             map[string]*vo.TypeInfo
    output            map[string]*vo.TypeInfo
    terminatePlan     vo.TerminatePlan
    schema            *schema.WorkflowSchema
}

func NewWorkflow(ctx context.Context, sc *schema.WorkflowSchema, opts ...WorkflowOption) (*Workflow, error) {
    sc.Init()

    wf := &Workflow{
        workflow:    compose.NewWorkflow[map[string]any, map[string]any](compose.WithGenLocalState(GenState())),
        hierarchy:   sc.Hierarchy,
        connections: sc.Connections,
        schema:      sc,
    }

    wf.streamRun = sc.RequireStreaming()
    wf.requireCheckpoint = sc.RequireCheckpoint()
    // ...
}
```

**Workflow = `map[string]any` in/out**：Coze 的工作流节点之间传递的不是强类型 struct，而是 `map[string]any`（key 是变量名）。这是低代码/可视化编排的代价：动态数据流。

### 10.3 LLM Node 实现

源码：`/tmp/coze-studio/backend/domain/workflow/internal/nodes/llm/llm.go:60-100`

```go
type contextKey string

const chatHistoryKey contextKey = "chatHistory"

type Format int

const (
    FormatText Format = iota
    FormatMarkdown
    FormatJSON
)

const (
    jsonPromptFormat = `
Strictly reply in valid JSON format.
- Ensure the output strictly conforms to the JSON schema below
- Do not include explanations, comments, or any text outside the JSON.

Here is the output JSON schema:
'''
%s
'''
`
    markdownPrompt = `
Strictly reply in valid Markdown format.
- For headings, use number signs (#).
- For list items, start with dashes (-).
- To emphasize text, wrap it with asterisks (*).
- For code or commands, surround them with backticks (` + "`" + `).
- For quoted text, use greater than signs (>).
- For links, wrap the text in square brackets [], followed by the URL in parentheses ().
- For images, use square brackets [] for the alt text, followed by the image URL in parentheses ().
`
)

const (
    ReasoningOutputKey = "reasoning_content"
)

const knowledgeUserPromptTemplate = `根据引用的内容回答问题:
 1.如果引用的内容里面包含 <img src=""> 的标签, 标签里的 src 字段表示图片地址, 需要在回答问题的时候展示出去, 输出格式为"![图片名称](图片地址)" 。
 2.如果引用的内容不包含 <img src=""> 的标签, 你回答问题时不需要展示图片 。
例如：
  如果内容为<img src="https://example.com/image.jpg">一只小猫，你的输出应为：![一只小猫](https://example.com/image.jpg)。
  如果内容为<img src="https://example.com/image1.jpg">一只小猫 和 <img src="https://example.com/image2.jpg">一只小狗 和 <img src="https://example.com/image3.jpg">一只小牛，你的输出应为：![一只小猫](https://example.com/image1.jpg) 和 ![一只小狗](https://example.com/image2.jpg) 和 ![一只小牛](https://example.com/image3.jpg)
you can refer to the following content and do relevant searches to improve:
---
%s

question is:

`
```

**关键 Prompt Engineering 沉淀**：
- 三个输出模式：Text / Markdown / JSON
- JSON 模式强制只输出 schema 实例（避免 LLM 自由发挥）
- 知识库场景的特殊处理：图片标签 → Markdown 图片语法
- `ReasoningOutputKey` 单独存放推理内容（与最终回复分离）

### 10.4 Ark（豆包）模型接入

源码：`/tmp/coze-studio/backend/bizpkg/llm/modelbuilder/ark.go:43-100`

```go
type arkModelBuilder struct {
    cfg *config.Model
}

func newArkModelBuilder(cfg *config.Model) Service {
    return &arkModelBuilder{
        cfg: cfg,
    }
}

func (b *arkModelBuilder) getDefaultConfig() *ark.ChatModelConfig {
    return &ark.ChatModelConfig{}
}

func (b *arkModelBuilder) applyParamsToChatModelConfig(chatModelConf *ark.ChatModelConfig, params *LLMParams) {
    if params == nil {
        return
    }

    chatModelConf.TopP = params.TopP

    if params.Temperature != nil {
        chatModelConf.Temperature = ptr.Of(*params.Temperature)
    }

    if params.MaxTokens != 0 {
        chatModelConf.MaxTokens = ptr.Of(params.MaxTokens)
    }

    if params.FrequencyPenalty != 0 {
        chatModelConf.FrequencyPenalty = ptr.Of(params.FrequencyPenalty)
    }

    if params.PresencePenalty != 0 {
        chatModelConf.PresencePenalty = ptr.Of(params.PresencePenalty)
    }

    if params.EnableThinking != nil {
        arkThinkingType := ternary.IFElse(*params.EnableThinking, model.ThinkingTypeEnabled, model.ThinkingTypeDisabled)
        chatModelConf.Thinking = &model.Thinking{
            Type: arkThinkingType,
        }
    }

    switch params.ResponseFormat {
    case bot_common.ModelResponseFormat_Text,
        bot_common.ModelResponseFormat_Markdown:
        chatModelConf.ResponseFormat = &ark.ResponseFormat{
            Type: model.ResponseFormatText,
        }
    case bot_common.ModelResponseFormat_JSON:
        chatModelConf.ResponseFormat = &ark.ResponseFormat{
            Type: model.ResponseFormatJsonObject,
        }
    }
}
```

**Ark 模型抽象**：
- 通过 `eino-ext/components/model/ark` 包接入火山方舟
- `Thinking` 字段：豆包 1.5-thinking / 1.6 系列支持 enable_thinking
- ResponseFormat：Text / Markdown / JSON 三档
- 典型模型名见 `conf/model/template/model_template_ark_doubao-seed-1.6*.yaml`：
  - `doubao-seed-1.6`
  - `doubao-seed-1.6-thinking`
  - `doubao-seed-1.6-flash`

---

## 11. RAG 实现

源码：`/tmp/coze-studio/backend/infra/`

### 11.1 检索后端多选

Coze Studio 支持 4 个向量库作为搜索后端：

```
backend/infra/searchstore/impl/
  elasticsearch/  - es7 + es8 双版本
  milvus/         - 主流开源
  oceanbase/      - 字节/蚂蚁分布式
  vikingdb/       - 火山向量数据库
```

每个实现都实现 `SearchStore` 接口，Coze 用工厂模式 `factory.go` 注册。

### 11.2 Rerank 多源融合

源码：`/tmp/coze-studio/backend/infra/rerank/impl/rrf/rrf.go` 标题（RRF = Reciprocal Rank Fusion）

**RRF 算法**：多个 retriever 各自返回 topK，然后按 `1/(k+rank)` 加权求和。Coze 用此融合"语义检索 + 关键词检索"两路结果。

### 11.3 Parser 管线

```
backend/infra/document/parser/impl/builtin/
  parse_csv.go
  parse_docx.py   ← Python 沙箱执行（通过 coderunner）
  parse_pdf.py
  parse_markdown.go
  parse_json.go
  parse_xlsx.go
  parse_image.go  ← 调用 PaddleOCR / veOCR
```

**沙箱安全**：`coderunner/impl/sandbox/runner.go` 跑 Python 解析脚本，避免恶意 docx/pdf 攻击主进程。

---

## 12. 关键发现 & 启示

### 12.1 Eino 的设计哲学

| 设计点 | 价值 |
|--------|------|
| 泛型 + Lambda 四流形 | 类型安全 + 自动流转换 |
| FieldMapping | 节点间字段映射替代硬编码 |
| Checkpoint + 字节级 type name 替换 | 跨大版本平滑升级 |
| StateGenerator + StatePre/PostHandler | 全图共享状态 + 节点级拦截 |
| Pregel 超步模式 | 天然支持环和动态迭代（Agent 核心需求） |

### 12.2 Coze Studio 的工程取舍

| 取舍 | 原因 |
|------|------|
| Workflow 用 `map[string]any` | 动态节点/动态变量名是低代码必需 |
| GORM gen 自动生成 DAO | `backend/domain/*/internal/dal/model/*.gen.go` 数量爆炸 |
| 多 DDD bounded context | agent / conversation / knowledge / workflow / plugin 各为独立域 |
| Kafka/NATS/Pulsar/NSQ/RMQ 五套 eventbus | 不同部署环境兼容 |
| Redis + Mem 双 checkpoint | 兼顾持久化和性能 |

### 12.3 与 LangChain 对比

| 维度 | Eino | LangChain |
|------|------|-----------|
| 类型 | 强类型（Go 泛型） | 弱类型（Python dict） |
| 流式 | 4 范式一阶公民 | Runnable 流支持但实现零散 |
| Checkpoint | 框架内建 | 需自建 |
| 学习曲线 | Go 工程师友好 | Python 工程师友好 |
| 生态 | 字节内 + 火山外扩 | 全社区 |

---

## 13. 附录：仓库统计

| 仓库 | 文件数 | 关键模块 | 备注 |
|------|--------|----------|------|
| cloudwego/eino | 381 .go 文件 | compose/flow/adk/callbacks/components | Go 1.18+ 泛型框架 |
| coze-dev/coze-studio | 1185 backend 文件 + 15k+ frontend | DDD 微服务 + Eino runtime | Apache 2.0 |
| Tencent/weui | 190 文件 | Less 组件库 + 50+ HTML 示例 | MIT |
| bytedance/flowgram.ai | （本任务未抓取） | 画布引擎 | Apache 2.0 |
| cloudwego/hertz | （本任务未抓取） | HTTP 框架 | Apache 2.0 |

---

## 14. 速查表：Coze 工作流节点类型

源码路径（基于 coze-studio 抓取）：

```
backend/domain/workflow/internal/nodes/
  llm/                 - LLM 节点（支持 ReAct 模式）
  code/                - Python/JS 代码节点
  plugin/              - 插件调用
  knowledge/           - 知识库检索/索引/删除
  database/            - 数据库 CRUD + 自定义 SQL
  httprequester/       - HTTP 请求
  conversation/        - 会话管理
  message/             - 消息管理
  intentdetector/      - 意图识别
  qa/                  - 问答对
  selector/            - 条件选择器
  loop/                - 循环
  batch/               - 批处理
  variableaggregator/  - 变量聚合
  variableassigner/    - 变量赋值
  textprocessor/       - 文本处理
  json/                - JSON 序列化/反序列化
  emitter/             - 事件发射
  entry/exit/          - 入/出节点
  receiver/            - 输入接收器
  subworkflow/         - 子工作流
  code/plugin/         - 代码插件
  knowledge/adaptor.go - 知识库适配
```

每个节点都实现统一的 Node 接口，通过 `node_builder.go` 注册到 workflow runner。
