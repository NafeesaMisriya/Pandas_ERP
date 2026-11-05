@echo off
echo ========================================================
echo    Starting PANDAS POS & Retail Management ERP
echo ========================================================
echo.
echo 1. Starting Flask Backend on http://localhost:5000...
start "PANDAS - Flask Backend" cmd /k "cd backend && python app.py"

echo 2. Starting Vite React Frontend on http://localhost:5173...
start "PANDAS - React Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================================
echo Both servers have been launched in separate terminals!
echo Open your browser at: http://localhost:5173
echo ========================================================

