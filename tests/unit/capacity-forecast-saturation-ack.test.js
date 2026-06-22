// SD-REFILL-00G39SZT: the capacity forecaster must not re-ping Adam with the SAME deficit on an
// unchanged belt-dry state once the time cooldown lapses (6+ pings in ~2h after Adam reports
// saturation). A deficit fingerprint + shouldPingAdam suppress the duplicate ping until a
// supply-change signal (fingerprint change). These pin the two pure helpers.
import { describe, it, expect } from 'vitest';
import { deficitFingerprint, shouldPingAdam } from '../../scripts/coordinator-capacity-forecast.mjs';

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
