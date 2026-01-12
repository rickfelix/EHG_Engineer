# Start EHG Engineer (LEO Protocol Framework) - Windows PowerShell
# This script starts the EHG Engineer dashboard and server

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "🔧 Starting EHG Engineer (LEO Protocol)..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Navigate to EHG Engineer directory
$engineerDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
Push-Location $engineerDir

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the dashboard
Write-Host "✨ Starting EHG Engineer Dashboard on port 3456..." -ForegroundColor Green
Write-Host "📍 Dashboard: http://localhost:3456" -ForegroundColor White
Write-Host "📍 Server: http://localhost:3000" -ForegroundColor White
npm run dashboard

Pop-Location
