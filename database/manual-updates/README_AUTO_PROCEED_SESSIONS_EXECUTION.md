# AUTO-PROCEED Sessions Migration Execution Guide

**SD**: SD-LEO-ENH-AUTO-PROCEED-001-06
**Date**: 2026-01-25
**Status**: Ready for manual execution

## Migration Files

| File | Purpose |
|------|---------|
| `database/migrations/20260125_auto_proceed_sessions.sql` | Full migration with all components |
| `database/manual-updates/EXECUTE_THIS_20260125_auto_proceed_sessions.sql` | Copy-paste ready version |
| `scripts/verify-auto-proceed-sessions-migration.js` | Post-execution verification |

## Execution Instructions

### Option 1: Supabase Dashboard (Recommended)

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select project: `dedlbzhpgkmetvhbkyzq`
3. Go to: **SQL Editor**
4. Create new query
5. Copy entire contents of `database/manual-updates/EXECUTE_THIS_20260125_auto_proceed_sessions.sql`
6. Click **Run**
7. Verify: `node scripts/verify-auto-proceed-sessions-migration.js`

### Option 2: Direct Connection (Requires DB Password)

1. Set `SUPABASE_DB_PASSWORD` in `.env` file
2. Run: `node scripts/execute-auto-proceed-sessions-migration.js`

## What Gets Created

### Table: `auto_proceed_sessions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | TEXT | Session identifier |
| is_active | BOOLEAN | Whether session is active |
| active_sd_key | TEXT | Currently executing SD |
| chain_orchestrators | BOOLEAN | Whether to chain orchestrators |
| current_phase | TEXT | LEAD/PLAN/EXEC/COMPLETE |
| parent_orchestrator_key | TEXT | Parent orchestrator if child SD |
| completed_children | INT | Progress counter |
| total_children | INT | Total children to complete |
| metadata | JSONB | Extensible metadata |
| created_at | TIMESTAMPTZ | Creation time |
| updated_at | TIMESTAMPTZ | Last update time |
| deactivated_at | TIMESTAMPTZ | When session ended |

### Indexes

- `idx_auto_proceed_sessions_session_id` - Fast lookup
- `idx_auto_proceed_sessions_active` - Active sessions only
- `idx_auto_proceed_sessions_sd_key` - By SD key
- `idx_auto_proceed_sessions_created` - Recent sessions
- `idx_auto_proceed_sessions_unique_active` - Single active per session_id

### Functions

1. `upsert_auto_proceed_session()` - Create/update session
2. `update_auto_proceed_progress()` - Update progress
3. `get_active_auto_proceed_session()` - Recovery query
4. `deactivate_auto_proceed_session()` - End session
5. `update_auto_proceed_sessions_updated_at()` - Trigger function

### View

- `v_active_auto_proceed_sessions` - Active sessions with calculated progress

## Usage Examples

### Start a Session
```javascript
const { data: sessionId } = await supabase.rpc('upsert_auto_proceed_session', {
  p_session_id: 'session_123',
  p_active_sd_key: 'SD-XXX-001',
  p_chain_orchestrators: false,
  p_current_phase: 'PLAN',
  p_total_children: 3,
  p_metadata: { auto_proceed: true }
});
```

### Update Progress
```javascript
await supabase.rpc('update_auto_proceed_progress', {
  p_session_id: 'session_123',
  p_current_phase: 'EXEC',
  p_active_sd_key: 'SD-XXX-002'
});
```

### Recover from Crash
```javascript
const { data: session } = await supabase.rpc('get_active_auto_proceed_session');
if (session) {
  console.log('Resuming:', session.active_sd_key, 'in phase:', session.current_phase);
}
```

### End Session
```javascript
await supabase.rpc('deactivate_auto_proceed_session', {
  p_session_id: 'session_123'
});
```

## Post-Execution Verification

Run the verification script:

```bash
node scripts/verify-auto-proceed-sessions-migration.js
```

Expected output: All 11 tests should pass.

## Related SDs

- SD-LEO-ENH-AUTO-PROCEED-001-09: Add `/leo resume` command (uses this table)
- SD-LEO-ENH-AUTO-PROCEED-001-18: Crash recovery (D18 - uses this table)
