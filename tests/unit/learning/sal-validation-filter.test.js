import { describe, it, expect } from 'vitest';
import { isNonActionableRecommendation } from '../../../scripts/modules/learning/context-builder.js';

// SD-LEARN-FIX-ADDRESS-SAL-VALIDATION-002: the VALIDATION sub-agent's generic checklist boilerplate
// (SAL-VALIDATION-REC) recurred 3x, minting noise /learn SDs. These are normal process reminders,
// not specific problems — they must be filtered as non-actionable.

describe('SAL-VALIDATION-REC filtering (SD-LEARN-FIX-ADDRESS-SAL-VALIDATION-002)', () => {
  const VALIDATION_BOILERPLATE = [
    'PLAN agent should create PRD before EXEC phase begins',
    'Link backlog items to define clear requirements OR document reason for no backlog',
    'Perform codebase search to identify existing infrastructure (prevents duplicate work)',
    'Complete gap analysis: Compare backlog requirements vs existing code',
    'Execute QA Engineering Director before final approval (MANDATORY per protocol)',
  ];

  it('filters every recurring VALIDATION generic-checklist recommendation', () => {
    for (const rec of VALIDATION_BOILERPLATE) {
      expect(isNonActionableRecommendation(rec)).toBe(true);
    }
  });

  it('does NOT over-filter a genuinely actionable VALIDATION finding', () => {
    expect(isNonActionableRecommendation('Validation gate reads stale sub_agent_execution_results — dedupe by phase')).toBe(false);
    expect(isNonActionableRecommendation('directive_id foreign key missing on product_requirements_v2')).toBe(false);
  });
});
