#!/bin/bash
# ============================================================================
# LEO Protocol - Status Line Context Tracker
# ============================================================================
# Purpose: Capture accurate token usage from Claude Code status line
#
# Features:
#   - Wide traffic signal bar (green=running / red=idle)
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

# Extract project name (last directory component)
PROJECT_NAME=$(basename "$CWD" 2>/dev/null || echo "unknown")

# Get git branch (if in a git repo)
if [ -d "$CWD/.git" ] || git -C "$CWD" rev-parse --git-dir &>/dev/null 2>&1; then
    GIT_BRANCH=$(git -C "$CWD" symbolic-ref --short HEAD 2>/dev/null || git -C "$CWD" describe --tags --exact-match 2>/dev/null || echo "detached")
    # Check for uncommitted changes (dirty indicator)
    if ! git -C "$CWD" diff --quiet 2>/dev/null || ! git -C "$CWD" diff --cached --quiet 2>/dev/null; then
        GIT_DIRTY="*"
    else
        GIT_DIRTY=""
    fi
else
    GIT_BRANCH=""
    GIT_DIRTY=""
fi

# Abbreviate model name
case "$MODEL" in
    *"Opus"*"4.5"*) MODEL_SHORT="O4.5" ;;
    *"Opus"*"4"*) MODEL_SHORT="O4" ;;
    *"Sonnet"*"4"*) MODEL_SHORT="S4" ;;
    *"Sonnet"*"3.5"*) MODEL_SHORT="S3.5" ;;
    *"Haiku"*"3.5"*) MODEL_SHORT="H3.5" ;;
    *"Haiku"*) MODEL_SHORT="H" ;;
    *) MODEL_SHORT=$(echo "$MODEL" | cut -c1-4) ;;
esac

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

# Detect activity (is Claude actively working?)
# Priority: 1) Hook-triggered state (instant), 2) Token change detection (fallback)
ACTIVITY_STATE="idle"
ACTIVITY_COLOR="\033[97;41m"  # White text on red background = your turn
IDLE_THRESHOLD=4  # Seconds of no activity before showing red (fallback)

if [ -f "$STATE_FILE" ]; then
    # Check if state was set by hook (instant, accurate)
    HOOK_TRIGGERED=$(jq -r '.hook_triggered // false' "$STATE_FILE" 2>/dev/null || echo "false")
    HOOK_STATE=$(jq -r '.activity_state // "idle"' "$STATE_FILE" 2>/dev/null || echo "idle")

    PREV_OUTPUT=$(jq -r '.last_output_tokens // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    PREV_INPUT=$(jq -r '.last_input_tokens // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    LAST_ACTIVE=$(jq -r '.last_active_epoch // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    CURRENT_EPOCH=$(date +%s)

    # If hook set the state, trust it immediately
    if [ "$HOOK_TRIGGERED" = "true" ]; then
        ACTIVITY_STATE="$HOOK_STATE"
        if [ "$ACTIVITY_STATE" = "running" ]; then
            ACTIVITY_COLOR="\033[97;42m"  # White text on green background
        fi
    else
        # Fallback: detect from token changes
        TOKENS_CHANGED="false"
        if [ "$TOTAL_OUTPUT" -gt "$PREV_OUTPUT" ]; then
            TOKENS_CHANGED="true"
        elif [ "$TOTAL_INPUT" -gt "$PREV_INPUT" ]; then
            TOKENS_CHANGED="true"
        fi

        if [ "$TOKENS_CHANGED" = "true" ]; then
            LAST_ACTIVE=$CURRENT_EPOCH
        fi

        TIME_SINCE_ACTIVE=$((CURRENT_EPOCH - LAST_ACTIVE))
        if [ "$TIME_SINCE_ACTIVE" -le "$IDLE_THRESHOLD" ]; then
            ACTIVITY_STATE="running"
            ACTIVITY_COLOR="\033[97;42m"  # White text on green background
        fi
    fi
else
    # First run - assume active (Claude just started)
    ACTIVITY_STATE="running"
    ACTIVITY_COLOR="\033[97;42m"  # White text on green background
    LAST_ACTIVE=$(date +%s)
fi

# Build activity signal bar with embedded text label
BAR_WIDTH=20
if [ "$ACTIVITY_STATE" = "running" ]; then
    LABEL="WORKING"
else
    LABEL="YOUR TURN"
fi

# Center the label in the bar
LABEL_LEN=${#LABEL}
PADDING=$(( (BAR_WIDTH - LABEL_LEN) / 2 ))
PADDING_RIGHT=$(( BAR_WIDTH - LABEL_LEN - PADDING ))

# Build bar with embedded text using spaces (background color shows through)
ACTIVITY_BAR=""
for ((i=0; i<PADDING; i++)); do ACTIVITY_BAR+=" "; done
ACTIVITY_BAR+="$LABEL"
for ((i=0; i<PADDING_RIGHT; i++)); do ACTIVITY_BAR+=" "; done
ACTIVITY_SIGNAL="${ACTIVITY_COLOR}[${ACTIVITY_BAR}]${RESET}"

# Update state file
cat > "$STATE_FILE" << EOF
{
  "last_context_used": $CONTEXT_USED,
  "last_percent": $PERCENT_USED,
  "last_status": "$STATUS",
  "last_update": "$(date -Iseconds)",
  "last_update_epoch": $(date +%s),
  "last_output_tokens": $TOTAL_OUTPUT,
  "last_input_tokens": $TOTAL_INPUT,
  "last_active_epoch": $LAST_ACTIVE,
  "session_id": "$SESSION_ID",
  "compaction_detected": $COMPACTION_DETECTED,
  "activity_state": "$ACTIVITY_STATE"
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
TOKENS_FORMATTED=$(printf "%'d" $CONTEXT_USED)

# Build visual progress bar
BAR_WIDTH=20
FILLED=$((PERCENT_USED * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))

# Use different characters based on status
if [ "$PERCENT_USED" -ge "$EMERGENCY_THRESHOLD" ]; then
    FILL_CHAR="█"
    EMPTY_CHAR="░"
    BAR_COLOR="\033[1;31m"  # Bold red
elif [ "$PERCENT_USED" -ge "$CRITICAL_THRESHOLD" ]; then
    FILL_CHAR="█"
    EMPTY_CHAR="░"
    BAR_COLOR="\033[0;31m"  # Red
elif [ "$PERCENT_USED" -ge "$WARNING_THRESHOLD" ]; then
    FILL_CHAR="█"
    EMPTY_CHAR="░"
    BAR_COLOR="\033[0;33m"  # Yellow
else
    FILL_CHAR="█"
    EMPTY_CHAR="░"
    BAR_COLOR="\033[0;32m"  # Green
fi

# Build the bar string
BAR=""
for ((i=0; i<FILLED; i++)); do BAR+="$FILL_CHAR"; done
for ((i=0; i<EMPTY; i++)); do BAR+="$EMPTY_CHAR"; done

# Build status line with visual bar
# Format: [████████████████████] project:branch* [████████░░░░] 45% (O4.5)
#         ^-- activity signal    ^-- project      ^-- context bar
if [ -n "$GIT_BRANCH" ]; then
    PROJECT_INFO="${PROJECT_NAME}:${GIT_BRANCH}${GIT_DIRTY}"
else
    PROJECT_INFO="${PROJECT_NAME}"
fi
OUTPUT="${ACTIVITY_SIGNAL} ${PROJECT_INFO} ${BAR_COLOR}[${BAR}]${RESET} ${PERCENT_USED}% (${MODEL_SHORT})"

# Add status indicator for warnings
if [ "$STATUS" != "HEALTHY" ]; then
    OUTPUT="$OUTPUT $ICON"
fi

# Add compaction indicator
if [ "$COMPACTION_DETECTED" = "true" ]; then
    OUTPUT="$OUTPUT ♻️"
fi

# Output the status line (with ANSI colors)
echo -e "$OUTPUT"
