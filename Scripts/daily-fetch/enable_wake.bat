@echo off
chcp 65001 >nul
echo === 启用 DailyTechFetch_Auto 唤醒设置 ===

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = New-Object -ComObject Schedule.Service; $s.Connect(); $t = $s.GetFolder('\').GetTask('DailyTechFetch_Auto'); $t.Settings.WakeToRun = $true; $t.Settings.StartWhenAvailable = $true; $null = $s.GetFolder('\').RegisterTaskDefinition('DailyTechFetch_Auto', $t, 6, $null, $null, 3, $null); Write-Host 'WakeToRun=True, StartWhenAvailable=True' -ForegroundColor Green"

echo.
echo === 当前设置 ===
schtasks /Query /TN "DailyTechFetch_Auto" /V /FO LIST 2>nul | findstr /C:"下次运行时间" /C:"状态" /C:"唤醒"

pause