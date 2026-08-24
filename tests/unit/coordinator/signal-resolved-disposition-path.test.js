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
 * `'true'` — without this coercion the fake would silently under-filter.
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
 * Evaluates one PostgREST filter clause (`col.op.val`) against a row, with NULL-PROPAGATION
 * semantics matching real SQL: a comparison against a missing/NULL column is NULL (falsy), never
 * silently "passes as not-equal". This is the exact defect TESTING found live (bfb24a47) — the
 * naive JS `!==` a bare .neq() fake would use treats `undefined !== 'true'` as true, which is
 * backwards from what `payload->>'x' <> 'true'` actually evaluates to (NULL) when the key is
 * absent. Getting this right is the ENTIRE point of these fixtures.
 */
function evalClause(row, col, op, val) {
  const actual = readPath(row, col);
  if (op === 'is') return val === null ? actual == null : actual === val;
  if (op === 'neq') return actual == null ? false : actual !== val; // NULL <> x -> NULL (falsy)
  if (op === 'eq') return actual == null ? false : actual === val; // NULL = x -> NULL (falsy)
  throw new Error(`evalClause: unsupported op ${op}`);
}

/** Parses one `.or('col.op.val,col2.op2.val2')` string into an ANY-of predicate. */
function parseOrString(orString) {
  const clauses = orString.split(',').map((part) => {
    const [col, op, ...rest] = part.split('.');
    return { col, op, val: rest.join('.') === 'null' ? null : rest.join('.') };
  });
  return (row) => clauses.some((c) => evalClause(row, c.col, c.op, c.val));
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
        let orderCol = null;
        let orderAsc = true;
        const builder = {
          select() { return builder; },
          // NOT (IS NULL) = IS NOT NULL. A missing JSONB key reads as SQL NULL, so `!= null`
          // (loose) catches both absent and explicit null.
          not(col, op, val) {
            filters.push(val === null && op === 'is'
              ? (row) => readPath(row, col) != null
              : (row) => !evalClause(row, col, op, val));
            return builder;
          },
          is(col, val) { filters.push((row) => evalClause(row, col, 'is', val)); return builder; },
          neq(col, val) { filters.push((row) => evalClause(row, col, 'neq', val)); return builder; },
          gte(col, val) { filters.push((row) => { const v = readPath(row, col); return v != null && v >= val; }); return builder; },
          // PostgREST .or('col.op.val,col2.op2.val2') -- an ANY-of predicate, itself NULL-safe
          // per clause (see evalClause). This is the exact form the real code uses to fix the
          // .neq()-on-a-possibly-absent-key defect: `payload->>x IS NULL OR payload->>x <> 'true'`.
          or(orString) { filters.push(parseOrString(orString)); return builder; },
          // PRD FR-4 AC4: the real query has an explicit ORDER BY on the SIGNAL_RESOLVED
          // candidate query -- a no-op here would let a starvation regression (arbitrary
          // subset, not oldest-first) pass silently once .limit(50) actually truncates.
          order(col, { ascending = true } = {}) { orderCol = col; orderAsc = ascending; return builder; },
          async limit(n) {
            let rows = [...store.values()].filter((r) => filters.every((f) => f(r)));
            if (orderCol) {
              rows = rows.slice().sort((a, b) => {
                const av = readPath(a, orderCol);
                const bv = readPath(b, orderCol);
                const cmp = av < bv ? -1 : av > bv ? 1 : 0;
                return orderAsc ? cmp : -cmp;
              });
            }
            if (typeof n === 'number') rows = rows.slice(0, n);
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

// SD-LEO-INFRA-SIGNAL-LANE-PER-001 (FR-4): the real function applies a rolling 24h recency
// window (`gte('acknowledged_at', now - 24h)`) -- a hardcoded past ISO string would eventually
// fall outside that window and start failing for reasons unrelated to the code under test.
const RECENT_ACK = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
const OLD_ACK = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48h ago -- outside the window

const dispositionedSignal = (id, overrides = {}) => ({
  id,
  sender_session: 'sess-old-1',
  payload: { signal_type: 'harness-bug', sender_callsign: 'Golf-4' },
  body: 'a lone signal that was individually dispositioned',
  acknowledged_at: RECENT_ACK,
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

  it('does not notify a signal acknowledged OUTSIDE the 24h recency window (flood-guard against the historical backlog)', async () => {
    const old = dispositionedSignal('sig-1', { acknowledged_at: OLD_ACK });
    const c = fakeClient({ signalRows: [old], liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.notified).toBe(0);
    expect(c.inserts).toHaveLength(0);
    // MUTATION: drop the .gte(acknowledged_at, recentCutoff) filter -> this fires, which is
    // exactly TESTING's "230 historically-acked rows notify at once" finding (recycled
    // sender_callsign misdirection risk).
  });

  it("THE PRIMARY REGRESSION TEST for TESTING's blocking finding (bfb24a47): a genuine never-notified row IS found, proving .or() is null-safe where a bare .neq() would silently exclude it", async () => {
    // notification_sent is ABSENT entirely (not false, not present-and-false) -- the exact shape
    // of every real never-notified row. A bare `.neq('payload->>notification_sent','true')`
    // fake modeled as `readPath(row,col) !== val` would (wrongly) let this through too, which is
    // why this test alone would NOT have caught the bug -- it is the .or() parser itself
    // (parseOrString/evalClause) that is under test here, exercised via the real query builder.
    const neverNotified = dispositionedSignal('sig-1');
    expect(neverNotified.payload.notification_sent).toBeUndefined();
    const c = fakeClient({ signalRows: [neverNotified], liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.notified).toBe(1);
  });
});

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-4 AC4: explicit ORDER BY prevents starvation past the .limit(50) cap', () => {
  it('with 60 candidate rows, the 50 OLDEST (by acknowledged_at) are processed, not an arbitrary subset', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => dispositionedSignal(`sig-${i}`, {
      acknowledged_at: new Date(Date.now() - (600 - i) * 1000).toISOString(), // sig-0 oldest ... sig-59 newest
    }));
    // Inserted NEWEST-first (reverse of timestamp order) so the Map's natural insertion order
    // would produce the WRONG (newest-50) result if the fake's .order() were a no-op -- a test
    // built by inserting in timestamp order already would pass even without real sorting.
    const c = fakeClient({ signalRows: rows.slice().reverse(), liveSessions: [LIVE_GOLF4] });
    const result = await notifySignalResolvedByDisposition(c);
    expect(result.notified + result.dropped).toBe(50);
    for (let i = 0; i < 50; i++) expect(c.getRow(`sig-${i}`).payload.notification_sent).toBe(true);
    for (let i = 50; i < 60; i++) expect(c.getRow(`sig-${i}`).payload.notification_sent).toBeUndefined();
    // MUTATION: drop the .order('acknowledged_at', {ascending:true}) call (or the fake's ordering
    // support) -> an arbitrary 50-row subset gets processed instead of the oldest, and this
    // assertion starts failing nondeterministically -- the starvation risk PRD FR-4 AC4 names.
  });
});

describe('SD-LEO-INFRA-SIGNAL-LANE-PER-001 FR-4: evalClause/.or() NULL-propagation unit coverage', () => {
  it('NULL <> x evaluates to false (not true) -- the exact bug this SD found live', () => {
    expect(evalClause({ payload: {} }, 'payload->>notification_sent', 'neq', 'true')).toBe(false);
    // A naive `!==`-based fake would return true here. This is the single assertion that,
    // inverted, reproduces the production defect TESTING measured (0 candidates where 16 exist).
  });

  it('NULL IS NULL evaluates to true', () => {
    expect(evalClause({ payload: {} }, 'payload->>routed_to_sd_key', 'is', null)).toBe(true);
  });

  it('parseOrString: an absent key matches the is-null clause, so the OR is satisfied', () => {
    const predicate = parseOrString('payload->>notification_sent.is.null,payload->>notification_sent.neq.true');
    expect(predicate({ payload: {} })).toBe(true);
  });

  it('parseOrString: notification_sent=true (present) satisfies NEITHER clause -- correctly excluded', () => {
    const predicate = parseOrString('payload->>notification_sent.is.null,payload->>notification_sent.neq.true');
    expect(predicate({ payload: { notification_sent: true } })).toBe(false);
  });
});
