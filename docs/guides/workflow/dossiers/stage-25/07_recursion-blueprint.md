# Stage 25: Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, testing, e2e

## Overview

**Purpose**: Define recursive triggers for Stage 25 (Venture Review) when quality gates fail or regressions detected.

**Recursion Support**: Currently 2/5 (low, per critique) → Target: 4/5 (high) after implementing QA-001 through QA-004 triggers

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-25.md:15 "Recursion Readiness \| 2"

---

## Recursion Trigger Catalog

### QA-001: Test Coverage Below Threshold

**Trigger Condition**: Unit/integration/E2E test coverage < threshold (unit <80%, integration <70%, E2E <50%)

**Detection**:
```sql
SELECT venture_id,
       test_type,
       coverage_percentage,
       threshold,
       (coverage_percentage < threshold) AS coverage_below_threshold
FROM stage_25_test_results
CROSS JOIN (VALUES ('unit', 80), ('integration', 70), ('e2e', 50)) AS thresholds(test_type, threshold)
WHERE venture_id = 'VENTURE-001'
  AND stage_25_test_results.test_type = thresholds.test_type
  AND coverage_percentage < threshold;
```

**Recursion Path**:
- **Option A**: Self-recursion to Stage 25, Substage 25.1 (add more tests)
- **Option B**: Backward recursion to Stage 22 (Iterative Development) to add tests during implementation
- **Preferred**: Option B (tests should be written with code, not retroactively)

**Recovery Actions**:
1. Identify uncovered code paths (use coverage report)
2. Create test cases for uncovered code
3. Re-run Substage 25.1 (Test Execution)
4. Validate coverage now meets threshold

**Success Criteria**: Coverage ≥ threshold for all test types (unit ≥80%, integration ≥70%, E2E ≥50%)

**Estimated Recovery Time**: 1-2 days (depends on # of missing test cases)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1117 "- Test coverage"

---

### QA-002: Critical Bug Detected (P0/P1)

**Trigger Condition**: Bug with severity P0 or P1 discovered during testing

**Detection**:
```sql
SELECT venture_id,
       bug_id,
       title,
       severity,
       status
FROM stage_25_bugs
WHERE venture_id = 'VENTURE-001'
  AND severity IN ('P0', 'P1')
  AND status IN ('open', 'in-progress');
```

**Recursion Path**:
- **P0 (Critical)**: Backward recursion to Stage 22 (Iterative Development) - architectural flaw
- **P1 (High)**: Self-recursion to Stage 25, Substage 25.2 (bug fix + verify)
- **If P0 count >5**: Escalate to PLAN phase (Stage 12 PRD review, Stage 14 Technical Design) - systemic design issue

**Recovery Actions**:

**For P0 bugs** (blocks release):
1. Stop all testing (do not proceed to Substage 25.3)
2. Escalate to PLAN agent (architectural review)
3. Implement fix in Stage 22 (code changes)
4. Re-run Stage 25 from start (full QA cycle)

**For P1 bugs** (major functionality broken):
1. Continue testing (find all P1 bugs before fixing)
2. Implement fixes in Stage 22 or Substage 25.2
3. Verify fixes (Substage 25.2)
4. Run regression tests (Substage 25.2)
5. Re-calculate quality score (Substage 25.3)

**Success Criteria**: 0 open P0/P1 bugs (all resolved and verified)

**Estimated Recovery Time**:
- P0: 1-2 weeks (architectural fix)
- P1: 2-5 days (implementation fix)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1138 "- Bugs logged"

---

### QA-003: Regression Test Failures

**Trigger Condition**: Tests that previously passed now fail after bug fixes (regression introduced)

**Detection**:
```sql
SELECT venture_id,
       test_name,
       baseline_status,
       current_status,
       (baseline_status = 'passed' AND current_status = 'failed') AS is_regression
FROM stage_25_regression_results
WHERE venture_id = 'VENTURE-001'
  AND baseline_status = 'passed'
  AND current_status = 'failed';
```

**Recursion Path**:
- Self-recursion to Stage 25, Substage 25.2 (revert fix, re-implement correctly)
- If regressions persist (>3 occurrences): Backward recursion to Stage 24 (MVP iteration) - test strategy needs revision

**Recovery Actions**:
1. Identify regressing tests (which tests failed that previously passed)
2. Determine root cause (which bug fix introduced regression)
3. **Option A**: Revert bug fix (rollback commit), re-implement fix differently
4. **Option B**: Fix regression (keep original fix, add new fix for regression)
5. Run regression tests again (verify no new regressions)
6. Continue to Substage 25.3 (quality certification)

**Success Criteria**: 0 regressions (all tests pass, no previously passing tests now fail)

**Estimated Recovery Time**: 1-2 days (depends on regression complexity)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1140 "- Regression tested"

---

### QA-004: Quality Score Below Threshold

**Trigger Condition**: Composite quality score <85/100 (fails release approval)

**Detection**:
```sql
SELECT venture_id,
       quality_score,
       test_coverage_score,
       defect_density_score,
       performance_score,
       ux_score,
       (quality_score < 85) AS quality_below_threshold
FROM stage_25_quality_metrics
WHERE venture_id = 'VENTURE-001'
  AND quality_score < 85;
```

**Recursion Path** (depends on which component failed):

**If test_coverage_score low** (<80):
- Trigger QA-001 (Test Coverage Below Threshold) → Recurse to Stage 22 (add tests)

**If defect_density_score low** (>5 bugs per 1000 LOC):
- Trigger QA-002 (Critical Bug Detected) → Recurse to Substage 25.2 (fix bugs)

**If performance_score low** (<85):
- Backward recursion to Stage 24 (MVP Engine) or Stage 22 (Iterative Development) → Optimize performance
- Not Stage 25 responsibility (QA identifies performance issues, EXEC fixes them)

**If ux_score low** (<80):
- Backward recursion to Stage 23 (Feedback Loop: Real-Time UX) → Address UX issues
- Not Stage 25 responsibility (QA identifies UX issues, DESIGN fixes them)

**Recovery Actions**:
1. Identify which component failed (test coverage? defect density? performance? UX?)
2. Route to appropriate recursion trigger (QA-001 for coverage, QA-002 for bugs, Stage 24 for performance, Stage 23 for UX)
3. Address root cause in responsible stage
4. Re-run Stage 25 (full QA cycle)
5. Re-calculate quality score (should now be ≥85/100)

**Success Criteria**: Quality score ≥85/100 (all components above threshold)

**Estimated Recovery Time**: 1-2 weeks (depends on which component failed, severity of issues)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1119 "- Quality score"

---

## Recursion Decision Matrix

| Failure Scenario | Trigger | Recursion Path | Recovery Time | Success Criteria |
|------------------|---------|----------------|---------------|------------------|
| Unit coverage <80% | QA-001 | Stage 22 (add unit tests) | 1-2 days | Coverage ≥80% |
| Integration coverage <70% | QA-001 | Stage 22 (add integration tests) | 1-2 days | Coverage ≥70% |
| E2E coverage <50% | QA-001 | Stage 22 (add E2E tests) | 1-2 days | Coverage ≥50% |
| P0 bug detected | QA-002 | Stage 22 (architectural fix) | 1-2 weeks | 0 open P0 bugs |
| P1 bug detected | QA-002 | Substage 25.2 (bug fix) | 2-5 days | 0 open P1 bugs |
| >5 P0 bugs | QA-002 | Stage 12 (PRD review) | 2-4 weeks | Systemic design fix |
| Regression detected | QA-003 | Substage 25.2 (fix regression) | 1-2 days | 0 regressions |
| >3 regressions | QA-003 | Stage 24 (test strategy revision) | 1 week | Improved test strategy |
| Quality score <85 (coverage) | QA-004 | QA-001 → Stage 22 | 1-2 days | Coverage improved |
| Quality score <85 (bugs) | QA-004 | QA-002 → Substage 25.2 | 2-5 days | Bugs fixed |
| Quality score <85 (performance) | QA-004 | Stage 24 (optimize) | 1 week | Performance improved |
| Quality score <85 (UX) | QA-004 | Stage 23 (UX fixes) | 1 week | UX improved |

---

## Self-Recursion (Within Stage 25)

### Substage 25.1 → Substage 25.1 (Re-run Tests)

**Trigger**: Test execution failed (timeout, environment crash, flaky tests)

**Action**: Re-run tests with increased timeout or fixed environment

**Max Iterations**: 3 (if tests fail 3 times, escalate to QA-002)

### Substage 25.2 → Substage 25.2 (Fix More Bugs)

**Trigger**: Regression tests reveal new bugs (regressions)

**Action**: Fix new bugs, verify fixes, run regression tests again

**Max Iterations**: 5 (if >5 iterations, escalate to QA-003)

### Substage 25.3 → Substage 25.1 (Re-test After Quality Fail)

**Trigger**: Quality score <85/100 due to test coverage or defect density

**Action**: Route to QA-001 (coverage) or QA-002 (bugs), then re-run Substage 25.1

**Max Iterations**: 2 (if quality score still <85 after 2 iterations, escalate to PLAN phase)

---

## Backward Recursion (Stage 25 → Earlier Stages)

### Stage 25 → Stage 24 (MVP Engine)

**Trigger**: Performance issues detected during E2E tests (page load time >3s, API response time >500ms)

**Action**: Optimize slow pages/APIs in Stage 24

**Example Query**:
```sql
SELECT venture_id,
       page_name,
       avg_load_time_ms,
       threshold_ms,
       (avg_load_time_ms > threshold_ms) AS performance_issue
FROM stage_25_performance_metrics
WHERE venture_id = 'VENTURE-001'
  AND avg_load_time_ms > 3000; -- page load time >3s
```

### Stage 25 → Stage 23 (Feedback Loop: Real-Time UX)

**Trigger**: UX issues detected during E2E tests (confusing UI, poor accessibility, broken layout)

**Action**: Address UX issues in Stage 23

**Example**: E2E test finds "Login button is hidden below fold on mobile" → UX team fixes responsive layout in Stage 23

### Stage 25 → Stage 22 (Iterative Development)

**Trigger**: Missing tests (coverage <80%) or critical bugs (P0/P1)

**Action**: Add tests or fix bugs in Stage 22 (implementation phase)

**Example**: Unit coverage 65% for `PaymentService` → Developer adds 15 more unit tests in Stage 22

### Stage 25 → Stage 12 (PRD) or Stage 14 (Technical Design)

**Trigger**: Systemic issues (>5 P0 bugs, architectural flaw, wrong technology choice)

**Action**: Re-evaluate design decisions in PLAN phase

**Example**: 8 P0 bugs related to real-time synchronization → PLAN agent reviews PRD, discovers architectural flaw (polling vs. WebSockets)

---

## Forward Recursion (Stage 25 → Later Stages)

**None Expected**: Stage 25 is a gating stage. If quality criteria not met, venture cannot proceed to Stage 26 (Security & Compliance).

**Exception**: If stakeholder approves release despite quality score <85 (business decision), venture proceeds to Stage 26 with documented known issues. This is NOT recursion, but an override.

---

## Recursion Metrics

### Track Recursion Frequency

```sql
CREATE TABLE stage_25_recursion_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venture_id UUID NOT NULL REFERENCES ventures(id),
    trigger_id TEXT NOT NULL, -- e.g., "QA-001", "QA-002"
    trigger_reason TEXT NOT NULL,
    recursion_path TEXT NOT NULL, -- e.g., "Stage 25 → Stage 22"
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_status TEXT CHECK (resolution_status IN ('in-progress', 'resolved', 'escalated'))
);
```

### Query Recursion Patterns

```sql
-- Most common recursion triggers
SELECT trigger_id,
       COUNT(*) AS trigger_count,
       AVG(EXTRACT(EPOCH FROM (resolved_at - triggered_at))/86400) AS avg_resolution_days
FROM stage_25_recursion_log
WHERE resolution_status = 'resolved'
GROUP BY trigger_id
ORDER BY trigger_count DESC;

-- Expected output:
-- QA-001 (test coverage): 15 occurrences, avg 1.5 days
-- QA-002 (bugs): 30 occurrences, avg 3.2 days
-- QA-003 (regressions): 10 occurrences, avg 1.8 days
-- QA-004 (quality score): 5 occurrences, avg 7.5 days
```

---

## Recursion Prevention Strategies

### Strategy 1: Shift-Left Testing

**Goal**: Add tests during Stage 22 (Iterative Development), not retroactively in Stage 25

**Implementation**:
- EXEC pre-commit hook: Block commits if test coverage decreases
- PR requirement: ≥1 test per new function/component
- CI/CD gate: Fail build if coverage <80%

**Expected Impact**: Reduce QA-001 recursion (test coverage below threshold) by 80%

### Strategy 2: Early Bug Detection

**Goal**: Catch bugs in Stage 22 (development) via continuous testing, not in Stage 25 (QA)

**Implementation**:
- CI/CD: Run unit/integration tests on every commit
- Automated E2E tests: Run nightly in development environment
- Developer testing: Require manual testing before PR

**Expected Impact**: Reduce QA-002 recursion (critical bugs) by 60%

### Strategy 3: Regression Test Suite

**Goal**: Detect regressions early via automated regression tests, not in Stage 25

**Implementation**:
- CI/CD: Run full regression suite on every PR merge
- Git pre-push hook: Run smoke tests before push
- Baseline tracking: Store test results baseline, compare on each run

**Expected Impact**: Reduce QA-003 recursion (regressions) by 70%

### Strategy 4: Quality Metrics Monitoring

**Goal**: Track quality metrics continuously (Stages 22-24), catch issues before Stage 25

**Implementation**:
- Dashboard: Real-time quality score (test coverage, defect density, performance, UX)
- Alerts: Notify team when quality score drops below 85
- Weekly review: QA lead reviews quality trends, addresses declining metrics

**Expected Impact**: Reduce QA-004 recursion (quality score below threshold) by 50%

---

## Recursion Readiness Scoring

**Current Score**: 2/5 (per critique)

**After Implementing QA-001 through QA-004**: 4/5 (estimated)

**Scoring Rubric**:
- **1/5**: No recursion support (manual intervention required)
- **2/5**: Generic recursion (return to "previous stage" with no specific triggers)
- **3/5**: Defined triggers (QA-001 through QA-004) but no automation
- **4/5**: Automated trigger detection + routing (database queries, agent tools)
- **5/5**: Predictive recursion (AI predicts recursion before trigger fires, proactive fixes)

**Target**: 4/5 (automated trigger detection + routing via QualityAssuranceCrew agents)

**Future Enhancement** (5/5): AI-driven predictive recursion
- Example: If test coverage trending downward (85% → 82% → 79%), predict QA-001 trigger will fire, proactively add tests in Stage 22

---

## Sources Table

| Claim | Repo | Commit | Path | Lines | Excerpt |
|-------|------|--------|------|-------|---------|
| Recursion readiness: 2/5 | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-25.md | 15 | "Recursion Readiness \| 2" |
| Test coverage metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1117 | "- Test coverage" |
| Defect density metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1118 | "- Defect density" |
| Quality score metric | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1119 | "- Quality score" |
| Bugs logged | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1138 | "- Bugs logged" |
| Regression tested | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 1140 | "- Regression tested" |

---

**Next**: See `08_configurability-matrix.md` for tunable QA parameters.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
