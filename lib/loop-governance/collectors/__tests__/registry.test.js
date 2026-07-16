/**
 * Collector registry tests.
 * (SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001, TS-4, TS-6, FR-1/FR-4 regression;
 *  SD-LEO-INFRA-L30-CLOSURE-EDGE-001, measured-decline gate)
 */
import { describe, it, expect, vi } from 'vitest';
import { createCollectEvidence, COLLECTORS } from '../index.js';
import { evaluateLoopBatch } from '../../verifier.js';
import { GENESIS_LOOPS, toLoopRow } from '../../genesis-loops.js';

/** Routes by table name: retention_archive vs the session_coordination eligible-backlog count query. */
function stubSupabase({ archivedAt, count = 100, archiveError = null, countError = null } = {}) {
  const archiveBuilder = {
    select: () => archiveBuilder,
    eq: () => archiveBuilder,
    order: () => archiveBuilder,
    limit: () => Promise.resolve({ data: archivedAt ? [{ archived_at: archivedAt }] : [], error: archiveError }),
  };
  const countBuilder = {
    select: () => countBuilder,
    lt: () => countBuilder,
    or: () => Promise.resolve({ count, error: countError }),
  };
  return { from: (table) => (table === 'retention_archive' ? archiveBuilder : countBuilder) };
}

describe('createCollectEvidence (TS-6)', () => {
  it('returns {} for an unregistered loop_key without touching Supabase', async () => {
    const from = vi.fn();
    const supabase = { from };
    const collectEvidence = createCollectEvidence(supabase);
    const evidence = await collectEvidence({ loop_key: 'L4' });
    expect(evidence).toEqual({});
    expect(from).not.toHaveBeenCalled();
  });

  it('delegates to the registered L30 collector, passing supabase through (liveness only, high backlog)', async () => {
    const archivedAt = '2026-07-16T11:25:57.681Z';
    const supabase = stubSupabase({ archivedAt, count: 100 });
    const collectEvidence = createCollectEvidence(supabase);
    const evidence = await collectEvidence({ loop_key: 'L30' });
    expect(evidence).toEqual({ upstreamFiredAt: archivedAt, edgeAt: null });
  });

  it('a thrown collector error propagates (not swallowed by the registry)', async () => {
    const supabase = stubSupabase({ archivedAt: '2026-07-16T11:25:57.681Z', archiveError: { message: 'boom' } });
    const collectEvidence = createCollectEvidence(supabase);
    await expect(collectEvidence({ loop_key: 'L30' })).rejects.toThrow(/boom/);
  });
});

describe('Full 33-loop genesis batch (TS-4, FR-4 regression: un-collectored loops stay STARVED)', () => {
  it('L30 evaluates open (liveness only, no measured decline); every other genesis loop stays starved', async () => {
    const supabase = stubSupabase({ archivedAt: '2026-07-16T11:25:57.681Z', count: 100 });
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

  it('CAN-CLOSE proof: L30 evaluates closed under a measured decline; every other genesis loop stays starved (SD-LEO-INFRA-L30-CLOSURE-EDGE-001)', async () => {
    const supabase = stubSupabase({ archivedAt: '2026-07-16T11:25:57.681Z', count: 0 });
    const collectEvidence = createCollectEvidence(supabase);

    const loops = GENESIS_LOOPS.map(toLoopRow);
    const verdicts = await evaluateLoopBatch(loops, collectEvidence, new Date('2026-07-16T12:00:00.000Z'));
    const byKey = Object.fromEntries(verdicts.map((v) => [v.loop_key, v.status]));

    expect(byKey.L30).toBe('closed');
    for (const v of verdicts) {
      if (v.loop_key !== 'L30') expect(v.status).toBe('starved');
    }
  });

  it('full lifecycle demonstration: STARVED -> OPEN -> CLOSED for L30 on the same loop row', async () => {
    const loops = GENESIS_LOOPS.map(toLoopRow);
    const now = new Date('2026-07-16T12:00:00.000Z');

    const starved = await evaluateLoopBatch(loops, createCollectEvidence(stubSupabase({ archivedAt: null })), now);
    expect(starved.find((v) => v.loop_key === 'L30').status).toBe('starved');

    const open = await evaluateLoopBatch(loops, createCollectEvidence(stubSupabase({ archivedAt: '2026-07-16T11:00:00.000Z', count: 100 })), now);
    expect(open.find((v) => v.loop_key === 'L30').status).toBe('open');

    const closed = await evaluateLoopBatch(loops, createCollectEvidence(stubSupabase({ archivedAt: '2026-07-16T11:00:00.000Z', count: 0 })), now);
    expect(closed.find((v) => v.loop_key === 'L30').status).toBe('closed');
  });
});

describe('COLLECTORS map', () => {
  it('registers exactly L30 today', () => {
    expect(Object.keys(COLLECTORS)).toEqual(['L30']);
  });
});
