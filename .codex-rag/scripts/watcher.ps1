# Long-running vault watcher.
# Detects .md create/change/delete and appends a line to
# G:\Obsidian Vault\Sessions\Codex-AutoLog-YYYY-MM-DD.md
# Start: Start-Process powershell -WindowStyle Hidden -ArgumentList "-File","watcher.ps1"
$ErrorActionPreference = "Stop"
$vault = "G:\Obsidian Vault"
$logDir = "$vault\Sessions"
$ragLog = "$vault\.codex-rag\logs\watcher.log"
$ignore = @(".obsidian",".git",".codex-rag",".claudian",".claude",".backup-logs")

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Add-Content -Path $ragLog -Value $line -Encoding UTF8
    Write-Host $line
}

function Append-Session($rel, $kind) {
    $today = Get-Date -Format "yyyy-MM-dd"
    $f = "$logDir\Codex-AutoLog-$today.md"
    if (-not (Test-Path $f)) {
        $header = @"
---
date: $today
type: auto-log
generated_by: FileSystemWatcher (Codex Desktop 第二大脑)
tags: [auto-log, watcher, codex]
---

# Codex AutoLog · $today

> 由 .codex-rag\watcher.ps1 自动写入,记录 vault 文件变更。
> 每次启动 Codex 桌面端会话,先 rg 找本文件,看主人最近动了什么。

---

"@
        $utf8 = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($f, $header, $utf8)
    }
    $time = Get-Date -Format "HH:mm:ss"
    $entry = "- ``$time`` **$kind** → ``$rel``"
    Add-Content -Path $f -Value $entry -Encoding UTF8
}

Log "== watcher starting =="
$fsw = New-Object System.IO.FileSystemWatcher
$fsw.Path = $vault
$fsw.IncludeSubdirectories = $true
$fsw.Filter = "*.md"
$fsw.NotifyFilter = [System.IO.NotifyFilters]::FileName, `
                    [System.IO.NotifyFilters]::LastWrite, `
                    [System.IO.NotifyFilters]::Size

$action = {
    $path = $Event.SourceEventArgs.FullPath
    $change = $Event.SourceEventArgs.ChangeType
    $rel = $path.Replace($vault, "").TrimStart("\","/")
    $skip = $false
    foreach ($ig in $ignore) { if ($rel -like "$ig*") { $skip = $true; break } }
    if ($skip) { return }
    # debounce: use a short sleep
    Start-Sleep -Milliseconds 200
    try {
        Append-Session $rel $change.ToString()
    } catch {
        Log "ERR writing log: $_"
    }
}

Register-ObjectEvent -InputObject $fsw -EventName Changed -Action $action | Out-Null
Register-ObjectEvent -InputObject $fsw -EventName Created -Action $action | Out-Null
Register-ObjectEvent -InputObject $fsw -EventName Deleted -Action $action | Out-Null
Register-ObjectEvent -InputObject $fsw -EventName Renamed -Action $action | Out-Null

Log "watcher active on $vault"
while ($true) { Start-Sleep -Seconds 30 }