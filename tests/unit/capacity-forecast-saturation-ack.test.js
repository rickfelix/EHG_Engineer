// SD-REFILL-00G39SZT: the capacity forecaster must not re-ping Adam with the SAME deficit on an
// unchanged belt-dry state once the time cooldown lapses (6+ pings in ~2h after Adam reports
// saturation). A deficit fingerprint + shouldPingAdam suppress the duplicate ping until a
// supply-change signal (fingerprint change). These pin the two pure helpers.
import { describe, it, expect } from 'vitest';
import { deficitFingerprint, shouldPingAdam, formatClaimableNow, formatBeltExtent, formatDeficitFormula } from '../../scripts/coordinator-capacity-forecast.mjs';
import { computeBeltVerdict } from '../../lib/drive-loop/belt-verdict.js';

const state = { verdict: 'DEFICIT', beltDepth: 0, deficit: 2, claimable: [{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }] };

describe('deficitFingerprint (SD-REFILL-00G39SZT)', () => {
  it('TS-1: identical belt-dry state -> identical fingerprint', () => {
    expect(deficitFingerprint(state)).toBe(deficitFingerprint({ ...state }));
  });

  it('order-independent over the claimable set', () => {
    const reordered = { ...state, claimable: [{ sd_key: 'SD-B' }, { sd_key: 'SD-A' }] };
    expect(deficitFingerprint(reordered)).toBe(deficitFingerprint(state));
  });

  it('TS-2: a changed belt (new claimable SD) -> different fingerprint', () => {
    const supplied = { ...state, beltDepth: 1, claimable: [{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }, { sd_key: 'SD-C' }] };
    expect(deficitFingerprint(supplied)).not.toBe(deficitFingerprint(state));
  });

  it('a changed verdict / deficit magnitude -> different fingerprint', () => {
    expect(deficitFingerprint({ ...state, verdict: 'DEFICIT-URGENT' })).not.toBe(deficitFingerprint(state));
    expect(deficitFingerprint({ ...state, deficit: 5 })).not.toBe(deficitFingerprint(state));
  });
});

describe('shouldPingAdam (SD-REFILL-00G39SZT)', () => {
  const fp = deficitFingerprint(state);

  it('TS-3: inside the time cooldown -> hold (no ping)', () => {
    expect(shouldPingAdam({ cd: { fingerprint: fp }, sinceMin: 5, cooldownMin: 30, currentFp: fp }))
      .toEqual({ ping: false, reason: 'cooldown' });
  });

  it('TS-4: past cooldown + unchanged fingerprint -> suppress (saturation)', () => {
    expect(shouldPingAdam({ cd: { fingerprint: fp }, sinceMin: 45, cooldownMin: 30, currentFp: fp }))
      .toEqual({ ping: false, reason: 'saturation-unchanged' });
  });

  it('TS-5: past cooldown + changed fingerprint (supply changed) -> ping', () => {
    const newFp = deficitFingerprint({ ...state, beltDepth: 1 });
    expect(shouldPingAdam({ cd: { fingerprint: fp }, sinceMin: 45, cooldownMin: 30, currentFp: newFp }).ping).toBe(true);
  });

  it('TS-6: no prior stamp -> ping (first deficit)', () => {
    expect(shouldPingAdam({ cd: null, sinceMin: Infinity, cooldownMin: 30, currentFp: fp }).ping).toBe(true);
  });

  it('a legacy stamp without a fingerprint is treated as changed -> ping (one re-stamp)', () => {
    expect(shouldPingAdam({ cd: { at: 1 }, sinceMin: 45, cooldownMin: 30, currentFp: fp }).ping).toBe(true);
  });
});

// QF-20260818-381: "Claimable now: NONE" must distinguish a genuinely empty belt from items that
// exist but sit above every live worker's tier rung (Adam's measured USAGE-PANEL/min_tier_rank=2 diagnostic).
describe('formatClaimableNow (QF-20260818-381)', () => {
  it('lists the sd_keys when claimable is non-empty, regardless of aboveTop', () => {
    expect(formatClaimableNow([{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }], 3)).toBe('SD-A, SD-B');
  });

  it('strips the SD-LEO-INFRA- prefix (existing join behavior, unchanged)', () => {
    expect(formatClaimableNow([{ sd_key: 'SD-LEO-INFRA-FOO-001' }])).toBe('FOO-001');
  });

  it('empty claimable + no tier-fenced items -> plain NONE (genuinely empty belt)', () => {
    expect(formatClaimableNow([], 0)).toBe('NONE');
    expect(formatClaimableNow([])).toBe('NONE');
  });

  it('empty claimable + tier-fenced items -> distinguishes the two, does not read as an empty belt', () => {
    expect(formatClaimableNow([], 2)).toBe("0 claimable; 2 tier-fenced (above every live worker's rung)");
  });

  it('handles a missing/undefined claimable array the same as empty', () => {
    expect(formatClaimableNow(undefined, 1)).toBe("0 claimable; 1 tier-fenced (above every live worker's rung)");
    expect(formatClaimableNow(undefined, 0)).toBe('NONE');
  });
});

// SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 FR-3 (TS-5): the Adam-facing header's
// beltDepth is claimable.length + openQfCount BY CONSTRUCTION (claimableCount === claimable.length,
// scripts/lib/capacity-inputs.mjs:458) — formatBeltExtent states that same sum explicitly so the
// header always agrees with the claimable-now list's extent, closing the FR-3 mismatch.
describe('formatBeltExtent (SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 FR-3)', () => {
  it('reports the SD+QF breakdown for a mixed belt', () => {
    expect(formatBeltExtent({ claimable: [{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }], openQfCount: 3 })).toBe('2 SD + 3 QF');
  });

  it('the header total agrees with the REAL production beltDepth (computeBeltVerdict), not a locally re-derived sum', () => {
    // FR-3's whole point is that the Adam header must match the ACTUAL beltDepth the forecaster
    // computes -- so this pins formatBeltExtent's breakdown against computeBeltVerdict's real
    // output, not a hand-duplicated `claimable.length + openQfCount` expression that could drift
    // from the production formula (lib/drive-loop/belt-verdict.js) without this test noticing.
    const claimable = [{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }, { sd_key: 'SD-C' }];
    const openQfCount = 4;
    const { beltDepth } = computeBeltVerdict({
      idleNow: 1, freeingSoon: 0, claimableCount: claimable.length, openQfCount, buffer: 1,
    });
    const listedSdCount = formatClaimableNow(claimable).split(', ').length;
    const breakdown = formatBeltExtent({ claimable, openQfCount });
    expect(breakdown).toBe(`${listedSdCount} SD + ${openQfCount} QF`);
    expect(beltDepth).toBe(listedSdCount + openQfCount);
  });

  it('an empty belt reports 0 SD + 0 QF, not NaN/undefined', () => {
    expect(formatBeltExtent({ claimable: [], openQfCount: 0 })).toBe('0 SD + 0 QF');
    expect(formatBeltExtent({ claimable: undefined, openQfCount: undefined })).toBe('0 SD + 0 QF');
  });
});

// SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 FR-2: the PUBLISHED formula text itself now has
// a regression test, not just the arithmetic it displays -- names demandSoon/buffer/beltDepth
// explicitly and is deliberately UNCLAMPED (distinguishing it from the GAUGE line and
// deficitFingerprint()'s separate, legitimate Math.max(0, deficit) floors).
describe('formatDeficitFormula (SD-LEO-INFRA-FORECASTER-CLAIMABLE-PREDICATE-001 FR-2)', () => {
  it('names demand, buffer, and belt explicitly and states the real formula', () => {
    const line = formatDeficitFormula({ demandSoon: 6, buffer: 1, beltDepth: 5, deficit: 2 });
    expect(line).toBe('FORMULA: deficit = (demand 6 + buffer 1) - belt 5 = 2');
  });

  it('is agreement-checkable against computeBeltVerdict for a REAL negative-deficit (SURPLUS) case, unclamped', () => {
    const { beltDepth, demandSoon, deficit } = computeBeltVerdict({
      idleNow: 1, freeingSoon: 0, claimableCount: 9, openQfCount: 0, buffer: 2,
    });
    expect(deficit).toBeLessThan(0); // SURPLUS
    const line = formatDeficitFormula({ demandSoon, buffer: 2, beltDepth, deficit });
    // Asserts the RAW negative value survives into the line -- a reintroduced Math.max(0, deficit)
    // clamp would silently rewrite this to the wrong (0) reading and this assertion would catch it.
    expect(line.endsWith(`= ${deficit}`)).toBe(true);
    expect(deficit).not.toBe(0);
  });
});
