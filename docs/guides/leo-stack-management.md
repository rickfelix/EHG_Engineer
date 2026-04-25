---
category: guide
status: draft
version: 2.1.0
author: auto-fixer
last_updated: 2026-04-25
tags: [guide, auto-generated]
---
# LEO Stack Management - Cross-Platform Version


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Platform Support](#platform-support)
- [Quick Start](#quick-start)
  - [Using the Cross-Platform Runner (Recommended)](#using-the-cross-platform-runner-recommended)
  - [Using the /leo and /restart Slash Commands](#using-the-leo-and-restart-slash-commands)
  - [Start Individual Servers](#start-individual-servers)
- [Windows-Specific Notes](#windows-specific-notes)
  - [PowerShell Direct Usage](#powershell-direct-usage)
- [Prerequisites](#prerequisites)
- [Server URLs](#server-urls)
- [Troubleshooting](#troubleshooting)
  - [Port Already in Use](#port-already-in-use)
  - [Viewing Logs](#viewing-logs)
- [Development Workflow](#development-workflow)
  - [Standard Development Session](#standard-development-session)
  - [Frontend-Only Development](#frontend-only-development)
- [Configuration](#configuration)
  - [Timing Settings](#timing-settings)
  - [PID Files](#pid-files)
  - [Log Files](#log-files)
- [Commands Reference](#commands-reference)
- [Support](#support)

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 2.1.0
- **Last Updated**: 2026-04-25
- **Tags**: leo-stack, deployment, cross-platform, windows, operations

## Overview

Management guide for the LEO Stack — the two-server ecosystem powering the LEO Protocol.

**Quick Command:** `node scripts/cross-platform-run.js leo-stack [start|stop|restart|status]`

> Agent Platform was removed from leo-stack management on 2026-04-25 (commit `f8e252ee28`, CrewAI elimination). AI workflows that previously ran under leo-stack management have been retired; references in older docs and archived scripts are dead.

> Operators are responsible for `git pull` in `EHG_Engineer/` and `ehg/` before `/restart` if they want latest. The Windows path no longer auto-pulls (matches POSIX behavior; prevents peer-worktree clobber).

## Platform Support

| Platform | Script Used | Command |
|----------|-------------|---------|
| **Windows** | `leo-stack.ps1` (PowerShell) | Auto-selected |
| **Linux/macOS** | `leo-stack.sh` (Bash) | Auto-selected |

The cross-platform runner automatically selects the right script for your OS.

---

## Servers Managed

| Server | Port | Purpose | Technology | Startup Time |
|--------|------|---------|------------|--------------|
| **EHG_Engineer** | 3000 | LEO Protocol Framework & Backend API | Node.js/Express | ~1 second |
| **EHG App** | 8080 | Frontend UI & User Interface | Vite/React | ~3 seconds |

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

## Prerequisites

- Node.js and npm installed
- Git for Windows (includes Git Bash) on Windows; standard `git` elsewhere

## Server URLs

| Server | URL | Ready After |
|--------|-----|-------------|
| EHG_Engineer | http://localhost:3000 | Immediately |
| EHG App | http://localhost:8080 | ~3 seconds |

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

### Viewing Logs

Logs are stored in `.logs/`:
```powershell
# View recent logs
Get-ChildItem .logs -File | Sort-Object LastWriteTime -Descending | Select-Object -First 10

# View specific log
Get-Content .logs\engineer-*.log -Tail 50
Get-Content .logs\app-*.log -Tail 50
```

## Development Workflow

### Standard Development Session

1. **Start the LEO Stack:**
   ```bash
   node scripts/cross-platform-run.js leo-stack start
   ```

2. **Verify both servers:**
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

### Log Files

Log files are stored in `.logs/`:
- `leo-stack-YYYYMMDD-HHMMSS.log` - Script operations
- `engineer-*.log` - EHG_Engineer output
- `app-*.log` - Vite output

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
| `start-worker` | Start workers from `config/workers.json` |
| `emergency` | Force kill all node processes (Windows only; prompts for confirmation) |

## Support

For issues:
- Check this guide
- Review logs in `.logs/`
- Verify prerequisites are installed
