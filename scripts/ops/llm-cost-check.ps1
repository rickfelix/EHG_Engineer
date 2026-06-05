<#
.SYNOPSIS
  Daily LLM spend check for the LEO factory (Gemini cost governance, 2026-06-05).

.DESCRIPTION
  Runs scripts/llm-cost-report.mjs --check. That script exits:
    0 = healthy   1 = threshold breach   2 = misconfig
  On a breach (exit 1) or error (exit 2) this wrapper:
    - always appends a line to scripts/ops/llm-cost-check.log
    - on breach/error, writes scripts/ops/LLM-COST-ALERT.txt with details
    - best-effort Windows toast (BurntToast if installed, else msg.exe)
    - optional email (uncomment + set $Smtp* below)

  Registered as scheduled task "LEO LLM Cost Check" (see header of
  docs/ops/llm-cost-governance.md). Remove with:
    schtasks /Delete /TN "LEO LLM Cost Check" /F

  Companion to QF-20260605-172 / PR #4257.
#>

# --- Config -----------------------------------------------------------------
$MaxDailyUsd   = 12      # alert if a complete day exceeds this estimate
$MaxDailyCalls = 3000    # alert if a complete day exceeds this many calls
$SpikeFactor   = 2.0     # alert if a day exceeds this x the trailing avg
# Optional email on breach — uncomment and fill in to enable:
# $SmtpServer = 'smtp.example.com'; $SmtpFrom = 'leo@example.com'; $SmtpTo = 'codestreetlabs@gmail.com'

# --- Resolve paths (script lives in <repo>/scripts/ops) ---------------------
$RepoRoot  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Report    = Join-Path $RepoRoot 'scripts\llm-cost-report.mjs'
$LogFile   = Join-Path $PSScriptRoot 'llm-cost-check.log'
$AlertFile = Join-Path $PSScriptRoot 'LLM-COST-ALERT.txt'
$Stamp     = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

# --- Run the check ----------------------------------------------------------
Push-Location $RepoRoot
try {
  $output = & node $Report --check --max-daily-usd $MaxDailyUsd --max-daily-calls $MaxDailyCalls --spike $SpikeFactor 2>&1 | Out-String
  $code = $LASTEXITCODE
} catch {
  $output = "wrapper exception: $($_.Exception.Message)"
  $code = 2
} finally {
  Pop-Location
}

$summary = ($output -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 1).Trim()
Add-Content -Path $LogFile -Value "$Stamp  exit=$code  $summary" -Encoding utf8

if ($code -eq 0) { exit 0 }   # healthy — nothing else to do

# --- Breach / error: raise the alarm ---------------------------------------
$body = "LEO LLM cost check $(if ($code -eq 1) {'BREACH'} else {'ERROR'}) at $Stamp`n`n$output`n`nInspect: node scripts/llm-cost-report.mjs --days 7"
Set-Content -Path $AlertFile -Value $body -Encoding utf8

# Best-effort toast (non-interactive scheduled tasks may suppress this)
try {
  if (Get-Module -ListAvailable -Name BurntToast) {
    Import-Module BurntToast -ErrorAction Stop
    New-BurntToastNotification -Text 'LEO LLM cost alert', $summary
  } else {
    & msg.exe $env:USERNAME "LEO LLM cost alert: $summary" 2>$null
  }
} catch { <# notification is best-effort; the log + ALERT file are the source of truth #> }

# Optional email
# if ($SmtpServer) {
#   try { Send-MailMessage -SmtpServer $SmtpServer -From $SmtpFrom -To $SmtpTo -Subject "LEO LLM cost alert ($Stamp)" -Body $body } catch {}
# }

exit $code
