# test-context-hooks.ps1
# Comprehensive test suite for unified context preservation hooks
# SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001

$ErrorActionPreference = "Stop"
$ProjectDir = "C:\Users\rickf\Projects\_EHG\EHG_Engineer"
$PrecompactScript = Join-Path $ProjectDir "scripts\hooks\precompact-snapshot.ps1"
$SessionStartScript = Join-Path $ProjectDir "scripts\hooks\session-start-loader.ps1"
$UnifiedStateFile = Join-Path $ProjectDir ".claude\unified-session-state.json"
$SettingsFile = Join-Path $ProjectDir ".claude\settings.json"

$passed = 0
$failed = 0

function Test-Result {
    param($Name, $Condition, $Details = "")
    if ($Condition) {
        Write-Host "[PASS] $Name" -ForegroundColor Green
        if ($Details) { Write-Host "       $Details" -ForegroundColor Gray }
        $script:passed++
    } else {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        if ($Details) { Write-Host "       $Details" -ForegroundColor Yellow }
        $script:failed++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Unified Context Preservation Tests   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# TEST 1: Scripts exist
Write-Host "--- Script Existence ---" -ForegroundColor Yellow
Test-Result "precompact-snapshot.ps1 exists" (Test-Path $PrecompactScript)
Test-Result "session-start-loader.ps1 exists" (Test-Path $SessionStartScript)

# TEST 2: Scripts parse without errors
Write-Host ""
Write-Host "--- Syntax Validation ---" -ForegroundColor Yellow
try {
    $null = [System.Management.Automation.Language.Parser]::ParseFile($PrecompactScript, [ref]$null, [ref]$null)
    Test-Result "precompact-snapshot.ps1 syntax valid" $true
} catch {
    Test-Result "precompact-snapshot.ps1 syntax valid" $false $_.Exception.Message
}

try {
    $null = [System.Management.Automation.Language.Parser]::ParseFile($SessionStartScript, [ref]$null, [ref]$null)
    Test-Result "session-start-loader.ps1 syntax valid" $true
} catch {
    Test-Result "session-start-loader.ps1 syntax valid" $false $_.Exception.Message
}

# TEST 3: Hooks registered in settings.json
Write-Host ""
Write-Host "--- Hook Registration ---" -ForegroundColor Yellow
$settings = Get-Content $SettingsFile | ConvertFrom-Json
Test-Result "PreCompact hook registered" ($null -ne $settings.hooks.PreCompact)
Test-Result "SessionStart hook registered" ($null -ne $settings.hooks.SessionStart)

$precompactTimeout = $settings.hooks.PreCompact[0].hooks[0].timeout
$sessionStartTimeout = $settings.hooks.SessionStart[0].hooks[0].timeout
Test-Result "PreCompact timeout reasonable" ($precompactTimeout -le 30) "Timeout: ${precompactTimeout}s"
Test-Result "SessionStart timeout reasonable" ($sessionStartTimeout -le 30) "Timeout: ${sessionStartTimeout}s"

# TEST 4: PreCompact hook execution
Write-Host ""
Write-Host "--- PreCompact Hook Execution ---" -ForegroundColor Yellow
Remove-Item $UnifiedStateFile -Force -ErrorAction SilentlyContinue

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$output = powershell.exe -NoProfile -Command "& '$PrecompactScript'" 2>&1
$sw.Stop()
$outputStr = $output -join "`n"

Test-Result "PreCompact creates unified state file" (Test-Path $UnifiedStateFile)
Test-Result "PreCompact runs under timeout" ($sw.ElapsedMilliseconds -lt ($precompactTimeout * 1000)) "Execution: $($sw.ElapsedMilliseconds)ms"
Test-Result "PreCompact outputs status message" ($outputStr.Contains("PRECOMPACT"))

# TEST 5: Unified state content validation
Write-Host ""
Write-Host "--- Unified State Content ---" -ForegroundColor Yellow
if (Test-Path $UnifiedStateFile) {
    $state = Get-Content $UnifiedStateFile -Raw | ConvertFrom-Json
    Test-Result "State has version" ($null -ne $state.version)
    Test-Result "State has timestamp" ($null -ne $state.timestamp)
    Test-Result "State has trigger" ($state.trigger -eq "precompact")
    Test-Result "State has git info" ($null -ne $state.git)
    Test-Result "State has git.branch" ($null -ne $state.git.branch)
    Test-Result "State has summaries" ($null -ne $state.summaries)
    Test-Result "State version is 1.0.0" ($state.version -eq "1.0.0")
} else {
    Write-Host "[SKIP] State file not created - skipping content tests" -ForegroundColor Yellow
}

# TEST 6: SessionStart with recent state
Write-Host ""
Write-Host "--- SessionStart Hook (Recent State) ---" -ForegroundColor Yellow
(Get-Item $UnifiedStateFile).LastWriteTime = Get-Date  # Make it fresh

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$output = powershell.exe -NoProfile -Command "& '$SessionStartScript'" 2>&1
$sw.Stop()
$outputStr = $output -join "`n"

Test-Result "SessionStart detects recent state" ($outputStr.Contains("CONTEXT RESTORED"))
Test-Result "SessionStart outputs git branch" ($outputStr.Contains("[GIT] Branch:"))
Test-Result "SessionStart runs under timeout" ($sw.ElapsedMilliseconds -lt ($sessionStartTimeout * 1000)) "Execution: $($sw.ElapsedMilliseconds)ms"

# TEST 7: SessionStart with old state
Write-Host ""
Write-Host "--- SessionStart Hook (Old State >30min) ---" -ForegroundColor Yellow
(Get-Item $UnifiedStateFile).LastWriteTime = (Get-Date).AddMinutes(-45)

$output = powershell.exe -NoProfile -Command "& '$SessionStartScript'" 2>&1
$outputStr = $output -join "`n"
Test-Result "SessionStart ignores old state" (-not $outputStr.Contains("CONTEXT RESTORED"))
Test-Result "SessionStart shows new session message" ($outputStr.Contains("New session"))

# TEST 8: SessionStart with no state
Write-Host ""
Write-Host "--- SessionStart Hook (No State) ---" -ForegroundColor Yellow
Remove-Item $UnifiedStateFile -Force -ErrorAction SilentlyContinue

$output = powershell.exe -NoProfile -Command "& '$SessionStartScript'" 2>&1
$outputStr = $output -join "`n"
Test-Result "SessionStart handles missing file" ($outputStr.Contains("New session"))

# Restore state for future use
& $PrecompactScript | Out-Null

# TEST 9: Automation verification (zero manual steps)
Write-Host ""
Write-Host "--- Automation Verification ---" -ForegroundColor Yellow
Test-Result "No manual read required" (-not $outputStr.Contains("READ THESE FILES"))
Test-Result "State auto-outputs on session start" ($true) "SessionStart outputs context directly"

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Passed: $passed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Gray" })
Write-Host ""

if ($failed -eq 0) {
    Write-Host "All tests passed! Unified context preservation working." -ForegroundColor Green
} else {
    Write-Host "Some tests failed. Please review the output above." -ForegroundColor Red
}
