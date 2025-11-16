#!/usr/bin/env node

/**
 * PRD Creation for SD-TESTING-COVERAGE-001
 * Source: Testing Agent background scan results
 * Documentation: /docs/testing/
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-TESTING-COVERAGE-001';
const PRD_ID = 'PRD-SD-TESTING-COVERAGE-001';

async function createPRD() {
  console.log('\n📋 Creating PRD for SD-TESTING-COVERAGE-001');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Fetch SD UUID
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sd) {
    console.error('❌ SD not found:', sdError);
    process.exit(1);
  }

  console.log('✅ Found SD:', sd.title);
  console.log('   UUID:', sd.uuid_id);
  console.log('');

  const prdData = {
    id: PRD_ID,
    sd_uuid: sd.uuid_id,
    directive_id: SD_ID,
    title: 'Critical Test Coverage Investment - Technical Implementation',
    version: '1.0',
    status: 'planning',
    category: 'quality',
    priority: 'high',

    executive_summary: `
Implement comprehensive test coverage for EHG_Engineer non-Stage-4 features to prevent production regressions and unblock EXEC validation. Current coverage is 20% with 5 CRITICAL gaps: (1) LEO gates broken (all exit code 1), (2) SD/PRD CRUD untested, (3) Database validation untested, (4) Phase handoffs untested, (5) PRD management untested. Week 1 investment of 26 hours will increase coverage to 45% (+125% improvement) by addressing these critical gaps through testing-agent delegation.

**Impact**: Unblocks EXEC validation, prevents SD/PRD data corruption, enables confident CI/CD deployments, reduces regression bugs to near-zero.

**Approach**: Delegate ALL test creation to testing-agent (MANDATORY per LEO v4.3.0). Fix broken LEO gates first (6h), then add E2E tests for SD CRUD (6h), PRD management (8h), and database validation (5h).
    `.trim(),

    business_context: `
Testing Agent background scan revealed critical production risks with measurable ROI for remediation:
- **LEO gates broken**: All 5 gates exit code 1, blocking PLAN→EXEC validation workflow
- **Data corruption risk**: SD/PRD CRUD operations have zero E2E tests
- **Silent failures**: Database validation scripts untested (815 LOC unvalidated)
- **Workflow reliability**: Phase handoffs untested (2,097 LOC unvalidated)

**Business Impact**:
- Current state: EXEC validation blocked, production operations untrusted
- ROI: 5 days investment prevents 10-20 days debugging failures
- Quality improvement: Coverage 20% → 45% (Week 1), → 60% (Week 3)
- Risk mitigation: Prevents SD/PRD data corruption and workflow failures
    `.trim(),

    technical_context: `
**Existing Infrastructure**:
- ✅ Playwright configured (E2E testing)
- ✅ Jest/Vitest configured (unit testing)
- ✅ Testing Agent operational (sub-agent delegation ready)
- ✅ QA Director Enhanced v2.0 available
- ✅ GitHub Actions CI/CD pipeline ready

**Constraints**:
- Must use testing-agent for ALL test file creation (LEO v4.3.0 mandate)
- Separate test database instance recommended (avoid production pollution)
- Pre-test build validation required (npm run build:client before E2E)
- Dual testing requirement: unit + E2E BOTH must pass

**Technical Documentation**: See /docs/testing/ for complete analysis (TESTING-SCAN-EXECUTIVE-SUMMARY.md, QUICK-WINS-TEST-PRIORITY.md, TEST-COVERAGE-SCORECARD.md)
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        priority: 'CRITICAL',
        description: 'Fix all 5 LEO gates (2A-2D, Gate 3) to stop exiting with code 1',
        acceptance_criteria: [
          'Gate 2A (Architecture) executes without exit code 1',
          'Gate 2B (Design & DB) executes without exit code 1',
          'Gate 2C (Security) executes without exit code 1',
          'Gate 2D (NFR & Testing) executes without exit code 1',
          'Gate 3 (Final Verification) executes without exit code 1',
          'Integration tests created for all 5 gates',
          'Gates pass for valid PRDs, fail for invalid PRDs'
        ]
      },
      {
        id: 'FR-2',
        priority: 'CRITICAL',
        description: 'Create E2E tests for Strategic Directive CRUD operations',
        acceptance_criteria: [
          'E2E test: Create SD (LEAD agent workflow)',
          'E2E test: Edit SD (title, description, status)',
          'E2E test: Transition SD status (DRAFT → ACTIVE → IN_PROGRESS → COMPLETED)',
          'E2E test: Delete SD (soft delete verification)',
          'E2E test: SD validation rules (required fields, status constraints)',
          'All tests execute via Playwright',
          'Test file: tests/e2e/strategic-directives-crud.spec.ts'
        ]
      },
      {
        id: 'FR-3',
        priority: 'CRITICAL',
        description: 'Create E2E tests for PRD management workflows',
        acceptance_criteria: [
          'E2E test: Create PRD from SD (PLAN agent)',
          'E2E test: Validate PRD schema (required fields)',
          'E2E test: Add user stories to PRD',
          'E2E test: Validate user stories (acceptance criteria)',
          'E2E test: Approve PRD for EXEC',
          'E2E test: Reject PRD with feedback',
          'All tests execute via Playwright',
          'Test file: tests/e2e/prd-management.spec.ts'
        ]
      },
      {
        id: 'FR-4',
        priority: 'CRITICAL',
        description: 'Create integration tests for database validation scripts',
        acceptance_criteria: [
          'Integration test: Validate SD schema compliance',
          'Integration test: Validate PRD schema compliance',
          'Integration test: Detect orphaned records (PRDs without SDs)',
          'Integration test: Detect invalid status transitions',
          'Integration test: Detect missing required fields',
          'Integration test: Generate fix scripts for issues',
          'Test file: tests/integration/database-validation.test.js'
        ]
      },
      {
        id: 'FR-5',
        priority: 'HIGH',
        description: 'Create E2E tests for phase handoff system (Week 2)',
        acceptance_criteria: [
          'E2E test: LEAD → PLAN handoff creation',
          'E2E test: PLAN → EXEC handoff creation',
          'E2E test: EXEC → PLAN handoff creation',
          'E2E test: PLAN → LEAD handoff creation',
          'E2E test: Handoff validation (required fields)',
          'E2E test: Handoff rejection (with feedback)',
          'Test file: tests/e2e/phase-handoffs.spec.ts'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'performance',
        requirement: 'LEO gates must execute within 30 seconds each (debugging fixes may take longer initially)'
      },
      {
        type: 'reliability',
        requirement: 'All E2E tests must be deterministic (no flaky tests allowed)'
      },
      {
        type: 'maintainability',
        requirement: 'Test files must follow Playwright best practices (page objects, no hardcoded waits)'
      },
      {
        type: 'scalability',
        requirement: 'Test suite must execute in <5 minutes for smoke tests, <15 minutes for comprehensive'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        description: 'ALL test file creation via testing-agent (NO manual test writing per LEO v4.3.0)',
        implementation_notes: 'Use Task(subagent_type: "testing-agent", ...) for every test file'
      },
      {
        id: 'TR-2',
        description: 'Pre-test build validation (npm run build:client before E2E tests)',
        implementation_notes: 'Prevents 2-3 hours debugging from stale builds'
      },
      {
        id: 'TR-3',
        description: 'Dual testing requirement (unit + E2E BOTH must pass)',
        implementation_notes: 'Cannot create handoff without BOTH test types passing'
      },
      {
        id: 'TR-4',
        description: 'Test database instance or RLS bypass for tests',
        implementation_notes: 'Avoid polluting production data during test execution'
      }
    ],

    system_architecture: `
## Testing Architecture

**Test Types**:
1. **Integration Tests** (Jest/Vitest):
   - LEO gates validation logic
   - Database validation script functions
   - Test execution: \`npm run test:integration\`

2. **E2E Tests** (Playwright):
   - SD CRUD user flows
   - PRD management workflows
   - Phase handoff creation
   - Test execution: \`npx playwright test\`

**File Organization**:
\`\`\`
tests/
├── e2e/
│   ├── strategic-directives-crud.spec.ts   (FR-2)
│   ├── prd-management.spec.ts              (FR-3)
│   └── phase-handoffs.spec.ts              (FR-5, Week 2)
└── integration/
    ├── leo-gates.test.js                   (FR-1)
    └── database-validation.test.js         (FR-4)
\`\`\`

**Testing Infrastructure**:
- Playwright for E2E (browser automation)
- Jest/Vitest for integration (Node.js testing)
- Testing Agent for professional test generation
- QA Director v2.0 for comprehensive validation
    `.trim(),

    data_model: {
      tables: [
        {
          name: 'strategic_directives_v2',
          columns: ['id', 'title', 'status', 'progress'],
          purpose: 'SD CRUD operations under test'
        },
        {
          name: 'product_requirements_v2',
          columns: ['id', 'directive_id', 'title', 'status'],
          purpose: 'PRD management under test'
        },
        {
          name: 'sd_phase_handoffs',
          columns: ['sd_id', 'from_phase', 'to_phase', 'status'],
          purpose: 'Phase handoff workflows under test'
        }
      ],
      relationships: 'Read-only test access (no schema changes required)'
    },

    api_specifications: [
      {
        endpoint: 'N/A',
        method: 'N/A',
        description: 'No API changes - testing existing functionality only'
      }
    ],

    ui_ux_requirements: [
      {
        component: 'N/A',
        description: 'No UI changes - testing infrastructure work only'
      }
    ],

    implementation_approach: `
## Week 1 Sprint Plan (26 hours)

**Day 1-2: LEO Gates (6 hours)** [FR-1]
1. Debug gate2a.ts, gate2b.ts, gate2c.ts, gate2d.ts, gate3.ts (identify exit code 1 root cause)
2. Fix implementation issues causing failures
3. Delegate to testing-agent: Create integration tests for all 5 gates
4. Verify gates pass for valid PRDs, fail for invalid PRDs

**Day 3: SD CRUD (6 hours)** [FR-2]
1. Delegate to testing-agent: Create E2E test file strategic-directives-crud.spec.ts
2. Test scenarios: Create, Edit, Status transitions, Delete, Validation rules
3. Execute tests: \`npx playwright test tests/e2e/strategic-directives-crud.spec.ts\`
4. Verify all tests pass

**Day 4: PRD Management (8 hours)** [FR-3]
1. Delegate to testing-agent: Create E2E test file prd-management.spec.ts
2. Test scenarios: Create PRD, Validate schema, Add user stories, Approve, Reject
3. Execute tests: \`npx playwright test tests/e2e/prd-management.spec.ts\`
4. Verify all tests pass

**Day 5: Database Validation (5 hours)** [FR-4]
1. Delegate to testing-agent: Create integration test file database-validation.test.js
2. Test scenarios: SD/PRD schema validation, Orphan detection, Fix script generation
3. Execute tests: \`npm run test:integration\`
4. Verify all tests pass

## Week 2: Phase Handoffs (8-10 hours, DEFERRED) [FR-5]
1. Delegate to testing-agent: Create E2E test file phase-handoffs.spec.ts
2. Test all handoff types (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN, PLAN→LEAD)
3. Integrate with CI/CD pipeline

## Testing-Agent Delegation Pattern

**CRITICAL per LEO v4.3.0**: ALL test file creation MUST use testing-agent:

\`\`\`javascript
// For each test file needed:
Task({
  subagent_type: "testing-agent",
  description: "Create [test type] tests for [feature]",
  prompt: \`
    Create comprehensive [E2E/integration] tests for [feature name].

    Requirements:
    - Test file: tests/[e2e|integration]/[filename]
    - Framework: [Playwright|Jest]
    - Scenarios: [list test scenarios]
    - Acceptance criteria: [list from FR-X]

    Follow best practices:
    - Page objects for E2E tests
    - No hardcoded waits (use waitFor)
    - Deterministic test data
    - Clear test descriptions
  \`
});
\`\`\`

**DO NOT** write test files manually - this violates LEO v4.3.0 sub-agent delegation mandate.
    `.trim(),

    technology_stack: [
      'Playwright ^1.40',
      'Jest ^29.0 / Vitest ^1.0',
      'TypeScript ^5.0',
      'Testing Agent (LEO Protocol sub-agent)',
      'QA Engineering Director v2.0'
    ],

    dependencies: [
      {
        name: 'Testing Agent',
        type: 'internal',
        status: 'available',
        notes: 'Sub-agent for professional test generation'
      },
      {
        name: 'Playwright',
        type: 'external',
        status: 'configured',
        notes: 'E2E testing framework'
      },
      {
        name: 'Jest/Vitest',
        type: 'external',
        status: 'configured',
        notes: 'Integration testing framework'
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'LEO Gates Validation',
        test_type: 'integration',
        description: 'Verify all 5 gates execute without exit code 1',
        expected_outcome: 'Gates pass for valid PRDs, fail appropriately for invalid'
      },
      {
        id: 'TS-2',
        scenario: 'SD CRUD Operations',
        test_type: 'e2e',
        description: 'Test complete SD lifecycle (create, edit, status transitions, delete)',
        expected_outcome: 'All operations work correctly via UI'
      },
      {
        id: 'TS-3',
        scenario: 'PRD Management Workflow',
        test_type: 'e2e',
        description: 'Test PRD creation, validation, user stories, approval',
        expected_outcome: 'Full PRD workflow functional'
      },
      {
        id: 'TS-4',
        scenario: 'Database Validation',
        test_type: 'integration',
        description: 'Test schema validation, orphan detection, fix generation',
        expected_outcome: 'Validation detects issues, generates correct fixes'
      },
      {
        id: 'TS-5',
        scenario: 'Phase Handoffs',
        test_type: 'e2e',
        description: 'Test all handoff types (LEAD→PLAN, PLAN→EXEC, etc.)',
        expected_outcome: 'Handoffs create correctly, validation enforced'
      }
    ],

    acceptance_criteria: [
      'All 5 LEO gates stop exiting with code 1',
      'LEO gates have integration tests with 100% coverage',
      'SD CRUD operations have E2E tests (8 test cases)',
      'PRD management has E2E tests (8 test cases)',
      'Database validation has integration tests (7 test cases)',
      'All tests delegated to testing-agent (zero manual test files)',
      'CI/CD pipeline runs all tests on PRs',
      'Zero test failures on main branch',
      'Test coverage increases from 20% to 45% (measured via coverage reports)'
    ],

    performance_requirements: {
      page_load_time: 'N/A (testing infrastructure only)',
      concurrent_users: 1,
      api_response_time: 'N/A',
      test_execution_time: '<5 min smoke tests, <15 min comprehensive'
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Testing strategy documented', checked: true },
      { text: 'Week 1 sprint plan defined (26 hours, 4 test files)', checked: true },
      { text: 'Testing-agent delegation pattern established', checked: true },
      { text: 'No database schema changes required', checked: true },
      { text: 'Existing test infrastructure verified (Playwright, Jest ready)', checked: true },
      { text: 'PLAN→EXEC handoff ready for creation', checked: false }
    ],

    exec_checklist: [
      { text: 'LEO gates debugged and fixed (6 hours)', checked: false },
      { text: 'LEO gates integration tests created via testing-agent', checked: false },
      { text: 'SD CRUD E2E tests created via testing-agent (6 hours)', checked: false },
      { text: 'PRD management E2E tests created via testing-agent (8 hours)', checked: false },
      { text: 'Database validation integration tests created via testing-agent (5 hours)', checked: false },
      { text: 'All unit tests passing (npm run test:unit)', checked: false },
      { text: 'All E2E tests passing (npm run test:e2e)', checked: false },
      { text: 'CI/CD pipeline green (all workflows passing)', checked: false },
      { text: 'Test coverage report generated (45% target)', checked: false },
      { text: 'EXEC→PLAN handoff created with test results', checked: false }
    ],

    validation_checklist: [
      { text: 'All Week 1 test files created (4 files)', checked: false },
      { text: 'All tests passing (integration + E2E)', checked: false },
      { text: 'LEO gates functional (5/5 passing)', checked: false },
      { text: 'Coverage increased to 45%', checked: false },
      { text: 'CI/CD integration verified', checked: false },
      { text: 'Zero test failures on main branch', checked: false },
      { text: 'Testing-agent delegation enforced (no manual test files)', checked: false },
      { text: 'QA Director verification complete', checked: false },
      { text: 'PLAN→LEAD handoff created', checked: false }
    ],

    progress: 0,
    phase: 'planning',
    phase_progress: {
      PLAN_PRD: 0,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        risk: 'LEO gate fixes reveal deeper architectural issues',
        impact: 'Could extend debugging beyond 6 hours, delay Week 1 completion',
        likelihood: 'medium',
        mitigation: 'Timebox gate debugging to 6 hours, escalate to LEAD if blocked, create separate SD for complex fixes'
      },
      {
        risk: 'Test database setup delays Week 1 execution',
        impact: 'Cannot run tests without polluting production data',
        likelihood: 'medium',
        mitigation: 'Use RLS bypass for tests if test DB not ready by Day 2, document production data cleanup'
      },
      {
        risk: 'E2E tests expose production bugs requiring immediate fixes',
        impact: 'Discovered bugs may block test completion',
        likelihood: 'high',
        mitigation: 'Create fix SDs for CRITICAL bugs, defer LOW/MEDIUM to Week 2, document in Known Issues'
      },
      {
        risk: 'Testing-agent delegation overhead vs manual writing',
        impact: 'Learning curve for testing-agent delegation pattern',
        likelihood: 'low',
        mitigation: 'Testing-agent well-established, follows LEO v4.3.0 mandate, provides better quality tests'
      }
    ],

    constraints: [
      {
        type: 'technical',
        description: 'Must use testing-agent for all test file creation',
        impact: 'Cannot manually write test files (LEO v4.3.0 enforcement)',
        workaround: 'None - this is non-negotiable protocol requirement'
      },
      {
        type: 'time',
        description: 'Week 1 limited to 26 hours (5 days)',
        impact: 'Phase handoffs deferred to Week 2',
        workaround: 'Prioritized CRITICAL items in Week 1, deferred HIGH items to Week 2'
      },
      {
        type: 'scope',
        description: 'Excludes Stage 4 venture workflow (separate session)',
        impact: 'Stage 4 testing not addressed in this SD',
        workaround: 'Create separate SD for Stage 4 testing if needed'
      }
    ],

    assumptions: [
      {
        assumption: 'Playwright and Jest/Vitest are correctly configured',
        validation_method: 'Run smoke tests before Day 1',
        impact_if_false: 'Add 2-4 hours for infrastructure setup'
      },
      {
        assumption: 'Testing Agent is operational and accessible',
        validation_method: 'Test Task tool with testing-agent subagent_type',
        impact_if_false: 'Cannot proceed - LEAD escalation required'
      },
      {
        assumption: 'LEO gate issues are fixable within 6 hours',
        validation_method: 'Initial debugging session on Day 1',
        impact_if_false: 'Create separate SD for complex gate refactoring'
      }
    ],

    stakeholders: [
      {
        name: 'LEAD Agent',
        role: 'Approver',
        involvement: 'Final approval after PLAN verification'
      },
      {
        name: 'PLAN Agent',
        role: 'Quality Assurance',
        involvement: 'Verification of test completeness and coverage'
      },
      {
        name: 'EXEC Agent',
        role: 'Implementation',
        involvement: 'Delegates to testing-agent, executes tests, reports results'
      },
      {
        name: 'Testing Agent',
        role: 'Test Creation',
        involvement: 'Generates all test files per LEO v4.3.0 mandate'
      },
      {
        name: 'QA Director v2.0',
        role: 'Comprehensive Validation',
        involvement: 'Final verification with 100% user story coverage'
      }
    ],

    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'PLAN',
    updated_by: 'PLAN',

    metadata: {
      source: 'Testing Agent background scan',
      documentation_path: '/docs/testing/',
      analysis_files: [
        'TESTING-SCAN-EXECUTIVE-SUMMARY.md',
        'QUICK-WINS-TEST-PRIORITY.md',
        'TEST-COVERAGE-SCORECARD.md',
        'NON-STAGE4-TEST-COVERAGE-ANALYSIS.md'
      ],
      estimated_effort_hours: '26-35',
      week_1_focus_hours: 26,
      roi_score: '5/5',
      baseline_coverage: '20%',
      target_coverage_week1: '45%',
      target_coverage_week3: '60%',
      critical_issues_found: 5,
      test_files_to_create: 5,
      sub_agent_delegation: 'testing-agent (MANDATORY per LEO v4.3.0)'
    }
  };

  console.log('📝 Inserting PRD into database...\n');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert([prdData])
    .select();

  if (error) {
    console.error('❌ Failed to create PRD:', error);
    console.error('   Code:', error.code);
    console.error('   Message:', error.message);
    if (error.details) console.error('   Details:', error.details);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!');
  console.log('');
  console.log('📋 PRD Details:');
  console.log('   ID:', data[0].id);
  console.log('   Title:', data[0].title);
  console.log('   Status:', data[0].status);
  console.log('   Phase:', data[0].phase);
  console.log('');
  console.log('🎯 Next Steps:');
  console.log('   1. Run automated PRD enrichment (LEO v4.3.0):');
  console.log('      node scripts/enrich-prd-with-research.js', PRD_ID);
  console.log('');
  console.log('   2. Invoke STORIES sub-agent (auto-generate user stories):');
  console.log('      node lib/sub-agent-executor.js STORIES', SD_ID);
  console.log('');
  console.log('   3. Create PLAN→EXEC handoff:');
  console.log('      node scripts/unified-handoff-system.js execute PLAN-TO-EXEC', SD_ID);
  console.log('');
}

createPRD();
