#!/bin/bash
# Claude Code SMS Notification via Twilio
# Sends a text message when Claude needs user input

# Twilio credentials (set these in your environment or .env file)
# TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE, TWILIO_TO_PHONE
TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-}"
TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-}"
TWILIO_MESSAGING_SERVICE="${TWILIO_MESSAGING_SERVICE:-}"
TO_PHONE="${TWILIO_TO_PHONE:-}"

if [ -z "$TWILIO_ACCOUNT_SID" ] || [ -z "$TWILIO_AUTH_TOKEN" ]; then
    echo "Twilio credentials not configured. Skipping SMS notification."
    exit 0
fi

# Message based on notification type
MESSAGE_TYPE="${1:-complete}"
case "$MESSAGE_TYPE" in
    "complete"|"done"|"success")
        MESSAGE="Claude Code has completed and is waiting for your input."
        ;;
    "attention"|"urgent")
        MESSAGE="URGENT: Claude Code needs your attention!"
        ;;
    "question"|"input")
        MESSAGE="Claude Code has a question for you."
        ;;
    "error"|"fail")
        MESSAGE="Claude Code encountered an error and needs help."
        ;;
    *)
        MESSAGE="Claude Code notification: $MESSAGE_TYPE"
        ;;
esac

# Send SMS via Twilio
curl -s 'https://api.twilio.com/2010-04-01/Accounts/'"$TWILIO_ACCOUNT_SID"'/Messages.json' \
    -X POST \
    --data-urlencode "To=$TO_PHONE" \
    --data-urlencode "MessagingServiceSid=$TWILIO_MESSAGING_SERVICE" \
    --data-urlencode "Body=$MESSAGE" \
    -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
    > /dev/null 2>&1

exit 0
