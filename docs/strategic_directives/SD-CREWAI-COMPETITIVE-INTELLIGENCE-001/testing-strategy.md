# Testing Strategy: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: api, testing, e2e, unit

**SD**: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
**PRD**: PRD-SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
**Phase**: PLAN
**Date**: 2025-11-07

---

## Overview

Comprehensive testing strategy for CrewAI Stage 4 Competitive Intelligence Integration following LEO Protocol v4.3.0 testing tiers (Tier 1: Smoke, Tier 2: E2E, Tier 3: Performance/Load).

---

## Testing Tier Classification

### Tier 1: Smoke Tests (Unit + Integration)
**Purpose**: Fast feedback on code correctness, run on every commit
**Target**: <2 min execution time
**Coverage**: Core functionality validation

#### Tier 1 Test Scenarios

**TS-UNIT-001**: Backend routing validation
- **File**: `agent-platform/tests/test_research_orchestrator.py`
- **Test**: `test_execute_deep_competitive_routing()`
- **Validates**: `session_type: "deep"` routes to Marketing Department Crew
- **Expected**: Crew invocation logged, 4 agents queued
- **Duration**: <5 sec

**TS-UNIT-002**: Frontend service layer validation
- **File**: `src/services/ventureResearch.test.ts`
- **Test**: `createResearchSession_with_deep_type()`
- **Validates**: POST request includes `session_type: "deep"` parameter
- **Expected**: API call made with correct payload
- **Duration**: <1 sec

**TS-UNIT-003**: Feature flag behavior
- **File**: `src/services/ventureResearch.test.ts`
- **Test**: `deep_trigger_disabled_when_flag_off()`
- **Validates**: `stage4.crewaiDeep=false` prevents deep session creation
- **Expected**: Only baseline session created
- **Duration**: <1 sec

**TS-INT-001**: Backend integration test
- **File**: `agent-platform/tests/test_research_integration.py`
- **Test**: `test_deep_session_end_to_end()`
- **Validates**: Full backend flow from API → crew → storage
- **Expected**: research_results JSONB contains `deep_competitive` structure
- **Duration**: ~30 sec (mocked crew execution)

**Tier 1 Summary**:
- **Total Tests**: 4
- **Execution Time**: ~37 sec
- **Trigger**: Every git commit (GitHub Actions)
- **Blocker**: ❌ BLOCK merge if any test fails

---

### Tier 2: End-to-End Tests
**Purpose**: User journey validation, run on PR creation
**Target**: <10 min execution time
**Coverage**: Full stack integration with real UI

#### Tier 2 Test Scenarios

**TS-E2E-001**: Happy path - Deep analysis auto-trigger
- **File**: `tests/e2e/stage4-crewai-integration.spec.ts`
- **User Journey**:
  1. Navigate to Stage 4 (venture in Quick Validation complete)
  2. Verify baseline (competitive_mapper) displayed immediately
  3. Verify deep analysis auto-triggers (progress indicator appears)
  4. Wait for 4-agent crew execution (or use mocked fast execution)
  5. Verify side-by-side display: baseline (left) + deep (right)
- **Expected**: Both analyses visible, no errors thrown
- **Duration**: ~2 min (with mocked crew for speed)
- **Test Data**: Test venture with prepared baseline results

**TS-E2E-002**: Error path - Crew failure fallback
- **File**: `tests/e2e/stage4-crewai-fallback.spec.ts`
- **User Journey**:
  1. Navigate to Stage 4
  2. Simulate crew failure (mock API returns error)
  3. Verify fallback banner displayed: "Deep analysis unavailable, showing baseline"
  4. Verify baseline displayed correctly
  5. Verify no error thrown to user
- **Expected**: Graceful degradation to baseline
- **Duration**: ~1 min
- **Test Data**: Test venture with prepared baseline, mocked crew failure

**TS-E2E-003**: Feature flag - Deep analysis disabled
- **File**: `tests/e2e/stage4-feature-flag.spec.ts`
- **User Journey**:
  1. Set feature flag `stage4.crewaiDeep=false` (localStorage)
  2. Navigate to Stage 4
  3. Verify only baseline displayed
  4. Verify no deep analysis progress indicator
  5. Verify no API call to create deep session
- **Expected**: Only baseline shown, no deep trigger
- **Duration**: ~30 sec
- **Test Data**: Test venture with prepared baseline

**TS-E2E-004**: Progress indicator real-time updates
- **File**: `tests/e2e/stage4-crewai-progress.spec.ts`
- **User Journey**:
  1. Navigate to Stage 4
  2. Monitor progress indicator during crew execution
  3. Verify 4 agent statuses displayed: pain_point → competitive → positioning → segmentation
  4. Verify status updates within 2 sec of agent transitions (mocked timestamps)
- **Expected**: Progress indicator reflects crew execution status
- **Duration**: ~1 min (mocked crew with controlled timing)
- **Test Data**: Test venture with mocked crew progress events

**Tier 2 Summary**:
- **Total Tests**: 4
- **Execution Time**: ~4.5 min
- **Trigger**: PR creation, pre-merge validation
- **Blocker**: ⚠️ WARN on failure, BLOCK if >2 tests fail

---

### Tier 3: Performance & Load Tests
**Purpose**: SLA validation, run nightly or pre-release
**Target**: Validate ≤25 min P95 SLA
**Coverage**: Real crew execution with performance monitoring

#### Tier 3 Test Scenarios

**TS-PERF-001**: Crew execution time P95 validation
- **File**: `tests/performance/stage4-crewai-sla.spec.ts`
- **Test**: `validate_p95_execution_time()`
- **Method**:
  1. Run 20 test iterations with real Marketing Department Crew
  2. Record execution time for each run
  3. Calculate P95 (95th percentile)
  4. Assert P95 ≤25 min
- **Expected**: P95 ≤25 min (1500 sec)
- **Duration**: ~8 hours (20 runs × ~24 min avg)
- **Test Data**: 20 unique test ventures with varying complexity

**TS-PERF-002**: UI progress indicator responsiveness
- **File**: `tests/performance/stage4-progress-latency.spec.ts`
- **Test**: `validate_progress_update_latency()`
- **Method**:
  1. Monitor progress indicator updates during real crew execution
  2. Measure time delta between agent transition (backend event) and UI update (frontend render)
  3. Assert 95th percentile latency <2 sec
- **Expected**: P95 UI update latency <2 sec
- **Duration**: ~30 min (mocked crew with controlled event timing)

**TS-PERF-003**: Concurrent user load test
- **File**: `tests/performance/stage4-concurrent-load.spec.ts`
- **Test**: `validate_concurrent_deep_sessions()`
- **Method**:
  1. Simulate 10 concurrent users triggering deep analysis
  2. Monitor backend queue, agent execution, response times
  3. Assert no timeouts, no failed requests
  4. Assert average response time <30 min
- **Expected**: System handles 10 concurrent deep sessions without degradation
- **Duration**: ~30 min
- **Test Data**: 10 unique test ventures

**TS-PERF-004**: Baseline fallback performance
- **File**: `tests/performance/stage4-fallback-latency.spec.ts`
- **Test**: `validate_fallback_display_time()`
- **Method**:
  1. Trigger deep analysis, simulate crew failure
  2. Measure time from failure event to baseline display
  3. Assert fallback display time ≤1 sec
- **Expected**: Fallback banner + baseline display within 1 sec of crew failure
- **Duration**: ~5 min (20 iterations)

**Tier 3 Summary**:
- **Total Tests**: 4
- **Execution Time**: ~9 hours (TS-PERF-001 dominates)
- **Trigger**: Nightly (staging environment), pre-release (production candidate)
- **Blocker**: ⚠️ WARN on failure, manual review required for release

---

## Test Data Management

### Test Ventures
**Location**: `tests/fixtures/ventures/`

**Fixtures Required**:
1. `venture-stage4-baseline-ready.json` - Venture with Stage 2 complete, baseline results prepared
2. `venture-stage4-simple.json` - Simple venture for fast E2E tests
3. `venture-stage4-complex.json` - Complex venture for performance tests
4. `venture-stage4-edge-case.json` - Edge case data (missing fields, unusual inputs)

### Mocked Crew Responses
**Location**: `tests/mocks/crew-responses/`

**Mocks Required**:
1. `marketing-department-crew-success.json` - Typical successful crew execution
2. `marketing-department-crew-failure.json` - Crew failure simulation
3. `marketing-department-crew-progress-events.json` - Agent transition events for progress testing

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/stage4-crewai-tests.yml
name: Stage 4 CrewAI Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  tier1-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Unit Tests
        run: |
          npm run test:unit -- --testPathPattern=ventureResearch
          cd agent-platform && pytest tests/test_research_orchestrator.py
      - name: Run Integration Tests
        run: cd agent-platform && pytest tests/test_research_integration.py

  tier2-e2e:
    runs-on: ubuntu-latest
    needs: tier1-smoke
    steps:
      - uses: actions/checkout@v3
      - name: Install Playwright
        run: npx playwright install --with-deps
      - name: Run E2E Tests
        run: npx playwright test tests/e2e/stage4-crewai-*.spec.ts
      - name: Upload Test Results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: test-results/

  tier3-performance:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v3
      - name: Run Performance Tests
        run: npx playwright test tests/performance/stage4-*.spec.ts
        timeout-minutes: 600  # 10 hours max
```

---

## Testing Checklist (Pre-Merge)

### Before Creating PR
- [ ] All Tier 1 tests pass locally (`npm run test:unit && npm run test:integration`)
- [ ] At least 2 Tier 2 E2E tests pass locally (`npx playwright test tests/e2e/stage4-crewai-integration.spec.ts`)
- [ ] Code coverage ≥80% for new code (`npm run test:coverage`)

### PR Review Criteria
- [ ] All Tier 1 tests pass in CI (BLOCKER)
- [ ] ≥75% Tier 2 tests pass in CI (3/4 tests)
- [ ] No regressions in existing tests
- [ ] Test scenarios documented in PR description

### Pre-Release Criteria
- [ ] All Tier 1 + Tier 2 tests pass (100%)
- [ ] Tier 3 performance tests executed in staging
- [ ] P95 SLA ≤25 min validated
- [ ] No critical bugs in test results

---

## Risk Mitigation

### Known Testing Risks

**Risk 1**: Crew execution time variability
- **Impact**: Tier 3 performance tests may have high variance
- **Mitigation**: Run 20+ iterations, use P95 metric instead of average
- **Escape Hatch**: Feature flag `stage4.crewaiDeep=false` if SLA breached in production

**Risk 2**: Flaky E2E tests due to timing
- **Impact**: False negatives in CI, blocking PRs unnecessarily
- **Mitigation**: Use Playwright auto-waiting, add explicit wait conditions, retry failed tests once
- **Monitoring**: Track test flakiness rate, investigate if >5%

**Risk 3**: Test data staleness
- **Impact**: Tests pass but real-world usage fails
- **Mitigation**: Refresh test fixtures monthly, use production-like data
- **Validation**: Smoke test in staging with real venture data weekly

---

## Test Metrics & Monitoring

### Key Metrics to Track

| Metric | Target | Measurement | Alert Threshold |
|--------|--------|-------------|-----------------|
| Tier 1 Pass Rate | 100% | CI pipeline | <100% blocks merge |
| Tier 2 Pass Rate | ≥75% | CI pipeline | <50% blocks merge |
| Tier 3 P95 SLA | ≤25 min | Nightly run | >30 min investigation |
| Test Coverage | ≥80% | Coverage report | <70% warning |
| E2E Flakiness | <5% | Test retry rate | >10% investigation |

### Dashboards

**CI/CD Dashboard**: GitHub Actions workflow status
**Coverage Dashboard**: `npm run test:coverage` HTML report
**Performance Dashboard**: Grafana (crew execution times, API latency)

---

## Appendix: Test File Structure

```
tests/
├── unit/
│   ├── ventureResearch.test.ts           # TS-UNIT-002, TS-UNIT-003
│   └── (existing unit tests)
├── e2e/
│   ├── stage4-crewai-integration.spec.ts  # TS-E2E-001
│   ├── stage4-crewai-fallback.spec.ts     # TS-E2E-002
│   ├── stage4-feature-flag.spec.ts        # TS-E2E-003
│   └── stage4-crewai-progress.spec.ts     # TS-E2E-004
├── performance/
│   ├── stage4-crewai-sla.spec.ts          # TS-PERF-001
│   ├── stage4-progress-latency.spec.ts    # TS-PERF-002
│   ├── stage4-concurrent-load.spec.ts     # TS-PERF-003
│   └── stage4-fallback-latency.spec.ts    # TS-PERF-004
├── fixtures/
│   ├── ventures/
│   │   ├── venture-stage4-baseline-ready.json
│   │   ├── venture-stage4-simple.json
│   │   ├── venture-stage4-complex.json
│   │   └── venture-stage4-edge-case.json
│   └── mocks/
│       └── crew-responses/
│           ├── marketing-department-crew-success.json
│           ├── marketing-department-crew-failure.json
│           └── marketing-department-crew-progress-events.json

agent-platform/tests/
├── test_research_orchestrator.py          # TS-UNIT-001
└── test_research_integration.py           # TS-INT-001
```

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-07 | 1.0 | Initial testing strategy created | PLAN Phase (Claude Code) |

---

*Generated by: Claude Code (LEO Protocol v4.3.0)*
*Testing Strategy: 3-tier approach (Smoke/E2E/Performance)*
*Total Test Scenarios: 8 (4 Tier 1, 4 Tier 2, 4 Tier 3)*
