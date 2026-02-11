# Strategic Directive Proposal: SD-LEO-TESTING-GOVERNANCE-001D


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-05
- **Tags**: database, testing, migration, schema

## Test Coverage Metrics in Retrospectives

**Proposed ID:** SD-LEO-TESTING-GOVERNANCE-001D
**Parent SD:** SD-LEO-TESTING-GOVERNANCE-001
**Type:** Feature (Child SD)
**Category:** protocol
**Priority:** MEDIUM
**Target Application:** EHG_Engineer
**Estimated Effort:** 15-20 hours

---

## 1. Strategic Intent

Add quantitative test coverage metrics to the retrospectives table with a foreign key link to test_runs. This enables trend analysis, quality tracking, and evidence-based protocol improvements.

---

## 2. Rationale

### Evidence Base
- **4 retrospectives** requested: "Add test coverage metrics to testing-focused SD retrospectives"
- **No FK to test_runs** - quality_score has no correlation with actual test metrics
- **Sparse test fields** - only `tests_added` and `code_coverage_delta` exist
- Cannot answer: "Did this SD meet coverage requirements?"

### Current State
- retrospectives table has 64 columns
- `tests_added` (INTEGER) and `code_coverage_delta` (NUMERIC) exist but sparse
- NO foreign key to test_runs table
- RETRO sub-agent receives testEvidence but doesn't persist FK

### Target State
- `test_run_id` FK column links retrospective to test execution
- Quantitative metrics: pass_rate, total_count, story_coverage_percent
- RETRO sub-agent populates metrics from `v_sd_test_readiness` view
- Trend analysis enabled via FK relationship

---

## 3. Scope

### In Scope
- Database migration adding columns to retrospectives
- Modify RETRO sub-agent to populate new fields
- Query `v_sd_test_readiness` for coverage metrics
- Index for efficient test_run lookups

### Out of Scope
- UI changes to retrospective display
- Historical data backfill
- Test threshold enforcement
- Changes to test_runs schema

---

## 4. Key Changes

### New File: `database/migrations/20260105_add_retro_test_metrics.sql`

```sql
-- LEO Protocol v4.4.2: Add test coverage metrics to retrospectives
-- Part of SD-LEO-TESTING-GOVERNANCE-001D

-- Add FK to test_runs
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS test_run_id UUID REFERENCES test_runs(id);

-- Add quantitative test metrics
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS test_pass_rate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS test_total_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_passed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_failed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_skipped_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_evidence_freshness TEXT
  CHECK (test_evidence_freshness IN ('FRESH', 'AGING', 'STALE', NULL)),
ADD COLUMN IF NOT EXISTS story_coverage_percent NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS stories_with_tests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS stories_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS test_verdict VARCHAR(20)
  CHECK (test_verdict IN ('PASS', 'FAIL', 'PARTIAL', 'ERROR', NULL));

-- Index for test_run lookups
CREATE INDEX IF NOT EXISTS idx_retrospectives_test_run_id
ON retrospectives(test_run_id) WHERE test_run_id IS NOT NULL;

-- Composite index for metrics queries
CREATE INDEX IF NOT EXISTS idx_retrospectives_test_metrics
ON retrospectives(sd_id, test_pass_rate, test_verdict)
WHERE test_run_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN retrospectives.test_run_id IS
  'FK to test_runs for quantitative metrics. Populated by RETRO sub-agent.';
COMMENT ON COLUMN retrospectives.test_pass_rate IS
  'Pass rate from linked test_run (0-100)';
COMMENT ON COLUMN retrospectives.story_coverage_percent IS
  'Percentage of user stories with passing tests';
```

### File: `lib/sub-agents/retro.js`

**Add extractTestMetrics function:**

```javascript
/**
 * Extract test metrics for retrospective storage
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} testEvidence - Test evidence from v_latest_test_evidence
 * @param {Object} testReadiness - Coverage data from v_sd_test_readiness
 */
function extractTestMetrics(sdId, testEvidence, testReadiness) {
  const defaults = {
    test_run_id: null,
    test_pass_rate: null,
    test_total_count: 0,
    test_passed_count: 0,
    test_failed_count: 0,
    test_skipped_count: 0,
    test_evidence_freshness: null,
    story_coverage_percent: null,
    stories_with_tests: 0,
    stories_total: 0,
    test_verdict: null
  };

  if (!testEvidence) return defaults;

  return {
    test_run_id: testEvidence.test_run_id || null,
    test_pass_rate: testEvidence.pass_rate || null,
    test_total_count: testEvidence.total_tests || 0,
    test_passed_count: testEvidence.passed_tests || 0,
    test_failed_count: testEvidence.failed_tests || 0,
    test_skipped_count: testEvidence.skipped_tests || 0,
    test_evidence_freshness: testEvidence.freshness_status || null,
    story_coverage_percent: testReadiness?.test_coverage_percent || null,
    stories_with_tests: testReadiness?.stories_with_tests || 0,
    stories_total: testReadiness?.total_stories || 0,
    test_verdict: testEvidence.verdict || null
  };
}
```

**Modify Phase 4.5 to fetch test readiness (around line 308):**

```javascript
// LEO v4.4.2: Phase 4.5 - Gather test evidence AND readiness
console.log('\n🧪 Phase 4.5: Gathering test evidence (LEO v4.3.4)...');
let testEvidence = null;
let testReadiness = null;

try {
  testEvidence = await getLatestTestEvidence(sdId);
  testReadiness = await getSDTestReadiness(sdId);  // NEW

  if (testEvidence) {
    console.log(`   ✅ Test evidence: ${testEvidence.verdict} (${testEvidence.pass_rate}%)`);
  }
  if (testReadiness) {
    console.log(`   📊 Story coverage: ${testReadiness.stories_with_tests}/${testReadiness.total_stories}`);
  }
} catch (err) {
  console.log(`   ⚠️  Could not retrieve test evidence: ${err.message}`);
}
```

**Modify generateRetrospective to include metrics (around line 833):**

```javascript
function generateRetrospective(sdData, prdData, handoffs, subAgentResults, _options, testEvidence = null, deliverables = null, testReadiness = null) {
  // ... existing code ...

  // Extract test metrics for database storage
  const testMetrics = extractTestMetrics(sdData.id, testEvidence, testReadiness);

  return {
    // ... existing fields ...

    // NEW: Test coverage metrics (LEO v4.4.2)
    test_run_id: testMetrics.test_run_id,
    test_pass_rate: testMetrics.test_pass_rate,
    test_total_count: testMetrics.test_total_count,
    test_passed_count: testMetrics.test_passed_count,
    test_failed_count: testMetrics.test_failed_count,
    test_skipped_count: testMetrics.test_skipped_count,
    test_evidence_freshness: testMetrics.test_evidence_freshness,
    story_coverage_percent: testMetrics.story_coverage_percent,
    stories_with_tests: testMetrics.stories_with_tests,
    stories_total: testMetrics.stories_total,
    test_verdict: testMetrics.test_verdict
  };
}
```

---

## 5. Success Criteria

| Criterion | Metric | Pass Threshold |
|-----------|--------|----------------|
| Migration applies | No errors | 100% |
| FK populates | test_run_id linked | When evidence exists |
| Metrics populate | pass_rate, counts filled | When evidence exists |
| Story coverage | story_coverage_percent filled | When stories exist |
| No regressions | Historical retros intact | NULL values ok |
| Query performance | FK index used | <100ms |

---

## 6. New Columns Summary

| Column | Type | Source |
|--------|------|--------|
| `test_run_id` | UUID FK | v_latest_test_evidence.test_run_id |
| `test_pass_rate` | NUMERIC(5,2) | v_latest_test_evidence.pass_rate |
| `test_total_count` | INTEGER | v_latest_test_evidence.total_tests |
| `test_passed_count` | INTEGER | v_latest_test_evidence.passed_tests |
| `test_failed_count` | INTEGER | v_latest_test_evidence.failed_tests |
| `test_skipped_count` | INTEGER | v_latest_test_evidence.skipped_tests |
| `test_evidence_freshness` | TEXT | v_latest_test_evidence.freshness_status |
| `story_coverage_percent` | NUMERIC(5,2) | v_sd_test_readiness.test_coverage_percent |
| `stories_with_tests` | INTEGER | v_sd_test_readiness.stories_with_tests |
| `stories_total` | INTEGER | v_sd_test_readiness.total_stories |
| `test_verdict` | VARCHAR(20) | v_latest_test_evidence.verdict |

---

## 7. Acceptance Testing

- [ ] Migration creates all new columns without errors
- [ ] test_run_id FK constraint works correctly
- [ ] New retrospective with test evidence has test_run_id populated
- [ ] test_pass_rate matches v_latest_test_evidence.pass_rate
- [ ] story_coverage_percent matches v_sd_test_readiness
- [ ] Historical retrospectives remain unaffected (NULL values)
- [ ] Check constraints enforce valid freshness/verdict values
- [ ] Index improves query performance for test_run lookups

---

## 8. Estimated LOC

- Migration SQL: ~45 lines
- extractTestMetrics function: ~35 lines
- Phase 4.5 modifications: ~15 lines
- generateRetrospective modifications: ~20 lines
- **Total: ~115 lines**

---

*Part of SD-LEO-TESTING-GOVERNANCE-001 orchestrator*
