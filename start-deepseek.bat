@echo off
title DeepSeek 笔记生成器
cd /d G:\Obsidian Vault\.obsidian\plugins\deepseek-gen
echo.
echo ================================
echo   DeepSeek 笔记生成器
echo ================================
echo.
echo 启动服务: http://localhost:3847
start http://localhost:3847
python3 -m http.server 3847
