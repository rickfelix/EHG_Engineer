# Database Constraint Violation Analysis: SD-STAGE-10-001

## Issue Summary
**Error**: `new row for relation "leo_handoff_executions" violates check constraint "leo_handoff_executions_validation_score_check"`

**Status**: ✅ RESOLVED (subsequent attempt succeeded)

**Root Cause**: Score calculation bug - totalScore is SUM of gate scores instead of PERCENTAGE

## Investigation Results

### 1. Constraint Definition
```sql
CHECK ((validation_score >= 0) AND (validation_score <= 100))
```

**Location**: `leo_handoff_executions.validation_score` column  
**Expected**: Integer between 0-100 (percentage)  
**Actual**: Integer sum of all gate scores (can exceed 100)

### 2. Current Implementation (BUG)

**File**: `/mnt/c/_EHG/EHG_Engineer/scripts/modules/handoff/validation/ValidationOrchestrator.js`

```javascript
async validateGates(gates, context = {}) {
  const results = {
    passed: true,
    totalScore: 0,        // BUG: This is a SUM, not a percentage
    totalMaxScore: 0,
    // ...
  };

  for (const gate of gates) {
    const gateResult = await this.validateGate(gate.name, gate.validator, context);
    results.gateResults[gate.name] = gateResult;
    results.totalScore += gateResult.score;      // Adds 100 for each passed gate
    results.totalMaxScore += gateResult.maxScore; // Adds 100 for each gate
    // ...
  }

  return results;
}
```

**File**: `/mnt/c/_EHG/EHG_Engineer/scripts/modules/handoff/executors/ExecToPlanExecutor.js`

```javascript
getRequiredGates(_sd, _options) {
  const gates = [];
  
  // Gate 1: SUB_AGENT_ORCHESTRATION (score: 100, max_score: 100)
  gates.push({ ... });
  
  // Gate 2: BMAD_EXEC_TO_PLAN (score: 100, max_score: 100)
  gates.push({ ... });
  
  // Gate 3: GATE2_IMPLEMENTATION_FIDELITY (score: 100, max_score: 100)
  gates.push({ ... });
  
  // Gate 4: GATE3_TRACEABILITY (score: 100, max_score: 100)
  gates.push({ ... });
  
  return gates;
}
```

**Result**:
- 4 gates × 100 points each = **400 totalScore** (exceeds constraint!)
- Database expects: 0-100
- Actual calculation: 0-400+ (depending on number of gates)

### 3. Why It Sometimes Succeeds

The handoff actually succeeded on the 3rd attempt because:
- Query results show EXEC-TO-PLAN was recorded at `2025-12-04T18:01:32.608Z`
- `validation_score = 100` (within constraint)

**Hypothesis**: The error occurred during initial attempts when totalScore > 100, but subsequent retry used fallback logic:

```javascript
// From HandoffRecorder.js line 41
validation_score: result.qualityScore || 100,
```

If `result.qualityScore` was undefined/null, it defaulted to 100, which passes constraint.

### 4. Proven Solution Pattern

**File**: `/mnt/c/_EHG/EHG_Engineer/scripts/modules/handoff/validation/ValidationOrchestrator.js`

**Current (BUGGY)**:
```javascript
return results; // totalScore = sum of all gate scores
```

**Fixed (NORMALIZED)**:
```javascript
// Calculate percentage score
if (results.totalMaxScore > 0) {
  results.percentageScore = Math.round((results.totalScore / results.totalMaxScore) * 100);
} else {
  results.percentageScore = 0;
}

return results;
```

**Then update caller** (`ExecToPlanExecutor.js` line 224):
```javascript
// Current (BUGGY)
qualityScore: gateResults.totalScore

// Fixed (NORMALIZED)
qualityScore: gateResults.percentageScore || Math.round((gateResults.totalScore / gateResults.totalMaxScore) * 100)
```

### 5. Schema Alignment Check

✅ **Constraint is CORRECT**  
- `validation_score` should be 0-100 (percentage)
- Aligns with user expectations (100% = all gates passed)
- Matches display format (line 99 in handoff.js: `score + '%'`)

❌ **Calculation is WRONG**  
- Uses SUM instead of PERCENTAGE
- Creates constraint violations
- Misleading if displayed as percentage

### 6. Impact Assessment

**Severity**: MEDIUM (data integrity issue)

**Affected Handoffs**:
- EXEC-TO-PLAN (4 gates = max 400 score)
- PLAN-TO-LEAD (unknown gate count)
- Any handoff with >1 gate

**Not Affected**:
- LEAD-TO-PLAN (likely 1 gate)
- PLAN-TO-EXEC (likely 1 gate)

**User Impact**:
- Handoff may fail on first attempt
- Retry may succeed with fallback value (100)
- Inconsistent data in database

### 7. Recommended Fix

**Priority**: P1 (blocks handoff reliability)

**Change Location**: 
1. `/mnt/c/_EHG/EHG_Engineer/scripts/modules/handoff/validation/ValidationOrchestrator.js` (add percentageScore)
2. `/mnt/c/_EHG/EHG_Engineer/scripts/modules/handoff/executors/ExecToPlanExecutor.js` (use percentageScore)
3. `/mnt/c/_EHG/EHG_Engineer/scripts/modules/handoff/executors/PlanToLeadExecutor.js` (use percentageScore)

**Testing**:
```bash
# After fix, verify constraint compliance
node -e "
import { createDatabaseClient } from './scripts/lib/supabase-connection.js';
(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });
  const result = await client.query(\`
    SELECT validation_score, COUNT(*) as count
    FROM leo_handoff_executions
    GROUP BY validation_score
    ORDER BY validation_score DESC;
  \`);
  console.table(result.rows);
  await client.end();
})();
"
```

**Validation**:
- All validation_score values should be 0-100
- No constraint violations
- Percentage calculation should match expected outcome

## Prevention Checklist

- [ ] Add database constraint validation to pre-commit hooks
- [ ] Add unit tests for ValidationOrchestrator.validateGates()
- [ ] Document scoring system in schema docs
- [ ] Add assertion: `totalScore <= 100` before database insert
- [ ] Create issue pattern: PAT-DB-SCORE-001

## References

- **Constraint**: `leo_handoff_executions_validation_score_check`
- **Related Files**: 
  - `scripts/modules/handoff/validation/ValidationOrchestrator.js`
  - `scripts/modules/handoff/executors/ExecToPlanExecutor.js`
  - `scripts/modules/handoff/recording/HandoffRecorder.js`
- **Related Patterns**: PAT-001 (schema validation), SD-VWC-PRESETS-001 (format validation)
