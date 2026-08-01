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
function sbDouble(rows, { count = null, error = null, writes = [] } = {}) {
  const calls = { eq: [], is: [], not: [], order: [], limit: [], from: [], select: [] };
  const builder = {
    select(sel, o) { calls.select.push([sel, o]); return builder; },
    eq(col, val) { calls.eq.push([col, val]); return builder; },
    is(col, val) { calls.is.push([col, val]); return builder; },
    not(col, op, val) { calls.not.push([col, op, val]); return builder; },
    order(col, o) { calls.order.push([col, o]); return builder; },
    limit(n) { calls.limit.push(n); return Promise.resolve({ data: rows, error, count: count === null ? rows.length : count }); },
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

    expect(calls.from).toEqual(['session_coordination']);
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
    expect(calls.limit).toEqual([DEFAULT_LIST_CAP]);
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
  it('nothing outstanding returns null — absence, not an empty stub', async () => {
    // Asserted as absence: this runs once per loop pass per seat, and a permanent
    // "0 outstanding" line is one workers learn to skim past.
    const { client } = sbDouble([]);
    expect(await fetchOutstandingSignals(client, 'sess-1', { nowMs: NOW })).toBeNull();
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

  it('is attached CONDITIONALLY, so an empty result adds no key', () => {
    expect(step).toMatch(/if \(outstanding\)/);
  });
});
