#!/bin/bash
# Claude Code Email Notification via Resend
# Sends an email when Claude needs user input
#
# SMART EMAIL: Only sends if task ran longer than threshold (15 min default)
# This prevents email spam during quick back-and-forth interactions.

# Load environment variables from .env if available
if [ -f "/mnt/c/_EHG/EHG_Engineer/.env" ]; then
    export $(grep -v '^#' /mnt/c/_EHG/EHG_Engineer/.env | xargs)
fi

# Resend credentials (set these in your environment or .env file)
RESEND_API_KEY="${RESEND_API_KEY:-}"
TO_EMAIL="${CLAUDE_NOTIFY_EMAIL:-}"

if [ -z "$RESEND_API_KEY" ] || [ -z "$TO_EMAIL" ]; then
    echo "Email notification not configured. Set RESEND_API_KEY and CLAUDE_NOTIFY_EMAIL."
    exit 0
fi

# ============================================================
# SMART EMAIL THRESHOLD CHECK
# Only send email if elapsed time since last user input > threshold
# ============================================================
STATE_FILE="/tmp/claude-last-user-input.timestamp"
THRESHOLD_SECONDS="${CLAUDE_EMAIL_THRESHOLD:-900}"  # Default 15 minutes (900 seconds)

# Check if state file exists
if [ -f "$STATE_FILE" ]; then
    LAST_INPUT=$(cat "$STATE_FILE")
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_INPUT))
    ELAPSED_MINUTES=$((ELAPSED / 60))

    if [ "$ELAPSED" -lt "$THRESHOLD_SECONDS" ]; then
        # Short interaction - skip email, bell sound is enough
        echo "Skipping email: only ${ELAPSED_MINUTES}m elapsed (threshold: $((THRESHOLD_SECONDS / 60))m)"
        exit 0
    fi

    echo "Sending email: ${ELAPSED_MINUTES}m elapsed (threshold: $((THRESHOLD_SECONDS / 60))m)"
else
    # No state file = first run or state lost, send email to be safe
    echo "No timestamp found, sending email"
fi

# Message based on notification type
MESSAGE_TYPE="${1:-complete}"
case "$MESSAGE_TYPE" in
    "complete"|"done"|"success")
        SUBJECT="Claude Code is waiting for your input"
        BODY="Claude Code has completed and is waiting for your input."
        ;;
    "attention"|"urgent")
        SUBJECT="URGENT: Claude Code needs your attention!"
        BODY="Claude Code requires your immediate attention."
        ;;
    "question"|"input")
        SUBJECT="Claude Code has a question"
        BODY="Claude Code has a question for you."
        ;;
    "error"|"fail")
        SUBJECT="Claude Code encountered an error"
        BODY="Claude Code encountered an error and needs your help."
        ;;
    *)
        SUBJECT="Claude Code notification"
        BODY="$MESSAGE_TYPE"
        ;;
esac

# Send email via Resend API
curl -s -X POST 'https://api.resend.com/emails' \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "{
        \"from\": \"Claude Code <onboarding@resend.dev>\",
        \"to\": [\"$TO_EMAIL\"],
        \"subject\": \"$SUBJECT\",
        \"text\": \"$BODY\"
    }" > /dev/null 2>&1

exit 0
