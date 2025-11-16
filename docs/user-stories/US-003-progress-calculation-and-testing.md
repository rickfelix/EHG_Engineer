# US-003: Progress Calculation Update & Testing

## Story Summary
Update the progress calculation system to accept CONDITIONAL_PASS verdicts in retrospective mode, implement comprehensive testing (unit + integration), and document adaptive validation criteria. Enable SDs to reach 100% completion when delivered with justified pragmatic completions.

## Story Details

### User Persona
QA Engineer / Infrastructure Engineer / Technical Lead

### Benefit Statement
Enable accurate progress calculation that accepts CONDITIONAL_PASS verdicts in retrospective mode, allowing delivered SDs to reach 100% completion while maintaining audit trails and quality gates.

### Complexity
Large (L) - 2 hours (focused on progress + testing, documentation separate)

---

## Acceptance Criteria

### AC-001: Update get_progress_breakdown() Function
**Scenario**: Progress calculation accepts CONDITIONAL_PASS in retrospective mode
**Given**: Sub-agent execution results include validation_mode field
**When**: Progress is calculated for an SD in retrospective mode
**Then**:
- Function accepts verdict = 'CONDITIONAL_PASS' IF validation_mode = 'retrospective'
- Prospective mode verdicts: only 'PASS' counts toward completion
- Retrospective mode verdicts: 'PASS' OR 'CONDITIONAL_PASS' count
- Logic is enforced with CHECK constraint
- All other verdicts ('BLOCKED', 'FAILED') prevent completion

**SQL Logic**:
```sql
sub_agents_verified := (
  SELECT COUNT(*) = (SELECT COUNT(*) FROM sub_agent_list)
  FROM sub_agent_execution_results
  WHERE sd_id = sd_id_param
  AND (
    verdict = 'PASS' OR
    (verdict = 'CONDITIONAL_PASS' AND validation_mode = 'retrospective')
  )
);
```

**Test Cases**:
- Prospective mode with PASS: verified ✓
- Prospective mode with CONDITIONAL_PASS: NOT verified ✗
- Retrospective mode with PASS: verified ✓
- Retrospective mode with CONDITIONAL_PASS: verified ✓
- Retrospective mode with BLOCKED: NOT verified ✗

### AC-002: Update Progress Calculation Queries
**Scenario**: All queries that use verdict for progress now include validation_mode check
**Given**: Queries reference sub_agent_execution_results
**When**: Query filters by verdict
**Then**:
- Query includes validation_mode logic
- No breaking changes to existing queries
- Backward compatible (old SDs default to prospective)
- Performance impact <5ms per query

**Example Updated Query**:
```sql
-- OLD (prospective-only)
SELECT COUNT(*) FROM sub_agent_execution_results
WHERE sd_id = $1 AND verdict = 'PASS';

-- NEW (mode-aware)
SELECT COUNT(*) FROM sub_agent_execution_results
WHERE sd_id = $1
AND (
  verdict = 'PASS' OR
  (verdict = 'CONDITIONAL_PASS' AND validation_mode = 'retrospective')
);
```

### AC-003: Update Sub-Agent Results Table Indexes
**Scenario**: Queries using new validation_mode are optimized with indexes
**Given**: Sub-agent execution results table has new columns
**When**: Queries execute
**Then**:
- Composite index (sd_id, validation_mode) created for filtering
- Index on (verdict, validation_mode) created for progress calculation
- Index on created_at DESC for audit trail queries
- All indexes created CONCURRENTLY (non-blocking)
- Query performance remains <5ms

**Indexes to Create**:
```sql
CREATE INDEX CONCURRENTLY idx_subagent_sd_mode
ON sub_agent_execution_results(sd_id, validation_mode);

CREATE INDEX CONCURRENTLY idx_subagent_verdict_mode
ON sub_agent_execution_results(verdict, validation_mode);

CREATE INDEX CONCURRENTLY idx_subagent_audit
ON sub_agent_execution_results(created_at DESC)
WHERE verdict = 'CONDITIONAL_PASS';
```

### AC-004: Unit Tests - Verdict Logic
**Scenario**: Unit tests verify verdict acceptance logic
**Given**: Test fixtures with different verdict/mode combinations
**When**: Progress calculation logic executes
**Then**:
- PASS in any mode: counts ✓
- CONDITIONAL_PASS in prospective: doesn't count ✗
- CONDITIONAL_PASS in retrospective: counts ✓
- BLOCKED in any mode: doesn't count ✗
- FAILED in any mode: doesn't count ✗
- Tests cover all 15 combinations (3 modes × 5 verdicts)

**Test Code**:
```javascript
// tests/unit/progress/verdict-logic.spec.js
const verdictModes = [
  { verdict: 'PASS', mode: 'prospective', expect: true },
  { verdict: 'PASS', mode: 'retrospective', expect: true },
  { verdict: 'CONDITIONAL_PASS', mode: 'prospective', expect: false },
  { verdict: 'CONDITIONAL_PASS', mode: 'retrospective', expect: true },
  { verdict: 'BLOCKED', mode: 'prospective', expect: false },
  { verdict: 'BLOCKED', mode: 'retrospective', expect: false },
  { verdict: 'FAILED', mode: 'prospective', expect: false },
  { verdict: 'FAILED', mode: 'retrospective', expect: false },
];

verdictModes.forEach(({ verdict, mode, expect: expected }) => {
  test(`${verdict} in ${mode} should ${expected ? 'count' : 'not count'}`, () => {
    const result = assessVerdictForCompletion(verdict, mode);
    expect(result).toBe(expected);
  });
});
```

### AC-005: Integration Tests - Progress Calculation
**Scenario**: Progress calculation works correctly across real SD scenarios
**Given**: SDs with various sub-agent results (prospective and retrospective)
**When**: Progress is calculated
**Then**:
- Prospective SD with all PASS: reaches 100% ✓
- Prospective SD with 1 CONDITIONAL_PASS: stops at 85% ✗
- Retrospective SD with 5 PASS + 1 CONDITIONAL_PASS: reaches 100% ✓
- Retrospective SD with 1 BLOCKED: stops at 85% ✗
- Progress percentages calculated correctly (6 agents total)
- No data loss or corruption

**Test Scenarios**:
```javascript
// tests/integration/progress/scenarios.spec.js

test('Prospective SD: all PASS reaches 100%', async () => {
  const sd = await seedSD({ status: 'in_progress', validation_mode: 'prospective' });
  await seedAgentResults(sd.id, 6, { verdict: 'PASS', mode: 'prospective' });

  const progress = await calculateProgress(sd.id);
  expect(progress.percentage).toBe(100);
  expect(progress.agents_verified).toBe(6);
});

test('Prospective SD: mixed PASS/CONDITIONAL_PASS does not reach 100%', async () => {
  const sd = await seedSD({ status: 'in_progress' });
  await seedAgentResults(sd.id, 5, { verdict: 'PASS', mode: 'prospective' });
  await seedAgentResults(sd.id, 1, { verdict: 'CONDITIONAL_PASS', mode: 'prospective' });

  const progress = await calculateProgress(sd.id);
  expect(progress.percentage).toBeLessThan(100);
  expect(progress.blocked_reason).toContain('CONDITIONAL_PASS not allowed');
});

test('Retrospective SD: PASS + CONDITIONAL_PASS reaches 100%', async () => {
  const sd = await seedSD({ status: 'completed', validation_mode: 'retrospective' });
  await seedAgentResults(sd.id, 5, { verdict: 'PASS', mode: 'retrospective' });
  await seedAgentResults(sd.id, 1, {
    verdict: 'CONDITIONAL_PASS',
    mode: 'retrospective',
    justification: 'Tests pass but infrastructure has known gaps.',
    conditions: ['Follow-up SD recommended']
  });

  const progress = await calculateProgress(sd.id);
  expect(progress.percentage).toBe(100);
  expect(progress.agents_verified).toBe(6);
});

test('Retrospective SD: any BLOCKED stops at 85%', async () => {
  const sd = await seedSD({ status: 'completed' });
  await seedAgentResults(sd.id, 5, { verdict: 'PASS', mode: 'retrospective' });
  await seedAgentResults(sd.id, 1, { verdict: 'BLOCKED', mode: 'retrospective' });

  const progress = await calculateProgress(sd.id);
  expect(progress.percentage).toBeLessThan(100);
  expect(progress.blocked_agents).toContain(1);
});
```

### AC-006: Backward Compatibility Test
**Scenario**: Existing SDs without validation_mode continue working
**Given**: Database has old records without validation_mode field
**When**: Progress is calculated
**Then**:
- Old records default to prospective mode behavior
- Queries handle NULL validation_mode gracefully
- No errors or data loss
- Performance unaffected

**Test Code**:
```javascript
test('Old SDs without validation_mode default to prospective', async () => {
  const oldSD = await seedSD({
    status: 'in_progress',
    validation_mode: null // Old record
  });

  // Should treat as prospective (strict)
  await seedAgentResults(oldSD.id, 1, {
    verdict: 'CONDITIONAL_PASS',
    validation_mode: null // Default during transition
  });

  const progress = await calculateProgress(oldSD.id);
  expect(progress.percentage).toBeLessThan(100); // Doesn't count CONDITIONAL_PASS
});
```

### AC-007: Audit Trail for CONDITIONAL_PASS
**Scenario**: All CONDITIONAL_PASS verdicts are logged for audit
**Given**: Sub-agent returns CONDITIONAL_PASS
**When**: Result is stored
**Then**:
- Audit entry created with: timestamp, sd_id, agent, verdict, justification
- Query to retrieve audit trail: returns all CONDITIONAL_PASS for an SD
- Historical tracking: know when and how completion was pragmatic
- Approve_by: SERVICE_ROLE documented for all entries

**Audit Query**:
```sql
SELECT
  id,
  sd_id,
  agent_name,
  verdict,
  validation_mode,
  justification,
  conditions,
  created_at,
  created_by
FROM sub_agent_execution_results
WHERE sd_id = $1
AND verdict = 'CONDITIONAL_PASS'
ORDER BY created_at DESC;
```

**Audit Logging Function**:
```javascript
async function logConditionalPass(result) {
  const auditEntry = {
    sd_id: result.sd_id,
    agent_name: result.agent_name,
    verdict: 'CONDITIONAL_PASS',
    validation_mode: 'retrospective',
    justification: result.justification,
    conditions: result.conditions,
    timestamp: new Date().toISOString(),
    logged_by: 'SYSTEM'
  };

  await supabase
    .from('audit_log')
    .insert(auditEntry);

  console.log(`Audit: CONDITIONAL_PASS recorded for ${result.sd_id}`);
}
```

### AC-008: Performance Testing
**Scenario**: Progress calculation maintains sub-5ms response time
**Given**: Large SD with many sub-agent results
**When**: Progress is calculated
**Then**:
- Query execution: <2ms
- Total function execution: <5ms (includes overhead)
- No N+1 query problems
- Indexes are utilized (EXPLAIN ANALYZE shows index scans)

**Performance Test**:
```javascript
test('Progress calculation <5ms with many agents', async () => {
  const sd = await seedSD({ status: 'completed' });

  // Seed 100 sub-agent results (simulating multiple executions)
  for (let i = 0; i < 100; i++) {
    await seedAgentResults(sd.id, 6, { verdict: 'PASS' });
  }

  const start = performance.now();
  const progress = await calculateProgress(sd.id);
  const duration = performance.now() - start;

  expect(duration).toBeLessThan(5); // milliseconds
  console.log(`Progress calculation took ${duration}ms`);
});
```

---

## Implementation Context

### Architecture References

**Related Components**:
- `database/functions/get_progress_breakdown.sql` - Primary function to update
- `scripts/progress-calculation.js` - Business logic wrapper
- `tests/integration/progress/` - Existing test structure
- `database/migrations/001_initial_schema.sql` - Verdict enum location

**Update Strategy**:
1. Update SQL function first (database layer)
2. Update JavaScript wrapper (application layer)
3. Update all queries that reference verdict
4. Add new indexes for performance
5. Run tests at each step

### Integration Points

**Code Flow**:
```
User requests SD progress
  ↓
calculate_progress(sd_id)
  ↓
Query sub_agent_execution_results
  ↓
Check: verdict IN ('PASS', 'CONDITIONAL_PASS')
  AND (verdict != 'CONDITIONAL_PASS' OR validation_mode = 'retrospective')
  ↓
Count agents_verified / total_agents
  ↓
Calculate percentage
  ↓
Return progress object
```

### Example Code Patterns

**SQL Function Update** (`database/functions/get_progress_breakdown.sql`):

```sql
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param TEXT)
RETURNS TABLE (
  sd_id TEXT,
  total_agents INT,
  agents_verified INT,
  verification_percentage NUMERIC,
  sub_agents_verified BOOLEAN,
  sub_agent_status TEXT,
  blocked_agents TEXT[]
) AS $$
DECLARE
  v_total_agents INT;
  v_agents_verified INT;
  v_blocked_agents TEXT[];
  v_sub_agents_verified BOOLEAN;
BEGIN
  -- Count total agents
  v_total_agents := (
    SELECT COUNT(DISTINCT agent_name)
    FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param
  );

  -- Count VERIFIED agents (PASS or CONDITIONAL_PASS in retrospective)
  v_agents_verified := (
    SELECT COUNT(DISTINCT agent_name)
    FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param
    AND (
      verdict = 'PASS' OR
      (verdict = 'CONDITIONAL_PASS' AND validation_mode = 'retrospective')
    )
  );

  -- Get blocked agents
  v_blocked_agents := array_agg(DISTINCT agent_name)
    FROM sub_agent_execution_results
    WHERE sd_id = sd_id_param
    AND verdict NOT IN ('PASS', 'CONDITIONAL_PASS');

  v_sub_agents_verified := (v_agents_verified = v_total_agents);

  RETURN QUERY SELECT
    sd_id_param,
    v_total_agents,
    v_agents_verified,
    CASE WHEN v_total_agents > 0
      THEN ROUND((v_agents_verified::NUMERIC / v_total_agents::NUMERIC) * 100, 2)
      ELSE 0
    END,
    v_sub_agents_verified,
    CASE
      WHEN v_sub_agents_verified THEN 'COMPLETE'
      WHEN array_length(v_blocked_agents, 1) > 0 THEN 'BLOCKED: ' || array_to_string(v_blocked_agents, ', ')
      ELSE 'IN_PROGRESS'
    END,
    v_blocked_agents;
END;
$$ LANGUAGE plpgsql STABLE;
```

**JavaScript Wrapper Update**:

```javascript
// scripts/progress-calculation.js

async function calculateProgress(sdId) {
  const { data, error } = await supabase
    .rpc('get_progress_breakdown', { sd_id_param: sdId });

  if (error) throw error;

  const result = data[0];

  return {
    sd_id: result.sd_id,
    total_agents: result.total_agents,
    agents_verified: result.agents_verified,
    percentage: parseFloat(result.verification_percentage),
    sub_agents_verified: result.sub_agents_verified,
    status: result.sub_agent_status,
    blocked_agents: result.blocked_agents || [],
    can_complete: result.sub_agents_verified,

    // New: Include conditional pass analysis
    has_conditional_pass: await hasConditionalPass(sdId),
    audit_trail: await getAuditTrail(sdId)
  };
}

async function hasConditionalPass(sdId) {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('agent_name, justification')
    .eq('sd_id', sdId)
    .eq('verdict', 'CONDITIONAL_PASS');

  if (error) throw error;

  return {
    has_conditional: data.length > 0,
    count: data.length,
    agents: data.map(d => d.agent_name),
    summary: data.map(d => ({
      agent: d.agent_name,
      justification: d.justification
    }))
  };
}

async function getAuditTrail(sdId) {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .eq('verdict', 'CONDITIONAL_PASS')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data;
}
```

---

## Testing Strategy

### Phase 1: Unit Tests (Verdict Logic)

**File**: `tests/unit/progress/verdict-acceptance-logic.spec.js`

```javascript
describe('Verdict Acceptance Logic', () => {
  const assessVerdictCompletion = (verdict, mode) => {
    if (verdict === 'PASS') return true;
    if (verdict === 'CONDITIONAL_PASS' && mode === 'retrospective') return true;
    return false;
  };

  describe('PASS verdict', () => {
    test('Should be accepted in prospective mode', () => {
      expect(assessVerdictCompletion('PASS', 'prospective')).toBe(true);
    });
    test('Should be accepted in retrospective mode', () => {
      expect(assessVerdictCompletion('PASS', 'retrospective')).toBe(true);
    });
  });

  describe('CONDITIONAL_PASS verdict', () => {
    test('Should NOT be accepted in prospective mode', () => {
      expect(assessVerdictCompletion('CONDITIONAL_PASS', 'prospective')).toBe(false);
    });
    test('Should be accepted in retrospective mode', () => {
      expect(assessVerdictCompletion('CONDITIONAL_PASS', 'retrospective')).toBe(true);
    });
  });

  describe('Negative verdicts', () => {
    ['BLOCKED', 'FAILED'].forEach(verdict => {
      test(`${verdict} should not be accepted in any mode`, () => {
        expect(assessVerdictCompletion(verdict, 'prospective')).toBe(false);
        expect(assessVerdictCompletion(verdict, 'retrospective')).toBe(false);
      });
    });
  });
});
```

### Phase 2: Integration Tests (Real Progress Scenarios)

**File**: `tests/integration/progress/calculation-scenarios.spec.js`

Includes tests from AC-005 above.

### Phase 3: Performance Tests

**File**: `tests/performance/progress-calculation-perf.spec.js`

Includes tests from AC-008 above.

---

## Success Criteria

- Progress calculation correctly accepts CONDITIONAL_PASS in retrospective mode only
- All queries updated with validation_mode logic
- Backward compatible (old SDs work with new logic)
- Unit tests: 100% coverage of verdict logic (15+ test cases)
- Integration tests: 8+ real SD scenarios tested
- Performance: <5ms per progress calculation
- Audit trail: All CONDITIONAL_PASS verdicts logged
- No breaking changes to existing SDs

---

## Story Dependencies

**Depends On**:
- US-001 (Database Migration)
- US-002 (Sub-Agent Updates)

**Blocks**: EXEC phase can proceed (dependencies complete)

---

## References

- Draft: `/tmp/SD-LEO-PROTOCOL-V4-4-0-draft.md` (Phase 3: Progress Calculation)
- SQL Function: `database/functions/get_progress_breakdown.sql`
- Root Cause: `/tmp/leo-protocol-handoff-constraint-analysis.md`

**Created**: 2025-11-15
**Status**: READY FOR DEVELOPMENT
