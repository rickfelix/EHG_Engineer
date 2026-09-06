/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-3 CORRECTION (EXEC-phase
 * TESTING finding, evidence 4298bd82-d59d-4ac6-b585-eb6aaf206915).
 *
 * A prior version of this SD widened resolveHoldProvenance to also resolve human_action_note,
 * human_action_reason, human_action_required, and needs_coordinator_review_reason. That was
 * reverted: resolveHoldProvenance is not purely descriptive — scripts/post-merge-handoff-
 * orchestrator.js's classifyState() and lib/fleet/belt-census.cjs both gate real behavior
 * (auto-handoff refusal, belt census bucketing) on whatever this function resolves, and the
 * widening moved 64 live SDs into a newly-resolved, unreleasable hold (none of the four keys has
 * a release-check path) — a fleet-wide behavior change never audited against those consumers.
 *
 * This is a REGRESSION GUARD: a future edit re-adding these four keys to resolveHoldProvenance
 * would silently reintroduce that exact stall. The four keys are surfaced instead ONLY inside
 * stampConstraintsBlock (lib/coordinator/dispatch.cjs), which reads them directly — see
 * tests/unit/coordinator/stamp-constraints-block.test.js's own AC-7 coverage for that surface.
 */
import { describe, it, expect } from 'vitest';

const claimEligibilityModule = await import('../../../lib/fleet/claim-eligibility.cjs');
const { resolveHoldProvenance } = claimEligibilityModule;

describe('resolveHoldProvenance scope guard: must NOT resolve the four descriptive-only keys', () => {
  it('human_action_note alone does not resolve', () => {
    expect(resolveHoldProvenance({ human_action_note: 'some note' })).toBeNull();
  });

  it('human_action_reason alone does not resolve', () => {
    expect(resolveHoldProvenance({ human_action_reason: 'some reason' })).toBeNull();
  });

  it('human_action_required=true alone does not resolve', () => {
    expect(resolveHoldProvenance({ human_action_required: true })).toBeNull();
  });

  it('needs_coordinator_review_reason alone does not resolve', () => {
    expect(resolveHoldProvenance({ needs_coordinator_review_reason: 'some review note' })).toBeNull();
  });

  it('the original 6-key precedence chain is unchanged: requires_human_action_reason still wins', () => {
    const prov = resolveHoldProvenance({ requires_human_action_reason: 'canonical', human_action_note: 'sibling' });
    expect(prov?.source_key).toBe('requires_human_action_reason');
  });

  it('the resolver has no exported key-list (HOLD_REASON_KEYS was removed with the reverted widening)', () => {
    expect(claimEligibilityModule.HOLD_REASON_KEYS).toBeUndefined();
  });
});
