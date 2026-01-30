# Multi-Session Pessimistic Locking Migration

**Category**: Database Migration
**Status**: Pending Execution
**Version**: 1.0.0
**Author**: CLAUDE Sub-Agent (DATABASE)
**Last Updated**: 2026-01-30
**Tags**: database, session-management, locking, concurrency
**SD**: SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001

## Overview

Adds database-level constraints and automation to prevent multiple Claude Code sessions from claiming the same Strategic Directive simultaneously. This migration implements pessimistic locking with heartbeat monitoring and automatic session state synchronization.

## Migration File

`database/migrations/20260130_multi_session_pessimistic_locking.sql`

## Changes Summary

### 1. Unique Index for Single Active Claim (FR-1)

**Purpose**: Database-level enforcement that only ONE session can claim a given SD when status is 'active'.

```sql
CREATE UNIQUE INDEX idx_claude_sessions_unique_active_claim
ON claude_sessions (sd_id)
WHERE sd_id IS NOT NULL AND status = 'active';
```

**Effect**: Prevents race conditions where two sessions try to claim the same SD. The database will reject the second claim with a unique violation error.

### 2. is_working_on Synchronization Trigger (FR-3)

**Purpose**: Automatically sync `strategic_directives_v2.is_working_on` flag when sessions claim/release SDs.

**Trigger Function**: `sync_is_working_on_with_session()`
**Trigger**: `sync_is_working_on_trigger` (AFTER UPDATE on `claude_sessions`)

**Behavior**:
- **On claim**: Sets `is_working_on = true`, `active_session_id = [session_id]` on the SD
- **On release**: Sets `is_working_on = false`, `active_session_id = NULL` on the SD (only if this session was the active one)

### 3. Enhanced v_active_sessions View (FR-5)

**New computed fields**:
- `heartbeat_age_seconds`: Seconds since last heartbeat
- `heartbeat_age_minutes`: Minutes since last heartbeat
- `seconds_until_stale`: Countdown to 5-minute stale threshold
- `computed_status`: 'active', 'stale', 'idle', or 'released' based on heartbeat age
- `claim_duration_minutes`: How long the SD has been claimed
- `heartbeat_age_human`: Human-readable format ("30s ago", "2m ago", "1h ago")

**Stale Detection**: Sessions with no heartbeat for >300 seconds (5 minutes) are marked as 'stale'.

### 4. Enhanced claim_sd() Function

**New error responses**:
- Returns detailed owner information when SD is already claimed:
  - `claimed_by`: Session ID of owner
  - `heartbeat_age_seconds`: How old the heartbeat is
  - `heartbeat_age_human`: Human-readable age
  - `hostname`: Machine claiming the SD
  - `tty`: Terminal ID
- Race condition detection: Catches unique violations from the index and returns `race_condition` error

### 5. Enhanced release_sd() Function

**Integration**: Triggers the `sync_is_working_on_trigger` when releasing an SD, ensuring database consistency.

## Execution Instructions

### Prerequisites
- PostgreSQL 14+ (for partial unique indexes)
- Supabase service role access
- Database: `dedlbzhpgkmetvhbkyzq`

### Execution Method

**Option 1: Supabase Dashboard (Recommended)**
1. Navigate to https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
2. Go to SQL Editor
3. Paste contents of `database/migrations/20260130_multi_session_pessimistic_locking.sql`
4. Click "Run"
5. Verify success messages in output panel

**Option 2: Supabase CLI**
```bash
npx supabase db push
```

**Option 3: psql (Not Recommended - Connection Pooler Required)**
```bash
# Use connection pooler URL (not direct URL)
psql "postgresql://postgres.PROJECT:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres" < database/migrations/20260130_multi_session_pessimistic_locking.sql
```

### Verification Queries

The migration includes built-in verification. After execution, you should see:

```
NOTICE:  SUCCESS: Unique index for single active claim exists
NOTICE:  SUCCESS: is_working_on sync trigger exists
```

**Manual verification**:
```sql
-- Check index exists
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname = 'idx_claude_sessions_unique_active_claim';

-- Check trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'sync_is_working_on_trigger';

-- Test enhanced view
SELECT session_id, sd_id, heartbeat_age_seconds, heartbeat_age_human, computed_status
FROM v_active_sessions
LIMIT 5;
```

## Impact Assessment

### Affected Tables
- `claude_sessions` - New unique index, new trigger
- `strategic_directives_v2` - Automatically updated by trigger
- `sd_claims` - Used in enhanced claim logic

### Affected Views
- `v_active_sessions` - Enhanced with 6 new computed fields

### Affected Functions
- `claim_sd()` - Enhanced error messages, race condition handling
- `release_sd()` - Integrated with trigger
- `sync_is_working_on_with_session()` (NEW)

### Breaking Changes
**None**. All changes are additive or enhancements to existing behavior.

### Compatibility
- ✅ Backward compatible with existing code
- ✅ Existing sessions continue to work
- ✅ New heartbeat fields default to computed values (no data migration needed)

## Rollback Procedure

If issues arise, revert with:

```sql
-- Remove trigger
DROP TRIGGER IF EXISTS sync_is_working_on_trigger ON claude_sessions;
DROP FUNCTION IF EXISTS sync_is_working_on_with_session();

-- Remove unique index
DROP INDEX IF EXISTS idx_claude_sessions_unique_active_claim;

-- Restore old view (without heartbeat enhancements)
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
  cs.id,
  cs.session_id,
  cs.sd_id,
  sd.title as sd_title,
  cs.track,
  cs.tty,
  cs.pid,
  cs.hostname,
  cs.codebase,
  cs.claimed_at,
  cs.heartbeat_at,
  cs.status,
  cs.metadata,
  cs.created_at
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.legacy_id OR cs.sd_id = sd.sd_key
WHERE cs.status NOT IN ('released')
ORDER BY cs.track NULLS LAST, cs.claimed_at DESC;
```

## Testing Checklist

Before marking migration as complete:
- [ ] Migration executes without errors
- [ ] Index `idx_claude_sessions_unique_active_claim` exists
- [ ] Trigger `sync_is_working_on_trigger` exists
- [ ] Function `sync_is_working_on_with_session()` exists
- [ ] View `v_active_sessions` has new fields (`heartbeat_age_seconds`, `heartbeat_age_human`, etc.)
- [ ] `claim_sd()` returns enhanced error messages
- [ ] Attempt to claim same SD from two sessions is blocked
- [ ] Releasing SD clears `is_working_on` flag automatically

## Related Documentation

- Heartbeat Manager: `docs/reference/heartbeat-manager.md`
- Session Management: `lib/session-manager.mjs`
- SD Queue Display: `scripts/modules/sd-next/`

## References

- **PRD**: Multi-Session Coordination with Pessimistic Locking (product_requirements_v2)
- **SD**: SD-LEO-INFRA-MULTI-SESSION-COORDINATION-001
- **Functional Requirements**:
  - FR-1: Database-level single active claim constraint
  - FR-3: is_working_on synchronization
  - FR-4: release_claim operation
  - FR-5: Heartbeat-based stale session detection
