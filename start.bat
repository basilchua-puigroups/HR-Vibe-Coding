@echo off
cd /d "%~dp0"
echo Starting Mill Parts System...
echo.
echo Once the server starts, open your browser to:
echo   http://localhost:5174/
echo.
echo Press Ctrl+C to stop the server.
echo.
npm run dev
pause
