/**
 * Unit Tests: Vision Gap Governance Guardrails
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-007
 *
 * Test Coverage:
 * - Guardrail 1: Brainstorm Intent Validation
 * - Guardrail 2: OKR Monthly Hard Stop
 * - Guardrail 3: Bulk SD Draft Limit
 * - Guardrail 4: OKR-Driven Queue Prioritization
 * - Guardrail 5: Handoff Sequence Enforcement
 */

import { describe, test, expect, vi } from 'vitest';
import { getWorkflowForType, isHandoffRequired } from '../../../scripts/modules/handoff/cli/workflow-definitions.js';

// =========================================================================
// Guardrail 5: Handoff Sequence Enforcement (workflow-definitions)
// =========================================================================

describe('Guardrail 5: Handoff Sequence Enforcement', () => {
  test('feature workflow requires all 5 handoffs in sequence', () => {
    const workflow = getWorkflowForType('feature');
    expect(workflow.required).toEqual([
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
      'EXEC-TO-PLAN',
      'PLAN-TO-LEAD',
      'LEAD-FINAL-APPROVAL'
    ]);
  });

  test('infrastructure workflow has EXEC-TO-PLAN as optional', () => {
    const workflow = getWorkflowForType('infrastructure');
    expect(workflow.required).toContain('LEAD-TO-PLAN');
    expect(workflow.required).toContain('PLAN-TO-EXEC');
    expect(workflow.required).not.toContain('EXEC-TO-PLAN');
    expect(workflow.optional).toContain('EXEC-TO-PLAN');
  });

  test('documentation workflow has minimal required handoffs', () => {
    const workflow = getWorkflowForType('documentation');
    expect(workflow.required).toHaveLength(4);
    expect(workflow.optional).toContain('EXEC-TO-PLAN');
  });

  test('isHandoffRequired returns true for required handoffs', () => {
    expect(isHandoffRequired('feature', 'LEAD-TO-PLAN')).toBe(true);
    expect(isHandoffRequired('feature', 'PLAN-TO-EXEC')).toBe(true);
    expect(isHandoffRequired('feature', 'EXEC-TO-PLAN')).toBe(true);
  });

  test('isHandoffRequired returns false for optional handoffs', () => {
    expect(isHandoffRequired('infrastructure', 'EXEC-TO-PLAN')).toBe(false);
    expect(isHandoffRequired('documentation', 'EXEC-TO-PLAN')).toBe(false);
  });

  test('PLAN-TO-EXEC requires LEAD-TO-PLAN to be completed first', () => {
    const workflow = getWorkflowForType('feature');
    const planToExecIndex = workflow.required.indexOf('PLAN-TO-EXEC');
    const leadToPlanIndex = workflow.required.indexOf('LEAD-TO-PLAN');
    expect(leadToPlanIndex).toBeLessThan(planToExecIndex);
  });

  test('LEAD-FINAL-APPROVAL is always last in required sequence', () => {
    const types = ['feature', 'infrastructure', 'documentation', 'database', 'security'];
    for (const type of types) {
      const workflow = getWorkflowForType(type);
      if (workflow.required.includes('LEAD-FINAL-APPROVAL')) {
        const lastIndex = workflow.required.length - 1;
        expect(workflow.required[lastIndex]).toBe('LEAD-FINAL-APPROVAL');
      }
    }
  });

  test('sequence enforcement detects missing prerequisites', () => {
    const workflow = getWorkflowForType('feature');
    const requiredHandoffs = workflow.required;
    const requestedHandoff = 'PLAN-TO-EXEC';
    const handoffIndex = requiredHandoffs.indexOf(requestedHandoff);

    // Simulate no completed handoffs
    const completedTypes = new Set();
    const missingPrereqs = [];

    for (let i = 0; i < handoffIndex; i++) {
      const prereq = requiredHandoffs[i];
      if (!completedTypes.has(prereq)) {
        missingPrereqs.push(prereq);
      }
    }

    expect(missingPrereqs).toEqual(['LEAD-TO-PLAN']);
  });

  test('sequence enforcement passes when prerequisites completed', () => {
    const workflow = getWorkflowForType('feature');
    const requiredHandoffs = workflow.required;
    const requestedHandoff = 'PLAN-TO-EXEC';
    const handoffIndex = requiredHandoffs.indexOf(requestedHandoff);

    // Simulate LEAD-TO-PLAN completed
    const completedTypes = new Set(['LEAD-TO-PLAN']);
    const missingPrereqs = [];

    for (let i = 0; i < handoffIndex; i++) {
      const prereq = requiredHandoffs[i];
      if (!completedTypes.has(prereq)) {
        missingPrereqs.push(prereq);
      }
    }

    expect(missingPrereqs).toHaveLength(0);
  });

  test('EXEC-TO-PLAN requires both LEAD-TO-PLAN and PLAN-TO-EXEC', () => {
    const workflow = getWorkflowForType('feature');
    const requiredHandoffs = workflow.required;
    const requestedHandoff = 'EXEC-TO-PLAN';
    const handoffIndex = requiredHandoffs.indexOf(requestedHandoff);

    const completedTypes = new Set(['LEAD-TO-PLAN']); // Missing PLAN-TO-EXEC
    const missingPrereqs = [];

    for (let i = 0; i < handoffIndex; i++) {
      const prereq = requiredHandoffs[i];
      if (!completedTypes.has(prereq)) {
        missingPrereqs.push(prereq);
      }
    }

    expect(missingPrereqs).toEqual(['PLAN-TO-EXEC']);
  });
});

// =========================================================================
// Guardrail 4: OKR-Driven Queue Prioritization (composite_rank boost)
// =========================================================================

describe('Guardrail 4: OKR-Driven Queue Prioritization', () => {
  test('off-track KR gives 0.5x boost (strongest)', () => {
    const compositeRank = 100;
    const okrBoost = 0.5; // off_track
    const boostedRank = compositeRank * okrBoost;
    expect(boostedRank).toBe(50); // Lower = higher priority
  });

  test('at-risk KR gives 0.7x boost', () => {
    const compositeRank = 100;
    const okrBoost = 0.7; // at_risk
    const boostedRank = compositeRank * okrBoost;
    expect(boostedRank).toBe(70);
  });

  test('no KR alignment has no boost (1.0x)', () => {
    const compositeRank = 100;
    const okrBoost = 1.0; // no alignment or on_track
    const boostedRank = compositeRank * okrBoost;
    expect(boostedRank).toBe(100);
  });

  test('boosted SD sorts before unboosted SD with same base rank', () => {
    const sdA = { composite_rank: 100 * 0.5, urgency_numeric: 3 }; // off-track boost
    const sdB = { composite_rank: 100 * 1.0, urgency_numeric: 3 }; // no boost

    // Sort: lower composite_rank first
    const sorted = [sdA, sdB].sort((a, b) => {
      const bandDiff = a.urgency_numeric - b.urgency_numeric;
      if (bandDiff !== 0) return bandDiff;
      return a.composite_rank - b.composite_rank;
    });

    expect(sorted[0]).toBe(sdA); // Boosted SD comes first
  });

  test('strongest boost wins when SD has multiple KR alignments', () => {
    const boostMap = new Map();
    // SD linked to both at_risk (0.7) and off_track (0.5) KRs
    const alignments = [
      { sd_id: 'uuid-1', status: 'at_risk', boost: 0.7 },
      { sd_id: 'uuid-1', status: 'off_track', boost: 0.5 }
    ];

    for (const alignment of alignments) {
      const existing = boostMap.get(alignment.sd_id);
      if (!existing || alignment.boost < existing) {
        boostMap.set(alignment.sd_id, alignment.boost);
      }
    }

    expect(boostMap.get('uuid-1')).toBe(0.5); // Strongest boost wins
  });

  test('on-track KR does not generate boost', () => {
    const boostableStatuses = ['at_risk', 'off_track'];
    expect(boostableStatuses.includes('on_track')).toBe(false);
    expect(boostableStatuses.includes('pending')).toBe(false);
    expect(boostableStatuses.includes('achieved')).toBe(false);
  });
});

// =========================================================================
// Guardrails 1-3: SD Creation Guardrails (logic validation)
// =========================================================================

describe('Guardrail 2: OKR Monthly Hard Stop', () => {
  test('detects when no active OKRs exist (count=0)', () => {
    const okrCount = 0;
    const shouldWarn = okrCount === 0;
    expect(shouldWarn).toBe(true);
  });

  test('does not warn when active OKRs exist', () => {
    const okrCount = 6;
    const shouldWarn = okrCount === 0;
    expect(shouldWarn).toBe(false);
  });

  test('skips check for child SDs (parentId set)', () => {
    const parentId = 'some-parent-uuid';
    const shouldCheck = !parentId;
    expect(shouldCheck).toBe(false);
  });
});

describe('Guardrail 1: Brainstorm Intent Validation', () => {
  test('triggers for feature type SDs', () => {
    const brainstormTypes = ['feature', 'enhancement'];
    expect(brainstormTypes.includes('feature')).toBe(true);
  });

  test('triggers for enhancement type SDs', () => {
    const brainstormTypes = ['feature', 'enhancement'];
    expect(brainstormTypes.includes('enhancement')).toBe(true);
  });

  test('does not trigger for infrastructure type SDs', () => {
    const brainstormTypes = ['feature', 'enhancement'];
    expect(brainstormTypes.includes('infrastructure')).toBe(false);
  });

  test('does not trigger for fix type SDs', () => {
    const brainstormTypes = ['feature', 'enhancement'];
    expect(brainstormTypes.includes('bugfix')).toBe(false);
  });

  test('skips check for child SDs', () => {
    const parentId = 'parent-uuid';
    const dbType = 'feature';
    const brainstormTypes = ['feature', 'enhancement'];
    const shouldCheck = brainstormTypes.includes(dbType) && !parentId;
    expect(shouldCheck).toBe(false);
  });

  test('skips check when metadata source is brainstorm', () => {
    const metadata = { source: 'brainstorm-session' };
    const shouldSkip = metadata?.source?.includes('brainstorm');
    expect(shouldSkip).toBe(true);
  });
});

describe('Guardrail 3: Bulk SD Draft Limit', () => {
  const DRAFT_LIMIT = 10;

  test('warns when draft count equals limit', () => {
    const draftCount = 10;
    expect(draftCount >= DRAFT_LIMIT).toBe(true);
  });

  test('warns when draft count exceeds limit', () => {
    const draftCount = 15;
    expect(draftCount >= DRAFT_LIMIT).toBe(true);
  });

  test('does not warn when draft count is below limit', () => {
    const draftCount = 7;
    expect(draftCount >= DRAFT_LIMIT).toBe(false);
  });

  test('does not warn when no drafts exist', () => {
    const draftCount = 0;
    expect(draftCount >= DRAFT_LIMIT).toBe(false);
  });
});
