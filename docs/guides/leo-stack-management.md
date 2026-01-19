# LEO Stack Management - Cross-Platform Version

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Claude Code (Windows Migration)
- **Last Updated**: 2026-01-19
- **Tags**: leo-stack, deployment, cross-platform, windows, operations

## Overview

Management guide for the LEO Stack - the three-server ecosystem powering the LEO Protocol.

**Quick Command:** `node scripts/cross-platform-run.js leo-stack [start|stop|restart|status]`

## Platform Support

| Platform | Script Used | Command |
|----------|-------------|---------|
| **Windows** | `leo-stack.ps1` (PowerShell) | Auto-selected |
| **Linux/macOS** | `leo-stack.sh` (Bash) | Auto-selected |

The cross-platform runner automatically selects the right script for your OS.

---

## Overview

The **LEO Stack** consists of three servers that power your LEO Protocol ecosystem:

| Server | Port | Purpose | Technology | Startup Time |
|--------|------|---------|------------|--------------|
| **EHG_Engineer** | 3000 | LEO Protocol Framework & Backend API | Node.js/Express | ~1 second |
| **EHG App** | 8080 | Frontend UI & User Interface | Vite/React | ~3 seconds |
| **Agent Platform** | 8000 | AI Research Backend (for Venture Creation) | FastAPI/Python | **10-15 seconds** |

**Note:** The Agent Platform (port 8000) takes 10-15 seconds to fully start because it loads AI components.

## Quick Start

### Using the Cross-Platform Runner (Recommended)

```bash
# Start all servers
node scripts/cross-platform-run.js leo-stack start

# Check server status
node scripts/cross-platform-run.js leo-stack status

# Stop all servers
node scripts/cross-platform-run.js leo-stack stop

# Restart all servers
node scripts/cross-platform-run.js leo-stack restart

# Fast restart (reduced delays)
node scripts/cross-platform-run.js leo-stack restart -Fast
```

### Using the /leo and /restart Slash Commands

In Claude Code sessions:
```
/leo start     # Start servers
/leo restart   # Restart servers
/leo status    # Check status
/restart       # Restart servers (shortcut)
```

### Start Individual Servers

```bash
node scripts/cross-platform-run.js leo-stack start-engineer
node scripts/cross-platform-run.js leo-stack start-app
node scripts/cross-platform-run.js leo-stack start-agent
```

## Windows-Specific Notes

### PowerShell Direct Usage

You can also run the PowerShell script directly:

```powershell
.\scripts\leo-stack.ps1 start
.\scripts\leo-stack.ps1 restart
.\scripts\leo-stack.ps1 status
.\scripts\leo-stack.ps1 restart -Fast
```

### Virtual Environment for Agent Platform

On Windows, the Python venv is at `venv_win`:
```powershell
cd C:\Users\rickf\Projects\_EHG\ehg\agent-platform
.\venv_win\Scripts\Activate.ps1
```

## Prerequisites

### For All Servers
- Node.js and npm installed
- Git for Windows (includes Git Bash)

### For Agent Platform (Port 8000)
- Python 3.10+
- Virtual environment set up (`venv_win` on Windows)

**First-time setup for Agent Platform:**

```powershell
cd C:\Users\rickf\Projects\_EHG\ehg\agent-platform
.\INSTALL.ps1
```

## Server URLs

| Server | URL | Ready After |
|--------|-----|-------------|
| EHG_Engineer | http://localhost:3000 | Immediately |
| EHG App | http://localhost:8080 | ~3 seconds |
| Agent Platform | http://localhost:8000 | 10-15 seconds |
| API Docs | http://localhost:8000/api/docs | 10-15 seconds |

## Troubleshooting

### Port Already in Use

**Windows (PowerShell):**
```powershell
# Check what's using a port
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess
Get-Process -Id <PID>

# Kill a process
Stop-Process -Id <PID> -Force

# Or use the clean command
node scripts/cross-platform-run.js leo-stack clean
```

### Agent Platform Not Starting

**Check virtual environment:**
```powershell
Test-Path C:\Users\rickf\Projects\_EHG\ehg\agent-platform\venv_win
```

If not found, run setup:
```powershell
cd C:\Users\rickf\Projects\_EHG\ehg\agent-platform
.\INSTALL.ps1
```

**Check for missing dependencies:**
If you see `ModuleNotFoundError` in logs, install the missing package:
```powershell
cd C:\Users\rickf\Projects\_EHG\ehg\agent-platform
.\venv_win\Scripts\pip.exe install <missing-package>
```

**Common dependency issues and resolutions:**

| Error | Missing Package(s) | Solution |
|-------|-------------------|----------|
| `No module named 'langchain_openai'` | `langchain_openai` | `pip install langchain_openai` |
| `No module named 'anthropic'` | `anthropic` | `pip install anthropic` |
| `Client.__init__() got an unexpected keyword argument 'proxy'` | Outdated `supabase` stack | `pip install --upgrade supabase gotrue` |
| `No module named 'websockets.asyncio'` | Outdated `websockets` | `pip install "websockets>=13,<16"` |

**Full dependency reinstall (if multiple issues):**
```powershell
cd C:\Users\rickf\Projects\_EHG\ehg\agent-platform
.\venv_win\Scripts\pip.exe install -r requirements.txt --upgrade
```

**Note:** After installing dependencies, restart the Agent Platform:
```bash
node scripts/cross-platform-run.js leo-stack restart
```

### Viewing Logs

Logs are stored in `.logs/`:
```powershell
# View recent logs
Get-ChildItem .logs -File | Sort-Object LastWriteTime -Descending | Select-Object -First 10

# View specific log
Get-Content .logs\engineer-*.log -Tail 50
Get-Content .logs\app-*.log -Tail 50
Get-Content .logs\agent-*.log -Tail 50
```

## Development Workflow

### Standard Development Session

1. **Start the LEO Stack:**
   ```bash
   node scripts/cross-platform-run.js leo-stack start
   ```
   Wait 15 seconds for Agent Platform to fully load.

2. **Verify all servers:**
   ```bash
   node scripts/cross-platform-run.js leo-stack status
   ```

3. **Work on features...**

4. **After code changes:**
   ```bash
   node scripts/cross-platform-run.js leo-stack restart
   ```

5. **Stop when done:**
   ```bash
   node scripts/cross-platform-run.js leo-stack stop
   ```

### Frontend-Only Development

```bash
node scripts/cross-platform-run.js leo-stack start-engineer
node scripts/cross-platform-run.js leo-stack start-app
```

## Configuration

### Timing Settings

| Setting | Default | Fast Mode |
|---------|---------|-----------|
| Startup Delay | 3s | 1s |
| Restart Cooldown | 5s | 2s |
| Shutdown Grace | 5s | 5s |

Use `-Fast` flag for reduced delays during development.

### PID Files

PID files are stored in `.pids/`:
- `engineer.pid` - EHG_Engineer process
- `app.pid` - EHG App process
- `agent.pid` - Agent Platform process

### Log Files

Log files are stored in `.logs/`:
- `leo-stack-YYYYMMDD-HHMMSS.log` - Script operations
- `engineer-*.log` - EHG_Engineer output
- `app-*.log` - Vite output
- `agent-*.log` - FastAPI output

## Commands Reference

| Command | Description |
|---------|-------------|
| `start` | Start all servers |
| `stop` | Stop all servers |
| `restart` | Restart all servers |
| `status` | Show server status |
| `clean` | Clean up processes on all ports |
| `start-engineer` | Start only EHG_Engineer (3000) |
| `start-app` | Start only EHG App (8080) |
| `start-agent` | Start only Agent Platform (8000) |
| `emergency` | Force kill all node/python processes |

## Support

For issues:
- Check this README
- Review logs in `.logs/`
- Verify prerequisites are installed
- Wait 15 seconds after starting for Agent Platform

---

*Updated: January 2026 - Windows native environment (no WSL)*
