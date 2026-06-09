@echo off
chcp 65001 >nul
echo === Enable WakeToRun on DailyTechFetch_Auto ===
powershell -NoProfile -ExecutionPolicy Bypass -File "G:\Obsidian Vault\Scripts\daily-fetch\enable_wake.ps1"
echo.
echo Exit code: %errorlevel%
pause