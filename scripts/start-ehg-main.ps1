# Start Main EHG Application - Windows PowerShell
# This script starts the primary EHG application on port 8080

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "🚀 Starting Main EHG Application..." -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Navigate to EHG directory
$ehgDir = "C:\Users\rickf\Projects\_EHG\ehg"
Push-Location $ehgDir

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the development server on port 8080
Write-Host "✨ Starting EHG on port 8080..." -ForegroundColor Green
Write-Host "📍 Access at: http://localhost:8080" -ForegroundColor White
npm run dev -- --port 8080

Pop-Location
