# Hourly: check if Obsidian Local REST API is listening on 27124.
$vault = "G:\Obsidian Vault"
$today = Get-Date -Format "yyyy-MM-dd"
$logFile = "$vault\.codex-rag\logs\port-27124.log"
$dash = "$vault\Dashboard\port-27124-$today.md"
$port = 27124
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
$obs = Get-Process -Name "Obsidian" -ErrorAction SilentlyContinue

$status = if ($listener) { "UP" } else { "DOWN" }
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$line = "[$ts] port $port : $status (obsidian.exe count: $($obs.Count))"
Add-Content -Path $logFile -Value $line -Encoding UTF8

# only write dashboard file on DOWN transitions
$prevStatusFile = "$vault\.codex-rag\.state\port-27124-prev.txt"
$prev = if (Test-Path $prevStatusFile) { Get-Content $prevStatusFile } else { "" }
if ($status -ne $prev) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("---")
    [void]$sb.AppendLine("date: $today")
    [void]$sb.AppendLine("type: port-check")
    [void]$sb.AppendLine("status: $status")
    [void]$sb.AppendLine("---")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("# Obsidian 27124 端口状态变更 · $ts")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("- 状态: **$status**")
    [void]$sb.AppendLine("- Obsidian.exe 进程数: $($obs.Count)")
    [void]$sb.AppendLine("- 上次状态: $prev")
    [void]$sb.AppendLine("")
    if ($status -eq "DOWN" -and $obs.Count -gt 0) {
        [void]$sb.AppendLine("> **⚠️ Obsidian 在跑但 27124 没监听 —— 可能是 zombie renderer 进程占着端口**")
        [void]$sb.AppendLine("> 修复方法:任务管理器 → 结束所有 Obsidian.exe → 等 5 秒 → 重新打开")
        [void]$sb.AppendLine("> 详见:`Obsidian MCP 端口 27124 修复记录.md`")
    }
    [void]$sb.AppendLine("")
    [System.IO.File]::WriteAllText($dash, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
    Set-Content -Path $prevStatusFile -Value $status
    Write-Host "STATE CHANGE: $prev → $status, wrote $dash"
} else {
    Write-Host "no change: $status"
}