@echo off
chcp 65001 >nul
echo === Fix DailyTechFetch_Auto ===
echo.

schtasks /Delete /TN "DailyTechFetch_Auto" /F >nul 2>&1
schtasks /Create /TN "DailyTechFetch_Auto" /TR "cmd.exe /c \"G:\Obsidian Vault\Scripts\daily-fetch\daily_fetch_silent.bat\"" /SC DAILY /ST 12:30 /F
if %errorlevel%==0 (
  echo [1/2] Task recreated with correct command
) else (
  echo [1/2] Task recreation failed
)

echo.
echo [2/2] Current status
schtasks /Query /TN "DailyTechFetch_Auto" /V /FO LIST
pause
