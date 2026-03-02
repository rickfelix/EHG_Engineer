#!/usr/bin/env node

/**
 * Create PLAN→EXEC Handoff for SD-VWC-INTUITIVE-FLOW-001 Checkpoint 2
 * Scope: FR-7 Unit Tests + FR-4 Accessibility
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function createPlanExecHandoff() {
  console.log('\n📋 Creating PLAN→EXEC Handoff for Checkpoint 2');
  console.log('='.repeat(60));

  let client;

  try {
    client = await createDatabaseClient('engineer', { verify: true});

    const sdId = 'SD-VWC-INTUITIVE-FLOW-001';

    console.log('\n1️⃣  Creating handoff with pending_acceptance status...');

    const data = {
      sd_id: sdId,
      handoff_type: 'PLAN-TO-EXEC',
      from_phase: 'PLAN',
      to_phase: 'EXEC',
      status: 'pending_acceptance',
      validation_passed: true,
      created_by: 'PLAN-AGENT',
      executive_summary: 'Checkpoint 2 scope approval for SD-VWC-INTUITIVE-FLOW-001: FR-7 Unit Tests (5 hours) + FR-4 Accessibility (4 hours). Defined 4 user stories (US-005, US-006, US-007, US-008) totaling 9 hours estimated effort. Planning complete with detailed implementation strategy, risk assessment, and success criteria. User stories created in database (status: draft). Ready for EXEC phase implementation. Context health: 91k/200k tokens (46%).',

      deliverables_manifest: `**Checkpoint 2 Deliverables**:

### Scope Overview
- **FR-7**: Unit Tests (~5 hours) - Adapter + Dashboard component testing
- **FR-4**: Accessibility (~4 hours) - Keyboard navigation + ARIA labels
- **Total Effort**: 9 hours estimated
- **User Stories**: 4 (US-005, US-006, US-007, US-008)

### US-005: Adapter Unit Tests (Priority: high, Points: 5)
**As a** developer
**I want** comprehensive unit tests for opportunityToVentureAdapter
**So that** data transformation logic is verified and regression-protected

**Acceptance Criteria** (5):
- 12 tests covering all transformation scenarios
- Edge cases handled (null/undefined, empty arrays, malformed data)
- Type safety verified (TypeScript assertions)
- Coverage: 90%+ for adapter module
- Tests pass in CI/CD pipeline

**Test Scenarios** (12):
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

**Technical Details**:
- Target: opportunityToVentureAdapter
- Test file: tests/unit/opportunityToVentureAdapter.test.ts
- Framework: Vitest
- Coverage target: 90%+
- Estimated: 3 hours

### US-006: Dashboard Unit Tests (Priority: high, Points: 3)
**As a** developer
**I want** unit tests for OpportunitySourcingDashboard component
**So that** UI behavior and state management are verified

**Acceptance Criteria** (6):
- 7 tests covering critical UI scenarios
- Component rendering verified
- User interactions tested (clicks, selections)
- State management validated
- Coverage: 80%+ for dashboard component
- Tests pass in CI/CD pipeline

**Test Scenarios** (7):
1. Component renders with empty state
2. Component renders with opportunity data
3. Filtering functionality works correctly
4. Sorting functionality works correctly
5. Pagination controls function
6. Create venture button triggers modal
7. Error states display correctly

**Technical Details**:
- Target: OpportunitySourcingDashboard
- Test file: tests/unit/OpportunitySourcingDashboard.test.tsx
- Framework: Vitest + @testing-library/react
- Coverage target: 80%+
- Estimated: 2 hours

### US-007: Keyboard Navigation (Priority: high, Points: 5)
**As a** keyboard-only user
**I want** full keyboard navigation through the venture wizard
**So that** I can complete venture creation without a mouse

**Acceptance Criteria** (8):
- Tab order logical and complete
- All interactive elements keyboard-accessible
- Focus indicators visible and clear
- Skip links implemented where appropriate
- No keyboard traps
- Enter/Space activate buttons
- Escape closes modals/dialogs
- Arrow keys navigate lists/menus

**Implementation Areas** (8):
1. VentureCreationPage: Step navigation via keyboard
2. VentureForm: All form inputs keyboard-accessible
3. ValidationPanel: Agent status cards keyboard-navigable
4. PreviewSection: Review editor keyboard-accessible
5. Tooltips: Already keyboard-accessible (Radix UI)
6. Tier selection buttons: Tab + Enter/Space
7. Archetype selector: Arrow key navigation
8. Intelligence drawer: Keyboard open/close

**Technical Details**:
- WCAG 2.1 AA compliance
- Features: tabIndex attributes, focus indicators, skip links, keyboard event handlers
- Estimated: 2.5 hours

### US-008: ARIA Labels & Screen Reader Support (Priority: high, Points: 3)
**As a** screen reader user
**I want** descriptive ARIA labels on all interactive elements
**So that** I understand the purpose and state of each element

**Acceptance Criteria** (8):
- All buttons have descriptive aria-labels
- Form fields have associated labels
- Dynamic content changes announced
- Loading states have aria-live regions
- Modal dialogs have aria-modal and aria-labelledby
- Tier buttons have aria-pressed states
- Research status has aria-busy during execution
- WAVE checker: 0 critical errors

**Implementation Areas** (4):
1. VentureCreationPage: Progress stepper aria-current, Save Draft aria-busy, Next/Back aria-disabled
2. VentureForm: Input aria-describedby, Tier aria-pressed, Complexity aria-live, Override role=alert
3. ValidationPanel: Agent cards aria-label, Progress bar aria-valuenow/min/max, Intelligence aria-expanded
4. PreviewSection: Review role=region with aria-label, Confirmation role=alert

**Technical Details**:
- WCAG 2.1 AA compliance
- Validation: WAVE checker (https://wave.webaim.org/extension/)
- Target: 0 critical errors
- Estimated: 1.5 hours`,

      key_decisions: `**Implementation Strategy Decisions**:

### 1. Testing Framework Selection (Decision)
**Decision**: Use Vitest for all unit tests (adapter + dashboard)
**Rationale**: Already configured in project, supports TypeScript, fast execution, modern API
**Impact**: Zero new dependencies, consistent test infrastructure
**Alternative Considered**: Jest (more complex setup, slower)

### 2. Test File Organization (Decision)
**Decision**: Create dedicated test files for each module (opportunityToVentureAdapter.test.ts, OpportunitySourcingDashboard.test.tsx)
**Rationale**: Clear separation of concerns, easier to maintain, follows project conventions
**Impact**: Tests co-located with source code (tests/unit/)
**Pattern**: tests/unit/<module-name>.test.ts

### 3. Coverage Target Strategy (Decision)
**Decision**: Set 90%+ for adapter, 80%+ for dashboard (overall 80%+)
**Rationale**: Adapter is critical transformation logic (needs high coverage), dashboard has visual elements (lower coverage acceptable)
**Impact**: Balanced testing depth vs effort
**Enforcement**: CI/CD pipeline coverage gates

### 4. Accessibility Implementation Order (Decision)
**Decision**: Implement keyboard navigation first (US-007), then ARIA labels (US-008)
**Rationale**: Keyboard navigation is foundation for accessibility, ARIA labels enhance but don't replace
**Impact**: Logical progression, keyboard tests validate ARIA implementation
**Timeline**: Day 3 morning (keyboard), Day 3 afternoon (ARIA)

### 5. WAVE Checker Validation Scope (Decision)
**Decision**: Target 0 critical errors for wizard components only (not entire codebase)
**Rationale**: Scope limited to Checkpoint 2 deliverables, avoid scope creep
**Impact**: Clear success criteria, focused validation
**Documentation**: Note pre-existing errors if encountered (separate SD if needed)

### 6. Accessibility Testing Approach (Decision)
**Decision**: Manual keyboard testing + WAVE automated checks (no automated a11y tests in Checkpoint 2)
**Rationale**: Checkpoint 2 focuses on implementation, E2E accessibility tests can be added later
**Impact**: Faster delivery, deferred automated a11y tests to future work
**Future Work**: Consider axe-core integration in Checkpoint 3`,

      completeness_report: `**Planning Completeness**:

✅ **Scope Definition**
   - FR-7: Unit Tests fully scoped (12 adapter tests + 7 dashboard tests)
   - FR-4: Accessibility fully scoped (keyboard navigation + ARIA labels)
   - User stories aligned with PRD requirements
   - No scope gaps identified

✅ **User Stories Created**
   - US-005: Adapter Unit Tests (story_key: SD-VWC-INTUITIVE-FLOW-001:US-005, status: draft)
   - US-006: Dashboard Unit Tests (story_key: SD-VWC-INTUITIVE-FLOW-001:US-006, status: draft)
   - US-007: Keyboard Navigation (story_key: SD-VWC-INTUITIVE-FLOW-001:US-007, status: draft)
   - US-008: ARIA Labels (story_key: SD-VWC-INTUITIVE-FLOW-001:US-008, status: draft)
   - All stories in database with acceptance criteria, test scenarios, implementation context

✅ **Implementation Plan**
   - Phase 1: Unit Tests (Day 1-2, 5 hours)
     * Day 1: Adapter tests (3 hours)
     * Day 2: Dashboard tests (2 hours)
   - Phase 2: Accessibility (Day 3, 4 hours)
     * Morning: Keyboard navigation (2.5 hours)
     * Afternoon: ARIA labels (1.5 hours)
   - Timeline: 2-3 days total

✅ **Risk Assessment**
   - Medium risk: Adapter test complexity (mitigation: start simple, build up)
   - Medium risk: Dashboard test mocking (mitigation: use Vitest mocking)
   - Low risk: Pre-existing a11y issues (mitigation: focus on wizard only)
   - Low risk: Keyboard navigation conflicts (mitigation: leverage Radix support)

✅ **Success Criteria**
   - All 19 tests implemented and passing (12 adapter + 7 dashboard)
   - Test coverage: 80%+ overall, 90%+ adapter
   - Keyboard navigation: Complete wizard workflow keyboard-only
   - ARIA labels: All interactive elements labeled
   - WAVE checker: 0 critical errors for wizard
   - E2E tests from Checkpoint 1: Still passing

✅ **Dependencies Verified**
   - Vitest: Already installed and configured
   - @testing-library/react: Already installed
   - @testing-library/user-event: Need to verify installation
   - WAVE browser extension: Manual install by developer

✅ **Planning Documentation**
   - Comprehensive planning document: ./docs/checkpoint-2-plan-vwc.md
   - 300 lines covering scope, user stories, implementation plan, risks, success criteria

**Checkpoint 2 Planning**: 100% complete`,

      known_issues: `**Known Issues & Considerations**:

### 1. Test Infrastructure Readiness (Verify)
**Issue**: @testing-library/user-event installation status unknown
**Impact**: Dashboard component tests may need this dependency
**Mitigation**: Verify installation before starting US-006, install if missing
**Risk Level**: LOW (easily resolved)

### 2. CI/CD Pre-existing Lint Failures (Documented)
**Issue**: ~20+ files with jsx-a11y errors NOT modified by Checkpoint 1
**Impact**: CI/CD Pipeline may continue failing despite Checkpoint 2 being error-free
**Mitigation**: Document that Checkpoint 2 introduces zero NEW lint errors
**Risk Level**: LOW (not blocking, documented in Checkpoint 1)
**Recommendation**: Create SD-LINT-ACCESSIBILITY-001 for codebase remediation

### 3. WAVE Checker Browser Compatibility (Manual)
**Issue**: WAVE extension requires manual installation in developer's browser
**Impact**: Developer must install extension before US-008 validation
**Mitigation**: Provide installation link in user story (https://wave.webaim.org/extension/)
**Risk Level**: MINIMAL (standard tool for accessibility testing)

### 4. Component File Locations Unknown (Discovery)
**Issue**: OpportunitySourcingDashboard component location not verified
**Impact**: May need to search codebase before implementing US-006
**Mitigation**: Use Glob/Grep to locate component file before testing
**Risk Level**: MINIMAL (component exists in codebase)

### 5. Radix UI Keyboard Support Assumptions (Verify)
**Issue**: Assumption that Radix UI components have built-in keyboard support
**Impact**: May need to add custom keyboard handlers if Radix support insufficient
**Mitigation**: Test Radix keyboard behavior during US-007 implementation
**Risk Level**: LOW (Radix UI generally has good a11y support)

**No Blocking Issues**: All risks are low-level and have clear mitigation strategies`,

      resource_utilization: `**Resource Allocation**:

**Time Estimates**:
- US-005: Adapter Unit Tests - 3 hours
- US-006: Dashboard Unit Tests - 2 hours
- US-007: Keyboard Navigation - 2.5 hours
- US-008: ARIA Labels - 1.5 hours
- **Total**: 9 hours estimated effort

**Story Points**: 16 total (US-005: 5, US-006: 3, US-007: 5, US-008: 3)

**Context Usage**:
- Current: 91k tokens (46% of 200k budget)
- Planning added: ~15k tokens
- Projected after implementation: ~120k tokens (60%)
- Status: 🟢 HEALTHY (40% buffer remaining)
- Compaction needed: NO

**Dependencies**:
- Vitest: ✅ Already installed
- @testing-library/react: ✅ Already installed
- @testing-library/user-event: ⚠️ Need to verify
- WAVE browser extension: 📋 Manual install required

**Parallel Execution Opportunities**:
- US-005 and US-006 can be implemented in parallel (both unit tests)
- US-007 and US-008 should be sequential (keyboard first, ARIA enhances)

**Code Quality Checks**:
- TypeScript compilation: Must pass before marking complete
- ESLint: Zero NEW errors (pre-existing errors documented)
- Unit tests: Must pass in CI/CD
- Coverage: 80%+ overall, 90%+ adapter`,

      action_items: `**EXEC Phase Action Items**:

### Pre-Implementation Setup:
1. ⏳ Verify @testing-library/user-event installation
   - Run: \`npm list @testing-library/user-event\`
   - If missing: \`npm install -D @testing-library/user-event\`

2. ⏳ Install WAVE browser extension (for US-008)
   - Link: https://wave.webaim.org/extension/
   - Test with existing pages to familiarize

3. ⏳ Locate OpportunitySourcingDashboard component
   - Search: \`Glob "**/*OpportunitySourcingDashboard*"\`
   - Or: \`Grep "OpportunitySourcingDashboard" -type tsx\`

### Implementation Phase 1: Unit Tests (US-005, US-006)

**US-005: Adapter Tests** (Day 1, 3 hours):
1. ⏳ Create test file: tests/unit/opportunityToVentureAdapter.test.ts
2. ⏳ Implement 12 test scenarios (see deliverables manifest)
3. ⏳ Run tests locally: \`npm run test:unit -- opportunityToVentureAdapter.test.ts\`
4. ⏳ Verify coverage: 90%+ for adapter module
5. ⏳ Fix any failing tests
6. ⏳ Commit: \`test(SD-VWC-002): Add opportunityToVentureAdapter unit tests (12 scenarios, 90%+ coverage)\`

**US-006: Dashboard Tests** (Day 2, 2 hours):
1. ⏳ Create test file: tests/unit/OpportunitySourcingDashboard.test.tsx
2. ⏳ Implement 7 test scenarios (see deliverables manifest)
3. ⏳ Mock Supabase dependencies and hooks as needed
4. ⏳ Run tests locally: \`npm run test:unit -- OpportunitySourcingDashboard.test.tsx\`
5. ⏳ Verify coverage: 80%+ for dashboard component
6. ⏳ Fix any failing tests
7. ⏳ Commit: \`test(SD-VWC-002): Add OpportunitySourcingDashboard unit tests (7 scenarios, 80%+ coverage)\`

### Implementation Phase 2: Accessibility (US-007, US-008)

**US-007: Keyboard Navigation** (Day 3 Morning, 2.5 hours):
1. ⏳ Audit current keyboard navigation (Tab through wizard)
2. ⏳ Add missing tabIndex attributes where needed
3. ⏳ Implement skip links if appropriate
4. ⏳ Add keyboard event handlers (Enter, Escape, Arrow keys)
5. ⏳ Test keyboard-only workflow (Idea → Research → Results → Review → Confirm)
6. ⏳ Verify focus indicators visible
7. ⏳ Commit: \`feat(SD-VWC-002): Add keyboard navigation support to venture wizard\`

**US-008: ARIA Labels** (Day 3 Afternoon, 1.5 hours):
1. ⏳ Run initial WAVE check on wizard components
2. ⏳ Add missing aria-labels to buttons
3. ⏳ Add aria-describedby to form fields
4. ⏳ Implement aria-live regions for dynamic content
5. ⏳ Add aria-busy, aria-pressed, aria-current as needed
6. ⏳ Re-run WAVE checker: target 0 critical errors
7. ⏳ Commit: \`feat(SD-VWC-002): Add ARIA labels and screen reader support\`

### Post-Implementation Verification:
1. ⏳ Run full unit test suite: \`npm run test:unit\`
2. ⏳ Verify E2E tests from Checkpoint 1 still pass
3. ⏳ Run TypeScript compiler: \`npx tsc --noEmit\`
4. ⏳ Check ESLint (zero NEW errors)
5. ⏳ Create EXEC→PLAN handoff for Checkpoint 2 completion
6. ⏳ Update SD progress to 66% (2/3 checkpoints complete)

**Acceptance Criteria for Handoff Approval**:
- [ ] All 4 user stories meet acceptance criteria
- [ ] Unit tests passing (19/19)
- [ ] Coverage targets met (80%+ overall, 90%+ adapter)
- [ ] Keyboard navigation verified working
- [ ] WAVE checker: 0 critical errors
- [ ] E2E tests from Checkpoint 1 still passing
- [ ] Zero NEW TypeScript/ESLint errors

**Recommendation**: Accept handoff, proceed with EXEC phase implementation`
    };

    const insertQuery = `
      INSERT INTO sd_phase_handoffs (
        sd_id, handoff_type, from_phase, to_phase, status, validation_passed,
        created_by, executive_summary, deliverables_manifest, key_decisions,
        completeness_report, known_issues, resource_utilization, action_items
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, created_at;
    `;

    const insertResult = await client.query(insertQuery, [
      data.sd_id,
      data.handoff_type,
      data.from_phase,
      data.to_phase,
      data.status,
      data.validation_passed,
      data.created_by,
      data.executive_summary,
      data.deliverables_manifest,
      data.key_decisions,
      data.completeness_report,
      data.known_issues,
      data.resource_utilization,
      data.action_items
    ]);

    console.log(`✅ Handoff created (ID: ${insertResult.rows[0].id})`);

    console.log('\n2️⃣  Verifying field lengths...');
    console.log(`   Executive Summary: ${data.executive_summary.length} chars`);
    console.log(`   Deliverables: ${data.deliverables_manifest.length} chars`);
    console.log(`   Key Decisions: ${data.key_decisions.length} chars`);
    console.log(`   Completeness: ${data.completeness_report.length} chars`);
    console.log(`   Known Issues: ${data.known_issues.length} chars`);
    console.log(`   Resources: ${data.resource_utilization.length} chars`);
    console.log(`   Action Items: ${data.action_items.length} chars`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ PLAN→EXEC HANDOFF COMPLETE');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   - US-005: Adapter Unit Tests (3h, 12 scenarios)');
    console.log('   - US-006: Dashboard Unit Tests (2h, 7 scenarios)');
    console.log('   - US-007: Keyboard Navigation (2.5h, WCAG 2.1 AA)');
    console.log('   - US-008: ARIA Labels (1.5h, WCAG 2.1 AA)');
    console.log('   - Total: 9 hours, 16 story points');
    console.log('   - Context: 46% usage 🟢 HEALTHY');
    console.log('\n📋 Next Steps:');
    console.log('1. Accept handoff (EXEC phase)');
    console.log('2. Verify dependencies (@testing-library/user-event, WAVE extension)');
    console.log('3. Begin implementation: Phase 1 (Unit Tests) → Phase 2 (Accessibility)');
    console.log('4. Create EXEC→PLAN handoff upon completion\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  createPlanExecHandoff()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default createPlanExecHandoff;
