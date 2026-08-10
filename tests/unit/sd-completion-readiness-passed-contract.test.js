// QF-20260809-341 — the passed/valid wire, tested WITHOUT mocking the producer.
//
// The RETROSPECTIVE_EXISTS tier-3 arm reads `assessment.passed` (lead-final-approval/gates.js),
// and its contract test ratifies that by MOCKING validateSDCompletionReadiness with a `passed`
// key. The real function only emitted `valid`, so both sides were green while the wire was
// broken: `!assessment?.passed` was true for EVERY tier-3 SD and the gate could not pass at any
// score (observed live: "assessed score 75% is below minimum 60%"). This suite calls the REAL
// producer on its no-network early-return path, so the contract key can never silently vanish
// behind a mock again.

import { describe, it, expect, vi } from 'vitest';

// QF-20260809-827: drive the REAL aggregate with mocked rubrics so the passed/manual_review
// propagation is tested through the actual wire, not re-stated by a mock of the producer.
vi.mock('../../scripts/modules/rubrics/sd-quality-rubric.js', () => ({
  SDQualityRubric: class { async validateSDQuality() { return SD_RUBRIC_RESULT; } },
}));
vi.mock('../../scripts/modules/rubrics/retrospective-quality-rubric.js', () => ({
  RetrospectiveQualityRubric: class { async validateRetrospectiveQuality() { return RETRO_RUBRIC_RESULT(); } },
}));
vi.mock('../../scripts/modules/sd-type-checker.js', () => ({
  getScoringWeights: async () => ({ sdWeight: 0.3, retroWeight: 0.7 }),
  isInfrastructureSDSync: () => true,
}));

let SD_RUBRIC_RESULT = { passed: true, score: 70, issues: [], warnings: [], details: {} };
let RETRO_RUBRIC_RESULT = () => ({ passed: true, score: 90, issues: [], warnings: [], details: {} });

import { validateSDCompletionReadiness } from '../../scripts/modules/sd-quality-validation.js';

const SD = { id: 'uuid-1', sd_key: 'SD-T-001', sd_type: 'infrastructure', status: 'active' };
const RETRO = { id: 'retro-1', sd_id: 'uuid-1', key_learnings: [], action_items: [] };

describe('validateSDCompletionReadiness emits the passed key the gate consumes', () => {
  it('null SD: passed exists, mirrors valid, and is false', async () => {
    const r = await validateSDCompletionReadiness(null);
    expect(r.valid).toBe(false);
    // The load-bearing assertion: `passed` must be a boolean, not undefined — undefined is what
    // made the gate's `!assessment?.passed` unconditionally true.
    expect(r.passed).toBe(false);
  });

  it('QF-20260809-827: an SD-authoring nit does NOT flip passed when the retro assessment passed', async () => {
    // The live-hit shape: retro assessed fine, but the SD-quality judge dinged the SD's own
    // objectives text. `valid` (zero issues anywhere) goes false; `passed` — the gate's verdict
    // bit — must follow the RETRO assessment, which is the gate's subject.
    SD_RUBRIC_RESULT = { passed: false, score: 60, issues: ['strategic_objectives_measurability: 4/10'], warnings: [], details: {} };
    const r = await validateSDCompletionReadiness(SD, RETRO);
    expect(r.valid).toBe(false);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(Math.round(60 * 0.3 + 90 * 0.7));
  });

  it('a FAILED retro assessment fails passed even when the SD itself is clean', async () => {
    SD_RUBRIC_RESULT = { passed: true, score: 90, issues: [], warnings: [], details: {} };
    RETRO_RUBRIC_RESULT = () => ({ passed: false, score: 40, issues: ['thin retro'], warnings: [], details: {} });
    const r = await validateSDCompletionReadiness(SD, RETRO);
    expect(r.passed).toBe(false);
  });

  it('evaluator OUTAGE propagates manual_review_required and fails closed', async () => {
    // The fail-closed path sets manual_review_required on the retro sub-result; the tier-3 arm
    // branches its operator message on the aggregate's copy — without propagation an outage
    // misprints as a score failure (observed live as "score 83% is below minimum 60%").
    RETRO_RUBRIC_RESULT = () => { throw new Error('AI evaluator down'); };
    const r = await validateSDCompletionReadiness(SD, RETRO);
    expect(r.passed).toBe(false);
    expect(r.manual_review_required).toBe(true);
  });

  it('no retrospective at all: passed=false (the gate requires one), no throw', async () => {
    const r = await validateSDCompletionReadiness(SD, null);
    expect(r.passed).toBe(false);
    expect(r.manual_review_required).toBe(false);
  });
});
