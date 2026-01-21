/**
 * Test Management Child SD Definitions - Foundation Layer
 *
 * Contains the first 5 child SD definitions for the Test Management System:
 * - SCHEMA: Database schema foundation
 * - CLEANUP: Test cleanup and migration
 * - SCANNER: Test scanner and auto-registration
 * - CICD: CI/CD integration
 * - AUTOMATION: Automation workflows
 */

export const schemaSd = {
  id: 'SD-TEST-MGMT-SCHEMA-001',
  title: 'Test Management Database Schema',
  priority: 'critical',
  rank: 1,
  purpose: 'Create the foundational database schema for tracking all tests, executions, and metadata',
  scope: {
    included: [
      'tests table - Registry of all tests (unit, integration, E2E)',
      'test_runs table - Execution history with pass/fail/skip/flaky',
      'test_fixtures table - Reusable test data definitions',
      'feature_test_map table - Feature-to-test coverage mapping',
      'test_ownership table - Test ownership and responsibility',
      'test_performance_baselines table - Duration baselines per test',
      'RLS policies for multi-venture isolation',
      'Indexes for query performance'
    ],
    excluded: [
      'UI components (separate SD)',
      'CI/CD integration (separate SD)',
      'LLM analysis tables (separate SD)'
    ]
  },
  deliverables: [
    'database/migrations/YYYYMMDD_test_management_schema.sql',
    'tests table with type, path, name, status, criticality_tier',
    'test_runs table with duration, result, error_message, stack_trace',
    'test_fixtures table with fixture_type, data, venture_id',
    'feature_test_map table with feature_id, test_id, coverage_type',
    'test_ownership table with test_id, owner_type, owner_id',
    'test_performance_baselines table with test_id, p50, p95, p99 durations',
    'RLS policies for venture isolation'
  ],
  success_criteria: [
    'All tables created with proper indexes',
    'RLS policies enforce venture isolation',
    'Schema supports 143+ existing tests',
    'Foreign key relationships are correct',
    'Migration runs without errors'
  ],
  acceptance_criteria: [
    { id: 'AC-A-1', scenario: 'Schema creation', given: 'Empty database', when: 'Migration runs', then: 'All 6 tables created' },
    { id: 'AC-A-2', scenario: 'RLS enforcement', given: 'Multi-venture data', when: 'Querying tests', then: 'Only venture tests returned' },
    { id: 'AC-A-3', scenario: 'Test registration', given: 'New test file', when: 'Inserting record', then: 'Test stored with all metadata' }
  ],
  estimated_effort: 'Small (1 session)',
  dependencies: [],
  blocks: ['SD-TEST-MGMT-CLEANUP-001', 'SD-TEST-MGMT-SCANNER-001', 'SD-TEST-MGMT-CICD-001']
};

export const cleanupSd = {
  id: 'SD-TEST-MGMT-CLEANUP-001',
  title: 'Test Cleanup & Migration',
  priority: 'high',
  rank: 2,
  purpose: 'Clean up legacy test files and migrate to standardized patterns before registry population',
  scope: {
    included: [
      'Orphan test detection (tests for deleted features)',
      'Duplicate test identification and consolidation',
      'Pattern migration (old patterns -> new patterns)',
      'Naming convention standardization',
      'Test file restructuring to match directory conventions',
      'Dead code removal in test files',
      'Fixture consolidation and cleanup'
    ],
    excluded: [
      'New test creation (separate workflow)',
      'Test content changes (only structural)',
      'Production code cleanup'
    ]
  },
  deliverables: [
    'scripts/test-cleanup-analyzer.js - Identifies cleanup candidates',
    'scripts/test-migration-runner.js - Executes migrations',
    'Cleanup report with before/after metrics',
    'Migrated test files following new patterns',
    'Consolidated fixtures in tests/fixtures/',
    'Updated imports across test files'
  ],
  success_criteria: [
    'Zero orphan tests remaining',
    'All tests follow naming convention: *.spec.ts or *.test.ts',
    'Directory structure matches: tests/{unit,integration,e2e}/',
    'No duplicate test coverage',
    'All fixtures in centralized location'
  ],
  acceptance_criteria: [
    { id: 'AC-B-1', scenario: 'Orphan detection', given: 'Test references deleted component', when: 'Analyzer runs', then: 'Test flagged for removal' },
    { id: 'AC-B-2', scenario: 'Pattern migration', given: 'Old test pattern', when: 'Migration runs', then: 'Test uses new pattern' },
    { id: 'AC-B-3', scenario: 'Naming standardization', given: 'test.js file', when: 'Migration runs', then: 'Renamed to *.spec.ts' }
  ],
  estimated_effort: 'Medium (2 sessions)',
  dependencies: ['SD-TEST-MGMT-SCHEMA-001'],
  blocks: ['SD-TEST-MGMT-SCANNER-001']
};

export const scannerSd = {
  id: 'SD-TEST-MGMT-SCANNER-001',
  title: 'Test Scanner & Auto-Registration',
  priority: 'high',
  rank: 3,
  purpose: 'Scan codebase and automatically register all existing tests in the database',
  scope: {
    included: [
      'File scanner for *.spec.ts, *.test.ts, *.spec.js, *.test.js',
      'AST parsing to extract test names and descriptions',
      'Test type detection (unit/integration/E2E)',
      'Criticality tier assignment (P0/P1/P2)',
      'User story linking from test annotations',
      'Initial baseline establishment',
      'Incremental scan for new tests'
    ],
    excluded: [
      'Test execution (CI/CD handles)',
      'Test content analysis (LLM handles)',
      'Manual test entry UI'
    ]
  },
  deliverables: [
    'scripts/test-scanner.js - Main scanner entry point',
    'lib/testing/test-parser.js - AST-based test extraction',
    'lib/testing/test-registrar.js - Database registration',
    'lib/testing/criticality-classifier.js - P0/P1/P2 assignment',
    'npm run test:scan command',
    'Initial population of 143+ tests'
  ],
  success_criteria: [
    'All 143+ existing tests registered',
    'Test metadata accurately extracted',
    'Criticality tiers assigned based on rules',
    'User story links preserved from annotations',
    'Incremental scan adds only new tests'
  ],
  acceptance_criteria: [
    { id: 'AC-C-1', scenario: 'Full scan', given: 'Clean codebase', when: 'Scanner runs', then: 'All tests registered in database' },
    { id: 'AC-C-2', scenario: 'Incremental scan', given: 'New test added', when: 'Scanner runs', then: 'Only new test registered' },
    { id: 'AC-C-3', scenario: 'Story linking', given: 'Test has @story annotation', when: 'Parsed', then: 'Story ID stored in database' }
  ],
  estimated_effort: 'Medium (2 sessions)',
  dependencies: ['SD-TEST-MGMT-SCHEMA-001', 'SD-TEST-MGMT-CLEANUP-001'],
  blocks: ['SD-TEST-MGMT-CICD-001', 'SD-TEST-MGMT-AUTOMATION-001']
};

export const cicdSd = {
  id: 'SD-TEST-MGMT-CICD-001',
  title: 'CI/CD Test Result Auto-Capture',
  priority: 'high',
  rank: 4,
  purpose: 'Automatically capture test execution results from CI/CD pipelines into the database',
  scope: {
    included: [
      'GitHub Actions workflow hooks',
      'Playwright JSON reporter integration',
      'Jest/Vitest reporter integration',
      'Result ingestion service',
      'Duration tracking per test',
      'Failure screenshot/trace linking',
      'PR-level test summary comments'
    ],
    excluded: [
      'Local development result capture (optional)',
      'Third-party CI systems (GitHub only)',
      'Test parallelization (existing)'
    ]
  },
  deliverables: [
    '.github/workflows/test-results-capture.yml',
    'scripts/ingest-test-results.js',
    'lib/testing/result-parser.js',
    'lib/testing/github-commenter.js',
    'Updated e2e-tests.yml with result upload',
    'Updated unit-tests.yml with result upload'
  ],
  success_criteria: [
    'Every CI run creates test_runs records',
    'Duration captured for performance tracking',
    'Failures include error messages and stack traces',
    'Screenshots/traces linked for E2E failures',
    'PR comments show test summary'
  ],
  acceptance_criteria: [
    { id: 'AC-D-1', scenario: 'Result capture', given: 'CI run completes', when: 'Workflow finishes', then: 'Results in test_runs table' },
    { id: 'AC-D-2', scenario: 'Failure details', given: 'Test fails', when: 'Ingested', then: 'Error message and trace stored' },
    { id: 'AC-D-3', scenario: 'PR comment', given: 'Tests run on PR', when: 'Complete', then: 'Summary comment posted' }
  ],
  estimated_effort: 'Medium (2 sessions)',
  dependencies: ['SD-TEST-MGMT-SCHEMA-001', 'SD-TEST-MGMT-SCANNER-001'],
  blocks: ['SD-TEST-MGMT-AUTOMATION-001']
};

export const automationSd = {
  id: 'SD-TEST-MGMT-AUTOMATION-001',
  title: 'Test Automation Workflows',
  priority: 'high',
  rank: 5,
  purpose: 'Implement automated workflows for flakiness detection, staleness flagging, and coverage gaps',
  scope: {
    included: [
      'Flakiness detection (>20% failure rate -> quarantine)',
      'Auto-quarantine workflow with notification',
      'Staleness detection (no updates in 90 days)',
      'Coverage gap detection (features without tests)',
      'Auto-create backlog items for gaps',
      'Test ownership auto-assignment',
      'Performance baseline drift detection',
      'Rollback trigger on test regression'
    ],
    excluded: [
      'LLM-based analysis (separate SD)',
      'Manual review workflows',
      'Test repair automation'
    ]
  },
  deliverables: [
    'lib/testing/flakiness-detector.js',
    'lib/testing/staleness-checker.js',
    'lib/testing/coverage-gap-analyzer.js',
    'lib/testing/ownership-assigner.js',
    'lib/testing/baseline-drift-detector.js',
    'scripts/run-test-automation.js',
    'Scheduled GitHub Action for daily analysis'
  ],
  success_criteria: [
    'Flaky tests auto-quarantined within 24h',
    'Stale tests flagged in weekly report',
    'Coverage gaps create backlog items automatically',
    'Ownership assigned to all tests',
    'Performance regressions trigger alerts'
  ],
  acceptance_criteria: [
    { id: 'AC-E-1', scenario: 'Flakiness', given: 'Test fails 3/10 runs', when: 'Detector runs', then: 'Test quarantined' },
    { id: 'AC-E-2', scenario: 'Staleness', given: 'Test unchanged 90 days', when: 'Checker runs', then: 'Test flagged stale' },
    { id: 'AC-E-3', scenario: 'Coverage gap', given: 'Feature has no tests', when: 'Analyzer runs', then: 'Backlog item created' }
  ],
  estimated_effort: 'Medium (2 sessions)',
  dependencies: ['SD-TEST-MGMT-CICD-001', 'SD-TEST-MGMT-SCANNER-001'],
  blocks: ['SD-TEST-MGMT-SELECTION-001']
};
