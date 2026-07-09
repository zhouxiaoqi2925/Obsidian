# Installs Python deps and creates the venv.
# Run once: powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = "Stop"
$rag = "G:\Obsidian Vault\.codex-rag"
$venv = "$rag\.venv"

Write-Host "== creating venv at $venv ==" -ForegroundColor Cyan
python -m venv "$venv"

Write-Host "`n== upgrading pip ==" -ForegroundColor Cyan
& "$venv\Scripts\python.exe" -m pip install --upgrade pip setuptools wheel

Write-Host "`n== installing chromadb + sentence-transformers ==" -ForegroundColor Cyan
& "$venv\Scripts\python.exe" -m pip install chromadb sentence-transformers

Write-Host "`n== done ==" -ForegroundColor Green
Write-Host "Next: run full index with:"
Write-Host "  & '$venv\Scripts\python.exe' '$rag\scripts\index.py' --full"