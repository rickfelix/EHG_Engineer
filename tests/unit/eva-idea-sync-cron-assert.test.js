/**
 * SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 FR-4 AC-3 — the pure decision logic behind the
 * cron's post-run health assertion (scripts/eva-idea-sync-cron-assert.mjs). Since
 * scripts/eva-idea-sync.js always exits 0, this evaluateSource() function is what the workflow's
 * if: failure() step actually keys off, so its per-source pass/fail logic gets a direct unit test.
 */
import { describe, it, expect } from 'vitest';
import { evaluateSource, fetchState } from '../../scripts/eva-idea-sync-cron-assert.mjs';

// Minimal stand-in for the exact postgrest-js chain fetchState() calls:
// .from().select().in().neq().order() -> { data, error }. Rows are supplied pre-sorted (as the
// real .order('updated_at', {ascending:false}) call would return them) since this stub is
// asserting fetchState()'s OWN reduction/exclusion logic, not postgrest's ordering behavior.
function stubSupabase(rows) {
  const calls = {};
  const chain = {
    from: (table) => { calls.table = table; return chain; },
    select: (cols) => { calls.select = cols; return chain; },
    in: (col, vals) => { calls.in = [col, vals]; return chain; },
    neq: (col, val) => { calls.neq = [col, val]; return chain; },
    order: (col, opts) => { calls.order = [col, opts]; return Promise.resolve({ data: rows, error: null }); },
  };
  return { client: chain, calls };
}

describe('evaluateSource (FR-4 AC-3)', () => {
  it('healthy: watermark advanced and circuit closed', () => {
    const r = evaluateSource('todoist', '2026-08-25T00:00:00Z', {
      last_sync_at: '2026-08-26T05:00:00Z',
      consecutive_failures: 0,
    });
    expect(r.healthy).toBe(true);
  });

  it('unhealthy: circuit open (>= 3 consecutive failures), even if watermark technically unchanged', () => {
    const r = evaluateSource('youtube', '2026-08-20T00:00:00Z', {
      last_sync_at: '2026-08-20T00:00:00Z',
      consecutive_failures: 3,
    });
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/circuit open/);
  });

  it('unhealthy: watermark did not advance even though the circuit is not yet open', () => {
    const r = evaluateSource('youtube', '2026-08-20T00:00:00Z', {
      last_sync_at: '2026-08-20T00:00:00Z',
      consecutive_failures: 1,
    });
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/watermark did not advance/);
  });

  it('unhealthy: no post-run row at all (source never wrote state)', () => {
    const r = evaluateSource('youtube', null, undefined);
    expect(r.healthy).toBe(false);
    expect(r.reason).toMatch(/no eva_sync_state row/);
  });

  it('healthy: a source that had no prior watermark (null) and now has one advanced correctly', () => {
    const r = evaluateSource('youtube', null, {
      last_sync_at: '2026-08-26T05:00:00Z',
      consecutive_failures: 0,
    });
    expect(r.healthy).toBe(true);
  });

  it('per-source independence (TS-1): one healthy + one unhealthy are reported distinctly, not folded into a single verdict', () => {
    const healthy = evaluateSource('todoist', '2026-08-25T00:00:00Z', {
      last_sync_at: '2026-08-26T05:00:00Z',
      consecutive_failures: 0,
    });
    const unhealthy = evaluateSource('youtube', '2026-08-20T00:00:00Z', {
      last_sync_at: '2026-08-20T00:00:00Z',
      consecutive_failures: 3,
    });
    expect(healthy.healthy).toBe(true);
    expect(unhealthy.healthy).toBe(false);
  });
});

describe('fetchState (HIGH-2 fix, TESTING sub-agent EXEC review)', () => {
  it('excludes the youtube_oauth credential row entirely (a different kind of row, never touched by a sync run)', async () => {
    const { client, calls } = stubSupabase([
      { source_type: 'youtube', source_identifier: 'For Processing', last_sync_at: '2026-08-26T05:00:00Z', consecutive_failures: 0, updated_at: '2026-08-26T05:00:00Z' },
    ]);
    const state = await fetchState(client);
    expect(calls.neq[1]).toBe('youtube_oauth');
    expect(state.youtube.source_identifier).toBe('For Processing');
  });

  it('picks the most-recently-updated row per source_type when multiple rows share a source_type (legacy Todoist projects)', async () => {
    const { client } = stubSupabase([
      // Already sorted by updated_at DESC, as the real .order() call would return.
      { source_type: 'todoist', source_identifier: 'For Processing', last_sync_at: '2026-08-26T05:00:00Z', consecutive_failures: 0, updated_at: '2026-08-26T05:00:00Z' },
      { source_type: 'todoist', source_identifier: 'EVA', last_sync_at: '2026-06-12T21:12:14Z', consecutive_failures: 0, updated_at: '2026-06-12T21:12:14Z' },
      { source_type: 'todoist', source_identifier: 'EVA Next Steps', last_sync_at: '2026-03-08T23:05:10Z', consecutive_failures: 0, updated_at: '2026-03-08T23:05:10Z' },
    ]);
    const state = await fetchState(client);
    expect(state.todoist.source_identifier).toBe('For Processing');
  });

  it('orders by updated_at descending so the currently-active identifier wins regardless of PostgREST heap order', async () => {
    const { client, calls } = stubSupabase([]);
    await fetchState(client);
    expect(calls.order[0]).toBe('updated_at');
    expect(calls.order[1]).toEqual({ ascending: false });
  });

  it('throws a descriptive error if the underlying query errors', async () => {
    const client = {
      from: () => client,
      select: () => client,
      in: () => client,
      neq: () => client,
      order: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }),
    };
    await expect(fetchState(client)).rejects.toThrow(/connection reset/);
  });
});
