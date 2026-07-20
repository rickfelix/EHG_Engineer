/**
 * FR-1 learning-moat gauge — pure unit tests. DB-free.
 */
import { describe, it, expect } from 'vitest';
import { computeLearningMoatGauge } from '../../../lib/eva/learning-moat-gauge.js';

function stubSupabase(rows) {
  const calls = { eqArgs: [] };
  const builder = {
    eq: (...args) => { calls.eqArgs.push(args); return builder; },
    gte: () => builder,
    order: () => builder,
    range: () => builder,
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return {
    calls,
    supabase: { from: () => ({ select: () => builder }) },
  };
}

describe('learning-moat-gauge (FR-1)', () => {
  it('computes lessonsPerTraversal from reflection rows grouped by distinct venture', async () => {
    const rows = [
      { metadata: { venture_id: 'v-1' } },
      { metadata: { venture_id: 'v-1' } },
      { metadata: { venture_id: 'v-2' } },
    ];
    const { supabase } = stubSupabase(rows);
    const gauge = await computeLearningMoatGauge(supabase);
    expect(gauge.lessonsEmitted).toBe(3);
    expect(gauge.distinctVentures).toBe(2);
    expect(gauge.lessonsPerTraversal).toBe(1.5);
  });

  it('returns null lessonsPerTraversal when there are zero rows (no div-by-zero)', async () => {
    const { supabase } = stubSupabase([]);
    const gauge = await computeLearningMoatGauge(supabase);
    expect(gauge.lessonsEmitted).toBe(0);
    expect(gauge.distinctVentures).toBe(0);
    expect(gauge.lessonsPerTraversal).toBeNull();
  });

  it('honestly reports timeFromDefectToShippedFix as null with a documented reason (no fabricated metric)', async () => {
    const { supabase } = stubSupabase([]);
    const gauge = await computeLearningMoatGauge(supabase);
    expect(gauge.timeFromDefectToShippedFix).toBeNull();
    expect(gauge.timeFromDefectToShippedFixReason).toContain('not yet computable');
  });

  it('scopes by ventureId when provided', async () => {
    const { supabase, calls } = stubSupabase([{ metadata: { venture_id: 'v-1' } }]);
    await computeLearningMoatGauge(supabase, { ventureId: 'v-1' });
    expect(calls.eqArgs.some(([col, val]) => col === 'metadata->>venture_id' && val === 'v-1')).toBe(true);
  });

  it('propagates a query error rather than silently returning an empty gauge', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: function () { return this; }, gte: function () { return this; }, order: function () { return this; }, range: function () { return this; }, then: (resolve) => resolve({ data: null, error: { message: 'db down' } }) }) }) };
    await expect(computeLearningMoatGauge(supabase)).rejects.toThrow(/db down/);
  });
});

// SD-LEO-GEN-SATELLITE-LEARNING-SPEED-001 FR-1/FR-2/FR-3: real timeFromDefectToShippedFix
// computation, with the honest-zero fallback above proven unchanged.
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

describe('computeLearningMoatGauge — timeFromDefectToShippedFix (SD-LEO-GEN-SATELLITE-LEARNING-SPEED-001)', () => {
  it('real computation: mean latency across resolved rows', async () => {
    const rows = [
      { metadata: { venture_id: 'v1' }, created_at: hoursAgo(48), resolution_date: hoursAgo(24) }, // 24h latency
      { metadata: { venture_id: 'v2' }, created_at: hoursAgo(96), resolution_date: hoursAgo(48) }, // 48h latency
    ];
    const { supabase } = stubSupabase(rows);
    const gauge = await computeLearningMoatGauge(supabase);
    expect(gauge.timeFromDefectToShippedFix).toBe(36);
    expect(gauge.timeFromDefectToShippedFixReason).toBe('computed from 2 resolved reflection(s)');
  });

  it('mixed resolved/unresolved: only resolved rows contribute to the latency mean', async () => {
    const rows = [
      { metadata: { venture_id: 'v1' }, created_at: hoursAgo(24), resolution_date: hoursAgo(12) }, // 12h latency
      { metadata: { venture_id: 'v2' }, created_at: hoursAgo(10), resolution_date: null },
      { metadata: { venture_id: 'v3' }, created_at: hoursAgo(5), resolution_date: null },
    ];
    const { supabase } = stubSupabase(rows);
    const gauge = await computeLearningMoatGauge(supabase);
    expect(gauge.timeFromDefectToShippedFix).toBe(12);
    expect(gauge.timeFromDefectToShippedFixReason).toBe('computed from 1 resolved reflection(s)');
    expect(gauge.lessonsEmitted).toBe(3); // unresolved rows still count, unchanged
  });

  it('self-review finding: a corrupted row (resolution_date before created_at) is excluded from the latency mean, not silently included as a negative number', async () => {
    const rows = [
      { metadata: { venture_id: 'v1' }, created_at: hoursAgo(24), resolution_date: hoursAgo(12) }, // valid, 12h latency
      { metadata: { venture_id: 'v2' }, created_at: hoursAgo(10), resolution_date: hoursAgo(20) }, // corrupted: resolved "before" created
    ];
    const { supabase } = stubSupabase(rows);
    const gauge = await computeLearningMoatGauge(supabase);
    expect(gauge.timeFromDefectToShippedFix).toBe(12);
    expect(gauge.timeFromDefectToShippedFixReason).toBe('computed from 1 resolved reflection(s)');
  });

  it('regression: lessonsEmitted/distinctVentures/lessonsPerTraversal unaffected by the new logic', async () => {
    const rows = [
      { metadata: { venture_id: 'v1' }, created_at: hoursAgo(24), resolution_date: hoursAgo(12) },
      { metadata: { venture_id: 'v1' }, created_at: hoursAgo(20), resolution_date: null },
      { metadata: { venture_id: 'v2' }, created_at: hoursAgo(10), resolution_date: null },
    ];
    const { supabase } = stubSupabase(rows);
    const gauge = await computeLearningMoatGauge(supabase);
    expect(gauge.lessonsEmitted).toBe(3);
    expect(gauge.distinctVentures).toBe(2);
    expect(gauge.lessonsPerTraversal).toBe(1.5);
  });
});
