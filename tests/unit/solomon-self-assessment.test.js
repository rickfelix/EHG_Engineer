/**
 * SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-3 — Solomon rubric self-score (additive to duty-parity).
 */
import { describe, it, expect } from 'vitest';
import { validateScoreContract } from '../../lib/fleet/verify-score-contract.mjs';
import { buildSelfAdherenceVerdict, renderAttachedAgentsSection } from '../../scripts/solomon-self-adherence-review.mjs';
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
  it('D2/D4/D5 are always inconclusive (no signal source), D3 inconclusive without EITHER a quota or attached-agent signal', () => {
    const { dimensions, inconclusive } = core.scoreDimensions({ solomon_claim_count: 0 }, SOLOMON_CONFIG);
    expect(inconclusive.sort()).toEqual([
      'D2_unbiased_perspective', 'D3_silence_cost_discipline', 'D4_judgment_quality', 'D5_systemic_handoff_accuracy',
    ].sort());
    expect(Object.keys(dimensions)).toEqual(['D1_propose_discipline']);
  });

  // QF-20260905-768: D3 must read attached in-process gatherer spend, not just the consult ledger.
  describe('D3 attached-agent half', () => {
    it('a run with no attached gatherers and no quota breach reads clean (score 5)', () => {
      const { dimensions, provenance } = core.scoreDimensions({ quota_breach_count: 0, attached_agent_flag_count: 0 }, SOLOMON_CONFIG);
      expect(dimensions.D3_silence_cost_discipline).toBe(5);
      expect(provenance.D3_silence_cost_discipline.red_flag).toBeUndefined();
    });

    it('one flagged attached gatherer (idle past report) scores D3 down even with zero quota breaches', () => {
      const { dimensions } = core.scoreDimensions({ quota_breach_count: 0, attached_agent_flag_count: 1 }, SOLOMON_CONFIG);
      expect(dimensions.D3_silence_cost_discipline).toBe(3);
    });

    it('the D3 signal string changes when the attached-agent count changes', () => {
      const clean = core.scoreDimensions({ quota_breach_count: 0, attached_agent_flag_count: 0 }, SOLOMON_CONFIG);
      const flagged = core.scoreDimensions({ quota_breach_count: 0, attached_agent_flag_count: 1 }, SOLOMON_CONFIG);
      expect(clean.provenance.D3_silence_cost_discipline.signal).not.toBe(flagged.provenance.D3_silence_cost_discipline.signal);
    });

    it('is still scoreable from the attached-agent signal alone (no quota signal at all)', () => {
      const { dimensions, inconclusive } = core.scoreDimensions({ attached_agent_flag_count: 2 }, SOLOMON_CONFIG);
      expect(dimensions.D3_silence_cost_discipline).toBe(1);
      expect(inconclusive).not.toContain('D3_silence_cost_discipline');
    });
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
    // FR-1: Solomon scores 1 of 5 dimensions. The average stays 5.0 — unmeasured is NOT zero, and
    // dividing by total would render an honest single excellent reading as a failing 1.0/5 — while
    // the coverage is now stated rather than implied by a full-looking denominator.
    expect(score.overall).toBe('5/5 (5.0/5) — 1 of 5 dimensions measured');
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

// QF-20260905-768 item (a): the self-adherence review lists attached gatherer agents.
describe('renderAttachedAgentsSection', () => {
  it('reports inconclusive when no snapshot was written this cycle', () => {
    expect(renderAttachedAgentsSection(null)).toMatch(/inconclusive/);
  });

  it('a run with none attached reads clean', () => {
    expect(renderAttachedAgentsSection([])).toMatch(/none/);
  });

  it('lists an idle gatherer at 61 minutes with its age/state and flags it', () => {
    const out = renderAttachedAgentsSection([{ name: 'gatherer-1', state: 'idle', ageMinutes: 61 }]);
    expect(out).toContain('gatherer-1');
    expect(out).toContain('idle');
    expect(out).toContain('61min');
    expect(out).toMatch(/FLAGGED/);
    expect(out).toContain('1 flagged of 1');
  });

  it('does not flag a gatherer well within either cut', () => {
    const out = renderAttachedAgentsSection([{ name: 'gatherer-2', state: 'running', ageMinutes: 5 }]);
    expect(out).not.toMatch(/FLAGGED/);
    expect(out).toContain('0 flagged of 1');
  });
});
