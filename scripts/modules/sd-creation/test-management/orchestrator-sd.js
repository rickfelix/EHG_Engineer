/**
 * Test Management Orchestrator SD Definition
 *
 * Contains the orchestrator SD data factory for SD-TEST-MANAGEMENT-001.
 * Used by create-sd-test-management-orchestrator.js
 */

import { randomUUID } from 'crypto';
import { childSDs, EXECUTION_ORDER, DEPENDENCY_GRAPH } from './child-sds.js';

/**
 * Create the orchestrator SD data object
 * @returns {Object} Orchestrator SD data
 */
export function createOrchestratorSD() {
  return {
    id: 'SD-TEST-MANAGEMENT-001',

    title: 'Test Management System Orchestrator',

    description: 'Master Strategic Directive orchestrating the implementation of a comprehensive, database-driven test management system. This system tracks all tests (unit, integration, E2E) in a central registry, auto-captures CI/CD results, and leverages GPT 5.2 for intelligent analysis including quality scoring, failure diagnosis, and test generation.',

    rationale: `Following the completion of SD-E2E-UAT-COVERAGE-001 (143+ tests), the EHG platform needs systematic test management to:
(1) Track test health across the growing test suite
(2) Detect and quarantine flaky tests automatically
(3) Identify coverage gaps and stale tests
(4) Optimize CI/CD runtime with smart test selection
(5) Leverage LLM intelligence for test quality and failure analysis
(6) Integrate with existing testing sub-agent and skills

Current state: 143+ tests with no central registry, manual flakiness detection, no coverage mapping, and limited automation.`,

    scope: JSON.stringify({
      included: [
        'Database schema for test registry (tests, runs, fixtures, mappings)',
        'Test cleanup and migration to standardized patterns',
        'Scanner to auto-register existing 143+ tests',
        'CI/CD integration for automatic result capture',
        'Automation workflows (flakiness, staleness, coverage gaps)',
        'Smart test selection for PR optimization',
        'Core LLM intelligence (6 features)',
        'Advanced LLM intelligence (3 features)',
        'Documentation and sub-agent integration',
        'Execution validation and production readiness'
      ],
      excluded: [
        'Test dashboard UI (future SD)',
        'Cross-repository test management',
        'Third-party CI systems (GitHub Actions only)',
        'Machine learning model training'
      ],
      boundaries: [
        'Each child SD goes through full LEAD->PLAN->EXEC',
        'LLM costs capped at $50/month',
        'Multi-venture support with RLS isolation'
      ]
    }),

    category: 'infrastructure',
    priority: 'critical',
    status: 'draft',

    sd_key: 'SD-TEST-MANAGEMENT-001',
    target_application: 'EHG',
    current_phase: 'LEAD',
    sd_type: 'orchestrator',

    strategic_intent: 'Transform test management from ad-hoc file scanning to a comprehensive, database-driven system with intelligent automation and LLM-powered analysis.',

    strategic_objectives: [
      'Create central registry tracking all 143+ tests',
      'Auto-capture 100% of CI/CD test results',
      'Reduce flaky test impact with auto-quarantine',
      'Optimize CI runtime by 40% with smart selection',
      'Leverage GPT 5.2 for quality and failure analysis',
      'Integrate with existing testing sub-agent'
    ],

    success_criteria: [
      'All tests registered with metadata in database',
      'Every CI run captured with full details',
      'Flaky tests quarantined within 24 hours',
      'Coverage gaps auto-create backlog items',
      'LLM analysis available for all tests',
      'Testing sub-agent queries registry'
    ],

    key_changes: [
      '6+ new database tables',
      '15+ new services/utilities',
      '10+ new scripts',
      'CI/CD workflow updates',
      'Sub-agent and skill updates',
      'LLM integration (GPT 5.2)'
    ],

    key_principles: [
      'Database-first: All test data in central registry',
      'Auto-capture: No manual result entry',
      'Intelligent automation: Flakiness, staleness, gaps',
      'LLM-augmented: Quality, analysis, generation',
      'Multi-venture: RLS isolation per venture',
      'Cost-conscious: LLM budget capped'
    ],

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    uuid_id: randomUUID(),
    version: '1.0',
    phase_progress: 0,
    progress: 0,
    is_active: true,

    dependencies: [
      'Existing 143+ tests in tests/ directory',
      'GitHub Actions CI/CD infrastructure',
      'Supabase database',
      'Testing sub-agent (lib/sub-agents/testing.js)',
      'GPT 5.2 API access'
    ],

    risks: [
      {
        description: 'LLM costs exceed budget',
        mitigation: 'Implement cost tracking, batch operations, budget alerts',
        severity: 'medium'
      },
      {
        description: 'Smart selection misses regressions',
        mitigation: 'Always run P0 tests, full suite on main branch',
        severity: 'high'
      },
      {
        description: 'Schema migration breaks existing tests',
        mitigation: 'Additive schema changes, thorough testing',
        severity: 'low'
      }
    ],

    success_metrics: [
      'Test registry coverage: 100% of tests',
      'CI result capture rate: 100%',
      'Flaky test MTTR: <24 hours',
      'CI time reduction: 40%',
      'LLM analysis accuracy: >80%',
      'Monthly LLM cost: <$50'
    ],

    implementation_guidelines: [
      'Execute in order: Schema -> Cleanup -> Scanner -> CI/CD -> Automation -> Selection -> LLM Core -> LLM Adv -> Docs -> Execution',
      'Schema blocks all other children (foundation)',
      'Cleanup must precede Scanner (clean before register)',
      'LLM features are incremental (core before advanced)',
      'All SDs go through LEAD->PLAN->EXEC'
    ],

    metadata: {
      origin: 'SD-E2E-UAT-COVERAGE-001 completion + GPT 5.2 integration research',

      current_test_count: 143,
      test_types: ['unit', 'integration', 'e2e'],

      llm_config: {
        model: 'gpt-5.2',
        monthly_budget: 50,
        core_features: 6,
        advanced_features: 3,
        removed_features: 4
      },

      automation_features: [
        'Flakiness detection (>20% failure -> quarantine)',
        'Staleness detection (90 days no update)',
        'Coverage gap detection (features without tests)',
        'Test ownership auto-assignment',
        'Performance baseline drift detection',
        'Rollback triggers on regression'
      ],

      criticality_tiers: {
        P0: { description: 'Critical path - always run', examples: ['auth', 'checkout', 'data integrity'] },
        P1: { description: 'Important - run on related changes', examples: ['feature tests', 'integration'] },
        P2: { description: 'Nice to have - run on full suite', examples: ['edge cases', 'visual'] }
      },

      child_sds: childSDs,
      child_count: childSDs.length,

      dependency_graph: DEPENDENCY_GRAPH,

      execution_order: EXECUTION_ORDER,

      effort_summary: {
        total_sessions: '18-20 sessions',
        by_child: [
          { id: 'SD-TEST-MGMT-SCHEMA-001', sessions: '1' },
          { id: 'SD-TEST-MGMT-CLEANUP-001', sessions: '2' },
          { id: 'SD-TEST-MGMT-SCANNER-001', sessions: '2' },
          { id: 'SD-TEST-MGMT-CICD-001', sessions: '2' },
          { id: 'SD-TEST-MGMT-AUTOMATION-001', sessions: '2' },
          { id: 'SD-TEST-MGMT-SELECTION-001', sessions: '2' },
          { id: 'SD-TEST-MGMT-LLM-CORE-001', sessions: '3' },
          { id: 'SD-TEST-MGMT-LLM-ADV-001', sessions: '2' },
          { id: 'SD-TEST-MGMT-DOCS-001', sessions: '1' },
          { id: 'SD-TEST-MGMT-EXEC-001', sessions: '2' }
        ]
      }
    }
  };
}

/**
 * Transform a child SD definition into database record format
 * @param {Object} child - Child SD definition from child-sds.js
 * @param {string} parentId - Parent orchestrator SD ID
 * @returns {Object} Database record format
 */
export function createChildSDRecord(child, parentId) {
  return {
    id: child.id,
    title: child.title,
    description: child.purpose,
    rationale: `Part of ${parentId} orchestrator. ${child.purpose}`,
    scope: JSON.stringify(child.scope),
    category: 'infrastructure',
    priority: child.priority,
    status: 'draft',
    sd_key: child.id,
    target_application: 'EHG',
    current_phase: 'LEAD',
    sd_type: 'implementation',
    parent_sd_id: parentId,
    strategic_intent: child.purpose,
    strategic_objectives: child.deliverables.slice(0, 5),
    success_criteria: child.success_criteria,
    key_changes: child.deliverables,
    key_principles: [
      'Part of Test Management System',
      'Database-driven approach',
      'Automation-first'
    ],
    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    uuid_id: randomUUID(),
    version: '1.0',
    phase_progress: 0,
    progress: 0,
    is_active: true,
    dependencies: child.dependencies,
    risks: [],
    success_metrics: child.success_criteria,
    implementation_guidelines: [
      `Execution order: ${child.rank} of ${childSDs.length}`,
      `Dependencies: ${child.dependencies.join(', ') || 'None'}`,
      `Blocks: ${child.blocks.join(', ') || 'None'}`
    ],
    metadata: {
      parent_sd: parentId,
      rank: child.rank,
      estimated_effort: child.estimated_effort,
      acceptance_criteria: child.acceptance_criteria,
      deliverables: child.deliverables,
      blocks: child.blocks,
      llm_features: child.llm_features || null,
      removed_features: child.removed_features || null
    }
  };
}
