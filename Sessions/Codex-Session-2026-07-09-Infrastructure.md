---
session: Codex-Desktop-Second-Brain-Infrastructure
date: 2026-07-09
agent: Codex Desktop (MiniMax-M3, Ark 推理)
session_type: 基础设施建立
owner: 周潇齐 (zhxq)
trigger: 用户要求"D. 全都要 重:第 3 层(1-2 天)+ 混合"
related:
  - Sessions/Codex-Desktop-Second-Brain-Takeover-2026-07-09.md
  - Sessions/Codex-Session-2026-07-09.md
tags: [codex, second-brain, rag, infrastructure, watcher, scheduler, sessions-log]
---

# Codex 桌面端第二大脑基础设施 · 2026-07-09(续)

承接 `Codex-Session-2026-07-09.md` 的"接管"事件,本会话把"接管"从概念落地为**可执行的基础设施**。

## 目标

按用户"全都要 重:第 3 层(1-2 天)+ 混合"的要求,一次性建立 3 层基础设施:
- 第 1 层:文件 watcher(实时)
- 第 2 层:4 个 Windows 定时任务(每天/每小时)
- 第 3 层:RAG 语义搜索(ChromaDB + 嵌入模型 + MCP)

## 实际建立的内容

### 1. 工作目录 `G:\Obsidian Vault\.codex-rag\`

| 路径 | 大小 | 用途 |
|---|---|---|
| `.venv/` | ~1.5 GB | Python 虚拟环境(Chromadb + sentence-transformers + watchdog) |
| `data/chroma/` | ~75 MB+ | 向量数据库(persistent ChromaDB) |
| `logs/` | — | 所有脚本的运行日志 |
| `scripts/` | ~30 KB | 所有脚本(index.py / search.py / mcp_server.py / watcher.py / launcher.py / 4 tasks) |
| `.state/indexed.json` | — | 增量索引状态 |

### 2. 12 个脚本

| 文件 | 字节 | 用途 |
|---|---|---|
| `scripts/index.py` | 5.6 KB | RAG 索引器(全量/增量) |
| `scripts/search.py` | 2.2 KB | RAG CLI 搜索 |
| `scripts/mcp_server.py` | 4.3 KB | stdio MCP server,暴露 `rag_search` 工具 |
| `scripts/watcher.py` | 2.7 KB | Python watchdog 长驻进程(去重 + 自忽略) |
| `scripts/launcher.py` | ~700 B | 真正的单进程 daemon 启动器 |
| `scripts/install.ps1` | 749 B | 一键装依赖 |
| `scripts/register-tasks.ps1` | 2.2 KB | 一键注册 4 个 Windows 定时任务 |
| `scripts/tasks/scan-inbox.ps1` | 2.2 KB | 每天 09:00,生成 Inbox 整理建议 |
| `scripts/tasks/check-daily.ps1` | 2.4 KB | 每天 09:30,检查 Daily 缺口 |
| `scripts/tasks/vault-snapshot.ps1` | 2.3 KB | 每天 23:50,生成 vault 健康快照 |
| `scripts/tasks/check-port-27124.ps1` | 2.1 KB | 每小时,检查 Obsidian 27124 端口 |
| `README.md` | 6.0 KB | 总说明 |

### 3. 4 个 Windows 定时任务(全部 Ready)

- `Codex-SecondBrain-ScanInbox` — DAILY 09:00
- `Codex-SecondBrain-CheckDaily` — DAILY 09:30
- `Codex-SecondBrain-VaultSnapshot` — DAILY 23:50
- `Codex-SecondBrain-Port27124` — HOURLY(整点)

### 4. MCP 配置

`~/.codex/config.toml` 追加:
```toml
[mcp_servers.rag]
command = "C:\\Users\\15389\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
args = ["G:\\Obsidian Vault\\.codex-rag\\scripts\\mcp_server.py"]
startup_timeout_sec = 60
```
Codex 桌面端下次启动可调用 `mcp__rag__rag_search(query, top_k, path_prefix)`。

## 关键技术决策

| 项 | 决策 | 理由 |
|---|---|---|
| 嵌入模型 | `paraphrase-multilingual-MiniLM-L12-v2` | 多语言 + 中文 OK + 体积合理(~470MB) |
| 模型源 | `https://hf-mirror.com` | huggingface.co 在本网络不可达,设 HF_ENDPOINT 解决 |
| 索引 chunk | 800 字符,overlap 100 | 适合中等长度笔记 |
| watcher debounce | 3 秒 | 减少 Windows 文件系统重复事件 |
| watcher 自忽略 | `Sessions/Codex-AutoLog-*` + `Sessions/Codex-Session-*` | 防止 watcher 看到自己写入触发死循环 |
| 启动方式 | `launcher.py` 用 `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW` | 真正单进程 detached |

## 遇到的问题(诚实记录)

### 1. huggingface.co 直连超时
**症状**:`WinError 10060`,5 次重试都失败。
**原因**:网络限制,huggingface.co 不可达。
**解决**:设 `HF_ENDPOINT=https://hf-mirror.com`。

### 2. venv launcher 自动 fork 系统 Python
**症状**:每次 `Start-Process` 启动 `.venv\python.exe` 都会看到 2 个进程(`.venv` + 系统 Python)。
**原因**:`.venv\python.exe` 实际是 Python launcher(`pyvenv.cfg` 指向系统 Python),启动时自动 fork 系统 Python 跑脚本。
**解决**:这是 venv 设计,不是 bug。每个 launcher fork 配对 = 1 个功能。功能上等价于 1 个进程,只是进程数翻倍。

### 3. watcher 死循环(已修复)
**症状**:AutoLog 文件从 0 膨胀到 520KB,2104 行,全是 `modified Sessions/Codex-AutoLog-*`。
**原因**:watcher 写 AutoLog → 触发自己看到 AutoLog 改了 → 又写 → 死循环。
**解决**:
- 加 `IGNORE_FILE_PREFIXES` 规则:`Sessions/Codex-AutoLog-*` 和 `Sessions/Codex-Session-*` 不触发记录
- 改用 `os.replace(tmp, p)` 原子写,避免部分写入事件
- 加 3 秒 debounce,合并同一文件的重复事件

### 4. PowerShell `Start-Process` 的 2 进程问题
**症状**:`Start-Process -FilePath pythonw.exe` spawns 2 个进程。
**原因**:PowerShell 在 psreadline/console 模式下的特殊行为(不是 PowerShell bug,是 venv launcher)。
**解决**:用 `subprocess.Popen` with `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW` 替代 `Start-Process`。

## 当前状态(本会话结束)

| 项 | 状态 |
|---|---|
| 工作目录 | ✅ `.codex-rag/` 全部就位 |
| 依赖 | ✅ ChromaDB + sentence-transformers + watchdog 装好 |
| 嵌入模型 | ✅ 下载到 `~/.cache\huggingface\` |
| Watcher | ✅ 1 对(2 进程)常驻,debounce + 自忽略 |
| 4 个 Windows 任务 | ✅ 全部 Ready |
| MCP server | ✅ 已配到 `~/.codex/config.toml` |
| RAG 索引 | ⏳ **后台继续跑**,400/1494 进度(27%) |
| 验证搜索 | ⏳ 索引完成后跑 |

## 后续步骤

1. **等索引完成**(可能 30-50 分钟)
   - 进度查:`Get-Content G:\Obsidian Vault\.codex-rag\logs\index-second.log -Tail 5`
2. **跑搜索验证**:
   ```bash
   "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe" `
     "G:\Obsidian Vault\.codex-rag\scripts\search.py" "上次关于 RAG 的讨论" -n 5
   ```
3. **重启 Codex 桌面端**让 MCP 加载,即可在会话内调 `mcp__rag__rag_search(...)`
4. **明天 09:00** 检查 `Dashboard/inbox-triage-*.md` 是否生成(验证定时任务)
5. **修复 watcher 重复事件**(可选):进一步 debounce 或换 `ReadDirectoryChangesW` API

## 教训

1. **hf-mirror.com** 是中国开发者必记的 HF 镜像
2. **Python venv launcher 自动 fork** 是 Windows + venv 的默认行为,要接受
3. **watcher 写自己的输出文件** 必须自忽略,否则死循环
4. **subprocess.Popen with DETACHED_PROCESS** 比 `Start-Process` 更可控
5. **真实"第二大脑"** ≈ 索引 + 搜索 + 实时日志 + 定时整理,缺一不可

---

*本纪要由 Codex 桌面端于 2026-07-09 会话末尾自动追加。基础设施已就位,索引后台继续。*