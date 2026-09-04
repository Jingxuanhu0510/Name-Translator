@echo off
setlocal
cd /d "%~dp0"
title Name Translator Launcher

set "APP_DIR=%~dp0"
set "NODE_EXE=%APP_DIR%runtime\node.exe"
set "SERVER_JS=%APP_DIR%server_PORTABLE_3101.js"
set "PID_FILE=%APP_DIR%runtime\mizi-portable-3101.pid"
set "OUT_LOG=%APP_DIR%runtime\portable-server.log"
set "ERR_LOG=%APP_DIR%runtime\portable-server-error.log"
set "STATUS_URL=http://127.0.0.1:3101/api/recognition-status"
set "APP_URL=http://127.0.0.1:3101/exhibition.html?v=portable-release-20260806"

echo Name Translator private portable launcher
echo Project: %APP_DIR%
echo.

if not exist "%NODE_EXE%" (
  echo ERROR: portable Node runtime is missing:
  echo %NODE_EXE%
  echo.
  pause
  exit /b 1
)

if not exist "%SERVER_JS%" (
  echo ERROR: server_PORTABLE_3101.js is missing.
  echo.
  pause
  exit /b 1
)

if not exist "%APP_DIR%outputs\exhibition.html" (
  echo ERROR: outputs\exhibition.html is missing.
  echo.
  pause
  exit /b 1
)

if not exist "%APP_DIR%node_modules" (
  echo ERROR: node_modules is missing. This package is incomplete.
  echo.
  pause
  exit /b 1
)

if not exist "%APP_DIR%.env" (
  echo ERROR: .env is missing. This private package should already include it.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%STATUS_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 2 } } catch { exit 1 }" >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  echo Name Translator server is already running. Opening page...
  start "" "%APP_URL%"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$busy = Get-NetTCPConnection -LocalPort 3101 -State Listen -ErrorAction SilentlyContinue; if ($busy) { exit 7 } else { exit 0 }" >nul 2>nul
if "%ERRORLEVEL%"=="7" (
  echo ERROR: port 3101 is already used by another program.
  echo Close the other program, or run STOP_Mi_Zi_Grid.cmd if it is this project.
  echo.
  pause
  exit /b 1
)

echo Starting Name Translator server with portable Node...
if exist "%OUT_LOG%" del "%OUT_LOG%" >nul 2>nul
if exist "%ERR_LOG%" del "%ERR_LOG%" >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server_PORTABLE_3101.js' -WorkingDirectory '%APP_DIR%' -RedirectStandardOutput '%OUT_LOG%' -RedirectStandardError '%ERR_LOG%' -PassThru; $p.Id | Set-Content -Encoding ASCII '%PID_FILE%'"

echo Waiting for server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok = $false; for ($i = 0; $i -lt 40; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing '%STATUS_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}; Start-Sleep -Seconds 1 }; if ($ok) { exit 0 } else { exit 1 }" >nul 2>nul
if not "%ERRORLEVEL%"=="0" goto SERVER_FAILED
echo Server is ready. Opening exhibition page...
start "" "%APP_URL%"
exit /b 0

:SERVER_FAILED
echo ERROR: server did not become ready.
echo Check runtime\portable-server.log and runtime\portable-server-error.log.
echo.
pause
exit /b 1
