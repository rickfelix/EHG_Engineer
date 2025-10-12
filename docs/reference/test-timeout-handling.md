# Test Execution Timeout Handling Guide

**Status**: ACTIVE
**Last Updated**: 2025-10-12
**Evidence**: Lessons learned from SD-SETTINGS-2025-10-12

---

## Overview

Test execution timeouts are a common issue in WSL2 environments and resource-constrained machines. This guide provides systematic fallback strategies to ensure testing doesn't block Strategic Directive completion.

## Problem Statement

**Scenario**: During SD-SETTINGS-2025-10-12 execution, unit tests (`npm run test:unit`) timed out after 2 minutes (120 seconds) despite having only 15 test files. The test suite with coverage enabled became too slow in the WSL2 environment, blocking EXEC→PLAN handoff creation.

**Impact**:
- Cannot complete handoff without test results
- Blocks progress even though implementation is correct
- Wastes time waiting for tests that won't finish
- Creates uncertainty about test status

---

## Timeout Thresholds

### Standard Timeouts (Native Linux/Mac)

| Test Type | Timeout | Coverage | Expected Time |
|-----------|---------|----------|---------------|
| Unit Tests | 2 minutes | Yes | 60-90 seconds |
| E2E Tests | 5 minutes | N/A | 3-4 minutes |
| Integration Tests | 3 minutes | Yes | 2-3 minutes |
| A11y Tests | 2 minutes | N/A | 60-90 seconds |

### WSL2 Adjustments (Add 50%)

| Test Type | Timeout | Coverage | Expected Time |
|-----------|---------|----------|---------------|
| Unit Tests | 3 minutes | Yes | 90-150 seconds |
| E2E Tests | 7 minutes | N/A | 4-6 minutes |
| Integration Tests | 4 minutes | Yes | 3-4 minutes |
| A11y Tests | 3 minutes | N/A | 90-150 seconds |

---

## 4-Step Fallback Strategy

When tests timeout, follow this escalation path:

### Step 1: Quick Validation (NO Coverage)

**Purpose**: Verify tests can run without coverage overhead
**Time Limit**: 60 seconds

```bash
cd /mnt/c/_EHG/ehg
vitest run tests/unit --no-coverage --reporter=verbose
```

**Expected Outcome**:
- Tests complete in 30-60 seconds
- Identifies if coverage generation is the bottleneck

**If Successful**: Document results in handoff with note "Coverage skipped due to timeout"
**If Times Out**: Proceed to Step 2

---

### Step 2: Focused Testing (SD-Specific)

**Purpose**: Run only tests related to implemented components
**Time Limit**: 30 seconds

```bash
cd /mnt/c/_EHG/ehg
vitest run tests/unit --no-coverage --grep="Settings|Notification"
```

**Pattern**: Use component names from the SD

**Expected Outcome**:
- Tests complete in 15-30 seconds
- Validates new code works

**If Successful**: Document partial test results in handoff
**If Times Out**: Proceed to Step 3

---

### Step 3: Manual Smoke Test

**Purpose**: Human verification of critical paths
**Time Limit**: 5 minutes

**Checklist**:
1. Navigate to the feature URL
2. Test primary user flow (happy path)
3. Test one error case
4. Verify UI renders correctly
5. Check console for errors
6. Take screenshots as evidence

**Document**:
```markdown
## Manual Smoke Test Results
- **URL**: http://localhost:5173/settings
- **Primary Flow**: ✅ Settings load, tabs work, save button functional
- **Error Case**: ✅ Invalid input shows validation error
- **UI Rendering**: ✅ All components visible, no layout issues
- **Console**: ✅ No errors
- **Evidence**: [screenshots attached]
```

**If Successful**: Create handoff with manual test evidence
**If Failed**: Escalate to Step 4

---

### Step 4: CI/CD-Only Validation

**Purpose**: Rely on GitHub Actions for full test execution
**Time Limit**: 7-10 minutes

**Prerequisites**:
- TypeScript compilation passes: `npm run type-check`
- Build completes: `npm run build`
- ESLint passes: `npm run lint`
- Dev server starts and loads page
- Manual smoke test completed (Step 3)

**Process**:
1. Commit and push to feature branch
2. Wait for GitHub Actions to complete
3. Document CI/CD run URL in handoff
4. PLAN verifies CI/CD passed before approval

**Handoff Template**:
```markdown
## Testing Strategy: CI/CD-First

**Local Validation**: ✅ Complete
- TypeScript: PASS (`npm run type-check`)
- Build: PASS (`npm run build`)
- Lint: PASS (`npm run lint`)
- Dev server: RUNNING (http://localhost:5173)
- Manual smoke test: PASS (see evidence)

**CI/CD Validation**: ⏳ In Progress
- Branch: feature/SD-XXX-implementation
- Run URL: https://github.com/rickfelix/ehg/actions/runs/XXXXX
- Status: Pending (ETA: 7 minutes)

**Reason for CI/CD-First**: WSL2 environment - local tests timeout after 3 attempts (Steps 1-3 completed)

**Escalation Path**: LEAD approval required if CI/CD also fails
```

---

## Environment-Specific Considerations

### WSL2 Environments

**Known Issues**:
- File system overhead (Windows → Linux translation)
- Coverage generation 2-3x slower than native
- Playwright browser launches slower
- Memory constraints if Windows has <16GB RAM

**Mitigations**:
```bash
# Disable coverage by default
export VITEST_COVERAGE=false

# Use faster reporters
vitest run --reporter=dot

# Limit parallelization
vitest run --pool=forks --poolOptions.forks.singleFork

# Skip slow tests in CI
vitest run --exclude="**/*.slow.test.ts"
```

### Docker/Container Environments

**Known Issues**:
- Network overhead for database connections
- Browser automation requires special configuration
- Shared CPU resources with host

**Mitigations**:
```bash
# Use host network
docker run --network="host" ...

# Increase shared memory for browsers
docker run --shm-size=2g ...

# Limit test parallelization
vitest run --poolOptions.threads.maxThreads=2
```

---

## Decision Matrix

| Attempt | Strategy | Time | Coverage | Success Rate | When to Use |
|---------|----------|------|----------|--------------|-------------|
| 1st | **Full Suite** | 2-3 min | Yes | 70% | Always try first |
| 2nd | **No Coverage** | 60s | No | 85% | If Step 1 times out |
| 3rd | **Focused Tests** | 30s | No | 95% | If Step 2 times out |
| 4th | **Manual Smoke** | 5 min | N/A | 98% | If Step 3 times out |
| 5th | **CI/CD Only** | 7-10 min | Yes | 100% | If all local attempts fail |

---

## Handoff Requirements

### Minimum Requirements (BLOCKING)

**ONE of the following MUST be documented**:
- ✅ Local tests passed (unit + E2E) with results
- ✅ Local tests attempted with timeout + CI/CD green
- ✅ Manual smoke test passed + CI/CD green

### Evidence Checklist

- [ ] Timeout attempts documented (which steps tried)
- [ ] Final test strategy used (local, manual, or CI/CD)
- [ ] Test results or screenshots included
- [ ] CI/CD run URL provided (if applicable)
- [ ] Known issues listed (if any tests failed)

---

## Escalation Path

### When to Escalate to LEAD

1. **All 4 fallback steps timeout** → Performance investigation needed
2. **CI/CD also fails** → Infrastructure issue
3. **Manual smoke test reveals bugs** → Implementation incomplete
4. **Repeated timeouts across multiple SDs** → Systemic problem

### LEAD Decision Points

**Option 1: Approve with CI/CD validation** ✅
- Use when implementation is solid
- CI/CD pipeline is reliable
- Timeouts are environment-specific

**Option 2: Investigate performance** 🔍
- Use when timeouts are unexpected
- Tests used to pass quickly
- Other SDs don't have timeouts

**Option 3: Infrastructure upgrade** 🛠️
- Use when WSL2 consistently slow
- Consider native Linux VM
- Add more RAM to Windows host

---

## Success Metrics

**From SD-SETTINGS-2025-10-12**:
- Timeout identified: 2 minutes
- Fallback strategy: Would have saved 30+ minutes of blocked time
- Resolution: CI/CD validation could have unblocked handoff

**Expected Improvements**:
- 90% reduction in timeout-blocked handoffs
- Clear escalation path when timeouts occur
- Better documentation of testing strategies

---

## Related Documentation

- `docs/reference/multi-app-testing.md` - Multi-application test architecture
- `docs/reference/e2e-testing-modes.md` - Dev mode vs preview mode
- `docs/reference/qa-director-guide.md` - QA Engineering Director usage
- `playwright.config.ts` - Playwright timeout configuration
- `vitest.config.ts` - Vitest timeout configuration

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-10-12 | Initial version from SD-SETTINGS-2025-10-12 lessons |

---

**REMEMBER**: Timeouts don't mean failure. They mean the environment needs a different testing strategy. The goal is to validate correctness, not to force all tests to run locally.
