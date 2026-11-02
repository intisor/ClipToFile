@echo off
title ClipToFile - Clipboard to File Worker for Gemini & AI Web
cd /d "%~dp0"
powershell.exe -Sta -NoProfile -ExecutionPolicy Bypass -File "%~dp0clip-to-file.ps1"
pause
