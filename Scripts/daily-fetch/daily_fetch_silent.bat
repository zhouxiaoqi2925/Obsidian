@echo off
cd /d "G:\Obsidian Vault\Scripts\daily-fetch"
"C:\Users\15389\AppData\Local\Programs\Python\Python312\python.exe" daily_fetch.py >> "G:\Obsidian Vault\Scripts\daily-fetch\daily_fetch.log" 2>&1
exit /b 0
