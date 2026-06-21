/**
 * SD-LEO-INFRA-AUTO-REFILL-SELECTION-GATE-001-A — pure candidate-validity predicate tests.
 * Pins: the VALID staged case, every INVALID reason, lifecycle-first ordering, and totality on odd input.
 */
import { describe, it, expect } from 'vitest';
import { evaluateRefillCandidate, REFILL_INVALID_REASONS } from '../../../lib/sourcing-engine/refill-candidate-validity.js';

// A well-formed staged refill candidate (the 683-item live shape: pending, unpromoted, real provenance).
const validItem = (over = {}) => ({
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  title: 'Harden the worktree reaper',
  source_type: 'conversion_ledger',
  source_id: '11111111-1111-1111-1111-111111111111',
  lane: 'belt',
  ...over,
});

describe('evaluateRefillCandidate (FOUNDATION SSOT)', () => {
  it('a well-formed staged, unpromoted item is VALID', () => {
    expect(evaluateRefillCandidate(validItem())).toEqual({ valid: true, reason: null });
  });

  it('an already-promoted item is INVALID (already_promoted) — lifecycle reason wins', () => {
    // even with other fields also bad, the lifecycle reason is reported first
    const r = evaluateRefillCandidate(validItem({ promoted_to_sd_key: 'SD-LEO-INFRA-X-001', title: '' }));
    expect(r).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.ALREADY_PROMOTED });
  });

  it('a non-staged item (item_disposition != pending) is INVALID (not_staged)', () => {
    expect(evaluateRefillCandidate(validItem({ item_disposition: 'declined' }))).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.NOT_STAGED });
    expect(evaluateRefillCandidate(validItem({ item_disposition: null }))).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.NOT_STAGED });
  });

  it('a decline-lane item is INVALID (declined_lane), case/space-insensitive', () => {
    expect(evaluateRefillCandidate(validItem({ lane: 'decline' })).reason).toBe(REFILL_INVALID_REASONS.DECLINED_LANE);
    expect(evaluateRefillCandidate(validItem({ lane: ' Decline ' })).reason).toBe(REFILL_INVALID_REASONS.DECLINED_LANE);
  });

  it('a missing/empty title is INVALID (missing_title)', () => {
    expect(evaluateRefillCandidate(validItem({ title: '' })).reason).toBe(REFILL_INVALID_REASONS.MISSING_TITLE);
    expect(evaluateRefillCandidate(validItem({ title: '   ' })).reason).toBe(REFILL_INVALID_REASONS.MISSING_TITLE);
    expect(evaluateRefillCandidate(validItem({ title: undefined })).reason).toBe(REFILL_INVALID_REASONS.MISSING_TITLE);
  });

  it('missing source_type or source_id is INVALID (missing_provenance)', () => {
    expect(evaluateRefillCandidate(validItem({ source_type: '' })).reason).toBe(REFILL_INVALID_REASONS.MISSING_PROVENANCE);
    expect(evaluateRefillCandidate(validItem({ source_id: null })).reason).toBe(REFILL_INVALID_REASONS.MISSING_PROVENANCE);
  });

  it('a TEST/DEMO fixture (by title or sd-key-shaped source_id) is INVALID (test_fixture)', () => {
    expect(evaluateRefillCandidate(validItem({ title: 'TEST harness probe' })).reason).toBe(REFILL_INVALID_REASONS.TEST_FIXTURE);
    expect(evaluateRefillCandidate(validItem({ title: 'SD-DEMO sample' })).reason).toBe(REFILL_INVALID_REASONS.TEST_FIXTURE);
    expect(evaluateRefillCandidate(validItem({ source_id: 'SD-TEST-FIXTURE-001' })).reason).toBe(REFILL_INVALID_REASONS.TEST_FIXTURE);
  });

  it('does NOT false-flag a normal title that merely contains test/demo mid-word', () => {
    // FIXTURE_TITLE_RE is anchored — "Latest dashboard" / "Demonstrate X" should NOT match a leading TEST/DEMO token.
    expect(evaluateRefillCandidate(validItem({ title: 'Refactor the latest dashboard widget' })).valid).toBe(true);
  });

  it('is TOTAL on odd input (null / {} / array / number) — never throws, returns missing_item or a reason', () => {
    expect(evaluateRefillCandidate(null)).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    expect(evaluateRefillCandidate(undefined)).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    expect(evaluateRefillCandidate([])).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    expect(evaluateRefillCandidate(42)).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.MISSING_ITEM });
    // empty object: not already-promoted, item_disposition undefined -> not_staged
    expect(evaluateRefillCandidate({})).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.NOT_STAGED });
  });
});
