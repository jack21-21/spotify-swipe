@echo off
title Spotify Swipe - Playlist Maker
cd /d "%~dp0"

echo ========================================================
echo              SPOTIFY SWIPE - 2026 EDITION               
echo ========================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in your system PATH!
    echo Please install Python 3.9+ from https://python.org
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo Checking dependencies...
python -c "import fastapi, uvicorn, requests, pydantic" >nul 2>&1
if errorlevel 1 (
    echo Installing required packages from requirements.txt...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [Warning] Package install encountered warnings, continuing...
    )
)

echo Starting Spotify Swipe application...
echo Running on http://127.0.0.1:8888
python main.py

if errorlevel 1 (
    echo.
    echo Application stopped. Press any key to exit.
    pause >nul
)
