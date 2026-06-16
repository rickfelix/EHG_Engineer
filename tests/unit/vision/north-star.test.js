/**
 * SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-BUILD-001 — canonical north-star contract.
 *
 * Proves: getNorthStar() returns the chairman-ratified target; the fail-soft 'unset' path
 * NEVER fabricates a target; the de-noise filter excludes PAT-AUTO KRs + orphan visions
 * (read-side, no mutation); the ord-11 VDR probe is repointed off KR-2026-07-05 onto the
 * canonical record with no ord-2 double-count and the coherence invariant intact;
 * and buildRecord refuses to fabricate from a non-ratified ratification.
 */
import { describe, it, expect } from 'vitest';
import { getNorthStar, toContract, isPatAutoNoise, denoiseSubstrate } from '../../../lib/vision/north-star.js';
import { buildRecord } from '../../../scripts/populate-north-star.mjs';
import { VDR_REGISTRY, assertRegistryCoherence } from '../../../lib/vision/vdr-registry.js';

const RATIFIED_ROW = {
  definition: 'EHG income-replacement', metric: 'EHG monthly net profit',
  target: { amount: 18000, unit: '$/mo', qualifier: 'net' },
  sustain: '6 consecutive qualifying months', status: 'chairman_ratified',
  provenance: { decided_at: '2026-06-16' },
};

// Minimal supabase-like stub: from().select().eq().order().limit() → resolves rows.
function dbReturning(rows, { error = null } = {}) {
  const q = {
    select() { return q; },
    eq() { return q; },
    order() { return q; },
    limit() { return Promise.resolve({ data: rows, error }); },
  };
  return { from() { return q; } };
}

describe('getNorthStar — ratified read (FR-2 / US-001)', () => {
  it('returns the chairman-ratified $18k/mo net, 6-month contract', async () => {
    const ns = await getNorthStar(dbReturning([RATIFIED_ROW]));
    expect(ns.status).toBe('chairman_ratified');
    expect(ns.metric).toBe('EHG monthly net profit');
    expect(ns.target).toEqual({ amount: 18000, unit: '$/mo', qualifier: 'net' });
    expect(ns.sustain).toBe('6 consecutive qualifying months');
  });
});

describe('getNorthStar — fail-soft unset, never fabricated (FR-2 / US-002)', () => {
  it('returns {status:unset, target:null} when no ratified record', async () => {
    const ns = await getNorthStar(dbReturning([]));
    expect(ns.status).toBe('unset');
    expect(ns.target).toBeNull();
  });
  it('returns unset on DB error (no fabrication)', async () => {
    const ns = await getNorthStar(dbReturning(null, { error: { message: 'boom' } }));
    expect(ns.status).toBe('unset');
    expect(ns.target).toBeNull();
  });
  it('returns unset when no db client is provided', async () => {
    const ns = await getNorthStar(undefined);
    expect(ns).toEqual({ status: 'unset', target: null });
  });
  it('toContract on a null row is unset', () => {
    expect(toContract(null)).toEqual({ status: 'unset', target: null });
  });
});

describe('de-noise filter — read-side, excludes PAT-AUTO + orphans (FR-5 / US-005)', () => {
  it('isPatAutoNoise detects PAT-AUTO-* codes only', () => {
    expect(isPatAutoNoise('PAT-AUTO-12345')).toBe(true);
    expect(isPatAutoNoise('KR-2026-07-05')).toBe(false);
  });
  it('excludes PAT-AUTO KRs and orphan-vision ids, keeps canonical rows, no mutation', () => {
    const rows = [
      { code: 'KR-2026-07-05', id: 'kr5' },
      { code: 'PAT-AUTO-9', id: 'pa9' },
      { id: 'orphan-1' },
      { id: 'real-vision' },
    ];
    const out = denoiseSubstrate(rows, { orphanVisionIds: ['orphan-1'] });
    expect(out.map((r) => r.id)).toEqual(['kr5', 'real-vision']);
    expect(rows).toHaveLength(4); // input not mutated
  });
});

describe('ord-11 VDR probe repoint + no double-count (FR-3 / US-003)', () => {
  const ord11 = VDR_REGISTRY.find((c) => c.capability === 'A queryable, structured north star');
  const ord2 = VDR_REGISTRY.find((c) => c.capability === 'See distance-to-quit');
  it('ord-11 no longer references KR-2026-07-05; probes the north_star record', () => {
    expect(JSON.stringify(ord11.probe)).not.toContain('KR-2026-07-05');
    expect(ord11.probe.type).toBe('row_predicate');
    expect(ord11.probe.table).toBe('north_star');
    expect(ord11.probe.filter).toEqual({ status: 'chairman_ratified' });
  });
  it('ord-2 still references KR-2026-07-05 (it legitimately belongs there)', () => {
    expect(ord2.probe).toEqual({ type: 'kr_status', code: 'KR-2026-07-05' });
  });
  it('no two capabilities share KR-2026-07-05 (double-count removed)', () => {
    const sharers = VDR_REGISTRY.filter((c) => c.probe?.code === 'KR-2026-07-05');
    expect(sharers).toHaveLength(1);
  });
  it('the VDR coherence invariant still holds', () => {
    expect(() => assertRegistryCoherence()).not.toThrow();
  });
});

describe('buildRecord — refuses to fabricate (CONST-002)', () => {
  it('builds the canonical record from a ratified ratification', () => {
    const rec = buildRecord({
      metric: 'EHG monthly net profit', target: { amount: 18000, unit: '$/mo', qualifier: 'net' },
      sustain: '6 consecutive qualifying months', leading_sub_target: '10+ validated businesses',
      status: 'chairman_ratified', decided_at: '2026-06-16', decided_via: 'AskUserQuestion',
    });
    expect(rec.status).toBe('chairman_ratified');
    expect(rec.target.amount).toBe(18000);
  });
  it('throws when the ratification is not chairman_ratified (no self-bless)', () => {
    expect(() => buildRecord({ status: 'proposed' })).toThrow();
    expect(() => buildRecord(null)).toThrow();
  });
});
