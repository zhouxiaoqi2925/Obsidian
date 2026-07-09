# Run by Task Scheduler: full index
$env:HF_ENDPOINT = "https://hf-mirror.com"
& "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe" "G:\Obsidian Vault\.codex-rag\scripts\index.py" --full 2>&1 | Tee-Object "G:\Obsidian Vault\.codex-rag\logs\index-task.log"