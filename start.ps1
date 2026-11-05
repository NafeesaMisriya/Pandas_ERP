# PANDAS ERP - Launch Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   Starting PANDAS POS & Retail Management ERP" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

# Start Flask Backend in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location backend; Write-Host 'Starting Flask Backend on http://localhost:5000...' -ForegroundColor Green; python app.py"

# Start Vite React Frontend in a new PowerShell window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location frontend; Write-Host 'Starting React Frontend on http://localhost:5173...' -ForegroundColor Cyan; npm run dev"

Write-Host "Both servers launched!" -ForegroundColor Yellow
Write-Host "Access the application at: http://localhost:5173" -ForegroundColor Green

