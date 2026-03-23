@echo off
echo ============================================
echo   PDF-Auszug Web App (Development)
echo ============================================
echo.

cd /d "%~dp0"

echo Starting Backend (Port 8000)...
start "PDF-Auszug Backend" cmd /c "cd /d %~dp0 && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Frontend Dev Server (Port 3000)...
start "PDF-Auszug Frontend" cmd /c "cd /d %~dp0\frontend && npm run dev"

echo.
echo ============================================
echo   Backend:  http://localhost:8000 (auto-reload)
echo   Frontend: http://localhost:3000 (hot-reload)
echo ============================================
echo.
echo Oeffne http://localhost:3000 im Browser
echo.
pause
