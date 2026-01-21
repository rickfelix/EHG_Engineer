/**
 * Test Management Child SD Definitions - Advanced Layer
 *
 * Contains the last 5 child SD definitions for the Test Management System:
 * - SELECTION: Smart test selection
 * - LLM-CORE: Core LLM intelligence
 * - LLM-ADV: Advanced LLM intelligence
 * - DOCS: Documentation and integration
 * - EXEC: Execution and validation
 */

export const selectionSd = {
  id: 'SD-TEST-MGMT-SELECTION-001',
  title: 'Smart Test Selection',
  priority: 'medium',
  rank: 6,
  purpose: 'Implement intelligent test selection based on changed files to optimize CI/CD runtime',
  scope: {
    included: [
      'File-to-test mapping table',
      'Dependency graph analysis',
      'PR-based test selection',
      'Criticality-aware selection (always run P0)',
      'Test impact analysis',
      'Selection confidence scoring',
      'Full suite trigger conditions'
    ],
    excluded: [
      'Machine learning prediction (use rule-based)',
      'Cross-repository impact',
      'Manual override UI'
    ]
  },
  deliverables: [
    'lib/testing/file-test-mapper.js',
    'lib/testing/dependency-analyzer.js',
    'lib/testing/test-selector.js',
    'scripts/select-tests-for-pr.js',
    'file_test_map table population',
    'GitHub Action integration for PR testing'
  ],
  success_criteria: [
    'File-to-test mapping covers all source files',
    'PR test selection reduces average CI time by 40%',
    'P0 tests always run regardless of changes',
    'No regressions slip through selection',
    'Full suite runs on main branch'
  ],
  acceptance_criteria: [
    { id: 'AC-F-1', scenario: 'Component change', given: 'Button.tsx modified', when: 'Selector runs', then: 'Button tests selected' },
    { id: 'AC-F-2', scenario: 'P0 always runs', given: 'Any change', when: 'Selector runs', then: 'P0 tests included' },
    { id: 'AC-F-3', scenario: 'Full suite trigger', given: 'Main branch push', when: 'CI runs', then: 'All tests execute' }
  ],
  estimated_effort: 'Medium (2 sessions)',
  dependencies: ['SD-TEST-MGMT-AUTOMATION-001'],
  blocks: ['SD-TEST-MGMT-LLM-CORE-001']
};

export const llmCoreSd = {
  id: 'SD-TEST-MGMT-LLM-CORE-001',
  title: 'Core LLM Intelligence for Testing',
  priority: 'medium',
  rank: 7,
  purpose: 'Implement foundational GPT 5.2 powered analysis for test quality and failure diagnosis',
  scope: {
    included: [
      'Test Quality Scoring - Rate test effectiveness (coverage, assertions, edge cases)',
      'Failure Root Cause Analysis - Diagnose why tests fail',
      'Test Generation from User Stories - Auto-generate test skeletons',
      'Coverage Gap Identification - Find untested code paths',
      'Flakiness Pattern Detection - Identify timing/race conditions',
      'Test Maintenance Suggestions - Recommend refactoring'
    ],
    excluded: [
      'Advanced features (separate SD)',
      'Real-time analysis (batch only)',
      'Model training (use GPT 5.2)'
    ]
  },
  deliverables: [
    'lib/testing/llm/quality-scorer.js',
    'lib/testing/llm/failure-analyzer.js',
    'lib/testing/llm/test-generator.js',
    'lib/testing/llm/coverage-analyzer.js',
    'lib/testing/llm/flakiness-analyzer.js',
    'lib/testing/llm/maintenance-advisor.js',
    'Cost tracking and budget management',
    'Prompt templates for each analysis type'
  ],
  success_criteria: [
    'Quality scores correlate with actual test value',
    'Root cause analysis accuracy >80%',
    'Generated tests pass code review',
    'Coverage gaps accurately identified',
    'Flakiness patterns correctly diagnosed',
    'Cost per analysis <$0.10'
  ],
  acceptance_criteria: [
    { id: 'AC-G-1', scenario: 'Quality scoring', given: 'Test file', when: 'LLM analyzes', then: 'Score 0-100 with rationale' },
    { id: 'AC-G-2', scenario: 'Root cause', given: 'Failed test with stack', when: 'LLM analyzes', then: 'Root cause identified' },
    { id: 'AC-G-3', scenario: 'Test generation', given: 'User story', when: 'LLM generates', then: 'Valid test skeleton created' }
  ],
  llm_features: [
    { name: 'Test Quality Scoring', cost_per_call: 0.02, batch_size: 10 },
    { name: 'Failure Root Cause Analysis', cost_per_call: 0.05, batch_size: 1 },
    { name: 'Test Generation from User Stories', cost_per_call: 0.08, batch_size: 1 },
    { name: 'Coverage Gap Identification', cost_per_call: 0.03, batch_size: 5 },
    { name: 'Flakiness Pattern Detection', cost_per_call: 0.04, batch_size: 5 },
    { name: 'Test Maintenance Suggestions', cost_per_call: 0.03, batch_size: 10 }
  ],
  estimated_effort: 'Large (3 sessions)',
  dependencies: ['SD-TEST-MGMT-SELECTION-001'],
  blocks: ['SD-TEST-MGMT-LLM-ADV-001']
};

export const llmAdvSd = {
  id: 'SD-TEST-MGMT-LLM-ADV-001',
  title: 'Advanced LLM Intelligence for Testing',
  priority: 'medium',
  rank: 8,
  purpose: 'Implement advanced GPT 5.2 features for risk prioritization, search, and reporting',
  scope: {
    included: [
      'Risk-Based Test Prioritization - Rank tests by failure impact',
      'Natural Language Test Search - Find tests by description',
      'Test Summary Generation - Executive summaries of test health'
    ],
    excluded: [
      'Test Deduplication Detection (low value - removed)',
      'Accessibility Test Generation (low value - removed)',
      'Test Data Generation (low value - removed)',
      'Visual Intelligence Assessment (low value - removed)'
    ]
  },
  deliverables: [
    'lib/testing/llm/risk-prioritizer.js',
    'lib/testing/llm/natural-search.js',
    'lib/testing/llm/summary-generator.js',
    'API endpoints for LLM features',
    'Integration with testing sub-agent',
    'Weekly automated summary reports'
  ],
  success_criteria: [
    'Risk prioritization improves failure detection',
    'Natural language search finds relevant tests',
    'Summaries are actionable and accurate',
    'Cost remains under budget ($50/month)'
  ],
  acceptance_criteria: [
    { id: 'AC-H-1', scenario: 'Risk ranking', given: 'Test suite', when: 'Prioritizer runs', then: 'Tests ranked by impact' },
    { id: 'AC-H-2', scenario: 'NL search', given: 'Query "auth tests"', when: 'Search runs', then: 'Auth-related tests returned' },
    { id: 'AC-H-3', scenario: 'Summary', given: 'Weekly trigger', when: 'Generator runs', then: 'Executive summary created' }
  ],
  llm_features: [
    { name: 'Risk-Based Test Prioritization', cost_per_call: 0.04, batch_size: 20 },
    { name: 'Natural Language Test Search', cost_per_call: 0.02, batch_size: 1 },
    { name: 'Test Summary Generation', cost_per_call: 0.06, batch_size: 1 }
  ],
  removed_features: [
    { name: 'Test Deduplication Detection', reason: 'AST-based detection is more reliable' },
    { name: 'Accessibility Test Generation', reason: 'axe-core rules are deterministic' },
    { name: 'Test Data Generation', reason: 'Faker.js is sufficient' },
    { name: 'Visual Intelligence Assessment', reason: 'Expensive, low ROI for test management' }
  ],
  estimated_effort: 'Medium (2 sessions)',
  dependencies: ['SD-TEST-MGMT-LLM-CORE-001'],
  blocks: ['SD-TEST-MGMT-DOCS-001']
};

export const docsSd = {
  id: 'SD-TEST-MGMT-DOCS-001',
  title: 'Test Management Documentation & Integration',
  priority: 'medium',
  rank: 9,
  purpose: 'Document the test management system and integrate with existing testing sub-agent',
  scope: {
    included: [
      'Update testing sub-agent to query registry',
      'Update testing skills with new capabilities',
      'Comprehensive README documentation',
      'API documentation for all services',
      'Integration guide for new tests',
      'Dashboard requirements specification'
    ],
    excluded: [
      'Dashboard implementation (future SD)',
      'Video tutorials',
      'External documentation'
    ]
  },
  deliverables: [
    'Updated lib/sub-agents/testing.js',
    'Updated skills for test management',
    'docs/testing/TEST-MANAGEMENT-SYSTEM.md',
    'docs/testing/API-REFERENCE.md',
    'docs/testing/INTEGRATION-GUIDE.md',
    'docs/testing/DASHBOARD-REQUIREMENTS.md'
  ],
  success_criteria: [
    'Testing sub-agent uses registry',
    'Skills leverage new capabilities',
    'Documentation is comprehensive',
    'New team members can onboard quickly',
    'API is fully documented'
  ],
  acceptance_criteria: [
    { id: 'AC-I-1', scenario: 'Sub-agent query', given: 'Test analysis request', when: 'Sub-agent runs', then: 'Registry data used' },
    { id: 'AC-I-2', scenario: 'Documentation', given: 'New developer', when: 'Reads docs', then: 'Can add tests correctly' },
    { id: 'AC-I-3', scenario: 'Skill update', given: 'Skill invoked', when: 'Runs', then: 'Uses new test management' }
  ],
  estimated_effort: 'Small (1 session)',
  dependencies: ['SD-TEST-MGMT-LLM-ADV-001'],
  blocks: ['SD-TEST-MGMT-EXEC-001']
};

export const execSd = {
  id: 'SD-TEST-MGMT-EXEC-001',
  title: 'Test Management Execution & Validation',
  priority: 'high',
  rank: 10,
  purpose: 'Execute the complete test management workflow and validate all components work together',
  scope: {
    included: [
      'End-to-end workflow validation',
      'Performance benchmarking',
      'Error handling verification',
      'Rollback procedure testing',
      'Load testing with full test suite',
      'Integration testing across all components',
      'Production readiness checklist'
    ],
    excluded: [
      'Long-term monitoring (ongoing)',
      'A/B testing of features',
      'User acceptance testing (continuous)'
    ]
  },
  deliverables: [
    'scripts/validate-test-management.js',
    'E2E tests for test management system',
    'Performance benchmark report',
    'Rollback runbook',
    'Production readiness checklist (completed)',
    'Launch announcement'
  ],
  success_criteria: [
    'Full workflow executes without errors',
    'Performance meets benchmarks (<5s for scan)',
    'All automation triggers correctly',
    'LLM features return valid results',
    'Rollback procedure tested and documented'
  ],
  acceptance_criteria: [
    { id: 'AC-J-1', scenario: 'Full workflow', given: 'New test added', when: 'Workflow runs', then: 'Test tracked end-to-end' },
    { id: 'AC-J-2', scenario: 'Performance', given: 'Full scan', when: 'Timed', then: '<5 seconds for 143 tests' },
    { id: 'AC-J-3', scenario: 'Rollback', given: 'System failure', when: 'Rollback executed', then: 'Previous state restored' }
  ],
  estimated_effort: 'Medium (2 sessions)',
  dependencies: ['SD-TEST-MGMT-DOCS-001'],
  blocks: []
};
