# Ollama - 本地 LLM 运行时

**GitHub**: ollama/ollama
**Star**: 150k+
**语言**: Go + C++ (llama.cpp)
**主题**: llm、go、cgo、gguf、llama.cpp、subprocess
**适用场景**: 本地 AI 推理、私有部署、OpenAI 兼容 API、企业 LLM 落地

---

## 一、基础范式

### 模式 1 · subprocess 包装 llama.cpp

**问题场景**：直接 CGO 调 llama.cpp 复杂（编译/平台/版本管理难），需要快速集成。

**解决方案**：Ollama 把 llama.cpp 编译为独立二进制（`ollama runner`），Go 用 `os/exec` 启动子进程，通过 stdin/stdout JSON 协议通信。子进程模式解耦 Go 与 C++ 构建系统。

**关键参数**：
- `cmd/llama_server.go` subprocess 入口
- 2515 行
- `LlamaServer` 接口
- stdin/stdout JSON 协议
- 子进程管理 `cmd.Process`

**最佳实践**：C++ 库都用 subprocess 包装而非 CGO，构建复杂度降低 80%。

### 模式 2 · GGUF 模型格式解析

**问题场景**：llama.cpp 用 GGUF（GPT-Generated Unified Format）作为模型格式，Ollama 需要在 Go 端解析 metadata。

**解决方案**：`fs/ggml/gguf.go` 解析 GGUF 二进制格式（magic + version + metadata KV 对 + tensor info + tensor data），让 Go 端能读取模型参数、量化方式、tokenizer。

**关键参数**：
- GGUF v3 格式
- magic "GGUF"
- metadata KV 对
- tensor info
- tokenizer

**最佳实践**：自定义格式必须有 Go 解析器，避免 O(n²) IO 性能。

### 模式 3 · 多模型 VRAM 调度

**问题场景**：GPU VRAM 有限（24GB/48GB），多模型并发需要智能调度。

**解决方案**：`server/sched.go` 实现 Scheduler 调度器：按模型大小 + VRAM 余量决定能否加载新模型；用 channel 队列管理请求；已加载模型缓存在 LRU 池；VRAM 不够时 LRU 卸载。

**关键参数**：
- VRAM 预估
- 模型 LRU 池
- 请求队列
- 并发数控制
- GPU 锁

**最佳实践**：所有 GPU 服务都用 LRU + VRAM 预估调度，避免 OOM。

### 模式 4 · OpenAI 兼容 API

**问题场景**：用户已用 OpenAI SDK 写好代码，迁移到 Ollama 需要改代码。

**解决方案**：`server/routes.go` 暴露 `/v1/chat/completions` / `/v1/completions` / `/v1/embeddings` 等 OpenAI 兼容端点，请求/响应结构镜像 OpenAI，老代码 0 修改切换。

**关键参数**：
- `/v1/chat/completions`
- `/v1/embeddings`
- `/v1/models`
- 流式 SSE
- OpenAI schema 镜像

**最佳实践**：所有本地 LLM 运行时都提供 OpenAI 兼容 API，降低迁移成本。

### 模式 5 · 模型仓库（pull / push / create）

**问题场景**：用户需要下载/分享自定义模型，类似 Docker 镜像仓库。

**解决方案**：`Ollama.com` 是模型仓库，`ollama pull llama3` 下载模型（manifest + layer blob 拉取），`ollama push` 上传自定义模型；`ollama create` 从 Modelfile 构建（Dockerfile 类似）。

**关键参数**：
- `ollama pull` 下载
- `ollama push` 上传
- `ollama create` 构建
- `ollama rm` 删除
- Modelfile 配置

**最佳实践**：本地 LLM 工具必须有类似 Docker 的 pull/push 体验。

---

## 二、扩展范式

### 模式 6 · GPU 自动发现（CUDA / ROCm / Metal / Vulkan）

**问题场景**：用户机器有 NVIDIA / AMD / Apple Silicon GPU，Ollama 需要自动检测并用最优后端。

**解决方案**：`discover/gpu.go` + `discover/amd.go` + `discover/cuda_compat.go` 三大检测模块：扫描 `nvidia-smi` / `rocm-smi` / `system_profiler` / `vulkaninfo` 等系统工具，启动时输出可用 GPU 列表，自动选择最优后端。

**关键参数**：
- NVIDIA CUDA
- AMD ROCm
- Apple Metal
- Vulkan
- CPU fallback

**最佳实践**：所有跨平台 GPU 工具都用「系统命令扫描 + 自动选择后端」模式。

### 模式 7 · Modelfile 自定义模型

**问题场景**：用户想基于 llama3 微调 / 加 system prompt / 加 LoRA。

**解决方案**：`Modelfile` 是 Dockerfile 类似语法：`FROM llama3` / `SYSTEM "You are a helpful assistant"` / `PARAMETER temperature 0.7` / `ADAPTER ./lora.bin` / `MESSAGE ...` 定义对话模板。

**关键参数**：
- `FROM` 基模型
- `SYSTEM` 系统提示
- `PARAMETER` 超参
- `ADAPTER` LoRA
- `MESSAGE` 模板

**最佳实践**：所有本地 LLM 工具都支持 Modelfile 风格自定义。

### 模式 8 · 流式响应（SSE）

**问题场景**：LLM 响应慢（10+ 秒），需要流式输出。

**解决方案**：API 端点用 Server-Sent Events（SSE）`text/event-stream` 流式输出 token，OpenAI 兼容 `data: {choices: [{delta: {content: "..."}}]}\n\n` 格式。

**关键参数**：
- `text/event-stream`
- `data: {...}\n\n`
- `[DONE]` 结束
- 流式 token
- Ollama `/api/chat` 也支持

**最佳实践**：所有 LLM API 都默认流式，UX 提升 100%。

### 模式 9 · TUI 启动器（Bubbletea）

**问题场景**：CLI 启动需要可视化模型选择 + 进度条。

**解决方案**：`cmd/tui/` 目录用 Bubbletea（Go TUI 框架）实现交互式启动器，模型列表 + 启动进度 + 日志面板。

**关键参数**：
- Bubbletea TUI
- 进度条
- 实时日志
- 模型列表
- Lipgloss 样式

**最佳实践**：CLI 启动用 TUI 提升体验 5x。

### 模式 10 · tools / function calling

**问题场景**：LLM 需要调用外部工具（搜索、计算、API）。

**解决方案**：Ollama v0.5+ 支持 OpenAI 风格 `tools` 字段，`@register_tool` 装饰器声明工具，模型返回 `tool_calls` 时自动调用。

**关键参数**：
- `tools: [{type: 'function', function: {...}}]`
- `tool_calls: [{function: {name, arguments}}]`
- 自动调用
- 结果回填
- ReAct 循环

**最佳实践**：所有 LLM 运行时都支持 function calling，是 Agent 落地基础。

---

## 三、进阶范式

### 模式 11 · x/ 子包模块化

**问题场景**：Ollama 仓库增长到 10 万行 Go，单一包管理混乱。

**解决方案**：v0.5+ 引入 `x/` 子包（`x/imagegen` / `x/chat` 等）按功能域拆分，monorepo 风格但单仓。

**关键参数**：
- `x/imagegen` 图像生成
- `x/chat` 聊天
- `x/` 命名空间
- 子包独立
- 共享 `internal/`

**最佳实践**：Go 单仓超过 5 万行用 `x/` 子包按功能域拆分。

### 模式 12 · 量化支持（Q4_0 / Q5_K / Q8_0）

**问题场景**：FP16 模型 7B 需 14GB VRAM，普通用户跑不起。

**解决方案**：Ollama 支持 GGUF 多量化格式（Q2_K / Q3_K / Q4_0 / Q4_K / Q5_K / Q6_K / Q8_0 / F16），按 VRAM 选择；Q4_K_M 7B 模型仅需 4.4GB。

**关键参数**：
- Q2_K / Q3_K / Q4_K / Q5_K
- 量化位数
- VRAM 预估
- 自动选 quant
- `:latest` tag 默认

**最佳实践**：消费级 GPU（8GB）选 Q4_K_M，服务器（24GB+）选 Q5_K/Q6_K。

### 模式 13 · 多模态（vision / audio）

**问题场景**：LLM 需要处理图片（GPT-4V）和音频（Whisper）。

**解决方案**：Ollama v0.4+ 支持 vision（llama3.2-vision / llava），v0.5+ 支持 audio，messages 中 `images: [base64]` / `audios: [base64]` 字段。

**关键参数**：
- `images: [base64]`
- 多模态模型
- vision encoder
- audio encoder
- cross-modal attention

**最佳实践**：多模态用专用模型（llava / llama3.2-vision）而非通用模型。

### 模式 14 · 内置 Web UI（Ollama Web）

**问题场景**：CLI 用户想用 Web 界面。

**解决方案**：Ollama 内置 Web UI（`/web` 端点），聊天界面 + 模型管理 + 系统监控，浏览器访问 `http://localhost:11434/web`。

**关键参数**：
- `/web` 端点
- 聊天 UI
- 模型管理
- 实时监控
- markdown 渲染

**最佳实践**：CLI 工具内置 Web UI 降低使用门槛 5x。

### 模式 15 · cloud_proxy 远程代理

**问题场景**：本地 LLM 算力不够，需要云端 fallback。

**解决方案**：`server/cloud_proxy.go` 代理到 Ollama Cloud 远程推理，本地算力不足时自动转发。

**关键参数**：
- 本地优先
- 云端 fallback
- API Key 认证
- 流量计费
- 透明代理

**最佳实践**：本地 LLM 工具都加云端 fallback，按需扩容。

---

## 四、实战范式

### 模式 16 · 7 件套启动模板

**问题场景**：开发者第一次用 Ollama。

**解决方案**：7 件套：`ollama serve`（启动服务）/ `ollama pull llama3`（下载模型）/ `ollama run llama3`（启动交互）/ `curl http://localhost:11434/api/chat`（API 调用）/ Modelfile（自定义）/ `ollama create` / `ollama list`。

**关键参数**：
- `ollama serve` 启动
- `ollama pull` 下载
- `ollama run` 交互
- `curl` API
- 7 个常用命令

**最佳实践**：Ollama 7 件套是本地 LLM 入门必学。

### 模式 17 · GPU 选型 + 模型搭配

**问题场景**：用户硬件不知道跑什么模型。

**解决方案**：5 档 GPU 选型表：① 8GB 显存（RTX 3060/4060）→ 7B Q4_K_M ② 12GB（RTX 3080/4070）→ 13B Q4_K_M ③ 24GB（RTX 3090/4090）→ 33B Q4_K_M ④ 48GB（A6000）→ 70B Q4_K_M ⑤ 80GB（H100/A100）→ 70B F16 满血。

**关键参数**：
- VRAM 8GB/12GB/24GB/48GB/80GB
- 模型尺寸 7B/13B/33B/70B
- 量化 Q4_K_M
- 推理速度 tokens/s
- 上下文长度

**最佳实践**：选型用「VRAM / 模型尺寸 = 量化位数」反推。

### 模式 18 · 性能基准 + 调优

**问题场景**：LLM 推理速度慢。

**解决方案**：5 招调优：① `OLLAMA_NUM_PARALLEL` 并发 ② `OLLAMA_MAX_LOADED_MODELS` 缓存 ③ Flash Attention ④ mmap 模型 ⑤ batch size 调整。

**关键参数**：
- `num_parallel` 并发
- `max_loaded_models` 缓存
- Flash Attention
- mmap
- `num_gpu` 层数

**最佳实践**：所有 LLM 服务都加 `num_parallel` + `max_loaded_models` 调优。

### 模式 19 · 与 vLLM / TGI / LM Studio / llama.cpp 对比

**问题场景**：选型在 Ollama / vLLM / TGI / LM Studio / llama.cpp 之间。

**解决方案**：Ollama 定位「本地 + 零配置 + OpenAI 兼容」适合个人/小团队；vLLM 定位「高吞吐 + PagedAttention」适合大模型服务；TGI 定位「Rust 高性能 + HuggingFace」适合生产；LM Studio 定位「GUI 桌面」适合非工程师；llama.cpp 定位「底层 C++」适合极客。

**关键参数**：
- 性能：vLLM > TGI > Ollama > llama.cpp
- 易用：Ollama > LM Studio > llama.cpp > vLLM
- 体积：llama.cpp < Ollama < LM Studio
- 生态：vLLM ≈ TGI > Ollama > llama.cpp

**最佳实践**：本地选 Ollama，生产选 vLLM，HF 集成选 TGI，桌面选 LM Studio。

### 模式 20 · 7 天复刻最小可跑内核

**问题场景**：想 fork Ollama 做企业内 LLM 平台。

**解决方案**：7 天分 6 步：① llama.cpp subprocess 启动 ② HTTP server（Gin）③ 模型拉取/解压 ④ LRU 调度 ⑤ OpenAI 兼容 API ⑥ CLI 工具。

**关键参数**：
- Day 1: subprocess
- Day 2: HTTP server
- Day 3: 模型管理
- Day 4: 调度
- Day 5: OpenAI API
- Day 6: CLI
- Day 7: 文档

**最佳实践**：7 天复刻只求「够用 80% 场景」，完整 Ollama 复刻需要 6 个月+。

---

## 附：仓库元信息

- **路径**: `G:\实战案例\GitHub顶尖项目\ollama\`
- **大小**: ~50 MB
- **总文件数**: 数千 Go/C++ 文件
- **关键 commit**: v0.5+
- **团队**: Ollama 公司 + 社区
- **许可**: MIT

## 一句话总结

Ollama 用「subprocess 包装 llama.cpp + 多模型 LRU 调度 + OpenAI 兼容 API + 自动 GPU 发现」把「本地跑 LLM」做到 docker pull/run 一样简单，是 2024-2025 年本地 AI 部署的事实标准。
