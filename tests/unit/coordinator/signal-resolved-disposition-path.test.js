/**
 * SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-4, TS-6/TS-7) — notifySignalResolvedByDisposition is the
 * NEW SIGNAL_RESOLVED path, keyed off acknowledged_at (FR-1's own retirement stamp) rather than
 * payload.routed_to_sd_key (promotion-only, measured to have never fired in production).
 *
 * POSITIVE CONTROL (TS-6) + NEGATIVE CONTROL (TS-7) drive the REAL function against a fake
 * client, per TESTING's correction that the original AC would have been vacuous with only a
 * negative test (a broken implementation and a correct one both "don't fire" for the wrong
 * reason unless a positive case proves the trigger condition actually works).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { notifySignalResolvedByDisposition } = require_('../../../scripts/stale-session-sweep.cjs');

/**
 * Reads a dotted JSONB-arrow path like "payload->>routed_to_sd_key" off a plain row object.
 * `->>'` ALWAYS extracts as TEXT in real Postgres/PostgREST — a JSONB boolean `true` reads back
 * as the STRING `'true'`, not the JS boolean. Coercing here matters: notification_sent is written
 * as a JS boolean (matching the real production code) but compared against the string literal
 * `'true'` in `.neq('payload->>notification_sent', 'true')` — without this coercion the fake
 * would silently under-filter, and this specific negative control would pass for the wrong reason.
 */
function readPath(row, col) {
  const m = /^payload->>(\w+)$/.exec(col);
  if (m) {
    const v = row.payload ? row.payload[m[1]] : undefined;
    return v === undefined || v === null ? v : String(v);
  }
  return row[col];
}

/**
 * Minimal fake covering exactly the tables this function touches, but — unlike a fake that just
 * returns every seeded row regardless of the query — this one APPLIES the recorded filters at
 * read time. Without this, the negative-control tests below would pass or fail for the wrong
 * reason (a fake that ignores `.not()`/`.is()`/`.neq()` can't distinguish a correct query from a
 * broken one that happens to filter in JS instead).
 */
function fakeClient({ signalRows = [], liveSessions = [] } = {}) {
  const store = new Map(signalRows.map((r) => [r.id, { ...r }]));
  const inserts = [];
  const updates = [];
  return {
    inserts,
    updates,
    getRow: (id) => store.get(id),
    from(table) {
      if (table === 'session_coordination') {
        const filters = [];
        const builder = {
          select() { return builder; },
          // IS NULL / IS NOT NULL semantics: a missing JSONB key reads as SQL NULL (matches
          // PostgREST's ->> extraction), so `== null` (loose) catches both absent and explicit
          // null -- a strict `=== null` would wrongly treat "key absent" as "not null".
          not(col, op, val) {
            filters.push(val === null && op === 'is'
              ? (row) => readPath(row, col) != null
              : (row) => readPath(row, col) !== val);
            return builder;
          },
          is(col, val) {
            filters.push(val === null
              ? (row) => readPath(row, col) == null
              : (row) => readPath(row, col) === val);
            return builder;
          },
          neq(col, val) { filters.push((row) => readPath(row, col) !== val); return builder; },
          order() { return builder; },
          async limit() {
            const rows = [...store.values()].filter((r) => filters.every((f) => f(r)));
            return { data: rows, error: null };
          },
          update(patch) {
            return { eq: async (col, val) => { updates.push({ id: val, patch }); Object.assign(store.get(val), patch); return { error: null }; } };
          },
          async insert(row) { inserts.push(row); return { error: null }; },
        };
        return builder;
      }
      if (table === 'claude_sessions') {
        // resolveLiveSessionForCallsign uses fapPaginate (fetchAllPaginated), which calls
        // queryFactory().range(from, to) directly -- it does not settle at .order().
        return {
          select() { return this; },
          gte() { return this; },
          filter() { return this; },
          order() { return this; },
          async range() { return { data: liveSessions, error: null }; },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const dispositionedSignal = (id, overrides = {}) => ({
  id,
  sender_session: 'sess-old-1',
  payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4' },
  body: 'a lone signal that was individually dispositioned',
  acknowledged_at: '2026-08-24T10:00:00Z',
  ...overrides,
});

const LIVE_GOLF4 = { session_id: 'sess-new-1', metadata: { fleet_identity: { callsign: 'Golf-4' } } };

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-4 TS-6: POSITIVE control — a lone dispositioned signal DOES resolve', () => {
  it('sends a SIGNAL_RESOLVED message to the sender when their signal has acknowledged_at set and is not promoted', async () => {
    const c = fakeClient({ signalRows: [dispositionedSignal('sig-1')], liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.notified).toBe(1);
    expect(c.inserts).toHaveLength(1);
    expect(c.inserts[0].target_session).toBe('sess-new-1');
    expect(c.inserts[0].payload.signal_resolved).toBe(true);
    expect(c.inserts[0].payload.resolution_kind).toBe('disposition');
    expect(c.getRow('sig-1').payload.notification_sent).toBe(true);
    // MUTATION: require payload.routed_to_sd_key here too -> this fixture has none, so the
    // notification would never fire, and this is precisely the gap FR-4 exists to close.
  });

  it('drops (marks notification_sent, no insert) when the callsign has no live session', async () => {
    const c = fakeClient({ signalRows: [dispositionedSignal('sig-1')], liveSessions: [] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.dropped).toBe(1);
    expect(c.inserts).toHaveLength(0);
    expect(c.getRow('sig-1').payload.signal_resolved_dropped).toBe(true);
  });
});

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-4 TS-7: NEGATIVE control — promotion alone must NOT resolve', () => {
  it('does not notify a signal that has ONLY been promoted (routed_to_sd_key set, acknowledged_at still null)', async () => {
    // This is exactly stampRouted()'s already-fixed shape: promotion never touches acknowledged_at.
    const promotedOnly = dispositionedSignal('sig-1', {
      acknowledged_at: null,
      payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4', routed_to_sd_key: 'SD-EXAMPLE-001' },
    });
    const c = fakeClient({ signalRows: [promotedOnly], liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.notified).toBe(0);
    expect(c.inserts).toHaveLength(0);
    // MUTATION: drop the `.not('acknowledged_at', 'is', null)` filter -> this fires incorrectly,
    // reintroducing the class of premature "resolved" notice this SD's Risk section warns against.
  });

  it('does not double-notify a signal already resolved via the promotion path (routed_to_sd_key + acknowledged_at both set)', async () => {
    // A signal that was BOTH promoted AND later individually acked should be excluded here so it
    // is never notified through two different trigger conditions for two different reasons.
    const both = dispositionedSignal('sig-1', {
      payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4', routed_to_sd_key: 'SD-EXAMPLE-001' },
    });
    const c = fakeClient({ signalRows: [both], liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.notified).toBe(0);
  });

  it('does not notify a signal that already has notification_sent=true', async () => {
    const alreadyNotified = dispositionedSignal('sig-1', {
      payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4', notification_sent: true },
    });
    const c = fakeClient({ signalRows: [alreadyNotified], liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.notified).toBe(0);
    expect(c.inserts).toHaveLength(0);
  });
});
