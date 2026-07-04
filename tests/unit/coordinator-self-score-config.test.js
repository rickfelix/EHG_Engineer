/**
 * SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-2 — coordinator graded self-score config + shared-core wiring.
 * Exercises the pure pieces (COORDINATOR_CONFIG scorers, assembleScore, hasBlockingViolation)
 * without invoking scripts/coordinator-self-review.mjs's selfReviewMain() directly — that function
 * has live side effects (soliciting real worker sessions via COACHING messages when DUE), which a
 * unit test must not trigger.
 */
import { describe, it, expect } from 'vitest';
import { validateScoreContract, hasBlockingViolation } from '../../lib/fleet/verify-score-contract.mjs';
import { COORDINATOR_CONFIG } from '../../lib/coordinator/self-score-config.mjs';
const core = require('../../lib/governance/role-self-score.cjs');

describe('COORDINATOR_CONFIG scorers', () => {
  it('worker_utilization: 0 idle-with-claimable-work scores 5, no red-flag', () => {
    const { dimensions, provenance } = core.scoreDimensions({ idle_workers_with_claimable_work: 0 }, COORDINATOR_CONFIG);
    expect(dimensions.worker_utilization).toBe(5);
    expect(provenance.worker_utilization.red_flag).toBeUndefined();
  });
  it('worker_utilization: 3+ idle-with-claimable-work scores 1 and red-flags', () => {
    const { dimensions, provenance } = core.scoreDimensions({ idle_workers_with_claimable_work: 3 }, COORDINATOR_CONFIG);
    expect(dimensions.worker_utilization).toBe(1);
    expect(provenance.worker_utilization.red_flag).toBe(true);
  });
  it('proactive_sourcing: belt_depth thresholds mirror Adam\'s D1_proactive_sourcing', () => {
    expect(core.scoreDimensions({ belt_depth: 8 }, COORDINATOR_CONFIG).dimensions.proactive_sourcing).toBe(5);
    expect(core.scoreDimensions({ belt_depth: 0 }, COORDINATOR_CONFIG).dimensions.proactive_sourcing).toBe(1);
  });
  it('conflict_free_dispatch: 0 solicit failures scores 5, 5+ scores 1', () => {
    expect(core.scoreDimensions({ solicit_failed_count: 0 }, COORDINATOR_CONFIG).dimensions.conflict_free_dispatch).toBe(5);
    expect(core.scoreDimensions({ solicit_failed_count: 5 }, COORDINATOR_CONFIG).dimensions.conflict_free_dispatch).toBe(1);
  });
  it('identity_claim_hygiene and anticipate_not_self_correct are always inconclusive (no live source)', () => {
    const { dimensions, inconclusive } = core.scoreDimensions({
      idle_workers_with_claimable_work: 0, belt_depth: 5, solicit_failed_count: 0,
    }, COORDINATOR_CONFIG);
    expect(inconclusive.sort()).toEqual(['anticipate_not_self_correct', 'identity_claim_hygiene']);
    expect(Object.keys(dimensions).sort()).toEqual(['conflict_free_dispatch', 'proactive_sourcing', 'worker_utilization']);
  });
});

describe('assembleScore via the shared core (role=coordinator)', () => {
  it('produces a coordinator-prefixed review_key and the common tri-party score schema', () => {
    const signals = { idle_workers_with_claimable_work: 2, belt_depth: 1, solicit_failed_count: 0 };
    const { dimensions, provenance } = core.scoreDimensions(signals, COORDINATOR_CONFIG);
    const below = core.classifyBelowThreshold(dimensions, COORDINATOR_CONFIG.belowThresholdAt);
    expect(below.sort()).toEqual(['proactive_sourcing', 'worker_utilization']);

    const committedActions = core.generateCommittedActions(below, provenance, COORDINATOR_CONFIG.actionHints);
    const score = core.assembleScore({
      dimensions, cycle: 4, session: 'coord-sess', committedActions, priorOutcomes: [], provenance, belowThreshold: below, date: '2026-07-03', config: COORDINATOR_CONFIG,
    });
    expect(score.review_key).toBe('coordinator:cycle4:2026-07-03');
    expect(score.generated_by).toBe('coordinator-self-review');
    expect(score.threshold).toBe(4);
  });
});

describe('SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 acceptance e2e #2: refuse an invalid score, narrowly scoped', () => {
  it('a below-threshold coordinator score with EMPTY committed_actions is refused', () => {
    const dimensions = { worker_utilization: 1, proactive_sourcing: 5, conflict_free_dispatch: 5 };
    const score = core.assembleScore({
      dimensions, cycle: 1, session: 's', committedActions: [], priorOutcomes: [], provenance: {},
      belowThreshold: core.classifyBelowThreshold(dimensions), date: '2026-07-03', config: COORDINATOR_CONFIG,
    });
    const verdict = validateScoreContract({ current: score, prior: null, priorStreak: 0 });
    expect(hasBlockingViolation(verdict.violations)).toBe(true);
  });
  it('the SAME below-threshold score WITH committed_actions is NOT refused', () => {
    const dimensions = { worker_utilization: 1, proactive_sourcing: 5, conflict_free_dispatch: 5 };
    const below = core.classifyBelowThreshold(dimensions);
    const committedActions = core.generateCommittedActions(below, {}, COORDINATOR_CONFIG.actionHints);
    const score = core.assembleScore({
      dimensions, cycle: 1, session: 's', committedActions, priorOutcomes: [], provenance: {},
      belowThreshold: below, date: '2026-07-03', config: COORDINATOR_CONFIG,
    });
    const verdict = validateScoreContract({ current: score, prior: null, priorStreak: 0 });
    expect(hasBlockingViolation(verdict.violations)).toBe(false);
  });
});
