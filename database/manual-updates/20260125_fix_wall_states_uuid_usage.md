# Fix: Wall States UUID Type Mismatch

**Date**: 2026-01-25
**SD**: SD-LEO-ENH-AUTO-PROCEED-001-12
**Issue**: Database type mismatch causing UUID errors

## Problem

The `sd_wall_states.sd_id` column is UUID type (correctly references `strategic_directives_v2.uuid_id`), but the `WallManager` class was using the VARCHAR `id` field instead of `uuid_id` when interacting with the table.

### Error Message
```
invalid input syntax for type uuid: "SD-LEO-ENH-AUTO-PROCEED-001-12"
```

## Root Cause

In `lib/tasks/wall-manager.js`, multiple methods were using `sd.id` (VARCHAR) instead of `sd.uuid_id` (UUID):

| Line | Method | Issue |
|------|--------|-------|
| 109 | `initializeWallsForHandoff()` | `_recordWallState(sd.id, ...)` |
| 150 | `checkWallStatus()` | `.eq('sd_id', sd.id)` |
| 183 | `checkWallStatus()` | `_checkGateStatuses(sd.id, ...)` |
| 242 | `passWall()` | `.eq('sd_id', sd.id)` |
| 286 | `invalidateWall()` | `.eq('sd_id', sd.id)` |
| 319 | `getWallStates()` | `.eq('sd_id', sd.id)` |
| 345 | `recordGateResult()` | `sd_id: sd.id` |

## Database Schema (CORRECT)

```sql
-- sd_wall_states table
CREATE TABLE sd_wall_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id uuid NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  wall_name text NOT NULL,
  ...
);

-- strategic_directives_v2 table
CREATE TABLE strategic_directives_v2 (
  id varchar(50) PRIMARY KEY,           -- e.g., "SD-LEO-ENH-AUTO-PROCEED-001-12"
  uuid_id uuid NOT NULL UNIQUE,         -- e.g., "5ba4c9a9-bdf3-464d-95a8-a3d82e1f742c"
  ...
);
```

The foreign key constraint correctly references `uuid_id`:
```sql
CONSTRAINT sd_wall_states_sd_id_fkey
  FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(uuid_id)
```

## Solution

Changed all instances in `wall-manager.js` from `sd.id` to `sd.uuid_id`:

```javascript
// BEFORE (WRONG)
await this._recordWallState(sd.id, wallName, toPhase, { ... });

// AFTER (CORRECT)
await this._recordWallState(sd.uuid_id, wallName, toPhase, { ... });
```

## Verification

1. All strategic directives have `uuid_id` populated (verified via query)
2. The `_loadSD()` method correctly loads both `id` and `uuid_id` fields
3. Other managers (`correction-manager.js`, `kickback-manager.js`) already use defensive pattern: `sd.uuid_id || sd.id`

## Files Changed

- `lib/tasks/wall-manager.js`: 7 instances fixed

## Testing

After fix, wall state operations should work correctly:
```bash
# Test wall initialization
node scripts/handoff.js walls SD-LEO-ENH-AUTO-PROCEED-001-12

# Should not throw UUID parsing errors
```

## Prevention

**For future code that interacts with UUID foreign keys**:
- ✅ **ALWAYS use** `sd.uuid_id` when referencing `strategic_directives_v2` from UUID columns
- ✅ **ALWAYS use** `sd.id` for VARCHAR references (e.g., handoff chains, legacy systems)
- ✅ **Use defensive fallback** `sd.uuid_id || sd.id` when UUID is preferred but fallback is safe
- ❌ **NEVER use** `sd.id` directly with UUID database columns

## Related Tables

Similar pattern applies to:
- `sd_gate_results.sd_id` (UUID) → use `sd.uuid_id`
- `sd_kickbacks.sd_id` (UUID) → use `sd.uuid_id`
- `task_corrections.sd_id` (UUID) → use `sd.uuid_id`
- `subagent_execution_logs.sd_id` (UUID) → use `sd.uuid_id`
