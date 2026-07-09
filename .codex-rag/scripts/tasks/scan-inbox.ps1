# Daily: scan Inbox/ and emit a triage suggestion file.
$vault = "G:\Obsidian Vault"
$dashDir = "$vault\Dashboard"
if (-not (Test-Path $dashDir)) { New-Item -ItemType Directory -Force -Path $dashDir | Out-Null }
$today = Get-Date -Format "yyyy-MM-dd"
$out = "$dashDir\inbox-triage-$today.md"

$inbox = "$vault\Inbox"
$inboxFiles = Get-ChildItem $inbox -Filter "*.md" -File -ErrorAction SilentlyContinue
$count = $inboxFiles.Count
$recent = $inboxFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 10

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("date: $today")
[void]$sb.AppendLine("type: inbox-triage")
[void]$sb.AppendLine("generated_by: scan-inbox.ps1 (Codex Desktop 定时任务)")
[void]$sb.AppendLine("tags: [triage, inbox, codex, dashboard]")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("# Inbox Triage · $today")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> 由 Codex Desktop 每日定时扫描 `Inbox/` 生成,给主人当整理清单。")
[void]$sb.AppendLine("> **不要**自动移动/删除,主人审过后手动处理。")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## 概览")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- 待整理笔记: **$count** 个")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## 最近 10 个修改")
[void]$sb.AppendLine("")
foreach ($f in $recent) {
    $rel = $f.FullName.Replace($vault, "").TrimStart("\","/")
    [void]$sb.AppendLine("- ``$($f.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))`` ``$rel`` ($($f.Length) B)")
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## 建议")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("1. 阅读上面 10 个最近笔记,判断主题")
[void]$sb.AppendLine("2. 主题已收敛 → 移到 ``Knowledge/`` / ``Projects/`` / ``实战案例/``")
[void]$sb.AppendLine("3. 主题碎片 → 合并到 MOC")
[void]$sb.AppendLine("4. 失效内容 → 重命名到 ``_archive_pending/``(不删,遵守 AGENTS.md)")
[void]$sb.AppendLine("")

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
Write-Host "wrote $out ($count files in Inbox/)"