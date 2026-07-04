/**
 * SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-3 — Solomon rubric self-score (additive to duty-parity).
 */
import { describe, it, expect } from 'vitest';
import { validateScoreContract } from '../../lib/fleet/verify-score-contract.mjs';
import { buildSelfAdherenceVerdict } from '../../scripts/solomon-self-adherence-review.mjs';
import { missingDurableDuties, SOLOMON_LOOPS } from '../../scripts/solomon-startup-check.mjs';
const core = require('../../lib/governance/role-self-score.cjs');
const { SOLOMON_CONFIG } = require('../../lib/solomon/self-score-config.cjs');
const { isFlagEnabled } = require('../../scripts/solomon-self-assessment-writer.cjs');

describe('SOLOMON_CONFIG scorers', () => {
  it('D1 scores 5 with no red-flag when Solomon has zero claims', () => {
    const { dimensions, provenance } = core.scoreDimensions({ solomon_claim_count: 0 }, SOLOMON_CONFIG);
    expect(dimensions.D1_propose_discipline).toBe(5);
    expect(provenance.D1_propose_discipline.red_flag).toBeUndefined();
  });
  it('D1 scores 1 with a red-flag the moment Solomon holds any claim', () => {
    const { dimensions, provenance } = core.scoreDimensions({ solomon_claim_count: 1 }, SOLOMON_CONFIG);
    expect(dimensions.D1_propose_discipline).toBe(1);
    expect(provenance.D1_propose_discipline.red_flag).toBe(true);
  });
  it('D2/D4/D5 are always inconclusive (no signal source), D3 inconclusive without a quota signal', () => {
    const { dimensions, inconclusive } = core.scoreDimensions({ solomon_claim_count: 0 }, SOLOMON_CONFIG);
    expect(inconclusive.sort()).toEqual([
      'D2_unbiased_perspective', 'D3_silence_cost_discipline', 'D4_judgment_quality', 'D5_systemic_handoff_accuracy',
    ].sort());
    expect(Object.keys(dimensions)).toEqual(['D1_propose_discipline']);
  });
});

describe('assembleScore via the shared core (role=solomon)', () => {
  it('produces a solomon-prefixed review_key and the common tri-party score schema', () => {
    const { dimensions, provenance } = core.scoreDimensions({ solomon_claim_count: 0 }, SOLOMON_CONFIG);
    const below = core.classifyBelowThreshold(dimensions, SOLOMON_CONFIG.belowThresholdAt);
    const score = core.assembleScore({
      dimensions, cycle: 2, session: 'sess-1', committedActions: [], priorOutcomes: [], provenance, belowThreshold: below, date: '2026-07-03', config: SOLOMON_CONFIG,
    });
    expect(score.review_key).toBe('solomon:cycle2:2026-07-03');
    expect(score.threshold).toBe(4);
    expect(score.generated_by).toBe('solomon-self-assessment-writer');
    expect(score.overall).toBe('5/5 (5.0/5)');
    const verdict = validateScoreContract({ current: score, prior: null, priorStreak: 0 });
    expect(verdict.valid).toBe(true); // nothing below-threshold -> no committed_actions required
  });
});

describe('isFlagEnabled (SOLOMON_SELF_SCORE_CADENCE)', () => {
  it('is OFF for unset/off/garbage, ON only for on/1/true', () => {
    expect(isFlagEnabled({})).toBe(false);
    expect(isFlagEnabled({ SOLOMON_SELF_SCORE_CADENCE: 'off' })).toBe(false);
    expect(isFlagEnabled({ SOLOMON_SELF_SCORE_CADENCE: 'on' })).toBe(true);
    expect(isFlagEnabled({ SOLOMON_SELF_SCORE_CADENCE: '1' })).toBe(true);
  });
});

describe('duty-parity stays clean after wiring the new self-assessment duty', () => {
  it('the deep-sweep loop covers the self-assessment duty slug', () => {
    const deepSweep = SOLOMON_LOOPS.find((l) => l.key === 'deep-sweep');
    expect(deepSweep.covers).toContain('self-assessment');
  });
  it('a contract markdown declaring "**SELF-ASSESSMENT DUTY (durable)**" reconciles via the cover (no drift)', () => {
    const md = 'Some text.\n\n**SELF-ASSESSMENT DUTY (durable)**: does the thing.\n';
    expect(missingDurableDuties(md)).toEqual([]);
  });
  it('the live CLAUDE_SOLOMON.md reports no drift (buildSelfAdherenceVerdict)', () => {
    const v = buildSelfAdherenceVerdict();
    expect(v.ok).toBe(true);
    expect(v.drifted).toEqual([]);
  });
});
