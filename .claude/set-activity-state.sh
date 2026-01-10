#!/bin/bash
# Sets the activity state for the status line traffic signal
# Usage: set-activity-state.sh <running|idle>

STATE_FILE="/mnt/c/_EHG/EHG_Engineer/.claude/logs/.context-state.json"
ACTIVITY_STATE="${1:-idle}"

# Ensure state file exists
if [ ! -f "$STATE_FILE" ]; then
    echo '{}' > "$STATE_FILE"
fi

# Update the activity state and timestamp
CURRENT_EPOCH=$(date +%s)

# Use jq to update just the activity fields
if command -v jq &> /dev/null; then
    jq --arg state "$ACTIVITY_STATE" --arg epoch "$CURRENT_EPOCH" '
        .activity_state = $state |
        .last_active_epoch = ($epoch | tonumber) |
        .hook_triggered = true
    ' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
fi
