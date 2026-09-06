/**
 * SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-3 (QF-20260904-724):
 * resolveHoldProvenance() previously omitted human_action_note, human_action_reason,
 * human_action_required, and needs_coordinator_review_reason from its precedence chain, so 5 of
 * 10 documented holds rendered as "no reason recorded (bare flag)" while fully documented.
 *
 * TS-5 / AC-7: each of the four new keys resolves a real (or synthesized, for the boolean flag)
 * reason. TS-5 / AC-20: none of the four is gated by isHoldReleased() -- none has a paired set-at
 * field in current usage, so the release check does not apply to them (unlike the pre-existing
 * requires_human_action_reason/review_hold_reason keys, which DO retain release-check gating).
 * TS-5b / AC-9 (unit half): HOLD_REASON_KEYS is exported and pinned in its documented precedence
 * order, so a drift-detection test (the DB-tier half, TS-5c, lives separately since it reads live
 * strategic_directives_v2) has a real list to diff live metadata keys against.
 */
import { describe, it, expect } from 'vitest';

const { resolveHoldProvenance, HOLD_REASON_KEYS } = await import('../../../lib/fleet/claim-eligibility.cjs');

describe('QF-20260904-724 FR-3: resolveHoldProvenance widened key set (TS-5 / AC-7)', () => {
  it('AC-7: resolves human_action_note alone', () => {
    const prov = resolveHoldProvenance({ human_action_note: 'awaiting chairman ceremony' });
    expect(prov).toEqual({ reason: 'awaiting chairman ceremony', set_by: null, set_at: null, source_key: 'human_action_note' });
  });

  it('AC-7: resolves human_action_reason alone', () => {
    const prov = resolveHoldProvenance({ human_action_reason: 'needs manual verification' });
    expect(prov).toEqual({ reason: 'needs manual verification', set_by: null, set_at: null, source_key: 'human_action_reason' });
  });

  it('AC-7: resolves needs_coordinator_review_reason alone', () => {
    const prov = resolveHoldProvenance({ needs_coordinator_review_reason: 'evidence-absent pending runner output' });
    expect(prov).toEqual({ reason: 'evidence-absent pending runner output', set_by: null, set_at: null, source_key: 'needs_coordinator_review_reason' });
  });

  it('AC-7: synthesizes a reason string for the boolean-only human_action_required flag', () => {
    const prov = resolveHoldProvenance({ human_action_required: true });
    expect(prov).toEqual({ reason: 'human action required', set_by: null, set_at: null, source_key: 'human_action_required' });
  });

  it('AC-7: human_action_required=false does not resolve (bare flag off)', () => {
    expect(resolveHoldProvenance({ human_action_required: false })).toBeNull();
  });

  it('AC-20: human_action_note is NOT gated by isHoldReleased -- resolves even with unfenced_at present', () => {
    const prov = resolveHoldProvenance({ human_action_note: 'still applies', unfenced_at: '2026-01-01T00:00:00Z' });
    expect(prov?.source_key).toBe('human_action_note');
  });

  it('AC-20: needs_coordinator_review_reason is NOT gated by isHoldReleased -- resolves even with unfenced_at present', () => {
    const prov = resolveHoldProvenance({ needs_coordinator_review_reason: 'still applies', unfenced_at: '2026-01-01T00:00:00Z' });
    expect(prov?.source_key).toBe('needs_coordinator_review_reason');
  });

  it('precedence: requires_human_action_reason (canonical, unreleased) wins over human_action_note', () => {
    const prov = resolveHoldProvenance({ requires_human_action_reason: 'canonical', human_action_note: 'sibling' });
    expect(prov?.source_key).toBe('requires_human_action_reason');
  });

  it('precedence: a RELEASED requires_human_action_reason falls through to human_action_note (siblings are not release-gated)', () => {
    const prov = resolveHoldProvenance({
      requires_human_action_reason: 'canonical', requires_human_action_at: '2026-01-01T00:00:00Z',
      unfenced_at: '2026-01-02T00:00:00Z',
      human_action_note: 'sibling still applies',
    });
    expect(prov?.source_key).toBe('human_action_note');
  });

  it('precedence: review_hold_reason wins over needs_coordinator_review_reason', () => {
    const prov = resolveHoldProvenance({ review_hold_reason: 'review class', needs_coordinator_review_reason: 'review sibling' });
    expect(prov?.source_key).toBe('review_hold_reason');
  });
});

describe('QF-20260904-724 FR-3: HOLD_REASON_KEYS drift-detection key list (TS-5b / AC-9 unit half)', () => {
  it('AC-9: exports all 10 documented keys in the exact precedence order resolveHoldProvenance checks them', () => {
    expect(HOLD_REASON_KEYS).toEqual([
      'requires_human_action_reason',
      'human_action_note',
      'human_action_reason',
      'human_action_required',
      'not_worker_claimable_reason',
      'review_hold_reason',
      'needs_coordinator_review_reason',
      'dispatch_ineligible_reason',
      'pilot_throwaway',
      'deferred_by',
    ]);
  });

  it('AC-9: the exported list is frozen (cannot be silently mutated by a caller)', () => {
    expect(Object.isFrozen(HOLD_REASON_KEYS)).toBe(true);
  });
});
