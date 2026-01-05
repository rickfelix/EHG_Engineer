#!/bin/bash
# Claude Code Email Notification via Resend
# Sends an email when Claude needs user input

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
