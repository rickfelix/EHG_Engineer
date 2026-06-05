<#
.SYNOPSIS
  Safely set GEMINI_API_KEY in EHG_Engineer/.env without exposing the secret.

.DESCRIPTION
  Prompts for the new key with HIDDEN input (Read-Host -AsSecureString) so the
  value is never echoed to the screen, history, or any transcript. Backs up the
  current .env to a timestamped copy, replaces (or appends) the GEMINI_API_KEY
  line, and prints only a masked confirmation (last 4 chars + length).

  Run it in a terminal (interactive prompt required):
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\rickf\Projects\_EHG\EHG_Engineer\scripts\ops\set-gemini-key.ps1"

  Rollback: copy the printed .env backup back over .env.
  Companion to QF-20260605-172 / the LEO-Gate key separation (Action 4).
  NOTE: ASCII-only on purpose (Windows PowerShell 5.1 mis-parses non-ASCII without a BOM).
#>

$ErrorActionPreference = 'Stop'

# Locate .env (script lives in <repo>/scripts/ops)
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$EnvFile  = Join-Path $RepoRoot '.env'
if (-not (Test-Path $EnvFile)) { Write-Host "[ERROR] .env not found at $EnvFile" -ForegroundColor Red; exit 1 }

$mask = { param($v) if ($v) { "$($v.Substring(0,[Math]::Min(4,$v.Length)))...$($v.Substring([Math]::Max(0,$v.Length-4)))  (len $($v.Length))" } else { '(empty)' } }

# Show current value (masked)
# Read as UTF-8 (symmetric with the UTF-8 write below). Get-Content -Raw in
# Windows PowerShell 5.1 decodes as ANSI, which corrupts non-ASCII (e.g. em-dashes
# in comments) on the read/write round-trip. ReadAllText auto-detects UTF-8/BOM.
$raw = [IO.File]::ReadAllText($EnvFile)
$curMatch = [regex]::Match($raw, '(?m)^GEMINI_API_KEY=(.*)$')
$current = if ($curMatch.Success) { $curMatch.Groups[1].Value.Trim() } else { $null }
Write-Host ""
Write-Host "Current GEMINI_API_KEY: $(& $mask $current)" -ForegroundColor Cyan

# Prompt for new key (HIDDEN)
Write-Host ""
Write-Host "Paste the new LEO-Gate key (input is hidden), then press Enter:" -ForegroundColor Yellow
$secure = Read-Host -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try   { $newKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if ([string]::IsNullOrWhiteSpace($newKey)) { Write-Host "[ABORT] No key entered. .env unchanged." -ForegroundColor Red; exit 1 }
if ($newKey -eq $current) { Write-Host "[ABORT] New key matches the current one. .env unchanged." -ForegroundColor Red; exit 1 }
if ($newKey -notmatch '^AIza[0-9A-Za-z_\-]{30,}$') {
  Write-Host "[WARN] Key does not look like a typical Gemini key (expected AIza...). Continuing anyway." -ForegroundColor DarkYellow
}

# Backup
$backup = "$EnvFile.bak-$((Get-Date).ToString('yyyyMMdd-HHmmss'))"
Copy-Item -Path $EnvFile -Destination $backup
Write-Host "[OK] Backup written: $backup" -ForegroundColor Green

# Replace or append the line (preserve rest of file)
if ($curMatch.Success) {
  $updated = [regex]::Replace($raw, '(?m)^GEMINI_API_KEY=.*$', "GEMINI_API_KEY=$newKey")
} else {
  $sep = if ($raw.EndsWith("`n")) { '' } else { "`n" }
  $updated = "$raw$sep`nGEMINI_API_KEY=$newKey`n"
}

# Write UTF-8 WITHOUT BOM (dotenv-safe)
[IO.File]::WriteAllText($EnvFile, $updated, (New-Object Text.UTF8Encoding($false)))

Write-Host "[DONE] GEMINI_API_KEY updated: $(& $mask $newKey)" -ForegroundColor Green
Write-Host ""
Write-Host "Next: tell Claude done - it will verify the key works (no secret printed) and restart the stack." -ForegroundColor Cyan
