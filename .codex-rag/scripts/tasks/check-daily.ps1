# Daily: check which daily notes are missing.
$vault = "G:\Obsidian Vault"
$dailyDir = "$vault\Daily"
if (-not (Test-Path $dailyDir)) {
    Write-Host "no Daily/ directory, skipping"
    exit 0
}
$today = Get-Date
$todayStr = $today.ToString("yyyy-MM-dd")
$out = "$vault\Dashboard\daily-gaps-$todayStr.md"

# scan from 2026-05-30 (first known daily) to today
$start = Get-Date "2026-05-30"
$days = @()
$d = $start
while ($d -le $today) {
    $name = $d.ToString("yyyy-MM-dd") + ".md"
    $f = Join-Path $dailyDir $name
    $days += [pscustomobject]@{ Date = $d.ToString("yyyy-MM-dd"); Present = Test-Path $f; Size = if (Test-Path $f) { (Get-Item $f).Length } else { 0 } }
    $d = $d.AddDays(1)
}
$missing = $days | Where-Object { -not $_.Present }
$presentCount = ($days | Where-Object { $_.Present }).Count
$totalDays = $days.Count

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("date: $todayStr")
[void]$sb.AppendLine("type: daily-gap-check")
[void]$sb.AppendLine("generated_by: check-daily.ps1")
[void]$sb.AppendLine("tags: [daily, gap-check, codex, dashboard]")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("# Daily 日记缺口检查 · $todayStr")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> 由 Codex Desktop 每日定时扫描 `Daily/` 生成。")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("## 概览")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- 期望天数(2026-05-30 → 今天): **$totalDays**")
[void]$sb.AppendLine("- 实际有: **$presentCount**")
[void]$sb.AppendLine("- 缺口: **$($missing.Count)**")
[void]$sb.AppendLine("")
if ($missing.Count -gt 0) {
    [void]$sb.AppendLine("## 缺哪几天")
    [void]$sb.AppendLine("")
    foreach ($m in $missing) {
        [void]$sb.AppendLine("- ``$($m.Date)``")
    }
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("## 建议")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("补不齐也没关系(Daily 不是必须每天写),但缺口超过 14 天可以考虑:")
    [void]$sb.AppendLine("- 重要的几天补:做了非平凡决定 / 学到东西 / 开了新项目")
    [void]$sb.AppendLine("- 不重要的就跳过,不要为了完整性硬写")
}
[void]$sb.AppendLine("")

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
Write-Host "wrote $out ($($missing.Count) gaps out of $totalDays days)"