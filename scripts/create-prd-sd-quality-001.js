#!/usr/bin/env node

/**
 * Create PRD for SD-QUALITY-001: Unit Test Coverage Gap
 * PLAN Agent - Technical Planning Phase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createPRDLink } from '../lib/sd-helpers.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('📋 Creating PRD for SD-QUALITY-001: Unit Test Coverage Gap\n');

  const prdData = {
    id: 'PRD-SD-QUALITY-001',
    ...await createPRDLink('SD-QUALITY-001'),
    title: 'Unit Test Coverage Gap - Business Logic Testing Infrastructure',
    version: '1.0',
    status: 'active',
    category: 'quality_assurance',
    priority: 'high',

    executive_summary: `# Unit Test Coverage Gap - Business Logic Testing

## Problem Statement
EHG application has extensive end-to-end (Playwright), integration, accessibility, security, and performance test coverage (63 total test files), but only 4 unit test files covering 528 source files in src/ directory. This represents ~1% unit test coverage for business logic.

## Investigation Findings
- **Original Claim**: "362,538 LOC with 6 test files (0.001% coverage)"
- **Reality**: 63 test files with extensive E2E/integration coverage
- **Actual Gap**: Only 4 unit test files in tests/unit/
- **Root Cause**: Multi-application architecture not documented

## Scope
Focus exclusively on adding unit test coverage for business logic:
- **Target**: 40-60 new unit test files
- **Coverage Goal**: 50% for src/services/, src/utils/, src/hooks/, src/lib/
- **Timeline**: 6 weeks
- **Maintain**: All existing 63 test files intact

## Success Criteria
- Add 40-60 unit test files to tests/unit/
- Achieve 50% unit test coverage for business logic
- All existing E2E/integration tests continue to pass
- Unit test execution time <5 minutes`,

    content: `# PRD: Unit Test Coverage Gap - Business Logic Testing

## 1. Context & Background

### Current Test Infrastructure
**Location**: \`/mnt/c/_EHG/ehg/tests/\`

**Existing Tests** (63 files):
- \`tests/e2e/\` - Extensive Playwright end-to-end tests ✅
- \`tests/integration/\` - Integration tests ✅
- \`tests/a11y/\` - Accessibility tests (WCAG 2.1 AA) ✅
- \`tests/security/\` - Security tests ✅
- \`tests/performance/\` - Performance tests ✅
- \`tests/unit/\` - Only 4 unit test files ❌ **THIS IS THE GAP!**

**Vitest Configuration**: Already configured in \`vitest.config.ts\`
- Coverage provider: v8
- Environment: jsdom
- Thresholds: 80% (branches, functions, lines, statements)

### Problem Definition
**528 source files** in \`src/\` directory have minimal unit test coverage (~1%).

**Critical Areas Lacking Unit Tests**:
1. **Services** (13 files): \`src/services/\`
   - Analytics, automation, EVA conversation, ventures, workflows
2. **Hooks** (67 files): \`src/hooks/\`
   - Business logic hooks, data fetching, state management
3. **Lib** (22+ files): \`src/lib/\`
   - AI services, analytics engines, security, integrations
4. **Utils** (5 files): \`src/utils/\`
   - Calculations, filters, validation utilities

## 2. Objectives

### Primary Objective
Add 40-60 unit test files focusing on high-value business logic to achieve 50% unit test coverage.

### Secondary Objectives
1. Create test data factories for consistent test scenarios
2. Establish mocking patterns for Supabase client
3. Integrate unit tests into CI/CD pipeline
4. Document unit testing patterns for team adoption

### Non-Objectives
- ❌ Rewrite existing E2E, integration, a11y tests
- ❌ Achieve 100% unit test coverage
- ❌ Test UI rendering (focus on business logic only)
- ❌ Replace integration tests with unit tests

## 3. Test Target Catalog

### Priority 1: Critical Services (20-25 test files)

**src/services/** (13 services):
1. \`analytics/AnalyticsEngine.ts\` - Analytics aggregation logic
2. \`automationEngine.ts\` - Workflow automation
3. \`evaConversation.ts\` - EVA AI conversation service
4. \`evaValidation.ts\` - EVA validation framework
5. \`gtmIntelligence.ts\` - Go-to-market intelligence
6. \`validationFramework.ts\` - Validation rules engine
7. \`ventures.ts\` - Venture management service
8. \`workflowExecutionService.ts\` - Workflow execution logic
9. \`competitive-intelligence/AICompetitiveResearchService.ts\`
10. \`competitiveIntelligenceService.ts\`

**src/lib/services/** (4 critical services):
11. \`knowledgeManagementService.ts\` - Knowledge base CRUD
12. \`multiVentureCoordinationService.ts\` - Multi-venture coordination
13. \`parallelExplorationService.ts\` - Parallel exploration logic
14. \`timingOptimizationService.ts\` - Timing optimization

**src/lib/ai/** (4 AI services):
15. \`ai-service-manager.ts\` - AI service orchestration
16. \`ai-analytics-engine.ts\` - AI-powered analytics
17. \`ai-database-service.ts\` - AI database operations
18. \`ai-integration-service.ts\` - AI service integrations

**src/lib/analytics/** (2 analytics engines):
19. \`export-engine.ts\` - Report export generation
20. \`predictive-engine.ts\` - Predictive analytics

### Priority 2: Business Logic Hooks (15-20 test files)

**High-Value Hooks** (67 total, prioritize top 15-20):
1. \`useChairmanData.ts\` - Chairman data fetching
2. \`useVentureData.ts\` - Venture data operations
3. \`useVentures.ts\` - Venture list management
4. \`useAnalyticsData.ts\` - Analytics data aggregation
5. \`useWorkflowData.ts\` - Workflow state management
6. \`useWorkflowExecution.ts\` - Workflow execution logic
7. \`useMultiVentureCoordination.ts\` - Coordination logic
8. \`useKnowledgeManagement.ts\` - Knowledge base operations
9. \`useCompetitiveIntelligence.ts\` - Competitive research
10. \`useGTMStrategy.ts\` - Go-to-market strategy
11. \`useRiskEvaluation.ts\` - Risk assessment
12. \`useProfitabilityForecasting.ts\` - Financial forecasting
13. \`useExitReadiness.ts\` - Exit readiness scoring
14. \`useSecurityCompliance.ts\` - Security compliance checks
15. \`useNotifications.ts\` - Notification management

### Priority 3: Utilities & Integrations (5-10 test files)

**src/utils/** (5 files):
1. \`calculateAttentionScore.ts\` - Attention score algorithm
2. \`calculateTriageCounts.ts\` - Triage calculation logic
3. \`urlFilters.ts\` - URL filtering utilities
4. \`utils/phase2-test-runner.ts\` - Phase 2 runner utilities

**src/lib/integration/** (3 files):
5. \`api-gateway.ts\` - API gateway routing
6. \`generic-rest-connector.ts\` - REST API connector
7. \`integration-service.ts\` - Integration orchestration

**src/lib/security/** (2 files):
8. \`behavioral-auth.ts\` - Behavioral authentication
9. \`ai-security-monitor.ts\` - AI security monitoring

### Priority 4: Workflow & Voice (5-10 test files)

**src/lib/workflow/** (3 files):
1. \`workflow-configuration.ts\` - Workflow config management
2. \`workflow-loader.ts\` - Workflow loading logic
3. \`prd-mapper.ts\` - PRD mapping utilities

**src/lib/voice/** (2 files):
4. \`real-time-voice-service.ts\` - Real-time voice processing
5. \`function-definitions.ts\` - Voice function definitions

## 4. Test Architecture

### Test Data Factories
**Location**: \`tests/unit/factories/\`

**Required Factories**:
1. \`ventureFactory.ts\` - Generate test venture objects
2. \`chairmanFactory.ts\` - Generate chairman data
3. \`analyticsFactory.ts\` - Generate analytics test data
4. \`workflowFactory.ts\` - Generate workflow test data
5. \`notificationFactory.ts\` - Generate notification test data

**Pattern**:
\`\`\`typescript
// tests/unit/factories/ventureFactory.ts
export function createMockVenture(overrides = {}) {
  return {
    id: 'test-venture-1',
    name: 'Test Venture',
    status: 'active',
    created_at: new Date().toISOString(),
    ...overrides
  };
}
\`\`\`

### Mocking Strategy
**Location**: \`tests/unit/mocks/\`

**Required Mocks**:
1. \`supabase.mock.ts\` - Mock Supabase client
2. \`openai.mock.ts\` - Mock OpenAI API
3. \`external-api.mock.ts\` - Mock external APIs

**Supabase Mock Pattern**:
\`\`\`typescript
// tests/unit/mocks/supabase.mock.ts
export const createMockSupabaseClient = () => ({
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null })
});
\`\`\`

### Test Utilities
**Location**: \`tests/unit/utils/\`

**Required Utilities**:
1. \`test-helpers.ts\` - Common test helper functions
2. \`render-hooks.ts\` - React Testing Library hook helpers
3. \`async-helpers.ts\` - Async testing utilities

## 5. Acceptance Criteria

### Coverage Metrics
- [ ] **Unit test coverage ≥50%** for:
  - \`src/services/\` - 50% minimum
  - \`src/hooks/\` - 50% minimum (top 20 hooks)
  - \`src/lib/services/\` - 50% minimum
  - \`src/lib/ai/\` - 50% minimum
  - \`src/lib/analytics/\` - 50% minimum
  - \`src/utils/\` - 60% minimum (simpler code)

### Test File Count
- [ ] **40-60 new unit test files** added to \`tests/unit/\`
- [ ] All 63 existing tests continue to pass
- [ ] No reduction in E2E/integration test coverage

### Performance
- [ ] Unit test execution time <5 minutes for full suite
- [ ] Individual test files execute <10 seconds
- [ ] Vitest watch mode provides <1 second feedback

### CI/CD Integration
- [ ] Unit tests run on every PR via GitHub Actions
- [ ] Coverage threshold enforcement (50% minimum)
- [ ] PR comments show coverage diff
- [ ] Test failures block PR merge

### Documentation
- [ ] Unit testing patterns documented
- [ ] Test data factory examples provided
- [ ] Mocking patterns documented
- [ ] Team testing guidelines updated

## 6. Implementation Plan

### Week 1: Infrastructure & Priority 1 Services (5 tests)
**Days 1-2**: Setup
- Create \`tests/unit/factories/\` with 5 factories
- Create \`tests/unit/mocks/supabase.mock.ts\`
- Create \`tests/unit/utils/test-helpers.ts\`
- Verify Vitest configuration and coverage reporting

**Days 3-5**: Priority 1 Services (5 test files)
- Test \`ventures.ts\` service
- Test \`workflowExecutionService.ts\`
- Test \`validationFramework.ts\`
- Test \`knowledgeManagementService.ts\`
- Test \`export-engine.ts\`

**Milestone**: 5 test files, infrastructure complete

### Week 2: Priority 1 Services Continuation (10 tests)
**Days 6-10**: Services (10 test files)
- Test \`analyticsEngine.ts\`
- Test \`automationEngine.ts\`
- Test \`evaConversation.ts\`
- Test \`evaValidation.ts\`
- Test \`gtmIntelligence.ts\`
- Test \`multiVentureCoordinationService.ts\`
- Test \`ai-service-manager.ts\`
- Test \`ai-analytics-engine.ts\`
- Test \`predictive-engine.ts\`
- Test \`competitiveIntelligenceService.ts\`

**Milestone**: 15 test files total, 20% coverage achieved

### Week 3: Priority 2 Hooks (15 tests)
**Days 11-15**: Business Logic Hooks (15 test files)
- Test top 15 hooks from Priority 2 list
- Use React Testing Library for hook testing
- Mock Supabase responses
- Test data fetching, caching, state management

**Milestone**: 30 test files total, 35% coverage achieved

### Week 4: Priority 2 Hooks Continuation + Priority 3 (10 tests)
**Days 16-20**: Hooks + Utilities (10 test files)
- Test 5 additional hooks
- Test 5 utility/integration files
- Focus on edge cases and error handling

**Milestone**: 40 test files total, 45% coverage achieved

### Week 5: Priority 4 + Coverage Gap Filling (10-15 tests)
**Days 21-25**: Workflow/Voice + Gap Filling (10-15 test files)
- Test workflow configuration and loading
- Test voice service functions
- Identify coverage gaps and fill
- Target: 50% coverage milestone

**Milestone**: 50-55 test files total, 50% coverage achieved

### Week 6: CI/CD Integration + Documentation
**Days 26-30**: Integration & Documentation
- Update GitHub Actions workflow
- Add coverage threshold enforcement
- Configure PR coverage comments
- Document unit testing patterns
- Create team testing guidelines
- Final verification and PLAN→EXEC handoff

**Milestone**: 50-60 test files total, 50%+ coverage, CI/CD operational

## 7. Risk Assessment

### Risk 1: Mocking Complexity
**Probability**: Medium
**Impact**: Medium
**Mitigation**: Start with simple mocks, iterate based on test needs. Use integration tests for complex scenarios.

### Risk 2: Test Execution Time
**Probability**: Low
**Impact**: Medium
**Mitigation**: Vitest is fast by design. Use parallel execution and watch mode.

### Risk 3: Team Adoption
**Probability**: Medium
**Impact**: Medium
**Mitigation**: Provide clear examples, documentation, and training. Make tests required in PR reviews.

### Risk 4: Breaking Existing Tests
**Probability**: Low
**Impact**: High
**Mitigation**: Run existing tests before and after each change. Gate all PRs on test success.

## 8. Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Unit test files | 4 | 50-60 | File count in \`tests/unit/\` |
| Unit test coverage | ~1% | 50% | Vitest coverage report |
| Test execution time | N/A | <5 min | CI/CD pipeline duration |
| E2E test pass rate | 100% | 100% | No degradation allowed |
| PR test adoption | 0% | 80% | PRs including tests / total PRs |

## 9. Dependencies

### External Dependencies
- ✅ Vitest (already configured)
- ✅ @testing-library/react (for hook testing)
- ✅ @testing-library/react-hooks (for hook testing)
- ✅ vitest v8 coverage provider (configured)

### Internal Dependencies
- ✅ Existing test infrastructure (63 test files)
- ✅ Supabase client (needs mocking)
- ✅ OpenAI API (needs mocking)

### Team Dependencies
- EXEC agent for implementation
- QA Engineering Director for test review
- Human approval for CI/CD changes

## 10. Rollout Plan

### Phase 1: Pilot (Weeks 1-2)
- Create 10-15 test files for critical services
- Validate testing patterns
- Gather feedback on mocking approach

### Phase 2: Scale (Weeks 3-4)
- Add 25-30 more test files
- Achieve 40% coverage
- Refine patterns based on pilot learnings

### Phase 3: Complete (Weeks 5-6)
- Add final 10-15 test files
- Achieve 50% coverage target
- Integrate into CI/CD
- Document and train team

## 11. Handoff to EXEC

### Deliverables for EXEC Agent
1. **This PRD** (comprehensive technical specification)
2. **Test target catalog** (50-60 prioritized files)
3. **Test architecture design** (factories, mocks, utilities)
4. **Acceptance criteria** (clear success metrics)
5. **6-week implementation timeline** (weekly milestones)

### EXEC Action Items
1. Navigate to \`/mnt/c/_EHG/ehg/\` (NOT EHG_Engineer!)
2. Run existing tests to establish baseline
3. Create test infrastructure (factories, mocks, utilities)
4. Implement unit tests per priority list
5. Achieve 50% coverage milestone
6. Integrate into CI/CD
7. Create EXEC→PLAN handoff for verification

### Verification Criteria
- All 50-60 unit test files created
- 50% unit test coverage achieved
- All existing 63 tests passing
- Unit tests running in CI/CD
- <5 minute execution time
- Documentation complete`,

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to unit test specifications', checked: true },
      { text: 'Test target catalog created (50-60 files)', checked: true },
      { text: 'Test architecture defined (factories, mocks, utilities)', checked: true },
      { text: 'Implementation timeline established (6 weeks)', checked: true },
      { text: 'Acceptance criteria documented (50% coverage)', checked: true },
      { text: 'Risk assessment completed', checked: true },
      { text: 'Dependencies identified', checked: true },
      { text: 'Rollout plan created', checked: true },
      { text: 'EXEC handoff prepared', checked: false }
    ],

    exec_checklist: [
      { text: 'Navigate to /mnt/c/_EHG/ehg/ and verify context', checked: false },
      { text: 'Run existing 63 tests to establish baseline', checked: false },
      { text: 'Create test infrastructure (factories, mocks, utilities)', checked: false },
      { text: 'Week 1: Implement 5 Priority 1 service tests', checked: false },
      { text: 'Week 2: Implement 10 Priority 1 service tests', checked: false },
      { text: 'Week 3: Implement 15 Priority 2 hook tests', checked: false },
      { text: 'Week 4: Implement 10 hook/utility tests', checked: false },
      { text: 'Week 5: Implement 10-15 workflow/voice/gap tests', checked: false },
      { text: 'Achieve 50% unit test coverage milestone', checked: false },
      { text: 'All existing 63 tests still passing', checked: false },
      { text: 'Unit test execution time <5 minutes', checked: false },
      { text: 'Week 6: Integrate into CI/CD pipeline', checked: false },
      { text: 'Configure coverage threshold enforcement', checked: false },
      { text: 'Document unit testing patterns', checked: false },
      { text: 'Create EXEC→PLAN handoff for verification', checked: false }
    ],

    validation_checklist: [
      { text: '40-60 unit test files created in tests/unit/', checked: false },
      { text: '50% unit test coverage achieved', checked: false },
      { text: 'All existing 63 tests passing (no degradation)', checked: false },
      { text: 'Unit test execution time <5 minutes', checked: false },
      { text: 'CI/CD integration operational', checked: false },
      { text: 'Coverage threshold enforcement active', checked: false },
      { text: 'Unit testing patterns documented', checked: false },
      { text: 'Team testing guidelines updated', checked: false }
    ],

    progress: 10, // Plan checklist 9/10 items checked
    phase: 'planning',
    created_by: 'PLAN'
  };

  // Insert PRD into database
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!\n');
  console.log('📊 PRD Summary:');
  console.log(`  ID: ${data.id}`);
  console.log(`  Title: ${data.title}`);
  console.log(`  Status: ${data.status}`);
  console.log(`  Priority: ${data.priority}`);
  console.log(`  Phase: ${data.phase}`);
  console.log(`  Progress: ${data.progress}%\n`);

  console.log('📋 Checklists:');
  console.log(`  PLAN: ${data.plan_checklist.filter(c => c.checked).length}/${data.plan_checklist.length} complete`);
  console.log(`  EXEC: ${data.exec_checklist.filter(c => c.checked).length}/${data.exec_checklist.length} complete`);
  console.log(`  Validation: ${data.validation_checklist.filter(c => c.checked).length}/${data.validation_checklist.length} complete\n`);

  console.log('🎯 Test Targets:');
  console.log('  Priority 1: 20-25 service test files');
  console.log('  Priority 2: 15-20 hook test files');
  console.log('  Priority 3: 5-10 utility/integration test files');
  console.log('  Priority 4: 5-10 workflow/voice test files');
  console.log('  Total: 50-60 unit test files\n');

  console.log('✨ Next Steps:');
  console.log('  1. Update todo list');
  console.log('  2. Run sub-agent validations (QA Director, Product Requirements Expert)');
  console.log('  3. Create PLAN→EXEC handoff');
  console.log('  4. Begin EXEC phase implementation\n');

  return data;
}

// Run the script
createPRD()
  .then(() => {
    console.log('🎉 PRD creation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
