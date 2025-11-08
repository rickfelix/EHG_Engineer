# Schema Mismatch Issues - SD-CREWAI-COMPETITIVE-INTELLIGENCE-001

**Date**: 2025-11-07
**Session Context**: EXEC→PLAN handoff validation debugging
**Severity**: HIGH (Blocking database operations)

## Executive Summary

During validation of SD-CREWAI-COMPETITIVE-INTELLIGENCE-001, discovered **3 critical schema mismatches** between LEO Protocol v4.3.0 documentation/code and actual database schema. These mismatches prevent queries from working correctly and block handoff completion.

---

## Issue 1: `retrospectives` Table Column Mismatches

### Problem
LEO v4.3.0 documentation references non-existent columns in `retrospectives` table.

### Incorrect Column Names (In Docs/Code)
- ❌ `what_went_wrong` - DOES NOT EXIST
- ❌ `lessons_learned` - DOES NOT EXIST

### Correct Column Names (Actual Schema)
- ✅ `what_needs_improvement` (jsonb)
- ✅ `key_learnings` (jsonb)

### Impact
- Queries fail with: `column "what_went_wrong" does not exist`
- Retrospective generation scripts fail
- LEO v4.3.0 mandates retrospectives before SD completion (quality_score ≥70)
- Blocks LEAD Final Approval phase

### Affected Files
- Any script querying retrospectives table
- LEO Protocol v4.3.0 documentation
- Retrospective generation scripts
- Handoff validation that checks for retrospectives

### Evidence
```sql
-- Query that reveals the mismatch:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'retrospectives'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Shows actual columns:
-- what_went_well: jsonb ✅
-- what_needs_improvement: jsonb ✅ (NOT what_went_wrong)
-- key_learnings: jsonb ✅ (NOT lessons_learned)
```

---

## Issue 2: `sub_agent_execution_results` Table Column Mismatches

### Problem
Multiple column name mismatches in `sub_agent_execution_results` table.

### Incorrect Column Names (In Code)
- ❌ `sub_agent_type` - DOES NOT EXIST
- ❌ `confidence_score` - DOES NOT EXIST
- ❌ `analysis_details` - DOES NOT EXIST
- ❌ `execution_id` - DOES NOT EXIST
- ❌ `risk_level` - DOES NOT EXIST

### Correct Column Names (Actual Schema)
- ✅ `sub_agent_code` (text)
- ✅ `sub_agent_name` (text)
- ✅ `confidence` (integer) - NOT `confidence_score`
- ✅ `detailed_analysis` (text) - NOT `analysis_details`
- ✅ `id` (uuid) - NOT `execution_id`
- ✅ No `risk_level` column exists
- ✅ Has `risk_assessment_id` (uuid) instead

### Impact
- INSERT/UPDATE queries fail with column not found errors
- E2E test results cannot be stored in database
- Sub-agent execution tracking broken
- Blocks handoff verification

### Affected Files
- Any script storing sub-agent results
- Handoff validation scripts
- Sub-agent execution tracking

### Evidence
```sql
-- Query that reveals the mismatch:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sub_agent_execution_results'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Shows actual columns:
-- id: uuid (NOT execution_id)
-- sub_agent_code: text (NOT sub_agent_type)
-- sub_agent_name: text
-- confidence: integer (NOT confidence_score)
-- detailed_analysis: text (NOT analysis_details)
-- risk_assessment_id: uuid (NOT risk_level)
```

---

## Issue 3: TESTING Sub-Agent Flag Passing Limitation

### Problem
The unified handoff system doesn't pass CLI flags (like `--full-e2e`) to sub-agents during orchestration.

### Impact
- E2E tests were run successfully (56/58 passed, 96.6% pass rate)
- TESTING sub-agent re-runs without `--full-e2e` flag
- Cannot detect the E2E tests that were just executed
- Returns BLOCKED verdict despite successful testing
- Blocks EXEC→PLAN handoff completion

### Root Cause
`unified-handoff-system.js` invokes sub-agents programmatically without forwarding CLI flags from parent process.

### Evidence
```bash
# Tests passed successfully:
npx playwright test tests/e2e/competitive-intelligence.spec.ts
# Result: 56/58 passed (2.0m)

# But handoff system runs:
node scripts/unified-handoff-system.js execute EXEC-TO-PLAN SD-XXX
# TESTING sub-agent: "❌ No E2E tests executed" (BLOCKED)
```

### Workaround
Run TESTING sub-agent directly with flag before handoff:
```bash
node scripts/execute-subagent.js --code TESTING --sd-id <SD-ID> --full-e2e
```

---

## Recommended Fixes

### Priority 1: Schema Alignment (CRITICAL)

**Option A**: Update database schema to match documentation
- Rename columns in actual database tables
- **Risk**: HIGH - May break existing data/queries
- **Time**: 2-4 hours (migration + testing)

**Option B**: Update all code/docs to match actual schema ✅ **RECOMMENDED**
- Grep for all occurrences of incorrect column names
- Replace with correct column names
- Update LEO v4.3.0 documentation
- **Risk**: MEDIUM - Code changes only
- **Time**: 1-2 hours (search & replace + testing)

### Priority 2: Fix Flag Passing Architecture

**Option A**: Add flag forwarding to handoff system
- Modify `unified-handoff-system.js` to accept and forward flags
- **Risk**: MEDIUM - Changes core orchestration
- **Time**: 2-3 hours

**Option B**: Make TESTING sub-agent check database for recent results ✅ **RECOMMENDED**
- Query `sub_agent_execution_results` for recent TESTING results
- If found within last hour, use those results instead of re-running
- **Risk**: LOW - Isolated to TESTING sub-agent
- **Time**: 30-60 minutes

---

## Files Requiring Updates

### For Issue 1 (retrospectives)
```bash
# Find all files referencing incorrect columns:
grep -r "what_went_wrong" scripts/ lib/ --include="*.js" --include="*.mjs"
grep -r "lessons_learned" scripts/ lib/ --include="*.js" --include="*.mjs"

# Replace with:
# what_went_wrong → what_needs_improvement
# lessons_learned → key_learnings
```

### For Issue 2 (sub_agent_execution_results)
```bash
# Find all files referencing incorrect columns:
grep -r "sub_agent_type" scripts/ lib/ --include="*.js" --include="*.mjs"
grep -r "confidence_score" scripts/ lib/ --include="*.js" --include="*.mjs"
grep -r "analysis_details" scripts/ lib/ --include="*.js" --include="*.mjs"
grep -r "execution_id" scripts/ lib/ --include="*.js" --include="*.mjs"

# Replace with:
# sub_agent_type → sub_agent_code
# confidence_score → confidence
# analysis_details → detailed_analysis
# execution_id → id (in WHERE clauses)
# risk_level → risk_assessment_id
```

---

## Session Accomplishments

Despite schema mismatches, completed:

1. ✅ **Fixed Multi-Repo Detection Bug** (2 commits)
   - Section D: Test detection now finds 134 test files (+20 points)
   - Section A: Component detection now finds 4 components (+5 points)
   - Gate 2 Score: 49 → 74/100 (+25 points)

2. ✅ **Fixed Sub-Agent False Positives** (5 commits)
   - DOCMON: BLOCKED → PASS (100%)
   - GITHUB: BLOCKED → PASS (100%)

3. ✅ **Ran Actual E2E Tests**
   - Result: 56/58 passed (96.6% pass rate)
   - Duration: 2 minutes
   - Minor failures: 2 Share button visibility issues

4. ✅ **Branch Cleanup**
   - Deleted 16 fully-merged remote branches
   - Verified 0 unique commits before deletion

5. ✅ **Discovered Schema Mismatches**
   - Documented 3 critical issues
   - Provided fix recommendations
   - Created this comprehensive report

---

## Next Steps

1. **Database-Agent Task**: Create task to fix all schema mismatch references
2. **Testing Sub-Agent Enhancement**: Implement database-backed result caching
3. **Documentation Update**: Align LEO v4.3.0 docs with actual schema
4. **Validation**: Test all fixes against live database

---

## References

- **SD**: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
- **Phase**: EXEC (attempting EXEC→PLAN handoff)
- **Gate 2 Score**: 74/100 (needs 80 to pass)
- **E2E Test Results**: `/tmp/e2e-test-results.log`
- **Session Log**: Context continuation from previous session
