# PAT-STATE-SYNC-001: Database-First Session State

## Problem Statement

Auto-proceed state was stored in a local JSON file (`.claude/auto-proceed-state.json`) that was never synchronized with the database (`claude_sessions.metadata`). This caused state divergence during orchestrator child-to-child transitions, where:

1. Database showed SD-002C as claimed
2. Git branch pointed to SD-002C
3. Local JSON file still showed SD-002B (the previous child)

This led to confusion about which SD was actually being worked on.

## Root Cause

Missing state synchronization checkpoint when transitioning between orchestrator children. The `/leo start` command and handoff system updated the database but not the local state file.

## Solution

**Database as Single Source of Truth**

1. Modified `scripts/modules/handoff/auto-proceed-state.js` to:
   - Write to both file (sync) AND database (async)
   - Added `readStateFromDb()` for authoritative reads
   - Added `initializeFromDb()` for session start
   - Added `validateState()` for reconciliation

2. Created `scripts/validate-session-state.js` for manual validation

3. Created `scripts/hooks/session-state-sync.cjs` hook for automatic sync on session start

## State Hierarchy

```
Database (claude_sessions.metadata.execution_state) - AUTHORITATIVE
         ↓
Local File (.claude/auto-proceed-state.json) - Cache/Fallback
```

## How It Works

### On Write
```javascript
writeState(state) {
  // 1. Write to local file (sync, immediate)
  writeStateToFile(state);

  // 2. Sync to database (async, fire-and-forget)
  syncStateToDb(state);
}
```

### On Read (sync callers)
```javascript
readState() {
  return readFromFile(); // Fast, local
}
```

### On Read (async callers, authoritative)
```javascript
async readStateFromDb() {
  const dbState = await queryDatabase();
  writeStateToFile(dbState); // Update cache
  return dbState;
}
```

### On Session Start
The `session-state-sync.cjs` hook:
1. Queries database for session's claimed SD and execution_state
2. Compares with local file
3. Auto-fixes mismatches (database wins)
4. Outputs warning if divergence detected

## Database Schema

The `claude_sessions.metadata` field now includes:

```json
{
  "branch": "feat/SD-XXX-...",
  "auto_proceed": true,
  "chain_orchestrators": false,
  "execution_state": {
    "currentSd": "SD-LEO-SELF-IMPROVE-002C",
    "currentPhase": "PLAN",
    "currentTask": "Working on Phase 3",
    "isActive": true,
    "wasInterrupted": false,
    "lastUpdatedAt": "2026-02-02T03:00:00.000Z"
  }
}
```

## Prevention Checklist

- [ ] All state writes go through `writeState()` which syncs to DB
- [ ] Session start triggers `session-state-sync.cjs` hook
- [ ] `/leo start` validates state consistency
- [ ] Orchestrator transitions trigger state sync

## Detection Signature

```
⚠️ SD mismatch: file=SD-002B, db_claim=SD-002C
```

## Related Files

- `scripts/modules/handoff/auto-proceed-state.js` - Core module
- `scripts/validate-session-state.js` - Manual validation
- `scripts/hooks/session-state-sync.cjs` - Session start hook
- `lib/session-manager.mjs` - Session management

## References

- RCA from 2026-02-02: SD-LEO-SELF-IMPROVE-002C state mismatch
- SD-LEO-INFRA-ISL-001: Intelligent Session Lifecycle (session management foundation)
