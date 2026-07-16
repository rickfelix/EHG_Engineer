/**
 * SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001 — accepted-known-state suppression axis tests.
 * Pins: a live disposition suppresses the matching fingerprint (TS-1), an unrelated fingerprint is
 * unaffected (fingerprint-scoped, not name-scoped), and the axis is a pure no-op when the Set is absent
 * (backward compatible with every existing caller/test).
 */
import { describe, it, expect } from 'vitest';
import { evaluateRefillCandidate, REFILL_INVALID_REASONS } from '../../../lib/sourcing-engine/refill-candidate-validity.js';

const validItem = (over = {}) => ({
  item_disposition: 'pending',
  promoted_to_sd_key: null,
  title: 'WAVE_LINKAGE_STARVATION: wave-linkage coverage 62% < 80%',
  source_type: 'brainstorm',
  source_id: '11111111-1111-1111-1111-111111111111',
  lane: 'belt',
  metadata: { dedup_key: 'WAVE_LINKAGE_STARVATION' },
  ...over,
});

describe('evaluateRefillCandidate — accepted-known-state suppression axis', () => {
  it('suppresses a candidate whose fingerprint has a live disposition (TS-1)', () => {
    const r = evaluateRefillCandidate(validItem(), {
      acceptedFingerprintSet: new Set(['WAVE_LINKAGE_STARVATION']),
    });
    expect(r).toEqual({ valid: false, reason: REFILL_INVALID_REASONS.ACCEPTED_KNOWN_STATE });
  });

  it('does NOT suppress a candidate whose fingerprint is absent from the Set', () => {
    const r = evaluateRefillCandidate(validItem(), {
      acceptedFingerprintSet: new Set(['SOME_OTHER_FINDING']),
    });
    expect(r).toEqual({ valid: true, reason: null });
  });

  it('a different fingerprint still promotes normally even with an unrelated live disposition (fingerprint-scoped)', () => {
    const r = evaluateRefillCandidate(
      validItem({ metadata: { dedup_key: 'A_DIFFERENT_FINDING' } }),
      { acceptedFingerprintSet: new Set(['WAVE_LINKAGE_STARVATION']) },
    );
    expect(r.valid).toBe(true);
  });

  it('is a no-op when acceptedFingerprintSet is absent (backward compatible)', () => {
    expect(evaluateRefillCandidate(validItem())).toEqual({ valid: true, reason: null });
  });

  it('is a no-op when the item has no metadata.dedup_key, even with a live Set', () => {
    const r = evaluateRefillCandidate(
      validItem({ metadata: {} }),
      { acceptedFingerprintSet: new Set(['WAVE_LINKAGE_STARVATION']) },
    );
    expect(r).toEqual({ valid: true, reason: null });
  });

  it('lifecycle ordering: accepted_known_state is reported even when other fields are also bad (fires before structural checks)', () => {
    const r = evaluateRefillCandidate(
      validItem({ title: '' }),
      { acceptedFingerprintSet: new Set(['WAVE_LINKAGE_STARVATION']) },
    );
    expect(r.reason).toBe(REFILL_INVALID_REASONS.ACCEPTED_KNOWN_STATE);
  });

  it('a declined-lane item still reports declined_lane first (lifecycle-before-disposition ordering)', () => {
    const r = evaluateRefillCandidate(
      validItem({ lane: 'decline' }),
      { acceptedFingerprintSet: new Set(['WAVE_LINKAGE_STARVATION']) },
    );
    expect(r.reason).toBe(REFILL_INVALID_REASONS.DECLINED_LANE);
  });
});
