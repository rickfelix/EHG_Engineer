#!/bin/bash
# Test SMS via Verizon email-to-SMS gateway using Resend
#
# Usage: ./test-sms-gateway.sh 1234567890
# (Replace with your 10-digit phone number)

PHONE_NUMBER="$1"

if [ -z "$PHONE_NUMBER" ]; then
    echo "Usage: $0 <10-digit-phone-number>"
    echo "Example: $0 5551234567"
    exit 1
fi

# Check for Resend API key
if [ -z "$RESEND_API_KEY" ]; then
    echo "Error: RESEND_API_KEY environment variable not set"
    echo "Set it with: export RESEND_API_KEY=re_xxxx"
    exit 1
fi

# Verizon email-to-SMS gateway
SMS_EMAIL="${PHONE_NUMBER}@vtext.com"

echo "Sending test SMS to: $SMS_EMAIL"

# Send via Resend API
RESPONSE=$(curl -s -X POST 'https://api.resend.com/emails' \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "{
        \"from\": \"Claude Code <onboarding@resend.dev>\",
        \"to\": [\"$SMS_EMAIL\"],
        \"subject\": \"Claude Code Ready\",
        \"text\": \"Claude Code is waiting for your input.\"
    }")

# Check response
if echo "$RESPONSE" | grep -q '"id"'; then
    echo "Success! SMS sent via Verizon gateway."
    echo "Check your phone in the next 1-2 minutes."
else
    echo "Failed to send. Response:"
    echo "$RESPONSE"
fi
