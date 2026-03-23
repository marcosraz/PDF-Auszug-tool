@echo off
echo Installing PDF-Auszug as Windows Service...
echo.
echo Prerequisites: Download NSSM from https://nssm.cc/
echo   or Servy from https://github.com/aelassas/servy
echo.
echo Make sure nssm.exe is on your PATH or in this directory.
echo.

REM Create logs directory
mkdir "%~dp0..\logs" 2>nul

REM --- Backend Service ---
echo Installing Backend service...
nssm install "PDF-Auszug-Backend" python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
nssm set "PDF-Auszug-Backend" AppDirectory "%~dp0.."
nssm set "PDF-Auszug-Backend" AppStdout "%~dp0..\logs\backend.log"
nssm set "PDF-Auszug-Backend" AppStderr "%~dp0..\logs\backend-error.log"
nssm set "PDF-Auszug-Backend" AppRotateFiles 1
nssm set "PDF-Auszug-Backend" AppRotateBytes 5242880

REM --- Frontend Service ---
echo Installing Frontend service...
nssm install "PDF-Auszug-Frontend" cmd /c "cd /d %~dp0..\frontend && npm start"
nssm set "PDF-Auszug-Frontend" AppDirectory "%~dp0..\frontend"
nssm set "PDF-Auszug-Frontend" AppStdout "%~dp0..\logs\frontend.log"
nssm set "PDF-Auszug-Frontend" AppStderr "%~dp0..\logs\frontend-error.log"
nssm set "PDF-Auszug-Frontend" AppRotateFiles 1
nssm set "PDF-Auszug-Frontend" AppRotateBytes 5242880

echo.
echo Services installed. Start with:
echo   nssm start PDF-Auszug-Backend
echo   nssm start PDF-Auszug-Frontend
echo.
echo To check status:
echo   nssm status PDF-Auszug-Backend
echo   nssm status PDF-Auszug-Frontend
echo.
echo To remove:
echo   nssm remove PDF-Auszug-Backend confirm
echo   nssm remove PDF-Auszug-Frontend confirm
