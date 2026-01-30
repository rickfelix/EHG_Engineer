# Heartbeat Manager Reference

**Category**: Reference
**Status**: Approved
**Version**: 1.0.0
**Author**: Claude (Infrastructure Agent)
**Last Updated**: 2026-01-30
**Tags**: session-management, heartbeat, liveness, monitoring
**SD**: SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001

## Overview

The Heartbeat Manager (`lib/heartbeat-manager.mjs`) provides automatic heartbeat updates for Claude Code sessions. It ensures the database accurately reflects session liveness by updating the `heartbeat_at` timestamp every 30 seconds.

## Purpose

**Problem**: Without heartbeat updates, the system cannot distinguish between:
- Active sessions (Claude is working)
- Stale sessions (Claude crashed or user closed terminal)
- Zombie sessions (session exists but no activity)

**Solution**: Automatic heartbeat pings every 30 seconds indicate the session is still alive. Sessions with no heartbeat for >5 minutes are considered stale.

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

#### `forceHeartbeat(sessionId)`

Manually triggers a single heartbeat update (does not start interval).

**Parameters**:
- `sessionId` (string): The session ID to heartbeat

**Returns**: `{ success: boolean, timestamp?: string, error?: string }`

**Use Case**: Manual heartbeat ping without starting the automatic interval.

**Example**:
```javascript
const result = await heartbeatManager.forceHeartbeat('session_abc123');
if (result.success) {
  console.log(`Manual heartbeat: ${result.timestamp}`);
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

### Database RPC Function

The heartbeat manager calls the `update_session_heartbeat` RPC function:

```sql
-- Expected signature (to be implemented)
CREATE OR REPLACE FUNCTION update_session_heartbeat(p_session_id TEXT)
RETURNS JSONB AS $$
BEGIN
  UPDATE claude_sessions
  SET heartbeat_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'heartbeat_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;
```

## Configuration

### Constants (Hardcoded)

| Constant | Value | Purpose |
|----------|-------|---------|
| `HEARTBEAT_INTERVAL_MS` | 30000 | Heartbeat interval (30 seconds) |
| `MAX_CONSECUTIVE_FAILURES` | 3 | Stop after 3 failed heartbeats |

**Stale Threshold** (not in heartbeat manager, defined in view):
- **5 minutes** (300 seconds) - Sessions with no heartbeat for >5 min are marked stale

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

**Symptom**: `startHeartbeat()` returns `{ success: false, error: 'already running' }`

**Solution**: Stop existing heartbeat first:
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

## Performance Impact

- **CPU**: ~0.1% (one RPC call every 30s)
- **Network**: ~0.5 KB/min (UPDATE query + response)
- **Database**: Minimal (indexed UPDATE on primary key)

## Security Considerations

- **Session ID**: Must be treated as a secret (identifies active Claude session)
- **No external exposure**: Heartbeat RPC is internal only (no public endpoint)
- **Rate limiting**: 30-second interval prevents abuse

## Related Documentation

- Migration: ../database/migrations/multi-session-pessimistic-locking.md
- Session Management: ../../lib/session-manager.mjs
- View Documentation: ../database/README.md (v_active_sessions section)

## References

- **SD**: SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001
- **FR-5**: Heartbeat auto-update mechanism (30s interval, 5min stale threshold)
- **Integration**: BaseExecutor (start on claim), helpers.js (stop on release)
