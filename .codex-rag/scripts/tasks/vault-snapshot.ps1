# Daily: regenerate vault health snapshot to _analysis/.
$vault = "G:\Obsidian Vault"
$today = Get-Date -Format "yyyy-MM-dd"
$out = "$vault\_analysis\vault-snapshot-$today.md"

$allMd = Get-ChildItem $vault -Recurse -Filter "*.md" -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notlike "*.obsidian*" -and $_.FullName -notlike "*.git*" -and $_.FullName -notlike "*.codex-rag*" }
$totalMd = $allMd.Count
$totalSize = [math]::Round((($allMd | Measure-Object Length -Sum).Sum / 1MB), 2)

$topDirs = Get-ChildItem $vault -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notin @(".obsidian",".claudian",".claude",".git",".backup-logs",".husky",".codex-rag") }
$dirStats = @()
foreach ($d in $topDirs) {
    $cnt = (Get-ChildItem $d.FullName -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -eq ".md" }).Count
    $dirStats += [pscustomobject]@{ Name = $d.Name; MDCount = $cnt }
}
$dirStats = $dirStats | Sort-Object MDCount -Descending

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("date: $today")
[void]$sb.AppendLine("type: vault-snapshot")
[void]$sb.AppendLine("generated_by: vault-snapshot.ps1 (Codex Desktop 定时任务)")
[void]$sb.AppendLine("tags: [snapshot, vault-health, codex]")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("# Vault Health Snapshot · $today")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> 由 Codex Desktop 每日定时生成。")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## 总览")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| 指标 | 值 |")
[void]$sb.AppendLine("|---|---|")
[void]$sb.AppendLine("| Markdown 文件总数 | **$totalMd** |")
[void]$sb.AppendLine("| 总体积 | **$totalSize MB** |")
[void]$sb.AppendLine("| 顶层目录数 | $($topDirs.Count) |")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## 顶层目录文件分布(按 .md 数量降序)")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("| 目录 | .md 文件数 |")
[void]$sb.AppendLine("|---|---|")
foreach ($d in $dirStats) {
    [void]$sb.AppendLine("| ``$($d.Name)`` | $($d.MDCount) |")
}
[void]$sb.AppendLine("")

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
Write-Host "wrote $out ($totalMd md files, $totalSize MB)"