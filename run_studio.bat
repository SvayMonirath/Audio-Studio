@echo off
setlocal
title Audio Studio - Local Server (24/7)

set PORT=8000
set HOST=0.0.0.0

echo ========================================================
echo   Audio Studio - Evaluation & Acoustic Studio (Windows)
echo ========================================================
echo   Port: %PORT%
echo   Host: %HOST%
echo ========================================================

:: Check if python is available
where python >nul 2>nul
if %errorlevel% neq 0 (
    where py >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] Python not found in PATH!
        echo Please install Python 3.10+ from python.org and check "Add python.exe to PATH".
        pause
        exit /b 1
    ) else (
        set PY_CMD=py -3
    )
) else (
    set PY_CMD=python
)

:loop
echo [%date% %time%] Starting Audio Studio server...
%PY_CMD% run_server.py --port %PORT% --host %HOST%
echo [%date% %time%] Server stopped or crashed. Restarting in 3 seconds... (Press Ctrl+C to stop)
timeout /t 3 /nobreak >nul
goto loop
