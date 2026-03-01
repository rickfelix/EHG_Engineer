---
category: deployment
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [deployment, auto-generated]
---
# Multi-Session Coordination Operational Runbook


## Table of Contents

- [Overview](#overview)
- [System Components](#system-components)
  - [1. Database Constraints](#1-database-constraints)
  - [2. Heartbeat Manager](#2-heartbeat-manager)
  - [3. Enhanced Views](#3-enhanced-views)
- [Deployment](#deployment)
  - [Initial Deployment](#initial-deployment)
  - [Rollback](#rollback)
- [Monitoring](#monitoring)
  - [Session Health Dashboard](#session-health-dashboard)
  - [Stale Session Detection](#stale-session-detection)
  - [Approaching Stale Sessions](#approaching-stale-sessions)
- [Troubleshooting](#troubleshooting)
  - [Manual Claim Release (Single Table — As of v5.0.0)](#manual-claim-release-single-table-as-of-v500)
  - [Issue: Session Claim Rejected (GATE_MULTI_SESSION_CLAIM_CONFLICT)](#issue-session-claim-rejected-gate_multi_session_claim_conflict)
  - [Issue: Heartbeat Not Starting](#issue-heartbeat-not-starting)
  - [Issue: Consecutive Heartbeat Failures](#issue-consecutive-heartbeat-failures)
  - [Issue: Unique Violation on Claim](#issue-unique-violation-on-claim)
  - [Issue: is_working_on Not Syncing](#issue-is_working_on-not-syncing)
- [Performance Impact](#performance-impact)
  - [Database Overhead](#database-overhead)
  - [Scaling Considerations](#scaling-considerations)
- [Maintenance](#maintenance)
  - [Regular Checks (Daily)](#regular-checks-daily)
  - [Weekly Checks](#weekly-checks)
- [Security Considerations](#security-considerations)
  - [Session ID Protection](#session-id-protection)
  - [Access Control](#access-control)
- [Related Documentation](#related-documentation)
- [Support](#support)
  - [Log Files](#log-files)
  - [Escalation](#escalation)
- [Lifecycle Event Monitoring (SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001)](#lifecycle-event-monitoring-sd-leo-infra-intelligent-session-lifecycle-001)
  - [Session Lifecycle Events Table](#session-lifecycle-events-table)
  - [Lifecycle Event Queries](#lifecycle-event-queries)
  - [Terminal Identity Management](#terminal-identity-management)
  - [Batch Cleanup Operations](#batch-cleanup-operations)
  - [Session Metrics View](#session-metrics-view)
  - [Handoff Resolution Tracking (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-018)](#handoff-resolution-tracking-sd-learn-fix-address-pattern-learn-018)
- [Git Worktree Automation (SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001)](#git-worktree-automation-sd-leo-infra-git-worktree-automation-001)
  - [Overview](#overview)
  - [Components](#components)
  - [Usage](#usage)
  - [Branch Guard Protection](#branch-guard-protection)
  - [Operational Patterns](#operational-patterns)
  - [Troubleshooting](#troubleshooting)
  - [Integration with Multi-Session Claims](#integration-with-multi-session-claims)
  - [Cleanup and Maintenance](#cleanup-and-maintenance)
  - [Related Features](#related-features)
- [Ship Process Safety (SD-LEO-FIX-MULTI-SESSION-SHIP-001)](#ship-process-safety-sd-leo-fix-multi-session-ship-001)
  - [Overview](#overview)
  - [Components](#components)
  - [Deployment](#deployment)
  - [Monitoring](#monitoring)
  - [Troubleshooting](#troubleshooting)
  - [Performance Impact](#performance-impact)
  - [Security Considerations](#security-considerations)
  - [Best Practices](#best-practices)
  - [Related Documentation](#related-documentation)
- [Session Creation Heartbeat Guard (Migration: 20260213)](#session-creation-heartbeat-guard-migration-20260213)
  - [Overview](#overview)
  - [Components](#components)
  - [Behavioral Changes](#behavioral-changes)
  - [Monitoring](#monitoring)
  - [Troubleshooting](#troubleshooting)
  - [Deployment](#deployment)
  - [Related Documentation](#related-documentation)
- [Changelog](#changelog)

**Category**: Deployment
**Status**: Approved
**Version**: 5.0.0
**Author**: Claude (Infrastructure Agent)
**Last Updated**: 2026-02-18
**Tags**: session-management, operations, monitoring, troubleshooting, ship-safety, git-operations
**SD**: SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001, SD-LEO-FIX-MULTI-SESSION-SHIP-001, SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001

## Overview

This runbook provides operational guidance for the Multi-Session Coordination system, which prevents multiple Claude Code sessions from claiming the same Strategic Directive simultaneously.

## System Components

### 1. Database Constraints

**Unique Index (claude_sessions)**: `idx_claude_sessions_unique_active_claim`
- **Purpose**: Enforces single active session per SD at database level
- **Location**: `claude_sessions` table
- **Condition**: `WHERE sd_id IS NOT NULL AND status = 'active'`

**⚠️ REMOVED**: `sd_claims` table was dropped in SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001 (2026-02-18).
The `sd_claims_active_unique` partial index no longer exists. All claim state now lives exclusively in `claude_sessions`.

**Trigger**: `sync_is_working_on_trigger`
- **Purpose**: Automatically syncs `is_working_on` flag when sessions claim/release SDs
- **Location**: `claude_sessions` table (AFTER UPDATE)
- **Function**: `sync_is_working_on_with_session()`

### 2. Heartbeat Manager

**Module**: `lib/heartbeat-manager.mjs`
- **Interval**: 30 seconds
- **Stale Threshold**: 5 minutes (300 seconds)
- **Max Consecutive Failures**: 3

**Functions**:
- `startHeartbeat(sessionId)` - Start automatic heartbeat updates
- `stopHeartbeat()` - Stop heartbeat interval
- `isHeartbeatActive()` - Check heartbeat status
- `getHeartbeatStats()` - Get detailed heartbeat statistics
- `forceHeartbeat(sessionId)` - Manual heartbeat ping

### 3. Enhanced Views

**View**: `v_active_sessions`
- Provides real-time session monitoring
- Includes heartbeat age, staleness countdown, computed status
- See: [Database README - Enhanced Views](../database/README.md#enhanced-views)

## Deployment

### Initial Deployment

**Prerequisites**:
- PostgreSQL 14+ (for partial unique indexes)
- Supabase service role access
- Database: `dedlbzhpgkmetvhbkyzq`

**Execution**:
```bash
# Option 1: Supabase Dashboard (Recommended)
# Navigate to https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
# Go to SQL Editor
# Paste contents of database/migrations/20260130_multi_session_pessimistic_locking.sql
# Click "Run"

# Option 2: Supabase CLI
npx supabase db push

# Option 3: psql (requires connection pooler URL)
psql "postgresql://postgres.PROJECT:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
  < database/migrations/20260130_multi_session_pessimistic_locking.sql
```

**Verification**:
```sql
-- Verify unique index exists (claude_sessions)
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname = 'idx_claude_sessions_unique_active_claim';

-- Verify trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'sync_is_working_on_trigger';

-- Test enhanced view
SELECT session_id, sd_id, heartbeat_age_seconds, heartbeat_age_human, computed_status
FROM v_active_sessions
LIMIT 5;
```

### Rollback

If issues arise:
```sql
-- Remove trigger
DROP TRIGGER IF EXISTS sync_is_working_on_trigger ON claude_sessions;
DROP FUNCTION IF EXISTS sync_is_working_on_with_session();

-- Remove unique index (claude_sessions)
DROP INDEX IF EXISTS idx_claude_sessions_unique_active_claim;

-- Note: sd_claims table was dropped — no sd_claims rollback needed

-- Restore old view (without heartbeat enhancements)
-- See migration file for full rollback script
```

## Monitoring

### Session Health Dashboard

**Query**: Show all active sessions with health indicators
```sql
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

**Expected Results**:
- **Healthy**: Heartbeat <60 seconds (green)
- **Warning**: Heartbeat 60-180 seconds (yellow)
- **Critical**: Heartbeat >180 seconds (red, approaching stale)

### Stale Session Detection

**Query**: Find sessions that have gone stale
```sql
SELECT session_id, sd_id, heartbeat_age_human, seconds_until_stale
FROM v_active_sessions
WHERE computed_status = 'stale';
```

**Alert Threshold**: Sessions with no heartbeat for >5 minutes

**Action**:
1. Check if session is still running (terminal/IDE check)
2. If crashed: Release claim via `release_sd()` RPC
3. If stuck: Investigate heartbeat failures in logs

### Approaching Stale Sessions

**Query**: Sessions at risk of going stale (>3 min, <5 min)
```sql
SELECT session_id, sd_id, heartbeat_age_seconds, seconds_until_stale
FROM v_active_sessions
WHERE heartbeat_age_seconds > 180 AND heartbeat_age_seconds <= 300;
```

**Proactive Action**: Warning notification to user

## Troubleshooting

### Manual Claim Release (Single Table — As of v5.0.0)

**When**: GATE_MULTI_SESSION_CLAIM_CONFLICT blocks handoff due to stale/mismatch claim.

**Check current claim**:
```sql
SELECT session_id, sd_id, status, terminal_id, heartbeat_at
FROM claude_sessions
WHERE sd_id = 'SD-XXX-001' AND status = 'active';
```

**Release claim** (update claude_sessions only — sd_claims no longer exists):
```sql
UPDATE claude_sessions
SET sd_id = NULL, status = 'idle', released_at = NOW(), released_reason = 'manual'
WHERE session_id = 'session_abc123';
```

**Verify cleared**:
```sql
SELECT * FROM v_active_sessions WHERE sd_id = 'SD-XXX-001';
-- Should return 0 rows
```

---

### Issue: Session Claim Rejected (GATE_MULTI_SESSION_CLAIM_CONFLICT)

**Symptom**: `sd:start` or handoff returns "already_claimed" / GATE_MULTI_SESSION_CLAIM_CONFLICT

**Diagnosis**:
```sql
SELECT session_id, sd_id, heartbeat_age_human, hostname, tty, computed_status
FROM v_active_sessions
WHERE sd_id = 'SD-XXX-001' AND computed_status = 'active';
```

**Resolution**:
- **If owner is active (heartbeat <5min)**: Wait for owner to finish
- **If owner is stale (heartbeat >5min)**: Force release via `release_sd()` RPC
- **If stale manual release needed**: Use the "Manual Claim Release" steps above

### Issue: Heartbeat Not Starting

**Symptom**: `startHeartbeat()` returns `{ success: false, error: 'already running' }`

**Diagnosis**:
```javascript
const heartbeatManager = require('./lib/heartbeat-manager.mjs');
const stats = heartbeatManager.getHeartbeatStats();
console.log('Active:', stats.isActive);
console.log('Session:', stats.sessionId);
```

**Resolution**:
```javascript
heartbeatManager.stopHeartbeat();
heartbeatManager.startHeartbeat(sessionId);
```

### Issue: Consecutive Heartbeat Failures

**Symptom**: Heartbeat stops automatically after 3 failures

**Diagnosis**:
```javascript
const stats = heartbeatManager.getHeartbeatStats();
console.log('Consecutive failures:', stats.consecutiveFailures);
console.log('Healthy:', stats.healthy);
```

**Possible Causes**:
1. **Database connection issues**: Check Supabase connectivity
2. **RPC function missing**: Verify `update_session_heartbeat` exists
3. **Invalid session ID**: Verify session exists in `claude_sessions`

**Resolution**:
1. Fix underlying issue (DB connection, missing RPC, etc.)
2. Restart heartbeat: `heartbeatManager.startHeartbeat(sessionId)`

### Issue: Unique Violation on Claim

**Symptom**: `claim_sd()` returns `race_condition` error or unique constraint violation on `idx_claude_sessions_unique_active_claim`

**Explanation**: Another session claimed the SD between check and update (race condition caught by the partial unique index on `claude_sessions` WHERE sd_id IS NOT NULL AND status='active').

**Resolution**: This is expected behavior - retry or pick a different SD. The constraint ensures only ONE active claim per SD. After release (status → idle, sd_id → NULL), the same SD can be claimed again without any manual cleanup.

**Note**: As of SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001 (2026-02-18), `sd_claims` table is dropped. Claim enforcement is entirely via `claude_sessions`.

### Issue: is_working_on Not Syncing

**Symptom**: `strategic_directives_v2.is_working_on` doesn't update on claim/release

**Diagnosis**:
```sql
-- Check if trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'sync_is_working_on_trigger';

-- Check SD state
SELECT sd_key, is_working_on, active_session_id
FROM strategic_directives_v2
WHERE sd_key = 'SD-XXX-001';

-- Check session state
SELECT session_id, sd_id, status
FROM claude_sessions
WHERE session_id = 'session_abc123';
```

**Resolution**:
1. If trigger missing: Re-run migration
2. If trigger exists but not firing: Check function logic
3. Manual fix (temporary):
   ```sql
   UPDATE strategic_directives_v2
   SET is_working_on = true, active_session_id = 'session_abc123'
   WHERE sd_key = 'SD-XXX-001';
   ```

## Performance Impact

### Database Overhead

| Component | Impact | Notes |
|-----------|--------|-------|
| Unique Index (claude_sessions) | Minimal | Indexed on primary key (sd_id) |
| ~~Unique Partial Index (sd_claims)~~ | Removed | sd_claims table dropped 2026-02-18 |
| Trigger | Low | Only fires on UPDATE to claude_sessions |
| View Query | Low | Computed fields calculated on read |
| Heartbeat RPC | Minimal | One UPDATE every 30s per session |

**Estimated Totals**:
- **CPU**: ~0.1% per active session
- **Network**: ~0.5 KB/min per session
- **Database I/O**: ~2 UPDATE/min per session

### Scaling Considerations

**Current Capacity**:
- Unique indexes support unlimited concurrent sessions
- Heartbeat mechanism scales linearly with active sessions
- View query performance: <10ms for up to 100 active sessions

**Monitoring**:
```sql
-- Count active sessions
SELECT COUNT(*) FROM v_active_sessions WHERE computed_status = 'active';

-- Average heartbeat age
SELECT AVG(heartbeat_age_seconds) FROM v_active_sessions WHERE computed_status = 'active';
```

## Maintenance

### Regular Checks (Daily)

1. **Stale Session Cleanup**:
   ```sql
   -- Find stale sessions
   SELECT * FROM v_active_sessions WHERE computed_status = 'stale';

   -- Release if needed
   -- (manual release via release_sd() RPC)
   ```

2. **Heartbeat Health**:
   ```sql
   SELECT
     COUNT(*) FILTER (WHERE heartbeat_age_seconds < 60) as healthy,
     COUNT(*) FILTER (WHERE heartbeat_age_seconds BETWEEN 60 AND 180) as warning,
     COUNT(*) FILTER (WHERE heartbeat_age_seconds > 180) as critical
   FROM v_active_sessions
   WHERE computed_status = 'active';
   ```

### Weekly Checks

1. **Index Maintenance**:
   ```sql
   -- Check index bloat (if performance degrades)
   REINDEX INDEX idx_claude_sessions_unique_active_claim;
   -- sd_claims_active_unique no longer exists (sd_claims dropped 2026-02-18)
   ```

2. **View Performance**:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM v_active_sessions;
   ```

## Security Considerations

### Session ID Protection

- **Session IDs are secrets**: Identify active Claude sessions
- **No external exposure**: Heartbeat RPC is internal only
- **Rate limiting**: 30-second interval prevents abuse

### Access Control

- **Service role required**: Only service role can call `update_session_heartbeat`
- **RLS policies**: Enforce session ownership on `claude_sessions` table

## Related Documentation

- **Migration**: [Multi-Session Pessimistic Locking](../database/migrations/multi-session-pessimistic-locking.md)
- **Migration**: SD Claims Lifecycle-Aware Constraint
- **API Reference**: [Heartbeat Manager](../reference/heartbeat-manager.md)
- **Database**: [Database README - Enhanced Views](../database/README.md#enhanced-views)
- **Session Management**: `lib/session-manager.mjs`

## Support

### Log Files

Heartbeat activity logged to:
- Console: Heartbeat start/stop events
- Errors: Consecutive failure warnings

### Escalation

1. **Database issues**: Check Supabase dashboard for alerts
2. **Performance issues**: Run EXPLAIN ANALYZE on slow queries
3. **Trigger issues**: Review function source in database

## Lifecycle Event Monitoring (SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001)

### Session Lifecycle Events Table

All session lifecycle transitions are logged to `session_lifecycle_events` for auditing and debugging.

**Event Types**:
- `created` - New session created
- `claimed` - SD claimed by session
- `released` - Session released (graceful exit)
- `heartbeat` - Heartbeat update (not logged by default)
- `stale_detected` - Session marked as stale
- `stale_cleanup` - Stale session cleaned up
- `terminal_replaced` - Session replaced by same-terminal new session

### Lifecycle Event Queries

**Query Recent Events**:
```sql
SELECT
  session_id,
  event_type,
  event_data,
  occurred_at
FROM session_lifecycle_events
WHERE occurred_at > NOW() - INTERVAL '24 hours'
ORDER BY occurred_at DESC
LIMIT 50;
```

**Query Events by Session**:
```sql
SELECT
  event_type,
  event_data,
  occurred_at
FROM session_lifecycle_events
WHERE session_id = 'session_abc123'
ORDER BY occurred_at ASC;
```

**Session Lifecycle Summary (Last 24h)**:
```sql
SELECT
  event_type,
  COUNT(*) as event_count,
  MIN(occurred_at) as first_occurrence,
  MAX(occurred_at) as last_occurrence
FROM session_lifecycle_events
WHERE occurred_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY event_count DESC;
```

### Terminal Identity Management

**Centralized Implementation** (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-018):
- All terminal identity logic consolidated in `lib/terminal-identity.js`
- Single source of truth prevents false multi-session claim conflicts
- Eliminates duplication across session-manager, claim-gate, and BaseExecutor

**Implementation Details**:
```javascript
// lib/terminal-identity.js
export function getTerminalId() {
  if (process.platform === 'win32') {
    // Windows: PowerShell console SessionId (more reliable than PPID)
    const cmd = `powershell -Command "(Get-Process -Id ${process.pid}).SessionId"`;
    const sessionId = execSync(cmd).trim();
    if (sessionId && /^\d+$/.test(sessionId)) {
      return `win-session-${sessionId}`;
    }
    // Fallback to PPID if PowerShell unavailable
    return `win-ppid-${process.ppid || process.pid}`;
  }
  // Unix: TTY device path (hashed for cleaner ID)
  const tty = execSync('tty').trim();
  return `tty-${crypto.createHash('sha256').update(tty).digest('hex').substring(0, 12)}`;
}
```

**Why Centralized?**
- **Before**: Terminal identity logic duplicated in 3 files, causing cascade failures when implementations diverged
- **After**: Single shared utility, consistent behavior across all claim checks
- **Pattern**: PAT-AUTO-e646ab92 (terminal identity duplication) → resolved

**Files Using Centralized Utility**:
- `lib/session-manager.mjs` - Session creation
- `scripts/modules/handoff/gates/multi-session-claim-gate.js` - Claim conflict detection
- `scripts/modules/handoff/executors/BaseExecutor.js` - Handoff execution context

**Issue: Session Auto-Released Unexpectedly**

**Symptom**: New session starts and previous session on same terminal is auto-released

**Diagnosis**:
```sql
SELECT
  session_id,
  terminal_identity,
  status,
  created_at,
  released_at,
  released_reason
FROM claude_sessions
WHERE terminal_identity LIKE '%your_terminal%'
ORDER BY created_at DESC
LIMIT 5;
```

**Resolution**: This is expected behavior (US-001: Terminal Identity Auto-Release).
- Same terminal starting new session → old session auto-released
- To run multiple concurrent sessions, use different terminals

### Batch Cleanup Operations

**Manual Batch Cleanup**:
```sql
SELECT cleanup_stale_sessions(
  NOW() - INTERVAL '5 minutes',  -- stale threshold
  'your_machine_id'              -- machine_id for PID validation
);
```

**Monitor Cleanup Performance**:
```sql
SELECT
  released_reason,
  COUNT(*) as cleanup_count
FROM claude_sessions
WHERE released_at > NOW() - INTERVAL '24 hours'
  AND released_reason IN ('stale_cleanup', 'new_session_same_terminal')
GROUP BY released_reason;
```

### Session Metrics View

**Query Overall Session Health**:
```sql
SELECT * FROM v_session_metrics;
```

**Expected Fields**:
- `total_sessions` - Sessions in last 24 hours
- `active_sessions` - Currently active
- `stale_sessions` - Sessions past stale threshold
- `avg_heartbeat_age` - Average heartbeat age (active sessions)
- `graceful_exits` - Count of graceful exits
- `stale_cleanups` - Count of stale cleanups
- `terminal_replacements` - Count of same-terminal replacements

### Handoff Resolution Tracking (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-018)

**Purpose**: Track lifecycle of handoff failures and their resolution, preventing permanently blocked SDs.

**Database Schema**:
```sql
ALTER TABLE sd_phase_handoffs
ADD COLUMN resolved_at TIMESTAMPTZ,
ADD COLUMN resolution_type TEXT,
ADD COLUMN resolution_notes TEXT;

-- Partial index for efficient unresolved-only queries
CREATE INDEX idx_sd_phase_handoffs_unresolved
ON sd_phase_handoffs (sd_id, handoff_type, status)
WHERE resolved_at IS NULL;
```

**Resolution Lifecycle**:
1. **Handoff fails** → status='rejected'/'failed'/'blocked', resolved_at=NULL
2. **Issue diagnosed** → resolution_notes updated
3. **Issue fixed, retry succeeds** → resolved_at=NOW(), resolution_type='retry_succeeded'
4. **Issue no longer blocking** → resolved_at=NOW(), resolution_type='obsolete'
5. **Issue escalated to new SD** → resolved_at=NOW(), resolution_type='escalated_to_sd'

**Resolution Types**:
- `retry_succeeded` - Handoff retried and passed after fixes
- `obsolete` - Issue no longer relevant (SD cancelled, approach changed)
- `escalated_to_sd` - Created dedicated SD to address root cause
- `manual_override` - Human decision to mark as resolved

**Why This Matters**:
- **Before**: Failed handoffs permanently blocked transition-readiness gate, even after fixes
- **After**: Gate only checks UNRESOLVED failures (WHERE resolved_at IS NULL)
- **Pattern**: PAT-AUTO-e74d3e36 (permanently blocked handoffs) → resolved

**Query Unresolved Failures**:
```sql
SELECT
  id,
  sd_id,
  handoff_type,
  status,
  rejection_reason,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_blocked
FROM sd_phase_handoffs
WHERE status IN ('rejected', 'failed', 'blocked')
  AND resolved_at IS NULL
ORDER BY created_at ASC;
```

**Mark Failure as Resolved**:
```sql
UPDATE sd_phase_handoffs
SET
  resolved_at = NOW(),
  resolution_type = 'retry_succeeded',
  resolution_notes = 'Fixed terminal identity duplication, retry passed at 97%'
WHERE id = 'handoff-uuid-here';
```

**Monitor Resolution Effectiveness**:
```sql
SELECT
  resolution_type,
  COUNT(*) as resolution_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours_to_resolution
FROM sd_phase_handoffs
WHERE resolved_at IS NOT NULL
  AND resolved_at > NOW() - INTERVAL '30 days'
GROUP BY resolution_type
ORDER BY resolution_count DESC;
```

**Related Components**:
- **Gate**: `scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js`
- **Migration**: `database/migrations/20260209_handoff_resolution_tracking.sql`
- **Schema**: `docs/reference/schema/engineer/tables/sd_phase_handoffs.md`

## Git Worktree Automation (SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001)

### Overview

Git worktree automation provides isolated git working trees for concurrent Claude Code sessions, preventing cross-session contamination when multiple sessions work on different SDs simultaneously.

**Use Cases**:
- Developer working on Track A (infrastructure) and Track B (features) in parallel
- Hotfix while feature work is in progress
- Testing different approaches concurrently

### Components

**CLI Tool**: `scripts/session-worktree.js`
- Creates isolated worktrees under `.worktrees/<sdKey>/` (SD-keyed)
- Symlinks node_modules (junction on Windows, symlink on Unix)
- Manages worktree lifecycle (create, list, cleanup)
- Supports `--sd-key` (primary) and deprecated `--session` alias

**Core Library**: `lib/worktree-manager.js`
- `createWorktree({sdKey, branch})` - Create SD-keyed worktree
- `cleanupWorktree(sdKey)` - Safe cleanup with dirty-state protection
- `symlinkNodeModules()` - Link node_modules to avoid reinstall
- `removeWorktree()` - Clean up worktree
- `listWorktrees()` - Show active SD worktrees
- `resolveExpectedBranch()` - Resolve expected branch from `.worktree.json` or `v_active_sessions`

**Branch Guard**: `.husky/pre-commit` Stage 0.1
- Blocks commits when current branch != expected branch (from `.session.json`)
- Prevents accidental commits to wrong SD's branch

### Usage

**Create Worktree**:
```bash
npm run session:worktree -- --session track-a --branch feat/SD-INFRA-001-feature
```

**List Active Worktrees**:
```bash
npm run session:worktree -- --list
```

**Cleanup Worktree**:
```bash
npm run session:worktree -- --cleanup --session track-a
```

**Options**:
- `--session <name>` - Session name (directory name under `.sessions/`)
- `--branch <branch>` - Branch to check out
- `--force` - Force recreate if exists with different branch
- `--no-symlink` - Skip node_modules symlink
- `--list` - List all active worktrees
- `--cleanup` - Remove worktree and deregister

### Branch Guard Protection

The pre-commit hook (Stage 0.1) reads `.session.json` from the worktree and blocks commits if the current branch doesn't match the expected branch.

**Bypass Options**:
- `SKIP_BRANCH_GUARD=1 git commit ...` - Skip guard with warning
- `BRANCH_GUARD_ALLOW_UNKNOWN=1 git commit ...` - Allow commits when `.session.json` missing (fail-open)

**Example `.session.json`**:
```json
{
  "session": "track-a",
  "expectedBranch": "feat/SD-INFRA-001-feature",
  "createdAt": "2026-02-07T03:18:54.281Z",
  "hostname": "Legion-Laptop",
  "repoRoot": "C:/Users/rickf/Projects/_EHG/EHG_Engineer"
}
```

### Operational Patterns

**Pattern 1: Parallel Track Execution**
```bash
# Terminal 1: Infrastructure work
npm run session:worktree -- --session track-a --branch feat/SD-INFRA-001
cd .sessions/track-a
npm run sd:start SD-INFRA-001

# Terminal 2: Feature work
npm run session:worktree -- --session track-b --branch feat/SD-FEAT-002
cd .sessions/track-b
npm run sd:start SD-FEAT-002
```

**Pattern 2: Hotfix While Feature In Progress**
```bash
# Main repo on feature branch
git branch  # feat/SD-FEAT-002

# Create hotfix worktree
npm run session:worktree -- --session hotfix --branch fix/QF-20260207-001
cd .sessions/hotfix
# Work on hotfix without disturbing main repo's feature work
```

### Troubleshooting

**Issue: "Branch already used by worktree"**

**Symptom**: Error when trying to create worktree for branch that's already checked out in main repo

**Resolution**:
- Cannot create worktree for a branch that's currently checked out elsewhere
- Either checkout a different branch in main repo, or use a different branch for worktree

**Issue: "Failed to create junction for node_modules"**

**Symptom**: On Windows, junction creation fails

**Resolution**:
- Ensure main repo has `node_modules` present (run `npm ci` first)
- On Windows, may require administrator privileges
- Use `--no-symlink` flag to skip symlink creation (manual `npm ci` in worktree required)

**Issue: Branch guard blocks commit unexpectedly**

**Symptom**: Commit blocked even though on correct branch

**Diagnosis**:
```bash
cat .session.json  # Check expected branch
git branch --show-current  # Check current branch
```

**Resolution**:
- If branches match, `.session.json` may be stale — recreate worktree with `--force`
- If intentional mismatch, use `SKIP_BRANCH_GUARD=1 git commit ...`

### Integration with Multi-Session Claims

Git worktrees work alongside the multi-session claim system:

**Claim Detection**: The multi-session claim gate (PAT-SESSION-IDENTITY-001) compares by **hostname**, not session ID. Multiple CLI processes on the same machine (e.g., `sd:start` in main repo, `handoff.js` in worktree) are allowed because they're the same developer.

**Best Practice**: Use worktrees for different SDs, not for the same SD in multiple locations.

### Cleanup and Maintenance

**List All Worktrees (including stale)**:
```bash
npm run session:worktree -- --list
```

**Remove Stale Worktrees**:
```bash
# Manual cleanup
npm run session:worktree -- --cleanup --session <name>

# Or via git directly
git worktree prune
```

**Disk Space Management**:
- Each worktree shares `.git` with main repo (minimal overhead)
- node_modules is symlinked (no duplication)
- Only working tree files are duplicated

### Related Features

- **Multi-Session Claim Gate**: `scripts/modules/handoff/gates/multi-session-claim-gate.js` (hostname-based comparison)
- **Session Lifecycle**: `lib/session-manager.mjs` (session creation/release)
- **Heartbeat Manager**: `lib/heartbeat-manager.mjs` (session liveness)

## Ship Process Safety (SD-LEO-FIX-MULTI-SESSION-SHIP-001)

### Overview

Ship process safety prevents cross-session branch contamination during `/ship` operations when multiple Claude Code instances share the same repository working directory.

**Problem**: The original `ShippingExecutor.js` ran `git checkout main && git pull` after merging PRs, which switched the working directory branch for ALL sessions. This caused commits to land on wrong branches and required manual `git reflog` recovery.

**Solution**: Three-pillar approach:
1. **Safe git operations** - Replace `git checkout main` with `git fetch origin main:main`
2. **Branch-aware session tracking** - Track current branch in heartbeat, filter concurrent sessions by branch
3. **Recovery tooling** - Automated orphaned commit scanner/recovery

### Components

#### 1. Safe Git Operations (Pillar 1)

**Module**: `scripts/modules/shipping/ShippingExecutor.js`

**Changes**:
- **Replaced**: `git checkout main && git pull` (changes working directory for ALL sessions)
- **With**: `git fetch origin main:main` (updates main ref WITHOUT changing working directory)
- **Fallback**: If already on main, uses `git pull origin main` (safe since we're already there)
- **Branch validation guard**: Verifies current branch matches expected branch before merge

**Safe Sync Pattern**:
```javascript
// Multi-session safe: updates main ref without checkout
await execAsync(`cd "${this.repoPath}" && git fetch origin main:main`);
```

**Branch Validation Guard**:
```javascript
// Detect cross-session contamination before merge
if (this.context.expectedBranch) {
  const { stdout: currentBranch } = await execAsync(
    `cd "${this.repoPath}" && git rev-parse --abbrev-ref HEAD`
  );
  if (currentBranch.trim() !== this.context.expectedBranch) {
    throw new Error(
      `Branch mismatch detected! Expected '${this.context.expectedBranch}' ` +
      `but found '${currentBranch.trim()}'. Another session may have switched the branch.`
    );
  }
}
```

#### 2. Branch-Aware Session Tracking (Pillar 2)

**Database Schema**: `claude_sessions.current_branch` column
- Added by migration `20260211_ship_safety_branch_tracking_v2.sql`
- Updated automatically by heartbeat every 30 seconds
- Included in `v_active_sessions` view for monitoring

**Heartbeat Integration**: `lib/session-manager.mjs`
- Detects current git branch via `git rev-parse --abbrev-ref HEAD`
- Passes branch to `update_session_heartbeat_with_branch()` RPC
- Fallback to direct UPDATE if RPC unavailable

**Concurrent Session Detection**: `scripts/hooks/concurrent-session-worktree.cjs`
- **Before**: Sessions on same codebase were flagged as concurrent (regardless of branch)
- **After**: Only flag as concurrent if SAME codebase AND SAME branch (or main)
- **Rationale**: Different branches = expected multi-session work (parallel tracks)

**Branch Filtering Logic**:
```javascript
// Filter concurrent sessions by branch
if (branch && s.current_branch) {
  const sameBranch = s.current_branch === branch;
  const eitherOnMain = s.current_branch === 'main' || branch === 'main';
  // Different non-main branches = not concurrent
  if (!sameBranch && !eitherOnMain) return false;
}
```

#### 3. Recovery Tooling (Pillar 3)

**CLI Tool**: `scripts/git-commit-recovery.js`
- Scans `git reflog` for orphaned commits (not reachable from any branch)
- Checks both local and remote branches via `git branch -a --contains`
- Recovery creates branch `recovery/<short-sha>-<timestamp>` from orphaned commit
- Shows commit details: SHA, message, date, files changed

**NPM Script**: `npm run git:recover`
```bash
npm run git:recover              # Scan last 24 hours
npm run git:recover -- --hours 72    # Scan last 3 days
npm run git:recover -- --recover <SHA>  # Recover specific commit
```

**See**: [Git Commit Recovery Guide](../reference/git-commit-recovery-guide.md) for detailed usage

### Deployment

**Prerequisites**:
- PostgreSQL 14+ (existing requirement)
- Git 2.25+ (for `git fetch origin main:main` syntax)

**Database Migration**:
```bash
# Execute via Supabase dashboard or psql
# File: database/migrations/20260211_ship_safety_branch_tracking_v2.sql

# Migration adds:
# - current_branch column to claude_sessions
# - update_session_heartbeat_with_branch() RPC function
# - Updated v_active_sessions view with current_branch field
# - Backfills 7,898 existing sessions from metadata->>'branch'
```

**Verification**:
```sql
-- Verify current_branch column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'claude_sessions' AND column_name = 'current_branch';

-- Verify RPC function exists
SELECT proname, pronargs FROM pg_proc WHERE proname = 'update_session_heartbeat_with_branch';

-- Test updated view
SELECT session_id, sd_id, current_branch, heartbeat_age_human
FROM v_active_sessions
WHERE current_branch IS NOT NULL
LIMIT 5;
```

### Monitoring

**Query Current Branches**:
```sql
SELECT
  session_id,
  sd_id,
  current_branch,
  heartbeat_age_human,
  computed_status
FROM v_active_sessions
WHERE computed_status = 'active'
ORDER BY current_branch;
```

**Detect Branch Contamination Risk**:
```sql
-- Find multiple active sessions on same branch (potential conflict)
SELECT
  current_branch,
  COUNT(*) as session_count,
  ARRAY_AGG(session_id) as sessions
FROM v_active_sessions
WHERE computed_status = 'active'
  AND current_branch IS NOT NULL
GROUP BY current_branch
HAVING COUNT(*) > 1;
```

**Orphaned Commits Check**:
```bash
# Run recovery tool in scan mode (no changes made)
npm run git:recover

# Expected output if clean:
# ✅ No orphaned commits found in last 24 hours
```

### Troubleshooting

**Issue: Branch Mismatch Detected During Merge**

**Symptom**: `ShippingExecutor` throws error: "Branch mismatch detected! Expected 'feat/...' but found 'main'"

**Cause**: Another session ran `git checkout main` after this session created PR

**Resolution**: This is the safety guard working correctly — abort and investigate:
1. Check which session switched branches: `git reflog | grep checkout`
2. Return to expected branch: `git checkout feat/...`
3. Verify PR is still valid: `gh pr view <PR#>`
4. Retry merge if safe

**Issue: Heartbeat Not Updating current_branch**

**Symptom**: `v_active_sessions.current_branch` is NULL for active session

**Diagnosis**:
```javascript
const heartbeatManager = require('./lib/heartbeat-manager.mjs');
const stats = heartbeatManager.getHeartbeatStats();
console.log('Heartbeat active:', stats.isActive);

// Check git availability
const { execSync } = require('child_process');
const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
console.log('Current branch:', branch);
```

**Possible Causes**:
1. **Not in git repo**: Heartbeat skips branch detection if git unavailable
2. **Git command timeout**: 3s timeout may be too short on slow systems
3. **RPC function missing**: Migration not applied

**Resolution**:
1. Verify git is in PATH and repo is valid
2. Check migration was applied: `SELECT proname FROM pg_proc WHERE proname = 'update_session_heartbeat_with_branch'`
3. Force heartbeat: `heartbeatManager.forceHeartbeat(sessionId)`

**Issue: Concurrent Session False Negative**

**Symptom**: Two sessions on same branch not flagged as concurrent

**Diagnosis**:
```sql
SELECT session_id, current_branch, heartbeat_age_seconds
FROM v_active_sessions
WHERE current_branch = 'feat/SD-XXX-001';
```

**Resolution**: Check staleness threshold — sessions with heartbeat >120s (default) are filtered out. If both sessions are active (<120s heartbeat) and on same branch, they SHOULD be flagged.

**Issue: Orphaned Commit Not Detected**

**Symptom**: Know commit is orphaned but `npm run git:recover` doesn't find it

**Diagnosis**:
```bash
# Manually check reflog for commit
git reflog | grep <short-sha>

# Check if commit is actually reachable from a branch
git branch -a --contains <full-sha>
```

**Possible Causes**:
1. **Outside scan window**: Default scans last 24 hours, use `--hours` to extend
2. **Already on remote branch**: Tool checks `git branch -a` (includes remotes)
3. **Reflog expired**: Git reflog retention is 90 days by default

**Resolution**:
```bash
# Extend scan window
npm run git:recover -- --hours 168  # Last 7 days

# Manual recovery if found in reflog but not by tool
git checkout -b recovery/<short-sha> <full-sha>
```

### Performance Impact

| Component | Impact | Notes |
|-----------|--------|-------|
| `current_branch` column | Minimal | VARCHAR(255), indexed with sd_id |
| Branch detection in heartbeat | +5-10ms per heartbeat | Git command overhead |
| RPC function overhead | +2-3ms | Extra branch param in UPDATE |
| View query impact | <1ms | Single column addition |

**Estimated Totals**:
- **CPU**: +0.02% per active session
- **Network**: +0.1 KB/min per session (branch name in heartbeat)
- **Database I/O**: Same (2 UPDATE/min, slightly larger payload)

### Security Considerations

**Branch Validation Guard**:
- Prevents malicious/accidental cross-session branch switching
- Aborts merge if contamination detected (fail-safe)
- No privilege escalation risk (read-only git operations)

**Recovery Tool**:
- Read-only by default (scan mode)
- Recovery requires explicit `--recover <SHA>` flag
- Creates new branch, never modifies existing refs

### Best Practices

1. **Monitor branch alignment**: Run daily query to detect branch mismatches
2. **Regular orphan scans**: Schedule `npm run git:recover` weekly
3. **Use worktrees for parallel work**: Eliminates shared working directory issues
4. **Verify heartbeat branch tracking**: Check `v_active_sessions.current_branch` is populated

### Related Documentation

- **Migration**: Ship Safety Branch Tracking
- **Recovery Tool**: [Git Commit Recovery Guide](../reference/git-commit-recovery-guide.md)
- **Shipping Executor**: `scripts/modules/shipping/ShippingExecutor.js`
- **Session Manager**: `lib/session-manager.mjs`
- **Concurrent Session Hook**: `scripts/hooks/concurrent-session-worktree.cjs`

## Session Creation Heartbeat Guard (Migration: 20260213)

### Overview

The heartbeat guard prevents `create_or_replace_session()` from auto-releasing sessions with fresh heartbeats (<5 min) when a new Claude instance starts on the same terminal identity.

**Problem Solved**: Before this fix, starting a second Claude instance on the same terminal would unconditionally release the first instance's session, even if it had a fresh heartbeat and was actively working. This caused active sessions to lose their SD claims silently.

**Solution**: The `create_or_replace_session()` function now checks heartbeat freshness before auto-releasing. If the existing session's heartbeat is <300s old, it returns a conflict flag instead of releasing.

### Components

**Database Function**: `create_or_replace_session()`
- **Location**: `database/migrations/20260213_session_creation_heartbeat_guard.sql`
- **Behavior Change**:
  - **Before**: Always auto-released previous session on same terminal_identity
  - **After**: Only auto-releases if heartbeat >= 300s (stale)
  - **Conflict response**: Returns `{ conflict: true, conflict_session_id, conflict_sd_id, conflict_heartbeat_age_seconds }`

**Session Manager**: `lib/session-manager.mjs`
- Handles conflict response from database
- Attaches conflict metadata to session data: `{ conflict: true, conflict_session_id, conflict_sd_id }`

**SD Start**: `scripts/sd-start.js`
- Hard blocks (exit 1) when conflict targets the same SD
- Warning log when conflict targets different SD (coexistence allowed via worktrees)

**Concurrent Detection Hook**: `scripts/hooks/concurrent-session-worktree.cjs`
- Staleness window aligned from 120s to 300s to match database threshold

### Behavioral Changes

#### Scenario 1: Fresh Session (Heartbeat < 300s)

**Before**:
```
Terminal 1: Claude working on SD-XXX-001 (heartbeat: 30s ago)
Terminal 1: User starts new Claude instance → Session 1 auto-released, loses claim
Result: Session 1 silently hijacked
```

**After**:
```
Terminal 1: Claude working on SD-XXX-001 (heartbeat: 30s ago)
Terminal 1: User starts new Claude instance → CONFLICT detected
  - sd-start.js: "Another active session is already working on SD-XXX-001"
  - Exit 1, claim preserved for Session 1
Result: Session 1 protected, user warned
```

#### Scenario 2: Stale Session (Heartbeat >= 300s)

**Before & After (same behavior)**:
```
Terminal 1: Claude crashed 10 min ago (heartbeat: 600s ago)
Terminal 1: User starts new Claude instance → Session auto-released
Result: New session created, stale session cleaned up
```

### Monitoring

**Query Active Session Conflicts**:
```sql
-- Find sessions that had conflict flags set (from session metadata)
SELECT
  session_id,
  terminal_identity,
  metadata->'conflict_session_id' as conflicted_with,
  metadata->'conflict_sd_id' as sd_conflict,
  created_at
FROM claude_sessions
WHERE metadata->>'conflict' = 'true'
ORDER BY created_at DESC;
```

**Conflict Rate Monitoring**:
```sql
-- Session creation conflict rate (last 24 hours)
SELECT
  COUNT(*) FILTER (WHERE metadata->>'conflict' = 'true') as conflict_count,
  COUNT(*) as total_sessions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE metadata->>'conflict' = 'true') / COUNT(*), 2) as conflict_rate_percent
FROM claude_sessions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Troubleshooting

#### Issue: "CONFLICT: Another active session is already working on SD-XXX-001"

**Symptom**: `npm run sd:start SD-XXX-001` exits with error

**Diagnosis**:
```sql
SELECT
  session_id,
  terminal_identity,
  sd_id,
  heartbeat_age_human,
  hostname
FROM v_active_sessions
WHERE sd_id = 'SD-XXX-001'
  AND computed_status = 'active';
```

**Resolution**:
- **If heartbeat is fresh (<5 min)**: Another Claude is actively working — wait or pick different SD
- **If heartbeat is stale (>5 min)**: Manually release via `release_sd()` RPC, then retry claim
- **If you are the owner**: Close the other Claude instance first

#### Issue: Session Not Auto-Released After Crash

**Symptom**: Know previous session crashed, but new session gets conflict

**Cause**: Crashed session's heartbeat is <300s old (hasn't reached stale threshold yet)

**Resolution**: Wait for stale threshold (5 min) or manually release:
```sql
SELECT release_sd('SD-XXX-001');
```

#### Issue: Two Different SDs Get Conflict Warning

**Symptom**: Warning log: "Note: Another active session detected (session_abc), working on SD-YYY-002"

**Explanation**: This is informational only, not a blocker. Two sessions on same terminal but different SDs can coexist (worktree isolation provides file-level safety).

**Action**: No action needed. Proceed with work in worktree.

### Deployment

**Prerequisites**:
- PostgreSQL 14+ (existing requirement)
- Existing multi-session coordination schema (20260130, 20260201 migrations)

**Execution**:
```bash
# Via Supabase dashboard (recommended)
# Paste contents of database/migrations/20260213_session_creation_heartbeat_guard.sql

# OR via psql
psql "postgresql://..." < database/migrations/20260213_session_creation_heartbeat_guard.sql
```

**Verification**:
```sql
-- Verify function has heartbeat guard logic
SELECT prosrc FROM pg_proc WHERE proname = 'create_or_replace_session';
-- Should contain: "v_heartbeat_age < 300"
```

### Related Documentation

- **Migration**: `database/migrations/20260213_session_creation_heartbeat_guard.sql`
- **Session Manager**: `lib/session-manager.mjs` (conflict handling)
- **SD Start**: `scripts/sd-start.js` (conflict blocking)
- **Concurrent Hook**: `scripts/hooks/concurrent-session-worktree.cjs` (staleness alignment)

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 5.0.0 | 2026-02-18 | **Breaking**: Dropped sd_claims table (SD-LEO-INFRA-CONSOLIDATE-CLAIMS-INTO-001). All claim state now in claude_sessions exclusively. Fixed isSameConversation() for UUID vs port-based terminal_id. v_active_sessions rebuilt without sd_claims JOIN. Manual release is now single-table. |
| 4.1.0 | 2026-02-13 | Added session creation heartbeat guard (prevents hijacking active sessions), Added sd_claims lifecycle-aware unique constraint (superseded by v5.0.0) |
| 4.0.0 | 2026-02-11 | Added ship process safety (SD-LEO-FIX-MULTI-SESSION-SHIP-001) |
| 3.1.0 | 2026-02-09 | Added terminal identity centralization and handoff resolution tracking (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-018) |
| 3.0.0 | 2026-02-07 | Added git worktree automation (SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001) |
| 2.0.0 | 2026-02-01 | Added lifecycle event monitoring (SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001) |
| 1.0.0 | 2026-01-30 | Initial release (SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001) |

---

*Part of LEO Protocol v4.3.3 - Multi-Session Coordination & Lifecycle Management*
*SDs: SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001, SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001, SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001, SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-018, SD-LEO-FIX-MULTI-SESSION-SHIP-001, QF-20260213-620*
