# Test Coverage Scorecard - Non-Stage-4 Features
**Generated**: 2025-11-15
**Scope**: EHG_Engineer (excluding Stage 4 Venture Workflow)

---

## Overall Score: 🟡 20% (NEEDS IMPROVEMENT)

```
Progress: [████░░░░░░░░░░░░░░░░] 20%

Target:   [████████████░░░░░░░░] 60% (3-week goal)
```

---

## Coverage by Category

| Category | Current | Target | Status | Priority |
|----------|---------|--------|--------|----------|
| **E2E Tests** | 15% | 60% | 🔴 POOR | CRITICAL |
| **Integration Tests** | 10% | 50% | 🔴 POOR | HIGH |
| **Unit Tests** | 40% | 70% | 🟡 FAIR | MEDIUM |
| **GitHub Actions** | 0% | 30% | 🔴 NONE | HIGH |
| **Scripts** | <5% | 80% | 🔴 POOR | CRITICAL |

---

## Critical Feature Scorecard

### Strategic Directives Management
```
Feature:     Strategic Directive CRUD Operations
Coverage:    0% ████████████████████ (NO TESTS)
Priority:    🔴 CRITICAL
Scripts:     200+ SD management scripts
Risk:        Data corruption, workflow failures
Test Type:   E2E (Playwright)
Effort:      4-6 hours
Status:      ⚠️ NOT STARTED
```

### PRD Management
```
Feature:     PRD Creation & Validation
Coverage:    0% ████████████████████ (NO TESTS)
Priority:    🔴 CRITICAL
Scripts:     add-prd-to-database.js (563 LOC)
Risk:        PRD creation failures, blocked EXEC
Test Type:   E2E (Playwright)
Effort:      6-8 hours
Status:      ⚠️ NOT STARTED
```

### LEO Gates Validation
```
Feature:     Gates 2A-2D, Gate 3
Coverage:    0% ████████████████████ (ALL BROKEN)
Priority:    🔴 CRITICAL
Scripts:     tools/gates/*.ts (5 files)
Risk:        BLOCKS EXEC VALIDATION
Test Type:   Integration
Effort:      4-6 hours
Status:      ⚠️ BROKEN (exit code 1)
```

### Phase Handoff System
```
Feature:     LEAD→PLAN→EXEC Handoffs
Coverage:    0% ████████████████████ (NO TESTS)
Priority:    🔴 CRITICAL
Scripts:     unified-handoff-system.js (2,097 LOC)
Risk:        Phase transitions fail, SD halts
Test Type:   E2E + Integration
Effort:      8-10 hours
Status:      ⚠️ NOT STARTED
```

### Database Validation
```
Feature:     Schema & Data Integrity Checks
Coverage:    0% ████████████████████ (NO TESTS)
Priority:    🔴 CRITICAL
Scripts:     comprehensive-database-validation.js (815 LOC)
Risk:        Silent corruption, invalid state
Test Type:   Integration
Effort:      4-5 hours
Status:      ⚠️ NOT STARTED
```

### Retrospective Generation
```
Feature:     Automated Retrospectives
Coverage:    0% ████████████████████ (NO TESTS)
Priority:    🟡 HIGH
Scripts:     15+ retrospective scripts
Risk:        Missing insights, broken learning
Test Type:   E2E + Integration
Effort:      4-6 hours
Status:      ⚠️ NOT STARTED
```

### Knowledge Retrieval
```
Feature:     Context7 + Research Automation
Coverage:    95% ███████████████████░ (EXCELLENT)
Priority:    ✅ COMPLETE
Scripts:     automated-knowledge-retrieval.js
Risk:        LOW (well tested)
Test Type:   E2E (Playwright)
Effort:      N/A
Status:      ✅ COMPLETE
```

### Sub-Agent Orchestration
```
Feature:     Parallel Sub-Agent Execution
Coverage:    20% ████░░░░░░░░░░░░░░░░ (UNIT ONLY)
Priority:    🟡 HIGH
Scripts:     sub-agent-executor.js, orchestrate-phase-subagents.js
Risk:        Silent failures, no verification
Test Type:   Integration
Effort:      6-8 hours
Status:      ⚠️ PARTIAL (unit tests only)
```

### Dashboard Metrics
```
Feature:     Real-Time SD/PRD Status
Coverage:    0% ████████████████████ (NO TESTS)
Priority:    🟡 HIGH
Scripts:     database-health-dashboard.js
Risk:        Wrong data = bad decisions
Test Type:   E2E
Effort:      3-4 hours
Status:      ⚠️ NOT STARTED
```

---

## Test File Inventory

### E2E Tests (12 files)
```
✅ context7-failure-scenarios.spec.ts (Circuit breaker)
✅ knowledge-retrieval-flow.spec.ts (Research automation)
🟡 leo-protocol-journey.test.js (SD→PRD workflow, partial)
✅ directive-lab-*.test.js (4 files, UI testing)
✅ semantic-search.spec.js (Search)
✅ visual-inspection.spec.js (Visual regression)
✅ a11y.spec.js (Accessibility smoke)

❌ MISSING: strategic-directives-crud.spec.ts
❌ MISSING: prd-management.spec.ts
❌ MISSING: phase-handoffs.spec.ts
❌ MISSING: retrospective-generation.spec.ts
❌ MISSING: dashboard-metrics.spec.ts
❌ MISSING: 7+ more E2E tests
```

### Integration Tests (4 files)
```
✅ database-operations.test.js
✅ error-triggered-invocation.integration.test.js
✅ rca-system.integration.test.js
✅ rca-gate-enforcement.test.js

❌ MISSING: leo-gates.test.js
❌ MISSING: database-validation.test.js
❌ MISSING: sub-agent-orchestration.test.js
❌ MISSING: github-actions-workflows.test.js
❌ MISSING: rls-enforcement.test.js
❌ MISSING: schema-migrations.test.js
❌ MISSING: 10+ more integration tests
```

### Unit Tests (20+ files)
```
✅ Good coverage for:
   - Utilities (parsers, helpers)
   - Factories (directive, base)
   - RCA components
   - WSJF priority calculation
   - Circuit breaker logic
   - Semantic search client
```

---

## Known Issues Tracker

| Issue | Severity | Impact | Status | ETA |
|-------|----------|--------|--------|-----|
| LEO Gates exit code 1 | 🔴 CRITICAL | Blocks EXEC | ⚠️ BROKEN | Fix in Week 1 |
| No SD CRUD tests | 🔴 CRITICAL | Data corruption | ⚠️ OPEN | Add in Week 1 |
| No PRD management tests | 🔴 CRITICAL | PRD failures | ⚠️ OPEN | Add in Week 1 |
| No handoff tests | 🔴 CRITICAL | Workflow halts | ⚠️ OPEN | Add in Week 2 |
| No DB validation tests | 🔴 CRITICAL | Silent corruption | ⚠️ OPEN | Add in Week 1 |
| No test database instance | 🟡 HIGH | Pollutes production | ⚠️ OPEN | Setup in Week 1 |
| No test fixtures | 🟡 MEDIUM | Slow test creation | ⚠️ OPEN | Create in Week 1 |

---

## ROI Analysis (Investment vs. Risk)

### Option A: Invest 26-35 hours (Week 1)
```
Investment:  26-35 hours (5 days)
Coverage:    20% → 45% (+125% improvement)
Risk:        CRITICAL → MEDIUM
Benefits:
  ✅ Prevent SD/PRD data corruption
  ✅ Unblock EXEC validation (fix LEO gates)
  ✅ Enable confident CI/CD deployments
  ✅ Reduce regression bugs to near-zero
  ✅ Foundation for 60% coverage in 3 weeks

ROI Score:   ⭐⭐⭐⭐⭐ (5/5 - EXCELLENT)
```

### Option B: Do Nothing
```
Investment:  0 hours
Coverage:    20% (no change)
Risk:        CRITICAL (no change)
Consequences:
  ❌ LEO gates remain broken (EXEC blocked)
  ❌ SD/PRD operations untested (corruption risk)
  ❌ High regression bug likelihood
  ❌ 10-20 hours debugging failures later
  ❌ Production incidents likely

ROI Score:   ⭐☆☆☆☆ (1/5 - POOR)
```

**Recommended**: **Option A** (5 days investment → Long-term stability)

---

## Week 1 Sprint Scorecard

### Day 1-2: LEO Gates (6 hours)
```
□ Debug gate2a.ts exit code 1
□ Debug gate2b.ts exit code 1
□ Debug gate2c.ts exit code 1
□ Debug gate2d.ts exit code 1
□ Debug gate3.ts exit code 1
□ Write integration tests for all 5 gates
□ Verify gates pass for valid PRDs
□ Verify gates fail for invalid PRDs
□ Update GitHub Actions workflow
□ Document gate fixes

Progress: [░░░░░░░░░░] 0%
```

### Day 3: SD CRUD (6 hours)
```
□ E2E test: Create SD
□ E2E test: Edit SD (title, description)
□ E2E test: Transition SD status (DRAFT → ACTIVE)
□ E2E test: Transition SD status (ACTIVE → IN_PROGRESS)
□ E2E test: Transition SD status (IN_PROGRESS → COMPLETED)
□ E2E test: Delete SD (soft delete)
□ E2E test: SD validation rules
□ E2E test: Required fields enforcement

Progress: [░░░░░░░░░░] 0%
```

### Day 4: PRD Management (8 hours)
```
□ E2E test: Create PRD from SD
□ E2E test: Validate PRD schema
□ E2E test: Add user stories to PRD
□ E2E test: Validate user stories
□ E2E test: Approve PRD for EXEC
□ E2E test: Reject PRD with feedback
□ E2E test: PRD required fields
□ E2E test: PRD status transitions

Progress: [░░░░░░░░░░] 0%
```

### Day 5: DB Validation (5 hours)
```
□ Integration test: Validate SD schema
□ Integration test: Validate PRD schema
□ Integration test: Detect orphaned PRDs
□ Integration test: Detect invalid status transitions
□ Integration test: Detect missing required fields
□ Integration test: Generate fix scripts
□ Integration test: Apply fix scripts
□ Integration test: Verify repairs

Progress: [░░░░░░░░░░] 0%
```

---

## Success Criteria (Week 1)

```
✅ LEO gates stop exiting with code 1
✅ LEO gates have integration tests (5 gates)
✅ SD CRUD operations have E2E tests (8 test cases)
✅ PRD management has E2E tests (8 test cases)
✅ Database validation has integration tests (8 test cases)
✅ CI/CD pipeline runs tests on all PRs
✅ Zero test failures on main branch
✅ Coverage increases: 20% → 45%

Overall Score: 🟡 20% → 🟢 45%
```

---

## Commands Reference

### Run Tests
```bash
# All non-Stage-4 E2E tests
npx playwright test tests/e2e/ --grep-invert "stage-04|venture"

# Integration tests
npm run test:integration

# Unit tests
npm run test:unit

# Database validation
npm run db:validate
```

### Invoke QA Director
```bash
# Comprehensive E2E test suite
node scripts/qa-engineering-director-enhanced.js <SD-ID> --full-e2e

# Quick targeted testing
node lib/sub-agent-executor.js TESTING <SD-ID>
```

---

**End of Scorecard**
**Next Review**: After Week 1 sprint completion
**Target**: 🟢 45% coverage by end of Week 1
