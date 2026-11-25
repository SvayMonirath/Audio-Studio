@echo off
setlocal
title Audio Studio - Cloudflare Tunnel (24/7)

set PORT=8000

echo ========================================================
echo   Audio Studio - Cloudflare Tunnel Hosting (Windows)
echo ========================================================

:: Check if cloudflared is installed or present in current folder
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    if not exist "%~dp0cloudflared.exe" (
        echo [INFO] cloudflared.exe not found. Downloading latest Windows release...
        powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"
        if not exist "%~dp0cloudflared.exe" (
            echo [ERROR] Failed to download cloudflared.exe. Please download it manually from:
            echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
            pause
            exit /b 1
        )
        echo [SUCCESS] Downloaded cloudflared.exe successfully!
    )
    set CLOUDFLARED_BIN=%~dp0cloudflared.exe
) else (
    set CLOUDFLARED_BIN=cloudflared
)

:loop
echo [%date% %time%] Starting Cloudflare tunnel on port %PORT%...
echo Tunnel URL will appear below (look for the .trycloudflare.com link):
echo --------------------------------------------------------
"%CLOUDFLARED_BIN%" tunnel --url http://127.0.0.1:%PORT%
echo [%date% %time%] Tunnel disconnected. Reconnecting in 3 seconds... (Press Ctrl+C to stop)
timeout /t 3 /nobreak >nul
goto loop
