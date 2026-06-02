@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ==================== Config ====================
set "VAULT_DIR=G:\Obsidian Vault"
set "BRANCH=main"
set "LOG_DIR=%VAULT_DIR%\.backup-logs"
set "MAX_LOG=30"
:: ===============================================

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "LOG_FILE=%LOG_DIR%\backup-%date:~0,4%%date:~5,2%%date:~8,2%.log"
set "START_TIME=%time%"
set "DATE_STAMP=%date% %time:~0,8%"

echo ==================================== >> "%LOG_FILE%"
echo  Obsidian Vault Auto Backup >>       "%LOG_FILE%"
echo  %DATE_STAMP% >>                      "%LOG_FILE%"
echo ==================================== >> "%LOG_FILE%"

echo [INFO] Start: %DATE_STAMP%

cd /d "%VAULT_DIR%"
if %errorlevel% neq 0 (
    echo [ERROR] Cannot cd to %VAULT_DIR% >> "%LOG_FILE%"
    echo [ERROR] Cannot cd to %VAULT_DIR%
    goto :end
)

:: --- Check Git ---
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git not found >>          "%LOG_FILE%"
    echo [ERROR] Git not found
    goto :end
)

:: --- Check if already a git repo ---
if not exist ".git" (
    echo [WARN] Not a git repo, init... >> "%LOG_FILE%"
    git init -b %BRANCH%
    if %errorlevel% neq 0 goto :end
    if not exist ".gitignore" (
        echo .obsidian/workspace.json>.gitignore
        echo .obsidian/cache/>>.gitignore
        echo .obsidian/plugins/*/data.json>>.gitignore
        echo .trash/>>.gitignore
        echo *.swp>>.gitignore
        echo *.log>>.gitignore
    )
)

:: --- Add changes ---
git add -A
if %errorlevel% neq 0 (
    echo [ERROR] git add failed >>         "%LOG_FILE%"
    goto :end
)

:: --- Check for changes ---
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo [INFO] No changes to backup. >>   "%LOG_FILE%"
    echo [INFO] No changes.
    goto :end
)

:: --- Commit ---
set "commit_msg=auto: backup %date:~0,4%-%date:~5,2%-%date:~8,2% %time:~0,2%%time:~3,2%%time:~6,2%"
git commit -m "!commit_msg!" >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] git commit failed >>      "%LOG_FILE%"
    goto :end
)
echo [INFO] Commit created: !commit_msg! >> "%LOG_FILE%"
echo [INFO] Commit created.

:: --- Push with retries ---
set "PUSH_OK=0"
set "RETRY=0"
:push_retry
git push origin %BRANCH% >> "%LOG_FILE%" 2>&1
if %errorlevel% equ 0 (
    set "PUSH_OK=1"
    goto :push_done
)
set /a RETRY+=1
if !RETRY! lss 3 (
    echo [WARN] Push failed, retry !RETRY!/3 in 10s... >> "%LOG_FILE%"
    timeout /t 10 /nobreak >nul
    goto :push_retry
)
:push_done
if "%PUSH_OK%"=="1" (
    echo [SUCCESS] Pushed to origin/%BRANCH%. >> "%LOG_FILE%"
    echo [SUCCESS] Backup completed and pushed.
) else (
    echo [WARN] Push failed after 3 retries. Local commit saved. >> "%LOG_FILE%"
    echo [WARN] Push failed. Local commit saved, will retry next run.
)

:end
set "END_TIME=%time%"
echo [INFO] Done: %END_TIME% >>            "%LOG_FILE%"
echo ==================================== >> "%LOG_FILE%"
echo. >>                                  "%LOG_FILE%"

:: --- Cleanup old logs ---
for /f "skip=%MAX_LOG% delims=" %%F in ('dir /b /o-n "%LOG_DIR%\backup-*.log" 2^>nul') do (
    del /q "%LOG_DIR%\%%F" >nul 2>&1
)

exit /b 0
