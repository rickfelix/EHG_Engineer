#!/bin/bash
# Record timestamp when user submits input to Claude Code
# Used by notify-email.sh to determine if email should be sent

STATE_FILE="/tmp/claude-last-user-input.timestamp"

# Record current timestamp
date +%s > "$STATE_FILE"

exit 0
