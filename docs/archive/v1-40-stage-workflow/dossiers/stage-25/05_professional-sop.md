---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 25: Professional SOP (Standard Operating Procedures)


## Table of Contents

- [Purpose](#purpose)
- [Prerequisites (Entry Gates)](#prerequisites-entry-gates)
  - [Gate 1: Test Plans Approved](#gate-1-test-plans-approved)
  - [Gate 2: Environment Ready](#gate-2-environment-ready)
- [Substage 25.1: Test Execution](#substage-251-test-execution)
  - [Step 1: Unit Tests Execution](#step-1-unit-tests-execution)
  - [Step 2: Integration Tests Execution](#step-2-integration-tests-execution)
  - [Step 3: E2E Tests Execution](#step-3-e2e-tests-execution)
  - [Substage 25.1 Exit Validation](#substage-251-exit-validation)
- [Substage 25.2: Bug Management](#substage-252-bug-management)
  - [Step 1: Bug Logging](#step-1-bug-logging)
  - [Step 2: Bug Fixes Verification](#step-2-bug-fixes-verification)
  - [Step 3: Regression Testing](#step-3-regression-testing)
  - [Substage 25.2 Exit Validation](#substage-252-exit-validation)
- [Substage 25.3: Quality Certification](#substage-253-quality-certification)
  - [Step 1: Quality Criteria Validation](#step-1-quality-criteria-validation)
  - [Step 2: Documentation Completion](#step-2-documentation-completion)
- [Executive Summary](#executive-summary)
- [Test Results](#test-results)
  - [Unit Tests](#unit-tests)
  - [Integration Tests](#integration-tests)
  - [E2E Tests](#e2e-tests)
- [Bug Summary](#bug-summary)
- [Quality Certification](#quality-certification)
  - [Step 3: Sign-off](#step-3-sign-off)
  - [Substage 25.3 Exit Validation](#substage-253-exit-validation)
- [Stage 25 Exit Gates](#stage-25-exit-gates)
  - [Exit Gate Validation (All 3 Must Pass)](#exit-gate-validation-all-3-must-pass)
  - [If Exit Gates Fail](#if-exit-gates-fail)
- [Rollback Procedures](#rollback-procedures)
  - [Rollback Decision Tree](#rollback-decision-tree)
- [Error Handling](#error-handling)
  - [Common Error Scenarios](#common-error-scenarios)
- [Execution Time Tracking](#execution-time-tracking)

## Purpose

Step-by-step execution procedures for Stage 25 (Quality Assurance), enabling EXEC/QA agents to execute consistently across ventures.

**Owner**: EXEC (with QA specialist automation)
**Automation Level**: Manual → Assisted → Auto (suggested)
**Expected Duration**: 1-3 days (depends on venture size, test suite complexity, bug count)
**Automated Duration**: 4-8 hours (with full automation via SD-QA-AUTOMATION-001)

---

## Prerequisites (Entry Gates)

Before starting Stage 25, verify:

### Gate 1: Test Plans Approved

**Validation Query**:
```sql
SELECT venture_id,
       test_plan_document_id,
       unit_test_cases_defined,
       integration_test_cases_defined,
       e2e_test_cases_defined,
       qa_lead_approval_status
FROM stage_25_prerequisites
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All test cases defined = `true`, `qa_lead_approval_status` = 'approved'

**If False**: Return to Stage 24 to create/revise test plans

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1122 "- Test plans approved"

### Gate 2: Environment Ready

**Validation Query**:
```sql
SELECT venture_id,
       qa_environment_deployed,
       test_database_seeded,
       test_user_accounts_created,
       monitoring_enabled
FROM stage_25_prerequisites
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 4 columns = `true`

**If False**: DevOps resolves environment issues (deploy QA environment, seed test data, create test users)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1123 "- Environment ready"

---

## Substage 25.1: Test Execution

**Objective**: Execute unit, integration, and E2E tests across all components.

**Duration**: 2-4 hours (automated), 1-2 days (manual)

### Step 1: Unit Tests Execution

**Action**: Run all unit tests for components, utilities, services.

**Commands**:
```bash
# JavaScript/TypeScript (Jest)
cd src/
npm run test:unit -- --coverage --maxWorkers=4

# Python (pytest)
cd src/
pytest tests/unit/ --cov=app --cov-report=html --maxfail=5 -v

# Collect coverage report
cp coverage/lcov.info reports/stage-25/unit-test-coverage.lcov
```

**Expected Outputs**:
- Test results: PASS (all unit tests passed)
- Coverage report: ≥80% statement coverage
- Duration: <5 minutes for small ventures, <30 minutes for large ventures

**Validation**:
```sql
SELECT venture_id,
       unit_tests_passed,
       unit_tests_failed,
       unit_test_coverage_percentage,
       unit_test_duration_seconds
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001' AND test_type = 'unit';

-- Expected: unit_tests_failed = 0, unit_test_coverage_percentage ≥ 80
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1132 "- Unit tests passed"

**Troubleshooting**:
- **Error**: `Test timeout (>30s)` → Increase Jest timeout (`--testTimeout=60000`)
- **Error**: `Coverage below 80%` → Add missing test cases, recurse to Stage 22 (add tests during implementation)
- **Error**: `Module not found` → Verify `NODE_PATH` or `PYTHONPATH` environment variables

### Step 2: Integration Tests Execution

**Action**: Run integration tests for API endpoints, database queries, external service calls.

**Commands**:
```bash
# JavaScript/TypeScript (Vitest)
cd src/
npm run test:integration -- --coverage --threads=false

# Python (pytest with database fixtures)
cd src/
pytest tests/integration/ --cov=app --cov-report=html -v

# Collect coverage report
cp coverage/lcov.info reports/stage-25/integration-test-coverage.lcov
```

**Expected Outputs**:
- Test results: PASS (all integration tests passed)
- Coverage report: ≥70% API endpoint coverage
- Duration: 5-15 minutes for small ventures, 30-60 minutes for large ventures

**Validation**:
```sql
SELECT venture_id,
       integration_tests_passed,
       integration_tests_failed,
       integration_test_coverage_percentage,
       integration_test_duration_seconds
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001' AND test_type = 'integration';

-- Expected: integration_tests_failed = 0, integration_test_coverage_percentage ≥ 70
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1133 "- Integration tests complete"

**Troubleshooting**:
- **Error**: `Database connection timeout` → Increase connection timeout (30s → 120s), verify QA database accessible
- **Error**: `External API rate limit` → Mock external APIs (`nock` for Node.js, `responses` for Python)
- **Error**: `Test flakiness (intermittent failures)` → Add retry logic (`jest.retryTimes(3)`), investigate race conditions

### Step 3: E2E Tests Execution

**Action**: Run end-to-end tests simulating real user workflows via browser automation.

**Commands**:
```bash
# Playwright (JavaScript/TypeScript)
cd src/client/
npx playwright test --workers=2 --reporter=html

# Generate HTML report
npx playwright show-report

# Collect screenshots/videos of failures
cp -r test-results/ reports/stage-25/e2e-test-results/
```

**Expected Outputs**:
- Test results: PASS (all E2E tests passed)
- Coverage: ≥50% critical user flows covered
- Duration: 10-30 minutes for small ventures, 1-2 hours for large ventures
- Artifacts: Screenshots for failures, videos of test execution

**Validation**:
```sql
SELECT venture_id,
       e2e_tests_passed,
       e2e_tests_failed,
       critical_flows_covered_percentage,
       e2e_test_duration_seconds
FROM stage_25_test_results
WHERE venture_id = 'VENTURE-001' AND test_type = 'e2e';

-- Expected: e2e_tests_failed = 0, critical_flows_covered_percentage ≥ 50
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1134 "- E2E tests successful"

**Troubleshooting**:
- **Error**: `Browser launch failed` → Install browser binaries (`npx playwright install`)
- **Error**: `Element not found (selector timeout)` → Increase timeout (`page.waitForSelector('button', {timeout: 60000})`), verify element exists
- **Error**: `Test video recording failed` → Enable video only on failure (`video: 'retain-on-failure'`)
- **Error**: `Headless mode issues` → Run in headed mode (`--headed`) to debug, check for browser-specific issues

### Substage 25.1 Exit Validation

**Validation Query**:
```sql
SELECT venture_id,
       unit_tests_passed_flag,
       integration_tests_passed_flag,
       e2e_tests_passed_flag,
       total_tests_passed,
       total_tests_failed
FROM stage_25_substage_1_status
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 flags = `true`, `total_tests_failed` = 0

**If False**: Review error logs, fix failing tests, re-run Substage 25.1 (self-recursion)

---

## Substage 25.2: Bug Management

**Objective**: Log all discovered bugs, track fixes, verify resolutions, run regression tests.

**Duration**: 1-3 days (depends on bug count and severity)

### Step 1: Bug Logging

**Action**: Document all bugs discovered during test execution (from Substage 25.1 failures or manual exploratory testing).

**Bug Report Template**:
```markdown
**Title**: [Component] Brief description (≤80 chars)
**Severity**: P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low) | P4 (Trivial)
**Reproduction Steps**:
1. Step 1
2. Step 2
3. Expected result: X
4. Actual result: Y

**Environment**: QA (staging)
**Browser/Platform**: Chrome 120 / macOS 14.1
**Screenshots**: [Attach or link]
**Stack Trace**: [If applicable]
**Impact**: [Who is affected? How many users?]
```

**Commands**:
```bash
# Auto-generate bug report from test failure
node scripts/generate-bug-report.js --test-result reports/stage-25/e2e-test-results/failed-test-1.json --output bugs/stage-25/bug-001.md

# Create GitHub Issue (optional, venture-specific)
gh issue create --title "Bug: Login button not responding" --body "$(cat bugs/stage-25/bug-001.md)" --label "bug,P1,stage-25"
```

**Expected Outputs**:
- Bug reports: 1 per discovered issue (stored in `bugs/stage-25/` directory)
- Bug tracking: GitHub Issues, Linear, Jira (venture-specific)

**Validation**:
```sql
SELECT venture_id,
       COUNT(*) AS total_bugs,
       COUNT(*) FILTER (WHERE severity = 'P0') AS p0_bugs,
       COUNT(*) FILTER (WHERE severity = 'P1') AS p1_bugs,
       COUNT(*) FILTER (WHERE status = 'open') AS open_bugs
FROM stage_25_bugs
WHERE venture_id = 'VENTURE-001'
GROUP BY venture_id;

-- Expected: p0_bugs = 0 (no critical bugs), open_bugs > 0 (bugs logged)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1138 "- Bugs logged"

**Troubleshooting**:
- **Issue**: Too many bugs (>50) → Consider rollback to Stage 22 (major implementation issues)
- **Issue**: Unclear severity classification → Use standard rubric (P0=blocks release, P1=major functionality broken, P2=minor functionality broken, P3=cosmetic, P4=trivial)

### Step 2: Bug Fixes Verification

**Action**: Developers fix bugs, QA verifies fixes in QA environment.

**Commands**:
```bash
# Developer workflow (example)
git checkout -b fix/bug-001-login-button
# (make code changes)
git commit -m "fix: Resolve login button not responding (bug-001)"
git push origin fix/bug-001-login-button
# (create PR, merge after review)

# QA verification workflow
node scripts/verify-bug-fix.js --bug-id bug-001 --test-case tests/e2e/login-button.spec.ts

# If verified, update bug status
node scripts/update-bug-status.js --bug-id bug-001 --status fixed --verified-by qa-engineer-1
```

**Expected Outputs**:
- Bug status: `open` → `fixed` → `verified`
- Test results: Re-run specific tests for fixed bugs (all pass)

**Validation**:
```sql
SELECT venture_id,
       COUNT(*) AS total_bugs,
       COUNT(*) FILTER (WHERE status = 'fixed') AS fixed_bugs,
       COUNT(*) FILTER (WHERE status = 'verified') AS verified_bugs
FROM stage_25_bugs
WHERE venture_id = 'VENTURE-001'
GROUP BY venture_id;

-- Expected: verified_bugs = total_bugs (all bugs fixed and verified)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1139 "- Fixes verified"

**Troubleshooting**:
- **Issue**: Fix doesn't resolve bug → Re-open bug, request developer investigation
- **Issue**: Fix introduces new bug → Log new bug, mark as regression
- **Issue**: Cannot reproduce bug → Request more details from bug reporter, mark as `cannot-reproduce` if consistently unreproducible

### Step 3: Regression Testing

**Action**: Re-run all tests (unit, integration, E2E) to ensure bug fixes don't break existing functionality.

**Commands**:
```bash
# Run full test suite (same as Substage 25.1)
npm run test:all -- --coverage --maxWorkers=4

# Compare results with baseline (before bug fixes)
node scripts/compare-test-results.js --baseline reports/stage-25/baseline-test-results.json --current reports/stage-25/regression-test-results.json
```

**Expected Outputs**:
- Test results: All tests pass (no regressions introduced)
- Coverage: Maintained or improved (no decrease in coverage)
- New failures: 0 (bug fixes don't break existing functionality)

**Validation**:
```sql
SELECT venture_id,
       regression_tests_passed,
       regression_tests_failed,
       new_regressions_introduced
FROM stage_25_regression_results
WHERE venture_id = 'VENTURE-001';

-- Expected: regression_tests_failed = 0, new_regressions_introduced = 0
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1140 "- Regression tested"

**Troubleshooting**:
- **Issue**: Regression tests fail → Identify failing tests, revert bug fix if necessary, re-fix bug without breaking existing functionality
- **Issue**: Regression tests too slow (>2 hours) → Parallelize tests, optimize test setup/teardown, consider running only affected tests

### Substage 25.2 Exit Validation

**Validation Query**:
```sql
SELECT venture_id,
       bugs_logged_flag,
       fixes_verified_flag,
       regression_tested_flag,
       open_p0_bugs,
       open_p1_bugs
FROM stage_25_substage_2_status
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 flags = `true`, `open_p0_bugs` = 0, `open_p1_bugs` = 0

**If False**: Continue fixing bugs, re-run Substage 25.2 (self-recursion)

**Release Decision**:
- **P0 bugs open**: BLOCK release (critical bugs must be fixed)
- **P1 bugs open**: BLOCK release (major functionality broken)
- **P2 bugs open**: ALLOW release with documented known issues (defer to hotfix)
- **P3/P4 bugs open**: ALLOW release (minor/trivial issues)

---

## Substage 25.3: Quality Certification

**Objective**: Verify all quality criteria met, generate certification document, obtain sign-off.

**Duration**: 1-2 hours (documentation + approval)

### Step 1: Quality Criteria Validation

**Action**: Calculate quality score, verify all criteria met.

**Quality Score Formula** (proposed):
```
Quality Score = (Test Coverage × 0.4) + (Defect Density × 0.3) + (Performance × 0.2) + (UX × 0.1)

Test Coverage = (Unit Coverage × 0.5) + (Integration Coverage × 0.3) + (E2E Coverage × 0.2)
Defect Density = MAX(0, 100 - (Total Bugs / Total LOC × 1000) × 10)
Performance = (API Response Time Score + Page Load Time Score) / 2
UX = Manual UX review score (0-100)
```

**Commands**:
```bash
# Calculate quality score
node scripts/calculate-quality-score.js --venture-id VENTURE-001 --output reports/stage-25/quality-score.json

# Validate against threshold
node scripts/validate-quality-score.js --venture-id VENTURE-001 --threshold 85
```

**Expected Outputs**:
- Quality score: ≥85/100 (release-ready)
- Breakdown: Test coverage ≥80%, Defect density <5 bugs per 1000 LOC, Performance ≥85, UX ≥80

**Validation**:
```sql
SELECT venture_id,
       quality_score,
       test_coverage_score,
       defect_density_score,
       performance_score,
       ux_score
FROM stage_25_quality_metrics
WHERE venture_id = 'VENTURE-001';

-- Expected: quality_score ≥ 85
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1144 "- Criteria met"

**Troubleshooting**:
- **Issue**: Quality score <85 → Identify lowest component (test coverage? defect density? performance? UX?), address gaps, re-calculate
- **Issue**: Test coverage low → Add missing tests (recurse to Stage 22 or Substage 25.1)
- **Issue**: Defect density high → Continue fixing bugs (recurse to Substage 25.2)
- **Issue**: Performance low → Optimize slow APIs/pages (recurse to Stage 22 or Stage 24)
- **Issue**: UX score low → Conduct UX review, address issues (recurse to Stage 23)

### Step 2: Documentation Completion

**Action**: Generate quality certification document with all test results, bug summaries, quality metrics.

**Certification Document Template**:
```markdown
# Quality Certification: [Venture Name]

**Venture ID**: VENTURE-001
**Stage**: 25 (Quality Assurance)
**Date**: 2025-11-06
**QA Lead**: [Name]

## Executive Summary
- **Quality Score**: 88/100 (✅ PASS, threshold ≥85)
- **Test Coverage**: 85% (unit 88%, integration 82%, E2E 60%)
- **Defect Density**: 3.2 bugs per 1000 LOC (✅ PASS, threshold <5)
- **Bugs Fixed**: 15 total (8 P1, 7 P2), 0 open P0/P1 bugs

## Test Results
### Unit Tests
- **Total**: 250 tests
- **Passed**: 250 (100%)
- **Failed**: 0
- **Coverage**: 88%
- **Duration**: 3m 15s

### Integration Tests
- **Total**: 80 tests
- **Passed**: 80 (100%)
- **Failed**: 0
- **Coverage**: 82%
- **Duration**: 12m 30s

### E2E Tests
- **Total**: 25 tests
- **Passed**: 25 (100%)
- **Failed**: 0
- **Coverage**: 60% of critical flows
- **Duration**: 18m 45s

## Bug Summary
- **Total Bugs Logged**: 15
- **P0 (Critical)**: 0
- **P1 (High)**: 8 (all fixed and verified)
- **P2 (Medium)**: 7 (all fixed and verified)
- **P3/P4**: 0

## Quality Certification
✅ All entry gates passed
✅ All substages completed (Test Execution, Bug Management, Quality Certification)
✅ All exit gates passed (Tests passed, Quality certified, Release approved)

**Recommendation**: APPROVE for Stage 26 (Security & Compliance)

---
**Signed**: [QA Lead Name], [Date]
**Approved**: [Stakeholder Name], [Date]
```

**Commands**:
```bash
# Generate certification document
node scripts/generate-quality-certification.js --venture-id VENTURE-001 --output reports/stage-25/quality-certification.md

# Convert to PDF (for regulatory compliance)
pandoc reports/stage-25/quality-certification.md -o reports/stage-25/quality-certification.pdf
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1145 "- Documentation complete"

### Step 3: Sign-off

**Action**: Obtain QA lead and stakeholder approval for release.

**Commands**:
```bash
# Request sign-off (sends email/notification)
node scripts/request-quality-signoff.js --venture-id VENTURE-001 --document reports/stage-25/quality-certification.pdf --approvers qa-lead,chairman

# Check approval status
node scripts/check-signoff-status.js --venture-id VENTURE-001 --stage-id 25
```

**Expected Outputs**:
- Sign-off status: `approved` (both QA lead and stakeholder approved)
- Approval timestamp: Recorded in database

**Validation**:
```sql
SELECT venture_id,
       qa_lead_approval_status,
       qa_lead_approved_at,
       stakeholder_approval_status,
       stakeholder_approved_at
FROM stage_25_signoff
WHERE venture_id = 'VENTURE-001';

-- Expected: Both statuses = 'approved'
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1146 "- Sign-off received"

**Troubleshooting**:
- **Issue**: Approver unavailable → Escalate to backup approver (defined in venture configuration)
- **Issue**: Approval rejected → Review rejection reason, address concerns, re-submit

### Substage 25.3 Exit Validation

**Validation Query**:
```sql
SELECT venture_id,
       criteria_met_flag,
       documentation_complete_flag,
       signoff_received_flag,
       quality_score
FROM stage_25_substage_3_status
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 flags = `true`, `quality_score` ≥ 85

---

## Stage 25 Exit Gates

### Exit Gate Validation (All 3 Must Pass)

**Validation Query**:
```sql
SELECT venture_id,
       tests_passed,
       quality_certified,
       release_approved
FROM stage_25_exit_gates
WHERE venture_id = 'VENTURE-001';
```

**Expected Result**: All 3 columns = `true`

**Evidence**:
- Tests passed: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1125
- Quality certified: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1126
- Release approved: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:1127

### If Exit Gates Fail

**Failure Scenario 1**: Tests passed = `false` (test failures remain)
- **Action**: Re-run Substage 25.1 (Test Execution), fix failing tests
- **Recursion**: Self-recursion to Substage 25.1

**Failure Scenario 2**: Quality certified = `false` (quality score <85)
- **Action**: Identify quality gaps (test coverage? defect density? performance? UX?), address gaps
- **Recursion**: May require recursion to earlier stages (Stage 22 for test coverage, Stage 23 for UX, Stage 24 for performance)

**Failure Scenario 3**: Release approved = `false` (stakeholder rejects release)
- **Action**: Review rejection reason (business decision, not technical), defer release or address concerns
- **Recursion**: May require recursion to Stage 24 (MVP iteration to address stakeholder concerns)

---

## Rollback Procedures

### Rollback Decision Tree

**When to Rollback**:
1. **P0 bug discovered after Stage 25 completion** → Immediate rollback to last known good release
2. **Quality score drops below 80** → Rollback deployment, re-run Stage 25
3. **Critical test failures in production monitoring** → Rollback, investigate root cause

**Rollback Steps**:
```bash
# 1. Identify last known good release
git log --oneline --all | grep "Stage 25 complete"

# 2. Revert deployment (venture-specific)
# For Kubernetes:
kubectl rollout undo deployment/venture-001 -n production

# For Docker:
docker service rollback venture-001

# For traditional server:
git revert <commit-sha>
git push origin main
ssh user@server "cd /app && git pull && pm2 restart venture-001"

# 3. Restore database (if schema changed)
psql -U postgres -d venture_001 -f backups/pre-stage-25-deployment.sql

# 4. Verify rollback successful
curl https://venture-001.example.com/health
# Expected: Status 200, version = last known good

# 5. Notify stakeholders
node scripts/send-rollback-notification.js --venture-id VENTURE-001 --reason "P0 bug discovered"
```

**Rollback Validation**:
```sql
SELECT venture_id,
       current_deployment_version,
       rollback_completed_at,
       rollback_reason
FROM stage_25_rollback_log
WHERE venture_id = 'VENTURE-001'
ORDER BY rollback_completed_at DESC
LIMIT 1;
```

**Post-Rollback Actions**:
1. Investigate root cause of issue requiring rollback
2. Create bug report (P0 severity)
3. Fix bug
4. Re-run Stage 25 (full QA cycle)

---

## Error Handling

### Common Error Scenarios

#### Error 1: Test Environment Unavailable

**Symptoms**: Cannot connect to QA environment, database timeouts, 502 errors

**Recovery**:
1. Check environment status: `kubectl get pods -n qa` (for Kubernetes)
2. Restart environment: `kubectl rollout restart deployment/qa-environment`
3. Verify health: `curl https://qa.example.com/health`
4. If health check fails, escalate to DevOps

**Prevention**: Pre-flight health checks before starting Stage 25

#### Error 2: Test Execution Timeout

**Symptoms**: Tests hang for >30 minutes, no progress

**Recovery**:
1. Kill test process: `pkill -f "npm run test"`
2. Investigate slow test: Review test logs for hanging test name
3. Increase timeout or optimize test: `jest.setTimeout(120000)` or refactor test to be faster
4. Re-run tests: `npm run test -- --testNamePattern="<test-name>"`

**Prevention**: Set reasonable timeouts (unit: 30s, integration: 2m, E2E: 5m)

#### Error 3: Test Data Corruption

**Symptoms**: Tests fail with data validation errors, unexpected database state

**Recovery**:
1. Restore test database from snapshot: `psql -U postgres -d qa_db -f backups/qa-db-clean.sql`
2. Re-seed test data: `node scripts/seed-test-data.js --venture-id VENTURE-001`
3. Verify data integrity: `node scripts/validate-test-data.js --venture-id VENTURE-001`
4. Re-run tests: `npm run test`

**Prevention**: Use database transactions in tests (rollback after each test)

---

## Execution Time Tracking

**Expected Durations** (varies by venture size):
- Substage 25.1: 2-4 hours (automated), 1-2 days (manual)
- Substage 25.2: 1-3 days (depends on bug count)
- Substage 25.3: 1-2 hours (documentation)
- **Total**: 1-3 days (manual), 4-8 hours (automated)

**Actual Duration Query**:
```sql
SELECT venture_id,
       substage_id,
       started_at,
       completed_at,
       EXTRACT(EPOCH FROM (completed_at - started_at))/3600 AS duration_hours
FROM stage_25_execution_log
WHERE venture_id = 'VENTURE-001'
ORDER BY substage_id;
```

---

**SOP Status**: Draft (requires validation with real ventures)
**Last Updated**: 2025-11-06
**Automation Level**: Manual → Assisted (automated test execution, manual bug triage, manual sign-off)

**Next**: See `06_agent-orchestration.md` for proposed QualityAssuranceCrew architecture.

<!-- Generated by Claude Code Phase 10 | EHG_Engineer@6ef8cf4 | 2025-11-06 -->
