# US-003 Quick Test Execution Guide

**Quick Reference**: How to run SD-CREWAI-COMPETITIVE-INTELLIGENCE-001 tests

---

## TIER 1: Smoke Tests (MANDATORY) - Run Before Every Commit

### Backend Tests (Python/pytest)

```bash
# Navigate to agent-platform directory
cd /mnt/c/_EHG/EHG/agent-platform

# Run TS-UNIT-001: Backend routing validation
python3 -m pytest tests/test_deep_competitive_routing.py -v --tb=short --no-cov

# Expected output:
# ✅ 4 passed in 2.22s
# - test_execute_deep_competitive_routing PASSED
# - test_deep_competitive_crew_failure_fallback PASSED
# - test_deep_competitive_result_structure PASSED
# - test_deep_crew_structured_output_variants PASSED

# Run TS-INT-001: Backend integration tests
python3 -m pytest tests/test_deep_competitive_integration.py -v --tb=short --no-cov

# Expected output:
# ✅ 3 passed in ~30s (mocked crew)
```

### Frontend Tests (Vitest)

```bash
# Navigate to ehg directory
cd /mnt/c/_EHG/EHG

# FIRST: Move test file to correct location
mkdir -p tests/unit
mv src/services/__tests__/ventureResearch.test.ts tests/unit/ventureResearch.test.ts

# Run TS-UNIT-002 & TS-UNIT-003: Frontend service layer tests
npx vitest run tests/unit/ventureResearch.test.ts

# Expected output:
# ✅ 8 passed
# - should include session_type="deep" parameter in POST request PASSED
# - should handle session_type="quick" for baseline sessions PASSED
# - should handle API errors gracefully PASSED
# - should handle network timeout gracefully PASSED
# - should respect stage4.crewaiDeep=true flag PASSED
# - should respect stage4.crewaiDeep=false flag PASSED
# - should default to enabled when flag is not set PASSED
# - should handle invalid flag values gracefully PASSED
```

**Tier 1 Pass Criteria**: ALL tests must pass (100% requirement)
**Tier 1 Execution Time**: <2 min total

---

## TIER 2: E2E Tests (RECOMMENDED) - Run Before PR Merge

### Prerequisites
- Application running on port 5173 (frontend)
- Agent Platform running on port 8000 (backend)
- Test database populated with test ventures

### E2E Tests (Playwright)

```bash
# Start application (in separate terminals)
cd /mnt/c/_EHG/EHG
npm run dev  # Terminal 1 (port 5173)

cd /mnt/c/_EHG/EHG/agent-platform
uvicorn main:app --reload  # Terminal 2 (port 8000)

# Run E2E tests
cd /mnt/c/_EHG/EHG
npx playwright test tests/e2e/stage4-crewai-integration.spec.ts  # TS-E2E-001
npx playwright test tests/e2e/stage4-crewai-fallback.spec.ts     # TS-E2E-002
npx playwright test tests/e2e/stage4-feature-flag.spec.ts        # TS-E2E-003
npx playwright test tests/e2e/stage4-crewai-progress.spec.ts     # TS-E2E-004

# Or run all Stage 4 E2E tests at once
npx playwright test tests/e2e/stage4-crewai-*.spec.ts
```

**Tier 2 Pass Criteria**: ≥75% tests pass (3/4 minimum)
**Tier 2 Execution Time**: <10 min total

---

## TIER 3: Performance Tests (OPTIONAL) - Run Nightly or Pre-Release

### Performance Tests (Long-running)

```bash
# ⚠️ WARNING: TS-PERF-001 takes ~8 hours to execute (20 runs with real crew)
# Only run in staging environment or on-demand

cd /mnt/c/_EHG/EHG

# Run P95 SLA validation (8 hours)
npx playwright test tests/performance/stage4-crewai-sla.spec.ts

# Run UI latency test (30 min)
npx playwright test tests/performance/stage4-progress-latency.spec.ts

# Run concurrent load test (30 min)
npx playwright test tests/performance/stage4-concurrent-load.spec.ts

# Run fallback latency test (5 min)
npx playwright test tests/performance/stage4-fallback-latency.spec.ts
```

**Tier 3 Pass Criteria**: Manual review required
**Tier 3 Execution Time**: ~9 hours (mostly TS-PERF-001)

---

## Quick Troubleshooting

### Backend Tests Failing

```bash
# Issue: "AttributeError: 'MarketingDepartmentCrew' does not have attribute"
# Fix: Ensure mock patch target is correct
# Correct: patch('app.crews.marketing_department_crew.MarketingDepartmentCrew')
# Incorrect: patch('app.services.research_orchestrator.MarketingDepartmentCrew')

# Issue: "Coverage failure: total of 7 is less than fail-under=50"
# Fix: Run tests with --no-cov flag during development
python3 -m pytest tests/test_deep_competitive_routing.py --no-cov
```

### Frontend Tests Not Running

```bash
# Issue: "No test files found, exiting with code 1"
# Fix: Tests must be in tests/ directory, not src/
mv src/services/__tests__/ventureResearch.test.ts tests/unit/ventureResearch.test.ts

# Issue: "localStorage is not defined"
# Fix: Vitest should mock localStorage automatically, check vitest.config.ts
```

### E2E Tests Timing Out

```bash
# Issue: "Timeout waiting for progress indicator"
# Fix: Increase timeout in playwright.config.ts
# Add to test: page.waitForSelector('[data-testid="stage4-progress-indicator"]', { timeout: 60000 })

# Issue: "Backend not responding"
# Fix: Verify backend is running on port 8000
curl http://localhost:8000/health  # Should return {"status": "healthy"}
```

---

## Test Data Setup (One-Time)

### Create Test Ventures

```bash
# Navigate to EHG database scripts
cd /mnt/c/_EHG/EHG_Engineer/scripts

# Create test venture in Stage 4 (baseline ready)
node create-test-venture-stage4.mjs

# Or manually insert via SQL
psql -U postgres -h localhost -d ehg_db -c "
INSERT INTO ventures (id, name, description, industry, target_market, geography, stage_id)
VALUES (
  'test-venture-stage4-001',
  'AI-Powered Test Venture',
  'Test venture for Stage 4 CrewAI testing',
  'Technology',
  'B2B SaaS companies',
  'United States',
  (SELECT id FROM venture_stages WHERE stage_name = 'Stage 4: Quick Validation')
);
"
```

### Create Mock Crew Responses

```bash
# Create test fixtures directory
mkdir -p /mnt/c/_EHG/EHG/tests/mocks/crew-responses

# Copy sample mock response
cat > /mnt/c/_EHG/EHG/tests/mocks/crew-responses/marketing-department-crew-success.json <<EOF
{
  "pain_points": [
    {"problem": "High CAC", "severity": "critical"}
  ],
  "competitive_landscape": {
    "competitors": [
      {"name": "Competitor A", "market_share": "30%"}
    ]
  },
  "market_positioning": {
    "unique_value_prop": "AI-powered insights"
  },
  "customer_segments": [
    {"segment": "Enterprise SaaS", "size": "500 companies"}
  ]
}
EOF
```

---

## CI/CD Integration (GitHub Actions)

### Create Workflow File

```bash
# Create GitHub Actions workflow directory
mkdir -p /mnt/c/_EHG/EHG/.github/workflows

# Copy workflow template
cp /mnt/c/_EHG/EHG_Engineer/docs/strategic_directives/SD-CREWAI-COMPETITIVE-INTELLIGENCE-001/testing-strategy.md .github/workflows/stage4-crewai-tests.yml

# Commit workflow
git add .github/workflows/stage4-crewai-tests.yml
git commit -m "ci: Add Stage 4 CrewAI test workflow"
git push origin main
```

### Enable Pre-Commit Hooks

```bash
# Create pre-commit hook
cat > /mnt/c/_EHG/EHG/.git/hooks/pre-commit <<'EOF'
#!/bin/bash
echo "Running Tier 1 smoke tests..."
cd agent-platform && python3 -m pytest tests/test_deep_competitive_routing.py --tb=short --no-cov || exit 1
cd .. && npx vitest run tests/unit/ventureResearch.test.ts --run || exit 1
echo "✅ All tests passed!"
EOF

# Make executable
chmod +x /mnt/c/_EHG/EHG/.git/hooks/pre-commit
```

---

## Test Execution Checklist

### Before Every Commit
- [ ] Run Tier 1 backend tests (`pytest test_deep_competitive_routing.py`)
- [ ] Run Tier 1 frontend tests (`vitest run tests/unit/ventureResearch.test.ts`)
- [ ] Verify 100% pass rate (blockers if any failures)

### Before Creating PR
- [ ] Run Tier 1 tests (must pass 100%)
- [ ] Run at least 2 Tier 2 E2E tests (TS-E2E-001, TS-E2E-002)
- [ ] Verify ≥75% Tier 2 pass rate (3/4 tests)
- [ ] Check code coverage ≥80% for new code

### Before Merging PR
- [ ] All Tier 1 tests pass in CI (GitHub Actions)
- [ ] All Tier 2 tests pass in CI
- [ ] No regressions in existing tests
- [ ] Test scenarios documented in PR description

### Before Release
- [ ] All Tier 1 + Tier 2 tests pass (100%)
- [ ] Run Tier 3 performance tests in staging
- [ ] Validate P95 SLA ≤25 min (TS-PERF-001)
- [ ] No critical bugs in test results

---

## Quick Command Reference

```bash
# Backend Unit Tests (TS-UNIT-001)
cd agent-platform && python3 -m pytest tests/test_deep_competitive_routing.py -v --no-cov

# Backend Integration Tests (TS-INT-001)
cd agent-platform && python3 -m pytest tests/test_deep_competitive_integration.py -v --no-cov

# Frontend Unit Tests (TS-UNIT-002, TS-UNIT-003)
cd ehg && npx vitest run tests/unit/ventureResearch.test.ts

# E2E Tests (TS-E2E-001 to TS-E2E-004)
cd ehg && npx playwright test tests/e2e/stage4-crewai-*.spec.ts

# Performance Tests (TS-PERF-001 to TS-PERF-004)
cd ehg && npx playwright test tests/performance/stage4-*.spec.ts

# All tests (Tier 1 + Tier 2)
cd agent-platform && python3 -m pytest tests/test_deep_competitive_*.py -v --no-cov
cd ehg && npx vitest run tests/unit/ventureResearch.test.ts
cd ehg && npx playwright test tests/e2e/stage4-crewai-*.spec.ts
```

---

**Last Updated**: 2025-11-07
**Testing Agent**: QA Engineering Director (Enhanced v2.0)
**LEO Protocol Version**: v4.3.0
