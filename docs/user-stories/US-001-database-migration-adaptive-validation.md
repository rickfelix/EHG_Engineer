# US-001: Database Migration - Add Validation Mode Columns

## Story Summary
Add database schema columns to support adaptive validation modes (prospective/retrospective) for sub-agent execution results, enabling pragmatic completion of delivered work while maintaining validation rigor.

## Story Details

### User Persona
Database Administrator / Infrastructure Engineer

### Benefit Statement
Enable prospective and retrospective validation modes by extending the database schema with validation mode tracking, justification fields, and conditional pass criteria.

### Complexity
Medium (M) - 1 hour

---

## Acceptance Criteria

### AC-001: Migration for validation_mode Column
**Scenario**: Add validation_mode column with strict constraints
**Given**: Database is in current state with sub_agent_execution_results table
**When**: Migration is applied
**Then**:
- Column validation_mode is added as TEXT
- CHECK constraint ensures only 'prospective' or 'retrospective' values
- DEFAULT value is 'prospective' (backward compatible)
- Migration is idempotent (can run multiple times safely)

**Test Data**:
```sql
INSERT INTO sub_agent_execution_results (
  sd_id, agent_name, verdict, validation_mode
) VALUES
  ('SD-001', 'TESTING', 'PASS', 'prospective'),
  ('SD-002', 'TESTING', 'CONDITIONAL_PASS', 'retrospective');
```

### AC-002: Migration for justification Column
**Scenario**: Add justification field for CONDITIONAL_PASS verdicts
**Given**: Migration for validation_mode is applied
**When**: justification column migration runs
**Then**:
- Column justification is added as TEXT
- Column is NOT NULL only when verdict = 'CONDITIONAL_PASS'
- CHECK constraint requires minimum 50 characters when present
- Existing rows can have NULL justification (backward compat)

**Validation Rule**:
```sql
ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT check_justification_required
CHECK (
  verdict != 'CONDITIONAL_PASS' OR
  (justification IS NOT NULL AND length(justification) >= 50)
);
```

### AC-003: Migration for conditions Column
**Scenario**: Add conditions array for follow-up actions
**Given**: justification column migration is applied
**When**: conditions column migration runs
**Then**:
- Column conditions is added as JSONB
- Column is NOT NULL only when verdict = 'CONDITIONAL_PASS'
- Array must contain at least 1 follow-up action string
- Existing rows can have NULL conditions

**Validation Example**:
```sql
-- Valid CONDITIONAL_PASS record
INSERT INTO sub_agent_execution_results (
  sd_id, agent_name, verdict, validation_mode,
  justification, conditions
) VALUES (
  'SD-001', 'TESTING', 'CONDITIONAL_PASS', 'retrospective',
  'E2E tests exist and pass. Infrastructure gap documented.',
  '["Follow-up SD: SD-TESTING-INFRASTRUCTURE-FIX-001", "Add --full-e2e flag to CI/CD"]'
);
```

### AC-004: CONDITIONAL_PASS Verdict Enum
**Scenario**: Update verdict enum to include CONDITIONAL_PASS
**Given**: validation_mode and justification columns are added
**When**: verdict enum is updated
**Then**:
- Verdict enum now includes: PASS, FAILED, BLOCKED, CONDITIONAL_PASS
- CONDITIONAL_PASS can only be used in retrospective mode
- CHECK constraint ensures this rule is enforced
- Existing PASS, FAILED, BLOCKED verdicts remain unchanged

**Constraint Logic**:
```sql
ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT check_conditional_pass_mode
CHECK (
  verdict != 'CONDITIONAL_PASS' OR
  validation_mode = 'retrospective'
);
```

### AC-005: Migration Backward Compatibility
**Scenario**: Verify existing executions are not broken
**Given**: New columns added with defaults
**When**: Old code queries sub_agent_execution_results
**Then**:
- All existing rows have validation_mode = 'prospective' (default)
- All existing rows have NULL justification and conditions
- Queries that don't reference new columns work unchanged
- Foreign key relationships remain intact

**Test**:
```sql
-- Old query style should still work
SELECT id, verdict, execution_time
FROM sub_agent_execution_results
WHERE sd_id = 'SD-001'
AND verdict = 'PASS';
```

### AC-006: Migration Indexed Columns
**Scenario**: Add indexes for query performance
**Given**: All new columns are added
**When**: migration completes
**Then**:
- Index on (sd_id, validation_mode) for mode filtering
- Index on (verdict, validation_mode) for progress calculation
- Index on (created_at DESC) for audit trail queries
- All indexes created without locking table (CONCURRENTLY)

---

## Implementation Context

### Architecture References

**Similar Components**:
- `database/migrations/20251115105325_fix_handoff_trigger_validation.sql` - Similar enum updates
- `database/schema/007_leo_protocol_schema.sql` - Core LEO schema structure
- `database/functions/get_progress_breakdown.sql` - Uses verdict enum (will need update)

**Patterns to Follow**:
1. **Migration Format**: Use YYYYMMDDHHMMSS timestamp in filename
2. **Idempotency**: Always use `IF NOT EXISTS` for schema changes
3. **Rollback Safety**: Include DOWN migration for testing
4. **Constraints**: Define CHECK constraints with clear logic
5. **Indexes**: Create with CONCURRENTLY to avoid locking

### Database Integration Points

```javascript
// After migration, update these integration points:

// 1. Sub-agent execution results insertion
const insertResult = await supabase
  .from('sub_agent_execution_results')
  .insert({
    sd_id: 'SD-001',
    agent_name: 'TESTING',
    verdict: 'CONDITIONAL_PASS',
    validation_mode: 'retrospective',  // NEW
    justification: 'Test evidence provided...', // NEW (required for CONDITIONAL_PASS)
    conditions: ['Follow-up: SD-TESTING-INFRASTRUCTURE-FIX-001'], // NEW (required)
    execution_time: 1234,
    output: { /* ... */ }
  });

// 2. Progress calculation query (uses new fields)
const { data: results } = await supabase
  .from('sub_agent_execution_results')
  .select('*')
  .eq('sd_id', 'SD-001')
  .in('verdict', ['PASS', 'CONDITIONAL_PASS']); // Now accepts CONDITIONAL_PASS

// 3. Audit trail for CONDITIONAL_PASS
const auditEntry = {
  timestamp: new Date().toISOString(),
  sd_id: 'SD-001',
  agent_name: 'TESTING',
  verdict: 'CONDITIONAL_PASS',
  validation_mode: 'retrospective',
  justification: result.justification,
  conditions: result.conditions,
  approved_by: 'SERVICE_ROLE' // Document who approved
};
```

### Example Code Patterns

**Migration File Structure** (`database/migrations/YYYYMMDDHHMMSS_add_validation_modes.sql`):

```sql
-- Add validation_mode column
ALTER TABLE sub_agent_execution_results
ADD COLUMN validation_mode TEXT DEFAULT 'prospective'
CHECK (validation_mode IN ('prospective', 'retrospective'));

-- Create index for validation mode filtering
CREATE INDEX idx_sub_agent_validation_mode
ON sub_agent_execution_results(sd_id, validation_mode);

-- Add justification column (NOT NULL only for CONDITIONAL_PASS)
ALTER TABLE sub_agent_execution_results
ADD COLUMN justification TEXT;

ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT check_justification_required
CHECK (
  verdict != 'CONDITIONAL_PASS' OR
  (justification IS NOT NULL AND length(justification) >= 50)
);

-- Add conditions column (JSON array of follow-up actions)
ALTER TABLE sub_agent_execution_results
ADD COLUMN conditions JSONB;

ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT check_conditions_required
CHECK (
  verdict != 'CONDITIONAL_PASS' OR
  (conditions IS NOT NULL AND jsonb_array_length(conditions) > 0)
);

-- Update verdict enum to include CONDITIONAL_PASS
ALTER TYPE verdict_type ADD VALUE 'CONDITIONAL_PASS';

-- Ensure CONDITIONAL_PASS only used in retrospective mode
ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT check_conditional_pass_retrospective
CHECK (
  verdict != 'CONDITIONAL_PASS' OR
  validation_mode = 'retrospective'
);

-- Create indexes for progress calculation
CREATE INDEX idx_verdict_validation_mode
ON sub_agent_execution_results(verdict, validation_mode);

CREATE INDEX idx_audit_trail
ON sub_agent_execution_results(created_at DESC)
WHERE verdict = 'CONDITIONAL_PASS';
```

**Node.js Validation After Migration**:

```javascript
// scripts/validate-migration.js
const validateValidationMode = (row) => {
  const valid = ['prospective', 'retrospective'].includes(row.validation_mode);
  if (!valid) throw new Error(`Invalid validation_mode: ${row.validation_mode}`);
  return true;
};

const validateConditionalPass = (row) => {
  if (row.verdict === 'CONDITIONAL_PASS') {
    // Justification required and >= 50 chars
    if (!row.justification || row.justification.length < 50) {
      throw new Error('CONDITIONAL_PASS requires justification >= 50 chars');
    }
    // Conditions required and non-empty
    if (!row.conditions || !Array.isArray(row.conditions) || row.conditions.length === 0) {
      throw new Error('CONDITIONAL_PASS requires non-empty conditions array');
    }
    // Can only be used in retrospective mode
    if (row.validation_mode !== 'retrospective') {
      throw new Error('CONDITIONAL_PASS only allowed in retrospective mode');
    }
  }
};

const validateBackwardCompat = (row) => {
  // Old verdicts should not have these fields
  if (['PASS', 'FAILED', 'BLOCKED'].includes(row.verdict)) {
    if (row.justification || row.conditions) {
      console.warn(`Warning: Non-CONDITIONAL_PASS verdict has optional fields`);
    }
  }
};
```

---

## Testing Strategy

### Unit Tests (Phase 1)

**Test File**: `tests/unit/database/migrations/validation-mode-migration.spec.js`

```javascript
describe('Validation Mode Migration', () => {
  test('Should add validation_mode column with correct constraints', async () => {
    const result = await supabase
      .from('sub_agent_execution_results')
      .insert({
        sd_id: 'SD-TEST-001',
        agent_name: 'TEST',
        verdict: 'PASS',
        validation_mode: 'prospective' // Should succeed
      });
    expect(result.error).toBeNull();
  });

  test('Should reject invalid validation_mode', async () => {
    const result = await supabase
      .from('sub_agent_execution_results')
      .insert({
        verdict: 'PASS',
        validation_mode: 'invalid_mode' // Should fail CHECK
      });
    expect(result.error).toBeTruthy();
  });

  test('Should enforce CONDITIONAL_PASS only in retrospective mode', async () => {
    const result = await supabase
      .from('sub_agent_execution_results')
      .insert({
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'prospective', // Should fail
        justification: 'This should fail because mode is prospective'
      });
    expect(result.error).toBeTruthy();
  });

  test('Should allow CONDITIONAL_PASS in retrospective with valid justification', async () => {
    const result = await supabase
      .from('sub_agent_execution_results')
      .insert({
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        justification: 'Tests pass but infrastructure has known limitation. Will fix in follow-up SD.',
        conditions: ['Follow-up: SD-INFRASTRUCTURE-FIX-001']
      });
    expect(result.error).toBeNull();
  });

  test('Should reject CONDITIONAL_PASS with short justification', async () => {
    const result = await supabase
      .from('sub_agent_execution_results')
      .insert({
        verdict: 'CONDITIONAL_PASS',
        validation_mode: 'retrospective',
        justification: 'Too short' // < 50 chars
      });
    expect(result.error).toBeTruthy();
  });
});
```

### Integration Tests (Phase 2)

**Test File**: `tests/integration/sub-agent/validation-mode-queries.spec.js`

```javascript
describe('Validation Mode Query Patterns', () => {
  test('Should query PASS verdicts regardless of mode', async () => {
    await seedTestData([
      { verdict: 'PASS', validation_mode: 'prospective' },
      { verdict: 'PASS', validation_mode: 'retrospective' }
    ]);

    const { data } = await supabase
      .from('sub_agent_execution_results')
      .select('*')
      .eq('verdict', 'PASS');

    expect(data).toHaveLength(2);
  });

  test('Should filter by validation mode for reporting', async () => {
    const { data: prospective } = await supabase
      .from('sub_agent_execution_results')
      .select('*')
      .eq('validation_mode', 'prospective');

    expect(prospective.every(r => r.validation_mode === 'prospective')).toBe(true);
  });
});
```

### Migration Validation Tests

```javascript
// tests/integration/database/migration-validation.spec.js
test('Migration should be backward compatible', async () => {
  // Query old-style (without new columns)
  const oldStyleQuery = await supabase
    .from('sub_agent_execution_results')
    .select('id, sd_id, verdict')
    .eq('sd_id', 'SD-001');

  expect(oldStyleQuery.error).toBeNull();

  // All rows should have default validation_mode
  const fullQuery = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', 'SD-001');

  fullQuery.data.forEach(row => {
    expect(row.validation_mode).toBe('prospective');
  });
});
```

---

## Success Criteria

- All 6 constraints enforced (validation_mode, justification, conditions, CONDITIONAL_PASS)
- No data loss in existing executions
- All new columns indexed correctly
- Queries perform <5ms (backward compatible)
- Migration is idempotent (safe to run multiple times)
- Audit trail possible for all CONDITIONAL_PASS entries

---

## Story Dependencies

**Depends On**: None (can execute immediately)

**Blocks**:
- US-002: Sub-Agent Updates
- US-003: Progress Calculation Update

---

## References

- Draft: `/tmp/SD-LEO-PROTOCOL-V4-4-0-draft.md` (Phase 1: Database Migration)
- Root Cause: `/tmp/leo-protocol-handoff-constraint-analysis.md`
- Schema: `database/schema/007_leo_protocol_schema_fixed.sql`

**Created**: 2025-11-15
**Status**: READY FOR DEVELOPMENT
