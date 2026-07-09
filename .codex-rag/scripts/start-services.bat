@echo off
:: Start watcher
start "Codex Watcher" /MIN "G:\Obsidian Vault\.codex-rag\.venv\Scripts\pythonw.exe" "G:\Obsidian Vault\.codex-rag\scripts\watcher.py"

:: Start indexer (in background, full rebuild)
set HF_ENDPOINT=https://hf-mirror.com
"G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe" "G:\Obsidian Vault\.codex-rag\scripts\index.py" --full > "G:\Obsidian Vault\.codex-rag\logs\index-bg.log" 2>&1