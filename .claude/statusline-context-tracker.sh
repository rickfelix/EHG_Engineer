#!/bin/bash
# ============================================================================
# LEO Protocol - Status Line Context Tracker
# ============================================================================
# Purpose: Capture accurate token usage from Claude Code status line
#
# Features:
#   - Server-authoritative token counting (via current_usage)
#   - Cache-aware calculations (includes cache_read tokens)
#   - Threshold alerts (WARNING @ 70%, CRITICAL @ 90%)
#   - Batched logging to JSONL file
#   - Compaction detection (non-monotonic usage)
#
# Installation:
#   1. chmod +x ~/.claude/statusline-context-tracker.sh
#   2. Add to .claude/settings.json:
#      "statusLine": {
#        "type": "command",
#        "command": "/mnt/c/_EHG/EHG_Engineer/.claude/statusline-context-tracker.sh"
#      }
#
# Based on research: Token Accounting & Memory Utilization (Dec 2025)
# ============================================================================

set -euo pipefail

# Configuration
LOG_DIR="/mnt/c/_EHG/EHG_Engineer/.claude/logs"
USAGE_LOG="${LOG_DIR}/context-usage.jsonl"
STATE_FILE="${LOG_DIR}/.context-state.json"
MAX_LOG_SIZE=5242880  # 5MB rotation threshold

# Thresholds (based on research recommendations)
CONTEXT_WINDOW=200000
WARNING_THRESHOLD=70   # 70% - consider compaction
CRITICAL_THRESHOLD=90  # 90% - must compact before handoff
EMERGENCY_THRESHOLD=95 # 95% - blocked

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Read JSON from stdin (Claude Code passes status data here)
INPUT=$(cat)

# Parse key fields using jq (fail gracefully if jq not available)
if ! command -v jq &> /dev/null; then
    echo "⚠️ jq required"
    exit 0
fi

# Extract model info
MODEL=$(echo "$INPUT" | jq -r '.model.display_name // "Unknown"')
MODEL_ID=$(echo "$INPUT" | jq -r '.model.id // "unknown"')

# Extract context window size (may vary by model)
CONTEXT_SIZE=$(echo "$INPUT" | jq -r '.context_window.context_window_size // 200000')
# Validate CONTEXT_SIZE is a positive number
if ! [[ "$CONTEXT_SIZE" =~ ^[0-9]+$ ]] || [ "$CONTEXT_SIZE" -eq 0 ]; then
    CONTEXT_SIZE=200000
fi

# Extract current_usage (the accurate, server-authoritative data)
CURRENT_USAGE=$(echo "$INPUT" | jq '.context_window.current_usage // null')

# Extract cumulative totals (for reference)
TOTAL_INPUT=$(echo "$INPUT" | jq -r '.context_window.total_input_tokens // 0')
TOTAL_OUTPUT=$(echo "$INPUT" | jq -r '.context_window.total_output_tokens // 0')

# Extract session info
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
CWD=$(echo "$INPUT" | jq -r '.cwd // "unknown"')

# Calculate accurate context usage (research formula)
# CONTEXT_USED = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
if [ "$CURRENT_USAGE" != "null" ]; then
    INPUT_TOKENS=$(echo "$CURRENT_USAGE" | jq -r '.input_tokens // 0')
    OUTPUT_TOKENS=$(echo "$CURRENT_USAGE" | jq -r '.output_tokens // 0')
    CACHE_CREATION=$(echo "$CURRENT_USAGE" | jq -r '.cache_creation_input_tokens // 0')
    CACHE_READ=$(echo "$CURRENT_USAGE" | jq -r '.cache_read_input_tokens // 0')

    # Validate all are numbers (default to 0 if not)
    [[ "$INPUT_TOKENS" =~ ^[0-9]+$ ]] || INPUT_TOKENS=0
    [[ "$OUTPUT_TOKENS" =~ ^[0-9]+$ ]] || OUTPUT_TOKENS=0
    [[ "$CACHE_CREATION" =~ ^[0-9]+$ ]] || CACHE_CREATION=0
    [[ "$CACHE_READ" =~ ^[0-9]+$ ]] || CACHE_READ=0

    # The accurate context usage calculation
    CONTEXT_USED=$((INPUT_TOKENS + CACHE_CREATION + CACHE_READ))
    PERCENT_USED=$((CONTEXT_USED * 100 / CONTEXT_SIZE))

    # Cache efficiency metric
    CACHE_TOTAL=$((CACHE_CREATION + CACHE_READ))
    if [ "$CONTEXT_USED" -gt 0 ]; then
        CACHE_PERCENT=$((CACHE_TOTAL * 100 / CONTEXT_USED))
    else
        CACHE_PERCENT=0
    fi
else
    INPUT_TOKENS=0
    OUTPUT_TOKENS=0
    CACHE_CREATION=0
    CACHE_READ=0
    CONTEXT_USED=0
    PERCENT_USED=0
    CACHE_PERCENT=0
fi

# Determine status and icon
if [ "$PERCENT_USED" -ge "$EMERGENCY_THRESHOLD" ]; then
    STATUS="EMERGENCY"
    ICON="🚨"
    COLOR="\033[1;31m"  # Bold red
elif [ "$PERCENT_USED" -ge "$CRITICAL_THRESHOLD" ]; then
    STATUS="CRITICAL"
    ICON="🔴"
    COLOR="\033[0;31m"  # Red
elif [ "$PERCENT_USED" -ge "$WARNING_THRESHOLD" ]; then
    STATUS="WARNING"
    ICON="⚠️"
    COLOR="\033[0;33m"  # Yellow
else
    STATUS="HEALTHY"
    ICON="✅"
    COLOR="\033[0;32m"  # Green
fi
RESET="\033[0m"

# Detect compaction (non-monotonic usage)
COMPACTION_DETECTED="false"
if [ -f "$STATE_FILE" ]; then
    PREV_USAGE=$(jq -r '.last_context_used // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    if [ "$CONTEXT_USED" -lt "$PREV_USAGE" ] && [ "$PREV_USAGE" -gt 0 ]; then
        COMPACTION_DETECTED="true"
        COMPACTION_DELTA=$((PREV_USAGE - CONTEXT_USED))
    fi
fi

# Update state file
cat > "$STATE_FILE" << EOF
{
  "last_context_used": $CONTEXT_USED,
  "last_percent": $PERCENT_USED,
  "last_status": "$STATUS",
  "last_update": "$(date -Iseconds)",
  "session_id": "$SESSION_ID",
  "compaction_detected": $COMPACTION_DETECTED
}
EOF

# Batch logging (log every 10 seconds or on significant change)
SHOULD_LOG="false"
if [ -f "$STATE_FILE" ]; then
    LAST_LOG_TIME=$(jq -r '.last_log_time // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    CURRENT_TIME=$(date +%s)
    TIME_DIFF=$((CURRENT_TIME - LAST_LOG_TIME))

    # Log if: 10+ seconds passed, status changed, or compaction detected
    if [ "$TIME_DIFF" -ge 10 ] || [ "$COMPACTION_DETECTED" = "true" ]; then
        SHOULD_LOG="true"
    fi
fi

if [ "$SHOULD_LOG" = "true" ]; then
    # Rotate log if too large
    if [ -f "$USAGE_LOG" ] && [ $(stat -f%z "$USAGE_LOG" 2>/dev/null || stat -c%s "$USAGE_LOG" 2>/dev/null || echo 0) -gt "$MAX_LOG_SIZE" ]; then
        mv "$USAGE_LOG" "${USAGE_LOG}.$(date +%Y%m%d-%H%M%S).bak"
    fi

    # Append to JSONL log
    LOG_ENTRY=$(cat << EOF
{"ts":"$(date -Iseconds)","session":"$SESSION_ID","model":"$MODEL_ID","context_used":$CONTEXT_USED,"context_size":$CONTEXT_SIZE,"percent":$PERCENT_USED,"input":$INPUT_TOKENS,"output":$OUTPUT_TOKENS,"cache_create":$CACHE_CREATION,"cache_read":$CACHE_READ,"status":"$STATUS","compaction":$COMPACTION_DETECTED,"cwd":"$CWD"}
EOF
)
    echo "$LOG_ENTRY" >> "$USAGE_LOG"

    # Update last log time in state
    jq --arg t "$(date +%s)" '.last_log_time = ($t | tonumber)' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
fi

# Format output for status line
# Format: [Model] Context: XX% (XX,XXXt) [STATUS]
TOKENS_FORMATTED=$(printf "%'d" $CONTEXT_USED)

# Build status line
OUTPUT="[$MODEL] ${PERCENT_USED}% (${TOKENS_FORMATTED}t)"

# Add cache indicator if significant
if [ "$CACHE_PERCENT" -gt 10 ]; then
    OUTPUT="$OUTPUT 📦${CACHE_PERCENT}%"
fi

# Add status indicator
if [ "$STATUS" != "HEALTHY" ]; then
    OUTPUT="$OUTPUT $ICON"
fi

# Add compaction indicator
if [ "$COMPACTION_DETECTED" = "true" ]; then
    OUTPUT="$OUTPUT ♻️"
fi

# Output the status line
echo "$OUTPUT"
