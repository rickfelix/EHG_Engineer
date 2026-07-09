/**
 * QF-20260709-881 — Fable-window burn-down guard.
 *
 * A top-rung (fable) worker's downward self-claim (min_tier_rank < worker_tier_rank) must be
 * blocked while ctx.fable_window_active is true, REGARDLESS of a genuine lower-tier backlog —
 * this overrides FR-6's normal backlog-permits-downward-claim allowance for the duration of the
 * window. Sub-top-rung workers and non-downward claims are unaffected.
 */
import { describe, it, expect } from 'vitest';
import { ladderTopRank } from '../../../lib/fleet/tier-ladder.cjs';
import { classifyDispatchIneligibility } from '../../../lib/fleet/claim-eligibility.cjs';

const TOP = ladderTopRank();
const backlogPresent = { claimableBreakdown: { cumulative: { 1: 5 } }, idleCensus: { cumulative: { 1: 1 } } };

describe("classifyDispatchIneligibility 'fable_window_downward_claim_blocked' branch", () => {
  it('blocks a top-rung downward claim during an active Fable window, even with a genuine backlog', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, {
      worker_tier_rank: TOP, tiering_active: true, fable_window_active: true, lower_tier_backlog_data: backlogPresent,
    })).toBe('fable_window_downward_claim_blocked');
  });

  it('admits the same downward claim when the Fable window is inactive (falls through to FR-6)', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, {
      worker_tier_rank: TOP, tiering_active: true, fable_window_active: false, lower_tier_backlog_data: backlogPresent,
    })).toBeNull();
  });

  it('does not block a sub-top-rung worker even during an active Fable window', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, {
      worker_tier_rank: TOP - 1, tiering_active: true, fable_window_active: true, lower_tier_backlog_data: backlogPresent,
    })).toBeNull();
  });

  it('does not block an AT-rung claim (min_tier_rank === worker_tier_rank) during an active window', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: TOP } };
    expect(classifyDispatchIneligibility(sd, {
      worker_tier_rank: TOP, tiering_active: true, fable_window_active: true,
    })).toBeNull();
  });

  it('is byte-identical (null-safe) when fable_window_active is omitted', () => {
    const sd = { sd_key: 'SD-X', metadata: { min_tier_rank: 1 } };
    expect(classifyDispatchIneligibility(sd, {
      worker_tier_rank: TOP, tiering_active: true, lower_tier_backlog_data: backlogPresent,
    })).toBeNull();
  });
});
