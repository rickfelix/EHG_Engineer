#!/usr/bin/env node

/**
 * Create PRD for SD-TEST-MOCK-001
 * Standardize Venture Workflow Mock Mode Testing
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-TEST-MOCK-001');
  console.log('================================================================\n');

  const prdId = 'PRD-SD-TEST-MOCK-001';
  const sdId = 'SD-TEST-MOCK-001';

  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prd = {
    id: prdId,
    directive_id: sdId,
    title: 'Standardize Venture Workflow Mock Mode Testing',
    version: '1.0',
    status: 'planning',
    category: 'testing',
    priority: 'high',

    executive_summary: 'This PRD defines the technical requirements for standardizing mock mode testing patterns across venture workflow E2E tests. The implementation will add mock handlers to 3 test files, create test pattern documentation, and ensure 100% test pass rate in both Playwright projects (mock and flags-on).',

    plan_checklist: [
      { text: 'PRD created and saved', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'Resource requirements estimated', checked: true },
      { text: 'Timeline and milestones set', checked: true },
      { text: 'Risk assessment completed', checked: true }
    ],

    exec_checklist: [
      { text: 'Add mock handler to ventures-authenticated.spec.ts', checked: false },
      { text: 'Add mock handler to ventures-crud.spec.ts', checked: false },
      { text: 'Add mock handler to new-venture.spec.ts', checked: false },
      { text: 'Create docs/testing/mock-handler-patterns.md', checked: false },
      { text: 'Update tests/README.md with project requirements', checked: false },
      { text: 'Run tests in mock project - verify 100% pass', checked: false },
      { text: 'Run tests in flags-on project - verify 100% pass', checked: false },
      { text: 'Code review completed', checked: false }
    ],

    validation_checklist: [
      { text: 'All 3 test files have explicit mock handlers', checked: false },
      { text: 'Tests pass in mock project (npx playwright test --project=mock)', checked: false },
      { text: 'Tests pass in flags-on project (npx playwright test --project=flags-on)', checked: false },
      { text: 'Documentation complete and reviewed', checked: false },
      { text: 'Zero test failures due to missing mocks', checked: false },
      { text: 'CI/CD pipeline green for both projects', checked: false }
    ],

    progress: 50,
    phase: 'planning',
    created_by: 'PLAN',

    content: `# Product Requirements Document
# PRD-SD-TEST-MOCK-001

## Strategic Directive
SD-TEST-MOCK-001: Standardize Venture Workflow Mock Mode Testing

## Status
Planning → Ready for EXEC

## Executive Summary
This PRD defines the technical requirements for standardizing mock mode testing patterns across venture workflow E2E tests in the EHG application. The implementation will add explicit mock handlers to 3 test files that currently lack them, create comprehensive test pattern documentation, and ensure 100% test pass rate in both Playwright projects (mock and flags-on).

---

## Functional Requirements

### FR-1: Add Mock Handlers to ventures-authenticated.spec.ts
**Description**: Add \`page.route()\` mock handler to intercept venture API calls
**Files Modified**: \`tests/dev/ventures-authenticated.spec.ts\`
**Pattern**: Copy from \`ventures.spec.ts:7-23\`
**Mock Endpoint**: \`**/api/ventures**\`
**Mock Response**: Array of 10 test ventures with realistic data
**Estimated Lines**: ~20 lines

### FR-2: Add Mock Handlers to ventures-crud.spec.ts
**Description**: Add \`page.route()\` mock handlers for CRUD operations
**Files Modified**: \`tests/dev/ventures-crud.spec.ts\`
**Pattern**: Copy from \`ventures.spec.ts:7-23\`
**Mock Endpoints**:
- \`**/api/ventures**\` (GET - list)
- \`**/api/ventures\` (POST - create)
- \`**/api/ventures/*\` (PUT - update)
- \`**/api/ventures/*\` (DELETE - delete)
**Estimated Lines**: ~40 lines (multiple endpoints)

### FR-3: Add Mock Handlers to new-venture.spec.ts
**Description**: Add \`page.route()\` mock handler for venture creation flow
**Files Modified**: \`tests/e2e/new-venture.spec.ts\`
**Pattern**: Copy from \`ventures.spec.ts:7-23\`
**Mock Endpoint**: \`**/api/ventures\` (POST)
**Mock Response**: Success response with generated venture ID
**Estimated Lines**: ~20 lines

### FR-4: Create Test Pattern Documentation
**Description**: Document three standardized test patterns
**Files Created**: \`docs/testing/mock-handler-patterns.md\`
**Content**:
- Pattern A: Basic Mock Handler (ventures.spec.ts example)
- Pattern B: Feature Flag Check (calibration.spec.ts example)
- Pattern C: Authenticated Tests (skip in mock mode)
**Estimated Lines**: ~150-200 lines markdown

### FR-5: Update Test README
**Description**: Add Playwright project requirements matrix
**Files Modified**: \`tests/README.md\`
**Content**: Table showing which tests run in which projects
**Estimated Lines**: ~30 lines

---

## Technical Requirements

### TR-1: Mock Handler Pattern
**Reference Implementation**: \`tests/e2e/ventures.spec.ts:7-23\`

\`\`\`typescript
test.beforeEach(async ({ page }) => {
  // Mock ventures API with test data
  await page.route('**/api/ventures**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ventures: Array(20).fill(null).map((_, i) => ({
          id: \`venture-\${i}\`,
          name: \`Test Venture \${i + 1}\`,
          stage: ['ideation', 'validation', 'growth', 'scale'][i % 4],
          milestone: ['M1', 'M2', 'M3', 'M4', 'M5'][i % 5],
          status: ['on-track', 'at-risk', 'blocked'][i % 3],
          attention_score: Math.random() * 100,
          created_at: new Date().toISOString()
        }))
      sd_uuid: sdUuid, // FIX: Added for handoff validation
      })
    });
  });

  await page.goto('/ventures');
  await waitForPageReady(page);
});
\`\`\`

### TR-2: Feature Flag Pattern (if needed)
**Reference Implementation**: \`tests/e2e/calibration.spec.ts:7-12\`

\`\`\`typescript
test.beforeEach(async ({ page, context }) => {
  // Check if we're in the flags-on project
  const env = (context as any).env || {};
  if (env.FEATURE_CALIBRATION_REVIEW !== 'true') {
    test.skip();
  }
  // Then add mocks...
});
\`\`\`

### TR-3: Playwright Configuration
**No Changes Required** - Projects already configured in \`playwright.config.ts:47-77\`
- \`mock\` project: \`EHG_MOCK_MODE=true\`, feature flags OFF
- \`flags-on\` project: \`EHG_MOCK_MODE=true\`, feature flags ON

### TR-4: Directory Structure
**Target Application**: \`/mnt/c/_EHG/EHG\` (EHG customer-facing app)
**Test Files Location**:
- \`tests/e2e/\` (E2E tests)
- \`tests/dev/\` (Development tests)
**Documentation Location**: \`docs/testing/\`

---

## Implementation Approach

### Phase 1: Add Mock Handlers (60 minutes)
1. **File 1**: \`tests/dev/ventures-authenticated.spec.ts\`
   - Copy mock handler from \`ventures.spec.ts\`
   - Adjust mock data if needed
   - Test: \`npx playwright test tests/dev/ventures-authenticated.spec.ts --project=mock\`

2. **File 2**: \`tests/dev/ventures-crud.spec.ts\`
   - Add mock handlers for GET, POST, PUT, DELETE
   - Use conditional responses based on HTTP method
   - Test: \`npx playwright test tests/dev/ventures-crud.spec.ts --project=mock\`

3. **File 3**: \`tests/e2e/new-venture.spec.ts\`
   - Add mock handler for POST endpoint
   - Mock success response
   - Test: \`npx playwright test tests/e2e/new-venture.spec.ts --project=mock\`

### Phase 2: Create Documentation (90 minutes)
1. **Create \`docs/testing/mock-handler-patterns.md\`**:
   - Pattern A: Basic mock handler with code example
   - Pattern B: Feature flag check with code example
   - Pattern C: Authenticated test guidance
   - Decision tree: which pattern to use when
   - Common pitfalls and solutions

2. **Update \`tests/README.md\`**:
   - Add "Playwright Projects" section
   - Create table: Test File | mock project | flags-on project
   - Add "Running Tests" section with project examples

### Phase 3: Validation (30 minutes)
1. Run full test suite in mock project
2. Run full test suite in flags-on project
3. Verify CI/CD pipeline passes
4. Code review

---

## Test Scenarios

### TS-1: Mock Project Tests Pass
**Scenario**: All venture workflow tests pass without database
**Steps**:
1. Navigate to \`/mnt/c/_EHG/EHG\`
2. Run \`npx playwright test --project=mock\`
3. Filter for venture tests: \`npx playwright test tests/e2e/ventures*.spec.ts tests/dev/ventures*.spec.ts --project=mock\`
**Expected**: 100% pass rate, zero failures due to missing mocks
**Acceptance**: Green output, no "Failed to fetch" errors

### TS-2: flags-on Project Tests Pass
**Scenario**: Feature-flagged tests work correctly
**Steps**:
1. Run \`npx playwright test --project=flags-on\`
2. Verify feature-flagged tests execute
**Expected**: 100% pass rate, feature tests run when enabled
**Acceptance**: Green output, calibration/decision tests execute

### TS-3: Mock Handlers Intercept Correctly
**Scenario**: Mock handlers intercept API calls
**Steps**:
1. Add console logging to mock handler
2. Run test, verify handler was called
3. Check network tab shows no real API calls
**Expected**: Mock handler intercepts, returns test data
**Acceptance**: No database queries, tests use mock data

### TS-4: Documentation Completeness
**Scenario**: Documentation is clear and actionable
**Steps**:
1. Open \`docs/testing/mock-handler-patterns.md\`
2. Follow Pattern A instructions to add mock to new test
3. Verify pattern works as documented
**Expected**: Pattern is copy-paste ready
**Acceptance**: Can add mocks following docs alone

---

## Acceptance Criteria

### AC-1: Mock Handlers Added
✅ \`ventures-authenticated.spec.ts\` has \`page.route()\` handler
✅ \`ventures-crud.spec.ts\` has \`page.route()\` handlers for all CRUD ops
✅ \`new-venture.spec.ts\` has \`page.route()\` handler
✅ All handlers follow \`ventures.spec.ts\` pattern

### AC-2: Tests Pass
✅ 100% pass rate in mock project (venture workflow tests)
✅ 100% pass rate in flags-on project (venture workflow tests)
✅ Zero failures due to missing mocks
✅ Zero "Failed to fetch" errors in test output

### AC-3: Documentation Complete
✅ \`docs/testing/mock-handler-patterns.md\` exists
✅ Contains Pattern A, B, C with code examples
✅ Includes decision tree for pattern selection
✅ \`tests/README.md\` updated with project requirements table

### AC-4: CI/CD Pipeline
✅ CI/CD pipeline shows green for both projects
✅ No flaky test failures over 48-hour period
✅ Test execution time reduced (no database dependency)

### AC-5: Code Quality
✅ Mock handlers follow TypeScript best practices
✅ Mock data is realistic and sufficient for UI testing
✅ Code review approved
✅ No console errors or warnings in test output

---

## Component Sizing Analysis

| Component | Type | Est. Lines | Complexity | Status |
|-----------|------|------------|------------|--------|
| ventures-authenticated.spec.ts | Test File | +20 | Low | ✅ Within target |
| ventures-crud.spec.ts | Test File | +40 | Low | ✅ Within target |
| new-venture.spec.ts | Test File | +20 | Low | ✅ Within target |
| mock-handler-patterns.md | Documentation | ~200 | Low | ✅ Within target |
| tests/README.md update | Documentation | +30 | Low | ✅ Within target |

**Total Estimated LOC**: ~310 lines
**Target Range**: 300-600 LOC (✅ OPTIMAL)
**Complexity**: Low - copying proven patterns
**Maintainability**: High - following existing conventions

---

## Resource Requirements

### Development Time
- **Mock handlers**: 1 hour (3 files × 20 min)
- **Documentation**: 1.5 hours
- **Testing**: 0.5 hours
- **Code review**: 0.5 hours
- **Buffer**: 0.5 hours
- **Total**: 4 hours (50% of 8-hour estimate)

### Skills Required
- TypeScript knowledge
- Playwright testing experience
- Pattern recognition (copy existing code)
- Technical writing (documentation)

### Dependencies
- Playwright already installed
- Projects already configured
- Reference implementations exist
- No external libraries needed

---

## Timeline & Milestones

### Milestone 1: Mock Handlers Complete (Day 1)
- ✅ ventures-authenticated.spec.ts updated
- ✅ ventures-crud.spec.ts updated
- ✅ new-venture.spec.ts updated
- ✅ All tests passing in mock project

### Milestone 2: Documentation Complete (Day 1)
- ✅ mock-handler-patterns.md created
- ✅ tests/README.md updated
- ✅ Documentation reviewed

### Milestone 3: Validation Complete (Day 1)
- ✅ CI/CD pipeline green
- ✅ Code review approved
- ✅ EXEC→PLAN handoff created

**Total Duration**: 1 day (4-6 hours actual work)

---

## Risk Mitigation

### Risk 1: Mock Data Diverges from Real API
**Mitigation**: Copy mock structure from working \`ventures.spec.ts\`
**Fallback**: Validate against real API in integration tests
**Likelihood**: Low (20%)

### Risk 2: Feature Flag Logic Becomes Complex
**Mitigation**: Follow \`calibration.spec.ts\` pattern exactly
**Fallback**: Keep it simple - only environment variable check
**Likelihood**: Low (15%)

### Risk 3: Documentation Becomes Outdated
**Mitigation**: Single source in \`docs/testing/\`, link from README
**Fallback**: Quarterly documentation review process
**Likelihood**: Low (30%)

---

## Success Metrics

1. **Test Pass Rate**: 100% in both mock and flags-on projects
2. **Mock Coverage**: 100% of venture workflow test files
3. **CI/CD Stability**: Zero flaky failures over 30 days
4. **Developer Velocity**: 40% faster test execution
5. **Documentation**: 100% team awareness

---

## Dependencies & Assumptions

### Dependencies
- ✅ Playwright installed and configured
- ✅ Two projects defined (mock, flags-on)
- ✅ Reference implementations exist
- ✅ /mnt/c/_EHG/EHG repository accessible

### Assumptions
- Test files can be modified without breaking existing tests
- Mock data structure matches current API responses
- CI/CD pipeline is properly configured
- Team has access to documentation location

---

## Appendix: File Locations

### Files to Modify
\`\`\`
/mnt/c/_EHG/EHG/tests/dev/ventures-authenticated.spec.ts
/mnt/c/_EHG/EHG/tests/dev/ventures-crud.spec.ts
/mnt/c/_EHG/EHG/tests/e2e/new-venture.spec.ts
/mnt/c/_EHG/EHG/tests/README.md
\`\`\`

### Files to Create
\`\`\`
/mnt/c/_EHG/EHG/docs/testing/mock-handler-patterns.md
\`\`\`

### Reference Files
\`\`\`
/mnt/c/_EHG/EHG/tests/e2e/ventures.spec.ts (Pattern A)
/mnt/c/_EHG/EHG/tests/e2e/calibration.spec.ts (Pattern B)
/mnt/c/_EHG/EHG/playwright.config.ts (Project config)
\`\`\`

---

**PRD Version**: 1.0
**Created By**: PLAN Agent
**Target Application**: /mnt/c/_EHG/EHG (EHG customer-facing app)
**Estimated Effort**: 4-6 hours
**Priority**: HIGH
**Status**: Ready for EXEC
`
  };

  try {
    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('id', prdId)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('id', prdId)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ PRD UPDATED successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Status:', data.status);
      console.log('   Progress:', data.progress + '%');
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .insert(prd)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ PRD CREATED successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Status:', data.status);
      console.log('   Progress:', data.progress + '%');
    }

    console.log('\n📊 PRD Summary:');
    console.log('   - Functional Requirements: 5 defined');
    console.log('   - Technical Requirements: 4 specified');
    console.log('   - Test Scenarios: 4 scenarios');
    console.log('   - Acceptance Criteria: 5 sets');
    console.log('   - Component Sizing: 310 LOC (OPTIMAL)');
    console.log('   - Estimated Effort: 4-6 hours');

    console.log('\n🎯 Ready for EXEC Phase');
    console.log('   Navigate to: /mnt/c/_EHG/EHG');
    console.log('   Start with: tests/dev/ventures-authenticated.spec.ts');

    console.log('\n================================================================');

  } catch (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }
}

createPRD();
