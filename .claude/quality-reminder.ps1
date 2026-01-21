# Quality Reminder Hook Script
# Outputs reminder when handoff commands are detected

param(
    [string]$ToolInput = ""
)

# Check if this is a handoff-related command
if ($ToolInput -match "handoff" -or $env:TOOL_INPUT -match "handoff") {
    Write-Output ""
    Write-Output "============================================"
    Write-Output "[REMINDER] Quality over speed."
    Write-Output "Follow the LEO protocol diligently."
    Write-Output "============================================"
    Write-Output ""
}
