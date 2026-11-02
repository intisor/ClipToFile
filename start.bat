@echo off
title ClipAI Worker & AI Hub
cd /d "%~dp0"
echo ========================================================
echo Starting ClipAI Worker (Clipboard to File & AI Hub)...
echo ========================================================
echo.
node server.js
pause
