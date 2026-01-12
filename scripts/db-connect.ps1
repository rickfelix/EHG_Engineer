# Helper script to connect to Supabase via pooler (Windows PowerShell)
# Note: Requires psql to be in PATH (install PostgreSQL or just psql client)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

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
    Write-Host "Error: SUPABASE_POOLER_URL not set in .env file" -ForegroundColor Red
    Write-Host "Please add: SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[URL_ENCODED_PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" -ForegroundColor Yellow
    exit 1
}

# Check if psql is available
if (-not (Get-Command "psql" -ErrorAction SilentlyContinue)) {
    Write-Host "Error: psql not found in PATH" -ForegroundColor Red
    Write-Host "Install PostgreSQL or add psql to your PATH" -ForegroundColor Yellow
    Write-Host "Alternative: Use the Supabase dashboard SQL editor" -ForegroundColor Yellow
    exit 1
}

# If no arguments, open interactive psql session
if ($args.Count -eq 0) {
    Write-Host "Connecting to Supabase via pooler..." -ForegroundColor Cyan
    & psql $env:SUPABASE_POOLER_URL
} else {
    # If arguments provided, execute as SQL command
    Write-Host "Executing SQL command..." -ForegroundColor Cyan
    & psql $env:SUPABASE_POOLER_URL @args
}
