# Worker Registry Guide

## Overview

The LEO Stack uses a JSON-based worker registry (`config/workers.json`) as the single source of truth for all background workers. Both the PowerShell (`.ps1`) and Bash (`.sh`) stack scripts read this file, so adding a new worker requires zero script changes — just add a JSON entry.

## Registry Schema

Each worker entry in `config/workers.json`:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier (used internally) |
| `display_name` | string | Human-readable name shown in status output |
| `command` | string | Shell command to start the worker |
| `cwd` | string | Working directory (`.` = `EHG_Engineer` root) |
| `health_check` | object | Health check config (`{ "type": "pid" }`) |
| `pid_file` | string | PID filename (stored in `.pids/`) |
| `log_prefix` | string | Log filename prefix (stored in `.logs/`) |
| `enabled` | boolean | Whether the worker starts with the stack |
| `description` | string | What the worker does |

## Adding a New Worker

1. Edit `config/workers.json`
2. Add a new entry to the `workers` array:

```json
{
  "name": "my-worker",
  "display_name": "My Worker",
  "command": "node scripts/my-worker.js",
  "cwd": ".",
  "health_check": { "type": "pid" },
  "pid_file": "my-worker.pid",
  "log_prefix": "my-worker",
  "enabled": true,
  "description": "Does something useful"
}
```

3. Restart the stack: `node scripts/cross-platform-run.js leo-stack restart`

No script modifications needed.

## Enabling / Disabling Workers

Set `"enabled": true` or `"enabled": false` in the worker entry. Disabled workers:
- Show as `[--] Worker Name: Disabled` in status output
- Are NOT started during `start` or `restart`
- Are still listed in the registry for documentation

## Integration with LEO Stack

### Start
Workers start after the App server during `leo-stack start` / `restart`. Each enabled worker:
1. Checks if already running via PID file (idempotent)
2. Spawns as a background process
3. Writes PID to `.pids/<pid_file>`
4. Logs output to `.logs/<log_prefix>-<timestamp>.log`
5. Validates the process is still alive after 2 seconds

### Stop
Workers stop before the App server during `leo-stack stop`. Each worker:
1. Reads PID from `.pids/<pid_file>`
2. Sends SIGTERM (or Stop-Process on Windows)
3. Waits up to 5 seconds for graceful shutdown
4. Force kills if still running
5. Removes PID file

### Status
`leo-stack status` shows workers in a separate section:

```
[STATUS] Server Status:
==================================
[OK] EHG_Engineer (3000) : Running (PID: 12345, Port: 3000)
[OK] EHG App (8080)      : Running (PID: 12346, Port: 8080)

Workers:
   [OK] Stage Zero Queue Processor: Running (PID: 12347)
   [--] EVA Workers: Disabled
   [--] Sub-Agent Worker: Disabled
   [--] EVA Master Scheduler: Disabled
==================================
```

### Commands

| Command | Effect on Workers |
|---------|-------------------|
| `start` | Starts enabled workers after servers |
| `stop` | Stops all workers before servers |
| `restart` | Stops then starts all workers |
| `status` | Shows worker status (Running/Dead/Disabled) |
| `start-worker` | Starts only workers (not servers) |
| `emergency` | Force-kills all node processes including workers |

## Troubleshooting

### Stale PID Files
If a worker crashed without cleanup, its PID file may reference a dead process. The stack detects this — on next `start`, it removes the stale PID file and starts a fresh process.

### Startup Failures
Check the worker log at `.logs/<log_prefix>-<timestamp>.log`. Common issues:
- Missing environment variables (ensure `.env` is configured)
- Database connection errors (check Supabase credentials)
- Port conflicts (if the worker binds to a port)

### Log Locations
All worker logs are in `.logs/`:
- `stage-zero-<timestamp>.log` — Stage Zero Queue Processor
- `eva-workers-<timestamp>.log` — EVA Workers
- `subagent-worker-<timestamp>.log` — Sub-Agent Worker
- `eva-scheduler-<timestamp>.log` — EVA Master Scheduler

## Architecture: Stage Zero Queue Processor

```
UI (Chairman)
    |
    v
stage_zero_requests table (Supabase)
    |  status: pending
    v
Stage Zero Queue Processor (polls every 30s)
    |  status: in_progress
    |  runs discovery/teardown logic
    v
Results written back to table
    |  status: completed / failed
    v
UI polls for status changes
```
