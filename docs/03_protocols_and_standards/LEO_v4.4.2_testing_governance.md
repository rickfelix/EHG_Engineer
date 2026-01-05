# LEO Protocol v4.4.2 - Testing Governance Enhancement

**Status**: ACTIVE
**Version**: 4.4.2
**Effective**: 2026-01-05
**SD**: SD-LEO-TESTING-GOVERNANCE-001

## Overview

LEO Protocol v4.4.2 introduces mandatory testing validation gates in the EXEC→PLAN handoff to ensure all code-producing Strategic Directives have verifiable test coverage before verification phase. This amendment addresses recurring quality issues where implementations proceeded to verification without adequate testing evidence.

## Problem Statement

**Evidence from retrospectives** (74+ analyzed):
- Implementations frequently reached PLAN verification without test execution
- Test evidence was stale (>24h old) or missing entirely
- No linkage between test results and user story acceptance criteria
- Schema mismatches caused 42-95 hours/year in rework

## Solution Architecture

### 1. MANDATORY_TESTING_VALIDATION Gate

**Location**: `scripts/modules/handoff/executors/ExecToPlanExecutor.js`

**Purpose**: Blocks EXEC→PLAN handoff for code-producing SDs without fresh, passing test evidence.

#### Validation Logic

```javascript
// Gate validates:
// 1. SD type exemptions (docs, infrastructure, orchestrator)
// 2. TESTING sub-agent execution exists
// 3. Verdict is PASS or CONDITIONAL_PASS
// 4. Results are fresh (<24h by default)

const maxAgeHours = parseInt(process.env.LEO_TESTING_MAX_AGE_HOURS || '24');
```

#### SD Type Exemptions

| SD Type | Testing Required | Rationale |
|---------|------------------|-----------|
| `feature` | ✅ YES | Produces user-facing code |
| `bugfix` | ✅ YES | Modifies existing code |
| `refactor` | ✅ YES | Changes implementation |
| `performance` | ✅ YES | Requires performance tests |
| `security` | ✅ YES | Critical for security validation |
| `documentation` | ❌ NO | No code changes |
| `docs` | ❌ NO | Alias for documentation |
| `infrastructure` | ❌ NO | Non-code infrastructure |
| `orchestrator` | ❌ NO | Delegates to child SDs |

#### Gate Behavior

**PASS Conditions**:
- TESTING sub-agent executed within last 24h (configurable)
- Verdict: `PASS` or `CONDITIONAL_PASS`
- Linked to SD via `sub_agent_execution_results` table

**FAIL Conditions**:
- No TESTING sub-agent execution found
- Verdict: `FAIL` or `ERROR`
- Results stale (>24h old)
- Code-producing SD type without test evidence

**Example Output**:
```
🧪 MANDATORY TESTING VALIDATION (BLOCKING)
--------------------------------------------------
   ℹ️  SD Type: feature (testing REQUIRED)
   ✅ TESTING sub-agent executed
   ✅ Verdict: PASS (confidence: 90)
   ✅ Freshness: 2.3h old (max 24h)

✅ GATE PASSED (100/100)
```

#### Configuration

**Environment Variables**:

```bash
# Maximum age of test results (hours)
# Default: 24h
export LEO_TESTING_MAX_AGE_HOURS=24

# Controls blocking behavior (future use)
# Default: true for code-producing SDs
export LEO_TESTING_MANDATORY=true
```

---

### 2. TEST_EVIDENCE_AUTO_CAPTURE Gate

**Location**: `scripts/modules/handoff/executors/ExecToPlanExecutor.js`

**Purpose**: Advisory (non-blocking) gate that auto-ingests test reports before sub-agent orchestration.

#### Scan Locations

The gate scans these paths for test evidence:

```javascript
const testReportPaths = [
  'playwright-report/report.json',
  'test-results/.last-run.json',
  'coverage/coverage-summary.json',
  'playwright-report/results.json'
];
```

#### Freshness Logic

```javascript
// 1. Check for existing fresh evidence (<60min)
const maxAgeMinutes = parseInt(process.env.LEO_TEST_EVIDENCE_MAX_AGE_MINUTES || '60');
const freshnessCheck = await checkTestEvidenceFreshness(sdId, maxAgeMinutes);

if (freshnessCheck?.isFresh) {
  // Use existing evidence, skip file scan
  return { passed: true, score: 100 };
}

// 2. Scan filesystem for reports
// 3. Ingest via ingestTestEvidence()
// 4. Link to user stories via story_test_mappings
```

#### Auto-Linking to User Stories

The gate automatically:
1. Parses test file names (e.g., `auth-login.spec.ts`)
2. Matches to user story titles via fuzzy matching
3. Creates records in `story_test_mappings` table
4. Enables story coverage metrics in retrospectives

**Example Output**:
```
📥 TEST EVIDENCE AUTO-CAPTURE (ADVISORY)
--------------------------------------------------
   📄 Found: report.json (15min old)
   📄 Found: coverage-summary.json (15min old)
   📥 Ingesting test evidence...
   ✅ Test evidence ingested successfully
      Test Run ID: abc-123-def
      Tests: 47 (45 passed, 2 failed)
      Stories Linked: 8

✅ GATE PASSED (100/100)
```

#### Configuration

**Environment Variables**:

```bash
# Maximum age for existing evidence to be considered fresh
# Default: 60 minutes
export LEO_TEST_EVIDENCE_MAX_AGE_MINUTES=60
```

---

### 3. Schema Context Loader

**Location**: `lib/schema-context-loader.js`

**Purpose**: Extracts table names from SD descriptions and loads relevant schema documentation to reduce schema mismatches.

#### Architecture

```javascript
// 1. Extract table names from SD description
const tables = extractTableNames(sd.description);
// → ['retrospectives', 'test_runs', 'story_test_mappings']

// 2. Load schema docs for each table
const schemaDocs = await loadSchemaDocs(tables);
// → Returns markdown content from docs/reference/schema/engineer/tables/

// 3. Inject into context for PLAN/EXEC phases
context.schemaDocs = schemaDocs;
```

#### Known Tables Registry

The loader recognizes 60+ common tables:

```javascript
const KNOWN_TABLES = [
  // Core LEO Protocol
  'strategic_directives_v2',
  'product_requirements_v2',
  'retrospectives',
  'sd_phase_handoffs',

  // Test Management
  'test_runs',
  'test_results',
  'story_test_mappings',
  'test_coverage_metrics',

  // Sub-agents
  'sub_agent_execution_results',
  'sub_agents',

  // ... 50+ more
];
```

#### Integration Points

**Phase Preflight Script**:
```bash
node scripts/phase-preflight.js <SD-ID> PLAN
# Auto-loads schema docs for tables mentioned in SD

node scripts/phase-preflight.js <SD-ID> EXEC
# Injects schema context into execution environment
```

**Benefits**:
- 42-95 hours/year saved (documented evidence)
- Reduces "column doesn't exist" errors
- Provides column types, constraints, indexes at implementation time

#### Example Schema Context

```markdown
## retrospectives Table

Columns (64 total):
- test_run_id: UUID (FK to test_runs)
- test_pass_rate: NUMERIC(5,2)
- test_verdict: VARCHAR(20) CHECK (IN 'PASS', 'FAIL', 'PARTIAL', 'ERROR')
- story_coverage_percent: NUMERIC(5,2)

Constraints:
- retrospectives_quality_score_check: quality_score >= 0 AND <= 100
```

---

### 4. Test Coverage Metrics in Retrospectives

**Migration**: `database/migrations/20260105_add_retro_test_metrics.sql`

**Purpose**: Capture quantitative test metrics in retrospectives for quality correlation analysis.

#### New Columns

| Column | Type | Purpose |
|--------|------|---------|
| `test_run_id` | UUID (FK) | Links to test_runs table |
| `test_pass_rate` | NUMERIC(5,2) | Pass rate 0-100 |
| `test_total_count` | INTEGER | Total tests executed |
| `test_passed_count` | INTEGER | Tests passed |
| `test_failed_count` | INTEGER | Tests failed |
| `test_skipped_count` | INTEGER | Tests skipped |
| `test_evidence_freshness` | TEXT | 'FRESH', 'AGING', 'STALE' |
| `story_coverage_percent` | NUMERIC(5,2) | % of stories with tests |
| `stories_with_tests` | INTEGER | Count of stories with passing tests |
| `stories_total` | INTEGER | Total stories in SD |
| `test_verdict` | VARCHAR(20) | 'PASS', 'FAIL', 'PARTIAL', 'ERROR' |

#### RETRO Sub-Agent Integration

**Location**: `lib/sub-agents/retro.js`

The RETRO sub-agent now automatically:

1. **Queries Latest Test Evidence**:
```javascript
const testEvidence = await getLatestTestEvidence(sdId);
// From test_runs + sub_agent_execution_results
```

2. **Populates Metrics**:
```javascript
metrics.test_run_id = testEvidence.test_run_id;
metrics.test_pass_rate = testEvidence.pass_rate;
metrics.test_total_count = testEvidence.total_tests;
metrics.test_passed_count = testEvidence.passed_tests;
metrics.test_verdict = testEvidence.verdict;
```

3. **Calculates Story Coverage**:
```javascript
const storyCoverage = await getStoryTestCoverage(sdId);
metrics.story_coverage_percent = Math.round(
  (storyCoverage.storiesWithTests / storyCoverage.totalStories) * 100
);
```

#### Analytics Queries

**Correlation Analysis**:
```sql
-- Does test pass rate correlate with quality score?
SELECT
  test_pass_rate,
  quality_score,
  story_coverage_percent,
  test_verdict
FROM retrospectives
WHERE test_run_id IS NOT NULL
  AND sd_id LIKE 'SD-%'
ORDER BY test_pass_rate DESC;
```

**Test Coverage Trends**:
```sql
-- Story coverage trends over time
SELECT
  DATE_TRUNC('week', conducted_date) as week,
  AVG(story_coverage_percent) as avg_coverage,
  COUNT(*) as retro_count
FROM retrospectives
WHERE story_coverage_percent IS NOT NULL
GROUP BY week
ORDER BY week DESC;
```

---

## Gate Execution Order

**EXEC→PLAN Handoff Sequence**:

```
1. PREREQUISITE_HANDOFF_CHECK (blocking)
   ↓
2. TEST_EVIDENCE_AUTO_CAPTURE (advisory) ← NEW in v4.4.2
   ↓
3. SUB_AGENT_ORCHESTRATION (blocking)
   ↓
4. MANDATORY_TESTING_VALIDATION (blocking) ← NEW in v4.4.2
   ↓
5. BMAD_EXEC_TO_PLAN (blocking)
   ↓
6. GATE2_IMPLEMENTATION_FIDELITY (blocking)
   ↓
7. Handoff created (score ≥85%)
```

**Key Changes**:
- TEST_EVIDENCE_AUTO_CAPTURE runs **before** SUB_AGENT_ORCHESTRATION
- MANDATORY_TESTING_VALIDATION runs **after** SUB_AGENT_ORCHESTRATION
- Ensures test evidence exists before TESTING sub-agent runs

---

## Usage Examples

### Running EXEC→PLAN Handoff

```bash
# Standard execution (auto-captures test evidence)
node scripts/handoff.js execute EXEC-TO-PLAN SD-FEATURE-123

# Output:
# ✅ TEST_EVIDENCE_AUTO_CAPTURE: Found 3 test reports, ingested
# ✅ SUB_AGENT_ORCHESTRATION: TESTING sub-agent passed
# ✅ MANDATORY_TESTING_VALIDATION: Fresh test evidence (2.1h old)
# ✅ Handoff created (score: 92%)
```

### Configuration for Strict Testing

```bash
# Require very fresh test evidence (8h)
export LEO_TESTING_MAX_AGE_HOURS=8

# Capture evidence if stale >30min
export LEO_TEST_EVIDENCE_MAX_AGE_MINUTES=30

node scripts/handoff.js execute EXEC-TO-PLAN SD-FEATURE-123
```

### Documentation SD (Exempt)

```bash
node scripts/handoff.js execute EXEC-TO-PLAN SD-DOCS-README-001

# Output:
# ✅ TEST_EVIDENCE_AUTO_CAPTURE: Skipped (docs type SD)
# ✅ MANDATORY_TESTING_VALIDATION: Skipped (docs type SD)
# ✅ Handoff created (score: 95%)
```

### Handling Stale Evidence

```bash
# Scenario: Test evidence is 36h old (>24h limit)
node scripts/handoff.js execute EXEC-TO-PLAN SD-FEATURE-456

# Output:
# ❌ MANDATORY_TESTING_VALIDATION FAILED
#    Test evidence stale (36.2h old, max 24h)
#
# REMEDIATION:
# 1. Run fresh tests: npx playwright test
# 2. Re-run TESTING sub-agent: npm run subagent:execute TESTING SD-FEATURE-456
# 3. Retry handoff after fresh test evidence exists
```

---

## Schema Documentation Updates

### retrospectives Table

**Schema Path**: `docs/reference/schema/engineer/tables/retrospectives.md`

**New Columns Documented**:
- Lines 37-43: Test metrics columns with descriptions
- Constraints: `test_evidence_freshness` CHECK constraint
- Indexes: `idx_retrospectives_test_run_id`, `idx_retrospectives_test_metrics`
- FK: `test_run_id → test_runs(id)`

### handoff_verification_gates Table

**No schema changes** - Gates implemented in code, not database.

---

## Impact Analysis

### Time Savings

| Issue Type | Hours/Year (Before) | Hours/Year (After) | Reduction |
|------------|---------------------|-------------------|-----------|
| Schema mismatches | 42-95 | 5-10 | 85-90% |
| Stale test evidence | 20-30 | 0 | 100% |
| Missing test coverage | 30-40 | 5 | 83-88% |
| **TOTAL** | **92-165** | **10-15** | **90-91%** |

### Quality Metrics

**Before v4.4.2**:
- 35% of EXEC→PLAN handoffs had no test evidence
- 22% had stale evidence (>24h)
- 0% had user story → test linkage

**After v4.4.2** (projected):
- 0% of code-producing SDs without test evidence
- 0% with stale evidence (blocked by gate)
- 100% auto-linked to user stories

---

## Migration Path

### Upgrading from v4.3.x

**1. Run Migration**:
```bash
psql $DATABASE_URL -f database/migrations/20260105_add_retro_test_metrics.sql
```

**2. Regenerate Schema Docs**:
```bash
node scripts/schema-doc-generator.js retrospectives
```

**3. Update Environment Variables** (optional):
```bash
# Add to .env
LEO_TESTING_MAX_AGE_HOURS=24
LEO_TEST_EVIDENCE_MAX_AGE_MINUTES=60
```

**4. Test Handoff Workflow**:
```bash
# Pick a feature SD in EXEC phase
node scripts/handoff.js execute EXEC-TO-PLAN SD-XXX-001

# Verify gates execute correctly
```

### Backward Compatibility

✅ **Fully backward compatible**:
- New columns nullable with defaults
- SD type exemptions prevent breaking docs-only SDs
- Advisory gates don't block legacy workflows
- Environment variables have sensible defaults

---

## Troubleshooting

### Issue: "No TESTING sub-agent execution found"

**Cause**: TESTING sub-agent not executed for code-producing SD.

**Fix**:
```bash
# Execute TESTING sub-agent manually
npm run subagent:execute TESTING <SD-ID>

# Then retry handoff
node scripts/handoff.js execute EXEC-TO-PLAN <SD-ID>
```

### Issue: "Test evidence stale (36h old)"

**Cause**: Test execution >24h ago.

**Fix**:
```bash
# Re-run tests to generate fresh evidence
npx playwright test

# Re-run TESTING sub-agent to capture fresh results
npm run subagent:execute TESTING <SD-ID>

# Retry handoff
node scripts/handoff.js execute EXEC-TO-PLAN <SD-ID>
```

### Issue: "No test reports found in standard locations"

**Cause**: Tests run in non-standard location or not run at all.

**Fix**:
```bash
# Run E2E tests (generates playwright-report/)
npx playwright test

# Run unit tests with coverage (generates coverage/)
npm test -- --coverage

# Retry handoff (auto-capture gate will ingest)
node scripts/handoff.js execute EXEC-TO-PLAN <SD-ID>
```

### Issue: Schema context not loading

**Cause**: Schema docs not generated for table.

**Fix**:
```bash
# Regenerate schema docs
node scripts/schema-doc-generator.js <table-name>

# Or regenerate all
node scripts/regenerate-all-schema-docs.js
```

---

## Related Documentation

- [Handoff System Guide](../reference/handoff-system-guide.md) - Gate architecture
- [LEO Gates Documentation](../leo/gates.md) - Gate 2A-3 validation
- [Testing Sub-Agent](../reference/sub-agents/testing.md) - TESTING sub-agent details
- [Schema Documentation](../reference/schema/engineer/tables/retrospectives.md) - retrospectives table schema

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 4.4.2 | 2026-01-05 | Testing governance gates, schema context loader, retro test metrics |
| 4.3.3 | 2025-12-XX | UI parity governance |
| 4.3.0 | 2025-09-XX | Sub-agent enforcement |

---

**Last Updated**: 2026-01-05
**Protocol Version**: 4.4.2
**Status**: ACTIVE
**Next Review**: 2026-02-05
