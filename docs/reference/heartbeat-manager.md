---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Heartbeat Manager Reference


## Table of Contents

- [Overview](#overview)
- [Purpose](#purpose)
- [API Reference](#api-reference)
  - [Module Import](#module-import)
  - [Functions](#functions)
- [Integration Points](#integration-points)
  - [Handoff Workflow Integration](#handoff-workflow-integration)
  - [Display-Layer Claim Analysis](#display-layer-claim-analysis)
  - [Database RPC Functions](#database-rpc-functions)
- [Configuration](#configuration)
  - [Constants (Hardcoded)](#constants-hardcoded)
  - [Rationale](#rationale)
- [Monitoring](#monitoring)
  - [Stale Session Detection](#stale-session-detection)
  - [Session Health Check](#session-health-check)
- [Troubleshooting](#troubleshooting)
  - [Heartbeat Not Starting](#heartbeat-not-starting)
  - [Consecutive Failures](#consecutive-failures)
  - [Session Marked as Stale](#session-marked-as-stale)
  - [Orphaned Session Detection](#orphaned-session-detection)
  - [Graceful Exit Failures](#graceful-exit-failures)
- [Performance Impact](#performance-impact)
- [Security Considerations](#security-considerations)
- [Session-Specific Status Line Files (US-006)](#session-specific-status-line-files-us-006)
  - [Problem Solved](#problem-solved)
  - [Integration](#integration)
  - [Example](#example)
  - [Stale File Cleanup](#stale-file-cleanup)
- [SD Claims via claude_sessions (Updated 2026-02-22)](#sd-claims-via-claude_sessions-updated-2026-02-22)
  - [Single-Table Claim Model](#single-table-claim-model)
- [Related Documentation](#related-documentation)
- [References](#references)
- [Version History](#version-history)

**Category**: Reference
**Status**: Approved
**Version**: 1.2.0
**Author**: Claude (Infrastructure Agent)
**Last Updated**: 2026-02-22
**Tags**: session-management, heartbeat, liveness, monitoring, lifecycle, claim-analysis
**SD**: SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001 (v2.0.0), QF-20260213-620

## Overview

The Heartbeat Manager (`lib/heartbeat-manager.mjs`) provides intelligent session lifecycle management for Claude Code sessions. It ensures the database accurately reflects session liveness and handles graceful cleanup when sessions end.

## Purpose

**Problem**: Without session lifecycle management, the system cannot distinguish between:
- Active sessions (Claude is working)
- Stale sessions (Claude crashed or user closed terminal)
- Orphaned sessions (process terminated but session not released)
- Zombie sessions (session exists but no activity)

**Solution**:
- **Automatic heartbeat pings** every 30 seconds indicate the session is still alive
- **Terminal identity tracking** (machine_id + terminal_id) enables atomic auto-release
- **Graceful exit handling** with retry ensures proper cleanup on shutdown
- **PID validation** detects orphaned sessions from crashed processes
- **Status line cleanup** prevents multi-session file collisions

## API Reference

### Module Import

```javascript
import * as heartbeatManager from './lib/heartbeat-manager.mjs';
```

### Functions

#### `startHeartbeat(sessionId)`

Starts automatic heartbeat updates for a session.

**Parameters**:
- `sessionId` (string): The Claude session ID to heartbeat

**Returns**: `{ success: boolean, intervalMs: number, sessionId: string }`

**Behavior**:
- Creates interval that runs every 30 seconds
- Calls `update_session_heartbeat` RPC function
- Tracks consecutive failures (max 3)
- Automatically stops after 3 consecutive failures

**Example**:
```javascript
const result = heartbeatManager.startHeartbeat('session_abc123_tty1_1234');
console.log(`Heartbeat started: ${result.intervalMs}ms interval`);
```

**Error Handling**:
- Returns `{ success: false, error: string }` if already running
- Logs warnings on heartbeat failures
- Stops automatically after 3 consecutive failures

#### `stopHeartbeat()`

Stops the currently running heartbeat interval.

**Parameters**: None

**Returns**: `{ success: boolean, stoppedSession?: string }`

**Behavior**:
- Clears the interval timer
- Resets internal state
- Safe to call even if no heartbeat is running

**Example**:
```javascript
const result = heartbeatManager.stopHeartbeat();
console.log(`Heartbeat stopped for: ${result.stoppedSession}`);
```

#### `isHeartbeatActive()`

Checks if a heartbeat is currently running.

**Parameters**: None

**Returns**: `{ active: boolean, sessionId?: string }`

**Example**:
```javascript
const status = heartbeatManager.isHeartbeatActive();
if (status.active) {
  console.log(`Heartbeat active for: ${status.sessionId}`);
}
```

#### `getHeartbeatStats()`

Returns detailed statistics about the heartbeat state.

**Parameters**: None

**Returns**:
```javascript
{
  isActive: boolean,
  sessionId: string | null,
  intervalSeconds: number,      // 30
  lastSuccessfulHeartbeat: Date | null,
  secondsSinceLastHeartbeat: number | null,
  consecutiveFailures: number,
  maxConsecutiveFailures: number,  // 3
  healthy: boolean
}
```

**Example**:
```javascript
const stats = heartbeatManager.getHeartbeatStats();
console.log(`Healthy: ${stats.healthy}, Failures: ${stats.consecutiveFailures}`);
```

#### `forceHeartbeat()`

Manually triggers a single heartbeat update for the current session (does not start interval).

**Parameters**: None (uses current session ID from module state)

**Returns**: `{ success: boolean, sessionId?: string, lastSuccessfulHeartbeat?: Date, error?: string }`

**Use Case**: Manual heartbeat ping without starting the automatic interval.

**Example**:
```javascript
const result = await heartbeatManager.forceHeartbeat();
if (result.success) {
  console.log(`Manual heartbeat for ${result.sessionId}: ${result.lastSuccessfulHeartbeat}`);
}
```

#### `isProcessRunning(pid)`

Validates if a process ID is still running using OS-level checks.

**Parameters**:
- `pid` (number): Process ID to validate

**Returns**: `boolean` - true if process exists, false otherwise

**Implementation**: Uses `process.kill(pid, 0)` which checks process existence without sending a signal.

**Use Cases**:
- Detect orphaned sessions where the process has terminated but the session was not properly released.
- Classify claim staleness in the `sd:next` display layer (see [Display-Layer Integration](#display-layer-claim-analysis)).

**Example**:
```javascript
const isRunning = heartbeatManager.isProcessRunning(12345);
if (!isRunning) {
  console.log('Process 12345 is not running - session may be orphaned');
}
```

**Error Codes**:
- `ESRCH`: Process doesn't exist (returns false)
- `EPERM`: Process exists but insufficient permissions (returns true)

#### `validateAndReportPid(sessionId, pid, machineId, supabase)`

Validates a PID and reports validation failure to the database if the process is not running.

**Parameters**:
- `sessionId` (string): Session ID to validate
- `pid` (number): Process ID to check
- `machineId` (string): Machine ID for cross-machine safety
- `supabase` (object): Supabase client

**Returns**: `Promise<{ valid: boolean, reported?: boolean, result?: any, error?: string }>`

**Use Case**: Used by cleanup workers to detect and mark orphaned sessions.

**Example**:
```javascript
const result = await heartbeatManager.validateAndReportPid(
  'session_abc123_tty1_1234',
  12345,
  'machine_xyz',
  supabase
);

if (!result.valid && result.reported) {
  console.log('Orphaned session detected and reported');
}
```

**Database RPC**: Calls `report_pid_validation_failure(p_session_id, p_machine_id)`

#### `releaseSessionWithRetry(reason)`

Releases the current session with retry logic and timeout protection.

**Parameters**:
- `reason` (string): Release reason (e.g., 'graceful_exit', 'sigint_exit', 'timeout')

**Returns**: `Promise<{ success: boolean, latency_ms?: number, skipped?: boolean, error?: string }>`

**Behavior**:
- **Timeout**: 5 seconds per attempt (FR-3/US-002 requirement)
- **Retries**: 3 attempts with exponential backoff (100ms, 200ms, 400ms)
- **Idempotency**: Prevents duplicate release attempts
- **Status file cleanup**: Removes session-specific status line file

**Use Case**: Graceful session cleanup on exit, shutdown, or timeout.

**Example**:
```javascript
// Called automatically by exit handlers
const result = await heartbeatManager.releaseSessionWithRetry('graceful_exit');
if (result.success) {
  console.log(`Session released in ${result.latency_ms}ms`);
}
```

## Integration Points

### Handoff Workflow Integration

The heartbeat manager integrates with the LEO handoff workflow:

**BaseExecutor.js** (Start on Claim):
```javascript
import * as heartbeatManager from '../../../../../lib/heartbeat-manager.mjs';

// In _claimSDForSession()
const heartbeatStatus = heartbeatManager.isHeartbeatActive();
if (!heartbeatStatus.active || heartbeatStatus.sessionId !== session.session_id) {
  heartbeatManager.startHeartbeat(session.session_id);
}
```

**lead-final-approval/helpers.js** (Stop on Release):
```javascript
import * as heartbeatManager from '../../../../../lib/heartbeat-manager.mjs';

// In releaseSessionClaim()
const heartbeatStatus = heartbeatManager.isHeartbeatActive();
if (heartbeatStatus.active && heartbeatStatus.sessionId === session.session_id) {
  heartbeatManager.stopHeartbeat();
}
```

### Display-Layer Claim Analysis

The `sd:next` queue display integrates heartbeat and PID liveness data to provide intelligent claim status badges. The display wrapper module (`scripts/modules/sd-next/claim-analysis.js`) imports `isProcessRunning()` from the heartbeat manager and `isSameConversation()` from the claim guard to classify claim relationships.

**Claim Relationship Classification**:

| Relationship | Conditions | Display Label | Auto-Release |
|--------------|-----------|---------------|:---:|
| `same_conversation` | Terminal ID match (post-compaction recovery) | `YOURS (recovered)` | No |
| `other_active` | Heartbeat fresh (< stale threshold) | `CLAIMED` | No |
| `stale_dead` | Stale heartbeat + same host + PID dead | `STALE (dead)` | Yes |
| `stale_alive` | Stale heartbeat + same host + PID alive | `STALE (busy)` | No |
| `stale_remote` | Stale heartbeat + different host or no PID | `STALE` | No |

**Auto-Release Behavior**: When the display layer detects a `stale_dead` claim (triple-confirmed: heartbeat stale, same host, PID not running), it automatically releases the claim via the `release_sd` RPC with reason `auto_release_dead_pid`. This cleans up orphaned claims during `npm run sd:next` without manual intervention.

**Key Files**:
- `scripts/modules/sd-next/claim-analysis.js` - Claim relationship analysis and auto-release
- `scripts/modules/sd-next/display/tracks.js` - Track display with claim-aware badges
- `scripts/modules/sd-next/display/recommendations.js` - Recommendations with claim filtering
- `lib/claim-guard.mjs` - `isSameConversation()` for terminal identity comparison
- `lib/heartbeat-manager.mjs` - `isProcessRunning()` for PID liveness checks
- `lib/claim/stale-threshold.js` - `getStaleThresholdSeconds()` for configurable threshold

### Database RPC Functions

The heartbeat manager calls several database RPC functions:

#### `updateHeartbeat(sessionId)` (via session-manager.mjs)

Updates the `heartbeat_at` timestamp for the active session:

```javascript
// Called automatically every 30 seconds
await updateHeartbeat(sessionId);
```

#### `endSession(reason)` (via session-manager.mjs)

Releases the session claim and updates status:

```javascript
// Called on graceful exit
await endSession('graceful_exit');
```

**Parameters**:
- `reason` (string): Release reason for auditing

**Returns**: `{ success: boolean, error?: string }`

#### `report_pid_validation_failure(p_session_id, p_machine_id)`

Reports that a session's PID validation failed (process not running):

```sql
-- Called by cleanup workers to detect orphaned sessions
SELECT report_pid_validation_failure('session_abc123_tty1_1234', 'machine_xyz');
```

**Purpose**: Marks sessions as candidates for automatic cleanup when their process has terminated.

## Configuration

### Constants (Hardcoded)

| Constant | Value | Purpose |
|----------|-------|---------|
| `HEARTBEAT_INTERVAL_MS` | 30000 | Heartbeat interval (30 seconds) |
| `MAX_CONSECUTIVE_FAILURES` | 3 | Stop after 3 failed heartbeats |
| `GRACEFUL_EXIT_TIMEOUT_MS` | 5000 | Timeout for graceful release (5 seconds) |
| `GRACEFUL_EXIT_RETRIES` | 3 | Number of retry attempts for release |

**Stale Threshold** (configurable via `lib/claim/stale-threshold.js`):
- **Default**: 5 minutes (300 seconds) - Sessions with no heartbeat for >5 min are marked stale
- The threshold is used by both the database view and the display-layer claim analysis

**Exit Handlers** (registered once per session):
- **SIGINT** (Ctrl+C): Graceful release -> exit(0)
- **SIGTERM**: Graceful release -> exit(0)
- **beforeExit**: Async-safe release attempt
- **exit**: Sync cleanup (clears interval, logs exit)

### Rationale

**30-second interval**:
- Satisfies FR-5 requirement (heartbeat updates every 60 seconds - we do 30s for margin)
- Low overhead (~0.1% CPU impact)
- Quick enough to detect stale sessions within 5 minutes

**5-minute stale threshold**:
- Allows for temporary network issues
- Prevents false positives from brief connection drops
- Long enough that manual recovery is not disruptive

## Monitoring

### Stale Session Detection

Use the enhanced `v_active_sessions` view to monitor session health:

```sql
-- Find stale sessions (>5 min since heartbeat)
SELECT session_id, sd_id, heartbeat_age_human, seconds_until_stale
FROM v_active_sessions
WHERE computed_status = 'stale';

-- Find sessions approaching stale (>3 min, <5 min)
SELECT session_id, sd_id, heartbeat_age_seconds, seconds_until_stale
FROM v_active_sessions
WHERE heartbeat_age_seconds > 180 AND heartbeat_age_seconds <= 300;
```

### Session Health Check

```sql
-- Get all active sessions with health indicators
SELECT
  session_id,
  sd_id,
  heartbeat_age_human,
  computed_status,
  CASE
    WHEN heartbeat_age_seconds < 60 THEN 'Healthy'
    WHEN heartbeat_age_seconds < 180 THEN 'Warning'
    ELSE 'Critical'
  END as health_status
FROM v_active_sessions
WHERE computed_status != 'released'
ORDER BY heartbeat_age_seconds DESC;
```

## Troubleshooting

### Heartbeat Not Starting

**Symptom**: `startHeartbeat()` returns `{ success: true, message: 'Heartbeat already active for this session' }`

**Cause**: Heartbeat is already running for the same session (not an error - idempotent behavior)

**Solution**: No action needed - heartbeat is already active

**If you need to restart**:
```javascript
heartbeatManager.stopHeartbeat();
heartbeatManager.startHeartbeat(sessionId);
```

### Consecutive Failures

**Symptom**: Heartbeat stops automatically after 3 failures

**Possible Causes**:
1. Database connection issues
2. RPC function `update_session_heartbeat` does not exist
3. Session ID is invalid

**Diagnosis**:
```javascript
const stats = heartbeatManager.getHeartbeatStats();
console.log('Consecutive failures:', stats.consecutiveFailures);
```

### Session Marked as Stale

**Symptom**: Session shows `computed_status = 'stale'` in `v_active_sessions`

**Solution**:
- Check if heartbeat is running: `isHeartbeatActive()`
- Restart heartbeat if stopped: `startHeartbeat(sessionId)`
- Verify `heartbeat_at` is updating in database

### Orphaned Session Detection

**Symptom**: Session exists in database but process is not running

**Diagnosis**:
```javascript
const pid = 12345; // Get from claude_sessions.pid column
const isRunning = heartbeatManager.isProcessRunning(pid);
if (!isRunning) {
  console.log('Orphaned session detected');
}
```

**Automatic Cleanup**: Cleanup workers will detect and mark these sessions using `report_pid_validation_failure()`. Additionally, `npm run sd:next` now auto-releases stale-dead claims during display (see [Display-Layer Claim Analysis](#display-layer-claim-analysis)).

### Graceful Exit Failures

**Symptom**: Session not released on Ctrl+C or normal exit

**Possible Causes**:
1. **Exit timeout**: Release took >5 seconds (falls back to heartbeat cleanup)
2. **Multiple SIGINT**: User hit Ctrl+C multiple times rapidly
3. **Database unavailable**: Connection lost during exit

**Diagnosis**: Check logs for "Release attempt X/3 failed" messages

**Fallback**: Stale session cleanup will handle it within 5 minutes

## Performance Impact

- **CPU**: ~0.1% (one RPC call every 30s)
- **Network**: ~0.5 KB/min (UPDATE query + response)
- **Database**: Minimal (indexed UPDATE on primary key)

## Security Considerations

- **Session ID**: Must be treated as a secret (identifies active Claude session)
- **No external exposure**: Heartbeat RPC is internal only (no public endpoint)
- **Rate limiting**: 30-second interval prevents abuse

## Session-Specific Status Line Files (US-006)

The Heartbeat Manager coordinates with the status line system to prevent multi-session file collisions.

### Problem Solved

**Before**: Single shared status line file (`.claude/status-line/leo-status.json`)
- Multiple sessions overwrote each other's status
- Caused display flicker and state corruption
- No isolation between concurrent sessions

**After**: Session-specific status line files (`.claude/status-line/session_{id}.json`)
- Each session writes to its own file
- No cross-session interference
- Automatic cleanup on session release

### Integration

**Status Line Cleanup Flow**:

1. **Session Start**: `leo-status-line.js` creates `.claude/status-line/session_{id}.json`
2. **Session Active**: Status updates write to session-specific file
3. **Session End**: `releaseSessionWithRetry()` calls `statusLine.cleanup()`
4. **Cleanup**: Session-specific file is deleted

### Example

```javascript
// Status line now session-aware
const statusLine = new StatusLine(sessionId);  // Uses session_{id}.json

// On exit, heartbeat manager cleans up
await releaseSessionWithRetry('graceful_exit');  // Calls statusLine.cleanup()
```

### Stale File Cleanup

Stale status line files (>5 min old, no matching active session) are automatically cleaned up:

```javascript
// Called periodically by cleanup workers
StatusLine.cleanupStaleFiles();  // Static method
```

## SD Claims via claude_sessions (Updated 2026-02-22)

### Single-Table Claim Model

Claims are now managed exclusively through the `claude_sessions` table. The former `sd_claims` table has been dropped.

**Key Concept**: An "active" claim is a `claude_sessions` row where `sd_id IS NOT NULL` and `status IN ('active', 'idle')`. The database enforces uniqueness on active claims via a partial unique index.

**How It Works**:
1. **Session claims SD**: `claim_sd()` RPC sets `claude_sessions.sd_id` (active claim)
2. **Heartbeat maintains liveness**: Heartbeat updates on `claude_sessions` indicate session is alive
3. **Session releases SD**: `release_sd()` RPC sets `sd_id = NULL`, `released_at = NOW()` (claim released)
4. **Display layer classifies**: `sd:next` uses `analyzeClaimRelationship()` to show rich status badges

**Benefits**:
- Single source of truth for both session and claim state
- No cross-table synchronization needed
- Display layer provides real-time claim health via PID liveness checks
- Stale-dead claims auto-released during `sd:next` display

**Related Files**:
- **Claim Guard**: `lib/claim-guard.mjs` - `isSameConversation()`, claim acquisition
- **Claim Analysis**: `scripts/modules/sd-next/claim-analysis.js` - Display-layer classification
- **Stale Threshold**: `lib/claim/stale-threshold.js` - Configurable stale threshold
- **Ops Doc**: `docs/06_deployment/multi-session-coordination-ops.md`

## Related Documentation

- Migration: [20260201_intelligent_session_lifecycle.sql](../database/migrations/20260201_intelligent_session_lifecycle.sql)
- Session Management: [session-manager.mjs](../../lib/session-manager.mjs)
- Status Line Integration: [leo-status-line.js](../../scripts/leo-status-line.js)
- Operations: [Multi-Session Coordination Ops](../06_deployment/multi-session-coordination-ops.md)
- Database View: [v_session_metrics](../database/README.md#v_session_metrics)
- NPM Scripts: [npm-scripts-guide.md](./npm-scripts-guide.md) - `sd:next` command reference

## References

- **SD**: SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001
- **Quick-Fix**: QF-20260213-620
- **User Stories**: US-001 (Terminal Identity), US-002 (Graceful Release), US-003 (PID Validation), US-004 (Stale Cleanup), US-005 (Observability), US-006 (Status Line Files)
- **FR-3**: Graceful exit with 5s timeout and exponential backoff
- **FR-4**: PID validation for orphaned session detection
- **FR-5**: Heartbeat auto-update mechanism (30s interval, 5min stale threshold)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2026-02-22 | Added display-layer claim analysis section; updated SD claims section to reflect single-table model (claude_sessions only, sd_claims dropped); documented claim relationship classification and auto-release behavior in sd:next |
| 1.1.0 | 2026-02-13 | Added SD claims lifecycle awareness (QF-20260213-620), session-specific status line files |
| 1.0.0 | 2026-02-01 | Initial heartbeat manager documentation |
