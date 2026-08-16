/**
 * QF-20260816-023 — the server clamps a single session_coordination/retention_archive response to
 * 1000 rows regardless of a larger .limit()/.range() request (measured live 2026-08-16 16:33Z: both
 * fetches returned exactly 1000 rows). The pre-fix code issued ONE request per source, so a window
 * with more than 1000 matching rows silently lost everything past the clamp — and because the
 * archive fetch had NO order() at all, the surviving 1000 were an ARBITRARY subset of the lookback
 * window, so an answered signal's archived reply could be randomly present or absent from one tick
 * to the next (witnessed: signals 51724a9c/32c80076 flickered 0->2->6 starved with no new
 * starvation). assertNonBinding compared fetched>=MAX_SIGNALS(5000), which the 1000-row clamp could
 * never reach, so the truncation note never fired despite real, silent data loss every tick.
 *
 * Under test: fetchPaginated() actually walks past a PAGE_SIZE-sized clamp via repeated .range()
 * calls, the archive query is now ordered, and assertNonBinding() fires on a PAGE_SIZE-exact total
 * as a defensive second trigger alongside the MAX_SIGNALS-reached case.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const mod = require_('../../../lib/coordinator/worker-signal-starvation.cjs');
const { reportWorkerSignalStarvation, fetchPaginated, assertNonBinding, PAGE_SIZE, MAX_SIGNALS } = mod;

const NOW = Date.parse('2026-08-16T16:33:00.000Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();

const signal = (id, minAgo = 120) => ({
  id, sender_session: 'sess-worker', sender_type: 'worker', message_type: 'INFO',
  acknowledged_at: null, read_at: null,
  payload: { signal_type: 'stuck', body: 'blocked on x' },
  created_at: ago(minAgo),
});

/**
 * A server that clamps every response to PAGE_SIZE regardless of the requested range, exactly like
 * the live PostgREST behavior this QF measured — proves fetchPaginated() makes repeated requests
 * rather than accepting the first clamped page as the whole answer.
 */
function makeClampingDb(totalRows) {
  const orderCalls = { live: 0, archive: 0 };
  return {
    orderCalls,
    from(table) {
      const isArchive = table === 'retention_archive';
      const api = {
        select() { return api; },
        eq() { return api; },
        gte() { return api; },
        order() {
          if (isArchive) orderCalls.archive++; else orderCalls.live++;
          return api;
        },
        range(from, to) {
          const requested = to - from + 1;
          const clamped = Math.min(requested, PAGE_SIZE);
          const remaining = Math.max(0, totalRows - from);
          const n = Math.min(clamped, remaining);
          // Fixed, well-past-threshold age for every row -- the point of this fake is coverage past
          // the clamp, not age variety (a per-index age would run negative at high offsets and
          // silently stop counting as starved, masking the exact defect under test).
          const page = Array.from({ length: n }, (_, i) => signal('s-' + (from + i), 200));
          return Promise.resolve({ data: page, error: null });
        },
      };
      return api;
    },
  };
}

describe('fetchPaginated — walks past a server-side page clamp', () => {
  it('retrieves more than one clamped page when more rows exist than PAGE_SIZE', async () => {
    const totalRows = PAGE_SIZE + 250;
    const build = (from, to) => Promise.resolve({
      data: Array.from({ length: Math.min(to - from + 1, Math.max(0, totalRows - from)) }, (_, i) => ({ id: from + i })),
      error: null,
    });
    const rows = await fetchPaginated(build, MAX_SIGNALS);
    expect(rows.length).toBe(totalRows);
  });

  it('stops at the requested cap even when the source has more rows still', async () => {
    const build = (from, to) => Promise.resolve({
      data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), // bottomless source
      error: null,
    });
    const rows = await fetchPaginated(build, 1500);
    expect(rows.length).toBe(1500);
  });

  it('throws on a query error rather than returning a silent partial result', async () => {
    const build = () => Promise.resolve({ data: null, error: { message: 'boom' } });
    await expect(fetchPaginated(build, MAX_SIGNALS)).rejects.toThrow('boom');
  });
});

describe('reportWorkerSignalStarvation — end-to-end past the clamp (QF-20260816-023)', () => {
  it('finds a starved signal that lived entirely past the first clamped page', async () => {
    const totalRows = PAGE_SIZE + 5; // the starved signal below is generated at offset PAGE_SIZE+4
    const db = makeClampingDb(totalRows);
    const r = await reportWorkerSignalStarvation(db, { now: NOW, log: () => {}, env: {} });
    // Every row this fake generates is a worker signal older than the 30m default threshold, so the
    // WHOLE population past the clamp must be visible, not just the first PAGE_SIZE.
    expect(r.measured).toBe(true);
    expect(r.starved).toBeGreaterThan(PAGE_SIZE);
  });

  it('orders the archive query (row_timestamp desc) — an unordered fetch returns an arbitrary subset on repeat calls', () => {
    const db = makeClampingDb(5);
    return reportWorkerSignalStarvation(db, { now: NOW, log: () => {}, env: {} }).then(() => {
      expect(db.orderCalls.archive).toBeGreaterThan(0);
    });
  });
});

describe('assertNonBinding — fires on a PAGE_SIZE-exact total, not just MAX_SIGNALS', () => {
  it('still fires when the true MAX_SIGNALS cap is reached', () => {
    expect(assertNonBinding(4000, 1000, MAX_SIGNALS)).toMatch(/TRUNCATED/);
  });

  it('now ALSO fires when a single source lands exactly on PAGE_SIZE, well under MAX_SIGNALS', () => {
    // This is the exact pre-fix blind spot: two sources each silently clamped at 1000 summed to
    // 2000, nowhere near the 5000 cap, so the old fetched>=cap check never fired.
    const note = assertNonBinding(PAGE_SIZE, 3, MAX_SIGNALS);
    expect(note).toMatch(/TRUNCATED/);
  });

  it('does not false-positive on an ordinary count that is not a page-size coincidence', () => {
    expect(assertNonBinding(10, 10, MAX_SIGNALS)).toBeNull();
  });
});
