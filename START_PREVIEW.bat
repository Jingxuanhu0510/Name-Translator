@echo off
setlocal
cd /d "%~dp0"
title Name Translator Preview

if not exist ".env" (
  echo Missing .env
  echo Copy .env.example to .env and add your Gemini API key first.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Missing node_modules
  echo Run npm install before using START_PREVIEW.bat.
  echo.
  pause
  exit /b 1
)

echo Starting Name Translator preview...
echo Open page: http://127.0.0.1:3101/exhibition.html
echo.

start "" /b cmd /c "set PORT=3101&& node server.js"

set "READY_URL=http://127.0.0.1:3101/api/recognition-status"
set "PAGE_URL=http://127.0.0.1:3101/exhibition.html"

for /l %%i in (1,1,40) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%READY_URL%' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"
  if not errorlevel 1 (
    start "" "%PAGE_URL%"
    echo Preview started. Keep this window open while using the project.
    echo Press Ctrl+C to stop the server.
    echo.
    goto wait_forever
  )
  timeout /t 1 /nobreak >nul
)

echo Server did not become ready.
echo Check whether port 3101 is already in use or npm install failed.
pause
exit /b 1

:wait_forever
pause
