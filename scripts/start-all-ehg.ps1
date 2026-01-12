# Start All EHG Applications - Windows PowerShell
# This script starts both the main EHG application and EHG Engineer

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host "🚀 Starting All EHG Applications..." -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if port is in use
function Test-PortInUse {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

$engineerDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
$ehgDir = "C:\Users\rickf\Projects\_EHG\ehg"

# Start EHG Engineer Dashboard in background
Write-Host "1️⃣ Starting EHG Engineer Dashboard..." -ForegroundColor Blue
if (Test-PortInUse -Port 3456) {
    Write-Host "   ⚠️  Port 3456 already in use (EHG Engineer Dashboard may be running)" -ForegroundColor Yellow
} else {
    Push-Location $engineerDir
    if (-not (Test-Path "node_modules")) {
        Write-Host "   📦 Installing EHG Engineer dependencies..." -ForegroundColor Yellow
        npm install
    }
    Start-Process -FilePath "npm" -ArgumentList "run", "dashboard" -WorkingDirectory $engineerDir -WindowStyle Minimized
    Write-Host "   ✅ EHG Engineer Dashboard started on port 3456" -ForegroundColor Green
    Pop-Location
}

# Wait a moment
Start-Sleep -Seconds 2

# Start Main EHG Application
Write-Host ""
Write-Host "2️⃣ Starting Main EHG Application..." -ForegroundColor Blue
if (Test-PortInUse -Port 8080) {
    Write-Host "   ⚠️  Port 8080 already in use (Main EHG may be running)" -ForegroundColor Yellow
} else {
    Push-Location $ehgDir
    if (-not (Test-Path "node_modules")) {
        Write-Host "   📦 Installing Main EHG dependencies..." -ForegroundColor Yellow
        npm install
    }
    Write-Host "   ✅ Starting Main EHG on port 8080" -ForegroundColor Green
    Start-Process -FilePath "npm" -ArgumentList "run", "dev", "--", "--port", "8080" -WorkingDirectory $ehgDir -WindowStyle Minimized
    Pop-Location
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "🎉 All EHG Applications Started!" -ForegroundColor Green
Write-Host ""
Write-Host "📍 Main EHG Application: http://localhost:8080" -ForegroundColor White
Write-Host "📍 EHG Engineer Dashboard: http://localhost:3456" -ForegroundColor White
Write-Host "📍 EHG Engineer Server: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Use .\scripts\leo-stack.ps1 stop to stop all applications" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Cyan
