# Register 4 Windows Scheduled Tasks for Codex Desktop 第二大脑.
# Run once as the user (no admin needed for per-user tasks).
$ErrorActionPreference = "Stop"
$vault = "G:\Obsidian Vault"
$rag = "$vault\.codex-rag"
$tasksDir = "$rag\scripts\tasks"
$pythonExe = (Get-Command python).Source

function Register-CodexTask {
    param(
        [string]$Name,
        [string]$Script,
        [string]$Schedule,    # e.g. "DAILY", "HOURLY"
        [string]$StartTime    # e.g. "09:00"
    )
    $full = "Codex-SecondBrain-$Name"
    $exists = Get-ScheduledTask -TaskName $full -ErrorAction SilentlyContinue
    if ($exists) {
        Unregister-ScheduledTask -TaskName $full -Confirm:$false
        Write-Host "  removed existing $full"
    }
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`"" -WorkingDirectory $vault
    $trigger = switch ($Schedule) {
        "DAILY"  { New-ScheduledTaskTrigger -Daily -At $StartTime }
        "HOURLY" { New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650) }
        default  { throw "unknown schedule: $Schedule" }
    }
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $full -Action $action -Trigger $trigger -Settings $settings -Description "Codex Desktop 第二大脑: $Name" | Out-Null
    Write-Host "  ✅ registered $full ($Schedule $StartTime)"
}

Write-Host "== registering 4 Codex tasks ==" -ForegroundColor Cyan
Register-CodexTask -Name "ScanInbox"       -Script "$tasksDir\scan-inbox.ps1"       -Schedule "DAILY"  -StartTime "09:00"
Register-CodexTask -Name "CheckDaily"      -Script "$tasksDir\check-daily.ps1"      -Schedule "DAILY"  -StartTime "09:30"
Register-CodexTask -Name "VaultSnapshot"   -Script "$tasksDir\vault-snapshot.ps1"   -Schedule "DAILY"  -StartTime "23:50"
Register-CodexTask -Name "Port27124"       -Script "$tasksDir\check-port-27124.ps1" -Schedule "HOURLY" -StartTime "00:00"

Write-Host "`n== verify ==" -ForegroundColor Cyan
Get-ScheduledTask | Where-Object { $_.TaskName -like "Codex-SecondBrain-*" } | Format-Table TaskName, State -AutoSize