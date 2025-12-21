# Migration Report: System Events Causality Patch

**Migration File**: `20251220_system_events_causality_patch.sql`
**Database**: EHG Consolidated (dedlbzhpgkmetvhbkyzq)
**Execution Date**: 2025-12-20
**Status**: ✅ SUCCESS
**SD**: SD-UNIFIED-PATH-1.1.1-PATCH

---

## Executive Summary

Successfully deployed the Event Linking Pattern to the `system_events` table, enabling immutable causality chains for Truth Layer calibration. The migration adds three new columns, two indexes, updates one function signature, creates one new function, and one analytical view.

## Changes Deployed

### 1. Schema Changes

| Column | Type | Nullable | Constraint | Purpose |
|--------|------|----------|------------|---------|
| `parent_event_id` | UUID | YES | FK → system_events(id) | Links outcome events to predictions |
| `actor_type` | VARCHAR(20) | YES | CHECK ('human', 'agent', 'system') | Identifies initiator category |
| `actor_role` | VARCHAR(50) | YES | None | Specific role (CEO, VP_IDEATION, etc.) |

### 2. Indexes Created

```sql
-- Optimizes causality chain queries
CREATE INDEX idx_system_events_parent_event_id
  ON system_events(parent_event_id)
  WHERE parent_event_id IS NOT NULL;

-- Optimizes accountability queries
CREATE INDEX idx_system_events_actor_type
  ON system_events(actor_type)
  WHERE actor_type IS NOT NULL;
```

### 3. Functions Updated/Created

#### Updated: `fn_log_system_event`

**Old Signature** (8 parameters):
```sql
fn_log_system_event(
  p_event_type, p_venture_id, p_correlation_id, p_agent_id,
  p_agent_type, p_token_cost, p_predicted_outcome, p_payload
)
```

**New Signature** (11 parameters):
```sql
fn_log_system_event(
  p_event_type, p_venture_id, p_correlation_id, p_agent_id,
  p_agent_type, p_token_cost, p_predicted_outcome, p_payload,
  -- NEW PARAMETERS (all optional with defaults)
  p_parent_event_id DEFAULT NULL,
  p_actor_type DEFAULT 'system',
  p_actor_role DEFAULT NULL
)
```

**Backward Compatibility**: ✅ YES (new parameters have defaults)

#### Created: `fn_log_outcome_event`

```sql
fn_log_outcome_event(
  p_parent_event_id UUID,
  p_actual_outcome JSONB,
  p_calibration_delta NUMERIC(5,2) DEFAULT NULL,
  p_actor_type VARCHAR(20) DEFAULT 'system',
  p_actor_role VARCHAR(50) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
```

**Purpose**: Simplified helper for creating outcome events linked to predictions. Automatically:
- Inherits context from parent (venture_id, correlation_id, agent_id)
- Generates event_type as `{parent_event_type}_OUTCOME`
- Sets resolved_at timestamp
- Creates idempotency key

### 4. View Created

**View**: `v_event_causality_chain`

Provides analytical view of event causality with:
- `chain_depth`: Depth in causality chain (0 = root event)
- `is_outcome_event`: Boolean flag for outcome events
- `parent_event_id`: Parent event reference
- All standard system_events columns

## Verification Results

### Test 1: Column Creation
✅ All three columns created successfully
✅ Foreign key constraint active on `parent_event_id`
✅ CHECK constraint enforcing `actor_type` values

### Test 2: Index Creation
✅ `idx_system_events_parent_event_id` created
✅ `idx_system_events_actor_type` created

### Test 3: Function Deployment
✅ Old `fn_log_system_event` signature dropped
✅ New `fn_log_system_event` signature created (11 params)
✅ `fn_log_outcome_event` created

### Test 4: End-to-End Event Linking Pattern
✅ Prediction event created with actor metadata (CEO/agent)
✅ Outcome event linked via `parent_event_id`
✅ Causality chain view correctly shows depth (0 for prediction, 1 for outcome)
✅ Foreign key relationship verified

### Test 5: Constraint Validation
✅ Invalid `actor_type` rejected with CHECK constraint error

## Sample Data (Test Events)

| ID | Event Type | Actor Type | Actor Role | Has Parent | Chain Depth |
|----|------------|------------|------------|------------|-------------|
| c747dcfc... | STAGE_TRANSITION_OUTCOME | system | VALIDATOR | ✅ | 1 |
| 3f17be4c... | STAGE_TRANSITION | agent | CEO | ❌ | 0 |

## Database Objects Summary

| Object Type | Count | Names |
|-------------|-------|-------|
| Columns Added | 3 | parent_event_id, actor_type, actor_role |
| Indexes Created | 2 | idx_system_events_parent_event_id, idx_system_events_actor_type |
| Functions Updated | 1 | fn_log_system_event |
| Functions Created | 1 | fn_log_outcome_event |
| Views Created | 1 | v_event_causality_chain |
| Constraints Added | 2 | FK (parent_event_id), CHECK (actor_type) |

## Migration Approach

The migration used a **step-by-step idempotent pattern** to ensure safety:

1. **DO $$ blocks with IF NOT EXISTS** for column creation
2. **CREATE INDEX IF NOT EXISTS** for indexes
3. **Explicit DROP + CREATE** for function signature changes
4. **No data migration** required (all columns nullable)

## Breaking Changes

**None**. The function signature change is backward compatible because:
- New parameters have default values
- Existing callers (if any) will continue to work
- The old 8-parameter signature was explicitly dropped before creating new 11-parameter version

## Code Impact Assessment

**Search Results**: No active application code currently calls `fn_log_system_event`
- Only references found in migration files and documentation
- No code changes required immediately
- New code can start using enhanced signature with actor metadata

## Next Steps for Developers

### 1. Update Event Logging to Include Actor Metadata

**Before**:
```javascript
const eventId = await client.query(`
  SELECT fn_log_system_event(
    'STAGE_TRANSITION',
    $1, -- venture_id
    $2, -- correlation_id
    NULL, NULL, 0,
    '{"expected_state": "stage_2"}'::jsonb,
    '{}'::jsonb
  )
`, [ventureId, correlationId]);
```

**After** (with actor metadata):
```javascript
const eventId = await client.query(`
  SELECT fn_log_system_event(
    'STAGE_TRANSITION',
    $1, -- venture_id
    $2, -- correlation_id
    NULL, NULL, 0,
    '{"expected_state": "stage_2"}'::jsonb,
    '{}'::jsonb,
    NULL,      -- parent_event_id (none for predictions)
    'agent',   -- actor_type
    'CEO'      -- actor_role
  )
`, [ventureId, correlationId]);
```

### 2. Use Outcome Event Helper for Calibration

**Pattern**:
```javascript
// Step 1: Create prediction event
const predictionId = await client.query(`
  SELECT fn_log_system_event(
    'GATE_VALIDATION',
    $1, gen_random_uuid(), NULL, NULL, 0,
    '{"expected_outcome": "PASS", "confidence": 0.90}'::jsonb,
    '{}'::jsonb,
    NULL, 'agent', 'VP_VALIDATION'
  )
`, [ventureId]);

// Step 2: After execution, create outcome event
const outcomeId = await client.query(`
  SELECT fn_log_outcome_event(
    $1,  -- parent_event_id (prediction)
    '{"actual_outcome": "FAIL", "reason": "Missing success_metrics"}'::jsonb,
    -0.90,  -- calibration_delta (0.0 predicted PASS, got FAIL)
    'system',
    'GATE_VALIDATOR',
    'Failed due to missing success_metrics in PRD'
  )
`, [predictionId]);
```

### 3. Query Causality Chains for Audit

```sql
-- Find all outcome events with their predictions
SELECT
  p.id as prediction_id,
  p.predicted_outcome,
  o.id as outcome_id,
  o.actual_outcome,
  o.calibration_delta,
  p.actor_role as predictor,
  o.actor_role as validator
FROM v_event_causality_chain o
JOIN system_events p ON p.id = o.parent_event_id
WHERE o.is_outcome_event = true
ORDER BY o.created_at DESC;
```

### 4. Truth Layer Calibration Queries

```sql
-- Calculate agent prediction accuracy
SELECT
  p.actor_role,
  COUNT(*) as total_predictions,
  COUNT(o.id) as outcomes_recorded,
  AVG(o.calibration_delta) as avg_calibration_error,
  COUNT(CASE WHEN ABS(o.calibration_delta) < 0.1 THEN 1 END)::FLOAT / COUNT(o.id) as accuracy_rate
FROM system_events p
LEFT JOIN system_events o ON o.parent_event_id = p.id
WHERE p.predicted_outcome IS NOT NULL
GROUP BY p.actor_role;
```

## Rollback Plan

If rollback is required:

```sql
BEGIN;

-- Drop new objects
DROP VIEW IF EXISTS v_event_causality_chain;
DROP FUNCTION IF EXISTS fn_log_outcome_event;

-- Restore old function signature
DROP FUNCTION IF EXISTS fn_log_system_event;
CREATE FUNCTION fn_log_system_event(
  p_event_type VARCHAR(50),
  p_venture_id UUID DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL,
  p_agent_type VARCHAR(50) DEFAULT NULL,
  p_token_cost INTEGER DEFAULT 0,
  p_predicted_outcome JSONB DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
AS $$ ... $$;  -- (original implementation)

-- Drop indexes
DROP INDEX IF EXISTS idx_system_events_parent_event_id;
DROP INDEX IF EXISTS idx_system_events_actor_type;

-- Drop columns (WARNING: destroys data in those columns)
ALTER TABLE system_events DROP COLUMN IF EXISTS parent_event_id;
ALTER TABLE system_events DROP COLUMN IF EXISTS actor_type;
ALTER TABLE system_events DROP COLUMN IF EXISTS actor_role;

COMMIT;
```

**Note**: Rollback will destroy any data in the new columns. Only perform if absolutely necessary.

## Performance Impact

### Indexes
- **parent_event_id**: Partial index (WHERE parent_event_id IS NOT NULL) minimizes overhead
- **actor_type**: Partial index (WHERE actor_type IS NOT NULL) minimizes overhead
- Both indexes use B-tree for optimal UUID/VARCHAR lookups

### Storage Impact
- **parent_event_id**: 16 bytes per row (UUID) - only populated for outcome events
- **actor_type**: ~6-10 bytes per row (VARCHAR with typical values)
- **actor_role**: ~10-20 bytes per row (VARCHAR with typical values)
- **Estimated overhead**: ~40 bytes per row (negligible for event log table)

## Security Considerations

- **SECURITY DEFINER**: Both functions run with elevated privileges to INSERT into system_events
- **RLS**: Verify RLS policies allow authenticated users to read from v_event_causality_chain if needed
- **actor_type constraint**: Prevents invalid values ('human', 'agent', 'system' only)

## Lessons Learned

### Challenge: Function Signature Change
**Issue**: PostgreSQL doesn't support `CREATE OR REPLACE FUNCTION` with different parameter counts
**Solution**: Explicit `DROP FUNCTION` with old signature before creating new version
**Pattern**: Always check existing signatures before deploying function changes

### Best Practice: Idempotent Migrations
All column additions used `IF NOT EXISTS` pattern via DO $$ blocks to ensure migration can be re-run safely.

---

**Migration Executed By**: Database Agent (Principal Database Architect)
**Verification**: End-to-end tests passed (Event Linking Pattern working correctly)
**Documentation**: Updated schema docs recommended (run `npm run schema:docs:engineer`)
