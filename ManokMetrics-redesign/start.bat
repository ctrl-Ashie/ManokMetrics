@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Installing dependencies, this only happens once...
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo Starting ManokMetrics...
call npm.cmd run dev
pause
