# langchain - LLM 应用工程框架：Runnable 协议 + LCEL + 700+ 集成

**GitHub**: langchain-ai/langchain
**Star**: 95k+
**语言**: Python
**主题**: llm/ai-agent/rag/runnable/lcel
**适用场景**: LLM 应用工程 / Agent 编排 / RAG 系统 / 多模型切换 / 企业 AI 转型

```
libs/core/          # 协议层 Runnable / Messages / Callbacks（零依赖）
libs/langchain/     # 高级 API Agents / Retrievers / Chains
libs/langchain_v1/  # v1 精简 API
libs/partners/      # 700+ 集成包（OpenAI / Anthropic / Chroma / Pinecone）
libs/langgraph/     # 状态机 Agent（StateGraph）
```

## 第一段：基础范式

### 模式 1：Runnable 协议（4 核心方法）

**问题场景**：LLM 应用要"调用模型 / 批量处理 / 流式输出 / 异步调用"4 种交互，单一接口难统一。

**解决方案**：`Runnable` 协议定义 4 核心方法——`invoke(input)` 同步单条 / `batch(inputs)` 同步批量 / `stream(input)` 流式输出 / `ainvoke(input)` 异步单条；`Generic[Input, Output]` 类型化；Pydantic v2 验证；所有组件（ChatModel / Prompt / Retriever / OutputParser）实现 Runnable。

**关键参数**：
- `invoke / batch / stream / ainvoke`
- `Generic[Input, Output]`
- Pydantic v2 验证
- 所有组件实现
- 4 核心方法

**最佳实践**：库要做"AI 组件统一接口"必走 Runnable 协议；**4 核心方法 + 类型化**是 LLM 时代 API 标杆；适用任何"模型 + 工具 + Prompt"组合。

---

### 模式 2：LCEL 管道组合（`|` 操作符）

**问题场景**：业务要"Prompt → Model → Parser"3 步链式调用，写 callback 累死。

**解决方案**：LCEL（LangChain Expression Language）支持 `prompt | model | parser` 用 `|` 串成 `RunnableSequence`；`chain.invoke(input)` 一步跑完 3 步；`chain.batch([i1, i2, i3])` 批量；`chain.stream(input)` 流式；4 方法自动组合。
```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain.chat_models import init_chat_model

model = init_chat_model("openai:gpt-4")
prompt = ChatPromptTemplate.from_messages([("user", "{q}")])
chain = prompt | model | StrOutputParser()
print(chain.invoke({"q": "Hello"}))
```

**关键参数**：
- `|` 操作符
- `RunnableSequence`
- 链式 + 批量 + 流式
- 自动组合
- 4 核心方法透传

**最佳实践**：LLM 应用要"管道组合"必用 LCEL；**比手写 callback 简单 100x**；适用任何"LLM 链式调用"。

---

### 模式 3：Message block + Translator 模式

**问题场景**：不同模型 API 消息格式不同（OpenAI / Anthropic / Google），业务要"统一消息结构 + 模型无关"。

**解决方案**：`BaseMessage` 抽象 + 4 子类（`HumanMessage` / `AIMessage` / `SystemMessage` / `ToolMessage`）；`MessageBlockTranslator` 把 BaseMessage 翻译成各模型原生格式（OpenAI ChatCompletion / Anthropic Messages / Google generateContent）；`content` 字段 string 或 list[dict] 多模态。

**关键参数**：
- 4 子类消息
- `BaseMessage` 抽象
- 翻译器模式
- 模型无关
- 多模态 content

**最佳实践**：LLM 框架要"模型无关"必走"统一消息 + 翻译器"模式；**业务代码零模型切换成本**；适用任何"多模型适配"。

---

### 模式 4：ChatModel vs LLM 双层抽象

**问题场景**：Chat 模型（OpenAI gpt-4）vs 补全模型（OpenAI text-davinci）API 形态不同。

**解决方案**：`BaseChatModel` 处理 Chat 风格（messages 数组）；`BaseLLM` 处理补全风格（prompt 字符串）；`init_chat_model("openai:gpt-5.4")` 一行初始化；模型无关调用 `model.invoke(messages)`；旧补全模型通过 `completion` 字段兼容。

**关键参数**：
- `BaseChatModel` Chat 风格
- `BaseLLM` 补全风格
- `init_chat_model` 一行初始化
- 模型字符串 provider:model
- invoke(messages)

**最佳实践**：LLM 框架要"双 API 风格兼容"分 Chat / 补全两层抽象；**比硬绑一种风格灵活 10x**；适用任何"模型演进 + 多 API"。

---

### 模式 5：Pydantic v2 + typing 严格类型

**问题场景**：LLM 输出结构化（JSON / Pydantic model）业务要用；string 输出难解析。

**解决方案**：`OutputParser` + `PydanticOutputParser` 把 LLM 文本输出解析成 Pydantic v2 model；`with_structured_output(Person)` 一行约束输出 schema；`tool_choice="auto"` 让模型选 tool；`Pydantic v2` 性能提升 5-50x。

**关键参数**：
- `OutputParser` 体系
- `Pydantic v2` 性能
- `with_structured_output`
- `tool_choice` 约束
- JSON schema 校验

**最佳实践**：LLM 应用要"结构化输出"必用 Pydantic v2 + OutputParser；**比正则解析 JSON 可靠 100x**；适用任何"LLM + 业务对象"。

---

## 第二段：扩展范式

### 模式 6：700+ Partner 集成

**问题场景**：LLM 应用要接 OpenAI / Anthropic / Google / Cohere / Mistral / 50+ 向量库 / 100+ 数据源，每个手写 adapter 累死。

**解决方案**：`libs/partners/*` 独立子包（`langchain-openai` / `langchain-anthropic` / `langchain-chroma` / `langchain-pinecone` / ...），每个走 `langchain-core` 协议；`pip install langchain-openai` 按需安装；统一 `BaseChatModel` / `BaseVectorStore` / `BaseRetriever` 接口。

**关键参数**：
- 700+ partner 子包
- `langchain-core` 协议层
- 独立 pip install
- 统一 BaseChatModel
- 按需引入

**最佳实践**：LLM 框架要"生态丰富"用 partner 子包 + 协议层 + 按需安装；**主包体积 < 1MB**；适用任何"框架 + 多生态"。

---

### 模式 7：Callback 系统 + 钩子分发

**问题场景**：业务要"LLM 调用前后埋点（日志 / 监控 / 重试 / fallback）"，改框架代码不优雅。

**解决方案**：`BaseCallbackHandler` 协议：`on_llm_start / on_llm_end / on_chain_start / on_chain_end / on_tool_start / on_tool_error` 等 30+ 钩子；`chain.invoke(input, config={"callbacks": [MyHandler()]})` 注入；LangSmith 内置回调；多 handler 并行分发。

**关键参数**：
- `BaseCallbackHandler` 协议
- 30+ 钩子
- `config.callbacks` 注入
- 多 handler 并行
- LangSmith 内置

**最佳实践**：LLM 框架要"可观测"必走 Callback 系统；**业务无侵入埋点**；适用任何"框架 + 监控 / 重试 / 审计"。

---

### 模式 8：VectorStore 抽象 + Retriever 接口

**问题场景**：RAG 要"存 embedding + 检索 top-k"，Chroma / Pinecone / Weaviate / FAISS 10+ 实现。

**解决方案**：`VectorStore` 抽象 + `BaseRetriever` 接口；`add_texts / similarity_search / from_texts` 通用方法；`as_retriever(search_kwargs={"k": 5})` 一行转 Retriever；`MultiQueryRetriever` / `SelfQueryRetriever` / `ContextualCompressionRetriever` 等高级组合。

**关键参数**：
- `VectorStore` 抽象
- `BaseRetriever` 接口
- `as_retriever` 转换
- `similarity_search` top-k
- 高级 Retriever 组合

**最佳实践**：RAG 系统要"向量库无关"必走 VectorStore + Retriever 抽象；**业务零切换成本**；适用任何"AI 应用 + 检索"。

---

### 模式 9：Agent + Tools 函数调用

**问题场景**：LLM 要"调用工具 / API / 数据库" 解决开放问题；纯 prompt 难可靠。

**解决方案**：`@tool` 装饰器把 Python 函数变 Tool；`bind_tools([t1, t2, t3])` 给模型工具集；`create_react_agent(model, tools)` 走 ReAct 循环（Reasoning + Acting）；`AgentExecutor` 跑 agent + 调 tool + 返回；`tool_choice="auto"` 让模型选；`handle_tool_errors` 兜底。
```python
from langchain_core.tools import tool
from langchain.agents import create_react_agent, AgentExecutor

@tool
def search(query: str) -> str:
    """搜索工具"""
    return f"result for {query}"

agent = create_react_agent(model, [search])
executor = AgentExecutor(agent=agent, tools=[search])
print(executor.invoke({"input": "今天天气"}))
```

**关键参数**：
- `@tool` 装饰器
- `bind_tools` 注入
- ReAct 推理循环
- `AgentExecutor` 调度
- `tool_choice` 自动选

**最佳实践**：LLM 应用要"Agent"必走 `@tool + bind_tools + ReAct`；**业务 5 行写一个 Agent**；适用任何"LLM + 工具调用"。

---

### 模式 10：standard-tests 集成测试框架

**问题场景**：700+ 集成包要验证符合 Runnable 协议，新接入 vector store 怎么测？

**解决方案**：`langchain-tests` 提供 standard-tests：每个集成包跑同一套测试验证协议合规；`pytest --provider=OpenAI` 跑所有 OpenAI 相关测试；CI 自动跑；测试用例覆盖 `invoke / batch / stream / ainvoke` + 异常 + 边界；接入新包只需加 1 个 conftest.py。

**关键参数**：
- `langchain-tests` 框架
- 同套测试验证协议
- pytest 跑全部
- 异常 + 边界覆盖
- 接入 conftest.py

**最佳实践**：库要做"集成测试"用 standard-tests 共享测试套件；**接入新包 1 个 conftest.py**；适用任何"框架 + 多 provider"。

---

## 第三段：进阶范式

### 模式 11：langchain-core / langchain / partners 三层 monorepo

**问题场景**：LLM 框架要做"协议 + 高级 API + 多 provider 集成"三层，单包体爆炸。

**解决方案**：`libs/core` 协议层（Runnable / Messages / Callbacks / Pydantic 工具，零外部依赖）；`libs/langchain` 高级 API（Agents / Retrievers / Chains）；`libs/langchain_v1` v1 新版（精简 API）；`libs/partners/*` 700+ 集成包；uv workspace 管理。

**关键参数**：
- core 协议层
- langchain 高级 API
- v1 精简版
- partners 集成
- uv workspace

**最佳实践**：LLM 框架要"分层"用 core + langchain + partners 三层 monorepo；**core 零依赖**；适用任何"框架 + 多 provider"。

---

### 模式 12：Generic[Input, Output] 类型化

**问题场景**：LLM 链式调用 `prompt | model | parser` 各环节类型不同，IDE 不知道最终输出什么。

**解决方案**：`Runnable[Input, Output]` 泛型；`Prompt[Dict, PromptValue]` + `ChatModel[PromptValue, AIMessage]` + `Parser[AIMessage, Person]` 链式类型传递；`chain: Runnable[Dict, Person] = prompt | model | parser` IDE 自动补全；mypy 严格模式 0 报错。

**关键参数**：
- `Runnable[Input, Output]`
- 链式类型传递
- mypy 严格模式
- IDE 自动补全
- 编译期类型检查

**最佳实践**：Python 库要做"类型化链式"必用 Generic 泛型；**IDE 体验提升 5x**；适用任何"Python 库 + 类型化 API"。

---

### 模式 13：VCR cassette 测试 LLM 响应

**问题场景**：LLM 集成测试要花真金白银调 API，CI 跑一次 100+ 美元；测试不可重现。

**解决方案**：`pytest-vcr` + `cassette` 文件存真实 LLM 响应（YAML / JSON）；`chain.invoke` 第一次调 API 存 cassette，后续从 cassette 读；CI 不调 API；cassette commit 进 git；新 prompt 重新录制。

**关键参数**：
- `pytest-vcr` 录制
- cassette 文件
- 首次实调 + 后续重放
- CI 零成本
- cassette commit

**最佳实践**：LLM 应用要"测试省钱"必用 VCR cassette；**CI 成本 0 + 测试可重现**；适用任何"LLM 集成 + CI"。

---

### 模式 14：LangGraph 状态机 + 循环

**问题场景**：Agent 简单 ReAct 不够，要"循环 / 分支 / 人机协同 / 多 agent 协作"。

**解决方案**：`LangGraph` 用 StateGraph 状态机：`add_node` 节点 + `add_edge` 边 + `add_conditional_edges` 条件边 + `add_node("human", human_node)` 人机协同；`State` TypedDict 共享；`compile()` 跑可执行图；支持循环（agent 自反思）+ 检查点（断点续传）。

**关键参数**：
- `StateGraph` 状态机
- `add_node / add_edge`
- 条件边
- 人机协同节点
- 检查点续传

**最佳实践**：复杂 Agent 要"循环 + 状态"用 LangGraph 状态机；**比硬写 ReAct 灵活 10x**；适用任何"Agent + 状态"。

---

### 模式 15：LangSmith 商业化 Observability

**问题场景**：LLM 应用上线要"监控 / 调试 / 评估"，自建难。

**解决方案**：`LangSmith` SaaS 平台：trace LLM 调用链 / token 消耗 / 延迟 / 成本；prompt 版本管理；dataset 评估；A/B test；callback 自动上报；MIT 框架 + 商业 LangSmith 双轨制；Confluent 风格。

**关键参数**：
- trace 调用链
- token + 成本
- prompt 版本
- dataset 评估
- A/B test

**最佳实践**：LLM 框架商业化用"开源 + 商业"双轨；**LangSmith / Confluent / MongoDB** 同样模式；适用任何"AI 框架 + 商业化"。

---

## 第四段：实战范式

### 模式 16：LLM 应用 smoke test 30 行

**问题场景**：装好 langchain 后快速验证 OpenAI / Anthropic / 自定义模型是否就位。

**解决方案**：30 行 smoke test 验证 3 件套——`init_chat_model("openai:gpt-5.4")` + `ChatPromptTemplate.from_messages` + `StrOutputParser` 链成 `prompt | model | parser`；`chain.invoke({"q": "Hello"})` 端到端。期望：模型返回 `"Hello! How can I help you?"`。

**关键参数**：
- 30 行核心验证
- `init_chat_model` 一行
- `|` 操作符链式
- 3 步组合
- 端到端测试

**最佳实践**：LLM 框架新环境验证用 30 行 smoke test，验证"模型 + 协议 + 链式"三件套；**适用任何"LLM 应用 + 升级回归"**。

---

### 模式 17：RAG 5 步法

**问题场景**：业务要做 RAG（Retrieval-Augmented Generation），loader / split / embed / store / retrieve 5 步混乱。

**解决方案**：RAG 5 步法——① `DocumentLoader` 加载（PDF / Web / DB）② `TextSplitter` 切块（`RecursiveCharacterTextSplitter`）③ `Embeddings` 编码（OpenAI / HuggingFace）④ `VectorStore` 存（Chroma / Pinecone）⑤ `Retriever` 取（`as_retriever(k=5)`）+ `StuffDocumentsChain` 喂给 LLM。

**关键参数**：
- Loader 加载
- Splitter 切块
- Embeddings 编码
- VectorStore 存
- Retriever 取

**最佳实践**：RAG 系统必走"5 步法 + 链式组合"；**LCEL `loader | splitter | embed | store | retriever`** 简洁 10x；适用任何"RAG 业务"。

---

### 模式 18：Agent 调试 4 件套

**问题场景**：Agent 出错定位不到是哪一步：tool 选错 / 参数解析错 / LLM 推理错 / 执行错。

**解决方案**：4 件套调试——① `verbose=True` 打印所有步骤 ② `AgentExecutor` 用 `return_intermediate_steps=True` 拿全步骤 ③ LangSmith trace 完整调用链 ④ `agent.stream(input)` 流式看每步决策。

**关键参数**：
- `verbose=True`
- `return_intermediate_steps`
- LangSmith trace
- `agent.stream` 流式
- 4 维度定位

**最佳实践**：Agent 调试必走"4 件套"；**5 分钟定位 90% 错误**；适用任何"Agent + 调试"。

---

### 模式 19：与 LlamaIndex / Haystack 对比

**问题场景**：选型在 LangChain / LlamaIndex / Haystack / Semantic Kernel 之间。

**解决方案**：LangChain 95k+ Star + Runnable 协议 + 700+ 集成 + Agent 工业标准；LlamaIndex 专注 RAG 索引（LlamaIndex 30k+ star）；Haystack NLP 老牌（10k+ star）专注 pipeline；Semantic Kernel Microsoft 出品（25k+）C# / Python；LangChain 是新项目默认，LlamaIndex 适合纯 RAG，Haystack 适合老 NLP 项目。

**关键参数**：
- LangChain 95k star
- LlamaIndex 30k RAG 专注
- Haystack 10k 老牌
- Semantic Kernel 25k MS
- 各有定位

**最佳实践**：LLM 框架选型按"Agent / RAG / 多语言 / 生态"4 维度打矩阵；**LangChain 适合综合**、**LlamaIndex 适合 RAG**；适用任何"LLM 框架选型"。

---

### 模式 20：7 天复刻 mini-langchain

**问题场景**：学习用，想搭一个简化版 LangChain 理解核心。

**解决方案**：7 天分 5 步——① Day 1-2 Runnable 协议（4 核心方法）+ BaseMessage 抽象 ② Day 3 LCEL `|` 操作符 + RunnableSequence ③ Day 4 Pydantic v2 OutputParser + with_structured_output ④ Day 5 Callback 系统 + LangSmith trace 上报。

**关键参数**：
- Day 1-2: Runnable 协议
- Day 3: LCEL
- Day 4: OutputParser
- Day 5: Callback
- 7 天最小可用

**最佳实践**：复刻 LangChain 先求"最小可跑内核"再迭代，7 天只够做 80% 场景的简化版；**完整 Runnable + LCEL + 多 provider 需要 3 个月+**；适用任何"LLM 框架学习"。

---

## 关键代码段

```python
# Runnable + LCEL 链式
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain.chat_models import init_chat_model

model = init_chat_model("openai:gpt-4")
prompt = ChatPromptTemplate.from_messages([("user", "{q}")])
chain = prompt | model | StrOutputParser()
chain.invoke({"q": "Hello"})  # 同步
await chain.ainvoke({"q": "Hello"})  # 异步
for chunk in chain.stream({"q": "Hello"}): print(chunk)  # 流式

# @tool + Agent
from langchain_core.tools import tool
from langchain.agents import create_react_agent, AgentExecutor

@tool
def search(query: str) -> str:
    """搜索工具"""
    return f"result for {query}"

agent = create_react_agent(model, [search])
AgentExecutor(agent=agent, tools=[search]).invoke({"input": "今天天气"})
```

## 必偷 3 件

1. **Runnable 协议 4 核心方法**：`invoke / batch / stream / ainvoke` 统一所有 AI 组件接口；Generic 类型化链式传递；LLM 时代 API 标杆。
2. **LCEL `|` 操作符 + RunnableSequence**：链式 + 批量 + 流式 + 异步自动组合；`prompt | model | parser` 3 步 = 1 步。
3. **core / langchain / partners 三层 monorepo**：core 协议层零依赖 + partners 700+ 按需安装 + 主包 < 1MB；用 uv workspace 管理。

## 必避 3 坑

1. **不要硬绑单家模型 API**——OpenAI 关停服务会拖垮业务；走 `BaseChatModel` 抽象 + 翻译器模式。
2. **不要在 CI 调真实 LLM**——cost 爆炸；用 `pytest-vcr` cassette 录制 + 重放。
3. **不要用 LangChain v0 老 API**——迁移到 v1 + Runnable + LCEL；老 API 性能差 5x 已废弃。
