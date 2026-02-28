---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# How to Prompt Claude Code for LEO Stack

## Quick Reference

When working with Claude Code, use these natural language prompts to manage your servers:

### Starting Servers

```
"Start the LEO Stack"
"Start LEO Stack"
"Boot up the LEO Stack"
"Launch all servers"
```

### Checking Status

```
"Check LEO Stack status"
"What's the status of the LEO Stack?"
"Show me server status"
"Are the servers running?"
```

### Stopping Servers

```
"Stop the LEO Stack"
"Shut down LEO Stack"
"Stop all servers"
"Kill the stack"
```

### Restarting Servers

```
"Restart the LEO Stack"
"Restart all servers"
"Reboot the stack"
```

### Individual Server Operations

```
"Start just the Agent Platform"
"Start only port 8080"
"Stop the research backend"
"Restart the EHG App"
```

## What Claude Will Do

When you use these prompts, Claude Code will:

1. ✅ Execute the appropriate `leo-stack.sh` command
2. ✅ Show you the output/status
3. ✅ Report any errors or issues
4. ✅ Provide troubleshooting guidance if needed
5. ⏱️ **Remind you to wait 15 seconds** for Agent Platform (port 8000) to fully load
6. ✅ Auto-clean duplicate processes (especially multiple Vite instances on port 8080)

## Examples in Context

### Example 1: Starting Your Development Session
```
You: "Start the LEO Stack"

Claude: *runs bash scripts/leo-stack.sh start*
🚀 Starting LEO Stack...
🧹 Cleaning up all LEO Stack ports...
✅ EHG_Engineer server started (PID: 12345)
   📍 http://localhost:3000
✅ EHG App frontend started (PID: 12346)
   📍 http://localhost:8080
✅ Agent Platform backend started (PID: 12347)
   📍 http://localhost:8000
   💡 Tip: Use 'restart' command to reload after code changes

⏱️ Important: Agent Platform takes 10-15 seconds to fully load.
Wait before testing venture research, or you'll see mock data.
Test readiness: curl http://localhost:8000/health
```

### Example 2: Checking if Everything is Running
```
You: "Check LEO Stack status"

Claude: *runs bash scripts/leo-stack.sh status*
📊 Server Status:
✅ EHG_Engineer (3000): Running
✅ EHG App (8080): Running
✅ Agent Platform (8000): Running
```

### Example 3: Troubleshooting Mock Data Issue
```
You: "The app is showing mock data instead of real research results"

Claude: Let me check if the Agent Platform (port 8000) is running...
*checks status*
✅ Agent Platform (8000): Running (PID: 12347)

The server is running, but it may still be loading. Let me test if it's responding:
*runs curl http://localhost:8000/health*

No response yet. The Agent Platform takes 10-15 seconds to fully load because it's
initializing:
- 4 CrewAI research agents
- OpenAI integration
- Supabase connections
- Reddit & Perplexity integrations

Please wait 15 seconds, then try your venture research again.
```

### Example 4: Multiple Vite Instances Issue
```
You: "There are multiple Vite instances running on port 8080"

Claude: Let me clean up the duplicate processes and restart the app:
*runs bash scripts/leo-stack.sh start-app*

🧹 Cleaning up processes on port 8080 (EHG App)...
   Found 3 process(es) to terminate
   - PID 12345: node
   - PID 12346: node
   - PID 12347: vite
   ✅ Port 8080 is now free

✅ EHG App frontend started (PID: 13001)

All duplicate Vite instances have been cleaned up. You now have a single,
clean instance running.
```

## Behind the Scenes

Claude Code uses these commands:
- `bash scripts/leo-stack.sh start` - Start all
- `bash scripts/leo-stack.sh stop` - Stop all
- `bash scripts/leo-stack.sh restart` - Restart all
- `bash scripts/leo-stack.sh status` - Check status
- `bash scripts/leo-stack.sh start-engineer` - Start port 3000 only
- `bash scripts/leo-stack.sh start-app` - Start port 8080 only
- `bash scripts/leo-stack.sh start-agent` - Start port 8000 only

## The LEO Stack Components

For reference, these are the servers Claude manages:

| Server | Port | What It Does | Startup Time |
|--------|------|--------------|--------------|
| **EHG_Engineer** | 3000 | LEO Protocol Framework - Your strategic directive management system | ~1 second |
| **EHG App** | 8080 | Frontend UI - Where you interact with EVA and create ventures | ~3 seconds |
| **Agent Platform** | 8000 | AI Research Backend - Powers real venture research (not mock data) | **10-15 seconds** ⚠️ |

### Why Agent Platform is Slow to Start

The Agent Platform loads heavyweight AI components:
- **4 CrewAI research agents**: Market Sizing, Pain Point Validator, Competitive Mapper, Strategic Fit Analyzer
- **OpenAI integration**: API clients and model configurations
- **Supabase**: Database connections and authentication
- **External APIs**: Reddit, Perplexity, and other research tools
- **FastAPI**: Complete app with middleware and routes

**This is normal** - only happens during startup, not during operation.

## Tips

1. **Be Natural**: Claude understands conversational language. You don't need exact commands.

2. **Context Aware**: If you mention a problem (like mock data), Claude will diagnose which server needs attention.

3. **Shortcuts**: You can just say "start the servers" and Claude knows you mean the LEO Stack.

4. **Troubleshooting**: If something isn't working, Claude will check logs and suggest fixes.

5. **Wait for Port 8000**: After starting, always wait 15 seconds before testing venture research. Claude will remind you.

6. **Auto-Cleanup**: LEO Stack script automatically cleans duplicate processes (especially Vite) - no manual intervention needed.

7. **No Auto-Reload**: Agent Platform doesn't have auto-reload enabled (WSL2 issue). Use "restart" after code changes.

## Related Documentation

- Full details: `scripts/README-LEO-STACK.md`
- Script location: `scripts/leo-stack.sh`
- Agent Platform setup: `../ehg/agent-platform/INSTALL.sh`
