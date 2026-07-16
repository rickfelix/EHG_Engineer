/**
 * L30 (D5 retention) collector tests.
 * (SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001, TS-1..TS-3, TS-5 / GT-1 golden regression)
 */
import { describe, it, expect } from 'vitest';
import { collectSessionCoordinationRetentionEvidence } from '../session-coordination-retention.js';
import { evaluateLoopClosure, PREDICATE_TYPES } from '../../closure-engine.js';

/** Chainable stub matching the .from().select().eq().eq().order().limit() shape used by the collector. */
function stubSupabase({ data = null, error = null } = {}) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data, error }),
  };
  return { from: () => builder };
}

describe('collectSessionCoordinationRetentionEvidence (TS-1..TS-3)', () => {
  it('returns { upstreamFiredAt, edgeAt: null } given a fresh retention_archive row', async () => {
    const archivedAt = '2026-07-16T11:25:57.681Z';
    const supabase = stubSupabase({ data: [{ archived_at: archivedAt }] });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);
    expect(evidence).toEqual({ upstreamFiredAt: archivedAt, edgeAt: null });
  });

  it('returns {} (empty evidence) when no matching rows exist', async () => {
    const supabase = stubSupabase({ data: [] });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);
    expect(evidence).toEqual({});
  });

  it('throws when the Supabase query errors (never swallows into a fabricated verdict)', async () => {
    const supabase = stubSupabase({ data: null, error: { message: 'relation "retention_archive" does not exist' } });
    await expect(collectSessionCoordinationRetentionEvidence(supabase)).rejects.toThrow(/retention_archive query failed/);
  });
});

describe('GT-1 golden regression: L30 can never evaluate CLOSED (TS-5)', () => {
  // Real L30 closure_predicate shape (lib/loop-governance/genesis-loops.js DEFAULT_PREDICATE).
  const loop = { loop_key: 'L30', predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 30 * 86400 } };
  const now = new Date('2026-07-16T12:00:00.000Z');
  const ago = (days) => new Date(now.getTime() - days * 86400 * 1000).toISOString();

  it.each([
    ['just now', ago(0)],
    ['1 day ago', ago(1)],
    ['29 days ago', ago(29)],
  ])('status is open (never closed) when the reaper last fired %s', async (_label, upstreamFiredAt) => {
    const evidence = await collectSessionCoordinationRetentionEvidence(stubSupabase({ data: [{ archived_at: upstreamFiredAt }] }));
    const verdict = evaluateLoopClosure(loop, evidence, now);
    expect(verdict.status).toBe('open');
    expect(verdict.status).not.toBe('closed');
  });

  it('status is starved when the collector finds no evidence at all', async () => {
    const evidence = await collectSessionCoordinationRetentionEvidence(stubSupabase({ data: [] }));
    expect(evaluateLoopClosure(loop, evidence, now).status).toBe('starved');
  });
});
