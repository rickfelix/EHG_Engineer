#!/bin/bash

# LEO Protocol Status Line Quick Update Script
# Simple wrapper for common status line updates

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATUS_TOOL="$SCRIPT_DIR/leo-status-line.js"

# Ensure the tool exists
if [ ! -f "$STATUS_TOOL" ]; then
    echo "❌ Status line tool not found: $STATUS_TOOL"
    exit 1
fi

# Parse command
case "$1" in
    # Quick role updates
    lead|LEAD)
        node "$STATUS_TOOL" role LEAD
        ;;
    plan|PLAN)
        node "$STATUS_TOOL" role PLAN
        ;;
    exec|EXEC)
        node "$STATUS_TOOL" role EXEC
        ;;
    
    # SD updates
    sd|SD)
        if [ -z "$2" ]; then
            echo "Usage: leo-status sd SD-XXX [phase]"
            exit 1
        fi
        node "$STATUS_TOOL" sd "$2" "$3"
        ;;
    
    # Task updates
    task|TASK)
        if [ -z "$2" ]; then
            echo "Usage: leo-status task TASK-ID [status]"
            exit 1
        fi
        node "$STATUS_TOOL" task "$2" "$3"
        ;;
    
    # Handoff
    handoff|HANDOFF)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: leo-status handoff FROM TO [artifact]"
            exit 1
        fi
        node "$STATUS_TOOL" handoff "$2" "$3" "$4"
        ;;
    
    # Vision QA
    vq|visionqa|VISIONQA)
        if [ -z "$2" ]; then
            echo "Usage: leo-status vq APP-ID [goal]"
            exit 1
        fi
        node "$STATUS_TOOL" visionqa "$2" "$3"
        ;;
    
    # Show current
    show|status)
        node "$STATUS_TOOL" show
        ;;
    
    # Refresh with auto-detection
    refresh|auto)
        node "$STATUS_TOOL" refresh
        ;;
    
    # Clear
    clear|reset)
        node "$STATUS_TOOL" clear
        ;;
    
    # Watch mode
    watch)
        INTERVAL=${2:-5000}
        node "$STATUS_TOOL" watch "$INTERVAL"
        ;;
    
    # Help
    help|--help|-h|"")
        cat << EOF
LEO Protocol Status Line - Quick Update Tool

Usage: leo-status <command> [options]

Quick Commands:
  lead              Set role to LEAD
  plan              Set role to PLAN  
  exec              Set role to EXEC
  
  sd SD-XXX [phase]           Update Strategic Directive
  task TASK-ID [status]       Update current task
  handoff FROM TO [artifact]  Record handoff
  vq APP-ID [goal]            Update Vision QA status
  
  show              Display current status
  refresh           Auto-detect and refresh
  clear             Reset to default
  watch [interval]  Watch mode (default: 5000ms)

Examples:
  leo-status exec                    # Switch to EXEC role
  leo-status sd SD-001 planning      # Working on SD-001
  leo-status task EES-001 in-progress # Working on task
  leo-status handoff PLAN EXEC       # Handoff from PLAN to EXEC
  leo-status vq APP-001 "Test login" # Running Vision QA
  leo-status show                    # Show current status
  leo-status refresh                 # Auto-detect context

Integration with LEO Protocol:
  # In LEAD agent workflow
  leo-status lead
  leo-status sd SD-001 "requirements"
  
  # In PLAN agent workflow  
  leo-status plan
  leo-status task EES-001
  
  # In EXEC agent workflow
  leo-status exec
  leo-status task EES-001 "implementing"
  
  # During handoffs
  leo-status handoff LEAD PLAN "SD-001"
  leo-status handoff PLAN EXEC "Task decomposition"
  
  # During Vision QA
  leo-status vq APP-001 "Checkout flow test"

EOF
        ;;
    
    *)
        echo "❌ Unknown command: $1"
        echo "Run 'leo-status help' for usage"
        exit 1
        ;;
esac