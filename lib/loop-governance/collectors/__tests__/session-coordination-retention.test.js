/**
 * L30 (D5 retention) collector tests.
 * (SD-LEO-INFRA-LOOP-EVIDENCE-COLLECTORS-001, TS-1..TS-3, TS-5 / GT-1 golden regression;
 *  SD-LEO-INFRA-L30-CLOSURE-EDGE-001, measured-decline gate)
 */
import { describe, it, expect, vi } from 'vitest';
import { collectSessionCoordinationRetentionEvidence } from '../session-coordination-retention.js';
import { evaluateLoopClosure, PREDICATE_TYPES } from '../../closure-engine.js';

/**
 * Chainable stub routing by table name: 'retention_archive' gets the
 * .select().eq().eq().order().limit() chain, 'session_coordination' gets the
 * .select(..., {count}).lt().or() chain the measured-decline (eligible-backlog) check uses.
 * Optional spies capture the exact args passed to .lt()/.or() so tests can pin the
 * predicate to the real cleanup_expired_coordination delete filter (not the raw
 * expires_at < now() count — see the collector's own header comment for why that
 * distinction matters).
 */
function stubSupabase({ archiveData = null, archiveError = null, count = null, countError = null, ltSpy, orSpy } = {}) {
  const archiveBuilder = {
    select: () => archiveBuilder,
    eq: () => archiveBuilder,
    order: () => archiveBuilder,
    limit: () => Promise.resolve({ data: archiveData, error: archiveError }),
  };
  const countBuilder = {
    select: () => countBuilder,
    lt: (...args) => { ltSpy?.(...args); return countBuilder; },
    or: (...args) => { orSpy?.(...args); return Promise.resolve({ count, error: countError }); },
  };
  return {
    from: (table) => (table === 'retention_archive' ? archiveBuilder : countBuilder),
  };
}

describe('collectSessionCoordinationRetentionEvidence (TS-1..TS-3)', () => {
  it('returns a fresh edgeAt when the reaper fired and the backlog is at/under threshold (measured decline)', async () => {
    const archivedAt = '2026-07-16T11:25:57.681Z';
    const supabase = stubSupabase({ archiveData: [{ archived_at: archivedAt }], count: 5 });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);
    expect(evidence.upstreamFiredAt).toBe(archivedAt);
    expect(evidence.edgeAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(evidence.edgeAt))).toBe(false);
  });

  it('returns edgeAt: null when the reaper fired but the backlog is still above threshold (liveness only)', async () => {
    const archivedAt = '2026-07-16T11:25:57.681Z';
    const supabase = stubSupabase({ archiveData: [{ archived_at: archivedAt }], count: 6 });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);
    expect(evidence).toEqual({ upstreamFiredAt: archivedAt, edgeAt: null });
  });

  it('returns {} (empty evidence) when no matching retention_archive rows exist', async () => {
    const supabase = stubSupabase({ archiveData: [] });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);
    expect(evidence).toEqual({});
  });

  it('throws when the retention_archive query errors (never swallows into a fabricated verdict)', async () => {
    const supabase = stubSupabase({ archiveData: null, archiveError: { message: 'relation "retention_archive" does not exist' } });
    await expect(collectSessionCoordinationRetentionEvidence(supabase)).rejects.toThrow(/retention_archive query failed/);
  });

  it('throws when the eligible-backlog count query errors (never swallows into a fabricated verdict)', async () => {
    const archivedAt = '2026-07-16T11:25:57.681Z';
    const supabase = stubSupabase({ archiveData: [{ archived_at: archivedAt }], countError: { message: 'statement timeout' } });
    await expect(collectSessionCoordinationRetentionEvidence(supabase)).rejects.toThrow(/eligible-backlog count query failed/);
  });

  it('pins the eligible-backlog predicate to cleanup_expired_coordination\'s own delete filter (not the raw expires_at < now() count)', async () => {
    // Guards against a future refactor silently reverting to the raw expired count,
    // which real production data showed sits at ~820 rows of normal not-yet-actionable
    // traffic (see the collector's header comment) and would make ELIGIBLE_BACKLOG_
    // THRESHOLD effectively unreachable.
    const ltSpy = vi.fn();
    const orSpy = vi.fn();
    const supabase = stubSupabase({ archiveData: [{ archived_at: '2026-07-16T11:25:57.681Z' }], count: 0, ltSpy, orSpy });
    await collectSessionCoordinationRetentionEvidence(supabase);

    expect(ltSpy).toHaveBeenCalledTimes(1);
    expect(ltSpy.mock.calls[0][0]).toBe('expires_at');
    expect(Number.isNaN(Date.parse(ltSpy.mock.calls[0][1]))).toBe(false);

    expect(orSpy).toHaveBeenCalledTimes(1);
    const orFilter = orSpy.mock.calls[0][0];
    expect(orFilter).toMatch(/^acknowledged_at\.not\.is\.null,and\(read_at\.not\.is\.null,read_at\.lte\..+\)$/);
  });

  it('adversarial-review fix: a reaper that fired once, long ago (400 days), never produces edgeAt even if the current backlog happens to be zero', async () => {
    // Closes the false-CLOSE gap: "the reaper fired" with no recency bound would let a
    // permanently-dead reaper mechanism produce an indefinite CLOSED verdict any time the
    // (unrelated) backlog coincidentally sits low. upstreamFiredAt stays populated (the
    // mechanism DID work at some point -- STARVED-vs-OPEN is unaffected), but edgeAt must
    // stay null: too long ago to trust as proof retention is caught up right now.
    const archivedAt = new Date(Date.now() - 400 * 86400 * 1000).toISOString();
    const orSpy = vi.fn();
    const supabase = stubSupabase({ archiveData: [{ archived_at: archivedAt }], count: 0, orSpy });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);

    expect(evidence).toEqual({ upstreamFiredAt: archivedAt, edgeAt: null });
    expect(orSpy).not.toHaveBeenCalled(); // stale upstream short-circuits before the count query
  });

  it('boundary: retention_archive round exactly 30 days old still counts as recent enough', async () => {
    const archivedAt = new Date(Date.now() - 30 * 86400 * 1000 + 1000).toISOString(); // 1s inside the window
    const supabase = stubSupabase({ archiveData: [{ archived_at: archivedAt }], count: 0 });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);
    expect(evidence.edgeAt).not.toBeNull();
  });

  it('boundary: retention_archive round just past 30 days old is too stale for edgeAt', async () => {
    const archivedAt = new Date(Date.now() - 30 * 86400 * 1000 - 1000).toISOString(); // 1s outside the window
    const orSpy = vi.fn();
    const supabase = stubSupabase({ archiveData: [{ archived_at: archivedAt }], count: 0, orSpy });
    const evidence = await collectSessionCoordinationRetentionEvidence(supabase);
    expect(evidence).toEqual({ upstreamFiredAt: archivedAt, edgeAt: null });
    expect(orSpy).not.toHaveBeenCalled();
  });
});

describe('GT-1 golden regression: liveness alone never closes L30, measured decline does (TS-5)', () => {
  // Real L30 closure_predicate shape (lib/loop-governance/genesis-loops.js DEFAULT_PREDICATE).
  const loop = { loop_key: 'L30', predicate_type: PREDICATE_TYPES.EDGE_FRESHNESS, closure_predicate: { window_seconds: 30 * 86400 } };
  // MUST be the real clock, not a pinned date: the collector's 30-day edge window uses
  // Date.now() internally, while `now` here feeds evaluateLoopClosure. A pinned now
  // (previously 2026-07-16T12:00Z) made ago(29) drift out of the collector's REAL window
  // exactly one day after pinning — a repo-wide CI time bomb that detonated 2026-07-17T12:00Z.
  // With both legs on the same clock the ago(0/1/29) fixtures sit safely inside both windows.
  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * 86400 * 1000).toISOString();

  it.each([
    ['just now', ago(0)],
    ['1 day ago', ago(1)],
    ['29 days ago', ago(29)],
  ])('status is open (never closed) when the reaper last fired %s but the backlog is still high', async (_label, upstreamFiredAt) => {
    const evidence = await collectSessionCoordinationRetentionEvidence(
      stubSupabase({ archiveData: [{ archived_at: upstreamFiredAt }], count: 100 })
    );
    const verdict = evaluateLoopClosure(loop, evidence, now);
    expect(verdict.status).toBe('open');
    expect(verdict.status).not.toBe('closed');
  });

  it.each([
    ['just now', ago(0)],
    ['1 day ago', ago(1)],
    ['29 days ago', ago(29)],
  ])('status is closed when the reaper last fired %s AND the backlog shows a measured decline', async (_label, upstreamFiredAt) => {
    const evidence = await collectSessionCoordinationRetentionEvidence(
      stubSupabase({ archiveData: [{ archived_at: upstreamFiredAt }], count: 0 })
    );
    const verdict = evaluateLoopClosure(loop, evidence, now);
    expect(verdict.status).toBe('closed');
  });

  it('boundary: backlog exactly at threshold (5) counts as measured decline', async () => {
    const evidence = await collectSessionCoordinationRetentionEvidence(
      stubSupabase({ archiveData: [{ archived_at: ago(0) }], count: 5 })
    );
    expect(evaluateLoopClosure(loop, evidence, now).status).toBe('closed');
  });

  it('boundary: backlog one over threshold (6) does NOT count as measured decline', async () => {
    const evidence = await collectSessionCoordinationRetentionEvidence(
      stubSupabase({ archiveData: [{ archived_at: ago(0) }], count: 6 })
    );
    expect(evaluateLoopClosure(loop, evidence, now).status).toBe('open');
  });

  it('status is starved when the collector finds no evidence at all', async () => {
    const evidence = await collectSessionCoordinationRetentionEvidence(stubSupabase({ archiveData: [] }));
    expect(evaluateLoopClosure(loop, evidence, now).status).toBe('starved');
  });

  it('freshness decay: a stale measured-decline edge (recomputed today at a later tick) still requires today’s own live backlog check', async () => {
    // The edge is always stamped at collection time, so "staleness" for L30 can only be
    // demonstrated by simulating a LATER tick against evidence captured on an EARLIER
    // one — confirming the engine (not the collector) owns freshness decay.
    const staleEdge = { upstreamFiredAt: ago(40), edgeAt: ago(40) };
    const laterTick = evaluateLoopClosure(loop, staleEdge, now);
    expect(laterTick.status).toBe('open');
    expect(laterTick.reason).toMatch(/stale/);
  });
});
