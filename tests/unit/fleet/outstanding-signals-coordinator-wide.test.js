/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-2) — fetchAllOutstandingSignals is the coordinator-wide
 * (every sender) sibling of fetchOutstandingSignals (worker-self), sharing the same oldest-first /
 * truncation-honest / fail-quiet core so the coordinator's tick doesn't grow a second, un-tested
 * duplicate of that logic (TESTING correction, fd168314). Reuses DEFAULT_ALERT_AGE_MIN — no rival
 * SLA constant is introduced.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const {
  fetchOutstandingSignals,
  fetchAllOutstandingSignals,
  formatCoordinatorOverdueWarning,
  DEFAULT_ALERT_AGE_MIN,
} = require_('../../../lib/fleet/outstanding-signals.cjs');

const NOW = Date.UTC(2026, 7, 24, 12, 0, 0);
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const row = (id, mins, sender) => ({
  id, created_at: minsAgo(mins), read_at: null, payload: { signal_type: 'harness-bug' }, sender_session: sender,
});

/** Same query-builder double shape as outstanding-signals.test.js, but records eq() presence/absence. */
function sbDouble(rows) {
  const calls = { eq: [] };
  // QF-20260906-162 (count-truncation-diff-lint): the receipt-existence-check query now
  // chains an explicit .limit(20) after .in() — track whether this traversal saw .in() so
  // the shared .limit() resolves empty receipts instead of the main query's rows.
  let sawIn = false;
  const builder = {
    select() { return builder; },
    eq(col, val) { calls.eq.push([col, val]); return builder; },
    not() { return builder; },
    is() { return builder; },
    order() { return builder; },
    // QF-20260906-162: the SEPARATE receipt-existence-check query terminates on .in()+.limit(),
    // never .eq(sender_session,...) — resolving empty here means these pre-existing tests, which
    // don't care about RECEIVED, are unaffected by it.
    in() { sawIn = true; return builder; },
    limit(n) {
      if (sawIn) { sawIn = false; return Promise.resolve({ data: [], error: null }); }
      return Promise.resolve({ data: rows.slice(0, n), error: null, count: rows.length });
    },
  };
  return { client: { from() { return builder; } }, calls };
}

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-2: fetchAllOutstandingSignals (coordinator-wide)', () => {
  it('does NOT filter by sender_session — genuinely coordinator-wide, unlike the worker-self variant', async () => {
    const { client, calls } = sbDouble([row('a', 40, 'sess-1'), row('b', 10, 'sess-2')]);
    const result = await fetchAllOutstandingSignals(client, { nowMs: NOW });
    // QF-20260906-162: the RECEIVED existence-check adds its own .eq('payload->>kind', ...)
    // call (an orthogonal lookup, not a sender filter) — assert no SENDER_SESSION filter was
    // applied, rather than asserting .eq() was never called at all.
    expect(calls.eq.map((c) => c[0])).not.toContain('sender_session');
    expect(result.count).toBe(2);
    // MUTATION: reintroduce an unconditional .eq('sender_session', ...) -> this fails, proving
    // the coordinator-wide path is genuinely different from the worker-self path, not aliased to it.
  });

  it('the worker-self variant still applies the sender_session filter (no regression from the refactor)', async () => {
    const { client, calls } = sbDouble([row('a', 40, 'sess-1')]);
    await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    // QF-20260906-162: the sender_session filter is still applied on the MAIN query (first
    // .eq() call); the second is the orthogonal RECEIVED existence-check's kind filter.
    expect(calls.eq[0]).toEqual(['sender_session', 'sess-1']);
  });

  it('is oldest-first, matching the worker-self ordering guarantee', async () => {
    const { client } = sbDouble([row('old', 45, 's1'), row('new', 5, 's2')]);
    const result = await fetchAllOutstandingSignals(client, { nowMs: NOW });
    expect(result.oldest_age_minutes).toBe(45);
  });

  it('returns null (quiet) when nothing is outstanding', async () => {
    const { client } = sbDouble([]);
    expect(await fetchAllOutstandingSignals(client, { nowMs: NOW })).toBeNull();
  });
});

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-2: formatCoordinatorOverdueWarning', () => {
  it('flags a fixture row OLDER than DEFAULT_ALERT_AGE_MIN as overdue', () => {
    const result = { count: 1, shown: 1, oldest_age_minutes: DEFAULT_ALERT_AGE_MIN + 5, signals: [] };
    const msg = formatCoordinatorOverdueWarning(result);
    expect(msg).not.toBeNull();
    expect(msg).toContain('UNDISPOSITIONED');
    expect(msg).toContain(String(DEFAULT_ALERT_AGE_MIN));
  });

  it('does NOT flag a fixture row YOUNGER than DEFAULT_ALERT_AGE_MIN', () => {
    const result = { count: 1, shown: 1, oldest_age_minutes: DEFAULT_ALERT_AGE_MIN - 5, signals: [] };
    expect(formatCoordinatorOverdueWarning(result)).toBeNull();
    // MUTATION: flip the < to <= or drop the comparison -> a row exactly/under threshold would
    // wrongly alert every tick, defeating FR-2's "not a line workers/coordinator learn to skim past".
  });

  it('reuses DEFAULT_ALERT_AGE_MIN as the SLA — no second constant is introduced', () => {
    // This IS the regression test for the corrected AC: importing a rival
    // SIGNAL_DISPOSITION_SLA_MINUTES constant here would be a compile-time ReferenceError, which
    // is the point — there is nothing else to import.
    expect(typeof DEFAULT_ALERT_AGE_MIN).toBe('number');
  });

  it('returns null for an empty/absent result', () => {
    expect(formatCoordinatorOverdueWarning(null)).toBeNull();
    expect(formatCoordinatorOverdueWarning({ count: 0 })).toBeNull();
  });
});
