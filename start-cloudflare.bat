@echo off
cd /d "%~dp0"
cloudflared tunnel --url http://127.0.0.1:5173
pause
