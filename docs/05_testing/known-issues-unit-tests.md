# Known Issues - Unit Test Failures


## Metadata
- **Category**: Testing
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-22
- **Tags**: testing, e2e, unit, feature

**Status**: 🔴 ACTIVE
**Last Updated**: 2025-11-04
**CI/CD Impact**: BLOCKING deployment
**Priority**: HIGH

---

## Overview

**5 test files** with pre-existing failures are currently blocking CI/CD pipeline. These failures existed before the recent linting/test fix session and require investigation and remediation.

**CI/CD Run**: 19065409016
**Test Files**: 5 failed | 29 passed (34 total)
**Tests**: 16+ failed | Many passed

---

## Issue 1: VentureForm.test.tsx

### Status
- **File**: `tests/unit/VentureForm.test.tsx`
- **Failures**: 1 test
- **Priority**: P1 (Medium)
- **Estimated Fix**: 15-30 minutes

### Failing Test
```
✗ VentureForm > EVA Quality Score Display > should display chairman feedback when evaValidation is provided
```

### Error Details
```
TestingLibraryElementError: Unable to find an element with the text: /ROI projection fell below 15% threshold/i
```

### Analysis
- Test expects specific text to be displayed when EVA validation is provided
- Text may have been changed or is not rendering due to missing props
- Likely a simple prop/state issue

### Recommended Fix
1. Check VentureForm component for chairman feedback display logic
2. Verify evaValidation prop structure matches test expectations
3. Update test to match current component implementation OR fix component to match test expectations

### Assigned To
- [ ] Unassigned

---

## Issue 2: evaValidation.test.ts

### Status
- **File**: `tests/unit/evaValidation.test.ts`
- **Failures**: 4 tests
- **Priority**: P0 (High - Core validation logic)
- **Estimated Fix**: 1-2 hours

### Failing Tests
```
1. ✗ EVA Validation Service > calculateEVAQualityScore > should give maximum score for a perfect idea
2. ✗ EVA Validation Service > calculateEVAQualityScore > should give low score for minimal idea
3. ✗ EVA Validation Service > calculateEVAQualityScore > should detect missing problem statement
4. ✗ EVA Validation Service > Integration Tests > should handle real-world venture idea
```

### Analysis
- Core EVA quality scoring algorithm tests failing
- May indicate:
  - Algorithm changed but tests not updated
  - Scoring thresholds changed
  - Test expectations out of date with implementation
  - Actual bug in scoring logic

### Potential Root Causes
1. **Algorithm Change**: EVA scoring logic modified in recent features
2. **Weight Distribution**: Scoring weights may have been rebalanced
3. **Missing Fields**: New required fields added that tests don't provide
4. **Validation Logic**: Changes to problem statement validation

### Recommended Fix
1. Review EVA validation service implementation (`src/services/evaValidation.ts`)
2. Compare current scoring algorithm with test expectations
3. Determine if tests need updating OR if algorithm has regression
4. Update tests to match current implementation
5. Add comprehensive test coverage for new scoring criteria

### Risk Assessment
⚠️ **HIGH RISK** - EVA quality scoring is critical for venture validation. If tests are failing due to actual bugs, ventures may be incorrectly scored in production.

### Assigned To
- [ ] Unassigned

---

## Issue 3: RecursionHistoryPanel.test.tsx

### Status
- **File**: `tests/unit/components/RecursionHistoryPanel.test.tsx`
- **Failures**: 10+ tests (multiple test suites affected)
- **Priority**: P1 (Medium - Feature-specific)
- **Estimated Fix**: 2-3 hours

### Failing Test Categories

#### 1. Rendering & Data Display (2+ tests)
```
✗ RecursionHistoryPanel > Rendering - Data Display > renders recursion events in timeline view
```

**Error**:
```
TestingLibraryElementError: Unable to find an element with the text: /showing 3 of 3 events/i
```

**Analysis**: Component may not be rendering event count summary or text has changed

---

#### 2. Statistics Display (3+ tests)
```
✗ RecursionHistoryPanel > Statistics Display > counts FIN-001 events correctly
✗ RecursionHistoryPanel > Statistics Display > counts TECH-001 events correctly
```

**Error**:
```
TestingLibraryElementError: Found multiple elements with the text: /^FIN-001$/
```

**Analysis**: Event IDs appearing in multiple places in DOM. Tests need more specific selectors.

---

#### 3. Filtering (2+ tests)
```
✗ RecursionHistoryPanel > Filtering > has filter dropdown available
```

**Analysis**: Filter UI may have changed or be conditionally rendered

---

#### 4. Sorting (2+ tests)
```
✗ RecursionHistoryPanel > Sorting > sorts by most recent by default
```

**Analysis**: Default sort order may have changed or implementation differs from test expectations

---

### Recommended Fix Strategy
1. **Phase 1**: Fix rendering tests (verify component mounts correctly)
2. **Phase 2**: Fix statistics tests (use more specific queries)
3. **Phase 3**: Fix filtering tests (verify filter UI implementation)
4. **Phase 4**: Fix sorting tests (verify sort logic)

### Component Complexity
RecursionHistoryPanel is a complex component with:
- Timeline view
- Event statistics
- Filtering by event type
- Sorting by date/severity
- Pagination

**Recommendation**: Consider breaking into smaller sub-components for easier testing

### Assigned To
- [ ] Unassigned

---

## Issue 4-5: Additional Test Files

### Status
- **Files**: 2 additional test files (names not fully detailed in CI/CD output)
- **Failures**: Unknown number of tests
- **Priority**: P2 (Lower - pending investigation)
- **Estimated Fix**: 1-2 hours

### Recommended Action
1. Run full test suite locally to identify specific test files
2. Review CI/CD logs for detailed failure messages
3. Create specific tickets for each test file

### Assigned To
- [ ] Unassigned

---

## Summary Statistics

| Test File | Failures | Priority | Est. Fix Time | Status |
|-----------|----------|----------|---------------|--------|
| VentureForm.test.tsx | 1 | P1 | 15-30 min | 🔴 Open |
| evaValidation.test.ts | 4 | P0 | 1-2 hours | 🔴 Open |
| RecursionHistoryPanel.test.tsx | 10+ | P1 | 2-3 hours | 🔴 Open |
| Unknown File 1 | ? | P2 | 30-60 min | 🔴 Open |
| Unknown File 2 | ? | P2 | 30-60 min | 🔴 Open |
| **TOTAL** | **16+** | - | **4-8 hours** | 🔴 Open |

---

## Impact Analysis

### CI/CD Pipeline Impact
- **Current Stage**: Blocked at unit tests
- **Stages Not Reached**: Integration tests, E2E tests, deployment
- **Deployment**: ⏸️ ON HOLD

### Production Risk Assessment
- **evaValidation.test.ts failures**: ⚠️ HIGH RISK (core business logic)
- **RecursionHistoryPanel.test.tsx failures**: ⚠️ MEDIUM RISK (feature-specific)
- **VentureForm.test.tsx failures**: ⚠️ LOW RISK (UI display)
- **Unknown test failures**: ⚠️ UNKNOWN RISK

### Recommendation
**DO NOT DEPLOY** until at minimum evaValidation.test.ts failures are investigated and resolved. These tests cover critical venture scoring logic.

---

## Action Plan

### Immediate (This Week)
1. [ ] **Triage**: Run tests locally to identify all failing tests
2. [ ] **Investigation**: Review evaValidation failures (HIGH PRIORITY)
3. [ ] **Quick Wins**: Fix VentureForm test (30 minutes)
4. [ ] **GitHub Issues**: Create issues for each failing test file

### Short-Term (Next Sprint)
5. [ ] **Fix P0**: Resolve evaValidation.test.ts failures (1-2 hours)
6. [ ] **Fix P1**: Resolve RecursionHistoryPanel.test.tsx failures (2-3 hours)
7. [ ] **Fix P2**: Resolve remaining test failures (1-2 hours)
8. [ ] **Verification**: Run full test suite and verify CI/CD passes

### Long-Term (Future Sprints)
9. [ ] **Test Infrastructure**: Improve test setup (context providers, mocks)
10. [ ] **Test Coverage**: Add missing test coverage
11. [ ] **CI/CD Gates**: Prevent tests from breaking in future

---

## Investigation Commands

### Run Tests Locally
```bash
# Run all unit tests
cd /mnt/c/_EHG/EHG
npm run test:unit

# Run specific test file
npx vitest run tests/unit/evaValidation.test.ts --reporter=verbose

# Run with coverage
npm run test:unit -- --coverage

# Watch mode for iterative fixing
npx vitest tests/unit/evaValidation.test.ts
```

### Check CI/CD Logs
```bash
# View latest CI/CD run
gh run list --workflow="CI/CD Pipeline" --limit 1

# View detailed logs
gh run view 19065409016 --log

# View only failures
gh run view 19065409016 --log-failed
```

---

## Related Documentation

- **Session Summary**: `/docs/ci-cd-fixes-session-summary.md`
- **Linting Fixes**: `/docs/linting-fixes-summary.md`
- **SD Completion**: `/docs/SD-VENTURE-UNIFICATION-001-completion-summary.md`

---

## Notes for Developers

### Before Starting Fixes
1. ✅ Pull latest changes from main
2. ✅ Run tests locally to reproduce failures
3. ✅ Review component implementation before updating tests
4. ✅ Determine if test or implementation needs fixing

### While Fixing
- Use `npx vitest [file] --reporter=verbose` for detailed output
- Check CI/CD logs for exact error messages
- Update tests AND implementation if both are wrong
- Add missing test coverage while you're at it

### After Fixing
- ✅ Run full test suite locally (`npm run test:unit`)
- ✅ Verify CI/CD passes
- ✅ Update this document with fix details
- ✅ Close related GitHub issue

---

## Change Log

| Date | Action | Details |
|------|--------|---------|
| 2025-11-04 | Created | Initial documentation of 5 known test failures |

---

**Last CI/CD Run**: 19065409016 (2025-11-04 10:20:45)
**Last Updated By**: Claude (LEO Protocol v4.3.0)
**Status**: 🔴 ACTIVE - 5 test files failing, blocking deployment
