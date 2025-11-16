# Quick Wins - Test Priority Matrix
**Generated**: 2025-11-15
**Purpose**: Actionable test creation roadmap (CRITICAL items only)

---

## Top 5 CRITICAL Tests (Start Here)

### 1. LEO Gates Fix + Integration Tests ⚠️ BLOCKING
**Status**: ALL GATES EXIT CODE 1 (BROKEN)
**File**: `tests/integration/leo-gates.test.js`
**Effort**: 4-6 hours
**Impact**: UNBLOCK PLAN→EXEC VALIDATION

**Why Critical**: Gates 2A-2D and Gate 3 are **broken** (all exit code 1). PRDs cannot be validated for EXEC phase.

**Test Cases**:
- Gate 2A: Architecture validation (interfaces, API contracts)
- Gate 2B: Design & Database validation (schema, migrations)
- Gate 2C: Security & Risk validation (RLS, auth)
- Gate 2D: NFR & Testing validation (performance, test coverage)
- Gate 3: Final verification (all gates passed)

**Fix Required**: Debug `tools/gates/*.ts` scripts before writing tests.

---

### 2. Strategic Directive CRUD E2E Tests
**File**: `tests/e2e/strategic-directives-crud.spec.ts`
**Effort**: 4-6 hours
**Impact**: PREVENT SD DATA CORRUPTION

**Test Cases**:
- Create new SD (LEAD agent)
- Edit SD (update title, description, status)
- Transition SD status (DRAFT → ACTIVE → IN_PROGRESS → COMPLETED)
- Delete SD (soft delete verification)
- SD validation rules (required fields, status constraints)

**User Stories to Cover**:
- US-SD-CREATE: Create Strategic Directive
- US-SD-EDIT: Edit Strategic Directive
- US-SD-STATUS: Transition SD Status
- US-SD-DELETE: Archive Strategic Directive

---

### 3. PRD Management Workflow E2E Tests
**File**: `tests/e2e/prd-management.spec.ts`
**Effort**: 6-8 hours
**Impact**: PREVENT PRD CREATION FAILURES

**Test Cases**:
- Create PRD from SD (PLAN agent)
- Validate PRD schema (required fields)
- Add user stories to PRD
- Validate user stories (acceptance criteria)
- Approve PRD for EXEC
- Reject PRD with feedback

**Script to Test**: `scripts/add-prd-to-database.js` (563 LOC, no tests)

**User Stories to Cover**:
- US-PRD-CREATE: Create PRD from SD
- US-PRD-VALIDATE: Validate PRD completeness
- US-PRD-STORIES: Add user stories
- US-PRD-APPROVE: Approve PRD for execution

---

### 4. Phase Handoff System E2E Tests
**File**: `tests/e2e/phase-handoffs.spec.ts`
**Effort**: 8-10 hours
**Impact**: PREVENT PHASE TRANSITION FAILURES

**Test Cases**:
- LEAD creates handoff to PLAN
- PLAN accepts handoff
- PLAN creates handoff to EXEC
- EXEC accepts handoff
- EXEC creates handoff to LEAD (completion)
- Handoff validation (required fields)
- Handoff rejection (with feedback)

**Script to Test**: `scripts/unified-handoff-system.js` (2,097 LOC, no tests)

**User Stories to Cover**:
- US-HANDOFF-CREATE: Create phase handoff
- US-HANDOFF-ACCEPT: Accept handoff
- US-HANDOFF-REJECT: Reject handoff with feedback
- US-HANDOFF-VALIDATE: Validate handoff completeness

---

### 5. Database Validation Script Integration Tests
**File**: `tests/integration/database-validation.test.js`
**Effort**: 4-5 hours
**Impact**: CATCH DATA INTEGRITY ISSUES EARLY

**Test Cases**:
- Validate SD schema compliance
- Validate PRD schema compliance
- Detect orphaned records (PRDs without SDs)
- Detect invalid status transitions
- Detect missing required fields
- Generate fix scripts for issues

**Script to Test**: `scripts/comprehensive-database-validation.js` (815 LOC, no tests)

**Validation Rules to Test**:
- SD required fields: id, title, status, category
- PRD required fields: id, sd_id, title, user_stories
- Status transitions: valid state machine
- Referential integrity: SD ↔ PRD ↔ User Stories

---

## Effort Summary

| Test | Priority | Effort | ROI Score |
|------|----------|--------|-----------|
| LEO Gates | CRITICAL | 4-6h | 10/10 (blocking) |
| SD CRUD | CRITICAL | 4-6h | 9/10 |
| PRD Management | CRITICAL | 6-8h | 9/10 |
| Phase Handoffs | CRITICAL | 8-10h | 8/10 |
| DB Validation | CRITICAL | 4-5h | 8/10 |
| **TOTAL** | - | **26-35h** | **~5 days** |

---

## Week 1 Sprint Plan

### Day 1-2: LEO Gates (6 hours)
- **Morning**: Debug gate scripts (identify exit code 1 root cause)
- **Afternoon**: Fix gate2a.ts, gate2b.ts
- **Next Day**: Fix gate2c.ts, gate2d.ts, gate3.ts
- **Final**: Write integration tests for all 5 gates

### Day 3: SD CRUD (6 hours)
- **Morning**: Write E2E test for SD creation
- **Afternoon**: Write E2E tests for SD edit, status transition, delete

### Day 4: PRD Management (8 hours)
- **Morning**: Write E2E test for PRD creation
- **Afternoon**: Write E2E tests for validation, user stories, approval

### Day 5: DB Validation (5 hours)
- **Morning**: Write integration tests for validation script
- **Afternoon**: Test fix script generation, verify repairs

**Phase Handoffs**: Defer to Week 2 (most complex, 8-10 hours)

---

## Quick Reference: Test Execution Commands

### Run All Non-Stage-4 E2E Tests
```bash
npx playwright test tests/e2e/ --grep-invert "stage-04|venture"
```

### Run Integration Tests
```bash
npm run test:integration
```

### Run Specific Test File
```bash
npx playwright test tests/e2e/strategic-directives-crud.spec.ts
```

### Run LEO Gate Integration Tests
```bash
npm test tests/integration/leo-gates.test.js
```

### Database Validation
```bash
npm run db:validate
```

---

## Success Criteria (Week 1)

- ✅ LEO gates **stop exiting with code 1**
- ✅ LEO gates have **integration tests** (all 5 gates)
- ✅ SD CRUD operations have **E2E tests** (create, edit, delete)
- ✅ PRD management has **E2E tests** (create, validate, approve)
- ✅ Database validation has **integration tests** (detect + fix)
- ✅ **CI/CD pipeline runs tests** on all PRs
- ✅ **Zero test failures** on `main` branch

---

## Invoke QA Engineering Director

For comprehensive test creation with user story mapping:

```bash
# Full E2E test suite generation
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# Quick targeted testing
node lib/sub-agent-executor.js TESTING <SD-ID>

# Phase orchestration (includes TESTING agent)
node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>
```

**QA Director Advantages**:
- Pre-flight checks (catch build/migration issues)
- Professional test case generation from user stories
- Mandatory E2E testing via Playwright
- Evidence-based verification with screenshots
- 100% user story coverage enforcement

---

## Known Issues to Fix During Testing

1. **LEO Gates**: All exit code 1 (blocking PLAN→EXEC)
2. **Gate Summary Script**: ESM/CommonJS conflicts
3. **Default PRD-SD-001**: May not exist (gate workflow fails)
4. **Handoff RLS**: May need bypass for tests
5. **Test Database**: No separate test instance (pollutes production)

---

**End of Quick Wins Guide**
**Next Step**: Start with LEO Gates (highest priority, blocking EXEC validation)
