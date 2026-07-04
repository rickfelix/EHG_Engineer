/**
 * SD-LEO-INFRA-ADAM-SELF-ASSESSMENT-001 — pure core + CLI flag helper (DB-free).
 */
import { describe, it, expect } from 'vitest';
import { validateScoreContract } from '../../../lib/fleet/verify-score-contract.mjs';
const core = require('../../../lib/adam/self-assessment.cjs');
const { isFlagEnabled } = require('../../../scripts/adam-self-assessment-writer.cjs');

describe('shouldFire (turn-counter)', () => {
  it('does not fire before the cadence elapses, fires once it does', () => {
    const state = { last_fired_turn: 5 };
    expect(core.shouldFire(state, 10, 10)).toBe(false); // 10-5=5 < 10
    expect(core.shouldFire(state, 15, 10)).toBe(true); // 10 >= 10
    expect(core.shouldFire(state, 16, 10)).toBe(true);
  });
  it('fires on a fresh state (last_fired_turn = -Infinity)', () => {
    expect(core.shouldFire(core.freshState(), 1, 10)).toBe(true);
  });
});

describe('scoreDimensions', () => {
  it('scores numeric where a signal exists and inconclusive (omitted) where absent', () => {
    const { dimensions, inconclusive } = core.scoreDimensions({ belt_depth: 6, adam_claim_count: 0 });
    expect(dimensions.D1_proactive_sourcing).toBe(4); // belt 6 -> 4
    expect(dimensions.D2_propose_first).toBe(5); // 0 claims -> 5
    expect('D5_vision_alignment' in dimensions).toBe(false); // no signal -> inconclusive
    expect(inconclusive).toContain('D5_vision_alignment');
  });
  it('flags D2 as a red-flag and scores 1 when Adam has claimed an SD', () => {
    const { dimensions, provenance } = core.scoreDimensions({ adam_claim_count: 1 });
    expect(dimensions.D2_propose_first).toBe(1);
    expect(provenance.D2_propose_first.red_flag).toBe(true);
  });
  it('never fabricates: an all-empty signals object yields zero numeric dimensions', () => {
    const { dimensions, inconclusive } = core.scoreDimensions({});
    expect(Object.keys(dimensions).length).toBe(0);
    expect(inconclusive.length).toBe(core.DIMENSIONS.length);
  });
});

describe('classifyBelowThreshold', () => {
  it('marks only dimensions scoring <=2 and excludes inconclusive (absent) dims', () => {
    const below = core.classifyBelowThreshold({ D6_close_loops_ack: 2, D1_proactive_sourcing: 4, D8_interface_clarity: 1 });
    expect(below.sort()).toEqual(['D6_close_loops_ack', 'D8_interface_clarity']);
  });
});

describe('derivePriorOutcomes', () => {
  const prior = {
    dimensions: { D6_close_loops_ack: 2 },
    committed_actions: [{ gap: 'D6_close_loops_ack', action: 'ack faster' }],
  };
  it('marks moved=true (LANDED) when the dimension improved', () => {
    const out = core.derivePriorOutcomes(prior, { D6_close_loops_ack: 4 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ gap: 'D6_close_loops_ack', outcome: 'LANDED', moved: true });
  });
  it('marks NOT_MOVED when the dimension did not improve, INCONCLUSIVE when now unscored', () => {
    expect(core.derivePriorOutcomes(prior, { D6_close_loops_ack: 2 })[0].outcome).toBe('NOT_MOVED');
    expect(core.derivePriorOutcomes(prior, {})[0].outcome).toBe('INCONCLUSIVE');
  });
  it('returns [] when the prior cycle committed no actions', () => {
    expect(core.derivePriorOutcomes({ dimensions: {}, committed_actions: [] }, {})).toEqual([]);
  });
});

describe('generateCommittedActions', () => {
  it('produces exactly one action per below-threshold dimension', () => {
    const acts = core.generateCommittedActions(['D6_close_loops_ack', 'D8_interface_clarity'], {});
    expect(acts).toHaveLength(2);
    expect(acts[0]).toMatchObject({ gap: 'D6_close_loops_ack', type: 'behavior' });
    expect(acts[0].action.length).toBeGreaterThan(10);
  });
});

describe('assembleScore + overallString', () => {
  it('assembles the canonical schema with overall computed from numeric dims', () => {
    const score = core.assembleScore({
      dimensions: { D1_proactive_sourcing: 4, D2_propose_first: 5 },
      cycle: 3, session: 'sess-1', committedActions: [], priorOutcomes: [], provenance: {}, belowThreshold: [], date: '2026-06-09',
    });
    expect(score).toMatchObject({ cycle: 3, session: 'sess-1', threshold: 4, review_key: 'adam:cycle3:2026-06-09' });
    expect(score.overall).toBe('9/10 (4.5/5)');
    expect(Array.isArray(score.committed_actions)).toBe(true);
    expect(Array.isArray(score.prior_action_outcomes)).toBe(true);
  });
});

describe('validateScoreContract integration (valid by construction)', () => {
  it('a writer-assembled score with below-threshold dims passes (actions + prior outcomes present)', () => {
    const prior = { dimensions: { D6_close_loops_ack: 2 }, committed_actions: [{ gap: 'D6_close_loops_ack', action: 'ack faster' }] };
    const dimensions = { D6_close_loops_ack: 2, D1_proactive_sourcing: 4 };
    const below = core.classifyBelowThreshold(dimensions); // [D6]
    const score = core.assembleScore({
      dimensions, cycle: 2, session: 's', date: '2026-06-09',
      belowThreshold: below,
      committedActions: core.generateCommittedActions(below, {}),
      priorOutcomes: core.derivePriorOutcomes(prior, dimensions),
    });
    const verdict = validateScoreContract({ current: score, prior, priorStreak: 0 });
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toEqual([]);
  });

  it('escalates after N consecutive below-threshold cycles', () => {
    const dimensions = { D6_close_loops_ack: 2 };
    const score = core.assembleScore({
      dimensions, cycle: 5, session: 's', date: '2026-06-09',
      belowThreshold: ['D6_close_loops_ack'],
      committedActions: core.generateCommittedActions(['D6_close_loops_ack'], {}),
      priorOutcomes: [],
    });
    const verdict = validateScoreContract({ current: score, prior: null, priorStreak: 2 });
    expect(verdict.escalation.triggered).toBe(true);
    expect(verdict.escalation.streak).toBe(3);
  });
});

describe('golden snapshot — locks in current Adam behavior before shared-core extraction (SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 TS-1)', () => {
  it('produces the exact assembled score object for a fixed full-signal fixture', () => {
    const signals = {
      belt_depth: 6,
      adam_claim_count: 0,
      coordinator_autonomy_rate: 0.5,
      false_claim_rate: 0.15,
      advisory_citation_rate: 0.9,
      ack_latency_min: 10,
      adam_sd_pass_rate: 0.6,
      advisory_deliverability: 0.99,
    };
    const { dimensions, provenance, inconclusive } = core.scoreDimensions(signals);
    expect(inconclusive).toEqual([]);
    expect(dimensions).toEqual({
      D1_proactive_sourcing: 4,
      D2_propose_first: 5,
      D3_reviewer_not_safetynet: 2,
      D4_verify_before_certainty: 2,
      D5_vision_alignment: 4,
      D6_close_loops_ack: 5,
      D7_sd_quality: 2,
      D8_interface_clarity: 5,
    });

    const below = core.classifyBelowThreshold(dimensions);
    expect(below.sort()).toEqual(['D3_reviewer_not_safetynet', 'D4_verify_before_certainty', 'D7_sd_quality']);

    const committedActions = core.generateCommittedActions(below, provenance);
    expect(committedActions).toHaveLength(3);
    expect(committedActions.map((a) => a.gap).sort()).toEqual(below.slice().sort());

    const priorOutcomes = core.derivePriorOutcomes(null, dimensions);
    expect(priorOutcomes).toEqual([]);

    const score = core.assembleScore({
      dimensions, cycle: 7, session: 'golden-sess', committedActions, priorOutcomes,
      provenance, belowThreshold: below, date: '2026-06-09',
    });

    expect(score).toEqual({
      cycle: 7,
      session: 'golden-sess',
      threshold: 4,
      overall: '29/40 (3.6/5)',
      dimensions,
      below_threshold: below,
      committed_actions: committedActions,
      prior_action_outcomes: [],
      review_key: 'adam:cycle7:2026-06-09',
      provenance,
      generated_by: 'adam-self-assessment-writer',
    });
  });
});

describe('buildFeedbackInsertRow — guards the feedback table NOT-NULL column shape', () => {
  // feedback.type is constrained by feedback_type_check (database/migrations/391_quality_lifecycle_schema.sql);
  // source_application/source_type/severity/title were a pre-existing silent-insert-failure gap
  // (missing NOT NULL columns) found live-testing SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 — this test
  // guards against that regression recurring.
  it('always includes every NOT-NULL column the feedback table requires', () => {
    const score = { overall: '5/5 (5.0/5)', review_key: 'adam:cycle1:2026-07-03' };
    const row = core.buildFeedbackInsertRow({ category: 'adam_self_assessment', score, belowThreshold: [], sessionId: 'sess-1', title: 'Adam self-assessment — cycle 1' });
    expect(row.type).toBe('enhancement');
    expect(row.source_application).toBe('EHG_Engineer');
    expect(row.source_type).toBe('auto_capture');
    expect(row.status).toBe('new');
    expect(row.severity).toBe('low');
    expect(row.title).toBe('Adam self-assessment — cycle 1');
    expect(row.category).toBe('adam_self_assessment');
    expect(row.metadata).toMatchObject({ score, review_key: score.review_key, sender_session: 'sess-1' });
    expect(JSON.parse(row.description)).toEqual({ overall: score.overall, below_threshold: [] });
  });
});

describe('isFlagEnabled (ADAM_SELF_SCORE_CADENCE)', () => {
  it('is OFF for unset/off/garbage, ON only for on/1/true', () => {
    expect(isFlagEnabled({})).toBe(false);
    expect(isFlagEnabled({ ADAM_SELF_SCORE_CADENCE: 'off' })).toBe(false);
    expect(isFlagEnabled({ ADAM_SELF_SCORE_CADENCE: 'maybe' })).toBe(false);
    expect(isFlagEnabled({ ADAM_SELF_SCORE_CADENCE: 'on' })).toBe(true);
    expect(isFlagEnabled({ ADAM_SELF_SCORE_CADENCE: '1' })).toBe(true);
    expect(isFlagEnabled({ ADAM_SELF_SCORE_CADENCE: 'TRUE' })).toBe(true);
  });
});
