// SD-LEARN-FIX-ADDRESS-PAT-LES-013 — regression guard for the boilerplate-penalty BLEND inside
// RetrospectiveQualityRubric.validateRetrospectiveQuality(), the one link in the chain that no
// existing test exercises.
//
// tests/unit/retro-boilerplate-template-corpus.test.js proves detectBoilerplate() itself flags
// the template corpus. tests/unit/sd-completion-readiness-passed-contract.test.js proves the
// passed/score wiring through validateSDCompletionReadiness() — but it mocks the ENTIRE
// RetrospectiveQualityRubric class away (vi.mock of the whole module), so it never calls the
// real validateRetrospectiveQuality() method and never exercises the two lines that actually
// subtract detectBoilerplate's scorePenalty from the AI judge's own weightedScore
// (retrospective-quality-rubric.js:500-508). FR-0's original incident ("a textbook template
// retro scored 68 on the AI rubric with boilerplate_penalty 0") was exactly this blend being
// absent; nothing currently proves it stays wired if that code is ever touched again.
//
// This suite instantiates the REAL RetrospectiveQualityRubric (so the real detectBoilerplate()
// runs), stubs out only the network-calling AIQualityEvaluator.evaluate() (so no LLM/DB call is
// made), and asserts the deterministic penalty actually drags a template retro's final score
// and passed verdict below what the AI judge alone would have produced.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({}),
}));

import { AIQualityEvaluator } from '../../scripts/modules/ai-quality-evaluator.js';
import { RetrospectiveQualityRubric } from '../../scripts/modules/rubrics/retrospective-quality-rubric.js';

// Verbatim content class of retro 1908315c (the FR-0 measured boilerplate sample) — same fixture
// shape as tests/unit/retro-boilerplate-template-corpus.test.js's TEMPLATE_RETRO.
const TEMPLATE_RETRO = {
  what_went_well: [
    { achievement: 'SD was clear and well-defined for planning', is_boilerplate: false },
    { achievement: 'Acceptance criteria were comprehensive and actionable', is_boilerplate: false },
    { achievement: 'Dependencies were correctly identified upfront', is_boilerplate: false },
    { achievement: 'Simplicity assessment was accurate and helpful', is_boilerplate: false },
    { achievement: 'Handoff validation passed all gates successfully', is_boilerplate: false }
  ],
  key_learnings: [
    { learning: 'LEAD-TO-PLAN revealed that infrastructure SDs targeting EHG_Engineer benefit from the 4-handoff workflow', is_boilerplate: false }
  ],
  action_items: [],
  what_needs_improvement: []
};

const SPECIFIC_RETRO = {
  what_went_well: [
    'key_changes_delivered met target (95/100): All three FRs merged to main via PR #6919 (39c26da4f02)'
  ],
  key_learnings: [
    '[success_metrics_achieved] scored 90/100 (gap: 3pts) — backward compatibility held: 1270/1270 across 110 files'
  ],
  action_items: [],
  what_needs_improvement: []
};

const SD = { id: 'uuid-1', sd_key: 'SD-T-001', sd_type: 'infrastructure', status: 'active' };

function fakeAssessment(overrides = {}) {
  return {
    scores: {},
    weightedScore: 68,
    feedback: { required: [], recommended: [], improvements: [] },
    passed: true,
    threshold: 55,
    band: 'GREEN',
    confidence: 'HIGH',
    confidence_reasoning: 'stubbed',
    sd_type: 'infrastructure',
    is_orchestrator: false,
    child_count: 0,
    duration: 1,
    cost: 0,
    ...overrides
  };
}

describe('RetrospectiveQualityRubric.validateRetrospectiveQuality: boilerplate penalty blend', () => {
  let evaluateSpy;

  beforeEach(() => {
    evaluateSpy = vi.spyOn(AIQualityEvaluator.prototype, 'evaluate');
  });

  afterEach(() => {
    evaluateSpy.mockRestore();
  });

  it('FR-0 regression: a template retro the AI judge alone would PASS is dragged below threshold by the deterministic penalty', async () => {
    // The AI judge's own naive verdict: weightedScore 68 >= threshold 55, passed=true.
    evaluateSpy.mockResolvedValue(fakeAssessment({ weightedScore: 68, threshold: 55, passed: true }));

    const rubric = new RetrospectiveQualityRubric();
    const result = await rubric.validateRetrospectiveQuality(TEMPLATE_RETRO, SD);

    expect(result.details.boilerplate_penalty).toBe(25); // matchCount>=5, capped at 25
    expect(result.score).toBe(68 - 25);
    // The load-bearing assertion: the deterministic penalty must be able to FLIP the verdict
    // even when the AI judge's own raw weightedScore cleared threshold.
    expect(result.passed).toBe(false);
    expect(result.warnings.some(w => /boilerplate/i.test(w))).toBe(true);
  });

  it('genuine SD-specific content: zero penalty, AI verdict passes through unchanged', async () => {
    evaluateSpy.mockResolvedValue(fakeAssessment({ weightedScore: 82, threshold: 55, passed: true }));

    const rubric = new RetrospectiveQualityRubric();
    const result = await rubric.validateRetrospectiveQuality(SPECIFIC_RETRO, SD);

    expect(result.details.boilerplate_penalty).toBe(0);
    expect(result.score).toBe(82);
    expect(result.passed).toBe(true);
  });

  it('a template retro that already fails the AI judge stays failed (penalty cannot resurrect a pass, only worsen it)', async () => {
    evaluateSpy.mockResolvedValue(fakeAssessment({ weightedScore: 40, threshold: 55, passed: false }));

    const rubric = new RetrospectiveQualityRubric();
    const result = await rubric.validateRetrospectiveQuality(TEMPLATE_RETRO, SD);

    expect(result.score).toBe(Math.max(0, 40 - 25));
    expect(result.passed).toBe(false);
  });
});
