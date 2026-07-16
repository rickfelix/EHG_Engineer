/**
 * Collector registry tests.
 * (SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001, TS-4, TS-6, FR-1/FR-4 regression)
 */
import { describe, it, expect, vi } from 'vitest';
import { createCollectEvidence, COLLECTORS } from '../index.js';
import { evaluateLoopBatch } from '../../verifier.js';
import { GENESIS_LOOPS, toLoopRow } from '../../genesis-loops.js';

describe('createCollectEvidence (TS-6)', () => {
  it('returns {} for an unregistered loop_key without touching Supabase', async () => {
    const from = vi.fn();
    const supabase = { from };
    const collectEvidence = createCollectEvidence(supabase);
    const evidence = await collectEvidence({ loop_key: 'L4' });
    expect(evidence).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });

  it('delegates to the registered L30 collector, passing supabase through', async () => {
    const archivedAt = '2026-07-16T11:25:57.681Z';
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => Promise.resolve({ data: [{ archived_at: archivedAt }], error: null }),
    };
    const supabase = { from: () => builder };
    const collectEvidence = createCollectEvidence(supabase);
    const evidence = await collectEvidence({ loop_key: 'L30' });
    expect(evidence).toEqual({ upstreamFiredAt: archivedAt, edgeAt: null });
  });

  it('a thrown collector error propagates (not swallowed by the registry)', async () => {
    const supabase = {
      from: () => ({
        select: function () { return this; },
        eq: function () { return this; },
        order: function () { return this; },
        limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      }),
    };
    const collectEvidence = createCollectEvidence(supabase);
    await expect(collectEvidence({ loop_key: 'L30' })).rejects.toThrow(/boom/);
  });
});

describe('Full 33-loop genesis batch (TS-4, FR-4 regression: un-collectored loops stay STARVED)', () => {
  it('L30 evaluates open; every other genesis loop stays starved', async () => {
    const archivedAt = '2026-07-16T11:25:57.681Z';
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => Promise.resolve({ data: [{ archived_at: archivedAt }], error: null }),
    };
    const supabase = { from: () => builder };
    const collectEvidence = createCollectEvidence(supabase);

    const loops = GENESIS_LOOPS.map(toLoopRow);
    expect(loops.length).toBe(33);

    const verdicts = await evaluateLoopBatch(loops, collectEvidence, new Date('2026-07-16T12:00:00.000Z'));
    const byKey = Object.fromEntries(verdicts.map((v) => [v.loop_key, v.status]));

    expect(byKey.L30).toBe('open');
    for (const v of verdicts) {
      if (v.loop_key !== 'L30') expect(v.status).toBe('starved');
    }
  });
});

describe('COLLECTORS map', () => {
  it('registers exactly L30 today', () => {
    expect(Object.keys(COLLECTORS)).toEqual(['L30']);
  });
});
