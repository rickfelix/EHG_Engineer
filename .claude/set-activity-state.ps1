# Sets the activity state for the status line traffic signal
# Usage: set-activity-state.ps1 <running|idle>

param(
    [string]$State = "idle"
)

$StateFile = "C:\Users\rickf\Projects\_EHG\EHG_Engineer\.claude\logs\.context-state.json"
$LogDir = Split-Path $StateFile -Parent

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Ensure state file exists
if (-not (Test-Path $StateFile)) {
    "{}" | Set-Content $StateFile -Force
}

$currentEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

try {
    $content = Get-Content $StateFile -Raw -ErrorAction SilentlyContinue
    if ($content) {
        $stateData = $content | ConvertFrom-Json -ErrorAction SilentlyContinue
    }
    if (-not $stateData) {
        $stateData = @{}
    }
} catch {
    $stateData = @{}
}

# Convert PSCustomObject to hashtable for modification
$newState = @{}
if ($stateData -is [PSCustomObject]) {
    $stateData.PSObject.Properties | ForEach-Object {
        $newState[$_.Name] = $_.Value
    }
} else {
    $newState = $stateData
}

# Update activity fields
$newState["activity_state"] = $State
$newState["last_active_epoch"] = $currentEpoch
$newState["hook_triggered"] = $true

# Write back
$newState | ConvertTo-Json | Set-Content $StateFile -Force
