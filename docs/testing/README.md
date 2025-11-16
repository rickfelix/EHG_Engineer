# Testing Documentation Index
**Last Updated**: 2025-11-15
**Purpose**: Comprehensive testing scan and roadmap for non-Stage-4 features

---

## Quick Navigation

| Document | Purpose | Audience | Read Time |
|----------|---------|----------|-----------|
| **[Executive Summary](./TESTING-SCAN-EXECUTIVE-SUMMARY.md)** | High-level findings, risk assessment, decision support | LEAD, Stakeholders | 5 min |
| **[Quick Wins Guide](./QUICK-WINS-TEST-PRIORITY.md)** | Top 5 CRITICAL tests, Week 1 sprint plan | EXEC, QA Director | 10 min |
| **[Full Analysis](./NON-STAGE4-TEST-COVERAGE-ANALYSIS.md)** | Complete test gap inventory (17 opportunities) | PLAN, QA Director | 20 min |

---

## Executive Summary (Start Here)

**Key Finding**: EHG_Engineer has **~20% test coverage** for non-Stage-4 features, with **5 CRITICAL gaps**.

**Top 5 Critical Gaps**:
1. ⚠️ **LEO Gates BROKEN** (all exit code 1) → Blocks EXEC validation
2. ⚠️ **SD CRUD Zero Tests** → Data corruption risk
3. ⚠️ **PRD Management Zero Tests** → Creation failures
4. ⚠️ **Phase Handoffs Zero Tests** → Workflow halts
5. ⚠️ **DB Validation Zero Tests** → Silent corruption

**Recommendation**: Invest **26-35 hours (5 days)** to fix these gaps.

[Read Full Executive Summary →](./TESTING-SCAN-EXECUTIVE-SUMMARY.md)

---

## Quick Wins (Actionable Roadmap)

**Week 1 Sprint Plan** (26-35 hours):

- **Day 1-2**: LEO Gates fix + integration tests (6h)
- **Day 3**: SD CRUD E2E tests (6h)
- **Day 4**: PRD Management E2E tests (8h)
- **Day 5**: Database Validation integration tests (5h)

**Success Criteria**:
- ✅ LEO gates stop exiting with code 1
- ✅ SD/PRD operations have E2E test coverage
- ✅ Database validation has integration tests
- ✅ CI/CD pipeline runs tests on all PRs

[Read Quick Wins Guide →](./QUICK-WINS-TEST-PRIORITY.md)

---

## Full Analysis (Complete Inventory)

**Coverage Breakdown**:
- **CRITICAL**: 5 tests, 32-42 hours
- **HIGH**: 4 tests, 23-33 hours
- **MEDIUM**: 5 tests, 17-23 hours
- **LOW**: 3 tests, 6-9 hours
- **TOTAL**: 17 tests, 78-107 hours (~2-3 weeks)

**Test Categories**:
1. E2E Test Coverage (12 opportunities)
2. Component Test Coverage (4 opportunities, low priority)
3. GitHub Actions Testing (6 workflows)
4. Database Scripts Testing (5 critical scripts)
5. Quick Wins (4 high-ROI items)

[Read Full Analysis →](./NON-STAGE4-TEST-COVERAGE-ANALYSIS.md)

---

## Test Inventory (Current State)

### E2E Tests (Non-Stage-4)
```
tests/e2e/
├── context7-failure-scenarios.spec.ts ✅ (Circuit breaker)
├── knowledge-retrieval-flow.spec.ts ✅ (Automated research)
├── leo-protocol-journey.test.js ✅ (Partial - SD→PRD workflow)
├── directive-lab-*.test.js ✅ (4 files - UI testing)
├── semantic-search.spec.js ✅ (Search)
├── visual-inspection.spec.js ✅ (Visual regression)
└── a11y.spec.js ✅ (Accessibility smoke test)
```

**Total**: 12 E2E test files
**Coverage**: ~15% of non-Stage-4 features

### Integration Tests
```
tests/integration/
├── database-operations.test.js ✅
├── error-triggered-invocation.integration.test.js ✅
├── rca-system.integration.test.js ✅
└── rca-gate-enforcement.test.js ✅
```

**Total**: 4 integration test files

### Unit Tests
```
tests/unit/
├── 20+ unit test files ✅
└── (Good coverage for utilities, helpers, parsers)
```

---

## Missing Tests (Prioritized)

### CRITICAL (Must Have)
1. **LEO Gates Integration Tests** - `tests/integration/leo-gates.test.js`
2. **SD CRUD E2E Tests** - `tests/e2e/strategic-directives-crud.spec.ts`
3. **PRD Management E2E Tests** - `tests/e2e/prd-management.spec.ts`
4. **Phase Handoffs E2E Tests** - `tests/e2e/phase-handoffs.spec.ts`
5. **DB Validation Integration Tests** - `tests/integration/database-validation.test.js`

### HIGH (Should Have)
6. **Retrospective Generation Tests** - `tests/e2e/retrospective-generation.spec.ts`
7. **Sub-Agent Orchestration Tests** - `tests/integration/sub-agent-orchestration.test.js`
8. **Dashboard Metrics E2E Tests** - `tests/e2e/dashboard-metrics.spec.ts`
9. **CI/CD Workflow Tests** - `tests/integration/github-actions-workflows.test.js`

### MEDIUM (Nice to Have)
10. RLS Enforcement Tests
11. Schema Migration Tests
12. RCA System Tests (extend existing)
13. WSJF Priority Tests (extend existing)
14. DOCMON Health Tests

### LOW (Optional)
15. Accessibility Tests (extend existing)
16. Performance Budget Tests
17. GitHub Automation Tests

---

## Known Issues to Fix

### 1. LEO Gates (CRITICAL)
**Status**: ALL 5 GATES EXIT CODE 1
**Files**: `tools/gates/gate2a.ts` → `gate3.ts`
**Impact**: BLOCKS PLAN→EXEC VALIDATION
**Fix**: Debug TypeScript execution, fix exit codes

### 2. Gate Summary Script
**Status**: ESM/CommonJS conflicts
**File**: `.github/workflows/leo-gates.yml` (inline script)
**Impact**: Workflow summary fails
**Fix**: Convert to proper ESM module

### 3. Test Database
**Status**: No separate test instance
**Impact**: Tests pollute production data
**Fix**: Create Supabase branch or separate project for tests

### 4. Handoff RLS
**Status**: May block test data creation
**Impact**: Integration tests fail
**Fix**: Use service role key for tests

---

## Testing Infrastructure (READY)

✅ **Playwright**: Configured (`playwright.config.js`)
✅ **Jest**: Configured (`jest.config.cjs`)
✅ **Supabase Client**: Available for tests
✅ **GitHub Actions**: CI/CD ready
✅ **Test Directories**: `tests/e2e/`, `tests/integration/`, `tests/unit/`

**Recommended Additions**:
- Test database instance (Supabase branch)
- Test data fixtures (`tests/fixtures/`)
- E2E test helpers (Playwright page objects)
- Database cleanup utilities
- Handoff creation helpers

---

## How to Run Tests

### E2E Tests (Playwright)
```bash
# Run all non-Stage-4 E2E tests
npx playwright test tests/e2e/ --grep-invert "stage-04|venture"

# Run specific test file
npx playwright test tests/e2e/strategic-directives-crud.spec.ts

# Run with UI (headed mode)
npx playwright test --headed

# Generate HTML report
npx playwright show-report
```

### Integration Tests (Jest)
```bash
# Run all integration tests
npm run test:integration

# Run specific test file
npm test tests/integration/leo-gates.test.js

# Run with coverage
npm run test:integration -- --coverage
```

### Unit Tests (Jest)
```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm test tests/unit/circuit-breaker.test.js
```

### Database Validation
```bash
# Run comprehensive validation
npm run db:validate

# Generate fix scripts
npm run db:fix
```

---

## Invoke QA Engineering Director

For professional test creation with user story mapping:

```bash
# Comprehensive E2E test suite generation
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# Quick targeted testing
node lib/sub-agent-executor.js TESTING <SD-ID>

# Phase orchestration (includes TESTING agent)
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>
```

**QA Director Features**:
- Pre-flight build validation
- Professional test case generation from user stories
- 100% user story coverage requirement
- Evidence-based verification (screenshots)
- Mandatory E2E testing via Playwright

---

## Success Metrics

### 3-Week Goal

| Metric | Baseline | Target | Progress |
|--------|----------|--------|----------|
| **E2E Coverage** | 15% | 60% | 📊 TBD |
| **Critical Scripts Tested** | 0% | 80% | 📊 TBD |
| **LEO Gates Functional** | 0/5 | 5/5 | ⚠️ 0/5 |
| **GitHub Actions Tested** | 0% | 30% | 📊 TBD |
| **Integration Tests** | 5 | 20 | 📊 TBD |
| **Regression Bugs** | Unknown | 0 | 📊 TBD |

---

## Decision Required

**Question**: Invest 26-35 hours (5 days) to add tests for top 5 critical features?

**Recommended**: **YES** - Prevent SD/PRD corruption, unblock EXEC validation, enable confident deployments.

[See Risk Assessment →](./TESTING-SCAN-EXECUTIVE-SUMMARY.md#risk-assessment-if-not-fixed)

---

## Next Steps

1. ✅ **Review Executive Summary** (5 min read)
2. ✅ **Review Quick Wins Guide** (10 min read)
3. ⏳ **Approve Testing Investment** (LEAD decision)
4. ⏳ **Create SD for Testing Work** (if needed)
5. ⏳ **Execute Week 1 Sprint** (LEO gates + SD CRUD + DB validation)
6. ⏳ **Monitor Progress** (daily standup, test pass rate)

---

## Contact

**Primary**: QA Engineering Director (Enhanced v2.0)
**Escalation**: LEAD Agent
**Documentation**: `/docs/testing/`

---

**Last Updated**: 2025-11-15
**Next Review**: After Week 1 sprint completion
