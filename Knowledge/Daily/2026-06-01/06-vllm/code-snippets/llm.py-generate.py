// 来源: vllm vllm/entrypoints/llm.py:LLM.generate + vllm/engine/llm_engine.py
// 作用: LLM 入口 API — 用户最高层抽象, 封装 tokenizer/model/scheduler
// 调用链: LLM.generate → LLMEngine.add_request → _run_engine → step
// ================================================================
// 关键点 (WHY):
//
// [WHY-1] LLM 类的 3 层架构
//   - LLM (用户层, 同步): 最简洁, generate() 阻塞到所有完成
//   - AsyncLLMEngine (用户层, 异步): 配合 FastAPI/async
//   - LLMEngine (引擎层): 调度 + 模型执行
//   - Worker (执行层): 单 GPU 上的模型 forward
//   - 关键: 异步用 asyncio.Queue 串起来
//   - 同步 LLM 内部用 AsyncLLMEngine 包装, 阻塞等待
//
// [WHY-2] generate() 完整流程
//   - 1. 校验 SamplingParams (temperature, top_p, top_k, max_tokens...)
//   - 2. prompt tokenize (用 HF tokenizer)
//   - 3. 把 Request 加到 LLMEngine.waiting 队列
//   - 4. 引擎开始调度 (Engine.step 循环)
//   - 5. 每 step 调 model.forward
//   - 6. Sampling 算 next token (greedy, sampling, beam...)
//   - 7. 检查 finish_reason (stop, length, eos)
//   - 8. 完成时把 RequestOutput push 到 output queue
//   - 9. 阻塞直到所有 request 完成
//
// [WHY-3] SamplingParams 详解
//   - temperature: 0 = greedy, >1 = 多样, <1 = 集中
//   - top_p (nucleus): 累积概率 < top_p 的 token 候选
//   - top_k: top k 候选
//   - max_tokens: 最大生成长度
//   - stop / stop_token_ids: 停止条件
//   - presence_penalty / frequency_penalty: 避免重复
//   - best_of: 生成 N 个取最好的 (n > 1 时开 beam)
//   - n: 1 prompt 生成 n 个输出
//   - logprobs: 返回 top token 的 log 概率
//   - seed: 复现性
//
// [WHY-4] 并行模式
//   - 1 prompt → n outputs: 1 个 prompt 复制 n 次, 共享 prefix
//   - beam search: 1 prompt → 1 output (top beam), 内部维护 N beams
//   - parallel sampling (n > 1): n 个独立 seq, 共享 prefix block
//   - 关键: prefix 共享省显存 (hash 去重)
//
// [WHY-5] 流式输出 (Streaming)
//   - stream=True → generator, 每次 yield 增量
//   - 内部: 每 step 完成后立即 yield, 不等全部完成
//   - 用 asyncio.Queue 在 engine 和 API 层传递
//   - 适用: chat UI 实时显示, 长文本生成
//   - 性能: 1 token 1 次 yield, 延迟低
// ================================================================

// === LLM 类 (用户层) ===
class LLM:
    def __init__(
        self,
        model: str,                       # HF 模型路径
        tokenizer: Optional[str] = None,
        tensor_parallel_size: int = 1,
        gpu_memory_utilization: float = 0.9,
        max_model_len: Optional[int] = None,
        quantization: Optional[str] = None,  # awq, gptq, fp8
        enable_prefix_caching: bool = False,
        ...
    ):
        # [WHY-1] 内部用 AsyncLLMEngine
        self.llm_engine = LLMEngine.from_engine_args(
            EngineArgs(
                model=model,
                tensor_parallel_size=tensor_parallel_size,
                ...
            )
        )
        # RequestOutput 输出队列
        self.output_queue = asyncio.Queue()

    def generate(
        self,
        prompts: Union[str, List[str], PromptInputs],
        sampling_params: Optional[SamplingParams] = None,
        use_tqdm: bool = True,
    ) -> List[RequestOutput]:
        """[WHY-2] 主入口: 加请求, 阻塞等到所有完成"""
        # 1. 补全 sampling_params
        if sampling_params is None:
            sampling_params = SamplingParams()

        # 2. 加 requests
        for prompt in prompts:
            self._validate_and_add_requests(prompt, sampling_params)

        # 3. 阻塞到所有完成
        outputs = self._run_engine(use_tqdm=use_tqdm)
        return outputs

    def _validate_and_add_requests(self, prompt, sampling_params):
        """校验 + 加到引擎队列"""
        # tokenize
        prompt_token_ids = self.llm_engine.tokenizer.encode(prompt)
        # 检查长度
        if len(prompt_token_ids) > self.llm_engine.model_config.max_model_len:
            raise ValueError(f"Prompt too long: {len(prompt_token_ids)}")
        # 加到 engine
        request_id = str(uuid.uuid4())
        self.llm_engine.add_request(
            request_id=request_id,
            prompt=prompt,
            prompt_token_ids=prompt_token_ids,
            sampling_params=sampling_params,
        )

// === LLMEngine (引擎层) ===
class LLMEngine:
    def __init__(self, model_config, cache_config, parallel_config, ...):
        # 模型配置
        self.model_config = model_config
        # Tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(model_config.model)
        # 调度器
        self.scheduler = Scheduler(scheduler_config, cache_config, ...)
        # Worker (1 个或多个 GPU)
        self.model_executor = build_model_executor(...)
        # 输出队列 (asyncio)
        self.output_queue = asyncio.Queue()

    def step(self) -> List[RequestOutput]:
        """每 step 调 1 次: 调度 → forward → sampling"""
        # 1. 调度: 选本轮 seq
        scheduler_outputs = self.scheduler.schedule()

        # 2. 模型 forward
        output = self.model_executor.execute_model(scheduler_outputs)

        # 3. Sampling 算 next token
        request_outputs = self._process_model_output(output, scheduler_outputs)

        # 4. 完成的 request → finish_reason
        # 5. 推入 output_queue
        return request_outputs

    def add_request(self, request_id, prompt, prompt_token_ids, sampling_params):
        """新请求进 WAITING 队列"""
        seq_group = SequenceGroup(
            request_id=request_id,
            prompt=prompt,
            prompt_token_ids=prompt_token_ids,
            sampling_params=sampling_params,
        )
        self.scheduler.add_seq_group(seq_group)

// === SamplingParams (用户配置) ===
@dataclass
class SamplingParams:
    temperature: float = 1.0          # 0 = greedy
    top_p: float = 1.0               # nucleus sampling
    top_k: int = -1                  # top k
    max_tokens: int = 16             # 最大生成长度
    stop: Union[str, List[str]] = field(default_factory=list)
    stop_token_ids: List[int] = field(default_factory=list)
    presence_penalty: float = 0.0
    frequency_penalty: float = 0.0
    n: int = 1                       # n 个独立 output
    best_of: Optional[int] = None    # beam 模式
    logprobs: Optional[int] = None   # 返回 log 概率
    seed: Optional[int] = None       # 复现

// === Worker (执行层, 1 GPU) ===
class Worker:
    """[WHY-1] 单 GPU 上的模型 + KV cache + PagedAttention"""
    def __init__(self, model_config, parallel_config, ...):
        # 加载模型到 GPU
        self.model = load_model(model_config)
        # KV cache 池
        self.kv_cache = PagedKVCache(
            num_blocks=num_gpu_blocks,
            block_size=16,
        )

    def execute_model(self, scheduler_output) -> ModelOutput:
        """调 1 次 model.forward"""
        # 准备 input (token_ids, positions, attn_metadata)
        input_ids, positions, attn_metadata = self._prepare_inputs(scheduler_output)
        # forward
        hidden_states = self.model(input_ids, positions,
                                    self.kv_cache, attn_metadata)
        # 采样
        next_tokens = self.model.sample(hidden_states, sampling_metadata)
        return ModelOutput(next_tokens=next_tokens)

// ================================================================
// 性能数据 (LLaMA-3 8B, A100 80GB, batch=32, seq=2048):
//
// [generate 端到端]
//   - prefill 2048 token:  ~500ms
//   - decode 1 token:      ~25-50ms
//   - 总 100 token 输出:   ~500ms + 100×30ms = 3.5s
//   - 32 并发:             摊薄到 1 req ~110ms
//
// [吞吐量]
//   - 单卡 (A100 80GB, 8B 模型):
//     - 32 并发, avg 2k seq: ~1200 req/s
//     - 256 并发, avg 4k seq: ~2000 req/s (高并发)
//
// [延迟]
//   - TTFT: 50-500ms (取决于 prompt 长度)
//   - ITL: 20-50ms (decode 1 token)
//   - 总 1k 输出: ~30-50s
//
// [API 限制]
//   - request timeout: 默认无限
//   - max_num_seqs: 256 (默认)
//   - max_model_len: 4096-8192 (默认)
//
// 实战:
//   from vllm import LLM, SamplingParams
//
//   llm = LLM(
//       model="meta-llama/Llama-3-8B-Instruct",
//       tensor_parallel_size=1,
//       gpu_memory_utilization=0.9,
//       max_model_len=4096,
//   )
//
//   params = SamplingParams(
//       temperature=0.7,
//       top_p=0.9,
//       max_tokens=256,
//   )
//
//   # 1. 批量
//   outputs = llm.generate(["Hello", "World"], params)
//
//   # 2. 流式
//   for output in llm.generate(["..."], params, stream=True):
//       print(output.outputs[0].text, end="", flush=True)
//
//   # 3. Chat 模板
//   from vllm import LLM
//   from transformers import AutoTokenizer
//   tok = AutoTokenizer.from_pretrained("meta-llama/Llama-3-8B-Instruct")
//   prompt = tok.apply_chat_template(
//       [{"role": "user", "content": "你好"}],
//       tokenize=False, add_generation_prompt=True)
//   llm.generate([prompt], params)
//
// vllm serve (HTTP server):
//   vllm serve meta-llama/Llama-3-8B-Instruct \
//     --host 0.0.0.0 --port 8000 \
//     --tensor-parallel-size 1 \
//     --enable-prefix-caching
//   # OpenAI 兼容 API: POST /v1/chat/completions
//   # 业务零修改, 直接替换
// ================================================================
