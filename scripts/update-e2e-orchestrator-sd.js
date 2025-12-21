#!/usr/bin/env node
/**
 * Update E2E Test Orchestrator SDs with Complete Field Population
 *
 * Populates missing fields: success_criteria, success_metrics, strategic_objectives,
 * implementation_guidelines, dependencies, risks, complexity_level
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// SD Updates with complete field population
const sdUpdates = [
  {
    id: 'SD-E2E-TEST-ORCHESTRATOR',
    updates: {
      sd_type: 'orchestrator', // Parent SD that coordinates child SDs
      strategic_objectives: [
        'Establish systematic E2E test execution framework',
        'Ensure comprehensive coverage of all 37 test files',
        'Enforce dependency ordering between test categories',
        'Provide clear pass/fail reporting for quality gates'
      ],
      success_criteria: [
        'All 8 child SDs executed in correct dependency order',
        'Aggregate test results available for each SD',
        'Blocking issues identified before feature testing',
        'Test execution time within 90-minute budget'
      ],
      success_metrics: [
        { metric: 'Child SD completion rate', target: '100%', measurement: 'Count of completed child SDs / 8' },
        { metric: 'Overall test pass rate', target: '>95%', measurement: 'Passed tests / Total tests' },
        { metric: 'Total execution time', target: '<90 min', measurement: 'Sum of all child SD execution times' },
        { metric: 'Regression detection', target: '100%', measurement: 'Known regressions caught / Total regressions' }
      ],
      implementation_guidelines: [
        'Execute child SDs in sequence_rank order (1-8)',
        'Foundation SD (001) must pass 100% before proceeding',
        'Run tests with: npm run test:e2e -- [path]',
        'Use --reporter=json for machine-readable output',
        'Store results in test-results/ for evidence'
      ],
      risks: [
        { risk: 'Long execution time blocks CI/CD', mitigation: 'Parallelize independent SDs (006, 007, 008)', likelihood: 'medium', impact: 'medium' },
        { risk: 'Flaky tests cause false failures', mitigation: 'Use retry logic, identify and fix flaky tests', likelihood: 'high', impact: 'medium' },
        { risk: 'Environment dependencies not met', mitigation: 'Document prerequisites per SD, validate before run', likelihood: 'medium', impact: 'high' }
      ],
      complexity_level: 'complex',
      dependencies: ['LEO Stack running', 'Database migrations applied', 'Environment variables configured']
    }
  },
  {
    id: 'SD-E2E-FOUNDATION-001',
    updates: {
      sd_type: 'infrastructure', // Core infrastructure validation
      strategic_objectives: [
        'Validate core infrastructure before feature testing',
        'Ensure state machine transitions work correctly',
        'Verify budget enforcement kill-switch functionality',
        'Confirm memory isolation between ventures'
      ],
      success_criteria: [
        'All 9 test files pass with 0 failures',
        'Golden Nugget validation enforces artifact quality',
        'Budget kill-switch triggers at 0 tokens',
        'Memory isolation prevents cross-venture access',
        'Phase handoffs complete LEAD→PLAN→EXEC cycle'
      ],
      success_metrics: [
        { metric: 'Test pass rate', target: '100%', measurement: '~120 tests must all pass' },
        { metric: 'Execution time', target: '<12 min', measurement: 'Total runtime for 9 files' },
        { metric: 'Critical path coverage', target: '100%', measurement: 'State machine, budget, memory all tested' }
      ],
      implementation_guidelines: [
        'Run first: npm run test:e2e -- tests/e2e/state-machine tests/e2e/agents/sub-agent-invocation.spec.ts tests/e2e/agents/budget-kill-switch.spec.ts tests/e2e/agents/memory-isolation.spec.ts tests/e2e/phase-handoffs.spec.ts tests/e2e/prd-management.spec.ts tests/e2e/strategic-directives-crud.spec.ts',
        'Requires SUPABASE_SERVICE_ROLE_KEY for database access',
        'Clean test data after each run to avoid collisions',
        'If any test fails, do NOT proceed to other SDs'
      ],
      risks: [
        { risk: 'Database connection failures', mitigation: 'Verify Supabase connectivity before run', likelihood: 'low', impact: 'critical' },
        { risk: 'Stale test data causes failures', mitigation: 'Run database cleanup before tests', likelihood: 'medium', impact: 'medium' }
      ],
      complexity_level: 'complex',
      dependencies: ['Supabase connection', 'Service role key', 'Database migrations']
    }
  },
  {
    id: 'SD-E2E-VENTURE-CREATION-002',
    updates: {
      sd_type: 'feature', // Tests feature functionality (venture creation)
      strategic_objectives: [
        'Validate all three venture creation entry paths',
        'Ensure Stage 1 output unification works correctly',
        'Confirm UI renders properly for each path',
        'Verify venture is created in database after each path'
      ],
      success_criteria: [
        'Manual entry path creates venture successfully',
        'Competitor clone path copies competitor data',
        'Blueprint browse path applies template correctly',
        'Stage 1 output is consistent regardless of entry path',
        'All UI elements accessible (WCAG 2.1 AA)'
      ],
      success_metrics: [
        { metric: 'Test pass rate', target: '100%', measurement: '~85 tests must all pass' },
        { metric: 'Path coverage', target: '3/3', measurement: 'Manual, Competitor, Blueprint all tested' },
        { metric: 'Execution time', target: '<15 min', measurement: 'Includes UI interactions' }
      ],
      implementation_guidelines: [
        'PREREQUISITE: Run ./scripts/leo-stack.sh restart first',
        'Wait for "All LEO Stack services are running"',
        'Run: npm run test:e2e:ehg -- tests/e2e/venture-creation',
        'Uses playwright-ehg.config.js (NOT default config)',
        'Tests interact with UI on port 8080'
      ],
      risks: [
        { risk: 'LEO Stack not running', mitigation: 'Check ports 3000, 8080, 8000 before tests', likelihood: 'medium', impact: 'critical' },
        { risk: 'UI element selectors changed', mitigation: 'Use data-testid attributes for stability', likelihood: 'medium', impact: 'medium' }
      ],
      complexity_level: 'complex',
      dependencies: ['SD-E2E-FOUNDATION-001', 'LEO Stack on ports 3000/8080/8000']
    }
  },
  {
    id: 'SD-E2E-VENTURE-LIFECYCLE-003',
    updates: {
      sd_type: 'feature', // Tests core product journey (25 stages)
      strategic_objectives: [
        'Validate complete venture progression through 25 stages',
        'Ensure stage dependencies are enforced',
        'Verify required artifacts created at each stage',
        'Confirm decision gates block progression when criteria unmet'
      ],
      success_criteria: [
        'Venture progresses from Stage 1 to Stage 25',
        'Decision gates (3, 5, 13, 16, 23) enforce approval',
        'SD-required stages (10, 14-21) enforce SD presence',
        'Artifacts match Golden Nugget requirements per stage',
        'Stage skipping is prevented'
      ],
      success_metrics: [
        { metric: 'Stage coverage', target: '25/25', measurement: 'All stages tested' },
        { metric: 'Test pass rate', target: '100%', measurement: '~140 tests must all pass' },
        { metric: 'Execution time', target: '<40 min', measurement: 'Excludes full-journey test' }
      ],
      implementation_guidelines: [
        'Run phases 1-6 tests: npm run test:e2e -- tests/e2e/venture-lifecycle --grep-invert "full-journey"',
        'Run full journey separately (30-60 min): npm run test:e2e -- tests/e2e/venture-lifecycle/full-journey.spec.ts',
        'Consider smoke test (phases 1-3) for quick validation',
        'Database cleanup required between test runs'
      ],
      risks: [
        { risk: 'Long runtime blocks CI/CD', mitigation: 'Run full-journey as nightly job, not per-commit', likelihood: 'high', impact: 'medium' },
        { risk: 'Artifact generation fails', mitigation: 'Pre-generate artifact content in test fixtures', likelihood: 'medium', impact: 'high' }
      ],
      complexity_level: 'complex',
      dependencies: ['SD-E2E-FOUNDATION-001', 'SD-E2E-VENTURE-CREATION-002']
    }
  },
  {
    id: 'SD-E2E-BRAND-VARIANTS-004',
    updates: {
      sd_type: 'feature', // Tests Stage 10 brand naming feature
      strategic_objectives: [
        'Validate Stage 10 brand naming workflow',
        'Ensure domain validation checks availability',
        'Confirm chairman approval/rejection workflow',
        'Verify brand variant lifecycle transitions'
      ],
      success_criteria: [
        'Manual brand name entry creates variant',
        'Domain validation returns availability and pricing',
        'Chairman can approve or reject variants',
        'Lifecycle transitions: DRAFT → PENDING_APPROVAL → APPROVED → ACTIVE'
      ],
      success_metrics: [
        { metric: 'Test pass rate', target: '100%', measurement: '~60 tests must all pass' },
        { metric: 'Execution time', target: '<8 min', measurement: 'Total runtime for 5 files' },
        { metric: 'Workflow coverage', target: '100%', measurement: 'All lifecycle states tested' }
      ],
      implementation_guidelines: [
        'Run: npm run test:e2e -- tests/e2e/brand-variants',
        'Requires venture at Stage 10 (or create one in test)',
        'Domain API may be mocked for deterministic results',
        'Chairman role permissions required for approval tests'
      ],
      risks: [
        { risk: 'External domain API unavailable', mitigation: 'Mock domain API responses in tests', likelihood: 'medium', impact: 'low' },
        { risk: 'Chairman permissions not configured', mitigation: 'Create test user with chairman role', likelihood: 'low', impact: 'medium' }
      ],
      complexity_level: 'moderate',
      dependencies: ['SD-E2E-FOUNDATION-001']
    }
  },
  {
    id: 'SD-E2E-AGENT-RUNTIME-005',
    updates: {
      sd_type: 'infrastructure', // Tests agent infrastructure
      strategic_objectives: [
        'Validate autonomous agent message processing',
        'Ensure budget enforcement during agent execution',
        'Verify CrewAI flow orchestration',
        'Confirm business hypothesis tracking'
      ],
      success_criteria: [
        'CEO agents claim and process messages correctly',
        'Budget exhaustion triggers BudgetExhaustedException',
        'CrewAI flows execute with proper governance',
        'Business hypotheses linked to SD/PRD',
        'Circuit breaker prevents runaway loops'
      ],
      success_metrics: [
        { metric: 'Test pass rate', target: '100%', measurement: '~40 tests must all pass' },
        { metric: 'Agent coverage', target: '100%', measurement: 'CEO runtime and CrewAI both tested' },
        { metric: 'Execution time', target: '<12 min', measurement: 'Includes async message processing' }
      ],
      implementation_guidelines: [
        'PREREQUISITE: Agent platform running on port 8000',
        'Run: npm run test:e2e -- tests/e2e/agents/venture-ceo-runtime.spec.ts tests/e2e/agents/crewai-flow-execution.spec.ts',
        'Requires WebSocket connection support',
        'Budget tracking tables must be populated'
      ],
      risks: [
        { risk: 'Agent platform not running', mitigation: 'Start with: cd agent-platform && python -m uvicorn app.main:app', likelihood: 'medium', impact: 'critical' },
        { risk: 'Async message timing issues', mitigation: 'Use proper wait conditions, not fixed delays', likelihood: 'high', impact: 'medium' }
      ],
      complexity_level: 'complex',
      dependencies: ['SD-E2E-FOUNDATION-001', 'Agent platform on port 8000']
    }
  },
  {
    id: 'SD-E2E-WEBSOCKET-AUTH-006',
    updates: {
      sd_type: 'security', // Security-focused tests (skipped)
      strategic_objectives: [
        'Review skipped WebSocket security tests',
        'Confirm Python unit test coverage exists',
        'Decide: keep, migrate, or delete these tests'
      ],
      success_criteria: [
        'Python unit tests cover JWT extraction (US-001)',
        'Python unit tests cover JWT validation (US-002)',
        'Python unit tests cover mutation authorization (US-003)',
        'Python unit tests cover rate limiting (US-004)',
        'Python unit tests cover audit logging (US-005)',
        'Python unit tests cover token injection (US-006)'
      ],
      success_metrics: [
        { metric: 'Python coverage verification', target: '6/6', measurement: 'All 6 user stories covered in Python' },
        { metric: 'Decision made', target: 'Yes', measurement: 'Keep/migrate/delete decision documented' }
      ],
      implementation_guidelines: [
        'Review: agent-platform/tests/unit/test_websocket_rate_limiter.py',
        'Run Python tests: cd agent-platform && pytest tests/unit/',
        'Document coverage gaps if any',
        'Recommend: DELETE these E2E tests if Python coverage sufficient'
      ],
      risks: [
        { risk: 'Python coverage gaps', mitigation: 'Add missing Python unit tests before deleting E2E', likelihood: 'low', impact: 'medium' }
      ],
      complexity_level: 'simple',
      dependencies: []
    }
  },
  {
    id: 'SD-E2E-KNOWLEDGE-INTEGRATION-007',
    updates: {
      sd_type: 'infrastructure', // Tests external integrations
      strategic_objectives: [
        'Validate Context7 MCP failure handling',
        'Ensure graceful degradation when external systems unavailable',
        'Verify knowledge retrieval returns relevant results'
      ],
      success_criteria: [
        'System continues functioning when Context7 unavailable',
        'Appropriate error messages shown to users',
        'Knowledge retrieval returns relevant results when available',
        'No uncaught exceptions from external system failures'
      ],
      success_metrics: [
        { metric: 'Test pass rate', target: '100%', measurement: '~25 tests must all pass' },
        { metric: 'Failure scenario coverage', target: '100%', measurement: 'All failure modes tested' },
        { metric: 'Execution time', target: '<5 min', measurement: 'Total runtime for 2 files' }
      ],
      implementation_guidelines: [
        'Run: npm run test:e2e -- tests/e2e/context7-failure-scenarios.spec.ts tests/e2e/knowledge-retrieval-flow.spec.ts',
        'May require Context7 MCP server or mock',
        'Test both success and failure scenarios'
      ],
      risks: [
        { risk: 'External API instability', mitigation: 'Mock external APIs for deterministic results', likelihood: 'high', impact: 'low' }
      ],
      complexity_level: 'simple',
      dependencies: []
    }
  },
  {
    id: 'SD-E2E-LEGACY-CLEANUP-008',
    updates: {
      sd_type: 'refactor', // Code cleanup/refactoring (test migration)
      strategic_objectives: [
        'Review legacy test files for relevance',
        'Identify tests superseded by newer implementations',
        'Delete obsolete tests to reduce maintenance burden',
        'Migrate any valuable tests to new structure'
      ],
      success_criteria: [
        'story-example.spec.js reviewed and decision made',
        'venture-creation-workflow.spec.js compared to venture-creation/ tests',
        'venture-creation-event-listener-diagnostic.spec.ts evaluated',
        'visual-inspection.spec.js determined if needed for manual QA'
      ],
      success_metrics: [
        { metric: 'Files reviewed', target: '4/4', measurement: 'All legacy files reviewed' },
        { metric: 'Decisions documented', target: '4/4', measurement: 'Keep/delete decision per file' },
        { metric: 'Obsolete files removed', target: '>2', measurement: 'Expected: most are obsolete' }
      ],
      implementation_guidelines: [
        'Review each file manually for relevance',
        'Compare venture-creation-workflow.spec.js to venture-creation/ directory',
        'If visual-inspection.spec.js useful, move to tools/ directory',
        'Delete with git rm, not just file deletion'
      ],
      risks: [
        { risk: 'Deleting tests with unique coverage', mitigation: 'Check for test cases not in newer tests', likelihood: 'low', impact: 'medium' }
      ],
      complexity_level: 'simple',
      dependencies: []
    }
  }
];

async function updateSDs() {
  console.log('Updating E2E Test SDs with complete field population...\n');

  for (const { id, updates } of sdUpdates) {
    console.log(`Updating ${id}...`);

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error(`   ❌ ERROR: ${error.message}`);
    } else {
      console.log(`   ✅ Updated: success_criteria (${updates.success_criteria?.length || 0}), success_metrics (${updates.success_metrics?.length || 0}), complexity: ${updates.complexity_level}`);
    }
  }

  console.log('\n========================================');
  console.log('SD Updates Complete!');
  console.log('========================================\n');
  console.log('Fields populated:');
  console.log('  - strategic_objectives');
  console.log('  - success_criteria');
  console.log('  - success_metrics');
  console.log('  - implementation_guidelines');
  console.log('  - risks');
  console.log('  - complexity_level');
  console.log('  - dependencies\n');
}

updateSDs().catch(console.error);
