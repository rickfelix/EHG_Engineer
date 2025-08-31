#!/bin/bash

# LEO Protocol - No Truncation Wrapper
# This script runs LEO commands and saves output to avoid truncation

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="/tmp/leo_outputs"
mkdir -p $OUTPUT_DIR

# Get the command from arguments
COMMAND=$1
shift
ARGS=$@

# Define output file based on command
OUTPUT_FILE="$OUTPUT_DIR/leo_${COMMAND}_${TIMESTAMP}.txt"

echo "════════════════════════════════════════════════════"
echo "  LEO Protocol - Running: $COMMAND $ARGS"
echo "  Output saved to: $OUTPUT_FILE"
echo "════════════════════════════════════════════════════"
echo ""

# Run the command and save output
if [ "$COMMAND" == "add-project" ]; then
    echo "📁 Project Registration Instructions:"
    echo ""
    echo "1. Copy template: cp .env.project-template .env.project-registration"
    echo "2. Edit the file - change PROJECT_NAME and GITHUB_REPO"
    echo "3. Run: node scripts/leo-register-from-env.js"
    echo ""
    echo "Full instructions saved to: $OUTPUT_FILE"
    node scripts/leo.js $COMMAND $ARGS | tee $OUTPUT_FILE
elif [ -z "$COMMAND" ] || [ "$COMMAND" == "help" ]; then
    node scripts/leo.js help | tee $OUTPUT_FILE
    echo ""
    echo "✅ Full help saved to: $OUTPUT_FILE"
else
    node scripts/leo.js $COMMAND $ARGS | tee $OUTPUT_FILE
    echo ""
    echo "✅ Output saved to: $OUTPUT_FILE"
fi

echo ""
echo "💡 Tip: To view the full output anytime, run:"
echo "   cat $OUTPUT_FILE"