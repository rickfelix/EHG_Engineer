/**
 * SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FR-2) — preference-model.js:
 * bounded weight map (explicit DOMINANT + decisions WEAK prior), idempotent seed.
 * Pure tests with an injected store; NO live DB, NO real chairman_preferences write.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  computePreferenceWeights,
  deriveDecisionsPrior,
  clamp,
  CLAMP_LO,
  CLAMP_HI,
  seedStandingPreference,
  STANDING_WORKER_CAPABILITY_DIRECTIVE,
  WORKER_CAPABILITY_PREF_KEY,
} from '../../../lib/adam/preference-model.js';

// Injected store stub mimicking ChairmanPreferenceStore.getPreferences/getPreference/setPreference.
function makeStore({ prefs = new Map(), existing = null } = {}) {
  return {
    getPreferences: vi.fn(async () => prefs),
    getPreference: vi.fn(async () => existing),
    setPreference: vi.fn(async () => ({ success: true, record: { id: 'new-1' } })),
  };
}

describe('clamp (bounded weights)', () => {
  it('clamps into [CLAMP_LO, CLAMP_HI] and never to 0', () => {
    expect(clamp(10)).toBe(CLAMP_HI);
    expect(clamp(0)).toBe(CLAMP_LO);
    expect(clamp(-5)).toBe(CLAMP_LO);
    expect(clamp(1.0)).toBe(1.0);
    expect(clamp(NaN)).toBe(1.0);
    expect(clamp(undefined)).toBe(1.0);
  });
  it('the clamp range can never invert off-track(3x) below on-track(1x): HI/LO <= 3', () => {
    expect(CLAMP_HI / CLAMP_LO).toBeLessThanOrEqual(3);
  });
});

describe('deriveDecisionsPrior (WEAK soft prior)', () => {
  it('reports consumed = row count and a small capped nudge', () => {
    const decisions = Array.from({ length: 51 }, (_, i) => ({ id: i, decision: i < 5 ? 'reject' : 'approve' }));
    const { weights, consumed } = deriveDecisionsPrior(decisions);
    expect(consumed).toBe(51);
    // 5 cautious * 0.01 = 0.05 -> conservative class weight 1.05 (well below dominant).
    expect(weights.conservative).toBeCloseTo(1.05, 5);
  });
  it('caps the aggregate nudge so decisions can never dominate', () => {
    const decisions = Array.from({ length: 100 }, () => ({ decision: 'reject' }));
    const { weights } = deriveDecisionsPrior(decisions);
    expect(weights.conservative).toBeLessThanOrEqual(1.1); // maxNudge cap
  });
  it('empty -> no weights, consumed 0', () => {
    expect(deriveDecisionsPrior([])).toEqual({ weights: {}, consumed: 0 });
  });
});

describe('computePreferenceWeights (UNION, explicit DOMINANT)', () => {
  it('unions explicit prefs (dominant) with the weak decisions prior, all bounded', async () => {
    const prefs = new Map([[WORKER_CAPABILITY_PREF_KEY, { value: { 'worker-capability': 1.25, 'adam-autonomy': 0.8 }, valueType: 'object' }]]);
    const store = makeStore({ prefs });
    const decisions = [{ decision: 'reject' }, { decision: 'approve' }];
    const r = await computePreferenceWeights({ store, decisions });
    expect(r.weights['worker-capability']).toBe(1.25);
    expect(r.weights['adam-autonomy']).toBe(0.8);
    expect(r.weights.conservative).toBeCloseTo(1.01, 5); // weak prior survives (no overlap)
    expect(r.decisionsConsumed).toBe(2);
    expect(r.explicitClasses).toContain('worker-capability');
  });

  it('explicit term DOMINATES (overwrites) an overlapping decisions-prior class', async () => {
    // Decisions would nudge 'conservative'; an explicit pref for the same class wins.
    const prefs = new Map([[WORKER_CAPABILITY_PREF_KEY, { value: { conservative: 0.8 }, valueType: 'object' }]]);
    const store = makeStore({ prefs });
    const r = await computePreferenceWeights({ store, decisions: [{ decision: 'reject' }] });
    expect(r.weights.conservative).toBe(0.8); // explicit, not the 1.01 prior
  });

  it('clamps an out-of-range explicit weight', async () => {
    const prefs = new Map([[WORKER_CAPABILITY_PREF_KEY, { value: { 'worker-capability': 99, 'adam-autonomy': 0 }, valueType: 'object' }]]);
    const store = makeStore({ prefs });
    const r = await computePreferenceWeights({ store, decisions: [] });
    expect(r.weights['worker-capability']).toBe(CLAMP_HI);
    expect(r.weights['adam-autonomy']).toBe(CLAMP_LO); // never 0
  });

  it('fails soft to empty when the store throws', async () => {
    const store = { getPreferences: vi.fn(async () => { throw new Error('db down'); }) };
    const r = await computePreferenceWeights({ store, decisions: [] });
    expect(r.weights).toEqual({});
  });
});

describe('seedStandingPreference (idempotent, NOT run live here)', () => {
  it('writes the standing directive when absent', async () => {
    const store = makeStore({ existing: null });
    const r = await seedStandingPreference({ store });
    expect(r.seeded).toBe(true);
    expect(store.setPreference).toHaveBeenCalledTimes(1);
    const arg = store.setPreference.mock.calls[0][0];
    expect(arg.chairmanId).toBe('ehg_chairman');
    expect(arg.ventureId).toBeNull();
    expect(arg.key).toBe(WORKER_CAPABILITY_PREF_KEY);
  });

  it('skips the write when already present (idempotent)', async () => {
    const store = makeStore({ existing: { id: 'p1', key: WORKER_CAPABILITY_PREF_KEY } });
    const r = await seedStandingPreference({ store });
    expect(r.skipped).toBe(true);
    expect(store.setPreference).not.toHaveBeenCalled();
  });

  it('the standing directive expresses worker-capability > adam-autonomy', () => {
    const v = STANDING_WORKER_CAPABILITY_DIRECTIVE.value;
    expect(v['worker-capability']).toBeGreaterThan(v['adam-autonomy']);
  });
});
