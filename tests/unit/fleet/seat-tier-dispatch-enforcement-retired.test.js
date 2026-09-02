/**
 * SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 — differential regression test for the seat-tier
 * dispatch-enforcement retirement (chairman ratification 20dc072b).
 *
 * Per LEAD-phase risk-agent (evidence 7efc140b) and PLAN-phase testing-agent (evidence 0e1056ad):
 * a bare "below-floor seat can claim+dispatch" pin PASSES ON MAIN TODAY, before any change in this
 * SD — proving nothing about deletion. This suite is differential: it asserts (a) claim/dispatch
 * succeeds regardless of tier, (b) the classifier can never again emit the three deleted verdict
 * strings, and (c) the deleted symbol is provably absent, not merely stubbed.
 *
 * TS-2 (fenced mechanisms still fire) is NOT duplicated here — see the existing, unmodified suites:
 *   tests/unit/fleet/fable-window-downward-claim-guard.test.js (fable_window_downward_claim_blocked)
 *   tests/unit/fleet/tier-ladder-seat-capability-resolver.test.js (unverified_seat_capability)
 *   tests/unit/fleet/released-mid-phase-two-sided-control.test.js (derived-axis over-deletion guard)
 *
 * TS-5 (ctx-producer boundary, lib/checkin/steps/merged-pool-self-claim.cjs) is NOT covered by a
 * new integration test here: this SD's edit to that file was a byte-scoped removal of the DEAD
 * lower_tier_backlog_data fetch/thread only — the fable_window_active producer lines (:118
 * reservations, :140-144 fable_window_active) were left completely untouched (verified by diff
 * review, not re-derived), so the producer-boundary risk TESTING flagged applies to FUTURE edits
 * of that file, not to this one. A full run()-level integration harness for that step was judged
 * disproportionate to this SD's scope; existing coverage (tests/unit/checkin/
 * self-claim-tier-enforcement.test.js) already exercises the sibling recoverStrandedFinal/
 * adoptOrphanInProgress lanes this SD DID modify, and all pass unmodified.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { ladderTopRank } from '../../../lib/fleet/tier-ladder.cjs';
import { classifyDispatchIneligibility } from '../../../lib/fleet/claim-eligibility.cjs';
import * as dispatch from '../../../lib/coordinator/dispatch.cjs';
import { tierBlocks, claimableForTier } from '../../../lib/fleet/tier-claimable.cjs';

const TOP = ladderTopRank();
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('SD-FDBK-INFRA-RETIRE-SEAT-TIER-001 (ratification 20dc072b): retirement is provable, not stubbed', () => {
  it('TS-1: a seat below a stamped min_tier_rank floor is never refused claim/dispatch eligibility', () => {
    const sd = {
      sd_key: 'SD-BELOW-FLOOR-001',
      metadata: { min_tier_rank: TOP, min_tier_rank_reason: 'unit-test floor' },
    };
    // worker_tier_rank: 1 is below the TOP floor; tiering_active: true means the axis is NOT
    // globally inert (degrade-to-1 is a separate, orthogonal reason this could pass).
    const verdict = classifyDispatchIneligibility(sd, { worker_tier_rank: 1, tiering_active: true });
    expect(verdict).toBeNull();
    // tierBlocks (the claim-side gate lib/fleet/tier-claimable.cjs exports) must agree.
    expect(tierBlocks(sd, 1, true)).toBe(false);
    // claimableForTier's rollup must include the below-floor SD, not filter it out.
    expect(claimableForTier([sd], { workerTierRank: 1, tieringActive: true, preFiltered: true })).toEqual([sd]);
  });

  it('TS-3a: classifyDispatchIneligibility can never emit any of the three deleted verdict strings', () => {
    const DELETED_VERDICTS = ['above_worker_tier', 'tier_stamp_missing', 'reserved_no_lower_backlog'];
    // Sweep a matrix of ctx shapes designed to have triggered each deleted branch pre-retirement.
    const matrix = [
      { worker_tier_rank: undefined, tiering_active: true }, // was tier_stamp_missing
      { worker_tier_rank: NaN, tiering_active: true }, // was tier_stamp_missing
      { worker_tier_rank: 1, tiering_active: true }, // was above_worker_tier (vs a TOP floor below)
      { worker_tier_rank: TOP, tiering_active: true, lower_tier_backlog_data: { claimableBreakdown: { cumulative: { 1: 1 } }, idleCensus: { cumulative: { 1: 1 } } } }, // was reserved_no_lower_backlog
    ];
    for (const ctx of matrix) {
      const sd = { sd_key: 'SD-SWEEP-001', metadata: { min_tier_rank: TOP, min_tier_rank_reason: 'unit-test floor' } };
      const verdict = classifyDispatchIneligibility(sd, ctx);
      expect(DELETED_VERDICTS).not.toContain(verdict);
    }
  });

  it('TS-3b: assertWorkerTierAllowed is provably absent from dispatch.cjs, not a no-op stub', () => {
    expect(typeof dispatch.assertWorkerTierAllowed).toBe('undefined');
    expect(Object.prototype.hasOwnProperty.call(dispatch, 'assertWorkerTierAllowed')).toBe(false);
  });

  it('TS-3c: enforceTierGate is provably absent from sd-start.js source (dead-symbol grep pin)', () => {
    const src = readFileSync(resolve(repoRoot, 'scripts/sd-start.js'), 'utf8');
    expect(src).not.toMatch(/function enforceTierGate/);
    expect(src).not.toMatch(/await enforceTierGate/);
  });

  // FR-4: static inertness check for the tombstoned migration -- must never lose its unmissable
  // SUPERSEDED/DO-NOT-APPLY marker citing this SD's ratification, no matter what else changes.
  it('FR-4: the staged claim_sd tier-check migration carries a SUPERSEDED/DO-NOT-APPLY marker', () => {
    const src = readFileSync(
      resolve(repoRoot, 'database/migrations/20260816_claim_sd_tier_check.sql'), 'utf8'
    );
    expect(src).toMatch(/SUPERSEDED — DO NOT APPLY/);
    expect(src).toMatch(/20dc072b/);
    // @chairman-gated exempts this permanently-diverging file from
    // scripts/check-migration-readiness.mjs's pre-merge drift-vs-live gate (which otherwise
    // red-blocks any PR touching a staged migration whose body has drifted from the live
    // function) -- required because this file is intentionally never applied, so its drift
    // vs. live only grows over time. See parseChairmanGatedMarker() in that script.
    expect(src).toMatch(/^-- @chairman-gated\s*$/m);
    // The original @approved-by gate line is preserved verbatim below the tombstone marker --
    // this SD adds a marker, it does not alter the pre-existing staging gate.
    expect(src).toMatch(/@approved-by: STAGED ONLY -- NOT APPLIED/);
  });
});
