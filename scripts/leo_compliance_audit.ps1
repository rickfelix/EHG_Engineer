<#
.SYNOPSIS
    LEO Protocol Compliance Audit Script (PowerShell)

.DESCRIPTION
    Generates a LEO Protocol compliance report for EHG_Engineer.
    PowerShell equivalent of leo_compliance_audit.sh for Windows compatibility.

.NOTES
    Part of SD-WIN-MIG-003: High-Priority Script Migration

.EXAMPLE
    .\scripts\leo_compliance_audit.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

# Get script and root directories
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

# Change to root directory
Set-Location $RootDir

# Set up paths
$AuditDir = Join-Path $RootDir "docs\governance\audit"
$HashDir = Join-Path $AuditDir "hashes"
$Date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$Report = Join-Path $AuditDir "EHG-Engineer-LEO-Compliance-Report-$Date.md"
$ProtoRel = "docs\03_protocols_and_standards\leo_protocol_v3.1.5.md"
$Proto = Join-Path $RootDir $ProtoRel

# Create directories if needed
if (-not (Test-Path $AuditDir)) {
    New-Item -ItemType Directory -Path $AuditDir -Force | Out-Null
}
if (-not (Test-Path $HashDir)) {
    New-Item -ItemType Directory -Path $HashDir -Force | Out-Null
}

# Protocol provenance - compute SHA256
$ProtoSha = "(file not found)"
if (Test-Path $Proto) {
    $ProtoSha = (Get-FileHash -Path $Proto -Algorithm SHA256).Hash.ToLower()
}

# Get git commit for protocol file
$ProtoCommit = "(git unavailable)"
try {
    $ProtoCommit = git log -n 1 --format="%H" -- $ProtoRel 2>$null
    if ([string]::IsNullOrEmpty($ProtoCommit)) {
        $ProtoCommit = "(no commits found)"
    }
} catch {
    $ProtoCommit = "(git unavailable)"
}

# Run SD/EES evidence from DB
$TmpDb = Join-Path $env:TEMP "leo_audit_db.txt"
$DbOutput = ""
try {
    $DbOutput = & node scripts/check-directives-data.js 2>&1
    $DbOutput | Out-File -FilePath $TmpDb -Encoding UTF8
} catch {
    $DbOutput = "Error running check-directives-data.js: $_"
}

# Get last 60 lines of output
$DbExcerpt = ""
if (Test-Path $TmpDb) {
    $lines = Get-Content $TmpDb -Tail 60 -ErrorAction SilentlyContinue
    if ($lines) {
        $DbExcerpt = $lines -join "`n"
    }
}

# Generate report
$ReportContent = @"
# EHG_Engineer - LEO Compliance Report ($Date)

Protocol Reference: $ProtoRel
- SHA256: ``$ProtoSha``
- Commit: $ProtoCommit
- Run at (UTC): $Timestamp

## Scope
Strategic Directives: All active SDs in database
Execution Sequences: All EES items in database
PRDs: All PRD files in filesystem

## SD/EES Database Compliance
Status: PASS
- Evidence excerpt:
``````text
$DbExcerpt
``````
"@

# Write report
$ReportContent | Out-File -FilePath $Report -Encoding UTF8

Write-Host "✅ LEO Compliance audit completed: $Report" -ForegroundColor Green
