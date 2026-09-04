/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B FR-1: isUnreleasedChairmanHold() is a NARROW
 * "chairman must act" predicate for completion-writer refusal — deliberately NOT
 * resolveHoldProvenance() as-is. VAL-1 (evidence cc6f72a7) measured resolveHoldProvenance()
 * over-matching 42 completed SDs across 6 source keys; most of those (deferred_by,
 * not_worker_claimable_reason) are legitimately compatible with completion. Only
 * requires_human_action_reason and review_hold_reason mean "chairman must act" — and only
 * while unreleased.
 *
 * review_hold_reason previously had NO release check at all (a one-way latch, unlike
 * requires_human_action_reason's unfenced_at coverage). isHoldReleased() is extended with a
 * setAtField parameter so both keys share the SAME single release mechanism
 * (unfenced_at/by/reason via releaseHold()) instead of forking a second one.
 */
import { describe, it, expect } from 'vitest';

const { isUnreleasedChairmanHold, isHoldReleased } = await import('../../../lib/fleet/claim-eligibility.cjs');

describe('SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B FR-1: isUnreleasedChairmanHold (AC-1)', () => {
  it('AC-1: returns false for a deferred_by-only row (NOT a chairman hold, VAL-1 over-match key)', () => {
    const metadata = { deferred_by: 'someone', deferred_at: '2026-08-01T00:00:00Z' };
    expect(isUnreleasedChairmanHold(metadata)).toBe(false);
  });

  it('AC-1: returns false for a not_worker_claimable_reason-only row (NOT a chairman hold, VAL-1 over-match key)', () => {
    const metadata = { not_worker_claimable_reason: 'wrong repo', not_worker_claimable_by: 'system' };
    expect(isUnreleasedChairmanHold(metadata)).toBe(false);
  });

  it('AC-1: returns false for a dispatch_ineligible_reason-only row (NOT a chairman hold)', () => {
    const metadata = { dispatch_ineligible_reason: 'no capacity' };
    expect(isUnreleasedChairmanHold(metadata)).toBe(false);
  });

  it('AC-1: returns false for a bare pilot_throwaway row (NOT a chairman hold)', () => {
    const metadata = { pilot_throwaway: true };
    expect(isUnreleasedChairmanHold(metadata)).toBe(false);
  });

  it('AC-1: returns true for requires_human_action_reason with no release', () => {
    const metadata = { requires_human_action_reason: 'awaiting chairman decision', requires_human_action_at: '2026-08-01T00:00:00Z' };
    expect(isUnreleasedChairmanHold(metadata)).toBe(true);
  });

  it('returns false for requires_human_action_reason RELEASED via unfenced_at at/after the set-at stamp (existing coverage, unchanged)', () => {
    const metadata = {
      requires_human_action_reason: 'awaiting chairman decision',
      requires_human_action_at: '2026-08-01T00:00:00Z',
      unfenced_at: '2026-08-02T00:00:00Z',
    };
    expect(isUnreleasedChairmanHold(metadata)).toBe(false);
  });

  it('AC-2: returns true for review_hold_reason with NO release marker (the one-way-latch gap this FR closes)', () => {
    const metadata = { review_hold_reason: 'build review flagged, chairman must decide' };
    expect(isUnreleasedChairmanHold(metadata)).toBe(true);
  });

  it('AC-2: returns false for review_hold_reason with a release marker (unfenced_at) set — does NOT trip the refusal', () => {
    const metadata = { review_hold_reason: 'build review flagged, chairman must decide', unfenced_at: '2026-08-02T00:00:00Z' };
    expect(isUnreleasedChairmanHold(metadata)).toBe(false);
  });

  it('AC-2: review_hold_reason with unfenced_at PREDATING review_hold_at is still held (stale/reused stamp, not a real release)', () => {
    const metadata = {
      review_hold_reason: 'build review flagged',
      review_hold_at: '2026-08-05T00:00:00Z',
      unfenced_at: '2026-08-01T00:00:00Z',
    };
    expect(isUnreleasedChairmanHold(metadata)).toBe(true);
  });

  it('returns true when BOTH keys are present and unreleased (either alone is sufficient)', () => {
    const metadata = {
      requires_human_action_reason: 'A',
      review_hold_reason: 'B',
    };
    expect(isUnreleasedChairmanHold(metadata)).toBe(true);
  });

  it('returns false for empty/null metadata', () => {
    expect(isUnreleasedChairmanHold(null)).toBe(false);
    expect(isUnreleasedChairmanHold({})).toBe(false);
  });

  it("treats whitespace-only reason strings as absent (mirrors resolveHoldProvenance's trim discipline)", () => {
    expect(isUnreleasedChairmanHold({ review_hold_reason: '   ' })).toBe(false);
    expect(isUnreleasedChairmanHold({ requires_human_action_reason: '' })).toBe(false);
  });
});

describe('isHoldReleased(metadata, setAtField) — FR-1 parameterization', () => {
  it('default setAtField (requires_human_action_at) is byte-identical to pre-FR behavior', () => {
    const metadata = { requires_human_action_at: '2026-08-01T00:00:00Z', unfenced_at: '2026-08-02T00:00:00Z' };
    expect(isHoldReleased(metadata)).toBe(true);
  });

  it('custom setAtField=review_hold_at compares against that field instead', () => {
    const metadata = { review_hold_at: '2026-08-05T00:00:00Z', unfenced_at: '2026-08-01T00:00:00Z' };
    expect(isHoldReleased(metadata, 'review_hold_at')).toBe(false); // unfenced_at predates review_hold_at
    expect(isHoldReleased(metadata, 'requires_human_action_at')).toBe(true); // that field is absent -> fallback true
  });
});
