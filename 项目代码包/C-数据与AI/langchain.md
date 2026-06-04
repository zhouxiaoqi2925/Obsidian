# LangChain

## 一、前言

**定位**：Harrison Chase 2022 年 10 月开源的**大模型应用开发框架**，目标是"让 LLM 应用构建像搭积木一样简单"。LCEL（LangChain Expression Language）已成为 LLM 应用编排事实标准。

**核心价值**：
- **链式编排**：把 Prompt / LLM / Parser / Tool 组合成 Chain
- **多模型支持**：OpenAI / Anthropic / Hugging Face / Ollama / 本地模型
- **RAG 一站式**：Document Loader + Splitter + Embeddings + Vector Store + Retriever
- **Agent 框架**：让 LLM 调用工具完成任务（ReAct / OpenAI Functions）
- **生产级特性**：LangSmith 监控 / LangServe 部署 / Streaming

**五大特性**：
1. **LCEL 表达式语言**：用 `|` 组合组件，类型安全的 Runnable 协议
2. **RAG 工具链**：20+ 向量数据库、50+ 文档加载器、20+ 文本切分器
3. **Agent 框架**：ReAct / OpenAI Tools / Structured Chat 等多模式
4. **Memory 机制**：短期/长期/Entity 记忆管理
5. **Callbacks**：日志、监控、流式输出统一接入

**生态**：

```
┌──────────────────────────────────────┐
│            LangChain                 │
│  (Python + JavaScript 两个版本)      │
└──────┬──────┬──────┬──────┬─────────┘
       │      │      │      │
       ▼      ▼      ▼      ▼
   langchain-community   LangSmith
   (第三方集成)         (监控调试)
   langgraph            LangServe
   (有状态 Agent)       (REST 部署)
```

**与同类对比**：

| 维度 | LangChain | LlamaIndex | Haystack | Semantic Kernel |
|---|---|---|---|---|
| 定位 | 通用 LLM 框架 | RAG 优先 | 工业 NLP 流水线 | .NET 集成 |
| 学习曲线 | 中 | 低 | 中 | 中 |
| Agent 能力 | 强 | 中 | 弱 | 中 |
| 文档支持 | 极多 | 多 | 中 | 少 |
| 性能优化 | 中 | 高 | 高 | 中 |

## 二、架构思维导图

```mermaid
mindmap
  root((LangChain 架构))
    核心概念
      Component
        Runnable
        组件化
      LCEL
        表达式语言
        pipe 操作符
        类型推导
      Callback
        日志
        流式
        监控
    Models
      LLM
        通用接口
      ChatModel
        多轮对话
      Embeddings
        向量化
      支持
        OpenAI
        Anthropic
        HF
        Ollama
        vLLM
        Bedrock
    Prompts
      PromptTemplate
        字符串模板
      ChatPromptTemplate
        多消息
      Message
        System
        Human
        AI
      FewShot
        示例
      OutputParser
        JSON
        Pydantic
        Structured
    Chains
      LLMChain
      SequentialChain
      Transform
      Router
      自定义
    RAG
      Document Loader
        PDF
        Web
        Notion
        CSV
        Slack
      Text Splitter
        Recursive
        Character
        Token
        Markdown
      Embeddings
        OpenAI
        BGE
        M3E
      Vector Store
        FAISS
        Chroma
        Pinecone
        Milvus
        Weaviate
        PGVector
        Qdrant
      Retriever
        Vector
        BM25
        MultiQuery
        Self-Query
        Contextual
        Hybrid
    Memory
      ConversationBuffer
      ConversationSummary
      ConversationBufferWindow
      VectorStoreMemory
      EntityMemory
    Agents
      ReAct
      OpenAI Tools
      Structured Chat
      Self-Ask
      Plan-Execute
    Tools
      自定义
      内置
        搜索
        计算
        API
    Output Parser
      StrOutputParser
      JSON
      Pydantic
      Enum
    LangGraph
      状态图
      循环
      分支
      多 Agent
    LangSmith
      Trace
      Debug
      Eval
      Monitoring
    LangServe
      FastAPI
      REST 部署
      Streaming
      Batch
    应用
      Chatbot
      RAG 知识库
      Agent 工具调用
      代码生成
      文档摘要
      自动化
```

## 三、关键代码

### 1. LCEL 基础链式

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
import os

os.environ['OPENAI_API_KEY'] = '...'

# 1. 组件
prompt = ChatPromptTemplate.from_messages([
    ('system', '你是一个专业翻译，擅长中英文互译。'),
    ('user', '把以下文本翻译成英文：{text}'),
])

llm = ChatOpenAI(model='gpt-4o-mini', temperature=0)

output_parser = StrOutputParser()

# 2. 用 | 组合（LCEL）
chain = prompt | llm | output_parser

# 3. 调用
result = chain.invoke({'text': '今天天气真好'})
print(result)  # "The weather is really nice today."

# 4. 流式
for chunk in chain.stream({'text': '你好世界'}):
    print(chunk, end='', flush=True)

# 5. 批量
results = chain.batch([
    {'text': '苹果'},
    {'text': '香蕉'},
    {'text': '橙子'},
])
print(results)  # ['Apple', 'Banana', 'Orange']

# 6. 异步
import asyncio
async def main():
    result = await chain.ainvoke({'text': '异步调用'})
    print(result)
asyncio.run(main())
```

**解析**：
- **LCEL 的 `|` 是 Runnable 协议**：`prompt → llm → parser` 数据流管道化
- **统一 API**：`invoke` / `stream` / `batch` / `ainvoke` 四种调用方式
- **类型推导**：输入输出类型自动检测，IDE 自动补全友好

### 2. RAG 检索增强生成

```python
from langchain_community.document_loaders import WebPageLoader, PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.runnables import RunnablePassthrough

# 1. 加载文档
loader = WebPageLoader('https://docs.python.org/3/whatsnew/3.12.html')
docs = loader.load()
# PDF: PyPDFLoader('file.pdf')

# 2. 文本切分
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=['\n\n', '\n', '。', '！', '？', ' ', ''],
)
splits = text_splitter.split_documents(docs)
print(f'切分为 {len(splits)} 个 chunk')

# 3. Embedding + 向量库
embeddings = OpenAIEmbeddings(model='text-embedding-3-small')
vectorstore = FAISS.from_documents(splits, embeddings)

# 4. Retriever
retriever = vectorstore.as_retriever(
    search_type='similarity',
    search_kwargs={'k': 4},  # 检索 top-4
)

# 5. RAG 链
from langchain_core.prompts import ChatPromptTemplate
template = """基于以下上下文回答问题。如果不知道就说不知道。
上下文：{context}
问题：{question}
"""
prompt = ChatPromptTemplate.from_template(template)
llm = ChatOpenAI(model='gpt-4o-mini')

def format_docs(docs):
    return '\n\n'.join(doc.page_content for doc in docs)

rag_chain = (
    {'context': retriever | format_docs, 'question': RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

# 6. 问答
answer = rag_chain.invoke('Python 3.12 有什么新特性？')
print(answer)

# 7. 流式
for chunk in rag_chain.stream('Python 3.12 性能优化'):
    print(chunk, end='', flush=True)

# 8. 带源文档
from langchain_core.runnables import RunnableParallel
rag_chain_with_source = RunnableParallel(
    {'context': retriever, 'question': RunnablePassthrough()}
).assign(answer=(
    RunnablePassthrough.assign(context=lambda x: format_docs(x['context']))
    | prompt | llm | StrOutputParser()
))
result = rag_chain_with_source.invoke('Python 3.12 性能优化')
print(result['context'])  # 源文档
print(result['answer'])  # 答案
```

**解析**：
- **`RecursiveCharacterTextSplitter`** 是 RAG 黄金标准：按段落→句→词逐级切，保留语义
- **`format_docs`** 把检索到的 chunks 拼成上下文
- **`RunnablePassthrough`** 是数据透传：让 `question` 原样透传，context 由 retriever 填充
- **`RunnableParallel`** 让两个分支并行（检索 + 透传）

### 3. Agent 工具调用

```python
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

# 1. 定义工具
@tool
def get_weather(city: str) -> str:
    """查询指定城市的天气"""
    # 实际调用天气 API
    weather_data = {
        '北京': '晴，25度',
        '上海': '多云，22度',
        '深圳': '雷阵雨，30度',
    }
    return weather_data.get(city, f'暂无 {city} 天气数据')

@tool
def calculate(expression: str) -> str:
    """计算数学表达式"""
    try:
        return str(eval(expression))
    except Exception as e:
        return f'计算错误: {e}'

@tool
def search_docs(query: str) -> str:
    """在内部文档中搜索"""
    # 实际连接到 RAG 检索
    return f"搜索 '{query}' 的结果：..."

# 2. 创建 Agent
tools = [get_weather, calculate, search_docs]
llm = ChatOpenAI(model='gpt-4o-mini')

prompt = ChatPromptTemplate.from_messages([
    ('system', '你可以使用以下工具回答问题。'),
    ('human', '{input}'),
    ('placeholder', '{agent_scratchpad}'),
])

agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# 3. 调用
result = agent_executor.invoke({
    'input': '北京今天天气怎么样？上海的温度高还是低？两者温度差多少？'
})
print(result['output'])

# 4. 多步骤 Agent
result = agent_executor.invoke({
    'input': '计算 100 * 2.5 + 50 / 2，然后告诉我上海今天天气'
})
# Agent 自动选择 calculate + get_weather 工具
```

**解析**：
- **`@tool` 装饰器** 把普通函数变成 LangChain 工具，自动推断 schema
- **`create_tool_calling_agent`** 是 OpenAI 工具调用模式（function calling），比 ReAct 更稳定
- **`verbose=True`** 打印思考过程，便于调试
- **多步骤任务**：LLM 自动决定调用哪些工具、按什么顺序

### 4. 记忆（Memory）

```python
from langchain_core.chat_history import BaseChatMessageHistory, InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory

# 1. 多用户会话管理
store = {}

def get_session_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in store:
        store[session_id] = InMemoryChatMessageHistory()
    return store[session_id]

# 2. 带历史的链
prompt = ChatPromptTemplate.from_messages([
    ('system', '你是一个友好的助手。'),
    ('placeholder', '{chat_history}'),
    ('human', '{input}'),
])

chain = prompt | ChatOpenAI(model='gpt-4o-mini')

with_message_history = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key='input',
    history_messages_key='chat_history',
)

config = {'configurable': {'session_id': 'user-1001'}}

# 3. 多轮对话
print(with_message_history.invoke({'input': '我叫小明'}, config=config).content)
# "你好小明！"
print(with_message_history.invoke({'input': '我叫什么？'}, config=config).content)
# "你叫小明。" ← LLM 记住了历史

# 4. SQLite 持久化（生产环境）
from langchain_community.chat_message_histories import SQLChatMessageHistory
def get_persistent_history(session_id: str):
    return SQLChatMessageHistory(
        session_id=session_id,
        connection_string='sqlite:///chat.db',
    )
```

**解析**：
- **会话级 memory**：每个 session_id 独立历史
- **`RunnableWithMessageHistory`** 是 LCEL 与 memory 的桥梁
- **持久化用 SQL/Redis**：单进程内存只适合 demo

### 5. 部署：LangServe

```python
# server.py
from fastapi import FastAPI
from langserve import add_routes
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

app = FastAPI(title='My LLM Server')

# 1. 简单链
model = ChatOpenAI(model='gpt-4o-mini')
prompt = ChatPromptTemplate.from_template('用一句话解释 {concept}')
chain = prompt | model

# 2. 暴露路由
add_routes(app, chain, path='/explain')

# 启动：uvicorn server:app --host 0.0.0.0 --port 8000

# 客户端调用
# POST /explain/invoke
# {"input": {"concept": "量子纠缠"}}
# {"output": "量子纠缠是两个粒子即使相隔很远..."}

# 流式：POST /explain/stream
# Batch：POST /explain/batch
# OpenAPI 文档：GET /docs
```

**解析**：
- **LangServe 把 LCEL 链转 REST API**：自动生成 OpenAPI 文档、支持 invoke/stream/batch
- **底层是 FastAPI**：可与现有 FastAPI 服务无缝集成
- **生产推荐 TGI / vLLM**：LangServe 性能不如专用推理服务

## 四、核心洞察

1. **LCEL 是 LangChain 真正的范式**：`prompt | llm | parser` 链式语法成为 LLM 应用编排事实标准；0.1.x 老 Chain API 已淘汰。
2. **RAG 是 LangChain 杀手锏**：20+ 向量库 + 50+ 文档加载器 + 10+ 切分器 + 5+ 检索器，RAG 工具链最完整。
3. **Agent 是 LangChain 最不稳定部分**：Tool calling 经常失败、循环卡死；生产需要严格的 prompt 工程 + 限制步数 + 错误重试。
4. **LangGraph 是 Agent 的未来**：状态图 + 循环 + 多 Agent 协作，比传统 Agent 更可控；推荐用于复杂工作流。
5. **LangSmith 是关键监控工具**：trace 调试 LLM 应用、eval 评估 prompt 效果、monitor 生产质量；10 美元/月起。
6. **LangChain 抽象泄漏问题**：用户经常抱怨"想用 LangChain 但被它绑架"；LangChain 0.3+ 在向"轻核心 + 强生态"方向改进。
7. **向量数据库选型**：FAISS（本地/小规模）、Chroma（原型）、PGVector（生产 + PG 已有）、Milvus/Qdrant（亿级 +）。
8. **Embedding 模型选择**：中文 BGE-large-zh-v1.5 / M3E / Text2Vec；英文 text-embedding-3-small / bge-large-en；多语言 BGE-M3。

## 五、跨项目引用

- [./transformers.md](./transformers.md) — LangChain 集成 Hugging Face 模型
- [./llama.md](./llama.md) — LangChain 集成本地 LLaMA 模型
- [./ollama.md](./ollama.md) — LangChain 集成 Ollama 本地推理
- [./vllm.md](./vllm.md) — vLLM 是 LangChain 后端推理引擎
- [./pytorch.md](./pytorch.md) — LangChain 底层多基于 PyTorch 模型
- [./chromadb.md](./chromadb.md) — Chroma 是 LangChain 默认向量库
- [./milvus.md](./milvus.md) — Milvus 是亿级向量场景的 LangChain 搭档
- [./openai.md](./openai.md) — LangChain 与 OpenAI 生态最深度集成

## 六、Models 详解（LLM / ChatModel / Embeddings）

### 6.1 LLM 与 ChatModel 的区别

LangChain 抽象了两种文本生成模型：**LLM**（纯文本输入输出）和 **ChatModel**（多轮消息输入输出）。ChatModel 是当前主流，它接收 `List[BaseMessage]`（SystemMessage、HumanMessage、AIMessage、ToolMessage），返回 AIMessage。

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

# ChatModel 推荐用法
chat = ChatOpenAI(model='gpt-4o-mini', temperature=0.7)

messages = [
    SystemMessage(content='你是一位资深 Python 工程师'),
    HumanMessage(content='什么是装饰器？'),
    AIMessage(content='装饰器是 Python 的语法糖，用于在不修改原函数的情况下扩展功能...'),
    HumanMessage(content='能给个例子吗？'),
]
response = chat.invoke(messages)
print(response.content)  # "当然可以..."
print(response.response_metadata)  # token 用量、模型版本等
```

### 6.2 OpenAI 全模型支持

```python
from langchain_openai import ChatOpenAI, OpenAI

# 1. GPT-4o 系列（多模态）
gpt4o = ChatOpenAI(model='gpt-4o', max_tokens=4096, temperature=0)
gpt4o_mini = ChatOpenAI(model='gpt-4o-mini', temperature=0)  # 性价比之王

# 2. o1 系列（推理增强）
o1 = ChatOpenAI(model='o1-preview', reasoning_effort='high')
o1_mini = ChatOpenAI(model='o1-mini', reasoning_effort='medium')

# 3. 旧版兼容
gpt35 = ChatOpenAI(model='gpt-3.5-turbo-0125')

# 4. 视觉输入
vision = ChatOpenAI(model='gpt-4o')
from langchain_core.messages import HumanMessage
msg = HumanMessage(content=[
    {'type': 'text', 'text': '这张图里有什么？'},
    {'type': 'image_url', 'image_url': {'url': 'https://example.com/cat.png'}},
])
print(vision.invoke([msg]).content)

# 5. JSON Mode（强制 JSON 输出）
json_llm = ChatOpenAI(model='gpt-4o-mini').bind(response_format={'type': 'json_object'})

# 6. Function Calling 准备
tools_llm = ChatOpenAI(model='gpt-4o-mini').bind_tools([some_tool])

# 7. 旧版 LLM 接口（文本补全）
from langchain_openai import OpenAI
legacy = OpenAI(model='gpt-3.5-turbo-instruct')  # 已被 ChatModel 取代
```

### 6.3 Anthropic Claude 集成

```python
from langchain_anthropic import ChatAnthropic

# 1. Claude 3.5 Sonnet（推荐）
claude = ChatAnthropic(
    model='claude-3-5-sonnet-20241022',
    max_tokens=8192,
    temperature=0,
    anthropic_api_key='...',
)

# 2. Claude 3 Opus（最强）
opus = ChatAnthropic(model='claude-3-opus-20240229', max_tokens=4096)

# 3. Claude 3 Haiku（最快最便宜）
haiku = ChatAnthropic(model='claude-3-haiku-20240307')

# 4. 启用 Prompt Caching（节省 90% 成本）
cached = ChatAnthropic(model='claude-3-5-sonnet-20241022').with_cache_control(
    cache_control={'type': 'ephemeral'}
)

# 5. 流式 + 工具调用
from langchain_core.tools import tool

@tool
def search_web(query: str) -> str:
    """搜索网络"""
    return f"搜索结果：{query}"

claude_with_tools = claude.bind_tools([search_web])

# 6. Extended Thinking（思考模式）
thinking = ChatAnthropic(
    model='claude-3-7-sonnet-20250219',
    max_tokens=20000,
    thinking={'type': 'enabled', 'budget_tokens': 10000}
)
```

### 6.4 本地模型集成（Ollama / vLLM / Llama.cpp）

```python
# 1. Ollama（最简单的本地推理）
from langchain_ollama import ChatOllama

ollama = ChatOllama(
    model='qwen2.5:7b',
    base_url='http://localhost:11434',
    temperature=0.7,
    num_ctx=8192,
    num_gpu=1,
)

# 流式
for chunk in ollama.stream('写一首关于春天的诗'):
    print(chunk.content, end='', flush=True)

# 2. vLLM（生产级高性能推理）
from langchain_community.llms import VLLM
vllm = VLLM(
    model='meta-llama/Llama-3-70b-instruct',
    trust_remote_code=True,
    max_new_tokens=1024,
    top_k=10,
    top_p=0.95,
    temperature=0.7,
    vllm_kwargs={'gpu_memory_utilization': 0.85},
)

# 3. Llama.cpp（CPU/GPU 通用）
from langchain_community.llms import LlamaCpp
llama = LlamaCpp(
    model_path='./models/llama-3-8b-instruct.Q4_K_M.gguf',
    n_ctx=4096,
    n_gpu_layers=35,  # 卸载到 GPU 的层数
    n_batch=512,
    f16_kv=True,
    temperature=0.7,
)

# 4. HuggingFace Pipeline
from langchain_huggingface import HuggingFacePipeline, ChatHuggingFace
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

model_id = 'Qwen/Qwen2.5-7B-Instruct'
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(model_id, device_map='auto', torch_dtype='auto')
pipe = pipeline('text-generation', model=model, tokenizer=tokenizer, max_new_tokens=512)
hf = HuggingFacePipeline(pipeline=pipe)
chat_hf = ChatHuggingFace(llm=hf)
```

### 6.5 Embeddings 多家对比

```python
# 1. OpenAI Embeddings
from langchain_openai import OpenAIEmbeddings
openai_emb = OpenAIEmbeddings(
    model='text-embedding-3-small',  # 1536 维，便宜
    # model='text-embedding-3-large',  # 3072 维，精准
    # model='text-embedding-ada-002',  # 旧版
    dimensions=1024,  # text-embedding-3 支持降维
)

vectors = openai_emb.embed_documents(['苹果', '香蕉', '橙子'])
query_vec = openai_emb.embed_query('水果')
print(len(vectors[0]))  # 1024

# 2. HuggingFace BGE（中文最佳）
from langchain_huggingface import HuggingFaceEmbeddings
bge = HuggingFaceEmbeddings(
    model_name='BAAI/bge-large-zh-v1.5',  # 中文
    model_kwargs={'device': 'cuda'},
    encode_kwargs={'normalize_embeddings': True, 'batch_size': 32},
)

# 3. BGE-M3（多语言）
m3 = HuggingFaceEmbeddings(model_name='BAAI/bge-m3')

# 4. M3E（开源中文）
m3e = HuggingFaceEmbeddings(model_name='moka-ai/m3e-large')

# 5. Cohere
from langchain_cohere import CohereEmbeddings
cohere = CohereEmbeddings(model='embed-english-v3.0')

# 6. Voyage AI（高质量）
from langchain_voyageai import VoyageAIEmbeddings
voyage = VoyageAIEmbeddings(model='voyage-3')

# 7. Jina AI
from langchain_community.embeddings import JinaEmbeddings
jina = JinaEmbeddings(model_name='jina-embeddings-v3')

# 8. Ollama Embeddings
from langchain_ollama import OllamaEmbeddings
ollama_emb = OllamaEmbeddings(model='nomic-embed-text', base_url='http://localhost:11434')
```

### 6.6 多种 Model Provider 一览

| Provider | LangChain Class | 优势 | 适用场景 |
|---|---|---|---|
| OpenAI | `ChatOpenAI` | 性能最稳、工具调用强 | 生产首选 |
| Anthropic | `ChatAnthropic` | 长上下文、推理强、Prompt Caching | 文档分析、代码 |
| Google | `ChatGoogleGenerativeAI` | 多模态、长上下文（2M） | 长文档、视频 |
| Mistral | `ChatMistralAI` | 欧洲合规、开源友好 | 欧洲市场 |
| Cohere | `ChatCohere` | RAG 工具强 | 企业搜索 |
| DeepSeek | `ChatDeepSeek` | 国产、便宜、推理强 | 中文场景 |
| 智谱 | `ChatZhipuAI` | 国产 GLM-4 | 国内合规 |
| 月之暗面 | `ChatKimi` | 长上下文 | 长文档 |
| Ollama | `ChatOllama` | 完全本地 | 隐私场景 |
| vLLM | `VLLM` | 高吞吐 | 自建推理 |
| Together | `ChatTogether` | 便宜开源模型 | 成本敏感 |
| Fireworks | `ChatFireworks` | 速度快 | 实时应用 |
| Groq | `ChatGroq` | 极低延迟 | 流式体验 |
| Replicate | `ChatReplicate` | 多模型即服务 | 实验性 |

## 七、Prompt Engineering 完整指南

### 7.1 PromptTemplate 字符串模板

```python
from langchain_core.prompts import PromptTemplate

# 1. 简单模板
prompt = PromptTemplate.from_template('为产品 {product} 写一句广告语')
print(prompt.format(product='智能手表'))  # "为产品 智能手表 写一句广告语"

# 2. 多变量模板
prompt = PromptTemplate(
    input_variables=['role', 'topic', 'style'],
    template='你是一个 {role}，请用 {style} 风格介绍 {topic}',
)
formatted = prompt.format(role='数据科学家', topic='LangChain', style='通俗易懂')

# 3. 模板复用（partial）
prompt = PromptTemplate.from_template('今天是 {date}，{task}')
# 固定 date 让用户只填 task
partial_prompt = prompt.partial(date='2026-06-04')
print(partial_prompt.format(task='学习 LangChain'))

# 4. 校验模板
from langchain_core.prompts import PromptTemplate
try:
    PromptTemplate.from_template('Hello {name} and {age}').format(name='Alice')
except KeyError as e:
    print(f'缺少变量: {e}')

# 5. 模板组合
from langchain_core.prompts import PipelinePromptTemplate
intro = PromptTemplate.from_template('你是 {role}')
body = PromptTemplate.from_template('介绍 {topic} 的三个方面')
final = PipelinePromptTemplate(
    final_prompt=PromptTemplate.from_template('{intro}\n{body}\n要求：{style}'),
    pipeline_prompts=[
        ('intro', intro),
        ('body', body),
    ],
)
```

### 7.2 ChatPromptTemplate 多消息模板

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage, HumanMessage

# 1. 元组风格
prompt = ChatPromptTemplate.from_messages([
    ('system', '你是一位经验丰富的 {profession}'),
    ('human', '请用 {language} 回答：{question}'),
])

# 2. 显式消息对象
prompt = ChatPromptTemplate.from_messages([
    SystemMessage(content='你是一位翻译官'),
    HumanMessage(content='将以下中文翻译为英文：{text}'),
])

# 3. MessagesPlaceholder（动态消息列表）
prompt = ChatPromptTemplate.from_messages([
    ('system', '你是一个友善的 AI 助手'),
    MessagesPlaceholder('chat_history'),  # 动态历史
    ('human', '{input}'),
])

# 4. Optional 消息（可省略）
prompt = ChatPromptTemplate.from_messages([
    ('system', '你是助手'),
    ('human', '{input}'),
    ('placeholder', '{agent_scratchpad}'),  # Agent 思考用
])

# 5. 模板 + Partial
prompt = ChatPromptTemplate.from_messages([
    ('system', '你使用 {language} 交流'),
    ('human', '{input}'),
]).partial(language='中文')

# 6. 注入到链
from langchain_openai import ChatOpenAI
chat = ChatOpenAI(model='gpt-4o-mini')
chain = prompt | chat
print(chain.invoke({'input': '介绍下你自己'}).content)

# 7. 包含图片
from langchain_core.prompts import ChatPromptTemplate
vision_prompt = ChatPromptTemplate.from_messages([
    ('system', '你是一个图像分析专家'),
    ('human', [
        {'type': 'text', 'text': '{question}'},
        {'type': 'image_url', 'image_url': {'url': '{image_url}'}},
    ]),
])
```

### 7.3 Few-Shot Prompting 示例模板

```python
from langchain_core.prompts import FewShotPromptTemplate, PromptTemplate
from langchain_core.example_selectors import (
    SemanticSimilarityExampleSelector,
    LengthBasedExampleSelector,
    MaxMarginalRelevanceExampleSelector,
)
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS

# 1. 简单 Few-Shot
examples = [
    {'input': '高兴', 'output': '😊'},
    {'input': '悲伤', 'output': '😢'},
    {'input': '惊讶', 'output': '😮'},
    {'input': '愤怒', 'output': '😠'},
]

example_prompt = PromptTemplate.from_template('输入：{input} → 输出：{output}')
few_shot = FewShotPromptTemplate(
    examples=examples,
    example_prompt=example_prompt,
    prefix='将情绪词转为表情：',
    suffix='输入：{adjective} → 输出：',
    input_variables=['adjective'],
)
print(few_shot.format(adjective='开心'))

# 2. 动态 Few-Shot（按相似度选）
examples = [
    {'input': '2+2=?', 'output': '4'},
    {'input': '5*3=?', 'output': '15'},
    {'input': '10-7=?', 'output': '3'},
    {'input': '8/2=?', 'output': '4'},
    {'input': '9+6=?', 'output': '15'},
    {'input': '12*4=?', 'output': '48'},
]

example_selector = SemanticSimilarityExampleSelector.from_examples(
    examples,
    OpenAIEmbeddings(model='text-embedding-3-small'),
    FAISS,
    k=3,  # 选 3 个最相关的
)
dynamic_prompt = FewShotPromptTemplate(
    example_selector=example_selector,
    example_prompt=PromptTemplate.from_template('Q: {input}\nA: {output}'),
    prefix='解数学题：',
    suffix='Q: {input}\nA:',
    input_variables=['input'],
)
print(dynamic_prompt.format(input='7+5=?'))

# 3. 按长度选（避免超出 token）
length_selector = LengthBasedExampleSelector(
    examples=examples,
    example_prompt=PromptTemplate.from_template('Q: {input}\nA: {output}'),
    max_length=100,
)

# 4. MMR（最大边际相关性，平衡相关性与多样性）
mmr_selector = MaxMarginalRelevanceExampleSelector.from_examples(
    examples,
    OpenAIEmbeddings(),
    FAISS,
    k=3,
)

# 5. Chat 模型的 Few-Shot
from langchain_core.prompts import ChatPromptTemplate, FewShotChatMessagePromptTemplate

example_prompt = ChatPromptTemplate.from_messages([
    ('human', '{input}'),
    ('ai', '{output}'),
])
few_shot_chat = FewShotChatMessagePromptTemplate(
    example_prompt=example_prompt,
    examples=examples,
)
final_prompt = ChatPromptTemplate.from_messages([
    ('system', '你是一个数学老师'),
    few_shot_chat,
    ('human', '{input}'),
])
```

### 7.4 高级 Prompt 技巧

```python
# 1. Chain-of-Thought（思维链）
from langchain_core.prompts import ChatPromptTemplate

cot_prompt = ChatPromptTemplate.from_messages([
    ('system', '逐步思考问题，最后给出答案。'),
    ('human', '''问题：{question}
请按以下格式：
思考：<你的推理>
答案：<最终结果>'''),
])

# 2. ReAct 风格（推理+行动）
react_prompt = ChatPromptTemplate.from_messages([
    ('system', '''回答问题时使用以下格式：
Thought: 你应该思考要做什么
Action: 要执行的动作
Observation: 动作的结果
... (Thought/Action/Observation 可重复 N 次)
Thought: 我现在知道最终答案
Final Answer: 原始问题的最终答案'''),
    ('human', '{question}'),
])

# 3. Self-Consistency（多采样投票）
def self_consistency(question, llm, n=5):
    """采样多次取众数"""
    from collections import Counter
    responses = [llm.invoke(f'Q: {question}\nA:').content for _ in range(n)]
    return Counter(responses).most_common(1)[0][0]

# 4. Tree of Thought
tot_prompt = ChatPromptTemplate.from_messages([
    ('system', '针对问题提出 3 个不同的解决思路，评估每个，最后选最佳。'),
    ('human', '{problem}'),
])

# 5. Reflection（自我反思）
reflection_prompt = ChatPromptTemplate.from_messages([
    ('system', '先回答问题，然后审视自己的回答，找出问题并改进。'),
    ('human', '{question}'),
])
```

### 7.5 提示词工程 12 条黄金法则

1. **明确角色**：`"你是一位 10 年经验的 SEO 专家"` > `"写 SEO 内容"`
2. **具体任务**：避免模糊，加约束（字数、格式、风格）
3. **Few-Shot 示例**：复杂任务必须给 3-5 个示例
4. **结构化输出**：用 JSON、Markdown 表格、编号列表
5. **分步思考**：CoT 让推理更稳
6. **分隔符清晰**：用 `"""` 或 `###` 分隔指令和输入
7. **变量命名一致**：同一概念用同一名称
8. **避免否定**：说"请做 X"而非"不要做 Y"
9. **温度控制**：事实任务 0、创意任务 0.7-1.0
10. **系统提示 vs 用户提示**：稳定规则放 system，临时数据放 user
11. **迭代优化**：A/B 测试不同 prompt，LangSmith eval
12. **提示词版本管理**：用 LangSmith Hub 管理 prompt 版本

## 八、Output Parsers 输出解析器

### 8.1 基础解析器

```python
from langchain_core.output_parsers import (
    StrOutputParser,
    JsonOutputParser,
    ListOutputParser,
    CommaSeparatedListOutputParser,
)

# 1. 字符串输出（默认）
from langchain_core.output_parsers import StrOutputParser
parser = StrOutputParser()
# 把 AIMessage 转为 content 字符串

# 2. JSON 输出
from langchain_core.output_parsers import JsonOutputParser
json_parser = JsonOutputParser()
# 要求 LLM 输出合法 JSON
# 可指定 pydantic 对象：
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(description='产品名称')
    price: float = Field(description='价格')
    features: list[str] = Field(description='产品特性')

parser = JsonOutputParser(pydantic_object=Product)
# 自动注入格式指令到 prompt

# 3. 列表输出
from langchain_core.output_parsers import CommaSeparatedListOutputParser
list_parser = CommaSeparatedListOutputParser()
# 输入："苹果, 香蕉, 橙子" → ["苹果", "香蕉", "橙子"]

# 4. 列表解析（带格式指令）
list_parser.get_format_instructions()
# "Your response should be a list of comma separated values..."

# 5. 自定义分隔符
from langchain_core.output_parsers import ListOutputParser
class LineListOutputParser(ListOutputParser):
    def parse(self, text: str):
        return [line.strip() for line in text.strip().split('\n') if line.strip()]
```

### 8.2 Pydantic 结构化输出

```python
from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 1. 定义数据结构
class MovieReview(BaseModel):
    title: str = Field(description='电影名称')
    rating: float = Field(description='评分 0-10')
    pros: list[str] = Field(description='优点列表')
    cons: list[str] = Field(description='缺点列表')
    recommendation: bool = Field(description='是否推荐')
    summary: str = Field(description='一句话总结')

# 2. 创建解析器
parser = PydanticOutputParser(pydantic_object=MovieReview)
format_instructions = parser.get_format_instructions()

# 3. 注入到 prompt
prompt = ChatPromptTemplate.from_messages([
    ('system', '你是一个影评人。按格式输出。\n{format_instructions}'),
    ('human', '请评价电影：{movie_title}'),
]).partial(format_instructions=format_instructions)

# 4. 链
chain = prompt | ChatOpenAI(model='gpt-4o-mini') | parser
result = chain.invoke({'movie_title': 'Inception'})
print(f"电影：{result.title}, 评分：{result.rating}")
print(f"推荐：{result.recommendation}")
```

### 8.3 枚举与日期解析

```python
from langchain_core.output_parsers import EnumOutputParser
from enum import Enum

# 1. 枚举输出
class Sentiment(str, Enum):
    POSITIVE = 'positive'
    NEGATIVE = 'negative'
    NEUTRAL = 'neutral'

enum_parser = EnumOutputParser(enum=Sentiment)
# 提示词会要求 LLM 输出指定枚举值
chain = (
    ChatPromptTemplate.from_messages([
        ('system', '判断情感。仅输出枚举值。'),
        ('human', '{text}'),
    ])
    | ChatOpenAI()
    | enum_parser
)
print(chain.invoke({'text': '这部电影太精彩了'}))  # Sentiment.POSITIVE

# 2. 自定义解析
from langchain_core.output_parsers import BaseOutputParser
from langchain_core.outputs import Generation
import json

class CustomJSONParser(BaseOutputParser[dict]):
    """解析可能被 markdown 包裹的 JSON"""

    def parse(self, text: str) -> dict:
        # 去除 ```json 包裹
        text = text.strip()
        if text.startswith('```'):
            text = '\n'.join(text.split('\n')[1:-1])
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # 尝试用正则提取 JSON 块
            import re
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            raise ValueError(f'无法解析 JSON: {text}')

    @property
    def _type(self) -> str:
        return 'custom_json_parser'

# 3. 自动修复解析器
from langchain.output_parsers import OutputFixingParser
base_parser = PydanticOutputParser(pydantic_object=MovieReview)
fixing_parser = OutputFixingParser.from_llm(parser=base_parser, llm=ChatOpenAI())
# 自动让 LLM 修复格式错误的输出

# 4. 重试解析器
from langchain.output_parsers import RetryWithErrorOutputParser
retry_parser = RetryWithErrorOutputParser.from_llm(
    parser=base_parser,
    llm=ChatOpenAI(),
    max_retries=3,
)
```

### 8.4 OpenAI 原生结构化输出

```python
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

class CalendarEvent(BaseModel):
    name: str
    date: str
    participants: list[str]

# 1. 用 with_structured_output
structured_llm = ChatOpenAI(model='gpt-4o-mini').with_structured_output(CalendarEvent)
result = structured_llm.invoke('提取事件：明天下午3点产品评审会，与 Alice、Bob')
print(result.name, result.date, result.participants)

# 2. JSON Schema
from pydantic import BaseModel

class WeatherQuery(BaseModel):
    location: str
    unit: str = 'celsius'

schema_llm = ChatOpenAI(model='gpt-4o-mini').with_structured_output(
    schema={
        'name': 'weather_query',
        'description': '天气查询',
        'parameters': {
            'type': 'object',
            'properties': {
                'location': {'type': 'string', 'description': '城市'},
                'unit': {'type': 'string', 'enum': ['celsius', 'fahrenheit']},
            },
            'required': ['location'],
        },
    },
    method='json_schema',  # 或 'function_calling'
)
```

### 8.5 XML / YAML / CSV 解析

```python
from langchain_core.output_parsers import XMLOutputParser
from langchain.output_parsers import YamlOutputParser

# 1. XML 输出
xml_parser = XMLOutputParser()
# 提示 LLM 输出 XML 格式

# 2. YAML 输出
class Joke(BaseModel):
    setup: str
    punchline: str

yaml_parser = YamlOutputParser(pydantic_object=Joke)

# 3. CSV 输出（自定义）
class CSVOutputParser(BaseOutputParser[list[dict]]):
    def parse(self, text: str) -> list[dict]:
        import csv
        from io import StringIO
        return list(csv.DictReader(StringIO(text.strip())))

    @property
    def _type(self) -> str:
        return 'csv_output_parser'
```

## 九、Memory 记忆系统完整指南

### 9.1 短期记忆（In-Memory）

```python
from langchain.memory import (
    ConversationBufferMemory,
    ConversationBufferWindowMemory,
    ConversationSummaryMemory,
    ConversationSummaryBufferMemory,
    ConversationTokenBufferMemory,
    ConversationEntityMemory,
    VectorStoreRetrieverMemory,
    CombinedMemory,
    ReadOnlySharedMemory,
    WriteOnlyMemory,
)
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model='gpt-4o-mini')

# 1. 完整缓冲（保存所有消息）
memory = ConversationBufferMemory(return_messages=True)
memory.save_context({'input': '你好'}, {'output': '你好！'})
memory.save_context({'input': '我喜欢 Python'}, {'output': '很棒的选择！'})
print(memory.load_memory_variables({}))
# {'history': [HumanMessage, AIMessage, HumanMessage, AIMessage]}

# 2. 窗口记忆（只保留最近 K 轮）
window_memory = ConversationBufferWindowMemory(k=2, return_messages=True)
# 超过 2 轮自动丢弃

# 3. 摘要记忆（用 LLM 总结历史）
summary_memory = ConversationSummaryMemory(llm=llm, return_messages=True)
# 长对话节省 token

# 4. Token 限制记忆
token_memory = ConversationTokenBufferMemory(llm=llm, max_token_limit=2000)

# 5. 摘要+缓冲混合
hybrid_memory = ConversationSummaryBufferMemory(
    llm=llm,
    max_token_limit=4000,
    return_messages=True,
)

# 6. 实体记忆（自动提取人名/地名/事件）
entity_memory = ConversationEntityMemory(llm=llm, return_messages=True)
entity_memory.save_context(
    {'input': 'Alice 是我的同事，她在 Google 工作'},
    {'output': '好的，我记下了 Alice 在 Google 工作'},
)
print(entity_memory.load_memory_variables({'input': 'Alice 在哪工作？'}))
```

### 9.2 长期记忆（持久化）

```python
# 1. Redis 持久化
from langchain_community.chat_message_histories import RedisChatMessageHistory
redis_history = RedisChatMessageHistory(
    session_id='user-1001',
    url='redis://localhost:6379/0',
    ttl=3600 * 24 * 7,  # 7 天过期
)

# 2. Postgres 持久化
from langchain_community.chat_message_histories import PostgresChatMessageHistory
import psycopg2
pg_history = PostgresChatMessageHistory(
    'user-1001',
    connection_string='postgresql://user:pass@localhost/chatdb',
    table_name='chat_history',
)

# 3. SQL 通用（SQLite/MySQL/...）
from langchain_community.chat_message_histories import SQLChatMessageHistory
sql_history = SQLChatMessageHistory(
    session_id='user-1001',
    connection_string='sqlite:///chat.db',
)

# 4. MongoDB
from langchain_community.chat_message_histories import MongoDBChatMessageHistory
mongo_history = MongoDBChatMessageHistory(
    session_id='user-1001',
    connection_string='mongodb://localhost:27017/',
    database_name='chat',
    collection_name='history',
)

# 5. DynamoDB
from langchain_community.chat_message_histories import DynamoDBChatMessageHistory
dynamo_history = DynamoDBChatMessageHistory(
    table_name='chat-history',
    session_id='user-1001',
    primary_key='SessionId',
)

# 6. 文件持久化（JSON）
from langchain_community.chat_message_histories import FileChatMessageHistory
file_history = FileChatMessageHistory(file_path='./history/user-1001.json')
```

### 9.3 向量记忆（语义检索历史）

```python
from langchain.memory import VectorStoreRetrieverMemory
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS

# 用向量库检索相关历史
embeddings = OpenAIEmbeddings(model='text-embedding-3-small')
vstore = FAISS.from_texts(['初始化'], embeddings)
retriever = vstore.as_retriever(search_kwargs={'k': 3})

vector_memory = VectorStoreRetrieverMemory(retriever=retriever, memory_key='history')
vector_memory.save_context(
    {'input': '我在上海工作'},
    {'output': '好的'},
)
vector_memory.save_context(
    {'input': '我喜欢打篮球'},
    {'output': '不错'},
)
vector_memory.save_context(
    {'input': '我学 Python 两年了'},
    {'output': '很棒'},
)

# 检索相关历史
print(vector_memory.load_memory_variables({'prompt': '我住哪？'}))
# 返回"我在上海工作"等相关条目
```

### 9.4 LCEL 时代的 Memory

LCEL 推荐用 `RunnableWithMessageHistory`：

```python
from langchain_core.chat_history import BaseChatMessageHistory, InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

# 1. 多用户会话
store = {}

def get_session_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in store:
        store[session_id] = InMemoryChatMessageHistory()
    return store[session_id]

# 2. 链
prompt = ChatPromptTemplate.from_messages([
    ('system', '你是助手'),
    MessagesPlaceholder(variable_name='history'),
    ('human', '{input}'),
])
chain = prompt | ChatOpenAI(model='gpt-4o-mini')

with_history = RunnableWithMessageHistory(
    chain,
    get_session_history,
    input_messages_key='input',
    history_messages_key='history',
)

config = {'configurable': {'session_id': 'abc123'}}
print(with_history.invoke({'input': '我叫小明'}, config=config).content)
print(with_history.invoke({'input': '我叫什么'}, config=config).content)

# 3. Redis 后端
from langchain_redis import RedisChatMessageHistory

def get_redis_history(session_id: str):
    return RedisChatMessageHistory(session_id=session_id, url='redis://localhost:6379')

with_history_redis = RunnableWithMessageHistory(
    chain,
    get_redis_history,
    input_messages_key='input',
    history_messages_key='history',
)
```

### 9.5 Memory 选型决策树

```
对话长度？
├── < 5 轮 → ConversationBufferMemory
├── 5-20 轮 → ConversationBufferWindowMemory(k=10)
├── 20-100 轮 → ConversationSummaryMemory
└── > 100 轮 → ConversationSummaryBufferMemory + 实体记忆

是否需要跨会话？
├── 否 → 内存（In-Memory）
└── 是 → Redis / Postgres / SQL / Mongo

是否需要语义检索历史？
├── 否 → 普通 memory
└── 是 → VectorStoreRetrieverMemory

是否多用户？
└── 是 → session_id 隔离（RunnableWithMessageHistory）

## 十、RAG（检索增强生成）深度解析

### 10.1 RAG 完整流水线

```python
from langchain_community.document_loaders import (
    PyPDFLoader,
    WebBaseLoader,
    DirectoryLoader,
    NotionDBLoader,
    CSVLoader,
    UnstructuredMarkdownLoader,
    TextLoader,
    GitHubIssuesLoader,
    SlackDirectoryLoader,
    YoutubeAudioLoader,
    S3FileLoader,
    AzureBlobStorageFileLoader,
    GoogleDriveLoader,
    NotionDirectoryLoader,
    HNLoader,
    ArxivLoader,
    WikipediaLoader,
    PlaywrightURLLoader,
    SeleniumURLLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter, CharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS, Chroma, Pinecone
from langchain_community.retrievers import (
    BM25Retriever,
    EnsembleRetriever,
    MultiQueryRetriever,
    SelfQueryRetriever,
    ContextualCompressionRetriever,
    ParentDocumentRetriever,
    MultiVectorRetriever,
    TimeWeightedVectorStoreRetriever,
)
from langchain.retrievers.document_compressors import LLMChainExtractor
from langchain_core.runnables import RunnablePassthrough
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. Load
loader = PyPDFLoader('./data/handbook.pdf')
docs = loader.load()

# 2. Split
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(docs)

# 3. Embed
embeddings = OpenAIEmbeddings(model='text-embedding-3-small')

# 4. Store
vectorstore = FAISS.from_documents(chunks, embeddings)

# 5. Retrieve
retriever = vectorstore.as_retriever(search_type='mmr', search_kwargs={'k': 4, 'lambda_mult': 0.5})

# 6. Generate
template = '''根据上下文回答问题。如果不知道就说不知道。
上下文：{context}
问题：{question}
答案：'''
prompt = ChatPromptTemplate.from_template(template)
llm = ChatOpenAI(model='gpt-4o-mini')

def format_docs(docs):
    return '\n\n'.join(d.page_content for d in docs)

rag_chain = (
    {'context': retriever | format_docs, 'question': RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)
answer = rag_chain.invoke('公司的年假政策是什么？')
```

### 10.2 高级 RAG 检索策略

```python
# 1. MMR（最大边际相关性）
retriever = vectorstore.as_retriever(
    search_type='mmr',
    search_kwargs={'k': 6, 'lambda_mult': 0.25},  # lambda 越小越多样
)

# 2. 相似度阈值
retriever = vectorstore.as_retriever(
    search_type='similarity_score_threshold',
    search_kwargs={'score_threshold': 0.5, 'k': 4},
)

# 3. BM25 检索（关键词）
from langchain_community.retrievers import BM25Retriever
bm25 = BM25Retriever.from_documents(chunks, k=4)

# 4. Ensemble（混合检索）
ensemble = EnsembleRetriever(
    retrievers=[vector_retriever, bm25],
    weights=[0.6, 0.4],  # 语义 60% + 关键词 40%
)

# 5. MultiQueryRetriever（多查询扩展）
from langchain.retrievers.multi_query import MultiQueryRetriever
mq = MultiQueryRetriever.from_llm(
    retriever=vector_retriever,
    llm=ChatOpenAI(model='gpt-4o-mini'),
)
# LLM 自动生成 3 个查询变体

# 6. SelfQueryRetriever（自查询，元数据过滤）
from langchain.chains.query_constructor.schema import AttributeInfo
from langchain.retrievers.self_query.base import SelfQueryRetriever

metadata_field_info = [
    AttributeInfo(name='source', description='文档来源', type='string'),
    AttributeInfo(name='page', description='页码', type='integer'),
    AttributeInfo(name='date', description='发布日期', type='date'),
]
document_content_description = '技术文档'
sq = SelfQueryRetriever.from_llm(
    llm=ChatOpenAI(),
    vectorstore=vectorstore,
    document_contents=document_content_description,
    metadata_field_info=metadata_field_info,
)
result = sq.invoke('2025 年的技术文档中关于 RAG 的内容')

# 7. ContextualCompression（压缩检索结果）
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor, LLMChainFilter, EmbeddingsFilter

compressor = LLMChainExtractor.from_llm(ChatOpenAI())
compression_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=vector_retriever,
)
# 只返回与问题相关的句子

# 8. ParentDocumentRetriever（小块检索、大块返回）
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryStore

# 子块：用于精确检索
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400)
# 父块：用于返回完整上下文
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=2000)

store = InMemoryStore()
parent_retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=store,
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
)

# 9. MultiVectorRetriever（多向量检索）
from langchain.retrievers.multi_vector import MultiVectorRetriever
# 同一文档存多个向量：摘要、假设问题、正文

# 10. Time-Weighted（时间加权）
from langchain.retrievers import TimeWeightedVectorStoreRetriever
tw_retriever = TimeWeightedVectorStoreRetriever(
    vectorstore=vectorstore,
    decay_rate=0.01,  # 时间衰减
    k=4,
)
```

### 10.3 文本切分深度对比

```python
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    CharacterTextSplitter,
    TokenTextSplitter,
    MarkdownTextSplitter,
    HTMLSectionSplitter,
    PythonCodeTextSplitter,
    NLTKTextSplitter,
    SpacyTextSplitter,
    KonlpyTextSplitter,
    LatexTextSplitter,
    RecursiveJsonSplitter,
)

# 1. RecursiveCharacter（默认推荐）
# 优先级：\n\n → \n → 句子 → 词
recursive = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=['\n\n', '\n', '。', '！', '？', ' ', ''],
    length_function=len,
    is_separator_regex=False,
)

# 2. Character（按字符切）
char = CharacterTextSplitter(
    separator='\n\n',
    chunk_size=1000,
    chunk_overlap=200,
)

# 3. Token（按 token 切，更精确）
from langchain_text_splitters import TokenTextSplitter
token = TokenTextSplitter(
    chunk_size=1000,  # 1000 tokens
    chunk_overlap=100,
    encoding_name='cl100k_base',  # GPT-4 编码
)

# 4. Markdown（保留标题结构）
md = MarkdownTextSplitter(chunk_size=1000, chunk_overlap=0)

# 5. HTML（基于标签）
html = HTMLSectionSplitter(headers_to_split_on=[('h1', 'Header 1'), ('h2', 'Header 2')])

# 6. Python（按代码结构）
py = PythonCodeTextSplitter(chunk_size=1000, chunk_overlap=0)

# 7. 中文（用 NLTK 或 jieba）
from langchain_text_splitters import NLTKTextSplitter
nltk = NLTKTextSplitter(chunk_size=1000)

# 8. JSON（递归）
from langchain_text_splitters import RecursiveJsonSplitter
json_splitter = RecursiveJsonSplitter(max_chunk_size=300)

# 9. 语义切分（SemanticChunker）
from langchain_experimental.text_splitter import SemanticChunker
semantic = SemanticChunker(
    OpenAIEmbeddings(),
    breakpoint_threshold_type='percentile',  # 或 'standard_deviation', 'interquartile'
    breakpoint_threshold_amount=95,
)
# 语义突变处切分

# 10. 按行号切分
from langchain_text_splitters import LineByLineTextSplitter
line = LineByLineTextSplitter(chunk_size=1000)
```

### 10.4 元数据增强切分

```python
# 1. 切分时保留元数据
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = splitter.split_documents(docs)
# chunks[i].metadata 保留原文档的元数据

# 2. 增强元数据
for i, chunk in enumerate(chunks):
    chunk.metadata.update({
        'chunk_id': i,
        'source': 'handbook.pdf',
        'category': 'HR',
        'page': chunk.metadata.get('page', 0),
        'created_at': '2026-06-04',
    })

# 3. 时间加权元数据
import datetime
for chunk in chunks:
    chunk.metadata['recency_score'] = 1.0  # 可用于排序

# 4. 关键词提取元数据
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
keyword_llm = ChatOpenAI(model='gpt-4o-mini')
# 用 LLM 提取关键词存入 metadata
```

### 10.5 RAG 评估体系

```python
# 1. Ragas 评估框架
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset

# 准备评估数据
eval_data = {
    'question': ['什么是 RAG？', 'RAG 的优势是什么？'],
    'answer': [answer1, answer2],
    'contexts': [[ctx1, ctx2], [ctx3, ctx4]],
    'ground_truth': ['RAG 是...', 'RAG 可以...'],
}
dataset = Dataset.from_dict(eval_data)

# 评估
result = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)
print(result)

# 2. LangSmith Evaluation
from langsmith.evaluation import evaluate, LangChainStringEvaluator
from langchain_openai import ChatOpenAI

# 创建评估集
test_data = [
    {'input': '什么是 LCEL', 'output': 'LCEL 是 LangChain Expression Language...'},
]

# 评估器
qa_evaluator = LangChainStringEvaluator('qa', config={'llm': ChatOpenAI()})

results = evaluate(
    rag_chain.invoke,
    data=test_data,
    evaluators=[qa_evaluator],
    metadata={'version': 'v1.0'},
)
```

### 10.6 RAG 优化 10 大技巧

1. **切分策略**：用 `RecursiveCharacterTextSplitter`，chunk_size 500-1500，overlap 10-20%
2. **元数据丰富**：加 source、date、category、author 便于过滤
3. **HyDE 检索**：用 LLM 生成假设答案再检索
4. **多查询扩展**：用 LLM 生成 3-5 个查询变体
5. **重排序（Rerank）**：用 Cohere Rerank 或 BGE Reranker 精排
6. **混合检索**：BM25 + 向量，权重 0.3-0.5
7. **查询改写**：加对话历史上下文
8. **上下文压缩**：ContextualCompressionRetriever
9. **Parent Document**：小块检索、大块返回
10. **评估驱动**：用 Ragas 持续评估，迭代优化

## 十一、Vector Stores 向量数据库详解

### 11.1 主流向量库对比

| 向量库 | 部署 | 规模 | 性能 | 特性 | 适用场景 |
|---|---|---|---|---|---|
| FAISS | 本地 | 亿级 | 极快 | Meta 出品，纯内存 | 原型、本地 |
| Chroma | 本地 | 百万级 | 快 | 易用，嵌入式 | 原型、小规模 |
| Pinecone | 云 | 十亿级 | 极快 | 全托管，serverless | 生产、SaaS |
| Weaviate | 本地/云 | 亿级 | 快 | GraphQL、模块化 | 复杂查询 |
| Qdrant | 本地/云 | 亿级 | 极快 | Rust 写、过滤强 | 实时检索 |
| Milvus | 集群 | 千亿级 | 极快 | 分布式、K8s | 大规模生产 |
| PGVector | PG 扩展 | 百万级 | 中 | 复用 PG 基础设施 | 已有 PG |
| Redis | Redis 模块 | 百万级 | 快 | 内存、实时 | 实时应用 |
| Elasticsearch | 集群 | 亿级 | 中 | 全文 + 向量 | 搜索增强 |
| OpenSearch | 集群 | 亿级 | 中 | AWS 友好 | 云原生 |
| Vespa | 集群 | 亿级 | 极快 | Yahoo 出品 | 推荐系统 |
| Typesense | 集群 | 千万级 | 快 | 简单易用 | 搜索 |

### 11.2 FAISS（本地首选）

```python
from langchain_community.vectorstores import FAISS
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model='text-embedding-3-small')

# 1. 从文本创建
texts = ['苹果是红色水果', '香蕉是黄色水果', 'Python 是编程语言']
vectorstore = FAISS.from_texts(texts, embeddings, metadatas=[{'id': i} for i in range(3)])

# 2. 从文档创建
from langchain_core.documents import Document
docs = [
    Document(page_content='LangChain 是 LLM 框架', metadata={'source': 'a'}),
    Document(page_content='LlamaIndex 是 RAG 框架', metadata={'source': 'b'}),
]
vectorstore = FAISS.from_documents(docs, embeddings)

# 3. 检索
query = '什么是 LangChain'
docs = vectorstore.similarity_search(query, k=3)
docs_with_score = vectorstore.similarity_search_with_score(query, k=3)
for doc, score in docs_with_score:
    print(f'Score: {score:.4f} | {doc.page_content}')

# 4. 增删
vectorstore.add_texts(['新文本1', '新文本2'])
vectorstore.delete(['doc_id_1', 'doc_id_2'])

# 5. 持久化
vectorstore.save_local('./faiss_index')
# 加载
loaded = FAISS.load_local('./faiss_index', embeddings, allow_dangerous_deserialization=True)

# 6. 合并
vs1 = FAISS.from_texts(['a', 'b'], embeddings)
vs2 = FAISS.from_texts(['c', 'd'], embeddings)
vs1.merge_from(vs2)

# 7. GPU 加速
import faiss
res = faiss.StandardGpuResources()
vectorstore.index = faiss.index_cpu_to_gpu(res, 0, vectorstore.index)
```

### 11.3 Chroma（原型友好）

```python
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

# 1. 内存模式
vectorstore = Chroma.from_texts(
    texts,
    OpenAIEmbeddings(),
    collection_name='my_collection',
)

# 2. 持久化
vectorstore = Chroma.from_texts(
    texts,
    OpenAIEmbeddings(),
    persist_directory='./chroma_db',
    collection_name='my_collection',
)
# 自动持久化

# 3. 客户端模式（连接服务）
import chromadb
client = chromadb.HttpClient(host='localhost', port=8000)
vectorstore = Chroma(
    client=client,
    collection_name='my_collection',
    embedding_function=OpenAIEmbeddings(),
)

# 4. 元数据过滤
results = vectorstore.similarity_search(
    'query',
    k=4,
    filter={'source': 'handbook.pdf', 'page': {'$gte': 10}},
)

# 5. 使用本地 embedding
from chromadb.utils import embedding_functions
default_ef = embedding_functions.DefaultEmbeddingFunction()
chroma = Chroma.from_texts(texts, embedding_function=default_ef)
```

### 11.4 Pinecone（云托管）

```python
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec
import os

pc = Pinecone(api_key=os.environ['PINECONE_API_KEY'])

# 1. 创建索引
index_name = 'my-index'
if index_name not in pc.list_indexes().names():
    pc.create_index(
        name=index_name,
        dimension=1536,
        metric='cosine',  # 或 'euclidean', 'dotproduct'
        spec=ServerlessSpec(cloud='aws', region='us-east-1'),
    )

# 2. 写入
from langchain_openai import OpenAIEmbeddings
embeddings = OpenAIEmbeddings(model='text-embedding-3-small')
vectorstore = PineconeVectorStore.from_texts(
    texts,
    embeddings,
    index_name=index_name,
    namespace='my-namespace',  # 命名空间隔离
    metadatas=metadatas,
)

# 3. 检索
docs = vectorstore.similarity_search(
    'query',
    k=4,
    namespace='my-namespace',
    filter={'category': 'tech'},
)

# 4. 命名空间管理
pc.Index(index_name).delete(namespace='old-namespace', delete_all=True)
```

### 11.5 Weaviate（GraphQL + 模块化）

```python
from langchain_weaviate import WeaviateVectorStore
import weaviate
from langchain_openai import OpenAIEmbeddings

# 1. 连接
client = weaviate.connect_to_local(host='localhost', port=8080)
# 或云端：weaviate.connect_to_wcs(cluster_url='...', auth_credentials=...)

# 2. 创建
vectorstore = WeaviateVectorStore.from_texts(
    texts,
    OpenAIEmbeddings(),
    client=client,
    index_name='MyCollection',
)

# 3. 检索
docs = vectorstore.similarity_search('query', k=4)

# 4. 混合检索（BM25 + 向量）
docs = vectorstore.similarity_search(
    'query',
    k=4,
    alpha=0.5,  # 0=纯 BM25, 1=纯向量
)

# 5. 过滤
docs = vectorstore.similarity_search(
    'query',
    k=4,
    filters={'path': ['category'], 'operator': 'Equal', 'valueText': 'tech'},
)
```

### 11.6 Qdrant（Rust 高性能）

```python
from langchain_qdrant import QdrantVectorStore, RetrievalMode
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from langchain_openai import OpenAIEmbeddings

# 1. 本地
client = QdrantClient(location=':memory:')
# 或持久化：QdrantClient(path='./qdrant_db')
# 或远程：QdrantClient(url='http://localhost:6333')

# 2. 创建 collection
if not client.collection_exists('my_collection'):
    client.create_collection(
        collection_name='my_collection',
        vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
    )

# 3. 写入
embeddings = OpenAIEmbeddings()
vectorstore = QdrantVectorStore(
    client=client,
    collection_name='my_collection',
    embedding=embeddings,
)
vectorstore.add_texts(texts, metadatas=metadatas)

# 4. 检索
docs = vectorstore.similarity_search('query', k=4)

# 5. 高级过滤
from qdrant_client.models import Filter, FieldCondition, MatchValue
docs = vectorstore.similarity_search(
    'query',
    k=4,
    filter=Filter(must=[FieldCondition(key='category', match=MatchValue(value='tech'))]),
)

# 6. 混合模式
vectorstore_hybrid = QdrantVectorStore(
    client=client,
    collection_name='my_collection',
    embedding=embeddings,
    retrieval_mode=RetrievalMode.HYBRID,
    sparse_embedding=...,  # BM25
)
```

### 11.7 Milvus（亿级分布式）

```python
from langchain_milvus import Milvus
from pymilvus import connections, Collection, CollectionSchema, FieldSchema, DataType
from langchain_openai import OpenAIEmbeddings

# 1. 连接
connections.connect(host='localhost', port='19530')

# 2. 创建
vectorstore = Milvus.from_texts(
    texts,
    OpenAIEmbeddings(),
    collection_name='my_collection',
    connection_args={'host': 'localhost', 'port': '19530'},
)

# 3. 高级
vectorstore = Milvus(
    embedding_function=OpenAIEmbeddings(),
    collection_name='my_collection',
    connection_args={...},
    primary_field='id',
    text_field='text',
    vector_field='vector',
    metadata_schema={'source': 'str', 'date': 'str'},
)
```

### 11.8 PGVector（已有 PG 时的最佳选择）

```python
# 1. 安装扩展
# CREATE EXTENSION IF NOT EXISTS vector;

from langchain_postgres.vectorstores import PGVector
from langchain_openai import OpenAIEmbeddings

# 2. 连接
CONNECTION_STRING = 'postgresql+psycopg2://user:pass@localhost:5432/vectordb'
vectorstore = PGVector.from_texts(
    texts,
    OpenAIEmbeddings(),
    connection_string=CONNECTION_STRING,
    collection_name='my_collection',
    pre_delete_collection=False,  # 启动时是否清空
)

# 3. 用现有 PG 表
vectorstore = PGVector(
    connection_string=CONNECTION_STRING,
    embedding_function=OpenAIEmbeddings(),
    collection_name='my_collection',
    distance_strategy=...,  # CosineDistance / EuclideanDistance / HNSW
    use_jsonb=True,
)

# 4. 混合查询（向量 + 关系）
docs = vectorstore.similarity_search(
    'query',
    k=4,
    filter='source = %s AND page > %s',
    params=('handbook.pdf', 10),
)
```

### 11.9 Redis（实时应用）

```python
from langchain_community.vectorstores import Redis

vectorstore = Redis.from_texts(
    texts,
    OpenAIEmbeddings(),
    redis_url='redis://localhost:6379',
    index_name='my_index',
)

# 检索
docs = vectorstore.similarity_search('query', k=4)

# 混合查询
docs = vectorstore.similarity_search('query', k=4, filter={'category': 'tech'})
```

### 11.10 向量库选型决策树

```
数据规模？
├── < 100 万 → Chroma / FAISS（本地）
├── 100 万 - 1 亿 → Qdrant / Weaviate / Milvus（单节点）
└── > 1 亿 → Milvus / Pinecone / Vespa（分布式/云）

部署偏好？
├── 完全本地 → FAISS / Chroma / Qdrant
├── 云托管 → Pinecone
└── 混合 → Weaviate / Qdrant

是否已有数据库？
├── 已有 PG → PGVector
├── 已有 Redis → Redis Vector
└── 已有 ES → Elasticsearch Vector

预算？
├── 0 → FAISS / Chroma
├── 中 → Qdrant Cloud / Weaviate Cloud
└── 高 → Pinecone / Milvus

## 十二、Document Loaders 文档加载器

### 12.1 文件加载器

```python
from langchain_community.document_loaders import (
    PyPDFLoader, PyPDFium2Loader, PyMuPDFLoader, PDFMinerLoader, PDFPlumberLoader,
    UnstructuredPDFLoader,
    TextLoader,
    UnstructuredFileLoader,
    JSONLoader,
    CSVLoader,
    UnstructuredCSVLoader,
    UnstructuredExcelLoader,
    UnstructuredWordDocumentLoader,
    UnstructuredPowerPointLoader,
    UnstructuredEPubLoader,
    UnstructuredRTFLoader,
    UnstructuredHTMLLoader,
    UnstructuredMarkdownLoader,
    BSHTMLLoader,
)

# 1. PDF
from langchain_community.document_loaders import PyPDFLoader
loader = PyPDFLoader('./data/handbook.pdf')
pages = loader.load()  # 每页一个 Document
# 或 lazy_load() 流式

# PyMuPDF（更快）
from langchain_community.document_loaders import PyMuPDFLoader
loader = PyMuPDFLoader('./data/handbook.pdf')
# 支持图片提取

# 2. 文本
from langchain_community.document_loaders import TextLoader
loader = TextLoader('./data/readme.txt', encoding='utf-8')
docs = loader.load()

# 3. CSV
from langchain_community.document_loaders import CSVLoader
loader = CSVLoader(
    './data/products.csv',
    csv_args={'delimiter': ',', 'quotechar': '"'},
    source_column='id',  # 用作 metadata.source
    content_columns=['title', 'description'],
)
docs = loader.load()

# 4. JSON
from langchain_community.document_loaders import JSONLoader
loader = JSONLoader(
    file_path='./data.json',
    jq_schema='.messages[].content',  # jq 语法
    text_content=False,
)
docs = loader.load()

# 5. Excel
from langchain_community.document_loaders import UnstructuredExcelLoader
loader = UnstructuredExcelLoader('./data/sales.xlsx', mode='paged')
docs = loader.load()

# 6. Word
from langchain_community.document_loaders import UnstructuredWordDocumentLoader
loader = UnstructuredWordDocumentLoader('./data/report.docx')
docs = loader.load()

# 7. Markdown
from langchain_community.document_loaders import UnstructuredMarkdownLoader
loader = UnstructuredMarkdownLoader('./README.md', mode='paged')
```

### 12.2 Web 加载器

```python
# 1. WebBaseLoader（基础）
from langchain_community.document_loaders import WebBaseLoader
loader = WebBaseLoader('https://docs.python.org/3/')
docs = loader.load()

# 多 URL
loader = WebBaseLoader(['https://example.com/page1', 'https://example.com/page2'])

# 2. Playwright（JavaScript 渲染）
from langchain_community.document_loaders import PlaywrightURLLoader
loader = PlaywrightURLLoader(
    urls=['https://spa-site.com'],
    remove_selectors=['header', 'footer', 'nav'],
)
docs = loader.load()

# 3. Selenium
from langchain_community.document_loaders import SeleniumURLLoader
loader = SeleniumURLLoader(urls=['https://example.com'])
docs = loader.load()

# 4. RecursiveUrlLoader（爬虫）
from langchain_community.document_loaders import RecursiveUrlLoader
loader = RecursiveUrlLoader(
    'https://docs.example.com',
    max_depth=2,
    extractor=lambda x: BeautifulSoup(x, 'html.parser').get_text(),
)
docs = loader.load()

# 5. SitemapLoader（站点地图）
from langchain_community.document_loaders import SitemapLoader
loader = SitemapLoader(
    'https://example.com/sitemap.xml',
    filter_urls=['https://example.com/blog/.*'],
)
docs = loader.load()
```

### 12.3 SaaS 平台加载器

```python
# 1. Notion
from langchain_community.document_loaders import NotionDBLoader
loader = NotionDBLoader(
    integration_token='secret_...',
    database_id='...',
    request_timeout_sec=30,
)
docs = loader.load()

# 2. Confluence
from langchain_community.document_loaders import ConfluenceLoader
loader = ConfluenceLoader(
    url='https://company.atlassian.net/wiki',
    username='user@company.com',
    api_key='...',
    space_key='TECH',
    include_attachments=True,
    page_ids=['123456'],
)
docs = loader.load()

# 3. Slack
from langchain_community.document_loaders import SlackDirectoryLoader
loader = SlackDirectoryLoader('./slack_export/')
docs = loader.load()

# 4. Discord
from langchain_community.document_loaders import DiscordChatLoader
loader = DiscordChatLoader(
    channel_id='...',
    discord_token='...',
)

# 5. Google Drive
from langchain_community.document_loaders import GoogleDriveLoader
loader = GoogleDriveLoader(
    folder_id='...',
    recursive=True,
    file_types=['document', 'sheet'],
    credentials_path='./credentials.json',
)
docs = loader.load()

# 6. OneDrive
from langchain_community.document_loaders import OneDriveLoader
loader = OneDriveLoader(
    od_path='Documents',
    auth_with_token=True,
    token_path='./token.json',
)

# 7. SharePoint
from langchain_community.document_loaders import SharePointLoader

# 8. Dropbox
from langchain_community.document_loaders import DropboxLoader
```

### 12.4 数据库加载器

```python
# 1. SQL
from langchain_community.document_loaders import SQLDatabaseLoader
from langchain_community.utilities import SQLDatabase

db = SQLDatabase.from_uri('postgresql://user:pass@localhost/db')
loader = SQLDatabaseLoader(
    db=db,
    query='SELECT id, title, content FROM articles WHERE created_at > NOW() - INTERVAL \'7 days\'',
    page_content_columns=['title', 'content'],
    metadata_columns=['id'],
)
docs = loader.load()

# 2. MongoDB
from langchain_community.document_loaders import MongodbLoader
loader = MongodbLoader(
    connection_string='mongodb://localhost:27017/',
    db_name='mydb',
    collection_name='articles',
    filter_criteria={'published': True},
)

# 3. BigQuery
from langchain_community.document_loaders import BigQueryLoader
loader = BigQueryLoader(
    project_id='my-project',
    dataset='my_dataset',
    table='my_table',
    page_content_columns=['content'],
    metadata_columns=['id', 'date'],
)
```

### 12.5 多媒体加载器

```python
# 1. YouTube（音频 + 转录）
from langchain_community.document_loaders import YoutubeAudioLoader, OpenAIWhisperParser
from langchain_community.document_loaders.generic import GenericLoader

# 1.1 音频下载
urls = ['https://youtube.com/watch?v=...']
save_dir = './youtube_audio'
loader = GenericLoader.from_filesystem(
    save_dir,
    glob='*.m4a',
    suffixes=['.m4a'],
    parser=OpenAIWhisperParser(),
)
docs = loader.load()

# 1.2 直接转录
from langchain_community.document_loaders import YoutubeLoader
loader = YoutubeLoader.from_youtube_url(
    'https://youtube.com/watch?v=...',
    add_video_info=True,
    language=['zh-CN', 'en'],
    translation='zh-CN',
)
docs = loader.load()

# 2. 音频文件
from langchain_community.document_loaders import OpenAIWhisperAudioParser, AudioFileLoader

# 3. 图片（OCR）
from langchain_community.document_loaders import UnstructuredImageLoader
loader = UnstructuredImageLoader('./image.png')
docs = loader.load()

# 4. GitHub
from langchain_community.document_loaders import GitHubIssuesLoader, GithubFileLoader

# 4.1 Issues
loader = GitHubIssuesLoader(
    repo='langchain-ai/langchain',
    creator='hwchase17',
    state='closed',
    labels=['bug', 'enhancement'],
    n_issues=50,
)
docs = loader.load()

# 4.2 文件
loader = GithubFileLoader(
    repo='langchain-ai/langchain',
    branch='master',
    file_filter=lambda x: 'docs' in x,
    github_api_key='...',
)
```

### 12.6 学术 / 知识库

```python
# 1. Arxiv
from langchain_community.document_loaders import ArxivLoader
loader = ArxivLoader(
    query='attention is all you need',
    load_max_docs=5,
    load_all_available_meta=True,
)
docs = loader.load()

# 2. Wikipedia
from langchain_community.document_loaders import WikipediaLoader
loader = WikipediaLoader(
    query='Quantum computing',
    lang='en',
    load_max_docs=5,
)
docs = loader.load()

# 3. PubMed
from langchain_community.document_loaders import PubMedLoader
loader = PubMedLoader(query='cancer', load_max_docs=10)

# 4. Hacker News
from langchain_community.document_loaders import HNLoader
loader = HNLoader('https://news.ycombinator.com/item?id=...')

# 5. IMDB
from langchain_community.document_loaders import IMSDBLoader

# 6. 微信公众号
from langchain_community.document_loaders import WeChatArticleLoader
```

### 12.7 自定义 Document Loader

```python
from langchain_core.document_loaders import BaseLoader
from langchain_core.documents import Document
from typing import List

class MyCustomLoader(BaseLoader):
    """自定义加载器示例"""
    def __init__(self, file_paths: List[str]):
        self.file_paths = file_paths

    def lazy_load(self) -> Iterator[Document]:
        for path in self.file_paths:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            yield Document(
                page_content=content,
                metadata={'source': path, 'length': len(content)},
            )

    def load(self) -> List[Document]:
        return list(self.lazy_load())

# 用 lazy_load 节省内存
loader = MyCustomLoader(['./a.txt', './b.txt', './c.txt'])
for doc in loader.lazy_load():
    print(doc.metadata, doc.page_content[:100])

# 带状态的复杂 Loader
class DatabaseLoader(BaseLoader):
    def __init__(self, db_url: str, batch_size: int = 100):
        self.db_url = db_url
        self.batch_size = batch_size
        self._conn = None

    def __enter__(self):
        import psycopg2
        self._conn = psycopg2.connect(self.db_url)
        return self

    def __exit__(self, *args):
        if self._conn:
            self._conn.close()

    def lazy_load(self):
        cur = self._conn.cursor(name='streaming_cursor')
        cur.itersize = self.batch_size
        cur.execute('SELECT id, content, created_at FROM articles')
        for row in cur:
            yield Document(
                page_content=row[1],
                metadata={'id': row[0], 'date': row[2].isoformat()},
            )
        cur.close()

# 用 with 语句
with DatabaseLoader('postgresql://...') as loader:
    docs = list(loader.lazy_load())
```

## 十三、Embeddings 模型深度对比

### 13.1 主流 Embedding 模型

| 模型 | 维度 | 语种 | 性能 | 价格 | 适用 |
|---|---|---|---|---|---|
| text-embedding-3-small | 1536 (可降) | 多语 | 高 | $0.02/1M | 通用 |
| text-embedding-3-large | 3072 (可降) | 多语 | 极高 | $0.13/1M | 高精度 |
| text-embedding-ada-002 | 1536 | 多语 | 高 | $0.10/1M | 旧版 |
| BGE-large-zh-v1.5 | 1024 | 中文 | 极高 | 免费 | 中文 RAG |
| BGE-large-en-v1.5 | 1024 | 英文 | 极高 | 免费 | 英文 RAG |
| BGE-M3 | 1024 | 多语 | 极高 | 免费 | 多语 RAG |
| M3E-large | 1024 | 中文 | 高 | 免费 | 中文 RAG |
| M3E-base | 768 | 中文 | 中 | 免费 | 中文轻量 |
| Cohere embed-english-v3.0 | 1024 | 英文 | 高 | $0.10/1M | 英文 |
| Cohere embed-multilingual-v3.0 | 1024 | 多语 | 高 | $0.10/1M | 多语 |
| Voyage-3 | 1024 | 多语 | 极高 | $0.06/1M | 通用 |
| Jina-embeddings-v3 | 1024 | 多语 | 高 | $0.02/1M | 多语 |
| Instructor-xl | 768 | 多语 | 高 | 免费 | 指令调优 |
| E5-large-v2 | 1024 | 英文 | 高 | 免费 | 英文 |
| GTE-Qwen2-7B-instruct | 3584 | 多语 | 极高 | 免费 | 高精度 |
| Nomic-embed-text-v1.5 | 768 | 多语 | 高 | 免费 | 多语 |
| Snowflake-arctic-embed-l | 1024 | 多语 | 极高 | 免费 | 通用 |
| Stella-en-1.5B-v5 | 1024 | 英文 | 极高 | 免费 | 英文 |

### 13.2 Embedding 优化

```python
# 1. 批处理嵌入
from langchain_openai import OpenAIEmbeddings
emb = OpenAIEmbeddings(chunk_size=1000)  # 一次最多 1000 文本
# 自动批处理

# 2. 缓存
from langchain.embeddings import CacheBackedEmbeddings
from langchain.storage import LocalFileStore

fs = LocalFileStore('./embedding_cache')
cached_emb = CacheBackedEmbeddings.from_bytes_store(
    OpenAIEmbeddings(),
    fs,
    namespace='openai-emb-v3',  # 缓存命名空间
)
# 重复查询从缓存读取

# 3. 降维
emb = OpenAIEmbeddings(model='text-embedding-3-large', dimensions=512)
# 节省存储和检索时间

# 4. 异步嵌入
import asyncio
from langchain.embeddings import aembed_documents
async def embed_all():
    vectors = await aembed_documents(texts, emb)
    return vectors

# 5. 自定义 Embeddings
from langchain_core.embeddings import Embeddings
import numpy as np

class MyEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # 自定义嵌入逻辑
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        # 调用你的模型
        return np.random.rand(1536).tolist()
```

### 13.3 Embedding 质量评估

```python
# 1. MTEB 基准
from mteb import MTEB
from langchain_huggingface import HuggingFaceEmbeddings

emb = HuggingFaceEmbeddings(model_name='BAAI/bge-large-zh-v1.5')
# 跑 MTEB 评估
# evaluation = MTEB(tasks=['CMTEBRetrieval'])
# evaluation.run(emb, output_folder='./results')

# 2. 自定义评估
from sklearn.metrics.pairwise import cosine_similarity

queries = ['什么是 LangChain', 'LangChain 是什么', '今天天气']
docs = ['LangChain 是 LLM 框架', 'Python 是编程语言', '天气晴朗']

q_emb = emb.embed_documents(queries)
d_emb = emb.embed_documents(docs)
sim = cosine_similarity(q_emb, d_emb)
print(sim)
# 期望 q1 和 d1 的相似度最高
```

## 十四、Retrievers 检索器深度对比

### 14.1 检索器类型一览

```python
# 1. VectorStoreRetriever
retriever = vectorstore.as_retriever(
    search_type='similarity',  # 'similarity', 'mmr', 'similarity_score_threshold'
    search_kwargs={'k': 4, 'filter': {'category': 'tech'}},
)

# 2. BM25Retriever
from langchain_community.retrievers import BM25Retriever
bm25 = BM25Retriever.from_documents(docs, k=4, bm25_params={'k1': 1.5, 'b': 0.75})

# 3. TF-IDF
from langchain_community.retrievers import TFIDFRetriever
tfidf = TFIDFRetriever.from_documents(docs, k=4)

# 4. SVM Retriever
from langchain_community.retrievers import SVMRetriever
svm = SVMRetriever.from_documents(docs, k=4)

# 5. MultiQueryRetriever
from langchain.retrievers.multi_query import MultiQueryRetriever
mq = MultiQueryRetriever.from_llm(retriever=base, llm=llm, parser_key='lines')

# 6. SelfQueryRetriever
from langchain.retrievers.self_query.base import SelfQueryRetriever
sq = SelfQueryRetriever.from_llm(llm, vectorstore, doc_desc, meta_info)

# 7. ContextualCompressionRetriever
from langchain.retrievers import ContextualCompressionRetriever
ccr = ContextualCompressionRetriever(base_compressor=compressor, base_retriever=retriever)

# 8. ParentDocumentRetriever
from langchain.retrievers import ParentDocumentRetriever
pd = ParentDocumentRetriever(vectorstore, docstore, child_splitter, parent_splitter)

# 9. MultiVectorRetriever
from langchain.retrievers.multi_vector import (
    MultiVectorRetriever,
    SearchType,
)

# 10. EnsembleRetriever（多路融合）
from langchain.retrievers import EnsembleRetriever
ensemble = EnsembleRetriever(retrievers=[bm25, vector], weights=[0.3, 0.7])

# 11. TimeWeightedRetriever
from langchain.retrievers import TimeWeightedVectorStoreRetriever
tw = TimeWeightedVectorStoreRetriever(vectorstore=vector, decay_rate=0.01)

# 12. WebResearchRetriever
from langchain.retrievers.web_research import WebResearchRetriever
wr = WebResearchRetriever.from_llm(llm, vectorstore, search=search_tool)

# 13. ArxivRetriever
from langchain.retrievers import ArxivRetriever
ax = ArxivRetriever(load_max_docs=2)

# 14. PubMedRetriever
from langchain.retrievers import PubMedRetriever
pm = PubMedRetriever()

# 15. WikipediaRetriever
from langchain.retrievers import WikipediaRetriever
wp = WikipediaRetriever(load_max_docs=5, lang='en')
```

### 14.2 ReRanker 重排序

```python
# 1. Cohere Rerank
from langchain.retrievers.document_compressors import CohereRerank
from langchain.retrievers import ContextualCompressionRetriever

compressor = CohereRerank(top_n=3, model='rerank-english-v3.0')
rerank_retriever = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=retriever,
)
result = rerank_retriever.invoke('query')

# 2. BGE Reranker
from langchain.retrievers.document_compressors import BgeRerank
compressor = BgeRerank(top_n=3, model='BAAI/bge-reranker-large')

# 3. FlashRank（本地免费）
from langchain.retrievers.document_compressors import FlashrankRerank
compressor = FlashrankRerank(top_n=3, model='ms-marco-MiniLM-L-12-v2')

# 4. Jina Rerank
from langchain.retrievers.document_compressors import JinaRerank
compressor = JinaRerank(top_n=3, model='jina-reranker-v1-base-en')

# 5. 自定义 Reranker
from langchain.retrievers.document_compressors.base import BaseDocumentCompressor
from langchain_core.documents import Document

class CustomReranker(BaseDocumentCompressor):
    top_n: int = 3

    def compress_documents(self, documents, query, callbacks=None):
        scored = [(doc, self._score(doc, query)) for doc in documents]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [doc for doc, score in scored[:self.top_n]]

    def _score(self, doc, query):
        # 自定义打分逻辑
        return len(set(query.split()) & set(doc.page_content.split()))

    async def acompress_documents(self, documents, query, callbacks=None):
        return self.compress_documents(documents, query, callbacks)
```

### 14.3 自定义 Retriever

```python
from langchain_core.retrievers import BaseRetriever
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from typing import List
import requests

class CustomAPIRetriever(BaseRetriever):
    """从自定义 API 检索"""
    api_url: str
    api_key: str
    top_k: int = 5

    class Config:
        arbitrary_types_allowed = True

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun,
    ) -> List[Document]:
        headers = {'Authorization': f'Bearer {self.api_key}'}
        response = requests.post(
            self.api_url,
            json={'query': query, 'top_k': self.top_k},
            headers=headers,
        )
        results = response.json()

        return [
            Document(
                page_content=r['content'],
                metadata={
                    'id': r['id'],
                    'score': r['score'],
                    'source': r['source'],
                },
            )
            for r in results['hits']
        ]

    async def _aget_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun,
    ) -> List[Document]:
        # 异步版本
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.post(
                self.api_url,
                json={'query': query, 'top_k': self.top_k},
                headers={'Authorization': f'Bearer {self.api_key}'},
            ) as response:
                results = await response.json()
        return [Document(page_content=r['content'], metadata=r) for r in results['hits']]

# 用法
retriever = CustomAPIRetriever(api_url='https://api.example.com/search', api_key='...')
docs = retriever.invoke('query')

# 集成到 RAG 链
chain = (
    {'context': retriever | format_docs, 'question': RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)
```
```
```
