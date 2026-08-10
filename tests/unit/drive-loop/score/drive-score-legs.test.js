/**
 * SD-LEO-INFRA-DRIVE-SCORE-DENOMINATOR-001 FR-3 — the leg set cannot silently grow.
 *
 * Two-sided throughout, with a positive control: a guard that can never observe a plant is a
 * guard that proves nothing. Each assertion first shows the guard FIRING on a seeded violation,
 * then shows the ratified set PASSING — so a future edit that neuters the guard turns this red.
 */
import { describe, it, expect } from 'vitest';
import {
  DRIVE_SCORE_LEGS, RATIFIED_LEG_IDS, SPEC_LEG_COUNT, RATIFICATION,
  assertLegSetRatified, assertProducedLegsMatchSSOT,
} from '../../../../lib/drive-loop/score/drive-score-legs.js';

describe('DRIVE_SCORE_LEGS — the ratified SSOT', () => {
  it('is exactly the three defined legs, frozen, and SPEC_LEG_COUNT is derived from it', () => {
    expect(RATIFIED_LEG_IDS).toEqual(['leg1_landed', 'leg2_uptake', 'leg4_capacity']);
    expect(SPEC_LEG_COUNT).toBe(3);
    expect(SPEC_LEG_COUNT).toBe(DRIVE_SCORE_LEGS.length); // derived, not a bare literal
    expect(Object.isFrozen(DRIVE_SCORE_LEGS)).toBe(true);
    expect(DRIVE_SCORE_LEGS.every((l) => Object.isFrozen(l))).toBe(true);
  });

  it('every ratified leg carries a ratified_by marker (the spec-change token)', () => {
    for (const l of DRIVE_SCORE_LEGS) expect(l.ratified_by).toBe(RATIFICATION.ruling);
  });
});

describe('FR-3 assertLegSetRatified — a phantom leg (no marker) fails loud', () => {
  it('[POSITIVE CONTROL] fires on a leg minted WITHOUT a ratified_by marker', () => {
    const withPhantom = [...DRIVE_SCORE_LEGS, { id: 'leg3_phantom' }]; // no ratified_by
    expect(() => assertLegSetRatified(withPhantom)).toThrow(/DRIVE_SCORE_LEG_UNRATIFIED[\s\S]*leg3_phantom/);
    // empty-string marker is also a phantom
    expect(() => assertLegSetRatified([{ id: 'x', ratified_by: '  ' }])).toThrow(/UNRATIFIED/);
  });

  it('[NEGATIVE CONTROL] passes on the ratified set, and on a NEW leg added WITH a marker', () => {
    expect(assertLegSetRatified()).toEqual(RATIFIED_LEG_IDS); // the shipped set
    // Minting is legitimate ONLY as an explicit spec change — a leg WITH a ratification token.
    const withMintedLeg = [...DRIVE_SCORE_LEGS, { id: 'leg3_revived', ratified_by: 'future-ruling-abc' }];
    expect(assertLegSetRatified(withMintedLeg)).toContain('leg3_revived');
  });
});

describe('FR-3 assertProducedLegsMatchSSOT — the produced set is pinned to the SSOT bidirectionally', () => {
  it('[POSITIVE CONTROL] an unratified leg in the produced set fails loud', () => {
    expect(() => assertProducedLegsMatchSSOT([...RATIFIED_LEG_IDS, 'leg5_snuck_in']))
      .toThrow(/DRIVE_SCORE_LEG_SET_DRIFT[\s\S]*unratified leg\(s\) produced: leg5_snuck_in/);
  });

  it('[POSITIVE CONTROL] a ratified leg dropped from the produced set fails loud', () => {
    expect(() => assertProducedLegsMatchSSOT(['leg1_landed', 'leg2_uptake'])) // leg4 dropped
      .toThrow(/DRIVE_SCORE_LEG_SET_DRIFT[\s\S]*not produced: leg4_capacity/);
  });

  it('[NEGATIVE CONTROL] the exact ratified set passes (order-independent)', () => {
    expect(() => assertProducedLegsMatchSSOT(['leg4_capacity', 'leg1_landed', 'leg2_uptake'])).not.toThrow();
  });
});
