#!/usr/bin/env node
/**
 * Fix Stage Architecture Child SD Strategic Fields
 *
 * Populates missing strategic fields for P5-P10 child SDs
 * to enable LEAD-TO-PLAN handoff validation.
 *
 * P4 already has fields populated from earlier work.
 *
 * Usage: node scripts/fix-stage-arch-child-sd-fields.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Strategic fields for each phase SD
const PHASE_UPDATES = [
  // P5: Governance & Polish
  {
    id: 'SD-STAGE-ARCH-001-P5',
    success_metrics: [
      { metric: 'CI governance rules active', target: 100, unit: 'percent' },
      { metric: 'Stage audit test coverage', target: 25, unit: 'stages' },
      { metric: 'No-hardcoded-counts lint violations', target: 0, unit: 'errors' },
      { metric: 'E2E golden path test pass rate', target: 100, unit: 'percent' }
    ],
    key_principles: [
      { principle: 'Permanent Governance', description: 'CI rules prevent regression of hardcoded values' },
      { principle: 'Documentation First', description: 'All changes documented before merge' },
      { principle: 'Full Lifecycle Coverage', description: 'E2E test covers stages 1-25' }
    ],
    strategic_objectives: [
      { objective: 'Implement stage audit test', metric: 'All 25 stages validated' },
      { objective: 'Add lint rule for hardcoded counts', metric: 'ESLint rule active in CI' },
      { objective: 'Create Vision V2 compliance check', metric: 'Check runs on every PR' },
      { objective: 'Document V2 architecture', metric: 'README complete' }
    ],
    success_criteria: [
      { criterion: 'CI pipeline includes stage audit', measure: 'GitHub Action runs on PR' },
      { criterion: 'Hardcoded counts blocked by lint', measure: 'ESLint rule prevents "40" values' },
      { criterion: 'E2E test passes for full venture lifecycle', measure: 'Stages 1-25 navigable' }
    ],
    risks: [
      { risk: 'ESLint rule too strict blocks valid code', severity: 'LOW', mitigation: 'Use specific pattern matching for count violations' },
      { risk: 'E2E test flaky due to async operations', severity: 'MEDIUM', mitigation: 'Add proper waits and retry logic' }
    ]
  },

  // P6: EVA Service Timeout & Resilience
  {
    id: 'SD-STAGE-ARCH-001-P6',
    success_metrics: [
      { metric: 'EVA API timeout implemented', target: 10, unit: 'seconds' },
      { metric: 'Error recovery coverage', target: 100, unit: 'percent' },
      { metric: 'Hanging request incidents', target: 0, unit: 'count' },
      { metric: 'Graceful degradation paths', target: 3, unit: 'scenarios' }
    ],
    key_principles: [
      { principle: 'Fail Fast', description: 'Timeout after 10 seconds rather than hanging indefinitely' },
      { principle: 'Graceful Degradation', description: 'Show helpful error state when AI unavailable' },
      { principle: 'User Feedback', description: 'Always inform user of AI request status' }
    ],
    strategic_objectives: [
      { objective: 'Add AbortController to ai-service-manager', metric: 'All fetch calls have timeout' },
      { objective: 'Implement error boundary for AI failures', metric: 'Errors caught and displayed' },
      { objective: 'Add retry logic with exponential backoff', metric: '3 retries before failure' }
    ],
    success_criteria: [
      { criterion: 'No requests hang > 15 seconds', measure: 'Timeout triggers at 10s' },
      { criterion: 'Error states show helpful messages', measure: 'User sees "AI unavailable" not crash' },
      { criterion: 'Unit tests cover timeout scenarios', measure: 'Mock timeouts pass' }
    ],
    risks: [
      { risk: 'Timeout too aggressive for slow models', severity: 'MEDIUM', mitigation: 'Make timeout configurable, start with 10s' },
      { risk: 'Retry logic causes rate limiting', severity: 'LOW', mitigation: 'Exponential backoff with jitter' }
    ]
  },

  // P7: God Component Refactoring
  {
    id: 'SD-STAGE-ARCH-001-P7',
    success_metrics: [
      { metric: 'Components refactored', target: 4, unit: 'components' },
      { metric: 'Max component LOC', target: 600, unit: 'lines' },
      { metric: 'Behavior regressions', target: 0, unit: 'count' },
      { metric: 'Test coverage maintained', target: 100, unit: 'percent' }
    ],
    key_principles: [
      { principle: 'Extract, Dont Rewrite', description: 'Move code to sub-components, preserve logic' },
      { principle: 'One Concern Per Component', description: 'Each sub-component has single responsibility' },
      { principle: 'Regression Safety', description: 'Capture baseline before refactoring' }
    ],
    strategic_objectives: [
      { objective: 'Refactor Stage04CompetitiveIntelligence (1290 LOC)', metric: 'Under 600 LOC' },
      { objective: 'Refactor Stage06RiskEvaluation (37KB)', metric: 'Under 600 LOC' },
      { objective: 'Refactor Stage07ComprehensivePlanning (36KB)', metric: 'Under 600 LOC' },
      { objective: 'Refactor Stage09GapAnalysis (1116 LOC)', metric: 'Under 600 LOC' }
    ],
    success_criteria: [
      { criterion: 'All 4 components under 600 LOC', measure: 'LOC check passes in CI' },
      { criterion: 'No behavior changes detected', measure: 'Regression tests pass' },
      { criterion: 'Sub-components properly extracted', measure: 'Each has single concern' }
    ],
    risks: [
      { risk: 'Refactoring introduces subtle bugs', severity: 'HIGH', mitigation: 'Capture baseline screenshots, run regression tests' },
      { risk: 'Shared state breaks when extracted', severity: 'MEDIUM', mitigation: 'Use context or prop drilling carefully' }
    ]
  },

  // P8: Stage Component Test Suite
  {
    id: 'SD-STAGE-ARCH-001-P8',
    success_metrics: [
      { metric: 'Stage components with tests', target: 25, unit: 'stages' },
      { metric: 'Test file coverage', target: 100, unit: 'percent' },
      { metric: 'Render tests passing', target: 25, unit: 'tests' },
      { metric: 'Data loading tests', target: 25, unit: 'tests' }
    ],
    key_principles: [
      { principle: 'Test Every Stage', description: 'No stage component without a test file' },
      { principle: 'Render First', description: 'Basic render test before complex scenarios' },
      { principle: 'Mock Supabase', description: 'Tests should not require database connection' }
    ],
    strategic_objectives: [
      { objective: 'Create __tests__ directory structure', metric: 'Directory exists' },
      { objective: 'Add render test for each stage', metric: '25 render tests' },
      { objective: 'Add data loading test for each stage', metric: '25 data tests' },
      { objective: 'Add validation test for form stages', metric: 'Form stages covered' }
    ],
    success_criteria: [
      { criterion: 'Every stage has test file', measure: '25 test files in __tests__/' },
      { criterion: 'All tests pass in CI', measure: 'Jest exit code 0' },
      { criterion: 'Coverage meets threshold', measure: '>80% line coverage for stages' }
    ],
    risks: [
      { risk: 'Test setup complex due to providers', severity: 'MEDIUM', mitigation: 'Create test-utils with common wrapper' },
      { risk: 'Mocking Supabase difficult', severity: 'LOW', mitigation: 'Use msw or manual mock' }
    ]
  },

  // P9: API Error Handling & Observability
  {
    id: 'SD-STAGE-ARCH-001-P9',
    success_metrics: [
      { metric: 'Error codes with graceful UX', target: 100, unit: 'percent' },
      { metric: 'Correlation ID coverage', target: 100, unit: 'percent' },
      { metric: 'Idempotency headers on mutations', target: 100, unit: 'percent' },
      { metric: 'Unhandled errors in production', target: 0, unit: 'count' }
    ],
    key_principles: [
      { principle: 'User-Friendly Errors', description: 'Technical errors translated to helpful messages' },
      { principle: 'Debug Traceability', description: 'Every request has correlation ID' },
      { principle: 'Safe Retries', description: 'Mutations use idempotency keys' }
    ],
    strategic_objectives: [
      { objective: 'Add graceful UX for 400/403 errors', metric: 'Error toasts with helpful messages' },
      { objective: 'Implement client-side correlation IDs', metric: 'X-Correlation-ID on all requests' },
      { objective: 'Add Idempotency-Key to mutations', metric: 'All POST/PUT/DELETE have key' },
      { objective: 'Improve error logging', metric: 'Structured logs with context' }
    ],
    success_criteria: [
      { criterion: 'All API errors show user message', measure: 'No raw error codes in UI' },
      { criterion: 'Correlation IDs in headers', measure: 'Every request has ID' },
      { criterion: 'Mutations are idempotent', measure: 'Retry doesnt create duplicates' }
    ],
    risks: [
      { risk: 'Correlation ID overhead in high-traffic', severity: 'LOW', mitigation: 'UUID generation is cheap' },
      { risk: 'Idempotency key storage fills up', severity: 'LOW', mitigation: 'TTL-based cleanup' }
    ]
  },

  // P10: Vision Alignment Review & Next SD Generation
  {
    id: 'SD-STAGE-ARCH-001-P10',
    success_metrics: [
      { metric: 'Vision spec alignment', target: 100, unit: 'percent' },
      { metric: 'Stage-spec mapping complete', target: 25, unit: 'stages' },
      { metric: 'Next SDs generated', target: 3, unit: 'SDs' },
      { metric: 'Documentation gaps', target: 0, unit: 'count' }
    ],
    key_principles: [
      { principle: 'Spec Compliance', description: 'Every stage matches Vision V2 specification' },
      { principle: 'Forward Planning', description: 'Generate SDs for remaining work' },
      { principle: 'Close the Loop', description: 'Document lessons learned' }
    ],
    strategic_objectives: [
      { objective: 'Review against SIMULATION_CHAMBER_ARCHITECTURE.md', metric: 'All stages validated' },
      { objective: 'Review against GENESIS_RITUAL_SPECIFICATION.md', metric: 'All gates validated' },
      { objective: 'Generate next SD batch', metric: '3 SDs for remaining work' },
      { objective: 'Create retrospective', metric: 'Lessons documented' }
    ],
    success_criteria: [
      { criterion: 'All 25 stages match Vision V2', measure: 'Compliance check passes' },
      { criterion: 'Kill gates match spec', measure: 'Stages 3,5,13,23 validated' },
      { criterion: 'Promotion gates match spec', measure: 'Stages 16,17,22 validated' },
      { criterion: 'Next work identified', measure: 'SDs created for gaps' }
    ],
    risks: [
      { risk: 'Vision specs changed during implementation', severity: 'MEDIUM', mitigation: 'Re-read specs before validation' },
      { risk: 'Gaps larger than expected', severity: 'LOW', mitigation: 'Generate additional SDs as needed' }
    ]
  }
];

async function fixChildSDs() {
  console.log('Fixing Stage Architecture Child SD Strategic Fields...\n');
  console.log('=' .repeat(60));

  for (const update of PHASE_UPDATES) {
    const { id, ...fields } = update;

    // Add updated_at
    fields.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update(fields)
      .eq('id', id);

    if (error) {
      console.error(`FAILED ${id}: ${error.message}`);
    } else {
      console.log(`✅ ${id}`);
      console.log(`   metrics: ${update.success_metrics.length}, principles: ${update.key_principles.length}, objectives: ${update.strategic_objectives.length}`);
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('Done! Verify with: node scripts/handoff.js execute LEAD-TO-PLAN SD-STAGE-ARCH-001-P5');
}

fixChildSDs().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
