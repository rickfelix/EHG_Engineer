#!/bin/bash
# Claude Code Notification Script for WSL
# Plays a Windows sound when Claude needs user input

# Default sound - pleasant notification chime
SOUND_FILE="${1:-notify.wav}"
WINDOWS_MEDIA_PATH="C:\\Windows\\Media"

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

# Play the sound via PowerShell (works in WSL)
powershell.exe -c "(New-Object Media.SoundPlayer '$WINDOWS_MEDIA_PATH\\$SOUND_FILE').PlaySync()" 2>/dev/null

exit 0
