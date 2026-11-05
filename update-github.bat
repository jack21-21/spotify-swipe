@echo off
setlocal enabledelayedexpansion
title SpotifySwipe - 1-Click Auto Updater to GitHub

echo ============================================================
echo   SpotifySwipe Auto-Updater to GitHub
echo ============================================================
echo.

:: Ensure Visual Studio Git or standard Git is in PATH
set "GIT_CMD=git"
where git >nul 2>nul
if %errorlevel% neq 0 (
    set "VS_GIT=C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd"
    if exist "!VS_GIT!\git.exe" (
        set "PATH=!VS_GIT!;!PATH!"
    ) else (
        echo [!] Git not found. Please ensure Git is installed.
        pause
        exit /b 1
    )
)

:: Sync mobile files to root
echo [1/4] Syncing mobile files to root...
copy /y "mobile\index.html" "index.html" >nul
copy /y "mobile\style.css" "style.css" >nul
copy /y "mobile\app.js" "app.js" >nul
copy /y "mobile\audio.js" "audio.js" >nul
copy /y "mobile\theme.js" "theme.js" >nul
copy /y "mobile\sw.js" "sw.js" >nul
copy /y "mobile\manifest.json" "manifest.json" >nul
copy /y "mobile\icon-192.png" "icon-192.png" >nul
copy /y "mobile\icon-512.png" "icon-512.png" >nul

:: Stage web files
echo [2/4] Staging updated files...
git add index.html style.css app.js audio.js theme.js sw.js manifest.json icon-192.png icon-512.png README.md .gitignore mobile/

:: Commit changes
echo [3/4] Committing updates...
set "DEFAULT_MSG=Update v1.2.0: Real music audio previews, version badge & PWA sync [%date% %time%]"
set /p "CUSTOM_MSG=Enter commit message (or press Enter for default): "
if "!CUSTOM_MSG!"=="" set "CUSTOM_MSG=!DEFAULT_MSG!"

git commit -m "!CUSTOM_MSG!"

:: Push to GitHub
echo.
echo [4/4] Pushing to GitHub (https://github.com/jack21-21/spotify-swipe)...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo ============================================================
    echo   SUCCESS: Pushed update to GitHub!
    echo.
    echo   Live site: https://jack21-21.github.io/spotify-swipe/
    echo   Look for the green 'v1.2.0' badge at the top left of
    echo   your phone screen to know it is live!
    echo ============================================================
) else (
    echo.
    echo [!] Push failed or cancelled. If this is your first time,
    echo     GitHub may prompt you to sign in with your browser.
)

echo.
pause
