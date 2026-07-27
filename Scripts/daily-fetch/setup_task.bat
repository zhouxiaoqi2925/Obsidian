@echo off
chcp 65001 >nul
schtasks /Delete /TN "DailyTechFetch_Auto" /F >nul 2>&1
schtasks /Create /TN "DailyTechFetch_Auto" /TR "cmd.exe /c \"G:\Obsidian Vault\Scripts\daily-fetch\daily_fetch_silent.bat\"" /SC DAILY /ST 10:00 /F
if %errorlevel%==0 (echo TASK_OK) else (echo TASK_FAIL)
echo ---
schtasks /Query /TN "DailyTechFetch_Auto" /V /FO LIST
pause
