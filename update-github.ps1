# SpotifySwipe - 1-Click Auto-Updater to GitHub (PowerShell)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SpotifySwipe Auto-Updater to GitHub" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$gitPath = 'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    if (Test-Path "$gitPath\git.exe") {
        $env:Path = "$gitPath;" + $env:Path
    } else {
        Write-Host "[!] Git executable not found." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host "[1/4] Syncing mobile files to root..." -ForegroundColor Yellow
Copy-Item "mobile\index.html", "mobile\style.css", "mobile\app.js", "mobile\audio.js", "mobile\theme.js", "mobile\sw.js", "mobile\manifest.json", "mobile\icon-192.png", "mobile\icon-512.png" -Destination "." -Force

Write-Host "[2/4] Staging updated web files..." -ForegroundColor Yellow
git add index.html style.css app.js audio.js theme.js sw.js manifest.json icon-192.png icon-512.png README.md .gitignore mobile/

Write-Host "[3/4] Committing updates..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$defaultMsg = "Update v1.2.0: Real music audio, version badge & PWA sync [$timestamp]"
$userMsg = Read-Host "Enter commit message (or press Enter for default)"
if ([string]::IsNullOrWhiteSpace($userMsg)) {
    $commitMsg = $defaultMsg
} else {
    $commitMsg = $userMsg
}

git commit -m $commitMsg

Write-Host ""
Write-Host "[4/4] Pushing to GitHub (https://github.com/jack21-21/spotify-swipe)..." -ForegroundColor Yellow
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  SUCCESS: Pushed update to GitHub!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Live site: https://jack21-21.github.io/spotify-swipe/" -ForegroundColor Cyan
    Write-Host "  Look for the green 'v1.2.0' badge at the top left of" -ForegroundColor White
    Write-Host "  your phone screen to know it is live!" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[!] Push completed with warnings or prompt." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to exit"
