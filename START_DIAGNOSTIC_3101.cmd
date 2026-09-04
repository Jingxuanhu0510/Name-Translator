@echo off
setlocal
cd /d "%~dp0"
title Mi Zi Grid Diagnostic 3101

set "APP_DIR=%~dp0"
set "NODE_EXE=%APP_DIR%runtime\node.exe"
set "SERVER_JS=%APP_DIR%server_DIAGNOSTIC_3101.js"
set "PID_FILE=%APP_DIR%runtime\mizi-diagnostic-3101.pid"
set "OUT_LOG=%APP_DIR%runtime\diagnostic-3101.out.log"
set "ERR_LOG=%APP_DIR%runtime\diagnostic-3101.err.log"
set "STATUS_URL=http://127.0.0.1:3101/api/recognition-status"
set "APP_URL=http://127.0.0.1:3101/exhibition.html?v=portable-diagnostic-20260806"

echo Mi Zi Grid diagnostic server on port 3101
echo Project: %APP_DIR%
echo.

if not exist "%NODE_EXE%" (
  echo ERROR: runtime\node.exe is missing.
  pause
  exit /b 1
)

if not exist "%SERVER_JS%" (
  echo ERROR: server_DIAGNOSTIC_3101.js is missing.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$busy = Get-NetTCPConnection -LocalPort 3101 -State Listen -ErrorAction SilentlyContinue; if ($busy) { exit 7 } else { exit 0 }" >nul 2>nul
if "%ERRORLEVEL%"=="7" (
  echo ERROR: port 3101 is already in use.
  pause
  exit /b 1
)

echo Starting diagnostic server...
if exist "%OUT_LOG%" del "%OUT_LOG%" >nul 2>nul
if exist "%ERR_LOG%" del "%ERR_LOG%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server_DIAGNOSTIC_3101.js' -WorkingDirectory '%APP_DIR%' -RedirectStandardOutput '%OUT_LOG%' -RedirectStandardError '%ERR_LOG%' -PassThru; $p.Id | Set-Content -Encoding ASCII '%PID_FILE%'"

echo Waiting for diagnostic server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok = $false; for ($i = 0; $i -lt 40; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing '%STATUS_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}; Start-Sleep -Seconds 1 }; if ($ok) { exit 0 } else { exit 1 }" >nul 2>nul
if not "%ERRORLEVEL%"=="0" (
  echo ERROR: diagnostic server did not become ready.
  pause
  exit /b 1
)

echo Diagnostic server is ready.
echo Opening:
echo %APP_URL%
start "" "%APP_URL%"
echo.
echo Keep this diagnostic session running while testing.
pause
