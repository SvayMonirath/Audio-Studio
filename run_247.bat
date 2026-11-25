@echo off
title Audio Studio 24/7 Launcher
echo ========================================================
echo   Launching Audio Studio 24/7 (Server + Cloudflare)
echo ========================================================
echo Starting Server in background window...
start "Audio Studio Server" "%~dp0run_studio.bat"
timeout /t 2 /nobreak >nul

echo Starting Cloudflare Tunnel in background window...
start "Audio Studio Tunnel" "%~dp0run_tunnel.bat"

echo.
echo Both services are now running in separate windows with auto-restart!
echo You can keep them minimized.
