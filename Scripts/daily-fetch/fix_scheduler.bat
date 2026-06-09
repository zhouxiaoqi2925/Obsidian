@echo off
chcp 65001 >nul
echo === 修复 DailyTechFetch_Auto 定时任务 ===
echo.

schtasks /Change /TN "DailyTechFetch_Auto" /ST 12:30
if %errorlevel%==0 (echo [1/3] 时间已改为 12:30) else (echo [1/3] 时间修改失败)

echo.
echo [2/3] 启用唤醒计算机运行 (PowerShell)...
powershell -NoProfile -Command "$s = New-Object -ComObject Schedule.Service; $s.Connect(); $t = $s.GetFolder('\').GetTask('DailyTechFetch_Auto'); $t.Settings.WakeToRun = $true; $t.Settings.StartWhenAvailable = $true; $folder = $s.GetFolder('\'); $folder.RegisterTaskDefinition('DailyTechFetch_Auto', $t, 6, $null, $null, 3, $null) | Out-Null; echo '  OK: WakeToRun=True, StartWhenAvailable=True'"
if %errorlevel%==0 (echo [2/3] 唤醒已启用) else (echo [2/3] 唤醒设置失败)

echo.
echo [3/3] 当前状态:
schtasks /Query /TN "DailyTechFetch_Auto" /V /FO LIST 2>nul | findstr /C:"下次运行时间" /C:"状态" /C:"计划类型" /C:"登录" /C:"唤醒"

echo.
echo === 完成 ===
pause
