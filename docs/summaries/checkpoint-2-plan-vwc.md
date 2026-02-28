---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# SD-VWC-INTUITIVE-FLOW-001 Checkpoint 2 Planning



## Table of Contents

- [Metadata](#metadata)
- [Checkpoint 2 Scope](#checkpoint-2-scope)
  - [FR-7: Unit Tests (~5 hours)](#fr-7-unit-tests-5-hours)
  - [FR-4: WCAG 2.1 AA Accessibility (~4 hours)](#fr-4-wcag-21-aa-accessibility-4-hours)
- [User Stories](#user-stories)
  - [US-005: Adapter Unit Tests (Priority: HIGH)](#us-005-adapter-unit-tests-priority-high)
  - [US-006: Dashboard Unit Tests (Priority: HIGH)](#us-006-dashboard-unit-tests-priority-high)
  - [US-007: Keyboard Navigation (Priority: HIGH)](#us-007-keyboard-navigation-priority-high)
  - [US-008: ARIA Labels & Screen Reader Support (Priority: HIGH)](#us-008-aria-labels-screen-reader-support-priority-high)
- [Implementation Plan](#implementation-plan)
  - [Phase 1: Unit Tests (Day 1-2, 5 hours)](#phase-1-unit-tests-day-1-2-5-hours)
  - [Phase 2: Accessibility (Day 3, 4 hours)](#phase-2-accessibility-day-3-4-hours)
- [Testing Strategy](#testing-strategy)
  - [Unit Tests](#unit-tests)
  - [Accessibility Testing](#accessibility-testing)
- [Risk Assessment](#risk-assessment)
  - [Risks Identified](#risks-identified)
- [Success Criteria](#success-criteria)
  - [Checkpoint 2 Complete When:](#checkpoint-2-complete-when)
- [Dependencies](#dependencies)
  - [Prerequisites (All Met ✅)](#prerequisites-all-met-)
  - [External Dependencies](#external-dependencies)
- [Context Management](#context-management)
- [Next Steps](#next-steps)

## Metadata
- **Category**: Report
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-22
- **Tags**: database, testing, e2e, unit

**Phase**: PLAN
**Checkpoint**: 2 of 3
**Estimated Effort**: 9 hours (5h tests + 4h accessibility)
**Dependencies**: Checkpoint 1 complete (LEAD approved)

---

## Checkpoint 2 Scope

### FR-7: Unit Tests (~5 hours)
**Objective**: Achieve 80%+ test coverage for adapter and dashboard components

**Target Components**:
1. `opportunityToVentureAdapter` - 12 adapter tests
2. `OpportunitySourcingDashboard` - 7 dashboard tests

### FR-4: WCAG 2.1 AA Accessibility (~4 hours)
**Objective**: Full WCAG 2.1 AA compliance for venture wizard

**Requirements**:
1. Full keyboard navigation support
2. ARIA labels on all interactive elements
3. WAVE checker validation (0 critical errors)
4. Screen reader compatibility

---

## User Stories

### US-005: Adapter Unit Tests (Priority: HIGH)
**As a** developer
**I want** comprehensive unit tests for `opportunityToVentureAdapter`
**So that** data transformation logic is verified and regression-protected

**Acceptance Criteria**:
- [ ] 12 tests covering all transformation scenarios
- [ ] Edge cases handled (null/undefined, empty arrays, malformed data)
- [ ] Type safety verified (TypeScript assertions)
- [ ] Coverage: 90%+ for adapter module
- [ ] Tests pass in CI/CD pipeline

**Test Scenarios**:
1. Basic opportunity → venture transformation
2. Optional fields handling (category, assumptions)
3. Array field transformations (tags, stakeholders)
4. Date format conversions
5. Enum value mappings
6. Null/undefined input handling
7. Empty object handling
8. Partial data scenarios
9. Invalid data rejection
10. Default value population
11. Type coercion verification
12. Integration with venture schema

**Estimated Effort**: 3 hours

---

### US-006: Dashboard Unit Tests (Priority: HIGH)
**As a** developer
**I want** unit tests for `OpportunitySourcingDashboard` component
**So that** UI behavior and state management are verified

**Acceptance Criteria**:
- [ ] 7 tests covering critical UI scenarios
- [ ] Component rendering verified
- [ ] User interactions tested (clicks, selections)
- [ ] State management validated
- [ ] Coverage: 80%+ for dashboard component
- [ ] Tests pass in CI/CD pipeline

**Test Scenarios**:
1. Component renders with empty state
2. Component renders with opportunity data
3. Filtering functionality works correctly
4. Sorting functionality works correctly
5. Pagination controls function
6. Create venture button triggers modal
7. Error states display correctly

**Estimated Effort**: 2 hours

---

### US-007: Keyboard Navigation (Priority: HIGH)
**As a** keyboard-only user
**I want** full keyboard navigation through the venture wizard
**So that** I can complete venture creation without a mouse

**Acceptance Criteria**:
- [ ] Tab order logical and complete
- [ ] All interactive elements keyboard-accessible
- [ ] Focus indicators visible and clear
- [ ] Skip links implemented where appropriate
- [ ] No keyboard traps
- [ ] Enter/Space activate buttons
- [ ] Escape closes modals/dialogs
- [ ] Arrow keys navigate lists/menus

**Implementation Areas**:
1. VentureCreationPage: Step navigation via keyboard
2. VentureForm: All form inputs keyboard-accessible
3. ValidationPanel: Agent status cards keyboard-navigable
4. PreviewSection: Review editor keyboard-accessible
5. Tooltips: Already keyboard-accessible (Radix UI)
6. Tier selection buttons: Tab + Enter/Space
7. Archetype selector: Arrow key navigation
8. Intelligence drawer: Keyboard open/close

**Estimated Effort**: 2.5 hours

---

### US-008: ARIA Labels & Screen Reader Support (Priority: HIGH)
**As a** screen reader user
**I want** descriptive ARIA labels on all interactive elements
**So that** I understand the purpose and state of each element

**Acceptance Criteria**:
- [ ] All buttons have descriptive aria-labels
- [ ] Form fields have associated labels
- [ ] Dynamic content changes announced
- [ ] Loading states have aria-live regions
- [ ] Modal dialogs have aria-modal and aria-labelledby
- [ ] Tier buttons have aria-pressed states
- [ ] Research status has aria-busy during execution
- [ ] WAVE checker: 0 critical errors

**Implementation Areas**:
1. VentureCreationPage:
   - Progress stepper: aria-current for active step
   - Save Draft button: aria-busy during save
   - Next/Back buttons: aria-disabled when unavailable

2. VentureForm:
   - All input fields: aria-describedby for help text
   - Tier buttons: aria-pressed for selected state
   - Complexity assessment: aria-live for AI recommendation
   - Override warning: role="alert"

3. ValidationPanel:
   - Agent cards: aria-label describing agent status
   - Progress bar: aria-valuenow, aria-valuemin, aria-valuemax
   - Intelligence button: aria-expanded for drawer state

4. PreviewSection:
   - Review summary: role="region" with aria-label
   - Confirmation alert: role="alert"

**Estimated Effort**: 1.5 hours

---

## Implementation Plan

### Phase 1: Unit Tests (Day 1-2, 5 hours)

**Day 1: Adapter Tests (3 hours)**
1. Set up test file: `tests/unit/opportunityToVentureAdapter.test.ts`
2. Implement 12 test scenarios (see US-005)
3. Run tests locally and verify coverage
4. Fix any failing tests
5. Commit: `test(SD-VWC-002): Add opportunityToVentureAdapter unit tests (12 scenarios, 90%+ coverage)`

**Day 2: Dashboard Tests (2 hours)**
1. Set up test file: `tests/unit/OpportunitySourcingDashboard.test.tsx`
2. Implement 7 test scenarios (see US-006)
3. Run tests locally and verify coverage
4. Fix any failing tests
5. Commit: `test(SD-VWC-002): Add OpportunitySourcingDashboard unit tests (7 scenarios, 80%+ coverage)`

### Phase 2: Accessibility (Day 3, 4 hours)

**Day 3 Morning: Keyboard Navigation (2.5 hours)**
1. Audit current keyboard navigation (use Tab through wizard)
2. Add missing tabIndex attributes where needed
3. Implement skip links if needed
4. Test keyboard-only workflow (Idea → Research → Results → Review → Confirm)
5. Verify focus indicators visible
6. Commit: `feat(SD-VWC-002): Add keyboard navigation support to venture wizard`

**Day 3 Afternoon: ARIA Labels (1.5 hours)**
1. Audit with WAVE checker (https://wave.webaim.org/extension/)
2. Add missing aria-labels to buttons
3. Add aria-describedby to form fields
4. Implement aria-live regions for dynamic content
5. Add aria-busy, aria-pressed, aria-current as needed
6. Re-run WAVE checker: target 0 critical errors
7. Commit: `feat(SD-VWC-002): Add ARIA labels and screen reader support`

---

## Testing Strategy

### Unit Tests
- **Framework**: Vitest (already configured)
- **Coverage Target**: 80%+ overall, 90%+ for adapter
- **Run Command**: `npm run test:unit`
- **CI Integration**: Tests must pass in Pre-Merge Verification

### Accessibility Testing
- **Manual**: Keyboard-only navigation walkthrough
- **Automated**: WAVE browser extension
- **Screen Reader**: NVDA (Windows) or VoiceOver (Mac) spot check
- **CI Integration**: Consider adding axe-core automated checks

---

## Risk Assessment

### Risks Identified

**1. Adapter Test Complexity** (Medium Risk)
- **Issue**: Adapter may have complex transformation logic
- **Mitigation**: Start with simple cases, build up to complex
- **Fallback**: Focus on critical paths first, defer edge cases

**2. Dashboard Test Mocking** (Medium Risk)
- **Issue**: Component may have complex dependencies (Supabase, hooks)
- **Mitigation**: Use Vitest mocking, mock external dependencies
- **Fallback**: Focus on pure UI logic, defer integration tests

**3. Pre-existing Accessibility Issues** (Low Risk)
- **Issue**: WAVE may find pre-existing errors not related to wizard
- **Mitigation**: Focus on wizard components only, document pre-existing
- **Fallback**: Create separate SD for codebase-wide a11y (like lint issues)

**4. Keyboard Navigation Conflicts** (Low Risk)
- **Issue**: Third-party components (Radix UI) may have own keyboard handling
- **Mitigation**: Test thoroughly, leverage Radix keyboard support
- **Fallback**: Document any known limitations

---

## Success Criteria

### Checkpoint 2 Complete When:
- [ ] All 12 adapter tests implemented and passing
- [ ] All 7 dashboard tests implemented and passing
- [ ] Test coverage: 80%+ overall, 90%+ adapter
- [ ] CI/CD pipeline: All tests passing
- [ ] Keyboard navigation: Complete wizard workflow keyboard-only
- [ ] ARIA labels: All interactive elements labeled
- [ ] WAVE checker: 0 critical errors for wizard components
- [ ] Manual screen reader test: No blocking issues
- [ ] E2E tests: Still passing from Checkpoint 1
- [ ] Code committed and pushed
- [ ] EXEC→PLAN handoff created

---

## Dependencies

### Prerequisites (All Met ✅)
- ✅ Checkpoint 1 complete and LEAD approved
- ✅ TypeScript configuration working
- ✅ Vitest test runner configured
- ✅ Branch: `feat/SD-VWC-INTUITIVE-FLOW-001-...` ready

### External Dependencies
- Vitest (already installed)
- @testing-library/react (already installed)
- @testing-library/user-event (verify installed)
- WAVE browser extension (manual install)

---

## Context Management

**Current Context**: 125k / 200k tokens (62.5%)
**Estimated Addition**: +15k tokens for implementation
**Projected End**: 140k / 200k tokens (70%)

**Recommendation**: Proceed without compaction (30% buffer remaining)

---

## Next Steps

1. **PLAN Approval** (User confirms scope)
2. **Create US-005, US-006, US-007, US-008** in database
3. **Create PLAN→EXEC Handoff**
4. **Begin Implementation** (EXEC phase)
5. **Testing & Verification**
6. **EXEC→PLAN Handoff** (Checkpoint 2 complete)
7. **PLAN→LEAD Handoff** (Final approval)

---

**Estimated Timeline**: 2-3 days (9 hours total)
**Confidence**: High (80%+)
**Blockers**: None identified

---

*Planning Document Created: 2025-10-25*
*PLAN Agent: Strategic validation and scope definition*
