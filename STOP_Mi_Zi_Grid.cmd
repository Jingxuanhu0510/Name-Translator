@echo off
setlocal
cd /d "%~dp0"
title Stop Name Translator

set "PID_FILE=%~dp0runtime\mizi-portable-3101.pid"

if not exist "%PID_FILE%" (
  echo Name Translator is not currently running, or no PID file was found.
  echo.
  pause
  exit /b 0
)

set /p PID=<"%PID_FILE%"
if "%PID%"=="" (
  del "%PID_FILE%" >nul 2>nul
  echo Empty PID file removed.
  echo.
  pause
  exit /b 0
)

echo Stopping Name Translator server window, PID %PID%...
taskkill /PID %PID% /T /F >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  del "%PID_FILE%" >nul 2>nul
  echo Name Translator stopped.
) else (
  del "%PID_FILE%" >nul 2>nul
  echo Name Translator was not running, or it was already closed.
)
echo.
pause
