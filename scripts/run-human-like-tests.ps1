<#
.SYNOPSIS
    Human-Like E2E Test Runner (Windows PowerShell)

.DESCRIPTION
    Full workflow for running Human-Like E2E tests with:
    - Optional frontend restart (for when EHG changes were made)
    - All test categories (accessibility, chaos, visual, ux-evaluation)
    - Automatic retrospective generation
    - Metrics tracking for continuous improvement

.PARAMETER RestartFrontend
    Restart EHG frontend before running tests

.PARAMETER Category
    Run only specific category (accessibility, chaos, visual, ux)

.PARAMETER Stringency
    Set stringency level (strict, standard, relaxed). Default: standard

.PARAMETER SkipRetro
    Skip retrospective generation

.PARAMETER Verbose
    Show detailed test output

.EXAMPLE
    .\scripts\run-human-like-tests.ps1 -RestartFrontend

.EXAMPLE
    .\scripts\run-human-like-tests.ps1 -Category accessibility -Stringency strict

.EXAMPLE
    .\scripts\run-human-like-tests.ps1 -RestartFrontend -Verbose
#>

param(
    [switch]$RestartFrontend,
    [string]$Category = "",
    [string]$Stringency = "standard",
    [switch]$SkipRetro,
    [switch]$VerboseOutput
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Continue"

$BaseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:8080" }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           HUMAN-LIKE E2E TEST RUNNER                            ║" -ForegroundColor Cyan
Write-Host "║           Continuous Improvement Through Testing                 ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Step 1: Restart frontend if requested
if ($RestartFrontend) {
    Write-Host "🔄 Step 1: Restarting EHG frontend..." -ForegroundColor Blue

    # Stop EHG app processes
    Write-Host "   Stopping EHG app..." -ForegroundColor Yellow
    Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*vite*" -or $_.CommandLine -like "*ehg*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Start it again
    Write-Host "   Starting EHG app..." -ForegroundColor Yellow
    $ehgDir = "C:\Users\rickf\Projects\_EHG\ehg"
    Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $ehgDir -WindowStyle Hidden

    # Wait for it to be ready
    Write-Host "   Waiting for EHG to be ready..." -ForegroundColor Yellow
    $ready = $false
    for ($i = 1; $i -le 30; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host "   ✅ EHG frontend is ready" -ForegroundColor Green
                $ready = $true
                break
            }
        } catch {}
        Write-Host -NoNewline "."
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        Write-Host ""
        Write-Host "   ❌ EHG frontend failed to start" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
} else {
    Write-Host "🔍 Step 1: Checking EHG frontend status..." -ForegroundColor Blue
    try {
        $response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "   ✅ EHG frontend is running at $BaseUrl" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ EHG frontend is not running at $BaseUrl" -ForegroundColor Red
        Write-Host "   Use -RestartFrontend to start it, or run: .\scripts\leo-stack.ps1 start" -ForegroundColor Yellow
        exit 1
    }
}

# Step 2: Run tests
Write-Host ""
Write-Host "🧪 Step 2: Running Human-Like E2E tests..." -ForegroundColor Blue
Write-Host "   Stringency: $Stringency" -ForegroundColor White
Write-Host "   Target URL: $BaseUrl" -ForegroundColor White

Push-Location $ProjectRoot

# Build test command
$TestArgs = @("playwright", "test")

if ($Category) {
    switch ($Category.ToLower()) {
        { $_ -in @("accessibility", "a11y") } {
            $TestArgs += "tests/e2e/accessibility/"
            Write-Host "   Category: accessibility" -ForegroundColor White
        }
        { $_ -in @("chaos", "resilience") } {
            $TestArgs += "tests/e2e/resilience/"
            Write-Host "   Category: chaos/resilience" -ForegroundColor White
        }
        "visual" {
            $TestArgs += "tests/e2e/visual/"
            Write-Host "   Category: visual" -ForegroundColor White
        }
        { $_ -in @("ux", "ux-evaluation") } {
            $TestArgs += "tests/e2e/ux-evaluation/"
            Write-Host "   Category: ux-evaluation" -ForegroundColor White
        }
        default {
            Write-Host "   Unknown category: $Category, running all tests" -ForegroundColor Yellow
            $TestArgs += @("tests/e2e/accessibility/", "tests/e2e/resilience/", "tests/e2e/visual/", "tests/e2e/ux-evaluation/")
        }
    }
} else {
    $TestArgs += @("tests/e2e/accessibility/", "tests/e2e/resilience/", "tests/e2e/visual/", "tests/e2e/ux-evaluation/")
    Write-Host "   Category: ALL" -ForegroundColor White
}

$TestArgs += @("--project=chromium")

# Set environment variables
$env:BASE_URL = $BaseUrl
$env:E2E_STRINGENCY = $Stringency
$env:A11Y_STRINGENCY = $Stringency

# Run tests
$reporter = if ($VerboseOutput) { "list" } else { "dot" }
$TestArgs += @("--reporter=$reporter")

Write-Host ""
Write-Host "   Running: npx $($TestArgs -join ' ')" -ForegroundColor White
Write-Host ""

$StartTime = Get-Date
& npx @TestArgs
$TestExitCode = $LASTEXITCODE
$EndTime = Get-Date
$Duration = [math]::Round(($EndTime - $StartTime).TotalSeconds)

if ($TestExitCode -eq 0) {
    Write-Host ""
    Write-Host "   ✅ All tests passed in ${Duration}s" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "   ⚠️  Some tests failed (exit code: $TestExitCode) - Duration: ${Duration}s" -ForegroundColor Yellow
}

# Step 3: Generate retrospective
if (-not $SkipRetro) {
    Write-Host ""
    Write-Host "📊 Step 3: Generating retrospective..." -ForegroundColor Blue

    $resultsFile = Join-Path $ProjectRoot "test-results\results.json"
    if (Test-Path $resultsFile) {
        & node "$ScriptDir\human-like-e2e-retrospective.js"
    } else {
        Write-Host "   ⚠️  No results.json found, skipping retrospective" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "📊 Step 3: Skipping retrospective (-SkipRetro)" -ForegroundColor Blue
}

Pop-Location

# Summary
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                         SUMMARY                                  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Duration: ${Duration}s" -ForegroundColor White
Write-Host "   Stringency: $Stringency" -ForegroundColor White
Write-Host "   Target: $BaseUrl" -ForegroundColor White

if ($TestExitCode -eq 0) {
    Write-Host "   Result: PASSED" -ForegroundColor Green
} else {
    Write-Host "   Result: FAILED (exit code: $TestExitCode)" -ForegroundColor Red
}

Write-Host ""
Write-Host "   Reports:" -ForegroundColor White
Write-Host "   - HTML Report: npx playwright show-report" -ForegroundColor White
Write-Host "   - Results JSON: test-results\results.json" -ForegroundColor White
Write-Host "   - Evidence Pack: test-results\evidence-pack-manifest.json" -ForegroundColor White
Write-Host ""

exit $TestExitCode
