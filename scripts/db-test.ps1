# Test Supabase database connectivity (Windows PowerShell)
# Note: Requires psql to be in PATH (install PostgreSQL or just psql client)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

Write-Host "=== Testing Supabase Database Connectivity ===" -ForegroundColor Cyan
Write-Host ""

$envFile = Join-Path $PSScriptRoot "..\.env"

# Load .env file
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
} else {
    Write-Host "Error: .env file not found at $envFile" -ForegroundColor Red
    exit 1
}

if (-not $env:SUPABASE_POOLER_URL) {
    Write-Host "Error: SUPABASE_POOLER_URL not set" -ForegroundColor Red
    exit 1
}

# Check if psql is available
if (-not (Get-Command "psql" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: psql not found in PATH" -ForegroundColor Red
    Write-Host "Install PostgreSQL or use Node.js alternative: node scripts/db-test.js" -ForegroundColor Yellow
    exit 1
}

# Test 1: Basic connection
Write-Host "1. Testing basic connection..." -ForegroundColor White
$result = & psql $env:SUPABASE_POOLER_URL -c "SELECT version();" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Connection successful" -ForegroundColor Green
} else {
    Write-Host "   ❌ Connection failed" -ForegroundColor Red
    exit 1
}

# Test 2: Table access
Write-Host "2. Testing table access..." -ForegroundColor White
$tables = & psql $env:SUPABASE_POOLER_URL -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
Write-Host "   Found $($tables.Trim()) public tables" -ForegroundColor White

# Test 3: Backlog data
Write-Host "3. Testing backlog data..." -ForegroundColor White
$sdCount = & psql $env:SUPABASE_POOLER_URL -t -c "SELECT COUNT(*) FROM strategic_directives_v2;"
$backlogCount = & psql $env:SUPABASE_POOLER_URL -t -c "SELECT COUNT(*) FROM sd_backlog_map;"
Write-Host "   Strategic Directives: $($sdCount.Trim())" -ForegroundColor White
Write-Host "   Backlog Items: $($backlogCount.Trim())" -ForegroundColor White

# Test 4: Gap detection
Write-Host "4. Testing gap detection..." -ForegroundColor White
$invalidPriority = & psql $env:SUPABASE_POOLER_URL -t -c "SELECT COUNT(*) FROM sd_backlog_map WHERE priority NOT IN ('High', 'Medium', 'Low');"
Write-Host "   Items with invalid priority: $($invalidPriority.Trim())" -ForegroundColor White

Write-Host ""
Write-Host "=== All tests complete ===" -ForegroundColor Green
