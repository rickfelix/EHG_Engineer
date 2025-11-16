# Non-Stage-4 Test Coverage Analysis
**Generated**: 2025-11-15
**Scope**: EHG_Engineer features EXCLUDING Stage 4 Venture Workflow
**Purpose**: Identify critical testing gaps and prioritize test creation

---

## Executive Summary

**Current State**:
- **Total Test Files**: 62 test files (E2E, integration, unit, UAT)
- **E2E Tests (Non-Stage-4)**: 12 test files covering ~15% of features
- **Critical Scripts**: 1,223 scripts in `/scripts/` directory
- **GitHub Actions Workflows**: 54 workflows (30+ need test coverage)
- **Test Coverage**: ~20% for non-Stage-4 features

**Key Finding**: **Critical production features lack E2E test coverage**, creating regression risk during LEO Protocol operations.

---

## 1. E2E Test Coverage - Non-Stage-4 Features

### ✅ Currently Covered Features

| Test File | Feature | User Stories | Status |
|-----------|---------|--------------|--------|
| `context7-failure-scenarios.spec.ts` | Circuit breaker resilience | US-004, SCENARIO-006, SCENARIO-007 | ✅ COMPLETE |
| `knowledge-retrieval-flow.spec.ts` | Automated research | US-001, US-002, US-003, US-005 | ✅ COMPLETE |
| `leo-protocol-journey.test.js` | LEO workflow (SD→PRD→EXEC) | Multiple | ✅ PARTIAL |
| `directive-lab-*.test.js` (4 files) | SD management UI | N/A | ✅ PARTIAL |
| `semantic-search.spec.js` | Search functionality | N/A | ✅ COMPLETE |
| `visual-inspection.spec.js` | Visual regression | N/A | ✅ COMPLETE |
| `a11y.spec.js` | Accessibility | N/A | ✅ SMOKE |

**Coverage**: ~15% of non-Stage-4 features

---

### ❌ CRITICAL: Missing E2E Tests (Zero Coverage)

#### **Priority 1: CRITICAL (Production Blockers)**

1. **Strategic Directive CRUD Operations** (CRITICAL)
   - **Feature**: SD creation, editing, status transitions
   - **Risk**: Core LEO Protocol functionality untested
   - **Scripts**: 200+ SD management scripts (no E2E validation)
   - **Effort**: 4-6 hours (HIGH)
   - **Impact**: VERY HIGH - prevents SD corruption/data loss
   - **Test Type**: E2E (Playwright)
   - **File**: `tests/e2e/strategic-directives-crud.spec.ts`

2. **PRD Management Workflow** (CRITICAL)
   - **Feature**: PRD creation, validation gates, approval flows
   - **Risk**: Broken PRD creation = blocked EXEC phase
   - **Scripts**: `add-prd-to-database.js` (563 LOC, no tests)
   - **Effort**: 6-8 hours (HIGH)
   - **Impact**: VERY HIGH - gates all implementation work
   - **Test Type**: E2E (Playwright)
   - **File**: `tests/e2e/prd-management.spec.ts`

3. **Phase Handoff System** (CRITICAL)
   - **Feature**: LEAD→PLAN→EXEC handoff creation/acceptance
   - **Risk**: Broken handoffs halt all SD progress
   - **Scripts**: `unified-handoff-system.js` (2,097 LOC, no tests)
   - **Effort**: 8-10 hours (VERY HIGH)
   - **Impact**: VERY HIGH - core LEO Protocol operation
   - **Test Type**: E2E + Integration
   - **File**: `tests/e2e/phase-handoffs.spec.ts`

4. **Database Validation Tools** (CRITICAL)
   - **Feature**: Schema validation, data integrity checks
   - **Risk**: Silent data corruption, invalid state
   - **Scripts**: `comprehensive-database-validation.js` (815 LOC, no tests)
   - **Effort**: 4-5 hours (MEDIUM-HIGH)
   - **Impact**: HIGH - prevents data quality issues
   - **Test Type**: Integration
   - **File**: `tests/integration/database-validation.test.js`

5. **LEO Gate Validation (Gates 2A-2D, 3)** (CRITICAL)
   - **Feature**: Pre-EXEC validation gates
   - **Risk**: Gates fail silently (known issue: all exit code 1)
   - **Scripts**: `tools/gates/gate2*.ts`, `tools/gates/gate3.ts`
   - **Workflow**: `.github/workflows/leo-gates.yml`
   - **Effort**: 6-8 hours (HIGH)
   - **Impact**: VERY HIGH - quality gatekeeping broken
   - **Test Type**: Integration + E2E
   - **File**: `tests/integration/leo-gates.test.js`

---

#### **Priority 2: HIGH (Complex Workflows)**

6. **Retrospective Generation** (HIGH)
   - **Feature**: Automated retrospective creation from SD data
   - **Risk**: Missing insights, broken continuous improvement
   - **Scripts**: 15+ retrospective scripts
   - **Workflow**: `.github/workflows/retrospective-quality-gates.yml`
   - **Effort**: 4-6 hours (HIGH)
   - **Impact**: HIGH - learning system depends on this
   - **Test Type**: E2E + Integration
   - **File**: `tests/e2e/retrospective-generation.spec.ts`

7. **Sub-Agent Execution System** (HIGH)
   - **Feature**: Parallel sub-agent orchestration (ARCHITECT, QA, REVIEWER)
   - **Risk**: Sub-agents fail silently, no verification
   - **Scripts**: `lib/sub-agent-executor.js`, `scripts/orchestrate-phase-subagents.js`
   - **Effort**: 6-8 hours (HIGH)
   - **Impact**: HIGH - quality verification depends on this
   - **Test Type**: Integration
   - **File**: `tests/integration/sub-agent-orchestration.test.js`
   - **Existing**: `tests/sub-agents/qa-engineering-director-v2.test.js` (unit only)

8. **Dashboard Metrics & Health Monitoring** (HIGH)
   - **Feature**: Real-time SD/PRD status, health scores
   - **Risk**: Wrong data displayed = bad decisions
   - **Scripts**: `scripts/database-health-dashboard.js`
   - **Effort**: 3-4 hours (MEDIUM)
   - **Impact**: MEDIUM-HIGH - visibility critical
   - **Test Type**: E2E
   - **File**: `tests/e2e/dashboard-metrics.spec.ts`

9. **CI/CD Pipeline Testing** (HIGH)
   - **Feature**: GitHub Actions workflow automation
   - **Risk**: Workflows break silently, no validation
   - **Workflows**: 54 workflows (30+ need tests)
   - **Effort**: 10-15 hours (VERY HIGH)
   - **Impact**: HIGH - automation reliability
   - **Test Type**: Integration (workflow simulation)
   - **File**: `tests/integration/github-actions-workflows.test.js`

---

#### **Priority 3: MEDIUM (Quality Improvements)**

10. **RLS (Row-Level Security) Enforcement** (MEDIUM)
    - **Feature**: Supabase RLS policy verification
    - **Risk**: Security holes, unauthorized data access
    - **Workflow**: `.github/workflows/rls-verification.yml`
    - **Effort**: 4-5 hours (MEDIUM-HIGH)
    - **Impact**: MEDIUM - security critical but lower frequency
    - **Test Type**: Integration
    - **File**: `tests/integration/rls-enforcement.test.js`

11. **Schema Migration Validation** (MEDIUM)
    - **Feature**: Database migration safety checks
    - **Risk**: Breaking schema changes, data loss
    - **Workflows**: `.github/workflows/schema-drift-guard.yml`
    - **Effort**: 3-4 hours (MEDIUM)
    - **Impact**: MEDIUM - infrequent but critical
    - **Test Type**: Integration
    - **File**: `tests/integration/schema-migrations.test.js`

12. **Root Cause Analysis (RCA) System** (MEDIUM)
    - **Feature**: Automated failure analysis and CAPA generation
    - **Risk**: RCA triggers fail, no learning from failures
    - **Scripts**: `scripts/root-cause-agent.js`
    - **Workflow**: `.github/workflows/rca-auto-trigger.yml`
    - **Existing**: `tests/integration/rca-system.integration.test.js` (partial)
    - **Effort**: 2-3 hours (LOW-MEDIUM - extend existing)
    - **Impact**: MEDIUM - quality improvement system
    - **Test Type**: Integration (extend existing)

13. **WSJF Priority Calculation** (MEDIUM)
    - **Feature**: Backlog prioritization (WSJF scoring)
    - **Risk**: Wrong priorities = wrong work order
    - **Scripts**: `scripts/wsjf-priority-fetcher.js`
    - **Existing**: `tests/wsjf-priority-fetcher.test.js` (unit only)
    - **Effort**: 2-3 hours (LOW-MEDIUM)
    - **Impact**: MEDIUM - planning accuracy
    - **Test Type**: Integration (extend existing)

14. **Documentation Monitoring (DOCMON)** (MEDIUM)
    - **Feature**: Weekly documentation health checks
    - **Risk**: Stale docs, outdated examples
    - **Workflow**: `.github/workflows/docmon-weekly.yml`
    - **Effort**: 2-3 hours (LOW-MEDIUM)
    - **Impact**: MEDIUM - documentation quality
    - **Test Type**: Integration
    - **File**: `tests/integration/docmon-health.test.js`

---

#### **Priority 4: LOW (Nice-to-Have)**

15. **Accessibility (a11y) Checks** (LOW)
    - **Feature**: WCAG compliance scanning
    - **Workflow**: `.github/workflows/a11y-check.yml`
    - **Existing**: `tests/a11y.spec.js` (smoke test only)
    - **Effort**: 2-3 hours (extend existing)
    - **Impact**: LOW - compliance monitoring
    - **Test Type**: E2E (extend existing)

16. **Performance Budget Monitoring** (LOW)
    - **Feature**: Bundle size and performance tracking
    - **Workflow**: `.github/workflows/perf-budget.yml`
    - **Effort**: 2-3 hours (LOW-MEDIUM)
    - **Impact**: LOW - performance regression prevention
    - **Test Type**: E2E
    - **File**: `tests/e2e/performance-budget.spec.ts`

17. **Label Sync and Auto-Labeling** (LOW)
    - **Feature**: GitHub PR/issue automation
    - **Workflows**: `.github/workflows/auto-labels.yml`, `label-sync.yml`
    - **Effort**: 1-2 hours (LOW)
    - **Impact**: LOW - workflow automation
    - **Test Type**: Integration
    - **File**: `tests/integration/github-automation.test.js`

---

## 2. Component Test Coverage - EHG_Engineer

### Current Coverage: MINIMAL

**Observation**: EHG_Engineer is a **management dashboard** (not customer-facing app), so component tests are LOWER priority than E2E tests. Focus on **workflow testing** over **component testing**.

### Missing Component Tests (If Needed)

| Component Area | Priority | Effort | Notes |
|----------------|----------|--------|-------|
| SD Status Widgets | LOW | 1-2h | Covered by E2E better |
| PRD Validation Forms | MEDIUM | 2-3h | Complex validation logic |
| Dashboard Charts | LOW | 2-3h | Visual testing preferred |
| Handoff Acceptance UI | MEDIUM | 2-3h | Critical workflow |

**Recommendation**: **Skip component tests** for now. E2E tests provide better ROI for dashboard features.

---

## 3. GitHub Actions Testing

### Current State: NO TESTS

**Critical Gap**: 54 workflows with ZERO automated testing.

### High-Priority Workflows Needing Tests

| Workflow | Priority | Risk | Effort |
|----------|----------|------|--------|
| `leo-gates.yml` | CRITICAL | All gates exit code 1 (broken) | 3-4h |
| `retrospective-quality-gates.yml` | HIGH | Silent failures | 2-3h |
| `rls-verification.yml` | HIGH | Security holes | 2-3h |
| `schema-drift-guard.yml` | HIGH | Breaking changes | 2-3h |
| `playwright-e2e.yml` | MEDIUM | E2E pipeline breaks | 2h |
| `prd-validation.yml` | MEDIUM | PRD quality gates | 2h |

**Recommendation**: Create **workflow integration tests** that simulate GitHub Actions locally using `act` or similar tooling.

---

## 4. Database Scripts Testing

### Current State: 1,223 scripts, <5% have tests

**Critical Scripts Without Tests**:

| Script | LOC | Priority | Risk | Effort |
|--------|-----|----------|------|--------|
| `unified-handoff-system.js` | 2,097 | CRITICAL | Phase transitions fail | 8-10h |
| `add-prd-to-database.js` | 563 | CRITICAL | PRD creation broken | 4-6h |
| `comprehensive-database-validation.js` | 815 | CRITICAL | Silent corruption | 4-5h |
| `generate-comprehensive-retrospective.js` | ~500 | HIGH | No learning data | 3-4h |
| `qa-engineering-director-enhanced.js` | ~800 | HIGH | No E2E validation | 4-5h |

**Recommendation**: Add **integration tests** that:
1. Test script execution against test database
2. Verify expected database state changes
3. Test error handling and rollback

---

## 5. Quick Wins (High-Impact, Low-Effort)

### Immediate Actions (Next 2 Weeks)

1. **LEO Gates Fix + Tests** (CRITICAL)
   - **Effort**: 4-6 hours
   - **Impact**: Unblock PLAN→EXEC validation
   - **File**: `tests/integration/leo-gates.test.js`
   - **Fix**: `tools/gates/*.ts` (all exit code 1 issues)

2. **Strategic Directive CRUD E2E** (CRITICAL)
   - **Effort**: 4-6 hours
   - **Impact**: Prevent SD data corruption
   - **File**: `tests/e2e/strategic-directives-crud.spec.ts`

3. **Database Validation Script Tests** (CRITICAL)
   - **Effort**: 4-5 hours
   - **Impact**: Catch data integrity issues early
   - **File**: `tests/integration/database-validation.test.js`

4. **Extend Existing Tests** (MEDIUM)
   - Extend `tests/wsjf-priority-fetcher.test.js` (unit → integration)
   - Extend `tests/a11y.spec.js` (smoke → comprehensive)
   - Extend `tests/integration/rca-system.integration.test.js` (add CAPA tests)
   - **Effort**: 6-8 hours total
   - **Impact**: Medium-High

---

## 6. Estimated Effort Breakdown

### By Priority

| Priority | Test Count | Estimated Hours | Cumulative |
|----------|-----------|----------------|------------|
| **CRITICAL** | 5 tests | 32-42 hours | 32-42h |
| **HIGH** | 4 tests | 23-33 hours | 55-75h |
| **MEDIUM** | 5 tests | 17-23 hours | 72-98h |
| **LOW** | 3 tests | 6-9 hours | 78-107h |
| **TOTAL** | 17 tests | **78-107 hours** | ~2-3 weeks |

### Phased Rollout

**Phase 1 (Week 1): CRITICAL - 32-42 hours**
- LEO Gates fix + tests
- SD CRUD E2E tests
- PRD Management E2E tests
- Database validation tests
- Phase handoff tests

**Phase 2 (Week 2): HIGH - 23-33 hours**
- Retrospective generation tests
- Sub-agent orchestration tests
- Dashboard metrics tests
- CI/CD workflow tests

**Phase 3 (Week 3): MEDIUM + LOW - 23-32 hours**
- RLS enforcement tests
- Schema migration tests
- RCA system tests (extend)
- WSJF priority tests (extend)
- DOCMON health tests
- Quick wins (a11y, perf, labels)

---

## 7. Testing Infrastructure Needs

### Current Infrastructure: ✅ READY

- **Playwright**: Configured (`playwright.config.js`)
- **Jest**: Configured (`jest.config.cjs`)
- **Supabase Test Client**: Available
- **E2E Test Dir**: `tests/e2e/` (exists)
- **Integration Test Dir**: `tests/integration/` (exists)
- **GitHub Actions**: CI/CD ready

### Recommended Additions

1. **Test Database Instance**
   - Use Supabase branch or separate project for tests
   - Avoid polluting production data

2. **Test Data Fixtures**
   - Create reusable test SDs, PRDs, user stories
   - Store in `tests/fixtures/`

3. **E2E Test Helpers**
   - Common Playwright page objects
   - Database cleanup utilities
   - Handoff creation helpers

4. **CI/CD Test Pipeline**
   - Run on all PRs (exclude Stage 4 tests)
   - Parallel test execution
   - Test result reporting

---

## 8. Recommended Test Templates

### Template 1: Strategic Directive CRUD E2E

```typescript
// tests/e2e/strategic-directives-crud.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

test.describe('Strategic Directive CRUD Operations', () => {
  test('US-XXX: Create new Strategic Directive', async ({ page }) => {
    // Navigate to SD creation page
    // Fill form
    // Submit
    // Verify database insert
    // Verify UI update
  });

  test('US-XXX: Edit existing Strategic Directive', async ({ page }) => {
    // Create test SD
    // Navigate to edit page
    // Update fields
    // Submit
    // Verify database update
    // Verify UI reflects changes
  });

  test('US-XXX: Transition SD status (DRAFT → ACTIVE)', async ({ page }) => {
    // Create draft SD
    // Transition to active
    // Verify status change
    // Verify audit log entry
  });
});
```

### Template 2: LEO Gates Integration Test

```javascript
// tests/integration/leo-gates.test.js
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

describe('LEO Gate Validation', () => {
  test('Gate 2A passes for valid PRD', async () => {
    // Create test PRD with valid architecture
    // Run gate2a.ts
    // Expect exit code 0
    // Expect score >= 85%
    // Verify database entry
  });

  test('Gate 2A fails for invalid PRD', async () => {
    // Create test PRD with missing interfaces
    // Run gate2a.ts
    // Expect failure with specific errors
    // Verify database entry with failure reasons
  });
});
```

---

## 9. Success Metrics

### Target Coverage (3-Week Goal)

- **E2E Coverage**: 15% → **60%** (4x increase)
- **Critical Scripts Tested**: 0% → **80%** (top 20 scripts)
- **GitHub Actions Tested**: 0% → **30%** (16 workflows)
- **Integration Tests**: 5 → **20** (4x increase)

### Quality Gates

- **All CRITICAL tests pass** before merging to `main`
- **LEO gates actually work** (no exit code 1 failures)
- **Zero regression bugs** on SD/PRD management
- **CI/CD pipeline green** on all PRs

---

## 10. Action Plan

### Immediate Next Steps (This Week)

1. **Create test fixtures directory**: `tests/fixtures/`
2. **Fix LEO gate scripts**: Debug exit code 1 issues
3. **Write first CRITICAL test**: SD CRUD E2E
4. **Set up CI/CD test job**: Add Playwright to GitHub Actions
5. **Document test patterns**: Add to `/docs/testing/`

### Who Should Execute

**Recommended**: Invoke **QA Engineering Director Enhanced v2.0**

```bash
# For comprehensive E2E test creation
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# For targeted test execution
node lib/sub-agent-executor.js TESTING <SD-ID>
```

**Why**: QA Director has:
- Pre-flight build checks
- Professional test case generation
- User story mapping
- Evidence-based verification

---

## Appendix: Test File Inventory

### E2E Tests (Non-Stage-4)
```
tests/e2e/
├── context7-failure-scenarios.spec.ts ✅
├── knowledge-retrieval-flow.spec.ts ✅
├── leo-protocol-journey.test.js ✅ (partial)
├── directive-lab-*.test.js ✅ (4 files)
├── semantic-search.spec.js ✅
├── visual-inspection.spec.js ✅
└── [NEED 12+ NEW FILES]
```

### Integration Tests
```
tests/integration/
├── database-operations.test.js ✅
├── error-triggered-invocation.integration.test.js ✅
├── rca-system.integration.test.js ✅
└── [NEED 15+ NEW FILES]
```

### Unit Tests
```
tests/unit/
├── 20+ existing unit tests ✅
└── [Extend as needed]
```

---

**End of Analysis**
**Next Action**: Review with LEAD, prioritize CRITICAL tests, invoke QA Director
