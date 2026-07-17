$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonScript = Join-Path $scriptDir "daily-knowledge-digest.py"

if (Test-Path "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe") {
    $pythonExe = "G:\Obsidian Vault\.codex-rag\.venv\Scripts\python.exe"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonExe = (Get-Command python).Source
} else {
    throw "python not found"
}

& $pythonExe $pythonScript
if ($LASTEXITCODE -ne 0) {
    throw "daily-knowledge-digest.py failed with exit code $LASTEXITCODE"
}
