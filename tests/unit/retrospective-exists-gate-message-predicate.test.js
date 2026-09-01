// QF-20260901-068 — RETROSPECTIVE_EXISTS's failure message named the SCORE for BOTH the
// `!assessment.passed` clause AND the `score < minScore` clause (gates.js:480), even though
// they are two independent predicates. Live specimen: SD-LEO-INFRA-PHASE-DESIGN-OKR-001 scored
// 61 (above the 60 minimum) yet printed "Retrospective assessed score 61% is below minimum
// 60%" because `retroQuality.passed` (not score-derived) was the clause that actually fired.
// This test drives the real gate validator with the score-clause PASSING and the passed-clause
// FAILING, and asserts the message names the non-score cause instead of the self-contradicting
// "score below minimum" sentence.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../scripts/modules/sd-type-checker.js', () => ({
  getTierForSD: () => 3,
}));

vi.mock('../../scripts/modules/handoff/retro-filters.js', () => ({
  getFilteredRetrospective: async () => ({
    retrospective: { id: 'retro-1', quality_score: 61, status: 'draft' },
    leadToPlanAcceptedAt: '2026-01-01T00:00:00Z',
  }),
  isValidPreflightRetro: () => false,
}));

vi.mock('../../scripts/modules/sd-quality-validation.js', () => ({
  validateSDCompletionReadiness: async () => ({
    passed: false,
    score: 61,
    manual_review_required: false,
    warnings: [],
    retroQuality: { passed: false, issues: ['thin retro: no SD-specific learnings'] },
  }),
}));

import { createRetrospectiveExistsGate } from '../../scripts/modules/handoff/executors/lead-final-approval/gates.js';

describe('RETROSPECTIVE_EXISTS gate — message names the actual failing clause', () => {
  it('score >= minScore but passed=false: message names the non-score cause, not "below minimum"', async () => {
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator({ sd: { id: 'sd-1', sd_key: 'SD-T-001', sd_type: 'infrastructure' } });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(61);
    expect(result.issues[0]).not.toMatch(/is below minimum/);
    expect(result.issues[0]).toMatch(/meets the 60% minimum/);
    expect(result.issues[0]).toMatch(/thin retro: no SD-specific learnings/);
  });
});
