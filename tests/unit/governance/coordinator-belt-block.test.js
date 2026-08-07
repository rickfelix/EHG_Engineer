/**
 * QF-20260727-395 — the gauge that measures whether the COORDINATOR is answering.
 *
 * THIS SUITE IS BUILT AROUND ITS NEGATIVE CONTROLS, not around its positive case. The row exists
 * because three gauges reported green while the belt was fully fenced; a fourth gauge that can
 * only ever report one verdict would be the same defect wearing a new name. So every assertion
 * below has a partner that must produce the OPPOSITE verdict from a minimally-different input.
 */
import { describe, it, expect } from 'vitest';
import {
  assessCoordinatorBeltBlock,
  formatCoordinatorBeltBlock,
  BELT_VERDICT,
  COORDINATOR_OWNED_REASONS,
} from '../../../lib/governance/coordinator-belt-block.js';

// Charlie's measurement, 2026-07-27T20:38Z: 21 ranked, 0 claimable, 10 coordinator / 9 human.
const CHARLIE_2038Z = { needs_coordinator_review: 10, human_action_required: 9 };

describe('QF-20260727-395: belt blocked on coordinator-owned fences', () => {
  it('THE CASE: depth 0 and the largest bucket is coordinator-owned -> BLOCKED_ON_COORDINATOR', () => {
    const a = assessCoordinatorBeltBlock({ claimableDepth: 0, ineligibilityBreakdown: CHARLIE_2038Z });
    expect(a.verdict).toBe(BELT_VERDICT.BLOCKED_ON_COORDINATOR);
    expect(a.blocked).toBe(true);
    expect(a.largestBucket).toBe('needs_coordinator_review');
    expect(a.coordinatorOwnedCount).toBe(10);
    // The reason must NAME the bucket -- a bare "blocked" would send the coordinator hunting.
    expect(a.reason).toContain('needs_coordinator_review');
  });

  it('NEGATIVE CONTROL 1 (the load-bearing one): depth 0 but the largest bucket is NOT coordinator-owned -> OK', () => {
    // Same zero depth, ONE field different. If this also returned BLOCKED, the gauge would be
    // measuring "belt is empty" -- which is not a defect -- and would fire every time work ran out.
    const a = assessCoordinatorBeltBlock({
      claimableDepth: 0,
      ineligibilityBreakdown: { needs_coordinator_review: 2, human_action_required: 11 },
    });
    expect(a.verdict).toBe(BELT_VERDICT.OK);
    expect(a.blocked).toBe(false);
    expect(a.largestBucket).toBe('human_action_required');
    // It still REPORTS the coordinator-owned count, unconditionally, even when not blocking.
    expect(a.coordinatorOwnedCount).toBe(2);
    expect(a.reason).toContain('not coordinator-owned');
  });

  it('NEGATIVE CONTROL 2: coordinator-owned bucket is largest but work IS claimable -> OK', () => {
    // Fences held while workers still have work is correct behaviour, not an alarm. A fence held
    // for a stated reason is fine; the row is explicit that this must not become a nag.
    const a = assessCoordinatorBeltBlock({ claimableDepth: 7, ineligibilityBreakdown: CHARLIE_2038Z });
    expect(a.verdict).toBe(BELT_VERDICT.OK);
    expect(a.blocked).toBe(false);
    expect(a.coordinatorOwnedCount).toBe(10);
  });

  it('the two controls differ from the positive case by ONE field each, so the gauge is proven to discriminate', () => {
    const positive = assessCoordinatorBeltBlock({ claimableDepth: 0, ineligibilityBreakdown: CHARLIE_2038Z });
    const depthDiffers = assessCoordinatorBeltBlock({ claimableDepth: 1, ineligibilityBreakdown: CHARLIE_2038Z });
    const bucketDiffers = assessCoordinatorBeltBlock({
      claimableDepth: 0,
      ineligibilityBreakdown: { needs_coordinator_review: 1, human_action_required: 9 },
    });
    // If any of these three collapse to the same verdict the suite has gone vacuous.
    expect(new Set([positive.verdict, depthDiffers.verdict, bucketDiffers.verdict]).size).toBe(2);
    expect(positive.verdict).not.toBe(depthDiffers.verdict);
    expect(positive.verdict).not.toBe(bucketDiffers.verdict);
  });
});

describe('NOT_MEASURED is never collapsed into OK', () => {
  it('missing claimableDepth -> NOT_MEASURED, not OK', () => {
    const a = assessCoordinatorBeltBlock({ ineligibilityBreakdown: CHARLIE_2038Z });
    expect(a.verdict).toBe(BELT_VERDICT.NOT_MEASURED);
    expect(a.reason).toContain('claimableDepth');
  });

  it('missing ineligibilityBreakdown -> NOT_MEASURED, not OK', () => {
    const a = assessCoordinatorBeltBlock({ claimableDepth: 0 });
    expect(a.verdict).toBe(BELT_VERDICT.NOT_MEASURED);
    expect(a.reason).toContain('ineligibilityBreakdown');
  });

  it('called with NO arguments at all -> NOT_MEASURED', () => {
    // The unwired-caller case. An unwired gauge must not read as a healthy belt -- this is the
    // whole class QF-20260727-395 sits inside.
    expect(assessCoordinatorBeltBlock().verdict).toBe(BELT_VERDICT.NOT_MEASURED);
    expect(assessCoordinatorBeltBlock({}).verdict).toBe(BELT_VERDICT.NOT_MEASURED);
  });

  it('an array is not a breakdown object -> NOT_MEASURED', () => {
    const a = assessCoordinatorBeltBlock({ claimableDepth: 0, ineligibilityBreakdown: [] });
    expect(a.verdict).toBe(BELT_VERDICT.NOT_MEASURED);
  });

  it('a genuinely EMPTY breakdown with claimable work is OK, not NOT_MEASURED', () => {
    // measured-and-empty vs not-measured: the distinction the row is about.
    const a = assessCoordinatorBeltBlock({ claimableDepth: 5, ineligibilityBreakdown: {} });
    expect(a.verdict).toBe(BELT_VERDICT.OK);
    expect(a.totalIneligible).toBe(0);
    expect(a.largestBucket).toBeNull();
  });
});

describe('mechanics', () => {
  it('human_action_required is NOT counted as coordinator-owned', () => {
    // It is the chairman's queue. Folding it in would blame the coordinator for someone else's.
    expect(COORDINATOR_OWNED_REASONS).not.toContain('human_action_required');
    const a = assessCoordinatorBeltBlock({
      claimableDepth: 0,
      ineligibilityBreakdown: { human_action_required: 11 },
    });
    expect(a.coordinatorOwnedCount).toBe(0);
    expect(a.blocked).toBe(false);
  });

  it('zero-count buckets are ignored so an empty tally cannot win the largest-bucket contest', () => {
    const a = assessCoordinatorBeltBlock({
      claimableDepth: 0,
      ineligibilityBreakdown: { needs_coordinator_review: 0, human_action_required: 3 },
    });
    expect(a.largestBucket).toBe('human_action_required');
    expect(a.blocked).toBe(false);
  });

  it('ties break deterministically by reason name so the verdict cannot flicker between runs', () => {
    const input = { claimableDepth: 0, ineligibilityBreakdown: { needs_coordinator_review: 4, human_action_required: 4 } };
    const first = assessCoordinatorBeltBlock(input);
    const second = assessCoordinatorBeltBlock({ ...input, ineligibilityBreakdown: { human_action_required: 4, needs_coordinator_review: 4 } });
    expect(first.largestBucket).toBe(second.largestBucket);
    expect(first.verdict).toBe(second.verdict);
  });

  it('formats counts UNCONDITIONALLY, including zeroes, so measured-zero reads differently from unmeasured', () => {
    const measuredZero = formatCoordinatorBeltBlock(
      assessCoordinatorBeltBlock({ claimableDepth: 3, ineligibilityBreakdown: {} })
    );
    const unmeasured = formatCoordinatorBeltBlock(assessCoordinatorBeltBlock());
    expect(measuredZero).toContain('coordinator_owned=0');
    expect(measuredZero).toContain('total_ineligible=0');
    expect(unmeasured).toContain('NOT_MEASURED');
    expect(unmeasured).not.toContain('coordinator_owned=0');
    expect(measuredZero).not.toBe(unmeasured);
  });
});
