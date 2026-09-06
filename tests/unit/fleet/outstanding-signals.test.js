/**
 * SD-FDBK-INFRA-WORKER-VISIBLE-UNACKED-001 — worker-visible unacked-age surface.
 *
 * The thing this suite is really defending: a surface keyed on `read_at` LOOKS correct.
 * It returns rows, it has ages, it prints nicely — and it silently reports a
 * delivered-but-ignored signal as answered. On the session that motivated this SD, 2 of
 * 3 outstanding signals had read_at SET and acknowledged_at NULL, so the wrong predicate
 * would have reported 3 as 1 and declared the gap two-thirds closed. Every polarity below
 * exists because the wrong implementation passes a weaker version of the same test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const { fetchOutstandingSignals, formatOutstandingWarning, DEFAULT_LIST_CAP } =
  require(path.join(REPO, 'lib/fleet/outstanding-signals.cjs'));

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0);
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString();

/**
 * Supabase query-builder double that RECORDS the filters it was given, so the test can
 * assert the predicate rather than only the output. A double that accepted any filter
 * chain and returned canned rows would pass identically for a read_at-keyed
 * implementation — it would prove the shape of the result and nothing about the query.
 */
function sbDouble(rows, { count = null, error = null, writes = [], receiptRows = [] } = {}) {
  const calls = { eq: [], is: [], not: [], order: [], limit: [], from: [], select: [], in: [] };
  // QF-20260906-162 (count-truncation-diff-lint): the receipt-existence-check query now
  // chains an explicit .limit(20) after .in() (a literal, provable bound). Track whether
  // THIS chain traversal saw .in() so the shared .limit() resolves the right result —
  // the main query never calls .in(), so it is unaffected.
  let sawIn = false;
  const builder = {
    select(sel, o) { calls.select.push([sel, o]); return builder; },
    eq(col, val) { calls.eq.push([col, val]); return builder; },
    is(col, val) { calls.is.push([col, val]); return builder; },
    not(col, op, val) { calls.not.push([col, op, val]); return builder; },
    order(col, o) { calls.order.push([col, o]); return builder; },
    in(col, val) { calls.in.push([col, val]); sawIn = true; return builder; },
    limit(n) {
      calls.limit.push(n);
      if (sawIn) { sawIn = false; return Promise.resolve({ data: receiptRows, error: null }); }
      return Promise.resolve({ data: rows, error, count: count === null ? rows.length : count });
    },
    update(patch) { writes.push(['update', patch]); return builder; },
    insert(patch) { writes.push(['insert', patch]); return builder; },
  };
  return { client: { from(t) { calls.from.push(t); return builder; } }, calls, writes };
}

const row = (id, mins, { read = false, type = 'feedback' } = {}) => ({
  id, created_at: minsAgo(mins), read_at: read ? minsAgo(mins - 1) : null, payload: { signal_type: type },
});

describe('the predicate — acknowledged_at, never read_at', () => {
  it('queries acknowledged_at IS NULL, scoped by sender_session, restricted to signal_type', async () => {
    const { client, calls } = sbDouble([row('a', 40)]);
    await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });

    // QF-20260906-162: a non-empty result also triggers the RECEIVED existence-check query
    // (a second, separate hit on the same table) — every from() call here is still
    // session_coordination, just two of them now instead of one.
    expect(calls.from).toEqual(['session_coordination', 'session_coordination']);
    // THE ack predicate. A read_at-keyed implementation has .is('read_at', null) here and
    // would pass any assertion that only inspected the returned rows.
    expect(calls.is).toContainEqual(['acknowledged_at', null]);
    expect(calls.is.map((c) => c[0])).not.toContain('read_at');
    // sender_session, NOT from_session_id — the latter does not exist as a column.
    expect(calls.eq).toContainEqual(['sender_session', 'sess-1']);
    expect(calls.eq.map((c) => c[0])).not.toContain('from_session_id');
    expect(calls.not).toContainEqual(['payload->>signal_type', 'is', null]);
  });

  it('a DELIVERED-but-unacknowledged signal is reported, and says so', async () => {
    // 2 of 3 live outstanding signals had exactly this shape.
    const { client } = sbDouble([row('read-but-unacked', 45, { read: true })]);
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r.count).toBe(1);
    expect(r.signals[0].delivered).toBe(true);
  });

  it('an untouched signal is reported with delivered:false — both states, one surface', async () => {
    const { client } = sbDouble([row('neither', 20)]);
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r.signals[0].delivered).toBe(false);
  });

  it('ordering is OLDEST FIRST so the cap drops the NEWEST', async () => {
    const { client, calls } = sbDouble([row('a', 90)]);
    await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(calls.order).toContainEqual(['created_at', { ascending: true }]);
    // QF-20260906-162: the receipt-existence-check also calls .limit() (its own literal
    // bound, count-truncation-diff-lint) — the main query's cap is still the FIRST call.
    expect(calls.limit[0]).toBe(DEFAULT_LIST_CAP);
  });
});

describe('ages, totals and truncation honesty', () => {
  it('reports the age of the SIGNAL, across DIFFERENT ages in one run', async () => {
    // A single age is satisfied by any constant; two are not.
    const { client } = sbDouble([row('old', 35), row('new', 6)]);
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r.signals.map((s) => s.age_minutes)).toEqual([35, 6]);
    expect(r.oldest_age_minutes).toBe(35);
  });

  it('a truncated list states the TRUE total, so it can never read as complete', async () => {
    const shown = [row('1', 50), row('2', 40), row('3', 30), row('4', 20), row('5', 10)];
    const { client } = sbDouble(shown, { count: 40 }); // 40 outstanding, 5 returned
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r.shown).toBe(5);
    expect(r.count).toBe(40);
    expect(r.count).not.toBe(r.shown);
  });
});

describe('quiet when empty, quiet when it cannot answer', () => {
  // CORRECTED (adversarial post-merge review, PR #8356, WARNING finding): this used to assert a
  // bare `null` for "nothing outstanding", identical to what a genuine query ERROR also returns.
  // countUnreceiptedOverdue(null) reports 'unknown' unconditionally, which tripped the
  // unreceipted-signals-overdue gauge (SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001
  // FR-5(d)) on the HEALTHIEST possible fleet state. A genuinely empty result is now a real,
  // still-falsy-for-count object (count:0/signals:[]) so a caller CAN distinguish "verified zero"
  // from "unknown" while formatOutstandingWarning's own `!result.count` check still suppresses the
  // rendered line the same as before -- the "skim past a permanent 0-line" guarantee is unchanged.
  it('nothing outstanding returns a real, empty-shaped result — never bare null (null means genuinely unknown)', async () => {
    const { client } = sbDouble([]);
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r).not.toBeNull();
    expect(r).toEqual({ count: 0, shown: 0, oldest_age_minutes: null, signals: [], received_check_reliable: true });
  });

  it('a query error FAILS QUIET, not closed', async () => {
    // Opposite posture from the worktree deletion guards, deliberately: a check-in that
    // failed because it could not compute a nudge would take down the only command that
    // drains coordinator messages, fleet-wide.
    const { client } = sbDouble([], { error: { message: 'boom' } });
    expect(await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW })).toBeNull();
  });

  it('a missing client or session id is quiet rather than throwing', async () => {
    expect(await fetchOutstandingSignals(null, 'sess-1')).toBeNull();
    const { client } = sbDouble([row('a', 10)]);
    expect(await fetchOutstandingSignals(client, null)).toBeNull();
  });
});

describe('QF-20260906-162: RECEIVED — a signal_receipt row exists', () => {
  it('reports received:true when a correlated signal_receipt row exists', async () => {
    const { client, calls } = sbDouble([row('a', 40)], {
      receiptRows: [{ payload: { kind: 'signal_receipt', correlation_id: 'a' } }],
    });
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r.signals[0].received).toBe(true);
    expect(calls.in).toContainEqual(['payload->>correlation_id', ['a']]);
  });

  it('reports received:false when no correlated receipt exists', async () => {
    const { client } = sbDouble([row('a', 40)], { receiptRows: [] });
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r.signals[0].received).toBe(false);
  });

  it('a receipt for a DIFFERENT row never marks this one received (correlation is per-row)', async () => {
    const { client } = sbDouble([row('a', 40)], {
      receiptRows: [{ payload: { kind: 'signal_receipt', correlation_id: 'unrelated-row' } }],
    });
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r.signals[0].received).toBe(false);
  });

  it('the receipt-existence-check erroring fails soft — the surface still returns, received:false', async () => {
    // A purpose-built double: the MAIN query (terminates on .limit()) resolves normally; the
    // SEPARATE receipt-check query (terminates on .in()) rejects. This isolates the specific
    // try/catch around the receipt lookup in _fetchOutstanding from the function's OUTER
    // fail-quiet catch — the receipt check failing must not take the whole surface down with
    // it (an existence-check failure is strictly less severe than the main query failing).
    let call = 0;
    const client = {
      from() {
        call++;
        if (call === 1) {
          // main query
          return {
            select: () => ({
              eq: () => ({
                not: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [{ id: 'a', created_at: minsAgo(40), read_at: null, payload: { signal_type: 'feedback' } }], error: null, count: 1 }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // receipt-existence-check query — the failure surfaces at .limit() (QF-20260906-162
        // added an explicit literal bound after .in() for count-truncation-diff-lint).
        return { select: () => ({ eq: () => ({ in: () => ({ limit: () => Promise.reject(new Error('boom')) }) }) }) };
      },
    };
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r).not.toBeNull();
    expect(r.signals[0].received).toBe(false);
  });

  // WARNING (adversarial post-merge review, PR #8356): supabase-js/postgrest-js return a query
  // failure as `{data: null, error}` — they do NOT throw/reject. The test above only covers the
  // reject() path; this covers the resolve-with-error path, which the prior code's
  // `const { data: receipts } = await ...` silently discarded, leaving received_check_reliable
  // true on a genuine failure (a false-pass — countUnreceiptedOverdue would then trust a hard
  // number instead of reporting 'unknown').
  it('the receipt-existence-check RESOLVING with {data:null,error} (not throwing) is still treated as unreliable', async () => {
    let call = 0;
    const client = {
      from() {
        call++;
        if (call === 1) {
          return {
            select: () => ({
              eq: () => ({
                not: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [{ id: 'a', created_at: minsAgo(40), read_at: null, payload: { signal_type: 'feedback' } }], error: null, count: 1 }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ in: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }) }) }) }) };
      },
    };
    const r = await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    expect(r).not.toBeNull();
    expect(r.received_check_reliable).toBe(false);
    expect(r.signals[0].received).toBe(false);
  });
});

describe('READ-ONLY — the surface must not drain what it reports', () => {
  it('performs no update/insert on the rows it reports', async () => {
    const writes = [];
    const { client } = sbDouble([row('read-but-unacked', 45, { read: true }), row('neither', 20)], { writes });
    await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW });
    // Both states present, so this cannot pass by only exercising rows that were never
    // going to be touched. /checkin is the fleet's ONLY ack-stamping path — a surface
    // that acknowledged its own report would make the answered-rate metric improve
    // precisely because nobody answered.
    expect(writes).toEqual([]);
  });
});

describe('the warning line', () => {
  it('stays silent below the alert age', () => {
    expect(formatOutstandingWarning({ count: 2, shown: 2, oldest_age_minutes: 6 })).toBeNull();
  });

  it('fires above it, names the count and the oldest age, and flags truncation', () => {
    const w = formatOutstandingWarning({ count: 40, shown: 5, oldest_age_minutes: 50 });
    expect(w).toContain('40');
    expect(w).toContain('50m');
    expect(w).toMatch(/showing oldest 5/);
  });

  it('is silent when there is nothing outstanding', () => {
    expect(formatOutstandingWarning(null)).toBeNull();
    expect(formatOutstandingWarning({ count: 0, shown: 0, oldest_age_minutes: 0 })).toBeNull();
  });
});

describe('WIRING — the worker can actually see it', () => {
  // FR-1 without FR-2 is a function nobody calls. Earlier in this same session a sibling
  // SD shipped detectStrandedWorker fully unit-tested and imported by nothing; every
  // behaviour test passed and the detector never ran. Behaviour tests prove a thing
  // BEHAVES; only the call site proves it is ASKED. Three separate assertions, because an
  // unused import and an uninvoked call both survive a naive "is it referenced" check.
  const step = readFileSync(path.join(REPO, 'lib/checkin/steps/roll-call.cjs'), 'utf8');
  const checkin = readFileSync(path.join(REPO, 'scripts/worker-checkin.cjs'), 'utf8');

  it('is required by the check-in and exposed through the DI helper bag', () => {
    expect(checkin).toMatch(/require\('\.\.\/lib\/fleet\/outstanding-signals\.cjs'\)/);
    const helpers = checkin.slice(checkin.indexOf('const CHECKIN_HELPERS'));
    expect(helpers.slice(0, 2000)).toContain('fetchOutstandingSignals');
    expect(helpers.slice(0, 2000)).toContain('formatOutstandingWarning');
  });

  it('is destructured AND INVOKED by the roll-call step', () => {
    expect(step).toMatch(/fetchOutstandingSignals/);
    expect(step).toMatch(/await fetchOutstandingSignals\(sb, sessionId\)/);
  });

  it('its result is attached to ctx.base, which spreads into every return path', () => {
    // ctx.base is the shared object every return path spreads, so attaching here is what
    // makes a busy claim-holder AND an idle worker both see the surface.
    expect(step).toMatch(/ctx\.base\.outstanding_signals\s*=/);
    expect(step).toMatch(/ctx\.base\.outstanding_signals_warning\s*=/);
  });

  // CORRECTED (adversarial post-merge review, PR #8356): this used to regex-match
  // `if (outstanding)` alone, which stayed green even after fetchOutstandingSignals started
  // returning a real (truthy) empty-shaped object for "genuinely zero outstanding" — the
  // structural check kept passing while the guarantee it names ("an empty result adds no key")
  // was silently broken. A source-text match can prove wiring exists; it cannot prove the
  // condition is still CORRECT after an upstream contract change. See the real behavioral test
  // below (roll-call step actually run) for that half.
  it('is attached conditionally on actual content, not bare truthiness (source-text half)', () => {
    expect(step).toMatch(/if \(outstanding && outstanding\.count/);
  });
});

describe('BEHAVIOR — the roll-call step actually suppresses the empty-shaped result', () => {
  const rollCallStep = require(path.join(REPO, 'lib/checkin/steps/roll-call.cjs'));

  async function runStep({ outstanding, formatOutstandingWarningReturn = null }) {
    const ctx = {
      sb: {}, sessionId: 'sess-1', coordinatorId: 'coord-1', sessionRole: 'worker', callsign: 'X', mySd: null, sessionMetadata: null,
      helpers: {
        registerRollCall: async () => ({ id: 'rc-1' }),
        surfaceCoordinatorMessages: async () => [],
        fetchOutstandingSignals: async () => outstanding,
        formatOutstandingWarning: () => formatOutstandingWarningReturn,
      },
    };
    await rollCallStep.run(ctx);
    return ctx;
  }

  it('a genuinely empty (real, truthy) result from fetchOutstandingSignals attaches NO key to ctx.base', async () => {
    const ctx = await runStep({ outstanding: { count: 0, shown: 0, oldest_age_minutes: null, signals: [], received_check_reliable: true } });
    expect(ctx.base.outstanding_signals).toBeUndefined();
    expect(ctx.base.outstanding_signals_warning).toBeUndefined();
  });

  it('null (a genuine fetch failure) also attaches no key', async () => {
    const ctx = await runStep({ outstanding: null });
    expect(ctx.base.outstanding_signals).toBeUndefined();
  });

  it('a genuinely non-empty result DOES attach the key', async () => {
    const real = { count: 1, shown: 1, oldest_age_minutes: 45, signals: [{ id: 'a' }], received_check_reliable: true };
    const ctx = await runStep({ outstanding: real, formatOutstandingWarningReturn: '⚠ 1 signal(s) you sent are still UNANSWERED' });
    expect(ctx.base.outstanding_signals).toBe(real);
    expect(ctx.base.outstanding_signals_warning).toBe('⚠ 1 signal(s) you sent are still UNANSWERED');
  });
});
