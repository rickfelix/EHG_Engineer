#!/bin/bash
# Claude Code Notification Script for WSL
# Plays a Windows sound when Claude needs user input
# Made resilient with retries and fallbacks

# Default sound - pleasant notification chime
SOUND_FILE="${1:-notify.wav}"
WINDOWS_MEDIA_PATH="C:\\Windows\\Media"
LOG_FILE="/mnt/c/_EHG/EHG_Engineer/.claude/logs/notify.log"
MAX_RETRIES=2

# Convert common names to full paths
case "$SOUND_FILE" in
    "complete"|"done"|"success")
        SOUND_FILE="Windows Notify.wav"
        ;;
    "attention"|"urgent")
        SOUND_FILE="Windows Notify System Generic.wav"
        ;;
    "question"|"input")
        SOUND_FILE="ding.wav"
        ;;
    "error"|"fail")
        SOUND_FILE="chord.wav"
        ;;
esac

# Function to play sound with timeout
play_sound() {
    timeout 3 powershell.exe -c "(New-Object Media.SoundPlayer '$WINDOWS_MEDIA_PATH\\$SOUND_FILE').PlaySync()" 2>/dev/null
    return $?
}

# Try to play with retries
for ((i=1; i<=MAX_RETRIES; i++)); do
    if play_sound; then
        exit 0
    fi
    echo "$(date -Iseconds) Retry $i/$MAX_RETRIES failed for $SOUND_FILE" >> "$LOG_FILE" 2>/dev/null
    sleep 0.2
done

# Fallback: try system beep
echo -e '\a' 2>/dev/null

# Log final failure
echo "$(date -Iseconds) FAILED: Could not play $SOUND_FILE after $MAX_RETRIES retries" >> "$LOG_FILE" 2>/dev/null

exit 0
