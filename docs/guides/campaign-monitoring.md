# Campaign Monitoring & Recovery System


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, api, testing, feature

## Overview

Intelligent monitoring system for the autonomous real testing campaign with crash detection, auto-restart, and health monitoring.

**Problem Solved**: "Earlier you said it stopped but I had no way of telling" - Now you have full visibility and automatic recovery.

## Features

### 1. Heartbeat Monitoring ✅
- Updates every SD test
- Detects stalls (no update >10 minutes)
- Tracks progress percentage
- Records PID for process verification

### 2. Crash Handlers ✅
- Catches uncaught exceptions
- Catches unhandled promise rejections
- Graceful shutdown on SIGTERM/SIGINT
- Fatal error logging with stack traces

### 3. Health Monitor ✅
- Real-time campaign status
- Process alive/dead detection
- Recent alerts summary
- Progress checkpoint display

### 4. Auto-Restart Wrapper ✅
- Automatic restart on crash
- Exponential backoff (5s → 5min)
- Max 5 restart attempts
- Respects intentional termination

### 5. Comprehensive Logging ✅
- Progress log (all test results)
- Error log (failures only)
- Alert log (warnings/criticals)
- Wrapper log (restart history)

## Files Created

### Monitoring Files (in /tmp)
```
/tmp/campaign-heartbeat.txt      - Real-time heartbeat (JSON)
/tmp/campaign-checkpoint.json    - Progress checkpoint (JSON)
/tmp/campaign-status.json        - Overall status (JSON)
/tmp/campaign-alerts.log         - Alert history (text)
/tmp/batch-test-progress.log     - Full progress log (text)
/tmp/batch-test-errors.log       - Error log (text)
/tmp/campaign-wrapper.log        - Auto-restart log (text)
```

### Scripts
```
scripts/batch-test-completed-sds-real.cjs    - Main campaign (ENHANCED)
scripts/monitor-campaign-health.cjs          - Health monitor (NEW)
scripts/campaign-auto-restart.cjs            - Auto-restart wrapper (NEW)
```

## Usage

### Option 1: Run Campaign with Auto-Restart (RECOMMENDED)

```bash
# From EHG_Engineer root directory
node scripts/campaign-auto-restart.cjs

# Benefits:
# - Automatic restart on crash (up to 5 times)
# - Exponential backoff prevents rapid failures
# - Wrapper log tracks all restart attempts
```

### Option 2: Run Campaign Directly

```bash
# From EHG_Engineer root directory
node scripts/batch-test-completed-sds-real.cjs

# Benefits:
# - Direct control
# - Simpler debugging
# - Manual restart required
```

### Option 3: Monitor Running Campaign

```bash
# Check campaign health anytime
node scripts/monitor-campaign-health.cjs

# Sample output:
# ✅ Status: HEALTHY
#    Campaign running (23/118, 19.5% complete)
#
# ✅ Process Check: Process 12345 is alive
#
# 📊 Progress Details:
#    Current SD: SD-RECONNECT-006
#    Progress: 23/118 (19.5%)
#    Last Update: 2025-10-05T11:30:45.123Z
#    Age: 2m
```

## Monitoring Files Explained

### 1. Heartbeat File (`campaign-heartbeat.txt`)
```json
{
  "timestamp": 1728128445123,
  "iso_time": "2025-10-05T11:30:45.123Z",
  "current_sd": "SD-RECONNECT-006",
  "progress": "23/118",
  "percent": "19.5",
  "status": "running",
  "pid": 12345
}
```

**Updated**: Every SD test (every 3-5 minutes)
**Stale threshold**: 10 minutes

### 2. Checkpoint File (`campaign-checkpoint.json`)
```json
{
  "timestamp": 1728128445123,
  "iso_time": "2025-10-05T11:30:45.123Z",
  "tested": 23,
  "total": 118,
  "passed": 18,
  "failed": 4,
  "errors": 1,
  "last_sd": "SD-RECONNECT-006",
  "can_resume": true
}
```

**Updated**: After each SD completes
**Purpose**: Resume capability (future feature)

### 3. Status File (`campaign-status.json`)
```json
{
  "status": "HEALTHY",
  "message": "Progress: 23/118, 18 passed",
  "timestamp": 1728128445123,
  "iso_time": "2025-10-05T11:30:45.123Z"
}
```

**Status values**:
- `RUNNING` - Campaign initializing
- `HEALTHY` - Running normally
- `WARNING` - High error/failure rate
- `COMPLETE` - Finished successfully
- `CRASHED` - Uncaught exception
- `FAILED` - Fatal error
- `TERMINATED` - SIGTERM received
- `INTERRUPTED` - SIGINT (Ctrl+C)

### 4. Alert Log (`campaign-alerts.log`)
```
[2025-10-05T11:25:30.123Z] WARNING: High failure rate: 5/10 SDs failing
[2025-10-05T11:28:15.456Z] WARNING: Failed to store results for SD-XYZ
[2025-10-05T11:30:45.789Z] CRITICAL: Critical test failure on SD-ABC: timeout
```

**Severity levels**:
- `info` - Normal events
- `warning` - Concerning but not blocking
- `critical` - Requires attention

## Health Status Detection

### ✅ HEALTHY
- Heartbeat updated within 10 minutes
- Process is alive
- Status: `running` or `HEALTHY`

### ⚠️ STALE
- Heartbeat older than 10 minutes
- Process may be hung
- **Action**: Check logs, consider restart

### 💥 CRASHED
- Status: `CRASHED`
- Uncaught exception or unhandled rejection
- **Action**: Check error log, fix issue, restart

### 🛑 TERMINATED
- Status: `TERMINATED` or `INTERRUPTED`
- Intentional shutdown via signal
- **Action**: None (expected)

### 🎉 COMPLETE
- Status: `COMPLETE`
- All SDs tested successfully
- **Action**: Review results

### ❓ UNKNOWN
- No heartbeat file found
- Campaign not started
- **Action**: Start campaign

## Recovery Procedures

### Scenario 1: Campaign Stalled (STALE)

```bash
# 1. Check health
node scripts/monitor-campaign-health.cjs

# If stale (heartbeat >10m old):

# 2. Check if process is alive
ps aux | grep batch-test-completed-sds-real

# 3. If alive but stalled, kill it
kill -TERM <PID>

# 4. Restart with auto-restart wrapper
node scripts/campaign-auto-restart.cjs
```

### Scenario 2: Campaign Crashed

```bash
# 1. Check error log
tail -50 /tmp/batch-test-errors.log

# 2. Check alert log
tail -20 /tmp/campaign-alerts.log

# 3. Identify failure pattern
# - Network issues? Wait and retry
# - Database issues? Check Supabase
# - Test timeout? Adjust timeout in QA Director

# 4. Restart with auto-restart wrapper (handles up to 5 crashes)
node scripts/campaign-auto-restart.cjs
```

### Scenario 3: High Failure Rate

```bash
# If you see:
# ⚠️  ALERT [warning]: High failure rate: 30/50 SDs failing

# 1. Check recent test results in database
# 2. Common failure patterns in testing_notes
# 3. May indicate systemic issue (not campaign bug)
# 4. Continue campaign to gather all data
# 5. Address test failures after campaign completes
```

## Auto-Restart Behavior

### Restart Triggers
- Exit code ≠ 0
- Status: `CRASHED` or `FAILED`
- Uncaught exception
- Unhandled promise rejection

### Won't Restart On
- Status: `COMPLETE` (normal completion)
- Status: `TERMINATED` (intentional)
- Status: `INTERRUPTED` (Ctrl+C)

### Backoff Strategy
1. First restart: 5 seconds
2. Second restart: 10 seconds
3. Third restart: 20 seconds
4. Fourth restart: 40 seconds
5. Fifth restart: 80 seconds
6. Max 5 restarts, then gives up

### Example Auto-Restart Log
```
[2025-10-05T11:00:00.000Z] 🚀 Starting campaign (attempt 1)
[2025-10-05T11:15:30.123Z] 📊 Campaign process exited: code=1, signal=null
[2025-10-05T11:15:30.125Z] ⚠️  Campaign crashed or failed - restart 1/5
[2025-10-05T11:15:30.125Z] ⏱️  Waiting 5s before restart...
[2025-10-05T11:15:35.130Z] 🚀 Starting campaign (attempt 2)
[2025-10-05T11:30:45.456Z] ✅ Campaign completed successfully - no restart needed
```

## Quick Reference

### Start Campaign (Auto-Restart)
```bash
node scripts/campaign-auto-restart.cjs
```

### Monitor Health
```bash
node scripts/monitor-campaign-health.cjs
```

### View Logs
```bash
# Progress
tail -f /tmp/batch-test-progress.log

# Errors only
tail -f /tmp/batch-test-errors.log

# Alerts
tail -f /tmp/campaign-alerts.log

# Wrapper (restart history)
tail -f /tmp/campaign-wrapper.log
```

### Stop Campaign
```bash
# Find process
ps aux | grep batch-test-completed-sds-real

# Graceful shutdown (SIGTERM)
kill -TERM <PID>

# Force kill (SIGKILL - last resort)
kill -9 <PID>
```

## Integration with Existing Monitoring

### Monitor Dashboard (`scripts/monitor-real-batch-testing.cjs`)
- Still works as before
- Now shows enhanced failure details
- Can add health status integration (future enhancement)

### Database Storage (`sd_testing_status`)
- All test results stored with detailed failure info
- Query for failure patterns:
```sql
SELECT sd_id, testing_notes
FROM sd_testing_status
WHERE test_pass_rate < 100
ORDER BY last_tested_at DESC;
```

## Benefits

### Before Enhancement
- ❌ No visibility when campaign stops
- ❌ Manual restart required
- ❌ No crash detection
- ❌ No progress checkpoints

### After Enhancement
- ✅ Real-time health monitoring
- ✅ Automatic crash recovery
- ✅ Comprehensive logging
- ✅ Alert system
- ✅ Progress checkpoints
- ✅ Process supervision

## Testing the Monitoring System

### Test 1: Normal Operation
```bash
# Start campaign
node scripts/campaign-auto-restart.cjs

# In another terminal, monitor health
watch -n 30 'node scripts/monitor-campaign-health.cjs'

# Expected: HEALTHY status, progress increasing
```

### Test 2: Graceful Shutdown
```bash
# Start campaign
node scripts/campaign-auto-restart.cjs

# Press Ctrl+C

# Check status
node scripts/monitor-campaign-health.cjs

# Expected: Status INTERRUPTED, no restart
```

### Test 3: Stale Detection
```bash
# Start campaign, let it run for 1-2 SDs
node scripts/batch-test-completed-sds-real.cjs

# Pause process (simulates hang)
kill -STOP <PID>

# Wait 11 minutes, then check health
node scripts/monitor-campaign-health.cjs

# Expected: Status STALE, heartbeat >10m old
```

## Troubleshooting

### Health Monitor Shows "UNKNOWN"
**Cause**: Campaign never started or heartbeat file deleted
**Fix**: Start campaign with `node scripts/campaign-auto-restart.cjs`

### Process Alive but Heartbeat Stale
**Cause**: Campaign hung in test execution
**Fix**: Kill process and restart

### Auto-Restart Gives Up (Max Restarts)
**Cause**: Persistent issue causing repeated crashes
**Fix**: Check `/tmp/campaign-wrapper.log` and `/tmp/batch-test-errors.log` for patterns, fix issue, restart manually

### High Alert Volume
**Cause**: Many test failures (not campaign issue)
**Fix**: Normal for testing campaign - review failures after completion

---

**Last Updated**: 2025-10-05
**Feature**: Campaign Monitoring & Recovery System
**Request**: "If something goes wrong with this testing script we need an intelligent way to capture failures in the script process"
**Status**: ✅ COMPLETE
